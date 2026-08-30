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
    // *** v4171 -- DERIVED FROM REF, NOT TYPED. *** This was the literal 568000 -- Keith's real killed run --
    // asserted against `scale >= 2` because 568000/278482 was 2.04. v4171 re-measured assumptionMap's basis
    // from gate-timings.json (278482 -> 296688, the budget having been set from a number the gate's own
    // recorded runtime already exceeded), and the fixture went red at 1.91 WITHOUT ANYTHING BEING WRONG WITH
    // THE MECHANISM IT TESTS. A FIXTURE PINNED TO A CONSTANT THAT DESCRIBES A NUMBER SOMEWHERE ELSE BREAKS
    // WHEN THAT NUMBER IS CORRECTED, and reads as a regression in the code under test. It is expressed as a
    // multiple of REF now, so re-measuring the basis moves both sides together and only a real change in
    // hostScale can redden this line.
    const KILLED_AT = Math.round(REF * 2.04);   // the ratio Keith's 568s run actually represented
    recordRun(GATE, KILLED_AT, false, f);       // a run killed at its budget, on a box ~2x this one
    const s = scaled(budgetFor(GATE), f);
    ok("!! *** a KILLED run still teaches the scale, or a box that times out on everything learns nothing ***",
       s.scale >= 2 && s.ms > budgetFor(GATE),
       "killed at " + KILLED_AT + "ms against a MEASURED " + REF + "ms (2.04x, the ratio Keith's 568s run represented) -> scale " + s.scale.toFixed(2) + ", budget " +
       budgetFor(GATE) + " -> " + s.ms + "ms. If that is still short the next timeout raises it again: THE " +
       "MECHANISM CONVERGES rather than needing the right number typed in once");
}

// ---- 4b. *** ...BUT A LOWER BOUND MAY NOT OVERRIDE A PILE OF FINISHED RUNS -------------------------------
//
// *** THIS RAN ON KEITH'S RIG AND SPENT AN HOUR AND A HALF OF IT. *** Section 4 above is right that a killed
// run teaches something, and its arithmetic is sound: a gate killed at E did not do `base` of work in E, so
// the true ratio exceeds E/base. WHAT IT DOES NOT SAY IS WHOSE FAULT THAT IS -- E/base conflates a slow host
// with a gate that is simply slower than its MEASURED entry, one that has grown, hangs, or was measured on a
// smaller tree. AND IT FEEDS ITSELF: a killed run records elapsed == its budget, the budget is
// base * TAIL_HEADROOM * scale, so each timeout returns TAIL_HEADROOM * scale and the next is granted twice
// as long. 1 -> 2 -> 4 -> 8, ceiling. Section 4's own comment calls that convergence.
//
// The refutation was sitting in the rig's own header: "median of 39 completed run(s) = 2.05x, raised by 4
// timeout lower-bound(s) to 8.63x -- CLAMPED at the ceiling". THIRTY-NINE FINISHED RUNS SAY 2.05x. A box that
// were truly 8.63x slower could not have produced them. A LOWER BOUND IS WHAT YOU USE IN THE ABSENCE OF A
// MEASUREMENT, NOT SOMETHING THAT OVERRIDES ONE.
{
    const f = tmp();
    // The rig, reproduced. REAL MEASURED KEYS, because a synthetic gate name is SKIPPED by design ("not in
    // MEASURED: no trustworthy reference") -- the first draft of this section used `GATE + "?done" + i` and
    // every one of its 43 fixture runs was silently ignored, so it read 1.00x and looked like the fix had
    // failed. A FIXTURE THE CODE UNDER TEST DISCARDS PROVES NOTHING, and it fails loudly here rather than
    // quietly passing, which is the only reason it was caught.
    const keys = Object.keys(MEASURED);
    const done = keys.slice(0, 39), killed = keys.slice(39, 43);
    for (const k of done) recordRun(k, MEASURED[k] * 2.05, true, f);
    for (const k of killed) recordRun(k, MEASURED[k] * 8.63, false, f);
    const h = hostScale(f);
    ok("!! *** 39 FINISHED RUNS AT 2.05x OUTWEIGH 4 TIMEOUTS CLAIMING 8.63x ***",
       Math.abs(h.scale - 2.05) < 1e-6 && h.disputedBounds === killed.length,
       "scale " + h.scale.toFixed(2) + "x from " + done.length + " finished runs, " + h.disputedBounds +
       " bound(s) not applied. BEFORE THE FIX THIS " +
       "WAS 8.00x (clamped), so every budget on that box was ~4x too generous and every timeout took ~4x " +
       "longer to fire -- one sweep spent 7098s to report nothing where 2.05x would have taken ~2290s");

    ok("   ...and the disputed bounds are REPORTED rather than silently dropped",
       /NOT APPLIED/.test(h.why) && /8\.63x/.test(h.why),
       h.why + " -- the reading is real and the claim is only that it is about those GATES rather than this " +
       "BOX. A fix that hid the number would have replaced a wrong attribution with no evidence at all");
}

// ---- 4c. AND THE BOUND STILL CARRIES THE SCALE ALONE WHEN IT IS ALL THERE IS --------------------------------
//
// The v3923 case this whole module was written for: a box so mismatched that its slow gates never finish, so
// no completed run ever teaches the scale anything. NARROWING THE BOUND MUST NOT COST THAT -- a fix that made
// the estimator inert would have passed 4b perfectly while switching the mechanism off.
{
    const f = tmp();
    recordRun(GATE, REF * 3, false, f);
    const h = hostScale(f);
    ok("!! *** WITH NO FINISHED RUNS, A TIMEOUT IS STILL THE WHOLE EVIDENCE AND STILL SETS THE SCALE ***",
       Math.abs(h.scale - 3) < 1e-9 && h.disputedBounds === 0,
       "one killed run at 3x, no completed runs -> scale " + h.scale.toFixed(2) + "x. THIS IS THE CASE THE " +
       "MODULE EXISTS FOR and it is unchanged");

    // and the handover is at a stated count rather than at "some"
    const g = tmp();
    const ks = Object.keys(MEASURED);
    for (const k of ks.slice(0, 7)) recordRun(k, MEASURED[k] * 1, true, g);
    recordRun(ks[7], MEASURED[ks[7]] * 5, false, g);
    const few = hostScale(g);
    ok("   ...and the handover point is a STATED count, not a feeling",
       Math.abs(few.scale - 5) < 1e-9,
       "7 completed runs is still under the threshold, so the bound applies: scale " + few.scale.toFixed(2) +
       "x. AT EIGHT IT WOULD NOT. A rule that switched over at an unstated 'enough' would be untestable, and " +
       "this line is what makes the number a decision somebody can argue with");
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

// ---- 7. *** THE SEPARATOR, WHICH IS WHY THIS MODULE NEVER LEARNED ANYTHING ON THE BOX IT WAS WRITTEN FOR *** --
{
    // EVERY CASE ABOVE TYPES THE KEY WITH FORWARD SLASHES, so for its whole life this gate fed the module the one
    // separator it already handled. The PRODUCER is path.relative in ai-bridge/rigRunner.js, and on Windows that
    // hands back `tools\roundhouse\assumptionMap-selfcheck.mjs`. gateBudget.budgetFor normalises before its
    // lookup so the BUDGET was always found -- which is exactly why nothing looked wrong -- while hostScale did
    // not, so every recorded run missed MEASURED and was skipped as "not in the table".
    //
    // The visible result was a rig that printed `host x1.00 (no local runs against a MEASURED gate yet)` above
    // every timeout, run after run, on the machine whose timeouts this module exists to fix. A MECHANISM THAT
    // CONVERGES ONLY IF ITS TWO HALVES AGREE ON A KEY, AND A GATE THAT ONLY EVER SPELLS THE KEY ONE WAY.
    const f = tmp();
    const WIN = GATE.replace(/\//g, "\\");
    // v4171 -- derived from REF and asserted as an EQUIVALENCE, which is what this check is actually about.
    // It used to record a literal 557100 and assert `scale >= 2`; that threshold was incidental (it happened
    // to hold against the old basis) and it went red when v4171 corrected the basis, reporting a path-
    // normalisation failure that had not happened. THE CLAIM HERE IS THAT TWO SPELLINGS OF ONE PATH GIVE THE
    // SAME ANSWER, so the check is now that comparison itself -- stronger than any threshold, and immune to
    // the basis moving underneath it.
    const KILLED = Math.round(REF * 2.0);
    recordRun(WIN, KILLED, false, f);           // Keith's run again, spelled the way HIS runner spells it
    const h = hostScale(f), s = scaled(budgetFor(WIN), f);
    const g2 = tmp();
    recordRun(GATE, KILLED, false, g2);         // the identical run under the POSIX spelling
    const hPosix = hostScale(g2);
    ok("!! *** a WINDOWS-SHAPED key teaches the scale exactly as a POSIX one does ***",
       h.samples === 1 && Math.abs(h.scale - hPosix.scale) < 1e-9 && s.ms > budgetFor(GATE),
       "recorded as " + WIN + " -> " + h.samples + " sample, scale " + h.scale.toFixed(2) + "; the same run " +
       "under the POSIX spelling -> " + hPosix.samples + " sample, scale " + hPosix.scale.toFixed(2) +
       ". BEFORE THE FIX THIS WAS 0 SAMPLES AND 1.00x -- the same run, the same number, a different spelling " +
       "of the same path");
    ok("...and the key is stored CANONICALLY, so the file does not accumulate two spellings of one gate",
       Object.keys(JSON.parse(fs.readFileSync(f, "utf8")).runs).every((k) => !k.includes("\\")),
       "normalised on write as well as on read: on read so a box that has been recording backslashes since " +
       "v3923 is salvaged rather than thrown away, on write so it stops happening");

    // A gate recorded under BOTH spellings is ONE gate. Counting it twice would let a single machine's single
    // run weigh double in the median -- a quiet bias in the direction of whichever spelling ran last.
    const g = tmp();
    recordRun(WIN, REF * 4, true, g);
    recordRun(GATE, REF * 2, true, g);          // the same gate, after the fix, with the newer time
    const h2 = hostScale(g);
    ok("!! ...and a gate holding both spellings counts ONCE, keeping the NEWEST",
       h2.samples === 1 && Math.abs(h2.scale - 2) < 1e-9,
       "4x under the old spelling and 2x under the new -> " + h2.samples + " sample at " + h2.scale.toFixed(2) +
       "x. The stale record is history, not a second opinion");
}

// ---- 8. AND THE LOCAL FILE MUST NEVER TRAVEL -----------------------------------------------------------------
{
    const gi = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..", ".gitignore"), "utf8");
    ok("!! the per-host record is gitignored -- a fast machine must not export its scale to a slow one",
       /host-timings\.local\.json/.test(gi),
       "gate-timings.json is the shipped REFERENCE and this is one box's comparison against it. Shipping the " +
       "comparison would be the same defect one level up: another machine's stopwatch, presented as a fact");
}

console.log(failed ? "\nhostScale-selfcheck: " + failed + " FAILED" : "\nhostScale-selfcheck: all checks pass");
process.exit(failed ? 1 : 0);
