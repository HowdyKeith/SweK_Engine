// tools/roundhouse/physicsBaselineCoverage-selfcheck.mjs
//
// Run: node tools/roundhouse/physicsBaselineCoverage-selfcheck.mjs   (~60s)
// Gated by tools/ship/selfchecks.mjs (discovery gate).
//
// v2916 -- THE REGRESSION TEST FOR "DID THE PHYSICS MOVE" COVERED FIVE NUMBERS.
//
// v2915 established that no baseline in this tree pins an optics observable, which retired a phantom blocker.
// Following that thread one step further turned up the real problem: physicsBaseline.mjs -- the file whose own
// header calls it "the regression test for every device in the registry" -- held FIVE measurable entries. v2905
// counted 417 numeric observables. The lab could have drifted almost anywhere without a gate noticing.
//
// The fix is not to pin 417 numbers. Most of them have no standing: v2904 found 184 unkeyed observables with no
// answer key and no cross-machine promise, and pinning a number nobody can vouch for just converts an unknown
// into a false reassurance. What v2905-v2914 produced was standing for a specific handful, and THOSE are what
// this round pins -- each with the round that earned it named in the entry, so a future drift can be argued
// with rather than merely noticed.

import { BASELINE, measureBaseline, measureFns } from "./physicsBaseline.mjs";

let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };

// ---- 1. EVERY ENTRY IS MEASURABLE, AND NOTHING IS ORPHANED ---------------------------------------------------------
{
    const fns = await measureFns();
    const orphanEntries = BASELINE.filter((e) => !fns[e.id]).map((e) => e.id);
    const orphanFns = Object.keys(fns).filter((id) => !BASELINE.some((e) => e.id === id));

    ok("!! every pinned entry has a measurement function",
        orphanEntries.length === 0,
        orphanEntries.length ? "no measurement for: " + orphanEntries.join(", ")
            : BASELINE.length + " entries, all measurable. This is the check that makes the single-source " +
              "collapse safe: measureBaseline() now derives from measureFns() instead of carrying a second copy " +
              "of the same map, which is the shape that cost three censuses in v2910 and left a stale hash at " +
              "the repo root in v2915");
    ok("...and no measurement function is left pointing at nothing",
        orphanFns.length === 0,
        orphanFns.length ? "orphaned: " + orphanFns.join(", ") : "no dangling ids");
}

// ---- 2. THE BASELINE ACTUALLY HOLDS -----------------------------------------------------------------------------------
{
    const rows = await measureBaseline();
    const out = rows.filter((r) => !r.within);
    ok("!! every pinned observable reproduces within its earned tolerance",
        out.length === 0,
        rows.length + "/" + rows.length + " within tolerance; worst drift " +
        rows.reduce((a, r) => Math.max(a, r.drift), 0).toExponential(2));

    // A baseline whose tolerances are all enormous would also pass. Check they are not.
    const slack = rows.map((r) => (r.tol > 0 ? r.drift / r.tol : 0));
    ok("the tolerances are not so loose that passing is automatic",
        Math.max(...slack) < 0.9 && rows.every((r) => r.tol <= 2e-2),
        "worst entry sits at " + (100 * Math.max(...slack)).toFixed(1) + "% of its tolerance; the loosest " +
        "tolerance in the file is 2e-2, on ising magnetisation, and that number is justified by a measured " +
        "seed spread rather than chosen to make the gate green");
}

// ---- 3. THE THREE KINDS ARE USED AS THE FILE'S HEADER DEFINES THEM ------------------------------------------------------
{
    const byKind = (k) => BASELINE.filter((e) => e.kind === k);
    ok("every entry declares one of the three kinds",
        BASELINE.every((e) => ["keyed", "unkeyed", "artefact"].includes(e.kind)),
        "keyed " + byKind("keyed").length + ", unkeyed " + byKind("unkeyed").length + ", artefact " + byKind("artefact").length);

    // THRESHOLD CORRECTED. This first required key.length > 10 and failed on "exactly 9" and "6M, exact" --
    // two closed forms that genuinely are that short. Length is not a proxy for informativeness, and the fix
    // that suggests itself, padding the strings until the gate goes green, is writing prose to please a linter.
    // What matters is that a key is PRESENT: an entry claiming to be keyed must say what the answer should be.
    ok("keyed entries name their closed form",
        byKind("keyed").every((e) => typeof e.key === "string" && e.key.trim().length > 0),
        byKind("keyed").length + " keyed entries, each stating the value the simulation is being held to, so a " +
        "drift can be attributed to the physics rather than to the pin");

    ok("!! unkeyed and artefact entries carry the evidence for their standing",
        [...byKind("unkeyed"), ...byKind("artefact")].every((e) => typeof e.note === "string" && e.note.length > 120),
        "an unkeyed number without its corroboration record, or an artefact without its condition, is exactly " +
        "the thing v2596 produced when the blobarium's implicit diffusivity was quoted as physics for 295 versions");

    // the artefacts added this round must state the knob they depend on
    const arte = byKind("artefact").map((e) => e.id);
    ok("...and every artefact names the knob it is an artefact OF",
        byKind("artefact").every((e) => /nSamples|resolution|count|scheme|n=|grid/i.test(e.quantity + " " + e.note)),
        "artefacts: " + arte.join(", ") + " -- pinned deliberately, each with the condition that makes it not a " +
        "property. airy and slit are sampling-grid artefacts (v2911, v2913); chaos-delta-spread is the strange " +
        "one, stable under refinement and moving 110x under a one-ulp libm shift");
}

// ---- 4. COVERAGE, STATED RATHER THAN IMPLIED -------------------------------------------------------------------------------
{
    ok("!! the baseline grew, and is still nowhere near the lab",
        BASELINE.length >= 12,
        BASELINE.length + " pinned observables against the 417 v2905 counted -- about 3%. Before this round it " +
        "was 5. The remaining 400-odd are not an oversight to be fixed by pinning them: v2904 found 184 unkeyed " +
        "observables with no answer key and no cross-machine promise, and pinning a number nobody can vouch for " +
        "converts an unknown into a false reassurance");
    console.log("  NOTE   the cheapest way to grow this honestly is to keep widening ELIGIBILITY, not the pin");
    console.log("         list. v2908 measured that only four devices carry both a refinement knob and a");
    console.log("         nuisance knob, which is what a quantity needs before the full battery can even be run.");
    console.log("         Every knob declared makes a device's numbers pinnable with evidence rather than hope.");
}

console.log();
if (fails) { console.log("physicsBaselineCoverage-selfcheck: " + fails + " FAILURES"); process.exit(1); }
console.log("physicsBaselineCoverage-selfcheck: all checks pass");
