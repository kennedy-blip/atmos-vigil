<script>
	import { onDestroy, onMount } from 'svelte';
	import { role, drawerOpen, roles, pushAlert, roleCan } from '../../stores.js';
	import Icon from '../Icon.svelte';
	import Chip from '../Chip.svelte';

	let micState = $state('unknown'); // unknown | ok | denied | unavailable
	let camState = $state('unknown');
	let baroAvail = $state('unknown'); // 'native' | 'web' | 'denied'
	let hapticAvail = $state('unavailable');

	const roleOrder = ['standard', 'pro', 'admin'];

	function sheetClose() { drawerOpen.set(false); }
	function esc(e) { if (e.key === 'Escape') drawerOpen.set(false); }

	function pickRole(r) {
		role.set(r);
		pushAlert('ok', `ROLE SWITCHED — ${roles.find((x) => x.id === r)?.label ?? r}`);
	}

	async function requestMic() {
		try {
			if (!navigator.mediaDevices?.getUserMedia) { micState = 'unavailable'; return; }
			const s = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
			s.getTracks().forEach((t) => t.stop());
			micState = 'ok';
		} catch {
			micState = 'denied';
		}
	}

	async function requestCamera() {
		try {
			if (!navigator.mediaDevices?.getUserMedia) { camState = 'unavailable'; return; }
			const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
			s.getTracks().forEach((t) => t.stop());
			camState = 'ok';
		} catch {
			camState = 'denied';
		}
	}

	function testHaptics() {
		if (navigator.vibrate) {
			navigator.vibrate([40, 40, 40]);
			pushAlert('ok', 'HAPTIC TEST — 40ms pulses');
		} else {
			pushAlert('warning', 'HAPTICS UNSUPPORTED IN THIS BROWSER');
		}
	}

	onMount(() => {
		hapticAvail = navigator.vibrate ? 'available' : 'unavailable';
		document.addEventListener('keydown', esc);
		// Barometer is typically only available in the native APK — the web uses the simulator.
		if ('getSensor' in window) {
			baroAvail = 'native';
		} else {
			baroAvail = 'web';
		}
		return () => document.removeEventListener('keydown', esc);
	});

	onDestroy(() => { /* noop */ });

	const matrix = $derived([
		{
			name: 'Sub-Bass Aeroacoustic Microphone',
			port: 'getUserMedia · Kotlin AudioRecord',
			status: micState === 'ok' ? 'WEB ACTIVE' : micState === 'denied' ? 'RESTRICTED' : micState === 'unavailable' ? 'UNSUPPORTED' : 'SIMULATOR ACTIVE',
			tone: micState === 'ok' ? 'ok' : micState === 'denied' ? 'danger' : 'warn',
			action: requestMic,
			actionLabel: 'Request Web Mic'
		},
		{
			name: 'MEMS Barometer & Hygrometer',
			port: 'Sensor.TYPE_PRESSURE · BarometerThermoPlugin.kt',
			status: 'NATIVE KOTLIN',
			tone: 'accent',
			action: null,
			actionLabel: null
		},
		{
			name: 'Optical Sky & Cloud Camera',
			port: 'getUserMedia video · flash auto-detect',
			status: camState === 'ok' ? 'WEB ACTIVE' : camState === 'denied' ? 'RESTRICTED' : camState === 'unavailable' ? 'UNSUPPORTED' : 'SIMULATOR ACTIVE',
			tone: camState === 'ok' ? 'ok' : camState === 'denied' ? 'danger' : 'warn',
			action: requestCamera,
			actionLabel: 'Request Camera'
		},
		{
			name: 'Shockwave Haptic Engine',
			port: 'navigator.vibrate · Capacitor Haptics',
			status: hapticAvail === 'available' ? 'WEB ACTIVE' : 'RESTRICTED',
			tone: hapticAvail === 'available' ? 'ok' : 'danger',
			action: testHaptics,
			actionLabel: 'Test Haptics'
		}
	]);
</script>

{#if $drawerOpen}
	<div class="drawer-overlay" onclick={sheetClose} role="dialog" aria-modal="true" tabindex="-1">
		<aside class="drawer-panel" onclick={(e) => e.stopPropagation()}>
			<header class="drawer-head">
				<div>
					<div class="eyebrow">Privileges & Polyglot Runtime</div>
					<h2 class="drawer-title">Access Matrix</h2>
				</div>
				<button class="icon-btn" onclick={sheetClose} aria-label="Close"><Icon name="close" size={18} /></button>
			</header>

			<section class="drawer-section">
				<h3 class="sec-h">Role-Based Access</h3>
				<div class="role-stack">
					{#each roles as r (r.id)}
						<button
							class="role-btn"
							class:active={$role === r.id}
							onclick={() => pickRole(r.id)}
							type="button"
						>
							<span class="role-short">{r.short.toUpperCase()}</span>
							<span class="role-name">{r.label}</span>
							<span class="role-check">{$role === r.id ? '✓' : ''}</span>
						</button>
					{/each}
				</div>
			</section>

			<section class="drawer-section">
				<h3 class="sec-h">Capability Unlocks</h3>
				<div class="cap-list">
					{#each ['windLab', 'lightningRadar', 'baroLab', 'wbgtShield', 'windLoad', 'spectralLightning', 'lcl', 'cape', 'inspector', 'export', 'sync'] as cap (cap)}
						<div class="cap-row" class:unlocked={roleCan($role, cap)}>
							<span class="cap-dot"></span>
							<span class="cap-name">{cap.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase())}</span>
							<span class="cap-state">{roleCan($role, cap) ? 'UNLOCKED' : 'LOCKED'}</span>
						</div>
					{/each}
				</div>
			</section>

			<section class="drawer-section">
				<h3 class="sec-h">Hardware Permission Matrix</h3>
				<div class="matrix">
					{#each matrix as row (row.name)}
						<div class="matrix-row">
							<div class="matrix-main">
								<div class="matrix-name">{row.name}</div>
								<div class="matrix-port mono">{row.port}</div>
								<div class="matrix-status"><Chip tone={row.tone}>{row.status}</Chip></div>
							</div>
							{#if row.action}
								<button class="btn btn-quiet" onclick={row.action} type="button">{row.actionLabel}</button>
							{/if}
						</div>
					{/each}
				</div>
			</section>

			<footer class="drawer-foot">
				<p class="hint">Dev-time role switching — no real authentication. This drawer is a demo of the RBAC architecture.</p>
			</footer>
		</aside>
	</div>
{/if}

<style>
	.drawer-head {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		padding: 1rem 1rem 0.6rem;
	}
	.drawer-title { margin: 0.15rem 0 0; font-size: 1.3rem; font-weight: 900; letter-spacing: 0.03em; }
	.drawer-section {
		padding: 0.8rem 1rem 0.6rem;
		border-top: 1px solid var(--border);
	}
	.sec-h {
		margin: 0 0 0.6rem;
		font-size: 0.68rem;
		letter-spacing: 0.18em;
		text-transform: uppercase;
		color: var(--muted);
	}
	.role-stack { display: flex; flex-direction: column; gap: 0.4rem; }
	.role-btn {
		display: grid;
		grid-template-columns: 70px 1fr 24px;
		align-items: center;
		gap: 0.6rem;
		padding: 0.55rem 0.65rem;
		border: 1px solid var(--border);
		border-radius: 13px;
		background: var(--panel-2);
		color: var(--text);
		cursor: pointer;
		text-align: left;
		font-family: inherit;
		transition: all 0.18s ease;
	}
	.role-btn:hover { border-color: var(--accent); }
	.role-btn.active {
		border-color: var(--accent);
		background: linear-gradient(150deg, rgba(34,211,238,0.14), rgba(139,92,246,0.1));
		box-shadow: var(--glow-cyan);
	}
	.role-short { font-size: 0.58rem; font-weight: 800; letter-spacing: 0.12em; color: var(--accent); }
	.role-name { font-size: 0.8rem; font-weight: 700; line-height: 1.3; }
	.role-check { color: var(--ok); font-weight: 900; text-align: center; }
	.cap-list { display: flex; flex-direction: column; gap: 0.25rem; }
	.cap-row {
		display: grid;
		grid-template-columns: 10px 1fr auto;
		align-items: center;
		gap: 0.5rem;
		padding: 0.3rem 0.2rem;
		font-size: 0.74rem;
		color: var(--muted);
	}
	.cap-row.unlocked { color: var(--text); }
	.cap-dot { width: 7px; height: 7px; border-radius: 50%; background: var(--muted); }
	.cap-row.unlocked .cap-dot { background: var(--ok); box-shadow: 0 0 8px rgba(16,185,129,0.55); }
	.cap-state { font-size: 0.58rem; letter-spacing: 0.12em; font-weight: 700; }
	.cap-row.unlocked .cap-state { color: var(--ok); }
	.matrix { display: flex; flex-direction: column; gap: 0.45rem; }
	.matrix-row {
		display: grid;
		grid-template-columns: 1fr auto;
		gap: 0.6rem;
		align-items: center;
		padding: 0.55rem 0.6rem;
		border: 1px solid var(--border);
		border-radius: 13px;
		background: var(--panel-2);
	}
	.matrix-main { display: flex; flex-direction: column; gap: 0.2rem; }
	.matrix-name { font-size: 0.82rem; font-weight: 700; line-height: 1.3; }
	.matrix-port { font-size: 0.62rem; color: var(--muted); }
	.matrix-status { display: flex; margin-top: 0.05rem; }
	.drawer-foot {
		margin-top: auto;
		padding: 0.85rem 1rem;
		border-top: 1px solid var(--border);
	}
	.hint { font-size: 0.68rem; color: var(--muted); line-height: 1.45; }
	.icon-btn {
		width: 34px; height: 34px; border-radius: 10px;
		border: 1px solid var(--border);
		background: transparent; color: var(--muted);
		cursor: pointer; display: grid; place-items: center;
	}
	.icon-btn:hover { color: var(--text); border-color: var(--accent); }
</style>
