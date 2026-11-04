# UI-кит

Svelte 5 (руны), Tailwind. Импорт: `import { Button, Card, Modal, Icon } from '$lib/ui/kit'` (или относительным путём к `kit/index.ts`).
Цвета, радиусы (`rounded-card`, `rounded-btn`, `rounded-modal`), тени (`shadow-elev-1..3`), поверхности (`bg-surface-1..3`),
градиенты (`bg-grad-gold|blue|violet|coral|green|amber|slate`) и шрифты (`font-protocol` = Tinos, `font-ui` = Cousine) заданы в `src/app.css`.
Классы `.btn .btn-gold .btn-danger .btn-ghost .btn-sm .btn-lg .card .card-1 .card-3 .chip .h2` из `app.css` дают тот же вид без компонентов.

| Компонент | Назначение |
|---|---|
| `Button` | `variant` primary/gold/secondary/ghost/danger, `size` sm/md/lg, `icon`, `href` (тогда ссылка) |
| `IconButton` | круглая/квадратная кнопка-иконка, обязательный `label` |
| `Card` | `level` 1 (утопленная) / 2 / 3 (приподнятая), `as` |
| `Modal` | `title` (Tinos), `tone`, `wide`, слот `art` под иллюстрацию (слева у `wide`, сверху у узкого), `footer`; Esc, фокус-ловушка |
| `ConfirmDialog` | подтверждение: что произойдёт, цена, риски, пометка «грязное»; Enter = выполнить, Esc = отмена |
| `Badge` | круглый счётчик (красный счётчик дел) |
| `Chip` | пилюля-метка, `tone`, `icon` |
| `Tabs` | навигация-пилюли по ссылкам, значок-счётчик у вкладки |
| `Tooltip` | подсказка по наведению и фокусу, `aria-describedby` |
| `ProgressBar` | градиентная шкала, `role="progressbar"` |
| `Toast` | уведомление с иконкой в кружке; простой или «богатый» (заголовок, развязка, чипы) |
| `StatTile` | плитка: градиентная иконка + крупное число + подпись |
| `Icon` | 50+ иконок 24x24, линия 1.9, `currentColor` |
| `Illustration` | SVG-иллюстрации диалогов; `questArt(questId)` выбирает иллюстрацию квеста |

```svelte
<Button variant="primary" icon="play" onclick={go}>Пуск</Button>
<Card level={3}>...</Card>
<Modal title="Заголовок" wide onclose={close}>
	{#snippet art()}<Illustration name="hearings" size={176} />{/snippet}
	Текст
	{#snippet footer()}<Button onclick={close}>Закрыть</Button>{/snippet}
</Modal>
<Tooltip id="tip-1">
	<button>Наведи</button>
	{#snippet content()}Текст подсказки{/snippet}
</Tooltip>
```

Подтверждение действий: `confirmAction.ask(info, run)` из `src/lib/ui/confirm.svelte.ts` (окно рисует `ConfirmHost` в layout);
пока окно открыто, игра на паузе, после закрытия пауза возвращается. Описания действий: `src/lib/ui/action-info.ts`.

Иконки: часть путей (gavel, megaphone, map, book, bell, save, log-out, newspaper и др.) близка к Lucide (ISC License, lucide.dev),
остальные нарисованы в том же стиле. Внешних зависимостей и CDN нет. Шрифты: `@fontsource/tinos`, `@fontsource/cousine` (400/700, latin + cyrillic).
