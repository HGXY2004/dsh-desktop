'use strict';
/**
 * DSH Desktop - main entry.
 * Pipeline: detect WSL2 -> bootstrap the user-space runtime (Node + dsh +
 * pnpm under ~/.dsh-desktop) -> launch `dsh web` inside the distro -> open
 * the Web GUI in a desktop window. A control-center window carries status,
 * settings, plugin management, config editing, and logs.
 */
const { app, BrowserWindow, Menu, Tray, nativeImage, globalShortcut } = require('electron');
const path = require('node:path');
const { listDistros } = require('./wsl');
const settingsStore = require('./settings');
const bootstrapMod = require('./bootstrap');
const { DshServer } = require('./server');
const ipcMod = require('./ipc');

const SMOKE = process.argv.includes('--smoke');

let splashWindow = null;
let mainWindow = null;
let tray = null;
let pipelineRunning = false;
let restartTimer = null;
let restartAttempts = 0;
let runtimeInfo = { dsh: null, node: null, pnpm: null };
let resolvedDistro = '';

const server = new DshServer();

/* ---------- helpers ---------- */
function scriptsDir() {
  return app.isPackaged
    ? path.join(process.resourcesPath, 'wsl')
    : path.join(__dirname, '..', '..', 'resources', 'wsl');
}

function iconPath() {
  return app.isPackaged ? path.join(process.resourcesPath, 'icon.png') : path.join(__dirname, '..', '..', 'resources', 'icon.png');
}

function logLine(line) {
  if (SMOKE) console.log(line);
  ipcMod.pushLog(line);
}

function setPhase(phase, message) {
  if (SMOKE) console.log('[phase] ' + phase + (message ? ' - ' + message : ''));
  ipcMod.setStatus({ phase, message: message || '' });
}

function getWindows() {
  ipcMod.setWindows([splashWindow, mainWindow].filter(Boolean));
  return [splashWindow, mainWindow].filter(Boolean);
}

/* ---------- windows ---------- */
function createSplash() {
  splashWindow = new BrowserWindow({
    width: 940,
    height: 680,
    minWidth: 720,
    minHeight: 560,
    backgroundColor: '#0b1020',
    title: 'DSH Desktop',
    icon: iconPath(),
    autoHideMenuBar: false,
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  splashWindow.loadFile(path.join(__dirname, '..', 'renderer', 'splash.html'));
  splashWindow.on('closed', () => { splashWindow = null; getWindows(); });
  getWindows();
}

function showMainWindow() {
  if (!server.url) return;
  if (mainWindow) {
    if (mainWindow.webContents.getURL() !== server.url) mainWindow.loadURL(server.url);
    mainWindow.show();
    mainWindow.focus();
    return;
  }
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    backgroundColor: '#0b1020',
    title: 'DSH Desktop',
    icon: iconPath(),
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  mainWindow.once('ready-to-show', () => mainWindow.show());
  mainWindow.loadURL(server.url);
  mainWindow.on('closed', () => { mainWindow = null; getWindows(); });
  getWindows();
}

function showControlCenter() {
  if (splashWindow) { splashWindow.show(); splashWindow.focus(); return; }
  createSplash();
}

/* ---------- pipeline ---------- */
async function pipeline(opts = {}) {
  if (pipelineRunning) return;
  pipelineRunning = true;
  try {
    const settings = settingsStore.load();
    setPhase('checking-wsl', '正在检测 WSL2 / Detecting WSL2');
    const detected = await listDistros();
    if (!detected.ok) {
      setPhase('need-wsl',
        '未检测到可用的 WSL2。请以管理员身份运行 `wsl --install -d Ubuntu` 并重启，然后重试。 / ' +
        'WSL2 was not detected. Run `wsl --install -d Ubuntu` as administrator, reboot, then retry. (' + detected.message + ')');
      return;
    }
    const byName = new Map(detected.distros.map((d) => [d.name, d]));
    let distro = settings.distro && byName.has(settings.distro) ? settings.distro : '';
    let distroInfo = distro ? byName.get(distro) : (detected.distros.find((d) => d.default) || detected.distros[0]);
    distro = distro || (distroInfo ? distroInfo.name : '');
    resolvedDistro = distro;
    if (!distro) { setPhase('need-wsl', '没有可用的 WSL2 发行版 / no WSL2 distro available'); return; }
    if (distroInfo && distroInfo.version !== 2) {
      setPhase('need-wsl', distro + ' 不是 WSL2（版本 ' + distroInfo.version + '）。请运行 `wsl --set-version ' + distro + ' 2`。 / not a WSL2 distro');
      return;
    }
    logLine('[dsh-desktop] distro: ' + distro + (distroInfo && distroInfo.state === 'Stopped' ? ' (waking up ...)' : ''));

    setPhase('bootstrapping', '正在准备 WSL2 内的运行时（首次需要下载 Node.js 与 dsh） / preparing runtime');
    const bootSettings = { ...settings, distro };
    const result = await bootstrapMod.runBootstrap(bootSettings, logLine, !!opts.forceBootstrap);
    runtimeInfo = { ...runtimeInfo, ...result.info };
    if (!result.ok) {
      setPhase('bootstrap-failed', '运行时安装失败：' + (result.error || 'exit ' + result.code) + ' / bootstrap failed');
      return;
    }
    logLine('[dsh-desktop] runtime ready: dsh ' + (result.info.dsh || '?') + ', node ' + (result.info.node || '?') + ', pnpm ' + (result.info.pnpm || '?'));

    setPhase('starting-server', '正在启动 dsh web / starting dsh web');
    await server.start(bootSettings);
  } finally {
    pipelineRunning = false;
  }
}

async function restartServer() {
  restartAttempts = 0;
  if (restartTimer) { clearTimeout(restartTimer); restartTimer = null; }
  await server.stop();
  await pipeline();
}

server.on('log', logLine);
server.on('state', (s) => {
  ipcMod.send('dsh:server-state', s);
  if (s.state === 'ready') {
    restartAttempts = 0;
    setPhase('ready', server.url);
    showMainWindow();
  } else if (s.state === 'failed') {
    setPhase('server-failed', s.reason || 'dsh web exited');
    const settings = settingsStore.load();
    if (settings.autoRestart && restartAttempts < 3 && !SMOKE) {
      restartAttempts += 1;
      const delay = 3000 * restartAttempts;
      logLine('[dsh-desktop] auto-restarting in ' + delay + 'ms (attempt ' + restartAttempts + '/3)');
      restartTimer = setTimeout(() => { restartTimer = null; pipeline(); }, delay);
    }
  }
});

/* ---------- menu / tray ---------- */
function buildMenu() {
  const template = [
    {
      label: '文件(&F)',
      submenu: [
        { label: '打开主窗口 / Main window', click: () => showMainWindow() },
        { label: '控制中心 / Control center', accelerator: 'CmdOrCtrl+Shift+C', click: () => showControlCenter() },
        { type: 'separator' },
        { label: '在浏览器中打开 / Open in browser', click: () => { if (server.url) require('electron').shell.openExternal(server.url); } },
        { type: 'separator' },
        { role: 'quit', label: '退出(&Q)' }
      ]
    },
    {
      label: '服务器(&S)',
      submenu: [
        { label: '重启 dsh web / Restart', click: () => restartServer() },
        { label: '停止 / Stop', click: () => server.stop() },
        { label: '打开 WSL 终端 / WSL terminal', click: () => ipcMod.openShell() }
      ]
    },
    {
      label: '视图(&V)',
      submenu: [
        { role: 'reload', label: '重新加载(&R)' },
        { role: 'forceReload', label: '强制重新加载' },
        { role: 'toggleDevTools', label: '开发者工具(&D)' },
        { type: 'separator' },
        { role: 'resetZoom', label: '实际大小' },
        { role: 'zoomIn', label: '放大' },
        { role: 'zoomOut', label: '缩小' },
        { role: 'togglefullscreen', label: '全屏' }
      ]
    },
    {
      label: '帮助(&H)',
      submenu: [
        { label: '关于 DSH Desktop / About', click: () => require('electron').dialog.showMessageBox({
          type: 'info',
          title: 'DSH Desktop',
          message: 'DSH Desktop ' + app.getVersion(),
          detail: 'DeepSeek Harness desktop wrapper (WSL2).\ndsh ' + (runtimeInfo.dsh || '?') + ' · node ' + (runtimeInfo.node || '?') + ' · distro ' + (resolvedDistro || '?'),
          buttons: ['OK']
        }) },
        { label: 'dsh 文档 / dsh docs', click: () => require('electron').shell.openExternal('https://github.com/deepseek-ai/deepseek-harness') }
      ]
    }
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}


function buildTray() {
  const img = nativeImage.createFromPath(iconPath()).resize({ width: 16, height: 16 });
  tray = new Tray(img);
  tray.setToolTip('DSH Desktop');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: '主窗口 / Main window', click: () => showMainWindow() },
    { label: '控制中心 / Control center', click: () => showControlCenter() },
    { type: 'separator' },
    { label: '重启服务器 / Restart server', click: () => restartServer() },
    { type: 'separator' },
    { label: '退出 / Quit', click: () => app.quit() }
  ]));
  tray.on('double-click', () => showMainWindow());
}

/* ---------- lifecycle ---------- */
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => showMainWindow());

  app.whenReady().then(() => {
    settingsStore.setUserDataDir(app.getPath('userData'));
    bootstrapMod.setScriptsDir(scriptsDir());
    require('./ipc').registerIpc({
      server,
      pipeline,
      restartServer,
      info: () => ({ ...runtimeInfo, distro: resolvedDistro }),
      appVersion: () => app.getVersion(),
      showMainWindow: () => showMainWindow(),
      getWindows
    });

    if (SMOKE) {
      runSmoke();
      return;
    }

    buildMenu();
    buildTray();
    createSplash();
    globalShortcut.register('CmdOrCtrl+Shift+C', () => showControlCenter());
    pipeline();
  });

  app.on('window-all-closed', () => {
    /* keep running in tray; the dsh web server stays alive for the browser */
  });

  app.on('before-quit', (event) => {
    if (server.state === 'stopped') return;
    event.preventDefault();
    server.stop().finally(() => app.exit(0));
    setTimeout(() => app.exit(0), 10000).unref();
  });
}

/* ---------- smoke mode (CI / automated verification) ---------- */
function runSmoke() {
  const hardTimeout = setTimeout(() => { console.error('[smoke] TIMEOUT'); app.exit(2); }, 10 * 60 * 1000);
  server.on('state', (s) => {
    if (s.state === 'ready') {
      console.log('[smoke] READY url=' + s.url);
      clearTimeout(hardTimeout);
      setTimeout(() => { server.stop().finally(() => app.exit(0)); }, 3000);
    }
  });
  pipeline().then(() => {
    const badPhases = ['need-wsl', 'bootstrap-failed', 'server-failed'];
    const check = setInterval(() => {
      const phase = ipcMod.getStatus().phase;
      if (badPhases.includes(phase)) {
        console.error('[smoke] FAILED phase=' + phase + ' message=' + ipcMod.getStatus().message);
        clearInterval(check);
        clearTimeout(hardTimeout);
        app.exit(1);
      }
    }, 500);
    setTimeout(() => clearInterval(check), 10 * 60 * 1000).unref();
  });
}
