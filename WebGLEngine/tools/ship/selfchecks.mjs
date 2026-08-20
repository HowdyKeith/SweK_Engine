// WebGLEngine/tools/ship/selfchecks.mjs -- run every selfcheck in the tree, and make the gate care.
//
// THE HOLE. There were 89 files named *selfcheck*.mjs when this was written. Four were in the ship gate. The
// other 85 ran when somebody
// remembered, which is to say: when something had already gone wrong. Every one of them is a control that was
// written on purpose, by someone who had just been bitten, and then quietly stopped being run.
//
// A CHECK NOT IN THE GATE IS NOT BEING RUN.
//
// DISCOVERY, NOT A LIST. A hand-maintained list of 85 paths would be wrong within a week: the next selfcheck
// somebody writes would not be on it, and nobody would notice, because the absence of a check is invisible. This
// walks the tree. Write `foo-selfcheck.mjs` anywhere and it is gated from the next ship.
//
// EXCLUSIONS ARE NAMED AND MEASURED. Every skip below has a reason that was checked, not assumed, and the count is
// printed on every run -- so a growing skip list is visible rather than a quiet retreat. "It was failing so I
// excluded it" is how a suite becomes decoration.
//
// Run: node tools/ship/selfchecks.mjs [--verbose] [--timeout 30000]
"use strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const VERBOSE = process.argv.includes("--verbose");
// 60s, from measurement, not taste. The slowest real check is brain/rl/dock-hazard-selfcheck.mjs at ~19.4s
// standalone, with occlusion-bptt at ~18.2s and bz-pilot at ~17.7s behind it. A 30s budget looked generous and
// was not: all four of the slow ones passed standalone and TIMED OUT inside verify.mjs, where the machine is
// busier. That is a FALSE FAILURE, which is worse than no check -- a gate that cries wolf teaches you to ignore
// it, and an ignored gate is decoration with extra steps. 3x the slowest measured run is the headroom.
// v3212 -- THE BUDGET IS PER GATE AND IT IS DERIVED. The 60s here was 3x a measured 19.4s slowest run and was
// NEVER RE-DERIVED; by v3211 the slowest passing gate was 47.7s and EIGHT gates were being reported as failures
// for needing 63s to 280s. windTunnel missed by THREE SECONDS. The rule did not change -- nobody re-applied it.
// tools/ship/gateBudget.mjs holds the measurement each number comes from, so this can be contradicted rather
// than trusted. --timeout still overrides everything, for a caller who knows better than the table.
const OVERRIDE = process.argv.includes("--timeout") ? parseInt(process.argv[process.argv.indexOf("--timeout") + 1], 10) : 0;

// v3584 -- DECLARED HERE, NOT BESIDE writeTimings. The flush call sits inside the run loop, ABOVE the
// function's own definition, and a `const` in a temporal dead zone throws ReferenceError on first use --
// so the periodic write would have died on gate 25 of a 911-gate run and left exactly the empty record
// this round exists to fix. Function declarations hoist; consts do not, and the difference is invisible
// until the line actually runs.
const TIMINGS_PATH = path.join(ROOT, "tools", "ship", "gate-timings.json");
const WRITE_EVERY = 25;
// *** AND A TIME TRIGGER, BECAUSE COUNT ALONE STALLS EXACTLY WHERE IT MATTERS. *** The tail of this suite runs
// 280s, 254s, 251s a gate. A flush every 25 gates would go TWENTY MINUTES between writes through that tail --
// the slowest, most likely-to-be-interrupted stretch of the run, and the one whose numbers are hardest to get.
// Whichever trigger comes first wins.
const WRITE_EVERY_MS = 20000;
let lastWriteAt = Date.now(), lastWriteCount = 0;
const { budgetFor, budgetReason, DEFAULT_BUDGET_MS } = await import("./gateBudget.mjs");
const TIMEOUT = OVERRIDE || DEFAULT_BUDGET_MS;

// Already run individually by verify.mjs, with their own result parsing. Running them twice would double the ship
// time for no information.
const ALREADY_GATED = new Set([
    "brain/blob-policy-selfcheck.mjs",
    "physics/box3d-lockstep-selfcheck.mjs",
    "physics/box3d-lockstep-net-selfcheck.mjs",
    "physics/box3d-lockstep-loss-selfcheck.mjs",
]);

// Each of these was RUN before it was excluded, and the reason is what actually happened -- not a guess.
const SKIP = new Map([
    ["ev/tools/ev-selfcheck.mjs",
     "a CLI tool, not a selfcheck: it prints 'usage: ... <path-to-EV-data-file>' and exits 1 with no argument"],
    ["bz/tools/bz-bridge-selfcheck.mjs",
     "RIG-ONLY: spawns a real bzfs rendezvous server and real pilot processes. No bzflag binary in the Linux " +
     "sandbox, so startBrains() finds no live room and returns {ok:false} with no .started array. Passes where " +
     "bzflag is built."],
    ["ai-bridge/freshMachine-selfcheck.mjs",
     "RIG-ONLY: it PROVISIONS a fresh machine -- apt/npm install plus a spawned server it waits on -- to prove " +
     "the from-nothing setup path works. That is inherently a real-machine test: it passed in the sandbox only " +
     "when the packages were warm in cache and RAN THE FULL 130s (killed) when they were cold, which is a flaky " +
     "gate in the fast 60s suite. Fresh-machine provisioning belongs on the rig, where a cold machine is the " +
     "whole point. Skipped here with this reason rather than left to hang the ship intermittently."],
]);

// v2974 -- CURRENT COUNT: 455 selfcheck files, up from the 89 this note was written about. The walk still finds
// them all -- that is the point of walking rather than listing -- but the number is worth restating, because a
// comment naming a count is the kind of thing that quietly becomes false and then gets quoted. Measured serially
// at a ~3.4s mean the full suite is roughly 26 minutes; the 60s below is the PER-CHECK budget, not the total.
function walk(dir, out = []) {
    for (const f of fs.readdirSync(dir)) {
        if (f === "node_modules" || f === ".git" || f === "vendor" || f === ".venv") continue;
        const p = path.join(dir, f);
        let st;
        try { st = fs.statSync(p); } catch { continue; }
        if (st.isDirectory()) walk(p, out);
        else if (/selfcheck.*\.mjs$/.test(f)) out.push(path.relative(ROOT, p));
    }
    return out;
}

// THIS FILE MATCHES ITS OWN PATTERN. The first run discovered tools/ship/selfchecks.mjs, ran it, which discovered
// itself again, until the timeout killed it 30 seconds later and reported the runner as a failing check. A
// discovery rule that finds the discoverer.
const SELF = path.relative(ROOT, fileURLToPath(import.meta.url));
let all = walk(ROOT).sort();

// v2986 -- `--affected <file> [...]` runs ONLY the gates a change can reach, via the import graph.
//
// THE WHOLE SUITE IS MINUTES, so it runs at the end of a long session if at all -- which is exactly when a check
// you broke is most expensive to have introduced. Three rounds in a row have now paid for that: v2976 shipped
// three stale derived facts whose gates were correct and unread, v2983 found benchmarks that never weighed
// anything, and v2985 found a ratchet reporting ninety-seven versions of drift. Every one of those checks was
// right, present, and unconsulted.
//
// DELIBERATELY OVER-INCLUSIVE: the selected set is a SUPERSET of what could fail. Extra gates cost seconds; a
// MISSED gate is a silent green light on a broken tree.
//
// HONEST LIMIT, PRINTED EVERY TIME: this selects among the SELFCHECKS ONLY. verify.mjs -- physicsSuite, the
// claims gate, the page parse -- is not decomposable this way and is what catches every mutation in tools/mutate.
// So --affected is a FAST PRE-FILTER, never a replacement for a ship.
if (process.argv.includes("--affected")) {
    const i = process.argv.indexOf("--affected");
    const changed = process.argv.slice(i + 1).filter((a) => !a.startsWith("--"));
    if (!changed.length) {
        console.log("[selfchecks] --affected needs at least one changed file. Refusing to run a filtered set on an empty filter -- 0 of 0 passing is a pass that means nothing.");
        process.exit(2);
    }
    const { affectedGates } = await import("./affected.mjs");
    const a = affectedGates(changed);
    const keep = new Set(a.gates);
    all = all.filter((p) => keep.has(path.relative(ROOT, p).replace(/\\/g, "/")));
    console.log("[selfchecks] --affected: " + all.length + " of " + a.total + " gates reach " + changed.length +
                " changed file(s) (" + (100 * a.fraction).toFixed(1) + "%)");
    console.log("[selfchecks] PRE-FILTER, NOT A SHIP. verify.mjs is not decomposable and still catches what these cannot.");
    if (!all.length) {
        console.log("[selfchecks] no gate reaches those files. That is a real answer AND worth a second look:");
        console.log("[selfchecks] a module no check can reach is the graveyard census's whole subject.");
    }
}
let toRun = all.filter((f) => f !== SELF && !ALREADY_GATED.has(f) && !SKIP.has(f));

// v3285 -- *** --budget <seconds>: A WALL-CLOCK CAP, COMPOSED WITH --affected RATHER THAN RIVALLING IT. ***
// --affected answers "which gates can this change reach"; --budget answers "and which of those fit in the time
// I actually have". The planner (gateSelection.mjs) orders reachable-first, then cheapest-first inside each
// band, so a run cut short still covers as much of the change as it could.
//
// THE DEGENERATE POLICY IS LOUD HERE BY DESIGN: running nothing fits inside every budget, so a budget that
// drops gates the change CAN REACH prints a warning naming them. A fast green run that skipped the gate for the
// thing you edited is the failure this flag could otherwise manufacture, and it is the reason missedReachable
// is printed rather than merely computed.
if (process.argv.includes("--budget")) {
    const bi = process.argv.indexOf("--budget");
    const secs = parseFloat(process.argv[bi + 1]);
    if (!Number.isFinite(secs) || secs <= 0) {
        console.log("[selfchecks] --budget needs a positive number of seconds.");
        process.exit(2);
    }
    const { selectGates, selectionLines } = await import("./gateSelection.mjs");
    const changedForPlan = process.argv.includes("--affected")
        ? process.argv.slice(process.argv.indexOf("--affected") + 1).filter((a) => !a.startsWith("--"))
        : [];
    let ledger = null;
    try { ledger = JSON.parse(fs.readFileSync(path.join(ROOT, "tools", "roundhouse", "perf-ledger.json"), "utf8")); } catch {}
    const relOf = (f) => path.relative(ROOT, f).replace(/\\/g, "/");
    const plan = selectGates({ changed: changedForPlan, budgetMs: secs * 1000, ledger,
                              allGates: toRun.map(relOf) });
    const keep = new Set(plan.selected);
    const before = toRun.length;
    toRun = toRun.filter((f) => keep.has(relOf(f)));
    for (const line of selectionLines(plan)) console.log("[selfchecks] " + line);
    console.log("[selfchecks] --budget: running " + toRun.length + " of " + before + " runnable gates.");
    if (plan.missedReachable.length) {
        console.log("[selfchecks] *** " + plan.missedReachable.length + " gate(s) THE CHANGE CAN REACH were dropped for time. " +
                    "A green run here is not a green run on your change. ***");
    }
    if (!toRun.length) {
        console.log("[selfchecks] the budget fits no gate at all. Refusing: 0 of 0 passing is a pass that means nothing.");
        process.exit(2);
    }
}

const t0 = Date.now();
let pass = 0;
const failures = [];
const slow = [];
// v3212 -- EVERY GATE'S OBSERVED RUNTIME, so the budget can be checked against what actually happened rather
// than against itself. gateBudget-selfcheck's first version compared the derivation to its own definition and
// could never fail; a derivation is only checkable against an INDEPENDENT measurement, and this is it.
const observedMs = {};

for (const f of toRun) {
    const s0 = Date.now();
    const budget = OVERRIDE || budgetFor(f);
    try {
        execFileSync(process.execPath, [f], { cwd: ROOT, encoding: "utf8", timeout: budget, stdio: ["ignore", "pipe", "pipe"] });
        const ms = Date.now() - s0;
        observedMs[f.replace(/\\/g, "/")] = ms;
        // v3584 -- flush so a run that dies leaves what it measured. >= rather than an exact modulo: gates
        // that FAIL are not recorded, so the count skips values and `% 25 === 0` can step straight over its
        // own trigger and never fire again.
        const nSoFar = Object.keys(observedMs).length;
        if (nSoFar - lastWriteCount >= WRITE_EVERY || Date.now() - lastWriteAt >= WRITE_EVERY_MS) {
            writeTimings(false); lastWriteAt = Date.now(); lastWriteCount = nSoFar;
        }
        pass++;
        if (ms > 3000) slow.push(f + " (" + (ms / 1000).toFixed(1) + "s)");
        if (VERBOSE) console.log("  ok    " + f + "  " + ms + "ms");
    } catch (e) {
        const ms = Date.now() - s0;
        // A timeout and a failure are DIFFERENT diagnoses and must not be conflated: the first 8s budget I tried
        // classified bz-bridge as "too slow" when it was failing in 1.4 seconds. A slow check needs a bigger
        // budget; a failing check needs a person. Say which.
        const timedOut = e.signal === "SIGTERM" || ms >= budget - 200;
        // v3212 -- *** THE LAST LINE OF A NODE CRASH DUMP IS THE VERSION BANNER. *** This took the last non-empty
        // line of stdout, and a gate that dies on a module-resolution error writes NOTHING to stdout -- so it
        // fell through to e.message, whose tail is "Node.js v22.22.2". SEVENTEEN CRASHED GATES WERE FILED UNDER
        // THE NODE VERSION in the v3211 run: the reason existed, in stderr, and was thrown away. A report that
        // cannot say why is the same class as the empty FAILED list that ship.mjs printed at v3203.
        // Prefer, in order: the gate's own verdict line, the first real Error line from stderr, then the tail.
        const outLines = String((e && e.stdout) || "").trim().split("\n").filter(Boolean);
        const errLines = String((e && e.stderr) || "").trim().split("\n").filter(Boolean);
        const verdict = outLines.filter((l) => /FAIL|FAILURES|FAILED/.test(l)).pop();
        const errLine = errLines.find((l) => /^\w*(Error|Exception)\b|Error:/.test(l.trim()));
        const tail = verdict || errLine || outLines.pop() ||
                     errLines.filter((l) => !/^Node\.js v/.test(l.trim())).pop() || "(no output)";
        // A TIMEOUT AND A STARVED MACHINE ARE ALSO DIFFERENT DIAGNOSES. The slow RL trainers here run ~20s
        // standalone and flaked past 60s during a ship only because a leaked browser had the 4 GB box in swap.
        // "TIMED OUT" alone sends you hunting a hang in a check that is fine; the machine state says whether the
        // check was slow or the machine was starved. A MESSAGE THAT TELLS YOU WHERE TO LOOK HAD BETTER BE RIGHT.
        let host = "";
        if (timedOut) {
            try {
                const free = parseInt(execFileSync("sh", ["-c", "free -m | awk '/Mem:/{print $7?$7:$4}'"], { encoding: "utf8" }).trim(), 10);
                // count REAL browser processes by their executable name, not by cmdline -- a `pgrep -f headless`
                // matches ITS OWN command line and would report a stray that is only the counting itself. A
                // diagnosis that over-counts is a diagnosis that sends you chasing a ghost.
                const chrome = parseInt(execFileSync("sh", ["-c", "ps -eo comm | grep -cE '^headless_shell$|^chrome$' || true"], { encoding: "utf8" }).trim(), 10) || 0;
                host = " [free " + free + "MB, " + chrome + " stray browser(s) -- if low/nonzero this is CONTENTION, not a hang]";
            } catch { /* diagnosis is best-effort; never let it mask the real failure */ }
        }
        failures.push({ f, ms, timedOut,
                        why: (timedOut ? "TIMED OUT after " + (ms / 1000).toFixed(1) + "s of a " +
                                         (budget / 1000).toFixed(0) + "s budget [" + budgetReason(f) + "]" + host
                                       : tail.slice(0, 140)) });
    }
}

// v3584 -- *** THE RECORD IS WRITTEN AS THE RUN GOES, AND IT SAYS WHETHER IT IS COMPLETE. ***
//
// The rule this replaces was right about the danger and wrong about the remedy. It said: folding a partial pass
// into the file "would leave it describing a subset while claiming to describe the suite -- a partial
// measurement wearing a complete one's name". True. But the conclusion drawn was NEVER WRITE ANYTHING UNTIL THE
// END, and that made the record unobtainable: a suite of 911 gates whose tail runs 280s a piece takes hours, and
// A RUN THAT DOES NOT REACH THE END LEAVES NOTHING AT ALL. Measured directly: a full run was started, left for
// nearly an hour, and gate-timings.json was untouched -- so THE ONE THING THAT WOULD REFRESH THE BUDGET WAS THE
// ONE THING HARDEST TO FINISH, which is not a coincidence, it is why the record dated from v3211.
//
// A PARTIAL MEASUREMENT IS NOT DANGEROUS. A PARTIAL MEASUREMENT WEARING A COMPLETE ONE'S NAME IS. So it writes
// every WRITE_EVERY gates with `complete: false` and the counts attached, and sets `complete: true` at the end.
// The same distinction this tree makes everywhere else: absent is not empty, a timeout is not a failure, never
// run is distinct from pass -- and now, INCOMPLETE IS NOT WRONG, IT IS INCOMPLETE AND SAYS SO.
//
// --affected still writes nothing, and that rule is untouched: a filtered run is not a small full run, it is a
// DIFFERENT POPULATION, and merging it would silently overwrite a slow gate's real number with whatever a
// filtered pass happened to see.
function writeTimings(complete) {
    if (process.argv.includes("--affected")) return;
    const n = Object.keys(observedMs).length;
    if (!n) return;
    try {
        const prev = JSON.parse(fs.readFileSync(TIMINGS_PATH, "utf8"));
        // MERGE rather than replace: a partial run must not delete the timings of gates it never reached.
        const merged = { ...(prev.timings || {}), ...observedMs };
        fs.writeFileSync(TIMINGS_PATH, JSON.stringify({
            ...prev,
            captured: prev.captured,
            coverage: { complete, timedThisRun: n, totalInRecord: Object.keys(merged).length,
                        at: new Date().toISOString().slice(0, 19) + "Z" },
            timings: Object.fromEntries(Object.entries(merged).sort()),
        }, null, 1) + "\n");
    } catch { /* the record is evidence, not a dependency: a failure to write must never fail a suite */ }
}
writeTimings(true);

const secs = ((Date.now() - t0) / 1000).toFixed(1);
console.log("");
if (failures.length) {
    // v3212 -- *** A TIMEOUT AND A FAILURE ARE COUNTED APART, BECAUSE THEY SEND YOU TO DIFFERENT PLACES. *** The
    // v3211 run reported "41 of 597 FAILED" and thirteen of those were timeouts, EIGHT OF WHICH PASS GIVEN ROOM.
    // One headline number made a budget problem look like a wall of broken checks. The runner has known the
    // difference since it was written -- `timedOut` is right there -- and the REPORT threw it away, which is the
    // same shape as rigRunner discarding the flag at v3076.
    //
    // BOTH STILL EXIT NONZERO. A gate that did not finish has not passed, and NEVER RUN IS DISTINCT FROM PASS is
    // this tree's oldest law. Separating the counts is about telling you where to look, not about forgiving one.
    const timedOut = failures.filter((x) => x.timedOut);
    const broke = failures.filter((x) => !x.timedOut);
    console.log("selfchecks: " + broke.length + " FAILED, " + timedOut.length + " TIMED OUT, of " +
                toRun.length + "  (" + secs + "s)");
    console.log("");
    if (broke.length) {
        console.log("  --- FAILED: these need a person ---");
        for (const x of broke) console.log("  FAIL  " + x.f + "\n          " + x.why);
        console.log("");
    }
    if (timedOut.length) {
        console.log("  --- TIMED OUT: these need a bigger budget or a smaller fixture, NOT a bug hunt ---");
        for (const x of timedOut) console.log("  TIME  " + x.f + "\n          " + x.why);
        console.log("");
    }
    process.exit(1);
}
console.log("selfchecks: " + pass + "/" + toRun.length + " pass in " + secs + "s" +
            "  [" + ALREADY_GATED.size + " run separately by verify.mjs, " + SKIP.size + " skipped with reasons]");
if (VERBOSE && slow.length) console.log("  slowest: " + slow.join(", "));
if (SKIP.size) for (const [f, why] of SKIP) console.log("  skip  " + f + "\n          " + why);
