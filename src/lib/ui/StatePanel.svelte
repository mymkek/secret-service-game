<script lang="ts">
	import { selectCases, selectJurisdiction, validateAction } from '../game/index';
	import { game } from './game.svelte';
	import { stateName } from './content';
	import { errorText, rivalName } from './labels';
	import CaseCard from './CaseCard.svelte';

	let { stateId }: { stateId: string } = $props();

	const j = $derived(game.s ? selectJurisdiction(game.s).states[stateId] : null);
	const cases = $derived((game.s ? selectCases(game.s) : []).filter((c) => c.stateId === stateId));
	const restoreErr = $derived(game.s ? validateAction(game.s, { type: 'restoreState', stateId }) : null);
</script>

<section class="card space-y-3" aria-label="Штат {stateName(stateId)}">
	<div>
		<h3 class="text-xl font-bold text-gold-bright">{stateName(stateId)} <span class="text-xs text-muted">{stateId}</span></h3>
		{#if j}
			<p class="text-sm text-muted">
				{#if j.level >= 2}Полные полномочия ФБР
				{:else if j.level === 1}Частичные полномочия ФБР (дела до сложности 3)
				{:else}Полномочий нет{j.holder ? `: держатель — ${rivalName(j.holder)}` : ''}{/if}
			</p>
		{/if}
		{#if j && j.holder}
			<button class="btn mt-1 text-xs" disabled={!!restoreErr} title={errorText(restoreErr)} onclick={() => game.act({ type: 'restoreState', stateId }, 'Попытка восстановить полномочия')}>
				Восстановить полномочия
			</button>
		{/if}
	</div>

	<div>
		<div class="h2">Дела в штате ({cases.length})</div>
		{#if cases.length === 0}
			<p class="text-sm text-muted">Открытых дел нет.</p>
		{/if}
		<div class="space-y-2">
			{#each cases as c (c.id)}<CaseCard {c} />{/each}
		</div>
	</div>
</section>
