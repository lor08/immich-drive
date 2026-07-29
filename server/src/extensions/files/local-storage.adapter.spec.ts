import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import { FileEntryType } from 'src/extensions/files/file-entry';
import {
  LocalStorageAdapter,
  LocalStorageAdapterError,
  LocalStorageErrorCode,
} from 'src/extensions/files/local-storage.adapter';

const readAll = async (content: AsyncIterable<Uint8Array>): Promise<Buffer> => {
  const chunks: Buffer[] = [];
  for await (const chunk of content) {
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
};

const testContent = Readable.from([Uint8Array.from([1])]);

const asContent = (value: string): AsyncIterable<Uint8Array> => Readable.from([Buffer.from(value)]);

// The adapter only supports platforms exposing descriptors through this directory.
const descriptorDirectory = process.platform === 'darwin' ? '/dev/fd' : '/proc/self/fd';

const countOpenDescriptors = async (): Promise<number> => {
  const descriptors = await fs.readdir(descriptorDirectory);
  return descriptors.length;
};

// Exercises every read path, including a failure and an abandoned iterable, so leaked descriptors accumulate.
const exerciseReadPaths = async (adapter: LocalStorageAdapter): Promise<void> => {
  await adapter.stat('/documents');
  await adapter.stat('/missing.txt');
  await adapter.list('/documents');
  await readAll(await adapter.open('/documents/report.txt'));
  await readAll(await adapter.open('/documents/report.txt', { offset: 2, length: 4 }));
  await expect(adapter.list('/documents/report.txt')).rejects.toBeInstanceOf(LocalStorageAdapterError);

  const cancelled = await adapter.open('/documents/report.txt');
  for await (const chunk of cancelled) {
    expect(chunk.length).toBeGreaterThan(0);
    break;
  }
};

describe(LocalStorageAdapter.name, () => {
  let workspace: string;
  let root: string;
  let adapter: LocalStorageAdapter;

  beforeEach(async () => {
    workspace = await fs.mkdtemp(path.join(os.tmpdir(), 'immich-drive-local-storage-'));
    root = path.join(workspace, 'root');
    await fs.mkdir(root);
    adapter = await LocalStorageAdapter.create(root);
  });

  afterEach(async () => {
    await fs.rm(workspace, { recursive: true, force: true });
  });

  it('requires an existing absolute directory as the storage root', async () => {
    await expect(LocalStorageAdapter.create('relative')).rejects.toMatchObject({
      code: LocalStorageErrorCode.InvalidRoot,
    });
    await expect(LocalStorageAdapter.create(path.join(workspace, 'missing'))).rejects.toMatchObject({
      code: LocalStorageErrorCode.InvalidRoot,
    });

    const fileRoot = path.join(workspace, 'file-root');
    await fs.writeFile(fileRoot, 'not a directory');
    await expect(LocalStorageAdapter.create(fileRoot)).rejects.toMatchObject({
      code: LocalStorageErrorCode.InvalidRoot,
    });
  });

  it('detects replacement of the configured root after setup', async () => {
    const originalRoot = path.join(workspace, 'original-root');
    const outsideRoot = path.join(workspace, 'outside-root');
    await fs.mkdir(outsideRoot);
    await fs.writeFile(path.join(outsideRoot, 'secret.txt'), 'outside');

    await fs.rename(root, originalRoot);
    await fs.symlink(outsideRoot, root);

    await expect(adapter.open('/secret.txt')).rejects.toMatchObject({
      code: LocalStorageErrorCode.InvalidRoot,
    });
  });

  it('stats files and directories using virtual paths only', async () => {
    await fs.mkdir(path.join(root, 'documents'));
    await fs.writeFile(path.join(root, 'documents', 'report.txt'), 'report');

    const rootEntry = await adapter.stat('/');
    const directory = await adapter.stat('/documents');
    const file = await adapter.stat('/documents/report.txt');

    expect(rootEntry).toMatchObject({ path: '/', name: '/', type: FileEntryType.Directory });
    expect(directory).toMatchObject({ path: '/documents', name: 'documents', type: FileEntryType.Directory });
    expect(file).toMatchObject({
      path: '/documents/report.txt',
      name: 'report.txt',
      type: FileEntryType.File,
      size: 6,
    });
    expect(JSON.stringify([rootEntry, directory, file])).not.toContain(root);
  });

  it('returns null when a path does not exist', async () => {
    await expect(adapter.stat('/missing.txt')).resolves.toBeNull();
  });

  it('lists direct children in deterministic name order', async () => {
    await fs.writeFile(path.join(root, 'z-last.txt'), 'z');
    await fs.mkdir(path.join(root, 'middle'));
    await fs.writeFile(path.join(root, 'a-first.txt'), 'a');
    await fs.writeFile(path.join(root, 'middle', 'nested.txt'), 'nested');

    await expect(adapter.list('/')).resolves.toMatchObject([
      { path: '/a-first.txt', name: 'a-first.txt', type: FileEntryType.File },
      { path: '/middle', name: 'middle', type: FileEntryType.Directory },
      { path: '/z-last.txt', name: 'z-last.txt', type: FileEntryType.File },
    ]);
  });

  it('rejects listing a file', async () => {
    await fs.writeFile(path.join(root, 'file.txt'), 'data');
    await expect(adapter.list('/file.txt')).rejects.toMatchObject({
      code: LocalStorageErrorCode.EntryNotDirectory,
    });
  });

  it('reads a complete file', async () => {
    await fs.writeFile(path.join(root, 'alphabet.txt'), 'abcdefghijklmnopqrstuvwxyz');

    const content = await adapter.open('/alphabet.txt');
    await expect(readAll(content)).resolves.toEqual(Buffer.from('abcdefghijklmnopqrstuvwxyz'));
  });

  it('reads bounded and EOF-clamped ranges', async () => {
    await fs.writeFile(path.join(root, 'alphabet.txt'), 'abcdefghijklmnopqrstuvwxyz');

    const bounded = await adapter.open('/alphabet.txt', { offset: 5, length: 4 });
    const clamped = await adapter.open('/alphabet.txt', { offset: 23, length: 100 });

    await expect(readAll(bounded)).resolves.toEqual(Buffer.from('fghi'));
    await expect(readAll(clamped)).resolves.toEqual(Buffer.from('xyz'));
  });

  it('returns an empty iterable at EOF and rejects a range beyond EOF', async () => {
    await fs.writeFile(path.join(root, 'short.txt'), '12345');

    const eof = await adapter.open('/short.txt', { offset: 5, length: 1 });
    await expect(readAll(eof)).resolves.toEqual(Buffer.alloc(0));
    await expect(adapter.open('/short.txt', { offset: 6, length: 1 })).rejects.toMatchObject({
      code: LocalStorageErrorCode.RangeNotSatisfiable,
    });
  });

  it('rejects invalid range values', async () => {
    await fs.writeFile(path.join(root, 'short.txt'), '12345');

    for (const range of [
      { offset: -1 },
      { offset: 1.5 },
      { offset: 0, length: 0 },
      { offset: 0, length: -1 },
      { offset: 0, length: 1.5 },
    ]) {
      await expect(adapter.open('/short.txt', range)).rejects.toMatchObject({
        code: LocalStorageErrorCode.RangeNotSatisfiable,
      });
    }
  });

  it('rejects opening a directory', async () => {
    await fs.mkdir(path.join(root, 'directory'));
    await expect(adapter.open('/directory')).rejects.toMatchObject({ code: LocalStorageErrorCode.EntryNotFile });
  });

  it('rejects relative, traversal, non-canonical, Windows, UNC, backslash, and null-byte paths', async () => {
    const invalidPaths = [
      'relative.txt',
      '/../outside.txt',
      '/folder/../outside.txt',
      '/folder/./file.txt',
      '/folder//file.txt',
      '/folder/',
      String.raw`C:\secret.txt`,
      '/C:/secret.txt',
      '//server/share',
      String.raw`\\server\share`,
      String.raw`/folder\file.txt`,
      '/bad\0path',
    ];

    for (const invalidPath of invalidPaths) {
      await expect(adapter.stat(invalidPath)).rejects.toMatchObject({ code: LocalStorageErrorCode.InvalidPath });
    }
  });

  it('sandboxes POSIX-looking virtual paths below the configured root', async () => {
    await fs.mkdir(path.join(root, 'etc'));
    await fs.writeFile(path.join(root, 'etc', 'passwd'), 'sandboxed');

    const content = await adapter.open('/etc/passwd');
    await expect(readAll(content)).resolves.toEqual(Buffer.from('sandboxed'));
  });

  it('does not expose symbolic links that stay inside the root', async () => {
    await fs.writeFile(path.join(root, 'target.txt'), 'target');
    await fs.symlink('target.txt', path.join(root, 'link.txt'));

    await expect(adapter.stat('/link.txt')).rejects.toMatchObject({ code: LocalStorageErrorCode.SymlinkNotAllowed });
    await expect(adapter.list('/')).resolves.toMatchObject([
      { path: '/target.txt', name: 'target.txt', type: FileEntryType.File },
    ]);
  });

  it('prevents a symbolic link from escaping the root', async () => {
    const outside = path.join(workspace, 'outside.txt');
    await fs.writeFile(outside, 'outside');
    await fs.symlink(outside, path.join(root, 'escape.txt'));

    await expect(adapter.open('/escape.txt')).rejects.toMatchObject({ code: LocalStorageErrorCode.SymlinkNotAllowed });
  });

  it('rejects an intermediate directory symlink that escapes the root', async () => {
    const outside = path.join(workspace, 'outside');
    await fs.mkdir(outside);
    await fs.writeFile(path.join(outside, 'secret.txt'), 'outside');
    await fs.symlink(outside, path.join(root, 'linked-directory'));

    await expect(adapter.open('/linked-directory/secret.txt')).rejects.toMatchObject({
      code: LocalStorageErrorCode.SymlinkNotAllowed,
    });
  });

  it('revalidates every path component when reading a previously opened iterable', async () => {
    const originalDirectory = path.join(root, 'documents');
    const movedDirectory = path.join(workspace, 'original-documents');
    const outsideDirectory = path.join(workspace, 'outside-documents');
    await fs.mkdir(originalDirectory);
    await fs.mkdir(outsideDirectory);
    await fs.writeFile(path.join(originalDirectory, 'report.txt'), 'inside');
    await fs.writeFile(path.join(outsideDirectory, 'report.txt'), 'outside');

    const content = await adapter.open('/documents/report.txt');
    await fs.rename(originalDirectory, movedDirectory);
    await fs.symlink(outsideDirectory, originalDirectory);

    await expect(readAll(content)).rejects.toMatchObject({
      code: LocalStorageErrorCode.SymlinkNotAllowed,
    });
  });

  describe('write', () => {
    let staging: string;
    let writable: LocalStorageAdapter;

    beforeEach(async () => {
      staging = path.join(workspace, 'staging');
      await fs.mkdir(staging);
      writable = await LocalStorageAdapter.create(root, staging);
    });

    it('writes a file and reports it', async () => {
      const entry = await writable.write('/report.txt', asContent('contents'));

      expect(entry).toMatchObject({ path: '/report.txt', name: 'report.txt', type: FileEntryType.File, size: 8 });
      await expect(fs.readFile(path.join(root, 'report.txt'), 'utf8')).resolves.toBe('contents');
    });

    it('leaves nothing in staging after success', async () => {
      await writable.write('/report.txt', asContent('contents'));

      await expect(fs.readdir(staging)).resolves.toEqual([]);
    });

    it('creates the file owner-only', async () => {
      await writable.write('/report.txt', asContent('contents'));

      const { mode } = await fs.stat(path.join(root, 'report.txt'));

      expect(mode & 0o777).toBe(0o600);
    });

    it('refuses an existing file unless overwrite is set', async () => {
      await writable.write('/report.txt', asContent('first'));

      await expect(writable.write('/report.txt', asContent('second'))).rejects.toMatchObject({
        code: LocalStorageErrorCode.EntryExists,
      });
      await expect(fs.readFile(path.join(root, 'report.txt'), 'utf8')).resolves.toBe('first');
    });

    it('replaces an existing file when overwrite is set', async () => {
      await writable.write('/report.txt', asContent('first'));

      await writable.write('/report.txt', asContent('second'), { overwrite: true });

      await expect(fs.readFile(path.join(root, 'report.txt'), 'utf8')).resolves.toBe('second');
      await expect(fs.readdir(staging)).resolves.toEqual([]);
    });

    it('refuses to overwrite a directory', async () => {
      await fs.mkdir(path.join(root, 'documents'));

      await expect(writable.write('/documents', asContent('x'), { overwrite: true })).rejects.toMatchObject({
        code: LocalStorageErrorCode.EntryExists,
      });
    });

    it('leaves no partial file and no staging file when the content fails mid-stream', async () => {
      // eslint-disable-next-line @typescript-eslint/require-await
      const failing = (async function* () {
        yield Buffer.from('partial');
        throw new Error('client went away');
      })();

      await expect(writable.write('/report.txt', failing)).rejects.toThrow('client went away');

      await expect(fs.readdir(root)).resolves.toEqual([]);
      await expect(fs.readdir(staging)).resolves.toEqual([]);
    });

    it('does not write when the parent is missing', async () => {
      await expect(writable.write('/missing/report.txt', asContent('x'))).rejects.toMatchObject({
        code: LocalStorageErrorCode.EntryNotFound,
      });

      await expect(fs.readdir(root)).resolves.toEqual([]);
      await expect(fs.readdir(staging)).resolves.toEqual([]);
    });

    it.each(['relative', '/', '/a/../escape', '/nul\0byte'])(
      'refuses the path %j without touching either directory',
      async (badPath) => {
        await expect(writable.write(badPath, asContent('x'))).rejects.toBeInstanceOf(LocalStorageAdapterError);

        await expect(fs.readdir(root)).resolves.toEqual([]);
        await expect(fs.readdir(staging)).resolves.toEqual([]);
      },
    );

    it('refuses to write through a symlinked parent', async () => {
      const outside = path.join(workspace, 'outside');
      await fs.mkdir(outside);
      await fs.symlink(outside, path.join(root, 'escape'));

      await expect(writable.write('/escape/report.txt', asContent('x'))).rejects.toMatchObject({
        code: LocalStorageErrorCode.SymlinkNotAllowed,
      });

      await expect(fs.readdir(outside)).resolves.toEqual([]);
    });

    it('refuses a staging directory on another filesystem', async () => {
      // /dev/shm is a separate tmpfs, so an atomic rename into the root is impossible.
      const otherFilesystem = '/dev/shm';
      const rootStats = await fs.stat(root, { bigint: true });
      const available = await fs
        .stat(otherFilesystem, { bigint: true })
        .then((stats) => stats.dev !== rootStats.dev)
        .catch(() => false);

      if (!available) {
        return;
      }

      await expect(LocalStorageAdapter.create(root, otherFilesystem)).rejects.toMatchObject({
        code: LocalStorageErrorCode.InvalidRoot,
      });
    });

    it('refuses to write at all without a staging directory', async () => {
      await expect(adapter.write('/report.txt', asContent('x'))).rejects.toMatchObject({
        code: LocalStorageErrorCode.UnsupportedOperation,
      });
    });
  });

  describe('createDirectory', () => {
    it('creates a directory at the root and reports it', async () => {
      const entry = await adapter.createDirectory('/documents');

      expect(entry).toMatchObject({ path: '/documents', name: 'documents', type: FileEntryType.Directory });
      await expect(fs.stat(path.join(root, 'documents')).then((stats) => stats.isDirectory())).resolves.toBe(true);
    });

    it('creates a directory inside an existing one', async () => {
      await adapter.createDirectory('/documents');

      const entry = await adapter.createDirectory('/documents/reports');

      expect(entry.path).toBe('/documents/reports');
      await expect(fs.stat(path.join(root, 'documents', 'reports')).then((s) => s.isDirectory())).resolves.toBe(true);
    });

    it('creates the directory owner-only', async () => {
      await adapter.createDirectory('/documents');

      const { mode } = await fs.stat(path.join(root, 'documents'));

      expect(mode & 0o777).toBe(0o700);
    });

    it.each([
      ['a directory', async (target: string) => fs.mkdir(target)],
      ['a file', async (target: string) => fs.writeFile(target, 'contents')],
    ])('refuses to create over an existing entry, when it is %s', async (_label, create) => {
      await create(path.join(root, 'occupied'));

      await expect(adapter.createDirectory('/occupied')).rejects.toMatchObject({
        code: LocalStorageErrorCode.EntryExists,
      });
    });

    it('refuses the storage root itself', async () => {
      await expect(adapter.createDirectory('/')).rejects.toMatchObject({
        code: LocalStorageErrorCode.InvalidPath,
      });
    });

    it('does not create anything when the parent is missing', async () => {
      await expect(adapter.createDirectory('/missing/child')).rejects.toMatchObject({
        code: LocalStorageErrorCode.EntryNotFound,
      });

      await expect(fs.readdir(root)).resolves.toEqual([]);
    });

    it('refuses to create under a file', async () => {
      await fs.writeFile(path.join(root, 'report.txt'), 'contents');

      await expect(adapter.createDirectory('/report.txt/child')).rejects.toMatchObject({
        code: LocalStorageErrorCode.EntryNotDirectory,
      });
    });

    it.each(['relative', '/', '/documents//reports', '/documents/../escape', '/nul\0byte', String.raw`C:\windows`])(
      'refuses the path %j without creating anything',
      async (badPath) => {
        await expect(adapter.createDirectory(badPath)).rejects.toBeInstanceOf(LocalStorageAdapterError);

        await expect(fs.readdir(root)).resolves.toEqual([]);
      },
    );

    it('cannot place a directory outside the root through a symlinked parent', async () => {
      const outside = path.join(workspace, 'outside');
      await fs.mkdir(outside);
      await fs.symlink(outside, path.join(root, 'escape'));

      await expect(adapter.createDirectory('/escape/child')).rejects.toMatchObject({
        code: LocalStorageErrorCode.SymlinkNotAllowed,
      });

      await expect(fs.readdir(outside)).resolves.toEqual([]);
    });
  });

  describe('move', () => {
    let staging: string;
    let writable: LocalStorageAdapter;

    beforeEach(async () => {
      staging = path.join(workspace, 'staging');
      await fs.mkdir(staging);
      writable = await LocalStorageAdapter.create(root, staging);

      await fs.mkdir(path.join(root, 'documents'));
      await fs.writeFile(path.join(root, 'documents', 'report.txt'), 'contents');
    });

    it('renames a file in place', async () => {
      await writable.move('/documents/report.txt', '/documents/final.txt');

      await expect(fs.readdir(path.join(root, 'documents'))).resolves.toEqual(['final.txt']);
      await expect(fs.readFile(path.join(root, 'documents', 'final.txt'), 'utf8')).resolves.toBe('contents');
    });

    it('renames a directory with its contents', async () => {
      await writable.move('/documents', '/archive');

      await expect(fs.readFile(path.join(root, 'archive', 'report.txt'), 'utf8')).resolves.toBe('contents');
      await expect(fs.readdir(root)).resolves.toEqual(['archive']);
    });

    it('moves a file into another directory', async () => {
      await fs.mkdir(path.join(root, 'archive'));

      await writable.move('/documents/report.txt', '/archive/report.txt');

      await expect(fs.readdir(path.join(root, 'documents'))).resolves.toEqual([]);
      await expect(fs.readFile(path.join(root, 'archive', 'report.txt'), 'utf8')).resolves.toBe('contents');
    });

    it('accepts a move onto itself without touching anything', async () => {
      const before = await fs.stat(path.join(root, 'documents', 'report.txt'));

      await expect(writable.move('/documents/report.txt', '/documents/report.txt')).resolves.toBeUndefined();

      const after = await fs.stat(path.join(root, 'documents', 'report.txt'));
      expect(after.ino).toBe(before.ino);
    });

    it('refuses a move onto itself when nothing is there', async () => {
      await expect(writable.move('/documents/missing.txt', '/documents/missing.txt')).rejects.toMatchObject({
        code: LocalStorageErrorCode.EntryNotFound,
      });
    });

    it('refuses a missing source', async () => {
      await expect(writable.move('/documents/missing.txt', '/documents/final.txt')).rejects.toMatchObject({
        code: LocalStorageErrorCode.EntryNotFound,
      });
    });

    it('refuses a missing target parent', async () => {
      await expect(writable.move('/documents/report.txt', '/archive/report.txt')).rejects.toMatchObject({
        code: LocalStorageErrorCode.EntryNotFound,
      });

      await expect(fs.readdir(path.join(root, 'documents'))).resolves.toEqual(['report.txt']);
    });

    it('refuses a target parent that is a file', async () => {
      await fs.writeFile(path.join(root, 'note.txt'), 'note');

      await expect(writable.move('/note.txt', '/documents/report.txt/nested')).rejects.toMatchObject({
        code: LocalStorageErrorCode.EntryNotDirectory,
      });

      await expect(fs.readFile(path.join(root, 'note.txt'), 'utf8')).resolves.toBe('note');
    });

    it.each([
      ['a file', async (target: string) => fs.writeFile(target, 'other')],
      ['a directory', async (target: string) => fs.mkdir(target)],
    ])('refuses an occupied target, when it is %s, without replacing it', async (_label, create) => {
      await create(path.join(root, 'occupied'));

      await expect(writable.move('/documents/report.txt', '/occupied')).rejects.toMatchObject({
        code: LocalStorageErrorCode.EntryExists,
      });

      await expect(fs.readFile(path.join(root, 'documents', 'report.txt'), 'utf8')).resolves.toBe('contents');
    });

    it('refuses to move a directory inside itself', async () => {
      await expect(writable.move('/documents', '/documents/nested')).rejects.toMatchObject({
        code: LocalStorageErrorCode.InvalidPath,
      });

      await expect(fs.readdir(path.join(root, 'documents'))).resolves.toEqual(['report.txt']);
    });

    it.each(['relative', '/', '/documents/../escape', '/nul\0byte'])(
      'refuses the source path %j without changing anything',
      async (badPath) => {
        await expect(writable.move(badPath, '/final.txt')).rejects.toBeInstanceOf(LocalStorageAdapterError);

        await expect(fs.readdir(root)).resolves.toEqual(['documents']);
      },
    );

    it.each(['relative', '/', '/documents/../escape', '/nul\0byte'])(
      'refuses the target path %j without changing anything',
      async (badPath) => {
        await expect(writable.move('/documents/report.txt', badPath)).rejects.toBeInstanceOf(LocalStorageAdapterError);

        await expect(fs.readdir(path.join(root, 'documents'))).resolves.toEqual(['report.txt']);
      },
    );

    it('cannot move an entry outside the root through a symlinked target parent', async () => {
      const outside = path.join(workspace, 'outside');
      await fs.mkdir(outside);
      await fs.symlink(outside, path.join(root, 'escape'));

      await expect(writable.move('/documents/report.txt', '/escape/report.txt')).rejects.toMatchObject({
        code: LocalStorageErrorCode.SymlinkNotAllowed,
      });

      await expect(fs.readdir(outside)).resolves.toEqual([]);
    });

    it('cannot move an entry from outside the root through a symlinked source parent', async () => {
      const outside = path.join(workspace, 'outside');
      await fs.mkdir(outside);
      await fs.writeFile(path.join(outside, 'secret.txt'), 'secret');
      await fs.symlink(outside, path.join(root, 'escape'));

      await expect(writable.move('/escape/secret.txt', '/secret.txt')).rejects.toMatchObject({
        code: LocalStorageErrorCode.SymlinkNotAllowed,
      });

      await expect(fs.readdir(outside)).resolves.toEqual(['secret.txt']);
    });

    it('closes every descriptor across success and failure', async () => {
      await fs.mkdir(path.join(root, 'archive'));

      // Warm up first, so descriptors the runtime opens lazily are not attributed to the adapter.
      await writable.move('/documents/report.txt', '/archive/report.txt');
      await writable.move('/archive/report.txt', '/documents/report.txt');
      const before = await countOpenDescriptors();

      for (let round = 0; round < 5; round++) {
        await writable.move('/documents/report.txt', '/archive/report.txt');
        await writable.move('/archive/report.txt', '/documents/report.txt');
        await expect(writable.move('/documents/missing.txt', '/archive/missing.txt')).rejects.toBeInstanceOf(
          LocalStorageAdapterError,
        );
        await expect(writable.move('/documents', '/archive')).rejects.toBeInstanceOf(LocalStorageAdapterError);
      }

      await expect(countOpenDescriptors()).resolves.toBeLessThanOrEqual(before);
    });
  });

  describe('copy', () => {
    let staging: string;
    let writable: LocalStorageAdapter;

    beforeEach(async () => {
      staging = path.join(workspace, 'staging');
      await fs.mkdir(staging);
      writable = await LocalStorageAdapter.create(root, staging);

      await fs.mkdir(path.join(root, 'documents'));
      await fs.writeFile(path.join(root, 'documents', 'report.txt'), 'contents');
    });

    it('copies a file and reports the copy', async () => {
      const entry = await writable.copy('/documents/report.txt', '/documents/report-copy.txt');

      expect(entry).toMatchObject({
        path: '/documents/report-copy.txt',
        name: 'report-copy.txt',
        type: FileEntryType.File,
        size: 8,
      });
      await expect(fs.readFile(path.join(root, 'documents', 'report-copy.txt'), 'utf8')).resolves.toBe('contents');
      await expect(fs.readFile(path.join(root, 'documents', 'report.txt'), 'utf8')).resolves.toBe('contents');
    });

    it('leaves nothing in staging after success', async () => {
      await writable.copy('/documents/report.txt', '/copy.txt');

      await expect(fs.readdir(staging)).resolves.toEqual([]);
    });

    it('creates the copy owner-only, whatever the source mode', async () => {
      await fs.chmod(path.join(root, 'documents', 'report.txt'), 0o644);

      await writable.copy('/documents/report.txt', '/copy.txt');

      const { mode } = await fs.stat(path.join(root, 'copy.txt'));
      expect(mode & 0o777).toBe(0o600);
    });

    it('refuses a directory', async () => {
      await expect(writable.copy('/documents', '/archive')).rejects.toMatchObject({
        code: LocalStorageErrorCode.EntryNotFile,
      });

      await expect(fs.readdir(root)).resolves.toEqual(['documents']);
    });

    it('refuses an occupied target without replacing it', async () => {
      await fs.writeFile(path.join(root, 'copy.txt'), 'other');

      await expect(writable.copy('/documents/report.txt', '/copy.txt')).rejects.toMatchObject({
        code: LocalStorageErrorCode.EntryExists,
      });

      await expect(fs.readFile(path.join(root, 'copy.txt'), 'utf8')).resolves.toBe('other');
      await expect(fs.readdir(staging)).resolves.toEqual([]);
    });

    it('refuses a missing source without leaving a partial target', async () => {
      await expect(writable.copy('/documents/missing.txt', '/copy.txt')).rejects.toMatchObject({
        code: LocalStorageErrorCode.EntryNotFound,
      });

      await expect(fs.readdir(root)).resolves.toEqual(['documents']);
      await expect(fs.readdir(staging)).resolves.toEqual([]);
    });

    it('refuses a missing target parent without leaving anything in staging', async () => {
      await expect(writable.copy('/documents/report.txt', '/archive/copy.txt')).rejects.toMatchObject({
        code: LocalStorageErrorCode.EntryNotFound,
      });

      await expect(fs.readdir(staging)).resolves.toEqual([]);
    });

    it('cannot read a file from outside the root through a symlink', async () => {
      const outside = path.join(workspace, 'outside');
      await fs.mkdir(outside);
      await fs.writeFile(path.join(outside, 'secret.txt'), 'secret');
      await fs.symlink(path.join(outside, 'secret.txt'), path.join(root, 'escape.txt'));

      await expect(writable.copy('/escape.txt', '/copy.txt')).rejects.toMatchObject({
        code: LocalStorageErrorCode.SymlinkNotAllowed,
      });

      await expect(fs.readdir(root)).resolves.toEqual(['documents', 'escape.txt']);
    });

    it('closes every descriptor across success and failure', async () => {
      // Warm up first, so descriptors the runtime opens lazily are not attributed to the adapter.
      await writable.copy('/documents/report.txt', '/warm.txt');
      const before = await countOpenDescriptors();

      for (let round = 0; round < 5; round++) {
        await writable.copy('/documents/report.txt', `/copy-${round}.txt`);
        await expect(writable.copy('/documents', '/archive')).rejects.toBeInstanceOf(LocalStorageAdapterError);
        await expect(writable.copy('/documents/missing.txt', '/missing-copy.txt')).rejects.toBeInstanceOf(
          LocalStorageAdapterError,
        );
        // Fails after the source is opened, which is the case that could leave a reader behind.
        await expect(writable.copy('/documents/report.txt', '/warm.txt')).rejects.toBeInstanceOf(
          LocalStorageAdapterError,
        );
      }

      await expect(countOpenDescriptors()).resolves.toBeLessThanOrEqual(before);
    });
  });

  describe('trash', () => {
    let staging: string;
    let trash: string;
    let writable: LocalStorageAdapter;

    const manifestPath = (id: string) => path.join(trash, `${id}.json`);

    beforeEach(async () => {
      staging = path.join(workspace, 'staging');
      trash = path.join(workspace, 'trash');
      await fs.mkdir(staging);
      await fs.mkdir(trash);
      writable = await LocalStorageAdapter.create(root, staging, trash);

      await fs.mkdir(path.join(root, 'documents'));
      await fs.writeFile(path.join(root, 'documents', 'report.txt'), 'contents');
    });

    it('moves a file into the trash and leaves nothing behind', async () => {
      const record = await writable.trash('/documents/report.txt');

      expect(record).toMatchObject({
        name: 'report.txt',
        originalPath: '/documents/report.txt',
        type: FileEntryType.File,
        size: 8,
      });
      expect(record.deletedAt).toBeInstanceOf(Date);

      await expect(fs.readdir(path.join(root, 'documents'))).resolves.toEqual([]);
      await expect(fs.readFile(path.join(trash, record.id, 'report.txt'), 'utf8')).resolves.toBe('contents');
    });

    it('records where the entry came from, in a manifest a person can read', async () => {
      const record = await writable.trash('/documents/report.txt');

      const manifest = JSON.parse(await fs.readFile(manifestPath(record.id), 'utf8'));

      expect(manifest).toMatchObject({
        version: 1,
        originalPath: '/documents/report.txt',
        name: 'report.txt',
        type: FileEntryType.File,
      });
      expect(Date.parse(manifest.deletedAt)).not.toBeNaN();
    });

    it('moves a folder in whole, in one operation', async () => {
      await fs.mkdir(path.join(root, 'documents', 'nested'));
      await fs.writeFile(path.join(root, 'documents', 'nested', 'deep.txt'), 'deep');

      const record = await writable.trash('/documents');

      expect(record).toMatchObject({ name: 'documents', type: FileEntryType.Directory });
      await expect(fs.readdir(root)).resolves.toEqual([]);
      await expect(fs.readFile(path.join(trash, record.id, 'documents', 'nested', 'deep.txt'), 'utf8')).resolves.toBe(
        'deep',
      );
    });

    it('creates the record owner-only', async () => {
      const record = await writable.trash('/documents/report.txt');

      const directory = await fs.stat(path.join(trash, record.id));
      const manifest = await fs.stat(manifestPath(record.id));

      expect(directory.mode & 0o777).toBe(0o700);
      expect(manifest.mode & 0o777).toBe(0o600);
    });

    it('refuses a missing entry without writing a record', async () => {
      await expect(writable.trash('/documents/missing.txt')).rejects.toMatchObject({
        code: LocalStorageErrorCode.EntryNotFound,
      });

      await expect(fs.readdir(trash)).resolves.toEqual([]);
    });

    it.each(['relative', '/', '/documents/../escape', '/nul\0byte'])(
      'refuses the path %j without writing a record',
      async (badPath) => {
        await expect(writable.trash(badPath)).rejects.toBeInstanceOf(LocalStorageAdapterError);

        await expect(fs.readdir(trash)).resolves.toEqual([]);
        await expect(fs.readdir(root)).resolves.toEqual(['documents']);
      },
    );

    it('cannot reach outside the root through a symlinked parent', async () => {
      const outside = path.join(workspace, 'outside');
      await fs.mkdir(outside);
      await fs.writeFile(path.join(outside, 'secret.txt'), 'secret');
      await fs.symlink(outside, path.join(root, 'escape'));

      await expect(writable.trash('/escape/secret.txt')).rejects.toMatchObject({
        code: LocalStorageErrorCode.SymlinkNotAllowed,
      });

      await expect(fs.readdir(outside)).resolves.toEqual(['secret.txt']);
      await expect(fs.readdir(trash)).resolves.toEqual([]);
    });

    it('keeps the trash out of the address space entirely', async () => {
      await writable.trash('/documents/report.txt');

      // The trash is a sibling of the address root, so nothing addressable can name it.
      await expect(writable.stat('/.trash')).resolves.toBeNull();
      await expect(writable.list('/')).resolves.toEqual([
        expect.objectContaining({ name: 'documents', path: '/documents' }),
      ]);
    });

    it('lists records newest first', async () => {
      await fs.writeFile(path.join(root, 'first.txt'), '1');
      await fs.writeFile(path.join(root, 'second.txt'), '2');

      const first = await writable.trash('/first.txt');
      const second = await writable.trash('/second.txt');

      // Deletions inside one millisecond would otherwise tie; the manifest is rewritten to separate them.
      const manifest = JSON.parse(await fs.readFile(manifestPath(first.id), 'utf8'));
      await fs.writeFile(
        manifestPath(first.id),
        JSON.stringify({ ...manifest, deletedAt: '2020-01-01T00:00:00.000Z' }),
      );

      await expect(writable.listTrash()).resolves.toEqual([
        expect.objectContaining({ id: second.id }),
        expect.objectContaining({ id: first.id, deletedAt: new Date('2020-01-01T00:00:00.000Z') }),
      ]);
    });

    it.each([
      ['missing', async (target: string) => fs.rm(target)],
      ['not JSON', async (target: string) => fs.writeFile(target, 'not json at all')],
      ['not an object', async (target: string) => fs.writeFile(target, '"a string"')],
      [
        'naming a path outside the address space',
        async (target: string) => fs.writeFile(target, JSON.stringify({ originalPath: '/../escape.txt' })),
      ],
    ])('still lists a record whose manifest is %s', async (_label, damage) => {
      const record = await writable.trash('/documents/report.txt');
      await damage(manifestPath(record.id));

      await expect(writable.listTrash()).resolves.toEqual([
        expect.objectContaining({ id: record.id, name: 'report.txt', originalPath: null, size: 8 }),
      ]);
    });

    it('ignores directories in the trash that are not records', async () => {
      await fs.mkdir(path.join(trash, 'not-a-record'));
      await fs.writeFile(path.join(trash, 'loose-file.txt'), 'x');

      await expect(writable.listTrash()).resolves.toEqual([]);
    });

    it('restores an entry to where it came from', async () => {
      const record = await writable.trash('/documents/report.txt');

      const restored = await writable.restoreFromTrash(record.id);

      expect(restored).toMatchObject({ path: '/documents/report.txt', name: 'report.txt', size: 8 });
      await expect(fs.readFile(path.join(root, 'documents', 'report.txt'), 'utf8')).resolves.toBe('contents');
      await expect(writable.listTrash()).resolves.toEqual([]);
      await expect(fs.readdir(trash)).resolves.toEqual([]);
    });

    it('restores a folder with its contents', async () => {
      await fs.mkdir(path.join(root, 'documents', 'nested'));
      await fs.writeFile(path.join(root, 'documents', 'nested', 'deep.txt'), 'deep');
      const record = await writable.trash('/documents');

      await writable.restoreFromTrash(record.id);

      await expect(fs.readFile(path.join(root, 'documents', 'nested', 'deep.txt'), 'utf8')).resolves.toBe('deep');
    });

    it('restores to a named path instead', async () => {
      const record = await writable.trash('/documents/report.txt');

      const restored = await writable.restoreFromTrash(record.id, '/elsewhere.txt');

      expect(restored).toMatchObject({ path: '/elsewhere.txt' });
      await expect(fs.readFile(path.join(root, 'elsewhere.txt'), 'utf8')).resolves.toBe('contents');
    });

    it('refuses to restore over an occupied path, and keeps the record', async () => {
      const record = await writable.trash('/documents/report.txt');
      await fs.writeFile(path.join(root, 'documents', 'report.txt'), 'newer');

      await expect(writable.restoreFromTrash(record.id)).rejects.toMatchObject({
        code: LocalStorageErrorCode.EntryExists,
      });

      await expect(fs.readFile(path.join(root, 'documents', 'report.txt'), 'utf8')).resolves.toBe('newer');
      await expect(writable.listTrash()).resolves.toEqual([expect.objectContaining({ id: record.id })]);
    });

    it('refuses to restore when the original parent is gone, without recreating it', async () => {
      const record = await writable.trash('/documents/report.txt');
      await fs.rmdir(path.join(root, 'documents'));

      await expect(writable.restoreFromTrash(record.id)).rejects.toMatchObject({
        code: LocalStorageErrorCode.EntryNotFound,
      });

      await expect(fs.readdir(root)).resolves.toEqual([]);
      await expect(writable.listTrash()).resolves.toEqual([expect.objectContaining({ id: record.id })]);
    });

    it('requires a target when the original path is unknown', async () => {
      const record = await writable.trash('/documents/report.txt');
      await fs.rm(manifestPath(record.id));

      await expect(writable.restoreFromTrash(record.id)).rejects.toMatchObject({
        code: LocalStorageErrorCode.InvalidPath,
      });

      await expect(writable.restoreFromTrash(record.id, '/recovered.txt')).resolves.toMatchObject({
        path: '/recovered.txt',
      });
    });

    it.each(['not-a-uuid', '../escape', '.', ''])('refuses the record identifier %j', async (badId) => {
      await expect(writable.restoreFromTrash(badId)).rejects.toMatchObject({
        code: LocalStorageErrorCode.InvalidPath,
      });
      await expect(writable.purgeFromTrash(badId)).rejects.toMatchObject({
        code: LocalStorageErrorCode.InvalidPath,
      });
    });

    it('reports a record that does not exist', async () => {
      const absent = '00000000-0000-4000-8000-000000000000';

      await expect(writable.restoreFromTrash(absent)).rejects.toMatchObject({
        code: LocalStorageErrorCode.EntryNotFound,
      });
      await expect(writable.purgeFromTrash(absent)).rejects.toMatchObject({
        code: LocalStorageErrorCode.EntryNotFound,
      });
    });

    it('purges one record, content and manifest together', async () => {
      const record = await writable.trash('/documents/report.txt');

      await writable.purgeFromTrash(record.id);

      await expect(fs.readdir(trash)).resolves.toEqual([]);
      await expect(writable.listTrash()).resolves.toEqual([]);
    });

    it('purges a folder record with everything under it', async () => {
      await fs.mkdir(path.join(root, 'documents', 'nested'));
      await fs.writeFile(path.join(root, 'documents', 'nested', 'deep.txt'), 'deep');
      const record = await writable.trash('/documents');

      await writable.purgeFromTrash(record.id);

      await expect(fs.readdir(trash)).resolves.toEqual([]);
    });

    it('empties the trash and reports what went', async () => {
      await fs.writeFile(path.join(root, 'first.txt'), '1');
      await writable.trash('/documents/report.txt');
      await writable.trash('/first.txt');

      await expect(writable.emptyTrash()).resolves.toEqual({ removed: 2, failed: 0 });
      await expect(fs.readdir(trash)).resolves.toEqual([]);
    });

    it('empties an already empty trash without complaining', async () => {
      await expect(writable.emptyTrash()).resolves.toEqual({ removed: 0, failed: 0 });
    });

    it('leaves foreign content in the trash alone when emptying', async () => {
      await writable.trash('/documents/report.txt');
      await fs.writeFile(path.join(trash, 'someone-elses-note.txt'), 'x');

      await expect(writable.emptyTrash()).resolves.toEqual({ removed: 1, failed: 0 });
      await expect(fs.readdir(trash)).resolves.toEqual(['someone-elses-note.txt']);
    });

    it('refuses a trash root on another filesystem', async () => {
      // /dev/shm is a separate mount on Linux, which is what makes a rename into it impossible.
      const separate = '/dev/shm';
      const separateStats = await fs.stat(separate).catch(() => null);
      const rootStats = await fs.stat(root);
      if (separateStats === null || separateStats.dev === rootStats.dev) {
        return;
      }

      await expect(LocalStorageAdapter.create(root, staging, separate)).rejects.toMatchObject({
        code: LocalStorageErrorCode.InvalidRoot,
      });
    });

    it('refuses a trash root that does not exist', async () => {
      await expect(LocalStorageAdapter.create(root, staging, path.join(workspace, 'absent'))).rejects.toMatchObject({
        code: LocalStorageErrorCode.InvalidRoot,
      });
    });

    it('closes every descriptor across success and failure', async () => {
      // Warm up first, so descriptors the runtime opens lazily are not attributed to the adapter.
      const warm = await writable.trash('/documents/report.txt');
      await writable.restoreFromTrash(warm.id);
      const before = await countOpenDescriptors();

      for (let round = 0; round < 5; round++) {
        const record = await writable.trash('/documents/report.txt');
        await writable.listTrash();
        await expect(writable.trash('/documents/report.txt')).rejects.toBeInstanceOf(LocalStorageAdapterError);
        await expect(writable.restoreFromTrash('not-a-uuid')).rejects.toBeInstanceOf(LocalStorageAdapterError);
        await writable.restoreFromTrash(record.id);

        const purged = await writable.trash('/documents/report.txt');
        await writable.purgeFromTrash(purged.id);
        await writable.emptyTrash();
        await fs.writeFile(path.join(root, 'documents', 'report.txt'), 'contents');
      }

      await expect(countOpenDescriptors()).resolves.toBeLessThanOrEqual(before);
    });
  });

  it('fails mutation operations explicitly without changing the filesystem', async () => {
    const before = await fs.readdir(root);

    await expect(adapter.write('/new.txt', testContent)).rejects.toMatchObject({
      code: LocalStorageErrorCode.UnsupportedOperation,
    });
    await expect(adapter.move('/a.txt', '/b.txt')).rejects.toMatchObject({
      code: LocalStorageErrorCode.UnsupportedOperation,
    });
    await expect(adapter.copy('/a.txt', '/b.txt')).rejects.toMatchObject({
      code: LocalStorageErrorCode.UnsupportedOperation,
    });
    await expect(adapter.delete('/a.txt')).rejects.toMatchObject({
      code: LocalStorageErrorCode.UnsupportedOperation,
    });

    for (const operation of [
      () => adapter.trash('/a.txt'),
      () => adapter.listTrash(),
      () => adapter.restoreFromTrash('00000000-0000-4000-8000-000000000000'),
      () => adapter.purgeFromTrash('00000000-0000-4000-8000-000000000000'),
      () => adapter.emptyTrash(),
    ]) {
      await expect(operation()).rejects.toMatchObject({ code: LocalStorageErrorCode.UnsupportedOperation });
    }

    await expect(fs.readdir(root)).resolves.toEqual(before);
  });

  it('closes every descriptor on success, failure, and cancelled iteration', async () => {
    await fs.mkdir(path.join(root, 'documents'));
    await fs.writeFile(path.join(root, 'documents', 'report.txt'), 'immich-drive');

    // Warm up first so descriptors opened lazily by the runtime are not attributed to the adapter.
    await exerciseReadPaths(adapter);
    const before = await countOpenDescriptors();

    for (let round = 0; round < 5; round++) {
      await exerciseReadPaths(adapter);
    }

    await expect(countOpenDescriptors()).resolves.toBeLessThanOrEqual(before);
  });

  it('uses stable public errors without leaking the host root', async () => {
    const error = await adapter.open('/missing.txt').catch((error: unknown) => error);

    expect(error).toBeInstanceOf(LocalStorageAdapterError);
    expect(error).toMatchObject({ code: LocalStorageErrorCode.EntryNotFound });
    expect((error as Error).message).not.toContain(root);
  });
});
