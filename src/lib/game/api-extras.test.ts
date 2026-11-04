// Запросы TODO(core) от ui-builder и content-writer: экспорты, селекторы цен, контракт выбора агента в квестах.
import { describe, expect, it } from 'vitest';
import { BALANCE as B } from './balance';
import {
	ContentBundleSchema,
	applyAction,
	contentToConfig,
	createGame,
	formatEventText,
	questChoices,
	selectActionCosts,
	selectDeployCost,
	selectDeployOptions,
	selectSenators,
	validateAction,
	type ContentBundle
} from './index';
import { triggerHearings } from './quest-core';
import type { GameState } from './types';

function rich(seed: string): GameState {
	const s = createGame({ seed });
	s.budget = 100000;
	return s;
}

describe('экспорты index.ts', () => {
	it('contentToConfig, formatEventText, ContentBundle доступны из index', () => {
		const b: ContentBundle = ContentBundleSchema.parse({ version: 1, agentNames: { firstNames: ['A'], lastNames: ['B'] } });
		expect(contentToConfig(b).extraCards).toEqual([]);
		expect(formatEventText('x{a}', { a: 1 })).toBe('x1');
	});
});

describe('selectActionCosts', () => {
	it('цены, откаты, риски и ошибки', () => {
		const s = rich('costs');
		let c = selectActionCosts(s);
		expect(c.prCampaign).toMatchObject({ cost: B.PR_CAMPAIGN.cost, readyInDays: 0, error: null });
		expect(applyAction(s, 'player', { type: 'prCampaign' }).ok).toBe(true);
		c = selectActionCosts(s);
		expect(c.prCampaign).toMatchObject({ readyInDays: B.PR_CAMPAIGN.cooldownDays, error: 'cooldown' });
		expect(c.congressWork.cost).toBe(B.ACT_CONGRESS_WORK.cost);
		expect(c.loyaltyCheck.chance).toBeCloseTo(B.ACT_LOYALTY_CHECK.base);
		expect(c.rivals.cia.lobby).toMatchObject({ cost: B.ACT_LOBBY.cost, influence: B.ACT_LOBBY.influence, risk: B.ACT_LOBBY.backfireChance });
		expect(c.rivals.cia.sabotage.error).toBe('need_embedded_agent');
		expect(c.rivals.police.absorb.error).toBe('requirements');
		expect(c.rivals.police.poach.risk).toBeCloseTo(B.ACT_POACH.moleBase);
		s.techs.push('C1');
		s.kompromat.push({ id: s.nextId++, target: { kind: 'rival', id: 'police' }, strength: 3, acquiredDay: 0, expiresDay: 360, usedCooldownUntil: null });
		c = selectActionCosts(s);
		expect(c.rivals.cia.sabotage.cost).toBe(Math.round(B.ACT_SABOTAGE.cost * B.TECH_C1_DIRTY_COST_MULT));
		expect(c.leak).toHaveLength(1);
		expect(c.leak[0]).toMatchObject({
			rivalId: 'police',
			strength: 3,
			targetRepDelta: B.ACT_LEAK.repPerStrength * 3,
			cost: Math.round(B.ACT_LEAK.cost * B.TECH_C1_DIRTY_COST_MULT),
			error: null
		});
	});
});

describe('заброска и сенаторы', () => {
	it('selectDeployCost = легенда + деньги на вербовку', () => {
		const s = createGame({ seed: 'deploy' });
		const d = B.LEGEND_COST.diplomat;
		const m = B.RECRUIT_METHODS.money.cost;
		expect(selectDeployCost(s, 'diplomat', 'money')).toEqual({ legendCost: d, recruitCost: m, total: d + m, canAfford: true });
		expect(selectDeployCost(s, 'student', 'ideology').total).toBe(B.LEGEND_COST.student);
		s.budget = d + m - 1;
		expect(selectDeployCost(s, 'diplomat', 'money').canAfford).toBe(false);
		const o = selectDeployOptions(s);
		expect(o.legends.map((l) => l.legend)).toEqual(['diplomat', 'businessman', 'journalist', 'student']);
		expect(o.recruit.find((r) => r.method === 'kompromat')?.available).toBe(false);
	});

	it('selectSenators: id, сопротивление, сложность, компромат', () => {
		const s = createGame({ seed: 'sen' });
		s.kompromat.push({ id: s.nextId++, target: { kind: 'senator', id: 'senator_3' }, strength: 1, acquiredDay: 0, expiresDay: 360, usedCooldownUntil: 50 });
		const v = selectSenators(s);
		expect(v).toHaveLength(9);
		expect(v[2]).toMatchObject({ id: 'senator_3', index: 3, blackmailReadyDay: 50 });
		expect(v[2].kompromatIds).toHaveLength(1);
		for (const x of v) expect(x.surveillanceDifficulty).toBe(B.OP_TARGET_DIFFICULTY.senator + x.resistance - B.SENATOR_RESISTANCE_PIVOT);
	});
});

describe('квесты: выбор агента и компромата (контракт «выбирает UI»)', () => {
	it('needsAgent/agentIds; param = -1 (Ink) — первый свободный агент', () => {
		const s = createGame({ seed: 'goat' });
		triggerHearings(s, 't');
		const q = s.quests[0];
		const goat = questChoices(s, q).find((c) => c.id === 'scapegoat')!;
		expect(goat.needsAgent).toBe(true);
		expect(goat.agentIds).toEqual(s.agents.map((a) => a.id));
		const first = s.agents[0].id;
		expect(applyAction(s, 'player', { type: 'questChoice', sessionId: q.id, choice: 'scapegoat', param: -1 }).ok).toBe(true);
		expect(s.agents.find((a) => a.id === first)).toBeUndefined();
	});

	it('UI передаёт конкретного агента; занятый агент отклоняется', () => {
		const s = createGame({ seed: 'goat2' });
		triggerHearings(s, 't');
		const q = s.quests[0];
		const [a, b] = s.agents;
		a.status = 'training';
		expect(validateAction(s, { type: 'questChoice', sessionId: q.id, choice: 'scapegoat', param: a.id })).toBe('agent_busy');
		expect(applyAction(s, 'player', { type: 'questChoice', sessionId: q.id, choice: 'scapegoat', param: b.id }).ok).toBe(true);
		expect(s.agents.some((x) => x.id === b.id)).toBe(false);
		expect(s.agents.some((x) => x.id === a.id)).toBe(true);
	});

	it('компромат: -1 тратит первый действующий предмет, а не применяет эффект бесплатно', () => {
		const s = rich('disc');
		s.quests.push({ id: s.nextId++, questId: 'journalist', createdDay: 0, stage: 'choice', params: {}, waitUntilDay: null, inkStateJson: null });
		s.kompromat.push({ id: s.nextId++, target: { kind: 'rival', id: 'cia' }, strength: 1, acquiredDay: 0, expiresDay: 360, usedCooldownUntil: null });
		const q = s.quests[0];
		const d = questChoices(s, q).find((c) => c.id === 'discredit')!;
		expect(d).toMatchObject({ needsKompromat: true, kompromatIds: [s.kompromat[0].id] });
		expect(validateAction(s, { type: 'questChoice', sessionId: q.id, choice: 'discredit', param: 999999 })).toBe('kompromat_not_found');
		expect(applyAction(s, 'player', { type: 'questChoice', sessionId: q.id, choice: 'discredit', param: -1 }).ok).toBe(true);
		expect(s.kompromat).toHaveLength(0);
	});
});

describe('content-schema: опциональные разделы текстов экранов', () => {
	const names = { firstNames: ['A'], lastNames: ['B'] };
	it('досье, финалы, операции, технологии, новости валидируются', () => {
		const ok = ContentBundleSchema.safeParse({
			version: 1,
			agentNames: names,
			rivals: [{ id: 'cia', name: 'ЦРУ', dossier: 'Лэнгли.' }],
			endings: [{ outcome: 'arrested', title: 'Наручники', text: 'Конец.' }],
			operations: [{ opType: 'terror', name: 'Поимка', description: 'Штурм.' }],
			techs: [{ id: 'A1', name: 'Большие данные', description: 'Таблицы.' }],
			news: [{ id: 'n1', text: 'Погода.', minMonth: 1, maxMonth: 12 }]
		});
		expect(ok.success).toBe(true);
		expect(ContentBundleSchema.safeParse({ version: 1, agentNames: names, endings: [{ outcome: 'won', title: 't', text: 't' }] }).success).toBe(false);
		// Без новых разделов пакет по-прежнему валиден.
		expect(ContentBundleSchema.safeParse({ version: 1, agentNames: names }).success).toBe(true);
	});
});
