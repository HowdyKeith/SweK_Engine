// WebGLEngine/tools/ship/areaHygiene-selfcheck.mjs -- v3582
//
// Run: node tools/ship/areaHygiene-selfcheck.mjs
// RUNTIME 0.3s MEASURED with date +%s%N around the run. Not remembered; v3211-v3213 found 59 of 82 headers wrong.
//
// *** SECTION 2 DRIVES THE HISTORICAL PAIR BY NAME. *** "soft body" and "soft bodies" are gone from the
// registry, so a check that only looked at the CURRENT labels would go green forever without ever proving the
// detector works. The pair is fed in as a literal, because THE ONE CASE THIS FILE EXISTS FOR MUST BE THE ONE
// CASE IT CANNOT STOP TESTING.
"use strict";
import { INSTRUMENTS } from "../../physics/instruments.mjs";
import { areaKey, areaCounts, collisions, spread, largest, MEASURED_V3582, reportLines } from "./areaHygiene.mjs";

let fails = 0;
const ok = (l, c, n = "") => { if (!c) fails++; console.log(`  ${c ? "PASS" : "FAIL"}  ${l}${n ? "   " + n : ""}`); };
const report = (l, n = "") => console.log(`  ----  ${l}${n ? "   " + n : ""}`);

console.log("areaHygiene-selfcheck -- do any two area labels mean the same thing\n");

// ---------------------------------------------------------------------------
console.log("1. THE REGISTRY IS CLEAN NOW");
{
    const counts = areaCounts(), col = collisions();
    report("instruments / areas", INSTRUMENTS.length + " / " + counts.size);
    report("colliding labels", col.length ? JSON.stringify(col) : "(none)");

    ok("!! no two area labels collide once normalised", col.length === 0,
        "*** \"soft body\" AND \"soft bodies\" WERE THE SAME AREA UNDER TWO SPELLINGS FOR 104 INSTRUMENTS. *** " +
        "xpbd-compliance sat alone under one while plastic and physics-lab sat under the other -- AND ALL THREE " +
        "LIVE IN physics/xpbd/. A label that reads as a category and PARTITIONS BY TYPO, the same shape as the " +
        "22 duplicate basenames in knowledge-index.");
    ok("...and xpbd-compliance is filed with its neighbours",
        INSTRUMENTS.find((i) => i.id === "xpbd-compliance").area === "soft bodies" &&
        ["plastic", "physics-lab", "sph-hydrostatic"]
            .every((id) => INSTRUMENTS.find((i) => i.id === id).area === "soft bodies"),
        // *** THIRD PINNED COUNT IN THIS FILE TO FAIL ON PROGRESS. *** `=== 4` went red when v3585 registered
        // seven more sph instruments into the same area -- which is the registry working. The property is that
        // xpbd-compliance sits WITH THE THREE IT WAS SEPARATED FROM, and that survives the area growing. The
        // other two were `method === 22` at v3583 and `ship === 4` at v3584: SAME SPECIES, SAME FILE, and I
        // wrote all three after removing the first.
        "xpbd-compliance beside plastic, physics-lab and sph-hydrostatic, whatever else joins them");
}

// ---------------------------------------------------------------------------
console.log("\n2. *** THE DETECTOR IS DRIVEN ON THE PAIR IT WAS WRITTEN FOR, WHICH NO LONGER EXISTS ***");
{
    ok("!! soft body and soft bodies normalise to the same key",
        areaKey("soft body") === areaKey("soft bodies"),
        "*** BOTH LABELS ARE GONE FROM THE REGISTRY, so a check reading only the CURRENT areas would go green " +
        "forever without ever proving the detector works. *** The pair is fed in as a literal because the one " +
        "case this file exists for must be the one case it cannot stop testing.");
    ok("!! ...and it took THREE versions to get there, the second shipping with a header that said it was fixed",
        areaKey("bodies") === areaKey("body"),
        "v1 stripped the trailing s from the whole joined string: softbodies -> softbodie against softbody. v2 " +
        "stripped per word and I wrote that this 'is what makes them meet' -- IT DOES NOT, because THE ENGLISH " +
        "PLURAL OF A WORD ENDING IN y IS ies AND NO TRAILING-s REMOVAL WILL UNDO IT. *** IT PASSED EVERY OTHER " +
        "PAIR WHILE FAILING THE ONE IT EXISTED FOR, and only driving it found that. ***");
    ok("case and punctuation do not create a distinction",
        areaKey("Soft Bodies") === areaKey("soft-body"),
        "a label is a category, not a string");
    ok("!! and genuinely different subjects stay apart",
        areaKey("method") !== areaKey("ship") && areaKey("optics") !== areaKey("quantum"),
        "*** A NORMALISER THAT COLLAPSED EVERYTHING WOULD REPORT NO COLLISIONS BY REPORTING ONE AREA. *** " +
        "Aggressive is right -- a false pair costs one read and a missed pair costs a partition nobody sees -- " +
        "but not so aggressive that the check becomes vacuous.");
    ok("...and a word that merely ends in s is not treated as plural",
        areaKey("glass") === areaKey("glasses") && areaKey("physics") === areaKey("physic"),
        "both directions land together rather than one of them being mangled into a third key");
}

// ---------------------------------------------------------------------------
console.log("\n3. `method` WAS 26 AND THE SPLIT THAT COULD BE JUSTIFIED WAS MADE");
{
    const counts = areaCounts();
    report("method / ship", counts.get("method") + " / " + counts.get("ship"));
    for (const [a, n] of largest()) report("largest", n + "  " + a);

    ok("!! the instruments about THE SHIP EVENT are out of `method` and in `ship`",
        counts.get("ship") >= 4 &&
        ["ship-ritual", "launch-index", "population-census", "delivered-assets"]
            .every((id) => INSTRUMENTS.find((i) => i.id === id).area === "ship") &&
        !INSTRUMENTS.some((i) => i.area === "method" && /^(ship-ritual|launch-index|population-census|delivered-assets)$/.test(i.id)),
        // *** THE FIRST VERSION PINNED `=== 4` AND WENT RED WHEN v3584 REGISTERED SEVEN MORE SHIP TOOLS. ***
        // SECOND TIME IN TWO ROUNDS a count in this file failed on progress rather than on a defect -- the
        // `method === 22` line did the same at v3583. The property is WHICH instruments are where, and that
        // more ship tooling arrived is the registry working, not the check finding something.

        "ship-ritual measures 'the steps of a ship, their order'; delivered-assets measures whether assets " +
        "resolve 'IN THE SHIPPED TREE'. *** A RELEASE CHECKLIST IS NOT A METHOD OF MEASUREMENT, which is a " +
        "category error rather than a crowding problem. ***");
    // *** v3920 -- THE BAND WAS STILL A COUNT, AND IT WENT RED THE SAME WAY THE PIN DID. ***
    //
    // The note below records v1 pinning `=== 22` and going red the same round, and states the lesson in as many
    // words: "A COUNT IS NOT A PROPERTY: adding a genuine method instrument is progress, and a check that fails
    // on progress is the ratchet this session has now removed four times." THE FIX WAS A SECOND COUNT WITH TWO
    // BOUNDS. `method` reached 40 and it is red again -- on growth, exactly as predicted, by the check whose own
    // comment predicted it. And the check DIRECTLY BELOW says "THE SIZE IS REPORTED, NOT ENFORCED", so this file
    // was enforcing a size two lines above the sentence refusing to.
    //
    // What the line actually claims is that THE STRUCTURAL DISCRIMINATOR FAILS -- that where a module lives does
    // not predict what it is about -- and that is mechanical, so it is measured instead of guessed at with a
    // range. gate-selection and coverage-triage are `method` and live under tools/ship; hmc-kernel and
    // ising-kernel are `method` and live under tools/roundhouse. SPLITTING `method` BY DIRECTORY WOULD CUT
    // BETWEEN INSTRUMENTS THAT BELONG TOGETHER, in both directions. That statement stays true at 40 instruments
    // and at 400, which is what makes it a property.
    const byDir = (id) => (INSTRUMENTS.find((i) => i.id === id) || {});
    const shipSide = ["gate-selection", "coverage-triage"].map(byDir);
    const houseSide = ["hmc-kernel", "ising-kernel"].map(byDir);
    const discriminatorFails =
        shipSide.length === 2 && houseSide.length === 2 &&
        shipSide.every((i) => i.area === "method" && /^tools\/ship\//.test(i.gate || "")) &&
        houseSide.every((i) => i.area === "method" && /^tools\/roundhouse\//.test(i.gate || ""));
    ok("!! ...and the rest did NOT, because there is no structural discriminator",
        discriminatorFails,
        // *** THE FIRST VERSION PINNED `=== 22` AND WENT RED THE SAME ROUND, when v3583 added lockstep-dt to
        // `method`. A COUNT IS NOT A PROPERTY: adding a genuine method instrument is progress, and a check that
        // fails on progress is the ratchet this session has now removed four times (the stale-export count, the
        // weighting literal, the threshold symptom, and this).

        "the obvious rule -- where the module lives -- FAILS: tools/ship holds gate-selection and " +
        "coverage-triage, which are about HOW TO CHOOSE WHAT TO MEASURE and are method by any reading, while " +
        "tools/roundhouse holds hmc-kernel and ising-kernel, which are GPU kernels. *** SPLITTING FURTHER MEANS " +
        "NAMING SUBJECTS, AND v3576 REACHED THE SAME CONCLUSION ABOUT THE PAGE PANELS FOR THE SAME REASON. ***");
    ok("!! and NO CAP IS BORROWED FROM THE PAGE PANELS",
        !("MAX_PER_AREA" in MEASURED_V3582) && counts.get("method") > 15,
        "Keith's fifteen is a rule about a DRAWER ON A SCREEN that stops being scannable. An area is an index " +
        "label with no such constraint, and borrowing the number would apply a limit to a thing it was never " +
        "measured against -- the drift gateBudget was written about at v3212. *** THE SIZE IS REPORTED, NOT " +
        "ENFORCED. ***");
}

// ---------------------------------------------------------------------------
console.log("\n4. THE SPREAD REPORT IS A HINT AND SAYS SO");
{
    const s = spread();
    for (const r of s.slice(0, 3))
        report(r.area.padEnd(22), r.rootCount + " trees: " + r.roots.map(([t, n]) => t + "/" + n).join(", "));
    ok("!! the area spanning the most trees is the one that was a mixed bag",
        s[0].area === "method" && s[0].rootCount >= 4,
        "five trees across physics, tools, ui, render and ai-bridge. A STRONG HINT that a label carries more " +
        "than one subject -- which is how method reached 26.");
    ok("!! ...but spread alone is NOT treated as a defect",
        s.some((r) => r.rootCount > 1 && r.area === "soft bodies"),
        "*** sph-hydrostatic LIVES IN tools/roundhouse AND BELONGS WITH THE xpbd BODIES. *** A gate that failed " +
        "on spread would demand that file layout equal subject, which it does not and should not.");
}

// ---------------------------------------------------------------------------
console.log("\n5. THE CLASS, NOT THE INSTANCE");
{
    ok("!! this exists because renaming one string was not the fix",
        "theInstanceWasNotTheDefect" in MEASURED_V3582,
        "the rename took a second; the reason it survived 104 instruments is that NOTHING CHECKED AREA LABELS " +
        "AT ALL, so the next plural walks straight back in. *** THIS SESSION HAS TWICE PATCHED AN INSTANCE AND " +
        "COME BACK FOR THE CLASS -- the swk_contacts self-count and the name-versus-call grep. Third time, the " +
        "class first. ***");
    ok("the report prints", reportLines().length > 8,
        "v3327's split: a reporting tool prints, the gate beside it is what exits nonzero");
}

console.log(fails ? `\nareaHygiene-selfcheck: ${fails} FAILED` : "\nareaHygiene-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
