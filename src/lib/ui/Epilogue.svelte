<script lang="ts">
	import { selectEpilogue } from '../game/index';
	import { game } from './game.svelte';
	import { Button, Chip } from './kit';
	import { epilogueElection, epilogueLine, epilogueTitle, verdictText } from './epilogue-text';

	let { onmenu, onclose }: { onmenu: () => void; onclose: () => void } = $props();

	const ep = $derived(game.s ? selectEpilogue(game.s) : null);
	/** До нажатия «Рассекретить» все строки закрыты чёрными полосами. */
	let declassified = $state(false);
	let box: HTMLDivElement | undefined = $state();

	$effect(() => {
		box?.focus();
	});

	const rows = $derived(ep ? ep.lines.map((l) => epilogueLine(l)) : []);
	const verdict = $derived(ep ? verdictText(ep.verdict) : null);
	const election = $derived(ep?.election ? epilogueElection(ep.election) : '');
	const STEP_MS = 650;
	/** Номер последнего элемента документа - от него считаем задержку вердикта. */
	const total = $derived(rows.length + (election ? 1 : 0));
</script>

<div class="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/80 p-4 backdrop-blur-sm" role="presentation">
	<div
		bind:this={box}
		role="dialog"
		aria-modal="true"
		aria-label={ep ? epilogueTitle(ep.yearsLater) : 'Доклад комиссии'}
		tabindex="-1"
		class="relative my-6 w-full max-w-3xl rounded-modal border border-gold/40 bg-surface-2 p-8 shadow-elev-3"
		data-testid="epilogue"
	>
		<div class="stamp absolute top-6 right-6 select-none" class:stamp-on={declassified} aria-hidden="true">Рассекречено</div>
		<div class="text-xs tracking-[0.3em] text-muted uppercase">Совершенно секретно · срок хранения истёк</div>
		{#if ep}
			<h2 class="mt-2 pr-40 font-protocol text-3xl font-bold text-gold-bright">{epilogueTitle(ep.yearsLater)}</h2>
			<p class="mt-1 font-protocol text-base text-muted">Протокол заседания комиссии по надзору за спецслужбами. Приложение: материалы вашего директорского срока.</p>

			<ol class="mt-6 space-y-4 font-protocol text-lg leading-relaxed">
				{#each rows as r, i (i)}
					<li class="line">
						<span class="relative block">
							<span class="text">{r.text}</span>
							<span class="redact" class:open={declassified} style="--d:{i * STEP_MS}ms" aria-hidden="true"></span>
						</span>
						{#if r.realCase}<span class="mt-1 block text-base text-muted italic">{r.realCase}</span>{/if}
					</li>
				{:else}
					<li class="text-muted">Спорных эпизодов в архиве не найдено.</li>
				{/each}
				{#if election}
					<li class="line">
						<span class="relative block">
							<span class="text">{election}</span>
							<span class="redact" class:open={declassified} style="--d:{rows.length * STEP_MS}ms" aria-hidden="true"></span>
						</span>
					</li>
				{/if}
			</ol>

			{#if verdict}
				<div class="verdict mt-8 rounded-card border border-gold/40 bg-surface-1 p-5" class:verdict-on={declassified} style="--d:{total * STEP_MS + 300}ms" data-testid="epilogue-verdict">
					<div class="text-xs tracking-widest text-muted uppercase">Вердикт комиссии</div>
					<div class="mt-1 font-protocol text-2xl font-bold text-gold-bright">{verdict.title}</div>
					<p class="mt-1 font-protocol text-lg leading-relaxed">{verdict.text}</p>
					<div class="mt-3 flex flex-wrap gap-2">
						<Chip tone={ep.hiddenSins > 0 ? 'warn' : 'ok'} title="Скрытые нарушения за срок службы">скрытых грехов: {ep.hiddenSins}</Chip>
						<Chip tone={ep.revealed > 0 ? 'danger' : 'default'} title="Сколько тайн всплыло ещё при вашей жизни">всплыло при жизни: {ep.revealed}</Chip>
					</div>
				</div>
			{/if}
		{/if}

		<div class="mt-8 flex flex-wrap justify-end gap-3">
			<Button onclick={onclose}>Назад к итогам</Button>
			{#if !declassified}
				<Button variant="gold" icon="document" onclick={() => (declassified = true)} data-testid="declassify">Рассекретить</Button>
			{:else}
				<Button icon="save" onclick={onmenu}>Меню</Button>
				<Button variant="primary" icon="play" onclick={() => game.newGame()}>Новая партия</Button>
			{/if}
		</div>
	</div>
</div>

<style>
	/* Чёрная полоса поверх строки уезжает вправо; задержка --d даёт ступенчатое «проявление». */
	.redact {
		position: absolute;
		inset: -1px -4px;
		background: #05080f;
		border-radius: 2px;
		transform-origin: right center;
		transition: transform 0.9s cubic-bezier(0.2, 0.7, 0.2, 1) var(--d, 0ms);
	}
	.redact.open {
		transform: scaleX(0);
	}
	.stamp {
		border: 3px solid var(--color-danger);
		color: var(--color-danger);
		padding: 0.15rem 0.75rem;
		font-family: var(--font-ui);
		font-weight: 700;
		letter-spacing: 0.2em;
		text-transform: uppercase;
		transform: rotate(6deg) scale(1.4);
		opacity: 0;
		transition:
			opacity 0.3s,
			transform 0.3s;
	}
	.stamp-on {
		opacity: 0.85;
		transform: rotate(6deg) scale(1);
	}
	.verdict {
		opacity: 0.15;
		filter: blur(3px);
		transition:
			opacity 0.8s ease var(--d, 0ms),
			filter 0.8s ease var(--d, 0ms);
	}
	.verdict-on {
		opacity: 1;
		filter: none;
	}
	@media (prefers-reduced-motion: reduce) {
		.redact,
		.stamp,
		.verdict {
			transition: none;
		}
	}
</style>
