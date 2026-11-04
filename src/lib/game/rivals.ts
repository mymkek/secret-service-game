// Состояние соперников (§6.1, §6.6): дрейф, квартальный план, выбытие.
import { BALANCE as B } from './balance';
import { rivalPlanRatio } from './formulas';
import { addRivalRep, aliveRivals, log, setIdle } from './effects';
import { randFloat } from './rng';
import type { GameState, Rival, RivalId } from './types';

/** Ежемесячный дрейф к стартовым значениям (§6.1). */
export function rivalMonthlyDrift(s: GameState): void {
	for (const r of aliveRivals(s)) {
		const st = B.RIVAL_START[r.id];
		addRivalRep(r, B.RIVAL_MEAN_REVERT * (st.rep - r.reputation));
		r.influence += B.RIVAL_MEAN_REVERT * (st.infl - r.influence);
	}
}

/** План соперников за квартал (§6.2): по одному randFloat на живого соперника. */
export function rivalQuarterPlans(s: GameState): void {
	for (const r of aliveRivals(s)) {
		const spread = B.RIVAL_PLAN_SPREAD[r.id];
		const rnd = randFloat(s, -spread, spread);
		r.planRatio = rivalPlanRatio(B.RIVAL_PLAN_MEAN[r.id], rnd, r.planBonusThisQuarter);
		r.planBonusThisQuarter = 0;
	}
}

export function addRivalPlan(r: Rival, delta: number): void {
	r.planBonusThisQuarter += delta;
}

/**
 * Выбытие соперника (расформирование или поглощение, §6.6).
 * D-043 (одинаково для расформирования и поглощения): держатель снимается; где у игрока
 * уровень ≥ 1 — он становится 2, где 0 — остаётся 0.
 */
export function removeRival(s: GameState, id: RivalId, absorbed: boolean): void {
	const r = s.rivals.find((x) => x.id === id);
	if (!r || !r.alive) return;
	r.alive = false;
	r.absorbed = absorbed;
	r.share = 0;
	for (const j of Object.values(s.stateJurisdiction)) {
		if (j.holder !== id) continue;
		j.holder = null;
		if (j.level >= 1) j.level = 2;
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
 * §6.6: ведомство с репутацией ≤ 0 расформировывается. Как и поражение игрока по репутации,
 * это мгновенное условие: проверяется после каждого действия и в каждом дне до конца месяца,
 * то есть до дрейфа репутации (шаг 7.8), который иначе «вытаскивает» соперника из нуля.
 */
export function disbandZeroRepRivals(s: GameState): void {
	for (const r of s.rivals) if (r.alive && r.reputation <= 0) removeRival(s, r.id, false);
}
