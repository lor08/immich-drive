/**
 * Configuration for the Immich Drive file domain.
 *
 * The domain is opt-in. An Immich deployment that upgrades to Immich Drive without setting
 * `IMMICH_DRIVE_ROOT` behaves exactly like upstream Immich, which keeps the upgrade reversible.
 */
export const DRIVE_ROOT_VARIABLE = 'IMMICH_DRIVE_ROOT';

export type DriveConfig = { enabled: false } | { enabled: true; root: string };

export const readDriveConfig = (env: Record<string, string | undefined>): DriveConfig => {
  const value = env[DRIVE_ROOT_VARIABLE]?.trim();

  if (!value) {
    return { enabled: false };
  }

  return { enabled: true, root: value };
};
