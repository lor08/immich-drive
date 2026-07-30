import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import { AuthDto } from 'src/dtos/auth.dto';
import { DriveIndexService } from 'src/extensions/files/drive-index.service';
import { DriveMembershipRepository, VolumeMembership } from 'src/extensions/files/drive-membership.repository';
import { FileDomainService } from 'src/extensions/files/file-domain.service';
import { FileEntry } from 'src/extensions/files/file-entry';
import { FilesController } from 'src/extensions/files/files.controller';
import { PathLock } from 'src/extensions/files/path-lock';
import { ReconciliationService } from 'src/extensions/files/reconciliation.service';
import { PRIVATE_VOLUME_ID, VolumeAccess, VolumeKind } from 'src/extensions/files/volume';
import { VolumeAccessService } from 'src/extensions/files/volume-access.service';
import { VolumeMembershipService } from 'src/extensions/files/volume-membership.service';
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

/** What the index was told, as `[operation, ...paths]`. */
type IndexCall = [string, ...string[]];

/**
 * Stands in for the index without a database.
 *
 * How the rows are written is the repository's concern and is covered against real PostgreSQL. What
 * belongs here is whether each mutation reports what it did at all: an operation that quietly stopped
 * telling the index would otherwise keep passing every test in the domain.
 */
const recordingIndex = (calls: IndexCall[] = []) =>
  ({
    recordEntry: (_ownerId: string, _volume: unknown, entry: FileEntry) => {
      calls.push(['record', entry.path]);
      return Promise.resolve();
    },
    recordMove: (_ownerId: string, _volume: unknown, sourcePath: string, entry: FileEntry) => {
      calls.push(['move', sourcePath, entry.path]);
      return Promise.resolve();
    },
    forgetSubtree: (_ownerId: string, _volume: unknown, entryPath: string) => {
      calls.push(['forget', entryPath]);
      return Promise.resolve();
    },
  }) as unknown as DriveIndexService;

const bytes = (content: string) => Readable.from([Buffer.from(content)]);

/** A domain service over a volume registry with a shared space, and the memberships to go with it. */
const newSharedService = (storageRoot: string, memberships: VolumeMembership[]) =>
  new FileDomainService(
    newAccess(new VolumeRegistry({ storageRoot, sharedSpace: 'family' }), memberships),
    passthroughLocks,
    recordingIndex(),
  );

/**
 * Runs every call and records how each one ended, by error code.
 *
 * A map keyed by method name rather than a sequence of assertions, so a failure names the entry point that
 * behaved wrongly instead of stopping at the first one.
 */
const codesOf = async (calls: Record<string, () => Promise<unknown>>) => {
  const outcomes: Record<string, unknown> = {};
  for (const [name, call] of Object.entries(calls)) {
    outcomes[name] = await call()
      .then(() => 'resolved')
      .catch((error: unknown) => (error as { code?: string }).code ?? 'other');
  }

  return outcomes;
};

/** These cases are about what the controller returns, and none of them reconciles anything. */
/** Member administration is not what these controller cases are about. */
const noMembership = {
  listMembers: () => Promise.resolve([]),
  addMember: () => Promise.reject(new Error('not part of this test')),
  removeMember: () => Promise.reject(new Error('not part of this test')),
} as unknown as VolumeMembershipService;

const noReconciliation = {
  inspectVolumes: () => Promise.resolve([]),
  reconcileVolume: () => Promise.reject(new Error('not part of this test')),
} as unknown as ReconciliationService;

/**
 * Membership, in memory.
 *
 * The access decision is exercised for real in these tests rather than stubbed: the point of routing every
 * entry point through it is that a test of the domain also tests that the check happens.
 */
const newMembership = (memberships: VolumeMembership[] = []) =>
  ({
    get: (volumeKey: string, userId: string) =>
      Promise.resolve(memberships.find((member) => member.volumeKey === volumeKey && member.userId === userId)),
    listForUser: (userId: string) => Promise.resolve(memberships.filter((member) => member.userId === userId)),
  }) as unknown as DriveMembershipRepository;

const newAccess = (registry: VolumeRegistry | null, memberships: VolumeMembership[] = []) =>
  new VolumeAccessService(registry, newMembership(memberships));

const OWNER = '5f2b9c4e-0000-4000-8000-000000000001';
const OTHER_OWNER = '5f2b9c4e-0000-4000-8000-000000000002';

const asAuth = (userId: string) => ({ user: { id: userId } }) as AuthDto;

/** The suite's owner is a read-write member of the shared space, which is what it was before P1-07. */
const sharedMembership: VolumeMembership[] = [
  { volumeKey: 'shared:family', userId: OWNER, access: VolumeAccess.ReadWrite },
];

describe(FileDomainService.name, () => {
  let storageRoot: string;
  let sut: FileDomainService;
  let indexCalls: IndexCall[];

  beforeEach(async () => {
    storageRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'immich-drive-domain-'));
    indexCalls = [];
    sut = new FileDomainService(
      newAccess(new VolumeRegistry({ storageRoot, sharedSpace: 'family' }), sharedMembership),
      passthroughLocks,
      recordingIndex(indexCalls),
    );
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
    const service = new FileDomainService(
      newAccess(new VolumeRegistry({ storageRoot })),
      recordingLocks(locked),
      recordingIndex(indexCalls),
    );
    const [volume] = await service.listVolumes(OWNER);
    await fs.writeFile(path.join(volume.filesPath, 'report.txt'), 'contents');

    await service.moveEntry(OWNER, PRIVATE_VOLUME_ID, '/report.txt', '/final.txt');

    expect(locked).toEqual([['/report.txt', '/final.txt']]);
    await expect(fs.readdir(volume.filesPath)).resolves.toEqual(['final.txt']);
  });

  it('copies a file while holding the lock on both paths', async () => {
    const locked: string[][] = [];
    const service = new FileDomainService(
      newAccess(new VolumeRegistry({ storageRoot })),
      recordingLocks(locked),
      recordingIndex(indexCalls),
    );
    const [volume] = await service.listVolumes(OWNER);
    await fs.writeFile(path.join(volume.filesPath, 'report.txt'), 'contents');

    const entry = await service.copyEntry(OWNER, PRIVATE_VOLUME_ID, '/report.txt', '/copy.txt');

    expect(locked).toEqual([['/report.txt', '/copy.txt']]);
    expect(entry).toMatchObject({ path: '/copy.txt', size: 8 });
    await expect(fs.readFile(path.join(volume.filesPath, 'copy.txt'), 'utf8')).resolves.toBe('contents');
  });

  it('cannot move an entry out of a volume the owner cannot address', async () => {
    const other = new FileDomainService(
      newAccess(new VolumeRegistry({ storageRoot, sharedSpace: 'family' }), sharedMembership),
      passthroughLocks,
      recordingIndex(indexCalls),
    );

    await expect(other.moveEntry(OWNER, 'shared:other', '/a.txt', '/b.txt')).rejects.toThrow();
  });

  it('deletes to the trash under the lock on the path it leaves', async () => {
    const locked: string[][] = [];
    const service = new FileDomainService(
      newAccess(new VolumeRegistry({ storageRoot })),
      recordingLocks(locked),
      recordingIndex(indexCalls),
    );
    const [volume] = await service.listVolumes(OWNER);
    await fs.writeFile(path.join(volume.filesPath, 'report.txt'), 'contents');

    const record = await service.trashEntry(OWNER, PRIVATE_VOLUME_ID, '/report.txt');

    expect(locked).toEqual([['/report.txt']]);
    expect(record).toMatchObject({ name: 'report.txt', originalPath: '/report.txt' });
    await expect(fs.readdir(volume.filesPath)).resolves.toEqual([]);
    await expect(fs.readdir(path.join(volume.trashPath, record.id))).resolves.toEqual(['report.txt']);
  });

  it('restores under the lock on the record and on the target', async () => {
    const locked: string[][] = [];
    const service = new FileDomainService(
      newAccess(new VolumeRegistry({ storageRoot })),
      recordingLocks(locked),
      recordingIndex(indexCalls),
    );
    const [volume] = await service.listVolumes(OWNER);
    await fs.writeFile(path.join(volume.filesPath, 'report.txt'), 'contents');

    const record = await service.trashEntry(OWNER, PRIVATE_VOLUME_ID, '/report.txt');
    await service.restoreFromTrash(OWNER, PRIVATE_VOLUME_ID, record.id, '/restored.txt');

    // The record key cannot be produced by a normalized path, so the two namespaces stay apart.
    expect(locked).toEqual([['/report.txt'], [`trash:${record.id}`, '/restored.txt']]);
    await expect(fs.readFile(path.join(volume.filesPath, 'restored.txt'), 'utf8')).resolves.toBe('contents');
  });

  it('purges under the lock on the record alone', async () => {
    const locked: string[][] = [];
    const service = new FileDomainService(
      newAccess(new VolumeRegistry({ storageRoot })),
      recordingLocks(locked),
      recordingIndex(indexCalls),
    );
    const [volume] = await service.listVolumes(OWNER);
    await fs.writeFile(path.join(volume.filesPath, 'report.txt'), 'contents');

    const record = await service.trashEntry(OWNER, PRIVATE_VOLUME_ID, '/report.txt');
    await service.purgeFromTrash(OWNER, PRIVATE_VOLUME_ID, record.id);

    expect(locked).toEqual([['/report.txt'], [`trash:${record.id}`]]);
    await expect(service.listTrash(OWNER, PRIVATE_VOLUME_ID)).resolves.toEqual([]);
  });

  it('keeps one owner out of another owner trash', async () => {
    const [mine] = await sut.listVolumes(OWNER);
    await fs.writeFile(path.join(mine.filesPath, 'secret.txt'), 'mine');
    const record = await sut.trashEntry(OWNER, PRIVATE_VOLUME_ID, '/secret.txt');

    await expect(sut.listTrash(OTHER_OWNER, PRIVATE_VOLUME_ID)).resolves.toEqual([]);
    await expect(sut.restoreFromTrash(OTHER_OWNER, PRIVATE_VOLUME_ID, record.id)).rejects.toMatchObject({
      code: 'entry-not-found',
    });
    await expect(sut.purgeFromTrash(OTHER_OWNER, PRIVATE_VOLUME_ID, record.id)).rejects.toMatchObject({
      code: 'entry-not-found',
    });
    await expect(sut.emptyTrash(OTHER_OWNER, PRIVATE_VOLUME_ID)).resolves.toEqual({ removed: 0, failed: 0 });

    await expect(sut.listTrash(OWNER, PRIVATE_VOLUME_ID)).resolves.toEqual([
      expect.objectContaining({ id: record.id }),
    ]);
  });

  it('reports every mutation to the index, in the order they happened', async () => {
    await sut.createFolder(OWNER, PRIVATE_VOLUME_ID, '/documents');
    await sut.writeFile(OWNER, PRIVATE_VOLUME_ID, '/documents/report.txt', bytes('contents'));
    await sut.copyEntry(OWNER, PRIVATE_VOLUME_ID, '/documents/report.txt', '/documents/copy.txt');
    await sut.moveEntry(OWNER, PRIVATE_VOLUME_ID, '/documents/copy.txt', '/moved.txt');
    const record = await sut.trashEntry(OWNER, PRIVATE_VOLUME_ID, '/moved.txt');
    await sut.restoreFromTrash(OWNER, PRIVATE_VOLUME_ID, record.id);

    expect(indexCalls).toEqual([
      ['record', '/documents'],
      ['record', '/documents/report.txt'],
      ['record', '/documents/copy.txt'],
      ['move', '/documents/copy.txt', '/moved.txt'],
      // The trash is outside the address space, so the index stops describing the path rather than
      // following the content into it.
      ['forget', '/moved.txt'],
      ['record', '/moved.txt'],
    ]);
  });

  it('tells the index nothing when the operation itself failed', async () => {
    const [volume] = await sut.listVolumes(OWNER);
    await fs.writeFile(path.join(volume.filesPath, 'report.txt'), 'contents');
    await fs.writeFile(path.join(volume.filesPath, 'taken.txt'), 'other');

    await expect(sut.moveEntry(OWNER, PRIVATE_VOLUME_ID, '/report.txt', '/taken.txt')).rejects.toThrow();
    await expect(sut.createFolder(OWNER, PRIVATE_VOLUME_ID, '/missing/folder')).rejects.toThrow();
    await expect(sut.trashEntry(OWNER, PRIVATE_VOLUME_ID, '/gone.txt')).rejects.toThrow();

    expect(indexCalls).toEqual([]);
  });

  it('forgets the whole subtree a moved folder came from', async () => {
    await sut.createFolder(OWNER, PRIVATE_VOLUME_ID, '/documents');
    await sut.writeFile(OWNER, PRIVATE_VOLUME_ID, '/documents/report.txt', bytes('contents'));
    indexCalls.length = 0;

    await sut.moveEntry(OWNER, PRIVATE_VOLUME_ID, '/documents', '/archive');

    // One call, not one per descendant: rewriting the prefix is the index's job and is a single
    // statement there, whatever the size of the subtree.
    expect(indexCalls).toEqual([['move', '/documents', '/archive']]);
  });

  describe('shared volume authorization', () => {
    const SHARED = 'shared:family';

    /**
     * Every entry point, checked against the class's own method list.
     *
     * The comparison below is the part that matters: a new method on `FileDomainService` fails this test
     * until it appears here, so "we forgot the permission check on the new endpoint" cannot happen quietly.
     */
    const callEveryEntryPoint = (service: FileDomainService, ownerId: string) => ({
      getEntry: () => service.getEntry(ownerId, SHARED, '/report.txt'),
      listEntries: () => service.listEntries(ownerId, SHARED, '/'),
      openFile: () => service.openFile(ownerId, SHARED, '/report.txt'),
      openEntry: () => service.openEntry(ownerId, SHARED, '/report.txt'),
      createFolder: () => service.createFolder(ownerId, SHARED, '/documents'),
      writeFile: () => service.writeFile(ownerId, SHARED, '/report.txt', bytes('contents')),
      moveEntry: () => service.moveEntry(ownerId, SHARED, '/report.txt', '/moved.txt'),
      copyEntry: () => service.copyEntry(ownerId, SHARED, '/report.txt', '/copy.txt'),
      deleteEntry: () => service.deleteEntry(ownerId, SHARED, '/report.txt'),
      trashEntry: () => service.trashEntry(ownerId, SHARED, '/report.txt'),
      listTrash: () => service.listTrash(ownerId, SHARED),
      restoreFromTrash: () => service.restoreFromTrash(ownerId, SHARED, '11111111-1111-4111-8111-111111111111'),
      purgeFromTrash: () => service.purgeFromTrash(ownerId, SHARED, '11111111-1111-4111-8111-111111111111'),
      emptyTrash: () => service.emptyTrash(ownerId, SHARED),
    });

    /** `listVolumes` filters rather than refuses, and is covered by its own case below. */
    const EXEMPT = ['listVolumes'];

    it('covers every entry point of the service', () => {
      const methods = Object.getOwnPropertyNames(FileDomainService.prototype).filter((name) => name !== 'constructor');
      const covered = [...Object.keys(callEveryEntryPoint(newSharedService(storageRoot, []), OWNER)), ...EXEMPT];

      expect(covered.sort()).toEqual(methods.sort());
    });

    it('refuses a non-member everywhere, as if the volume did not exist', async () => {
      const service = newSharedService(storageRoot, []);

      const outcomes = await codesOf(callEveryEntryPoint(service, OTHER_OWNER));

      const expected = Object.fromEntries(
        Object.keys(callEveryEntryPoint(service, OTHER_OWNER)).map((name) => [name, 'unknown-volume']),
      );
      expect(outcomes).toEqual(expected);
    });

    it('refuses every mutation for a read-only member, and allows every read', async () => {
      const service = newSharedService(storageRoot, [
        { volumeKey: SHARED, userId: OWNER, access: VolumeAccess.ReadOnly },
      ]);
      const [, shared] = await service.listVolumes(OWNER);
      await fs.writeFile(path.join(shared.filesPath, 'report.txt'), 'contents');

      const outcomes = await codesOf(callEveryEntryPoint(service, OWNER));

      expect(outcomes).toEqual({
        // Reads succeed, or fail on their own terms rather than on permission.
        getEntry: 'resolved',
        listEntries: 'resolved',
        openFile: 'resolved',
        openEntry: 'resolved',
        listTrash: 'resolved',
        // Every mutation is refused, and says so rather than pretending the volume is missing.
        createFolder: 'read-only-volume',
        writeFile: 'read-only-volume',
        moveEntry: 'read-only-volume',
        copyEntry: 'read-only-volume',
        deleteEntry: 'read-only-volume',
        trashEntry: 'read-only-volume',
        restoreFromTrash: 'read-only-volume',
        purgeFromTrash: 'read-only-volume',
        emptyTrash: 'read-only-volume',
      });
    });

    it('lets a read-write member work as if it were their own volume', async () => {
      const service = newSharedService(storageRoot, [
        { volumeKey: SHARED, userId: OWNER, access: VolumeAccess.ReadWrite },
      ]);

      const folder = await service.createFolder(OWNER, SHARED, '/documents');
      const entry = await service.writeFile(OWNER, SHARED, '/documents/report.txt', bytes('contents'));

      expect(folder).toMatchObject({ path: '/documents' });
      expect(entry).toMatchObject({ path: '/documents/report.txt', size: 8 });
    });

    it('does not list a shared volume a caller is not a member of', async () => {
      await expect(newSharedService(storageRoot, []).listVolumes(OTHER_OWNER)).resolves.toEqual([
        expect.objectContaining({ id: PRIVATE_VOLUME_ID }),
      ]);
    });
  });

  it('reports that file storage is not enabled when the domain is unconfigured', async () => {
    const disabled = new FileDomainService(newAccess(null), passthroughLocks, recordingIndex());

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

    const response = await new FilesController(service, noReconciliation, noMembership).getFileVolumes(asAuth(OWNER));

    expect(response).toEqual([
      { id: PRIVATE_VOLUME_ID, name: 'My files', kind: VolumeKind.Private, access: VolumeAccess.ReadWrite },
    ]);
    expect(JSON.stringify(response)).not.toContain('/data/drive');
  });

  it('lists folder entries for the authenticated user', async () => {
    const storageRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'immich-drive-entries-'));
    const service = new FileDomainService(
      newAccess(new VolumeRegistry({ storageRoot })),
      passthroughLocks,
      recordingIndex(),
    );
    const [volume] = await service.listVolumes(OWNER);
    await fs.mkdir(path.join(volume.filesPath, 'documents'));
    await fs.writeFile(path.join(volume.filesPath, 'documents', 'report.txt'), 'contents');

    const response = await new FilesController(service, noReconciliation, noMembership).getFileEntries(asAuth(OWNER), {
      volumeId: PRIVATE_VOLUME_ID,
      path: '/documents',
    });

    expect(response).toEqual([expect.objectContaining({ name: 'report.txt', path: '/documents/report.txt', size: 8 })]);
    expect(JSON.stringify(response)).not.toContain(storageRoot);

    await fs.rm(storageRoot, { recursive: true, force: true });
  });

  it('scopes the listing to the authenticated user', async () => {
    const service = { listVolumes: vi.fn().mockResolvedValue([]) } as unknown as FileDomainService;

    await new FilesController(service, noReconciliation, noMembership).getFileVolumes(asAuth(OWNER));

    expect(service.listVolumes).toHaveBeenCalledWith(OWNER);
  });
});
