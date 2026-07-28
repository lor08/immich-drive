import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { AuthDto } from 'src/dtos/auth.dto';
import { FileDomainService } from 'src/extensions/files/file-domain.service';
import { FilesController } from 'src/extensions/files/files.controller';
import { PRIVATE_VOLUME_ID, VolumeAccess, VolumeKind } from 'src/extensions/files/volume';
import { VolumeRegistry } from 'src/extensions/files/volume.registry';

const OWNER = '5f2b9c4e-0000-4000-8000-000000000001';
const OTHER_OWNER = '5f2b9c4e-0000-4000-8000-000000000002';

const asAuth = (userId: string) => ({ user: { id: userId } }) as AuthDto;

describe(FileDomainService.name, () => {
  let storageRoot: string;
  let sut: FileDomainService;

  beforeEach(async () => {
    storageRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'immich-drive-domain-'));
    sut = new FileDomainService(new VolumeRegistry({ storageRoot, sharedSpace: 'family' }));
  });

  afterEach(async () => {
    await fs.rm(storageRoot, { recursive: true, force: true });
  });

  it('lists the volumes available to an owner', async () => {
    const volumes = await sut.listVolumes(OWNER);

    expect(volumes.map((volume) => volume.id)).toEqual([PRIVATE_VOLUME_ID, 'shared:family']);
  });

  it('reads through the adapter of the requested volume', async () => {
    const [privateVolume] = await sut.listVolumes(OWNER);
    await fs.writeFile(path.join(privateVolume.filesPath, 'report.txt'), 'contents');

    await expect(sut.listEntries(OWNER, PRIVATE_VOLUME_ID, '/')).resolves.toEqual([
      expect.objectContaining({ name: 'report.txt', path: '/report.txt' }),
    ]);
    await expect(sut.getEntry(OWNER, PRIVATE_VOLUME_ID, '/report.txt')).resolves.toMatchObject({ size: 8 });
  });

  it('keeps one owner out of another owner private volume', async () => {
    const [mine] = await sut.listVolumes(OWNER);
    await fs.writeFile(path.join(mine.filesPath, 'secret.txt'), 'mine');

    await expect(sut.listEntries(OTHER_OWNER, PRIVATE_VOLUME_ID, '/')).resolves.toEqual([]);
  });

  it('rejects a volume the owner cannot address', async () => {
    await expect(sut.listEntries(OWNER, 'shared:other', '/')).rejects.toThrow();
  });

  it('reports that file storage is not enabled when the domain is unconfigured', async () => {
    const disabled = new FileDomainService(null);

    await expect(disabled.listVolumes(OWNER)).rejects.toThrow('Immich Drive file storage is not enabled');
    await expect(disabled.listEntries(OWNER, PRIVATE_VOLUME_ID, '/')).rejects.toThrow(
      'Immich Drive file storage is not enabled',
    );
  });
});

describe(FilesController.name, () => {
  it('returns volumes without any host path', async () => {
    const service = {
      listVolumes: vi.fn().mockResolvedValue([
        {
          id: PRIVATE_VOLUME_ID,
          name: 'My files',
          kind: VolumeKind.Private,
          access: VolumeAccess.ReadWrite,
          filesPath: '/data/drive/users/someone/files',
          trashPath: '/data/drive/users/someone/.trash',
          tempPath: '/data/drive/users/someone/.tmp',
        },
      ]),
    } as unknown as FileDomainService;

    const response = await new FilesController(service).getFileVolumes(asAuth(OWNER));

    expect(response).toEqual([
      { id: PRIVATE_VOLUME_ID, name: 'My files', kind: VolumeKind.Private, access: VolumeAccess.ReadWrite },
    ]);
    expect(JSON.stringify(response)).not.toContain('/data/drive');
  });

  it('scopes the listing to the authenticated user', async () => {
    const service = { listVolumes: vi.fn().mockResolvedValue([]) } as unknown as FileDomainService;

    await new FilesController(service).getFileVolumes(asAuth(OWNER));

    expect(service.listVolumes).toHaveBeenCalledWith(OWNER);
  });
});
