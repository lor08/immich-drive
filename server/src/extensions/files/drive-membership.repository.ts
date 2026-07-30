import { Injectable } from '@nestjs/common';
import { Kysely, sql } from 'kysely';
import { InjectKysely } from 'nestjs-kysely';
import { VolumeAccess } from 'src/extensions/files/volume';
import { DB } from 'src/schema';

export interface VolumeMembership {
  readonly volumeKey: string;
  readonly userId: string;
  readonly access: VolumeAccess;
}

/** A member as an administrator needs to see them: the person, not just their identifier. */
export interface VolumeMemberDetail extends VolumeMembership {
  readonly email: string;
  readonly name: string;
}

/**
 * Persistence for shared-volume membership.
 *
 * Separate from `DriveIndexRepository` on purpose, and not merely for tidiness: the index is a cache the
 * fork tells operators to drop and rebuild, while this is authoritative state that must survive exactly
 * that. Keeping them in different repositories makes the difference visible at every call site.
 * See [ADR 0012](../../../../docs/adr/0012-shared-volume-membership.md).
 */
@Injectable()
export class DriveMembershipRepository {
  constructor(@InjectKysely() private db: Kysely<DB>) {}

  /** One membership, or `undefined` — which means no access, never unrestricted access. */
  async get(volumeKey: string, userId: string): Promise<VolumeMembership | undefined> {
    return this.db
      .selectFrom('drive_volume_member')
      .select(['volumeKey', 'userId', 'access'])
      .where('volumeKey', '=', volumeKey)
      .where('userId', '=', userId)
      .executeTakeFirst();
  }

  /** Every volume key the user is a member of, so a listing can be filtered in one query. */
  async listForUser(userId: string): Promise<VolumeMembership[]> {
    return this.db
      .selectFrom('drive_volume_member')
      .select(['volumeKey', 'userId', 'access'])
      .where('userId', '=', userId)
      .execute();
  }

  async listForVolume(volumeKey: string): Promise<VolumeMemberDetail[]> {
    return this.db
      .selectFrom('drive_volume_member')
      .innerJoin('user', 'user.id', 'drive_volume_member.userId')
      .select([
        'drive_volume_member.volumeKey',
        'drive_volume_member.userId',
        'drive_volume_member.access',
        'user.email',
        'user.name',
      ])
      .where('drive_volume_member.volumeKey', '=', volumeKey)
      .orderBy('user.email')
      .execute();
  }

  /** Adds a member, or changes the access of one who is already there. */
  async upsert(membership: VolumeMembership): Promise<void> {
    await this.db
      .insertInto('drive_volume_member')
      .values(membership)
      .onConflict((oc) =>
        oc.columns(['volumeKey', 'userId']).doUpdateSet((eb) => ({
          access: eb.ref('excluded.access'),
          updatedAt: sql<Date>`now()`,
        })),
      )
      .execute();
  }

  /** Removes a member, answering whether there was one to remove. */
  async remove(volumeKey: string, userId: string): Promise<boolean> {
    const result = await this.db
      .deleteFrom('drive_volume_member')
      .where('volumeKey', '=', volumeKey)
      .where('userId', '=', userId)
      .executeTakeFirst();

    return Number(result.numDeletedRows) > 0;
  }
}
