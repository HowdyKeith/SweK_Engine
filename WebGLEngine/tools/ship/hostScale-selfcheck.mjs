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
import { hostScale, scaled, recordRun, boxId, hostFacts, SCALE_FLOOR, SCALE_CEILING } from "./hostScale.mjs";
import { timingsTarget, LOCAL_TIMINGS, DEFAULTS } from "./quickSweep.mjs";
import { ENG as ROOT } from "./gateSweep.mjs";
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
    // *** v4580 -- THIS CONDITION PINNED A REPRESENTATION AND CLAIMED A PROPERTY, AND THE TWO CAME APART. ***
    //
    // It asserted `entries.every(([, v]) => typeof v === "number")` under the sentence "an entry cannot say
    // whether it is a TIME or a TRUNCATION". Those are different statements. sweep-timings.json ALSO holds
    // nothing but bare numbers in its `timings`, and since v4579 every one of its entries says exactly which of
    // three quantities it is -- the saying rides in a sibling `kinds` map. So this row was satisfied by a file
    // that refutes its own sentence, and it would have stayed green straight through the repair.
    //
    // AND THE SENTENCE'S SECOND HALF WAS WRONG IN A WAY THAT COST 644 VERSIONS. "The fix is not to detect
    // truncation -- IT CANNOT BE DETECTED FROM HERE." True of a reader, and this is a reader. But the PRODUCER --
    // tools/ship/selfchecks.mjs -- branches on completed, killed, and declined-to-run by name, and threw the
    // distinction away one line later by writing an integer. v4580 stamps it at that line. The generalisation
    // from "from here" to "at all" is what stopped anyone looking.
    //
    // WHAT IS PINNED NOW IS THE PROPERTY: how many entries carry no provenance. It is >0 today, and THIS ROW IS
    // BUILT TO GO RED THE DAY IT REACHES ZERO -- which is the day this module should reconsider its denominator
    // rather than the day somebody edits a comment.
    const unprovenanced = entries.filter(([k]) => !((raw.kinds || {})[k])).length;
    ok("!! *** entries that cannot say whether they are a TIME or a TRUNCATION, which is why MEASURED is the denominator ***",
       unprovenanced > 0,
       unprovenanced + " of " + entries.length + " entries carry no kind, no box and no stamp. For each of those a "
       + "gate killed at its budget records the moment it died and looks exactly like a gate that finished. "
       + "DIVIDING BY THIS SAID THIS BOX RUNS AT 4.90x. And when this count reaches zero this row goes red on "
       + "purpose, because the reason will have expired. v4580 made the producer record it; it cannot be "
       + "recovered for the rest."
       // *** v4581 -- AND THE REASON v4580 GAVE FOR PREFERRING MEASURED WAS NOT CHECKED, AND IS WRONG. ***
       // This detail read "The denominator stays MEASURED because its numbers were all obtained the same way".
       // I wrote that sentence here one round ago and did not measure it. 50 of gateBudget.MEASURED's 62 entries
       // have no MEASURED_RUNS row at all, so for most of the table nothing says how the number was obtained --
       // and three of the twelve that do say `observedHere: false`. The same fault this row exists to name,
       // asserted about the table offered as the cure, inside the gate that names it.
       //
       // THE CONCLUSION SURVIVES ON A DIFFERENT AND SMALLER REASON, measured at v4581: MEASURED's numbers agree
       // with the independent records for 43 of the 50 entries those records cover, none is LOWER than observed,
       // and after configContract's removal no entry is more than about 3x high. gate-timings has 397 entries
       // that cannot say what they are. Curated-and-mostly-checked beats unprovenanced-at-scale; "all obtained
       // the same way" was a claim about process that nobody had asked the table for.
       + " (v4581: see tools/ship/budgetProvenance-selfcheck.mjs for what MEASURED can and cannot say.)");
    ok("...and the repair exists on this file, so the impossibility claim is retired rather than restated",
       Object.keys(raw.kinds || {}).length > 0 && Object.keys(raw.boxLegend || {}).length > 0,
       "a kind map and a machine legend, written by tools/ship/selfchecks.mjs at the point of decision. The old "
       + "form of this row asserted the absence was structural; it was only unrecoverable, which is a different "
       + "thing and does not excuse leaving the producer silent.");

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

console.log("\n*** WHOSE STOPWATCH WROTE sweep-timings.json -- v4647 ***");
{
    // This module's own v4580 header says of gate-timings.json: "NOTHING IN IT SAYS WHICH MACHINE PRODUCED ANY
    // OF THEM". sweep-timings.json had the same hole, in a file REWRITTEN EVERY RUN and COMMITTED, and it
    // began biting the moment a second box ran the sweep for real: Keith's Windows rig could not `git pull`
    // at all -- its verify run dirties that file and git refuses to overwrite it -- which blocked four pulls
    // in one session. And had it ever committed, its readings would have landed in the SAME fields as this
    // box's with nothing to tell them apart: his sweep puts 231 gates over the 3,000 ms budget and this one
    // puts a handful, which is two machines disagreeing rather than a number moving.
    const ME = boxId();
    ok("boxId is stable within a run and shaped for a filename, not for quoting",
       ME === boxId() && /^[a-z0-9]+-[a-z0-9]+-\d+c-\d+mb-[0-9a-f]{6}$/.test(ME), ME);

    const mine = timingsTarget({ host: ME });
    ok("!! *** the box that OWNS the record writes the shared file ***",
       mine.file === DEFAULTS.timingsFile && mine.foreign === false, mine.why);
    const fresh = timingsTarget({});
    ok("!! an UNCLAIMED record is adopted -- every record written before v4647 names no box",
       fresh.file === DEFAULTS.timingsFile && fresh.foreign === false && fresh.host === ME, fresh.why);
    const theirs = timingsTarget({ host: "win32-x64-16c-32000mb-abcdef" });
    ok("!! *** CONTROL: a DIFFERENT box writes its own file and NEVER the shared one ***",
       theirs.file === LOCAL_TIMINGS && theirs.file !== DEFAULTS.timingsFile && theirs.foreign === true,
       theirs.why);
    ok("  ...and the refusal names BOTH boxes, because 'wrong machine' is not a thing anybody can act on",
       theirs.why.includes("win32-x64-16c-32000mb-abcdef") && theirs.why.includes(ME));
    ok("  the local file follows this tree's existing per-machine convention rather than inventing one",
       /\.local\.json$/.test(LOCAL_TIMINGS),
       "host-timings.local.json, vba-archive.local.json, services.local.json -- and .gitignore carries it, so " +
       "a second box's runtimes cannot travel and cannot block its pull");

    // The live record, which is the thing that actually has to carry it.
    let live = null;
    try { live = JSON.parse(fs.readFileSync(path.join(ROOT, DEFAULTS.timingsFile), "utf8")); } catch {}
    ok("!! *** and the SHIPPED record names its box, so a reading can be attributed at all ***",
       !!live && typeof live.host === "string" && live.host.length > 0,
       live ? `sweep-timings.json was written by ${live.host}` : "NO RECORD");
    // *** AND EVERY WRITER IS CHECKED, NOT JUST THE FILE. *** A sabotage removed `host` from quickSweep's
    // write and this gate stayed green: it reads the live file, which sweepRotation had already written with
    // the field. That is the v4567 defect exactly -- a writer that spells its fields by hand drops one, the
    // record gets smaller, and nothing looks wrong. THREE writers touch this record and all three are read
    // here, from source, because a record with one honest writer and two silent ones is not attributable.
    const writers = [["tools/ship/quickSweep.mjs", 1], ["tools/ship/sweepRotation.mjs", 2]];
    const missing = [];
    for (const [rel, n] of writers) {
        let src = "";
        try { src = fs.readFileSync(path.join(ROOT, rel), "utf8"); } catch { missing.push(rel + " (unreadable)"); continue; }
        const writes = (src.match(/writeFileSync\([^)]*?(?:timingsFile|t\.file|target\.file)/g) || []).length;
        const hosts = (src.match(/host: (?:target|t)\.host/g) || []).length;
        if (writes < n || hosts < n) missing.push(`${rel}: ${writes} timings write(s), ${hosts} carrying host`);
    }
    ok("!! *** all THREE write sites stamp the host, checked in their source rather than in the file ***",
       missing.length === 0,
       missing.length ? "NOT STAMPED: " + missing.join(" | ")
                      : "quickSweep 1 + sweepRotation 2. Reading the file alone cannot tell three writers " +
                        "apart, and one of them dropping the field is exactly how v4567 turned every spawning " +
                        "gate skippable while the count looked like success");

    // *** AND WHOSE MEMBERSHIP LIST A SWEEP RAN IS REPORTED, WHICH IS THE OTHER HALF OF ONE BOX OWNING THE
    // RECORD. *** budgetMs is deliberately NOT scaled per box -- budgetIsOwn calls it a claim about the
    // sweep's TOTAL COST, so a slower machine should run FEWER gates rather than be granted a longer budget,
    // and scaling it would defeat the threshold. That is right. What it leaves is a second machine running
    // the FIRST machine's list: Keith's gen-9 sweep found 219 of 1,306 of them over budget there, 17%,
    // against a handful here. Reported rather than corrected -- a foreign box has nowhere to write a
    // corrected membership, and inventing one per box would make "the sweep is green" mean two different
    // things on two machines. It no longer means them differently in silence.
    const vSrc = fs.readFileSync(path.join(ROOT, "tools", "ship", "verify.mjs"), "utf8");
    ok("!! *** verify SAYS SO when the membership list came from another box, and names how many are over budget HERE ***",
       /r\.foreignTimings/.test(vSrc) && /the membership list came from/.test(vSrc),
       "a sweep that runs one machine's list on another and reports only a verdict is two claims wearing one word");
    const qSrc = fs.readFileSync(path.join(ROOT, "tools", "ship", "quickSweep.mjs"), "utf8");
    ok("  ...and 'foreign' is decided by the record's own host against this box, not by a flag somebody passes",
       /foreignTimings = !!timingsHost && timingsHost !== boxId\(\)/.test(qSrc),
       "the same boxId the record is stamped with, so the two cannot disagree about which machine this is");
    ok("!! CONTROL: the sweep does NOT scale its budget per box, and that is deliberate",
       !/scaled\(/.test(qSrc),
       "hostScale's scaled() grows a per-gate TIMEOUT on a slow machine, which is a different question. " +
       "Growing a membership threshold would make the sweep take proportionally longer on the box least able " +
       "to afford it -- the opposite of what the threshold is for");

    // NOT a row: `ok(..., true)` is a control that cannot fail, and the first draft of this block had one
    // here -- which is the exact thing ringFloorCost-selfcheck's section 4 says in so many words. A limit is
    // reported; it is not asserted.
    console.log("  ----  WHAT IS NOT CLAIMED: that the fifteen modules reading this record are host-aware. They " +
                "are not. On a foreign box they read THIS box's timings, which is the gap hostScale exists to " +
                "absorb by scaling a budget from what the local machine has actually done. What changed is only " +
                "that a foreign box can no longer silently overwrite the shared record, and that the record says " +
                "who wrote it. Making fifteen readers host-aware is its own round.");
}

console.log(failed ? "\nhostScale-selfcheck: " + failed + " FAILED" : "\nhostScale-selfcheck: all checks pass");
process.exit(failed ? 1 : 0);
