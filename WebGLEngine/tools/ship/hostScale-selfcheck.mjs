// WebGLEngine/tools/ship/hostScale-selfcheck.mjs -- v3923
//
// *** A BUDGET IS ONE MACHINE'S STOPWATCH AND NOTHING IN THE TREE KNEW WHOSE. ***
//
// gate-timings.json says it plainly -- "each timed individually on this box" -- and gateBudget.MEASURED is built
// from it. v3919 wired rigRunner to that one table, which fixed the WIRING and inherited the host assumption
// whole. Keith's rig then reported: assumptionMap TIMEOUT (568s budget) 568.1s. The same gate finishes in 234s
// here against a recorded 284s. HIS BOX NEEDS MORE THAN 568s FOR WORK THIS ONE DOES IN 234, and no amount of
// re-measuring on this box would ever have said so.
//
// The scale is DERIVED FROM WHAT THE HOST HAS ACTUALLY DONE. It only ever grows a budget, because a fast box
// gains nothing from a shorter one and shortening it manufactures timeouts. A killed run counts as a LOWER
// BOUND, because a badly-mismatched box produces no completed runs to learn from -- which is precisely the box
// that needs this.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { hostScale, scaled, recordRun, SCALE_FLOOR, SCALE_CEILING } from "./hostScale.mjs";
import { MEASURED, budgetFor } from "./gateBudget.mjs";

import { fileURLToPath } from "node:url";
let failed = 0;
const say = (m) => console.log("  ----  " + m);
const ok = (l, c, n) => { console.log("  " + (c ? "PASS" : "FAIL") + "  " + l + (n ? "   " + n : "")); if (!c) failed++; };
const tmp = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), "hs-")), "h.json");

const GATE = "tools/roundhouse/assumptionMap-selfcheck.mjs";
const REF = MEASURED[GATE];
say("reference for " + GATE.split("/").pop() + ": MEASURED " + REF + "ms, budget " + budgetFor(GATE) + "ms");

// ---- 1. NO EVIDENCE MEANS NO CHANGE ------------------------------------------------------------------------
{
    const f = tmp();
    const h = hostScale(f);
    ok("!! a host with no recorded runs changes nothing", h.scale === SCALE_FLOOR && h.samples === 0,
       "scale=" + h.scale + ". The table is a real measurement and stands until this box contradicts it");
}

// ---- 2. A FAST BOX DOES NOT SHRINK A BUDGET ----------------------------------------------------------------
{
    const f = tmp();
    recordRun(GATE, Math.round(REF * 0.5), true, f);
    const h = hostScale(f), s = scaled(budgetFor(GATE), f);
    ok("!! *** a FASTER host leaves the budget alone -- the floor is 1 and the asymmetry is deliberate ***",
       h.scale === SCALE_FLOOR && s.ms === budgetFor(GATE),
       "ran at 0.50x, scale=" + h.scale + ", budget " + budgetFor(GATE) + " -> " + s.ms +
       ". Shortening a budget on a quick box buys nothing and is how a timeout gets manufactured");
}

// ---- 3. A SLOW BOX GROWS IT, PROPORTIONALLY ----------------------------------------------------------------
{
    const f = tmp();
    recordRun(GATE, REF * 3, true, f);
    const s = scaled(budgetFor(GATE), f);
    ok("!! a host measured at 3x gets 3x the budget", Math.abs(s.scale - 3) < 1e-9 && s.ms === budgetFor(GATE) * 3,
       "scale=" + s.scale.toFixed(2) + ", budget " + budgetFor(GATE) + " -> " + s.ms);
}

// ---- 4. THE CASE THAT PRODUCED THIS: A TIMEOUT IS A LOWER BOUND ---------------------------------------------
{
    const f = tmp();
    recordRun(GATE, 568000, false, f);          // Keith's run, killed at the budget
    const s = scaled(budgetFor(GATE), f);
    ok("!! *** a KILLED run still teaches the scale, or a box that times out on everything learns nothing ***",
       s.scale >= 2 && s.ms > budgetFor(GATE),
       "killed at 568000ms against a MEASURED " + REF + "ms -> scale " + s.scale.toFixed(2) + ", budget " +
       budgetFor(GATE) + " -> " + s.ms + "ms. If that is still short the next timeout raises it again: THE " +
       "MECHANISM CONVERGES rather than needing the right number typed in once");
}

// ---- 5. THE CEILING IS A REPORT, NOT A SILENT GRANT ---------------------------------------------------------
{
    const f = tmp();
    recordRun(GATE, REF * 500, true, f);
    const h = hostScale(f);
    ok("!! an absurd ratio is CLAMPED and says so", h.scale === SCALE_CEILING && /CLAMPED/.test(h.why),
       "scale=" + h.scale + " (" + h.why + "). Past the ceiling something is wrong with the box or the gate, " +
       "and silently granting two hours would hide it");
}

// ---- 6. *** THE DENOMINATOR, WHICH THE FIRST VERSION GOT WRONG *** -------------------------------------------
{
    // *** v3936 -- THIS ASSERTED AN EXAMPLE AND THE EXAMPLE MOVED, WHICH IS MY OWN v3923 MISTAKE. ***
    // It read gate-timings for ONE named gate and required `truncated < REF / 2`. That is a MAGNITUDE standing in
    // for a property. When this box re-ran the full sweep, assumptionMap's entry went from a heavily truncated
    // number to 237619ms against a MEASURED 284000ms -- still short, still truncated, but no longer under half.
    // THE GATE WENT RED ON A BETTER MEASUREMENT, which is the exact shape v3920 recorded when areaHygiene's band
    // did it. A COUNT IS NOT A PROPERTY, and neither is a ratio.
    //
    // The property is STRUCTURAL and cannot move: a timings entry is a BARE NUMBER. Nothing in the file marks
    // which entries are a completed run and which are the moment a budget killed one, so no reader can tell a
    // time from a truncation. That is why this file cannot be the denominator -- not that any particular entry
    // happens to be low today.
    const raw = JSON.parse(fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "gate-timings.json"), "utf8"));
    const entries = Object.entries(raw.timings);
    ok("!! *** an entry cannot say whether it is a TIME or a TRUNCATION, which is why MEASURED is the denominator ***",
       entries.length > 0 && entries.every(([, v]) => typeof v === "number"),
       entries.length + " entries, every one a bare number. A gate killed at its budget records the moment it died "
       + "and looks exactly like a gate that finished. DIVIDING BY THIS SAID THIS BOX RUNS AT 4.90x. The fix is not "
       + "to detect truncation -- it cannot be detected from here -- but to divide by a table of numbers that were "
       + "all obtained the same way.");

    // The truncation is REPORTED, not pinned. How many entries sit below their MEASURED value is a fact about
    // today's data; it will change every sweep, and a gate that failed when it improved would be a ratchet
    // pointing backwards. Reported so a reader can see the scale of it without anything depending on the number.
    const below = entries.filter(([k, v]) => typeof MEASURED[k] === "number" && v < MEASURED[k]);
    const worst = below.slice().sort((a, b) => (a[1] / MEASURED[a[0]]) - (b[1] / MEASURED[b[0]]))[0];
    say(below.length + " of " + entries.filter(([k]) => typeof MEASURED[k] === "number").length
        + " gates that MEASURED also covers record LESS time than MEASURED says"
        + (worst ? "; worst is " + worst[0] + " at " + (worst[1] / MEASURED[worst[0]]).toFixed(3) + " of its "
                 + "measured runtime (" + worst[1] + "ms against " + MEASURED[worst[0]] + "ms)" : "")
        + ". REPORTED, NOT ASSERTED -- this moves every sweep and nothing here depends on it.");

    const f = tmp();
    recordRun("tools/ship/some-gate-not-in-measured.mjs", 999999, true, f);
    const h = hostScale(f);
    ok("...so a gate with no MEASURED entry is SKIPPED rather than guessed at", h.scale === SCALE_FLOOR && h.samples === 0,
       "a wild run on an unreferenced gate moved nothing. A sample built on numbers that might be truncation is " +
       "worse than a smaller sample");
}

// ---- 7. AND THE LOCAL FILE MUST NEVER TRAVEL -----------------------------------------------------------------
{
    const gi = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..", ".gitignore"), "utf8");
    ok("!! the per-host record is gitignored -- a fast machine must not export its scale to a slow one",
       /host-timings\.local\.json/.test(gi),
       "gate-timings.json is the shipped REFERENCE and this is one box's comparison against it. Shipping the " +
       "comparison would be the same defect one level up: another machine's stopwatch, presented as a fact");
}

console.log(failed ? "\nhostScale-selfcheck: " + failed + " FAILED" : "\nhostScale-selfcheck: all checks pass");
process.exit(failed ? 1 : 0);
