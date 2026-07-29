import { Kysely } from 'kysely';
import { DriveEntryRecord, DriveIndexRepository } from 'src/extensions/files/drive-index.repository';
import { FileEntryType } from 'src/extensions/files/file-entry';
import { DriveEntryState } from 'src/extensions/files/index-state';
import { DB } from 'src/schema';
import { getKyselyDB } from 'test/utils';

/**
 * The index against a real PostgreSQL.
 *
 * These are the statements a mocked repository cannot check: a prefix rewrite, the `starts_with`
 * boundary, `coalesce` on identity, and the constraints. Every one of them has a failure mode that
 * looks perfectly reasonable in TypeScript — `LIKE` with an unescaped `%`, a subtree cut at a JavaScript
 * string offset — and only a database disagrees.
 */
let db: Kysely<DB>;
let sut: DriveIndexRepository;

const newOwner = async (): Promise<string> => {
  const { id } = await db
    .insertInto('user')
    .values({ email: `owner-${Math.random().toString(36).slice(2, 10)}@immich.test`, name: 'Owner' })
    .returning('id')
    .executeTakeFirstOrThrow();

  return id;
};

const newVolume = async (ownerId: string | null, key: string): Promise<string> =>
  sut.upsertVolume({ key, ownerId, volumeId: 'private', device: '66', inode: '1000', markerId: 'marker-a' });

const entry = (volumeId: string, entryPath: string, overrides: Partial<DriveEntryRecord> = {}): DriveEntryRecord => {
  const separator = entryPath.lastIndexOf('/');

  return {
    volumeId,
    path: entryPath,
    parentPath: separator === 0 ? '/' : entryPath.slice(0, separator),
    name: entryPath.slice(separator + 1),
    type: FileEntryType.File,
    size: 8,
    modifiedAt: new Date('2026-07-29T10:00:00.000Z'),
    ...overrides,
  };
};

const paths = async (volumeId: string): Promise<Array<{ path: string; parentPath: string; name: string }>> =>
  db
    .selectFrom('drive_entry')
    .select(['path', 'parentPath', 'name'])
    .where('volumeId', '=', volumeId)
    .orderBy('path')
    .execute();

beforeAll(async () => {
  db = await getKyselyDB();
  sut = new DriveIndexRepository(db);
});

describe(DriveIndexRepository.name, () => {
  describe('upsertVolume', () => {
    it('returns the same row for the same key rather than adding another', async () => {
      const ownerId = await newOwner();

      const first = await newVolume(ownerId, `${ownerId}:private`);
      const second = await newVolume(ownerId, `${ownerId}:private`);

      expect(second).toBe(first);
      await expect(
        db
          .selectFrom('drive_volume')
          .select((eb) => eb.fn.countAll<number>().as('count'))
          .where('key', '=', `${ownerId}:private`)
          .executeTakeFirstOrThrow(),
      ).resolves.toEqual({ count: 1 });
    });

    it('keeps the identity it recorded first, so a swapped root stays visible as a difference', async () => {
      const ownerId = await newOwner();
      const key = `${ownerId}:private`;
      await newVolume(ownerId, key);

      await sut.upsertVolume({
        key,
        ownerId,
        volumeId: 'private',
        device: '99',
        inode: '2000',
        markerId: 'marker-b',
      });

      await expect(
        db
          .selectFrom('drive_volume')
          .select(['device', 'inode', 'markerId', 'state'])
          .where('key', '=', key)
          .executeTakeFirstOrThrow(),
      ).resolves.toEqual({ device: '66', inode: '1000', markerId: 'marker-a', state: 'unverified' });
    });

    it('accepts a shared volume, which has no owner', async () => {
      const volumeId = await newVolume(null, 'shared:family');

      await expect(
        db.selectFrom('drive_volume').select('ownerId').where('id', '=', volumeId).executeTakeFirstOrThrow(),
      ).resolves.toEqual({ ownerId: null });
    });
  });

  describe('upsertEntry', () => {
    it('records an entry as present', async () => {
      const volumeId = await newVolume(await newOwner(), `v-${Math.random()}`);

      await sut.upsertEntry(entry(volumeId, '/documents/report.txt'));

      await expect(
        db
          .selectFrom('drive_entry')
          .select(['path', 'parentPath', 'name', 'type', 'size', 'state'])
          .where('volumeId', '=', volumeId)
          .executeTakeFirstOrThrow(),
      ).resolves.toEqual({
        path: '/documents/report.txt',
        parentPath: '/documents',
        name: 'report.txt',
        type: FileEntryType.File,
        size: 8,
        state: DriveEntryState.Present,
      });
    });

    it('updates the row a second write describes instead of adding one', async () => {
      const volumeId = await newVolume(await newOwner(), `v-${Math.random()}`);
      await sut.upsertEntry(entry(volumeId, '/report.txt'));

      await sut.upsertEntry(entry(volumeId, '/report.txt', { size: 4096 }));

      const rows = await db
        .selectFrom('drive_entry')
        .select(['size', 'state'])
        .where('volumeId', '=', volumeId)
        .execute();
      expect(rows).toEqual([{ size: 4096, state: DriveEntryState.Present }]);
    });

    it('brings a row the previous pass marked missing back to present', async () => {
      const volumeId = await newVolume(await newOwner(), `v-${Math.random()}`);
      await sut.upsertEntry(entry(volumeId, '/report.txt'));
      await db
        .updateTable('drive_entry')
        .set({ state: DriveEntryState.Missing })
        .where('volumeId', '=', volumeId)
        .execute();

      await sut.upsertEntry(entry(volumeId, '/report.txt'));

      await expect(
        db.selectFrom('drive_entry').select('state').where('volumeId', '=', volumeId).executeTakeFirstOrThrow(),
      ).resolves.toEqual({ state: DriveEntryState.Present });
    });

    it('refuses two rows for the same path in the same volume', async () => {
      const volumeId = await newVolume(await newOwner(), `v-${Math.random()}`);
      await sut.upsertEntry(entry(volumeId, '/report.txt'));

      await expect(
        db
          .insertInto('drive_entry')
          .values({ ...entry(volumeId, '/report.txt'), state: DriveEntryState.Present })
          .execute(),
      ).rejects.toThrow();
    });

    it('lets two volumes hold the same path', async () => {
      const mine = await newVolume(await newOwner(), `mine-${Math.random()}`);
      const yours = await newVolume(await newOwner(), `yours-${Math.random()}`);

      await sut.upsertEntry(entry(mine, '/report.txt'));
      await sut.upsertEntry(entry(yours, '/report.txt'));

      await expect(paths(mine)).resolves.toHaveLength(1);
      await expect(paths(yours)).resolves.toHaveLength(1);
    });
  });

  describe('deleteSubtree', () => {
    it('removes the entry and its descendants and nothing else', async () => {
      const volumeId = await newVolume(await newOwner(), `v-${Math.random()}`);
      for (const entryPath of ['/documents', '/documents/report.txt', '/documents/2026/q3.txt', '/other.txt']) {
        await sut.upsertEntry(entry(volumeId, entryPath));
      }

      await sut.deleteSubtree(volumeId, '/documents');

      await expect(paths(volumeId)).resolves.toEqual([expect.objectContaining({ path: '/other.txt' })]);
    });

    it('leaves a sibling whose name merely starts with the same characters', async () => {
      const volumeId = await newVolume(await newOwner(), `v-${Math.random()}`);
      for (const entryPath of ['/doc', '/doc/a.txt', '/documents', '/documents/b.txt']) {
        await sut.upsertEntry(entry(volumeId, entryPath));
      }

      await sut.deleteSubtree(volumeId, '/doc');

      await expect(paths(volumeId)).resolves.toEqual([
        expect.objectContaining({ path: '/documents' }),
        expect.objectContaining({ path: '/documents/b.txt' }),
      ]);
    });

    it('treats a wildcard in a name as an ordinary character', async () => {
      const volumeId = await newVolume(await newOwner(), `v-${Math.random()}`);
      // Under LIKE these two would match each other; under starts_with they do not.
      for (const entryPath of ['/50%', '/50%/a.txt', '/50off', '/5_x', '/51x']) {
        await sut.upsertEntry(entry(volumeId, entryPath));
      }

      await sut.deleteSubtree(volumeId, '/50%');
      await sut.deleteSubtree(volumeId, '/5_x');

      await expect(paths(volumeId)).resolves.toEqual([
        expect.objectContaining({ path: '/50off' }),
        expect.objectContaining({ path: '/51x' }),
      ]);
    });

    it('leaves another volume alone', async () => {
      const mine = await newVolume(await newOwner(), `mine-${Math.random()}`);
      const yours = await newVolume(await newOwner(), `yours-${Math.random()}`);
      await sut.upsertEntry(entry(mine, '/documents'));
      await sut.upsertEntry(entry(yours, '/documents'));

      await sut.deleteSubtree(mine, '/documents');

      await expect(paths(mine)).resolves.toEqual([]);
      await expect(paths(yours)).resolves.toHaveLength(1);
    });
  });

  describe('moveSubtree', () => {
    it('rewrites the entry and every descendant', async () => {
      const volumeId = await newVolume(await newOwner(), `v-${Math.random()}`);
      for (const entryPath of ['/documents', '/documents/report.txt', '/documents/2026', '/documents/2026/q3.txt']) {
        await sut.upsertEntry(entry(volumeId, entryPath));
      }

      await sut.moveSubtree({
        volumeId,
        sourcePath: '/documents',
        entry: entry(volumeId, '/archive', { type: FileEntryType.Directory }),
      });

      await expect(paths(volumeId)).resolves.toEqual([
        { path: '/archive', parentPath: '/', name: 'archive' },
        // A direct child's parent becomes the new path exactly, not the new path plus an empty segment.
        { path: '/archive/2026', parentPath: '/archive', name: '2026' },
        { path: '/archive/2026/q3.txt', parentPath: '/archive/2026', name: 'q3.txt' },
        { path: '/archive/report.txt', parentPath: '/archive', name: 'report.txt' },
      ]);
    });

    it('renames in place, changing the name the index holds', async () => {
      const volumeId = await newVolume(await newOwner(), `v-${Math.random()}`);
      await sut.upsertEntry(entry(volumeId, '/documents/report.txt'));

      await sut.moveSubtree({
        volumeId,
        sourcePath: '/documents/report.txt',
        entry: entry(volumeId, '/documents/final.txt'),
      });

      await expect(paths(volumeId)).resolves.toEqual([
        { path: '/documents/final.txt', parentPath: '/documents', name: 'final.txt' },
      ]);
    });

    it('slices the prefix by characters, not by JavaScript string offsets', async () => {
      const volumeId = await newVolume(await newOwner(), `v-${Math.random()}`);
      // '📁' is one character to PostgreSQL and two UTF-16 units to JavaScript, so a cut computed in
      // JavaScript would corrupt every descendant path here.
      for (const entryPath of ['/📁', '/📁/report.txt', '/📁/2026/q3.txt']) {
        await sut.upsertEntry(entry(volumeId, entryPath));
      }

      await sut.moveSubtree({
        volumeId,
        sourcePath: '/📁',
        entry: entry(volumeId, '/archive', { type: FileEntryType.Directory }),
      });

      await expect(paths(volumeId)).resolves.toEqual([
        { path: '/archive', parentPath: '/', name: 'archive' },
        { path: '/archive/2026/q3.txt', parentPath: '/archive/2026', name: 'q3.txt' },
        { path: '/archive/report.txt', parentPath: '/archive', name: 'report.txt' },
      ]);
    });

    it('replaces a stale row sitting at the destination', async () => {
      const volumeId = await newVolume(await newOwner(), `v-${Math.random()}`);
      await sut.upsertEntry(entry(volumeId, '/report.txt'));
      // The filesystem refuses to move onto an existing entry, so a row here is left over from
      // something the index never saw removed. It must not turn the move into a unique violation.
      await sut.upsertEntry(entry(volumeId, '/final.txt', { size: 1 }));
      await sut.upsertEntry(entry(volumeId, '/final.txt/ghost.txt', { size: 1 }));

      await sut.moveSubtree({ volumeId, sourcePath: '/report.txt', entry: entry(volumeId, '/final.txt') });

      await expect(paths(volumeId)).resolves.toEqual([{ path: '/final.txt', parentPath: '/', name: 'final.txt' }]);
      await expect(
        db.selectFrom('drive_entry').select('size').where('volumeId', '=', volumeId).executeTakeFirstOrThrow(),
      ).resolves.toEqual({ size: 8 });
    });

    it('moves a subtree that has no rows at all', async () => {
      const volumeId = await newVolume(await newOwner(), `v-${Math.random()}`);

      await sut.moveSubtree({
        volumeId,
        sourcePath: '/never-indexed',
        entry: entry(volumeId, '/archive', { type: FileEntryType.Directory }),
      });

      await expect(paths(volumeId)).resolves.toEqual([{ path: '/archive', parentPath: '/', name: 'archive' }]);
    });

    it('leaves an identically named subtree in another volume untouched', async () => {
      const mine = await newVolume(await newOwner(), `mine-${Math.random()}`);
      const yours = await newVolume(await newOwner(), `yours-${Math.random()}`);
      await sut.upsertEntry(entry(mine, '/documents'));
      await sut.upsertEntry(entry(mine, '/documents/report.txt'));
      await sut.upsertEntry(entry(yours, '/documents'));
      await sut.upsertEntry(entry(yours, '/documents/report.txt'));

      await sut.moveSubtree({
        volumeId: mine,
        sourcePath: '/documents',
        entry: entry(mine, '/archive', { type: FileEntryType.Directory }),
      });

      await expect(paths(yours)).resolves.toEqual([
        expect.objectContaining({ path: '/documents' }),
        expect.objectContaining({ path: '/documents/report.txt' }),
      ]);
    });
  });

  describe('lifecycle', () => {
    it('drops the entries of a volume that is removed', async () => {
      const volumeId = await newVolume(await newOwner(), `v-${Math.random()}`);
      await sut.upsertEntry(entry(volumeId, '/report.txt'));

      await db.deleteFrom('drive_volume').where('id', '=', volumeId).execute();

      await expect(paths(volumeId)).resolves.toEqual([]);
    });

    it('drops the volume of an owner that is removed', async () => {
      const ownerId = await newOwner();
      const volumeId = await newVolume(ownerId, `${ownerId}:private`);
      await sut.upsertEntry(entry(volumeId, '/report.txt'));

      await db.deleteFrom('user').where('id', '=', ownerId).execute();

      await expect(
        db.selectFrom('drive_volume').select('id').where('id', '=', volumeId).executeTakeFirst(),
      ).resolves.toBeUndefined();
      await expect(paths(volumeId)).resolves.toEqual([]);
    });
  });
});
