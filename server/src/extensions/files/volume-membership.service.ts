import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { DriveMembershipRepository, VolumeMemberDetail } from 'src/extensions/files/drive-membership.repository';
import { PRIVATE_VOLUME_ID, VolumeAccess, volumeKey } from 'src/extensions/files/volume';
import { VolumeAccessService } from 'src/extensions/files/volume-access.service';
import { UserRepository } from 'src/repositories/user.repository';

/**
 * Administration of shared-volume membership.
 *
 * Separate from `VolumeAccessService` because the two answer different questions. That one decides whether
 * a request may proceed and is on the path of every file operation; this one changes who may make such
 * requests and is reached only by an administrator.
 *
 * A private volume has no membership by design — ownership there is derived from the path — so naming one
 * here is a mistake rather than an empty list, and is refused.
 */
@Injectable()
export class VolumeMembershipService {
  constructor(
    private readonly access: VolumeAccessService,
    private readonly membership: DriveMembershipRepository,
    private readonly userRepository: UserRepository,
  ) {}

  async listMembers(volumeId: string): Promise<VolumeMemberDetail[]> {
    return this.membership.listForVolume(this.sharedKey(volumeId));
  }

  async addMember(volumeId: string, userId: string, access: VolumeAccess): Promise<VolumeMemberDetail> {
    const key = this.sharedKey(volumeId);
    await this.requireUser(userId);

    await this.membership.upsert({ volumeKey: key, userId, access });

    const members = await this.membership.listForVolume(key);
    const member = members.find((candidate) => candidate.userId === userId);
    if (!member) {
      // The row was just written, so its absence would mean it was removed between the two statements.
      throw new NotFoundException('Volume member not found');
    }

    return member;
  }

  async removeMember(volumeId: string, userId: string): Promise<void> {
    const removed = await this.membership.remove(this.sharedKey(volumeId), userId);
    if (!removed) {
      throw new NotFoundException('Volume member not found');
    }
  }

  /**
   * The key of a shared volume, refusing anything else.
   *
   * Resolving through the access service rather than parsing the identifier here means an unconfigured
   * shared space is reported as an unknown volume, exactly as it is on every other endpoint — an
   * administrator cannot add members to a space that does not exist.
   *
   * The owner passed in is the volume's own identity trick: a shared volume's key does not depend on who
   * is asking, which is precisely why members have to be recorded.
   */
  private sharedKey(volumeId: string): string {
    if (volumeId === PRIVATE_VOLUME_ID) {
      throw new BadRequestException('A private volume has one owner and no members');
    }

    const volume = this.access.describeForSystem(SYSTEM_OWNER, volumeId);
    return volumeKey(SYSTEM_OWNER, volume);
  }

  private async requireUser(userId: string): Promise<void> {
    const user = await this.userRepository.get(userId, {});
    if (!user) {
      throw new NotFoundException('User not found');
    }
  }
}

/**
 * Stands in for "no particular user" when describing a shared volume.
 *
 * `describeVolume` validates the owner as a path segment because a private volume's path contains it; a
 * shared volume's path and key do not, so any valid segment produces the same answer. A fixed, obviously
 * fake value is clearer than passing an administrator's identifier and implying it matters.
 */
const SYSTEM_OWNER = 'system';
