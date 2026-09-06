@echo off
title Matic Desk Agent
rem Double-click target. All the logic is in start-agent.ps1 beside this file.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0start-agent.ps1" %*
echo.
pause
