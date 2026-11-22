<script>
	import { onMount, onDestroy } from 'svelte';
	import { modal, pushAlert } from '../../stores.js';
	import Icon from '../Icon.svelte';
	import Chip from '../Chip.svelte';

	let qrSvg = $state('');
	let apkExists = $state(null); // null = checking, true, false
	let checkingTimer = $state(null);
	let modalOpen = $derived($modal === 'apk');

	const releaseUrl = '/releases/atmosvigil-release.apk';
	const appName = 'AtmosVigil Weather DSP';
	const appVersion = 'v1.0.0-arm64';
	const workflowUrl = 'https://github.com/kennedy-blip/atmos-vigil/blob/main/.github/workflows/build-and-bundle-apk.yml';

	async function checkApk() {
		try {
			const res = await fetch(releaseUrl, { method: 'HEAD' });
			apkExists = res.ok;
		} catch {
			apkExists = false;
		}
	}

	function close() {
		modal.set(null);
	}

	function esc(e) {
		if (e.key === 'Escape') close();
	}

	function backdrop(e) {
		if (e.target === e.currentTarget) close();
	}

	async function downloadApk() {
		if (apkExists) {
			const a = document.createElement('a');
			a.href = releaseUrl;
			a.download = 'AtmosVigil-WeatherDSP-v1.0.0.apk';
			a.click();
			pushAlert('ok', 'APK DOWNLOAD STARTED');
			return;
		}
		// Client-side package stream fallback — assembles the Capacitor release kit.
		try {
			pushAlert('info', 'APK BINARY NOT YET BUILT — GENERATING RELEASE KIT (zip)');
			const JSZip = (await import('jszip')).default;
			const zip = new JSZip();
			zip.file('README.md', readmes());
			zip.file('capacitor.config.json', configJson());
			zip.file('APK_SPEC.md', specMd());
			zip.file('.github/workflows/build-and-bundle-apk.yml', workflowStub());
			const blob = await zip.generateAsync({
				type: 'blob',
				compression: 'DEFLATE',
				compressionOptions: { level: 6 }
			});
			const url = URL.createObjectURL(blob);
			const a = document.createElement('a');
			a.href = url;
			a.download = 'AtmosVigil-Release-Kit.zip';
			a.click();
			setTimeout(() => URL.revokeObjectURL(url), 5000);
			pushAlert('ok', 'RELEASE KIT DOWNLOADED — Capacitor sources assembled');
		} catch (err) {
			pushAlert('danger', `DOWNLOAD FAILED: ${err?.message ?? 'unknown error'}`);
		}
	}

	function readmes() {
		return `# ATMOS-VIGIL — Android Release Kit\n\nThis package is the client-side release kit generator for ATMOS-VIGIL.\n\nThe CI pipeline (.github/workflows/build-and-bundle-apk.yml) builds the real .APK\non every push to main. The one-tap download button in the app will switch automatically\nonce the artifact exists.\n\nTo build the real APK locally:\n\n  npm ci\n  npm run build\n  npx cap add android\n  npx cap sync android\n  gradle :app:assembleRelease\n\nCustom Kotlin plugins ship in \`android/app/src/main/java/com/atmosvigil/meteo/\`.\n`;
	}

	function configJson() {
		return `{\n  "appId": "com.atmosvigil.meteo",\n  "appName": "AtmosVigil",\n  "webDir": "dist"\n}\n`;
	}

	function specMd() {
		return `# ATMOS-VIGIL — .APK Build Specification\n\nVersion: ${appVersion}\nStack: Svelte 5 + Pure JavaScript + Python 3.12 + Kotlin + GLSL (0% TypeScript)\nRuntime: Capacitor 8 / Android API 24+\nMode: 100% Off-Grid Survival Ready\n\nSHA-256: populated by the CI pipeline on each build.\n`;
	}

	function workflowStub() {
		return `# .github/workflows/build-and-bundle-apk.yml\n# Full pipeline lives in the repository. It builds the Svelte bundle, syncs\n# Capacitor Android, compiles the Kotlin plugins and bundles the APK into\n# static/releases/atmosvigil-release.apk.\n`;
	}

	onMount(async () => {
		try {
			const QRCode = (await import('qrcode')).default;
			const url = window.location.origin + releaseUrl;
			qrSvg = await QRCode.toString(url, { type: 'svg', errorCorrectionLevel: 'M', margin: 1 });
		} catch {
			qrSvg = '';
		}
		await checkApk();
		document.addEventListener('keydown', esc);
		return () => document.removeEventListener('keydown', esc);
	});

	onDestroy(() => {
		if (checkingTimer) clearTimeout(checkingTimer);
	});
</script>

{#if modalOpen}
	<div class="modal-overlay" class:open={modalOpen} onclick={backdrop} role="dialog" aria-modal="true" tabindex="-1">
		<div class="modal-card glass prism-border">
			<header class="apk-head">
				<div>
					<div class="eyebrow">Distribution</div>
					<h2 class="apk-title">Android .APK</h2>
				</div>
				<button class="icon-btn" onclick={close} aria-label="Close"><Icon name="close" size={18} /></button>
			</header>

			<div class="apk-body">
				<div class="apk-col">
					<button class="apk-btn btn btn-primary mono" onclick={downloadApk}>
						<Icon name="download" size={18} />
						{apkExists ? 'Download .APK Now' : 'Generate Release Kit (APK ships via CI)'}
					</button>
					<div class="apk-status mono" class:pending={apkExists === null} class:ready={apkExists === true} class:pending2={apkExists === false}>
						{#if apkExists === null}
							CHECKING INSTALL STATUS…
						{:else if apkExists}
							READY — APK SEALED FOR DOWNLOAD
						{:else}
							NOT BUILT YET — CI PIPELINE ON push TO MAIN. FALLBACK ZIP DOWNLOAD STILL WORKS.
						{/if}
					</div>
					{#if qrSvg}
						<div class="qr-wrap">
							<div class="qr-box">{@html qrSvg}</div>
							<div class="qr-note mono">SCAN WITH YOUR ANDROID PHONE TO INSTALL</div>
						</div>
					{/if}
				</div>

				<div class="apk-col">
					<div class="card-spec">
						<h3 class="spec-h">Polyglot APK Build Spec</h3>
						<ul class="spec-list">
							<li><span>Version</span><strong>{appVersion}</strong></li>
							<li><span>Stack</span><strong>Svelte 5 · JS · Python 3.12 · Kotlin · GLSL</strong></li>
							<li><span>TypeScript</span><strong class="spec-strong">0.0% — none</strong></li>
							<li><span>Build</span><strong>Capacitor 8 · Android 24+</strong></li>
							<li><span>Offline mode</span><strong>100% Off-grid Survival Ready</strong></li>
							<li><span>SHA-256</span><strong>CI-populated</strong></li>
						</ul>
					</div>
					<div class="card-spec">
						<h3 class="spec-h">3-Step Sideload</h3>
						<ol class="steps">
							<li><span>01</span><div><strong>Settings → Security</strong><small>Enable <em>Install unknown apps</em> for your browser.</small></div></li>
							<li><span>02</span><div><strong>Tap the link</strong><small>Download <em>/releases/atmosvigil-release.apk</em> via the QR or the button.</small></div></li>
							<li><span>03</span><div><strong>Install & open</strong><small>Launch ATMOS-VIGIL — sensors are live the instant it starts.</small></div></li>
						</ol>
					</div>
					<a class="gh-link mono" href={workflowUrl} target="_blank" rel="noopener">View CI pipeline</a>
				</div>
			</div>
		</div>
	</div>
{/if}

<style>
	.apk-head {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		padding: 1.1rem 1.15rem 0.65rem;
	}
	.apk-title {
		margin: 0.15rem 0 0;
		font-size: 1.5rem;
		font-weight: 900;
		letter-spacing: 0.04em;
	}
	.apk-body {
		display: grid;
		grid-template-columns: minmax(280px, 1fr) minmax(280px, 1fr);
		gap: 1rem;
		padding: 0 1.15rem 1.15rem;
	}
	.apk-col { display: flex; flex-direction: column; gap: 0.85rem; }
	.apk-btn {
		justify-content: center;
		font-size: 0.95rem;
		padding: 0.85rem 1rem;
		border-radius: 16px;
		letter-spacing: 0.06em;
	}
	.apk-status {
		font-size: 0.62rem;
		letter-spacing: 0.12em;
		text-align: center;
		padding: 0.35rem 0.6rem;
		border-radius: 10px;
		border: 1px dashed var(--border);
		color: var(--muted);
	}
	.apk-status.ready { color: var(--ok); border-color: rgba(16, 185, 129, 0.5); }
	.apk-status.pending { color: var(--warn); border-color: rgba(245, 158, 11, 0.5); }
	.apk-status.pending2 { color: #fca5a5; border-color: rgba(239, 68, 68, 0.45); }
	.qr-wrap {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.5rem;
	}
	.qr-box {
		background: #fff;
		padding: 0.7rem;
		border-radius: 18px;
		box-shadow: 0 14px 40px rgba(0, 0, 0, 0.4);
	}
	.qr-box :global(svg) {
		display: block;
		width: 180px;
		height: 180px;
	}
	.qr-note {
		font-size: 0.58rem;
		letter-spacing: 0.18em;
		color: var(--muted);
	}
	.card-spec {
		border: 1px solid var(--border);
		border-radius: 16px;
		padding: 0.85rem;
		background: var(--panel-2);
	}
	.spec-h {
		margin: 0 0 0.55rem;
		font-size: 0.78rem;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		color: var(--text);
	}
	.spec-list {
		list-style: none;
		padding: 0;
		margin: 0;
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
	}
	.spec-list li {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
		gap: 0.75rem;
		padding: 0.32rem 0;
		border-bottom: 1px dashed var(--border);
		font-size: 0.76rem;
	}
	.spec-list li:last-child { border-bottom: 0; }
	.spec-list span { color: var(--muted); letter-spacing: 0.06em; text-transform: uppercase; font-size: 0.6rem; }
	.spec-list strong { text-align: right; }
	.spec-strong { color: var(--ok); }
	.steps {
		list-style: none;
		padding: 0;
		margin: 0;
		display: flex;
		flex-direction: column;
		gap: 0.55rem;
	}
	.steps li {
		display: flex;
		gap: 0.65rem;
		align-items: flex-start;
	}
	.steps span {
		flex-shrink: 0;
		display: grid;
		place-items: center;
		width: 1.9rem;
		height: 1.9rem;
		border-radius: 999px;
		background: linear-gradient(135deg, var(--accent), var(--accent-2));
		color: #04070f;
		font-size: 0.62rem;
		font-weight: 800;
	}
	.steps div { line-height: 1.35; }
	.steps strong { display: block; font-size: 0.8rem; }
	.steps small { color: var(--muted); font-size: 0.68rem; }
	.gh-link {
		align-self: center;
		font-size: 0.7rem;
		color: var(--accent);
		text-decoration: none;
		letter-spacing: 0.06em;
	}
	.icon-btn {
		width: 36px;
		height: 36px;
		border-radius: 10px;
		border: 1px solid var(--border);
		background: transparent;
		color: var(--muted);
		cursor: pointer;
		display: grid;
		place-items: center;
		transition: all 0.18s ease;
	}
	.icon-btn:hover { color: var(--text); border-color: var(--accent); }
	@media (max-width: 880px) {
		.apk-body { grid-template-columns: 1fr; }
	}
</style>
