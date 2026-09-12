@echo off
REM Matic Desk - admin console code. Wraps admin-totp.ps1 so a Desktop shortcut has
REM something to point at. See install-shortcuts.ps1.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0admin-totp.ps1" %*
