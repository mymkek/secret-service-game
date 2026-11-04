<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLButtonAttributes } from 'svelte/elements';
	import Icon from './Icon.svelte';
	import type { IconName } from './icons';

	type Props = Omit<HTMLButtonAttributes, 'children'> & {
		variant?: 'primary' | 'gold' | 'secondary' | 'ghost' | 'danger';
		size?: 'sm' | 'md' | 'lg';
		icon?: IconName;
		href?: string;
		children?: Snippet;
	};
	let { variant = 'secondary', size = 'md', icon, href, class: cls = '', children, ...rest }: Props = $props();

	const v = $derived({ primary: 'btn-gold', gold: 'btn-gold', secondary: '', ghost: 'btn-ghost', danger: 'btn-danger' }[variant]);
	const s = $derived({ sm: 'btn-sm', md: '', lg: 'btn-lg' }[size]);
	const iconSize = $derived({ sm: 16, md: 20, lg: 24 }[size]);
</script>

{#if href}
	<a {href} class="btn {v} {s} {cls}" {...rest as object}>
		{#if icon}<Icon name={icon} size={iconSize} />{/if}{@render children?.()}
	</a>
{:else}
	<button type="button" class="btn {v} {s} {cls}" {...rest}>
		{#if icon}<Icon name={icon} size={iconSize} />{/if}{@render children?.()}
	</button>
{/if}
