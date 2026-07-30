import path from 'node:path';

export enum VolumeKind {
  Private = 'private',
  Shared = 'shared',
}

export enum VolumeAccess {
  ReadOnly = 'read-only',
  ReadWrite = 'read-write',
}

export enum VolumeErrorCode {
  InvalidOwner = 'invalid-owner',
  InvalidSpaceName = 'invalid-space-name',
  UnknownVolume = 'unknown-volume',
  /** The caller may see this volume but not change it; see ADR 0012. */
  ReadOnlyVolume = 'read-only-volume',
}

export class VolumeError extends Error {
  constructor(
    readonly code: VolumeErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'VolumeError';
  }
}

export interface Volume {
  /** Stable identifier used by clients. Never a host path. */
  readonly id: string;
  readonly name: string;
  readonly kind: VolumeKind;
  readonly access: VolumeAccess;
  /**
   * Host path of the volume itself: the directory holding the browsable tree and the service
   * directories beside it.
   *
   * The volume's filesystem identity and its marker file are properties of *this* directory rather
   * than of `files`, because a mount that disappears takes the trash with it, and health has to be a
   * statement about the whole volume rather than about one directory inside it.
   */
  readonly rootPath: string;
  /**
   * Host path of the volume's browsable tree, and the root a storage adapter is given.
   *
   * Service directories are siblings of this path rather than entries inside it, so an adapter
   * confined to `files` cannot reach them at all. That is a structural guarantee, not a convention.
   */
  readonly filesPath: string;
  readonly trashPath: string;
  readonly tempPath: string;
}

export const PRIVATE_VOLUME_ID = 'private';
const SHARED_VOLUME_PREFIX = 'shared:';

const FILES_DIRECTORY = 'files';
const TRASH_DIRECTORY = '.trash';
const TEMP_DIRECTORY = '.tmp';

/**
 * A single path segment safe to place under the storage root.
 *
 * Owner identifiers arrive from an authenticated session and space names from configuration, so
 * neither is attacker-controlled today. They are still validated, because a malformed value would
 * otherwise become a path escape rather than an error.
 */
const isSafeSegment = (value: string): boolean =>
  /^[\w.-]+$/.test(value) && value !== '.' && value !== '..' && !value.startsWith('.');

export const assertOwnerId = (ownerId: string): string => {
  if (!isSafeSegment(ownerId)) {
    throw new VolumeError(VolumeErrorCode.InvalidOwner, 'Owner identifier is not a usable path segment');
  }

  return ownerId;
};

export const assertSpaceName = (name: string): string => {
  if (!isSafeSegment(name)) {
    throw new VolumeError(
      VolumeErrorCode.InvalidSpaceName,
      `Shared space name "${name}" must be a single path segment of letters, digits, dot, dash, or underscore`,
    );
  }

  return name;
};

export const sharedVolumeId = (name: string): string => `${SHARED_VOLUME_PREFIX}${assertSpaceName(name)}`;

/** Returns the space name for a shared volume identifier, or `undefined` for any other identifier. */
export const parseSharedVolumeId = (volumeId: string): string | undefined => {
  if (!volumeId.startsWith(SHARED_VOLUME_PREFIX)) {
    return undefined;
  }

  const name = volumeId.slice(SHARED_VOLUME_PREFIX.length);
  return isSafeSegment(name) ? name : undefined;
};

const buildVolume = (base: string, parts: Pick<Volume, 'id' | 'name' | 'kind' | 'access'>): Volume => ({
  ...parts,
  rootPath: base,
  filesPath: path.join(base, FILES_DIRECTORY),
  trashPath: path.join(base, TRASH_DIRECTORY),
  tempPath: path.join(base, TEMP_DIRECTORY),
});

export const privateVolume = (storageRoot: string, ownerId: string): Volume =>
  buildVolume(path.join(storageRoot, 'users', assertOwnerId(ownerId)), {
    id: PRIVATE_VOLUME_ID,
    name: 'My files',
    kind: VolumeKind.Private,
    access: VolumeAccess.ReadWrite,
  });

/**
 * Identifies one volume in the index, independently of who is addressing it.
 *
 * Every owner addresses their own volume as `private`, so the client-facing identifier is not unique
 * across a deployment and the owner has to be part of the key. A shared volume belongs to the
 * deployment rather than to a person, so its identifier already is its key.
 */
export const volumeKey = (ownerId: string, volume: Volume): string =>
  volume.kind === VolumeKind.Private ? `${assertOwnerId(ownerId)}:${PRIVATE_VOLUME_ID}` : volume.id;

export const sharedVolume = (storageRoot: string, name: string): Volume =>
  buildVolume(path.join(storageRoot, 'shared', assertSpaceName(name)), {
    id: sharedVolumeId(name),
    name,
    kind: VolumeKind.Shared,
    access: VolumeAccess.ReadWrite,
  });
