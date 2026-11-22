<script>
	let { pushed = false, mobile = false, children } = $props();
</script>

<div class="shell depth-push" class:pushed class:mobile>
	{@render children()}
</div>

<style>
	.shell {
		position: relative;
		z-index: 10;
		min-height: 100vh;
		display: flex;
		flex-direction: column;
		will-change: transform;
		transition: transform 0.55s cubic-bezier(0.34, 1.35, 0.64, 1), filter 0.55s ease, border-radius 0.55s ease, opacity 0.55s ease;
	}
	.shell.pushed {
		transform: scale(0.94);
		filter: blur(10px) saturate(0.7);
		border-radius: 28px;
	}
	.shell.mobile {
		max-width: 440px;
		margin: 0 auto;
		min-height: 100vh;
		background: linear-gradient(180deg, var(--base-2), var(--base));
		border-inline: 1px solid var(--border);
		border-radius: 38px 38px 0 0;
		box-shadow: 0 30px 80px -30px rgba(0, 0, 0, 0.9);
		overflow: hidden;
	}
	.shell.mobile.pushed {
		border-radius: 26px;
	}
</style>
