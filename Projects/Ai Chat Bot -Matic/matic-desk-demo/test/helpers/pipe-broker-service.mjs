/**
 * STUB NamedPipeBroker - the privileged half, as a separate process on a real Windows named pipe.
 *
 * This is a TEST HARNESS, not Phase 1. It exists to demonstrate one finding from the 2026-09-02
 * design review (finding 1.1 / B1-H3e / D130): once the agent is on the far side of a pipe, the
 * broker acts on whatever proposal arrives and never sees what the user was shown.
 *
 * What is real here:
 *   - a real named pipe (`\\.\pipe\...`, node:net), so the only thing the broker can know about
 *     the agent is the bytes it sent;
 *   - a separate process (forked by the test), so there is no shared memory to peek at;
 *   - the real InProcessBroker, real catalog, real schema/precondition/policy gates, real audit log;
 *   - the same `consentAndExecute(proposal)` handler shape as src/main/main.js.
 *
 * What is stubbed:
 *   - the machine: an injected probe describes an OFFLINE box with one adapter, so reset_adapter's
 *     precondition (`machineOnline: false`) passes the way it would for a user whose network is down;
 *   - the executors for reset_adapter and flush_dns, which record the call and return success
 *     instead of touching this machine. Nothing here disables an adapter.
 *
 * Protocol: JSON lines. Request `{id, method, params}`, reply `{id, result}` or `{id, error}`.
 * Methods mirror what src/main/preload.cjs exposes to the renderer: listCapabilities, validate,
 * consentAndExecute.
 *
 * Started by test/consent-surface.test.mjs via child_process.fork(); config arrives as argv[2].
 */
import net from "node:net";
import { InProcessBroker } from "../../src/broker/in-process-broker.js";

const cfg = JSON.parse(process.argv[2]);

/** Executors that touch nothing. They record what they were asked to do, for the test to read. */
const executed = [];
const stub = (id) => async (params) => {
  executed.push({ id, params });
  return {
    message: `[STUB] ${id} would have run here with ${JSON.stringify(params)} - nothing was touched.`,
    detail: { stub: true, params },
  };
};

const broker = new InProcessBroker({
  catalogPath: cfg.catalogPath,
  auditPath: cfg.auditPath,
  probe: () => cfg.probeState,
  executors: Object.fromEntries(cfg.stubExecutors.map((id) => [id, stub(id)])),
  onLog: (line) => process.send?.({ log: line }),
});

const handlers = {
  listCapabilities: async () => broker.listCapabilities(),
  validate: async ({ proposal }) => broker.validate(proposal),
  /**
   * Verbatim shape of main.js's `broker:consentAndExecute` handler. The token is minted here, in
   * the privileged half, for THE PROPOSAL THAT ARRIVED. That is the whole finding: nothing on this
   * side knows what the renderer drew.
   */
  consentAndExecute: async ({ proposal }) => {
    try {
      const token = broker.mintConsentToken(proposal);
      process.send?.({ log: `[broker] consent token ${token.id} minted for ${proposal.capabilityId}` });
      const result = await broker.execute(proposal, token);
      return { ...result, consentTokenId: token.id };
    } catch (err) {
      return {
        ok: false,
        capabilityId: proposal?.capabilityId ?? "unknown",
        message: `Refused before doing anything: ${err.message}`,
        detail: {},
        needsBroker: false,
        rollbackWith: null,
        auditId: null,
      };
    }
  },
  /** Test-only introspection: what did the stub executors actually run? Not part of the contract. */
  __executed: async () => executed,
  __flush: async () => { await broker.audit.flush(); return true; },
};

const server = net.createServer((sock) => {
  let buf = "";
  sock.on("data", async (chunk) => {
    buf += chunk.toString("utf8");
    let nl;
    while ((nl = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, nl);
      buf = buf.slice(nl + 1);
      if (!line.trim()) continue;
      let msg;
      try { msg = JSON.parse(line); } catch (err) { sock.write(JSON.stringify({ id: null, error: `bad json: ${err.message}` }) + "\n"); continue; }
      const h = handlers[msg.method];
      if (!h) { sock.write(JSON.stringify({ id: msg.id, error: `unknown method ${msg.method}` }) + "\n"); continue; }
      try {
        const result = await h(msg.params ?? {});
        sock.write(JSON.stringify({ id: msg.id, result }) + "\n");
      } catch (err) {
        sock.write(JSON.stringify({ id: msg.id, error: err.message }) + "\n");
      }
    }
  });
});

server.listen(cfg.pipe, () => process.send?.({ ready: true, pipe: cfg.pipe }));
process.on("message", (m) => { if (m?.exit) { server.close(); process.exit(0); } });
