<script lang="ts">
	import type { Snippet } from 'svelte';
	import Icon from './Icon.svelte';
	import type { IconName } from './icons';

	let {
		icon,
		label,
		value,
		tone = 'blue',
		title,
		children,
		class: cls = ''
	}: {
		icon: IconName;
		label: string;
		value: string | number;
		tone?: 'gold' | 'blue' | 'violet' | 'coral' | 'green' | 'amber' | 'slate';
		title?: string;
		/** Дополнительные строки под числом (прогноз, предупреждения). */
		children?: Snippet;
		class?: string;
	} = $props();

	const grad = $derived({ gold: 'bg-grad-gold', blue: 'bg-grad-blue', violet: 'bg-grad-violet', coral: 'bg-grad-coral', green: 'bg-grad-green', amber: 'bg-grad-amber', slate: 'bg-grad-slate' }[tone]);
</script>

<div class="flex min-w-0 items-start gap-3 rounded-2xl border border-white/[0.06] bg-surface-2 p-3 shadow-elev-1 {cls}" {title}>
	<span class="flex size-12 shrink-0 items-center justify-center rounded-2xl text-white shadow-elev-2 {grad}"><Icon name={icon} size={26} /></span>
	<div class="min-w-0 flex-1">
		<div class="truncate text-xs text-muted">{label}</div>
		<div class="text-xl leading-tight font-bold tabular-nums">{value}</div>
		{@render children?.()}
	</div>
</div>
