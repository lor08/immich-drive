<script lang="ts">
  import { Route } from '$lib/route';
  import { getBytesWithUnit } from '$lib/utils/byte-units';
  import { FileEntryType, type FileEntryResponseDto } from '@immich/sdk';
  import { Card, CardBody, Icon, IconButton, Stack, Text } from '@immich/ui';
  import { mdiDownload, mdiFileOutline, mdiFolderOutline } from '@mdi/js';
  import { t } from 'svelte-i18n';

  interface Props {
    volumeId: string;
    entries: FileEntryResponseDto[];
  }

  let { volumeId, entries }: Props = $props();

  /**
   * Folders first, then by name.
   *
   * The server returns a deterministic name order and nothing more, which is the right contract for
   * an API. Grouping is presentation, so it lives here. When pagination arrives the server has to own
   * ordering instead, because a page boundary makes client-side grouping wrong.
   */
  let sorted = $derived(
    [...entries].sort((left, right) => {
      const leftIsFolder = left.type === FileEntryType.Directory;
      if (leftIsFolder !== (right.type === FileEntryType.Directory)) {
        return leftIsFolder ? -1 : 1;
      }

      return left.name.localeCompare(right.name);
    }),
  );

  const describe = (entry: FileEntryResponseDto) => {
    if (entry.type === FileEntryType.Directory) {
      return $t('folder');
    }

    const [size, unit] = getBytesWithUnit(entry.size, 0);
    return `${size} ${unit}`;
  };
</script>

<Stack gap={2}>
  {#each sorted as entry (entry.path)}
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
          {#if entry.type !== FileEntryType.Directory}
            <IconButton
              icon={mdiDownload}
              aria-label={$t('download')}
              title={$t('download')}
              size="small"
              shape="round"
              variant="ghost"
              color="secondary"
              href={Route.fileDownload({ volumeId, path: entry.path })}
              download={entry.name}
            />
          {/if}
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
