// Zod-схемы контента (§4.2.5, §7, §9). Контент-агенты обязаны им соответствовать.
// Механика контента задаётся только закрытыми наборами модификаторов/эффектов/требований,
// которые ядро умеет исполнять (types.ts: TraitModifier, CardEffect, CardRequirement).
import { z } from 'zod';
import { BUILTIN_CARDS } from './cards';
import { US_STATES } from './geo';
import { QUEST_IDS } from './quests';
import type { CardEffect, CardRequirement, GameConfig, TraitModifier } from './types';
import { BUILTIN_TRAITS, DEPT_KEYS, LEADER_ARCHETYPES, LOG_KINDS, OP_TYPES, PENDING_LOG_KINDS, RIVAL_IDS, TECH_IDS } from './types';

const id = z
	.string()
	.min(1)
	.max(64)
	.regex(/^[a-z][a-z0-9_]*$/, 'id: snake_case латиницей');
const text = z.string().min(1).max(4000);
const shortText = z.string().min(1).max(200);

// ------------------------------------------------------------ трейты (§4.2.5)

export const TraitModifierSchema = z.discriminatedUnion('kind', [
	z.object({ kind: z.literal('opChance'), opType: z.enum([...OP_TYPES, 'all']), value: z.number().min(-0.3).max(0.3) }),
	z.object({ kind: z.literal('loyaltyPerMonth'), value: z.number().min(-10).max(10) }),
	z.object({ kind: z.literal('exposurePerOp'), value: z.number().min(-5).max(5) }),
	z.object({ kind: z.literal('defectMult'), value: z.number().min(0).max(5) }),
	z.object({ kind: z.literal('noOverwork') }),
	z.object({ kind: z.literal('forbidDirty') })
]);

/** Трейт: для встроенных id — только тексты; для новых id обязательна mechanics. */
export const TraitContentSchema = z
	.object({
		id,
		name: shortText,
		description: text,
		mechanics: z
			.object({
				weight: z.number().min(0).max(100),
				modifiers: z.array(TraitModifierSchema).min(1).max(6)
			})
			.optional()
	})
	.refine((t) => (BUILTIN_TRAITS as readonly string[]).includes(t.id) || t.mechanics !== undefined, {
		message: 'новый трейт должен задавать mechanics',
		path: ['mechanics']
	})
	.refine((t) => !(BUILTIN_TRAITS as readonly string[]).includes(t.id) || t.mechanics === undefined, {
		message: 'механику встроенных трейтов задаёт ядро (balance.ts), а не контент',
		path: ['mechanics']
	});

// ------------------------------------------------------------ имена

export const AgentNamesSchema = z.object({
	firstNames: z.array(shortText).min(1),
	lastNames: z.array(shortText).min(1),
	codenames: z.array(shortText).optional()
});

export const LeaderNamesSchema = z.object({
	archetype: z.enum(LEADER_ARCHETYPES),
	names: z.array(shortText).min(1),
	title: shortText
});

// ------------------------------------------------------------ карточки (§7)

const cardTarget = z.enum(['player', 'all', 'random_rival', ...RIVAL_IDS]);

export const CardEffectSchema = z.discriminatedUnion('kind', [
	z.object({ kind: z.literal('reputation'), target: cardTarget, value: z.number().min(-30).max(30) }),
	z.object({ kind: z.literal('influence'), target: cardTarget, value: z.number().min(-30).max(30) }),
	z.object({ kind: z.literal('exposure'), value: z.number().min(-30).max(30) }),
	z.object({ kind: z.literal('investigation'), value: z.number().min(-30).max(30) }),
	z.object({ kind: z.literal('unrest'), value: z.number().min(-30).max(30) }),
	z.object({ kind: z.literal('budget'), value: z.number().int().min(-2000).max(2000) }),
	z.object({ kind: z.literal('incomeMult'), value: z.number().min(0.5).max(1.5), months: z.number().int().min(1).max(12) }),
	z.object({ kind: z.literal('rivalPlan'), target: cardTarget, value: z.number().min(-0.5).max(0.5) }),
	z.object({ kind: z.literal('hearings') }),
	z.object({
		kind: z.literal('spawnCase'),
		caseKind: z.enum(['regular', 'terror']),
		difficulty: z.number().int().min(1).max(5),
		timerDays: z.number().int().min(1).max(90).nullable(),
		rewardMult: z.number().min(0).max(5)
	}),
	z.object({ kind: z.literal('planTargetMult'), value: z.number().min(0.5).max(2) })
]);

export const CardRequirementSchema = z.discriminatedUnion('kind', [
	z.object({ kind: z.literal('minSurv'), value: z.number().int().min(0).max(6) }),
	z.object({ kind: z.literal('minRepr'), value: z.number().int().min(0).max(7) }),
	z.object({ kind: z.literal('minDept'), dept: z.enum(DEPT_KEYS), value: z.number().int().min(0).max(5) }),
	z.object({ kind: z.literal('minExposure'), value: z.number().min(0).max(100) }),
	z.object({ kind: z.literal('maxExposure'), value: z.number().min(0).max(100) }),
	z.object({ kind: z.literal('tech'), tech: z.enum(TECH_IDS) }),
	z.object({ kind: z.literal('rivalAlive'), rival: z.enum(RIVAL_IDS) }),
	z.object({ kind: z.literal('minMonth'), value: z.number().int().min(1).max(60) })
]);

/**
 * Карточка шанса. Для встроенных id (§7) контент даёт только тексты.
 * Новые карточки задают mechanics: вес, эффекты (закрытый набор), требования.
 */
export const ChanceCardContentSchema = z
	.object({
		id,
		title: shortText,
		body: text,
		tone: z.enum(['positive', 'negative', 'neutral']),
		mechanics: z
			.object({
				weight: z.number().min(0).max(100),
				effects: z.array(CardEffectSchema).min(1).max(8),
				requires: z.array(CardRequirementSchema).max(6).default([])
			})
			.optional()
	})
	.refine((c) => (BUILTIN_CARDS as readonly string[]).includes(c.id) || c.mechanics !== undefined, {
		message: 'новая карточка должна задавать mechanics',
		path: ['mechanics']
	})
	.refine((c) => !(BUILTIN_CARDS as readonly string[]).includes(c.id) || c.mechanics === undefined, {
		message: 'механику встроенных карточек задаёт ядро',
		path: ['mechanics']
	});

// ------------------------------------------------------------ тексты событий и дел

/** Шаблон текста записи журнала. Плейсхолдеры {name} берутся из LogEntry.data. */
export const EventTextSchema = z.object({
	kind: z.enum([...LOG_KINDS, ...PENDING_LOG_KINDS]),
	text: text,
	severity: z.enum(['info', 'success', 'warning', 'danger']).default('info')
});

/** Текст дела на карте. UI выбирает шаблон по (kind, difficulty) и id дела. */
export const CaseTextSchema = z
	.object({
		id,
		caseKind: z.enum(['regular', 'terror']),
		minDifficulty: z.number().int().min(1).max(5),
		maxDifficulty: z.number().int().min(1).max(5),
		title: shortText,
		description: text
	})
	.refine((c) => c.minDifficulty <= c.maxDifficulty, { message: 'minDifficulty > maxDifficulty' });

// ------------------------------------------------------------ мир

export const StateContentSchema = z.object({
	id: z.enum(US_STATES),
	name: shortText,
	caseWeight: z.number().min(0).max(10).default(1)
});

export const SenatorContentSchema = z.object({
	id: z.string().regex(/^senator_[1-9][0-9]*$/),
	name: shortText,
	state: z.enum(US_STATES).optional(),
	bio: text.optional(),
	/** Сопротивление 1..3 (D-046). Не задано — ядро бросает randInt на старте партии. */
	resistance: z.number().int().min(1).max(3).optional()
});

export const CountryContentSchema = z.object({ id, name: shortText });

// ------------------------------------------------------------ квесты и Ink (§9)

/** Имена внешних функций, которые адаптер регистрирует в inkjs (BindExternalFunction). */
export const INK_EXTERNAL_FUNCTIONS = {
	/** core_var(name) → значение из inkVariables(state, session). */
	core_var: { args: ['string'], returns: 'any' },
	/** core_can(choiceId) → доступен ли выбор (questChoices). */
	core_can: { args: ['string'], returns: 'bool' },
	/**
	 * core_choose(choiceId, param) → применяет выбор через applyAction({type:'questChoice'}). Возвращает '' или код ошибки.
	 * param = -1 — «выбор за ядром»: первый свободный агент или первый действующий компромат.
	 * Контракт: агента и предмет компромата выбирает UI, а не Ink. Если у выбора needsAgent/needsKompromat,
	 * адаптер показывает выбор из agentIds/kompromatIds и подставляет id вместо -1.
	 */
	core_choose: { args: ['string', 'int'], returns: 'string' }
} as const;
export type InkExternalName = keyof typeof INK_EXTERNAL_FUNCTIONS;

export const QuestContentSchema = z.object({
	questId: z.enum(QUEST_IDS as [string, ...string[]]),
	title: shortText,
	/** Путь к скомпилированному Ink JSON внутри src/lib/content. */
	ink: z.string().min(1),
	/** Подписи кнопок для выборов ядра (questChoices): id выбора → текст. */
	choiceLabels: z.record(z.string(), shortText)
});

// ------------------------------------------------------------ тексты экранов (досье, финалы, операции, технологии, новости)

/** Досье ведомства-соперника (§6.1). */
export const RivalContentSchema = z.object({
	id: z.enum(RIVAL_IDS),
	name: shortText,
	shortName: shortText.optional(),
	dossier: text,
	strength: text.optional(),
	weakness: text.optional()
});

/** Текст финала партии: по коду победы или поражения (results.victory_path / defeat_reason). */
export const EndingTextSchema = z.object({
	outcome: z.enum(['1984', 'shadow', 'monopoly', 'clean', 'cardinal', 'timeout', 'arrested', 'bankrupt', 'riot', 'reputation', 'dismissed', 'disbanded']),
	title: shortText,
	text: text
});

/** Название и описание типа операции (§5.1). */
export const OperationTextSchema = z.object({
	opType: z.enum(OP_TYPES),
	name: shortText,
	description: text
});

/** Название и описание технологии (§4.5; названия — на усмотрение контента, D-022). */
export const TechContentSchema = z.object({
	id: z.enum(TECH_IDS),
	name: shortText,
	description: text
});

/** Новость для ленты (флейвор, без механики). */
export const NewsItemSchema = z
	.object({
		id,
		text: text,
		minMonth: z.number().int().min(1).max(60).optional(),
		maxMonth: z.number().int().min(1).max(60).optional(),
		tags: z.array(shortText).max(8).optional()
	})
	.refine((n) => n.minMonth === undefined || n.maxMonth === undefined || n.minMonth <= n.maxMonth, { message: 'minMonth > maxMonth' });

// ------------------------------------------------------------ пакет контента

export const ContentBundleSchema = z.object({
	version: z.number().int().min(1),
	agentNames: AgentNamesSchema,
	leaderNames: z.array(LeaderNamesSchema).default([]),
	traits: z.array(TraitContentSchema).default([]),
	cards: z.array(ChanceCardContentSchema).default([]),
	events: z.array(EventTextSchema).default([]),
	cases: z.array(CaseTextSchema).default([]),
	states: z.array(StateContentSchema).default([]),
	senators: z.array(SenatorContentSchema).default([]),
	countries: z.array(CountryContentSchema).default([]),
	quests: z.array(QuestContentSchema).default([]),
	// Опциональные разделы текстов экранов (ядро их не читает; .optional() — обратная совместимость).
	rivals: z.array(RivalContentSchema).optional(),
	endings: z.array(EndingTextSchema).optional(),
	operations: z.array(OperationTextSchema).optional(),
	techs: z.array(TechContentSchema).optional(),
	news: z.array(NewsItemSchema).optional()
});

export type TraitContent = z.infer<typeof TraitContentSchema>;
export type ChanceCardContent = z.infer<typeof ChanceCardContentSchema>;
export type EventText = z.infer<typeof EventTextSchema>;
export type CaseText = z.infer<typeof CaseTextSchema>;
export type ContentBundle = z.infer<typeof ContentBundleSchema>;
export type RivalContent = z.infer<typeof RivalContentSchema>;
export type EndingText = z.infer<typeof EndingTextSchema>;
export type OperationText = z.infer<typeof OperationTextSchema>;
export type TechContent = z.infer<typeof TechContentSchema>;
export type NewsItem = z.infer<typeof NewsItemSchema>;

// Проверка на этапе компиляции: схемы совпадают с типами, которые исполняет ядро.
type Assert<T extends true> = T;
export type _TraitModifierOk = Assert<z.infer<typeof TraitModifierSchema> extends TraitModifier ? true : false>;
export type _CardEffectOk = Assert<z.infer<typeof CardEffectSchema> extends CardEffect ? true : false>;
export type _CardRequirementOk = Assert<z.infer<typeof CardRequirementSchema> extends CardRequirement ? true : false>;

/** Механика контента → параметры новой партии (createGame({ config })). */
export function contentToConfig(bundle: ContentBundle): Partial<GameConfig> {
	const stateCaseWeights: Record<string, number> = {};
	for (const s of bundle.states) stateCaseWeights[s.id] = s.caseWeight;
	const senatorResistance: Record<string, number> = {};
	for (const sen of bundle.senators) if (sen.resistance !== undefined) senatorResistance[sen.id] = sen.resistance;
	return {
		stateCaseWeights,
		senatorResistance,
		extraTraits: bundle.traits
			.filter((t) => t.mechanics)
			.map((t) => ({ id: t.id, weight: t.mechanics!.weight, modifiers: t.mechanics!.modifiers })),
		extraCards: bundle.cards
			.filter((c) => c.mechanics)
			.map((c) => ({ id: c.id, weight: c.mechanics!.weight, effects: c.mechanics!.effects, requires: c.mechanics!.requires }))
	};
}

/** Подстановка {param} в шаблон текста события. */
export function formatEventText(template: string, data: Record<string, unknown>): string {
	return template.replace(/\{([a-zA-Z0-9_]+)\}/g, (m, k: string) => (k in data ? String(data[k]) : m));
}
