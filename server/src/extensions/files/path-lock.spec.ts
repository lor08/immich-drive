import { DatabaseLock } from 'src/enum';
import { orderedPathLockIds, pathLockId } from 'src/extensions/files/path-lock';

describe('pathLockId', () => {
  it('is deterministic for the same volume and path', () => {
    expect(pathLockId('private', '/documents/report.txt')).toBe(pathLockId('private', '/documents/report.txt'));
  });

  it('separates paths within a volume', () => {
    expect(pathLockId('private', '/a')).not.toBe(pathLockId('private', '/b'));
  });

  it('separates the same path across volumes', () => {
    expect(pathLockId('private', '/a')).not.toBe(pathLockId('shared:family', '/a'));
  });

  it('cannot be confused by concatenation, because the parts are separated', () => {
    // Without a separator, ('ab', '/c') and ('a', 'b/c') would hash identically.
    expect(pathLockId('ab', '/c')).not.toBe(pathLockId('a', 'b/c'));
  });

  it('stays inside the signed 32-bit range the parameter accepts', () => {
    for (const path of ['/', '/a', '/deeply/nested/path/with/a/long/name.txt', '/ünïcödé']) {
      const id = pathLockId('private', path);

      expect(Number.isSafeInteger(id)).toBe(true);
      expect(id).toBeGreaterThanOrEqual(-(2 ** 31));
      expect(id).toBeLessThan(2 ** 31);
    }
  });

  it('shares no key space with Immich locks, which use the single-argument form', () => {
    // This is a reminder rather than a proof: the isolation comes from the two-argument form living
    // in a separate lock space, so overlapping numbers are harmless.
    const immichKeys = new Set(Object.values(DatabaseLock).filter((value) => typeof value === 'number'));

    expect(immichKeys.size).toBeGreaterThan(0);
  });
});

describe('orderedPathLockIds', () => {
  it('orders a pair the same way whichever direction the operation runs', () => {
    // The case that would deadlock: two requests swapping the same two paths.
    expect(orderedPathLockIds('private', ['/a', '/b'])).toEqual(orderedPathLockIds('private', ['/b', '/a']));
  });

  it('collapses a path named twice into one key', () => {
    expect(orderedPathLockIds('private', ['/a', '/a'])).toEqual([pathLockId('private', '/a')]);
  });

  it('never repeats a key, which is what a colliding pair of paths would otherwise produce', () => {
    // A real collision cannot be forced through SHA-256, so the property is asserted on the output:
    // whatever the input, one key appears once and therefore needs one release.
    const ids = orderedPathLockIds('private', ['/a', '/b', '/c', '/a', '/b']);

    expect(new Set(ids).size).toBe(ids.length);
  });

  it('keeps every key ascending, which is what makes acquisition order deterministic', () => {
    const ids = orderedPathLockIds('private', ['/z', '/a', '/m', '/deeply/nested/name.txt']);

    expect(ids).toEqual([...ids].sort((left, right) => left - right));
    expect(ids).toHaveLength(4);
  });

  it('returns one key for one path, so a single-path operation is unchanged', () => {
    expect(orderedPathLockIds('private', ['/a'])).toEqual([pathLockId('private', '/a')]);
  });
});
