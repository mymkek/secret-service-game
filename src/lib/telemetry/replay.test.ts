import { describe, expect, it } from 'vitest';
import { advance, applyAction, createGame, serialize, DEPT_KEYS, TECH_IDS, type PlayerAction } from '../game/index';
import { replaySession, type ReplayAction } from './replay';

describe('replay', () => {
	it('воспроизводит партию по seed + действиям и совпадает с исходным состоянием', () => {
		const seed = 'replay-test';
		const s = createGame({ seed });
		const log: ReplayAction[] = [];
		let seq = 0;
		const act = (a: PlayerAction) => {
			const r = applyAction(s, 'player', a);
			log.push({ seq: seq++, day: s.day, action: a, ok: r.ok, error: r.ok ? null : r.error });
		};
		for (let step = 0; step < 60 && s.outcome.status === 'active'; step++) {
			if (s.hirePool.length) act({ type: 'hire', candidateId: s.hirePool[0].id });
			if (step % 4 === 0) act({ type: 'buildDept', dept: DEPT_KEYS[step % DEPT_KEYS.length] });
			if (step % 9 === 0) act({ type: 'research', tech: TECH_IDS[step % TECH_IDS.length] });
			advance(s, 7, { ignorePause: true });
		}
		const out = s.outcome;
		const r = replaySession(
			{ seed, startDay: 0, config: {}, outcome: out.status === 'active' ? null : out.status, finalDay: out.day ?? s.day },
			log
		);
		expect(r.skipped).toBeNull();
		expect(r.actionMismatches).toEqual([]);
		expect(serialize(r.state!)).toBe(serialize(s));
		if (out.status !== 'active') expect(r.outcomeMatches).toBe(true);
	});

	it('пропускает сессии, начатые с загруженного сейва', () => {
		const r = replaySession({ seed: 'x', startDay: 90, config: {}, outcome: null, finalDay: null }, []);
		expect(r.skipped).toMatch(/loaded save/);
	});
});
