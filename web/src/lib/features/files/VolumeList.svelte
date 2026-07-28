<script lang="ts">
  import { FileVolumeKind, type FileVolumeResponseDto } from '@immich/sdk';
  import { Card, CardBody, CardDescription, CardTitle, Icon, Stack, Text } from '@immich/ui';
  import { mdiAccountMultipleOutline, mdiFolderAccountOutline } from '@mdi/js';
  import { t } from 'svelte-i18n';

  interface Props {
    volumes: FileVolumeResponseDto[];
  }

  let { volumes }: Props = $props();
</script>

<!-- Deliberately not links: browsing a volume arrives with P2-02, and a card that looks clickable
     but goes nowhere is worse than a card that does not invite the click. -->
<Stack gap={4}>
  {#each volumes as volume (volume.id)}
    <Card>
      <CardBody class="flex items-center gap-4">
        <Icon
          icon={volume.kind === FileVolumeKind.Shared ? mdiAccountMultipleOutline : mdiFolderAccountOutline}
          size="1.5em"
        />
        <div class="flex min-w-0 flex-1 flex-col">
          <CardTitle class="truncate">{volume.name}</CardTitle>
          <CardDescription>{volume.access}</CardDescription>
        </div>
      </CardBody>
    </Card>
  {:else}
    <Text color="muted">{$t('no_results')}</Text>
  {/each}
</Stack>
