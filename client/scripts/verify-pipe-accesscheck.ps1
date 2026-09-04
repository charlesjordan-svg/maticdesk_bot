# Does the access check actually refuse the write?
#
# The DACL read off a Node/libuv pipe is, in SDDL:
#   (A;;FA;;;SY)(A;;FA;;;BA)(A;;FA;;;<creator owner>)(A;;FR;;;WD)(A;;FR;;;AN)
#
# When the broker runs as LocalSystem, the creator-owner ACE IS the SY ACE, so an unprivileged
# agent falls through to WD (Everyone) = FILE_GENERIC_READ, with no WRITE_DATA.
#
# This reproduces that faithfully without needing a LocalSystem process: build a pipe whose DACL
# has ACEs for SYSTEM, Administrators and Everyone-read and NO ACE for the current user, then try
# to open it for writing with this (unelevated) token. Administrators is deny-only in a filtered
# token, so the BA ACE must not help - which is precisely the agent's situation.
$ErrorActionPreference = 'Stop'

$sig = @'
using System;
using System.Runtime.InteropServices;
public static class C {
  [DllImport("kernel32.dll", CharSet=CharSet.Unicode, SetLastError=true)]
  public static extern IntPtr CreateFileW(string path, uint access, uint share, IntPtr sa,
    uint disp, uint flags, IntPtr tmpl);
  [DllImport("kernel32.dll", SetLastError=true)] public static extern bool CloseHandle(IntPtr h);
}
'@
Add-Type -TypeDefinition $sig -ErrorAction Stop

$id = [Security.Principal.WindowsIdentity]::GetCurrent()
$pr = New-Object Security.Principal.WindowsPrincipal($id)
"caller        : $($id.Name)"
"elevated      : $($pr.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator))"

# Is the Administrators SID deny-only in this token? That is what makes an unelevated admin
# behave like a standard user for this check.
$adminSid = New-Object Security.Principal.SecurityIdentifier('S-1-5-32-544')
$hasAdminGroup = $id.Groups -contains $adminSid
"Admins in token: $hasAdminGroup (present but DENY_ONLY when unelevated - cannot satisfy an allow ACE)"
""

$name = "matic-accesscheck-probe"
$path = '\\.\pipe\' + $name

$sec = New-Object System.IO.Pipes.PipeSecurity
$sys  = New-Object Security.Principal.SecurityIdentifier('S-1-5-18')   # LocalSystem
$adm  = New-Object Security.Principal.SecurityIdentifier('S-1-5-32-544')
$evy  = New-Object Security.Principal.SecurityIdentifier('S-1-1-0')    # Everyone
$sec.AddAccessRule((New-Object System.IO.Pipes.PipeAccessRule($sys, 'FullControl', 'Allow')))
$sec.AddAccessRule((New-Object System.IO.Pipes.PipeAccessRule($adm, 'FullControl', 'Allow')))
# Use the EXACT mask observed on the real Node/libuv pipe rather than a hand-picked set of enum
# names. The first attempt granted ReadData+Synchronize and refused even GENERIC_READ, because
# GENERIC_READ also maps FILE_READ_ATTRIBUTES (0x80) and READ_CONTROL (0x20000). The real default
# DACL grants Everyone FR = 0x120089 = READ_DATA | READ_ATTRIBUTES | READ_CONTROL | SYNCHRONIZE.
$FR = [System.IO.Pipes.PipeAccessRights][Convert]::ToInt32('120089', 16)
$sec.AddAccessRule((New-Object System.IO.Pipes.PipeAccessRule($evy, $FR, 'Allow')))

$srv = New-Object System.IO.Pipes.NamedPipeServerStream(
  $name, [System.IO.Pipes.PipeDirection]::InOut, 4,
  [System.IO.Pipes.PipeTransmissionMode]::Byte,
  [System.IO.Pipes.PipeOptions]::Asynchronous, 4096, 4096, $sec)

"pipe created  : $path"
"DACL         : SYSTEM=FullControl, Administrators=FullControl, Everyone=0x120089 (FR, as observed)"
"               (deliberately NO ace for $($id.Name) - mirrors a LocalSystem-created pipe)"
""

# PowerShell 5.1 parses 0x80000000 as a NEGATIVE Int32, so [uint32] casts of the literal throw.
# Convert from the hex string instead.
$GENERIC_READ  = [Convert]::ToUInt32('80000000', 16)
$GENERIC_WRITE = [Convert]::ToUInt32('40000000', 16)
$FILE_WRITE_DATA = [Convert]::ToUInt32('00000002', 16)
$FILE_READ_DATA  = [Convert]::ToUInt32('00000001', 16)
$SHARE = [uint32]3
$OPEN_EXISTING = [uint32]3
$INVALID = [IntPtr](-1)

# Write-Host, not the pipeline. A function that emits strings AND returns a bool puts BOTH on the
# pipeline, so `$r = Try-Open ...` captures an array - and every array is truthy in PowerShell,
# which silently inverted this test's verdict on the first run.
function Try-Open([string]$label, [uint32]$access) {
  $h = [C]::CreateFileW($path, $access, $SHARE, [IntPtr]::Zero, $OPEN_EXISTING, 0, [IntPtr]::Zero)
  if ($h -eq $INVALID) {
    $e = [Runtime.InteropServices.Marshal]::GetLastWin32Error()
    $what = if ($e -eq 5) { "ERROR_ACCESS_DENIED" } else { "win32 $e" }
    Write-Host ("  {0,-42} REFUSED  ({1})" -f $label, $what)
    return $false
  }
  [void][C]::CloseHandle($h)
  Write-Host ("  {0,-42} ALLOWED" -f $label)
  return $true
}

"attempting to open the client end with this token:"
$r1 = Try-Open "GENERIC_READ  (what the agent may do)" $GENERIC_READ
$r2 = Try-Open "FILE_READ_DATA" $FILE_READ_DATA
$r3 = Try-Open "GENERIC_WRITE (what the protocol needs)" $GENERIC_WRITE
$r4 = Try-Open "FILE_WRITE_DATA" $FILE_WRITE_DATA
$r5 = Try-Open "GENERIC_READ | GENERIC_WRITE (duplex)" ($GENERIC_READ -bor $GENERIC_WRITE)

$srv.Dispose()
""
"=============================================================================="
if (($r1 -or $r2) -and -not ($r3 -or $r4 -or $r5)) {
  "RESULT: CONFIRMED. The caller can open for READ and is REFUSED for WRITE."
  "        A JSON-Lines request protocol cannot run on this pipe: the agent could"
  "        connect and never speak. D201's blocker is real."
} elseif ($r3 -or $r4 -or $r5) {
  "RESULT: NOT CONFIRMED. The write was ALLOWED. D201 needs revisiting - most of it"
  "        may be unnecessary."
} else {
  "RESULT: INCONCLUSIVE - even the read was refused. Something else is wrong."
}
