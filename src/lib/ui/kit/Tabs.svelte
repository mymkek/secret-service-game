<script lang="ts" module>
	import type { IconName } from './icons';

	export interface TabItem {
		href: string;
		label: string;
		icon?: IconName;
		/** Значок-счётчик в углу вкладки. */
		badge?: number;
		badgeLabel?: string;
	}
</script>

<script lang="ts">
	import Icon from './Icon.svelte';

	let { items, isActive, label = 'Разделы', class: cls = '' }: { items: TabItem[]; isActive: (item: TabItem) => boolean; label?: string; class?: string } = $props();
</script>

<!-- Навигация пилюлями: каждая вкладка - ссылка. -->
<nav aria-label={label} class="flex flex-wrap gap-2 {cls}">
	{#each items as n (n.href)}
		{@const active = isActive(n)}
		<a
			href={n.href}
			aria-current={active ? 'page' : undefined}
			class="relative inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm transition-colors {active
				? 'border-gold/60 bg-gold/15 font-bold text-gold-bright shadow-elev-1'
				: 'border-transparent text-muted hover:bg-white/5 hover:text-ink'}"
		>
			{#if n.icon}<Icon name={n.icon} size={20} />{/if}{n.label}
			{#if n.badge && n.badge > 0}
				<span
					class="absolute -top-1.5 -right-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-danger px-1.5 text-xs leading-none font-bold text-white shadow-elev-1"
					title={n.badgeLabel}
					aria-label={n.badgeLabel}>{n.badge}</span
				>
			{/if}
		</a>
	{/each}
</nav>
