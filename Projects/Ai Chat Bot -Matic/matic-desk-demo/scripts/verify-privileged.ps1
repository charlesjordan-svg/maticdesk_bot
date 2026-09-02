<#
.SYNOPSIS
  Proves the four privileged primitives actually work on THIS machine, elevated.

.DESCRIPTION
  This is the gate on the handover's irreducible core (§9): "type a printer problem, spooler
  actually restarts, printer works." Run this elevated on the demo machine before rehearsing.

  It stops the spooler, runs the real broker path to restart it, and reports what happened.
  It does NOT touch the network adapter by default - pass -IncludeNetwork to include the
  disruptive R2 primitive.
#>
[CmdletBinding()]
param([switch]$IncludeNetwork)

$ErrorActionPreference = 'Stop'
$id = [Security.Principal.WindowsIdentity]::GetCurrent()
$principal = New-Object Security.Principal.WindowsPrincipal($id)
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
  Write-Host 'Not elevated. Re-run this from an elevated PowerShell window.' -ForegroundColor Red
  exit 1
}

$root = Split-Path -Parent $PSScriptRoot
Write-Host 'Breaking the spooler so the test has a real fault to fix...' -ForegroundColor Yellow
Stop-Service -Name 'Spooler' -Force
(Get-Service -Name 'Spooler').WaitForStatus('Stopped', '00:00:20')
Write-Host "  Spooler is now $((Get-Service -Name 'Spooler').Status)" -ForegroundColor Green

$env:MATIC_ELEVATED = '1'
if ($IncludeNetwork) { $env:MATIC_TEST_NETWORK = '1' }
Push-Location $root
try {
  & node 'test/privileged.test.mjs'
  $code = $LASTEXITCODE
} finally {
  Pop-Location
}

Write-Host "`nFinal spooler state: $((Get-Service -Name 'Spooler').Status)" -ForegroundColor Cyan
if ((Get-Service -Name 'Spooler').Status -ne 'Running') {
  Write-Host 'Spooler is not running - starting it so the machine is left clean.' -ForegroundColor Yellow
  Start-Service -Name 'Spooler'
}
exit $code
