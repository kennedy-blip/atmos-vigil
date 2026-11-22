// ATMOS-VIGIL — raw source loader for the Polyglot Source Inspector (?raw).
import atmosPhysics from '../../api/atmos_physics.py?raw';
import stull from '../../python_meteorology/stull_wetbulb_wbgt.py?raw';
import cyclogenesis from '../../python_meteorology/barometric_cyclogenesis.py?raw';
import barometerKt from '../../android/app/src/main/java/com/atmosvigil/meteo/BarometerThermoPlugin.kt?raw';
import anemometerKt from '../../android/app/src/main/java/com/atmosvigil/meteo/AeroAcousticAnemometerPlugin.kt?raw';
import isobarGlsl from '../shaders/isobar_vortex.glsl?raw';
import plasmaGlsl from '../shaders/lightning_plasma.glsl?raw';
import meteoEngine from './engines/meteoEngine.js?raw';
import audioEngine from './engines/audioEngine.js?raw';

export const SOURCES = [
	{
		id: 'atmos_physics.py',
		label: 'api/atmos_physics.py',
		lang: 'python',
		language: 'Python 3.12',
		file: 'api/atmos_physics.py',
		source: atmosPhysics,
		purpose: 'Vercel serverless function — WBGT / LCL / tendency / cyclogenesis / Osczevski.',
		stats: ['Python 3.12', 'Vercel Python runtime', 'Zero third-party deps']
	},
	{
		id: 'stull_wetbulb_wbgt.py',
		label: 'python_meteorology/stull_wetbulb_wbgt.py',
		lang: 'python',
		language: 'Python 3.12',
		file: 'python_meteorology/stull_wetbulb_wbgt.py',
		source: stull,
		purpose: 'Stull wet-bulb, ISO 7243 WBGT, Osczevski wind chill, Espy LCL & frostbite.',
		stats: ['Stull 2011', 'ISO 7243 WBGT', 'Espy 125 m/°C']
	},
	{
		id: 'barometric_cyclogenesis.py',
		label: 'python_meteorology/barometric_cyclogenesis.py',
		lang: 'python',
		language: 'Python 3.12',
		file: 'python_meteorology/barometric_cyclogenesis.py',
		source: cyclogenesis,
		purpose: 'Barometric cyclogenesis — bombogenesis & microburst classification.',
		stats: ['ΔP/3h tendency', 'Bombogenesis K-B criteria', 'ISA altitude']
	},
	{
		id: 'BarometerThermoPlugin.kt',
		label: 'BarometerThermoPlugin.kt',
		lang: 'kotlin',
		language: 'Kotlin (Android Capacitor)',
		file: 'android/app/src/main/java/com/atmosvigil/meteo/BarometerThermoPlugin.kt',
		source: barometerKt,
		purpose: 'MEMS pressure, ambient temperature & relative humidity hardware sensors.',
		stats: ['Sensor.TYPE_PRESSURE', 'Sensor.TYPE_AMBIENT_TEMPERATURE', 'Sensor.TYPE_RELATIVE_HUMIDITY']
	},
	{
		id: 'AeroAcousticAnemometerPlugin.kt',
		label: 'AeroAcousticAnemometerPlugin.kt',
		lang: 'kotlin',
		language: 'Kotlin (Android Capacitor)',
		file: 'android/app/src/main/java/com/atmosvigil/meteo/AeroAcousticAnemometerPlugin.kt',
		source: anemometerKt,
		purpose: 'Raw AudioRecord PCM → sub-bass RMS → cube-root wind law.',
		stats: ['AudioRecord 16-bit mono', 'cube-root law', 'beaufort mapping']
	},
	{
		id: 'isobar_vortex.glsl',
		label: 'src/shaders/isobar_vortex.glsl',
		lang: 'glsl',
		language: 'GLSL ES 3.00',
		file: 'src/shaders/isobar_vortex.glsl',
		source: isobarGlsl,
		purpose: 'Weather-reactive Coriolis wind streamlines & isobar contours.',
		stats: ['WebGL2', 'FBM noise', 'Weather palettes']
	},
	{
		id: 'lightning_plasma.glsl',
		label: 'src/shaders/lightning_plasma.glsl',
		lang: 'glsl',
		language: 'GLSL ES 3.00',
		file: 'src/shaders/lightning_plasma.glsl',
		source: plasmaGlsl,
		purpose: 'Atmospheric lightning ionization arcs backdrop.',
		stats: ['WebGL2', 'Plasma glow', 'Filament arcs']
	},
	{
		id: 'meteoEngine.js',
		label: 'src/lib/engines/meteoEngine.js',
		lang: 'javascript',
		language: 'JavaScript (ES2024)',
		file: 'src/lib/engines/meteoEngine.js',
		source: meteoEngine,
		purpose: 'Offline browser mirror of Stull, WBGT, cyclogenesis & lightning physics.',
		stats: ['Stull arctan', 'ISO 7243', 'Osczevski', 'Espy LCL']
	},
	{
		id: 'audioEngine.js',
		label: 'src/lib/engines/audioEngine.js',
		lang: 'javascript',
		language: 'JavaScript (ES2024)',
		file: 'src/lib/engines/audioEngine.js',
		source: audioEngine,
		purpose: 'Web Audio mic capture, wind & thunder synthesis, flash detection.',
		stats: ['getUserMedia', 'bandpass noise', 'spectral analyser']
	}
];
