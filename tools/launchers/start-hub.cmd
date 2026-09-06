@echo off
title Matic Desk Hub
rem Double-click target. All the logic is in start-hub.ps1 beside this file; this exists so a
rem Desktop shortcut has something to point at and the window stays open at the end.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0start-hub.ps1" %*
echo.
pause
