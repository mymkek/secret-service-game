// Реактивная обёртка над ядром (ядро мутирует state на месте, поэтому $state.raw + счётчик версии).
// Здесь же игровой цикл requestAnimationFrame -> realtimeToDays -> advance, очередь окон и работа с /api/saves.
import {
	SCHEMA_VERSION,
	advance,
	applyAction,
	contentToConfig,
	createGame,
	deserialize,
	realtimeToDays,
	resolveAgentName,
	serialize,
	setPaused,
	setSpeed,
	type Agent,
	type GameState,
	type LogEntry,
	type PlayerAction,
	type Speed
} from '../game/index';
import { content, eventLine, opResultText } from './content';
import { opResultView, type ResultChip } from './op-results';
import { errorText } from './labels';
import { tmAction, tmAdvance, tmLeave, tmPause, tmSaveId, tmStart } from '../telemetry/game-hook';

export interface SaveMeta {
	id: string;
	name: string;
	seed: string;
	schemaVersion: number;
	createdAt: number;
	updatedAt: number;
}

export interface Toast {
	id: number;
	text: string;
	kind: 'error' | 'info' | 'success' | 'warn';
	/** Куда ведёт клик по уведомлению. */
	href?: string;
	/** Богатое уведомление (итог операции): заголовок, строка-развязка и чипы изменений. */
	rich?: { title: string; detail: string; chips: ResultChip[]; lost: string[] };
}

/** Какие записи журнала открывают окно, и какой ключ автопаузы должен быть в pauseReasons. */
const POPUP_KINDS: Record<string, string> = { chance_card: 'chanceCard', quarter_report: 'quarterReport', election: 'election' };

/** Записи журнала, о которых игрок узнаёт всплывающим уведомлением, а не только из ленты. */
const NOTIFY_KINDS: Record<string, Toast['kind']> = { op_success: 'success', op_fail: 'error' };
const NOTIFY_MS = 8000;
/** Итог операции висит дольше и не закрывается, пока на нём курсор. */
const OP_NOTIFY_MS = 12000;

class GameStore {
	private _state = $state.raw<GameState | null>(null);
	private _version = $state(0);
	/** Очередь окон (карточки шанса, квартальный отчёт, выборы). */
	popups = $state<LogEntry[]>([]);
	toasts = $state<Toast[]>([]);
	/** Завершённые операции за партию. Журнал ядра обрезается (LOG_MAX_ENTRIES), поэтому копим здесь. */
	completedOps = $state.raw<LogEntry[]>([]);
	/** Сессии квестов, окно которых игрок закрыл, не выбрав вариант. */
	dismissedQuests = $state<number[]>([]);
	/** Итог принятого решения квеста (текст исхода из Ink). */
	questResult = $state<{ title: string; text: string[] } | null>(null);
	/** Открыт эпилог «Через 25 лет. Доклад комиссии» (после экрана итогов). */
	epilogueOpen = $state(false);
	saveId = $state<string | null>(null);
	saveName = $state('');
	busy = $state(false);

	private _raf = 0;
	private _last = 0;
	private _carry = 0;
	private _toastId = 0;
	private _timers = new Map<number, ReturnType<typeof setTimeout>>();
	/** Дела, которые игрок уже видел на вкладке «Операции» (для значка новых дел). */
	private _seenCases = new Set<number>();

	/** Состояние; чтение подписывает $derived/$effect на счётчик версии. */
	get s(): GameState | null {
		void this._version;
		return this._state;
	}

	bump(): void {
		this._version++;
	}

	// ----------------------------------------------------------------- партия

	newGame(seed?: string): void {
		const sd = seed?.trim() || `game-${Math.random().toString(36).slice(2, 10)}`;
		tmLeave(this._state);
		this._state = createGame({ seed: sd, config: contentToConfig(content) });
		tmStart(this._state);
		this.reset();
	}

	private reset(): void {
		this.popups = [];
		this.questResult = null;
		this.epilogueOpen = false;
		this.dismissedQuests = [];
		// Дела, что уже лежат в начатой или загруженной партии, новыми не считаем.
		this._seenCases = new Set(this._state?.cases.map((c) => c.id) ?? []);
		this.completedOps = (this._state?.log ?? []).filter((e) => e.kind === 'op_success' || e.kind === 'op_fail');
		this._carry = 0;
		this.bump();
	}

	leave(): void {
		tmLeave(this._state);
		this._state = null;
		this.saveId = null;
		this.saveName = '';
		this.reset();
	}

	// ----------------------------------------------------------------- время

	start(): void {
		if (this._raf || typeof requestAnimationFrame === 'undefined') return;
		this._last = performance.now();
		const tick = (t: number) => {
			this._raf = requestAnimationFrame(tick);
			const dt = Math.min(Math.max(0, t - this._last), 500);
			this._last = t;
			const s = this._state;
			if (!s || s.paused || s.outcome.status !== 'active') {
				this._carry = 0;
				return;
			}
			const r = realtimeToDays(s.speed, dt, this._carry);
			this._carry = r.carryMs;
			if (r.days > 0) this.run(r.days);
		};
		this._raf = requestAnimationFrame(tick);
	}

	stop(): void {
		if (this._raf) cancelAnimationFrame(this._raf);
		this._raf = 0;
	}

	private run(days: number): void {
		const s = this._state;
		if (!s) return;
		const r = advance(s, days);
		tmAdvance(s, r.events);
		if (r.stoppedBy === 'autopause' || r.stoppedBy === 'gameOver') this._carry = 0;
		const newCases: LogEntry[] = [];
		for (const e of r.events) {
			const key = POPUP_KINDS[e.kind];
			if (key && s.pauseReasons.includes(key)) this.popups.push(e);
			const note = NOTIFY_KINDS[e.kind];
			if (note) {
				this.completedOps = [...this.completedOps, e];
				this.opToast(e, note);
			}
			if (e.kind === 'case_new') newCases.push(e);
		}
		// Несколько дел за один кадр (быстрая скорость) сводим в одно уведомление.
		if (newCases.length === 1) this.toast(this.line(newCases[0]).text, 'info', NOTIFY_MS, '/ops');
		else if (newCases.length > 1) this.toast(`Новых дел: ${newCases.length}.`, 'info', NOTIFY_MS, '/ops');
		this.bump();
	}

	togglePause(): void {
		const s = this._state;
		if (!s || s.outcome.status !== 'active') return;
		setPaused(s, !s.paused);
		if (s.paused) tmPause();
		this._carry = 0;
		this.bump();
	}

	pause(): void {
		const s = this._state;
		if (s && !s.paused) {
			setPaused(s, true);
			tmPause();
			this.bump();
		}
	}

	setSpeed(v: Speed): void {
		const s = this._state;
		if (!s) return;
		setSpeed(s, v);
		this.bump();
	}

	// ----------------------------------------------------------------- действия

	/** Выполнить действие игрока. Возвращает код ошибки или null. Ошибка показывается тостом. */
	act(action: PlayerAction, successText?: string): string | null {
		const s = this._state;
		if (!s) return 'game_over';
		const res = applyAction(s, 'player', action);
		// Протокол пишет и неудачные действия: replay сверяет результат каждого.
		tmAction(s, action, res.ok ? null : res.error);
		if (s.outcome.status !== 'active') tmAdvance(s, []);
		this.bump();
		if (!res.ok) {
			this.toast(errorText(res.error), 'error');
			return res.error;
		}
		if (successText) this.toast(successText, 'success');
		return null;
	}

	/** Уведомление об итоге операции: заголовок дела, исход, развязка, чипы. Ведёт к разделу «Завершённые дела». */
	private opToast(e: LogEntry, kind: Toast['kind']): void {
		const v = opResultView(e);
		const head = `${v.ok ? 'Успех' : 'Провал'}: ${v.title}${v.where ? ` (${v.where})` : ''}`;
		this.toast(opResultText(e), kind, OP_NOTIFY_MS, '/ops#completed', { title: head, detail: v.outcome, chips: v.chips, lost: v.lost });
	}

	/** Пока курсор на уведомлении, таймер закрытия стоит. */
	holdToast(id: number, hold: boolean, ms = 4000): void {
		const t = this._timers.get(id);
		if (t) clearTimeout(t);
		this._timers.delete(id);
		if (!hold) this._timers.set(id, setTimeout(() => this.closeToast(id), ms));
	}

	toast(text: string, kind: Toast['kind'] = 'info', ms = 4000, href?: string, rich?: Toast['rich']): void {
		const id = ++this._toastId;
		this.toasts.push({ id, text, kind, href, rich });
		// Не больше пяти уведомлений на экране: старые уходят первыми.
		if (this.toasts.length > 5) this.toasts = this.toasts.slice(-5);
		this._timers.set(id, setTimeout(() => this.closeToast(id), ms));
	}

	closeToast(id: number): void {
		const t = this._timers.get(id);
		if (t) clearTimeout(t);
		this._timers.delete(id);
		this.toasts = this.toasts.filter((t) => t.id !== id);
	}

	closePopup(): void {
		this.popups.shift();
	}

	dismissQuest(id: number): void {
		if (!this.dismissedQuests.includes(id)) this.dismissedQuests.push(id);
	}

	/** Сколько открытых дел игрок ещё не видел на вкладке «Операции». */
	get newCases(): number {
		return this.s?.cases.filter((c) => !this._seenCases.has(c.id)).length ?? 0;
	}

	/** Отметить все текущие дела просмотренными (вызывается, пока открыта вкладка «Операции»). */
	markCasesSeen(): void {
		const fresh = this.s?.cases.filter((c) => !this._seenCases.has(c.id)) ?? [];
		if (fresh.length === 0) return;
		for (const c of fresh) this._seenCases.add(c.id);
		this.bump();
	}

	// ----------------------------------------------------------------- имена и тексты

	agentName(a: Pick<Agent, 'id' | 'nameSeed'>): string {
		return resolveAgentName(a, content.agentNames);
	}

	agentNameById(id: number): string {
		const s = this.s;
		const a = s?.agents.find((x) => x.id === id) ?? s?.hirePool.find((x) => x.id === id) ?? s?.defectors.find((d) => d.agent.id === id)?.agent;
		return a ? this.agentName(a) : `Агент №${id}`;
	}

	line = (e: LogEntry) => eventLine(e, (id) => this.agentNameById(id));

	// ----------------------------------------------------------------- сохранения (/api/saves)

	async listSaves(): Promise<SaveMeta[]> {
		const r = await fetch('/api/saves');
		if (!r.ok) throw new Error(`Не удалось получить список сохранений (${r.status})`);
		return (await r.json()) as SaveMeta[];
	}

	/** Сохранить партию: новая запись или обновление текущей. */
	async save(name?: string): Promise<boolean> {
		const s = this._state;
		if (!s) return false;
		this.busy = true;
		try {
			const nm = (name ?? this.saveName).trim() || `Партия ${s.seed}, день ${s.day}`;
			const body = { name: nm, seed: s.seed, schemaVersion: SCHEMA_VERSION, state: serialize(s) };
			const res = await fetch(this.saveId ? `/api/saves/${this.saveId}` : '/api/saves', {
				method: this.saveId ? 'PUT' : 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify(body)
			});
			if (!res.ok) throw new Error(`HTTP ${res.status}`);
			const row = (await res.json()) as SaveMeta;
			this.saveId = row.id;
			this.saveName = row.name;
			tmSaveId(row.id);
			this.toast(`Сохранено: ${row.name}`, 'success');
			return true;
		} catch (e) {
			this.toast(`Не удалось сохранить: ${e instanceof Error ? e.message : String(e)}`, 'error');
			return false;
		} finally {
			this.busy = false;
		}
	}

	async load(id: string): Promise<boolean> {
		this.busy = true;
		try {
			const res = await fetch(`/api/saves/${id}`);
			if (!res.ok) throw new Error(`HTTP ${res.status}`);
			const row = (await res.json()) as SaveMeta & { state: string };
			tmLeave(this._state);
			this._state = deserialize(row.state);
			// Загруженная партия всегда начинается на паузе.
			setPaused(this._state, true);
			tmStart(this._state, { saveId: row.id });
			this.saveId = row.id;
			this.saveName = row.name;
			this.reset();
			return true;
		} catch (e) {
			this.toast(`Не удалось загрузить: ${e instanceof Error ? e.message : String(e)}`, 'error');
			return false;
		} finally {
			this.busy = false;
		}
	}

	async removeSave(id: string): Promise<void> {
		const res = await fetch(`/api/saves/${id}`, { method: 'DELETE' });
		if (!res.ok) this.toast(`Не удалось удалить (${res.status})`, 'error');
		if (this.saveId === id) this.saveId = null;
	}
}

export const game = new GameStore();

/** Формат k$ с разделителем разрядов. */
export function fmtMoney(v: number): string {
	return `${Math.round(v).toLocaleString('ru-RU')} k$`;
}
