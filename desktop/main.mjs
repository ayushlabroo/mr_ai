import { app, BrowserWindow, dialog, ipcMain, net, protocol, session } from 'electron';
import { constants, existsSync } from 'node:fs';
import { open, realpath } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { isTrustedFrame, isWithin, validateExport } from './policy.mjs';
import { createGatewayClient } from './gateway.mjs';

const root = path.dirname(fileURLToPath(import.meta.url));
const dist = path.resolve(root, '../dist');
// Preserve the original app's data and asset origin when renaming the interface.
app.setName('MrAI by Ayush');
const legacyData = ['aster-workspace', 'Ayra', 'ayra-workspace']
  .map((name) => path.join(app.getPath('appData'), name))
  .find((directory) => existsSync(directory));
if (!app.commandLine.hasSwitch('user-data-dir') && legacyData) app.setPath('userData', legacyData);
const gateway = createGatewayClient(process.env);
const devURL =
  !app.isPackaged && process.env.AYRA_DEV_URL === 'http://127.0.0.1:5173'
    ? process.env.AYRA_DEV_URL
    : null;
const origin = devURL ?? 'aster://app';
let window;
const selectedWorkspaces = new Map();

protocol.registerSchemesAsPrivileged([
  { scheme: 'aster', privileges: { standard: true, secure: true, supportFetchAPI: true } },
]);
app.enableSandbox();

function assertSender(event) {
  if (!isTrustedFrame(event, window?.webContents, origin)) throw new Error('Untrusted request.');
}

app.whenReady().then(async () => {
  for (const [channel, method] of [
    ['gateway:status', 'status'],
    ['gateway:start', 'start'],
    ['gateway:get', 'get'],
    ['gateway:cancel', 'cancel'],
  ]) {
    ipcMain.handle(channel, (event, payload) => {
      assertSender(event);
      return gateway[method](payload);
    });
  }
  session.defaultSession.setPermissionRequestHandler((_contents, _permission, callback) =>
    callback(false),
  );
  session.defaultSession.setPermissionCheckHandler(() => false);

  await protocol.handle('aster', async (request) => {
    try {
      const url = new URL(request.url);
      if (url.host !== 'app' || request.method !== 'GET')
        return new Response('Forbidden', { status: 403 });
      const relative = decodeURIComponent(url.pathname).replace(/^\/+/, '') || 'index.html';
      const target = await realpath(path.resolve(dist, relative));
      if (!isWithin(await realpath(dist), target))
        return new Response('Forbidden', { status: 403 });
      const response = await net.fetch(pathToFileURL(target).href);
      const headers = new Headers(response.headers);
      headers.set(
        'Content-Security-Policy',
        "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'none'; object-src 'none'; frame-src 'none'; base-uri 'none'; form-action 'none'",
      );
      headers.set('X-Content-Type-Options', 'nosniff');
      return new Response(response.body, { status: response.status, headers });
    } catch {
      return new Response('Not found', { status: 404 });
    }
  });

  ipcMain.handle('workspace:select', async (event) => {
    assertSender(event);
    const result = await dialog.showOpenDialog(window, {
      title: 'Choose a workspace',
      properties: ['openDirectory'],
    });
    if (result.canceled || !result.filePaths[0]) return null;
    const folder = await realpath(result.filePaths[0]);
    // Only the native process knows the path. Selection does not grant tools any access.
    selectedWorkspaces.clear();
    const id = randomUUID();
    selectedWorkspaces.set(id, folder);
    return { id, name: path.basename(folder) };
  });

  ipcMain.handle('document:export', async (event, input) => {
    assertSender(event);
    const document = validateExport(input);
    const result = await dialog.showSaveDialog(window, {
      title: 'Save your brief',
      defaultPath: document.filename,
      filters: [{ name: 'Markdown document', extensions: ['md'] }],
      properties: ['createDirectory', 'showOverwriteConfirmation'],
    });
    if (result.canceled || !result.filePath) return { saved: false };
    if (path.extname(result.filePath).toLowerCase() !== '.md')
      throw new Error('Choose a Markdown (.md) filename.');
    // Do not follow a symlink when writing a user-selected export.
    const handle = await open(
      result.filePath,
      constants.O_WRONLY | constants.O_CREAT | constants.O_TRUNC | constants.O_NOFOLLOW,
      0o600,
    );
    try {
      await handle.writeFile(document.markdown, 'utf8');
    } finally {
      await handle.close();
    }
    return { saved: true, name: path.basename(result.filePath) };
  });

  function createWindow() {
    window = new BrowserWindow({
      width: 1380,
      height: 920,
      minWidth: 880,
      minHeight: 650,
      title: 'MrAI by Ayush',
      backgroundColor: '#e0e7ef',
      titleBarStyle: 'hiddenInset',
      trafficLightPosition: { x: 22, y: 23 },
      show: false,
      webPreferences: {
        preload: path.join(root, 'preload.cjs'),
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        webSecurity: true,
        spellcheck: false,
      },
    });
    window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    window.webContents.on('will-navigate', (event) => event.preventDefault());
    window.webContents.on('will-attach-webview', (event) => event.preventDefault());
    window.once('ready-to-show', () => window.show());
    window.on('closed', () => {
      window = null;
      selectedWorkspaces.clear();
    });
    void window.loadURL(devURL ?? 'aster://app/index.html');
  }
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
