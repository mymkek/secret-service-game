<script lang="ts">
	import { selectVictoryProgress } from '../lib/game/index';
	import { game } from '../lib/ui/game.svelte';
	import UsMap from '../lib/ui/UsMap.svelte';
	import StatePanel from '../lib/ui/StatePanel.svelte';
	import OperationList from '../lib/ui/OperationList.svelte';
	import EventLog from '../lib/ui/EventLog.svelte';
	import { BALANCE } from '../lib/game/index';
	import { PATH_LABEL } from '../lib/ui/labels';

	let selected = $state<string | null>(null);

	const progress = $derived(game.s ? selectVictoryProgress(game.s) : null);
	const HOLD: Record<string, number | undefined> = { cardinal: BALANCE.CARDINAL_HOLD_DAYS, shadow: BALANCE.SHADOW_HOLD_DAYS, '1984': BALANCE.VICTORY_1984_HOLD_DAYS };
	const PATHS = ['monopoly', 'cardinal', 'shadow', '1984', 'clean'] as const;
</script>

{#if game.s}
	<div class="grid gap-4 xl:grid-cols-[minmax(0,1fr)_24rem]">
		<section class="card" aria-label="Карта">
			<UsMap {selected} onselect={(id) => (selected = id)} />
		</section>

		<div class="space-y-4">
			{#if selected}
				<StatePanel stateId={selected} />
			{:else}
				<div class="card text-sm text-muted">Выберите штат на карте, чтобы увидеть полномочия и дела.</div>
			{/if}

			<section class="card" aria-label="Операции">
				<div class="h2">Активные операции</div>
				<OperationList />
			</section>
		</div>
	</div>

	<div class="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_24rem]">
		<section class="card" aria-label="Журнал событий">
			<div class="h2">Лента событий</div>
			<div class="max-h-72 overflow-y-auto pr-2"><EventLog limit={60} /></div>
		</section>
		{#if progress}
			<section class="card" aria-label="Пути победы">
				<div class="h2">Пути победы</div>
				<ul class="space-y-1 text-sm">
					{#each PATHS as p (p)}
						<li class="flex items-start justify-between gap-2">
							<span class={progress[p].met ? 'text-ok' : ''}>{PATH_LABEL[p]}</span>
							<span class="text-xs whitespace-nowrap text-muted">
								{#if progress[p].holdDays !== undefined}удержание {progress[p].holdDays} из {HOLD[p]} дн.{/if}
								{progress[p].met ? '✓' : ''}
							</span>
						</li>
					{/each}
				</ul>
				<p class="mt-2 text-xs text-muted">Грязных действий: {progress.dirtyActions}</p>
			</section>
		{/if}
	</div>
{/if}
