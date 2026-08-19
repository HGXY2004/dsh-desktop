'use strict';
/* Control center renderer. Talks to the main process via window.dshDesktop. */
const $ = (id) => document.getElementById(id);
const api = window.dshDesktop;

const PHASES = {
  init: ['初始化', ''],
  'checking-wsl': ['正在检测 WSL2', ''],
  'need-wsl': ['需要 WSL2', 'err'],
  bootstrapping: ['正在准备 WSL2 运行时', 'warn'],
  'bootstrap-failed': ['运行时安装失败', 'err'],
  'starting-server': ['正在启动 dsh web', 'warn'],
  ready: ['就绪', 'ok'],
  'server-failed': ['服务器异常', 'err']
};

/* ---------- log pane ---------- */
const logEl = $('log');
let logLines = [];
function appendLog(line) {
  logLines.push(line);
  if (logLines.length > 1200) logLines.splice(0, logLines.length - 1200);
  const atBottom = logEl.scrollTop + logEl.clientHeight >= logEl.scrollHeight - 30;
  logEl.textContent = logLines.join('\n');
  if (atBottom) logEl.scrollTop = logEl.scrollHeight;
}
$('btn-clear-log').addEventListener('click', () => { logLines = []; logEl.textContent = ''; });
api.onLog(appendLog);
api.onOpLog(({ line }) => appendLog('[op] ' + line));
api.getLogs().then((lines) => { logLines = lines.slice(); logEl.textContent = logLines.join('\n'); logEl.scrollTop = logEl.scrollHeight; });

/* ---------- status ---------- */
function applyStatus(status) {
  const [label, cls] = PHASES[status.phase] || [status.phase, ''];
  const pill = $('phase-pill');
  pill.textContent = label;
  pill.className = 'pill ' + (cls || '');
  $('status-text').textContent = label;
  $('status-detail').textContent = status.message || '';
  const spin = $('spinner');
  spin.classList.toggle('done', status.phase === 'ready' || status.phase === 'need-wsl' || String(status.phase).endsWith('failed'));
  $('need-wsl-box').classList.toggle('hidden', !(status.phase === 'need-wsl' || String(status.phase).endsWith('failed')));
  if (status.phase === 'need-wsl' || String(status.phase).endsWith('failed')) $('need-wsl-box').textContent = status.message || '';
  const info = status.info || {};
  if (info.dsh || info.distro) {
    $('runtime-cards').classList.remove('hidden');
    $('v-distro').textContent = info.distro || '-';
    $('v-dsh').textContent = info.dsh || '-';
    $('v-node').textContent = info.node || '-';
    $('v-pnpm').textContent = info.pnpm || '-';
  }
}
api.onStatus(applyStatus);
api.onServerState((s) => {
  const link = $('url-link');
  if (s.state === 'ready' && s.url) {
    link.textContent = s.url;
    link.href = '#';
    link.classList.remove('hidden');
    link.onclick = (e) => { e.preventDefault(); api.openBrowser(s.url); };
  } else if (s.state === 'stopped') {
    link.classList.add('hidden');
  }
});

/* ---------- tabs ---------- */
for (const btn of document.querySelectorAll('.tab')) {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach((b) => b.classList.remove('active'));
    document.querySelectorAll('.panel').forEach((p) => p.classList.remove('active'));
    btn.classList.add('active');
    $('tab-' + btn.dataset.tab).classList.add('active');
  });
}

/* ---------- status actions ---------- */
$('btn-retry').addEventListener('click', () => api.runBootstrap());
$('btn-restart').addEventListener('click', () => { appendLog('[ui] restarting ...'); api.restartServer(); });
$('btn-open-main').addEventListener('click', () => api.showMainWindow());
$('btn-open-browser').addEventListener('click', () => api.getStatus().then((s) => { if (s.url) api.openBrowser(s.url); }));
$('btn-shell').addEventListener('click', () => api.openShell());
$('btn-explorer-ws').addEventListener('click', () => api.openExplorer('workspace'));
$('btn-explorer-dsh').addEventListener('click', () => api.openExplorer('dsh-home'));

/* ---------- settings ---------- */
let currentSettings = null;
async function loadSettings() {
  currentSettings = await api.getSettings();
  $('s-dshhome').value = currentSettings.dshHome || '';
  $('s-nodever').value = currentSettings.nodeVersion || '';
  $('s-nodemirrors').value = currentSettings.nodeMirrors || '';
  $('s-registries').value = currentSettings.npmRegistries || '';
  $('s-dshver').value = currentSettings.dshVersion || '';
  $('s-workspace').value = currentSettings.workspaceWinPath || '';
  $('s-port').value = String(currentSettings.fixedPort || 0);
  $('s-extraargs').value = currentSettings.extraArgs || '';
  $('s-autorestart').checked = !!currentSettings.autoRestart;
  $('s-env').value = Object.entries(currentSettings.extraEnv || {}).map(([k, v]) => k + '=' + v).join('\n');
  const detected = await api.listDistros();
  const sel = $('s-distro');
  sel.innerHTML = '';
  if (detected.ok) {
    for (const d of detected.distros) {
      const opt = document.createElement('option');
      opt.value = d.name;
      opt.textContent = d.name + (d.default ? '（默认）' : '') + ' · v' + d.version;
      sel.appendChild(opt);
    }
    const wanted = currentSettings.distro || (detected.distros.find((d) => d.default) || {}).name;
    if (wanted) sel.value = wanted;
  } else {
    const opt = document.createElement('option');
    opt.textContent = '未检测到发行版';
    sel.appendChild(opt);
  }
}
function collectSettings() {
  const env = {};
  for (const line of $('s-env').value.split(/\n/)) {
    const t = line.trim();
    if (!t) continue;
    const eq = t.indexOf('=');
    if (eq > 0) env[t.slice(0, eq).trim()] = t.slice(eq + 1);
  }
  return {
    distro: $('s-distro').value || '',
    dshHome: $('s-dshhome').value.trim(),
    nodeVersion: $('s-nodever').value.trim(),
    nodeMirrors: $('s-nodemirrors').value.trim(),
    npmRegistries: $('s-registries').value.trim(),
    dshVersion: $('s-dshver').value.trim(),
    workspaceWinPath: $('s-workspace').value.trim(),
    fixedPort: parseInt($('s-port').value, 10) || 0,
    extraArgs: $('s-extraargs').value.trim(),
    extraEnv: env,
    autoRestart: $('s-autorestart').checked
  };
}
$('btn-save').addEventListener('click', async () => {
  currentSettings = await api.saveSettings(collectSettings());
  appendLog('[ui] settings saved');
});
$('btn-save-restart').addEventListener('click', async () => {
  await api.saveSettings(collectSettings());
  appendLog('[ui] settings saved, restarting ...');
  await api.restartServer();
});
$('s-workspace-browse').addEventListener('click', async () => {
  const dir = await api.pickFolder();
  if (dir) $('s-workspace').value = dir;
});

/* ---------- plugins ---------- */
$('btn-plug-list').addEventListener('click', () => api.runPlugin('ls'));
$('btn-plug-outdated').addEventListener('click', () => api.runPlugin('outdated'));
$('btn-plug-update').addEventListener('click', () => api.runPlugin('update'));
$('btn-plug-run').addEventListener('click', () => {
  const v = $('plug-args').value.trim();
  if (v) api.runPlugin(v);
});
$('btn-dumpcfg').addEventListener('click', () => api.runDsh('--profile web --dump-config'));

/* ---------- config editor ---------- */
$('btn-cfg-read').addEventListener('click', async () => {
  const r = await api.readConfig($('cfg-kind').value);
  if (r.ok) {
    $('cfg-content').value = r.content || '';
    $('cfg-path').textContent = 'WSL 路径: ' + r.path;
  } else appendLog('[config] ' + (r.error || 'read failed'));
});
$('btn-cfg-save').addEventListener('click', async () => {
  const r = await api.writeConfig($('cfg-kind').value, $('cfg-content').value);
  appendLog(r.ok ? '[config] saved - restart to apply' : '[config] save failed: ' + (r.error || '?'));
});

/* ---------- about ---------- */
api.appInfo().then((info) => {
  $('about-body').innerHTML =
    '<div class="cards">' +
    '<div class="card"><div class="card-k">DSH Desktop</div><div class="card-v">v' + info.appVersion + '</div></div>' +
    '<div class="card"><div class="card-k">Electron</div><div class="card-v">' + info.electron + '</div></div>' +
    '<div class="card"><div class="card-k">dsh</div><div class="card-v">' + (info.dsh || '-') + '</div></div>' +
    '<div class="card"><div class="card-k">发行版</div><div class="card-v">' + (info.distro || '-') + '</div></div>' +
    '</div>' +
    '<p class="hint">DSH Desktop 将 DeepSeek Harness 完整运行在 WSL2 内（~/.dsh-desktop 用户态运行时），桌面端只负责引导、生命周期与窗口。所有 dsh 配置（profiles、cordis.patch.yml、插件层叠）保持原样，可通过本窗口或 WSL 终端直接操作。</p>';
});

/* ---------- boot ---------- */
loadSettings();
api.getStatus().then(applyStatus);
