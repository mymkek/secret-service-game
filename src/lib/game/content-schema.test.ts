import { describe, expect, it } from 'vitest';
import {
	ChanceCardContentSchema,
	ContentBundleSchema,
	EventTextSchema,
	TraitContentSchema,
	contentToConfig,
	formatEventText
} from './content-schema';
import { createGame, resolveAgentName } from './index';
import { deck } from './cards';

const bundle = {
	version: 1,
	agentNames: { firstNames: ['Джон', 'Мэри'], lastNames: ['Смит', 'Доу'] },
	traits: [
		{ id: 'corrupt', name: 'Коррупционер', description: 'Берёт.' },
		{ id: 'insomniac', name: 'Бессонный', description: 'Не спит.', mechanics: { weight: 5, modifiers: [{ kind: 'noOverwork' }] } }
	],
	cards: [
		{ id: 'blockbuster', title: 'Блокбастер', body: 'Кино про нас.', tone: 'positive' },
		{
			id: 'gala_dinner',
			title: 'Благотворительный ужин',
			body: 'Спонсоры щедры.',
			tone: 'positive',
			mechanics: { weight: 4, effects: [{ kind: 'budget', value: 100 }], requires: [{ kind: 'minDept', dept: 'pr', value: 1 }] }
		}
	],
	events: [{ kind: 'scandal', text: 'Скандал! Репутация −{repLoss}.', severity: 'danger' }],
	cases: [{ id: 'bank_robbery', caseKind: 'regular', minDifficulty: 1, maxDifficulty: 3, title: 'Ограбление', description: 'Банк.' }],
	states: [{ id: 'CA', name: 'Калифорния', caseWeight: 3 }],
	senators: [{ id: 'senator_1', name: 'Сенатор Смит' }],
	countries: [{ id: 'canada', name: 'Канада' }],
	quests: [{ questId: 'hearings', title: 'Слушания', ink: 'quests/hearings.ink.json', choiceLabels: { testify: 'Дать показания' } }]
};

describe('content-schema', () => {
	it('корректный пакет проходит и превращается в config партии', () => {
		const parsed = ContentBundleSchema.parse(bundle);
		const cfg = contentToConfig(parsed);
		expect(cfg.stateCaseWeights).toEqual({ CA: 3 });
		expect(cfg.extraTraits?.map((t) => t.id)).toEqual(['insomniac']);
		expect(cfg.extraCards?.map((c) => c.id)).toEqual(['gala_dinner']);
		const s = createGame({ seed: 'content', config: cfg });
		expect(deck(s).ids).toContain('gala_dinner');
		expect(s.config.stateCaseWeights.CA).toBe(3);
	});

	it('новая карточка без механики и встроенная с механикой — ошибка', () => {
		expect(ChanceCardContentSchema.safeParse({ id: 'new_card', title: 't', body: 'b', tone: 'neutral' }).success).toBe(false);
		expect(
			ChanceCardContentSchema.safeParse({
				id: 'blockbuster',
				title: 't',
				body: 'b',
				tone: 'positive',
				mechanics: { weight: 1, effects: [{ kind: 'hearings' }] }
			}).success
		).toBe(false);
	});

	it('эффекты и модификаторы — только из закрытого набора', () => {
		expect(
			ChanceCardContentSchema.safeParse({
				id: 'x_card',
				title: 't',
				body: 'b',
				tone: 'neutral',
				mechanics: { weight: 1, effects: [{ kind: 'win_game' }] }
			}).success
		).toBe(false);
		expect(
			TraitContentSchema.safeParse({ id: 'godlike', name: 'n', description: 'd', mechanics: { weight: 1, modifiers: [{ kind: 'opChance', opType: 'all', value: 0.9 }] } })
				.success
		).toBe(false);
		expect(TraitContentSchema.safeParse({ id: 'hero', name: 'n', description: 'd', mechanics: { weight: 1, modifiers: [{ kind: 'noOverwork' }] } }).success).toBe(false);
	});

	it('тексты событий: только известные виды журнала, подстановка параметров', () => {
		expect(EventTextSchema.safeParse({ kind: 'unknown_kind', text: 'x' }).success).toBe(false);
		expect(formatEventText('Репутация −{repLoss}, {missing}', { repLoss: 7 })).toBe('Репутация −7, {missing}');
	});

	it('имя агента из контента детерминировано', () => {
		const s = createGame({ seed: 'names' });
		const a = s.agents[0];
		const n1 = resolveAgentName(a, bundle.agentNames);
		expect(n1).toBe(resolveAgentName(a, bundle.agentNames));
		expect(n1).toMatch(/^(Джон|Мэри) (Смит|Доу)$/);
		expect(resolveAgentName(a, null)).toBe(`Агент №${a.id}`);
	});
});
