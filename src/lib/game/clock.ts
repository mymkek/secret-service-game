// Тикер (§3): один шаг = один игровой день, порядок обработки строго по §3.3.
// Реального времени здесь нет: адаптер UI сам решает, сколько дней прошло (realtimeToDays).
import { BALANCE as B } from './balance';
import { tickAgentStreaks, refreshHirePool } from './agents';
import { applyAction, tickTasks } from './actions';
import { AI_ACTIONS, buildRivalView, chooseRivalAction, type AiActionType, type RivalView } from './ai/strategy';
import { maybeDrawCard, pruneActiveCards } from './cards';
import { tickBuilds, tickResearch, tickTrainings } from './development';
import { monthEndMoney, quarterEnd } from './economy';
import {
	addInfluence,
	addInvestigation,
	addReputation,
	dept,
	forcePause,
	isOver,
	kompromatActive,
	month,
	rival
} from './effects';
import { influenceDriftDelta, investigationDecay, isMonthEnd, reputationRevertDelta } from './formulas';
import { monthEndNetworks, tickMissions } from './networks';
import { dailyCases } from './ops';
import { blockingSession, completeDueOperations, monthEndSource, monthStartDilemmas, processDelayed, runElection, tickOpDilemmas } from './dilemmas';
import { monthStartLineOffer, tickLine } from './line';
import { monthEndPersonnel } from './personnel';
import { monthEndQuestTriggers, tickQuests } from './quests';
import { checkRivalCollapse, rivalMonthlyDrift } from './rivals';
import type { RngHolder } from './rng';
import { checkUnrestThresholds, monthEndExposure, monthEndSociety, recomputeControl } from './society';
import { cardinalHoldStrike, checkOutcome, updateHoldCounters } from './victory';
import type { GameState, LogEntry, Speed } from './types';
import { RIVAL_IDS } from './types';
import { aiInterval } from './formulas';

/** Стратегия ИИ: функция от видимого состояния. Подменяется в симуляторе. */
export type RivalStrategy = (view: RivalView, rng: RngHolder) => AiActionType | null;

export interface StepOptions {
	strategy?: RivalStrategy;
}

/** Шаг 7 дня: конец месяца. */
function monthEnd(s: GameState): void {
	const m = month(s);
	const paid = monthEndMoney(s); // 7.1–7.3
	if (isOver(s)) return;
	monthEndPersonnel(s, paid); // 7.4
	monthEndExposure(s); // 7.5
	if (isOver(s)) return;
	monthEndSociety(s); // 7.6
	if (isOver(s)) return;
	monthEndNetworks(s); // 7.7
	if (isOver(s)) return;
	monthEndSource(s); // 7.7: «Ценный источник» (§9.8)
	if (isOver(s)) return;
	// 7.8 дрейф
	let netSum = 0;
	for (const n of Object.values(s.networks)) netSum += n.level;
	// Дрейф и пассивный пиар применяются раздельно: мягкий потолок (D-055) режет только прирост от пиара.
	addReputation(s, reputationRevertDelta(s.reputation));
	addReputation(s, B.PR_PASSIVE_REP * dept(s, 'pr'));
	addInfluence(s, influenceDriftDelta(s.influence, netSum));
	addInvestigation(s, -investigationDecay(dept(s, 'legal')));
	rivalMonthlyDrift(s);
	s.counters.controlBonus = Math.max(0, s.counters.controlBonus - B.CONTROL_BONUS_DECAY);
	recomputeControl(s);
	if (isOver(s)) return;
	// 7.9 ответный удар при удержании «Кардинала» (D-050), затем истечение компромата
	cardinalHoldStrike(s);
	if (isOver(s)) return;
	s.kompromat = s.kompromat.filter((k) => kompromatActive(s, k));
	// 7.10 пул кандидатов
	refreshHirePool(s);
	// 7.11 квартал
	if (m % 3 === 0) quarterEnd(s);
	if (isOver(s)) return;
	// 7.12 плановые события месяца. Выборы — «в начале месяца ELECTION_MONTH» = конец предыдущего.
	if (m === B.ELECTION_MONTH - 1) runElection(s);
	monthEndQuestTriggers(s);
	pruneActiveCards(s);
}

/** Один игровой день строго по §3.3. */
export function stepDay(s: GameState, opts: StepOptions = {}): void {
	if (isOver(s)) return;
	// 1
	s.day += 1;
	// 2 таймеры
	tickAgentStreaks(s);
	tickOpDilemmas(s); // операции: дилеммы фазы mid (§9.8)
	tickTrainings(s);
	tickBuilds(s);
	tickResearch(s);
	tickMissions(s);
	tickTasks(s);
	tickQuests(s);
	tickLine(s); // этапы линейки (§9.9)
	if (isOver(s)) return;
	// 3 завершение операций
	completeDueOperations(s);
	if (isOver(s)) return;
	// 4 дела; в начале месяца после дел без таймера — «Материал на кандидата», «Тихий сигнал», линейка
	dailyCases(s, () => {
		monthStartDilemmas(s);
		monthStartLineOffer(s);
	});
	if (isOver(s)) return;
	// 4а отложенные последствия (§9.8)
	processDelayed(s);
	if (isOver(s)) return;
	// 5 ИИ соперников — через общий applyAction (D-027)
	const strategy = opts.strategy ?? chooseRivalAction;
	for (const id of RIVAL_IDS) {
		const r = rival(s, id);
		// «На грани» (D-059) не действует.
		if (!r.alive || r.collapsing || r.nextActionDay > s.day) continue;
		const action = strategy(buildRivalView(s, id), s);
		if (action && AI_ACTIONS.includes(action)) applyAction(s, id, { type: 'ai', action });
		r.nextActionDay += aiInterval(B.AI_ACTION_INTERVAL_DAYS[id], s.coalition);
		if (isOver(s)) return;
	}
	// 6 карточка
	maybeDrawCard(s);
	if (isOver(s)) return;
	// Соперник с репутацией 0 становится «на грани» до дрейфа конца месяца (§6.6, D-059).
	checkRivalCollapse(s);
	// 7 конец месяца
	if (isMonthEnd(s.day)) monthEnd(s);
	// 8 проверки
	checkRivalCollapse(s);
	recomputeControl(s);
	checkUnrestThresholds(s);
	updateHoldCounters(s);
	checkOutcome(s);
}

export interface AdvanceOptions extends StepOptions {
	/** Игнорировать паузу и автопаузы (симулятор, тесты). */
	ignorePause?: boolean;
}

export interface AdvanceResult {
	daysAdvanced: number;
	stoppedBy: 'completed' | 'paused' | 'autopause' | 'gameOver';
	/** Новые записи журнала за этот вызов — для уведомлений UI. */
	events: LogEntry[];
}

/**
 * Продвинуть время на `days` дней. Останавливается на автопаузе (если не ignorePause)
 * и на конце партии. Если игра на паузе — ничего не делает.
 */
export function advance(s: GameState, days: number, opts: AdvanceOptions = {}): AdvanceResult {
	const firstId = s.nextId;
	const collect = () => s.log.filter((e) => e.id >= firstId);
	if (isOver(s)) return { daysAdvanced: 0, stoppedBy: 'gameOver', events: [] };
	// §3.4, §9.8: пока открыто модальное окно дилеммы или линейки, время не идёт (без ignorePause).
	if (!opts.ignorePause && blockingSession(s)) {
		forcePause(s, 'questChoice');
		return { daysAdvanced: 0, stoppedBy: 'autopause', events: [] };
	}
	if (s.paused && !opts.ignorePause) return { daysAdvanced: 0, stoppedBy: 'paused', events: [] };
	let n = 0;
	for (; n < days; n++) {
		stepDay(s, opts);
		if (isOver(s)) return { daysAdvanced: n + 1, stoppedBy: 'gameOver', events: collect() };
		if (!opts.ignorePause && (s.paused || blockingSession(s))) return { daysAdvanced: n + 1, stoppedBy: 'autopause', events: collect() };
	}
	return { daysAdvanced: n, stoppedBy: 'completed', events: collect() };
}

export function setPaused(s: GameState, paused: boolean): void {
	s.paused = paused;
	if (!paused) s.pauseReasons = [];
}

export function setSpeed(s: GameState, speed: Speed): void {
	if (speed === 1 || speed === 2 || speed === 3) s.speed = speed;
}

/**
 * Перевод реального времени в игровые дни для адаптера (§3.1).
 * carryMs — остаток с прошлого кадра. Вернёт целые дни и новый остаток.
 */
export function realtimeToDays(speed: Speed, elapsedMs: number, carryMs = 0): { days: number; carryMs: number } {
	const per = B.DAY_MS_BY_SPEED[speed - 1];
	const total = carryMs + Math.max(0, elapsedMs);
	const days = Math.floor(total / per);
	return { days, carryMs: total - days * per };
}
