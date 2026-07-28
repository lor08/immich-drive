import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Put,
  Query,
  Req,
  StreamableFile,
  UseInterceptors,
} from '@nestjs/common';
import { ApiBody, ApiConsumes, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { Readable } from 'node:stream';
import { Endpoint, HistoryBuilder } from 'src/decorators';
import { AuthDto } from 'src/dtos/auth.dto';
import { ApiTag, Permission } from 'src/enum';
import { FileDomainService } from 'src/extensions/files/file-domain.service';
import {
  FileCopyDto,
  FileDownloadDto,
  FileEntryListDto,
  FileEntryResponseDto,
  FileFolderCreateDto,
  FileMoveDto,
  FileUploadDto,
  FileVolumeResponseDto,
} from 'src/extensions/files/files.dto';
import { FileDomainErrorInterceptor } from 'src/extensions/files/files.interceptor';
import { Auth, Authenticated, FileResponse } from 'src/middleware/auth.guard';

@ApiTags(ApiTag.Files)
@Controller('files')
@UseInterceptors(FileDomainErrorInterceptor)
export class FilesController {
  constructor(private service: FileDomainService) {}

  @Get('volumes')
  @Authenticated({ permission: Permission.FileRead })
  @Endpoint({
    summary: 'List file volumes',
    description:
      'Lists the volumes the current user can address. Content is addressed by volume identifier and a path relative to that volume.',
    history: HistoryBuilder.v3(),
  })
  async getFileVolumes(@Auth() auth: AuthDto): Promise<FileVolumeResponseDto[]> {
    const volumes = await this.service.listVolumes(auth.user.id);
    return volumes.map(({ id, name, kind, access }) => ({ id, name, kind, access }));
  }

  @Get('entries')
  @Authenticated({ permission: Permission.FileRead })
  @Endpoint({
    summary: 'List entries in a folder',
    description:
      'Lists the direct children of a folder inside a volume. Paths are relative to the volume root, and ordering is deterministic by name.',
    history: HistoryBuilder.v3(),
  })
  async getFileEntries(@Auth() auth: AuthDto, @Query() dto: FileEntryListDto): Promise<FileEntryResponseDto[]> {
    const entries = await this.service.listEntries(auth.user.id, dto.volumeId, dto.path);
    return entries.map((entry) => ({ ...entry }));
  }

  @Post('folders')
  @Authenticated({ permission: Permission.FileCreate })
  @Endpoint({
    summary: 'Create a folder',
    description:
      'Creates one folder inside a volume. The parent must already exist: creation is not recursive, so a mistyped path fails rather than materialising a hierarchy.',
    history: HistoryBuilder.v3(),
  })
  async createFileFolder(@Auth() auth: AuthDto, @Body() dto: FileFolderCreateDto): Promise<FileEntryResponseDto> {
    return { ...(await this.service.createFolder(auth.user.id, dto.volumeId, dto.path)) };
  }

  @Put('content')
  @Authenticated({ permission: Permission.FileUpload })
  @ApiConsumes('application/octet-stream')
  @ApiBody({ required: true, schema: { type: 'string', format: 'binary' } })
  @Endpoint({
    summary: 'Upload a file',
    description:
      'Writes the request body to a path inside a volume. The content is staged and renamed into place, so a partial file is never visible at the target. The parent must already exist, and an existing file is only replaced when overwrite is set.',
    history: HistoryBuilder.v3(),
  })
  async uploadFile(
    @Auth() auth: AuthDto,
    @Query() dto: FileUploadDto,
    @Req() request: Request,
  ): Promise<FileEntryResponseDto> {
    // The request itself is the content. No body parser claims application/octet-stream, so it
    // arrives unconsumed and can be streamed straight through to the adapter.
    const entry = await this.service.writeFile(auth.user.id, dto.volumeId, dto.path, request, {
      overwrite: dto.overwrite,
    });

    return { ...entry };
  }

  @Post('move')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Authenticated({ permission: Permission.FileUpdate })
  @Endpoint({
    summary: 'Move or rename an entry',
    description:
      'Moves a file or folder inside one volume, which also covers renaming. The target parent must already exist and the target itself must be free: an occupied target is a conflict rather than a replacement. Both paths belong to the same volume, so this never moves content between volumes.',
    history: HistoryBuilder.v3(),
  })
  async moveFileEntry(@Auth() auth: AuthDto, @Body() dto: FileMoveDto): Promise<void> {
    await this.service.moveEntry(auth.user.id, dto.volumeId, dto.sourcePath, dto.targetPath);
  }

  @Post('copy')
  @Authenticated({ permission: Permission.FileCreate })
  @Endpoint({
    summary: 'Copy a file',
    description:
      'Copies one file inside a volume. The content is staged and renamed into place, so a partial copy is never visible at the target. Copying a folder is not supported: a tree can be arbitrarily large and needs a background job rather than a request.',
    history: HistoryBuilder.v3(),
  })
  async copyFileEntry(@Auth() auth: AuthDto, @Body() dto: FileCopyDto): Promise<FileEntryResponseDto> {
    return { ...(await this.service.copyEntry(auth.user.id, dto.volumeId, dto.sourcePath, dto.targetPath)) };
  }

  @Get('download')
  @Authenticated({ permission: Permission.FileDownload })
  @FileResponse()
  @Endpoint({
    summary: 'Download a file',
    description: 'Streams a file from a volume. Whole files only; range requests are not supported yet.',
    history: HistoryBuilder.v3(),
  })
  async downloadFile(@Auth() auth: AuthDto, @Query() dto: FileDownloadDto): Promise<StreamableFile> {
    const { entry, content } = await this.service.openFile(auth.user.id, dto.volumeId, dto.path);

    // Always octet-stream, never a guessed type. These are arbitrary user-supplied files, and letting
    // a browser decide how to interpret one is how stored content becomes executable content.
    return new StreamableFile(Readable.from(content), {
      type: 'application/octet-stream',
      length: entry.size,
      disposition: `attachment; filename*=UTF-8''${encodeURIComponent(entry.name)}`,
    });
  }
}
