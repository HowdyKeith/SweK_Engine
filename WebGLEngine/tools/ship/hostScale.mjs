// WebGLEngine/tools/ship/hostScale.mjs -- v3923
//
// *** EVERY BUDGET IN THIS TREE IS ONE MACHINE'S STOPWATCH, APPLIED AS A HARD LIMIT ON ANY MACHINE. ***
//
// gate-timings.json says so in its own metadata -- "each timed individually on this box" -- and gateBudget's
// MEASURED table is derived from it. That was never wrong; it was never generalised either. v3919 wired
// rigRunner to the one table, which was the right fix for the WIRING and inherited the host assumption whole.
//
// Keith's rig then read: assumptionMap TIMEOUT (568s budget) 568.1s. On this box the same gate finishes in 234s
// against a recorded 284s. HIS BOX NEEDS MORE THAN 568s FOR WORK THIS ONE DOES IN 234. That is not a slow gate
// and not a wrong table -- it is a table with no notion of whose stopwatch it was.
//
// So the host earns a scale, DERIVED FROM WHAT IT HAS ACTUALLY DONE rather than typed or configured. Every run
// the rig completes is recorded locally with the time the table predicted, and the scale is the ratio between
// them. No data means scale 1 and the table stands unchanged.
//
// *** THE SCALE ONLY EVER GROWS A BUDGET. *** A fast box gains nothing from a shorter budget, and shortening one
// is how you manufacture a timeout out of a machine that was doing fine -- so the floor is 1.0 and the asymmetry
// is deliberate. The ceiling is 8: past that something is wrong with the box or the gate, and silently granting
// two hours would hide it.
//
// A TIMEOUT IS A LOWER BOUND, NOT A TIME, and it is the only evidence a badly-mismatched box can produce -- if
// every slow gate is killed, no completed run ever teaches the scale anything. So a timeout contributes
// budget/recorded as a bound the scale must at least meet. Keith's assumptionMap alone says his box is >= 2x.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ENG = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const LOCAL = path.join(ENG, "tools", "ship", "host-timings.local.json");
export const SCALE_FLOOR = 1;
export const SCALE_CEILING = 8;

// *** THE DENOMINATOR IS gateBudget.MEASURED, AND gate-timings.json IS THE WRONG FILE FOR IT. ***
//
// The first version of this module divided by gate-timings.json, which looks like the obvious reference and is
// not. DRIVEN ON REAL NUMBERS IT SAID THIS BOX RUNS AT 4.90x -- because gate-timings records assumptionMap at
// 47729ms while the gate takes 234s here. THAT ENTRY IS TRUNCATED: its own metadata says the capture used "a
// 300s ceiling", so every gate killed by that ceiling is recorded as the moment it died. A file of times, some
// of which are not times, and nothing in it marks which.
//
// MEASURED is the curated table -- 35 entries, each deliberately timed, each carrying the reason it was -- and
// it is what the budgets are actually built from, so it is the honest thing to compare against. Gates absent
// from it are SKIPPED rather than guessed at: they are general-population gates whose only reference would be
// the truncated file, and a sample built on numbers that might be truncation is worse than a smaller sample.
function recorded() {
    try {
        // eslint-disable-next-line no-undef
        return REFERENCE_TABLE || {};
    } catch { return {}; }
}
let REFERENCE_TABLE = null;
try {
    const gb = await import("./gateBudget.mjs");
    REFERENCE_TABLE = gb.MEASURED || {};
} catch { REFERENCE_TABLE = {}; }
export function readLocal(file = LOCAL) {
    try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch { return { runs: {} }; }
}
function writeLocal(data, file = LOCAL) {
    try { fs.writeFileSync(file, JSON.stringify(data, null, 1)); return true; } catch { return false; }
}

/** Record one finished run. `completed` false means the gate was killed at `ms`, which is a LOWER BOUND. */
export function recordRun(gate, ms, completed, file = LOCAL) {
    if (!gate || typeof ms !== "number" || !isFinite(ms) || ms <= 0) return false;
    const d = readLocal(file);
    d.runs = d.runs || {};
    d.runs[gate] = { ms: Math.round(ms), completed: !!completed, at: new Date().toISOString() };
    d.note = "OBSERVED ON THIS BOX. Not shipped -- gate-timings.json is the reference and this is the local " +
             "comparison against it. Delete it and the scale returns to 1.";
    return writeLocal(d, file);
}

const median = (a) => { const s = [...a].sort((x, y) => x - y); return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : null; };

/** The factor this host's budgets are multiplied by, with the evidence that produced it. */
export function hostScale(file = LOCAL) {
    const ref = recorded(), runs = readLocal(file).runs || {};
    const done = [], bounds = [];
    for (const [gate, r] of Object.entries(runs)) {
        const base = ref[gate];
        if (typeof base !== "number" || base <= 0) continue;   // not in MEASURED: no trustworthy reference
        const ratio = r.ms / base;
        if (r.completed) done.push(ratio); else bounds.push(ratio);
    }
    const fromDone = done.length ? median(done) : null;
    const fromBounds = bounds.length ? Math.max(...bounds) : null;
    let scale = Math.max(fromDone ?? SCALE_FLOOR, fromBounds ?? 0, SCALE_FLOOR);
    scale = Math.min(scale, SCALE_CEILING);
    const why = (!done.length && !bounds.length)
        ? "no local runs against a MEASURED gate yet, so the table stands as measured"
        : "median of " + done.length + " completed run(s)" +
          (fromDone !== null ? " = " + fromDone.toFixed(2) + "x" : "") +
          (bounds.length ? ", raised by " + bounds.length + " timeout lower-bound(s) to " + fromBounds.toFixed(2) + "x" : "") +
          (scale === SCALE_CEILING ? " -- CLAMPED at the ceiling" : "");
    return { scale, samples: done.length + bounds.length, completed: done.length, bounds: bounds.length, why };
}

/** A budget already read from the table, adjusted for this host. */
export function scaled(budgetMs, file = LOCAL) {
    const h = hostScale(file);
    return { ms: Math.round(budgetMs * h.scale), ...h };
}
