<script lang="ts">
	import {
		BALANCE,
		PERKS,
		SKILLS,
		selectAgents,
		selectHirePool,
		selectNetworks,
		selectResources,
		validateAction,
		type PlayerAction,
		type SkillKey
	} from '../../lib/game/index';
	import { game, fmtMoney } from '../../lib/ui/game.svelte';
	import { countryName, traitDesc, traitName } from '../../lib/ui/content';
	import { COURSE_LABEL, PERK_LABEL, RANK_LABEL, SKILL_LABEL, STATUS_LABEL, errorText } from '../../lib/ui/labels';

	const agents = $derived(game.s ? selectAgents(game.s) : []);
	const pool = $derived(game.s ? selectHirePool(game.s) : []);
	const res = $derived(game.s ? selectResources(game.s) : null);
	const countries = $derived(game.s ? selectNetworks(game.s).map((n) => n.countryId) : []);

	// Параметры обучения по каждому агенту
	let course = $state<Record<number, 'skill' | 'language' | 'legend'>>({});
	let skill = $state<Record<number, SkillKey>>({});
	let country = $state<Record<number, string>>({});

	const SALARY = [1, 1.25, 1.5];

	function trainAction(id: number): PlayerAction {
		const c = course[id] ?? 'skill';
		return { type: 'train', agentId: id, course: c, skill: c === 'skill' ? (skill[id] ?? 'surveillance') : undefined, countryId: c === 'language' ? (country[id] ?? countries[0]) : undefined };
	}
	const err = (a: PlayerAction) => (game.s ? validateAction(game.s, a) : null);
	const cost = (c: 'skill' | 'language' | 'legend') =>
		c === 'skill' ? BALANCE.TRAINING_SKILL_COST : c === 'language' ? BALANCE.TRAINING_LANGUAGE_COST : BALANCE.TRAINING_LEGEND_COST;
	const days = (c: 'skill' | 'language' | 'legend') =>
		c === 'skill' ? BALANCE.TRAINING_SKILL_DAYS : c === 'language' ? BALANCE.TRAINING_LANGUAGE_DAYS : BALANCE.TRAINING_LEGEND_DAYS;
</script>

<div class="grid gap-4 xl:grid-cols-[minmax(0,1fr)_24rem]">
	<section aria-label="Агенты">
		<h2 class="h2">Агенты {res ? `(${res.agents}/${res.agentCap})` : ''}</h2>
		<div class="grid gap-3 lg:grid-cols-2">
			{#each agents as a (a.id)}
				{@const c = course[a.id] ?? 'skill'}
				<article class="card space-y-2 text-sm" aria-label={game.agentName(a)}>
					<header class="flex items-start justify-between gap-2">
						<div>
							<div class="font-semibold">{game.agentName(a)}</div>
							<div class="text-xs text-muted">{RANK_LABEL[a.rank]} · ур. {a.level} · опыт {Math.floor(a.xp)}</div>
						</div>
						<span class="chip {a.status === 'idle' ? 'border-ok text-ok' : ''}">{STATUS_LABEL[a.status] ?? a.status}</span>
					</header>

					<div class="grid grid-cols-4 gap-1 text-center text-xs">
						{#each SKILLS as k (k)}
							<div class="rounded bg-bg py-1" title={SKILL_LABEL[k]}>
								<div class="text-muted">{SKILL_LABEL[k]}</div>
								<div class="font-semibold tabular-nums">{a.skills[k]}</div>
							</div>
						{/each}
					</div>

					<div class="flex flex-wrap items-center gap-1 text-xs">
						<span class="text-muted">Лояльность</span>
						<span class="font-semibold tabular-nums {a.loyalty < 30 ? 'text-danger' : a.loyalty < 50 ? 'text-warn' : 'text-ok'}">{Math.floor(a.loyalty)}</span>
						<span class="mx-1 text-muted">· зарплата {a.salary} k$/мес</span>
						{#each a.traits as t (t)}<span class="chip" title={traitDesc(t)}>{traitName(t)}</span>{/each}
						{#each a.perks as p (p)}<span class="chip border-gold/50 text-gold">{PERK_LABEL[p] ?? p}</span>{/each}
					</div>

					{#if a.pendingPerks > 0}
						<div class="rounded border border-gold/50 bg-gold/10 p-2">
							<div class="mb-1 text-xs text-gold">Выберите перк ({a.pendingPerks}):</div>
							<div class="flex flex-wrap gap-1">
								{#each PERKS.filter((p) => !a.perks.includes(p)) as p (p)}
									{@const e = err({ type: 'choosePerk', agentId: a.id, perk: p })}
									<button class="btn px-2 py-0.5 text-xs" disabled={!!e} title={errorText(e)} onclick={() => game.act({ type: 'choosePerk', agentId: a.id, perk: p })}>{PERK_LABEL[p]}</button>
								{/each}
							</div>
						</div>
					{/if}

					<div class="flex flex-wrap items-center gap-2">
						<label class="flex items-center gap-1 text-xs text-muted">
							Зарплата
							<select
								class="rounded border border-line bg-bg px-1 py-0.5 text-ink"
								value={a.salaryMult}
								onchange={(e) => game.act({ type: 'setSalary', agentId: a.id, mult: Number(e.currentTarget.value) })}
								aria-label="Множитель зарплаты: {game.agentName(a)}"
							>
								{#each SALARY as m (m)}<option value={m}>×{m}</option>{/each}
							</select>
						</label>
						<button
							class="btn px-2 py-0.5 text-xs"
							disabled={!!err({ type: 'medal', agentId: a.id })}
							title={errorText(err({ type: 'medal', agentId: a.id })) || `Лояльность +${BALANCE.MEDAL_LOYALTY}`}
							onclick={() => game.act({ type: 'medal', agentId: a.id }, 'Медаль вручена')}
						>
							Медаль ({BALANCE.MEDAL_COST} k$)
						</button>
						<button class="btn btn-danger ml-auto px-2 py-0.5 text-xs" onclick={() => game.act({ type: 'fire', agentId: a.id }, 'Агент уволен')}>Уволить</button>
					</div>

					{#if a.status === 'idle'}
						{@const ta = trainAction(a.id)}
						{@const te = err(ta)}
						<div class="flex flex-wrap items-center gap-1 border-t border-line pt-2">
							<span class="text-xs text-muted">Обучение:</span>
							<select class="rounded border border-line bg-bg px-1 py-0.5 text-xs" value={c} onchange={(e) => (course[a.id] = e.currentTarget.value as 'skill')} aria-label="Курс: {game.agentName(a)}">
								{#each ['skill', 'language', 'legend'] as k (k)}<option value={k}>{COURSE_LABEL[k]}</option>{/each}
							</select>
							{#if c === 'skill'}
								<select class="rounded border border-line bg-bg px-1 py-0.5 text-xs" value={skill[a.id] ?? 'surveillance'} onchange={(e) => (skill[a.id] = e.currentTarget.value as SkillKey)} aria-label="Навык">
									{#each SKILLS as k (k)}<option value={k}>{SKILL_LABEL[k]}</option>{/each}
								</select>
							{:else if c === 'language'}
								<select class="rounded border border-line bg-bg px-1 py-0.5 text-xs" value={country[a.id] ?? countries[0]} onchange={(e) => (country[a.id] = e.currentTarget.value)} aria-label="Язык">
									{#each countries as k (k)}<option value={k}>{countryName(k)}</option>{/each}
								</select>
							{/if}
							<button class="btn px-2 py-0.5 text-xs" disabled={!!te} title={errorText(te)} onclick={() => game.act(ta, 'Обучение начато')}>
								{cost(c)} k$ · {days(c)} дн.
							</button>
						</div>
					{/if}
				</article>
			{:else}
				<p class="text-sm text-muted">В штате нет агентов.</p>
			{/each}
		</div>
	</section>

	<section aria-label="Найм" class="space-y-2">
		<h2 class="h2">Кандидаты на найм</h2>
		{#each pool as c (c.id)}
			<article class="card space-y-1 text-sm" aria-label="Кандидат {game.agentName(c)}">
				<div class="flex items-start justify-between gap-2">
					<div>
						<div class="font-semibold">{game.agentName(c)}</div>
						<div class="text-xs text-muted">{RANK_LABEL[c.rank]} · ур. {c.level}</div>
					</div>
					<div class="text-right text-xs">
						<div>Найм: <strong>{fmtMoney(c.hireCost)}</strong></div>
						<div class="text-muted">Зарплата {c.salary} k$/мес</div>
					</div>
				</div>
				<div class="grid grid-cols-4 gap-1 text-center text-xs">
					{#each SKILLS as k (k)}
						<div class="rounded bg-bg py-0.5"><span class="text-muted">{SKILL_LABEL[k][0]}</span> <strong>{c.skills[k]}</strong></div>
					{/each}
				</div>
				<div class="flex flex-wrap items-center gap-1 text-xs">
					{#each c.traits as t (t)}<span class="chip" title={traitDesc(t)}>{traitName(t)}</span>{/each}
					<button
						class="btn btn-gold ml-auto px-3 py-1 text-xs"
						disabled={!!c.canHire}
						title={errorText(c.canHire)}
						onclick={() => game.act({ type: 'hire', candidateId: c.id }, 'Агент принят')}>Нанять</button
					>
				</div>
				{#if c.canHire}<div class="text-xs text-warn">{errorText(c.canHire)}</div>{/if}
			</article>
		{:else}
			<p class="text-sm text-muted">Пул кандидатов пуст — он обновляется раз в квартал.</p>
		{/each}
	</section>
</div>
