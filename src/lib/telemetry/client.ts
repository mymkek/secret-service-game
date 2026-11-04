// Клиент телеметрии (браузер, без Svelte). Очередь + батчинг + идемпотентные повторы.
// Сервер дедуплицирует по (session, seq) / (session, log_id) / (session, month), поэтому
// повторная отправка того же батча безопасна. Отправка никогда не бросает исключений в игру.

export const FLUSH_INTERVAL_MS = 10_000;
/** Потолок очереди: при переполнении (сервер недоступен) старые события выбрасываются первыми. */
export const MAX_QUEUE = { actions: 2000, events: 5000, snapshots: 100 };
const CHUNK = { actions: 500, events: 1000, snapshots: 100 };
/** sendBeacon/keepalive ограничены 64 КБ. */
const BEACON_BYTES = 60_000;
const ENDPOINT = '/api/telemetry';

export interface SessionMeta {
	seed: string;
	schemaVersion: number;
	configHash?: string | null;
	/** Конфиг партии целиком (сервер сохранит, если <= 200 КБ). Для replay. */
	config?: unknown;
	appVersion?: string | null;
	/** День начала записи (0 - новая партия, >0 - загруженный сейв). */
	startDay?: number;
	saveId?: string | null;
}

export interface ActionRec {
	seq: number;
	day: number;
	action: { type: string; [k: string]: unknown };
	ok: boolean;
	error?: string | null;
	at: number;
}
export interface EventRec {
	id: number;
	day: number;
	kind: string;
	data: Record<string, string | number | boolean | null>;
	source?: string | null;
}
export interface SnapshotRec {
	month: number;
	day: number;
	metrics: Record<string, unknown>;
}
export interface EndInfo {
	outcome: 'won' | 'lost' | 'abandoned';
	victoryPath?: string | null;
	defeatReason?: string | null;
	finalDay?: number | null;
	finalMonth?: number | null;
	score?: number | null;
}

interface Session {
	id: string;
	meta: SessionMeta;
	startedAt: number;
	metaAcked: boolean;
	saveId: string | null;
	saveIdAcked: boolean;
	seq: number;
	actions: ActionRec[];
	events: EventRec[];
	snapshots: SnapshotRec[];
	seenSnapshotMonths: Set<number>;
	end: EndInfo | null;
	endAcked: boolean;
	serverDisabled: boolean;
}

let cur: Session | null = null;
let timer: ReturnType<typeof setInterval> | null = null;
let inflight: Promise<void> = Promise.resolve();
let listening = false;

/** Выключатель: localStorage.telemetry = 'off'. */
export function telemetryOn(): boolean {
	if (typeof window === 'undefined') return false;
	try {
		return window.localStorage.getItem('telemetry') !== 'off';
	} catch {
		return true;
	}
}

export function getSessionId(): string | null {
	return cur?.id ?? null;
}
export function isActive(): boolean {
	return cur !== null && cur.end === null;
}

function uuid(): string {
	if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
	const h = (n: number) => Array.from({ length: n }, () => Math.floor(Math.random() * 16).toString(16)).join('');
	return `${h(8)}-${h(4)}-4${h(3)}-a${h(3)}-${h(12)}`;
}

/** Начать сессию (новая партия или загруженный сейв). Предыдущая активная закрывается как abandoned. */
export function startSession(meta: SessionMeta): string | null {
	if (!telemetryOn()) return null;
	if (cur && !cur.end) endSession({ outcome: 'abandoned' });
	cur = {
		id: uuid(),
		meta,
		startedAt: Date.now(),
		metaAcked: false,
		saveId: meta.saveId ?? null,
		saveIdAcked: true,
		seq: 0,
		actions: [],
		events: [],
		snapshots: [],
		seenSnapshotMonths: new Set(),
		end: null,
		endAcked: false,
		serverDisabled: false
	};
	if (typeof window !== 'undefined') {
		if (timer) clearInterval(timer);
		timer = setInterval(() => void flush(), FLUSH_INTERVAL_MS);
		if (!listening) {
			listening = true;
			document.addEventListener('visibilitychange', onVisibility);
			window.addEventListener('pagehide', onHide);
		}
	}
	void flush();
	return cur.id;
}

function onVisibility() {
	if (document.visibilityState === 'hidden') void flush({ beacon: true });
}
function onHide() {
	void flush({ beacon: true });
}

export function logAction(day: number, action: { type: string; [k: string]: unknown }, ok: boolean, error?: string | null): void {
	const s = cur;
	if (!s || s.end) return;
	s.actions.push({ seq: s.seq++, day, action, ok, error: error ?? null, at: Date.now() });
	if (s.actions.length > MAX_QUEUE.actions) s.actions.splice(0, s.actions.length - MAX_QUEUE.actions);
}

/** Записи журнала ядра (r.events из advance). Повторная передача тех же id безопасна. */
export function logEvents(entries: readonly EventRec[]): void {
	const s = cur;
	if (!s || s.end) return;
	for (const e of entries) s.events.push({ id: e.id, day: e.day, kind: e.kind, data: e.data, source: e.source ?? null });
	if (s.events.length > MAX_QUEUE.events) s.events.splice(0, s.events.length - MAX_QUEUE.events);
}

export function logSnapshot(month: number, day: number, metrics: Record<string, unknown>): void {
	const s = cur;
	if (!s || s.end || s.seenSnapshotMonths.has(month)) return;
	s.seenSnapshotMonths.add(month);
	s.snapshots.push({ month, day, metrics });
	if (s.snapshots.length > MAX_QUEUE.snapshots) s.snapshots.shift();
}

/** Привязать сессию к сейву (после сохранения). */
export function setSaveId(saveId: string | null): void {
	const s = cur;
	if (!s || s.saveId === saveId) return;
	s.saveId = saveId;
	s.saveIdAcked = saveId === null;
}

/** Закончить сессию: победа/поражение/abandoned. Делает финальный flush. */
export function endSession(end: EndInfo): Promise<void> {
	const s = cur;
	if (!s || s.end) return Promise.resolve();
	s.end = end;
	if (timer) {
		clearInterval(timer);
		timer = null;
	}
	return flush({ beacon: end.outcome === 'abandoned' && typeof document !== 'undefined' && document.visibilityState === 'hidden' });
}

interface Chunk {
	body: Record<string, unknown>;
	nA: number;
	nE: number;
	nS: number;
	includesSession: boolean;
	includesEnd: boolean;
	includesSaveId: boolean;
}

function buildChunk(s: Session, maxBytes: number | null): Chunk {
	let nA = Math.min(s.actions.length, CHUNK.actions);
	let nE = Math.min(s.events.length, CHUNK.events);
	let nS = Math.min(s.snapshots.length, CHUNK.snapshots);
	const make = (): Chunk => {
		const body: Record<string, unknown> = { sessionId: s.id };
		const includesSession = !s.metaAcked;
		if (includesSession) body.session = { ...s.meta, startedAt: s.startedAt };
		const includesSaveId = !s.saveIdAcked && s.saveId !== null;
		if (includesSaveId) body.saveId = s.saveId;
		if (nA) body.actions = s.actions.slice(0, nA);
		if (nE) body.events = s.events.slice(0, nE);
		if (nS) body.snapshots = s.snapshots.slice(0, nS);
		// end уходит только вместе с последним куском очереди.
		const last = nA === s.actions.length && nE === s.events.length && nS === s.snapshots.length;
		const includesEnd = !!s.end && !s.endAcked && last;
		if (includesEnd) body.end = s.end;
		return { body, nA, nE, nS, includesSession, includesEnd, includesSaveId };
	};
	let c = make();
	if (maxBytes !== null) {
		// Грубо урезаем кусок под лимит beacon (события теряют приоритет первыми - они дублируют ядро).
		while (JSON.stringify(c.body).length > maxBytes && (nA > 1 || nE > 0 || nS > 1)) {
			if (nE > 0) nE = Math.floor(nE / 2);
			else if (nA > 1) nA = Math.floor(nA / 2);
			else nS = Math.floor(nS / 2);
			c = make();
		}
	}
	return c;
}

function ack(s: Session, c: Chunk): void {
	s.actions.splice(0, c.nA);
	s.events.splice(0, c.nE);
	s.snapshots.splice(0, c.nS);
	if (c.includesSession) s.metaAcked = true;
	if (c.includesSaveId) s.saveIdAcked = true;
	if (c.includesEnd) s.endAcked = true;
}

function pending(s: Session): boolean {
	return !s.metaAcked || s.actions.length > 0 || s.events.length > 0 || s.snapshots.length > 0 || (!!s.end && !s.endAcked) || !s.saveIdAcked;
}

/**
 * Отправить накопленное. beacon=true - для скрытия вкладки/закрытия (sendBeacon, один кусок до ~60 КБ,
 * считается доставленным сразу; при сбое сервер всё равно не продублирует повтор).
 * Возвращает Promise, который не отклоняется.
 */
export function flush(opts: { beacon?: boolean } = {}): Promise<void> {
	inflight = inflight.then(() => doFlush(opts)).catch(() => {});
	return inflight;
}

async function doFlush(opts: { beacon?: boolean }): Promise<void> {
	const s = cur;
	if (!s || s.serverDisabled || typeof fetch === 'undefined') return;
	let guard = 0;
	while (pending(s) && guard++ < 20) {
		const c = buildChunk(s, opts.beacon ? BEACON_BYTES : null);
		const payload = JSON.stringify(c.body);
		try {
			if (opts.beacon && typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
				const queued = navigator.sendBeacon(ENDPOINT, new Blob([payload], { type: 'application/json' }));
				if (!queued) return;
				ack(s, c);
				return;
			}
			const res = await fetch(ENDPOINT, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: payload,
				keepalive: !!opts.beacon && payload.length < BEACON_BYTES
			});
			if (res.ok) {
				const j = (await res.json().catch(() => null)) as { disabled?: boolean } | null;
				if (j?.disabled) {
					s.serverDisabled = true;
					s.actions = [];
					s.events = [];
					s.snapshots = [];
					return;
				}
				ack(s, c);
			} else if (res.status >= 400 && res.status < 500 && res.status !== 408 && res.status !== 429) {
				// Кусок отвергнут навсегда (валидация/лимит) - выбрасываем, чтобы не зациклиться.
				// Исключение: 404 до подтверждения метаданных - это порядок доставки, повторим.
				if (res.status === 404 && s.metaAcked) {
					s.metaAcked = false;
					return;
				}
				ack(s, c);
			} else return;
		} catch {
			return; // сеть недоступна - повторим на следующем тике, очередь ограничена MAX_QUEUE
		}
	}
}

/** Только для тестов. */
export function _reset(): void {
	if (timer) clearInterval(timer);
	timer = null;
	cur = null;
	inflight = Promise.resolve();
}
