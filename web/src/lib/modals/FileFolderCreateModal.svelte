<script lang="ts">
  import { handleCreateFolder } from '$lib/services/files.service';
  import { Field, FormModal, Input } from '@immich/ui';
  import { mdiFolderPlusOutline } from '@mdi/js';
  import { t } from 'svelte-i18n';

  type Props = { volumeId: string; parentPath: string; onClose: () => void };

  const { volumeId, parentPath, onClose }: Props = $props();

  let name = $state('');

  const onSubmit = async () => {
    const created = await handleCreateFolder({ volumeId, parentPath, name: name.trim() });
    if (created) {
      onClose();
    }
  };
</script>

<FormModal title={$t('folder')} icon={mdiFolderPlusOutline} {onClose} {onSubmit} submitText={$t('create')}>
  <Field label={$t('name')}>
    <Input bind:value={name} />
  </Field>
</FormModal>
