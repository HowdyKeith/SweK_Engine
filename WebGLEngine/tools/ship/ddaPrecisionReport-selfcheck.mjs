// WebGLEngine/tools/ship/ddaPrecisionReport-selfcheck.mjs -- v3559
//
// Run: node tools/ship/ddaPrecisionReport-selfcheck.mjs
// RUNTIME 61s MEASURED with date(1) around the run. Section 2 drives the adversarial set at three sizes, the
// largest of which is 80000 rays; section 5 additionally drives graveyard's full reference walk. Not remembered
// -- v3211-v3213 found a wrong
// stated runtime in 59 of 82 headers, and v3558 found this file's sibling off by nearly three.
//
// *** THE CENTRAL CLAIM IS THAT ONE PUBLISHED NUMBER WAS TWO NUMBERS, AND IT IS DRIVEN RATHER THAN DESCRIBED. ***
// ddaPrecision-selfcheck printed "TOTAL 1.1644% diverge" as its last figure. Section 2 grows the adversarial
// fixture and watches that total move while neither per-set rate does. A story in a comment would have been the
// prose-as-record shape this tree complains about most; the plant is the fixture itself.
//
// NOTHING HERE IS RATCHETED. The subject is a measured expectation, not debt, and freezing 0-of-160000 would pin
// a fixture: if a future solver change made a camera ray diverge, THAT IS THE NEWS and a red gate is the right
// way to hear it -- so section 1 asserts the CONDITION (divergence only at a sub-ulp-scale tie gap) and REPORTS
// the count beside it.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { realisticRate, adversarialRates, combinedRate, scene, fan, cornerRays,
         ULP32, TIE_BOUND_ULPS, MEASURED_V3559, reportLines } from "./ddaPrecisionReport.mjs";
import { comparePrecision, traverseDDA32 } from "../../voxel/ddaFloat32.js";
import { traverseDDA } from "../../voxel/voxelDDA.js";
import { codeOnly } from "./sourceScan.mjs";

let fails = 0;
const ok = (l, c, n = "") => { if (!c) fails++; console.log(`  ${c ? "PASS" : "FAIL"}  ${l}${n ? "   " + n : ""}`); };
const report = (l, n = "") => console.log(`  ----  ${l}${n ? "   " + n : ""}`);

console.log("ddaPrecisionReport-selfcheck -- is the published expectation the right number?\n");

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

// ---------------------------------------------------------------------------
console.log("1. *** THE REALISTIC ANSWER, AND THE ZERO IS NOT 'NO TIES OCCURRED' ***");
const real = realisticRate();
{
    report("camera stations x rays", real.stations + " x " + (real.n / real.stations) + " = " + real.n);
    report("diverging", real.disagree + "   stations with any: " + real.badStations.length);
    report("tightest tie-gap SURVIVED", isFinite(real.tightestTieSurvived) ? real.tightestTieSurvived.toExponential(2) : "n/a");

    ok("!! *** THE ZERO IS A READING, NOT AN UNASKED QUESTION: exact ties DO occur among realistic rays ***",
        real.tightestTieSurvived === 0,
        "a SURVIVED tie-gap of exactly 0 means two tMax values were bit-identical and BOTH precisions still " +
        "picked the same axis -- because the tie-break is `<=` in the same order in both, so AN EXACT TIE IS " +
        "DETERMINISTIC. *** WITHOUT THIS LINE THE ZERO ABOVE COULD MEAN THE FAN NEVER ASKED A HARD QUESTION, " +
        "which is v3507's shape: a null from an instrument nobody showed could see anything. ***");
    ok("!! ...and it is FORTY STATIONS rather than one fan",
        real.stations >= 20 && real.n >= 100000,
        "one origin would measure that origin. A zero that holds across " + real.stations + " irrational " +
        "camera positions is a statement about the algorithm; a zero from one is a statement about the fixture.");
    ok("!! the CONDITION is asserted and the COUNT is only reported",
        real.badStations.every((b) => b.gap / ULP32 < TIE_BOUND_ULPS),
        real.disagree === 0
            ? "0 of " + real.n + " diverge today. THIS IS DELIBERATELY NOT RATCHETED: if a future change makes a " +
              "camera ray diverge, THAT IS THE NEWS, and what must stay true is that it happens only at a tie " +
              "gap under " + TIE_BOUND_ULPS + " ulps -- a wider one would be an ALGORITHM difference, not precision."
            : "divergences present and all within " + TIE_BOUND_ULPS + " ulps");
}

// ---------------------------------------------------------------------------
console.log("\n2. *** THE POOLED RATE IS A PROPERTY OF THE FIXTURE, AND HERE IT IS MOVING ***");
{
    // The published headline was TOTAL 1.1644%. Grow the adversarial fixture and watch it move.
    const sc = scene();
    const fanRays = fan(20000, 48 / 2 + 0.37, 32 - 1.61, 48 / 2 + 0.29);
    const rFan = comparePrecision(fanRays, sc.isSolid, traverseDDA, 300);
    const rows = [];
    for (const nAdv of [8000, 24000, 80000]) {
        const rAdv = comparePrecision(cornerRays(nAdv, 32), sc.isSolid, traverseDDA, 300);
        rows.push({ nAdv, fanPct: 100 * rFan.disagree / rFan.n, advPct: 100 * rAdv.disagree / rAdv.n,
                    pooledPct: 100 * (rFan.disagree + rAdv.disagree) / (rFan.n + rAdv.n) });
    }
    for (const r of rows)
        report("adversarial n=" + String(r.nAdv).padStart(6),
            "fan " + r.fanPct.toFixed(4) + "%   corners " + r.advPct.toFixed(4) +
            "%   ==> POOLED " + r.pooledPct.toFixed(4) + "%");

    const spread = (a) => Math.max(...a) - Math.min(...a);
    ok("!! *** THE POOLED FIGURE MOVES BY MORE THAN A FACTOR OF TWO WITH NOTHING PHYSICAL CHANGING ***",
        Math.max(...rows.map((r) => r.pooledPct)) > 2 * Math.min(...rows.map((r) => r.pooledPct)),
        rows.map((r) => r.pooledPct.toFixed(2) + "%").join(" -> ") + " as the adversarial fixture grows " +
        "8000 -> 80000. THE ONLY THING THAT CHANGED IS HOW MANY RAYS I DECIDED TO CONSTRUCT.");
    ok("!! ...while NEITHER per-set rate moves, which is what makes those two the real answers",
        spread(rows.map((r) => r.fanPct)) < 1e-9 && spread(rows.map((r) => r.advPct)) < 0.05,
        "fan holds at " + rows[0].fanPct.toFixed(4) + "%, corners at ~" + rows[0].advPct.toFixed(2) +
        "%. *** A RATE WHOSE DENOMINATOR IS A DECISION IS A STATEMENT ABOUT THE FIXTURE -- v3453's refusal to " +
        "ratchet a count derived from shapes the author chose, arriving here as a percentage. ***");
    ok("...and the adversarial rays are not sampled from anything, which is why no weighting exists",
        /not sampled from anything/.test(reportLines().join("\n")),
        "they are CONSTRUCTED to force ties and they are RIGHT to be -- they establish that divergence is " +
        "POSSIBLE, which is a claim about a CONDITION and never an estimate of a rate");
}

// ---------------------------------------------------------------------------
console.log("\n3. *** THE REFUSAL IS REAL, AND IT CARRIES ITS REASON ***");
{
    let threw = false, msg = "";
    try { combinedRate(); } catch (e) { threw = true; msg = String(e.message); }
    ok("!! combinedRate() REFUSES rather than returning a number nobody should quote", threw,
        "v3543's precedent: interiorNumberDensity refuses on a pool with no interior instead of answering " +
        "confidently about a fixture that cannot be asked. A function that returned 1.1644% would be believed.");
    ok("...and the refusal NAMES the measurement that justifies it",
        /8000/.test(msg) && /80000/.test(msg) && /4\.31/.test(msg),
        "a refusal with no numbers in it is an opinion; this one carries the sweep that produced it");
}

// ---------------------------------------------------------------------------
console.log("\n4. *** THE ULP SCALE, AND THE TYPED THRESHOLD IT REPLACES ***");
{
    const adv = adversarialRates();
    for (const a of adv)
        report(a.name.padEnd(10), a.disagree + "/" + a.n + "  widest diverging gap " +
            a.widestDivergingUlps.toFixed(2) + " ulps (" + a.widestDivergingGap.toExponential(2) + ")");

    ok("!! every divergence sits within a few ULPS of binary32, DERIVED FROM THE FORMAT",
        adv.every((a) => a.disagree === 0 || a.widestDivergingUlps < TIE_BOUND_ULPS),
        "binary32 has a 24-bit significand, so one ulp at unit magnitude is 2^-23 = " + ULP32.toExponential(3) +
        ". A gap materially wider than that is RESOLVED by the format and both precisions must order the axes " +
        "the same way -- so a divergence there would be an ALGORITHM difference, not a precision one.");
    ok("!! *** AND THE OLD TYPED THRESHOLD WAS NOT MERELY UNTETHERED, IT WAS THE WRONG SCALE ***",
        1e-5 / ULP32 > 50,
        "ddaPrecision-selfcheck asserted `bestDisagreeingGap < 1e-5`, which is " + (1e-5 / ULP32).toFixed(1) +
        " ULPS -- a relative gap binary32 resolves comfortably, so it could not have meant 'within a rounding " +
        "error'. The measured divergences sit at " + adv.map((a) => a.widestDivergingUlps.toFixed(2)).join(" and ") +
        " ulps. NEVER TYPE A REFERENCE VALUE A GATE COMPARES AGAINST -- and when you must choose a bound, choose " +
        "one the FORMAT implies rather than one that happens to pass.");
    ok("...the bound is stated in ulps in the shipped module, not as a decimal",
        codeOnly(fs.readFileSync(path.join(ENG, "tools/ship/ddaPrecisionReport.mjs"), "utf8"))
            .includes("TIE_BOUND_ULPS"),
        "so a reader cannot mistake it for a tolerance somebody liked the look of");
}

// ---------------------------------------------------------------------------
console.log("\n5. THE FRONT DOOR EXISTS, WHICH IS THE ROUND");
{
    const src = fs.readFileSync(path.join(ENG, "tools/ship/ddaPrecisionReport.mjs"), "utf8");
    const reg = fs.readFileSync(path.join(ENG, "tools/ship/reportingTools.mjs"), "utf8");
    // *** v3941 -- THIS PINNED A SPELLING THAT ANOTHER GATE IN THIS DIRECTORY BANS, AND THE MODULE OBEYED THE
    // OTHER ONE. *** The line required the literal `import.meta.url === `file://${process.argv[1]}``.
    // winPathGuard-selfcheck exists to GREP THAT FORM OUT OF THE TREE -- its own header: it "never matches on
    // Windows (backslashes, and file:// vs file:///), so the CLI main-module block never runs" -- and
    // runLive-selfcheck asserts the correct form by name, `pathToFileURL(process.argv[1]`, refusing the template
    // in the same line. ddaPrecisionReport.mjs was written to the law those two state, so THIS GATE WENT RED ON
    // THE FIX. Three gates touched one idiom, two banned it, one required it, and the file that got it right lost.
    //
    // THE ROUND IS THAT A FRONT DOOR EXISTS, NOT HOW ITS GUARD IS SPELLED: a main-module test comparing
    // import.meta.url against argv[1], and an exit 0. Asserted as that shape so the next correct spelling does
    // not read as a regression -- and the Windows-broken template is refused here too, rather than demanded.
    const guardShape = /import\.meta\.url\s*===/.test(src) && /process\.argv\[1\]/.test(src);
    const bannedGuard = /import\.meta\.url\s*===\s*`file:\/\/\$\{process\.argv\[1\]\}`/.test(src);
    ok("!! the module PRINTS AND EXITS ZERO, with the gate beside it the thing that exits nonzero",
        guardShape && !bannedGuard && /process\.exit\(0\)/.test(src),
        "v3327's split. An empty report and a tool that never ran are indistinguishable (v3201). THE GUARD IS " +
        "MATCHED BY SHAPE -- import.meta.url compared against argv[1] -- because the literal " +
        "`file://${process.argv[1]}` this line used to REQUIRE is the spelling winPathGuard-selfcheck exists to " +
        "ban and runLive-selfcheck refuses by name. A gate that demands what another gate forbids is not strict, " +
        "it is a contradiction, and the module cannot satisfy both");
    ok("!! ...and it is REGISTERED, so tools.html runs it and the answer has a page",
        /ddaPrecisionReport\.mjs/.test(reg),
        "*** THIS IS THE WHOLE POINT OF THE ROUND. ddaFloat32.js's own header says the answer exists so that " +
        "nobody spends a day on the first GPU/CPU disagreement -- and until now it was printed only inside a " +
        "gate, so consulting it meant knowing which of ~887 gates to run. A MODULE WHOSE PURPOSE IS TO BE " +
        "CONSULTED LATER, WITH NO FRONT DOOR. ***");
    ok("the report gives BOTH answers and never one",
        (() => { const t = reportLines().join("\n"); return /REALISTIC/.test(t) && /ADVERSARIAL/.test(t) && /REFUSED/.test(t); })(),
        "a page showing one rate would have re-created the defect this round is about");

    // The subject module gains a NON-GATE importer, which is the only way this population legitimately shrinks.
    // ASKED OF THE THING THAT WALKS rather than of the source text (v3547's rule): a regex saying "this file
    // imports it" is a wiring claim in prose, and the population is decided by the resolver.
    const { actionable } = await import("./orphanTriage.mjs");
    const pile = actionable();
    ok("!! *** voxel/ddaFloat32.js HAS LEFT graveyard's ACTIONABLE PILE ***",
        !pile.includes("voxel/ddaFloat32.js"),
        "pile is " + pile.length + " (was 105 at v3558). *** A REAL WIRING RATHER THAN A CLASSIFIER CHANGE " +
        "(v3453's line). v3547 established that a front door ALONE never moves this number, because a spawn is " +
        "not an import -- an IMPORT is, and this round supplied one. ***");
    ok("!! ...and this round added NOTHING BACK, which v3541 predicted was impossible",
        !pile.includes("tools/ship/ddaPrecisionReport.mjs"),
        "*** v3541/v3542 recorded that every round adding a front-doored analysis module BOTH adds one orphan " +
        "AND rescues its predecessor, so 'a ratchet on that number can never fire' -- v3543 retracted the " +
        "generalisation and this is the case that shows why it was wrong. THE COUNT FELL BY ONE AND NOTHING " +
        "JOINED: this module exports MEASURED_V3559, which is the analysis-record shape actionable() already " +
        "recognises, so it is never admitted in the first place. ***");
}

// ---------------------------------------------------------------------------
console.log("\n6. THE MIRROR IS STILL A MIRROR, AND THIS FILE DID NOT BECOME A SECOND ONE");
{
    // A report that re-implemented the traversal would be measuring itself.
    const src = fs.readFileSync(path.join(ENG, "tools/ship/ddaPrecisionReport.mjs"), "utf8");
    const code = codeOnly(src);
    ok("!! this file contains no traversal of its own -- it drives the shipped pair",
        !/tMax|tDelta|stepX/.test(code),
        "the comparison lives in voxel/ddaFloat32.js and the float64 side is voxel/voxelDDA.js. A second " +
        "traversal here would make every number above a comparison of this file against itself.");
    const one = traverseDDA32(0.5, 31.5, 0.5, 1, -1, 0.3, scene().isSolid, 300);
    ok("...and the float32 traversal still reports minGap, which is what lets a caller say 'coin flip'",
        typeof one.minGap === "number",
        "rather than 'the GPU is wrong' -- ddaFloat32's own stated design, unchanged");
    ok("no verdict is invented for the other four unwired features",
        !("livePanel" in MEASURED_V3559) && !("radarManager" in MEASURED_V3559),
        "v3558's triage left FIVE built-but-unwired features. This round decides ONE. The other four -- " +
        "livePanel, radarManager, lbmShader, svoGenerator -- are untouched, and three of them need a GPU or a " +
        "page decision that is Keith's.");
}

console.log(fails ? `\nddaPrecisionReport-selfcheck: ${fails} FAILED` : "\nddaPrecisionReport-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
