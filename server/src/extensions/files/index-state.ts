/**
 * Whether a volume has been verified as the volume it claims to be.
 *
 * Reconciliation may only draw conclusions from a `Healthy` volume. `Unverified` is the honest state
 * of a row that exists because a mutation touched the volume, before any pass has confirmed its
 * identity, and it is the default for exactly that reason.
 */
export enum DriveVolumeState {
  Unverified = 'unverified',
  Healthy = 'healthy',
  Unhealthy = 'unhealthy',
}

/**
 * What the index believes about one entry.
 *
 * `Missing` and `Conflicted` exist because reconciliation is non-destructive: a row whose file is
 * gone, or whose file disagrees with the row, is marked rather than removed or overwritten. Only an
 * explicit operator action turns either into a deletion.
 */
export enum DriveEntryState {
  Present = 'present',
  Missing = 'missing',
  Conflicted = 'conflicted',
}
