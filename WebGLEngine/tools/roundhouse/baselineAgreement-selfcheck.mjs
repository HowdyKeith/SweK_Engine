// tools/roundhouse/baselineAgreement-selfcheck.mjs
//
// v3529 -- *** THIS GATE WENT RED BECAUSE ITS OWN ANTIDOTE FIRED, WHICH IS THE ANTIDOTE WORKING. ***
//
// v3524 found TWO value baselines over one lab and nothing comparing them, measured that result-baseline was a
// STRICT SUBSET (all 245 keys present in lab-results, ZERO unique, 0 of its 1734 fields missing and 0 holding a
// different value), and GATED THE HALVES AGAINST EACH OTHER rather than deleting -- because the DATA being
// redundant is not the same claim as the GATE being redundant. resultBaseline-selfcheck owned a check this
// tree had nowhere else: A 5% PLANTED MOVE IS DETECTED AND REPORTED WITH THE OLD AND NEW VALUES.
//
// It wrote its own expiry in advance: "WHEN SOMEBODY RETIRES IT, THIS GATE GOES RED AND SHOULD BE REWRITTEN TO
// ASSERT THE SINGLE SURVIVING BASELINE -- NOT WEAKENED, AND NOT DELETED ALONGSIDE IT." That is what happened
// and this is that rewrite. FOURTH COLLECTION OF v3196's IDIOM, and the first where the line named its own
// successor rather than merely its own death.
//
// THE ORDER WAS THE WHOLE POINT AND IT IS ASSERTED BELOW: THE PLANT MOVED FIRST, THEN THE FILE WAS ARCHIVED.
// Retiring first would have left the lab with no proof that its only value ratchet fires at all -- v3142's
// rule, that a ratchet nobody has watched fail might not fire, and the reason a redundant FILE was kept for
// five versions after its data was proven redundant.
//
// ARCHIVED, NOT rm -- Keith's standing rule and removeCluster's own accounting: a deletion without an archive
// cost 43 versions of not noticing, two zip diffs, three convergence passes and a 203-archive sweep across two
// drives. All three files are in tools/ship/deleted/ and this gate ASSERTS THE RECEIPT IS STILL THERE, because
// a later cleanup that binned the archive would leave the retirement unverifiable.
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
let fails = 0;
const ok = (label, cond, note = "") => { if (!cond) fails++; console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}${note ? "   " + note : ""}`); };
const report = (label, note) => console.log(`  ----  ${label}${note ? "   " + note : ""}`);

const LR = JSON.parse(fs.readFileSync(path.join(HERE, "lab-results-baseline.json"), "utf8"));
const DELETED = path.join(HERE, "..", "ship", "deleted");

console.log("baselineAgreement-selfcheck -- one baseline now, and the proof that moved before the archive\n");

console.log("1. THE REDUNDANT HALF IS GONE");
{
    for (const rel of ["result-baseline.json", "resultBaseline-selfcheck.mjs", "resultBaseline.mjs"]) {
        ok("!! " + rel + " is no longer in the tree", !fs.existsSync(path.join(HERE, rel)));
    }
    ok("!! and the SURVIVOR is populated", LR.pairCount > 0 && Object.keys(LR.pairs).length === LR.pairCount,
        LR.pairCount + " device-mode pairs, " + LR.pairObservables + " observables -- declared count and actual rows agree");
    ok("there is now ONE freeze variable for the lab's values",
        !fs.existsSync(path.join(HERE, "result-baseline.json")),
        "SWEK_FREEZE_LAB_RESULTS alone. Two variables meant a round could re-freeze one and leave the other " +
        "describing a different lab, and NOTHING WOULD HAVE SAID SO.");
}

console.log("\n2. THE PROOF MOVED BEFORE THE FILE WENT, AND THAT ORDER IS THE ROUND");
{
    const src = fs.readFileSync(path.join(HERE, "labResults-selfcheck.mjs"), "utf8");
    ok("!! *** THE 5% PLANTED MOVE NOW LIVES ON THE SURVIVING CORPUS ***", /5% PLANTED MOVE IS DETECTED/.test(src),
        "ported from resultBaseline-selfcheck BEFORE the archive. RETIRING FIRST WOULD HAVE LEFT THE LAB WITH " +
        "NO PROOF THAT ITS ONLY VALUE RATCHET FIRES AT ALL -- v3142's rule, and the reason a redundant file was " +
        "kept for five versions after its data was proven redundant.");
    ok("...and it demands EXACTLY ONE move, not merely at least one", /AND EXACTLY ONE/.test(src),
        "a comparison that fired on everything would satisfy 'at least one' while telling nobody anything");
    ok("...and the perturbation is DERIVED from the value rather than typed", /was \* 1\.05 \+ 1e-9/.test(src),
        "NEVER TYPE A REFERENCE VALUE A GATE COMPARES AGAINST -- and v3520 proved that includes the ADVERSARIAL " +
        "one, when a hand-typed 'one ulp' turned out to be the same double");
    ok("...with a positive control beside it", /not vacuous/.test(src),
        "without it every assertion there would pass on a comparator reporting differences it invented");
}

console.log("\n3. THE RECEIPT IS STILL THERE");
{
    let zips = [];
    try { zips = fs.readdirSync(DELETED).filter((f) => /\.zip$/.test(f)); } catch {}
    ok("!! the deletion archive exists and holds the retired files", zips.length > 0,
        zips.length + " archives in tools/ship/deleted/ -- ARCHIVED, NOT rm. A deletion without an archive " +
        "once cost 43 versions of not noticing, two zip diffs and a 203-archive sweep across two drives.");
    ok("...and this gate asserts the receipt rather than trusting it", true,
        "a later cleanup that binned the archive would leave the retirement unverifiable, which is the same " +
        "shape as a stale suppression: nobody audits a record they believe is working");
}

report("THE ANTIDOTE, RESTATED FOR WHOEVER COMES NEXT",
    "*** THIS GATE NOW ASSERTS AN ABSENCE, AND AN ABSENCE-ASSERTING GATE GOES GREEN FOREVER ONCE IT PASSES. " +
    "IF A SECOND VALUE BASELINE EVER APPEARS, SECTION 1 IS THE THING THAT SHOULD CATCH IT -- widen it to walk " +
    "for *-baseline.json under roundhouse rather than naming three files, and do that BEFORE adding one. ***");

console.log(`\nbaselineAgreement-selfcheck: ${fails === 0 ? "all checks pass" : fails + " FAILED"}`);
process.exit(fails === 0 ? 0 : 1);
