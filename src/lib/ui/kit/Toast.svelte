<script lang="ts">
	import Icon from './Icon.svelte';
	import Chip from './Chip.svelte';
	import type { IconName } from './icons';

	interface RichChip {
		text: string;
		tone: 'ok' | 'warn' | 'danger' | 'default';
	}

	let {
		kind = 'info',
		text,
		href,
		title,
		detail,
		chips = [],
		lost = [],
		onclose,
		onhold
	}: {
		kind?: 'info' | 'success' | 'error' | 'warn';
		/** Короткий текст; если задан title, показывается только скринридерам и как подсказка. */
		text: string;
		href?: string;
		/** Богатый вариант: заголовок, строка-развязка и чипы изменений. */
		title?: string;
		detail?: string;
		chips?: RichChip[];
		lost?: string[];
		onclose: () => void;
		/** Курсор или фокус на уведомлении: таймер закрытия ставится на паузу. */
		onhold?: (hold: boolean) => void;
	} = $props();

	const TONES: Record<string, { icon: IconName; circle: string; ring: string }> = {
		info: { icon: 'bell', circle: 'bg-grad-blue', ring: 'border-white/10' },
		success: { icon: 'success', circle: 'bg-grad-green', ring: 'border-ok/40' },
		error: { icon: 'fail', circle: 'bg-grad-coral', ring: 'border-danger/50' },
		warn: { icon: 'warning', circle: 'bg-grad-amber', ring: 'border-warn/50' }
	};
	const t = $derived(TONES[kind] ?? TONES.info);
	const cls = $derived(`pointer-events-auto flex items-start gap-3 rounded-2xl border bg-surface-3 py-3 pr-4 pl-3 text-left text-sm shadow-elev-3 transition hover:brightness-125 ${t.ring}`);
</script>

{#snippet body()}
	<span class="flex size-10 shrink-0 items-center justify-center rounded-full text-white shadow-elev-1 {t.circle}"><Icon name={t.icon} size={22} /></span>
	<span class="min-w-0 flex-1">
		{#if title}
			<span class="block font-protocol text-base leading-tight font-bold">{title}</span>
			{#if detail}<span class="mt-1 block text-muted italic">{detail}</span>{/if}
			{#if chips.length || lost.length}
				<span class="mt-2 flex flex-wrap gap-1">
					{#each chips as c (c.text)}<Chip tone={c.tone}>{c.text}</Chip>{/each}
					{#each lost as l (l)}<Chip tone="danger">{l}</Chip>{/each}
				</span>
			{/if}
		{:else}
			{text}
		{/if}
		{#if href}<span class="mt-1 flex items-center gap-1 text-xs text-muted">открыть <Icon name="arrow" size={14} /></span>{/if}
	</span>
{/snippet}

<!-- Клик закрывает уведомление; если есть адрес, ещё и переходит по нему. -->
{#if href}
	<a {href} class={cls} onclick={onclose} onmouseenter={() => onhold?.(true)} onmouseleave={() => onhold?.(false)} onfocus={() => onhold?.(true)} onblur={() => onhold?.(false)}>{@render body()}</a>
{:else}
	<button type="button" class={cls} onclick={onclose} onmouseenter={() => onhold?.(true)} onmouseleave={() => onhold?.(false)} onfocus={() => onhold?.(true)} onblur={() => onhold?.(false)}>{@render body()}</button>
{/if}
