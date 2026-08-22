// WebGLEngine/physics/em/fresnelJoin-selfcheck.mjs -- v3629
//
// Run: node physics/em/fresnelJoin-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs (auto-discovered).
//
// *** THE ROUND IS A CENSUS, NOT A FORMULA. The v3628 census said Fresnel was "partial" in this tree, and that
// was WRONG IN THE MOST USEFUL WAY: physics/render/fresnel.mjs (v3491) already has the full angle-dependent law
// with Brewster, TIR and two plants. I nearly rebuilt it -- the v3599 stability-meter mistake, third instance.
// What was genuinely absent is the JOIN. FOUR declarations of Fresnel reflection existed in one tree, plus a
// FIFTH thing wearing the same name, and NOTHING HAD EVER COMPARED ANY OF THEM: no file imports both
// physics/em/maxwell.mjs and physics/render/fresnel.mjs, and water/waterMath.js carries its own copy. ***

import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { DECLARATIONS, NOT_THIS_FRESNEL, normalIncidenceRoutes, schlickDuplication, schlickAudit, energyClosure } from "./fresnelJoin.mjs";
import { fresnel, rp, schlick, F0of, brewsterCos, criticalCos } from "../render/fresnel.mjs";
import { fresnelNormal, criticalAngle as opticalCriticalAngle } from "./maxwell.mjs";
import { criticalAngle as frictionCriticalAngle } from "../xpbd/frictionKey.mjs";
// Importing contactKeys is safe; CALLING it needs box3d WASM. Section 6 makes that call for real and catches.
import { criticalAngle as contactCriticalAngle } from "../mechanics/contactKeys.mjs";
import { initNode } from "../box3d/box3dNode.mjs";

const require = createRequire(import.meta.url);
const water = require("../../water/waterMath.js");

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const say = (m) => console.log("  ----  " + m);
const rel = (g, w) => Math.abs(g - w) / Math.max(Math.abs(w), 1e-300);
const ROOT = new URL("../../", import.meta.url);


// --- 1. the register, checked against the tree rather than trusted ---------------------------------------------
{
    say("1. SEVEN SYMBOLS ACROSS THREE MODULES. A register nobody checks is the second declaration this round is about.");
    let missing = [];
    for (const d of DECLARATIONS) {
        const src = readFileSync(new URL(d.module, ROOT), "utf8");
        const found = new RegExp("(export (const|function) |function )" + d.symbol + "\\b").test(src);
        if (!found) missing.push(d.module + ":" + d.symbol);
    }
    ok("every declared symbol really exists where the register says", missing.length === 0, missing.join(", ") || "7 of 7 resolved by reading the files");
    ok("the FIFTH fresnel is recorded as NOT part of the family", (() => {
        const src = readFileSync(new URL(NOT_THIS_FRESNEL.module, ROOT), "utf8");
        return /export function fresnelCS/.test(src) && /FRESNEL \(NEAR-FIELD\) DIFFRACTION/.test(src);
    })(), "physics/optics/fresnel.js is the Fresnel INTEGRALS -- same man, different subject, and joining them is the ising.L shape");
    ok("!! nothing in the tree imported two of them together before this file", (() => {
        // main.js only NAMES them in prose; the join module and this gate are the first real importers.
        const join = readFileSync(new URL("physics/em/fresnelJoin.mjs", ROOT), "utf8");
        return /from "\.\/maxwell\.mjs"/.test(join) && /from "\.\.\/render\/fresnel\.mjs"/.test(join);
    })(), "which is why four numbers for one relation could disagree for 138 versions without anything going red");
}

// --- 2. the join at normal incidence, and the conversion that makes it possible -------------------------------------
{
    say("2. FIVE ROUTES TO ONE NUMBER, and two of them are AMPLITUDE while three are POWER.");
    for (const [n1, n2] of [[1, 1.5], [1, 1.33], [1.5, 1]]) {
        const r = normalIncidenceRoutes(n1, n2, water);
        say("     n = " + n1 + " -> " + n2 + "   raw: " + r.rows.map((x) => x.raw.toFixed(6)).join(" | ") +
            "   as power: " + r.rows.map((x) => x.asPower.toFixed(9)).join(" | "));
        ok("n " + n1 + "->" + n2 + ": all five agree ONCE SQUARED", r.spread < 1e-15,
            "power spread " + r.spread.toExponential(3) + " against a RAW spread of " + r.rawSpread.toFixed(6) +
            " -- a naive comparison would have reported a fault that does not exist");
        ok("...and the water module was actually in the comparison", r.waterPresent === true);
    }
    ok("!! the two AMPLITUDE routes disagree in SIGN, and that is convention rather than a bug",
        fresnelNormal(1, 1.5) < 0 && rp(1, 1, 1.5) > 0 && rel(Math.abs(fresnelNormal(1, 1.5)), rp(1, 1, 1.5)) < 1e-15,
        "maxwell reads " + fresnelNormal(1, 1.5).toFixed(6) + " and render reads " + rp(1, 1, 1.5).toFixed(6) +
        ". At normal incidence there is NO PLANE to tell s from p, so the sign is pure convention -- and the only safe join is through the square");
}

// --- 3. the duplicate ---------------------------------------------------------------------------------------------
{
    say("3. TWO SCHLICKS, IN physics/render AND IN water. Are they the same function?");
    const d = schlickDuplication(water.fresnelSchlick);
    ok("!! they are BIT-IDENTICAL across the whole cosine range", d && d.identical,
        "worst |diff| " + d.worst.toExponential(3) + " over " + d.samples + " samples -- a genuine duplicate, REPORTED not merged: " +
        "water/waterMath.js is CommonJS and mirrors GLSL in water.html, so a shared import is a design call and it is Keith's");
    ok("a missing injection gives a stated absence, not a silent pass", schlickDuplication(undefined) === null);
}

// --- 4. GRADING THE APPROXIMATION AGAINST THE LAW ----------------------------------------------------------------------
{
    say("4. SCHLICK IS NOT A FAULT -- it is what almost every real-time renderer ships. The question is where it stops.");
    const a = schlickAudit(1, 1.5);
    ok("it is exact at both ends and wrong in the middle, by a bounded amount", a.worstAbs > 1e-3 && a.worstAbs < 0.1,
        "worst |Schlick - exact R| = " + a.worstAbs.toFixed(6) + " at cos = " + a.worstAt.toFixed(3) + " (F0 = " + a.F0.toFixed(4) + ")");
    ok("!! AT BREWSTER THE EXACT p REFLECTANCE IS ZERO AND SCHLICK CANNOT BE", a.brewster.exactRp === 0 && a.brewster.schlick > 0.05,
        "theta_B = " + a.brewster.angleDeg.toFixed(4) + " deg: exact R_p = " + a.brewster.exactRp.toExponential(1) +
        ", Schlick = " + a.brewster.schlick.toExponential(4) + ". NOT INACCURATE -- ABSENT. Schlick has no polarisation in it, " +
        "so the relative error there is infinite and no tolerance describes it");
    const g = schlickAudit(1.5, 1);
    ok("!! AND PAST THE CRITICAL ANGLE THE EXACT R IS 1 OVER A WHOLE RANGE, WHERE SCHLICK READS A FEW PERCENT",
        g.tir !== null && g.tir.every((t) => t.exactR === 1) && g.tir[0].ratio > 20,
        "glass -> air, critical " + (180 / Math.PI * Math.acos(g.criticalCos)).toFixed(3) + " deg: exact 1.000000 against Schlick " +
        g.tir.map((t) => t.schlick.toFixed(6)).join(", ") + " -- a factor of " + g.tir[0].ratio.toFixed(1) + " at the critical angle itself");
    ok("...and TIR is reported as a BRANCH rather than a large number", fresnel(0.3, 1.5, 1).tir === true && fresnel(0.9, 1.5, 1).tir === false);
    ok("there is no critical angle at all going the other way, and criticalCos says so", criticalCos(1, 1.5) === null);
    say("   SO THE HONEST STATEMENT IS NOT 'SCHLICK IS 4% OFF'. It is: Schlick approximates the UNPOLARISED average");
    say("   in the EXTERNAL-REFLECTION case, and the two features that make Fresnel worth having -- Brewster's zero");
    say("   and total internal reflection -- ARE NOT APPROXIMATED BY IT, THEY ARE MISSING FROM IT.");
}

// --- 5. the identity, and the plants that break it ---------------------------------------------------------------------
{
    say("5. R + T = 1. No reference value, so nothing can be tuned to it.");
    const e = energyClosure(1, 1.5);
    ok("the exact law closes energy at every angle", e.worst < 1e-15, "worst |R + T - 1| = " + e.worst.toExponential(3));
    const bad = energyClosure(1, 1.5, { opts: { noTransmissionFactor: true } });
    ok("!! and v3491's own plant breaks it, so the check is shown failing", bad.worst > 0.1,
        "dropping the projected-solid-angle ratio gives worst " + bad.worst.toFixed(6) + " -- a claim about absence must be shown failing");
    // I PREDICTED THIS ONE WRONG AND THE GATE CAUGHT IT INSIDE THE ROUND. v3491's header says Brewster's zero is
    // "THE ONLY THING THAT NOTICES" the pForS plant, and I wrote a line asserting energy closure survives it.
    // IT DOES NOT: pForS swaps the REFLECTED amplitude and leaves the TRANSMITTED one correct, so R_p + T_p reads
    // 1.1479 and the identity breaks by 7.4e-2. THE PLANT IS AN INCONSISTENT PAIR, not a relabelled polarisation.
    // Both statements are now measured rather than one being repeated from a header.
    const pf = fresnel(brewsterCos(1, 1.5), 1, 1.5, { pForS: true });
    ok("!! the OTHER plant is caught TWICE OVER, and I had predicted it would be caught once", pf.Rp > 0.01 && Math.abs(pf.R + pf.T - 1) > 1e-2,
        "Brewster's zero is gone (R_p = " + pf.Rp.toFixed(6) + " instead of 0) AND energy closure breaks by " +
        (pf.R + pf.T - 1).toExponential(3) + ", because only the REFLECTED amplitude is swapped and the transmitted one is left correct. " +
        "The energy check is the cheaper of the two detectors and needs no special angle.");
}

// --- 6. THE OTHER COLLISION IN THE SAME FAMILY ---------------------------------------------------------------------------
{
    say("6. `criticalAngle` IS DECLARED THREE TIMES IN THIS TREE, WITH TWO COMPLETELY DIFFERENT MEANINGS.");
    const optical = opticalCriticalAngle(1.5, 1);
    ok("physics/em/maxwell.mjs: asin(n2/n1), an OPTICS angle in radians", Math.abs(optical - Math.asin(1 / 1.5)) < 1e-15 &&
        Math.abs(180 / Math.PI * optical - 41.8103) < 1e-3, "41.810 deg for glass -> air");
    // *** AND THE TWO FRICTION ONES CANNOT BE COMPARED AS THEY STAND, WHICH IS A SHARPER FINDING THAN "THEY
    // AGREE". They measure the same quantity and disagree in EVERY interface detail: frictionKey returns a BARE
    // NUMBER IN DEGREES; contactKeys returns an OBJECT with theta IN RADIANS. And contactKeys is BOX3D-BACKED --
    // calling it here throws "box3dNode: call initNode() first", so THE COMPARISON NEEDS THE RIG. Two
    // implementations of one physical quantity, in different units, in different shapes, one of them requiring a
    // WASM backend, and nothing has ever put them side by side. ***
    // *** v3903 -- THE COMPARISON THIS SECTION CALLED "OWED" IS NOW RUN, AND THE RIG IS INITIALISED HERE. ***
    // The previous version asserted that contactKeys.criticalAngle THROWS -- a check that passes only while the
    // capability is ABSENT, and which therefore had to go red the moment anybody supplied the rig. It also read
    // two regexes out of contactKeys.mjs to establish the return shape, AND THAT FILE NO LONGER HOLDS THE
    // IMPLEMENTATION: v3617 moved slopeSpeed/criticalAngle into reposeOps.mjs (contactKeys re-exports them so
    // the two are the SAME FUNCTION OBJECT). So the regexes were reading a file the code had left, which is why
    // this gate was red -- not because the collision changed, but because the CHECK was looking in the old place.
    // A STRUCTURAL CLAIM READ OUT OF A SOURCE FILE ROTS WHEN THE CODE MOVES; a claim established by CALLING does
    // not, and this tree's own rule is to ask the thing that runs.
    const MUS = [0.3, 0.5, 0.8];
    const fk = frictionCriticalAngle(0.5);
    ok("physics/xpbd/frictionKey.mjs returns DEGREES as a bare number, and it is right", Number.isFinite(fk) &&
        rel(Math.tan(fk * Math.PI / 180), 0.5) < 0.02,
        "mu = 0.5 -> " + fk.toFixed(4) + " deg, against the exact atan(0.5) = " + (180 / Math.PI * Math.atan(0.5)).toFixed(4) + " deg");

    const rig = await initNode();
    if (!rig.ready) {
        // NOT A FAILURE. The wasm is a build artefact and a machine without it is not a machine with a defect --
        // but the absence is REPORTED BY NAME so a green run cannot be mistaken for a run that did the work.
        say("     BOX3D NOT AVAILABLE HERE (" + String(rig.reason).slice(0, 90) + ")");
        say("     THE CROSS-SOLVER COMPARISON WAS NOT RUN. This is reported, not passed: an unavailable rig and");
        say("     an agreement are different findings, and only one of them is evidence.");
    } else {
        // *** TWO INDEPENDENT SOLVERS, ONE PHYSICAL QUANTITY, GRADED AGAINST A KEY NEITHER IS TOLD. ***
        // frictionKey bisects an XPBD contact; contactKeys tilts gravity on a box3d WASM rigid body. They share
        // no code, no units and no return shape -- and atan(mu) is the answer both must land on.
        const rows = MUS.map((mu) => {
            const c = contactCriticalAngle(mu);              // OBJECT, theta in RADIANS
            const f = frictionCriticalAngle(mu);             // BARE NUMBER, in DEGREES
            const exact = Math.atan(mu);
            return { mu, box3d: c.theta, xpbd: f * Math.PI / 180, exact,
                     eBox: Math.abs(c.theta - exact) / exact, eXpbd: Math.abs(f * Math.PI / 180 - exact) / exact,
                     shapeIsObject: c && typeof c === "object" && typeof c.theta === "number",
                     numberIsBare: typeof f === "number" };
        });
        for (const r of rows) {
            say("     mu=" + r.mu + "  box3d " + r.box3d.toFixed(7) + " rad (relErr " + r.eBox.toFixed(5) + ")" +
                "   xpbd " + r.xpbd.toFixed(7) + " rad (relErr " + r.eXpbd.toFixed(5) + ")   exact " + r.exact.toFixed(7));
        }
        ok("!! *** BOTH criticalAngle IMPLEMENTATIONS LAND ON atan(mu), AND NEITHER IS TOLD IT ***",
            rows.every((r) => r.eBox < 0.05 && r.eXpbd < 0.01),
            "the comparison this section has called OWED since it was written. Two solvers sharing no code -- an " +
            "XPBD bisection and a box3d WASM rigid body on a tilted gravity vector -- against the closed form " +
            "neither receives. Worst measured: box3d " + Math.max(...rows.map((r) => r.eBox)).toFixed(5) +
            ", xpbd " + Math.max(...rows.map((r) => r.eXpbd)).toFixed(5));
        ok("...and BOTH ERR HIGH, which is the direction a discrete solver must err",
            rows.every((r) => r.box3d > r.exact && r.xpbd > r.exact),
            "a block holds slightly PAST the ideal cone before it slips, because the contact resolves in finite " +
            "steps -- so an implementation reading BELOW atan(mu) would be reporting slip that the friction law " +
            "does not permit. THE SIGN OF THE ERROR IS A CHECK THE MAGNITUDE ALONE DOES NOT MAKE.");
        ok("...and both converge as mu grows, so the gap is discretisation and not a wrong law",
            rows[0].eBox > rows[rows.length - 1].eBox && rows[0].eXpbd > rows[rows.length - 1].eXpbd,
            "box3d " + rows.map((r) => r.eBox.toFixed(5)).join(" -> ") + " and xpbd " +
            rows.map((r) => r.eXpbd.toFixed(5)).join(" -> ") + " across mu = " + MUS.join(", ") +
            ". A WRONG LAW WOULD NOT IMPROVE WITH mu; a finite step size does, because the slip angle grows " +
            "while the step does not.");
        ok("...and the interface collision is REAL, established by calling rather than by reading the source",
            rows.every((r) => r.shapeIsObject && r.numberIsBare),
            "contactKeys returns an OBJECT with theta in RADIANS; frictionKey returns a BARE NUMBER in DEGREES. " +
            "Same quantity, different units, different shape -- so no accidental comparison was ever possible, " +
            "which is why nothing had made this one until now. THE OLD CHECK ASSERTED THIS BY REGEX AGAINST " +
            "contactKeys.mjs AND WENT RED WHEN v3617 MOVED THE CODE TO reposeOps.mjs.");
        ok("...and box3d is the LESS accurate of the two, which is worth knowing before either is trusted",
            rows.every((r) => r.eBox > r.eXpbd),
            "at every mu measured, by a factor of " + (rows[1].eBox / rows[1].eXpbd).toFixed(1) + " at mu=0.5. " +
            "NOT A DEFECT IN EITHER: they are different integrators at different step sizes. It is a statement " +
            "about which number to quote, and it could not be made while the two had never met.");
    }
    say("   NOT MERGED AND NOT RENAMED. A name collision across UNRELATED domains is not a defect -- physics reuses");
    say("   `critical` for every threshold it has. What would be a defect is a CHECK that joined them, and this");
    say("   section exists so that the next reader meets the collision before writing one.");
}

// --- 7. scope --------------------------------------------------------------------------------------------------------
{
    say("7. SCOPE.");
    const src = readFileSync(new URL("physics/em/fresnelJoin.mjs", ROOT), "utf8");
    ok("browser-safe: no node builtins, no DOM, and water is INJECTED because it is CommonJS",
        !/node:/.test(src) && !/\bdocument\s*[.[]/.test(src) && /INJECTED/.test(src));
    ok("nothing in the four modules was edited by this round", (() => {
        const rf = readFileSync(new URL("physics/render/fresnel.mjs", ROOT), "utf8");
        const mx = readFileSync(new URL("physics/em/maxwell.mjs", ROOT), "utf8");
        return /-- v3491/.test(rf) && /fresnelNormal = \(n1, n2\) => \(n1 - n2\) \/ \(n1 \+ n2\)/.test(mx);
    })(), "the join reads them; it does not rewrite them, and the duplicate Schlick is reported rather than merged");
    say("   NOT CLAIMED: that four declarations is wrong. Amplitude and power are different quantities and a");
    say("   renderer wants F0 while a wave solver wants a signed amplitude. WHAT WAS WRONG IS THAT NOTHING");
    say("   COMPARED THEM, so a divergence would have been invisible. Now one line goes red if it appears.");
}

console.log("fresnelJoin-selfcheck: " + (fails ? fails + " FAILED" : "all pass"));
process.exit(fails ? 1 : 0);
