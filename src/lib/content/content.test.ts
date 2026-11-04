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
import { ALL_QUEST_IDS, questChoices } from '../game/quests';
import { DILEMMA_CHOICE_IDS } from '../game/dilemmas';
import {
	BUILTIN_TRAITS,
	DEPT_KEYS,
	DILEMMA_LOG_KINDS,
	DILEMMA_QUEST_IDS,
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
import { cases as caseTexts, taggedCases } from './cases';
import { EPILOGUE_LINE_VALUES } from './epilogue-texts';
import { opOutcomeTexts } from './op-outcomes';
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
	it('для каждого LOG_KINDS, PENDING_LOG_KINDS и DILEMMA_LOG_KINDS есть ровно один текст', () => {
		const all = [...new Set<string>([...LOG_KINDS, ...PENDING_LOG_KINDS, ...DILEMMA_LOG_KINDS])];
		expect(content.events.map((e) => e.kind).sort()).toEqual(all.sort());
		const collapsing = renderLogEntry({ id: 8, day: 3, kind: 'rival_collapsing', data: { rivalId: 'cia', disbandDay: 90 }, source: null });
		expect(collapsing.text).toContain('ЦРУ');
		expect(collapsing.text).toContain('год 1, месяц 3, день 30');
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
			'ratioPct', 'sharePct', 'pathName', 'hearingReason', 'title', 'resultText', 'repLossRounded', 'senatorName', 'disbandDate'
		];
		const raw = ['level', 'difficulty', 'income', 'expenses', 'budget', 'streak', 'agents', 'missing', 'quarter', 'points', 'target', 'crimes', 'stage', 'money', 'plan'];
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

describe('content: исходы дел и операций', () => {
	it('у каждого дела (в том числе с меткой) по 2 непустых success/fail длиной до 160 знаков', () => {
		for (const c of [...caseTexts, ...Object.values(taggedCases).flat()]) {
			for (const k of ['success', 'fail'] as const) {
				expect(c[k].length, `${c.id}.${k}`).toBe(2);
				for (const s of c[k]) {
					expect(s.trim().length, `${c.id}.${k}`).toBeGreaterThan(20);
					expect(s.length, `${c.id}.${k}: ${s}`).toBeLessThanOrEqual(160);
				}
			}
		}
	});
	it('дела с меткой: у каждой метки есть пул, id не пересекаются с общими, дело-провокация - теракт', () => {
		expect(Object.keys(taggedCases).sort()).toEqual(['real_culprit', 'signal', 'source', 'sting']);
		const ids = new Set(caseTexts.map((c) => c.id));
		for (const [tag, pool] of Object.entries(taggedCases)) {
			expect(pool.length, tag).toBeGreaterThanOrEqual(2);
			for (const c of pool) {
				expect(ids.has(c.id), c.id).toBe(false);
				ids.add(c.id);
				expect(c.caseKind, c.id).toBe(tag === 'sting' ? 'terror' : 'regular');
				expect(c.title.length, c.id).toBeLessThanOrEqual(50);
			}
		}
	});
	it('пулы opOutcomeTexts: 3-4 строки, до 160 знаков, плейсхолдеры только по цели', () => {
		for (const [type, byTarget] of Object.entries(opOutcomeTexts)) {
			expect(Object.keys(byTarget).sort()).toEqual(['leader', 'president', 'rival', 'senator']);
			for (const [target, pool] of Object.entries(byTarget)) {
				for (const k of ['success', 'fail'] as const) {
					const where = `${type}.${target}.${k}`;
					expect(pool[k].length, where).toBeGreaterThanOrEqual(3);
					expect(pool[k].length, where).toBeLessThanOrEqual(4);
					for (const s of pool[k]) {
						expect(s.length, `${where}: ${s}`).toBeLessThanOrEqual(160);
						const ph = [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]);
						const allowed = target === 'rival' ? ['rivalName'] : target === 'senator' ? ['senatorName'] : [];
						for (const p of ph) expect(allowed, `${where}: {${p}}`).toContain(p);
					}
				}
			}
		}
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
		expect(content.quests.map((q) => q.questId).sort()).toEqual([...ALL_QUEST_IDS].sort());
	});

	it('подписи выборов совпадают с questChoices ядра', () => {
		for (const q of content.quests) {
			const base = session(q.questId as QuestSession['questId']);
			const found = new Set(questChoices(state, base).map((c) => c.id));
			// У «Народного авангарда» две стадии с разным набором выборов: choice и partner.
			if (q.questId === 'vanguard_offer') for (const c of questChoices(state, { ...base, stage: 'partner' })) found.add(c.id);
			expect(Object.keys(q.choiceLabels).sort(), q.questId).toEqual([...found].sort());
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
				if (script.handwritten) {
					// В рукописных сценариях подпись может получить хвост «; риск: …» или «; шанс N%», поэтому ищем её без закрывающей скобки.
					expect(src, `${q.questId}.${c.id}`).toContain(c.label.replace(/\)$/, ''));
					if (c.argument) expect(src, `${q.questId}.${c.id}.argument`).toContain(c.argument);
				} else expect(src).toContain(c.label);
				expect(src).toContain(c.outcome);
			}
		}
	});

	it('рукописные Ink: ровно дилеммы и линейка, генератор их пропускает', () => {
		for (const id of DILEMMA_QUEST_IDS) {
			expect(questScripts[id]?.handwritten, id).toBe(true);
			expect(read(`./ink/${id}.ink`), id).toContain('Написано вручную');
		}
		for (const q of content.quests) {
			if (!(DILEMMA_QUEST_IDS as readonly string[]).includes(q.questId)) expect(questScripts[q.questId].handwritten, q.questId).toBeUndefined();
		}
		expect(read('./ink/generate.mjs')).toContain('q.handwritten');
	});
});

describe('content: дилеммы, линейка, эпилог (D-067)', () => {
	it('dilemmas: по окну на каждый DILEMMA_QUEST_IDS, id выборов из DILEMMA_CHOICE_IDS, довод у каждой опции', () => {
		const defs = content.dilemmas ?? [];
		expect(defs.map((d) => d.questId).sort()).toEqual([...DILEMMA_QUEST_IDS].sort());
		for (const d of defs) {
			const ids = DILEMMA_CHOICE_IDS[d.questId as keyof typeof DILEMMA_CHOICE_IDS];
			expect(d.choices.map((c) => c.id).sort(), d.questId).toEqual([...ids].sort());
			if (d.questId !== 'vanguard_result') expect(words(d.body), d.questId).toBeLessThanOrEqual(60);
			for (const c of d.choices) {
				expect(words(c.argument), `${d.questId}.${c.id}`).toBeLessThanOrEqual(35);
				expect(c.argument.trim().length, `${d.questId}.${c.id}`).toBeGreaterThan(10);
				expect(content.quests.find((x) => x.questId === d.questId)!.choiceLabels[c.id]).toBe(c.label);
			}
		}
	});

	it('dilemmas: каждая грязная опция помечена, числа в подписях совпадают с balance.ts', () => {
		const label = (q: string, c: string) => content.dilemmas!.find((d) => d.questId === q)!.choices.find((x) => x.id === c)!.label;
		const pct = (x: number) => Math.round(x * 100);
		for (const [q, c] of [
			['dilemma_source_crime', 'blind_eye'],
			['dilemma_forced_confession', 'press'],
			['dilemma_sting', 'provoke'],
			['dilemma_quiet_signal', 'wiretap'],
			['dilemma_quiet_signal', 'detain'],
			['dilemma_fudged_warrant', 'fudge'],
			['dilemma_election_dossier', 'leak'],
			['vanguard_stage2', 'devoted'],
			['vanguard_stage3', 'provoke']
		]) {
			expect(label(q, c), `${q}.${c}`).toContain('грязное');
		}
		expect(label('dilemma_source_crime', 'surrender')).toContain(`репутация −${Math.abs(B.DL_VALUABLE_SOURCE.surrenderRep)}`);
		expect(label('dilemma_source_crime', 'blind_eye')).toContain(`засвеченность +${B.DL_VALUABLE_SOURCE.blindEyeExposure}`);
		expect(label('dilemma_forced_confession', 'deal')).toContain(`×${B.DL_FORCED_CONFESSION.dealRewardMult}`);
		expect(label('dilemma_sting', 'provoke')).toContain(`+${pct(B.DL_STING.chanceBonus)}%`);
		expect(label('dilemma_sting', 'provoke')).toContain(`${B.DL_STING.timerDays} дней`);
		expect(label('dilemma_sting', 'provoke')).toContain(`сложности ${B.DL_STING.caseDifficulty}`);
		expect(label('dilemma_quiet_signal', 'wiretap')).toContain(`засвеченность +${B.DL_SIGNAL.dirtyExposure}`);
		expect(label('dilemma_quiet_signal', 'detain')).toContain(`Репрессии ${B.DL_SIGNAL.detainMinRepr}`);
		expect(label('dilemma_quiet_signal', 'legal')).toContain(`сложности ${B.DL_SIGNAL.caseDifficulty}`);
		expect(label('dilemma_share_with_cia', 'share')).toContain(`+${pct(B.DL_SHARE_CIA.chanceBonus)}%`);
		expect(label('dilemma_share_with_cia', 'share')).toContain(`${B.DL_SHARE_CIA.favorDays} дней`);
		expect(label('dilemma_fudged_warrant', 'fudge')).toContain(`+${pct(B.DL_FUDGED_WARRANT.chanceBonus)}%`);
		expect(label('dilemma_cover_life', 'allow')).toContain(`+${pct(B.DL_COVER_LIFE.allowChance)}%`);
		expect(label('dilemma_cover_life', 'forbid')).toContain(`−${pct(Math.abs(B.DL_COVER_LIFE.forbidChance))}%`);
		expect(label('dilemma_election_dossier', 'announce')).toContain(`−${pct(Math.abs(B.DL_ELECTION_DOSSIER.publicAdminDelta))}%`);
		expect(label('dilemma_election_dossier', 'leak')).toContain(`−${pct(Math.abs(B.DL_ELECTION_DOSSIER.leakAdminDelta))}%`);
		expect(label('dilemma_election_dossier', 'leak')).toContain(`засвеченность +${B.DL_ELECTION_DOSSIER.leakExposure}`);
		expect(label('vanguard_offer', 'start')).toContain(`${B.LINE_STAGE_COST[0]} k$`);
		expect(label('vanguard_offer', 'partner')).toContain(`+${pct(B.LINE_PARTNER_BONUS)}%`);
		expect(label('vanguard_stage2', 'cautious')).toContain(`${B.LINE_STAGE_COST[1]} k$`);
		expect(label('vanguard_stage2', 'devoted')).toContain(`засвеченность +${B.LINE_DEVOTED_EXPOSURE}`);
		expect(label('vanguard_stage3', 'evidence')).toContain(`${B.LINE_STAGE_COST[2]} k$`);
		expect(label('vanguard_stage3', 'quiet')).toContain(`+${B.LINE_QUIET.money} k$`);
		expect(label('vanguard_stage3', 'quiet')).toContain(`очки плана +${B.LINE_QUIET.plan}`);
	});

	it('line: 4 этапа, 8 развязок, суммы наград совпадают с balance.ts', () => {
		const line = content.line!;
		expect(line.stages.map((s) => s.stage)).toEqual([1, 2, 3, 4]);
		expect(Object.keys(line.outcomes).sort()).toEqual(['fail_broken', 'fail_captured', 'fail_fled', 'fail_killed', 'quiet', 'recalled', 'success_clean', 'success_dirty']);
		const R = B.LINE_REWARD_CLEAN;
		expect(line.outcomes.success_clean).toContain(`+${R.money} k$`);
		expect(line.outcomes.success_clean).toContain(`очки плана +${R.plan}`);
		expect(line.outcomes.success_clean).toContain(`влияние +${R.influence}`);
		expect(line.outcomes.success_clean).toContain(`репутация +${R.rep}`);
		const D = B.LINE_REWARD_DIRTY;
		expect(line.outcomes.success_dirty).toContain(`+${D.money} k$`);
		expect(line.outcomes.success_dirty).toContain(`очки плана +${D.plan}`);
		expect(line.outcomes.success_dirty).toContain(`влияние +${D.influence}`);
		expect(line.outcomes.success_dirty).toContain(`репутация +${D.rep}`);
		expect(line.outcomes.quiet).toContain(`+${B.LINE_QUIET.money} k$`);
		expect(line.outcomes.fail_fled).toContain(`засвеченность +${B.LINE_FAIL_EXPOSURE}`);
		expect(line.outcomes.fail_killed).toContain(`репутация −${Math.abs(B.LINE_KILLED_REP)}`);
		// Развязки совпадают с ветками Ink (одна точка правды - quests.data.json).
		const ink = read('./ink/vanguard_result.ink');
		for (const text of Object.values(line.outcomes)) expect(ink).toContain(text);
	});

	it('epilogue: строки по всем ключам, 5 вердиктов, 6 абзацев о выборах, плейсхолдеры известны', () => {
		const ep = content.epilogue!;
		expect(Object.keys(ep.lines).sort()).toEqual(Object.keys(EPILOGUE_LINE_VALUES).sort());
		expect(Object.keys(ep.verdicts).sort()).toEqual(['church', 'exemplary', 'gray', 'heavy_memory', 'reform']);
		expect(Object.keys(ep.election)).toHaveLength(6);
		for (const [key, line] of Object.entries(ep.lines)) {
			const allowed = EPILOGUE_LINE_VALUES[key as keyof typeof EPILOGUE_LINE_VALUES];
			for (const m of line.text.matchAll(/\{(\w+)\}/g)) expect(allowed, `${key}: {${m[1]}}`).toContain(m[1]);
			// Каждое значение строки используется хотя бы раз, иначе число пропадёт из доклада.
			for (const v of allowed) expect(line.text, `${key}: нет {${v}}`).toContain(`{${v}}`);
			expect(line.realCase, key).toBeTruthy();
		}
		for (const v of Object.values(ep.verdicts)) expect(words(v.text)).toBeLessThanOrEqual(70);
	});

	it('журнал дилемм и линейки подставляет данные без остатка {…}', () => {
		const samples: [string, Record<string, unknown>][] = [
			['source_exposed', { crimes: 2 }],
			['false_confession_culprit', { stateId: 'TX' }],
			['false_confession_review', { stateId: 'TX' }],
			['sting_case', { stateId: 'TX' }],
			['signal_case', { stateId: 'TX' }],
			['signal_prevented', { stateId: 'TX', method: 'legal' }],
			['signal_false_alarm', { stateId: 'TX' }],
			['cover_scandal', { agentId: 3 }],
			['line_started', { agentId: 3, partnerId: null }],
			['line_stage_done', { stage: 2, chance: 0.8 }],
			['line_success', { variant: 'evidence', money: 2500, plan: 6 }],
			['line_quiet', { money: 150, plan: 2 }],
			['line_failed', { stage: 3, outcome: 'fled' }]
		];
		for (const [kind, data] of samples) {
			const r = renderLogEntry({ id: 1, day: 5, kind, data, source: null } as LogEntry);
			expect(r.text, kind).not.toMatch(/[{}]/);
		}
		for (const kind of DILEMMA_LOG_KINDS) expect(eventTexts[kind], kind).toBeDefined();
		expect(renderLogEntry({ id: 1, day: 5, kind: 'line_success', data: { variant: 'evidence', money: 2500, plan: 6 }, source: null } as LogEntry).text).toContain('2500');
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
