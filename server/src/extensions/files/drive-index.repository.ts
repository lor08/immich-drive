import { Injectable } from '@nestjs/common';
import { Kysely, sql, Transaction } from 'kysely';
import { InjectKysely } from 'nestjs-kysely';
import { FileEntryType } from 'src/extensions/files/file-entry';
import { DriveEntryState, DriveVolumeState } from 'src/extensions/files/index-state';
import { DB } from 'src/schema';

/** Either the pool or an open transaction, so one statement can be written once and reused in both. */
type Executor = Kysely<DB> | Transaction<DB>;

export interface DriveVolumeRecord {
  /** `<ownerId>:private` or `shared:<space>`; see `volumeKey`. */
  readonly key: string;
  /** Null for a shared volume, which belongs to the deployment rather than to a person. */
  readonly ownerId: string | null;
  readonly volumeId: string;
  readonly device: string;
  readonly inode: string;
  readonly markerId: string | null;
}

export interface DriveEntryRecord {
  readonly volumeId: string;
  readonly path: string;
  readonly parentPath: string;
  readonly name: string;
  readonly type: FileEntryType;
  readonly size: number;
  readonly modifiedAt: Date;
}

export interface DriveVolumeRow {
  readonly id: string;
  readonly device: string | null;
  readonly inode: string | null;
  readonly markerId: string | null;
  readonly state: DriveVolumeState;
  readonly checkpoint: string | null;
  readonly scannedAt: Date | null;
}

export interface DriveEntryRow {
  readonly path: string;
  readonly name: string;
  readonly type: FileEntryType;
  readonly size: number;
  readonly modifiedAt: Date;
  readonly state: DriveEntryState;
}

export interface DriveMoveRecord {
  readonly volumeId: string;
  readonly sourcePath: string;
  /** The entry as the filesystem reports it after the move, which is what the row must agree with. */
  readonly entry: DriveEntryRecord;
}

/**
 * Persistence for the Drive index.
 *
 * Deliberately free of domain logic: it takes rows and writes them. Which mutation writes what, and
 * the rule that a failed write must never fail the filesystem operation, live in `DriveIndexService`.
 */
@Injectable()
export class DriveIndexRepository {
  constructor(@InjectKysely() private db: Kysely<DB>) {}

  /**
   * Records the volume and returns its row id.
   *
   * Identity is written once and never overwritten. `coalesce` keeps whatever was recorded first, so a
   * root whose device or inode has since changed still reads as the old value — which is precisely the
   * evidence [ADR 0007](../../../../docs/adr/0007-reconciliation-and-mount-health.md) gates removals
   * on. Overwriting here would quietly erase the only proof that a mount was swapped.
   */
  async upsertVolume(volume: DriveVolumeRecord): Promise<string> {
    const { id } = await this.db
      .insertInto('drive_volume')
      .values(volume)
      .onConflict((oc) =>
        oc.column('key').doUpdateSet((eb) => ({
          ownerId: eb.ref('excluded.ownerId'),
          volumeId: eb.ref('excluded.volumeId'),
          device: sql<string>`coalesce("drive_volume"."device", excluded."device")`,
          inode: sql<string>`coalesce("drive_volume"."inode", excluded."inode")`,
          markerId: sql<string>`coalesce("drive_volume"."markerId", excluded."markerId")`,
          updatedAt: sql<Date>`now()`,
        })),
      )
      .returning('id')
      .executeTakeFirstOrThrow();

    return id;
  }

  /** The volume row, or `undefined` when no mutation has ever touched this volume. */
  async getVolume(key: string): Promise<DriveVolumeRow | undefined> {
    return this.db
      .selectFrom('drive_volume')
      .select(['id', 'device', 'inode', 'markerId', 'state', 'checkpoint', 'scannedAt'])
      .where('key', '=', key)
      .executeTakeFirst();
  }

  async countEntries(volumeId: string): Promise<number> {
    const { count } = await this.db
      .selectFrom('drive_entry')
      .select((eb) => eb.fn.countAll<number>().as('count'))
      .where('volumeId', '=', volumeId)
      .executeTakeFirstOrThrow();

    return count;
  }

  /** Every row the index holds directly under one folder. Ordered so a comparison is reproducible. */
  async getChildren(volumeId: string, parentPath: string): Promise<DriveEntryRow[]> {
    return this.db
      .selectFrom('drive_entry')
      .select(['path', 'name', 'type', 'size', 'modifiedAt', 'state'])
      .where('volumeId', '=', volumeId)
      .where('parentPath', '=', parentPath)
      .orderBy('name')
      .execute();
  }

  /** Records one entry as present, whether or not the index already knew about it. */
  async upsertEntry(entry: DriveEntryRecord): Promise<void> {
    await this.upsertEntryWith(this.db, entry);
  }

  /** Moves one row to a state, leaving everything the filesystem disagrees about untouched. */
  async setEntryState(volumeId: string, path: string, state: DriveEntryState): Promise<void> {
    await this.db
      .updateTable('drive_entry')
      .set({ state, updatedAt: sql<Date>`now()` })
      .where('volumeId', '=', volumeId)
      .where('path', '=', path)
      .execute();
  }

  /**
   * Marks a row and everything under it as missing, and answers how many rows that was.
   *
   * A folder that is gone takes its descendants with it, and those descendants live in directories the
   * scan will never visit — precisely because they no longer exist — so they have to be marked from the
   * ancestor rather than found on their own. Nothing is deleted: `missing` is a statement, and only an
   * explicit operator action turns it into a removal.
   */
  async markSubtreeMissing(volumeId: string, path: string): Promise<number> {
    const result = await this.db
      .updateTable('drive_entry')
      .set({ state: DriveEntryState.Missing, updatedAt: sql<Date>`now()` })
      .where('volumeId', '=', volumeId)
      .where((eb) => eb.or([eb('path', '=', path), eb(sql<boolean>`starts_with("path", ${`${path}/`})`, '=', true)]))
      .executeTakeFirst();

    return Number(result.numUpdatedRows);
  }

  /** Where an interrupted pass stopped, so the next one resumes instead of restarting. */
  async setCheckpoint(volumeId: string, checkpoint: string | null): Promise<void> {
    await this.db
      .updateTable('drive_volume')
      .set({ checkpoint, updatedAt: sql<Date>`now()` })
      .where('id', '=', volumeId)
      .execute();
  }

  /**
   * Records the conclusion of a pass.
   *
   * `scannedAt` moves only when a pass completed, so "last fully reconciled" cannot be confused with
   * "last attempted" — an unhealthy volume that is retried hourly must not look freshly scanned.
   */
  async recordPass(volumeId: string, pass: { state: DriveVolumeState; completed: boolean }): Promise<void> {
    await this.db
      .updateTable('drive_volume')
      .set({
        state: pass.state,
        ...(pass.completed && { scannedAt: sql<Date>`now()`, checkpoint: null }),
        updatedAt: sql<Date>`now()`,
      })
      .where('id', '=', volumeId)
      .execute();
  }

  /**
   * Rewrites a moved subtree in one transaction.
   *
   * Four statements, and the order is the point. Any row at the destination is stale by construction —
   * the adapter refuses to move onto an existing entry — so it goes first, otherwise the rewrite below
   * would collide with it on `(volumeId, path)`. Descendants are then rewritten by prefix, which is one
   * statement no matter how large the subtree is; the row for the source itself is removed and
   * re-inserted instead, because a move can also be a rename and its `name` changes with it.
   *
   * The transaction is what keeps a crash from leaving half a subtree pointing at a path that no longer
   * exists. It is also the only place in the domain that can deadlock against itself — two overlapping
   * moves taking row locks in opposite orders — and PostgreSQL aborting one of them is harmless here,
   * because the caller treats a failed index write as a divergence for reconciliation to repair rather
   * than as a failed operation.
   */
  async moveSubtree({ volumeId, sourcePath, entry }: DriveMoveRecord): Promise<void> {
    await this.db.transaction().execute(async (trx) => {
      await this.deleteSubtreeWith(trx, volumeId, entry.path);

      await trx
        .updateTable('drive_entry')
        .set({
          // char_length is computed by PostgreSQL rather than in JavaScript on purpose: a name outside
          // the basic multilingual plane counts as two UTF-16 units here and one character there, and
          // slicing at the wrong offset would corrupt every descendant path.
          path: sql<string>`${entry.path} || substring("path" from char_length(${sourcePath}) + 1)`,
          parentPath: sql<string>`${entry.path} || substring("parentPath" from char_length(${sourcePath}) + 1)`,
          updatedAt: sql<Date>`now()`,
        })
        .where('volumeId', '=', volumeId)
        .where(sql<boolean>`starts_with("path", ${`${sourcePath}/`})`)
        .execute();

      await trx.deleteFrom('drive_entry').where('volumeId', '=', volumeId).where('path', '=', sourcePath).execute();

      await this.upsertEntryWith(trx, entry);
    });
  }

  /** Forgets an entry and everything under it, which is what a path ceasing to exist means. */
  async deleteSubtree(volumeId: string, path: string): Promise<void> {
    await this.deleteSubtreeWith(this.db, volumeId, path);
  }

  private async upsertEntryWith(executor: Executor, entry: DriveEntryRecord): Promise<void> {
    await executor
      .insertInto('drive_entry')
      .values({ ...entry, state: DriveEntryState.Present })
      .onConflict((oc) =>
        oc.columns(['volumeId', 'path']).doUpdateSet((eb) => ({
          parentPath: eb.ref('excluded.parentPath'),
          name: eb.ref('excluded.name'),
          type: eb.ref('excluded.type'),
          size: eb.ref('excluded.size'),
          modifiedAt: eb.ref('excluded.modifiedAt'),
          state: eb.ref('excluded.state'),
          updatedAt: sql<Date>`now()`,
        })),
      )
      .execute();
  }

  /**
   * `starts_with` rather than `LIKE`, because a path is allowed to contain `%` and `_` and escaping
   * them for a pattern match is a bug waiting to be written.
   */
  private async deleteSubtreeWith(executor: Executor, volumeId: string, path: string): Promise<void> {
    await executor
      .deleteFrom('drive_entry')
      .where('volumeId', '=', volumeId)
      .where((eb) => eb.or([eb('path', '=', path), eb(sql<boolean>`starts_with("path", ${`${path}/`})`, '=', true)]))
      .execute();
  }
}
