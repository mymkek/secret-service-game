// Прежние экспорты UI (rivalDossiers, victoryTexts, defeatTexts, opTexts, techNames, news),
// но выведенные из провалидированного бандла. Поля вне схемы (девиз, эпиграф и т.д.) берутся из texts.ts.
import type { DefeatReason, OpType, RivalId, TechId, VictoryPath } from '../game/types';
import { content } from './bundle';
import {
	rawDefeatTexts,
	rawOpTexts,
	rawRivalDossiers,
	rawTechNames,
	rawVictoryTexts,
	type EndingText,
	type OpText,
	type RivalDossier
} from './texts';

export const rivalDossiers = Object.fromEntries(
	(content.rivals ?? []).map((r): [string, RivalDossier] => {
		const raw = rawRivalDossiers[r.id];
		return [
			r.id,
			{
				...raw,
				id: r.id,
				name: r.name,
				shortName: r.shortName ?? r.name,
				dossier: r.dossier,
				strength: r.strength ?? raw.strength,
				weakness: r.weakness ?? raw.weakness
			}
		];
	})
) as Record<RivalId, RivalDossier>;

const endings = (src: Record<string, EndingText>) =>
	Object.fromEntries(
		(content.endings ?? [])
			.filter((e) => e.outcome in src)
			.map((e): [string, EndingText] => [e.outcome, { ...src[e.outcome], title: e.title, text: e.text }])
	);

export const victoryTexts = endings(rawVictoryTexts) as Record<VictoryPath, EndingText>;
export const defeatTexts = endings(rawDefeatTexts) as Record<DefeatReason, EndingText>;

export const opTexts = Object.fromEntries(
	(content.operations ?? []).map((o): [string, OpText] => [o.opType, { ...rawOpTexts[o.opType], name: o.name, description: o.description }])
) as Record<OpType, OpText>;

export const techNames = Object.fromEntries(
	(content.techs ?? []).map((t): [string, { name: string; description: string }] => [t.id, { name: t.name, description: t.description }])
) as Record<TechId, { name: string; description: string }>;

/** Новости по триггерам: триггер - первый тег элемента бандла. */
export const news: Record<string, string[]> = {};
for (const n of content.news ?? []) {
	const trigger = n.tags?.[0];
	if (trigger) (news[trigger] ??= []).push(n.text);
}
