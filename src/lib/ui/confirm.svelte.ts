import type { ConfirmInfo } from './kit/ConfirmDialog.svelte';
import { game } from './game.svelte';

/**
 * Окно подтверждения дорогих/необратимых действий. Пока оно открыто, игра на паузе;
 * после закрытия прежнее состояние паузы восстанавливается.
 */
class ConfirmStore {
	current = $state.raw<{ info: ConfirmInfo; run: () => void } | null>(null);
	private wasPaused = true;

	ask(info: ConfirmInfo, run: () => void): void {
		if (this.current) return;
		this.wasPaused = !!game.s?.paused;
		game.pause();
		this.current = { info, run };
	}

	accept(): void {
		const c = this.current;
		this.current = null;
		c?.run();
		this.restore();
	}

	cancel(): void {
		this.current = null;
		this.restore();
	}

	private restore(): void {
		// Если действие открыло окно (квест, всплывающее событие) - пауза остаётся.
		if (!this.wasPaused && game.s?.paused && game.popups.length === 0) game.togglePause();
	}
}

export const confirmAction = new ConfirmStore();
