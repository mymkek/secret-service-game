<script lang="ts">
	import type { ActionCostView } from '../game/index';
	import { fmtMoney } from './game.svelte';
	import { errorText } from './labels';

	let { label, v, onclick }: { label: string; v: ActionCostView; onclick: () => void } = $props();

	const pct = (x: number) => `${Math.round(x * 100)}%`;
</script>

<div class="flex flex-col gap-0.5">
	<button class="btn px-2 py-0.5 text-xs" disabled={!!v.error} title={errorText(v.error)} {onclick}>{label}</button>
	<div class="px-1 text-[11px] leading-tight text-muted">
		{#if v.cost}{fmtMoney(v.cost)}{/if}
		{#if v.influence} · влияние −{v.influence}{/if}
		{#if v.readyInDays > 0} · откат {v.readyInDays} дн.{/if}
		{#if v.chance !== null} · шанс {pct(v.chance)}{/if}
		{#if v.risk !== null} · риск {pct(v.risk)}{/if}
	</div>
	{#if v.error}<div class="px-1 text-[11px] leading-tight text-warn">{errorText(v.error)}</div>{/if}
</div>
