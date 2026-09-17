# DSH Desktop - in-place app.asar patch installer (1.0.0 -> 1.0.1).
# Fixes: main window now captures the token-authenticated `dsh web:` URL
# (dsh >= 0.1.5 browser auth), passes --no-open, and uses the new
# `dsh plugin --profile web ...` CLI for the control-center plugin manager.
#
# Usage: double-click install-patch.bat next to this file, or run
#        powershell -ExecutionPolicy Bypass -File install-patch.ps1
# The script self-elevates (one UAC prompt), quits the running app,
# backs up the original asar once, installs the patched one, relaunches.

$ErrorActionPreference = 'Stop'

# ---- self-elevate ----
$identity  = [Security.Principal.WindowsIdentity]::GetCurrent()
$principal = New-Object Security.Principal.WindowsPrincipal($identity)
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
  Start-Process powershell -Verb RunAs -ArgumentList ('-NoProfile -ExecutionPolicy Bypass -File "{0}"' -f $PSCommandPath)
  exit
}

$exe  = 'C:\Program Files\DSH Desktop\DSH Desktop.exe'
$dest = 'C:\Program Files\DSH Desktop\resources\app.asar'
$bak  = 'C:\Program Files\DSH Desktop\resources\app.asar.bak-1.0.0'
$src  = Join-Path $PSScriptRoot 'app-1.0.1.asar'

if (-not (Test-Path $exe))  { throw "DSH Desktop.exe not found at $exe" }
if (-not (Test-Path $src))  { throw "patched asar not found next to this script: $src" }

Write-Host '[1/5] Quitting DSH Desktop (its WSL2 server goes down with it) ...'
& taskkill /F /T /IM 'DSH Desktop.exe' 2>$null | Out-Null
$deadline = (Get-Date).AddSeconds(20)
while ((Get-Process -Name 'DSH Desktop' -ErrorAction SilentlyContinue) -and (Get-Date) -lt $deadline) {
  Start-Sleep -Milliseconds 500
}

Write-Host '[2/5] Stopping the old dsh web server inside WSL2 ...'
try {
  & wsl.exe -- bash -c 'pid=$(cat "$HOME/.dsh-desktop/state/server.pid" 2>/dev/null); if [ -n "$pid" ]; then kill "$pid" 2>/dev/null || true; for _ in $(seq 1 30); do kill -0 "$pid" 2>/dev/null || break; sleep 0.5; done; kill -9 "$pid" 2>/dev/null || true; rm -f "$HOME/.dsh-desktop/state/server.pid"; fi' | Out-Null
} catch { Write-Host '       (wsl cleanup skipped - the app killstale step will handle it)' }
Start-Sleep -Seconds 1

Write-Host '[3/5] Backing up original app.asar ...'
if (-not (Test-Path $bak)) { Copy-Item $dest $bak }

Write-Host '[4/5] Installing patched app.asar (1.0.1) ...'
Copy-Item $src $dest -Force

Write-Host '[5/5] Done.'
Add-Type -AssemblyName System.Windows.Forms
$answer = [System.Windows.Forms.MessageBox]::Show(
  "DSH Desktop 1.0.1 patch installed.`n`nOK = launch DSH Desktop now`nCancel = launch it yourself later",
  'DSH Desktop patch', 'OKCancel', 'Information')
if ($answer -eq [System.Windows.Forms.DialogResult]::OK) {
  Start-Process $exe
}
