// Состояние соперников (§6.1, §6.6): дрейф, квартальный план, выбытие.
import { BALANCE as B } from './balance';
import { rivalPlanRatio } from './formulas';
import { activeRivals, addRivalRep, log, setIdle } from './effects';
import { randFloat } from './rng';
import type { GameState, Rival, RivalId } from './types';

/** Ежемесячный дрейф к стартовым значениям (§6.1). */
export function rivalMonthlyDrift(s: GameState): void {
	for (const r of activeRivals(s)) {
		const st = B.RIVAL_START[r.id];
		addRivalRep(r, B.RIVAL_MEAN_REVERT * (st.rep - r.reputation));
		r.influence += B.RIVAL_MEAN_REVERT * (st.infl - r.influence);
	}
}

/** План соперников за квартал (§6.2): по одному randFloat на живого соперника. */
export function rivalQuarterPlans(s: GameState): void {
	for (const r of activeRivals(s)) {
		const spread = B.RIVAL_PLAN_SPREAD[r.id];
		const rnd = randFloat(s, -spread, spread);
		r.planRatioPrev = r.planRatio;
		r.planRatio = rivalPlanRatio(B.RIVAL_PLAN_MEAN[r.id], rnd, r.planBonusThisQuarter);
		r.planBonusThisQuarter = 0;
	}
}

export function addRivalPlan(r: Rival, delta: number): void {
	r.planBonusThisQuarter += delta;
}

/**
 * Выбытие соперника (§6.6, D-059).
 * Держатель его штатов снимается. Расформирован: где у игрока уровень ≥ 1, он становится 2, где 0 — остаётся 0.
 * Поглощён: +1 уровень во всех его штатах (0 → 1, 1 → 2). Компромат выбывшего на игрока исчезает.
 */
export function removeRival(s: GameState, id: RivalId, absorbed: boolean): void {
	const r = s.rivals.find((x) => x.id === id);
	if (!r || !r.alive) return;
	r.alive = false;
	r.absorbed = absorbed;
	r.collapsing = false;
	r.share = 0;
	r.kompromatOnPlayer = 0;
	for (const j of Object.values(s.stateJurisdiction)) {
		if (j.holder !== id) continue;
		j.holder = null;
		if (absorbed) j.level = Math.min(2, j.level + 1);
		else if (j.level >= 1) j.level = 2;
	}
	// Внедрённые в это ведомство агенты возвращаются.
	for (const a of s.agents) {
		if (a.status === 'embedded' && a.location && 'rivalId' in a.location && a.location.rivalId === id) setIdle(a);
	}
	log(s, absorbed ? 'rival_absorbed' : 'rival_disbanded', { rivalId: id });
	// §6.6: «как только один ИИ выбыл» — коалиция сразу, а не в конце квартала.
	if (!s.coalition) {
		s.coalition = true;
		log(s, 'coalition_formed', {});
	}
}

/**
 * §6.6, D-059: ИИ, чья репутация достигла 0, получает статус «на грани» — репутация замирает на 0,
 * он не действует и не участвует в распределении. Проверяется после каждого действия и в каждом дне
 * до конца месяца, то есть до дрейфа (шаг 7.8). Выбывает в конце квартала (rivalsCollapseAtQuarterEnd).
 */
export function checkRivalCollapse(s: GameState): void {
	for (const r of s.rivals) {
		if (!r.alive || r.collapsing || r.reputation > 0) continue;
		r.collapsing = true;
		r.reputation = 0;
	}
}

/**
 * §6.6, D-059: конец квартала, до распределения. «На грани» расформировывается, если его сейчас
 * не поглощают; иначе ждёт исхода поглощения (провал — расформирован сразу, см. tickTasks).
 */
export function rivalsCollapseAtQuarterEnd(s: GameState): void {
	for (const r of s.rivals) {
		if (!r.alive || !r.collapsing) continue;
		const task = s.tasks.find((t) => t.kind === 'absorb' && t.rivalId === r.id);
		if (task) {
			task.disbandOnFail = true;
			continue;
		}
		removeRival(s, r.id, false);
	}
}

/** D-058: plan_ratio для веса — среднее за PLAN_RATIO_SMOOTHING_QUARTERS (поддерживаются 1 и 2). */
export function smoothedPlanRatio(current: number, previous: number): number {
	return B.PLAN_RATIO_SMOOTHING_QUARTERS >= 2 ? (current + previous) / 2 : current;
}
