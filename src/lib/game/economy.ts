// Деньги и план (§2.1, §5.5, §6.2): доход, расходы, распределение бюджета, итоги квартала.
import { BALANCE as B } from './balance';
import { agentSalary } from './agents';
import {
	agencyWeight,
	clawback,
	fakeCatchChance,
	monthlyIncome,
	planTarget,
	poolMonthly,
	quarterIndexOfMonth,
	shares
} from './formulas';
import {
	addBudget,
	addExposure,
	addInfluence,
	addInvestigation,
	addReputation,
	activeRivals,
	aliveRivals,
	autopause,
	defeat,
	isOver,
	log,
	month
} from './effects';
import { triggerHearings } from './quest-core';
import { removeRival, rivalQuarterPlans, rivalsCollapseAtQuarterEnd, smoothedPlanRatio } from './rivals';
import { roll } from './rng';
import type { AgencyId, GameState, Rival } from './types';

// ------------------------------------------------------------ распределение (§6.2)

function cardActive(s: GameState, id: string): boolean {
	return s.cards.active.some((c) => c.id === id && s.day < c.untilDay);
}

/**
 * Веса ведомств: сначала игрок, затем действующие соперники в фиксированном порядке.
 * «На грани» (D-059) не участвует. plan_ratio соперников сглажен (D-058); для игрока
 * сглаживание делает вызывающий (quarterEnd), сюда приходит уже готовое значение.
 */
export function distributionWeights(s: GameState, playerPlanRatio: number): { ids: AgencyId[]; weights: number[] } {
	const ids: AgencyId[] = ['player'];
	const weights: number[] = [
		agencyWeight({
			planRatio: playerPlanRatio,
			reputation: s.reputation,
			influence: s.influence,
			mult: s.hearingMult * s.priorityMult
		})
	];
	for (const r of activeRivals(s)) {
		let mult = r.lobbyMult * r.hearingMult * r.priorityMult;
		if (r.id === 'secret_service') mult *= B.SS_PRESIDENT_FAVOR;
		if (r.id === 'cia' && cardActive(s, 'diplomatic_crisis')) mult *= B.CARD_DIPLOMATIC_CRISIS.ciaWeightMult;
		ids.push(r.id);
		weights.push(agencyWeight({ planRatio: smoothedPlanRatio(r.planRatio, r.planRatioPrev), reputation: r.reputation, influence: r.influence, mult }));
	}
	return { ids, weights };
}

/** Пересчёт долей; игроку возвращает его новую долю. */
export function distribute(s: GameState, playerPlanRatio: number): number {
	const { ids, weights } = distributionWeights(s, playerPlanRatio);
	const sh = shares(weights);
	for (const r of s.rivals) if (r.alive && r.collapsing) r.share = 0;
	ids.forEach((id, i) => {
		if (id === 'player') s.share = sh[i];
		else {
			const r = s.rivals.find((x) => x.id === id);
			if (r) r.share = sh[i];
		}
	});
	return s.share;
}

/** ИИ с наибольшим весом в распределении прямо сейчас (карточка «Теракт», §7). */
export function topWeightRival(s: GameState): Rival | null {
	const { ids, weights } = distributionWeights(s, s.plan.ratioHistory.at(-1) ?? 1);
	let best: Rival | null = null;
	let bw = -Infinity;
	ids.forEach((id, i) => {
		if (id === 'player' || weights[i] <= bw) return;
		bw = weights[i];
		best = s.rivals.find((r) => r.id === id) ?? null;
	});
	return best;
}

/** Множитель дохода от активных карточек (произведение). */
export function incomeCardMult(s: GameState): number {
	let m = 1;
	for (const c of s.cards.active) {
		if (s.day >= c.untilDay) continue;
		const v = c.params.incomeMult;
		if (typeof v === 'number') m *= v;
	}
	return m;
}

export function incomeForMonth(s: GameState, m: number): number {
	return monthlyIncome(poolMonthly(quarterIndexOfMonth(m)), s.share, incomeCardMult(s), s.investigation);
}

export interface ExpenseBreakdown {
	salaries: number;
	hq: number;
	departments: number;
	surveillance: number;
	repression: number;
	total: number;
}

export function monthlyExpenses(s: GameState): ExpenseBreakdown {
	const salaries = s.agents.reduce((sum, a) => sum + agentSalary(a), 0);
	let deptLevels = 0;
	for (const v of Object.values(s.departments)) deptLevels += v;
	const departments = B.DEPT_UPKEEP_PER_LEVEL * deptLevels;
	const surveillance = B.SURV_UPKEEP_PER_LEVEL * s.survLevel;
	const repression = B.REPR_UPKEEP_PER_LEVEL * s.reprLevel;
	const hq = B.HQ_UPKEEP;
	return { salaries, hq, departments, surveillance, repression, total: salaries + hq + departments + surveillance + repression };
}

/**
 * Шаги 7.1–7.3 конца месяца. Возвращает, выплачены ли зарплаты (для лояльности).
 */
export function monthEndMoney(s: GameState): boolean {
	const m = month(s);
	const income = incomeForMonth(s, m);
	addBudget(s, income);
	s.lastIncome = income;
	const paid = s.budget >= 0;
	const exp = monthlyExpenses(s);
	addBudget(s, -exp.total);
	// §2.7, D-051: процент на долг сразу после расходов (шаг 7.2).
	const interest = s.budget < 0 ? Math.round(B.CREDIT_INTEREST_RATE * -s.budget) : 0;
	if (interest > 0) addBudget(s, -interest);
	log(s, 'month_money', { income, expenses: exp.total, interest, budget: s.budget, paid });
	// 7.3 счётчик банкротства (§8.6, D-060)
	if (s.budget < 0) {
		// Грейс: месяцы 1..BANKRUPT_GRACE_MONTHS в счётчик не идут.
		if (m > B.BANKRUPT_GRACE_MONTHS) s.counters.bankruptStreak += 1;
		if (!s.counters.firstNegativeBudgetSeen) {
			s.counters.firstNegativeBudgetSeen = true;
			autopause(s, 'firstNegativeBudget');
		}
		if (s.counters.bankruptStreak >= B.BANKRUPT_MONTHS) defeat(s, 'bankrupt');
		// Жёсткий порог долга — в любой месяц, без грейса.
		else if (s.budget < -B.BANKRUPT_HARD_FLOOR_MONTHS * s.lastIncome) defeat(s, 'bankrupt');
	} else s.counters.bankruptStreak = 0;
	return paid;
}

// ------------------------------------------------------------ план (§5.5)

export function computePlanTarget(s: GameState): number {
	return planTarget({
		agentsTotal: s.agents.length,
		control: s.control,
		reprLevel: s.reprLevel,
		cardMult: s.plan.nextTargetMult,
		quarter: s.plan.quarter
	});
}

/** Шаг 7.11: конец квартала. */
export function quarterEnd(s: GameState): void {
	const p = s.plan;
	const target = Math.max(1, p.target);
	const realRatio = p.points / target;
	let ratio = (p.points + p.fakePoints) / target;
	let caught = false;
	if (p.fakePoints > 0) {
		p.fakeTotal += p.fakePoints;
		if (roll(s, fakeCatchChance(p.fakeTotal))) {
			caught = true;
			ratio = realRatio;
			addReputation(s, B.FAKE_CAUGHT.reputation);
			addExposure(s, B.FAKE_CAUGHT.exposure);
			addInvestigation(s, B.FAKE_CAUGHT.investigation);
			log(s, 'fake_caught', { fakeTotal: p.fakeTotal });
		}
	}
	p.ratioHistory.push(realRatio);
	if (realRatio >= 1) p.metCount += 1;

	if (ratio >= 1) {
		addReputation(s, B.PLAN_OVER_REP);
		addInfluence(s, ratio >= B.PLAN_HIGH_RATIO ? B.PLAN_OVER_INFL_HIGH : B.PLAN_OVER_INFL);
	}
	if (ratio < B.PLAN_FAIL_RATIO) {
		addReputation(s, B.PLAN_FAIL_REP);
		triggerHearings(s, 'plan');
	}
	// §8.6, D-061: кварталы ≤ DISMISS_GRACE_QUARTERS не идут в счётчик dismissed (и предупреждение сдвигается);
	// штрафы за слабый план выше действуют и в грейс.
	if (p.quarter > B.DISMISS_GRACE_QUARTERS) {
		if (ratio < B.PLAN_CRITICAL_RATIO) p.criticalStreak += 1;
		else p.criticalStreak = 0;
		if (p.criticalStreak >= B.PLAN_CRITICAL_QUARTERS) defeat(s, 'dismissed');
		else if (p.criticalStreak === B.PLAN_CRITICAL_QUARTERS - 1) {
			log(s, 'plan_warning', { streak: p.criticalStreak });
			autopause(s, 'quarterReport');
		}
	}
	if (isOver(s)) return;

	// «На грани» выбывают до распределения (D-059), кроме тех, кого сейчас поглощают.
	rivalsCollapseAtQuarterEnd(s);

	// Распределение бюджета. В вес идёт сглаженный план (D-058), остальные правила — по текущему кварталу.
	rivalQuarterPlans(s);
	const m = month(s);
	const shareNew = distribute(s, smoothedPlanRatio(ratio, p.planRatioPrev));
	p.planRatioPrev = ratio;
	const taken = clawback(s.budget, poolMonthly(quarterIndexOfMonth(m + 1)), shareNew);
	if (taken > 0) addBudget(s, -taken);

	// Модификаторы на одно распределение сбрасываются.
	s.hearingMult = 1;
	for (const r of s.rivals) {
		r.lobbyMult = 1;
		r.hearingMult = 1;
	}

	// Расформирование (§6.6). Игрок: первые DISBAND_GRACE_QUARTERS распределений не считаются (D-060).
	if (p.quarter > B.DISBAND_GRACE_QUARTERS) {
		if (s.share < B.DISBAND_SHARE) s.counters.lowShareStreak += 1;
		else s.counters.lowShareStreak = 0;
	}
	for (const r of activeRivals(s)) {
		// D-052: у ИИ свой порог выбытия.
		if (r.share < B.RIVAL_DISBAND_SHARE) r.lowShareQuarters += 1;
		else r.lowShareQuarters = 0;
		if (r.lowShareQuarters >= B.DISBAND_QUARTERS) removeRival(s, r.id, false);
	}
	if (s.counters.lowShareStreak >= B.DISBAND_QUARTERS) defeat(s, 'disbanded');

	// Коалиция (§6.6).
	if (!s.coalition && (aliveRivals(s).length < s.rivals.length || s.share >= B.COALITION_SHARE)) {
		s.coalition = true;
		log(s, 'coalition_formed', {});
	}

	log(s, 'quarter_report', {
		quarter: p.quarter,
		points: p.points,
		fakePoints: p.fakePoints,
		target: p.target,
		ratio,
		realRatio,
		caught,
		share: s.share,
		clawback: taken
	});
	autopause(s, 'quarterReport');

	// Новый квартал: цель фиксируется по составу на этот момент.
	p.quarter += 1;
	p.points = 0;
	p.fakePoints = 0;
	p.target = computePlanTarget(s);
	p.nextTargetMult = 1;
}
