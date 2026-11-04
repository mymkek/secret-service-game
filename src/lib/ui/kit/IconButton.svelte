<script lang="ts">
	import type { HTMLButtonAttributes } from 'svelte/elements';
	import Icon from './Icon.svelte';
	import type { IconName } from './icons';

	type Props = Omit<HTMLButtonAttributes, 'children' | 'aria-label'> & {
		icon: IconName;
		/** Обязательная подпись для скринридеров и подсказки. */
		label: string;
		variant?: 'secondary' | 'gold' | 'ghost' | 'danger';
		size?: 'sm' | 'md' | 'lg';
	};
	let { icon, label, variant = 'secondary', size = 'md', class: cls = '', ...rest }: Props = $props();

	const v = $derived({ gold: 'btn-gold', secondary: '', ghost: 'btn-ghost', danger: 'btn-danger' }[variant]);
	const dim = $derived({ sm: 'size-8', md: 'size-10', lg: 'size-12' }[size]);
	const px = $derived({ sm: 16, md: 20, lg: 24 }[size]);
</script>

<button type="button" class="btn {v} {dim} !min-h-0 !p-0 {cls}" aria-label={label} title={label} {...rest}>
	<Icon name={icon} size={px} />
</button>
