/* A FAKE `window.matic`, for panel-check.html only. Never loaded by the app.
 *
 * Classic script, not a module, so it runs BEFORE the deferred module scripts that make up the
 * renderer - which is the whole trick: renderer.js reads `window.matic` at import time.
 *
 * EVERY VALUE BELOW IS CANNED AND SAYS SO. The machine is PLACEHOLDER-PC, the ticket references
 * are PLACEHOLDER-0000, and the consent text is the delivery's placeholder paragraph rather than
 * anything the broker would really render - because a check page carrying convincing-looking
 * output is a check page someone will eventually quote as evidence. What this exercises is the
 * PANEL's handling of each response shape (the shapes are copied from `Agent.propose`'s returns,
 * and `client/test/agent.test.mjs` is what keeps those honest), not the production of them.
 */
(function () {
  /* THE FAILURE SENTENCES ARE THE REAL ONES, not copies (D246). `window.matic`'s methods are all
     async, so this only has to resolve before one is CALLED - not before the renderer's modules
     load, which is what the classic-script trick above is actually for. A check page that carried
     its own copy of these lines would keep passing on the day the real ones changed. */
  const personaPromise = fetch("../../router/persona.json").then((r) => r.json());

  /* The next filing attempt fails this way, once, then goes back to succeeding. One-shot rather
     than a mode, because the failure path is something you drive THROUGH (offer -> yes -> card ->
     send) and a sticky toggle makes the next run confusing. */
  let nextFilingFails = null;
  /** Same one-shot trick for the three ways `execute()` can come back refused or failed (D247). */
  let nextFixFails = null;

  const FACTS = {
    computer: "PLACEHOLDER-PC",
    user: "placeholder.user",
    online: "yes",
    adapter: "Placeholder Gigabit Ether",
    ip: "10.0.0.42",
    gateway: "10.0.0.1",
    spooler: "STOPPED",
    audio: "RUNNING",
    dhcp: "RUNNING",
  };

  const FILED = [
    {
      reference: "PLACEHOLDER-0000",
      ticketId: "placeholder",
      filedAt: new Date(Date.now() - 26 * 3600_000).toISOString(),
      submittedAt: new Date(Date.now() - 26 * 3600_000).toISOString(),
      description: "Dock stopped driving the second screen",
      category: "hardware",
      suggestedOwner: "desktop_support",
      notified: false,
    },
  ];

  /** The offer is the one piece of state a fake bridge still has to keep: D216's intake does. */
  let offered = false;
  const hubListeners = [];
  let hub = {
    state: "reachable",
    basis: "GET /v1/health answered (canned)",
    authenticated: false,
    lastOkAt: new Date().toISOString(),
    consecutiveFailures: 0,
    lastError: null,
  };

  const say = (text) => ({ ok: true, facts: FACTS, reply: text });

  function propose(text) {
    const t = String(text).toLowerCase();

    if (offered && /^(y|yes|yep|sure|ok|please|go ahead)\b/.test(t)) {
      offered = false;
      return {
        ok: true,
        facts: FACTS,
        reply: "Before I send it, have a look at what's going — you can change anything in your own words.",
        // THE DRAFT IS THE SCENARIO THAT ASKED FOR IT. It used to be the dock, which is the ticket
        // in FILED - so the page offered a mailbox migration and then showed a card about a second
        // screen, and the one card in the app through which user data leaves the machine was
        // demonstrating a payload that did not match the conversation above it.
        ticketDraft: {
          machineName: FACTS.computer,
          description: "Asked for a mailbox to be moved to the new server.",
          category: "needs_human_judgement",
          suggestedOwner: "desktop_support",
          summary: "User asks for their mailbox to be migrated to the new server.",
          whatWasChecked: "Nothing on this machine is at fault; the request is about a mail server elsewhere.",
          reporter: { firstName: "Placeholder", lastName: "User", location: "Floor 2", contactId: "placeholder@example.com", osUsername: FACTS.user },
        },
      };
    }
    if (offered) { offered = false; }

    if (/capabilit|what can you (do|fix)/.test(t)) {
      return {
        ...say("Glad you asked. On this machine I can step in when a printer or another background Windows service has got stuck and needs a nudge; when websites or company servers won't load because this machine is remembering old addresses; when the network connection has dropped out or this machine has lost its address; and when the network adapter itself needs switching off and on again. I'll always show you exactly what I'm about to do and wait for you to approve it — nothing changes until you say so."),
        social: { subkind: "capability" },
      };
    }
    if (/print/.test(t)) {
      return {
        ok: true,
        facts: FACTS,
        reply: "That matches what I can see here — the service that queues your printing has stopped. Restarting it usually clears the queue and nothing else on the machine is affected.",
        proposal: {
          capabilityId: "restart_service",
          parameters: { serviceName: "spooler" },
          source: "tier0",
          reasoning: "The printing service reads as stopped on this machine, which matches what you described.",
        },
        validation: { ok: true, capability: { id: "restart_service", title: "Restart a Windows service", tier: "R1", rollback: "restart_service" } },
      };
    }
    // THIS CANNED ANSWER CARRIES MARKDOWN ON PURPOSE (D255). Every fixture on this page used to be
    // clean prose, which is exactly why the markers reached a real screen before anyone saw them:
    // the hub's answers are written by a model, models emit markdown, and no canned reply modelled
    // that. The firmware version is in backticks and one clause is bolded, so a person opening this
    // page sees what the renderer does with both. **If it ever shows a backtick or an asterisk, the
    // D255 path is broken** - and note the file name below, which must survive intact: a naive
    // underscore rule would eat it.
    if (/dock|screen|display/.test(t)) {
      return {
        ...say("Docks that drop a second screen are usually a firmware level thing rather than anything on this machine, and your company has written guidance for exactly this. It says the dock has to be on firmware `1.4` or later to drive two external displays, and that **the dock must stay connected while the update runs**. The log it writes is called `dock_update_log.txt` if you need to send it on."),
        answer: { answered: true, citedArticleIds: ["placeholder-docking-stations"], retrieval: { legs: "canned", fused: "canned" } },
      };
    }
    if (/ticket|filed|raised/.test(t)) {
      return {
        ...say("From this machine I've filed PLACEHOLDER-0000, yesterday, about the dock that stopped driving the second screen. I can't see how it's getting on yet — checking a ticket's progress with the service desk isn't something I can do in this build — so please quote the reference if you follow it up."),
        ticketStatus: { filed: FILED, canFile: true, canQueryHub: false },
      };
    }
    if (/mailbox|server|move/.test(t)) {
      offered = true;
      return {
        ...say("That one sits outside what I can do on this machine, and your company's guidance doesn't cover it either — so the honest answer is that this needs a person. I can pass it to IT with what I've already checked. Would you like me to?"),
        // `needs_human_judgement`, not "account": the reply says in words that this needs a person,
        // and "account" IS NOT IN `ESCALATION_CATEGORIES` at all - a fixture producing a value no
        // provider can produce proves the panel handles a shape nothing will ever send it. It is
        // also the longest member and the one that reached a user as itself (D244), so this is the
        // scenario worth having on the check page.
        escalation: { summary: "User asks for a mailbox migration.", category: "needs_human_judgement", suggestedOwner: "desktop_support" },
        canFile: true,
      };
    }
    return { ok: false, facts: FACTS, reply: "I could not work out a safe next step for that. Tell me a bit more about what you're seeing and I'll try again." };
  }

  window.matic = {
    speak: async () => ({ ok: false, error: "the check page has no voice - the mouth still moves" }),
    ttsStatus: async () => ({ ready: false, error: "no voice on the check page" }),
    listCapabilities: async () => [],
    diagnose: async () => FACTS,
    propose: async (text) => { await new Promise((r) => setTimeout(r, 220)); return propose(text); },
    validate: async () => ({ ok: true }),
    prepareConsent: async (proposal, locale) => ({
      ok: true,
      request: {
        nonce: "placeholder-nonce",
        locale,
        tier: "R1",
        expiresAt: Date.now() + 120_000,
        rendered: {
          title: "Your approval needed",
          what: "Matic Desk is requesting permission to restart the Print Spooler service on PLACEHOLDER-PC. This will stop and start the service that manages printing.",
          // THE SHAPE IS THE BROKER'S, not prose (D247). `rendered.detail` is
          // `capabilityId(param=value)` built from the validated parameters — see
          // `broker.d.ts` — and this fixture carried a paragraph instead, so the card on the check
          // page had never shown the field in the form the app actually renders. The prose fields
          // around it stay placeholder on purpose (see this file's header); a call signature is not
          // prose and cannot be mistaken for product copy.
          detail: "restart_service(serviceName=spooler)",
          rollbackNote: "It can be undone by restarting the service again.",
          notice: "Printing will pause for a few seconds.",
          undo: "Yes — restarting the service again puts it back.",
          why: "A stopped print queue is the most common cause of documents sitting unprinted.",
          risk: "Low. Nothing outside printing is touched.",
        },
      },
    }),
    // The failure shapes are InProcessBroker.execute's, field for field (D247): a plain sentence in
    // `message`, and the machine's own vocabulary in `detail`, where the inspector shows it. Until
    // 2026-09-10 `message` carried both, so the avatar said `OpenServiceW(spooler) failed (Win32
    // error 5)` out loud - and nobody had ever seen these three paths rendered, because the bridge
    // only ever returned success.
    execute: async () => {
      const mode = nextFixFails;
      nextFixFails = null;
      if (mode === "denied") {
        return {
          ok: false, needsBroker: true, capabilityId: "restart_service", auditId: "placeholder-audit",
          message: "I couldn't do that one from here.",
          detail: { code: 5, call: "OpenServiceW(spooler)", win32: "OpenServiceW(spooler) failed (Win32 error 5) (canned)" },
        };
      }
      if (mode === "failed") {
        return {
          ok: false, needsBroker: false, capabilityId: "restart_service", auditId: "placeholder-audit",
          message: "I tried that and it didn't work. Nothing on this machine was changed by it.",
          detail: { code: 1062, call: "StartServiceW(spooler)", win32: "StartServiceW(spooler) failed (Win32 error 1062) (canned)" },
        };
      }
      if (mode === "expired") {
        return {
          ok: false, needsBroker: false, capabilityId: "restart_service", auditId: "placeholder-audit",
          message: "That request timed out while it was waiting, so I've not changed anything. Ask me again and I'll put it back up.",
          detail: { consent: "this consent request has expired - nothing was executed (canned)" },
        };
      }
      return { ok: true, message: "Printing is running again. Try sending your document once more.", auditId: "placeholder-audit" };
    },
    fileTicket: async (draft) => {
      // The failure shapes are HubClient.fileTicket's, field for field: a user sentence in
      // `error`, the diagnostic in `detail`, and `filed` carrying the one distinction that matters
      // - `false` is "nothing was stored" and `null` is "we do not know" (D246, D213).
      const mode = nextFilingFails;
      nextFilingFails = null;
      if (mode) {
        const persona = await personaPromise;
        if (mode === "timeout") {
          return { ok: false, filed: null, error: persona.filing.timeout, detail: "POST http://127.0.0.1:8787/v1/ticket timed out after 30s; it may or may not have been stored (canned)" };
        }
        return { ok: false, filed: false, error: persona.filing.unreachable, detail: "POST http://127.0.0.1:8787/v1/ticket failed: fetch failed (canned)" };
      }
      FILED.unshift({ ...draft, reference: "PLACEHOLDER-0001", ticketId: "placeholder", filedAt: new Date().toISOString(), notified: false });
      return { ok: true, reference: "PLACEHOLDER-0001", ticketId: "placeholder", notified: false, notifiedWhy: "this build has no outbound notification" };
    },
    ticketsFiled: async () => ({ filed: FILED, canFile: true, canQueryHub: false }),
    getProfile: async () => ({ ok: false, error: "no profile store on the check page" }),
    saveProfile: async () => ({ ok: false, error: "no profile store on the check page" }),
    onLog: (cb) => { window.__maticCheck.log = cb; cb("[check] fake bridge installed - nothing here reaches a broker, a hub or a model"); },
    onTtsReady: (cb) => setTimeout(() => cb({ ready: false, error: "no voice on the check page" }), 50),
    hubStatus: async () => hub,
    onHubLink: (cb) => hubListeners.push(cb),
  };

  /** The check page's rail drives connectivity through this, not through the renderer. */
  window.__maticCheck = {
    hub(state) {
      hub = {
        ...hub,
        state,
        lastError: state === "unreachable" ? "connect ECONNREFUSED 127.0.0.1:8787 (canned)" : null,
        consecutiveFailures: state === "unreachable" ? 3 : 0,
        lastOkAt: state === "reachable" ? new Date().toISOString() : hub.lastOkAt,
      };
      for (const cb of hubListeners) cb(hub);
    },
    /** Arm the NEXT filing attempt to fail: "unreachable" (nothing stored) or "timeout" (unknown). */
    filing(mode) {
      nextFilingFails = mode === "none" ? null : mode;
    },
    /** Arm the NEXT approved fix to come back "failed", "denied" (needs the broker) or "expired". */
    fix(mode) {
      nextFixFails = mode === "none" ? null : mode;
    },
  };
})();
