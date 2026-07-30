import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { DriveMembershipRepository, VolumeMembership } from 'src/extensions/files/drive-membership.repository';
import { PRIVATE_VOLUME_ID, VolumeAccess } from 'src/extensions/files/volume';
import { VolumeAccessService, VolumeNeed } from 'src/extensions/files/volume-access.service';
import { VolumeMembershipService } from 'src/extensions/files/volume-membership.service';
import { VolumeRegistry } from 'src/extensions/files/volume.registry';
import { UserRepository } from 'src/repositories/user.repository';

const OWNER = '5f2b9c4e-0000-4000-8000-000000000001';
const STRANGER = '5f2b9c4e-0000-4000-8000-000000000002';
const SHARED = 'shared:family';

/** Membership in memory, with the writes an administrator makes. */
class FakeMembership {
  rows: VolumeMembership[] = [];

  asRepository(): DriveMembershipRepository {
    return this as unknown as DriveMembershipRepository;
  }

  get(volumeKey: string, userId: string): Promise<VolumeMembership | undefined> {
    return Promise.resolve(this.rows.find((row) => row.volumeKey === volumeKey && row.userId === userId));
  }

  listForUser(userId: string): Promise<VolumeMembership[]> {
    return Promise.resolve(this.rows.filter((row) => row.userId === userId));
  }

  listForVolume(volumeKey: string) {
    return Promise.resolve(
      this.rows
        .filter((row) => row.volumeKey === volumeKey)
        .map((row) => ({ ...row, email: `${row.userId}@immich.test`, name: 'Someone' })),
    );
  }

  upsert(membership: VolumeMembership): Promise<void> {
    const existing = this.rows.findIndex(
      (row) => row.volumeKey === membership.volumeKey && row.userId === membership.userId,
    );
    if (existing === -1) {
      this.rows.push(membership);
    } else {
      this.rows[existing] = membership;
    }

    return Promise.resolve();
  }

  remove(volumeKey: string, userId: string): Promise<boolean> {
    const before = this.rows.length;
    this.rows = this.rows.filter((row) => !(row.volumeKey === volumeKey && row.userId === userId));
    return Promise.resolve(this.rows.length < before);
  }
}

describe(VolumeAccessService.name, () => {
  let storageRoot: string;
  let membership: FakeMembership;
  let sut: VolumeAccessService;

  beforeEach(async () => {
    storageRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'immich-drive-access-'));
    membership = new FakeMembership();
    sut = new VolumeAccessService(
      new VolumeRegistry({ storageRoot, sharedSpace: 'family' }),
      membership.asRepository(),
    );
  });

  afterEach(async () => {
    await fs.rm(storageRoot, { recursive: true, force: true });
  });

  describe('private volumes', () => {
    it('belong to their owner with no membership row', async () => {
      const target = await sut.forUser(OWNER, PRIVATE_VOLUME_ID, VolumeNeed.Write);

      expect(target.access).toBe(VolumeAccess.ReadWrite);
      expect(membership.rows).toEqual([]);
    });

    it('are listed for everyone, because the path is derived from the caller', async () => {
      const volumes = await sut.listVolumes(STRANGER);

      expect(volumes.map((volume) => volume.id)).toEqual([PRIVATE_VOLUME_ID]);
    });

    /** The safety here is structural rather than a check: one owner cannot name another's path. */
    it('resolve to different roots for different owners', async () => {
      const mine = await sut.forUser(OWNER, PRIVATE_VOLUME_ID, VolumeNeed.Read);
      const yours = await sut.forUser(STRANGER, PRIVATE_VOLUME_ID, VolumeNeed.Read);

      expect(mine.volume.filesPath).not.toBe(yours.volume.filesPath);
    });
  });

  describe('shared volumes', () => {
    it('are not addressable by a non-member, and are reported as missing rather than forbidden', async () => {
      await expect(sut.forUser(STRANGER, SHARED, VolumeNeed.Read)).rejects.toMatchObject({
        code: 'unknown-volume',
      });
    });

    it('are not even listed for a non-member', async () => {
      const volumes = await sut.listVolumes(STRANGER);

      expect(volumes.map((volume) => volume.id)).not.toContain(SHARED);
    });

    it('are listed for a member', async () => {
      await membership.upsert({ volumeKey: SHARED, userId: OWNER, access: VolumeAccess.ReadOnly });

      const volumes = await sut.listVolumes(OWNER);

      expect(volumes.map((volume) => volume.id)).toEqual([PRIVATE_VOLUME_ID, SHARED]);
    });

    it('let a read-only member read', async () => {
      await membership.upsert({ volumeKey: SHARED, userId: OWNER, access: VolumeAccess.ReadOnly });

      const target = await sut.forUser(OWNER, SHARED, VolumeNeed.Read);

      expect(target.access).toBe(VolumeAccess.ReadOnly);
    });

    /** Refused rather than reported missing: they can see the volume, so pretending it is gone is worse. */
    it('refuse a read-only member that tries to write', async () => {
      await membership.upsert({ volumeKey: SHARED, userId: OWNER, access: VolumeAccess.ReadOnly });

      await expect(sut.forUser(OWNER, SHARED, VolumeNeed.Write)).rejects.toMatchObject({
        code: 'read-only-volume',
      });
    });

    it('let a read-write member write', async () => {
      await membership.upsert({ volumeKey: SHARED, userId: OWNER, access: VolumeAccess.ReadWrite });

      const target = await sut.forUser(OWNER, SHARED, VolumeNeed.Write);

      expect(target.access).toBe(VolumeAccess.ReadWrite);
    });

    it('stop being addressable the moment membership is removed', async () => {
      await membership.upsert({ volumeKey: SHARED, userId: OWNER, access: VolumeAccess.ReadWrite });
      await sut.forUser(OWNER, SHARED, VolumeNeed.Read);

      await membership.remove(SHARED, OWNER);

      await expect(sut.forUser(OWNER, SHARED, VolumeNeed.Read)).rejects.toMatchObject({ code: 'unknown-volume' });
    });

    /** The failure mode ADR 0012 exists to rule out: an empty table must not read as "everyone". */
    it('are reachable by nobody when the member list is empty', async () => {
      for (const userId of [OWNER, STRANGER]) {
        await expect(sut.forUser(userId, SHARED, VolumeNeed.Read)).rejects.toMatchObject({
          code: 'unknown-volume',
        });
        await expect(sut.listVolumes(userId)).resolves.toEqual([expect.objectContaining({ id: PRIVATE_VOLUME_ID })]);
      }
    });

    it('refuses a space that is not configured, member or not', async () => {
      await membership.upsert({ volumeKey: 'shared:other', userId: OWNER, access: VolumeAccess.ReadWrite });

      await expect(sut.forUser(OWNER, 'shared:other', VolumeNeed.Read)).rejects.toMatchObject({
        code: 'unknown-volume',
      });
    });
  });

  describe('system work', () => {
    it('reaches a shared volume nobody is a member of', async () => {
      const target = await sut.forSystem(OWNER, SHARED);

      expect(target.access).toBe(VolumeAccess.ReadWrite);
      expect(membership.rows).toEqual([]);
    });

    it('describes every volume regardless of membership', () => {
      expect(sut.describeAllForSystem(OWNER).map((volume) => volume.id)).toEqual([PRIVATE_VOLUME_ID, SHARED]);
    });
  });

  it('reports that file storage is not enabled when the domain is unconfigured', async () => {
    const disabled = new VolumeAccessService(null, membership.asRepository());

    await expect(disabled.listVolumes(OWNER)).rejects.toThrow('Immich Drive file storage is not enabled');
    await expect(disabled.forUser(OWNER, PRIVATE_VOLUME_ID, VolumeNeed.Read)).rejects.toThrow(
      'Immich Drive file storage is not enabled',
    );
  });
});

describe(VolumeMembershipService.name, () => {
  let storageRoot: string;
  let membership: FakeMembership;
  let sut: VolumeMembershipService;
  let users: { get: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    storageRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'immich-drive-members-'));
    membership = new FakeMembership();
    users = { get: vi.fn().mockResolvedValue({ id: OWNER, email: 'owner@immich.test' }) };
    sut = new VolumeMembershipService(
      new VolumeAccessService(new VolumeRegistry({ storageRoot, sharedSpace: 'family' }), membership.asRepository()),
      membership.asRepository(),
      users as unknown as UserRepository,
    );
  });

  afterEach(async () => {
    await fs.rm(storageRoot, { recursive: true, force: true });
  });

  it('adds a member with the access it was given', async () => {
    const member = await sut.addMember(SHARED, OWNER, VolumeAccess.ReadOnly);

    expect(member).toMatchObject({ userId: OWNER, access: VolumeAccess.ReadOnly });
    expect(membership.rows).toEqual([{ volumeKey: SHARED, userId: OWNER, access: VolumeAccess.ReadOnly }]);
  });

  it('changes the access of someone who is already a member rather than failing', async () => {
    await sut.addMember(SHARED, OWNER, VolumeAccess.ReadOnly);

    const member = await sut.addMember(SHARED, OWNER, VolumeAccess.ReadWrite);

    expect(member.access).toBe(VolumeAccess.ReadWrite);
    expect(membership.rows).toHaveLength(1);
  });

  it('refuses a user that does not exist', async () => {
    users.get.mockResolvedValue(undefined);

    await expect(sut.addMember(SHARED, STRANGER, VolumeAccess.ReadWrite)).rejects.toThrow('User not found');
    expect(membership.rows).toEqual([]);
  });

  it('refuses a space that is not configured', async () => {
    await expect(sut.addMember('shared:other', OWNER, VolumeAccess.ReadWrite)).rejects.toThrow();
    expect(membership.rows).toEqual([]);
  });

  /** A private volume has one owner derived from its path; members there would be a contradiction. */
  it('refuses a private volume', async () => {
    await expect(sut.addMember(PRIVATE_VOLUME_ID, OWNER, VolumeAccess.ReadWrite)).rejects.toThrow(
      'A private volume has one owner and no members',
    );
    await expect(sut.listMembers(PRIVATE_VOLUME_ID)).rejects.toThrow();
  });

  it('lists members with the person behind the identifier', async () => {
    await sut.addMember(SHARED, OWNER, VolumeAccess.ReadWrite);

    await expect(sut.listMembers(SHARED)).resolves.toEqual([
      expect.objectContaining({ userId: OWNER, email: `${OWNER}@immich.test`, access: VolumeAccess.ReadWrite }),
    ]);
  });

  it('removes a member', async () => {
    await sut.addMember(SHARED, OWNER, VolumeAccess.ReadWrite);

    await sut.removeMember(SHARED, OWNER);

    expect(membership.rows).toEqual([]);
  });

  it('reports removing someone who was never a member', async () => {
    await expect(sut.removeMember(SHARED, STRANGER)).rejects.toThrow('Volume member not found');
  });
});
