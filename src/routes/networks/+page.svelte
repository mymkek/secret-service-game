<script lang="ts">
	import { selectDeployCost, selectDeployOptions, selectNetworks, validateAction, type Legend, type PlayerAction, type RecruitMethod } from '../../lib/game/index';
		import { game, fmtMoney } from '../../lib/ui/game.svelte';
	import { countryName } from '../../lib/ui/content';
	import { LEGEND_LABEL, RECRUIT_LABEL, errorText } from '../../lib/ui/labels';
	import Bar from '../../lib/ui/Bar.svelte';

	const nets = $derived(game.s ? selectNetworks(game.s) : []);
	const hasB1 = $derived(game.s?.techs.includes('B1') ?? false);
	const day = $derived(game.s?.day ?? 0);
	const idle = $derived((game.s?.agents ?? []).filter((a) => a.status === 'idle'));
	const abroad = $derived((game.s?.agents ?? []).filter((a) => a.status === 'abroad'));
	const embedded = $derived((game.s?.agents ?? []).filter((a) => a.status === 'embedded'));

	let agentId = $state('');
	let countryId = $state('');
	let legend = $state<Legend>('diplomat');
	let recruit = $state<RecruitMethod>('money');
	let prep = $state(true);

	const action = $derived<PlayerAction | null>(
		agentId && (countryId || nets[0])
			? { type: 'deployAgent', agentId: Number(agentId), countryId: countryId || nets[0].countryId, legend, prep, recruit }
			: null
	);
	const opts = $derived(game.s ? selectDeployOptions(game.s) : null);
	const dcost = $derived(game.s ? selectDeployCost(game.s, legend, recruit) : null);
	const e = $derived(action && game.s ? validateAction(game.s, action) : null);

	const STAGE: Record<string, string> = { prep: 'подготовка', infiltrate: 'переход границы', recruit: 'вербовка', recall: 'возвращение' };
</script>

<div class="space-y-4">
	{#if !hasB1}
		<p class="rounded border border-warn bg-warn/10 px-3 py-2 text-sm text-warn">Сети за рубежом открываются технологией B1 («Разведка»). Изучите её на экране «Отделы и технологии».</p>
	{/if}

	<section class="grid gap-3 md:grid-cols-2 xl:grid-cols-3" aria-label="Сети">
		{#each nets as n (n.countryId)}
			<article class="card space-y-2 text-sm" aria-label={countryName(n.countryId)}>
				<div class="flex items-baseline justify-between">
					<h2 class="font-semibold">{countryName(n.countryId)}</h2>
					<span class="text-gold tabular-nums">ур. {n.level}</span>
				</div>
				<Bar label="Прогресс сети" value={Math.round(n.progress * 100)} suffix="%" tone="fbi" />
				<div class="text-xs text-muted">Агентов в сети: {n.agentIds.length}{n.doubleAgentActive ? ' · есть двойной агент!' : ''}{n.purgeUntilDay > day ? ` · чистка ещё ${n.purgeUntilDay - day} дн.` : ''}</div>
				{#each n.missions as m (m.id)}
					<div class="rounded bg-bg px-2 py-1 text-xs">
						{game.agentNameById(m.agentId)}: {STAGE[m.stage] ?? m.stage}, ещё {Math.max(0, m.stageEndDay - day)} дн. · {LEGEND_LABEL[m.legend]}, {RECRUIT_LABEL[m.recruit]}
					</div>
				{/each}
			</article>
		{/each}
	</section>

	<section class="card space-y-3" aria-label="Заброска агента">
		<h2 class="h2">Заброска агента</h2>
		<div class="flex flex-wrap items-end gap-3 text-sm">
			<label class="flex flex-col gap-1"><span class="text-xs text-muted">Агент</span>
				<select class="rounded border border-line bg-bg px-2 py-1.5" bind:value={agentId}>
					<option value="">Выберите…</option>
					{#each idle as a (a.id)}<option value={String(a.id)}>{game.agentName(a)}</option>{/each}
				</select>
			</label>
			<label class="flex flex-col gap-1"><span class="text-xs text-muted">Страна</span>
				<select class="rounded border border-line bg-bg px-2 py-1.5" bind:value={countryId}>
					{#each nets as n (n.countryId)}<option value={n.countryId}>{countryName(n.countryId)}</option>{/each}
				</select>
			</label>
			<label class="flex flex-col gap-1"><span class="text-xs text-muted">Легенда</span>
				<select class="rounded border border-line bg-bg px-2 py-1.5" bind:value={legend}>
					{#each opts?.legends ?? [] as l (l.legend)}<option value={l.legend}>{LEGEND_LABEL[l.legend]} — {fmtMoney(l.cost)}</option>{/each}
				</select>
			</label>
			<label class="flex flex-col gap-1"><span class="text-xs text-muted">Вербовка источника</span>
				<select class="rounded border border-line bg-bg px-2 py-1.5" bind:value={recruit}>
					{#each opts?.recruit ?? [] as r (r.method)}<option value={r.method} disabled={!r.available}>{RECRUIT_LABEL[r.method]}{r.cost ? ` — ${fmtMoney(r.cost)}` : ''} · шанс {Math.round(r.chance * 100)}%{r.available ? '' : ' (недоступно)'}</option>{/each}
				</select>
			</label>
			<label class="flex items-center gap-2 pb-2"><input type="checkbox" bind:checked={prep} class="accent-[var(--color-gold)]" /> Подготовка</label>
			<button class="btn btn-gold" disabled={!action || !!e || !dcost?.canAfford} title={errorText(e)} onclick={() => action && game.act(action, 'Агент заброшен')}>Забросить</button>
		</div>
		{#if action && e}<p class="text-xs text-warn">{errorText(e)}</p>{/if}
		{#if dcost}
			<p class="text-sm">Итого: <strong class={dcost.canAfford ? 'text-gold' : 'text-danger'}>{fmtMoney(dcost.total)}</strong> <span class="text-xs text-muted">(легенда {fmtMoney(dcost.legendCost)}{dcost.recruitCost ? `, вербовка ${fmtMoney(dcost.recruitCost)}` : ''}){dcost.canAfford ? '' : ' — не хватает денег'}</span></p>
		{/if}
		{#if opts}<p class="text-xs text-muted">Подготовка: {opts.prepDays} дн., бонус к успеху {Math.round(opts.prepBonus * 100)}%.</p>{/if}
	</section>

	{#if abroad.length || embedded.length}
		<section class="card space-y-2" aria-label="Агенты за пределами штаб-квартиры">
			<h2 class="h2">Отозвать агентов</h2>
			<ul class="space-y-1 text-sm">
				{#each abroad as a (a.id)}
					<li class="flex items-center justify-between rounded border border-line bg-bg px-2 py-1">
						<span>{game.agentName(a)} — за рубежом</span>
						<button class="btn px-2 py-0.5 text-xs" onclick={() => game.act({ type: 'recallAgent', agentId: a.id }, 'Агент отозван')}>Отозвать</button>
					</li>
				{/each}
				{#each embedded as a (a.id)}
					<li class="flex items-center justify-between rounded border border-line bg-bg px-2 py-1">
						<span>{game.agentName(a)} — внедрён</span>
						<button class="btn px-2 py-0.5 text-xs" onclick={() => game.act({ type: 'recallEmbedded', agentId: a.id }, 'Агент отозван')}>Отозвать</button>
					</li>
				{/each}
			</ul>
		</section>
	{/if}
</div>
