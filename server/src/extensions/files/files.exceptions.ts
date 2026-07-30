import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { LocalStorageAdapterError, LocalStorageErrorCode } from 'src/extensions/files/local-storage.adapter';
import { VolumeError, VolumeErrorCode } from 'src/extensions/files/volume';

/**
 * Translates domain errors into HTTP responses.
 *
 * Without this every rejected path would surface as a 500 and a client could not tell a mistake it
 * can fix from a server fault. Messages are the domain's own, which are written to avoid disclosing
 * the storage root or any host path.
 */
const STORAGE_STATUS: Record<LocalStorageErrorCode, (message: string) => HttpException> = {
  [LocalStorageErrorCode.InvalidPath]: (message) => new BadRequestException(message),
  [LocalStorageErrorCode.SymlinkNotAllowed]: (message) => new BadRequestException(message),
  [LocalStorageErrorCode.EntryNotDirectory]: (message) => new BadRequestException(message),
  [LocalStorageErrorCode.EntryNotFile]: (message) => new BadRequestException(message),
  [LocalStorageErrorCode.RangeNotSatisfiable]: (message) => new BadRequestException(message),
  [LocalStorageErrorCode.EntryNotFound]: (message) => new NotFoundException(message),

  // Something is already there. The caller can resolve it by choosing another name, which makes it a
  // conflict rather than a bad request.
  [LocalStorageErrorCode.EntryExists]: (message) => new ConflictException(message),

  // A changed entry means the filesystem moved under a validated path. It is not the caller's
  // mistake and it is not necessarily a fault either, so it stays a server error the caller retries.
  [LocalStorageErrorCode.EntryChanged]: (message) => new InternalServerErrorException(message),

  // Operator-facing conditions. A client cannot fix an unusable root, an unsupported platform, or a
  // mutation the adapter does not implement yet.
  [LocalStorageErrorCode.InvalidRoot]: (message) => new InternalServerErrorException(message),
  [LocalStorageErrorCode.UnsupportedPlatform]: (message) => new InternalServerErrorException(message),
  [LocalStorageErrorCode.UnsupportedOperation]: (message) => new InternalServerErrorException(message),
};

const VOLUME_STATUS: Record<VolumeErrorCode, (message: string) => HttpException> = {
  // An unaddressable volume is reported as missing rather than as a bad request, so probing for
  // volumes that belong to someone else cannot be told apart from probing for ones that do not exist.
  [VolumeErrorCode.UnknownVolume]: () => new NotFoundException('Volume not found'),

  // A member who may read but not write is told exactly that: answering "not found" about a volume they
  // can list would be a worse answer than refusing the operation. See ADR 0012.
  [VolumeErrorCode.ReadOnlyVolume]: (message) => new ForbiddenException(message),

  // Both come from trusted sources, so reaching here means a deployment or session defect.
  [VolumeErrorCode.InvalidOwner]: () => new InternalServerErrorException('Volume owner is not usable'),
  [VolumeErrorCode.InvalidSpaceName]: () => new InternalServerErrorException('Shared space name is not usable'),
};

export const toHttpException = (error: unknown): unknown => {
  if (error instanceof VolumeError) {
    return VOLUME_STATUS[error.code](error.message);
  }

  if (error instanceof LocalStorageAdapterError) {
    return STORAGE_STATUS[error.code](error.message);
  }

  return error;
};
