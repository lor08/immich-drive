import { assertSpaceName } from 'src/extensions/files/volume';

/**
 * Configuration for the Immich Drive file domain.
 *
 * The domain is opt-in. An Immich deployment that upgrades to Immich Drive without setting
 * `IMMICH_DRIVE_ROOT` behaves exactly like upstream Immich, which keeps the upgrade reversible.
 */
export const DRIVE_ROOT_VARIABLE = 'IMMICH_DRIVE_ROOT';

/**
 * Optional name of a single shared space every user can address.
 *
 * One space is deliberate: per-user membership needs the index, so until `P1-04` a shared space is
 * either available to everyone or absent.
 */
export const DRIVE_SHARED_SPACE_VARIABLE = 'IMMICH_DRIVE_SHARED_SPACE';

export type DriveConfig = { enabled: false } | { enabled: true; root: string; sharedSpace?: string };

export const readDriveConfig = (env: Record<string, string | undefined>): DriveConfig => {
  const root = env[DRIVE_ROOT_VARIABLE]?.trim();

  if (!root) {
    return { enabled: false };
  }

  const sharedSpace = env[DRIVE_SHARED_SPACE_VARIABLE]?.trim();

  return sharedSpace ? { enabled: true, root, sharedSpace: assertSpaceName(sharedSpace) } : { enabled: true, root };
};
