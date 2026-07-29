import { assertSpaceName } from 'src/extensions/files/volume';

/**
 * Injection token for the resolved configuration.
 *
 * Declared here rather than in the module so that a provider needing the configuration does not have to
 * import the module that registers it — which would close an import cycle through the controller and
 * its DTOs.
 */
export const DRIVE_CONFIG = 'DRIVE_CONFIG';

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

/**
 * How long a trash record may sit before reconciliation is allowed to remove it.
 *
 * Unset means never, and that is the default on purpose: expiry is the one destructive thing
 * reconciliation can do, and [ADR 0007](../../../../docs/adr/0007-reconciliation-and-mount-health.md)
 * requires destruction to be an explicit operator decision rather than something a deployment inherits.
 */
export const DRIVE_TRASH_RETENTION_VARIABLE = 'IMMICH_DRIVE_TRASH_RETENTION_DAYS';

export type DriveConfig =
  { enabled: false } | { enabled: true; root: string; sharedSpace?: string; trashRetentionDays?: number };

/**
 * Reads the retention window, refusing anything that is not a positive whole number of days.
 *
 * A malformed value is rejected rather than ignored: silently treating `IMMICH_DRIVE_TRASH_RETENTION_DAYS=0`
 * or `thirty` as "never" would look identical to a deployment that meant to configure expiry, and the
 * operator would find out by noticing their trash never empties.
 */
const readRetentionDays = (raw: string | undefined): number | undefined => {
  const value = raw?.trim();
  if (!value) {
    return undefined;
  }

  const days = Number(value);
  if (!Number.isSafeInteger(days) || days <= 0) {
    throw new Error(`${DRIVE_TRASH_RETENTION_VARIABLE} must be a positive whole number of days, got "${value}"`);
  }

  return days;
};

export const readDriveConfig = (env: Record<string, string | undefined>): DriveConfig => {
  const root = env[DRIVE_ROOT_VARIABLE]?.trim();

  if (!root) {
    return { enabled: false };
  }

  const sharedSpace = env[DRIVE_SHARED_SPACE_VARIABLE]?.trim();
  const trashRetentionDays = readRetentionDays(env[DRIVE_TRASH_RETENTION_VARIABLE]);

  return {
    enabled: true,
    root,
    ...(sharedSpace && { sharedSpace: assertSpaceName(sharedSpace) }),
    ...(trashRetentionDays !== undefined && { trashRetentionDays }),
  };
};
