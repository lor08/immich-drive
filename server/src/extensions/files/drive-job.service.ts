import { Inject, Injectable } from '@nestjs/common';
import { OnEvent, OnJob } from 'src/decorators';
import { DatabaseLock, ImmichWorker, JobName, JobStatus, QueueName } from 'src/enum';
import { DRIVE_CONFIG, DriveConfig } from 'src/extensions/files/files.config';
import { DriveVolumeState } from 'src/extensions/files/index-state';
import { ReconciliationService } from 'src/extensions/files/reconciliation.service';
import { PRIVATE_VOLUME_ID } from 'src/extensions/files/volume';
import { VolumeRegistry } from 'src/extensions/files/volume.registry';
import { CronRepository } from 'src/repositories/cron.repository';
import { DatabaseRepository } from 'src/repositories/database.repository';
import { JobRepository } from 'src/repositories/job.repository';
import { LoggingRepository } from 'src/repositories/logging.repository';
import { UserRepository } from 'src/repositories/user.repository';
import { IDriveReconcileJob } from 'src/types';
import { handlePromiseError } from 'src/utils/misc';

const CRON_NAME = 'driveReconcile';

/**
 * Backstop on the chain of jobs one volume can produce.
 *
 * A pass that stops at its directory limit queues the next one, so a large tree finishes across several
 * jobs. Progress is checked from the checkpoint, which is the real guard; this only bounds the pathological
 * case where a checkpoint keeps moving without the tree ever ending — a queue that never empties is worse
 * than a volume that stays partly unindexed and says so.
 */
const MAX_ATTEMPTS = 1000;

/**
 * Runs Drive reconciliation as scheduled background work.
 *
 * This is the one Drive class that lives in the upstream service scope, and the reason is narrow: the
 * schedule needs Immich's cron and job machinery, and the work has to be enumerated **per user**, which is
 * knowledge the file domain deliberately does not have. Everything about reconciliation itself stays in
 * `ReconciliationService`; this only decides when it runs and for which volumes.
 *
 * Nothing here is registered when the file domain is disabled, and nothing is scheduled unless an operator
 * set `IMMICH_DRIVE_RECONCILE_CRON`.
 */
@Injectable()
export class DriveJobService {
  constructor(
    @Inject(DRIVE_CONFIG) private readonly config: DriveConfig,
    @Inject(VolumeRegistry) private readonly volumes: VolumeRegistry | null,
    private readonly reconciliation: ReconciliationService,
    private readonly userRepository: UserRepository,
    private readonly jobRepository: JobRepository,
    private readonly cronRepository: CronRepository,
    private readonly databaseRepository: DatabaseRepository,
    private readonly logger: LoggingRepository,
  ) {
    this.logger.setContext(DriveJobService.name);
  }

  /**
   * Registers the schedule, in one worker, on one replica.
   *
   * The microservices worker is where background work belongs, and the advisory lock is what stops several
   * replicas each owning a cron for the same volumes — they would not corrupt anything, since a pass only
   * ever adds rows or changes their state, but they would multiply the filesystem reads by the number of
   * replicas for no gain. The lock is held for the life of the process, so a replica that dies releases it.
   */
  @OnEvent({ name: 'AppBootstrap', workers: [ImmichWorker.Microservices] })
  async onAppBootstrap() {
    if (!this.config.enabled || !this.config.reconcileCron) {
      return;
    }

    const expression = this.config.reconcileCron;
    if (!(await this.databaseRepository.tryLock(DatabaseLock.DriveReconciliation))) {
      this.logger.log('Another replica owns the Drive reconciliation schedule');
      return;
    }

    this.cronRepository.create({
      name: CRON_NAME,
      expression,
      onTick: () =>
        handlePromiseError(this.jobRepository.queue({ name: JobName.DriveReconcileQueueAll, data: {} }), this.logger),
      start: true,
    });

    this.logger.log(`Scheduled Drive reconciliation with "${expression}"`);
  }

  /**
   * Queues one pass per volume.
   *
   * The shared volume is queued **once**, not once per user: it belongs to the deployment, and the owner
   * identifier in the job is only how a volume is addressed. Reconciling it twelve times because twelve
   * people can see it would be twelve times the work for the same answer.
   */
  @OnJob({ name: JobName.DriveReconcileQueueAll, queue: QueueName.BackgroundTask })
  async handleQueueAllVolumes(): Promise<JobStatus> {
    if (!this.config.enabled || !this.volumes) {
      return JobStatus.Skipped;
    }

    const users = await this.userRepository.getList({ withDeleted: false });
    const jobs: IDriveReconcileJob[] = [];
    const sharedVolumeIds = new Set<string>();

    for (const { id: ownerId } of users) {
      for (const volume of this.volumes.describeVolumes(ownerId)) {
        if (volume.id === PRIVATE_VOLUME_ID) {
          jobs.push({ ownerId, volumeId: volume.id });
          continue;
        }

        if (!sharedVolumeIds.has(volume.id)) {
          sharedVolumeIds.add(volume.id);
          jobs.push({ ownerId, volumeId: volume.id });
        }
      }
    }

    if (jobs.length === 0) {
      return JobStatus.Skipped;
    }

    await this.jobRepository.queueAll(jobs.map((data) => ({ name: JobName.DriveReconcileVolume, data })));
    this.logger.log(`Queued reconciliation for ${jobs.length} volume(s)`);

    return JobStatus.Success;
  }

  /**
   * Runs one pass, and decides whether the volume needs another.
   *
   * Three outcomes, and the difference between them is the whole point of this method:
   *
   * - **unhealthy**: reported and dropped. Retrying immediately would produce the same refusal, and a
   *   volume whose mount is gone comes back on a human's timescale, not a queue's — the next scheduled run
   *   will pick it up.
   * - **incomplete, and the checkpoint moved**: queued again, so a tree larger than one pass finishes
   *   without any single job running unbounded.
   * - **incomplete, and the checkpoint did not move**: reported and dropped, because a job that re-queues
   *   itself while achieving nothing is a queue that never empties.
   */
  @OnJob({ name: JobName.DriveReconcileVolume, queue: QueueName.BackgroundTask })
  async handleReconcileVolume({ ownerId, volumeId, attempt = 1, resumedFrom }: IDriveReconcileJob): Promise<JobStatus> {
    if (!this.config.enabled) {
      return JobStatus.Skipped;
    }

    const report = await this.reconciliation.reconcileVolume(ownerId, volumeId);

    if (report.state === DriveVolumeState.Unhealthy) {
      this.logger.warn(`Skipped reconciliation of volume "${volumeId}": ${report.reason}`);
      return JobStatus.Skipped;
    }

    if (report.completed) {
      this.logger.log(
        `Reconciled volume "${volumeId}" in ${attempt} pass(es): ${report.added} added, ` +
          `${report.conflicted} conflicted, ${report.missing} missing, ${report.recovered} recovered`,
      );
      return JobStatus.Success;
    }

    if (report.stoppedAt === null || report.stoppedAt === resumedFrom) {
      this.logger.warn(
        `Stopped reconciling volume "${volumeId}": pass ${attempt} made no progress past ${report.stoppedAt}`,
      );
      return JobStatus.Failed;
    }

    if (attempt >= MAX_ATTEMPTS) {
      this.logger.warn(
        `Stopped reconciling volume "${volumeId}" after ${attempt} passes, last checkpoint ${report.stoppedAt}`,
      );
      return JobStatus.Failed;
    }

    await this.jobRepository.queue({
      name: JobName.DriveReconcileVolume,
      data: { ownerId, volumeId, attempt: attempt + 1, resumedFrom: report.stoppedAt },
    });

    return JobStatus.Success;
  }
}
