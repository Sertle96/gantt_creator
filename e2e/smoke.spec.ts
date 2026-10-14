import { expect, test, type Page } from '@playwright/test';
import ExcelJS from 'exceljs';
import { readFile } from 'node:fs/promises';

const rows = (page: Page) => page.locator('[data-row-id]');
const row = (page: Page, name: string) => rows(page).filter({ hasText: name }).first();
/** Clicks the name of a row (cells hold editable inputs). */
const selectRow = (page: Page, name: string) =>
  row(page, name).getByText(name, { exact: false }).first().click();
const bar = (page: Page, name: string) => page.locator('g.bar-group', { hasText: name }).first();

/** ISO start / end from the editable grid cells (ISO strings compare chronologically). */
async function cellDates(page: Page, name: string): Promise<[string, string]> {
  return [
    await page.getByLabel(`${name}: Start`, { exact: true }).inputValue(),
    await page.getByLabel(`${name}: Ende`, { exact: true }).inputValue(),
  ];
}

async function openSettings(page: Page) {
  await page.getByRole('button', { name: 'Weitere Optionen' }).click();
  await page.getByRole('button', { name: 'Einstellungen' }).click();
}

async function transferMenu(page: Page, entry: string | RegExp) {
  await page.getByRole('button', { name: 'Import / Export' }).click();
  await page.getByRole('button', { name: entry }).click();
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
  await openSettings(page);
  const levelInput = page.getByRole('dialog').locator('input[placeholder="Ebene 1"]');
  await levelInput.fill('Etappe');
  await levelInput.press('Enter');
  await page.keyboard.press('Escape');
  await expect(row(page, 'Konzept')).toContainText('Etappe');

  // Second task next to "Interviews".
  await selectRow(page, 'Interviews');
  await page.keyboard.press('Enter');
  await page.keyboard.type('Workshop');
  await page.keyboard.press('Shift+Enter');
  await expect(rows(page)).toHaveCount(4);

  // Hard link pushes the successor behind the predecessor.
  await linkBars(page, 'Interviews', 'Workshop');
  await expect(page.locator('g.dep')).toHaveCount(1);
  const [, interviewsEnd] = await cellDates(page, 'Interviews');
  const [workshopStart] = await cellDates(page, 'Workshop');
  expect(workshopStart > interviewsEnd).toBe(true);

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
    .getByTitle(/Avatar auf eine Zeile ziehen/)
    .first()
    .dragTo(row(page, 'Workshop').getByText('Workshop'));
  await expect(row(page, 'Workshop')).toContainText('EM');

  // Personal plan: own task plus the predecessor as greyed context.
  await page.getByLabel('Ansicht').selectOption({ label: 'Erika Muster' });
  await expect(rows(page)).toHaveCount(2);
  await expect(page.getByText('Plan von Erika Muster')).toBeVisible();
  await page.getByRole('button', { name: 'Zurück zum Gesamtplan' }).click();

  // Data survives a reload.
  await page.waitForTimeout(800);
  await page.reload();
  await expect(rows(page)).toHaveCount(4);
  await expect(page.locator('g.dep')).toHaveCount(1);

  // Export / import round trip keeps everything.
  const downloadPromise = page.waitForEvent('download');
  await transferMenu(page, 'Exportieren (JSON)');
  const download = await downloadPromise;
  const exported = JSON.parse(await readFile((await download.path())!, 'utf-8'));
  expect(Object.keys(exported.items)).toHaveLength(4);
  expect(exported.project.levelNames[0]).toBe('Etappe');

  const chooserPromise = page.waitForEvent('filechooser');
  await transferMenu(page, 'Importieren (JSON)…');
  await (await chooserPromise).setFiles((await download.path())!);
  await expect(rows(page)).toHaveCount(4);
});

test('undo and redo a bar move', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Beispielprojekt' }).click();
  await page.getByTitle('Zoom und Zeitraum wählen').click();
  await page.getByRole('button', { name: 'Tag', exact: true }).click();
  await selectRow(page, 'Stakeholder');
  const before = await cellDates(page, 'Sitemap');

  const box = (await bar(page, 'Stakeholder').locator('rect').first().boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 34 * 7, box.y + box.height / 2, { steps: 10 });
  await page.mouse.up();

  const after = await cellDates(page, 'Sitemap');
  expect(after[0] > before[0]).toBe(true);
  await page.keyboard.press('Control+z');
  expect(await cellDates(page, 'Sitemap')).toEqual(before);
  await page.keyboard.press('Control+y');
  expect(await cellDates(page, 'Sitemap')).toEqual(after);
});

test('levels, table editing, people picker, bar style and period', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Beispielprojekt' }).click();

  // Show only phases, then phases + workstreams, then everything.
  await page.getByRole('button', { name: 'Phase', exact: true }).click();
  await expect(rows(page)).toHaveCount(3);
  await page.getByRole('button', { name: 'Workstream', exact: true }).click();
  await expect(rows(page)).toHaveCount(11);
  await page.getByRole('button', { name: 'Alle', exact: true }).click();
  await expect(rows(page)).toHaveCount(22);

  // Assign people from the cell dropdown, including a brand-new person.
  await page.getByLabel('Sitemap: Personen zuordnen').click();
  await page.getByRole('menuitemcheckbox', { name: /Anna Berger/ }).click();
  await page.getByPlaceholder('Neue Person anlegen…').fill('Zoe Neu');
  await page.getByPlaceholder('Neue Person anlegen…').press('Enter');
  await page.keyboard.press('Escape');
  await expect(row(page, 'Sitemap')).toContainText('AB');
  await expect(row(page, 'Sitemap')).toContainText('ZN');

  // Edit dates and duration directly in the table; successors follow.
  await page.getByLabel('Sitemap: Ende', { exact: true }).fill('2026-10-21');
  await expect(page.getByLabel('Navigation: Start', { exact: true })).toHaveValue('2026-10-22');
  await page.getByLabel('Navigation: Dauer', { exact: true }).fill('4');
  await page.getByLabel('Navigation: Dauer', { exact: true }).press('Enter');
  await expect(page.getByLabel('Navigation: Ende', { exact: true })).toHaveValue('2026-10-27');

  // Right-click a bar to give it an individual style, then reset it.
  await bar(page, 'Wireframes').locator('rect').nth(1).click({ button: 'right' });
  const popover = page.locator('.menu');
  await expect(popover.getByText('Stil der Ebene „Bereich“')).toBeVisible();
  await page.getByRole('button', { name: 'Schraffiert' }).click();
  await expect(popover.getByText('Individueller Stil')).toBeVisible();
  await expect(bar(page, 'Wireframes').locator('rect[fill^="url(#stripes"]')).toHaveCount(1);
  await page.getByRole('button', { name: 'Auf Ebenen-Stil zurücksetzen' }).click();
  await expect(bar(page, 'Wireframes').locator('rect[fill^="url(#stripes"]')).toHaveCount(0);
  await page.keyboard.press('Escape');

  // Level colour from the project settings applies to the level's bars.
  await openSettings(page);
  await page.getByLabel('Darstellung 2').click();
  await page.getByRole('button', { name: '#0f8b8d' }).click();
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await expect(bar(page, 'Analyse').locator('rect[fill="#0f8b8d"]')).toHaveCount(1);

  // Custom period fits the timeline.
  await page.getByTitle('Zoom und Zeitraum wählen').click();
  const periodMenu = page.locator('.menu');
  await periodMenu.getByLabel('Von', { exact: true }).fill('2026-11-02');
  await periodMenu.getByLabel('Bis', { exact: true }).fill('2026-11-29');
  await page.getByRole('button', { name: 'Anzeigen' }).click();
  await expect(page.getByTitle('Zoom und Zeitraum wählen')).toContainText('02.11.');
  await expect(page.getByTitle('Zoom und Zeitraum wählen')).toHaveAttribute('aria-pressed', 'true');
});

test('create items with the plus line, the bottom row and by drawing in the Gantt', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Beispielprojekt' }).click();
  await expect(rows(page)).toHaveCount(22);

  // "+" line between a workstream and its first child inserts a new first child.
  const stakeholder = (await row(page, 'Stakeholder').boundingBox())!;
  await page.mouse.move(stakeholder.x + 200, stakeholder.y + 1);
  await page.getByRole('button', { name: /hier einfügen/ }).click();
  await page.keyboard.type('Kickoff');
  await page.keyboard.press('Shift+Enter');
  await expect(row(page, 'Kickoff')).toContainText('1.1.1');

  // Bottom row appends a new top-level item.
  await page.getByRole('button', { name: 'Phase hinzufügen' }).click();
  await page.keyboard.type('Betrieb');
  await page.keyboard.press('Shift+Enter');
  await expect(row(page, 'Betrieb')).toContainText('4');

  // Drawing right below the expanded phase "Umsetzung" creates its first child with that range.
  const phase = (await row(page, 'Umsetzung').boundingBox())!;
  const planner = (await page.getByTestId('planner').boundingBox())!;
  const x = planner.x + 680 + 150;
  const y = phase.y + phase.height + 1;
  await page.mouse.move(x, y);
  await expect(page.getByText('Ziehen, um einen neuen Balken anzulegen')).toBeVisible();
  await page.mouse.down();
  await page.mouse.move(x + 60, y, { steps: 5 });
  await page.mouse.move(x + 15 * 9, y, { steps: 5 });
  await page.mouse.up();
  await page.keyboard.type('Gezeichnet');
  await page.keyboard.press('Shift+Enter');
  await expect(row(page, 'Gezeichnet')).toContainText('2.1');
  const [start, end] = await cellDates(page, 'Gezeichnet');
  expect(end > start).toBe(true);
  await expect(rows(page)).toHaveCount(25);

  // Fit button switches to a period covering the whole project.
  await page.getByRole('button', { name: 'Gantt an Projektbreite anpassen' }).click();
  await expect(
    page.getByRole('button', { name: 'Gantt an Projektbreite anpassen' }),
  ).toHaveAttribute('aria-pressed', 'true');
});

test('Excel export, template and import', async ({ page }, testInfo) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Beispielprojekt' }).click();
  await expect(rows(page)).toHaveCount(22);

  // Export: table plus bar chart, in the same layout as the template.
  const exportPromise = page.waitForEvent('download');
  await transferMenu(page, /Excel exportieren/);
  const exported = await exportPromise;
  expect(exported.suggestedFilename()).toMatch(/\.xlsx$/);
  const exportBook = new ExcelJS.Workbook();
  await exportBook.xlsx.readFile((await exported.path())!);
  const plan = exportBook.getWorksheet('Plan')!;
  expect(plan.getCell('A1').value).toBe('Nr.');
  expect(plan.getCell('A3').value).toBe('1.1');
  expect(plan.actualRowCount).toBe(23);

  // Template, filled in like a user would.
  const templatePromise = page.waitForEvent('download');
  await transferMenu(page, /Excel-Vorlage herunterladen/);
  const template = await templatePromise;
  const book = new ExcelJS.Workbook();
  await book.xlsx.readFile((await template.path())!);
  const sheet = book.getWorksheet('Plan')!;
  sheet.getCell('B2').value = 'Phase A';
  sheet.getCell('C3').value = 'Aufgabe 1';
  sheet.getCell('H3').value = new Date(Date.UTC(2026, 0, 5));
  sheet.getCell('J3').value = 3;
  sheet.getCell('K3').value = 'Erika Muster';
  sheet.getCell('C4').value = 'Abnahme';
  sheet.getCell('L4').value = 'Meilenstein';
  sheet.getCell('M4').value = '1.1';
  // Only an end date: becomes a milestone on that date.
  sheet.getCell('B5').value = 'Go-live';
  sheet.getCell('I5').value = new Date(Date.UTC(2026, 0, 30));
  const filled = testInfo.outputPath('Excel Plan.xlsx');
  await book.xlsx.writeFile(filled);

  const importFile = async (file: string) => {
    const chooser = page.waitForEvent('filechooser');
    await transferMenu(page, 'Excel importieren…');
    await (await chooser).setFiles(file);
  };

  // Replace the open project, then undo it.
  await importFile(filled);
  const dialog = page.getByRole('dialog', { name: 'Excel-Import' });
  await expect(dialog).toContainText('4 Elemente');
  await expect(dialog).toContainText('1 Abhängigkeit');
  await dialog.getByRole('button', { name: /Aktuelles Projekt ersetzen/ }).click();
  await expect(rows(page)).toHaveCount(4);
  // Diamond (path) instead of a bar; only the transparent hit area is a rect.
  await expect(bar(page, 'Go-live').locator('path').first()).toHaveAttribute('d', /L/);
  await expect(bar(page, 'Go-live').locator('rect')).toHaveCount(1);
  await expect(row(page, 'Abnahme')).toContainText('1.2');
  await expect(page.locator('g.dep')).toHaveCount(1);
  await expect(row(page, 'Aufgabe 1')).toContainText('EM');
  await page.getByRole('button', { name: 'Rückgängig (Strg+Z)' }).click();
  await expect(rows(page)).toHaveCount(22);

  // Import as a new project named after the file.
  await importFile(filled);
  await dialog.getByRole('button', { name: /Als neues Projekt/ }).click();
  await expect(rows(page)).toHaveCount(4);
  await expect(page.getByRole('button', { name: 'Excel Plan' })).toBeVisible();

  // Mistakes are listed with their row and nothing is imported.
  sheet.getCell('B2').value = null;
  const broken = testInfo.outputPath('broken.xlsx');
  await book.xlsx.writeFile(broken);
  await importFile(broken);
  await expect(page.getByTestId('excel-errors')).toContainText('Zeile 3');
  await expect(page.getByTestId('excel-errors')).toContainText(
    'Ebene 2 ohne übergeordnete Ebene 1',
  );
  await dialog.getByRole('button', { name: 'Schließen' }).last().click();
  await expect(rows(page)).toHaveCount(4);
});
