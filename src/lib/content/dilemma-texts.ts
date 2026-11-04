// Тексты окон дилемм (ГДД §9.8) и этапов линейки (§9.9), D-067. Источник один: quests.data.json
// (там же лежат сцены для Ink и запасного режима). Здесь они собираются в разделы бандла
// content.dilemmas и content.line по схемам DilemmaDefSchema и LineDefSchema.
import type { DilemmaDef, LineDef } from '../game/content-schema';
import { DILEMMA_QUEST_IDS } from '../game/types';
import questsData from './quests.data.json';

interface RawScript {
	title: string;
	stages: Record<string, string>;
	realCase?: string;
	choices: { id: string; label: string; argument?: string; outcome: string }[];
}

const raw = questsData as unknown as Record<string, RawScript>;

export const dilemmaDefs: DilemmaDef[] = DILEMMA_QUEST_IDS.map((questId) => {
	const q = raw[questId];
	return {
		questId,
		title: q.title,
		body: q.stages.choice,
		...(q.realCase ? { realCase: q.realCase } : {}),
		choices: q.choices.map((c) => ({ id: c.id, label: c.label, argument: c.argument ?? c.label, outcome: c.outcome }))
	};
});

const result = raw.vanguard_result.stages;

export const lineDef: LineDef = {
	id: 'vanguard',
	name: '«Народный авангард»',
	description:
		'Подпольная организация готовит акции, а ваш лучший агент уходит внутрь на полгода, чтобы принести либо улики, либо дело поинтереснее. Четыре этапа с паузами, крупная награда, цена тоже немаленькая.',
	stages: [
		{
			stage: 1,
			title: 'Легенда и вербовка',
			text: 'Агент уходит в подполье под чужим именем: работа, съёмная комната, нужные знакомства. Цель: попасть в круг «Народного авангарда» и не вызвать вопросов.'
		},
		{
			stage: 2,
			title: 'Вхождение в доверие',
			text: 'Организация проверяет новичка делом и разговорами. Доверие можно зарабатывать осторожно или поступками, за которые в обычной жизни арестовывают.'
		},
		{
			stage: 3,
			title: 'Ячейка готовит акцию',
			text: 'Ячейка выбирает цель и срок. Агент решает вместе с вами, чем это закончится: уликами, громким финалом или тихим срывом.'
		},
		{
			stage: 4,
			title: 'Развязка: аресты',
			text: 'Группы захвата, обыски, протоколы. Итог зависит от слаженности и от того, насколько ячейка успела догадаться.'
		}
	],
	outcomes: {
		success_clean: result.success_clean,
		success_dirty: result.success_dirty,
		quiet: result.quiet,
		recalled: result.recalled,
		fail_fled: result.fail_fled,
		fail_killed: result.fail_killed,
		fail_captured: result.fail_captured,
		fail_broken: result.fail_broken
	},
	realCase: raw.vanguard_offer.realCase
};
