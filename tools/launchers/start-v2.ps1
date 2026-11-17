<#
.SYNOPSIS
  Start Matic Desk v2 - the live video persona - in one go: database, hub, and the app.

.DESCRIPTION
  Stage tooling, not product (D220), like the other launchers beside it. v2 needs four things to
  be true at once and this makes them true in order:

    1. PostgreSQL is up            (the dev container; `npm.cmd run db:up`)
    2. the hub is running WITH the Nuance API key in ITS environment, and nowhere else
    3. no older Matic Desk is in the notification area - it is a single-instance app, so a second
       launch hands over to the one already running, which was started without the live persona
    4. the app is started with MATIC_PERSONA=1

  The key is read from a FILE and passed to the hub's process only. It is never written to the
  repo, to config.json, or to this window. The app never sees it.

  In the app: click "Talk face to face" under the avatar. Every session spends credits from the
  moment the face appears until it ends, silence included.

.PARAMETER KeyFile
  A text file holding the Nuance API key and nothing else. Defaults to the MATIC_NUANCE_KEY_FILE
  environment variable. The Desktop shortcut passes it, so the path is not in the repository.

.PARAMETER NoStopExisting
  Do not stop a Matic Desk that is already running. The launch will then hand over to it and
  nothing new will start - useful only to see that happen.

.EXAMPLE
  powershell -NoProfile -ExecutionPolicy Bypass -File tools\launchers\start-v2.ps1 -KeyFile "C:\path\to\Nuance Key.txt"
#>
[CmdletBinding()]
param(
  [string]$KeyFile = $env:MATIC_NUANCE_KEY_FILE,
  [switch]$NoStopExisting,
  # Start the hub WITHOUT allowing the camera. With it allowed, the user still turns it on.
  [switch]$NoCamera
)

$ErrorActionPreference = 'Stop'
$repo   = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$server = Join-Path $repo 'server'
$client = Join-Path $repo 'client'

function Say([string]$m)  { Write-Host $m }
function Fail([string]$m) { Write-Host ''; Write-Host "STOPPED: $m" -ForegroundColor Red; Write-Host ''; [void](Read-Host 'Press Enter to close'); exit 1 }

# One thing, one type: status goes to Write-Host and the function returns a boolean (CLAUDE.md).
function Test-Port([int]$port) {
  $c = New-Object System.Net.Sockets.TcpClient
  try { $c.Connect('127.0.0.1', $port); return [bool]$c.Connected } catch { return $false } finally { $c.Close() }
}
function Wait-Port([int]$port, [int]$seconds) {
  for ($i = 0; $i -lt $seconds; $i++) { if ([bool](Test-Port $port)) { return $true }; Start-Sleep -Seconds 1 }
  return $false
}

Say 'Matic Desk v2 - the live video persona'
Say '--------------------------------------'

# ---- the key ---------------------------------------------------------------------------------
if (-not $KeyFile) { Fail 'no key file. Pass -KeyFile "<path to a text file holding the Nuance API key>", or set MATIC_NUANCE_KEY_FILE.' }
if (-not (Test-Path -LiteralPath $KeyFile)) { Fail "the key file was not found: $KeyFile" }
$key = (Get-Content -LiteralPath $KeyFile -Raw).Trim()
if (-not $key.StartsWith('nk_')) { Fail 'the key file does not hold a Nuance API key (it should start with nk_).' }
Say '[1/4] API key read from its file. It goes to the hub and nowhere else.'

# ---- 1. the database -------------------------------------------------------------------------
if (-not [bool](Test-Port 5433)) {
  Say '[2/4] Starting PostgreSQL (Docker)...'
  Push-Location -LiteralPath $server
  try { & npm.cmd run db:up | Out-Null } finally { Pop-Location }
  if (-not [bool](Wait-Port 5433 60)) { Fail 'PostgreSQL did not come up on port 5433. Is Docker Desktop running?' }
}
Say '[2/4] PostgreSQL is up.'

# ---- 2. the hub, with the key in ITS environment ---------------------------------------------
# Whatever is on 8787 is replaced: a hub started without the key answers 503 to every live session,
# and from the outside the two look the same.
$onPort = Get-NetTCPConnection -LocalPort 8787 -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
if ($onPort) {
  Say '      (replacing the hub already on port 8787)'
  Stop-Process -Id $onPort.OwningProcess -Force -Confirm:$false
  Start-Sleep -Seconds 2
}
$env:MATIC_NUANCE_API_KEY = $key
# D319 (the founder's): the persona may be shown the user's camera. Allowed HERE, for the hub this
# launcher starts, and not in the repository's config. The app still sends no picture until its
# user clicks "Camera off" to turn it on. Pass -NoCamera to start without it.
if (-not $NoCamera) { $env:MATIC_NUANCE_CAMERA = '1' }
# The hub's default cap is 6 sessions per install per hour - sized to stop a loop, and too low for an
# evening of testing: on 2026-11-17 it refused a session mid-test with nothing on the panel to say why.
# This launcher is stage tooling, so it starts its hub with room to test. A deployment sets its own.
$env:MATIC_NUANCE_CAP_DEVICE_HOUR = '40'
$env:MATIC_NUANCE_CAP_TENANT_DAY = '200'
try {
  Start-Process -FilePath 'powershell.exe' -WorkingDirectory $server -WindowStyle Minimized `
    -ArgumentList '-NoProfile', '-NoExit', '-Command', "`$Host.UI.RawUI.WindowTitle = 'Matic Desk hub (v2)'; npm.cmd start"
} finally {
  # Out of THIS window's environment the moment the hub has inherited it.
  Remove-Item Env:MATIC_NUANCE_API_KEY -ErrorAction SilentlyContinue
  Remove-Item Env:MATIC_NUANCE_CAMERA -ErrorAction SilentlyContinue
  Remove-Item Env:MATIC_NUANCE_CAP_DEVICE_HOUR -ErrorAction SilentlyContinue
  Remove-Item Env:MATIC_NUANCE_CAP_TENANT_DAY -ErrorAction SilentlyContinue
  $key = $null
}
if (-not [bool](Wait-Port 8787 90)) { Fail 'the hub did not start listening on port 8787. Look at the minimised "Matic Desk hub (v2)" window.' }
Say '[3/4] The hub is up, with live sessions on. (Its window is minimised - leave it open.)'

# ---- 3. an older Matic Desk in the notification area -----------------------------------------
$clientPattern = [regex]::Escape($client)
$running = Get-CimInstance Win32_Process -Filter "Name='electron.exe'" |
  Where-Object { $_.CommandLine -match $clientPattern -and $_.CommandLine -notmatch '--type=' -and $_.CommandLine -notmatch '--user-data-dir' }
if ($running -and -not $NoStopExisting) {
  Say '      (closing the Matic Desk already running - it was started without the live persona)'
  $running | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -Confirm:$false }
  Start-Sleep -Seconds 2
}

# ---- 3b. an enrollment secret for this launch ------------------------------------------------
# A live session needs the app to hold an enrollment credential: the hub mints a session for an
# ENROLLED endpoint and for nobody else. On 2026-11-17 the app started from this launcher came up
# with "[enroll] disabled" - no stored credential found, and no secret to enroll with, because the
# repository's config.json keeps its secret empty on purpose (D285) - and every click on "Talk face
# to face" failed without reaching the hub. So the launcher mints a ONE-DAY secret for the tenant
# in client\config.json and hands it to the app for this one launch, the way MATIC_ENROLLMENT_SECRET
# is meant to be used. An app that already holds a credential ignores it.
$enrollSecret = $null
try {
  $tenant = (Get-Content -LiteralPath (Join-Path $client 'config.json') -Raw | ConvertFrom-Json).enrollment.tenant
  if ($tenant) {
    Push-Location -LiteralPath $server
    try { $minted = & node bin/devices.mjs create-secret $tenant --ttl-days 1 2>&1 | Out-String } finally { Pop-Location }
    $m = [regex]::Match($minted, '(?m)^\s*secret\s+(\S+)\s*$')
    if ($m.Success) { $enrollSecret = $m.Groups[1].Value }
  }
} catch { $enrollSecret = $null }
if ($enrollSecret) { Say '      (a one-day enrollment secret is ready for this launch)' }
else { Say '      (no enrollment secret could be minted - the app will use the credential it already holds, if it holds one)' }

# ---- 4. the app ------------------------------------------------------------------------------
$env:MATIC_PERSONA = '1'
if ($enrollSecret) { $env:MATIC_ENROLLMENT_SECRET = $enrollSecret }
try {
  Start-Process -FilePath 'cmd.exe' -WorkingDirectory $client -WindowStyle Hidden -ArgumentList '/c', 'npm.cmd start'
} finally {
  Remove-Item Env:MATIC_PERSONA -ErrorAction SilentlyContinue
  Remove-Item Env:MATIC_ENROLLMENT_SECRET -ErrorAction SilentlyContinue
  $enrollSecret = $null
}
Say '[4/4] Matic Desk is starting.'
Say ''
Say 'In the Matic Desk window: click "Talk face to face" under the avatar.'
Say 'The microphone starts OFF - click "Microphone off" to turn it on.'
Say 'Credits run from the moment the face appears until you click "End live video".'
Say ''
Start-Sleep -Seconds 6
