import { getFileEntries, getFileVolumes, isHttpError, type FileEntryResponseDto } from '@immich/sdk';
import { authenticate } from '$lib/utils/auth';
import { getFormatter } from '$lib/utils/i18n';
import type { PageLoad } from './$types';

/**
 * One route serves two views: the volume list when no volume is selected, and a folder listing when
 * one is. Splitting them into separate routes would put the volume identifier in the path, which
 * would make it look like part of the addressing scheme rather than a selection.
 */
export const load = (async ({ url }) => {
  await authenticate(url);

  const $t = await getFormatter();
  const volumeId = url.searchParams.get('volumeId');
  const path = url.searchParams.get('path') || '/';

  if (!volumeId) {
    return { view: 'volumes' as const, volumes: await getFileVolumes(), meta: { title: $t('files') } };
  }

  const volumes = await getFileVolumes();
  const volume = volumes.find((candidate) => candidate.id === volumeId);

  /**
   * A missing or rejected folder is an expected condition, not a fault: the filesystem is the source
   * of truth, so a link can outlive the folder it points at. Both become a state inside the page,
   * which keeps the breadcrumbs and the application shell. Anything else is a real failure and is
   * left to propagate.
   *
   * The two are reported to the user as one message. The difference between "gone" and "never valid"
   * matters when reading the API, not when standing in front of the screen, and collapsing them
   * avoids introducing a translation key that would render as its own identifier in every locale
   * Weblate has not reached yet.
   */
  let entries: FileEntryResponseDto[] = [];
  let notFound = false;

  try {
    entries = await getFileEntries({ volumeId, path });
  } catch (error) {
    if (isHttpError(error) && (error.status === 404 || error.status === 400)) {
      notFound = true;
    } else {
      throw error;
    }
  }

  return {
    view: 'entries' as const,
    volumeId,
    volumeName: volume?.name ?? volumeId,
    path,
    entries,
    notFound,
    meta: { title: volume?.name ?? $t('files') },
  };
}) satisfies PageLoad;
