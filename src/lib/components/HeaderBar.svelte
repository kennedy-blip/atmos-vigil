<script>
	import { theme, role, formFactor, formFactorOverride, modal, drawerOpen, telemetry, alerts } from '../stores.js';
	import Icon from './Icon.svelte';
	import ThemeSwitcher from './ThemeSwitcher.svelte';

	let clock = $state('');
	let latest = $derived($alerts[0] ?? null);

	const tick = () => {
		const d = new Date();
		clock = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
	};
	let interval = $state(null);

	import { onMount } from 'svelte';
	onMount(() => {
		tick();
		interval = setInterval(tick, 1000);
		return () => clearInterval(interval);
	});

	const roleLabel = { standard: 'STANDARD', pro: 'PRO', admin: 'ADMIN' };
	const roleColor = { standard: 'chip-accent', pro: 'chip-warn', admin: 'chip-danger' };
	const themeIcons = { obsidian: '#22d3ee', frost: '#0e7490', marine: '#ef4444', eco: '#2dd4bf' };

	const toggleFactor = () => {
		const current = $formFactor;
		formFactorOverride.set(current === 'desktop' ? 'mobile' : 'desktop');
	};
</script>

<header class="topbar">
	<div class="logo-block">
		<div class="brand-mark" aria-hidden="true">
			<svg viewBox="0 0 32 32" width="34" height="34">
				<defs>
					<linearGradient id="brandG" x1="0" y1="0" x2="1" y2="1">
						<stop offset="0" stop-color="#22d3ee" />
						<stop offset="0.55" stop-color="#8b5cf6" />
						<stop offset="1" stop-color="#f59e0b" />
					</linearGradient>
				</defs>
				<path d="M16 2 L28 10.5 L16 19 L4 10.5 Z" fill="url(#brandG)" opacity="0.9" />
				<path d="M10 22 L16 17 L22 22 L16 30 Z" fill="url(#brandG)" opacity="0.55" />
				<circle cx="16" cy="12" r="3.2" fill="#040710" />
				<circle cx="16" cy="12" r="1.8" fill="#22d3ee" />
			</svg>
		</div>
		<div class="brand-text">
			<div class="brand-name">ATMOS-VIGIL</div>
			<div class="brand-sub"><span class="mono">0% TypeScript</span> · Polyglot Weather Survival</div>
		</div>
	</div>

	<div class="header-stats" aria-label="Live telemetry">
		<div class="stat-chip" title="Barometric pressure">
			<span class="stat-dot" style="background:{themeIcons[$theme]}"></span>
			<span class="mono stat-num">{$telemetry.pressureHpa.toFixed(1)}</span>
			<span class="stat-unit">hPa</span>
		</div>
		<div class="stat-chip" title="Aeroacoustic wind">
			<span class="mono stat-num">{$telemetry.windMph.toFixed(1)}</span>
			<span class="stat-unit">mph</span>
		</div>
		<div class="stat-chip" title="Wet-Bulb Globe Temperature">
			<span class="mono stat-num">{$telemetry.wbgt.toFixed(1)}</span>
			<span class="stat-unit">°C WBGT</span>
		</div>
		<div class="stat-chip" title="Pressure tendency, last 3 hours">
			<span class="mono stat-num">{$telemetry.pressureTendency3h > 0 ? '+' : ''}{$telemetry.pressureTendency3h.toFixed(1)}</span>
			<span class="stat-unit">hPa/3h</span>
		</div>
	</div>

	<div class="actions">
		<ThemeSwitcher />
		<button
			class="btn btn-quiet mono"
			onclick={toggleFactor}
			title="Toggle Desktop Weather Station / Mobile Field APK preview"
		>
			<Icon name={$formFactor === 'desktop' ? 'tilt' : 'desktop'} size={15} />
			{$formFactor === 'desktop' ? 'APK Preview' : 'Desktop Station'}
		</button>
		<button class="btn btn-quiet mono" onclick={() => drawerOpen.set(true)} title="Privileges & polyglot runtime">
			<Icon name="cpu" size={15} />
			<span class="role-label {roleColor[$role]}">{roleLabel[$role]}</span>
		</button>
		<button class="btn btn-primary mono" onclick={() => modal.set('apk')} title="Download Android .APK">
			<Icon name="download" size={15} />
			<span class="apk-text">Download Android .APK</span>
		</button>
		<div class="clock mono">{clock}</div>
	</div>

	{#if latest && (latest.severity === 'critical' || latest.severity === 'danger')}
		<div class="banner" role="alert">
			<span class="pulse-dot"></span>
			{latest.message}
		</div>
	{/if}
</header>

<style>
	.topbar {
		position: sticky;
		top: 0;
		z-index: 40;
		display: flex;
		align-items: center;
		gap: 0.85rem;
		padding: 0.55rem clamp(0.7rem, 2vw, 1.4rem);
		background: linear-gradient(180deg, rgba(2, 4, 10, 0.55), rgba(2, 4, 10, 0.25));
		backdrop-filter: var(--glass-blur);
		-webkit-backdrop-filter: var(--glass-blur);
		border-bottom: 1px solid var(--border);
	}
	.logo-block {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		min-width: 0;
	}
	.brand-mark {
		display: grid;
		place-items: center;
		border-radius: 10px;
		background: linear-gradient(150deg, rgba(34, 211, 238, 0.18), rgba(139, 92, 246, 0.14));
		border: 1px solid var(--border-bright);
		padding: 0.3rem;
		box-shadow: var(--glow-cyan);
	}
	.brand-name {
		font-weight: 800;
		letter-spacing: 0.16em;
		font-size: 0.98rem;
		line-height: 1;
	}
	.brand-sub {
		font-size: 0.6rem;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		color: var(--muted);
		margin-top: 0.28rem;
	}
	.header-stats {
		display: flex;
		gap: 0.4rem;
		margin-left: 0.4rem;
		flex: 1;
		justify-content: center;
	}
	.stat-chip {
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
		padding: 0.34rem 0.7rem;
		border-radius: 999px;
		border: 1px solid var(--border);
		background: var(--panel-2);
		font-size: 0.72rem;
	}
	.stat-dot {
		width: 7px;
		height: 7px;
		border-radius: 50%;
	}
	.stat-num {
		font-weight: 700;
	}
	.stat-unit {
		color: var(--muted);
		font-size: 0.62rem;
		text-transform: uppercase;
		letter-spacing: 0.06em;
	}
	.actions {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		flex-wrap: wrap;
		justify-content: flex-end;
	}
	.btn-quiet {
		background: transparent;
		border-color: var(--border);
		padding: 0.4rem 0.66rem;
		font-size: 0.68rem;
	}
	.role-label {
		padding: 0.1rem 0.5rem;
		border-radius: 6px;
		font-size: 0.62rem;
		letter-spacing: 0.1em;
	}
	.clock {
		font-size: 0.78rem;
		letter-spacing: 0.08em;
		color: var(--muted);
		padding: 0 0.4rem 0 0.2rem;
	}
	.apk-text {
		position: relative;
	}
	.banner {
		position: absolute;
		left: 0;
		right: 0;
		bottom: -34px;
		z-index: 41;
		display: flex;
		align-items: center;
		gap: 0.6rem;
		padding: 0.5rem 1rem;
		background: linear-gradient(90deg, rgba(239, 68, 68, 0.92), rgba(194, 65, 12, 0.92));
		color: #fff;
		font-size: 0.72rem;
		font-weight: 700;
		letter-spacing: 0.05em;
		box-shadow: 0 10px 30px -10px rgba(239, 68, 68, 0.6);
		text-transform: uppercase;
	}
	@media (max-width: 1100px) {
		.header-stats { display: none; }
	}
	@media (max-width: 560px) {
		.clock { display: none; }
		.brand-sub { display: none; }
		.apk-text { font-size: 0.68rem; }
	}
</style>
