// WebGLEngine/tools/ship/rebar-selfcheck.mjs -- v4251
//
// Run: node tools/ship/rebar-selfcheck.mjs
//
// *** THE CASE THAT SETTLES THE SOLID-TEXTURE ARGUMENT, BECAUSE IT HAS A CLOSED FORM. ***
//
// v4243 showed a solid texture jumps 0 of 255 across a blast rim where a triplanar projection jumps 136, and
// that raising triplanar's sharpening exponent makes the seam WORSE (166, then 173). That is a strong result
// about a HOMOGENEOUS material, and a homogeneous material is still arguable on taste.
//
// Rebar is not arguable. Cut a rod square-on and the exposed end is a CIRCLE of the rod's radius; cut it
// obliquely and it is an ELLIPSE with semi-minor r and semi-major r / cos(phi); cut along it and you expose a
// LENGTH of bar. The shape of the hole is a property of the ANGLE BETWEEN THE CUT AND THE ROD, so the gate
// does not have to judge the picture -- it predicts the number and compares.
//
// *** AND NOTE WHERE THE WORK HAPPENS, BECAUSE IT IS THE WHOLE POINT: THE TEXTURE DOES NOT VARY WITH THE CUT.
// *** rebarAt is a function of (x, y, z) and takes no normal and no angle. What changes with the cut angle is
// the SET OF POINTS the cut plane passes through. The geometry does the work and the material simply is what
// it is at each point -- which is exactly what a projection cannot arrange, because a projection's answer
// depends on the surface it is being projected onto.
"use strict";
import * as B from "../../render/rebar.mjs";

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const report = (m) => console.log("  ....  " + m);
const DEG = Math.PI / 180;
const R = 0.012, PITCH = 0.30;
const OPT = { radius: R, pitch: PITCH, axes: "x" };

console.log("rebar-selfcheck -- the structures that only exist when you cut something open\n");

/** Sample the cut plane with normal [cos phi, sin phi, 0] and measure the exposed section's extents. */
function section(phi, N = 1200, half = 0.06) {
    const u = [-Math.sin(phi), Math.cos(phi), 0], v = [0, 0, 1];
    let sMin = Infinity, sMax = -Infinity, tMin = Infinity, tMax = -Infinity, hits = 0;
    for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
        const s = (i / (N - 1) * 2 - 1) * half, t = (j / (N - 1) * 2 - 1) * half;
        const p = [u[0] * s + v[0] * t, u[1] * s + v[1] * t, u[2] * s + v[2] * t];
        if (B.isRebar(p[0], p[1], p[2], OPT)) {
            hits++;
            if (s < sMin) sMin = s; if (s > sMax) sMax = s;
            if (t < tMin) tMin = t; if (t > tMax) tMax = t;
        }
    }
    return { hits, a: (sMax - sMin) / 2, b: (tMax - tMin) / 2, res: 2 * half / (N - 1) };
}

// =============================================================================================================
console.log("1. the field: rods where the grid says, and nothing between them");
{
    ok("!! a point on a rod axis is steel, and the far corner of a cell is not",
        B.isRebar(0, 0, 0, OPT) && !B.isRebar(0, PITCH / 2, PITCH / 2, OPT),
        "on-axis distance " + B.rebarDistance(0, 0, 0, OPT).dist.toFixed(4) + " m, cell-corner distance " +
        B.rebarDistance(0, PITCH / 2, PITCH / 2, OPT).dist.toFixed(4) + " m against a radius of " + R);
    // Swept rather than sampled once, per the v4248 lesson: one shift is a sample, the worst of many is a
    // bound. And compared against a TOLERANCE, not with ===, because the modulus is float arithmetic --
    // 0.003 + 0.30 does not land on 0.303 exactly, so an exact test here fails on a cage that is perfect.
    let repeatWorst = 0;
    for (const y0 of [0.003, 0.011, 0.05, 0.1499, 0.2, 0.29]) {
        const base = B.rebarDistance(0, y0, 0, OPT).dist;
        for (let k = -20; k <= 20; k++) {
            const v = B.rebarDistance(0, y0 + k * PITCH, 0, OPT).dist;
            repeatWorst = Math.max(repeatWorst, Math.abs(v - base));
        }
    }
    ok("!! the cage repeats: a point one pitch away is the same point",
        repeatWorst < R * 1e-6,
        "worst disagreement " + repeatWorst.toExponential(2) + " m over 6 offsets shifted by up to 20 pitches " +
        "in each direction, which is " + (repeatWorst / R).toExponential(1) + " of a rod radius -- float " +
        "rounding in the modulus, not structure. Distance is computed from the coordinate modulo the pitch, " +
        "so there is no rod list to walk and no extent to the cage: it fills space, which is what a solid " +
        "texture has to do");
    ok("   moving ALONG a rod changes nothing, which is what makes it a rod",
        B.rebarDistance(0, 0.005, 0, OPT).dist === B.rebarDistance(5.0, 0.005, 0, OPT).dist,
        "rods run along X, so x does not enter the distance at all");
    ok("   and the depth ramp reaches 1 at the axis and 0 at the surface",
        B.rebarAt(0, 0, 0, OPT).depth === 1 && B.rebarAt(0, R, 0, OPT).depth === 0);
}

// =============================================================================================================
console.log("\n2. *** THE ELLIPSE: the shape of the exposed end, predicted and then measured ***");
{
    const rows = [];
    let worstRatio = 0, worstA = 0;
    for (const d of [0, 30, 45, 60, 70]) {
        const phi = d * DEG, m = section(phi);
        const pa = B.sectionSemiMajor(R, phi), pb = B.sectionSemiMinor(R);
        worstA = Math.max(worstA, Math.abs(m.a - pa));
        worstRatio = Math.max(worstRatio, Math.abs(m.a / m.b - pa / pb));
        rows.push(d + "deg " + (m.a / m.b).toFixed(3) + " vs " + (pa / pb).toFixed(3));
    }
    ok("!! *** THE MEASURED SECTION MATCHES r / cos(phi) AT EVERY ANGLE, TO SAMPLING RESOLUTION ***",
        worstA < 1.5e-4,
        "worst semi-major error " + worstA.toExponential(2) + " m against a sample spacing of " +
        section(0).res.toExponential(2) + " m -- the whole discrepancy is the grid the section was sampled " +
        "on. Aspect ratios measured against predicted: " + rows.join(", "));
    const circ = section(0);
    ok("!! *** A PERPENDICULAR CUT GIVES A CIRCLE: aspect ratio exactly 1 ***",
        Math.abs(circ.a / circ.b - 1) < 1e-9,
        "semi-major " + circ.a.toFixed(5) + " and semi-minor " + circ.b.toFixed(5) + " -- identical, because " +
        "at phi = 0 the plane is square to the rod and there is nothing to foreshorten.");
    const obl = section(60 * DEG);
    ok("!! ...and a 60 degree cut gives an ellipse exactly twice as long as it is wide",
        Math.abs(obl.a / obl.b - 2) < 0.01,
        "measured " + (obl.a / obl.b).toFixed(3) + " against a predicted 1/cos(60) = 2. *** THIS IS THE CLAIM " +
        "NO PROJECTION CAN MAKE: *** the texture did not change -- rebarAt takes no normal and no angle -- the " +
        "CUT PLANE moved, and the shape of the intersection followed. A triplanar projection's answer is a " +
        "function of the surface normal, so it would paint the same picture on both faces.");
    // *** THE CONTROL, because "the section is an ellipse" would also be satisfied by a field of ellipses. ***
    ok("!! *** THE CONTROL: the section's WIDTH is the same at every angle -- only its LENGTH grows ***",
        Math.abs(circ.b - obl.b) < 1e-9,
        "semi-minor " + circ.b.toFixed(5) + " at 0 degrees and " + obl.b.toFixed(5) + " at 60. A material that " +
        "simply drew bigger blobs on steeper cuts would grow in BOTH directions; a cylinder foreshortens in " +
        "one, and that asymmetry is what says the shape came from a real rod.");
}

// =============================================================================================================
console.log("\n3. spacing: how far apart the rods look on the cut, and the same formula for two materials");
{
    const centres = (phi, half = 1.2, N = 40000) => {
        const u = [-Math.sin(phi), Math.cos(phi), 0];
        const out = []; let run = null;
        for (let i = 0; i < N; i++) {
            const s = (i / (N - 1) * 2 - 1) * half;
            const on = B.isRebar(u[0] * s, u[1] * s, 0, OPT);
            if (on && !run) run = s; else if (!on && run !== null) { out.push((run + s) / 2); run = null; }
        }
        return out;
    };
    let worst = 0;
    const rows = [];
    for (const d of [0, 30, 45, 60]) {
        const phi = d * DEG, c = centres(phi);
        const gaps = [];
        for (let i = 1; i < c.length; i++) gaps.push(c[i] - c[i - 1]);
        const mean = gaps.reduce((a, b) => a + b, 0) / gaps.length;
        const theta = Math.PI / 2 - phi;            // angle between the rod grid's normal and the cut's
        const pred = B.apparentSpacing(PITCH, theta);
        worst = Math.max(worst, Math.abs(mean - pred));
        rows.push(d + "deg " + mean.toFixed(4) + " vs " + pred.toFixed(4));
    }
    ok("!! *** ROD SPACING ON THE CUT IS pitch / sin(theta), MEASURED ***",
        worst < 5e-3,
        "worst error " + worst.toExponential(2) + " m. " + rows.join(", ") + ". A steeper cut crosses the same " +
        "cage less often and spreads the rods further apart, which is the second thing you can read off a " +
        "broken wall to know how it was broken.");
    // The SAME formula, on a completely different material -- which is the argument that it is geometry and
    // not a fit.
    const stripes = (theta, thick = 0.08, half = 2.0, N = 40000) => {
        const n = [0, 1, 0];                                   // layers stack along Y
        const u = [Math.sin(theta), Math.cos(theta), 0];       // an in-plane direction at angle theta to them
        const out = []; let last = null;
        for (let i = 0; i < N; i++) {
            const s = (i / (N - 1) * 2 - 1) * half;
            const band = B.beddingAt(u[0] * s, u[1] * s, 0, { thickness: thick, normal: n }).band;
            if (last !== null && band !== last) out.push(s);
            last = band;
        }
        return out;
    };
    const th = 50 * DEG, edges = stripes(th);
    const gaps = [];
    for (let i = 1; i < edges.length; i++) gaps.push(edges[i] - edges[i - 1]);
    const mean = gaps.reduce((a, b) => a + b, 0) / gaps.length;
    // One layer apart, not half: `band` alternates 0,1,0,1 with every layer, so consecutive changes are a
    // full layer. The gate's first version divided by two and read 2.00x the prediction, which is how the
    // error announced itself -- a wrong predictor off by an exact integer factor is the predictor, not noise.
    const pred = B.apparentSpacing(0.08, Math.PI / 2 - th);
    ok("!! ...and the SAME formula predicts bedding-plane stripes, on a different material entirely",
        Math.abs(mean - pred) < 2e-3,
        "stripe edges " + mean.toFixed(4) + " apart against a predicted " + pred.toFixed(4) + " at a 50 degree " +
        "cut through 0.08 m layers. One closed form, two materials -- which is what says it is geometry rather " +
        "than a curve fitted to rebar.");
}

// =============================================================================================================
console.log("\n4. continuity across an edge, and why that check is nearly circular on its own");
{
    // Two cut faces meeting at an edge see the SAME points with DIFFERENT normals. rebarAt takes no normal,
    // so it cannot disagree -- and asserting that alone would be restating the signature, which is the lesson
    // v4243 learned when a constant grey passed its seam check.
    const pts = [];
    for (let k = 0; k < 200; k++) pts.push([0.3, 0.0, -0.05 + 0.1 * k / 199]);
    let disagree = 0, steel = 0;
    for (const p of pts) {
        const a = B.isRebar(p[0], p[1], p[2], OPT), b = B.isRebar(p[0], p[1], p[2], OPT);
        if (a !== b) disagree++;
        if (a) steel++;
    }
    ok("!! a rod crossing an edge is steel on both faces -- 0 disagreements",
        disagree === 0, disagree + " of " + pts.length);
    ok("!! *** THE CONTROL, WITHOUT WHICH THE LINE ABOVE MEANS NOTHING: the field VARIES along that edge ***",
        steel > 0 && steel < pts.length,
        steel + " of " + pts.length + " points along the edge are steel. A material that answered 'concrete' " +
        "everywhere would also score zero disagreements and would be worthless -- which is exactly what " +
        "v4243's constant-grey sabotage proved about its own seam check.");
}

// =============================================================================================================
// =============================================================================================================
// ---- v4251 SABOTAGES, EACH CONFIRMED APPLIED BY grep -c BEFORE ITS RESULT WAS READ, RESTORED md5-IDENTICAL ---
//
// (render/rebar.mjs md5 fc36f95925297b01ef5cd5c06b0e4de7 before and after all four.)
//
//   A  rods become SPHERES -- x enters the distance, so the cage is a lattice of balls rather than of bars.
//      -> 5 RED: the along-the-rod invariance, the semi-major match (2.31e-2 m out), the 60-degree aspect
//      ratio (1.000 against a predicted 2), the spacing sweep, and the cut-along-the-axis case.
//
//   B  Math.round -> Math.floor in the modulus, which turns each rod into a HALF rod: the distance is
//      one-sided, so the bar is a D in section rather than a disc. -> only 1 RED, the semi-major match
//      (1.76e-2 m out). *** WHAT STAYED GREEN IS THE FINDING: *** the circle check, the 60-degree aspect
//      ratio, the width control, the spacing sweep and both continuity checks all passed on a field of half
//      rods. Aspect ratio survives because both axes halve together; spacing survives because the rods are
//      still on the same grid. Only the absolute size caught it, and it caught it alone.
//
//   C  isRebar returns true everywhere -- v4243's constant-field control, as a sabotage this time.
//      -> 5 RED, including *** THE SECTION-4 CONTROL, which is the check that exists for exactly this: ***
//      200 of 200 edge points steel. The continuity check itself stayed green at 0 disagreements, which is
//      the point: a constant field is perfectly continuous and perfectly worthless.
//
//   D  bedding bands stop alternating (band: 0 always). -> 1 RED, the stripe spacing, which goes NaN
//      because there are no edges to take gaps between.
//
// *** AND ONE CHECK NO SABOTAGE HERE REACHED: the width control (semi-minor equal at 0 and 60 degrees). ***
// Sabotage A was aimed at it and missed -- a lattice of spheres foreshortens in neither direction, so its
// width is constant too, and the control passed on a field with no rods in it at all. That is not a hole
// that can be closed by a better sabotage of this module: the control asks whether the section's WIDTH
// varies with the CUT ANGLE, and rebarAt receives no normal and no angle, so no edit to render/rebar.mjs
// can make it vary. The control is therefore load-bearing against a DIFFERENT class of implementation --
// a projection, which does receive the normal -- and against this one it is a statement of the signature,
// not a measurement. The v4246 rule says a mechanism no sabotage can break is a story rather than a
// diagnosis; the honest form here is that the sabotage would have to be applied to the material MODEL, and
// this file does not contain the projection it is arguing against.

console.log("\n5. the third case: cutting ALONG a rod exposes a length, not a dot");
{
    // A cut plane containing the rod's axis. The section is no longer bounded -- it is a stripe as long as the
    // cut, which is the case r / cos(phi) diverges toward and the one that makes a blast hole read as
    // reinforced rather than speckled.
    let run = 0;
    for (let i = 0; i < 2000; i++) {
        const x = -1 + 2 * i / 1999;
        if (B.isRebar(x, 0.0, 0.0, OPT)) run++;
    }
    ok("!! *** A CUT CONTAINING THE AXIS EXPOSES THE WHOLE BAR: steel at every one of 2000 points ***",
        run === 2000,
        "2 m of cut along the rod's own axis is steel end to end, where a perpendicular cut showed a 24 mm " +
        "circle. Same field, same function, no parameter changed -- only the plane.");
    report("and this is the case the closed form points at rather than covers: r / cos(phi) diverges as phi " +
           "approaches 90 degrees, which is the arithmetic saying the section stops being an ellipse and " +
           "becomes a stripe. The formula is checked where it applies and its limit is named where it does not.");
}

console.log("\n" + (fails ? "FAIL -- " + fails + " check(s)" : "ALL GREEN") +
    "\nunchecked here: any of this on a REAL CUT. Every section above is sampled on an analytic plane, not on " +
    "geometry physics/mesh/meshCSG.mjs produced, so the rods have met no BSP output and nothing has rendered " +
    "them -- there is no GLSL in this file at all, which is a gap v4243's harness could close and this round " +
    "did not. Also unchecked: whether a rod SHOULD stop a blast. The field says where steel is; nothing " +
    "consults it when cutting, so meshCSG will happily slice a bar in half, and a wall whose rebar does not " +
    "resist is a picture of reinforcement rather than reinforcement.");
process.exit(fails ? 1 : 0);
