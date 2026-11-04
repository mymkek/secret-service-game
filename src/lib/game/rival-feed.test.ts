// D-070, D-071: лента действий конкурентов и доклады внедрённого агента.
import { describe, expect, it } from 'vitest';
import { performRivalAction } from './ai/actions';
import { createGame } from './index';

const N = 40;

function run(insider: boolean) {
	const s = createGame({ seed: 'rival-feed' });
	s.departments.counterintel = 0;
	if (insider) {
		s.agents[0].status = 'embedded';
		s.agents[0].location = { rivalId: 'cia' };
	}
	for (let i = 0; i < N; i++) performRivalAction(s, 'cia', 'SURVEIL_PLAYER');
	for (let i = 0; i < N; i++) performRivalAction(s, 'cia', 'PR');
	return s;
}

describe('лента конкурентов', () => {
	it('открытые действия видны всегда, враждебные без агента — не все', () => {
		const s = run(false);
		expect(s.rivalFeed.filter((e) => !e.hostile)).toHaveLength(N);
		expect(s.rivalFeed.filter((e) => e.hostile).length).toBeLessThan(N);
	});

	it('внедрённый агент докладывает обо всех враждебных действиях, источник известен', () => {
		const s = run(true);
		expect(s.rivalFeed.filter((e) => e.hostile)).toHaveLength(N);
		expect(s.log.filter((e) => e.kind === 'rival_action' && e.source === 'unknown')).toHaveLength(0);
	});

	it('внедрение не сдвигает RNG', () => {
		expect(run(true).rngState).toEqual(run(false).rngState);
	});
});
