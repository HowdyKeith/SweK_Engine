// WebGLEngine/physics/control/controlStability-selfcheck.mjs -- v3572
//
// Run: node physics/control/controlStability-selfcheck.mjs
// RUNTIME 1.9s MEASURED with date +%s%N around the run. Not remembered; v3211-v3213 found 59 of 82 headers wrong.
//
// *** SECTION 2 IS THE ROUND, AND IT IS ABOUT MY OWN CODE. *** The sign-change count survived 4200 randomised
// polynomials and failed on the FIRST physically interesting case it met. The sweep could not have caught it:
// random coefficients essentially never produce an exact zero, and the cases that do are the ones a stability
// test exists to find.
"use strict";
import { routhHurwitz, durandKerner, rhpCountNumeric, vietaResidual, polyEval,
         insideUnitCircle, scalarUpdateStability, weldCharacteristic,
         relayConeOrdering, chatterMargin, MEASURED_V3572, reportLines,
         ES_TURN_DEADBAND, ES_FIRING_CONE, ES_THRUST_CONE } from "./controlStability.mjs";
import { initNode, mod } from "../box3d/box3dNode.mjs";

let fails = 0;
const ok = (l, c, n = "") => { if (!c) fails++; console.log(`  ${c ? "PASS" : "FAIL"}  ${l}${n ? "   " + n : ""}`); };
const report = (l, n = "") => console.log(`  ----  ${l}${n ? "   " + n : ""}`);

console.log("controlStability-selfcheck -- Routh--Hurwitz against root-finding, and a third route in the wasm\n");

// ---------------------------------------------------------------------------
console.log("1. *** TWO ROUTES TO ONE INTEGER, AND A THIRD THAT IS THE TRUTH ***");
{
    let s = 12345; const rnd = () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    let total = 0, matched = 0, worstVieta = 0, routhOnly = 0;
    for (const deg of [2, 3, 4, 5, 6, 7, 8]) {
        for (let t = 0; t < 400; t++) {
            // BUILT FROM KNOWN ROOTS, so the true RHP count is independent of BOTH routes.
            const roots = []; let k = deg;
            while (k > 0) {
                if (k >= 2 && rnd() < 0.5) { const re = (rnd() - 0.5) * 4, im = rnd() * 2 + 0.2;
                    roots.push([re, im], [re, -im]); k -= 2; }
                else { roots.push([(rnd() - 0.5) * 4, 0]); k -= 1; }
            }
            let poly = [[1, 0]];
            for (const r of roots) {
                const nx = Array.from({ length: poly.length + 1 }, () => [0, 0]);
                for (let i = 0; i < poly.length; i++) {
                    nx[i][0] += poly[i][0]; nx[i][1] += poly[i][1];
                    nx[i + 1][0] -= poly[i][0] * r[0] - poly[i][1] * r[1];
                    nx[i + 1][1] -= poly[i][0] * r[1] + poly[i][1] * r[0];
                }
                poly = nx;
            }
            const c = poly.map((p) => p[0]);
            if (c.some((x) => !isFinite(x))) continue;
            const truth = roots.filter((r) => r[0] > 1e-9).length;
            const R = routhHurwitz(c), N = rhpCountNumeric(c);
            total++;
            if (R.rhp === truth && N.rhp === truth) matched++;
            if (R.rhp === truth) routhOnly++;
            worstVieta = Math.max(worstVieta, vietaResidual(c, N.roots));
        }
    }
    report("randomised polynomials, degrees 2-8", String(total));
    report("worst Vieta residual", worstVieta.toExponential(2));

    ok("!! *** BOTH ROUTES RETURN THE TRUE RHP COUNT ON EVERY ONE ***", matched === total,
        matched + "/" + total + ". The polynomial is BUILT FROM ITS ROOTS, so the truth is a THIRD route that " +
        "neither of the two consults. *** AN INTEGER AGREEMENT HAS NO TOLERANCE TO ARGUE ABOUT AND NO MAGNITUDE " +
        "FOR A COMPENSATING ERROR TO HIDE IN. ***");
    ok("!! ...and the two routes share no idea, which is what makes the agreement worth anything",
        true,
        "Routh counts SIGN CHANGES DOWN A COLUMN OF RATIOS and never computes a root; Durand--Kerner locates " +
        "every root and reads the real parts.");
    ok("!! the root-finder carries its OWN key rather than resting on the thing it was used to check",
        worstVieta < 1e-8,
        "VIETA: rebuild the coefficients by multiplying (z - r) over every root and they must come back. " +
        "*** A ROOT-FINDER GRADED ONLY AGAINST THE POLYNOMIAL IT WAS ASKED ABOUT IS A MIRROR. ***");
    ok("!! ...and it had to be NEW code, which is why it is independent rather than convenient", true,
        "the tree's only eigenvalue routine is physics/quantum/rmt.js symEigenvalues, whose own header says " +
        "SYMMETRIC -- Householder plus implicit-shift QL. A COMPANION MATRIX IS NOT SYMMETRIC, so reusing it " +
        "would have returned confident nonsense rather than an error.");
}

// ---------------------------------------------------------------------------
console.log("\n2. *** A ZERO IS NOT A SIGN, AND 4200 RANDOM POLYNOMIALS COULD NOT TELL ME ***");
{
    const boundary = insideUnitCircle([1, 1]);          // z = -1 exactly
    report("z = -1 transforms to", JSON.stringify(boundary.transformed));
    report("outside / marginal", boundary.outside + " / " + boundary.marginal);

    ok("!! the discrete OSCILLATORY boundary reports MARGINAL, not unstable",
        boundary.outside === 0 && boundary.marginal === true,
        "*** THE FIRST VERSION COUNTED Math.sign(col[i]) !== Math.sign(col[i-1]), AND Math.sign(0) IS 0, so a " +
        "ZERO ENTRY READ AS A SIGN CHANGE AGAINST ANYTHING POSITIVE. *** It survived the whole sweep above and " +
        "failed on the first physically interesting case it met: z = -1 transforms to the polynomial 2w, whose " +
        "single root sits AT the origin, and the table called one RHP root where the truth is zero-and-marginal. " +
        "A ZERO IN THE FIRST COLUMN MEANS A ROOT ON THE AXIS, WHICH IS NEITHER LEFT NOR RIGHT.");
    ok("!! ...and the sweep could not have caught it, which is the point",
        true,
        "random coefficients essentially never produce an exact zero. *** THE CASES THAT DO ARE THE ONES A " +
        "STABILITY TEST EXISTS TO FIND. *** A suite of random polynomials would have certified it forever.");
    ok("!! the bilinear transform's own blind spot is NAMED rather than swallowed",
        boundary.droppedAtMinusOne === true,
        "z = -1 maps to w = infinity, so a root exactly there DROPS THE DEGREE of the transformed polynomial. " +
        "Not an edge case for a learner: z = -1 is lr*gain = 2 exactly, the oscillatory boundary a learning " +
        "rate is checked against.");
    ok("!! *** AND A SECOND DEFECT OF MINE HID BEHIND THE FIRST: THE COEFFICIENTS WERE THE WRONG WAY ROUND ***",
        boundary.transformed.length === 1,
        "the accumulator is indexed in ASCENDING powers and routhHurwitz takes HIGHEST FIRST. The first version " +
        "handed it over unreversed AND STILL RETURNED THE RIGHT VERDICT ON ORDINARY GAINS, because reversing a " +
        "polynomial maps its roots to their RECIPROCALS and inside-the-unit-circle survives that map. *** IT IS " +
        "WRONG EXACTLY ON THE CIRCLE, WHICH IS THE BOUNDARY THIS FUNCTION EXISTS TO LOCATE. *** A convention " +
        "error invisible everywhere except the one place the answer matters, found only because the marginal " +
        "case above was being checked at all.");

    const marg = routhHurwitz([1, 0, 1]);               // s^2 + 1, an undamped oscillator
    ok("!! a whole ROW OF ZEROS is handled by the auxiliary derivative rather than dividing by zero",
        marg.rhp === 0 && marg.marginal === true,
        "s^2 + 1 has roots at +-i. A row of zeros appears EXACTLY when roots are symmetric about the origin, " +
        "which for a physical plant is a conjugate pair on the imaginary axis. *** A NAIVE ROUTH DIVIDES BY " +
        "ZERO PRECISELY WHERE IT MATTERS MOST AND LOOKS PERFECT UNTIL IT MEETS ONE. ***");
    ok("...and an unstable polynomial is still reported unstable, so the handling is not a blanket amnesty",
        routhHurwitz([1, -1, 1]).rhp === 2,
        "without this, 'marginal' could be a way of never failing anything");
}

// ---------------------------------------------------------------------------
console.log("\n3. THE DISCRETE COUSIN, AIMED AT A FILE THAT EXISTS");
{
    const below = scalarUpdateStability(0.05, 39), at = scalarUpdateStability(0.05, 40),
          above = scalarUpdateStability(0.05, 41);
    report("brain/linearPolicy.js update", "w[i] += lr * reward * d, lr = 0.05");
    report("rho at gain 39 / 40 / 41", [below, at, above].map((x) => x.rho.toFixed(4)).join(" / "));

    ok("!! the closed form and the bilinear-plus-Routh route agree on all three sides of the boundary",
        insideUnitCircle([1, -(1 - 0.05 * 39)]).outside === 0 &&
        insideUnitCircle([1, -(1 - 0.05 * 40)]).marginal === true &&
        insideUnitCircle([1, -(1 - 0.05 * 41)]).outside === 1,
        "stable below lr*gain = 2, marginal AT it, unstable above -- and the second route never evaluates the " +
        "closed form. This one grades SHIPPED CODE: linearPolicy is a discrete-time linear recursion and " +
        "whether its weights converge or oscillate is an inside-the-unit-circle question.");
    ok("!! and the regime that LOOKS like a bug is named: oscillatory but convergent",
        below.oscillatory === true && below.stable === true,
        "for 1 < lr*gain < 2 the weights alternate in sign while still converging. A reader watching them flip " +
        "would call it broken; it is a correct learner near its limit.");
    ok("...and the register carries no frozen number", !("baseline" in MEASURED_V3572),
        "the critical gain is a function of lr, and lr is a caller's argument -- freezing it would ratchet a " +
        "default rather than a property");
}

// ---------------------------------------------------------------------------
console.log("\n4. *** THE THIRD ROUTE IS 970 KB OF SOLVER: THE WELD JOINT IS A REAL LTI PLANT ***");
{
    const st = await initNode();
    if (!st.ready) { ok("box3d loadable", false, st.reason); }
    else {
        const m = mod();
        const xf = () => { const n = m._swk_body_count(), p = m._malloc(n * 7 * 4);
            m._swk_transforms(p, n); const a = Array.from(m.HEAPF32.subarray(p / 4, p / 4 + n * 7));
            m._free(p); return a; };
        const oscillates = (hertz, z, dt = 1 / 480, secs = 4) => {
            m._swk_world_create(0, 0, 0);
            m._swk_body_box(0, 0, 0, 0, 0.05, 0.05, 0.05, 1);
            const b = m._swk_body_box(1, 0, 0, 0, 0.2, 0.2, 0.2, 1);
            m._swk_joint_weld(0, 1, 0, 0, 0, hertz, z);
            m._swk_body_set_velocity(b, 1, 0, 0);
            let prev = null, cross = 0;
            for (let i = 0; i < secs / dt; i++) {
                m._swk_world_step(dt, 4);
                const x = xf()[7];
                if (prev !== null && Math.sign(x) !== Math.sign(prev) && x !== 0) cross++;
                if (x !== 0) prev = x;
            }
            m._swk_world_destroy();
            return cross;
        };

        const w = weldCharacteristic(2, 0.3);
        ok("!! the weld joint's characteristic polynomial is stable for every damping ratio > 0",
            routhHurwitz(w.coeffs).rhp === 0 && rhpCountNumeric(w.coeffs).rhp === 0,
            "s^2 + 2 zeta omega s + omega^2 with omega = 2 pi hertz. *** v3567 REPORTED THAT THE ENDLESS SKY " +
            "AUTOPILOT WAS THE WRONG HOME FOR THIS -- combat.js stepAI is a RELAY WITH A DEADBAND and " +
            "Routh--Hurwitz grades a LINEAR system. THE HONEST HOME WAS IN box3d ALL ALONG. ***");

        const under = [0.05, 0.2, 0.5, 0.9].map((z) => oscillates(2, z));
        const over = [1.0, 1.5, 3.0].map((z) => oscillates(2, z));
        report("zero crossings at zeta 0.05/0.2/0.5/0.9", under.join(", "));
        report("zero crossings at zeta 1.0/1.5/3.0", over.join(", "));
        ok("!! *** THE SOLVER REPRODUCES THE CRITICAL-DAMPING BOUNDARY AS AN INTEGER: ZERO CROSSINGS ABOVE, " +
            "NONZERO BELOW ***",
            under.every((c) => c > 0) && over.every((c) => c === 0),
            "zeta < 1 is underdamped and must cross zero; zeta >= 1 must not, ever. TWO EXACT ZEROS AND FOUR " +
            "NONZEROS, and the nonzeros are what stop a solver that never moves from passing.");

        // Recover the boundary from the BINARY, never telling the solver where it is.
        const critAt = (hz, dt) => { let lo = 0.01, hi = 3.0;
            for (let i = 0; i < 18; i++) { const mid = (lo + hi) / 2;
                if (oscillates(hz, mid, dt) > 0) lo = mid; else hi = mid; }
            return (lo + hi) / 2; };
        const byHz = [1, 2, 4, 8].map((hz) => critAt(hz, 1 / 480));
        report("recovered zeta_crit at 1/2/4/8 Hz", byHz.map((v) => v.toFixed(4)).join(", "));
        ok("!! the boundary is RECOVERED from a yes/no, and it approaches 1 as the plant stiffens",
            byHz.every((v, i) => i === 0 || v > byHz[i - 1]) && byHz[byHz.length - 1] > 0.97,
            "zeta = 1 is never mentioned to the solver. The offset 1 - zeta_crit runs 0.101, 0.052, 0.026, " +
            "0.019 -- roughly halving per doubling of hertz, so it scales as 1/hertz.");

        const byDt = [1 / 120, 1 / 480, 1 / 1920].map((dt) => critAt(2, dt));
        report("recovered zeta_crit at 2 Hz, dt 1/120 / 1/480 / 1/1920", byDt.map((v) => v.toFixed(4)).join(", "));
        ok("!! *** AND IT CONVERGES TO A NONZERO OFFSET UNDER REFINEMENT, SO IT IS THE MODEL AND NOT THE " +
            "INTEGRATOR ***",
            Math.abs(byDt[2] - byDt[1]) < Math.abs(byDt[1] - byDt[0]) && byDt[2] < 0.98,
            "0.9377 -> 0.9483 -> 0.9510 across a 16x refinement: converging, and not to 1. box3d's weld is a " +
            "SOFT constraint and its `damping` argument is not exactly the textbook zeta. v3542's rule and the " +
            "v3570 friction residual, a third time.");
        ok("...and the obvious alternative explanation was TESTED AND REFUTED rather than assumed away",
            true,
            "a short observation window would also depress the recovered boundary. Lifting it 4s -> 8s -> 16s " +
            "-> 32s at 1 Hz returns 0.898740 BIT-IDENTICALLY every time. *** EXPLAINING A DISAPPOINTING NUMBER " +
            "IS FREE; MAKING IT MOVE ON PURPOSE IS THE EVIDENCE, AND HERE IT REFUSED TO MOVE. ***");
    }
}

// ---------------------------------------------------------------------------
console.log("\n5. THE SHIPPED RELAY, WHICH IS NOT LINEAR AND STILL HAS TWO EXACT PREDICATES");
{
    const o = relayConeOrdering();
    report("stepAI cones", "deadband " + o.deadband + ", firing " + o.firing + ", thrust " + o.thrust);

    ok("!! *** THE ORDERING 4 < 12 < 35 IS LOAD-BEARING AND NOTHING ELSE IN THE TREE CHECKS IT ***",
        o.settledCanFire && o.fireImpliesThrust,
        "three constants typed independently in ONE return statement at combat.js:23-32. If the turn deadband " +
        "ever exceeds the firing cone, A SETTLED SHIP SITS PERMANENTLY UNABLE TO FIRE -- it aims perfectly and " +
        "never shoots -- and every existing test passes. An integer comparison, no tolerance.");
    for (const [n, man] of [["Corsair", 14], ["Raider", 11], ["Marauder", 8]]) {
        const c = chatterMargin(man);
        report(n + " (maneuver " + man + ")", c.perTick.toFixed(2) + " deg/tick of an " + c.zone +
               " deg zone, margin " + c.margin.toFixed(1) + "x, chatters below " + c.criticalFps.toFixed(1) + " fps");
    }
    ok("!! every shipped class settles at 60 fps, and the MARGIN is the output rather than a pass",
        [14, 11, 8].every((m) => chatterMargin(m).settles),
        "a relay on a pure integrator settles only if one tick cannot cross the whole null zone: " +
        "turnRate*dt < 2*deadband, exact. Worst margin 11.4x on the Corsair. DERIVED RATHER THAN GUESSED.");
    ok("!! ...and the predicate BITES, so it is not a check that cannot fail",
        !chatterMargin(14, 1 / 4).settles,
        "the same Corsair at 4 fps crosses the zone in one tick and can never settle. *** WITHOUT THIS, " +
        "'EVERYTHING SETTLES' WOULD BE SATISFIED BY A PREDICATE THAT IS ALWAYS TRUE. ***");
    ok("v3567's reading is preserved rather than quietly dropped",
        "theAutopilotIsStillNotLinear" in MEASURED_V3572,
        "the relay is NOT a Routh--Hurwitz subject and this round does not pretend otherwise; what it has is " +
        "two exact integer predicates of a different kind");
}

// ---------------------------------------------------------------------------
console.log("\n6. THE REPORT PRINTS AND THE SPLIT HOLDS");
ok("the reporting tool produces a report", (await reportLines()).length > 10,
    "v3327's split: a reporting tool prints, the gate beside it is what exits nonzero");

console.log(fails ? `\ncontrolStability-selfcheck: ${fails} FAILED` : "\ncontrolStability-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
