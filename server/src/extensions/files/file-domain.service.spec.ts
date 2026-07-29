import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { AuthDto } from 'src/dtos/auth.dto';
import { FileDomainService } from 'src/extensions/files/file-domain.service';
import { FilesController } from 'src/extensions/files/files.controller';
import { PathLock } from 'src/extensions/files/path-lock';
import { PRIVATE_VOLUME_ID, VolumeAccess, VolumeKind } from 'src/extensions/files/volume';
import { VolumeRegistry } from 'src/extensions/files/volume.registry';

/** Runs the handler directly: the lock's own behaviour is covered by its unit tests and a live check. */
const passthroughLocks = {
  withPathLock: (_volumeId: string, _path: string, handler: () => Promise<unknown>) => handler(),
  withPathLocks: (_volumeId: string, _paths: readonly string[], handler: () => Promise<unknown>) => handler(),
} as unknown as PathLock;

/**
 * Records which paths each operation locked.
 *
 * Whether the lock actually excludes anything is the lock's own concern; which paths an operation
 * covers is the service's, and a move that locked only its target would race with a move of its
 * source without any test noticing.
 */
const recordingLocks = (locked: string[][]) =>
  ({
    withPathLock: (_volumeId: string, path: string, handler: () => Promise<unknown>) => {
      locked.push([path]);
      return handler();
    },
    withPathLocks: (_volumeId: string, paths: readonly string[], handler: () => Promise<unknown>) => {
      locked.push([...paths]);
      return handler();
    },
  }) as unknown as PathLock;

const OWNER = '5f2b9c4e-0000-4000-8000-000000000001';
const OTHER_OWNER = '5f2b9c4e-0000-4000-8000-000000000002';

const asAuth = (userId: string) => ({ user: { id: userId } }) as AuthDto;

describe(FileDomainService.name, () => {
  let storageRoot: string;
  let sut: FileDomainService;

  beforeEach(async () => {
    storageRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'immich-drive-domain-'));
    sut = new FileDomainService(new VolumeRegistry({ storageRoot, sharedSpace: 'family' }), passthroughLocks);
  });

  afterEach(async () => {
    await fs.rm(storageRoot, { recursive: true, force: true });
  });

  it('lists the volumes available to an owner', async () => {
    const volumes = await sut.listVolumes(OWNER);

    expect(volumes.map((volume) => volume.id)).toEqual([PRIVATE_VOLUME_ID, 'shared:family']);
  });

  it('reads through the adapter of the requested volume', async () => {
    const [privateVolume] = await sut.listVolumes(OWNER);
    await fs.writeFile(path.join(privateVolume.filesPath, 'report.txt'), 'contents');

    await expect(sut.listEntries(OWNER, PRIVATE_VOLUME_ID, '/')).resolves.toEqual([
      expect.objectContaining({ name: 'report.txt', path: '/report.txt' }),
    ]);
    await expect(sut.getEntry(OWNER, PRIVATE_VOLUME_ID, '/report.txt')).resolves.toMatchObject({ size: 8 });
  });

  it('keeps one owner out of another owner private volume', async () => {
    const [mine] = await sut.listVolumes(OWNER);
    await fs.writeFile(path.join(mine.filesPath, 'secret.txt'), 'mine');

    await expect(sut.listEntries(OTHER_OWNER, PRIVATE_VOLUME_ID, '/')).resolves.toEqual([]);
  });

  it('rejects a volume the owner cannot address', async () => {
    await expect(sut.listEntries(OWNER, 'shared:other', '/')).rejects.toThrow();
  });

  it('opens a file together with its entry', async () => {
    const [volume] = await sut.listVolumes(OWNER);
    await fs.writeFile(path.join(volume.filesPath, 'report.txt'), 'contents');

    const { entry, content } = await sut.openFile(OWNER, PRIVATE_VOLUME_ID, '/report.txt');

    expect(entry).toMatchObject({ name: 'report.txt', size: 8 });

    const chunks: Buffer[] = [];
    for await (const chunk of content) {
      chunks.push(Buffer.from(chunk));
    }
    expect(Buffer.concat(chunks).toString()).toBe('contents');
  });

  it('refuses to open a directory as a file', async () => {
    const [volume] = await sut.listVolumes(OWNER);
    await fs.mkdir(path.join(volume.filesPath, 'documents'));

    await expect(sut.openFile(OWNER, PRIVATE_VOLUME_ID, '/documents')).rejects.toMatchObject({
      code: 'entry-not-file',
    });
  });

  it('refuses to open a missing file', async () => {
    await expect(sut.openFile(OWNER, PRIVATE_VOLUME_ID, '/missing.txt')).rejects.toMatchObject({
      code: 'entry-not-found',
    });
  });

  it('moves an entry while holding the lock on both paths', async () => {
    const locked: string[][] = [];
    const service = new FileDomainService(new VolumeRegistry({ storageRoot }), recordingLocks(locked));
    const [volume] = await service.listVolumes(OWNER);
    await fs.writeFile(path.join(volume.filesPath, 'report.txt'), 'contents');

    await service.moveEntry(OWNER, PRIVATE_VOLUME_ID, '/report.txt', '/final.txt');

    expect(locked).toEqual([['/report.txt', '/final.txt']]);
    await expect(fs.readdir(volume.filesPath)).resolves.toEqual(['final.txt']);
  });

  it('copies a file while holding the lock on both paths', async () => {
    const locked: string[][] = [];
    const service = new FileDomainService(new VolumeRegistry({ storageRoot }), recordingLocks(locked));
    const [volume] = await service.listVolumes(OWNER);
    await fs.writeFile(path.join(volume.filesPath, 'report.txt'), 'contents');

    const entry = await service.copyEntry(OWNER, PRIVATE_VOLUME_ID, '/report.txt', '/copy.txt');

    expect(locked).toEqual([['/report.txt', '/copy.txt']]);
    expect(entry).toMatchObject({ path: '/copy.txt', size: 8 });
    await expect(fs.readFile(path.join(volume.filesPath, 'copy.txt'), 'utf8')).resolves.toBe('contents');
  });

  it('cannot move an entry out of a volume the owner cannot address', async () => {
    const other = new FileDomainService(new VolumeRegistry({ storageRoot, sharedSpace: 'family' }), passthroughLocks);

    await expect(other.moveEntry(OWNER, 'shared:other', '/a.txt', '/b.txt')).rejects.toThrow();
  });

  it('reports that file storage is not enabled when the domain is unconfigured', async () => {
    const disabled = new FileDomainService(null, passthroughLocks);

    await expect(disabled.listVolumes(OWNER)).rejects.toThrow('Immich Drive file storage is not enabled');
    await expect(disabled.listEntries(OWNER, PRIVATE_VOLUME_ID, '/')).rejects.toThrow(
      'Immich Drive file storage is not enabled',
    );
  });
});

describe(FilesController.name, () => {
  it('returns volumes without any host path', async () => {
    const service = {
      listVolumes: vi.fn().mockResolvedValue([
        {
          id: PRIVATE_VOLUME_ID,
          name: 'My files',
          kind: VolumeKind.Private,
          access: VolumeAccess.ReadWrite,
          filesPath: '/data/drive/users/someone/files',
          trashPath: '/data/drive/users/someone/.trash',
          tempPath: '/data/drive/users/someone/.tmp',
        },
      ]),
    } as unknown as FileDomainService;

    const response = await new FilesController(service).getFileVolumes(asAuth(OWNER));

    expect(response).toEqual([
      { id: PRIVATE_VOLUME_ID, name: 'My files', kind: VolumeKind.Private, access: VolumeAccess.ReadWrite },
    ]);
    expect(JSON.stringify(response)).not.toContain('/data/drive');
  });

  it('lists folder entries for the authenticated user', async () => {
    const storageRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'immich-drive-entries-'));
    const service = new FileDomainService(new VolumeRegistry({ storageRoot }), passthroughLocks);
    const [volume] = await service.listVolumes(OWNER);
    await fs.mkdir(path.join(volume.filesPath, 'documents'));
    await fs.writeFile(path.join(volume.filesPath, 'documents', 'report.txt'), 'contents');

    const response = await new FilesController(service).getFileEntries(asAuth(OWNER), {
      volumeId: PRIVATE_VOLUME_ID,
      path: '/documents',
    });

    expect(response).toEqual([expect.objectContaining({ name: 'report.txt', path: '/documents/report.txt', size: 8 })]);
    expect(JSON.stringify(response)).not.toContain(storageRoot);

    await fs.rm(storageRoot, { recursive: true, force: true });
  });

  it('scopes the listing to the authenticated user', async () => {
    const service = { listVolumes: vi.fn().mockResolvedValue([]) } as unknown as FileDomainService;

    await new FilesController(service).getFileVolumes(asAuth(OWNER));

    expect(service.listVolumes).toHaveBeenCalledWith(OWNER);
  });
});
