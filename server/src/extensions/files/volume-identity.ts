import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

/**
 * The volume marker required by [ADR 0007](../../../../docs/adr/0007-reconciliation-and-mount-health.md).
 *
 * One dot-file at the volume root, and deliberately visible to anyone browsing the volume on the host:
 * [ADR 0002](../../../../docs/adr/0002-transparent-filesystem-storage.md) asks for a tree a person can
 * read without the application, which means the file that proves a volume is itself must also be
 * readable that way.
 */
export const VOLUME_MARKER_NAME = '.immich-drive-volume';

const MARKER_VERSION = 1;
/** Owner-only, like every directory the domain creates; see ADR 0004. */
const MARKER_MODE = 0o600;

export interface VolumeIdentity {
  /** `st_dev` and `st_ino` as text, because both are 64-bit and neither is arithmetic. */
  readonly device: string;
  readonly inode: string;
  /** Null when a marker exists but cannot be read as one — see `readMarkerId`. */
  readonly markerId: string | null;
}

const errorCode = (error: unknown): string | undefined =>
  typeof error === 'object' && error !== null && 'code' in error ? String(error.code) : undefined;

/**
 * Reads the marker identifier.
 *
 * Three outcomes, and the distinction matters: `undefined` means no marker exists yet and one should
 * be written, `null` means a marker exists but says nothing usable, and a string is the identifier.
 * An uninterpretable marker is never rewritten — a file the application does not understand is still
 * someone's data, and the honest report is that the volume has no known identifier.
 */
const readMarkerId = async (file: string): Promise<string | null | undefined> => {
  let raw: string;
  try {
    raw = await fs.readFile(file, 'utf8');
  } catch (error) {
    if (errorCode(error) === 'ENOENT') {
      return undefined;
    }

    throw error;
  }

  try {
    const parsed: unknown = JSON.parse(raw);
    const markerId = (parsed as { markerId?: unknown } | null)?.markerId;
    return typeof markerId === 'string' && markerId.length > 0 ? markerId : null;
  } catch {
    return null;
  }
};

/**
 * Writes the marker once, and answers with whatever identifier the volume ends up carrying.
 *
 * `wx` is what makes this safe to run from several workers at once: the create fails rather than
 * overwriting, and the loser re-reads what the winner wrote. It also refuses to follow a symlink
 * planted at that path, because `O_EXCL` treats an existing symlink as an existing file.
 */
const ensureMarkerId = async (file: string): Promise<string | null> => {
  const existing = await readMarkerId(file);
  if (existing !== undefined) {
    return existing;
  }

  const markerId = randomUUID();
  const content = JSON.stringify({ version: MARKER_VERSION, markerId }, null, 2);

  try {
    await fs.writeFile(file, `${content}\n`, { flag: 'wx', mode: MARKER_MODE });
    return markerId;
  } catch (error) {
    if (errorCode(error) !== 'EEXIST') {
      throw error;
    }

    return (await readMarkerId(file)) ?? null;
  }
};

/**
 * The identity of one volume, initialising its marker on first use.
 *
 * `P1-04` records this; `P1-06` is what acts on it. Nothing here compares the identity against what
 * the index already holds, because a mismatch is a health decision and health gates removals — the
 * one thing this task must not start doing on its own.
 */
export const readVolumeIdentity = async (rootPath: string): Promise<VolumeIdentity> => {
  const stats = await fs.stat(rootPath, { bigint: true });

  return {
    device: stats.dev.toString(),
    inode: stats.ino.toString(),
    markerId: await ensureMarkerId(path.join(rootPath, VOLUME_MARKER_NAME)),
  };
};
