<script lang="ts">
	import { selectDate } from '../game/index';
	import type { Speed } from '../game/index';
	import { game } from './game.svelte';

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
		<button
			class="btn btn-gold w-28"
			onclick={() => game.togglePause()}
			disabled={over}
			aria-label={d.paused ? 'Снять паузу' : 'Поставить на паузу'}
			aria-pressed={d.paused}
			data-testid="pause-toggle"
		>
			{d.paused ? '▶ Пуск' : '❚❚ Пауза'}
		</button>
		<div class="flex gap-1" role="group" aria-label="Скорость игры">
			{#each SPEEDS as v (v)}
				<button class="btn px-2.5 {d.speed === v ? 'btn-gold' : ''}" aria-pressed={d.speed === v} aria-label="Скорость ×{v}" onclick={() => game.setSpeed(v)}>×{v}</button>
			{/each}
		</div>
		<div class="leading-tight">
			<div class="text-sm font-semibold tabular-nums" data-testid="date" data-day={d.day}>
				Год {d.year} · месяц {d.month} · день {d.dayOfMonth} <span class="text-muted">(Q{d.quarter})</span>
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
