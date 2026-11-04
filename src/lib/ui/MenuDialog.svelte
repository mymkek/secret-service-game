<script lang="ts">
	import { game } from './game.svelte';
	import Modal from './Modal.svelte';
	import SavesList from './SavesList.svelte';

	let { onclose }: { onclose: () => void } = $props();

	let name = $state(game.saveName);
	let seed = $state('');
	let confirmNew = $state(false);
</script>

<Modal title="Меню" {onclose} wide>
	<form
		class="space-y-2"
		onsubmit={async (e) => {
			e.preventDefault();
			await game.save(name);
		}}
	>
		<div class="h2">Сохранить партию</div>
		<div class="flex gap-2">
			<input class="flex-1 rounded border border-line bg-bg px-2 py-1.5" bind:value={name} placeholder="Название сохранения" aria-label="Название сохранения" />
			<button class="btn btn-gold" type="submit" disabled={game.busy}>{game.saveId ? 'Обновить сохранение' : 'Сохранить'}</button>
		</div>
		{#if game.saveId}
			<button
				type="button"
				class="btn text-xs"
				disabled={game.busy}
				onclick={async () => {
					game.saveId = null;
					await game.save(name);
				}}>Сохранить как новое</button
			>
		{/if}
	</form>

	<SavesList onloaded={onclose} />

	<div class="space-y-2 border-t border-line pt-3">
		<div class="h2">Новая партия</div>
		{#if confirmNew}
			<div class="flex flex-wrap items-center gap-2">
				<input class="rounded border border-line bg-bg px-2 py-1.5" bind:value={seed} placeholder="зерно (необязательно)" aria-label="Зерно новой партии" />
				<button
					class="btn btn-danger"
					onclick={() => {
						game.newGame(seed);
						game.saveId = null;
						game.saveName = '';
						onclose();
					}}>Да, начать заново (несохранённое пропадёт)</button
				>
				<button class="btn" onclick={() => (confirmNew = false)}>Отмена</button>
			</div>
		{:else}
			<button class="btn" onclick={() => (confirmNew = true)}>Начать новую партию…</button>
		{/if}
	</div>

	{#snippet footer()}
		<button class="btn" onclick={() => { game.leave(); onclose(); }}>Выйти на титульный экран</button>
		<button class="btn btn-gold" onclick={onclose}>Вернуться в игру</button>
	{/snippet}
</Modal>
