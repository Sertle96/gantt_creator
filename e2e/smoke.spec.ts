import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';

const rows = (page: Page) => page.locator('[data-row-id]');
const row = (page: Page, name: string) => rows(page).filter({ hasText: name }).first();
const bar = (page: Page, name: string) => page.locator('g.bar-group', { hasText: name }).first();

/** `dd.mm.yy` from the grid → comparable number. */
function dateValue(text: string): number {
  const [d, m, y] = text.split('.').map(Number);
  return (2000 + y) * 10_000 + m * 100 + d;
}

async function cellDates(page: Page, name: string): Promise<[number, number]> {
  const text = await row(page, name).innerText();
  const dates = text.match(/\d{2}\.\d{2}\.\d{2}/g) ?? [];
  return [dateValue(dates[0]!), dateValue(dates[dates.length - 1]!)];
}

async function linkBars(page: Page, from: string, to: string) {
  await bar(page, from).hover();
  const handle = await bar(page, from).locator('[data-link-side="end"]').boundingBox();
  const target = await bar(page, to).locator('rect').first().boundingBox();
  await page.mouse.move(handle!.x + handle!.width / 2, handle!.y + handle!.height / 2);
  await page.mouse.down();
  await page.mouse.move(target!.x + 4, target!.y + target!.height / 2, { steps: 10 });
  await page.mouse.up();
}

test('plan a project end to end', async ({ page }) => {
  page.on('dialog', (d) => (d.type() === 'prompt' ? d.accept('E2E Projekt') : d.accept()));
  await page.goto('/');
  await page.getByRole('button', { name: 'Neues Projekt' }).click();

  // Outline with the keyboard: Enter = sibling, Tab = indent, Shift+Enter = finish.
  await page.getByRole('button', { name: 'Erstes Element anlegen' }).click();
  await page.keyboard.type('Konzept');
  await page.keyboard.press('Enter');
  await page.keyboard.type('Analyse');
  await page.keyboard.press('Tab');
  await page.keyboard.press('Enter');
  await page.keyboard.type('Interviews');
  await page.keyboard.press('Tab');
  await page.keyboard.press('Shift+Enter');

  await expect(rows(page)).toHaveCount(3);
  await expect(row(page, 'Konzept')).toContainText('1');
  await expect(row(page, 'Interviews')).toContainText('1.1.1');

  // Rename the top level globally.
  await page.getByTitle('Einstellungen').click();
  const levelInput = page.getByRole('dialog').locator('input[placeholder="Ebene 1"]');
  await levelInput.fill('Etappe');
  await levelInput.press('Enter');
  await page.keyboard.press('Escape');
  await expect(row(page, 'Konzept')).toContainText('Etappe');

  // Second task next to "Interviews".
  await row(page, 'Interviews').click();
  await page.keyboard.press('Enter');
  await page.keyboard.type('Workshop');
  await page.keyboard.press('Shift+Enter');
  await expect(rows(page)).toHaveCount(4);

  // Hard link pushes the successor behind the predecessor.
  await linkBars(page, 'Interviews', 'Workshop');
  await expect(page.locator('g.dep')).toHaveCount(1);
  const [, interviewsEnd] = await cellDates(page, 'Interviews');
  const [workshopStart] = await cellDates(page, 'Workshop');
  expect(workshopStart).toBeGreaterThan(interviewsEnd);

  // Chain link toggles hard ↔ soft.
  await page.locator('g.dep-toggle').first().click();
  await expect(page.locator('path.dep-line[stroke-dasharray="5 4"]')).toHaveCount(1);
  await page.locator('g.dep-toggle').first().click();
  await expect(page.locator('path.dep-line[stroke-dasharray="5 4"]')).toHaveCount(0);

  // Critical path highlights bars.
  await page.getByRole('button', { name: /Kritischer Pfad/ }).click();
  await expect(page.locator('g.bar-group rect[fill="var(--critical)"]').first()).toBeVisible();
  await page.getByRole('button', { name: /Kritischer Pfad/ }).click();

  // Team member, assigned by dragging the avatar onto a row.
  await page.getByTitle('Team', { exact: true }).click();
  await page.getByTestId('person-name').fill('Erika Muster');
  await page.getByTestId('side-panel').getByRole('button', { name: 'Person hinzufügen' }).click();
  await page
    .getByTestId('side-panel')
    .getByTitle(/Personen auf eine Zeile/)
    .first()
    .dragTo(row(page, 'Workshop'));
  await expect(row(page, 'Workshop')).toContainText('EM');

  // Personal plan: own task plus the predecessor as greyed context.
  await page.getByLabel('Plan von …').selectOption({ label: 'Erika Muster' });
  await expect(rows(page)).toHaveCount(2);
  await expect(page.getByText('Plan von Erika Muster')).toBeVisible();
  await page.getByRole('button', { name: 'Zurück zum Gesamtplan' }).click();

  // Data survives a reload.
  await page.waitForTimeout(800);
  await page.reload();
  await expect(rows(page)).toHaveCount(4);
  await expect(page.locator('g.dep')).toHaveCount(1);

  // Export / import round trip keeps everything.
  await page.getByRole('button', { name: 'E2E Projekt' }).click();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Exportieren (JSON)' }).click();
  const download = await downloadPromise;
  const exported = JSON.parse(await readFile((await download.path())!, 'utf-8'));
  expect(Object.keys(exported.items)).toHaveLength(4);
  expect(exported.project.levelNames[0]).toBe('Etappe');

  await page.getByRole('button', { name: 'E2E Projekt' }).click();
  const chooserPromise = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Importieren (JSON)…' }).click();
  await (await chooserPromise).setFiles((await download.path())!);
  await expect(rows(page)).toHaveCount(4);
});

test('undo and redo a bar move', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Beispielprojekt' }).click();
  await page.getByRole('button', { name: 'Tag', exact: true }).click();
  await row(page, 'Stakeholder').click();
  const before = await cellDates(page, 'Sitemap');

  const box = (await bar(page, 'Stakeholder').locator('rect').first().boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 34 * 7, box.y + box.height / 2, { steps: 10 });
  await page.mouse.up();

  const after = await cellDates(page, 'Sitemap');
  expect(after[0]).toBeGreaterThan(before[0]);
  await page.keyboard.press('Control+z');
  expect(await cellDates(page, 'Sitemap')).toEqual(before);
  await page.keyboard.press('Control+y');
  expect(await cellDates(page, 'Sitemap')).toEqual(after);
});
