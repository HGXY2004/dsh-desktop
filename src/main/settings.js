'use strict';
/** Persistent application settings (userData/settings.json). */
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const DEFAULTS = {
  distro: '',                    // '' = WSL default distro
  nodeVersion: 'v22.23.2',
  nodeMirrors: 'https://npmmirror.com/mirrors/node,https://nodejs.org/dist',
  npmRegistries: 'https://registry.npmmirror.com,https://registry.npmjs.org',
  dshVersion: 'latest',
  workspaceWinPath: os.homedir(),  // Windows path; mapped to /mnt/<drive>/...
  dshHome: '',                   // '' = default ~/.dsh inside WSL
  bindHost: '127.0.0.1',         // dsh intentionally forbids 0.0.0.0
  fixedPort: 0,                  // 0 = let the OS pick
  extraArgs: '',                 // extra `dsh web` args, shlex-split
  extraEnv: {},                  // extra env for the dsh process (K -> V)
  autoRestart: true,
  lang: 'zh'
};

let userDataDir = null;
let cache = null;

function setUserDataDir(dir) {
  userDataDir = dir;
}

function file() {
  return path.join(userDataDir || '.', 'settings.json');
}

function load() {
  if (cache) return cache;
  let merged = { ...DEFAULTS };
  try {
    const raw = JSON.parse(fs.readFileSync(file(), 'utf8'));
    merged = { ...merged, ...raw, extraEnv: { ...(raw.extraEnv || {}) } };
  } catch {
    /* first run or corrupt file: defaults are fine */
  }
  cache = merged;
  return merged;
}

function save(patch) {
  const next = { ...load(), ...patch, extraEnv: { ...(patch.extraEnv || load().extraEnv || {}) } };
  cache = next;
  fs.mkdirSync(userDataDir || '.', { recursive: true });
  fs.writeFileSync(file(), JSON.stringify(next, null, 2), 'utf8');
  return next;
}

module.exports = { DEFAULTS, setUserDataDir, load, save };
