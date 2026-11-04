// Селекторы для экранов (§10.3). Только чтение: ни RNG, ни мутаций.
import { BALANCE as B } from './balance';
import { agentSalary, currentAgentCap, jurisdictionPoints } from './agents';
import { creditLimit, opCost, survRequiredByRepression, validateAction } from './actions';
import { canBuildDept, canBuildRepr, canBuildSurv, canResearch } from './development';
import { bankruptHardFloor, incomeForMonth, monthlyExpenses, type ExpenseBreakdown } from './economy';
import { agentById, dept, dirtyCostMult, kompromatActive, month } from './effects';
import {
	absorbChance,
	deptCost,
	leakRevealChance,
	loyaltyCheckChance,
	poachMoleChance,
	sabotageRevealChance,
	fakeMax,
	hireCost,
	monthOfDay,
	opDuration,
	quarterOfMonth,
	scandalChance,
	techCost,
	techDays,
	techTier,
	termDays,
	warrantDays
} from './formulas';
import { caseAccessible, caseInterceptable, computeOpChance, targetDifficulty } from './ops';
import { recruitMethodAvailable } from './networks';
import { collapseDisbandDay } from './rivals';
import { questChoices, type QuestChoice } from './quests';
import { victoryConditions } from './victory';
import type { Agent, Case, DeptKey, GameState, Legend, OpTarget, OpType, QuestSession, RecruitMethod, RivalId, TechId, VictoryPath } from './types';
import { DEPT_KEYS, LEGENDS, RECRUIT_METHODS, TECH_IDS } from './types';

export function selectDate(s: GameState) {
	const m = monthOfDay(s.day);
	return {
		day: s.day,
		month: m,
		quarter: quarterOfMonth(m),
		year: Math.ceil(m / 12),
		dayOfMonth: s.day === 0 ? 0 : ((s.day - 1) % B.DAYS_PER_MONTH) + 1,
		daysLeft: termDays() - s.day,
		speed: s.speed,
		paused: s.paused,
		pauseReasons: [...s.pauseReasons]
	};
}

/** Ресурсы для верхней панели. Шкалы — Math.floor, как в UI (§0). */
export function selectResources(s: GameState) {
	return {
		budget: s.budget,
		reputation: Math.floor(s.reputation),
		influence: Math.floor(s.influence),
		exposure: Math.floor(s.exposure),
		investigation: Math.floor(s.investigation),
		control: Math.floor(s.control),
		unrest: Math.floor(s.unrest),
		kompromat: s.kompromat.filter((k) => kompromatActive(s, k)).length,
		agents: s.agents.length,
		agentCap: currentAgentCap(s),
		share: s.share,
		/** D-051: лимит кредита на операции и текущий долг (0, если бюджет ≥ 0). */
		creditLimit: creditLimit(s),
		debt: Math.max(0, -s.budget),
		scandalChance: scandalChance(s.exposure),
		plan: {
			quarter: s.plan.quarter,
			points: s.plan.points,
			fakePoints: s.plan.fakePoints,
			fakeMax: fakeMax(s.plan.target),
			target: s.plan.target
		}
	};
}

/** Прогноз ближайшего конца месяца (доход и расходы при текущем состоянии). */
export function selectForecast(s: GameState): { income: number; expenses: ExpenseBreakdown; net: number } {
	const m = Math.min(B.TERM_MONTHS, month(s) + (s.day > 0 && s.day % B.DAYS_PER_MONTH === 0 ? 1 : 0));
	const income = incomeForMonth(s, m);
	const expenses = monthlyExpenses(s);
	return { income, expenses, net: income - expenses.total };
}

export interface AgentNames {
	firstNames: string[];
	lastNames: string[];
}

/** Имя агента из контента по его nameSeed (детерминированно, без RNG партии). */
export function resolveAgentName(a: Pick<Agent, 'id' | 'nameSeed'>, names?: AgentNames | null): string {
	if (!names || names.firstNames.length === 0 || names.lastNames.length === 0) return `Агент №${a.id}`;
	const f = names.firstNames[a.nameSeed % names.firstNames.length];
	const l = names.lastNames[Math.floor(a.nameSeed / names.firstNames.length) % names.lastNames.length];
	return `${f} ${l}`;
}

export function selectAgents(s: GameState) {
	return s.agents.map((a) => ({
		...a,
		// Крот скрыт от игрока.
		moleFor: null,
		salary: agentSalary(a)
	}));
}

export function selectHirePool(s: GameState) {
	const cap = currentAgentCap(s);
	return s.hirePool.map((c) => ({
		...c,
		hireCost: hireCost(c.rank),
		salary: agentSalary(c),
		canHire: validateAction(s, { type: 'hire', candidateId: c.id }),
		capReached: s.agents.length >= cap
	}));
}

export interface CaseView extends Case {
	daysLeft: number | null;
	accessible: boolean;
	interceptable: boolean;
	holder: RivalId | null;
	jurisdiction: number;
}

export function selectCases(s: GameState): CaseView[] {
	return s.cases.map((c) => ({
		...c,
		daysLeft: c.expiresDay === null ? null : c.expiresDay - s.day,
		accessible: caseAccessible(s, c),
		interceptable: caseInterceptable(s, c),
		holder: s.stateJurisdiction[c.stateId]?.holder ?? null,
		jurisdiction: s.stateJurisdiction[c.stateId]?.level ?? 0
	}));
}

export interface OpPreviewInput {
	opType: OpType;
	agentIds: number[];
	caseId?: number;
	target?: OpTarget;
}

/** Шанс до старта (§10.3: «шанс показывается до старта»), цена, длительность и ошибка валидации. */
export function previewOperation(s: GameState, p: OpPreviewInput) {
	const team = p.agentIds.map((id) => agentById(s, id)).filter((x): x is Agent => !!x);
	const c = p.caseId !== undefined ? s.cases.find((x) => x.id === p.caseId) : undefined;
	const target = p.target ?? null;
	const difficulty = c ? c.difficulty : target ? targetDifficulty(s, target) : 1;
	const illegal = target?.kind === 'senator' || target?.kind === 'president';
	const warrant = p.opType === 'surveillance' && s.survLevel < 6 && !illegal ? warrantDays(dept(s, 'legal')) : 0;
	return {
		chance: computeOpChance(s, { type: p.opType, difficulty, target, team }),
		cost: opCost(s, p.opType, target),
		days: warrant + opDuration(p.opType, s.survLevel),
		warrantDays: warrant,
		difficulty,
		error: validateAction(s, { type: 'startOp', ...p })
	};
}

export function selectOperations(s: GameState) {
	return s.operations.map((op) => {
		const team = op.agentIds.map((id) => agentById(s, id)).filter((x): x is Agent => !!x);
		const span = Math.max(1, op.endDay - op.startDay);
		return {
			...op,
			progress: Math.min(1, (s.day - op.startDay) / span),
			daysLeft: op.endDay - s.day,
			inWarrant: s.day < op.warrantEndDay,
			chance: computeOpChance(s, { type: op.type, difficulty: op.difficulty, target: op.target, team, lateIds: op.extraJoinedLate })
		};
	});
}

/** Досье на конкурентов: только то, что игрок знает. kompromatOnPlayer скрыт. */
export function selectRivals(s: GameState) {
	return s.rivals.map((r) => ({
		id: r.id,
		alive: r.alive,
		absorbed: r.absorbed,
		/** «На грани» (D-059): репутация 0, не действует, выбудет в конце квартала (disbandDay). */
		collapsing: r.alive && r.collapsing,
		disbandDay: r.alive && r.collapsing ? collapseDisbandDay(s) : null,
		reputation: Math.floor(r.reputation),
		influence: Math.floor(r.influence),
		share: r.share,
		planRatio: r.planRatio,
		grudge: s.day < r.grudgeUntilDay,
		coalition: s.coalition,
		kompromatOnThem: s.kompromat.filter((k) => k.target.kind === 'rival' && k.target.id === r.id && kompromatActive(s, k)).length,
		embeddedAgents: s.agents.filter((a) => a.status === 'embedded' && a.location && 'rivalId' in a.location && a.location.rivalId === r.id).map((a) => a.id),
		knownActions: s.log.filter((e) => e.kind === 'rival_action' && e.source === r.id)
	}));
}

export function selectKompromat(s: GameState) {
	return s.kompromat.filter((k) => kompromatActive(s, k)).map((k) => ({ ...k, daysLeft: k.expiresDay === null ? null : k.expiresDay - s.day }));
}

export function selectDepartments(s: GameState) {
	return DEPT_KEYS.map((d: DeptKey) => {
		const next = s.departments[d] + 1;
		const b = s.builds.find((x) => x.kind === 'dept' && x.dept === d) ?? null;
		return {
			key: d,
			level: s.departments[d],
			building: b ? { targetLevel: b.targetLevel, doneDay: b.doneDay } : null,
			nextCost: next <= B.DEPT_MAX_LEVEL ? deptCost(next) : null,
			canBuild: canBuildDept(s, d)
		};
	});
}

export function selectBranches(s: GameState) {
	const sb = s.builds.find((x) => x.kind === 'surv') ?? null;
	const rb = s.builds.find((x) => x.kind === 'repr') ?? null;
	return {
		surveillance: {
			level: s.survLevel,
			maxEver: s.survMaxEver,
			building: sb ? { targetLevel: sb.targetLevel, doneDay: sb.doneDay } : null,
			nextCost: B.SURV_COST_BY_LEVEL[s.survLevel] ?? null,
			canBuild: canBuildSurv(s)
		},
		repression: {
			level: s.reprLevel,
			maxEver: s.reprMaxEver,
			building: rb ? { targetLevel: rb.targetLevel, doneDay: rb.doneDay } : null,
			nextCost: B.REPR_COST_BY_LEVEL[s.reprLevel] ?? null,
			canBuild: canBuildRepr(s),
			control: s.control,
			unrest: s.unrest
		},
		leaders: s.leaders.map((l) => ({ ...l }))
	};
}

export function selectTechTree(s: GameState) {
	return TECH_IDS.map((t: TechId) => ({
		id: t,
		known: s.techs.includes(t),
		researching: s.research?.techId === t ? { doneDay: s.research.doneDay } : null,
		cost: techCost(t),
		days: techDays(t),
		canResearch: canResearch(s, t),
		apexLocked: techTier(t) === 3 && s.apexChosen !== null && s.apexChosen !== t
	}));
}

export function selectNetworks(s: GameState) {
	return Object.entries(s.networks).map(([countryId, n]) => ({
		countryId,
		...n,
		missions: s.missions.filter((m) => m.countryId === countryId)
	}));
}

export function selectJurisdiction(s: GameState) {
	return { states: s.stateJurisdiction, jp: jurisdictionPoints(s) };
}

export function selectQuests(s: GameState): (QuestSession & { choices: QuestChoice[] })[] {
	return s.quests.map((q) => ({ ...q, choices: questChoices(s, q) }));
}

export function selectLog(s: GameState, limit = 50) {
	return s.log.slice(-limit).reverse();
}

export function selectOutcome(s: GameState) {
	return { ...s.outcome };
}

/** Прогресс по путям победы — для экрана целей и симулятора. */
export function selectVictoryProgress(s: GameState): Record<VictoryPath, { met: boolean; holdDays?: number }> & { dirtyActions: number } {
	const c = victoryConditions(s);
	return {
		monopoly: { met: c.monopoly },
		cardinal: { met: c.cardinal, holdDays: s.counters.holdCardinalDays },
		shadow: { met: c.shadow, holdDays: s.counters.holdShadowDays },
		'1984': { met: c['1984'], holdDays: s.counters.hold1984Days },
		clean: { met: c.clean },
		dirtyActions: s.counters.dirtyActions
	};
}

// ------------------------------------------------------------ цены действий (§6.3), заброска (§9.1), сенаторы

/** Цена и состояние действия для кнопки UI. */
export interface ActionCostView {
	/** k$ (с учётом C1 для грязных действий). */
	cost: number;
	/** Сколько влияния тратится. */
	influence: number;
	/** Дней до конца отката/текущего выполнения; 0 — готово. */
	readyInDays: number;
	/** Шанс успеха, если у действия есть бросок успеха (поглощение), иначе null. */
	chance: number | null;
	/** Шанс плохого исхода: раскрытие, обратный эффект, крот; иначе null. */
	risk: number | null;
	/** Код ошибки validateAction или null — можно выполнить. */
	error: string | null;
}

export interface LeakCostView extends ActionCostView {
	kompromatId: number;
	rivalId: RivalId;
	strength: number;
	/** Изменение репутации цели при сливе. */
	targetRepDelta: number;
}

export interface ActionCosts {
	congressWork: ActionCostView;
	prCampaign: ActionCostView;
	/** Встречный компромат (D-057): откат; error учитывает наличие компромата на соперника. */
	counterKompromat: ActionCostView;
	loyaltyCheck: ActionCostView;
	rivals: Record<RivalId, { sabotage: ActionCostView; lobby: ActionCostView; poach: ActionCostView; absorb: ActionCostView }>;
	/** По предмету компромата на живого соперника. */
	leak: LeakCostView[];
}

const view = (cost: number, influence: number, readyInDays: number, chance: number | null, risk: number | null, error: string | null): ActionCostView => ({
	cost,
	influence,
	readyInDays: Math.max(0, readyInDays),
	chance,
	risk,
	error
});

/** Цены, откаты и риски действий против конкурентов и власти (§6.3). */
export function selectActionCosts(s: GameState): ActionCosts {
	const ci = dept(s, 'counterintel');
	const dirty = dirtyCostMult(s);
	const loyaltyTask = s.tasks.find((t) => t.kind === 'loyalty_check');
	const rivals = {} as ActionCosts['rivals'];
	for (const r of s.rivals) {
		const absorbTask = s.tasks.find((t) => t.kind === 'absorb' && t.rivalId === r.id);
		rivals[r.id] = {
			sabotage: view(Math.round(B.ACT_SABOTAGE.cost * dirty), 0, 0, null, sabotageRevealChance(r.sabotageCount), validateAction(s, { type: 'sabotage', rivalId: r.id })),
			lobby: view(B.ACT_LOBBY.cost, B.ACT_LOBBY.influence, 0, null, B.ACT_LOBBY.backfireChance, validateAction(s, { type: 'lobby', rivalId: r.id })),
			poach: view(B.ACT_POACH.cost, 0, 0, null, poachMoleChance(ci), validateAction(s, { type: 'poach', rivalId: r.id })),
			absorb: view(
				// D-065: «на грани» — collapseCost.
				r.collapsing ? B.ACT_ABSORB.collapseCost : B.ACT_ABSORB.cost,
				B.ACT_ABSORB.influence,
				absorbTask ? absorbTask.doneDay - s.day : 0,
				// D-052: шанс считается при запуске по влиянию до оплаты; во время выполнения — зафиксированный.
				absorbTask?.chance ?? absorbChance(s.influence, r.reputation, r.collapsing),
				null,
				validateAction(s, { type: 'absorb', rivalId: r.id })
			)
		};
	}
	const leak: LeakCostView[] = [];
	for (const k of s.kompromat) {
		if (k.target.kind !== 'rival' || !kompromatActive(s, k)) continue;
		leak.push({
			...view(Math.round(B.ACT_LEAK.cost * dirty), 0, 0, null, leakRevealChance(dept(s, 'cyber')), validateAction(s, { type: 'leak', kompromatId: k.id })),
			kompromatId: k.id,
			rivalId: k.target.id,
			strength: k.strength,
			targetRepDelta: B.ACT_LEAK.repPerStrength * k.strength
		});
	}
	const firstRivalK = s.kompromat.find((k) => k.target.kind === 'rival' && kompromatActive(s, k));
	return {
		counterKompromat: view(
			0,
			0,
			s.counters.counterKompromatReadyDay - s.day,
			null,
			null,
			validateAction(s, { type: 'counterKompromat', kompromatId: firstRivalK?.id ?? -1 })
		),
		congressWork: view(B.ACT_CONGRESS_WORK.cost, 0, s.counters.congressWorkReadyDay - s.day, null, null, validateAction(s, { type: 'congressWork' })),
		prCampaign: view(B.PR_CAMPAIGN.cost, 0, s.counters.prCampaignReadyDay - s.day, null, null, validateAction(s, { type: 'prCampaign' })),
		loyaltyCheck: view(
			B.ACT_LOYALTY_CHECK.cost,
			0,
			loyaltyTask ? loyaltyTask.doneDay - s.day : 0,
			loyaltyCheckChance(ci),
			null,
			validateAction(s, { type: 'loyaltyCheck' })
		),
		rivals,
		leak
	};
}

export interface DeployCostView {
	legendCost: number;
	/** Деньги на вербовку источника (только способ money). */
	recruitCost: number;
	total: number;
	canAfford: boolean;
}

/** Цена заброски (§9.1): LEGEND_COST + деньги на вербовку. Проверяется при deployAgent. */
export function selectDeployCost(s: GameState, legend: Legend, recruit: RecruitMethod): DeployCostView {
	const legendCost = B.LEGEND_COST[legend];
	const recruitCost = recruit === 'money' ? B.RECRUIT_METHODS.money.cost : 0;
	const total = legendCost + recruitCost;
	return { legendCost, recruitCost, total, canAfford: s.budget >= total };
}

/** Все варианты заброски для формы: легенды и способы вербовки с ценами и шансами. */
export function selectDeployOptions(s: GameState) {
	return {
		legends: LEGENDS.map((l) => ({
			legend: l,
			cost: B.LEGEND_COST[l],
			borderFail: B.LEGEND_BORDER_FAIL[l],
			infiltrateBonus: B.LEGEND_INFILTRATE_BONUS[l],
			netGrowth: B.LEGEND_NET_GROWTH[l]
		})),
		recruit: RECRUIT_METHODS.map((m) => ({
			method: m,
			cost: m === 'money' ? B.RECRUIT_METHODS.money.cost : 0,
			chance: B.RECRUIT_METHODS[m].p,
			available: recruitMethodAvailable(s, m)
		})),
		prepDays: B.ZABROSKA_PREP_DAYS,
		prepBonus: B.ZABROSKA_PREP_BONUS
	};
}

export interface SenatorView {
	/** Ключ для имени из контента (SenatorContentSchema.id). */
	id: string;
	/** Порядковый номер 1..9 (из id). */
	index: number;
	resistance: number;
	/** Сложность «Слежки» за сенатором (D-046). */
	surveillanceDifficulty: number;
	/** Действующий компромат на сенатора. */
	kompromatIds: number[];
	/** Ближайший день, когда можно снова шантажировать (null — нечем или можно сейчас). */
	blackmailReadyDay: number | null;
}

/** Бюджетный комитет (§8.5). Имена UI берёт из контента по id. */
export function selectSenators(s: GameState): SenatorView[] {
	return s.senators.map((sen) => {
		const items = s.kompromat.filter((k) => k.target.kind === 'senator' && k.target.id === sen.id && kompromatActive(s, k));
		const cds = items.map((k) => k.usedCooldownUntil ?? 0).filter((d) => d > s.day);
		const free = items.some((k) => (k.usedCooldownUntil ?? 0) <= s.day);
		return {
			id: sen.id,
			index: Number(sen.id.replace(/\D+/g, '')),
			resistance: sen.resistance,
			surveillanceDifficulty: targetDifficulty(s, { kind: 'senator', id: sen.id }),
			kompromatIds: items.map((k) => k.id),
			blackmailReadyDay: free || cds.length === 0 ? null : Math.min(...cds)
		};
	});
}

export interface CreditView {
	/** Сколько можно уйти в минус запуском операций: round(CREDIT_LIMIT_MONTHS × lastIncome). */
	limit: number;
	/** Текущий долг (0, если бюджет ≥ 0). */
	debt: number;
	/** Сколько ещё можно потратить на операции: budget + limit. */
	availableForOps: number;
	/** Ставка процента на долг в конце месяца. */
	interestRate: number;
	/** Процент, который спишут в конце месяца при текущем долге. */
	nextInterest: number;
	/** Месяцев подряд с бюджетом < 0 и порог банкротства. */
	bankruptStreak: number;
	bankruptMonths: number;
	/** D-060: сколько ближайших концов месяца ещё не идут в счётчик банкротства (0 — грейс кончился). */
	bankruptGraceMonthsLeft: number;
	/** D-060, D-063: бюджет ниже этого значения в конце месяца — банкротство сразу (−BANKRUPT_HARD_FLOOR_MONTHS × max(lastIncome, firstIncome)). */
	hardFloor: number;
	/** D-060: сколько ближайших распределений не идут в счётчик расформирования. */
	disbandGraceQuartersLeft: number;
}

/** §2.7, D-051: кредит на операции и долг. */
export function selectCredit(s: GameState): CreditView {
	const limit = creditLimit(s);
	const debt = Math.max(0, -s.budget);
	return {
		limit,
		debt,
		availableForOps: s.budget + limit,
		interestRate: B.CREDIT_INTEREST_RATE,
		nextInterest: Math.round(B.CREDIT_INTEREST_RATE * debt),
		bankruptStreak: s.counters.bankruptStreak,
		bankruptMonths: B.BANKRUPT_MONTHS,
		bankruptGraceMonthsLeft: Math.max(0, B.BANKRUPT_GRACE_MONTHS - nextMonthEndMonth(s) + 1),
		hardFloor: bankruptHardFloor(s),
		disbandGraceQuartersLeft: Math.max(0, B.DISBAND_GRACE_QUARTERS - s.plan.quarter + 1)
	};
}

/** D-054: минимальный уровень слежки, ниже которого откат запрещён (из-за активных репрессий). */
export function selectSurvRollbackFloor(s: GameState): number {
	return survRequiredByRepression(s);
}

/** Номер месяца, который закончится следующим (для грейса банкротства). */
function nextMonthEndMonth(s: GameState): number {
	return Math.floor(s.day / B.DAYS_PER_MONTH) + 1;
}
