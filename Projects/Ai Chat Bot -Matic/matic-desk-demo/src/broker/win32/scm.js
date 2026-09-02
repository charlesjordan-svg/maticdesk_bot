// @ts-check
/**
 * Service Control Manager bindings. PRIVILEGED - only an implementation of Broker may import this.
 *
 * Native advapi32 calls only. No cmd.exe, no powershell.exe, no `sc.exe`, no encoded command
 * strings - that is the behaviour EDR flags (§6, §12).
 */
import { createRequire } from "node:module";
const koffi = createRequire(import.meta.url)("koffi");

const advapi32 = koffi.load("advapi32.dll");
const kernel32 = koffi.load("kernel32.dll");

const SERVICE_STATUS = koffi.struct("SERVICE_STATUS", {
  dwServiceType: "uint32",
  dwCurrentState: "uint32",
  dwControlsAccepted: "uint32",
  dwWin32ExitCode: "uint32",
  dwServiceSpecificExitCode: "uint32",
  dwCheckPoint: "uint32",
  dwWaitHint: "uint32",
});

const OpenSCManagerW = advapi32.func("void* __stdcall OpenSCManagerW(const char16_t *machine, const char16_t *database, uint32_t access)");
const OpenServiceW = advapi32.func("void* __stdcall OpenServiceW(void *scm, const char16_t *name, uint32_t access)");
const QueryServiceStatus = advapi32.func("bool __stdcall QueryServiceStatus(void *svc, _Out_ SERVICE_STATUS *status)");
const ControlService = advapi32.func("bool __stdcall ControlService(void *svc, uint32_t control, _Out_ SERVICE_STATUS *status)");
const StartServiceW = advapi32.func("bool __stdcall StartServiceW(void *svc, uint32_t argc, void *argv)");
const CloseServiceHandle = advapi32.func("bool __stdcall CloseServiceHandle(void *h)");
const GetLastError = kernel32.func("uint32_t __stdcall GetLastError()");

const SC_MANAGER_CONNECT = 0x0001;
const SERVICE_QUERY_STATUS = 0x0004;
const SERVICE_START = 0x0010;
const SERVICE_STOP = 0x0020;
const SERVICE_CONTROL_STOP = 0x0001;
const SERVICE_ACCEPT_STOP = 0x0001;

export const STATE_NAMES = {
  1: "STOPPED", 2: "START_PENDING", 3: "STOP_PENDING",
  4: "RUNNING", 5: "CONTINUE_PENDING", 6: "PAUSE_PENDING", 7: "PAUSED",
};

export const ERROR_ACCESS_DENIED = 5;
export const ERROR_SERVICE_NOT_ACTIVE = 1062;
export const ERROR_DEPENDENT_SERVICES_RUNNING = 1051;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Thrown for any Win32 failure. `.code` is the GetLastError value. */
export class Win32Error extends Error {
  constructor(call, code) {
    super(`${call} failed (Win32 error ${code})`);
    this.name = "Win32Error";
    this.call = call;
    this.code = code;
    /** ERROR_ACCESS_DENIED means the agent half cannot do this - it needs the broker (§12). */
    this.needsBroker = code === ERROR_ACCESS_DENIED;
  }
}

function withService(name, access, fn) {
  const scm = OpenSCManagerW(null, null, SC_MANAGER_CONNECT);
  if (!scm) throw new Win32Error("OpenSCManagerW", GetLastError());
  try {
    const svc = OpenServiceW(scm, name, access);
    if (!svc) throw new Win32Error(`OpenServiceW(${name})`, GetLastError());
    try {
      return fn(svc);
    } finally {
      CloseServiceHandle(svc);
    }
  } finally {
    CloseServiceHandle(scm);
  }
}

function statusOf(svc) {
  const st = {};
  if (!QueryServiceStatus(svc, st)) throw new Win32Error("QueryServiceStatus", GetLastError());
  return st;
}

/**
 * Read-only service probe. Works WITHOUT elevation - this is what the unprivileged agent half
 * uses for detection, and what the tier-0 router reads to decide what to propose.
 * @returns {{name:string, state:number, stateName:string, controlsAccepted:number, canStop:boolean}}
 */
export function queryService(name) {
  return withService(name, SERVICE_QUERY_STATUS, (svc) => {
    const st = statusOf(svc);
    return {
      name,
      state: st.dwCurrentState,
      stateName: STATE_NAMES[st.dwCurrentState] ?? `UNKNOWN(${st.dwCurrentState})`,
      controlsAccepted: st.dwControlsAccepted,
      // Verified on this machine: dnscache reports 0x58, which has SERVICE_ACCEPT_STOP clear.
      canStop: (st.dwControlsAccepted & SERVICE_ACCEPT_STOP) !== 0,
    };
  });
}

async function waitForState(svc, wanted, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const st = statusOf(svc);
    if (st.dwCurrentState === wanted) return st;
    if (Date.now() > deadline) {
      throw new Error(
        `service did not reach ${STATE_NAMES[wanted]} within ${timeoutMs}ms ` +
        `(stuck in ${STATE_NAMES[st.dwCurrentState]})`
      );
    }
    await sleep(200);
  }
}

/**
 * Stop then start a service. PRIVILEGED. Returns the observed state transition so the
 * transcript can report what actually happened rather than a canned success (§13).
 */
export async function restartService(name, { timeoutMs = 20000 } = {}) {
  const access = SERVICE_QUERY_STATUS | SERVICE_STOP | SERVICE_START;
  const scm = OpenSCManagerW(null, null, SC_MANAGER_CONNECT);
  if (!scm) throw new Win32Error("OpenSCManagerW", GetLastError());
  const svc = OpenServiceW(scm, name, access);
  if (!svc) {
    const code = GetLastError();
    CloseServiceHandle(scm);
    throw new Win32Error(`OpenServiceW(${name}, STOP|START)`, code);
  }
  try {
    const before = statusOf(svc);
    const steps = [];

    if (before.dwCurrentState !== 1 /* STOPPED */) {
      if ((before.dwControlsAccepted & SERVICE_ACCEPT_STOP) === 0) {
        throw new Error(
          `service "${name}" does not accept stop requests ` +
          `(controls-accepted mask 0x${before.dwControlsAccepted.toString(16)})`
        );
      }
      const st = {};
      if (!ControlService(svc, SERVICE_CONTROL_STOP, st)) {
        const code = GetLastError();
        if (code !== ERROR_SERVICE_NOT_ACTIVE) throw new Win32Error(`ControlService(${name}, STOP)`, code);
      }
      await waitForState(svc, 1, timeoutMs);
      steps.push("stopped");
    } else {
      steps.push("already stopped");
    }

    if (!StartServiceW(svc, 0, null)) throw new Win32Error(`StartServiceW(${name})`, GetLastError());
    const after = await waitForState(svc, 4 /* RUNNING */, timeoutMs);
    steps.push("started");

    return {
      name,
      stateBefore: STATE_NAMES[before.dwCurrentState],
      stateAfter: STATE_NAMES[after.dwCurrentState],
      steps,
    };
  } finally {
    CloseServiceHandle(svc);
    CloseServiceHandle(scm);
  }
}
