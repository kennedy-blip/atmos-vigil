<script>
	import { activeModule } from '../lib/stores.js';
	import WindModule from '../lib/components/modules/WindModule.svelte';
	import LightningModule from '../lib/components/modules/LightningModule.svelte';
	import BarographModule from '../lib/components/modules/BarographModule.svelte';
	import WetBulbModule from '../lib/components/modules/WetBulbModule.svelte';
	import VaultModule from '../lib/components/modules/VaultModule.svelte';

	const mod = $derived($activeModule);
</script>

{#if mod === 'wind'}
	<WindModule />
{:else if mod === 'lightning'}
	<LightningModule />
{:else if mod === 'baro'}
	<BarographModule />
{:else if mod === 'wbgt'}
	<WetBulbModule />
{:else if mod === 'vault'}
	<VaultModule />
{/if}

<style>
	:global(body) {
		background: transparent;
	}
</style>
