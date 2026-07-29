import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  DriveEntryRecord,
  DriveEntryRow,
  DriveIndexRepository,
  DriveVolumeRecord,
  DriveVolumeRow,
} from 'src/extensions/files/drive-index.repository';
import { DriveIndexService } from 'src/extensions/files/drive-index.service';
import { DriveConfig } from 'src/extensions/files/files.config';
import { DriveEntryState, DriveVolumeState } from 'src/extensions/files/index-state';
import { ReconciliationService } from 'src/extensions/files/reconciliation.service';
import { PRIVATE_VOLUME_ID } from 'src/extensions/files/volume';
import { VolumeHealthReason } from 'src/extensions/files/volume-health';
import { VOLUME_MARKER_NAME } from 'src/extensions/files/volume-identity';
import { VolumeRegistry } from 'src/extensions/files/volume.registry';
import { LoggingRepository } from 'src/repositories/logging.repository';

const OWNER = '5f2b9c4e-0000-4000-8000-000000000001';

interface StoredEntry extends DriveEntryRecord {
  state: DriveEntryState;
}

/**
 * The index, in memory.
 *
 * Deliberately a fake rather than a mock: reconciliation is a conversation between a tree and a set of
 * rows, and assertions about which methods were called would say nothing about whether the rows end up
 * describing the tree. The statements themselves are covered against real PostgreSQL in the medium
 * suite, so what is reproduced here is only their effect.
 */
class FakeIndex {
  volumes = new Map<string, DriveVolumeRow & { key: string }>();
  entries = new Map<string, StoredEntry>();
  private nextId = 1;

  asRepository(): DriveIndexRepository {
    return this as unknown as DriveIndexRepository;
  }

  private key(volumeId: string, entryPath: string): string {
    return `${volumeId}\0${entryPath}`;
  }

  upsertVolume(volume: DriveVolumeRecord): Promise<string> {
    const existing = this.volumes.get(volume.key);
    if (existing) {
      return Promise.resolve(existing.id);
    }

    const id = `volume-${this.nextId++}`;
    this.volumes.set(volume.key, {
      key: volume.key,
      id,
      device: volume.device,
      inode: volume.inode,
      markerId: volume.markerId,
      state: DriveVolumeState.Unverified,
      checkpoint: null,
      scannedAt: null,
    });

    return Promise.resolve(id);
  }

  getVolume(key: string): Promise<DriveVolumeRow | undefined> {
    return Promise.resolve(this.volumes.get(key));
  }

  countEntries(volumeId: string): Promise<number> {
    return Promise.resolve(
      this.entries
        .values()
        .filter((entry) => entry.volumeId === volumeId)
        .toArray().length,
    );
  }

  getChildren(volumeId: string, parentPath: string): Promise<DriveEntryRow[]> {
    const rows = this.entries
      .values()
      .filter((entry) => entry.volumeId === volumeId && entry.parentPath === parentPath)
      .map(({ path: entryPath, name, type, size, modifiedAt, state }) => ({
        path: entryPath,
        name,
        type,
        size,
        modifiedAt,
        state,
      }))
      .toArray()
      .sort((left, right) => left.name.localeCompare(right.name));

    return Promise.resolve(rows);
  }

  upsertEntry(entry: DriveEntryRecord): Promise<void> {
    // The foreign key is reproduced on purpose. A fake that accepts a row against a volume that no
    // longer exists would have hidden a real defect: a pass that trusted a remembered row id after the
    // index was dropped failed on exactly this constraint, against a real database, mid-walk.
    if (this.volumes.values().every((volume) => volume.id !== entry.volumeId)) {
      return Promise.reject(new Error('insert or update on table "drive_entry" violates foreign key constraint'));
    }

    this.entries.set(this.key(entry.volumeId, entry.path), { ...entry, state: DriveEntryState.Present });
    return Promise.resolve();
  }

  setEntryState(volumeId: string, entryPath: string, state: DriveEntryState): Promise<void> {
    const entry = this.entries.get(this.key(volumeId, entryPath));
    if (entry) {
      entry.state = state;
    }
    return Promise.resolve();
  }

  markSubtreeMissing(volumeId: string, entryPath: string): Promise<number> {
    let marked = 0;
    for (const entry of this.entries.values()) {
      if (entry.volumeId !== volumeId) {
        continue;
      }
      if (entry.path === entryPath || entry.path.startsWith(`${entryPath}/`)) {
        entry.state = DriveEntryState.Missing;
        marked++;
      }
    }

    return Promise.resolve(marked);
  }

  setCheckpoint(volumeId: string, checkpoint: string | null): Promise<void> {
    const volume = this.volumes.values().find((candidate) => candidate.id === volumeId);
    if (volume) {
      this.volumes.set(volume.key, { ...volume, checkpoint });
    }

    return Promise.resolve();
  }

  recordPass(volumeId: string, pass: { state: DriveVolumeState; completed: boolean }): Promise<void> {
    const volume = this.volumes.values().find((candidate) => candidate.id === volumeId);
    if (volume) {
      this.volumes.set(volume.key, {
        ...volume,
        state: pass.state,
        ...(pass.completed && { scannedAt: new Date(), checkpoint: null }),
      });
    }

    return Promise.resolve();
  }

  /** Every row, as `path → state`, which is what most assertions here are actually about. */
  states(): Record<string, DriveEntryState> {
    return Object.fromEntries(this.entries.values().map((entry) => [entry.path, entry.state]));
  }

  row(entryPath: string): StoredEntry | undefined {
    return this.entries.values().find((entry) => entry.path === entryPath);
  }
}

/** The tree the checkpoint tests walk. Four directories, so a limit can stop part-way through it. */
const buildTree = async (filesPath: string) => {
  for (const directory of ['alpha', 'alpha/inner', 'beta', 'gamma']) {
    await fs.mkdir(path.join(filesPath, directory), { recursive: true });
  }

  for (const [file, content] of [
    ['alpha/a.txt', 'a'],
    ['alpha/inner/deep.txt', 'd'],
    ['beta/b.txt', 'b'],
    ['gamma/g.txt', 'g'],
  ]) {
    await fs.writeFile(path.join(filesPath, file), content);
  }
};

/**
 * Writes a file and moves it to the trash, optionally backdating its manifest.
 *
 * Backdating is how retention becomes testable at all: a record's age lives in its manifest, and the
 * alternative is waiting a configured number of days.
 */
const trashEntry = async (registry: VolumeRegistry, filesPath: string, name: string, ageInDays?: number) => {
  await fs.writeFile(path.join(filesPath, name), 'contents');
  const { adapter } = await registry.getTarget(OWNER, PRIVATE_VOLUME_ID);
  const record = await adapter.trash(`/${name}`);

  if (ageInDays !== undefined) {
    const [volume] = registry.describeVolumes(OWNER);
    const manifestPath = path.join(volume.trashPath, `${record.id}.json`);
    const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
    manifest.deletedAt = new Date(Date.now() - ageInDays * 24 * 60 * 60 * 1000).toISOString();
    await fs.writeFile(manifestPath, JSON.stringify(manifest));
  }

  return record;
};

const newLogger = () => ({ setContext: vi.fn(), warn: vi.fn(), log: vi.fn() }) as unknown as LoggingRepository;

describe(ReconciliationService.name, () => {
  let storageRoot: string;
  let index: FakeIndex;
  let registry: VolumeRegistry;
  let indexService: DriveIndexService;
  let sut: ReconciliationService;
  let filesPath: string;
  let volumeRoot: string;

  const configure = (config: Partial<Extract<DriveConfig, { enabled: true }>> = {}) => {
    sut = new ReconciliationService(
      registry,
      { enabled: true, root: storageRoot, ...config },
      index.asRepository(),
      indexService,
      newLogger(),
    );
  };

  /** Brings the volume into the state an ordinary first write leaves it in: row, identity, marker. */
  const initialise = async () => {
    const [volume] = registry.describeVolumes(OWNER);
    await indexService.recordEntry(OWNER, volume, {
      path: '/seed.txt',
      name: 'seed.txt',
      type: 'file' as never,
      size: 1,
      modifiedAt: new Date(),
    });
    index.entries.clear();
  };

  const write = async (relativePath: string, content: string) => {
    await fs.writeFile(path.join(filesPath, relativePath), content);
  };

  const indexFromDisk = async () => {
    const report = await sut.reconcileVolume(OWNER, PRIVATE_VOLUME_ID);
    expect(report.state).toBe(DriveVolumeState.Healthy);
    return report;
  };

  beforeEach(async () => {
    storageRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'immich-drive-reconcile-'));
    index = new FakeIndex();
    registry = new VolumeRegistry({ storageRoot });
    indexService = new DriveIndexService(index.asRepository(), newLogger());
    const [volume] = registry.describeVolumes(OWNER);
    volumeRoot = volume.rootPath;
    filesPath = volume.filesPath;
    // Provision through the registry, the way a first request would.
    await registry.getTarget(OWNER, PRIVATE_VOLUME_ID);
    configure();
  });

  afterEach(async () => {
    await fs.rm(storageRoot, { recursive: true, force: true });
  });

  describe('health', () => {
    it('reports a volume nobody has written to as unverified', async () => {
      const [report] = await sut.inspectVolumes(OWNER);

      expect(report).toMatchObject({
        volumeId: PRIVATE_VOLUME_ID,
        state: DriveVolumeState.Unverified,
        reason: VolumeHealthReason.NotIndexed,
        indexedEntries: 0,
      });
    });

    it('reports a volume that agrees with the index as healthy', async () => {
      await initialise();

      const [report] = await sut.inspectVolumes(OWNER);

      expect(report).toMatchObject({ state: DriveVolumeState.Healthy, reason: null });
    });

    it('never creates the marker it is checking for', async () => {
      await initialise();
      await fs.rm(path.join(volumeRoot, VOLUME_MARKER_NAME));

      const [report] = await sut.inspectVolumes(OWNER);

      expect(report).toMatchObject({ state: DriveVolumeState.Unhealthy, reason: VolumeHealthReason.MarkerMissing });
      // The check must not repair what it detects, or a second look would always say healthy.
      await expect(fs.access(path.join(volumeRoot, VOLUME_MARKER_NAME))).rejects.toThrow();
    });

    it('reports a marker that no longer matches the recorded one', async () => {
      await initialise();
      await fs.writeFile(
        path.join(volumeRoot, VOLUME_MARKER_NAME),
        JSON.stringify({ version: 1, markerId: '00000000-0000-4000-8000-000000000000' }),
      );

      const [report] = await sut.inspectVolumes(OWNER);

      expect(report).toMatchObject({ reason: VolumeHealthReason.MarkerMismatch });
    });

    it('reports a marker that cannot be read as a mismatch rather than as agreement', async () => {
      await initialise();
      await fs.writeFile(path.join(volumeRoot, VOLUME_MARKER_NAME), 'not a marker');

      const [report] = await sut.inspectVolumes(OWNER);

      expect(report).toMatchObject({ reason: VolumeHealthReason.MarkerMismatch });
    });

    it('reports a root whose filesystem identity changed', async () => {
      await initialise();
      const [volume] = registry.describeVolumes(OWNER);
      const row = index.volumes.get(`${OWNER}:private`);
      index.volumes.set(`${OWNER}:private`, { ...row!, inode: '999999999' });
      void volume;

      const [report] = await sut.inspectVolumes(OWNER);

      expect(report).toMatchObject({ reason: VolumeHealthReason.IdentityChanged });
    });

    it('reports a root it cannot read at all', async () => {
      await initialise();
      await fs.rm(volumeRoot, { recursive: true, force: true });

      const [report] = await sut.inspectVolumes(OWNER);

      expect(report).toMatchObject({ reason: VolumeHealthReason.RootUnreadable });
    });

    /** The failure the whole task exists for: a vanished mount must not read as a mass deletion. */
    it('reports an empty tree against a populated index rather than accepting it', async () => {
      await write('report.txt', 'contents');
      await initialise();
      await indexFromDisk();
      expect(await index.countEntries('volume-1')).toBe(1);

      await fs.rm(path.join(filesPath, 'report.txt'));

      const [report] = await sut.inspectVolumes(OWNER);

      expect(report).toMatchObject({
        state: DriveVolumeState.Unhealthy,
        reason: VolumeHealthReason.RootEmptyWhileIndexed,
      });
    });
  });

  describe('refusal', () => {
    it('changes nothing on an unhealthy volume', async () => {
      await write('report.txt', 'contents');
      await initialise();
      await indexFromDisk();
      const before = index.states();

      await fs.rm(path.join(volumeRoot, VOLUME_MARKER_NAME));
      const report = await sut.reconcileVolume(OWNER, PRIVATE_VOLUME_ID);

      expect(report).toMatchObject({
        state: DriveVolumeState.Unhealthy,
        reason: VolumeHealthReason.MarkerMissing,
        completed: false,
        added: 0,
        missing: 0,
        conflicted: 0,
      });
      expect(index.states()).toEqual(before);
    });

    it('marks nothing missing when the tree has vanished', async () => {
      await write('a.txt', 'a');
      await write('b.txt', 'b');
      await initialise();
      await indexFromDisk();

      await fs.rm(path.join(filesPath, 'a.txt'));
      await fs.rm(path.join(filesPath, 'b.txt'));
      const report = await sut.reconcileVolume(OWNER, PRIVATE_VOLUME_ID);

      expect(report.reason).toBe(VolumeHealthReason.RootEmptyWhileIndexed);
      expect(index.states()).toEqual({
        '/a.txt': DriveEntryState.Present,
        '/b.txt': DriveEntryState.Present,
      });
    });

    it('keeps the pending checkpoint so a volume that comes back resumes', async () => {
      await fs.mkdir(path.join(filesPath, 'one'));
      await fs.mkdir(path.join(filesPath, 'two'));
      await initialise();
      await sut.reconcileVolume(OWNER, PRIVATE_VOLUME_ID, 1);
      const pending = index.volumes.get(`${OWNER}:private`)?.checkpoint;
      expect(pending).toBe('/');

      await fs.rm(path.join(volumeRoot, VOLUME_MARKER_NAME));
      const report = await sut.reconcileVolume(OWNER, PRIVATE_VOLUME_ID);

      expect(report.stoppedAt).toBe('/');
      expect(index.volumes.get(`${OWNER}:private`)?.checkpoint).toBe('/');
    });
  });

  describe('discovery', () => {
    it('indexes a volume that has never been written to through the application', async () => {
      await fs.mkdir(path.join(filesPath, 'documents'));
      await write('documents/report.txt', 'contents');
      await write('note.md', 'hello');

      const report = await sut.reconcileVolume(OWNER, PRIVATE_VOLUME_ID);

      expect(report).toMatchObject({ state: DriveVolumeState.Healthy, completed: true, added: 3 });
      expect(index.states()).toEqual({
        '/documents': DriveEntryState.Present,
        '/documents/report.txt': DriveEntryState.Present,
        '/note.md': DriveEntryState.Present,
      });
      expect(index.row('/documents/report.txt')).toMatchObject({ parentPath: '/documents', size: 8 });
    });

    it('adds a file created outside the application', async () => {
      await initialise();
      await indexFromDisk();

      await write('outside.txt', 'made over ssh');
      const report = await indexFromDisk();

      expect(report.added).toBe(1);
      expect(index.row('/outside.txt')).toMatchObject({ size: 13, state: DriveEntryState.Present });
    });

    it('adds nothing on a second pass over an unchanged tree', async () => {
      await fs.mkdir(path.join(filesPath, 'documents'));
      await write('documents/report.txt', 'contents');
      await indexFromDisk();

      const report = await indexFromDisk();

      expect(report).toMatchObject({ added: 0, conflicted: 0, missing: 0, recovered: 0 });
    });
  });

  describe('rebuilding', () => {
    it('rebuilds after the index was dropped, without trusting a remembered row', async () => {
      await fs.mkdir(path.join(filesPath, 'documents'));
      await write('documents/report.txt', 'contents');
      await write('note.md', 'hello');
      await indexFromDisk();

      // The documented downgrade: the Drive tables are dropped and re-created while the process keeps
      // running, so every row id this process remembers is now meaningless.
      index.volumes.clear();
      index.entries.clear();

      const report = await indexFromDisk();

      expect(report).toMatchObject({ added: 3, completed: true });
      expect(index.volumes.size).toBe(1);
      expect(Object.keys(index.states()).sort()).toEqual(['/documents', '/documents/report.txt', '/note.md']);
    });

    it('keeps the marker, so a rebuilt index describes the same volume', async () => {
      await write('report.txt', 'contents');
      await indexFromDisk();
      const before = index.volumes.get(`${OWNER}:private`);

      index.volumes.clear();
      index.entries.clear();
      await indexFromDisk();

      const after = index.volumes.get(`${OWNER}:private`);
      // Identity is re-derived from the volume itself, and the marker file was never rewritten, so the
      // rebuilt row identifies the same volume rather than a new one.
      expect(after).toMatchObject({ device: before?.device, inode: before?.inode, markerId: before?.markerId });
    });
  });

  describe('missing', () => {
    it('marks a removed file rather than deleting its row', async () => {
      await write('report.txt', 'contents');
      await write('kept.txt', 'still here');
      await indexFromDisk();

      await fs.rm(path.join(filesPath, 'report.txt'));
      const report = await indexFromDisk();

      expect(report.missing).toBe(1);
      expect(index.states()).toEqual({
        '/report.txt': DriveEntryState.Missing,
        '/kept.txt': DriveEntryState.Present,
      });
    });

    it('marks a removed folder and everything under it', async () => {
      await fs.mkdir(path.join(filesPath, 'documents/2026'), { recursive: true });
      await write('documents/report.txt', 'contents');
      await write('documents/2026/q3.txt', 'quarter');
      await write('kept.txt', 'still here');
      await indexFromDisk();

      await fs.rm(path.join(filesPath, 'documents'), { recursive: true });
      const report = await indexFromDisk();

      // Descendants live in directories the walk can no longer visit, so they are marked from above.
      expect(report.missing).toBe(4);
      expect(index.states()).toEqual({
        '/documents': DriveEntryState.Missing,
        '/documents/report.txt': DriveEntryState.Missing,
        '/documents/2026': DriveEntryState.Missing,
        '/documents/2026/q3.txt': DriveEntryState.Missing,
        '/kept.txt': DriveEntryState.Present,
      });
    });

    it('returns a row to present when the file comes back', async () => {
      await write('report.txt', 'contents');
      await write('kept.txt', 'still here');
      await indexFromDisk();
      const stashed = path.join(storageRoot, 'stashed.txt');
      const original = path.join(filesPath, 'report.txt');

      // Moved out and back rather than deleted and rewritten: this is the shape of the failure that
      // matters — a mount that went away and returned with the same file — and it keeps the entry's
      // modification time exactly, which recreating the file cannot. `fs.utimes` cannot restore a
      // millisecond-accurate time reliably: the value goes through a float number of seconds, so it can
      // land a millisecond low, and the pass would then correctly report a conflict for the wrong reason.
      await fs.rename(original, stashed);
      await indexFromDisk();
      expect(index.row('/report.txt')?.state).toBe(DriveEntryState.Missing);

      await fs.rename(stashed, original);
      const report = await indexFromDisk();

      expect(report.recovered).toBe(1);
      expect(index.row('/report.txt')?.state).toBe(DriveEntryState.Present);
    });

    it('treats a file rewritten with the same content as a conflict, not a recovery', async () => {
      await write('report.txt', 'contents');
      await write('kept.txt', 'still here');
      await indexFromDisk();

      await fs.rm(path.join(filesPath, 'report.txt'));
      await indexFromDisk();
      await write('report.txt', 'contents');
      const report = await indexFromDisk();

      // Same bytes, new modification time. The server has no checksum to tell "the same file came back"
      // from "something wrote here", so it says what it can prove: this row no longer describes the file.
      expect(report).toMatchObject({ recovered: 0, conflicted: 1 });
      expect(index.row('/report.txt')?.state).toBe(DriveEntryState.Conflicted);
    });
  });

  describe('conflicts', () => {
    it('marks a file whose size changed, and does not adopt the new size', async () => {
      await write('report.txt', 'contents');
      await write('kept.txt', 'still here');
      await indexFromDisk();

      await write('report.txt', 'contents, much longer now');
      const report = await indexFromDisk();

      expect(report.conflicted).toBe(1);
      expect(index.row('/report.txt')).toMatchObject({ size: 8, state: DriveEntryState.Conflicted });
    });

    it('marks a file whose modification time changed', async () => {
      await write('report.txt', 'contents');
      await indexFromDisk();

      const future = new Date(Date.now() + 60_000);
      await fs.utimes(path.join(filesPath, 'report.txt'), future, future);
      const report = await indexFromDisk();

      expect(report.conflicted).toBe(1);
    });

    it('marks a path whose kind changed', async () => {
      await write('report.txt', 'contents');
      await indexFromDisk();

      await fs.rm(path.join(filesPath, 'report.txt'));
      await fs.mkdir(path.join(filesPath, 'report.txt'));
      const report = await indexFromDisk();

      expect(report.conflicted).toBe(1);
      expect(index.row('/report.txt')).toMatchObject({ type: 'file', state: DriveEntryState.Conflicted });
    });

    it('reports nothing on a second pass over the same conflict, and leaves the row alone', async () => {
      await write('report.txt', 'contents');
      await indexFromDisk();
      await write('report.txt', 'changed');

      const first = await indexFromDisk();
      const second = await indexFromDisk();

      // Counts are what a pass changed, so a volume nobody has touched since reports zeros. The state
      // itself persists — only the reporting is per-pass.
      expect(first.conflicted).toBe(1);
      expect(second).toMatchObject({ added: 0, conflicted: 0, missing: 0, recovered: 0 });
      expect(index.row('/report.txt')?.state).toBe(DriveEntryState.Conflicted);
    });

    it('reports nothing on a second pass over an entry that is still gone', async () => {
      await write('report.txt', 'contents');
      await write('kept.txt', 'still here');
      await indexFromDisk();
      await fs.rm(path.join(filesPath, 'report.txt'));

      const first = await indexFromDisk();
      const second = await indexFromDisk();

      expect(first.missing).toBe(1);
      expect(second.missing).toBe(0);
      expect(index.row('/report.txt')?.state).toBe(DriveEntryState.Missing);
    });

    /**
     * A folder's own size and modification time change whenever anything inside it changes, so comparing
     * them would mark every folder on the path to a new file as conflicted.
     */
    it('does not conflict a folder because something inside it changed', async () => {
      await fs.mkdir(path.join(filesPath, 'documents'));
      await write('documents/report.txt', 'contents');
      await indexFromDisk();

      await write('documents/added.txt', 'new file');
      const report = await indexFromDisk();

      expect(report).toMatchObject({ added: 1, conflicted: 0 });
      expect(index.row('/documents')?.state).toBe(DriveEntryState.Present);
    });

    it('clears a conflict when the application writes the file itself', async () => {
      await write('report.txt', 'contents');
      await indexFromDisk();
      await write('report.txt', 'changed outside');
      await indexFromDisk();
      expect(index.row('/report.txt')?.state).toBe(DriveEntryState.Conflicted);

      const [volume] = registry.describeVolumes(OWNER);
      const { adapter } = await registry.getTarget(OWNER, PRIVATE_VOLUME_ID);
      const entry = await adapter.stat('/report.txt');
      await indexService.recordEntry(OWNER, volume, entry!);

      expect(index.row('/report.txt')?.state).toBe(DriveEntryState.Present);
    });
  });

  describe('checkpoints', () => {
    it('stops at its limit and records where to resume', async () => {
      await buildTree(filesPath);

      const first = await sut.reconcileVolume(OWNER, PRIVATE_VOLUME_ID, 2);

      expect(first).toMatchObject({ completed: false, directories: 2, stoppedAt: '/alpha' });
      expect(index.volumes.get(`${OWNER}:private`)?.checkpoint).toBe('/alpha');
      // Only the root and /alpha were reconciled, so nothing below /alpha/inner is known yet.
      expect(Object.keys(index.states()).sort()).toEqual(['/alpha', '/alpha/a.txt', '/alpha/inner', '/beta', '/gamma']);
    });

    it('resumes rather than restarting, and finishes the tree', async () => {
      await buildTree(filesPath);
      const first = await sut.reconcileVolume(OWNER, PRIVATE_VOLUME_ID, 2);

      const second = await sut.reconcileVolume(OWNER, PRIVATE_VOLUME_ID);

      expect(second).toMatchObject({ completed: true, resumedFrom: '/alpha', stoppedAt: null });
      // The directories the first pass finished are not reconciled again.
      expect(second.directories).toBe(5 - first.directories);
      expect(Object.keys(index.states()).sort()).toEqual([
        '/alpha',
        '/alpha/a.txt',
        '/alpha/inner',
        '/alpha/inner/deep.txt',
        '/beta',
        '/beta/b.txt',
        '/gamma',
        '/gamma/g.txt',
      ]);
      expect(index.volumes.get(`${OWNER}:private`)?.checkpoint).toBeNull();
    });

    it('walks a tree one directory at a time and still ends up complete', async () => {
      await buildTree(filesPath);

      let passes = 0;
      let report = await sut.reconcileVolume(OWNER, PRIVATE_VOLUME_ID, 1);
      while (!report.completed && passes < 20) {
        report = await sut.reconcileVolume(OWNER, PRIVATE_VOLUME_ID, 1);
        passes++;
      }

      expect(report.completed).toBe(true);
      expect(Object.keys(index.states())).toHaveLength(8);
    });

    it('does not mark anything missing in directories it has not reached yet', async () => {
      await buildTree(filesPath);
      await indexFromDisk();
      await fs.rm(path.join(filesPath, 'gamma/g.txt'));

      const first = await sut.reconcileVolume(OWNER, PRIVATE_VOLUME_ID, 1);

      expect(first.missing).toBe(0);
      expect(index.row('/gamma/g.txt')?.state).toBe(DriveEntryState.Present);
    });

    it('resumes correctly past a name that sorts below a slash', async () => {
      // '/alpha-x' sorts before '/alpha/inner' as a string but after it in the walk, so a checkpoint
      // compared as a string would skip it entirely.
      await fs.mkdir(path.join(filesPath, 'alpha/inner'), { recursive: true });
      await fs.mkdir(path.join(filesPath, 'alpha-x'));
      await write('alpha/inner/deep.txt', 'd');
      await write('alpha-x/late.txt', 'l');

      let report = await sut.reconcileVolume(OWNER, PRIVATE_VOLUME_ID, 1);
      while (!report.completed) {
        report = await sut.reconcileVolume(OWNER, PRIVATE_VOLUME_ID, 1);
      }

      expect(Object.keys(index.states()).sort()).toEqual([
        '/alpha',
        '/alpha-x',
        '/alpha-x/late.txt',
        '/alpha/inner',
        '/alpha/inner/deep.txt',
      ]);
    });
  });

  describe('trash', () => {
    it('reports what the trash holds', async () => {
      await trashEntry(registry, filesPath, 'report.txt');

      const report = await indexFromDisk();

      expect(report.trash).toMatchObject({ records: 1, damaged: 0, orphanedManifests: 0, foreign: 0, expired: 0 });
    });

    it('reports a record whose manifest cannot be read', async () => {
      const record = await trashEntry(registry, filesPath, 'report.txt');
      const [volume] = registry.describeVolumes(OWNER);
      await fs.writeFile(path.join(volume.trashPath, `${record.id}.json`), 'not json');

      const report = await indexFromDisk();

      expect(report.trash).toMatchObject({ records: 1, damaged: 1 });
    });

    it('reports a manifest whose content never arrived', async () => {
      const [volume] = registry.describeVolumes(OWNER);
      await fs.writeFile(
        path.join(volume.trashPath, '11111111-1111-4111-8111-111111111111.json'),
        JSON.stringify({ version: 1, originalPath: '/gone.txt' }),
      );

      const report = await indexFromDisk();

      expect(report.trash).toMatchObject({ records: 0, orphanedManifests: 1 });
    });

    it('reports content in the trash that is not a record, and leaves it there', async () => {
      const [volume] = registry.describeVolumes(OWNER);
      await fs.writeFile(path.join(volume.trashPath, 'someone-elses-file.txt'), 'not ours');

      const report = await indexFromDisk();

      expect(report.trash).toMatchObject({ foreign: 1 });
      await expect(fs.access(path.join(volume.trashPath, 'someone-elses-file.txt'))).resolves.toBeUndefined();
    });

    it('is not examined by a pass that stopped early', async () => {
      await fs.mkdir(path.join(filesPath, 'one'));
      await fs.mkdir(path.join(filesPath, 'two'));
      await trashEntry(registry, filesPath, 'report.txt');

      const report = await sut.reconcileVolume(OWNER, PRIVATE_VOLUME_ID, 1);

      expect(report.completed).toBe(false);
      expect(report.trash).toBeNull();
    });
  });

  describe('retention', () => {
    it('expires nothing when no retention is configured', async () => {
      await trashEntry(registry, filesPath, 'old.txt', 400);

      const report = await indexFromDisk();

      expect(report.trash).toMatchObject({ records: 1, expired: 0 });
    });

    it('expires only records older than the configured window', async () => {
      const old = await trashEntry(registry, filesPath, 'old.txt', 40);
      const recent = await trashEntry(registry, filesPath, 'recent.txt', 2);
      configure({ trashRetentionDays: 30 });

      const report = await indexFromDisk();

      expect(report.trash).toMatchObject({ expired: 1 });
      const { adapter } = await registry.getTarget(OWNER, PRIVATE_VOLUME_ID);
      const remaining = await adapter.listTrash();
      expect(remaining.map((record) => record.id)).toEqual([recent.id]);
      expect(remaining.map((record) => record.id)).not.toContain(old.id);
    });

    /** A record with no readable manifest has no known age, and guessing would destroy it. */
    it('never expires a record whose age it cannot establish', async () => {
      const record = await trashEntry(registry, filesPath, 'old.txt', 400);
      const [volume] = registry.describeVolumes(OWNER);
      await fs.writeFile(path.join(volume.trashPath, `${record.id}.json`), 'not json');
      configure({ trashRetentionDays: 1 });

      const report = await indexFromDisk();

      expect(report.trash).toMatchObject({ damaged: 1, expired: 0 });
      const { adapter } = await registry.getTarget(OWNER, PRIVATE_VOLUME_ID);
      await expect(adapter.listTrash()).resolves.toHaveLength(1);
    });

    it('does not expire anything on an unhealthy volume', async () => {
      await trashEntry(registry, filesPath, 'old.txt', 400);
      await initialise();
      configure({ trashRetentionDays: 1 });
      await fs.rm(path.join(volumeRoot, VOLUME_MARKER_NAME));

      const report = await sut.reconcileVolume(OWNER, PRIVATE_VOLUME_ID);

      expect(report.trash).toBeNull();
      const { adapter } = await registry.getTarget(OWNER, PRIVATE_VOLUME_ID);
      await expect(adapter.listTrash()).resolves.toHaveLength(1);
    });
  });

  it('reports that file storage is not enabled when the domain is unconfigured', async () => {
    const disabled = new ReconciliationService(
      null,
      { enabled: false },
      index.asRepository(),
      indexService,
      newLogger(),
    );

    await expect(disabled.inspectVolumes(OWNER)).rejects.toThrow('Immich Drive file storage is not enabled');
    await expect(disabled.reconcileVolume(OWNER, PRIVATE_VOLUME_ID)).rejects.toThrow(
      'Immich Drive file storage is not enabled',
    );
  });
});
