<script lang="ts">
	import type { Snippet } from 'svelte';
	import Icon from './Icon.svelte';
	import type { IconName } from './icons';

	let { tone = 'default', icon, title, class: cls = '', children }: { tone?: 'default' | 'gold' | 'ok' | 'warn' | 'danger' | 'info'; icon?: IconName; title?: string; class?: string; children: Snippet } = $props();

	const color = $derived(
		{
			default: 'border-white/10 bg-white/[0.04] text-muted',
			gold: 'border-gold/50 bg-gold/10 text-gold-bright',
			ok: 'border-ok/50 bg-ok/10 text-ok',
			warn: 'border-warn/50 bg-warn/10 text-warn',
			danger: 'border-danger/50 bg-danger/10 text-danger',
			info: 'border-fbi/50 bg-fbi/10 text-police'
		}[tone]
	);
</script>

<span class="inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs {color} {cls}" {title}>
	{#if icon}<Icon name={icon} size={14} />{/if}{@render children()}
</span>
