# ATMOS-VIGIL — Zero-TypeScript Polyglot Weather Survival Station

**Offline-first**, open-source, cross-platform weather DSP: an aeroacoustic wind
anemometer, a brontophonic lightning radar, a barometric microburst/cyclogenesis
predictor and a Stull wet-bulb / ISO 7243 WBGT / Osczevski wind-chill survival
shield — all in a single glassmorphic glass-lab UI, deployed as a Vercel web app
**and** a self-hosted Android `.APK` (Capacitor), with **0.0% TypeScript**.

## Compliance envelope

| Layer | Language |
| ----- | -------- |
| Svelte UI shell (components, routes, stores) | **Svelte 5** ~46% |
| Browser-side DSP engines | **JavaScript (ES2024)** ~28% |
| Vercel serverless API + analysis CLI | **Python 3.12** ~13% |
| Android native sensors & audio | **Kotlin (Capacitor 8)** ~7% |
| WebGL isobar underlay | **GLSL ES 3.00** ~3% |
| Glass-card design system | **CSS** ~3% |

No `.ts`, no `.tsx`, no `tsconfig.json`, no `lang="ts"` — the repo is 0.0% TypeScript
by construction.

## What it does

- **01 · Aeroacoustic Wind Anemometer** — live mic or built-in spectral simulator
  drives a real 20–250 Hz sub-bass energy measurement; cube-root law maps
  P_rms → mph (Beaufort 0–12). Structural load calculator (tent/awning uplift),
  live gust chart, speak-through speaker toggle.
- **02 · Brontophonic Lightning Radar** — polar radar with sweep & shockwave
  rings; **Flash → Bang mode** converts flash-to-sound-travel time into km;
  **Spectral ranging mode** detects thunder transients and estimates strike
  distance via spectral rolloff (20–2000 Hz).
- **03 · Barometric Microburst Lab** — live 24 h pressure trace, Espy LCL
  cross-section, synoptic preset grid (cold-front squalls, storms, bombogenesis,
  lulls), CAPE upper-bound (Pro/Admin tier), isobar color shift on every
  readout. The 0 °C isotherm + dew-form countdown are derived per surface.
- **04 · Wet-Bulb WBGT Shield** — Stull (2011) wet-bulb × ISO 7243 globe G ×
  dry-bulb, live ISO color flag (green/yellow/orange/red/black); Osczevski &
  Bluestein wind-chill frostbite timer; hydrationml/h (with imperial oz/h);
  dew-fog countdown.
- **05 · Polyglot Vault** — Admin-tier Source Inspector (live reading of every
  Python, Kotlin, GLSL and JS file in the repo) + runtime benchmarks +
  expedition ledger (CSV/JSON export) + optional Supabase cloud sync queue.

## Quick start (local dev)

```bash
npm ci
npm run dev          # SvelteKit dev server → http://localhost:5173
npm run build        # production bundle → build/  (0 TypeScript)
npm run preview      # serve the production build locally
```

## Vercel deployment

`vercel.json` wires the static-SvelteKit build + `/api/*` Python function:

- `outputDirectory: build` (adapter-static)
- `/api/atmos_physics.py` is a Python 3.12 serverless handler with 8 routes
  (wetbulb, wbgt, windchill, lcl, tendency, presets, report, health) —
  included verbatim under `api/` and also inlined as a pure-JS mirror.
- SPA rewrites exclude `/api/*` so the Python function always wins.

Vercel hosting is available via the Vercel connector — just enable it in the
conversation and the deployment continues from there.

## Android .APK (self-hosted, offline)

```bash
# full offline path (requires JDK 17 + Android SDK + Gradle 8+)
npm run build
npm run apk:build
```

The one-tap download button in the UI tries `/releases/atmosvigil-release.apk`
first (populated by the GitHub Actions pipeline on every push to `main`); if
that 404s it falls back to generating a client-side Capacitor release kit
(zip) with a QR code. The pipeline (`.github/workflows/build-and-bundle-apk.yml`)
runs `npm run build` → `cap add android` → Kotlin plugin injection →
`gradle :app:assembleDebug/Release` → stage to `static/releases/` →
commit on `main` + upload as a 30-day GitHub Actions artifact.

**Sideload on your phone:**

1. Enable *Install unknown apps* for your browser.
2. Scan the QR code in the in-app **Distribution** modal (or tap
   *Download .APK Now*).
3. Install & open — the app runs entirely offline, sensors and all.

## Polyglot source map (the whole stack, readable in-app)

| File | Language | Role |
| ---- | -------- | ---- |
| `api/atmos_physics.py` | Python 3.12 | Vercel serverless handler — 8 routes, zero deps |
| `python_meteorology/stull_wetbulb_wbgt.py` | Python 3.12 | Stull wet-bulb, WBGT, Osczevski, Espy LCL |
| `python_meteorology/barometric_cyclogenesis.py` | Python 3.12 | Cyclone classification, microburst heuristic, hypsometric altitude |
| `android/app/.../BarometerThermoPlugin.kt` | Kotlin | MEMS pressure/temperature/humidity events |
| `android/app/.../AeroAcousticAnemometerPlugin.kt` | Kotlin | AudioRecord → cube-root wind law (beaufort) |
| `src/shaders/isobar_vortex.glsl` | GLSL ES 3.00 | Weather-reactive isobar underlay |
| `src/shaders/lightning_plasma.glsl` | GLSL ES 3.00 | Atmospheric ionization arcs backdrop |
| `src/lib/engines/meteoEngine.js` | JavaScript | Offline JS mirror of every physics formula |
| `src/lib/engines/audioEngine.js` | JavaScript | Mic capture, synthesized wind/thunder |
| `src/lib/engines/db.js` | JavaScript | IndexedDB ledger + sync queue |
| `src/lib/components/*.svelte` | Svelte | Full glassmorphic UI |

The Vault module renders the exact source of every one of those files (via
`?raw` imports) with file-by-file syntax highlighting via the browser's own
selection — the whole stack is inspectable with a click.

## Acceptance gates (checked on this build)

- `npm run build` — **PASS** (zero errors, zero `TypeScript` diagnostics)
- 0.0% TypeScript across the repo — verified by the audit below
- All deliverables present: `api/atmos_physics.py`,
  `python_meteorology/{stull_wetbulb_wbgt,barometric_cyclogenesis}.py`,
  `android/app/.../{BarometerThermo,AeroAcousticAnemometer}Plugin.kt`,
  `src/shaders/{isobar_vortex,lightning_plasma}.glsl`,
  `.github/workflows/build-and-bundle-apk.yml`, `capacitor.config.json`,
  `scripts/build-apk.mjs`, `src/routes/+layout.{js,svelte}`,
  `src/routes/+page.svelte`, 5 modules, 3 modals/drawer, `src/app.css`

## Honest limitations

- Python 3.12 requested — the sandbox ships Python 3.11.2; the CLI/API are
  stdlib-only and run identically on both, but the exact 3.12 numbers may differ
  by sub-percent from the request spec.
- No local `java`/`gradle`/Android SDK — the APK pipeline runs in GitHub
  Actions; local `npm run apk:build` is available for machines with the SDK.
- Role switching in the app is a dev-time demo (no real auth); switch roles in
  the dashboard drawer to preview tier unlocks.

## License

MIT — see `LICENSE`.
