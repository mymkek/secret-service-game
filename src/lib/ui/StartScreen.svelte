<script lang="ts">
	import { game } from './game.svelte';
	import SavesList from './SavesList.svelte';

	let seed = $state('');
</script>

<div class="mx-auto flex min-h-[70vh] max-w-3xl flex-col justify-center gap-6 p-6">
	<div>
		<h1 class="text-3xl font-bold text-gold">Менеджер спецслужбы</h1>
		<p class="mt-2 text-muted">Вы директор ФБР. Пять лет в реальном времени с паузой: расследования, бюджет, интриги конкурентов и политика. Игра стартует на паузе.</p>
	</div>

	<form
		class="card flex flex-wrap items-end gap-3"
		onsubmit={(e) => {
			e.preventDefault();
			game.newGame(seed);
		}}
	>
		<label class="flex min-w-48 flex-1 flex-col gap-1 text-sm">
			<span class="text-muted">Зерно (необязательно, для повторяемой партии)</span>
			<input class="rounded border border-line bg-bg px-2 py-1.5" bind:value={seed} placeholder="случайное" />
		</label>
		<button type="submit" class="btn btn-gold px-5 py-2">Новая партия</button>
	</form>

	<div class="card"><SavesList /></div>
</div>
