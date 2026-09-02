<#
.SYNOPSIS
  Returns this machine to a clean state between demo runs.

.DESCRIPTION
  Stage tooling, NOT part of the product. Run elevated, LOCALLY (not over a remote session -
  it re-enables network adapters, and if one is disabled your remote session is already gone).

  Idempotent: safe to run when nothing is broken. Restores every fault inject-fault.ps1 can
  create, whether or not this script knows which one was used.

.EXAMPLE
  .\reset-demo.ps1
#>
[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'

function Assert-Elevated {
  $id = [Security.Principal.WindowsIdentity]::GetCurrent()
  $principal = New-Object Security.Principal.WindowsPrincipal($id)
  if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    throw 'This script must be run from an elevated PowerShell window.'
  }
}

Assert-Elevated
Write-Host 'Resetting demo machine state...' -ForegroundColor Cyan
$problems = @()

# ---- 1. Services back to running ----
foreach ($svc in @('Spooler', 'Audiosrv', 'Dhcp', 'Dnscache')) {
  try {
    $s = Get-Service -Name $svc -ErrorAction Stop
    if ($s.Status -ne 'Running') {
      Write-Host "  starting $svc (was $($s.Status))..." -ForegroundColor Yellow
      Start-Service -Name $svc
      (Get-Service -Name $svc).WaitForStatus('Running', '00:00:30')
    }
    Write-Host "  $svc : $((Get-Service -Name $svc).Status)" -ForegroundColor Green
  } catch {
    $problems += "$svc could not be started: $($_.Exception.Message)"
    Write-Host "  $svc : FAILED - $($_.Exception.Message)" -ForegroundColor Red
  }
}

# ---- 2. Re-enable every disabled physical adapter ----
$disabled = Get-NetAdapter -Physical | Where-Object { $_.Status -eq 'Disabled' }
if ($disabled) {
  foreach ($a in $disabled) {
    try {
      Write-Host "  enabling adapter $($a.Name)..." -ForegroundColor Yellow
      Enable-NetAdapter -Name $a.Name -Confirm:$false
    } catch {
      $problems += "adapter $($a.Name) could not be enabled: $($_.Exception.Message)"
      Write-Host "  adapter $($a.Name) : FAILED" -ForegroundColor Red
    }
  }
  Start-Sleep -Seconds 4
} else {
  Write-Host '  no disabled physical adapters' -ForegroundColor Green
}

# ---- 3. Renew DHCP and flush DNS ----
try {
  & "$env:SystemRoot\System32\ipconfig.exe" /renew | Out-Null
  & "$env:SystemRoot\System32\ipconfig.exe" /flushdns | Out-Null
  Write-Host '  DHCP renewed, DNS cache flushed' -ForegroundColor Green
} catch {
  $problems += "DHCP renew / DNS flush failed: $($_.Exception.Message)"
}

# ---- 4. Report the state the demo will actually start from ----
Write-Host "`nMachine state:" -ForegroundColor Cyan
Get-Service -Name Spooler, Audiosrv, Dhcp, Dnscache |
  Select-Object Name, Status |
  Format-Table -AutoSize

Get-NetAdapter -Physical |
  Select-Object Name, Status, LinkSpeed |
  Format-Table -AutoSize

$primary = Get-NetIPConfiguration |
  Where-Object { $_.IPv4DefaultGateway -and $_.NetAdapter.Status -eq 'Up' } |
  Select-Object -First 1
if ($primary) {
  $addr = ($primary.IPv4Address | Select-Object -First 1).IPAddress
  Write-Host "Primary: $($primary.InterfaceAlias)  ip=$addr  gateway=$($primary.IPv4DefaultGateway.NextHop)" -ForegroundColor Green
} else {
  $problems += 'No adapter has a default gateway - this machine is still offline.'
  Write-Host 'WARNING: no adapter has a default gateway. This machine is still offline.' -ForegroundColor Red
}

$stateFile = Join-Path $PSScriptRoot 'demo-state.json'
if (Test-Path $stateFile) { Remove-Item $stateFile -Force }

# Clear the audit log so each rehearsal run starts from an empty trail.
$auditFile = Join-Path $PSScriptRoot '..\audit\audit.jsonl'
if (Test-Path $auditFile) {
  Remove-Item $auditFile -Force
  Write-Host 'Audit log cleared.' -ForegroundColor Green
}

if ($problems.Count -gt 0) {
  Write-Host "`nRESET INCOMPLETE:" -ForegroundColor Red
  $problems | ForEach-Object { Write-Host "  - $_" -ForegroundColor Red }
  exit 1
}
Write-Host "`nMachine is clean and ready for a run." -ForegroundColor Cyan
