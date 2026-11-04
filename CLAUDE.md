# Менеджер спецслужбы — правила работы агентов

Браузерная стратегия в реальном времени: SvelteKit + Svelte 5 + TS, Tailwind, Drizzle + libSQL/Turso, Vercel. Вся игра крутится в браузере, сервер только хранит партии.

## Источники правды
- `docs/gdd.md` — ГДД (правила, формулы, «Приложение A. Константы баланса»). Пока его нет — `docs/gdd-source.txt` (текст исходного PDF, таблицы местами съехали).
- `docs/decisions.md` — журнал решений.
- `src/lib/game/README.md` — публичный API ядра для UI и симулятора.

## Агенты (`.claude/agents/`) и их зоны

| Этап | Агент | Модель / effort | Пишет в |
|---|---|---|---|
| 1. ГДД, формулы, победы | `gdd-designer` | Opus / high | `docs/gdd.md`, `docs/decisions.md` |
| 2. Ядро: GameState, тикер, RNG, события, ИИ | `core-architect` | Opus / high | `src/lib/game/**` |
| 3. Каркас, БД, деплой | `scaffolder` | Sonnet / medium | конфиги, `src/lib/server/**`, `src/routes/api/**` |
| 4. UI-экраны, карта | `ui-builder` | Sonnet / medium | `src/routes/**`, `src/lib/ui/**` |
| 5. Ключевой контент и шаблоны | `content-writer` | Sonnet / medium | `src/lib/content/**` |
| 5. Массовый контент по шаблону | `content-filler` | Haiku / medium | `src/lib/content/**` |
| 6. Симуляции баланса | `balance-analyst` | Opus / high | `sim/**`, `src/lib/game/balance.ts` |
| 6. Трудные баги | `deep-debugger` | Opus / xhigh | где нужно, с регрессионным тестом |

Агент не правит чужую зону: он описывает, что нужно, а оркестратор передаёт это владельцу.

## Порядок и зависимости
1. `gdd-designer` → `docs/gdd.md` с Приложением A. Без этого ядро не начинать.
2. Параллельно: `core-architect` (ядро + `content-schema.ts`) и `scaffolder` (каркас).
3. Когда есть API ядра и схемы: параллельно `ui-builder` и `content-writer`; после шаблонов — `content-filler`.
4. `balance-analyst` после первой играбельной версии ядра и после каждого крупного изменения ГДД/ядра.
5. `deep-debugger` — только когда первая попытка исправления не сработала.

Обратная связь: вопросы с пометкой `TODO(gdd)` → `gdd-designer`; `TODO(core)` → `core-architect`; правки формул от балансера → `gdd-designer`, затем `core-architect`.

## Инварианты
- Ядро `src/lib/game` — чистый TS без Svelte/DOM, `Math.random()` и `Date.now()`; детерминировано по зерну.
- Числа баланса живут в одном месте: `src/lib/game/balance.ts`, синхронно с Приложением A.
- Контент валидируется zod-схемами из `src/lib/game/content-schema.ts`.
- Отчёт о результате — честный: если тесты или сборка упали, так и написать с выводом.
