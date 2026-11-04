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
	opSuccessChance,
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
import type { Agent, Case, CaseKind, CaseSource, GameState, KompromatTarget, Operation, OpTarget, OpType, RivalId, SkillKey } from './types';

// ------------------------------------------------------------ доступ к делам (§5.4)

/** Может ли игрок взять дело по полномочиям в штате. */
export function caseAccessible(s: GameState, c: Case): boolean {
	if (c.intercepted) return true;
	if (dept(s, 'cyber') < c.minCyber) return false;
	const j = s.stateJurisdiction[c.stateId];
	if (!j) return false;
	if (j.level >= 2) return true;
	if (j.level === 1) return c.kind === 'regular' && c.difficulty <= B.PARTIAL_JURISDICTION_MAX_DIFFICULTY;
	return false;
}

/** Дело недоступно только из-за полномочий — кандидат на «Перехват дела». */
export function caseInterceptable(s: GameState, c: Case): boolean {
	if (c.intercepted || c.takenByOpId !== null) return false;
	if (dept(s, 'cyber') < c.minCyber) return false;
	return !caseAccessible(s, c);
}

function stateWeights(s: GameState): number[] {
	return US_STATES.map((id) => {
		if ((s.strikes[id] ?? 0) > s.day) return 0;
		if (s.leaders.some((l) => l.stateId === id && l.archetype === 'union' && l.influence >= B.LEADER_STRIKE_INFLUENCE)) return 0;
		return s.config.stateCaseWeights[id] ?? 1;
	});
}

/** Создаёт дело. Штат выбирается pickWeighted (§5.4); при нулевой сумме весов дела нет. */
export function spawnCase(
	s: GameState,
	kind: CaseKind,
	opts: { difficulty?: number; timerDays?: number | null; rewardMult?: number; source?: CaseSource; minCyber?: number } = {}
): Case | null {
	let difficulty = opts.difficulty;
	if (difficulty === undefined) {
		const w = kind === 'terror' ? B.TERROR_DIFFICULTY_WEIGHTS : B.CASE_DIFFICULTY_WEIGHTS;
		difficulty = pickWeightedIndex(s, w) + 1;
		if (difficulty <= 0) return null;
	}
	// §5.4, D-045: сила улики — один вызов RNG сразу после броска сложности, для любого дела.
	const [emin, emax] = B.EVIDENCE_STRENGTH_RANGE;
	const evidenceStrength = randInt(s, emin, emax);
	const si = pickWeightedIndex(s, stateWeights(s));
	if (si < 0) return null;
	const timer = opts.timerDays === undefined ? caseTimer(kind, s.survLevel) : opts.timerDays;
	const c: Case = {
		id: newId(s),
		kind,
		stateId: US_STATES[si],
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
		takenByOpId: null
	};
	s.cases.push(c);
	log(s, 'case_new', { caseId: c.id, kind, stateId: c.stateId, difficulty });
	return c;
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

/** Шаг 4 дня: генерация и истечение дел. */
export function dailyCases(s: GameState): void {
	const m = month(s);
	if (roll(s, casesPerMonth(m, hasTech(s, 'A2')) / B.DAYS_PER_MONTH)) spawnCase(s, 'regular');
	if (roll(s, B.TERROR_PER_MONTH / B.DAYS_PER_MONTH)) spawnCase(s, 'terror');
	// Дела без таймера — в первый день месяца (D-047).
	if (s.day % B.DAYS_PER_MONTH === 1) {
		if (s.reprLevel >= 3)
			for (let i = 0; i < B.REPR_L3_EXTRA_CASES; i++) spawnCase(s, 'regular', { timerDays: null, source: 'repr3' });
		if (s.counters.informantCasesUntilDay > s.day)
			for (let i = 0; i < B.QUEST_INFORMANT.casesPerMonth; i++) spawnCase(s, 'regular', { timerDays: null, source: 'informant' });
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
		if (c.takenByOpId === null && c.expiresDay !== null && c.expiresDay <= s.day) caseLostToRival(s, c, 'expired');
		else {
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
	team: Agent[];
	/** Агенты сверх минимума, присоединившиеся после 50 % прогресса. */
	lateIds?: number[];
}

/** Полный шанс операции на заданной команде (используется и для превью в UI). */
export function computeOpChance(s: GameState, a: OpChanceArgs): number {
	if (a.team.length === 0) return 0;
	const req = B.OP_AGENTS_REQUIRED[a.type];
	const teamSkill = Math.max(...a.team.map((x) => primarySkill(x, a.type)));
	const teamLevel = a.team.reduce((sum, x) => sum + x.level, 0) / a.team.length;
	const extras = a.team.slice(req, req + B.OP_MAX_EXTRA_AGENTS);
	const late = new Set(a.lateIds ?? []);
	const extra = extras.reduce((sum, x) => sum + (late.has(x.id) ? B.OP_LATE_REINFORCE_FACTOR : 1), 0);
	return opSuccessChance({
		type: a.type,
		difficulty: a.difficulty,
		teamSkill,
		teamLevel,
		extra,
		deptLevel: dept(s, opDept(a.type)),
		bonus: situationalBonus(s, a.type, a.target) + teamPerkTraitBonus(s, a.team, a.type),
		hasMole: a.team.some((x) => x.moleFor !== null)
	});
}

// ------------------------------------------------------------ завершение (§5.3)

function teamOf(s: GameState, op: Operation): Agent[] {
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

function recordHighProfile(s: GameState, stateId: string): void {
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

/** Шаг 3 дня: бросок успеха и последствия для одной операции. */
export function completeOperation(s: GameState, op: Operation): void {
	const team = teamOf(s, op);
	const c = op.caseId !== null ? s.cases.find((x) => x.id === op.caseId) ?? null : null;
	const p = computeOpChance(s, { type: op.type, difficulty: op.difficulty, target: op.target, team, lateIds: op.extraJoinedLate });
	const success = roll(s, p);
	s.operations = s.operations.filter((o) => o.id !== op.id);

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

	switch (op.type) {
		case 'investigation': {
			if (success && c) {
				addReputation(s, B.OP_INVEST_REP_SUCCESS);
				s.plan.points += B.OP_INVEST_PLAN_POINTS;
				addBudget(s, opReward('investigation', c.difficulty, c.rewardMult));
				for (const a of team) if (hasTrait(a, 'hero')) addReputation(s, B.TRAIT_HERO_REP_ON_SUCCESS);
				if (c.difficulty >= B.HIGH_PROFILE_MIN_DIFFICULTY) recordHighProfile(s, c.stateId);
			} else if (c) {
				opRepLoss(s, B.OP_INVEST_REP_FAIL);
				caseLostToRival(s, c, 'failed');
			}
			break;
		}
		case 'terror': {
			if (success && c) {
				addReputation(s, B.OP_TERROR_REP_SUCCESS);
				s.plan.points += B.OP_TERROR_PLAN_POINTS;
				addInfluence(s, B.OP_TERROR_INFLUENCE);
				addBudget(s, opReward('terror', c.difficulty, c.rewardMult));
				if (c.raceDay !== null && s.day <= c.raceDay) addBudget(s, c.raceBonus);
				for (const a of team) if (hasTrait(a, 'hero')) addReputation(s, B.TRAIT_HERO_REP_ON_SUCCESS);
				recordHighProfile(s, c.stateId);
			} else {
				opRepLoss(s, B.OP_TERROR_REP_FAIL);
				opExposure(s, op, team, B.OP_TERROR_FAIL_EXPOSURE * legal);
				for (const a of team) {
					if (roll(s, terrorDeathChance(a.skills.combat, hasPerk(a, 'marksman')))) {
						removeAgent(s, a.id);
						log(s, 'agent_killed', { agentId: a.id });
					}
				}
				if (c) caseLostToRival(s, c, 'failed');
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
				if (t.kind === 'leader') {
					const l = s.leaders.find((x) => x.id === t.id);
					if (l) l.underWatch = true;
				}
			} else {
				opExposure(s, op, team, B.OP_INFILTRATION_FAIL.exposure * legal);
				if (t.kind === 'rival') addKompromatOnPlayer(s, t.id, B.OP_INFILTRATION_FAIL.rivalKompromat);
				if (roll(s, B.OP_INFILTRATION_FAIL.lossChance)) {
					removeAgent(s, main.id);
					log(s, 'agent_captured', { agentId: main.id });
				} else {
					main.loyalty = Math.max(0, main.loyalty + B.OP_INFILTRATION_FAIL.loyalty);
				}
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
	log(s, success ? 'op_success' : 'op_fail', { opId: op.id, type: op.type, caseId: op.caseId, chance: p });
	autopause(s, 'operationDone');
}

/** Основной навык агента для типа операции: максимальный из списка OP_PRIMARY_SKILL. */
function bestSkillFor(a: Agent, type: OpType): SkillKey {
	const ks = opPrimarySkills(type);
	let best = ks[0];
	for (const k of ks) if (a.skills[k] > a.skills[best]) best = k;
	return best;
}

/** Шаг 3 дня: все операции с истёкшим таймером в порядке id. */
export function completeDueOperations(s: GameState): void {
	const due = s.operations.filter((o) => o.endDay <= s.day).sort((a, b) => a.id - b.id);
	for (const op of due) completeOperation(s, op);
}
