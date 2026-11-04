<script lang="ts">
	import { selectCredit, selectForecast, selectResources } from '../game/index';
	import { game, fmtMoney } from './game.svelte';
	import Bar from './Bar.svelte';

	const r = $derived(game.s ? selectResources(game.s) : null);
	const cr = $derived(game.s ? selectCredit(game.s) : null);
	const f = $derived(game.s ? selectForecast(game.s) : null);
</script>

{#if r && f && cr}
	<section aria-label="Ресурсы" class="grid grid-cols-2 gap-x-4 gap-y-2 border-b border-line bg-panel px-4 py-2 md:grid-cols-4 xl:grid-cols-8">
		<div title="Прогноз на конец месяца: доход {Math.round(f.income)}, расходы {Math.round(f.expenses.total)}">
			<div class="text-xs text-muted">Бюджет</div>
			<div class="font-semibold tabular-nums {r.budget < 0 ? 'text-danger' : 'text-gold'}" data-testid="budget">{fmtMoney(r.budget)}</div>
			<div class="text-xs tabular-nums {f.net < 0 ? 'text-danger' : 'text-ok'}">{f.net >= 0 ? '+' : ''}{Math.round(f.net)} / мес</div>
			<div class="text-[11px] tabular-nums {cr.debt > 0 ? 'text-warn' : 'text-muted'}" title="Кредит на операции: уход в минус не больше месячного дохода, {Math.round(cr.interestRate * 100)}% в месяц. Следующие проценты: {cr.nextInterest} k$">
				Кредит: лимит {Math.round(cr.limit)}{cr.debt > 0 ? `, долг ${Math.round(cr.debt)} (проценты ${cr.nextInterest})` : ''}
			</div>
			{#if game.s && cr.debt > 0 && game.s.budget <= cr.hardFloor * 0.6}
				<div class="text-[11px] font-semibold text-danger" role="alert">Долг приближается к {Math.round(cr.hardFloor)} k$: при таком долге банкротство наступит сразу!</div>
			{/if}
			{#if cr.bankruptGraceMonthsLeft > 0}
				<div class="text-[11px] text-ok">Фора новичка: ещё {cr.bankruptGraceMonthsLeft} мес.</div>
			{:else if cr.bankruptStreak > 0}
				<div class="text-[11px] font-semibold {cr.bankruptStreak + 1 >= cr.bankruptMonths ? 'text-danger' : 'text-warn'}" role="alert">В минусе {cr.bankruptStreak} из {cr.bankruptMonths} мес. подряд: банкротство!</div>
			{/if}
		</div>
		<Bar label="Репутация" value={r.reputation} tone="ok" hint="Репутация ведомства" />
		<Bar label="Влияние" value={r.influence} tone="fbi" hint="Влияние в Вашингтоне" />
		<Bar label="Засвеченность" value={r.exposure} tone={r.exposure >= 40 ? 'danger' : 'warn'} hint="Шанс скандала в месяц: {Math.round(r.scandalChance * 100)}%" />
		<Bar label="Следствие" value={r.investigation} tone={r.investigation >= 50 ? 'danger' : 'warn'} hint="Уровень «Под следствием»" />
		<Bar label="Контроль" value={r.control} tone="fbi" hint="Контроль над обществом" />
		<Bar label="Недовольство" value={r.unrest} tone={r.unrest >= 50 ? 'danger' : 'warn'} hint="Недовольство общества" />
		<div class="text-xs">
			<div class="flex justify-between"><span class="text-muted">Агенты</span><span class="font-semibold tabular-nums">{r.agents}/{r.agentCap}</span></div>
			<div class="flex justify-between"><span class="text-muted">Компромат</span><span class="font-semibold tabular-nums">{r.kompromat}</span></div>
			<div class="flex justify-between" title="Доля бюджетного пула"><span class="text-muted">Доля</span><span class="font-semibold tabular-nums">{Math.round(r.share * 100)}%</span></div>
			<div class="flex justify-between" title="Очки плана квартала (фальшивые: {r.plan.fakePoints})">
				<span class="text-muted">План Q{r.plan.quarter}</span>
				<span class="font-semibold tabular-nums">{Math.round((r.plan.points + r.plan.fakePoints) * 10) / 10}/{r.plan.target}</span>
			</div>
		</div>
	</section>
{/if}
