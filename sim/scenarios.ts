// Стартовые сценарии (как в поздней fuzz-партии ядра): изменяют свежую партию до первого хода.
import type { GameState } from '../src/lib/game/index';
import { DEPT_KEYS } from '../src/lib/game/index';

/** Поздняя партия из fuzz.test.ts: всё прокачано, Репрессии 5, недовольство 65. */
export function lateFuzz(s: GameState): void {
	for (const d of DEPT_KEYS) s.departments[d] = 5;
	s.survLevel = s.survMaxEver = 5;
	s.reprLevel = s.reprMaxEver = 5;
	s.techs.push('A1', 'A2', 'B1', 'B2', 'C1', 'C2');
	s.unrest = 65;
	s.influence = 60;
	s.budget = 20000;
}

export const SCENARIOS: Record<string, (s: GameState) => void> = {
	late: lateFuzz
};
