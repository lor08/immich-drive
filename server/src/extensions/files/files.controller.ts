import { Controller, Get, Query, UseInterceptors } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Endpoint, HistoryBuilder } from 'src/decorators';
import { AuthDto } from 'src/dtos/auth.dto';
import { ApiTag, Permission } from 'src/enum';
import { FileDomainService } from 'src/extensions/files/file-domain.service';
import { FileEntryListDto, FileEntryResponseDto, FileVolumeResponseDto } from 'src/extensions/files/files.dto';
import { FileDomainErrorInterceptor } from 'src/extensions/files/files.interceptor';
import { Auth, Authenticated } from 'src/middleware/auth.guard';

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
}
