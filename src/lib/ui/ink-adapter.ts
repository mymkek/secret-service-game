// Адаптер Ink для квестов (README ядра, «Журнал, события, квесты»). Чистый TS без Svelte и DOM.
//
// Схема:
//  - Story строится заново при каждом открытии окна из скомпилированного ink/<id>.ink.json.
//    Сценарии ведёт стадия: они читают core_var("stage"), поэтому восстановление JSON-состояния не нужно;
//    состояние всё равно сохраняется в сессию через setInkState (для диагностики и будущих сценариев).
//  - core_var(name) читает inkVariables(state, session); core_can(id) читает questChoices.
//  - core_choose(id, param) НЕ применяет выбор. Он проверяет его через questChoiceError, при успехе
//    запоминает {choiceId, param} и возвращает "" (Ink показывает текст исхода), при ошибке возвращает её код.
//    Применяет выбор вызывающий код через applyAction(questChoice) уже с param, который выбрал игрок в UI.
//  - Выбору, которому нужен агент или компромат, UI показывает список (needsAgent/needsKompromat) до клика;
//    выбранный id передаётся в choose(index, param) и подставляется в core_choose вместо -1.
import { Story } from 'inkjs';
import {
	inkVariables,
	questChoiceError,
	questChoices,
	setInkState,
	type GameState,
	type QuestChoice,
	type QuestSession
} from '../game/index';

export interface InkChoiceView {
	/** Индекс в story.currentChoices. */
	index: number;
	text: string;
	/** Выбор ядра, соответствующий кнопке (по подписи), если нашёлся. */
	core: QuestChoice | null;
}

export interface AppliedChoice {
	choiceId: string;
	param: number | null;
}

export class InkQuest {
	readonly story: Story;
	/** Текст, накопленный с последнего действия игрока. */
	text: string[] = [];
	choices: InkChoiceView[] = [];
	/** Выбор, зафиксированный через core_choose во время последнего Continue. */
	applied: AppliedChoice | null = null;
	ended = false;

	private pendingParam: number | null = null;

	constructor(
		private state: GameState,
		private session: QuestSession,
		json: string,
		private labels: Record<string, string>
	) {
		this.story = new Story(json.replace(/^﻿/, ''));
		this.bind();
		this.run();
	}

	private bind(): void {
		const st = this.state;
		const q = this.session;
		this.story.BindExternalFunction('core_var', (name: string) => inkVariables(st, q)[name] ?? null, true);
		this.story.BindExternalFunction('core_can', (id: string) => questChoices(st, q).find((c) => c.id === id)?.available ?? false, true);
		this.story.BindExternalFunction(
			'core_choose',
			(id: string, param: number) => {
				const p = param >= 0 ? param : this.pendingParam !== null && this.pendingParam >= 0 ? this.pendingParam : null;
				const err = questChoiceError(st, q, id, p);
				if (err) return err;
				this.applied = { choiceId: id, param: p };
				return '';
			},
			false
		);
	}

	/** Продолжает историю до следующего выбора или конца. */
	private run(): void {
		const lines: string[] = [];
		while (this.story.canContinue) {
			const t = (this.story.Continue() ?? '').trim();
			if (t) lines.push(t);
		}
		this.text = lines;
		const core = questChoices(this.state, this.session);
		this.choices = this.story.currentChoices.map((c) => ({
			index: c.index,
			text: c.text,
			core: this.matchCore(core, c.text)
		}));
		this.ended = this.choices.length === 0 && !this.story.canContinue;
	}

	/**
	 * Сопоставление кнопки Ink с выбором ядра: точное по подписи, иначе по началу до « (». У дилемм подпись
	 * в Ink дополняется живыми числами и метками («… (бесплатно; риск: средний)»), а в данных стоит краткая.
	 */
	private matchCore(core: QuestChoice[], text: string): QuestChoice | null {
		const t = text.trim();
		const exact = core.find((x) => this.labels[x.id] !== undefined && this.labels[x.id].trim() === t);
		if (exact) return exact;
		const head = (v: string) => v.trim().split(' (')[0].trim();
		const byHead = core.filter((x) => this.labels[x.id] !== undefined && head(this.labels[x.id]) === head(t));
		return byHead.length === 1 ? byHead[0] : null;
	}

	/** Игрок нажал на выбор Ink. Возвращает зафиксированный core_choose (или null: выбор не дошёл до ядра). */
	choose(index: number, param: number | null = null): AppliedChoice | null {
		this.applied = null;
		this.pendingParam = param;
		this.story.ChooseChoiceIndex(index);
		this.run();
		this.pendingParam = null;
		return this.applied;
	}

	/** Сохраняет состояние Ink в сессию (setInkState). Вызывается после успешного применения выбора. */
	save(): void {
		setInkState(this.state, this.session.id, this.story.state.toJson());
	}
}
