import { Reflector } from '@nestjs/core';
import { DatabaseLock, JobName, JobStatus, MetadataKey, QueueName } from 'src/enum';
import { DriveJobService } from 'src/extensions/files/drive-job.service';
import { DriveConfig } from 'src/extensions/files/files.config';
import { DriveVolumeState } from 'src/extensions/files/index-state';
import { ReconciliationService } from 'src/extensions/files/reconciliation.service';
import { PRIVATE_VOLUME_ID, VolumeAccess, VolumeKind } from 'src/extensions/files/volume';
import { ReconcileReport } from 'src/extensions/files/volume-health';
import { VolumeRegistry } from 'src/extensions/files/volume.registry';
import { CronRepository } from 'src/repositories/cron.repository';
import { DatabaseRepository } from 'src/repositories/database.repository';
import { JobRepository } from 'src/repositories/job.repository';
import { LoggingRepository } from 'src/repositories/logging.repository';
import { UserRepository } from 'src/repositories/user.repository';

const OWNER = '5f2b9c4e-0000-4000-8000-000000000001';
const OTHER_OWNER = '5f2b9c4e-0000-4000-8000-000000000002';

const volume = (id: string) => ({
  id,
  name: id,
  kind: id === PRIVATE_VOLUME_ID ? VolumeKind.Private : VolumeKind.Shared,
  access: VolumeAccess.ReadWrite,
  rootPath: `/data/${id}`,
  filesPath: `/data/${id}/files`,
  trashPath: `/data/${id}/.trash`,
  tempPath: `/data/${id}/.tmp`,
});

const report = (overrides: Partial<ReconcileReport> = {}): ReconcileReport => ({
  volumeId: PRIVATE_VOLUME_ID,
  state: DriveVolumeState.Healthy,
  reason: null,
  completed: true,
  directories: 3,
  added: 0,
  conflicted: 0,
  missing: 0,
  recovered: 0,
  resumedFrom: null,
  stoppedAt: null,
  trash: null,
  ...overrides,
});

type DriveSettings = Omit<Extract<DriveConfig, { enabled: true }>, 'enabled'>;

const setup = (config: Partial<DriveSettings> & { enabled?: boolean } = {}) => {
  const { enabled = true, ...rest } = config;
  const registry = {
    describeVolumes: vi.fn().mockImplementation(() => [volume(PRIVATE_VOLUME_ID)]),
  };
  const reconciliation = { reconcileVolume: vi.fn().mockResolvedValue(report()) };
  const users = { getList: vi.fn().mockResolvedValue([{ id: OWNER }]) };
  const jobs = { queue: vi.fn().mockResolvedValue(undefined), queueAll: vi.fn().mockResolvedValue(undefined) };
  const crons = { create: vi.fn(), update: vi.fn() };
  const database = { tryLock: vi.fn().mockResolvedValue(true) };
  const logger = { setContext: vi.fn(), log: vi.fn(), warn: vi.fn() };

  const sut = new DriveJobService(
    enabled ? { enabled: true, root: '/data', ...rest } : { enabled: false },
    registry as unknown as VolumeRegistry,
    reconciliation as unknown as ReconciliationService,
    users as unknown as UserRepository,
    jobs as unknown as JobRepository,
    crons as unknown as CronRepository,
    database as unknown as DatabaseRepository,
    logger as unknown as LoggingRepository,
  );

  return { sut, registry, reconciliation, users, jobs, crons, database, logger };
};

describe(DriveJobService.name, () => {
  describe('scheduling', () => {
    it('schedules nothing when no expression is configured', async () => {
      const { sut, crons, database } = setup();

      await sut.onAppBootstrap();

      expect(crons.create).not.toHaveBeenCalled();
      // The lock is not even taken: a deployment with no schedule should not hold one.
      expect(database.tryLock).not.toHaveBeenCalled();
    });

    it('schedules nothing when the file domain is disabled', async () => {
      const { sut, crons } = setup({ enabled: false });

      await sut.onAppBootstrap();

      expect(crons.create).not.toHaveBeenCalled();
    });

    it('registers the schedule when an expression is configured', async () => {
      const { sut, crons, database } = setup({ reconcileCron: '0 4 * * *' });

      await sut.onAppBootstrap();

      expect(database.tryLock).toHaveBeenCalledWith(DatabaseLock.DriveReconciliation);
      expect(crons.create).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'driveReconcile', expression: '0 4 * * *', start: true }),
      );
    });

    it('leaves the schedule to whichever replica holds the lock', async () => {
      const { sut, crons, database, logger } = setup({ reconcileCron: '0 4 * * *' });
      database.tryLock.mockResolvedValue(false);

      await sut.onAppBootstrap();

      expect(crons.create).not.toHaveBeenCalled();
      expect(logger.log).toHaveBeenCalledWith(expect.stringContaining('Another replica'));
    });

    it('queues the enumerating job when the schedule fires', async () => {
      const { sut, crons, jobs } = setup({ reconcileCron: '0 4 * * *' });
      await sut.onAppBootstrap();

      const [{ onTick }] = crons.create.mock.calls[0];
      onTick();

      expect(jobs.queue).toHaveBeenCalledWith({ name: JobName.DriveReconcileQueueAll, data: {} });
    });
  });

  describe('queueing every volume', () => {
    it('queues one job per private volume', async () => {
      const { sut, users, jobs } = setup();
      users.getList.mockResolvedValue([{ id: OWNER }, { id: OTHER_OWNER }]);

      await expect(sut.handleQueueAllVolumes()).resolves.toBe(JobStatus.Success);

      expect(jobs.queueAll).toHaveBeenCalledWith([
        { name: JobName.DriveReconcileVolume, data: { ownerId: OWNER, volumeId: PRIVATE_VOLUME_ID } },
        { name: JobName.DriveReconcileVolume, data: { ownerId: OTHER_OWNER, volumeId: PRIVATE_VOLUME_ID } },
      ]);
    });

    /** The shared volume belongs to the deployment, so reconciling it once per user is the same work twice. */
    it('queues the shared volume exactly once, however many people can see it', async () => {
      const { sut, users, registry, jobs } = setup({ sharedSpace: 'family' });
      users.getList.mockResolvedValue([{ id: OWNER }, { id: OTHER_OWNER }]);
      registry.describeVolumes.mockImplementation(() => [volume(PRIVATE_VOLUME_ID), volume('shared:family')]);

      await sut.handleQueueAllVolumes();

      const [queued] = jobs.queueAll.mock.calls[0];
      expect(queued.map((item: { data: { ownerId: string; volumeId: string } }) => item.data)).toEqual([
        { ownerId: OWNER, volumeId: PRIVATE_VOLUME_ID },
        { ownerId: OWNER, volumeId: 'shared:family' },
        { ownerId: OTHER_OWNER, volumeId: PRIVATE_VOLUME_ID },
      ]);
    });

    it('queues nothing when the file domain is disabled', async () => {
      const { sut, jobs } = setup({ enabled: false });

      await expect(sut.handleQueueAllVolumes()).resolves.toBe(JobStatus.Skipped);

      expect(jobs.queueAll).not.toHaveBeenCalled();
    });

    it('queues nothing when there are no users', async () => {
      const { sut, users, jobs } = setup();
      users.getList.mockResolvedValue([]);

      await expect(sut.handleQueueAllVolumes()).resolves.toBe(JobStatus.Skipped);

      expect(jobs.queueAll).not.toHaveBeenCalled();
    });

    it('never asks for deleted users', async () => {
      const { sut, users } = setup();

      await sut.handleQueueAllVolumes();

      expect(users.getList).toHaveBeenCalledWith({ withDeleted: false });
    });
  });

  describe('reconciling one volume', () => {
    it('reports a completed pass and queues nothing further', async () => {
      const { sut, jobs, reconciliation } = setup();

      await expect(sut.handleReconcileVolume({ ownerId: OWNER, volumeId: PRIVATE_VOLUME_ID })).resolves.toBe(
        JobStatus.Success,
      );

      expect(reconciliation.reconcileVolume).toHaveBeenCalledWith(OWNER, PRIVATE_VOLUME_ID);
      expect(jobs.queue).not.toHaveBeenCalled();
    });

    /** A mount that is gone comes back on a human's timescale, not a queue's. */
    it('drops an unhealthy volume instead of retrying it in a loop', async () => {
      const { sut, jobs, reconciliation, logger } = setup();
      reconciliation.reconcileVolume.mockResolvedValue(
        report({ state: DriveVolumeState.Unhealthy, reason: 'identity-changed' as never, completed: false }),
      );

      await expect(sut.handleReconcileVolume({ ownerId: OWNER, volumeId: PRIVATE_VOLUME_ID })).resolves.toBe(
        JobStatus.Skipped,
      );

      expect(jobs.queue).not.toHaveBeenCalled();
      expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('identity-changed'));
    });

    it('queues the next pass when a bounded pass stopped part-way', async () => {
      const { sut, jobs, reconciliation } = setup();
      reconciliation.reconcileVolume.mockResolvedValue(report({ completed: false, stoppedAt: '/documents' }));

      await expect(sut.handleReconcileVolume({ ownerId: OWNER, volumeId: PRIVATE_VOLUME_ID })).resolves.toBe(
        JobStatus.Success,
      );

      expect(jobs.queue).toHaveBeenCalledWith({
        name: JobName.DriveReconcileVolume,
        data: { ownerId: OWNER, volumeId: PRIVATE_VOLUME_ID, attempt: 2, resumedFrom: '/documents' },
      });
    });

    /** Otherwise a checkpoint that stops moving becomes a queue that never empties. */
    it('stops when a pass makes no progress past the checkpoint it resumed from', async () => {
      const { sut, jobs, reconciliation, logger } = setup();
      reconciliation.reconcileVolume.mockResolvedValue(report({ completed: false, stoppedAt: '/documents' }));

      await expect(
        sut.handleReconcileVolume({
          ownerId: OWNER,
          volumeId: PRIVATE_VOLUME_ID,
          attempt: 2,
          resumedFrom: '/documents',
        }),
      ).resolves.toBe(JobStatus.Failed);

      expect(jobs.queue).not.toHaveBeenCalled();
      expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('no progress'));
    });

    it('stops when an incomplete pass reports no checkpoint at all', async () => {
      const { sut, jobs, reconciliation } = setup();
      reconciliation.reconcileVolume.mockResolvedValue(report({ completed: false, stoppedAt: null }));

      await expect(sut.handleReconcileVolume({ ownerId: OWNER, volumeId: PRIVATE_VOLUME_ID })).resolves.toBe(
        JobStatus.Failed,
      );

      expect(jobs.queue).not.toHaveBeenCalled();
    });

    it('stops after the attempt backstop, even while progress continues', async () => {
      const { sut, jobs, reconciliation, logger } = setup();
      reconciliation.reconcileVolume.mockResolvedValue(report({ completed: false, stoppedAt: '/late' }));

      await expect(
        sut.handleReconcileVolume({
          ownerId: OWNER,
          volumeId: PRIVATE_VOLUME_ID,
          attempt: 1000,
          resumedFrom: '/early',
        }),
      ).resolves.toBe(JobStatus.Failed);

      expect(jobs.queue).not.toHaveBeenCalled();
      expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('1000 passes'));
    });

    it('does nothing when the file domain is disabled', async () => {
      const { sut, reconciliation } = setup({ enabled: false });

      await expect(sut.handleReconcileVolume({ ownerId: OWNER, volumeId: PRIVATE_VOLUME_ID })).resolves.toBe(
        JobStatus.Skipped,
      );

      expect(reconciliation.reconcileVolume).not.toHaveBeenCalled();
    });
  });

  it('runs both jobs on an existing queue rather than introducing one', () => {
    // Reading the decorators rather than trusting the comment: a new QueueName would drag in the
    // exhaustive maps in config.ts, the legacy queue DTO, the queue-all switch, and the admin Jobs panel.
    // Read through Nest's own reflector, which is exactly how `JobRepository.setup` discovers handlers.
    const reflector = new Reflector();
    const queues = [
      reflector.get(MetadataKey.JobConfig, DriveJobService.prototype.handleQueueAllVolumes),
      reflector.get(MetadataKey.JobConfig, DriveJobService.prototype.handleReconcileVolume),
    ];

    expect(queues).toEqual([
      { name: JobName.DriveReconcileQueueAll, queue: QueueName.BackgroundTask },
      { name: JobName.DriveReconcileVolume, queue: QueueName.BackgroundTask },
    ]);
  });
});
