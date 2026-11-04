// Регрессии по отчёту balance-analyst (sim/REPORT.md, «Баги ядра»).
import { describe, expect, it } from 'vitest';
import { BALANCE as B } from './balance';
import { advance, applyAction, createGame } from './index';

describe('баг 1: соперник с репутацией ≤ 0 выбывает (§6.6)', () => {
	it('репутация 0 в последний день квартала — выбывает, дрейф 7.8 не спасает (sim/repro-rival-zero.ts)', () => {
		const s = createGame({ seed: 'repro-rival-zero' });
		advance(s, 89, { ignorePause: true });
		const p = s.rivals.find((r) => r.id === 'police')!;
		p.reputation = 0;
		advance(s, 1, { ignorePause: true });
		expect(s.day).toBe(90);
		expect(p.alive).toBe(false);
		expect(p.absorbed).toBe(false);
		expect(s.coalition).toBe(true);
		expect(s.log.some((e) => e.kind === 'rival_disbanded' && e.data.rivalId === 'police')).toBe(true);
	});

	it('посреди квартала выбывает в тот же день, без ожидания распределения', () => {
		const s = createGame({ seed: 'zero-mid' });
		advance(s, 44, { ignorePause: true });
		const cia = s.rivals.find((r) => r.id === 'cia')!;
		cia.reputation = 0;
		advance(s, 1, { ignorePause: true });
		expect(cia.alive).toBe(false);
		expect(cia.share).toBe(0);
	});

	it('слив, доводящий репутацию до 0, расформировывает сразу (действие на паузе)', () => {
		const s = createGame({ seed: 'zero-leak' });
		const ss = s.rivals.find((r) => r.id === 'secret_service')!;
		// Стартовая репутация — ровно урон слива силы 1 (|ACT_LEAK.repPerStrength|): после слива 0.
		ss.reputation = -B.ACT_LEAK.repPerStrength;
		s.kompromat.push({ id: s.nextId++, target: { kind: 'rival', id: 'secret_service' }, strength: 1, acquiredDay: 0, expiresDay: 360, usedCooldownUntil: null });
		expect(applyAction(s, 'player', { type: 'leak', kompromatId: s.kompromat[0].id }).ok).toBe(true);
		expect(ss.alive).toBe(false);
		expect(s.coalition).toBe(true);
	});

	it('все три выбыли по репутации — «Монополия» в тот же день', () => {
		const s = createGame({ seed: 'zero-all' });
		advance(s, 10, { ignorePause: true });
		for (const r of s.rivals) r.reputation = 0;
		advance(s, 1, { ignorePause: true });
		expect(s.outcome).toMatchObject({ status: 'won', victoryPath: 'monopoly' });
	});
});
