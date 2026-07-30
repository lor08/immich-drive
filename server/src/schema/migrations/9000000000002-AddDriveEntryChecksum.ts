import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  await sql`ALTER TABLE "drive_entry" ADD "checksum" character varying;`.execute(db);
  await sql`ALTER TABLE "drive_entry" ADD "checksumAlgorithm" character varying;`.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  await sql`ALTER TABLE "drive_entry" DROP COLUMN "checksum";`.execute(db);
  await sql`ALTER TABLE "drive_entry" DROP COLUMN "checksumAlgorithm";`.execute(db);
}
