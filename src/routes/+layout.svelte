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
	import ConfirmHost from '../lib/ui/ConfirmHost.svelte';
	import { Button, Chip, Tabs, Toast, type TabItem } from '../lib/ui/kit';

	let { children } = $props();
	let menuOpen = $state(false);

	onMount(() => {
		// Отладочный хук для e2e: /?e2e открывает доступ к хранилищу из тестов.
		if (new URLSearchParams(location.search).has('e2e')) (window as unknown as Record<string, unknown>).__game = game;
		game.start();
		return () => game.stop();
	});

	const NAV: TabItem[] = $derived([
		{ href: '/', label: 'Карта', icon: 'map' },
		{ href: '/ops', label: 'Операции', icon: 'operation', badge: game.newCases, badgeLabel: `новых дел: ${game.newCases}` },
		{ href: '/personnel', label: 'Персонал', icon: 'team' },
		{ href: '/departments', label: 'Отделы и технологии', icon: 'departments' },
		{ href: '/rivals', label: 'Конкуренты', icon: 'rivals' },
		{ href: '/networks', label: 'Сети за рубежом', icon: 'networks' },
		{ href: '/rules', label: 'Правила', icon: 'rules' }
	]);
	const isActive = (n: TabItem) => (n.href === '/' ? page.url.pathname === '/' : page.url.pathname.startsWith(n.href));

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
		<header class="flex flex-wrap items-center justify-between gap-4 bg-surface-1/90 px-6 py-3 shadow-elev-2 backdrop-blur">
			<div class="flex items-center gap-3">
				<h1 class="font-protocol text-2xl font-bold text-gold-bright">Менеджер спецслужбы</h1>
				<Chip icon="seed" title="Зерно партии">зерно: {game.s.seed}</Chip>
			</div>
			<TimeBar />
			<div class="flex items-center gap-2">
				{#if pending > 0}
					<Button variant="primary" icon="warning" onclick={() => (game.dismissedQuests = [])}>Решения ({pending})</Button>
				{/if}
				<Button icon="menu" onclick={() => (menuOpen = true)} aria-haspopup="dialog">Меню</Button>
			</div>
		</header>
		<ResourceBar />
		<Tabs class="px-6 pt-1" items={NAV} {isActive} />
		<main class="flex-1 p-6">{@render children()}</main>
	</div>

	<Dialogs onmenu={() => (menuOpen = true)} />
	<ConfirmHost />
	{#if menuOpen}<MenuDialog onclose={() => (menuOpen = false)} />{/if}
{/if}

<div class="pointer-events-none fixed right-6 bottom-6 z-[60] flex w-[26rem] max-w-[calc(100vw-3rem)] flex-col gap-3" aria-live="polite" role="status">
	{#each game.toasts as t (t.id)}
		<Toast kind={t.kind} text={t.text} href={t.href} title={t.rich?.title} detail={t.rich?.detail} chips={t.rich?.chips} lost={t.rich?.lost} onclose={() => game.closeToast(t.id)} onhold={(h) => game.holdToast(t.id, h, t.rich ? 6000 : 4000)} />
	{/each}
</div>
