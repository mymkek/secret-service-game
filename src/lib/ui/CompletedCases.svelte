<script lang="ts">
	import { game } from './game.svelte';
	import { fmtDay } from './labels';
	import { opResultView } from './op-results';
	import { Card, Chip, Icon } from './kit';

	let filter = $state<'all' | 'ok' | 'fail'>('all');
	const FILTERS = [
		{ id: 'all', label: 'Все' },
		{ id: 'ok', label: 'Успехи' },
		{ id: 'fail', label: 'Провалы' }
	] as const;

	// Новые сверху. Копим в адаптере: журнал ядра обрезается (LOG_MAX_ENTRIES).
	const all = $derived(game.completedOps.map(opResultView).toReversed());
	const shown = $derived(all.filter((r) => (filter === 'all' ? true : filter === 'ok' ? r.ok : !r.ok)));
</script>

<Card as="section" id="completed" aria-label="Завершённые дела" class="scroll-mt-4">
	<div class="mb-3 flex flex-wrap items-center justify-between gap-2">
		<h2 class="h2 !mb-0">Завершённые дела ({all.length})</h2>
		<div class="flex gap-1" role="group" aria-label="Фильтр исходов">
			{#each FILTERS as f (f.id)}
				<button class="btn btn-sm {filter === f.id ? 'btn-gold' : ''}" aria-pressed={filter === f.id} onclick={() => (filter = f.id)}>{f.label}</button>
			{/each}
		</div>
	</div>
	<ul class="max-h-[32rem] space-y-2 overflow-y-auto pr-1">
		{#each shown as r (r.id)}
			<li class="card-1 flex gap-3" data-result={r.ok ? 'success' : 'fail'}>
				<span class="flex size-10 shrink-0 items-center justify-center rounded-full text-white shadow-elev-1 {r.ok ? 'bg-grad-green' : 'bg-grad-coral'}">
					<Icon name={r.ok ? 'success' : 'fail'} size={22} label={r.ok ? 'Успех' : 'Провал'} />
				</span>
				<div class="min-w-0 flex-1">
					<div class="flex flex-wrap items-baseline justify-between gap-x-3">
						<span class="font-protocol text-lg leading-tight font-bold">{r.title}{r.where ? ` - ${r.where}` : ''}</span>
						<span class="text-xs whitespace-nowrap text-muted">{fmtDay(r.day)} · шанс {Math.round(r.chance * 100)}%</span>
					</div>
					{#if r.outcome}<p class="mt-0.5 text-sm text-muted italic">{r.outcome}</p>{/if}
					{#if r.chips.length || r.lost.length}
						<div class="mt-1.5 flex flex-wrap gap-1">
							{#each r.chips as c (c.text)}<Chip tone={c.tone}>{c.text}</Chip>{/each}
							{#each r.lost as l (l)}<Chip tone="danger" icon="skull">{l}</Chip>{/each}
						</div>
					{/if}
				</div>
			</li>
		{:else}
			<li class="text-sm text-muted">{all.length ? 'В этом разделе пока пусто.' : 'Завершённых дел пока нет. Итог каждой операции появится здесь.'}</li>
		{/each}
	</ul>
</Card>
