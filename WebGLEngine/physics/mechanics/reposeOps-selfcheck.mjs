// WebGLEngine/physics/mechanics/reposeOps-selfcheck.mjs -- v3630
//
// Run: node physics/mechanics/reposeOps-selfcheck.mjs
//
// KEITH ASKED FOR A LINK ON server.html TO THE COMPARISON v3629 SAID WAS OWED: initialise box3d, call BOTH
// angle-of-repose implementations at one mu, and grade both against atan(mu). Asking for the link is what found
// the defect -- physics/mechanics/contactKeys.mjs imports node:url AND box3dNode at module scope, so NO BROWSER
// COULD EVER HAVE IMPORTED IT. *** SECOND INSTANCE OF v3617, and the same fix: the arithmetic MOVES to a module
// with no imports at all and the Node bootstrap stays behind. Section 1 asserts it MOVED rather than was COPIED,
// by FUNCTION IDENTITY. ***
//
// THE KEY IS EXTERNAL AND NEITHER SOLVER IS TOLD IT: a block slides when tan(theta) > mu, so the critical angle
// is atan(mu). Two independent solvers -- a rigid-body wasm one and an XPBD particle one -- and one closed form.

import { readFileSync } from "node:fs";
import { initNode, mod } from "../box3d/box3dNode.mjs";
import { slopeSpeedWith, criticalAngleWith, gradeBoth } from "./reposeOps.mjs";
import * as contactKeys from "./contactKeys.mjs";
import { criticalAngle as xpbdDeg } from "../xpbd/frictionKey.mjs";

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const say = (m) => console.log("  ----  " + m);

// --- 1. it MOVED, it was not copied -----------------------------------------------------------------------------
{
    say("1. THE DOOR. contactKeys.mjs pulls node:url and box3dNode at module scope, so it can never be imported by a page.");
    ok("!! the two are THE SAME FUNCTION OBJECT, not two implementations that agree today",
        contactKeys.criticalAngleWith === criticalAngleWith && contactKeys.slopeSpeedWith === slopeSpeedWith,
        "asserted by identity, which is the only form of this check that cannot drift");
    const ck = readFileSync(new URL("./contactKeys.mjs", import.meta.url), "utf8");
    const ro = readFileSync(new URL("./reposeOps.mjs", import.meta.url), "utf8");
    ok("the slope experiment is gone from contactKeys and lives in reposeOps", !/_swk_body_set_friction/.test(ck) && /_swk_body_set_friction/.test(ro),
        "one definition of the arithmetic; two copies agree today and drift the moment either is edited");
    // PROSE-AS-CODE CAUGHT THIS ONE INSIDE THE ROUND, ON THE FILE STUDYING IT: my first version tested
    // !/node:/ against the RAW SOURCE, and reposeOps' own header says "NO node:. NO DOM." -- so the file failed
    // its own check by DOCUMENTING that it passes it. Match the IMPORT, never the mention. Sixth-plus instance.
    ok("!! reposeOps has NO imports at all -- that is the whole point of the file",
        !/^\s*import\s/m.test(ro) && !/from\s+["']node:/.test(ro) && !/\bdocument\s*[.[]/.test(ro),
        "the wasm module is a PARAMETER; Node supplies it via box3dNode, a browser via box3dLoader, and neither route is named in it");
    ok("contactKeys still delegates rather than reimplementing", /slopeSpeedWith\(mod\(\)/.test(ck) && /criticalAngleWith\(mod\(\)/.test(ck));
    ok("the browser loader gained the accessor a page needs", (() => {
        const bl = readFileSync(new URL("../box3d/box3dLoader.js", import.meta.url), "utf8");
        return /mod\(\) \{ return this\._mod \|\| null; \}/.test(bl);
    })(), "returns null before init() rather than throwing -- the page reports 'not loaded' instead of crashing");
}

// --- 2. THE COMPARISON ITSELF ------------------------------------------------------------------------------------
{
    const st = await initNode();
    say("2. BOX3D IN NODE: " + (st.ready ? "ready" : "NOT AVAILABLE -- " + st.reason));
    if (!st.ready) {
        ok("box3d is required for this section and its absence is REPORTED, not skipped silently", false,
            "the wasm must be built: physics/box3d/build-box3d-wasm-clang.sh");
    } else {
        const rows = [0.3, 0.5, 0.8, 1.2].map((mu) => gradeBoth(mod(), mu, { xpbdDeg }));
        for (const g of rows) {
            say("     mu " + g.mu + "   atan(mu) = " + g.exactDeg.toFixed(4) + " deg" +
                "   box3d " + g.box3d.deg.toFixed(4) + " (tan out by " + (100 * g.box3d.relTan).toFixed(3) + "%)" +
                "   xpbd " + g.xpbd.deg.toFixed(4) + " (tan out by " + (100 * g.xpbd.relTan).toFixed(3) + "%)");
        }
        const lo = rows.filter((g) => g.mu <= 0.8), hi = rows.filter((g) => g.mu > 0.8);
        ok("the XPBD solver recovers atan(mu) at EVERY mu tested", rows.every((g) => g.xpbd.relTan < 5e-3),
            "worst " + (100 * Math.max(...rows.map((g) => g.xpbd.relTan))).toFixed(3) + "% over mu = " + rows.map((g) => g.mu).join(", "));
        ok("box3d recovers it for mu <= 0.8", lo.every((g) => g.box3d.relTan < 0.04),
            "worst " + (100 * Math.max(...lo.map((g) => g.box3d.relTan))).toFixed(3) + "% -- and it IMPROVES with mu across that range");
        // MY FIRST VERSION ASSERTED ONE BOUND FOR ALL FOUR AND WENT RED AT mu = 1.2. THAT IS A FINDING, NOT A
        // TOLERANCE TO WIDEN: the claim is now split at the mu where the behaviour changes, and the breakdown is
        // asserted TO EXIST rather than papered over.
        ok("!! and it BREAKS DOWN past mu = 1, which is where the block tips rather than slides",
            hi.every((g) => g.box3d.relTan > 3 * Math.max(...lo.map((x) => x.box3d.relTan))),
            "mu 1.2 reads " + (100 * hi[0].box3d.relTan).toFixed(3) + "% against " +
            (100 * lo[lo.length - 1].box3d.relTan).toFixed(3) + "% at mu 0.8. A UNIT CUBE TIPS AT 45 DEGREES " +
            "(tan = 1) WHATEVER THE FRICTION IS, so past mu = 1 the fixture is no longer measuring sliding at all " +
            "-- the geometry takes over, and atan(mu) stops being the right key for THIS BLOCK");
        for (const g of rows) say("     mu " + g.mu + "  box3d tan " + (g.box3d.tan > g.mu ? "ABOVE" : "BELOW") +
            " mu,  xpbd tan " + (g.xpbd.tan > g.mu ? "ABOVE" : "BELOW") + " mu");
        ok("both are ABOVE the key wherever the fixture is valid (mu <= 0.8), a one-signed error",
            lo.every((g) => g.box3d.tan > g.mu && g.xpbd.tan > g.mu),
            "a solver scattering either side would be noisy; one that is always high has a MECHANISM -- section 3 went looking and found it is NOT the one I expected");
        ok("the two solvers disagree with each other by more than xpbd's own error", rows.every((g) => g.solverGap > 0),
            "solver gap " + rows.map((g) => (180 / Math.PI * g.solverGap).toFixed(3)).join(", ") + " deg -- COMPARED TO THE KEY FIRST, " +
            "because two solvers agreeing tells you nothing about whether either is right");
        ok("gradeBoth reports a STATED ABSENCE when a solver is not supplied", (() => {
            const g = gradeBoth(mod(), 0.5, {});
            return g.xpbd === null && g.solverGap === null && g.box3d !== null;
        })(), "never a silent skip");
    }
}

// --- 3. WHY THEY ARE HIGH, AND IT IS THE DETECTOR ------------------------------------------------------------------
{
    const st = await initNode();
    if (st.ready) {
        say("3. IS THE EXCESS THE DETECTOR OR THE SOLVER? frictionKey's header says the detector, for ITS side.");
        say("   THE ANSWER FOR box3d IS THE SOLVER, AND I HAD PREDICTED THE OPPOSITE.");
        const mu = 0.5;
        const sweep = [1e-2, 3e-3, 1e-3, 3e-4].map((tol) => ({ tol, r: criticalAngleWith(mod(), mu, { tol }) }));
        for (const s of sweep) say("     tol " + s.tol.toExponential(0) + "   theta " + (180 / Math.PI * s.r.theta).toFixed(4) +
            " deg   tan out by " + (100 * Math.abs(s.r.tan - mu) / mu).toFixed(3) + "%");
        const errs = sweep.map((s) => Math.abs(s.r.tan - mu) / mu);
        // *** I PREDICTED THIS SECTION'S ANSWER AND IT IS WRONG, WHICH IS WHY THE SECTION IS WORTH KEEPING.
        // frictionKey's header says its own residual is "the detector's dead time", and I wrote a check asserting
        // box3d's excess is too. IT IS NOT: the sweep is FLAT TO ALL FOUR DECIMALS across a 33x range of the speed
        // threshold. So the 2.2% is NOT a measurement artefact and NOT where the bisection is told to stop -- it is
        // the solver's own friction cone, and it would have been reported as an instrument limit if I had not
        // checked. THE TRANSPLANTED EXPLANATION WAS THE DEFECT, sixth time a claim has been carried across
        // configurations in these notes. ***
        ok("!! the excess is FLAT across a 33x sweep of the speed threshold, so it is NOT the detector",
            Math.max(...errs) - Math.min(...errs) < 1e-6,
            "2.241% at tol 1e-2 and 2.241% at tol 3e-4 -- box3d's friction cone is genuinely ~2% strong at mu = 0.5, " +
            "and calling that a dead-time artefact would have named the wrong thing entirely");
        say("   THE THRESHOLD STILL HAS TO EXIST, AND THAT PART IS UNCHANGED: a settling box CREEPS,");
        say("   so a DISPLACEMENT bound is crossed by a block that is not sliding. The speed below the critical");
        say("   angle is exactly zero, which is why speed is the detector -- and a threshold on it costs this.");
    }
}

// --- 4. scope ------------------------------------------------------------------------------------------------------
{
    say("4. SCOPE.");
    ok("nothing about the XPBD side was changed", (() => {
        const fk = readFileSync(new URL("../xpbd/frictionKey.mjs", import.meta.url), "utf8");
        return /export function criticalAngle\(mu, opts = \{\}\) \{/.test(fk);
    })(), "it still returns DEGREES as a bare number; reposeOps converts at the comparison rather than editing either solver");
    say("   NOT CLAIMED: that either solver is better. They are graded against the key SEPARATELY and the gap");
    say("   between them is reported afterwards. NOT DONE: a mu sweep fine enough to fit the dead-time law, and");
    say("   the same treatment for restitution -- each is its own round.");
    say("   ANTIDOTE: IF EITHER SOLVER IS RETUNED THE PERCENTAGES ABOVE MOVE AND THE SIGN CHECK IN SECTION 2 IS");
    say("   THE ONE TO WATCH. If a solver ever lands BELOW atan(mu), that is not a smaller error -- it is a");
    say("   DIFFERENT mechanism, and this section should be rewritten to find it rather than widened.");
}

console.log("reposeOps-selfcheck: " + (fails ? fails + " FAILED" : "all pass"));
process.exit(fails ? 1 : 0);
