// ===VERTEX===
#version 300 es
layout(location = 0) in vec2 aPos;

void main() {
	gl_Position = vec4(aPos, 0.0, 1.0);
}
// ===FRAGMENT===
#version 300 es
precision highp float;

uniform float uTime;
uniform float uCharge;   // 0..1 lightning ionization intensity
uniform float uPalette;  // 0 calm, 1 storm, 2 intense supercell
uniform vec2 uResolution;

out vec4 outColor;

float hash(vec2 p) {
	p = fract(p * vec2(123.34, 456.21));
	p += dot(p, p + 45.32);
	return fract(p.x * p.y);
}

float noise(vec2 p) {
	vec2 i = floor(p);
	vec2 f = fract(p);
	vec2 u = f * f * (3.0 - 2.0 * f);
	return mix(
		mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
		mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
		u.y
	);
}

float fbm(vec2 p) {
	float v = 0.0;
	float a = 0.5;
	for (int i = 0; i < 4; i++) {
		v += a * noise(p);
		p = p * 2.11 + vec2(3.1, 17.7);
		a *= 0.5;
	}
	return v;
}

// Angular jitter crackle for lightning filaments
float filament(vec2 p, float t) {
	vec2 q = vec2(p.x * 3.0, p.y * 10.0);
	float n = fbm(q - vec2(0.0, t * 2.4));
	float thin = 1.0 - abs(n - 0.5) * 9.0;
	return smoothstep(0.72, 1.0, thin);
}

void main() {
	vec2 uv = gl_FragCoord.xy / uResolution.xy;
	uv -= 0.5;
	vec2 p = uv * vec2(uResolution.x / uResolution.y, 1.0);
	float r = length(p);

	float t = uTime;

	// Ionospheric glow: soft radial plasma
	float glow = exp(-r * (4.5 - uCharge * 2.2));

	// Filament arcs radiating outward
	float arcs = 0.0;
	for (int i = 0; i < 2; i++) {
		vec2 q = vec2(p.x * 2.4 + float(i) * 7.3, p.y * 3.2 - float(i) * 5.1);
		q += vec2(fbm(q * 0.8 + t * 0.3), fbm(q * 0.8 - t * 0.2)) * 0.85 * (1.0 - r);
		arcs += filament(q, t) * (1.0 - smoothstep(0.15, 0.72, r));
	}

	// Sparkle shimmer
	float sparkle = step(0.986 - uCharge * 0.015, noise(uv * 340.0 + t * 6.0));

	vec3 calmCore   = vec3(0.13, 0.28, 0.95);
	vec3 calmEdge   = vec3(0.65, 0.86, 1.0);
	vec3 stormCore  = vec3(0.55, 0.22, 0.98);
	vec3 stormEdge  = vec3(1.0, 0.55, 0.92);
	vec3 sevCore    = vec3(0.98, 0.22, 0.12);
	vec3 sevEdge    = vec3(1.0, 0.85, 0.42);

	vec3 core;
	vec3 edge;
	if (uPalette < 0.5) {
		core = calmCore;
		edge = calmEdge;
	} else if (uPalette < 1.5) {
		core = stormCore;
		edge = stormEdge;
	} else {
		core = sevCore;
		edge = sevEdge;
	}

	vec3 col = mix(core, edge, glow);
	col *= 0.22 + glow * 0.8;
	col += edge * arcs * (0.55 + uCharge * 0.75);
	col += vec3(1.0, 1.0, 0.88) * sparkle * 0.85;
	col += vec3(0.9, 0.35, 1.0) * pow(max(0.0, 1.0 - r * 2.1), 3.0) * (0.10 + uCharge * 0.34);

	// Darkened border so radar rings stay legible
	float vig = smoothstep(0.9, 0.25, r);
	col *= mix(0.42, 1.0, vig);

	outColor = vec4(col, 1.0);
}
