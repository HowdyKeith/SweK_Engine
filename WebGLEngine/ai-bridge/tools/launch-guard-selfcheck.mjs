// ai-bridge/tools/launch-guard-selfcheck.mjs -- v2223 -- proves the launch cooldown.
//   node ai-bridge/tools/launch-guard-selfcheck.mjs

import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";

const require = createRequire(import.meta.url);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const g = require(path.join(HERE, "..", "launchGuard.js"));

let pass = 0, fail = 0;
const ok = (n, c, x) => { (c ? pass++ : fail++); console.log(`${c ? "PASS" : "FAIL"}  ${n}${x ? "  -- " + x : ""}`); };
const sleep = (ms) => { const b = new Int32Array(new SharedArrayBuffer(4)); Atomics.wait(b, 0, 0, ms); };

const lock = path.join(os.tmpdir(), "swek-launchguard-selfcheck-" + Date.now() + ".lock");
try {
    ok("no lock -> not suppressed", g.shouldSuppress(undefined, lock) === false);
    ok("lockAge is Infinity with no lock", g.lockAgeMs(undefined, lock) === Infinity);

    g.markLaunch(2223, lock);
    ok("after markLaunch -> suppressed", g.shouldSuppress(undefined, lock) === true);
    ok("lock age is small right after mark", g.lockAgeMs(undefined, lock) < 2000);
    ok("lastLaunchedVersion reads the version", g.lastLaunchedVersion(lock) === 2223);

    // with a tiny cooldown, waiting past it lifts the suppression
    ok("still suppressed within a 50ms cooldown", g.shouldSuppress(undefined, lock, 50) === true);
    sleep(70);
    ok("no longer suppressed after the cooldown elapses", g.shouldSuppress(undefined, lock, 50) === false);

    g.clear(lock);
    ok("clear() removes the lock -> not suppressed", g.shouldSuppress(undefined, lock) === false && !fs.existsSync(lock));
} finally { try { fs.unlinkSync(lock); } catch {} }

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
