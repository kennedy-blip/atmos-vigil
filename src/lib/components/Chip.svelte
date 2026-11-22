<script>
	let { children, tone = 'accent' } = $props();
</script>

<span class="chip chip-{tone}">{@render children()}</span>
