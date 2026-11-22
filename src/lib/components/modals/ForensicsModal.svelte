<script>
	import { onMount } from 'svelte';
	import { modal, forensicsItem } from '../../stores.js';
	import Icon from '../Icon.svelte';
	import Chip from '../Chip.svelte';
	import { SOURCES } from '../../codeSources.js';

	let open = $derived($modal === 'forensics');
	let item = $derived($forensicsItem);
	let fileIdx = $state(0);
	let fileList = $derived(item?.sourceFiles ?? ['src/lib/engines/meteoEngine.js']);
	let selectedFile = $derived(SOURCES.find((s) => s.file === fileList[fileIdx]) ?? SOURCES[0]);

	function esc(e) { if (e.key === 'Escape') modal.set(null); }
	function backdrop(e) { if (e.target === e.currentTarget) modal.set(null); }
	function pick(i) { fileIdx = i; }

	onMount(() => {
		document.addEventListener('keydown', esc);
		return () => document.removeEventListener('keydown', esc);
	});
</script>

{#if open && item}
	<div class="modal-overlay open" onclick={backdrop} role="dialog" aria-modal="true" tabindex="-1">
		<div class="modal-card glass prism-border forensics">
			<header class="apk-head">
				<div>
					<div class="eyebrow">Forensics · Polyglot Source Inspector</div>
					<h2 class="apk-title">{item.title}</h2>
					<div class="forensics-meta mono">{item.summary}</div>
				</div>
				<button class="icon-btn" onclick={() => modal.set(null)} aria-label="Close"><Icon name="close" size={18} /></button>
			</header>

			<div class="forensics-grid">
				<div class="forensics-col">
					<div class="meta-block">
						<div class="eyebrow">Evidence</div>
						<dl class="meta-list">
							<div><dt>Type</dt><dd>{item.type}</dd></div>
							<div><dt>Captured</dt><dd>{new Date(item.ts).toLocaleString()}</dd></div>
							<div><dt>Payload</dt><dd class="payload">{JSON.stringify(item.payload ?? {}, null, 2)}</dd></div>
						</dl>
					</div>
					<div class="meta-block">
						<div class="eyebrow">Polyglot Source Map</div>
						<ul class="files">
							{#each fileList as f, i (f)}
								<li>
									<button class="file-btn" class:active={i === fileIdx} onclick={() => pick(i)} type="button">
										<Icon name="file" size={12} /> {f}
									</button>
								</li>
							{/each}
						</ul>
					</div>
				</div>

				<div class="forensics-col">
					<pre class="src-code">{selectedFile.source}</pre>
					<div class="src-footer">
						<Chip tone="accent">{selectedFile.language}</Chip>
						<Chip tone="ok">{selectedFile.purpose}</Chip>
					</div>
				</div>
			</div>
		</div>
	</div>
{/if}

<style>
	.forensics { max-width: 1080px; }
	.apk-head {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		padding: 1.05rem 1.15rem 0.45rem;
	}
	.apk-title { margin: 0.15rem 0 0.2rem; font-size: 1.35rem; font-weight: 900; letter-spacing: 0.04em; text-transform: uppercase; }
	.forensics-meta { font-size: 0.68rem; color: var(--muted); letter-spacing: 0.08em; }
	.forensics-grid {
		display: grid;
		grid-template-columns: minmax(260px, 1fr) 1.6fr;
		gap: 0.9rem;
		padding: 0 1.15rem 1.15rem;
	}
	.forensics-col { min-width: 0; display: flex; flex-direction: column; gap: 0.8rem; }
	.meta-block {
		border: 1px solid var(--border);
		border-radius: 14px;
		padding: 0.75rem 0.85rem;
		background: var(--panel-2);
	}
	.meta-list { display: flex; flex-direction: column; gap: 0.4rem; }
	.meta-list div { display: flex; flex-direction: column; gap: 0.12rem; padding: 0.28rem 0; border-bottom: 1px dashed var(--border); }
	.meta-list div:last-child { border-bottom: 0; }
	.meta-list dt { font-size: 0.56rem; letter-spacing: 0.18em; text-transform: uppercase; color: var(--muted); }
	.meta-list dd { margin: 0; font-size: 0.78rem; font-weight: 600; word-break: break-word; }
	.payload {
		font-family: 'JetBrains Mono', ui-monospace, monospace;
		font-size: 0.62rem;
		color: var(--accent);
		max-height: 180px;
		overflow: auto;
		line-height: 1.4;
	}
	.files { list-style: none; display: flex; flex-direction: column; gap: 0.3rem; padding: 0; margin: 0; }
	.file-btn {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		width: 100%;
		border: 1px solid var(--border);
		background: transparent;
		color: var(--muted);
		padding: 0.4rem 0.55rem;
		border-radius: 10px;
		cursor: pointer;
		font-family: inherit;
		font-size: 0.7rem;
		text-align: left;
		transition: all 0.16s ease;
	}
	.file-btn:hover { color: var(--text); border-color: var(--accent); }
	.file-btn.active { color: var(--accent); border-color: var(--accent); background: rgba(34,211,238,0.08); }
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
	.src-footer { display: flex; flex-wrap: wrap; gap: 0.35rem; margin-top: 0.5rem; }
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
		.forensics-grid { grid-template-columns: 1fr; }
	}
</style>
