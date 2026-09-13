<#
.SYNOPSIS
  Preflight, start and WARM the Matic Desk hub. Double-click start-hub.cmd; this is what it runs.

.DESCRIPTION
  Stage tooling, not product. Written 2026-09-05 for the 2026-09-06 demo (docs/DEMO-DAY.md).

  Every check here is a failure this project has actually had, and each of them fails in a way that
  looks like something else from the chair:

    Docker down            -> "the database is broken"
    Postgres not up        -> "the hub is broken"
    migrations missing     -> a 500 on the first ticket
    no tenant              -> /v1/ticket answers 503 and the avatar never offers a ticket
    EMPTY CORPUS           -> a hub that works perfectly and DECLINES EVERYTHING. Looks correct.
    Ollama down            -> "the hub is broken"
    model not pulled       -> a 404 from Ollama, reported as a hub error
    port in use            -> a hub that is already running, or a stale one
    model NOT RESIDENT     -> 15 s of silence on the first turn (measured 2026-09-05, GPU free)
    GPU SHARED with a game -> 190-265 s of silence, model split CPU/GPU (measured 2026-09-05)

  It prints READY only after /v1/health answers AND both models are loaded AND one throwaway turn
  has gone through the hub. A launcher that returns before the service is up teaches the operator
  to guess.

  Windows PowerShell 5.1: no `&&`, no ternary, no `??`. Native commands that may fail are run via
  `cmd /c ... 2>&1` so their output is READ rather than their exit code trusted (CLAUDE.md, the
  pipe trap).

.PARAMETER CheckOnly
  Run the checks and stop. Starts nothing, warms nothing.

.PARAMETER NoWarm
  Start the hub but skip the model warm-up (you will pay the cold load on the first real turn).
#>
[CmdletBinding()]
param(
  # The tenant schema the demo's tickets go into. The dev tenant every rehearsal has used; pass
  # -Tenant to point one run somewhere else without editing this file.
  [string]$Tenant = 't_devco',
  [switch]$CheckOnly,
  [switch]$NoWarm
)

$ErrorActionPreference = 'Continue'
$root   = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$server = Join-Path $root 'server'

# Same defaults as server/src/index.js and server/src/kb/embed.js. An env override there is an
# override here, so the launcher and the hub cannot disagree about which model to warm.
$port       = 8787;                          if ($env:MATIC_HUB_PORT)    { $port = [int]$env:MATIC_HUB_PORT }
$chatModel  = 'mistral-small:24b';           if ($env:MATIC_HUB_MODEL)   { $chatModel = $env:MATIC_HUB_MODEL }
$embedModel = 'snowflake-arctic-embed2:568m'; if ($env:MATIC_EMBED_MODEL) { $embedModel = $env:MATIC_EMBED_MODEL }
$ollama     = 'http://127.0.0.1:11434'
if ($env:MATIC_HUB_UPSTREAM) { $ollama = ($env:MATIC_HUB_UPSTREAM -replace '/v1/?$', '') }
if ($env:MATIC_EMBED_URL)    { $ollama = $env:MATIC_EMBED_URL.TrimEnd('/') }
$hubUrl = "http://127.0.0.1:$port"

# ---- reporting ------------------------------------------------------------------------------
# Helpers print and return NOTHING (CLAUDE.md: a helper that prints AND returns puts both on the
# pipeline). State is kept in script-scope variables.
$script:failed = $false

function Step([string]$Name) { Write-Host ("`n{0}" -f $Name) -ForegroundColor Cyan }
function Ok([string]$Detail)   { Write-Host ('  OK    ' + $Detail) -ForegroundColor Green }
function Warn([string]$Detail) { Write-Host ('  WARN  ' + $Detail) -ForegroundColor Yellow }
function Info([string]$Detail) { Write-Host ('  --    ' + $Detail) -ForegroundColor DarkGray }
function Fail([string]$Detail, [string[]]$Fix) {
  Write-Host ('  FAIL  ' + $Detail) -ForegroundColor Red
  if ($Fix) {
    Write-Host '        Fix:' -ForegroundColor Red
    foreach ($line in $Fix) { Write-Host ('          ' + $line) -ForegroundColor White }
  }
  $script:failed = $true
}
function StopIfFailed([string]$Why) {
  if ($script:failed) {
    Write-Host ''
    Write-Host ('NOT READY - ' + $Why) -ForegroundColor Red
    Write-Host 'Fix the FAIL line(s) above and run this again. Nothing was started.' -ForegroundColor Red
    exit 1
  }
}

# Run a native command with stderr merged INSIDE cmd, so PowerShell 5.1 does not wrap stderr lines
# in ErrorRecords and so the OUTPUT is what we read.
function Native([string]$CommandLine, [string]$WorkingDirectory) {
  if ($WorkingDirectory) { Push-Location $WorkingDirectory }
  try { $out = & cmd.exe /d /c "$CommandLine 2>&1" | Out-String }
  finally { if ($WorkingDirectory) { Pop-Location } }
  return $out
}

function TryGetJson([string]$Url, [int]$TimeoutSec) {
  try { return Invoke-RestMethod -Uri $Url -TimeoutSec $TimeoutSec -UseBasicParsing }
  catch { return $null }
}

Write-Host ''
Write-Host '=================================================================' -ForegroundColor Cyan
Write-Host '  MATIC DESK HUB - preflight, start, warm' -ForegroundColor Cyan
Write-Host ("  repo {0}" -f $root) -ForegroundColor DarkGray
Write-Host ("  hub  {0}   model {1}   embedder {2}" -f $hubUrl, $chatModel, $embedModel) -ForegroundColor DarkGray
Write-Host '=================================================================' -ForegroundColor Cyan

# ---- 0. node ---------------------------------------------------------------------------------
Step '0. Node'
$nodeV = Native 'node --version'
if ($nodeV -match '^v\d+') { Ok ("node " + $nodeV.Trim()) }
else { Fail 'node is not on PATH' @('Install Node.js (LTS) and reopen this window.') }
if (-not (Test-Path (Join-Path $server 'node_modules\pg'))) {
  Fail 'server/node_modules is missing (pg is the hub''s one dependency)' @("cd $server", 'npm.cmd install')
}
StopIfFailed 'the toolchain is not there'

# ---- 1. Docker -------------------------------------------------------------------------------
Step '1. Docker daemon'
# READ THE OUTPUT. `docker info` prints a version when the engine answers and a pipe error when
# Docker Desktop is closed - and a piped exit code would report the last stage, not docker.
$dockerOut = Native 'docker info --format "{{.ServerVersion}}"'
if ($dockerOut -match '(?m)^\s*\d+\.\d+') {
  Ok ("Docker engine " + ($dockerOut.Trim() -split "`n")[-1].Trim())
} else {
  $first = ($dockerOut.Trim() -split "`n" | Select-Object -First 1)
  Fail ("Docker is not answering: " + $first) @(
    'Start Docker Desktop (Start menu > Docker Desktop) and wait until the whale in the tray',
    'stops animating - about 30-60 s on this machine - then run this launcher again.',
    'The daemon starting is NOT the same as the app window opening.'
  )
}
StopIfFailed 'without Docker there is no database'

# ---- 2. Postgres -----------------------------------------------------------------------------
Step '2. PostgreSQL container (matic-desk-db, port 5433)'
$state = (Native 'docker inspect --format "{{.State.Status}}|{{.State.Health.Status}}" matic-desk-db').Trim()
if ($state -notmatch '^running\|healthy') {
  Info ("container state: " + $state.Split("`n")[0] + " - starting it (npm.cmd run db:up)")
  $up = Native 'docker compose up -d' $server
  Info ($up.Trim() -replace "`r?`n", ' | ')
  $deadline = (Get-Date).AddSeconds(60)
  do {
    Start-Sleep -Seconds 2
    $state = (Native 'docker inspect --format "{{.State.Status}}|{{.State.Health.Status}}" matic-desk-db').Trim()
  } while ($state -notmatch '^running\|healthy' -and (Get-Date) -lt $deadline)
}
if ($state -match '^running\|healthy') {
  $ready = Native 'docker exec matic-desk-db pg_isready -U matic -d matic'
  if ($ready -match 'accepting connections') { Ok 'container healthy and accepting connections' }
  else { Fail ("container is up but pg_isready says: " + $ready.Trim()) @('Wait ten seconds and run this again; if it persists:', "cd $server", 'npm.cmd run db:down   (DESTROYS the dev database)', 'npm.cmd run db:up', 'npm.cmd run migrate', 'node bin/db.mjs create-tenant devco', 'npm.cmd run kb:ingest') }
} else {
  Fail ("matic-desk-db did not become healthy (state: " + $state + ")") @("cd $server", 'npm.cmd run db:up', 'docker logs matic-desk-db --tail 30')
}
StopIfFailed 'the database is not up'

# ---- 3. Migrations and tenant -----------------------------------------------------------------
Step '3. Migrations (control 002, tenant 003) and a ticket tenant'
$status = Native 'node bin/db.mjs status' $server
$controlLine = ($status -split "`n" | Where-Object { $_ -match '^\s*control\s' } | Select-Object -First 1)
$tenantLines = @($status -split "`n" | Where-Object { $_ -match '^\s*t_\w+\s' })
if ($controlLine -match '002-generic-kb') { Ok ('control: ' + $controlLine.Trim()) }
else { Fail ('control plane migrations incomplete: ' + $(if ($controlLine) { $controlLine.Trim() } else { $status.Trim() })) @("cd $server", 'npm.cmd run migrate') }

if ($tenantLines.Count -eq 0) {
  Fail 'NO TENANT. A fresh database has none, and /v1/ticket answers 503 until one exists (D213) - the avatar will never offer a ticket' @("cd $server", 'node bin/db.mjs create-tenant devco')
} else {
  foreach ($t in $tenantLines) {
    if ($t -match '003-tickets') { Ok ('tenant:  ' + $t.Trim()) }
    else { Fail ('tenant schema missing 003-tickets: ' + $t.Trim()) @("cd $server", 'npm.cmd run migrate') }
  }
  # WHICH TENANT THE DEMO FILES INTO. The hub picks nothing when there is more than one
  # (B6-TICKET-STORE.md 1), so the LAUNCHER picks, out loud, rather than failing on a database that
  # has grown a second tenant. Before 2026-09-13 this was a FAIL, and the click-through's own tenant
  # turned a green preflight red without a line of product code changing - on the morning of a demo.
  # Any customer hub has more than one tenant; a launcher that only works on a database with exactly
  # one is stage tooling that breaks the first time the stage is used for anything else.
  # -Tenant overrides the default; a MATIC_TICKET_TENANT already set in this window wins over both,
  # because a value someone typed is a decision and this default is not.
  if (-not $env:MATIC_TICKET_TENANT) { $env:MATIC_TICKET_TENANT = $Tenant }
  $wanted = $env:MATIC_TICKET_TENANT
  # @() BEFORE THE INDEX. A Where-Object that matches ONE thing returns a STRING, not an array, and
  # [0] on a string is its first CHARACTER - so two tenants were reported as 't, t' and the fix line
  # sent the reader looking for a schema called 't'. PowerShell's scalar-vs-array trap, the same
  # family as CLAUDE.md's 'PowerShell helpers return ONE thing' rule, and caught here by running it.
  $names  = @($tenantLines | ForEach-Object { @($_ -split '\s+' | Where-Object { $_ -match '^t_' })[0] })
  if ($names -notcontains $wanted) {
    Fail ("MATIC_TICKET_TENANT is '$wanted' and this database has no such schema - /v1/ticket would answer 503 (D213). Present: " + ($names -join ', ')) @(
      "`$env:MATIC_TICKET_TENANT = '$($names[0])'   (in THIS window, before starting the hub)",
      "cd $server",
      'node bin/db.mjs create-tenant <slug>   (to make a new one)')
  } else {
    Ok ("tickets file into $wanted" + $(if ($names.Count -gt 1) { " - $($names.Count) tenants on this database, and this is the one the demo uses. Change it with -Tenant <schema>." } else { "" }))
  }
}
StopIfFailed 'the schema is not ready'

# ---- 4. Corpus --------------------------------------------------------------------------------
Step '4. Corpus - COUNT THE CHUNKS'
# An empty corpus produces a hub that answers every question with a polite decline. That is the
# designed behaviour for an uncovered question (D205), which is exactly why it does not look broken.
$kb = Native 'node bin/kb.mjs status' $server
$articles = 0; $chunks = 0; $embedded = 0
if ($kb -match 'articles\s+(\d+)') { $articles = [int]$Matches[1] }
if ($kb -match 'chunks\s+(\d+)\s+\((\d+) embedded\)') { $chunks = [int]$Matches[1]; $embedded = [int]$Matches[2] }
$modelLines = @($kb -split "`n" | Where-Object { $_ -match '^\s*model\s+\S' })
if ($articles -eq 0) {
  Fail 'THE CORPUS IS EMPTY. The hub would start, answer /v1/health, and DECLINE EVERY QUESTION - which looks like correct behaviour' @("cd $server", 'npm.cmd run kb:ingest', 'npm.cmd run kb:status   (expect 6 articles, 18 chunks, 18 embedded)')
} elseif ($embedded -lt $chunks) {
  Fail ("$articles articles, $chunks chunks but only $embedded embedded - the semantic leg is missing for some of the corpus") @("cd $server", 'node bin/kb.mjs embed')
} elseif ($modelLines.Count -gt 1) {
  Fail 'MORE THAN ONE EMBEDDING MODEL in the corpus - vectors are in different spaces and retrieval is confidently wrong for part of it' @("cd $server", 'node bin/kb.mjs reembed')
} else {
  Ok ("$articles articles, $chunks chunks, $embedded embedded")
  foreach ($m in $modelLines) {
    Info ($m.Trim() -replace '\s+', ' ')
    if ($m -notmatch [regex]::Escape($embedModel)) { Warn ("the corpus was embedded by a different model than the hub will use for queries ($embedModel). Fix: node bin/kb.mjs reembed") }
  }
}
StopIfFailed 'the knowledge base is not loaded'

# ---- 5. Ollama --------------------------------------------------------------------------------
Step "5. Ollama at $ollama"
$ver = TryGetJson "$ollama/api/version" 5
if ($ver -and $ver.version) { Ok ("Ollama " + $ver.version) }
else { Fail 'Ollama is not running (nothing answers on 11434)' @('Start menu > Ollama, wait for the llama in the tray, then run this again.', 'Do NOT restart it later if a model is merely slow - a reload costs the cold-load time.') }
StopIfFailed 'without Ollama there is no model'

$tags = TryGetJson "$ollama/api/tags" 10
$names = @()
if ($tags -and $tags.models) { $names = @($tags.models | ForEach-Object { $_.name }) }
foreach ($m in @($chatModel, $embedModel)) {
  # EXACT tag. `snowflake-arctic-embed2:568m` (the L variant, D203) is the dev embedder, and the
  # near-miss `snowflake-arctic-embed:m` is the v1 English-only suite - a different model.
  if ($names -contains $m) { Ok ("model present: $m") }
  else { Fail ("model NOT pulled: $m") @("ollama pull $m") }
}
StopIfFailed 'a model is missing'

# Keep-alive. Ollama evicts a model 5 minutes after the last request unless told otherwise; a
# resident model answers in 0.3 s, an evicted one costs the cold load again (15 s with the GPU
# free, minutes without). OLLAMA_KEEP_ALIVE is read by the Ollama server at START, from the
# environment it was launched with - so the user variable only counts once Ollama has been
# restarted after it was set. Verified below on `ollama ps`, not trusted here.
$ka = [Environment]::GetEnvironmentVariable('OLLAMA_KEEP_ALIVE', 'User')
if ($ka) { Info ("OLLAMA_KEEP_ALIVE (user) = $ka - verified against ollama ps after the warm-up") }
else { Warn 'OLLAMA_KEEP_ALIVE is not set for this user: the model will be EVICTED 5 minutes after the last turn. Fix: [Environment]::SetEnvironmentVariable("OLLAMA_KEEP_ALIVE","24h","User")  then quit Ollama from the tray and start it again' }

# ---- 6. GPU headroom --------------------------------------------------------------------------
Step '6. GPU headroom'
$smi = Native 'nvidia-smi --query-gpu=memory.used,memory.total --format=csv,noheader,nounits'
if ($smi -match '(\d+)\s*,\s*(\d+)') {
  $usedMiB = [int]$Matches[1]; $totalMiB = [int]$Matches[2]; $freeMiB = $totalMiB - $usedMiB
  # Measured 2026-09-05: mistral-small:24b + 16k context = 16 GB resident, arctic-embed 0.7 GB.
  $ps = Native 'ollama ps'
  $chatResident = [bool]($ps -match [regex]::Escape($chatModel))
  if ($chatResident) {
    Ok ("$freeMiB MiB free of $totalMiB with the model already resident")
  } elseif ($freeMiB -ge 18000) {
    Ok ("$freeMiB MiB free of $totalMiB - the model fits on the GPU")
  } else {
    Warn ("only $freeMiB MiB free of $totalMiB. The model needs ~17 GB. Close games and other GPU apps NOW - on 2026-09-05 a game holding VRAM turned a 15 s load into 265 s and left the model split 15/85 CPU/GPU, which is slow on EVERY turn")
  }
} else { Info 'nvidia-smi not available - cannot read VRAM; check `ollama ps` shows 100% GPU after the warm-up' }

# ---- 7. Port ----------------------------------------------------------------------------------
Step "7. Port $port"
$alreadyRunning = $false
$listen = @(Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue)
if ($listen.Count -gt 0) {
  $h = TryGetJson "$hubUrl/v1/health" 5
  if ($h -and $h.hub -eq 'matic-desk-hub') {
    Ok "a Matic Desk hub is ALREADY RUNNING on $port (pid $($listen[0].OwningProcess)) - using it, not starting another"
    $alreadyRunning = $true
  } else {
    Fail "port $port is in use by pid $($listen[0].OwningProcess) and it is not a healthy hub" @(
      "Get-NetTCPConnection -LocalPort $port -State Listen | Select-Object OwningProcess",
      'Stop-Process -Id <that id>',
      "or run the hub elsewhere:  `$env:MATIC_HUB_PORT=8788   (and MATIC_HUB_URL on the agent)")
  }
} else { Ok "port $port is free" }
StopIfFailed 'the port is not usable'

# ---- 7a. The admin console's second factor (D267) ----------------------------------------------
# Same reasoning as the voice-configuration line, and higher stakes: a reviewer or a buyer must not
# form a verdict on a console whose authentication has been deliberately weakened without being told.
# This reports, it never fails - the mode is authorised, and a preflight that refuses to start a
# development hub because it is in development mode would just be switched off.
Step "7a. Admin console authentication"
$hubSaysBypass = $null
try {
  $h = Invoke-RestMethod -Uri "$hubUrl/v1/health" -TimeoutSec 5 -ErrorAction Stop
  if ($null -ne $h.adminAuth) { $hubSaysBypass = [string]$h.adminAuth.insecureBypass }
} catch { $hubSaysBypass = $null }   # no hub yet: this window's environment is all there is to read

if ($hubSaysBypass -and $hubSaysBypass -ne 'off') {
  Warn ("THE RUNNING HUB reports the insecure bypass as '" + $hubSaysBypass + "' - its admin console does NOT ask for an authenticator code.")
  Warn '      It was started in another window, so THIS shell''s environment does not tell you that.'
  Warn '      The password is still required. Every such sign-in is audited as insecure-dev-bypass.'
  Warn '      DEVELOPMENT ONLY. Do not demo, deploy or review this build while it is on.'
  Warn '      Fix: stop that hub, then in a window with the variable UNSET:'
  Warn ('             Remove-Item Env:MATIC_ADMIN_INSECURE_NO_TOTP')
  Warn ('             cd ' + $server + '  ;  npm.cmd start        <- npm.cmd run start:dev TURNS IT BACK ON')
} elseif ($hubSaysBypass -eq 'off') {
  Ok 'the RUNNING hub requires the authenticator code (asked it, did not assume)'
} elseif ($env:MATIC_ADMIN_INSECURE_NO_TOTP -eq '1') {
  Warn 'MATIC_ADMIN_INSECURE_NO_TOTP=1 - the admin console will NOT ask for an authenticator code.'
  Warn '      The password is still required. Every such sign-in is audited as insecure-dev-bypass.'
  Warn '      DEVELOPMENT ONLY. Do not demo, deploy or review this build while it is set.'
  Warn '      Turn it off:   Remove-Item Env:MATIC_ADMIN_INSECURE_NO_TOTP     (this shell)'
  Warn '                     [Environment]::SetEnvironmentVariable("MATIC_ADMIN_INSECURE_NO_TOTP",$null,"User")'
  Warn '      Then restart the hub - it is read at sign-in, but the banners are drawn from the same value.'
} elseif ($null -ne $env:MATIC_ADMIN_INSECURE_NO_TOTP) {
  Info ("MATIC_ADMIN_INSECURE_NO_TOTP is set to '" + $env:MATIC_ADMIN_INSECURE_NO_TOTP + "', which is not '1' - the authenticator code IS required")
} else {
  Ok 'the authenticator code is required (nothing set in this window, and no hub was reachable to ask)'
}

if ($CheckOnly) {
  Write-Host ''
  Write-Host 'CHECKS PASSED (-CheckOnly: nothing started, nothing warmed).' -ForegroundColor Green
  exit 0
}

# ---- 8. Start ---------------------------------------------------------------------------------
Step '8. Start the hub'
if (-not $alreadyRunning) {
  # Its own console window, so the startup banners (NO AUTHENTICATION, the tenant line, the
  # embedder line) stay visible for the whole session and a crash leaves its output on screen.
  # D227, decided 2026-09-09 once D229 (retention) was ratified: the demo and dev hubs LOG the
  # question text, so the review queue's gaps say what was asked. Kept 90 days, then cleared by
  # the hub itself (src/kb/retrieve.js). Not retroactive. Set in this window so the child inherits it.
  if (-not $env:MATIC_KB_LOG_QUERIES) { $env:MATIC_KB_LOG_QUERIES = '1' }
  Start-Process -FilePath 'node' -ArgumentList 'src/index.js' -WorkingDirectory $server -WindowStyle Normal
  $deadline = (Get-Date).AddSeconds(60)
  $h = $null
  do { Start-Sleep -Milliseconds 500; $h = TryGetJson "$hubUrl/v1/health" 3 } while (-not $h -and (Get-Date) -lt $deadline)
  if ($h) { Ok "hub answering at $hubUrl/v1/health" }
  else { Fail 'the hub did not answer /v1/health within 60 s' @('Read the hub window that just opened - the reason is printed there.') }
  StopIfFailed 'the hub did not start'
}
$h = TryGetJson "$hubUrl/v1/health" 5
if ($h.tickets.enabled -eq $true) { Ok ("tickets enabled, tenant " + $h.tickets.tenant + " (notifies: " + $h.tickets.notifies + " - nobody is emailed, by design D86)") }
else { Fail ('the hub reports tickets DISABLED: ' + $h.tickets.why) @("cd $server", 'node bin/db.mjs create-tenant devco', 'then restart the hub') }
if ($h.corpus.articles -gt 0) { Ok ("hub sees the corpus: $($h.corpus.articles) articles, $($h.corpus.embedded) embedded") }
else { Fail 'the hub sees an EMPTY corpus' @("cd $server", 'npm.cmd run kb:ingest') }
StopIfFailed 'the hub is up but not usable'

# ---- 9. Warm ----------------------------------------------------------------------------------
if ($NoWarm) {
  Warn 'skipping the warm-up (-NoWarm). The first real turn pays the cold load.'
} else {
  Step '9. Warm the models (one throwaway inference each) and one throwaway hub turn'
  $sw = [Diagnostics.Stopwatch]::StartNew()
  try {
    $body = '{"model":"' + $chatModel + '","prompt":"Say OK.","stream":false,"keep_alive":"24h","options":{"num_predict":2}}'
    $g = Invoke-RestMethod -Method Post -Uri "$ollama/api/generate" -ContentType 'application/json' -Body $body -TimeoutSec 600
    $sw.Stop()
    $loadS = [math]::Round($g.load_duration / 1e9, 1)
    Ok ("chat model resident: {0} s total, of which {1} s was loading  ({2})" -f [math]::Round($sw.Elapsed.TotalSeconds, 1), $loadS, $chatModel)
    if ($loadS -gt 60) { Warn 'that load was SLOW. Almost certainly the GPU is shared - check `ollama ps` for a CPU/GPU split and close whatever else is using VRAM, then `ollama stop` and re-run this' }
  } catch { $sw.Stop(); Fail ("warming $chatModel failed after $([math]::Round($sw.Elapsed.TotalSeconds,1)) s: " + $_.Exception.Message) @("ollama run $chatModel   (watch what it says)") }

  $sw = [Diagnostics.Stopwatch]::StartNew()
  try {
    $body = '{"model":"' + $embedModel + '","input":"query: warm up","keep_alive":"24h"}'
    $e = Invoke-RestMethod -Method Post -Uri "$ollama/api/embed" -ContentType 'application/json' -Body $body -TimeoutSec 300
    $sw.Stop()
    Ok ("embedder resident: {0} s  ({1}, {2} dims)" -f [math]::Round($sw.Elapsed.TotalSeconds, 1), $embedModel, $e.embeddings[0].Count)
  } catch { $sw.Stop(); Fail ("warming $embedModel failed: " + $_.Exception.Message) @("ollama pull $embedModel") }

  # VERIFY residency rather than trusting the setting.
  $ps = Native 'ollama ps'
  $chatLine = ($ps -split "`n" | Where-Object { $_ -match [regex]::Escape($chatModel) } | Select-Object -First 1)
  if ($chatLine) {
    if ($chatLine -match '100% GPU') { Ok 'chat model is 100% on the GPU' }
    elseif ($chatLine -match 'CPU') { Warn ('chat model is SPLIT across CPU and GPU - every turn will be slow. Free VRAM (close games/GPU apps), then: ollama stop ' + $chatModel + '  and run this launcher again. Line: ' + ($chatLine.Trim() -replace '\s+', ' ')) }
    if ($chatLine -match '(\d+)\s+(seconds|minutes?)\s+from now') { Warn ('keep-alive is SHORT: the model will be evicted "' + $Matches[0] + '". Set OLLAMA_KEEP_ALIVE=24h for the user, quit Ollama from the tray, start it again, run this launcher again') }
    elseif ($chatLine -match 'hours? from now|Forever') { Ok ('keep-alive holds: ' + ($chatLine -replace '.*GPU\s+\d+\s+', '').Trim()) }
  } else { Warn 'ollama ps does not list the chat model right after warming it - check the Ollama tray app' }

  # One throwaway turn THROUGH THE HUB, so the database pool, the retrieval path and the answer
  # tool have all run once before a person is watching. Timed: this is the warm first turn.
  $sw = [Diagnostics.Stopwatch]::StartNew()
  try {
    $ask = Invoke-RestMethod -Method Post -Uri "$hubUrl/v1/ask" -ContentType 'application/json' -Body '{"text":"How do I take a screenshot?","probe":{"platform":"win32"}}' -TimeoutSec 300
    $sw.Stop()
    $verdict = 'DECLINED'; if ($ask.answered) { $verdict = 'answered, cited ' + ($ask.citedArticleIds -join ', ') }
    Ok ("warm turn through the hub (/v1/ask): {0} s - {1}" -f [math]::Round($sw.Elapsed.TotalSeconds, 1), $verdict)
    if (-not $ask.answered) { Warn 'the screenshot question is covered by the corpus (keyboard-shortcuts-windows); a decline here means retrieval is not finding it - run: node bin/kb.mjs retrieve "how do I take a screenshot" --platform windows' }
  } catch { $sw.Stop(); Fail ("the throwaway hub turn failed after $([math]::Round($sw.Elapsed.TotalSeconds,1)) s: " + $_.Exception.Message) @('Read the hub window.') }

  # And one throwaway PROPOSAL turn (/v1/turn) with the endpoint's real tool schemas. A different
  # prompt prefix from /v1/ask, so Ollama's prompt cache is cold for it until it has run once -
  # measured 12.8 s first, ~3 s after, with the model already resident. See warm-turn.mjs.
  $sw = [Diagnostics.Stopwatch]::StartNew()
  $turnOut = Native ('node "' + (Join-Path $PSScriptRoot 'warm-turn.mjs') + '"') $root
  $sw.Stop()
  if ($turnOut -match '(?m)^\s*(\d+) ms\s+(.*)$') {
    Ok ("warm turn through the hub (/v1/turn): {0} s - {1}" -f [math]::Round([int]$Matches[1] / 1000, 1), $Matches[2].Trim())
  } else {
    Fail ("the throwaway proposal turn failed after $([math]::Round($sw.Elapsed.TotalSeconds,1)) s: " + $turnOut.Trim()) @('Read the hub window.')
  }
}

# ---- READY ------------------------------------------------------------------------------------
Write-Host ''
if ($script:failed) {
  Write-Host 'HUB IS UP BUT NOT READY - see the FAIL line(s) above.' -ForegroundColor Red
  exit 1
}
Write-Host '=================================================================' -ForegroundColor Green
Write-Host '  READY' -ForegroundColor Green
Write-Host ("  hub      {0}   (leave its window open)" -f $hubUrl) -ForegroundColor Green
Write-Host ("  queue    cd {0}; npm.cmd run tickets -- list" -f $server) -ForegroundColor Green
Write-Host '  next     double-click "Matic Desk Agent" and accept the UAC prompt' -ForegroundColor Green
Write-Host '=================================================================' -ForegroundColor Green
Write-Host '  Do NOT restart Ollama or this hub between now and the demo unless a check above says to.' -ForegroundColor DarkGray
exit 0
