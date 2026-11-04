// Сборка и валидация бандла контента. Отдельный модуль, чтобы views.ts и log-text.ts
// могли читать проверенный бандл без циклического импорта через index.ts.
import { ContentBundleSchema } from '../game/content-schema';
import chanceCards from './cards/chance.json';
import { cases } from './cases';
import { dilemmaDefs, lineDef } from './dilemma-texts';
import { epilogueText } from './epilogue-texts';
import { eventTexts } from './events';
import { agentNames, leaderNames } from './names';
import newsData from './news.json';
import questsData from './quests.data.json';
import { rawDefeatTexts, rawOpTexts, rawRivalDossiers, rawTechNames, rawVictoryTexts } from './texts';
import traitsData from './traits.json';
import { countries, senators, states } from './world';

/** Сценарий квеста: тексты экрана и выборов (источник для .ink и запасной режим UI без Ink). */
export interface QuestScript {
	title: string;
	/** Тексты по этапам сессии; 'choice' - основной экран выбора. */
	stages: Record<string, string>;
	choices: { id: string; label: string; outcome: string; argument?: string }[];
	/** Только для дилемм и линейки (D-067): сценарий Ink написан вручную, generate.mjs его не трогает. */
	handwritten?: boolean;
	/** «В реальности было похожее дело…» (окна дилемм). */
	realCase?: string;
}

export const questScripts = questsData as unknown as Record<string, QuestScript>;

/** Путь к скомпилированному Ink JSON внутри src/lib/content (компиляция .ink - задача scaffolder). */
export const inkPath = (questId: string) => `ink/${questId}.ink.json`;

/** Триггер новости кодируется первым тегом; id = `<триггер>_<номер>`. */
const newsItems = Object.entries(newsData as Record<string, string[]>).flatMap(([trigger, list]) =>
	list.map((text, i) => ({ id: `${trigger}_${i + 1}`, text, tags: [trigger] }))
);

export const content = ContentBundleSchema.parse({
	version: 1,
	agentNames,
	leaderNames,
	traits: traitsData,
	cards: chanceCards,
	events: Object.entries(eventTexts).map(([kind, e]) => ({ kind, text: e.text, severity: e.severity })),
	cases,
	states,
	senators,
	countries,
	quests: Object.entries(questScripts).map(([questId, q]) => ({
		questId,
		title: q.title,
		ink: inkPath(questId),
		choiceLabels: Object.fromEntries(q.choices.map((c) => [c.id, c.label]))
	})),
	rivals: Object.values(rawRivalDossiers).map((r) => ({
		id: r.id,
		name: r.name,
		shortName: r.shortName,
		dossier: r.dossier,
		strength: r.strength,
		weakness: r.weakness
	})),
	endings: [...Object.entries(rawVictoryTexts), ...Object.entries(rawDefeatTexts)].map(([outcome, e]) => ({
		outcome,
		title: e.title,
		text: e.text
	})),
	operations: Object.entries(rawOpTexts).map(([opType, o]) => ({ opType, name: o.name, description: o.description })),
	techs: Object.entries(rawTechNames).map(([id, t]) => ({ id, name: t.name, description: t.description })),
	news: newsItems,
	dilemmas: dilemmaDefs,
	line: lineDef,
	epilogue: epilogueText
});
