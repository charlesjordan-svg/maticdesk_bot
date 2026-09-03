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

  onLog: (cb) => ipcRenderer.on("app:log", (_e, line) => cb(line)),
  onTtsReady: (cb) => ipcRenderer.on("tts:ready", (_e, status) => cb(status)),
});
