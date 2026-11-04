// Единая точка доступа к контенту для UI (бандл — src/lib/content/index.ts, пишет content-writer).
import { content, questScripts, renderLogEntry } from '../content/index';
import type { CaseView, LogEntry } from '../game/index';
import { CASE_FALLBACK, CHOICE_LABELS, QUEST_TITLES, STATE_NAMES, cardFallback, rivalName } from './labels';

export { content };

const COUNTRY_FALLBACK: Record<string, string> = {
	canada: 'Канада',
	mexico: 'Мексика',
	cuba: 'Куба',
	egypt: 'Египет',
	jordan: 'Иордания',
	syria: 'Сирия',
	lebanon: 'Ливан'
};
const TRAIT_FALLBACK: Record<string, string> = {
	corrupt: 'Продажный',
	hero: 'Герой',
	blabbermouth: 'Болтун',
	workaholic: 'Трудоголик',
	idealist: 'Идеалист',
	with_past: 'С прошлым'
};

export function stateName(id: string): string {
	return content.states.find((s) => s.id === id)?.name ?? STATE_NAMES[id] ?? id;
}

export function senatorName(id: string): string {
	return content.senators.find((s) => s.id === id)?.name ?? `Сенатор (${id})`;
}

export function countryName(id: string): string {
	return content.countries.find((c) => c.id === id)?.name ?? COUNTRY_FALLBACK[id] ?? id;
}

export function caseText(c: Pick<CaseView, 'id' | 'kind' | 'difficulty'>): { title: string; description: string } {
	const pool = content.cases.filter((t) => t.caseKind === c.kind && t.minDifficulty <= c.difficulty && c.difficulty <= t.maxDifficulty);
	if (pool.length) {
		const t = pool[c.id % pool.length];
		return { title: t.title, description: t.description };
	}
	return CASE_FALLBACK[c.kind];
}

export function cardText(id: string): { title: string; body: string; tone: 'positive' | 'negative' | 'neutral' } {
	const c = content.cards.find((x) => x.id === id);
	return c ? { title: c.title, body: c.body, tone: c.tone } : cardFallback(id);
}

export function questTitle(questId: string): string {
	return content.quests.find((q) => q.questId === questId)?.title ?? QUEST_TITLES[questId] ?? questId;
}

export function choiceLabel(questId: string, choiceId: string): string {
	const l = content.quests.find((q) => q.questId === questId)?.choiceLabels[choiceId];
	if (l) return l;
	if (choiceId.startsWith('give:')) return `Отдать компромат: ${rivalName(choiceId.slice(5))}`;
	return CHOICE_LABELS[choiceId] ?? choiceId;
}

export function traitName(id: string): string {
	return content.traits.find((t) => t.id === id)?.name ?? TRAIT_FALLBACK[id] ?? id;
}
export function traitDesc(id: string): string {
	return content.traits.find((t) => t.id === id)?.description ?? '';
}

export type Severity = 'info' | 'success' | 'warning' | 'danger';

/** Текст записи журнала (шаблоны и подстановки — src/lib/content/log-text.ts). */
export function eventLine(e: LogEntry, agentName: (id: number) => string): { text: string; severity: Severity } {
	return renderLogEntry(e, { agentName });
}

/** Сценарий квеста из контента (запасной режим без Ink): текст этапа и исходы выборов. */
export function questScene(questId: string, stage: string): { body: string; outcomes: Record<string, string> } {
	const q = (questScripts as Record<string, { stages: Record<string, string>; choices: { id: string; outcome: string }[] }>)[questId];
	if (!q) return { body: '', outcomes: {} };
	return { body: q.stages[stage] ?? q.stages.choice ?? '', outcomes: Object.fromEntries(q.choices.map((c) => [c.id, c.outcome])) };
}
