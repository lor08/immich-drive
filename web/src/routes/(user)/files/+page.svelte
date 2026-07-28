<script lang="ts">
  import UserPageLayout from '$lib/components/layouts/UserPageLayout.svelte';
  import EntryList from '$lib/features/files/EntryList.svelte';
  import FileBreadcrumbs from '$lib/features/files/FileBreadcrumbs.svelte';
  import VolumeList from '$lib/features/files/VolumeList.svelte';
  import { Alert, Container, Stack } from '@immich/ui';
  import { t } from 'svelte-i18n';
  import type { PageData } from './$types';

  interface Props {
    data: PageData;
  }

  let { data }: Props = $props();
</script>

<UserPageLayout title={data.meta.title}>
  <Container size="medium" center>
    <div class="mt-4">
      {#if data.view === 'volumes'}
        <VolumeList volumes={data.volumes} />
      {:else}
        <Stack gap={4}>
          <FileBreadcrumbs volumeId={data.volumeId} volumeName={data.volumeName} path={data.path} />

          {#if data.notFound}
            <Alert color="warning" title={$t('folder_not_found')} />
          {:else}
            <EntryList volumeId={data.volumeId} entries={data.entries} />
          {/if}
        </Stack>
      {/if}
    </div>
  </Container>
</UserPageLayout>
