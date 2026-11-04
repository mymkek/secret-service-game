<script lang="ts">
	import type { CaseView } from '../game/index';
	import { game } from './game.svelte';
	import { caseText, stateName } from './content';
	import OpForm from './OpForm.svelte';
	import { Button, Chip } from './kit';
	import { CASE_TAG } from './labels';
	import { confirmAction } from './confirm.svelte';
	import { interceptInfo } from './action-info';
	import { perform } from './perform';

	let { c, showState = false }: { c: CaseView; showState?: boolean } = $props();

	let open = $state(false);
	const t = $derived(caseText(c));

	// Взятое в работу дело больше не сгорает: вместо срока дела показываем, сколько осталось операции.
	const opDaysLeft = $derived.by(() => {
		if (c.takenByOpId === null || !game.s) return null;
		const op = game.s.operations.find((o) => o.id === c.takenByOpId);
		return op ? Math.max(0, op.endDay - game.s.day) : null;
	});

	const status = $derived(
		c.takenByOpId !== null ? 'Дело ведёт ваша команда' : c.accessible ? 'Доступно' : c.interceptable ? 'Нет полномочий (можно перехватить)' : 'Недоступно'
	);
</script>

<div class="card-1" data-case={c.id}>
	<div class="flex items-start justify-between gap-2">
		<div>
			<div class="text-base font-bold {c.kind === 'terror' ? 'text-danger' : ''}">{t.title}{showState ? ` — ${stateName(c.stateId)}` : ''}</div>
			<div class="text-xs text-muted">{t.description}</div>
			{#if c.tag}<Chip class="mt-1" tone={CASE_TAG[c.tag].tone} title={CASE_TAG[c.tag].hint}>{CASE_TAG[c.tag].label}</Chip>{/if}
		</div>
		<div class="text-right text-xs whitespace-nowrap">
			<div>Сложность {c.difficulty}</div>
			{#if c.takenByOpId !== null}
				<div class="text-ok" title="Сколько дней осталось до завершения операции">{opDaysLeft !== null ? `итог через ${opDaysLeft} дн.` : 'в работе'}</div>
			{:else}
				<div class={c.daysLeft !== null && c.daysLeft <= 7 ? 'text-warn' : 'text-muted'} title="Через столько дней дело уйдёт конкуренту">
					{c.daysLeft !== null ? `сгорит через ${c.daysLeft} дн.` : 'без срока'}
				</div>
			{/if}
		</div>
	</div>
	<div class="mt-1 flex items-center justify-between gap-2 text-xs">
		<span class="text-muted">{status}{c.rewardMult !== 1 ? ` · награда ×${c.rewardMult}` : ''}{c.minCyber > 0 ? ` · Кибер ≥ ${c.minCyber}` : ''}</span>
		<span class="flex gap-1">
			{#if c.interceptable}
				<Button size="sm" onclick={() => confirmAction.ask(interceptInfo(), () => perform({ type: 'intercept', caseId: c.id }))}>Перехватить</Button>
			{/if}
			{#if c.accessible && c.takenByOpId === null}
				<Button variant="primary" size="sm" aria-expanded={open} onclick={() => (open = !open)}>{open ? 'Свернуть' : 'Назначить'}</Button>
			{/if}
		</span>
	</div>
	{#if open}
		<div class="mt-2 border-t border-white/10 pt-2">
			<OpForm opType={c.kind === 'terror' ? 'terror' : 'investigation'} caseId={c.id} />
		</div>
	{/if}
</div>
