#!/usr/bin/env bash
# DSH Desktop - environment launcher. Assembles the user-space runtime PATH and
# environment, then execs the requested command (usually dsh).
# Usage: launch.sh --exec <command...>          (arbitrary command)
#        launch.sh <dsh args...>                (defaults to dsh)
set -euo pipefail

DSH_DESKTOP_HOME="${DSH_DESKTOP_HOME:-$HOME/.dsh-desktop}"

NODE_BIN_DIR="$(ls -d "$DSH_DESKTOP_HOME"/runtime/node-*/bin 2>/dev/null | sort -V | tail -n 1 || true)"
[ -n "$NODE_BIN_DIR" ] || { echo '[dsh-desktop] error node runtime missing; run bootstrap first' >&2; exit 127; }
export PATH="$NODE_BIN_DIR:$DSH_DESKTOP_HOME/npm-global/bin:${PATH:+:$PATH}"
export NPM_CONFIG_PREFIX="$DSH_DESKTOP_HOME/npm-global"
export NPM_CONFIG_CACHE="$DSH_DESKTOP_HOME/npm-cache"
# keep the pnpm store inside our tree so it never touches the user's dotfiles
export PNPM_HOME="$DSH_DESKTOP_HOME/pnpm"
mkdir -p "$PNPM_HOME"
export PATH="$PNPM_HOME:$PATH"

if [ "${1:-}" = "--exec" ]; then shift; exec "$@"; fi
exec "$DSH_DESKTOP_HOME/npm-global/bin/dsh" "$@"
