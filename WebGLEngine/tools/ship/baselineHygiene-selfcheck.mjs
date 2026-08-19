// tools/ship/baselineHygiene-selfcheck.mjs
//
// Run: node tools/ship/baselineHygiene-selfcheck.mjs   (~30s -- MEASURED, was a typed ~15s)
//
// v3202 -- A RATCHET HOLDING NOTHING LOOKS EXACTLY LIKE ONE THAT WORKS.
//
// v3195 found ONE stale orphan-baseline entry and I treated it as a one-off. *** IT WAS FIVE OF FOURTEEN. ***
// policyCache, rl/memoryPolicy, multigridGPU, RagdollDismember and ui/knownState had all become reachable while
// their suppressions sat in the file.
//
// AND A STALE SUPPRESSION IS NOT MERELY USELESS -- IT IS AN ACTIVE BLIND SPOT. If any of those five becomes a
// real orphan tomorrow, its entry SILENTLY SWALLOWS IT. That is strictly worse than no entry, because NOBODY
// AUDITS A LIST THEY BELIEVE IS DOING ITS JOB.
//
// *** ONE OF THE FIVE WAS NEVER AN ORPHAN AT ALL. *** ui/knownState.js was deleted by the v3159 sweep, restored
// at v3176, and then baselined -- while main.js, THE ENGINE'S OWN ENTRY POINT, imports it three times. I wrote
// that entry, and my justification for it ("2 adopters of 45") described adoption, not reachability. TWO
// DIFFERENT QUESTIONS WEARING ONE ANSWER.
//
// THE RIGHT RESPONSE TO A STALE ENTRY IS DELETION, NOT A LOOSENED CHECK -- an entry stops describing an orphan
// because the module got ADOPTED, which is progress, and progress is recorded by ceasing to suppress.

import path from "node:path";
import fsMod from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ENG = path.resolve(HERE, "..", "..");
let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const H = await import(pathToFileURL(path.join(HERE, "baselineHygiene.mjs")).href);
const O = await import(pathToFileURL(path.join(HERE, "orphanScan.mjs")).href);

const scan = O.orphanScan(ENG);
const live = (scan.candidates || []).map((x) => x.file || x);
const h = H.orphanBaselineHygiene(ENG, live);

// ---- 1. EVERY ENTRY STILL DESCRIBES AN ORPHAN --------------------------------------------------------------------
{
    ok("!! *** no baseline entry has outlived its reason ***",
        h.stale.length === 0,
        h.stale.length ? "STALE, DELETE THESE: " + h.stale.join(", ")
            : h.live.length + " entries, all still orphans. FIVE OF FOURTEEN WERE STALE AT v3202 -- and a stale " +
              "suppression is an ACTIVE BLIND SPOT: if one of those modules becomes a real orphan again, the " +
              "entry SILENTLY SWALLOWS IT, and NOBODY AUDITS A LIST THEY BELIEVE IS WORKING");

    ok("!! and no entry names a file that is gone",
        h.missing.length === 0,
        h.missing.length ? "DANGLING: " + h.missing.join(", ") : "none. KEPT SEPARATE FROM STALE ON PURPOSE -- a " +
        "dangling reference and a suppression that outlived its reason are different problems needing different " +
        "work, and one count could not say which you had");

    ok("...and the fix named in the message is DELETION, not loosening",
        /STALE, DELETE THESE/.test(fsMod.readFileSync(path.join(HERE, "baselineHygiene-selfcheck.mjs"), "utf8")),
        "an entry stops describing an orphan because the module got ADOPTED, which is PROGRESS -- and progress " +
        "is recorded by ceasing to suppress, not by keeping a note that refers to nothing. v3196 proved that " +
        "NAMING THE CORRECT RESPONSE IN ADVANCE is the only thing that reliably prevents a loosened threshold");
}

// ---- 2. THE ONE THAT WAS NEVER AN ORPHAN --------------------------------------------------------------------------
{
    const mainJs = fsMod.readFileSync(path.join(ENG, "main.js"), "utf8");
    const hits = (mainJs.match(/knownState/g) || []).length;
    ok("!! *** ui/knownState.js is reached by main.js, and was baselined anyway ***",
        hits >= 3 && !h.entries.includes("ui/knownState.js"),
        "main.js names it " + hits + " times and it is no longer in the baseline. IT WAS NEVER AN ORPHAN. My " +
        "v3176 justification -- '2 adopters of 45' -- described ADOPTION, not REACHABILITY: TWO DIFFERENT " +
        "QUESTIONS WEARING ONE ANSWER, which is this project's most repeated shape");
}

// ---- 3. SHOWN FAILING --------------------------------------------------------------------------------------------
{
    // A CLAIM ABOUT ABSENCE MUST BE SHOWN FAILING, and this one is cheap to demonstrate: hand the checker a live
    // set that does not contain an entry it holds, and it must report that entry as stale. No file is touched.
    const planted = H.orphanBaselineHygiene(ENG, live.filter((f) => f !== h.live[0]));
    ok("!! the checker DOES fire when an entry stops being an orphan",
        h.live.length > 0 && planted.stale.includes(h.live[0]),
        "withholding " + h.live[0] + " from the live set makes it report STALE. A CHECK NOBODY HAS SEEN FAIL " +
        "MIGHT NOT FIRE -- v3142 proved that with a ratchet that passed its own sabotage");
}

console.log();
console.log("  ----  NOT DONE: claim-trace-baseline, lab-results-baseline and graded-coverage-baseline have the");
console.log("  ----  same exposure -- an entry can outlive its reason and nothing checks. THEY ARE DIFFERENT");
console.log("  ----  SHAPES (a tally, a value map, a list) so one checker will not cover them, and guessing at");
console.log("  ----  a shared one is how this session produced its worst measurements.");
if (fails) { console.log("baselineHygiene-selfcheck: " + fails + " FAILURES"); process.exit(1); }
console.log("baselineHygiene-selfcheck: all checks pass");
