<script>
	import { theme, themes } from '../stores.js';

	const set = (id) => theme.set(id);
</script>

<div class="themes" role="group" aria-label="Theme picker">
	{#each themes as t (t.id)}
		<button
			class="swatch"
			class:active={$theme === t.id}
			onclick={() => set(t.id)}
			title={t.label}
			aria-label={t.label}
			type="button"
		>
			<span class="sw-base" style="background:{t.swatch[0]}"></span>
			<span class="sw-a" style="background:{t.swatch[1]}"></span>
			<span class="sw-b" style="background:{t.swatch[2]}"></span>
		</button>
	{/each}
</div>

<style>
	.themes {
		display: flex;
		gap: 0.35rem;
		padding: 0.28rem 0.35rem;
		border-radius: 999px;
		border: 1px solid var(--border);
		background: var(--panel-2);
	}
	.swatch {
		position: relative;
		width: 34px;
		height: 20px;
		border-radius: 999px;
		border: 1px solid var(--border);
		background: transparent;
		cursor: pointer;
		display: flex;
		overflow: hidden;
		padding: 0;
		transition: transform 0.18s ease, box-shadow 0.18s ease, border-color 0.2s ease;
	}
	.swatch:hover {
		transform: scale(1.1);
	}
	.swatch.active {
		border-color: var(--accent);
		box-shadow: var(--glow-cyan);
	}
	.sw-base, .sw-a, .sw-b {
		flex: 1;
		height: 100%;
	}
</style>
