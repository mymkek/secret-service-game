<script lang="ts">
	import type { ActionCostView } from '../game/index';
	import { fmtMoney } from './game.svelte';
	import { errorText } from './labels';
	import type { ActionInfo } from './action-info';
	import { confirmAction } from './confirm.svelte';
	import Tooltip from './kit/Tooltip.svelte';

	let { label, v, onclick, info }: { label: string; v: ActionCostView; onclick: () => void; info?: ActionInfo } = $props();

	const pct = (x: number) => `${Math.round(x * 100)}%`;
	const id = $props.id();

	// С описанием действие сначала открывает окно подтверждения (игра на паузе), без него выполняется сразу.
	function click() {
		if (info) confirmAction.ask(info, onclick);
		else onclick();
	}
</script>

{#snippet face()}
	<div class="flex flex-col gap-1">
		<button class="btn btn-sm" disabled={!!v.error} title={info ? undefined : errorText(v.error)} onclick={click}>{label}</button>
		<div class="px-1 text-xs leading-tight text-muted">
			{#if v.cost}{fmtMoney(v.cost)}{/if}
			{#if v.influence} · влияние −{v.influence}{/if}
			{#if v.readyInDays > 0} · откат {v.readyInDays} дн.{/if}
			{#if v.chance !== null} · шанс {pct(v.chance)}{/if}
			{#if v.risk !== null} · риск {pct(v.risk)}{/if}
		</div>
		{#if v.error}<div class="px-1 text-xs leading-tight text-warn">{errorText(v.error)}</div>{/if}
	</div>
{/snippet}

{#if info}
	<Tooltip id="tip-{id}" align="start" width="w-80" class="inline-block">
		{@render face()}
		{#snippet content()}
			<div class="mb-1 font-protocol text-base font-bold text-gold-bright">{info.title}</div>
			<p class="mb-2">{info.what}</p>
			{#if info.costs?.length}
				<div class="mb-0.5 font-bold text-gold">Цена</div>
				<ul class="mb-2 text-muted">{#each info.costs as c (c.label)}<li>{c.label}: <span class="text-ink">{c.value}</span></li>{/each}</ul>
			{/if}
			{#if info.risks?.length}
				<div class="mb-0.5 font-bold text-gold">Риск</div>
				<ul class="text-muted">{#each info.risks as r (r.label)}<li>{r.label}: <span class="text-ink">{r.value}</span></li>{/each}</ul>
			{/if}
			{#if info.dirty}<p class="mt-2 text-danger">Грязное действие</p>{/if}
		{/snippet}
	</Tooltip>
{:else}
	{@render face()}
{/if}
