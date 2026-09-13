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
  // What THIS machine filed, from its own egress record (D235/D242) - and, since P4 (D288), what
  // the hub last said about each of those tickets, from the ticket watch's snapshot. Still read-only
  // from the renderer's side: the poll is main's, on its own timer.
  ticketsFiled: () => ipcRenderer.invoke("ticket:filed"),
  // An update from the desk on one of this machine's tickets, pushed when the watch finds one.
  // SHOWN, never spoken (D288). The renderer shows it and then acknowledges the entries it showed:
  // the hub stamps them "seen by the requester" with its own clock (D287). That is the only write
  // this channel can cause, and it writes a timestamp, not words.
  onTicketUpdate: (cb) => ipcRenderer.on("ticket:update", (_e, update) => cb(update)),
  ackTicketEntries: (entryIds) => ipcRenderer.invoke("ticket:ack", entryIds),
  getProfile: () => ipcRenderer.invoke("profile:get"),
  saveProfile: (patch) => ipcRenderer.invoke("profile:save", patch),

  // The restart recommendation's answer - "later" or a decline. It changes NOTHING on the machine:
  // there is no capability that restarts a computer, so this channel cannot cause one, and it
  // schedules nothing. All it decides is whether the assistant raises the subject again.
  answerRestart: (answer) => ipcRenderer.invoke("restart:answer", answer),

  onLog: (cb) => ipcRenderer.on("app:log", (_e, line) => cb(line)),
  onTtsReady: (cb) => ipcRenderer.on("tts:ready", (_e, status) => cb(status)),

  // Hub connectivity (D49/D51, D233). Read-only: the renderer shows the link's state, it does not
  // drive it. `hubStatus` is the same object `hub:link` pushes on every transition.
  hubStatus: () => ipcRenderer.invoke("hub:status"),
  onHubLink: (cb) => ipcRenderer.on("hub:link", (_e, status) => cb(status)),
});
