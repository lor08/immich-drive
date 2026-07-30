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
import { VolumeAccess } from 'src/extensions/files/volume';
import { UserTable } from 'src/schema/tables/user.table';

/**
 * Who may reach a shared volume, and how.
 *
 * The first Drive table that is **not** a cache. Nothing on disk records who is allowed into
 * `/shared/family` — a volume is served by one process user, so the mode bits carry no per-person
 * information — which means this is authoritative state rather than something a scan could rebuild. That
 * change to the fork's promise is argued in [ADR 0012](../../../../docs/adr/0012-shared-volume-membership.md).
 *
 * `volumeKey` is the volume's key as text rather than a foreign key to `drive_volume`, and that is the
 * point of the design: the index tables are a cache whose documented recovery is "drop them and run a
 * pass", and membership has to survive that. A cascading reference would mean rebuilding the cache
 * silently revoked everyone's access.
 *
 * There is no row for a private volume. Ownership there is derived from the path, which cannot be lost.
 */
@Table('drive_volume_member')
@Unique({ columns: ['volumeKey', 'userId'] })
export class DriveVolumeMemberTable {
  @PrimaryGeneratedUuidV7Column()
  id!: Generated<string>;

  /** `shared:<space>`; see `volumeKey`. Private volumes are never listed here. */
  @Column()
  volumeKey!: string;

  @ForeignKeyColumn(() => UserTable, { onDelete: 'CASCADE', onUpdate: 'CASCADE' })
  userId!: string;

  @Column()
  access!: VolumeAccess;

  @CreateDateColumn()
  createdAt!: Generated<Timestamp>;

  @UpdateDateColumn()
  updatedAt!: Generated<Timestamp>;
}
