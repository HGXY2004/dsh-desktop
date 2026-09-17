@echo off
rem DSH Desktop 1.0.1 in-place patch - double-click to install.
rem Asks for one UAC confirmation, quits the app, swaps resources\app.asar
rem (keeping a one-time backup app.asar.bak-1.0.0), then relaunches the app.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0install-patch.ps1"
