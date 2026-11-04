<script lang="ts">
	import { ICONS, type IconName } from './icons';

	let { name, size = 24, stroke = 1.9, class: cls = '', label }: { name: IconName; size?: number; stroke?: number; class?: string; label?: string } = $props();
</script>

<svg
	width={size}
	height={size}
	viewBox="0 0 24 24"
	fill="none"
	stroke="currentColor"
	stroke-width={stroke}
	stroke-linecap="round"
	stroke-linejoin="round"
	class="shrink-0 {cls}"
	role={label ? 'img' : undefined}
	aria-label={label}
	aria-hidden={label ? undefined : 'true'}
>
	{@html ICONS[name]}
</svg>
