<script lang="ts">
	import type { Snippet } from 'svelte';

	let {
		id,
		side = 'top',
		align = 'end',
		width = 'w-96',
		class: cls = '',
		children,
		content
	}: {
		id: string;
		side?: 'top' | 'bottom';
		align?: 'start' | 'end';
		width?: string;
		class?: string;
		children: Snippet;
		content: Snippet;
	} = $props();
</script>

<!-- Подсказка по наведению и по фокусу внутри; содержимое связано с триггером через aria-describedby. -->
<div class="group relative {cls}" aria-describedby={id}>
	{@render children()}
	<div
		{id}
		role="tooltip"
		class="pointer-events-none absolute z-30 hidden {side === 'top' ? 'bottom-full mb-2' : 'top-full mt-2'} {align === 'end' ? 'right-0' : 'left-0'} {width} max-w-[90vw] rounded-2xl border border-white/10 bg-surface-3 p-4 text-sm shadow-elev-3 group-focus-within:block group-hover:block"
	>
		{@render content()}
	</div>
</div>
