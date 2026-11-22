<script>
	import { onMount } from 'svelte';
	import { telemetry, alerts, theme } from '../stores.js';
	import { createShaderView } from '../engines/glsl.js';
	import isobarSource from '../../shaders/isobar_vortex.glsl?raw';

	let canvas;
	let shader = null;
	let ridden = false;

	onMount(() => {
		const reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
		if (reduced || !canvas) return;
		try {
			shader = createShaderView(canvas, {
				source: isobarSource,
				uniforms: ['uTime', 'uWind', 'uPalette', 'uIntensity', 'uResolution'],
				uniformDefaults: { uTime: 0, uWind: 0.2, uPalette: 0, uIntensity: 0.5 }
			});
		} catch (err) {
			// WebGL2 unavailable or shader error — CSS gradient fallback stays
			console.warn('[isobar] WebGL2 unavailable:', err.message);
			shader = null;
		}
		if (shader) {
			shader.start((t) => {
				if ($theme === 'eco') return; // low-GPU mode — skip updates; CSS gradient used instead
				const s = $telemetry;
				const critical = $alerts.some((a) => a.severity === 'critical');
				const severeTense = critical || s.pressureTendency3h <= -4 || s.wbgt > 32;
				const storm = !severeTense && (s.pressureTendency3h <= -2 || (s.beaufort ?? 0) >= 5 || s.wbgt > 26);
				shader.set('uTime', t);
				shader.set('uWind', Math.min(1, (s.windMph ?? 0) / 82));
				shader.set('uPalette', severeTense ? 2 : storm ? 1 : 0);
				shader.set('uIntensity', severeTense ? 0.95 : storm ? 0.65 : 0.4);
			});
		}
		return () => {
			try { shader?.stop(); } catch { /* noop */ }
			try { shader?.destroy(); } catch { /* noop */ }
			shader = null;
		};
	});

	const ecoMode = $derived($theme === 'eco');
</script>

<div class="isobar-underlay" class:eco={ecoMode} aria-hidden="true">
	<canvas bind:this={canvas} class="isobar-canvas" class:hidden={ecoMode}></canvas>
	{#if ecoMode}
		<div class="eco-gradient"></div>
	{/if}
</div>

<style>
	.isobar-underlay {
		position: fixed;
		inset: 0;
		z-index: -1;
		overflow: hidden;
		background:
			radial-gradient(1200px 800px at 70% -10%, rgba(34, 211, 238, 0.16), transparent 55%),
			radial-gradient(1000px 700px at 15% 110%, rgba(139, 92, 246, 0.18), transparent 60%),
			linear-gradient(180deg, var(--base-2) 0%, var(--base) 100%);
		transition: filter 0.6s ease;
	}
	.isobar-canvas {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		will-change: transform;
		opacity: 0.92;
		mix-blend-mode: screen;
	}
	.isobar-canvas.hidden {
		display: none;
	}
	.eco-gradient {
		position: absolute;
		inset: 0;
		background:
			linear-gradient(160deg, rgba(45, 212, 191, 0.12), rgba(10, 14, 24, 0) 55%),
			linear-gradient(200deg, rgba(251, 191, 36, 0.08), rgba(10, 14, 24, 0) 50%),
			linear-gradient(180deg, #10141f 0%, #05070c 100%);
	}
	.isobar-underlay.eco {
		filter: saturate(0.85);
	}
</style>
