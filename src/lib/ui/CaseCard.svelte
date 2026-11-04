<script lang="ts">
	import type { CaseView } from '../game/index';
	import { game } from './game.svelte';
	import { caseText, stateName } from './content';
	import OpForm from './OpForm.svelte';

	let { c, showState = false }: { c: CaseView; showState?: boolean } = $props();

	let open = $state(false);
	const t = $derived(caseText(c));

	const status = $derived(
		c.takenByOpId !== null ? 'Дело ведёт ваша команда' : c.accessible ? 'Доступно' : c.interceptable ? 'Нет полномочий (можно перехватить)' : 'Недоступно'
	);
</script>

<div class="rounded border border-line bg-bg p-2" data-case={c.id}>
	<div class="flex items-start justify-between gap-2">
		<div>
			<div class="text-sm font-medium {c.kind === 'terror' ? 'text-danger' : ''}">{t.title}{showState ? ` — ${stateName(c.stateId)}` : ''}</div>
			<div class="text-xs text-muted">{t.description}</div>
		</div>
		<div class="text-right text-xs whitespace-nowrap">
			<div>Сложность {c.difficulty}</div>
			<div class={c.daysLeft !== null && c.daysLeft <= 7 ? 'text-warn' : 'text-muted'}>{c.daysLeft !== null ? `${c.daysLeft} дн.` : 'без срока'}</div>
		</div>
	</div>
	<div class="mt-1 flex items-center justify-between gap-2 text-xs">
		<span class="text-muted">{status}{c.rewardMult !== 1 ? ` · награда ×${c.rewardMult}` : ''}{c.minCyber > 0 ? ` · Кибер ≥ ${c.minCyber}` : ''}</span>
		<span class="flex gap-1">
			{#if c.interceptable}
				<button class="btn px-2 py-0.5 text-xs" onclick={() => game.act({ type: 'intercept', caseId: c.id }, 'Попытка перехвата дела')}>Перехватить</button>
			{/if}
			{#if c.accessible && c.takenByOpId === null}
				<button class="btn btn-gold px-2 py-0.5 text-xs" aria-expanded={open} onclick={() => (open = !open)}>{open ? 'Свернуть' : 'Назначить'}</button>
			{/if}
		</span>
	</div>
	{#if open}
		<div class="mt-2 border-t border-line pt-2">
			<OpForm opType={c.kind === 'terror' ? 'terror' : 'investigation'} caseId={c.id} />
		</div>
	{/if}
</div>
