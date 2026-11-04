<script lang="ts">
	import { untrack } from 'svelte';
	import { SKILLS, selectBlockingQuest, type QuestChoice, type QuestSession } from '../game/index';
	import { game } from './game.svelte';
	import { Modal, Illustration, Button, Chip, questArt } from './kit';
	import { InkQuest, type InkChoiceView } from './ink-adapter';
	import { choiceLabel, content, dilemmaBody, dilemmaDef, questScene, questTitle } from './content';
	import { RISK_LABEL, errorText } from './labels';

	type Quest = QuestSession & { choices: QuestChoice[] };
	let { quest: live }: { quest: Quest | null } = $props();
	// Сессия закрывается самим выбором, и родитель на мгновение отдаёт null: держим последнюю живую копию.
	let quest = $state.raw<Quest>(untrack(() => live!));
	$effect.pre(() => {
		if (live) quest = live;
	});

	// Скомпилированные сценарии (scripts/compile-ink.mjs), грузятся лениво.
	const loaders = import.meta.glob('../content/ink/*.ink.json', { query: '?raw', import: 'default' }) as Record<string, () => Promise<string>>;

	interface View {
		text: string[];
		choices: InkChoiceView[];
		ended: boolean;
	}

	let ink: InkQuest | null = null;
	let view = $state.raw<View | null>(null);
	let failed = $state(false);
	let nonce = $state(0);
	/** Выбранный агент/компромат по ключу выбора (index Ink или id ядра в запасном режиме). */
	let sel = $state<Record<string, string>>({});

	/** Модальное окно дилеммы или линейки: время стоит до выбора, поэтому закрыть его «на потом» нельзя. */
	const blocking = $derived(!!game.s && selectBlockingQuest(game.s)?.id === quest.id);
	const def = $derived(dilemmaDef(quest.questId));
	const isDilemma = $derived(quest.questId.startsWith('dilemma_') || quest.questId.startsWith('vanguard_'));
	/** Запасной текст сцены: контент дилеммы, запасное описание или сцена questScripts. */
	const fallbackBody = $derived.by(() => {
		if (quest.questId === 'vanguard_result') return content.line?.outcomes[String(quest.params.outcome) as keyof NonNullable<typeof content.line>['outcomes']] ?? dilemmaBody(quest.questId);
		if (quest.questId === 'vanguard_offer' && quest.stage === 'partner') return questScene(quest.questId, quest.stage).body || dilemmaBody(quest.questId);
		return isDilemma ? dilemmaBody(quest.questId) : questScene(quest.questId, quest.stage).body;
	});

	// Решение принимается на паузе, в том числе когда окно открыто заново кнопкой «Решения».
	$effect(() => untrack(() => game.pause()));

	const labels = $derived({ ...content.quests.find((q) => q.questId === quest.questId)?.choiceLabels });

	function snapshot() {
		if (ink) view = { text: ink.text, choices: ink.choices, ended: ink.ended };
	}

	$effect(() => {
		const id = quest.id;
		const stage = quest.stage;
		void stage;
		void nonce;
		let cancelled = false;
		untrack(async () => {
			ink = null;
			view = null;
			failed = false;
			try {
				const path = content.quests.find((q) => q.questId === quest.questId)?.ink ?? `ink/${quest.questId}.ink.json`;
				const load = loaders[`../content/${path}`];
				if (!load) throw new Error(`нет скомпилированного сценария: ${path}`);
				const json = await load();
				const st = game.s;
				const session = st?.quests.find((x) => x.id === id);
				if (cancelled || !st || !session) return;
				ink = new InkQuest(st, session, json, labels);
				snapshot();
			} catch (e) {
				// Для дилемм без Ink-сцены это штатный режим: тексты берутся из content.dilemmas или запасных.
				if (!isDilemma) console.warn('Ink недоступен, запасной режим questScripts:', e);
				if (!cancelled) failed = true;
			}
		});
		return () => {
			cancelled = true;
		};
	});

	function idsOf(c: QuestChoice | null): number[] {
		return c ? (c.needsAgent ? (c.agentIds ?? []) : c.needsKompromat ? (c.kompromatIds ?? []) : []) : [];
	}
	const needsParam = (c: QuestChoice | null) => !!c && (!!c.needsAgent || !!c.needsKompromat);
	const paramFor = (key: string, c: QuestChoice | null): number | null => {
		if (!needsParam(c)) return null;
		const v = sel[key];
		return v !== undefined && v !== '' ? Number(v) : (idsOf(c)[0] ?? null);
	};
	/** Подпись выбора агента. Для линейки добавляем лучший навык: ведущему нужен навык 7 и выше. */
	const optionName = (c: QuestChoice, id: number) => {
		if (!c.needsAgent) return `Компромат #${id}`;
		const a = game.s?.agents.find((x) => x.id === id);
		const best = a ? Math.max(...SKILLS.map((k) => a.skills[k])) : null;
		return quest.questId.startsWith('vanguard_') && best !== null ? `${game.agentNameById(id)} · лучший навык ${best}` : game.agentNameById(id);
	};
	const agentRole = (c: QuestChoice | null) => (quest.questId === 'vanguard_offer' ? (c?.id === 'partner' ? 'Напарник' : 'Ведущий (навык 7 и выше)') : 'Агент');

	function finish(choiceId: string, param: number | null, text: string[]) {
		const err = game.act({ type: 'questChoice', sessionId: quest.id, choice: choiceId, param: param ?? undefined });
		if (err) {
			nonce++; // пересобрать сценарий из актуального состояния
			return false;
		}
		ink?.save();
		if (text.length) game.questResult = { title: questTitle(quest.questId), text };
		return true;
	}

	function pick(c: InkChoiceView) {
		if (!ink) return;
		const applied = ink.choose(c.index, paramFor(String(c.index), c.core));
		if (applied) finish(applied.choiceId, applied.param, ink.text);
		else snapshot();
	}

	function pickFallback(c: QuestChoice) {
		const scene = questScene(quest.questId, quest.stage);
		const outcome = scene.outcomes[c.id] ?? def?.choices.find((x) => x.id === c.id)?.outcome;
		finish(c.id, paramFor(c.id, c), outcome ? [outcome] : []);
	}
</script>

<!-- text: подпись кнопки Ink; если сценарий уже называет риск, шанс или «грязное», дублирующий чип не рисуем. -->
{#snippet meta(c: QuestChoice | null, text = '')}
	{#if c}
		{@const dirty = c.dirty && !text.includes('грязн')}
		{@const risk = c.risk && !text.includes('риск') ? c.risk : null}
		{@const chance = c.chance !== undefined && !text.includes('%') ? c.chance : null}
		{@const blocked = !c.available && c.reason}
		{#if dirty || risk || chance !== null || blocked}
			<span class="flex flex-wrap items-center gap-1.5 px-1" data-testid="choice-meta">
				{#if dirty}<Chip tone="danger" icon="warning" title="Грязное действие: добавит «Под следствием» и закроет путь победы «Чистые руки»">грязное</Chip>{/if}
				{#if risk}<Chip tone={risk === 'high' ? 'danger' : risk === 'medium' ? 'warn' : 'ok'} icon="exposure" title="Скрытый риск последствий; точный шанс игре не раскрывается">риск: {RISK_LABEL[risk]}</Chip>{/if}
				{#if chance !== null}<Chip tone={chance >= 0.65 ? 'ok' : chance >= 0.4 ? 'warn' : 'danger'} icon="dice" title="Шанс успеха этапа">шанс {Math.round(chance * 100)} %</Chip>{/if}
				{#if blocked}<Chip tone="warn" title="Сейчас недоступно">{errorText(c.reason)}</Chip>{/if}
			</span>
		{/if}
	{/if}
{/snippet}

<Modal title={questTitle(quest.questId)} tone="warn" wide onclose={blocking ? undefined : () => game.dismissQuest(quest.id)}>
	{#snippet art()}<Illustration name={questArt(quest.questId)} size={176} />{/snippet}
	{#if view}
		{#each view.text as p, i (i)}<p class="font-protocol text-lg leading-relaxed">{p}</p>{/each}
		<div class="flex flex-col gap-2">
			{#each view.choices as c (c.index)}
				<div class="flex flex-col gap-1">
					{#if needsParam(c.core)}
						<label class="flex items-center gap-2 text-xs text-muted">
							{c.core?.needsAgent ? agentRole(c.core) : 'Компромат'}:
							<select class="flex-1" value={sel[String(c.index)] ?? String(idsOf(c.core)[0] ?? '')} onchange={(e) => (sel[String(c.index)] = e.currentTarget.value)}>
								{#each idsOf(c.core) as id (id)}<option value={String(id)}>{optionName(c.core!, id)}</option>{/each}
							</select>
						</label>
					{/if}
					<Button class="justify-start !py-3 text-left" disabled={c.core ? !c.core.available : false} onclick={() => pick(c)}>{c.text}</Button>
					{@render meta(c.core, c.text)}
				</div>
			{/each}
			<!-- Варианты, которые Ink скрыл по условию (core_can), показываем недоступными: игроку важно видеть, что они есть. -->
			{#each quest.choices.filter((q) => !q.available && !view!.choices.some((v) => v.core?.id === q.id)) as c (c.id)}
				<div class="flex flex-col gap-1">
					<Button class="justify-start !py-3 text-left" disabled>{choiceLabel(quest.questId, c.id)}</Button>
					{@render meta(c)}
				</div>
			{/each}
			{#if view.choices.length === 0}<p class="text-muted">Решение уже принято, ждём развития событий.</p>{/if}
		</div>
	{:else if failed}
		<!-- Запасной режим: Ink-сценария нет, показываем текст из content.dilemmas, questScripts или запасной. -->
		<p class="font-protocol text-lg leading-relaxed">{fallbackBody}</p>
		{#if def?.realCase}<p class="font-protocol text-base text-muted italic">{def.realCase}</p>{/if}
		<div class="flex flex-col gap-2">
			{#each quest.choices as c (c.id)}
				<div class="flex flex-col gap-1">
					{#if needsParam(c) && c.available}
						<label class="flex items-center gap-2 text-xs text-muted">
							{c.needsAgent ? agentRole(c) : 'Компромат'}:
							<select class="flex-1" value={sel[c.id] ?? String(idsOf(c)[0] ?? '')} onchange={(e) => (sel[c.id] = e.currentTarget.value)} aria-label="Выбор для: {choiceLabel(quest.questId, c.id)}">
								{#each idsOf(c) as id (id)}<option value={String(id)}>{optionName(c, id)}</option>{/each}
							</select>
						</label>
					{/if}
					<Button class="justify-start !py-3 text-left" disabled={!c.available} onclick={() => pickFallback(c)}>{choiceLabel(quest.questId, c.id)}</Button>
					{#if def?.choices.find((x) => x.id === c.id)?.argument}<p class="px-1 text-sm text-muted">{def.choices.find((x) => x.id === c.id)?.argument}</p>{/if}
					{@render meta(c)}
				</div>
			{/each}
		</div>
	{:else}
		<p class="text-muted">Загрузка…</p>
	{/if}

	{#snippet footer()}
		{#if blocking}
			<!-- Модальное окно: время стоит до выбора, поэтому «Решить позже» нет. -->
			<Chip tone="warn" icon="clock">Время стоит, пока вы не примете решение</Chip>
		{:else}
			<Button size="sm" icon="clock" onclick={() => game.dismissQuest(quest.id)}>Решить позже</Button>
		{/if}
	{/snippet}
</Modal>
