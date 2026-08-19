#!/usr/bin/env bash
# DSH Desktop - WSL2 runtime bootstrap (fully user-space, no sudo needed).
# Idempotent: skips anything already installed. Progress is plain text lines on
# stdout; the desktop app parses "[dsh-desktop] ..." markers to drive its UI.
set -euo pipefail

DSH_DESKTOP_HOME="${DSH_DESKTOP_HOME:-$HOME/.dsh-desktop}"
NODE_VERSION="${DSH_DESKTOP_NODE_VERSION:-v22.23.2}"
NODE_MIRRORS="${DSH_DESKTOP_NODE_MIRRORS:-https://npmmirror.com/mirrors/node,https://nodejs.org/dist}"
NPM_REGISTRIES="${DSH_DESKTOP_NPM_REGISTRIES:-https://registry.npmmirror.com,https://registry.npmjs.org}"
DSH_PACKAGE="${DSH_DESKTOP_DSH_PACKAGE:-@deepseek-ai/dsh}"
DSH_VERSION="${DSH_DESKTOP_DSH_VERSION:-latest}"
PNPM_VERSION="${DSH_DESKTOP_PNPM_VERSION:-latest}"

step() { printf '[dsh-desktop] step %s\n' "$1"; }
progress() { printf '[dsh-desktop] progress %s\n' "$1"; }
fail() { printf '[dsh-desktop] error %s\n' "$1" >&2; exit 1; }

mkdir -p "$DSH_DESKTOP_HOME"/{runtime,npm-global,npm-cache,state,downloads}

ARCH="$(uname -m)"
case "$ARCH" in
  x86_64) ARCH_SUFFIX="x64" ;;
  aarch64|arm64) ARCH_SUFFIX="arm64" ;;
  *) fail "unsupported architecture $ARCH" ;;
esac

DOWNLOADER=""
if command -v curl >/dev/null 2>&1; then DOWNLOADER="curl"
elif command -v wget >/dev/null 2>&1; then DOWNLOADER="wget"
else fail "no curl or wget found in the distro; install one of them first"
fi

download() { # <url> <dest>
  local url="$1" dest="$2"
  if [ "$DOWNLOADER" = "curl" ]; then
    curl -fL --retry 3 --connect-timeout 15 --silent --show-error -o "$dest" "$url"
  else
    wget -q --tries=3 --timeout=15 -O "$dest" "$url"
  fi
}

# ---------- 1. Node.js runtime ----------
NODE_DIR="$DSH_DESKTOP_HOME/runtime/node-$NODE_VERSION-linux-$ARCH_SUFFIX"
if [ -x "$NODE_DIR/bin/node" ] && "$NODE_DIR/bin/node" --version | grep -qx "$NODE_VERSION"; then
  progress "node already $($NODE_DIR/bin/node --version)"
else
  step "install-node"
  TARBALL="node-$NODE_VERSION-linux-$ARCH_SUFFIX.tar.xz"
  ok=0
  IFS=',' read -ra MIRRORS <<< "$NODE_MIRRORS"
  for m in "${MIRRORS[@]}"; do
    progress "downloading $TARBALL from $m ..."
    rm -rf "$NODE_DIR"
    if download "$m/$NODE_VERSION/$TARBALL" "$DSH_DESKTOP_HOME/downloads/$TARBALL"; then ok=1; break; fi
  done
  [ "$ok" = "1" ] || fail "failed to download $TARBALL from any mirror"
  progress "extracting node ..."
  mkdir -p "$NODE_DIR"
  tar -xJf "$DSH_DESKTOP_HOME/downloads/$TARBALL" -C "$NODE_DIR" --strip-components=1
  rm -f "$DSH_DESKTOP_HOME/downloads/$TARBALL"
fi
export PATH="$NODE_DIR/bin:$DSH_DESKTOP_HOME/npm-global/bin:$PATH"

# ---------- 2. npm global packages into a private prefix ----------
export NPM_CONFIG_PREFIX="$DSH_DESKTOP_HOME/npm-global"
export NPM_CONFIG_CACHE="$DSH_DESKTOP_HOME/npm-cache"
REGISTRY=""
for r in ${NPM_REGISTRIES//,/ }; do
  if npm ping --registry "$r" >/dev/null 2>&1; then REGISTRY="$r"; break; fi
done
[ -n "$REGISTRY" ] || fail "no npm registry reachable"
export NPM_CONFIG_REGISTRY="$REGISTRY"
progress "npm registry $REGISTRY"

ensure_pkg() { # <spec> <bin-name>
  local spec="$1" bin="$2"
  if [ -x "$NPM_CONFIG_PREFIX/bin/$bin" ] && [ "${DSH_DESKTOP_FORCE_INSTALL:-0}" != "1" ]; then
    progress "$bin already installed"
  else
    step "install-$bin"
    progress "npm install -g $spec (this can take a few minutes) ..."
    npm install -g "$spec"
  fi
}

ensure_pkg "$DSH_PACKAGE@$DSH_VERSION" dsh
ensure_pkg "pnpm@$PNPM_VERSION" pnpm

# ---------- 3. sanity ----------
DSH_BIN="$NPM_CONFIG_PREFIX/bin/dsh"
step "verify"
"$DSH_BIN" --version
printf '[dsh-desktop] info dsh %s\n' "$($DSH_BIN --version)"
printf '[dsh-desktop] info node %s\n' "$(node --version)"
printf '[dsh-desktop] info pnpm %s\n' "$(pnpm --version 2>/dev/null || echo missing)"
step "done"
