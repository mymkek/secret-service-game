import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { applyAction, createGame, selectQuests } from '../game/index';
import { openQuest } from '../game/quest-core';
import { questScripts } from '../content/index';
import { InkQuest } from './ink-adapter';

const labels = (id: string) => Object.fromEntries(questScripts[id].choices.map((c) => [c.id, c.label]));
const json = (id: string) => readFileSync(new URL(`../content/ink/${id}.ink.json`, import.meta.url), 'utf8');

describe('Ink-адаптер квестов', () => {
	it('обычный выбор: Ink показывает текст, ядро применяет questChoice', () => {
		const s = createGame({ seed: 'ink-1' });
		const q = openQuest(s, 'hearings', {});
		const ink = new InkQuest(s, q, json('hearings'), labels('hearings'));
		expect(ink.text.join(' ')).toContain('Комитет');
		const testify = ink.choices.find((c) => c.core?.id === 'testify');
		expect(testify).toBeTruthy();
		const rep = s.reputation;
		const applied = ink.choose(testify!.index);
		expect(applied).toEqual({ choiceId: 'testify', param: null });
		expect(ink.text.join(' ')).toContain('Протокол');
		// Ink сам ничего не применил.
		expect(s.quests).toHaveLength(1);
		expect(applyAction(s, 'player', { type: 'questChoice', sessionId: q.id, choice: 'testify', param: undefined }).ok).toBe(true);
		expect(s.reputation).not.toBe(rep);
		expect(selectQuests(s)).toHaveLength(0);
	});

	it('выбор агента: param, выбранный в UI, доходит до ядра', () => {
		const s = createGame({ seed: 'ink-2' });
		const q = openQuest(s, 'hearings', {});
		const ink = new InkQuest(s, q, json('hearings'), labels('hearings'));
		const sc = ink.choices.find((c) => c.core?.id === 'scapegoat')!;
		expect(sc.core!.needsAgent).toBe(true);
		const agentId = sc.core!.agentIds!.at(-1)!;
		const applied = ink.choose(sc.index, agentId);
		expect(applied).toEqual({ choiceId: 'scapegoat', param: agentId });
		expect(applyAction(s, 'player', { type: 'questChoice', sessionId: q.id, choice: 'scapegoat', param: agentId }).ok).toBe(true);
		expect(s.agents.some((a) => a.id === agentId)).toBe(false);
	});

	it('ошибка ядра возвращается в Ink и ничего не фиксируется', () => {
		const s = createGame({ seed: 'ink-3' });
		const q = openQuest(s, 'hearings', {});
		const ink = new InkQuest(s, q, json('hearings'), labels('hearings'));
		const sc = ink.choices.find((c) => c.core?.id === 'scapegoat')!;
		expect(ink.choose(sc.index, 99999)).toBeNull();
		expect(ink.text.join(' ')).toContain('Не удалось');
	});
});
