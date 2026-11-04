// Единая точка доступа к контенту для UI (бандл — src/lib/content/index.ts, пишет content-writer).
import { cases as caseTexts, taggedCases, content, opOutcomeTexts, questScripts, renderLogEntry } from '../content/index';
import type { CaseTag, CaseView, LogEntry, OpResultLogData } from '../game/index';
import { CASE_FALLBACK, CHOICE_LABELS, DILEMMA_BODY, OP_LABEL, QUEST_TITLES, STATE_NAMES, cardFallback, rivalName } from './labels';

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

/** Шаблоны дел с меткой (§9.8) лежат отдельно от общего пула. */
function taggedPool(tag: CaseTag | null | undefined, diff: number) {
	const all = tag ? (taggedCases[tag] ?? []) : [];
	const fit = all.filter((t) => t.minDifficulty <= diff && diff <= t.maxDifficulty);
	return fit.length ? fit : all;
}

export function caseText(c: Pick<CaseView, 'id' | 'kind' | 'difficulty'> & { tag?: CaseTag | null }): { title: string; description: string } {
	const tp = taggedPool(c.tag, c.difficulty);
	if (tp.length) {
		const t = tp[c.id % tp.length];
		return { title: t.title, description: t.description };
	}
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

/** Тексты окна дилеммы или этапа линейки из контента (content.dilemmas), если они уже написаны. */
export function dilemmaDef(questId: string) {
	return content.dilemmas?.find((d) => d.questId === questId) ?? null;
}

export function questTitle(questId: string): string {
	return content.quests.find((q) => q.questId === questId)?.title ?? dilemmaDef(questId)?.title ?? QUEST_TITLES[questId] ?? questId;
}

/** Описание сцены дилеммы: контент, иначе запасной текст по questId. */
export function dilemmaBody(questId: string): string {
	return dilemmaDef(questId)?.body ?? DILEMMA_BODY[questId] ?? '';
}

export function choiceLabel(questId: string, choiceId: string): string {
	const l = content.quests.find((q) => q.questId === questId)?.choiceLabels[choiceId] ?? dilemmaDef(questId)?.choices.find((c) => c.id === choiceId)?.label;
	if (l) return l;
	if (choiceId.startsWith('give:')) return `Отдать компромат: ${rivalName(choiceId.slice(5))}`;
	if (questId === 'dilemma_forced_confession' && choiceId === 'deal') return 'Предложить сделку';
	if (questId === 'dilemma_cover_life' && choiceId === 'allow') return 'Разрешить личную жизнь';
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
	const r = renderLogEntry(e, { agentName });
	// Итог операции в ленте — с подробностями (где, шанс, что получили), как в уведомлении.
	if (e.kind === 'op_success' || e.kind === 'op_fail') {
		const outcome = opOutcomeLine(e);
		return { ...r, text: outcome ? `${opResultText(e)}
${outcome}` : opResultText(e) };
	}
	return r;
}

/**
 * Итог операции для уведомления: что, где, успех ли и что это дало.
 * Пример: «Расследование, Техас (сложн. 3): успех, шанс 62 % · +57 k$ · план +1 · репутация +2».
 */
export function opResultText(e: LogEntry): string {
	const d = e.data as unknown as OpResultLogData;
	const where = d.stateId
		? `${stateName(d.stateId)}${d.difficulty ? ` (сложн. ${d.difficulty})` : ''}`
		: d.targetKind === 'rival'
			? rivalName(String(d.targetId))
			: d.targetKind === 'senator'
				? senatorName(String(d.targetId))
				: d.targetKind === 'president'
					? 'президент'
					: d.targetKind === 'leader'
						? 'лидер сопротивления'
						: '';
	const head = `${OP_LABEL[d.type] ?? 'Операция'}${where ? `, ${where}` : ''}: ${e.kind === 'op_success' ? 'успех' : 'провал'}, шанс ${Math.round(d.chance * 100)} %`;
	const sign = (v: number) => `${v > 0 ? '+' : '−'}${Math.abs(Math.round(v * 10) / 10)}`;
	const parts: string[] = [];
	if (d.budgetDelta) parts.push(`${sign(d.budgetDelta)} k$`);
	if (d.planPointsDelta) parts.push(`план ${sign(d.planPointsDelta)}`);
	if (d.reputationDelta) parts.push(`репутация ${sign(d.reputationDelta)}`);
	if (d.influenceDelta) parts.push(`влияние ${sign(d.influenceDelta)}`);
	if (d.exposureDelta) parts.push(`засвеченность ${sign(d.exposureDelta)}`);
	if (d.investigationDelta) parts.push(`следствие ${sign(d.investigationDelta)}`);
	if (d.kompromatGained) parts.push(`компромат +${d.kompromatGained}`);
	if (d.kompromatOnPlayerDelta) parts.push(`компромат на вас ${sign(d.kompromatOnPlayerDelta)}`);
	const count = (ids?: string) => (ids ? ids.split(',').length : 0);
	if (d.killedAgentIds) parts.push(`погибло агентов: ${count(d.killedAgentIds)}`);
	if (d.capturedAgentIds) parts.push(`пойман агентов: ${count(d.capturedAgentIds)}`);
	return [head, ...parts].join(' · ');
}

/**
 * Развязка завершённой операции одной строкой (пустая, если текста нет).
 * Дела: success/fail шаблона дела (тот же выбор, что в caseText), вариант - arr[opId % 2].
 * Слежка/внедрение: opOutcomeTexts[тип][цель], вариант - по opId; {rivalName}/{senatorName} подставляются здесь.
 * Читаем cases из бандла напрямую: zod-схема content.cases пока обрезает поля success/fail.
 */
export function opOutcomeLine(e: LogEntry): string {
	const d = e.data as unknown as OpResultLogData;
	const key = e.kind === 'op_success' ? 'success' : 'fail';
	if (d.caseId !== null && d.caseKind) {
		const diff = d.difficulty ?? 1;
		const tp = taggedPool(d.caseTag, diff);
		const pool = tp.length ? tp : caseTexts.filter((t) => t.caseKind === d.caseKind && t.minDifficulty <= diff && diff <= t.maxDifficulty);
		const t = pool.length ? pool[d.caseId % pool.length] : null;
		const arr = t?.[key];
		if (arr?.length) return arr[d.opId % arr.length];
	}
	if ((d.type === 'surveillance' || d.type === 'infiltration') && d.targetKind) {
		const arr = opOutcomeTexts[d.type]?.[d.targetKind]?.[key];
		if (arr?.length) {
			const tid = String(d.targetId ?? '');
			return arr[d.opId % arr.length].replaceAll('{rivalName}', d.targetKind === 'rival' ? rivalName(tid) : '').replaceAll('{senatorName}', d.targetKind === 'senator' ? senatorName(tid) : '');
		}
	}
	return '';
}

/** Сценарий квеста из контента (запасной режим без Ink): текст этапа и исходы выборов. */
export function questScene(questId: string, stage: string): { body: string; outcomes: Record<string, string> } {
	const q = (questScripts as Record<string, { stages: Record<string, string>; choices: { id: string; outcome: string }[] }>)[questId];
	if (!q) return { body: '', outcomes: {} };
	return { body: q.stages[stage] ?? q.stages.choice ?? '', outcomes: Object.fromEntries(q.choices.map((c) => [c.id, c.outcome])) };
}
