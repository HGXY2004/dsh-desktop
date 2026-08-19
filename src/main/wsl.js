'use strict';
/**
 * WSL2 access layer. wsl.exe prints ITS OWN messages (distro listing) as
 * UTF-16LE, while relayed Linux-process output arrives as raw UTF-8 bytes -
 * the two decode paths are kept strictly separate here.
 */
const { spawn } = require('node:child_process');
const { sq } = require('./util');

const WSL_EXE = 'wsl.exe';

function decodeUtf16(buf) {
  return buf.toString('utf16le').replace(/\0/g, '');
}

function collect(child, decode) {
  return new Promise((resolve) => {
    let out = Buffer.alloc(0);
    let err = Buffer.alloc(0);
    child.stdout.on('data', (d) => { out = Buffer.concat([out, d]); });
    child.stderr.on('data', (d) => { err = Buffer.concat([err, d]); });
    child.on('exit', (code, signal) => resolve({ code, signal, out, err }));
    child.on('error', (e) => resolve({ code: -1, signal: null, out, err, error: e }));
  });
}

/** Detect WSL and list distros with version/default markers. */
async function listDistros() {
  const child = spawn(WSL_EXE, ['--list', '--verbose'], { windowsHide: true });
  const { code, out, err, error } = await collect(child);
  if (error) return { ok: false, reason: 'not-installed', distros: [], message: String(error.message || error) };
  const text = decodeUtf16(out).trim();
  const errText = decodeUtf16(err).trim();
  if (code !== 0 || !text) {
    const msg = errText || text || ('wsl.exe exited with code ' + code);
    const reason = /not installed|未安装|0x80370102/i.test(msg) ? 'not-installed' : 'error';
    return { ok: false, reason, distros: [], message: msg };
  }
  const lines = text.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
  const distros = [];
  for (const line of lines.slice(1)) {
    const def = line.startsWith('*');
    const cols = line.replace(/^\*\s+/, '').split(/\s+/);
    const name = cols[0];
    if (!name || name === 'NAME') continue;
    const version = cols[2] || '';
    const state = cols[1] || '';
    distros.push({ name, version: parseInt(version, 10) || 0, state, default: def });
  }
  return { ok: true, distros };
}

/** Run one bash command inside a distro; resolves {code, stdout, stderr, timedOut}. */
function wslExec(distro, command, opts = {}) {
  const { timeoutMs = 120000, cwdWsl = '' } = opts;
  return new Promise((resolve) => {
    const args = [];
    if (distro) args.push('-d', distro);
    const inner = cwdWsl ? 'cd ' + sq(cwdWsl) + ' && ' + command : command;
    args.push('--', 'bash', '-c', inner);
    const child = spawn(WSL_EXE, args, { windowsHide: true });
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill();
      resolve({ code: -1, stdout: '', stderr: 'timeout after ' + timeoutMs + 'ms', timedOut: true });
    }, timeoutMs);
    collect(child, 'utf8').then((r) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ code: r.code, stdout: r.out.toString('utf8'), stderr: (r.err || '').toString('utf8'), timedOut: false });
    });
  });
}

/**
 * Run a bash command with merged stderr, streaming each output line back.
 * Used for the dsh web server process and plugin/pnpm operations.
 */
function wslStream(distro, command, handlers = {}) {
  const { cwdWsl = '', onLine, onExit } = handlers;
  const args = [];
  if (distro) args.push('-d', distro);
  const inner = (cwdWsl ? 'cd ' + sq(cwdWsl) + ' && ' : '') + '{ ' + command + '; } 2>&1';
  args.push('--', 'bash', '-c', inner);
  const child = spawn(WSL_EXE, args, { windowsHide: true });
  let buf = '';
  child.stdout.on('data', (d) => {
    buf += d.toString('utf8');
    let idx;
    while ((idx = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, idx).replace(/\r$/, '');
      buf = buf.slice(idx + 1);
      if (onLine) onLine(line);
    }
  });
  child.on('exit', (code, signal) => {
    if (buf && onLine) onLine(buf);
    if (onExit) onExit(code, signal);
  });
  child.on('error', (e) => {
    if (onLine) onLine('[wsl] spawn error: ' + e.message);
    if (onExit) onExit(-1, null);
  });
  return child;
}

module.exports = { listDistros, wslExec, wslStream };
