// Низкоуровневые изменения состояния: шкалы с клампом (§0), журнал, автопауза,
// мгновенные поражения. Все модули ядра меняют ресурсы только через эти функции.
import { BALANCE as B } from './balance';
import { applyReputationChange, clamp, legalInvMult, monthOfDay, score, unrestOneOff } from './formulas';
import type {
	Agent,
	AutopauseKey,
	DefeatReason,
	DeptKey,
	GameState,
	KompromatTarget,
	LogValue,
	Rival,
	RivalId,
	TechId,
	VictoryPath
} from './types';
import { RIVAL_IDS } from './types';

export function newId(s: GameState): number {
	return s.nextId++;
}

export function isOver(s: GameState): boolean {
	return s.outcome.status !== 'active';
}

// ------------------------------------------------------------ журнал и автопауза

export function log(
	s: GameState,
	kind: string,
	data: Record<string, LogValue> = {},
	source: RivalId | 'unknown' | null = null
): void {
	s.log.push({ id: newId(s), day: s.day, kind, data, source });
	const extra = s.log.length - B.LOG_MAX_ENTRIES;
	if (extra > 0) s.log.splice(0, extra);
}

/** Ставит паузу, если флаг автопаузы включён (§3.4). */
export function autopause(s: GameState, key: AutopauseKey): void {
	if (!s.autopause[key]) return;
	s.paused = true;
	if (!s.pauseReasons.includes(key)) s.pauseReasons.push(key);
}

// ------------------------------------------------------------ доступ

export function dept(s: GameState, key: DeptKey): number {
	return s.departments[key];
}
export function hasTech(s: GameState, t: TechId): boolean {
	return s.techs.includes(t);
}
export function rival(s: GameState, id: RivalId): Rival {
	const r = s.rivals.find((x) => x.id === id);
	if (!r) throw new Error(`rival ${id} missing`);
	return r;
}
/** Живые соперники в фиксированном порядке police → cia → secret_service (§0). */
export function aliveRivals(s: GameState): Rival[] {
	return RIVAL_IDS.map((id) => rival(s, id)).filter((r) => r.alive);
}
export function agentById(s: GameState, id: number): Agent | undefined {
	return s.agents.find((a) => a.id === id);
}
export function month(s: GameState): number {
	return monthOfDay(s.day);
}
/** Множитель грязных цен при C1 (§4.5). */
export function dirtyCostMult(s: GameState): number {
	return hasTech(s, 'C1') ? B.TECH_C1_DIRTY_COST_MULT : 1;
}
/** Множитель засвеченности грязных действий при C1. */
export function dirtyExposureMult(s: GameState): number {
	return hasTech(s, 'C1') ? B.TECH_C1_DIRTY_EXPOSURE_MULT : 1;
}

// ------------------------------------------------------------ шкалы (§0: кламп после каждого изменения)

export function addReputation(s: GameState, delta: number): void {
	s.reputation = applyReputationChange(s.reputation, delta);
	if (s.reputation <= 0) defeat(s, 'reputation');
}

export function addInfluence(s: GameState, delta: number): void {
	s.influence = clamp(s.influence + delta, 0, 100);
}

export function addExposure(s: GameState, delta: number): void {
	s.exposure = clamp(s.exposure + delta, 0, 100);
}

/**
 * Прирост «Под следствием» (§2.6). Положительный прирост умножается на legal_inv_mult,
 * если applyLegal; снижение — как есть.
 */
export function addInvestigation(s: GameState, delta: number, applyLegal = true): void {
	const d = delta > 0 && applyLegal ? delta * legalInvMult(dept(s, 'legal')) : delta;
	const before = s.investigation;
	s.investigation = clamp(s.investigation + d, 0, 100);
	if (before < B.INVESTIGATION_FREEZE_THRESHOLD && s.investigation >= B.INVESTIGATION_FREEZE_THRESHOLD) {
		if (!s.counters.investigationAbove50) {
			s.counters.investigationAbove50 = true;
			log(s, 'director_questioning', { investigation: s.investigation });
			autopause(s, 'investigationThreshold');
		}
	}
	if (s.investigation >= B.INVESTIGATION_ARREST_THRESHOLD) defeat(s, 'arrested');
}

/** Разовое изменение недовольства (обрезка при Репрессиях 7, §4.4.3). */
export function addUnrest(s: GameState, delta: number): void {
	s.unrest = unrestOneOff(s.unrest, delta, s.reprLevel);
}

export function addBudget(s: GameState, delta: number): void {
	s.budget = Math.round(s.budget + delta);
}

export function addRivalRep(r: Rival, delta: number): void {
	r.reputation = applyReputationChange(r.reputation, delta);
}
export function addRivalInfluence(r: Rival, delta: number): void {
	r.influence = clamp(r.influence + delta, 0, 100);
}

/** Грязное действие (§6.3): счётчик и флаг месяца для трейта «Идеалист». */
export function markDirty(s: GameState, n = 1): void {
	s.counters.dirtyActions += n;
	s.counters.dirtyThisMonth = true;
}

// ------------------------------------------------------------ компромат

/** Компромат соперника на игрока — просто целое число (§2.5). */
export function addKompromatOnPlayer(s: GameState, id: RivalId, n: number): void {
	const r = rival(s, id);
	r.kompromatOnPlayer = Math.max(0, r.kompromatOnPlayer + n);
}

export function addKompromat(s: GameState, target: KompromatTarget, strength: number): number {
	const id = newId(s);
	s.kompromat.push({
		id,
		target,
		strength: clamp(strength, 1, 3),
		acquiredDay: s.day,
		expiresDay: s.day + B.KOMPROMAT_TTL_DAYS,
		usedCooldownUntil: null
	});
	return id;
}

/** Действует ли предмет компромата сейчас (§2.5). */
export function kompromatActive(s: GameState, k: { target: KompromatTarget; expiresDay: number | null }): boolean {
	if (k.target.kind === 'senator' && hasTech(s, 'C2')) return true;
	if (k.target.kind === 'president' && k.target.id !== s.presidentTerm) return false;
	return k.expiresDay === null || k.expiresDay > s.day;
}

// ------------------------------------------------------------ агенты

/** Удаляет агента отовсюду (гибель, поимка, переход, увольнение). */
export function removeAgent(s: GameState, agentId: number): Agent | undefined {
	const idx = s.agents.findIndex((a) => a.id === agentId);
	if (idx < 0) return undefined;
	const [agent] = s.agents.splice(idx, 1);
	for (const op of s.operations) {
		op.agentIds = op.agentIds.filter((x) => x !== agentId);
		op.extraJoinedLate = op.extraJoinedLate.filter((x) => x !== agentId);
	}
	// Операция без агентов прекращается без возврата денег.
	const emptied = s.operations.filter((o) => o.agentIds.length === 0);
	for (const op of emptied) {
		const c = op.caseId !== null ? s.cases.find((x) => x.id === op.caseId) : undefined;
		if (c) c.takenByOpId = null;
	}
	s.operations = s.operations.filter((o) => o.agentIds.length > 0);
	for (const n of Object.values(s.networks)) n.agentIds = n.agentIds.filter((x) => x !== agentId);
	s.missions = s.missions.filter((m) => m.agentId !== agentId);
	s.trainings = s.trainings.filter((t) => t.agentId !== agentId);
	return agent;
}

export function setIdle(a: Agent): void {
	a.status = 'idle';
	a.location = null;
}

// ------------------------------------------------------------ исход партии

export function defeat(s: GameState, reason: DefeatReason): void {
	if (isOver(s)) return;
	finish(s, 'lost', null, reason);
}

export function victory(s: GameState, path: VictoryPath): void {
	if (isOver(s)) return;
	finish(s, 'won', path, null);
}

function finish(s: GameState, status: 'won' | 'lost', path: VictoryPath | null, reason: DefeatReason | null): void {
	const m = monthOfDay(s.day);
	s.outcome = {
		status,
		victoryPath: path,
		defeatReason: reason,
		month: m,
		day: s.day,
		score: score({
			victory: status === 'won',
			monthsPlayed: m,
			reputation: s.reputation,
			influence: s.influence,
			budget: s.budget,
			exposure: s.exposure
		})
	};
	log(s, status === 'won' ? 'victory' : 'defeat', { path, reason, month: m });
	autopause(s, 'outcome');
}
