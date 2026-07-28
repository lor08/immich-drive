import { createZodDto } from 'nestjs-zod';
import { FileEntryType } from 'src/extensions/files/file-entry';
import { VolumeAccess, VolumeKind } from 'src/extensions/files/volume';
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
