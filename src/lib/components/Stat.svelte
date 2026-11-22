<script>
	let { label, value, unit = '', tone = 'accent', small = false } = $props();
</script>

<div class="stat {tone}" class:small>
	{#if label}<div class="stat-label">{label}</div>{/if}
	<div class="stat-value">
		<span class="num display-num">{value}</span>
		{#if unit}<span class="unit">{unit}</span>{/if}
	</div>
</div>

<style>
	.stat {
		display: flex;
		flex-direction: column;
		gap: 0.18rem;
		min-width: 0;
	}
	.stat.small .stat-label { font-size: 0.56rem; }
	.stat.small .num { font-size: 1.25rem; }
	.stat-label {
		font-size: 0.6rem;
		letter-spacing: 0.16em;
		text-transform: uppercase;
		color: var(--muted);
		font-weight: 700;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.stat-value {
		display: flex;
		align-items: baseline;
		gap: 0.3rem;
		min-width: 0;
	}
	.num { font-size: 1.6rem; color: var(--text); }
	.stat.accent .num { color: var(--accent); }
	.stat.warn .num { color: var(--warn); }
	.stat.danger .num { color: var(--danger); }
	.stat.ok .num { color: var(--ok); }
	.unit {
		font-size: 0.66rem;
		color: var(--muted);
		text-transform: uppercase;
		letter-spacing: 0.06em;
	}
</style>
