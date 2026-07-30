import { DynamicModule, Inject, Module, OnApplicationBootstrap } from '@nestjs/common';
import { ClsModule } from 'nestjs-cls';
import { StorageCore } from 'src/cores/storage.core';
import { DriveIndexRepository } from 'src/extensions/files/drive-index.repository';
import { DriveIndexService } from 'src/extensions/files/drive-index.service';
import { DriveMembershipRepository } from 'src/extensions/files/drive-membership.repository';
import { FileDomainService } from 'src/extensions/files/file-domain.service';
import { DRIVE_CONFIG, DriveConfig } from 'src/extensions/files/files.config';
import { FilesController } from 'src/extensions/files/files.controller';
import { PathLock } from 'src/extensions/files/path-lock';
import { ReconciliationService } from 'src/extensions/files/reconciliation.service';
import { validateStorageRoot } from 'src/extensions/files/storage-root.validator';
import { VolumeAccessService } from 'src/extensions/files/volume-access.service';
import { VolumeMembershipService } from 'src/extensions/files/volume-membership.service';
import { VolumeRegistry } from 'src/extensions/files/volume.registry';
import { ConfigRepository } from 'src/repositories/config.repository';
import { LoggingRepository } from 'src/repositories/logging.repository';
import { UserRepository } from 'src/repositories/user.repository';

/**
 * The Immich Drive file domain.
 *
 * The module is registered unconditionally so the OpenAPI document, and therefore both generated
 * clients, describe the same API on every deployment. What `IMMICH_DRIVE_ROOT` controls is
 * behavior: when it is unset nothing is validated, no directory is created, and every endpoint
 * reports that file storage is not enabled.
 *
 * Validation happens in two phases. The shape of the root — absolute, present, a directory,
 * readable and writable — is checked while the module is constructed, because the registry needs
 * the canonical path. Overlap with Immich's media location is checked in `onApplicationBootstrap`,
 * which runs after `StorageService` resolves that location on the `AppBootstrap` event. Either
 * failure stops the server from starting.
 */
@Module({})
export class FilesModule implements OnApplicationBootstrap {
  constructor(@Inject(DRIVE_CONFIG) private readonly config: DriveConfig) {}

  static forRoot(config: DriveConfig): DynamicModule {
    return {
      module: FilesModule,
      controllers: [FilesController],
      // The module has its own injector, so what it needs from upstream it has to name. `ClsModule` is
      // what lets `LoggingRepository` resolve `ClsService` and keep the request correlation id on a log
      // line; the service instance is a thin reader of a process-wide store, so a second one is not a
      // second context.
      imports: [ClsModule],
      providers: [
        { provide: DRIVE_CONFIG, useValue: config },
        ConfigRepository,
        LoggingRepository,
        DriveIndexRepository,
        DriveIndexService,
        DriveMembershipRepository,
        VolumeAccessService,
        VolumeMembershipService,
        UserRepository,
        ReconciliationService,
        {
          provide: VolumeRegistry,
          useFactory: async (): Promise<VolumeRegistry | null> => {
            if (!config.enabled) {
              return null;
            }

            const { path } = await validateStorageRoot({ root: config.root, reservedPaths: [] });
            return new VolumeRegistry({ storageRoot: path, sharedSpace: config.sharedSpace });
          },
        },
        PathLock,
        FileDomainService,
      ],
      exports: [FileDomainService],
    };
  }

  async onApplicationBootstrap() {
    if (!this.config.enabled) {
      return;
    }

    await validateStorageRoot({
      root: this.config.root,
      reservedPaths: [StorageCore.getMediaLocation()],
    });
  }
}
