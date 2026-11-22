<script>
	import { onDestroy, onMount } from 'svelte';
	import { spring } from 'svelte/motion';
	import { telemetry, patchTelemetry, pushAlert, forensicsItem, modal, role } from '../../stores.js';
	import {
		soundSpeed,
		strikeDistanceKm,
		spectralRollOffEstimate,
		stormApproachVelocityKmh
	} from '../../engines/meteoEngine.js';
	import {
		startMic,
		stopMic,
		startThunderSimulator,
		startFlashDetector,
		THUNDER_PRESETS_LIST
	} from '../../engines/audioEngine.js';
	import { saveEntry } from '../../engines/db.js';
	import Icon from '../Icon.svelte';
	import Card from '../Card.svelte';
	import Stat from '../Stat.svelte';
	import Chip from '../Chip.svelte';

	// ---- state ----
	let strikeLog = $state([]); // {id, ts, distanceKm, label, spectral?, sim?}
	let mode = $state('idle'); // 'flashArmed' | 'flashing' | 'spectralArmed' | 'capturing'
	let flashAt = $state(0);
	let mic = $state(null);
	let sim = $state(null);
	let thunderMs = $state(0);
	let strikeCnt = $state(0);
	let radar = $state(null);
	let rafId = $state(0);
	let lastSnapshot = $state(0);
	let lastTransient = $state(0);
	let spectralDist = $state(0);
	let spectralRolloff = $state(0);
	let camera = $state(null);
	let cameraOn = $state(false);
	let lastStrikeId = $state(0);
	let radarT = $state(0);
	let micError = $state('');

	const isPro = $derived($role === 'pro' || $role === 'admin');

	const waveRings = spring(1, { stiffness: 0.1, damping: 0.5 });

	let tempC = $state($telemetry.temperatureC ?? 22);
	$effect(() => { tempC = $telemetry.temperatureC ?? 22; });

	function soundMs() { return soundSpeed(tempC); }

	function pushLog(entry) {
		const item = { id: ++strikeCnt, ts: Date.now(), ...entry };
		strikeLog = [item, ...strikeLog].slice(0, 12);
		lastStrikeId = item.id;
		patchTelemetry({ stormApproachVelocity: stormApproachVelocityKmh(strikeLog.map((s) => ({ ts: s.ts, km: s.distanceKm }))) });
		try { saveEntry('lightning', { distanceKm: item.distanceKm, label: item.label, source: item.source }); } catch { /* noop */ }
		if (item.distanceKm < 5) {
			pushAlert('critical', `DANGER: CLOSE LIGHTNING ${item.distanceKm.toFixed(1)} KM — SEEK SHELTER`);
			try { navigator.vibrate?.([120, 60, 120, 60, 120]); } catch { /* noop */ }
		} else if (item.distanceKm < 10) {
			pushAlert('warning', `APPROACHING CELL — ${item.distanceKm.toFixed(1)} KM`);
		}
		return item;
	}

	function flash() {
		if (mode === 'flashing') return;
		flashAt = Date.now();
		waveRings.target = 1;
		mode = 'flashing';
		try { navigator.vibrate?.([20, 30, 20]); } catch { /* noop */ }
	}

	function thunder() {
		if (mode !== 'flashing' || !flashAt) {
			flashAt = 0;
			return;
		}
		const dt = (Date.now() - flashAt) / 1000;
		flashAt = 0;
		const dKm = strikeDistanceKm(dt, tempC);
		const item = pushLog({ distanceKm: Math.round(dKm * 10) / 10, label: 'Manual Flash-to-Bang', source: 'flashbang', flashDeltaS: Math.round(dt * 100) / 100 });
		mode = 'idle';
		const sVel = stormApproachVelocityKmh(strikeLog.map((s) => ({ ts: s.ts, km: s.distanceKm })));
		pushAlert('info', `FLASH-TO-BANG — ${item.distanceKm.toFixed(1)} KM (${item.flashDeltaS}s, sound ${Math.round(soundMs())} m/s)`);
		if (sVel && sVel > 20) {
			pushAlert('critical', `STORM CELL APPROACHING AT ${sVel} KM/H — SEEK INDOOR SHELTER`, { kind: 'storm-velocity' });
		}
	}

	async function startFlashCamera() {
		if (cameraOn) {
			camera?.stop?.();
			camera = null;
			cameraOn = false;
			return;
		}
		const res = await startFlashDetector({
			onFlash: () => { flash(); }
		});
		if (res.ok) {
			camera = res;
			cameraOn = true;
			pushAlert('info', 'OPTICAL SKY FLASH DETECTOR ON — watch the sky');
		} else {
			pushAlert('warning', `CAMERA FLASH DETECTOR RESTRICTED: ${res.reason}`);
			cameraOn = false;
		}
	}

	async function startSpectral() {
		if (mic) {
			// spectral already armed
			stopSpectral();
			return;
		}
		const res = await startMic();
		if (!res.ok) {
			micError = res.reason;
			pushAlert('warning', `MIC RESTRICTED: ${res.reason ?? micError}`);
			return;
		}
		mic = res;
		mode = 'spectralArmed';
		startNoiseListener();
	}

	function stopSpectral() {
		if (mic) { stopMic(mic); mic = null; }
		mode = 'idle';
		spbListenerStop = true;
	}

	let spbListenerStop = false;
	async function startNoiseListener() {
		spbListenerStop = false;
		const analyser = mic?.analyser;
		if (!analyser) return;
		let baseline = 0;
		const buf = new Float32Array(analyser.frequencyBinCount);
		const loop = () => {
			if (spbListenerStop || mode !== 'spectralArmed') return;
			analyser.getFloatFrequencyData(buf);
			const binHz = (mic?.analyser?.context?.sampleRate ?? 48000) / (analyser.fftSize || 2048);
			let energy = 0;
			for (let i = 0; i < buf.length; i++) {
				const f = i * binHz;
				if (f < 40 || f > 2000) continue;
				energy += Math.pow(10, buf[i] / 20);
			}
			const tg = energy / Math.max(1, (2000 - 40) / binHz);
			if (baseline === 0) baseline = tg;
			baseline = baseline * 0.98 + tg * 0.02;
			const transient = tg > baseline * 4.2 && (Date.now() - lastTransient) > 700;
			if (transient) {
				lastTransient = Date.now();
				mode = 'capturing';
				captureSpectral();
				return;
			}
			setTimeout(loop, 60);
		};
		loop();
	}

	function captureSpectral() {
		setTimeout(() => {
			const est = spectralRollOffEstimate(null, mic?.analyser, tempC);
			spectralDist = est.distanceKm;
			spectralRolloff = est.rolloffHz;
			const item = pushLog({ distanceKm: est.distanceKm, label: 'Brontophonic Spectral', source: 'spectral', rolloffHz: est.rolloffHz });
			pushAlert('info', `SPECTRAL ESTIMATE — Δ≈${est.distanceKm} km · roll-off ${est.rolloffHz} Hz`);
			mode = 'spectralArmed';
			startNoiseListener();
		}, 1400);
	}

	// ---- thunder simulators ----
	const startThunderSim = (presetId) => {
		if (sim) { try { sim.stop(); } catch { /* noop */ } sim = null; }
		const preset = THUNDER_PRESETS_LIST.find((p) => p.id === presetId);
		if (!preset) return;
		const s = startThunderSimulator(presetId, { outputGain: 0.45 });
		sim = s;
		const pushSimStrike = (km, i) => {
			setTimeout(() => {
				pushLog({ distanceKm: km, label: `Sim · ${preset.label}`, source: 'simulator', sim: true, idx: i });
			}, i * 750);
		};
		if (preset.multi) {
			preset.multi.forEach((km, i) => pushSimStrike(km, i));
		} else {
			pushSimStrike(preset.targetKm, 0);
		}
		// approximate spectral estimate after capture window
		setTimeout(() => {
			if (sim && sim.analyser) {
				const est = spectralRollOffEstimate(null, sim.analyser, tempC);
				spectralDist = est.distanceKm;
				spectralRolloff = est.rolloffHz;
			}
		}, 1400);
	};

	function clearLog() {
		strikeLog = [];
		patchTelemetry({ stormApproachVelocity: null });
		pushAlert('info', 'STRIKE LOG CLEARED');
	}

	// ---- radar canvas ----
	function drawRadar(ts) {
		if (!radar) return;
		const dpr = Math.min(2, window.devicePixelRatio || 1);
		const rect = radar.getBoundingClientRect();
		if (rect.width < 10) { rafId = requestAnimationFrame(drawRadar); return; }
		if (radar.width !== rect.width * dpr) { radar.width = rect.width * dpr; radar.height = rect.height * dpr; }
		const ctx = radar.getContext('2d');
		ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
		const W = rect.width;
		const H = rect.height;
		const cx = W / 2;
		const cy = H / 2;
		const R = Math.min(W, H) / 2 - 18;
		ctx.clearRect(0, 0, W, H);

		// backplate
		const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, R);
		g.addColorStop(0, 'rgba(34,211,238,0.10)');
		g.addColorStop(0.6, 'rgba(139,92,246,0.05)');
		g.addColorStop(1, 'rgba(4,7,16,0.0)');
		ctx.fillStyle = g;
		ctx.beginPath();
		ctx.arc(cx, cy, R, 0, Math.PI * 2);
		ctx.fill();

		// rings
		ctx.strokeStyle = 'rgba(148,178,255,0.18)';
		ctx.lineWidth = 1;
		for (const km of [1, 5, 10, 20]) {
			const rr = (km / 20) * R;
			ctx.beginPath();
			ctx.arc(cx, cy, rr, 0, Math.PI * 2);
			ctx.stroke();
			ctx.fillStyle = 'rgba(148,178,255,0.55)';
			ctx.font = '600 10px ui-monospace, monospace';
			ctx.fillText(`${km} km`, cx + rr + 3, cy + 3);
		}
		// crosshair
		ctx.strokeStyle = 'rgba(148,178,255,0.12)';
		ctx.beginPath();
		ctx.moveTo(cx, cy - R); ctx.lineTo(cx, cy + R);
		ctx.moveTo(cx - R, cy); ctx.lineTo(cx + R, cy);
		ctx.stroke();
		// bearing ticks
		ctx.fillStyle = 'rgba(148,178,255,0.65)';
		ctx.font = '600 10px ui-monospace, monospace';
		ctx.fillText('N', cx - 3, cy - R + 12);
		ctx.fillText('S', cx - 3, cy + R - 4);
		ctx.fillText('E', cx + R - 10, cy + 4);
		ctx.fillText('W', cx - R + 2, cy + 4);

		// scanning sweep
		const sweepAngle = (ts / 1400) % (Math.PI * 2);
		const sweep = ctx.createConicGradient ? ctx.createConicGradient(sweepAngle, cx, cy) : null;
		if (sweep) {
			sweep.addColorStop(0, 'rgba(34,211,238,0.30)');
			sweep.addColorStop(0.55, 'rgba(34,211,238,0.02)');
			sweep.addColorStop(1, 'rgba(34,211,238,0)');
			ctx.fillStyle = sweep;
			ctx.beginPath();
			ctx.moveTo(cx, cy);
			ctx.arc(cx, cy, R, sweepAngle - 0.5, sweepAngle);
			ctx.closePath();
			ctx.fill();
		}

		// strikes
		for (const s of strikeLog) {
			const age = (Date.now() - s.ts) / 1000;
			const maxAge = 22;
			if (age > maxAge) continue;
			const r = (s.distanceKm / 20) * R;
			// stable angle from distance so it doesn't jump
			const ang = (s.distanceKm * 1.37 + 0.5) % (Math.PI * 2);
			const x = cx + Math.cos(ang) * r;
			const y = cy + Math.sin(ang) * r;
			// shockwave ring
			const ringT = (age * 0.9) % 1.6;
			const ringR = (ringT / 1.6) * 46;
			const ringAlpha = Math.max(0, 1 - ringT / 1.6) * 0.9;
			ctx.strokeStyle = `rgba(239,68,68,${ringAlpha})`;
			ctx.lineWidth = 2;
			ctx.beginPath();
			ctx.arc(x, y, 8 + ringR, 0, Math.PI * 2);
			ctx.stroke();
			// blip
			const glow = ctx.createRadialGradient(x, y, 0, x, y, 11);
			glow.addColorStop(0, 'rgba(239,68,68,0.95)');
			glow.addColorStop(1, 'rgba(239,68,68,0)');
			ctx.fillStyle = glow;
			ctx.beginPath();
			ctx.arc(x, y, 11, 0, Math.PI * 2);
			ctx.fill();
			ctx.fillStyle = '#fecaca';
			ctx.beginPath();
			ctx.arc(x, y, 3, 0, Math.PI * 2);
			ctx.fill();
			// distance label
			ctx.fillStyle = 'rgba(254,202,202,0.9)';
			ctx.font = '600 10px ui-monospace, monospace';
			ctx.fillText(`${s.distanceKm.toFixed(1)} km`, x + 8, y - 8);
		}

		// center marker (you)
		const pulse = 1 + Math.sin(ts / 400) * 0.18;
		ctx.fillStyle = '#0f172a';
		ctx.strokeStyle = '#22d3ee';
		ctx.lineWidth = 2;
		ctx.beginPath();
		ctx.arc(cx, cy, 6 * pulse, 0, Math.PI * 2);
		ctx.fill();
		ctx.stroke();

		rafId = requestAnimationFrame(drawRadar);
	}

	onMount(() => {
		rafId = requestAnimationFrame(drawRadar);
	});

	onDestroy(() => {
		cancelAnimationFrame(rafId);
		if (camera) { try { camera.stop?.(); } catch { /* noop */ } }
		if (mic) { try { stopMic(mic); } catch { /* noop */ } }
		if (sim) { try { sim.stop(); } catch { /* noop */ } }
		spbListenerStop = true;
	});

	const currentApproach = $derived($telemetry.stormApproachVelocity ?? null);

	function openForensics(item) {
		forensicsItem.set({
			type: 'lightning',
			title: item.label,
			ts: item.ts,
			summary: `${item.distanceKm.toFixed(1)} km — ${item.source}`,
			payload: item,
			sourceFiles: ['api/atmos_physics.py', 'python_meteorology/barometric_cyclogenesis.py', 'src/lib/engines/meteoEngine.js']
		});
		modal.set('forensics');
	}
</script>

<div class="module lightning-module">
	<div class="two-col">
		<Card kicker="02 · Lightning & Thunder" title="Polar Range Ring Radar" class="radar-card">
			<div class="radar-wrap">
				<canvas bind:this={radar} class="radar"></canvas>
			</div>
			<div class="radar-footer">
				<Chip tone={currentApproach && currentApproach > 20 ? 'danger' : 'accent'}>
					<Icon name="bolt2" size={13} />
					{currentApproach != null ? `APPROACH ${currentApproach.toFixed(1)} KM/H` : 'NO CELL TRACKED'}
				</Chip>
				<Chip tone="accent"><span class="mono">{mode === 'flashing' ? 'FLASH AWAITED' : 'READY'}</span></Chip>
			</div>
		</Card>

		<Card kicker="Mode A" title="Flash-to-Bang & Radar">
			<p class="hint">Tap <strong>FLASH</strong> when you see lightning, then <strong>THUNDER</strong> when you hear it. Or auto-detect with the camera.</p>
			<div class="btns-row">
				<button class="btn btn-primary" onclick={flash} disabled={mode === 'flashing'}>
					<Icon name="flash" size={15} fill /> Flash
				</button>
				<button class="btn btn-danger" onclick={thunder} disabled={mode !== 'flashing'}>
					<Icon name="mic" size={15} /> Thunder
				</button>
				<button class="btn" onclick={startFlashCamera}>
					<Icon name="camera" size={15} /> {cameraOn ? 'Stop Camera' : 'Auto Flash Detect'}
				</button>
			</div>

			{#if mode === 'flashing'}
				<p class="flash-note blink mono">FLASH REGISTERED — AWAITING THUNDER…</p>
			{/if}

			<div class="mode-note mono" style="margin-top:0.6rem;">v<sub>sound</sub> = {soundMs().toFixed(1)} m/s @ {tempC.toFixed(1)}°C</div>
		</Card>

		<Card kicker="Mode B" title="Brontophonic Spectral Ranging">
			<p class="hint">
				Only hearing thunder? The DSP measures the spectral roll-off between
				<strong>&lt;100 Hz rumble</strong> and the >400 Hz attenuation edge.
				<Chip tone="accent">{$role === 'pro' || $role === 'admin' ? 'PRO' : 'STANDARD · read-only'}</Chip>
			</p>

			{#if $role === 'standard'}
				<div class="lock-note">Brontophonic analysis is unlocked at Pro tier (Storm Spotter & Mariner Pro).</div>
			{:else}
				<div class="btns-row">
					<button class="btn" onclick={startSpectral}>
						<Icon name="mic" size={15} /> {mode === 'spectralArmed' ? 'Disarm Spectral' : 'Arm Spectral Ranging'}
					</button>
				</div>
				{#if spectralDist}
					<div class="kvs">
						<div><span class="k">Distance estimate</span><span class="mono">{spectralDist.toFixed(1)} km</span></div>
						<div><span class="k">Spectral roll-off</span><span class="mono">{spectralRolloff} Hz</span></div>
					</div>
				{/if}
			{/if}
			{#if micError}<div class="inline-warn"><Icon name="close" size={13} /> {micError}</div>{/if}
		</Card>

		<Card kicker="Simulators" title="Synthesized Thunder Acoustics">
			<div class="sim-grid">
				{#each THUNDER_PRESETS_LIST as t (t.id)}
					<button class="preset-btn" onclick={() => startThunderSim(t.id)} type="button">
						<span class="preset-name">{t.label}</span>
						<span class="preset-speed mono">{t.multi ? `${t.multi[0]} → ${t.multi[2]} km` : `${t.targetKm.toFixed(1)} km`}</span>
					</button>
				{/each}
			</div>
		</Card>
	</div>

	<Card kicker="Strike Log" title="Consecutive Strike Tracker">
		{#snippet actions()}<button class="btn btn-quiet" onclick={clearLog}><Icon name="trash" size={13} /> Clear</button>{/snippet}

		{#if strikeLog.length === 0}
			<p class="hint">No strikes logged yet. Record a flash/bang, tap a thunder simulator, or arm spectral ranging.</p>
		{:else}
			<div class="strike-list">
				{#each strikeLog as s (s.id)}
					<button class="strike-row" onclick={() => openForensics(s)} type="button">
						<span class="strike-dot" class:danger={s.distanceKm < 5}></span>
						<span class="strike-main">
							<span class="strike-label">{s.label}</span>
							<span class="strike-sub mono">{s.source}{s.rolloffHz ? ` · roll-off ${s.rolloffHz} Hz` : ''}{s.idx != null ? ` · strike ${s.idx + 1}` : ''}</span>
						</span>
						<span class="strike-km mono">{s.distanceKm.toFixed(1)} km</span>
						<Icon name="chevron" size={14} />
					</button>
				{/each}
			</div>
		{/if}
	</Card>
</div>

<style>
	.lightning-module { display: grid; gap: 1rem; }
	.two-col {
		display: grid;
		grid-template-columns: 380px 1fr;
		gap: 1rem;
		align-items: start;
	}
	.radar-card { padding: 1rem; }
	.radar-wrap {
		position: relative;
		width: 100%;
		aspect-ratio: 1 / 1;
		max-width: 380px;
		margin: 0 auto;
	}
	.radar {
		width: 100%;
		height: 100%;
		border-radius: 16px;
		border: 1px solid var(--border);
		background: radial-gradient(120% 95% at 50% 10%, rgba(13, 20, 38, 0.92), rgba(5, 8, 16, 0.95));
		display: block;
	}
	.radar-footer {
		display: flex;
		gap: 0.4rem;
		justify-content: center;
		margin-top: 0.6rem;
		flex-wrap: wrap;
	}
	.hint { font-size: 0.76rem; color: var(--muted); line-height: 1.5; }
	.btns-row { display: flex; gap: 0.4rem; flex-wrap: wrap; margin: 0.5rem 0; }
	.flash-note {
		color: var(--warn);
		font-size: 0.7rem;
		letter-spacing: 0.12em;
		margin: 0.3rem 0;
	}
	.mode-note { font-size: 0.7rem; color: var(--muted); }
	.mode-note sub { font-size: 0.55rem; }
	.kvs { display: flex; flex-direction: column; gap: 0.35rem; margin-top: 0.45rem; }
	.kvs div {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
		padding: 0.35rem 0.1rem;
		border-top: 1px dashed var(--border);
		font-size: 0.74rem;
	}
	.kvs .k { color: var(--muted); letter-spacing: 0.12em; text-transform: uppercase; font-size: 0.6rem; }
	.lock-note {
		font-size: 0.78rem;
		color: var(--muted);
		border: 1px dashed var(--border);
		border-radius: 12px;
		padding: 0.7rem 0.8rem;
		margin-top: 0.4rem;
	}
	.sim-grid {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 0.45rem;
	}
	.preset-btn {
		display: flex;
		flex-direction: column;
		gap: 0.15rem;
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
	.preset-name { font-size: 0.78rem; font-weight: 700; line-height: 1.25; }
	.preset-speed { font-size: 0.68rem; color: var(--accent); }
	.strike-list { display: flex; flex-direction: column; }
	.strike-row {
		display: flex;
		align-items: center;
		gap: 0.7rem;
		padding: 0.6rem 0.5rem;
		border: 0;
		border-bottom: 1px solid var(--border);
		background: transparent;
		color: var(--text);
		text-align: left;
		cursor: pointer;
		font-family: inherit;
		border-radius: 12px;
		transition: background 0.2s ease, transform 0.16s ease;
	}
	.strike-row:hover { background: rgba(34, 211, 238, 0.06); transform: scale(1.01); }
	.strike-row:last-child { border-bottom: 0; }
	.strike-dot {
		width: 12px;
		height: 12px;
		border-radius: 50%;
		background: #f59e0b;
		box-shadow: 0 0 12px rgba(245, 158, 11, 0.6);
		flex-shrink: 0;
	}
	.strike-dot.danger { background: #ef4444; box-shadow: 0 0 12px rgba(239, 68, 68, 0.75); }
	.strike-main { display: flex; flex-direction: column; gap: 0.1rem; min-width: 0; flex: 1; }
	.strike-label { font-size: 0.82rem; font-weight: 700; }
	.strike-sub { font-size: 0.64rem; color: var(--muted); }
	.strike-km { font-size: 1.05rem; font-weight: 800; color: var(--accent); }
	.inline-warn { display: flex; align-items: center; gap: 0.4rem; color: var(--warn); font-size: 0.74rem; margin-top: 0.5rem; }
	@media (max-width: 980px) {
		.two-col { grid-template-columns: 1fr; }
	}
</style>
