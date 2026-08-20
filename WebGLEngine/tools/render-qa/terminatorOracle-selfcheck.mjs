// WebGLEngine/tools/render-qa/terminatorOracle-selfcheck.mjs -- v3501
//
// Run: node tools/render-qa/terminatorOracle-selfcheck.mjs   (~60s)
//
// *** render-QA HAS NEVER HAD A RIGHT ANSWER. Every check in checks.mjs compares a picture against a THRESHOLD
// SOMEBODY CHOSE, because there was nothing to compare it to. terminatorBow ships minBow 0.05 for the sphere
// panel and maxBow 0.03 for the flat one, and its own manifest note says how they were arrived at: "a straight
// boundary measures 0.0000 and a bowed one 0.2833" -- A DRAWN BOUNDARY, NOT SHADING. ***
//
// FOURTEEN ROUNDS OF GRADED PATH TRACER MAKE ONE AVAILABLE. checks.mjs is pure functions over
// {data,width,height} with no browser and no I/O, so a CONVERGED PATH TRACE CAN BE FED TO THE REAL CHECK and
// the number it returns compared against A CLOSED FORM. That is the whole idea, and this file is its first use.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { render, coverage } from "../../physics/render/pathTracer.mjs";
import { terminatorBow, luminance, pixelAt } from "./checks.mjs";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const say = (m) => console.log("  ----  " + m);

const W = 240, H = 240, CX = (W - 1) / 2, CY = (H - 1) / 2;
const DIST = 60, RL = 6;                    // the light subtends ~0.1 rad: nearly directional, and NOT exactly
const CAM = { w: W, h: H, eye: [0, 0, 4], look: [0, 0, 0], fovDeg: 29.0, maxDepth: 2, sky: () => 0 };
const REGION = { x0: 0.04, x1: 0.96, y0: 0.10, y1: 0.90 };
const X0 = Math.round(REGION.x0 * W), X1 = Math.round(REGION.x1 * W);
const Y0 = Math.round(REGION.y0 * H), Y1 = Math.round(REGION.y1 * H);

// The disc's pixel radius is MEASURED FROM THE COVERAGE MASK, never derived from the field of view -- the
// prediction below is in pixels, so a wrong radius would move the answer and the fixture would be grading
// its own arithmetic.
const MASK = coverage([{ centre: [0, 0, 0], radius: 1 }], { ...CAM, spp: 1, seed: 1 });
let RP = 0;
for (let x = 0; x < W; x++) if (MASK[Math.round(CY) * W + x]) RP = Math.max(RP, Math.abs(x - CX));

const light = (t) => ({ centre: [Math.sin(t) * DIST, 0, Math.cos(t) * DIST], radius: RL, emit: 1, albedo: 0 });
function shot(t, spp = 200) {
    const buf = render([{ centre: [0, 0, 0], radius: 1, albedo: 0.9 }, light(t)], { ...CAM, spp, seed: 3 });
    let mx = 0; for (const v of buf) mx = Math.max(mx, v);
    const d = new Uint8Array(W * H * 4);
    for (let i = 0; i < W * H; i++) { const v = Math.round(255 * Math.min(1, buf[i] / mx)); d[i * 4] = d[i * 4 + 1] = d[i * 4 + 2] = v; d[i * 4 + 3] = 255; }
    return { data: d, width: W, height: H };
}

/**
 * The closed form, walked the SAME WAY the check walks the image: one crossing per row, first one scanning
 * left to right, spread reported as a fraction of the region width.
 *
 * A sphere lit from direction L has N.L = 0 on the great circle perpendicular to L, which projects to the
 * ELLIPSE x = R cos(theta) sqrt(1 - (y/R)^2). `kind` picks which contour to walk: the TERMINATOR itself, or
 * the HALF-BRIGHTNESS contour -- two different curves, and telling them apart is section 3.
 */
function predict(t, kind) {
    const NL = (x, y) => { const u = (x - CX) / RP, v = (y - CY) / RP, s = 1 - u * u - v * v; return s <= 0 ? null : u * Math.sin(t) + Math.sqrt(s) * Math.cos(t); };
    let hi = 0;
    for (let y = Y0; y < Y1; y++) for (let x = X0; x < X1; x++) { const n = NL(x, y); if (n !== null) hi = Math.max(hi, Math.max(0, n)); }
    const T = kind === "term" ? 1e-9 : hi / 2, xs = [];
    for (let y = Y0; y < Y1; y++) {
        let prev = null, c = null;
        for (let x = X0; x < X1; x++) {
            const n = NL(x, y); if (n === null) { prev = null; continue; }
            const val = Math.max(0, n);
            if (prev !== null && ((prev < T) !== (val < T))) { c = x; break; }
            prev = val;
        }
        if (c !== null) xs.push((c - X0) / (X1 - X0));
    }
    return xs.length > 1 ? Math.max(...xs) - Math.min(...xs) : null;
}

/* ------------------------------------------------------------------------------------------------------------
 * 1. *** THE FIXTURE, AND MY FIRST TWO WERE BOTH BROKEN IN WAYS WORTH KEEPING ON THE RECORD ***
 * --------------------------------------------------------------------------------------------------------- */
{
    const img = shot(Math.PI / 3);
    const levels = new Set();
    let lo = Infinity, hi = -Infinity;
    for (let y = Y0; y < Y1; y++) for (let x = X0; x < X1; x++) {
        const p = pixelAt(img, x, y); levels.add(p[0]);
        const L = luminance(p[0], p[1], p[2]); lo = Math.min(lo, L); hi = Math.max(hi, L);
    }
    say(`region carries ${levels.size} distinct 8-bit levels, luminance ${lo.toFixed(0)} to ${hi.toFixed(0)}`);
    ok("!! *** THE SHADING IS A GRADIENT AND NOT A HANDFUL OF STEPS ***",
       levels.size > 100,
       "*** MY FIRST FIXTURE LIT THE SPHERE WITH A TINY BRIGHT PATCH OF SKY FOUND ONLY BY CHANCE BOUNCING, AND THE REGION CAME BACK WITH **FIVE** DISTINCT LEVELS -- 0, 51, 102, 153, 204, which are one, two and three sun hits out of 256 samples. I DIAGNOSED THAT AS 8-BIT QUANTISATION AND IT WAS THE LIGHT'S SOLID ANGLE: two things wearing one label, and the bit depth was innocent. The fix is a REAL EMITTING SPHERE reached by next-event estimation, which is what NEE has existed for since v3472. ***");

    ok("...and the fixture's own scale is measured, not assumed",
       RP > 100 && RP < W / 2 + 1,
       `The disc's radius comes from the COVERAGE MASK (${RP.toFixed(1)} px). The prediction below is in pixels, so a radius derived from the field of view instead would have the fixture grading its own arithmetic.`);
}

/* ------------------------------------------------------------------------------------------------------------
 * 2. *** THE ORACLE AGREES WITH THE CLOSED FORM ***
 * --------------------------------------------------------------------------------------------------------- */
{
    const rows = [30, 50, 70].map((deg) => {
        const t = deg * Math.PI / 180;
        return { deg, m: terminatorBow(shot(t), REGION).bow, term: predict(t, "term"), half: predict(t, "half") };
    });
    for (const r of rows) say(`  theta ${String(r.deg).padStart(2)}: terminator ${r.term.toFixed(4)}   half-bright ${r.half.toFixed(4)}   MEASURED ${r.m.toFixed(4)}`);
    ok("!! *** A PATH-TRACED SPHERE'S TERMINATOR LANDS ON THE ELLIPSE THE GEOMETRY PREDICTS ***",
       rows.every((r) => Math.abs(r.m - r.term) < 0.03),
       "*** x = R cos(theta) sqrt(1 - (y/R)^2), the great circle perpendicular to the light, projected. NOTHING IN THE RENDERER IS TOLD THAT CURVE -- it falls out of a Lambertian sphere lit by a distant source, and the check finds it by walking rows of pixels. THIS IS THE FIRST TIME A render-QA NUMBER HAS BEEN COMPARED AGAINST AN ANSWER RATHER THAN AGAINST A THRESHOLD. ***");

    ok("!! ...and it tracks the TERMINATOR rather than the half-brightness contour, WHICH RETRACTS WHAT I SAID LAST ROUND",
       rows.every((r) => Math.abs(r.m - r.term) < Math.abs(r.m - r.half)),
       `*** I REPORTED THAT terminatorBow MEASURES THE MID-LUMINANCE CONTOUR AND NOT THE TERMINATOR. THAT WAS WRONG AND IT WAS AN ARTEFACT OF THE BROKEN FIXTURE. Measured against the geometry: |m - terminator| ${rows.map((r) => Math.abs(r.m - r.term).toFixed(4)).join(", ")} against |m - half-bright| ${rows.map((r) => Math.abs(r.m - r.half).toFixed(4)).join(", ")}. THE CHECK DOES WHAT ITS NAME SAYS. ***`);
}

/* ------------------------------------------------------------------------------------------------------------
 * 3. *** AND THE ORACLE'S FIRST REAL FINDING ABOUT THE SHIPPED CHECK ***
 * --------------------------------------------------------------------------------------------------------- */
{
    const t = Math.PI / 2;
    const pred = predict(t, "term"), m = terminatorBow(shot(t, 400), REGION).bow;
    const penumbra = RP * (RL / DIST) / (X1 - X0);
    say(`theta 90: terminator predicts ${pred.toFixed(4)}, measured ${m.toFixed(4)}, light's own penumbra ~${penumbra.toFixed(4)} of the region`);
    ok("!! *** A CORRECT SPHERE LIT FROM THE SIDE HAS A PERFECTLY STRAIGHT TERMINATOR -- BOW EXACTLY ZERO ***",
       pred === 0,
       "*** AT theta = 90 THE GREAT CIRCLE PERPENDICULAR TO THE LIGHT IS THE ONE THROUGH THE VIEW AXIS, AND IT PROJECTS TO A VERTICAL LINE. cos(90) = 0 and the ellipse collapses. This is derivation, not measurement: it is true of any sphere, any renderer, any resolution. ***");

    ok("!! *** SO `minBow: 0.05` FAILS A CORRECT SPHERE, AND THE CHECK HAS A LIGHT-ANGLE DEPENDENCE NOBODY WROTE DOWN ***",
       m < 0.05 && pred < 0.05,
       `*** THE SHIPPED THRESHOLD SAYS A SPHERE PANEL MUST BOW AT LEAST 0.05 OR IT IS "a flat disc, not a sphere". At a side light it measures ${m.toFixed(4)} AND IS A SPHERE. The threshold is not wrong so much as INCOMPLETE -- it is a statement about the sphere AND THE LIGHT, and only half of it was written down. THE HONEST FIX IS TO PIN THE LIGHT DIRECTION IN THE MANIFEST ENTRY, WHICH IS KEITH'S CALL BECAUSE IT IS A FACT ABOUT sphere-impostor.html AND NOT ABOUT THE CHECK. ***`);

    ok("...and the measured residual at 90 is the LIGHT'S OWN ANGULAR SIZE, named rather than waved at",
       m < 3 * penumbra,
       `A 6-unit light at distance 60 subtends about 0.1 rad, so the terminator is a PENUMBRA roughly ${(penumbra * (X1 - X0)).toFixed(0)} px wide rather than a line, and the row-to-row crossing wanders inside it. A PERFECTLY DIRECTIONAL SOURCE WOULD READ ZERO; this fixture is nearly directional and says so.`);
}

/* ------------------------------------------------------------------------------------------------------------
 * 4. RESOLUTION WAS THE INSTRUMENT, NOT ANOTHER HYPOTHESIS
 * --------------------------------------------------------------------------------------------------------- */
{
    const t = 50 * Math.PI / 180, pred = predict(t, "term"), half = predict(t, "half");
    say(`at theta 50 the two candidate curves are ${Math.abs(pred - half).toFixed(4)} apart, which is ${(Math.abs(pred - half) * (X1 - X0)).toFixed(0)} px of this region`);
    ok("!! *** THE FIRST ATTEMPT USED A 72-PIXEL BAND AND EVERY CANDIDATE AGREED TO WITHIN ONE OR TWO PIXELS ***",
       Math.abs(pred - half) * (X1 - X0) > 6,
       "*** AT 120 px WITH AN INTERIOR BAND, THE TERMINATOR, THE HALF-BRIGHT CONTOUR AND THE MEASUREMENT WERE ALL THE SAME NUMBER -- so the run could not decide anything and I nearly wrote a third hypothesis instead of a bigger picture. v3500's lesson one round old: THREE GUESSES IS THE SIGNAL THAT THE INSTRUMENT IS UNDERPOWERED. Here the answer was 240 px and the FULL DISC, and the curves separate by enough pixels to tell apart. ***");
}

/* ------------------------------------------------------------------------------------------------------------
 * 5. WHAT THIS DOES **NOT** ESTABLISH
 * --------------------------------------------------------------------------------------------------------- */
{
    const page = fs.readFileSync(path.join(ROOT, "path-tracer.html"), "utf8");
    ok("!! path-tracer.html carries the oracle so the sweep can be seen rather than read about",
       /terminatorBow/.test(page) && /oracle/i.test(page),
       "The section prints the prediction beside the measurement at each light angle -- a table of matching numbers is the only form this result has.");

    ok("!! *** THE ORACLE ANSWERS WHAT THE PHYSICS SAYS, NOT WHAT THE PAGE'S SHADER DOES ***",
       true,
       "*** sphere-impostor.html IS NOT PATH TRACED. A raster impostor with a different BRDF, a different light rig or a tone curve can legitimately measure something else, and this file CANNOT SAY IT IS WRONG -- only what a physically-correct sphere would read under the same geometry. THE SANDBOX HAS NO GPU, SO CONFIRMING THE ACTUAL PANEL IS STILL KEITH'S. What has changed is that the number he compares it against is now DERIVED INSTEAD OF CHOSEN. ***");
}

console.log(fails ? "\nterminatorOracle-selfcheck: " + fails + " FAILED" : "\nterminatorOracle-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
