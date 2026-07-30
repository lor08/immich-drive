import { createZodDto } from 'nestjs-zod';
import { FileEntryType } from 'src/extensions/files/file-entry';
import { DriveVolumeState } from 'src/extensions/files/index-state';
import { VolumeAccess, VolumeKind } from 'src/extensions/files/volume';
import { VolumeHealthReason } from 'src/extensions/files/volume-health';
import { isoDatetimeToDate } from 'src/validation';
import z from 'zod';

const VolumeKindSchema = z.enum(VolumeKind).describe('Volume kind').meta({ id: 'FileVolumeKind' });
const VolumeAccessSchema = z.enum(VolumeAccess).describe('Volume access mode').meta({ id: 'FileVolumeAccess' });

/**
 * A volume as seen by a client.
 *
 * Host paths are deliberately absent: a client addresses content by volume identifier and a path
 * relative to that volume, never by a location on the server's filesystem.
 */
const VolumeSchema = z
  .object({
    id: z.string().describe('Stable volume identifier used to address content'),
    name: z.string().describe('Display name'),
    kind: VolumeKindSchema,
    access: VolumeAccessSchema,
  })
  .meta({ id: 'FileVolumeResponseDto' });

export class FileVolumeResponseDto extends createZodDto(VolumeSchema) {}

const VolumeStateSchema = z.enum(DriveVolumeState).describe('Volume index state').meta({ id: 'FileVolumeState' });
const VolumeHealthReasonSchema = z
  .enum(VolumeHealthReason)
  .describe('Why a volume is not usable as a basis for conclusions')
  .meta({ id: 'FileVolumeHealthReason' });

/**
 * What the server can currently prove about one volume.
 *
 * `resumeFrom` is a virtual path and never a host path. It is reported because an operator watching a
 * large volume being reconciled across several passes has no other way to see progress.
 */
const VolumeHealthSchema = z
  .object({
    volumeId: z.string().describe('Volume the report is about'),
    state: VolumeStateSchema,
    reason: VolumeHealthReasonSchema.nullable().describe('Reason the volume is unhealthy or unverified'),
    indexedEntries: z.number().int().describe('Entries the index currently holds for this volume'),
    scannedAt: isoDatetimeToDate.nullable().describe('When a pass last completed'),
    resumeFrom: z.string().nullable().describe('Virtual path an interrupted pass will resume from'),
  })
  .meta({ id: 'FileVolumeHealthResponseDto' });

const ReconcileSchema = z
  .object({
    volumeId: z.string().describe('Volume to reconcile'),
    limit: z
      .number()
      .int()
      .positive()
      .optional()
      .describe('Maximum directories to reconcile before saving a checkpoint and returning'),
  })
  .meta({ id: 'FileReconcileDto' });

const TrashReportSchema = z
  .object({
    records: z.number().int().describe('Records the trash holds'),
    damaged: z.number().int().describe('Records whose manifest could not be read'),
    orphanedManifests: z.number().int().describe('Manifests whose content is missing'),
    foreign: z.number().int().describe('Entries in the trash that are not records and are left alone'),
    expired: z.number().int().describe('Records removed because they exceeded the configured retention'),
  })
  .meta({ id: 'FileTrashReportDto' });

/**
 * What a pass did.
 *
 * `added`, `conflicted`, `missing` and `recovered` are counts of index changes, never of file changes:
 * reconciliation does not modify the tree. `completed` is false when the pass stopped at its limit, and
 * `stoppedAt` is then where the next one resumes.
 */
const ReconcileResultSchema = z
  .object({
    volumeId: z.string().describe('Volume the pass ran on'),
    state: VolumeStateSchema,
    reason: VolumeHealthReasonSchema.nullable().describe('Reason the pass refused to draw conclusions'),
    completed: z.boolean().describe('Whether the pass reached the end of the tree'),
    directories: z.number().int().describe('Directories reconciled by this pass'),
    added: z.number().int().describe('Entries this pass discovered on disk and added to the index'),
    conflicted: z
      .number()
      .int()
      .describe('Entries this pass newly found disagreeing with the index; the rows are left untouched'),
    missing: z
      .number()
      .int()
      .describe('Index rows this pass newly marked missing because their file is gone; nothing is removed'),
    recovered: z.number().int().describe('Rows this pass returned to present because the filesystem agreed again'),
    verified: z.number().int().describe('Entries whose content was read to settle a modification-time disagreement'),
    hashed: z.number().int().describe('Entries given a checksum they did not have, within the configured budget'),
    resumedFrom: z.string().nullable().describe('Checkpoint this pass resumed from'),
    stoppedAt: z.string().nullable().describe('Checkpoint saved for the next pass'),
    trash: TrashReportSchema.nullable().describe('Trash findings, present only when the pass completed'),
  })
  .meta({ id: 'FileReconcileResponseDto' });

const VolumeMemberAccessSchema = z
  .enum(VolumeAccess)
  .describe('What a member may do in the volume')
  .meta({ id: 'FileVolumeMemberAccess' });

/**
 * One member of a shared volume.
 *
 * The email and name are included because an administrator manages people, not identifiers; nothing here
 * is a host path or a storage detail.
 */
const VolumeMemberSchema = z
  .object({
    userId: z.string().uuid().describe('User the membership belongs to'),
    email: z.string().describe('Email of the member'),
    name: z.string().describe('Display name of the member'),
    access: VolumeMemberAccessSchema,
  })
  .meta({ id: 'FileVolumeMemberResponseDto' });

const VolumeMemberListSchema = z
  .object({
    volumeId: z.string().describe('Shared volume whose members are listed'),
  })
  .meta({ id: 'FileVolumeMemberListDto' });

const VolumeMemberAddSchema = z
  .object({
    volumeId: z.string().describe('Shared volume to add the member to'),
    userId: z.string().uuid().describe('User to add'),
    access: VolumeMemberAccessSchema.default(VolumeAccess.ReadWrite),
  })
  .meta({ id: 'FileVolumeMemberAddDto' });

const VolumeMemberRemoveSchema = z
  .object({
    volumeId: z.string().describe('Shared volume to remove the member from'),
    userId: z.string().uuid().describe('User to remove'),
  })
  .meta({ id: 'FileVolumeMemberRemoveDto' });

const FileEntryTypeSchema = z.enum(FileEntryType).describe('File entry type').meta({ id: 'FileEntryType' });

/** One entry inside a volume. Paths are virtual and relative to the volume root. */
const FileEntrySchema = z
  .object({
    path: z.string().describe('Virtual path of the entry within its volume'),
    name: z.string().describe('Base name of the entry'),
    type: FileEntryTypeSchema,
    size: z.number().int().describe('Size in bytes as reported by the storage backend'),
    modifiedAt: isoDatetimeToDate.describe('Last modification time'),
  })
  .meta({ id: 'FileEntryResponseDto' });

const FileDownloadSchema = z
  .object({
    volumeId: z.string().describe('Volume holding the file'),
    path: z.string().describe('Virtual path of the file, relative to the volume root'),
  })
  .meta({ id: 'FileDownloadDto' });

const FileFolderCreateSchema = z
  .object({
    volumeId: z.string().describe('Volume to create the folder in'),
    path: z.string().describe('Virtual path of the folder to create. The parent must already exist.'),
  })
  .meta({ id: 'FileFolderCreateDto' });

const FileUploadSchema = z
  .object({
    volumeId: z.string().describe('Volume to write into'),
    path: z.string().describe('Virtual path of the file. The parent must already exist.'),
    overwrite: z.stringbool().default(false).describe('Replace an existing file instead of failing'),
  })
  .meta({ id: 'FileUploadDto' });

/**
 * A move, which also expresses a rename: a rename is a move whose parent does not change, and the
 * two are one operation on the filesystem.
 *
 * One volume identifier covers both paths, so a cross-volume move cannot be expressed here at all.
 * That is deliberate rather than an omission: volumes can be separate filesystems and separate
 * ownership, so moving between them is a copy followed by a delete and needs its own operation.
 */
const FileMoveSchema = z
  .object({
    volumeId: z.string().describe('Volume holding both the source and the target'),
    sourcePath: z.string().describe('Virtual path of the entry to move'),
    targetPath: z
      .string()
      .describe('Virtual path the entry is moved to. Its parent must already exist and must be free.'),
  })
  .meta({ id: 'FileMoveDto' });

const FileCopySchema = z
  .object({
    volumeId: z.string().describe('Volume holding both the source and the target'),
    sourcePath: z.string().describe('Virtual path of the file to copy. Directories are not supported.'),
    targetPath: z
      .string()
      .describe('Virtual path the copy is written to. Its parent must already exist and must be free.'),
  })
  .meta({ id: 'FileCopyDto' });

/**
 * One entry in the trash.
 *
 * `originalPath` and `deletedAt` are nullable on purpose: they come from a sidecar manifest, and a
 * record whose manifest is unreadable is still reported so it can be restored to an explicit path or
 * removed. A client should treat an unknown origin as "restore needs a target", not as an error.
 */
const TrashRecordSchema = z
  .object({
    id: z.string().describe('Identifier of the trash record'),
    name: z.string().describe('Base name the entry had when it was deleted'),
    originalPath: z
      .string()
      .nullable()
      .describe('Virtual path the entry came from, or null when the record manifest is unreadable'),
    type: FileEntryTypeSchema,
    size: z.number().int().describe('Size in bytes as reported by the storage backend'),
    deletedAt: isoDatetimeToDate.nullable().describe('When the entry was deleted, or null when unknown'),
  })
  .meta({ id: 'FileTrashRecordResponseDto' });

const TrashListSchema = z
  .object({
    volumeId: z.string().describe('Volume whose trash is listed'),
  })
  .meta({ id: 'FileTrashListDto' });

const TrashDeleteSchema = z
  .object({
    volumeId: z.string().describe('Volume holding the entry'),
    path: z.string().describe('Virtual path of the entry to delete'),
  })
  .meta({ id: 'FileTrashDeleteDto' });

const TrashRestoreSchema = z
  .object({
    volumeId: z.string().describe('Volume holding the record'),
    trashId: z.string().describe('Identifier of the trash record to restore'),
    targetPath: z
      .string()
      .optional()
      .describe(
        'Where to restore the entry. Defaults to the path it came from; required when that is unknown, and the way to resolve a conflict at it.',
      ),
  })
  .meta({ id: 'FileTrashRestoreDto' });

const TrashPurgeSchema = z
  .object({
    volumeId: z.string().describe('Volume holding the record'),
    trashId: z.string().describe('Identifier of the trash record to remove for good'),
  })
  .meta({ id: 'FileTrashPurgeDto' });

const TrashEmptySchema = z
  .object({
    volumeId: z.string().describe('Volume whose trash is emptied'),
  })
  .meta({ id: 'FileTrashEmptyDto' });

/** Emptying reports counts, because one record the filesystem refuses to remove must not block it. */
const TrashPurgeResultSchema = z
  .object({
    removed: z.number().int().describe('Records removed'),
    failed: z.number().int().describe('Records that could not be removed'),
  })
  .meta({ id: 'FileTrashPurgeResponseDto' });

const FileEntryListSchema = z
  .object({
    volumeId: z.string().describe('Volume to list, as returned by the volume endpoint'),
    path: z.string().default('/').describe('Virtual path of the directory to list, relative to the volume root'),
  })
  .meta({ id: 'FileEntryListDto' });

export class FileEntryResponseDto extends createZodDto(FileEntrySchema) {}
export class FileEntryListDto extends createZodDto(FileEntryListSchema) {}
export class FileDownloadDto extends createZodDto(FileDownloadSchema) {}
export class FileFolderCreateDto extends createZodDto(FileFolderCreateSchema) {}
export class FileUploadDto extends createZodDto(FileUploadSchema) {}
export class FileMoveDto extends createZodDto(FileMoveSchema) {}
export class FileCopyDto extends createZodDto(FileCopySchema) {}
export class FileTrashRecordResponseDto extends createZodDto(TrashRecordSchema) {}
export class FileTrashListDto extends createZodDto(TrashListSchema) {}
export class FileTrashDeleteDto extends createZodDto(TrashDeleteSchema) {}
export class FileTrashRestoreDto extends createZodDto(TrashRestoreSchema) {}
export class FileTrashPurgeDto extends createZodDto(TrashPurgeSchema) {}
export class FileTrashEmptyDto extends createZodDto(TrashEmptySchema) {}
export class FileTrashPurgeResponseDto extends createZodDto(TrashPurgeResultSchema) {}
export class FileVolumeHealthResponseDto extends createZodDto(VolumeHealthSchema) {}
export class FileReconcileDto extends createZodDto(ReconcileSchema) {}
export class FileReconcileResponseDto extends createZodDto(ReconcileResultSchema) {}
export class FileVolumeMemberResponseDto extends createZodDto(VolumeMemberSchema) {}
export class FileVolumeMemberListDto extends createZodDto(VolumeMemberListSchema) {}
export class FileVolumeMemberAddDto extends createZodDto(VolumeMemberAddSchema) {}
export class FileVolumeMemberRemoveDto extends createZodDto(VolumeMemberRemoveSchema) {}
