<#
.SYNOPSIS
  Create (or remove) the two Desktop shortcuts: "Matic Desk Hub" and "Matic Desk Agent".

.DESCRIPTION
  Reproducible on another machine, which hand-made .lnk files are not: clone the repo, run this
  once. Both shortcuts point at the .cmd wrappers beside this file and use matic-desk.ico (the
  Matic bot image from the avatar work, converted; no new artwork).

  Run from any PowerShell:
    powershell -NoProfile -ExecutionPolicy Bypass -File tools\launchers\install-shortcuts.ps1

.PARAMETER Remove
  Delete the two shortcuts instead of creating them.
#>
[CmdletBinding()]
param(
  [switch]$Remove
)

$ErrorActionPreference = 'Stop'
$here    = $PSScriptRoot
$desktop = [Environment]::GetFolderPath('Desktop')
$icon    = Join-Path $here 'matic-desk.ico'

$shortcuts = @(
  @{ Name = 'Matic Desk Hub';   Target = (Join-Path $here 'start-hub.cmd');   Description = 'Preflight, start and warm the Matic Desk hub. Wait for READY.' },
  @{ Name = 'Matic Desk Agent'; Target = (Join-Path $here 'start-agent.cmd'); Description = 'Check the hub, then launch the Matic Desk agent elevated (UAC prompt).' }
)

if ($Remove) {
  foreach ($s in $shortcuts) {
    $lnk = Join-Path $desktop ($s.Name + '.lnk')
    if (Test-Path $lnk) { Remove-Item $lnk -Force; Write-Host "removed  $lnk" } else { Write-Host "absent   $lnk" }
  }
  exit 0
}

foreach ($s in $shortcuts) {
  if (-not (Test-Path $s.Target)) { throw "missing launcher: $($s.Target)" }
}
if (-not (Test-Path $icon)) { Write-Host "no icon at $icon - shortcuts will use the default cmd icon" -ForegroundColor Yellow }

$shell = New-Object -ComObject WScript.Shell
foreach ($s in $shortcuts) {
  $lnk = Join-Path $desktop ($s.Name + '.lnk')
  $sc = $shell.CreateShortcut($lnk)
  $sc.TargetPath       = $s.Target
  $sc.WorkingDirectory = $here
  $sc.Description      = $s.Description
  $sc.WindowStyle      = 1
  if (Test-Path $icon) { $sc.IconLocation = "$icon,0" }
  $sc.Save()
  Write-Host "created  $lnk" -ForegroundColor Green
  Write-Host "         -> $($s.Target)" -ForegroundColor DarkGray
}
Write-Host ''
Write-Host 'Order on the day: Hub first, wait for READY, then Agent.' -ForegroundColor Cyan
