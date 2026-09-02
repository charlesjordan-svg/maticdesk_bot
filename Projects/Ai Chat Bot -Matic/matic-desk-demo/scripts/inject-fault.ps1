<#
.SYNOPSIS
  Breaks something on this machine on purpose, to create a fault on stage.

.DESCRIPTION
  Stage tooling, NOT part of the product. PowerShell is fine here - the "no interpreter
  spawning" rule in the handover (§6) is about what the AGENT does at runtime, because that
  is what EDR watches. This script is run by a human before the demo.

  Run elevated. Pair with reset-demo.ps1 between runs.

.PARAMETER Fault
  printer  - stops the Print Spooler service            (Scenario 1)
  network  - disables the primary network adapter       (Scenario 2)
  dhcp     - releases the DHCP lease, leaving no IP      (Scenario 2, gentler variant)
  sound    - stops the Windows Audio service            (spare)

.EXAMPLE
  .\inject-fault.ps1 -Fault printer
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [ValidateSet('printer', 'network', 'dhcp', 'sound')]
  [string]$Fault
)

$ErrorActionPreference = 'Stop'

function Assert-Elevated {
  $id = [Security.Principal.WindowsIdentity]::GetCurrent()
  $principal = New-Object Security.Principal.WindowsPrincipal($id)
  if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    throw 'This script must be run from an elevated PowerShell window.'
  }
}

# The adapter that actually carries traffic: connected, physical, and holding the default route.
function Get-PrimaryAdapter {
  $route = Get-NetRoute -DestinationPrefix '0.0.0.0/0' -ErrorAction SilentlyContinue |
           Sort-Object RouteMetric |
           Select-Object -First 1
  if ($route) {
    $candidate = Get-NetAdapter -InterfaceIndex $route.InterfaceIndex -ErrorAction SilentlyContinue
    if ($candidate -and $candidate.Status -eq 'Up' -and $candidate.HardwareInterface) { return $candidate }
  }
  Get-NetAdapter -Physical |
    Where-Object { $_.Status -eq 'Up' } |
    Sort-Object -Property LinkSpeed -Descending |
    Select-Object -First 1
}

Assert-Elevated
$stateFile = Join-Path $PSScriptRoot 'demo-state.json'
$state = if (Test-Path $stateFile) { Get-Content $stateFile -Raw | ConvertFrom-Json } else { $null }
$record = @{ fault = $Fault; at = (Get-Date).ToString('o') }
if ($state -and $state.adapterName) { $record.adapterName = $state.adapterName }

switch ($Fault) {
  'printer' {
    Write-Host 'Stopping the Print Spooler service...' -ForegroundColor Yellow
    Stop-Service -Name 'Spooler' -Force
    (Get-Service -Name 'Spooler').WaitForStatus('Stopped', '00:00:20')
    Write-Host "Spooler is now $((Get-Service -Name 'Spooler').Status). Printing will fail." -ForegroundColor Green
  }

  'sound' {
    Write-Host 'Stopping the Windows Audio service...' -ForegroundColor Yellow
    Stop-Service -Name 'Audiosrv' -Force
    (Get-Service -Name 'Audiosrv').WaitForStatus('Stopped', '00:00:20')
    Write-Host "Audiosrv is now $((Get-Service -Name 'Audiosrv').Status)." -ForegroundColor Green
  }

  'network' {
    $adapter = Get-PrimaryAdapter
    if (-not $adapter) { throw 'Could not identify a connected physical adapter to disable.' }
    Write-Host "Disabling adapter: $($adapter.Name) ($($adapter.InterfaceDescription))" -ForegroundColor Yellow
    Write-Warning 'This drops connectivity on this machine. Run reset-demo.ps1 locally to restore it - not over a remote session.'
    $record.adapterName = $adapter.Name
    Disable-NetAdapter -Name $adapter.Name -Confirm:$false
    Write-Host "Adapter $($adapter.Name) is now disabled." -ForegroundColor Green
  }

  'dhcp' {
    $adapter = Get-PrimaryAdapter
    if (-not $adapter) { throw 'Could not identify a connected physical adapter.' }
    Write-Host "Releasing the DHCP lease on $($adapter.Name)..." -ForegroundColor Yellow
    $record.adapterName = $adapter.Name
    # ipconfig is the only reliable release on Windows without WMI gymnastics; stage tooling only.
    & "$env:SystemRoot\System32\ipconfig.exe" /release "$($adapter.Name)" | Out-Null
    Start-Sleep -Seconds 2
    $ip = (Get-NetIPAddress -InterfaceIndex $adapter.InterfaceIndex -AddressFamily IPv4 -ErrorAction SilentlyContinue).IPAddress
    Write-Host "Lease released. IPv4 on $($adapter.Name) is now: $(if ($ip) { $ip } else { 'none' })" -ForegroundColor Green
  }
}

$record | ConvertTo-Json | Set-Content -Path $stateFile -Encoding utf8
Write-Host "`nFault '$Fault' injected. Recorded in $stateFile" -ForegroundColor Cyan
Write-Host 'Run reset-demo.ps1 to restore this machine.' -ForegroundColor Cyan
