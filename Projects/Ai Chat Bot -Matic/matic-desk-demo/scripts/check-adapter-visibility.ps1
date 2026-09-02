<#
.SYNOPSIS
  Answers one question: does a DISABLED adapter still appear to the probe?

.DESCRIPTION
  Stage tooling, NOT part of the product. This settles DEMO-RUNBOOK.md section 3.2, which decides
  whether Scenario 2 should use -Fault network or -Fault dhcp.

  inject-fault.ps1 -Fault network runs Disable-NetAdapter. The probe reads adapters through
  GetAdaptersInfo, which is expected to omit disabled adapters entirely. On a machine with several
  adapters that does not matter. On a single-NIC machine it may leave the probe with NO adapter at
  all - and then neither the keyword router nor the state-only fallback has anything to propose,
  so Scenario 2 produces an honest "I can see no adapter I can act on" instead of a demo.

  WHAT THIS DOES: disables the primary physical adapter, reads the probe, and re-enables it. The
  re-enable is in a finally block, so it runs even if the probe throws or you Ctrl-C out.

  RUN IT LOCALLY AND ELEVATED. Never over a remote session - the first thing it does disconnects
  you, and the finally block cannot help a session that is already gone.

  On a machine with a second connected adapter you stay online throughout, and this answers the
  mechanism question. On a true single-NIC machine you lose connectivity for a few seconds, and
  this answers the question that actually matters.

.EXAMPLE
  .\check-adapter-visibility.ps1
#>
[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'

$principal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
  throw 'This script must be run from an elevated PowerShell window.'
}

$root = Split-Path -Parent $PSScriptRoot
$probeScript = Join-Path $PSScriptRoot 'probe-json.mjs'

function Read-Probe {
  Push-Location $root
  try { return (& node $probeScript | Out-String).Trim() | ConvertFrom-Json }
  finally { Pop-Location }
}

# The adapter that actually carries traffic - same selection inject-fault.ps1 uses.
$route = Get-NetRoute -DestinationPrefix '0.0.0.0/0' -ErrorAction SilentlyContinue |
         Sort-Object RouteMetric | Select-Object -First 1
$adapter = $null
if ($route) {
  $candidate = Get-NetAdapter -InterfaceIndex $route.InterfaceIndex -ErrorAction SilentlyContinue
  if ($candidate -and $candidate.Status -eq 'Up' -and $candidate.HardwareInterface) { $adapter = $candidate }
}
if (-not $adapter) {
  $adapter = Get-NetAdapter -Physical | Where-Object { $_.Status -eq 'Up' } |
             Sort-Object -Property LinkSpeed -Descending | Select-Object -First 1
}
if (-not $adapter) { throw 'Could not identify a connected physical adapter.' }

$others = @(Get-NetAdapter -Physical | Where-Object { $_.Status -eq 'Up' -and $_.Name -ne $adapter.Name })
$singleNic = $others.Count -eq 0

Write-Host "`nAdapter visibility check" -ForegroundColor Cyan
Write-Host "  target: $($adapter.Name)  ($($adapter.InterfaceDescription))" -ForegroundColor Gray
if ($singleNic) {
  Write-Host '  this machine has NO other connected physical adapter - it will drop offline for a few seconds' -ForegroundColor Yellow
} else {
  Write-Host "  other connected adapters: $(($others | ForEach-Object Name) -join ', ') - you stay online" -ForegroundColor Gray
}

$before = Read-Probe
Write-Host "`n  before: $($before.adapters) adapters visible, $($before.actionable) actionable, online=$($before.online)" -ForegroundColor Gray

$during = $null
try {
  Write-Host "  disabling $($adapter.Name)..." -ForegroundColor Yellow
  Disable-NetAdapter -Name $adapter.Name -Confirm:$false
  Start-Sleep -Seconds 2
  $during = Read-Probe
  Write-Host "  while disabled: $($during.adapters) adapters visible, $($during.actionable) actionable, online=$($during.online)" -ForegroundColor Yellow
}
finally {
  # Runs even if the probe throws or the script is interrupted. Leaving an adapter disabled is
  # the one outcome this script must never produce.
  Write-Host "  re-enabling $($adapter.Name)..." -ForegroundColor Yellow
  Enable-NetAdapter -Name $adapter.Name -Confirm:$false -ErrorAction Continue
  for ($i = 0; $i -lt 30; $i++) {
    Start-Sleep -Seconds 1
    if ((Get-NetAdapter -Name $adapter.Name).Status -eq 'Up') { break }
  }
  $status = (Get-NetAdapter -Name $adapter.Name).Status
  if ($status -eq 'Up') {
    Write-Host "  $($adapter.Name) is back Up" -ForegroundColor Green
  } else {
    Write-Host "  WARNING: $($adapter.Name) is $status - run reset-demo.ps1" -ForegroundColor Red
  }
}

Start-Sleep -Seconds 3
$after = Read-Probe
Write-Host "  after:  $($after.adapters) adapters visible, $($after.actionable) actionable, online=$($after.online)" -ForegroundColor Gray

Write-Host "`nVERDICT" -ForegroundColor Cyan
if ($null -eq $during) {
  Write-Host '  Inconclusive - the probe did not run while the adapter was disabled.' -ForegroundColor Red
  exit 1
}

$vanished = $during.adapters -lt $before.adapters
if ($vanished) {
  Write-Host "  A disabled adapter DISAPPEARS from the probe ($($before.adapters) -> $($during.adapters))." -ForegroundColor Yellow
  if ($singleNic) {
    Write-Host '  On this single-NIC machine that leaves nothing to propose.' -ForegroundColor Red
    Write-Host '  USE -Fault dhcp FOR SCENARIO 2. Do not use -Fault network.' -ForegroundColor Red
  } else {
    Write-Host '  This machine has other adapters, so Scenario 2 still has something to act on here.' -ForegroundColor Gray
    Write-Host '  But on a single-NIC demo machine it would not. Prefer -Fault dhcp.' -ForegroundColor Yellow
  }
} else {
  Write-Host "  A disabled adapter REMAINS visible to the probe ($($during.adapters) still listed)." -ForegroundColor Green
  Write-Host "  Actionable while disabled: $($during.actionable)." -ForegroundColor Gray
  if ($during.actionable -gt 0) {
    Write-Host '  -Fault network is safe to use for Scenario 2 on this machine.' -ForegroundColor Green
  } else {
    Write-Host '  Visible but NOT actionable, so the router still has no candidate.' -ForegroundColor Yellow
    Write-Host '  USE -Fault dhcp FOR SCENARIO 2.' -ForegroundColor Yellow
  }
}
Write-Host ''
