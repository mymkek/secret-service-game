// Публичный API ядра. UI и симулятор импортируют только отсюда (описание — README.md).
export { BALANCE, type Balance } from './balance';
export { createGame, serialize, deserialize, cloneState, migrate, SCHEMA_VERSION, type NewGameOptions } from './state';
export {
	advance,
	stepDay,
	setPaused,
	setSpeed,
	realtimeToDays,
	type AdvanceOptions,
	type AdvanceResult,
	type RivalStrategy
} from './clock';
export {
	applyAction,
	validateAction,
	type PlayerAction,
	type RivalAction,
	type GameAction,
	type ActionResult
} from './actions';
export { buildRivalView, chooseRivalAction, aiActionWeights, AI_ACTIONS, type AiActionType, type RivalView } from './ai/strategy';
export {
	autoChoice,
	questChoices,
	questChoiceError,
	inkVariables,
	setInkState,
	QUEST_IDS,
	QUEST_AGENT_CHOICES,
	QUEST_KOMPROMAT_CHOICES,
	type QuestChoice
} from './quests';
export {
	contentToConfig,
	formatEventText,
	ContentBundleSchema,
	INK_EXTERNAL_FUNCTIONS,
	type ContentBundle,
	type InkExternalName
} from './content-schema';
export * from './selectors';
export { victoryConditions } from './victory';
export * as formulas from './formulas';
export * from './types';
