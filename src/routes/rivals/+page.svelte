<script lang="ts">
	import { selectActionCosts, selectKompromat, selectRivals, validateAction, type PlayerAction, type RivalFeedEntry } from '../../lib/game/index';
	import { game } from '../../lib/ui/game.svelte';
	import { rivalActionPhrases, rivalDossiers } from '../../lib/content/index';
	import { AGENCY_VAR, fmtDay, rivalName } from '../../lib/ui/labels';
	import ActionButton from '../../lib/ui/ActionButton.svelte';
	import { senatorName } from '../../lib/ui/content';
	import Bar from '../../lib/ui/Bar.svelte';
	import { perform } from '../../lib/ui/perform';
	import { Chip, Icon } from '../../lib/ui/kit';
	import { blackmailInfo, congressInfo, counterInfo, leakInfo, loyaltyInfo, prInfo, rivalActionInfo } from '../../lib/ui/action-info';

	const rivals = $derived(game.s ? selectRivals(game.s) : []);
	const komp = $derived(game.s ? selectKompromat(game.s) : []);
	const costs = $derived(game.s ? selectActionCosts(game.s) : null);
	const leakCost = (id: number) => costs?.leak.find((l) => l.kompromatId === id) ?? null;
	const day = $derived(game.s?.day ?? 0);
	const coalition = $derived(game.s?.coalition ?? false);

	const err = (a: PlayerAction) => (game.s ? validateAction(game.s, a) : null);

	const ACTIONS = [
		{ type: 'sabotage', label: 'Подстава' },
		{ type: 'lobby', label: 'Лоббировать против' },
		{ type: 'poach', label: 'Переманить агента' },
		{ type: 'absorb', label: 'Поглотить' }
	] as const;

	const FEED_DAYS = 90;
	const FOCUS: Record<string, string> = { WORK_PLAN: 'план', PR: 'пиар', LOBBY_SELF: 'Конгресс', ATTACK_RIVAL: 'удары по конкурентам' };

	const shortDay = (d: number) => `м.${Math.max(1, Math.ceil(d / 30))}, д.${((Math.max(1, d) - 1) % 30) + 1}`;

	function feedText(e: RivalFeedEntry): string {
		const ph = rivalActionPhrases[e.action];
		const t = ph ? (e.success ? ph.ok : ph.fail) : e.action;
		return e.targetRivalId ? `${t} (${rivalName(e.targetRivalId)})` : t;
	}

	/** Чем соперник занят в последние FEED_DAYS дней: открытые действия по частоте, враждебные одной строкой. */
	function focus(feed: RivalFeedEntry[]): { label: string; n: number; hostile: boolean }[] {
		const recent = feed.filter((e) => e.day > day - FEED_DAYS);
		const counts = new Map<string, number>();
		for (const e of recent) {
			const k = e.hostile ? 'hostile' : e.action;
			counts.set(k, (counts.get(k) ?? 0) + 1);
		}
		return [...counts]
			.map(([k, n]) => ({ label: k === 'hostile' ? 'против вас' : (FOCUS[k] ?? k), n, hostile: k === 'hostile' }))
			.sort((a, b) => b.n - a.n);
	}

	function kTarget(t: { kind: string; id?: unknown }): string {
		if (t.kind === 'rival') return rivalName(String(t.id));
		if (t.kind === 'senator') return senatorName(String(t.id));
		if (t.kind === 'leader') return `Лидер протеста #${t.id}`;
		return 'Президент';
	}
</script>

<div class="space-y-6">
	{#if coalition}
		<p class="flex items-center gap-2 rounded-2xl border border-danger/50 bg-danger/10 px-4 py-3 text-sm text-danger"><Icon name="warning" size={20} />Конкуренты объединились в коалицию против вас.</p>
	{/if}

	<section aria-label="Досье на конкурентов" class="grid gap-3 lg:grid-cols-3">
		{#each rivals as r (r.id)}
			<article class="card space-y-3 text-sm {r.alive ? '' : 'opacity-60'}" style="border-top: 3px solid {r.collapsing ? 'var(--color-warn)' : AGENCY_VAR[r.id]}" aria-label={rivalName(r.id)}>
				<header class="flex items-baseline justify-between">
					<h2 class="text-xl font-bold">{rivalName(r.id)}</h2>
					{#if r.collapsing}<Chip tone="warn">на грани — выбудет: {r.disbandDay !== null ? fmtDay(r.disbandDay) : 'скоро'}</Chip>{/if}
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
								<ActionButton label={a.type === 'absorb' && r.collapsing ? 'Поглотить (на грани: шанс выше)' : a.label} v={costs.rivals[r.id][a.type]} info={rivalActionInfo(a.type, rivalName(r.id), costs.rivals[r.id][a.type], r.collapsing)} onclick={() => perform({ type: a.type, rivalId: r.id }, rivalName(r.id))} />
							{/if}
						{/each}
					</div>

					<div>
						<div class="h2">Чем заняты</div>
						{#if focus(r.feed).length}
							<div class="mb-2 flex flex-wrap gap-1 text-xs">
								<span class="self-center text-muted">за {FEED_DAYS} дн.:</span>
								{#each focus(r.feed) as x (x.label)}<Chip tone={x.hostile ? 'danger' : 'default'}>{x.label} ×{x.n}</Chip>{/each}
							</div>
						{/if}
						<ul class="max-h-48 space-y-1 overflow-y-auto text-xs">
							{#each r.feed.toReversed().slice(0, 20) as e, i (i)}
								<li class={e.hostile ? 'text-danger' : ''}><span class="text-muted">{shortDay(e.day)}</span> {feedText(e)}</li>
							{:else}
								<li class="text-muted">Пока ничего не слышно.</li>
							{/each}
						</ul>
						<p class="mt-1 text-[11px] text-muted">Открытые действия видны всегда. Враждебные попадают сюда, только если контрразведка установила источник.</p>
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
					{@const bc = costs?.blackmail.find((b) => b.kompromatId === k.id)}
					<li class="card-1">
						<div class="flex justify-between gap-2">
							<span>{kTarget(k.target)}</span>
							<span class="text-xs text-muted">сила {Math.round(k.strength * 100) / 100} · {k.daysLeft === null ? 'бессрочно' : `${k.daysLeft} дн.`}</span>
						</div>
						<div class="mt-1 flex flex-wrap gap-1">
							{#if k.target.kind === 'rival'}
								{@const lc = leakCost(k.id)}
								{#if lc}
									<ActionButton label="Слить" v={lc} info={leakInfo(rivalName(lc.rivalId), lc)} onclick={() => perform({ type: 'leak', kompromatId: k.id }, rivalName(lc.rivalId))} />
									<span class="self-center text-xs text-muted">репутация цели {lc.targetRepDelta}</span>
								{/if}
							{/if}
							<ActionButton label="Шантаж" v={bc ?? { cost: 0, influence: 0, readyInDays: 0, chance: null, risk: null, error: err({ type: 'blackmail', kompromatId: k.id }) }} info={blackmailInfo(kTarget(k.target), bc)} onclick={() => perform({ type: 'blackmail', kompromatId: k.id })} />
							{#if costs}
								<ActionButton label="Контр-компромат" v={{ ...costs.counterKompromat, error: costs.counterKompromat.error ?? err({ type: 'counterKompromat', kompromatId: k.id }) }} info={counterInfo(costs.counterKompromat)} onclick={() => perform({ type: 'counterKompromat', kompromatId: k.id })} />
							{/if}
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
					<ActionButton label="Работа с Конгрессом" v={costs.congressWork} info={congressInfo(costs.congressWork)} onclick={() => perform({ type: 'congressWork' })} />
					<ActionButton label="Пиар-кампания" v={costs.prCampaign} info={prInfo(costs.prCampaign)} onclick={() => perform({ type: 'prCampaign' })} />
					<ActionButton label="Проверка лояльности" v={costs.loyaltyCheck} info={loyaltyInfo(costs.loyaltyCheck)} onclick={() => perform({ type: 'loyaltyCheck' })} />
				{/if}
			</div>
			<p class="text-xs text-muted">Текущий день: {day}</p>
		</section>
	</div>
</div>
