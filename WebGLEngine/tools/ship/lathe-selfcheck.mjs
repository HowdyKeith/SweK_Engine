#!/usr/bin/env node
// WebGLEngine/tools/ship/lathe-selfcheck.mjs -- v4255
//
// Run: node tools/ship/lathe-selfcheck.mjs
//
// *** THE TREE HAS HAD A JUDGE FOR NINE HUNDRED ROUNDS AND NOTHING TO JUDGE. ***
//
// v3337 lifted img2threejs's rule that a hard gate cannot be averaged away by soft signals, built
// render/perceptual.mjs and render/silhouette.mjs around it, and explicitly REFUSED their thresholds as
// numbers nobody here had measured. What it never built was the other half: this tree has no
// image-to-geometry path at all. ev/spriteHullCore.js gets a bitmap to a 2D outline and
// mesh/extrudePolygon.mjs gets an outline to a prism, and NOTHING LATHES -- which is the wrong gap to have,
// because the objects a single photograph is most often of are solids of revolution.
//
// *** AND THE HONEST LIMIT IS STATED FIRST, BECAUSE IT IS THE POINT: A LATHE DOES NOT RECOVER A SHAPE FROM
// *** A PHOTOGRAPH, IT ASSUMES ONE. The front view of a revolved profile is the profile mirrored, so the
// front-view IoU is high nearly by construction and is close to worthless as evidence. A single photograph
// cannot tell a vase from a flat cardboard cutout of a vase. Section 5 measures exactly how little that
// score is worth and which number does carry information.
"use strict";
import * as L from "../../mesh/lathe.mjs";
import { iou as judgeIoU, scaleDelta } from "../../render/silhouette.mjs";

/** A Uint8 occupancy mask as the RGBA buffer render/silhouette.mjs actually takes. */
const toRGBA = (m, w, h) => {
    const d = new Uint8ClampedArray(w * h * 4);
    for (let p = 0; p < w * h; p++) { const v = m[p] ? 255 : 0; d[p * 4] = d[p * 4 + 1] = d[p * 4 + 2] = v; d[p * 4 + 3] = 255; }
    return { data: d, w, h };
};

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const report = (m) => console.log("  ....  " + m);
const mk = (w, h, f) => { const m = new Uint8Array(w * h); for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) if (f(i, j)) m[j * w + i] = 1; return m; };
const W = 201, H = 201, CX = 100;

console.log("lathe-selfcheck -- a photograph to a solid of revolution, and how little the photograph proved\n");

// =============================================================================================================
console.log("1. *** THE LATHE IS EXACT: an inscribed N-gon's area is a closed form, so the error is too ***");
{
    const rows = []; for (let y = 0; y <= 99; y++) rows.push({ y, r: 1 });
    const pred = (N) => Math.PI * 99 * ((N / (2 * Math.PI)) * Math.sin(2 * Math.PI / N));
    let worst = 0; const shown = [];
    for (const N of [3, 4, 6, 8, 16, 64, 256, 1024]) {
        const v = L.meshVolume(L.lathe({ axis: 0, rows }, N)), p = pred(N);
        worst = Math.max(worst, Math.abs(v - p) / p);
        if ([3, 4, 1024].includes(N)) shown.push("N=" + N + " " + v.toFixed(4) + " vs " + p.toFixed(4));
    }
    ok("!! *** THE MEASURED VOLUME MATCHES pi*r^2*h * (N/2pi)*sin(2pi/N) AT EVERY N FROM 3 TO 1024 ***",
        worst < 1e-6,
        "worst relative error " + worst.toExponential(2) + ". " + shown.join(", ") + ". *** THE " +
        "DISCRETISATION IS NOT A TOLERANCE, IT IS A CLOSED FORM: *** a lathe with N segments builds an " +
        "inscribed N-gon, whose area is exactly (N/2pi)*sin(2pi/N) of the circle's. So there is a number to " +
        "hit at every N, including N=3, where the 'cylinder' is a triangular prism and a tolerance-based " +
        "check would have had to excuse a 17% miss.");
    report("the residual floor is ~1e-8 rather than 1e-16 because positions are a Float32Array -- the same " +
           "float32 story v4253 found in qMul, in a third place.");
    const cone = []; for (let y = 0; y <= 99; y++) cone.push({ y, r: y / 99 });
    const vc = L.meshVolume(L.lathe({ axis: 0, rows: cone }, 1024));
    const pc = Math.PI * 99 / 3 * ((1024 / (2 * Math.PI)) * Math.sin(2 * Math.PI / 1024));
    ok("!! ...and a linear profile gives a cone, at one third of the cylinder, to " +
       (Math.abs(vc - pc) / pc).toExponential(1),
        Math.abs(vc - pc) / pc < 1e-6, "measured " + vc.toFixed(4) + " against " + pc.toFixed(4));
}

// =============================================================================================================
console.log("\n2. *** THE CAP WINDING, AND WHY A SPHERE COULD NOT SEE IT ***");
{
    const rect = mk(W, H, (i, j) => Math.abs(i - CX) <= 80 && j >= 20 && j <= 180);
    const pr = L.profileFromMask(rect, W, H);
    const g = L.lathe(pr, 64);
    const v = L.meshVolume(g), pred = Math.PI * pr.rows[0].r ** 2 * pr.rows.length *
        ((64 / (2 * Math.PI)) * Math.sin(2 * Math.PI / 64));
    ok("!! a cylinder's volume is right, which it was NOT in the first draft",
        Math.abs(v - pred) / pred < 0.01,
        "measured " + v.toFixed(0) + " against " + pred.toFixed(0) + ". With the two end caps wound the other " +
        "way the caps contributed -1084033 against the sides' +2168066 and the total came out at EXACTLY ONE " +
        "THIRD of pi*r^2*h. *** THE DIVERGENCE THEOREM SUMS SIGNED TETRAHEDRA, so a backwards cap does not " +
        "merely point the wrong way -- it SUBTRACTS its cone of volume, *** and taking Math.abs at the end " +
        "hides the direction of the error and none of its magnitude. The module's header said the opposite " +
        "before this was measured.");
    const circle = mk(W, H, (i, j) => Math.hypot(i - CX, j - 100) <= 80);
    const pc = L.profileFromMask(circle, W, H);
    const vs = L.meshVolume(L.lathe(pc, 64));
    const ps = 4 / 3 * Math.PI * pc.rows.reduce((a, q) => Math.max(a, q.r), 0) ** 3;
    // *** ADDED BECAUSE A SABOTAGE BARELY BIT. *** Replacing the fitted axis with the frame's midpoint broke
    // only ONE check, because every fixture here happens to be centred at exactly w/2 -- so the axis fit was
    // almost untested and a gate full of centred shapes cannot say whether it works. This one is off-centre.
    const off = mk(W, H, (i, j) => Math.hypot(i - (CX + 20), j - 100) <= 60);
    const po = L.profileFromMask(off, W, H);
    const vo = L.meshVolume(L.lathe(po, 256));
    const pvo = 4 / 3 * Math.PI * Math.max(...po.rows.map((q) => q.r)) ** 3;
    ok("!! *** AN OFF-CENTRE SUBJECT IS STILL A SOLID OF REVOLUTION: the axis is FITTED, not assumed ***",
        Math.abs(po.axis - (CX + 20)) < 1 && Math.abs(vo - pvo) / pvo < 0.05,
        "fitted axis " + po.axis.toFixed(2) + " against a true centre of " + (CX + 20) + ", volume " +
        vo.toFixed(0) + " against " + pvo.toFixed(0) + ". A photograph is not framed for the algorithm's " +
        "convenience, and taking the frame's midpoint would tilt every profile by the framing error.");
    ok("!! *** AND THE CONTROL THAT EXPLAINS WHY THE BUG SURVIVED A SPHERE: its caps are degenerate ***",
        Math.abs(vs - ps) / ps < 0.05,
        "a sphere's first and last rings have radius ~0, so a reversed cap subtracts nothing and the sphere " +
        "measured 0.3% out while the cylinder measured 67% out. A gate whose only fixture was the obvious " +
        "one -- a ball -- would have shipped this. THE FIXTURE HAS TO HAVE THE FEATURE THE BUG LIVES IN.");
}

// =============================================================================================================
console.log("\n3. from a real pixel mask, where the residual is the MASK and not the lathe");
{
    const rows = []; let worstPct = 0;
    for (const [name, m, f] of [
        ["sphere", mk(W, H, (i, j) => Math.hypot(i - CX, j - 100) <= 80), (pr) => 4 / 3 * Math.PI * Math.max(...pr.rows.map((q) => q.r)) ** 3],
        ["cylinder", mk(W, H, (i, j) => Math.abs(i - CX) <= 80 && j >= 20 && j <= 180), (pr) => Math.PI * pr.rows[0].r ** 2 * pr.rows.length],
        ["cone", mk(W, H, (i, j) => { const t = (j - 20) / 160; return j >= 20 && j <= 180 && Math.abs(i - CX) <= 80 * t; }), (pr) => Math.PI * Math.max(...pr.rows.map((q) => q.r)) ** 2 * pr.rows.length / 3],
    ]) {
        const pr = L.profileFromMask(m, W, H), v = L.meshVolume(L.lathe(pr, 256)), p = f(pr);
        worstPct = Math.max(worstPct, Math.abs(100 * (v - p) / p));
        rows.push(name + " " + (100 * (v - p) / p).toFixed(2) + "%");
    }
    // *** THIS READ `ok(..., true, ...)` IN THE FIRST DRAFT -- a check that cannot fail, printed as a PASS
    // among checks that can. Caught by reading my own diff rather than by any run, which is the only way an
    // unconditional assertion is ever caught.
    ok("!! three shapes from pixel masks land within 3% of their closed forms",
        worstPct < 3, "worst " + worstPct.toFixed(2) + "% -- " + rows.join(", "));
    report("the residual does NOT shrink with more segments, so it is the MASK's pixel radius rather than " +
           "the lathe's faceting -- a rasterised circle of nominal radius 80 does not have area pi*80^2. " +
           "Section 1 is the check on the lathe; this one is only a sanity pass on the whole path.");
}

// =============================================================================================================
console.log("\n4. rotational invariance, and a residual with two rejected explanations");
{
    const circle = mk(W, H, (i, j) => Math.hypot(i - CX, j - 100) <= 80);
    const pr = L.profileFromMask(circle, W, H), g = L.lathe(pr, 128);
    const s0 = L.silhouetteMask(g, W, H, { yaw: 0, axis: pr.axis });
    const s90 = L.silhouetteMask(g, W, H, { yaw: Math.PI / 2, axis: pr.axis });
    ok("!! *** SPUN A QUARTER TURN THE SILHOUETTE IS PIXEL-IDENTICAL: IoU 1.000000 ***",
        L.maskIoU(s0, s90) === 1,
        "which is the property that says the mesh really is a solid of revolution rather than a shape that " +
        "merely looks like one from the front. A 90 degree turn maps the pixel lattice onto itself, so this " +
        "is exact rather than close.");
    // the arbitrary-yaw residual, and the two hypotheses the measurements killed
    const bySeg = [32, 128, 2048].map((N) => {
        const gg = L.lathe(pr, N);
        return L.maskIoU(L.silhouetteMask(gg, W, H, { yaw: 0, axis: pr.axis }),
                         L.silhouetteMask(gg, W, H, { yaw: 0.6458, axis: pr.axis }));
    });
    const byRes = [51, 101, 201, 401, 801].map((S) => {
        const cx = (S - 1) / 2, R = Math.floor((S - 1) * 0.4);
        const m = mk(S, S, (i, j) => Math.hypot(i - cx, j - cx) <= R);
        const p = L.profileFromMask(m, S, S), gg = L.lathe(p, 256);
        const a = L.silhouetteMask(gg, S, S, { yaw: 0, axis: p.axis });
        const b = L.silhouetteMask(gg, S, S, { yaw: 0.6458, axis: p.axis });
        return { R, prod: (1 - L.maskIoU(a, b)) * R };
    });
    const prods = byRes.map((q) => q.prod);
    const spread = (Math.max(...prods.slice(1)) - Math.min(...prods.slice(1))) / Math.min(...prods.slice(1));
    ok("!! *** AT AN ARBITRARY YAW IT IS 0.991, AND THAT IS THE RASTERISER -- DIAGNOSED, NOT ASSUMED ***",
        spread < 0.05,
        "(1 - IoU) * radius = " + prods.map((p) => p.toFixed(2)).join(", ") + " at radii " +
        byRes.map((q) => q.R).join(", ") + " px. *** CONSTANT ACROSS A 16x RESOLUTION RANGE, *** which is the " +
        "signature of a ONE-PIXEL BOUNDARY BAND: its area grows with the perimeter while the shape's grows " +
        "with the area, so the shortfall goes as 1/r. TWO EXPLANATIONS WERE TESTED AND KILLED FIRST: " +
        "faceting is out because the residual is identical at 32, 128 and 2048 segments (" +
        bySeg.map((v) => v.toFixed(6)).join(", ") + "), and a mesh fault is out because a mesh fault would " +
        "not scale with the perimeter. I had written 'faceting' into this gate before running the sweep.");
}

// =============================================================================================================
console.log("\n5. *** WHAT THE PHOTOGRAPH ACTUALLY PROVED, WHICH IS LESS THAN THE SCORE SUGGESTS ***");
{
    const shapes = {
        circle: mk(W, H, (i, j) => Math.hypot(i - CX, j - 100) <= 80),
        vase: mk(W, H, (i, j) => { const t = (j - 20) / 160; if (j < 20 || j > 180) return false;
            return Math.abs(i - CX) <= 30 + 40 * Math.sin(t * Math.PI) + 10 * Math.sin(t * Math.PI * 3); }),
        Lshape: mk(W, H, (i, j) => (j >= 20 && j <= 180 && i >= 60 && i <= 100) || (j >= 140 && j <= 180 && i >= 60 && i <= 170)),
        halfmoon: mk(W, H, (i, j) => Math.hypot(i - CX, j - 100) <= 80 && !(Math.hypot(i - CX - 40, j - 100) <= 55)),
    };
    const out = {};
    for (const [n, m] of Object.entries(shapes)) {
        const pr = L.profileFromMask(m, W, H), g = L.lathe(pr, 128);
        out[n] = { iou: L.maskIoU(L.silhouetteMask(g, W, H, { yaw: 0, axis: pr.axis }), m),
                   asym: L.asymmetry(m, W, H, pr.axis) };
    }
    ok("!! a revolvable input scores " + out.circle.iou.toFixed(4) + " and " + out.vase.iou.toFixed(4) +
       " on the front view",
        out.circle.iou > 0.95 && out.vase.iou > 0.95,
        "circle and a wavy vase profile -- the reconstruction reproduces the photograph it came from");
    ok("!! *** AND ONE THAT IS NOT REVOLVABLE STILL SCORES " + out.Lshape.iou.toFixed(2) + " AND " +
       out.halfmoon.iou.toFixed(2) + " ***",
        out.Lshape.iou > 0.5 && out.Lshape.iou < 0.8 && out.halfmoon.iou < 0.8,
        "an L-bracket and a crescent are not solids of revolution in any sense, and lathing them produces " +
        "objects that are simply WRONG -- yet the front-view IoU only falls from 0.99 to about 0.62. *** THE " +
        "SCORE THE JUDGE CAN GIVE IS THEREFORE A WEAK ONE: *** the front view of a revolved profile IS the " +
        "profile mirrored, so most of that number was never at risk. Adopting img2threejs's IoU < 0.85 here " +
        "would have PASSED the crescent at 0.61 only by luck of it being below, and passed many worse shapes.");
    ok("!! *** THE NUMBER THAT ACTUALLY TESTS THE ASSUMPTION IS ASYMMETRY, AND IT SEPARATES CLEANLY ***",
        out.circle.asym === 0 && out.vase.asym === 0 && out.Lshape.asym > 0.5 && out.halfmoon.asym > 0.5,
        "circle " + out.circle.asym.toFixed(4) + ", vase " + out.vase.asym.toFixed(4) + ", L " +
        out.Lshape.asym.toFixed(4) + ", crescent " + out.halfmoon.asym.toFixed(4) + ". EXACTLY zero against " +
        "0.91 and 0.94 -- a gap of the whole range, where IoU gave 0.99 against 0.62. A lathe assumes " +
        "rotational symmetry; mirror asymmetry about the fitted axis is the cheapest evidence that the " +
        "assumption was false, and unlike the IoU it is not answered by the very construction being tested.");
    // *** AND HERE THE SCULPTOR IS ACTUALLY HANDED TO THE JUDGE v3337 BUILT, rather than to a private
    // mask comparison -- otherwise this round would have built half a loop and described the other half.
    const prc = L.profileFromMask(shapes.circle, W, H);
    const gc = L.lathe(prc, 128);
    const shot = L.silhouetteMask(gc, W, H, { yaw: 0, axis: prc.axis });
    const viaJudge = judgeIoU(toRGBA(shot, W, H), toRGBA(shapes.circle, W, H));
    const sd = scaleDelta(toRGBA(shot, W, H), toRGBA(shapes.circle, W, H));
    ok("!! *** AND THE SCORE COMES FROM render/silhouette.mjs ITSELF, NOT A PRIVATE COPY OF IoU ***",
        Math.abs(viaJudge.iou - out.circle.iou) < 1e-9,
        "the tree's own judge returns " + viaJudge.iou.toFixed(6) + " against this gate's " +
        out.circle.iou.toFixed(6) + ", areas " + viaJudge.areaA + " and " + viaJudge.areaB + ", scale delta " +
        sd.toFixed(6) + ". v3337's iou takes RGBA buffers and thresholds them; the lathe emits Uint8 " +
        "occupancy, so the two are joined by a converter rather than by a second implementation of the " +
        "metric -- a private IoU that agreed with itself would have proved nothing about the loop closing.");
    report("*** AND EVEN A PERFECT SCORE HERE WOULD NOT SHOW THE OBJECT IS ROUND. *** A flat cardboard " +
           "cutout of a vase photographs identically to a vase. Nothing in one image distinguishes them, so " +
           "no judge reading one image ever will: what section 4 proves is that the OUTPUT is a solid of " +
           "revolution, never that the SUBJECT was. That is the gap a second view closes and this round " +
           "does not.");
}

// =============================================================================================================
// ---- v4255 SABOTAGES, grep-CONFIRMED APPLIED BEFORE READING, RESTORED md5-IDENTICAL ------------------------
//
// (mesh/lathe.mjs md5 620d1ecb6dc78445298876967b69a433 before and after all four.)
//
//   A  the cap winding reversed -- the bug this round actually shipped in its first draft, replayed as a
//      sabotage. -> 3 RED, the cylinder reading 1084033, exactly one third.
//
//   B  the caps dropped entirely, leaving an open tube. -> 4 RED. Note the shape of the failure: an open
//      surface has no enclosed volume, and the divergence theorem does not complain, it just returns the
//      lateral term. A "volume" that is quietly a surface integral is the kind of wrong that looks like a
//      units bug for an hour.
//
//   C  the axis taken as the frame's midpoint instead of fitted from the profile. -> *** 1 RED ON THE FIRST
//      RUN, WHICH WAS TOO FEW: *** every fixture in the gate happened to be centred at exactly w/2, so the
//      axis fit was almost untested. An OFF-CENTRE fixture was added and the sabotage now goes 2 RED. The
//      same shape of hole as v4253's unexercised clamp, found the same way, and recorded rather than
//      quietly patched.
//
//   D  asymmetry always returns 0. -> 1 RED, the section-5 check -- which is the whole point of that number:
//      it is the ONLY thing in the loop that can tell the assumption was false, so it is also the only
//      thing that notices when it stops working.
//
console.log(fails ? "\nFAIL -- " + fails + " check(s)" : "\nALL GREEN");
console.log("unchecked here: a REAL PHOTOGRAPH. Every mask above is drawn by a formula, so nothing has met " +
    "the segmentation problem -- getting a clean occupancy mask off a photograph is the hard part of the " +
    "pipeline img2threejs stages 1 and 2 spend most of their effort on, and this round assumes it solved. " +
    "Also unwired: nothing in the ENGINE calls mesh/lathe.mjs -- the judge and the " +
    "sculptor are joined in this gate and nowhere else, so no page in this tree turns a picture into a mesh " +
    "today. And the join itself is narrow: silhouette.mjs's scaleDelta and its hard-gate combiner are " +
    "reached but perceptual.mjs's SSIM and edge overlap are not, because a silhouette has no shading to " +
    "compare and pretending otherwise would be scoring a black shape against a black shape.");
process.exit(fails ? 1 : 0);
