// Низкоуровневое состояние дилемм, линейки и эпилога (§9.8–9.10, §11.3): значения по умолчанию,
// отложенные последствия, метки риска, «двойная жизнь» внедрённого агента.
// Модуль не зависит от ops/quests, поэтому его импортируют и ops.ts, и dilemmas.ts.
import { BALANCE as B } from './balance';
import { addExposure, addReputation, log, newId } from './effects';
import { roll } from './rng';
import type { Agent, DelayedEffect, DelayedKind, DilemmasState, ElectionState, EpilogueHistory, GameState, RiskLevel } from './types';

/** Поля операции из D-067 со значениями «без дилеммы» (startOp и миграция v5 → v6). */
export const OP_DILEMMA_DEFAULTS = {
	dilemmaId: null,
	dilemmaChoice: null,
	dilemmaBonus: 0,
	warrantSkipped: false,
	held: false,
	rolled: null,
	rollChance: null,
	forcedSuccess: false,
	noPlanPoint: false,
	rewardMult: 1
} as const;

export function emptyHistory(): EpilogueHistory {
	return {
		forcedConfessions: 0,
		falseConfessions: 0,
		falseReviews: 0,
		stings: 0,
		stingsWouldntAct: 0,
		stingsExposed: 0,
		informantCrimes: 0,
		sourceExposed: false,
		signals: 0,
		signalsReal: 0,
		signalsPrevented: 0,
		signalsPreventedDirty: 0,
		missedSignals: 0,
		innocentsSurveilled: 0,
		innocentsDetained: 0,
		warrantsFudged: 0,
		fudgeCaught: 0,
		coverRomances: 0,
		coverScandals: 0,
		sharedWithCia: 0,
		electionMeddling: 'none',
		leakRevealed: false,
		linesStarted: 0,
		linesCompleted: 0,
		linesProvoked: 0,
		lineCrimes: 0,
		lineAgentsLost: 0,
		lineExposed: 0
	};
}

export function emptyDilemmas(): DilemmasState {
	return { nextDay: 0, lastDayById: {}, pending: [], signalReal: {} };
}

export function emptyElection(): ElectionState {
	return { delta: 0, result: null };
}

/** §9.8: метка риска по DILEMMA_RISK_LABELS — точный шанс скрытого последствия в UI не показывается. */
export function riskLevel(p: number): RiskLevel {
	const [low, mid] = B.DILEMMA_RISK_LABELS;
	return p < low ? 'low' : p < mid ? 'medium' : 'high';
}

/** Запланировать отложенное последствие (§9.8, шаг 4а дня dueDay). */
export function scheduleDelayed(s: GameState, kind: DelayedKind, dueDay: number, params: DelayedEffect['params'] = {}): void {
	s.delayed.push({ id: newId(s), dueDay, kind, params });
}

/**
 * Агент перестал быть внедрённым (§9.8 «Легенда требует личной жизни», случай (а): отзыв, раскрытие,
 * переход к врагу, крот раскрыт): если у него разрешена личная жизнь — бросок «Двойной жизни агента».
 * Флаг снимается. Вызывать до removeAgent/setIdle (setIdle флаг снимает без броска).
 */
export function leaveCoverLife(s: GameState, a: Agent): void {
	if (!a.coverLife) return;
	a.coverLife = false;
	coverLifeScandal(s, a.id);
}

/**
 * §9.8 «Двойная жизнь агента»: roll(scandalChance) → репутация, засвеченность, history.coverScandals.
 * Случай (б), D-068: провал той же операции «Внедрение» с выбором «Разрешить» (team[0] раскрыт,
 * в том числе пойман) — агент не был embedded, поэтому бросок идёт по операции, а не по флагу.
 */
export function coverLifeScandal(s: GameState, agentId: number): void {
	const C = B.DL_COVER_LIFE;
	if (roll(s, C.scandalChance)) {
		addReputation(s, C.scandalRep);
		addExposure(s, C.scandalExposure);
		s.history.coverScandals += 1;
		log(s, 'cover_scandal', { agentId });
	}
}

/** Реальность сигнала (скрыто от игрока). */
export function signalIsReal(s: GameState, signalId: number): boolean {
	return s.dilemmas.signalReal[String(signalId)] === true;
}

/**
 * Сигнал не перехвачен (вариант 0, провал проверки, истекло дело, «не поймали»):
 * если он реален — через randInt(attackDelayDays) теракт, о котором предупреждали.
 * Бросок задержки делает вызывающий (он владеет порядком RNG); здесь только запись.
 */
export function forgetSignal(s: GameState, signalId: number): void {
	delete s.dilemmas.signalReal[String(signalId)];
}
