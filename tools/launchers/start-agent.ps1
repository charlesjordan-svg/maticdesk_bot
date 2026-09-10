<#
.SYNOPSIS
  Check the hub is answering, then launch the Matic Desk agent elevated. Double-click start-agent.cmd.

.DESCRIPTION
  Stage tooling, not product. Written 2026-09-05 for the 2026-09-06 demo (docs/DEMO-DAY.md).

  "The agent is broken" and "the hub is not running" look identical from the chair: the avatar
  falls back to machine state or says it could not reach the model. So this checks the hub FIRST
  and says so plainly, and only then hands over to client/scripts/start-elevated.ps1 (which is
  unchanged and triggers the UAC prompt).

  Windows PowerShell 5.1: no `&&`, no ternary, no `??`.

.PARAMETER CheckOnly
  Run the checks and stop without launching the app.
#>
[CmdletBinding()]
param(
  [switch]$CheckOnly
)

$ErrorActionPreference = 'Continue'
$root   = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$client = Join-Path $root 'client'

$script:failed = $false
function Step([string]$Name) { Write-Host ("`n{0}" -f $Name) -ForegroundColor Cyan }
function Ok([string]$Detail)   { Write-Host ('  OK    ' + $Detail) -ForegroundColor Green }
function Warn([string]$Detail) { Write-Host ('  WARN  ' + $Detail) -ForegroundColor Yellow }
function Info([string]$Detail) { Write-Host ('  --    ' + $Detail) -ForegroundColor DarkGray }
function Fail([string]$Detail, [string[]]$Fix) {
  Write-Host ('  FAIL  ' + $Detail) -ForegroundColor Red
  if ($Fix) { Write-Host '        Fix:' -ForegroundColor Red; foreach ($l in $Fix) { Write-Host ('          ' + $l) -ForegroundColor White } }
  $script:failed = $true
}
function Native([string]$CommandLine) { return (& cmd.exe /d /c "$CommandLine 2>&1" | Out-String) }
function TryGetJson([string]$Url, [int]$TimeoutSec) {
  try { return Invoke-RestMethod -Uri $Url -TimeoutSec $TimeoutSec -UseBasicParsing } catch { return $null }
}

Write-Host ''
Write-Host '=================================================================' -ForegroundColor Cyan
Write-Host '  MATIC DESK AGENT - check the hub, then launch elevated' -ForegroundColor Cyan
Write-Host '=================================================================' -ForegroundColor Cyan

# ---- 1. config --------------------------------------------------------------------------------
Step '1. client/config.json'
$config = $null
try { $config = Get-Content (Join-Path $client 'config.json') -Raw | ConvertFrom-Json } catch { }
if (-not $config) { Fail 'client/config.json is unreadable' @('It is committed - `git checkout -- client/config.json` from the repo root restores it.') }
$provider = 'cloud'; if ($config.provider) { $provider = $config.provider }
if ($env:MATIC_PROVIDER) { $provider = $env:MATIC_PROVIDER; Info "MATIC_PROVIDER=$provider overrides config.json for this run" }
$hubUrl = 'http://127.0.0.1:8787'; if ($config.hubUrl) { $hubUrl = $config.hubUrl }
if ($env:MATIC_HUB_URL) { $hubUrl = $env:MATIC_HUB_URL }
if ($provider -eq 'hub') { Ok "provider ""hub"" -> $hubUrl" }
else { Fail "provider is ""$provider"" - the agent will NOT talk to the hub, and this demo is about the hub (questions, tickets)" @('Set "provider": "hub" in client/config.json  (it is "hub" on main as of 2026-09-05)') }

# ---- 2. the hub -------------------------------------------------------------------------------
Step "2. Hub at $hubUrl"
$h = TryGetJson "$hubUrl/v1/health" 5
if (-not $h) {
  Fail 'THE HUB IS NOT RUNNING. From the chair this looks exactly like a broken agent: the avatar answers from machine state or says it could not reach the model' @(
    'Double-click "Matic Desk Hub" first and wait for READY (about 20-30 s when the model is already warm, up to a minute cold),',
    'then double-click this again.')
} else {
  Ok ("hub answering - provider " + $h.provider.model + ", auth " + $h.auth)
  if ($h.tickets.enabled -eq $true) { Ok ("tickets enabled (tenant " + $h.tickets.tenant + "); nobody is emailed - the hub says so and so does the card") }
  else { Fail ('the hub cannot file tickets: ' + $h.tickets.why) @('cd ' + (Join-Path $root 'server'), 'node bin/db.mjs create-tenant devco', 'restart the hub') }
  if ($h.corpus -and $h.corpus.articles -gt 0) { Ok ("corpus: $($h.corpus.articles) articles, $($h.corpus.embedded) embedded") }
  else { Fail 'the hub reports an EMPTY corpus - every question will be declined and it will look correct' @('cd ' + (Join-Path $root 'server'), 'npm.cmd run kb:ingest') }
  if (-not $h.embedder) { Warn 'the hub has no embedder - retrieval is lexical only (degraded, not absent)' }
}

# ---- 3. is the model resident -----------------------------------------------------------------
Step '3. Model residency'
$chatModel = 'mistral-small:24b'; if ($h -and $h.provider.model) { $chatModel = $h.provider.model }
$ps = Native 'ollama ps'
$line = ($ps -split "`n" | Where-Object { $_ -match [regex]::Escape($chatModel) } | Select-Object -First 1)
if ($line) {
  if ($line -match '100% GPU') { Ok "$chatModel is resident, 100% GPU - the first turn will be fast" }
  else { Warn ("$chatModel is resident but SPLIT across CPU/GPU - turns will be slow. Close GPU apps, then `ollama stop $chatModel` and re-run the hub launcher. Line: " + ($line.Trim() -replace '\s+', ' ')) }
} else {
  Warn "$chatModel is NOT loaded. The first turn will pay the cold load (15 s measured with the GPU free, minutes if VRAM is shared). Run the hub launcher again, or: ollama run $chatModel ""ok"""
}

# ---- 4. the app itself ------------------------------------------------------------------------
Step '4. The app'
$electron = Join-Path $client 'node_modules\.bin\electron.cmd'
if (Test-Path $electron) { Ok 'Electron installed' } else { Fail 'client/node_modules is missing' @("cd $client", 'npm.cmd install') }
$voice = $config.voiceModelPath; if ($env:MATIC_VOICE_MODEL) { $voice = $env:MATIC_VOICE_MODEL }
if ($voice -and -not [System.IO.Path]::IsPathRooted($voice)) { $voice = Join-Path $client $voice }
if ($voice -and (Test-Path $voice) -and (Test-Path "$voice.json")) { Ok 'voice model and sidecar present' }
else { Warn "voice model missing at $voice - the avatar will not speak. Fix: cd $client; npm.cmd run fetch-voice  (63 MB - before the demo, not during)" }
$profile = Join-Path $env:APPDATA 'matic-desk-demo\profile.json'
if (Test-Path $profile) { Info "a saved profile exists at $profile - the ticket interview will ask only for what it lacks" }
else { Info 'no saved profile - the FIRST ticket asks first name, last name, location and contact (D216). That is expected on a clean machine.' }
Info 'the full stage checklist (voice, koffi, adapters, tests) is:  npm.cmd run preflight   from client/, elevated'

if ($script:failed) {
  Write-Host ''
  Write-Host 'NOT LAUNCHING - fix the FAIL line(s) above first.' -ForegroundColor Red
  exit 1
}
if ($CheckOnly) { Write-Host ''; Write-Host 'CHECKS PASSED (-CheckOnly: app not launched).' -ForegroundColor Green; exit 0 }

# ---- 5. launch ----------------------------------------------------------------------------------
Step '5. Launching elevated (accept the UAC prompt)'
$principal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
if ($principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) { Info 'this window is already elevated, so no UAC prompt will appear' }
& powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $client 'scripts\start-elevated.ps1')

# DO NOT SAY "LAUNCHED" BECAUSE THE HANDOFF RETURNED. Observed 2026-09-06: this printed "Launched"
# while no Electron process existed. Windows accepting the RunAs request says nothing about whether
# the app came up, so wait for an Electron process and report what is actually true.
Write-Host ''
Write-Host '  waiting up to 30 s for an Electron process...' -ForegroundColor DarkGray
$deadline = (Get-Date).AddSeconds(30)
$running = @()
do { Start-Sleep -Seconds 1; $running = @(Get-Process -Name electron -ErrorAction SilentlyContinue) } while ($running.Count -eq 0 -and (Get-Date) -lt $deadline)
if ($running.Count -gt 0) {
  Ok "Electron is running ($($running.Count) process(es)). The app window should be on screen; its log is in the elevated window behind it."
  exit 0
}
Fail 'NO ELECTRON PROCESS after 30 s - the app did not start, or exited at once' @(
  'Read the elevated PowerShell window that opened - it stays open and shows the error.',
  "The same output is in $client\audit\launch.log",
  'If no elevated window appeared at all, the UAC prompt was declined or never shown - run this again and watch for it.')
exit 1
