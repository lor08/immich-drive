<script lang="ts">
  import UserPageLayout from '$lib/components/layouts/UserPageLayout.svelte';
  import EntryList from '$lib/features/files/EntryList.svelte';
  import FileBreadcrumbs from '$lib/features/files/FileBreadcrumbs.svelte';
  import VolumeList from '$lib/features/files/VolumeList.svelte';
  import FileFolderCreateModal from '$lib/modals/FileFolderCreateModal.svelte';
  import { handleUploadFile } from '$lib/services/files.service';
  import { Alert, Button, Container, Stack, modalManager } from '@immich/ui';
  import { mdiFolderPlusOutline, mdiUploadOutline } from '@mdi/js';
  import { t } from 'svelte-i18n';
  import type { PageData } from './$types';

  interface Props {
    data: PageData;
  }

  let { data }: Props = $props();

  let fileInput = $state<HTMLInputElement>();

  const onUpload = async (event: Event) => {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    // Cleared before awaiting, so picking the same file twice in a row still fires a change event.
    input.value = '';

    if (file && data.view === 'entries') {
      await handleUploadFile({ volumeId: data.volumeId, parentPath: data.path, file });
    }
  };
</script>

<UserPageLayout title={data.meta.title}>
  <Container size="medium" center>
    <div class="mt-4">
      {#if data.view === 'volumes'}
        <VolumeList volumes={data.volumes} />
      {:else}
        <Stack gap={4}>
          <div class="flex flex-wrap items-center justify-between gap-2">
            <FileBreadcrumbs volumeId={data.volumeId} volumeName={data.volumeName} path={data.path} />

            {#if !data.notFound}
              <div class="flex items-center gap-2">
                <Button
                  size="small"
                  variant="ghost"
                  color="secondary"
                  leadingIcon={mdiFolderPlusOutline}
                  onclick={() =>
                    modalManager.show(FileFolderCreateModal, { volumeId: data.volumeId, parentPath: data.path })}
                >
                  {$t('folder')}
                </Button>
                <Button
                  size="small"
                  variant="ghost"
                  color="secondary"
                  leadingIcon={mdiUploadOutline}
                  onclick={() => fileInput?.click()}
                >
                  {$t('upload')}
                </Button>
                <input bind:this={fileInput} type="file" class="hidden" onchange={onUpload} />
              </div>
            {/if}
          </div>

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
