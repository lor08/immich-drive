import fs from 'node:fs/promises';
import path from 'node:path';

export enum StorageRootErrorCode {
  NotAbsolute = 'not-absolute',
  InvalidPath = 'invalid-path',
  NotFound = 'not-found',
  NotDirectory = 'not-directory',
  NotAccessible = 'not-accessible',
  ReservedOverlap = 'reserved-overlap',
}

export class StorageRootError extends Error {
  constructor(
    readonly code: StorageRootErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'StorageRootError';
  }
}

export interface StorageRootOptions {
  /** Configured storage root, as supplied by the operator. */
  readonly root: string;
  /**
   * Paths the file domain must never overlap, in either direction. These are the Immich media
   * location and its folders. They are passed in rather than read from Immich statics so this
   * validator stays independent and unit-testable.
   */
  readonly reservedPaths: readonly string[];
}

export interface StorageRoot {
  /** Canonical path with symbolic links resolved. Later checks compare against this, not the input. */
  readonly path: string;
}

/**
 * Resolves a path far enough to compare it with another path.
 *
 * A reserved path may not exist yet in a fresh deployment, so the nearest existing ancestor is
 * resolved and the remaining segments are appended. Without this, a symlinked parent would defeat
 * the overlap check.
 */
const resolveForComparison = async (target: string): Promise<string> => {
  const normalized = path.resolve(target);
  let current = normalized;
  const missing: string[] = [];

  for (;;) {
    try {
      const resolved = await fs.realpath(current);
      return missing.length === 0 ? resolved : path.join(resolved, ...missing.toReversed());
    } catch {
      const parent = path.dirname(current);
      if (parent === current) {
        return normalized;
      }

      missing.push(path.basename(current));
      current = parent;
    }
  }
};

/** True when `inner` is `outer` or lives below it. Compares path segments, not string prefixes. */
const isSameOrInside = (inner: string, outer: string): boolean => {
  if (inner === outer) {
    return true;
  }

  const relative = path.relative(outer, inner);
  return relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative);
};

/**
 * Validates the configured storage root and returns its canonical location.
 *
 * Throws `StorageRootError` with an operator-facing message. These messages intentionally contain
 * host paths: they are read by someone fixing a deployment, never returned through a user API.
 */
export const validateStorageRoot = async ({ root, reservedPaths }: StorageRootOptions): Promise<StorageRoot> => {
  if (root.includes('\0')) {
    throw new StorageRootError(StorageRootErrorCode.InvalidPath, 'Storage root must not contain a null byte');
  }

  if (!path.isAbsolute(root)) {
    throw new StorageRootError(
      StorageRootErrorCode.NotAbsolute,
      `Storage root must be an absolute path, but received "${root}"`,
    );
  }

  let stats;
  try {
    stats = await fs.stat(root);
  } catch {
    throw new StorageRootError(StorageRootErrorCode.NotFound, `Storage root "${root}" does not exist`);
  }

  if (!stats.isDirectory()) {
    throw new StorageRootError(StorageRootErrorCode.NotDirectory, `Storage root "${root}" is not a directory`);
  }

  try {
    await fs.access(root, fs.constants.R_OK | fs.constants.W_OK);
  } catch {
    throw new StorageRootError(
      StorageRootErrorCode.NotAccessible,
      `Storage root "${root}" must be readable and writable by the server process`,
    );
  }

  const canonicalRoot = await fs.realpath(root);

  for (const reservedPath of reservedPaths) {
    const canonicalReserved = await resolveForComparison(reservedPath);

    if (isSameOrInside(canonicalRoot, canonicalReserved)) {
      throw new StorageRootError(
        StorageRootErrorCode.ReservedOverlap,
        `Storage root "${canonicalRoot}" is inside the reserved Immich path "${canonicalReserved}"`,
      );
    }

    if (isSameOrInside(canonicalReserved, canonicalRoot)) {
      throw new StorageRootError(
        StorageRootErrorCode.ReservedOverlap,
        `Reserved Immich path "${canonicalReserved}" is inside the storage root "${canonicalRoot}"`,
      );
    }
  }

  return { path: canonicalRoot };
};
