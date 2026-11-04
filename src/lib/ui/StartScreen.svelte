<script lang="ts">
	import { game } from './game.svelte';
	import SavesList from './SavesList.svelte';
	import { Button, Card, Illustration } from './kit';

	let seed = $state('');
</script>

<div class="mx-auto flex min-h-[70vh] max-w-3xl flex-col justify-center gap-6 p-6">
	<div class="flex items-center gap-6">
		<Illustration name="menu" size={160} />
		<div>
		<h1 class="font-protocol text-3xl font-bold text-gold-bright">Менеджер спецслужбы</h1>
		<p class="mt-2 font-protocol text-lg text-muted">Вы директор ФБР. Пять лет в реальном времени с паузой: расследования, бюджет, интриги конкурентов и политика. Игра стартует на паузе.</p>
		</div>
	</div>

	<form
		class="card flex flex-wrap items-end gap-4"
		onsubmit={(e) => {
			e.preventDefault();
			game.newGame(seed);
		}}
	>
		<label class="flex min-w-48 flex-1 flex-col gap-1 text-sm">
			<span class="text-muted">Зерно (необязательно, для повторяемой партии)</span>
			<input bind:value={seed} placeholder="случайное" />
		</label>
		<Button type="submit" variant="primary" size="lg" icon="play">Новая партия</Button>
	</form>

	<Card><SavesList /></Card>
</div>
