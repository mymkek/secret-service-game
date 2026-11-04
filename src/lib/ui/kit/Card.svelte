<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLAttributes } from 'svelte/elements';

	type Props = HTMLAttributes<HTMLElement> & {
		/** Уровень возвышения: 1 — утопленный, 2 — обычная карточка, 3 — приподнятая. */
		level?: 1 | 2 | 3;
		as?: 'div' | 'section' | 'article' | 'li';
		padded?: boolean;
		children: Snippet;
	};
	let { level = 2, as = 'div', padded = true, class: cls = '', children, ...rest }: Props = $props();

	const base = $derived(
		{
			1: 'rounded-2xl border border-white/[0.04] bg-surface-1 shadow-[inset_0_2px_6px_rgb(0_0_0/0.35)]',
			2: 'rounded-card border border-white/[0.06] bg-surface-2 shadow-elev-2',
			3: 'rounded-card border border-white/10 bg-surface-3 shadow-elev-3'
		}[level]
	);
</script>

<svelte:element this={as} class="{base} {padded ? 'p-4' : ''} {cls}" {...rest}>{@render children()}</svelte:element>
