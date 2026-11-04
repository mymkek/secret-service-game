<script lang="ts">
	import { selectOutcome, selectQuests, selectVictoryProgress } from '../game/index';
	import { game } from './game.svelte';
	import Modal from './Modal.svelte';
	import QuestDialog from './QuestDialog.svelte';
	import { cardText } from './content';
	import { defeatTexts, victoryTexts } from '../content/index';
	import { PATH_LABEL, rivalName } from './labels';

	let { onmenu }: { onmenu: () => void } = $props();

	const outcome = $derived(game.s ? selectOutcome(game.s) : null);
	const quests = $derived(game.s ? selectQuests(game.s) : []);
	const openQuest = $derived(quests.find((q) => q.waitUntilDay === null && q.choices.length > 0 && !game.dismissedQuests.includes(q.id)) ?? null);
	const popup = $derived(game.popups[0] ?? null);
	const progress = $derived(game.s ? selectVictoryProgress(game.s) : null);

	function continueGame() {
		game.closePopup();
		// За окном может ждать квест (например, слушания по карточке) — тогда пауза остаётся.
		if (game.s?.paused && game.popups.length === 0 && !openQuest) game.togglePause();
	}

	const num = (v: unknown, d = 2) => (typeof v === 'number' ? (Math.round(v * 10 ** d) / 10 ** d).toString() : '—');
	const tones = { positive: 'good', negative: 'bad', neutral: 'default' } as const;
	const PROGRESS_ORDER = ['monopoly', 'cardinal', 'shadow', '1984', 'clean'] as const;
</script>

{#if outcome && outcome.status !== 'active'}
	<Modal title={outcome.status === 'won' ? 'Победа' : 'Поражение'} tone={outcome.status === 'won' ? 'good' : 'bad'} wide>
		{@const end = outcome.status === 'won' ? (outcome.victoryPath ? victoryTexts[outcome.victoryPath] : null) : outcome.defeatReason ? defeatTexts[outcome.defeatReason] : null}
		<p class="text-lg font-semibold">{end?.title ?? ''}</p>
		<p>{end?.text ?? ''}</p>
		{#if end}<p class="text-muted italic">{end.epigraph}</p>{/if}
		<dl class="grid grid-cols-3 gap-3">
			<div class="card"><dt class="text-xs text-muted">Месяц партии</dt><dd class="text-xl font-semibold">{outcome.month ?? '—'}</dd></div>
			<div class="card"><dt class="text-xs text-muted">День</dt><dd class="text-xl font-semibold">{outcome.day ?? '—'}</dd></div>
			<div class="card"><dt class="text-xs text-muted">Очки</dt><dd class="text-xl font-semibold text-gold" data-testid="score">{outcome.score ?? '—'}</dd></div>
		</dl>
		{#if progress}
			<div>
				<div class="h2">Пути победы на момент конца</div>
				<ul class="space-y-1">
					{#each PROGRESS_ORDER as p (p)}
						<li class="flex justify-between"><span>{PATH_LABEL[p]}</span><span class={progress[p].met ? 'text-ok' : 'text-muted'}>{progress[p].met ? 'условие выполнено' : 'нет'}</span></li>
					{/each}
				</ul>
			</div>
		{/if}
		{#snippet footer()}
			<button class="btn" onclick={onmenu}>Меню (сохранить/загрузить)</button>
			<button class="btn btn-gold" onclick={() => game.newGame()}>Новая партия</button>
		{/snippet}
	</Modal>
{:else if game.questResult}
	<Modal title={game.questResult.title} tone="warn" onclose={() => (game.questResult = null)}>
		{#each game.questResult.text as p, i (i)}<p>{p}</p>{/each}
		{#snippet footer()}
			<button class="btn btn-gold" onclick={() => (game.questResult = null)}>Понятно</button>
		{/snippet}
	</Modal>
{:else if popup && popup.kind === 'chance_card'}
	{@const card = cardText(String(popup.data.cardId ?? ''))}
	<Modal title="Карточка шанса: {card.title}" tone={tones[card.tone]} onclose={() => game.closePopup()}>
		<p>{card.body}</p>
		{#if popup.data.target}
			<p class="text-muted">Затронуто: {popup.data.target === 'player' ? 'ваше ведомство' : rivalName(String(popup.data.target))}</p>
		{/if}
		{#snippet footer()}
			<button class="btn" onclick={() => game.closePopup()}>Закрыть</button>
			<button class="btn btn-gold" onclick={continueGame}>Продолжить игру</button>
		{/snippet}
	</Modal>
{:else if popup && popup.kind === 'quarter_report'}
	{@const d = popup.data}
	<Modal title="Квартальный отчёт: Q{d.quarter}" tone={Number(d.ratio) >= 1 ? 'good' : 'warn'} onclose={() => game.closePopup()}>
		<dl class="grid grid-cols-2 gap-x-6 gap-y-1">
			<dt class="text-muted">Очки плана</dt><dd class="text-right tabular-nums">{num(d.points, 1)} из {num(d.target, 1)}</dd>
			<dt class="text-muted">Фальшивые очки</dt><dd class="text-right tabular-nums">{num(d.fakePoints, 1)}</dd>
			<dt class="text-muted">Выполнение плана</dt><dd class="text-right tabular-nums">{num(d.ratio)}</dd>
			<dt class="text-muted">Реальное выполнение</dt><dd class="text-right tabular-nums">{num(d.realRatio)}</dd>
			<dt class="text-muted">Доля бюджета</dt><dd class="text-right tabular-nums">{typeof d.share === 'number' ? Math.round(d.share * 100) : '—'}%</dd>
			<dt class="text-muted">Изъято из остатка</dt><dd class="text-right tabular-nums">{num(d.clawback, 0)} k$</dd>
		</dl>
		{#if d.caught}<p class="text-danger">Фальсификацию раскрыли!</p>{/if}
		{#snippet footer()}
			<button class="btn" onclick={() => game.closePopup()}>Закрыть</button>
			<button class="btn btn-gold" onclick={continueGame}>Продолжить игру</button>
		{/snippet}
	</Modal>
{:else if popup && popup.kind === 'election'}
	<Modal title="Президентские выборы" tone={popup.data.newAdmin ? 'warn' : 'good'} onclose={() => game.closePopup()}>
		<p>
			{#if popup.data.newAdmin}К власти пришла новая администрация. Приоритеты финансирования пересмотрены, ваше влияние ослаблено.
			{:else}Действующий президент переизбран. Курс не изменился.{/if}
		</p>
		{#snippet footer()}
			<button class="btn btn-gold" onclick={continueGame}>Продолжить игру</button>
		{/snippet}
	</Modal>
{:else if openQuest}
	{#key openQuest.id}<QuestDialog quest={openQuest} />{/key}
{/if}
