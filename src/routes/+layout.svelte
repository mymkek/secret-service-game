<script lang="ts">
	import '../app.css';
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { selectQuests } from '../lib/game/index';
	import { game } from '../lib/ui/game.svelte';
	import TimeBar from '../lib/ui/TimeBar.svelte';
	import ResourceBar from '../lib/ui/ResourceBar.svelte';
	import StartScreen from '../lib/ui/StartScreen.svelte';
	import Dialogs from '../lib/ui/Dialogs.svelte';
	import MenuDialog from '../lib/ui/MenuDialog.svelte';

	let { children } = $props();
	let menuOpen = $state(false);

	onMount(() => {
		// Отладочный хук для e2e: /?e2e открывает доступ к хранилищу из тестов.
		if (new URLSearchParams(location.search).has('e2e')) (window as unknown as Record<string, unknown>).__game = game;
		game.start();
		return () => game.stop();
	});

	const NAV = [
		{ href: '/', label: 'Карта' },
		{ href: '/ops', label: 'Операции' },
		{ href: '/personnel', label: 'Персонал' },
		{ href: '/departments', label: 'Отделы и технологии' },
		{ href: '/rivals', label: 'Конкуренты' },
		{ href: '/networks', label: 'Сети за рубежом' },
		{ href: '/rules', label: 'Правила' }
	];

	const pending = $derived(game.s ? selectQuests(game.s).filter((q) => q.waitUntilDay === null && q.choices.length > 0).length : 0);

	// Пока открыта вкладка «Операции», новые дела сразу считаются просмотренными.
	$effect(() => {
		if (page.url.pathname.startsWith('/ops')) game.markCasesSeen();
	});

	function onkeydown(e: KeyboardEvent) {
		if (e.code !== 'Space' || !game.s) return;
		const t = e.target as HTMLElement | null;
		if (t && t.closest('input, textarea, select, button, a, [role="button"], [role="dialog"]')) return;
		// Пока открыто окно, пробел не снимает паузу «из-под» него.
		if (document.querySelector('[aria-modal="true"]')) return;
		e.preventDefault();
		game.togglePause();
	}
</script>

<svelte:window {onkeydown} />

<svelte:head><title>Менеджер спецслужбы</title></svelte:head>

{#if !game.s}
	<StartScreen />
{:else}
	<div class="flex min-h-screen flex-col">
		<header class="flex flex-wrap items-center justify-between gap-3 border-b border-line bg-panel px-4 py-2">
			<div class="flex items-center gap-3">
				<h1 class="text-base font-bold text-gold">Менеджер спецслужбы</h1>
				<span class="chip" title="Зерно партии">зерно: {game.s.seed}</span>
			</div>
			<TimeBar />
			<div class="flex items-center gap-2">
				{#if pending > 0}
					<button class="btn btn-gold" onclick={() => (game.dismissedQuests = [])}>Решения ({pending})</button>
				{/if}
				<button class="btn" onclick={() => (menuOpen = true)} aria-haspopup="dialog">Меню</button>
			</div>
		</header>
		<ResourceBar />
		<nav aria-label="Разделы" class="flex flex-wrap gap-1 border-b border-line bg-bg px-4 py-1.5">
			{#each NAV as n (n.href)}
				{@const active = n.href === '/' ? page.url.pathname === '/' : page.url.pathname.startsWith(n.href)}
				<a
					href={n.href}
					aria-current={active ? 'page' : undefined}
					class="relative rounded-md px-3 py-1 text-sm hover:text-gold {active ? 'bg-gold/15 text-gold' : 'text-muted'}"
					>{n.label}{#if n.href === '/ops' && game.newCases > 0}<span
							class="absolute -top-1.5 -right-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[10px] leading-none font-bold text-white"
							title="Новых дел: {game.newCases}"
							aria-label="новых дел: {game.newCases}">{game.newCases}</span
						>{/if}</a
				>
			{/each}
		</nav>
		<main class="flex-1 p-4">{@render children()}</main>
	</div>

	<Dialogs onmenu={() => (menuOpen = true)} />
	{#if menuOpen}<MenuDialog onclose={() => (menuOpen = false)} />{/if}
{/if}

<div class="pointer-events-none fixed right-4 bottom-4 z-[60] flex w-80 flex-col gap-2" aria-live="polite" role="status">
	{#each game.toasts as t (t.id)}
		<div class="rounded-md border px-3 py-2 text-sm shadow-lg {t.kind === 'error' ? 'border-danger bg-panel text-danger' : t.kind === 'success' ? 'border-ok bg-panel text-ok' : 'border-line bg-panel'}">
			{t.text}
		</div>
	{/each}
</div>
