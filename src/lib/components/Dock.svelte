<script>
	import { activeModule, moduleList, role } from '../stores.js';
	import Icon from './Icon.svelte';

	const go = (id) => activeModule.set(id);
</script>

<nav class="dock-wrap" aria-label="Module navigation">
	<svg class="goo-defs" width="0" height="0" aria-hidden="true">
		<filter id="goo">
			<feGaussianBlur in="SourceGraphic" stdDeviation="4" result="blur" />
			<feColorMatrix
				in="blur"
				mode="matrix"
				values="1 0 0 0 0 0 1 0 0 0 0 0 1 0 0 0 0 0 22 -10"
				result="goo"
			/>
			<feBlend in="SourceGraphic" in2="goo" />
		</filter>
	</svg>
	<div class="gooey-dock" style="filter: url(#goo);">
		{#each moduleList as m (m.id)}
			<button
				class="dock-item"
				class:active={$activeModule === m.id}
				onclick={() => go(m.id)}
				title={m.label}
				type="button"
			>
				<span class="dock-orb" class:active-orb={$activeModule === m.id}></span>
				<span class="dock-icon"><Icon name={m.icon} size={17} stroke={2.2} /></span>
				<span class="dock-label">{m.label}</span>
			</button>
		{/each}
	</div>
</nav>

<style>
	.dock-wrap {
		position: sticky;
		bottom: 0.85rem;
		z-index: 35;
		display: flex;
		justify-content: center;
		padding: 0 0.85rem;
		margin-top: auto;
		pointer-events: none;
	}
	.gooey-dock {
		pointer-events: auto;
		position: relative;
		display: flex;
		gap: 0.28rem;
		padding: 0.3rem;
		border-radius: 999px;
		background: linear-gradient(180deg, rgba(255,255,255,0.08), rgba(255,255,255,0.0)), var(--panel);
		backdrop-filter: var(--glass-blur);
		-webkit-backdrop-filter: var(--glass-blur);
		border: 1px solid var(--border-bright);
		box-shadow: var(--shadow), inset 0 1px 1px rgba(255, 255, 255, 0.18);
	}
	.dock-item {
		position: relative;
		display: inline-flex;
		align-items: center;
		gap: 0.45rem;
		height: 44px;
		padding: 0 0.7rem;
		border: none;
		border-radius: 999px;
		background: transparent;
		color: var(--muted);
		cursor: pointer;
		font-family: inherit;
		font-size: 0.7rem;
		font-weight: 700;
		letter-spacing: 0.05em;
		text-transform: uppercase;
		transition: color 0.25s ease;
		will-change: transform;
	}
	.dock-orb {
		position: absolute;
		top: 50%;
		left: 50%;
		width: 44px;
		height: 44px;
		margin-top: -22px;
		margin-left: -22px;
		border-radius: 999px;
		background: linear-gradient(135deg, var(--accent), var(--accent-2));
		transform: scale(0);
		transition: transform 0.42s cubic-bezier(0.34, 1.6, 0.64, 1), width 0.42s cubic-bezier(0.34, 1.6, 0.64, 1), height 0.42s cubic-bezier(0.34, 1.6, 0.64, 1),
			margin 0.42s;
		z-index: 0;
		pointer-events: none;
	}
	.dock-item:hover {
		color: var(--text);
	}
	.dock-item.active {
		color: #04070f;
	}
	.dock-item.active .dock-orb {
		width: calc(100% - 6px);
		height: 40px;
		margin-top: -20px;
		margin-left: -calc((100% - 6px) / 2);
		transform: scale(1);
	}
	.dock-icon, .dock-label {
		position: relative;
		z-index: 1;
	}
	.dock-label {
		white-space: nowrap;
		font-size: 0.66rem;
	}
	.goo-defs {
		position: absolute;
		width: 0;
		height: 0;
		overflow: hidden;
	}
	@media (max-width: 640px) {
		.dock-label { display: none; }
		.dock-item { padding: 0 0.6rem; min-width: 46px; justify-content: center; }
	}
</style>
