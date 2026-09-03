<#
.SYNOPSIS
  Checks that this machine is ready to run the demo. Read-only.

.DESCRIPTION
  Stage tooling, NOT part of the product. Automates every item in DEMO-RUNBOOK.md section 1 that can be
  checked without breaking anything, so the manual checklist shrinks to the handful of things a
  script genuinely cannot see.

  Touches no adapter and writes no file. ONE caveat: when run elevated, the test suite it invokes
  exercises restart_service against the live Print Spooler, which briefly stops and restarts it and
  leaves it RUNNING. That is harmless, but it is not nothing - use -SkipTests for the last run
  immediately before going on stage.

  Run it elevated - not because the checks need admin, but because the demo runs elevated, and
  koffi loading under your ordinary account proves nothing about whether it loads under RunAs.

.PARAMETER SkipTests
  Skip `npm test`. The suite takes a few seconds; skip it only if you just ran it.

.EXAMPLE
  .\preflight.ps1
#>
[CmdletBinding()]
param(
  [switch]$SkipTests
)

$ErrorActionPreference = 'Continue'
$root = Split-Path -Parent $PSScriptRoot

$script:fails = @()
$script:warns = @()

function Report {
  param([string]$Name, [ValidateSet('PASS', 'FAIL', 'WARN', 'INFO')][string]$Status, [string]$Detail = '')
  $colour = switch ($Status) { 'PASS' { 'Green' } 'FAIL' { 'Red' } 'WARN' { 'Yellow' } default { 'Gray' } }
  Write-Host ('  {0,-5} {1}' -f $Status, $Name) -ForegroundColor $colour -NoNewline
  if ($Detail) { Write-Host "  $Detail" -ForegroundColor DarkGray } else { Write-Host '' }
  if ($Status -eq 'FAIL') { $script:fails += "$Name - $Detail" }
  if ($Status -eq 'WARN') { $script:warns += "$Name - $Detail" }
}

Write-Host "`nMatic Desk preflight" -ForegroundColor Cyan
Write-Host "$root`n" -ForegroundColor DarkGray

# ---------------------------------------------------------------------------------------------
Write-Host 'Elevation' -ForegroundColor Cyan
$principal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
$elevated = $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if ($elevated) {
  Report 'running elevated' 'PASS' 'the same context the demo runs in'
} else {
  Report 'running elevated' 'WARN' 'not elevated - koffi and the four primitives are unproven in the demo context'
}

# ---------------------------------------------------------------------------------------------
Write-Host "`nVoice" -ForegroundColor Cyan
$config = $null
try { $config = Get-Content (Join-Path $root 'config.json') -Raw | ConvertFrom-Json } catch { }
if (-not $config) {
  Report 'config.json readable' 'FAIL' 'could not parse config.json'
} else {
  $pyCmd = $config.pythonCommand
  $pyArgs = @($config.pythonArgs) + @('--version')
  $pyVersion = & $pyCmd @pyArgs 2>&1 | Out-String
  if ($LASTEXITCODE -eq 0) {
    Report "$pyCmd $($config.pythonArgs -join ' ')" 'PASS' $pyVersion.Trim()
  } else {
    Report "$pyCmd $($config.pythonArgs -join ' ')" 'FAIL' 'not on PATH - voice will not start'
  }

  $importArgs = @($config.pythonArgs) + @('-c', 'import piper')
  & $pyCmd @importArgs 2>&1 | Out-Null
  if ($LASTEXITCODE -eq 0) {
    Report 'piper imports' 'PASS'
  } else {
    Report 'piper imports' 'FAIL' 'the voice worker will not start'
  }

  # Same rule as src/main/tts-service.js: MATIC_VOICE_MODEL wins, else config.json, resolved
  # against the app root when relative.
  $model = if ($env:MATIC_VOICE_MODEL) { $env:MATIC_VOICE_MODEL } else { $config.voiceModelPath }
  if (-not [System.IO.Path]::IsPathRooted($model)) { $model = Join-Path $root $model }
  if (Test-Path $model) {
    $mb = [math]::Round((Get-Item $model).Length / 1MB, 1)
    Report 'voice model present' 'PASS' "$mb MB  $model"
    if (Test-Path "$model.json") {
      Report 'voice model sidecar present' 'PASS'
    } else {
      Report 'voice model sidecar present' 'FAIL' "$model.json is missing - piper needs it"
    }
  } else {
    Report 'voice model present' 'FAIL' "$model not found - run: npm.cmd run fetch-voice   (before the demo, not during it)"
  }
}

# ---------------------------------------------------------------------------------------------
Write-Host "`nDependencies" -ForegroundColor Cyan
if (Test-Path (Join-Path $root 'node_modules')) {
  Report 'node_modules installed' 'PASS'
} else {
  Report 'node_modules installed' 'FAIL' 'run: npm.cmd install   (npm.cmd, not npm)'
}

# koffi is the whole privileged half. Loading it HERE, in whatever context this script is running
# in, is the only check that means anything - it is why this script wants to be run elevated.
$koffiProbe = & node -e "require('koffi'); console.log('ok')" 2>&1 | Out-String
if ($koffiProbe -match 'ok') {
  Report 'koffi loads' 'PASS' $(if ($elevated) { 'in the elevated context' } else { 'unelevated only - re-run this script elevated' })
} else {
  Report 'koffi loads' 'FAIL' ($koffiProbe.Trim() -split "`n" | Select-Object -First 1)
}

# ---------------------------------------------------------------------------------------------
Write-Host "`nAPI key" -ForegroundColor Cyan
# The VALUE is never read, printed, or logged - only whether a usable line exists.
$envPath = Join-Path $root '.env'
if (Test-Path $envPath) {
  $keyLine = Get-Content $envPath | Where-Object { $_ -match '^\s*ANTHROPIC_API_KEY\s*=\s*\S' }
  if ($keyLine) {
    if ($keyLine -match '^\s*ANTHROPIC_API_KEY\s*=\s*sk-') {
      Report '.env has a key' 'PASS' 'value not read or printed'
    } else {
      Report '.env has a key' 'WARN' 'a key line exists but does not start with sk- - check it is the real key'
    }
  } else {
    Report '.env has a key' 'FAIL' 'the ANTHROPIC_API_KEY line is missing or still commented out - Scenario 3 will not run'
  }
} else {
  Report '.env exists' 'FAIL' "no .env at $envPath - run: copy .env.example .env   then paste the key into it"
}
if ($env:ANTHROPIC_API_KEY) {
  Report 'session variable also set' 'WARN' 'harmless here, but RunAs does not inherit it - the .env file is what matters'
}

# ---------------------------------------------------------------------------------------------
if (-not $SkipTests) {
  Write-Host "`nTests" -ForegroundColor Cyan
  Push-Location $root
  # broker.test.mjs case 8 branches on MATIC_ELEVATED: without it the suite asserts that a
  # privileged action is REFUSED, which is false when we are elevated - the spooler restart
  # actually succeeds and the check fails for the wrong reason. verify-privileged.ps1 sets the
  # same variable; this keeps the contract consistent.
  $priorElevatedFlag = $env:MATIC_ELEVATED
  if ($elevated) { $env:MATIC_ELEVATED = '1' }
  $testOutput = & npm.cmd test 2>&1 | Out-String
  $testExit = $LASTEXITCODE
  $env:MATIC_ELEVATED = $priorElevatedFlag
  Pop-Location
  $failedLines = $testOutput -split "`n" | Where-Object { $_ -match '\bFAIL\b' }
  if ($testExit -eq 0 -and -not $failedLines) {
    $counts = ([regex]::Matches($testOutput, '(\d+) passed') | ForEach-Object { [int]$_.Groups[1].Value } | Measure-Object -Sum).Sum
    Report 'npm test' 'PASS' "$counts checks green"
  } else {
    Report 'npm test' 'FAIL' (($failedLines | Select-Object -First 3) -join ' | ')
  }
}

# ---------------------------------------------------------------------------------------------
Write-Host "`nMachine state" -ForegroundColor Cyan
Push-Location $root
$probeJson = & node (Join-Path $PSScriptRoot 'probe-json.mjs') 2>&1 | Out-String
Pop-Location

$probe = $null
try { $probe = $probeJson.Trim() | ConvertFrom-Json } catch { }
if (-not $probe) {
  Report 'probe runs' 'FAIL' ($probeJson.Trim() -split "`n" | Select-Object -First 1)
} else {
  # `online: false` on a working machine is not cosmetic: the agent skips every cloud call when
  # it is false, so Scenario 3 would never reach the model.
  if ($probe.online) {
    Report 'probe reports online' 'PASS' ($probe.primary -join ', ')
  } else {
    Report 'probe reports online' 'FAIL' 'the agent skips all cloud calls while this is false - Scenario 3 will not run'
  }
  Report 'adapters visible to the probe' 'INFO' "$($probe.adapters) total, $($probe.actionable) actionable"
  foreach ($name in 'spooler', 'audiosrv', 'dnscache', 'dhcp') {
    $state = $probe.services.$name
    if ($state -eq 'RUNNING') { Report "service $name" 'PASS' $state }
    elseif ($state -eq 'ERROR') { Report "service $name" 'FAIL' 'could not be read' }
    else { Report "service $name" 'WARN' "$state - run reset-demo.ps1 to get back to clean" }
  }
}

# ---------------------------------------------------------------------------------------------
Write-Host "`nAdapter topology" -ForegroundColor Cyan
$physical = @(Get-NetAdapter -Physical -ErrorAction SilentlyContinue | Where-Object { $_.Status -eq 'Up' })
if ($physical.Count -eq 0) {
  Report 'connected physical adapters' 'FAIL' 'none - this machine is not on a network'
} elseif ($physical.Count -eq 1) {
  Report 'connected physical adapters' 'WARN' `
    "1 ($($physical[0].Name)) - single-NIC. Read DEMO-RUNBOOK.md section 3.2 before choosing the Scenario 2 fault"
} else {
  Report 'connected physical adapters' 'PASS' "$($physical.Count) - $(($physical | ForEach-Object Name) -join ', ')"
}

# ---------------------------------------------------------------------------------------------
Write-Host "`nA script cannot check these - do them by hand:" -ForegroundColor Cyan
Write-Host '  - npm.cmd run verify:privileged -- -IncludeNetwork   (elevated, on this hardware)' -ForegroundColor Gray
Write-Host '  - Piper pre-warmed (~4 s ONNX load) before anyone is watching' -ForegroundColor Gray
Write-Host '  - App already launched elevated, so no UAC prompt in front of the audience' -ForegroundColor Gray
Write-Host '  - Notifications, Teams popups and screen sleep all off' -ForegroundColor Gray
Write-Host '  - Scenario 2 rehearsed on this machine, recovery time measured (section 3.1)' -ForegroundColor Gray

# ---------------------------------------------------------------------------------------------
Write-Host ''
if ($script:fails.Count -gt 0) {
  Write-Host "NOT READY - $($script:fails.Count) blocking:" -ForegroundColor Red
  $script:fails | ForEach-Object { Write-Host "  - $_" -ForegroundColor Red }
  if ($script:warns.Count -gt 0) {
    Write-Host "and $($script:warns.Count) to look at:" -ForegroundColor Yellow
    $script:warns | ForEach-Object { Write-Host "  - $_" -ForegroundColor Yellow }
  }
  exit 1
}
if ($script:warns.Count -gt 0) {
  Write-Host "Ready, with $($script:warns.Count) to look at:" -ForegroundColor Yellow
  $script:warns | ForEach-Object { Write-Host "  - $_" -ForegroundColor Yellow }
  exit 0
}
Write-Host 'Ready. Every automated check passed.' -ForegroundColor Green
exit 0
