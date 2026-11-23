// Shared Svelte stores for ATMOS-VIGIL.
// State is plain JS — the whole app is 100% zero-TypeScript / JavaScript.
import { writable, derived } from 'svelte/store';

const DEFAULT_TELEMETRY = {
	windMph: 0,
	windMs: 0,
	beaufort: 0,
	dynamicPressurePa: 0,
	windSource: 'none', // 'mic' | 'simulator' | 'none'
	stormApproachVelocity: null, // km/h, from strike log
	pressureHpa: 1013.25,
	pressureInHg: 29.92,
	pressureTendency3h: 0, // hPa / 3h
	temperatureC: 22,
	humidity: 55,
	solarRadiation: true, // clear sun vs shade
	dewPointC: 14,
	wbgt: 25,
	wetBulbC: 16,
	windChillC: null,
	cloudBaseM: 1250,
	freezingLevelM: 3200
};

export const telemetry = writable({ ...DEFAULT_TELEMETRY });
export function setTelemetry(patch) {
	telemetry.update((s) => ({ ...s, ...patch }));
}
export function patchTelemetry(patch) {
	telemetry.update((s) => ({ ...s, ...patch }));
}

export const theme = writable('obsidian');
export const role = writable('standard'); // 'standard' | 'pro' | 'admin'
export const formFactorOverride = writable(null); // null = auto-detect, else 'desktop'|'mobile'
export const viewportWidth = writable(typeof window === 'undefined' ? 1280 : window.innerWidth);
export const formFactor = derived([formFactorOverride, viewportWidth], ([$override, $width]) => {
	if ($override) return $override;
	return $width < 820 ? 'mobile' : 'desktop';
}); // 'desktop' | 'mobile'
export const activeModule = writable('wind'); // wind | lightning | baro | wbgt | vault
export const modal = writable(null); // 'apk' | 'forensics' | 'apk-guide' | null
export const drawerOpen = writable(false);
export const forensicsItem = writable(null); // item opened in the Forensics modal

export const alerts = writable([]);
let alertCounter = 0;
export function pushAlert(severity, message, opts = {}) {
	alerts.update((arr) => {
		const id = ++alertCounter;
		const next = [{ id, severity, message, ts: Date.now(), ...opts }, ...arr];
		return next.slice(0, 24);
	});
}
export function clearAlerts() {
	alerts.set([]);
}

export const moduleList = [
	{ id: 'wind', label: 'Wind Lab', icon: 'wind' },
	{ id: 'lightning', label: 'Lightning', icon: 'lightning' },
	{ id: 'baro', label: 'Barometer', icon: 'baro' },
	{ id: 'wbgt', label: 'WBGT Shield', icon: 'shield' },
	{ id: 'vault', label: 'Vault', icon: 'vault' }
];

const STANDARD_UNLOCKS = ['windLab', 'lightningRadar', 'baroLab', 'wbgtShield'];
const PRO_UNLOCKS = ['windLoad', 'spectralLightning', 'lcl', 'cape'];
const ADMIN_UNLOCKS = ['inspector', 'export', 'sync'];

export const roles = [
	{ id: 'standard', label: 'Hiker, Boater & Homeowner', short: 'Standard', unlocks: STANDARD_UNLOCKS },
	{ id: 'pro', label: 'Storm Spotter & Mariner Pro', short: 'Pro', unlocks: [...STANDARD_UNLOCKS, ...PRO_UNLOCKS] },
	{ id: 'admin', label: 'Meteorological Command Admin', short: 'Admin', unlocks: [...STANDARD_UNLOCKS, ...PRO_UNLOCKS, ...ADMIN_UNLOCKS] }
];

export const themes = [
	{ id: 'obsidian', label: 'Supercell Obsidian', swatch: ['#040710', '#22d3ee', '#8b5cf6'] },
	{ id: 'frost', label: 'Alpine Summit Frost', swatch: ['#e8eef6', '#0e7490', '#059669'] },
	{ id: 'marine', label: 'Marine Bridge Red', swatch: ['#150407', '#ef4444', '#f97316'] },
	{ id: 'eco', label: 'Eco-Glass / Low-GPU', swatch: ['#0a0e18', '#2dd4bf', '#fbbf24'] }
];

export const TIER_RANK = { standard: 1, pro: 2, admin: 3 };

// ---- does this role unlock a capability? ----
export function roleCan(roleId, capability) {
	const r = roles.find((x) => x.id === roleId);
	if (!r) return false;
	return r.unlocks.includes(capability);
}

export const alertRing = derived(alerts, ($a) => $a.slice(0, 1)[0] ?? null);
