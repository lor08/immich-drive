<script lang="ts">
  import UserPageLayout from '$lib/components/layouts/UserPageLayout.svelte';
  import VolumeList from '$lib/features/files/VolumeList.svelte';
  import { Container } from '@immich/ui';
  import type { PageData } from './$types';

  interface Props {
    data: PageData;
  }

  let { data }: Props = $props();
</script>

<UserPageLayout title={data.meta.title}>
  <Container size="medium" center>
    <div class="mt-4">
      <VolumeList volumes={data.volumes} />
    </div>
  </Container>
</UserPageLayout>
