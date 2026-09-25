// WebGLEngine/tools/ship/exitBusy-selfcheck.mjs -- v4669
//
// *** THE FIRST INSTRUMENT THIS ROUND BUILT MEASURED ZERO, AND THE ROW THAT SAYS SO IS THE POINT OF THIS FILE. ***
//
// The screen exists because v4663 drew its population by asking DOES THIS GATE COMPILE A WASM MODULE -- a CAUSE
// -- when the defect (libuv's UV_HANDLE_CLOSING assert on a Windows process.exit()) is a SYMPTOM: queued
// main-thread work at the instant of teardown. The obvious instrument is a `node --require` hook that patches
// process.exit, parks the main thread with Atomics.wait for 300 ms and reads process.cpuUsage() across the park.
// It needs no source edit and exits exactly where the gate said to. IT REPORTS ~0.1 ms FOR EVERY GATE, including
// all four the rig has actually crashed on, because the work is ON THE MAIN THREAD and parking the main thread
// forbids the work it is trying to measure.
//
// That hook is not in the tree. This gate proves live, on a gate known busy, that it WOULD have measured zero --
// so the next person who reaches for it sees the number rather than the paragraph.
"use strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import * as EB from "./exitBusy.mjs";

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const report = (l) => console.log("  ----  " + l);
console.log("exitBusy-selfcheck -- the population was drawn by a cause, and the first fix for that measured zero\n");

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "exitbusy-"));
const write = (name, body) => { fs.writeFileSync(path.join(TMP, name), body); return name; };

// ---- 1. WHICH GATES CAN BE SCREENED AT ALL, AND THE ONES THAT CANNOT ARE COUNTED -------------------------
console.log("1. *** THE ELIGIBLE SHAPE, AND THE GAP NAMED AS A NUMBER ***");
{
    ok("a terminal process.exit() is recognised WITH the verdict expression it carries",
        (() => { const t = EB.terminalExit("console.log(1);\nprocess.exit(fail ? 1 : 0);\n");
                 return t && t.kind === "process.exit" && t.expr === "fail ? 1 : 0"; })(),
        "the expression matters: the patched copy has to exit with the GATE'S OWN verdict, or the screen would " +
        "report every gate as passing");
    ok("...and so is the converted form, so the two populations stay comparable",
        (() => { const t = EB.terminalExit("x\nprocess.exitCode = fails ? 1 : 0;\n");
                 return t && t.kind === "process.exitCode" && t.expr === "fails ? 1 : 0"; })());
    ok("...and a gate that just falls off the end is NOT screenable, and says so rather than reading quiet",
        EB.terminalExit('console.log("all checks pass");\n') === null,
        "a gate with no exit call cannot trip this crash at all -- that is the SAFE shape, not an omission");

    const all = EB.allGates();
    const term = all.filter((g) => { try { return !!EB.terminalExit(fs.readFileSync(path.join(EB.ENG, g), "utf8")); }
                                     catch { return false; } });
    ok("!! *** the screenable population is reported as a fraction of the whole, not as the whole ***",
        all.length > 1000 && term.length < all.length && term.length > 0,
        `${term.length} of ${all.length} gates end in a terminal exit statement. THE OTHER ${all.length - term.length} ` +
        "ARE NOT SCREENED BY THIS FILE. Most of them fall off the end and are safe by construction; a gate that " +
        "exits from inside a branch is a real gap and is inside that number");
}

// ---- 2. THE MEASUREMENT, DRIVEN BOTH WAYS -------------------------------------------------------------------
console.log("\n2. *** A BUSY GATE AND A QUIET ONE, BOTH SYNTHETIC, SO THE LINE CAN BE SHOWN TO SEPARATE THEM ***");
{
    // Queue real main-thread work and then "exit": a chain of resolved promises each doing arithmetic. It runs
    // only when the loop turns, which is exactly the property.
    const BUSY = write("busy-selfcheck.mjs", `
let sink = 0;
for (let i = 0; i < 400; i++) {
    Promise.resolve().then(() => { for (let j = 0; j < 400000; j++) sink += Math.sqrt(j % 977); });
}
console.log("queued");
process.exit(0);
`);
    const QUIET = write("quiet-selfcheck.mjs", 'console.log("nothing queued");\nprocess.exit(0);\n');

    const b = EB.measure(BUSY, { cwd: TMP, capMs: 60000 });
    const q = EB.measure(QUIET, { cwd: TMP, capMs: 60000 });
    report(`busy  win1=${b.ok ? b.win1Ms.toFixed(1) : "?"} win2=${b.ok ? b.win2Ms.toFixed(1) : "?"} parked=${b.ok ? b.parkedMs.toFixed(1) : "?"}`);
    report(`quiet win1=${q.ok ? q.win1Ms.toFixed(1) : "?"} win2=${q.ok ? q.win2Ms.toFixed(1) : "?"} parked=${q.ok ? q.parkedMs.toFixed(1) : "?"}`);

    ok("!! *** work queued at the exit line reads BUSY ***", b.ok && EB.classify(b) === "busy",
        b.ok ? `win1 ${b.win1Ms.toFixed(1)} ms against win2 ${b.win2Ms.toFixed(1)} ms -- a BURST that one turn of ` +
               "the loop drains, which is the state process.exit() destroys mid-flight" : "UNKNOWN: " + b.why);
    ok("!! *** and a gate with nothing queued reads QUIET, so the line is a line and not a rubber stamp ***",
        q.ok && EB.classify(q) === "quiet",
        q.ok ? `win1 ${q.win1Ms.toFixed(1)} ms, under the ${EB.FLOOR_MS} ms floor` : "UNKNOWN: " + q.why);

    // *** THE ROW THE WHOLE FILE IS FOR. *** Same process, same instant, the parked window beside the awaited one.
    ok("!! *** THE Atomics.wait WINDOW READS ~ZERO ON THE SAME GATE THE AWAITED WINDOW READS BUSY ***",
        b.ok && b.parkedMs < 5 && b.win1Ms > 5 * Math.max(b.parkedMs, 0.1),
        b.ok ? `awaited ${b.win1Ms.toFixed(1)} ms vs PARKED ${b.parkedMs.toFixed(1)} ms, one process, one instant. ` +
               "Atomics.wait parks the main thread, so the queued main-thread work CANNOT RUN -- a window that " +
               "forbids the work measures its absence. This is why there is no --require hook in this tree, and " +
               "the number is here so that is not something the next reader has to rediscover."
             : "UNKNOWN: " + b.why);

    // A STEADY cost is a DIFFERENT animal and must not land on the same list. An unref'd interval burning CPU
    // every window gives win1 ~= win2, both high.
    const STEADY = write("steady-selfcheck.mjs", `
let sink = 0;
const t = setInterval(() => { for (let j = 0; j < 300000; j++) sink += Math.sqrt(j % 977); }, 10);
t.unref();
console.log("steady");
process.exit(0);
`);
    const st = EB.measure(STEADY, { cwd: TMP, capMs: 60000 });
    report(`steady win1=${st.ok ? st.win1Ms.toFixed(1) : "?"} win2=${st.ok ? st.win2Ms.toFixed(1) : "?"}`);
    ok("!! ...and a STEADY cost is classified apart from a burst rather than swept in with it",
        st.ok && st.win1Ms >= EB.FLOOR_MS && EB.classify(st) === "steady",
        st.ok ? `win1 ${st.win1Ms.toFixed(1)} ms AND win2 ${st.win2Ms.toFixed(1)} ms -- both over the floor, so the ` +
                "work was never queued-and-drained. Calling that a teardown hazard would put the wrong gates on " +
                "the list, which is the same defect as the population this round is repairing"
              : "UNKNOWN: " + st.why);

    // The verdict travels. A screen that reported every gate green would be worse than no screen.
    const RED = write("red-selfcheck.mjs", 'console.log("failing on purpose");\nprocess.exit(7);\n');
    const r7 = EB.measure(RED, { cwd: TMP, capMs: 60000 });
    ok("!! *** the patched copy exits with the GATE'S verdict, not the probe's ***",
        r7.ok && r7.exitCode === 7, `exit ${r7.ok ? r7.exitCode : "?"} -- the copy is a measurement of the gate, so ` +
        "it has to be able to come back red");
}

// ---- 2b. THE PROBE TEXT, THE BASELINE RUN AND THE MARKER, EACH DRIVEN ---------------------------------------
console.log("\n2b. *** THE PROBE IS A STRING THIS FILE BUILDS, SO IT IS GRADED AS ONE ***");
{
    const probe = EB.probeFor("fail ? 1 : 0", 250);
    ok("!! probeFor CARRIES THE GATE'S VERDICT EXPRESSION into the copy's own exit",
        probe.includes("process.exit(fail ? 1 : 0)") && !/process\.exit\(0\)\s*;\s*$/.test(probe.trim()),
        "a probe that hard-coded 0 would make every measured gate look green, which is the failure mode of a " +
        "screen that rewrites the program it measures");
    ok("...and the window length it was asked for, in BOTH awaited windows and the parked one",
        (probe.match(/250/g) || []).length === 3,
        "three windows, one number: a probe that took the default anyway would report a 300 ms reading under a " +
        "250 ms label");
    ok("...and it emits the marker this module looks for, so the two cannot drift apart",
        probe.includes(EB.MARKER) && probe.includes("win1") && probe.includes("win2") && probe.includes("parkedMs"),
        `MARKER is ${JSON.stringify(EB.MARKER)} -- all brackets, which is why measure() finds it with indexOf: ` +
        "the first spelling built a RegExp out of it and threw \"unterminated character class\" on every call");

    // *** baselineExit EXISTS BECAUSE THE PROBE PERTURBS THE TREE, AND THAT COST A FALSE RED. ***
    // While a gate's copy is on disk, a gate that WALKS THE TREE sees an extra .mjs beside the original.
    // tools/ship/wiringClaims-selfcheck.mjs came back BUSY and RED in the first screen for that reason alone.
    const RED7 = write("base7-selfcheck.mjs", 'process.exit(7);\n');
    const GREEN = write("base0-selfcheck.mjs", 'console.log("fine");\nprocess.exit(0);\n');
    ok("!! *** baselineExit reports the UNPATCHED gate's status, which is what tells a real red from mine ***",
        EB.baselineExit(RED7, { cwd: TMP, capMs: 20000 }) === 7 &&
        EB.baselineExit(GREEN, { cwd: TMP, capMs: 20000 }) === 0,
        "without it, a gate the instrument broke and a gate that was already broken are the same row");

    const wc = "tools/ship/wiringClaims-selfcheck.mjs";
    const m = EB.measure(wc, { capMs: 200000, withBaseline: true });
    ok("!! *** and `perturbed` FIRES ON THE REAL CASE: wiringClaims is green alone and red under the probe ***",
        m.ok && m.baseExitCode === 0 && m.exitCode !== 0 && m.perturbed === true,
        m.ok ? `baseline exit ${m.baseExitCode}, under the probe ${m.exitCode} -- it walks the tree, finds the copy ` +
               `and adjudicates it. *** AND THE CONSEQUENCE IS WORSE THAN A WRONG EXIT CODE, WHICH AN EARLIER ` +
               `VERSION OF THIS ROW GOT WRONG: *** it said the CPU reading was unaffected. It is not. A perturbed ` +
               `gate RUNS DIFFERENT CODE, and this one reads 0.5 / 12.2 / 17.7 ms over three runs -- BIMODAL, not ` +
               `noise round a mean (this run: ${m.win1Ms.toFixed(1)} ms). So a perturbed row is marked uncertain in ` +
               "the census and counted as evidence for nothing."
             : "UNKNOWN: " + m.why);
    ok("...and it does NOT fire on a gate the probe leaves alone, so it is not always true",
        (() => { const g = EB.measure(GREEN, { cwd: TMP, capMs: 20000, withBaseline: true });
                 return g.ok && g.perturbed === false; })(),
        "a flag that is set for every row names nothing");
    ok("...and it is undefined rather than false when no baseline was asked for, because UNASKED is not UNPERTURBED",
        EB.measure(GREEN, { cwd: TMP, capMs: 20000 }).perturbed === undefined);
}

// ---- 3. A MISSING READING IS UNKNOWN, NEVER QUIET -----------------------------------------------------------
console.log("\n3. *** THE ABSENCE OF A NUMBER IS NOT A NUMBER ***");
{
    // THE FIXTURE TOOK TWO TRIES, and the first one is the more interesting fact. A bare unsettled top-level
    // await does NOT hang: node prints "Detected unsettled top-level await" and EXITS 13 as soon as the loop
    // empties. So the first version of this row measured a gate that died instantly and reported "exited 13
    // before the probe" where it meant to report a cap kill -- the right class, by luck, for the wrong reason.
    // A timer is what actually holds the loop open, so the await never settles and the cap is what ends it.
    const PRE = write("prehang-selfcheck.mjs",
        'setInterval(() => {}, 50);\nawait new Promise(() => {});\nprocess.exit(0);\n');
    const h = EB.measure(PRE, { cwd: TMP, capMs: 2500 });
    ok("!! *** a gate killed at the cap is UNKNOWN and its reason names the cap ***",
        h.ok === false && /cap/.test(h.why || ""), `${h.why} -- v4663's own notes are about a screen that turned a ` +
        "missing measurement into a clean bill, and classify() returns 'unknown' for this row rather than 'quiet'");
    ok("...and classify() agrees, so the two cannot drift apart",
        EB.classify(h) === "unknown" && EB.classify(null) === "unknown");

    const THROWS = write("throws-selfcheck.mjs", 'throw new Error("before the probe");\n');
    const t = EB.measure(THROWS, { cwd: TMP, capMs: 20000 });
    ok("...and a gate that dies before the probe is UNKNOWN too, with its exit status in the reason",
        t.ok === false && EB.classify(t) === "unknown", t.why);
}

// ---- 4. THE COPY IS A FIXTURE AND IT DOES NOT SURVIVE -------------------------------------------------------
console.log("\n4. *** THE PROBE WRITES INTO THE TREE, SO IT HAS TO CLEAN UP AFTER ITSELF ***");
{
    const left = fs.readdirSync(TMP).filter((f) => f.endsWith(EB.COPY_SUFFIX));
    ok("!! *** no probe copy survives a measurement, including the ones that were killed and the one that threw ***",
        left.length === 0, `${left.length} left in the probe directory after six measurements, three of which did ` +
        "not finish normally. A stray copy is a fixture, and fixtureLitter is right to hunt them");

    const planted = path.join(TMP, "planted" + EB.COPY_SUFFIX);
    fs.writeFileSync(planted, "// a copy a killed run left behind\n");
    const gone = EB.sweepStrays(TMP);
    ok("...and the sweeper finds one a KILLED run left behind, which the finally block cannot",
        gone.length === 1 && !fs.existsSync(planted),
        "a SIGKILL skips the finally, so the sweep runs before and after a screen rather than trusting it");
    ok("...and it finds nothing on a clean tree, so it is not deleting by pattern alone",
        EB.sweepStrays(TMP).length === 0);
}

// ---- 5. THE ESTIMATE CARRIES ITS WIDTH ----------------------------------------------------------------------
console.log("\n5. *** A SAMPLE READ AS A CENSUS IS A NUMBER WITHOUT ITS PROVENANCE ***");
{
    const pool = Array.from({ length: 500 }, (_, i) => "g" + i + "-selfcheck.mjs");
    const a = EB.pickSample(pool, 40, 1), b = EB.pickSample(pool, 40, 1), c = EB.pickSample(pool, 40, 2);
    ok("!! the sample is SEEDED, so the next reader gets the same gates and can check the number",
        a.join() === b.join() && a.length === 40, "an unseeded sample makes every re-measurement a new experiment");
    ok("...and a different seed draws a different set, so the seed is doing something",
        c.join() !== a.join());
    ok("...and it draws WITHOUT replacement, or a 40-gate sample could be 12 gates counted twice",
        new Set(a).size === a.length);

    const wide = EB.wilson(6, 30), tight = EB.wilson(60, 300);
    ok("!! *** the interval WIDENS as the sample shrinks, which is the whole reason it is reported ***",
        Math.abs(wide.p - tight.p) < 1e-9 && (wide.hi - wide.lo) > 2 * (tight.hi - tight.lo),
        `same 20%: n=30 gives ${(100*wide.lo).toFixed(1)}-${(100*wide.hi).toFixed(1)}%, n=300 gives ` +
        `${(100*tight.lo).toFixed(1)}-${(100*tight.hi).toFixed(1)}%`);
    // NOT `=== 1`: wilson(20,20).hi comes out 0.9999999999999998 in double arithmetic, and an exact-equality
    // assertion on a derived float is a row that fails for a reason that has nothing to do with the property.
    // The property is that it does not exceed 1 or fall below 0, which is what is asserted.
    const top = EB.wilson(20, 20), bot = EB.wilson(0, 20);
    ok("...and it does not run off the end at the extremes",
        bot.lo === 0 && bot.hi > 0 && bot.hi < 1 && top.hi <= 1 && top.hi > 1 - 1e-9 && top.lo < 1 &&
        EB.wilson(0, 0).p === 0,
        `k=0,n=20 -> 0-${(100*bot.hi).toFixed(1)}%; k=n=20 -> ${(100*top.lo).toFixed(1)}-${(100*top.hi).toFixed(12)}%`);
}

// ---- 5b. A SINGLE READING NEAR THE FLOOR IS NOT A VERDICT ---------------------------------------------------
console.log("\n5b. *** THE INSTRUMENT'S OWN REPEATABILITY, MEASURED, BECAUSE THE FIRST PASS WAS WRONG BOTH WAYS ***");
{
    const C = path.join(EB.ENG, "tools", "ship", "exit-busy-census.json");
    let c = null; try { c = JSON.parse(fs.readFileSync(C, "utf8")); } catch {}
    ok("!! *** the census records that the classification is UNSTABLE near the floor, with the count ***",
        !!c && c.repeatability && c.repeatability.banded > 0 &&
        c.repeatability.classificationUnstableAcrossRuns > 0 &&
        c.repeatability.classificationUnstableAcrossRuns < c.repeatability.banded,
        c ? `${c.repeatability.classificationUnstableAcrossRuns} of ${c.repeatability.banded} gates in the ` +
            "3-20 ms band changed class between runs, while gates far from the floor in EITHER direction never " +
            "did. So membership is taken from a MEDIAN OF THREE in that band, not from the first reading"
          : "no census");
    ok("!! *** and it names the false positive AND the false negative, so the error is not only admitted in aggregate ***",
        !!c && Array.isArray(c.demoted) && c.demoted.length > 0 &&
        c.demoted.every((d) => /NOT a member/.test(d.why) && d.convertedAnyway === true) &&
        /FALSE NEGATIVE/.test(c.repeatability.finding) && /FALSE POSITIVE/.test(c.repeatability.finding),
        c ? `demoted: ${c.demoted.map((d) => d.gate).join(", ")} -- and lockstepDt went the other way, filed ` +
            "QUIET on one reading and converted here on a median. A screen that only ever over-reported would " +
            "be a safer error, and this one did both"
          : "");
    ok("...and the RATE survived the re-measurement even though the MEMBERSHIP did not, which is stated as such",
        !!c && /RATE survived/.test(c.repeatability.finding) && /MEMBERSHIP did not/.test(c.repeatability.finding),
        "one in, one out: the interval is unchanged and two of the names in it are different. Reporting only the " +
        "rate would have hidden that, and reporting only the names would have implied the rate moved");
    ok("!! ...and the perturbed rows are marked as evidence for NOTHING rather than quietly included",
        !!c && c.members.some((m) => m.perturbed === true && m.countedAsEvidence === false) &&
        /CPU reading is suspect/.test(c.repeatability.perturbationIsWorseThanAWrongExitCode || ""),
        c ? c.members.filter((m) => m.perturbed).map((m) => m.gate).join(", ") : "");
}

// ---- 6. THE LINE CARRIES ITS ARGUMENT -----------------------------------------------------------------------
console.log("\n6. *** THE THRESHOLD IS A READING OF A BOX, AND SAYS SO ***");
{
    const src = fs.readFileSync(path.join(EB.ENG, "tools", "ship", "exitBusy.mjs"), "utf8");
    ok("!! the floor and the ratio are stated with the measurements that chose them",
        /FLOOR_MS = 5/.test(src) && /RATIO = 5/.test(src) &&
        /0\.1-1\.1 ms/.test(src) && /7\.0 ms at the lowest/.test(src),
        "a bound with no argument behind it is the next thing somebody moves without one");
    ok("...and the disproven Atomics.wait instrument is recorded in the module, not only in this gate",
        /Atomics\.wait/.test(src) && /measures the absence of the work/.test(src),
        "the next reader reaches for that hook because it is the obvious design; the module is where they will " +
        "be looking");
}

try { fs.rmSync(TMP, { recursive: true, force: true }); } catch {}

console.log("\nunchecked here: WHETHER A BUSY GATE ACTUALLY CRASHES ON WINDOWS. unix/async.c has no " +
    "UV_HANDLE_CLOSING assertion, so the identical teardown is silent on this platform and no row above can go " +
    "red for the reason the screen exists. What is graded here is that the instrument separates a burst from a " +
    "quiet exit and from a steady cost, that a missing reading is UNKNOWN, and that the estimate carries its " +
    "width. THE RIG'S CLONE-VERIFY REMAINS THE INSTRUMENT FOR THE FACT.");
console.log(fails ? `\nexitBusy-selfcheck: ${fails} FAILED` : "\nexitBusy-selfcheck: all checks pass");
process.exitCode = fails ? 1 : 0;
