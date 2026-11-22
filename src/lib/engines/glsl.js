// WebGL2 renderer shared by the Isobar Underlay and the Lightning Plasma backdrop.
// GLSL sources are shipped as plain .glsl files (zero TypeScript everywhere).

/**
 * Split a combined .glsl file into { vertex, fragment } sections
 * using the ===VERTEX=== / ===FRAGMENT=== markers.
 */
export function splitGlsl(source) {
	const vertex = source.split('// ===VERTEX===')[1]?.split('// ===FRAGMENT===')[0]?.replace(/^\s*\/\/ ===VERTEX===\s*/, '').trim();
	const fragment = source.split('// ===FRAGMENT===')[1]?.split('// ===VERTEX===')[0]?.trim();
	return {
		vertex: vertex ?? '',
		fragment: fragment ?? ''
	};
}

function compileShader(gl, type, source) {
	const shader = gl.createShader(type);
	gl.shaderSource(shader, source);
	gl.compileShader(shader);
	if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
		const log = gl.getShaderInfoLog(shader);
		gl.deleteShader(shader);
		throw new Error(`GLSL compile failed: ${log}`);
	}
	return shader;
}

/**
 * A GPU-accelerated, weather-reactive shader surface.
 * Usage:
 *   const g = createShaderView(canvas, { source: isobarSource, uniforms: [...] });
 *   g.set('uTime', t); g.set('uWind', 0.4); ...
 *   g.destroy();
 */
export function createShaderView(canvas, { source, uniforms = [], uniformDefaults = {} } = {}) {
	const gl = canvas.getContext('webgl2', { antialias: false, alpha: false, depth: false, stencil: false });
	if (!gl) return null; // WebGL2 unavailable — caller falls back to gradients

	const { vertex, fragment } = splitGlsl(source);
	const program = gl.createProgram();
	gl.attachShader(program, compileShader(gl, gl.VERTEX_SHADER, vertex));
	gl.attachShader(program, compileShader(gl, gl.FRAGMENT_SHADER, fragment));
	gl.linkProgram(program);
	if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
		throw new Error(`GLSL link failed: ${gl.getProgramInfoLog(program)}`);
	}
	gl.useProgram(program);

	// Fullscreen triangle
	const buffer = gl.createBuffer();
	gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
	gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
	const aPos = gl.getAttribLocation(program, 'aPos');
	gl.enableVertexAttribArray(aPos);
	gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

	const locations = {};
	for (const u of uniforms) {
		locations[u] = gl.getUniformLocation(program, u);
		if (uniformDefaults && uniformDefaults[u] !== undefined) {
			gl.uniform1f(locations[u], uniformDefaults[u]);
		}
	}

	let width = 0;
	let height = 0;
	const resize = () => {
		const dpr = Math.min(2, window.devicePixelRatio || 1);
		const rect = canvas.getBoundingClientRect();
		width = Math.max(1, Math.round(rect.width * dpr));
		height = Math.max(1, Math.round(rect.height * dpr));
		if (canvas.width !== width || canvas.height !== height) {
			canvas.width = width;
			canvas.height = height;
			gl.viewport(0, 0, width, height);
			if (locations.uResolution) gl.uniform2f(locations.uResolution, width, height);
		}
	};

	let rafId = 0;
	let running = false;

	const set = (name, value) => {
		const loc = locations[name];
		if (loc === undefined || !(loc instanceof Object)) return;
		if (typeof value === 'number') gl.uniform1f(loc, value);
		else if (Array.isArray(value) && value.length === 2) gl.uniform2f(loc, value[0], value[1]);
	};

	const renderOnce = (time = 0) => {
		resize();
		if (locations.uTime) gl.uniform1f(locations.uTime, time);
		gl.drawArrays(gl.TRIANGLES, 0, 3);
	};

	const start = (onFrame) => {
		if (running) return;
		running = true;
		const loop = (ts) => {
			if (!running) return;
			const t = ts / 1000;
			if (onFrame) onFrame(t, set);
			renderOnce(t);
			rafId = requestAnimationFrame(loop);
		};
		rafId = requestAnimationFrame(loop);
	};

	const stop = () => {
		running = false;
		cancelAnimationFrame(rafId);
	};

	const resize_now = () => resize();

	const destroy = () => {
		stop();
		try { gl.deleteProgram(program); } catch { /* noop */ }
		try { gl.deleteBuffer(buffer); } catch { /* noop */ }
	};

	const resizeObserver = new ResizeObserver(resize);
	resizeObserver.observe(canvas);

	return { set, start, stop, resize: resize_now, destroy, resizeObserver };
}
