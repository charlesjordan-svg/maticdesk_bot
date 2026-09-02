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
Write-Host "Launching Matic Desk elevated from $root ..." -ForegroundColor Cyan
Start-Process -FilePath 'cmd.exe' -ArgumentList '/c', 'npx electron .' -WorkingDirectory $root -Verb RunAs
