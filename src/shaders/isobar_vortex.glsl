// ===VERTEX===
#version 300 es
layout(location = 0) in vec2 aPos;

void main() {
	// Fullscreen triangle: (-1,-1), (3,-1), (-1,3)
	gl_Position = vec4(aPos, 0.0, 1.0);
}
// ===FRAGMENT===
#version 300 es
precision highp float;

uniform float uTime;
uniform float uWind;      // 0..1 wind intensity / gust energy
uniform float uPalette;   // 0 = fair sky, 1 = storm front, 2 = severe microburst
uniform float uIntensity; // 0..1 global atmosphere energy
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
	for (int i = 0; i < 5; i++) {
		v += a * noise(p);
		p = p * 2.03 + vec2(1.7, 9.2);
		a *= 0.5;
	}
	return v;
}

// Coriolis-style swirl: rotates field by angle proportional to radius + outer wind
vec2 swirlField(vec2 uv, float t) {
	vec2 c = uv - 0.5;
	float r = length(c);
	float ang = t * 0.12 * (0.4 + uWind * 1.6) + r * 3.2 * (0.5 + uWind);
	float cs = cos(ang);
	float sn = sin(ang);
	vec2 rot = vec2(c.x * cs - c.y * sn, c.x * sn + c.y * cs);
	vec2 flow = rot * (1.0 - uWind * 0.28 * sin(t * 0.55 + r * 4.0));
	return c + flow;
}

void main() {
	vec2 uv = gl_FragCoord.xy / uResolution.xy;
	vec2 swirl = swirlField(uv, uTime * 0.14);

	vec2 fieldP = uv * vec2(1.55, 1.0) * vec2(1.0 - uWind * 0.35, 1.0) + swirl * vec2(2.35, 2.1);
	float n = fbm(fieldP + vec2(uTime * 0.055, -uTime * 0.035));

	// Isobar contour lines along the noise-isobar bands
	float bands = 5.0 + uIntensity * 5.0;
	float iso = fract(n * bands + uTime * 0.02);
	float isoLine = 1.0 - smoothstep(0.0, 0.055, abs(iso - 0.5));

	// Gust streaks: stretched flow lines
	vec2 streak = vec2(swirl.x * 9.0, swirl.y * 1.55 + n * 0.6);
	float streaks = fbm(streak + vec2(uTime * 0.9 * (0.4 + uWind), 0.0));
	streaks = smoothstep(0.52, 0.94, streaks) * (0.25 + uWind * 0.75);

	// Weather palettes
	vec3 fairCyan   = vec3(0.024, 0.20, 0.29);
	vec3 fairAzure  = vec3(0.10, 0.61, 0.78);
	vec3 fairEmerald= vec3(0.06, 0.72, 0.50);

	vec3 stormAmber = vec3(0.22, 0.12, 0.30);
	vec3 stormUV    = vec3(0.42, 0.24, 0.72);
	vec3 stormIndigo= vec3(0.32, 0.34, 0.83);

	vec3 sevCrimson= vec3(0.28, 0.03, 0.06);
	vec3 sevMagenta= vec3(0.85, 0.13, 0.40);
	vec3 sevOrange = vec3(0.98, 0.42, 0.10);

	vec3 col;
	vec3 isobarInk;
	vec3 streakCol;

	if (uPalette < 0.5) {
		col = mix(fairCyan, fairAzure, n);
		col = mix(col, fairEmerald, streaks * 0.55);
		isobarInk = vec3(0.65, 0.96, 1.0);
		streakCol = vec3(0.55, 0.95, 0.85);
	} else if (uPalette < 1.5) {
		col = mix(stormAmber, stormUV, n);
		col = mix(col, stormIndigo, streaks * 0.6);
		isobarInk = vec3(1.0, 0.78, 0.42);
		streakCol = vec3(0.72, 0.55, 1.0);
	} else {
		col = mix(sevCrimson, sevMagenta, n);
		col = mix(col, sevOrange, streaks * 0.55);
		isobarInk = vec3(1.0, 0.62, 0.42);
		streakCol = vec3(1.0, 0.32, 0.42);
	}

	// Vignette so panels stay readable
	float vig = smoothstep(0.95, 0.22, length(uv - 0.5));
	col *= mix(0.55, 1.0, vig);

	// Contours & streaks
	col += isobarInk * isoLine * 0.24;
	col += streakCol * streaks * 0.55;

	// Subtle center glow
	col += mix(fairCyan, vec3(0.4, 0.2, 0.55), uPalette / 2.0) * 0.10 * n;

	outColor = vec4(col, 1.0);
}
