// tools/roundhouse/perfSync-selfcheck.mjs
//
// v2973 -- TIMINGS NOW ACCUMULATE, AND THEY TRAVEL. TWO GAPS A QUESTION EXPOSED.
//
//   1. NOTHING FED THE PERF LEDGER. It has existed since v2940 with a fold/grade CLI, and nothing called fold.
//      A human had to run it by hand for every transcript, so in practice it stayed empty and every timing gauge
//      on the report page read a dash. A ledger nobody writes to is a ledger that measures nothing.
//
//   2. IT DID NOT SYNC. mergeAll carried roster, devices and tunnels but not timings, so two hubs could agree on
//      every verdict and have no shared idea of how fast anything ran -- and a peer's history would be invisible
//      to the hub it reconciled with after an outage.
//
// Both closed: a submitted transcript folds its timings automatically, and the mesh exchange carries the perf
// ledger like everything else.

import { mergePerfLedgers, mergeAll } from "./meshMerge.mjs";
import { foldRun, gradePerf } from "./perfLedger.mjs";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const here = path.dirname(fileURLToPath(import.meta.url));
const samples = (l) => Object.values((l && l.checks) || {}).reduce((a, x) => a + x.length, 0);

// ---- 1. A SUBMITTED TRANSCRIPT FOLDS ITSELF -----------------------------------------------------------------------
{
    const bridge = fs.readFileSync(path.resolve(here, "..", "..", "ai-bridge", "androidPeerBridge.js"), "utf8");
    ok("!! /android/submit folds a transcript's timings into the perf ledger",
        /swek-android-transcript/.test(bridge) && /foldRun\(led, j\)/.test(bridge),
        "performance data now accumulates as a side effect of peers reporting. Requiring a human to run a CLI " +
        "for every transcript is why it stayed empty -- the gauge existed and had nothing to show");

    const t = { at: "2026-07-26T10:00:00Z", host: { platform: "android", arch: "arm64", libc: "bionic" },
        checks: [{ name: "a", status: "pass", ms: 1200 }, { name: "b", status: "timeout", ms: 180000 }, { name: "c", status: "fail", ms: 5 }] };
    ok("...and only PASSING checks are timed",
        samples(foldRun({}, t)) === 1,
        "a timeout was killed at the budget and a failure died early -- neither duration reflects the check's " +
        "real cost, and mixing them in would swing every median");
}

// ---- 2. TIMINGS SYNC BETWEEN HUBS -----------------------------------------------------------------------------------
{
    const A = { checks: { x: [{ at: "t1", ms: 300, host: "h1" }, { at: "t2", ms: 310, host: "h1" }] } };
    const B = { checks: { x: [{ at: "t2", ms: 310, host: "h1" }, { at: "t3", ms: 900, host: "h2" }], y: [{ at: "t4", ms: 50, host: "h2" }] } };
    const m = mergePerfLedgers(A, B);
    ok("!! two hubs' timings union, with the shared sample counted once",
        m.checks.x.length === 3 && m.checks.y.length === 1,
        "2 + 2 with one in common gives 3, not 4. The same run witnessed by two hubs is ONE sample -- dedupe on " +
        "(at, ms, host) is the whole idempotence argument, since perf samples are records rather than tallies");

    ok("the merge is idempotent and commutative, like the others",
        JSON.stringify(mergePerfLedgers(m, B)) === JSON.stringify(m) &&
        JSON.stringify(mergePerfLedgers(A, B)) === JSON.stringify(mergePerfLedgers(B, A)),
        "hubs can gossip repeatedly without inflating the sample count, and a three-hub mesh converges");

    const all = mergeAll(
        { roster: { peers: {} }, devices: { devices: {} }, candidates: { urls: {} }, perf: A },
        { roster: { peers: {} }, devices: { devices: {} }, candidates: { urls: {} }, perf: B });
    ok("!! mergeAll now carries perf, and reports how many samples were gained",
        all.perf && samples(all.perf) === 4 && all.gained.perfSamples === 2,
        "gained " + all.gained.perfSamples + " samples. Before this, a hub reconciling after an outage recovered " +
        "peers, devices and tunnels but silently lost the other side's entire performance history");
}

// ---- 3. THE REGRESSION VERDICT SURVIVES THE MERGE ---------------------------------------------------------------------
{
    // baseline on hub A, a 10x regression witnessed only on hub B -- after merging, the fleet sees it
    const A = { checks: { slow: [300, 310, 305, 320, 300, 315].map((ms, i) => ({ at: "a" + i, ms, host: "linux/x64/glibc" })) } };
    const B = { checks: { slow: [3000, 3100, 3050].map((ms, i) => ({ at: "b" + i, ms, host: "linux/x64/glibc" })) } };
    const g = gradePerf(mergePerfLedgers(A, B));
    ok("!! a regression only one hub saw is visible to both after the exchange",
        g.regressions.length === 1 && g.regressions[0].ratio > 8,
        "hub A has the healthy baseline, hub B saw the slowdown; neither could grade it alone. Merged, the ratio " +
        "is " + (g.regressions[0] ? g.regressions[0].ratio.toFixed(1) : "?") + "x -- which is the practical reason " +
        "timings needed to travel, not just tidiness");
}

console.log();
if (fails) { console.log("perfSync-selfcheck: " + fails + " FAILURES"); process.exit(1); }
console.log("perfSync-selfcheck: all checks pass");
