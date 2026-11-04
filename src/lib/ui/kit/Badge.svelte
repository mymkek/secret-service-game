<script lang="ts">
	/** Круглый счётчик (как красный счётчик новых дел). При hideZero и count = 0 ничего не рисует. */
	let { count, tone = 'danger', label, hideZero = true, class: cls = '' }: { count: number; tone?: 'danger' | 'gold' | 'ok' | 'info'; label?: string; hideZero?: boolean; class?: string } = $props();

	const color = $derived({ danger: 'bg-danger text-white', gold: 'bg-grad-gold text-[#1b1405]', ok: 'bg-ok text-white', info: 'bg-fbi text-white' }[tone]);
</script>

{#if !hideZero || count > 0}
	<span class="inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-xs leading-none font-bold shadow-elev-1 {color} {cls}" title={label} aria-label={label}>{count}</span>
{/if}
