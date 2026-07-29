import {
  Column,
  CreateDateColumn,
  ForeignKeyColumn,
  Generated,
  Index,
  Int8,
  Table,
  Timestamp,
  Unique,
  UpdateDateColumn,
} from '@immich/sql-tools';
import { PrimaryGeneratedUuidV7Column } from 'src/decorators';
import { FileEntryType } from 'src/extensions/files/file-entry';
import { DriveEntryState } from 'src/extensions/files/index-state';
import { DriveVolumeTable } from 'src/extensions/files/schema/drive-volume.table';

/**
 * One row per indexed entry.
 *
 * The filesystem stays authoritative ([ADR 0002]): this is a cache that gives an entry a stable
 * identity and gives reconciliation something to compare against. It must be droppable and rebuildable
 * from the tree alone, which is what keeps the fork's rollback story to "remove the fork".
 *
 * `parentPath` is stored rather than derived from `path`, because listing a folder is then one index
 * lookup instead of a pattern match over every descendant.
 */
@Table('drive_entry')
@Unique({ columns: ['volumeId', 'path'] })
@Index({ columns: ['volumeId', 'parentPath'] })
export class DriveEntryTable {
  @PrimaryGeneratedUuidV7Column()
  id!: Generated<string>;

  @ForeignKeyColumn(() => DriveVolumeTable, { onDelete: 'CASCADE', onUpdate: 'CASCADE' })
  volumeId!: string;

  /** Normalized path relative to the volume root, always starting with a slash. Never a host path. */
  @Column()
  path!: string;

  /** `/` for an entry directly under the volume root. */
  @Column()
  parentPath!: string;

  @Column()
  name!: string;

  @Column()
  type!: FileEntryType;

  @Column({ type: 'bigint' })
  size!: Int8;

  @Column({ type: 'timestamp with time zone' })
  modifiedAt!: Timestamp;

  @Column({ default: DriveEntryState.Present })
  state!: Generated<DriveEntryState>;

  @CreateDateColumn()
  createdAt!: Generated<Timestamp>;

  @UpdateDateColumn()
  updatedAt!: Generated<Timestamp>;
}
