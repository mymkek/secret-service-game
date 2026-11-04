import { describe, expect, it } from 'vitest';
import { next, pickOne, pickWeightedIndex, randFloat, randInt, roll, seedRng, shuffle } from './rng';

const holder = (seed: string) => ({ rngState: seedRng(seed) });

describe('rng (§0)', () => {
	it('одно зерно — одна последовательность, разные зёрна — разные', () => {
		const a = holder('x');
		const b = holder('x');
		const c = holder('y');
		const sa = Array.from({ length: 20 }, () => next(a));
		const sb = Array.from({ length: 20 }, () => next(b));
		const sc = Array.from({ length: 20 }, () => next(c));
		expect(sa).toEqual(sb);
		expect(sa).not.toEqual(sc);
		for (const v of sa) expect(v >= 0 && v < 1).toBe(true);
	});

	it('состояние — 4 uint32 и переживает JSON', () => {
		const h = holder('json');
		next(h);
		const copy = JSON.parse(JSON.stringify(h));
		expect(next(copy)).toBe(next(h));
		for (const x of h.rngState) expect(Number.isInteger(x) && x >= 0 && x < 2 ** 32).toBe(true);
	});

	it('roll(p ≤ 0) всё равно тратит ровно один вызов и даёт false', () => {
		const a = holder('r');
		const b = holder('r');
		expect(roll(a, 0)).toBe(false);
		expect(roll(a, -1)).toBe(false);
		next(b);
		next(b);
		expect(a.rngState).toEqual(b.rngState);
		expect(roll(holder('r'), 1)).toBe(true);
	});

	it('pickWeighted при нулевой сумме тратит один вызов и возвращает -1', () => {
		const a = holder('w');
		const b = holder('w');
		expect(pickWeightedIndex(a, [0, 0, 0])).toBe(-1);
		next(b);
		expect(a.rngState).toEqual(b.rngState);
		expect(pickOne(holder('w'), [])).toBeNull();
	});

	it('pickWeighted никогда не выбирает нулевой вес и примерно следует весам', () => {
		const h = holder('dist');
		const counts = [0, 0, 0];
		for (let i = 0; i < 20000; i++) counts[pickWeightedIndex(h, [1, 0, 3])]++;
		expect(counts[1]).toBe(0);
		expect(counts[2] / counts[0]).toBeGreaterThan(2.7);
		expect(counts[2] / counts[0]).toBeLessThan(3.3);
	});

	it('randInt включает обе границы, randFloat — [a, b)', () => {
		const h = holder('int');
		const seen = new Set<number>();
		for (let i = 0; i < 2000; i++) {
			const v = randInt(h, 1, 3);
			expect(v >= 1 && v <= 3).toBe(true);
			seen.add(v);
			const f = randFloat(h, -0.15, 0.15);
			expect(f >= -0.15 && f < 0.15).toBe(true);
		}
		expect([...seen].sort()).toEqual([1, 2, 3]);
	});

	it('shuffle — перестановка', () => {
		const out = shuffle(holder('s'), [0.85, 1, 1.15, 1]);
		expect([...out].sort()).toEqual([0.85, 1, 1, 1.15]);
	});
});
