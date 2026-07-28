import { createZodDto } from 'nestjs-zod';
import { VolumeAccess, VolumeKind } from 'src/extensions/files/volume';
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
