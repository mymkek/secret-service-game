<script lang="ts">
	import { confirmAction } from '../../lib/ui/confirm.svelte';
	import { buildInfo } from '../../lib/ui/action-info';
	import { BALANCE, selectBranches, selectSurvRollbackFloor, selectDepartments, selectTechTree, validateAction, type PlayerAction } from '../../lib/game/index';
	import { game, fmtMoney } from '../../lib/ui/game.svelte';
	import { stateName } from '../../lib/ui/content';
	import { DEPT_HINT, DEPT_LABEL, TECH_BRANCH, TECH_LABEL, errorText } from '../../lib/ui/labels';
	import { reprLevelNames, survLevelNames, techNames } from '../../lib/content/index';
	import Bar from '../../lib/ui/Bar.svelte';

	const depts = $derived(game.s ? selectDepartments(game.s) : []);
	const br = $derived(game.s ? selectBranches(game.s) : null);
	const techs = $derived(game.s ? selectTechTree(game.s) : []);
	const survFloor = $derived(game.s ? selectSurvRollbackFloor(game.s) : 0);
	const rollbackErr = (key: string, a: PlayerAction) => (key === 'surv' && br && br.surveillance.level <= survFloor && survFloor > 0 ? 'repr_requires_surv' : err(a));
	const day = $derived(game.s?.day ?? 0);
	const research = $derived(game.s?.research ?? null);

	const err = (a: PlayerAction) => (game.s ? validateAction(game.s, a) : null);
	const LEADER_LABEL: Record<string, string> = { rights: 'Правозащитник', blogger: 'Блогер', union: 'Профсоюзный лидер', ex_agent: 'Бывший агент' };
	const BRANCH_ROWS = ['A', 'B', 'C'] as const;
</script>

<div class="space-y-6">
	<section aria-label="Отделы">
		<h2 class="h2">Отделы</h2>
		<div class="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
			{#each depts as d (d.key)}
				<article class="card space-y-2" aria-label={DEPT_LABEL[d.key]}>
					<div class="flex items-baseline justify-between">
						<h3 class="text-lg font-bold">{DEPT_LABEL[d.key]}</h3>
						<span class="text-sm tabular-nums text-gold">ур. {d.level}/{BALANCE.DEPT_MAX_LEVEL}</span>
					</div>
					<p class="text-xs text-muted">{DEPT_HINT[d.key]}</p>
					<div class="flex gap-1" aria-hidden="true">
						{#each { length: BALANCE.DEPT_MAX_LEVEL } as _, i (i)}
							<div class="h-2.5 flex-1 rounded-full {i < d.level ? 'bg-gold' : d.building && i === d.level ? 'animate-pulse bg-warn' : 'bg-surface-1'}"></div>
						{/each}
					</div>
					{#if d.building}
						<p class="text-xs text-warn">Строится ур. {d.building.targetLevel}: ещё {Math.max(0, d.building.doneDay - day)} дн.</p>
					{:else if d.nextCost !== null}
						<button class="btn btn-gold w-full text-xs" disabled={!!d.canBuild} title={errorText(d.canBuild)} onclick={() => confirmAction.ask(buildInfo(DEPT_LABEL[d.key], d.nextCost ?? 0), () => game.act({ type: 'buildDept', dept: d.key }, 'Строительство начато'))}>
							Улучшить до ур. {d.level + 1} — {fmtMoney(d.nextCost)}
						</button>
						{#if d.canBuild}<p class="text-xs text-warn">{errorText(d.canBuild)}</p>{/if}
					{:else}
						<p class="text-xs text-ok">Максимальный уровень</p>
					{/if}
				</article>
			{/each}
		</div>
	</section>

	{#if br}
		<section aria-label="Ветки" class="grid gap-3 lg:grid-cols-2">
			{#each [{ key: 'surv', title: 'Слежка', b: br.surveillance, build: { type: 'buildSurv' }, back: { type: 'rollbackSurv' }, max: BALANCE.SURV_COST_BY_LEVEL.length } as const, { key: 'repr', title: 'Репрессии', b: br.repression, build: { type: 'buildRepr' }, back: { type: 'rollbackRepr' }, max: BALANCE.REPR_COST_BY_LEVEL.length } as const] as x (x.key)}
				<article class="card space-y-2" aria-label={x.title}>
					<div class="flex items-baseline justify-between">
						<h3 class="text-lg font-bold">{x.title}</h3>
						<span class="text-sm text-gold tabular-nums">ур. {x.b.level}/{x.max}</span>
					</div>
					<p class="text-xs text-muted">{(x.key === 'surv' ? survLevelNames : reprLevelNames)[x.b.level] ?? ''}</p>
					<div class="flex gap-1" aria-hidden="true">
						{#each { length: x.max } as _, i (i)}
							<div class="h-2.5 flex-1 rounded-full {i < x.b.level ? 'bg-gold' : x.b.building && i === x.b.level ? 'animate-pulse bg-warn' : 'bg-surface-1'}"></div>
						{/each}
					</div>
					{#if x.key === 'repr'}
						<div class="grid grid-cols-2 gap-3"><Bar label="Контроль" value={br.repression.control} tone="fbi" /><Bar label="Недовольство" value={br.repression.unrest} tone="warn" /></div>
					{/if}
					{#if x.b.building}
						<p class="text-xs text-warn">Строится ур. {x.b.building.targetLevel}: ещё {Math.max(0, x.b.building.doneDay - day)} дн.</p>
					{/if}
					<div class="flex flex-wrap gap-2">
						{#if x.b.nextCost !== null && !x.b.building}
							<button class="btn btn-gold text-xs" disabled={!!x.b.canBuild} title={errorText(x.b.canBuild)} onclick={() => game.act(x.build, 'Строительство начато')}>
								Улучшить — {fmtMoney(x.b.nextCost)}
							</button>
						{/if}
						<button class="btn btn-sm" disabled={!!rollbackErr(x.key, x.back)} title={errorText(rollbackErr(x.key, x.back))} onclick={() => game.act(x.back, 'Уровень снижен')}>Откатить на 1</button>
						{#if rollbackErr(x.key, x.back) === 'repr_requires_surv'}<span class="self-center text-xs text-warn">Сначала откатите репрессии (слежка не ниже {survFloor})</span>{/if}
					</div>
					{#if x.b.canBuild && !x.b.building}<p class="text-xs text-warn">{errorText(x.b.canBuild)}</p>{/if}
				</article>
			{/each}
		</section>

		{#if br.leaders.length}
			<section aria-label="Лидеры протеста" class="card">
				<h2 class="h2">Лидеры протеста</h2>
				<ul class="space-y-1 text-sm">
					{#each br.leaders as l (l.id)}
						<li class="flex items-center justify-between gap-2 rounded-xl bg-surface-1 px-3 py-1.5">
							<span>{LEADER_LABEL[l.archetype] ?? l.archetype} · {stateName(l.stateId)} · влияние <strong>{Math.floor(l.influence)}</strong>{l.underWatch ? ' · под колпаком' : ''}</span>
							<button class="btn btn-sm" disabled={!!err({ type: 'removeLeader', leaderId: l.id })} title={errorText(err({ type: 'removeLeader', leaderId: l.id }))} onclick={() => game.act({ type: 'removeLeader', leaderId: l.id }, 'Лидер устранён')}>Устранить</button>
						</li>
					{/each}
				</ul>
			</section>
		{/if}
	{/if}

	<section aria-label="Технологии">
		<div class="mb-2 flex items-center justify-between">
			<h2 class="h2 mb-0">Дерево технологий</h2>
			{#if research}
				<div class="flex items-center gap-2 text-xs text-warn">
					Идёт: {TECH_LABEL[research.techId]}, ещё {Math.max(0, research.doneDay - day)} дн.
					<button class="btn btn-danger btn-sm" onclick={() => game.act({ type: 'cancelResearch' }, 'Исследование отменено')}>Отменить</button>
				</div>
			{/if}
		</div>
		<div class="space-y-2">
			{#each BRANCH_ROWS as row (row)}
				<div class="grid grid-cols-3 gap-3">
					{#each techs.filter((t) => t.id[0] === row) as t (t.id)}
						<article class="card space-y-1 text-sm {t.known ? 'border-ok' : t.researching ? 'border-warn' : ''} {t.apexLocked ? 'opacity-50' : ''}" aria-label={TECH_LABEL[t.id]}>
							<div class="text-xs text-muted">{TECH_BRANCH[row]}</div>
							<h3 class="text-lg font-bold">{TECH_LABEL[t.id]}</h3>
							<p class="text-xs">{techNames[t.id].description}</p>
							<div class="text-xs text-muted">{fmtMoney(t.cost)} · {t.days} дн.</div>
							{#if t.known}
								<div class="text-xs text-ok">Изучено ✓</div>
							{:else if t.researching}
								<div class="text-xs text-warn">Исследуется…</div>
							{:else}
								<button class="btn btn-gold w-full text-xs" disabled={!!t.canResearch} title={errorText(t.canResearch)} onclick={() => game.act({ type: 'research', tech: t.id }, 'Исследование начато')}>Изучить</button>
								{#if t.canResearch}<div class="text-xs text-warn">{t.apexLocked ? 'Выбрана другая вершина' : errorText(t.canResearch)}</div>{/if}
							{/if}
						</article>
					{/each}
				</div>
			{/each}
		</div>
	</section>
</div>
