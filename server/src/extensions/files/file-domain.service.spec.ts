import { FileDomainService } from 'src/extensions/files/file-domain.service';
import { FileEntry, FileEntryType } from 'src/extensions/files/file-entry';
import { FilesModule } from 'src/extensions/files/files.module';
import { StorageAdapter } from 'src/extensions/files/storage.adapter';

class TestStorageAdapter extends StorageAdapter {
  stat = vi.fn<StorageAdapter['stat']>();
  list = vi.fn<StorageAdapter['list']>();
  open = vi.fn<StorageAdapter['open']>();
  write = vi.fn<StorageAdapter['write']>();
  move = vi.fn<StorageAdapter['move']>();
  copy = vi.fn<StorageAdapter['copy']>();
  delete = vi.fn<StorageAdapter['delete']>();
}

describe(FileDomainService.name, () => {
  let storage: TestStorageAdapter;
  let sut: FileDomainService;

  beforeEach(() => {
    storage = new TestStorageAdapter();
    sut = new FileDomainService(storage);
  });

  it('delegates entry lookup to the storage contract', async () => {
    const entry: FileEntry = {
      path: '/documents/report.pdf',
      name: 'report.pdf',
      type: FileEntryType.File,
      size: 1024,
      modifiedAt: new Date('2026-07-27T00:00:00.000Z'),
    };
    storage.stat.mockResolvedValue(entry);

    await expect(sut.getEntry(entry.path)).resolves.toEqual(entry);
    expect(storage.stat).toHaveBeenCalledWith(entry.path);
  });

  it('delegates directory listing to the storage contract', async () => {
    storage.list.mockResolvedValue([]);

    await expect(sut.listEntries('/documents')).resolves.toEqual([]);
    expect(storage.list).toHaveBeenCalledWith('/documents');
  });

  it('registers a concrete adapter without coupling the domain service to it', () => {
    expect(FilesModule.register(TestStorageAdapter)).toEqual({
      module: FilesModule,
      providers: [{ provide: StorageAdapter, useClass: TestStorageAdapter }, FileDomainService],
      exports: [FileDomainService],
    });
  });
});
