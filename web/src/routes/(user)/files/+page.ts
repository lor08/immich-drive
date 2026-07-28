import { getFileVolumes } from '@immich/sdk';
import { authenticate } from '$lib/utils/auth';
import { getFormatter } from '$lib/utils/i18n';
import type { PageLoad } from './$types';

export const load = (async ({ url }) => {
  await authenticate(url);

  const volumes = await getFileVolumes();
  const $t = await getFormatter();

  return {
    volumes,
    meta: {
      title: $t('files'),
    },
  };
}) satisfies PageLoad;
