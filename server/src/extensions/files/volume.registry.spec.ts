import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { DRIVE_ROOT_VARIABLE, DRIVE_SHARED_SPACE_VARIABLE, readDriveConfig } from 'src/extensions/files/files.config';
import { PRIVATE_VOLUME_ID, VolumeAccess, VolumeErrorCode, VolumeKind } from 'src/extensions/files/volume';
import { VolumeRegistry } from 'src/extensions/files/volume.registry';

const OWNER = '5f2b9c4e-0000-4000-8000-000000000001';
const OTHER_OWNER = '5f2b9c4e-0000-4000-8000-000000000002';

const exists = async (target: string): Promise<boolean> => {
  try {
    await fs.stat(target);
    return true;
  } catch {
    return false;
  }
};

describe('shared space configuration', () => {
  it('omits the shared space when the variable is unset or blank', () => {
    expect(readDriveConfig({ [DRIVE_ROOT_VARIABLE]: '/data/drive' })).toEqual({
      enabled: true,
      root: '/data/drive',
    });
    expect(readDriveConfig({ [DRIVE_ROOT_VARIABLE]: '/data/drive', [DRIVE_SHARED_SPACE_VARIABLE]: ' ' })).toEqual({
      enabled: true,
      root: '/data/drive',
    });
  });

  it('accepts a valid shared space name', () => {
    expect(
      readDriveConfig({ [DRIVE_ROOT_VARIABLE]: '/data/drive', [DRIVE_SHARED_SPACE_VARIABLE]: ' family ' }),
    ).toEqual({ enabled: true, root: '/data/drive', sharedSpace: 'family' });
  });

  it.each(['../escape', 'with/separator', '.hidden', '..', 'null\0byte', 'with space'])(
    'rejects the shared space name %j',
    (name) => {
      expect(() =>
        readDriveConfig({ [DRIVE_ROOT_VARIABLE]: '/data/drive', [DRIVE_SHARED_SPACE_VARIABLE]: name }),
      ).toThrow(expect.objectContaining({ code: VolumeErrorCode.InvalidSpaceName }));
    },
  );
});

describe(VolumeRegistry.name, () => {
  let storageRoot: string;

  beforeEach(async () => {
    storageRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'immich-drive-volumes-'));
  });

  afterEach(async () => {
    await fs.rm(storageRoot, { recursive: true, force: true });
  });

  it('resolves a private volume and provisions its directories', async () => {
    const registry = new VolumeRegistry({ storageRoot });

    const volume = await registry.resolve(OWNER, PRIVATE_VOLUME_ID);

    expect(volume).toMatchObject({
      id: PRIVATE_VOLUME_ID,
      kind: VolumeKind.Private,
      access: VolumeAccess.ReadWrite,
      filesPath: path.join(storageRoot, 'users', OWNER, 'files'),
      trashPath: path.join(storageRoot, 'users', OWNER, '.trash'),
      tempPath: path.join(storageRoot, 'users', OWNER, '.tmp'),
    });

    await expect(exists(volume.filesPath)).resolves.toBe(true);
    await expect(exists(volume.trashPath)).resolves.toBe(true);
    await expect(exists(volume.tempPath)).resolves.toBe(true);
  });

  it('provisions once and stays correct under concurrent resolution', async () => {
    const registry = new VolumeRegistry({ storageRoot });

    const volumes = await Promise.all(Array.from({ length: 5 }, () => registry.resolve(OWNER, PRIVATE_VOLUME_ID)));

    expect(new Set(volumes.map((volume) => volume.filesPath)).size).toBe(1);
    await expect(exists(volumes[0].filesPath)).resolves.toBe(true);
  });

  it('gives each owner a separate tree', async () => {
    const registry = new VolumeRegistry({ storageRoot });

    const mine = await registry.resolve(OWNER, PRIVATE_VOLUME_ID);
    const theirs = await registry.resolve(OTHER_OWNER, PRIVATE_VOLUME_ID);

    expect(mine.filesPath).not.toEqual(theirs.filesPath);
  });

  it('confines the adapter to the browsable tree so service directories are unreachable', async () => {
    const registry = new VolumeRegistry({ storageRoot });
    const volume = await registry.resolve(OWNER, PRIVATE_VOLUME_ID);
    await fs.writeFile(path.join(volume.trashPath, 'deleted.txt'), 'gone');
    await fs.writeFile(path.join(volume.filesPath, 'report.txt'), 'kept');

    const adapter = await registry.getAdapter(OWNER, PRIVATE_VOLUME_ID);

    await expect(adapter.list('/')).resolves.toEqual([expect.objectContaining({ name: 'report.txt' })]);
    await expect(adapter.stat('/.trash')).resolves.toBeNull();
    await expect(adapter.stat('/.tmp')).resolves.toBeNull();
  });

  it('reuses one adapter per volume', async () => {
    const registry = new VolumeRegistry({ storageRoot });

    const first = await registry.getAdapter(OWNER, PRIVATE_VOLUME_ID);
    const second = await registry.getAdapter(OWNER, PRIVATE_VOLUME_ID);

    expect(first).toBe(second);
  });

  it('lists only the private volume when no shared space is configured', async () => {
    const registry = new VolumeRegistry({ storageRoot });

    await expect(registry.listVolumes(OWNER)).resolves.toEqual([expect.objectContaining({ id: PRIVATE_VOLUME_ID })]);
  });

  it('lists the shared space for every owner when configured', async () => {
    const registry = new VolumeRegistry({ storageRoot, sharedSpace: 'family' });

    const mine = await registry.listVolumes(OWNER);
    const theirs = await registry.listVolumes(OTHER_OWNER);

    expect(mine.map((volume) => volume.id)).toEqual([PRIVATE_VOLUME_ID, 'shared:family']);
    expect(theirs.map((volume) => volume.id)).toEqual([PRIVATE_VOLUME_ID, 'shared:family']);

    const shared = mine[1];
    expect(shared).toMatchObject({
      kind: VolumeKind.Shared,
      filesPath: path.join(storageRoot, 'shared', 'family', 'files'),
    });
    expect(shared.filesPath).toEqual(theirs[1].filesPath);
  });

  it('rejects a shared volume that is not the configured one', async () => {
    const registry = new VolumeRegistry({ storageRoot, sharedSpace: 'family' });

    await expect(registry.resolve(OWNER, 'shared:other')).rejects.toMatchObject({
      code: VolumeErrorCode.UnknownVolume,
    });
  });

  it('rejects a shared volume when none is configured', async () => {
    const registry = new VolumeRegistry({ storageRoot });

    await expect(registry.resolve(OWNER, 'shared:family')).rejects.toMatchObject({
      code: VolumeErrorCode.UnknownVolume,
    });
  });

  it.each(['unknown', '', 'shared:', 'shared:../escape', 'private/../../etc'])(
    'rejects the volume identifier %j',
    async (volumeId) => {
      const registry = new VolumeRegistry({ storageRoot, sharedSpace: 'family' });

      await expect(registry.resolve(OWNER, volumeId)).rejects.toMatchObject({
        code: VolumeErrorCode.UnknownVolume,
      });
    },
  );

  it.each(['../escape', 'with/separator', '..', 'null\0byte'])('rejects the owner identifier %j', async (ownerId) => {
    const registry = new VolumeRegistry({ storageRoot });

    await expect(registry.resolve(ownerId, PRIVATE_VOLUME_ID)).rejects.toMatchObject({
      code: VolumeErrorCode.InvalidOwner,
    });
  });

  it('does not create anything outside the storage root for a rejected owner', async () => {
    const registry = new VolumeRegistry({ storageRoot });

    await expect(registry.resolve('../escape', PRIVATE_VOLUME_ID)).rejects.toThrow();

    await expect(fs.readdir(storageRoot)).resolves.toEqual([]);
    await expect(exists(path.join(path.dirname(storageRoot), 'escape'))).resolves.toBe(false);
  });
});
