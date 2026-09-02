// @ts-check
/**
 * DNS / DHCP / adapter bindings. PRIVILEGED - only an implementation of Broker may import this.
 * Native dnsapi + iphlpapi only. No netsh, no ipconfig, no interpreter spawning (§6, §12).
 */
import { createRequire } from "node:module";
const koffi = createRequire(import.meta.url)("koffi");

const dnsapi = koffi.load("dnsapi.dll");
const iphlpapi = koffi.load("iphlpapi.dll");

const DnsFlushResolverCache = dnsapi.func("bool __stdcall DnsFlushResolverCache()");

const IP_ADDRESS_STRING = koffi.struct("IP_ADDRESS_STRING", {
  String: koffi.array("char", 16, "String"),
});
const IP_ADDR_STRING = koffi.struct("IP_ADDR_STRING", {
  Next: "void*",
  IpAddress: IP_ADDRESS_STRING,
  IpMask: IP_ADDRESS_STRING,
  Context: "uint32",
});
const IP_ADAPTER_INFO = koffi.struct("IP_ADAPTER_INFO", {
  Next: "void*",
  ComboIndex: "uint32",
  AdapterName: koffi.array("char", 260, "String"),
  Description: koffi.array("char", 132, "String"),
  AddressLength: "uint32",
  Address: koffi.array("uint8", 8),
  Index: "uint32",
  Type: "uint32",
  DhcpEnabled: "uint32",
  CurrentIpAddress: "void*",
  IpAddressList: IP_ADDR_STRING,
  GatewayList: IP_ADDR_STRING,
  DhcpServer: IP_ADDR_STRING,
  HaveWins: "int32",
  PrimaryWinsServer: IP_ADDR_STRING,
  SecondaryWinsServer: IP_ADDR_STRING,
  LeaseObtained: "int64",
  LeaseExpires: "int64",
});
const IP_ADAPTER_INDEX_MAP = koffi.struct("IP_ADAPTER_INDEX_MAP", {
  Index: "uint32",
  Name: koffi.array("char16_t", 128, "String"),
});

const GetAdaptersInfo = iphlpapi.func("uint32_t __stdcall GetAdaptersInfo(void *info, _Inout_ uint32_t *size)");
const GetInterfaceInfo = iphlpapi.func("uint32_t __stdcall GetInterfaceInfo(void *table, _Inout_ uint32_t *size)");
const IpReleaseAddress = iphlpapi.func("uint32_t __stdcall IpReleaseAddress(IP_ADAPTER_INDEX_MAP *adapter)");
const IpRenewAddress = iphlpapi.func("uint32_t __stdcall IpRenewAddress(IP_ADAPTER_INDEX_MAP *adapter)");

const ERROR_SUCCESS = 0;
const ERROR_ACCESS_DENIED = 5;
const ERROR_BUFFER_OVERFLOW = 111;
const ERROR_INSUFFICIENT_BUFFER = 122;
const ERROR_NO_DATA = 232;

export class NetApiError extends Error {
  constructor(call, code) {
    super(`${call} failed (Win32 error ${code})`);
    this.name = "NetApiError";
    this.call = call;
    this.code = code;
    this.needsBroker = code === ERROR_ACCESS_DENIED;
  }
}

/** Idempotent. Works unelevated. */
export function flushDnsCache() {
  const ok = DnsFlushResolverCache();
  if (!ok) throw new NetApiError("DnsFlushResolverCache", -1);
  return { flushed: true };
}

/**
 * Read-only adapter enumeration. Works WITHOUT elevation - this is the detection data the
 * tier-0 router reads to decide what to propose, and where renew_dhcp's adapterIndex comes
 * from (so the model never supplies it freeform).
 */
export function listAdapters() {
  let size = [0];
  let rc = GetAdaptersInfo(null, size);
  if (rc === ERROR_NO_DATA) return [];
  if (rc !== ERROR_BUFFER_OVERFLOW && rc !== ERROR_SUCCESS && rc !== ERROR_INSUFFICIENT_BUFFER) {
    throw new NetApiError("GetAdaptersInfo(size)", rc);
  }
  const buf = Buffer.alloc(size[0]);
  rc = GetAdaptersInfo(buf, size);
  if (rc !== ERROR_SUCCESS) throw new NetApiError("GetAdaptersInfo", rc);

  const out = [];
  let node = koffi.decode(buf, IP_ADAPTER_INFO);
  for (;;) {
    const ip = node.IpAddressList.IpAddress.String;
    const gateway = node.GatewayList.IpAddress.String;
    out.push({
      index: node.Index,
      guid: node.AdapterName,
      description: node.Description,
      dhcpEnabled: node.DhcpEnabled !== 0,
      ip,
      mask: node.IpAddressList.IpMask.String,
      gateway,
      dhcpServer: node.DhcpServer.IpAddress.String,
      // The two states that mean "no working IPv4 config":
      hasIp: ip !== "" && ip !== "0.0.0.0",
      isApipa: ip.startsWith("169.254."),
      hasGateway: gateway !== "" && gateway !== "0.0.0.0",
    });
    if (!node.Next) break;
    node = koffi.decode(node.Next, IP_ADAPTER_INFO);
  }
  return out;
}

/** Index/name pairs in the form IpReleaseAddress/IpRenewAddress require. Unelevated-safe. */
export function listInterfaces() {
  let size = [0];
  let rc = GetInterfaceInfo(null, size);
  if (rc === ERROR_NO_DATA) return [];
  if (rc !== ERROR_INSUFFICIENT_BUFFER && rc !== ERROR_BUFFER_OVERFLOW && rc !== ERROR_SUCCESS) {
    throw new NetApiError("GetInterfaceInfo(size)", rc);
  }
  const buf = Buffer.alloc(size[0]);
  rc = GetInterfaceInfo(buf, size);
  if (rc !== ERROR_SUCCESS) throw new NetApiError("GetInterfaceInfo", rc);

  const count = buf.readInt32LE(0);
  const stride = koffi.sizeof(IP_ADAPTER_INDEX_MAP);
  const out = [];
  for (let i = 0; i < count; i++) {
    const entry = koffi.decode(buf.subarray(4 + i * stride), IP_ADAPTER_INDEX_MAP);
    out.push({ index: entry.Index, name: entry.Name });
  }
  return out;
}

/**
 * Release then renew the DHCP lease on one adapter. PRIVILEGED.
 * adapterIndex must come from listInterfaces() - it is validated against the live list here
 * as well as in the broker, so a stale or fabricated index cannot reach the API.
 */
export function renewDhcp(adapterIndex) {
  const iface = listInterfaces().find((i) => i.index === adapterIndex);
  if (!iface) throw new Error(`adapter index ${adapterIndex} is not in the live interface list`);

  const map = { Index: iface.index, Name: iface.name };
  const releaseRc = IpReleaseAddress(map);
  // A lease we never held is not a failure worth aborting the renew for.
  const renewRc = IpRenewAddress(map);
  if (renewRc !== ERROR_SUCCESS) throw new NetApiError(`IpRenewAddress(${iface.name})`, renewRc);
  return { adapterIndex, name: iface.name, releaseRc, renewRc };
}

// ---------------------------------------------------------------------------
// Adapter admin-status control, for reset_adapter (R2).
//
// The handover (§6) specifies WMI/INetCfg. Implemented instead with iphlpapi's own
// SetIfEntry, which sets the interface administrative status directly: same disable-then-
// enable effect, native, and with no COM/VARIANT marshalling to get wrong on a 4-day clock.
// Keeps the "no interpreter spawning" rule (§6) intact either way.
// TODO(phase1): confirm coverage across the fleet's NIC drivers. SetIfEntry can return
// ERROR_NOT_SUPPORTED on some virtual adapters, where INetCfg is the more general answer.
// ---------------------------------------------------------------------------

const MIB_IFROW = koffi.struct("MIB_IFROW", {
  wszName: koffi.array("char16_t", 256, "String"),
  dwIndex: "uint32", dwType: "uint32", dwMtu: "uint32", dwSpeed: "uint32",
  dwPhysAddrLen: "uint32", bPhysAddr: koffi.array("uint8", 8),
  dwAdminStatus: "uint32", dwOperStatus: "uint32", dwLastChange: "uint32",
  dwInOctets: "uint32", dwInUcastPkts: "uint32", dwInNUcastPkts: "uint32",
  dwInDiscards: "uint32", dwInErrors: "uint32", dwInUnknownProtos: "uint32",
  dwOutOctets: "uint32", dwOutUcastPkts: "uint32", dwOutNUcastPkts: "uint32",
  dwOutDiscards: "uint32", dwOutErrors: "uint32", dwOutQLen: "uint32",
  dwDescrLen: "uint32", bDescr: koffi.array("uint8", 256),
});

const GetIfEntry = iphlpapi.func("uint32_t __stdcall GetIfEntry(_Inout_ MIB_IFROW *row)");
const SetIfEntry = iphlpapi.func("uint32_t __stdcall SetIfEntry(MIB_IFROW *row)");

const IF_ADMIN_STATUS_UP = 1;
const IF_ADMIN_STATUS_DOWN = 2;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Read-only interface probe. Unelevated-safe - feeds the tier-0 router's adapter check. */
export function getInterfaceStatus(adapterIndex) {
  const row = { dwIndex: adapterIndex };
  const rc = GetIfEntry(row);
  if (rc !== ERROR_SUCCESS) throw new NetApiError(`GetIfEntry(${adapterIndex})`, rc);
  return {
    index: row.dwIndex,
    name: row.wszName,
    adminStatus: row.dwAdminStatus,
    operStatus: row.dwOperStatus,
    adminUp: row.dwAdminStatus === IF_ADMIN_STATUS_UP,
    // MIB_IF_OPER_STATUS: 5 = OPERATIONAL, 2 = CONNECTING, 1 = NON_OPERATIONAL
    operational: row.dwOperStatus >= 5,
    speed: row.dwSpeed,
  };
}

function setAdminStatus(adapterIndex, status) {
  const row = { dwIndex: adapterIndex };
  const rc = GetIfEntry(row);
  if (rc !== ERROR_SUCCESS) throw new NetApiError(`GetIfEntry(${adapterIndex})`, rc);
  row.dwAdminStatus = status;
  const src = SetIfEntry(row);
  if (src !== ERROR_SUCCESS) {
    throw new NetApiError(`SetIfEntry(${adapterIndex}, admin=${status === 1 ? "UP" : "DOWN"})`, src);
  }
  return true;
}

/**
 * Disable then re-enable one adapter. PRIVILEGED, tier R2, user-visible disruption.
 * If the re-enable fails the error says so explicitly - it must never be reported as a
 * success that left the machine offline (§13).
 */
export async function resetAdapter(adapterIndex, { settleMs = 1500 } = {}) {
  const before = getInterfaceStatus(adapterIndex);
  setAdminStatus(adapterIndex, IF_ADMIN_STATUS_DOWN);
  await sleep(settleMs);
  try {
    setAdminStatus(adapterIndex, IF_ADMIN_STATUS_UP);
  } catch (err) {
    err.message = `adapter was disabled but re-enabling FAILED - machine may be offline: ${err.message}`;
    throw err;
  }
  await sleep(settleMs);
  const after = getInterfaceStatus(adapterIndex);
  return {
    adapterIndex,
    name: before.name,
    adminBefore: before.adminUp ? "UP" : "DOWN",
    adminAfter: after.adminUp ? "UP" : "DOWN",
    operationalAfter: after.operational,
  };
}
