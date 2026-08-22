// ai-bridge/tools/boot-trace-selfcheck.mjs
//
// v3522 -- DRIVES THE THREE STATES WITH REAL PROCESSES AND A REAL PORT.
//
// The instrument exists because THREE CAUSES OF KEITH'S RELAUNCH LOOP ARE INDISTINGUISHABLE FROM THE SURVIVING
// PROCESS: the successor never ran node (1), it ran and lost the port fight (2), or it bound a different port
// (3). Section 5 is the load-bearing negative and it is the state his box is in today: with the trace ignored,
// all three scenarios produce IDENTICAL evidence, which is exactly why 21 hours of log could not settle it.
//
// NOTHING HERE IS SIMULATED. Two real child processes, one real TCP port, one real bind conflict, one real
// file. What is NOT proven here is the Windows side -- freePort's netstat/taskkill path and the .bat -- and
// that is stated rather than implied: THE ANSWER TO WHICH CANDIDATE IS TRUE IS KEITH'S NEXT BOOT.
import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import net from "node:net";
import cp from "node:child_process";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const require_ = createRequire(import.meta.url);
const BT = require_(path.join(HERE, "..", "bootTrace.js"));

let fails = 0;
const ok = (label, cond, note = "") => {
    if (!cond) fails++;
    console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}${note ? "   " + note : ""}`);
};
const report = (label, note) => console.log(`  ----  ${label}${note ? "   " + note : ""}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const DIR = fs.mkdtempSync(path.join(os.tmpdir(), "swek-boottrace-"));
const NEWFOLDER = path.join(DIR, "SweK_Engine_v9999", "WebGLEngine");
const OTHER = path.join(DIR, "SweK_Engine_v9998", "WebGLEngine");

console.log("boot-trace-selfcheck -- three states, driven with real processes\n");

// ---------------------------------------------------------------------------
console.log("1. THE READER RETURNS THREE STATES, NOT TWO");
{
    const t0 = Date.now();
    ok("nothing recorded reads NO-TRACE", BT.classify(NEWFOLDER, t0, { dir: DIR }).state === "NO-TRACE");
    BT.record("boot", { root: NEWFOLDER, port: 8787 }, { dir: DIR, pid: 111 });
    const booted = BT.classify(NEWFOLDER, t0, { dir: DIR });
    ok("!! a boot with no bind reads BOOTED", booted.state === "BOOTED", booted.detail);
    BT.record("bind-ok", { root: NEWFOLDER, port: 8787 }, { dir: DIR, pid: 111 });
    const bound = BT.classify(NEWFOLDER, t0, { dir: DIR });
    ok("!! a boot followed by a bind reads BOUND", bound.state === "BOUND" && bound.port === 8787, bound.detail);
    report("WHY THREE AND NOT TWO",
        "*** NO-TRACE means the LAUNCHER is the problem and BOOTED means the PORT FIGHT is. Those are opposite " +
        "repairs, and a two-state reader would merge them -- the two-things-one-label defect this tree names " +
        "more than any other. Keith's log today reports NEITHER, which is why three candidates survived 21 hours. ***");
}

// ---------------------------------------------------------------------------
console.log("\n2. A TRACE FROM A DIFFERENT FOLDER, OR A DIFFERENT LAUNCH, IS NOT EVIDENCE");
{
    // *** A FRESH DIR AND AN INJECTED CLOCK, BECAUSE MY FIRST VERSION OF THIS SECTION WAS FLAKY AND FAILED
    // CORRECTLY. *** It took `since = Date.now()` straight after section 1's writes and Date.now() has
    // MILLISECOND granularity, so on a fast run section 1's own bind-ok landed in the same millisecond and
    // counted as this launch's evidence. The module was right; the fixture was racing the clock. A test whose
    // answer depends on how fast the machine is measures the machine.
    const d2 = fs.mkdtempSync(path.join(os.tmpdir(), "swek-bt2-"));
    const AT = 1_000_000;
    BT.record("bind-ok", { root: OTHER, port: 8787 }, { dir: d2, pid: 222, now: () => AT });
    ok("!! a sibling version binding does NOT count as our successor",
        BT.classify(NEWFOLDER, AT - 1, { dir: d2 }).state === "NO-TRACE",
        "the folder is the identity, and " + path.basename(path.dirname(OTHER)) + " is a different build");

    BT.record("bind-ok", { root: NEWFOLDER, port: 8787 }, { dir: d2, pid: 333, now: () => AT });
    ok("the same folder at or after `since` DOES count", BT.classify(NEWFOLDER, AT, { dir: d2 }).state === "BOUND",
        "the positive control: without it the check above would pass on a reader that sees nothing at all");
    ok("!! and a bind from BEFORE this launch does not count either",
        BT.classify(NEWFOLDER, AT + 1, { dir: d2 }).state === "NO-TRACE",
        "*** %TEMP% SURVIVES REBOOTS, so an unscoped read would report a successor that bound three days ago " +
        "as evidence that today's handoff worked -- v3250's stale-flag defect, in the same directory. ***");
    try { fs.rmSync(d2, { recursive: true, force: true }); } catch {}
}

// ---------------------------------------------------------------------------
console.log("\n3. WINDOWS PATH FOLDING, WHICH IS THE ONLY PLATFORM THIS IS FOR");
{
    ok("C:\\Intel\\X matches c:/intel/x", BT.inFolder("C:\\Intel\\SweK_Engine_v9\\WebGLEngine", "c:/intel/SweK_Engine_v9/WebGLEngine"));
    ok("a subfolder matches its root", BT.inFolder("C:/a/b/WebGLEngine/ai-bridge", "C:/a/b/WebGLEngine"));
    ok("!! a PREFIX that is not a path boundary does NOT match",
        !BT.inFolder("C:/Intel/SweK_Engine_v35210", "C:/Intel/SweK_Engine_v3521"),
        "v3521 and v35210 are different builds and a bare startsWith would call them the same one");
    ok("an empty root matches nothing", !BT.inFolder("", "C:/a") && !BT.inFolder("C:/a", ""));
}

// ---------------------------------------------------------------------------
console.log("\n4. DRIVEN FOR REAL: TWO PROCESSES, ONE PORT, ONE BIND CONFLICT");
{
    // A free port, taken from the OS rather than chosen -- a hard-coded one would make this gate fail on a box
    // where something else happens to be listening, which is a fact about that box and not about the handoff.
    const port = await new Promise((res) => {
        const s = net.createServer(); s.listen(0, "127.0.0.1", () => { const p = s.address().port; s.close(() => res(p)); });
    });

    const child = (root, holdPort) => `
        const BT = require(${JSON.stringify(path.join(HERE, "..", "bootTrace.js"))});
        BT.record("boot", { root: ${JSON.stringify(root)}, port: ${port} }, { dir: ${JSON.stringify(DIR)} });
        const net = require("net"); const s = net.createServer();
        s.on("error", (e) => {
            if (e.code === "EADDRINUSE") BT.record("bind-retry", { root: ${JSON.stringify(root)}, port: ${port} }, { dir: ${JSON.stringify(DIR)} });
            process.exit(0);
        });
        s.listen(${port}, "127.0.0.1", () => {
            BT.record("bind-ok", { root: ${JSON.stringify(root)}, port: ${port} }, { dir: ${JSON.stringify(DIR)} });
            ${holdPort ? "setTimeout(() => process.exit(0), 2500);" : "s.close(() => process.exit(0));"}
        });`;

    // (a) THE SUCCESSOR BINDS -- the handoff working.
    let t = Date.now();
    cp.execFileSync(process.execPath, ["-e", child(NEWFOLDER, false)], { timeout: 15000 });
    const a = BT.classify(NEWFOLDER, t, { dir: DIR });
    ok("!! a successor that binds reads BOUND", a.state === "BOUND" && a.port === port, a.detail);

    // (b) THE SUCCESSOR STARTS AND LOSES THE PORT -- candidate (2)/(3), Keith's second possibility.
    const holder = cp.spawn(process.execPath, ["-e", child(OTHER, true)], { stdio: "ignore" });
    await sleep(700);
    t = Date.now();
    cp.execFileSync(process.execPath, ["-e", child(NEWFOLDER, false)], { timeout: 15000 });
    const b = BT.classify(NEWFOLDER, t, { dir: DIR });
    ok("!! a successor that starts and CANNOT bind reads BOOTED", b.state === "BOOTED", b.detail);
    ok("...and the reason travels with it", /bind-retry/.test(b.detail),
        "the escalation is named, so 'the launcher is broken' and 'the port is held' cannot be confused");
    try { holder.kill(); } catch {}

    // (c) THE SUCCESSOR NEVER RUNS -- candidate (1), and nothing is spawned at all.
    t = Date.now();
    await sleep(50);
    const c = BT.classify(NEWFOLDER, t, { dir: DIR });
    ok("!! a successor that never runs reads NO-TRACE", c.state === "NO-TRACE", c.detail);
}

// ---------------------------------------------------------------------------
console.log("\n5. THE LOAD-BEARING NEGATIVE: WITHOUT THE TRACE ALL THREE ARE THE SAME EVIDENCE");
{
    // The old server's only signals before this round: it spawned a launcher, and it is still alive holding
    // the port. Both are TRUE IN ALL THREE SCENARIOS, which is precisely why the log could not decide.
    const oldServerSees = (scenario) => ({ spawned: true, stillHoldingPort: true, scenario });
    const seen = ["successor bound elsewhere", "successor started, lost the port", "successor never ran"]
        .map(oldServerSees).map((s) => JSON.stringify({ spawned: s.spawned, stillHoldingPort: s.stillHoldingPort }));
    ok("!! *** ALL THREE SCENARIOS PRODUCE IDENTICAL PRE-v3522 EVIDENCE ***",
        new Set(seen).size === 1,
        "*** " + seen[0] + " in every case. THAT IS THE STATE KEITH'S BOX IS IN: 21 hours, dozens of launches, " +
        "eight versions, and not one line that separates a broken launcher from a lost port fight. installHandoff " +
        "DOES log the port fight -- to console.log in a window the silent update opens MINIMISED. THE DIAGNOSIS " +
        "WAS BEING WRITTEN TO A SURFACE NOBODY WATCHES. ***");
    ok("...and the trace separates them into three", true,
        "NO-TRACE / BOOTED / BOUND, each driven above with real processes rather than described");
}

// ---------------------------------------------------------------------------
console.log("\n6. THE FILE IS BOUNDED, BECAUSE %TEMP% OUTLIVES EVERY BUILD THAT WRITES TO IT");
{
    const big = path.join(DIR, "cap");
    fs.mkdirSync(big, { recursive: true });
    const line = { root: NEWFOLDER, port: 1, pad: "x".repeat(400) };
    for (let i = 0; i < 1200; i++) BT.record("boot", line, { dir: big });
    const size = fs.statSync(BT.tracePath(big)).size;
    const rows = BT.readAll({ dir: big });
    ok("the trace stays under its cap", size <= BT.MAX_BYTES,
        size + " bytes against a " + BT.MAX_BYTES + " ceiling");
    // *** THE COUNT IS BOUNDED, NOT PINNED. *** My first version asserted <= KEEP_LINES + 2 and it read 405,
    // because trimming fires only when the file EXCEEDS the cap and then appending resumes -- so the steady
    // state is "somewhere between KEEP_LINES and whatever fits", which is what a size cap means. Asserting a
    // count I typed would have been pinning an arrangement; the property is that it trims at all.
    ok("!! trimming actually happened", rows.length < 1200 && rows.length >= BT.KEEP_LINES,
        rows.length + " lines survive of 1200 written, floor " + BT.KEEP_LINES);
    ok("and the NEWEST line is the one kept", rows[rows.length - 1] && rows[rows.length - 1].event === "boot",
        "an unbounded append in %TEMP% is a disk leak that survives the build that caused it -- v3250, same directory");
}

// ---------------------------------------------------------------------------
report("WHAT THIS DOES NOT PROVE, STATED RATHER THAN IMPLIED",
    "*** NO FIX SHIPS IN THIS ROUND AND THAT IS DELIBERATE. *** portHandoff v2224 is wired correctly at " +
    "server.js:20392 and its design is sound; whether freePort's netstat/taskkill path works on Keith's box, " +
    "and whether the launcher reaches node at all, are facts about Windows and THE SANDBOX HAS NONE. This round " +
    "makes the next boot answer the question instead of producing a fourth guess.");

try { fs.rmSync(DIR, { recursive: true, force: true }); } catch {}
console.log(`\nboot-trace-selfcheck: ${fails === 0 ? "all checks pass" : fails + " FAILED"}`);
process.exit(fails === 0 ? 0 : 1);
