'use strict';
/**
 * Ensures the user-space runtime exists inside the chosen WSL2 distro by
 * running the shipped resources/wsl/bootstrap.sh (Node.js + dsh + pnpm under
 * ~/.dsh-desktop, no sudo, idempotent). Progress lines stream to the UI.
 */
const path = require('node:path');
const { wslStream } = require('./wsl');
const { sq, winToWslPath, envPrefix } = require('./util');

let scriptsDir = null;
function setScriptsDir(dir) { scriptsDir = dir; }

function bootstrapScriptWslPath() {
  return winToWslPath(path.join(scriptsDir, 'bootstrap.sh'));
}

function launchScriptWslPath() {
  return winToWslPath(path.join(scriptsDir, 'launch.sh'));
}

/** Returns {ok, info:{dsh,node,pnpm}}. onLine receives every output line. */
function runBootstrap(settings, onLine, force) {
  return new Promise((resolve) => {
    const env = {
      DSH_DESKTOP_NODE_VERSION: settings.nodeVersion,
      DSH_DESKTOP_NODE_MIRRORS: settings.nodeMirrors,
      DSH_DESKTOP_NPM_REGISTRIES: settings.npmRegistries,
      DSH_DESKTOP_DSH_VERSION: settings.dshVersion,
      DSH_DESKTOP_FORCE_INSTALL: force ? '1' : '0'
    };
    const info = { dsh: null, node: null, pnpm: null };
    let lastError = null;
    const command = envPrefix(env) + 'bash ' + sq(bootstrapScriptWslPath());
    const child = wslStream(settings.distro || '', command, {
      onLine(line) {
        if (line.startsWith('[dsh-desktop] error ')) lastError = line.slice('[dsh-desktop] error '.length);
        const infoM = /^\[dsh-desktop\] info (dsh|node|pnpm) (.+)$/.exec(line);
        if (infoM) info[infoM[1]] = infoM[2].trim();
        if (onLine) onLine(line);
      },
      onExit(code) {
        resolve({ ok: code === 0, code, info, error: lastError });
      }
    });
    return child;
  });
}

module.exports = { setScriptsDir, runBootstrap, bootstrapScriptWslPath, launchScriptWslPath };
