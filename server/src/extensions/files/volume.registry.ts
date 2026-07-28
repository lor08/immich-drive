import fs from 'node:fs/promises';
import { LocalStorageAdapter } from 'src/extensions/files/local-storage.adapter';
import { StorageAdapter } from 'src/extensions/files/storage.adapter';
import {
  parseSharedVolumeId,
  PRIVATE_VOLUME_ID,
  privateVolume,
  sharedVolume,
  Volume,
  VolumeError,
  VolumeErrorCode,
} from 'src/extensions/files/volume';

/** Owner-only, because every volume is served by the single process user; see ADR 0004. */
const DIRECTORY_MODE = 0o700;

export interface VolumeRegistryOptions {
  /** Canonical storage root, as returned by `validateStorageRoot`. */
  readonly storageRoot: string;
  /** Optional configuration-defined shared space. Membership arrives with the index. */
  readonly sharedSpace?: string;
}

/**
 * Resolves volumes and the adapters that serve them.
 *
 * The registry is configuration-driven. `P1-04` moves it into the schema once volumes gain
 * identity, membership, and lifecycle state of their own.
 */
export class VolumeRegistry {
  private readonly storageRoot: string;
  private readonly sharedSpace?: string;
  private readonly adapters = new Map<string, Promise<StorageAdapter>>();
  private readonly provisioned = new Map<string, Promise<void>>();

  constructor({ storageRoot, sharedSpace }: VolumeRegistryOptions) {
    this.storageRoot = storageRoot;
    this.sharedSpace = sharedSpace;
  }

  /** Every volume the owner can address, in a stable order. */
  async listVolumes(ownerId: string): Promise<Volume[]> {
    const volumes = [await this.resolve(ownerId, PRIVATE_VOLUME_ID)];

    if (this.sharedSpace) {
      volumes.push(await this.resolve(ownerId, `shared:${this.sharedSpace}`));
    }

    return volumes;
  }

  /** Resolves one volume for an owner, provisioning its directories on first use. */
  async resolve(ownerId: string, volumeId: string): Promise<Volume> {
    const volume = this.describe(ownerId, volumeId);
    await this.provision(volume);
    return volume;
  }

  /** Returns the adapter confined to the volume's browsable tree. */
  async getAdapter(ownerId: string, volumeId: string): Promise<StorageAdapter> {
    const volume = await this.resolve(ownerId, volumeId);

    let adapter = this.adapters.get(volume.filesPath);
    if (!adapter) {
      // The staging directory is a sibling of the browsable tree, so uploads can be renamed into
      // place atomically without ever being addressable.
      adapter = LocalStorageAdapter.create(volume.filesPath, volume.tempPath);
      this.adapters.set(volume.filesPath, adapter);
    }

    return adapter;
  }

  private describe(ownerId: string, volumeId: string): Volume {
    if (volumeId === PRIVATE_VOLUME_ID) {
      return privateVolume(this.storageRoot, ownerId);
    }

    const space = parseSharedVolumeId(volumeId);
    if (space !== undefined && space === this.sharedSpace) {
      return sharedVolume(this.storageRoot, space);
    }

    throw new VolumeError(VolumeErrorCode.UnknownVolume, `Unknown volume "${volumeId}"`);
  }

  /**
   * Creates the volume's directories once per process.
   *
   * The promise is cached rather than awaited-then-flagged, so concurrent callers share one attempt
   * and a failure is not silently remembered as success.
   */
  private provision(volume: Volume): Promise<void> {
    let pending = this.provisioned.get(volume.filesPath);
    if (!pending) {
      pending = (async () => {
        for (const directory of [volume.filesPath, volume.trashPath, volume.tempPath]) {
          await fs.mkdir(directory, { recursive: true, mode: DIRECTORY_MODE });
        }
      })().catch((error: unknown) => {
        this.provisioned.delete(volume.filesPath);
        throw error;
      });

      this.provisioned.set(volume.filesPath, pending);
    }

    return pending;
  }
}
