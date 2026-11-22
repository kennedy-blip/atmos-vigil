<script>
	import { onDestroy, onMount } from 'svelte';
	import { spring } from 'svelte/motion';
	import { telemetry, patchTelemetry, alerts, pushAlert, role, roleCan } from '../../stores.js';
	import {
		M_PER_MPH,
		KMH_PER_MPH,
		KNOTS_PER_MPH,
		FT_PER_M,
		beaufortFor,
		dynamicPressurePa,
		lbft2,
		windForceN,
		lbsOfForce,
		windSpeedFromRms,
		spectralRms
	} from '../../engines/meteoEngine.js';
	import {
		startMic,
		stopMic,
		startWindSimulator,
		WIND_PRESETS_LIST
	} from '../../engines/audioEngine.js';
	import Icon from '../Icon.svelte';
	import Card from '../Card.svelte';
	import Stat from '../Stat.svelte';
	import Slider from '../Slider.svelte';
	import Chip from '../Chip.svelte';
	import { saveEntry } from '../../engines/db.js';

	// ---- state ----
	let mic = $state(null);
	let sim = $state(null);
	let mode = $state('idle'); // 'idle' | 'mic' | 'sim'
	let simForce = $state(5);
	let micError = $state('');
	let sensitivity = $state(1.0);
	let speakerOn = $state(true);
	let mph = $state(0);
	let beaufort = $state(0);
	let rms = $state(0);
	let rotor = $state(0);
	let chartCanvas = $state(null);
	let history = $state([]);
	let rafId = $state(0);
	let tickId = $state(0);
	let startMs = $state(0);
	let peakMph = $state(0);

	// structural wind-load calculator
	let areaInput = $state('2.5');
	let areaUnit = $state('m2'); // 'm2' | 'ft2'
	let load = $derived(calcLoad(Number(areaInput || 0), areaUnit, mph));

	// watch altitude of rotor
	const rotorSpring = spring(0, { stiffness: 0.08, damping: 0.6 });
	let lastTs = 0;

	const raf = (ts) => {
		if (rafId < 0) return;
		if (lastTs === 0) lastTs = ts;
		const dt = Math.min(0.1, (ts - lastTs) / 1000);
		lastTs = ts;
		rorotor = (rotor + (4 + mph * 0.55) * dt * 22) % 360;
		try {
			rotorSpring.target = rotor;
		} catch { /* noop */ }
		rafId = requestAnimationFrame(raf);
	};

	function calcLoad(area, unit, speed) {
		const m2 = unit === 'm2' ? area : area * 0.09290304;
		const qPa = dynamicPressurePa(speed);
		const force = qPa * m2;
		return {
			m2,
			forceN: force,
			forceLb: lbsOfForce(force),
			qPa
		};
	}

	function drawChart() {
		if (!chartCanvas) return;
		const dpr = Math.min(2, window.devicePixelRatio || 1);
		const rect = chartCanvas.getBoundingClientRect();
		if (rect.width < 4) return;
		chartCanvas.width = rect.width * dpr;
		chartCanvas.height = rect.height * dpr;
		const ctx = chartCanvas.getContext('2d');
		ctx.scale(dpr, dpr);
		const W = rect.width;
		const H = rect.height;
		ctx.clearRect(0, 0, W, H);
		// grid
		ctx.strokeStyle = 'rgba(148,178,255,0.12)';
		ctx.lineWidth = 1;
		for (let i = 1; i < 4; i++) {
			ctx.beginPath();
			ctx.moveTo(0, (H / 4) * i);
			ctx.lineTo(W, (H / 4) * i);
			ctx.stroke();
		}
		if (history.length < 2) return;
		const values = history.slice(-72);
		const max = Math.max(25, ...values);
		const step = W / (values.length - 1 || 1);
		ctx.beginPath();
		values.forEach((v, i) => {
			const x = i * step;
			const y = H - (v / max) * (H - 12) - 4;
			i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
		});
		ctx.strokeStyle = '#22d3ee';
		ctx.lineWidth = 2;
		ctx.shadowColor = 'rgba(34,211,238,0.6)';
		ctx.shadowBlur = 8;
		ctx.stroke();
		ctx.shadowBlur = 0;
		ctx.lineTo(W, H);
		ctx.lineTo(0, H);
		ctx.closePath();
		const grad = ctx.createLinearGradient(0, 0, 0, H);
		grad.addColorStop(0, 'rgba(34,211,238,0.28)');
		grad.addColorStop(1, 'rgba(34,211,238,0)');
		ctx.fillStyle = grad;
		ctx.fill();
	}

	async function enableMic() {
		micError = '';
		stopAll();
		const res = await startMic();
		if (!res.ok) {
			micError = res.reason || 'Mic unavailable';
			pushAlert('warning', `MICROPHONE RESTRICTED: ${micError}`);
			return;
		}
		mic = res;
		mode = 'mic';
		// keep audio live from mic — no speaker output (avoid feedback)
		activeAnalyser();
		startTick();
		patchTelemetry({ windSource: 'mic' });
	}

	function activeAnalyser() {
		// pick analyser based on mode
		return mode === 'mic' ? mic?.analyser : sim?.analyser ?? null;
	}

	function startTick() {
		const analyser = activeAnalyser();
		if (!analyser) return;
		clearInterval(tickId);
		tickId = setInterval(() => {
			const a = activeAnalyser();
			if (!a) return;
			const r = spectralRms(a, 20, 250);
			rms = r;
			mph = windSpeedFromRms(r, sensitivity);
			beaufort = beaufortFor(mph).force;
			if (mph > peakMph) peakMph = mph;
			history = [...history.slice(-71), mph];
			patchTelemetry({ windMph: mph, windMs: mph * M_PER_MPH, beaufort, dynamicPressurePa: dynamicPressurePa(mph), windSource: mode });
			drawChart();
			if (beaufort >= 8) {
				const tag = beaufort >= 10 ? 'STRUCTURAL HAZARD' : 'SECURE TENTS / AWNINGS';
				pushAlert(beaufort >= 10 ? 'critical' : 'warning', `${tag}: GUST ${mph.toFixed(1)} MPH — BEAUFORT ${beaufort}`);
				try { navigator.vibrate?.([80, 60, 120]); } catch { /* noop */ }
			}
		}, 160);
	}

	function startSimulator(force) {
		stopAll();
		micError = '';
		simForce = force;
		const s = startWindSimulator(force, {
			outputGain: speakerOn ? 0.32 : 0,
			onAnalyser: () => {}
		});
		sim = s;
		mode = 'sim';
		startTick();
		patchTelemetry({ windSource: 'simulator' });
		activeAnalyser();
	}

	function stopAll() {
		clearInterval(tickId);
		tickId = 0;
		if (mic) { stopMic(mic); mic = null; }
		if (sim) { try { sim.stop(); } catch { /* noop */ } sim = null; }
		if (mode === 'sim' && history.length > 3) {
			try {
				saveEntry('wind', { beaufort, mph: Number(mph.toFixed(1)), peak: Number(peakMph.toFixed(1)), source: 'simulator', preset: simForce });
			} catch { /* noop */ }
		}
		mode = 'idle';
		sptr(); // stop rotor rAF
		patchTelemetry({ windSource: 'none' });
	}

	function spmResetPeak() { peakMph = 0; }

	function spmToggleSound() {
		speakerOn = !speakerOn;
		if (sim) { try { sim.setOutputGain(speakerOn ? 0.32 : 0); } catch { /* noop */ } }
	}

	function spmStartMic() {
		enableMic();
	}

	function spmStartSim(force) {
		startSimulator(force);
	}

	function spmStopMic() {
		stopAll();
	}

	function spmToggleSpeaker() {
		spmToggleSound();
	}

	function spmSetSensitivity(v) {
		sensitivity = v;
	}

	function spmAreaUnit(u) {
		areaUnit = u;
	}

	function spmExport() {
		try {
			const payload = {
				beaufort, mph: Number(mph.toFixed(1)),
				peak: Number(peakMph.toFixed(1)),
				pressurePa: dynamicPressurePa(mph),
				source: mode,
				sensitivity
			};
			saveEntry('wind', payload);
			pushAlert('ok', `WIND SESSION LOGGED — ${mph.toFixed(1)} MPH BEAUFORT ${beaufort}`);
		} catch { /* noop */ }
	}

	function spmExportLoad() {
		reportLoad();
	}

	function reportLoad() {
		pushAlert('info', `WIND LOAD ${load.forceN.toFixed(1)} N (${load.forceLb.toFixed(1)} lbf) — ${load.m2.toFixed(2)} m² at ${mph.toFixed(1)} mph`);
	}

	// rotor loop — start/stop
	let rotorRunning = false;
	function startRotor() {
		if (rotorRunning) return;
		rotorRunning = true;
		lastTs = 0;
		rafId = requestAnimationFrame(raf);
	}
	function stopRotor() {
		rotorRunning = false;
		cancelAnimationFrame(rafId);
		rafId = -1;
	}
	function sptr() { stopRotor(); }
	function spdStart() { startRotor(); }

	onMount(() => {
		spmResetPeak();
		sptr();
		drawChart();
		const r = () => drawChart();
		window.addEventListener('resize', r);
		return () => window.removeEventListener('resize', r);
	});

	onDestroy(() => {
		clearInterval(tickId);
		stopRotor();
		if (mic) stopMic(mic);
		if (sim) { try { sim.stop(); } catch { /* noop */ } }
	});

	// auto-start rotor when a mode is active
	$effect(() => {
		if (mode !== 'idle') startRotor();
		else stopRotor();
	});
</script>

<div class="module wind-module">
	<Card
		kicker="01 · Aero-Anemometer"
		title="Structural Wind & Aeroacoustic Lab"
		class="hero-wind"
	>
		{#snippet actions()}
			<Chip tone={mode === 'mic' ? 'accent' : mode === 'sim' ? 'warn' : 'muted-tone'}>{mode === 'mic' ? 'MIC LIVE' : mode === 'sim' ? 'SIMULATOR' : 'IDLE'}</Chip>
		{/snippet}

		<div class="wind-top">
			<div class="turbine-wrap">
				<svg class="turbine" viewBox="0 0 240 240" aria-label="Wind turbine rotor">
					<defs>
						<linearGradient id="bladeG" x1="0" y1="0" x2="1" y2="1">
							<stop offset="0" stop-color="#22d3ee" stop-opacity="0.95" />
							<stop offset="1" stop-color="#8b5cf6" stop-opacity="0.72" />
						</linearGradient>
						<radialGradient id="hubG" cx="50%" cy="50%" r="50%">
							<stop offset="0" stop-color="rgba(255,255,255,0.5)" />
							<stop offset="0.65" stop-color="rgba(34,211,238,0.25)" />
							<stop offset="1" stop-color="rgba(255,255,255,0)" />
						</radialGradient>
					</defs>
					<circle cx="120" cy="120" r="112" fill="none" stroke="var(--border)" stroke-width="1" />
					<circle cx="120" cy="120" r="96" fill="none" stroke="var(--border)" stroke-width="0.8" stroke-dasharray="3 8" />
					<g style="transform: rotate({$rotorSpring}deg); transform-origin: 120px 120px;">
						{#each [0, 120, 240] as deg (deg)}
							<path d="M120 120 L120 18 L160 40 L140 118 Z" fill="url(#bladeG)" transform="rotate({deg} 120 120)" opacity="0.92" />
						{/each}
						<circle cx="120" cy="120" r="26" fill="url(#hubG)" />
						<circle cx="120" cy="120" r="9" fill="#04070f" stroke="#22d3ee" stroke-width="2" />
					</g>
				</svg>
				<div class="rotor-readout">
					<div class="mph display-num">{mph.toFixed(1)}</div>
					<div class="mph-unit">mph</div>
				</div>
			</div>

			<div class="wind-stats">
				<Stat label="Beaufort Force" value={beaufort} unit={beaufort === 0 ? 'calm' : `(${beaufortFor(mph).name})`} tone={beaufort >= 10 ? 'danger' : beaufort >= 5 ? 'warn' : 'accent'} />
				<Stat label="Wind Speed" value={mph.toFixed(1)} unit="mph · {(mph * KNOTS_PER_MPH).toFixed(1)} kn · {(mph * KMH_PER_MPH).toFixed(1)} km/h · {(mph * M_PER_MPH).toFixed(1)} m/s" tone="accent" />
				<Stat label="Dynamic Pressure" value={Math.round(dynamicPressurePa(mph))} unit="Pa · {lbft2(dynamicPressurePa(mph)).toFixed(1)} lb/ft²" tone={mph >= 44.5 ? 'warn' : 'accent'} />
				<Stat label="Peak This Session" value={peakMph.toFixed(1)} unit="mph" tone="warn" />
				<div class="wind-quick">
					<Chip tone="accent"><span class="mono">{$telemetry.pressureHpa.toFixed(1)} hPa</span></Chip>
					<Chip tone="accent"><span class="mono">{$telemetry.wbgt.toFixed(1)}°C WBGT</span></Chip>
				</div>
			</div>
		</div>

		<div class="gust-graph glass-raised">
			<canvas bind:this={chartCanvas}></canvas>
		</div>
	</Card>

	<Card kicker="Dual Input Engine" title="Live Mic · Simulators">
		<div class="input-grid">
			<div class="col">
				<div class="row-head"><span class="eyebrow">Live Microphone (no filters)</span></div>
				<p class="hint">Hold the phone into the wind or blow gently across the mic. Echo cancellation and noise suppression are disabled so 20–250 Hz turbulence is captured pure.</p>
				<div class="btns-row">
					<button class="btn btn-primary" onclick={spmStartMic} disabled={mode === 'mic'}>
						<Icon name="mic" size={15} /> Start Live Mic
					</button>
					<button class="btn btn-danger" onclick={spmStopMic} disabled={mode !== 'mic'}>
						<Icon name="stop" size={14} /> Stop Mic
					</button>
				</div>
				{#if micError}<div class="inline-warn"><Icon name="close" size={13} /> {micError}</div>{/if}
				{#if mode === 'mic'}<div class="live-note"><span class="pulse-dot"></span><span class="mono">DSP ACTIVE — 20–250 Hz RMS · cube-root law</span></div>{/if}
			</div>
			<div class="col">
				<div class="row-head"><span class="eyebrow">Built-in Aeroacoustic Presets</span></div>
				<p class="hint">Real synthesized wind turbulence audio driving the same DSP.</p>
				<div class="preset-grid">
					{#each WIND_PRESETS_LIST as p (p.force)}
						<button
							class="preset-btn"
							class:active={mode === 'sim' && simForce === p.force}
							onclick={() => spmStartSim(p.force)}
							type="button"
						>
							<span class="preset-force mono">F{p.force}</span>
							<span class="preset-name">{p.label}</span>
							<span class="preset-speed mono">{p.targetMph.toFixed(1)} mph</span>
						</button>
					{/each}
				</div>
			</div>
		</div>
		<div class="controls-row">
			<Slider label="DSP Sensitivity" value={sensitivity} min={0.25} max={3} step={0.05} unit="×" onchange={spmSetSensitivity} />
			<button class="btn btn-ghost" onclick={spmToggleSpeaker} title="Speaker">
				<Icon name="speaker" size={15} /> {speakerOn ? 'Speaker ON' : 'Speaker MUTED'}
			</button>
			<button class="btn btn-ghost" onclick={spmExport} title="Log session to IndexedDB vault">
				<Icon name="file" size={15} /> Log
			</button>
		</div>
	</Card>

	<Card kicker="Structural Load Calculator" title="Tent / Awning Uplift & Lateral Force">
		{#snippet actions()}
			<Chip tone={$role === 'pro' || $role === 'admin' ? 'ok' : 'warn'}>{$role === 'pro' || $role === 'admin' ? 'PRO TIER' : 'STANDARD (read-only)'}</Chip>
		{/snippet}
		{#if $role === 'standard'}
			<p class="hint">Wind-load calculator unlocks at Storm Spotter & Mariner Pro tier. Switch roles in the dashboard drawer.</p>
		{:else}
			<div class="load-grid">
				<div class="load-fields">
					<div class="field-row">
						<span class="eyebrow">Surface area (m² × ft²)</span>
						<input type="text" class="mono area-input" bind:value={areaInput} placeholder="2.5" inputmode="decimal" />
					</div>
					<div class="unit-toggle">
						<button class="btn btn-quiet" class:active={areaUnit === 'm2'} onclick={() => spmAreaUnit('m2')}>m²</button>
						<button class="btn btn-quiet" class:active={areaUnit === 'ft2'} onclick={() => spmAreaUnit('ft2')}>ft²</button>
					</div>
					<div class="load-num mono">
						{load.m2.toFixed(2)} m² · {(load.m2 * FT_PER_M * FT_PER_M).toFixed(1)} ft²
					</div>
				</div>
				<div class="load-results">
					<Stat label="Total Lateral Force" value={load.forceN.toFixed(1)} unit="N" tone="accent" />
					<Stat label="Total Uplift Load" value={load.forceLb.toFixed(1)} unit="lbf" tone="warn" />
					<Stat label="Dynamic Pressure" value={load.qPa.toFixed(1)} unit="Pa" tone="accent" />
				</div>
			</div>
			<button class="btn btn-ghost" onclick={spmExportLoad}><Icon name="plus" size={14} /> Log load to vault</button>
		{/if}
	</Card>
</div>

<style>
	.wind-module {
		display: grid;
		grid-template-columns: 1fr;
		gap: 1rem;
	}
	.hero-wind .wind-top {
		display: grid;
		grid-template-columns: 280px 1fr;
		gap: 1.1rem;
		align-items: center;
	}
	.turbine-wrap {
		position: relative;
		display: grid;
		place-items: center;
		padding: 0.6rem;
	}
	.turbine {
		width: min(100%, 280px);
		height: auto;
		filter: drop-shadow(0 12px 30px rgba(34, 211, 238, 0.35));
		will-change: transform;
	}
	.rotor-readout {
		position: absolute;
		bottom: -1.1rem;
		left: 0;
		right: 0;
		display: flex;
		flex-direction: column;
		align-items: center;
	}
	.mph {
		font-size: clamp(2.6rem, 6vw, 3.4rem);
		background: linear-gradient(180deg, #fff 20%, #22d3ee 125%);
		-webkit-background-clip: text;
		background-clip: text;
		color: transparent;
		text-shadow: 0 0 30px rgba(34, 211, 238, 0.35);
	}
	.mph-unit {
		font-size: 0.62rem;
		letter-spacing: 0.5em;
		text-transform: uppercase;
		color: var(--muted);
	}
	.wind-stats {
		display: flex;
		flex-direction: column;
		gap: 0.85rem;
	}
	.wind-quick {
		display: flex;
		gap: 0.35rem;
		flex-wrap: wrap;
	}
	.gust-graph {
		margin-top: 1.1rem;
		height: 92px;
		padding: 0.35rem;
		overflow: hidden;
	}
	.gust-graph canvas {
		width: 100%;
		height: 100%;
		display: block;
	}
	.input-grid {
		display: grid;
		grid-template-columns: 1fr 1.25fr;
		gap: 1rem;
	}
	.col { min-width: 0; }
	.row-head { display: flex; justify-content: space-between; align-items: center; }
	.hint {
		font-size: 0.76rem;
		color: var(--muted);
		line-height: 1.45;
		margin: 0.35rem 0 0.7rem;
	}
	.btns-row { display: flex; gap: 0.45rem; flex-wrap: wrap; }
	.inline-warn {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		color: var(--warn);
		font-size: 0.74rem;
		margin-top: 0.45rem;
	}
	.live-note {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		margin-top: 0.6rem;
		font-size: 0.66rem;
		color: var(--accent);
		letter-spacing: 0.1em;
	}
	.preset-grid {
		display: grid;
		grid-template-columns: repeat(2, 1fr);
		gap: 0.45rem;
	}
	.preset-btn {
		display: flex;
		flex-direction: column;
		gap: 0.12rem;
		text-align: left;
		padding: 0.55rem 0.65rem;
		border-radius: 13px;
		border: 1px solid var(--border);
		background: var(--panel-2);
		color: var(--text);
		cursor: pointer;
		transition: transform 0.16s ease, border-color 0.2s ease, box-shadow 0.2s ease;
		font-family: inherit;
	}
	.preset-btn:hover { transform: translateY(-2px); border-color: var(--accent); }
	.preset-btn.active {
		border-color: var(--accent);
		box-shadow: var(--glow-cyan);
		background: linear-gradient(150deg, rgba(34, 211, 238, 0.16), rgba(139, 92, 246, 0.1));
	}
	.preset-force { font-size: 0.6rem; letter-spacing: 0.14em; color: var(--muted); }
	.preset-name { font-size: 0.74rem; font-weight: 700; }
	.preset-speed { font-size: 0.66rem; color: var(--accent); }
	.controls-row {
		margin-top: 0.9rem;
		display: grid;
		grid-template-columns: 1fr auto auto;
		align-items: end;
		gap: 0.75rem;
	}
	.load-grid {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 0.9rem;
		align-items: center;
	}
	.load-fields { display: flex; flex-direction: column; gap: 0.6rem; }
	.field-row { display: flex; flex-direction: column; gap: 0.35rem; }
	.area-input { width: 100%; font-size: 1.3rem; }
	.unit-toggle { display: flex; gap: 0.4rem; }
	.unit-toggle button.active {
		border-color: var(--accent);
		color: var(--accent);
	}
	.load-num { font-size: 0.78rem; color: var(--muted); }
	.load-results {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 0.75rem;
	}
	@media (max-width: 880px) {
		.hero-wind .wind-top { grid-template-columns: 1fr; }
		.turbine-wrap { padding-top: 0.7rem; }
		.rotor-readout { position: absolute; bottom: 0.4rem; }
		.input-grid { grid-template-columns: 1fr; }
		.load-grid { grid-template-columns: 1fr; }
		.controls-row { grid-template-columns: 1fr; }
		.load-results { grid-template-columns: 1fr; }
	}
</style>
