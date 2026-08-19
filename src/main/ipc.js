'use strict';
/** IPC bridge: renderer <-> main. All handlers live here. */
const { ipcMain, shell } = require('electron');
const { spawn } = require('node:child_process');
const { listDistros, wslExec, wslStream } = require('./wsl');
const settingsStore = require('./settings');
const { launchScriptWslPath } = require('./bootstrap');
const { sq, shlex, envPrefix, winToWslPath, wslToUnc } = require('./util');

const logRing = [];
const MAX_LOG = 4000;
let windows = [];
let currentStatus = { phase: 'init', message: '' };
let opSeq = 0;
const runningOps = new Set();

function pushLog(line) {
  logRing.push(line);
  if (logRing.length > MAX_LOG) logRing.splice(0, logRing.length - MAX_LOG);
  send('dsh:log', line);
}

function send(channel, payload) {
  for (const w of windows) {
    if (w && !w.isDestroyed()) { try { w.webContents.send(channel, payload); } catch (e) { /* gone */ } }
  }
}

function setWindows(list) { windows = (list || []).filter(Boolean); }

function setStatus(patch) {
  currentStatus = { ...currentStatus, ...patch };
  send('dsh:status', currentStatus);
}

function getStatus() {
  return currentStatus;
}

/* ---------- dsh CLI operations (plugin manager / arbitrary) ---------- */
function runDshOp(argsLine) {
  const settings = settingsStore.load();
  const opId = 'op' + (++opSeq);
  const args = shlex(argsLine || '');
  if (!args.length) return Promise.resolve({ opId, code: 1, error: 'no arguments' });
  if (runningOps.size >= 2) return Promise.resolve({ opId, code: 1, error: 'too many concurrent operations, wait for the running one' });
  runningOps.add(opId);
  const env = {};
  if (settings.dshHome) env.DSH_HOME = settings.dshHome;
  Object.assign(env, settings.extraEnv || {});
  const command = envPrefix(env) + 'exec bash ' + sq(launchScriptWslPath()) + ' --exec dsh ' + args.map(sq).join(' ');
  return new Promise((resolve) => {
    wslStream(settings.distro || '', command, {
      cwdWsl: winToWslPath(settings.workspaceWinPath),
      onLine: (line) => send('dsh:op-log', { opId, line }),
      onExit: (code) => { runningOps.delete(opId); resolve({ opId, code }); }
    });
  });
}

/* ---------- config files inside WSL ---------- */
function configTarget(kind) {
  if (kind === 'home') return '~/.dsh/cordis.patch.yml';
  if (kind === 'web-profile') return '~/.dsh/profiles/web/cordis.patch.yml';
  if (kind === 'web-manifest') return '~/.dsh/profiles/web/package.json';
  return null;
}

const DELIM = 'DSHDESKTOP_EOF_7c3f';

async function readConfig(kind) {
  const settings = settingsStore.load();
  const target = configTarget(kind);
  if (!target) return { ok: false, error: 'unknown config kind' };
  const r = await wslExec(settings.distro || '',
    'mkdir -p "$(dirname ' + target + ')" && cat ' + target + ' 2>/dev/null || true');
  return { ok: true, path: target, content: r.stdout };
}

async function writeConfig(kind, content) {
  const settings = settingsStore.load();
  const target = configTarget(kind);
  if (!target) return { ok: false, error: 'unknown config kind' };
  if (content.includes(DELIM)) return { ok: false, error: 'content contains reserved delimiter' };
  const script = 'mkdir -p "$(dirname ' + target + ')" && cat > ' + target +
    ' <<\'' + DELIM + '\'\n' + content.replace(/\n$/, '') + '\n' + DELIM;
  const r = await wslExec(settings.distro || '', script, { timeoutMs: 30000 });
  return { ok: r.code === 0, error: r.code === 0 ? null : r.stderr };
}

/* ---------- resolution + openers ---------- */
async function resolveWslPath(p) {
  const settings = settingsStore.load();
  /* expand ~ and $VAR forms the way the shell would; literal otherwise */
  let cmd;
  if (p.startsWith('~')) cmd = 'echo "$HOME' + p.slice(1).replace(/"/g, '') + '"';
  else if (p.indexOf('$') >= 0) cmd = 'echo "' + p.replace(/"/g, '') + '"';
  else cmd = 'echo ' + sq(p);
  const r = await wslExec(settings.distro || '', cmd);
  return (r.stdout || '').trim().split('\n')[0] || p;
}

async function openExplorer(target) {
  const settings = settingsStore.load();
  const distro = settings.distro || 'Ubuntu';
  let winPath;
  if (target === 'dsh-home') {
    const abs = await resolveWslPath(settings.dshHome || '$HOME/.dsh');
    winPath = wslToUnc(distro, abs);
  } else {
    winPath = settings.workspaceWinPath;
  }
  if (winPath) spawn('explorer.exe', [winPath], { detached: true, stdio: 'ignore' }).unref();
  return winPath;
}

function openShell() {
  const settings = settingsStore.load();
  const distro = settings.distro || '';
  const cwd = winToWslPath(settings.workspaceWinPath);
  const wslArgs = [];
  if (distro) wslArgs.push('-d', distro);
  wslArgs.push('--cd', cwd);
  const wt = spawn('wt.exe', ['wsl.exe', ...wslArgs], { detached: true, stdio: 'ignore', windowsHide: true });
  wt.on('error', () => {
    spawn('wsl.exe', [...wslArgs], { detached: true, stdio: 'ignore', windowsHide: false }).unref();
  });
  wt.unref();
}

function registerIpc(deps) {
  const { server, pipeline, restartServer, info, appVersion, getWindows, showMainWindow } = deps;
  setWindows(getWindows());
  ipcMain.handle('status:get', () => ({ ...currentStatus, serverState: server.state, url: server.url, info: info() }));
  ipcMain.handle('settings:get', () => settingsStore.load());
  ipcMain.handle('settings:save', (_e, patch) => settingsStore.save(patch));
  ipcMain.handle('distros:list', () => listDistros());
  ipcMain.handle('bootstrap:run', () => pipeline({ forceBootstrap: true }));
  ipcMain.handle('server:restart', () => restartServer());
  ipcMain.handle('server:stop', () => server.stop());
  ipcMain.handle('plugin:run', (_e, argsLine) => runDshOp('--profile web ' + (argsLine || '')));
  ipcMain.handle('dsh:run', (_e, argsLine) => runDshOp(argsLine));
  ipcMain.handle('config:read', (_e, kind) => readConfig(kind));
  ipcMain.handle('config:write', (_e, kind, content) => writeConfig(kind, content));
  ipcMain.handle('logs:get', () => logRing.slice(-500));
  ipcMain.handle('shell:open', () => openShell());
  ipcMain.handle('explorer:open', (_e, target) => openExplorer(target));
  ipcMain.handle('browser:open', (_e, url) => shell.openExternal(url));
  ipcMain.handle('app:info', () => ({ appVersion: appVersion(), electron: process.versions.electron, ...info() }));
  ipcMain.handle('window:show-main', () => showMainWindow());
  const { dialog } = require('electron');
  ipcMain.handle('dialog:pick-folder', async () => {
    const r = await dialog.showOpenDialog({ properties: ['openDirectory'] });
    return r.canceled ? null : r.filePaths[0];
  });
}

module.exports = { registerIpc, pushLog, setStatus, getStatus, send, setWindows, openShell, logRing };
