<script>
	import { onDestroy, onMount } from 'svelte';
	import {
		SYNOPTIC_PRESETS,
		classifyTendency,
		altitudeFromPressure,
		cloudBaseM,
		freezingLevelM,
		dewFormationCountdownMin,
		capeUpperBoundJ,
		KMH_PER_MPH
	} from '../../engines/meteoEngine.js';
	import { telemetry, patchTelemetry, pushAlert, alerts, role } from '../../stores.js';
	import { spring } from 'svelte/motion';
	import Icon from '../Icon.svelte';
	import Card from '../Card.svelte';
	import Stat from '../Stat.svelte';
	import Slider from '../Slider.svelte';
	import Chip from '../Chip.svelte';

	// ---- state ----
	let presetIdx = $state(1); // cold-front squall default
	let pressure = $state(SYNOPTIC_PRESETS[presetIdx].pressure);
	let tendency = $state(SYNOPTIC_PRESETS[presetIdx].ten3h);
	let history = $state(generateHistory(SYNOPTIC_PRESETS[presetIdx]));
	let tempC = $state(22);
	let dewPointC = $state(14);
	let tickId = $state(0);
	let chartCanvas = $state(null);
	const needle = spring(0, { stiffness: 0.12, damping: 0.55 });
	const needleTarget = $derived(
		((pressure - 960) / (1040 - 960)) * 180 - 90
	);

	function generateHistory(preset) {
		const points = [];
		const now = Date.now();
		for (let i = 95; i >= 0; i--) {
			const t = new Date(now - i * (24 * 60 * 60 / 96 * 1000));
			const base = preset.pressure + (preset.ten3h / 8) * (i / 4.8) + Math.sin(i / 5.5) * 1.1;
			points.push({ ts: t.getTime(), hpa: Math.max(960, Math.min(1040, base)) });
		}
		return points;
	}

	function applyPreset(idx) {
		presetIdx = idx;
		const p = SYNOPTIC_PRESETS[idx];
		pressure = p.pressure;
		tendency = p.ten3h;
		history = generateHistory(p);
		// re-seed pressure into telemetry
		patchTelemetry({ pressureHpa: pressure, pressureInHg: pressure / 33.8639, pressureTendency3h: tendency, temperatureC: tempC });
		const cls = classifyTendency(tendency, pressure);
		if (cls.level === 'critical' || cls.level === 'severe') {
			pushAlert('critical', `${cls.tag} — ${pressure.toFixed(1)} hPa (${tendency > 0 ? '+' : ''}${tendency.toFixed(1)} hPa/3h)`);
			try { navigator.vibrate?.([80, 50, 80]); } catch { /* noop */ }
		} else if (cls.level === 'warn' || cls.level === 'watch') {
			pushAlert('warning', `${cls.tag} — ${pressure.toFixed(1)} hPa`);
		} else {
			pushAlert('ok', `${cls.tag} — ${pressure.toFixed(1)} hPa`);
		}
	}
	const classify = $derived(classifyTendency(tendency, pressure));
	const lcl = $derived(cloudBaseM(tempC, dewPointC));
	const freezing = $derived(freezingLevelM(tempC));
	const dewCount = $derived(dewFormationCountdownMin(tempC, dewPointC));
	const cape = $derived(capeUpperBoundJ(tempC, dewPointC, $telemetry.windMph ?? 10));

	function tick() {
		// drift toward tendency over a 15-second step (8 ticks = 2h ≈ 12h)
		pressure = Math.max(950, Math.min(1045, pressure + tendency / 1440 * 15));
		const now = Date.now();
		history = [...history.slice(-95), { ts: now, hpa: pressure }];
		patchTelemetry({ pressureHpa: pressure, pressureInHg: pressure / 33.8639, pressureTendency3h: tendency });
		drawChart();
	}

	function drawChart() {
		if (!chartCanvas) return;
		const dpr = Math.min(2, window.devicePixelRatio || 1);
		const rect = chartCanvas.getBoundingClientRect();
		if (rect.width < 10) return;
		chartCanvas.width = rect.width * dpr;
		chartCanvas.height = rect.height * dpr;
		const ctx = chartCanvas.getContext('2d');
		ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
		const W = rect.width;
		const H = rect.height;
		ctx.clearRect(0, 0, W, H);

		// grid 960..1040 hPa
		ctx.font = '600 9px ui-monospace, monospace';
		ctx.fillStyle = 'rgba(148,178,255,0.6)';
		ctx.strokeStyle = 'rgba(148,178,255,0.10)';
		ctx.lineWidth = 1;
		for (let hpa = 960; hpa <= 1040; hpa += 20) {
			const y = H - ((hpa - 960) / (1040 - 960)) * (H - 16) - 8;
			ctx.beginPath();
			ctx.moveTo(0, y);
			ctx.lineTo(W, y);
			ctx.stroke();
			ctx.fillText(`${hpa}`, 2, y - 2);
		}
		// line
		const pts = history.slice(-96);
		const step = W / (pts.length - 1 || 1);
		ctx.beginPath();
		pts.forEach((p, i) => {
			const x = i * step;
			const y = H - ((p.hpa - 960) / (1040 - 960)) * (H - 16) - 8;
			i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
		});
		ctx.strokeStyle = classify.level === 'critical' || classify.level === 'severe' ? '#ef4444' : classify.level === 'warn' || classify.level === 'watch' ? '#f59e0b' : '#22d3ee';
		ctx.lineWidth = 2.2;
		ctx.shadowColor = ctx.strokeStyle;
		ctx.shadowBlur = 10;
		ctx.stroke();
		ctx.shadowBlur = 0;

		// last point pulse
		if (pts.length >= 1) {
			const last = pts[pts.length - 1];
			const x = (pts.length - 1) * step;
			const y = H - ((last.hpa - 960) / (1040 - 960)) * (H - 16) - 8;
			ctx.fillStyle = '#22d3ee';
			ctx.beginPath();
			ctx.arc(x, y, 4, 0, Math.PI * 2);
			ctx.fill();
		}
	}

	onMount(() => {
		applyPreset(presetIdx);
		tickId = setInterval(tick, 15000);
		needle.target = needleTarget;
		drawChart();
		const r = () => drawChart();
		window.addEventListener('resize', r);
		return () => window.removeEventListener('resize', r);
	});

	$effect(() => { needle.target = needleTarget; });
	$effect(() => { patchTelemetry({ temperatureC: tempC }); });

	onDestroy(() => {
		clearInterval(tickId);
	});

	const setTemp = (v) => { tempC = v; patchTelemetry({ temperatureC: v }); };
	const setDew = (v) => { dewPointC = v; };
</script>

<div class="module baro-module">
	<div class="two-col">
		<Card kicker="03 · Barometric Microburst" title="24-Hour Digital Barograph" class="baro-gauge-card">
			<div class="baro-top">
				<div class="halo">
					<svg class="anem" viewBox="0 0 200 200" aria-label="Barometric arc">
						<defs>
							<linearGradient id="needleG" x1="0" y1="1" x2="1" y2="0">
								<stop offset="0" stop-color="#22d3ee" />
								<stop offset="1" stop-color="#8b5cf6" />
							</linearGradient>
						</defs>
						<path d="M30 170 A 80 80 0 0 1 170 170" fill="none" stroke="var(--border)" stroke-width="6" stroke-linecap="round" />
						<path d="M30 170 A 80 80 0 0 1 100 30" fill="none" stroke="rgba(239,68,68,0.45)" stroke-width="6" stroke-linecap="round" stroke-dasharray="6 10" />
						{#each [0, 25, 50, 75, 100] as t (t)}
							<text x={30 + 140 * (t / 100)} y={t < 100 ? 24 : 24} fill="rgba(148,178,255,0.55)" font-size="9" text-anchor="middle" font-family="ui-monospace, monospace">
								{960 + Math.round((t / 100) * 80)}
							</text>
						{/each}
						<g transform="rotate({$needle} 100 170)">
							<line x1="100" y1="170" x2="100" y2="56" stroke="url(#needleG)" stroke-width="4" stroke-linecap="round" />
							<circle cx="100" cy="170" r="7" fill="#04070f" stroke="#22d3ee" stroke-width="2" />
						</g>
					</svg>
				</div>
				<div class="baro-readout">
					<div class="big display-num">{pressure.toFixed(1)}</div>
					<div class="big-unit">hPa · {(pressure / 33.8639).toFixed(2)} inHg</div>
					<div class="tenden mono" class:neg={tendency < 0}>
						{tendency > 0 ? '+' : ''}{tendency.toFixed(1)} hPa / 3h
					</div>
					<div class="tag-chip {classify.color}">{classify.tag}</div>
				</div>
			</div>

			<div class="chart-wrap glass-raised">
				<canvas bind:this={chartCanvas}></canvas>
			</div>

			<div class="preset-grid">
				{#each SYNOPTIC_PRESETS as p (p.id)}
					<button
						class="preset-btn"
						class:active={presetIdx === SYNOPTIC_PRESETS.indexOf(p)}
						onclick={() => applyPreset(SYNOPTIC_PRESETS.indexOf(p))}
						type="button"
					>
						<span class="preset-name">{p.label}</span>
						<span class="preset-speed mono">{p.pressure.toFixed(1)} hPa · {p.ten3h > 0 ? '+' : ''}{p.ten3h.toFixed(1)} hPa/3h</span>
						<span class="preset-detail">{p.detail}</span>
					</button>
				{/each}
			</div>
		</Card>

		<div class="right-col">
			<Card kicker="Espy LCL" title="Cloud Base & Freezing Level">
				<Slider label="Ambient Temp" value={tempC} min={-30} max={45} step={0.5} unit="°C" onchange={setTemp} />
				<div style="height:0.7rem"></div>
				<Slider label="Dew Point" value={dewPointC} min={-30} max={40} step={0.5} unit="°C" onchange={setDew} />

				<div class="lcl-viz">
					<svg class="lcl-sky" viewBox="0 0 400 260" aria-label="Atmospheric cross-section">
						<defs>
							<linearGradient id="skyG" x1="0" y1="0" x2="0" y2="1">
								<stop offset="0" stop-color="#0a1226" />
								<stop offset="0.55" stop-color="#122244" />
								<stop offset="1" stop-color="#1f3554" />
							</linearGradient>
						</defs>
						<rect x="0" y="0" width="400" height="260" rx="18" fill="url(#skyG)" />
						<circle cx="330" cy="42" r="16" fill="#22d3ee" opacity="0.9" />
						<circle cx="330" cy="42" r="26" fill="none" stroke="#22d3ee" stroke-opacity="0.3" stroke-width="2" />
						<path d="M0 224 L400 224 L400 260 L0 260 Z" fill="#0b1526" />
						<text x="14" y="248" font-size="10" fill="rgba(148,178,255,0.6)" font-family="ui-monospace, monospace">SURFACE AGL 0 m</text>
						{#if lcl > 0}
							<g>
								<rect x="30" y={Math.max(40, 200 - lcl / 18)} width="340" height="36" rx="18" fill="rgba(148,178,255,0.16)" stroke="rgba(148,178,255,0.35)" stroke-width="1" />
								<ellipse cx="120" cy={Math.max(40, 200 - lcl / 18)} rx="34" ry="14" fill="rgba(226,232,240,0.35)" />
								<ellipse cx="200" cy={Math.max(40, 200 - lcl / 18) - 6} rx="40" ry="16" fill="rgba(226,232,240,0.3)" />
								<ellipse cx="280" cy={Math.max(40, 200 - lcl / 18) + 2} rx="34" ry="13" fill="rgba(226,232,240,0.32)" />
								<text x="20" y={Math.max(60, 100 - lcl / 60)} font-size="10" fill="#22d3ee" font-family="ui-monospace, monospace">LCL {lcl} m AGL</text>
							</g>
						{/if}
						{#if freezing > 0}
							<g>
								<line x1="10" y1={Math.max(28, 200 - freezing / 120)} x2="390" y2={Math.max(28, 200 - freezing / 120)} stroke="#93c5fd" stroke-width="1.2" stroke-dasharray="6 5" />
								<text x="16" y={Math.max(40, 158 - freezing / 120)} font-size="10" fill="#93c5fd" font-family="ui-monospace, monospace">0°c ISOTERM {freezing} m</text>
							</g>
						{/if}
					</svg>
				</div>

				<div class="kvs">
					<div><span class="k">Cloud base</span><span class="mono">{lcl} m AGL · {Math.round(lcl * 3.28084)} ft</span></div>
					<div><span class="k">Freezing level</span><span class="mono">{freezing} m · {Math.round(freezing * 3.28084)} ft</span></div>
					<div><span class="k">Dew-form countdown</span><span class="mono">{dewCount} min</span></div>
				</div>
			</Card>

			<Card kicker="Capability" title="Espy CAPE Estimator" class="cape-card">
				<div class="cape-chip-row">
					<Chip tone={$role === 'pro' || $role === 'admin' ? 'accent' : 'warn'}>{$role === 'pro' || $role === 'admin' ? 'PRO TIER' : 'PRO TIER'}</Chip>
				</div>
				{#if $role === 'standard'}
					<p class="hint">CAPE estimation unlocks at Storm Spotter & Mariner Pro tier.</p>
				{:else}
					<div class="cape-gauge">
						<div class="cape-num display-num">{cape}</div>
						<div class="cape-unit">J/kg upper-bound</div>
					</div>
					<p class="hint">Upper-bound CAPE from LCL depth & parcel/environment estimate — not a replacement for a full skew-T.</p>
				{/if}
			</Card>
		</div>
	</div>
</div>

<style>
	.baro-module { display: grid; gap: 1rem; }
	.two-col {
		display: grid;
		grid-template-columns: 1.15fr 1fr;
		gap: 1rem;
		align-items: start;
	}
	.baro-gauge-card { padding: 1rem; }
	.baro-top {
		display: grid;
		grid-template-columns: 190px 1fr;
		gap: 0.85rem;
		align-items: center;
	}
	.halo { display: grid; place-items: center; }
	.anem { width: 180px; height: 180px; overflow: visible; }
	.baro-readout { display: flex; flex-direction: column; gap: 0.35rem; }
	.big { font-size: clamp(2.4rem, 5vw, 3.2rem); color: #fff; text-shadow: 0 0 28px rgba(34, 211, 238, 0.35); }
	.big-unit { color: var(--muted); font-size: 0.68rem; letter-spacing: 0.16em; text-transform: uppercase; }
	.tenden { font-size: 0.95rem; color: var(--ok); margin-top: 0.2rem; }
	.tenden.neg { color: var(--danger); }
	.tag-chip {
		display: inline-flex;
		align-self: flex-start;
		margin-top: 0.35rem;
		padding: 0.35rem 0.75rem;
		border-radius: 999px;
		font-size: 0.66rem;
		font-weight: 800;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		border: 1px solid var(--border-bright);
	}
	.tag-chip.danger { color: #fecaca; border-color: rgba(239,68,68,0.55); box-shadow: 0 0 22px rgba(239,68,68,0.3); }
	.tag-chip.warn { color: #fcd34d; border-color: rgba(245,158,11,0.5); }
	.tag-chip.ok { color: #6ee7b7; border-color: rgba(16,185,129,0.45); }
	.chart-wrap { height: 130px; margin-top: 0.9rem; padding: 0.45rem; overflow: hidden; }
	.chart-wrap canvas { width: 100%; height: 100%; display: block; }
	.preset-grid {
		display: grid;
		grid-template-columns: repeat(2, 1fr);
		gap: 0.45rem;
		margin-top: 0.9rem;
	}
	.preset-btn {
		display: flex;
		flex-direction: column;
		gap: 0.14rem;
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
		background: linear-gradient(150deg, rgba(34, 211, 238, 0.14), rgba(139, 92, 246, 0.1));
	}
	.preset-name { font-size: 0.8rem; font-weight: 800; letter-spacing: 0.03em; }
	.preset-speed { font-size: 0.68rem; color: var(--accent); }
	.preset-detail { font-size: 0.66rem; color: var(--muted); line-height: 1.35; }
	.right-col { display: flex; flex-direction: column; gap: 1rem; }
	.lcl-viz { margin: 0.4rem 0 0.2rem; }
	.lcl-sky {
		width: 100%;
		height: auto;
		border: 1px solid var(--border);
		border-radius: 18px;
	}
	.kvs { display: flex; flex-direction: column; margin-top: 0.5rem; }
	.kvs div {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
		padding: 0.4rem 0.1rem;
		border-top: 1px dashed var(--border);
		font-size: 0.82rem;
	}
	.kvs .k { color: var(--muted); letter-spacing: 0.12em; text-transform: uppercase; font-size: 0.6rem; }
	.cape-gauge {
		display: flex;
		flex-direction: column;
		align-items: center;
		padding: 0.4rem 0;
	}
	.cape-num {
		font-size: 3rem;
		color: var(--accent);
		text-shadow: 0 0 24px rgba(34,211,238,0.3);
	}
	.cape-unit { color: var(--muted); font-size: 0.64rem; letter-spacing: 0.18em; text-transform: uppercase; }
	.hint { font-size: 0.74rem; color: var(--muted); line-height: 1.4; }
	@media (max-width: 980px) {
		.two-col { grid-template-columns: 1fr; }
		.baro-top { grid-template-columns: 1fr; text-align: center; justify-items: center; }
		.baro-readout { align-items: center; }
	}
</style>
