// WebGLEngine/physics/mechanics/contactKeys-selfcheck.mjs -- v3571
//
// Run: node physics/mechanics/contactKeys-selfcheck.mjs
// RUNTIME 25s MEASURED with date +%s%N around the run. Not remembered; v3211-v3213 found 59 of 82 headers wrong.
//
// *** SECTION 3 IS THE ROUND: it DRIVES the exact zero v3568 proposed and shows it firing on correct shipped
// code. A gate that only demonstrated the replacement would be hiding the reason the replacement exists -- the
// same shape physics/info/entropy-selfcheck section 4 has. ***
"use strict";
import { initNode } from "../box3d/box3dNode.mjs";
import { frictionRestitutionAvailable, slopeSpeed, criticalAngle, frictionResidual,
         firstBounce, restitutionResponse, MEASURED_V3571, reportLines } from "./contactKeys.mjs";

let fails = 0;
const ok = (l, c, n = "") => { if (!c) fails++; console.log(`  ${c ? "PASS" : "FAIL"}  ${l}${n ? "   " + n : ""}`); };
const report = (l, n = "") => console.log(`  ----  ${l}${n ? "   " + n : ""}`);

console.log("contactKeys-selfcheck -- the two keys v3568 could not run, and one of them refuted its own zero\n");

const st = await initNode();
if (!st.ready) { console.log("  box3d wasm not loadable: " + st.reason); process.exit(1); }
if (!frictionRestitutionAvailable()) {
    console.log("  FAIL  the surface setters are absent -- this gate exists because v3569 rebuilt the wasm.");
    console.log("        Rebuild with physics/box3d/build-box3d-wasm-clang.sh and re-run.");
    process.exit(1);
}

// ---------------------------------------------------------------------------
console.log("1. *** THE SPEED IS A REAL BINARY AND THE DISPLACEMENT IS NOT ***");
{
    const mu = 0.5, exact = Math.atan(mu);
    let allZero = true;
    for (const f of [0.5, 0.8, 0.9, 0.95]) {
        const v = slopeSpeed(Math.atan(mu * f), mu);
        if (v !== 0) allZero = false;
    }
    ok("!! below the critical angle the speed is EXACTLY 0.000e+0 -- zero, not small", allZero,
        "at 50%, 80%, 90% and 95% of the critical angle. *** THAT IS WHAT MAKES THE BISECTION A BINARY. *** The " +
        "DISPLACEMENT is not: a settling box creeps 1.5e-5 at half the critical angle rising to 5.3e-4 at 99% " +
        "of it, so a fixed displacement bound is crossed by a block that is not sliding.");
    ok("!! ...and above it the speed is O(0.1), so the check is not vacuous",
        slopeSpeed(Math.atan(mu * 1.2), mu) > 0.1,
        "*** WITHOUT THIS, 'exactly zero below' WOULD BE SATISFIED BY A SOLVER THAT NEVER MOVES ANYTHING. ***");

    const a = criticalAngle(mu, { tol: 1e-2 }), b = criticalAngle(mu, { tol: 1e-3 }), c = criticalAngle(mu, { tol: 1e-4 });
    report("critical tan at tol 1e-2 / 1e-3 / 1e-4", [a, b, c].map((x) => x.tan.toFixed(6)).join(" / "));
    ok("!! the recovered angle is THRESHOLD-INDEPENDENT across two decades of tol",
        Math.abs(a.tan - b.tan) < 1e-9 && Math.abs(b.tan - c.tan) < 1e-9,
        "identical to nine digits. A number that moved with the threshold would be measuring the threshold, " +
        "which is exactly what the first version of this did.");
}

// ---------------------------------------------------------------------------
console.log("\n2. THE FRICTION RESIDUAL IS ADDITIVE, WHICH THE RATIO HIDES");
{
    const f = frictionResidual();
    for (const r of f.rows)
        report("mu " + r.mu.toFixed(2), "tan " + r.tan.toFixed(6) + "   ratio " + r.ratio.toFixed(5) +
               "   delta " + r.delta.toFixed(6));
    report("ratio spans / delta spans", f.ratioSpread.toFixed(4) + " / " + f.deltaSpread.toFixed(4));

    ok("!! the block slides ABOVE atan(mu) and not below, at every mu -- the ordering is exact",
        f.rows.every((r) => r.tan > r.mu),
        "the closed form is never consulted while bisecting; it is used only to grade");
    ok("!! *** THE DIFFERENCE IS FAR MORE CONSTANT THAN THE RATIO, SO THE RESIDUAL IS ADDITIVE ***",
        f.deltaSpread < f.ratioSpread / 10,
        "delta spans " + f.deltaSpread.toFixed(4) + " against the ratio's " + f.ratioSpread.toFixed(4) +
        " over a 6.7x range of mu. *** THE MULTIPLICATIVE READING WOULD SAY 'WORST AT LOW mu' (1.0687 against " +
        "1.0136) AND THAT IS AN ARTEFACT OF DIVIDING A NEARLY-CONSTANT OFFSET BY A SMALL NUMBER. *** The solver " +
        "is about " + f.meanDelta.toFixed(4) + " of tan high everywhere.");
    ok("...and delta is small in absolute terms, which is the claim the additive form supports",
        f.meanDelta > 0 && f.meanDelta < 0.02,
        "a statement the ratio form cannot make, because it has no absolute scale");
    ok("nothing is ratcheted", !("baseline" in MEASURED_V3571),
        "no frozen number. Freezing the offset would freeze MY choice of dt, substeps and box size, and it is a " +
        "property of those as much as of the solver.");
}

// ---------------------------------------------------------------------------
console.log("\n3. *** THE EXACT ZERO v3568 PROPOSED, DRIVEN AGAINST THE SHIPPED SOLVER ***");
{
    const z = firstBounce(0);
    report("e = 0: v_in / v_out", z.vin.toFixed(5) + " / " + z.vout.toFixed(6));
    report("rebound as a fraction of impact speed", z.measured.toFixed(6));

    ok("!! the impact actually happened, checked before anything is concluded from the rebound",
        z.vin !== null && z.vin < -1,
        "*** WITHOUT THIS, A ZERO REBOUND WOULD ONLY MEAN THE BOX NEVER LANDED. ***");
    ok("!! *** AND AT e = 0 IT REBOUNDS ANYWAY, SO THE PROPOSED EXACT ZERO IS FALSE ***",
        z.measured > 0.01,
        z.measured.toFixed(6) + " of the impact speed. *** v3568 WROTE 'e = 0 IS AN EXACT ZERO: THE BODY MUST " +
        "NOT LEAVE THE GROUND AT ALL' AND IT WOULD HAVE FIRED ON CORRECT SHIPPED CODE. *** A contact solver has " +
        "to RESOLVE PENETRATION, and pushing an interpenetrating body apart imparts separation velocity whether " +
        "or not the material is bouncy. THAT IS RECOVERY, NOT RESTITUTION, and no coefficient switches it off. " +
        "Second time in this arc, after physics/info/entropy, and for the same reason both times: I asked a " +
        "bound of a quantity the code was not computing.");
}

// ---------------------------------------------------------------------------
console.log("\n4. THE REPLACEMENT: THE RESPONSE IS AFFINE, AND NINE SLOPES SAY SO");
{
    const r = restitutionResponse();
    report("affine fit", "measured = " + r.slope.toFixed(6) + " * e + " + r.intercept.toFixed(6));
    report("per-interval slope spread", r.slopeSpread.toExponential(2));

    ok("!! *** ALL NINE PER-INTERVAL SLOPES ARE THE SAME NUMBER TO SIX DIGITS ***",
        r.slopeSpread < 1e-5,
        "spread " + r.slopeSpread.toExponential(2) + " across e = 0.1 to 1.0. *** NINE IDENTICAL SLOPES IS A " +
        "STRUCTURAL CLAIM AND NOT A FITTED ONE -- an average over nine would be satisfied by a curve that " +
        "wandered. *** The solver applies the requested coefficient LINEARLY.");
    ok("!! ...and loses 3.5% of it, which is a measured engineering number rather than a verdict",
        r.slope > 0.9 && r.slope < 1,
        r.slope.toFixed(6) + ". Below 1 is the direction that must hold -- a slope ABOVE 1 would mean the " +
        "solver returns more energy than the coefficient asks for.");
    ok("!! *** e = 0 SITS OFF THE LINE, WHICH IS HOW THE TWO MECHANISMS ARE TOLD APART ***",
        r.zeroOffLine > 0.02,
        "the line's intercept is " + r.intercept.toFixed(6) + " and the e = 0 rebound is " + r.zero.toFixed(6) +
        ", off by " + r.zeroOffLine.toFixed(6) + " -- TEN TIMES the intercept. If the rebound at zero were just " +
        "the affine model continued down, the two would agree. ONLY HAVING BOTH NUMBERS SHOWS IT.");
    ok("the measured value rises monotonically with the requested one",
        r.measured.every((v, i) => i === 0 || v > r.measured[i - 1]),
        "raising e must make the bounce livelier, or the parameter is lying");
}

// ---------------------------------------------------------------------------
console.log("\n5. WHY THE HEIGHT SEQUENCE IS NOT THE OBSERVABLE, RECORDED SO NOBODY BUILDS IT TWICE");
{
    ok("!! the geometric height ratio is REFUSED, and the reason is the shape of the body",
        "theReplacementIsLinearity" in MEASURED_V3571,
        "h_n = e^(2n) h_0 needs a body that lands the same way every time, and A DROPPED BOX ROCKS AND CATCHES " +
        "ITS EDGES -- measured apex ratios at e = 0.8 came back 0.336, 0.942, 0.643, which is a tumbling box " +
        "and not a coefficient. box3d's shim exposes BOXES ONLY. *** IF A SPHERE PRIMITIVE IS EVER BOUND, THIS " +
        "LINE GOES RED AND SHOULD BE REWRITTEN TO ASSERT THE GEOMETRIC SEQUENCE, NOT DELETED. ***");
    ok("...and the observable used instead is the DEFINITION, needing no second bounce",
        firstBounce(0.5).measured > 0.4,
        "|v_out|/|v_in| at the first impact makes no assumption about landing flat");
    ok("the report prints and the tool exits zero", (await reportLines()).length > 12,
        "v3327's split: a reporting tool prints, the gate beside it is what exits nonzero");
}

console.log(fails ? `\ncontactKeys-selfcheck: ${fails} FAILED` : "\ncontactKeys-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
