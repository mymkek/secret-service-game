// Общий API действий (D-027): applyAction(state, actor, action).
// Игрок и ИИ проходят через одну точку входа; у каждого свой набор типов действий.
// Каждый обработчик сначала проверяет условия; при dry=true только проверяет (validateAction).
import { BALANCE as B } from './balance';
import {
	agentSalary,
	applyPerk,
	currentAgentCap,
	enlist,
	forbidsDirty,
	generateAgent,
	setLoyalty
} from './agents';
import { performRivalAction, isAiAction, type AiActionRecord } from './ai/actions';
import type { AiActionType } from './ai/strategy';
import {
	reprRequirement,
	canBuildDept,
	canBuildRepr,
	canBuildSurv,
	canResearch,
	startDeptBuild,
	startReprBuild,
	startResearch,
	startSurvBuild
} from './development';
import {
	addBudget,
	addExposure,
	addInfluence,
	addInvestigation,
	addReputation,
	addRivalRep,
	addUnrest,
	agentById,
	dept,
	dirtyCostMult,
	dirtyExposureMult,
	hasTech,
	isOver,
	kompromatActive,
	log,
	markDirty,
	newId,
	removeAgent,
	setIdle
} from './effects';
import {
	absorbChance,
	fakeMax,
	hireCost,
	leakRevealChance,
	loyaltyCheckChance,
	opDuration,
	poachMoleChance,
	restoreStateChance,
	sabotageRevealChance,
	techCost,
	warrantDays
} from './formulas';
import { crossBorder, shadowCountries } from './networks';
import { caseAccessible, caseInterceptable, targetDifficulty } from './ops';
import { blackmail, questChoiceError, resolveQuestChoice, scapegoat } from './quests';
import { addRivalPlan, disbandZeroRepRivals, removeRival } from './rivals';
import { removeLeader, rollbackRepression } from './society';
import { roll } from './rng';
import type {
	Actor,
	DeptKey,
	GameState,
	Legend,
	OpTarget,
	OpType,
	PerkId,
	RecruitMethod,
	RivalId,
	SkillKey,
	TechId
} from './types';
import { LEGENDS, OP_TYPES, PERKS, RECRUIT_METHODS, RIVAL_IDS, SKILLS } from './types';

export type PlayerAction =
	| { type: 'hire'; candidateId: number }
	| { type: 'fire'; agentId: number }
	| { type: 'setSalary'; agentId: number; mult: number }
	| { type: 'medal'; agentId: number }
	| { type: 'train'; agentId: number; course: 'skill' | 'language' | 'legend'; skill?: SkillKey; countryId?: string }
	| { type: 'choosePerk'; agentId: number; perk: PerkId }
	| { type: 'buildDept'; dept: DeptKey }
	| { type: 'buildSurv' }
	| { type: 'rollbackSurv' }
	| { type: 'buildRepr' }
	| { type: 'rollbackRepr' }
	| { type: 'research'; tech: TechId }
	| { type: 'cancelResearch' }
	| { type: 'startOp'; opType: OpType; agentIds: number[]; caseId?: number; target?: OpTarget }
	| { type: 'reinforceOp'; opId: number; agentId: number }
	| { type: 'cancelOp'; opId: number }
	| { type: 'recallEmbedded'; agentId: number }
	| { type: 'fakeStats'; points: number }
	| { type: 'leak'; kompromatId: number }
	| { type: 'intercept'; caseId: number }
	| { type: 'sabotage'; rivalId: RivalId }
	| { type: 'lobby'; rivalId: RivalId }
	| { type: 'poach'; rivalId: RivalId }
	| { type: 'congressWork' }
	| { type: 'prCampaign' }
	| { type: 'absorb'; rivalId: RivalId }
	| { type: 'counterKompromat'; kompromatId: number }
	| { type: 'scapegoat'; agentId: number }
	| { type: 'loyaltyCheck' }
	| { type: 'restoreState'; stateId: string }
	| { type: 'blackmail'; kompromatId: number }
	| { type: 'removeLeader'; leaderId: number }
	| { type: 'deployAgent'; agentId: number; countryId: string; legend: Legend; prep: boolean; recruit: RecruitMethod }
	| { type: 'recallAgent'; agentId: number }
	| { type: 'questChoice'; sessionId: number; choice: string; param?: number };

export type RivalAction = { type: 'ai'; action: AiActionType };
export type GameAction = PlayerAction | RivalAction;

export type ActionResult = { ok: true; ai?: AiActionRecord } | { ok: false; error: string };

// D-037/D-051: траты по решению игрока требуют budget ≥ цены. Исключение — запуск операций (кредит, creditLimit).

/** §2.7, D-051: лимит кредита на операции. */
export function creditLimit(s: GameState): number {
	return Math.round(B.CREDIT_LIMIT_MONTHS * s.lastIncome);
}

/** D-054: минимальная слежка, которой требуют активные уровни репрессий. */
export function survRequiredByRepression(s: GameState): number {
	let need = 0;
	for (let L = 1; L <= s.reprLevel; L++) need = Math.max(need, reprRequirement(L).surv ?? 0);
	return need;
}
function needMoney(s: GameState, cost: number): string | null {
	return s.budget >= cost ? null : 'no_money';
}
function needInfluence(s: GameState, n: number): string | null {
	return s.influence >= n ? null : 'no_influence';
}
function aliveRival(s: GameState, id: RivalId) {
	return s.rivals.find((r) => r.id === id && r.alive) ?? null;
}
function dirtyCost(s: GameState, cost: number): number {
	return Math.round(cost * dirtyCostMult(s));
}
function dirtyExposure(s: GameState, e: number): void {
	addExposure(s, e * dirtyExposureMult(s));
}
function grudge(s: GameState, id: RivalId | null, days: number): void {
	const r = id ? s.rivals.find((x) => x.id === id) : null;
	if (r) r.grudgeUntilDay = Math.max(r.grudgeUntilDay, s.day + days);
}
function rivalKompromat(s: GameState, kompromatId: number) {
	const k = s.kompromat.find((x) => x.id === kompromatId);
	if (!k || k.target.kind !== 'rival' || !kompromatActive(s, k)) return null;
	return k as typeof k & { target: { kind: 'rival'; id: RivalId } };
}

/** Грязная ли операция (§6.3): любая «Слежка», «Внедрение» в соперника. */
export function opIsDirty(type: OpType, target: OpTarget | null): boolean {
	if (type === 'surveillance') return true;
	return type === 'infiltration' && target?.kind === 'rival';
}

/** Цена операции с учётом C1 для грязных. */
export function opCost(s: GameState, type: OpType, target: OpTarget | null): number {
	const base = B.OP_COST[type];
	return opIsDirty(type, target) ? dirtyCost(s, base) : base;
}

function validTarget(s: GameState, type: OpType, t: OpTarget | undefined): string | null {
	if (!t) return 'target_required';
	if (type === 'infiltration' && t.kind !== 'rival' && t.kind !== 'leader') return 'bad_target';
	if (t.kind === 'rival' && !aliveRival(s, t.id)) return 'bad_target';
	if (t.kind === 'leader' && !s.leaders.some((l) => l.id === t.id)) return 'bad_target';
	if (t.kind === 'senator') {
		if (!s.senators.some((x) => x.id === t.id)) return 'bad_target';
		if (s.survLevel < 5) return 'requirements';
	}
	// D-050, D-054: цель «президент» — C3 и текущая Слежка ≥ CARDINAL_PRESIDENT_MIN_SURV на старте.
	if (t.kind === 'president' && (s.survLevel < B.CARDINAL_PRESIDENT_MIN_SURV || !hasTech(s, 'C3'))) return 'requirements';
	return null;
}

function handlePlayer(s: GameState, a: PlayerAction, dry: boolean): string | null {
	switch (a.type) {
		case 'hire': {
			const c = s.hirePool.find((x) => x.id === a.candidateId);
			if (!c) return 'candidate_not_found';
			if (s.agents.length >= currentAgentCap(s)) return 'agent_cap';
			const e = needMoney(s, hireCost(c.rank));
			if (e) return e;
			if (dry) return null;
			addBudget(s, -hireCost(c.rank));
			s.hirePool = s.hirePool.filter((x) => x.id !== c.id);
			enlist(s, c);
			log(s, 'agent_hired', { agentId: c.id, rank: c.rank });
			return null;
		}
		case 'fire': {
			const ag = agentById(s, a.agentId);
			if (!ag) return 'agent_not_found';
			if (ag.status !== 'idle') return 'agent_busy';
			if (dry) return null;
			addBudget(s, -agentSalary(ag));
			removeAgent(s, ag.id);
			for (const o of s.agents) setLoyalty(o, o.loyalty - B.FIRE_LOYALTY_PENALTY);
			log(s, 'agent_fired', { agentId: ag.id });
			return null;
		}
		case 'setSalary': {
			const ag = agentById(s, a.agentId);
			if (!ag) return 'agent_not_found';
			if (!B.SALARY_MULTS.includes(a.mult)) return 'bad_value';
			if (dry) return null;
			ag.salaryMult = a.mult;
			return null;
		}
		case 'medal': {
			const ag = agentById(s, a.agentId);
			if (!ag) return 'agent_not_found';
			if (ag.lastMedalDay !== null && s.day - ag.lastMedalDay < B.MEDAL_COOLDOWN_DAYS) return 'cooldown';
			const e = needMoney(s, B.MEDAL_COST);
			if (e) return e;
			if (dry) return null;
			addBudget(s, -B.MEDAL_COST);
			ag.lastMedalDay = s.day;
			setLoyalty(ag, ag.loyalty + B.MEDAL_LOYALTY);
			return null;
		}
		case 'train': {
			const ag = agentById(s, a.agentId);
			if (!ag) return 'agent_not_found';
			if (ag.status !== 'idle') return 'agent_busy';
			let cost = 0;
			let days = 0;
			if (a.course === 'skill') {
				if (!a.skill || !SKILLS.includes(a.skill)) return 'bad_value';
				if (ag.skills[a.skill] >= B.TRAINING_SKILL_CAP) return 'skill_cap';
				cost = B.TRAINING_SKILL_COST;
				days = B.TRAINING_SKILL_DAYS;
			} else if (a.course === 'language') {
				if (!a.countryId || !shadowCountries(s).includes(a.countryId)) return 'bad_value';
				if (ag.languages.includes(a.countryId)) return 'already_known';
				cost = B.TRAINING_LANGUAGE_COST;
				days = B.TRAINING_LANGUAGE_DAYS;
			} else if (a.course === 'legend') {
				if (ag.legendBonus) return 'already_known';
				cost = B.TRAINING_LEGEND_COST;
				days = B.TRAINING_LEGEND_DAYS;
			} else return 'bad_value';
			const e = needMoney(s, cost);
			if (e) return e;
			if (dry) return null;
			addBudget(s, -cost);
			ag.status = 'training';
			s.trainings.push({
				id: newId(s),
				agentId: ag.id,
				course: a.course,
				skill: a.course === 'skill' ? a.skill! : null,
				countryId: a.course === 'language' ? a.countryId! : null,
				doneDay: s.day + days
			});
			return null;
		}
		case 'choosePerk': {
			const ag = agentById(s, a.agentId);
			if (!ag) return 'agent_not_found';
			if (ag.pendingPerks <= 0) return 'no_pending_perk';
			if (!PERKS.includes(a.perk) || ag.perks.includes(a.perk)) return 'bad_value';
			if (dry) return null;
			applyPerk(ag, a.perk);
			return null;
		}
		case 'buildDept': {
			const e = canBuildDept(s, a.dept);
			if (e || dry) return e;
			startDeptBuild(s, a.dept);
			return null;
		}
		case 'buildSurv': {
			const e = canBuildSurv(s);
			if (e || dry) return e;
			startSurvBuild(s);
			return null;
		}
		case 'rollbackSurv': {
			if (s.survLevel <= 0) return 'min_level';
			if (s.builds.some((b) => b.kind === 'surv')) return 'already_building';
			// D-054: нельзя опустить слежку ниже требования активного уровня репрессий.
			if (s.survLevel - 1 < survRequiredByRepression(s)) return 'repr_requires_surv';
			if (dry) return null;
			s.survLevel -= 1;
			log(s, 'surv_rollback', { level: s.survLevel });
			return null;
		}
		case 'buildRepr': {
			const e = canBuildRepr(s);
			if (e || dry) return e;
			startReprBuild(s);
			return null;
		}
		case 'rollbackRepr': {
			if (s.reprLevel <= 0) return 'min_level';
			if (s.builds.some((b) => b.kind === 'repr')) return 'already_building';
			if (dry) return null;
			rollbackRepression(s);
			return null;
		}
		case 'research': {
			const e = canResearch(s, a.tech);
			if (e || dry) return e;
			startResearch(s, a.tech);
			return null;
		}
		case 'cancelResearch': {
			if (!s.research) return 'no_research';
			if (dry) return null;
			// §4.5, D-038: возврат round(RESEARCH_CANCEL_REFUND × цена), прогресс теряется.
			addBudget(s, Math.round(B.RESEARCH_CANCEL_REFUND * techCost(s.research.techId)));
			if (s.apexChosen === s.research.techId) s.apexChosen = null;
			s.research = null;
			return null;
		}
		case 'startOp':
			return startOp(s, a, dry);
		case 'reinforceOp': {
			const op = s.operations.find((o) => o.id === a.opId);
			if (!op) return 'op_not_found';
			const ag = agentById(s, a.agentId);
			if (!ag || ag.status !== 'idle') return 'agent_busy';
			if (op.agentIds.length >= B.OP_AGENTS_REQUIRED[op.type] + B.OP_MAX_EXTRA_AGENTS) return 'team_full';
			if (op.dirty && forbidsDirty(s, ag)) return 'agent_forbids_dirty';
			if (dry) return null;
			op.agentIds.push(ag.id);
			const progress = (s.day - op.startDay) / Math.max(1, op.endDay - op.startDay);
			if (progress >= 0.5) op.extraJoinedLate.push(ag.id);
			ag.status = 'on_op';
			return null;
		}
		case 'cancelOp': {
			const op = s.operations.find((o) => o.id === a.opId);
			if (!op) return 'op_not_found';
			if (dry) return null;
			addBudget(s, Math.round(op.cost * B.OP_CANCEL_REFUND));
			for (const id of op.agentIds) {
				const ag = agentById(s, id);
				if (ag) setIdle(ag);
			}
			const c = s.cases.find((x) => x.id === op.caseId);
			if (c) c.takenByOpId = null;
			s.operations = s.operations.filter((o) => o.id !== op.id);
			log(s, 'op_cancelled', { opId: op.id });
			return null;
		}
		case 'recallEmbedded': {
			const ag = agentById(s, a.agentId);
			if (!ag || ag.status !== 'embedded') return 'agent_not_embedded';
			if (dry) return null;
			const loc = ag.location;
			if (loc && 'leaderId' in loc) {
				const l = s.leaders.find((x) => x.id === loc.leaderId);
				if (l) l.underWatch = false;
			}
			setIdle(ag);
			return null;
		}
		case 'fakeStats': {
			if (!Number.isInteger(a.points) || a.points < 1) return 'bad_value';
			if (s.plan.fakePoints + a.points > fakeMax(s.plan.target)) return 'fake_limit';
			if (dry) return null;
			s.plan.fakePoints += a.points;
			dirtyExposure(s, B.FAKE_EXPOSURE_PER_POINT * a.points);
			markDirty(s);
			return null;
		}
		case 'leak': {
			const k = rivalKompromat(s, a.kompromatId);
			if (!k) return 'kompromat_not_found';
			const r = aliveRival(s, k.target.id);
			if (!r) return 'bad_target';
			const cost = dirtyCost(s, B.ACT_LEAK.cost);
			const e = needMoney(s, cost);
			if (e || dry) return e;
			const L = B.ACT_LEAK;
			addBudget(s, -cost);
			s.kompromat = s.kompromat.filter((x) => x.id !== k.id);
			addRivalRep(r, L.repPerStrength * k.strength);
			dirtyExposure(s, L.exposure);
			markDirty(s);
			const revealed = roll(s, leakRevealChance(dept(s, 'cyber')));
			if (revealed) {
				addReputation(s, L.revealRep);
				addExposure(s, L.revealExposure);
				grudge(s, r.id, L.grudgeDays);
			}
			log(s, 'leak', { rivalId: r.id, strength: k.strength, revealed });
			return null;
		}
		case 'intercept': {
			const c = s.cases.find((x) => x.id === a.caseId);
			if (!c || !caseInterceptable(s, c)) return 'case_not_interceptable';
			const I = B.ACT_INTERCEPT;
			const e = needMoney(s, I.cost) ?? needInfluence(s, I.influence);
			if (e || dry) return e;
			addBudget(s, -I.cost);
			addInfluence(s, -I.influence);
			c.intercepted = true;
			const holder = s.stateJurisdiction[c.stateId]?.holder ?? null;
			const hr = holder ? aliveRival(s, holder) : null;
			// D-047: без держателя план никому не режется; при неудаче только влияние, без обиды.
			if (hr) addRivalPlan(hr, I.targetPlan);
			if (roll(s, I.riskChance)) {
				addInfluence(s, I.riskInfluence);
				grudge(s, hr?.id ?? null, I.grudgeDays);
			}
			log(s, 'intercept', { caseId: c.id, rivalId: hr?.id ?? null });
			return null;
		}
		case 'sabotage': {
			const r = aliveRival(s, a.rivalId);
			if (!r) return 'bad_target';
			const ag = s.agents.find((x) => x.status === 'embedded' && x.location && 'rivalId' in x.location && x.location.rivalId === r.id);
			if (!ag) return 'need_embedded_agent';
			const S = B.ACT_SABOTAGE;
			const cost = dirtyCost(s, S.cost);
			const e = needMoney(s, cost);
			if (e || dry) return e;
			addBudget(s, -cost);
			addRivalPlan(r, S.targetPlan);
			addRivalRep(r, S.targetRep);
			dirtyExposure(s, S.exposure);
			markDirty(s);
			const revealed = roll(s, sabotageRevealChance(r.sabotageCount));
			r.sabotageCount += 1;
			if (revealed) {
				addReputation(s, S.revealRep);
				addExposure(s, S.revealExposure);
				addInvestigation(s, S.revealInvestigation);
				removeAgent(s, ag.id);
			}
			log(s, 'sabotage', { rivalId: r.id, revealed });
			return null;
		}
		case 'lobby': {
			const r = aliveRival(s, a.rivalId);
			if (!r) return 'bad_target';
			const L = B.ACT_LOBBY;
			const e = needMoney(s, L.cost) ?? needInfluence(s, Math.max(L.minInfluence, L.influence));
			if (e || dry) return e;
			addBudget(s, -L.cost);
			addInfluence(s, -L.influence);
			r.lobbyMult = Math.max(L.multMin, r.lobbyMult * L.targetMult);
			if (roll(s, L.backfireChance)) addInfluence(s, L.backfireInfluence);
			log(s, 'lobby', { rivalId: r.id });
			return null;
		}
		case 'poach': {
			const r = aliveRival(s, a.rivalId);
			if (!r) return 'bad_target';
			if (s.agents.length >= currentAgentCap(s)) return 'agent_cap';
			const P = B.ACT_POACH;
			const e = needMoney(s, P.cost);
			if (e || dry) return e;
			addBudget(s, -P.cost);
			const ag = generateAgent(s, { rank: 'experienced', traits: false });
			ag.loyalty = P.loyalty;
			addRivalPlan(r, P.targetPlan);
			if (roll(s, poachMoleChance(dept(s, 'counterintel')))) ag.moleFor = r.id;
			enlist(s, ag);
			log(s, 'poach', { rivalId: r.id, agentId: ag.id });
			return null;
		}
		case 'congressWork': {
			const C = B.ACT_CONGRESS_WORK;
			if (s.day < s.counters.congressWorkReadyDay) return 'cooldown';
			const e = needMoney(s, C.cost);
			if (e || dry) return e;
			addBudget(s, -C.cost);
			addInfluence(s, C.influence);
			s.counters.congressWorkReadyDay = s.day + C.cooldownDays;
			return null;
		}
		case 'prCampaign': {
			const P = B.PR_CAMPAIGN;
			if (s.day < s.counters.prCampaignReadyDay) return 'cooldown';
			const e = needMoney(s, P.cost);
			if (e || dry) return e;
			addBudget(s, -P.cost);
			addReputation(s, P.repBase + P.repPerLevel * dept(s, 'pr'));
			s.counters.prCampaignReadyDay = s.day + P.cooldownDays;
			return null;
		}
		case 'absorb': {
			const r = aliveRival(s, a.rivalId);
			if (!r) return 'bad_target';
			const A = B.ACT_ABSORB;
			if (r.reputation >= A.maxTargetRep) return 'requirements';
			if (s.influence < A.minInfluence) return 'no_influence';
			if (s.tasks.some((t) => t.kind === 'absorb' && t.rivalId === r.id)) return 'already_running';
			const e = needMoney(s, A.cost) ?? needInfluence(s, A.influence);
			if (e || dry) return e;
			// D-052: шанс фиксируется при запуске — по влиянию ДО оплаты и репутации цели сейчас.
			const chance = absorbChance(s.influence, r.reputation);
			addBudget(s, -A.cost);
			addInfluence(s, -A.influence);
			s.tasks.push({ id: newId(s), kind: 'absorb', doneDay: s.day + A.days, rivalId: r.id, questSessionId: null, chance });
			return null;
		}
		case 'counterKompromat': {
			const k = rivalKompromat(s, a.kompromatId);
			if (!k) return 'kompromat_not_found';
			if (dry) return null;
			const C = B.ACT_COUNTER_KOMPROMAT;
			s.kompromat = s.kompromat.filter((x) => x.id !== k.id);
			addInvestigation(s, C.investigationBase + C.investigationPerStrength * k.strength, false);
			const r = s.rivals.find((x) => x.id === k.target.id);
			if (r) r.digBlockedUntilDay = Math.max(r.digBlockedUntilDay, s.day + C.digBlockDays);
			dirtyExposure(s, C.exposure);
			markDirty(s);
			return null;
		}
		case 'scapegoat': {
			const ag = agentById(s, a.agentId);
			if (!ag || ag.status !== 'idle') return 'agent_busy';
			if (dry) return null;
			scapegoat(s, ag.id);
			return null;
		}
		case 'loyaltyCheck': {
			const C = B.ACT_LOYALTY_CHECK;
			if (s.tasks.some((t) => t.kind === 'loyalty_check')) return 'already_running';
			const e = needMoney(s, C.cost);
			if (e || dry) return e;
			addBudget(s, -C.cost);
			s.tasks.push({ id: newId(s), kind: 'loyalty_check', doneDay: s.day + C.days, rivalId: null, questSessionId: null, chance: null });
			return null;
		}
		case 'restoreState': {
			const j = s.stateJurisdiction[a.stateId];
			if (!j) return 'bad_target';
			if (j.level >= 2) return 'max_level';
			const R = B.ACT_RESTORE_STATE;
			const e = needMoney(s, R.cost) ?? needInfluence(s, R.influence);
			if (e || dry) return e;
			const hp = s.highProfile.filter((h) => h.stateId === a.stateId && s.day - h.day < B.HIGH_PROFILE_STATE_UPGRADE.windowDays).length;
			const p = restoreStateChance(s.influence, hp);
			addBudget(s, -R.cost);
			addInfluence(s, -R.influence);
			const ok = roll(s, p);
			if (ok) {
				j.level += 1;
				if (j.level >= 2) j.holder = null;
			}
			log(s, 'restore_state', { stateId: a.stateId, success: ok });
			return null;
		}
		case 'blackmail': {
			const k = s.kompromat.find((x) => x.id === a.kompromatId);
			if (!k || k.target.kind !== 'senator' || !kompromatActive(s, k)) return 'kompromat_not_found';
			if ((k.usedCooldownUntil ?? 0) > s.day) return 'cooldown';
			if (dry) return null;
			blackmail(s, k);
			return null;
		}
		case 'removeLeader': {
			if (s.reprLevel < 5) return 'requirements';
			const l = s.leaders.find((x) => x.id === a.leaderId);
			if (!l) return 'bad_target';
			if (dry) return null;
			removeLeader(s, l.id);
			addUnrest(s, B.REPR_L5_REMOVE_LEADER.unrest);
			addExposure(s, B.REPR_L5_REMOVE_LEADER.exposure);
			markDirty(s);
			log(s, 'leader_removed', { leaderId: l.id });
			return null;
		}
		case 'deployAgent': {
			if (!hasTech(s, 'B1')) return 'requirements';
			const ag = agentById(s, a.agentId);
			if (!ag || ag.status !== 'idle') return 'agent_busy';
			if (!shadowCountries(s).includes(a.countryId)) return 'bad_target';
			if (!LEGENDS.includes(a.legend) || !RECRUIT_METHODS.includes(a.recruit)) return 'bad_value';
			const cost = B.LEGEND_COST[a.legend] + (a.recruit === 'money' ? B.RECRUIT_METHODS.money.cost : 0);
			const e = needMoney(s, cost);
			if (e || dry) return e;
			addBudget(s, -B.LEGEND_COST[a.legend]);
			const m = {
				id: newId(s),
				agentId: ag.id,
				countryId: a.countryId,
				legend: a.legend,
				recruit: a.recruit,
				prepared: a.prep,
				stage: 'prep' as const,
				stageEndDay: s.day + B.ZABROSKA_PREP_DAYS,
				borderMult: 1
			};
			s.missions.push(m);
			if (a.prep) ag.status = 'training';
			else crossBorder(s, m, ag);
			log(s, 'agent_deployed', { agentId: ag.id, countryId: a.countryId, legend: a.legend });
			return null;
		}
		case 'recallAgent': {
			const ag = agentById(s, a.agentId);
			if (!ag || ag.status !== 'abroad') return 'agent_not_abroad';
			if (s.missions.some((m) => m.agentId === ag.id)) return 'agent_busy';
			const loc = ag.location;
			if (!loc || !('countryId' in loc)) return 'agent_not_abroad';
			if (dry) return null;
			const n = s.networks[loc.countryId];
			if (n) {
				n.agentIds = n.agentIds.filter((x) => x !== ag.id);
				n.level = Math.max(0, n.level - 1);
			}
			s.missions.push({
				id: newId(s),
				agentId: ag.id,
				countryId: loc.countryId,
				legend: ag.legend ?? 'businessman',
				recruit: 'ideology',
				prepared: false,
				stage: 'recall',
				stageEndDay: s.day + B.NET_RECALL_DAYS,
				borderMult: 1
			});
			return null;
		}
		case 'questChoice': {
			const q = s.quests.find((x) => x.id === a.sessionId);
			if (!q) return 'quest_not_found';
			if (dry) return questChoiceError(s, q, a.choice, a.param ?? null);
			return resolveQuestChoice(s, a.sessionId, a.choice, a.param ?? null);
		}
	}
}

function startOp(s: GameState, a: Extract<PlayerAction, { type: 'startOp' }>, dry: boolean): string | null {
	if (!OP_TYPES.includes(a.opType)) return 'bad_value';
	const req = B.OP_AGENTS_REQUIRED[a.opType];
	const ids = [...new Set(a.agentIds)];
	if (ids.length < req) return 'not_enough_agents';
	if (ids.length > req + B.OP_MAX_EXTRA_AGENTS) return 'too_many_agents';
	const team = ids.map((id) => agentById(s, id));
	if (team.some((x) => !x || x.status !== 'idle')) return 'agent_busy';
	let difficulty = 1;
	let caseId: number | null = null;
	let target: OpTarget | null = null;
	if (a.opType === 'investigation' || a.opType === 'terror') {
		const c = a.caseId !== undefined ? s.cases.find((x) => x.id === a.caseId) : undefined;
		if (!c) return 'case_not_found';
		if (c.takenByOpId !== null) return 'case_taken';
		if ((a.opType === 'terror') !== (c.kind === 'terror')) return 'bad_case_kind';
		if (!caseAccessible(s, c)) return 'no_jurisdiction';
		difficulty = c.difficulty;
		caseId = c.id;
	} else {
		const e = validTarget(s, a.opType, a.target);
		if (e) return e;
		target = a.target!;
		difficulty = targetDifficulty(s, target);
	}
	const dirty = opIsDirty(a.opType, target);
	if (dirty && team.some((x) => x && forbidsDirty(s, x))) return 'agent_forbids_dirty';
	const cost = opCost(s, a.opType, target);
	// D-051: операции можно запускать в кредит — до −creditLimit после оплаты.
	const e = s.budget - cost >= -creditLimit(s) ? null : 'credit_limit';
	if (e || dry) return e;

	addBudget(s, -cost);
	const illegal = target?.kind === 'senator' || target?.kind === 'president';
	const warrant = a.opType === 'surveillance' && s.survLevel < 6 && !illegal ? warrantDays(dept(s, 'legal')) : 0;
	const id = newId(s);
	s.operations.push({
		id,
		type: a.opType,
		caseId,
		target,
		agentIds: ids,
		extraJoinedLate: [],
		startDay: s.day,
		warrantEndDay: s.day + warrant,
		endDay: s.day + warrant + opDuration(a.opType, s.survLevel),
		cost,
		difficulty,
		dirty
	});
	for (const ag of team) if (ag) ag.status = 'on_op';
	if (caseId !== null) s.cases.find((x) => x.id === caseId)!.takenByOpId = id;
	if (illegal) dirtyExposure(s, B.ILLEGAL_TARGET_EXPOSURE);
	if (dirty) markDirty(s);
	log(s, 'op_started', { opId: id, type: a.opType, caseId });
	return null;
}

/** Завершение таймерных действий (проверка лояльности, поглощение) — шаг 2 дня. */
export function tickTasks(s: GameState): void {
	for (const t of [...s.tasks].sort((a, b) => a.id - b.id)) {
		if (t.doneDay > s.day) continue;
		s.tasks = s.tasks.filter((x) => x.id !== t.id);
		if (t.kind === 'loyalty_check') {
			const p = loyaltyCheckChance(dept(s, 'counterintel'));
			for (const ag of [...s.agents]) {
				if (!ag.moleFor) continue;
				if (roll(s, p)) {
					removeAgent(s, ag.id);
					log(s, 'mole_found', { agentId: ag.id, rivalId: ag.moleFor });
				}
			}
			log(s, 'loyalty_check_done', {});
		} else if (t.kind === 'absorb' && t.rivalId) {
			const r = aliveRival(s, t.rivalId);
			if (!r) continue;
			const A = B.ACT_ABSORB;
			if (roll(s, t.chance ?? absorbChance(s.influence, r.reputation))) {
				removeRival(s, r.id, true);
				// Штаты цели переходят игроку внутри removeRival.
				// D-047: новички из поглощения — без трейтов.
				for (let i = 0; i < A.novices; i++) enlist(s, generateAgent(s, { rank: 'novice', traits: false }));
			} else {
				addInfluence(s, A.failInfluence);
				grudge(s, r.id, A.grudgeDays);
				log(s, 'absorb_failed', { rivalId: r.id });
			}
		}
	}
}

/**
 * Единая точка входа (D-027). actor = 'player' или id соперника.
 * Действия игрока: PlayerAction; соперника: { type: 'ai', action }.
 */
export function applyAction(s: GameState, actor: Actor, action: GameAction): ActionResult {
	if (isOver(s)) return { ok: false, error: 'game_over' };
	if (actor === 'player') {
		if (action.type === 'ai') return { ok: false, error: 'bad_actor' };
		const err = handlePlayer(s, action, false);
		if (err) return { ok: false, error: err };
		disbandZeroRepRivals(s);
		return { ok: true };
	}
	if (!RIVAL_IDS.includes(actor)) return { ok: false, error: 'bad_actor' };
	if (action.type !== 'ai' || !isAiAction(action.action)) return { ok: false, error: 'bad_action' };
	if (!aliveRival(s, actor)) return { ok: false, error: 'rival_dead' };
	const ai = performRivalAction(s, actor, action.action);
	disbandZeroRepRivals(s);
	return { ok: true, ai };
}

/** Проверка без применения (для UI: доступна ли кнопка). null — можно. */
export function validateAction(s: GameState, action: PlayerAction): string | null {
	if (isOver(s)) return 'game_over';
	return handlePlayer(s, action, true);
}
