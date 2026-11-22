<script>
	import { onMount } from 'svelte';
	import { modal, drawerOpen, formFactor, viewportWidth } from '../lib/stores.js';
	import IsobarCanvas from '../lib/components/IsobarCanvas.svelte';
	import HeaderBar from '../lib/components/HeaderBar.svelte';
	import Dock from '../lib/components/Dock.svelte';
	import DepthShell from '../lib/components/DepthShell.svelte';
	import ApkModal from '../lib/components/modals/ApkModal.svelte';
	import ForensicsModal from '../lib/components/modals/ForensicsModal.svelte';
	import PrivilegesDrawer from '../lib/components/modals/PrivilegesDrawer.svelte';
	
	const pushed = $derived($modal !== null || $drawerOpen);

	onMount(() => {
		const setW = () => viewportWidth.set(window.innerWidth);
		setW();
		window.addEventListener('resize', setW);
		return () => window.removeEventListener('resize', setW);
	});
</script>

<svelte:head>
	<title>ATMOS-VIGIL — Polyglot Weather Survival Station</title>
</svelte:head>

<IsobarCanvas />

<div class="grain-overlay" aria-hidden="true"></div>

<DepthShell pushed={pushed} mobile={$formFactor === 'mobile'}>
	<HeaderBar />
	{#if $formFactor === 'mobile'}
		<div class="mobile-app">
			<slot />
		</div>
	{:else}
		<div class="desktop-app">
			<slot />
		</div>
	{/if}
	<Dock />
</DepthShell>

<ApkModal />
<ForensicsModal />
<PrivilegesDrawer />

<style>
	.mobile-app,
	.desktop-app {
		width: 100%;
		max-width: 1200px;
		margin: 0 auto;
		padding: 0.75rem clamp(0.6rem, 2.2vw, 1.6rem) 1rem;
	}
	.desktop-app {
		max-width: 1280px;
		padding-top: 0.35rem;
	}
	.mobile-app {
		max-width: 430px;
		padding: 0.4rem 0.45rem 1rem;
	}
</style>
