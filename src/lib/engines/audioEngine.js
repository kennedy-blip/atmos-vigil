// ATMOS-VIGIL — Web Audio engines: microphone capture, wind & thunder synthesis.
// The DSP pipeline (20–250 Hz sub-bass analysis) reads directly from an AnalyserNode,
// so live mics and synthesized presets produce the same measured numbers.

let sharedContext = null;

export function getAudioContext() {
	if (!sharedContext || sharedContext.state === 'closed') {
		sharedContext = new (window.AudioContext || window.webkitAudioContext)();
	}
	if (sharedContext.state === 'suspended') {
		sharedContext.resume().catch(() => {});
	}
	return sharedContext;
}

export function makeAnalyser(ctx, fftSize = 4096, smoothing = 0.82) {
	const analyser = ctx.createAnalyser();
	analyser.fftSize = fftSize;
	analyser.smoothingTimeConstant = smoothing;
	return analyser;
}

// ------------------------- microphone -------------------------
export async function startMic() {
	if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
		return { ok: false, reason: 'getUserMedia unavailable in this browser' };
	}
	try {
		const stream = await navigator.mediaDevices.getUserMedia({
			audio: {
				channelCount: { ideal: 1 },
				echoCancellation: false,
				noiseSuppression: false,
				autoGainControl: false,
				latency: { ideal: 0.02 }
			}
		});
		const ctx = getAudioContext();
		const source = ctx.createMediaStreamSource(stream);
		const analyser = makeAnalyser(ctx, 4096, 0.8);
		source.connect(analyser);
		return { ok: true, ctx, stream, source, analyser };
	} catch (err) {
		return { ok: false, reason: err?.message ?? 'microphone permission denied' };
	}
}

export function stopMic(mic) {
	if (!mic) return;
	try { mic.stream?.getTracks().forEach((t) => t.stop()); } catch { /* noop */ }
	try { mic.source?.disconnect(); } catch { /* noop */ }
	try { mic.analyser?.disconnect(); } catch { /* noop */ }
}

// ------------------------- white-noise buffer -------------------------
function makeNoiseBuffer(ctx, seconds = 4) {
	const frames = Math.floor(ctx.sampleRate * seconds);
	const buffer = ctx.createBuffer(1, frames, ctx.sampleRate);
	const data = buffer.getChannelData(0);
	for (let i = 0; i < frames; i++) data[i] = Math.random() * 2 - 1;
	return buffer;
}

let cachedNoise = null;
function noiseBuffer(ctx) {
	if (!cachedNoise) cachedNoise = makeNoiseBuffer(ctx);
	return cachedNoise;
}

// ------------------------- wind simulator -------------------------
const WIND_PRESETS = {
	2: { label: 'Light Breeze', targetMph: 7.5, band: [40, 150], gain: 0.5, swell: 0.35 },
	5: { label: 'Fresh Breeze', targetMph: 22.0, band: [40, 160], gain: 0.75, swell: 0.55 },
	8: { label: 'Gale Force Squall', targetMph: 44.5, band: [35, 200], gain: 1.0, swell: 0.75 },
	10: { label: 'Microburst Downdraft', targetMph: 63.0, band: [30, 250], gain: 1.3, swell: 0.9 },
	12: { label: 'Hurricane Outflow', targetMph: 82.0, band: [25, 250], gain: 1.6, swell: 1.0 }
};

export const WIND_PRESETS_LIST = Object.entries(WIND_PRESETS).map(([force, p]) => ({
	force: Number(force),
	...p
}));

// Bandpass wind turbulence: loud at target rms so the DSP estimate tracks the preset.
export function startWindSimulator(force, { outputGain = 0.35, onAnalyser = null } = {}) {
	const preset = WIND_PRESETS[force] ?? WIND_PRESETS[2];
	const ctx = getAudioContext();
	const source = ctx.createBufferSource();
	source.buffer = noiseBuffer(ctx);
	source.loop = true;

	const band = ctx.createBiquadFilter();
	band.type = 'bandpass';
	band.frequency.value = Math.sqrt(preset.band[0] * preset.band[1]) * 1.2;
	band.Q.value = 0.9;

	const gainNode = ctx.createGain();
	const audioGain = ctx.createGain();
	audioGain.gain.value = outputGain;

	const analyser = makeAnalyser(ctx, 4096, 0.72);

	const lfo = ctx.createOscillator();
	lfo.frequency.value = 0.4 + force * 0.09;
	const lfoGain = ctx.createGain();
	lfoGain.gain.value = preset.gain * 0.42;
	lfo.connect(lfoGain);
	lfoGain.connect(gainNode.gain);

	source.connect(band);
	band.connect(gainNode);
	gainNode.connect(audioGain);
	audioGain.connect(ctx.destination);
	gainNode.connect(analyser);

	const targetRms = Math.pow(preset.targetMph / 82, 3);
	const expectedRms = 0.32; // rough scaling of bandpass white noise
	const gainScale = targetRms / expectedRms;
	const baseGain = Math.max(0.12, Math.min(2.4, gainScale * 1.35));
	gainNode.gain.value = baseGain;
	lfo.start();
	source.start();

	if (onAnalyser) onAnalyser(analyser);

	let stopped = false;
	return {
		analyser,
		stop() {
			if (stopped) return;
			stopped = true;
			try { source.stop(); } catch { /* noop */ }
			try { lfo.stop(); } catch { /* noop */ }
			try { gainNode.disconnect(); } catch { /* noop */ }
			try { audioGain.disconnect(); } catch { /* noop */ }
			try { band.disconnect(); } catch { /* noop */ }
			try { analyser.disconnect(); } catch { /* noop */ }
		},
		setOutputGain(g) {
			try { audioGain.gain.setTargetAtTime(g, ctx.currentTime, 0.05); } catch { /* noop */ }
		}
	};
}

// ------------------------- thunder simulator -------------------------
export const THUNDER_PRESETS = {
	close: { label: 'Close Cloud-to-Ground Strike', targetKm: 1.1, crack: true, band: [60, 1200], loudness: 1.0, tail: 0.45 },
	supercell: { label: 'Approaching Supercell Strike', targetKm: 4.2, crack: false, band: [60, 380], loudness: 0.72, tail: 1.1 },
	horizon: { label: 'Distant Horizon Rumble', targetKm: 14.5, crack: false, band: [40, 110], loudness: 0.32, tail: 1.9 },
	multi: { label: 'Multi-Strike Approach Sequence', targetKm: null, crack: false, band: [50, 520], loudness: 0.6, tail: 1.0, multi: [8.4, 5.1, 2.3] }
};

export const THUNDER_PRESETS_LIST = Object.entries(THUNDER_PRESETS).map(([id, p]) => ({ id, ...p }));

export function startThunderSimulator(presetId, { outputGain = 0.4, onAnalyser = null } = {}) {
	const preset = THUNDER_PRESETS[presetId] ?? THUNDER_PRESETS.supercell;
	const ctx = getAudioContext();
	const q = () => Math.max(0.0001, ctx.currentTime);

	const masterOut = ctx.createGain();
	masterOut.gain.value = outputGain;
	const analyser = makeAnalyser(ctx, 8192, 0.6);
	masterOut.connect(analyser);
	masterOut.connect(ctx.destination);

	let stopTimer = null;
	let stopped = false;

	const mkThud = (delaySec, loudness, bandLow, bandHigh, crack = false, buzz = 0.55) => {
		const t0 = q() + delaySec;
		const src = ctx.createBufferSource();
		src.buffer = noiseBuffer(ctx, 4);
		src.loop = true;

		const filter = ctx.createBiquadFilter();
		filter.type = 'bandpass';
		filter.frequency.value = Math.sqrt(bandLow * bandHigh) * 1.12;
		filter.Q.value = 0.62;

		const gain = ctx.createGain();
		gain.gain.setValueAtTime(0.0001, t0);
		gain.gain.exponentialRampToValueAtTime(Math.max(0.001, loudness * buzz), t0 + 0.012);
		gain.gain.exponentialRampToValueAtTime(0.0001, t0 + preset.tail + 0.35);

		if (crack) {
			const crackGain = ctx.createGain();
			crackGain.gain.setValueAtTime(0.0001, t0 + 0.015);
			crackGain.gain.exponentialRampToValueAtTime(loudness * 1.15, t0 + 0.028);
			crackGain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.085);
			const crackFilter = ctx.createBiquadFilter();
			crackFilter.type = 'highpass';
			crackFilter.frequency.value = 950;
			src.connect(crackFilter);
			crackFilter.connect(crackGain);
			crackGain.connect(masterOut);
		}

		src.connect(filter);
		filter.connect(gain);
		gain.connect(masterOut);
		src.start(t0);
		src.stop(t0 + preset.tail + 0.45);
	};

	if (preset.multi) {
		preset.multi.forEach((km, i) => {
			// Approaching cell: later strikes are closer — brighter roll-off + louder.
			const loud = preset.loudness * (1 - i * 0.16) + (i === 2 ? 0.45 : 0);
			const crack = i === 2;
			const low = Math.min(90, bandCenter(km));
			const high = 1200 - i * 320;
			mkThud(i * 1.85, loud, low, high, crack, 0.62);
		});
		stopTimer = setTimeout(() => stopNow(), preset.multi.length * 1850 + 900);
	} else {
		const [bandLow, bandHigh] = preset.band;
		mkThud(0, preset.loudness, bandLow, bandHigh, preset.crack, 0.62);
		stopTimer = setTimeout(() => stopNow(), (preset.tail + 0.6) * 1000);
	}

	function bandCenter(km) {
		// closer = higher spectral peak
		return km > 8 ? 60 : km > 4 ? 85 : 110;
	}

	function stopNow() {
		if (stopped) return;
		stopped = true;
		try { masterOut.disconnect(); } catch { /* noop */ }
		try { analyser.disconnect(); } catch { /* noop */ }
	}

	if (onAnalyser) onAnalyser(analyser);

	return {
		analyser,
		stop() {
			if (stopTimer) clearTimeout(stopTimer);
			stopNow();
		}
	};
}

// ------------------------- optical flash detection -------------------------
export async function startFlashDetector({ onFlash, samplesPerSecond = 12 } = {}) {
	if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
		return { ok: false, reason: 'getUserMedia unavailable' };
	}
	try {
		const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
		const video = document.createElement('video');
		video.muted = true;
		video.playsInline = true;
		video.srcObject = stream;
		await video.play().catch(() => {});
		const canvas = document.createElement('canvas');
		canvas.width = 96;
		canvas.height = 96;
		const ctx2d = canvas.getContext('2d', { willReadFrequently: true });

		let stopped = false;
		let baseline = 0;
		let running = true;
		const start = performance.now();

		const loop = () => {
			if (!running) return;
			const t = performance.now();
			try {
				ctx2d.drawImage(video, 0, 0, 96, 96);
				const data = ctx2d.getImageData(0, 0, 96, 96).data;
				let sum = 0;
				const n = data.length / 4;
				for (let i = 0; i < data.length; i += 4) {
					sum += data[i] * 0.2126 + data[i + 1] * 0.7152 + data[i + 2] * 0.0722;
				}
				const luma = sum / n;
				if (baseline === 0 || t - start > 4000) {
					baseline = baseline === 0 ? luma : baseline * 0.96 + luma * 0.04;
				}
				const isSpike = luma > Math.max(150, baseline * 1.5) && baseline > 6 && (t - start) > 600;
				if (isSpike) {
					baseline = luma; // reset
					if (onFlash) onFlash(luma);
				}
			} catch { /* video warming up */ }
			setTimeout(loop, 1000 / samplesPerSecond);
		};
		loop();

		return {
			ok: true,
			stream,
			getBaseline: () => baseline,
			stop() {
				running = false;
				stopped = true;
				try { video.srcObject = null; } catch { /* noop */ }
				try { stream.getTracks().forEach((t) => t.stop()); } catch { /* noop */ }
			}
		};
	} catch (err) {
		return { ok: false, reason: err?.message ?? 'camera permission denied' };
	}
}
