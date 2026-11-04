// Тонкая обвязка между GameStore и client.ts: все вызовы безопасны (ошибки телеметрии глотаются).
// GameStore вызывает только эти функции; подробности (месяцы, исход, метрики) - здесь.
import { BALANCE, SCHEMA_VERSION, type GameState, type LogEntry, type PlayerAction } from '../game/index';
import { endSession, flush, isActive, logAction, logEvents, logSnapshot, setSaveId, startSession } from './client';
import { collectMetrics } from './metrics';

declare const __APP_VERSION__: string | undefined;

/** Простой стабильный хеш (FNV-1a) строки - для config_hash. */
export function hashString(str: string): string {
	let h = 0x811c9dc5;
	for (let i = 0; i < str.length; i++) {
		h ^= str.charCodeAt(i);
		h = Math.imul(h, 0x01000193) >>> 0;
	}
	return h.toString(16).padStart(8, '0');
}

function safe<T>(fn: () => T): T | undefined {
	try {
		return fn();
	} catch {
		return undefined;
	}
}

let lastMonth = 0;

/** После createGame() / deserialize(). Для новой партии day = 0; для загруженной - day > 0. */
export function tmStart(s: GameState, opts: { saveId?: string | null } = {}): void {
	safe(() => {
		const cfg = s.config;
		const cfgJson = JSON.stringify(cfg);
		startSession({
			seed: s.seed,
			schemaVersion: SCHEMA_VERSION,
			configHash: hashString(cfgJson),
			config: cfg,
			appVersion: typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : null,
			startDay: s.day,
			saveId: opts.saveId ?? null
		});
		lastMonth = Math.floor(s.day / BALANCE.DAYS_PER_MONTH);
	});
}

/** В GameStore.act(): после applyAction. day берётся ДО/ПОСЛЕ - не важно, действие не двигает время. */
export function tmAction(s: GameState, action: PlayerAction, error: string | null): void {
	safe(() => logAction(s.day, action, error === null, error));
}

/** В GameStore.run(): после advance(); events = r.events. */
export function tmAdvance(s: GameState, events: readonly LogEntry[]): void {
	safe(() => {
		if (events.length) logEvents(events);
		const m = Math.floor(s.day / BALANCE.DAYS_PER_MONTH);
		if (m > lastMonth && s.day % BALANCE.DAYS_PER_MONTH === 0) {
			lastMonth = m;
			logSnapshot(m, s.day, collectMetrics(s));
		} else if (m > lastMonth) {
			lastMonth = m; // шаг пересёк границу месяца (редкий случай) - снимок текущего состояния
			logSnapshot(m, s.day, collectMetrics(s));
		}
		if (s.outcome.status !== 'active') tmEnd(s);
	});
}

/** Конец партии по исходу ядра (вызывается из tmAdvance; можно и напрямую после applyAction). */
export function tmEnd(s: GameState): void {
	safe(() => {
		if (!isActive()) return;
		const o = s.outcome;
		if (o.status === 'active') return;
		logSnapshot(Math.floor(s.day / BALANCE.DAYS_PER_MONTH), s.day, collectMetrics(s));
		void endSession({
			outcome: o.status,
			victoryPath: o.victoryPath,
			defeatReason: o.defeatReason,
			finalDay: o.day ?? s.day,
			finalMonth: o.month ?? Math.ceil(s.day / BALANCE.DAYS_PER_MONTH),
			score: o.score
		});
	});
}

/** В GameStore.leave() и перед заменой партии (newGame/load): закрыть текущую сессию как abandoned (или по исходу). */
export function tmLeave(s: GameState | null): void {
	safe(() => {
		if (!isActive()) return;
		if (s && s.outcome.status !== 'active') tmEnd(s);
		else void endSession({ outcome: 'abandoned', finalDay: s?.day ?? null, finalMonth: s ? Math.ceil(s.day / BALANCE.DAYS_PER_MONTH) : null });
	});
}

/** После успешного save()/load(): связать сессию с сейвом. */
export function tmSaveId(id: string | null): void {
	safe(() => setSaveId(id));
}

/** При паузе игры. */
export function tmPause(): void {
	safe(() => void flush());
}
