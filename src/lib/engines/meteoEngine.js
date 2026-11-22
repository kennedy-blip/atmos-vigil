// ATMOS-VIGIL — physics & aeroacoustic DSP core (pure JavaScript, zero TypeScript).
// Browser-side mirror of python_meteorology/stull_wetbulb_wbgt.py,
// python_meteorology/barometric_cyclogenesis.py and api/atmos_physics.py.
// Keep values in sync with the Python implementations.
// ---------- units & base constants ----------
export const M_PER_MPH = 0.44704;
export const KMH_PER_MPH = 1.609344;
export const KNOTS_PER_MPH = 0.868976;
export const FT_PER_M = 3.28084;
export const PA_PER_MPH_SQUARED = 0.5 * 1.225 * (M_PER_MPH * M_PER_MPH); // rho=1.225 kg/m^3
export const RHO = 1.225;
export const SOUND_C0 = 331.3; // m/s at 0 °C
export const SOUND_DEGREE = 0.606; // m/s / °C

// ---------- wind: Beaufort scale & dynamic pressure ----------
const BEAUFORT_LIMITS_MPH = [
	{ force: 0, mph: 1.0, name: 'Calm' },
	{ force: 1, mph: 3.0, name: 'Light Air' },
	{ force: 2, mph: 7.0, name: 'Light Breeze' },
	{ force: 3, mph: 12.0, name: 'Gentle Breeze' },
	{ force: 4, mph: 18.0, name: 'Moderate Breeze' },
	{ force: 5, mph: 24.0, name: 'Fresh Breeze' },
	{ force: 6, mph: 32.0, name: 'Strong Breeze' },
	{ force: 7, mph: 39.0, name: 'Near Gale' },
	{ force: 8, mph: 47.0, name: 'Gale' },
	{ force: 9, mph: 55.0, name: 'Strong Gale' },
	{ force: 10, mph: 64.0, name: 'Whole Gale' },
	{ force: 11, mph: 75.0, name: 'Storm' },
	{ force: 12, mph: Infinity, name: 'Hurricane' }
];

export function beaufortFor(mph) {
	for (const b of BEAUFORT_LIMITS_MPH) {
		if (mph < b.mph) return { force: b.force, name: b.name };
	}
	return { force: 12, name: 'Hurricane' };
}

export function dynamicPressurePa(mph) {
	const v = mph * M_PER_MPH;
	return 0.5 * RHO * v * v;
}

export function lbft2(pa) {
	return pa / 47.88026; // 1 Pa = 0.020885 lb/ft^2
}

export function windForceN(mph, areaM2) {
	return dynamicPressurePa(mph) * areaM2;
}

export function lbsOfForce(newtons) {
	return newtons * 0.224808943;
}

// ---------- aeroacoustic DSP ----------
// Wind turbulence: RMS of 20–250 Hz sub-bass energy → wind speed via cube-root law.
// v ∝ RMS^(1/3) — derived from the cube-root pressure law in the master prompt.
export function windSpeedFromRms(rms, sensitivity = 1.0) {
	if (!Number.isFinite(rms) || rms <= 0) return 0;
	const mph = 82 * Math.pow(Math.max(0, Math.min(1, rms)), 1 / 3);
	return Math.max(0, Math.min(100, mph * sensitivity));
}

// Spectral band RMS: average magnitude of bins covering [lo, hi] over `analyser`.
export function spectralRms(analyser, loHz = 20, hiHz = 250, magnitudeBuf = null) {
	const fftSize = analyser.fftSize || 2048;
	const sampleRate = analyser.context?.sampleRate ?? 48000;
	const binHz = sampleRate / fftSize;
	const loBin = Math.max(0, Math.floor(loHz / binHz));
	const hiBin = Math.min(fftSize / 2 - 1, Math.ceil(hiHz / binHz));
	const buf = magnitudeBuf || new Float32Array(fftSize / 2);
	if (!analyser.getFloatFrequencyData) return 0;
	analyser.getFloatFrequencyData(buf);
	let sum = 0;
	let n = 0;
	for (let i = loBin; i <= hiBin; i++) {
		const linear = Math.pow(10, buf[i] / 20); // dB → linear amplitude
		sum += linear * linear;
		n += 1;
	}
	return n > 0 ? Math.sqrt(sum / n) : 0;
}

// ---------- lightning ----------
// Sound speed temperature compensation (m/s).
export function soundSpeed(tempC) {
	return SOUND_C0 + SOUND_DEGREE * tempC;
}

export function strikeDistanceKm(deltaSeconds, tempC) {
	return (soundSpeed(tempC) * deltaSeconds) / 1000;
}

// Spectral roll-off estimate (Mode B): proportion of energy above 400 Hz vs. total.
export function spectralRollOffEstimate(magnitudeBuf = null, analyser = null, tempC = 22) {
	// fallback placeholder if no analyser — used only by UI callers in tests
	void tempC;
	if (!analyser) {
		return { distanceKm: 0, rolloffHz: 0, highFraction: 0 };
	}
	const fftSize = analyser.fftSize || 2048;
	const sampleRate = analyser.context?.sampleRate ?? 48000;
	const binHz = sampleRate / fftSize;
	const buf = magnitudeBuf || new Float32Array(fftSize / 2);
	analyser.getFloatFrequencyData(buf);
	let low = 0; // 40–120 Hz
	let high = 0; // 120+ Hz
	let maxMag = 0;
	let total = 0;
	const mags = [];
	for (let i = 0; i < buf.length; i++) {
		const lin = Math.pow(10, buf[i] / 20);
		mags.push(lin);
		const f = i * binHz;
		if (f < 40 || f > 2000) continue;
		total += lin;
		if (f <= 120) low += lin;
		else high += lin;
		if (lin > maxMag) maxMag = lin;
	}
	const highFraction = total > 0 ? high / total : 0;
	// Find spectral roll-off frequency: first bin above 200 Hz whose magnitude
	// stays below 40% of its 40–120 Hz reference window.
	const refLow = 0.5 * low / Math.max(1, (120 / binHz - 40 / binHz));
	let rolloffHz = 2000;
	for (let i = 0; i < mags.length; i++) {
		const f = i * binHz;
		if (f < 200) continue;
		if (mags[i] < (refLow || 0.05)) {
			rolloffHz = f;
			break;
		}
	}
	// Distance model: higher roll-off ⇒ closer strike (more high-freq energy survives).
	const distanceKm = Math.max(0.2, Math.min(20, (20 * 40) / Math.max(45, rolloffHz)));
	return {
		distanceKm: Math.round(distanceKm * 10) / 10,
		rolloffHz: Math.round(rolloffHz),
		highFraction: Math.round(highFraction * 1000) / 1000
	};
}

// ---------- barometric ----------
export const SYNOPTIC_PRESETS = [
	{ id: 'ridge', label: 'Stable High-Pressure Ridge', pressure: 1024.2, ten3h: 0.2, detail: 'Excellent flying weather · sinking air' },
	{ id: 'front', label: 'Approaching Cold-Front Squall', pressure: 1006.1, ten3h: -3.8, detail: 'Rapid descent · gust front likely' },
	{ id: 'bombogenesis', label: 'Explosive Bombogenesis Cyclone', pressure: 978.4, ten3h: -8.5, detail: '≥24 hPa/24h with P≤1000 hPa · K-B criteria' },
	{ id: 'microburst', label: 'Thunderstorm Microburst Downdraft', pressure: 1010.8, ten3h: -6.2, detail: 'Severe downdraft pulse · hail & 80 mph gusts' },
	{ id: 'ascent', label: 'High-Altitude Mountain Ascent', pressure: 718.6, ten3h: 0.1, detail: '2,800 m · thin-air survival' }
];

export function classifyTendency(ten3h, pressure) {
	if (ten3h <= -8) return { level: 'critical', tag: 'BOM-CYCLOGENESIS / INSTABILITY', color: 'danger' };
	if (ten3h <= -4) return { level: 'severe', tag: 'MICROBURST / GALE-FORCE FRONT', color: 'danger' };
	if (ten3h <= -2) return { level: 'warn', tag: 'FRONT APPROACHING', color: 'warn' };
	if (ten3h <= 0) return { level: 'watch', tag: 'FALLING · MONITOR', color: 'warn' };
	return { level: 'stable', tag: 'HIGH-PRESSURE RIDGE', color: 'ok' };
}

// Barometric height estimate (hPa → altitude above sea-level in meters, ISA).
export function altitudeFromPressure(hpa, seaLevelHpa = 1013.25) {
	const scale = (hpa / seaLevelHpa) ** (1 / 5.255); // psychrometric conversion
	return Math.round((1 - scale) * 44330);
}

// ---------- Stull wet-bulb / WBGT ----------
export function stullWetBulbC(tC, relHum) {
	const rh = Math.max(0.5, Math.min(100, relHum));
	const t = tC;
	const a1 = t * Math.atan(0.151977 * Math.sqrt(rh + 8.313659));
	const a2 = Math.atan(t + rh);
	const a3 = Math.atan(rh - 1.676331);
	const a4 = 0.00391838 * Math.pow(rh, 1.5) * Math.atan(0.023101 * rh);
	return a1 + a2 - a3 + a4 - 4.686035;
}

export function wetBulbDepression(tC, rh) {
	return tC - stullWetBulbC(tC, rh);
}

// ISO 7243 WBGT. Globe temperature: clear sun +8°C, shade +1°C vs dry bulb.
export function computeWbgt(tC, rh, windSpeedMph, solarClear = true) {
	const tdb = tC;
	const tw = stullWetBulbC(tdb, rh);
	const globeTg = tdb + (solarClear ? 8.0 : 1.0);
	let wbgt;
	if (solarClear) {
		wbgt = 0.7 * tw + 0.2 * globeTg + 0.1 * tdb;
	} else {
		wbgt = 0.7 * tw + 0.3 * tdb;
	}
	return { wbgt: Math.round(wbgt * 10) / 10, wetBulb: Math.round(tw * 10) / 10, globe: Math.round(globeTg * 10) / 10, dryBulb: tdb, windMph: windSpeedMph };
}

export const WBGT_FLAGS = [
	{ id: 'white', label: 'White', max: 20, workRest: 'Full work', color: '#e5e7eb' },
	{ id: 'green', label: 'Green', max: 25, workRest: 'Full work · normal caution', color: '#22c55e' },
	{ id: 'yellow', label: 'Yellow', max: 28, workRest: '30 min work : 15 min rest', color: '#eab308' },
	{ id: 'red', label: 'Red', max: 32, workRest: '15 min work : 45 min rest', color: '#f97316' },
	{ id: 'black', label: 'Black', max: Infinity, workRest: 'No exertion · seek shade', color: '#111111' }
];

export function wbgtFlag(wbgt) {
	for (const f of WBGT_FLAGS) {
		if (wbgt < f.max) return f;
	}
	return WBGT_FLAGS[WBGT_FLAGS.length - 1];
}

// Required hydration in mL/hr (rough guide): 0.6 L base, +55 mL/hr above 21°C WBGT.
export function hydrationMlPerHr(wbgt) {
	return Math.max(600, Math.min(2600, 600 + 55 * (wbgt - 21)));
}

// Osczevski–Gallagher wind-chill equivalent temperature (°C)
// T_wc = 13.12 + 0.6215×T − 11.37×V^0.16 + 0.3965×T×V^0.16
// Relative effective wind V = mph × (1 + (walkingSpeed_kmh)/km/h) adjusted at 5 ft vs 10 m.
export function osczevskiWindChillC(tC, windMph) {
	const vKmh = Math.max(0, windMph) * KMH_PER_MPH; // effective headwind at 5 ft
	const v = Math.max(0.4, vKmh); // never below ~0.4 km/h
	return 13.12 + 0.6215 * tC - 11.37 * Math.pow(v, 0.16) + 0.3965 * tC * Math.pow(v, 0.16);
}

// Frostbite time table (minutes) by wind-chill equivalent temperature (°C)
export const FROSTBITE_TABLE = [
	{ max: -46, min: 5 },
	{ max: -41, min: 10 },
	{ max: -37, min: 15 },
	{ max: -32, min: 30 },
	{ max: -27, min: 45 },
	{ max: -22, min: 60 },
	{ max: -18, min: 120 },
	{ max: -10, min: 180 }
];

export function frostbiteMinutes(wcC) {
	for (const r of FROSTBITE_TABLE) {
		if (wcC <= r.max) return r.min;
	}
	return null; // none — no frostbite risk
}

// ---------- Espy LCL & freezing level ----------
/**
 * Espy (1841) linear LCL approximation: z ≈ 125 m per °C of dew-point spread (T − Td).
 * Valid for typical convective parcels, ±1% accurate.
 */
export function cloudBaseM(tC, dewPointC) {
	const spread = Math.max(0, tC - dewPointC);
	return 125 * spread;
}

export function freezingLevelM(tC) {
	if (tC <= 0) return 0;
	const lapsePerM = 0.0065; // K/m (ISA)
	return Math.round(tC / lapsePerM);
}

// Cloud-base countdown: time until fog forms (assumes ~1°C drop per hour at ~100 m).
export function dewFormationCountdownMin(tC, dewPointC) {
	const spread = tC - dewPointC;
	if (spread <= 0) return 0;
	const rateKPerHr = 1.2; // simplified evening cool-down (°C/hr)
	return Math.round((spread / rateKPerHr) * 60);
}

// Espy convective CAPE (very simplified upper-bound estimate for UI gauges).
// Hyperbolic proxy on cloudBase & inversion strength → synthetic CAPE without a skew-T.
export function capeUpperBoundJ(tC, dewPointC, windMph) {
	const cloudBase = cloudBaseM(tC, dewPointC);
	if (cloudBase < 200) return Math.round(500 + windMph * 60);
	const h = Math.max(200, cloudBase * 0.5);
	const tParcel = tC - 0.0098 * h;
	const tEnv = tC - 0.0065 * h - 1.5 * Math.log10(1 + cloudBase / 1400);
	const denom = tParcel + 273.15;
	const cape = 1000 * (tParcel - tEnv) / denom * h / 1000; // ~J/kg scaled
	return Math.round(Math.max(0, cape * 9.8 * h / 100));
}

// ---------- storm cell velocity from strike log ----------
export function stormApproachVelocityKmh(strikes) {
	// miles: inputs formatted [[km, ts], ...]
	if (!strikes || strikes.length < 2) return null;
	const sorted = [...strikes].sort((a, b) => a.ts - b.ts);
	const first = sorted[0];
	const last = sorted[sorted.length - 1];
	const dtH = (last.ts - first.ts) / 3600000;
	const dd = first.km - last.km;
	if (dtH <= 0.001 || dd <= 0) return null;
	return Math.round((dd / dtH) * 10) / 10;
}
