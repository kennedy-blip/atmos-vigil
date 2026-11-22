<script>
	import { onMount } from 'svelte';
	import { role, pushAlert, forensicsItem, modal } from '../../stores.js';
	import Icon from '../Icon.svelte';
	import Card from '../Card.svelte';
	import Chip from '../Chip.svelte';
	import Stat from '../Stat.svelte';
	import { SOURCES } from '../../codeSources.js';
	import {
		stullWetBulbC,
		computeWbgt,
		cloudBaseM,
		classifyTendency,
		soundSpeed,
		dynamicPressurePa
	} from '../../engines/meteoEngine.js';
	import {
		countEntries,
		countPending,
		listEntries,
		clearAll,
		readSyncConfig,
		writeSyncConfig,
		clearSyncConfig,
		syncPending,
		toCsv,
		toJson,
		downloadFile
	} from '../../engines/db.js';

	let tab = $state('python');
	let selectedId = $state(SOURCES[0].id);
	let srcQ = $state(null);
	let entries = $state([]);
	let total = $state(0);
	let pending = $state(0);
	let benchLogs = $state([]);
	let syncUrl = $state('');
	let syncKey = $state('');
	let syncing = $state(false);
	let syncMsg = $state('');

	const isAdmin = $derived($role === 'admin');

	const selected = $derived(SOURCES.find((s) => s.id === selectedId) ?? SOURCES[0]);
	const tabs = [
		{ id: 'python', label: 'Python 3.12', lang: 'python' },
		{ id: 'kotlin', label: 'Kotlin', lang: 'kotlin' },
		{ id: 'glsl', label: 'GLSL', lang: 'glsl' },
		{ id: 'javascript', label: 'JavaScript', lang: 'javascript' },
		{ id: 'ledger', label: 'Ledger', lang: 'ledger' }
	];
	const tabbedSources = $derived(tab === 'ledger' ? [] : SOURCES.filter((s) => s.lang === tab));

	const codes = $derived(tabbedSources.length ? tabbedSources : SOURCES.filter((s) => s.lang === 'javascript'));

	function switchTab(t) {
		tab = t;
		if (t !== 'ledger' && !codes.some((c) => c.id === selectedId)) {
			const first = SOURCES.filter((s) => s.lang === t)[0];
			if (first) selectedId = first.id;
		}
	}

	async function refreshLedger() {
		try {
			entries = await listEntries(50);
			total = await countEntries();
			pending = await countPending();
		} catch { /* noop */ }
	}

	function openForensics(item) {
		forensicsItem.set({
			type: item.type,
			title: item.payload?.label ?? item.type,
			ts: item.ts,
			summary: `${new Date(item.ts).toLocaleTimeString()} · ${item.type}`,
			payload: item.payload ?? {},
			sourceFiles: ['src/lib/engines/meteoEngine.js']
		});
		modal.set('forensics');
	}

	function exportCsv() {
		if (!entries.length) { pushAlert('warning', 'LEDGER EMPTY — nothing to export'); return; }
		downloadFile('atmosvigil-expedition.csv', toCsv(entries), 'text/csv');
		pushAlert('ok', `EXPORTED ${entries.length} ENTRIES (CSV)`);
	}

	function exportJson() {
		if (!entries.length) { pushAlert('warning', 'LEDGER EMPTY — nothing to export'); return; }
		downloadFile('atmosvigil-expedition.json', toJson(entries), 'application/json');
		pushAlert('ok', `EXPORTED ${entries.length} ENTRIES (JSON)`);
	}

	function wipe() {
		clearAll().then(async () => {
			pushAlert('warning', 'EXPEDITION LEDGER WIPED');
			await refreshLedger();
		});
	}

	async function runBench() {
		const runs = [];
		const bench = (label, fn) => {
			const t0 = performance.now();
			for (let i = 0; i < 300; i++) fn();
			const dt = performance.now() - t0;
			runs.push(`${label}: ${(dt / 300).toFixed(3)} ms/op`);
		};
		bench('stullWetBulbC', () => stullWetBulbC(24, 55));
		bench('computeWbgt', () => computeWbgt(24, 55, 22, true));
		bench('cloudBaseM', () => cloudBaseM(30, 18));
		bench('classifyTendency', () => classifyTendency(-3.8, 1006));
		bench('soundSpeed', () => soundSpeed(22));
		bench('dynamicPressurePa', () => dynamicPressurePa(44.5));
		benchLogs = runs;
		pushAlert('ok', `RUNTIME BENCHMARK — ${runs.length} benchmarks complete`);
	}

	function saveSync() {
		writeSyncConfig(syncUrl, syncKey);
		pushAlert('ok', 'SYNC CONFIG SAVED');
	}

	async function flushSync() {
		const cfg = readSyncConfig();
		syncUrl = cfg.url;
		syncKey = cfg.key;
		if (!cfg.url || !cfg.key) {
			syncMsg = 'Not configured — add Supabase URL + anon key below.';
			pushAlert('warning', 'SYNC NOT CONFIGURED');
			return;
		}
		syncing = true;
		syncMsg = 'Syncing…';
		try {
			const res = await syncPending();
			syncMsg = res.ok
				? `Synced ${res.synced} record(s) — queue clear.`
				: `Failed: ${res.reason}`;
			pushAlert(res.ok ? 'ok' : 'danger', res.ok ? 'CLOUD SYNC COMPLETE' : 'CLOUD SYNC FAILED');
			await refreshLedger();
		} finally {
			syncing = false;
		}
	}

	function resetSync() {
		clearSyncConfig();
		syncUrl = ''; syncKey = ''; syncMsg = '';
		pushAlert('warning', 'SYNC CONFIG CLEARED');
	}

	onMount(async () => {
		switchTab('python');
		await refreshLedger();
		const cfg = readSyncConfig();
		syncUrl = cfg.url;
		syncKey = cfg.key;
	});
</script>

<div class="module vault-module">
	{#if !isAdmin}
		<Card kicker="05 · Polyglot Weather Vault" title="Restricted">
			<p class="hint">The Polyglot Runtime Lab & Sync Controller are admin-tier. Switch to <strong>Meteorological Command Admin</strong> in the dashboard drawer.</p>
			<ol class="tier-list">
				<li><Chip tone="ok">Standard</Chip><span>Wind Lab · Lightning Radar · Barometer Lab · WBGT Shield</span></li>
				<li><Chip tone="warn">Pro</Chip><span>+ Wind-Load Calculator · Brontophonic Spectral · LCL/CAPE</span></li>
				<li><Chip tone="danger">Admin</Chip><span>+ Source Inspector · JSON/CSV Export · Sync Queue</span></li>
			</ol>
		</Card>
	{:else}
		<div class="two-col">
			<Card kicker="Polyglot Runtime Inspector" title="Live Source & Benchmark">
				<div class="tab-row">
					{#each tabs as t (t.id)}
						<button class="tab" class:active={tab === t.id} onclick={() => switchTab(t.id)} type="button">{t.label}</button>
					{/each}
				</div>

				{#if tab === 'ledger'}
					<div class="ledger">
						<div class="ledger-head">
							<Stat label="Entries" value={total} unit="" tone="accent" small />
							<Stat label="Pending sync" value={pending} unit="" tone="warn" small />
						</div>
						<div class="ledger-list">
							{#if entries.length === 0}
								<p class="hint">No expedition entries yet — log a wind session, lightning strike, or alert.</p>
							{:else}
								{#each entries as e (e.id)}
									<button class="strike-row" onclick={() => openForensics(e)} type="button">
										<span class="strike-dot"></span>
										<span class="strike-main">
											<span class="strike-label">{e.type}</span>
											<span class="strike-sub mono">{new Date(e.ts).toLocaleString()} · {e.syncStatus}</span>
										</span>
										<Icon name="chevron" size={14} />
									</button>
								{/each}
							{/if}
						</div>
					</div>
				{:else}
					<div class="src-tabs">
						{#each tabbedSources as s (s.id)}
							<button class="src-chip" class:active={selectedId === s.id} onclick={() => selectedId = s.id} type="button">
								<Icon name="file" size={12} /> {s.label}
							</button>
						{/each}
					</div>
					<pre class="src-code">{selected.source}</pre>
					<div class="src-footer">
						<Chip tone="accent">{selected.language}</Chip>
						{#each selected.stats as st (st)}
							<Chip tone="ok">{st}</Chip>
						{/each}
					</div>
				{/if}
			</Card>

			<Card kicker="Runtime Control" title="Benchmark & Sync">
				<h4 class="h4">Benchmarks (JS mirror · 300 runs)</h4>
				<button class="btn btn-primary" onclick={runBench}><Icon name="run" size={14} fill /> Run Benchmark</button>
				{#if benchLogs.length}
					<ul class="bench-list">
						{#each benchLogs as b (b)}
							<li class="mono">{b}</li>
						{/each}
					</ul>
				{/if}

				<hr class="divider" />

				<h4 class="h4">Sync Queue</h4>
				<p class="hint">Optional Supabase cloud sync — the vault works locally even when sync is disabled.</p>
				<div class="sync-fields">
					<input type="text" bind:value={syncUrl} placeholder="Supabase URL (https://…)" />
					<input type="text" bind:value={syncKey} placeholder="anon / service key" />
				</div>
				<div class="sync-actions">
					<button class="btn" onclick={saveSync}>Save Config</button>
					<button class="btn" onclick={flushSync} disabled={syncing}><Icon name="sync" size={14} /> {syncing ? 'Syncing…' : 'Push Pending'}</button>
					<button class="btn btn-quiet" onclick={resetSync}>Reset</button>
				</div>
				{#if syncMsg}<p class="sync-msg mono">{syncMsg}</p>{/if}

				<hr class="divider" />

				<h4 class="h4">Raw Export</h4>
				<div class="sync-actions">
					<button class="btn" onclick={exportCsv}><Icon name="export" size={14} /> CSV</button>
					<button class="btn" onclick={exportJson}><Icon name="export" size={14} /> JSON</button>
					<button class="btn btn-danger" onclick={wipe}><Icon name="trash" size={14} /> Wipe</button>
				</div>
			</Card>
		</div>
	{/if}
</div>

<style>
	.vault-module { display: grid; gap: 1rem; }
	.two-col {
		display: grid;
		grid-template-columns: 1.35fr 1fr;
		gap: 1rem;
		align-items: start;
	}
	.tier-list { display: flex; flex-direction: column; gap: 0.55rem; padding-left: 1.2rem; }
	.tier-list li { display: flex; align-items: center; gap: 0.6rem; line-height: 1.5; font-size: 0.86rem; }
	.tab-row { display: flex; gap: 0.3rem; flex-wrap: wrap; margin-bottom: 0.6rem; }
	.tab {
		border: 1px solid var(--border);
		background: transparent;
		color: var(--muted);
		padding: 0.34rem 0.72rem;
		border-radius: 999px;
		cursor: pointer;
		font-size: 0.72rem;
		font-weight: 700;
		letter-spacing: 0.05em;
		font-family: inherit;
		transition: all 0.18s ease;
	}
	.tab.active {
		background: linear-gradient(135deg, var(--accent), var(--accent-2));
		color: #04070f;
		border-color: transparent;
	}
	.src-tabs { display: flex; flex-direction: column; gap: 0.3rem; margin-bottom: 0.55rem; }
	.src-chip {
		display: inline-flex;
		align-items: center;
		gap: 0.45rem;
		border: 1px solid var(--border);
		background: var(--panel-2);
		color: var(--muted);
		padding: 0.4rem 0.62rem;
		border-radius: 10px;
		cursor: pointer;
		font-family: inherit;
		font-size: 0.72rem;
		text-align: left;
		transition: all 0.16s ease;
	}
	.src-chip:hover { transform: translateX(2px); color: var(--text); }
	.src-chip.active { border-color: var(--accent); color: var(--accent); }
	.src-code {
		max-height: 380px;
		overflow: auto;
		background: rgba(2, 4, 12, 0.75);
		border: 1px solid var(--border);
		border-radius: 14px;
		padding: 0.85rem 1rem;
		font-size: 0.66rem;
		line-height: 1.45;
		color: #dbe6f5;
		white-space: pre-wrap;
		word-break: break-word;
		font-family: 'JetBrains Mono', ui-monospace, monospace;
		margin: 0;
	}
	.src-footer { display: flex; flex-wrap: wrap; gap: 0.35rem; margin-top: 0.6rem; }
	.h4 {
		font-size: 0.72rem;
		letter-spacing: 0.16em;
		text-transform: uppercase;
		color: var(--muted);
		margin: 0 0 0.55rem;
	}
	.bench-list {
		list-style: none;
		padding: 0;
		margin: 0.6rem 0 0;
		display: flex;
		flex-direction: column;
		gap: 0.2rem;
		font-size: 0.72rem;
		color: var(--accent);
	}
	.sync-fields {
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
		margin-bottom: 0.6rem;
	}
	.sync-actions {
		display: flex;
		gap: 0.4rem;
		flex-wrap: wrap;
	}
	.sync-msg { font-size: 0.74rem; color: var(--muted); margin: 0.5rem 0 0; }
	.ledger { display: flex; flex-direction: column; gap: 0.6rem; }
	.ledger-head { display: grid; grid-template-columns: 1fr 1fr; gap: 0.6rem; }
	.ledger-list { max-height: 380px; overflow: auto; }
	.strike-row {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		width: 100%;
		padding: 0.55rem 0.5rem;
		border: 0;
		border-bottom: 1px solid var(--border);
		background: transparent;
		color: var(--text);
		text-align: left;
		cursor: pointer;
		font-family: inherit;
		transition: background 0.2s ease;
	}
	.strike-row:hover { background: rgba(34, 211, 238, 0.06); }
	.strike-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--accent); }
	.strike-main { display: flex; flex-direction: column; gap: 0.12rem; min-width: 0; flex: 1; }
	.strike-label { font-size: 0.78rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; }
	.strike-sub { font-size: 0.64rem; color: var(--muted); }
	.hint { font-size: 0.74rem; color: var(--muted); line-height: 1.5; }
	.divider { margin: 0.7rem 0; }
	@media (max-width: 980px) {
		.two-col { grid-template-columns: 1fr; }
	}
</style>
