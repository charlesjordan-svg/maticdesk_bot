@echo off
title Matic Desk v2
rem Double-click target for Matic Desk v2, the live video persona. All the logic is in
rem start-v2.ps1 beside this file. Arguments are passed through: the Desktop shortcut passes
rem -KeyFile with the path of the text file that holds the Nuance API key.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0start-v2.ps1" %*
