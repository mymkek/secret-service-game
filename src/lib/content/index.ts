// Бандл контента: единственная точка входа для UI и симулятора.
//   import { content } from '$lib/content';
// `content` прогнан через ContentBundleSchema.parse (bundle.ts). Прежние экспорты текстов экранов
// (rivalDossiers, victoryTexts, defeatTexts, opTexts, techNames, news) выводятся из этого бандла (views.ts).
export { content, inkPath, questScripts } from './bundle';
export type { QuestScript } from './bundle';
export { eventTexts } from './events';
export { logTemplateData, renderLogEntry } from './log-text';
export type { RenderContext, RenderedLog } from './log-text';
export * from './texts';
export { defeatTexts, news, opTexts, rivalDossiers, techNames, victoryTexts } from './views';
