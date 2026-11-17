Matic Desk v2 — replacing the avatar with a Nuance Live persona

Date: 2026-11-16
Status: plan for review. Nothing built, nothing measured.
Written by: a Cowork session, from https://docs.nuancelabs.ai/ (read today) and the project docs dated September 2026.

Scope honesty. The Nuance findings in §1–§4 were read from the docs on 2026-11-16 and are cited in §10. The repo claims were unverified when this plan was first written and have since been checked against the working tree on wakanda — see §11, which corrects three things and confirms the rest. Anything still unverified is marked [VERIFY].

0. Your four answers, recorded
#	Question	Your call
1	Fixed personas — Hazel/Mattick can't come along	Accept it. Pick a stock persona.
2	Who is the brain	Compare both, especially credit cost. Can a local model be used?
3	Cloud-only, broken machines	Degrade rather than fail. Answered "text chat" on 2026-11-16, then superseded the same day: degrade to the existing v7 avatar + Piper. See §3.1 and the functional analysis §2.4
4	Where v2 lives	Inside the existing Electron client.

§4 answers question 2 in full, including the local-model part. The short version is at §4.5.

1. What Nuance Live actually is

Verified from the docs today. This is the part of the plan you can rely on.

A real-time video persona over WebRTC. Your server mints a session token (POST /session-tokens, API key nk_…), the client calls POST /conversation with it, waits for an admitted event carrying a livekit_url and a LiveKit token, and joins a LiveKit room. The persona is the only other participant. Its audio and video tracks are auto-subscribed; you attach the video to a <video> element.
Control is a JSON event stream on the room's nuance_live data topic — transcripts both ways, turn boundaries, hand-offs, and commands you send back (response.create, session.output_audio.interrupt, session.floor.hold, session.close).
@nuancelabs/js-sdk wraps the room join and session lifecycle for web pages; any LiveKit SDK also works.
The persona never opens the conversation. You send response.create with instructions to make it speak first. That is your greeting hook.
green_screen: true on POST /conversation renders the persona over solid 
#00FF00 so you can key it out and composite it over your own background. This is the single most important finding in this document — see §2.1.
Preview API. The docs say routes and events may change.
1.1 The hard constraints
Constraint	Detail	Source
Personas	sam, sonia, mira only. Sets face and voice. Any other id → 400	/personas
Naming	Persona has no name until your system_prompt gives it one	/personality
system_prompt	1–64,000 chars, shares a limit with the platform's own instructions	OpenAPI
expressiveness	0–2, default 1	OpenAPI
Language	English only. Non-English prompts/tools rejected	/safety
Warm-up	Up to ~30 s preparing before the persona starts. Not billed	/how-it-works
Capacity	No queue. Starts within seconds or is refused 429 capacity_unavailable with retry_after_seconds; 503 busy; 409 concurrency_limit; 429 start_limit	/how-it-works
Billing	Whole credits, wall-clock from persona start to end, silence included. Round up. Daily credits, no carry-over	/how-it-works
Credit → time	Plan-specific. The docs state no number. Read limits from GET /usage	/limits-and-errors
Tools (responses only)	16 run, 128 listed, 60 s backend time per task, 8 tool-calling steps	/limits-and-errors
Review	Prompt + tools reviewed on first mint; org-wide daily cap on new setups; past it → app_review_held, up to ~a day	/safety
Video failure	output_not_ready if the persona's video doesn't start in 5 s — session ends	/limits-and-errors
1.2 The AUP constraints that bite a service desk specifically

From /safety. These are not generic boilerplate — three of them land directly on L1 work:

The persona will not collect codes, passwords, ID numbers, or card/bank details. A large share of real L1 traffic is credential resets and MFA enrolment. Matic cannot read a user a one-time code or take one from them in the live channel. This needs a designed hand-off path, not a workaround. It is arguably the right security posture — but it must be deliberate.
The persona will not name the AI model or company it runs on. Your prompt cannot say "powered by Claude." Asking it to breaks with instructions_refused.
Never hide or crop the AI label. Whatever the deployment renders to mark the persona as AI has to survive your compositing. If you green-screen and redraw, confirm you are not cropping it. [VERIFY] — ask Nuance what the label is and where it sits, because this directly constrains §2.1.

Also: no medical/legal/financial advice, no politics, no gambling or crypto, no religious guidance. None of those should ever come up in a helpdesk session; they cost nothing to accept.

1.3 Policy curfew — the multi-tenant trap

Repeated policy-violation endings trigger a curfew. With end_user_id it applies to that person. Without it, it applies to every conversation your organization starts without one. One abusive end user at one customer site could, absent end_user_id, refuse conversations for your entire fleet.

Therefore: end_user_id is mandatory from day one, not a nice-to-have. Pattern ^[A-Za-z0-9_.:\-]{1,128}$, so hash the identity — D215's profile.js identity is the obvious input. [VERIFY] — that D215 is still the identity source in the current tree.

2. Impact analysis — what this forces, what it forecloses
2.1 It forces a compositing decision, and green_screen makes the good one possible

Matic Desk's whole premise, from the build-plan prompt, is an agent that "lives in the Windows taskbar as an animated, speaking avatar." A <video> element showing a rectangular talking head in a chat window is a different product — that is a Teams call, not a desk-mate.

green_screen: true is what keeps the premise alive. The path is: transparent/frameless Electron window → <video> into a <canvas> → chroma-key the 
#00FF00 in a WebGL shader or createImageBitmap loop → draw the keyed persona over nothing. You get a floating, borderless persona on the desktop.

Three warnings, all of them real:

"Available only where your deployment offers it." You may not have it. Check before planning around it. This is open question Q1 and it is the highest-priority unknown in this document.
"Some personas can't be drawn over green, and a conversation requesting it on one of those is refused." So persona choice and green-screen are coupled. Test all three.
Chroma-keying compressed WebRTC video produces green fringing on hair and shoulder edges. It is solvable (despill + edge erosion) but it is real per-frame GPU work in the renderer, against a product with a <300 MB idle RSS design target. [VERIFY] — measure, don't assume.

If green-screen is unavailable: v2 is a windowed persona, and you should say so plainly rather than shipping a worse version of the desk-mate idea.

2.2 It forecloses, in the live channel
Hazel. You accepted this. Record it as a decision that supersedes the voice lock in 2026-09-11-greeting-set-and-voice-spec.md §3 for the live channel only.
The six greeting MP3s and the .timeline.json forced-alignment work that spec proposed. The greeting becomes a response.create instruction and the persona says it in its own words — which also means the greeting is no longer word-for-word deterministic. Your persona.test.mjs rules, whatever they currently assert, cannot assert on live-channel greeting text any more.
TTSVisemeDriver and the phoneme-alignment lip-sync. Nuance ships pixels, not visemes.
Piper, in the live channel. Not retired — reassigned. It becomes the voice of the degraded channel (§3.1). TTSVisemeDriver and the v7 bust go with it, because Piper still produces phoneme alignment and the avatar is still there to drive. Decided 2026-11-16.
2.3 It forces a server you don't currently have

The API key must never reach the client. The Electron renderer — and the main process, which ships to the customer's machine — cannot hold nk_…. You need a token-minting endpoint:

client → POST /v2/nuance/session-token  (authenticated as this endpoint's identity)
         ↓ hub server holds nk_…, applies prompt + interface_setup, sets end_user_id
         ← st_… (60-second fuse)

The hub already exists (the handovers reference a hub link and server test suites), so this is a new route, not a new service. [VERIFY] — that the hub is the right home and that endpoints already authenticate to it in a way you'd trust to gate credit spend.

This is also your only cost control point. Every credit Matic spends is spent by a token this route minted. Rate-limiting, per-tenant caps, and refusing to mint for abusive endpoints all live here and nowhere else.

2.4 It forces echo cancellation and a user gesture

/connect is explicit: mic echo cancellation must be on or the persona hears itself and answers its own voice. Browser getUserMedia enables it; Electron's renderer is Chromium so this should hold, but it must be verified on a real machine with speakers, not headphones. And audio needs a user gesture — trivial in a chat window, less trivial for a tray-resident agent that wants to speak proactively. Which collides with the tray work directly: see §3.3.

3. Conflict pass
3.1 Cloud video vs. "the user's machine is broken"

Unresolvable, so the question is only how the product degrades — and it must degrade honestly, because the failure modes are not rare:

Decided 2026-11-16: the fallback is the existing v7 avatar driven by Piper, not text chat. Charles's first answer was text; the functional analysis §2.4 changed it, and he accepted. The reason is in persona.json's own comment, written months before Nuance was on the table: "the offline greeting is the one that matters most, and a runtime cloud TTS is the one thing that could never produce it at the moment it is needed." Three of four capabilities are network faults, so the offline branch is the product's best moment — and bootState.offline is the one greeting that offers to act, which no band does. Falling silent there, or dropping to a text box, throws that away.

Failure	Behaviour
No network	Persona unreachable. v7 avatar + Piper, bootState.offline, local capabilities offered.
429 capacity_unavailable	Persona refused through no fault of the user's machine. v7 avatar + Piper, neutral boot set.
409 concurrency_limit	Your own fleet competing with itself. v7 avatar + Piper.
output_not_ready (5 s)	Session ends mid-attempt. v7 avatar + Piper.
Machine reclaimed	Session ends with reason: "error" mid-conversation. v7 avatar + Piper, history intact.

The last one is the ugly one: it can land in the middle of a working session, and the docs say to let the person start again — which costs another ~30 s warm-up. The degraded channel must therefore be a first-class mode the session can fall into, carrying conversation state, not just a mode it starts in. If it is a different brain with a different history, a mid-session drop loses the user's problem and they have to re-explain it. That is the moment this product gets uninstalled.

The cost of this decision, stated honestly: two voices and two faces, permanently, and a user who may notice the switch mid-session. The alternative was the product falling silent exactly where it is most useful. Worth it — but the switch needs to be designed, not merely allowed to happen, and whether a user finds it jarring is unmeasured. Watch for it in the Phase 3 click-through.

This is the strongest architectural argument in this document for delegation: client. See §4.

3.2 Per-minute billing vs. the shape of L1 work

Credits bill wall-clock including silence. Helpdesk sessions are mostly silence: reboots, downloads, "try it now," waiting for a profile to rebuild. A 25-minute ticket might be 4 minutes of talking.

Options, none free:

max_session_seconds to cap the blast radius of a forgotten window.
session.close before a long wait and re-mint after — costs another ~30 s warm-up, and refused starts still count against the hourly start limit, so an aggressive close/reopen policy can rate-limit you out of your own product.
Let it run and pay.

You cannot size this until you know the credit→time mapping, which the docs do not state. That's Q2. Until then any cost-per-ticket number for v2 is a fabrication — including any I might be tempted to produce.

3.3 Proactive speech vs. browser audio gesture vs. the tray work

D292 (background presence) built the agent to keep running minimised, specifically so a desk reply can reach a user whose window is closed. A Nuance session needs a user gesture to play audio and burns credits while open. A tray-resident agent cannot hold a live persona session open waiting for something to happen — that is paying per minute for silence, all day, per seat.

So: the tray/background channel stays text + notification. The persona is summoned. A desk reply arriving while minimised raises a notification; clicking it is the user gesture that starts the persona. That is coherent, it preserves D292's work, and it should be written down as a decision rather than discovered during implementation.

3.4 Review-on-first-mint vs. shipping software

If you use delegation: responses, your tool schemas go through Nuance's AUP review the first time a token is minted with them, with an org-wide daily cap on new setups and up to about a day's delay past it. Every tool-schema change — in a product whose tools are its reason to exist — is then a release gated on a third party's review queue. Prompt changes too, if per-tenant prompts differ.

With delegation: client the prompt is still reviewed; the tools are not, because Nuance never sees them.

4. The brain question — responses vs client
4.1 What each actually means
	delegation: "responses"	delegation: "client" (default)
Who reasons	Nuance's backend reasoner, configured in the token (model, instructions, tools)	Your code. Matic's existing router + whatever LLM you point it at
Who runs tools	Your page, called by their reasoner via response.event / function_call	Your code, on your own terms
Tool cap	16 run, 128 listed, 8 steps, 60 s backend time	None imposed by Nuance
Tool review	Yes, at mint	No — Nuance never sees them
Tool changes mid-session	Can only remove or restore; never add	n/a
Persona's role	Face, voice, and conversational front-end	Face and voice; you drive it with response.create / session.thinking.append
Local model	No (§4.4)	Yes (§4.4)
4.2 Credit cost: identical. This is the answer to your question.

Delegation type does not change what Nuance charges you. Billing is documented as time from persona start to end, rounded up to a whole credit. There is no per-token, per-tool-call, or per-delegation line item anywhere in the docs. /how-it-works explicitly does not separate idle from active time.

What differs is who pays for the reasoning:

	responses	client
Nuance credits	Session wall-clock	Session wall-clock — same
LLM tokens	Bundled into Nuance's side, price not documented	Your Anthropic bill (or $0 if local) — you can see it

So the real cost difference is: with responses you have one opaque bill and no visibility into reasoning spend; with client you have two bills you can both read, and the reasoning half is one you already have instrumented.

[VERIFY] — the docs do not say whether responses draws extra credits. /how-it-works declines to answer and points at support. Ask them (Q3). If the answer is "yes, extra," the comparison gets even more one-sided.

4.3 Latency is the counter-argument for responses

With client, every turn is: Nuance transcribes → event to your renderer → your main process calls your LLM → tool calls → result → response.create back to Nuance → persona speaks. That round trip crosses the WebRTC data channel twice and your LLM once. With responses the reasoner sits next to the persona.

Neither number is known. Nobody has measured either. Do not let anyone put a latency figure in a deck until the §6 spike produces one. This is the single thing that could overturn the §4.5 recommendation, and it is cheap to measure.

4.4 Local models — the honest answer

Only with delegation: client (or none).

The responses backend runs on Nuance's infrastructure. /setup documents model as "required, any non-empty name," example "default". The OpenAPI spec contains no model field at all — delegation is an untyped object — so there is no schema evidence of a URL, endpoint, or provider field, and nothing anywhere suggesting it can point at a customer-hosted model. [VERIFY] — confirm with Nuance (Q4), but plan for "no."
With client, Nuance never sees your reasoning at all. It is a face, a voice, an ear, and a transcript. The brain is whatever you already run. Ollama on the endpoint, the PAIR/llama.cpp work from the September lab tests, a hosted Anthropic call, or the hybrid tier the build plan envisaged — all of it keeps working, unchanged, with a video persona bolted on the front.

This is decisive given your existing direction. The whole local-inference thread — the cost-reduction motive in /topics/local-ai-infrastructure.md, the NVIDIA PAIR lab work, the "configurable OpenAI-compatible endpoint" bet in the PAIR assessment §7.5 — is foreclosed by responses and preserved intact by client.

4.5 Recommendation: delegation: client

Five reasons, in order of weight:

It is the only option that keeps local models on the table (§4.4) — and that was an explicit strategic bet, not a passing preference.
It is the only option where the degraded channel shares a brain with the live one (§3.1). Same router, same history, same tools; the persona is a presentation layer you lose, not an intelligence you lose. With responses, a mid-session drop drops the reasoning too — and since Decision C makes the fallback a speaking avatar rather than a text box, it would be a face with nothing behind it.
No 16-tool ceiling. The build-plan prompt already named "token efficiency vs. MCP breadth" as a load-bearing tension. responses resolves it by force, at 16.
No tool review in your release path (§3.4).
Your decision register stays meaningful. D-numbered decisions about routing, escalation, auto-close and ticket lifecycle describe logic that responses would largely replace.

The cost of being wrong: if turn latency with client is bad enough to break the illusion of a live person, this recommendation is wrong and responses wins on feel. That is exactly what the spike measures. Being wrong is recoverable — delegation is a token field, and the persona-side integration is identical either way.

5. Component architecture for v2
Hub server (holds nk_…)
  └─ POST /v2/nuance/session-token
       · prompt assembly (base persona + tenant facts)
       · interface_setup: { delegation: {type:"client"}, video:{input:{camera:false}},
                            runtime_tools:{ end_call:true } }
       · end_user_id: hash(D215 identity)
       · per-tenant mint caps + audit log          ← your only cost control
              │ st_…  (60 s fuse)
              ▼
Electron main process
  ├─ existing router / LLM / MCP endpoint tools    ← UNCHANGED. still the brain.
  ├─ nuance-session.js  (new)  — POST /conversation, event-route follow, lifecycle
  ├─ tray + ticket poll (D292)                     ← stays text-only (§3.3)
  └─ Piper / tts-service.js                        ← DEGRADED channel's voice (Decision C)
              │ IPC
              ▼
Electron renderer
  ├─ livekit-client / @nuancelabs/js-sdk — room join, mic publish
  ├─ nuance_live data-topic event bus → IPC → router
  ├─ <video> → canvas chroma-key → composited persona   (if green_screen available)
  └─ v7 avatar + TTSVisemeDriver                    ← KEPT: degraded channel's face (Decision C)

video.input.camera: false is deliberate. Matic has no use for the user's webcam, and turning it off removes an entire privacy conversation from every enterprise security review. It also disables the camera-based age backstop, which is irrelevant here.

end_call: true is deliberate too — it lets the persona close cleanly after a goodbye, which stops the credit clock. stay_quiet stays on (default) for the "wait while I reboot" case.

6. Phased plan

Effort is given as uncertainty ranges, and they are estimates, not measurements.

Phase 0 — Answer the unknowns before writing code (1–3 days, mostly waiting)

Get Q1–Q5 (§8) answered by Nuance support and by GET /usage.
Exit: green-screen availability known; credit→time known; responses billing known.
Contingency: if support is slow, start Phase 1 anyway — it doesn't depend on the answers.
Rollback: n/a.

Phase 1 — Throwaway web spike, outside the client (3–7 days)

Plain page, @nuancelabs/js-sdk, a scratch token-minting script. One fake tool (get_disk_space returning a constant). Measure: time-to-first-word, turn latency under client delegation, green-screen fringing, and credits consumed by a 10-minute mostly-silent session.
Exit (falsifiable): a persona speaks a Matic greeting, answers a question that required the fake tool, and the four numbers above are written down. Charles has looked at all three personas with green-screen on.
Contingency: if client-delegation turn latency is unacceptable, re-run the same spike with responses before deciding anything.
Rollback: delete the directory. Nothing shipped.

Phase 2 — Token-minting route on the hub (3–5 days)

POST /v2/nuance/session-token with prompt assembly, end_user_id hashing, per-tenant caps, audit log. Key in the server's existing secret store — not in a repo, not in an env file that ships.
Exit: route mints a token that the Phase-1 page successfully starts a conversation with; a tenant over its cap is refused and the refusal is logged; nk_… appears in no client artifact.
Contingency: none needed; this is ordinary server work.
Rollback: feature-flag the route off. No client depends on it yet.

Phase 3 — Persona mode in the Electron client, windowed (1–3 weeks)

nuance-session.js, renderer LiveKit join, event bus wired to the existing router, response.create driving speech from router output, mic echo-cancellation verified on speakers. Rectangular <video> — no compositing yet.
Exit: a real ticket is worked end-to-end through the persona, using at least one real endpoint tool, in the shipping client behind a flag. Mid-session session.closed falls back to the v7 avatar driven by Piper with history intact (§3.1) and a test proves it; the offline branch reaches bootState.offline and offers to act. The surface split and the pre-emptive close before network-dropping capabilities are built (functional analysis §2.1, §2.2). Client suite green at 2181 assertions and rising.
Contingency: if the renderer can't hold a LiveKit room inside Electron's security posture, this is where you find out — budget a week for CSP/permissions work.
Rollback: flag off; v1 avatar path untouched and still default.

Phase 4 — Compositing (1–2 weeks, only if Q1 says yes)

Transparent frameless window, chroma-key shader, despill, AI-label preservation (§1.2.3).
Exit: persona floats over the desktop with no green fringe visible at 1× on Charles's screen; idle and active RSS/GPU measured against the design target; the AI label is intact and visible.
Contingency: if fringing or cost is unacceptable, ship Phase 3's windowed persona and say so.
Rollback: flag back to windowed.

Phase 5 — Decide v1's fate DECIDED 2026-11-16

The v7 avatar and Piper are kept, as the degraded channel's face and voice (§3.1). This is no longer an open question and no longer a phase. What remains is a smaller question for after Phase 4: whether the two faces should resemble each other at all, or whether the switch should be obvious on purpose. Charles's call, with something to look at.

Total: roughly 5–10 weeks of one engineer, wide error bars, assuming Q1–Q5 come back favourably. This is an estimate. Nobody has built against this API.

7. Kill criteria — decide these now, not later

Stop or pivot if:

Turn latency under client is bad enough that the persona feels broken, and responses latency is acceptable → the §4.5 recommendation is wrong; re-plan around responses and accept losing local models.
Both delegation modes feel broken → Nuance Live is not ready for this product. Stop. Note that stopping is now cheap: the v7 avatar and Piper are kept either way, so a halt leaves a working product rather than a hole.
Credit cost per realistic ticket exceeds what an L1 seat can bear. Set that threshold before Phase 1 produces the number, or you will rationalise whatever it turns out to be.
Green-screen is unavailable AND a windowed persona doesn't excite you → the desk-mate premise is what v2 was for. Stop rather than ship a Teams window.
Capacity refusals in testing exceed a few percent → a service desk that is sometimes not there is worse than one that never pretended to be.
The preview API breaks you once during the build → that's information, not a kill. Twice is a kill, because you cannot ship enterprise software on a surface that moves under you.
8. Open questions
For Nuance support (support@nuancelabs.ai) — ask all five in one email
Q1. Is green_screen available on our deployment, and which of sam, sonia, mira support it? (Blocks §2.1 and Phase 4 — highest priority.)
Q2. What is our credit→time mapping, daily credit allowance, concurrency limit, and hourly start limit? (Partly answerable from GET /usage — try that first.)
Q3. Does delegation: responses consume credits or charges beyond conversation wall-clock time?
Q4. Can the responses backend be pointed at a customer-hosted or third-party model endpoint? (Expecting "no" — asking so the answer is on record.)
Q5. What is the AI-disclosure label, where does it render, and what are our obligations when compositing the persona over our own background?

Worth adding, though not blocking: a roadmap question on custom personas or voice — your answer to question 1 accepts the stock personas for v2, but it is worth knowing whether a Matic-branded face is ever possible.

For you
Q6. Which persona — sam, sonia, or mira? Look at all three in Phase 1 before choosing. Note the gender signal: Hazel was a female voice; sonia and mira read female by name, but nothing in the docs describes any persona's appearance or voice, so this must be decided by looking, not by reading.
Q7. Does "Mattick" survive as the name? It's a respelling invented to fix an ElevenLabs pronunciation bug that no longer applies. [VERIFY] — whether Nuance's TTS says "Matic" correctly; test in Phase 1.
Q8. What is the acceptable credit cost per ticket? (Kill criterion 3 — set it before you see the number.)
Q9. How does Matic handle password and MFA-code moments now that the persona refuses to touch them (§1.2.1)? This likely needs a designed hand-off to the console or to a human, and it is product work, not integration work.
9. What I'd do first, if it were one thing

Email Nuance with Q1–Q5 today, then build the Phase 1 spike while you wait. The spike costs a few days, is pure throwaway, and produces the four numbers that every other decision in this document depends on. Everything above Phase 1 is reasoning from documentation; everything after it is reasoning from measurement.

10. Verification register
Claim	How known
Nuance Live session flow, LiveKit transport, event topic, auto-subscribed audio+video	Read 2026-11-16 — /connect, /
Personas limited to sam, sonia, mira; set face and voice; named only via prompt	Read 2026-11-16 — /personas, /personality
green_screen boolean on POST /conversation, 
#00FF00, deployment-dependent, unsupported on some personas	Read 2026-11-16 — OpenAPI CreateConversationRequest
interface_setup takes only delegation, video, runtime_tools; video.input.camera; runtime_tools defaults	Read 2026-11-16 — /setup, OpenAPI
Delegation types and responses object shape (model, instructions, tools)	Read 2026-11-16 — /setup, /delegation. Note: /setup documents model; the OpenAPI spec does not define it at all — the two disagree
16 tools run / 128 listed / 8 steps / 60 s backend time; size limits	Read 2026-11-16 — /limits-and-errors
Billing = wall-clock, start to end, rounded up, silence included; preparing not billed	Read 2026-11-16 — /how-it-works
Credit→time mapping, daily credits, concurrency, hourly start limits	Not known. Docs state no numbers. Plan-specific. Q2
Whether responses costs extra	Not known. /how-it-works declines and points at support. Q3
Whether responses can use a customer-hosted model	Not known. No schema evidence either way; "no" is my inference, not a finding. Q4
AUP restrictions incl. no passwords/codes, no model/company naming, AI label	Read 2026-11-16 — /safety
Policy curfew scope with vs. without end_user_id	Read 2026-11-16 — /safety
~30 s warm-up; output_not_ready 5 s video timeout ends session	Read 2026-11-16 — /how-it-works, /limits-and-errors
Echo cancellation requirement; user gesture for audio	Read 2026-11-16 — /connect
Client deps (2), Electron 44, contextIsolation/nodeIntegration, no CSP, BrowserWindow 1180×800, tray/presence/autostart, hub enrollment auth + hand-rolled routing + pg-only deps, both OpenAI-compatible provider layers, 2181/27 client assertions, register at D296	Read 2026-11-16 from the working tree — §11
TTSVisemeDriver internals, Piper worker behaviour, D215 profile.js as the end_user_id source, persona.json greeting rules in detail	Not read in detail. Files located, contents not fully reviewed. [VERIFY]
Turn latency, either delegation mode	Unmeasured. No figure offered anywhere above
Cost per ticket	Unmeasured and unmeasurable until Q2 is answered
Effort estimates in §6	Estimates, not measurements. Nobody has built against this API
Chroma-key fringing and GPU cost in Electron	Judgement, not a finding. Measure in Phase 4
11. Repo verification pass — 2026-11-16

Read today from C:\Users\Charles\Downloads\maticdesk_bot on wakanda. This replaces the "not read this session" caveat the plan shipped with. Three corrections and four confirmations that change the plan.

11.1 Corrections

C1 — client/package.json has exactly two runtime dependencies: @anthropic-ai/sdk and koffi. Electron ^44.1.1 is the only devDependency. This repo is aggressively dependency-minimal and that is clearly deliberate.

This makes the LiveKit SDK the single biggest thing v2 adds to the endpoint, and §6 Phase 3 under-weighted it. livekit-client plus @nuancelabs/js-sdk is a WebRTC stack — a large transitive tree, into a signed Windows binary, in a product where code-signing is already a recorded blocker. Budget for it, raise it with whoever reviews the signing chain, and expect it in the first customer security review.

C2 — contextIsolation: true, nodeIntegration: false, preload bridge (main.js ~line 268). The renderer cannot require anything. LiveKit must be vendored as a bundled ESM build under src/renderer/vendor/, which is a pattern the repo already uses — so this is routine, but it means a build step, not an npm install.

There is no CSP meta tag in index.html. So nothing blocks the WSS/WebRTC origins — and that is itself the finding. Adding the first outbound real-time media connection to a renderer with no CSP, in an app whose D130 forbids innerHTML precisely to keep the renderer trustworthy, is a security-review item that should be raised deliberately rather than discovered.

C3 — the persona needs its own window. The existing BrowserWindow is 1180×800, titled "Matic Desk", show: false until painted, and it is the panel — Claude Design's delivery, with its own CSS pipeline and test gates. Phase 4's transparent frameless compositing window is therefore a second window, not a property change on this one. That is better news than the alternative (it touches none of the Design delivery) but it is a different piece of work than §6 implied.

11.2 Confirmations that strengthen the plan

V1 — §2.3's token-minting route has its auth already built. P3b (D271, D282–D285) shipped device enrollment: one credential per device, minted once, hash stored, refused after revocation; server/src/index.js gates every /v1 route except enroll and health behind it; off loopback the hub refuses to start without TLS. So POST /v1/nuance/session-token is a new route behind existing auth, not new auth. The hub also has no web framework — pg is its only dependency and routing is hand-rolled req.url comparisons in index.js — so write it in that house style.

V2 — §4.4's local-model claim is stronger than stated. The pluggability isn't aspirational, it is built on both sides: client/src/agent/openai-compatible-client.js and cloud-client.js on the endpoint, server/src/providers/openai-compatible-provider.js on the hub, whose own header says the provider abstraction was there "from the first commit even though there is one provider." The hub has been run live against mistral-small:24b. delegation: client plugs a face onto a brain that is already model-agnostic and already demonstrated on a local model. delegation: responses throws that away.

V3 — §3.3's conclusion is not a proposal, it is an existing invariant. D293–D296 are built (main.js header, presence.js, settings.js, assets/tray/, scripts/build-tray-icons.mjs). Closing the window hides to the notification area; the hub link and ticket poll keep running; a desk update arriving with no visible window is HELD, the tray says needs you, and it is shown and only then acknowledged when the window is. Start with Windows is a tray checkbox, ON by default, and the OS wins a disagreement.

Critically: "nothing is spoken with no visible window" is a pinned invariant with a test. A Nuance session is speech. Therefore a persona session may not exist while the window is hidden — not as a cost argument (though §3.2 is one) but because it would break a tested guarantee. The summon-on-click design in §3.3 is the only one the current client permits. Write it as a decision.

V4 — current test counts: 2181 client assertions across 27 files, 750 headless / 674 db on the server, plus a 59-of-59 ticket-lifecycle click-through. The plan's §6 exit criteria said "client suite green" — hold it to 2181 and rising, and note that this codebase's convention is to write the test first and watch it fail. v2 should not be the place that convention lapses.

11.3 Two things this surfaced that the plan didn't ask about

The greeting rotation is more load-bearing than §2.2 implied. D262 replaced the greeting system after Charles reported "only one greeting ever played" — two bugs, one of them a per-process cursor that now persists across launches, with test/persona.test.mjs enforcing rules on persona.json. Handing the greeting to response.create doesn't just lose determinism; it retires a system that was debugged, tested and decided on. Worth an explicit D-number rather than a side effect.

D245 is a trap waiting for v2. The register records that four state-aware greeting sets were built, green, and then deleted after an Electron run because the rail, the standing band and the avatar all said one fact in three wordings. A Nuance persona that narrates what the panel already displays walks into exactly that. The persona's system prompt needs D245's rule written into it — say what the surfaces don't — and the Phase 3 click-through needs to look for it specifically.

11.4 Register and numbering

PROJECT_START_HERE.md (last updated 2026-09-13) stands at D296, with §5.61 the latest entry and no decision waiting on Charles. v2 should therefore open at D297 — confirm against the register's own header before taking numbers, since its next-free line has a recorded history of being wrong.

Two things in that file are still flagged as Charles's and are unrelated to v2 but unresolved as of its last update: the tray menu's Quit and toggle were not clickable by a session on this Windows 11 build, and the hub on 8787 was still running pre-D290 code with the bypass on.

12. Decision log for this plan
Date	Decision	By
2026-11-16	Accept the stock Nuance personas; Hazel and the six greeting MP3s retire from the live channel	Charles
2026-11-16	v2 lives inside the existing Electron client	Charles
2026-11-16	delegation: client — Matic stays the brain	Recommended §4.5; not yet ratified
2026-11-16	Degrade to the v7 avatar + Piper, not to text chat	Charles, superseding his own earlier answer
2026-11-16	Piper is reassigned, not retired; Phase 5 closes	Follows from the above

Everything else in §8 is still open.