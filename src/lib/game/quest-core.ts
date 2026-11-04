// Точки входа квестов (§9): создание сессии и автопауза. Обработчики выборов — quests.ts.
import { BALANCE as B } from './balance';
import { autopause, dept, forcePause, log, newId } from './effects';
import { DILEMMA_QUEST_IDS } from './types';
import type { AutopauseKey, GameState, QuestId, QuestSession } from './types';

type Params = QuestSession['params'];

const AUTOPAUSE_BY_QUEST: Partial<Record<QuestId, AutopauseKey>> = {
	hearings: 'hearings',
	raise_request: 'raiseRequest',
	plan_warning: 'quarterReport',
	director_questioning: 'investigationThreshold'
};

export function openQuest(s: GameState, questId: QuestId, params: Params = {}, stage = 'choice'): QuestSession {
	const q: QuestSession = {
		id: newId(s),
		questId,
		createdDay: s.day,
		stage,
		params,
		waitUntilDay: null,
		inkStateJson: null
	};
	s.quests.push(q);
	log(s, 'quest_opened', { questId, sessionId: q.id });
	// §3.4, §9.8: окна дилемм и этапов линейки модальные — пауза ставится всегда, флаг её не отключает.
	if ((DILEMMA_QUEST_IDS as readonly string[]).includes(questId) && questId !== 'vanguard_result') forcePause(s, 'questChoice');
	else autopause(s, AUTOPAUSE_BY_QUEST[questId] ?? 'questChoice');
	return q;
}

export function hasOpenQuest(s: GameState, questId: QuestId, match?: (p: Params) => boolean): boolean {
	return s.quests.some((q) => q.questId === questId && (!match || match(q.params)));
}

export function closeQuest(s: GameState, sessionId: number): void {
	s.quests = s.quests.filter((q) => q.id !== sessionId);
}

/**
 * Слушания в Конгрессе (§9.6). Триггеры: скандал при E ≥ 60, план < 0.7, карточка.
 * Не чаще раза в HEARINGS_COOLDOWN_DAYS, лишние триггеры сгорают.
 * Автоматически: hearingMult игрока на следующее распределение.
 */
export function triggerHearings(s: GameState, reason: string): boolean {
	const last = s.counters.lastHearingDay;
	if (last !== null && s.day - last < B.HEARINGS_COOLDOWN_DAYS) {
		log(s, 'hearings_skipped', { reason });
		return false;
	}
	s.counters.lastHearingDay = s.day;
	s.hearingMult = dept(s, 'legal') >= 3 ? B.HEARING_WEIGHT_MULT_LEGAL3 : B.HEARING_WEIGHT_MULT;
	log(s, 'hearings', { reason });
	// Нерешённая сессия слушаний одна: новый триггер обновляет hearingMult, но не плодит окна.
	if (!hasOpenQuest(s, 'hearings')) openQuest(s, 'hearings', { reason });
	else autopause(s, 'hearings');
	return true;
}
