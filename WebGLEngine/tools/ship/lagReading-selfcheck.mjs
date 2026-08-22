// WebGLEngine/tools/ship/lagReading-selfcheck.mjs — v3317
//
// Run: node tools/ship/lagReading-selfcheck.mjs   (~0.4s — MEASURED individually)
// Gated by tools/ship/selfchecks.mjs (tree walk).
//
// *** A MEASUREMENT WAS TAKEN CORRECTLY AND THEN READ WRONG, AND THE WRONG READING BECAME THE DIAGNOSIS. ***
//
// v3278 sampled /sys/lag on Keith's rig and recorded eight honest pairs of (uptime, cumulative blocked). It then
// summarised them as "487 SECONDS BLOCKED OUT OF ~500 SECONDS OF UPTIME" and "the loop is dead ~97% of the
// time", and concluded the blocks GROW WITHOUT BOUND -- synchronous work over a collection that keeps growing,
// which "never settles, it gets worse forever".
//
// The final sample is 138.5s blocked out of 498s. THAT IS 27.8%. The 97% figure is the FIRST FOUR SECONDS'
// ratio applied to the whole run. And the windowed duty cycle -- the fraction of each interval spent blocked --
// FALLS from 65.6% to about 22% and then holds. If per-cycle work grew without bound it would RISE.
//
// So the data shows TWO problems that were being treated as one: a heavy startup burst (real, serious, and what
// the boot sidecar addresses) and a steady ~22% periodic duty cycle (real, and still unmeasured on the rig).
// "It gets worse forever" is the part the numbers do not support, and it is the part that set the search
// direction for several rounds.
//
// This gate pins the arithmetic so the reading cannot drift back, and pins the two growth measurements that
// ruled out the obvious suspects.

import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { prose } from "./sourceScan.mjs";

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

// The eight samples exactly as v3278 recorded them.
const UPTIME = [4, 20, 44, 86, 163, 247, 359, 498];
const BLOCKED = [3.9, 14.4, 23.1, 42.0, 63.6, 83.0, 106.6, 138.5];

// ---- 1. THE ARITHMETIC ---------------------------------------------------------------------------------------
{
    const finalPct = BLOCKED[7] / UPTIME[7] * 100;
    ok("!! the final sample is 27.8% blocked, not 97% — the headline figure was the first four seconds",
       Math.abs(finalPct - 27.8) < 0.2,
       BLOCKED[7] + "s of " + UPTIME[7] + "s = " + finalPct.toFixed(1) + "%. The 97% is row one (" +
       (BLOCKED[0] / UPTIME[0] * 100).toFixed(1) + "%), which is a real and serious STARTUP burst and not a description of the run");
    ok("...and no reading of these numbers produces 487 seconds blocked",
       Math.max(...BLOCKED) < 200, "the largest cumulative blocked figure recorded is " + Math.max(...BLOCKED) + "s");
}

// ---- 2. THE DUTY CYCLE FALLS AND PLATEAUS, WHICH IS THE OPPOSITE OF UNBOUNDED GROWTH ------------------------------
{
    const win = [];
    for (let i = 1; i < UPTIME.length; i++) win.push((BLOCKED[i] - BLOCKED[i - 1]) / (UPTIME[i] - UPTIME[i - 1]));
    ok("!! the windowed blocked-fraction FALLS across the run (65.6% -> 22.9%)",
       win[0] > win[win.length - 1] * 2,
       win.map((w) => (w * 100).toFixed(1) + "%").join(" -> "));
    const tail = win.slice(-3);
    const spread = Math.max(...tail) - Math.min(...tail);
    ok("!! ...and the last three windows PLATEAU within 2 points of each other, rather than climbing",
       spread < 0.03,
       "tail " + tail.map((w) => (w * 100).toFixed(1) + "%").join(", ") +
       " — if per-cycle work grew without bound this would rise; a plateau is a steady periodic cost");
    // the shape a runaway would have: cumulative blocked quadratic in uptime
    const ratio = (BLOCKED[7] / BLOCKED[3]) / Math.pow(UPTIME[7] / UPTIME[3], 2);
    ok("...and cumulative blocked grows SUB-quadratically in uptime (a runaway would be at least quadratic)",
       ratio < 0.5,
       "blocked grew " + (BLOCKED[7] / BLOCKED[3]).toFixed(2) + "x while uptime grew " +
       (UPTIME[7] / UPTIME[3]).toFixed(2) + "x — quadratic would need " + Math.pow(UPTIME[7] / UPTIME[3], 2).toFixed(1) + "x");
}

// ---- 3. THE OBVIOUS SUSPECTS ARE RULED OUT BY MEASUREMENT, NOT BY ARGUMENT ------------------------------------------
// Two collections in this tree grow without pruning: perf-ledger.json (checks[key].push, no cap) and the
// submissions archive (one file per submission, forever). Both were measured; both are linear and small.
{
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "swek-growth-"));
    try {
        // perf ledger at a size far beyond anything plausible
        const checks = {};
        for (let k = 0; k < 600; k++) {
            const key = "gate" + k + "-selfcheck.mjs";
            checks[key] = [];
            for (let i = 0; i < 150; i++) checks[key].push({ at: 1, ms: 120 + i, host: "rig" });
        }
        const f = path.join(dir, "pl.json");
        fs.writeFileSync(f, JSON.stringify({ kind: "swek-perf-ledger", checks }));
        const t0 = process.hrtime.bigint();
        for (let i = 0; i < 3; i++) JSON.parse(fs.readFileSync(f, "utf8"));
        const parseMs = Number(process.hrtime.bigint() - t0) / 1e6 / 3;
        ok("!! a perf ledger of 90,000 samples parses in well under a second",
           parseMs < 400,
           parseMs.toFixed(0) + "ms for 90,000 samples across 600 checks — it would need to be a THOUSAND times " +
           "larger to explain a 138s block, so the search should not start there");

        // submissions archive
        const sub = path.join(dir, "submissions");
        fs.mkdirSync(sub);
        for (let i = 0; i < 4000; i++) fs.writeFileSync(path.join(sub, "2026-08-02T10-" + String(i).padStart(6, "0") + "-r.json"), "{}");
        const t1 = process.hrtime.bigint();
        for (let i = 0; i < 3; i++) fs.readdirSync(sub).filter((x) => x.endsWith(".json")).map((x) => ({ file: x, at: x.slice(0, 24) }));
        const walkMs = Number(process.hrtime.bigint() - t1) / 1e6 / 3;
        ok("!! ...and a 4,000-file submissions archive walks in milliseconds",
           walkMs < 200,
           walkMs.toFixed(0) + "ms — measured to 20,000 files at 37ms, linear. Neither unbounded collection is " +
           "near the scale that would matter, which is a NEGATIVE result and worth as much as a positive one here");
    } finally { try { fs.rmSync(dir, { recursive: true, force: true }); } catch {} }
}

// ---- 4. THE INSTRUMENT THAT WOULD SETTLE IT STILL EXISTS AND IS STILL READABLE ---------------------------------------
{
    const srv = fs.readFileSync(path.join(ENG, "ai-bridge", "server.js"), "utf8");
    ok("!! /sys/lag still names each blocking callback by its REGISTRATION site",
       /_timerBlame/.test(srv) && /"\/sys\/lag"/.test(srv),
       "captured from a stack trace at registration, not at fire time, because by then the stack is just the timer");
    ok("...and the corrected reading is recorded beside the original numbers, not in place of them",
       // v3331 -- a COMMENT, and a wrapping one: v3317's correction continues "Re-read arithmetically:" on the next
       // line. Ten contiguous words matched against raw source hold only until somebody re-flows the paragraph, and
       // nine rounds were lost to exactly that. prose() flattens the comment so the wrapping cannot defeat it.
       prose(srv).includes("THE NUMBERS ABOVE DO NOT SAY WHAT THE PARAGRAPH BELOW SAID"),
       "the samples were taken correctly; only the summary was wrong, and deleting them would lose the evidence");
}

console.log(fails ? ("[lagReading-selfcheck] FAILED " + fails) : "[lagReading-selfcheck] all passed");
process.exit(fails ? 1 : 0);
