import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { DriveMembershipRepository } from 'src/extensions/files/drive-membership.repository';
import { StorageAdapter } from 'src/extensions/files/storage.adapter';
import {
  PRIVATE_VOLUME_ID,
  Volume,
  VolumeAccess,
  VolumeError,
  VolumeErrorCode,
  VolumeKind,
  volumeKey,
} from 'src/extensions/files/volume';
import { VolumeRegistry } from 'src/extensions/files/volume.registry';

/** What an operation needs from a volume. */
export enum VolumeNeed {
  Read = 'read',
  Write = 'write',
}

export interface VolumeTarget {
  readonly volume: Volume;
  readonly adapter: StorageAdapter;
  /** What the caller was granted, which a read-only member's mutation is refused against. */
  readonly access: VolumeAccess;
}

/**
 * The single place that answers "may this caller do this to this volume?".
 *
 * Every file-domain entry point resolves access here, and the storage adapter is reachable **only**
 * through this service — `FileDomainService` no longer holds the registry at all. That is deliberate:
 * forgetting a permission check now requires adding a dependency, not merely forgetting a line.
 *
 * Three kinds of caller, from [ADR 0012](../../../../docs/adr/0012-shared-volume-membership.md):
 *
 * - the **owner** of a private volume, whose right comes from the path being derived from their own
 *   identifier — there is no row to lose and nothing to check;
 * - a **member** of a shared volume, read-only or read-write, from `drive_volume_member`;
 * - **system work** — reconciliation and scheduled jobs — which acts for the deployment rather than for a
 *   person, and therefore needs no membership row.
 *
 * A non-member is told the volume does not exist, which is the same answer an unknown identifier gets: a
 * shared space should not be discoverable by people who are not in it. A member who may only read is told
 * plainly that they may not write, because "not found" about a volume they can see would be a worse
 * answer than "not allowed".
 */
@Injectable()
export class VolumeAccessService {
  constructor(
    @Inject(VolumeRegistry) private readonly volumes: VolumeRegistry | null,
    private readonly membership: DriveMembershipRepository,
  ) {}

  private requireVolumes(): VolumeRegistry {
    if (!this.volumes) {
      throw new BadRequestException('Immich Drive file storage is not enabled');
    }

    return this.volumes;
  }

  /**
   * Every volume the caller may actually address.
   *
   * A shared volume the caller is not a member of is left out entirely rather than listed and then
   * refused, so a stranger cannot learn that a household space exists.
   */
  async listVolumes(ownerId: string): Promise<Volume[]> {
    const registry = this.requireVolumes();
    const memberships = await this.membership.listForUser(ownerId);
    const keys = new Set(memberships.map((membership) => membership.volumeKey));

    const volumes: Volume[] = [];
    for (const volume of registry.describeVolumes(ownerId)) {
      if (volume.kind === VolumeKind.Private || keys.has(volumeKey(ownerId, volume))) {
        volumes.push(await registry.resolve(ownerId, volume.id));
      }
    }

    return volumes;
  }

  /** Resolves a volume for a user, refusing before anything is provisioned or opened. */
  async forUser(ownerId: string, volumeId: string, need: VolumeNeed): Promise<VolumeTarget> {
    const registry = this.requireVolumes();
    const described = registry.describeVolume(ownerId, volumeId);
    const access = await this.decide(ownerId, described, need);
    const { volume, adapter } = await registry.getTarget(ownerId, volumeId);

    return { volume, adapter, access };
  }

  /**
   * Resolves a volume for work the deployment does to itself.
   *
   * Named so that it reads as a decision rather than as a missing check. Reconciliation has to reach a
   * shared volume that nobody is a member of yet — an index that only covered volumes with members would
   * be an index with holes in it.
   */
  async forSystem(ownerId: string, volumeId: string): Promise<VolumeTarget> {
    const registry = this.requireVolumes();
    const { volume, adapter } = await registry.getTarget(ownerId, volumeId);

    return { volume, adapter, access: VolumeAccess.ReadWrite };
  }

  /** Describes a volume for system work without creating anything; see `VolumeRegistry.describeVolume`. */
  describeForSystem(ownerId: string, volumeId: string): Volume {
    return this.requireVolumes().describeVolume(ownerId, volumeId);
  }

  /** Every volume the deployment knows about for this owner, membership notwithstanding. */
  describeAllForSystem(ownerId: string): Volume[] {
    return this.requireVolumes().describeVolumes(ownerId);
  }

  /**
   * A read-only adapter for a volume that already exists, created without provisioning anything.
   *
   * Only a health check wants this: it has to describe a volume whose service directories may be missing
   * without repairing them on the way past. See `VolumeRegistry.inspectAdapter`.
   */
  async inspectForSystem(volume: Volume): Promise<StorageAdapter> {
    return this.requireVolumes().inspectAdapter(volume);
  }

  private async decide(ownerId: string, volume: Volume, need: VolumeNeed): Promise<VolumeAccess> {
    if (volume.id === PRIVATE_VOLUME_ID) {
      // The path was derived from this caller's own identifier, so there is nobody else it could belong
      // to. Recording a membership row for it would be state that could go missing and take a user's own
      // files with it.
      return VolumeAccess.ReadWrite;
    }

    const membership = await this.membership.get(volumeKey(ownerId, volume), ownerId);
    if (!membership) {
      throw new VolumeError(VolumeErrorCode.UnknownVolume, `Unknown volume "${volume.id}"`);
    }

    if (need === VolumeNeed.Write && membership.access === VolumeAccess.ReadOnly) {
      throw new VolumeError(VolumeErrorCode.ReadOnlyVolume, `Volume "${volume.id}" is read-only for this user`);
    }

    return membership.access;
  }
}
