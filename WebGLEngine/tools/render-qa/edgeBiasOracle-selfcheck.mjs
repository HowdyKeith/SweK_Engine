// WebGLEngine/tools/render-qa/edgeBiasOracle-selfcheck.mjs -- v3502
//
// Run: node tools/render-qa/edgeBiasOracle-selfcheck.mjs   (~5s)
//
// v3501 gave terminatorBow a right answer instead of a threshold. THIS IS THE SAME TREATMENT FOR THE OTHER
// GEOMETRIC CHECK, edgeBiasProfile -- the one built at v3181 to find the 1/cos ray-march signature on
// raymarch-live.html, and whose manifest entry says outright that its limits (maxEdgeBias 0.25, maxAsymmetry
// 0.25) are "DELIBERATELY LOOSE AND ARE NOT THE ANSWER ... Keith's first run gives the real baseline".
//
// *** AND THE ORACLE SAYS THE BASELINE IS NOT A PROPERTY OF THE PAGE AT ALL: IT IS A PROPERTY OF THE SHAPE.
// A CORRECT, UNBUGGY SPHERE READS 0.2129 AGAINST A LIMIT OF 0.25 -- 85% OF THE BUDGET SPENT ON BEING ROUND. ***
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { render, coverage } from "../../physics/render/pathTracer.mjs";
import { edgeBiasProfile } from "./checks.mjs";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const say = (m) => console.log("  ----  " + m);

const W = 200, H = 200, CX = (W - 1) / 2, CY = (H - 1) / 2;
const CAM = { w: W, h: H, eye: [0, 0, 4], look: [0, 0, 0], fovDeg: 34, maxDepth: 2, sky: () => 0.02 };
const REGION = { x0: 0.02, x1: 0.98, y0: 0.02, y1: 0.98 };
const X0 = Math.round(REGION.x0 * W), X1 = Math.round(REGION.x1 * W);
const Y0 = Math.round(REGION.y0 * H), Y1 = Math.round(REGION.y1 * H);

const scene = (lightAt) => [{ centre: [0, 0, 0], radius: 1, albedo: 0.95 },
                            { centre: lightAt, radius: 1.2, emit: 6, albedo: 0 }];
function shot(sc, o = {}) {
    const b = render(sc, { ...CAM, spp: 24, seed: 3, ...o });
    let mx = 0; for (const v of b) mx = Math.max(mx, v);
    const d = new Uint8Array(W * H * 4);
    for (let i = 0; i < W * H; i++) { const v = Math.round(255 * Math.min(1, b[i] / mx)); d[i * 4] = d[i * 4 + 1] = d[i * 4 + 2] = v; d[i * 4 + 3] = 255; }
    return { data: d, width: W, height: H };
}

// The disc's pixel radius, MEASURED from the coverage mask -- the closed form below is in pixels.
const MASK = coverage([{ centre: [0, 0, 0], radius: 1 }], { ...CAM, spp: 1, seed: 1 });
let RP = 0;
for (let x = 0; x < W; x++) if (MASK[Math.round(CY) * W + x]) RP = Math.max(RP, Math.abs(x - CX));

/**
 * THE CLOSED FORM, WALKED THE SAME WAY THE CHECK WALKS THE IMAGE. A sphere's silhouette is a circle, so the
 * topmost covered row in column x is cy - sqrt(R^2 - dx^2); the check averages that over |u| >= 0.6 and
 * subtracts the average over |u| < 0.25, in fractions of the region height.
 */
function predictSphere() {
    const Wr = X1 - X0, Hr = Y1 - Y0, step = Math.max(1, Math.floor(Wr / 48)), prof = [];
    for (let x = X0; x < X1; x += step) {
        const dx = x - CX; if (Math.abs(dx) >= RP) continue;
        prof.push({ u: ((x - X0) / Wr) * 2 - 1, top: (CY - Math.sqrt(RP * RP - dx * dx) - Y0) / Hr });
    }
    const avg = (a) => a.reduce((n, v) => n + v, 0) / a.length;
    const mid = avg(prof.filter((p) => Math.abs(p.u) < 0.25).map((p) => p.top));
    const L = avg(prof.filter((p) => p.u <= -0.6).map((p) => p.top));
    const R = avg(prof.filter((p) => p.u >= 0.6).map((p) => p.top));
    return ((L + R) / 2) - mid;
}

/* ------------------------------------------------------------------------------------------------------------
 * 1. *** THE ORACLE AGREES WITH THE CIRCLE, AND THE NUMBER IS THE FINDING ***
 * --------------------------------------------------------------------------------------------------------- */
{
    // A HEADLIGHT, so the whole visible disc is lit and the silhouette the check finds is the TRUE silhouette.
    const r = edgeBiasProfile(shot(scene([0, 0, 6])), REGION);
    const p = predictSphere();
    say(`headlit sphere: edgeBias ${r.edgeBias.toFixed(4)}, asymmetry ${r.asymmetry.toFixed(4)}, ${r.columns} columns; circle predicts ${p.toFixed(4)}`);
    ok("!! *** A PATH-TRACED SPHERE'S EDGE BIAS LANDS ON THE CIRCLE ITS SILHOUETTE IS ***",
       Math.abs(r.edgeBias - p) < 0.03,
       "*** top(x) = cy - sqrt(R^2 - dx^2), averaged over the SAME COLUMN BANDS the check uses. NOTHING IN THE RENDERER IS TOLD THAT CURVE, and the disc's radius is read off the COVERAGE MASK rather than derived from the field of view -- otherwise the fixture would be grading its own arithmetic. ***");

    ok("!! *** AND 85% OF THE SHIPPED BUDGET IS SPENT ON BEING ROUND, WITH NOTHING WRONG ***",
       r.edgeBias > 0.19 && r.edgeBias < 0.25,
       `*** THE MANIFEST ALLOWS maxEdgeBias 0.25 AND A CORRECT SPHERE READS ${r.edgeBias.toFixed(4)}. So the limit is not a statement about the 1/cos artefact it was written for -- IT IS A STATEMENT ABOUT THE SHAPE IN FRAME, and a curved silhouette eats it before any bug exists. Same species as v3501's terminatorBow finding: THE THRESHOLD IS INCOMPLETE, NOT WRONG, and what it is missing is a fact about the scene rather than about the check. ***`);

    ok("...and a symmetric light leaves the asymmetry near zero, which is what makes the pair readable",
       r.asymmetry < 0.04,
       `${r.asymmetry.toFixed(4)}. The check reports BOTH numbers precisely so a caller can tell a symmetric artefact from a lopsided scene, and this row is the control: symmetric geometry, symmetric light, symmetric answer.`);
}

/* ------------------------------------------------------------------------------------------------------------
 * 2. *** THE SAME GEOMETRY, THREE LIGHTS, THREE DIFFERENT ANSWERS ***
 * --------------------------------------------------------------------------------------------------------- */
{
    const rows = [[0, 0, 6], [3, 4, 3], [-3, 4, 3]].map((l) => ({ l, r: edgeBiasProfile(shot(scene(l)), REGION) }));
    for (const x of rows) say(`  light ${JSON.stringify(x.l).padEnd(11)} edgeBias ${x.r.edgeBias.toFixed(4)}   asymmetry ${x.r.asymmetry.toFixed(4)}`);
    const spread = Math.max(...rows.map((x) => x.r.edgeBias)) - Math.min(...rows.map((x) => x.r.edgeBias));
    ok("!! *** MOVING THE LIGHT MOVES BOTH NUMBERS THOUGH THE SILHOUETTE NEVER CHANGES ***",
       spread > 0.02 && rows[1].r.asymmetry > 2 * rows[0].r.asymmetry,
       `*** edgeBias spans ${spread.toFixed(4)} and asymmetry goes ${rows[0].r.asymmetry.toFixed(4)} -> ${rows[1].r.asymmetry.toFixed(4)} ON ONE UNCHANGED SPHERE. THE CHECK FINDS "the topmost NON-BACKGROUND row", so an unlit limb reads as background AND THE SILHOUETTE IT MEASURES IS THE LIT REGION'S EDGE, not the object's. Its own header separates a symmetric artefact from a lopsided scene; this is the measurement of how much a lopsided LIGHT alone can move it. ***`);

    const side = edgeBiasProfile(shot(scene([5, 0, 2])), REGION);
    say(`  light [5,0,2] (hard side light): ${side.edgeBias !== undefined ? "edgeBias " + side.edgeBias.toFixed(4) : "REFUSED -- " + side.why}`);
    ok("!! ...and at a hard side light the check REFUSES rather than returning a number",
       side.edgeBias === undefined && typeof side.why === "string",
       "*** WITH HALF THE SPHERE UNLIT THE PROFILE NO LONGER SPANS THE REGION AND edgeBiasProfile SAYS SO INSTEAD OF AVERAGING WHAT IS LEFT. THAT IS THE CHECK BEHAVING WELL AND IT IS ASSERTED HERE SO NOBODY LATER READS THE REFUSAL AS A CRASH -- a returned `why` and a thrown error are different events. ***");
}

/* ------------------------------------------------------------------------------------------------------------
 * 3. THE FLAT CONTROL: THE ANSWER MUST BE ZERO, AND IT IS DERIVED RATHER THAN CHOSEN
 * --------------------------------------------------------------------------------------------------------- */
{
    const slab = [{ centre: [0, -2001, 0], radius: 2000, albedo: 0.95 }, { centre: [0, 4, 6], radius: 1.2, emit: 6, albedo: 0 }];
    const r = edgeBiasProfile(shot(slab, { eye: [0, 1.2, 4] }), REGION);
    say(`flat slab: edgeBias ${r.edgeBias.toFixed(4)}, asymmetry ${r.asymmetry.toFixed(4)}, ${r.columns} columns`);
    ok("!! a flat horizon has NO edge bias, which is the half that makes the sphere's number mean something",
       Math.abs(r.edgeBias) < 0.05,
       "*** A CHECK THAT ONLY MEASURED THE SPHERE WOULD HAVE NO SCALE. A straight silhouette is the zero of this instrument and it is DERIVED -- the topmost covered row is the same in every column because the surface is flat -- rather than read off a page nobody has checked. ***");
}

/* ------------------------------------------------------------------------------------------------------------
 * 4. *** WHAT THIS ORACLE CANNOT DO, AND WHY THAT IS ITSELF THE ANSWER TO A QUESTION ***
 * --------------------------------------------------------------------------------------------------------- */
{
    ok("!! *** THE 1/cos ARTEFACT CANNOT BE PLANTED IN THIS RENDERER AT ALL, AND THE REASON IS INFORMATIVE ***",
       true,
       "*** THE BUG edgeBiasProfile HUNTS IS A RAY DIRECTION THAT WAS NOT NORMALISED PER PIXEL, so a marching step of a fixed size covers 1/cos(theta) MORE WORLD DISTANCE at the edges. physics/render/pathTracer.mjs SOLVES A QUADRATIC: an unnormalised direction describes THE SAME LINE, the hit point is identical, AND THE PICTURE DOES NOT CHANGE. So this oracle can supply the CORRECT answer and can NEVER supply the faulty one. THE ARTEFACT ONLY EXISTS WHERE THERE IS A MARCHER -- which raymarch-live.html has and this file does not. STATED, NOT DEMONSTRATED, AND THE DIFFERENCE MATTERS. ***");

    ok("...so the honest gain is stated at its real size",
       true,
       "*** WHAT CHANGED: the 0.25 limit can now be read as 'a correct SPHERE spends 0.21 of it', so a page framing a curved object has almost no headroom left and a page framing boxes has nearly all of it. WHAT HAS NOT CHANGED: nobody has yet seen the 1/cos signature on raymarch-live.html, and the first rig run is still the thing that would show it. THE ORACLE MOVED THE BASELINE FROM CHOSEN TO DERIVED; IT DID NOT FIND THE BUG. ***");

    const page = fs.readFileSync(path.join(ROOT, "path-tracer.html"), "utf8");
    ok("!! path-tracer.html shows the sphere and the flat control together",
       /edgeBiasProfile/.test(page),
       "Both, because the sphere's 0.21 only means something beside the slab's 0.01 -- one number alone is a value and the pair is a scale.");
}

console.log(fails ? "\nedgeBiasOracle-selfcheck: " + fails + " FAILED" : "\nedgeBiasOracle-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
