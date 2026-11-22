<script>
	import { icons } from '../icons.js';
	/** @type {{name: string, size?: number, stroke?: number, class?: string, fill?: boolean}} */
	let { name, size = 20, stroke = 2, class: cls = '', fill = false } = $props();
	const paths = $derived(icons[name] ?? icons.wind);
</script>

<svg
	width={size}
	height={size}
	viewBox="0 0 24 24"
	class={cls}
	aria-hidden="true"
	fill={fill ? 'currentColor' : 'none'}
	stroke="currentColor"
	stroke-width={stroke}
	stroke-linecap="round"
	stroke-linejoin="round"
	stroke-miterlimit="2"
>
	{@html paths}
</svg>
