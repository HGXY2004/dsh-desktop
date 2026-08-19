# DSH Desktop

English | [中文](README.zh.md)

A Windows 10/11 desktop app built around **DeepSeek Harness (dsh)**. The harness and its entire runtime live inside **WSL2**; the desktop shell only bootstraps, supervises, and windows it - zero-config on first launch, with all dsh configuration surfaces and plugin extensibility preserved.

## Architecture

```
┌────────────────────────── Windows 10/11 ──────────────────────────┐
│  DSH Desktop (Electron)                                           │
│  ├─ Control center: status / settings / plugins / config / logs    │
│  ├─ Main window: the dsh Web GUI (http://127.0.0.1:<port>)         │
│  └─ Bootstrapper driven through wsl.exe ↓                          │
│ ────────────────────────── WSL2 (Ubuntu, ...) ──────────────────── │
│  ~/.dsh-desktop/                 ← all user-space, no sudo         │
│  ├─ runtime/node-v22.x/          ← Node.js from the official tar   │
│  ├─ npm-global/                  ← dsh, pnpm (private prefix)      │
│  └─ state/                       ← pid & co.                       │
│  ~/.dsh/                         ← native dsh home (profiles, ...) │
│  └─ profiles/web/                ← web profile (auto-initialized)  │
│  dsh web --host 127.0.0.1 --port 0  ->  WSL2 localhost forwarding  │
└───────────────────────────────────────────────────────────────────┘
```

Design points:

- **dsh stays untouched**: the desktop app is a lifecycle shell around `dsh web`. Every dsh capability (`--patch`, `--dump-config`, `dsh plugin`, profiles) remains available.
- **No sudo ever**: Node.js / dsh / pnpm install under `~/.dsh-desktop` in the distro; a shipped `launch.sh` assembles the PATH.
- **Network-friendly**: Node mirror and npm registry are configurable fallback chains (default npmmirror -> official).

## Requirements

- Windows 10 (1903+, with WSL2 support) or Windows 11
- WSL2 enabled with any distro (Ubuntu recommended; `wsl -l -v` shows VERSION 2)
- Internet on first launch (downloads Node.js ~30MB and dsh); offline afterwards

No WSL2 yet? Run `wsl --install -d Ubuntu` as administrator, reboot, and finish the distro init in the Microsoft Store.

## Quick start

### Installer

1. Build or obtain `DSH Desktop-1.0.0-setup.exe` (NSIS; a portable build is also produced)
2. On launch the app automatically: detects WSL2 + distro, installs the user-space runtime (Node.js + dsh + pnpm) inside it, starts `dsh web`, and opens the desktop window
3. Configure models / API keys in the Web GUI settings (stored inside WSL at `~/.dsh`, identical to the CLI)

### From source

```powershell
npm install        # .npmrc points at npmmirror mirrors
npm start          # dev run
npm run smoke      # headless end-to-end verification (exit 0 = pipeline ready)
npm run dist       # build the Windows installer + portable (release/)
```

## Preserved configuration

DSH Desktop intercepts nothing. Desktop settings (`%APPDATA%/dsh-desktop/settings.json`) only decide *how dsh is launched*:

| Desktop setting | dsh side |
|---|---|
| Workspace (Windows path) | mapped to `/mnt/c/...` as dsh's launch cwd (workspace root) |
| DSH_HOME | injected as `DSH_HOME` (default `~/.dsh`) |
| Fixed port | `dsh web --port` (0 = OS-picked) |
| Extra args | passed through to `dsh web` (e.g. `--patch extra.yml`) |
| Extra env vars | per-line KEY=VALUE injected into the dsh process |
| Node mirror / registry / dsh version | bootstrapper parameters |

dsh's own layering is editable in the **Config** tab (or via `\\wsl.localhost\<distro>\home\<user>\.dsh` in any editor):

`dsh.profile.bundles -> profiles/web/cordis.patch.yml -> ~/.dsh/cordis.patch.yml -> --patch`

## Extensibility

- **Plugins**: the Plugins tab is a graphical front for `dsh plugin --profile web <pnpm args>` - `add / remove / update / outdated / ls / why`; packages declaring `dsh.bundle` join the layer stack automatically.
- **Arbitrary CLI**: the "dump composed config" button runs `dsh --profile web --dump-config`; any other args can be passed in the input box.
- **WSL terminal**: one click opens a terminal in the workspace (Windows Terminal preferred) for native dsh/pnpm use.
- **Profiles**: switch or add profiles by editing "extra args" (e.g. a `--profile tui` boot) - native dsh semantics throughout.

## Troubleshooting

- **"WSL2 required"**: run `wsl --install -d Ubuntu`; convert a WSL1 distro with `wsl --set-version <name> 2`.
- **localhost forwarding broken**: make sure it is not disabled in `%USERPROFILE%\.wslconfig` (on by default). The app keeps probing and logs progress.
- **Corporate network / offline**: point the mirror chains at internal sources in settings; or bootstrap `~/.dsh-desktop` once on a connected machine and copy the tree over.
- **Upgrading dsh**: set the dsh version in settings (or keep `latest`) -> "Reinstall runtime (force)".

## License

MIT
