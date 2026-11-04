import { expect, test } from '@playwright/test';

test('главная страница открывается', async ({ page }) => {
	await page.goto('/');
	await expect(page.locator('h1')).toContainText('Менеджер спецслужбы');
	await expect(page.getByRole('button', { name: 'Новая партия' })).toBeVisible();
});

test('новая партия: снять паузу, пройдут дни, сохранить', async ({ page, request }) => {
	await page.goto('/');
	await page.getByLabel(/Зерно/).fill('e2e-smoke');
	await page.getByRole('button', { name: 'Новая партия' }).click();

	// Партия стартует на паузе, день 0.
	const date = page.getByTestId('date');
	await expect(date).toBeVisible();
	await expect(date).toHaveAttribute('data-day', '0');
	await expect(page.getByRole('button', { name: 'Снять паузу' })).toBeVisible();
	await expect(page.getByRole('group', { name: /Карта США/ })).toBeVisible();

	// Скорость ×3 (1 с на день) и снимаем паузу.
	await page.getByRole('button', { name: 'Скорость ×3' }).click();
	await page.getByRole('button', { name: 'Снять паузу' }).click();
	await expect.poll(async () => Number(await date.getAttribute('data-day')), { timeout: 15_000 }).toBeGreaterThanOrEqual(3);

	// Пауза и сохранение через меню.
	await page.getByRole('button', { name: 'Поставить на паузу' }).click();
	const name = `e2e-${Date.now()}`;
	await page.getByRole('button', { name: 'Меню' }).click();
	await page.getByLabel('Название сохранения').fill(name);
	await page.getByRole('button', { name: 'Сохранить', exact: true }).click();
	await expect(page.getByText(`Сохранено: ${name}`)).toBeVisible();

	// Убираем за собой.
	const list = (await (await request.get('/api/saves')).json()) as { id: string; name: string }[];
	const mine = list.find((x) => x.name === name);
	expect(mine).toBeTruthy();
	await request.delete(`/api/saves/${mine!.id}`);
});

test('квест проходит через Ink: выбор, исход, закрытие сессии', async ({ page }) => {
	await page.goto('/?e2e');
	await page.getByLabel(/Зерно/).fill('e2e-quest');
	await page.getByRole('button', { name: 'Новая партия' }).click();
	await expect(page.getByTestId('date')).toBeVisible();

	// Быстро проматываем игровые дни до первого квеста (ядро детерминировано по зерну).
	const found = await page.evaluate(() => {
		const g = (window as any).__game;
		for (let i = 0; i < 60 && g.s.quests.length === 0; i++) {
			g.s.paused = false;
			g.run(10);
			g.popups = [];
		}
		g.s.paused = true;
		g.bump();
		return g.s.quests.length;
	});
	expect(found).toBeGreaterThan(0);

	const dialog = page.getByRole('dialog');
	await expect(dialog).toBeVisible();
	// Ink-сценарий загрузился: кнопки выбора есть, "Загрузка…" исчезла.
	await expect(dialog.getByText('Загрузка…')).toHaveCount(0);
	const before = await page.evaluate(() => (window as any).__game.s.quests.length);
	await dialog.locator('button.btn:not([aria-label="Закрыть окно"])').first().click();

	// Выбор применён ядром, сессия закрыта (или перешла в ожидание), показан исход.
	await expect(page.getByRole('button', { name: 'Понятно' })).toBeVisible();
	await page.getByRole('button', { name: 'Понятно' }).click();
	const after = await page.evaluate(() => (window as any).__game.s.quests.filter((q: any) => q.waitUntilDay === null).length);
	expect(after).toBeLessThan(before);
});
