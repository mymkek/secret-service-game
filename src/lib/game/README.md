# Ядро игры (`src/lib/game`)

Чистый TypeScript без Svelte, DOM, `Math.random()` и `Date.now()`. Детерминировано по зерну: одно зерно и одна последовательность действий всегда дают одинаковый `GameState`. Правила взяты из `docs/gdd.md`, числа — из `balance.ts` (один к одному с «Приложением A»; синхронность проверяет `balance.test.ts`).

UI и симулятор импортируют **только** `src/lib/game/index.ts`, по относительному пути (алиаса `$lib` в каркасе нет):

```ts
import { createGame, advance, applyAction, serialize, deserialize, selectResources } from '../lib/game/index';
```

## Быстрый старт

```ts
const s = createGame({ seed: 'abc' });            // новая партия; стартует на паузе
setPaused(s, false);

// кадр UI: реальное время → игровые дни
const { days, carryMs } = realtimeToDays(s.speed, elapsedMs, carry);
const r = advance(s, days);                        // r.events — новые записи журнала
if (r.stoppedBy === 'autopause') showWindows(s.pauseReasons, selectQuests(s));

// приказ игрока (можно и на паузе)
const res = applyAction(s, 'player', { type: 'startOp', opType: 'investigation', caseId: 42, agentIds: [3, 5] });
if (!res.ok) toast(res.error);                     // коды ошибок см. ниже

// сохранение: saves.state_json
const json = serialize(s);
const loaded = deserialize(json);                  // с миграцией schemaVersion
```

Функции ядра **мутируют** переданный `state` на месте. Это нужно для скорости симулятора: 1000 партий в Node идут примерно за 15 с. Для Svelte держите состояние в `$state.raw(...)` и после каждого `advance`/`applyAction` увеличивайте счётчик версии или переприсваивайте ссылку. Если нужна неизменяемость, используйте `cloneState(s)`.

## Партия и время

| Функция | Что делает |
|---|---|
| `createGame({ seed, config?, speed?, autopause? })` | Новая партия. `config` берётся из контента: `contentToConfig(bundle)` |
| `advance(s, days, { ignorePause?, strategy? })` | Продвигает время до `days` дней. Останавливается на автопаузе и на конце партии. На паузе ничего не делает. Возвращает `{ daysAdvanced, stoppedBy: 'completed'\|'paused'\|'autopause'\|'gameOver', events }` |
| `stepDay(s, { strategy? })` | Один день строго по порядку §3.3 (сам паузу не проверяет) |
| `setPaused(s, bool)` | Пауза. При снятии паузы очищается `s.pauseReasons` |
| `setSpeed(s, 1\|2\|3)` | Скорость. Влияет только на `realtimeToDays` |
| `realtimeToDays(speed, elapsedMs, carryMs)` | Переводит мс в целые дни по `DAY_MS_BY_SPEED`, возвращает остаток |
| `serialize(s)` / `deserialize(json)` | JSON для `saves.state_json`. `SCHEMA_VERSION` (сейчас 4) и `MIGRATIONS` лежат в `state.ts`; сейвы v1–v3 мигрируют автоматически |
| `cloneState(s)` | Глубокая копия |

**Автопауза** (§3.4). Флаги лежат в `s.autopause` (по умолчанию `AUTOPAUSE_DEFAULTS`), их можно менять напрямую из настроек. Причины текущей паузы — в `s.pauseReasons` (ключи `AutopauseKey`).

**Стратегия ИИ** для симулятора: `advance(s, n, { strategy })`, где `strategy: (view: RivalView, rng) => AiActionType | null`. По умолчанию используется `chooseRivalAction` (§6.4). Действие всё равно применяется через `applyAction(s, rivalId, { type: 'ai', action })` (D-027).

## Действия

`applyAction(s, actor, action): { ok: true } | { ok: false, error }`. Здесь `actor` — это `'player'` или id соперника.
`validateAction(s, playerAction): string | null` проверяет, можно ли выполнить действие, ничего не меняя. Подходит, чтобы включать и выключать кнопки.

Действия игрока (`PlayerAction`, поле `type`):

| Экран | Действия |
|---|---|
| Персонал | `hire {candidateId}`, `fire {agentId}`, `setSalary {agentId, mult: 1\|1.25\|1.5}`, `medal {agentId}`, `train {agentId, course: 'skill'\|'language'\|'legend', skill?, countryId?}`, `choosePerk {agentId, perk}` |
| Отделы и ветки | `buildDept {dept}`, `buildSurv`, `rollbackSurv`, `buildRepr`, `rollbackRepr`, `research {tech}`, `cancelResearch` |
| Операции | `startOp {opType, agentIds, caseId? \| target?}`, `reinforceOp {opId, agentId}`, `cancelOp {opId}`, `recallEmbedded {agentId}`, `fakeStats {points}` |
| Конкуренты (§6.3) | `leak {kompromatId}`, `intercept {caseId}`, `sabotage {rivalId}`, `lobby {rivalId}`, `poach {rivalId}`, `congressWork`, `prCampaign`, `absorb {rivalId}`, `counterKompromat {kompromatId}`, `scapegoat {agentId}`, `loyaltyCheck`, `restoreState {stateId}`, `blackmail {kompromatId}`, `removeLeader {leaderId}` |
| Сети (§9.1) | `deployAgent {agentId, countryId, legend, prep, recruit}`, `recallAgent {agentId}` |
| Квесты | `questChoice {sessionId, choice, param?}` |

Цели операций (`OpTarget`): `{kind:'rival', id}`, `{kind:'leader', id}`, `{kind:'senator', id:'senator_1'..}`, `{kind:'president'}`.

Коды ошибок: `game_over`, `no_money`, `no_influence`, `agent_cap`, `agent_busy`, `agent_not_found`, `candidate_not_found`, `requirements`, `max_level`, `min_level`, `already_building`, `already_known`, `already_running`, `research_busy`, `previous_tier`, `apex_locked`, `no_research`, `cooldown`, `skill_cap`, `bad_value`, `bad_target`, `target_required`, `case_not_found`, `case_taken`, `bad_case_kind`, `no_jurisdiction`, `case_not_interceptable`, `not_enough_agents`, `too_many_agents`, `team_full`, `agent_forbids_dirty`, `op_not_found`, `agent_not_embedded`, `agent_not_abroad`, `need_embedded_agent`, `kompromat_not_found`, `fake_limit`, `no_pending_perk`, `quest_not_found`, `choice_not_found`, `choice_unavailable`, `no_idle_agent`, `no_kompromat`, `need_repr5`, `need_legal3`, `kompromat_unavailable`, `bad_actor`, `bad_action`, `rival_dead`, `credit_limit` (запуск операции превысил бы лимит кредита, D-051), `repr_requires_surv` (откат слежки ниже требования активных репрессий, D-054), `rival_collapsing` (действие ИИ «на грани», D-059). У `counterKompromat` теперь бывает `cooldown` (D-057).

**Деньги (D-037, D-051).** Найм, стройка, исследования, действия и платные варианты квестов требуют `budget ≥ цены`. Исключение — запуск операций: он разрешён, пока бюджет после оплаты не ниже `−creditLimit`, где `creditLimit = round(CREDIT_LIMIT_MONTHS × lastIncome)`. В конце месяца, сразу после расходов, на долг начисляется `CREDIT_INTEREST_RATE`. Банкротство — по-прежнему 3 месяца подряд с бюджетом < 0.

## Селекторы (только чтение)

| Селектор | Для экрана |
|---|---|
| `selectDate(s)` | дата, месяц, квартал, пауза, скорость |
| `selectResources(s)` | верхняя панель: шкалы (`Math.floor`), бюджет, `creditLimit`, `debt`, компромат, лимит агентов, доля, шанс скандала, план |
| `selectCredit(s): CreditView` | кредит на операции: `limit`, `debt`, `availableForOps`, `interestRate`, `nextInterest`, `bankruptStreak`, `bankruptMonths`; грейс (D-060): `bankruptGraceMonthsLeft`, `disbandGraceQuartersLeft`, `hardFloor` |
| `selectSurvRollbackFloor(s)` | ниже какого уровня слежку откатить нельзя из-за активных репрессий (D-054) |
| `selectForecast(s)` | доход и расходы ближайшего конца месяца |
| `selectAgents(s)`, `selectHirePool(s)`, `resolveAgentName(agent, names)` | персонал (крот скрыт) |
| `selectCases(s)`, `previewOperation(s, {opType, agentIds, caseId?, target?})`, `selectOperations(s)` | операции: доступность по полномочиям, таймеры, шанс до старта (§5.2), прогресс |
| `selectRivals(s)`, `selectKompromat(s)` | досье на конкурентов, известные действия, компромат; `collapsing` и `disbandDay` — соперник «на грани» (D-059) |
| `selectDepartments(s)`, `selectBranches(s)`, `selectTechTree(s)` | отделы, слежка, репрессии, лидеры, технологии (`canBuild`/`canResearch` — код ошибки или `null`) |
| `selectNetworks(s)`, `selectJurisdiction(s)` | сети за рубежом, карта полномочий |
| `selectActionCosts(s): ActionCosts` | цены, траты влияния, откаты (`readyInDays`), шансы и риски, коды ошибок для `congressWork`, `prCampaign`, `loyaltyCheck`, `counterKompromat`, а также по соперникам: `rivals[id].sabotage/lobby/poach/absorb`; `leak[]` — по каждому предмету компромата |
| `selectDeployCost(s, legend, recruit): DeployCostView`, `selectDeployOptions(s)` | цена заброски (`LEGEND_COST` + деньги на вербовку) и таблица легенд и способов вербовки |
| `selectSenators(s): SenatorView[]` | бюджетный комитет: `id` (ключ имени в контенте), `index`, `resistance`, сложность слежки, компромат, откат шантажа |
| `selectQuests(s)` | открытые сессии с доступными выборами |
| `selectLog(s, limit)` | лента событий (новые сверху) |
| `selectOutcome(s)`, `selectVictoryProgress(s)` | итог партии и прогресс путей победы; `holdDays` у «1984», «Тени» и «Кардинала» (удержание `CARDINAL_HOLD_DAYS`, D-050) |

Формулы доступны как `formulas.*`, например `formulas.scandalChance(e)`.

## Журнал, события, квесты

- `s.log` хранит последние 200 записей вида `LogEntry { id, day, kind, data, source }`. Список `kind` лежит в `LOG_KINDS`; новые виды, для которых в контенте ещё нет текста, — в `PENDING_LOG_KINDS` (сейчас пуст). Тексты к ним пишет контент (`EventTextSchema`, подстановка через `formatEventText`). У действий соперников `source` — это id соперника или `'unknown'`.
- Квесты (§9) — это `s.quests: QuestSession[]`. Ядро открывает сессии (триггеры §9.5–9.6, просьба о прибавке, двойной агент, аэропорт, повторная вербовка источника `recruit_retry` с выбором `money`/`ideology`/`kompromat`), отдаёт выборы `questChoices(s, session)` и применяет выбор по `questChoice`. Тексты и сцены — в Ink. Адаптер Ink регистрирует внешние функции из `INK_EXTERNAL_FUNCTIONS` (`core_var`, `core_can`, `core_choose`), читает `inkVariables(s, session)` и сохраняет состояние сценария через `setInkState(s, id, json)`.
- `autoChoice(s, session)` выбирает первый доступный вариант (для `recruit_retry` — прежний способ, иначе `RECRUIT_FALLBACK_ORDER`, D-042). Нужен симулятору и тестам.
- **Контракт выбора агента и компромата: выбирает UI, не Ink.** Выборы, которым нужен агент (`hearings.scapegoat`, `union_meeting.infiltrate`, см. `QUEST_AGENT_CHOICES`), приходят из `questChoices` с `needsAgent: true` и списком свободных `agentIds`. Выборы, которые тратят компромат (`blogger_docs.discredit`, `informant.kompromat`, `journalist.discredit`, см. `QUEST_KOMPROMAT_CHOICES`), приходят с `needsKompromat: true` и `kompromatIds`. UI показывает список и передаёт выбранный id как `param` в `questChoice`. Ink вызывает `core_choose(choiceId, -1)`: значение `-1` (или отсутствие `param`) означает «выбор за ядром» — первый свободный агент или первый действующий компромат. Неподходящий `param` отклоняется кодом `agent_busy` или `kompromat_not_found`; для проверки без применения есть `questChoiceError(s, session, choiceId, param)`.

## Контент

Из `index.ts` экспортируются `ContentBundleSchema`, `contentToConfig`, `formatEventText`, `INK_EXTERNAL_FUNCTIONS` и типы `ContentBundle`, `InkExternalName`. Остальные схемы лежат в `content-schema.ts`: `TraitContentSchema`, `ChanceCardContentSchema`, `AgentNamesSchema`, `LeaderNamesSchema`, `EventTextSchema`, `CaseTextSchema`, `StateContentSchema`, `SenatorContentSchema` (`resistance` — опционально), `CountryContentSchema`, `QuestContentSchema`. Тексты экранов, которые ядро не читает, — `RivalContentSchema` (досье), `EndingTextSchema` (финалы по кодам `results`), `OperationTextSchema`, `TechContentSchema`, `NewsItemSchema`. Они входят в пакет как **опциональные** разделы `rivals`, `endings`, `operations`, `techs`, `news`.
Для встроенных трейтов и карточек контент даёт только тексты. Новые задают `mechanics` из закрытого набора модификаторов, эффектов и требований (`TraitModifier`, `CardEffect`, `CardRequirement`). `contentToConfig(bundle)` превращает механику в `config` для `createGame`. Механика сохраняется в state, поэтому сейв детерминирован независимо от версии контента.

## Баланс и симулятор

- Все числа — `BALANCE` из `balance.ts`. Объект изменяемый: симулятор может поменять значение до `createGame` (например, `BALANCE.POOL_GROWTH_PER_QUARTER = 0.025`). Это глобальная правка, после прогона значение нужно вернуть.
- Пример бота: `testing/honest-bot.ts` (`honestBotTurn(s)` между вызовами `advance`).
- Полный цикл: `while (s.outcome.status === 'active') { bot(s); advance(s, 3, { ignorePause: true }); }`.

## Модули

| Файл | Содержимое |
|---|---|
| `balance.ts` | `BALANCE` — 421 константа Приложения A (включая `TECH_TREE`, `REPR_REQUIREMENTS` в формате A.0) |
| `types.ts` | `GameState` и все сущности (§11.3), `LOG_KINDS` |
| `rng.ts` | sfc32 + cyrb128, `roll/randInt/randFloat/pickWeighted/shuffle` (§0) |
| `formulas.ts` | все формулы ГДД как чистые функции |
| `state.ts` | `createGame`, сериализация, миграции |
| `clock.ts` | тикер: порядок дня §3.3, конец месяца, выборы, `advance` |
| `effects.ts` | изменения шкал с клампом, журнал, автопауза, мгновенные поражения |
| `agents.ts`, `personnel.ts` | генерация, XP/перки/трейты, зарплаты; лояльность, переходы, кроты, перебежчики |
| `ops.ts` | дела на карте, шанс операции, последствия |
| `economy.ts`, `rivals.ts` | доход/расходы, распределение бюджета, итоги квартала; состояние соперников |
| `society.ts` | засвеченность и скандалы, недовольство, лидеры, контроль, протесты, переворот, «Оттепель» |
| `development.ts` | отделы, слежка, репрессии, технологии, обучение |
| `networks.ts` | сети за рубежом, заброска, внедрённые агенты |
| `ai/strategy.ts`, `ai/actions.ts` | ИИ соперников: стратегия от `RivalView` и исполнение действий |
| `cards.ts` | карточки шанса |
| `quest-core.ts`, `quests.ts` | точки входа квестов, выборы, таймеры этапов, переменные Ink |
| `actions.ts` | `applyAction` / `validateAction` |
| `victory.ts` | 5 путей победы, поражения, тайм-аут |
| `selectors.ts` | селекторы для UI |
| `content-schema.ts` | zod-схемы контента |

## Что упрощено в v1

- Мини-игры детектива (§9.2) и допроса (§9.3) не реализованы: всегда работает обычный бросок §5.2.
- Квест «Обмен пленными» (§9.1) не реализован: пойманный агент просто теряется.
- Svelte-адаптер (`adapter.svelte.ts`) не написан: ядро даёт `realtimeToDays` и `advance`, обёртку на `requestAnimationFrame` делает UI.
- Бонус силы улики от Слежки ≥ 4 (D-045) применяется на старте допроса, а допроса в v1 нет; само поле `evidenceStrength` генерируется.
- Открытых `TODO(gdd)` в коде нет: вопросы первой версии закрыты решениями D-037…D-047.
