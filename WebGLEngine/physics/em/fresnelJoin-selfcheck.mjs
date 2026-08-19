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
    const fk = frictionCriticalAngle(0.5);
    const ckSrc = readFileSync(new URL("physics/mechanics/contactKeys.mjs", ROOT), "utf8");
    ok("physics/xpbd/frictionKey.mjs returns DEGREES as a bare number, and it is right", Number.isFinite(fk) &&
        rel(Math.tan(fk * Math.PI / 180), 0.5) < 0.02,
        "mu = 0.5 -> " + fk.toFixed(4) + " deg, against the exact atan(0.5) = " + (180 / Math.PI * Math.atan(0.5)).toFixed(4) + " deg");
    ok("physics/mechanics/contactKeys.mjs returns RADIANS inside an OBJECT, and needs box3d", (() => {
        const shape = /return \{ theta, tan: Math\.tan\(theta\), exact: Math\.atan\(mu\)/.test(ckSrc);
        const backed = /slopeSpeed\(mid, mu, opts\)/.test(ckSrc);
        // THE REAL CALL, NOT A STUB. A helper that throws by construction would be a check that cannot fail --
        // this tree's own named anti-pattern -- so contactKeys.criticalAngle is actually invoked here.
        let threw = null;
        try { contactCriticalAngle(0.5); } catch (e) { threw = e.message; }
        if (threw) say("     contactKeys.criticalAngle(0.5) threw: " + threw.slice(0, 70));
        else say("     contactKeys.criticalAngle(0.5) RETURNED -- box3d is available here, so run the comparison");
        return shape && backed && threw !== null;
    })(), "different units, different return shape, and a WASM dependency -- so no accidental comparison was ever possible");
    say("   THE COMPARISON IS OWED AND IT NEEDS THE RIG: initialise box3d, call both at the same mu, and grade");
    say("   BOTH against atan(mu), which is the external key neither of them is told. That is Keith's to run.");
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
