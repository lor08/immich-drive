<script lang="ts">
  import { Route } from '$lib/route';
  import { getBytesWithUnit } from '$lib/utils/byte-units';
  import { FileEntryType, type FileEntryResponseDto } from '@immich/sdk';
  import { Card, CardBody, Icon, Stack, Text } from '@immich/ui';
  import { mdiFileOutline, mdiFolderOutline } from '@mdi/js';
  import { t } from 'svelte-i18n';

  interface Props {
    volumeId: string;
    entries: FileEntryResponseDto[];
  }

  let { volumeId, entries }: Props = $props();

  const describe = (entry: FileEntryResponseDto) => {
    if (entry.type === FileEntryType.Directory) {
      return $t('folder');
    }

    const [size, unit] = getBytesWithUnit(entry.size, 0);
    return `${size} ${unit}`;
  };
</script>

<Stack gap={2}>
  {#each entries as entry (entry.path)}
    {#snippet row()}
      <Card>
        <CardBody class="flex items-center gap-4 py-3">
          <Icon
            icon={entry.type === FileEntryType.Directory ? mdiFolderOutline : mdiFileOutline}
            size="1.25em"
            class={entry.type === FileEntryType.Directory ? 'text-primary' : 'opacity-70'}
          />
          <Text class="min-w-0 flex-1 truncate">{entry.name}</Text>
          <Text color="muted" size="small">{describe(entry)}</Text>
        </CardBody>
      </Card>
    {/snippet}

    <!-- Only folders are links. Opening a file needs a download endpoint that does not exist yet,
         and a row that invites a click it cannot honour is worse than a row that does not. -->
    {#if entry.type === FileEntryType.Directory}
      <a href={Route.files({ volumeId, path: entry.path })} class="block">
        {@render row()}
      </a>
    {:else}
      {@render row()}
    {/if}
  {:else}
    <Text color="muted">{$t('empty_folder')}</Text>
  {/each}
</Stack>
