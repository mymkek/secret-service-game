// Операции и дела на карте (§5).
import { BALANCE as B } from './balance';
import { grantXp, hasPerk, hasTrait, teamPerkTraitBonus, traitExposurePerOp } from './agents';
import {
	caseTimer,
	clamp,
	casesPerMonth,
	legalFailMult,
	opDept,
	opPrimarySkills,
	opReward,
	opRollChance,
	opShownChance,
	reinforceBonus,
	surveillanceKompromatStrength,
	terrorDeathChance
} from './formulas';
import {
	addBudget,
	addExposure,
	addInfluence,
	addInvestigation,
	addKompromat,
	addKompromatOnPlayer,
	addReputation,
	addRivalRep,
	agentById,
	aliveRivals,
	autopause,
	dept,
	dirtyExposureMult,
	hasTech,
	log,
	month,
	newId,
	removeAgent,
	setIdle
} from './effects';
import { topWeightRival } from './economy';
import { triggerHearings } from './quest-core';
import { addRivalPlan } from './rivals';
import { pickOne, pickWeightedIndex, randInt, roll } from './rng';
import { US_STATES } from './geo';
import { coverLifeScandal, forgetSignal, scheduleDelayed, signalIsReal } from './dilemma-state';
import type {
	Agent,
	Case,
	CaseKind,
	CaseSource,
	CaseTag,
	GameState,
	KompromatTarget,
	LogValue,
	Operation,
	OpTarget,
	OpType,
	RivalId,
	SkillKey,
	StateId
} from './types';

// ------------------------------------------------------------ доступ к делам (§5.4)

/** Может ли игрок взять дело по полномочиям в штате. */
export function caseAccessible(s: GameState, c: Case): boolean {
	if (c.intercepted) return true;
	if (dept(s, 'cyber') < c.minCyber) return false;
	const j = s.stateJurisdiction[c.stateId];
	if (!j) return false;
	if (j.level >= 2) return true;
	// D-068: дело-провокация (tag 'sting') доступно при частичных полномочиях, хотя по виду это теракт.
	if (j.level === 1) return (c.kind === 'regular' && c.difficulty <= B.PARTIAL_JURISDICTION_MAX_DIFFICULTY) || c.tag === 'sting';
	return false;
}

/** Дело недоступно только из-за полномочий — кандидат на «Перехват дела». */
export function caseInterceptable(s: GameState, c: Case): boolean {
	if (c.intercepted || c.takenByOpId !== null) return false;
	if (dept(s, 'cyber') < c.minCyber) return false;
	return !caseAccessible(s, c);
}

function stateWeights(s: GameState, minJurisdiction = 0): number[] {
	return US_STATES.map((id) => {
		if ((s.strikes[id] ?? 0) > s.day) return 0;
		if (s.leaders.some((l) => l.stateId === id && l.archetype === 'union' && l.influence >= B.LEADER_STRIKE_INFLUENCE)) return 0;
		if ((s.stateJurisdiction[id]?.level ?? 0) < minJurisdiction) return 0;
		return s.config.stateCaseWeights[id] ?? 1;
	});
}

export interface SpawnCaseOptions {
	difficulty?: number;
	timerDays?: number | null;
	rewardMult?: number;
	source?: CaseSource;
	minCyber?: number;
	/** Штат задан заранее (дела из дилемм §9.8) — без броска штата. */
	stateId?: StateId;
	/** Только штаты с полномочиями ≥ этого уровня (дела «Ценного источника», §9.8). */
	minJurisdiction?: number;
	tag?: CaseTag | null;
	signalRef?: number | null;
}

/** Создаёт дело. Штат выбирается pickWeighted (§5.4); при нулевой сумме весов дела нет. */
export function spawnCase(s: GameState, kind: CaseKind, opts: SpawnCaseOptions = {}): Case | null {
	let difficulty = opts.difficulty;
	if (difficulty === undefined) {
		const w = kind === 'terror' ? B.TERROR_DIFFICULTY_WEIGHTS : B.CASE_DIFFICULTY_WEIGHTS;
		difficulty = pickWeightedIndex(s, w) + 1;
		if (difficulty <= 0) return null;
	}
	// §5.4, D-045: сила улики — один вызов RNG сразу после броска сложности, для любого дела.
	const [emin, emax] = B.EVIDENCE_STRENGTH_RANGE;
	const evidenceStrength = randInt(s, emin, emax);
	let stateId = opts.stateId;
	if (stateId === undefined) {
		const si = pickWeightedIndex(s, stateWeights(s, opts.minJurisdiction ?? 0));
		if (si < 0) return null;
		stateId = US_STATES[si];
	}
	const timer = opts.timerDays === undefined ? caseTimer(kind, s.survLevel) : opts.timerDays;
	const c: Case = {
		id: newId(s),
		kind,
		stateId,
		difficulty,
		createdDay: s.day,
		expiresDay: timer === null ? null : s.day + timer,
		evidenceStrength,
		rewardMult: opts.rewardMult ?? 1,
		source: opts.source ?? 'random',
		minCyber: opts.minCyber ?? 0,
		raceDay: null,
		raceBonus: 0,
		intercepted: false,
		takenByOpId: null,
		tag: opts.tag ?? null,
		signalRef: opts.signalRef ?? null
	};
	s.cases.push(c);
	log(s, 'case_new', c.tag ? { caseId: c.id, kind, stateId: c.stateId, difficulty, tag: c.tag } : { caseId: c.id, kind, stateId: c.stateId, difficulty });
	return c;
}

/** Шанс атаки по нереализованному сигналу (§9.8, «как вариант 0»): если сигнал реален — теракт через randInt дней. */
export function signalMissed(s: GameState, signalId: number): void {
	if (signalIsReal(s, signalId)) {
		const [a, b] = B.DL_SIGNAL.attackDelayDays;
		scheduleDelayed(s, 'signal_attack', s.day + randInt(s, a, b), { signalId });
	}
	forgetSignal(s, signalId);
}

/** Получатель ушедшего дела: держатель штата или случайный живой соперник (§5.4). */
function caseLostToRival(s: GameState, c: Case, why: 'expired' | 'failed'): void {
	const holder = s.stateJurisdiction[c.stateId]?.holder ?? null;
	let to: RivalId | null = null;
	if (holder && s.rivals.find((r) => r.id === holder)?.alive) to = holder;
	else to = pickOne(s, aliveRivals(s))?.id ?? null;
	if (to) addRivalPlan(s.rivals.find((r) => r.id === to)!, B.RIVAL_PLAN_PER_LOST_CASE);
	log(s, why === 'expired' ? 'case_expired' : 'case_lost', { caseId: c.id, to });
}

/**
 * Шаг 4 дня: генерация и истечение дел. onMonthStart — плановые события начала месяца после дел
 * без таймера (§3.3 шаг 4: «Материал на кандидата», «Тихий сигнал», предложение линейки).
 * Случайные дела бросаются до блока начала месяца, как и до D-067 (порядок RNG не меняли).
 */
export function dailyCases(s: GameState, onMonthStart?: () => void): void {
	const m = month(s);
	if (roll(s, casesPerMonth(m, hasTech(s, 'A2')) / B.DAYS_PER_MONTH)) spawnCase(s, 'regular');
	if (roll(s, B.TERROR_PER_MONTH / B.DAYS_PER_MONTH)) spawnCase(s, 'terror');
	// Дела без таймера — в первый день месяца (D-047).
	if (s.day % B.DAYS_PER_MONTH === 1) {
		if (s.reprLevel >= 3)
			for (let i = 0; i < B.REPR_L3_EXTRA_CASES; i++) spawnCase(s, 'regular', { timerDays: null, source: 'repr3' });
		if (s.counters.informantCasesUntilDay > s.day)
			for (let i = 0; i < B.QUEST_INFORMANT.casesPerMonth; i++) spawnCase(s, 'regular', { timerDays: null, source: 'informant' });
		// §9.8 «Ценный источник»: +casesPerMonth дел без таймера в штатах с полномочиями ≥ 1.
		if (s.valuableSource) {
			for (let i = 0; i < B.DL_VALUABLE_SOURCE.casesPerMonth; i++)
				spawnCase(s, 'regular', { timerDays: null, source: 'dilemma', tag: 'source', minJurisdiction: 1 });
		}
		onMonthStart?.();
	}
	// Гонка карточки «Теракт в крупном городе» (§7).
	for (const c of s.cases) {
		if (c.raceDay !== null && c.raceDay === s.day) {
			// «ИИ с наибольшим весом» — по §6.2 в момент гонки; при равенстве police → cia → secret_service (D-047).
			const best = topWeightRival(s);
			if (best) {
				addRivalPlan(best, B.CARD_TERROR_ATTACK.rivalPlan);
				log(s, 'terror_race_lost', { caseId: c.id, rivalId: best.id });
			}
			c.raceBonus = 0;
		}
	}
	// Истечение.
	const keep: Case[] = [];
	for (const c of s.cases) {
		if (c.takenByOpId === null && c.expiresDay !== null && c.expiresDay <= s.day) {
			// §9.8: истёкшее дело-провокация исчезает и сопернику не уходит; истёкшая проверка сигнала — «как вариант 0».
			if (c.tag === 'sting') log(s, 'case_expired', { caseId: c.id, to: null });
			else caseLostToRival(s, c, 'expired');
			if (c.tag === 'signal' && c.signalRef !== null) signalMissed(s, c.signalRef);
		} else {
			if (
				c.takenByOpId === null &&
				c.expiresDay !== null &&
				c.expiresDay - s.day === B.CASE_EXPIRING_WARN_DAYS &&
				caseAccessible(s, c)
			)
				autopause(s, 'caseExpiring');
			keep.push(c);
		}
	}
	s.cases = keep;
}

// ------------------------------------------------------------ шанс (§5.2)

export function primarySkill(a: Agent, type: OpType): number {
	return Math.max(...opPrimarySkills(type).map((k) => a.skills[k]));
}

/** Сложность операции против цели (§5.1). Для сенатора — с учётом сопротивления (D-046). */
export function targetDifficulty(s: GameState, t: OpTarget): number {
	if (t.kind === 'senator') {
		const sen = s.senators.find((x) => x.id === t.id);
		const r = sen ? sen.resistance : B.SENATOR_RESISTANCE_PIVOT;
		return clamp(B.OP_TARGET_DIFFICULTY.senator + r - B.SENATOR_RESISTANCE_PIVOT, 1, 5);
	}
	return B.OP_TARGET_DIFFICULTY[t.kind];
}

/** Бонусы таблицы §5.2, зависящие от ведомства и цели. */
export function situationalBonus(s: GameState, type: OpType, target: OpTarget | null): number {
	let b = 0;
	if (type === 'investigation') {
		b += B.SURV_INVEST_BONUS_PER_LEVEL * s.survLevel;
		if (hasTech(s, 'A1')) b += B.TECH_A1_INVEST_BONUS;
		if (s.reprLevel >= 1) b += B.REPR_L1_INVEST_BONUS;
	}
	if (type === 'surveillance') {
		if (s.survLevel >= 4) b += B.SURV_L4_SURVEILLANCE_BONUS;
		if (target?.kind === 'senator' && hasTech(s, 'C2')) b += B.TECH_C2_SENATOR_BONUS;
	}
	return b;
}

export interface OpChanceArgs {
	type: OpType;
	difficulty: number;
	target: OpTarget | null;
	/** Команда в порядке §5.2: стартовый состав в порядке назначения, затем подкрепление в порядке присоединения. */
	team: Agent[];
	/** Агенты сверх минимума, присоединившиеся после 50 % прогресса. */
	lateIds?: number[];
	/** Прибавки к шансу из дилемм (§9.8) и от дела (провокация): входят в bonus и в p_shown. */
	extraBonus?: number;
}

/** §9.8: прибавка от метки дела — «Поимка террористов» на деле-провокации +DL_STING.chanceBonus. */
export function caseChanceBonus(c: Case | null | undefined, type: OpType): number {
	return c && c.tag === 'sting' && type === 'terror' ? B.DL_STING.chanceBonus : 0;
}

/** Прибавки к шансу конкретной операции: дилеммы (op.dilemmaBonus) и метка дела. Видны игроку. */
export function opExtraBonus(s: GameState, op: Operation): number {
	const c = op.caseId !== null ? s.cases.find((x) => x.id === op.caseId) : undefined;
	return op.dilemmaBonus + caseChanceBonus(c, op.type);
}

/** Аргументы шанса для идущей операции (итоговый состав, поздние, прибавки). */
export function opChanceArgs(s: GameState, op: Operation): OpChanceArgs {
	return {
		type: op.type,
		difficulty: op.difficulty,
		target: op.target,
		team: teamOf(s, op),
		lateIds: op.extraJoinedLate,
		extraBonus: opExtraBonus(s, op)
	};
}

function opChanceInput(s: GameState, a: OpChanceArgs) {
	const req = B.OP_AGENTS_REQUIRED[a.type];
	const late = new Set(a.lateIds ?? []);
	// §5.2, D-066: навык и уровень — максимум по команде; слоты — агенты сверх минимума по порядку team.
	const slots = a.team.slice(req).map((x) => late.has(x.id));
	return {
		type: a.type,
		difficulty: a.difficulty,
		teamSkill: Math.max(...a.team.map((x) => primarySkill(x, a.type))),
		teamLevel: Math.max(...a.team.map((x) => x.level)),
		reinforce: reinforceBonus(slots),
		deptLevel: dept(s, opDept(a.type)),
		bonus: situationalBonus(s, a.type, a.target) + teamPerkTraitBonus(s, a.team, a.type) + (a.extraBonus ?? 0)
	};
}

/**
 * §5.2, D-066: p_shown — шанс, который видит игрок (превью, список операций).
 * Без штрафа крота: иначе превью выдавало бы крота. Добавление агента его не уменьшает.
 */
export function computeOpShownChance(s: GameState, a: OpChanceArgs): number {
	if (a.team.length === 0) return 0;
	return opShownChance(opChanceInput(s, a));
}

/** §5.2: p — шанс броска (p_shown − штраф крота). Только для броска, не для UI. */
export function computeOpChance(s: GameState, a: OpChanceArgs): number {
	if (a.team.length === 0) return 0;
	return opRollChance(computeOpShownChance(s, a), a.team.some((x) => x.moleFor !== null));
}

/**
 * Прибавка к p_shown от ещё одного агента сейчас (§10.3: «+6 %», «+4 %», после 50 % срока — вдвое меньше).
 * null — команда уже полная. Это только слот подкрепления; навык, уровень и перки нового агента
 * могут добавить сверху (UI считает точное значение через previewOperation с новым составом).
 */
export function nextReinforceBonus(type: OpType, teamSize: number, late: boolean): number | null {
	const req = B.OP_AGENTS_REQUIRED[type];
	if (teamSize >= req + B.OP_MAX_EXTRA_AGENTS) return null;
	const slot = teamSize - req;
	if (slot < 0) return 0;
	return (B.OP_REINFORCE_BONUS_BY_SLOT[slot] ?? 0) * (late ? B.OP_LATE_REINFORCE_FACTOR : 1);
}

// ------------------------------------------------------------ завершение (§5.3)

export function teamOf(s: GameState, op: Operation): Agent[] {
	return op.agentIds.map((id) => agentById(s, id)).filter((x): x is Agent => !!x);
}

/** Засвеченность от операции с учётом «Призрака» и C1 для грязных. */
function opExposure(s: GameState, op: Operation, team: Agent[], value: number): void {
	let v = value;
	if (team.some((a) => hasPerk(a, 'ghost'))) v *= B.PERK_EFFECTS.ghost.exposureMult;
	if (op.dirty) v *= dirtyExposureMult(s);
	addExposure(s, v);
}

function opRepLoss(s: GameState, value: number): void {
	// §2.2: потери от провала × legal_mult; при Репрессиях 6 — 0.
	if (s.reprLevel >= 6) return;
	addReputation(s, value * legalFailMult(dept(s, 'legal')));
}

function kompromatTargetOf(s: GameState, t: OpTarget): KompromatTarget {
	switch (t.kind) {
		case 'rival':
			return { kind: 'rival', id: t.id };
		case 'leader':
			return { kind: 'leader', id: t.id };
		case 'senator':
			return { kind: 'senator', id: t.id };
		case 'president':
			return { kind: 'president', id: s.presidentTerm };
	}
}

export function recordHighProfile(s: GameState, stateId: string): void {
	s.highProfile = s.highProfile.filter((h) => s.day - h.day < B.HIGH_PROFILE_STATE_UPGRADE.windowDays);
	s.highProfile.push({ stateId, day: s.day });
	const n = s.highProfile.filter((h) => h.stateId === stateId).length;
	const j = s.stateJurisdiction[stateId];
	if (j && n >= B.HIGH_PROFILE_STATE_UPGRADE.count && j.level < 2) {
		j.level += 1;
		if (j.level >= 2) j.holder = null;
		s.highProfile = s.highProfile.filter((h) => h.stateId !== stateId);
		log(s, 'jurisdiction_up', { stateId, level: j.level, reason: 'high_profile' });
	}
}

/** Снимок ресурсов игрока для подсчёта итога операции (без RNG). */
interface OpResourceSnapshot {
	budget: number;
	planPoints: number;
	reputation: number;
	influence: number;
	exposure: number;
	investigation: number;
	kompromatOnPlayer: number;
	/** s.nextId до разрешения: новые предметы компромата имеют id ≥ этого значения. */
	nextId: number;
}

function opResourceSnapshot(s: GameState): OpResourceSnapshot {
	return {
		budget: s.budget,
		planPoints: s.plan.points,
		reputation: s.reputation,
		influence: s.influence,
		exposure: s.exposure,
		investigation: s.investigation,
		kompromatOnPlayer: s.rivals.reduce((sum, r) => sum + r.kompromatOnPlayer, 0),
		nextId: s.nextId
	};
}

/** Округление разницы до сотых, чтобы не тащить в журнал шум float. */
function roundDelta(x: number): number {
	return Math.round(x * 100) / 100;
}

/**
 * Поля data записей op_success / op_fail про дело, цель и последствия (см. OpResultLogData в types.ts).
 * Нулевые разницы и пустые списки не пишутся.
 */
function opResultData(
	s: GameState,
	op: Operation,
	c: Case | null,
	before: OpResourceSnapshot,
	killed: number[],
	captured: number[]
): Record<string, LogValue> {
	const d: Record<string, LogValue> = {};
	if (c) {
		d.stateId = c.stateId;
		d.caseKind = c.kind;
		d.difficulty = c.difficulty;
		if (c.tag) d.caseTag = c.tag;
	}
	if (op.target) {
		d.targetKind = op.target.kind;
		if (op.target.kind !== 'president') d.targetId = op.target.id;
	}
	const after = opResourceSnapshot(s);
	const deltas: [string, number][] = [
		['budgetDelta', after.budget - before.budget],
		['planPointsDelta', after.planPoints - before.planPoints],
		['reputationDelta', after.reputation - before.reputation],
		['influenceDelta', after.influence - before.influence],
		['exposureDelta', after.exposure - before.exposure],
		['investigationDelta', after.investigation - before.investigation],
		['kompromatOnPlayerDelta', after.kompromatOnPlayer - before.kompromatOnPlayer]
	];
	for (const [k, v] of deltas) {
		const r = roundDelta(v);
		if (r !== 0) d[k] = r;
	}
	const gained = s.kompromat.filter((k) => k.id >= before.nextId).length;
	if (gained > 0) d.kompromatGained = gained;
	if (killed.length > 0) d.killedAgentIds = killed.join(',');
	if (captured.length > 0) d.capturedAgentIds = captured.join(',');
	return d;
}

/**
 * Бросок успеха операции (§5.2, шаг 3 дня). Без мутаций, кроме RNG.
 * «Успех без броска» из дилемм (op.forcedSuccess) не тратит RNG, шанс в журнале — 1.
 */
export function rollOperation(s: GameState, op: Operation): { success: boolean; p: number } {
	if (op.forcedSuccess) return { success: true, p: 1 };
	const p = computeOpChance(s, opChanceArgs(s, op));
	return { success: roll(s, p), p };
}

/** Шаг 3 дня без дилемм: бросок и последствия (тесты и операции без привязанной дилеммы). */
export function completeOperation(s: GameState, op: Operation): void {
	const r = rollOperation(s, op);
	applyOperationResult(s, op, r.success, r.p);
}

/** Последствия операции по уже известному итогу броска (§5.3, §9.8). */
export function applyOperationResult(s: GameState, op: Operation, success: boolean, p: number): void {
	const team = teamOf(s, op);
	const c = op.caseId !== null ? s.cases.find((x) => x.id === op.caseId) ?? null : null;
	// Снимок для итога в журнале (op_success / op_fail); RNG не трогает.
	const before = opResourceSnapshot(s);
	const killed: number[] = [];
	const captured: number[] = [];
	s.operations = s.operations.filter((o) => o.id !== op.id);
	s.dilemmas.pending = s.dilemmas.pending.filter((d) => d.opId !== op.id);

	// Общее: XP, счётчики лояльности, Болтун, статус.
	const mentor = team.some((a) => hasPerk(a, 'mentor'));
	for (const a of team) {
		a.lastOpSkill = bestSkillFor(a, op.type);
		let xp = success ? B.XP_SUCCESS_BASE + B.XP_PER_DIFFICULTY * op.difficulty : B.XP_FAIL;
		if (mentor && !hasPerk(a, 'mentor')) xp = Math.round(xp * B.PERK_EFFECTS.mentor.teamXpMult);
		grantXp(s, a, xp);
		if (success) a.successesThisMonth += 1;
		else a.failsThisMonth += 1;
		const blab = traitExposurePerOp(s, a);
		if (blab > 0) addExposure(s, blab);
		if (a.status === 'on_op') setIdle(a);
	}
	if (!success) s.counters.lastPlayerFailDay = s.day;
	const legal = legalFailMult(dept(s, 'legal'));
	const planPoints = (n: number) => {
		if (!op.noPlanPoint) s.plan.points += n;
	};

	switch (op.type) {
		case 'investigation': {
			if (success && c) {
				addReputation(s, B.OP_INVEST_REP_SUCCESS);
				planPoints(B.OP_INVEST_PLAN_POINTS);
				addBudget(s, opReward('investigation', c.difficulty, c.rewardMult * op.rewardMult));
				for (const a of team) if (hasTrait(a, 'hero')) addReputation(s, B.TRAIT_HERO_REP_ON_SUCCESS);
				if (c.difficulty >= B.HIGH_PROFILE_MIN_DIFFICULTY) recordHighProfile(s, c.stateId);
				// §9.8 «Тихий сигнал», «Проверить по правилам»: если сигнал реален — roll(legalCatch).
				if (c.tag === 'signal' && c.signalRef !== null) {
					if (signalIsReal(s, c.signalRef) && roll(s, B.DL_SIGNAL.legalCatch)) {
						s.history.signalsPrevented += 1;
						forgetSignal(s, c.signalRef);
						log(s, 'signal_prevented', { signalId: c.signalRef, method: 'legal', stateId: c.stateId });
					} else signalMissed(s, c.signalRef);
				}
			} else if (c) {
				opRepLoss(s, B.OP_INVEST_REP_FAIL);
				caseLostToRival(s, c, 'failed');
				if (c.tag === 'signal' && c.signalRef !== null) signalMissed(s, c.signalRef);
			}
			break;
		}
		case 'terror': {
			const sting = c?.tag === 'sting';
			if (success && c) {
				addReputation(s, B.OP_TERROR_REP_SUCCESS);
				planPoints(B.OP_TERROR_PLAN_POINTS);
				addInfluence(s, B.OP_TERROR_INFLUENCE);
				addBudget(s, opReward('terror', c.difficulty, c.rewardMult * op.rewardMult));
				if (c.raceDay !== null && s.day <= c.raceDay) addBudget(s, c.raceBonus);
				for (const a of team) if (hasTrait(a, 'hero')) addReputation(s, B.TRAIT_HERO_REP_ON_SUCCESS);
				recordHighProfile(s, c.stateId);
				// §9.8 «Провокация»: при успехе — отложенный «Судья увидел провокацию».
				if (sting) {
					const [a, b] = B.DL_STING.judgeDelayDays;
					scheduleDelayed(s, 'sting_judge', s.day + randInt(s, a, b), { stateId: c.stateId });
				}
			} else if (sting) {
				// §9.8: провал на деле-провокации — только репутация, без гибели и без ухода дела сопернику.
				addReputation(s, B.DL_STING.failRep);
			} else {
				opRepLoss(s, B.OP_TERROR_REP_FAIL);
				opExposure(s, op, team, B.OP_TERROR_FAIL_EXPOSURE * legal);
				for (const a of team) {
					// §5.3, D-066: бросок по порядку team, «прикрытие» по размеру команды на момент завершения.
					if (roll(s, terrorDeathChance(a.skills.combat, hasPerk(a, 'marksman'), team.length))) {
						removeAgent(s, a.id);
						killed.push(a.id);
						log(s, 'agent_killed', { agentId: a.id });
					}
				}
				if (c) caseLostToRival(s, c, 'failed');
			}
			// §9.8 «Поделиться с ЦРУ»: при успехе — план и репутация ЦРУ.
			if (success && op.dilemmaId === 'share_with_cia' && op.dilemmaChoice === 'share') {
				const cia = s.rivals.find((r) => r.id === 'cia' && r.alive);
				if (cia) {
					addRivalPlan(cia, B.DL_SHARE_CIA.ciaPlan);
					addRivalRep(cia, B.DL_SHARE_CIA.ciaRep);
				}
			}
			break;
		}
		case 'infiltration': {
			const t = op.target;
			const main = team[0];
			if (!t || !main) break;
			if (success) {
				main.status = 'embedded';
				main.location = t.kind === 'rival' ? { rivalId: t.id } : t.kind === 'leader' ? { leaderId: t.id } : null;
				// §9.8 «Легенда требует личной жизни»: флаг у внедрённого агента.
				main.coverLife = op.dilemmaId === 'cover_life' && op.dilemmaChoice === 'allow';
				if (t.kind === 'leader') {
					const l = s.leaders.find((x) => x.id === t.id);
					if (l) l.underWatch = true;
				}
			} else {
				opExposure(s, op, team, B.OP_INFILTRATION_FAIL.exposure * legal);
				if (t.kind === 'rival') addKompromatOnPlayer(s, t.id, B.OP_INFILTRATION_FAIL.rivalKompromat);
				if (roll(s, B.OP_INFILTRATION_FAIL.lossChance)) {
					removeAgent(s, main.id);
					captured.push(main.id);
					log(s, 'agent_captured', { agentId: main.id });
				} else {
					main.loyalty = Math.max(0, main.loyalty + B.OP_INFILTRATION_FAIL.loyalty);
				}
				// §9.8 (б), D-068: провал этой операции с «Разрешить» — team[0] раскрыт (в том числе пойман):
				// бросок «Двойной жизни агента» после броска поимки.
				if (op.dilemmaId === 'cover_life' && op.dilemmaChoice === 'allow') coverLifeScandal(s, main.id);
			}
			break;
		}
		case 'surveillance': {
			const t = op.target;
			if (!t) break;
			if (success) {
				const kt = kompromatTargetOf(s, t);
				const n = s.survLevel >= 6 ? B.SURV_L6_KOMPROMAT_MULT : 1;
				for (let i = 0; i < n; i++) addKompromat(s, kt, surveillanceKompromatStrength(s.survLevel));
				opExposure(s, op, team, B.OP_SURVEILLANCE_SUCCESS_EXPOSURE);
			} else {
				opExposure(s, op, team, B.OP_SURVEILLANCE_FAIL_EXPOSURE * legal);
				if (t.kind === 'president') {
					addInvestigation(s, B.CARDINAL_PRESIDENT_FAIL_INVESTIGATION);
					triggerHearings(s, 'president_surveillance');
				}
			}
			// «Случайная находка» (§5.3, §9.4) — при любой «Слежке».
			if (roll(s, B.RANDOM_FIND_CHANCE)) {
				const r = pickOne(s, aliveRivals(s));
				if (r) {
					addKompromat(s, { kind: 'rival', id: r.id }, 1);
					log(s, 'random_find', { rivalId: r.id });
				}
			}
			break;
		}
	}
	if (c) s.cases = s.cases.filter((x) => x.id !== c.id);
	log(s, success ? 'op_success' : 'op_fail', {
		opId: op.id,
		type: op.type,
		caseId: op.caseId,
		chance: p,
		...opResultData(s, op, c, before, killed, captured)
	});
	autopause(s, 'operationDone');
}

/** Основной навык агента для типа операции: максимальный из списка OP_PRIMARY_SKILL. */
function bestSkillFor(a: Agent, type: OpType): SkillKey {
	const ks = opPrimarySkills(type);
	let best = ks[0];
	for (const k of ks) if (a.skills[k] > a.skills[best]) best = k;
	return best;
}

