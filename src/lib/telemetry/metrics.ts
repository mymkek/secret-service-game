// Метрики конца месяца для game_snapshots. Только чтение состояния через публичные селекторы ядра.
import { selectForecast, selectResources, selectRivals, type GameState } from '../game/index';

export function collectMetrics(s: GameState): Record<string, unknown> {
	const r = selectResources(s);
	const f = selectForecast(s);
	const depts: Record<string, number> = { ...s.departments };
	return {
		budget: r.budget,
		/** Доход последнего закрытого месяца и прогноз расходов на следующий. */
		income: s.lastIncome,
		expensesForecast: f.expenses.total,
		reputation: r.reputation,
		influence: r.influence,
		exposure: r.exposure,
		investigation: r.investigation,
		unrest: r.unrest,
		control: r.control,
		share: r.share,
		debt: r.debt,
		kompromat: r.kompromat,
		planQuarter: r.plan.quarter,
		planPoints: r.plan.points,
		planFake: r.plan.fakePoints,
		planTarget: r.plan.target,
		agents: r.agents,
		agentCap: r.agentCap,
		deptLevels: Object.values(depts).reduce((a, b) => a + b, 0),
		departments: depts,
		surv: s.survLevel,
		repr: s.reprLevel,
		rivals: selectRivals(s).map((x) => ({
			id: x.id,
			alive: x.alive,
			absorbed: x.absorbed,
			collapsing: x.collapsing,
			reputation: x.reputation,
			influence: x.influence,
			share: x.share
		}))
	};
}
