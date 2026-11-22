<script>
	let { title = '', kicker = '', actions = undefined, children, class: cls = '' } = $props();
</script>

<section class="card glass prism-border {cls}">
	{#if kicker || title || actions}
		<header class="card-head">
			<div>
				{#if kicker}<div class="eyebrow">{kicker}</div>{/if}
				{#if title}<h3 class="card-title">{title}</h3>{/if}
			</div>
			{#if actions}<div class="card-actions">{@render actions()}</div>{/if}
		</header>
	{/if}
	<div class="card-body">{@render children()}</div>
</section>

<style>
	.card {
		padding: 1.1rem 1.15rem 1.05rem;
	}
	.card-head {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 0.75rem;
		margin-bottom: 0.6rem;
	}
	.card-title {
		margin: 0.22rem 0 0;
		font-size: 0.95rem;
		font-weight: 800;
		letter-spacing: 0.05em;
		text-transform: uppercase;
		color: var(--text);
	}
	.card-actions {
		display: flex;
		align-items: center;
		gap: 0.35rem;
		flex-wrap: wrap;
	}
</style>
