import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  await sql`CREATE TABLE "drive_volume_member" (
  "id" uuid NOT NULL DEFAULT immich_uuid_v7(),
  "volumeKey" character varying NOT NULL,
  "userId" uuid NOT NULL,
  "access" character varying NOT NULL,
  "createdAt" timestamp with time zone NOT NULL DEFAULT now(),
  "updatedAt" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "drive_volume_member_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user" ("id") ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT "drive_volume_member_volumeKey_userId_uq" UNIQUE ("volumeKey", "userId"),
  CONSTRAINT "drive_volume_member_pkey" PRIMARY KEY ("id")
);`.execute(db);
  await sql`CREATE INDEX "drive_volume_member_userId_idx" ON "drive_volume_member" ("userId");`.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  await sql`DROP TABLE "drive_volume_member";`.execute(db);
}
