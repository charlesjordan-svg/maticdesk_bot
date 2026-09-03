/**
 * STUB NamedPipeBroker - the privileged half, as a separate process on a real Windows named pipe.
 *
 * This is a TEST HARNESS, not Phase 1. It exists so the consent protocol can be exercised the way
 * Phase 1 will exercise it: the agent on the far side of a pipe, and the only thing the broker can
 * know about the agent is the bytes it sent. It demonstrated finding 1.1 of the 2026-09-02 design
 * review (B1-H3e / D130) on the one-call protocol, and since 2026-09-03 it speaks the two-step
 * protocol D130 replaced it with.
 *
 * What is real here:
 *   - a real named pipe (`\\.\pipe\...`, node:net), so the only thing the broker can know about
 *     the agent is the bytes it sent;
 *   - a separate process (forked by the test), so there is no shared memory to peek at;
 *   - the real InProcessBroker, real catalog, real schema/precondition/policy gates, real audit log;
 *   - the same `prepareConsent` / `execute(nonce)` handler shape as src/main/main.js.
 *
 * What is stubbed:
 *   - the machine: an injected probe describes the box the test asks for (OFFLINE by default, one
 *     adapter), and the test can change it mid-run (`__setProbe`) to model a machine that recovers
 *     between the card and the click;
 *   - the clock, so the 120 s consent window can be crossed without waiting (`__advanceClock`);
 *   - the executors named in `stubExecutors`, which record the call and return success instead of
 *     touching this machine. Nothing here disables an adapter or restarts a service.
 *
 * Protocol: JSON lines. Request `{id, method, params}`, reply `{id, result}` or `{id, error}`.
 * Methods mirror what src/main/preload.cjs exposes to the renderer: listCapabilities, validate,
 * prepareConsent, execute. `__`-prefixed methods are test introspection, not part of the contract.
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

let probeState = cfg.probeState;
let clockOffsetMs = 0;

const broker = new InProcessBroker({
  catalogPath: cfg.catalogPath,
  auditPath: cfg.auditPath,
  probe: () => probeState,
  clock: () => Date.now() + clockOffsetMs,
  executors: Object.fromEntries(cfg.stubExecutors.map((id) => [id, stub(id)])),
  onLog: (line) => process.send?.({ log: line }),
});

const handlers = {
  listCapabilities: async () => broker.listCapabilities(),
  validate: async ({ proposal }) => broker.validate(proposal),
  /**
   * Step 1, same shape as main.js's `broker:prepareConsent`. The broker validates, renders the text
   * itself and keeps the proposal. What goes back down the pipe is a nonce and the rendered text.
   */
  prepareConsent: async ({ proposal, locale }) => {
    try {
      const request = broker.prepareConsent(proposal, { locale: locale ?? "en" });
      process.send?.({ log: `[broker] consent request ${request.nonce} rendered for ${request.capabilityId}` });
      return { ok: true, request };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  },
  /**
   * Step 2, same shape as main.js's `broker:execute`. Takes the nonce and NOTHING ELSE. If the agent
   * sends a proposal alongside it - which is precisely the old attack - it is not read. There is no
   * parameter to read it into.
   */
  execute: async ({ nonce }) => broker.execute(nonce),

  /** Test-only introspection: what did the stub executors actually run? Not part of the contract. */
  __executed: async () => executed,
  __flush: async () => { await broker.audit.flush(); return true; },
  /** Test-only: the machine changes under the broker, as it can between a card and a click. */
  __setProbe: async ({ probeState: next }) => { probeState = next; return true; },
  /** Test-only: move the broker's clock forward, so a 120 s window can be crossed in 0 s. */
  __advanceClock: async ({ ms }) => { clockOffsetMs += Number(ms); return clockOffsetMs; },
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
