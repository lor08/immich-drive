import { HttpException } from '@nestjs/common';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { DriveIndexService } from 'src/extensions/files/drive-index.service';
import { FileDomainService } from 'src/extensions/files/file-domain.service';
import { toHttpException } from 'src/extensions/files/files.exceptions';
import { LocalStorageAdapterError, LocalStorageErrorCode } from 'src/extensions/files/local-storage.adapter';
import { PathLock } from 'src/extensions/files/path-lock';
import { PRIVATE_VOLUME_ID, VolumeError, VolumeErrorCode } from 'src/extensions/files/volume';
import { VolumeRegistry } from 'src/extensions/files/volume.registry';

/** Runs the handler directly: the lock's own behaviour is covered by its unit tests and a live check. */
const passthroughLocks = {
  withPathLock: (_volumeId: string, _path: string, handler: () => Promise<unknown>) => handler(),
} as unknown as PathLock;

/** These cases are about which HTTP status an error becomes, so the index is a no-op here. */
const noIndex = {
  recordEntry: () => Promise.resolve(),
  recordMove: () => Promise.resolve(),
  forgetSubtree: () => Promise.resolve(),
} as unknown as DriveIndexService;

const OWNER = '5f2b9c4e-0000-4000-8000-000000000001';

/** Runs a real domain call, then maps whatever it threw. Proves the mapping covers errors the domain actually produces. */
const statusOf = async (call: Promise<unknown>): Promise<{ status: number; message: string }> => {
  const error = await call.then(() => {}).catch((error: unknown) => toHttpException(error));

  expect(error).toBeInstanceOf(HttpException);
  const exception = error as HttpException;
  return { status: exception.getStatus(), message: exception.message };
};

describe('toHttpException', () => {
  let storageRoot: string;
  let sut: FileDomainService;

  beforeEach(async () => {
    storageRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'immich-drive-errors-'));
    sut = new FileDomainService(new VolumeRegistry({ storageRoot }), passthroughLocks, noIndex);
  });

  afterEach(async () => {
    await fs.rm(storageRoot, { recursive: true, force: true });
  });

  it('maps an unknown volume to 404 without confirming whether it exists', async () => {
    const { status, message } = await statusOf(sut.listEntries(OWNER, 'shared:someone-elses', '/'));

    expect(status).toBe(404);
    expect(message).toBe('Volume not found');
  });

  it('maps a missing folder to 404', async () => {
    const { status } = await statusOf(sut.listEntries(OWNER, PRIVATE_VOLUME_ID, '/missing'));

    expect(status).toBe(404);
  });

  it.each(['relative/path', '/documents/../../escape', '/documents//report', '/nul\0byte', String.raw`C:\windows`])(
    'maps the invalid path %j to 400',
    async (badPath) => {
      const { status } = await statusOf(sut.listEntries(OWNER, PRIVATE_VOLUME_ID, badPath));

      expect(status).toBe(400);
    },
  );

  it('maps listing a file to 400', async () => {
    const [volume] = await sut.listVolumes(OWNER);
    await fs.writeFile(path.join(volume.filesPath, 'report.txt'), 'contents');

    const { status } = await statusOf(sut.listEntries(OWNER, PRIVATE_VOLUME_ID, '/report.txt'));

    expect(status).toBe(400);
  });

  it('maps a symlinked entry to 400', async () => {
    const [volume] = await sut.listVolumes(OWNER);
    await fs.symlink(os.tmpdir(), path.join(volume.filesPath, 'escape'));

    const { status } = await statusOf(sut.listEntries(OWNER, PRIVATE_VOLUME_ID, '/escape'));

    expect(status).toBe(400);
  });

  it('never leaks the storage root through a mapped error', async () => {
    // Thunks rather than promises: creating them all up front would leave rejections unhandled
    // until the loop reached them.
    const failures = [
      () => sut.listEntries(OWNER, PRIVATE_VOLUME_ID, '/missing'),
      () => sut.listEntries(OWNER, PRIVATE_VOLUME_ID, 'relative'),
      () => sut.listEntries(OWNER, 'shared:nope', '/'),
    ];

    for (const failure of failures) {
      const { message } = await statusOf(failure());
      expect(message).not.toContain(storageRoot);
    }
  });

  it('reports operator-facing storage conditions as server errors', () => {
    for (const code of [
      LocalStorageErrorCode.InvalidRoot,
      LocalStorageErrorCode.UnsupportedPlatform,
      LocalStorageErrorCode.UnsupportedOperation,
      LocalStorageErrorCode.EntryChanged,
    ]) {
      const mapped = toHttpException(new LocalStorageAdapterError(code, 'nope')) as HttpException;

      expect(mapped.getStatus()).toBe(500);
    }
  });

  it('reports a defective owner or space name as a server error rather than a client mistake', () => {
    for (const code of [VolumeErrorCode.InvalidOwner, VolumeErrorCode.InvalidSpaceName]) {
      const mapped = toHttpException(new VolumeError(code, 'nope')) as HttpException;

      expect(mapped.getStatus()).toBe(500);
    }
  });

  it('passes an unrelated error through untouched', () => {
    const error = new Error('something else');

    expect(toHttpException(error)).toBe(error);
  });
});
