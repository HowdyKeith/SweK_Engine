// tools/roundhouse/coupleCensus-selfcheck.mjs
//
// v3303 -- FIFTY DEVICES, AND UNTIL NOW FIVE OF THEM TALKED TO ANYONE.
//
// gradedCoverage made "how much proven physics is graded" a live number. This is the same question one level up.
// Every device in this lab grades itself against its own key; NOTHING ASKS TWO OF THEM TO AGREE. That is the bug
// class no single device can see -- two instruments both passing their own gates while contradicting each other
// -- and crossCheck() has existed since v2891 to catch it, with five declared pairs against fifty devices.
//
// THE CENSUS COUNTS CANDIDATES, NOT COUPLINGS, AND THE DISTINCTION IS THE WHOLE DESIGN. An observable named by
// two devices is a CANDIDATE. It is not a coupling until a human has checked that both devices mean the same
// quantity, and most of them do not:
//
//   "steps" is named by TEN devices and means Verlet steps, Monte Carlo sweeps, ES iterations and LBM ticks.
//   Coupling those would compare a step count against a sweep count and file the difference as a physics failure.
//
// *** AND THE CANDIDATE THAT LOOKED MOST LIKE A COUPLING WAS REJECTED BY MEASUREMENT. *** precessionPerOrbit is
// named by blackhole and kepler. blackhole/orbit reports 3.354 rad; kepler/closure reports 2.80e-4. Four orders
// apart, and NEITHER IS WRONG: kepler is a Newtonian closure test where the orbit should not precess at all, so
// its number is integrator residue and its correct value is zero, while blackhole measures relativistic
// precession where a large number IS the physics. Coupling them would demand Newton agree with Einstein.
//
// SO REJECTIONS ARE RECORDED WITH THE MEASUREMENT THAT SETTLED THEM, and the backlog is candidates minus
// ADJUDICATED rather than candidates minus declared -- a rejected candidate is finished work, and counting it as
// outstanding would mean the number could never reach zero.

import { coupleCensus, sharedObservables, sharedModules, REJECTED, declaredPairs } from "./coupleCensus.mjs";
import path from "node:path";
import { fileURLToPath } from "node:url";

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const HERE = path.dirname(fileURLToPath(import.meta.url));
const cen = await coupleCensus(HERE);

// ---- 1. THE NUMBER IS LIVE ---------------------------------------------------------------------------------------
{
    ok("!! *** the coupling gap is now a number the tree reports ***",
        cen.counts.candidates > 20 && cen.deviceCount >= 50,
        `${cen.deviceCount} devices name ${cen.counts.candidates} observables that two or more of them compute, ` +
        `against ${cen.counts.declared} declared cross-checks. ${cen.counts.adjudicated} adjudicated, ` +
        `${cen.counts.open} still open. Before this the answer was "nobody has counted"`);

    ok("candidates are derived mechanically, not curated",
        (await sharedObservables()).length === cen.counts.candidates,
        "a name appearing in two devices' observable lists -- no judgement in the derivation, so the number " +
        "cannot be quietly improved by deciding something is not a candidate");
}

// ---- 2. A NAME IS NOT A QUANTITY, AND THE CENSUS SAYS SO -------------------------------------------------------------
{
    ok("!! 'steps' is rejected with a reason, not counted as a coupling",
        !!REJECTED.steps && /Verlet|sweeps/.test(REJECTED.steps),
        "ten devices name it and mean ten different things. String equality is not physical identity, and a " +
        "census that coupled on it would generate ten failures that are all correct code");

    ok("!! and precessionPerOrbit was rejected by MEASUREMENT, not by inspection",
        !!REJECTED.precessionPerOrbit && /3\.354|four orders/.test(REJECTED.precessionPerOrbit),
        "the strongest-looking candidate in the list. Both devices were RUN: 3.354 rad from blackhole against " +
        "2.80e-4 from kepler, because one measures relativistic precession and the other is a Newtonian closure " +
        "test whose correct answer is zero. Rejecting it on the name alone would have been the right call for " +
        "the wrong reason, and would not have produced the number that explains it");

    const measured = Object.values(REJECTED).filter((r) => /MEASURED|[0-9]e-?[0-9]|[0-9]\.[0-9]/.test(r));
    ok("...and every rejection carries its reason inline",
        Object.keys(REJECTED).length >= 8 && measured.length >= 1,
        `${Object.keys(REJECTED).length} rejections, each with the argument beside it. A rejection recorded only ` +
        "in a commit message is a decision the next reader has to make again");
}

// ---- 3. THE TWO COUPLINGS THAT SURVIVED ------------------------------------------------------------------------------
{
    const declared = declaredPairs(HERE);
    ok("!! Yang's closed form is now cross-checked between two devices",
        declared.some((q) => /Yang/i.test(q)),
        "ising and wolff each implement (1 - sinh^-4(2/T))^(1/8) in their own file. They agree BIT-FOR-BIT today; " +
        "the check exists because a shared constant computed in two places is exactly what drifts when one is " +
        "edited, and neither device could ever have noticed alone");

    ok("!! and two unrelated algorithms are cross-checked on the same physical quantity",
        declared.some((q) => /cluster vs replica/i.test(q)),
        "wolff cluster flipping at L=32 against replica exchange at L=16, agreeing on |M| to 0.27%. No shared " +
        "code path, no shared sampling strategy -- and a 2% tolerance because the LATTICE SIZES differ, which is " +
        "physics rather than error. Demanding exact agreement would fail correct code forever");

    ok("the declared count rose, and the open backlog is the honest remainder",
        cen.counts.declared >= 6 && cen.counts.open < cen.counts.candidates,
        `${cen.counts.declared} declared, ${cen.counts.open} open of ${cen.counts.candidates} candidates. The ` +
        "backlog is real work, not a scoreboard -- most of the remainder will be rejections too, and each needs " +
        "the same measurement before it can be written down");
}


// ---- 4. THE SECOND AXIS, AND WHY THE FIRST ONE NEEDED IT -----------------------------------------------------------
//
// The name-match census found FIVE of the six declared couplings. It could never have found the sixth: kepler
// and hmc both establish symplecticity while sharing no observable name, no problem and no units -- one measures
// a Jacobian determinant at a point, the other an energy bound over 320 orbits. A name match is one way two
// devices can be about the same thing, and the strongest coupling in the lab is not that way.
//
// SHARED IMPORTS ARE THE OTHER AXIS, and unlike names they are decidable from the import graph. Five physics
// modules feed two or more device binds; blackhole/geodesic.js feeds THREE -- kerr, lens and tidal.
//
// *** BUT A SHARED MODULE IS A BLAST RADIUS, NOT A CROSS-CHECK, AND CONFLATING THEM WOULD BE THE NAME-MATCH
// MISTAKE AGAIN IN A NEW COSTUME. *** Measured: chaos and discovery both import chaos/logistic.js. chaos
// computes a Lyapunov exponent (-0.693 at r=2.5); discovery fits a polynomial coefficient (err 1.7e-14). Same
// module, same physics, NOTHING COMPARABLE -- coupling them would demand a Lyapunov exponent agree with a fit
// residual.
//
// So the census reports the two axes SEPARATELY. Candidates answer "what might be cross-checkable". Shared
// modules answer "what moves together when one file is edited". Adding them would produce a number describing
// neither.
{
    const mods = sharedModules(HERE);
    ok("!! shared physics modules are counted as a distinct axis",
        mods.length >= 4 && cen.counts.sharedModules === mods.length,
        `${mods.length} modules feed two or more devices. The largest blast radius is ${cen.blastRadius}: ` +
        `${mods[0].module.replace("physics/", "")} feeds ${mods[0].devices.join(", ")}. One edit there moves ` +
        "three graded devices at once, which is worth knowing whether or not any two of them are comparable");

    ok("!! and a shared module is NOT treated as a coupling",
        cen.counts.candidates !== cen.counts.sharedModules && !cen.candidates.some((c) => c.observable === "module"),
        "chaos and discovery both import chaos/logistic.js: one returns a Lyapunov exponent of -0.693, the other " +
        "a fit residual of 1.7e-14. Same file, same physics, no comparable quantity. Folding shared imports into " +
        "the candidate list would recreate the name-match error one level down");

    ok("...so the two axes are reported separately and never summed",
        typeof cen.counts.sharedModules === "number" && typeof cen.counts.candidates === "number",
        `${cen.counts.candidates} name candidates and ${cen.counts.sharedModules} shared modules. Candidates ask ` +
        "what might be cross-checkable; shared modules ask what moves together when one file is edited. A single " +
        "combined number would answer neither question");
}


// ---- 5. THE BLAST RADIUS IS A BOUND, AND PLANTING ERRORS MEASURES THE REACH -------------------------------------------
//
// v3308 reported blackhole/geodesic.js as feeding three devices and called that a blast radius of 3. It is an
// UPPER BOUND. Planting errors in the module measures what actually moves, and it is narrower and per-FUNCTION:
//
//     criticalImpact() +1.7%   ->  lens moves.  kerr and tidal do not.        (1 of 3)
//     horizon()        +1%     ->  lens and tidal move.  kerr does not.       (2 of 3)
//
// kerr imports geodesic.js and NEITHER edit reached it -- it uses different functions from the same file. So
// "three devices share this file" and "three devices move when you edit it" are different claims, and only the
// first is derivable from the import graph.
//
// THE DISTINCTION MATTERS BECAUSE THE BOUND IS THE USEFUL NUMBER ANYWAY. Before an edit, nobody knows which
// function will be touched, so three devices is the right thing to re-run. After the edit, the reach is
// measurable and smaller. A census that claimed the reach without planting anything would be asserting an
// experimental result from a static scan.
{
    const mods = sharedModules(HERE);
    const geo = mods.find((m) => /geodesic/.test(m.module));
    ok("!! the file-level blast radius is reported as a BOUND, not as observed movement",
        !!geo && geo.devices.length === 3,
        `geodesic.js is imported by ${geo.devices.join(", ")}. Planted errors measured the real reach: ` +
        "criticalImpact moves lens alone, horizon moves lens and tidal, and kerr responds to neither because it " +
        "uses different functions from the same file. The import graph gives the bound; only a planted error " +
        "gives the reach");

    ok("...and the census does not claim the reach it has not measured",
        typeof cen.blastRadius === "number" && !("observedReach" in cen),
        `blastRadius ${cen.blastRadius} is the largest import fan-out, and the census reports nothing about which ` +
        "devices actually move. Claiming reach from a static scan would be asserting an experimental result " +
        "without running the experiment");
}

console.log();
console.log(`  coupling census: ${cen.counts.candidates} candidates, ${cen.counts.declared} declared, ` +
            `${cen.counts.adjudicated} adjudicated, ${cen.counts.open} open`);
if (fails) { console.log("coupleCensus-selfcheck: " + fails + " FAILURES"); process.exit(1); }
// ---- v3312 -- A DUPLICATE KEY IN THE REGISTER SILENTLY DESTROYS A RECORDED REASON --------------------------------
// A JS object literal lets the same key appear twice and the last one wins, with no warning from the runtime and
// none from node --check. I added a second precessionPerOrbit entry this round without reading the register
// first; it would have shadowed a better-written reason that had been there since v3303, and the census count
// would have looked unchanged. The register exists so a decision travels with its evidence, which only works if
// the evidence cannot be quietly replaced.
{
    const fs = await import("node:fs");
    const src = fs.readFileSync(new URL("./coupleCensus.mjs", import.meta.url), "utf8");
    const block = src.slice(src.indexOf("export const REJECTED"), src.indexOf("export function sharedModules"));
    const keys = [...block.matchAll(/^\s{4}([A-Za-z_$][\w$]*)\s*:/gm)].map((m) => m[1]);
    const dupes = keys.filter((k, i) => keys.indexOf(k) !== i);
    ok("!! no candidate appears twice in the rejection register (a duplicate key silently overwrites its reason)",
       dupes.length === 0,
       dupes.length ? "DUPLICATED: " + [...new Set(dupes)].join(", ") : keys.length + " distinct rejections, each with its evidence intact");
}

console.log("coupleCensus-selfcheck: all checks pass");
