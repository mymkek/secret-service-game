// Формулы ГДД как чистые функции: только аргументы → число. Ни RNG, ни состояния.
// По одной функции на формулу, со ссылкой на раздел docs/gdd.md.
import { BALANCE as B } from './balance';
import type { DeptKey, OpType, Rank, SkillKey, TechId } from './types';

export const clamp = (x: number, a: number, b: number): number => Math.min(b, Math.max(a, x));
export const round = (x: number): number => Math.round(x);
/** Индикатор [cond] (§0). */
export const ind = (c: boolean): number => (c ? 1 : 0);

// ---------------------------------------------------------------- §0 время

/** Месяц 1..60 для дня 1..1800 (§0). День 0 (старт) → месяц 1. */
export function monthOfDay(day: number): number {
	return Math.max(1, Math.ceil(day / B.DAYS_PER_MONTH));
}
/** Квартал Q = ceil(m / 3) (§0). */
export function quarterOfMonth(m: number): number {
	return Math.ceil(m / 3);
}
/** Индекс квартала q = Q − 1 (§0). */
export function quarterIndexOfMonth(m: number): number {
	return quarterOfMonth(m) - 1;
}
export function isMonthEnd(day: number): boolean {
	return day > 0 && day % B.DAYS_PER_MONTH === 0;
}
export function termDays(): number {
	return B.TERM_MONTHS * B.DAYS_PER_MONTH;
}
/** Длительность с множителем: ceil, минимум 1 день (§0). */
export function scaledDays(days: number, mult: number): number {
	return Math.max(1, Math.ceil(days * mult));
}

// ---------------------------------------------------------------- §2 ресурсы

/** §2.2: множитель потерь от провала операции. При Репрессиях 6+ — 0 для репутации. */
export function legalFailMult(legal: number): number {
	return Math.max(0, 1 - B.LEGAL_FAIL_REDUCTION * legal);
}
/** §2.6: множитель прироста «Под следствием». */
export function legalInvMult(legal: number): number {
	return Math.max(0, 1 - B.LEGAL_INVESTIGATION_REDUCTION * legal);
}

/** §2.2, D-055: множитель положительного прироста репутации (мягкий потолок). */
export function reputationGainMult(reputation: number): number {
	if (reputation <= B.REP_SOFTCAP_START) return 1;
	return Math.max(B.REP_GAIN_MIN_MULT, (100 - reputation) / (100 - B.REP_SOFTCAP_START));
}

/**
 * §2.2, D-055: единственное правило применения изменения репутации (игрок и ИИ).
 * Прирост выше REP_SOFTCAP_START масштабируется, потери — нет; результат в [0, 100].
 */
export function applyReputationChange(reputation: number, delta: number): number {
	const d = delta > 0 ? delta * reputationGainMult(reputation) : delta;
	return clamp(reputation + d, 0, 100);
}

/** §2.2: дрейф к якорю (дельта, без пиара). */
export function reputationRevertDelta(reputation: number): number {
	return -B.REP_MEAN_REVERT * (reputation - B.REP_ANCHOR);
}

/** §2.2: ежемесячный дрейф репутации (дельта). */
export function reputationDriftDelta(reputation: number, pr: number): number {
	return -B.REP_MEAN_REVERT * (reputation - B.REP_ANCHOR) + B.PR_PASSIVE_REP * pr;
}

/** §2.3: ежемесячное изменение засвеченности (дельта, до клампа). */
export function exposureMonthlyDelta(p: {
	survLevel: number;
	reprLevel: number;
	unrest: number;
	pr: number;
	rightsLeaders: number;
}): number {
	return (
		B.SURV_EXPOSURE_MONTHLY[p.survLevel] +
		B.REPR_EXPOSURE_PER_LEVEL * p.reprLevel +
		B.UNREST_RIOT_LEAK_EXPOSURE * ind(p.unrest >= B.RIOT_THRESHOLD) +
		B.LEADER_RIGHTS_EXPOSURE * p.rightsLeaders -
		(B.EXPOSURE_DECAY + B.EXPOSURE_DECAY_PER_PR * p.pr)
	);
}

/** §2.3: вероятность скандала за месяц. E=30 → 0.030, E=50 → 0.119, E=70 → 0.267, E=90 → 0.474. */
export function scandalChance(exposure: number): number {
	if (exposure <= B.SCANDAL_EXPOSURE_FLOOR) return 0;
	const x = (exposure - B.SCANDAL_EXPOSURE_FLOOR) / (100 - B.SCANDAL_EXPOSURE_FLOOR);
	return clamp(B.SCANDAL_K * x * x, 0, B.SCANDAL_P_MAX);
}

/** §2.3: потеря репутации от скандала (положительное число). */
export function scandalRepLoss(exposure: number, pr: number, reprLevel: number): number {
	return (
		(B.SCANDAL_REP_BASE + B.SCANDAL_REP_PER_EXPOSURE * exposure) *
		Math.max(0, 1 - B.PR_SCANDAL_REDUCTION * pr) *
		(reprLevel >= 4 ? B.REPR_CENSORSHIP_SCANDAL_MULT : 1)
	);
}

/** §2.3: прирост «Под следствием» от скандала (сырой, до legal_inv_mult). */
export function scandalInvestigationRaw(exposure: number): number {
	return exposure >= B.SCANDAL_INVESTIGATION_THRESHOLD ? B.SCANDAL_INVESTIGATION_PER_EXPOSURE * exposure : 0;
}

/** §2.4: ежемесячный дрейф влияния (дельта). */
export function influenceDriftDelta(influence: number, sumNetworkLevels: number): number {
	return -B.INFL_MEAN_REVERT * (influence - B.INFL_ANCHOR) + B.NET_INFLUENCE_PER_LEVEL * sumNetworkLevels;
}

/** §2.6: ежемесячный спад «Под следствием». */
export function investigationDecay(legal: number): number {
	return B.INVESTIGATION_DECAY + B.INVESTIGATION_DECAY_PER_LEGAL * legal;
}

/** §2.5: сила компромата, добытого слежкой. */
export function surveillanceKompromatStrength(survLevel: number): number {
	return 1 + ind(survLevel >= 3) + ind(survLevel >= 5);
}

// ---------------------------------------------------------------- §4 развитие

/** §4.1: цена перехода отдела на уровень L. */
export function deptCost(level: number): number {
	return B.DEPT_COST_BY_LEVEL[level - 1];
}
/** §4.1: длительность стройки уровня L. */
export function deptBuildDays(level: number): number {
	return B.DEPT_BUILD_DAYS_PER_LEVEL * level;
}

/** §4.2.1: лимит агентов. */
export function agentCap(jp: number, opsLevel: number): number {
	return B.AGENT_CAP_BASE + Math.floor(jp / B.AGENT_CAP_JP_DIVISOR) + B.AGENT_CAP_PER_OPS_LEVEL * opsLevel;
}

export function baseSalary(rank: Rank): number {
	return rank === 'novice' ? B.SALARY_NOVICE : rank === 'experienced' ? B.SALARY_EXPERIENCED : B.SALARY_VETERAN;
}
export function hireCost(rank: Rank): number {
	return rank === 'novice' ? B.HIRE_COST_NOVICE : rank === 'experienced' ? B.HIRE_COST_EXPERIENCED : B.HIRE_COST_VETERAN;
}

/** §4.2.6: зарплата агента. */
export function salary(rank: Rank, level: number, salaryMult: number): number {
	return round(baseSalary(rank) * (1 + B.SALARY_LEVEL_STEP * (level - 1)) * salaryMult);
}

/** §4.2.3: XP за операцию. */
export function opXp(success: boolean, difficulty: number): number {
	return success ? B.XP_SUCCESS_BASE + B.XP_PER_DIFFICULTY * difficulty : B.XP_FAIL;
}

/** §4.2.3: уровень по XP. */
export function levelForXp(xp: number): number {
	let lvl = 1;
	for (let i = 0; i < B.XP_LEVEL_THRESHOLDS.length; i++) if (xp >= B.XP_LEVEL_THRESHOLDS[i]) lvl = i + 1;
	return Math.min(lvl, B.AGENT_MAX_LEVEL);
}

/** §4.2.7: бонус лояльности за зарплату выше рынка. */
export function loyaltySalaryBonus(mult: number): number {
	const t = B.LOYALTY_SALARY_BONUS as Record<string, number>;
	return t[String(mult)] ?? 0;
}

/** §4.2.7: месячная дельта лояльности (без клампа). */
export function loyaltyDelta(p: {
	paid: boolean;
	salaryMult: number;
	successes: number;
	fails: number;
	overworked: boolean;
	traitDelta: number;
}): number {
	return (
		(p.paid ? B.LOYALTY_PAID : B.LOYALTY_UNPAID) +
		loyaltySalaryBonus(p.salaryMult) +
		B.LOYALTY_PER_SUCCESS * p.successes -
		B.LOYALTY_PER_FAIL * p.fails -
		B.LOYALTY_OVERWORK * ind(p.overworked) +
		p.traitDelta
	);
}

/** §4.2.7: ci_mult = 1 − 0.12·КР. */
export function ciMult(counterintel: number): number {
	return Math.max(0, 1 - B.CI_DEFECTION_REDUCTION * counterintel);
}

/** §4.2.7: шанс перехода к врагу за месяц по лояльности. */
export function defectChance(loyalty: number, counterintel: number, defectMult: number): number {
	const [critical, low] = B.LOYALTY_BANDS; // 20, 40
	let base = 0;
	if (loyalty < critical) base = B.DEFECT_CHANCE_CRITICAL;
	else if (loyalty < low) base = B.DEFECT_CHANCE_LOW;
	return clamp(base * ciMult(counterintel) * defectMult, 0, 1);
}

/** §4.3: длительность ордера. */
export function warrantDays(legal: number): number {
	return Math.max(B.WARRANT_MIN_DAYS, B.WARRANT_BASE_DAYS - B.WARRANT_DAYS_PER_LEGAL * legal);
}

/** §4.4.2: контроль населения. */
export function controlValue(reprLevel: number, controlBonus: number, unrest: number): number {
	let sum = 0;
	for (let i = 0; i < reprLevel; i++) sum += B.REPR_CONTROL[i];
	return clamp(sum + controlBonus - Math.max(0, unrest - B.CONTROL_UNREST_PIVOT), 0, 100);
}

/** §4.4.3: ежемесячное недовольство (включая правило Репрессий 7). */
export function unrestMonthly(unrestBefore: number, reprLevel: number, leaderInfluenceSum: number): number {
	let u = unrestBefore;
	u += B.REPR_UNREST_MONTHLY_PER_LEVEL * reprLevel;
	u += B.LEADER_UNREST_COEF * leaderInfluenceSum;
	u -= B.UNREST_DECAY;
	u = clamp(u, 0, 100);
	if (reprLevel >= 7) {
		if (unrestBefore > B.REPR_L7_UNREST_CAP)
			u = Math.max(B.REPR_L7_UNREST_CAP, unrestBefore - B.REPR_L7_UNREST_DRAIN);
		else u = Math.min(u, B.REPR_L7_UNREST_CAP);
	}
	return u;
}

/** §4.4.3: разовое увеличение недовольства при Репрессиях 7 обрезается. */
export function unrestOneOff(unrestOld: number, delta: number, reprLevel: number): number {
	let u = clamp(unrestOld + delta, 0, 100);
	if (reprLevel >= 7 && delta > 0) u = Math.min(u, Math.max(B.REPR_L7_UNREST_CAP, unrestOld));
	return u;
}

/** §4.4.4: число агентов, уходящих на протесты. */
export function protestCount(unrest: number, reprLevel: number): number {
	if (unrest < B.PROTEST_THRESHOLD || reprLevel >= 7) return 0;
	const n = 1 + Math.floor((unrest - B.PROTEST_THRESHOLD) / B.PROTEST_STEP) - ind(reprLevel >= 2);
	return Math.max(0, n);
}

/** §4.4.4: шанс переворота за месяц. */
export function coupChance(unrest: number): number {
	if (unrest < B.RIOT_THRESHOLD) return 0;
	return clamp((B.COUP_COEF * (unrest - B.COUP_UNREST_PIVOT)) / B.COUP_UNREST_STEP, 0, B.COUP_P_MAX);
}

/** §4.4.5: максимум лидеров при текущем недовольстве. */
export function leaderCap(unrest: number): number {
	return Math.min(B.LEADER_MAX, 1 + Math.floor((unrest - B.LEADER_SPAWN_THRESHOLD) / B.LEADER_SPAWN_STEP));
}

/** §4.5: ярус технологии 1..3 (A.9 TECH_TREE). */
export function techTier(t: TechId): number {
	return (B.TECH_TREE as Record<TechId, { tier: number }>)[t].tier;
}
export function techCost(t: TechId): number {
	return B.TECH_COST_BY_TIER[techTier(t) - 1];
}
export function techDays(t: TechId): number {
	return B.TECH_DAYS_BY_TIER[techTier(t) - 1];
}

/** §4.5, §9.1: потолок сети по технологиям ветки B. */
export function networkCap(techs: readonly TechId[]): number {
	const c = B.NET_CAP_BY_TECH;
	if (techs.includes('B3')) return c.B3;
	if (techs.includes('B2')) return c.B2;
	if (techs.includes('B1')) return c.B1;
	return c.none;
}

// ---------------------------------------------------------------- §5 операции

export function opDept(type: OpType): DeptKey {
	return (B.OP_DEPT as Record<OpType, DeptKey>)[type];
}
export function opPrimarySkills(type: OpType): SkillKey[] {
	return (B.OP_PRIMARY_SKILL as Record<OpType, SkillKey[]>)[type];
}

/** §5.1, §4.3: длительность операции без ордера. */
export function opDuration(type: OpType, survLevel: number): number {
	const base = B.OP_DURATION_DAYS[type];
	if (type === 'investigation' && survLevel >= 2) return scaledDays(base, B.SURV_L2_DURATION_MULT);
	return base;
}

export interface OpChanceInput {
	type: OpType;
	difficulty: number;
	/** max primarySkill по команде */
	teamSkill: number;
	/** средний level команды */
	teamLevel: number;
	/** Σ подкреплений: 1 до 50 % прогресса, 0.5 после; не более 2 агентов */
	extra: number;
	deptLevel: number;
	/** сумма бонусов из таблицы §5.2 (перки, трейты, слежка, технологии) */
	bonus: number;
	hasMole: boolean;
}

/** §5.2: шанс успеха операции. Пример месяца 1 из ГДД даёт 0.52. */
export function opSuccessChance(p: OpChanceInput): number {
	return clamp(
		B.OP_BASE_CHANCE[p.type] +
			B.OP_SKILL_COEF * (p.teamSkill - B.OP_SKILL_PIVOT) +
			B.OP_DEPT_COEF * p.deptLevel +
			B.OP_LEVEL_COEF * (p.teamLevel - 1) +
			B.OP_REINFORCE_BONUS * p.extra -
			B.OP_DIFFICULTY_COEF * (p.difficulty - 1) +
			p.bonus -
			B.OP_MOLE_PENALTY * ind(p.hasMole),
		B.OP_CHANCE_MIN,
		B.OP_CHANCE_MAX
	);
}

/** §5.3: шанс гибели агента при провале «Поимки террористов». */
export function terrorDeathChance(combat: number, marksman: boolean): number {
	const d = B.OP_TERROR_DEATH;
	return clamp(d.base - d.perCombat * (combat - B.OP_SKILL_PIVOT) + (marksman ? B.PERK_EFFECTS.marksman.death : 0), d.min, d.max);
}

/** §5.3: награда за расследование / теракт. */
export function opReward(type: 'investigation' | 'terror', difficulty: number, rewardMult: number): number {
	const base =
		type === 'investigation'
			? B.OP_INVEST_REWARD_BASE + B.OP_INVEST_REWARD_PER_DIFF * difficulty
			: B.OP_TERROR_REWARD_BASE + B.OP_TERROR_REWARD_PER_DIFF * difficulty;
	return round(base * rewardMult);
}

/** §5.4: ожидаемое число обычных дел в месяц. */
export function casesPerMonth(month: number, hasA2: boolean): number {
	return B.CASE_BASE_PER_MONTH + Math.floor((month - 1) / 12) * B.CASE_GROWTH_PER_YEAR + (hasA2 ? B.TECH_A2_EXTRA_CASES : 0);
}

/** §5.4: таймер нового дела. */
export function caseTimer(kind: 'regular' | 'terror', survLevel: number): number {
	return (kind === 'terror' ? B.TERROR_TIMER_DAYS : B.CASE_TIMER_DAYS) + (survLevel >= 3 ? B.SURV_L3_CASE_TIMER_BONUS : 0);
}

/**
 * §5.5, D-049: цель плана на квартал. quarter (Q = 1..20) включает годовой минимум
 * PLAN_BASE_BY_YEAR[y − 1], y = ceil(Q / 4). Без quarter — только формула от штата (как до D-049).
 */
export function planTarget(p: { agentsTotal: number; control: number; reprLevel: number; cardMult: number; quarter?: number }): number {
	const byStaff = B.PLAN_PER_AGENT * p.agentsTotal * 3;
	let base = byStaff;
	if (p.quarter !== undefined) {
		const years = B.PLAN_BASE_BY_YEAR;
		const y = Math.min(years.length, Math.max(1, Math.ceil(p.quarter / 4)));
		base = Math.max(years[y - 1], byStaff);
	}
	return Math.max(
		B.PLAN_MIN,
		round(
			base *
				(1 - (B.CONTROL_PLAN_REDUCTION * p.control) / 100) *
				(p.reprLevel >= 2 ? B.REPR_L2_PLAN_MULT : 1) *
				p.cardMult
		)
	);
}

/** §5.5: максимум фальшивых очков в квартале. */
export function fakeMax(target: number): number {
	return Math.floor(B.FAKE_MAX_SHARE * target);
}

/** §5.5: шанс поимки на «рисовании» статистики. */
export function fakeCatchChance(fakeTotal: number): number {
	return clamp(B.FAKE_CATCH_K * fakeTotal * fakeTotal, 0, B.FAKE_CATCH_MAX);
}

// ---------------------------------------------------------------- §6 бюджет и ИИ

/** §6.2: месячный пул в квартале с индексом q. */
export function poolMonthly(q: number): number {
	return round(B.POOL_START_MONTHLY * Math.pow(1 + B.POOL_GROWTH_PER_QUARTER, q));
}

/** §6.2: вес ведомства в распределении. */
export function agencyWeight(p: { planRatio: number; reputation: number; influence: number; mult: number }): number {
	return (
		(0.5 + clamp(p.planRatio, 0, B.PLAN_RATIO_CAP)) * (0.5 + p.reputation / 100) * (0.5 + p.influence / 100) * p.mult
	);
}

/** §6.2: доли по весам живых ведомств. */
export function shares(weights: readonly number[]): number[] {
	const n = weights.length;
	const sum = weights.reduce((a, b) => a + b, 0);
	if (n === 0) return [];
	if (sum <= 0) return weights.map(() => 1 / n);
	return weights.map((w) => B.SHARE_FLOOR + (1 - n * B.SHARE_FLOOR) * (w / sum));
}

/** §6.2: доход месяца. */
export function monthlyIncome(pool: number, share: number, cardMult: number, investigation: number): number {
	const freeze = investigation >= B.INVESTIGATION_FREEZE_THRESHOLD ? B.INVESTIGATION_FREEZE_MULT : 1;
	return round(pool * share * cardMult * freeze);
}

/** §6.2: потолок остатка и сумма изъятия. */
export function clawback(budget: number, poolNext: number, shareNew: number): number {
	const cap = B.CARRYOVER_CAP_MONTHS * poolNext * shareNew;
	return budget > cap ? round(B.CLAWBACK_RATE * (budget - cap)) : 0;
}

/** §6.2: план соперника за квартал (randomPart = randFloat(−spread, spread)). */
export function rivalPlanRatio(mean: number, randomPart: number, bonus: number): number {
	return clamp(mean + randomPart + bonus, 0, B.PLAN_RATIO_CAP);
}

/** §6.4: враждебность ИИ к игроку. */
export function hostility(p: {
	sharePlayer: number;
	nAlive: number;
	grudge: boolean;
	coalition: boolean;
	ciaNetwork: boolean;
	favor: boolean;
}): number {
	return clamp(
		B.AI_HOSTILITY_BASE +
			B.AI_HOSTILITY_SHARE_COEF * (p.sharePlayer - 1 / p.nAlive) +
			B.AI_HOSTILITY_GRUDGE * ind(p.grudge) +
			B.AI_HOSTILITY_COALITION * ind(p.coalition) +
			B.AI_HOSTILITY_CIA_NETWORK * ind(p.ciaNetwork) +
			// «Услуга» из квеста «Сенатор» (§9.5): −0.3
			B.QUEST_SENATOR.favorHostility * ind(p.favor),
		B.AI_HOSTILITY_MIN,
		B.AI_HOSTILITY_MAX
	);
}

/** §6.4: шанс успеха действия ИИ. */
export function aiSuccessChance(p: { base: number; shareAi: number; counterintel: number; hostile: boolean; police: boolean }): number {
	return clamp(
		p.base +
			B.AI_SHARE_COEF * (p.shareAi - B.AI_SHARE_PIVOT) -
			B.CI_DEFENSE_PER_LEVEL * p.counterintel * ind(p.hostile) -
			B.AI_POLICE_PENALTY * ind(p.police),
		B.AI_CHANCE_MIN,
		B.AI_CHANCE_MAX
	);
}

/** §6.4: шанс узнать источник враждебного действия. */
export function aiDetectChance(counterintel: number): number {
	return clamp(B.AI_DETECT_BASE + B.AI_DETECT_PER_CI * counterintel, 0, B.AI_DETECT_MAX);
}

/** §6.4: интервал действий ИИ. */
export function aiInterval(base: number, coalition: boolean): number {
	return coalition ? Math.ceil(base * B.AI_COALITION_INTERVAL_MULT) : base;
}

/** §6.3: шанс раскрытия источника слива. */
export function leakRevealChance(cyber: number): number {
	return clamp(B.ACT_LEAK.revealBase - B.CYBER_LEAK_REVEAL_REDUCTION * cyber, B.ACT_LEAK.revealMin, 1);
}
/** §6.3: шанс раскрытия подставы. */
export function sabotageRevealChance(nPrev: number): number {
	return clamp(B.ACT_SABOTAGE.revealBase + B.ACT_SABOTAGE.revealPerPrev * nPrev, 0, B.ACT_SABOTAGE.revealMax);
}
/** §6.3: шанс, что переманенный агент — крот. */
export function poachMoleChance(counterintel: number): number {
	return clamp(B.ACT_POACH.moleBase - B.ACT_POACH.molePerCI * counterintel, B.ACT_POACH.moleMin, 1);
}
/** §6.3: шанс поглощения; цель «на грани» — +collapseBonus (D-059). */
export function absorbChance(influence: number, targetRep: number, collapsing = false): number {
	const a = B.ACT_ABSORB;
	return clamp(
		a.base + a.perInfl * (influence - a.minInfluence) + a.perRep * (a.maxTargetRep - targetRep) + (collapsing ? a.collapseBonus : 0),
		a.min,
		a.max
	);
}
/** §6.3: шанс вернуть полномочия. */
export function restoreStateChance(influence: number, highProfile180: number): number {
	const a = B.ACT_RESTORE_STATE;
	return clamp(a.base + a.perInfl * influence + a.perHighProfile * highProfile180, a.min, a.max);
}
/** §6.3: шанс раскрыть крота при проверке лояльности. */
export function loyaltyCheckChance(counterintel: number): number {
	return clamp(B.ACT_LOYALTY_CHECK.base + B.ACT_LOYALTY_CHECK.perCI * counterintel, 0, 1);
}

// ---------------------------------------------------------------- §9 сети и заброска

/** §9.1: шанс провала на границе. */
export function borderFailChance(base: number, language: boolean, coldBlooded: boolean): number {
	return clamp(
		base - B.TRAINING_LANGUAGE_BORDER_BONUS * ind(language) + B.PERK_EFFECTS.cold_blooded.borderFail * ind(coldBlooded),
		B.BORDER_FAIL_MIN,
		B.BORDER_FAIL_MAX
	);
}
/** §9.1: шанс внедрения после заброски. */
export function zabroskaInfiltrateChance(surveillance: number, bonus: number): number {
	return clamp(
		B.ZABROSKA_INFILTRATE_BASE + B.ZABROSKA_SKILL_COEF * (surveillance - B.ZABROSKA_SKILL_PIVOT) + bonus,
		B.ZABROSKA_CHANCE_MIN,
		B.ZABROSKA_CHANCE_MAX
	);
}
/** §9.1: месячный вклад агента в прогресс сети. */
export function netAgentProgress(surveillance: number, legend: number, language: boolean, hasB2: boolean): number {
	return (
		B.NET_PROGRESS_PER_AGENT *
		(1 + B.NET_SKILL_COEF * (surveillance - 5)) *
		legend *
		(language ? B.TRAINING_LANGUAGE_NET_MULT : 1) *
		(hasB2 ? B.TECH_B2_NET_MULT : 1)
	);
}
/** §9.1: шанс провала сети за месяц. */
export function netFailChance(p: { level: number; countryCi: number; reprLevel: number; counterintel: number; diplomaticCrisis: boolean }): number {
	return clamp(
		B.NET_FAIL_PER_LEVEL * p.level +
			p.countryCi +
			B.REPR_NET_FAIL_PER_LEVEL * p.reprLevel -
			B.NET_FAIL_CI_REDUCTION * p.counterintel +
			B.CARD_DIPLOMATIC_CRISIS.netFail * ind(p.diplomaticCrisis),
		B.NET_FAIL_MIN,
		B.NET_FAIL_MAX
	);
}

// ---------------------------------------------------------------- §8 счёт

/** §8.7: счёт для таблицы рекордов. */
export function score(p: { victory: boolean; monthsPlayed: number; reputation: number; influence: number; budget: number; exposure: number }): number {
	return Math.max(
		0,
		round(
			ind(p.victory) * (B.SCORE_VICTORY + B.SCORE_PER_MONTH_LEFT * (B.TERM_MONTHS - p.monthsPlayed)) +
				B.SCORE_PER_REPUTATION * p.reputation +
				B.SCORE_PER_INFLUENCE * p.influence +
				p.budget / B.SCORE_BUDGET_DIVISOR -
				B.SCORE_PER_EXPOSURE * p.exposure
		)
	);
}
