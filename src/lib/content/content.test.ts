import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
	ChanceCardContentSchema,
	ContentBundleSchema,
	INK_EXTERNAL_FUNCTIONS,
	TraitContentSchema,
	contentToConfig,
	formatEventText
} from '../game/content-schema';
import { BALANCE as B } from '../game/balance';
import { BUILTIN_CARDS } from '../game/cards';
import { createGame, resolveAgentName } from '../game/index';
import { QUEST_IDS, questChoices } from '../game/quests';
import {
	BUILTIN_TRAITS,
	DEPT_KEYS,
	LOG_KINDS,
	PENDING_LOG_KINDS,
	OP_TYPES,
	PERKS,
	RIVAL_IDS,
	TECH_IDS,
	type DefeatReason,
	type LogEntry,
	type QuestSession,
	type VictoryPath
} from '../game/types';
import { content, inkPath, news, questScripts, renderLogEntry } from './index';
import { deptNames, perkNames } from './texts';
import { defeatTexts, opTexts, rivalDossiers, techNames, victoryTexts } from './views';
import { eventTexts } from './events';

const here = (rel: string) => fileURLToPath(new URL(rel, import.meta.url));
const read = (rel: string) => readFileSync(here(rel), 'utf8');
const words = (s: string) => s.trim().split(/\s+/).length;

describe('content: бандл', () => {
	it('проходит ContentBundleSchema и строит config партии', () => {
		expect(() => ContentBundleSchema.parse(content)).not.toThrow();
		const cfg = contentToConfig(content);
		expect(Object.keys(cfg.stateCaseWeights ?? {})).toHaveLength(50);
		const s = createGame({ seed: 'content', config: cfg });
		expect(s.config.stateCaseWeights.CA).toBe(1);
		expect(resolveAgentName(s.agents[0], content.agentNames)).not.toMatch(/^Агент №/);
	});

	it('имена: достаточно и без дубликатов', () => {
		const n = content.agentNames;
		expect(n.firstNames.length).toBeGreaterThanOrEqual(40);
		expect(n.lastNames.length).toBeGreaterThanOrEqual(40);
		expect(new Set(n.firstNames).size).toBe(n.firstNames.length);
		expect(new Set(n.lastNames).size).toBe(n.lastNames.length);
		expect(new Set(n.codenames).size).toBe(n.codenames?.length);
		expect(content.leaderNames.map((l) => l.archetype).sort()).toEqual(['blogger', 'ex_agent', 'rights', 'union']);
	});

	it('мир: 50 штатов, страны ГДД, сенаторы комитета', () => {
		expect(content.states).toHaveLength(50);
		expect(content.countries.map((c) => c.id)).toEqual([...B.SHADOW_COUNTRIES.fbi]);
		expect(content.senators).toHaveLength(B.BUDGET_COMMITTEE_SIZE);
	});
});

describe('content: карточки и трейты', () => {
	it('есть все 11 встроенных карточек, без механики, текст до 60 слов', () => {
		expect(content.cards.map((c) => c.id).sort()).toEqual([...BUILTIN_CARDS].sort());
		for (const c of content.cards) {
			expect(c.mechanics).toBeUndefined();
			expect(words(c.body), c.id).toBeLessThanOrEqual(60);
		}
	});

	it('есть все встроенные трейты', () => {
		expect(content.traits.map((t) => t.id).sort()).toEqual([...BUILTIN_TRAITS].sort());
		for (const t of content.traits) expect(words(t.description), t.id).toBeLessThanOrEqual(60);
	});
});

describe('content: тексты событий', () => {
	it('для каждого LOG_KINDS и PENDING_LOG_KINDS есть ровно один текст', () => {
		const all = [...new Set<string>([...LOG_KINDS, ...PENDING_LOG_KINDS])];
		expect(content.events.map((e) => e.kind).sort()).toEqual(all.sort());
		const collapsing = renderLogEntry({ id: 8, day: 3, kind: 'rival_collapsing', data: { rivalId: 'cia', disbandDay: 90 }, source: null });
		expect(collapsing.text).toContain('ЦРУ');
		expect(collapsing.text).toContain('90');
		expect(collapsing.text).not.toContain('{');
		const burned: LogEntry = { id: 9, day: 3, kind: 'kompromat_burned', data: { kompromatId: 1, senatorId: 'senator_2' }, source: null };
		const r = renderLogEntry(burned);
		expect(r.text).toContain('Холлоуэй');
		expect(r.text).not.toContain('{');
	});

	it('плейсхолдеры известны', () => {
		const derived = [
			'agentName', 'rivalName', 'toName', 'stateName', 'countryName', 'deptName', 'techName', 'questTitle',
			'cardTitle', 'opName', 'courseName', 'rankName', 'legendName', 'methodName', 'archetypeName', 'actionText',
			'ratioPct', 'sharePct', 'pathName', 'hearingReason', 'title', 'resultText', 'repLossRounded', 'senatorName'
		];
		const raw = ['level', 'difficulty', 'income', 'expenses', 'budget', 'streak', 'agents', 'missing', 'quarter', 'points', 'target', 'disbandDay'];
		const known = new Set([...derived, ...raw]);
		for (const [kind, e] of Object.entries(eventTexts)) {
			for (const m of e.text.matchAll(/\{([a-zA-Z0-9_]+)\}/g)) expect(known.has(m[1]), `${kind}: {${m[1]}}`).toBe(true);
		}
	});

	it('renderLogEntry подставляет производные поля', () => {
		const e: LogEntry = { id: 1, day: 5, kind: 'rival_action', data: { action: 'DIG_DIRECTOR', success: true }, source: 'cia' };
		const r = renderLogEntry(e);
		expect(r.text).toContain('ЦРУ');
		expect(r.text).not.toContain('{');
		const u: LogEntry = { ...e, source: 'unknown' };
		expect(renderLogEntry(u).text).toContain('Неизвестный источник');
		const sc = renderLogEntry({ id: 2, day: 9, kind: 'scandal', data: { exposure: 40, repLoss: 7.4 }, source: null });
		expect(sc.text).toContain('7');
		expect(sc.text).not.toContain('{');
		expect(sc.severity).toBe('danger');
		expect(renderLogEntry({ id: 3, day: 1, kind: 'agent_hired', data: { agentId: 4, rank: 'veteran' }, source: null }).text).toContain('Агент №4');
		expect(formatEventText('{a}', {})).toBe('{a}');
	});
});

describe('content: дела', () => {
	it('покрыты все сложности, id уникальны', () => {
		expect(new Set(content.cases.map((c) => c.id)).size).toBe(content.cases.length);
		for (let d = 1; d <= 5; d++) {
			expect(content.cases.some((c) => c.caseKind === 'regular' && c.minDifficulty <= d && d <= c.maxDifficulty), `regular d${d}`).toBe(true);
		}
		for (let d = 3; d <= 5; d++) {
			expect(content.cases.some((c) => c.caseKind === 'terror' && c.minDifficulty <= d && d <= c.maxDifficulty), `terror d${d}`).toBe(true);
		}
		for (const c of content.cases) if (c.caseKind === 'terror') expect(c.minDifficulty).toBeGreaterThanOrEqual(3);
	});
});

describe('content: прочие тексты', () => {
	it('досье, финалы, операции, технологии', () => {
		for (const r of RIVAL_IDS) expect(rivalDossiers[r].dossier.length).toBeGreaterThan(20);
		for (const p of ['1984', 'shadow', 'monopoly', 'clean', 'cardinal'] as VictoryPath[]) expect(victoryTexts[p].text.length).toBeGreaterThan(20);
		for (const d of ['timeout', 'arrested', 'bankrupt', 'riot', 'reputation', 'dismissed', 'disbanded'] as DefeatReason[]) {
			expect(defeatTexts[d].text.length).toBeGreaterThan(20);
		}
		for (const o of OP_TYPES) expect(opTexts[o].description.length).toBeGreaterThan(20);
		for (const t of TECH_IDS) expect(techNames[t].name.length).toBeGreaterThan(0);
		for (const d of DEPT_KEYS) expect(deptNames[d].length).toBeGreaterThan(0);
		for (const p of PERKS) expect(perkNames[p].name.length).toBeGreaterThan(0);
	});

	it('новости: у каждого триггера не меньше 3 заголовков без дублей', () => {
		for (const [k, list] of Object.entries(news)) {
			expect(list.length, k).toBeGreaterThanOrEqual(3);
			expect(new Set(list).size, k).toBe(list.length);
		}
	});
});

describe('content: разделы бандла (досье, финалы, операции, технологии, новости)', () => {
	it('все 3 соперника', () => {
		expect((content.rivals ?? []).map((r) => r.id).sort()).toEqual([...RIVAL_IDS].sort());
		for (const r of RIVAL_IDS) {
			expect(rivalDossiers[r].dossier).toBe(content.rivals!.find((x) => x.id === r)!.dossier);
			expect(rivalDossiers[r].motto.length).toBeGreaterThan(0);
		}
	});

	it('все 12 исходов', () => {
		const all = ['1984', 'shadow', 'monopoly', 'clean', 'cardinal', 'timeout', 'arrested', 'bankrupt', 'riot', 'reputation', 'dismissed', 'disbanded'];
		expect((content.endings ?? []).map((e) => e.outcome).sort()).toEqual([...all].sort());
		expect(victoryTexts['1984'].title).toBe(content.endings!.find((e) => e.outcome === '1984')!.title);
		expect(defeatTexts.riot.epigraph.length).toBeGreaterThan(0);
	});

	it('4 операции и 9 технологий', () => {
		expect((content.operations ?? []).map((o) => o.opType).sort()).toEqual([...OP_TYPES].sort());
		expect((content.techs ?? []).map((t) => t.id).sort()).toEqual([...TECH_IDS].sort());
		expect(Object.keys(opTexts)).toHaveLength(4);
		expect(Object.keys(techNames)).toHaveLength(9);
	});

	it('новости: id уникальны, у каждого есть триггер-тег', () => {
		const items = content.news ?? [];
		expect(items.length).toBeGreaterThan(0);
		expect(new Set(items.map((n) => n.id)).size).toBe(items.length);
		for (const n of items) expect(n.tags?.[0], n.id).toBeTruthy();
	});
});

describe('content: квесты', () => {
	const state = createGame({ seed: 'quest-content' });
	const session = (questId: QuestSession['questId']): QuestSession => ({
		id: 1,
		questId,
		createdDay: 1,
		stage: 'choice',
		params: {},
		waitUntilDay: null,
		inkStateJson: null
	});

	it('есть квест на каждую точку входа ядра', () => {
		expect(content.quests.map((q) => q.questId).sort()).toEqual([...QUEST_IDS].sort());
	});

	it('подписи выборов совпадают с questChoices ядра', () => {
		for (const q of content.quests) {
			const ids = questChoices(state, session(q.questId as QuestSession['questId'])).map((c) => c.id).sort();
			expect(Object.keys(q.choiceLabels).sort(), q.questId).toEqual(ids);
		}
	});

	it('цены в подписях совпадают с balance.ts', () => {
		const label = (q: string, c: string) => content.quests.find((x) => x.questId === q)!.choiceLabels[c];
		expect(label('informant', 'pay')).toContain(String(B.QUEST_INFORMANT.cost));
		expect(label('journalist', 'bribe')).toContain(String(B.QUEST_JOURNALIST.bribeCost));
		expect(label('blogger_docs', 'deal')).toContain(String(B.QUEST_BLOGGER.dealCost));
		expect(label('evacuation', 'evacuate')).toContain(String(B.EVAC.cost));
		expect(label('double_agent', 'purge')).toContain(String(B.NET_PURGE.cost));
	});

	it('Ink-исходники на месте, синхронны с данными и используют только внешние функции ядра', () => {
		const allowed = Object.keys(INK_EXTERNAL_FUNCTIONS).sort();
		for (const q of content.quests) {
			expect(q.ink).toBe(inkPath(q.questId));
			const rel = `./ink/${q.questId}.ink`;
			expect(existsSync(here(rel)), rel).toBe(true);
			const src = read(rel);
			const script = questScripts[q.questId];
			const declared = [...src.matchAll(/^EXTERNAL (\w+)/gm)].map((m) => m[1]).sort();
			expect(declared, q.questId).toEqual(allowed);
			const called = new Set([...src.matchAll(/\b(core_\w+)\(/g)].map((m) => m[1]));
			for (const name of called) expect(allowed, `${q.questId}: ${name}`).toContain(name);
			for (const [, text] of Object.entries(script.stages)) expect(src, q.questId).toContain(text);
			for (const c of script.choices) {
				expect(src).toContain(`core_can("${c.id}")`);
				expect(src).toContain(`core_choose("${c.id}", -1)`);
				expect(src).toContain(c.label);
				expect(src).toContain(c.outcome);
			}
		}
	});
});

describe('content: варианты от content-filler (если есть)', () => {
	it('cards/variants.json проходит схему, id не пересекаются со встроенными', () => {
		if (!existsSync(here('./cards/variants.json'))) return;
		const list = JSON.parse(read('./cards/variants.json')) as unknown[];
		const ids = new Set<string>(BUILTIN_CARDS);
		for (const item of list) {
			const parsed = ChanceCardContentSchema.parse(item);
			expect(parsed.mechanics, parsed.id).toBeDefined();
			expect(ids.has(parsed.id), parsed.id).toBe(false);
			ids.add(parsed.id);
			expect(words(parsed.body), parsed.id).toBeLessThanOrEqual(60);
		}
	});

	it('traits-variants.json проходит схему', () => {
		if (!existsSync(here('./traits-variants.json'))) return;
		const list = JSON.parse(read('./traits-variants.json')) as unknown[];
		const ids = new Set<string>(BUILTIN_TRAITS);
		for (const item of list) {
			const parsed = TraitContentSchema.parse(item);
			expect(ids.has(parsed.id), parsed.id).toBe(false);
			ids.add(parsed.id);
		}
	});
});

describe('content: шаблоны для content-filler', () => {
	it('все шаблоны на месте', () => {
		for (const f of ['cards', 'names', 'traits', 'news', 'cases']) expect(existsSync(here(`./templates/${f}.md`)), f).toBe(true);
	});
});
