<#
.SYNOPSIS
  Print a rolling six-digit admin console code, refreshing as each 30-second step turns over.

.DESCRIPTION
  Wraps `node bin/admin.mjs totp <base32-secret>`, which is a SMOKE CHECK, not the intended
  sign-in path. The intended path is an authenticator app enrolled from the otpauth:// URI that
  `admin.mjs create-user` and `admin.mjs reset` print once. This exists because the dev hub is
  loopback-only with no authentication at all, so a local code printer costs nothing there. It
  has no place on a machine that is not this one.

  The secret is NEVER written to disk by this script. It is asked for, held in memory, and lost
  when the window closes. If you set MATIC_ADMIN_TOTP_SECRET yourself, it is used without asking
  -- that is your choice about where a secret lives, not this script's.

  The secret is not recoverable from the database: bin/admin.mjs stores it hashed. If you do not
  have the one printed when the user was created, mint a fresh one:

    npm.cmd run admin reset <tenant-slug> <email>

.PARAMETER Secret
  The base32 authenticator secret. Prompted for if omitted and the environment variable is unset.

.PARAMETER Once
  Print a single code and exit, instead of refreshing until the window is closed.
#>
[CmdletBinding()]
param(
  [string]$Secret,
  [switch]$Once
)

$ErrorActionPreference = 'Stop'
$repo = Resolve-Path (Join-Path $PSScriptRoot '..\..')
$server = Join-Path $repo 'server'

if (-not (Test-Path (Join-Path $server 'bin\admin.mjs'))) {
  Write-Host "not found: $server\bin\admin.mjs" -ForegroundColor Red
  Write-Host "this script expects to sit in tools\launchers\ inside the repo." -ForegroundColor DarkGray
  Read-Host 'press Enter to close'
  exit 1
}

if (-not $Secret) { $Secret = $env:MATIC_ADMIN_TOTP_SECRET }
if (-not $Secret) {
  Write-Host ''
  Write-Host '  Matic Desk - admin console code' -ForegroundColor Cyan
  Write-Host ''
  Write-Host '  Paste the base32 authenticator secret printed by create-user or reset.' -ForegroundColor DarkGray
  Write-Host '  It is not stored. Close the window and it is gone.' -ForegroundColor DarkGray
  Write-Host ''
  $Secret = Read-Host '  secret'
}
$Secret = $Secret.Trim() -replace '\s', ''
if (-not $Secret) { Write-Host 'no secret given.' -ForegroundColor Red; Read-Host 'press Enter to close'; exit 1 }

function Get-Code {
  Push-Location $server
  try {
    $out = & node bin/admin.mjs totp $Secret 2>&1 | Out-String
  } finally { Pop-Location }
  if ($LASTEXITCODE -ne 0) { return @{ ok = $false; text = $out.Trim() } }
  $m = [regex]::Match($out, '\b(\d{6})\b')
  if (-not $m.Success) { return @{ ok = $false; text = $out.Trim() } }
  return @{ ok = $true; code = $m.Groups[1].Value }
}

$first = Get-Code
if (-not $first.ok) {
  Write-Host ''
  Write-Host '  that secret was not accepted:' -ForegroundColor Red
  Write-Host "  $($first.text)" -ForegroundColor DarkGray
  Write-Host ''
  Write-Host '  base32 only - A-Z and 2-7. If you have lost it:' -ForegroundColor DarkGray
  Write-Host '    npm.cmd run admin reset <tenant-slug> <email>' -ForegroundColor DarkGray
  Write-Host ''
  Read-Host '  press Enter to close'
  exit 1
}

if ($Once) {
  Write-Host ''
  Write-Host "  $($first.code)" -ForegroundColor Green
  Write-Host ''
  exit 0
}

# Rolling display. A code is only useful for the rest of its 30-second step, and a printed one
# that has already expired is the kind of thing you retype twice before noticing.
Clear-Host
$last = ''
try {
  while ($true) {
    $secondsIntoStep = [int]([DateTimeOffset]::UtcNow.ToUnixTimeSeconds() % 30)
    $left = 30 - $secondsIntoStep
    $r = Get-Code
    if (-not $r.ok) { Write-Host "`n  lost contact with admin.mjs: $($r.text)" -ForegroundColor Red; break }

    if ($r.code -ne $last) { Clear-Host; $last = $r.code }
    Write-Host ''
    Write-Host '  Matic Desk - admin console' -ForegroundColor Cyan
    Write-Host '  http://127.0.0.1:8787/admin' -ForegroundColor DarkGray
    Write-Host ''
    Write-Host "      $($r.code)" -ForegroundColor Green
    Write-Host ''
    $bar = ('#' * [Math]::Max(0, $left)).PadRight(30, '.')
    $colour = if ($left -le 5) { 'Yellow' } else { 'DarkGray' }
    Write-Host "  $bar  $left s"  -ForegroundColor $colour
    Write-Host ''
    Write-Host '  refreshes automatically - close the window when done' -ForegroundColor DarkGray
    Start-Sleep -Milliseconds 900
    if ($r.code -eq $last) { Clear-Host }
  }
} catch {
  Write-Host ''
  Write-Host "  stopped: $_" -ForegroundColor Red
}
Write-Host ''
Read-Host '  press Enter to close'
