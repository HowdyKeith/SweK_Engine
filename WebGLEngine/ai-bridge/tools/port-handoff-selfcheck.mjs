// ai-bridge/tools/port-handoff-selfcheck.mjs -- v2224 -- proves the handoff logic.
//   node ai-bridge/tools/port-handoff-selfcheck.mjs

import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { EventEmitter } from "node:events";
import path from "node:path";

const require = createRequire(import.meta.url);
const HERE = path.dirname(fileURLToPath(import.meta.url));
// v3528 -- module scope: the trace sink is written inside one block and asserted in another.
const traced = [];
const ph = require(path.join(HERE, "..", "portHandoff.js"));

let pass = 0, fail = 0;
const ok = (n, c, x) => { (c ? pass++ : fail++); console.log(`${c ? "PASS" : "FAIL"}  ${n}${x ? "  -- " + x : ""}`); };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const O = { healAfterMs: 8000, maxMs: 25000 };

// ---- bindDecision tiers ----
ok("early -> retry (wait for the old server)", ph.bindDecision(1000, O) === "retry");
ok("just before heal window -> retry", ph.bindDecision(7999, O) === "retry");
ok("at heal window -> heal (free the port)", ph.bindDecision(8000, O) === "heal");
ok("mid window -> heal", ph.bindDecision(20000, O) === "heal");
ok("at max -> giveup", ph.bindDecision(25000, O) === "giveup");
ok("past max -> giveup", ph.bindDecision(40000, O) === "giveup");

// ---- freePort is best-effort and never throws on an idle port ----
{
    let n, threw = false;
    try { n = ph.freePort(59991, () => {}); } catch { threw = true; }
    ok("freePort() doesn't throw on an idle port", !threw && typeof n === "number", "returned " + n);
}

// ---- installHandoff wiring: EADDRINUSE schedules a bind retry; other errors don't ----
{
    const fake = new EventEmitter();
    let listenCalls = 0;
    fake.listen = () => { listenCalls++; };
    // huge windows so the decision stays "retry" (never heal/giveup during the test)
    // v3528 -- *** `trace` IS INJECTED, AND IT IS NOT TIDINESS. *** v3522 gave installHandoff a trace that
    // DEFAULTS to bootTrace.record(), which writes to <tmp>/swek_boot_trace.jsonl -- THE FILE AN OPERATOR
    // READS TO FIND OUT WHETHER A REAL AUTO-UPDATE HANDED OFF. Driving the EADDRINUSE path here wrote
    // `bind-retry` rows into it under THIS TREE'S OWN PATH, so every run of this gate planted a fake BOOTED
    // verdict about a build that was never launched by an update. NOBODY SAW IT UNTIL v3528 BUILT THE REPORT
    // -- which is the argument for front doors in one line: A DIAGNOSTIC NOBODY READS CANNOT BE WRONG OUT LOUD.
    ph.installHandoff(fake, 8787, { log: () => {}, healAfterMs: 9e9, maxMs: 9e9, trace: (ev, f) => traced.push([ev, f]) });
    ok("handoff attaches exactly one error listener", fake.listenerCount("error") === 1);

    fake.emit("error", { code: "EADDRINUSE" });
    await sleep(1150);
    ok("EADDRINUSE schedules a bind retry", listenCalls >= 1, listenCalls + " listen call(s)");

    const before = listenCalls;
    fake.emit("error", { code: "ESOMETHINGELSE", message: "unrelated" });
    await sleep(60);
    ok("a non-EADDRINUSE error does NOT retry the bind", listenCalls === before);
}

// v3528 -- A GATE MUST NOT WRITE INTO THE ARTEFACT AN OPERATOR READS.
{
    const BT = require(path.join(HERE, "..", "bootTrace.js"));
    const mine = BT.readAll().filter((r) => /port-handoff-selfcheck/.test(String(r.root || "")));
    ok("!! this gate leaves NO rows in the real boot trace", mine.length === 0,
        "it traces into an injected array instead (" + traced.length + " events captured), so a fixture cannot " +
        "plant a verdict about a build no update ever launched");
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
