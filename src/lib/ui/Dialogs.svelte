<script lang="ts">
	import { selectBlockingQuest, selectOutcome, selectQuests, selectVictoryProgress } from '../game/index';
	import { game } from './game.svelte';
	import { Modal, Illustration, Button } from './kit';
	import QuestDialog from './QuestDialog.svelte';
	import Epilogue from './Epilogue.svelte';
	import { cardText } from './content';
	import { defeatTexts, victoryTexts } from '../content/index';
	import { PATH_LABEL, rivalName } from './labels';

	let { onmenu }: { onmenu: () => void } = $props();

	const outcome = $derived(game.s ? selectOutcome(game.s) : null);
	const quests = $derived(game.s ? selectQuests(game.s) : []);
	// Модальное окно дилеммы или линейки не откладывается: пока оно открыто, время стоит (§3.4).
	const blockingQuest = $derived(game.s ? selectBlockingQuest(game.s) : null);
	const openQuest = $derived(blockingQuest ?? quests.find((q) => q.waitUntilDay === null && q.choices.length > 0 && !game.dismissedQuests.includes(q.id)) ?? null);
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

{#if outcome && outcome.status !== 'active' && game.epilogueOpen}
	<Epilogue onmenu={onmenu} onclose={() => (game.epilogueOpen = false)} />
{:else if outcome && outcome.status !== 'active'}
	<Modal title={outcome.status === 'won' ? 'Победа' : 'Поражение'} tone={outcome.status === 'won' ? 'good' : 'bad'} wide>
		{#snippet art()}<Illustration name={outcome.status === 'won' ? 'victory' : 'defeat'} size={176} />{/snippet}
		{@const end = outcome.status === 'won' ? (outcome.victoryPath ? victoryTexts[outcome.victoryPath] : null) : outcome.defeatReason ? defeatTexts[outcome.defeatReason] : null}
		<p class="font-protocol text-2xl font-bold">{end?.title ?? ''}</p>
		<p class="font-protocol text-lg leading-relaxed">{end?.text ?? ''}</p>
		{#if end}<p class="font-protocol text-lg text-muted italic">{end.epigraph}</p>{/if}
		<dl class="grid grid-cols-3 gap-3">
			<div class="card-1"><dt class="text-xs text-muted">Месяц партии</dt><dd class="text-2xl font-bold">{outcome.month ?? '—'}</dd></div>
			<div class="card-1"><dt class="text-xs text-muted">День</dt><dd class="text-2xl font-bold">{outcome.day ?? '—'}</dd></div>
			<div class="card-1"><dt class="text-xs text-muted">Очки</dt><dd class="text-2xl font-bold text-gold" data-testid="score">{outcome.score ?? '—'}</dd></div>
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
			<Button icon="save" onclick={onmenu}>Меню (сохранить/загрузить)</Button>
			<Button variant="gold" icon="document" onclick={() => (game.epilogueOpen = true)} data-testid="open-epilogue">Рассекретить: доклад комиссии</Button>
			<Button variant="primary" icon="play" onclick={() => game.newGame()}>Новая партия</Button>
		{/snippet}
	</Modal>
{:else if game.questResult}
	<Modal title={game.questResult.title} tone="warn" onclose={() => (game.questResult = null)}>
		{#snippet art()}<Illustration name="result" size={152} />{/snippet}
		{#each game.questResult.text as p, i (i)}<p class="font-protocol text-lg leading-relaxed">{p}</p>{/each}
		{#snippet footer()}
			<Button variant="primary" icon="check" onclick={() => (game.questResult = null)}>Понятно</Button>
		{/snippet}
	</Modal>
{:else if popup && popup.kind === 'chance_card'}
	{@const card = cardText(String(popup.data.cardId ?? ''))}
	<Modal title="Карточка шанса: {card.title}" tone={tones[card.tone]} onclose={() => game.closePopup()}>
		{#snippet art()}<Illustration name="chance" size={152} />{/snippet}
		<p class="font-protocol text-lg leading-relaxed">{card.body}</p>
		{#if popup.data.target}
			<p class="text-muted">Затронуто: {popup.data.target === 'player' ? 'ваше ведомство' : rivalName(String(popup.data.target))}</p>
		{/if}
		{#snippet footer()}
			<Button onclick={() => game.closePopup()}>Закрыть</Button>
			<Button variant="primary" icon="play" onclick={continueGame}>Продолжить игру</Button>
		{/snippet}
	</Modal>
{:else if popup && popup.kind === 'quarter_report'}
	{@const d = popup.data}
	<Modal title="Квартальный отчёт: Q{d.quarter}" tone={Number(d.ratio) >= 1 ? 'good' : 'warn'} onclose={() => game.closePopup()}>
		{#snippet art()}<Illustration name="report" size={152} />{/snippet}
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
			<Button onclick={() => game.closePopup()}>Закрыть</Button>
			<Button variant="primary" icon="play" onclick={continueGame}>Продолжить игру</Button>
		{/snippet}
	</Modal>
{:else if popup && popup.kind === 'election'}
	<Modal title="Президентские выборы" tone={popup.data.newAdmin ? 'warn' : 'good'} onclose={() => game.closePopup()}>
		{#snippet art()}<Illustration name="election" size={152} />{/snippet}
		<p class="font-protocol text-lg leading-relaxed">
			{#if popup.data.newAdmin}К власти пришла новая администрация. Приоритеты финансирования пересмотрены, ваше влияние ослаблено.
			{:else}Действующий президент переизбран. Курс не изменился.{/if}
		</p>
		{#snippet footer()}
			<Button variant="primary" icon="play" onclick={continueGame}>Продолжить игру</Button>
		{/snippet}
	</Modal>
{:else if openQuest}
	{#key openQuest.id}<QuestDialog quest={openQuest} />{/key}
{/if}
