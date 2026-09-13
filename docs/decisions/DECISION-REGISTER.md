# Matic Desk — Decision Register

**Version:** 2.57 — the single register. **This file owns the numbering.** (2.57, 2026-09-12, last: **P5 BUILT — A RESOLVED TICKET CLOSES ON ITS OWN, BOUND TO THE RESOLUTION THAT STARTED THE CLOCK (D289, §5.59).** On Charles's *"do p5"*. `resolveTicket()` enqueues ONE `ticket.autoclose` job for resolved_at + the tenant's interval and writes the job's id and the instant on the ticket (tenant/010); the handler closes as `closed_by 'auto'` ONLY IF still resolved, still bound to ITS id, and due — all in the WHERE — and writes a public state change the requester's app shows as "closed on its own"; every way out of resolved clears the binding and withdraws the job. The interval is per tenant (control/009): DEFAULT 72 h, a PROPOSAL, 1–8760, NULL = off; the console's list panel under settings.write, the CLI through the same function. **D270's condition 2 DISCHARGED: the handler run twice on one job, the second run a no-op.** tenant/010 was rewritten before commit (uuid → bigint) by rolling a never-committed ledger row off the dev tenant — not a tenant/011, and §5.59c says why that was the line and not over it. PROPOSED. 733 headless / 661 db / 2041 client. 2.56, 2026-09-12, earlier: **P4 BUILT — THE REQUESTER ACTS, THE CONSOLE REPORTS DELIVERY, THE ENDPOINT POLLS AND SHOWS (D286–D288, §5.58).** On Charles's *"Start P4"*, with two answers: an update is SHOWN, not spoken; and *"go with option 1. leave notes about the next steps in your handover"* — build the hub, the console and the client's poll now, surface an update through the existing band, transcript and taskbar, and write the panel view and the toast as a Claude Design brief rather than approximate them. **D286:** a requester's comment is a TRANSITION (reopens a resolved ticket, starts D276's clock on a live one, refused on a closed one); confirm closes with the resolution kept; a follow-up to a closed ticket is a new ticket with `reopened_from` (tenant/009, a real FK). **D287:** the console reports delivery from the hub's two stamps — handed when the endpoint reads the timeline, seen when it acknowledges showing it — on every public row and in the CLI, and gains "Reply to requester", whose form says the requester sees it only while their app is open and polling, not email. **D288:** the endpoint polls its own tickets (60 s default, 30 s floor), shows one transcript line per unseen desk entry with the desk's words, acks what it showed, flashes the taskbar when not in front; the band's rows carry the hub's state and last write when the poll saw the hub and fall back to D242's words when not; one word-module for band and voice. **REVISES D242 (ratified) — the pins are rewritten and Charles has not ratified the revision (§5.58b).** Not watched in Electron. All PROPOSED. 695 headless / 625 db / 2038 client. 2.55, 2026-09-12, earlier: **P3b BUILT — THE ENROLLMENT CREDENTIAL, THE LAN LISTENER OVER TLS, TICKETS SCOPED TO THE ENROLLMENT, THE SECRET IN CONFIG.JSON (D271 DECIDED; D282–D285, §5.57).** On Charles's *"Start P3b"*, after he answered D271 — development on one machine, production on the customer's LAN/WAN — and chose config.json for the secret and to open the console to the LAN. **D282:** one credential per device, minted once on activation, hash stored, refused on the request after revocation, `last_seen_at`'s real writer; a per-OS-user enrollment of the software, said on every surface. **D283:** `MATIC_HUB_BIND` off loopback is TLS or the hub refuses to start; there every /v1 route but enroll and health requires the credential; on loopback it is optional but checked when presented; the console opens too (review owed). **D284:** `tickets.device_id`; the requester readers rekeyed to the enrollment; `GET /v1/tickets` behind the credential with an honesty field and a 60/min floor; the tenant from the credential. **D285:** the client enrolls at startup from config.json (empty in the repo, test-guarded), presents the credential on every request; the Agents page rewritten — D273 REVERTED, D274 INVERTED — after the detector fired by design. Run by hand both ways. All PROPOSED. 674 headless / 566 db / 1942 client. 2.54, 2026-09-12, earlier: **THE REQUESTER-SAFE READ SHAPE, BUILT BEFORE THE GATE IT DOES NOT DEPEND ON (D281, §5.56).** P3a of the ticket-lifecycle plan, from the handover that split P3: `getTicketForRequester()` and `listEntriesForRequester()` — eleven named columns on an allow-list with a reason per field, scoped to the requester's OS username in SQL, the public timeline with its visibility argument FIXED and the ownership check first; never `SELECT t.*`, never a spread. **The test was written FIRST and seen failing** (`756ad74`: 14 headless + 2 live failures on the missing export) — D269's ratified condition, discharged before any requester route exists. A column added to `tickets` and classified on neither list FAILS, proven by adding one and reverting. **No `deviceKeyId`**: tickets have no device column to match. **Called by nothing** — the route is P3b's and P3b waits on D271; §5f fails the day a caller appears first. PROPOSED. 607 headless / 517 db. 2.53, 2026-09-12, earlier: **RESOLUTION MEANS SOMETHING (D278–D280, §5.55).** P2 of the ticket-lifecycle plan on Charles's *"Start P2"*. **D278:** `resolved` takes a resolution CODE (six, a CHECK) and requester-visible NOTES, refused without both with a sentence — through ONE function, `resolveTicket()`, from the console's Resolve form and `bin/tickets.mjs resolve` alike; `setTicketState()` refuses the target so the CLI's correction cannot make a code-less resolved ticket; the database holds the rule too (`NOT VALID`); the notes are PUBLIC and **delivered to nobody in this build**, said on every surface. **D279:** `closed` is TERMINAL in the console and offered ONLY from `resolved`, so every ticket the console closes carries a code; the CLI stays the correction tool. **D280:** the transition guard is IN THE UPDATE — both forms carry the state the operator saw, the POSTs read nothing first, a stale form is a 409 naming where the ticket is now, **and a two-operator race was run: exactly one lands.** All PROPOSED. 592 headless / 498 db. 2.52, 2026-09-12, earlier: **THE CONSOLE STOPS IMPLYING A FLEET, AND THE TICKET TIMELINE EXISTS — WORK NOTES ONLY (D272–D277, §5.54).** Charles put the Agents page beside the running panel, read *"0 active devices"* against *"Everything I need is available"*, and concluded the product was broken; nothing was — no file under `client/src` calls `POST /v1/enroll`, so that counter reads 0 on every install until P3, and the page had never said so. **D272** puts the sentence above the fold; **D273** renames "Last seen" to *last enrollment activity* (written only on enroll/approve, never on a call) and makes Revoke say it blocks nothing — both written as conditions that REVERT WHEN P3 LANDS; **D274** renders the page in a test and pins the caveat to `client/src`'s behaviour, **proven to fail with the "revisit the copy" message** when pointed at a tree that does call the route. Then P1: **D275** — `ticket_entries` with visibility a property of the KIND (frozen map, two database CHECKs), `listEntries()` with NO default, `WRITABLE_KINDS` refusing a `comment` until P4 can deliver one, ONE composer ("Add work note", internal, audited without the words), state changes as public entries in the move's own transaction, the CLI printing the same rows labelled `[INTERNAL]`/`[public]`; **D276** — the AGE of the oldest unanswered requester comment on both ticket screens, reading "none" today and saying why; **D277** — retention decided in the migration: entries live with their ticket, D229's sweep refused for the record the desk itself wrote, the whole record's retention is OPEN-12. All six PROPOSED. 562 headless / 462 db. 2.51, 2026-09-12, earlier: **D269 AND D270 RATIFIED THE SAME DAY, WITH CONDITIONS IN THE ROWS, AND THE DEPLOYMENT-TOPOLOGY GATE IS D271 (§5.53g).** Charles: *"do the recommended."* D269 as built, on condition that P2/P3's requester-facing denylist test is written first and seen failing. D270 with three: in-process is FOR NOW; the first handler proves at-least-once by running twice before `ticket.autoclose` ships; **an unknown job type stays queued and reported, never failed** — §5.53c's reversal is now policy. **D271 is a GATE, not a task, and is OPEN:** same machine, the customer's LAN, or hosted — each with a different P3, and the first one means P3 should not be built at all. Blocks P3–P5; P1 and P2 do not wait on it. 2.50, 2026-09-12, earlier: **THE TICKET STORE'S SCHEMA STOPS LYING, AND THE JOB QUEUE GETS A RUNTIME (D269–D270, §5.53).** The ticket-lifecycle plan's review found a column with no writer and no reader, documented in two places as having both — tenant/004's `close_note` — and a job queue whose `runOne()` nothing had ever called. **The test was written first and watched fail on `closeNote`** (§5.53's commit 36edecf is red on purpose); then the note was wired through the console form, the detail page and the CLI, renamed `internal_resolution_note` behind a `pg_attribute` guard, and **every column of the ticket store now has code naming it or an entry on a reserved list the suite reads.** `control.job_queue` has an in-process runner started after listen, a reaper, a `cancelled` status, and its contract written down: **at-least-once, idempotency is the handler's job.** Three deviations from the handover, each recorded: **its D-numbers were all already taken** (§5.53a — every ID in plan v3 is void); **004's comment could not be rewritten** because the migration ledger checksums comments too (§5.53b — retracted in 005 instead, 004's checksum pinned); and **an unknown job type is left queued and reported, not failed** (§5.53c — a running dev hub would otherwise fail every job the test suite enqueues). **513 headless + 432 db assertions.** 2.49, 2026-09-12, earlier: **ACCOUNT RECOVERY IS A PRODUCT GATE, NOT A CLI (D268, §5.52).** The founder spent an hour getting into the loopback dev console with the system's author on the call: a password failure reported as "check the email, password and authenticator code", a dev mode that existed but was off because `npm start` never set it, a reset run twice from a different folder, and a browser refilling the old password. None of those steps is available to a customer. D268 records the failure chain, adds `npm run start:dev`, and makes a customer-operable recovery path a **pre-production gate** (OPEN-11). 2.48, 2026-09-12, earlier: **A DEVELOPMENT MODE THAT SKIPS THE AUTHENTICATOR CODE, FOUNDER-AUTHORISED AND BOUNDED (D267, §5.51).** `MATIC_ADMIN_INSECURE_NO_TOTP=1` lets the console take a password with no code, on a loopback listener only, and **never skips the password** — pinned by three behavioural assertions and a structural check on the two source offsets, with a mutation probe run against it. **Guard 2 was theatre as specified and is not any more:** it reads the socket’s real address instead of asserting the bind, and `MATIC_HUB_HOST` was rejected rather than added to make it demonstrable. Three finds by running it: the code input’s `required` attribute would have made the whole mode useless, the startup banner overflowed its box by seven characters, and a REPLAYED code signs in via the bypass. 424 headless + 281 db assertions. 2.47, 2026-09-12, earlier: **THE AUTHENTICATOR SECRET IS RECOVERABLE, AND OUR OWN DOCUMENTATION SAYING OTHERWISE IS WHAT CAUSED A THIRTY-MINUTE LOCKOUT (D266, §5.50).** `bin/admin.mjs` claimed the secret "cannot be shown again"; it is `bytea`, held as-is, because TOTP is a shared secret. `totp --user <email>` now prints the live code, and `reset` gains `--keep-totp` / `--keep-password` so fixing one credential stops destroying the other. **Three of the handover design document’s four premises did not survive the code** — `admin.mjs audit` already existed, `reset` already printed the "no longer works" warning, and the timeline’s `locked` row is not in the table — all recorded in §5.50b. **The dev TOTP bypass is NOT built:** its load-bearing guard ("refuse unless loopback-bound") can never fire, because the bind address is a hard-coded literal (§5.50c). 254 assertions in `admin-db.test.mjs`. 2.46, 2026-09-11, earlier: **THE PANEL CLICK-THROUGH WAS RE-RUN END TO END after the day's five decisions, and it is recorded in §10.3b** — 39 checks in the real Electron window over the DevTools Protocol, plus the seven branches only the check page can drive. Charles: *"run the click-through items you can."* **The ninth straight click-through found something, and this time it was in a TOOL rather than the panel:** `npm.cmd run show-consent` — the thing §4.3 tells you to compare the card against, field for field — **did not print `detailPlain`**, the field D248 had added hours earlier, so a wrong gloss could not have been caught by the procedure written to catch exactly that. **One item is recorded as COULD NOT OBSERVE rather than as a pass:** D253's intermediate *"Sending…"* head, because the check page's canned bridge resolves within a frame. The outcomes either side of it were seen. §10.3b. 2.45, 2026-09-11, earlier: **D242 is RATIFIED — the tickets band is permanent, and what it may not say is now PINNED.** Charles: *"do d242."* Built reversibly on 2026-09-10 and held for the founder; **no new ID, because nothing about the decision changed** (§5.43). **The escape is spent** — the trigger and markup would have come out of `index.html` on a no — so the tests owe more: five assertions became **twenty**. §5.43a: the invariants were re-checked on screen BEFORE the status moved, because the band has been through two design deliveries since it was built. §5.43b: **the pairing with the spoken answer is mechanical now and was not before** — D242 requires the note to state the limit in the same words `persona.tickets.some` speaks, and that was two independent regexes *either of which would have gone on passing while the other string was edited*. The shared clause is extracted from the persona file and matched character for character. §5.43c: **"no channel that could become a hub lookup" is a check rather than a sentence** — `canQueryHub` may appear in an inspector payload and may never appear in a condition, and the preload is scanned for a third ticket channel. §5.43d: the three note branches must stay three and none may imply a status (`in progress`, `assigned`, `resolved`…), because *"the user reads 'no news' where the truth is 'no lookup'"*. §5.43f: **five mutation probes, all five caught.** **1739 / 21 client assertions.** **With D248 built the same day, NO decision in this register is now waiting on Charles.** §5.43. 2.44, 2026-09-11, earlier: **D248 is BUILT — the consent card's exact call is GLOSSED, and the gloss is catalog text the broker assembles.** Charles: *"do d248."* Proposed 2026-09-10 and left open because it is a change to the rendered contract rather than a patch; **no new ID was taken, because nothing about the decision changed on ratification** (§5.42). `rendered.detailPlain` is new: *"Restart the Print Spooler service."* above `restart_service(serviceName=spooler)`. **It says the one thing nothing else on the card did** — `plain.what` describes the action and never names its target, so the exact call was the only field carrying WHICH, and it carried it as a registry key or a GUID. §5.42b: **the broker assembles it from catalog text** (`plain.call` + `plain.callParams` naming one of three resolvers), because a renderer authoring consent wording is what D130 forbids — which is the whole reason the line sat undrawn for a day. §5.42c: **every unknown falls back to the RAW VALUE**, never to an invention — naming the wrong adapter is the one outcome a gloss must never produce. §5.42d: **a capability with no parameters gets no gloss at all** (`flush_dns()` has nothing to point at, and a gloss would restate `plain.what` two lines below it — D245's defect), and null draws no element rather than an empty row. §5.42e: `detail` is byte-identical and still verbatim — **glossed, never hidden** (D244/D128). §5.42f: the pipe schema names the field and requires `null` to survive as `null`, and the test asserts it **over the wire** (D200/D201). **1724 / 21 client assertions.** §5.42. 2.43, 2026-09-11, earlier: **D258 — Claude Design's grouped band, integrated; severity keyed off our verdict.** Charles: *"integrate both stages together."* The brief of §5.40e was sent and **answered the same day**, and the delivery **cleared the buildability bar on the first try for the second time running** (524 classes, 36 inline styles, 47 KB of CSS, no link, no script, no remote URL, **zero token values changed, nothing renamed**) — `panel:build` accepted it and **all twenty test files stayed green with it in place before a line of app code moved.** §5.41b is the contract: severity comes from `data-state`, and **the verdict is produced where each threshold lives, never by reading the row's words** — their own phrase, *"17.5% and 163 GB free is not this, and never becomes this, because the design cannot see either figure."* A test pins that the renderer branches on no `r.value`. **Three states and only three** (`attn`, `watch`, `unread` — the last one quiet, because a limit is not a warning), and a test asserts the states the app can produce and the states the delivery draws are the SAME SET. §5.41c: **"DO NOT SET data-state=\"ok\""**, which they reached independently — *"a mark that says 'fine' is fifteen marks on a healthy machine"* — so a healthy machine carries not one mark. §5.41e is the one finding, measured: their note says severity ships safely alone and **it does not** — `.mgrid`'s gap is right between SETS and wrong between ROWS, making the flat band **38% taller** (378px → 521px). Shipping both stages together makes it moot, which is why Charles chose both; the alternative fix is one line in THEIR file, not ours. §5.41g: `serviceWords()` has one home now. **1691 / 21 client assertions.** §5.41. 2.42, 2026-09-11, earlier: **D257 — disk per volume, and memory as a conclusion rather than a silence.** Charles, looking at the shipped band: *"Where is the info for memory, hard drives space."* They had different instructions — memory was built, scored and deliberately INVISIBLE (D256 §2c); disk was excluded outright — and he reversed both, each in the narrower way. **Acceptance 5 is narrowed, not broken:** the commit FIGURE is still forbidden everywhere a user reads and still absent from the object the renderer receives; the panel now says what it MEANS, which is what "conclusions, not measurements" asks for. §5.40a: **disk is not a restart signal and the code is arranged so it cannot become one** — separate probe field, neither module importing the other, no `score`/`weight`/`recommend` in `disk-space.js`, and an identical restart score with and without full disks. §5.40b: the **dual threshold**, because a naive "below 20% free" rule fires on two healthy volumes here (C: and E:, 17.5% free with 163 GB each) and the dual one fires on none. §5.40c: the conclusion leads and the figure follows — *"163 GB free"* is actionable where a commit percentage is not — and **per volume, never aggregated**. §5.40d: ONE band function, which surfaced a latent contradiction in D256 (a tenant-lowered threshold scores a reading the row calls "Plenty free", so the clause is now null rather than contradicting it). §5.40e: **the band is now FIFTEEN rows and §5.39k's condition is met — the Design handover is warranted.** **1593 / 20 client assertions.** §5.40. 2.41, 2026-09-11, earlier: **D256 — the restart signal: collected natively, scored from unvalidated defaults, one row that gives no advice.** The boot instant, the three pending-reboot flags, commit charge, `Memory Compression` and the two boot events, read by **native calls only — no PowerShell, no `.ps1`, no `Get-Counter`, no shell** (§5.39a, which corrected two of the spec's own measurements: the event log is **1.2–5.9 ms** when queried by XPath, and the HKLM reads need no elevation). §5.39b: it reports `LastBootUpTime` **exactly** — `BootTime − BootTimeBias` matched WMI to the millisecond, and `GetTickCount64` resolved which value is which; **no tick counter is used and a test pins that**, because `TickCount` wraps at 49.7 days and the machines that most need flagging are the ones that would report clean. §5.39c is the defect, and it was ON SCREEN: the evidence clauses were named after the DEFAULT bands, so with the band lowered the panel said *"hasn't been restarted in more than a fortnight"* about a machine up **1.35 days** — every copy rule passed and the evidence was false. **The band decides whether to speak; the reading decides how it is described.** §5.39d: `PendingFileRenameOperations` can **never fire alone**, structurally rather than arithmetically. §5.39e: an unreadable probe scores nothing and is never read as healthy, and the process walk cross-checks itself against the kernel's own count. §5.39f: once declined, not again this session. §5.39g: the offer is to COME BACK, because nothing here can restart a machine. §5.39i: **nothing reads the consent store**, and Event 1074 cannot be spoken because its payload carries the machine name twice (D249). §5.39j: every threshold is a proposal and the config file says so. **1498 / 19 client assertions.** §5.39. 2.40, 2026-09-11, earlier: **D255 — the hub's markdown is read as DATA and built as NODES, never interpreted.** A real answer reached the screen as "…is `Ctrl + Y`." with the backticks showing (§5.37c). `model-prose.js` returns runs and the renderer appends a text node or a `<code>` per run, **so no HTML is parsed, none produced, nothing can inject** — the only shape available, because D130 forbids `innerHTML`. **Both layers:** the hub's `answer` tool now asks for plain sentences *because the reply is spoken as well as shown*, and the renderer is right on the turn a model ignores its prompt — a model is not a contract. §5.38b is the load-bearing restraint: **single `*` and `_` are NOT emphasis**, because `needs_human_judgement` is on the review card and a naive rule makes it `needshumanjudgement` — a stray `*word*` is a blemish, a mangled enum is a lie. §5.38c: the case note is NOT transformed though it is model-written, because the card says *"Sent exactly as it reads."* §5.38e: two CSS defects found by measuring — **`--matic-ui-hair` is a WIDTH, not a colour**, and the first write-up of that failure was itself wrong and is corrected. §5.38f: **app.css grew 123 → 155 lines and that is a cost**, logged in the file as the next design ask. §5.38g: the check page now has a fixture with markdown in it, which is what was missing. **1202 / 18 client assertions.** §5.38. 2.39, 2026-09-11, earlier: **D254 — THE PANEL CLICK-THROUGH WAS RUN IN ELECTRON**, unrun since it was written and unrun against three deliveries, against the real broker, the real probe and a live hub — driven over the DevTools Protocol, with screenshots of the real window. **Seven straight click-throughs have found something and this one found six.** Two fixed, both D244/§5.29a's vocabulary rule in strings its sweep missed: the degraded REPLY named only the service desk (and the question that lands there is the kind the GUIDANCE would answer), and the RECOVERY note named one thing where the LOSS note six lines above named two. **The pin is now an enumeration of every connectivity-state string with the exclusions written down as decisions.** Four not fixed, three of which cannot be: the hub's markdown shows as backticks (D130 forbids the obvious fix), the citation shows a slug because `/v1/ask` returns no title, the model's reasoning renders twice, and its proposal still names the mechanism. §5.37b: it proved **D249, D247, D250 and D253 against the real thing** for the first time. §5.37e: **§10.5's trap four times in one session, none of it in the product** — a hidden element is not necessarily `[hidden]`, and a collapsed `<details>` has no `innerText` at all. **1158 / 17 client assertions.** §5.37. 2.38, 2026-09-11, earlier: **D253 — the review card's state is written from the FILING RESULT, never from the click that started the filing.** It wrote "Sent by you" on the click, before `fileTicket()` had been called, so a filing that then failed left the card claiming it had been sent — three lines above a note saying nothing was filed, with the card still on screen, **on the one screen where a user approves data leaving the machine.** `reviewTicket()` resolves with `{ approved, report }`; the click writes "Sending…" and the caller writes the outcome, on both branches and before either speaks. **Three endings because D213 has three** — the middle one, `filed === null`, is "Sent, not confirmed", because a timeout is neither. §5.36d: **a second defect of the same class, found by CANCELLING the card rather than reading it** — the cancel note and the transcript note said one fact in two wordings, adjacent, which is the whole of D245. §5.36c: the probe caught a trap in the TEST — reading the whole send handler for "Sent by you" passes on the defect, because `report` is defined inside it and carries that string legitimately. **1144 / 17 client assertions.** §5.36. 2.37, 2026-09-10, earlier: **D252 — the panel re-export is INTEGRATED, its 32 names adopted rather than renamed, and both unasked-for token changes kept.** The third export answered all three asks and D251's fallback was not needed: **515 classes against the previous two exports' 0, 36 inline styles against 242, 38,392 characters of CSS against 2,293**, no CDN, no framework. **`matic-panel.app.css` went from 280 lines to 123** — section (b), "surfaces the delivery did not draw", is nearly empty because it drew them, and that shrinkage is the measure of whether D241's arrangement works. Adopting their names rather than renaming their CSS is the point of it: the delivery is the source. §5.35a: both retuned tokens fixed real AA failures, **all six of their contrast figures re-derived here and every one matches** — and their third find is a gap in OUR analysis (dark `ink-quiet` fails on `surface-2`, the review card's own ground, which §5.29b never measured because the card had not been drawn). §5.35b: the four live tokens are a named exception **whose test reads the delivery's own words, so it cannot outlive its justification**. §5.35d: the chevron now hangs off `aria-expanded`, so the visual and announced states cannot disagree. §5.35e: one defect found by looking, and ours — a `<textarea>` does not inherit a font, so the user's words rendered in a monospace box. **1131 / 17 client assertions.** §5.35. 2.36, 2026-09-10, earlier: **D251 — one more request for a buildable panel export, and a named fallback if it does not arrive.** Two exports have come back against the design follow-ups and **the entire difference between them was one line**, a Google Fonts `<link>`. Neither is buildable: **0 `class=` attributes against the September delivery's 291, 242 inline `style=` against 46, a 2,293-character `<style>` block against 25,369** — and `matic-panel.css` is generated from that block, so a decision in an inline attribute never reaches the app. A one-line diff is a brief that did not arrive rather than a disagreement, so it is re-sent as one page with a worked before/after, the 90-name class contract and one self-test (open it with the network off). **If the next export is not buildable either, D241 ends for the panel: the delivery becomes reference rather than source and the app implements the written decisions itself** — §5.34a states what that costs before it is chosen. §5.34b: the Google Fonts link is a regression, not a stand-still, on a machine that is routinely offline. §5.34c: the tickets band's status claims are **our omission** — the first brief never mentioned the band or D242. **Nothing is integrated; the panel is unchanged at D240–D250 and the suite at 1113 / 17.** §5.34. 2.35, 2026-09-10, earlier: **D250 — an executor's report says what was done in the CATALOG'S PLAIN WORDS, the same ones the user read on the consent card, never in the mechanism's name.** *"Flushed the DNS resolver cache"* and *"Renewed the DHCP lease"* are Microsoft's names for the mechanisms, which is what the catalog `title` is for and what the inspector still shows — and both were spoken. The catalog already had the user's version of each in `plain.what`, so the reports now echo **the description someone approved**, which they can match to what they agreed to. `describeAddress` went the same way ("IP address" and "DHCP has not answered" out; **the address itself untouched**, because a self-assigned 169.254 reading as success is a hardware-found defect and the value is the evidence), and the last place a catalog title reached the voice is closed. **The TITLES are unchanged** — a title is the capability's identity and the model's handle on it. §5.33b: the test pins the class rather than the three instances, and records that **this is the fourth assertion in one session written against the words instead of the contract.** **1113 / 17 client assertions.** §5.33. 2.34, 2026-09-10, earlier: **D249 — this environment's own identifiers are SHOWN and never SAID: the machine's name, the signed-in account, and this machine's own addresses.** Charles: *"Speaking computer names could be tricky especially in a corp environment. Ok to display computername but it should say this pc"*, then *"do the username too"*, then *"fix 2 and 3 as well"*. Each carries a department, a site, a person or a subnet; each is read out in an open-plan office; and each is bad audio. **Nothing spoke the name or the account, and that was an accident of three unrelated decisions rather than a guarantee** — the design's own placeholder consent card reads *"…on PLACEHOLDER-PC"*, which is the sentence it would arrive through. **The address was different: it WAS spoken**, by `renew_dhcp`'s success line. `say()` is the only thing that reaches the voice, so it renders one string and speaks another; the rule is in a pure `spoken-form.js` because `renderer.js` cannot be imported by a headless test. **The boundaries are the interesting part and every one is wrong in a way reading does not show:** a hyphen is a word boundary to a regex, so `OLD-FIN-LON-0442` would have matched; `CORP\a.petrova` without a qualifier clause becomes `CORP\your account`, the account redacted and the domain read out; an address cannot exclude `.` on its right because sentences end; and a machine called `PC` would have rewritten the word "pc" in every sentence. **§5.32a: the addresses are this machine's two literal values, not a pattern — a hub answer may legitimately say "try 8.8.8.8", and redacting that destroys the answer.** §5.32c fixes the third item, the panel's crash note, which put a JavaScript exception at the user. §5.32d records that the tests were mutation-probed, all ten weakenings caught — **and that the probe itself was wrong twice first, both times reporting the shape of a real finding while proving nothing.** **1098 / 17 client assertions.** §5.32. 2.33, 2026-09-10, last: **D247 — the broker's strings, audited, and the D246 split applied one layer down.** §5.30's ledger said the broker-derived strings were "likelier to be fine, but that is not checked". They were not fine: `ExecutionResult.message` is SPOKEN on every path and carried `OpenServiceW(spooler) failed (Win32 error 5)`, the consent protocol's own vocabulary ("no consent nonce was presented"), and the SERVICE'S REGISTRY KEY — *"Restarted the spooler service"*, to someone whose printer had stopped and who cannot find that name anywhere in Windows. The catalog carries `plain.serviceNames` now (what `services.msc` calls it), the consent card's rollback note names a capability by its title rather than its id, and the renderer no longer interpolates `validation.errors[0]` or `prepared.error` into `say()` at all. **Nothing was deleted** — every diagnostic is on `detail` and in the audit record. **D248 is PROPOSED and awaits Charles:** the consent card's `restart_service(serviceName=spooler)` is a documented, screen-verified disclosure, and D244's answer (gloss it, keep the exact call subordinate) needs a contract change — so it was STYLED subordinate, not rewritten. §5.31b: **the check page returned success and only success**, so none of the three failed-fix paths had ever been rendered; driving them found a duplication introduced in this same pass. **1048 / 16 client assertions.** §5.31. 2.32, 2026-09-10, later still: **D246 — a failed egress returns TWO strings: `error`, which the user is told and which is persona data, and `detail`, which is ours and goes to the inspector, the developer log and the egress record.** `HubClient.fileTicket()` had one field doing both jobs and the renderer SPOKE it, so a user whose ticket had just failed heard *"Could not reach the hub at http://127.0.0.1:8787: fetch failed"* — our word, our port and Node's phrasing, read aloud. All five failure paths were ours, including a bare `HTTP 503`. **Nothing was deleted:** every diagnostic moved to `detail`. §5.30a: **"the hub" was also on the review card and in the tickets band**, which are read far more often than any failure — the card is the one screen where a user approves data leaving the machine, and it named the destination in our word. Both say **the service desk** now, with every fact intact; the assertions that broke were pinning phrasing and now pin facts. **"In this build" was left alone on purpose** — `persona.tickets.some` says it in the same words and D242 requires the band and the spoken answer to agree. §5.30c: **the failure branch had never been run** (it needs a hub up enough to offer and down enough to refuse), so the check page has two one-shot triggers now and both were driven. **1012 / 16 client assertions.** §5.30. 2.31, 2026-09-10, late: **D244–D245 — a closed enum that reaches the user is GLOSSED and not hidden, and a fact about what the system did not do is said once, on the surface shown before the user acts.** From a screenshot of a running session: the review card printed `CATEGORY needs_human_judgement` at an office worker, and the no-email fact appeared twice three lines apart in two wordings. Hiding the enum was the wrong fix — D128 requires the user to see what is being sent — so it is glossed with the raw value kept underneath, from a table the enums in `prompt.js` are the authority for. **Two of the handover's four observations were already answered in code and the handover said the code wins:** the unreachable transition has announced itself in the conversation since D240, but it named only the service desk where the other two surfaces name the company's guidance as well, and it promised that *questions and tickets will wait* when nothing is queued at all. The idle status is now "Nothing in progress" — "Nothing running", beside a band listing this machine's services, reads as a claim about them. §5.29b records four items for the next design delivery and answers two of them: the disclosure square **is not a checkbox** (both triggers are `<button>`, the square is a decorative span) and the label column is **3.53:1 in light, 4.65:1 in dark** — arithmetic over declared tokens, not a measurement. Found by clicking rather than reading: the disclosure chevron never rotated (`63011a4` re-keyed the open trigger's wash off `data-set` and missed it), and the check page's own fixture carried a category that is not in the enum. **923 / 16 client assertions.** §5.29. 2.30, 2026-09-10, evening: **D240–D243 — the end-user panel is Claude Design's delivery, and the endpoint's own machinery moves to an inspector that is hidden by default.** The state name, the voice pill, the facts table and four JSON panels are gone from the surface; what stayed is every line about what the system did NOT do, because each of those exists because of a shipped defect (D86, D205, D213, `700d920`). The stylesheet is GENERATED from the delivery and checked (D241, the avatar's argument again) — so a design change arrives as a new delivery — and the check page's frame is generated from `index.html` for the same reason. **D242 ships the tickets band the brief did not ask for, reading the endpoint's own egress record, with "Progress not visible" where a status would go — it is PROPOSED and awaits Charles.** D243 persists the theme and stops the window being shown before it has painted. **869 / 16 client assertions.** Nobody has watched the panel in Electron yet: `client/docs/PANEL-RENDERER-CHECK.md`. §5.28. 2.29, 2026-09-10, same morning: **D235 — "where's my ticket?" is answered from the endpoint's own egress record, and the capability answer is generated from a new catalog field, `plain.helpsWith`, in the user's words.** Charles asked for his open tickets' status and the knowledge base declined it as a gap; the endpoint now recognises the question, lists what THIS machine filed (reference, when, the user's own words) and says plainly that checking a ticket's progress is not built — the hub-side lookup needs a route and a user identity (D54, D68/D69). He also asked for a friendlier capability summary as tools grow: the list is still generated (D165), but from "what you have" phrases in the catalog rather than titles — a capability without one is read by its title, which is the honest fallback. **797 / 15 client assertions.** §5.27. 2.28, 2026-09-10, morning after: **D234 — the assistant has a persona file.** Charles's first two runs of the new avatar: "hello matic how are you?" and "Hello Matic How are you today?" both left the machine (the residue test saw "matic", then "today", as a one-word complaint), "what can you fix?" was not a capability question, the fallback said "I could not reach the model" over a 502 with a green pill beside it, the app threw "Object has been destroyed" on close, and the verdict was *"I am not feeling the love."* `client/src/router/persona.json` now holds the name, the vocatives, the boot line, every social line (rotated, warm, plain) and the two last-resort sentences; nothing in it may name a capability or claim an outcome, and `test/persona.test.mjs` checks both against the catalog's own words. The social markers and filler are widened; the name is stripped as a vocative. **746 / 14 client assertions.** Also found on that run: the hub was answering with `embedder: none` (lexical leg only, so "shortcut to hide desktop" retrieved 0 chunks and declined) while Ollama had the embed model — a hub started degraded stays degraded; restart it through the launcher. §5.27. 2.27, 2026-09-10, later: **D232 — the avatar is Claude Design's v7 bust chassis, driven from its manifest, and a knowledge-base decline now has a face (`declining`); D233 — the endpoint has a connectivity model (D49's three states, D51's hysteresis) and the reconnect question is answered: endpoints come to the hub, the hub signals nobody, the heartbeat response is the directive channel.** The audit the avatar handover demanded found the old avatar had no `declining` and rendered a decline as `thinking → speaking → idle` with a red system line; three other state misuses against v7's placement rules were corrected (a failed fix was `error`, an offer was `escalating`, ACCESS_DENIED was `escalating`). **§3's phoneme risk was measured: 732 real Piper phonemes, and the manifest's eSpeak-ASCII table knows none of the IPA Piper emits (58% of occurrences would close the mouth), so the debugged table stays — and the same run found five bare vowels that table had never matched, because length marks arrive as their own rows.** Also found: the delivered harness's dark-panel toggle does not knock the field out (a token declared on the svg beats one inherited from a wrapper), and its reduced-motion toggle does not reach the tray strip. **650 / 13 client assertions, up from 492 / 11.** Nobody has watched the Electron window with the new face. §5.27. 2.26, 2026-09-10, night: **D231 — B3's enrollment mechanism is built (pending queue, auto-approve + per-tenant toggle, rotatable time-boxed secret, rate limiting with a volume-based fallback to the queue, bulk revocation by batch), and device identity (D60/D61/D63/D64/D146/D148 — the TPM-backed key, the broker-custody chain, the token exchange) is deliberately NOT**, because that whole family is one dependency chain and no link of it means anything built alone: D61 needs a key to sign with, and D64's broker custody needs the named-pipe transport, which is designed and not built (D200/D201). `submitEnrollment()` in `server/src/devices/enrollment.js` is the one function the console, the CLI (`bin/devices.mjs`) and `POST /v1/enroll` all compose (D224's pattern, a third time). A device on the Agents page is KNOWN, not PROVEN, and the page says so. **384 / 342 assertions, up from 378 / 310.** §5.26. 2.25, 2026-09-09, night: **D230 DECIDED — the article editor is a structured form, not a markdown editor.** Charles confirmed the handover's recommendation ("option 1"): fields for `problem`/`symptoms[]`/`keywords[]`/`guidance[]`/`escalateWhen[]`/`doNotAttempt[]`/`cause`, one entry per line on the arrays, no markdown, no sanitiser, no new dependency — `raw()` stays unused. `body` (markdown, `type: "reference"` only) stays uneditable and is shown back unchanged. Built the same session: `GET /admin/knowledge/new`, `GET /admin/knowledge/:id/edit`, `POST /admin/knowledge/save`, all writing through `ingestAndEmbed()` (D228) like the paste-a-bundle form; every save lands `lifecycle = 'unvalidated'`; `kb.article.write`/`.refused` audits the id and the changed field names, never text; an id collision on create is refused (409) rather than silently overwritten; an edit cannot rename the id or blank `body`/`scopeNote`/`provenance`. **378 / 310 assertions, up from 366 / 268.** **Not done: the model's-answer half of "preview before publish"** — retrieval-only preview is built by reuse (the existing search page); the completion provider is not threaded into `adminHandler()`, only the embedder is, and that wiring is a decision this row does not take. §5.25. 2.24, 2026-09-09, evening: **D229 RATIFIED as recommended — logged question text is kept 90 days then cleared, the row stays, the sweep runs inside every write, configurable downward only — and D227 FOLLOWS: the demo and dev hubs log question text from now on.** Nothing is retroactive. 2.23, 2026-09-09, later still, and BOTH FOUNDER QUESTIONS ANSWERED THE SAME DAY: **D226 is DECIDED, NARROWER THAN IT WAS ASKED** — the console shows a matched chunk's text **for the chunks `/v1/ask` would send and no others**, which is the text that produced or failed to produce an answer and the smallest disclosure that answers the question the screen exists to answer; the narrowing is structural (`sentText` is null below the top 5 and the legs are stripped of text before they leave the module), so a page cannot leak an unsent chunk by forgetting a check. **D227 is DEFERRED behind a new D229** — a retention policy for logged question text, on the founder's reasoning that a table of what employees typed needs a keeping rule *before* it has rows in it. So `MATIC_KB_LOG_QUERIES` stays off, the review queue keeps showing declines without their text, and **that cost is named rather than absorbed**. **D229 is the cheapest item on the list to answer, because nothing has been logged yet.** 2.22, 2026-09-09, later still: **D226–D228 in §5.24 — Knowledge is real in the console: a bundle can be ingested from the browser and the corpus searched the way `/v1/ask` searches it,** with both retrieval legs shown unfused beside the fusion and the D207/D203/§5.16c caveats on the screen. **D228 (done) makes the console and the CLI share ONE ingest** — `ingestAndEmbed()`, which refuses the embed step rather than put a second embedding model in the corpus, so exit criterion 1 ("the page's counts equal what `kb:status` prints") is a real test. **D226 and D227 are PROPOSED and await the founder:** whether the matched chunk's TEXT may be shown on a hub-rendered console page (D53 was written before the console existed), and whether `MATIC_KB_LOG_QUERIES=1` should be set on the dev and demo hubs — the one switch that turns the retrieval log into a table of what employees typed. Neither blocked building; the console ships with chunk text absent and logging off. §5.24 also records four defects found by RUNNING the ingest rather than reading it, the sharpest being that **migration 002 has no CHECK on `platform`, so an article stamped `Windows 11` is stored, indexed, embedded and retrieved by nothing** — legal, invisible, and now reported at ingest as a warning. Also `bin/admin.mjs reset`, so a lost authenticator secret is a reset rather than a new account. 2.21, 2026-09-09, later: **D225 — the console wears the Industry design system**, applied from Claude Design's handback the same day; the three Barlow faces self-hosted from the hub. 2.20, 2026-09-09: **D221–D224 in §5.23 — the admin console scaffold, B2.** Server-rendered HTML at `/admin` in the hub process, no new dependency; local accounts with scrypt + mandatory TOTP, roles carrying permissions through a new `admin_role_permissions` table, admin-action audit from the first request; the review queue is home (D177) with the D205 declines as its one live feed; tickets fully working through a query layer the CLI shares; five honest stubs. **D223 records the founder's 2026-09-09 answer that a declined question is a gap record and not a D154 transcript.** Eight exit criteria pass on PostgreSQL 17: `server/docs/B2-ADMIN-CONSOLE.md`. Nobody has clicked through it in a browser yet. 2.19, 2026-09-05: **D220 in §5.22 — the demo-prep pass.** Two Desktop launchers that preflight before they start (Docker, Postgres, migrations, a tenant, THE CORPUS CHUNK COUNT, Ollama, exact model tags, VRAM, the port) and print READY only after both models are resident and one question and one proposal have gone through the hub; `OLLAMA_KEEP_ALIVE=24h` set and verified on `ollama ps`. **§5.22a explains the 90-second cold load: it is a SHARED GPU.** Measured 12.7–14.5 s with the card free, 190 s load / 265 s wall with a game holding ~7 GB, and the model then split 15/85 CPU/GPU. Warm turns are 3–8 s. §5.22b records what was found and left: a declined question offers a ticket the question path cannot open. 2.18, 2026-09-04: **D219 in §5.21 — THE STATE FALLBACK STOPS ANSWERING QUESTIONS NOBODY ASKED.** §5.20b listed it as live and unfixed hours earlier. `routeByState` ignored the text by its own design, so on a machine with a stopped print spooler *"the screen on my laptop is cracked"* came back as *"the print spooler service is stopped, I can start it again."* **The question was never "should it read the text" but "does the text entitle it to ignore it"** — ignoring it is CORRECT for *"help"* with the cable out, which is the Day-4 exit criterion. `stateTopicsFor()` answers that: a named symptom restricts which branches may reply, a sentence with no subject lets any of them, and a sentence naming something else lets none. **The design had met this failure mode once already and half-solved it** — `flush_dns`’s `egressFailed` gate asks whether an observation SUPPORTS the proposal; nothing asked whether it was about the COMPLAINT, and a stopped spooler is a good observation about the wrong thing. §5.21a states the cost of the whitelist bias plainly, and §5.21b records that the caller’s last-resort reply had to change too, because it claimed the machine was clean in a state where that is false — replacing a non-sequitur with an untruth would not have been a fix. 2.17, 2026-09-04: **D213–D218 in §5.20 — ESCALATION NOW PRODUCES A TICKET, and the avatar stopped talking about the user in the third person.** Both defects came from the FIRST CLICK-THROUGH of hub mode. **D214 is the one nobody had written down:** `escalationSchema()` asks for `summary` as a third-person case note for the assignee — correctly — and all three providers spliced it into the spoken reply, so the avatar said *"The user reports a cracked screen."* One string, two audiences; the model was obeying its instructions exactly, and the schema was wrong. The spoken line is now generated client-side by `escalationReply()`, never contains `summary`, and **is an offer rather than a report** — *"I would hand this to X"* is reported speech with nothing to answer, which is why the observed *"yes please hand to it"* landed nowhere. **D213 is B6-lite:** `migrations/tenant/003-tickets.sql`, `POST /v1/ticket`, `bin/tickets.mjs`, and **NO OUTBOUND EMAIL**, so per D86 it is a record and not a queue — a fact repeated on five separate surfaces so that claiming otherwise requires ignoring a value rather than not knowing one. **D215** keeps the profile locally per user and the list on the hub, self-asserted and labelled so everywhere, with `osUsername` read live rather than stored. **D216** makes the interview a declarative field list that asks only what it cannot derive and **NEVER TRAPS A TURN** — an unrecognised answer to the offer passes through and is handled as a new problem. **D217** gives egress its own log recording the payload verbatim, because filing is the first time identity leaves the endpoint and `Agent.identify()`'s *"Nothing here is sent anywhere"* is no longer unconditionally true. **D218 was found by the end-to-end run and then reproduced deliberately:** `HubClient` gave up on the hub 3.5 minutes before the hub gave up on its model, and `routeByState()` answered a cracked screen with the print spooler's state. **§5.20b lists what is still broken, including that fallback, which is NOT fixed.** 2.16, 2026-09-04: **D212 in §5.19 — D165'S SOCIAL LAYER IS BUILT, and D198's defect is fixed.** *"Hello how are you?"* no longer produces a consent card. Six deterministic client-shipped subkinds, and **the capability answer is GENERATED from `broker.listCapabilities()`** — D165's actual requirement, because a hand-written list is a claim and a generated one is a fact; with an unreadable catalog it promises nothing at all. **`Agent.propose()` calls it UNCONDITIONALLY, which corrects D211's gating:** D198's defect was observed on `provider: "cloud"`, the frozen demo's configuration, so gating this on the hub would have left the defect on the path it was seen on. **§5.19a records that the hard part was not recognising "hello" but not swallowing "hi, my printer is broken"** — a silent failure worse than D198's — plus two defects found by running it: a bare "Hi" classified as an action (punctuation enumerated instead of word boundaries), and "what is the weather" sent to the knowledge base (off-topic markers were taking the residue test, and bare topic nouns collide with real complaints). D165's row no longer says "not built". 2.15, 2026-09-04: **D211 in §5.18 — THE ENDPOINT CAN ASK A QUESTION.** B7a built a hub that answers and left nothing able to ask it; `client/src/router/classify.js` splits question from action after tier-0, `HubClient.ask()` calls `/v1/ask`, and an answer comes back as `res.answer` with the citation kept OUT of the spoken reply (H5). Three load-bearing properties: the classifier is **biased towards the measured path** (an action verb beats question grammar, so "how do I fix my printer" proposes); **a declined question does NOT fall through** to the proposal path, because that would raise the unprovoked consent card D198 forbids; and the branch is gated **by capability, not provider name**, so the frozen demo cannot reach it by construction. **§5.18a records the integration bug only an end-to-end run could find:** `probeMachine()` has no `platform`, so every Windows-only article was invisible to the endpoint — both sides' tests passed and the seam between them was broken. **§5.18b records that porting the test runner to `client/` found TWO test files that had fallen out of `npm test`** — one costs money, one needs elevation, both belonged out, and neither absence was recorded; exclusions are now declared with a reason and printed every run. **D165's social layer is still NOT built** and a test asserts D198's greeting still routes to the proposal path, so the defect is recorded rather than masked. 2.14, 2026-09-04: **Q35 ANSWERED BY THE FOUNDER — English only, FOR NOW — and the code-signing certificate has its first estimate: roughly one month, ≈2026-10-04.** §5.17, D208–D210. **D208** records the answer and that *"for now"* is part of it: it licenses choosing English-only components where they are cheaper, and does NOT license making a reversal a migration rather than a redeploy. **D209 selects within D207's own recorded fork** — the reranker pick becomes `gte-reranker-modernbert-base` (150M, int8 ONNX, 8192 context) over `gte-multilingual-reranker-base` (306M, no ONNX), which matters more than Q35 does for the embedder because a cross-encoder's cost is per-candidate, so halving parameters halves every question. **D210 is the uncomfortable one: D199's deciding reason was removing Q35 from the critical path, and that reason is now SPENT.** D199 stands, `nomic-embed-text-v1.5` (137M, same 768 dims) is the pre-argued alternative, and it is NOT adopted today because no latency measurement exists for either and *"for now"* can revert. §5.17a records what the answer does not change — B7a needs no re-embed. **§5.17 also records that Q35, Q9 and Q39 are cited throughout this register and defined nowhere in it**, their text being in the workbook that has never been on disk. OPEN-9 and §9 carry the certificate estimate and its three consequences, the sharpest being that **Q9 — not the certificate — is now the item on the critical path.** 2.13, 2026-09-04: **D203–D207 in §5.16, from building B7a — three of them contradict a premise of the B7a spec.** **D203: D199's embedder is NOT in Ollama's library**; the dev embedder is the L variant (1024 dims, measured), which is 1.9× the parameters and MTEB-ranked *better* — so dev latency is a pessimistic proxy and dev quality an optimistic one, and the L sits in the parameter class D199 rejected. Not an amendment to D199. **D205: nothing in this system could return a prose answer** — `tool_choice: "required"` on both providers, HTTP 502 on a no-tool-call from `/v1/turn` — so an `answer` tool carries the reply and makes the decline a testable field. **D206: questions go to a second route `/v1/ask`**, because adding a database to `/v1/turn` would have meant deleting the test that keeps it stateless. **D204: the generic corpus lives in the control plane.** **D207: the reranker is retrieved and deliberately not picked** — TEI supports only four reranker types, and a cross-encoder costs per-query × per-candidate rather than per-query, which is the question and is nowhere in the handovers. §5.16a records that the relevance floor is still unset on purpose, and §5.16b a second instance of §10.5's trap class: `"darwin".includes("win")` is true. 2.12, 2026-09-04: **D152–D160 (OPEN-6) RATIFIED AS A SET by the founder**, as a separate act from B1's ratification the same day — §5.7 keeps the finding that prompted it, that B1's ratified schema had already implemented these shapes and was never evidence they were accepted. **D158 is ratified but inert in Phase 1** and B2 must not build an approval workflow against it. **D202 is proposed and awaits the founder** (§5.7a): step-up for vendor-grant creation, the one item D157's list missed. **§5.7b adds the migration provenance convention** — a migration names the decision it implements and the status that decision held when the migration was written — applied retroactively to `001-control-plane.sql`. 2.11, 2026-09-04: **D167–D192 and D193–D197 RATIFIED AS SETS by the founder**, so the KB architecture and the B1 control plane are settled. §5.11c keeps three caveats that ratification does not soften (D173's premise was not confirmed against KCS; D174's reranker is unretrieved; nothing is measured on our corpus). §5.12 records a correction to this file's own bookkeeping: those five cells always read *decided*, while the indexes called them *proposed*. **D152–D160 (OPEN-6) remain proposed** and §5.11c's old "ratify alongside OPEN-6" pairing is void as guidance. 2.10, 2026-09-04: **D199, D199a, D200 and D201 RATIFIED by the founder.** The embedder is decided, the pipe protocol's wire format is now a contract rather than a proposal, and D201's exception to D98 is accepted — which commits us to listing the new pipe-lifecycle calls in `BROKER-SURFACE.md` before any implementation merges. D193–D197 (B1) and D167–D192 (KB architecture) remain **proposed** and still need ratifying as sets. 2.9, 2026-09-04: **D201's blocker is measured, not reasoned — §10.5.** The DACL Windows gives a Node pipe was read off a live one, and the access check refused `GENERIC_WRITE` with ERROR_ACCESS_DENIED from an unelevated token. Reproducible: `npm.cmd run verify:pipe` from `client/`. 2.8, 2026-09-04: **D200–D201 in §5.15 — the named-pipe protocol, designed.** D200 is the wire shape (JSON Lines, the four Broker methods, D133's single strict version, `execute` with nowhere to put a proposal). **D201 is a forcing discovery: the transport we assumed cannot work** — libuv passes NULL security attributes to `CreateNamedPipeW`, so a LocalSystem-hosted Node pipe grants the unprivileged agent read and no write. It needs native pipe creation, which is a costed exception to D98. §5.15a records that a pipe DACL is not a defence against A1 and cannot be. 2.7, 2026-09-04: **D199 in §5.14 — the embedder is `snowflake-arctic-embed-m-v2.0`, proposed**, resolving the last of the Phase 1 plan's two "blocking now" items and unblocking B7; **D199a records voyage-4-nano as open-weight now and the one to revisit if its shared-embedding-space claim is verified.** §5.14a notes that both "blocking now" items were already resolvable — the embedder's gating `[VERIFY]` had been confirmed in §10.4 the day before, so the decision was waiting on nothing. 2.6, night of 2026-09-03: **D198 in §5.13** — an unrequested consent card is a cost to D130, so D165's social layer is a safety requirement and must sit ahead of the state fallback; found by using the app, not by reading it. §10.3a records the D130 renderer check, verified on a screen. 2.5, night of 2026-09-03: B1's six exit criteria run and pass — 56 assertions on PostgreSQL 17.11 — so D193's extension arrangement and **D195's limit** are confirmed against a live server rather than reasoned; §10.2 updated. 2.4, night of 2026-09-03: **D193–D197 in §5.12, from building B1** — pgvector installed once per database rather than per tenant (D193, correcting an instruction that could not be carried out), `SET LOCAL search_path` inside the transaction as the tenant-scoping choice (D194), **`search_path` is not a permission boundary and criterion 2's limit is recorded (D195)**, the job queue carries references and not payloads (D196), PostgreSQL 17 pinned (D197). 2.3, night of 2026-09-03: the KB architecture document was **found on disk** and merged — **D167–D192** in §5.11, with its void D151–D168 mapped in §5.11a and four of its citations corrected in §5.11b; **OPEN-5 closed** by the threat model, now filed at `../2026-09-03-threat-model-v1.md`; two dangling IDs in this file recorded (`D46b`, `D52a`); the cross-encoder `[VERIFY]` added to §10.2. 2.2, night of 2026-09-03: D162–D166 and OPEN-9 appended in §5.10 (D166 added from the follow-ups handover A4); D130 implemented; §10.4 verification of the handover's Task 5 lookups; the hub bake-off added to §10.3. 2.1, evening of 2026-09-03: D151–D161 and OPEN-8 appended; D132 parameter values; D133 conflict resolved; D130 design filed; D140 decided; §0 records the D130–D168 double assignment.)
**Date:** 2026-09-03
**Covers:** D1–D289 (D236–D239 are taken by the hub-side work of 2026-09-10 and not yet sectioned), invariants H1–H6, conflicts C1–C12 and X-1–X-7, reviewer tensions R-1–R-14, open items OPEN-1 to OPEN-9, values left unset, verification register.
**Location:** `docs/decisions/DECISION-REGISTER.md` at the repo root, beside `client/` and `server/`. Every handover and every review prompt references this file **by relative path**, never by name alone (D150).

**Supersedes** (verbatim copies kept in `sources/` for provenance; they carry the OLD numbering and must not be cited):

| Source | Old numbering | Here as |
|---|---|---|
| `sources/2026-09-02-matic-desk-decision-register-consolidated.md` (itself consolidating `...D35-D46...` and `...D53-D67...`) | D35–D83 | **D42–D90** (+7 to every ID, including cross-references) |
| `sources/2026-09-02-decisions-D91-D124-updates-notifications-kb-sync.md` | D91–D129 | **D91–D129** as written |
| `sources/2026-09-02-fable-design-review.md` (independent review, 2026-09-02/03) | proposals, unnumbered | **D130–D150**, X-1–X-7, R-1–R-14, OPEN-5–OPEN-7 |

---

## 0. Provenance, numbering and gaps

**D1–D41 are not in this file.** They live in `ASK-IT-questionnaire.xlsx`, which was never downloaded: it exists only as a chat artifact in the conversation *3D avatar with Amazon Bedrock architecture*. Section 1 below reserves the range and records what is known about it. Reconstructing D1–D41 into this file is the highest-value housekeeping task remaining, because H1–H3e are defined there and several decisions below reference that range.

**The +7 renumbering has been applied, once, here.** The two earlier decision files and the consolidated register numbered from D35 and collided with D35–D41 in the workbook. Per the D91–D124 document's §0, every ID in the consolidated register — headings, table cells and cross-references — has been shifted by +7 in this file. Nothing outside this file should be renumbered again; cite this file.

**D130–D150 were assigned in this file on 2026-09-03.** They are the decisions the independent design review (`sources/2026-09-02-fable-design-review.md`) proposed or forced. The review itself did not number them. Two anchors were fixed by the founder's task list before the range was filled: **D130** is the consent-surface finding (review §1.1) and **D139** is the C9 documentation correction. The remaining nineteen were ordered by the review's own priority. **Every D130–D150 entry is marked with a status**; "proposed" means the founder has not ratified it, and the review's argument is cited so it can be rejected on its merits.

**D130–D168 were briefly double-assigned on 2026-09-03, and this file's assignment is authoritative.** Two documents written in a chat session running in parallel with this consolidation — `2026-09-03-phase0-decisions-D130-D150.md` and `2026-09-03-kb-architecture-authoring-ux.md` — numbered their own content from D130 (the first as D130–D150, the second as D151–D168). Neither was on disk when this note was written; the founder's handover `2026-09-03-claude-code-handover-register-merge.md` (in `Downloads/`) carries a summary of the first and three corrections from the second, and §5.6–§5.9 below were merged from that summary. A reader who finds either document should treat every ID in it as void: §5.6 maps the first document's IDs onto this file, and its genuinely new content is D151–D160. **The second document was found on 2026-09-03 (night)** and is filed at `../kb/2026-09-03-kb-architecture-authoring-ux.md` — not in `sources/`, because it is the live KB architecture document rather than superseded material, and its §3 was rewritten against retrieved sources when it was filed. It carries a banner stating that its own IDs are void. **Its content is merged as D167–D192 in §5.11**, which supersedes §5.9. The first document (`2026-09-03-phase0-decisions-D130-D150.md`) is still not on disk; when found it goes into `sources/` verbatim and is not cited.

**Verification status.** Every vendor claim in D42–D129 was written without web access and carries `[VERIFY]`. The 2026-09-02 review researched most of them against primary sources; §10 maps each item to its answer. Where a claim below still says `[VERIFY]`, it is still unverified.

**No endpoint performance number has been measured.** Four measurements now exist in the project (the fourth, 2026-09-03 night: the 40-case bake-off through the B0 hub reproduces the direct path case for case — §10.3): the model bake-off (one machine, 40 hand-written cases), the prompt-prefix token count (D140) and a live prompt-cache verification on `claude-sonnet-5` (D161). Everything else is a target.

**All §2 constraints in the hub handover are single-source** from one design-partner meeting.

---

## 1. D1–D41 — reserved (workbook, not on disk)

| Range | Where | What is known |
|---|---|---|
| **D1–D41** | `ASK-IT-questionnaire.xlsx`, tab *Hub scope* and others; chat artifact only | The original register: invariants H1–H3e as first written, verified AWS pricing at the time, the model matrix, customer questions (question 18 is data residency). Referenced by `PROJECT_START_HERE.md` §5 and by the hub spec. |

Nothing in this range may be reassigned. If the workbook is recovered, its rows go here verbatim; if it is not, reconstruct from the hub spec (`2026-09-02-hub-server-side-spec-handover.md`) and the chat, and mark each row *reconstructed*.

---

## 2. Invariants

| ID | Rule | Status | Notes |
|---|---|---|---|
| **H1** | The playbook signing key never lives on the hub | Locked (D1–D41) | Review B1/H1: the rule must also cover *authority to cause a signature* — a hub that can drive a signing service is equivalent to a hub with the key (see C3, D134). |
| **H2** | The hub distributes policy; the endpoint enforces it | Locked (D1–D41) | Direction added by H4. |
| **H3** | No cloud credentials on the endpoint in joined mode (standalone is a bounded exception capped at R1) | Locked (D1–D41) | Device key is broker-side (D64), which is what makes H3 hold for the hub credential. |
| **H3b** | Playbook parameters are schema-constrained, never freeform | Locked | Review: the escalation payload is freeform model text that reaches a privileged human via the ticket path; H3b's scope is the executor. Recorded, not changed. |
| **H3c** | `toolConfig` is a schema-enforcement device, never an executor binding | Locked | Review: `whenNotToUse` is catalog prose fed to the model — the catalog review checklist must include "read the model-facing prose as a prompt". |
| **H3d** | Playbooks are typed primitives, never scripts | Locked | Review: tier must become a property of the playbook, not only of each primitive (three R1 steps can exceed one R2). |
| **H3e** | The model never authors the text a user consents to (the endpoint owns consent wording) | Locked | **Holds and is insufficient**: nothing says which *process* displays the text. See D130 — demonstrated 2026-09-03. |
| **H4** | Hub-supplied policy may only **narrow** endpoint capability, never widen it. Maximum risk tier and primitive allowlist are pinned at enrollment or carried in signed content. | **Proposed — not ratified** | Ratify with the amendments in D134: tier labels and consent text are part of the signed floor; the vendor catalog is the floor. Until ratified, C6 stands. |
| **H5** | Hub-supplied text that reaches the user is inert and attributed. Plain text only — no links, no HTML, no actions. Rendered in chrome visually distinct from the agent's own voice, attributed to IT, never spoken by the avatar as its own words. | **Proposed** | Second clause needed (D136): hub text entering the *model's* context is wrapped as data and never enters the system prompt. Shipped code speaks the escalation summary in the avatar's voice — a UX change H5 forces (X-5). |
| **H6** | Signed content carries a freshness bound (not-valid-after or minimum-acceptable-version) so an endpoint can detect staleness the hub never advertises. | **Proposed** | Detects but does not decide (D135): on expiry drop to the vendor floor catalog — never refuse (fleet outage) or merely warn (nothing prevented). Only not-valid-after can detect silence; a version floor cannot. |

**Why H4.** H1 stops a compromised hub signing new playbooks. H2 does not stop a compromised hub *widening the approved subset or raising the tier ceiling* using only correctly-signed content. H2 as worded is satisfied by an endpoint faithfully enforcing a policy telling it to do more. The invariant needs the *direction* stated.

**Why H5.** Announcements are hub-supplied text rendered inside a trusted taskbar agent — content, not policy, so H2 and H4 do not reach it. A compromised hub could push *"IT needs you to re-enter your password here"* to every endpoint without violating any invariant. The same gap exists in shipped code: escalations are not re-validated by the broker and the transcript speaks the owner aloud. H5 is H3e one layer out.

**Why H6.** A compromised or failing hub can harm by **omission** — never advertising a new version. Because H1 keeps the signing key off the hub, the hub cannot forge a fresher bound, so the endpoint can detect the silence.

**What the invariants do not cover (review B8, unchanged).** No threat model names the adversaries each invariant stops (OPEN-5). B1 found its gaps by writing the adversaries down.

---
## 3. Decisions D42–D90 (consolidated register of 2026-09-02, every ID +7)

Text as written on 2026-09-02, with IDs renumbered. Vendor claims carry `[VERIFY]`; §10.1 gives the answer the review found for each. Where a later decision amends a row, the amending ID is noted in §5.


### 3.1 Knowledge base

| ID | Decision |
|---|---|
| **D42** | Hub connection grants KB access for answering before escalation. KB answering is a first-class deflection capability, not a secondary feature. Read-only, needs no privileged primitive, covers ticket classes the four Win32 primitives cannot reach. |
| **D43** | **Customer KB is never stored at rest on the endpoint.** Retrieval is hub-side. Reasons: query embedding needs the network anyway (D44); articles carry read criteria requiring per-user entitlement at query time; withdrawn articles must stop being served immediately, and sync protocols handle deletions badly. |
| **D44** | Query embedding requires a network call. **There is no offline dense retrieval path.** Titan Text Embeddings V2 is Bedrock-hosted `[VERIFY]`; dense retrieval requires query and corpus embedded by the same model, so a local substitute returns noise, not degraded results. Consequence of the existing embedding decision, not a new choice. |
| **D45** | **Generic KB ships inside the signed catalog bundle.** Vendor-authored, no entitlement rules, no customer data — safe at rest. Reuses an existing signed, versioned distribution channel; no new signing story; H1 unchanged. |
| **D46** | The generic bundle is pushed proactively, not fetched lazily. The moment it is needed is the moment the hub is unreachable. |
| **D47** | **Offline capability = tier-0 routing + lexical search over the generic bundle. No model, no customer content.** Converges with what §7 already specifies for standalone mode. |

**Rejected and recorded dead:** hub embeds query, endpoint searches a local index. Needs the network
anyway, so delivers no offline capability while still placing the corpus on disk with the
entitlement and retraction problems intact.

### 3.2 Connectivity

| ID | Decision |
|---|---|
| **D48** | **No user-facing mode toggle.** Mode is machine state, broker-owned, written at enrollment, changed only by authenticated enroll/unenroll. UI displays mode and cannot set it. A user-operable toggle is a security downgrade triggered by a button press. It also has nothing to toggle *to* — H3 means a joined endpoint holds no local credential. |
| **D48a** | The unenroll path is security-relevant and must be authenticated, or the downgrade is relocated rather than closed. |
| **D49** | **Three connectivity states:** joined-and-reachable, joined-and-unreachable, standalone. Surfaced distinctly — a user shown a generic "offline" for both will escalate about the wrong thing. |
| **D50** | Connectivity is determined by an **authenticated heartbeat** that also carries policy and catalog version. Not a reachability check: captive portals return 200 to anything, and a TCP connect proves nothing about credential validity. Collapses three signals that can otherwise disagree into one. |
| **D51** | Hysteresis: enter offline after N consecutive failures, leave only on a successful authenticated call. Mid-session capability loss is stated to the user rather than silently degrading. |

### 3.3 Hub inference

| ID | Decision |
|---|---|
| **D52** | In joined mode the endpoint uses the hub inference proxy, with device identity as the credential. |
| **D53** | **Single combined call.** Endpoint sends conversation state and user turn; hub retrieves, assembles, calls the model, returns a **structured proposal**. Retrieved chunks never leave the hub. The two-call alternative moves customer KB content hub → endpoint → hub and lands it in endpoint memory. |
| **D53a** | **Redaction stays on the endpoint**, before the hub call. §9 requires redaction before egress regardless of destination; endpoint → hub is egress. Hub-side redaction means the text already left the machine and the rule is decorative. |
| **D53b** | **Tier-0 routing stays on the endpoint** with no hub dependency. Preserves the network-outage case — where the agent is most valuable and the hub least reachable. |
| **D53c** | Haiku→Sonnet escalation policy and per-tenant metering/caps move to the hub. Escalation is a cost decision; `modelId` is already tenant config. Neither is possible in standalone. |

**Boundary clarification.** D53 does not violate "the hub must not own the conversation loop"
*provided* the invariant reads as **model proposes / endpoint validates / broker executes**. The
endpoint still validates every proposal against the signed catalog, still owns consent wording
(H3e), still owns execution. Where prompt concatenation happens is not a security boundary. See C1.

### 3.4 User schema

| ID | Decision |
|---|---|
| **D54** | Introduce a **user identity** entity distinct from device identity. D43 entitlement and D68 ticket history both require it. |
| **D55** | Model on **SCIM 2.0 core + enterprise extension**, not ServiceNow `sys_user`. The `sys_user` field set maps near one-to-one onto SCIM `[VERIFY]` — not coincidence, since enterprises typically drive `sys_user` from AD/Entra, making it a derived copy rather than a source of truth. SCIM buys ServiceNow compatibility plus Okta, Entra and Jira. Same reasoning as §12's refusal to depend on a vendor's tool-calling dialect. |
| **D56** | **`sys_id` is not the primary key** — it is one entry in an external-correlation map alongside Jira account ID, Entra object ID. §2 says most customers lack ServiceNow; a `sys_id` PK gives them all a null key. |
| **D57** | Retain `manager` explicitly. Required for approval routing on R2+ actions and for access/license request categories — the ticket classes the four primitives cannot touch. |
| **D58** | The user table is PII (email, employee number, manager chain, location) and is in scope for §9 retention and residency. Schema-per-tenant makes per-customer deletion tractable. |

### 3.5 Customer-hosted deployment

| ID | Decision |
|---|---|
| **D59** | Customer-local hub deployment remains supported; §5's dependency discipline is what preserves it. |
| **D59a** | **pgvector is a stated deployment requirement** on customer-supplied Postgres. D43 puts the vector index on the hub and §5 permits only Postgres and object storage. A version-and-extension constraint on hardware we do not control — surfaces on install day if undocumented. |
| **D59b** | Infrastructure cost falls in a local deployment; **inference cost does not.** The only genuinely low-cost configuration is customer-hosted hub *plus* customer-hosted OpenAI-compatible endpoint (§12 tier 3) — which is best-effort and excluded from deflection commitments. So the cheapest, most privacy-attractive configuration is the one we cannot make quality promises about. Recorded as a commercial position, not a defect. |
| **D59c** | A **minimum telemetry set is a condition of support** for customer-hosted deployments. Otherwise: no deflection measurement, no debugging, and canary rings mean nothing across a fleet we do not operate. Retrofitting onto an installed base is unpleasant. |

### 3.6 Session model

*(Recovered — these were discussed and assigned D60–D65 in conversation, then that range was reused
for device auth. Renumbered here. All ServiceNow claims unverified.)*

| ID | Decision |
|---|---|
| **D75** | A **session is a first-class entity**, distinct from any ticket. A session may produce zero, one, or several tickets. Modelled as session ↔ task with a many-to-many link. |
| **D76** | **Adopt the shape, not the schema.** ServiceNow's Interaction Management is believed to model exactly this — `interaction` plus `interaction_related_record` `[VERIFY]`. Field names remain ours; the ServiceNow adapter maps onto their tables, the Jira adapter maps the task half and keeps sessions entirely our side. **Note the contrast with D55:** there is no SCIM for tickets — Jira, ServiceNow and Zendesk disagree and no interchange standard has won — so the argument against modelling on a vendor schema applies to users but not to tickets. Borrowing the abstraction is still correct; borrowing the schema is not. |
| **D77** | Model the **base `task` fields**, not incident-specific ones `[VERIFY]`. Their inheritance model indicates which fields are universal; category, subcategory and `caller_id` are incident-flavoured and belong in the adapter. |
| **D78** | **`opened_by` is not `caller_id`** `[VERIFY]`. Filing on a user's behalf means `opened_by` is the integration account and `caller_id` is the affected user. Getting this wrong breaks their reporting, assignment rules, and any SLA keyed to the caller. Second place where D54/D55 user identity becomes load-bearing — we must resolve our user to their user reference. |
| **D79** | `assignment_group` is tenant configuration, never inferred. |
| **D79a** | **"ServiceNow adapter" is at minimum two record types.** Access, license and software-install requests are catalog requests with a different workflow and approval chain `[VERIFY: sc_req_item under sc_request]`, not incidents. §14 item 5 is scoped as one adapter and is not. |
| **D79b** | Session records are **ours by default**; mirroring sessions into the customer's ITSM is a per-tenant opt-in that changes the consent wording. Mirroring means every conversation leaves the endpoint, not just escalated ones — a categorically different privacy posture from "we file a ticket when we cannot fix it," and it collides with §8's instruction to give egress its own risk tier and consent wording. |
| **D79c** | §8's correlation requirement (audit carries ticket ID, ticket carries audit IDs) **is the session↔task relationship drawn by hand.** Adopting D75 replaces a bespoke correlation scheme with a modelled relationship. |

### 3.7 Device authentication

The space splits into two questions usually collapsed: **what credential the device holds**, and
**how it is presented on the wire**. Deciding "mTLS" answers only the second and silently commits to
operating a CA.

| ID | Decision |
|---|---|
| **D60** | Device identity is an **asymmetric keypair generated at enrollment by the broker**, TPM-backed and non-exportable where TPM 2.0 is present. Public key binds to a hub device record. Bearer tokens as steady-state identity are excluded for the reason H3 exists. |
| **D61** | Authentication is a **signed assertion exchanged for a short-lived access token**, not per-request signing. D53 makes every turn a hub call; TPM signing per-request is too slow `[VERIFY: order of tens of ms]`. Short expiry delivers revocation without CRL machinery. Pattern is OAuth 2.0 client credentials with private-key JWT client auth `[VERIFY: RFC 7523]`. |
| **D62** | **mTLS is rejected.** Three reasons, any one sufficient: (a) corporate TLS inspection terminates the connection and cannot present a client certificate, requiring a per-customer exemption negotiated at every deployment `[VERIFY: prevalence — ask design partner directly]`; (b) customer-hosted hubs would need our trust store or their own CA; (c) §5's "every extra daemon is a pager" applies harder to PKI than to Redis — certificate expiry is a fleet-wide outage with a date on it. |
| **D62a** | **Consequence:** ALB mutual-TLS is removed from the verification register. Device auth is decoupled from AWS ingress and behaves identically hosted or self-hosted. |
| **D63** | **No-TPM fallback:** software key under DPAPI machine scope in broker-owned ProgramData. The hub records key-protection level as device state, because weak-path devices may be capped at a lower risk tier. |
| **D64** | The device key lives **broker-side**. The agent requests tokens over the existing named pipe and never sees the key. Pipe is ACL'd and the calling binary's signature checked. Blast radius is bounded — a token grants what the agent already has — but the check is cheap. |
| **D65** | Same abstraction maps to macOS Secure Enclave. v1 Windows work is not throwaway. |

### 3.8 Enrollment

| ID | Decision |
|---|---|
| **D66** | **An enrollment secret buys a pending record, not fleet membership.** A tenant-wide secret in the MSI is the credential most likely to leak; under this model a leak costs a spam queue, not a fleet breach. |
| **D67** | **Enrollment is the mechanism for standalone → joined conversion** (§7 requirement 1) and writes the broker-owned mode state (D48). Unenrollment is the only path back and is authenticated. |
| **D67a** | TPM attestation at enrollment deferred to v2 hardening. |
| **D80** | **Auto-approve is the default, with a per-tenant toggle to IT-approval-only.** Auto-approve still writes the pending record and then approves it — one code path, policy flag on the end. The queue becomes a permanent enrollment audit log rather than a mode. |
| **D81** | **Under D80 the enrollment secret is the security boundary**, so it must carry that weight: per-tenant, rotatable, time-boxed. An enrollment secret with no expiry is a permanent skeleton key. |
| **D82** | **The secret is not baked into the MSI.** Delivered as install-time configuration, so the installer binary is not itself a credential. Installers get emailed, dropped on shares, and posted to vendor portals. |
| **D83** | **Rate limiting and anomaly detection on the enrollment endpoint**, with automatic fallback to queued approval on anomaly. This is the safety net that costs IT nothing when nothing is wrong. |
| **D83a** | **Bulk revocation by enrollment batch** in the console. Under D61 revocation is a row delete and tokens expire on their own — make sure the console can act at batch granularity. |

### 3.9 Ticket history

| ID | Decision |
|---|---|
| **D68** | **Own-history retrieval is a live read-through query**, filtered to the requesting user, against the ITSM (integrated) or internal store (self-contained). No ingestion, no embedding, no corpus. Ticket data is high-volume, constantly changing, customer-owned and PII-dense; replicating it would put PII in a vector index and pull §9 retention across the whole corpus. Depends on OPEN-1. |
| **D69** | **Status readback uses customer-visible comments only. Internal work notes are never surfaced to the end user.** `[VERIFY: believed comments vs work_notes]`. Whatever the field names, the distinction is real and the default must be visible-only. Reading internal engineer commentary aloud to the user it concerns is a serious and easily-shipped failure. |
| **D70** | **Cross-user historical similarity is deferred**, pending entitlement research. Requires a searchable corpus of all tickets — embedding PII, replicating customer data, and an entitlement model over records that may include HR cases, security incidents, terminations and executive escalations. A project with a privacy review attached, not a feature. |
| **D70a** | If taken up later, the likely safe form is **retrieval over resolved-and-sanitised tickets promoted into the KB**, not raw ticket records. Converts an entitlement problem into a curation problem, which draft-and-approve already handles. |

**Why the split matters.** D68 is days of work and materially improves diagnosis and status
answering. D70 sounds similar and is not. Committing to both at once puts the cheap, high-value
feature behind the expensive, high-risk one.

### 3.10 System of record

| ID | Decision |
|---|---|
| **D84** | **The hub is the system of record for tickets unless an ITSM integration exists.** Where one exists, the ITSM is SoR and the hub reads through. |
| **D85** | **The SoR flip must be supported** — a customer running self-contained for months then connecting ServiceNow. Must not lose history, must not require reinstall or reset. Structurally the same problem as §7's standalone → joined conversion and deserves the same treatment. Currently undefined; the first customer to do it will be an escalation. Open sub-questions: migrate, orphan, or dual-read; and what happens to reports spanning the flip. |
| **D86** | **Self-contained mode requires outbound email.** With the hub as SoR there is no assignment group, no on-call rotation, no L2 queue — those came free with the ITSM. Needed: notification to an IT alias, status updates to the requester, probably inbound reply handling. **This is a third dependency** and §5's "exactly two stateful dependencies" framing needs updating rather than quietly breaking. Deliverability, bounce handling and inbound parsing are real work, and it must also exist in customer-hosted deployments. |
| **D86a** | Binary SoR is likely too coarse for real orgs (ITSM for one department; incidents routed to ITSM while low-value requests stay local). **Not built in v1**, but the schema must not foreclose it. |

### 3.11 Dashboard, reporting and deflection

| ID | Decision |
|---|---|
| **D71** | **The dashboard's differentiated content is session and deflection analytics, not ticket analytics.** Customers with an ITSM already have ticket reporting and it is a large part of what they pay for; ours will be worse. What no other tool can produce is sessions that did not become tickets. |
| **D71a** | This is reinforced by D84: session analytics are **uniform across both deployments** because that data is always ours, whereas ticket analytics are degraded (read-through, rate-limited, subject to their field customizations) exactly where the customer already has better reporting. Build the uniform half first. |
| **D72** | Dimensions: by user, by category, by time, by outcome, by risk tier of actions taken. "By outcome" and "by risk tier" are ours alone and are what an IT lead wants during a rollout. |
| **D87** | **Two views: IT-lead operational and buyer/exec ROI.** |
| **D88** | The exec view is a **renewal artifact** — exportable and schedulable (monthly PDF or email), because executives do not log into vendor tools. |
| **D89** | **Three session outcomes: resolved (user explicitly confirmed), escalated (ticket created), unresolved (everything else, including abandonment). Only confirmed-resolved counts toward deflection.** A session where the user asked, got an answer and closed the window is indistinguishable in our data from one where they gave up and walked to IT. Counting abandonment as deflection produces a bigger number and loses the room the first time a competent IT lead challenges it. Every exec-view number drills down to underlying sessions. |
| **D90** | **The agent must request end-of-session confirmation.** This is a client behaviour requirement created by D89 and is not currently written down anywhere. |

**Defining deflection is a commercial decision, not a metrics one.** D89 produces a smaller headline
figure that survives scrutiny, which is worth more than a large one that does not.

### 3.12 Internal ticket store

| ID | Decision |
|---|---|
| **D73** | **Promoted from §4 priority 3 to core.** It is the system of record for every customer without an ITSM, and §2 states that is most of them. **Resolves C4.** |

**Scope warning.** §5 rejected Zammad and Chatwoot as dependencies for sound reasons. Promoting the
internal store does not remove the requirements those products exist to satisfy — it relocates them
into our codebase where we also own the bugs. A store an IT lead will accept needs assignment and
reassignment, SLA timers on business calendars, queues and routing, email ingest with threaded
reply, attachments, audit history, search, saved views, bulk operations, and a permissions model.

**Recommendation:** define an explicit v1 subset in writing and defend it, rather than discovering
the list feature by feature. Plausible pilot subset: create, assign, state machine, comments split
by visibility (D69), attachments, search, dashboard. Everything else is a deliberate later decision.

### 3.13 Terminology

| ID | Decision |
|---|---|
| **D74** | **"Standalone" is overloaded and must be split in all documents.** §7 uses it for the endpoint deployment mode (local API key, capped R1, no hub). Later usage means the product operating without ITSM integration. These are independent axes — a fully joined fleet with no ServiceNow is hub-connected and ITSM-less. **Proposed terms: endpoint mode = standalone / joined; ITSM posture = integrated / self-contained.** Used consistently throughout this document. |


---

## 4. Decisions D91–D129 (2026-09-02, numbered as written)

Text as written. Cross-references of the form *D53 (was D46)* are the author's own +7 annotations and agree with §3. Invariants H5 and H6, first stated in this document, are in §2 above.

### 4.1 Bedrock removal

**Scope confirmed: Amazon Bedrock the service is out. Cloud inference is not.** The Anthropic API
direct remains available. Most of hub spec §11 becomes a provider swap rather than a redesign.

| ID | Decision |
|---|---|
| **D91** | **Amazon Bedrock is removed as the managed inference path.** Cloud inference continues via the Anthropic API directly. |
| **D92** | **Consequence — the model stack loses two of three members.** Nova Lite (vendor-diversity fallback) and the Bedrock routing for Haiku/Sonnet go with it. Haiku 4.5 and Sonnet 5 remain reachable directly. D53c (was D46c) — Haiku→Sonnet escalation on the hub — survives; only its transport changes. |
| **D93** | **Consequence — region choice is now free.** us-east-1 was selected because it was the only US commercial region with In-Region support across both the Anthropic and Nova families. That constraint is gone. **Region should now follow data residency** (OPEN-3), not model availability. Partly moots C5. |
| **D94** | **Consequence — hub spec §8 item 4 resolves itself.** §12's OpenAI-compatible adapter and §11's managed inference were described as two products. One of them no longer exists. §12 is now the only self-hosted path and the Anthropic API the only managed one. |
| **D95** | **Consequence — the largest unverified item in the project is retired.** Bedrock per-token pricing has been the missing denominator for the whole commercial case. It comes out of the verification register and out of the Fable prompt's Part A3. **A cost model is still required** — Anthropic API pricing now replaces it and is itself unverified. |

#### D96 — the embedding model is now undecided, and it is the most expensive open item

**Titan Text Embeddings V2 was Bedrock.** Hub spec §11 calls the embedding model the least
reversible decision in the system, and D42/D43/D47 (was D35/D36/D40) all rest on it.

This is **not** merely a substitution. D43 (was D37) recorded that query embedding requires a network
call *because* Titan is hosted-only, and D47 (was D40) set the offline floor at "no model, no
customer content" as a consequence. **A self-hostable embedder changes both.** A customer-hosted hub
could embed locally, and offline dense retrieval stops being impossible.

D44 (was D36) — customer KB never at rest on the endpoint — **survives regardless**, because its
other two arguments are independent of the embedder: entitlement must be enforced per-user at query
time, and withdrawn articles must stop being served immediately.

**Recorded as the top open item in the hub design.** Do not let it be settled by whichever library
gets imported first.

#### D97 — model selection is now a cost-and-latency decision, not a safety one

`BAKEOFF-2026-09-02.md` §2b: two catalog preconditions and a `whenNotToUse` tool-description field
took **R2 false actions to zero on all five models**, and raised accuracy on every one. That safety
improvement is **model-independent** and shipped as data.

| | correct | reaches user | s/correct |
|---|---|---|---|
| `claude-haiku-4-5` | **36/40** | 0 | 2.0 |
| `mistral-small:24b` | 35/40 | 0 | 1.7 |

**Haiku gained the most from hardening (32 → 36) and now leads on accuracy** while matching mistral
at zero false actions reaching a user. The gap is 0.3 s per correct proposal.

**Documentation conflict (C9).** BAKEOFF §1 still reads *"It beats the cloud model it would replace,
not merely undercuts it."* That was true of the pre-hardening table in the same file. After §2b it is
not. **§1 is the part that will be quoted.** Fix before it reaches a sales conversation.

This also corrects D59b (was D52b), which recorded the customer-hosted-model tier as quality-limited.
The real constraint is hardware: mistral-small needs 16 GB of VRAM, which most SMBs do not have.

---

### 4.2 Update distribution

Three channels with different privilege, cadence and risk. **Treating them as one update system is
the error**, because the third is dangerous and the first carries nearly all the value.

| Channel | Changes | Privilege | Sensitive to |
|---|---|---|---|
| Content — catalog, generic KB, policy | Often | None | Nothing |
| Agent binary — UI, avatar, model client, router | Sometimes | User | Restart |
| Broker binary — privileged Windows Service | Rarely | Admin | EDR, change control |

| ID | Decision |
|---|---|
| **D98** | **Design rule: anything that can live in signed content does. The broker binary stays as small and stable as possible.** The bake-off is the evidence — the entire R2-to-zero safety improvement shipped as two catalog preconditions and a tool-description field. No binary, no elevation, no EDR re-approval, no restart. The catalog is already the trust root (H3d); making it the update root follows. |
| **D99** | **The broker does not self-update.** A privileged Windows Service that downloads and executes code has a larger blast radius than every playbook combined, and is precisely the behaviour EDR exists to detect. It contradicts the design's own shape — typed primitives, no scripts, nothing freeform. |
| **D100** | **Broker updates ship as an MSI deployed through the customer's existing tooling.** Users have no local admin, so there is no other honest answer. This also routes broker changes through the customer's change process — the same process that grants EDR allowlisting. |
| **D101** | **The agent may self-update.** Unprivileged, user-scoped, changes often. Maps cleanly onto the existing two-process split. |
| **D102** | **The named pipe becomes a version boundary and requires protocol version negotiation.** Agent 1.4 against broker 1.2 must either work or refuse cleanly. Not currently designed anywhere, and it is what makes independent update cadences possible. |
| **D103** | **Content updates ride the existing mechanism** — signed bundle, version in the heartbeat, pushed proactively (D45/D46, was D38/D39). No new channel. |
| **D104** | **The hub advertises binary availability; it does not deliver binaries.** Endpoints must not fetch binaries from our origin — that breaks the customer-hosted isolation story and adds a firewall exception to every deployment. |
| **D105** | **User-facing update UI is status only**, in the Status destination (D116): current version, up-to-date or update-available, last checked. "Check now" forces a heartbeat and nothing more. **If an update requires IT, say so plainly** — never offer a button that fails on a machine where the user has no admin rights. |
| **D106** | **Heartbeat intervals are jittered.** A fleet checking on a fixed interval synchronises into a thundering herd. |
| **D107** | **D59c (was D52c) minimum telemetry must include hub version**, or a security advisory cannot be matched to exposed customer-hosted deployments. |

**Rollback asymmetry, recorded.** Rolling back a signed versioned catalog is trivial. Rolling back a
privileged service is not. A further argument for D98.

**Deferred:** SMB self-contained customers with no deployment tooling will eventually need a broker
updater. It is a second privileged surface with its own review. **Not v1**, and recorded so it is not
added casually.

---

### 4.3 Knowledge-base changes

**No, a KB edit does not require an app update — and under D44 it requires no distribution at all.**

| ID | Decision |
|---|---|
| **D108** | **Customer KB edits need no sync mechanism.** D44 keeps the customer corpus hub-side and live-retrieved, so an edited article is visible on the next query. No bundle, no signature, no version, no push. This is D44's payoff and it should be stated as such. |
| **D109** | **Generic KB edits ride the signed bundle** (D45) — vendor-authored, changes rarely, no customer edits. |
| **D110** | **The signed/unsigned line and the at-rest/live line are the same line.** Not a coincidence: content at rest on an endpoint must be signed because it is out of our sight; content fetched live over an authenticated channel need not be. |
| **D111** | **General rule: content that can cause an action must be signed. Content that can only inform need not be.** This is why KB edits are trivial and catalog edits are not — and why C3 (per-tenant signing versus H1) bites on playbooks but not on knowledge. |

#### D112 — the limitation this creates, stated plainly

**Customer KB content cannot be available offline.** Offline availability requires being at rest,
which requires signing (D110), which requires the vendor signing key (H1) — which is C3. So under the
current model, offline mode reaches generic articles only, never the customer's own.

A per-tenant customer-held signing key would resolve it and introduces key management at the
customer. **Not v1.** Recorded because customers will ask, and the honest answer is a design
consequence rather than an oversight.

#### D113 — "no distribution" is not "no work"

A KB edit still requires the hub to **re-embed and update the index**: change detection, incremental
embedding of the changed article only, and immediate vector removal on delete. That last one is what
makes D44's retraction argument true rather than aspirational. Full reindexing on every edit is not
acceptable and should not be how this gets built.

---

### 4.4 Notifications, announcements and alerts

Three classes with different delivery, entitlement and interruption semantics.

| Class | Audience | Urgency | Delivery |
|---|---|---|---|
| Ticket update | One user, their own ticket | Low | Poll |
| Announcement | Broadcast or segment | Low | Poll |
| Alert — user-impacting incident | Broadcast or segment | High | Latency-sensitive |

| ID | Decision |
|---|---|
| **D114** | **All three ride the heartbeat. No persistent connection in v1.** The heartbeat (D50, was D43) already carries policy and catalog version; add a content-version vector so the endpoint fetches detail only when something changed, keeping the hot path small. A persistent connection brings ALB idle timeouts, per-task connection ceilings and reconnect storms for latency the product does not need. |
| **D115** | **Heartbeat interval is a capacity parameter, not a UX one.** 5,000 endpoints at 60 s is roughly 83 req/s of pure heartbeat against one Fargate task and a `db.t4g.micro`. Interval, fleet size and hub sizing must be decided together. |
| **D116** | **Audience targeting reuses the user schema** (D54–D57, was D47–D50): department, location, manager chain. Those fields move from useful to load-bearing. |
| **D117** | **Interruption policy: badge always; toast only above a severity threshold; never steal focus; alerts auto-expire.** A taskbar agent that pops up unbidden is a known uninstall risk on this project. |
| **D118** | **Alerts require a fourth session outcome: `suppressed`.** D89 (was D82) counts deflection as confirmed-resolved sessions. An alert that prevents a ticket produces **no session at all**, so the highest-leverage deflection in the product is invisible to the metric. Measured as a proxy: ticket volume in the alerted category during an active alert versus baseline. |
| **D119** | **Alerts are the cheapest deflection per engineer-week in the product** — no conversation, no model call, no tokens. **Build order:** after ticket filing (specced in `PHASE1-TICKETING.md`, owed to the honesty ledger), but ahead of cross-user similarity (D70, was D63) and ahead of ticket charts in the dashboard. They are not a large piece of work: once the heartbeat exists they are a content-version field and a rendering surface. |

**Honest limitation, to be stated in the design.** Alerts matter most during incidents, and network
incidents are exactly when the hub is unreachable. *"The VPN is down"* cannot be delivered to people
whose VPN is down.

---

### 4.5 Client menu

**Principle: the menu is for state you check; the conversation is for problems you solve.** No menu
item for anything the conversation does better.

| ID | Decision |
|---|---|
| **D120** | **Four destinations: Chat (home), My Tickets, Notices, Status.** Chat is the home surface. My Tickets carries list, status and visible comments (D68/D69, was D61/D62), badged on update. Notices carries announcements and alerts, newest first, badged on unread with alerts pinned. Status carries connection state (D49's three states, was D42), mode, version and update status (D105). |
| **D121** | **Everything else is reachable by asking** — KB search, session history, "what did you do to my machine." Two badges are the entire notification UI. |

---

### 4.6 Conflicts found against `PHASE1-TICKETING.md`

| ID | Conflict | Status |
|---|---|---|
| **C9** | BAKEOFF §1 vs §2b — see D97. | Open. Documentation fix. |
| **C10** | **PHASE1-TICKETING §3 proposes an egress tier `E1`** — "sends data off this machine" as a capability class distinct from R1/R2. **D53 (was D46) makes every conversational turn an outbound hub call.** Either D53 needs an explicit exemption or E1 means nothing. | **Resolved — D125–D129.** |
| **C11** | **PHASE1-TICKETING §4 records an existing policy D53 may break:** computer name and username are deliberately *not* sent to the model. Under D53 the hub assembles the prompt. That line must be preserved explicitly in the hub contract, not assumed. | Open. |
| **C12** | **PHASE1-TICKETING §5 lands on a user profile "read from the machine and confirmed by the user on first run."** Adequate for filing a ticket. **Not adequate for D44 KB entitlement or D68 ticket history**, where a self-asserted editable profile lets a user claim to be someone else. Same field, two trust requirements. | **Open. This is OPEN-1 with a concrete fork in it.** |

#### D122–D124 — screenshots

Absent from the earlier register entirely. `PHASE1-TICKETING.md` §4 is adopted unchanged.

| ID | Decision |
|---|---|
| **D122** | **Screenshot handling per PHASE1-TICKETING §4**, adopted as written: exact image shown full size before approval, user-chosen window or region never full desktop by default, opt-in per ticket and never remembered, nothing captured until asked, audit records hash and dimensions but never the image. |
| **D123** | **Open question created by D53:** under hub-side prompt assembly, does an attached screenshot ever reach the hub as part of conversation state? §4 does not address it because it predates D53. **Must be answered before either is built.** |
| **D124** | **The consent pattern is reused, not reinvented** (PHASE1-TICKETING §2): propose → validate → show exactly what will happen → single-use token bound to a hash of the draft → execute → audit. A draft altered after approval cannot ride the old token. |

---

### 4.7 C10 resolved — egress

**The conflict was a category error.** R0–R3 measure **local disruption** — what breaks on this
machine if an action goes wrong. `reset_adapter` is R2 because it drops every connection including a
remote session. That scale says nothing about data. Egress measures **what leaves**: `file_ticket` is
near-R0 locally, changing nothing on the machine, while being the highest-consequence capability in
the catalog for data.

PHASE1-TICKETING §3 senses this — *"not R1/R2, which describe local disruption"* — then places `E1`
alongside them as a fifth rung. **Egress is a second axis, not another tier.**

**And D53 does not create egress; it changes the destination.** Standalone mode already sends the
conversation and machine-state block to a cloud provider on every turn — that is how the shipping
demo works. Joined mode sends the same material to the customer's own hub instead, which is the
better posture for a security-conscious buyer. "Every turn is egress" was already true before D53
existed. The hub made an existing fact visible rather than introducing a new one.

The real question is therefore not *does data leave* — it always does — but **does data leave that
the user did not author and cannot see.**

| ID | Decision |
|---|---|
| **D125** | **No per-turn approval for conversational egress. Decided.** Typing a message and having it sent is the thing the user asked for; consent is implicit in the act. |
| **D126** | **`E1` is dropped as a tier. `egress` becomes a declarative catalog property** valued `none` / `hub` / `third-party`, per capability, orthogonal to R0–R3. It rides the signed catalog, inheriting the trust root, the signing, and the same precondition machinery that took R2 false actions to zero. New property, existing enforcement path. |
| **D127** | **Session-scoped disclosure for conversation.** One clear statement at session start and permanently in Status: *"What you type and your machine's network status go to your company's Matic Desk hub."* In standalone the string names the provider instead. |
| **D128** | **Per-action consent for assembled payloads** — anything containing data the user did not author in this session (machine diagnostics, transcript history, profile, screenshot). This is where PHASE1-TICKETING §6 step 3 belongs, and its wording *"Sends data off this machine"* stands. **The destination is shown, not just the fact** — "your company's hub" and "Anthropic" are materially different to a user and to a security reviewer, and mode determines which. |
| **D129** | **The broker mints and audits; the agent transmits; the hub verifies.** PHASE1-TICKETING §3 recommends extending the broker to file tickets. The instinct — one consent flow, one audit log — is right, but it puts an HTTP client, TLS configuration and destination handling inside the privileged service, which **collides with D98**. Instead: the broker validates the draft, mints a single-use consent token bound to the payload hash, and writes the audit record; the agent performs the send. **The broker never opens a socket.** The agent could in principle send something other than what was approved — closed by the hub rejecting any payload whose hash does not match the token. The hub becomes the integrity check at no cost, because the payload is going there anyway. Ticket filing is joined-only, so a verifier always exists. |

**Cost of being wrong.** If the two-axis model is wrong it errs permissive about conversational
egress — a customer whose security team objects to *any* conversation leaving the endpoint. That
customer's answer is a self-contained hub, which the architecture already supports. The failure mode
has a product answer, not a redesign.

**What would change this:** a design partner stating users must approve each turn. Worth asking
alongside the TLS-inspection question, though it is not how anyone uses a chat interface.


---

## 5. Decisions D130–D150 — from the independent design review (2026-09-02/03)

Source: `sources/2026-09-02-fable-design-review.md`. Section references (§1.1, A3, B4, C.3 X-2, …) are to that file. **Status key:** *done* — carried out and verifiable in the repo; *decided* — the review's finding is a fact, not a choice; *proposed* — needs the founder's ratification; the review's argument is cited so it can be rejected on the merits.

### 5.1 Endpoint trust boundary

| ID | Decision | Status | Source and forcing reason |
|---|---|---|---|
| **D130** | **The privileged half must be able to prove the user saw the text it acts on.** In Phase 1 the consent card is drawn by the unprivileged agent and the broker mints a token for whatever proposal arrives on the pipe. Rule: *the broker executes only what the user was shown.* Cheapest honest form: the broker renders the consent text (from the signed catalog's `plain/*`) and returns it with a nonce; the approval binds to the nonce; the broker refuses any approval whose nonce does not match what it issued; the audit record stores the broker-rendered text. Strong form: a broker-owned consent window in the user's session (as UAC and credential prompts do). **Phase 1 design item, not hardening.** | **Proposed; the gap is demonstrated.** `client/test/consent-surface.test.mjs` (2026-09-03) drives it end to end against a stub `NamedPipeBroker` in a separate process on a real named pipe: `flush_dns` displayed, `reset_adapter` sent, token minted, executed, audited as a consented success — every gate and every invariant holding. The same file carries the acceptance test as three expected failures; it exits 1 the day they pass, which is the signal to promote them. Write-up: `../../client/docs/CONSENT-SURFACE-2026-09-03.md`. **Design filed 2026-09-03:** `../../client/docs/2026-09-03-consent-protocol-design.md` — a two-step protocol: `prepareConsent(proposal, {locale})` returns a nonce plus broker-rendered text; `execute(nonce)` runs the proposal the **broker retained** against that nonce, so the agent never supplies a proposal at approval time and the substitution has no surface. It changes `broker.d.ts` (`ConsentToken` stops crossing the boundary; `Gate` gains `consent`; `AuditRecord` gains `consentNonce` and `consentRendered`) and **must be settled before the `NamedPipeBroker` pipe protocol is written** — retrofitting a two-step exchange into a one-call protocol is the expensive version. Acceptance: the three XFAILs plus five checks (its §6; listed in the test file's header). **Its §8 flags that the `execute(nonce)` variant — retain the proposal, rather than the review's hash comparison — is the author's proposal and has had no second opinion**; worth one before implementation. **Implemented 2026-09-03 (night) in `InProcessBroker`** after a deliberate attack on the retain-the-proposal variant (`../../client/docs/2026-09-03-consent-protocol-attack-notes.md` — verdict: holds; two implementation requirements found, F1 clone-on-retain and F2 supersede-and-audit, plus the `precondition`/`machine-state` gate naming drift F5). The three XFAILs passed and were promoted to hard checks; the five §6 additions pass; `client/test/consent-surface.test.mjs` is 37 hard checks, 0 XFAIL. `main.js` exposes `broker:prepareConsent` and `broker:execute`; `consentAndExecute` is gone from the IPC surface and from the pipe stub. The `NamedPipeBroker` protocol can now be designed around the two-step shape. Status: **done** for the in-process build; the strong form (broker-owned window) stays deferred per design §5. | Review §1.1, B1/H3e scenario 2, C.7. D129's hub-verifies-the-hash trick solves display integrity for *egress* (a verifier exists) and cannot be reused for the four local actions (the broker is both the party that must be convinced and the party that acts). |
| **D131** | **The broker attests its posture.** The assertion the broker already signs with the device key (D61) carries **broker version, catalog hash, catalog-signature-verified flag, TPM present, key-protection level**. The hub gains a "minimum broker version" policy — narrowing, H4-legal — that disables capabilities on stale brokers instead of negotiating around them. The agent-sent heartbeat (D103) is not evidence of broker version; the agent can say anything. | Proposed | §1.2, B4, X-2. One field set, no new mechanism; it is what makes D107's telemetry and any canary ring real. |
| **D132** | **Access-token lifetime is a security parameter, not a tuning one.** Revocation latency equals it (D61 + D83a). Set it in the same decision as the heartbeat interval (D115). Sign once per session to mint a short-lived token, not per request; serialise TPM access. | Proposed; **values proposed 2026-09-03 — see the table under this section**, and §8 | X-3; A5 Q1b: TPM P50 ~200 ms / P95 ~600 ms means the exchange can run every few minutes at no cost. |
| **D133** | **Update model: one per-machine installer for both halves; the pipe carries a single protocol version and refuses a mismatch, logging the refusal to the hub.** The agent does not self-update in joined mode. The broker may be the updater: fetch the vendor-signed MSI from the origin the hub advertises (a customer-hosted hub may serve it from its own object store — no firewall exception, no contact with our origin, no hub signing anything), Authenticode-verify against a publisher pinned in the previous MSI, run `msiexec` as SYSTEM with major-upgrade semantics and `afterInstallInitialize` rollback. Customer-tooling deployment (D100) remains the first install and an opt-out for customers who insist, who accept divergence risk in writing. **Standalone mode gets the same updater**, otherwise standalone brokers never update (R-9). | **Proposed — amends D99, D101, D102, D104.** D99 is defensible for the design partner (Intune, quarterly change windows) and wrong as the product default. | B4, Part B addendum items 1 and the D99 engagement, R-9, A5 Q4. Every major endpoint agent updates itself as SYSTEM; Intune documents a flag precisely for self-updating apps; EDR allowlisting by certificate survives updates, which removes D100's allowlisting argument. |

#### D132 — proposed parameter values (2026-09-03)

D132 sets the principle and did not record the values. These come from the parallel Phase 0 document's timing table (its own D137), carried by the founder's handover of 2026-09-03 §1a. **Proposed**; §8 points here.

| Parameter | Value | Basis |
|---|---|---|
| Access token lifetime | 5 minutes | Equals revocation latency (D61 + D83a) |
| Heartbeat interval | 60 s, jittered ±15 s | Alert latency adequate for D114; jitter per D106 |
| Consecutive failures before offline (`N`, D51) | 3 | ~3 minutes; survives a transient VPN drop |
| Assertion clock-skew tolerance | ±120 s | Review B8 flagged clock tolerance as unspecified |
| Replay window | 60 s, server-supplied nonce | Mitigates the inspecting-proxy case (D146: the proxy sees the token) |

**Capacity consequence.** 5,000 devices on 5-minute tokens is ~17 token exchanges per second, each needing a device-status check. Against ~80 usable connections (D142) that lookup **must be cached in the Fargate task**, alongside the content-version vector (D114). Heartbeats at 60 s add ~83 requests per second (D115). The two are sized together, as D132 requires.

#### D133 — conflict with the parallel document, resolved 2026-09-03 in favour of D133

The Phase 0 document's D101/D102/D140–D143 shape had the agent self-updating independently, the pipe negotiating protocol versions, a mode-conditional self-update and an enrollment version-baseline check. **D133 is taken.** One installer moving both halves atomically eliminates version skew, which deletes the protocol negotiation, the enrollment baseline collision and most of what made the mode flag security-relevant. The founder's standalone self-updater, decided the same day, layers on top of D133 rather than replacing it — **D151** (§5.7).

### 5.2 Invariant amendments

| ID | Decision | Status | Source and forcing reason |
|---|---|---|---|
| **D134** | **H4 is ratified with two amendments, and C3 is decided rather than probable.** (a) The vendor-signed catalog is the floor: preconditions, blocklist, **tier labels and consent text** are part of it and a tenant delta cannot change them (relabelling `reset_adapter` R2→R1 through tenant policy is otherwise not forbidden by H4's words). (b) A tenant delta may add preconditions, remove capabilities and raise tiers, and may not do the inverse. Consequence stated for sales: **customers select and constrain vendor playbooks; they do not author them.** Customer-held signing keys (D112's idea) are the eventual answer for tenants who insist. | Proposed | C.0 item 2, C3, B1/H4. Also note narrowing can still harm: remove every R1 network remedy and the model's only lever is R2. |
| **D135** | **H6 decides as well as detects: on expiry the endpoint drops to the vendor floor catalog** (long validity, shipped in the MSI, signed offline). Never refuse (a hub outage becomes a fleet outage) and never merely warn (nothing is prevented). Use not-valid-after, not a version floor — the floor arrives inside the content the silent hub is not sending. Dropping to the floor is narrowing, so it is H4-legal. Requires the floor to be good enough to run on alone (D149). | Proposed | B1/H6, Part B addendum. Clock skew against corporate NTP is recorded, not solved. |
| **D136** | **H5 gains a second clause and forces one UX change.** Hub-supplied text (KB chunks, announcements, ticket updates) enters the model's context only inside a provenance wrapper the prompt treats as data, never as instruction, and never enters the system prompt — a mitigation, not a guarantee, and the design says so. In joined mode the escalation `summary` is **not spoken as the avatar's own words**; it is rendered as attributed IT chrome. Attribution must be audible where TTS is used. The hub must be structurally unable to forward `work_notes` (D145). | Proposed; the UX change appears on no build list | B1/H5, X-5, Part B addendum item 3. Under D53 the hub authors the model's whole context; H5 as written protects the broker from hub text and not the model, which is the component that turns text into proposals. |
| **D137** | **The egress consent predicate is audience change, not authorship.** Data needs per-action consent when it is about to reach an audience the user did not address it to. Machine state and transcript to the inference proxy: session-scoped (the user asked the assistant to look). Transcript or summary into a ticket or into persistent interaction history a fulfiller can open: per-action. Screenshot: per-action (unbounded audience). **Supersedes D128's "data the user did not author" predicate; D79b wins X-1 over D127.** A session needs a defined **start** as well as its end (D89/D90): the user opens the panel and sees the D127 disclosure; idle timeout ends it. | Proposed | B3, X-1, §1 "the one place what was asked for is not what is wanted". `PHASE1-TICKETING.md` §4 already says the user's own words leaving the machine must be visible in the validation step; D127 says the opposite. |

### 5.3 Cost, hosting and region (facts from Part A)

| ID | Decision | Status | Source and forcing reason |
|---|---|---|---|
| **D138** | **The cost model is rebuilt before any hosting commitment.** Anthropic **Scale tier** is a commercial prerequisite (monthly spend cap binds before rate limits: $500 Start, $1,000 Build, $200,000 Scale; one hour of a 1,000-RPM Haiku storm is ~$360 uncached; the cap returns 429 with no `retry-after` until month start; Scale is reached by usage history plus a Console request, not by payment). Per-tenant **workspaces** with spend limits and archive as kill switch (caches are isolated per workspace — the cross-tenant prefix cache is forfeited). Admission control from rate-limit headers; per-tenant and per-device token caps per day. Pricing confirmed standing: Haiku 4.5 $1/$5, Sonnet 5 $2/$10 per MTok, cache read 0.1×. No SLA at any purchasable tier; observed 90-day uptime 99.54%. | **Decided (facts)**; the rebuilt model is not yet written | §1.3, A3 Q1–Q5, C7. Replaces the Bedrock denominator D95 retired. |
| **D139** | **C9 documentation correction: the managed tier's model is `claude-haiku-4-5` (D97); `mistral-small:24b` is the customer-hosted pick, hardware permitting.** After §2b hardening Haiku scores 36/40 to mistral's 35/40, both at zero false actions reaching a user; mistral is 0.3 s faster per correct proposal. "Beats the cloud model" was true of the pre-hardening table only. Corrected on 2026-09-03 in `BAKEOFF-2026-09-02.md` §1, `HANDOVER-2026-09-02-post-demo.md` §4, `LOCAL-MODEL-PROVIDER.md` §3 and `PROJECT_START_HERE.md` §2. The GPU-cost incompatibility (R-7) therefore applies to the customer-hosted tier only; `[VERIFY]` GPU instance pricing was not researched. | **Done 2026-09-03** | C9, D97, §1.3 row 5, Part B addendum item 4, C.2. |
| **D140** | **Prompt caching does not work on the routine model as shipped, and is not attempted.** Measured 2026-09-03 with `messages.count_tokens` (`client/eval/count-tokens.mjs`, `npm run count-tokens`): on `claude-haiku-4-5` the cacheable prefix — system prompt 319 tokens plus tools and tool-use overhead 1,784 — is **2,104 tokens** with `tool_choice: any` (2,012 with `auto`); a full shipped turn is 2,261. Haiku 4.5's minimum cacheable prefix is **4,096**, so the prefix is short by **1,992 tokens** and `cache_control` would silently do nothing. The review's 4-chars/token estimate (~2,000) was right in direction; the real ratio is 2.8 chars/token. On `claude-sonnet-5` the same prefix is above its 1,024-token floor (see `../../client/docs/TOKEN-COUNT-2026-09-03.md` for the number). **Separately: `client/src/agent/cloud-client.js` sets no `cache_control` at all, so caching is not attempted on any model today.** Options: pad the stable prefix past 4,096 (cheap in dollars: ~2,000 extra tokens written once per cache window, read at 0.1×) — but the prompt is shared with the local-model provider and the bake-off compares prompt wordings, so padding must be Anthropic-path-only and must not change model behaviour; or write caching off for Haiku and size the cost model uncached. | **Measured; decided 2026-09-03 — D161:** cache where the prefix reaches the model's floor (Sonnet-class), do not pad Haiku, revisit on volume | §1.3 row 2, A3 Q2d, verification register row "1.3, A3 lead". |
| **D141** | **Region: us-east-2 unless residency question 18 says otherwise — and residency is now an Anthropic model-and-provider question, not an AWS one.** Every Phase 1 line item (db.t4g.micro $0.016/hr, ALB, Fargate ARM, public IPv4, gp3, RDS Proxy) is priced identically in us-east-1 and us-east-2; us-east-2 has no entries on AWS's post-event-summary list against ten for us-east-1. `inference_geo: "us"` is **rejected on Haiku 4.5** (4.6-and-later only); there is no EU inference or EU at-rest on the first-party API; ZDR is sales-gated per org; default retention 30 days. So a US-only tenant cannot use the routine model as certified and an EU tenant cannot use the first-party API at all. **Go back to the design partner with those two sentences.** Resolves C5; reframes OPEN-3. | Proposed (region); decided (facts) | A3 Q3, A4 Q1–Q3, C5, C.4 OPEN-3, D93. |
| **D142** | **The free-tier assumption is dropped.** The 12-month RDS free tier is a legacy offer for accounts activated before 2025-07-15; a new account gets $100 in credits, up to $200, and a Free-plan account closes after six months. Budget **~$46/month from month one** on the Paid plan with $100–200 of credits against it. `max_connections` on db.t4g.micro is ~80–90 usable; a pooler is not forced at Phase 1 if each task caps its pool near 10 and tasks stay at four or fewer; RDS Proxy would cost $21.90/month, nearly twice the database. | Decided (facts) | A4 Q1–Q2, D115. |

### 5.4 Hub architecture

| ID | Decision | Status | Source and forcing reason |
|---|---|---|---|
| **D143** | **C2 has a third option and it is taken: a shared control-plane schema (tenants, devices, enrollment queue, releases, job queue) plus per-tenant data schemas.** The worker takes the tenant schema from the job row and asserts it before every query. Per-tenant queue tables need N pollers, which do not fit ~80 usable connections (D142). | Proposed — **unblocks the first migration** | R-2, C.1 C2, A4 Q2. |
| **D144** | **Embedding (resolves the direction of D96): one self-hostable Apache-2.0/MIT embedder, run by us in managed mode and by the customer in customer-hosted mode via the Hugging Face TEI CPU image**, so the two tiers share one vector space and migration between them needs no re-embed. Candidates: nomic-embed-text-v1.5, arctic-embed-m-v2.0, gte-base/large, Qwen3-Embedding-0.6B, voyage-4-nano. Anthropic has no embeddings API. Re-embedding 10,000 articles is ~12M tokens: under $3 hosted, minutes to hours on CPU — "least reversible" was overstated; the real switching costs are operational. On db.t4g.micro do not run HNSW for more than one ~25k-chunk tenant; use Matryoshka truncation or `halfvec`; budget a larger instance for the second tenant. A 100–350M embedder on the *endpoint* is 100 MB–1.4 GB and collides with hub spec §2; D96 therefore enables offline dense retrieval of the generic KB only, and only if §2 is renegotiated. | Proposed | A1, R-6, Part B addendum (D96 and A1). |
| **D145** | **ServiceNow adapter facts, from primary documentation.** Build the session model on `POST /api/now/table/interaction` with the `interaction_agent` role; treat the dedicated Interaction Management API as unavailable until tested. `interaction` almost certainly does **not** extend `task` `[VERIFY on instance]` — no `correlation_id`, task SLAs or task ACLs. Never request journal fields on task-table GETs; read customer-visible updates only from `sys_journal_field` with `element=comments` hard-coded; **give the integration account a role without `itil`** so `work_notes` are ACL-denied at the source regardless of hub bugs. Query child tables, never `task`; HR (`sn_hr_core_case`), SecOps (`sn_si_incident`), GRC and Legal are `task` children in their own scopes; the legal table is `sn_lg_ops_request`, not `sn_legal_request`. KB entitlement: declarative User Criteria can be evaluated offline, scripted criteria cannot (Microsoft's connector treats them deny-all); either proxy per user via `/api/sn_km_api/knowledge/articles` or fail closed on any KB with scripted criteria. The hub is a **SCIM 2.0 service provider** receiving pushes from the IdP, not a puller (pulling needs admin-equivalent `scim_admin`). Set `caller_id` explicitly; `opened_by` is the integration account. | Decided (facts) `[VERIFY]` where marked | A2 Q1–Q7, C.5. Amends D69–D71, D75–D77 (was D62–D64, D68–D70). |
| **D146** | **Device authentication stands on documentation, not statistics, and gains three details.** Zscaler documents mutual TLS as unsupported under inspection; Palo Alto auto-excludes a destination for 12 hours after a client-auth failure; Microsoft exempts its own agents — so D62 (mTLS rejected) holds without a prevalence survey. A signed device token over ordinary TLS survives inspection with two consequences: the proxy sees the token (sign a server nonce, short lifetimes, audience binding) and **the agent must not pin the hub certificate** (validate against the OS store). Publish a stable FQDN list. TPM key details for D60: create it with **no TPM authorisation value** so Windows Hello lockouts do not block the broker `[VERIFY: PCP default]`; never create it inside `StartService`; detect duplicate public keys across devices (cloned vSphere VMs share one vTPM); record TPM vendor and firmware at enrolment and gate trust on it (old Intel fTPM leaks ECDSA nonces). TPM 2.0 is universal on Windows 11; ~30% Windows 10 residue (consumer-weighted) needs a "TPM required" statement or D63's software-key tier. | Decided (facts) | A5 Q1–Q2, X-6, C.5. |
| **D147** | **Build-pipeline requirements from EDR research.** Sign broker and agent with an **RSA** code-signing certificate (App Control signer rules do not support ECDSA). Keep every broker binary and native DLL under `%ProgramFiles%` (path rules are honoured only for admin-writable paths). Ask customers for **certificate/publisher rules, never hash rules** — Microsoft's own docs say hash exceptions break on every update. Ship the agent's DLLs separately from the broker's so Windows Installer can restart the service without a reboot. Electron/koffi as an EDR false-positive class: no authoritative source; treat as unknown. | Decided (facts) | A5 Q3–Q4. |
| **D148** | **OPEN-1 resolution: the broker attests the logged-on user.** The broker runs as LocalSystem and reads the interactive session's logon SID (`WTSQueryUserToken` / `WTSQuerySessionInformation` `[VERIFY against learn.microsoft.com]`) and puts it into the assertion it signs with the device key (D61). The hub maps SID → IdP object via SCIM (`externalId` or the on-premises SID attribute Entra syncs). No interactive sign-in, no self-asserted profile; the claim is made by the privileged half. Shift-worker machines are handled because the SID changes with the session. C12's first-run profile becomes display-only. | Proposed | C.4 OPEN-1, C12. |

### 5.5 Scope and documentation

| ID | Decision | Status | Source and forcing reason |
|---|---|---|---|
| **D149** | **Endpoint stays phase one; hub-distributed privileged content becomes phase two.** Freeze the four-primitive catalog as a vendor-signed static bundle shipped inside the MSI. The first hub is **identity + inference proxy + audit ingestion + tickets (internal store, D73) + KB retrieval + email (D86)** — not catalog distribution, per-tenant catalogs, release channels, canary rings or a tenant policy engine. H1, H4 and H6 then have nothing to bite on in phase one because nothing privileged moves over the wire. The register's §6 estimate is rebuilt against this scope. **What would change it:** the ticket export showing resolvable network/service faults under roughly one in ten L1 tickets (then the chat surface is phase one alone), or the design partner's security team refusing a third-party privileged service under any allowlisting. | Proposed | B5, B6, B7 (item 1 alone is 6–8 engineer-weeks, in the range the spec gave for the whole hub), X-7, C4. |
| **D150** | **One checked-in decisions directory; one register that owns its numbering; every handover and prompt references it by relative path.** This file. Sources are kept verbatim under `sources/` and are not to be cited. New decisions are appended here with the next free ID; nobody renumbers. A handover that names a document without a path is a defect (the ollama brief and this register were each "missing" while present on disk). | **Done 2026-09-03** | Review §0.2, D91 file §0. |

---

### 5.6 The two parallel documents of 2026-09-03 — ID mapping

Written in a chat session in parallel with this consolidation (§0), `2026-09-03-phase0-decisions-D130-D150.md` numbered its own content from D130. Its IDs are void; this table maps them. Where this file's version cites primary documentation and the chat version did not, this file's wording was kept. Merged 2026-09-03 from the summary in the founder's handover `2026-09-03-claude-code-handover-register-merge.md`, because the document itself was not on disk.

| Phase 0 document ID | Topic | In this file | Action taken |
|---|---|---|---|
| D130 | broker-rendered consent | **D130** | Same. This file's wording stands; the design is filed (see D130's status). |
| D131 | broker-attested SID | **D148** | Duplicate — chat ID discarded |
| D132 | audience-change predicate | **D137** | Duplicate — discarded |
| D133 | shared control-plane schema | **D143** | Duplicate — discarded |
| D134 | H4 + amendment | **D134** | This file's version is broader (two amendments, decides C3) — kept |
| D135 | H6 vendor floor | **D135** | Same |
| D136 | broker posture in the assertion | **D131** | Duplicate — discarded |
| D137 | timing parameters table | **D132** + the table under §5.1 | The principle was here; the values were not — added 2026-09-03 |
| D138 | phase-one hub scope | **D149** | Duplicate — discarded |
| D139 | C9 documentation fix | **D139** | Same |
| D140–D143 | self-updater: agent self-updates independently, pipe negotiates protocol versions, mode-conditional update, enrollment version baseline | conflicts with **D133** | **Resolved in favour of D133** (note under §5.1). The founder's standalone self-updater is **D151**, layered on D133 |
| D144–D150 | hub admin model | **D152–D160** | New — nothing in this file covered it (OPEN-6 was open) |

The second document, `2026-09-03-kb-architecture-authoring-ux.md`, used D151–D168. Those IDs are void too. **It has since been found and merged: the full mapping is §5.11a and the decisions are D167–D192 in §5.11c.** §5.9 is the record of what survived while it was missing.

### 5.7 D151–D160 — standalone self-updater and the hub admin model (2026-09-03)

D151 is a founder decision of 2026-09-03 (handover §1b). D152–D160 are §4 of the Phase 0 document as summarised in the handover §1c; that handover said *record*, not *ratified*, so they carried **proposed** until **2026-09-04, when the founder ratified all nine as a set, as written**. The note below keeps the finding that produced that ratification, which outlives it.

> **D152–D160 RATIFIED AS A SET, AS WRITTEN, BY THE FOUNDER ON 2026-09-04.** No text changes.
> Ratification note: `sources/2026-09-04-ratification-D152-D160.md`. **This was a separate act from
> B1's ratification, which happened the same day** — and that distinction, not the ratification
> itself, is what this note exists to preserve.
>
> **What was found while ratifying, and was not looked for: B1's ratified schema already implemented
> these shapes.** `server/migrations/control/001-control-plane.sql` had already run against a real
> PostgreSQL and contained `admin_users.totp_secret` (D156); `admin_users.external_issuer` /
> `.external_subject` (D159, D160); `admin_roles`, `admin_role_grants` and `admin_roles.scope`
> (D152); `admin_audit.event_class` valued `break-glass` / `vendor-access` (D155, D156);
> `admin_audit.step_up` (D157); and `vendor_access_grants` with `level` and a window, plus the
> CHECK constraint `vendor_transcripts_need_a_window` (D153, D154).
>
> **That was not a defect and nothing needed undoing.** The shapes are free now and expensive later,
> which is D160's own argument and exactly what D160 asked for, and B1 was scoped to establish shapes
> rather than features — none of those tables had logic behind it. **But ratifying B1 was never
> evidence that D152–D160 were accepted, and the built schema must not be read as though it were.**
> That exact inference had to be corrected once already in §5.12. A reader in six months should be
> able to see that the distinction was drawn rather than assumed, which is why it survives here after
> the ratification that made it moot.
>
> **The guard against the pattern now lives in the SQL, not in this register** — §5.7b. Where a
> migration implements a decision, the SQL names the decision and the status it held *at the time
> that migration was written*.
>
> **D158 is ratified but inert in Phase 1 — do not build for it.** Author ≠ approver governs catalog
> changes; D149 deferred catalog distribution out of Phase 1, so there are no drafts to approve and
> nothing for the constraint to act on. It is the one decision in the set with no table behind it,
> which is the correct signal. **If B2 begins building an approval workflow, that is Phase 2 scope
> arriving through the back door and should be stopped rather than absorbed.**
>
> **One dependent item is proposed and NOT ratified: D202** (§5.7a). It blocks nothing — the
> `step_up` column is indifferent to what is on D157's list.
>
> §5.11c previously advised ratifying the KB set "alongside OPEN-6". Both sets were ratified
> separately on 2026-09-04, so that pairing is void as guidance, and neither set's status may be
> inferred from the other's.

| ID | Decision | Status | Source and forcing reason |
|---|---|---|---|
| **D151** | **Standalone endpoints self-update by fetching and running the one per-machine installer (D133), so both halves move together.** Joined endpoints update through customer deployment tooling (D100) and are the default. The check is at **runtime, not install time**: enrollment writes the mode state (D48, D67) and happens after install, so every fresh install is standalone and becomes joined later — one binary with a live mode check, not two install paths. The updater accepts **only an installer signed with our publisher certificate, fetched from a pinned URL**, which bounds the worst case of the mode flag being flipped on a stolen offline device to an unwanted genuine upgrade, not arbitrary code. **The path must be deliberately exercised:** if joined is the default and the design partner is joined, the self-updater never runs in the pilot and reaches production only on standalone SMBs — the customers least able to resolve an EDR false positive, and the EDR argument applies identically in standalone. Requires a test ring that runs standalone on purpose. | **Decided by the founder 2026-09-03.** Layers on D133 (still proposed) rather than replacing it; supersedes the parallel document's D101/D102/D140–D143 shape. Narrows D99's absolute ("the broker does not self-update") for standalone mode and retires §4.2's "deferred" note on an SMB broker updater. | Founder handover 2026-09-03 §1b; D133; R-9 (standalone brokers otherwise never update). Consequence: **OPEN-8** — build-pipeline integrity now blocks shipping standalone. |
| **D152** | **Five hub actors, not one:** vendor staff, tenant owner, tenant admin, IT agent/fulfiller, auditor/security. Every earlier document treats "admin" as a single role. Roles carry permissions; permissions never attach to users directly. | **Ratified as a set by the founder 2026-09-04** | Phase 0 document §4 via handover §1c; OPEN-6. |
| **D153** | **Vendor access is the highest-privilege position in the system and was previously unconstrained** — nothing in the invariants stopped a support engineer reading employee transcripts across every customer. Vendor access becomes a **time-boxed grant the customer enables**: default off, expires, visible to the tenant while active. Metadata, error state and version only; transcript content requires an explicit grant naming a window. **Self-hosted hubs default to no vendor access path at all.** | **Ratified as a set by the founder 2026-09-04** | Same source. This is OPEN-5's "vendor insider" adversary given a control. |
| **D154** | **Transcript access follows the audience-change predicate (D137). Three tiers:** aggregate metrics (any admin); transcripts of **escalated** sessions (ticket assignee, tenant admin); unescalated transcripts (nobody, including vendor staff, absent a loudly-audited break-glass event). A session that resolved without a ticket was addressed to the avatar alone; deflection metrics (D89) still count it — aggregate is not audience. **A legal exposure in jurisdictions requiring employee notice, not only a security control.** | **Ratified as a set by the founder 2026-09-04** | Same source; D137, D89. |
| **D155** | **Local accounts are v1 testing only and become break-glass:** one per tenant, TOTP mandatory, every action audited as a distinct event class, use alerts the tenant owner. If the customer's IdP is unreachable, federated login fails during exactly the incident in which someone must revoke a device (D83a). | **Ratified as a set by the founder 2026-09-04** | Same source. |
| **D156** | **TOTP and admin-action audit from day one**, even in the local-accounts phase. The console reads audit containing employee transcripts and the PII table (D58); a password alone will not survive a security review. Admin-action audit was listed as absent in review B8. | **Ratified as a set by the founder 2026-09-04** | Same source; B8, OPEN-6. |
| **D157** | **Step-up re-authentication** for fleet-wide revocation, audit export, transcript access, policy changes and IdP configuration. | **Ratified as a set by the founder 2026-09-04** | Same source. |
| **D158** | **Author ≠ approver for catalog changes, as a role constraint** enforced by the permission model — not a workflow default that can be switched off. | **Ratified as a set by the founder 2026-09-04** | Same source; draft-and-approve (D70a). |
| **D159** | **Target model: OIDC federation per tenant; the hub is a relying party, never an identity provider.** Provisioning reuses the SCIM sync already required for KB entitlement and `caller_id` resolution (D55, D145), so an admin removed from the directory loses hub access without anyone remembering to do it — the failure mode local accounts have. | **Ratified as a set by the founder 2026-09-04** | Same source; D55, D145, D148. |
| **D160** | **The schema must not foreclose federation:** external identity mapping alongside local credentials, roles first-class, vendor-access grants as records with expiry. Free now, expensive later — the same reasoning as keeping `sys_id` out of the primary key (D56). | **Ratified as a set by the founder 2026-09-04** | Same source; D56, D86a. |

#### 5.7a D202 — the one item D157's list missed (2026-09-04, PROPOSED)

**Awaiting the founder. Blocks nothing.** Recorded as a new ID rather than folded into D157, because
this register does not silently rewrite a ratified decision's text.

| ID | Decision | Status | Source and forcing reason |
|---|---|---|---|
| **D202** | **Creating or modifying a `vendor_access_grants` row requires step-up re-authentication**, joining D157's list. The full list would then be: fleet-wide device revocation, audit export, transcript access, policy changes, IdP configuration, and vendor grant creation/modification. **Forcing reason: D144 identifies vendor staff as the highest-privilege position in the system, and D153/D154 make vendor access a time-boxed grant the customer enables — so granting it is a more consequential act than the policy changes and IdP configuration already on the list, and it was omitted by oversight rather than by decision.** `admin_audit.step_up` is indifferent to what is on the list, so nothing is blocked either way; D157's set was a judgment call and not a derivation, which is why adding to it is cheap. | **Proposed — the founder decides.** Does not gate B2. If refused, record the refusal here rather than deleting the row: the asymmetry between vendor grants and IdP configuration is then a deliberate position rather than an omission. | `sources/2026-09-04-ratification-D152-D160.md`; D157, D144, D153, D154. |

#### 5.7b The migration provenance convention (2026-09-04)

**Where a migration implements a decision, the SQL names the decision and the status that decision
held at the time the migration was written.** Applied retroactively to
`server/migrations/control/001-control-plane.sql` for the shapes §5.7 enumerates.

```sql
-- D153 (PROPOSED when this migration was written; ratified 2026-09-04)
--   Vendor access as a time-boxed grant the customer enables.
create table vendor_access_grants ( ... );
```

**Two reasons, and the second is the load-bearing one.** A reader of a migration can tell which
shapes were bets and which were settled. And **the next ratification pass can grep for provenance
rather than reconstructing it by hand** — reconstructing it by hand is how §5.7's finding surfaced at
all, and that is not a repeatable process.

**The comment records the status at write time and is not rewritten when a decision is ratified** —
it is only appended to, as above. A comment that silently tracks current status loses the one piece
of information that made §5.7's finding visible: that the shape went in before the decision came out.

**This is a guard against a real pattern, not bookkeeping.** D160's argument — federation columns are
free now and expensive later — is correct about *those columns* and is not a general licence. If
migrations routinely front-run decisions and nothing records that they did, ratification degrades
into rubber-stamping, because by the time the question is asked, dropping the table has a cost.

**LIMITATION, found the same day this convention was written: once a migration has been APPLIED
anywhere, its provenance comment is frozen and cannot be appended to.** The runner stores a checksum
and *"a changed file is an error, not a skip"* (`server/src/db/migrate.js`), so editing an applied
migration — even to add a comment — makes it refuse to run. The concrete case: **D208** (Q35
answered, §5.17) now backs `control.kb_chunks.tsv` being `to_tsvector('english', text)` in
`002-generic-kb.sql`, which was an English-only choice made before the decision existed — exactly
the situation this convention was invented to make visible — **and 002 cannot record it**, because
002 had already been applied to PostgreSQL 17.11 by the time Q35 was answered.

**So the convention covers decisions that predate a migration's first application, and nothing
after.** For anything later, the register is the only place it can go, and the pointer runs the
other way: §5.17 names the column. **Do not edit an applied migration to add provenance** — that
trades a comment for a broken migration path. If a later migration touches the same object, its
comment carries the newer decision.

### 5.16 D203–D207 — from building B7a (2026-09-04)

Every one is **proposed** and every one was forced by something found while building rather than
while planning. Full build notes: `../../server/docs/B7a-KNOWLEDGE-BASE.md`. Spec:
`../../server/docs/2026-09-04-B7a-answering-questions-spec.md`.

**Three of the five (D203, D205, D206) contradict a premise of that spec.** The spec's own honesty
ledger anticipated this — it said the register and the code win where they disagree — and this
section is that resolution.

| ID | Decision | Status | Source and forcing reason |
|---|---|---|---|
| **D203** | **D199's embedder is NOT servable through Ollama, and the development embedder is therefore a DIFFERENT MODEL: `snowflake-arctic-embed2:568m` = `Snowflake/snowflake-arctic-embed-l-v2.0`, 1024 dimensions.** Ollama's library carries only the **L** variant (three tags, one digest `5de93a84837d`: `latest`, `568m`, `568m-l-fp16`). There is no `-m-v2.0` tag, and **the near-miss is a trap**: `snowflake-arctic-embed:m` DOES exist but is the **v1.0** suite, updated two years ago and **English-only** — precisely what D199 rejected, because an English-only pick bets on Q35. **The two v2.0 variants are DIFFERENT ARCHITECTURES, not two sizes of one model** (verified from each `config.json`): L is `XLMRobertaModel`, 1024 hidden, 24 layers; M is `GteModel` with `auto_map` custom modeling code, 768 hidden, 12 layers, RoPE. Community GGUF quantisations exist for the L and none was found for the M — plausibly because llama.cpp cannot convert the M's custom architecture, which is **inference, not retrieved** `[VERIFY]`. **Measured on this machine 2026-09-04:** `POST /api/embed` returns **1024 dimensions, L2 norm 1.000000** (already unit-normalised, so cosine and inner product rank identically). **THE CONSEQUENCE, WHICH MUST TRAVEL WITH EVERY B7a NUMBER: dev latency is a PESSIMISTIC proxy and dev quality an OPTIMISTIC proxy.** The L is 1.9× the M's parameters, and TEI's own table ranks it **MTEB 35 against the M's 41** — so the dev embedder is both slower than production and better than it, and both errors point the wrong way. **Sharper still: the L is in the parameter class D199 explicitly rejected.** D199 turned down Qwen3-Embedding-0.6B (509M–600M) because unmeasured 1–2 vCPU latency was the wrong risk for an interactive surface; the L is 568M. **So this is a DEV RUNTIME choice and NOT an amendment to D199**, and adopting the L in production would contradict D199's own reasoning. The production path is confirmed available: **both variants publish full ONNX, including `model_int8.onnx` and `model_quantized.onnx`**, and TEI publishes `cpu-arm64-1.9`. Embedding sits behind a provider interface (`server/src/kb/embed.js`) with the dimension asserted against the live provider at startup, so a width mismatch is a loud refusal rather than a column of vectors that silently score zero. | **Proposed.** Answers Task 2a of `../handovers/2026-09-04-claude-code-handover-unblock-and-b7a.md` with **no**. Does not amend D199 and must not be read as doing so. **What would change it:** a GGUF of `-m-v2.0` appearing (making dev/prod parity free), or a measured CPU latency for the M on Fargate-class hardware showing the L is affordable too. | Handover Task 2a; D199, D175 (the embedder is a schema decision, not a foundation), D144 (TEI as the deployment mechanism), Q35. Ollama library pages, both `config.json` files, HF's TEI supported-models table, and one live `/api/embed` call. |
| **D204** | **The generic corpus lives in the CONTROL PLANE (`control.kb_articles`, `control.kb_chunks`, `control.kb_retrieval_log`), not per-tenant and not in a third schema category.** Generic KB is vendor-authored, carries no entitlement rules and holds no customer data (D45), so duplicating it per tenant buys nothing and costs a re-embed per tenant. The alternative — a dedicated `generic` schema as a single special-cased instance — is cleaner in the abstract and **a change to the migration runner**, which handles exactly two categories (`migrations/control/`, `migrations/tenant/`). That is not worth it for six articles. **The admission the migration carries: 001's header says the control plane holds records ABOUT tenants and devices, and this is content with vectors** — 001's actual invariant (no customer data) is intact, but its description has widened. **Move it when either is true:** customer KB (D44) arrives and wants to share retrieval SQL with the generic corpus, or the corpus outgrows one migration's worth of attention. **Cost of moving is a re-embed**, which is seconds for this corpus and under \$3 for 10,000 articles (D175) — which is why it was decided quickly rather than carefully, and the register says so rather than implying deliberation. | **Proposed.** Recorded so a future reader knows it was decided and not defaulted — which was the handover's explicit instruction on this point (§4a). | Handover §4a (which recommended exactly this); B7a spec §3; D45, D44, D143, D175. |
| **D205** | **A question is answered through an `answer` TOOL with an `answered` boolean, NOT by relaxing `tool_choice`.** **THE FORCING DISCOVERY: NOTHING IN THIS SYSTEM COULD RETURN A PROSE ANSWER FROM A MODEL, AND THE B7a SPEC ASSUMED IT COULD.** The spec §1 says *"Model declining to propose an action — Works"* and *"The agent can already reply in prose when it declines to call a tool."* **Both are false on four surfaces:** `client/src/agent/openai-compatible-client.js` sends `tool_choice: "required"` (*"Force a tool call so the reply is always schema-shaped"*); `server/src/providers/openai-compatible-provider.js` hard-codes the same; `server/src/turn.js` returns **HTTP 502** on a no-tool-call response; and `client/src/agent/hub-client.js#readCall` turns it into `{ok: false}`. What the spec saw was the `escalate` tool, whose `reply` is a **template the client assembles from schema fields** — real, useful, and not an answer to a question. **The choice and its four reasons:** the shipping direct path is untouched, so the bake-off still measures the same mechanism; **a decline becomes structurally expressible and therefore testable** — B7a's primary acceptance test against free prose is string-matching a model's phrasing, and against `answered: false` it is a field; citation is a schema field validated against the articles actually supplied, so the model cannot cite what it was not given (H5's attributed chrome needs a separate value to be treated as chrome); and it is the mechanism this project already trusts, tool use being an output-schema device rather than an execution device. **THE COST, STATED: `answered` is the model's own claim about itself.** A model answering from training while setting `answered: true` and citing a real article defeats the field. So the read path CONSTRAINS it: an unsupplied citation is dropped, and **`answered: true` with no surviving citation is DOWNGRADED to a decline** — because an answer attributable to no article is an answer from training wearing the company's authority. That makes lying attributable rather than impossible, which is the same concession D130 made about the consent card. | **Proposed.** Supersedes the B7a spec §1's claim about prose. **Consequence for the client:** a hub answer is a new response shape, so `HubClient` needs an `ask()` path; it is not built and `/v1/ask` has no endpoint caller yet. | Found by reading the four files before building on them. B7a spec §1, §2; H5; D130 (attributable rather than prevented); the bake-off's `whenNotToUse` result. |
| **D206** | **Questions go to a SECOND ROUTE, `POST /v1/ask`. `/v1/turn` is untouched and still cannot reach a database.** The B7a spec §6 asked for two things that fight: *"/v1/turn acquires a database dependency"* and, two bullets later, *"Keep a stateless path"* behind a flag. **The repo had already resolved the fight** — `test/db-static.test.mjs` asserts `!/db\/|from "pg"|Pool|withTenant/` over `src/turn.js` — so satisfying the first bullet means DELETING a guard the project deliberately built, to obtain a property its own next bullet asks for. A separate route gives the stateless path in a form **no flag and no later edit can quietly undo**, and the check keeps guarding it. It also happens to be the honest shape: proposing a machine change and answering a question are different operations with different prompts, different tools and different failure modes, and multiplexing them behind a flag would make a request body's meaning depend on server configuration. | **Proposed.** A deliberate deviation from the spec's letter in favour of its intent, recorded as a deviation rather than absorbed. | B7a spec §6; `server/test/db-static.test.mjs`; D53 (the hub retrieves, assembles, calls, returns). |
| **D207** | **The cross-encoder reranker is retrieved but NOT picked, and the reason is a cost shape nobody had costed.** D144 specifies TEI as the deployment mechanism, and **TEI supports sequence-classification rerankers of only four types — CamemBERT, XLM-RoBERTa, GTE and ModernBert** — which is the real shortlist, not the leaderboards. Retrieved 2026-09-04 (licence and parameter count from each model's HF metadata, architecture and context from each `config.json`): **`BAAI/bge-reranker-base`** MIT, 278M, XLM-RoBERTa, **514-token context**, ONNX, TEI-named; **`BAAI/bge-reranker-large`** MIT, 560M, XLM-RoBERTa, **514**, ONNX, TEI-named; **`BAAI/bge-reranker-v2-m3`** Apache-2.0, 568M, XLM-RoBERTa, **8194**, **no ONNX**, **not TEI-named** (same architecture as the two that are, so it very likely works — `[VERIFY]`), and by far the most-downloaded; **`Alibaba-NLP/gte-multilingual-reranker-base`** Apache-2.0, **306M**, GTE, **8192**, no ONNX, TEI-named; **`Alibaba-NLP/gte-reranker-modernbert-base`** Apache-2.0, **150M**, ModernBert, 8192, **full ONNX including int8**, TEI-named, BEIR 56.73 — **and English-only, which re-opens Q35.** **THE FINDING THAT MATTERS AND IS IN NONE OF THE HANDOVER DOCUMENTS: a cross-encoder's cost is per-query × per-candidate, not per-query.** An embedder runs ONE forward pass per question. A reranker runs one per (query, chunk) PAIR — with 20 candidates that is ~20 forward passes of a 300M model on 1–2 vCPU per question. **So "is it CPU-viable on Fargate" cannot be answered by comparing its parameter count to the embedder's; it is roughly an order of magnitude more work**, and that is the question, not the licence. **The 514-token context on both bge base and large is close to disqualifying for us independently** — our reference article is a single markdown table kept deliberately unsplit, and a reranker scoring a truncated chunk scores its head. **The pick, if one is forced today: `gte-multilingual-reranker-base`** — 306M against arctic-embed-m-v2.0's 305M, the same Alibaba GTE architecture family, Apache-2.0, 8192 context, multilingual, TEI-named. It keeps Q35 off the critical path by the same argument D199 used, at the same parameter budget, in the same runtime. **`gte-reranker-modernbert-base` is the recorded fallback IF Q35 comes back English-only** — half the parameters and int8 ONNX make it the only candidate plausibly cheap enough to be unremarkable — which is exactly how D199 treated nomic-embed-text-v1.5. **NOT PICKED, because: no latency measurement exists for any of them on Fargate-class CPU, the per-pair cost above means the mitigation may be architectural (rerank 10 candidates not 20; or make the reranker managed-mode-only) rather than a model choice, and there is no corpus to measure a quality gain against.** | **Proposed, and deliberately not decided. THE PICK IS NOW SETTLED BY D209 (§5.17): Q35 came back English-only on 2026-09-04, so this row's own recorded fallback `gte-reranker-modernbert-base` (150M, int8 ONNX, 8192 context) becomes the pick and displaces `gte-multilingual-reranker-base`.** Answers Task 2b's retrieval half; the decision half still needs a measurement, which Q35's answer does not supply. **B7a ships without it and says so**: review A1 suggests the reranker may matter more to retrieval quality than the embedder does, so **B7a's retrieval numbers are a FLOOR, not a measurement of the design**, and that caveat must travel with any number B7a produces. §10.2's cross-encoder `[VERIFY]` narrows from *"unretrieved"* to *"retrieved, unmeasured, and the cost shape is understood"*. | Handover Task 2b; D144 (TEI), D174 (hybrid retrieval, whose reranker this is), §5.11c (unretrieved), §10.2, review A1, Q35. HF TEI supported-models table; five HF model cards and `config.json` files. |

#### 5.16a What B7a built, and the honesty that goes with it

**Built and passing with no database and no model** — `server/test/kb-static.test.mjs`, **93
assertions**: chunking by field with the reference table kept whole, RRF fusion as a pure function,
the answer contract including every downgrade in D205, the tenancy refusal, and a set of guards that
fail if a caveat is quietly dropped (the relevance floor still `null`, no reranker added without a
decision, the corpus absent from the system prompt, the user's sentence not logged by default).

**Run against a live PostgreSQL 17.11 on 2026-09-04, after a Docker update unblocked it:** migration
002 applied cleanly (the `vector(1024)` type resolved inside `control` through `withControl`'s
`search_path = extensions`, which had been reasoning rather than fact), all six articles ingested to
18 chunks and 18 embeddings, **`npm.cmd run test:db` = 56 + 52 = 108 assertions passing**, and
**`npm.cmd run kb:accept` = 30 assertions passing** — the spec's §8 list end to end through a real
hub, real retrieval and a real model, **including 5/5 on the negative test**. `client/` is unchanged
and still 278 assertions with 0 XFAIL, which closes acceptance item 9.

**The relevance floor stays `null`, and §5.16c is the reason — it is now answered rather than
deferred, and the answer is that the mechanism is wrong.**

**A finding from the database tests that changes how the decline must be understood:** with the
lexical leg alone, an uncovered question returns **zero chunks**. With the semantic leg on, the same
question returns its nearest neighbours, because **a dense leg has no concept of "no match"** — it
always returns something. So adding the semantic leg makes the decline HARDER, not easier, and the
prompt carries the whole weight of it. That is the opposite of the intuition that better retrieval
makes declining easier.

**Still unmeasured, all of it:** `RRF_K = 60` (the convention remains unretrieved, §5.11c),
`CANDIDATES_PER_LEG = 20`, the kind weights (title and symptoms above guidance — reasoned from
"users describe problems, not fixes"), and every retrieval outcome. **Nothing in B7a supports a claim
that the product answers questions well.** Six articles, no reranker, no corpus, and a dev embedder
that is not the shipped model. Its purpose is to prove the path works and that the system declines
when it should.

#### 5.16b One trap this file should record, because it was hit while building

`"darwin".includes("win")` is **true**. The first version of `platformFromProbe`
(`server/src/kb/ask.js`) tested `win` before `darwin` and therefore classified **every macOS
machine as Windows** — which is the exact D162 failure the platform pre-filter exists to prevent,
arriving through the pre-filter itself. **It would have presented as a pass:** the macOS article
would have been correctly withheld from a Mac, for entirely the wrong reason. It was caught by a test
asserting `darwin -> macos`, not by reading the line.

This is the same class as §10.5's backslash trap — a false signal wearing the shape of the expected
answer — and it is the second instance. `CLAUDE.md` carries the rule.

---

#### 5.16c The relevance floor is answered, not deferred — and the answer is that the mechanism is wrong (2026-09-04)

`bin/kb-floor.mjs` ran against the live corpus with both legs on. **A FLOOR OVER FUSED RRF SCORES
CANNOT WORK, AND THE REASON IS STRUCTURAL RATHER THAN A CONSEQUENCE OF SIX ARTICLES.**

Every top score across 20 questions was one of exactly five values:

| Score | What produced it |
|---|---|
| `2/61` = 0.032787 | the top chunk was found by **both legs**, rank 1 in each |
| `1/61` = 0.016393 | one leg only, rank 1 |
| `1/62` = 0.016129 | one leg only, rank 2 |
| `1/63` = 0.015873 | one leg only, rank 3 |
| `1/64` = 0.015625 | one leg only, rank 4 |

That is arithmetic, not a distribution. **The fused score is a function of RANK AND LEG AGREEMENT
ONLY — it carries no similarity magnitude, because the rank transform discarded it.** Discarding
magnitude is RRF's *selling point* (D174 chose it precisely so a `ts_rank` and a cosine never have
to be reconciled) and it is exactly the information a relevance floor needs.

**So the two distributions overlap, for a reason more articles will not fix.** The semantic leg
returned **all 18 chunks for every query**, covered or not — a dense leg has no notion of "no
match" — so an uncovered question's nearest neighbour lands at semantic rank 1 and scores `1/61`,
**identical** to a covered question whose phrasing shares no terms with its article. Two of the ten
covered questions did exactly that ("everyone sounds choppy on video calls", "wifi keeps cutting out
when I work from home") and both were retrieved correctly. A threshold over this score is therefore
asking *"did the lexical leg agree?"* — **a one-bit test wearing a decimal point.**

**If a relevance signal is ever wanted, neither candidate is this constant:** threshold the **raw
semantic similarity before fusion** (`semanticLeg` returns a cosine in [-1, 1] — real magnitude),
or use **leg agreement** (`lexRank !== null && semRank !== null`) as an explicit signal, which is
the honest form of what a fused-score floor approximates. Both are new mechanisms and need their own
decision. **Until then the prompt carries the decline, and the live results say it does so** — 5/5 on
the uncovered set, and 5/5 when handed a relevant-looking article that does not answer the question.

**What is and is not evidence here.** The **mechanism is not a sample**: `2/61` and `1/(60+rank)`
are what the formula computes, and this generalises. The **distribution IS a sample** — 20 questions
chosen by this session, 6 articles, no reranker — and is **not** a measurement; it does not join
§10.3. A cross-encoder reranker would change the ordering without giving this constant a magnitude to
threshold, so it does not rescue the mechanism either.

---

### 5.17 D208–D210 — Q35 answered, and what it moves (2026-09-04)

**The founder answered Q35 on 2026-09-04: English only, for now.** That is the first of D144's two
open forks to close, and it moves two decisions in opposite directions — one gets easier, one loses
the argument that carried it.

> **Q35 IS CITED FOUR TIMES IN THIS REGISTER AND HAS NEVER BEEN DEFINED IN IT.** Its canonical text
> is in `ASK-IT-questionnaire.xlsx`, which has never been on disk (§1). The same is true of **Q9**
> (which EDR products the design partner runs) and **Q39** (cited by D178). **As this register uses
> it, Q35 is "is multilingual support required?"** — that is the only sense in which D199 and D207
> consume it, and it is recorded here so the answer below is unambiguous without the workbook.
> Same class as `D46b` and `D52a` (§5.11b): a number every reader recognises and nobody can read.

| ID | Decision | Status | Source and forcing reason |
|---|---|---|---|
| **D208** | **Q35: English only, for now.** Founder, 2026-09-04. **"For now" is load-bearing and is part of the decision** — it is a statement about the pilot's scope, not a permanent product boundary, so nothing may be built in a way that makes multilingual support expensive to add later. What it licenses is **choosing English-only components where they are cheaper**, because the cost of being wrong is now bounded and known: **re-embedding 10,000 articles is under \$3 (D175)** and a reranker swap is a redeploy with no stored state at all. What it does NOT license is dropping the multilingual columns, collations or tokeniser configuration that would make a later reversal a migration rather than a redeploy. **The one place this is already visible in code:** `control.kb_chunks.tsv` is `to_tsvector('english', text)` (migration 002) — an English-only choice that was already made, correctly, and that a non-English corpus would need a new migration to change. It is now backed by a decision rather than by a default. | **Decided by the founder 2026-09-04.** Closes the first of D144's two forks. **Fires two revisit triggers, D209 and D210.** | Founder answer to Q35. D144 (whose shortlist splits on exactly this), D199, D207, D175 (the cost bound that makes an English-only pick reversible). |
| **D209** | **The cross-encoder reranker pick is now `Alibaba-NLP/gte-reranker-modernbert-base` — and this SELECTS WITHIN D207's OWN RECORDED FORK rather than changing it.** D207 wrote the fork down before the answer existed: *"`gte-reranker-modernbert-base` is the recorded fallback IF Q35 comes back English-only — half the parameters and int8 ONNX make it the only candidate plausibly cheap enough to be unremarkable."* Q35 came back English-only, so it is the pick. **Apache-2.0, 150M parameters, ModernBert sequence classification, 8,192-token context, TEI-named, full ONNX including `model_int8.onnx`, BEIR 56.73 across 15 datasets.** It displaces `gte-multilingual-reranker-base` (306M, no ONNX), which was only the pick because Q35 was open. **THIS MATTERS MORE FOR THE RERANKER THAN Q35 DOES FOR THE EMBEDDER, and the reason is D207's cost shape:** a cross-encoder runs one forward pass **per (query, chunk) pair**, so ~20 passes per question on 1–2 vCPU. Halving the parameters halves the whole per-question cost, not a one-off, and **int8 ONNX is the first quantisation option any candidate has offered** — the two things that made CPU viability doubtful are exactly what changes. The **8,192-token context also survives**, which the `bge-reranker` pair (514) did not, and our reference article is a deliberately unsplit markdown table. | **Proposed, and still NOT a decision to build.** D207 was "deliberately not decided" pending a latency measurement, and Q35's answer does not supply one. **No latency figure exists for this or any candidate on Fargate-class hardware** — what changed is that the cheapest plausible candidate is now the *right* candidate rather than a bet against an open question. | D207 (which recorded this exact conditional), D208, D144 (TEI), D174. Retrieved 2026-09-04: HF model card and `config.json`. **English-only is now a feature of the pick rather than a defect** — but see D208 on "for now". |
| **D210** | **D199 STANDS, and the argument that carried it is now spent. `nomic-embed-text-v1.5` is the pre-argued English-only alternative, and it is NOT adopted today.** **The uncomfortable half first: D199's own deciding reason was explicitly not the benchmark** — it was *"that this choice removes Q35 from the critical path"*, because an English-only pick bet on an unanswered question. **Q35 is now answered, so that reason no longer exists.** What remains supporting D199 is weaker and should be read as such: arctic-embed-m-v2.0 is a competent model, it is already chosen and ratified, and re-embedding is cheap. **D199 itself named the alternative:** *"nomic-embed-text-v1.5 is 137M and would be right if Q35 came back English-only."* At **137M against 305M** it is less than half the size, which attacks D199's one stated risk — unmeasured latency on 1–2 vCPU for an interactive surface — and its 768 dimensions match arctic-m's exactly, so a switch is a re-embed and not a schema change. **Three reasons it is not adopted now, and none of them is that it would be wrong:** (1) **there is still no CPU latency measurement for either model**, so switching would trade a ratified choice for an unmeasured one on the strength of a parameter count — which is the reasoning D199 itself declined to do when it rejected Qwen3-0.6B; (2) **"for now" (D208) means the answer can revert**, and arctic-m is defensible under both answers while nomic is defensible under one; (3) **nothing is blocked** — B7a runs, and the production embedder is not deployed anywhere. **The trigger is explicit: if CPU latency is ever measured and arctic-embed-m-v2.0 does not clear the budget, `nomic-embed-text-v1.5` is the answer and the argument is already made.** Note that D199's other recorded upgrade, Qwen3-Embedding-0.6B, moves the other way — Q35's answer removes its multilingual advantage while leaving its 509M–600M cost. | **Proposed as a standing revisit trigger, NOT a decision to switch** — the same shape as D199a. **The founder should know that D199's deciding reason is spent**, because a decision resting on a reason that has evaporated is the kind of thing that hardens into "the embedder is settled" (§5.14a already warned about exactly this). | D199 (which named this alternative and this trigger), D208, D175, §10.2 (no latency measurement exists), D144. |

#### 5.17a What Q35's answer does NOT change

**It does not close D144's second fork, and it does not touch B7a.** B7a is built and verified with
arctic-embed-l-v2.0 in development (D203) and no reranker at all (D207); neither D209 nor D210
changes a line of it, and **no re-embed is needed** — D209 adds a component that does not exist yet
and D210 explicitly declines to switch.

**It does not make the retrieval numbers mean more.** Six articles, no corpus, no reranker. Q35
being answered narrows the *component choice*; it measures nothing.

**And it does not answer Q9.** Q9 (which EDR products the design partner runs) is the other
undefined question number, it is a **prerequisite for starting the EDR conversation at all**, and it
is now the one on the critical path — see §7's OPEN-9 row.

---

### 5.18 D211 — the endpoint can ask a question (2026-09-04)

B7a built a hub that answers questions and left nothing able to ask it. This closes that: the
avatar answers from the knowledge base. Handover Task 1.

| ID | Decision | Status | Source and forcing reason |
|---|---|---|---|
| **D211** | **The endpoint classifies an utterance as a QUESTION or an ACTION before consulting a provider, and the two take different paths — `HubClient.ask()` → `POST /v1/ask`, or the existing `propose()`.** `client/src/router/classify.js`, called from `Agent.propose()` **after tier-0** so D46b holds. Three properties, each load-bearing: **(1) THE CLASSIFIER IS BIASED TOWARDS THE MEASURED PATH.** The proposal path has 40 hand-written cases across five models with zero false actions reaching a user; the question path has six articles and no measurement. So an action verb beats question grammar — **"how do I FIX my printer" is an action**, because the model can propose `restart_service` and a six-article KB cannot, and a bare question mark is not enough ("my printer won't print?" is an uncertain report, not a request for an article). Being wrong towards the measured path costs a worse answer; being wrong the other way costs a decline where a fix existed. **(2) A DECLINED QUESTION DOES NOT FALL THROUGH TO THE PROPOSAL PATH.** Tempting — ask the KB, and if it declines let the model try. **D198 is why not:** it would raise a consent card the user never provoked, for a machine change nobody asked for, in answer to *"what is our policy on expensing a taxi"*. An unreachable hub DOES fall through, because that is a network failure and not a decline, and blaming the knowledge base for it would be a lie. **(3) THE BRANCH IS GATED BY CAPABILITY, NOT BY PROVIDER NAME** — `typeof this.cloud?.ask === "function"`. `CloudClient` and `OpenAICompatibleClient` have no `ask`, and the **frozen demo build uses `provider: "cloud"`**, so the demo cannot reach this feature *by construction rather than by configuration*. A test asserts the check is a capability check so nobody simplifies it into `provider === "hub"`. **An answer returns as `res.answer`, a distinct field like `res.escalation`,** and the renderer branches on it BEFORE destructuring a proposal — an answer has no proposal and no validation, and reaching that code would read `validation.ok` off `undefined`. **`citedArticleIds` stays a separate field and is NEVER concatenated into `reply`:** under H5 a citation is attributed chrome, so the renderer shows it as a source line and does not speak it. A decline also prints *"nothing was filed"*, for the same reason the escalation branch does — an offer to raise a ticket can be heard as the act. | **Proposed.** Closes handover Task 1. **D165's social layer is where `classify()` will grow a third branch and IS NOT BUILT** — `SOCIAL_MARKERS` is deliberately empty, `classify()` never returns `"social"`, and a test asserts that D198's greeting still routes to the proposal path, so **the defect is recorded as unfixed rather than masked.** Do not read the presence of the branch as the presence of the feature. | Handover `../handovers/2026-09-04-claude-code-handover-b7a-built.md` Task 1; D46b (tier-0 first), D198 (unprovoked cards), D205 (`answered` as a field), D206 (why `/v1/ask` is a route), H5 (attributed chrome), `../../client/docs/BAKEOFF-2026-09-02.md` (what "measured" means here). |

#### 5.18a The integration bug that only an end-to-end run could find

**`probeMachine()` returns `{ services, adapters, primary, actionable, online }` — no `platform`.**
It never needed one: every capability is Windows-only, so nothing on the proposal path ever asked.

But the hub's pre-filter reads `probe.platform`, and with it absent `platformFromProbe()`
**correctly** returns `null`, which admits `platform: "any"` articles only. **So every Windows-only
article was invisible to the endpoint.** *"How do I take a screenshot"* declined through the agent
while answering correctly through `curl` — because `curl` had been sending `{"platform":"win32"}`
by hand and the agent was sending the real probe.

**Both sides were behaving exactly as designed.** The hub's tests passed, the endpoint's tests
passed, and the seam between them was broken. Neither side's tests could have caught it, and no
amount of reading either file would have shown it: it took running the real agent against the real
hub (`client/eval/e2e-ask.mjs`).

Fixed in `HubClient.ask()` rather than in `probeMachine()`, deliberately: `machineStateBlock(probe)`
renders the probe into the prompt the 40-case bake-off measured, so adding a field to the probe risks
moving a measured number. The ask path is the only consumer of a platform, so it is the narrowest
place the fix can live — and it **defers to a real `probe.platform` if one ever appears**, so it
disappears cleanly rather than becoming a second source of truth. Pinned by three assertions in
`client/test/hub-client.test.mjs`.

**This is the third defect in one session found by using the software rather than reading it** (the
other two: the hub's bare `GET /` 404, and `EADDRINUSE` answered with a stack trace). `CLAUDE.md`'s
first working rule is *"bugs are found by using the software, not reading it. Run the thing."*

#### 5.18b And two test files had fallen out of `npm test`

Porting `server/test/run-all.mjs` to `client/` — Task 2a, the `&&` trap — **found twelve test files
where the hand-written chain ran nine.** `cloud.test.mjs` and `privileged.test.mjs` were being
discovered by nobody.

Both turned out to belong out: one **makes real Anthropic API calls and costs money** (it exits
quietly with no key, which is not the same as passing), the other **runs the real Win32 path and
needs elevation** (Win32 error 5 otherwise). **But "belongs out" and "was forgotten" look identical
in a hand-written chain, and only one of them is a decision.** So both runners now declare
exclusions **with a reason and the command that runs them**, and print them on every run — an
exclusion nobody is reminded of becomes an exclusion nobody remembers deciding.

`client/` is now **336 assertions across 10 files** (was 278 across 9, with 3 unrun).

---

### 5.19 D212 — D165's social layer, built (2026-09-04)

**D198's defect is fixed.** *"Hello how are you?"* no longer produces a consent card, and the
sentence D198 recorded is the first assertion in `client/test/classify.test.mjs` §4.

| ID | Decision | Status | Source and forcing reason |
|---|---|---|---|
| **D212** | **D165 is implemented as `client/src/router/social.js` plus a social branch in `classify()`, and `Agent.propose()` calls it UNCONDITIONALLY.** Six subkinds — greeting, how-are-you, thanks, farewell, **capability**, off-topic — each a deterministic client-shipped template, none model-authored, none hub-authored (H5). **The unconditional call is a correction to D211's gating and the reason matters: D211 gated the question branch on the provider having an `ask()`, which is right for questions and WRONG for this.** D198's defect was observed on `provider: "cloud"`, the configuration the frozen demo build uses, so a social layer gated the same way would have left the observed defect in place on the path it was observed on. It is also the only branch here that needs no network — templates are local, so a greeting is answered with the cloud unreachable and the hub down, which is the state D198's defect was found in. **THE CAPABILITY ANSWER IS GENERATED FROM `broker.listCapabilities()`, which is D165's actual requirement** (*"a warm bot that claims a capability it lacks is worse than a curt one"*): there is no hand-written list of what the assistant can do anywhere, because **a hand-written list is a claim and a generated one is a fact.** Add a capability to `catalog.json` and the answer grows; remove one and it shrinks; it cannot drift because there is nothing to keep in sync. It reads tier labels from `capability.tierInfo` — which `InProcessBroker` attaches from the catalog's `tiers/*` — rather than from `broker.catalog`, because reaching through a Broker into its catalog is the layering violation `broker.d.ts` exists to prevent. It **names** the disruptive capability rather than summarising it, **states the boundary in the same breath** (a user who hears four abilities assumes the fifth is included), and **with an unreadable catalog it promises nothing at all** rather than claiming from memory. A social turn returns `res.social`, a distinct field like `res.answer` and `res.escalation`, and the renderer branches on it first — the whole point is that the turn never reaches the code that can offer a card. | **Proposed.** Implements D165, which was *"decided, not built"* since 2026-09-03, and closes D198(a)'s ordering requirement: the templates are consulted before `routeByState()` and before every provider call. **D198's habituation argument is unaffected** — this removes one source of unprovoked cards, not the general possibility. | D165 (the decision), D198 (which made it a safety requirement and fixed the ordering), H5, H3e (constrain what text the model influences), `_plainNote` in `catalog.json` (the same argument for consent wording). |

#### 5.19a The hard part was not recognising "hello"

**It was not swallowing "hi, my printer is broken".** A substring match on greetings turns every
polite problem report into a greeting, and **that failure is worse than the one D198 found, because
it is silent** — the assistant answers warmly and does nothing, and no test that only checks "does
'hello' get a greeting" would notice.

So a greeting is social only when, with the greeting and filler REMOVED, **nothing of substance is
left** (`residue()`, threshold zero words — deliberately at its most conservative, because raising
it is how this starts failing again). "hello" is social; "hello printer" is not, because a single
noun is often the whole complaint from someone who does not want to type. Seven polite problem
reports are pinned as NOT social, including "hello how do I take a screenshot", which must still
reach the *question* path rather than losing the question along with the greeting.

**Two defects found while building it, both by running it rather than reading it:**

- **A bare "Hi" was classified as an action.** The first version listed `"hi "`, `"hi!"`, `"hi."`
  and `"hi?"` as separate markers to stop `"hi"` matching inside "this" and "hint" — so `"Hi"` with
  no trailing character matched none of them. **Enumerating punctuation is the wrong fix for a
  boundary problem**; matching is now whole-phrase against a normalised, space-padded string.
- **"What is the weather?" was sent to the KNOWLEDGE BASE.** Off-topic markers were taking the
  residue test, and "what is the weather" leaves "what is", which trips the threshold. The residue
  test protects *greetings*, which are politeness wrapped around a message; off-topic markers are
  **content**, so they now fire on the marker alone — and the markers were tightened to complete
  phrases, because the first version's bare topic nouns ("the weather", "a joke", "the score", "the
  news") each appear inside a real complaint: *"the weather app won't open"*, *"this printer is a
  joke"*, *"the news site won't load"*. Both directions are pinned.

`client/` is now **395 assertions across 10 files** (`classify.test.mjs` alone is 105).

---

### 5.8 D161 — prompt caching (2026-09-03)

| ID | Decision | Status | Source and forcing reason |
|---|---|---|---|
| **D161** | **Prompt caching is on for models whose floor the shipped prefix reaches, and off — not padded — on `claude-haiku-4-5`.** `client/src/agent/cloud-client.js` puts one `cache_control: {type: "ephemeral"}` breakpoint on the system block; tools render before system, so tools and system cache together, and the machine-state block and the user's sentence follow the breakpoint. The default is per model (`promptCacheByDefault()`): false for Haiku 4.5 (2,104 measured against a 4,096 floor), true for Sonnet 5 (2,600 against 1,024), with a constructor override. The shipped build (`config.json` → Haiku) sends the same request as before. **Verified live 2026-09-03** with `npm run verify-cache` (two real calls to `claude-sonnet-5`, same shipped turn): first call `cache_creation_input_tokens` 2,412 / `cache_read_input_tokens` 0; second call 0 / 2,412; 389 uncached input tokens each time — **86% of the 2,801-token prompt read from cache on the second call.** **Haiku is not padded to 4,096:** `prompt.js` is shared across providers as a correctness requirement of the bake-off, so padding would have to be Anthropic-path-only and inert, and the `whenNotToUse` result showed prefix text moves model behaviour — padding therefore needs a Haiku bake-off re-run to prove the score did not move. Real work and real risk against $0.0023 per turn at list price. **Revisit when volume justifies it.** Per-tenant workspaces (D138) isolate caches, so a cached prefix is written once per tenant per window, not once per fleet. | **Done 2026-09-03** (code and measurement). The pad-Haiku question is decided *no, for now*. Amends D140's "not attempted". | Founder handover 2026-09-03 Task 2; D140; `../../client/docs/TOKEN-COUNT-2026-09-03.md` §3 item 4 and §6. **Two premises of the task corrected while doing it:** (1) the client has no Sonnet escalation path — `main.js` builds one `CloudClient` on `config.model`, and the `escalate` tool hands off to a human; Haiku→Sonnet escalation lives on the hub (D53c), which is not built — so "Sonnet path only" is implemented as the per-model default above, not as a second code path; (2) **`claude-sonnet-5` rejects `temperature`** (400 "`temperature` is deprecated for this model", observed 2026-09-03), which `client/eval/run-bakeoff.mjs` pins to 0 for every model — a Sonnet 5 bake-off run needs that made conditional first. The app never sets it. |

### 5.9 The KB architecture document — what survived while it was missing (superseded by §5.11)

`2026-09-03-kb-architecture-authoring-ux.md` (its own D151–D168, all void) was not on disk when this section was written, so its decision content cannot be merged. Two things are recorded now so they are not lost:

- **D144 already decides the embedder direction.** The KB document's own "OPEN-7" framing of the embedder question (not this file's OPEN-7, which is the macOS mapping) is superseded; D144 stands.
- **Three corrections to earlier chat claims, from its §8, survive the merge:** (1) "KB authoring is a phase-one gap" was wrong — the team review document `04-TEAM-REVIEW` §7 already designs it (that document is cited by the KB document and is not on disk here); (2) "the Postgres you already have" — nothing is provisioned, consistent with `server/README.md`; (3) the product framing is *"reduces first-line volume"* (per that document's §9 A7), not *"replaces your service desk"*.

**The document was found the same night and is filed at `../kb/2026-09-03-kb-architecture-authoring-ux.md`; its decisions are merged as D167–D192 in §5.11.** This section is kept as the record of what the register held in the interval, and because both bullets above survive the merge unchanged. The `sources/` disposition anticipated here was not used, and §5.11 says why.

---

### 5.10 D162–D166 — from the first-build-steps handover and its follow-ups (2026-09-03, night)

Four things decided in chat and recorded here from `Downloads\2026-09-03-claude-code-handover-first-build-steps.md` Task 4. D164 is implemented; the other three are decided (founder) and not yet built.

| ID | Decision | Status | Source and forcing reason |
|---|---|---|---|
| **D162** | **Generic KB article schema.** Fields as in `docs/kb/generic-kb-v2.json` (`schemaVersion: generic-kb/1`): `id`, `type: troubleshooting \| reference`, `title`, `category`, `platform`, `environment`, `lifecycle`, `problem`, `symptoms[]`, `keywords[]`, `guidance[]`, `escalateWhen[]`, `doNotAttempt[]`, `cause`, `body`, `provenance`, optional `scopeNote`. **`platform` is a pre-retrieval filter, not a display toggle** — an article for the wrong platform is never retrieved, so it never reaches the model's context. Lifecycle states are the KCS v6 confidence states, verified 2026-09-03 (§10.4): *Work in Progress*, *Not Validated*, *Validated*, *Archived*; v2's `unvalidated` maps to *Not Validated* and should adopt the KCS name when the schema is next revised, alongside a KCS-style five-level audience attribute (Internal / Within a Domain / Partners / Customers / Public) before any article is customer-visible. **The rule that produced the schema: an article describes the problem and what the user can do; it never describes what the bot does and never names a capability.** | Decided | Handover Task 4 §1. Forcing reason: the first six articles supplied contained "Bot resets credentials" — threat-model gap G4 (content reaching the model's context) arriving in the first content ever written. The catalog says what the bot does; the broker enforces it; the KB must not. The schema document itself (`2026-09-03-generic-kb-schema-and-findings.md`) was not on disk — `docs/kb/README.md`. |
| **D163** | **`doNotAttempt` on articles is a hypothesis, not a measured result.** Added by analogy with the `whenNotToUse` tool-description result that took R2 false actions to zero (§2b of `../../client/docs/BAKEOFF-2026-09-02.md`). It must be tested the same way — the same 40 cases (or the real ticket export), with and without the field in the retrieved context — before anyone cites it as a safety mechanism. | Proposed (hypothesis) | Handover Task 4 §2. A field that looks like a measured guard but is not one is worse than no field. |
| **D164** | **`Proposal.source` gains `"hub"`, with `hubProvider?: "local" \| "cloud" \| null` — the hub's claim, not the endpoint's knowledge.** The endpoint can attest that the sentence went to the hub; every statement past that hop is hearsay from the hub, recorded as a claim and never as a fact about the network. The renderer says so on screen; the bake-off records it per case. Implemented in `client/src/broker/broker.d.ts`, `client/src/agent/hub-client.js` (the third provider beside `CloudClient` and `OpenAICompatibleClient`, same `propose()` contract, selected by `config.provider: "hub"`), and the B0 hub in `server/`. Default provider unchanged: the demo build sends the same request it always sent. **Tier-0 never routes through the hub (D46b)** — pinned by `client/test/hub-client.test.mjs` against a hub that is not running. | **Done** (2026-09-03) | Handover Task 3/4 §3. The distinction a security review asks for is where the sentence went; a hub in the path must not blur it. |
| **D165** | **The social / tier-0 conversational layer is deterministic, not model-authored.** Greetings, capability questions and off-topic redirects are answered by templates. **Capability answers are generated from the catalog**, because a warm bot that claims a capability it lacks is worse than a curt one. Templates ship in the client or in the signed bundle — **never hub-authored (H5)**. Recorded before anyone wrote response strings, so there are not fifty inconsistent ones. **BUILT 2026-09-04 — D212, §5.19.** **Amended 2026-09-03 by D198 (§5.13), from the first real use of the app: a greeting produced a consent card.** That makes this a safety requirement rather than a consistency one, and it fixes the ordering — the templates must be consulted **before** `routeByState()`, not after. | **Decided 2026-09-03; BUILT 2026-09-04 (D212, §5.19).** `client/src/router/social.js` + the social branch of `classify()`, called unconditionally by `Agent.propose()`. The capability answer is generated from `broker.listCapabilities()`. | Handover Task 4 §4. Same family as H3e: constrain what text the model is allowed to influence. |
| **D166** | **A new consent request supersedes the outstanding one; the supersession is audited.** The D130 design's rule 3 ("one outstanding `ConsentRequest` per session") did not say what a second `prepareConsent` does while one is outstanding. Two candidates: *refuse the second call*, or *supersede* — burn the outstanding nonce and write an audit record for it (`outcome: "refused"`, `gate: "consent"`, `consentRendered` = the superseded card, message says superseded). **Supersede is the decision.** Refusing would break the honest path: a user who clicks *Deny* and types another complaint inside the 120 s window would be refused, because the denied request is still outstanding and the contract has no cancel. Neither choice stops a compromised agent from painting one card and approving another (design §5 — only the broker-owned window does); supersede is the only one that keeps the honest path working *and* leaves the forensic signature of that attack in the trail: X rendered, X superseded, Y rendered, Y run, within milliseconds. Implemented in `client/src/broker/in-process-broker.js` `supersedeOutstanding()`; pinned by `client/test/consent-surface.test.mjs` §5. | **Done** (2026-09-03) | `../../client/docs/2026-09-03-consent-protocol-attack-notes.md` F2, promoted from attack notes to the register by the follow-ups handover A4: it is a decision, not an implementation detail. Amends D130's design rule 3 by specifying it. |

**OPEN-9 (code-signing certificate)** is added to §7. It blocks A6 (signed MSI), D151 (standalone self-updater) and OPEN-8 (build-pipeline integrity).

---

### 5.11 D167–D192 — the KB architecture document, found and merged (2026-09-03, night)

`2026-09-03-kb-architecture-authoring-ux.md` was supplied by the founder and **is now on disk at
`docs/kb/2026-09-03-kb-architecture-authoring-ux.md`.** §5.9 was written when it was not, and stands
as the record of what survived without it; this section replaces it as the merge.

**Its own D151–D168 remain void** (§0). The document carries a banner saying so and pointing here.
It was filed to `docs/kb/` rather than `sources/` because it is the live architecture document the KB
work will be built from, not superseded material — the founder's handover
(`docs/handovers/2026-09-03-claude-code-handover-b1-schema.md` Task 1) directs it there and asks for
§3 to be rewritten, which a `sources/` copy could not be. The banner is what keeps the void IDs from
being cited.

**Why this merge matters more than a filing exercise:** before it, the register contained **zero
occurrences of "hybrid" and zero of "review queue."** The retrieval architecture and the admin's
home surface — the two most load-bearing pieces of the KB half of the product — were recorded
nowhere, and B7 could have been built without them.

#### 5.11a Mapping — void ID to register ID

| Void ID in the document | Register ID | What it is |
|---|---|---|
| D151 | **D167** | Catalog and KB authoring are separate surfaces |
| D152 | **D168** | Auto-drafting applies to both; catalog in phase two |
| D153 | **D169** | Authoring effort is a measured metric |
| D154 | **D170** | The design target is review, not composition |
| D155 | **D171** | Articles are structured, not freeform |
| D156 | **D172** | Lifecycle states are the KCS v6 confidence states |
| D157 | **D173** | Dedup and archival are first-class operations |
| D158 | **D174** | **Hybrid retrieval** |
| D158a | **D175** | Hybrid de-risks the embedder choice |
| D159 | **D176** | Corpus size is a tenant-tier input |
| D160 | **D177** | **The admin's home surface is a review queue** |
| D160a | **D178** | Gap-driven authoring |
| D161 | **D179** | Admin search uses the agent's retrieval |
| D162 | **D180** | Preview before publish |
| D163 | **D181** | Bulk import connectors are phase-one scope |
| D164 | **D182** | Build the KB; do not adopt an open-source KB platform |
| D164a | **D183** | Take the chunking pipeline from open source |
| D165 | **D184** | Author ≠ approver for KB is a workflow default |
| D166 | **D185** | Retrieval quality is logged separately from outcome |
| D167 | **D186** | Trend is reported per category |
| D167a | **D187** | KB-specific admin metrics |
| D168 | **D188** | The end-of-session confirmation turn is load-bearing |
| *(§7 prose, unnumbered)* | **D189** | No KB browser for end users |
| *(§7 prose, unnumbered)* | **D190** | Sources are shown, as attributed chrome |
| *(§7 prose, unnumbered)* | **D191** | "That didn't work" is a first-class button |
| *(not in the document)* | **D192** | The bake-off's model ranking is inside the noise floor |

Its §6 outcome taxonomy (resolved / escalated / unresolved / suppressed, and the deflection
denominator) duplicates **D89 and D118** and is not renumbered. Its §8 corrections and its own
"OPEN-7" framing were already merged in §5.9 and are not repeated.

#### 5.11b Four citation errors in the document, and two dangling IDs in this register

The document cites register IDs and gets four of them wrong. **The register's IDs below are
authoritative; do not propagate the document's.**

| Document says | Should be | Where |
|---|---|---|
| Phasing of catalog vs KB authoring is **D138** | **D149** (endpoint stays phase one; hub-distributed privileged content becomes phase two). D138 is the cost-model rebuild. | §1 table, §1 prose |
| Author ≠ approver for the catalog is **D148** | **D158** (author ≠ approver as a role constraint), with **D70a** for draft-and-approve. D148 is the broker attesting the logged-on user. | §1 table, §5 D165 row |
| The end-of-session confirmation turn is **D83** | **D90.** D83 is enrollment rate limiting. The document used the pre-renumber ID for this one while using post-renumber IDs for D89 and D118 in the same section — the +7 renumbering half-applied. | §6 D168 row |
| Its own **OPEN-7** is the embedder question | This register's OPEN-7 is the macOS mapping. The embedder direction is **D144**. Already recorded in §5.9. | §9 |

Two further dangling IDs were found while merging, and are **not** the document's fault — they are
in this register:

- **`D46b` is cited but never defined.** "Tier-0 never routes through the hub" is cited as D46b in
  D164 and in `server/docs/2026-09-03-B0-walking-skeleton-spec.md` §4. D46 is the generic-bundle push
  decision; there is no D46b row. The behaviour is implemented and pinned by
  `client/test/hub-client.test.mjs`, so this is a missing register row, not a missing decision.
  **Do not create a D46b** — the register does not renumber or back-fill. If it needs an entry it
  takes the next free ID.
- **`D52a` is cited but does not exist anywhere in this file.** The B1 handover cites it for
  "pgvector must be enabled in the per-tenant schema template". The real citations are **D59a**
  (pgvector as a stated deployment requirement on customer-supplied Postgres) and **D143** (the
  per-tenant schema). Use those.

#### 5.11c The decisions

**RATIFIED AS A SET by the founder on 2026-09-04.** D192 was already decided from a measurement;
the rest were one session's design work, recorded so B7 would not be built without them, and they
are now settled.

**Three caveats survive ratification and are not softened by it.** **D173** (dedup and archival as
first-class operations) rests on *"findability beats volume"*, which §10.4's KCS retrieval did
**not** confirm — it is our own argument and must not be defended by citing KCS. **D174**'s
cross-encoder **options are retrieved as of 2026-09-04 (D207, §5.16) but its CPU viability and the
`k ≈ 60` RRF convention remain unretrieved** (§10.2),
and review A1 suggests the reranker may matter more to retrieval quality than the embedder does.
**Nothing in this set is measured on our corpus**, because there is no corpus — the generic KB is
eight articles.

**OPEN-6's own set, D152–D160, was ratified separately on 2026-09-04** (§5.7). This section
previously said *"ratify alongside OPEN-6"*; the two sets were ratified as separate acts on the same
day, so that pairing is void as guidance and neither set's status may be inferred from the other's.

| ID | Decision | Status | Source and forcing reason |
|---|---|---|---|
| **D167** | **Catalog authoring and KB authoring are separate surfaces with separate flows.** They share a review pattern and nothing else. **Phase one builds KB authoring only.** Catalog authoring drags C3 (the signing key is not on the hub, so per-tenant authoring needs an offline signing step), H1, signing ceremonies and per-tenant key management behind it; KB authoring has none of that, because a bad KB article's blast radius is a wrong answer and a bad catalog entry's is an unwanted machine change. | **Ratified by the founder 2026-09-04** | KB document §1; D110/D111 (the signed/unsigned line is the at-rest/live line), D149 (phasing), C3. |
| **D168** | **`04-TEAM-REVIEW` §7's auto-drafting applies to both surfaces, but arrives in phase two for the catalog.** The drafting *source* differs and that is the point: catalog drafts come from observed resolution sequences, KB drafts from resolved sessions and unanswered queries (D177). | **Ratified by the founder 2026-09-04** | KB document §1. |
| **D169** | **Authoring effort is a measured product metric, not a UX aspiration.** Instrument four things: minutes per published article, drafts reviewed per session, percentage of published articles that were *drafted* rather than authored, and abandonment rate mid-authoring. | **Ratified by the founder 2026-09-04** | KB document §2. Forcing reason: `04-TEAM-REVIEW` §9 **A5** — *"that one IT person can maintain a catalog… if not, our unit economics change and we become a services business"* — and §10's stop condition *"catalog authoring stays engineer-only."* The authoring UX is the instrument that tests A5, and Q38 (the design partner's honest weekly time budget) is the number D169 has to fit inside. |
| **D170** | **The design target is review, not composition.** Every screen optimises for approving, correcting or rejecting something the system already wrote. **If the common path is a blank editor, A5 fails regardless of how good the editor is.** | **Ratified by the founder 2026-09-04** | KB document §2. |
| **D171** | **Articles are structured, not freeform.** Fields: Title, Problem, Environment, Resolution, Cause, plus metadata (owner, entitlement expression, lifecycle state, audience level, source). **Retrieval weights Title and Problem above Resolution**, because users describe problems and not fixes. KCS v6 calls the first field *Issue*; we keep `problem` — recorded as an equivalence, not churned (KB document §3.2). **`Internal Resolution` — KCS's optional field for steps hidden from external readers — is deliberately not adopted:** it would be a supported, structured place to write exactly what D162 forbids, and under D53 article text reaches the model's context where hiding is not available (G4). | **Ratified by the founder 2026-09-04** | KB document §3.2 (rewritten against KCS v6, register §10.4); D162, D53, threat model G4. |
| **D172** | **Lifecycle states are the KCS v6 confidence states, verbatim: Work in Progress (WIP) → Not Validated → Validated → Archived.** Not-Validated articles are retrievable at reduced ranking weight with a visible confidence marker, so partial knowledge is usable immediately rather than invisible until someone finds time. **Archived articles are tombstoned, not deleted** — D113 requires immediate vector removal, and the tombstone is what makes the retraction auditable. This is the schema revision D162 anticipated: `draft` → *Work in Progress*, `unvalidated` → *Not Validated*. | **Ratified by the founder 2026-09-04** | KB document §3.3; D162, D113, §10.4 (states confirmed exactly). |
| **D173** | **Deduplication and archival are first-class admin operations**, surfaced by the system rather than left to be remembered. | **Ratified by the founder 2026-09-04** | KB document §3.7. **Rests on an unverified premise** — that a large unmaintained KB retrieves worse than a small curated one was *not* confirmed against KCS. Cheap enough to do on the argument alone; do not defend it by citing KCS. |
| **D174** | **Hybrid retrieval: pgvector semantic leg + Postgres full-text (`tsvector` + GIN) lexical leg, fused by Reciprocal Rank Fusion, then cross-encoder reranked; 3–5 chunks reach the model.** Each leg returns its top ~50; fused score is the sum of `1/(k + rank)` with **k ≈ 60**, chosen because it needs no score normalisation — BM25 rank 3 and vector rank 3 contribute identically, so incomparable score scales never have to be reconciled. The fused top ~20 is reranked by a cross-encoder scoring query-document pairs directly. **Hybrid is a requirement, not a refinement:** IT knowledge is unusually dense in exactly the tokens semantic search breaks on — error codes, patch numbers, registry paths, product names. `KB5034441` and `KB5034442` embed almost identically because they *mean* the same thing while one is the fix and the other is not; conversely no lexical method connects "printer won't print" to "Spooler service failure", which shares no words. Both indexes live in the Postgres already committed to (D59a, D143), so this adds no dependency, and D47 already requires lexical search for the offline generic bundle — the lexical half is built regardless. | **Ratified by the founder 2026-09-04.** **The lexical leg, the semantic leg and the RRF fusion are BUILT as of 2026-09-04 (B7a, §5.16) — the cross-encoder is NOT.** | KB document §4; review A1. **`[VERIFY]` cross-encoder model options are now RETRIEVED (D207, §5.16); CPU viability on Fargate-class hardware is still not, and D207 records why it is a harder question than a parameter count — a cross-encoder costs per-query × per-candidate.** The `k ≈ 60` convention remains unconfirmed and is carried as `RRF_K` in `server/src/kb/retrieve.js` with the `[VERIFY]` at the constant. **This decision's "each leg returns its top ~50" is implemented as 20** (`CANDIDATES_PER_LEG`), unmeasured either way — with six articles neither number is reachable. |
| **D175** | **Hybrid retrieval de-risks the embedder choice: the embedder is a schema decision, not a foundation.** Combined with review A1's finding that re-embedding 10,000 articles costs under \$3, the hub spec §11 characterisation of the embedder as *"the least reversible decision in the system"* does not survive the number. D144 already sets the direction and stands. | **Ratified by the founder 2026-09-04** | KB document §4; D144, review A1. Superseded framing noted in §5.9. |
| **D176** | **Corpus size is a tenant-tier input.** A `db.t4g.micro` running HNSW plus GIN plus the ticket store plus the job queue is a pilot instance, not a 100,000-article one — HNSW wants its index resident and that instance has 1 GB. Per-tenant indexes (D133, D143) mean the binding constraint is **the largest single corpus, not the sum**. This is vertical scaling, not redesign, **but it must reach the pricing model rather than be discovered in production.** | **Ratified by the founder 2026-09-04** | KB document §3.7/§4. §10.1 already records the retrieved figure (pgvector 0.8.2 on PG 15–18, 2,000-dim index limit, micro holds one ~25k-chunk tenant); the residency claim itself is reasoning, not measurement. |
| **D177** | **The admin's home surface is a review queue, not an article list.** Four feeds, in value order: (1) **drafts from resolved sessions** — the agent resolved something with steps in no article; (2) **KB gaps** — queries that retrieved nothing above threshold, or where the user escalated immediately after an answer; (3) **staleness** — articles whose retrieval leads to escalation more often than resolution; (4) **duplicates**. **Each item opens pre-filled with a one-click approve.** | **Ratified by the founder 2026-09-04** | KB document §5.1. This is the decision D170 exists to serve, and the one the register was missing entirely. |
| **D178** | **Gap-driven authoring is the highest-value output of the whole system to a knowledge owner, and it costs nothing extra** — the queries are already logged. It also answers **Q39** directly: for line-of-business applications we cannot author content for, we can at least tell the customer exactly what is missing. The gap queue pre-fills the new article's `symptoms` from the unanswered query that created it. | **Ratified by the founder 2026-09-04** | KB document §5.1; `docs/kb/2026-09-03-generic-kb-schema-and-findings.md` §5. |
| **D179** | **Admin search runs the same hybrid retrieval pipeline the agent uses, showing retrieval rank and score.** Findability becomes diagnosable by the person who can fix it: **if the admin cannot find it, neither can the bot.** Free — the pipeline already exists. | **Ratified by the founder 2026-09-04** | KB document §5.2. |
| **D180** | **Every article edit offers a preview: the retrieval result and the model's answer with the edit applied, before publishing.** D108 means an edit is live on the next query with no distribution step — a feature, and the reason test-before-ship for content matters. | **Ratified by the founder 2026-09-04** | KB document §5.2; D108. |
| **D181** | **Bulk import connectors are phase-one scope** (Confluence, SharePoint, ServiceNow KB, generic Markdown/HTML). Customers have existing content; requiring re-authoring is a non-starter. **Chunk on semantic boundaries, not fixed character counts** — chunking quality affects retrieval more than embedder choice. | **Ratified by the founder 2026-09-04** | KB document §5.2. |
| **D182** | **Build the KB; do not adopt an open-source KB platform.** Wiki.js, Outline, BookStack and similar are human authoring-and-reading tools — WYSIWYG editors, page hierarchies, web readers. Three mismatches: they do not model D44's per-user entitlement filtering; they ship human full-text search, not hybrid retrieval with reranking for a model; and each is a full application with its own database, auth and upgrade path — **a second thing to install and patch in a customer-hosted deployment, which is the reason Zammad was rejected.** What is actually needed is small: articles, chunks with vectors and tsvectors, an entitlement expression, versions with tombstones, a query endpoint. **Import from them; do not run them.** | **Ratified by the founder 2026-09-04** | KB document §5.2; D44, D59a. |
| **D183** | **Take the chunking pipeline from open source.** Semantic-boundary splitting is solved under permissive licences. Do not reimplement it. | **Ratified by the founder 2026-09-04** | KB document §5.2. |
| **D184** | **Author ≠ approver for the KB is a workflow default, not an integrity control, and is tenant-configurable.** Contrast **D158**, where it is a role constraint enforced by the permission model for catalog changes. The KB blast radius is a wrong answer, and A5's target customer is a two-person IT team that cannot enforce separation of duties. | **Ratified by the founder 2026-09-04** | KB document §5.2; D158, D70a, A5. |
| **D185** | **Retrieval quality is logged separately from session outcome.** Which chunks were retrieved with their scores, which the model used, and the outcome — as distinct records. **This distinguishes a retrieval miss from a reasoning miss, which have entirely different fixes**, and it is what feeds D177's queue. | **Ratified by the founder 2026-09-04** | KB document §6. |
| **D186** | **Trend is reported per category, never only in aggregate.** Rising aggregate deflection can conceal a category getting worse. The Q1 ticket-category export is the measurement baseline as well as the scoping input. | **Ratified by the founder 2026-09-04** | KB document §6; D89, D118. |
| **D187** | **KB-specific metrics for the admin:** articles by lifecycle state; retrieval hit rate; **articles never retrieved** (deletion candidates); **articles retrieved often but followed by escalation** (repair candidates); time-to-publish on queue items. | **Ratified by the founder 2026-09-04** | KB document §6. |
| **D188** | **D90 — the agent explicitly asking "did that fix it?" at session end — is load-bearing and must not be dropped as UI polish.** Without that turn there is no `resolved` category and **the entire deflection metric does not exist.** It is a client behaviour requirement generated by an analytics decision, which is exactly the kind of requirement that gets cut. | **Ratified by the founder 2026-09-04** | KB document §6 (which cites it as D83 — the pre-renumber ID; see §5.11b). D89, D90, D118. |
| **D189** | **No KB browser for end users.** A search box invites keyword-guessing, which is the interaction hybrid retrieval exists to remove: the user describes the problem in their own words and retrieval is the agent's job. A browsable KB would be building the self-service portal this product exists to replace. | **Ratified by the founder 2026-09-04** | KB document §7 (prose, previously unnumbered); D120 stands — Chat, My Tickets, Notices, Status. |
| **D190** | **Sources are shown, not hidden.** When an answer comes from an article, name it and let the user open it — trust-building, and how users learn the KB exists. **Under H5 it must be attributed chrome, not the avatar's own voice.** | **Ratified by the founder 2026-09-04** | KB document §7; H5. |
| **D191** | **"That didn't work" is a first-class button, not a phrasing the user has to find.** It is the signal that populates D177's repair feed, and the same turn carries D90's confirmation. | **Ratified by the founder 2026-09-04** | KB document §7; D90, D177. |
| **D192** | **The bake-off's accuracy ranking between the top three models is not established, and no external claim may be made from single runs.** Observed run-to-run variance on one model at `temperature: 0` between Ollama sessions is **2 cases out of 40** (§10.3: `net-09` and `prn-03` moved identically on both the direct and hub paths), while the post-hardening bake-off separates the top three by **1** — mistral 35, Haiku 36, gemma 37, one run each. **Those numbers are inside the noise floor.** Any comparative model claim needs **3–5 runs per model** first: machine time, not engineering time. **D97's safety conclusion is unaffected** — zero false actions reaching the user came from catalog preconditions and is model-independent. | **Decided** (measurement-derived, 2026-09-03 night) | `server/docs/2026-09-03-B0-walking-skeleton-spec.md` status block; §10.3; `../../client/docs/BAKEOFF-2026-09-02.md` §2b, §2c. Requested as a register entry by the B1 handover Task 1b. **This directly qualifies D139**, whose ``Haiku 36/40 to mistral 35/40`` comparison is a 1-case gap measured once per model; D139 remains the right pick on cost and latency (D97), which is not what is in question. |

#### 5.11d What the document changed about its own §3

§3 was written from memory about Knowledge-Centered Service because the session had no external
access. It has been **rewritten in place** against the KCS v6 findings recorded in §10.4, and every
claim is now labelled confirmed, inference or still unverified. Three things came out of that:

- **Article structure and confidence states are confirmed**, and the field is *Issue* where we say
  `problem` — an equivalence, deliberately not renamed (D171).
- **KCS's audience attribute is five levels** (Internal, Within a Domain, Partners, Customers,
  Public), which the from-memory §3 did not mention at all. It is **a different axis from D44
  entitlement filtering** and both are needed; D162 already carries the requirement that it exist
  before any article is customer-visible.
- **"Findability beats volume" was not confirmed** and D173 rests on it. Recorded as our own
  argument, not as practice.

---

### 5.12 D193–D197 — from building B1 (2026-09-03, night)

**RATIFIED AS A SET by the founder on 2026-09-04.**

**A correction to this register's own bookkeeping, made while ratifying.** These five cells have
read *"Decided"* since they were written, because each was a decision taken under D143's authority
while building — but `CLAUDE.md` and `PROJECT_START_HERE.md` described them as *"still proposed"*.
Both were wrong, in the safer direction. The distinction that actually mattered is the one the
founder has now closed: **an engineering decision taken while building is not a founder
ratification**, and B1 running green was never evidence of one. D197 was the exception — it was a
founder decision from the start.

Five decisions forced by implementing D143's control plane. Details and the exit-criteria status:
`../../server/docs/B1-CONTROL-PLANE.md`. **B1's schema is built and run:** 43 source-level rules pass in `npm test` with no database, and
the **six exit criteria pass — 56 assertions on PostgreSQL 17.11 with pgvector** (`npm.cmd run
test:db`), against a fresh database, a reused one, and a destroyed-and-rebuilt volume. Running it
found one bug, in the test fixture rather than the schema; **no migration SQL needed a correction.**
§10.3 gains no measurement from this work and none is claimed — passing functional tests is not a
performance number.

| ID | Decision | Status | Source and forcing reason |
|---|---|---|---|
| **D193** | **pgvector is installed ONCE per database, into a shared `extensions` schema that sits on every tenant's `search_path` — not into each per-tenant schema.** *(Verified in place 2026-09-03: `db.test.mjs` §0 confirms exactly one `vector` extension, in `extensions`, and §7 confirms a tenant transaction resolves the type and its operators unqualified.)* The plan of record could not be carried out: **a PostgreSQL extension is installed into a *database* and its objects live in exactly one schema**, so `CREATE EXTENSION vector` in a per-tenant template succeeds for the first tenant and fails for the second. The intent is met exactly — a tenant table declares `vector(768)` unqualified and no tenant needs a further migration before it can hold vectors — and there is one extension to upgrade instead of N. Per-tenant HNSW indexes still live in the tenant's own schema, so D176's "the constraint is the largest single corpus, not the sum" is unaffected. Implemented in `server/migrations/control/001-control-plane.sql`; `server/test/db-static.test.mjs` §3 fails if any tenant migration ever contains `CREATE EXTENSION`. | **Decided and built**; exit criteria pass 2026-09-03; **ratified by the founder 2026-09-04** | B1 handover Task 3, which asked for pgvector "in the per-tenant schema template" and cited **`D52a`, an ID that does not exist in this register** (§5.11b; the real citations are D59a and D143). Two defects in one line, and the technical one would have failed on the second tenant. |
| **D194** | **Tenant scoping is `SET LOCAL search_path` inside a transaction owned by `withTenant()`, not schema-qualification of every query.** The handover required a choice between the two and said mixing them is how cross-tenant leaks happen. **The deciding reason is the migration path:** exit criteria 3 and 4 require the same tenant migration file to run unchanged against every tenant schema, which is impossible if every statement names its schema. `SET LOCAL` is transaction-scoped and reverts at COMMIT or ROLLBACK, so a pooled connection carries no path onward — the failure mode that makes setting `search_path` on checkout unsafe. **Enforced structurally rather than by convention: there is no function anywhere that returns a connection already pointed at a tenant.** `withTenant()` is the only door and it owns the transaction; `db-static.test.mjs` §5 fails if a `getTenantClient`-shaped export ever appears, if the pool sets `options: '-c search_path=…'`, or if `SET` is used where `SET LOCAL` is meant. Neither the tenant path nor the control path includes `public`, so an unqualified name that is not where it should be is an error rather than an accidental read of something shared. | **Decided and built**; exit criteria pass 2026-09-03; **ratified by the founder 2026-09-04** | B1 handover Task 3, "pick one and enforce it". D143. |
| **D195** | **`search_path` is a name-resolution mechanism, not a permission boundary. Exit criterion 2 therefore holds against accidental cross-tenant access and NOT against deliberate access, and that limit is recorded rather than papered over.** *(Confirmed against a live PostgreSQL 17.11 on 2026-09-03, not reasoned: inside `withTenant(A)` an unqualified count returns A's 1 row, and a schema-qualified count of B's table returns B's 2. Both are passing assertions in `db.test.mjs` §2.)* Inside `withTenant(A)`, an unqualified query sees only A's rows — but a **schema-qualified** `SELECT … FROM <B>.sessions` reads B's rows, because the application role owns every schema. `server/test/db.test.mjs` §2 asserts **both halves**, the second as a deliberately passing test labelled a known limit, so that nobody reads the criterion as a stronger guarantee than it is. Making it a real boundary means **a database role per tenant** with `REVOKE USAGE ON SCHEMA` for the others — which collides with the ~80-connection ceiling, since a pool per role reintroduces the arithmetic that killed per-tenant pollers. **That is a pooling decision, not a schema decision, and it is deferred.** Row-level security does not apply as things stand: RLS gates rows inside a shared table, and D143 separates tenants by schema. Until then the guarantee rests on `withTenant()` being the only door, which is why that is asserted in the dependency-free suite rather than left to code review. | **Decided** (the limit is accepted for B1; the fix is deferred); **ratified by the founder 2026-09-04** | Found while writing criterion 2's test. **A security review will ask this question, and the answer must be the table in `server/docs/B1-CONTROL-PLANE.md` §6, not a claim of isolation.** Belongs against threat model A3 (malicious tenant admin) and A4 (compromised hub): a compromised hub process already has the application role, so this changes nothing for A4 — it matters for a hub-side code defect, which is the accident case, and that is the case it does cover. |
| **D196** | **`control.job_queue` carries references, never payloads: job id, type, tenant schema, reference id, and no `payload` column or `jsonb` of any kind.** It is the one deliberately cross-tenant table, because per-tenant queues need per-tenant pollers and the connection arithmetic forbids them — so it holds as little as possible. A bug that leaks a job row then leaks a schema name and a uuid; the same bug with a payload column leaks customer data out of the only table that is not tenant-scoped. `enqueue()` has no parameter for one, the table has no column for one, and `db-static.test.mjs` §4 fails if either appears. Two consequences: **`tenant_schema` is a foreign key to `control.tenants(schema_name)`**, so a job cannot name a schema that does not exist and the worker's assertion has something real to assert against; and **`fail()` truncates the error to 500 characters**, because an error string is the most likely accidental route for customer data into this table. Claiming is `FOR UPDATE SKIP LOCKED`, so a second worker steps over a locked row rather than blocking, and one job reaches exactly one worker. | **Decided and built**; exit criteria pass 2026-09-03; **ratified by the founder 2026-09-04** | B1 handover Task 3's four "things to get right", none of which had a register row. D143. |
| **D197** | **PostgreSQL 17 is the RDS major, and the development container is pinned to it.** pgvector 0.8.2 covers PG 15–18 (§10.1) and 17 is the current RDS default track. `server/docker-compose.yml` pins `pgvector/pgvector:pg17`, binds loopback-only on **port 5433** so a real local Postgres cannot be connected to by accident, and caps `max_connections=80` — the `db.t4g.micro` figure that killed per-tenant pollers — so connection exhaustion surfaces on a laptop rather than in the pilot. | **Decided** (founder, 2026-09-03); **ratified by the founder 2026-09-04** | B1 handover Task 3 asked for a pin and attached a `[VERIFY]` on pgvector's supported versions on RDS. **That `[VERIFY]` was already answered in §10.1** — 0.8.2 on PG 15–18, HNSW, 2,000-dimension index limit, micro holds roughly one 25,000-chunk tenant — and no lookup was needed. |

---

### 5.13 D198 — from the first real use of the app (2026-09-03, night)

One decision, forced by an observation rather than by a document. The founder used the app during
the D130 renderer check and typed a greeting. **It answered with a consent card.**

#### What was observed

With a DHCP fault injected — so the machine was offline and the cloud unreachable — the founder
typed *"Hello how are you?"* and got:

> `source: tier0-state (from machine state alone - nothing matched what was typed, and the cloud was unreachable)`
>
> "I didn't catch which part is failing, so I looked at the machine itself. Intel(R) Ethernet
> Controller (2) I225-V has fallen back to a self-assigned address, 169.254.17.252, which means the
> network never gave it a real one. I can renew the lease."
>
> **PERMISSION NEEDED — LOW RISK** … `renew_dhcp(adapterIndex=4)`

**Every mechanism worked exactly as designed.** `routeByState()` is reached only when tier-0 matched
nothing *and* the cloud was unreachable; `client/src/agent/agent.js` is its only caller and says why
("a proposal made without reading the sentence must never run ahead of a model that could have read
it"); the reply opens by admitting it did not understand; the renderer labelled the provenance
honestly; and the consent gate held. Nothing here is a defect in D130, D46 or the router.

**The gap is that nothing classifies the input as social before the state fallback runs.** A
greeting and an inarticulate complaint are treated identically, because the fallback does not read
the sentence at all — which also means it returns the *same* proposal whatever is typed, for as long
as the machine has a visible fault.

| ID | Decision | Status | Source and forcing reason |
|---|---|---|---|
| **D198** | **An unrequested consent card is a cost to D130, not a cosmetic wart — so the social layer (D165) is a safety requirement and not polish, and it must sit AHEAD of the state fallback.** Two parts. **(a) The ordering is load-bearing.** D165's templates must be consulted *before* `routeByState()`, not after: a social classifier added downstream of the fallback leaves this behaviour exactly as observed, and downstream is where it would naturally be written, because the fallback is already the last resort. `client/src/agent/agent.js` is the only caller of `routeByState()`, which is what makes the constraint enforceable in one place. **(b) The reason it matters is habituation.** D130 makes the consent card the thing a user reads before their machine changes; every card offered in response to something the user did not ask for teaches them the card is noise to click past. The mechanism stays intact and the guarantee gets weaker, which is the failure mode no test can catch — `consent-surface.test.mjs` will pass on the day the card has become furniture. **A card the user did not provoke is therefore a defect, even when every gate behaved correctly.** What replaces it is a template answer plus, at most, an *observation* — "while you're here: this machine has no network address, want me to look at that?" — a question, not a proposal, and no card until the user says yes. | **Decided 2026-09-03**, from an observed instance. Not built; D165 is not built either and this is a constraint on how it gets built. | First real use of the app, during the D130 renderer check. **Amends D165**, which argued the social layer on consistency grounds ("so there are not fifty inconsistent ones") — a tone argument. This is the safety argument, and it did not exist in this file: the register contains no other mention of habituation or consent fatigue. Related: D130 (the card), D191 ("that didn't work" as a first-class button — the same instinct, that the user's actual intent should have somewhere to go), H5. |

#### Worth noting about how it was found

**The observation cost nothing and was not looked for.** It appeared within a minute of the first
person using the software for a purpose unrelated to it — the renderer check — and it is the kind of
thing no test would have produced, because a test would have typed a complaint. That is the working
rule in `CLAUDE.md` ("bugs are found by using the software, not reading it") paying for itself, and
it is an argument for the founder running the demo scenarios more often than the three rehearsed
ones.

---

### 5.14 D199 — the embedder (2026-09-04)

Resolves the model D144 left unpicked, which the Phase 1 plan §5 lists as the last of its two
"blocking now" items. Full reasoning and every retrieved figure:
`../2026-09-04-embedder-decision.md`. **Proposed — the founder ratifies.**

| ID | Decision | Status | Source and forcing reason |
|---|---|---|---|
| **D199** | **The embedder is `Snowflake/snowflake-arctic-embed-m-v2.0`.** Apache-2.0; **305M parameters** (113M non-embedding); **768 dimensions** natively with Matryoshka truncation trained for 256 (retaining ~99% of MTEB-R at 256, per the publisher); 8,192-token context; multilingual (its publisher says 74 languages in the blog and 101 in the card metadata — do not quote a number); and named in Hugging Face's TEI supported-models table as model type Alibaba GTE, which is the deployment mechanism D144 already specified. **The deciding reason is not the benchmark — it is that this choice removes Q35 from the critical path.** D144's shortlist splits on multilingual support and Q35 is open; an English-only pick bets on an unanswered question, and waiting for Q35 leaves B7 blocked on something we do not control. Arctic is multilingual *and* English-competitive, so it is defensible under either answer. **Cost of being wrong is bounded and known: re-embedding 10,000 articles is under \$3 (D175).** Rejected, with reasons: **Qwen3-Embedding-0.6B** is the quality pick at MTEB rank 4 against arctic's 41, but 509M–600M parameters on 1–2 vCPU with **no latency measurement in existence** (§10.2) is the wrong risk for an interactive surface, and it is instruction-tuned, which adds a prompt surface to a component whose job is to be boring — it is the documented upgrade if measurement shows headroom. **nomic-embed-text-v1.5** is 137M and would be right if Q35 came back English-only, but its card is explicit that it is **English-only**. **gte-large-en-v1.5** is English and larger than arctic for no offsetting gain. **D174's hybrid retrieval lowers the stakes throughout**: the lexical leg carries the error codes and patch numbers, so the dense leg only has to connect "printer won't print" to "Spooler service failure" — a rank-41 model doing semantic work behind a cross-encoder reranker is not the same proposition as a rank-41 model being the whole pipeline. | **Decided by the founder 2026-09-04. AMENDED IN EFFECT BY D210 (§5.17): its deciding reason — removing Q35 from the critical path — is SPENT, because Q35 was answered "English only, for now" on 2026-09-04. D199 still stands and `nomic-embed-text-v1.5` is the pre-argued alternative with an explicit trigger. Do not read this row without D210.** Unblocks B7. **Ratified without a measurement on our corpus, deliberately** — there is no corpus to measure on (the generic KB is eight articles), and D175 bounds the cost of being wrong at under \$3 per 10,000 articles. The reasons to revisit are written into the decision document §5 and are unchanged by ratification. | D144 (direction and shortlist), D175 (the embedder is a schema decision, not a foundation), D174, §10.1 (pgvector's 2,000-dimension HNSW limit), §10.2, Q35. Forcing reason: it is the last "blocking now" item in `../2026-09-03-phase1-plan.md` §5, and both of that section's gating `[VERIFY]`s are now resolved — so the decision was being deferred against nothing. |
| **D199a** | **voyage-4-nano is the one to revisit, and only if its shared-embedding-space claim is verified.** It is no longer hosted-only: **open-weight under Apache-2.0**, on Hugging Face, and in TEI's supported table (340M, model type Qwen3). Voyage claims all four Voyage 4 models produce interchangeable embeddings and that query encoders can be upgraded *"without re-vectorizing documents"*. **If true, it is the only candidate that satisfies D144's migration constraint by construction** rather than by running one model everywhere — nano self-hosted for customer-hosted tenants, the same vectors queried by a stronger hosted model in managed mode. Three reasons it is not the pick: the claim is **the vendor's own** and stays `[VERIFY]` in §10.2 (this research corroborates that Voyage *says* it, which is not that it is true); the upgrade is **asymmetric and query-side** — documents are vectorised once, so it is a better query encoder and not a free migration in both directions; and its **headline 2,048 dimensions exceed pgvector's 2,000-dimension HNSW limit** (§10.1), so it would run truncated to 1024 and the configuration that sells the model is not the one we could index. **The experiment that would settle it is about an hour:** embed a corpus with nano, query it with hosted voyage-4, measure whether retrieval holds. | **Decided by the founder 2026-09-04 as a standing revisit trigger — NOT a decision to adopt voyage-4-nano.** What is ratified is that the shared-embedding-space claim is worth an hour to test, and that a positive result reopens the embedder choice; the model itself is not chosen and remains `[VERIFY]` in §10.2. | Found while researching D199. It changes the *managed-versus-self-hosted story* rather than a score, which is why it is recorded rather than dismissed. |

#### 5.14a Both of the Phase 1 plan's "blocking now" items are now resolved

`../2026-09-03-phase1-plan.md` §5 lists two. **Neither is still blocking, and one had already been
answered before this session:**

- **The embedder** — D199 above. Its stated gating unknown, *"`[VERIFY]` on ONNX Runtime on
  ARM/Graviton — the one item that could change the pick outright"*, was **already confirmed in
  §10.4** on 2026-09-03. Researching D199 closed it a second way: **TEI publishes an `aarch64` CPU
  image** (`cpu-arm64-1.9`) and documents ARM64 as supported for CPU-only workloads. Two independent
  mechanisms, not one. **The decision had been waiting on nothing.**
- **The WTS APIs `[VERIFY]`** for A4 — **confirmed in §10.4** on 2026-09-03, with the correction that
  the SID comes from `GetTokenInformation(TokenUser)` on the token rather than from any
  `WTS_INFO_CLASS`. **Loose end: the handover answers say D148's wording should name the token → SID
  step and that this was "noted on OPEN-1". OPEN-1's row does not carry that note.** Not fixed here,
  because the register does not silently rewrite a decision's text — it needs the founder's call on
  whether D148 is amended or OPEN-1 annotated.

**What remains from the plan's §9 first week:** the Anthropic Scale-tier clock and the EDR
conversation (item 5, external lead time), and the top-30 ticket categories (item 6, which blocks
evaluating Phase 1 rather than building it).

---

### 5.15 D200–D201 — the named-pipe protocol (2026-09-04)

Designed, not built. Full design, with the primary sources for every claim below:
`../../client/docs/2026-09-04-named-pipe-protocol-design.md`. **Proposed.**

Unblocked by D130 being **verified on a screen** (§10.3a) — the renderer contract this serialises has
now been looked at, which was the stated precondition for freezing it into a wire format.

| ID | Decision | Status | Source and forcing reason |
|---|---|---|---|
| **D200** | **The pipe protocol is JSON Lines over a Windows named pipe, carrying the four `Broker` methods and nothing else.** `listCapabilities`, `validate`, `prepareConsent`, `execute` — the interface in `client/src/broker/broker.d.ts` verbatim, because its whole purpose is that call sites do not change when `InProcessBroker` becomes `NamedPipeBroker`. Request `{v, id, method, params}`, reply `{v, id, result\|error}`, correlated by `id`, replies allowed out of order (an `execute` took 3,064 ms in the real audit trail and must not block a `listCapabilities`). **`execute` takes a nonce and the schema has nowhere to put a proposal** — that is D130 on the wire, and adding a parameter to `execute` re-opens the finding this whole design answers. Byte-mode pipe, so readers buffer and split on `\n`. Limits, all enforced broker-side and all audited: **64 KiB per line** (over-length closes the connection rather than resynchronising a stream whose framing is lost), **8 in-flight requests per connection**, **15-minute idle timeout**, and **deliberately no request timeout** — the consent window is the timeout that matters and the broker already owns it; a request timeout would race a real machine change. **Versioning is D133 exactly: one integer, strict equality, no negotiation.** One installer moves both halves atomically, so skew is not a state the system should reach; a mismatch means a partial upgrade or something impersonating a half, and the answer is to stop loudly and tell the hub, not to find a common subset. **Do not add negotiation later** — it re-introduces the skew D133 deleted and lets an attacker pick the version. Closed error-code set with `consent` refusals explicitly **not** auto-retried by the agent (a silent re-prepare is how an unprovoked second card appears — D198). **One outstanding `ConsentRequest` per CONNECTION, not per process** — per-process would let a second user's card supersede the first user's, a cross-user defect wearing D166's clothing, and it is flagged in the design as the most likely implementation bug. | **Decided by the founder 2026-09-04.** Designed, **nothing built** — ratification settles the shape, not the schedule. The wire format is now the contract: `execute` takes a nonce and has nowhere to put a proposal, and changing that needs a new decision, not a patch. | `CLAUDE.md` carried "the pipe protocol has not been designed yet"; D130 verified on screen removed the reason to wait. The shape is already proven between real processes on a real pipe by `client/test/helpers/pipe-broker-service.mjs`, whose `__`-prefixed introspection methods are test-only and must not exist in the service. |
| **D201** | **The broker hosts the pipe and creates it with an explicit security descriptor, which needs native calls Node cannot make — and this is a deliberate, costed exception to D98.** **The forcing discovery: the transport we assumed cannot work.** libuv passes `NULL` as `lpSecurityAttributes` to `CreateNamedPipeW`, and Microsoft documents that the resulting default DACL grants full control to LocalSystem, administrators and creator-owner but only **read** access to Everyone — so a pipe the LocalSystem broker creates through `node:net` gives the unprivileged agent **read and no write. The agent could connect and never speak.** libuv also omits `PIPE_REJECT_REMOTE_CLIENTS`, leaving a pre-authentication surface on a privileged service. Node offers no API to fix either (nodejs/node#30823, closed `wontfix`). **The DACL:** LocalSystem and Administrators full control; **the interactive user's LOGON SID** granted `FILE_READ_DATA \| FILE_WRITE_DATA \| SYNCHRONIZE` — **never `FILE_GENERIC_WRITE`**, because Microsoft's own note is that `FILE_APPEND_DATA` and `FILE_CREATE_PIPE_INSTANCE` are the same bit, so `FILE_GENERIC_WRITE` would hand the agent **the right to create instances of the broker's own pipe name**, turning an IPC client into an impersonation primitive. Logon SID rather than user SID on Microsoft's explicit guidance for keeping other terminal-services sessions and remote users out — **and it is the same value D148 already reads to attest the user.** Plus `PIPE_REJECT_REMOTE_CLIENTS` and `FILE_FLAG_FIRST_PIPE_INSTANCE`: the broker is a service that starts at boot, before any user session, so it wins the race for the name, and the flag turns losing that race into a loud startup failure instead of a silent compromise. **Rejected alternatives, with reasons:** hardening the DACL after Node creates the pipe (Node does not expose the HANDLE, and the pipe would exist with the wrong DACL for a window — a race in the security of the privileged channel is not a saving); and **inverting it so the agent hosts** (no native code at all, and tempting for that reason, but the pipe namespace is machine-global, so a name the user creates can be squatted by another user's process before the target logs in). **The cost is real and is not hidden: this expands `BROKER-SURFACE.md`, the document EDR allowlisting depends on, which D98 exists to keep small.** The argument for paying it is that the privileged half must have some channel, this is the smallest correct one, and the alternative is not a smaller surface but a wrong DACL — and the calls are pipe-lifecycle only, made once at service start, not growing with the catalog and not reachable by any proposal, which is the property D98 actually protects. | **Decided by the founder 2026-09-04.** Amends D98 by exception, with the exception scoped and argued. **The forcing claim is MEASURED, not reasoned — §10.5.** Ratifying this accepts a named growth of `BROKER-SURFACE.md`, which is what a customer's EDR team reads: the pipe-lifecycle calls must be listed there **before** any implementation merges (design §8 item 9). Still open, and not settled by ratification: the last mile of §10.5 (a real LocalSystem service with a real standard-user agent) and the choice of koffi vs an N-API addon vs a signed helper. | Found while designing D200, from libuv's source and Microsoft's documentation (design §10). `[VERIFY]` **the blocker is retrieved, not measured** — nobody has stood up a LocalSystem service and watched a standard user's write fail. That experiment is minutes and **if the write somehow succeeds, most of D201 is unnecessary**; it should happen before any engineering does. Also unchosen: koffi vs an N-API addon vs a small signed helper, which interacts with D147's `%ProgramFiles%` and separate-DLL requirements. |

#### 5.15a The uncomfortable half, recorded so nobody believes otherwise

**The pipe's DACL is not a defence against threat-model A1, and cannot be.** A1 is user-context
malware; it runs as the user, so it is inside the DACL by construction. Anything running as that
user can open the pipe, obtain a nonce and approve it, and no peer check fixes that — verifying the
client's image path or signature is defeated by injection into the real signed agent, and would
manufacture the appearance of a boundary that is not there.

**What the DACL actually buys:** other users on the same machine cannot reach the channel, remote
callers cannot reach it, and the name cannot be squatted. Those are real threats (A2/A3-adjacent,
A7, A10) and they are worth the DACL.

**What defends against A1 is D130** — the broker executes only what it rendered, and
`AuditRecord.consentRendered` makes a lying agent attributable after the fact. The consent design's
§5 already conceded this (*"nothing in an unprivileged process can be trusted to paint honestly"*);
this section is that concession restated where a reader of the *transport* will meet it, because the
mistake available here is to read a DACL as a trust boundary.

**If a real boundary is ever required**, the answer is the strong form deferred in the consent design
§5 — a broker-owned consent window inside the user's session — which the register's §10.4 has since
**evidenced rather than merely reasoned** (session 0 is non-interactive; `WTSQueryUserToken` plus
`CreateProcessAsUser` with `lpDesktop = winsta0\default` is the route, with its own privilege and
profile-loading requirements). That is a decision with its own cost, not a tweak to this one.

### 5.20 D213–D218 — B6-lite: escalation becomes a ticket (2026-09-04)

**All six came out of the FIRST CLICK-THROUGH OF HUB MODE**, on the day the renderer was finally
put in front of a person. Two defects were reported, one of which nobody had written down:

> *"Still unable to open a ticket. Verbiage says User wants as if they are talking to the Admin.
> The conversation should be with user."*

The first was known and recorded (`renderer.js` printed *"nothing was filed — there is no ITSM
integration in this build"*, correct since 2026-09-02). **The second had never been noticed**, and
it had been shipping on every provider since B0. Both are in §5.20a.

This is the fourth entry in this register whose forcing reason is *someone used the software* —
after D198 (a greeting produced a consent card), §5.18a (the platform seam) and §5.19a's two
classifier defects. That list is now long enough to be a pattern rather than a coincidence.

| ID | Decision | Status | Source / forcing reason |
|---|---|---|---|
| **D213** | **B6-lite: the hub stores tickets, and stores only.** `migrations/tenant/003-tickets.sql` (a `tickets` table plus profile columns on B1's existing `users`), `POST /v1/ticket`, `bin/tickets.mjs`. **It is NOT B6.** OPEN-4's v1 subset is create, assign, state machine, visibility-split comments (D69), attachments, search, dashboard **plus outbound email (D86)** — this is create and a four-state machine. **The missing email is carried in the UI, not only in a comment**: every success response has `notified: false` with a reason, `/v1/health` reports `notifies: false`, the review card says nobody is alerted, the transcript says so after filing, and `bin/tickets.mjs` prints it on every listing. That redundancy is deliberate. D86 is explicit that without an ITSM there is no assignment group and no queue, so a row nobody watches is a record, not a queue — and *"a ticket has been raised"* over a store nobody is watching is the **same defect** as the 2026-09-02 one, wearing a database. | **Proposed. Built and run end to end** (`npm.cmd run e2e:ticket`, MD-1002/MD-1003 against PostgreSQL 17.11). | D73 (internal store is core, resolves C4), D84 (hub is SoR absent an ITSM), D86 + OPEN-4 (email is part of the store, not an enhancement), D143 (tenant schema), D75 (session ≠ ticket, so `session_id` is nullable and non-unique). |
| **D214** | **The avatar's escalation line is GENERATED BY THE CLIENT and never contains the model's `summary`.** `escalationReply()` in `client/src/agent/prompt.js`, called by all three providers, replacing three copies of the same hand-built string. **The bug it fixes:** `escalationSchema()` describes `summary` as *"what the user is reporting"* — a case note, third person, written for whoever picks the ticket up — and every provider spliced it into the spoken reply. So the avatar said *"The user reports a cracked screen. I would hand this to desktop support."* **One string was serving two audiences and the model was obeying its instructions exactly**; the schema was wrong, not the model. The field description now names its reader and says it is never read aloud, and the spoken half is client-shipped text. **It is also now an OFFER rather than a report** — *"I would hand this to X"* is reported speech with nothing to answer, which is why the observed *"yes please hand to it"* landed nowhere. | **Proposed. Built.** Pinned by contract, not phrasing, in three test files: the reply must not contain `summary`, and must end in a question. | The click-through, 2026-09-04. Same family as D165/D212 (a generated answer is a fact, a hand-written one is a claim) and as *"do not let the model author consent text"*. |
| **D215** | **The user profile is local per user; the hub keeps the list.** First name, last name, location, contact ID — in Electron's `userData`, which is per-OS-user by construction — upserted into B1's `users` table on every filing. **`osUsername` is deliberately NOT stored in that file** and is read live from the OS each time, because a username copied into JSON can disagree with the account actually running the software, and saying which account that was is the field's only job. **Everything here is self-asserted and every surface says so**: `users.profile_source = 'self_asserted'`, the review card, and `bin/tickets.mjs show`. `logon_sid` — the column that would carry an attested identity (D148) — stays NULL, because the pipe that would carry an attestation is designed and not built. **`contact_id` is free text on purpose**: deciding it is an email address would be deciding a customer's directory shape from the endpoint. | **Proposed. Built.** | D54 (a user identity entity distinct from device identity, required by D68 ticket history), D55/D145 (SCIM later writes `external_id`/`upn`; these become the fallback rather than being overwritten), D148. Founder instruction, 2026-09-04. |
| **D216** | **The intake is a declarative field list, and it never traps a turn.** One pending intake owned by the `Agent`, checked **ahead of tier-0** — which is the whole point, since *"yes please hand to it"* means something only in the context of the question just asked. The founder asked for *"a full multi-turn interview, but only ask required info it doesn't already know"*; those pull apart if *"does it already know this?"* is a judgement made per question, so **it is not made per question**: `PROFILE_FIELDS` declares what is required, the store reports what is missing, and the intake asks the difference. **A complete profile asks nothing and goes straight to the draft.** Adding a question later is a line in that list. **Three escapes, because a conversation that can only be left by answering is worse than no intake:** an unrecognised answer to the offer passes through and is handled as a new problem, a cancel word cancels at any stage, and a pending intake expires after 15 minutes. **The owner is never asked for** — a user cannot answer *"which team should own this?"* and a null owner is a legitimate value the queue shows as unrouted. | **Proposed. Built.** The passthrough case is pinned in both `test/ticket.test.mjs` and `eval/e2e-ticket.mjs` — it is the property that makes running this ahead of tier-0 safe. | The click-through, 2026-09-04. Founder instruction on intake shape. |
| **D217** | **Egress gets its own audit log: `client/audit/egress.jsonl`, recording the payload verbatim.** Separate from the broker's `audit/audit.jsonl`, which answers *what changed on this machine* — this answers *what left it*. Three reasons, not one: the broker owns its file and every line there is a capability execution with a consent nonce, filing is none of those; `npm test` writes to the broker's log and `reset-demo` deletes it, which is not a lifecycle for a record of personal data leaving an endpoint; and **filing a ticket is the first time identity leaves this endpoint at all** — `Agent.identify()` carried the comment *"Nothing here is sent anywhere"* with tests asserting it. That is no longer unconditionally true, and the answer is to make the exception observable rather than to soften the comment. *"The user consented"* is unfalsifiable a week later; *"here is exactly what was sent"* is checkable. | **Proposed. Built.** | Threat model §8 and D79b (egress has its own risk tier and consent wording), D130 (the audit trail is what covers user-context malware, not a DACL). |
| **D218** | **The endpoint's hub timeout matches the hub's own (300s), raised from 90s.** The hub waits `MATIC_HUB_TIMEOUT_MS` (default 300000) for its model; `HubClient` waited 90000, **so the endpoint gave up three and a half minutes before the hub did**, and a `mistral-small:24b` cold load is comfortably over 90 seconds. **What made it worth a decision is what the fallback says.** On timeout `routeByState()` answers with whatever happens to be wrong on the machine, so *"the screen on my laptop is cracked"* was answered with *"the print spooler service is stopped, I can start it again"* — confident, unrelated, and with nothing in the transcript saying the model was never reached. The sharp consequence for B6-lite: **the first escalation after a cold start silently did not offer a ticket**, which is the first turn of any demo. Now configurable (`config.hubTimeoutMs`, `MATIC_HUB_TIMEOUT_MS`) and logged at startup. | **Proposed. Built.** Found by `eval/e2e-ticket.mjs`, then **reproduced deliberately** with `timeoutMs: 50`, which yields the identical reply. | The end-to-end run, 2026-09-04. **This raises the ceiling and does NOT fix the fallback** — see §5.20b. |

#### 5.20a The two defects, and why only one of them was known

**"Still unable to open a ticket"** was recorded behaviour. `renderer.js` had printed *"nothing was
filed — there is no ITSM integration in this build"* since 2026-09-02, deliberately, because the
demo must not imply an integration that does not exist. What nobody had written down is that **the
escalation reply had by then become a question the software could not hear.** The user answered it.
Nothing was listening, because `Agent.propose(text)` is stateless per turn and no code expected an
answer. The offer was not ignored so much as never expected.

**The voice defect had never been noticed at all**, and it is the more interesting of the two
because every layer was working:

- the schema asked for a third-person case note, which is the right thing to ask for;
- the model wrote a good one;
- the renderer displayed the reply it was given;
- **and the avatar told the user about themselves in the third person.**

No test could have caught it. `summary` was correct, the reply was non-empty, the enums were
enforced, and every assertion about escalation passed — including two that pinned the exact wording
now shown to have been wrong. **The defect was in the seam**, exactly like §5.18a's platform bug,
and like that one it needed a person looking at a screen.

One more consequence worth recording: **the generated capability answer (D212) already promised
this.** It says *"I can look for company guidance on it, or hand it to IT with what I've already
checked"* — generated from the catalog, and therefore a promise the system was not keeping. D212's
argument is that a generated list cannot claim an ability that is not there; that holds for the
capability names and **did not hold for the sentence around them**. It is true as of D213.

#### 5.20b What is NOT fixed, and one thing that is worse than it looks

- **No outbound email**, so no queue (D86). `bin/tickets.mjs` is how anyone learns a ticket exists.
- **The review card has not been seen on a screen.** `eval/e2e-ticket.mjs` approves the draft in
  code. Whether the card renders its fields correctly is a click-through — which is precisely the
  gap that produced this whole section, so it is recorded rather than assumed.
- **`routeByState()` answers unrelated problems with confident machine facts.** D218 raises the
  timeout so it is reached far less often; it does nothing about the fallback itself. A physical-
  damage report answered with the print spooler's state is a non-sequitur at any timeout, and the
  transcript gives no sign that the model was never consulted. **This was a live defect on every
  provider when D213-D218 landed and was not addressed by them.** ~~It deserves its own decision.~~
  **FIXED THE SAME DAY - D219, §5.21.**
- **Nothing here is authenticated.** No device auth (D61/D132), no attested logon SID (D148), and a
  tenant chosen server-side or inferred when exactly one exists. A ticket's reporter is whoever
  typed into the profile.
- **`session_id` is always NULL.** D75 makes a session first-class and distinct from a ticket; the
  endpoint creates no sessions, so the column records that honestly rather than inventing one per
  ticket. D89's `escalated` outcome therefore still has nothing setting it.

#### 5.20c The bake-off does NOT route through the classifier — the carried question, answered

Two handovers carried this as an open item, because if `eval/run-bakeoff.mjs` went through D211's
question/action classifier then the 40-case bake-off would be measuring a path that changed on
2026-09-04, and *"no reason to expect movement"* would stop being an argument.

**It calls the provider directly.** It imports `OpenAICompatibleClient`, `CloudClient` and
`HubClient`, constructs one, and calls `client.propose(...)`. It never builds an `Agent`, so it
never reaches `src/router/classify.js`, `src/router/social.js`, tier-0, or anything added since B0.

**There is a name collision that will mislead the next person who greps for this.**
`run-bakeoff.mjs` defines its own `classify(expected, answer)` at line 113 — that is the *scoring*
function that grades an outcome as correct / false_action / miss. It is unrelated to the router's
`classify(text)`. Grepping for "classify" in that file finds it and suggests the opposite of the
truth.

**So the recorded 33/40 stands and no re-run is needed.** `/v1/turn` is unmodified,
`test/db-static.test.mjs` still pins it as reaching no database, and nothing between the bake-off's
call and the model changed.

**One thing this turned up, relevant to D218.** `run-bakeoff.mjs` has always passed
`timeoutMs: 300000` explicitly to both clients it builds. So the correct value already existed in
the eval harness, and **the 90-second default was wrong only in the place a user actually meets it**
— which is also why the recorded hub bake-off numbers are unaffected by D218. A constant that is
right in the test harness and wrong in the application is a worse failure than one that is wrong in
both, because the harness cannot see it.

### 5.21 D219 — the state fallback stops answering questions nobody asked (2026-09-04)

§5.20b listed this as a live defect that D218 made rarer and did not fix. It is now fixed.

| ID | Decision | Status | Source / forcing reason |
|---|---|---|---|
| **D219** | **`routeByState` reads the sentence — not to route on it, but to decide whether it is entitled to ignore it.** `stateTopicsFor(text)` in `client/src/router/tier0.js` returns one of three things: **a symptom** (printer / sound / network), in which case only branches about that topic may answer; **`"any"`**, when the sentence contains no subject at all — *"help"*, *"nothing works"*, *"my laptop isn't working"* — in which case behaviour is exactly as before; or **`null`**, when the sentence names something machine state cannot be about, in which case **nothing may answer** and the caller falls through to `diagnoseOffline()` guidance. Each state branch now carries the topic it speaks to. **The signature changed to `routeByState(text, probe, evidence)`** — text first, mirroring `routeTier0` — and it **throws** on a non-string, because a caller left un-migrated would otherwise pass a probe as the sentence and get a silently narrower answer, which is this file's characteristic failure. | **Proposed. Built.** 21 new assertions in `test/router.test.mjs`, including the observed sentence against the exact machine state that produced it, and the Day-4 off-script list unchanged and still passing. | Observed 2026-09-04 by `eval/e2e-ticket.mjs`, then reproduced deliberately with `timeoutMs: 50`. Recorded as unfixed in §5.20b the same day. |

**The defect.** On a machine whose print spooler is stopped, *"the screen on my laptop is cracked
right across the bottom"* was answered with *"the print spooler service is stopped, which means
nothing will print. I can start it again."* Reached because `HubClient` timed out (D218) and the
agent fell through to the state fallback, whose own doc comment said it *"ignores the text
entirely."*

**Why it is not simply a bug in that function.** Ignoring the text is *correct* for the case the
fallback exists for. With the cable out there is no cloud to read the sentence, and someone who
types *"help"* must get a proposal rather than silence — the Day-4 exit criterion, and the one
scenario that proves the local path. The question was never "should it read the text" but **"does
the text entitle it to ignore it"**, and nothing was asking that.

**The design had already met this failure mode once and half-solved it.** The `flush_dns` branch is
gated on `egressFailed` because an earlier draft answered *"my chair is broken and my monitor is
cracked"* with *"I can flush your DNS cache"*. That is an **evidence** gate — it asks whether an
observation supports the proposal. What no gate asked is whether the observation has anything to do
with the **complaint**. A stopped spooler is a perfectly good observation; it is just not an answer
to a cracked screen. The two gates are now both present on that branch and neither subsumes the
other.

#### 5.21a The whitelist, and the cost of it

`stateTopicsFor` decides "has a subject" from a **whitelist of subject-free tokens** — grammar and
filler, words that mean *this whole machine* (`it`, `thing`, `computer`, `laptop`, `everything`),
and complaint words that carry no subject of their own (`broken`, `slow`, `useless`). Every token
generic means no subject; **one unrecognised word makes the sentence specific.**

So the bias is towards silence, and **the cost is real and should not be glossed**: a network
complaint phrased in words `SYMPTOMS` does not know — *"I can't get to sharepoint"* — now returns
null here where it once proposed `renew_dhcp`. **That is not silence in the product.** The caller
falls through to `diagnoseOffline(probe)`, which on an offline machine says what is wrong and what
to check. Losing a proposal and keeping honest guidance is the trade this project has taken every
other time it has come up — D205's decline, `routeByState`'s own *"say so; do not reach for a
lever"*, and *"a confident wrong fix is not useful"* in the shared prompt.

A blacklist would bias the other way and would need every physical object anyone might name.

#### 5.21b One consequence in the caller

The agent's last-resort reply used to end *"…and I cannot see anything wrong on this machine that I
am able to fix."* That is now reachable in a state where **the claim is false**: a stopped spooler
plus a user reporting a cracked screen lands there, and there IS something wrong — it is simply not
what was asked about. Mentioning the unrelated fault would be the original defect again, so the
reply now says only what it can honestly say: that this is not something it can act on from here.
**Replacing a non-sequitur with an untruth would not have been a fix.**

#### 5.21c What this does NOT address

- **The state fallback still cannot tell a good proposal from a plausible one.** It proposes from
  what is observably broken, and "observably broken" and "what the user is complaining about" now
  have to *agree* rather than merely coexist. That is a narrower claim than relevance.
- **`SYMPTOMS` has three topics.** A catalog capability outside printer / sound / network would
  need a topic before the state fallback could speak to it.
- **Nothing here is measured.** The Day-4 list is five sentences and the new list is seven; both
  were written by us, and neither is a sample of what a design partner says.

### 5.22 D220 — demo-prep pass: launchers, a warm model, and the 90-second figure explained (2026-09-05)

One pass, scope frozen by `../handovers/2026-09-04-claude-code-handover-demo-prep.md`: no pipe
work, no B2, no B3, no reranker, no refactors. This section records what the pass did and what it
measured. **Nothing here is a design decision; it is stage tooling and numbers.**

| ID | Decision | Status | Source / forcing reason |
|---|---|---|---|
| **D220** | **The demo runs from `main` with the hub, launched by two Desktop icons that preflight before they start, and the model is held resident.** `tools/launchers/start-hub.cmd` → `start-hub.ps1` checks, in order and stopping at the first failure with the fix printed: Node; the Docker daemon (**output read, not exit code**); the Postgres container (started if down, then `pg_isready`); migrations `002` and `003` and **exactly one tenant**; **the corpus chunk count** (an empty corpus is a hub that declines everything and looks correct); Ollama; **both model tags exactly**; VRAM headroom; the port (a healthy hub already on it is *used*, not duplicated). Then it starts the hub in its own window, waits for `/v1/health`, warms both models with `keep_alive: 24h`, **verifies residency and keep-alive on `ollama ps` rather than trusting the setting**, puts one `/v1/ask` and one `/v1/turn` through the hub with the endpoint's real tool schemas (`warm-turn.mjs`), reports every duration, and prints READY. `start-agent.cmd` checks the hub first and says *"the hub is not running"* in words, because from the chair that is indistinguishable from a broken agent. `install-shortcuts.ps1` creates both icons reproducibly. **`OLLAMA_KEEP_ALIVE=24h` is set as a user environment variable** on the dev machine; Ollama reads it at start, so it counts only after Ollama is restarted — the launcher checks the live value. | **Done. Run end to end 2026-09-05:** both paths (hub already running; hub started by the launcher), all checks green, READY printed. Shortcuts created on this Desktop. | Handover Tasks 1, 2 and 4. `PROJECT_START_HERE.md` §2's demo row. |

#### 5.22a What was measured (verifications, not performance claims — §10.3 is unchanged)

This machine, RTX 3090 Ti 24 GB, `mistral-small:24b` Q4_K_M, Ollama 0.33.3, 2026-09-05:

| | |
|---|---|
| Cold load, GPU otherwise free | **12.7 s and 14.5 s** (`load_duration`), 100% GPU, 16 GB resident with a 16k context |
| Cold load while a game held ~7 GB of VRAM | **190 s `load_duration`, 265 s wall**, and the model landed **15% CPU / 85% GPU** |
| Warm bare completion | 0.3 s |
| First `/v1/turn` after hub start, model already resident | 12.8 s — the **prompt prefix** was cold, not the model |
| `/v1/turn` thereafter (six calls) | 2.8–3.6 s |
| `/v1/ask` (five calls) | 11.0 s first, then 4.6–7.7 s |
| `e2e-ask.mjs` (seven turns) / `e2e-ticket.mjs` (four conversations, two tickets MD-1004/5) | 55 s / 16 s total |

**The previous handover's "well over 90 seconds" cold load is real and it is a shared GPU.** With
nothing else on the card the load is fifteen seconds. That reframes Task 2: keep-alive matters (an
evicted model costs the fifteen seconds again on the first turn), but **what turns a demo dead is
another process holding VRAM**, and no keep-alive setting fixes that. `DEMO-DAY.md` §1 now opens
with "close games".

**Two prompt prefixes, one cache.** `/v1/ask` and `/v1/turn` have different prefixes, and Ollama's
prompt cache warmed for one is cold for the other — which is why the launcher fires one of each.
Whether alternating them in a real conversation thrashes the cache was **not measured**.

#### 5.22b Found and left, per the scope freeze

- **A declined question offers a ticket it cannot open.** `/v1/ask`'s decline reads *"I do not have
  company guidance covering this. I can raise a ticket for you."* — model phrasing from the answer
  tool — but the question path arms no intake; only an escalation from `/v1/turn` does. *"Yes
  please"* after a decline is handled as a new problem. The red system line beneath it (*"nothing
  was filed"*) is correct. Same class as §5.20a's generated promise. Recorded in
  `client/docs/DEMO-CLICKTHROUGH.md` §4 and `docs/DEMO-DAY.md` §5; **not fixed**.
- **The review card is still unrendered.** `client/docs/DEMO-CLICKTHROUGH.md` step 6 is where
  Charles renders it; the checklist carries every field and string the code produces.
- `client/eval/e2e-ticket.mjs` pointed at `client/docs/HUB-MODE-RENDERER-CHECK.md`, which never
  existed. Repointed to `DEMO-CLICKTHROUGH.md` (a string, not logic).
- **Two traps met in this pass, both of the "wrong answer wearing the right shape" class**, now in
  `CLAUDE.md`: a `cd` that fails in a chained command silently runs the rest in the wrong directory
  (an `npm install` landed at the vault root, which `PROJECT_START_HERE.md` §3 explicitly forbids —
  caught by `git status`); and `git worktree add ../x` resolved against a shell whose working
  directory was `client/`, putting the worktree inside the repo. Both fixed the same hour.

---

### 5.23 D221–D225 — the admin console scaffold, B2, and its design pass (2026-09-09)

Handover: `../handovers/2026-09-05-claude-code-handover-admin-console-scaffold.md`. Built and
documented in `../../server/docs/B2-ADMIN-CONSOLE.md`. The handover was written against register
v2.18 and treated three things as open that were not: D177 (home is the review queue) was already
ratified; D158's back-door worry does not apply, because the review queue approves **KB** drafts and
D158 governs the **catalog** (D168 separates them); and the register was at v2.19 with D220 taken.
Two of the four rows below record founder answers given in chat on 2026-09-09 to questions this
session asked before building; they are decisions, not proposals.

| ID | Decision | Status | Source / forcing reason |
|---|---|---|---|
| **D221** | **The admin console is server-rendered HTML in the hub process at `/admin`, with no framework, no bundler, no build step and no new dependency.** Forms work without JavaScript; the CSP carries no script source. It is mounted after the loopback refusal and before the API routes, so it is loopback-only by the same mechanism as the API, and it is **not** listed among `GET /`'s routes — it is named in a separate `console` field. Console pages carry `x-matic-hub-auth: admin-session`; the API's `none` is unchanged. **Forcing reason:** §5's dependency discipline ("every extra daemon is a pager") applies to a build toolchain, and D59a's customer-hosted install is "run the service", which a bundler step would make materially worse. The handover's own recommendation; adopted as written. | **Done 2026-09-09** | Handover §2; D59a; H-series install story. |
| **D222** | **B2 is built: local accounts (scrypt), TOTP mandatory with replay refusal, roles carrying permissions, admin-action audit from the first request** — implementing D152, D155, D156 against the shapes 001 laid down, plus the one table 001 lacked: `control.admin_role_permissions`. There is no per-user permission table and a static test fails if one appears. Sessions are server-side (`control.admin_sessions` holds sha256 of the cookie token); the cookie is `HttpOnly; SameSite=Lax; Path=/admin`, and **`Secure` is conditional on TLS or `MATIC_ADMIN_COOKIE_SECURE=1`** because the hub speaks plaintext on loopback and nothing else — the loopback refusal is what makes that safe, and it must become unconditional the day the bind changes. Every state change, every refusal (a role without the permission, a POST without its CSRF token) and every read of a record naming a person (`ticket.view`) writes an `admin_audit` row; `event_class` is `normal` throughout (D155's break-glass class is for when local accounts are the fallback to federation, and today they are the only accounts) and `step_up` is `false` throughout (none of D157's actions exists in the console yet; `totp_verified_at` is recorded so step-up is a check to add, not a migration). **A vendor account (tenant_id NULL) is refused at sign-in, by name**, because D153's grant evaluation is not built. **The first admin is created by `bin/admin.mjs create-user`**, which prints the initial password and the TOTP secret once; there is no sign-up page and no flag to create a user without TOTP. | **Done 2026-09-09** | Phase 1 plan B2; D152, D155, D156, D157, D153. Exit criteria 1–3 pass (`test/admin-db.test.mjs`). |
| **D223** | **A declined question in `control.kb_retrieval_log` is a GAP RECORD, not a transcript, and is readable by any admin whose role carries `review.read`.** The tension: D177 (ratified) makes KB gaps the review queue's second feed and D160a says the queries are already logged; D154 (ratified) gives unescalated transcripts to nobody, and a declined question with no ticket is an unescalated session. The session asked; **the founder chose "show to any admin" on 2026-09-09** over the two alternatives offered (gated to owner/admin with a per-view audit row and a proposed decision; or masked pending a decision). **This draws D154's boundary rather than amending it:** a single question the assistant could not answer is not a conversation, and D154's text is about transcripts. Two facts travel with it: the text column is only populated when `MATIC_KB_LOG_QUERIES=1` (the hub default is off; in the dev database today 14 declines carry no text), and the log is **hub-wide, not tenant-scoped**, because `tenant_label` is a development label (D61/D132 unbuilt) — the review page says both. Forcing reason: without this decision the review queue's only live feed would either be masked (useless to the knowledge owner) or shown by default (a legal-exposure question decided by omission). | **Decided by the founder 2026-09-09** (in answer to this session's question) | D177, D160a, D185, D154, D205. |
| **D224** | **The ticket CLI and the console read and change tickets through ONE query module, `server/src/tickets/query.js`, and the console changes a ticket's state.** `bin/tickets.mjs` holds no SQL of its own any more; a static test fails if any file outside `src/tickets/` touches the `tickets` table. The handover scoped the console's tickets as read-only; **the founder chose to include the state change on 2026-09-09** so that exit criterion 3 ("every admin action is audited") has a real action to audit rather than only login and logout. The console offers only `NEXT_STATES` (forward moves and re-open); the CLI still accepts any state, as the operator's correction tool. Forcing reason (the handover's, adopted): two code paths to the same data diverge, and when the console is doubted the CLI is what gets trusted — the comparison only proves something if they cannot disagree. | **Done 2026-09-09** | Handover §4 item 4; D213. Exit criterion 5 passes. |
| **D225** | **The admin console wears the founder's "Industry" design system: steel on paper, Barlow Condensed over Barlow, square corners, hairline frames, one steel accent, registration marks reserved for the review queue's open gap card and the honest stub.** Applied 2026-09-09 from Claude Design's handback (`../handovers/2026-09-09-claude-design-handback-admin-console.md`), within D221's constraints: no script, one inline stylesheet, no external asset. Four of the brief's questions were answered by the founder through Claude Design's intake on 2026-09-09 and are recorded here as the decision's terms: counts appear as nav badges where a real number exists, as section counts in a rule, and nowhere a number would not change a decision; the handback includes artboards, CSS, per-template markup and a did-not-do note; the typefaces are the design system's, **to be self-hosted from the hub rather than fetched or inlined** (font-src 'self'); registration marks are reserved for the two special objects rather than spread to every panel. **Forcing reason:** the scaffold was honest and not yet good to look at, and "extremely intuitive" is design work that iterates faster on a canvas than in code (handover §5) — but only once the screens carry real data, which is why this came after the build and not before. Fonts shipped the same day, self-hosted at `/admin/assets/` from an allow-list (`B2-ADMIN-CONSOLE.md` §9.1). | **Decided by the founder 2026-09-09; applied the same day** | Brief `../../server/docs/2026-09-09-admin-console-design-brief.md`; D221–D224; D177, D213. |

#### 5.23a What the eight exit criteria proved, and one judgment call

All eight pass against PostgreSQL 17 (`npm.cmd run test:db`, 80 new assertions; `npm.cmd test`,
127 new). Criterion 4 (**no console route reaches an unescalated transcript**) is true trivially —
there is no transcript storage, `sessions` has no content column — so what was built is
`src/admin/tiers.js`: D154's three tiers as a function, refusing the unescalated tier
**unconditionally** (no "unless break-glass", because there is no break-glass event), which the
first transcript screen will have to call. **The judgment call:** a ticket is escalated by
definition, so its detail (the reporter's words, name, location, contact) is shown to any role with
`tickets.read`, which today includes the auditor — within D154's letter, arguably outside its spirit
(the auditor is neither assignee nor tenant admin). Assignment does not exist, so nobody is an
assignee. **Revisit when assignment lands.** Recorded in `B2-ADMIN-CONSOLE.md` §6.

#### 5.23b Not done, and why

- **Nobody has clicked through the console in a browser.** The session that built it does not
  type passwords into forms; every page was driven over HTTP from Node and the rendered HTML read.
  `B2-ADMIN-CONSOLE.md` §7 is the ten-minute click-through for Charles.
- **No step-up (D157), no login-CSRF token, per-process login throttle, no account creation in the
  browser, no QR code for TOTP enrolment.** Each is in the document's honesty ledger with its reason.
- **The review queue shows gaps and cannot act on them.** D177's one-click approve is article
  authoring — the next pass (KB ingestion and search, then the editor).
- **Metrics cannot compute deflection** and says so: the endpoint creates no sessions and D90's
  confirmation turn is unbuilt, so `sessions.outcome` has nothing writing it. This is the item the
  handover asked to confirm before building a dashboard; confirmed, and the dashboard shows the one
  real figure (questions asked / answered / declined) instead.

### 5.24 D226–D229 — Knowledge becomes real: ingestion and search in the console (2026-09-09, later)

Handover: `../handovers/2026-09-09-claude-code-handover-kb-ingestion-and-search.md`. Built and
documented in `../../server/docs/B2-ADMIN-CONSOLE.md` §10. The pass turned the Knowledge
destination's two honest stubs into working screens: a bundle can be pasted into the corpus from
the browser and reports exactly what landed, and the corpus can be searched the way `/v1/ask`
searches it, with both retrieval legs shown unfused beside the fusion.

**BOTH FOUNDER QUESTIONS WERE ANSWERED THE SAME DAY, AND NEITHER WAS ANSWERED AS ASKED.** They were
embedded in the handover's own tasks as questions rather than instructions, and neither blocked
building — the console shipped conservative on both while they were open.

- **D226 was decided NARROWER than proposed:** chunk text on the search results, **for the chunks
  the model actually receives and no others.** Built the same day.
- **D227 was DEFERRED behind a retention policy**, which is now **D229** and is the gate. The switch
  stays off; the review queue keeps showing declines without their text, and that is a known cost
  rather than an oversight.

D228 is *done* and needed no decision.

| ID | Decision | Status | Source / forcing reason |
|---|---|---|---|
| **D226** | **The matched chunk's TEXT is shown on the console's Knowledge search results FOR THE CHUNKS `/v1/ask` WOULD SEND, and for no others.** *(Decided narrower than the row below proposed. The original argument is kept verbatim because the narrowing is only legible against it.)* **What the founder's narrowing buys:** the sent set is exactly the text that produced — or failed to produce — an answer, which is the one question the screen exists to answer, so it is the smallest disclosure that answers it; every chunk below `DEFAULT_TOP_K` shows its ranks and its score and no text, and `node bin/kb.mjs legs` remains the way to read the rest, in a terminal. **The guarantee is structural, not editorial:** `src/admin/kb-search.js` sets `sentText` only when `forModel` is true and strips `text` from the legs, the fusion and the sent list before they leave the module, so a page cannot render an unsent chunk's text by forgetting a condition — there is nothing in the view model to render. `test/admin-static.test.mjs` §5a asserts that shape and `test/admin-db.test.mjs` KB-4 asserts both halves against a live search, from the result rather than the markup, so an empty page cannot satisfy them both. Not markdown: the chunk goes through the `html` tag exactly as stored, and `raw()` stays unused. **The original proposal, for the record:** | D53 says retrieved chunk text does not leave the hub to the endpoint. The console is a different reader: it is rendered BY the hub, over loopback, to a session-authenticated admin holding `knowledge.read` — an admin who can already read every article, chunk and vector through `node bin/kb.mjs`, so the text is not being newly disclosed to a new principal so much as newly rendered for one who has it. **Against:** D53 was written before the console existed, so its "never leaves the hub" was never tested against a hub-rendered browser page; a page is screenshot-able and pasteable in a way a terminal is not; and the corpus is cross-tenant (D45), so every tenant's admins would read every tenant's article text — which is *already* true of `bin/kb.mjs` and of the Knowledge page's article listing. **Forcing reason to decide it rather than assume it:** without the text, a search result says an article's chunk ranked #4 and cannot say why, which is half of the diagnostic the screen exists to provide. **The build does not wait on it.** Results carry article title, id, type, platform, the chunk's `kind`, both leg ranks and the fused score, and link to the article; the absent text is an honest stub on the page naming this row. The build did not wait on it: results shipped with ranks and scores and an honest stub naming this row, and the stub was replaced by the text the same day the answer came. | **DECIDED (narrowed) 2026-09-09 by the founder; built the same day** | Handover §2 Task 2; D53; G4; D45. |
| **D227** | **`MATIC_KB_LOG_QUERIES=1` should be set on the development and demo hubs**, so the retrieval log keeps the question text and a gap record says what was asked. Today every gap row in the review queue reads "Question text was not logged" — 33 questions logged, **0 with text** — which makes the review queue's one live feed a list of times the assistant declined and not a list of things to write. D223 already settled **who may read a logged question** (a gap record is not a D154 transcript; any admin with `review.read`). It did not settle **whether the dev hub logs them**, and that is a separate act because it is the one switch that turns the retrieval log into a table of what employees typed. **Forcing reason:** the console's Task 3 link ("Search the corpus for this") and any future one-click answer are both dead controls without the text, so the review queue's value is gated on this and on nothing else. **DEFERRED by the founder on 2026-09-09, behind a retention policy — that policy is D229 and it is the gate.** The reasoning the founder accepted: the question this row asks is downstream of a question nobody has answered, so answering it first would create a table of what employees typed with no rule for how long it is kept, and "we will decide retention later" is exactly how a log becomes permanent by default. **So: the switch stays off, and the cost is named rather than absorbed** — the review queue's one live feed keeps showing declines without their text, and this pass's "Search the corpus for this" link stays a dead control on real data. **Do not re-litigate this row.** Answer D229; this one follows from it in a line of configuration. When it is set: `tools/launchers/start-hub.ps1`'s environment so the demo hub logs too, and note that it is **not retroactive** — the 33 rows already written stay `NULL`. **D229 WAS RATIFIED THE SAME DAY AND THE SWITCH WENT ON:** `tools/launchers/start-hub.ps1` sets `MATIC_KB_LOG_QUERIES=1` for the hub it starts, `src/kb/retrieve.js` enforces the 90-day window inside every write, and `src/index.js` prints at startup whether text is logged and for how long. The 33 earlier rows stay `NULL`. | **DECIDED 2026-09-09 by the founder — deferred behind D229 in the morning, switched ON the same evening once D229 was ratified** | Handover §2 Task 4; D223; D154; D166; `control.kb_retrieval_log.query_text`. |
| **D228** | **The console and the CLI share ONE ingest, as they already share one ticket query layer.** `ingestAndEmbed()` in `server/src/kb/ingest.js` is called by `POST /admin/knowledge/ingest` and by `node bin/kb.mjs ingest`: validate the bundle whole, write, **refuse the embed step if it would put a second embedding model in the corpus**, embed, report. The shape rules moved into `parseBundle(text, label)` so a pasted textarea and a file on disk meet the same rules and the message names the offending article either way. **Forcing reason:** D224's argument, one layer over — when the browser is doubted the terminal is what gets trusted, and that only proves something if the two cannot disagree; exit criterion 1 is literally "the page's counts equal what `kb:status` prints", which is only a meaningful test if both read the same function. The second-model refusal is CLAUDE.md's "Never embed a corpus with two different models" made into a `null`-or-reason function (`embeddingModelConflict()`) rather than a check somebody remembers to write; `node bin/kb.mjs reembed` stays the deliberate way to change models. | **Done 2026-09-09** | CLAUDE.md's Never list; D224; handover §2 Task 1 and §3 criteria 1 and 3. |
| **D229** | **A retention policy for logged question text, before any hub logs it — RATIFIED with these terms.** *(The proposal's argument is kept below the terms.)* **(1) Window: 90 days** for an unanswered gap — long enough for an IT person who looks at the queue monthly to act on it twice, short enough to defend under employee-notice regimes; a question that recurs after 90 days is logged fresh. **(2) Mechanism: the text is set to NULL and the row is kept**, so Metrics and the review queue's counts do not move; retention applies to the sentence, not to the fact that a question was asked. **The sweep runs inside every log write** (`logRetrieval()` → `pruneQuestionText()`, same client, same transaction) — the control plane has no worker loop and a scheduled job would be a new daemon; `node bin/kb.mjs prune-questions` is the manual form. **(3) An answered or dismissed gap clears its question text at once**: the text exists to write an article (D177, D160a) and the purpose is served when one exists. The answer route is not built; this term is recorded so it is built in, not added. **(4) Customer-hosted hubs: the same default, configurable DOWNWARD only** — `MATIC_KB_QUESTION_RETENTION_DAYS` lowers it, a value above 90 is held at 90 and the hub says so at startup, 0 logs no text at all; there is no "forever". **Two facts travel with it:** a logged question carries **no user identity** (the log has a tenant label and a platform, not a person), so a deletion request cannot be honoured per person, only by expiry — which belongs in the session-start disclosure wording (D127, still unwritten); and **it is not retroactive** — the 33 rows written before it stay NULL. **Forcing reason:** it is the gate on D227, which is the gate on the review queue's whole value — 14 declined questions and not one says what was asked — and it was the cheapest open item because nothing had been logged yet. **The proposal, for the record:** `control.kb_retrieval_log.query_text` is null on every one of the 33 rows the hub has written, because `MATIC_KB_LOG_QUERIES` has never been on. D227 asked whether to turn it on and the founder deferred it behind this row, on the reasoning that a table of what employees typed needs a rule for how long it is kept *before* it has rows in it, not after — "we will decide retention later" is how a log becomes permanent by default, and the first day it matters is the day somebody asks for a deletion this system cannot perform. What it does NOT settle: who may read one — that is D223, already decided. | **RATIFIED by the founder 2026-09-09, as recommended; built the same day** (`src/kb/retrieve.js`, `bin/kb.mjs prune-questions`, asserted in `test/admin-static.test.mjs` §8b and `test/admin-db.test.mjs`) | D227's deferral (founder, 2026-09-09); D154; D166; D223; D127; `migrations/control/002-generic-kb.sql`. |

**What this pass found by running it, rather than by reading it** — the handover's honesty ledger
asked for exactly this, because `ingestBundle()` had never been given a bad bundle:

- **`readBundle()`/`parseBundle()` validate the WHOLE bundle before the first write**, so a bad
  `type` on the *second* article of two leaves the corpus untouched. Now asserted with no database
  (`test/kb-static.test.mjs` §6a) and against a live one (`test/admin-db.test.mjs` KB-1).
- **`migration 002 has no CHECK on `platform`, and an article stamped `Windows 11` is written,
  indexed, embedded and MATCHED BY NOTHING.** The pre-filter compares the column to `'any'` or to
  the probe's exact word (D162), so `windows 11` is a value no machine can ever ask for. It is
  legal, invisible, and looks correct on the Knowledge page and in `kb:status`. **Reported as a
  warning at ingest** (`bundleWarnings()`, "RETRIEVED BY NOTHING") rather than refused, because
  enforcing it is a migration and therefore a decision. **That decision is not taken here.**
- **An ingest reported "5 chunks written" beside "0 inserted, 0 updated".** `upsertArticle()`
  returns an unchanged article's EXISTING chunk count — right for "how big is this article", wrong
  for "what did this action do" — so the report now carries `chunksWritten` and `chunksInBundle`
  separately. Found by reading the page after a re-ingest, which is the class of defect the report
  exists to prevent and had itself acquired.
- **A stray backtick inside the stylesheet's own comment ended the template literal** and broke
  every page in the console. `html.js`'s CSS is a JS template string; the comment now says so.

**And what the search screen makes visible for the first time**, all of it a consequence of things
already in this register rather than new behaviour: searching *"any machine"* cannot return the
Windows reference article (D162, and the page says so in words); an uncovered question still fills
the top five, because the dense leg has no notion of "no match" and returns its nearest neighbours
regardless (§5.16c), so **five chunks are marked "sent to the model" for a question nothing
covers** and the decline is the prompt's job alone (D205). The page states that on the screen
whenever the lexical leg is empty, which is the shape an uncovered question makes.

---

### 5.25 D230 — the article editor's sanitiser question dissolves (2026-09-09, night)

Handover: `../handovers/2026-09-09-claude-code-handover-editor-and-outcomes.md` §1. That handover
framed the editor as gated on one of two choices — write a markdown sanitiser, or take the first
dependency since `pg` — and recommended neither: **the article schema was already designed so an
author faces slots rather than a blank page**, and every slot is plain prose or one sentence per
array entry. None of it is markdown, and none of it needs to be. **Charles confirmed the
recommendation in chat on 2026-09-09** ("option 1"), and it was built the same session.

**The gate did not get answered. It stopped applying.** A form matching the schema — `problem`,
`symptoms[]`, `keywords[]`, `guidance[]`, `escalateWhen[]`, `doNotAttempt[]`, `cause`, one entry per
line on the array fields — needed no markdown rendering, so `raw()` stays unused and `pg` is still
the only dependency (D221). **The one field the schema carries that IS markdown — `body`, and only
on `type: "reference"` — stays out of the editor at v1.** It arrived through the CLI/bundle path
(today's two reference articles, the keyboard-shortcut tables) and is shown back on the edit page,
unedited. This is option 1 of the handover's three, taken as recommended; options 2 (a table-only
mini-format) and 3 (take the dependency) are not built and are not needed until a real admin asks to
edit a reference article's table, which nobody has.

**Writes go through `ingestAndEmbed()`, the same function the paste-a-bundle form and the CLI call**
(D228) — the editor builds a one-article bundle and hands its JSON to `parseBundle()`, reusing the
exact shape checks the paste form is held to rather than writing a second validator, and reuses
`ingestReport()` to show what landed. `bundleWarnings()` is reused too: an unmatchable `platform`
value is reported at save, never refused — the same rule the ingest path already followed.

**Every save sets `lifecycle = 'unvalidated'`, regardless of what it held before** — the handover's
instruction that new content is untested content, applied literally: an edit does not carry forward
a stale confidence claim from before the edit. `kb.article.write` and `kb.article.write.refused`
audit the id and the changed field **names**, never the text, matching the rule `kb.ingest` was
already held to.

**Three things the editor refuses that a bundle ingest, structurally, is never asked about:** a
"new article" whose id already names an existing one (`upsertArticle()`'s `ON CONFLICT DO UPDATE`
would otherwise silently overwrite it — refused with 409, before validation, audited); a rename (the
id is a hidden field on the edit form, never an editable input — the citation key does not move
under an admin fixing a typo in the title); and losing `body`/`scopeNote`/`provenance` on an edit —
the three fields the form does not offer, read from the existing row and carried forward into the
write, so an edit narrows to what actually changed.

**What the handover asked for that this pass narrowed:** "preview before publish — the retrieval
result and the model's answer with the edit applied." The retrieval half is built, and built by
reuse rather than a second implementation — the edit page links into the existing search page
(§5.24, `src/admin/kb-search.js`), prefilled with the article's own `problem` text. **The model's-
answer half is NOT built.** `adminHandler()` receives only the embedder from `src/index.js`, not the
completion provider — a fact `test/admin-static.test.mjs` §5a pins with an exact-match regex on both
call sites — and threading the provider through the router is an architectural change this pass did
not make. Recorded as a narrowing rather than a silent gap: the honest half of "preview" is real, and
the rest waits on a decision to widen `adminHandler`'s dependencies, which is not this row's to take.

**Tests:** `test/admin-static.test.mjs` (unchanged rules — no `raw()`, one query layer, writes only
through `ingestAndEmbed()` — all still pass against the new routes) and a new block in
`test/admin-db.test.mjs` (KB-8): create, edit, the `unvalidated` lifecycle, the audit rows and their
field-name-only diff, the id-collision refusal, `body` carried forward on an edit of a reference
article, the platform warning, a blank-title refusal that keeps what was typed, and the
`knowledge.write` permission gate. **378 assertions with no database (was 366), 310 against
PostgreSQL (was 268).**

| ID | Decision | Status | Source / forcing reason |
|---|---|---|---|
| **D230** | **The KB article editor is a structured form, not a markdown editor.** Fields for `problem`, `symptoms[]`, `keywords[]`, `guidance[]`, `escalateWhen[]`, `doNotAttempt[]`, `cause`, one entry per line on the arrays — plain prose and lists, escaped through `html\`…\`` like every other console field, `raw()` staying unused. **`body` (markdown, `type: "reference"` only) is not editable in this console** and is shown back on the edit page unchanged; the sanitiser-or-dependency choice the previous handover posed is deferred until a real need for rich text in an array entry or a reference table's edit is expressed, not answered preemptively. Writes go through `ingestAndEmbed()` (D228); every save lands `lifecycle = 'unvalidated'`; `kb.article.write`/`.refused` audits the id and the changed field names, never text. A "new article" reusing an existing id is refused (409) rather than silently overwriting it; an edit cannot rename the id; `body`/`scopeNote`/`provenance` are carried forward on an edit rather than blanked. Preview is retrieval-only, via the existing search page — the model's-answer half needs the completion provider threaded into `adminHandler()`, which this row does not do. **Forcing reason:** the handover's §1 gated the editor, the review queue's future answer form, and `raw()` staying unused on this one question; resolving it unblocks the editor without spending the first dependency since `pg` on a need nobody has expressed. | **DECIDED 2026-09-09 by Charles ("option 1"), built the same session** (`server/src/admin/pages/knowledge.js`, `server/src/admin/queries.js`; `test/admin-static.test.mjs` §5a unchanged, `test/admin-db.test.mjs` KB-8 new) | Handover §1; D221; D224; D228; `server/docs/B2-ADMIN-CONSOLE.md` §10.8. |

---

### 5.26 D231 — B3's enrollment mechanism is built; device identity is deliberately not (2026-09-10, night)

Charles asked for B3 (device enrollment) directly, aware of the phase-1 review's 6–8 engineer-week
estimate, and directed the pass to "start with the decisions that block everything else (device
identity model) and build as far as is sound this session, flagging what's left." Reading D60/D61/
D63/D64/D146/D148 together, they form one chain — a real key, held somewhere real, usable by
something real — and no link of that chain can be built alone and mean anything: D61's token
exchange needs a key to sign with (D60/D63), and D64 places that key in broker custody reached over
the named-pipe transport, which is **designed and not built** (D200/D201). Building any partial
version of the chain would have produced a device identity that looked more finished than it could
possibly be.

**So this pass split B3 at its own internal seam.** The phase-1 plan's B3 row names five things —
"pending queue, auto-approve default with per-tenant toggle, rotatable time-boxed secret, rate
limiting with automatic fallback to queued approval, bulk revocation by batch" — and notably does
**not** name a token exchange or device authentication among them; that is D61's row, one layer
over. All five of B3's own named things are built, tested against a live database, and reachable
from the console, the CLI (`bin/devices.mjs`) and `POST /v1/enroll`, all three composing one
function (`submitEnrollment()` in `server/src/devices/enrollment.js`), the D224 pattern applied a
third time (tickets, then the KB, now devices). **Device authentication — D60, D61, D63, D64,
D146, D148 — is entirely unbuilt**, and the Agents page says so in a `notYet()` block rather than
implying otherwise. `server/docs/B3-DEVICE-ENROLLMENT.md` is the full record, including a table
mapping each of the ten device-identity decisions to exactly what this pass did and did not do
against it.

**Two small corrections to the schema B1 left inert**, both in migration `004-device-enrollment.sql`:
`control.tenants.enrollment_auto_approve` (D80's toggle had nowhere to live), and a real foreign key
from `enrollment_requests.decided_by` to `admin_users(id)` (a bare `uuid` since B1, correct for a
table nothing wrote yet, wrong once an admin's real id is what lands there).

**One design choice worth naming as a choice:** `POST /v1/enroll` accepts a tenant slug from the
client, which reads at first glance like the exact mistake `/v1/ask` and `/v1/ticket` refuse (D61,
D132: "a client-supplied tenant becomes the tenancy model by default"). It is not the same mistake,
because the claim here is authenticated — by the enrollment secret (D81) — where the other two
routes have nothing to authenticate an unauthenticated claim with. `src/devices/route.js`'s header
makes the argument in full; it is recorded here because a reviewer skimming CLAUDE.md's rule would
otherwise flag it as a regression.

**Tests:** `test/admin-static.test.mjs` §5b (one query layer for devices, D224's pattern) and the
Agents page's own rules; `test/admin-db.test.mjs` **B3-1 through B3-4** against a live database and
a live hub — secret mint/list/revoke, auto-approve on then off and the pending-queue path that
produces, approve/reject including the reject-revokes-the-device state-machine rule, the
no-tenant-enumeration property, bulk revocation, and the five-failures/429 rate limit.
**384 assertions with no database (was 378), 342 against PostgreSQL (was 310).**

| ID | Decision | Status | Source / forcing reason |
|---|---|---|---|
| **D231** | **B3's enrollment mechanism (D80–D83a) is built; B3's implicit prerequisite, device identity (D60/D61/D63/D64/D146/D148), is deliberately not.** The pending queue, the per-tenant auto-approve toggle, the rotatable time-boxed enrollment secret, rate limiting with a volume-based fallback to queued approval, and bulk revocation by batch — all built against a live database, all reachable from the console (`GET/POST /admin/agents/*`), the CLI (`bin/devices.mjs`) and `POST /v1/enroll`, all three composing `submitEnrollment()` in `server/src/devices/enrollment.js` (D224's one-function pattern, a third time). Device identity is untouched: no key is generated anywhere, no assertion is signed, no request is authenticated as coming from a specific device — a device on the Agents page is KNOWN (it once presented a valid secret), not PROVEN. The cut follows the custody chain's own dependency order: D61 needs a key (D60/D63) to sign with; D64 places that key in broker custody reached over the named-pipe transport, which is designed and not built (D200/D201); building a partial custody chain would misrepresent how finished device auth is. **Forcing reason:** Charles asked for B3 and to start with what blocks everything else; reading the decision family together showed that "everything else" is device identity, which cannot be built in slices smaller than "a key, held somewhere real, usable by something real" without producing something that looks more finished than it is — so the pass built the half of B3 that stands on its own (the phase-1 plan's own five-item B3 description, which does not itself name a token exchange) and named the other half as the next slice rather than a partial attempt at it. | **DECIDED 2026-09-10 by the session, from Charles's direction; built the same session** (`server/src/devices/enrollment.js`, `server/src/devices/route.js`, `server/src/admin/pages/agents.js`, `server/bin/devices.mjs`, `server/migrations/control/004-device-enrollment.sql`; `test/admin-static.test.mjs` §5b new, `test/admin-db.test.mjs` B3-1..B3-4 new) | D60–D67a; D80–D83a; D132; D146; D148; D200/D201; D224; phase-1 plan §3 (B3 row); `server/docs/B3-DEVICE-ENROLLMENT.md`. |

### 5.27 D232–D235 — the v7 avatar integrated and driven from its manifest; the endpoint's connectivity model; the persona file; ticket status and a user-worded capability answer (2026-09-10)

Claude Design delivered against `BUST AVATAR SPECIFICATION` V7 · 2026.09.09 (five files:
`matic-avatar.svg`, `matic-avatar.css`, `matic-avatar.manifest.json`, `matic-avatar-harness.html`,
a README), and the founder's handover
(`../handovers/2026-09-09-claude-code-handover-avatar-integration.md`) asked for an audit before a
line was written, because it had been drafted from the specification and not from the client
source. **The audit** (`../handovers/2026-09-10-claude-code-handover-avatar-integration-built.md`
§1): the avatar was a Web Component of absolutely-positioned divs with eleven states and **no
`declining`**; a D205 decline rendered `thinking → speaking → idle` with a **red** `sys bad`
transcript line — not `apologising`, so the handover's hypothesis was wrong in its specific form,
but a correct behaviour was still dressed as a failure, in the transcript rather than on the face;
and **there is no tray icon** (`main.js` imports no `Tray`), so the status dot is a separate piece
of work. Three further placement errors against v7's own rules were on screen: a fix that ran and
failed showed `error` (v7: "that is apologising"), the escalation OFFER showed `escalating` (v7:
escalating follows declining, it is the ticket that exists), and an ACCESS_DENIED from the
unprivileged half showed `escalating` too.

**What was built.** The five files are in `client/src/renderer/avatar/` byte-for-byte (verified
with `cmp`). `<matic-avatar>` (`matic-avatar-element.js`) replaces `vendor/matic-bot-avatar.js` and
keeps its `state`/`viseme` property contract, so `renderer.js` and `TTSVisemeDriver` needed no
change to speak to it; it adds `size` (the manifest's crop bands: head below 96, nothing below 32)
and `theme`. **The manifest is loaded, not transcribed**: `avatar-model.js` imports the JSON as a
module and exposes the twelve states, the crop and floor rules, the tray reads and the phoneme table
from it; the model and the element contain no state literal beyond the manifest's own default, and
`test/avatar.test.mjs` fails on one. The same test parses the delivered CSS and asserts every
`[data-state]` eye/mouth pairing equals the manifest's — the stylesheet's own comment says "must not
drift from it", and now that is a check rather than a hope. The SVG and CSS reach the renderer
through a **generated** module (`matic-avatar.assets.js`, `npm.cmd run avatar:build`), because a
`file://` page cannot `fetch()` its own directory in Chromium; the module is a mechanical copy and
the test fails while it is stale. The manifest's `minSize`/`degradedBelow`/`parked`/`belowFloor`
rules are **enforced** with a console warning (v7 §05's misuse row): `escalating` under 96px is
refused and shows `idle`, `ingest` is refused everywhere, nothing renders under 32px, `accept` warns
under 96px. The renderer sets **`declining`** on a knowledge-base decline AND on an escalation offer,
holds it (the offer is open — its tray read is `needsYou`), sets `escalating` only when a ticket has
been filed and has a reference, `apologising` on a fix that ran and did not help, `error` on
ACCESS_DENIED and on a filing that failed. The state label under the face follows the element's
`statechange` event, which closes a small defect the audit found: the viseme driver set `speaking`
directly and the label never showed it.

**The phoneme decision was measured, not argued (handover §3).** `npm.cmd run avatar:compare`
speaks six real product strings through the real `piper_worker.py` and compares both tables on every
phoneme. 732 phonemes, 47 distinct. **The manifest's table knows none of the IPA Piper emits** — it
is eSpeak-ng ASCII (`T D S tS 3: @U`), and Piper's alignments are IPA (`θ ð ʃ tʃ ɜ ʊ`) — so 428 of
732 occurrences (58%) would have resolved to `closed`. The existing table drives the mouth; the
manifest's is loaded for comparison only. **The same run found the existing table wrong too**: it
carried `ɜː`, `iː`, `aɪ`, `oʊ` as single keys, and Piper never emits them — a length mark is its own
alignment row (merged by the worker, so the key that arrives is bare `ɜ`) and a diphthong is two rows.
`ɜ`, `ɚ`, `ɔ`, `ᵻ`, `ʲ` were falling to `closed` for whole stressed syllables ("work", "person",
"spooler", "restart"); they are added from the measurement, and the test's IPA fixture is the
observed set, not a guess. Every ASCII key both tables know, they agree on (23 keys, 0 disagreements).

**Two defects in the delivery, recorded rather than fixed** (the delivery's own rule is to edit
sources and regenerate, and no generator was delivered): the harness does **not** inline the SVG
byte-for-byte (its embedded C2PA metadata differs from `matic-avatar.svg`'s); and the harness's
"Dark panel" toggle puts the theme class on an ancestor, where `.mav`'s own token declarations on the
svg beat it, so **the field is not knocked out on the harness** — the element puts the class on the
svg and it is. The harness's "Reduced motion" toggle drives the avatar rigs but not the tray strip's
static vocabulary (those rules live only under the real `@media`), so the manifest's tray acceptance
test cannot be run from the harness toggle; it needs the OS setting. The manifest's own claim that
"the reference implementation logs a console warning" for `escalating` under 96px is not true of the
harness (it shows a caption); it is true of the element now. The manifest already records the
`happy` = `arc-up` alias (handover §4), so nothing was added.

**Connectivity (D233).** The handover named the connectivity model as out of scope and worth
naming; the founder asked for it directly, with the question "how does an agent reconnect — could the
hub signal its previously attached agents?" The register had already answered the shape of it:
D49's three states, D50's authenticated heartbeat, D51's hysteresis, D114's no persistent connection,
D132's proposed 60 s ± 15 s and N = 3. `client/src/agent/hub-link.js` builds the client half:
`GET /v1/health` with a **shape check** (`ok: true`, `hub: "matic-desk-hub"` — a captive portal's 200
is not a hub, D50's reason), every real request's transport outcome reported by `HubClient`, three
consecutive failures to declare `unreachable`, ONE success to leave it and nothing else, failure
retries at 20 s so the declaration takes about a minute rather than D132's three, full-jitter
exponential backoff capped at the interval while down. **The hub signals nobody, because it cannot
and need not**: endpoints are behind NAT and host firewalls, the hub holds no list of them to
signal, and a hub that restarts is rediscovered by every endpoint within one interval with nothing
to replay. **The heartbeat response is the hub's directive channel** — the client already honours a
bounded `heartbeat.intervalMs` if the hub ever sends one — which is the hook for a server-directed
cadence without a second channel. The pill under the voice pill shows the three states; the
transcript states every loss and recovery (D51's "stated to the user"); the face goes to `error`
(v7's "I've lost my connection to the service desk") on a loss while idle and back on recovery.
**It is not authenticated.** D50 asks for an authenticated heartbeat and that needs a device
identity (D61), which D231 deliberately did not build; `status().authenticated` is `false` on
purpose and the pill's tooltip says so. The server half — a `/v1/heartbeat` that takes the device
key id, returns policy and catalog versions and a directive — is the next slice and is not built.

**Not seen by a person.** The element was driven in a browser from `avatar-check.html` at every
size and in both themes (screenshots in the handover); the Electron window has not been watched
through a conversation. `client/docs/AVATAR-RENDERER-CHECK.md` is Charles's list.

**Tests:** `test/avatar.test.mjs` (118) and `test/hub-link.test.mjs` (40) new; **650 assertions across
13 files, up from 492 across 11.**

| ID | Decision | Status | Source / forcing reason |
|---|---|---|---|
| **D232** | **The avatar is Claude Design's v7 bust chassis, placed in `client/src/renderer/avatar/` verbatim and driven from `matic-avatar.manifest.json`, which is the state table.** `<matic-avatar>` keeps the previous element's `state`/`viseme` contract and adds `size` and `theme`; no state name, pairing, colour or motion value is written in code; the delivered CSS's pairings, the generated assets module and the absence of state literals are tests. The manifest's size rules are enforced with a console warning and a fallback to `idle`, never to a nearest state. **State semantics, from v7's placement rules:** `declining` = cannot help, offers a ticket, nothing filed — the knowledge-base decline AND the escalation offer, held while the offer is open; `escalating` = a ticket exists and has a number; `apologising` = a fix ran and did not help; `error` = our fault (hub gone, ACCESS_DENIED, a filing that failed); `ingest` parked. **The mouth is driven by `viseme-map.js`, the debugged IPA table, not the manifest's `phonemeToMouth`**, because `npm.cmd run avatar:compare` measured the manifest's table as knowing none of the IPA Piper emits (428/732 occurrences would close the mouth); five bare vowels the debugged table also missed were added from that run, and any change to which table drives the mouth re-runs it first. **Forcing reason:** the handover's audit found a correct behaviour (a D205 decline) displayed without a state of its own and dressed as a failure in the transcript — v7's own argument that routing a decline to an apology teaches the user the assistant is unreliable at the moment it is being reliable — plus three placement errors; and a hand-copied state table is the class of drift this project has paid for twice (`stateTopicsFor`, the capability answer). | **DECIDED AND BUILT 2026-09-10** (`client/src/renderer/avatar/*`, `client/scripts/build-avatar-assets.mjs`, `client/scripts/compare-phoneme-maps.mjs`, `client/src/renderer/renderer.js`, `client/src/renderer/index.html`; `client/test/avatar.test.mjs` new; `vendor/matic-bot-avatar.js` removed). **Not watched in the Electron window by a person** — `client/docs/AVATAR-RENDERER-CHECK.md`. **No tray icon exists** (audit §1.3); the tray reads are exported from the manifest for the day one does. | Handover `../handovers/2026-09-09-claude-code-handover-avatar-integration.md` §1–§7; v7 §02 (separation rule), §04 (accessory suppression), §05 (misuse row); the v6 handover's item 2 (declining vs idle below 44px); D205 (the decline is a field); D212 (generated, not typed); D214 (the spoken line). |
| **D234** | **The assistant has a persona, and it is a client-shipped data file: `client/src/router/persona.json`** — its name (`Matic`, team `Matic Desk`), the vocatives stripped before the social residue test, the boot line, every social line per subkind (greeting, how-are-you, thanks, farewell, off-topic; several each, rotated in order so a repeated greeting gets a different line), the fixed sentences around the generated capability list, and the two last-resort sentences (hub unreachable / hub answered with nothing usable). **Two rules, both tests:** nothing in the file may name a capability — what the assistant can DO stays generated from the catalog (D165/D212), and `test/persona.test.mjs` checks every line against the catalog's own words; and nothing may claim an outcome the system cannot attribute (no "notified", no "fixed"; D213, D86, H5). The classifier's social markers and filler are widened at the same time ("how are you today", "how are you doing", "what can you fix", "good morning matic desk", "bye for now") with the swallowing tests unchanged: "hey matic, my printer is broken" and "my desk phone is dead" are still problems. **Forcing reason:** Charles's first two runs of the new avatar — a greeting with the assistant's name or one extra word went to the hub, cost a cold model load and came back as a 502, and the fixed lines that did fire were correct and cold; a personable assistant is the product, and D165's constraint (deterministic, client-shipped, never model-authored) is satisfied by a data file exactly as the consent wording is by `plain/*` in the catalog. | **DECIDED AND BUILT 2026-09-10** (`client/src/router/persona.json`, `classify.js`, `social.js`, `agent.js`, `renderer.js` boot line; `test/persona.test.mjs` new, 89). The hub's decline and answer prose is still hub-authored and attributed (H5) — the persona does not reach it. | D165, D198, D212 (generated capability answer), D213/D86 (no outcome claims), H5; Charles's runs of 2026-09-10 ("I am not feeling the love"); `_plainNote` in `catalog.json` (the same argument for consent wording). |
| **D235** | **A question about an EXISTING ticket is answered from the endpoint's own egress record, and the capability answer is generated from `plain.helpsWith` in the catalog.** `classify()` returns a fourth kind, `tickets`, on complete phrases ("my open tickets", "status of my ticket", "i opened a ticket") with the new-ticket phrases ("raise a ticket", "open a ticket") vetoing the match, so a request for a ticket is still a request; `EgressAudit.filedFromThisMachine()` reads `audit/egress.jsonl` and lists a `ticket.submitted` only when a `ticket.filed` with a reference followed it — a failed or unanswered filing is never listed, because listing it would claim a filing the hub did not confirm; `ticketStatusReply()` names the references, when, and the user's own words, and **every variant says that checking a ticket's progress is not built** (the hub's ticket table needs a route and a user identity, D54/D68/D69 — the "My Tickets" destination of D120 is still unbuilt). `plain.helpsWith` is a per-capability catalog field in the user's words ("a printer or another background Windows service has got stuck and needs a nudge") — catalog data like `plain/*`, reviewable and never model-authored; `capabilityReply()` lists those instead of titles and falls back to the title when one is missing, so a new capability is never silent, only sysadmin-sounding until someone writes its phrase. The disruptive one is still named by its precise title, because that is what its consent card will say. **Forcing reason:** Charles asked for his open tickets' status and got a knowledge-base decline about "company guidance" — the wrong kind of no — and asked for a capability summary that will stay user-friendly as tools are added; both had to stay generated (D165, D212) rather than hand-written, so both became data the generation reads. | **DECIDED AND BUILT 2026-09-10** (`client/src/router/classify.js`, `social.js`, `persona.json` `tickets.*`, `src/ticket/egress-audit.js`, `src/agent/agent.js`, `src/main/main.js`, `renderer.js`; `catalog.json` `plain.helpsWith` ×4 + `_helpsWithNote`; `test/ticket-status.test.mjs` new, 36; `test/persona.test.mjs` extended). **Not built:** the hub-side lookup (`GET /v1/tickets` by a user the hub can trust) — it is D54's user identity arriving through the back door if done on a self-asserted `osUsername`, and is recorded as the next slice with that caveat. | D54, D68/D69, D120 (My Tickets), D165, D212, D213/D217 (the egress log exists to be the record), D234; Charles's run of 2026-09-10. |
| **D233** | **The endpoint has a connectivity model — D49's three states with D51's hysteresis — built client-side as `HubLink`, and the reconnect question is answered: endpoints come to the hub on a jittered cadence, the hub signals nobody, and the heartbeat RESPONSE is the hub's directive channel.** Probe = shape-checked `GET /v1/health` (a bare 200 is not a hub, D50); evidence also = every real request's transport outcome, reported by `HubClient`; enter `unreachable` after 3 consecutive failures, leave on ONE success and on nothing else; failure retries at ~20 s, full-jitter backoff capped at the 60 s ± 15 s interval while down; a bounded server-sent `heartbeat.intervalMs` is honoured; no persistent connection (D114). Surfaced as a pill, a transcript line on every transition, and the `error` face while idle. **It is an identified reachability check, not an authenticated heartbeat**: D50 needs D61, which is unbuilt, and the status object says `authenticated: false` so nobody upgrades it in prose. **Forcing reason:** the avatar now has a face for a condition the client could not detect (the handover §6 named this), the founder asked for a reconnect method, and the alternative — a hub that pushes to endpoints — needs an inbound path that corporate NAT does not offer and a connection model D114 already rejected; a client-initiated heartbeat whose response carries directives is the standard shape (Intune, every EDR agent) and the register had already chosen it in D50/D114. | **DECIDED 2026-09-10; client half BUILT** (`client/src/agent/hub-link.js`, `HubClient` reporting, `main.js`/`preload.cjs` IPC, `renderer.js` pill and transitions; `client/test/hub-link.test.mjs` new, 40). **Server half PROPOSED, not built:** `POST /v1/heartbeat` taking the device key id (KNOWN, not PROVEN, until D61), returning policy version, catalog version and `heartbeat.intervalMs`; becomes D50's authenticated heartbeat when the device assertion exists. All timing values are D132's proposed ones or derived from them, and D115 stands: the interval is a capacity parameter. | D49, D50, D51, D114, D115, D132 (values table), D120 (Status destination), D131 (the agent's heartbeat is not evidence of broker posture — still true), D231 (why not authenticated); v7 `error` panel copy; founder's direction 2026-09-10. |

---

### 5.28 D240–D243 — the end-user panel is the delivered design, the developer surface becomes an inspector, and the tickets band ships with its limit legible (2026-09-10)

Claude Design's panel delivery (`client/src/renderer/panel/matic-desk-panel.html`, kept verbatim) integrated the same day, against `docs/handovers/2026-09-10-claude-code-handover-panel-integration.md`. **D236–D239 were taken earlier the same day by the hub-side retrieval-mode / live-health / sessions-and-outcomes work** (commits `b5d9cf7`, `24f8f3e`) and are not yet sectioned in this file; that is why this section starts at D240 and nothing between is free.

| ID | Decision | Status | Links |
|---|---|---|---|
| **D240** | **The end-user panel is Claude Design's delivery, and everything the endpoint used to say ABOUT ITSELF moves to an inspector that is hidden by default.** The old three-column renderer put a state name, a voice pill, a facts table, four JSON panels and a developer log permanently in front of a person whose printer had stopped; the new panel is the conversation plus the assistant, with the machine view collapsed into one line and the inspector absent until asked for. **The routing rule is the load-bearing part, and it is not "show less":** every line the renderer writes is now either OURS (state names, capability ids, template names, `source: tier0`, broker JSON, retrieval internals — to the inspector and the developer log) or THEIRS (what the system did, did not do, and cannot do — "nothing was filed", "no email was sent", "whether it was stored is unknown", "the service desk is reachable again" — staying in the transcript as a plain note). **Nothing in the second list was removed to make the surface calmer**, because every one of those lines exists because of a shipped defect (D86, D205, D213, `700d920`), and the tidier surface is exactly where they would be lost. Also from the delivery: the evidence for a proposal appears above the card as a restatement of a probe value rather than as a row in a band nobody opens; a decline gets an answer's frame and no error colour; an offer carries its own Yes / No thanks, inside the message that made it (the affordance D216's confirmation turn needs, built before the turn that needs it — handover §6); and the three connection states are said in the user's words, with the standing sentence and the spoken reply required to agree. **Forcing reason:** the design exists because the endpoint was showing its own machinery to end users; adopting the layout without moving the vocabulary would have reproduced the defect inside a nicer frame. | **DECIDED AND BUILT 2026-09-10** (`client/src/renderer/index.html` rewritten, `renderer.js` rewritten around the same branch set, `src/main/preload.cjs` + `main.js` for the one new read; `test/panel.test.mjs` new, 67; `client/docs/PANEL-RENDERER-CHECK.md`). **Deliberately not adopted from the harness:** the scene switcher (not state — `data-scene` has two values, `first` and `live`), the inspector-variant control (ours: `overlay`, with `inline` for development and for showing a buyer), the "Change my answer" affordance on an answered offer (a filed ticket cannot be unfiled), and the Settings button (there is no settings surface behind it in this build). | D130 (the card is displayed, never authored), D165/D212, D198, D205, D213/D216/D217, D232 (the face carries the state the label used to print), D233/D49/D51, H5; `700d920`. |
| **D241** | **`matic-panel.css` is GENERATED from the delivery's `<style>` block, verbatim and whole, and `matic-panel.app.css` is the hand-written half.** The avatar's argument (`matic-avatar.assets.js`) applied to the panel: the app needs the CSS as a linkable stylesheet, so a second copy of those bytes has to exist, and a copy diverges where a generated one cannot — `npm.cmd run panel:check` and `test/panel.test.mjs` fail while it is stale. **Nothing is stripped, including the harness chrome**, because the moment the script decides which rules the app "needs" the check stops proving the app matches the delivery and starts proving it matches the script's opinion — and the rules it would have to reason about are the shared ones (`.segrow` wraps both the harness's theme switch and the tickets band's filter). The unused rules are inert and cost about 2 KB on a page that loads nothing from a network. **The direction of truth is the opposite of the avatar's and the consequence is stated rather than discovered: the panel delivered a harness and no sources, so a design change ARRIVES AS A NEW DELIVERY.** App-only rules — the 1160×800 stage becoming a real window, and the surfaces the design did not draw (the D213 review card, the guidance card, the system note) — live in the hand-written file, which may use the tokens and may not redefine one; a test enforces that, because an override there would make the delivery a lie without changing a byte of it. **`panel-check-frame.html` is generated from `index.html` for the same reason:** a hand-written check page is a second copy of the panel's markup, and the day it drifts is the day it stops checking the app and starts checking itself — in the one place nobody would notice, because both pages would still render something plausible. | **DECIDED AND BUILT 2026-09-10** (`client/scripts/build-panel-assets.mjs`, `npm run panel:build` / `panel:check`, `client/src/renderer/panel/PANEL-DELIVERY-README.md`). The 35 `--matic-ui-*` names go in unchanged and none collides with the avatar's `--matic-avatar-*` family; the test counts both sets. | D232 (the avatar's generated-assets precedent), `06304ac` (`.gitattributes` already pins `.css`/`.html` to LF, which is what keeps the check from reporting stale on a fresh checkout). |
| **D242** | **The tickets band ships, and what it shows is only what the endpoint honestly knows: the tickets THIS machine filed and got a reference for.** The design added a band the brief did not ask for; D235 had just built the data behind it, so it is implementable today — and it inherits that commit's limitation, which is that **the endpoint knows what it filed, not what happened to it.** So every row reads "Filed from here / Progress not visible" where a status would go, and the band's note says progress cannot be checked in this build, **in the same words `persona.tickets.some` speaks**, so the band and the spoken answer cannot describe one ticket two ways. A build that cannot file at all says that instead of showing an empty list. **The alternative — an empty-looking status view — is the worse outcome by a distance:** the user reads "no news" where the truth is "no lookup". The read is local (`EgressAudit.filedFromThisMachine()` over a new `ticket:filed` IPC channel); **there is no channel here that could become a hub lookup**, because a hub-side lookup keyed on the self-asserted `osUsername` is D54's user identity through the back door. | **RATIFIED 2026-09-11** (Charles: *"do d242"*), having been built reversibly on 2026-09-10 — see §5.43. **The reversal is spent:** the escape was that the trigger and markup came out of `index.html` if the answer was no, and the answer is yes, so **the band is permanent and twenty assertions now pin what it may and may not say** (§7 of `panel.test.mjs`, up from five). No new ID: the decision is this one, and nothing about it changed on ratification. | D54, D68/D69, D120 ("My Tickets"), D86, D213, D235. |
| **D243** | **The theme is the user's and persists; the inspector variant is ours; the window is not shown until it has painted.** Of the harness's three controls only the theme is a real preference (handover §3), and it is kept in `localStorage["matic.theme"]` and applied by an inline script at the top of `index.html` — **before first paint**, because `renderer.js` is a module and therefore deferred, so reading it there shows one frame of the wrong theme on every launch. The main process holds no opinion about it and needs none: `BrowserWindow` is created with `show: false` and shown on `ready-to-show`, which removes the frame-of-wrong-colour question entirely rather than answering it with a guessed `backgroundColor`. **Forcing reason:** a preference that resets every launch is not a preference, and a dark-mode user opening a light window is the first thing they see. | **DECIDED AND BUILT 2026-09-10** (`index.html`, `renderer.js`, `src/main/main.js`). No new IPC channel: a per-user display preference that the main process never reads does not need one. | D232 (the avatar's `theme` attribute follows the panel's, so the field is knocked out on dark — v7 §05). |

**Also changed, and worth knowing:** `persona.fallback.hubUnreachable` and `.hubNoAnswer` said *"The panel on the left shows what I can see"*. There is no panel on the left any more — the machine view is a collapsed band at the top — so both lines now name it as it is. That is the same class of defect as the pill that disagreed with the reply (`700d920`): prose and layout describing one thing two ways, with only the prose under test.

**Two design deviations, asked for against the running panel on 2026-09-10 and recorded rather than absorbed.** Charles centred the wordmark, and then: *"Can we add some color to the menus that open and the buttons. Match with Avatar. Looks bland all one color."* The observation is exact — **the delivery's accent (`#5980a6`) is the avatar's `--matic-avatar-paper-line`, the quietest blue on the chassis**, so every button, band and label was drawn in the colour the avatar uses for a ruled line on a sheet of paper, while the pods, collar and halo beside them were used nowhere. The fix stays inside D241: **new tokens under the delivery's own prefix** (`--matic-ui-live`, `-deep`, `-wash`, `-edge`), copied by value from `matic-avatar.css` and **pinned to it by a test**, so a repainted chassis fails the run rather than leaving the panel in last month's blue; dark takes two steps up the same family because the pod blue is unreadable on `#1b2126`. **No delivered token is redefined** — the test that forbade any `--matic-ui-*` declaration in the app stylesheet now forbids the intersection instead, which is what the design handover §2 actually asks for. Structure stays the delivery's; anything that RESPONDS (a button, a band that opens, the label on a thing you can act on) takes the live blue. The ticket reference deliberately did NOT take it: a mono string in the live blue reads as a link and nothing is behind it. **Both deviations belong in the next delivery rather than in `matic-panel.app.css` for ever, and its §d says so.**

**What a headless test cannot do here, said once.** `test/panel.test.mjs` proves the stylesheet is not stale, that no developer control is on the end-user surface, that our vocabulary is not in a user-visible string, and that the D130/D86/D205 rules survive the rewrite. It cannot see a screen. The session that built this drove the real renderer against a fake bridge (`panel-check.html`) and watched the consent flow, both bands, the inspector, dark mode, the offer, a filed ticket, a citation and a hub transition — **and nobody has yet watched the panel in Electron against a real broker, a real probe and a real hub.** `client/docs/PANEL-RENDERER-CHECK.md` is that list.

---

### 5.29 D244–D245 — a closed enum is glossed and not hidden, and a fact about what the system did not do is said once, on the surface shown before the user acts (2026-09-10)

From a screenshot of a running session that escalated, filed `MD-1007` and was thanked
(`docs/handovers/2026-09-10-claude-code-handover-panel-copy.md`). Four things reached the user that
should not have, in the form they took. **Two of the four were already built and the observation was
wrong about them** — the handover said so would be the case and said the code wins; what the running
code needed was agreement, not construction. §5.29a records that, and §5.29b records the four design
items this pass deliberately did not fix.

| ID | Decision | Status | Links |
|---|---|---|---|
| **D244** | **A closed enum that reaches the end-user surface is GLOSSED, with the stored value kept beside it and subordinate. It is never hidden and never de-underscored by a string transform.** The review card rendered `CATEGORY needs_human_judgement` — our enum, in snake_case, at an office worker. **Hiding the field is the wrong fix and the tempting one:** the card is the payload view, D128 requires the user to see what is being sent, and a field they are approving cannot be the field that disappears. So the value is the plain words ("needs a person") and the raw enum sits under it, smaller, at the colour every other fixed row already uses. `ESCALATION_PLAIN` in `renderer.js` is the table, `ESCALATION_CATEGORIES` / `ESCALATION_OWNERS` in `src/agent/prompt.js` stay the authority on which members exist, and `test/panel.test.mjs` reads the enums out of that file and fails on a member with no plain words, on a "gloss" that still contains an underscore, and on any snake_case token in a string the renderer writes at the user. **The owner column was already readable and was still wrong underneath:** `suggestedOwner.replace(/_/g, " ")` is correct English for all five of today's members and mis-renders the first one that is an acronym (`it_security` → "it security"), which is a coincidence holding a surface up. It is a table now, and deliberately NOT `ESCALATION_OWNER_LABELS` — that one is the SPOKEN form and carries the article the avatar needs ("the identity team"), which a label column does not. **Forcing reason:** the same class as D240 — our words reaching a user who has no use for them — but with a consent requirement attached, so "show less" is not available as an answer. | **DECIDED AND BUILT 2026-09-10** (`client/src/renderer/renderer.js`, `matic-panel.app.css`, `test/panel.test.mjs`). Subordination is bought by DARKENING THE GLOSS, not by fading the raw value: §5.29b's contrast item is about the column beside it, and answering a copy defect by adding a second instance of a suspected accessibility one is not a trade worth making. | D128, D130 (the card shows what is sent, field for field), D213/D217, D240, D214 (`ESCALATION_OWNER_LABELS`, the precedent this copies and the one it must not be confused with), the `SERVICE_PLAIN` table. |
| **D245** | **A fact about what the system did NOT do is stated ONCE per exchange, in one wording, on the surface shown BEFORE the user acts.** The review card said *"This is stored on the hub for IT to pick up. No email is sent in this build, so nobody is alerted automatically."* Three lines later the transcript said *"MD-1007 is stored for IT to pick up. No email was sent — this build has no outbound notification."* Both honest, each right at its own moment — one is pre-send consent, one is post-send confirmation — but **the card does not go away when it is answered**, so the two end up adjacent, in different wording for the same fact, which reads as anxious and undercuts the reference it arrives with. The card's wording is the one that survives, because the card is the one shown before the user agrees, which is where honesty about what sending achieves has to be. The post-send line now carries the reference and a pointer and nothing else: *"Stored as MD-1007. The card above says what that does and does not do."* **This is NOT a licence to delete such a line.** D213's five surfaces are intact and the transcript is still one of them — the card IS in the transcript. Deleting the fact from both would re-open D86/D213, and `test/panel.test.mjs` checks both halves: the card's caveat must still contain it, and the post-send note must not mention email, notification or alerting. | **DECIDED AND BUILT 2026-09-10** (`client/src/renderer/renderer.js`, `test/panel.test.mjs`). | D86, D205, D213, D240 ("do not delete a line saying what the system did not do"), `700d920`. |

**5.29a — two of the four observations were already answered in code, and one of those was not yet true in wording.**

- **"Nothing running" (the idle status) was a real defect and is app-side copy.** It sits under *"Ready when you are"* and means no task is in progress; a few centimetres away is a band listing this machine's services, and on an IT tool it can be read as *no services are running*, which is alarming and wrong. It is now **"Nothing in progress"** — a task is what is in progress; a service is not. **The delivery's own word was "Nothing running", so the app now differs from the delivery in one string**; §5.29b carries it for the next delivery, and `index.html` says so at the line.
- **"The hub state changes where nobody is looking" was wrong, and the two surfaces still disagreed.** A transition into `unreachable` has produced a transcript note since D240, and the standing degraded band sits under the utility bar; the corner indicator was never the only surface. But the transcript note disagreed with the other two in **two** ways, and both were checked against `agent.js` rather than reasoned about. It named only *the service desk*, where the band, the rail and `persona.fallback.hubUnreachable` all name **the company's guidance AND the service desk** — which is what is actually lost. And it said *"questions and tickets will wait until it's back"*, which implies a queue: **nothing is held.** `HubClient.fileTicket()` returns "nothing was sent" immediately and a question gets the fallback reply, not a place in a line, so a user who read "will wait" and stopped re-asking had been told something untrue by inference. The note now says what it cannot do, names both halves, does not apologise and promises no queue, and a test pins all three properties.

**5.29b — four items recorded for the next design delivery and deliberately NOT fixed in `matic-panel.app.css`**, per the rule `63011a4` set. They are in `docs/handovers/2026-09-10-claude-design-handover-panel-copy-followups.md`, which is the file the next delivery reads — **rewritten at the end of 2026-09-10 as the complete brief** once D244–D250 had accumulated more for it: these four are its §3, and its §1 is the larger ask that came out of the whole run, which is that **four surfaces the delivery never drew at all** (`.turn-note`, `.ticket-review`, `.todo-card`, `.transcript-turn`) are now permanent parts of the product and should stop being our approximations.

1. **The disclosure bands carry a square and a chevron, and the square reads as a checkbox.** **The markup was checked and it is NOT a checkbox** — both triggers are `<button>`, and `.glyph-machine` / `.glyph-ticket` are decorative `<span>`s with a 1px border, so a screen reader announces a button and the feared accessibility defect does not exist. Two affordances on one control is still a visual question for Design. **A real accessibility gap was found next to it and fixed here, because it is ours and not the design's:** neither trigger carried `aria-expanded`, so the open state was drawn and not announced.
2. **Prose is set in monospace** (`CASE NOTE`, `ALREADY CHECKED`). Mono signals machine output — **and there is a real argument the other way**, that mono signals *verbatim, not paraphrased*, which is exactly the property D128 and D130 want of a payload view. Listed as a question for Design, not as a fault.
3. **The label column fails AA in light, and passes in dark.** No longer an impression: `--matic-ui-ink-quiet` on `--matic-ui-surface` is **3.53:1** in light and **4.65:1** in dark; AA needs 4.5:1 for normal text, and the column is 11px, which is not "large". **This is arithmetic over two declared hex values, not a measurement** — it does not join §10.3's four measured numbers.
4. **The `+` in the top right is unlabelled — visually.** It is `<button class="inspector-trigger">` with `aria-label` and `title` both reading "Show what I proposed, checked and did", so it has an accessible name and a tooltip; the glyph is a crosshair, and it reads as "+" / "add" to anyone who has not hovered.

**Also fixed here, found by clicking the check page rather than by reading anything.** The delivery rotates the disclosure chevron when a band is open, keyed on `data-set` — the harness's markup hook, which D240 removed from `index.html` because it belongs to the scene switcher. `63011a4` re-keyed the open trigger's wash onto `data-band-key` and **missed the chevron**, so a band opened and its only state indicator stayed inert. Restoring the delivery's own behaviour on the app's own attribute is app glue, not a design change, and there is nothing here for a delivery to carry. Both halves are pinned by a test now. **The check page had two fixture defects of its own**: the canned escalation carried `category: "account"`, which is **not a member of `ESCALATION_CATEGORIES` at all** — a fixture proving the panel handles a shape nothing can send it — and the draft that followed a mailbox-migration offer described a docking station, so the one card through which user data leaves the machine was demonstrating a payload that did not match the conversation above it.

**A trap worth recording, because it wore the right shape (§10.5's class, again).** The chevron defect was first "confirmed" by reading `getComputedStyle(el).transform` on an element inside the check page's iframe — from the PARENT frame's `window`, which returns defaults rather than the child's computed style, and with the Browser pane hidden, which freezes an in-flight CSS transition. It reported an identity matrix in every state, which is exactly what a broken rotation looks like. **The defect was real, and the evidence for it was not.** What settled it was an independent check that does not depend on rendering at all: enumerating the stylesheets and asking `el.matches(rule.selectorText)` in each band state — zero matching rules before the fix, exactly one after. **Use the child frame's own `defaultView`, and never read an animated property while the pane is hidden.**

**923 client assertions across 16 files, up from 869.** Still nobody has watched the panel in Electron: `client/docs/PANEL-RENDERER-CHECK.md`.

---

### 5.30 D246 — a failure returns two strings, and the one the user hears is persona data (2026-09-10)

Found by writing §5.29's honesty ledger rather than by a screenshot, and fixed the same evening when
Charles asked for it. §5.29's own last entry said this was seen and left as out of scope; it is not
out of scope, it is the same defect one call further down.

| ID | Decision | Status | Links |
|---|---|---|---|
| **D246** | **A failed egress returns `error` — what the user is TOLD, from `persona.filing` — and `detail` — what WENT WRONG, which is ours. The renderer speaks the first and routes the second to the inspector, the developer log and the egress record. One field may not do both jobs.** `HubClient.fileTicket()` had one `error` field carrying a transport diagnostic, and the renderer SPOKE it, so a user whose ticket had just failed heard *"Could not reach the hub at http://127.0.0.1:8787: fetch failed. Nothing was sent."* — our word for the thing, our port number and Node's phrasing, read aloud by the avatar, on the surface D240 exists to have cleared. Five outcomes can reach it and **every one of them was ours**: two sentences in `main.js`'s IPC handler ("no hub provider is configured", "the draft was incomplete"), "No hub URL is configured", the timeout line, and — the worst — `body?.error ?? \`HTTP ${res.status}\``, which is either the hub's own log-facing error string or **a bare status code, spoken**. **Nothing was deleted:** every diagnostic that was in `error` is in `detail`, and `detail` is now the richer of the two because it can name the route without having to read well. **The user's sentences are persona data (D234)** — `persona.filing`, five keys — so `test/persona.test.mjs` checks them against the capability-word and outcome-claim rules like every other spoken line, and `test/hub-client.test.mjs` asserts that no member of `{hub, a URL, an HTTP status, a Node error name, 127.0.0.1}` survives into `error` on any of the five paths while `detail` stays non-empty on all of them. **Forcing reason:** D240 routed the renderer's own vocabulary off the surface and stopped at the renderer; a provider three layers down was still writing the sentence the avatar says. | **DECIDED AND BUILT 2026-09-10** (`client/src/router/persona.json`, `src/agent/hub-client.js`, `src/main/main.js`, `src/renderer/renderer.js`, `panel-check-bridge.js` + `panel-check.html`, three test files). The `timeout` line claims **neither** outcome, because a timeout is the one case where nothing is known; `filed` (`false` vs `null`) carries that distinction and the renderer's note states it. | D240 (the routing rule, one layer up), D234 (spoken lines are persona data), D245 (and the note beside it must not say the same thing twice), D86/D213, D244. |

**5.30a — "the hub" was also on the review card and in the tickets band, and those are read far more often than any failure.** The card's caveat said *"This is stored on the hub for IT to pick up. No email is sent in this build…"* — the one screen in the app where a user is asked to approve data leaving the machine, naming its destination in our word. The panel calls it **the service desk** in the rail, in the standing band and in every persona line. Both now do too:

- card (before sending): *"This is stored for the service desk to pick up. No email goes out, so nobody is alerted automatically — someone has to come and look."*
- band (a ticket already filed): *"Stored for the service desk to pick up. No email went out, so nobody was alerted automatically."*

**Every fact survives** — stored, someone must come for it, no email, nobody alerted — which matters because D245 made the card the single place the no-email fact is stated. The assertions that used to pin these pinned the **phrasing**, and both broke; they pin the **facts** now, which is what CLAUDE.md's rule about `escalationReply` already said.

**"In this build" was left alone, deliberately.** It is jargon-adjacent and it is the honest temporal qualifier D235/D242 chose, and `persona.tickets.some` says it in exactly the same words on purpose — the band and the spoken answer must not describe one ticket two ways. Changing it on one surface would have broken that pairing silently. It is named in the test so the next reader does not have to re-derive the decision.

**5.30b — the check is a net over three shapes, and it says what it cannot see.** `test/panel.test.mjs` §5b scans every literal reaching a person from `renderer.js`: a literal third argument to `el()`, a ternary of two literals in that position (the band's row picks its sentence that way), and every literal inside a `.textContent = …;` statement. Object-literal values are **deliberately not scanned** — those are the inspector's payloads and the `SOURCE_NOTE` table that feeds `devlog`, and both are where these words belong. **It cannot see a string built at run time from a variable**, which is why `surfaceWrites` (§5) is still the other half of it. Writing the net is what found the two instances in 5.30a: the sweep was built for one string and returned three.

**5.30c — the failure branch had never been run.** Reaching it needs a hub up enough to make an offer and down enough to refuse the filing, which is why a spoken URL survived two integration passes. `panel-check.html` has two one-shot triggers now — *next filing: fails* and *next filing: times out* — and the fake bridge returns `HubClient`'s failure shapes field for field, **reading the real sentences out of `persona.json` rather than carrying copies**, because a check page with its own copy of a string keeps passing on the day the real one changes. Both were driven: the unreachable case speaks *"I couldn't reach the service desk just now"* with the URL in the inspector and the log, and the timeout case speaks *"I'm not sure that one got through"* with the note beside it carrying the uncertainty in the attention style.

**1012 client assertions across 16 files, up from 923.** Still nobody has watched the panel in Electron.

---

### 5.31 D247–D248 — the broker's strings, audited: what it says out loud and what it keeps for the record (2026-09-10)

Asked for directly after §5.30's honesty ledger said the `error`/`detail` split stopped at
`fileTicket` and that the broker-derived strings were *"likelier to be fine, but 'likelier to be
fine' is not 'checked'"*. They were not fine. **`ExecutionResult.message` is SPOKEN on every path —
success, failure, needs-broker, and every consent-gate refusal — and it carried Win32 call sites,
capability ids, registry keys and the consent protocol's own vocabulary.**

| ID | Decision | Status | Links |
|---|---|---|---|
| **D247** | **The same split, one layer down: what the broker SAYS is separate from what the broker KEEPS, everywhere the renderer speaks it.** Six findings, each fixed by moving the machine's vocabulary to `detail` and the audit record rather than by deleting it. **(a)** An executor that throws produced `That did not work: ${err.message}`, and `err.message` is `OpenServiceW(spooler) failed (Win32 error 5)` — an API name, a registry key and an error number, said out loud. `detail.win32` is new and carries it; `detail.code` and `.call` were already there, and the audit record's `error` object is untouched. **(b)** Every consent-gate refusal was spoken in the protocol's words — *"no consent nonce was presented - nothing was executed"*. Each is a pair now: a spoken sentence and an audited string, and the audited one keeps the protocol's vocabulary because the record exists to answer what the gate did. **The expired case is not exotic** — the window is 120 seconds and a user who reads a card properly will meet it. **(c)** Re-validation at execution time spoke `refused at execution time: ${validation.errors.join("; ")}`, and those gate messages name capability ids, adapter GUIDs and control masks. **(d)** `describeServiceRestart` named the service by its REGISTRY KEY — *"Restarted the spooler service"* — to someone whose printer had stopped and who could not find that name anywhere in Windows. The catalog carries `plain.serviceNames` now, mapping each enum member to **what Windows itself calls it** (`services.msc`'s display name, not our key and not a euphemism we invented); a test fails if an enum member has none. **The before → after pair is untouched**, because that pair is what the "money line" freeze was protecting. **(e)** The consent card's `rollbackNote` said *"this can be undone with: reset_adapter"* — our identifier, on the screen where a person grants permission. It resolves to that capability's title now. **(f)** The RENDERER interpolated two broker diagnostics into `say()`: `validation.errors[0]` as the fallback when a provider returned no reply, and `prepared.error` with no fallback guarding it at all. Neither is spoken now; both are one line up in the inspector, where `checked()` and `consented()` already put them. **Forcing reason:** D240 routed the renderer's own vocabulary off the surface and stopped at the renderer; D246 moved one layer down to a provider; this is the layer under that, and it is the one that speaks on the happy path. | **DECIDED AND BUILT 2026-09-10** (`client/src/broker/catalog.json`, `in-process-broker.js`, `capabilities/index.js`, `src/renderer/renderer.js`, `src/main/main.js`, `panel-check-bridge.js` + `panel-check.html`, five test files). Also: `say(replyText ?? …)` became `||`, because `??` falls back only on null/undefined and a provider returning an empty `reasoning` made the avatar speak silence. | D130 (the card is displayed, never authored — unchanged), D240, D244, D245, D246, D214, D232, §13. |
| **D248** | **The consent card's exact call should be GLOSSED as well as shown — D244's treatment, applied to `rendered.detail`.** The card carries `restart_service(serviceName=spooler)`, built from the validated parameters. **It is deliberate and it is documented:** `broker.d.ts` defines the field as the exact call, `docs/D130-RENDERER-CHECK.md` checks it by name, and it was verified on screen on 2026-09-03 and ticked. It is also our identifier and a registry key, in a function-call signature, on the one screen where a person grants permission — which is exactly what D244 refused to hide on the review card and glossed instead. The proposal is the same answer: a plain-language line above, the exact call below and subordinate. **It is a change to the rendered contract** (a new field, which the pipe protocol serialises) rather than a patch, which is why it is proposed and not done. | **RATIFIED AND BUILT 2026-09-11** (Charles: *"do d248"*) — see §5.42 for what the gloss says and where its words come from. **Superseded by that section rather than by a new ID**, because the decision is the one proposed here and nothing about it changed. **What had ALREADY been done needed no decision and no contract change:** the renderer now paints that field in the review card's raw-value treatment — mono, a step down, subordinate by size and position — instead of as body prose the same size as the sentence above it. **Not one byte of the text changed**, D130's verbatim rule is intact and the field-for-field check still passes. If the answer is no, the styling stands on its own. | D128, D130, D200/D201 (the wire format is a contract), D244. |

**5.31a — what was deliberately NOT changed, and why.**

- **`validate().errors` still name capability ids, GUIDs and control masks, on purpose.** They are the gate explaining itself, they go to the inspector and the audit record, and three test sections assert their content. What changed is that the renderer no longer puts one in the avatar's mouth.
- **"Flushed the DNS resolver cache." and "Renewed the DHCP lease" are left as they are.** They are jargon-adjacent — and they are Microsoft's names for real things a user can look up, and the catalog's own titles say the same. Whether the spoken success line should use `plain.what`'s wording instead is a product-copy question, not a defect, and it is on the design follow-ups list rather than answered here.
- **The Scenario 1 money line's structure.** `describeServiceRestart`'s comment says the wording is kept verbatim because it is the demo's money line, and a test pinned the whole string. **What that freeze was protecting is the BEFORE → AFTER pair** — the three assertions around it are all about a real restart not reading as a no-op — and that is untouched. The service NAME was incidental to the argument and was our key. **This is still a change to a line Charles demos, and it is named here for that reason.**

**5.31b — the check page returned success and only success.** `panel-check.html`'s fake bridge always resolved `execute()` to a canned "Printing is running again", so **none of the three failed-fix paths had ever been rendered** — not the Win32 failure, not the needs-privilege refusal, not the expired consent. Three one-shot triggers now drive them, and driving them immediately found a defect introduced in this pass: the rewritten `needsBroker` sentence explained the same thing as the `.turn-note` directly beneath it, in different words — D245's defect, and it does not read wrong until the two are on screen together. It is short now and the note explains. **Two fixture defects went with it**: the canned consent `rendered.detail` was a paragraph of prose where the real broker produces `capabilityId(param=value)`, so the card on the check page had never shown that field in the form the app renders.

**1048 client assertions across 16 files, up from 1012.** Still nobody has watched the panel in Electron.

---

### 5.32 D249 — this environment's own identifiers are SHOWN and never SAID (2026-09-10)

Charles, against the running panel: *"Speaking computer names could be tricky especially in a corp
environment. Ok to display computername but it should say this pc."* Then, on being shown what else
was in the same class: *"do the username too"*, and *"fix 2 and 3 as well"*.

| ID | Decision | Status | Links |
|---|---|---|---|
| **D249** | **The machine's name, the signed-in account and this machine's own addresses may appear on screen and may go on a ticket. None of them is spoken.** A corporate hostname is `FIN-LON-0442`; a corporate account is `j.okonkwo` or `CORP\a.petrova`; an address is `10.14.203.88`. Each carries a department, a site, a person or a subnet; each is read out in an open-plan office where other people can hear it; and each is **bad audio** — a synthesiser spells a hostname, mangles a dotted username, and reads an address as "ten dot fourteen dot two hundred and three dot eighty-eight". On screen all three earn their place: the machine name is how a user knows the assistant means the machine in front of them, the account is a fact the ticket carries (D215 labels it self-asserted), and the address is the evidence a network fix worked. **`say()` is the only thing in the renderer that reaches the voice, so it renders one string and speaks another** — the D246/D247 split again, with the two audiences being the eye and the ear. The rule lives in `src/renderer/spoken-form.js`, which is PURE and separate for one reason: `renderer.js` touches `document` at module scope and no headless test can import it, so a rule kept there could only ever be checked by reading the source. **The interesting part is not the rule, it is the boundaries**, and every one of them is wrong in a way reading does not show. A hyphen is a word boundary to a regular expression, so `\bFIN-LON-0442\b` matches inside `OLD-FIN-LON-0442`; the pattern is bounded by the characters a name may CONTAIN instead. `CORP\a.petrova` without a qualifier clause becomes `CORP\your account` — **the account redacted and the domain read out, the worse half surviving** — so the optional `DOMAIN\` prefix and `@domain` suffix are consumed as part of the match. An address cannot exclude `.` on its right, because sentences end with one, so the boundary is "not a digit, and not a dot-then-digit". A name read off a machine goes into a `RegExp`, so it is escaped. **A name under three characters is deliberately not matched at all**, because a machine called `PC` would rewrite the word "pc" in every sentence. And the user is replaced **before** the machine, because its qualifier clause then absorbs a `FIN-LON-0442\` prefix in one step rather than leaving `this PC\your account`. | **DECIDED AND BUILT 2026-09-10** (`spoken-form.js` + `spoken-form.test.mjs`, 36 assertions; `renderer.js` learns all three in `renderMachine()` so the band's re-read refreshes them; `panel.test.mjs` pins the wiring and that `say()` is the only caller of `matic.speak`). Said as: **"this PC"** (Charles's own wording), **"your account"** — a noun phrase, because it has to survive dropping into a sentence written by someone else and *"you is signed in"* does not — and **"an address"**, which keeps the fact that survives being said aloud, since HAVING one is the whole evidence that renewing a lease worked. | D53/G4 (identity never reaches a model), D215, D217, D246, D247, D130. |

**5.32a — the addresses are THIS machine's two literal values, and that is the whole safety of it.**

It would have been easier to redact anything address-shaped, and it would have been wrong. A
knowledge-base answer may legitimately tell someone to try `8.8.8.8`, name a print server, or quote
a subnet out of company guidance — **redacting those destroys the answer rather than protecting
anyone.** What is replaced is the small set of literal values the probe reported for this machine,
its own address and its gateway, which are the only ones that identify the environment the user is
sitting in. The test asserts `8.8.8.8` survives, and that assertion is the one worth keeping.

**5.32b — nothing spoke the name or the account, and that was an accident rather than a guarantee.
That is the whole argument for building this.**

On the day it was asked for, the hostname and the account reached exactly four places: the machine
band (shown), the review card (shown), the developer log (ours) and the ticket payload (sent, and
correctly). **Neither was in anything spoken** — but only because three unrelated decisions happened
to line up:

1. `probeMachine()` carries neither, so neither is in the facts the router reasons over.
2. `machineStateBlock()` excludes identity from the prompt **on purpose** (D53/G4) — `computer` and
   `user` are shown in the panel and never sent to a model, and a test asserts it.
3. The catalog's `plain.what` happens not to mention either.

**Point 3 is the one that is only a habit.** Claude Design's own placeholder consent card reads
*"…restart the Print Spooler service on PLACEHOLDER-PC"*, which is precisely the sentence this would
arrive through, and a hub-authored answer (`/v1/ask`) is prose nobody here writes at all. A rule
resting on three unrelated things staying true is not a rule.

**The address was a different case: it WAS spoken.** `renew_dhcp`'s success line says *"Renewed the
DHCP lease — this machine now has 10.0.0.42"*, and that goes through `say()` on every successful
lease renewal.

**5.32c — and the third item: the panel's own crash note put a JavaScript exception at the user.**
`note(\`Something went wrong inside the panel and this turn stopped: ${err.message}\`)` rendered
*"…stopped: TypeError: Cannot read properties of undefined (reading 'ok')"*. It is SHOWN rather than
spoken, which is why D247's sweep did not catch it, and it was found by tripping it with a
deliberately malformed stub while checking the machine-name rule. The stack was already going to the
developer log, so nothing is lost. **`unknown: true` stays on it** — a turn that stopped half-way is
exactly the case where a user must not assume nothing happened. It reads **"That stopped part-way. I
don't know how far it got."** — **shortened on Charles's instruction the same day** ("fix the crash
note wording, it's too wordy"), which removed a sentence of advice with nothing specific behind it
(there is no named thing for the user to go and check) and the word "turn", which is ours for a
conversational exchange and not theirs. **The uncertainty is the half that had to survive**, and it
did. The assertions guarding it broke on that rewording, because they had been written against the
words rather than the contract — **the third time in this session** — and they pin the properties
now: it exists, it is flagged `unknown`, it carries no exception, it says the turn stopped, it says
the outcome is unknown, it avoids "turn", and it is at most sixteen words. All four mutations of it
are caught, including the wordy version and the original defect.

**5.32d — the tests were mutation-probed, and the probe was wrong twice before it was right.**
Ten deliberate weakenings of `spoken-form.js` — each boundary dropped in turn, the three-character
floor removed, the user/machine ordering swapped, the regex escaping removed, the "unknown" guard
removed — and all ten are caught. **Getting there took three attempts, and the first two failures are
the more useful record:** the probe's own escaping was wrong so two mutations silently applied
nothing, and then it was mutating the DOC COMMENT rather than the code, because `spoken-form.js`
quotes every one of those boundaries in its own prose. Both reported the shape of a real finding
("MISSED — the tests are weaker than they look") while proving nothing. §10.5's class, twice, inside
the tool built to check for it.

**5.32e — the one address the rule could not reach was the one that matters most.**
`renew_dhcp` exists to CHANGE this machine's address, so the value in *"this machine now has
10.0.0.42"* is one the last probe cannot have seen — and `spokenEnv` is learned from the last probe.
**The single capability whose message is guaranteed to carry an address was the single one the
redaction could not catch.** `reset_adapter` is the same, and so is `describeAddress`'s
self-assigned phrase, which reports a `169.254.x.x` address a listener would hear read out digit by
digit. Charles found it: *"fix the ip in renew_dhcp's message too."*

**The fix is NOT in the message**, and that is the interesting part. `probe.test.mjs` asserts the
APIPA phrase *"still shows the address, rather than hiding it"*, and **that assertion has a hardware
finding behind it**: `verify-privileged.ps1` once produced *"it is back up on 169.254.17.252"*,
which reads as success and means the opposite. Removing the digits from the message would delete
that evidence to solve an audio problem. Instead the renderer folds the broker's `detail` into the
environment **before anything speaks the result** (`learnAddressesFrom`, called on `exec.detail`),
so a freshly-assigned address is redacted exactly like a probed one. **`detail` is broker-authored
machine detail about THIS machine — never hub prose — which is what makes reading it generically
safe here while a blanket address pattern stays unsafe in `spokenForm`.** It is also better than
re-probing: the probe lags the change by design (`resetAdapter()` settles for 1.5 s and DHCP took
longer than that on real hardware), and the broker already knows the answer.

**One wording rule came out of it.** An address that is the WHOLE of a parenthetical is DROPPED
rather than replaced: *"a self-assigned address (an address)"* is worse said aloud than either the
digits or nothing, and the sentence around it already reads as a complete one. On screen the digits
are untouched.

**1107 client assertions across 17 files, up from 1048 / 16.** **Nobody has HEARD any of it** — the
check page has no voice, so `matic.speak()` is never called there; this was verified by the unit
test, by the wiring assertions, and by applying the real module to the real on-screen string in a
browser. `client/docs/PANEL-RENDERER-CHECK.md` §3a is the listen-to-it check.

---

### 5.33 D250 — a report says what was done in the words the user agreed to, not the mechanism's name (2026-09-10)

Charles, after the D247 audit listed these and left them as a product-copy question: *"fix the dhcp
lease and dns resolver cache wording too."*

| ID | Decision | Status | Links |
|---|---|---|---|
| **D250** | **An executor's report of what it did is written in the CATALOG'S PLAIN WORDS — the same words the user read on the consent card — never in the mechanism's name.** The two success lines said *"Flushed the DNS resolver cache."* and *"Renewed the DHCP lease — this machine now has 10.0.0.42."*, and they are spoken. Those are Microsoft's names for the mechanisms, which is exactly what the catalog's `title` is for and what the inspector still shows. **The catalog already had the user's version of each**, in `plain.what`: *"Empties this machine's memory of recent website-name lookups"* and *"Hands back this machine's network address and asks the network for a new one."* The reports now echo those, which is worth more than being merely plainer: **it is the description someone approved, so the report is something they can match to what they agreed to.** `describeAddress`'s phrases went the same way — "IP address" and "DHCP has not answered" out, the ADDRESS itself untouched (D249's evidence rule). And the last place a catalog title reached the voice is closed: `say(replyText \|\| `I think this is the fix. ${title}.`)` no longer names it, because the consent card is the very next thing on screen and describes the action in exactly those plain words. | **DECIDED AND BUILT 2026-09-10** (`src/broker/capabilities/index.js`, `src/renderer/renderer.js`, `broker.test.mjs` §11, `probe.test.mjs`, `client/docs/DEMO-RUNBOOK.md`). **The catalog TITLES are unchanged** — "Flush the DNS resolver cache", "Release and renew the DHCP lease" — because a title is the capability's identity, it is what the inspector and the audit record should say, and it is the model's handle on it. What changed is which of the two a user hears. | D240 (our words off the surface), D247 (the same split one layer down), D249, D130/D128 (the card's plain text is what was approved), D235 (`plain.helpsWith`, the same argument for the capability answer). |

**5.33a — what was deliberately left naming the mechanism.**

- **The catalog titles.** They are the capability's identity and the model's handle on it, they are
  right in the inspector, and the audit record should carry them.
- **`validate().errors`**, including `"…has a static address, so there is no DHCP lease to renew"`.
  That is the gate explaining itself; D247 routed it to the inspector and it is no longer spoken.
- **The Win32 layer and the broker's own logs.** Never user-facing at all.

**5.33b — the test pins the class, not the three instances.** `broker.test.mjs` §11 runs a real
`flush_dns` through the real broker and asserts its message names no mechanism
(`DHCP|DNS|resolver|lease|TCP|IP address|APIPA`), that it echoes the catalog's plain description, and
that all three of `describeAddress`'s phrases pass the same check — because those feed BOTH network
capabilities' reports and all three are spoken. `probe.test.mjs`'s assertion that broke was pinning
the word "DHCP"; it pins the property now (the phrase explains that nothing has handed out a real
address) **and** that it does so without naming the mechanism. **That is the fourth assertion in this
session written against the words rather than the contract**, and the running total is worth keeping:
the no-email caveat, the Scenario 1 money line, the crash note, and this.

**1113 client assertions across 17 files.**

---

### 5.34 D251 — one more attempt at a buildable export, then the panel's design arrives as decisions instead (2026-09-10)

Charles, after the second export: *"Make the request clear. If they don't get it right on this pass
we revert to 2."*

| ID | Decision | Status | Links |
|---|---|---|---|
| **D251** | **One more request for a buildable export. If the next one is not buildable either, D241's arrangement ENDS for the panel: Claude Design's delivery becomes reference rather than source, and the app implements the written design decisions itself.** Two exports have arrived against the follow-ups brief and the **entire difference between them was one line** — a Google Fonts `<link>`. Neither is buildable: **0 `class=` attributes against the September delivery's 291, 242 inline `style=` against 46, and a 2,293-character `<style>` block against 25,369** — and `matic-panel.css` is generated from that block, whole and verbatim, so **a visual decision in an inline attribute does not reach the app at all.** A one-line diff is not disagreement; it is a brief that did not arrive, so the request is re-sent as one page with a worked before/after, the 90-name class contract, and a single self-test (open it with the network off). **The fallback is named in the request itself**, because a deadline nobody has been told about is not a deadline. | **DECIDED 2026-09-10 by Charles.** The request is `docs/handovers/2026-09-10-claude-design-request-buildable-export.md`; the long version it replaces is `…-panel-re-export.md`, kept for its §5 class list. **Nothing is integrated and the panel on `main` is unchanged at D240–D250.** | D241 (the rule this would end), D240, D244–D250 (what the app did while waiting), D225 (the admin console self-hosts its fonts — the panel deliberately does not). |

**5.34a — what "revert to 2" costs, stated before it is chosen rather than after.**

D241 inverted the direction of truth on purpose: the panel arrived as a harness with no source
files, so **we copy from the delivery and never edit it**, and a generated stylesheet cannot drift
where a hand-maintained copy would. Ending that means the app owns the panel's CSS again — which is
the arrangement D240/D241 replaced, and the one that produced *"our words stopped reaching the
user."*

**It is still the right fallback, and the reason is not impatience.** If the design tool cannot emit
class-based CSS, that is a tool constraint rather than a disagreement, and **D241's premise — that a
design change arrives as a new delivery — is then simply false.** A rule whose premise has gone is
better ended in writing than kept as a fiction that quietly stops being obeyed. What we would keep
is the part that has worked: the written design response, which has been complete and good both
times, and which the app can implement.

**5.34b — two things in the second export that are regressions, not stand-stills.**

- **A `<link rel="stylesheet">` to Google Fonts, inside `<helmet>`, so it would ship.** The panel
  runs on a laptop that is routinely offline — that is the premise of D49's whole connectivity model
  — and a CDN font also announces every launch to a third party. The September delivery got this
  right: three named families with system fallbacks and nothing fetched. **D225's self-hosted Barlow
  is the admin console's decision and is not this panel's.**
- **The Industry design-system stylesheet was inlined** (299,847 characters, Barlow embedded as
  base64), which is what *"make it self-contained"* produces when it is the only part of a brief that
  lands. It makes the file larger and no more buildable.

**5.34c — the tickets band, and it is ours to own.** Both exports head the band *"Still being worked
on"* and add *"Your five most recent. Anything older lives in the service desk."* Both are claims the
endpoint cannot make — there is no outbound notification at all (D86/D213) and no route from the
endpoint to the hub's ticket table (D54, D68/D69) — and D242's two required phrases are absent. **The
first brief never mentioned the band, never named D242 and never gave the rule**, so this is an
omission on our side rather than a defect on theirs, and it is stated that way in the request.


---

### 5.35 D252 — the re-export is integrated, and app.css lost two thirds of itself (2026-09-10)

The third export answered all three asks of `docs/handovers/2026-09-10-claude-design-request-buildable-export.md`
and D251's fallback was not needed. Charles: *"go, adopt their names and keep both token changes."*

| ID | Decision | Status | Links |
|---|---|---|---|
| **D252** | **Claude Design's re-export replaces the September delivery whole, its 32 invented names are ADOPTED rather than renamed to ours, and both of its unasked-for token changes are kept.** The export is buildable — **515 `class=` attributes against the previous two exports' 0, 36 inline `style=` against 242, 38,392 characters of CSS against 2,293** — with no CDN, no framework, no templating and fonts named rather than fetched. **Adopting their names rather than renaming their CSS to ours is the whole point of D241 working:** the delivery is the source, and renaming it to match names the app invented inverts that again; `tr-grid`/`tr-label`/`tr-value` are also better than `fields`/`label`/`fixed`, being namespaced to the card they belong to. **The consequence is the measure of the arrangement: `matic-panel.app.css` went from 280 lines to 123**, and section (b) — "surfaces the delivery did not draw" — is nearly empty, because it drew them. What is left is the stage becoming a window, two display hooks the renderer sets, one label the delivery had no string for, and the four token values. | **DECIDED AND BUILT 2026-09-10.** Markup changes the delivery said CSS could not make, both done: the band glyphs are SVG holders carrying its Lucide glyphs, and `.crosshair` is replaced by `.ins-glyph` + `.ins-label` ("What I did"). **1131 client assertions across 17 files**, up from 1113. | D240/D241 (the arrangement this vindicates), D251 (the fallback not taken), D244/D245/D246/D247/D249/D250 (the app work the delivery absorbs), D128/D130, D242. |

**5.35a — the two token changes nobody asked for, kept, and one of them found a gap in our own analysis.**

`--matic-ui-attn` (4.12:1 → 5.09:1) and `--matic-ui-ok` (4.07:1 → 5.02:1) both failed AA on
body-sized text on `surface`. Claude Design flagged them as the only unrequested changes in the file
and offered to revert; **all six of its contrast figures were re-derived here independently and every
one matches to two decimals.** The third is the interesting one: it also retuned **dark**
`ink-quiet` (`#7e8b94` → `#8b98a1`) because the old value gives **4.16:1 on `surface-2`** — which is
the review card's own ground. **§5.29b's contrast analysis never measured that, because the card had
not been drawn yet.** A gap found by drawing the thing, which is the argument for drawing it.

**5.35b — the four `--matic-ui-live-*` tokens are now a NAMED, TESTED exception to D241's
no-redefinition rule, granted by the delivery in writing.** The re-export adopted the names and
declares the values as placeholders, because Claude Design does not have `matic-avatar.css` and
cannot know them: *"Substitute the app's values, which are pinned to matic-avatar.css by a test.
Only the roles are the delivery's."* So `matic-panel.app.css` declares exactly those four and
nothing else. **The test does not hard-code the exemption as an allow-list** — it reads the
delivery's own words and fails if it stops calling them stand-ins, so **the exception cannot outlive
its justification.**

**5.35c — the build script now chooses a `<style>` block, and that is not the softening it looks
like.** The re-export has two: the panel's, and `<style id="sheet-only">` — the contact sheet's own
chrome. `buildPanelCss()` used to throw on a second block, deliberately, so a shape change would
surface. It takes the unlabelled one now and still throws on anything it does not recognise. **The
rule it must not break is that THIS SCRIPT never decides which rules the app needs** — the moment it
does, the check proves the app matches the script's opinion rather than the delivery. An `id` on the
block is the DELIVERY's decision, visible in both files, and that is a different thing.

**5.35d — the chevron and the open-state wash now hang off `aria-expanded`, which is strictly better
than what we asked for.** The September delivery keyed them off `data-set`, the harness's
scene-switcher hook, so app.css had to re-key them — and the first attempt at that missed the
chevron, leaving a disclosure whose only state indicator was inert (§5.29's "found by clicking").
The re-export keys both off the attribute the renderer maintains for screen readers, **so the visual
state and the announced state cannot disagree, because there is only one of them.**

**5.35e — one defect found by looking, and it was ours.** `.tr-field` is drawn for the artwork's
`<div>`s: it sets the card's padding, ground, border and even a `caret-color`, so the delivery knew
those fields are editable — but no `font-family`, because a div does not need one. A real
`<textarea>` does, and browsers default form controls to their own face, **so the first render put
the user's own words in a monospace box one line tall.** The fix is not a fourth override: the
element carries `class="input tr-field"`, using the delivery's own form-control rule for
`font:inherit` and its card rule for everything else, with `rows` in the markup for the height.
Two delivered rules, nothing for a handover to carry.

**5.35f — what was NOT taken from the delivery.** Its **copy is placeholder and ours is product**
(the original brief's "what not to send back" list, unchanged): the caveat keeps D246's wording,
the tickets band keeps D242's, the turn-notes keep D244–D250's. **D248's gloss is drawn in the
delivery and deliberately not rendered** — it is still proposed, there is no field on the rendered
contract to draw it from, and inventing that sentence in the renderer is exactly what D130 forbids.
The delivery is a contact sheet of one state per surface, so it carries the unreachable band and not
the no-service one; the test now pins each sentence where it can be pinned and says which is which.

**1131 client assertions across 17 files, up from 1113.** **Nobody has watched this in Electron** —
`client/docs/PANEL-RENDERER-CHECK.md` is still unrun, against three deliveries now.


---

### 5.36 D253 — the card cannot say "sent" before the service desk has answered (2026-09-11)

Charles: *"fix the sent by you defect."* Named as open in §5.35's honesty ledger and in
`docs/handovers/2026-09-10-claude-code-handover-panel-re-export-built.md` §9.

| ID | Decision | Status | Links |
|---|---|---|---|
| **D253** | **The review card's state is written from the FILING RESULT, by the caller that holds it — never by the click that started the filing.** `reviewTicket()` resolves with `{ approved, report }` instead of the bare draft; the click writes `"Sending…"` and a note about the DECISION (*"You chose to send this."*), and `report(filed)` writes the outcome. **Three endings, because D213 has three:** `"Sent by you"`, `"Not sent"`, and — for `filed === null`, a timeout, where the request went out and nothing came back — **`"Sent, not confirmed"`**. Saying either of the other two there is the confident guess D213 spent five surfaces avoiding. | **DONE 2026-09-11.** **1144 client assertions across 17 files**, up from 1131. Driven on `panel-check.html` through all four endings; seven mutations probed, all seven caught. | D252 §9 (where it was named and deferred), D213/D86, D245, D246, D128, `700d920`. |

**5.36a — what the defect was, and why it is the panel's worst possible place for one.**
The send handler wrote `"Sent by you"` into the card head **on the click** — before
`window.matic.fileTicket()` had been called, let alone answered. A filing that then failed left the
card saying it had been sent, **three lines above a transcript note saying nothing was filed**, with
the card still on screen because the card does not go away when it is answered. Two surfaces
describing one thing differently is `700d920`'s defect exactly, one turn later — and this is
**the one screen in the product where a user approves data leaving the machine**, so it is the
screen whose claims have to be true. It was found on 2026-09-10 while answering Claude Design's
question about the card's states, and deliberately left for its own pass.

**5.36b — the fix is a contract change, not a string change, and that is the point.** The card
**cannot** know the outcome: only the caller has `filed`. So the fix is not "write a better word
later" — it is to stop the card from being able to claim one. `report` is returned alongside
`approved`, called on **both** branches and **before either speaks**, so the card and the spoken
line cannot describe one filing differently. A cancel resolves with a `report` that does nothing,
so the caller never has to know which branch it is on before calling it.

**5.36c — the pin is on the contract, not the wording** (the rule this project has broken five
times). The assertions read: the click writes no outcome; the outcome derives from `filed`; a
timeout is neither ending; the caller reports before it speaks; a cancel still returns a callable
`report`. **The words may change without touching a test.** One trap the probe found first: reading
the whole send handler for `"Sent by you"` PASSES ON THE DEFECT, because `report` is *defined*
inside the handler and carries that string legitimately — the assertion reads only what runs
synchronously on the click. §10.5's class again, in a test.

**5.36d — a second defect of the same class, found by CANCELLING the card rather than reading it.**
The cancel note said *"Cancelled by you — nothing was sent."* and the caller's note three lines
below said *"Cancelled — nothing left this machine."*: **one fact about what the system did not do,
in two wordings, adjacent** — which is the whole of D245. The split is now the one
`persona.filing`'s own comment names and the send path already uses: **the card's note is the
DECISION, the transcript's is the SYSTEM's half.** The card's note is *"Cancelled by you."*

**5.36e — the head label is not a duplicate of the transcript note, and the distinction is
deliberate.** The head carries a short status for the CARD (`"Not sent"`); the transcript carries
the sentence about the SYSTEM (`"Nothing was filed."`, or the timeout sentence). D245 forbids one
fact said twice **in sentences, in one exchange**; a card's own state label beside the card is the
same thing `"Sent by you"` has always been, and removing it would leave an answered card with no
state at all.

**All four endings were driven on `panel-check.html`** — success (`"Sent by you"` + *Stored as
PLACEHOLDER-0001*, count 1 → 2), unreachable (`"Not sent"` + *Nothing was filed.*), timeout
(`"Sent, not confirmed"` + the unknown sentence), cancel (`"Nothing was sent"` + *Cancelled — nothing
left this machine.*) — with `"Sending…"` observed in flight on all three send paths.
**Still nobody has watched it in Electron.**


---

### 5.37 D254 — the panel click-through was RUN in Electron, and D244's vocabulary rule is completed (2026-09-11)

Charles: *"now do the electron click-through."* `client/docs/PANEL-RENDERER-CHECK.md` had been
unrun since it was written, against three deliveries.

| ID | Decision | Status | Links |
|---|---|---|---|
| **D254** | **D244/§5.29a's connectivity vocabulary applies to EVERY string that describes the connection state, and the two that its sweep missed are fixed.** `persona.fallback.hubUnreachable` — the reply a QUESTION gets while the hub is away — named only the service desk, under a rail and a band that name both. The RECOVERY note named only the service desk while the LOSS note six lines above it named both. **The pin is now an enumeration of every connectivity-state string, with the exclusions written down as decisions:** `persona.filing.*` and `fallback.hubNoAnswer` name only the service desk because they describe an ACTION against it, not the state of the connection. | **DONE 2026-09-11.** **1158 client assertions across 17 files**, up from 1144. Three mutations probed, all three caught. | D244/§5.29a (the rule this completes), D234 (persona lines are data), D49/D51, `700d920`. |

**5.37a — the click-through was run against the REAL thing, and how.** Electron with
`MATIC_PROVIDER=hub`, the real in-process broker, the real Win32 probe, and a live hub on
`mistral-small:24b` with the six-article corpus embedded and hybrid retrieval on — **not**
`panel-check.html`, where everything behind the bridge is canned. Driven over the **Chrome
DevTools Protocol** (`electron . --remote-debugging-port=9223`), which gives hands
(`Runtime.evaluate` in the real renderer) and eyes (`Page.captureScreenshot`); ten
screenshots were taken and looked at. Run **unelevated** on purpose — that is the branch nobody had
rendered.

**5.37b — what it proved that no test and no check page could.** **D249 end to end in the product
for the first time:** the "where's my ticket?" reply carried this machine's real name and real
address on screen, and the app's own log then printed the redaction line — so the string that
reached the voice was rewritten and the string on screen was not. **D247 against a real Win32
failure:** `restart_service` unelevated said *"I couldn't do that one from here."* with
`OpenServiceW(spooler, STOP|START) failed (Win32 error 5)` on `detail` and nowhere else.
**D250 against a real execution:** `flush_dns` actually ran and reported the catalog's words.
**D253 against a real hub, both ways:** `Sending…` → `Sent by you` with a real reference,
and — with the hub stopped while the card was on screen — `Sending…` → `Not sent`, the
band count unmoved, and `POST …/v1/ticket failed: fetch failed` confined to `detail`.
**And D252's chevron**, the defect found by clicking in September, rotating on the real window with
`aria-expanded` correct on both triggers.

**5.37c — four findings were NOT fixed, and three of them cannot be fixed in the renderer.**
The hub's answers contain markdown and the panel shows the backticks — the renderer is right not to
touch it, because D130 forbids `innerHTML` and the consent-surface argument rests on that, so
this is a decision between constraining the hub's prose and a narrow, decided transform. The
citation shows the article's **slug** in a mostly-empty 93px band, because `/v1/ask` returns
`citedArticleIds` and no title. The model's `reasoning` is rendered twice, identically
(mitigated: the card's copy is inside a collapsed `<details>`). And the model's spoken proposal
still says "flush the resolver cache" one line above a card that says it in plain words — D250 is
scoped to what an EXECUTOR reports and holds; the proposal is hub prose (H5/D234).

**5.37d — one observation recorded as unexplained rather than as a finding.** The same sentence was
answered from the corpus through the app and **declined** by a direct `POST /v1/ask`. The app
may send different text; that was not established. It is written down with its evidence and labelled
as an open question, because a register entry that guesses is worse than one that says it does not
know.

**5.37e — §10.5's class four times in one session, and none of it in the product.** A bad selector
said the inspector was open (it is hidden by `display:none`, not `[hidden]`); `innerText`
on a collapsed `<details>` returned empty and made two identical strings look different;
`.band` returned the wrong one of two; and I read blue text in a screenshot of the caveat whose
computed colours are all near-black. **Every one wore the shape of a real finding and every one was
settled by checking rather than reporting.** The first one is the useful rule: *a hidden element
is not necessarily `[hidden]`, and a collapsed one has no `innerText` at all.*

**Three items remain Charles's, and they are the ones a session cannot do:** anything **heard**
(the redaction was proved to fire, nobody has listened); the **first frame** on launch (the
mechanism is right in code and a screenshot cannot catch a frame that is not meant to exist); and
the **todo card**, which comes from `diagnoseOffline(probe)` and needs this machine genuinely
offline — a session will not disconnect his network to see a card. The **elevated** success path of
`restart_service` is also still unrun.


---

### 5.38 D255 — the hub's markdown is read as data and built as nodes, never interpreted (2026-09-11)

Charles: *"fix the markdown backticks in the hub answers."* §5.37c's finding, and the one of the four
that was ours to fix.

| ID | Decision | Status | Links |
|---|---|---|---|
| **D255** | **Model prose is parsed into RUNS by a pure module and built into DOM nodes by the renderer — the panel is never handed markup to interpret.** `src/renderer/model-prose.js` returns `[{text, code}]` and `renderer.js`'s `prose()` appends a text node or a `<code>` per run, so **no HTML is parsed, none is produced, and nothing can inject** — which is the only shape available, because D130 forbids `innerHTML` and the whole consent-surface guarantee rests on that. **Both layers, deliberately:** the hub's `answer` tool now asks for plain sentences *because the reply is spoken as well as shown*, which lowers how often this fires, and the renderer is right on the turn a model ignores its prompt. **A model is not a contract.** | **DONE 2026-09-11.** **1202 client assertions across 18 files**, up from 1158; `model-prose.test.mjs` is the new file (37). Seven mutations probed, six caught and the seventh proved semantically equivalent. Driven on the check page and measured on the real Electron window. | §5.37c (where it was found), D130/D128, D234/H5, D249 (the order in `say()`), D252 §7 (the same browser-default class of defect). |

**5.38a — H5 and D234 are not in tension with this, and the distinction is the decision.**
Hub prose is the hub's and is not ours to rewrite. **A backtick is not prose** — it is a formatting
instruction addressed to a renderer that is not allowed to accept one. Every word survives in order;
only the markers do not, and `model-prose.test.mjs` pins exactly that ("every word survives, in
order").

**5.38b — THE LOAD-BEARING RESTRAINT: single `*` and `_` ARE NOT EMPHASIS HERE, AND MUST NOT
BECOME IT.** This product's own vocabulary is full of underscores — `needs_human_judgement`,
`server_side_outage`, `queue=identity_team`, `restart_service(serviceName=spooler)` — and
D244/D128 put those raw values **on the review card**, the one screen where a user approves data
leaving the machine. A naive `_x_` rule turns `needs_human_judgement` into
`needshumanjudgement` on exactly that screen. **A stray `*word*` is a blemish; a mangled enum
is a lie**, so only ``code`` and paired `**bold**` are handled and the asymmetry is the whole
argument. This is not a markdown renderer and must not become one: headings, lists, tables and links
are left as written, because a half-built layout engine in a renderer that may not use
`innerHTML` is a worse thing to own than a stray character.

**5.38c — what is NOT transformed, and the second one is the stronger rule.** On the consent card
only `proposal.reasoning` goes through `prose()` — the one model-authored string D130 allows
there; the four `consentRendered` clauses are the broker's retained catalog text, which the D130
click-through compares field for field on screen. **And the review card's case note is NOT
transformed at all, although it IS model-written**: the card labels it *"Sent exactly as it reads."*
and D128 requires the user to see what is being sent, so dropping a marker from the display would
make the card's own promise false. **A visible marker there is honest; a tidied one is not.** Both
are pinned, because both are exactly what a later session would "helpfully" extend.

**5.38d — the ordering bug that was avoided, and is now pinned.** `say()` strips markers
**before** D249's redaction, so the redaction sees the sentence a person would read. The log line
then compares `heard !== said` and **not** `heard !== text` — comparing against the original
would make the D249 line fire on any answer that merely contained a backtick, and **a log that
cries redaction when nothing was redacted is worse than no log.**

**5.38e — two defects in the new CSS, both found by measuring the rendered thing.**
`--matic-ui-hair` is a **width** (`1px`), not a colour: the delivery's own idiom is
`border: var(--matic-ui-hair) solid var(--matic-ui-line)`. Guessing from the name gave
`1px solid 1px` — an **invalid shorthand**, dropped whole, so the chip had its tint and no
hairline. Worth knowing which failure it was: reading `borderColor` alone returns
`rgb(29,31,32)` and looks like a black box was drawn; only `border` shows `0px none`.
**The first write-up of this said "resolved to currentColor and drew a near-black box" and that was
wrong** — corrected in the file. Second: `--matic-ui-radius` is `0px`, so a rounded chip was
the app overruling a square-cornered design.

**5.38f — app.css grew from 123 lines to 155, and that is a cost, not a neutral fact.** §5.35's own
header says that if this file starts growing again the thing to write is a design handover. The rule
is legitimate section (b) work — the delivery draws `.raw` for a block and `.turn-note .ref`
for a reference and **no inline treatment at all**, for the same reason it drew no "JUST NOW" label:
none of the strings it was given contained one. An unstyled `<code>` then falls back to the
**browser's** mono face at the browser's size, which is D252 §7's defect exactly. **It is written
down in the file as the first item for the next design ask**, so section (b) can shrink again.

**5.38g — the check page had no fixture with markdown in it, which is why this reached a screen.**
Every canned reply was clean prose, so the one thing the hub reliably does that our own strings never
do was unmodelled. The docking answer now carries a backticked version, a bolded clause **and a
filename with underscores in it** — so opening the page shows what the renderer does with all three,
and the underscore case is permanently in front of anyone who reaches for a tidier regex.

---

### 5.39 D256 — the restart signal: collected natively, scored from unvalidated defaults, one row that gives no advice (2026-09-11)

Charles's five founder decisions of 2026-09-11, on the endpoint telemetry spec
(`research/2026-09-11-endpoint-telemetry-spec.md`): **format the panel for best readability**;
**restart carries BOTH** — a panel fact and a conversation moment; **camera and microphone are out
on privacy grounds**; and **the Core Audio path is raised alongside the pipe's native-call decision
rather than answered alone**, which takes audio out of this pass too.

| ID | Decision | Status | Links |
|---|---|---|---|
| **D256** | **The restart signal is collected by native calls, scored by a pure module against per-tenant configurable defaults, shown as ONE row that states a fact and gives no advice, and recommended in a conversation moment that a decline ends.** `src/broker/win32/sysinfo.js` reads the boot instant, the three pending-reboot flags, commit charge, `Memory Compression`'s working set and the two boot events — **no PowerShell, no `.ps1`, no `Get-Counter`, no shell at all**, which is `win32/*`'s existing rule and is stricter than the spec asked for. `src/agent/restart-signal.js` holds the thresholds, the score and the words; it is pure, so a test can drive machines that do not exist. **Commit charge is the case that proves a measurement can be collected without being displayed** — it is the most useful input in the score and *"commit charge 68.8%"* means nothing to an office worker, so it never reaches a user surface as a number, and structurally cannot: it is not in the object the renderer receives. | **DONE 2026-09-11.** **1498 client assertions across 19 files**, up from 1202/18; `restart-signal.test.mjs` is the new file (293) and IS the handover's acceptance list in order. Every reading measured on this machine, unelevated, all six in **24–28 ms**. Driven in Electron over the DevTools Protocol against the real broker and the real probe — **23 checks, and it found one defect (§5.39c).** | **AMENDED by D257 (§5.40) the same day: memory is no longer invisible — it is a row of WORDS, the figure still forbidden.** §5.39a–h; D198 (a surface the user did not provoke), D249 (why Event 1074 is not spoken), D250 (no mechanism names), D226 (strip it before it leaves), D242 (one machine, one wording), D213 (do not claim what was not arranged). |

**5.39a — NATIVE, AND THE TWO CORRECTIONS THAT CAME OF IT.** The spec's §6 says never to drop and
run a `.ps1` (execution policy blocked it; `-ExecutionPolicy Bypass -File` is blocked too by a
MachinePolicy-scope Group Policy) and to use compiled code or `-Command`. The repo's own rule for
`src/broker/win32/*` is stronger and is what was followed: **native calls only, because spawning a
shell is the behaviour EDR flags.** Doing it that way corrected two of the spec's own measurements:

- **The event log is not slow.** The spec's §7 says every probe returned well under a second
  *"except the event-log query"*. As a targeted XPath in reverse direction fetching one event
  (`EvtQuery`/`EvtNext`/`EvtRender`), Event 1074 took **1.2 ms** and Event 27 **5.9 ms**. The cost
  the spec measured belongs to walking the log, not to reading from it.
- **The pending-reboot registry reads do not need elevation.** The spec expected them to. Both HKLM
  key-presence reads and the `Session Manager` value read worked from an unelevated process.

**5.39b — IT REPORTS `LastBootUpTime` EXACTLY, AND THAT WAS MEASURED RATHER THAN ASSUMED.** There is
no tick counter anywhere in the feature and a test pins that there is not: `TickCount` is 32-bit and
**wraps at 49.7 days**, so a machine up 60 days reports as freshly booted — the machines that most
need flagging are precisely the ones that would report clean. `GetTickCount64()` from kernel32 has
neither problem, and is still not what this reads, because an absolute instant is strictly better
than an interval.

`SystemTimeOfDayInformation.BootTime` is **not** the value WMI reports; `BootTimeBias`, from the same
48-byte struct, is exactly the difference. To the millisecond, on this machine:

| Source | Epoch ms | |
|---|---|---|
| `SystemTimeOfDayInformation.BootTime` | 1788996032136 | 23:20:32.136Z |
| − `BootTimeBias` | − 7636 | |
| = | **1788996024500** | **23:20:24.500Z** |
| `(Get-CimInstance Win32_OperatingSystem).LastBootUpTime` | **1788996024500** | **23:20:24.500Z** |

An exact match off one machine is a strong claim, so it was checked from a third direction — and the
third source **resolves which value is which** rather than merely agreeing: `GetTickCount64()` read
115653312 ms, the raw `BootTime` gives an uptime of 115652828 ms (+484 ms, call latency) and the
corrected one 115660464 ms (−7152 ms). **So the raw value is the origin the tick counter measures
from, and `BootTime − BootTimeBias` is what `LastBootUpTime` reports.** The raw figure is kept
alongside as `kernelBootTimeMs` so the two cannot be silently conflated. **`[VERIFY]`: one machine,
one day** — §10.2. Nothing depends on it being exact; 7.6 seconds against thresholds of 14 and 30
days and a row reading "2 days ago" is a row seconds out, not a wrong recommendation.

**5.39c — THE EVIDENCE DESCRIBES THE READING, NOT THE BAND IT FELL INTO. THIS WAS A DEFECT, AND IT
WAS ON SCREEN.** The evidence clauses were constants named after the DEFAULT bands — *"in over a
month"*, *"in more than a fortnight"*. The bands are configurable defaults **a tenant is meant to
move.** With `uptimeElevatedDays` lowered to 1, the real panel said *"This computer hasn't been
restarted in more than a fortnight."* about a machine that had been up **1.35 days**.

Every copy rule passed. It said "restart", it led with the evidence, it offered to come back. **The
evidence was simply false** — and it is the half of the sentence the spec says earns compliance, so
it is the half that must not be wrong. **Two acceptance criteria were quietly in conflict** (the
thresholds must be configurable; the sentence must lead with the evidence) and a constant cannot
satisfy both. The fix splits them: **the configured band decides WHETHER to speak; the reading
decides HOW IT IS DESCRIBED.** Uptime now says how long it has actually been, from the same
`durationWords()` the row uses — so the band and the recommendation cannot describe one machine two
ways, which is D242's rule one surface over. Memory is described from where the real fraction sits,
in fixed descriptive words, which is also why no figure is needed. **Found by driving the app, not
by reading the code**, and pinned by five assertions plus the 1.35-day case itself.

**And three more copy defects came out of printing the generated sentence for every combination**,
rather than reading the table that produces it. **None would have failed a test that existed at the
time.** (i) The firing-alone branch read *"Windows is waiting for a restart to finish installing an
update. Restarting it would clear that up."* — the same thing twice, the second time in weaker
words; it has its own instruction clause now. (ii) **The signal that fires alone was reported
last**, because clauses are ordered by weight and that flag carries weight **0** — precisely
because it needs none, Windows having said outright that it is waiting — so the sort buried the most
decisive evidence behind uptime and memory and dragged the weaker instruction back with it. It
carries `leads` now: the one contribution whose position is not a function of its score. (iii) **A
capital letter mid-sentence** — *"…installing an update, This computer hasn't been restarted in 40
days"* — because each clause was written ready to lead and which one leads depends on the score.
Clauses are stored non-leading and the first character of the assembled evidence is raised, which is
also right for "Windows": a proper noun stays capitalised wherever it sits.

**5.39d — `PendingFileRenameOperations` CAN NEVER FIRE ALONE, AND THAT IS STRUCTURAL RATHER THAN
ARITHMETICAL.** This is the spec's correction to its own earlier advice: the key had **two entries on
a machine Windows Update had fully rebooted 27 hours earlier and which needed nothing at all**, and
one entry on this machine while the feature was being built (a staged `gamingservicesproxy` DLL).
Installers, antivirus and update staging populate it routinely and it often persists harmlessly.

Its weight is 1 against a threshold of 3, so on today's numbers it cannot reach the threshold by
itself — **but that is an accident of two configurable values and both are meant to be moved.** So
the contribution carries `neverAlone` and the recommendation is withheld when nothing else
contributed, whatever the numbers say. Three assertions cover it, and two of them set the threshold
to 1 and the weight to 9 — the cases arithmetic alone would not survive.

**5.39e — AN UNREADABLE PROBE SCORES NOTHING AND IS NEVER READ AS HEALTHY.** `TickCount64` returned
**empty** on Windows PowerShell 5.1 on the spec's host rather than throwing, so a collector reading
it without a null check computes an uptime of zero and **never fires**. This build does not read that
property, so the criterion is carried where the defect actually lives: every function in
`sysinfo.js` returns `null` for a value it could not read and never a zero, an empty string or a
`false`; `scoreRestart()` turns `null` into no contribution plus an id in `unknown`; and the row
reads **"Not known"**, never "Less than an hour ago". A real uptime of zero is still a legitimate
reading and still reports as one. Twenty-one assertions, over seven shapes of missing value.

**And the process walk checks itself.** `Memory Compression`'s working set comes from raw byte
offsets into an undocumented structure; if a future Windows moves a field the walk does not crash,
it reads a neighbouring quadword and returns a plausible number — §10.5's class exactly. So
`K32GetPerformanceInfo` supplies a process COUNT from a different kernel call and the walk must
arrive at the same number (623 = 623, then 614 = 614, then 604 = 604 across runs). On disagreement
it returns null. **Absent is also null and not zero**, because Windows may legitimately not be
running the process and a zero would score as "no memory pressure".

**5.39f — THE ANTI-NAG GATE, AND ITS ONE KNOWN LIMIT.** The spec says do not nag and leaves the
mechanism open; this build needed one clause more, which the spec does not state: **once declined,
not again this session, and not again for a configurable period.** `createRestartGate()` holds it —
`raiseSuppressionHours` 24, `declineSuppressionHours` 168, `deferHours` 4 — and `declinedForSession`
is a separate fact from the timestamp on purpose, so a clock that moved cannot argue it away (a
clock that went *backwards* is asserted too). **The gate never raises anything**; it only answers
"may this be said", and the moment rides on a turn the user started, which is D198's rule and the
spec's anti-nag rule arriving at the same place.

**The moment is attached after the intake's early returns**, so a turn answering *"and your last
name?"* carries none — adding "by the way, restart your computer" to a half-finished ticket is the
same nag in a different hat. The renderer drops it in two more cases, both erring towards silence: a
turn that ended with the ticket offer waiting (two offers at once is how a user learns to click past
both) and a turn that threw. **KNOWN LIMIT, stated rather than discovered:** the gate is in memory,
so "not again this session" is exact and the longer window holds only while the process lives.
Persisting it needs a store that does not exist for the purpose — `profile.js` holds the fields a
person supplies for a ticket and this is not one. The gap is narrow: a user who takes the advice
restarts the machine and the signal goes with it.

**5.39g — THE OFFER IS TO COME BACK, BECAUSE THAT IS THE PART OF "SCHEDULE IT" THIS BUILD CAN
HONOUR.** The spec's third copy rule is *"offer to schedule it"*. **No capability restarts a
machine** — the catalog's `restart_service` is a Windows service, not the computer — so a sentence
implying a restart has been booked would be telling a user something has been arranged that has not,
which is the class of defect D213 spent five surfaces avoiding. The sentence therefore offers to
raise it again at a better time or to leave it with them, and there is **no button offering to do the
restart**; its absence is the honest shape, not an omission. Two further consequences, both checked:
the answer goes down its own named channel (`restart:answer`) and **not** through `submit()`, because
it is a decision and not a sentence for the router; and the choice **does not set
`data-offer="pending"`**, because that attribute lights the composer's hint *"Waiting on your yes or
no above — or just type instead"* and the second half would be false — D216's intake is not pending
for this, so a typed "no thanks" would be routed as a fresh problem statement, the exact defect
(`3d1992e`) the intake exists to prevent.

**5.39h — THE FIRST COPY RULE IS THE ONE WORTH DYING ON: "RESTART", NEVER "SHUT DOWN AND TURN IT
BACK ON".** Under Fast Startup a shutdown is a kernel hibernate — it does not clear the session and
**the fix does not apply** — so a user who follows the other wording does the work and gets nothing.
Four assertions guard the phrase, including the firing-alone sentence, which needed its own wording
because *"Windows is waiting for a restart. Restarting it would clear that up."* says the same thing
twice in weaker words.

**5.39i — WHAT IS DELIBERATELY NOT BUILT, EACH FOR A DIFFERENT REASON.**

- **Camera and microphone: out, on privacy grounds** (founder, 2026-09-11). **Nothing reads the
  consent store, and six patterns across seven files assert it** —
  `CapabilityAccessManager`, `ConsentStore`, `webcam`, `microphone`, `NonPackaged`,
  `LastUsedTimeStart|Stop`. That store records **every app that has ever used the camera or
  microphone, with timestamps** (87 microphone and 22 webcam entries on the spec's machine): a
  behavioural log of what software someone runs and when. Permission state is out too, although
  *"camera access is turned off for Teams"* is a real ticket, because it lives in the same registry
  tree — **a future maintainer widening the read is one line away, and that line is what the
  assertion catches.** The collector's registry reads are pinned to exactly three keys, all under
  HKLM, and a test fails on a fourth or on any read of the per-user hive where consent lives.
  **Device configuration is different in kind and still worth doing later** — it is where the spec's
  strongest finding lives: Windows keeps two defaults per direction, meetings take the
  **communications** one, and on the spec's machine that was NVIDIA Broadcast at **0%** while the
  multimedia default read Yeti Classic at 76%. A single "default microphone" row would have called
  it healthy while the device every meeting uses was silent. It is blocked on the Core Audio
  decision (founder §0.5) regardless, and when it returns it still needs a disclosure sentence,
  because it names hardware. **And the in-use heuristic must never be built in its usual form:**
  `Stop == 0 && Start != 0` returned **five microphone apps as live**, with start times in 2023 and
  2024 — orphaned entries from crashed or force-killed apps. In-use detection needs
  `IAudioSessionManager2`.
- **Single-process working-set growth (weight 2)** needs the 7–14 day rolling per-process history
  the spec describes. That history does not exist. There is room for it in the policy and the score
  table and nothing else has to move when it arrives.
- **Event 27's boot-type mapping is collected, recorded and NOT interpreted.** `0x0` = full boot is
  corroborated — **by 81 observations rather than one, once the whole retained history was read
  instead of the newest event** (`npm.cmd run verify:boot-type`, added the same day) — but **only
  `0x0` has ever been observed**, and only on machines with Fast Startup disabled: the spec's
  (`HiberbootEnabled = 0`) and this one, also `0`. **The log also carries the control:** three of
  the last twelve Event 1074s are a genuine shutdown or power off rather than a restart — the only
  actions that could produce a hybrid boot, a restart being a full boot whatever the setting — and
  every boot after them is `0x0`. `0x1` and `0x2` are still unverified, and this matters more here
  than anywhere else in the feature because Fast Startup is the reason the feature exists. So
  `lastBootTypeEvent()` returns the raw value and an `interpreted: false` field whose only job is to
  stop a reader mistaking the object for a verdict, it carries no weight in the score, and no
  surface renders it. `SleepTimeBias` is carried for the same reason and with the same restraint.
  §10.2, and the script prints the four-step procedure that would settle it.
- **Event 1074 is collected and cannot be spoken, and it is the event that says so.** The spec calls
  it "context for the conversation". Its `param1` read
  `C:\WINDOWS\servicing\TrustedInstaller.exe (WAKANDA)` and `param2` read `WAKANDA` — **the
  machine's name, twice, inside the payload** — and `param7` was `NT AUTHORITY\SYSTEM`. **D249 says
  this machine's name and the signed-in account may be shown and are never said.** So it goes to the
  inspector and the developer log, and a test asserts no surface reads it. That is a narrowing of
  what the spec suggested, for a decision that already existed rather than a new preference.
- **VRAM and disk stay absent.** `Win32_VideoController.AdapterRAM` is a 32-bit value that reported
  **4.0 GB for a 24 GB card**, and the target fleet has integrated graphics anyway; the disk rule
  needs both a percentage and an absolute threshold or it fires on volumes with 160+ GB free.

**5.39j — EVERY THRESHOLD IS A PROPOSAL, AND THE FILE SAYS SO WHERE THE NUMBERS ARE.** The spec's §6
says of itself that there is **no verified source establishing 30 days — or any figure — as an
evidence-based restart interval**, and calls itself educated guessing until validated against real
ticket outcomes. So they are defaults in `client/config.json` under `restartPolicy`, not constants in
a source file: **a constant is a claim the code makes; a default is a starting point a tenant can
move.** `_restartPolicyNote` beside them says they are unvalidated, that no source establishes the
figures, what would validate them, and why they are config — and a test asserts all four of those
things are in the note, that every configured value equals the code default (so the file documents
rather than diverges), and that overriding one really does change the verdict.
`client/docs/RESTART-SIGNAL.md` is the longer form. **Treat a changed number as a changed guess.**

**5.39k — DESIGN: THE HANDOVER IS HELD, ON PURPOSE.** The previous draft of this pass assumed the
panel would grow from eight rows to about fourteen and that the layout needed Design. **With camera
and microphone out and memory never rendered, this pass adds ONE row** — nine is not obviously a
different layout from eight, and a test asserts the count. Charles's instruction was *"format for
best readability"*, and that is a judgement Design cannot make about rows that do not exist. The
question is recorded instead: **what happens to this panel when it reaches roughly a dozen rows, and
does it want grouping or severity?** It gets sent when there are enough rows to answer it against
something real.

---

### 5.40 D257 — disk per volume, and memory as a conclusion rather than a silence (2026-09-11)

Charles, looking at the shipped band: *"Where is the info for memory, hard drives space. was it not
included in this handoff"* — and the honest answer was that they had different instructions.
**Memory was built, scored and deliberately invisible** (D256 §2c, acceptance 5). **Disk was
excluded outright** by the handover's §2 and its own honesty ledger. Both decisions were his, and he
reversed both, each in the narrower of the two available ways. **Amends D256.**

| ID | Decision | Status | Links |
|---|---|---|---|
| **D257** | **Disk is collected per volume and shown as a conclusion with the figure behind it, and memory becomes a row of WORDS rather than staying invisible — and neither is a restart signal any more than it was.** `fixedVolumes()` reads every FIXED volume natively; `src/agent/disk-space.js` holds the dual threshold and the words, and is **pure and separate from `restart-signal.js` in both directions** (a test asserts neither imports the other). The memory row reads `memoryWords()`, **the same band function the recommendation's sentence reads**, so the row and the sentence cannot describe one machine two ways. **Acceptance 5 is intact and was narrowed rather than broken:** the FIGURE is still forbidden on every user surface and still absent from the object the renderer receives — what changed is that the panel now says what the figure MEANS, which is what "the panel shows conclusions, not measurements" asks for. | **DONE 2026-09-11.** **1593 client assertions across 20 files**, up from 1498/19; `disk-space.test.mjs` is the new file (65). Driven in Electron against the real probe: **28 checks, 15 rows on screen.** | Amends **D256** §5.39 (memory never rendered); §5.39k (the Design question, now triggered); D226 (strip it before it leaves); D242 (one machine, one wording). |

**5.40a — DISK IS NOT A RESTART SIGNAL, AND THE CODE IS ARRANGED SO IT CANNOT BECOME ONE.** A full
disk is exactly as full after a restart, and the telemetry spec's §6 score table does not list it —
rolling it in would produce the most useless recommendation this product could make. So the probe
returns `volumes` in a **separate field** from `restart` (a test pins the pair), the two modules
import nothing from each other (two more assertions), `disk-space.js` contains no `score`, `weight`
or `recommend`, and `scoreRestart()` is asserted to return an identical score with and without a
machine whose disks are full. Four structural checks rather than a comment saying "don't".

**5.40b — THE DUAL THRESHOLD, AND THE MEASUREMENT THAT FORCED IT.** Flag only when free space is
below **both** 15% and 25 GB. The spec measured five volumes and a naive *"below 20% free"* rule
fired on two of them, **both with more than 160 GB of headroom and in no trouble whatever.**
Re-measured on this machine the same day, the same thing: C: and E: at **17.5%** free with 163 GB
each. **A naive rule raises two false alarms on a healthy machine; the dual threshold raises none.**
This is `PendingFileRenameOperations` one signal along — the obvious rule fires confidently on
machines that are fine — and the test drives both the spec's five volumes and the inverse case
(24 GB free on a 3.7 TB disk, which IS flagged, at 0.6%).

**5.40c — THE CONCLUSION LEADS AND THE FIGURE FOLLOWS, WHICH IS WHERE DISK DIFFERS FROM MEMORY.**
*"163 GB free"* is a sentence an office worker can act on; *"commit charge 68.8%"* is not. That is
the whole distinction behind acceptance 5, and it is why the disk row carries its number and the
memory row carries none. Rows read `Plenty of room — 163 GB free`, `Getting full — 40 GB free`,
`Almost full — 8.0 GB free`. **Per volume, never aggregated**, which the spec states and which
matters because a machine with 2.9 TB free across five drives and 8 GB left on C: is in trouble and
a total says the opposite — `disk-space.js` contains no `reduce` and no `+=`, and a test says so.

**5.40d — ONE BAND FUNCTION FOR MEMORY, BECAUSE TWO SURFACES NOW READ IT.** `memoryBand()` is
exported and both the row and the sentence go through it, so they cannot disagree at a boundary.
**It also surfaced a contradiction that was latent in D256:** the scoring bands are configurable and
the descriptive ones are not, so a tenant who sets `commitElevatedFraction` to 0.5 makes a
60%-committed machine SCORE while the row honestly reads "Plenty free". Rather than invent a clause
that contradicts the row, `EVIDENCE.commit` now returns **null** below the descriptive bands: the
contribution still counts toward the score and names no evidence, and `restartSentence()` drops
clauseless contributions. Four assertions cover it.

**5.40e — THE PANEL IS NOW FIFTEEN ROWS, AND §5.39k's CONDITION IS MET.** D256 held the Design
handover because nine rows is not obviously a different layout from eight, and recorded that the
question — *what happens to this panel at roughly a dozen rows, and does it want grouping or
severity?* — gets sent **when there are enough rows to answer it against something real.** On this
machine the band is now **15 rows**: nine, plus memory, plus one per fixed volume. The delivery's
two-column grid absorbs them and nothing is broken, but five near-identical disk rows reading
"Plenty of room" is exactly the case the question was recorded for, and the row count is now a
function of the machine rather than of the design. **The Design handover is WRITTEN and awaits a
delivery:** `docs/handovers/2026-09-11-claude-design-handover-machine-band-rows.md`, in the
ONE-PAGE form that got a buildable export out of the last request rather than the long brief that
did not. **Its whole argument is the number: the delivery's own mock draws SIX `.mrow` and the band
now renders fifteen**, so the count is a property of the machine rather than of the design — a
two-drive laptop gets twelve, and two of the conditional rows drop out on a machine with no address.

It asks three things — **grouping**, **severity**, and what five healthy drives should look like —
and **severity is the one worth most**, because nothing in the band currently distinguishes
`Printing — Stopped` from `Printing — Running normally`: on six rows you read them all, on fifteen
you scan, and scanning finds nothing. It also carries the constraint that makes severity hard, which
is this feature's own finding turned back on the design: **two of this machine's drives sit at 17.5%
free with 163 GB each**, so a design that colours a percentage reintroduces exactly the false alarm
the dual threshold exists to prevent. **Severity must key off the app's verdict, never off the number
in the string** — and a row may signal "this one" and may never signal "do something", because the
recommendation is a conversational moment and a row that argues argues every time the band opens.

Every factual claim in it was checked against the files before it was committed — the delivery's six
rows, app.css's 155 lines, the `.mgrid` rule quoted verbatim, and every value string it promises the
app can supply (46 assertions, scratch). **Sending it is Charles's act, not a session's.** Nothing is
grouped or coloured in `matic-panel.app.css` meanwhile: that is the inversion D241 exists to prevent,
and app.css's empty "knowing exceptions" section is how anyone can tell the arrangement still works.

---

### 5.41 D258 — Claude Design's grouped band, integrated; severity keyed off our verdict (2026-09-11)

Charles: *"integrate both stages together."* The brief of §5.40e was sent and **answered the same
day.** The delivery is `delivery/matic-desk-panel.html` + `machine-band-2026-09-11.html`, now on
disk as the panel; it is the D252 re-export plus the machine-band addition, so it **supersedes**
what D252 integrated rather than sitting beside it.

| ID | Decision | Status | Links |
|---|---|---|---|
| **D258** | **The machine band is grouped, and a row can carry a MARK — but the mark is produced by the code that owns the threshold, never by looking at the row's words.** Claude Design's addition draws severity from `data-state` on `.mrow` and grouping from `data-group` on a new `.mset`, and asks the app to set both. `src/agent/machine-band.js` is the new pure module that decides them; the renderer sets what it is handed and **branches on no row's value anywhere** (a test pins that). **There is no `data-state="ok"`, by the delivery's own instruction** — a healthy machine is a band with not one mark on it. | **DONE 2026-09-11.** **1691 client assertions across 21 files**, up from 1595/20; `machine-band.test.mjs` is new (96). Buildable on the first try: `panel:build` accepted it and the whole suite stayed green with it in place, before a line of app code moved. Driven in Electron on real data and on the check page for the marks. | §5.40e (the brief it answers), D252/§5.35 (superseded by this export), D241 (a design change arrives as a delivery), D256/§5.39c (the reading, not the band), D245 (one fact, one surface). |

**5.41a — IT CLEARED THE BUILDABILITY BAR ON THE FIRST TRY, AND THAT IS NOW THE SECOND TIME.**
524 `class=` attributes, 36 inline styles, 47 KB of CSS in the unlabelled `<style>` block, the
contact sheet's own chrome labelled `id="sheet-only"` exactly as `buildPanelCss()` expects, **no
`<link>`, no `<script>`, no remote URL of any kind, no templating.** `npm.cmd run panel:build`
accepted it unchanged and **all twenty test files still passed with it in place before any app code
moved** — which is the measurement that matters, because it means the delivery is additive rather
than a rewrite. **Zero token values changed** (39 before, 39 after) and **nothing renamed**: every
name the previous delivery styled is carried forward. The four retuned values its header describes
are the ones D252 already integrated, so the diff against what we hold is nil — checked rather than
assumed.

**5.41b — THE SEVERITY CONTRACT, AND WHY IT IS NOT A COLOUR DECISION.** The delivery's own words:
*"Keyed off YOUR verdict, never off the number in the string. … `data-state="attn"`: your verdict
says THIS ONE. 17.5% and 163 GB free is not this, and never becomes this, because the design cannot
see either figure."* So the verdict is produced where each threshold lives — `describeVolume()` for
disk, `memoryBand()` for memory, `serviceRow()` for a service, and the restart score's own
`recommend` for the uptime row — and travels to the renderer already decided. **A renderer that
coloured a row by reading "Getting full" out of its value would be reading a figure out of a string
one layer along, and would put back exactly the false alarm the dual threshold exists to prevent.**
`machine-band.test.mjs` §2 is that assertion, and §8 pins that the renderer compares no `r.value`.

**Three states, and only three.** `attn` (our verdict says this one), `watch` (worth noticing, not
urgent), `unread` (the probe could not read it — **the quiet token, because a limit is not a
warning**). A test enumerates every state the app can produce across every machine shape and every
state the delivery draws, and asserts the two sets are equal: neither can grow without the other.

**5.41c — "DO NOT SET `data-state="ok"`", WHICH THEY REACHED INDEPENDENTLY.** Their note: *"A mark
that says 'fine' is fifteen marks on a healthy machine, which is the defect this is fixing, not a
fix."* That is the same argument D256 made for the row carrying no advice, arrived at from the other
side. `undefined` is the whole of a healthy row, and §1 of the new test drives five healthy machine
shapes and asserts not one mark appears — including the 17.5%-free volume, twice.

**AND A MARK IS NOT ADVICE.** D256 forbids a row that argues; the mark says *"this one"* and never
*"do something"*. **No row's words change because of its state** — a test asserts the same reading
produces the same string marked or unmarked — and the mark is a 2px rule in a gutter the row now
*always* reserves, so the band does not shift when a machine goes bad and the mark is findable
without the hue. Position first, colour second, which is the delivery's phrase and the accessible
order. **Red stays reserved for nothing at all**: the delivery recommends it explicitly, on the
grounds that nothing in this band is a failure of the system — a full drive is the machine's news,
correctly reported.

**5.41d — THE MARK WE DELIBERATELY DO NOT SET.** A disconnected machine marks `Network` and leaves
`Network adapter` unmarked, though it reads "None found". Marking both says one fact twice, adjacent
— D245's rule one surface along — and the row still carries the information. The two address rows
are never marked either: they are evidence, and `Network` has already given the verdict.

**5.41e — ONE FINDING IN THE DELIVERY, MEASURED, AND IT IS WHY BOTH STAGES SHIPPED TOGETHER.** The
delivery says severity is safe to ship alone: *"Ship (1) alone if the wrapper is not worth it yet;
the band does not regress without it."* **It does regress.** `.mgrid`'s gap goes from `1px 28px` to
`20px 28px`, which is right between SETS and wrong between ROWS — so on the flat markup the app
built before this pass, 20px lands between every row. Measured in the real app:

| | before | new delivery, flat markup |
|---|---|---|
| row-gap | 1px | **20px** |
| mean row pitch | 39px | **58px** |
| band height, 15 rows | 378px | **521px — 38% taller** |

143px of an 800px window, for no gain. **Shipping both stages together makes it moot** — with
`.mset` wrappers present the 20px separates sets, which is what it is for — and that is why Charles
chose both. **It is recorded rather than patched:** the alternative fix is one line in THEIR file
(scope the row-gap to `.mgrid:has(.mset)`), and doing it in `matic-panel.app.css` would be the
inversion D241 exists to prevent. Anyone shipping stage 1 alone in future needs that line first.

**5.41f — a smaller inconsistency in the delivery's own prose.** Section (1) of the machine-band
comment says *"Two drawn values"* and then lists two, but the CSS draws **three** (`attn`, `watch`,
`unread`) and the band file's artwork uses all three — the middle tier is explained there rather
than in the stylesheet. Nothing is broken and nothing was changed; it is noted because a future
maintainer reading only the stylesheet comment would not know `watch` exists.

**5.41g — `serviceWords()` HAS ONE HOME NOW.** It lived in `renderer.js` and is exported from
`machine-band.js`, because the band and the proposal's evidence line (`evidenceFor`, still in the
renderer) both say a service state out loud. Two copies would drift, and the drift would be two
surfaces describing one service differently. `serviceRow()` calls it rather than repeating it, and a
test drives five state values through both to assert they cannot disagree.

**5.41h — the row count is still a property of the machine, and that has not changed.** Grouping
does not reduce it: fifteen rows are still fifteen rows, in five named sets of two to five. What
changed is that the eye goes to the set before the row, and — with `grid-template-columns:
repeat(auto-fit, minmax(310px, 1fr))` — the band drops to one track when the window is dragged
narrow, which the flat two-column grid never did. **Two markup changes were needed on our side:**
`#machineGrid` is a `<div>` now rather than a `<dl>` (the `.mset` children are the `<dl>`s), and the
renderer emits one wrapper per group.

---

### 5.42 D248, BUILT — the exact call is glossed, and the gloss is catalog text the broker assembles (2026-09-11)

Charles: *"do d248."* Proposed 2026-09-10 in §5.31 and left open because it is a change to the
rendered contract rather than a patch. **No ID was taken for this: the decision is D248 as proposed,
and nothing about it changed on ratification** — this section records what was built.

**What the card carried, and still carries:** `restart_service(serviceName=spooler)` — our
identifier and a registry key, in a function-call signature, on the one screen where a person grants
permission. **What it carries now, above that line:** *"Restart the Print Spooler service."*

**5.42a — the gloss says the one thing nothing else on the card did.** `plain.what` describes the
ACTION and never names its target: *"Stops one background Windows program and starts it again"* never
says which, and *"Switches the network adapter off and straight back on"* never says which adapter.
**The exact call was the only field on the card carrying that information, and it carried it as a
registry key or a GUID.** So the gloss is not a restatement — it is the missing half, in the words
Windows itself uses (`plain.serviceNames`, from D247).

**5.42b — BUILT BY THE BROKER FROM CATALOG TEXT, which is why it needed the contract change.**
`rendered.detailPlain` is new on `ConsentRequest`. The words come from `plain.call`, a template on
the capability, with `plain.callParams` naming a resolver per parameter; `renderCallGloss()`
assembles it exactly as `title` and `rollbackNote` are already assembled. **The renderer could not
have done this** — a renderer authoring consent wording is precisely what D130 forbids, and that is
the whole reason the line sat undrawn in the delivery for a day with a comment explaining why.

**Three resolvers, declared in the catalog rather than guessed from a parameter's name:**
`serviceNames` (a static map on the capability), `adapterByIndex` and `adapterByGuid` (the live
probe). The catalog saying which one each parameter uses keeps the mapping reviewable beside the text
it feeds — the same argument that put `plain.serviceNames` in the catalog rather than in code.

**5.42c — EVERY UNKNOWN FALLS BACK TO THE RAW VALUE.** An adapter gone between probe and render, a
service with no mapping, a probe that throws, a resolver nobody implemented: each yields the value
the call actually carries. **That is no worse than the exact call printed directly beneath it, and
far better than naming the wrong adapter** — which is the one outcome a gloss must never produce. A
placeholder naming a parameter the proposal does not carry is **left visible**, because obviously
wrong beats invisibly wrong on this screen. Six assertions, including a probe that throws.

**5.42d — A CAPABILITY WITH NO PARAMETERS GETS NO GLOSS, and that is a decision.** `flush_dns()` has
nothing to point at, so a gloss there could only restate `plain.what` two lines below `plain.what` —
**which is D245's defect exactly: one fact, two wordings, adjacent.** `plain.call` is simply absent
for it, `detailPlain` is `null`, and the renderer draws **no element at all** rather than an empty
labelled row. That is also the delivery's own written fallback for this row.

**5.42e — the exact call is untouched, and that was the point of glossing rather than replacing.**
`detail` is byte-identical, still rendered verbatim, still mono and subordinate, still the field
`docs/D130-RENDERER-CHECK.md` compares on screen. **D244's rule is that a closed value reaching the
user is GLOSSED, never hidden**, because the card is the payload view and D128 requires the user to
see what is being approved — and the same reasoning that kept `needs_human_judgement` on the review
card keeps the call signature here.

**5.42f — the wire format is a contract, so the field is listed where a transport implementer will
find it.** D200/D201 made the pipe schema a contract; `client/docs/2026-09-04-named-pipe-protocol-design.md`
now names `rendered.detailPlain`, including that **`null` must survive as `null`** rather than as
`""` or a dropped key. `consent-surface.test.mjs` §4c asserts the field arriving **over the pipe**
rather than out of the in-process broker, so what is checked is the serialisation. The audit record
needed no plumbing — `consentRendered` is the whole rendered object — and a test asserts the record
keeps the same string the card was given, because the trail has to say what was shown.

**5.42g — where the assertions live, and why they are split.** `broker.test.mjs` §12 holds the unit
rules (the null case, the two live resolvers, every fallback, and a scan that every placeholder in
every template is a real parameter with a declared resolver). They cannot be driven from
`consent-surface.test.mjs`, which talks to the broker over a pipe against a deliberately OFFLINE
machine — `flush_dns` is refused there by precondition, which is a pre-existing property of that
test and not a new limitation.

**1724 client assertions across 21 files**, up from 1691. Driven on the check page: the gloss reads
*"Restart the Print Spooler service."* at 13px in the body face at full ink, and
`restart_service(serviceName=spooler)` sits beneath it at 12px in mono and muted — a plain-language
line above, the exact call below and subordinate, which is D248's proposal in its own words.

**What is NOT glossed, deliberately.** The four `consentRendered` prose clauses stay verbatim (D255):
they are the broker's retained catalog text and the D130 click-through compares them field for field.
And no spoken line changed — the gloss is a shown string, and `say()` never reads it.

---

### 5.43 D242, RATIFIED — the tickets band is permanent, and what it may not say is now pinned (2026-09-11)

Charles: *"do d242."* Proposed and **built reversibly** on 2026-09-10 (§5.28), left open for the
founder because the design handover's §4 asked him directly. **No new ID:** the decision is D242 as
proposed, and nothing about it changed.

**What ratification actually settles.** The escape hatch was that the band's trigger and markup came
out of `index.html` if the answer was no, with the IPC channel and the egress read staying because
the spoken answer (D235) already used them. **The answer is yes, so that escape is spent and the
band is permanent** — which changes what the tests owe. It had five assertions, four of them single
regexes over renderer source; it has **twenty** now.

**5.43a — the invariants were re-checked before the status moved, not assumed.** The band has been
through two design deliveries since it was built (D252's re-export and D258's grouped band), so
ratifying it on the strength of a decision written a day earlier would have been careless. Driven on
the check page and read back from the DOM: the row carries **"Filed from here"** and **"Progress not
visible"** as a matched pair, the note carries the limit clause, the count is on the trigger, and the
trigger reads *"Tickets I've filed from this machine"*. All three of D242's clauses hold.

**5.43b — THE PAIRING WITH THE SPOKEN ANSWER IS MECHANICAL NOW, AND IT WAS NOT BEFORE.** D242
requires the band's note to state the limit *"in the same words `persona.tickets.some` speaks"*, so
the band and the voice cannot describe one ticket two ways. That was two independent regexes —
`/Progress not visible/` and `/isn't something I can do in this build/` — **either of which would
have gone on passing while the other string was edited.** The shared clause is now extracted from
the persona file and looked for in the renderer, character for character:

> checking a ticket's progress with the service desk isn't something I can do in this build

Mutation-probed in both directions: rewording the persona line fails the section, and so does
rewording the note. There is also a check that the band does not say the same fact a **second**,
different way, which is D245's rule applied inside one surface.

**5.43c — "no channel that could become a hub lookup" is now a check rather than a sentence.**
`canQueryHub` is carried so the inspector can disclose it, and a lookup keyed on the self-asserted
`osUsername` would be D54's user identity through the back door. So the rule is: **it may appear in
an inspector payload and may never appear in a condition.** A probe that made it gate a branch was
caught. The preload is also scanned: exactly two ticket channels exist (`ticket:file`,
`ticket:filed`), and **a third is how a status lookup arrives.**

**5.43d — the three note branches must stay three, and none may imply a status.** D242 names the
worse outcome by a distance: *"the user reads 'no news' where the truth is 'no lookup'."* So the
cannot-file case and the empty case are asserted to be distinct strings, and all three are scanned
for status vocabulary — `in progress`, `being worked`, `assigned`, `open`, `closed`, `resolved`. A
probe that changed one to *"They are being worked on"* was caught.

**5.43e — the trigger.** It read *"Tickets you've opened"* in the September delivery, which claims
knowledge of tickets raised anywhere; the re-export's *"Tickets I've filed from this machine"* is
D242's own constraint said better, and both halves are pinned — the right wording present, and the
claiming wordings absent.

**5.43f — five mutation probes, all five caught.** Two were caught by the adjacent assertion rather
than the one predicted, which is the correct behaviour rather than a miss: a persona edit fails
"the spoken answer carries the limit clause" before it can fail the pairing, and a trigger edit
fails the sharper of the two trigger checks. The tree was reverted and the baseline re-run green
after each.

**1739 client assertions across 21 files**, up from 1724. **Nothing in D242 is now open, and with
D248 built the same day, no decision in this register is waiting on Charles.** D202 and D130–D150
remain proposed, and those are design-review and identity-model items rather than anything built and
held.

---

### 5.44 D259–D261 — Matic is a service desk, its scope is three verbs, and its boundary is the company rather than the machine (2026-09-11)

Charles widened the product from a **technical** service desk to a **service desk**: the knowledge
base may hold anything the business puts in it — technical procedures, HR processes, facilities,
cafeteria menus — and the assistant handles three verbs against it. Written up in
`docs/handovers/2026-09-11-claude-code-handover-greeting-scope-and-voice.md`; this section records
what was decided and what was changed.

| Verb | Shipped today |
|---|---|
| **Fix** | Yes — the four `catalog.json` capabilities |
| **Find** | Yes — company guidance through the hub's KB |
| **Request** | **No.** Intake for "I need a thing" is scoped, not built |

**D259 — Matic is a service desk, not a technical service desk.** *Decided.* Founder. Load-bearing
for copy, classifier and catalog at once, which is why it is an ID rather than a note.

**D260 — the persona names no knowledge domain.** *Decided.* Scope is stated as **verbs**, never as
a domain list. An extension of D165's reasoning from capabilities to KB content: whether a given
tenant's KB holds HR content is a **deployment** fact, not a product fact, so a line naming domains
is wrong for every customer who did not load them. It also survives every KB expansion with no
re-record, which matters because the greeting audio is pre-recorded and cannot be templated.

**D261 — the persona's boundary is what the company has given it, not this machine.** *Done.*
Forcing reason: `social.offtopic` was the **one moment in the whole product where the user is
explicitly told what the scope is**, and after D259 it taught a scope narrower than the truth —
*"I only look after this machine"*, *"I'm strictly an IT sort"*. A user told that will not come back
to ask about leave, and nothing later corrects the impression.

**5.44a — the decline was right; only the reason given was wrong.** Checked at source before
anything was edited. `classify.js:172` shows `offtopic` is **not** a catch-all: it is an allowlist
of **13 complete phrases** (the weather, a joke, the score, the time, a favourite, the president, a
poem, "what do you think of"), deliberately complete phrases rather than topic nouns so that *"the
weather app won't open"* and *"this printer is a joke"* still reach the problem path. "What's the
cafeteria menu", "how do I book leave" and "I need a new monitor" match **none** of them and fall
through to the KB as they should. **The handover's original warning that the classifier would refuse
the widened scope is withdrawn, and `classify.js` was not changed.**

**5.44b — what changed in `persona.json`, and nothing else changed.**

| Key | Was | Is |
|---|---|---|
| `social.offtopic[0]` | "…I **only look after this machine**. But if anything on it is misbehaving…" | "…I'm here for **work**, not the wider world. But anything you need from **the company or from this machine**…" |
| `social.offtopic[1]` | "…I'm **strictly an IT sort**. Anything wrong with this computer…" | "…I stick to **what your company's given me to work with**. Anything you need **at work**…" |
| `role` | "the **IT** support assistant on this machine" | "the support assistant on this machine" |
| `social.howareyou[0]` | "Anything **on this machine** I can help with?" | "Anything I can help with?" |
| `social.howareyou[1]` | "What's going on **with your computer**?" | "What's going on?" |

`capability.boundary` was deliberately **not** touched — *"Anything beyond that list I can't do
myself, but I can look for your company's guidance on it, or hand it to IT with everything I've
already checked"* was already written to the wider shape and is the model the rest moved toward.
`howareyou[2]` claims no scope and needed nothing.

**5.44c — two things found while doing it that the handover did not know.**

1. **`persona.role` is dead data.** Nothing in `client/src` or `client/test` reads it — the string
   was changed because §15.4 asked for it and because a stale scope statement sitting in a data file
   is a trap for the next person, **but changing it altered no behaviour.** The persona file's own
   `$comment` implies it is read; it is not.
2. **`prompt.js:22` still says "an IT support assistant" and was deliberately LEFT ALONE.** That is
   the system prompt, and it is the model's scope statement — so under D259 it is stale in exactly
   the way `social.offtopic` was. It was not changed because `prompt.js`'s own header states the
   reason not to: *"If the cloud provider and a local one word the system prompt differently, the
   bake-off measures the wording and reports it as a property of the model."* Editing it moves the
   §4 bake-off baseline, which is a cost the scope change should pay knowingly rather than acquire
   as a side effect of a copy fix. **Recorded as `[VERIFY]`/open, see §10.2.**

**Verification.** `node test/persona.test.mjs` — **121 assertions, 0 failed.** Rule 1 was
**re-derived rather than assumed**: `capWords` from the live `catalog.json` is exactly
`dns, dhcp, spooler`, and none of the five new strings contains any of them. Rule 2's `CLAIMS`
regexes match none of them.

---

### 5.45 D262 — the boot greeting rotates across LAUNCHES, and the only degraded set that survived is the one the band cannot say (2026-09-11)

Charles: *"Let's remove the old system and replace with new one. The old system wasn't working
anyway, only one greeting ever played. What we do need is a greeting for special cases like if the
user is not connected to internet or if hub is not connected — so we can either kick off
troubleshooting to get connected, or report limited functionality."*

| ID | Decision | Status | Links |
|---|---|---|---|
| **D262** | **The boot line is chosen by `src/router/greeting.js` from a set the machine's state selects, and its cursor is PERSISTED ACROSS LAUNCHES.** A per-process cursor is not a rotation for a line that fires once per process. **There are exactly two sets — `offline` and neutral — and the hub state chooses neither**, because the rail and the standing band already state the hub's availability permanently and D245 gives that fact one wording on one surface. | **DONE 2026-09-11.** **1808 client assertions across 22 files**, up from 1739/21. Verified in the real Electron window over the DevTools Protocol, not only headlessly. | D234 (persona lines are data), D245 (said once), D198 (offer, never propose), D49/D51 (the hub states), D259–D261 (§5.44). |

**5.45a — "only one greeting ever played" was TWO bugs, and the second is why the obvious fix would
have been a lie.** `renderer.js:1587` spoke `persona.boot[0]` — a hardcoded index, so `persona.boot[1]` had
never once been spoken in the life of the product. **And the rotation helper next door would not
have fixed it:** `social.js`'s cursor is a module-level `Map`, described in its own comment as
*"per-process, so the rotation survives across turns"* — correct for the mid-session hello it was
written for, and exactly wrong for a line that fires **once** per process. Swapping in
`pickVariant("boot", …)` returns `boot[0]` on every launch forever **and passes its test.** So the
cursor is persisted (localStorage, beside the theme) and the test does not check that the picker
rotates — it checks that **three successive launches, each starting from what the last one
persisted, say three different things.** That is the shape of the bug. `social.js` is untouched: its
in-process cursor is right for the path that actually uses it.

**5.45b — THE CLICK-THROUGH DELETED TWO THIRDS OF THIS FEATURE, AND THE SCREENSHOT IS THE WHOLE
ARGUMENT.** Four sets were written from the handover's copy — `offline`, `standalone`,
`hubUnreachable`, neutral — built, and green on 63 headless assertions. Then it was run in Electron
with no hub configured, and one screen carried the fact **three times**:

| Surface | Words |
|---|---|
| the rail | "Working on this machine only — No company guidance or service desk is set up here. That's normal for this machine." |
| the standing band | "ON THIS MACHINE — There's no company guidance or service desk connected here, so I'll stick to what I can check and fix on this machine itself." |
| **the avatar** | **"Hi, I'm Matic. There's no service desk connected to this machine, so it's just me and what I can see here…"** |

`index.html`'s own comment over that band says the rule before D245 is even cited: *"what the
assistant cannot do right now, **said once**, without apology"*, and *"two surfaces describing one
state differently is a shipped defect."* The `hubUnreachable` copy was worse — a near-verbatim
rewording of the band's own sentence, down to "I'll keep trying" against the band's "I'll tell you
as soon as that changes."

**The resolution is D245's own division of labour: the band says what is AVAILABLE; the greeting
says what to DO NEXT.** Take the availability half out of a `standalone` greeting and what is left
*is* the neutral boot set — so those states use it. `bootSetFor` returns `neutral` for every hub
state **deliberately rather than by omission**, `hubState` stays in the signature with the reason
written at it, and a test asserts `bootState` has no key but `offline` so that re-adding one fails
loudly rather than quietly re-creating this.

**5.45c — why `offline` survives, and what it had to give up.** It does the one thing no band does:
**it OFFERS to act.** Three of the four capabilities are network faults, so this is the product's
best moment. Two changes fell out of 5.45b: the lines no longer name the company's guidance or the
service desk (the band's words), and name **the network route** instead, which no other surface
states in a sentence. **It offers, it never proposes** — an unprompted consent card at boot is the
D198 defect verbatim. The user's answer goes down the ordinary turn path, which reaches
`diagnoseOffline()` when no capability applies and the normal proposal flow when one does; no new
troubleshooting text was written, because `offline-guide.js` already learned those lessons.

**5.45d — the copy that shipped, and the three lines deliberately held back.** `boot` carries the
escalation line first (*"What I can handle, I'll handle. What I can't, I'll get to someone who
can."*) — worth 4.4 seconds at first contact and noise on the fifth hello of the day. **Three of the
six written greetings are NOT shipped**, and they are recorded in the persona file's
`$bootComment` so they are one edit away: they offer to take a **request**, and request intake is
not built. Never advertise a capability that does not exist — the rule the ad work established. A
test fails on the word "request" in any shipped greeting, so they cannot arrive by accident.
`social.greeting` (the MID-SESSION hello) lost its machine-narrow scope under D261 and lost its
self-introduction: the user is already in a conversation, and introducing itself is the boot line's
job. A test pins both halves.

**5.45e — measured, and it caught a harness bug wearing the product bug's exact shape (§10.5's
class, again).** Driven the D254 way: `electron . --remote-debugging-port=9223`, `Runtime.evaluate`
for the transcript and the app's own `[greeting]` log line, `Page.captureScreenshot` for the
screen. **The second launch spoke the same line as the first** — which is precisely the bug being
fixed, and it was not the bug. **A hard kill loses the localStorage write**, because Chromium
flushes it asynchronously; proved by a separate four-run probe that wrote a marker and read it back
across graceful closes and kills. With the harness closing the window properly:

| Launch | State read | Spoken | Cursor persisted |
|---|---|---|---|
| 1 | `online=yes hub=standalone` | neutral[0] | `{neutral:1}` |
| 2 | same | neutral[1] | `{neutral:2}` |
| 3 | same | neutral[2] | `{neutral:0}` |
| 4 | same | neutral[0] — wrapped | `{neutral:1}` |

**Trap 1 was observed rather than reasoned about.** Against a hub URL with nothing behind it, the
greeting went out with `hub=checking` and its probe already failed once — D51's hysteresis needs
three — so a state-aware greeting read that early would have announced an outage the app had not
established. It claimed nothing, which is the whole of the rule. **And each set's cursor was shown
to advance independently:** two standalone-state launches left `{standalone:0, neutral:…}` with the
neutral cursor untouched.

**5.45f — the limitation, stated rather than discovered later.** The cursor lives in localStorage,
so **an unclean exit loses that launch's advance** and the next launch repeats a greeting. Measured,
not assumed. It is kept there anyway: the theme already lives there, the failure mode is hearing one
sentence twice, and moving it to disk would mean a main-process store and an IPC channel for a
rotation cursor. If the greeting audio ever ships, revisit — an audible repeat is more noticeable
than a read one.

---

### 5.46 D263 — the boot line is pre-recorded, and the brief's blocker for it was not real (2026-09-11)

Charles tested D262 and said: *"It has the new prompts (text) but not the new audio."* Correct, and
deliberate — the audio path was gated on §5, the voice seam. Asked how he wanted §5 settled, he
chose **wire it and then listen**, which is the only option that produces evidence: **nobody had
heard the seam when the four options were written down.**

| ID | Decision | Status | Links |
|---|---|---|---|
| **D263** | **A persona line may ship with a PRE-RECORDED audio file, matched on its exact display text, with Piper as the fallback for everything else.** The three neutral boot lines are ElevenLabs Hazel; every other line the app speaks is Piper. **This is option C of the greeting brief's §5, taken REVERSIBLY and as an experiment rather than as an answer** — one value in the manifest turns it off and the app is back to Piper everywhere. | **DONE 2026-09-11.** **1855 client assertions across 23 files**, up from 1808/22. Played and measured in the real Electron window; the fallback branch was exercised by hiding a file. | D234 (persona lines are data), D249 (shown vs said), D253 (a surface may not claim an outcome it was not told), D262 (§5.45). |

**5.46a — THE BRIEF'S BLOCKER IS NOT REAL FOR THIS BUILD, and that is what made the decision
cheap.** The Cowork brief's §4 said an ElevenLabs MP3 carries no phoneme timeline, so *"played as
is, the avatar speaks with its mouth shut"*, and priced the path at a forced-alignment tool plus a
timeline file per greeting. **Read out of the delivery's own files rather than assumed:**

- `matic-avatar.manifest.json`, on the `speaking` state: *"'talk' is the fallback when no viseme stream
  is bound. With a stream, drive #mouth from phonemeToMouth instead and ignore this state's mouth
  value."*
- `matic-avatar.css` animates that mouth — `animation: matic-talk 0.42s ease-in-out infinite` —
  and switches it off **only** under `.mav[data-visemes]`, the attribute the viseme driver sets.

So a recording plays against **Claude Design's designed no-stream fallback**, which is the same path
`say()` has always taken when Piper fails to load. **Confirmed on the running window**, not inferred:
the avatar passed through `speaking` for the length of the file, the talk mouth was visible with a
live animation name, and no viseme stream was ever bound. Real lip-sync is still better and still
wants forced alignment; **it is not a prerequisite**, and three assertions read the two claims above
out of the delivery's files so this reasoning cannot rot silently.

**5.46b — keyed by exact display text, never by index, and that is the whole safety property.**
`persona.boot` is ORDERED because it is rotated in order (persona rule 4), so somebody will reorder
it — and an index-keyed manifest would then play one recording while the transcript showed a
different sentence. **The avatar saying something other than what is on screen** is the one failure
this design exists to make impossible. The match is exact: no case folding, no punctuation
normalisation, no fuzzy fallback. **A near-match is not a match** — a recording of an older draft is
worse than Piper reading the current line, because the two would differ by a few words and nothing
would report it. An unmatched line simply falls through to Piper, which is why the `offline` set
needs no entry and why adding a greeting cannot break the file. A test asserts every recorded line
is a shipped persona line character for character, and that no entry carries an `index`, `position`
or `id` field at all.

**5.46c — D249 is a GATE on this path, not a formality.** D249 rewrites what reaches the voice when
a sentence carries this machine's name, the signed-in account or its own address. **A fixed audio
file cannot be rewritten.** So `say()` only consults the manifest when `heard === said` — if the
redaction changed anything, the line is ineligible for a recording however well its text matches,
and Piper reads the redacted form. No shipped greeting is affected today; the gate is what keeps
that true when someone adds one, and the test runs every recorded line through `spokenForm()` with
an environment that names all three.

**5.46d — a defect of D253's own family, found in the code written for this and fixed before it
shipped.** The first draft resolved `onended` and `onerror` to the same value and then logged
`recorded: <file>` — **so a stream that died half way through would have been logged as a clean
play**, in the one place a developer looks to find out why a greeting sounded wrong. That is D253
one layer down: a surface describing an outcome it has not been told. The two are now different
words (`played` / `STOPPED EARLY`) and the line carries the **elapsed milliseconds against the
file's known duration**, which is also what made the verification below conclusive. Falling back to
Piper on a mid-playback error stays wrong and is unchanged — the user heard most of the sentence,
and repeating it in a second voice is worse than stopping.

**5.46e — measured in the real window, both branches.** Driven the D254 way, with the avatar sampled
every 200 ms **throughout** rather than after.

| Branch | Evidence |
|---|---|
| **It plays** | `[tts] recorded played: matic_greeting_04_escalation.mp3 - 4449 ms of 4370 ms`. Elapsed matches the file's ffprobe duration, so it decoded and ran to the end rather than failing to load. The transcript showed the line that file records. |
| **The mouth** | `idle×15, speaking×22` over the playback; talk mouth visible with a live `animationName`; viseme stream never bound. |
| **A missing file** | One MP3 renamed away: `[tts] recorded line did not play (…): Failed to load because no supported source was found. - falling back to Piper`, and the turn continued. **The fallback DECISION and its log line were observed; the Piper audio that follows was not separately watched** — it is the existing, tested path. |

**5.46f — what this does NOT settle, and the experiment it exists to run.** **The seam is unchanged
and unheard by anyone in this session:** Matic introduces itself as Hazel and continues as
`en_US-amy-medium`. That is the whole content of §5 and it is a listening decision, not an argument
— which is why `enabled: false` in the manifest is a complete off switch rather than a code path, so
the comparison costs one value and a relaunch. **If the answer turns out to be B (Piper
everywhere), the three MP3s and this manifest are deleted and `recorded-speech.js` goes with them;
nothing else changes.** Also unchanged: the `offline` greeting has no recording and would need one
pre-rendered locally under any cloud-TTS answer, because the machine that most needs greeting is
the one a network-dependent voice can never reach.

---

### 5.47 D264 — the runtime voice stays Amy, tuned; and the metric that searched 1,014 voices lost to the ear (2026-09-11)

Charles: *"What can we do to match the TTS voice to Hazel? [close as possible]"* Then, having
listened: *"the accent is pretty strong. I listened to the mp3s. I like 07 Amy the best."* Then:
*"Let's leave the Eleven Labs recorded greetings for now. Use the new Amy version for TTS
everywhere else. I want the team to hear and make a decision. I think the Fall back will be TTS
everywhere. So keep the toggle variable so it will be easy to turn off."*

| ID | Decision | Status | Links |
|---|---|---|---|
| **D264** | **The runtime voice remains `en_US-amy-medium`, delivered with a tuning: `length_scale` 0.65 and a high-shelf of −2.3 dB at 2,500 Hz, Q 0.7.** Chosen by the founder from a listen, over 1,013 alternatives a measurement ranked above it. The tuning is config, with two independent off switches, because **the decision is the team's to confirm and the expected fallback is Piper everywhere.** | **DONE 2026-09-11.** **1890 client assertions across 24 files**, up from 1855/23, plus `npm.cmd run verify:voice`. Both switches driven in the real Electron window. | D263 (§5.46, the recorded greeting), D234, the greeting brief's §5. |

**5.47a — Hazel reduced to four numbers, so "closest" could be measured instead of argued.** A
voiceprint over the three recordings: **median F0 206 Hz**, **F0 span (p10–p90) 136 Hz**,
**articulation rate 4.59 words per second of speech**, **spectral centroid 1,224 Hz**. Rate is
articulation rather than words-per-second-of-file, because the latter rewards a voice for pausing
less, which is a different property.

Against that, the shipped voice: **f0 208 (already a match), span 52, rate 3.36, centroid 1,534.**
So two of the four gaps were closable and one was not:

| Property | Lever | Result |
|---|---|---|
| Pitch | none needed | already 208 vs 206 |
| Pace | `length_scale` | 0.65 takes 3.03 → 4.16 w/s |
| Brightness | high-shelf | −2.3 dB at 2.5 kHz takes 1,377 → 1,273 |
| **Expressiveness** | **none** | **span 52 against Hazel's 136** |

**The span is the one that cannot be tuned, and it is what "robotic" actually means.** A 6-point
grid over `noise_scale` × `noise_w_scale` moved it from 52 to 57. Those knobs change texture, not
intonation.

**5.47b — the `[VERIFY]` on Piper's capabilities is RESOLVED, against current documentation.**
§10.2 carried the brief's claim as unverified pre-May-2026 knowledge. Checked: `SynthesisConfig`
exposes `volume`, `length_scale`, `noise_scale`, `noise_w_scale`, `normalize_audio` and `speaker_id`.
**There is no pitch control, no voice cloning and no reference-audio conditioning.** The claim
stands and is now sourced rather than remembered.

**5.47c — 1,014 voices were searched, and the search lost.** Every speaker in
`en_US-libritts-high` (904) and `en_GB-vctk-medium` (109) plus the single-speaker candidates was
synthesised on the same line and ranked by distance to Hazel over the three properties Piper cannot
change — **rate deliberately excluded from the distance, because ranking on the one flaw that is a
one-line fix would be ranking on noise.** The winner, `libritts#532` (f0 212, span 139, centroid
1,280), scored **0.035 against amy-medium's 0.306**. Amy ranked **445th of 1,014**.

**Charles listened and picked Amy.** The reason is in his own words — *"the accent is pretty
strong"* — and it is the finding: **the metric had no accent dimension at all, and accent dominated
the judgement.** LibriTTS is American, VCTK is British, and a voiceprint of pitch, span and
brightness cannot see either. The search was not wasted — it is what establishes that no available
Piper voice is both neutral and expressive — but **a 1,014-way ranking was beaten by one person
listening to eight files, and the register should say so plainly rather than keep the leaderboard.**

Two costs the choice also avoids, worth recording since they were measured: `libritts-high` is
**136 MB against Amy's 63 MB**, and **515 ms median synthesis against 218 ms** — 2.4× slower on
every spoken line.

**5.47d — what shipped, and why the filter is in the worker rather than in ffmpeg.** `length_scale`
goes in at synthesis via `SynthesisConfig`; the shelf is a single biquad over the frames in
`scripts/piper_worker.py`. **Spawning ffmpeg per utterance to move a centroid by 100 Hz would put a
process in the speech path**, which is the one path in this app that must not acquire latency.
`scipy.signal.lfilter` runs it in C when present and a pure-Python loop (88 ms on 4 s of audio) is
the fallback — **a missing optional dependency must not silence the voice.**

**Q IS 0.7 AND THAT IS A MEASUREMENT.** The Audio EQ Cookbook shelf at the obvious Q of 0.5 yields a
centroid of 1,281 Hz where ffmpeg's own `treble=g=-2.3:f=2500` yields 1,273; Q 0.7 yields 1,273
exactly. **The samples Charles approved were rendered with ffmpeg**, so the calibration target is
what he heard, not what a formula defaults to.

**5.47e — the risk this could have shipped with, measured rather than reasoned about.**
`length_scale` compresses the waveform. **A viseme timeline that did not compress with it would
leave the mouth running ahead of the voice by a third of a second by the end of every sentence** —
nothing on screen would look broken, it would simply be wrong. Measured before the code was
written: the alignment sum equals the audio duration to **0.00% drift at both 1.0 and 0.65**, and
`verify:voice` re-checks it on every run. A biquad is sample-aligned, so the shelf cannot move it
either.

**5.47f — TWO OFF SWITCHES, AND THEY ARE DIFFERENT THINGS.** Charles asked for the toggle to be
kept because he expects the fallback to be Piper everywhere.

| Switch | Turns off | Where |
|---|---|---|
| `voiceTuning.enabled` (or `MATIC_VOICE_TUNING=off`) | **HOW** Piper speaks — back to plain Amy | `client/config.json` |
| `enabled` | **WHETHER** the boot line is Piper at all — the ElevenLabs recording | `client/assets/greetings/greetings.manifest.json` |

A test asserts they stay independent, because they will be confused. Both were driven in the real
window: with tuning on, `[piper] voice tuning: length_scale 0.65, shelf -2.3 dB at 2500 Hz Q 0.7`
and the worker echoing the same object; with `MATIC_VOICE_TUNING=off`, `OFF - plain Amy`. The boot
line played Hazel and the typed turn was answered by tuned Amy in the same session — **which is the
seam, now deliberate and audible, and the thing the team is being asked to judge.**

**5.47g — two defects found in the verification tooling, neither in the product, and one of them
failed working code.** §10.5's class twice more. **A JavaScript centroid measurement decimated the
sample loop while computing phase at the full rate** — decimation without a low-pass — and reported
a speech centroid of **5,544 Hz** where the true figure is about 1,370. It then **reported the shelf
as broken when the shelf was working**, which independent measurement showed immediately
(1,364 → 1,250 → 1,060 as the gain increased). **A verification tool that fails passing code is
worse than no tool.** And earlier in the same session, **two searches ran concurrently and wrote the
same temp WAV**, so frames could be measured from the wrong voice: the contaminated run measured 49
speakers where the clean one measured 110, and its ranking was discarded unread. Temp files are
PID-scoped now.

---

### 5.48 D265 — "nothing is wrong" is a speech act, and the classifier had no word for it (2026-09-11)

Charles, from the running app: *"I say everything was all good and Matic tried to open a ticket.
Not the proper response."* He typed **"Its all good thanks"** and got an escalation sentence and a
**Yes, open a ticket** card.

| ID | Decision | Status | Links |
|---|---|---|---|
| **D265** | **A user saying nothing is wrong is answered by the social layer, from persona data, with no provider call and no proposal.** New subkind `nothingneeded`, sitting ABOVE `thanks` in the marker order. | **DONE 2026-09-11.** **1909 client assertions across 24 files**, up from 1890/24. Confirmed in the real Electron window on the exact sentence. | **D198** (the defect family), D165/D212 (the social layer runs ahead of every provider call), D234, D216. |

**5.48a — the residue rule was NOT the bug, and that matters for whoever touches this next.**
`classify("Its all good thanks")` matched the `thanks` marker perfectly well. What vetoed it was
`residue()` returning **"its good"** — a non-empty residue means the pleasantry was a doormat in
front of a real message, which is exactly what keeps *"thanks but the printer still won't print"* on
the problem path. **The rule is right and was left alone.**

The actual gap: **"nothing is wrong" is a speech act the classifier had no vocabulary for.** So the
sentence fell through to the model, which had a problem-shaped slot to fill and filled it.
**D198's defect arriving by a third route** — not the ordering (D212 fixed that), not the residue
test (D234 fixed that), but a missing intent.

**5.48b — why it sits above `thanks`.** "Its all good thanks" is a user telling us nothing is wrong
and being polite about it: the substance is the reassurance, the thanks is the wrapper.
*"You're very welcome"* is a worse answer than *"Good to hear"* — and both are enormously better
than a consent-shaped card the user did not ask for.

**5.48c — complete phrases, and the residue rule is the second guard.** Same discipline as the
off-topic allowlist (§5.44a): a bare "good" or "fine" is a word that lives inside real complaints.
Every marker is a complete phrase, **and the residue test still runs after they are stripped**, so
the sentences that must survive do:

| Typed | Goes to |
|---|---|
| "Its all good thanks" | `social/nothingneeded` |
| "no issues" · "all sorted" · "im good thanks" · "not right now" | `social/nothingneeded` |
| "it was all good until this morning" | the problem path (residue "it was until") |
| "no issues with the printer but the scanner is dead" | the problem path |
| "im fine but my laptop is not" | the problem path (residue "but my laptop is not") |
| "no internet" · "no sound" | the problem path — **"no" is NOT filler** |

**5.48d — one adjacent find, and the line not crossed.** "nope all good" still failed, because
`residue()` left **"nope"**. `nope`, `nah` and `nup` are filler now — nobody reports that their nope
is broken — **and `no` deliberately is not**, because "no internet" and "no sound" are complaints
in which "no" is doing the work.

**5.48e — verified where it was found.** The exact sentence, typed into the real Electron window:
the app answered *"Good to hear. I'll be here if anything does come up."*, no card, and the
developer log read
`[router] social marker "all good" with no residue (D165) - answering from a template, no provider
call, NO PROPOSAL`. **A test now pins the reported sentence by name**, along with six more of its
family and seven that must still reach the problem path — the negatives matter more than the
positives here, because the failure mode of a fix like this is swallowing real work.

---

### 5.49 D263/D264 — the seam was listened to, and the founder's answer is YES (2026-09-11)

Charles, having run the build: *"The seam sounds good… I like the audio… will get the team to
review on sunday."*

**No new ID.** This is the experiment D263 was wired to run, reporting its result. §5.46f said the
question could not be settled by argument and that the toggle *was* the experiment; it has now been
run by the one person whose ear the product is currently tuned to.

| What was open | Now |
|---|---|
| Does the Hazel → tuned-Amy handover sound wrong? (§5.46f) | **No.** Founder, after listening in the real app. |
| Do the D264 tuning settings survive listening? (§5.47) | **Yes** — the same session's audio. |
| Which of the greeting brief's §5 options is the build on? | **C**, and it is no longer "the default by inaction" — it is a choice that has been heard. |

**5.49a — what is still genuinely open, and it is a confirmation rather than a question.** The team
review is **Sunday 2026-09-13**. Charles's own expectation is recorded and has not changed: *"I
think the Fall back will be TTS everywhere"* — so the outcome to plan for is still **option B**, and
both off switches stay (§5.47f). **Nothing is blocked on that review**; the build is shippable in
its current configuration either way, and reverting is two values and a file deletion.

**5.49b — one way that review could reach a WRONG verdict, and the guard added for it.** The three
greeting MP3s are **committed**; the 63 MB Piper voice model is **gitignored and fetched**. A
reviewer who clones and runs without `npm.cmd run fetch-voice` therefore hears **Hazel say hello
and then nothing at all**, because `say()` degrades to text with the mouth still moving. That is not
the seam — it is one voice followed by silence — and a verdict formed from it would be a verdict on
something nobody is proposing.

`scripts/preflight.ps1` already FAILED on the missing model. It now also reports **which voice
configuration is live** (both switches, with their values) and, for that one combination
specifically, says what it means:

> `FAIL  the seam is reviewable   the recorded greeting will play and EVERY OTHER LINE WILL BE
> SILENT - fetch the voice model before judging the voices`

and on a healthy machine prints what the listener is about to hear, so nobody has to infer the
configuration from three PASS lines. **Both branches were exercised** — with the model present, and
with `MATIC_VOICE_MODEL` pointed at a path that does not exist.

---

### 5.50 D266 — the authenticator secret is recoverable, and pretending otherwise caused the lockout (2026-09-12)

Charles, locked out of `/admin` on his own machine for thirty minutes: six `login.failed / password`
rows across two accounts, a `reset`, then one `login.failed / totp` **where the password was right**.

**The root cause was a false sentence in our own documentation, not a missing feature.**
`bin/admin.mjs`'s header said of the password and the authenticator secret that *"neither is stored
in the clear and neither can be shown again"*, and `84b8f3f`'s commit message argued the point
explicitly: *"the secret is stored hashed — so the only copy is the one printed once… a launcher
that could recover it from the database would mean the database held it in the clear."* The database
**does** hold it in the clear — `control.admin_users.totp_secret` is `bytea`, held as-is, and must
be, because TOTP is a shared secret and a server that cannot read it cannot verify a code. Believing
the recoverable thing was unrecoverable is what turned a forgotten password into a lockout.

| ID | Decision | Status | Links |
|---|---|---|---|
| **D266** | **`admin.mjs totp --user <email>` prints the live code from the stored secret** (`--secret` also prints base32 + the otpauth URI, for re-enrolling a launcher). Audited as `admin.totp_read`, recording whether the secret was shown. **`reset` gains `--keep-totp` / `--keep-password`**, mutually exclusive; `totp_last_step` is cleared only when the secret is actually replaced. | **DONE 2026-09-12.** 254 assertions in `admin-db.test.mjs`, up from 247. | **D156** (TOTP mandatory — unchanged), D155, D222. Amends nothing; **corrects** `bin/admin.mjs`'s header and `84b8f3f`. |

**5.50a — this grants nobody anything.** The same CLI, two subcommands up, can already `reset` the
credential outright or `disable` the account. A tool that prints a code is strictly weaker than one
that replaces it, and both rest on the same credential: access to the machine. The security model is
already *"if you are on this machine, you are trusted"*, stated on the hub's own index page.

**5.50b — three of the handover's four premises did not survive the code, and the fourth was
already there.** Recorded because the design document is otherwise persuasive and will be re-read:

- **`admin.mjs audit` was said to be missing.** It has existed since `df1b92f`, the original B2
  scaffold, is in the usage text, and printing the disputed rows — `why` included — took one
  command. The design document says it *"was answered by writing a throwaway script twice in ten
  minutes"*; the tool was there both times.
- **`reset` was said not to print a "no longer works" warning.** It has printed one since `4b5cb5a`
  on 2026-09-09, three days before the lockout, so it **was** on screen at 04:23:17 and did not
  help. The fix is therefore NOT a better sentence — it is `--keep-totp`, which removes the need to
  re-enrol at all. A warning that was read and still not acted on is evidence against warnings.
- **The timeline's `04:24:36 login.failed locked` row does not exist.** The table runs 04:24:06
  (`totp`) → 04:25:09 → 04:25:45, with no `locked` row anywhere. Nothing was ever locked out.
- **Lockout was said to have an unstated, possibly configured duration.** It is `LOCK_AFTER = 5,
  LOCK_MS = 60_000` in `router.js`: in-process, per email, one minute, cleared by a restart. So
  **`admin.mjs unlock` as proposed cannot be built** — the CLI is a different process and cannot
  reach a `Map` in the hub's memory. The sign-in page now states the duration instead.

**5.50c — the dev-mode TOTP bypass (`MATIC_ADMIN_INSECURE_NO_TOTP`) is NOT built, and the reason is
structural.** Its load-bearing protection was guard 2, *"refused outright unless the listener is
loopback-bound"*, described as *"the only thing standing between it and a real problem"*.
`src/index.js` calls `server.listen(port, "127.0.0.1", …)` — **a hard-coded literal with no
environment override** — so the guard can never fail and never fire. It would be a safety check that
reads as one and checks nothing, and the day someone adds a `MATIC_HUB_HOST` variable there is
nothing tying the two together. Separately, the friction that motivated the bypass is gone: the code
is now one audited command away. **Founder decision, deliberately left open** — §4f of the design
document says as much, and this section is the fact it was missing.

---

### 5.51 D267 — a development mode that skips the authenticator code, and the guard that was theatre until it was rewritten (2026-09-12)

Charles, the same day as D266: *"Yes. Make a toggle to turn off before we go to production but I
will be going in and out for awhile until we get this right. I dont have time to get a secret every
time..."* Raised against, reaffirmed, built.

| ID | Decision | Status | Links |
|---|---|---|---|
| **D267** | **`MATIC_ADMIN_INSECURE_NO_TOTP=1` makes the admin console accept a password with no authenticator code**, on a loopback-bound listener only. **It never skips the password.** Six guards, none optional. Audited as its own `event_class`, `insecure-dev-bypass` (migration `control/006`). | **DONE 2026-09-12.** 424 headless + 281 `admin-db` server assertions. | **D156** (TOTP mandatory) — NOT amended: no account can exist without a secret, and in every other configuration the code is still required. D155 (`event_class`), D157 (the step-up clock), D222, **D266**. |

**5.51a — what it skips, and the one thing it cannot.** The bypass is consulted at exactly one point
in `attemptLogin()`, and that point is **below** `if (!passwordOk)`, which returns. There is no
arrangement of that function in which the bypass stands in for a password. This is pinned two ways:
three behavioural assertions (wrong password; empty password; wrong password *with* a valid code —
all still 401 with the mode on) and a **structural** check comparing the two source offsets, because
moving the branch up to "simplify" it is the edit that turns a single-factor dev mode into an open
door, and it would pass every behavioural test written against the happy path. **A mutation probe
was run: the dangerous edit fails two structural assertions and three behavioural ones.**

**5.51b — guard 2 was theatre as specified, and is not any more.** The handover called *"refused
outright unless the listener is loopback-bound"* the only thing standing between this and a real
problem. As written it could never fire: `src/index.js` calls `server.listen(port, "127.0.0.1")`
with a literal and no override, so nothing can bind elsewhere. **The guard now reads
`httpServer.address()` — the address the socket actually has — at sign-in time**, rather than
asserting what the bind is. It is correct by construction instead of by assumption, and it starts
protecting the day someone adds a host option, without that person needing to know this file exists.
**An unreadable address is REFUSED, not assumed loopback.** *`MATIC_HUB_HOST` was considered and
rejected*: adding a way to bind off loopback in order to make a guard demonstrable would create the
exposure the guard exists to catch, and would trigger D222's rule that the session cookie's `Secure`
flag becomes unconditional the same day. **The honest limit: in the shipped configuration guard 2
still cannot fire. The other five guards are what is load-bearing today.**

**5.51c — the other five.** (1) Off unless the value is exactly `1`; the variable's name
incriminates itself, and **only `src/admin/dev-bypass.js` reads it**, so there is one verdict rather
than several. (3) A startup banner. (4) `GET /` and `GET /v1/health` both carry `adminAuth`, from
ONE function, so the two cannot disagree. (5) A banner on **every** console page — rendered outside
`page()`'s `bare` ternary, or the sign-in page, which is the one page a locked-out reader sees,
would be the only page without it. (6) The audit row. Plus preflight: `start-hub.ps1` step 7a
reports it and never fails on it, because a preflight that refused to start a development hub for
being in development mode would simply be switched off.

**5.51d — three things found by running it rather than reading it.**

- **The form, not only the copy.** The code input carries `required` and `pattern="[0-9]{6}"`, so
  with the bypass on and the field left empty **the browser refuses to submit and the server never
  sees the request** — the mode would have saved nobody anything. The input is optional when the
  bypass is live, and the test asserts the attribute is ABSENT rather than that the copy is present.
- **The startup banner overflowed its box by seven characters** on its first real run — a fourth
  instance of the padding defect `banner()` and its width test exist to prevent. It was invisible to
  that test because this banner is drawn only when the variable is set, and no test run sets it. The
  lines now live in `dev-bypass.js` so `turn.test.mjs` can measure them without setting anything.
- **Under the bypass, a code refused as a REPLAY still signs in** — through the bypass, and audited
  as one. Correct (the mode means no code is required, so a bad one is no worse than none) and
  surprising enough to pin rather than tidy away: the same request without the mode is a 401.

**5.51e — what it must not quietly undo.** `recordLogin(id, null)` **leaves `totp_last_step`
alone**: writing null would clear the replay defence, so a sign-in that skipped the second factor
would also re-arm a code an attacker had already seen. The bypass may skip a check; it may not undo
one. And the session records `totp_verified_at = null`, so D157's step-up clock keeps telling the
truth — nothing reads it yet, and the day something does, a bypassed session must not be able to
perform a step-up action.

**5.51f — turning it off.** `Remove-Item Env:MATIC_ADMIN_INSECURE_NO_TOTP` for one shell, or
`[Environment]::SetEnvironmentVariable("MATIC_ADMIN_INSECURE_NO_TOTP",$null,"User")` for the
machine, then restart the hub. With it unset every existing test passes unchanged — acceptance item
8, asserted explicitly by the `UNSET:` assertions in `admin-db` KB-7c.

---

### 5.52 D268 — account recovery is a product gate, not a CLI; the founder's hour-long lockout on the dev console (2026-09-12)

**What happened, in order.** The founder could not sign in to the admin console at
`http://127.0.0.1:8787/admin/login` as `owner@devco.test`. The page said *"Sign in failed. Check
the email, password and authenticator code"* — the same sentence for every wrong factor, by design
(D156). The audit (`admin.mjs audit devco`) showed **every failure was the password**, including two
earlier in the day; the authenticator was never reached. Meanwhile the D267 development mode, built
the previous day so that exactly this loop would be shorter, was **off**: it is per hub start, and
`npm start` never sets it. The founder's reaction — *"my login does NOT seem easier... what changed"*
— was correct. Getting in then took: a script that did not exist (`start:dev`), a restart of a hub
running in another window, a password reset run **twice** (each run sets a different password;
only the second is live), from a folder without a `package.json` on the first try, and finally
clearing a browser that was **refilling the old saved password** into the field. **About an hour**,
on a loopback box, with the person who wrote the system helping.

**The finding.** Every step of that recovery is operator-only: a terminal, the repo, the CLI, the
audit table, and knowledge of which of two reset runs counts. **A customer has none of them.** Had
this been a tenant owner at a customer, the honest answer would have been "we cannot get you back
in" — the console's own sidebar says *"the CLI is the way back in"*, and the CLI is ours. That is a
product defect with a security decision (D156) wrapped around it, and it does not ship.

| ID | Decision | Status | Source and forcing reason |
|---|---|---|---|
| **D268** | **A customer-operable account-recovery path is a pre-production gate.** Minimum: (1) a **break-glass owner recovery** that a tenant can complete without our CLI — a recovery code set issued at enrolment and shown once, or an emailed single-use reset link once outbound email exists (D86), either of which re-establishes the password and, separately, the authenticator; (2) the sign-in page **may say which factor failed once the account is confirmed to exist for that session's own email** — the deliberate vagueness of D156 protects against enumeration by an outsider, not against telling the account holder that their password was wrong; that trade needs its own row before it is changed, so it is recorded here as the question, not the answer; (3) **a reset invalidates every earlier reset**, visibly: the console and the CLI both say *"the password from any previous reset no longer works"*, because the double-run is what a rushed person does; (4) dev mode is **one command** — `npm run start:dev` (`server/bin/dev.mjs`, built today, `29c4215`) — and the console's banner already makes it unmistakable when it is on; (5) **the recovery path is exercised in the click-through** (§10.3b) from a browser with a stale saved password, because that is how the failure presented, not from a clean profile. | **Proposed for (1)–(3), DONE for (4) 2026-09-12.** Gate recorded as **OPEN-11**. | Founder, 2026-09-12: *"This situation can never happen to a customer... If this happened to a customer we would have been unable to get them back in."* D156 (TOTP mandatory), D266 (secret recoverable — by us), D267 (dev mode — for us), D86 (outbound email, the prerequisite for a reset link), D155/D159 (local accounts, no SSO yet — SSO is the other way out of this, and is not in phase one). |

**5.52a — why the vague error is the right default and still not enough.** *"Check the email,
password and authenticator code"* stops an outsider from learning which emails have accounts. It
also stops the account holder from learning that the *only* thing wrong is the password, which
turned an hour of authenticator-chasing into the real cost today. The two goals are separable: the
enumeration defence only needs vagueness **before** the email is known to exist; after a correct
email and a wrong password, telling *that browser* "password" gives an attacker who already has a
valid email nothing they could not get from the lockout timing anyway. This is a change to D156's
posture and is **not made here**; it is the question D268(2) asks.

**5.52b — the honest limit of what was built today.** `start:dev` removes one of the four steps and
none of the other three. The reset is still ours, the double-reset trap is still silent, and the
browser-autofill trap is still invisible from the server side. Until OPEN-11 closes, **every tenant
owner lockout is a support call that only we can answer**, and the pilot agreement should say so.

### 5.53 D269–D270 — the ticket store's schema stops lying, and the job queue gets a runtime (2026-09-12)

**Where this came from.** A four-document planning pass on the ticket lifecycle (comments, resolution
notes, requester notification — filed under `docs/handovers/2026-09-12-*`, the one to read being
`2026-09-12-ticket-lifecycle-plan-v3.md`) ended in an adversarial review, and the review's two
cheapest findings were about code that already existed rather than code to write. Its handover
(`2026-09-12-claude-code-handover-ticket-lifecycle-p0.md`) scoped this pass to those two — **P0 and
P0.5** — and nothing else. Both were verified against the working tree before anything was built:

- **`tickets.close_note` had no writer and no reader, and two comments said otherwise.**
  tenant/004 (2026-09-10) added the column and wrote: *"The console's state form offers it as an
  optional field when moving to resolved or closed; nothing reads it yet except the ticket's own
  detail page and the CLI."* The form had no field, `statePost()` never passed a note, the detail
  page never rendered it, `bin/tickets.mjs show` never printed it. `setTicketState()`'s docblock in
  `query.js` said the same thing. All three clauses false, in the two places a future writer reads
  first — the defect this project has shipped three times before (D213's surfaces, D253's card,
  `700d920`), this time in a migration comment.
- **`control.job_queue` had primitives and no runtime.** `enqueue/claim/finish/fail/runOne` since
  B1; `runOne()` had one caller and it was `test/db.test.mjs`. No worker, no scheduler, no reaper
  for rows a dead process leaves `running`, and no `cancelled` in the status CHECK. Plan v2 had
  said auto-close "needs no new infrastructure"; the review found that false.

| ID | Decision | Status | Source and forcing reason |
|---|---|---|---|
| **D269** | **`close_note` is renamed `internal_resolution_note`, wired end to end, and every column of the ticket store has code that names it or an entry on a reserved list the test suite reads.** The console's state form gains one optional textarea labelled internal in words; `statePost()` and `bin/tickets.mjs state --note` write it through the one `setTicketState()`; the detail page and `show` read it, both saying the requester never sees it; the audit records `noted: true|false` and never the text. The rename is `migrations/tenant/005`, guarded by two `pg_attribute` questions because `RENAME COLUMN` has no `IF EXISTS`. **Two tests, both structural:** `admin-static` §5c walks every field `getTicket()` returns and fails on one with no reader; `admin-db` §5c reads `information_schema` for `tickets` and `users` and fails on a column no store code names — unless it is on `RESERVED_COLUMNS` with a reason and a decision number, and **a reserved entry that gains code fails too**, so the list can only be edited, never outgrown. | **RATIFIED 2026-09-12** (founder: *"do the recommended"*, §5.53g) — built the same day (`36edecf` red, `9f14a82`, `a9011c8`). **Condition:** before any requester-facing route exists, the wire-level denylist test (the plan's "D259") is written FIRST, seen failing against `SELECT t.*`, and given a register ID. **DISCHARGED 2026-09-12 by D281 (§5.56): written first (`756ad74`, red), seen failing, given its ID — before any requester route exists and before D271 is answered.** | Plan v3 §6.1, the handover §1 (numbered "D253" there; void, §5.53a). **Forcing reason: the two false comments quoted above.** Why the rename: ServiceNow's *requester-facing* resolution text is the field called `close_notes`; ours is the *internal* account; the industry's name with the opposite visibility is a trap for D85's mapping and any adapter, and P2 adds a requester-visible `resolution_notes` beside it. Free while nothing reads it. |
| **D270** | **`control.job_queue` has a runtime.** `src/jobs/runner.js` is an in-process poller `src/index.js` starts inside its listen callback, never awaited (a database outage is logged once and polled through; the hub starts with PostgreSQL down — run and shown). `src/db/jobs.js` gains `cancelJobsFor(type, refId)` (queued rows only; `control/007` adds `cancelled` to the CHECK), `reapStuck()` (rows `running` past a timeout go back to `queued` with the attempt count kept, or to `failed` at the cap), `waitingOfOtherTypes()`, and `claim(workerId, { types })`. **The contract is written where a handler author reads it: AT-LEAST-ONCE, never exactly-once; idempotency is the handler's job**, and `ticket.autoclose` (P5) must be bound to the resolution that enqueued it, not to the ticket. **A process claims only the types it has handlers for** and logs how many due jobs of other types it is leaving, whenever the figure changes (§5.53c). The registry (`src/jobs/handlers.js`) is empty and frozen: the runtime exists before its first job type does. `MATIC_JOBS_POLL_MS` — default 5000, floor 250, 0 disables. | **RATIFIED 2026-09-12** (founder: *"do the recommended"*, §5.53g) — built the same day (`2c8b47e`). **Three conditions, part of the decision:** (1) in-process is FOR NOW — promote to a separate worker process when D271 puts the hub on a different machine from the endpoint, or when a second hub process ever runs; (2) the first handler proves the contract — before `ticket.autoclose` ships (P5), its test runs the same job twice and shows the second run does nothing; (3) an unknown job type is LEFT QUEUED AND REPORTED, never failed — the reversal in §5.53c is the policy, confirmed. | Plan v3 §7.6 and P0.5 (the runtime half of its "D248"; void, §5.53a). **Forcing reason: nothing called `runOne()`**, and everything the plan does with auto-close depends on a worker that did not exist. In-process over `bin/worker.mjs` because today's deployment is one process on one machine and a second process is a second thing to forget to start; the primitives are injected so promotion is a move, not a rewrite. |

**5.53a — every D-number in the plan is void.** Plan v3 and its handover state "the register covers
D1–D243" and number their proposals D244–D259. This file had reached D268 before they were written
(§5.29–§5.52). **None of their IDs is theirs**; the filed copies carry a banner saying so, and the
same rule as the 2026-09-03 documents (§0) applies: do not cite them. Mapping for the two that were
built: plan "D253" → **D269**; the runtime half of plan "D248" → **D270**. The rest — plan "D244"
(the two-visibility timeline), "D245"–"D247", "D249"–"D252", "D254"–"D259" — are **not assigned** and
take register IDs when and if they are built. The plan's substance is unaffected; only its numbers
are wrong, and they are wrong for the same reason as every earlier instance: a chat session that
cannot see this file assumes the last number it heard.

**5.53b — the handover's "rewrite 004's comment" could not be followed, and why that is right.**
`src/db/migrate.js` stores a checksum of each applied migration's WHOLE text, comments included, and
refuses to run against any tenant whose ledger holds a different one (*"an applied migration must not
be edited — write a new one"*). Rewriting 004's paragraph would have stopped `t_devco` and every other
existing tenant from migrating — a worse outcome than a stale paragraph with a retraction one file
along. So 004 is byte-for-byte what it was, **`db-static` pins its checksum (`6c888d52395e288a`)** so
"do not edit 004" is a failing test rather than advice, and **005's header quotes the false sentence,
states that all three clauses were false, and describes the world as it now is.** The handover's other
lying comment, `setTicketState()`'s docblock, IS rewritten, and records that until 2026-09-12 it
claimed readers that did not exist.

**5.53c — an unknown job type is LEFT QUEUED AND REPORTED, not failed. A reversal, made mid-build.**
The runner was first built to fail a job whose type it had no handler for ("visible in `last_error`
rather than silently waiting forever"). Then the consequence was noticed: **the dev hub Charles runs
polls the same database the test suite runs against**, and with that behaviour it would have failed
every `b1-*` job `db.test.mjs` enqueues within one poll interval of the enqueue — the suite would go
red whenever a hub was up, and a rolling restart in any real deployment would let an old hub destroy a
new hub's work. So `claim()` takes the registry's type list, a hub with an empty registry claims
nothing, and the cost of the reversal — an unknown type could now wait silently — is paid in the
log: each tick counts due jobs of other types and the runner prints the figure whenever it changes
(*"2 due job(s) of 1 type(s) this process has no handler for are waiting on the queue: ticket.autoclose
(2). They run when a hub that knows them polls; nothing here fails them"*). Both behaviours are
tested with fakes (`test/jobs.test.mjs`) and live (`db.test.mjs` §6b).

**5.53d — the reserved list is the feature, and what it found.** The handover's seed list named
`session_id` (D75) for `tickets`; checked, both store files name it, so it is **not** reserved. On
`users`, `logon_sid` (D148), `external_id` and `upn` (D55/D145) are reserved with those reasons.
`display_name` turned out to be WRITTEN — `file.js`'s upsert fills it — so it needed no entry. The
check is textual and per file rather than per table: `users.status` and `users.created_at` pass
because other objects in those two files carry the same names, and the test says so in a comment
rather than pretending it saw them. **Nothing was reserved on `tickets`** — every column has a
writer, and now every returned field has a reader.

**5.53e — two things found beside the task.** `npm test` had been **red since `29c4215`**
(`start:dev`, §5.52): D267's guard-1 assertion that only `dev-bypass.js` names the bypass variable
caught `bin/dev.mjs`, which SETS it for the child hub. Exempted by path with a new assertion that it
sets and never reads (`2260e24`); the baseline before this pass was 125/126 in that file. And
`bin/tickets.mjs show` still prints neither `updatedAt` nor `sessionId` — both are on the detail
page, so the reader test passes on "at least one reader", and the gap is noted here rather than
widened into this pass.

**5.53f — what is NOT built, and what the dev hub now does.** P1 (the timeline, work notes only),
P2 (resolution code, the requester-visible note, `closed` terminal, the TOCTOU fix into the `UPDATE`),
everything gated on **D257-in-the-plan** (deployment topology — which now needs a register ID of its
own when Charles decides it), and `ticket.autoclose` itself. **A hub started today polls
`control.job_queue` every five seconds** — two cheap queries a tick (the reaper's `UPDATE … WHERE
status = 'running'`, which matches nothing, and the waiting count) — and claims nothing, because the
registry is empty. That is the first background query this hub has ever made; `MATIC_JOBS_POLL_MS=0`
turns it off. **The runner is in-process and unmeasured:** the ten-minute stuck timeout, the
five-attempt cap and the twenty-jobs-a-tick drain are development figures, and nothing has been run
under load or against RDS.

**5.53g — ratified the same day, with the conditions in the rows; and the gate gets its number.**
Asked for recommendations on both, the founder answered *"do the recommended."* D269 ratifies as
built; its one condition is the denylist-test-first rule for P2/P3. D270 ratifies with three
conditions written into its row: in-process is *for now*; the first handler must prove at-least-once
by running twice; and unknown types stay queued and reported — the mid-build reversal of §5.53c is
now the policy rather than a choice awaiting review. **What D270 costs today, so it is not forgotten:**
one hub runs two cheap queries every five seconds and claims nothing. If several hubs ever poll one
queue, the `SKIP LOCKED` claim already handles the race, but the reaper and the waiting count run on
every one of them — fine at this scale, and the line to revisit when D271 is answered. The D260
suggestion (forbid domain words in `persona.test.mjs`) was conditional on a new greeting set and was
not done.

The one decision neither ratification covers is the plan's deployment-topology gate, which had no
register ID. It gets one here so P3 has something to wait on:

| ID | Decision | Status | Source and forcing reason |
|---|---|---|---|
| **D271** | **GATE — where the hub runs relative to the endpoint is decided and written down before P3 (the endpoint's identity, plan v3's "D254") starts.** Three answers, each with a different P3: **same machine** (the demo box — requester read-back needs no network identity, P3's credential is theatre, P4's polling is local IPC wearing HTTP; the plan's own kill criterion says stop and re-scope); **the customer's LAN** (the hub must accept non-loopback peers over TLS, both currently out of scope, and D222's cookie `Secure` flag becomes unconditional the same day; an enrollment secret then travels and needs a delivery path with no installer); **hosted** (all of the LAN answer plus residency, D141/D93, and OPEN-9's certificate on the path). Also decides whether D270's runner stays in-process. | **DECIDED 2026-09-12 (founder):** *"Current the hub and endpoint is on machine for development and testing. In production the hub will send on same LAN/WAN as the Agent."* — the LAN row. P3b built on it the same evening (D282–D285, §5.57); two further founder answers the same hour: the secret reaches an endpoint as plaintext in `config.json` (D285), and the console opens to the LAN too (D283). **Consequence for D270:** its condition 1 (promote the in-process runner when D271 puts the hub on a different machine) is now live and is owed before a LAN deployment (§5.57d). | Plan v3 §6.2 and §8.2 (its "D257"; void, §5.53a). Forcing reason: the hub binds `127.0.0.1` and refuses non-loopback peers, so until this is answered P3's credential cannot be sized or justified and P4's polling cannot be designed. Blocks P3b (the credential and the transport), P4, P5. P1, P2 and P3a (D281, the requester-safe read shape, §5.56) did not wait on it. |

**513 headless assertions across 6 files (`test/jobs.test.mjs` is new, discovered by `run-all`),
432 db across 3.** Handback: `docs/handovers/2026-09-12-claude-code-handover-ticket-lifecycle-p0-built.md`.

### 5.54 D272–D277 — the console stops implying a fleet, and the ticket timeline exists, work notes only (2026-09-12)

**Where this came from.** Two handovers of the same day, executed in one pass:
`docs/handovers/2026-09-12-ticket-lifecycle-plan-v3-addendum-console-honesty.md` (P0.75, D272–D274)
and `docs/handovers/2026-09-12-claude-code-handover-console-honesty-and-p1.md` (P0.75 plus P1, the
plan's timeline slice). **The forcing reason for the first is that someone used the software** — the
fourth entry in this register with that origin (D213's surfaces, D253's card, D265's *"Its all good
thanks"*, and now this): Charles put the Agents page beside the running panel, read *"0 active
devices"* against *"Everything I need is available"*, and concluded the product was broken. Nothing
was. The panel is a reachability lamp (HubLink, D233); the console counts rows in `control.devices`;
and **no file under `client/src` calls `POST /v1/enroll`**, so that counter reads 0 on every install
until P3 gives the client enrollment — which is gated on D271 and may not happen in its current form.
The page had never said so. Every fact in both handovers was re-verified against the working tree
before anything was built: the enrollment search (no match), `last_seen_at`'s three writers (all in
`enrollment.js`), `agents.js` read in full, and the register's own header for the next free ID.

**The P1 handover cited "D244/D256" for the timeline and the age indicator. Both are void** (§5.53a:
D244 is the panel's enum gloss, D256 the restart signal). They take **D275** and **D276** here, and
the retention decision the migration had to make takes **D277**.

| ID | Decision | Status | Source and forcing reason |
|---|---|---|---|
| **D272** | **The Agents page states, above the fold, that no shipped endpoint enrolls itself.** A `limit()` note between the stat rail and the first panel — the position the Tickets page uses for "NOBODY HAS BEEN EMAILED" — carrying three facts in order: nothing in `client/` calls `POST /v1/enroll`; so the page lists only devices enrolled by hand (`bin/devices.mjs enroll`, curl, the test suite); so **a running endpoint does not appear here and these counts are not a fleet.** The lede says "by hand". The existing `notYet()` block stays where it was: it answers whether a LISTED device is authenticated, a different question. | **PROPOSED 2026-09-12** — built (`b672a05`). **Revisited the same evening (`41954ad`, D285):** the client enrolls (D282), so the caveat now says endpoints enroll THEMSELVES at startup and the counts are enrollments per OS user, not machines or people. | The addendum §0–§1. Forcing reason above. The fix is a sentence, not a deletion: the enrollment mechanism is real and tested (B3, D231) and this page is what proves it when a prospect asks. |
| **D273** | **"Last seen" is renamed to what it measures, and revocation says what it does not do.** The devices column is headed *Last enrollment activity*, with a muted line under the table: *not a heartbeat; nothing updates this when a device talks to the hub, because nothing identifies a device on a call (D61).* Beside the Revoke control, and on a read-only role's page too because the REVOKED pill is there: *revoking removes the row's standing; it does not block anything — no route checks device identity, so a revoked endpoint can still ask and file.* **Both sentences are conditions on this build and REVERT WHEN P3 LANDS** — the docblock over `devicesTable()` says so in those words, because a credential presented on every request gives `last_seen_at` its one-line writer and makes revocation a control, and both notes then become false. | **PROPOSED 2026-09-12** — built (`518621a`). **REVERTED the same evening (`41954ad`) — its condition met by D282:** `last_seen_at` is written on every authenticated request and a revoked credential is refused on its next request, so "Last seen" is a heartbeat again (with a Credential column) and Revoke says it blocks the next authenticated request. Writer, enforcement, copy — in that order. | The addendum §1 rows 2–3. `control.devices.last_seen_at` is written in exactly three places, all in `src/devices/enrollment.js`, all on enroll / approve / re-submit; the value shown for the B3 test row equals its enrolled value because that is the only thing that ever wrote it. An operator reads "3 days ago" as a heartbeat and REVOKED as "access withdrawn"; both readings are wrong and the words invited them. |
| **D274** | **A structural test pins the caveat to the CLIENT's behaviour.** `test/admin-static.test.mjs` §6a searches `client/src` (comments stripped) for a call to the enrollment route. **While none exists**, it RENDERS the page through the pure `agentsBody()` with fake rows and asserts on the HTML: D272's three facts above the first panel, `notYet()` still below, D273's heading with "Last seen" gone, both notes, the read-only branch, and TEMPORARY BY DESIGN in the source. **When one exists**, the block fails with one message naming the files and saying the copy is now false and must be revisited, including giving `last_seen_at` its writer (addendum G2). The detector is checked for vacuity first — pointed at `server/src` it must find `index.js`, which dispatches on the literal. `admin-db` drives the real page over HTTP in two places. | **PROPOSED 2026-09-12** — built (`c5769ca`). **Proven both ways** (§5.54b), **then fired for real (`e207a3c`, §5.57b) and INVERTED (`41954ad`)**: it now fails the day `client/src` stops calling the route. | The addendum §2 G4: P0 pinned schema claims with a test and nothing pinned page claims. Same shape as D269's reserved list — the claim is enforced and can only change by being edited deliberately, and the inversion is the value: the test fires on the day the premise changes rather than guarding stale copy. |
| **D275** | **A ticket carries a timeline with two visibilities — `internal` (work notes; the requester can never see or be sent one) and `public` (comments, state changes, resolutions; requester-visible once something can deliver them) — and visibility is a property of the KIND, decided in one write path, never by a caller.** `migrations/tenant/006-ticket-timeline.sql`: `ticket_entries` with `kind`, `visibility`, `body`, the author as a control-plane id with **no foreign key** (D143) plus the email as a snapshot, and P4's two hub-stamped columns reserved. **Two CHECKs are the database's copy of the rule**: a work note can never be public; a requester can never write an internal row. In `src/tickets/query.js`: `KIND_VISIBILITY` (frozen), **`WRITABLE_KINDS = work_note, state_change` — `addEntry()` refuses a `comment` until P4 can deliver one**, `listEntries(schema, ref, { visibility })` **with NO default** accepting only `"public"` or `"all"`, and `setTicketState()` writing a public `state_change` entry inside the move's own transaction, attributed to the console user's email or to `bin/tickets.mjs`. The console's detail page draws the timeline newest last, **every entry labelled in words** (*internal — the requester never sees this* / *public — reaches nobody in this build*), with **ONE composer, "Add work note"**, audited as `ticket.worknote` with the entry id and never the text; `bin/tickets.mjs show` prints the same rows through the same function, each line `[INTERNAL]` or `[public]`. **No reply-to-requester composer, on purpose, and the page says why.** | **PROPOSED 2026-09-12** — built (`0d45b62`). | Plan v3 §7.1–§7.4 and its §0 finding 8 (numbered "D244" there; void). Forcing reason: a requester-visible composer that ships three phases before anything can deliver the message is this project's signature defect built deliberately for three to four weeks of calendar; the timeline is needed now (the desk has nowhere to write what it did) and the composer is not. The no-default rule exists because a default is how internal text reaches a user's screen eighteen months from now, and it is proven live: `listEntries(public)` cannot return the work note, `listEntries()` throws. |
| **D276** | **The console shows the AGE of the oldest unanswered requester comment on every ticket screen — never a count.** `tickets.awaiting_agent_since` (tenant/006) is the clock; `oldestUnansweredRequesterComment()` reads it; both ticket screens draw the result beside "NOBODY HAS BEEN EMAILED". **In this build it reads "none" and says why in words** — no requester can comment; the panel has no ticket view and the hub has no comment route (P4, after D271) — rather than drawing an empty cell. When P4 writes the clock the sentence changes on its own to *"41 h ago, on MD-1003"*. The column has a reader and no writer, which D269's test permits and the docblock states. | **PROPOSED 2026-09-12** — built (`0d45b62`). | Plan v3 §6.3 (numbered "D256" there; void). *"3" is ignorable; "oldest unanswered: 41h" is not.* Built ahead of the thing it measures so the screen is ready on the day the first requester comment lands, and so the copy that says it is empty is written now, by someone who knows why. |
| **D277** | **Ticket free text is retained for the life of the ticket record, and the record's retention is ONE future decision (OPEN-12), not a per-column sweep.** tenant/006's header considers mirroring D229 — clear `body` at 90 days, keep the row — and refuses it: D229's text is INCIDENTAL (a logged question with no user attached, whose value decays in weeks); a work note is THE RECORD, on a ticket whose `description` (the reporter's own words, the same PII class) and `internal_resolution_note` have no sweep at all. Sweeping entry bodies while both stand would delete the half the desk wrote and keep the half the reporter wrote. `body` is `NOT NULL`, so D229's operation is not even available. Entries live and die with their ticket (FK); nothing is swept; the paragraph says so. | **PROPOSED 2026-09-12** — decided in the migration header (`0d45b62`). | Plan v3 §7.1 (*"decide the retention rule in this migration, not after the table fills"*) and the P1 handover §2.1. Forcing reason: a deferral that goes unmentioned is how a table fills with PII under no policy; a wrong policy copied from a different kind of data is worse. |

**5.54a — the caveat, the counter and the lamp are three true things that read as one false one.**
The panel's *"Everything I need is available"* means *I can reach the hub and its routes answer*
(`hub-link.js`'s own header: *"an IDENTIFIED reachability check, not an authenticated one"*). The
console's *"0 active devices"* means *zero rows in `control.devices` with status active*. Both were
correct and the words collided, because the page's title, lede and counters all read like a fleet view
and the product has no concept of a connected endpoint by design (D114: *"the hub holds NO list of
attached agents to signal"*). D272 does not change the mechanism, hide the page or touch the counters;
it adds the sentence that names what the counter counts. The addendum's §2 names the thread: G1–G4,
plan v3 §5.5 (the app quits on close) and D271 are one absence — **the product does not know which
endpoints exist and are alive** — and D271 is the decision that starts to give it one.

**5.54b — D274 proven in both directions, and the detector's own first draft was vacuous.** As the
tree stands, `admin-static` §6a passes: 173/0. With `CLIENT_SRC` pointed by hand at `server/src`, it
fails 139/1 with *"THE CLIENT NOW ENROLLS (admin/pages/agents.js, index.js) — D272/D273's copy is
FALSE and must be revisited…"*, then reverted. The first draft pointed the vacuity check at
`src/devices`, where the route appears only in a comment — and the check failed its own run, which is
what it is for. A string literal naming the route counts as a call, deliberately: a false positive is
loud and read by a person; a false negative is the silent kind. Two other things found by running
the tests rather than reading them: `html\`\`` escapes the apostrophe in *"row's"* to `&#39;`, so a
regex over rendered HTML must match the entity; and the CLI's timeline HEADING says `[public]` while
explaining the label, so a bare count of `[public]` read five for four entry lines.

**5.54c — the one commit the handover wanted split, and why it could not be.** The P1 handover asked
for the timeline (D275) and the age indicator (D276) as separate commits. tenant/006 adds
`awaiting_agent_since`, and **D269's no-orphan-columns test fails on a column no store code names** —
so the column and its one reader had to land together or the first commit would have been red on the
test that exists to catch exactly that. One commit, both slices, the reason in its message.

**5.54d — what the timeline decided beyond the handover.** State changes are PUBLIC entries: the
moment a requester can see a ticket (P4), the state moving is the fact they most need (§3 of the plan).
A move to the state the ticket is already in (the CLI's correction tool allows it) writes no entry —
nothing changed. The internal note is never copied into the entry; it stays D269's column. A work note
on a `closed` ticket is allowed until P2 makes `closed` terminal in the console. The CLI has **no**
work-note command: the one composer this build has is the console's, and the CLI attributes its state
changes to itself (`bin/tickets.mjs`) because no person is attached to a CLI call.

**5.54e — what is NOT built, and what P4 inherits.** No requester-visible composer, no `comment`
entry (refused by `WRITABLE_KINDS`), no `resolution` entry (P2), no writer for
`awaiting_agent_since`, `notified_at` or `read_by_requester_at` (all P4, reserved), no
`getTicketForRequester()` and no wire-level denylist test (P3, D269's condition still stands: written
first, seen failing). P2's items are untouched: the resolution code, the requester-visible note,
`closed` terminal, the transition guard into the `UPDATE`. **The dev database is migrated**
(`t_devco 006-ticket-timeline, applied 1`; again: `nothing to apply`), and `MD-1000` was moved
`new → open → new` from the CLI to see entries land, so its timeline carries two attributed state
changes. The addendum's other suggestion — cleaning up `demo-laptop-01`, the revoked B3 test row in
the demo tenant — was **not** done; it is Charles's call and the row is now correctly described.

**5.54f — OPEN-12.** The ticket record's retention — description, summary, notes, entries, the
reporter's profile row — is one decision for a customer's schedule and D127's disclosure wording. Added
to §7. Until it is made, nothing in the ticket store is swept, and tenant/006 says so.

**Headless 562 across 6 files (was 513); db 462 across 3 (was 432).** Handback:
`docs/handovers/2026-09-12-claude-code-handover-console-honesty-and-p1-built.md`.

### 5.55 D278–D280 — resolution means something: a code and notes the requester will read, `closed` terminal in the console, and the guard in the UPDATE (2026-09-12)

**Where this came from.** P2 of the ticket-lifecycle plan (`docs/handovers/2026-09-12-ticket-lifecycle-plan-v3.md`
§3, §6.1, §7.1–§7.4, §8 row P2; its "D246"/"D247" and §0 finding 7, all void per §5.53a), started on
Charles's *"Start P2"* the same evening P0.75 and P1 landed (§5.54). Unblocked by every open question:
nothing here is requester-facing, so D271 does not gate it and D269's denylist-test-first condition is
not yet triggered. **The forcing reasons are the plan's own research (§2.3: ServiceNow requires
`close_code` and `close_notes` to reach Resolved; §2.2: Zendesk's Closed cannot be reopened) and its
review's finding 7: the console checked `NEXT_STATES` against one read and wrote in a separate
transaction — a check-then-act that would let one operator's resolution land on a ticket another had
just reopened.**

| ID | Decision | Status | Source and forcing reason |
|---|---|---|---|
| **D278** | **`resolved` requires a resolution CODE and requester-visible resolution NOTES, and is refused without both — with a sentence naming what is missing, never a constraint violation.** `migrations/tenant/007-resolution.sql`: `resolution_code` (a CHECK over six: `fixed`, `workaround`, `no_fault_found`, `duplicate`, `withdrawn_by_user`, `referred_to_vendor`), `resolution_notes`, `resolved_at`, plus `closed_at` and `closed_by` (four values — `requester`, `auto`, `console_user`, `system`; the CLI is `system`, so a closed ticket never lies about its closer). **The database holds the rule too**: `tickets_resolved_has_resolution`, `NOT VALID` so a tenant with an older code-less resolved ticket still migrates. `resolveTicket()` in `src/tickets/query.js` is the ONE way to reach `resolved`; `setTicketState()` refuses the target, so the CLI's any-state correction cannot make a code-less resolved ticket either. Resolving writes a public `resolution` entry (the notes as body) beside the `state_change`, so the timeline keeps every resolution across a reopen while the columns hold the current one; a move to a live state clears the current one. **Two notes, never merged:** the INTERNAL note (D239/D269) is the desk's, optional, never shown; the RESOLUTION NOTES are written FOR the requester, required, PUBLIC — **and delivered to nobody in this build**, which the Resolve form, the detail page, the flash and the CLI each say in words (D253's rule: no surface describes an egress outcome it has not been told). The console's Resolve form glosses each code (D244); `bin/tickets.mjs resolve --code --resolution` calls the same function. | **PROPOSED 2026-09-12** — built (`01e5b12`). **The vocabulary is a first draft**: plan v3's open question 8 names `user_educated` / `no_action_required`, and its kill criterion (revise if the first ten real resolutions cannot fill it honestly) stands. | Plan v3 §2.3, §3, §6.1 (its "D246"). Forcing reason: a `resolved` with nothing behind it is a state name; the code is the only count the desk will ever have (D186), and the notes are the message the requester most needs (§3: *"the notification that matters most"*) — written now, before delivery exists, so what is already on the tickets is readable by the person it is about when P4 arrives. |
| **D279** | **`closed` is TERMINAL in the console; the CLI remains the correction tool. And the console offers `closed` ONLY from `resolved`.** `NEXT_STATES`: `new → open, resolved`; `open → resolved`; `resolved → closed, open`; `closed → nothing`. The closed page draws no form and says so, naming `bin/tickets.mjs state <ref> open`. Until P2 the console offered `new → closed` and `open → closed` directly, which would have produced exactly the code-less closed ticket that plan §3.1's argument cut `pending_user` over; a ticket to be withdrawn is now resolved as `withdrawn_by_user` or `duplicate`, then closed. A recurrence is a new ticket (its `reopened_from` link is P4's). | **PROPOSED 2026-09-12** — built. | Plan v3 §2.2, §3 (its "D247"). Forcing reason: Zendesk's Closed *"can't be reopened"* and ITIL's closure as a distinct activity — and the D278 consistency argument above, which the plan made about auto-close and which applies to the console's own buttons first. |
| **D280** | **The transition guard lives in the UPDATE.** `setTicketState()` and `resolveTicket()` take the state the caller SAW as `from` and write `… WHERE reference = $1 AND state = $from` (`FOR UPDATE` on the row, `t.state = $from` in the outer WHERE, so PostgreSQL's re-evaluation on the committed row decides). A write that matched nothing asks the row where it is now and returns `{ refused, state }`; the console renders a **409** naming it and audits `ticket.state.refused` with `why: "stale"`. `statePost()` and `resolvePost()` read NOTHING before writing — both forms carry the state the operator is looking at as a hidden `from`; the `NEXT_STATES` consult is on that and is a suggestion about which buttons to draw. The CLI passes no `from`: unconditional. **Proven by a race** (`admin-db` §5d): two concurrent moves from the same seen state — exactly one lands, exactly one is refused naming the state now, one `state_change` entry, the loser's internal note never written. | **PROPOSED 2026-09-12** — built. | Plan v3 §0 finding 7, §7.2, §8.3. Forcing reason: `statePost()` did `getTicket()`, checked `NEXT_STATES`, then called `setTicketState()` — two transactions, and the window between them is where a resolution overwrites a reopen. With D278 adding a resolution to the write, a stale move now clobbers more than a state. |

**5.55a — what the refusal looks like, on each surface.** The Resolve form posts without notes →
400: *"MD-1001 cannot be resolved without resolution notes the requester will read (D278). Nothing was
changed."* With neither → the two clauses joined with "and". The state form posts `next=resolved` →
400: *"Resolving takes more than a state."* `bin/tickets.mjs state MD-1000 resolved` → exit 1:
*"cannot be moved to resolved by a state change … Use the console's Resolve form, or bin/tickets.mjs
resolve <ref> --code <code> --resolution '…'"* — run against `t_devco`'s `MD-1000`, which stayed `new`.
Each console refusal is audited (`ticket.resolve.refused` with the code or null and whether notes
were given; never text).

**5.55b — the race, run.** `admin-db` §5d creates a second ticket and fires two `setTicketState(…,
"open", { from: "new" })` calls through `Promise.all`, each with its own internal note. Result on
every run: one `{ from: "new", to: "open" }`, one `{ refused: "… is open now, not new: someone moved
it after that state was read …", state: "open" }`, one `state_change` entry, and the winner's note on
the row. The mechanism is PostgreSQL's own: the second transaction's `FOR UPDATE` waits on the row
lock, re-reads the committed row, and the outer `t.state = $from` no longer holds. No application
lock, no version column.

**5.55c — what P2 decided that the plan left open, and what it did not decide.** `closed_by` has
four values, not three (the CLI). A reopen clears the CURRENT resolution columns and keeps the
history in the timeline — the plan had the columns but did not say what a reopen does to them. The
console never offers `closed` from a live state (D279's second clause) — the plan's §3 table allowed
*"a console user with a reason"*, and no reason field exists, so the resolution IS the reason. **Not
decided:** the resolution-code vocabulary (question 8 — shipped as drafted, revise by migration);
`reopened_from` (P4, with the requester's *"raise a new ticket about this"*); whether a work note may
still be added to a `closed` ticket (it may — nothing in P2 refuses it; P4/P5 may want to).

**5.55d — what is NOT built.** Nothing requester-facing: no `getTicketForRequester()`, no denylist
test (D269's condition — written first, seen failing — still stands for P3), no delivery of the notes,
no `confirmResolution()` / `reopenTicket()` (P4), no `ticket.autoclose` (P5, and D270's
at-least-once condition). The `resolution` entry is public and reaches nobody, like every public
entry since D275. **The dev database is migrated** (`t_devco 007-resolution, applied 1`; again:
`nothing to apply`); `MD-1000` was not moved.

**5.55e — one inherited assertion moved.** `admin-db`'s auditor pass assumed the newest ticket was
still `open` when it tried a forbidden POST; P2's §5d leaves tickets resolved and closed, so it now
records the state before the POST and asserts it is unchanged after — the property it was always
testing. Found by running, not by reading.

**Headless 592 across 6 files (was 562); db 498 across 3 (was 462).** Handback:
`docs/handovers/2026-09-12-claude-code-handover-ticket-lifecycle-p2-built.md`.

### 5.56 D281 — the requester-safe read shape, built before the gate it does not depend on (2026-09-12)

**Where this came from.** The P3a/P3b handover
(`docs/handovers/2026-09-13-claude-code-handover-p3a-requester-safe-reads.md`, filed `b476f49`), which
split plan v3's P3 in two: the credential and the transport (P3b) wait on D271; the row shape does
not. **The forcing reason is the handover's §0:** `getTicket()` does `SELECT t.*`, and any
requester-facing route built on that shape ships `summary` — the model's case note, which
`003-tickets.sql` says is *"never shown to the user"* and which D214 exists because on 2026-09-04 it
was read aloud to one — plus `what_was_checked` and `internal_resolution_note`. That is true whoever
the caller is, wherever the hub runs, whatever D271 says. So the safe shape and the test that pins
it were built before the decision, which is also D269's ratified condition (the denylist test first,
seen failing, before any requester route) discharged early. The handover's own numbering — *"use
D281 onward"* — matched this file's, for once.

| ID | Decision | Status | Source and forcing reason |
|---|---|---|---|
| **D281** | **A requester may receive a ticket only through `getTicketForRequester()` and `listEntriesForRequester()` — named columns on an ALLOW-LIST with a reason per field, scoped to the requester in SQL; never `SELECT t.*`, never a spread of a row.** Eleven fields: `reference`, `state`, `category`, `machineName`, `createdAt`, `updatedAt`, `resolutionCode`, `resolutionNotes`, `resolvedAt`, `closedAt`, `closedBy`. **Not** `summary`, `whatWasChecked`, `internalResolutionNote`, `suggestedOwner` (routing is internal), `sessionId`, `description` (the draft omits it; P4's call), nor the reporter's profile echoed back. The WHERE is `t.reference = $1 AND u.os_username = $2`: another OS user's reference is the same null as no such ticket — this layer is not an existence oracle. The timeline reader is `listEntries(…, { visibility: "public" })` with the argument FIXED and the ownership check first, so someone else's public rows are not this requester's. **Allow-list, not denylist**: a denylist of names admits every column added after it is written; `admin-db` §5e classifies every column `information_schema` lists for `tickets` as visible or hidden and FAILS on one that is neither — **proven by adding `p3a_probe` (`21 columns … unclassified: p3a_probe`) and reverting**. `admin-static` §5f pins the returned keys to the list and reads the SELECT. `getTicket()` keeps `SELECT t.*` for the console and points here. The identity is `{ osUsername }`, REQUIRED, no default; **no `deviceKeyId`** though the handover drafted one — `tickets` has no device column to match, and a parameter that matches nothing is the shape D267's guard 2 was found in. **Called by nothing**: the route is P3b's; §5f fails if a caller appears before D271 is answered, and its label says to retire that line in the commit that adds the route. | **PROPOSED 2026-09-12** — built (`756ad74` the test, RED: 14 headless + 2 live failures on the missing export; `98f7ea0` the readers). **Discharges D269's ratified condition.** **Rekeyed 2026-09-12 by D284 (`da7a86b`):** the identity is the enrollment's `control.devices.id` (`tickets.device_id`), not the OS username, as this row's header said it would be when a device column arrived. | The P3a handover §0–§1 and §4; plan v3 §7.2 and its "D259" (void, §5.53a). Forcing reason: `getTicket()` returns `SELECT t.*` and D214's case note is in it; the hazard is independent of D271, so the safe shape and its test are built before the gate opens. |

**5.56a — what the handover asked for that was not built as drafted.** (1) *"an explicit
`osUsername` + `deviceKeyId` pair"* → `{ osUsername }` alone. Tickets carry no device column
(D75: `session_id` nullable, no endpoint session), so `deviceKeyId` would have been a parameter that
matches nothing; the header says so and the test requires the absence. When P3b gives a ticket a
device to match, the column and the clause arrive together. (2) The identity is one object, not two
positional arguments, so P3b adds a field without touching arity. (3) `listEntriesForRequester()` is
not *only* `listEntries` with the argument fixed: fixed visibility alone would let any requester read
any ticket's public timeline — the resolution notes for someone else's problem — so ownership is
checked first. (4) `description` is hidden, because the draft's allow-list omits it; one line in two
lists when P4 wants it.

**5.56b — the red run.** `756ad74`, headless: `=== 5f …` then `FAIL  getTicketForRequester() is
exported from the one query layer (D224)` and thirteen more; `192 passed, 14 failed`; `SUMMARY — 5/6
file(s) passed` with the five other files green. Live: `PASS  tickets: every one of its 20 columns is
on the requester-visible list or the hidden list` (the classification holds before the function
exists — it is a property of the schema), then `FAIL  getTicketForRequester() and
listEntriesForRequester() exist` and `FAIL  the live checks ran against the requester shape … this is
the red run`; `356 passed, 2 failed`. The live import is dynamic, so the missing export failed two
checks rather than crashing the file — a red run that still reports the other 356.

**5.56c — what is NOT built, and what waits.** No route (`GET /v1/tickets` is P3b's), no client
change, no enrollment, no credential, no transport, no `last_seen_at` writer, no revocation
enforcement, no tenant-from-credential, no body cap or poll floor. D274's detector and the Agents
page copy are untouched — the client still does not enrol. **P3b is gated on D271** and the handover's
§2.1 table records what each of the three answers does to it; nothing here picks one. When D271
opens, the P3b handover should say D269's condition is already discharged rather than ask for a
second red test.

**5.56d — the dev tenant, read and not moved.** `bin/tickets.mjs list` against `t_devco`: ten tickets,
`MD-1009 open`, `MD-1008 closed`, as the handover's note describes; 8 new, 1 open, 0 resolved, 1
closed. No dev ticket was touched.

**Headless 607 across 6 files (was 592); db 517 across 3 (was 498).** Handback:
`docs/handovers/2026-09-12-claude-code-handover-p3a-built.md`.

### 5.57 D282–D285 — P3b: the enrollment credential, the LAN listener over TLS, tickets scoped to the enrollment, and the secret in config.json (2026-09-12)

**Where this came from.** Charles: *"Start P3b"*, the evening P3a landed (§5.56). P3b was gated on D271;
Charles answered it at the start of the pass — *"Current the hub and endpoint is on machine for
development and testing. In production the hub will send on same LAN/WAN as the Agent."* — which is the
LAN row of the P3a/P3b handover's §2.1 table, and two further founder answers followed the same hour:
the enrollment secret reaches an endpoint as **plaintext in config.json** (plan v3 §8.1 had said this is
a decision, not a default), and the console **opens to the LAN too**. Everything below rests on those
three answers, and D271's row records the first in his words. **The forcing reason is the handover's
§2.1 and plan v3 §6.2:** a request from an endpoint on the LAN is a request from another machine, so
"does this request come from the device that enrolled" stops being theatre — and the hub bound
`127.0.0.1` with a literal, TLS out of scope, so the credential needed a transport to travel on.
Handback: `docs/handovers/2026-09-12-claude-code-handover-p3b-built.md`.

| ID | Decision | Status | Source and forcing reason |
|---|---|---|---|
| **D282** | **An enrolled device holds ONE enrollment credential, minted when it becomes active, shown to the endpoint exactly once, stored by the hub only as its sha256, presented as `Authorization: Bearer mdc_…` on every /v1 request, and refused on the request after it is revoked.** `control/008` (`devices.credential_hash`, `credential_issued_at`, a partial unique index); `submitEnrollment()` mints on activation — auto-approve, or the first submission after a hand approval — with `WHERE credential_hash IS NULL` making "once" a database property; a device that already holds one gets `credential: null` and a sentence (replacement is revoke-and-re-enroll, so the console sees it). `authenticateDeviceCredential()` looks up by hash, refuses with a named reason (malformed, unknown, revoked, inactive, tenant-inactive), and **stamps `last_seen_at` — the column's first writer that is not enrollment** (addendum G2). **It authenticates a PER-OS-USER ENROLLMENT OF THE SOFTWARE**: the client keeps it in Electron's per-user userData beside the profile (D215), so each Windows account enrolls separately and anyone who can read that userData IS that enrollment. Not a machine, not hardware, not a person — said by `IDENTITY_NOTE` on the route, in `/v1/health`, on every requester response and on the Agents page. It is the weaker credential on D61's path: the same route shape with a bearer secret where the signed assertion will go; when D60/D63/D64 land the secret is replaced and the routes do not move. | **PROPOSED 2026-09-12** — built (`a7b4c8e` hub, `e207a3c` client). | The P3a/P3b handover §2.2; plan v3 §6.2's "D254" (void). Forcing reason: D271's LAN answer. Revocation (D83a) was a status change that blocked nothing until this; the Agents page said so (D273). |
| **D283** | **The hub may bind off loopback ONLY over TLS; on such a listener every /v1 route but /v1/enroll and /v1/health REQUIRES the credential; on a loopback listener the credential is optional but checked whenever presented; the decision is the LISTENER's, read from the bound socket. The console is reachable wherever the hub is.** `MATIC_HUB_BIND` (default 127.0.0.1) with `MATIC_HUB_TLS_CERT`/`MATIC_HUB_TLS_KEY`: `listenPlanFromEnv()` refuses to start a LAN bind without both, with a banner, before anything is built; `admitPeer()` refuses a plaintext non-loopback peer per request too, so a server built any other way cannot serve credentials in the clear; "localhost" is not in the LOOPBACK set and so is a LAN bind. Order in the handler: peer gate, credential check (`authenticate()`), the listener's requirement (`credentialRequired()`), routes; `x-matic-hub-auth` is `device-credential` or `none` per response; a credential the control plane cannot check is a 503, never a fall-through. The console's login page and every footer say where the console is reachable from, read from the socket; its cookie is Secure off loopback BY CONSTRUCTION (the socket is TLS, D222). **This supersedes D267's rejection of `MATIC_HUB_HOST` with both objections met** — D271 made the LAN the production shape, TLS is mandatory off loopback, the cookie is Secure there — and D267's guard 2 now fires in a shipped configuration. | **PROPOSED 2026-09-12** — built (`3eff3f5`). **Run by hand:** `MATIC_HUB_BIND=0.0.0.0` without a certificate printed THIS HUB DID NOT START and exited 1; with a one-day self-signed certificate on 127.0.0.2, a 127.0.0.3 peer got /v1/health 200 (`tls: true`, `auth: required…`), /v1/turn 401 naming the header and POST /v1/enroll, /admin/login 200 *"Reachable from the network."* **The console's security review is OWED before a customer's network sees the sign-in page, and the page says so.** | Handover §2.1 (the LAN row: *"the hub must accept non-loopback peers, over TLS … D222's cookie Secure flag becomes unconditional the same day"*); Charles's "Open /admin too". Forcing reason: a credential that travels in the clear is a credential anyone on the segment holds. |
| **D284** | **The requester's scope is the ENROLLMENT that filed the ticket, not the OS username.** `tenant/008` adds `tickets.device_id` — a bare uuid, no foreign key (tenant/001's argument for `sessions.device_id`), a partial index — written by `createTicket()` from an option the route fills from the verified credential, never from the body. P3a's readers are REKEYED to it (`WHERE t.reference = $1 AND t.device_id = $2`) and `listTicketsForRequester()` joins them; one column string and one shaping function serve both. **`GET /v1/tickets` and `GET /v1/tickets/:reference`** (`src/tickets/read.js`, no SQL) return P3a's eleven columns and the PUBLIC timeline behind the credential on EVERY listener — with none there is no requester to scope to — plus an `identity` field saying what the credential proves and does not, and **a per-enrollment rate limit of sixty reads a minute, the poll floor's server half**. `POST /v1/ticket` and `/v1/session` take their tenant from the credential's device row on an authenticated call; `MATIC_TICKET_TENANT` serves unauthenticated loopback calls only. Why the enrollment and not the name: the OS username is self-asserted at enrollment and at filing (D215), so anyone holding the tenant's enrollment secret could enroll under any name and read that name's tickets; the enrollment id is something only the credential-holder can present. **Two costs, accepted from plan v3 §6.2:** a reinstall or cleared userData is a new enrollment and sees no earlier tickets; a ticket filed with no credential — a loopback development hub, or anything before tenant/008 — is readable by no requester route. The console and `bin/tickets.mjs show` say whether a ticket was filed with a credential. | **PROPOSED 2026-09-12** — built (`da7a86b`, `3eff3f5`). **Proven live** (admin-db B3-5): a second hub configured with NO tenant files an authenticated ticket into the credential's tenant and lists the enrollment's tickets; a ticket filed without a credential is a 404 to every requester. | Plan v3 §6.2 (its "D254", correction 1: sequential references are a thousand guesses, not authorization), §7.3 (`GET /v1/tickets` row; *"the tenant comes from control.devices.tenant_id, not MATIC_TICKET_TENANT"*). D281's header promised the column and the clause would arrive together. |
| **D285** | **The enrollment secret reaches an endpoint as PLAINTEXT in `client/config.json`, per install — `enrollment: { tenant, secret }` — or from `MATIC_ENROLLMENT_TENANT`/`MATIC_ENROLLMENT_SECRET` for one run; the repository's copy carries an EMPTY secret and `client/test/enrollment.test.mjs` fails if it does not. The client enrolls at startup (`client/src/agent/enrollment.js`): one `POST /v1/enroll` with an opaque device key it minted for itself (random, NOT a key — D60/D63 are not built), the credential kept in `enrollment.json` beside `profile.json` in per-user userData, presented by `HubClient` on every request through one `#headers()`; pending, locked and unreachable retried every five minutes; refused and held not retried, the log saying whose fix it is. And the Agents page is rewritten for the new premise: D272's caveat now says endpoints enroll THEMSELVES at startup and the counts are enrollments per OS user; D273's two sentences are REVERTED — "Last seen" is a heartbeat with a Credential column beside it, Revoke blocks the next authenticated request — and D274's detector is INVERTED: it fails the day `client/src` stops calling the route.** | **PROPOSED 2026-09-12** — built (`e207a3c`, `41954ad`). **The detector fired first, by design:** `e207a3c` left admin-static §6a red with *"THE CLIENT NOW ENROLLS (agent/enrollment.js) — D272/D273's copy is FALSE and must be revisited…"*, the writer and the enforcement already existing; the copy was rewritten third. `HubClient.listTickets()`/`ticket()` exist and are wired to no surface (P4's). | Charles's answer (config.json, the recommended option); plan v3 §8.1's P3 row (*"a plaintext secret in config.json is a decision, not a default"*), §7.5; D82 (install-time configuration); B3 (*"there is no installer in this build"*). Forcing reason: without an installer the two honest answers were a file or a person pasting, and the founder chose the file. |

**5.57a — decided beyond the handover, and why.** (1) The credential is OPTIONAL on a loopback listener
and REQUIRED on a LAN one, decided by the listener: the handover's same-machine row calls a credential
nobody can reach the route without theatre, and its LAN row requires one on every request; both are true
of their listener, so the hub reads its own bound address and applies the row that fits. Development,
both test suites, the launcher's warm-up turns and the demo box keep working unauthenticated on loopback.
(2) `localhost` is a LAN bind: the set names addresses. (3) One credential per device; a re-submission
from a device that holds one gets none, whoever presents the secret and the key — a copy minted to
whoever asks is a takeover. (4) The client makes no request for its own tickets without a credential:
the hub would answer nothing and the reason is already known on the endpoint. (5) TLS is enforced twice,
at start and per request, so a misbuilt server cannot leak.

**5.57b — the detector, both ways.** D274's block failed on 2026-09-12 morning when pointed at a tree
that called the route (§5.54b); it failed for real on 2026-09-12 evening when `e207a3c` made the client
call it — `208 passed, 1 failed`, the sentence quoted in D285's row — and it now guards the inverse. A
premise pinned to behaviour has been proven to fail in both directions on the same day.

**5.57c — the LAN path's honest limit.** `test/bind.test.mjs` and the by-hand run bind 127.0.0.2 and
connect from 127.0.0.3: non-loopback to the hub's set, exercised on ONE machine's loopback adapter with a
self-signed certificate trusted explicitly as the CA (never `rejectUnauthorized: false`). No second
machine, no real network, no CA-issued certificate has been tried. "The LAN listener works" means that
much and no more today.

**5.57d — what is NOT built, and what D271's answer now owes.** D60/D61/D63/D64 (TPM key, signed
assertion, token exchange, broker custody): the credential is the weaker step on that path, said
everywhere. **The console's security review** before a customer's network sees sign-in — Charles chose to
open it; the page says the review has not happened. **D270's condition 1 is live:** the job runner is
in-process and D271 puts the hub on another machine in production, so promotion to a separate worker is
owed before a LAN deployment. P4 (panel view, polling with the client half of the floor, comment, confirm,
reopen, ack, toast) and P5 (auto-close, under D270's at-least-once condition). The client's connectivity
pill probes the public `/v1/health` and so reads "reachable" on a LAN hub that refuses every turn for want
of a credential — a P4 item; the `[enroll]` log is the only surface that says why. No credential expiry
or rotation. `description` stays hidden from the requester (P3a). The running dev endpoint has NOT
enrolled: the repository's config carries an empty secret, so it logs `[enroll] disabled` with the
command that mints one. **The dev database is migrated** (control/008, tenant/008); no dev ticket moved.

**Server headless 674 across 7 files (was 607 across 6; `bind.test.mjs` is new); db 566 across 3 (was
517); client 1942 across 25 (was 1909 across 24; `enrollment.test.mjs` is new).**

### 5.58 D286–D288 — P4: the requester acts, the console reports delivery, the endpoint polls and shows (2026-09-12)

**Where this came from.** Charles: *"Start P4"*, the evening P3b landed (§5.57). Two founder answers
shaped it before a line was written. On whether an update should be SPOKEN: *"Show only"*. On the panel
view — the ticket timeline and the toast window the plan drew — he first chose to approximate the
surfaces in-app, then stopped the pass: *"I see the statement about my choice to build rather than
describe. tell me about the options and lets work out the description"*, and after the three options
were laid out: *"go with option 1. leave notes about the next steps in your handover."* Option 1 is
what is built: the hub routes, the console composer and delivery state, the client's poll, ack and
`HubClient` methods NOW; the update surfaced through EXISTING surfaces (the tickets band's rows, a
transcript line, the taskbar flash); and the panel view and toast written up as a Claude Design brief
rather than approximated — `docs/handovers/2026-09-12-claude-design-handover-ticket-timeline-and-toast.md`,
with the next steps in it as he asked. **The forcing reason is plan v3 §0 finding 8 turned around:**
P1 refused a requester-visible composer while nothing could deliver what it wrote; D282's credential
and D284's scoped read are the delivery path, so the composer, the comment and the delivery evidence
arrive together and nothing is left claiming a reach it lacks. Handback:
`docs/handovers/2026-09-12-claude-code-handover-p4-built.md`.

| ID | Decision | Status | Source and forcing reason |
|---|---|---|---|
| **D286** | **A requester's comment is a TRANSITION, not a note: on a resolved ticket it reopens (the resolution is undone — code and notes cleared, `resolved_at` cleared, a public `state_change` "resolved → open" written) and on a live ticket it starts D276's clock; on a closed ticket it is REFUSED with the way forward. `confirm` takes resolved → closed with `closed_by = requester`, the resolution kept, the clock cleared. A follow-up to a closed ticket is a NEW ticket carrying `reopened_from`.** `requesterComment()`, `confirmResolution()` and `replyToRequester()` in `server/src/tickets/query.js`, each one transaction under a row lock; `WRITABLE_KINDS` gains `comment` and `addEntry()` still refuses it (a comment is written by the two transition functions only). `POST /v1/ticket/:ref/comment`, `/reopen` (resolved only, a reason required), `/confirm` in `src/tickets/requester-routes.js` — credential REQUIRED on every listener, 20 writes a minute per enrollment, 404 for a ticket that is not this enrollment's, 409 with the hub's sentence and the state it found. `tenant/009` adds `tickets.reopened_from uuid REFERENCES tickets(id)` — a foreign key this time, same schema — and `POST /v1/ticket` accepts `reopenedFrom`, resolved under the credential's device and required closed inside the insert. **P5's autoclose-cancel hooks are marked in both transitions as comments.** | **PROPOSED** | Plan v3 §3.1 (a requester reply reopens; "awaiting the requester" is DERIVED, not a fifth state), §3.2 (confirm closes), D279 (closed is terminal; a follow-up is a new ticket), D276 (the clock needed a writer). |
| **D287** | **The console REPORTS delivery from the hub's two stamps and never implies it. `ticket_entries.notified_at` is set when the hub HANDS a public entry to the requester's endpoint (`GET /v1/tickets/:ref`, `markEntriesNotified()`); `read_by_requester_at` is set when the endpoint ACKNOWLEDGES having shown it (`POST /v1/tickets/ack`, `ackEntries()`) — both the HUB's clock. Every public entry on the ticket page and in `bin/tickets.mjs show` carries one of three sentences: not yet handed to the requester's app; handed <ago>, not yet seen; seen <ago> — and a requester's own comment is "from the requester". The console gains its second composer, "Reply to requester" (`replyToRequester()`, one transaction with the clock stopping, audited `ticket.comment` with the id and never the words), whose form says exactly how far it reaches: the requester sees it only while their Matic Desk app is open and polling; this is not email (D86). Nothing on any surface says sent, notified or emailed.** `deliveryWords()`, `awaitingRequester()` (derived: the last public word is the desk's), `unansweredLimit()`'s "none" now says what none means. Every sentence P1/P2 wrote about the notes reaching nobody is rewritten to say where they reach and when. | **PROPOSED** | Plan v3 §7.4 (delivery state on every public row), §0 finding 8, D86 (no email), D253's argument one layer up: a surface may describe an egress outcome only when it has been TOLD it. |
| **D288** | **The endpoint POLLS its own tickets and SHOWS an update; it does not speak one, and it does not act on one yet.** `client/src/agent/ticket-watch.js`: `GET /v1/tickets` on `config.ticketPollMs` (default 60 s, FLOORED at 30 s in code, `MATIC_TICKET_POLL_MS` for one run), a changed ticket's public timeline read — which IS the hand-off the hub stamps — and every entry from the desk the HUB says is unseen (`readByRequesterAt` null) pushed to the renderer ONCE per process as `ticket:update`; the renderer shows one transcript line per entry with the desk's words quoted in full, then acknowledges exactly the ids it showed. **The hub is the source of "unseen", not a local file**; the snapshot in userData (`tickets-seen.json`) serves the band and the spoken answer. **Show only** (Charles): no `say()`, the face unchanged, `win.flashFrame(true)` when the window is not focused, cleared on focus. **The tickets band's rows carry the hub's state and the desk's last write WHEN THE LAST POLL SAW THE HUB** and fall back to D242's pair when it did not; the words come from `client/src/ticket/state-words.js`, imported by the renderer AND `social.js`, so "where's my ticket?" (D235) answers with the same view in the same words when the watch has one and as before when it does not; no hub state name reaches a surface. `HubClient` gains `comment()/reopen()/confirm()/ack()` over one transport; **only `ack()` is called** — the line the user reads does not invite a reply, confirm or reopen this window cannot yet take, and says how to follow up instead. **This REVISES D242 (ratified 2026-09-11)** — see 5.58b. | **PROPOSED** | Plan v3 §3.3 (poll with the client half of the 60/min floor), §7.1; Charles: *"Show only"*, *"go with option 1"*; D242's own premise ("a user identity that does not exist") ended by D282/D284. |

**5.58a — decided beyond the handover, and why.** (1) A comment on a LIVE ticket sets
`awaiting_agent_since` with `COALESCE` — the OLDEST unanswered comment is the age, a second comment
does not reset the clock. (2) `replyToRequester()` takes a console user OR the CLI (`system`) as author
and refuses `requester` — that path is `requesterComment()`, which is a transition; the two must not
merge because one changes state and the other never does. (3) The requester's own comments and
already-acknowledged entries are never "updates": the watch filters on `authorKind !== "requester"` and
`!readByRequesterAt`, and re-reads a ticket with anything unseen on every poll without re-announcing
it (an in-process `announced` set). (4) `canQueryHub` is now TRUE when the last poll saw the hub — it
was a hard-coded `false` under D242 — and it is still disclosed rather than acted on: the renderer
branches on the hub row it was handed, never on the flag, and main derives it from the watch. (5) The
band's "New from the service desk, not yet seen here" is decided by the hub's stamp, so a second OS
user or a cleared userData shows the truth rather than history. (6) The state label reuses the
delivery's own `.tstat b.you` / `.tstat b.closed` classes, which the design drew for exactly this and
D242 never used; ONE app.css rule was added (the detail line's colour when unseen).

**5.58b — D242 is revised, and Charles has not ratified the revision.** D242 (ratified) said the
band cannot become a status view because a hub-side lookup "needs a route and a user identity that
do not exist (D54, D68/D69)", and that keying one on the self-asserted `osUsername` would be that
identity through the back door. The route exists (D284) and the identity is the enrollment
credential (D282), which is NOT the OS username — so the premise D242 rested on has ended, the way
D274's did. `client/test/panel.test.mjs` §7 is rewritten under D288 with the reasoning in the file, and
what D242 PROTECTED is kept and pinned: a status only when the hub actually said it (`known` is null
on any basis but `ok`); "no lookup" said in the pre-P4 words whenever it is true; one vocabulary for
the band and the voice (a shared module now, where D242 matched a shared clause character for
character — that clause still exists in the not-known branch and is still matched); `canQueryHub`
gating nothing in the renderer and never a literal `true` in main; the preload's ticket channels are
`file`, `filed` and `ack`, and `ack` carries entry ids that stamp a TIME on the hub, never words — a
channel that carries the requester's words is the composer, and that is the Design brief's, not this
build's. **The pins are what Charles is ratifying or reverting.** Reverting is one commit: the
watch stays (the console's delivery state depends on the poll), the band's hub branch comes out.

**5.58c — honest limits.** (1) **"Seen" means ON THIS SCREEN, not read**: the ack fires after the
transcript line is appended, which can happen with the window behind another or minimised (the
taskbar flashes; nothing else). A human's attention is not something the hub can stamp. (2) The
console's "not yet handed" is as stale as the poll: up to a minute (or longer if the app is closed),
and forever if the endpoint never enrolled. The form says so in words. (3) **Nobody has watched any of
it in Electron.** The renderer is not covered by headless tests; `renderer.js` and `main.js` are
syntax-checked and the modules import, and the click-through (`client/docs/PANEL-RENDERER-CHECK.md`)
has not been re-run for the band's hub branch or the update line — that is the first thing the next
session should do, against a hub with a filled-in `enrollment.secret`. (4) The dev endpoint still
holds no credential (the repo's secret is empty), so on the dev box the watch logs `no-credential`
once and the band shows D242's words: correct, and not a demonstration. (5) The connectivity pill
(§5.57d) still reads "reachable" on a LAN hub that refuses every turn for want of a credential; the
watch's `no-credential` basis is in the developer log and the band's note, not the pill. (6) The
"handed" stamp is set by ANY read of the detail, including a future timeline view's; today only the
watch reads it. (7) The state words are English and a first draft — "At the desk", "Being looked at",
"Waiting on you", "Closed" — chosen to fit 150 px of small capitals; the Design brief asks for them to
be reviewed.

**5.58d — not built, and where it went.** The panel view (a ticket's public timeline, the reply box,
Confirm fixed / Still not fixed on a resolved ticket) and the toast window (the update surfacing when
the app is not in front) — **Claude Design's brief, with the next steps for both halves, is
`docs/handovers/2026-09-12-claude-design-handover-ticket-timeline-and-toast.md`; sending it is
Charles's act.** The intent path for "it's fixed" / "it's not fixed" in conversation (a classifier
subkind that would call `confirm()`/`comment()`) — not started; the brief says why it should follow the
view, not precede it. P5 (auto-close after N days resolved without confirmation, under D270's
at-least-once condition; the cancel hooks are marked in `requesterComment()` and
`confirmResolution()`). Comment editing or deletion (none; a comment is a record). Attachments,
assignment, email — the notYet block on the ticket page names all three. **The dev database is
migrated** (tenant/009); no dev ticket moved.

**5.58e — WATCHED, the same night (§10.3c).** 5.58c's item (3) is discharged: the band's hub branch, the
transcript line, the ack round trip and the state words were all seen in the real window against the real
hub, with a ticket filed through the model. Four copy findings, fixed in `e068161`: the band's note and the
spoken answer now say which filed tickets the desk cannot match and why (a shared clause, pinned), a resolve
produces one line not two, and a state change is glossed by its own target. The taskbar flash was not
observed. Client 2056 after the fixes.

**Server headless 695 across 7 files (was 674); db 625 across 3 (was 566); client 2038 across 26 (was
1942 across 25; `ticket-watch.test.mjs` is new).**

### 5.59 D289 — P5: a resolved ticket closes on its own, bound to the resolution that started the clock (2026-09-12)

**Where this came from.** Charles: *"do p5"*, the night P4 landed (§5.58). Plan v3 §7.6 wrote the
mechanism and the trap: *"resolve → reopen → resolve enqueues twice, and the first job would otherwise
find state='resolved' and close a resolution made five minutes ago. Store the job id on the ticket,
or compare resolved_at."* D270 (ratified, §5.53g) made the runtime and set the condition this slice
discharges: the first handler proves at-least-once by running twice before `ticket.autoclose` ships.
The plan's open questions 5 and 6 are answered here as recommended — 72 hours, labelled a proposal;
and yes, the close is told to the requester, as the same public state change every other update
travels as. Handback: `docs/handovers/2026-09-12-claude-code-handover-p5-built.md`.

| ID | Decision | Status | Source and forcing reason |
|---|---|---|---|
| **D289** | **A resolved ticket closes on its own after the tenant's interval unless the requester confirms (closes it themselves, D286) or comments (reopens it, D286) or the desk moves it; the job is BOUND TO THE RESOLUTION by the ticket carrying the job's id; the interval is per tenant, 72 hours by default and a proposal, NULL the kill switch.** `resolveTicket()` enqueues ONE `ticket.autoclose` for `resolved_at + hours` inside its transaction and writes `tickets.auto_close_job_id` (bigint — the queue's id is a bigserial; no FK) and `auto_close_at` (tenant/010). The handler (`src/tickets/autoclose.js` → `closeByAutoclose()` in query.js) closes as `closed_by = 'auto'` ONLY IF `state = 'resolved' AND auto_close_job_id = <its id> AND auto_close_at <= now()`, all in the UPDATE's WHERE under the row lock, and writes a public `state_change` by `system`/`auto-close`; any miss is success with a sentence naming which of four reasons. Every way out of resolved — `requesterComment()`'s reopen, `confirmResolution()`, `setTicketState()` — clears the binding in its UPDATE and withdraws the queued job (`cancelJobsFor`): the guard is the guarantee, the cancel the fast path (control/007's order). `control.tenants.ticket_autoclose_hours` (control/009): DEFAULT 72, CHECK 1–8760 or NULL; read at resolve time and never re-applied. The console's tickets list carries the panel (`settings.read` to see, `settings.write` to change, audited with the value); the detail page and Resolve form say when and what stops it; `bin/tickets.mjs autoclose` reads/sets through the same function (D224). The requester's read carries `autoCloseAt` (the date) and hides the job id; the band says "closes on its own in 3 days unless you say otherwise"; a state change labelled `auto-close` is shown as "closed on its own", never as the desk's act. | **PROPOSED** | Plan v3 §7.6, §3.1, §8.4, open questions 5 and 6; D270's condition 2 (DISCHARGED: `admin-db` P5 runs one job twice); D196 (no payload column — hence the id on the ticket); D278 (`closed_by = 'auto'` reserved in tenant/007); D86 (nobody is emailed). |

**5.59a — decided beyond the plan, and why.** (1) The binding is the JOB ID ON THE TICKET, not a
`resolved_at` comparison: the queue row has no payload column (D196) and must not grow one, so the
comparison would need a second tenant table keyed by job; one column and one equality also makes
every cancel path a column clear. (2) The due instant is IN THE WHERE, so a job that somehow runs early
(a clock skew, a hand-moved `run_after`) does nothing rather than closing early. (3) The interval is
read when a ticket is resolved and never re-applied — a policy change is not a retroactive edit of
instants already shown to requesters; the console says so. Consequence, recorded not assumed: turning
the interval OFF stops NEW bindings and leaves already-queued jobs to fire; withdrawing them too is one
statement and a decision Charles has not been asked for (handback §3.5). (4) Hours, not days: a test
needs an interval shorter than a day and a customer may want one; 8760 is "never" without a magic
value. (5) The auto-close author is `system` with the label `auto-close`, so the endpoint can say
"closed on its own" from the label and the console glosses `auto` as "the auto-close job" — no new
author kind, no new column.

**5.59b — D270's condition, discharged the way it was written.** *"The first handler proves
at-least-once by running twice before ticket.autoclose ships."* `admin-db` P5 §4 runs the handler
directly under `withTenant` on a job whose `run_after` is still an hour away — so a dev hub sharing
the database cannot claim it mid-test — with only `auto_close_at` moved into the past: the first run
closes and writes one entry; the second finds the binding cleared by the first and writes nothing,
`closed_at` unchanged. A second scenario goes through `runOne()` with a genuinely due job and accepts
either worker — the test's or a running dev hub's — saying which won, because the outcome is the same
and the race is real. `jobs.test` 1b drives every branch of the handler against a fake client headless.

**5.59c — honest limits.** (1) tenant/010 was REWRITTEN BEFORE COMMIT: it first typed the job id
`uuid`, the database suite found the bigserial on the first resolve, and the correction was made by
rolling the minutes-old, never-committed ledger row off the dev tenant and re-migrating — not by a
tenant/011. The immutability rule protects migrations other tenants hold; none did, and the committed
010 is the only 010 any ledger has held. Had it been pushed, the answer would have been tenant/011,
and this sentence is here so the next reader knows the line was walked up to and not over. (2) 72 is a
proposal; nothing is measured. (3) The console pages and the client's words are exercised by tests
reading rendered HTML and strings; nobody has opened them. (4) OFF does not withdraw queued jobs
(5.59a.3). (5) A hub restarted mid-handler leaves the row `running`; the reaper requeues it after ten
minutes and the second run is the no-op this slice proved — which is the contract working, and also
means an auto-close can land up to ten minutes late after a restart.

**5.59d — not built.** Per-ticket override of the interval; a "closes soon" filter on the list (the
partial index exists for it); the requester being told AHEAD of the close by anything but the band's
sentence; withdrawing queued jobs on OFF (5.59a.3). P6 (email) remains gated on D86.

**5.59e — WATCHED, the same night (§10.3c).** The auto-close fired through the hub's OWN runner (the job
made due by SQL) and reached the real app as *"closed on its own"* with the band at "Closed"; the resolved
band row read *"closes on its own in about an hour unless you say otherwise"* at a 1-hour interval and *"in 3
days"* at 72. 5.59c's item (3) is discharged for the CLIENT surfaces; the console's P5 pages were NOT watched
(no sign-in was made) and remain Charles's.

**Server headless 733 across 7 files (was 695); db 661 across 3 (was 625); client 2041 across 26 (was
2038); 2056 after the click-through's fixes (§10.3c).**

## 6. Conflicts

### 6.1 Conflicts C1–C8 (consolidated register, IDs +7)

| ID | Conflict | Status |
|---|---|---|
| **C1** | §4 says the hub must not own the conversation loop; §4 also places prompt versioning on the hub; D53 places retrieval and assembly on the hub. Three statements, unreconciled. | Needs wording decision. Recommended: restate as *model proposes / endpoint validates / broker executes*. |
| **C2** | §5 commits to a Postgres `SKIP LOCKED` job queue; §6 commits to schema-per-tenant. Per-schema queues mean N pollers or one poller iterating every schema; a shared queue table reintroduces the cross-tenant surface schema-per-tenant was chosen to eliminate. No third option. | **Open. Blocks the first migration.** |
| **C3** | H1 says the signing key never lives on the hub; §4 describes signed catalog distribution as per-tenant and as the path for draft-and-approve authoring. Together these require a human to sign every customer's catalog edit offline, indefinitely. | **Open.** Probable resolution: the signed artifact is the vendor-authored primitive/playbook catalog; per-tenant approved-subset and risk policy is unsigned config enforced by the endpoint against it (H2 + H4). Not yet stated. |
| **C4** | §2 says most customers lack ServiceNow; §4 puts the internal ticket store at priority 3 behind a ServiceNow adapter built for one design partner. | **Resolved by D73.** |
| **C5** | §10 quotes RDS/NAT/endpoint rates for US East (Ohio); §11 commits to us-east-1. | **Open.** Re-price. |
| **C6** | §3 asserts hub compromise costs confidentiality, not control. | **Open.** Does not hold until H4 is ratified. |
| **C7** | §4 puts the inference proxy at priority 2; §14 says items 1–4 are the minimum that makes joined mode mean anything, and the proxy is item 6. Under D52/D53 joined mode requires it. | **Open.** Both cannot hold. |
| **C8** | §4 puts interaction history at priority 3; under D53 the hub receives conversation state every turn regardless. | **Open.** We take the data at priority 2 and call storing it priority 3. A retention question (§9), not a feature question. |


### 6.2 Conflicts C9–C12

Recorded in §4.7 above with their D122–D129 resolutions. Verdicts below.

### 6.3 Review verdicts on C1–C12 (2026-09-02/03)

| ID | Verdict | Where it now stands |
|---|---|---|
| C1 | Agree on the restatement *model proposes / endpoint validates / broker executes*; it carries the security weight but not the measurement weight — standalone assembles the prompt on the endpoint, joined on the hub, and the bake-off measured only the first (R-1). | Open. The prompt template should be a versioned, signed artifact both assemblers read. |
| C2 | Disagree that there is no third option. | **Resolved by D143** (shared control-plane schema + per-tenant data schemas), pending ratification. |
| C3 | Agree with the probable resolution; decide it. | **Decided by D134.** Customers select and constrain vendor playbooks; they do not author them. |
| C4 | Agree; the largest scope decision in the register. | Resolved by D73. Counterweight: D149 defers catalog distribution instead. |
| C5 | Re-pricing changes nothing; the question is different now. | **Resolved by D141/D93.** Residency is an Anthropic question. |
| C6 | Agree. | Open until H4 is ratified (D134). Even then, "confidentiality, not control" is too strong: under D53 hub compromise costs the model's instructions on every joined turn — "confidentiality plus persuasion, not execution". |
| C7 | Agree. | The proxy is item 2, after identity (D138, D149). |
| C8 | Agree; also a consent question. | D79b already says mirroring changes the privacy posture; D125–D128 flatten it to a disclosure string. **X-1**; resolved in D79b's favour by D137. |
| C9 | Agree; verified; in four documents. | **Done — D139.** |
| C10 | Agree on the axis and on D125, D126, D129; disagree on D128's predicate. | D128's predicate superseded by D137. |
| C11 | Agree; a hub-side contract test. | Open. The rule is "not to the model", not "not to the hub". |
| C12 | Agree; this is OPEN-1. | **Resolved by D148**, pending ratification and `[VERIFY]`. |

### 6.4 Cross-register conflicts X-1–X-7 (review C.3)

Tensions between decisions written in different sessions, neither of which saw the other.

| ID | Between | Conflict |
|---|---|---|
| **X-1** | D79b (was D72b) and D125/D127/D128 | D79b: session mirroring is a categorically different privacy posture needing its own consent wording. D127: a session-start disclosure string covers conversation to the hub. Under D53 every turn reaches the hub and under C8 the hub keeps it. Whether that stored transcript then reaches fulfillers (interaction records, D75/D76 was D68/D69) is exactly D79b's case, and D127 does not cover it. Decide which register wins; I say D79b. |
| **X-2** | D64 (was D57) and D99/D102 | The register put the device key, the mode state (D48 was D41), enrollment and token minting into the broker, making it the trust anchor for everything. The later document put the broker on the slowest update channel with protocol negotiation to paper over drift. The more the broker holds, the worse D99's trade becomes. B4 and the Part B addendum. |
| **X-3** | D61 (was D54) and register §5 | D61 says short token expiry "delivers revocation without CRL machinery"; D83a (was D76a) says revocation is a row delete and tokens expire on their own. Revocation latency therefore equals the token lifetime, which §5 lists as unset. It is a security parameter, not a tuning one, and D83a's bulk revocation is only as fast as it. Set it in the same decision as the heartbeat interval; A5's TPM latency (P95 ~600 ms) says the exchange can happen every few minutes without cost. |
| **X-4** | D45/D46 (was D38/D39) and D104 | Generic KB and catalog bundles are pushed proactively by the hub; binaries are not delivered by the hub. Content yes, code no. That is a coherent line (D110/D111), so this is not a conflict. Recorded because the next reader will ask. |
| **X-5** | D53 (was D46) and H5 | H5 governs hub text reaching the *user*. D53 makes the hub the author of the *model's* entire context. The escalation `summary` is hub-returned text that the shipped code speaks in the avatar's voice; H5 as written forbids that. Nobody has listed the UX change (Part B addendum item 3). |
| **X-6** | D60 (was D53) and A5 | Not a conflict; three additions the register needs. Create the device key with no TPM authorisation value so Windows Hello lockouts do not block the broker (`[VERIFY]` PCP default). Do not create it inside `StartService` (Microsoft documents the deadlock). Detect duplicate public keys across devices, because cloned VMs on vSphere 6.7/7 share one vTPM. |
| **X-7** | Register §6 (rebuild the estimate) and B6 | The register asks for the estimate to be rebuilt after adding a knowledge platform, a ticketing system, email and analytics. B6 asks for the privileged-content distribution half of the hub to be deferred. Both are true; together they say the phase-one hub is identity + proxy + tickets + KB + email, and not catalogs, rings or tenant policy. Neither register draws that conclusion. |

### 6.5 Reviewer tensions R-1–R-14 (review B2)

Found from the source documents before either register was read; numbered R- so they cannot be confused with C-numbers. R-4 and R-8 were later withdrawn as conflicts (already decided by D59c and D53a); R-7 is half-moot (D97, D139).

| # | Requirement A | Requirement B | Why they collide | Resolution I would take |
|---|---|---|---|---|
| R-1 | Hub does retrieval, prompt assembly and "versions prompts" (§4 inference proxy) | "The conversation loop stays on the endpoint, or offline mode dies" (§4); one shared prompt is a correctness requirement for the bake-off (`prompt.js`) | If the hub assembles the prompt online, the endpoint assembles a *different* prompt offline. Two prompts, two behaviours to certify, and the bake-off measures neither of them. | The endpoint owns the prompt template (signed, in the catalog bundle). The hub supplies only retrieved chunks and the tenant policy block as data. "Prompt versioning" becomes catalog versioning. |
| R-2 | Job queue in Postgres via `SKIP LOCKED` (§5) | Schema-per-tenant as a hard boundary (§6) | A queue table per tenant schema needs N pollers or a UNION across schemas that grows with tenants. One shared queue table breaks the boundary: a worker must `SET search_path` per job, and a bug there is the exact cross-tenant leak schema-per-tenant was chosen to prevent. | Accept a shared **control-plane** schema (tenants, devices, queue, releases) and per-tenant **data** schemas. It is a third option, and it is the honest one. Write the worker so the tenant schema comes from the job row and is asserted before every query. |
| R-3 | Per-tenant signed catalogs, draft-and-approve in the hub (§4) | H1 | See B1/H1. The hub cannot be the thing that triggers signing. | Vendor floor catalog signed offline by us. Tenant delta signed by the **customer** with a key they hold (their own KMS, their own HSM, or a hardware token), and the endpoint trusts vendor key + tenant key, delta constrained by H4. The product cost is that customers must run a signing step. That is the cost of H1. |
| R-4 | Customer-hosted hub (§5, §15) | Telemetry, deflection measurement, canary rings, token metering (§4, §12) | Everything we sell (deflection) and everything we bill on (tokens) is measured on a server the customer runs and we cannot see. Canary rings across a fleet we do not control are the customer's Intune rings, not ours. | Say it in the contract: customer-hosted is excluded from deflection commitments (§12 already does this for tier 3) *and* from usage billing (flat per-seat). Ship a signed weekly usage report the customer can choose to send. |
| R-5 | The broker never opens a socket | One consent flow and one audit log for ticket egress (PHASE1-TICKETING §3 "extend the broker") | If the broker never transmits, the broker consents to a payload it cannot verify was the payload sent. The agent can add fields after consent. One audit log of "what left the machine" cannot be written by the process that did not send it. | Hub returns a signed receipt containing the hash of what it received. Broker logs consent hash and receipt hash; a mismatch is an audited incident. The broker still never opens a socket, and the audit record is honest. |
| R-6 | Offline capability / customer boundary (§13 "corpus can stay inside the customer boundary") | Any hosted embedding API for the managed tier | A customer-hosted hub calling OpenAI, Voyage or Cohere to embed their KB defeats the reason they host. If managed uses a hosted API and customer-hosted uses a local model, the two tiers have incomparable vectors and no migration path. | One self-hostable embedder, run by us in managed mode too. Whether that is viable on CPU is Part A, A1. |
| R-7 | Bake-off recommendation: `mistral-small:24b`, 16 GB VRAM (BAKEOFF §1) | Phase 1 hosting at ~$46/month with no GPU anywhere (§10) | The model the project recommends cannot run on the infrastructure the project costed. A GPU instance capable of a 16 GB resident model is an order of magnitude above the entire Phase 1 budget. `[VERIFY]` current GPU instance pricing; I do not have a verified source for this in this review. | Decide which tier the recommendation is for. If "managed", the cost model is wrong and needs a GPU line. If "customer-hosted only", say so in the bake-off, and the managed tier's routine model is still Haiku 4.5 with eight false actions before preconditions, four after. |
| R-8 | "Redaction runs before egress regardless of destination" (§9) | Hub-side retrieval and hub-side interaction history (§4) need the un-redacted question to retrieve well | Redaction on the endpoint removes the names, hostnames and error strings that make retrieval work. Redaction on the hub means un-redacted text has already left the machine. | Redact on the endpoint with a *tenant-configured* rule set (H2: policy is data). Accept the retrieval loss. Never let "we redact on the hub" be the answer; it contradicts §9 in one sentence. |
| R-9 | Standalone installs convert to joined without reinstall (§7) | Agent self-updates, broker updates only via customer tooling (B4 model) | Standalone has no customer tooling. Standalone brokers never update. The divergence B4 worries about is *guaranteed* in the mode the product ships first. | Broker updates itself in standalone mode (signed MSI from CDN, run by the service). Which is the mechanism B4 recommends anyway. |
| R-10 | Idempotency keys from day one (§8) | "Do not build a queue by accident" (§8, PHASE1 §5) | The only reason to have an idempotency key is that you intend to retry. The first retry-after-5xx is a queue of length one with no visibility, no expiry and no cancel. | Choose: refuse on failure and tell the user (no key needed), or build the queue deliberately. The spec currently has the key and not the queue, which is the accident it warns about. |
| R-11 | us-east-1 chosen for Bedrock In-Region coverage (§11) | Bedrock is out | The only stated reason for the region is gone. Data-residency question 18 is still outstanding and the Anthropic API's residency controls are a different mechanism entirely (A3). | Re-decide region on cost and blast radius (A4). Re-open residency as an Anthropic-API question, not an AWS one. |
| R-12 | Per-device rate limiting so a looping client cannot flood the hub (§8) | Incident storms are the product's reason to exist | When a customer's network breaks, endpoints cannot reach the hub, so the hub's storm is not network incidents but everything else (a printer driver push, an Outlook update). Per-device limits do nothing against 5,000 well-behaved devices arriving at once; the constraint is the Anthropic tier ITPM (A3). | Per-tenant concurrency cap at the proxy with a queue-position message to the user, in addition to per-device. Size it from A3 numbers, not from "rate limiting per device". |
| R-13 | `tool_choice: {type: "any"}` forces a tool call (`cloud-client.js`) | Certified model set includes newer models | Forced tool choice is rejected with a 400 on the Fable/Mythos 5.1 tier per the API skill's migration notes `[VERIFY against live docs]`. Haiku 4.5 and Sonnet 5 accept it. Not a today problem; a "swap the model in config" problem, which the design says is free. | Move to `tool_choice: auto` plus an instruction, or structured outputs. Cheap now, a production incident later. |
| R-14 | "macOS eventually required; no decision may foreclose macOS" (§2) | TPM-keyed device identity, MSI updates, named pipe, SCM primitives, Win32 FFI | Every concrete mechanism in the identity, update and execution design is Windows-specific. Nothing forecloses macOS in principle; nothing in the documents names the macOS equivalent of any of it either. | Write the one-page mapping (Secure Enclave, pkg/MDM, XPC, launchd) before locking identity. If TPM-attested identity is chosen, the macOS answer is Secure Enclave attestation, which is a different protocol. |

---

## 7. Open items

| ID | Item | Where it stands after the review |
|---|---|---|
| **OPEN-1** | **User identity binding.** Device auth authenticates the machine; KB entitlement (D43) and ticket history (D68) need the user. A self-asserted "user X is logged in" lets a compromised endpoint read any user's articles and tickets. | **Answered by D148** (broker-attested logon SID). Ratify. **Win32 route verified 2026-09-03 against learn.microsoft.com (§10.4), with one correction:** `WTSQueryUserToken` (LocalSystem + `SE_TCB_NAME`) yields the session's primary token; **no `WTS_INFO_CLASS` returns a SID** — the SID comes from `GetTokenInformation(TokenUser)` on that token. The active console session comes from `WTSGetActiveConsoleSessionId` / `WTSEnumerateSessions`. D148's wording should be amended to name the token → SID step. |
| **OPEN-2** | **Whose AWS account** (carried from hub spec §15). | Both; the architecture supports both (D59). The commercial answer: customer-hosted hubs cannot be metered or measured by us (R-4, D59c), so they are flat-priced and excluded from deflection commitments. Decide the price list, not the architecture. |
| **OPEN-3** | **Retention and residency** (hub spec §9, question 18). D58 added a PII table. | **Reframed by D141.** Anthropic retention is 30 days by default; ZDR is sales-gated; no EU inference or at-rest; no US pin on Haiku 4.5. Two sentences go back to the design partner. |
| **OPEN-4** | **v1 subset of the internal ticket store** (D73). | Their list — create, assign, state machine, visibility-split comments (D69), attachments, search, dashboard — **plus email notification to an IT alias (D86)**. Without an ITSM there is no queue; the store plus an email alias *is* the queue. |
| **OPEN-5** | **A threat model.** Ten invariants and no adversary list: user-context malware, a malicious end user, a malicious tenant admin, a compromised hub, a vendor insider, a compromised KB author, the network path. Each invariant should name which it stops. | New (review B8). B1 found its gaps by writing the adversaries down. **2026-09-03 night:** the threat model was written (`2026-09-03-threat-model-v1.md`, adversaries A1–A11, gaps G1–G10; it generated H5, D152–D154 and OPEN-8) **but exists only as a chat artifact — not on disk anywhere under the user profile when the first-build-steps handover was applied.** **CLOSED 2026-09-03 (night): the file is at `../2026-09-03-threat-model-v1.md`.** Adversaries A1–A11 (A11, nation-state, is explicitly out of scope for v1 so that it is a decision rather than an omission), invariant coverage in §2, and ten unguarded pairs G1–G10 in §3. The two labels other rows in this register cite by name now resolve: **G3** is A10 versus the entire trust root (OPEN-8's adversary) and **G4** is A5 versus the model context (D162's forcing reason). |
| **OPEN-6** | **Human identity and authorisation for the hub.** Who logs in to approve a catalog, revoke a device, read audit, configure a tenant; SSO, roles, MFA, admin audit. Draft-and-approve is meaningless without it. | **Answered in outline by D152–D160 (2026-09-03):** five actors, vendor access as a time-boxed customer-enabled grant, three transcript-access tiers, break-glass local accounts, TOTP and admin-action audit from day one, step-up re-authentication, author ≠ approver, OIDC federation with the hub as relying party, and a schema that does not foreclose it. **RATIFIED AS A SET BY THE FOUNDER 2026-09-04** (§5.7), so the outline is settled and design can proceed — with D158 inert in Phase 1 and D202 (§5.7a) still proposed. **This row stays open:** an outline is not a design, and the rest of the list below is untouched. New (review B8). Also missing: key-compromise runbooks, observability and on-call, backup/restore, tenant offboarding, a device lab, clock tolerance, uninstall, DPA and subprocessor list, end-user notice text, accessibility, change-management integration, the billing model the metering must support, and liability record contents. Listed in review B8; not individually numbered here. |
| **OPEN-7** | **macOS mapping.** D65 maps device identity to Secure Enclave. Nothing maps MSI, the named pipe, SCM primitives or Win32 FFI (R-14). | New. Write the one-page mapping (pkg/MDM, XPC, launchd) before locking identity. |
| **OPEN-8** | **Build-pipeline integrity — blocks shipping standalone.** With standalone confirmed as a real configuration (D151), a vendor-signed installer has automatic reach to every standalone endpoint: the self-updater fetches and runs whatever carries our publisher signature from the pinned URL. A compromised build pipeline or signing key is therefore a fleet-wide code-execution path with no customer change process between it and the machine. **Promoted from "blocks a pilot" to "blocks shipping standalone."** D147 carries the EDR-derived signing requirements (RSA certificate, publisher rules, `%ProgramFiles%`); this is the adversary case those requirements exist for. | New 2026-09-03 (founder handover §1b). Belongs in the threat model (OPEN-5) as the compromised-vendor adversary; the handover cites it as the threat model's "G3" — **which now resolves: `../2026-09-03-threat-model-v1.md` §3 G3 is A10 versus the entire trust root.** Before D151 ships: signing-key custody (HSM or equivalent), attested or reproducible builds, two-person release, and a pinned-URL story a customer-hosted hub can mirror (D133). |
| **OPEN-9** | **Code-signing certificate purchase — in progress with Daniel Chow.** Blocks A6 (signed MSI), D151 (standalone self-updater) and OPEN-8 (build-pipeline integrity): nothing standalone can ship, and no publisher rule can be written for a customer's EDR, until the certificate exists. Requirements: **RSA** per D147 (App Control signer rules do not support ECDSA), and **cloud-HSM-backed rather than a USB token**, because two-party approval and an audit trail over signing operations are only possible at all when the key sits behind a service with its own access control and log. | New 2026-09-03 (first-build-steps handover, Task 4). Owner: founder, with Daniel Chow. The HSM requirement is what makes OPEN-8's "signing-key custody, two-person release" implementable rather than aspirational. **ESTIMATE 2026-09-04, from the founder: roughly ONE MONTH, and it may come sooner — so approximately 2026-10-04.** It is an estimate and not a commitment, and the analysis of 2026-09-04 §1 said that if the certificate is more than two weeks out then that number is what the Phase 1 schedule should be built around. **It is.** Three consequences worth stating rather than deriving: (1) **the pilot date is set by this row, not by any engineering decision** — EDR allowlisting cannot begin without a signed binary, and if that review takes weeks after one exists, the sequence is longer than B2 plus B3 combined; (2) **there is about a month of engineering runway that is NOT gated on it**, which is where B2, the pipe (D200–D201) and the endpoint `ask()` path fit, while B3's enrollment work (6–8 engineer-weeks per §9) does not; (3) **Q9 is now the thing on the critical path, not the certificate** — it is a prerequisite for identifying the EDR vendor at all, it can be answered in parallel during that month, and the EDR submission can be *prepared* while the certificate is outstanding even though it cannot be *submitted*. |
| **OPEN-10** | **"Not in the KB" and "not my remit" have stopped being the same thing** (D259/D261). With a KB that may hold anything, a cafeteria question on a tenant with no facilities content is **not** off-topic — it is a question the KB should have answered and did not, and that is a **gap record (D223)**, which is how the KB learns what it is missing. A decline and a gap are different outcomes and must not collapse into one reply. | New 2026-09-11. **Today they are kept apart by accident, not by design:** `offtopic` declines only 13 complete phrases (§5.44a) and everything else reaches the KB. That is a happy property of a narrow allowlist. **Settle this before anyone widens the allowlist**, or real work questions start being swallowed as off-topic and the KB stops learning what it lacks. |
| **OPEN-11** | **Customer-operable account recovery — blocks production (D268).** Today the only way back into a locked admin account is our CLI on the hub host: `admin.mjs reset`, `admin.mjs totp --user`, `admin.mjs audit`. A tenant owner at a customer has none of those, and on 2026-09-12 the founder needed an hour *with* them. Needs: a break-glass recovery a tenant completes alone (recovery codes at enrolment, or an emailed single-use link once D86 exists); a decision on whether the sign-in page may name the failed factor after a correct email (5.52a); reset semantics that say out loud that earlier resets are dead; and the recovery path in the click-through from a browser with a stale saved password. | New 2026-09-12 (founder). **Pre-production gate.** Owner: founder for the D156 posture question; engineering for the rest once B-item ordering allows. Until closed, the pilot agreement states that owner lockouts are resolved by us, by hand. |
| **OPEN-12** | **Retention of the ticket record — one decision, not a per-column sweep (D277).** `tickets.description` (the reporter's own words), `summary`, `what_was_checked`, `internal_resolution_note`, every `ticket_entries.body`, and the reporter's `users` row are all free-text PII with **no retention rule**. tenant/006 considered mirroring D229's 90-day sweep on entry bodies and refused: that would delete the half of the record the desk wrote and keep the half the reporter wrote. | **OPEN, 2026-09-12.** A decision for a customer's retention schedule and D127's disclosure wording (which still does not exist), made once for the record. Until then nothing in the ticket store is swept, and `migrations/tenant/006-ticket-timeline.sql`'s header says so. Not blocking any phase; blocking the first paying pilot alongside D86's email (plan v3 §6.3). |

---

## 8. Values left unset

Recorded so they are not invented by whoever writes the code first.

- `N` — consecutive heartbeat failures before entering offline (D51) — **proposed 3** (D132 table, 2026-09-03)
- Heartbeat interval (D50) — a capacity parameter (D115); **decide together with the access-token lifetime (D132)** — **proposed 60 s, jittered ±15 s** (D132 table)
- Access-token lifetime (D61) — **a security parameter: revocation latency equals it (D132, X-3)** — **proposed 5 minutes** (D132 table)
- Enrollment secret validity window (D81)
- Enrollment rate-limit thresholds and anomaly trigger (D83)
- Minimum telemetry set for customer-hosted support (D59c) — must include hub version (D107) and, per D131, broker version as attested by the broker
- Retrieval chunk budget per turn — drives input token cost; the only measured input figure is the 2,261-token shipped turn with no retrieval (D140)
- Consent TTL (120 s in the shipped `ConsentToken` and kept by the D130 design), freshness bound (H6 — still unset), replay window (**proposed 60 s with a server-supplied nonce**) and assertion clock-skew tolerance (**proposed ±120 s**) — D132 table; review B8 "clock and time"
- Session start definition and idle timeout (D137)

---

## 9. Estimate status

**The 8–14 engineer-week figure predates D42–D90 and should be rebuilt, not adjusted** (consolidated register §6, carried forward). Work now in scope and absent from that estimate: corpus ingestion, chunking, embedding pipeline and index maintenance (D42–D47, D144); retrieval API with per-user entitlement filtering (D43, D145); user identity entity, SCIM mapping and directory sync (D54–D58); a PII store with its own retention obligations (D58); session entity and analytics store (D75, D71); read-through ticket query with comment-visibility filtering (D68, D69); dashboard and reporting, two views, export and scheduling (D87, D88); outbound email (D86); the internal ticket store at whatever subset OPEN-4 defines (D73); a second ITSM record type for catalog requests (D79a).

**Two review corrections.** (1) Item 1 of the hub — device identity, enrollment, issuance, rotation, revocation — decomposes to roughly **6–8 engineer-weeks on its own** (review B7), three to four times the implied two. (2) D149 removes catalog distribution, release channels and the tenant policy engine from phase one, which is the only thing that brings the total back toward the original range. Re-estimate after D149 is decided, not before.

**Scope observation, carried forward.** Across the sessions producing D42–D90 the product moved from "endpoint agent plus a thin hub" to "endpoint agent, hub, knowledge platform, ticketing system and analytics product." Each addition was individually justified; the aggregate has never been re-estimated.

**THE FIRST EXTERNAL DATE IN THIS PROJECT, 2026-09-04: the code-signing certificate is roughly one
month out (≈2026-10-04), per the founder, and may come sooner.** OPEN-9 carries it. **This is the
schedule anchor, and it is not an engineering number** — every engineering estimate in this section
is measured in engineer-weeks of work, and this one is measured in waiting. The two do not add:
about a month of engineering fits inside the wait (B2, the pipe, the endpoint `ask()` path), and
B3's 6–8 engineer-weeks does not.

**What still has no date at all:** the EDR allowlisting review (cannot start without a signed
binary, and **Q9 is unanswered**, which is a prerequisite for identifying the vendor), the Anthropic
Scale tier (accrues by spend history rather than by payment, and nothing is accruing), and the
top-30 ticket categories (roughly seven weeks outstanding, and they gate *evaluating* Phase 1 rather
than building it). **Three of the four items on the critical path are therefore not engineering, and
none of the three has an owner with a date.**

---

## 10. Verification register

### 10.1 What the review answered (its §C.5, reproduced)

| Register §9 item | Answer | Where |
|---|---|---|
| `interaction` / `interaction_related_record` existence, fields, inheritance | Exist (plugin `com.glide.interaction`); fields documented by label; `interaction` almost certainly does **not** extend `task` `[VERIFY on instance]` | A2 Q1 |
| REST create for interaction — load-bearing | Table API `POST /api/now/table/interaction` with `interaction_agent`; dedicated API undocumented in practice | A2 Q1 |
| `task` base fields and inheritance | Documented list retrieved; `caller_id`, `category`, `incident_state` are not on it, confirming D77 (was D70) | A2 Q2 |
| `opened_by` vs `caller_id` | Confirmed (secondary sources only); set `caller_id` explicitly | A2 Q3 |
| `comments` vs `work_notes` — load-bearing | Confirmed: `work_notes` "viewable only by ITIL users"; read via `sys_journal_field` `element=comments`; deny `itil` to the integration account | A2 Q4 |
| KB read criteria evaluable server-side? | Declarative criteria yes, scripted criteria no; Microsoft's connector documents the same wall; per-user proxy via `/api/sn_km_api/knowledge/articles` | A2 Q5 |
| Licensed account per end user for own tickets? | KB reading is Requester activity (secondary sources); `[VERIFY]` against the order form | A2 Q5 |
| Restricted classes | HR, SecOps, GRC, Legal are `task` children in own scopes; never query `task`; legal table is `sn_lg_ops_request` | A2 Q6 |
| SCIM paths vs RFC 7643 | Confirmed and listed; ServiceNow is a SCIM server but pulling needs admin-equivalent `scim_admin`; be a SCIM provider instead | A2 Q7 |
| Per-token pricing | Haiku $1/$5, Sonnet 5 $2/$10, standing; Bedrock and Nova moot | A3 Q1 |
| Titan V2 hosted-only | Moot; Anthropic has no embeddings API; open-weight alternatives listed | A1 |
| db.t4g.micro us-east-1 | $0.016/hr, identical to us-east-2 | A4 Q1 |
| `max_connections` and pooler | ~80–90 usable; pooler not forced if pools capped; RDS Proxy $21.90/mo | A4 Q2 |
| pgvector on RDS | 0.8.2 on PG 15–18; HNSW; 2,000-dim index limit; micro holds one ~25k-chunk tenant | A1 Q5 |
| TPM signing latency (D61 premise "tens of ms") | Worse than the premise: medians 10–500 ms across firmware; P50 200 / P95 600 ms in Chrome telemetry. The token-exchange design is more necessary, not less | A5 Q1b |
| TPM prevalence and failure modes | Universal on Windows 11; ~30% Windows 10 residue (consumer-weighted); clear/re-image/swap = re-enrol; lockout survivable with no-authValue keys; cloned vTPMs duplicate identity | A5 Q1c–d |
| TLS inspection prevalence — strongest argument for D62 (was D55) | Prevalence unmeasured; unnecessary: Zscaler documents mutual TLS as unsupported under inspection, Palo Alto auto-excludes on client-auth failure, Microsoft exempts its own agents. D62 stands on documentation, not statistics | A5 Q2 |
| EDR allowlisting; do updates break hash exceptions | Yes by definition and Microsoft says so; use certificate/publisher rules; sign with RSA; keep binaries under `%ProgramFiles%` | A5 Q3 |
| RFC numbers (private-key JWT, DPoP, HTTP signatures) | RFC 7523 is private-key JWT client authentication; DPoP is RFC 9449; HTTP Message Signatures is RFC 9421 `[VERIFY: from memory; not retrieved in Part A]` | — |

### 10.2 Still unverified

- `[VERIFY]` GPU instance pricing for a 16 GB-resident model (R-7, D139) — not researched; the "order of magnitude above the Phase 1 budget" claim is reasoning from the $46/month total.
- `[VERIFY]` `interaction` not extending `task`; the Interaction Management API's behaviour; requester-vs-fulfiller licensing for KB reads — all against the design partner's instance and order form (D145).
- `[VERIFY]` PCP default for the TPM authorisation value (D146); ~~`WTSQueryUserToken` / `WTSQuerySessionInformation` as the SID route (D148)~~ — **verified 2026-09-03, §10.4, with a correction: the SID comes from the token, not from any WTS info class**; RFC 7523 / 9449 / 9421 numbers (cited from memory twice).
- `[VERIFY]` Voyage 4 hosted-plus-nano shared vector space — **still a vendor claim (D144, D199a). Corroborated 2026-09-04 only as a claim**: Voyage's own post says all four Voyage 4 models "produce compatible embeddings" and that query encoders upgrade "without re-vectorizing documents", and Hugging Face integration material repeats it. **Nobody outside Voyage has verified it and we have not.** The settling experiment is about an hour — embed with nano, query with hosted voyage-4, measure whether retrieval holds. Note also that the upgrade is asymmetric and query-side, and that nano's headline 2,048 dimensions exceed pgvector's 2,000-dimension HNSW limit (§10.1).
- ~~`[VERIFY]` that a standard user cannot write to a LocalSystem-hosted Node named pipe (D201)~~ — **measured 2026-09-04, §10.5. The blocker holds.** What is still unrun is the last mile: **a real LocalSystem service with a real standard-user agent**, which needs an elevated window. The DACL was read off a user-created pipe and the access check was exercised against a reproduction of it. Also still unchosen: koffi vs an N-API addon vs a small signed helper for the native calls, which interacts with D147.
- `[VERIFY]` **interactive embedding latency on 1–2 vCPU Fargate, for any candidate (unmeasured, and the input that would most change D199).** Arctic-embed-m-v2.0 was chosen at 305M partly because Qwen3-Embedding-0.6B's 509M–600M is the wrong risk to take against a number nobody has.
- `[VERIFY]` whether a seed-stage self-serve org can obtain Zero Data Retention (D141).
- `[VERIFY]` forced `tool_choice: any` returns 400 on the Fable/Mythos 5.1 tier (R-13) — from cached skill documentation, not a live page; irrelevant unless the certified model set changes.
- **B1 is run, on one machine, once, against an empty database** (D193–D197): 56 assertions pass on PostgreSQL 17.11 with pgvector in Docker. **Nothing has been applied to RDS**, to a non-empty schema, or under concurrency beyond the three-worker `SKIP LOCKED` check, and no latency, connection-behaviour or migration-timing figure exists. `server/docs/B1-CONTROL-PLANE.md` §10.
- **NARROWED 2026-09-04 (D207, §5.16): cross-encoder reranker options and sizes ARE NOW RETRIEVED. CPU VIABILITY IS NOT, and the reason it is harder than it looked is now understood.** Five candidates with licences, parameter counts, architectures and context lengths are in D207, drawn from TEI's supported-models table (TEI supports only four reranker types, which is the real shortlist) plus each model's card and `config.json`. **What remains `[VERIFY]`, and is the whole question: a cross-encoder's cost is per-query × PER-CANDIDATE, not per-query** — one forward pass per (query, chunk) pair, so ~20 passes of a ~300M model per question on 1–2 vCPU, roughly an order of magnitude more work than the embedder. **No latency measurement exists for any candidate on Fargate-class hardware**, and the mitigation may be architectural (rerank fewer candidates, or make the reranker managed-mode-only) rather than a model choice. Also still `[VERIFY]`: whether `bge-reranker-v2-m3` works under TEI (it is not named, but shares XLM-RoBERTa sequence classification with two that are).
- Still unconfirmed: **RRF's `k ≈ 60` convention** (D174) — B7a implements it as `RRF_K` with the `[VERIFY]` recorded at the constant (`server/src/kb/retrieve.js`); and pgvector HNSW index residency against `db.t4g.micro`'s 1 GB (D176) — §10.1 retrieved the `maintenance_work_mem` formula, but the residency claim is reasoning.
- **NEW 2026-09-04 (D203, §5.16): whether no GGUF of `arctic-embed-m-v2.0` exists BECAUSE of its custom `GteModel` architecture is inference, not retrieved.** The observable facts are retrieved (no `-m-v2.0` tag in Ollama's library; several community GGUFs of the L; the M's `auto_map` custom modeling files). The causal link is ours.
- `[VERIFY]` the claims in the KB architecture document's §3 that KCS v6 retrieval did **not** confirm: "capture in the workflow" as KCS's own phrasing, "reuse is review" as a KCS mechanism, and **findability beats volume** (which D173 rests on). §10.4 confirmed the article structure, the confidence-state names and the five-level audience attribute; it did not confirm these.
- **NEW 2026-09-11 (D256, §5.39i): Event 27's boot types `0x1` and `0x2` are unverified, and the question behind them is the reason the restart signal exists.** **NARROWED the same day by `npm.cmd run verify:boot-type`, which reads the WHOLE retained history rather than the newest event: `0x0` = full boot is now corroborated by 81 observations on this machine** (2026-07-16 → 2026-09-09) instead of one. **And the log carries the control the test needs:** three of the last twelve Event 1074s are a genuine *shutdown* or *power off* rather than a restart — the only actions that could produce a hybrid boot, since a restart is a full boot whatever the setting — and every boot after them is still `0x0`, which is exactly what `HiberbootEnabled = 0` should mean. **`0x1` and `0x2` remain unobserved, and the gap is now precisely stated: the same action, on a machine with Fast Startup ON.** Until then nothing may assert a cold-boot distinction anywhere a user reads it; the collector returns the raw value with `interpreted: false`, it carries no weight in the score, and no surface renders it. Also still unverified, and it is the half that decides the design: **whether `LastBootUpTime` resets across a Fast Startup shutdown** — if it does not, uptime survives the cycle and Event 27 is a REPLACEMENT for the uptime reading rather than a supplement to it. **A SESSION CANNOT FINISH THIS AND THAT IS STRUCTURAL, NOT A LIMIT OF EFFORT:** a hybrid boot needs a power-off followed by a power-on, and nothing runs between the shutdown and the hand that presses the button. `client/scripts/verify-boot-type.mjs` does both halves a machine can do — it reads the state before and the verdict after — and prints the four-step procedure, so settling this is a two-minute job for anyone with such a machine rather than a note nobody acts on.
- **NEW 2026-09-11 (D256, §5.39b): that `SystemTimeOfDayInformation.BootTime − BootTimeBias` equals `Win32_OperatingSystem.LastBootUpTime` is measured on ONE machine on one day.** It matched to the millisecond (1788996024500 both ways) and was cross-checked against `GetTickCount64()`, which resolved the raw value as the tick origin — but it is an identity in an undocumented structure and it is a hypothesis on any other machine. **Nothing depends on it being exact:** the difference was 7.6 seconds, against thresholds of 14 and 30 days and a row reading "2 days ago", so the failure mode is a row seconds out rather than a wrong recommendation. The raw kernel figure is kept alongside as `kernelBootTimeMs` so a future reader can re-derive it.
- **NEW 2026-09-11 (D256, §5.39j): every threshold in the restart score is an unsourced policy proposal, and the spec says so of itself.** There is no verified source establishing 30 days — or any figure — as an evidence-based restart interval. What would settle them is named and not done: **scoring recommendations against whether the restart actually resolved the ticket.** They are configurable defaults (`client/config.json`'s `restartPolicy`) rather than constants for exactly this reason, and `_restartPolicyNote` carries the caveat where the numbers are.
- ~~`[VERIFY]` Piper cannot adopt another engine's voice; its settings control delivery, not identity~~ — **RESOLVED 2026-09-11 (D264, §5.47b) against current documentation.** `SynthesisConfig` exposes `volume`, `length_scale`, `noise_scale`, `noise_w_scale`, `normalize_audio` and `speaker_id`: no pitch control, no cloning, no reference-audio conditioning. Corroborated by measurement — a 6-point grid over the two noise knobs moved the F0 span from 52 Hz to 57 Hz against a 136 Hz target. **Still open and still a question for Charles, not a session:** ElevenLabs' terms on using its output to train another TTS model, and its commercial terms for shipped product audio.
- **NEW 2026-09-11 (D259/D261, §5.44c): `prompt.js:22` still tells the model it is "an IT support assistant", and that is now a narrower scope than D259.** It was left alone deliberately, not missed: `prompt.js`'s own header says one definition shared by every provider is what makes the §4 bake-off measure the model rather than the wording, so editing the first line of the system prompt moves the baseline. **The question for whoever runs the bake-off: change it now and re-baseline, or change it when the bake-off next runs.** The second-order risk if it is left indefinitely is that the model is biased to treat a non-machine question as out of scope rather than to call `escalate`, which is the route to the KB. Not observed; reasoning.
- Every `[VERIFY]` inside the five Part A research reports' own "Unverified / could not find" lists (`sources/2026-09-02-fable-design-review.md`).

### 10.3 Measured — the only four measurements in the project

| What | Result | Where |
|---|---|---|
| Model bake-off | 5 models, 40 hand-written cases, one machine, one run pair; zero R2 false actions reach a user after two catalog preconditions and `whenNotToUse` | `../../client/docs/BAKEOFF-2026-09-02.md`, `../../client/eval/` |
| Shipped prompt prefix, `claude-haiku-4-5` | 2,104 tokens (system 319 + tools and overhead 1,784) against a 4,096 cache floor; full turn 2,261 | `../../client/docs/TOKEN-COUNT-2026-09-03.md`, `npm run count-tokens` |
| Bake-off **through the B0 hub** vs direct, `mistral-small:24b`, 40 cases, same session (D164) | **Identical on 40 of 40 cases** — same outcome and same proposed capability on every case; per-case latency delta median 1 ms (mean −67 ms, max +259 ms). Both 33/40 that session; the recorded §2b baseline is 35/40 and the two cases that moved (`net-09`, `prn-03`, correct → no tool call) moved identically on both paths, so the drift is the model's between Ollama sessions at temperature 0, not the hub's. Zero false actions reaching a user on all three runs. | `../../client/docs/BAKEOFF-2026-09-02.md` §2c; `client/eval/results/hub-2026-09-03.*` and `direct-2026-09-03.*` (gitignored, on this machine) |
| Prompt cache, `claude-sonnet-5`, live (D161) | Two identical shipped turns, 2026-09-03: first call `cache_creation_input_tokens` 2,412 / `cache_read_input_tokens` 0; second call 0 / 2,412; 389 uncached input tokens each; 86% of a 2,801-token prompt served from cache on the second call | `../../client/docs/TOKEN-COUNT-2026-09-03.md` §6, `npm run verify-cache` (two real calls; not in `npm test`) |

**Outstanding from the design partner, now five weeks:** top-30 L1 ticket categories by volume — every substantive question eventually points at it (B5); incident and `sys_user` fields as actually used including `u_` custom fields; whether they use Interaction Management and Virtual Agent; whether they run outbound TLS inspection (now moot for the mTLS decision, D146, still useful for the FQDN allowlist conversation).

---

### 10.3a Verified on a screen — the D130 renderer check (2026-09-03, night)

**The only thing in this project verified by a human looking at it**, and the only way this
particular guarantee can be verified at all: D130 exists to make the consent card show what the
broker rendered, and no headless test can see a screen.

| What | Result |
|---|---|
| A `flush_dns` card, reached through the app, explain panel opened, **approved**, executed | `outcome: "success"`, `detail: {"flushed": true}`, audit `2026-09-04T00:36:28.675Z` |
| All **eight displayed fields** against `consentRendered` — `title`, `what`, `detail`, `rollbackNote`, and `notice` / `undo` / `why` / `risk` in the explain panel | **Matched.** |
| `rollbackNote` is `null` for `flush_dns` | **No rollback line on the card.** The same session's `renew_dhcp` card did show one, and that capability's rollback is non-null — so the field is driven by the data, not by the renderer |
| Any string on the card not in `consentRendered` | **None**, other than the labelled "Why this, here" line, which is `proposal.reasoning` — the only model-authored text allowed there |

**Not verified, and not to be claimed:** §3 (supersede on screen — a superseded record was seen
incidentally in an earlier session, but the deliberate deny-then-ask-again sequence was never run;
the headless equivalent passes in `consent-surface.test.mjs` §5) and §4 (the expired nonce — not
attempted). Both are consent-layer and neither needs elevation.

Run by the founder on the development machine. Recorded in
`../../client/docs/D130-RENDERER-CHECK.md`, which states exactly what was and was not covered.

---

### 10.3b Verified on a screen — the panel click-through, re-run 2026-09-11 after the day's five decisions

The second entry in this section, and the first that a session ran rather than the founder. D254 (§5.37) drove
the real Electron window over the Chrome DevTools Protocol; this re-run does the same thing again after D255,
D256, D257, D258 and D248 had all landed, because **five decisions in one day had changed what is on that
screen** and the band had been through a further design delivery. Charles: *"run the click-through items you
can."* Procedure and per-item results: `../../client/docs/PANEL-RENDERER-CHECK.md`.

| What | Result |
|---|---|
| **39 checks in the real app**, against the real broker, the real probe and a live hub | **All 39 passed.** §1.2–1.5, §2.1/2.3, §3.1–3.6, §3a.1, §4.1/4.2/4.4/4.6, §4a.6, §7.1/7.1a/7.1b/7.3/7.4, §8, and D248's gloss on a real consent card |
| Contrast, **measured on the live window** rather than computed from tokens | reply 16.55:1, band value 16.55:1, band label 5.68:1, composer 13.64:1, the inspector's raw line 5.41:1 |
| D249 on a real machine — the name, the account and this machine's own addresses | **Shown, not said**, all four literals (`Wakanda`, `Charles`, `192.168.50.223`, `192.168.50.1`) |
| **Seven branches the real app cannot be made to take**, driven on `panel-check.html` | §4a.1 (a fix that did nothing), §4a.2 (needs the broker), §4a.3 (timed out), §5 (the offer rail), §6a.8 (cancelled), §6a.1/6a.7 (service desk unreachable), §6.5c/§6a.5–6a.7 (**sent, not confirmed**) — all as written |
| D253's three endings, distinguished on screen | unreachable → head *"Not sent"*, spoken *"I couldn't reach the service desk just now."*; timeout → head *"Sent, not confirmed"*, spoken *"I'm not sure that one got through."*, and a note that **claims neither that it was filed nor that it was not** |

**The finding, and it was in a tool.** `npm.cmd run show-consent` prints what the broker rendered and
kept, and §4.3 of the check compares the card against that output **field for field**. It listed eight fields
and D248 had added a ninth hours earlier, so `detailPlain` — the gloss that is the whole of D248 — was
absent from the one procedure written to catch a wrong value in it. **A field the script does not print is a
field the check cannot fail on.** Fixed, in the order the card draws it; a record written before D248 has no
such key and prints as absent, which is the honest reading of an older card.

**Recorded as COULD NOT OBSERVE, which is neither a pass nor a failure.** D253 writes `Sending…` on the
click and the caller overwrites it with the outcome. On the check page the canned bridge settles within a frame,
so the intermediate head is gone before it can be sampled; in the real app the branch needs a service desk that
is reachable and slow. Both outcomes either side of it were seen and the contract is pinned headlessly — but
**nobody has yet watched that word appear**, and this register does not round that up to a pass.

**Three of the run's failures were the driver's own**, and they are here because the next session will hit them:
`querySelector` returns the FIRST match while an earlier turn's consent card is still in the transcript
(§10.5's trap, hit twice in one run and caught both times); and **an unanswered consent card keeps the turn in
flight**, so every later step silently does nothing — the composer is correctly disabled throughout, which is
how you can tell it is the app behaving and not the app broken.

**Still the founder's, and a session cannot do any of them:** anything HEARD (§3a.3–3a.5, §8a.14), the first
frame on launch, the todo card (it needs this machine genuinely offline), and the elevated half of a fix
(§4.5, §7.2).


### 10.3c Verified on a screen — P4 and P5 in the real Electron window, 2026-09-12 (night)

Charles: *"run the electron click-through for p4 and p5"*. The third entry in this section and the second a
session ran. The hub was restarted on the current code first (the one serving 8787 predated every P4 commit).
Procedure and per-item results: `../../client/docs/PANEL-RENDERER-CHECK.md` §10 and §11; screenshots in
`../handovers/screenshots/2026-09-13-p4-p5-click-through/`.

| What | Result |
|---|---|
| **A REAL ticket, end to end, in the real app against the real hub and model** | Typed, offered, accepted, reviewed, sent: MD-1010, filed under the enrollment the app made at startup. The desk's reply, pick-up and resolution (the CLI, D224's same functions) each reached the transcript within one 30-second poll; the face stayed `idle`; the hub stamped every public entry `{seen}` after the app's ack. **The runner's auto-close fired through the hub's own runner** (job made due by SQL) and reached the app as *"closed on its own"* one second later |
| **Four findings, all in words the headless suites had passed** | (1) the band's note described the POLL, not the ROWS — *"with what the service desk showed"* over four rows the desk cannot match; (2) the spoken answer had the same gap; (3) a resolve produced TWO transcript lines for one fact (D245) because the desk writes a state change and a resolution together; (4) a state change was glossed by the ticket's state after the batch, not its own target. **All four fixed in `e068161` and re-verified live** — the fix to (1)/(2) is a shared clause the band and the voice carry character for character, pinned the way D242 pinned the limit clause |
| **Could not observe** | the taskbar flash (the protocol sees the page); anything HEARD; the console's P5 pages (no sign-in was made — a session may not create an account or enter a password; `admin-db` P5 reads their HTML) |
| **Observed, not changed** | the bust's *escalating* badge right after filing under a rail reading "Nothing in progress" (D232, pre-P4); update lines landing under the boot greeting on the first-run scene (D262, correct) |
| **A fact for the next session** | an ELEVATED agent on pre-P4 code was running the whole time, sharing `userData`; it is enrolled now without knowing it |

**The tenth straight click-through found something, and this one found four — all copy, all of the
same class**: a sentence true of the mechanism (the poll ran; the resolve happened) and false of the surface it
sat on (the rows it described; the line beside it). No test that reads strings could have caught any of them,
because every string was individually correct.

### 10.4 Verified 2026-09-03 (night) — the first-build-steps handover's Task 5, against primary sources

Retrieved live from the publishers' pages, with verbatim quotes on file (`Downloads\2026-09-03-claude-code-handover-first-build-steps.md` Task 5; working notes in the session scratchpad, findings recorded here). Nothing in this table is from memory.

| Claim checked | Verdict | What the sources say | Where |
|---|---|---|---|
| `WTSQueryUserToken` / `WTSQuerySessionInformation` as the broker's route to the interactive session's logon SID (D148, OPEN-1) | **Confirmed with one correction** | `WTSQueryUserToken` returns the session user's primary token; caller must run as LocalSystem with `SE_TCB_NAME`; "intended for highly trusted services". `WTSQuerySessionInformation` returns user and domain **as strings** (`WTSUserName`, `WTSDomainName`, `WTSSessionInfo`) — **no info class returns a SID**; the SID is `GetTokenInformation(TokenUser)` → `TOKEN_USER.User`. Console session: `WTSGetActiveConsoleSessionId` (winbase.h; 0xFFFFFFFF when none) or `WTSEnumerateSessions`. Session 0 isolation and `CreateProcessAsUser` (needs `SE_INCREASE_QUOTA_NAME`, may need `SE_ASSIGNPRIMARYTOKEN_NAME`; `lpDesktop = "winsta0\default"`; does not load the profile or build the environment block) are Microsoft's documented route for a service to run UI in the user's session — which also closes the design's §5 `[VERIFY]` on why the strong consent form is expensive. | learn.microsoft.com: `wtsapi32/nf-wtsapi32-wtsqueryusertoken`, `...-wtsquerysessioninformationw`, `ne-wtsapi32-wts_info_class`, `winbase/nf-winbase-wtsgetactiveconsolesessionid`, `securitybaseapi/nf-securitybaseapi-gettokeninformation`, `services/interactive-services`, `processthreadsapi/nf-processthreadsapi-createprocessasusera` |
| ONNX Runtime on ARM64 / Graviton for the embedder shortlist (review A1, D144) | **Confirmed — the pick need not change** | Official CPU builds for Linux aarch64 exist at v1.29.0 (2026-08-12): PyPI `onnxruntime` wheels `manylinux_2_28_aarch64` for cp311–cp314; GitHub asset `onnxruntime-linux-aarch64-1.29.0.tgz`; `onnxruntime-node` 1.29.0 README marks CPU on Linux arm64 supported. **No CUDA or WebGPU prebuilts for Linux arm64**; the onnxruntime.ai install page does not mention ARM64 at all — cite the artifacts, not the page. Quantization doc: the U8S8 saturation issue is x64-only; Arm dot-product instructions are the fast path. | pypi.org/project/onnxruntime/#files; github.com/microsoft/onnxruntime/releases (v1.29.0); registry.npmjs.org/onnxruntime-node/latest; js/node/README.md; onnxruntime.ai/docs/install/ (silent) |
| KCS v6 article structure and lifecycle states (D162; §3 of the missing KB schema document) | **Confirmed** | Structure: **Issue, Environment, Resolution, Cause (optional), Metadata**, plus an optional *Internal Resolution* hidden on externally visible articles. States, exactly: **"Work in Progress (WIP)", "Not Validated", "Validated", "Archived"**. Solve Loop practices 1–4 (Capture, Structure, Reuse, Improve); Evolve Loop 5–8 (Content Health, Process Integration, Performance Assessment, Leadership and Communication). Audience is **five levels** — Internal, Within a Domain, Partners, Customers, Public — not a binary. | library.serviceinnovation.org: KCS v6 Practices Guide, Techniques 2.1, 5.1, 5.2, 5.3 |
| Windows redo binding (generic KB) | **Confirmed: Ctrl+Y; Ctrl+Shift+Z is not Windows-wide** | Microsoft's "Keyboard shortcuts in Windows" lists **Ctrl+Y** for redo and contains no Ctrl+Shift+Z; the only Microsoft page documenting Ctrl+Shift+Z as redo is Visual Studio's (`Edit.Redo`). The v2 article's "Ctrl+Shift+Z in most other applications" was corrected in `docs/kb/generic-kb-v2.json`. | support.microsoft.com/.../keyboard-shortcuts-in-windows-dcc61a57-8ff0-cffe-9796-cb9706c75eec; learn.microsoft.com/visualstudio/ide/default-keyboard-shortcuts-in-visual-studio |
| macOS show-desktop (generic KB, out of scope for v2) | **Confirmed** | Apple: **Command–Mission Control, Fn-H, or Fn-F11**; top-row keys need Fn/Globe unless "Use F1, F2, etc. keys as standard function keys" is on; user-configurable in Keyboard settings. Command+F3 appears on no Apple page fetched. | support.apple.com/en-us/102650; Mac User Guide (Mission Control; function keys) |

Still unverified after this pass: everything else in §10.2, and every remaining row and step of the generic KB (`docs/kb/README.md`).

---

### 10.5 Measured 2026-09-04 — the named-pipe DACL blocker (D201)

**Run, not cited.** `npm.cmd run verify:pipe` from `client/`
(`../../client/scripts/verify-pipe-security.ps1`). Windows 11 26200, Node 24.19.0, unelevated
`WAKANDA\Charles`.

**Part 1 — the DACL Windows actually gives a Node pipe**, read via `GetSecurityInfo` on a handle
(`GetNamedSecurityInfoW` with `SE_FILE_OBJECT` returns ERROR_INVALID_PARAMETER for a `\\.\pipe\`
path; a pipe is a kernel object and needs `SE_KERNEL_OBJECT`):

```
O:<creator>D:(A;;FA;;;SY)(A;;FA;;;BA)(A;;FA;;;<creator>)(A;;FR;;;WD)(A;;FR;;;AN)
```

| Principal | Mask | Decoded |
|---|---|---|
| LocalSystem, Administrators, creator owner | `0x001F01FF` | full control |
| **Everyone** | **`0x00120089`** | READ_DATA, READ_ATTRS, READ_CONTROL, SYNCHRONIZE — **no WRITE_DATA** |
| **Anonymous Logon** | **`0x00120089`** | the same |

This matches Microsoft's documented default exactly, and confirms the second half of the finding
too: **anonymous logon gets read access**, while libuv omits `PIPE_REJECT_REMOTE_CLIENTS` — a
pre-authentication surface on what would be a privileged service.

**Part 2 — the access check.** That exact DACL rebuilt with **no ace for the caller**, mirroring a
LocalSystem-created pipe, then opened from an unelevated token:

| Requested access | Result |
|---|---|
| `GENERIC_READ` | **ALLOWED** |
| `GENERIC_WRITE` | **REFUSED — ERROR_ACCESS_DENIED** |
| `FILE_WRITE_DATA` | **REFUSED — ERROR_ACCESS_DENIED** |
| `GENERIC_READ \| GENERIC_WRITE` | **REFUSED — ERROR_ACCESS_DENIED** |

**Conclusion: D201's blocker is real.** A request/response protocol cannot run on a pipe the
LocalSystem broker creates through `node:net` — the agent can connect and never speak.

**What this is not.** The pipe whose DACL was read was created by a normal user, so its creator ace
names that user; the load-bearing ace is Everyone's, which is identical either way, and the
LocalSystem case only merges the creator ace into `SY`. The access check ran against a
*reproduction*. **A real LocalSystem service with a real standard-user agent has still never been
tried** — that is §10.2's remaining line and it needs an elevated window.

**Two bugs in the verification itself**, recorded because both produced a confident wrong answer that
looked right. Passing `\\.\pipe\name` through bash ate the backslashes and produced an `EACCES`
indistinguishable from the finding being sought — **a false positive for the correct conclusion**. And
a PowerShell helper that emitted status strings *and* returned a boolean put both on the pipeline, so
the caller captured an array, every array is truthy, and the verdict silently inverted to "the write
was ALLOWED". Neither was caught by the answer looking wrong.

**Also observed:** the `FILE_READ_DATA` line in part 2 reports win32 **231 = ERROR_PIPE_BUSY**, not an
access failure — the preceding successful open consumed the single listening instance. It is noise,
and the script now says so, because a reader would otherwise take it for a permission result.

---

## 11. How to add to this register

1. Take the next free ID (**D286 onward**, as of 2026-09-12 — D232–D235 are taken, §5.27; **D236–D239 are taken by the hub-side retrieval-mode / live-health / sessions-and-outcomes work of the same day and are NOT YET SECTIONED in this file**, so read commits `b5d9cf7` and `24f8f3e` before assuming they are free; D240–D243 are taken, §5.28 (D242 ratified 2026-09-11, §5.43); D244–D245 are taken, §5.29; D246 is taken, §5.30; D247–D248 are taken, §5.31 (D248 built 2026-09-11, §5.42); D249 is taken, §5.32; D250 is taken, §5.33; D251 is taken, §5.34; D252 is taken, §5.35; D253 is taken, §5.36; D254 is taken, §5.37; D255 is taken, §5.38; D256 is taken, §5.39; D257 is taken, §5.40; D258 is taken, §5.41; D259–D261 are taken, §5.44; D262 is taken, §5.45; D263 is taken, §5.46; D264 is taken, §5.47; D265 is taken, §5.48; D266 is taken, §5.50; D267 is taken, §5.51; D268 is taken, §5.52; D269–D271 are taken, §5.53 — D271 is the OPEN deployment-topology gate; **D272–D277 are taken, §5.54**, all PROPOSED — the P1 handover's "D244/D256" were void and became D275/D276; **D278–D280 are taken, §5.55**, all PROPOSED — the plan's "D246/D247" became D278/D279; **D281 is taken, §5.56**, PROPOSED — the P3a handover said *"use D281 onward"* and this file agreed; **D282–D285 are taken, §5.57**, all PROPOSED, and **D271 is DECIDED** there). Never reuse, never renumber. **The 2026-09-12 ticket-lifecycle plan (v1, the analysis, v2, v3) and its P0 handover numbered their own content D244–D259; every one of those IDs was already taken here and all of them are void — §5.53a maps the two that were built.** IDs D130–D168 that appear in the two parallel documents named in §0 are void — §5.6 and §5.11a map them onto this file. **Two IDs are cited in this file but were never defined (`D46b`, `D52a`); §5.11b says what to cite instead. Do not back-fill them.**
2. One row: decision, status (*done* / *decided* / *proposed* / *rejected*), source and forcing reason. A decision without a forcing reason is an opinion.
3. If it amends an earlier decision, say so in both rows.
4. If it depends on an unverified claim, tag `[VERIFY]` inline and add it to §10.2.
5. Update `PROJECT_START_HERE.md` only if the status table changes; that file is an index, not content.
