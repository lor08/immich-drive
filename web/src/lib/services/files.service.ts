import { createFileFolder, uploadFile } from '@immich/sdk';
import { invalidateAll } from '$app/navigation';
import { handleError } from '$lib/utils/handle-error';
import { getFormatter } from '$lib/utils/i18n';

/** Joins a folder path with a new child name, without producing a doubled separator at the root. */
export const joinPath = (parent: string, name: string): string => (parent === '/' ? `/${name}` : `${parent}/${name}`);

export const handleCreateFolder = async ({
  volumeId,
  parentPath,
  name,
}: {
  volumeId: string;
  parentPath: string;
  name: string;
}) => {
  const $t = await getFormatter();

  try {
    const entry = await createFileFolder({ fileFolderCreateDto: { volumeId, path: joinPath(parentPath, name) } });
    await invalidateAll();

    return entry;
  } catch (error) {
    // The server's own message is preferred when it sends one, which it does for a conflict, so the
    // fallback below is only reached when there is nothing better to say.
    handleError(error, $t('errors.unable_to_create_folder'));
  }
};

export const handleUploadFile = async ({
  volumeId,
  parentPath,
  file,
}: {
  volumeId: string;
  parentPath: string;
  file: File;
}) => {
  const $t = await getFormatter();

  try {
    const entry = await uploadFile({ volumeId, path: joinPath(parentPath, file.name), body: file });
    await invalidateAll();

    return entry;
  } catch (error) {
    handleError(error, $t('errors.unable_to_upload_file'));
  }
};
