<script lang="ts">
	import { selectDate } from '../game/index';
	import type { Speed } from '../game/index';
	import { game } from './game.svelte';
	import { Button, Icon } from './kit';

	const d = $derived(game.s ? selectDate(game.s) : null);
	const over = $derived(game.s ? game.s.outcome.status !== 'active' : true);

	const REASONS: Record<string, string> = {
		chanceCard: 'карточка шанса',
		quarterReport: 'квартальный отчёт',
		hearings: 'слушания',
		questChoice: 'нужно решение',
		election: 'выборы',
		outcome: 'конец партии',
		agentDefected: 'агент перебежал',
		networkFailed: 'сеть провалена',
		moleFound: 'найден крот',
		unrestThreshold: 'недовольство растёт',
		investigationThreshold: 'следствие усиливается',
		firstNegativeBudget: 'бюджет ушёл в минус',
		raiseRequest: 'просьба о прибавке',
		caseExpiring: 'дело скоро уйдёт',
		operationDone: 'операция завершена'
	};
	const SPEEDS: Speed[] = [1, 2, 3];
</script>

{#if d}
	<div class="flex items-center gap-3" role="group" aria-label="Время">
		<Button
			variant="primary"
			class="w-36"
			icon={d.paused ? 'play' : 'pause'}
			onclick={() => game.togglePause()}
			disabled={over}
			aria-label={d.paused ? 'Снять паузу' : 'Поставить на паузу'}
			aria-pressed={d.paused}
			data-testid="pause-toggle"
		>
			{d.paused ? 'Пуск' : 'Пауза'}
		</Button>
		<div class="flex gap-1 rounded-2xl bg-surface-1 p-1 shadow-[inset_0_2px_4px_rgb(0_0_0/0.4)]" role="group" aria-label="Скорость игры">
			{#each SPEEDS as v (v)}
				<button
					class="btn !min-h-9 !rounded-xl !px-3 {d.speed === v ? 'btn-gold' : 'btn-ghost'}"
					aria-pressed={d.speed === v}
					aria-label="Скорость ×{v}"
					onclick={() => game.setSpeed(v)}>×{v}</button
				>
			{/each}
		</div>
		<div class="leading-tight">
			<div class="flex items-center gap-2 text-sm font-bold tabular-nums" data-testid="date" data-day={d.day}>
				<Icon name="calendar" size={18} class="text-gold" />Год {d.year} · месяц {d.month} · день {d.dayOfMonth} <span class="text-muted">(Q{d.quarter})</span>
			</div>
			<div class="text-xs text-muted">
				{#if d.paused && d.pauseReasons.length}
					<span class="text-warn">Пауза: {d.pauseReasons.map((r) => REASONS[r] ?? r).join(', ')}</span>
				{:else if d.paused}
					Пауза
				{:else}
					До конца срока: {d.daysLeft} дн.
				{/if}
			</div>
		</div>
	</div>
{/if}
