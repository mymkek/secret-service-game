// Эпилог «Рассекречивание» (§9.10, D-067): только чтение. На счёт и исход не влияет.
import { BALANCE as B } from './balance';
import type { ElectionMeddling, EpilogueHistory, GameState } from './types';

export type EpilogueVerdict = 'church' | 'reform' | 'gray' | 'heavy_memory' | 'exemplary';

/** Строка «отложенной правды»: key — шаблон текста в контенте, values — подстановки. Только ненулевые. */
export interface EpilogueLine {
	key:
		| 'forced_confessions'
		| 'stings'
		| 'informant'
		| 'signals'
		| 'innocents'
		| 'warrants'
		| 'cover_lives'
		| 'vanguard'
		| 'shared_with_cia'
		| 'election'
		| 'dirty_actions';
	values: Record<string, number | string | boolean>;
}

export interface EpilogueView {
	yearsLater: number;
	lines: EpilogueLine[];
	verdict: EpilogueVerdict;
	/** Число скрытых грехов и всплывших при жизни директора тайн (§9.10). */
	hiddenSins: number;
	revealed: number;
	/** Абзац о выборах: null, если партия закончилась до выборов (§9.10 п. 3). */
	election: { result: 'new_admin' | 'reelected'; meddling: ElectionMeddling } | null;
	history: EpilogueHistory;
}

const ind = (b: boolean) => (b ? 1 : 0);

/** §9.10: hidden_sins. */
export function hiddenSins(h: EpilogueHistory): number {
	return (
		h.informantCrimes +
		h.forcedConfessions +
		h.stings +
		h.warrantsFudged +
		h.innocentsSurveilled +
		h.innocentsDetained +
		h.linesProvoked +
		h.lineCrimes +
		ind(h.electionMeddling !== 'none')
	);
}

/** §9.10: revealed — сколько тайн всплыло ещё при жизни директора. */
export function revealedSecrets(h: EpilogueHistory): number {
	return ind(h.sourceExposed) + h.stingsExposed + h.fudgeCaught + h.falseReviews + ind(h.leakRevealed) + h.lineExposed + h.coverScandals;
}

/** §9.10: вердикт комиссии — первый подходящий. */
export function epilogueVerdict(h: EpilogueHistory): EpilogueVerdict {
	const V = B.EPILOGUE_VERDICT;
	const sins = hiddenSins(h);
	if (sins >= V.church || revealedSecrets(h) >= V.churchRevealed) return 'church';
	if (sins >= V.reform) return 'reform';
	if (sins >= 1) return 'gray';
	if (h.missedSignals >= 1) return 'heavy_memory';
	return 'exemplary';
}

/** Экран «Через 25 лет. Доклад комиссии» (§9.10). Можно звать в любой момент; UI показывает после итогов. */
export function selectEpilogue(s: GameState): EpilogueView {
	const h = s.history;
	const lines: EpilogueLine[] = [];
	const add = (key: EpilogueLine['key'], values: EpilogueLine['values'], show: boolean) => {
		if (show) lines.push({ key, values });
	};
	add('forced_confessions', { forcedConfessions: h.forcedConfessions, falseConfessions: h.falseConfessions, falseReviews: h.falseReviews }, h.forcedConfessions > 0);
	add('stings', { stings: h.stings, stingsWouldntAct: h.stingsWouldntAct, stingsExposed: h.stingsExposed }, h.stings > 0);
	add('informant', { informantCrimes: h.informantCrimes, sourceExposed: h.sourceExposed }, h.informantCrimes > 0 || h.sourceExposed);
	add(
		'signals',
		{
			signals: h.signals,
			signalsReal: h.signalsReal,
			signalsPrevented: h.signalsPrevented,
			signalsPreventedDirty: h.signalsPreventedDirty,
			missedSignals: h.missedSignals
		},
		h.signals > 0
	);
	add('innocents', { innocentsSurveilled: h.innocentsSurveilled, innocentsDetained: h.innocentsDetained }, h.innocentsSurveilled + h.innocentsDetained > 0);
	add('warrants', { warrantsFudged: h.warrantsFudged, fudgeCaught: h.fudgeCaught }, h.warrantsFudged > 0);
	add('cover_lives', { coverRomances: h.coverRomances, coverScandals: h.coverScandals }, h.coverRomances > 0);
	add(
		'vanguard',
		{
			linesStarted: h.linesStarted,
			linesCompleted: h.linesCompleted,
			linesProvoked: h.linesProvoked,
			lineCrimes: h.lineCrimes,
			lineAgentsLost: h.lineAgentsLost,
			lineExposed: h.lineExposed
		},
		h.linesStarted > 0
	);
	add('shared_with_cia', { sharedWithCia: h.sharedWithCia }, h.sharedWithCia > 0);
	add('election', { electionMeddling: h.electionMeddling, leakRevealed: h.leakRevealed }, h.electionMeddling !== 'none');
	add('dirty_actions', { dirtyActions: s.counters.dirtyActions }, s.counters.dirtyActions > 0);
	return {
		yearsLater: B.EPILOGUE_YEARS_LATER,
		lines,
		verdict: epilogueVerdict(h),
		hiddenSins: hiddenSins(h),
		revealed: revealedSecrets(h),
		election: s.election.result ? { result: s.election.result, meddling: h.electionMeddling } : null,
		history: { ...h }
	};
}
