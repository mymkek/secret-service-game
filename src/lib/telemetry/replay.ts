// Replay партии из протокола телеметрии: seed + config + действия по дням -> итоговое состояние.
// Чистая функция поверх публичного API ядра; не зависит от БД и браузера.
import { advance, applyAction, createGame, type GameConfig, type GameState, type PlayerAction } from '../game/index';

export interface ReplaySession {
	seed: string;
	startDay: number;
	config: Partial<GameConfig> | null;
	/** Ожидаемый итог (из game_sessions); null - партия не закончена или брошена. */
	outcome: string | null;
	finalDay: number | null;
	victoryPath?: string | null;
	defeatReason?: string | null;
}
export interface ReplayAction {
	seq: number;
	day: number;
	action: PlayerAction;
	ok: boolean;
	error?: string | null;
}

export interface ReplayResult {
	/** null - replay выполнен; иначе почему невозможен. */
	skipped: string | null;
	state: GameState | null;
	/** Расхождения в результате отдельных действий (seq, записано, получено). */
	actionMismatches: { seq: number; day: number; recorded: string; replayed: string }[];
	/** Итог replay против записанного. */
	outcomeMatches: boolean | null;
	replayedOutcome: string | null;
	replayedDay: number | null;
}

export function replaySession(session: ReplaySession, actions: ReplayAction[], opts: { config?: Partial<GameConfig> } = {}): ReplayResult {
	const res: ReplayResult = { skipped: null, state: null, actionMismatches: [], outcomeMatches: null, replayedOutcome: null, replayedDay: null };
	if (session.startDay > 0) return { ...res, skipped: 'session started from a loaded save (startDay > 0): seed alone cannot reproduce it' };
	const config = session.config ?? opts.config;
	if (!config) return { ...res, skipped: 'config not stored: pass opts.config (e.g. contentToConfig(content))' };
	const s = createGame({ seed: session.seed, config });
	for (const a of [...actions].sort((x, y) => x.seq - y.seq)) {
		if (a.day < s.day) {
			res.actionMismatches.push({ seq: a.seq, day: a.day, recorded: 'day', replayed: `already at day ${s.day}` });
			continue;
		}
		if (a.day > s.day) advance(s, a.day - s.day, { ignorePause: true });
		const r = applyAction(s, 'player', a.action);
		const got = r.ok ? 'ok' : r.error;
		const rec = a.ok ? 'ok' : (a.error ?? 'error');
		if (got !== rec) res.actionMismatches.push({ seq: a.seq, day: a.day, recorded: rec, replayed: got });
		if (s.outcome.status !== 'active') break;
	}
	// Дойти до записанного конца: игра могла закончиться без действий игрока (банкротство, срок и т.п.).
	if (session.finalDay !== null && s.day < session.finalDay && s.outcome.status === 'active') advance(s, session.finalDay - s.day, { ignorePause: true });
	res.state = s;
	res.replayedOutcome = s.outcome.status === 'active' ? null : s.outcome.status;
	res.replayedDay = s.outcome.day ?? s.day;
	if (session.outcome === 'won' || session.outcome === 'lost') {
		res.outcomeMatches = res.replayedOutcome === session.outcome && res.replayedDay === session.finalDay;
	}
	return res;
}
