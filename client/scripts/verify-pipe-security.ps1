<#
.SYNOPSIS
  Closes the D201 [VERIFY]: can an unprivileged agent write to a LocalSystem-hosted Node named pipe?

.DESCRIPTION
  The named-pipe design (docs/2026-09-04-named-pipe-protocol-design.md) rests on a claim read off
  libuv's source and Microsoft's documentation: libuv passes NULL as lpSecurityAttributes to
  CreateNamedPipeW, so the default DACL grants Everyone only FILE_GENERIC_READ - and a client needs
  write access to send a request. If true, the protocol cannot run on a pipe the broker creates
  through node:net.

  This runs the experiment instead of citing it, in two parts:

    1. verify-pipe-dacl.ps1        - start a REAL Node pipe (pipe-dacl-probe-server.mjs) and read
                                     the DACL Windows actually gave it.
    2. verify-pipe-accesscheck.ps1 - rebuild that exact DACL with no ACE for the current user, so
                                     it mirrors a LocalSystem-created pipe, and exercise the access
                                     check for read and for write.

  RUN THIS UNELEVATED. An elevated token has the Administrators SID enabled rather than deny-only,
  which satisfies the (A;;FA;;;BA) ace and makes the write succeed - the wrong answer to the
  question, arrived at honestly. The script refuses to draw a conclusion if it is elevated.

.NOTES
  Result on 2026-09-04, Windows 11 26200, Node 24.19.0: read ALLOWED, write REFUSED with
  ERROR_ACCESS_DENIED. Register §10.2 and §10.5.
#>
$ErrorActionPreference = 'Stop'
$here = $PSScriptRoot

$id = [Security.Principal.WindowsIdentity]::GetCurrent()
$pr = New-Object Security.Principal.WindowsPrincipal($id)
if ($pr.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
  Write-Host "REFUSING TO RUN ELEVATED." -ForegroundColor Red
  Write-Host "An elevated token has Administrators ENABLED, not deny-only, so it satisfies the"
  Write-Host "(A;;FA;;;BA) ace and the write will succeed. That is not the question this asks."
  Write-Host "Run it from a normal PowerShell window."
  exit 2
}

Write-Host "=== 1. what DACL does a real Node pipe actually get? ===" -ForegroundColor Cyan
$name = "matic-dacl-probe"
$node = Start-Process -FilePath "node" `
  -ArgumentList (Join-Path $here "pipe-dacl-probe-server.mjs"), $name `
  -PassThru -WindowStyle Hidden
try {
  # The pipe exists once listen() returns; give it a moment rather than racing it.
  $deadline = (Get-Date).AddSeconds(10)
  $up = $false
  while ((Get-Date) -lt $deadline) {
    try { $null = [System.IO.File]::OpenRead('\\.\pipe\' + $name); $up = $true; break }
    catch { if ($_.Exception.Message -notmatch 'cannot find|not find') { $up = $true; break } }
    Start-Sleep -Milliseconds 250
  }
  if (-not $up) { Write-Host "  the probe server never came up" -ForegroundColor Red; exit 1 }

  & powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $here "verify-pipe-dacl.ps1") -Name $name
} finally {
  if ($node -and -not $node.HasExited) { Stop-Process -Id $node.Id -Force -ErrorAction SilentlyContinue }
}

Write-Host ""
Write-Host "=== 2. does the access check refuse the write? ===" -ForegroundColor Cyan
& powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $here "verify-pipe-accesscheck.ps1")

Write-Host ""
Write-Host "Note on the FILE_READ_DATA line in part 2: win32 231 is ERROR_PIPE_BUSY, not a" -ForegroundColor DarkGray
Write-Host "permission result. The preceding successful GENERIC_READ open consumed the single" -ForegroundColor DarkGray
Write-Host "listening instance. It is noise, not a finding." -ForegroundColor DarkGray
