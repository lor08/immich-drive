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
