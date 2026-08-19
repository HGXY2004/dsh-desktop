'use strict';
/** Shared helpers: shell quoting and Windows <-> WSL path mapping. */

/** Single-quote a string for safe interpolation into a bash -c command. */
function sq(s) {
  return "'" + String(s).replace(/'/g, "'\\''") + "'";
}

/** Build an `env K=V K2=V2` prefix string from a plain object. */
function envPrefix(env) {
  const parts = [];
  for (const [k, v] of Object.entries(env || {})) {
    if (v === undefined || v === null || v === '') continue;
    parts.push('env ' + sq(k) + '=' + sq(String(v)));
  }
  return parts.length ? parts.join(' ') + ' ' : '';
}

/** Map a Windows path to its WSL mount: C:\\Users\\a -> /mnt/c/Users/a ; UNC -> native. */
function winToWslPath(p) {
  if (!p) return '';
  if (/^\\\\wsl(\\.localhost|\$)\\/i.test(p)) {
    const parts = p.split('\\').filter(Boolean);
    return '/' + parts.slice(2).join('/');
  }
  const m = /^([A-Za-z]):[\\/](.*)$/.exec(p);
  if (m) return '/mnt/' + m[1].toLowerCase() + '/' + m[2].replace(/\\/g, '/');
  return p;
}

/** Map a WSL absolute path to the Windows UNC form \\\\wsl.localhost\\<distro>\\... */
function wslToUnc(distro, wslPath) {
  if (!wslPath || !distro) return '';
  return '\\\\wsl.localhost\\' + distro + '\\' + wslPath.replace(/^\/+/, '').replace(/\//g, '\\');
}

/** Split a command line into argv, respecting single/double quotes. */
function shlex(line) {
  const out = [];
  let cur = '';
  let quote = null;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quote) {
      if (c === quote) quote = null; else cur += c;
    } else if (c === '"' || c === "'") quote = c;
    else if (/\s/.test(c)) { if (cur) { out.push(cur); cur = ''; } }
    else cur += c;
  }
  if (cur) out.push(cur);
  return out;
}

/** Timestamp prefix for log lines. */
function ts() {
  return new Date().toLocaleTimeString('en-GB', { hour12: false });
}

module.exports = { sq, envPrefix, winToWslPath, wslToUnc, shlex, ts };
