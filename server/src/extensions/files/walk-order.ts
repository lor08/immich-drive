/** Segments of a normalized virtual path. The volume root is the empty list. */
export const pathSegments = (virtualPath: string): string[] =>
  virtualPath === '/' ? [] : virtualPath.slice(1).split('/');

/**
 * Orders two paths the way a depth-first walk with name-sorted children visits them: a folder comes
 * before everything inside it, and siblings come in name order.
 *
 * This is deliberately **not** a string comparison of the paths. `'-'` is below `'/'` in ASCII, so as
 * strings `'/a-b' < '/a/x'`, while the walk visits `/a`, then `/a/x`, then `/a-b`. A checkpoint compared
 * the string way would therefore declare `/a/x` already done when the walk had not reached it, and the
 * resumed pass would skip real work — silently, and only for names containing certain characters.
 *
 * Comparing segment lists element-wise gives exactly the walk's order, with a parent sorting before its
 * children because its list is a prefix of theirs.
 */
export const compareWalkOrder = (left: string, right: string): number => {
  const leftSegments = pathSegments(left);
  const rightSegments = pathSegments(right);
  const shared = Math.min(leftSegments.length, rightSegments.length);

  for (let index = 0; index < shared; index++) {
    const leftSegment = leftSegments[index];
    const rightSegment = rightSegments[index];
    if (leftSegment !== rightSegment) {
      return leftSegment < rightSegment ? -1 : 1;
    }
  }

  return leftSegments.length - rightSegments.length;
};

/** Whether `ancestor` is `descendant` or contains it. */
export const containsPath = (ancestor: string, descendant: string): boolean => {
  const ancestorSegments = pathSegments(ancestor);
  const descendantSegments = pathSegments(descendant);

  return (
    ancestorSegments.length <= descendantSegments.length &&
    ancestorSegments.every((segment, index) => segment === descendantSegments[index])
  );
};

/**
 * Whether a whole subtree was already reconciled by the time the pass reached `checkpoint`.
 *
 * A directory that sorts before the checkpoint and does not contain it has every descendant sorting
 * before the checkpoint too — descendants share its leading segments, so the first segment that
 * differed from the checkpoint still differs the same way. That is what lets a resumed pass skip an
 * entire branch instead of walking it to find nothing to do.
 */
export const subtreeCompleted = (directoryPath: string, checkpoint: string): boolean =>
  compareWalkOrder(directoryPath, checkpoint) < 0 && !containsPath(directoryPath, checkpoint);
