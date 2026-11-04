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
import { content, eventLine } from './content';
import { errorText } from './labels';

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
	kind: 'error' | 'info' | 'success';
}

/** Какие записи журнала открывают окно, и какой ключ автопаузы должен быть в pauseReasons. */
const POPUP_KINDS: Record<string, string> = { chance_card: 'chanceCard', quarter_report: 'quarterReport', election: 'election' };

class GameStore {
	private _state = $state.raw<GameState | null>(null);
	private _version = $state(0);
	/** Очередь окон (карточки шанса, квартальный отчёт, выборы). */
	popups = $state<LogEntry[]>([]);
	toasts = $state<Toast[]>([]);
	/** Сессии квестов, окно которых игрок закрыл, не выбрав вариант. */
	dismissedQuests = $state<number[]>([]);
	/** Итог принятого решения квеста (текст исхода из Ink). */
	questResult = $state<{ title: string; text: string[] } | null>(null);
	saveId = $state<string | null>(null);
	saveName = $state('');
	busy = $state(false);

	private _raf = 0;
	private _last = 0;
	private _carry = 0;
	private _toastId = 0;

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
		this._state = createGame({ seed: sd, config: contentToConfig(content) });
		this.reset();
	}

	private reset(): void {
		this.popups = [];
		this.questResult = null;
		this.dismissedQuests = [];
		this._carry = 0;
		this.bump();
	}

	leave(): void {
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
		if (r.stoppedBy === 'autopause' || r.stoppedBy === 'gameOver') this._carry = 0;
		for (const e of r.events) {
			const key = POPUP_KINDS[e.kind];
			if (key && s.pauseReasons.includes(key)) this.popups.push(e);
		}
		this.bump();
	}

	togglePause(): void {
		const s = this._state;
		if (!s || s.outcome.status !== 'active') return;
		setPaused(s, !s.paused);
		this._carry = 0;
		this.bump();
	}

	pause(): void {
		const s = this._state;
		if (s && !s.paused) {
			setPaused(s, true);
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
		this.bump();
		if (!res.ok) {
			this.toast(errorText(res.error), 'error');
			return res.error;
		}
		if (successText) this.toast(successText, 'success');
		return null;
	}

	toast(text: string, kind: Toast['kind'] = 'info', ms = 4000): void {
		const id = ++this._toastId;
		this.toasts.push({ id, text, kind });
		setTimeout(() => {
			this.toasts = this.toasts.filter((t) => t.id !== id);
		}, ms);
	}

	closePopup(): void {
		this.popups.shift();
	}

	dismissQuest(id: number): void {
		if (!this.dismissedQuests.includes(id)) this.dismissedQuests.push(id);
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
			this._state = deserialize(row.state);
			// Загруженная партия всегда начинается на паузе.
			setPaused(this._state, true);
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
