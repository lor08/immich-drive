import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  await sql`CREATE TABLE "drive_volume" (
  "id" uuid NOT NULL DEFAULT immich_uuid_v7(),
  "key" character varying NOT NULL,
  "ownerId" uuid,
  "volumeId" character varying NOT NULL,
  "device" character varying,
  "inode" character varying,
  "markerId" character varying,
  "state" character varying NOT NULL DEFAULT 'unverified',
  "checkpoint" character varying,
  "scannedAt" timestamp with time zone,
  "createdAt" timestamp with time zone NOT NULL DEFAULT now(),
  "updatedAt" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "drive_volume_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "user" ("id") ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT "drive_volume_key_uq" UNIQUE ("key"),
  CONSTRAINT "drive_volume_pkey" PRIMARY KEY ("id")
);`.execute(db);
  await sql`CREATE INDEX "drive_volume_ownerId_idx" ON "drive_volume" ("ownerId");`.execute(db);
  await sql`CREATE TABLE "drive_entry" (
  "id" uuid NOT NULL DEFAULT immich_uuid_v7(),
  "volumeId" uuid NOT NULL,
  "path" character varying NOT NULL,
  "parentPath" character varying NOT NULL,
  "name" character varying NOT NULL,
  "type" character varying NOT NULL,
  "size" bigint NOT NULL,
  "modifiedAt" timestamp with time zone NOT NULL,
  "state" character varying NOT NULL DEFAULT 'present',
  "createdAt" timestamp with time zone NOT NULL DEFAULT now(),
  "updatedAt" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "drive_entry_volumeId_fkey" FOREIGN KEY ("volumeId") REFERENCES "drive_volume" ("id") ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT "drive_entry_volumeId_path_uq" UNIQUE ("volumeId", "path"),
  CONSTRAINT "drive_entry_pkey" PRIMARY KEY ("id")
);`.execute(db);
  await sql`CREATE INDEX "drive_entry_volumeId_parentPath_idx" ON "drive_entry" ("volumeId", "parentPath");`.execute(db);
  await sql`CREATE INDEX "drive_entry_volumeId_idx" ON "drive_entry" ("volumeId");`.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  await sql`DROP TABLE "drive_entry";`.execute(db);
  await sql`DROP TABLE "drive_volume";`.execute(db);
}
