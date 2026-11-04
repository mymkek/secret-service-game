<script lang="ts">
	import { selectActionCosts, selectKompromat, selectRivals, validateAction, type PlayerAction } from '../../lib/game/index';
	import { game } from '../../lib/ui/game.svelte';
	import { rivalDossiers } from '../../lib/content/index';
	import { AGENCY_VAR, errorText, rivalName } from '../../lib/ui/labels';
	import ActionButton from '../../lib/ui/ActionButton.svelte';
	import { senatorName } from '../../lib/ui/content';
	import Bar from '../../lib/ui/Bar.svelte';

	const rivals = $derived(game.s ? selectRivals(game.s) : []);
	const komp = $derived(game.s ? selectKompromat(game.s) : []);
	const costs = $derived(game.s ? selectActionCosts(game.s) : null);
	const leakCost = (id: number) => costs?.leak.find((l) => l.kompromatId === id) ?? null;
	const day = $derived(game.s?.day ?? 0);
	const coalition = $derived(game.s?.coalition ?? false);

	const err = (a: PlayerAction) => (game.s ? validateAction(game.s, a) : null);

	const ACTIONS = [
		{ type: 'sabotage', label: 'Подстава', ok: 'Подстава устроена' },
		{ type: 'lobby', label: 'Лоббировать против', ok: 'Лоббирование начато' },
		{ type: 'poach', label: 'Переманить агента', ok: 'Попытка переманить агента' },
		{ type: 'absorb', label: 'Поглотить', ok: 'Поглощение начато' }
	] as const;

	function kTarget(t: { kind: string; id?: unknown }): string {
		if (t.kind === 'rival') return rivalName(String(t.id));
		if (t.kind === 'senator') return senatorName(String(t.id));
		if (t.kind === 'leader') return `Лидер протеста #${t.id}`;
		return 'Президент';
	}
</script>

<div class="space-y-6">
	{#if coalition}
		<p class="rounded border border-danger bg-danger/10 px-3 py-2 text-sm text-danger">Конкуренты объединились в коалицию против вас.</p>
	{/if}

	<section aria-label="Досье на конкурентов" class="grid gap-3 lg:grid-cols-3">
		{#each rivals as r (r.id)}
			<article class="card space-y-3 text-sm {r.alive ? '' : 'opacity-60'}" style="border-top: 3px solid {AGENCY_VAR[r.id]}" aria-label={rivalName(r.id)}>
				<header class="flex items-baseline justify-between">
					<h2 class="text-base font-semibold">{rivalName(r.id)}</h2>
					<span class="chip">{r.absorbed ? 'поглощён' : r.alive ? `доля ${Math.round(r.share * 100)}%` : 'расформирован'}</span>
				</header>
				<p class="text-xs text-muted italic">{rivalDossiers[r.id].motto}</p>
				<p class="text-xs">{rivalDossiers[r.id].dossier}</p>
				<p class="text-xs"><span class="text-ok">Сильная сторона:</span> {rivalDossiers[r.id].strength}<br /><span class="text-warn">Слабая сторона:</span> {rivalDossiers[r.id].weakness}</p>
				{#if r.alive}
					<div class="grid grid-cols-2 gap-3">
						<Bar label="Репутация" value={r.reputation} tone="ok" />
						<Bar label="Влияние" value={r.influence} tone="fbi" />
					</div>
					<dl class="grid grid-cols-2 gap-x-3 gap-y-0.5 text-xs">
						<dt class="text-muted">Выполнение плана</dt><dd class="text-right tabular-nums">{Math.round(r.planRatio * 100)}%</dd>
						<dt class="text-muted">Компромат на них</dt><dd class="text-right tabular-nums">{r.kompromatOnThem}</dd>
						<dt class="text-muted">Наши агенты у них</dt><dd class="text-right tabular-nums">{r.embeddedAgents.length}</dd>
						<dt class="text-muted">Обида на вас</dt><dd class="text-right {r.grudge ? 'text-danger' : ''}">{r.grudge ? 'да' : 'нет'}</dd>
					</dl>

					<div class="flex flex-wrap gap-2">
						{#each ACTIONS as a (a.type)}
							{#if costs}
								<ActionButton label={a.label} v={costs.rivals[r.id][a.type]} onclick={() => game.act({ type: a.type, rivalId: r.id }, a.ok)} />
							{/if}
						{/each}
					</div>

					<div>
						<div class="h2">Известные действия</div>
						<ul class="max-h-40 space-y-1 overflow-y-auto text-xs">
							{#each r.knownActions.toReversed().slice(0, 12) as e (e.id)}
								<li><span class="text-muted">д.{e.day}</span> {game.line(e).text}</li>
							{:else}
								<li class="text-muted">Ничего не известно.</li>
							{/each}
						</ul>
					</div>
				{/if}
			</article>
		{/each}
	</section>

	<div class="grid gap-4 lg:grid-cols-2">
		<section class="card" aria-label="Компромат">
			<h2 class="h2">Компромат ({komp.length})</h2>
			<ul class="space-y-2 text-sm">
				{#each komp as k (k.id)}
					<li class="rounded border border-line bg-bg p-2">
						<div class="flex justify-between gap-2">
							<span>{kTarget(k.target)}</span>
							<span class="text-xs text-muted">сила {Math.round(k.strength * 100) / 100} · {k.daysLeft === null ? 'бессрочно' : `${k.daysLeft} дн.`}</span>
						</div>
						<div class="mt-1 flex flex-wrap gap-1">
							{#if k.target.kind === 'rival'}
								{@const lc = leakCost(k.id)}
								{#if lc}
									<ActionButton label="Слить" v={lc} onclick={() => game.act({ type: 'leak', kompromatId: k.id }, 'Слив запущен')} />
									<span class="self-center text-[11px] text-muted">репутация цели {lc.targetRepDelta}</span>
								{/if}
							{/if}
							<button class="btn px-2 py-0.5 text-xs" disabled={!!err({ type: 'blackmail', kompromatId: k.id })} title={errorText(err({ type: 'blackmail', kompromatId: k.id }))} onclick={() => game.act({ type: 'blackmail', kompromatId: k.id }, 'Шантаж')}>Шантаж</button>
							<button class="btn px-2 py-0.5 text-xs" disabled={!!err({ type: 'counterKompromat', kompromatId: k.id })} title={errorText(err({ type: 'counterKompromat', kompromatId: k.id }))} onclick={() => game.act({ type: 'counterKompromat', kompromatId: k.id }, 'Контр-компромат')}>Контр-компромат</button>
						</div>
					</li>
				{:else}
					<li class="text-muted">Компромата нет. Его добавляют слежка, внедрение и случайные находки.</li>
				{/each}
			</ul>
		</section>

		<section class="card space-y-2" aria-label="Работа с властью">
			<h2 class="h2">Работа с властью и ведомством</h2>
			<div class="flex flex-wrap gap-3">
				{#if costs}
					<ActionButton label="Работа с Конгрессом" v={costs.congressWork} onclick={() => game.act({ type: 'congressWork' }, 'Работа с Конгрессом начата')} />
					<ActionButton label="Пиар-кампания" v={costs.prCampaign} onclick={() => game.act({ type: 'prCampaign' }, 'Пиар-кампания запущена')} />
					<ActionButton label="Проверка лояльности" v={costs.loyaltyCheck} onclick={() => game.act({ type: 'loyaltyCheck' }, 'Проверка лояльности запущена')} />
				{/if}
			</div>
			<p class="text-xs text-muted">Текущий день: {day}</p>
		</section>
	</div>
</div>
