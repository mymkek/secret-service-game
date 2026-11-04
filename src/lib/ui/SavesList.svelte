<script lang="ts">
	import { onMount } from 'svelte';
	import { game, type SaveMeta } from './game.svelte';

	let { onloaded }: { onloaded?: () => void } = $props();

	let saves = $state<SaveMeta[]>([]);
	let loading = $state(true);
	let error = $state('');

	async function refresh() {
		loading = true;
		error = '';
		try {
			saves = await game.listSaves();
		} catch (e) {
			error = e instanceof Error ? e.message : String(e);
		} finally {
			loading = false;
		}
	}

	onMount(refresh);

	async function load(id: string) {
		if (await game.load(id)) onloaded?.();
	}

	async function remove(id: string) {
		await game.removeSave(id);
		await refresh();
	}

	const fmt = (t: number) => new Date(t).toLocaleString('ru-RU');
</script>

<div class="space-y-2">
	<div class="flex items-center justify-between">
		<div class="h2 mb-0">Сохранённые партии</div>
		<button class="btn btn-sm" onclick={refresh} disabled={loading}>Обновить</button>
	</div>
	{#if error}
		<p class="text-sm text-danger">Не удалось получить список: {error}</p>
	{:else if loading}
		<p class="text-sm text-muted">Загрузка…</p>
	{:else if saves.length === 0}
		<p class="text-sm text-muted">Сохранений пока нет.</p>
	{/if}
	<ul class="max-h-64 space-y-1 overflow-y-auto" aria-label="Сохранения">
		{#each saves as sv (sv.id)}
			<li class="flex items-center gap-2 rounded-xl bg-surface-1 px-3 py-2 text-sm">
				<div class="min-w-0 flex-1">
					<div class="truncate font-medium">{sv.name}</div>
					<div class="text-xs text-muted">{fmt(sv.updatedAt)} · зерно {sv.seed}</div>
				</div>
				<button class="btn btn-sm" disabled={game.busy} onclick={() => load(sv.id)} aria-label="Загрузить {sv.name}">Загрузить</button>
				<button class="btn btn-danger btn-sm" disabled={game.busy} onclick={() => remove(sv.id)} aria-label="Удалить {sv.name}">✕</button>
			</li>
		{/each}
	</ul>
</div>
