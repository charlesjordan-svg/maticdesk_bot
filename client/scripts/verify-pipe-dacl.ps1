# Read the DACL of a live named pipe.
#
# GetNamedSecurityInfoW(SE_FILE_OBJECT) returns ERROR_INVALID_PARAMETER (87) for a \\.\pipe\ path -
# a pipe is a kernel object, so it needs a HANDLE and SE_KERNEL_OBJECT. Microsoft's own note is
# that FILE_GENERIC_READ on a pipe "combines the rights to read data from the pipe, read pipe
# attributes, read extended attributes, and read the pipe's DACL", so a client that can read can
# also read the descriptor - which is how this probe gets in.
param([string]$Name = "matic-dacl-probe")
$Pipe = '\\.\pipe\' + $Name

$sig = @'
using System;
using System.Runtime.InteropServices;
public static class P {
  [DllImport("kernel32.dll", CharSet=CharSet.Unicode, SetLastError=true)]
  public static extern IntPtr CreateFileW(string path, uint access, uint share, IntPtr sa,
    uint disp, uint flags, IntPtr tmpl);
  [DllImport("advapi32.dll", SetLastError=true)]
  public static extern uint GetSecurityInfo(IntPtr h, int objType, uint si,
    out IntPtr owner, out IntPtr group, out IntPtr dacl, out IntPtr sacl, out IntPtr sd);
  [DllImport("advapi32.dll", CharSet=CharSet.Unicode, SetLastError=true)]
  public static extern bool ConvertSecurityDescriptorToStringSecurityDescriptorW(
    IntPtr sd, uint rev, uint si, out IntPtr str, out uint len);
  [DllImport("kernel32.dll", SetLastError=true)] public static extern bool CloseHandle(IntPtr h);
  [DllImport("kernel32.dll")] public static extern IntPtr LocalFree(IntPtr p);
}
'@
Add-Type -TypeDefinition $sig -ErrorAction Stop

$READ_CONTROL = 0x00020000
$GENERIC_READ = 0x80000000
$FILE_SHARE_RW = 0x00000003
$OPEN_EXISTING = 3
$INVALID = [IntPtr](-1)

# READ_CONTROL alone is enough to read the descriptor and does not need data access.
$h = [P]::CreateFileW($Pipe, $READ_CONTROL, $FILE_SHARE_RW, [IntPtr]::Zero, $OPEN_EXISTING, 0, [IntPtr]::Zero)
if ($h -eq $INVALID) {
  $e = [Runtime.InteropServices.Marshal]::GetLastWin32Error()
  "CreateFileW(READ_CONTROL) failed: win32 $e"
  $h = [P]::CreateFileW($Pipe, $GENERIC_READ, $FILE_SHARE_RW, [IntPtr]::Zero, $OPEN_EXISTING, 0, [IntPtr]::Zero)
  if ($h -eq $INVALID) { "CreateFileW(GENERIC_READ) also failed: win32 $([Runtime.InteropServices.Marshal]::GetLastWin32Error())"; exit 1 }
  "fell back to GENERIC_READ"
}

$SE_KERNEL_OBJECT = 6
$si = 0x00000004 -bor 0x00000001   # DACL | OWNER
$o=[IntPtr]::Zero; $g=[IntPtr]::Zero; $d=[IntPtr]::Zero; $s=[IntPtr]::Zero; $sd=[IntPtr]::Zero
$rc = [P]::GetSecurityInfo($h, $SE_KERNEL_OBJECT, $si, [ref]$o, [ref]$g, [ref]$d, [ref]$s, [ref]$sd)
if ($rc -ne 0) { "GetSecurityInfo failed: win32 $rc"; [P]::CloseHandle($h) | Out-Null; exit 1 }

$str=[IntPtr]::Zero; $len=0
[void][P]::ConvertSecurityDescriptorToStringSecurityDescriptorW($sd, 1, $si, [ref]$str, [ref]$len)
$sddl = [Runtime.InteropServices.Marshal]::PtrToStringUni($str)
[void][P]::LocalFree($str); [void][P]::LocalFree($sd); [void][P]::CloseHandle($h)

"pipe : $Pipe"
"SDDL : $sddl"
""
$rsd = New-Object System.Security.AccessControl.RawSecurityDescriptor($sddl)
$own = try { (New-Object Security.Principal.SecurityIdentifier($rsd.Owner)).Translate([Security.Principal.NTAccount]).Value } catch { "$($rsd.Owner)" }
"owner: $own"
""
"{0,-44} {1,-11} {2,-12} {3}" -f "principal","type","mask","pipe-relevant rights"
("-"*44) + " " + ("-"*11) + " " + ("-"*12) + " " + ("-"*44)
foreach ($ace in $rsd.DiscretionaryAcl) {
  $sid = $ace.SecurityIdentifier
  $name2 = try { $sid.Translate([Security.Principal.NTAccount]).Value } catch { $sid.Value }
  $m = [uint32]$ace.AccessMask
  $r = @()
  if ($m -band 0x00000001) { $r += "READ_DATA" }
  if ($m -band 0x00000002) { $r += "WRITE_DATA" }
  if ($m -band 0x00000004) { $r += "APPEND/CREATE_PIPE_INSTANCE" }
  if ($m -band 0x00000080) { $r += "WRITE_ATTRS" }
  if ($m -band 0x00020000) { $r += "READ_CONTROL" }
  if ($m -band 0x00040000) { $r += "WRITE_DAC" }
  if ($m -band 0x00100000) { $r += "SYNCHRONIZE" }
  if ($m -band 0x10000000) { $r += "GENERIC_ALL" }
  if ($m -band 0x40000000) { $r += "GENERIC_WRITE" }
  if ($m -band 0x80000000) { $r += "GENERIC_READ" }
  if ($r.Count -eq 0) { $r += "(none decoded)" }
  "{0,-44} {1,-11} 0x{2:X8}   {3}" -f $name2, $ace.AceType, $m, ($r -join ", ")
}
""
"VERDICT on write access for a non-owner, non-admin caller:"
$everyoneWrite = $false
foreach ($ace in $rsd.DiscretionaryAcl) {
  if ($ace.SecurityIdentifier.Value -eq 'S-1-1-0' -and $ace.AceType -eq 'AccessAllowed') {
    $m = [uint32]$ace.AccessMask
    if (($m -band 0x00000002) -or ($m -band 0x40000000) -or ($m -band 0x10000000)) { $everyoneWrite = $true }
    "  Everyone (S-1-1-0) mask 0x{0:X8}  WRITE_DATA={1}  GENERIC_WRITE={2}  CREATE_PIPE_INSTANCE={3}" -f `
      $m, [bool]($m -band 0x2), [bool]($m -band 0x40000000), [bool]($m -band 0x4)
  }
}
if ($everyoneWrite) { "  => Everyone CAN write. D201's blocker does NOT hold." }
else { "  => Everyone CANNOT write. D201's blocker holds for any caller not covered by another ACE." }
