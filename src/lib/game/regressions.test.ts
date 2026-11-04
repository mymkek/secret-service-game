// Регрессии по отчёту balance-analyst (sim/REPORT.md, «Баги ядра»).
// Баг 1 (соперник с репутацией 0 «отрастал» на дрейфе) после D-059 проверяется через статус «на грани»:
// репутация замирает на 0 в момент изменения, до дрейфа; выбытие — в конце квартала.
import { describe, expect, it } from 'vitest';
import { BALANCE as B } from './balance';
import { advance, applyAction, createGame, selectRivals } from './index';

describe('баг 1 / D-059: соперник с репутацией ≤ 0 — «на грани», выбывает в конце квартала', () => {
	it('репутация 0 в последний день квартала — «на грани» до дрейфа и выбывает в этот же конец квартала', () => {
		const s = createGame({ seed: 'repro-rival-zero' });
		advance(s, 89, { ignorePause: true });
		const p = s.rivals.find((r) => r.id === 'police')!;
		p.reputation = 0;
		advance(s, 1, { ignorePause: true });
		expect(s.day).toBe(90);
		expect(p.reputation).toBe(0); // дрейф 7.8 не поднял
		expect(p.alive).toBe(false);
		expect(p.absorbed).toBe(false);
		expect(s.coalition).toBe(true);
		expect(s.log.some((e) => e.kind === 'rival_disbanded' && e.data.rivalId === 'police')).toBe(true);
	});

	it('посреди квартала: «на грани», репутация заморожена, не действует, не в распределении; выбывает в конце квартала', () => {
		const s = createGame({ seed: 'zero-mid' });
		advance(s, 44, { ignorePause: true });
		const cia = s.rivals.find((r) => r.id === 'cia')!;
		cia.reputation = 0;
		advance(s, 1, { ignorePause: true });
		expect(cia.alive).toBe(true);
		expect(cia.collapsing).toBe(true);
		expect(selectRivals(s).find((r) => r.id === 'cia')).toMatchObject({ collapsing: true, disbandDay: 90 });
		// Запись журнала в момент перехода (вид rival_collapsing).
		const e = s.log.find((x) => x.kind === 'rival_collapsing');
		expect(e?.data).toEqual({ rivalId: 'cia', disbandDay: 90 });
		expect(s.log.filter((x) => x.kind === 'rival_collapsing')).toHaveLength(1);
		const next = cia.nextActionDay;
		advance(s, 40, { ignorePause: true }); // день 85, через конец месяца 60 с дрейфом
		expect(cia.reputation).toBe(0);
		expect(cia.nextActionDay).toBe(next);
		expect(applyAction(s, 'cia', { type: 'ai', action: 'PR' })).toEqual({ ok: false, error: 'rival_collapsing' });
		advance(s, 5, { ignorePause: true }); // день 90 — конец квартала
		expect(cia.alive).toBe(false);
		expect(cia.share).toBe(0);
		const sum = s.share + s.rivals.reduce((a, r) => a + (r.alive ? r.share : 0), 0);
		expect(sum).toBeCloseTo(1, 9);
	});

	it('слив, доводящий репутацию до 0, ставит «на грани» сразу (действие на паузе)', () => {
		const s = createGame({ seed: 'zero-leak' });
		const ss = s.rivals.find((r) => r.id === 'secret_service')!;
		// Стартовая репутация — ровно урон слива силы 1 (|ACT_LEAK.repPerStrength|): после слива 0.
		ss.reputation = -B.ACT_LEAK.repPerStrength;
		s.kompromat.push({ id: s.nextId++, target: { kind: 'rival', id: 'secret_service' }, strength: 1, acquiredDay: 0, expiresDay: 360, usedCooldownUntil: null });
		expect(applyAction(s, 'player', { type: 'leak', kompromatId: s.kompromat[0].id }).ok).toBe(true);
		expect(ss.alive).toBe(true);
		expect(ss.collapsing).toBe(true);
		expect(ss.reputation).toBe(0);
	});

	it('все три «на грани» — «Монополия» в конце квартала', () => {
		const s = createGame({ seed: 'zero-all' });
		advance(s, 10, { ignorePause: true });
		for (const r of s.rivals) r.reputation = 0;
		advance(s, 1, { ignorePause: true });
		expect(s.outcome.status).toBe('active');
		expect(s.rivals.every((r) => r.collapsing)).toBe(true);
		advance(s, 90 - s.day, { ignorePause: true });
		expect(s.outcome).toMatchObject({ status: 'won', victoryPath: 'monopoly', month: 3 });
	});
});
