<script lang="ts">
	import { untrack } from 'svelte';
	import type { QuestChoice, QuestSession } from '../game/index';
	import { game } from './game.svelte';
	import Modal from './Modal.svelte';
	import { InkQuest, type InkChoiceView } from './ink-adapter';
	import { choiceLabel, content, questScene, questTitle } from './content';
	import { errorText } from './labels';

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
				console.warn('Ink недоступен, запасной режим questScripts:', e);
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
	const optionName = (c: QuestChoice, id: number) => (c.needsAgent ? game.agentNameById(id) : `Компромат #${id}`);

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
		finish(c.id, paramFor(c.id, c), scene.outcomes[c.id] ? [scene.outcomes[c.id]] : []);
	}
</script>

<Modal title={questTitle(quest.questId)} tone="warn" onclose={() => game.dismissQuest(quest.id)}>
	{#if view}
		{#each view.text as p, i (i)}<p>{p}</p>{/each}
		<div class="flex flex-col gap-2">
			{#each view.choices as c (c.index)}
				<div class="flex flex-col gap-1">
					{#if needsParam(c.core)}
						<label class="flex items-center gap-2 text-xs text-muted">
							{c.core?.needsAgent ? 'Агент' : 'Компромат'}:
							<select class="flex-1 rounded border border-line bg-bg px-2 py-1 text-ink" value={sel[String(c.index)] ?? String(idsOf(c.core)[0] ?? '')} onchange={(e) => (sel[String(c.index)] = e.currentTarget.value)}>
								{#each idsOf(c.core) as id (id)}<option value={String(id)}>{optionName(c.core!, id)}</option>{/each}
							</select>
						</label>
					{/if}
					<button class="btn justify-start text-left" onclick={() => pick(c)}>{c.text}</button>
				</div>
			{/each}
			{#if view.choices.length === 0}<p class="text-muted">Решение уже принято, ждём развития событий.</p>{/if}
		</div>
	{:else if failed}
		<!-- Запасной режим: Ink-сценарий не загрузился, показываем сцену из questScripts. -->
		<p>{questScene(quest.questId, quest.stage).body}</p>
		<div class="flex flex-col gap-2">
			{#each quest.choices as c (c.id)}
				{#if needsParam(c) && c.available}
					<select class="rounded border border-line bg-bg px-2 py-1 text-xs" value={sel[c.id] ?? String(idsOf(c)[0] ?? '')} onchange={(e) => (sel[c.id] = e.currentTarget.value)} aria-label="Выбор для: {choiceLabel(quest.questId, c.id)}">
						{#each idsOf(c) as id (id)}<option value={String(id)}>{optionName(c, id)}</option>{/each}
					</select>
				{/if}
				<button class="btn justify-start text-left" disabled={!c.available} title={c.available ? '' : errorText(c.reason)} onclick={() => pickFallback(c)}>
					{choiceLabel(quest.questId, c.id)}{c.available ? '' : ` — ${errorText(c.reason)}`}
				</button>
			{/each}
		</div>
	{:else}
		<p class="text-muted">Загрузка…</p>
	{/if}

	{#snippet footer()}
		<button class="btn text-xs" onclick={() => game.dismissQuest(quest.id)}>Решить позже</button>
	{/snippet}
</Modal>
