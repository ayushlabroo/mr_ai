import { expect, test } from '@playwright/test';

test('explicit AI consent produces a persisted model draft without exposing credentials', async ({
  page,
}) => {
  await page.addInitScript(() => {
    const state = globalThis as unknown as { draftRequests: unknown[]; savedMarkdown: string };
    state.draftRequests = [];
    const receipt = (id: string) => ({
      id,
      status: 'succeeded' as const,
      provider: 'deepseek',
      model: 'fixture-economy',
      costUsdMicros: 1000,
      debitPreviewUsdMicros: 2000,
      heldUsdMicros: 0,
      markdown:
        '> MrAI AI draft · Test fixture. No web search.\n\n# Team update\n\nA model-written draft from your notes.',
    });
    window.ayra = {
      platform: 'darwin',
      selectWorkspace: async () => null,
      exportDocument: async (document) => {
        state.savedMarkdown = document.markdown;
        return { saved: true };
      },
      gatewayStatus: async () => ({
        connected: true,
        liveEnabled: true,
        models: [
          {
            id: 'fixture-economy',
            provider: 'deepseek',
            tier: 'economy',
            reservationUsdMicros: 10_000,
          },
        ],
        budget: {
          month: '2026-10',
          costUsdMicros: 1000,
          heldUsdMicros: 0,
          limitUsdMicros: 5_000_000,
          blocked: false,
        },
      }),
      startDraft: async (request) => {
        state.draftRequests.push(request);
        return { id: request.id, status: 'queued' };
      },
      getDraft: async (id) => receipt(id),
      cancelDraft: async (id) => ({
        id,
        status: 'uncertain',
        heldUsdMicros: 10_000,
        error: 'Cost needs review.',
      }),
    };
  });
  await page.goto('/');
  await page
    .getByRole('textbox', { name: 'What would you like to get done?' })
    .fill('Draft a team update');
  await page.getByRole('button', { name: 'Create task plan' }).click();
  await page.getByRole('button', { name: 'Review AI draft' }).click();
  await page
    .getByRole('textbox', { name: /Source notes/ })
    .fill('We shipped the prototype this week.');
  expect(
    await page.evaluate(
      () => (globalThis as unknown as { draftRequests: unknown[] }).draftRequests.length,
    ),
  ).toBe(0);
  await page.getByRole('button', { name: 'Send to model' }).click();
  await expect(page.locator('.document-content')).toContainText('A model-written draft');
  await expect(page.locator('.task-type-label')).toHaveText('AI DRAFT');
  expect(
    await page.evaluate(
      () => (globalThis as unknown as { draftRequests: unknown[] }).draftRequests.length,
    ),
  ).toBe(1);
  await page.getByRole('button', { name: 'Save .md' }).click();
  expect(
    await page.evaluate(() => (globalThis as unknown as { savedMarkdown: string }).savedMarkdown),
  ).toContain('A model-written draft');
  await page.reload();
  await page.getByRole('button', { name: 'Files', exact: true }).click();
  await page.locator('.file-card').click();
  await expect(page.locator('.document-content')).toContainText('A model-written draft');
  expect(
    await page.evaluate(
      () => (globalThis as unknown as { draftRequests: unknown[] }).draftRequests.length,
    ),
  ).toBe(0);
});
