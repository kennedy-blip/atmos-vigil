<script>
	import { telemetry, patchTelemetry } from '../../stores.js';
	import {
		stullWetBulbC,
		computeWbgt,
		wbgtFlag,
		hydrationMlPerHr,
		osczevskiWindChillC,
		frostbiteMinutes,
		KMH_PER_MPH,
		KNOTS_PER_MPH,
		FT_PER_M,
		M_PER_MPH
	} from '../../engines/meteoEngine.js';
	import Icon from '../Icon.svelte';
	import Card from '../Card.svelte';
	import Stat from '../Stat.svelte';
	import Slider from '../Slider.svelte';
	import Chip from '../Chip.svelte';

	let tempC = $state(26);
	let rh = $state(55);
	let solarClear = $state(true);
	let autoWind = $state(true);
	let windManual = $state(8);
	let dewPointC = $state(16);

	let windMph = $derived(autoWind ? ($telemetry.windMph ?? 0) : windManual);

	let wetBulb = $derived(stullWetBulbC(tempC, rh));
	let wbgt = $derived(computeWbgt(tempC, rh, windMph, solarClear));
	let flag = $derived(wbgtFlag(wbgt.wbgt));
	let wcm = $derived(osczevskiWindChillC(tempC, windMph));
	let frostbite = $derived(frostbiteMinutes(wcm));
	let hydration = $derived(hydrationMlPerHr(wbgt.wbgt));
	let hydrationOz = $derived(hydration / 29.5735);
	let workRest = $derived(flag.work_rest);

		const onTemp = (v) => { tempC = v; patchTelemetry({ temperatureC: v }); };
	const onRh = (v) => { rh = v; patchTelemetry({ humidity: v }); };
	const onWind = (v) => { windManual = v; };
	const onDew = (v) => { dewPointC = v; };
	const toggleSolar = () => { solarClear = !solarClear; };
	const toggleAutoWind = () => { autoWind = !autoWind; };
</script>

<div class="module wbgt-module">
	<div class="two-col">
		<Card kicker="04 · Wet-Bulb Survival" title="Psychrometric Heatstroke & Frostbite Shield" class="hero">
			<div class="controls-grid">
				<Slider label="Ambient Air Temp" value={tempC} min={-20} max={50} step={0.5} unit="°C" onchange={onTemp} />
				<Slider label="Relative Humidity" value={rh} min={5} max={100} step={1} unit=" %RH" onchange={onRh} />
				<div class="sun-toggle">
					<button class="btn" class:active={solarClear} onclick={toggleSolar} type="button">
						<Icon name="sun" size={14} /> Clear Sun
					</button>
					<button class="btn" class:active={!solarClear} onclick={toggleSolar} type="button">
						<Icon name="drop" size={14} /> Cloudy / Shade
					</button>
				</div>
				<div class="wind-link">
					<div class="wind-row">
						<span class="eyebrow">Wind Speed</span>
						<Chip tone={autoWind ? 'accent' : 'warn'}>{autoWind ? 'AUTO · MODULE 01' : 'MANUAL'}</Chip>
					</div>
					<div class="wind-num mono">{windMph.toFixed(1)} mph · {(windMph * KNOTS_PER_MPH).toFixed(1)} kn · {(windMph * KMH_PER_MPH).toFixed(1)} km/h</div>
					<button class="btn btn-quiet" onclick={toggleAutoWind} type="button">
						<Icon name="sync" size={13} /> {autoWind ? 'Release Auto-Link' : 'Auto-Link to Wind Lab'}
					</button>
					{#if !autoWind}
						<Slider label="Manual Wind" value={windManual} min={0} max={80} step={0.5} unit=" mph" onchange={onWind} />
					{/if}
				</div>
			</div>
		</Card>

		<div class="right-stack">
			<Card kicker="ISO 7243 WBGT" title="Heat Hazard Flag" class="flag-card">
				<div class="flag-band" style="background:{flag.color}">
					<div class="flag-word" style="color:{flag.id === 'white' ? '#1f2937' : '#ffffff'}">{flag.label.toUpperCase()}</div>
					<div class="flag-sub" style="color:{flag.id === 'white' ? '#4b5563' : 'rgba(255,255,255,0.8)'}">{flag.work_rest}</div>
				</div>
				<div class="wbgt-readout">
					<div class="wbgt-num display-num">{wbgt.wbgt.toFixed(1)}</div>
					<div class="wbgt-unit">°C WBGT · Globe {wbgt.globe.toFixed(1)}°C</div>
				</div>
				<div class="kvs">
					<div><span class="k">Wet-bulb (Stull)</span><span class="mono">{wetBulb.toFixed(1)} °C</span></div>
					<div><span class="k">Dry-bulb</span><span class="mono">{tempC.toFixed(1)} °C</span></div>
					<div><span class="k">Source</span><span class="mono">{solarClear ? 'Clear sun' : 'Shade / cloudy'}</span></div>
				</div>
			</Card>

			<Card kicker="Hydration" title="Water & Electrolytes">
				<div class="hydration-row">
					<Stat label="Required Intake" value={hydration} unit="ml/hr" tone="accent" />
					<Stat label="Imperial" value={Math.round(hydrationOz)} unit="oz/hr" tone="warn" />
				</div>
				<p class="hint">Balanced electrolytes; add ~4% extra for every 10°C above 32°C WBGT.</p>
			</Card>

			<Card kicker="Osczevski" title="Wind-Chill Frostbite Timer">
				<div class="frost-row">
					<Stat label="Wind-Chill Equiv." value={wcm.toFixed(1)} unit="°C" tone={wcm < -20 ? 'danger' : wcm < 5 ? 'warn' : 'accent'} />
				</div>
				<div class="frost-msg" class:danger={frostbite !== null}>
					{#if frostbite !== null}
						<span class="mono big-frost">{frostbite}</span>
						<span class="frost-unit">min to exposed-skin frostbite</span>
					{:else}
						<span class="frost-safe">No frostbite-risk wind chill</span>
					{/if}
				</div>
				<p class="hint">Osczevski & Bluestein equivalent temperature · table: 5 min @ ≤−46°C · 30 min @ ≤−32°C · 120 min @ ≤−18°C.</p>
			</Card>
		</div>
	</div>

	<Card kicker="Dew / Fog Countdown" title="Formation Forecast">
		<div class="dew-grid">
			<div>
				<Slider label="Dew Point" value={dewPointC} min={-20} max={40} step={0.5} unit="°C" onchange={onDew} />
			</div>
			<div class="dew-read">
				{#if dewPointC < tempC}
					<div class="mono dew-num">{Math.round((tempC - dewPointC) / 1.2 * 60)} min</div>
					<div class="dew-unit">until saturated at current rate · spread {(tempC - dewPointC).toFixed(1)}°C</div>
				{:else}
					<div class="mono dew-num">0 min</div>
					<div class="dew-unit">saturated — fog / dew forming now</div>
				{/if}
			</div>
		</div>
	</Card>
</div>

<style>
	.wbgt-module { display: grid; gap: 1rem; }
	.two-col {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 1rem;
		align-items: start;
	}
	.hero { padding: 1.1rem; }
	.controls-grid { display: flex; flex-direction: column; gap: 0.85rem; }
	.sun-toggle { display: flex; gap: 0.4rem; flex-wrap: wrap; }
	.sun-toggle .btn.active {
		border-color: var(--accent);
		color: var(--accent);
		box-shadow: var(--glow-cyan);
	}
	.wind-link {
		border: 1px dashed var(--border);
		border-radius: 14px;
		padding: 0.7rem 0.8rem;
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
	}
	.wind-row { display: flex; justify-content: space-between; align-items: center; }
	.wind-num { font-size: 0.9rem; color: var(--accent); }
	.right-stack { display: flex; flex-direction: column; gap: 1rem; }
	.flag-card { padding: 0.85rem; }
	.flag-band {
		border-radius: 18px;
		padding: 0.85rem 1rem;
		display: flex;
		flex-direction: column;
		justify-content: center;
		gap: 0.1rem;
		transition: background 0.3s ease;
	}
	.flag-word {
		font-size: 1.7rem;
		font-weight: 900;
		letter-spacing: 0.34em;
	}
	.flag-sub {
		font-size: 0.7rem;
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}
	.wbgt-readout {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.1rem;
		padding: 0.7rem 0 0.4rem;
	}
	.wbgt-num {
		font-size: 3.6rem;
		color: #fff;
		text-shadow: 0 0 26px rgba(34, 211, 238, 0.35);
	}
	.wbgt-unit {
		font-size: 0.64rem;
		letter-spacing: 0.22em;
		text-transform: uppercase;
		color: var(--muted);
	}
	.kvs { display: flex; flex-direction: column; margin-top: 0.3rem; }
	.kvs div {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
		padding: 0.35rem 0.1rem;
		border-top: 1px dashed var(--border);
		font-size: 0.8rem;
	}
	.kvs .k { color: var(--muted); letter-spacing: 0.1em; text-transform: uppercase; font-size: 0.6rem; }
	.hydration-row { display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem; }
	.hint { font-size: 0.72rem; color: var(--muted); margin: 0.4rem 0 0; line-height: 1.45; }
	.frost-row { padding: 0.3rem 0 0.2rem; }
	.frost-msg {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.55rem;
		padding: 0.7rem 0;
	}
	.frost-msg.danger {
		background: rgba(239, 68, 68, 0.12);
		border-radius: 14px;
	}
	.big-frost {
		font-size: 2.6rem;
		color: var(--danger);
		text-shadow: 0 0 20px rgba(239, 68, 68, 0.4);
	}
	.frost-unit { font-size: 0.64rem; color: var(--muted); letter-spacing: 0.1em; text-transform: uppercase; }
	.frost-safe { color: var(--ok); font-size: 0.85rem; }
	.dew-grid {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 1rem;
		align-items: center;
	}
	.dew-read { text-align: center; display: flex; flex-direction: column; gap: 0.2rem; }
	.dew-num { font-size: 2.2rem; color: var(--accent); }
	.dew-unit { font-size: 0.68rem; letter-spacing: 0.12em; text-transform: uppercase; color: var(--muted); }
	@media (max-width: 980px) {
		.two-col { grid-template-columns: 1fr; }
		.dew-grid { grid-template-columns: 1fr; }
	}
</style>
