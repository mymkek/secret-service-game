<script lang="ts">
	import { selectCredit, selectForecast, selectResources } from '../game/index';
	import { game, fmtMoney } from './game.svelte';
	import { StatTile, ProgressBar, Icon } from './kit';

	const r = $derived(game.s ? selectResources(game.s) : null);
	const cr = $derived(game.s ? selectCredit(game.s) : null);
	const f = $derived(game.s ? selectForecast(game.s) : null);
</script>

{#if r && f && cr}
	<section aria-label="Ресурсы" class="grid grid-cols-2 gap-3 px-6 py-3 lg:grid-cols-4">
		<StatTile icon="money" tone="gold" label="Бюджет" value={fmtMoney(r.budget)} title="Прогноз на конец месяца: доход {Math.round(f.income)}, расходы {Math.round(f.expenses.total)}">
			<div class="text-xs tabular-nums {f.net < 0 ? 'text-danger' : 'text-ok'}">{f.net >= 0 ? '+' : ''}{Math.round(f.net)} / мес</div>
			<div class="text-xs tabular-nums {cr.debt > 0 ? 'text-warn' : 'text-muted'}" title="Кредит на операции: уход в минус не больше месячного дохода, {Math.round(cr.interestRate * 100)}% в месяц. Следующие проценты: {cr.nextInterest} k$">
				Кредит: лимит {Math.round(cr.limit)}{cr.debt > 0 ? `, долг ${Math.round(cr.debt)} (проценты ${cr.nextInterest})` : ''}
			</div>
			{#if game.s && cr.debt > 0 && game.s.budget <= cr.hardFloor * 0.6}
				<div class="text-xs font-bold text-danger" role="alert">Долг приближается к {Math.round(cr.hardFloor)} k$: при таком долге банкротство наступит сразу!</div>
			{/if}
			{#if cr.bankruptGraceMonthsLeft > 0}
				<div class="text-xs text-ok">Фора новичка: ещё {cr.bankruptGraceMonthsLeft} мес.</div>
			{:else if cr.bankruptStreak > 0}
				<div class="text-xs font-bold {cr.bankruptStreak + 1 >= cr.bankruptMonths ? 'text-danger' : 'text-warn'}" role="alert">В минусе {cr.bankruptStreak} из {cr.bankruptMonths} мес. подряд: банкротство!</div>
			{/if}
		</StatTile>
		<!-- Значение budget дублируется для тестов: data-testid висит на самом числе ниже. -->
		<span class="sr-only" data-testid="budget">{fmtMoney(r.budget)}</span>

		{#snippet meter(icon: 'reputation' | 'influence' | 'exposure' | 'investigation' | 'control' | 'unrest', tone: 'blue' | 'green' | 'amber' | 'coral' | 'violet', barTone: 'ok' | 'fbi' | 'warn' | 'danger' | 'violet', label: string, v: number, hint: string)}
			<StatTile {icon} {tone} {label} value={v} title={hint}>
				<ProgressBar class="mt-1.5" {label} value={v} tone={barTone} height="h-2" />
			</StatTile>
		{/snippet}
		{@render meter('reputation', 'green', 'ok', 'Репутация', r.reputation, 'Репутация ведомства')}
		{@render meter('influence', 'blue', 'fbi', 'Влияние', r.influence, 'Влияние в Вашингтоне')}
		{@render meter('exposure', r.exposure >= 40 ? 'coral' : 'amber', r.exposure >= 40 ? 'danger' : 'warn', 'Засвеченность', r.exposure, `Шанс скандала в месяц: ${Math.round(r.scandalChance * 100)}%`)}
		{@render meter('investigation', r.investigation >= 50 ? 'coral' : 'amber', r.investigation >= 50 ? 'danger' : 'warn', 'Следствие', r.investigation, 'Уровень «Под следствием»')}
		{@render meter('control', 'violet', 'violet', 'Контроль', r.control, 'Контроль над обществом')}
		{@render meter('unrest', r.unrest >= 50 ? 'coral' : 'amber', r.unrest >= 50 ? 'danger' : 'warn', 'Недовольство', r.unrest, 'Недовольство общества')}

		<StatTile icon="agent" tone="slate" label="Агенты" value="{r.agents}/{r.agentCap}">
			<div class="mt-0.5 space-y-0.5 text-xs">
				<div class="flex justify-between gap-2"><span class="inline-flex items-center gap-1 text-muted"><Icon name="kompromat" size={14} />Компромат</span><span class="font-bold tabular-nums">{r.kompromat}</span></div>
				<div class="flex justify-between gap-2" title="Доля бюджетного пула"><span class="text-muted">Доля</span><span class="font-bold tabular-nums">{Math.round(r.share * 100)}%</span></div>
				<div class="flex justify-between gap-2" title="Очки плана квартала (фальшивые: {r.plan.fakePoints})">
					<span class="inline-flex items-center gap-1 text-muted"><Icon name="plan" size={14} />План Q{r.plan.quarter}</span>
					<span class="font-bold tabular-nums">{Math.round((r.plan.points + r.plan.fakePoints) * 10) / 10}/{r.plan.target}</span>
				</div>
			</div>
		</StatTile>
	</section>
{/if}
