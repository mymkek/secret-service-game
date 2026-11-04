<script lang="ts">
	import { confirmAction } from '../../lib/ui/confirm.svelte';
	import { selectCases, selectResources,
		selectSenators, validateAction, type OpTarget } from '../../lib/game/index';
	import { senatorName } from '../../lib/ui/content';
	import { game } from '../../lib/ui/game.svelte';
	import CaseCard from '../../lib/ui/CaseCard.svelte';
	import OpForm from '../../lib/ui/OpForm.svelte';
	import OperationList from '../../lib/ui/OperationList.svelte';
	import CompletedCases from '../../lib/ui/CompletedCases.svelte';
	import LinePanel from '../../lib/ui/LinePanel.svelte';
	import { OP_LABEL, errorText, rivalName } from '../../lib/ui/labels';

	const cases = $derived(
		(game.s ? selectCases(game.s) : []).toSorted((a, b) => {
			if ((a.takenByOpId === null) !== (b.takenByOpId === null)) return a.takenByOpId === null ? -1 : 1;
			return (a.daysLeft ?? 1e9) - (b.daysLeft ?? 1e9);
		})
	);
	let onlyAvailable = $state(false);
	const shown = $derived(onlyAvailable ? cases.filter((c) => c.accessible && c.takenByOpId === null) : cases);

	// Операции по цели (внедрение, слежка)
	let tOp = $state<'infiltration' | 'surveillance'>('surveillance');
	let tKey = $state('');
	const targets = $derived.by(() => {
		const s = game.s;
		if (!s) return [] as { key: string; label: string; target: OpTarget }[];
		const out: { key: string; label: string; target: OpTarget }[] = [];
		for (const r of s.rivals) if (r.alive) out.push({ key: `rival:${r.id}`, label: rivalName(r.id), target: { kind: 'rival', id: r.id } });
		for (const l of s.leaders) out.push({ key: `leader:${l.id}`, label: `Лидер протеста #${l.id} (${l.stateId}, влияние ${Math.floor(l.influence)})`, target: { kind: 'leader', id: l.id } });
		for (const x of selectSenators(s)) out.push({ key: `senator:${x.id}`, label: `${senatorName(x.id)} (сложность слежки ${x.surveillanceDifficulty})`, target: { kind: 'senator', id: x.id } });
		out.push({ key: 'president', label: 'Президент', target: { kind: 'president' } });
		return out;
	});
	const chosen = $derived(targets.find((t) => t.key === tKey) ?? null);

	// Статистика плана
	const res = $derived(game.s ? selectResources(game.s) : null);
	let fake = $state(1);
	const fakeErr = $derived(game.s ? validateAction(game.s, { type: 'fakeStats', points: fake }) : null);
</script>

<div class="grid gap-4 xl:grid-cols-[minmax(0,1fr)_26rem]">
	<section class="card" aria-label="Дела">
		<div class="mb-2 flex items-center justify-between">
			<h2 class="h2 mb-0">Дела на карте ({shown.length})</h2>
			<label class="flex items-center gap-2 text-xs text-muted">
				<input type="checkbox" bind:checked={onlyAvailable} class="accent-[var(--color-gold)]" /> только доступные
			</label>
		</div>
		<div class="grid gap-2 lg:grid-cols-2">
			{#each shown as c (c.id)}<CaseCard {c} showState />{:else}
				<p class="text-sm text-muted">Дел нет.</p>
			{/each}
		</div>
	</section>

	<div class="space-y-4">
		<LinePanel />
		<section class="card" aria-label="Активные операции">
			<h2 class="h2">Активные операции</h2>
			<OperationList />
		</section>

		<section class="card space-y-2" aria-label="Операция по цели">
			<h2 class="h2">Операция по цели</h2>
			<div class="flex flex-wrap gap-2">
				<select bind:value={tOp} aria-label="Тип операции">
					<option value="surveillance">{OP_LABEL.surveillance}</option>
					<option value="infiltration">{OP_LABEL.infiltration}</option>
				</select>
				<select class="min-w-0 flex-1" bind:value={tKey} aria-label="Цель операции">
					<option value="">Выберите цель…</option>
					{#each targets as t (t.key)}<option value={t.key}>{t.label}</option>{/each}
				</select>
			</div>
			{#if chosen}
				{#key tOp + chosen.key}<OpForm opType={tOp} target={chosen.target} />{/key}
			{/if}
		</section>

		{#if res}
			<section class="card space-y-2" aria-label="План квартала">
				<h2 class="h2">План квартала</h2>
				<p class="text-sm">
					Очки: <strong class="tabular-nums">{Math.round(res.plan.points * 10) / 10}</strong> + фальшивые <strong class="tabular-nums">{res.plan.fakePoints}</strong> из
					<strong class="tabular-nums">{res.plan.target}</strong>
				</p>
				<div class="flex items-center gap-2">
					<label class="text-xs text-muted" for="fake-pts">Нарисовать очков (до {res.plan.fakeMax}):</label>
					<input id="fake-pts" type="number" min="1" bind:value={fake} class="w-20" />
					<button class="btn btn-danger text-xs" disabled={!!fakeErr} title={errorText(fakeErr)} onclick={() => confirmAction.ask({ title: 'Фальсификация статистики', what: `В отчёт плана добавляются фальшивые очки: ${fake}. Риск раскрытия растёт квадратично с накопленными фальшивками.`, costs: [{ label: 'Фальшивых очков', value: String(fake) }], risks: [{ label: 'Раскрытие', value: 'растёт с каждой фальшивкой', tone: 'danger' }], dirty: true, confirmLabel: 'Фальсифицировать', art: 'report' }, () => game.act({ type: 'fakeStats', points: fake }, 'Статистика «улучшена»'))}>Фальсифицировать</button>
				</div>
				<p class="text-xs text-muted">Риск раскрытия растёт квадратично с накопленными фальшивками.</p>
			</section>
		{/if}
	</div>
</div>

<div class="mt-6"><CompletedCases /></div>
