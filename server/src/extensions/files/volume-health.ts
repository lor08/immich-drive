import { DriveVolumeState } from 'src/extensions/files/index-state';

/**
 * Why a volume is not usable as a basis for conclusions.
 *
 * Reported rather than collapsed into a boolean: "the mount is gone" and "someone deleted the marker"
 * call for different actions from an operator, and a health report that cannot tell them apart is not
 * much of a report.
 *
 * This lives apart from the service that produces it because the API describes it too, and a response
 * schema importing a service would put the module, its controller and its DTOs in an import cycle —
 * which fails at load time rather than at compile time, as an enum that is still `undefined` when a
 * schema is built.
 */
export enum VolumeHealthReason {
  /** No mutation has ever touched this volume, so there is nothing recorded to compare against. */
  NotIndexed = 'not-indexed',
  RootUnreadable = 'root-unreadable',
  IdentityChanged = 'identity-changed',
  MarkerMissing = 'marker-missing',
  MarkerMismatch = 'marker-mismatch',
  RootEmptyWhileIndexed = 'root-empty-while-indexed',
}

export interface VolumeHealthReport {
  readonly volumeId: string;
  readonly state: DriveVolumeState;
  readonly reason: VolumeHealthReason | null;
  readonly indexedEntries: number;
  readonly scannedAt: Date | null;
  /** Where the last interrupted pass stopped, as a virtual path. Null when nothing is pending. */
  readonly resumeFrom: string | null;
}

export interface TrashReport {
  readonly records: number;
  /** Records whose manifest could not be read, and which therefore have no known origin or age. */
  readonly damaged: number;
  readonly orphanedManifests: number;
  readonly foreign: number;
  readonly expired: number;
}

export interface ReconcileReport {
  readonly volumeId: string;
  readonly state: DriveVolumeState;
  readonly reason: VolumeHealthReason | null;
  readonly completed: boolean;
  readonly directories: number;
  readonly added: number;
  readonly conflicted: number;
  readonly missing: number;
  readonly recovered: number;
  readonly resumedFrom: string | null;
  readonly stoppedAt: string | null;
  readonly trash: TrashReport | null;
}
