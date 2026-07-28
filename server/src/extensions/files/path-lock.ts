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

/**
 * Orders the lock keys for a set of paths.
 *
 * Sorting is what prevents a deadlock. A request moving `/a` to `/b` and another moving `/b` to `/a`
 * would otherwise each hold what the other waits for; PostgreSQL would break the cycle by aborting
 * one of them, and a user should not receive a deadlock error for an ordinary rename. Ordering by the
 * key itself makes both requests queue instead, without either caller knowing about the other.
 *
 * Duplicates are collapsed, because two different paths can hash to the same key and because a caller
 * may name the same path twice. Acquiring one key twice would otherwise require releasing it twice.
 */
export const orderedPathLockIds = (volumeId: string, paths: readonly string[]): number[] =>
  [...new Set(paths.map((path) => pathLockId(volumeId, path)))].sort((left, right) => left - right);

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
    return this.withPathLocks(volumeId, [path], handler);
  }

  /**
   * Runs `handler` while holding the locks for several paths in one volume.
   *
   * The keys are acquired in the deterministic order above and released in reverse. Only what was
   * actually acquired is released, so a failure part-way through the sequence still leaves nothing
   * held.
   */
  async withPathLocks<T>(volumeId: string, paths: readonly string[], handler: () => Promise<T>): Promise<T> {
    const objectIds = orderedPathLockIds(volumeId, paths);

    return this.db.connection().execute(async (connection) => {
      const acquired: number[] = [];

      try {
        for (const objectId of objectIds) {
          await sql`SELECT pg_advisory_lock(${DRIVE_LOCK_CLASS}, ${objectId})`.execute(connection);
          acquired.push(objectId);
        }

        return await handler();
      } finally {
        for (const objectId of acquired.toReversed()) {
          await sql`SELECT pg_advisory_unlock(${DRIVE_LOCK_CLASS}, ${objectId})`.execute(connection);
        }
      }
    });
  }
}
