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

.PARAMETER Enroll
  Mint a ONE-DAY enrollment secret for the tenant in client\config.json and hand it to the app for
  this launch, so an endpoint with NO stored enrollment can enroll once. Off by default since
  2026-11-17: this launcher used to mint one on EVERY launch, and an app that could not find its
  enrollment.json then enrolled afresh each time - three device rows in two hours, each with its
  own key, and the day's tickets filed under enrollments the newest one cannot read (D284 scopes
  a requester to the enrollment that filed). Pass it on purpose, once, when the [enroll] block
  below says there is no enrollment at the path the app will read.

.EXAMPLE
  powershell -NoProfile -ExecutionPolicy Bypass -File tools\launchers\start-v2.ps1 -KeyFile "C:\path\to\Nuance Key.txt"
#>
[CmdletBinding()]
param(
  [string]$KeyFile = $env:MATIC_NUANCE_KEY_FILE,
  [switch]$NoStopExisting,
  # Start the hub WITHOUT allowing the camera. With it allowed, it is on only from the user's click
  # on "Talk face to face" (D324).
  [switch]$NoCamera,
  [switch]$Enroll
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
  $running | ForEach-Object { try { Stop-Process -Id $_.ProcessId -Force -Confirm:$false -ErrorAction Stop } catch { Say "      (could not stop pid $($_.ProcessId): $($_.Exception.Message))" } }
  Start-Sleep -Seconds 2
  # A second `npm.cmd start` HANDS OVER to a Matic Desk already in the tray and exits (single
  # instance), so a launch that could not stop the old one - an ELEVATED one, from this window -
  # would silently test the old process with the old environment. Say so and stop instead.
  $still = Get-CimInstance Win32_Process -Filter "Name='electron.exe'" |
    Where-Object { $_.CommandLine -match $clientPattern -and $_.CommandLine -notmatch '--type=' -and $_.CommandLine -notmatch '--user-data-dir' }
  if ($still) {
    $pids = ($still | ForEach-Object { $_.ProcessId }) -join ', '
    Fail "a Matic Desk is still running (pid $pids) and could not be stopped from this window - it is probably elevated. Quit it from its tray icon (right-click, Quit), then run this again. Starting now would hand over to it and nothing new would start."
  }
}

# ---- 3b. where the app will look for its enrollment, printed from OUTSIDE the app -----------------
# The app prints the same fields on its first line ([enroll] in client\audit\app.log and the
# developer log; `startupReport()` in client\src\agent\enrollment.js). Put the two side by side: a
# launch that says NOT FOUND while this says exists=True is reading a different path or a different
# profile, and the fields say which. Measured, not reasoned - D256 and D258 were found this way.
$appName = (Get-Content -LiteralPath (Join-Path $client 'package.json') -Raw | ConvertFrom-Json).name
$expectedUserData = Join-Path $env:APPDATA $appName
$enrollPath = Join-Path $expectedUserData 'enrollment.json'
$enrollExists = Test-Path -LiteralPath $enrollPath
$enrollMtime = if ($enrollExists) { (Get-Item -LiteralPath $enrollPath).LastWriteTimeUtc.ToString('o') } else { 'unknown' }
$isElevated = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
$electronPids = (Get-CimInstance Win32_Process -Filter "Name='electron.exe'" | Where-Object { $_.CommandLine -match $clientPattern -and $_.CommandLine -notmatch '--type=' } | ForEach-Object { "$($_.ProcessId)@$($_.CreationDate.ToUniversalTime().ToString('o'))" }) -join ','
if (-not $electronPids) { $electronPids = 'none' }
Say "[enroll] userData=$expectedUserData name=$appName user=$env:USERNAME elevated=$isElevated (this window)"
Say "[enroll] path=$enrollPath exists=$enrollExists mtime=$enrollMtime pid=$electronPids (electron already running, pid@started)"
Say '      Compare with the app''s own [enroll] lines in client\audit\app.log after it starts.'

# ---- 3c. an enrollment secret, ONLY when asked (-Enroll) ---------------------------------------
# A live session needs the app to hold an enrollment credential: the hub mints a session for an
# ENROLLED endpoint and for nobody else. From 2026-11-17 until this change the launcher minted a
# one-day secret on EVERY launch; an app that could not find its enrollment.json then enrolled
# afresh each time and orphaned the tickets filed before it. Now a secret is minted only when the
# operator says so, for an endpoint that has none.
$enrollSecret = $null
if ($Enroll) {
  if ($enrollExists) { Say '      (-Enroll passed, but an enrollment already exists at the path above - not minting; delete the file first if you mean to re-enroll)' }
  else {
    try {
      $tenant = (Get-Content -LiteralPath (Join-Path $client 'config.json') -Raw | ConvertFrom-Json).enrollment.tenant
      if ($tenant) {
        Push-Location -LiteralPath $server
        try { $minted = & node bin/devices.mjs create-secret $tenant --ttl-days 1 2>&1 | Out-String } finally { Pop-Location }
        $m = [regex]::Match($minted, '(?m)^\s*secret\s+(\S+)\s*$')
        if ($m.Success) { $enrollSecret = $m.Groups[1].Value }
      }
    } catch { $enrollSecret = $null }
    if ($enrollSecret) { Say '      (-Enroll: a one-day enrollment secret is ready; the app enrolls ONCE and keeps the credential)' }
    else { Say '      (-Enroll: no secret could be minted - is the hub''s database up?)' }
  }
} elseif (-not $enrollExists) {
  Say '      NO ENROLLMENT at the path above. The app will say so too. If that path is the one the app reads,'
  Say '      run this launcher once with -Enroll; if the app reads another path, that difference is the finding.'
}

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
Say 'That click is the only thing that turns the microphone and the camera on (D320, D324); their buttons turn them off.'
Say 'Credits run from the moment the face appears until you click "End live video".'
Say ''
Start-Sleep -Seconds 6
