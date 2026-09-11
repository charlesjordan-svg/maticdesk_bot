// CommonJS on purpose: an ESM preload requires sandbox:false plus an .mjs extension.
// Nothing privileged is exposed here - the renderer gets a narrow, named channel list only.
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("matic", {
  speak: (text) => ipcRenderer.invoke("tts:speak", text),
  ttsStatus: () => ipcRenderer.invoke("tts:status"),

  // Broker surface. The renderer can propose, validate, ask the broker to render a consent card,
  // and hand back the nonce when the user approves - but it holds no capability implementation and
  // no Win32 handle of its own (handover §2), and since D130 it never sends a proposal at approval
  // time: `execute` takes the nonce and nothing else.
  listCapabilities: () => ipcRenderer.invoke("broker:listCapabilities"),
  diagnose: () => ipcRenderer.invoke("agent:diagnose"),
  propose: (text) => ipcRenderer.invoke("agent:propose", text),
  validate: (proposal) => ipcRenderer.invoke("broker:validate", proposal),
  prepareConsent: (proposal, locale) => ipcRenderer.invoke("broker:prepareConsent", proposal, { locale }),
  execute: (nonce) => ipcRenderer.invoke("broker:execute", nonce),

  // Ticket filing (B6-lite, D213). `fileTicket` is the ONE call in this bridge that sends the
  // user's own data off the machine, and it is named so that reading this list tells you so.
  // It is only ever reached from the review card, after the user has pressed submit on a card
  // showing exactly the draft being passed here.
  fileTicket: (draft) => ipcRenderer.invoke("ticket:file", draft),
  // Read-only, and local: what THIS machine filed, from its own egress record (D235/D242). It is
  // not a status lookup and there is no channel here that could become one.
  ticketsFiled: () => ipcRenderer.invoke("ticket:filed"),
  getProfile: () => ipcRenderer.invoke("profile:get"),
  saveProfile: (patch) => ipcRenderer.invoke("profile:save", patch),

  onLog: (cb) => ipcRenderer.on("app:log", (_e, line) => cb(line)),
  onTtsReady: (cb) => ipcRenderer.on("tts:ready", (_e, status) => cb(status)),

  // Hub connectivity (D49/D51, D233). Read-only: the renderer shows the link's state, it does not
  // drive it. `hubStatus` is the same object `hub:link` pushes on every transition.
  hubStatus: () => ipcRenderer.invoke("hub:status"),
  onHubLink: (cb) => ipcRenderer.on("hub:link", (_e, status) => cb(status)),
});
