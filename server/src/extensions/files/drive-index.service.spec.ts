import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { DriveIndexRepository } from 'src/extensions/files/drive-index.repository';
import { DriveIndexService } from 'src/extensions/files/drive-index.service';
import { FileEntry, FileEntryType } from 'src/extensions/files/file-entry';
import { privateVolume, sharedVolume, Volume } from 'src/extensions/files/volume';
import { VOLUME_MARKER_NAME } from 'src/extensions/files/volume-identity';
import { LoggingRepository } from 'src/repositories/logging.repository';

const OWNER = '5f2b9c4e-0000-4000-8000-000000000001';
const VOLUME_ROW = '9a1f0000-0000-4000-8000-00000000000a';

const entry = (entryPath: string, overrides: Partial<FileEntry> = {}): FileEntry => ({
  path: entryPath,
  name: path.posix.basename(entryPath),
  type: FileEntryType.File,
  size: 8,
  modifiedAt: new Date('2026-07-29T10:00:00.000Z'),
  ...overrides,
});

const newRepository = () => ({
  upsertVolume: vi.fn().mockResolvedValue(VOLUME_ROW),
  upsertEntry: vi.fn().mockResolvedValue(undefined),
  moveSubtree: vi.fn().mockResolvedValue(undefined),
  deleteSubtree: vi.fn().mockResolvedValue(undefined),
});

const newLogger = () => ({ setContext: vi.fn(), warn: vi.fn() });

describe(DriveIndexService.name, () => {
  let storageRoot: string;
  let repository: ReturnType<typeof newRepository>;
  let logger: ReturnType<typeof newLogger>;
  let sut: DriveIndexService;
  let volume: Volume;

  const provision = async (target: Volume) => {
    await fs.mkdir(target.filesPath, { recursive: true });
  };

  beforeEach(async () => {
    storageRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'immich-drive-index-'));
    repository = newRepository();
    logger = newLogger();
    sut = new DriveIndexService(repository as unknown as DriveIndexRepository, logger as unknown as LoggingRepository);
    volume = privateVolume(storageRoot, OWNER);
    await provision(volume);
  });

  afterEach(async () => {
    await fs.rm(storageRoot, { recursive: true, force: true });
  });

  it('records an entry with the parent path derived from it', async () => {
    await sut.recordEntry(OWNER, volume, entry('/documents/report.txt'));

    expect(repository.upsertEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        volumeId: VOLUME_ROW,
        path: '/documents/report.txt',
        parentPath: '/documents',
        name: 'report.txt',
        type: FileEntryType.File,
        size: 8,
      }),
    );
  });

  it('gives a top-level entry the volume root as its parent', async () => {
    await sut.recordEntry(OWNER, volume, entry('/report.txt'));

    expect(repository.upsertEntry).toHaveBeenCalledWith(expect.objectContaining({ parentPath: '/' }));
  });

  it('keys a private volume by its owner and a shared volume by itself', async () => {
    const shared = sharedVolume(storageRoot, 'family');
    await provision(shared);

    await sut.recordEntry(OWNER, volume, entry('/report.txt'));
    await sut.recordEntry(OWNER, shared, entry('/report.txt'));

    expect(repository.upsertVolume).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ key: `${OWNER}:private`, ownerId: OWNER, volumeId: 'private' }),
    );
    // A shared volume belongs to the deployment, so it has no owner to record.
    expect(repository.upsertVolume).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ key: 'shared:family', ownerId: null, volumeId: 'shared:family' }),
    );
  });

  it('writes the volume marker once and records the identity of the volume root', async () => {
    await sut.recordEntry(OWNER, volume, entry('/report.txt'));

    const marker = JSON.parse(await fs.readFile(path.join(volume.rootPath, VOLUME_MARKER_NAME), 'utf8'));
    const stats = await fs.stat(volume.rootPath, { bigint: true });

    expect(repository.upsertVolume).toHaveBeenCalledWith(
      expect.objectContaining({
        markerId: marker.markerId,
        device: stats.dev.toString(),
        inode: stats.ino.toString(),
      }),
    );
    expect(marker.version).toBe(1);
  });

  it('reuses an existing marker rather than replacing it', async () => {
    const markerFile = path.join(volume.rootPath, VOLUME_MARKER_NAME);
    const existing = JSON.stringify({ version: 1, markerId: 'b6e1c0de-0000-4000-8000-00000000ffff' });
    await fs.writeFile(markerFile, existing);

    await sut.recordEntry(OWNER, volume, entry('/report.txt'));

    await expect(fs.readFile(markerFile, 'utf8')).resolves.toBe(existing);
    expect(repository.upsertVolume).toHaveBeenCalledWith(
      expect.objectContaining({ markerId: 'b6e1c0de-0000-4000-8000-00000000ffff' }),
    );
  });

  it('leaves a marker it cannot read alone and reports no identifier', async () => {
    const markerFile = path.join(volume.rootPath, VOLUME_MARKER_NAME);
    await fs.writeFile(markerFile, 'this is not a marker');

    await sut.recordEntry(OWNER, volume, entry('/report.txt'));

    await expect(fs.readFile(markerFile, 'utf8')).resolves.toBe('this is not a marker');
    expect(repository.upsertVolume).toHaveBeenCalledWith(expect.objectContaining({ markerId: null }));
  });

  it('resolves the volume row once for many mutations', async () => {
    await sut.recordEntry(OWNER, volume, entry('/a.txt'));
    await sut.recordEntry(OWNER, volume, entry('/b.txt'));
    await sut.forgetSubtree(OWNER, volume, '/a.txt');

    expect(repository.upsertVolume).toHaveBeenCalledTimes(1);
    expect(repository.upsertEntry).toHaveBeenCalledTimes(2);
  });

  it('resolves the volume row once when mutations run concurrently', async () => {
    await Promise.all([
      sut.recordEntry(OWNER, volume, entry('/a.txt')),
      sut.recordEntry(OWNER, volume, entry('/b.txt')),
      sut.recordEntry(OWNER, volume, entry('/c.txt')),
    ]);

    expect(repository.upsertVolume).toHaveBeenCalledTimes(1);
  });

  it('passes both ends of a move so a whole subtree can be rewritten', async () => {
    await sut.recordMove(OWNER, volume, '/documents', entry('/archive', { type: FileEntryType.Directory }));

    expect(repository.moveSubtree).toHaveBeenCalledWith({
      volumeId: VOLUME_ROW,
      sourcePath: '/documents',
      entry: expect.objectContaining({ path: '/archive', parentPath: '/', name: 'archive' }),
    });
  });

  it('forgets a path and everything under it', async () => {
    await sut.forgetSubtree(OWNER, volume, '/documents');

    expect(repository.deleteSubtree).toHaveBeenCalledWith(VOLUME_ROW, '/documents');
  });

  it('does not fail the operation when the index write fails', async () => {
    repository.upsertEntry.mockRejectedValue(new Error('database is on fire'));

    await expect(sut.recordEntry(OWNER, volume, entry('/report.txt'))).resolves.toBeUndefined();

    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('/report.txt'));
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('database is on fire'));
  });

  it('does not fail the operation when the volume itself cannot be recorded', async () => {
    repository.upsertVolume.mockRejectedValue(new Error('no such table'));

    await expect(sut.recordEntry(OWNER, volume, entry('/report.txt'))).resolves.toBeUndefined();
    await expect(sut.forgetSubtree(OWNER, volume, '/report.txt')).resolves.toBeUndefined();

    expect(logger.warn).toHaveBeenCalledTimes(2);
  });

  it('never logs a host path', async () => {
    repository.upsertEntry.mockRejectedValue(new Error('database is on fire'));

    await sut.recordEntry(OWNER, volume, entry('/report.txt'));

    for (const [message] of logger.warn.mock.calls) {
      expect(message).not.toContain(storageRoot);
    }
  });

  it('resolves the volume again after a failure, so a re-created table is picked up', async () => {
    repository.upsertEntry.mockRejectedValueOnce(new Error('relation does not exist'));

    await sut.recordEntry(OWNER, volume, entry('/a.txt'));
    await sut.recordEntry(OWNER, volume, entry('/b.txt'));

    expect(repository.upsertVolume).toHaveBeenCalledTimes(2);
  });

  it('does not fail the operation when the owner identifier is unusable', async () => {
    // Unreachable through the API, which resolves the volume from the same identifier first. Asserted
    // because callers rely on this method never rejecting, whatever it is handed.
    await expect(sut.recordEntry('../escape', volume, entry('/report.txt'))).resolves.toBeUndefined();

    expect(repository.upsertEntry).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledTimes(1);
  });

  it('does not fail the operation when the volume root has disappeared', async () => {
    await fs.rm(storageRoot, { recursive: true, force: true });

    await expect(sut.recordEntry(OWNER, volume, entry('/report.txt'))).resolves.toBeUndefined();

    expect(repository.upsertEntry).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledTimes(1);
  });
});
