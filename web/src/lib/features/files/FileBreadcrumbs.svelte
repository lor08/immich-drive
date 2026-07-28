<script lang="ts">
  import { Route } from '$lib/route';
  import { Icon, Text } from '@immich/ui';
  import { mdiChevronRight } from '@mdi/js';

  interface Props {
    volumeId: string;
    volumeName: string;
    path: string;
  }

  let { volumeId, volumeName, path }: Props = $props();

  /** Each crumb carries the absolute path it opens, so a click never has to reassemble it. */
  let crumbs = $derived.by(() => {
    const segments = path.split('/').filter(Boolean);
    let current = '';
    return segments.map((segment) => {
      current += `/${segment}`;
      return { name: segment, path: current };
    });
  });
</script>

<nav class="flex flex-wrap items-center gap-1" aria-label={volumeName}>
  <a href={Route.files({ volumeId })} class="hover:underline">
    <Text color="primary">{volumeName}</Text>
  </a>

  {#each crumbs as crumb, index (crumb.path)}
    <Icon icon={mdiChevronRight} size="1em" class="opacity-60" />
    {#if index === crumbs.length - 1}
      <Text>{crumb.name}</Text>
    {:else}
      <a href={Route.files({ volumeId, path: crumb.path })} class="hover:underline">
        <Text color="primary">{crumb.name}</Text>
      </a>
    {/if}
  {/each}
</nav>
