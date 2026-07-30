import { compareWalkOrder, containsPath, pathSegments, subtreeCompleted } from 'src/extensions/files/walk-order';

const sign = (value: number): number => Math.sign(value);

describe('walk order', () => {
  it('splits a path into segments and treats the root as none', () => {
    expect(pathSegments('/')).toEqual([]);
    expect(pathSegments('/a')).toEqual(['a']);
    expect(pathSegments('/a/b/c.txt')).toEqual(['a', 'b', 'c.txt']);
  });

  it('puts a folder before everything inside it', () => {
    expect(sign(compareWalkOrder('/', '/a'))).toBe(-1);
    expect(sign(compareWalkOrder('/a', '/a/b'))).toBe(-1);
    expect(sign(compareWalkOrder('/a/b', '/a'))).toBe(1);
  });

  it('orders siblings by name', () => {
    expect(sign(compareWalkOrder('/a', '/b'))).toBe(-1);
    expect(sign(compareWalkOrder('/b/x', '/b/y'))).toBe(-1);
  });

  it('is zero only for the same path', () => {
    expect(compareWalkOrder('/a/b', '/a/b')).toBe(0);
    expect(compareWalkOrder('/', '/')).toBe(0);
  });

  /**
   * The reason this comparator exists. `'-'` is below `'/'` in ASCII, so comparing the paths as strings
   * puts `/a-b` before `/a/x`, while the walk reaches `/a/x` first. A checkpoint compared as a string
   * would then treat `/a/x` as already done and skip it — silently, and only for names containing one
   * of the dozen characters that sort below a slash.
   */
  it('disagrees with string comparison exactly where a walk does', () => {
    expect('/a-b' < '/a/x').toBe(true);
    expect(sign(compareWalkOrder('/a-b', '/a/x'))).toBe(1);
  });

  it('recognises a folder that contains another path', () => {
    expect(containsPath('/', '/a/b')).toBe(true);
    expect(containsPath('/a', '/a/b')).toBe(true);
    expect(containsPath('/a', '/a')).toBe(true);
    expect(containsPath('/a', '/ab')).toBe(false);
    expect(containsPath('/a/b', '/a')).toBe(false);
  });

  it('treats a branch as done when it sorts before the checkpoint and does not contain it', () => {
    expect(subtreeCompleted('/a', '/b/c')).toBe(true);
    expect(subtreeCompleted('/a/x', '/b')).toBe(true);
    // On the way to the checkpoint: its children may still be pending.
    expect(subtreeCompleted('/b', '/b/c')).toBe(false);
    expect(subtreeCompleted('/', '/b/c')).toBe(false);
    // After the checkpoint: not yet reached.
    expect(subtreeCompleted('/c', '/b')).toBe(false);
  });

  it('never calls a branch done when it holds the checkpoint, whatever the names look like', () => {
    for (const checkpoint of ['/a/b/c', '/a-b/c', '/50%/x', '/📁/deep/leaf']) {
      for (const ancestor of ['/', ...ancestorsOf(checkpoint)]) {
        expect(subtreeCompleted(ancestor, checkpoint)).toBe(false);
      }
    }
  });
});

const ancestorsOf = (virtualPath: string): string[] => {
  const segments = pathSegments(virtualPath);
  return segments.map((_, index) => `/${segments.slice(0, index + 1).join('/')}`);
};
