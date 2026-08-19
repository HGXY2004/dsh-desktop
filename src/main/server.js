'use strict';
/**
 * DshServer: lifecycle manager for `dsh web` running inside WSL2.
 * Launches via the shipped launch.sh, captures the OS-picked port from the
 * `dsh web: http://127.0.0.1:<port>` readiness line, probes the URL from the
 * Windows side (WSL2 localhost forwarding), and supports clean shutdown by
 * signaling the recorded Linux PID.
 */
const http = require('node:http');
const { EventEmitter } = require('node:events');
const { wslExec, wslStream } = require('./wsl');
const { sq, shlex, envPrefix, winToWslPath } = require('./util');
const { launchScriptWslPath } = require('./bootstrap');

const URL_RE = /dsh web: http:\/\/127\.0\.0\.1:(\d+)/;
const PID_RE = /DSHDESKTOP_PID=(\d+)/;

function probe(url, timeoutMs = 3000) {
  return new Promise((resolve) => {
    const req = http.get(url, { timeout: timeoutMs }, (res) => {
      res.resume();
      resolve(true);
    });
    req.on('timeout', () => { req.destroy(); resolve(false); });
    req.on('error', () => resolve(false));
  });
}

async function waitReachable(url, totalMs, onTick) {
  const start = Date.now();
  while (Date.now() - start < totalMs) {
    /* eslint-disable no-await-in-loop */
    if (await probe(url)) return true;
    if (onTick) onTick(Math.round((Date.now() - start) / 1000));
    await new Promise((r) => setTimeout(r, 700));
  }
  return false;
}

class DshServer extends EventEmitter {
  constructor() {
    super();
    this.state = 'stopped'; // stopped|starting|ready|stopping|failed
    this.url = null;
    this.port = null;
    this.child = null;
    this.pid = null;
    this.exitReason = null;
    this._stopping = false;
  }

  setState(state, extra = {}) {
    this.state = state;
    this.emit('state', { state, url: this.url, port: this.port, ...extra });
  }

  /** Kill a stale server left over from a previous app run. */
  async killStale() {
    const r = await wslExec(this.distro || '', 'cat ~/.dsh-desktop/state/server.pid 2>/dev/null || true');
    const pid = (r.stdout || '').trim();
    if (!/^\d+$/.test(pid)) return;
    await wslExec(this.distro || '', 'kill ' + sq(pid) + ' 2>/dev/null || true', { timeoutMs: 15000 });
  }

  async start(settings) {
    if (this.child) { await this.stop(); }
    this._stopping = false;
    this.exitReason = null;
    this.setState('starting');
    this.distro = settings.distro || '';
    await this.killStale();

    const extraArgs = shlex(settings.extraArgs || '');
    const port = Number(settings.fixedPort) > 0 ? Number(settings.fixedPort) : 0;
    const env = { DSH_DESKTOP_HOME: '' };
    if (settings.dshHome) env.DSH_HOME = settings.dshHome;
    Object.assign(env, settings.extraEnv || {});
    const envStr = envPrefix(env);

    const dshCmd = ['dsh', 'web',
      '--host', sq(settings.bindHost || '127.0.0.1'),
      '--port', String(port),
      ...extraArgs.map(sq)].join(' ');
    const command = 'echo "DSHDESKTOP_PID=$$" && ' + envStr +
      'exec bash ' + sq(launchScriptWslPath()) + ' --exec ' + dshCmd;

    const self = this;
    let urlFound = null;
    this.child = wslStream(this.distro, command, {
      cwdWsl: winToWslPath(settings.workspaceWinPath),
      onLine(line) {
        self.emit('log', line);
        const pidM = PID_RE.exec(line);
        if (pidM) {
          self.pid = pidM[1];
          wslExec(self.distro || '', 'mkdir -p ~/.dsh-desktop/state && echo ' + sq(self.pid) + ' > ~/.dsh-desktop/state/server.pid');
        }
        const urlM = URL_RE.exec(line);
        if (urlM && !urlFound) {
          urlFound = 'http://127.0.0.1:' + urlM[1];
          self.port = parseInt(urlM[1], 10);
          self._awaitReachable(urlFound);
        }
      },
      onExit(code) {
        self.child = null;
        if (self._stopping) { self.setState('stopped'); return; }
        self.exitReason = 'process exited with code ' + code;
        self.setState('failed', { reason: self.exitReason });
        self.emit('log', '[dsh-desktop] ' + self.exitReason);
      }
    });
  }

  async _awaitReachable(url) {
    this.emit('log', '[dsh-desktop] server reported ' + url + ', probing from Windows ...');
    const ok = await waitReachable(url, 90000, (s) => {
      this.emit('log', '[dsh-desktop] waiting for WSL localhost forwarding ... ' + s + 's');
    });
    if (this._stopping || !this.child) return;
    if (!ok) {
      this.exitReason = 'WSL2 localhost forwarding did not reach ' + url;
      this.emit('log', '[dsh-desktop] error: ' + this.exitReason);
      this.setState('failed', { reason: this.exitReason });
      return;
    }
    this.url = url;
    this.setState('ready', { url });
  }

  async stop() {
    this._stopping = true;
    this.setState('stopping');
    if (this.child) { try { this.child.kill(); } catch { /* already gone */ } }
    if (this.pid) {
      await wslExec(this.distro || '', 'kill ' + sq(this.pid) + ' 2>/dev/null || true', { timeoutMs: 15000 });
      this.pid = null;
    }
    this.child = null;
    this.url = null;
    this.setState('stopped');
  }
}

module.exports = { DshServer, probe, waitReachable };
