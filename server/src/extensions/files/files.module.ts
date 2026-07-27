import { DynamicModule, Module, Type } from '@nestjs/common';
import { FileDomainService } from 'src/extensions/files/file-domain.service';
import { StorageAdapter } from 'src/extensions/files/storage.adapter';

@Module({})
export class FilesModule {
  static register(storageAdapter: Type<StorageAdapter>): DynamicModule {
    return {
      module: FilesModule,
      providers: [{ provide: StorageAdapter, useClass: storageAdapter }, FileDomainService],
      exports: [FileDomainService],
    };
  }
}
