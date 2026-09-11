// @ts-check
/**
 * System-state bindings for the restart signal. PRIVILEGED - only an implementation of Broker may
 * import this (`broker.d.ts`), same as `scm.js` and `net.js`.
 *
 * Native ntdll / kernel32 / advapi32 / wevtapi calls only. No cmd.exe, no powershell.exe, no
 * `.ps1` dropped to disk, no encoded command strings - that is the behaviour EDR flags (§6, §12),
 * and the telemetry spec's §6 arrives at the same rule from the other end: execution policy
 * blocked a dropped `.ps1` on the test machine, and `-ExecutionPolicy Bypass -File` is itself
 * blocked by a Group Policy at MachinePolicy scope.
 *
 * Everything here is READ-ONLY and every call below ran UNELEVATED on 2026-09-11 - including the
 * two HKLM reads and the event-log queries. The spec expected the pending-reboot registry reads to
 * need elevation; on this machine they did not.
 *
 * ===============================================================================================
 * WHY THERE IS NO TICK COUNTER IN THIS FILE
 * ===============================================================================================
 *
 * `[Environment]::TickCount` is 32-bit and wraps at 2^32 ms = 49.7 days, so a machine up for 60
 * days reports as freshly booted - the machines that most need flagging are exactly the ones that
 * would report clean. And `[Environment]::TickCount64` returned EMPTY on Windows PowerShell 5.1 on
 * the test host rather than throwing, so a collector reading it without a null check computes an
 * uptime of zero and never fires.
 *
 * `GetTickCount64()` from kernel32 has neither problem and the spec says so. This file still does
 * not use it, because an absolute boot INSTANT is strictly better than an interval: it is the thing
 * the spec's primary source reports, it can be shown, and it cannot be confused with a duration.
 * `bootInstant()` therefore reads `SystemTimeOfDayInformation`, whose `BootTime` is the kernel's own
 * boot timestamp.
 *
 * ===============================================================================================
 * AND IT REPORTS `LastBootUpTime` EXACTLY, WHICH WAS MEASURED RATHER THAN ASSUMED
 * ===============================================================================================
 *
 * The kernel's `BootTime` is NOT the value WMI reports. `BootTimeBias`, from the same struct, is
 * exactly the difference. Measured on this machine on 2026-09-11, to the millisecond:
 *
 *   SystemTimeOfDayInformation.BootTime                     1788996032136  (23:20:32.136Z)
 *   minus BootTimeBias                                      -        7636
 *   =                                                       1788996024500  (23:20:24.500Z)
 *   WMI (Get-CimInstance Win32_OperatingSystem).LastBootUpTime
 *                                                           1788996024500  (23:20:24.500Z)
 *
 * An exact match is a strong claim off one machine, so it was cross-checked from a third direction,
 * and the third source resolves WHICH value is which rather than merely agreeing:
 *
 *   GetTickCount64()                                        115653312 ms
 *   uptime from the raw BootTime                            115652828 ms   (+484 ms, call latency)
 *   uptime from the corrected BootTime                      115660464 ms   (-7152 ms)
 *
 * So the raw `BootTime` is the origin the tick counter measures from, and `BootTime - BootTimeBias`
 * is what `LastBootUpTime` reports. `bootTimeMs` below is therefore the corrected one - acceptance
 * asks for `LastBootUpTime` and this is that value, not an approximation of it - and the raw kernel
 * figure is kept alongside it as `kernelBootTimeMs` so the two are never silently conflated.
 *
 * **The honest size of this claim: one machine, one day.** The identity is exact here and is a
 * hypothesis anywhere else. Nothing depends on it being exact - the difference is 7.6 seconds
 * against thresholds of 14 and 30 days and a row reading "2 days ago" - so if it does not hold on
 * some other machine, the consequence is a row that is seconds out, not a wrong recommendation.
 *
 * ===============================================================================================
 * NULL IS NOT ZERO, ANYWHERE IN THIS FILE
 * ===============================================================================================
 *
 * Every function returns `null` for a value it could not read, and never a zero, an empty string or
 * a `false`. The whole failure mode the spec found is a probe that cannot be read being scored as
 * "fine": an uptime of zero is a machine that just restarted, which is the one reading that can
 * never fire a recommendation. `restart-signal.js` scores `null` as no evidence either way.
 */
import { createRequire } from "node:module";
const koffi = createRequire(import.meta.url)("koffi");

const ntdll = koffi.load("ntdll.dll");
const kernel32 = koffi.load("kernel32.dll");
const advapi32 = koffi.load("advapi32.dll");

const NtQuerySystemInformation = ntdll.func(
  "long __stdcall NtQuerySystemInformation(uint32_t cls, _Out_ void *buf, uint32_t len, _Out_ uint32_t *ret)"
);

const SystemTimeOfDayInformation = 3;
const SystemProcessInformation = 5;
const STATUS_SUCCESS = 0;
const STATUS_INFO_LENGTH_MISMATCH = 0xc0000004;

/** Milliseconds between the FILETIME epoch (1601-01-01) and the Unix epoch. */
const FILETIME_EPOCH_OFFSET_MS = 11644473600000n;
/** A FILETIME/system-time value is in 100-nanosecond intervals. */
const HUNDRED_NS_PER_MS = 10000n;

const NUL = String.fromCharCode(0);

/** x64 and arm64 both have 8-byte pointers; the raw struct walk below assumes that and nothing else. */
const POINTERS_ARE_64_BIT = process.arch === "x64" || process.arch === "arm64";

// ===============================================================================================
// 1. Boot instant
// ===============================================================================================

/**
 * SYSTEM_TIMEOFDAY_INFORMATION, x64:
 *
 *    0  LARGE_INTEGER BootTime        system time at boot, 100ns since 1601
 *    8  LARGE_INTEGER CurrentTime     system time now, same units
 *   16  LARGE_INTEGER TimeZoneBias
 *   24  ULONG         TimeZoneId
 *   28  ULONG         Reserved
 *   32  ULONGLONG     BootTimeBias
 *   40  ULONGLONG     SleepTimeBias
 *
 * `CurrentTime` is read from the same 48-byte snapshot as `BootTime` rather than from `Date.now()`,
 * so the subtraction cannot straddle a clock adjustment.
 *
 * `bootTimeBias` is measured and USED - see this file's header for the measurement that established
 * it reproduces `LastBootUpTime` exactly. `sleepTimeBias` is CARRIED AND NOT INTERPRETED: it is
 * adjacent to the Fast Startup question the spec's §1 leaves open (`[VERIFY]`: whether
 * `LastBootUpTime` resets across a Fast Startup shutdown, and what boot types `0x1` and `0x2`
 * actually mean) and it would be easy to read a conclusion into it. Nothing in this build does. It
 * is recorded so that whoever tests a machine with Fast Startup ENABLED has a reading from the
 * machines where it was disabled.
 *
 * @returns {{bootTimeMs: number, kernelBootTimeMs: number, nowMs: number, uptimeMs: number,
 *            bootTimeBiasMs: number, sleepTimeBiasMs: number, source: string} | null}
 */
export function bootInstant() {
  const buf = Buffer.alloc(48);
  const returned = [0];
  const status = NtQuerySystemInformation(SystemTimeOfDayInformation, buf, buf.length, returned);
  if (status !== STATUS_SUCCESS || returned[0] < 48) return null;

  const bootTime = buf.readBigUInt64LE(0);
  const currentTime = buf.readBigUInt64LE(8);
  // A kernel that reported a boot in the future, or at the epoch, is a kernel this code does not
  // understand. Saying so is right; computing a duration from it is how a zero gets scored.
  if (bootTime === 0n || currentTime === 0n || currentTime < bootTime) return null;

  const toUnixMs = (systemTime) => Number(systemTime / HUNDRED_NS_PER_MS - FILETIME_EPOCH_OFFSET_MS);
  const bootTimeBiasMs = Number(buf.readBigUInt64LE(32) / HUNDRED_NS_PER_MS);
  const kernelBootTimeMs = toUnixMs(bootTime);
  const nowMs = toUnixMs(currentTime);
  // The bias is what makes this `LastBootUpTime` rather than something eight seconds from it. It
  // is subtracted rather than trusted blindly: a bias larger than the uptime itself would mean the
  // field is not what it was measured to be on this machine, and the raw value is the safer answer
  // than a boot instant in the future.
  const corrected = bootTimeBiasMs > 0 && bootTimeBiasMs < nowMs - kernelBootTimeMs
    ? kernelBootTimeMs - bootTimeBiasMs
    : kernelBootTimeMs;
  return {
    bootTimeMs: corrected,
    kernelBootTimeMs,
    nowMs,
    uptimeMs: nowMs - corrected,
    bootTimeBiasMs,
    sleepTimeBiasMs: Number(buf.readBigUInt64LE(40) / HUNDRED_NS_PER_MS),
    source: "SystemTimeOfDayInformation.BootTime - BootTimeBias (= Win32_OperatingSystem.LastBootUpTime)",
  };
}

// ===============================================================================================
// 2. Pending-reboot flags
// ===============================================================================================

const RegOpenKeyExW = advapi32.func(
  "long __stdcall RegOpenKeyExW(void *key, const char16_t *sub, uint32_t opt, uint32_t sam, _Out_ void **out)"
);
const RegQueryValueExW = advapi32.func(
  "long __stdcall RegQueryValueExW(void *key, const char16_t *name, void *reserved, _Out_ uint32_t *type, _Out_ void *data, _Inout_ uint32_t *len)"
);
const RegCloseKey = advapi32.func("long __stdcall RegCloseKey(void *key)");

const HKEY_LOCAL_MACHINE = koffi.as(0x80000002n, "void *");
const ERROR_SUCCESS = 0;
const KEY_READ = 0x20019;
/** Read the 64-bit view explicitly. A 32-bit host process would otherwise be redirected to Wow6432Node. */
const KEY_WOW64_64KEY = 0x0100;
const REG_MULTI_SZ = 7;

const CBS_REBOOT_PENDING =
  "SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Component Based Servicing\\RebootPending";
const WU_REBOOT_REQUIRED =
  "SOFTWARE\\Microsoft\\Windows\\WindowsUpdate\\Auto Update\\RebootRequired";
const SESSION_MANAGER = "SYSTEM\\CurrentControlSet\\Control\\Session Manager";

/** @returns {any} an open HKLM subkey handle, or null. */
function openLocalMachineKey(subKey) {
  const out = [null];
  const rc = RegOpenKeyExW(HKEY_LOCAL_MACHINE, subKey, 0, KEY_READ | KEY_WOW64_64KEY, out);
  return rc === ERROR_SUCCESS ? out[0] : null;
}

/**
 * Does the key EXIST? Both of the flags that fire alone are presence flags: Windows creates the
 * key and deletes it, and it carries no value worth reading.
 *
 * A failure to open is not the same as absence - a denied read would also return false here. That
 * is why `pendingRebootFlags()` reports `readable` separately, and why an unreadable pair scores
 * nothing rather than scoring as clear.
 */
function localMachineKeyExists(subKey) {
  const handle = openLocalMachineKey(subKey);
  if (!handle) return false;
  RegCloseKey(handle);
  return true;
}

/** @returns {{type: number, data: Buffer} | null} */
function localMachineValue(subKey, valueName) {
  const handle = openLocalMachineKey(subKey);
  if (!handle) return null;
  try {
    const len = [0];
    const type = [0];
    if (RegQueryValueExW(handle, valueName, null, type, null, len) !== ERROR_SUCCESS) return null;
    const data = Buffer.alloc(len[0]);
    len[0] = data.length;
    if (RegQueryValueExW(handle, valueName, null, type, data, len) !== ERROR_SUCCESS) return null;
    return { type: type[0], data: data.subarray(0, len[0]) };
  } finally {
    RegCloseKey(handle);
  }
}

/**
 * The three flags, and the one that is a trap.
 *
 * CBS and Windows Update are actionable on their own. `PendingFileRenameOperations` is NOT, and
 * this is the correction the spec makes to its own earlier advice: it had **two entries on a
 * machine that Windows Update had fully rebooted 27 hours earlier and that needed nothing at all**,
 * and it had one on THIS machine on 2026-09-11 (a staged `gamingservicesproxy` DLL). Installers,
 * antivirus and update staging populate it routinely and it often persists harmlessly. The weight
 * is in `restart-signal.js`; what this function must not do is flatten the three into one boolean,
 * because that is the shape that makes the trap unavoidable.
 *
 * REG_MULTI_SZ is UTF-16LE, NUL-separated and double-NUL terminated, and its entries come in
 * PAIRS - a source path and a destination, the destination being empty for a delete. So the count
 * reported here is of non-empty strings and is NOT a count of pending operations; it is only ever
 * used to say "present" and to show a human what is in there.
 *
 * @returns {{readable: boolean, cbs: boolean | null, windowsUpdate: boolean | null,
 *            pendingFileRenames: number | null, pendingFileRenameEntries: string[]}}
 */
export function pendingRebootFlags() {
  // The Session Manager key always exists on Windows, so opening it is the readability probe: if
  // that fails, this process cannot read HKLM and every `false` below would be a guess.
  const sessionManager = openLocalMachineKey(SESSION_MANAGER);
  if (!sessionManager) {
    return { readable: false, cbs: null, windowsUpdate: null, pendingFileRenames: null, pendingFileRenameEntries: [] };
  }
  RegCloseKey(sessionManager);

  const value = localMachineValue(SESSION_MANAGER, "PendingFileRenameOperations");
  const entries = value && value.type === REG_MULTI_SZ
    ? value.data.toString("ucs2").split(NUL).filter((s) => s.length > 0)
    : [];

  return {
    readable: true,
    cbs: localMachineKeyExists(CBS_REBOOT_PENDING),
    windowsUpdate: localMachineKeyExists(WU_REBOOT_REQUIRED),
    pendingFileRenames: entries.length,
    pendingFileRenameEntries: entries,
  };
}

// ===============================================================================================
// 3. Memory
// ===============================================================================================

const PERFORMANCE_INFORMATION = koffi.struct("PERFORMANCE_INFORMATION", {
  cb: "uint32",
  CommitTotal: "size_t",
  CommitLimit: "size_t",
  CommitPeak: "size_t",
  PhysicalTotal: "size_t",
  PhysicalAvailable: "size_t",
  SystemCache: "size_t",
  KernelTotal: "size_t",
  KernelPaged: "size_t",
  KernelNonpaged: "size_t",
  PageSize: "size_t",
  HandleCount: "uint32",
  ProcessCount: "uint32",
  ThreadCount: "uint32",
});
const K32GetPerformanceInfo = kernel32.func(
  "bool __stdcall K32GetPerformanceInfo(_Out_ PERFORMANCE_INFORMATION *info, uint32_t cb)"
);

/**
 * Commit charge and physical memory.
 *
 * **NOT `Get-Counter`, and this is a hard rule rather than a preference.** It terminated the
 * PowerShell host twice during the spec's probe - the process exited with no output and no
 * exception - and it resolves LOCALIZED counter names, so it breaks on non-English Windows. An
 * agent running unattended on machines nobody controls cannot have either property. The spec's
 * answer is `Win32_PerfRawData_PerfOS_Memory`, which has stable English property names;
 * `K32GetPerformanceInfo` is the same kernel counters one layer lower, with no WMI, no localization
 * and no host to terminate.
 *
 * **Measured against the spec's two sources, this machine, 2026-09-11:** the spec cross-checked
 * `Win32_OperatingSystem` (68.5%) against `Win32_PerfRawData_PerfOS_Memory` (68.8%, 57.71/83.91 GB)
 * and they agreed. This call reported 62.28/83.91 GB = 74.2% later the same day - the same commit
 * limit, so the same machine, with more committed.
 *
 * @returns {{commitUsedBytes: number, commitLimitBytes: number, commitUsedFraction: number,
 *            physicalTotalBytes: number, physicalAvailableBytes: number,
 *            processCount: number, handleCount: number} | null}
 */
export function memoryPressure() {
  const info = {};
  if (!K32GetPerformanceInfo(info, koffi.sizeof(PERFORMANCE_INFORMATION))) return null;
  const pageSize = Number(info.PageSize);
  const commitLimitBytes = Number(info.CommitLimit) * pageSize;
  // A zero commit limit would make the fraction Infinity or NaN, and a NaN compares false against
  // every threshold - which is silent, and reads exactly like a healthy machine.
  if (!pageSize || !commitLimitBytes) return null;
  const commitUsedBytes = Number(info.CommitTotal) * pageSize;
  return {
    commitUsedBytes,
    commitLimitBytes,
    commitUsedFraction: commitUsedBytes / commitLimitBytes,
    physicalTotalBytes: Number(info.PhysicalTotal) * pageSize,
    physicalAvailableBytes: Number(info.PhysicalAvailable) * pageSize,
    processCount: Number(info.ProcessCount),
    handleCount: Number(info.HandleCount),
  };
}

/**
 * SYSTEM_PROCESS_INFORMATION, x64, for the fields this reads:
 *
 *    0  ULONG          NextEntryOffset      0 ends the chain
 *   56  USHORT         ImageName.Length     BYTES, not characters
 *   64  PWSTR          ImageName.Buffer
 *   80  HANDLE         UniqueProcessId
 *  144  SIZE_T         WorkingSetSize
 *
 * ===============================================================================================
 * WHY THIS WALK CROSS-CHECKS ITSELF
 * ===============================================================================================
 *
 * These are raw byte offsets into an undocumented structure. If a future Windows moves a field, the
 * walk does not crash - it reads a neighbouring quadword and returns a plausible-looking number.
 * That is precisely the class of failure this project has a rule about (§10.5): a false signal
 * wearing the shape of the expected answer, where care does not help and only an independent check
 * does.
 *
 * So the check is independent: `K32GetPerformanceInfo` reports a process COUNT from a different
 * kernel call, and the walk must arrive at the same number. On 2026-09-11 both said 623. If they
 * disagree, or the chain runs off the end of the buffer, this returns null and the signal scores
 * nothing - it does not return a number it cannot vouch for.
 *
 * @returns {{bytes: number, fractionOfPhysical: number | null, processesWalked: number} | null}
 */
export function memoryCompressionWorkingSet() {
  if (!POINTERS_ARE_64_BIT) return null;
  const physical = memoryPressure();

  let capacity = 1 << 20;
  let buf = Buffer.alloc(capacity);
  const returned = [0];
  let status = NtQuerySystemInformation(SystemProcessInformation, buf, capacity, returned);
  // The process list changes between the sizing call and the reading call, so a retry loop is the
  // only correct shape. It is BOUNDED: an unbounded one is a hang on a machine that is thrashing,
  // which is the machine this whole signal exists for.
  for (let attempt = 0; attempt < 8 && (status >>> 0) === STATUS_INFO_LENGTH_MISMATCH; attempt++) {
    capacity = Math.max(returned[0] + 262144, capacity * 2);
    buf = Buffer.alloc(capacity);
    status = NtQuerySystemInformation(SystemProcessInformation, buf, capacity, returned);
  }
  if (status !== STATUS_SUCCESS) return null;

  const limit = returned[0];
  let offset = 0;
  let walked = 0;
  let found = null;
  for (;;) {
    if (offset + 152 > limit) return null; // the chain left the buffer: the layout is not this one
    walked++;
    const next = buf.readUInt32LE(offset);
    const nameBytes = buf.readUInt16LE(offset + 56);
    const namePtr = buf.readBigUInt64LE(offset + 64);
    if (nameBytes > 0 && namePtr !== 0n) {
      // UNICODE_STRING is not required to be NUL-terminated, so the length governs and anything
      // after a NUL inside it is dropped.
      const name = koffi.decode(namePtr, "char16_t", nameBytes / 2).split(NUL)[0];
      if (name === "Memory Compression") {
        found = { bytes: Number(buf.readBigUInt64LE(offset + 144)) };
      }
    }
    if (next === 0) break;
    offset += next;
  }

  // The independent check. A walk that disagrees with the kernel's own count has read something
  // other than the structure it thinks it read.
  if (!physical || walked !== physical.processCount) return null;
  // Absent is a real answer and is NOT zero: Windows may legitimately not be running the process,
  // and a zero would be scored as "no memory pressure" rather than as "not known".
  if (!found) return null;
  return {
    bytes: found.bytes,
    fractionOfPhysical: physical.physicalTotalBytes ? found.bytes / physical.physicalTotalBytes : null,
    processesWalked: walked,
  };
}

// ===============================================================================================
// 3a. Disk - PER VOLUME, NEVER AGGREGATED
// ===============================================================================================

const GetLogicalDriveStringsW = kernel32.func(
  "uint32_t __stdcall GetLogicalDriveStringsW(uint32_t len, _Out_ void *buf)"
);
const GetDriveTypeW = kernel32.func("uint32_t __stdcall GetDriveTypeW(const char16_t *root)");
const GetDiskFreeSpaceExW = kernel32.func(
  "bool __stdcall GetDiskFreeSpaceExW(const char16_t *dir, _Out_ uint64_t *freeToCaller, _Out_ uint64_t *total, _Out_ uint64_t *totalFree)"
);

const DRIVE_FIXED = 3;

/**
 * Every FIXED volume, with its free and total bytes.
 *
 * **PER VOLUME, NEVER AGGREGATED**, which is the spec's own rule and is not a stylistic preference:
 * a machine with 2.9 TB free across five volumes and 8 GB left on C: is in trouble, and the total
 * says the opposite. Nothing in this file adds them up and nothing downstream may either.
 *
 * FIXED only. Removable drives, network shares and mounted ISOs are not this machine's storage and
 * a USB stick at 99% full is not a support ticket.
 *
 * `GetDiskFreeSpaceExW`'s first output is the quota-aware figure for the calling user and the third
 * is the volume's actual free space. **The third is the one reported**, because the panel is
 * describing the disk rather than this account's allowance - and on a machine with no quotas they
 * are equal, which is exactly why picking the wrong one is invisible until someone has quotas.
 *
 * @returns {{root: string, freeBytes: number, totalBytes: number, freeFraction: number}[] | null}
 */
export function fixedVolumes() {
  const buf = Buffer.alloc(1024);
  const chars = GetLogicalDriveStringsW(512, buf);
  if (!chars) return null;
  const roots = buf.subarray(0, chars * 2).toString("ucs2").split(NUL).filter(Boolean);

  const volumes = [];
  for (const root of roots) {
    if (GetDriveTypeW(root) !== DRIVE_FIXED) continue;
    const freeToCaller = [0n];
    const total = [0n];
    const totalFree = [0n];
    // A volume that cannot be read is SKIPPED rather than reported as zero. A zero free-bytes
    // reading is "this disk is completely full", which is the loudest thing this feature can say.
    if (!GetDiskFreeSpaceExW(root, freeToCaller, total, totalFree)) continue;
    const totalBytes = Number(total[0]);
    const freeBytes = Number(totalFree[0]);
    if (!totalBytes) continue;
    volumes.push({ root, freeBytes, totalBytes, freeFraction: freeBytes / totalBytes });
  }
  return volumes;
}

// ===============================================================================================
// 4. The two boot events - COLLECTED, RECORDED, NOT INTERPRETED
// ===============================================================================================

/**
 * `wevtapi` is loaded lazily and inside a try, unlike the three libraries at the top of this file.
 * It is the least essential of the probes and the most exotic, and an agent that will not start
 * because an event-log library is missing has traded a context line for the whole product.
 */
let wevtapi = null;
let wevtapiTried = false;
function eventLogApi() {
  if (wevtapiTried) return wevtapi;
  wevtapiTried = true;
  try {
    const lib = koffi.load("wevtapi.dll");
    wevtapi = {
      EvtQuery: lib.func("void* __stdcall EvtQuery(void *session, const char16_t *path, const char16_t *query, uint32_t flags)"),
      EvtNext: lib.func("bool __stdcall EvtNext(void *result, uint32_t count, _Out_ void **events, uint32_t timeout, uint32_t flags, _Out_ uint32_t *returned)"),
      EvtRender: lib.func("bool __stdcall EvtRender(void *ctx, void *fragment, uint32_t flags, uint32_t size, _Out_ void *buf, _Out_ uint32_t *used, _Out_ uint32_t *props)"),
      EvtClose: lib.func("bool __stdcall EvtClose(void *handle)"),
    };
  } catch {
    wevtapi = null;
  }
  return wevtapi;
}

const EvtQueryChannelPath = 0x1;
const EvtQueryReverseDirection = 0x200;
const EvtRenderEventXml = 1;

/**
 * The newest System-log event matching an XPath query, rendered as XML.
 *
 * **This corrects a measurement in the spec.** Its §7 says every probe returned in well under a
 * second "except the event-log query". Done this way - a targeted XPath, reverse direction, one
 * event - it took **1.2 ms for Event 1074 and 5.9 ms for Event 27** on this machine on 2026-09-11.
 * The cost the spec measured belongs to walking the log, not to reading from it.
 *
 * @returns {string | null} the event XML, or null if there is no such event or it cannot be read.
 */
function newestSystemEventXml(xpath) {
  const api = eventLogApi();
  if (!api) return null;
  const query = api.EvtQuery(null, "System", xpath, EvtQueryChannelPath | EvtQueryReverseDirection);
  if (!query) return null;
  try {
    const events = [null];
    const returned = [0];
    if (!api.EvtNext(query, 1, events, 0, 0, returned) || returned[0] === 0) return null;
    const event = events[0];
    try {
      const used = [0];
      const props = [0];
      api.EvtRender(null, event, EvtRenderEventXml, 0, null, used, props);
      if (!used[0]) return null;
      const buf = Buffer.alloc(used[0] + 2);
      if (!api.EvtRender(null, event, EvtRenderEventXml, buf.length, buf, used, props)) return null;
      return buf.subarray(0, used[0]).toString("ucs2").replace(/\u0000+$/, "");
    } finally {
      api.EvtClose(event);
    }
  } finally {
    api.EvtClose(query);
  }
}

const eventTime = (xml) => /SystemTime=['"]([^'"]+)/.exec(xml)?.[1] ?? null;

/**
 * Event ID 27 from `Microsoft-Windows-Kernel-Boot`: what KIND of boot the last one was.
 *
 * ===============================================================================================
 * THE BOOT TYPE IS RECORDED AND NOT MAPPED. THIS IS THE SPEC'S `[VERIFY]`, CARRIED FORWARD.
 * ===============================================================================================
 *
 * `0x0` = full/cold boot is corroborated but ONLY `0x0` has ever been observed, and only on
 * machines with Fast Startup DISABLED - the spec's test machine (`HiberbootEnabled = 0`) and this
 * one, checked on 2026-09-11, also `0`. `0x1` (hybrid boot) and `0x2` (resume from hibernation)
 * are **unverified**.
 *
 * That matters more here than anywhere else in the feature, because the whole concern is that Fast
 * Startup turns "Shut down" into a kernel hibernate, so a user who powers down nightly still shows
 * weeks of uptime. Until `0x1` is confirmed on a machine with Fast Startup enabled, **nothing may
 * assert a cold-boot distinction anywhere a user reads it.** So this returns the raw value and no
 * interpretation of it, `restart-signal.js` gives it no weight, and no surface renders it.
 *
 * @returns {{bootType: number | null, bootTypeRaw: string | null, atIso: string | null,
 *            interpreted: false} | null}
 */
export function lastBootTypeEvent() {
  const xml = newestSystemEventXml(
    "*[System[Provider[@Name='Microsoft-Windows-Kernel-Boot'] and (EventID=27)]]"
  );
  if (!xml) return null;
  const raw = /<Data Name=['"]BootType['"]>([^<]*)</.exec(xml)?.[1] ?? null;
  const parsed = raw === null ? null : Number(raw);
  return {
    bootType: Number.isInteger(parsed) ? parsed : null,
    bootTypeRaw: raw,
    atIso: eventTime(xml),
    /** Always false. The field exists so that a reader of this object cannot mistake it for a verdict. */
    interpreted: false,
  };
}

/**
 * Event ID 1074: who initiated the last restart.
 *
 * On the spec's machine and on this one it was `TrustedInstaller.exe` - a Windows Update reboot,
 * which is useful context: the machine is patched-current and its uptime clock is legitimately
 * young.
 *
 * ===============================================================================================
 * THIS CANNOT BE SPOKEN, AND IT IS THE EVENT THAT SAYS SO (D249)
 * ===============================================================================================
 *
 * The spec calls this "context for the conversation". On this machine `param1` read
 * `C:\WINDOWS\servicing\TrustedInstaller.exe (WAKANDA)` and `param2` read `WAKANDA` - **the
 * machine's name, twice, inside the payload** - and `param7` was `NT AUTHORITY\SYSTEM`, an account.
 * D249 says this machine's name and the signed-in account may be SHOWN and are never SAID.
 *
 * So this is collected, recorded, and routed to the inspector and the developer log. It is not in
 * the sentence the conversation moment speaks and it is not a row. That is a narrowing of what the
 * spec suggested, and the reason is a decision that already exists rather than a new preference.
 *
 * @returns {{processPath: string | null, reason: string | null, action: string | null,
 *            atIso: string | null} | null}
 */
export function lastRestartInitiatorEvent() {
  const xml = newestSystemEventXml("*[System[(EventID=1074)]]");
  if (!xml) return null;
  const data = (name) => /** @type {string | null} */ (
    new RegExp(`<Data Name=['"]${name}['"]>([^<]*)<`).exec(xml)?.[1] ?? null
  );
  return {
    processPath: data("param1"),
    reason: data("param3"),
    action: data("param5"),
    atIso: eventTime(xml),
  };
}

// ===============================================================================================
// 5. One call, for the probe
// ===============================================================================================

/**
 * Everything above, in one idempotent read. No state is kept between calls and nothing is cached -
 * the spec's own session lost its connection mid-probe, so a collector that depends on having run
 * before is a collector that reports nothing after a reconnect.
 *
 * Each member is independently nullable, because a machine where one probe is denied is still a
 * machine where the other four say something true.
 */
export function restartSignals() {
  const boot = bootInstant();
  const flags = pendingRebootFlags();
  const memory = memoryPressure();
  return {
    boot,
    flags,
    memory,
    memoryCompression: memoryCompressionWorkingSet(),
    // Context only, and never scored or spoken. See the two functions' own headers.
    bootTypeEvent: lastBootTypeEvent(),
    initiatorEvent: lastRestartInitiatorEvent(),
  };
}
