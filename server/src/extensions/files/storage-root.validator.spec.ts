import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { DRIVE_ROOT_VARIABLE, readDriveConfig } from 'src/extensions/files/files.config';
import {
  StorageRootError,
  StorageRootErrorCode,
  validateStorageRoot,
} from 'src/extensions/files/storage-root.validator';

// A process running as root ignores permission bits, so the unreadable-directory case cannot be exercised.
const canTestPermissions = process.getuid === undefined ? false : process.getuid() !== 0;

describe('readDriveConfig', () => {
  it('disables the file domain when the variable is unset', () => {
    expect(readDriveConfig({})).toEqual({ enabled: false });
  });

  it('disables the file domain for an empty or blank value', () => {
    expect(readDriveConfig({ [DRIVE_ROOT_VARIABLE]: '' })).toEqual({ enabled: false });
    expect(readDriveConfig({ [DRIVE_ROOT_VARIABLE]: ' '.repeat(3) })).toEqual({ enabled: false });
  });

  it('enables the file domain with a trimmed root', () => {
    expect(readDriveConfig({ [DRIVE_ROOT_VARIABLE]: ' /data/drive ' })).toEqual({
      enabled: true,
      root: '/data/drive',
    });
  });
});

describe('validateStorageRoot', () => {
  let workspace: string;
  let root: string;
  let media: string;

  beforeEach(async () => {
    workspace = await fs.mkdtemp(path.join(os.tmpdir(), 'immich-drive-storage-root-'));
    root = path.join(workspace, 'drive');
    media = path.join(workspace, 'immich');
    await fs.mkdir(root);
    await fs.mkdir(media);
  });

  afterEach(async () => {
    await fs.chmod(root, 0o755).catch(() => {});
    await fs.rm(workspace, { recursive: true, force: true });
  });

  it('accepts a usable root that does not overlap a reserved path', async () => {
    await expect(validateStorageRoot({ root, reservedPaths: [media] })).resolves.toEqual({
      path: await fs.realpath(root),
    });
  });

  it('returns the canonical path with symbolic links resolved', async () => {
    const link = path.join(workspace, 'drive-link');
    await fs.symlink(root, link);

    await expect(validateStorageRoot({ root: link, reservedPaths: [media] })).resolves.toEqual({
      path: await fs.realpath(root),
    });
  });

  it('rejects a relative path', async () => {
    await expect(validateStorageRoot({ root: 'drive', reservedPaths: [] })).rejects.toMatchObject({
      code: StorageRootErrorCode.NotAbsolute,
    });
  });

  it('rejects a null byte', async () => {
    await expect(validateStorageRoot({ root: `${root}\0`, reservedPaths: [] })).rejects.toMatchObject({
      code: StorageRootErrorCode.InvalidPath,
    });
  });

  it('rejects a missing directory', async () => {
    await expect(
      validateStorageRoot({ root: path.join(workspace, 'missing'), reservedPaths: [] }),
    ).rejects.toMatchObject({ code: StorageRootErrorCode.NotFound });
  });

  it('rejects a path that is not a directory', async () => {
    const file = path.join(workspace, 'file.txt');
    await fs.writeFile(file, 'contents');

    await expect(validateStorageRoot({ root: file, reservedPaths: [] })).rejects.toMatchObject({
      code: StorageRootErrorCode.NotDirectory,
    });
  });

  it.runIf(canTestPermissions)('rejects a root the process cannot write', async () => {
    await fs.chmod(root, 0o500);

    await expect(validateStorageRoot({ root, reservedPaths: [] })).rejects.toMatchObject({
      code: StorageRootErrorCode.NotAccessible,
    });
  });

  it('rejects a root equal to a reserved path', async () => {
    await expect(validateStorageRoot({ root, reservedPaths: [root] })).rejects.toMatchObject({
      code: StorageRootErrorCode.ReservedOverlap,
    });
  });

  it('rejects a root inside a reserved path', async () => {
    const nested = path.join(media, 'drive');
    await fs.mkdir(nested);

    await expect(validateStorageRoot({ root: nested, reservedPaths: [media] })).rejects.toMatchObject({
      code: StorageRootErrorCode.ReservedOverlap,
    });
  });

  it('rejects a reserved path inside the root', async () => {
    const nested = path.join(root, 'upload');
    await fs.mkdir(nested);

    await expect(validateStorageRoot({ root, reservedPaths: [nested] })).rejects.toMatchObject({
      code: StorageRootErrorCode.ReservedOverlap,
    });
  });

  it('accepts a sibling that only shares a name prefix', async () => {
    const sibling = path.join(workspace, 'immich-drive');
    await fs.mkdir(sibling);

    await expect(validateStorageRoot({ root: sibling, reservedPaths: [media] })).resolves.toEqual({
      path: await fs.realpath(sibling),
    });
  });

  it('rejects a symlinked root whose target is inside a reserved path', async () => {
    const target = path.join(media, 'upload');
    const link = path.join(workspace, 'drive-escape');
    await fs.mkdir(target);
    await fs.symlink(target, link);

    await expect(validateStorageRoot({ root: link, reservedPaths: [media] })).rejects.toMatchObject({
      code: StorageRootErrorCode.ReservedOverlap,
    });
  });

  it('detects overlap through a symlinked reserved path', async () => {
    const real = path.join(workspace, 'real-media');
    const reservedLink = path.join(workspace, 'linked-media');
    const nested = path.join(real, 'drive');
    await fs.mkdir(real);
    await fs.mkdir(nested);
    await fs.symlink(real, reservedLink);

    await expect(validateStorageRoot({ root: nested, reservedPaths: [reservedLink] })).rejects.toMatchObject({
      code: StorageRootErrorCode.ReservedOverlap,
    });
  });

  it('tolerates a reserved path that does not exist yet', async () => {
    const missingReserved = path.join(workspace, 'immich', 'upload', 'not-created');

    await expect(validateStorageRoot({ root, reservedPaths: [missingReserved] })).resolves.toEqual({
      path: await fs.realpath(root),
    });
  });

  it('resolves a missing reserved path through its existing ancestor', async () => {
    const real = path.join(workspace, 'real-media');
    const reservedLink = path.join(workspace, 'linked-media');
    await fs.mkdir(real);
    await fs.symlink(real, reservedLink);

    const nested = path.join(real, 'upload');
    await fs.mkdir(nested);

    await expect(
      validateStorageRoot({ root: nested, reservedPaths: [path.join(reservedLink, 'upload')] }),
    ).rejects.toMatchObject({ code: StorageRootErrorCode.ReservedOverlap });
  });

  it('names the offending path in operator-facing errors', async () => {
    const error = await validateStorageRoot({ root, reservedPaths: [root] }).catch((error: unknown) => error);

    expect(error).toBeInstanceOf(StorageRootError);
    expect((error as Error).message).toContain(await fs.realpath(root));
  });
});
