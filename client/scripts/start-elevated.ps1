<#
.SYNOPSIS
  Launches Matic Desk elevated (the demo build runs as a single elevated process).

.DESCRIPTION
  The demo build has no privilege split - see handover §2. It runs one elevated process with
  the broker in-process behind the Broker interface. Phase 1 replaces this with an unprivileged
  agent plus a Windows Service broker over a named pipe, and this script goes away.

  Triggers a UAC prompt. Accept it, or the four privileged primitives will report
  "this needs the broker" instead of acting (which is the correct unprivileged behaviour).
#>
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot

# Launch the LOCAL electron binary directly, not `npx electron .` inside `cmd /c`.
#
# Three reasons, all of which cost a session on 2026-09-03:
#   - `cmd /c` closes the window the instant anything fails, so the error is unreadable. The app
#     "just does not start" and there is nothing to diagnose.
#   - npx resolves through PATH and can reach for the registry. It is a network-and-environment
#     dependency in the launcher for an app whose own dependency is already sitting in
#     node_modules/. If npx is unavailable or slow, this fails for a reason unrelated to the app.
#   - The same execution-policy rule that makes it `npm.cmd` rather than `npm` in this project
#     blocks `npx.ps1`, so the obvious hand-run fallback fails too.
#
# node_modules/.bin/electron.cmd is what `npm start` resolves to anyway. Check it first and say so.
$electron = Join-Path $root 'node_modules\.bin\electron.cmd'
if (-not (Test-Path $electron)) {
  throw "Electron is not installed at $electron. Run 'npm.cmd install' from client\ first."
}

Write-Host "Launching Matic Desk elevated from $root ..." -ForegroundColor Cyan
Write-Host "  (accept the UAC prompt - without it the four privileged primitives report" -ForegroundColor DarkGray
Write-Host "   'this needs the broker' instead of acting, which is correct but not what you want here)" -ForegroundColor DarkGray
# THE APP PATH IS ABSOLUTE, NOT '.'. Observed 2026-09-05 from the Desktop launcher: "Unable to find
# Electron app at C:\Windows\System32". A process started with -Verb RunAs from an UNELEVATED window
# begins life in System32 regardless of -WorkingDirectory, so `electron .` resolved to the wrong
# folder. It had only ever been run from an already-elevated window, where no UAC hop happens and
# the working directory survives - which is why it looked fine on 2026-09-03.
Start-Process -FilePath $electron -ArgumentList ('"' + $root + '"') -WorkingDirectory $root -Verb RunAs
