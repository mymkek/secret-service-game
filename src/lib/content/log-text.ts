// Превращает запись журнала ядра (LogEntry) в готовый текст. UI вызывает renderLogEntry(entry, ctx).
import { formatEventText } from '../game/content-schema';
import type { LogEntry } from '../game/types';
import chanceCards from './cards/chance.json';
import { countries, senators, states } from './world';
import { eventTexts } from './events';
import questsData from './quests.data.json';
import {
	archetypeNames,
	courseNames,
	deptNames,
	hearingReasonNames,
	legendNames,
	rankNames,
	recruitMethodNames,
	rivalActionPhrases
} from './texts';
import { defeatTexts, opTexts, rivalDossiers, techNames, victoryTexts } from './views';
import type { DefeatReason, OpType, RivalId, VictoryPath } from '../game/types';

export interface RenderContext {
	/** Имя агента по id (обычно через resolveAgentName). По умолчанию «Агент №id». */
	agentName?: (id: number) => string | undefined;
}

export interface RenderedLog {
	text: string;
	severity: 'info' | 'success' | 'warning' | 'danger';
}

const stateNames = new Map<string, string>(states.map((s): [string, string] => [s.id, s.name]));
const countryNames = new Map<string, string>(countries.map((c): [string, string] => [c.id, c.name]));
const senatorNames = new Map<string, string>(senators.map((s): [string, string] => [s.id, s.name]));
const cardTitles = new Map<string, string>(chanceCards.map((c): [string, string] => [c.id, c.title]));
const questTitles = new Map<string, string>(Object.entries(questsData).map(([id, q]): [string, string] => [id, q.title]));

const pct = (x: unknown) => (typeof x === 'number' ? `${Math.round(x * 100)}%` : '');
const str = (x: unknown) => (typeof x === 'string' ? x : '');
const rivalName = (id: unknown) => (typeof id === 'string' && id in rivalDossiers ? rivalDossiers[id as RivalId].shortName : '');

/** Данные для подстановки: исходные поля записи плюс читаемые производные. */
export function logTemplateData(entry: LogEntry, ctx: RenderContext = {}): Record<string, unknown> {
	const d = entry.data;
	const out: Record<string, unknown> = { ...d };
	if (typeof d.agentId === 'number') out.agentName = ctx.agentName?.(d.agentId) ?? `Агент №${d.agentId}`;
	const rn = rivalName(d.rivalId) || (entry.source && entry.source !== 'unknown' ? rivalName(entry.source) : '');
	out.rivalName = rn || (entry.source === 'unknown' ? 'Неизвестный источник' : 'Соперник');
	out.toName = rivalName(d.to) || 'соперник';
	out.stateName = stateNames.get(str(d.stateId)) ?? str(d.stateId);
	out.countryName = countryNames.get(str(d.countryId)) ?? str(d.countryId);
	out.senatorName = senatorNames.get(str(d.senatorId)) ?? str(d.senatorId);
	out.deptName = deptNames[str(d.dept) as keyof typeof deptNames] ?? str(d.dept);
	out.techName = techNames[str(d.techId) as keyof typeof techNames]?.name ?? str(d.techId);
	out.questTitle = questTitles.get(str(d.questId)) ?? str(d.questId);
	out.cardTitle = cardTitles.get(str(d.cardId)) ?? str(d.cardId);
	out.opName = opTexts[str(d.type) as OpType]?.name ?? str(d.type);
	out.courseName = courseNames[str(d.course)] ?? str(d.course);
	out.rankName = rankNames[str(d.rank) as keyof typeof rankNames] ?? str(d.rank);
	out.legendName = legendNames[str(d.legend) as keyof typeof legendNames] ?? str(d.legend);
	out.methodName = recruitMethodNames[str(d.method) as keyof typeof recruitMethodNames] ?? str(d.method);
	out.archetypeName = archetypeNames[str(d.archetype) as keyof typeof archetypeNames] ?? str(d.archetype);
	out.hearingReason = hearingReasonNames[str(d.reason)] ?? 'по решению комитета';
	out.ratioPct = pct(d.ratio);
	out.sharePct = pct(d.share);
	if (typeof d.repLoss === 'number') out.repLossRounded = Math.round(d.repLoss);
	if (entry.kind === 'victory') out.pathName = victoryTexts[str(d.path) as VictoryPath]?.title ?? str(d.path);
	if (entry.kind === 'defeat') out.title = defeatTexts[str(d.reason) as DefeatReason]?.title ?? str(d.reason);
	if (entry.kind === 'rival_action') {
		const ph = rivalActionPhrases[str(d.action)];
		out.actionText = ph ? (d.success ? ph.ok : ph.fail) : 'действует против вас';
	}
	if (entry.kind === 'restore_state') out.resultText = d.success ? 'успешно' : 'безуспешно';
	if (entry.kind === 'sabotage') out.resultText = d.revealed ? 'раскрыта' : 'прошла тихо';
	return out;
}

export function renderLogEntry(entry: LogEntry, ctx: RenderContext = {}): RenderedLog {
	const t = (eventTexts as Record<string, { text: string; severity: RenderedLog['severity'] }>)[entry.kind];
	if (!t) return { text: entry.kind, severity: 'info' };
	return { text: formatEventText(t.text, logTemplateData(entry, ctx)), severity: t.severity };
}
