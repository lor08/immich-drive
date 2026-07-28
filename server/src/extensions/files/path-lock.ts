import { Injectable } from '@nestjs/common';
import { Kysely, sql } from 'kysely';
import { InjectKysely } from 'nestjs-kysely';
import { createHash } from 'node:crypto';
import { DB } from 'src/schema';

/**
 * Lock class reserved for the Immich Drive file domain.
 *
 * PostgreSQL keeps `pg_advisory_lock(bigint)` and `pg_advisory_lock(int, int)` in separate lock
 * spaces, and Immich uses the single-argument form for its `DatabaseLock` keys. Using the
 * two-argument form with a class of our own therefore cannot collide with those keys by
 * construction — not merely by choosing hash values that happen to miss them.
 */
const DRIVE_LOCK_CLASS = 0x64_72_76_31; // 'drv1'

/**
 * Derives the lock object id for one entry.
 *
 * The 32-bit space means two unrelated paths can share an id and serialise against each other. That
 * costs throughput and never correctness, which is the right trade for a mechanism that has to work
 * before there is any schema to hold real identities.
 */
export const pathLockId = (volumeId: string, path: string): number => {
  const digest = createHash('sha256').update(`${volumeId}\0${path}`).digest();
  // Signed, because the parameter is int4.
  return digest.readInt32BE(0);
};

@Injectable()
export class PathLock {
  constructor(@InjectKysely() private db: Kysely<DB>) {}

  /**
   * Runs `handler` while holding the advisory lock for one volume and path.
   *
   * The connection is pinned for the duration and the lock is released in a `finally`, so a throwing
   * handler cannot leave it held. A transaction is deliberately not used: holding one open across
   * filesystem work would be wrong for long operations such as uploads.
   */
  async withPathLock<T>(volumeId: string, path: string, handler: () => Promise<T>): Promise<T> {
    const objectId = pathLockId(volumeId, path);

    return this.db.connection().execute(async (connection) => {
      await sql`SELECT pg_advisory_lock(${DRIVE_LOCK_CLASS}, ${objectId})`.execute(connection);

      try {
        return await handler();
      } finally {
        await sql`SELECT pg_advisory_unlock(${DRIVE_LOCK_CLASS}, ${objectId})`.execute(connection);
      }
    });
  }
}
