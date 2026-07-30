import { CronTime } from 'cron';
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

/**
 * Cron expression for scheduled reconciliation passes.
 *
 * Unset means nothing is scheduled, and that is the default. Reconciliation reads every volume's tree,
 * so switching it on for every deployment that merely upgrades would be exactly the kind of surprise a
 * fork must not spring; `P1-06` behaviour stays identical until an operator asks for a schedule.
 *
 * A useful starting point is `0 4 * * *` — once a night, outside the hours anyone is uploading.
 */
export const DRIVE_RECONCILE_CRON_VARIABLE = 'IMMICH_DRIVE_RECONCILE_CRON';

/**
 * How many megabytes one reconciliation pass may read purely to give existing files a digest.
 *
 * Unset means none, and that is the default: every existing file already works without a checksum, and
 * reading a whole volume is not something a deployment should inherit by upgrading. A pass spends the
 * budget and stops, so progress accumulates across passes.
 */
export const DRIVE_CHECKSUM_BUDGET_VARIABLE = 'IMMICH_DRIVE_CHECKSUM_BUDGET_MB';

export type DriveConfig =
  | { enabled: false }
  | {
      enabled: true;
      root: string;
      sharedSpace?: string;
      trashRetentionDays?: number;
      reconcileCron?: string;
      checksumBudgetBytes?: number;
    };

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

/**
 * Reads the schedule, refusing an expression the scheduler could not use.
 *
 * Validated here, while the module is being constructed, so a typo fails startup with the operator
 * looking at it. The alternative is a server that starts, reports nothing, and simply never reconciles —
 * indistinguishable from a deployment that never configured a schedule at all.
 */
const readReconcileCron = (raw: string | undefined): string | undefined => {
  const expression = raw?.trim();
  if (!expression) {
    return undefined;
  }

  try {
    // The scheduler's own parser, so what is accepted here is exactly what it will accept later.
    new CronTime(expression);
  } catch (error) {
    throw new Error(
      `${DRIVE_RECONCILE_CRON_VARIABLE} is not a usable cron expression ("${expression}"): ${
        error instanceof Error ? error.message : String(error)
      }`,
      { cause: error },
    );
  }

  return expression;
};

/** Reads the budget in megabytes, refusing anything that is not a positive whole number of them. */
const readChecksumBudget = (raw: string | undefined): number | undefined => {
  const value = raw?.trim();
  if (!value) {
    return undefined;
  }

  const megabytes = Number(value);
  if (!Number.isSafeInteger(megabytes) || megabytes <= 0) {
    throw new Error(`${DRIVE_CHECKSUM_BUDGET_VARIABLE} must be a positive whole number of megabytes, got "${value}"`);
  }

  return megabytes * 1024 * 1024;
};

export const readDriveConfig = (env: Record<string, string | undefined>): DriveConfig => {
  const root = env[DRIVE_ROOT_VARIABLE]?.trim();

  if (!root) {
    return { enabled: false };
  }

  const sharedSpace = env[DRIVE_SHARED_SPACE_VARIABLE]?.trim();
  const trashRetentionDays = readRetentionDays(env[DRIVE_TRASH_RETENTION_VARIABLE]);
  const reconcileCron = readReconcileCron(env[DRIVE_RECONCILE_CRON_VARIABLE]);
  const checksumBudgetBytes = readChecksumBudget(env[DRIVE_CHECKSUM_BUDGET_VARIABLE]);

  return {
    enabled: true,
    root,
    ...(sharedSpace && { sharedSpace: assertSpaceName(sharedSpace) }),
    ...(trashRetentionDays !== undefined && { trashRetentionDays }),
    ...(reconcileCron !== undefined && { reconcileCron }),
    ...(checksumBudgetBytes !== undefined && { checksumBudgetBytes }),
  };
};
