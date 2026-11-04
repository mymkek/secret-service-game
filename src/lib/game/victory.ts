// Победы и поражения (§8). Коды совпадают с results.victory_path / results.defeat_reason.
import { BALANCE as B } from './balance';
import { addInvestigation, defeat, isOver, kompromatActive, log, victory } from './effects';
import { reprRequirement } from './development';
import { pickOne, roll } from './rng';
import { termDays } from './formulas';
import { shadowCountries } from './networks';
import type { GameState, VictoryPath } from './types';

/** Слежка, которую «1984» требует весь период удержания (§8.1, D-054) — требование Репрессий 7. */
export function surv1984Required(): number {
	return reprRequirement(7).surv ?? 0;
}

/** Счётчики удержания «1984», «Тени» и «Кардинала» — обновляются в конце каждого дня. */
export function updateHoldCounters(s: GameState): void {
	if (s.reprLevel >= 7 && s.survLevel >= surv1984Required() && s.control >= B.VICTORY_1984_CONTROL) s.counters.hold1984Days += 1;
	else s.counters.hold1984Days = 0;
	// §8.5, D-050: условие «Кардинала» должно держаться непрерывно.
	if (cardinalMet(s)) s.counters.holdCardinalDays += 1;
	else s.counters.holdCardinalDays = 0;
	const all = shadowCountries(s).every((c) => (s.networks[c]?.level ?? 0) >= B.SHADOW_NETWORK_LEVEL);
	if (all) s.counters.holdShadowDays += 1;
	else s.counters.holdShadowDays = 0;
}

export function cardinalMet(s: GameState): boolean {
	const president = s.kompromat.some((k) => k.target.kind === 'president' && kompromatActive(s, k));
	if (!president) return false;
	const senators = new Set<string>();
	for (const k of s.kompromat) if (k.target.kind === 'senator' && kompromatActive(s, k)) senators.add(k.target.id);
	return senators.size >= B.CARDINAL_SENATORS_REQUIRED;
}

export function cleanMet(s: GameState): boolean {
	return (
		s.plan.metCount >= B.CLEAN_MIN_QUARTERS_MET &&
		s.reputation >= B.CLEAN_MIN_REPUTATION &&
		s.exposure < B.CLEAN_MAX_EXPOSURE &&
		s.counters.dirtyActions === 0 &&
		s.reprMaxEver === 0 &&
		s.survMaxEver <= B.CLEAN_MAX_SURV_LEVEL &&
		s.plan.fakeTotal === 0
	);
}

/** Какие пути выполнены сейчас (без учёта «только в конце срока» для clean). */
export function victoryConditions(s: GameState): Record<VictoryPath, boolean> {
	return {
		monopoly: s.rivals.every((r) => !r.alive),
		cardinal: s.counters.holdCardinalDays >= B.CARDINAL_HOLD_DAYS,
		shadow: s.counters.holdShadowDays >= B.SHADOW_HOLD_DAYS,
		'1984': s.counters.hold1984Days >= B.VICTORY_1984_HOLD_DAYS,
		clean: cleanMet(s)
	};
}

/** Засчитанные предметы компромата на сенаторов (по одному на сенатора, самый поздний по сроку). */
function countedSenatorItems(s: GameState) {
	const best = new Map<string, GameState['kompromat'][number]>();
	for (const k of s.kompromat) {
		if (k.target.kind !== 'senator' || !kompromatActive(s, k)) continue;
		const cur = best.get(k.target.id);
		if (!cur || (k.expiresDay ?? Infinity) > (cur.expiresDay ?? Infinity)) best.set(k.target.id, k);
	}
	return [...best.values()].sort((a, b) => a.id - b.id);
}

/**
 * §8.5, D-050: ответный удар в конце месяца, пока идёт удержание «Кардинала»:
 * «Под следствием» +CARDINAL_HOLD_INVESTIGATION (× legal_inv_mult) и с шансом
 * CARDINAL_HOLD_BURN_CHANCE сгорает один случайный из засчитанных предметов на сенаторов.
 */
export function cardinalHoldStrike(s: GameState): void {
	if (s.counters.holdCardinalDays <= 0) return;
	addInvestigation(s, B.CARDINAL_HOLD_INVESTIGATION);
	if (roll(s, B.CARDINAL_HOLD_BURN_CHANCE)) {
		const k = pickOne(s, countedSenatorItems(s));
		if (k) {
			s.kompromat = s.kompromat.filter((x) => x.id !== k.id);
			log(s, 'kompromat_burned', { kompromatId: k.id, senatorId: k.target.kind === 'senator' ? k.target.id : null });
		}
	}
}

/** Шаг 8 дня: поражения, затем победы по приоритету, затем тайм-аут. */
export function checkOutcome(s: GameState): void {
	if (isOver(s)) return;
	if (s.reputation <= 0) return defeat(s, 'reputation');
	if (s.investigation >= B.INVESTIGATION_ARREST_THRESHOLD) return defeat(s, 'arrested');
	const end = s.day >= termDays();
	const met = victoryConditions(s);
	for (const p of B.VICTORY_PRIORITY as VictoryPath[]) {
		if (p === 'clean' && !end) continue;
		if (met[p]) return victory(s, p);
	}
	if (end) defeat(s, 'timeout');
}
