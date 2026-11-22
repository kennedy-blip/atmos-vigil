<script>
	let { label, value = 0, min = 0, max = 100, step = 1, unit = '', onchange = () => {}, accent = 'accent' } = $props();
	let raw = $state(String(value));
	// keep external value in sync
	$effect(() => {
		raw = String(value);
	});
	const pick = (e) => {
		raw = e.target.value;
		onchange(Number(raw));
	};
</script>

<label class="slider-row">
	<span class="slider-label">
		<span>{label}</span>
		<span class="slider-val mono">{raw}{unit}</span>
	</span>
	<input type="range" {min} {max} {step} bind:value={raw} oninput={pick} />
</label>

<style>
	.slider-row {
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
	}
	.slider-label {
		display: flex;
		justify-content: space-between;
		align-items: center;
		font-size: 0.72rem;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--muted);
		font-weight: 700;
	}
	.slider-val { color: var(--accent); font-size: 0.82rem; }
</style>
