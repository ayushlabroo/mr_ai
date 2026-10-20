import { expect, test } from '@playwright/test';

test('review, pause, recover, complete and export a demo brief', async ({ page }) => {
  const externalRequests: string[] = [];
  page.on('request', (request) => {
    if (!new URL(request.url()).hostname.match(/^(127\.0\.0\.1|localhost)$/))
      externalRequests.push(request.url());
  });
  await page.goto('/');
  await page.getByRole('button', { name: /Go down the rabbit hole/ }).click();
  await page.getByRole('button', { name: 'Create task plan' }).click();
  await expect(page.getByRole('button', { name: 'Run demo' })).toBeVisible();
  await page.waitForTimeout(1200);
  await expect(page.getByRole('button', { name: 'Run demo' })).toBeVisible();
  await page.getByRole('button', { name: 'Run demo' }).click();
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Resume demo' })).toBeVisible();
  await page.reload();
  await page.getByRole('button', { name: 'Tasks', exact: true }).click();
  await page.locator('.task-row').click();
  await expect(page.getByRole('button', { name: 'Resume demo' })).toBeVisible();
  await page.getByRole('button', { name: 'Resume demo' }).click();
  await expect(page.getByRole('button', { name: 'Save .md' })).toBeVisible();
  await expect(page.locator('.document-content')).toContainText('No sources have been fetched');
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Save .md' }).click();
  expect((await downloadPromise).suggestedFilename()).toMatch(/\.md$/);
  await page.getByRole('button', { name: 'Files', exact: true }).click();
  await expect(page.locator('.file-card')).toHaveCount(1);
  expect(externalRequests).toEqual([]);
});

test('search, cancel and clear local history with confirmation', async ({ page }) => {
  await page.goto('/');
  await page
    .getByRole('textbox', { name: 'What would you like to get done?' })
    .fill('Compare my planning options');
  await page.getByRole('button', { name: 'Create task plan' }).click();
  await page.getByRole('button', { name: 'Run demo' }).click();
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(page.locator('.task-title-row')).toContainText('Cancelled');
  await page.getByRole('button', { name: 'Search workspace', exact: true }).click();
  await page.getByRole('textbox', { name: 'Search tasks' }).fill('planning');
  await expect(page.getByRole('dialog').locator('.task-row')).toHaveCount(1);
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: /Your workspace Private preview/ }).click();
  await page.getByRole('button', { name: 'Clear local task history' }).click();
  await page.getByRole('button', { name: 'Keep my tasks' }).click();
  await expect(page.locator('.recent-task')).toHaveCount(1);
  await page.getByRole('button', { name: /Your workspace Private preview/ }).click();
  await page.getByRole('button', { name: 'Clear local task history' }).click();
  await page.getByRole('button', { name: 'Clear history', exact: true }).click();
  await expect(page.locator('.recent-task')).toHaveCount(0);
});

test('renders user text as text and never raw markup', async ({ page }) => {
  await page.goto('/');
  await page
    .getByRole('textbox', { name: 'What would you like to get done?' })
    .fill('<img src=x onerror="window.hacked=true">');
  await page.getByRole('button', { name: 'Create task plan' }).click();
  await page.getByRole('button', { name: 'Run demo' }).click();
  await expect(page.locator('.document-content')).toBeVisible();
  expect(await page.evaluate(() => 'hacked' in window)).toBe(false);
  await expect(page.locator('.document-content img')).toHaveCount(0);
});

test('design tokens, utility emission, responsive surfaces and reduced motion', async ({
  page,
}, testInfo) => {
  await page.goto('/styleguide');
  await expect(page.locator('[data-canary-failures]')).toHaveAttribute('data-canary-failures', '0');
  await expect(page.locator('[data-contrast-surprises]')).toHaveAttribute(
    'data-contrast-surprises',
    '0',
  );
  for (const width of [390, 768, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto('/');
    await page.evaluate(() => document.fonts.ready);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      ),
    ).toBeLessThanOrEqual(0);
    await page.screenshot({ path: testInfo.outputPath(`home-${width}.png`), fullPage: true });
    await page
      .locator('.suggestions')
      .screenshot({ path: testInfo.outputPath(`starters-${width}.png`) });
    await page
      .locator('.intro-panel')
      .screenshot({ path: testInfo.outputPath(`intro-${width}.png`) });
  }
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  const duration = await page
    .locator('.new-task-button')
    .evaluate((element) => getComputedStyle(element).transitionDuration);
  expect(parseFloat(duration)).toBeLessThan(0.01);
  await page.setViewportSize({ width: 390, height: 900 });
  await page.getByRole('button', { name: 'Open navigation' }).click();
  await page.getByRole('button', { name: 'Tasks', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Your tasks' })).toBeVisible();
});
