#!/usr/bin/env node
/**
 * Start the hub in DEVELOPMENT MODE: the admin console asks for email and password only, no
 * authenticator code (D267). Nothing else differs from `npm start`.
 *
 * Why a script and not "set the variable yourself": on 2026-09-12 the bypass had been built for a
 * day and the founder was still typing six-digit codes, because `npm start` never sets it and the
 * variable's name is deliberately too long to remember. The mode has to be one command or it is not
 * a mode, it is a fact in a commit message.
 *
 * The password is still required. The hub still binds loopback only. The console shows the ugliest
 * banner it has while this is on. All of that is dev-bypass.js's job; this file only sets the switch.
 *
 * It runs `src/index.js` as a child with the variable set, rather than importing it: index.js
 * starts its server only when it is the main module, so an import starts nothing and exits 0
 * silently (observed 2026-09-12). A child with inherited stdio behaves exactly like `npm start`.
 *
 * Usage:  npm run start:dev
 */
import { spawn } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const child = spawn(process.execPath, [join(here, "..", "src", "index.js"), ...process.argv.slice(2)], {
  stdio: "inherit",
  env: { ...process.env, MATIC_ADMIN_INSECURE_NO_TOTP: "1" },
});
child.on("exit", (code, signal) => process.exit(code ?? (signal ? 1 : 0)));
for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => child.kill(sig));
