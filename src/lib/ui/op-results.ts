import type { LogEntry, OpResultLogData } from '../game/index';
import { caseText, opOutcomeLine, senatorName, stateName } from './content';
import { OP_LABEL, rivalName } from './labels';

export interface ResultChip {
	text: string;
	tone: 'ok' | 'warn' | 'danger' | 'default';
}

export interface OpResultView {
	id: number;
	day: number;
	ok: boolean;
	/** Заголовок дела или тип операции. */
	title: string;
	/** Штат или цель. */
	where: string;
	chance: number;
	chips: ResultChip[];
	lost: string[];
	/** Краткая развязка одной строкой (может быть пустой). */
	outcome: string;
}

const sign = (v: number) => `${v > 0 ? '+' : '-'}${Math.abs(Math.round(v * 10) / 10)}`;
const count = (ids?: string) => (ids ? ids.split(',').length : 0);

export function opResultView(e: LogEntry): OpResultView {
	const d = e.data as unknown as OpResultLogData;
	const ok = e.kind === 'op_success';
	let title = OP_LABEL[d.type] ?? 'Операция';
	let where = '';
	if (d.caseKind && d.caseId !== null) {
		title = caseText({ id: d.caseId, kind: d.caseKind, difficulty: d.difficulty ?? 1, tag: d.caseTag ?? null }).title;
		where = `${d.stateId ? stateName(d.stateId) : ''}${d.difficulty ? ` · сложн. ${d.difficulty}` : ''}`;
	} else {
		const t = d.targetKind === 'rival' ? rivalName(String(d.targetId)) : d.targetKind === 'senator' ? senatorName(String(d.targetId)) : d.targetKind === 'president' ? 'президент' : d.targetKind === 'leader' ? 'лидер сопротивления' : '';
		where = t;
		if (d.stateId) where = stateName(d.stateId);
	}
	const chips: ResultChip[] = [];
	const add = (v: number | undefined, label: string, goodWhenPositive = true) => {
		if (!v) return;
		chips.push({ text: `${label} ${sign(v)}`, tone: v > 0 === goodWhenPositive ? 'ok' : 'danger' });
	};
	if (d.budgetDelta) chips.push({ text: `${sign(d.budgetDelta)} k$`, tone: d.budgetDelta > 0 ? 'ok' : 'danger' });
	add(d.planPointsDelta, 'план');
	add(d.reputationDelta, 'репутация');
	add(d.influenceDelta, 'влияние');
	add(d.exposureDelta, 'засвеченность', false);
	add(d.investigationDelta, 'следствие', false);
	if (d.kompromatGained) chips.push({ text: `компромат +${d.kompromatGained}`, tone: 'ok' });
	if (d.kompromatOnPlayerDelta) chips.push({ text: `компромат на вас ${sign(d.kompromatOnPlayerDelta)}`, tone: d.kompromatOnPlayerDelta > 0 ? 'danger' : 'ok' });
	const lost: string[] = [];
	if (d.killedAgentIds) lost.push(`погибло агентов: ${count(d.killedAgentIds)}`);
	if (d.capturedAgentIds) lost.push(`пойман агентов: ${count(d.capturedAgentIds)}`);
	return { id: e.id, day: e.day, ok, title, where, chance: d.chance, chips, lost, outcome: opOutcomeLine(e) };
}
