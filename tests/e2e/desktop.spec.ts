import { expect, test, _electron as electron } from '@playwright/test';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { startFixtureGateway, FIXTURE_MARKDOWN } from '../support/fixture-gateway.mjs';

function nativeEnvironment(gateway?: { origin: string; token: string }) {
  return {
    ...process.env,
    ELECTRON_RUN_AS_NODE: '',
    AYRA_DEV_URL: '',
    AYRA_GATEWAY_URL: gateway?.origin ?? '',
    AYRA_GATEWAY_TOKEN: gateway?.token ?? '',
    DEEPSEEK_API_KEY: '',
    ANTHROPIC_API_KEY: '',
  };
}

test('native app loads with isolated renderer and supports explicit folder and save dialogs', async ({}, testInfo) => {
  const temporary = await mkdtemp(path.join(os.tmpdir(), 'ayra-desktop-'));
  let app: Awaited<ReturnType<typeof electron.launch>> | undefined;
  try {
    app = await electron.launch({
      args: ['.', `--user-data-dir=${path.join(temporary, 'profile')}`],
      env: nativeEnvironment(),
    });
    const page = await app.firstWindow();
    await expect(page.getByRole('heading', { name: /Big ideas/ })).toBeVisible();
    expect(await page.evaluate(() => typeof window.ayra?.selectWorkspace)).toBe('function');
    expect(await page.evaluate(() => 'require' in window)).toBe(false);
    expect(await page.evaluate(() => window.ayra!.gatewayStatus())).toMatchObject({
      connected: false,
      liveEnabled: false,
      models: [],
    });
    const preferences = await app.evaluate(({ BrowserWindow }) => {
      const contents = BrowserWindow.getAllWindows()[0].webContents as unknown as {
        getLastWebPreferences: () => {
          sandbox: boolean;
          contextIsolation: boolean;
          nodeIntegration: boolean;
        };
      };
      return contents.getLastWebPreferences();
    });
    expect(preferences.sandbox).toBe(true);
    expect(preferences.contextIsolation).toBe(true);
    expect(preferences.nodeIntegration).toBe(false);
    await app.evaluate(({ dialog }, folder) => {
      dialog.showOpenDialog = (async () => ({
        canceled: false,
        filePaths: [folder],
      })) as typeof dialog.showOpenDialog;
    }, temporary);
    await page.getByRole('button', { name: 'Add a folder' }).click();
    await expect(page.locator('.folder-button')).toContainText(path.basename(temporary));
    await page
      .getByRole('textbox', { name: 'What would you like to get done?' })
      .fill('Research a thoughtful project');
    await page.getByRole('button', { name: 'Create task plan' }).click();
    await page.getByRole('button', { name: 'Run demo' }).click();
    await expect(page.getByRole('button', { name: 'Save .md' })).toBeVisible();
    const output = path.join(temporary, 'brief.md');
    await app.evaluate(({ dialog }, filePath) => {
      dialog.showSaveDialog = (async () => ({
        canceled: false,
        filePath,
      })) as typeof dialog.showSaveDialog;
    }, output);
    await page.getByRole('button', { name: 'Save .md' }).click();
    await expect(page.getByRole('status')).toContainText('Your brief has been saved.');
    expect(await readFile(output, 'utf8')).toContain('Locally generated template');
    await page.screenshot({ path: testInfo.outputPath('native-task.png') });
    await page.getByRole('button', { name: 'MrAI by Ayush home' }).click();
    await page.screenshot({ path: testInfo.outputPath('native-home.png') });
  } finally {
    try {
      await app?.close();
    } finally {
      await rm(temporary, { recursive: true, force: true });
    }
  }
});

test('native consent crosses IPC and HTTP, exports a synthetic draft, and restores without replay', async ({}, testInfo) => {
  const temporary = await mkdtemp(path.join(os.tmpdir(), 'mrai-connected-desktop-'));
  let fixture: Awaited<ReturnType<typeof startFixtureGateway>> | undefined;
  let app: Awaited<ReturnType<typeof electron.launch>> | undefined;
  try {
    fixture = await startFixtureGateway();
    const profile = path.join(temporary, 'profile');
    async function launch() {
      app = await electron.launch({
        args: ['.', `--user-data-dir=${profile}`],
        env: nativeEnvironment(fixture),
      });
      return app.firstWindow();
    }
    const page = await launch();
    await expect(page.getByRole('heading', { name: /Big ideas/ })).toBeVisible();
    expect(await page.evaluate(() => window.ayra!.gatewayStatus())).toMatchObject({
      connected: true,
      liveEnabled: true,
    });
    expect(fixture.dispatchCount()).toBe(0);
    await page
      .getByRole('textbox', { name: 'What would you like to get done?' })
      .fill('Draft a weekly update');
    await page.getByRole('button', { name: 'Create task plan' }).click();
    await page.getByRole('button', { name: 'Review AI draft' }).click();
    await page.getByRole('textbox', { name: /Source notes/ }).fill('Prototype ready for review.');
    expect(fixture.dispatchCount()).toBe(0);
    await page.getByRole('button', { name: 'Send to model' }).click();
    await expect(page.locator('.document-content')).toContainText(
      'The prototype is ready for review.',
    );
    await expect(page.locator('.task-type-label')).toHaveText('AI DRAFT');
    expect(fixture.dispatchCount()).toBe(1);
    const rendererState = await page.evaluate(async () => ({
      history: localStorage.getItem('ayra.tasks.v1'),
      status: await window.ayra!.gatewayStatus(),
      hasNode: 'require' in window,
    }));
    expect(rendererState.hasNode).toBe(false);
    expect(JSON.stringify(rendererState)).not.toContain(fixture.token);
    expect(JSON.stringify(rendererState)).not.toContain('synthetic-runtime-');
    const savedTasks = JSON.parse(rendererState.history!);
    const runId = savedTasks.find(
      (task: { draft?: { status: string } }) => task.draft?.status === 'succeeded',
    ).draft.id;
    expect(fixture.run(runId)).toMatchObject({ status: 'succeeded', cost: 142, held: 0 });
    const output = path.join(temporary, 'synthetic-draft.md');
    await app!.evaluate(({ dialog }, filePath) => {
      dialog.showSaveDialog = (async () => ({
        canceled: false,
        filePath,
      })) as typeof dialog.showSaveDialog;
    }, output);
    await page.getByRole('button', { name: 'Save .md' }).click();
    await expect(page.getByRole('status')).toContainText('Your brief has been saved.');
    expect(await readFile(output, 'utf8')).toContain(FIXTURE_MARKDOWN);
    await page.screenshot({ path: testInfo.outputPath('native-connected-draft.png') });
    await app!.close();
    app = undefined;
    const restoredPage = await launch();
    await restoredPage.getByRole('button', { name: 'Files', exact: true }).click();
    await restoredPage.locator('.file-card').click();
    await expect(restoredPage.locator('.document-content')).toContainText(
      'The prototype is ready for review.',
    );
    expect(fixture.dispatchCount()).toBe(1);
    expect(fixture.run(runId)?.status).toBe('succeeded');
  } finally {
    try {
      await app?.close();
    } finally {
      try {
        await fixture?.close();
      } finally {
        await rm(temporary, { recursive: true, force: true });
      }
    }
  }
});
