import {
  Column,
  CreateDateColumn,
  ForeignKeyColumn,
  Generated,
  Table,
  Timestamp,
  Unique,
  UpdateDateColumn,
} from '@immich/sql-tools';
import { PrimaryGeneratedUuidV7Column } from 'src/decorators';
import { DriveVolumeState } from 'src/extensions/files/index-state';
import { UserTable } from 'src/schema/tables/user.table';

/**
 * One row per volume the server has indexed.
 *
 * This table exists mostly so that reconciliation can refuse to act. [ADR 0007] requires a volume's
 * filesystem identity and a marker written into it to be known *before* an empty tree may be read as
 * a deletion, and neither fact can live on the filesystem alone — that is exactly the thing that goes
 * missing when a mount disappears.
 *
 * `key` is the natural identity: `<ownerId>:private` for a private volume, `shared:<space>` for a
 * shared one. It exists as its own column because the client-facing identifier is `private` for every
 * owner, so `(ownerId, volumeId)` would need a unique index over a nullable column, and PostgreSQL
 * treats nulls as distinct — two rows for one shared space would be allowed.
 */
@Table('drive_volume')
@Unique({ columns: ['key'] })
export class DriveVolumeTable {
  @PrimaryGeneratedUuidV7Column()
  id!: Generated<string>;

  @Column()
  key!: string;

  /** Null for a shared volume, which belongs to the deployment rather than to a person. */
  @ForeignKeyColumn(() => UserTable, { onDelete: 'CASCADE', onUpdate: 'CASCADE', nullable: true })
  ownerId!: string | null;

  /** The identifier clients address, which is not unique on its own. */
  @Column()
  volumeId!: string;

  /**
   * Filesystem identity of the volume root, as text.
   *
   * `st_dev` and `st_ino` are 64-bit, and the point of recording them is to notice when the directory
   * at that path is no longer the same directory.
   */
  @Column({ nullable: true })
  device!: string | null;

  @Column({ nullable: true })
  inode!: string | null;

  /** Identifier written into the volume's marker file when it was initialised. */
  @Column({ nullable: true })
  markerId!: string | null;

  @Column({ default: DriveVolumeState.Unverified })
  state!: Generated<DriveVolumeState>;

  /**
   * Where the last reconciliation pass stopped, so an interrupted run resumes instead of restarting.
   * Written by `P1-06`; this task only creates it.
   */
  @Column({ nullable: true })
  checkpoint!: string | null;

  @Column({ type: 'timestamp with time zone', nullable: true })
  scannedAt!: Timestamp | null;

  @CreateDateColumn()
  createdAt!: Generated<Timestamp>;

  @UpdateDateColumn()
  updatedAt!: Generated<Timestamp>;
}
