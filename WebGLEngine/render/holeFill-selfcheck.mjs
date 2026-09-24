#!/usr/bin/env node
// WebGLEngine/render/holeFill-selfcheck.mjs -- v4678
//
// THE GATE FOR THE 6% OF A GENERATED FRAME THAT NO MOTION PASSES THROUGH.
//
// v4677 shipped render/frameInterp.mjs with the holes left at ZERO, measured what that costs, and said hole
// filling was the next pass. This is it -- and it is the first round of this arc whose headline result is
// NEGATIVE: the obvious algorithm makes the frame worse than leaving the holes alone.
//
// *** AND IT IS THE FIRST CONTENT IN THIS ARC WITH A SILHOUETTE. *** Every measurement from v4673 to v4677 ran
// on a wall at constant depth, and every one of those gates closed by saying so. Here a foreground slab at
// half the wall's distance slides across it, so its trailing edge opens a TRUE DISOCCLUSION -- a strip of
// background that neither frame's motion field describes and that is visible in only ONE of the two frames.
// The middle frame is still renderable, because the scene is still analytic, so the generated frame is graded
// against a real render.
//
// THE CONTROL ARM is v4677's own behaviour: warp the pixels that have vectors, cross-fade the holes. Anything
// this pass does has to beat that, and the first thing it tried did not.
"use strict";
import { interpolateFrameCPU, crossFadeCPU } from "./frameInterp.mjs";
import { fillHolesCPU, SIDE_BLEND, SIDE_PREV, SIDE_CUR } from "./holeFill.mjs";
import { transform4 } from "./motionVectors.mjs";
import { viewProj } from "./rasterProbe.js";

let fails = 0;
const ok = (label, cond, detail) => { if (!cond) fails++; console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}${detail ? "   " + detail : ""}`); };
const report = (s) => console.log(`  ----  ${s}`);
const threw = (fn) => { try { fn(); return null; } catch (e) { return e.message; } };

// ---- THE RIG: A SLAB AT HALF THE WALL'S DISTANCE, SLIDING ACROSS IT ---------------------------------------
const W = 64, H = 64, TAN = Math.tan(0.5), ASP = 1, NEAR = 0.1, FAR = 100, DW = 8, DS = 4;
const VP = viewProj([0, -DW, 0], [0, 1, 0], [1, 0, 0], [0, 0, 1], TAN, ASP, NEAR, FAR);
const SLAB = { x0: -1.2, w: 2.0, z0: -3, z1: 3 };
const PX_SLAB = W / (2 * TAN * ASP * DS);          // screen pixels per world unit AT THE SLAB'S DISTANCE
const TWs = 256, texWall = new Float32Array(TWs * TWs), texSlab = new Float32Array(TWs * TWs);
{
    let s = 7; const rnd = () => (s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
    const a = new Float32Array(TWs * TWs), b = new Float32Array(TWs * TWs);
    for (let i = 0; i < TWs * TWs; i++) { a[i] = rnd(); b[i] = rnd(); }
    for (let y = 0; y < TWs; y++) for (let x = 0; x < TWs; x++) {
        let p = 0, q = 0;
        for (let j = -2; j <= 2; j++) for (let i = -2; i <= 2; i++) {
            p += a[((y + j + TWs) % TWs) * TWs + ((x + i + TWs) % TWs)];
            q += b[((y + j + TWs) % TWs) * TWs + ((x + i + TWs) % TWs)];
        }
        texWall[y * TWs + x] = p / 25; texSlab[y * TWs + x] = q / 25;
    }
}
const samp = (t, wx, wz) => {
    const fx = wx * 8 + 128, fy = wz * 8 + 128, x0 = Math.floor(fx), y0 = Math.floor(fy), tx = fx - x0, ty = fy - y0;
    const g = (x, y) => t[(((y % TWs) + TWs) % TWs) * TWs + (((x % TWs) + TWs) % TWs)];
    return (g(x0, y0) * (1 - tx) + g(x0 + 1, y0) * tx) * (1 - ty) + (g(x0, y0 + 1) * (1 - tx) + g(x0 + 1, y0 + 1) * tx) * ty;
};
/** The wall with the slab shifted `sl` world units in +x. `fg` marks which surface each pixel hit. */
function render(sl) {
    const rgba = new Float32Array(W * H * 4), depth = new Float32Array(W * H), fg = new Uint8Array(W * H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const u = (x + 0.5) / W, v = (y + 0.5) / H, i = y * W + x;
        const sx = (2 * u - 1) * TAN * ASP * DS, sz = (1 - 2 * v) * TAN * DS;
        const hit = sx >= SLAB.x0 + sl && sx <= SLAB.x0 + sl + SLAB.w && sz >= SLAB.z0 && sz <= SLAB.z1;
        let c, d;
        if (hit) { c = samp(texSlab, sx - sl, sz); d = transform4(VP, sx, -DW + DS, sz, 1); fg[i] = 1; }
        else { const wx = (2 * u - 1) * TAN * ASP * DW, wz = (1 - 2 * v) * TAN * DW; c = samp(texWall, wx, wz); d = transform4(VP, wx, 0, wz, 1); }
        rgba[i * 4] = c; rgba[i * 4 + 1] = c; rgba[i * 4 + 2] = c; rgba[i * 4 + 3] = 1;
        depth[i] = d[2] / d[3];
    }
    return { rgba, depth, fg };
}
const psnr = (a, b, m) => {
    let s = 0, n = 0;
    for (let i = 0; i < W * H; i++) { if (m && m[i]) continue; for (let c = 0; c < 3; c++) { const d = a[i * 4 + c] - b[i * 4 + c]; s += d * d; } n += 3; }
    return n === 0 ? NaN : (s <= 0 ? Infinity : 10 * Math.log10(1 / (s / n)));
};
/**
 * One scene at a given slab travel. The motion field is the scene's OWN knowledge of which surface each
 * pixel of `prev` hit, at block 1 -- *** DELIBERATELY EXACT, BECAUSE THE SUBJECT HERE IS THE FILLER. ***
 * An estimated field would put the flow's error into every number below and the round would be measuring two
 * things at once. What a real pipeline computes for a moving object is render/objectMotion.mjs's job.
 */
function scene(sl) {
    const prev = render(0), cur = render(sl), mid = render(sl / 2);
    const vpx = sl * PX_SLAB;
    const flow = new Float32Array(W * H * 2), depthBlock = new Float32Array(W * H);
    for (let i = 0; i < W * H; i++) { depthBlock[i] = prev.depth[i]; flow[i * 2] = prev.fg[i] ? vpx : 0; }
    const gen = (fill) => interpolateFrameCPU({ prev: prev.rgba, cur: cur.rgba, w: W, h: H, flow,
                                                bw: W, bh: H, block: 1, depthBlock, t: 0.5, fill });
    const base = gen(null);
    const cf = crossFadeCPU({ prev: prev.rgba, cur: cur.rgba, w: W, h: H, t: 0.5 });
    // v4677's control: the warped frame with its holes cross-faded
    const control = Float32Array.from(base.frame);
    for (let j = 0; j < W * H; j++) if (base.hole[j]) for (let c = 0; c < 4; c++) control[j * 4 + c] = cf[j * 4 + c];
    // the mask that scores ONLY the originally-holed pixels, where the filler is the only thing acting
    const notHole = new Uint8Array(W * H);
    for (let j = 0; j < W * H; j++) notHole[j] = base.hole[j] ? 0 : 1;
    // any pixel a variant leaves unfilled is cross-faded, so every arm is scored on the whole frame
    const patch = (g) => { const o = Float32Array.from(g.frame);
        for (let j = 0; j < W * H; j++) if (g.hole[j]) for (let c = 0; c < 4; c++) o[j * 4 + c] = cf[j * 4 + c];
        return o; };
    const onHoles = (img) => psnr(img, mid.rgba, notHole);
    const whole = (img) => psnr(img, mid.rgba, null);
    return { prev, cur, mid, cf, base, control, gen, patch, onHoles, whole, vpx, mid_: mid };
}

const S = scene(0.6);
report(`the slab moves ${S.vpx.toFixed(3)} px over a static background, so at t = 0.5 it uncovers a strip ${(S.vpx / 2).toFixed(2)} px wide`);
report(`${S.base.holes} holes of ${W * H} (${(100 * S.base.holes / (W * H)).toFixed(1)}%), all of it that strip`);
report(`cross-fade whole frame ${S.whole(S.cf).toFixed(4)} dB;  v4677's control ${S.whole(S.control).toFixed(4)} whole, ${S.onHoles(S.control).toFixed(4)} on the holes`);

console.log("\n1. *** THE OBVIOUS ALGORITHM IS WORSE THAN DOING NOTHING ***");
{
    const ringF = S.patch(S.gen({ growth: "ring", prefer: "farther", side: "blend", radius: 8 }));
    const ringN = S.patch(S.gen({ growth: "ring", prefer: "nearer", side: "blend", radius: 8 }));
    report(`ring dilation, 8 passes: ${S.whole(ringF).toFixed(4)} whole, ${S.onHoles(ringF).toFixed(4)} on the holes`);
    ok("*** growing the field one ring per pass is 3.6 dB WORSE on the holes than leaving them at zero and cross-fading them ***",
       S.onHoles(S.control) - S.onHoles(ringF) > 3,
       `${S.onHoles(S.control).toFixed(4)} -> ${S.onHoles(ringF).toFixed(4)} dB. A ring front grows from BOTH sides of the strip, so half a 4-pixel hole ends up holding the OCCLUDER's vector, and warping background along a foreground vector drags the foreground into the gap that the foreground leaving is what made.`);
    let worst = 0;
    for (let i = 0; i < W * H * 4; i++) worst = Math.max(worst, Math.abs(ringF[i] - ringN[i]));
    ok("...and `prefer` is INERT under ring growth -- bit-identical frames -- because a front only ever offers a hole pixel one kind of neighbour",
       worst === 0, `worst |farther - nearer| ${worst}. The preference cannot bind on a choice with one candidate, which is why the next section changes the search and not the preference.`);
}

console.log("\n2. THE WHOLE NEIGHBOURHOOD, WHERE `prefer` FINALLY HAS TWO CANDIDATES TO CHOOSE BETWEEN");
{
    const far = S.patch(S.gen({ prefer: "farther", side: "blend" }));
    const near = S.patch(S.gen({ prefer: "nearer", side: "blend" }));
    report(`neighbourhood r4, blend: farther ${S.onHoles(far).toFixed(4)}, nearer ${S.onHoles(near).toFixed(4)} dB on the holes`);
    ok("*** searching the neighbourhood and taking the FARTHEST vector exactly recovers the control -- the same dB, not approximately ***",
       S.onHoles(far) === S.onHoles(S.control) && S.whole(far) === S.whole(S.control),
       `${S.onHoles(far).toFixed(4)} against the control's ${S.onHoles(S.control).toFixed(4)} on the holes. A disocclusion is BACKGROUND, and the background is the farther of the two surfaces bounding the gap.`);
    ok("*** and `prefer` is worth 5.7 dB once the choice exists, which is what makes it a decision rather than a parameter ***",
       S.onHoles(far) - S.onHoles(near) > 5,
       `farther ${S.onHoles(far).toFixed(4)} against nearer ${S.onHoles(near).toFixed(4)} dB -- ${(S.onHoles(far) - S.onHoles(near)).toFixed(4)} dB for one comparison's direction`);
}

console.log("\n3. *** TYING THE CONTROL IS NOT WINNING, AND THE BLEND IS WHAT IS LEFT WRONG ***");
{
    const blend = S.patch(S.gen({ side: "blend" })), pv = S.patch(S.gen({ side: "prev" })),
          cu = S.patch(S.gen({ side: "cur" })), der = S.gen({ side: "derived" });
    const derP = S.patch(der);
    report(`side blend ${S.onHoles(blend).toFixed(4)}, prev ${S.onHoles(pv).toFixed(4)}, cur ${S.onHoles(cu).toFixed(4)}, derived ${S.onHoles(derP).toFixed(4)} dB on the holes`);
    ok("*** a disoccluded pixel's content is in ONE frame only, so the symmetric blend mixes the answer with the occluder at full strength -- one-sided is EXACT here, to zero error on all 256 pixels ***",
       S.onHoles(cu) === Infinity && S.onHoles(blend) < 40,
       `cur alone: zero error on every hole pixel. blend: ${S.onHoles(blend).toFixed(4)} dB. prev alone: ${S.onHoles(pv).toFixed(4)} dB -- the wrong side is worse than blending, which is why the side has to be DERIVED and not chosen.`);
    ok("*** and the derived rule reaches that optimum with no oracle: zero error, and it ABSTAINED on nothing ***",
       S.onHoles(derP) === Infinity && der.abstained === 0 && der.filled === S.base.holes,
       `${der.filled} filled, ${der.abstained} abstentions, zero error. The rule: the hole's occluder is the NEAREST filled pixel in the neighbourhood, and the sign of (occluder's vector) . (hole - occluder) says whether the occluder is leaving the hole (content is in cur) or arriving at it (content is in prev).`);
    // *** THE SIDE CODES MUST BE SIDE_BLEND OUTSIDE THE HOLES, OR THE CONSUMER NEEDS A SECOND MASK. ***
    let wrongOutside = 0, curInside = 0, prevInside = 0;
    for (let j = 0; j < W * H; j++) {
        if (!S.base.hole[j]) { if (der.side[j] !== SIDE_BLEND) wrongOutside++; }
        else if (der.side[j] === SIDE_CUR) curInside++;
        else if (der.side[j] === SIDE_PREV) prevInside++;
    }
    ok("...and every pixel the splat reached carries SIDE_BLEND, so the warp needs no second mask to know which pixels may be one-sided",
       wrongOutside === 0 && curInside > 0,
       `${wrongOutside} splatted pixels with a non-blend code; inside the holes ${curInside} cur and ${prevInside} prev. The slab moves right, so every hole is uncovered and `
       + `cur is the right side everywhere here -- a scene where it moved the other way would invert this row's counts and not its claim.`);
}

console.log("\n4. *** THE RADIUS IS A FUNCTION OF THE DISPLACEMENT, AND THIS PASS DOES NOT WORK IT OUT FOR YOU ***");
{
    const rows = [];
    for (const sl of [0.3, 0.6, 1.2]) {
        const s = scene(sl), sweep = [];
        for (const radius of [2, 4, 8, 12]) {
            const g = s.gen({ radius });
            sweep.push({ radius, holes: g.holes, abst: g.abstained, dB: s.onHoles(s.patch(g)) });
        }
        rows.push({ sl, vpx: s.vpx, width: s.vpx / 2, holes: s.base.holes, sweep, control: s.onHoles(s.control) });
    }
    for (const r of rows) {
        report(`slab +${r.vpx.toFixed(3)} px, hole strip ${r.width.toFixed(2)} px wide, ${r.holes} holes; control ${r.control.toFixed(4)} dB`);
        report(`    ${r.sweep.map((x) => `r${x.radius}: ${x.dB === Infinity ? "EXACT" : x.dB.toFixed(4)}${x.holes ? ` (${x.holes} left)` : ""}${x.abst ? ` (${x.abst} abstained)` : ""}`).join("   ")}`);
    }
    ok("*** the radius needed grows with the displacement: 2.20 px of hole is exact at radius 2, 4.39 px needs 4, and 8.79 px still is not exact at 8 ***",
       rows[0].sweep[0].dB === Infinity && rows[1].sweep[0].dB !== Infinity && rows[1].sweep[1].dB === Infinity
       && rows[2].sweep[2].dB !== Infinity && rows[2].sweep[3].dB === Infinity,
       `hole widths ${rows.map((r) => r.width.toFixed(2)).join(", ")} px; smallest exact radius 2, 4, 12. The search has to reach ACROSS the hole to find the background AND reach the occluder to decide the side, so it scales with the gap the occluder opened.`);
    ok("*** so the default radius of 4 is measurably WRONG for a fast occluder, by 6 dB, and the pass does not notice ***",
       rows[2].sweep[3].dB - rows[2].sweep[1].dB > 5,
       `at +${rows[2].vpx.toFixed(1)} px: radius 4 gives ${rows[2].sweep[1].dB.toFixed(4)} dB where radius 12 is exact. ` +
       `The default is the smallest that worked on the scene this file was built around -- a data point, not a calibration -- and a caller with a fast-moving occluder must raise it. ` +
       `A pass that derived the radius from the field it was handed would not need this row; that is not what shipped.`);
    ok("...and a radius too small to reach anything leaves the pixel a hole rather than guessing",
       rows[2].sweep[0].holes > 0,
       `at +${rows[2].vpx.toFixed(1)} px with radius 2: ${rows[2].sweep[0].holes} of ${rows[2].holes} pixels still unfilled, and `
       + `the mask still says so, which is the only reason cross-fading them afterwards is possible at all`);
}

console.log("\n5. THE ABSTENTION IS AN INSTRUMENT, AND `fill` OFF IS STILL v4677");
{
    // *** A RULE THAT DECIDED EVERYTHING AND A RULE THAT DECIDED NOTHING BOTH PRODUCE A FRAME. *** On the
    // 1.2-unit scene at radius 4 the derived rule abstains on a quarter of the holes, and the count is the
    // only thing that says so.
    const s = scene(1.2);
    const g4 = s.gen({ radius: 4 }), g12 = s.gen({ radius: 12 });
    report(`slab +${s.vpx.toFixed(1)} px: radius 4 abstains ${g4.abstained} of ${g4.filled} filled; radius 12 abstains ${g12.abstained} of ${g12.filled}`);
    ok("*** the abstention count moves with the quality and is the only channel that says the rule ran out of evidence ***",
       g4.abstained > 0 && g12.abstained === 0 && s.onHoles(s.patch(g12)) > s.onHoles(s.patch(g4)),
       `${g4.abstained} -> 0 abstentions as the radius goes 4 -> 12, and ${s.onHoles(s.patch(g4)).toFixed(4)} -> EXACT dB with it. Every abstained pixel is blended, which looks like a decision and is not one.`);
    // *** AND THE CONTROL ARM MUST STILL BE REACHABLE, OR THIS ROUND CANNOT BE SUBTRACTED. ***
    const off = S.gen(null);
    ok("*** frameInterp with `fill` null is v4677 exactly: same holes, same frame, side null ***",
       off.holes === S.base.holes && off.side === null && off.filled === 0
       && (() => { let w = 0; for (let i = 0; i < W * H * 4; i++) w = Math.max(w, Math.abs(off.frame[i] - S.base.frame[i])); return w === 0; })(),
       `${off.holes} holes, side ${off.side}, filled ${off.filled}, frame identical to the bit. The switch is what makes this round a subtraction rather than a claim.`);
}

console.log("\n6. WHICH OF THE OCCLUDER'S PIXELS SPEAKS FOR IT, WHEN SEVERAL ARE EQUALLY NEAR");
{
    // *** A FLAT OCCLUDER HAS HUNDREDS OF PIXELS AT ONE DEPTH, SO "THE NEAREST FILLED PIXEL" IS A TIE. *** On
    // the slab scene that tie is harmless: the slab lies entirely to one side of the strip it uncovered, so
    // every one of its pixels gives the direction the same sign. A SABOTAGE established that -- dropping the
    // spatial tie-break scored 0 red -- and the response is a case where the occluder wraps the hole, which
    // the rendered scene does not build and a nine-pixel grid can.
    const w = 9, h = 9, n = w * h;
    const vec = new Float32Array(n * 2), zb = new Float32Array(n).fill(0.9), hl = new Uint8Array(n);
    hl[4 * w + 4] = 1;                          // one hole, at the centre
    // two pixels of the occluder: one at the far corner the scan reaches FIRST, one immediately to the right
    for (const [x, y] of [[0, 0], [5, 4]]) { zb[y * w + x] = 0.2; vec[(y * w + x) * 2] = 1; }
    const r = fillHolesCPU({ vec, hole: hl, zbuf: zb, w, h, radius: 4 });
    report(`one hole at (4,4); occluder pixels at (0,0) -- which the scan reaches first -- and (5,4), which is adjacent. Both move +1 px in x.`);
    ok("*** the occluder's SPATIALLY NEAREST pixel is the one that speaks, so the side is the scene's answer and not the scan's ***",
       r.side[4 * w + 4] === SIDE_CUR,
       `side ${r.side[4 * w + 4]} (cur ${SIDE_CUR}, prev ${SIDE_PREV}, blend ${SIDE_BLEND}). From (5,4) the hole is at direction (-1, 0) and the occluder moves (+1, 0), so it is LEAVING and the content is in cur. ` +
       `From (0,0) the direction is (+4, +4) and the same vector reads as ARRIVING -- the opposite answer, from a pixel of the same surface four times further away.`);
    ok("...and the vector taken is still the FARTHER surface's, which is a separate choice from which pixel decides the side",
       r.vec[(4 * w + 4) * 2] === 0,
       `vec ${r.vec[(4 * w + 4) * 2]} -- the wall's 0 and not the occluder's +1. Two questions, two rules: WHAT the hole holds is the background's vector, WHICH FRAME it reads is the occluder's geometry.`);
}

console.log("\n7. WHAT IT REFUSES");
{
    const base = () => ({ vec: new Float32Array(W * H * 2), hole: new Uint8Array(W * H), zbuf: new Float32Array(W * H), w: W, h: H });
    for (const [label, patch, pat] of [
        ["a fractional radius", { radius: 2.5 }, /radius must be a whole number/],
        ["a growth rule it does not implement", { growth: "flood" }, /growth must be/],
        ["a preference it does not implement", { prefer: "middle" }, /prefer must be/],
        ["a side it does not implement", { side: "both" }, /side must be/],
        ["*** a missing zbuf, rather than falling back to the scan order ***", { zbuf: null }, /zbuf must be w\*h/],
        ["a short vec", { vec: new Float32Array(W * H) }, /vec must be w\*h\*2/],
    ]) {
        const m = threw(() => fillHolesCPU({ ...base(), ...patch }));
        ok(`${label} is refused`, pat.test(m || ""), m);
    }
}

// ---- THE SABOTAGE LOG ------------------------------------------------------------------------------------
//
// *** A CONTROL THAT CANNOT FAIL IS DECORATION, SO EVERY ROW ABOVE WAS BROKEN ON PURPOSE AND WATCHED. ***
// Seventeen mutations, each reverted.
//
//   Z1  `prefer` is accepted and ignored                        -> 1 red (2)
//   Z2  `prefer` is inverted                                    -> 7 red (2, 3, 4, 5)
//   Z3  the neighbourhood takes the FIRST filled pixel it scans  -> 1 red (2)
//   Z4  the occluder is picked without the spatial tie-break     -> 1 red (6), AFTER A ROW WAS ADDED
//   Z5  the side decision's sign is flipped                      -> 5 red (3, 4, 5)
//   Z6  the rule never abstains -- a coin flip recorded as a
//       decision                                                -> 1 red (5)
//   Z7  a side code is written outside the holes too             -> 2 red (2, 3)
//   Z8  `filled` is not counted in the neighbourhood path        -> 1 red (3)
//   Z9  the ring path fills IN PLACE, so a pass reads its own
//       writes and the field grows faster with the scan          -> 2 red (1)
//   Z10 the radius is hardwired to 4 inside the search           -> 3 red (4, 5)
//   Z11 frameInterp ignores the side codes entirely              -> 4 red (3, 4)
//   Z12 each of the six guards in turn                          -> 1 red each (7)
//
// *** Z4 SCORED 0 RED ON ITS FIRST ATTEMPT, AND THAT WAS A GAP IN THE CONTENT RATHER THAN A NO-OP. *** The
// slab is FLAT, so hundreds of its pixels sit at one depth and "the nearest filled pixel" is a tie among all
// of them -- but the slab lies entirely to one side of the strip it uncovered, so every one of those pixels
// gives the direction to the hole the same sign and the tie-break cannot change the answer. Section 6 builds
// the case the render does not: an occluder with a pixel adjacent to the hole AND a pixel at the far corner
// that the scan reaches first, which read the same vector as LEAVING and ARRIVING respectively. Z4 then
// scores 1 red. The negative result is what asked the question; the code had looked fine.
//
// Z9 is worth a note of its own: filling in place makes the RING result WORSE still, so the snapshot is
// load-bearing even inside the algorithm this round measures as a failure. A wrong answer that also depends
// on the scan direction is two defects, and reproducing the first one honestly requires not having the second.

console.log(`\nholeFill-selfcheck: ${fails ? `${fails} FAILED` : "ALL GREEN"}`);
console.log("unchecked here: THE SIDE DECISION ON CONTENT THAT IS NOT A FLAT SLAB ON A FLAT WALL. Every dB above " +
    "comes from one occluder, one depth each, one direction of travel, and an EXACT motion field supplied from the " +
    "scene's own knowledge -- so the filler is measured with the flow's error removed, deliberately, and a real " +
    "pipeline's holes will be in different places than these. WHAT WOULD MAKE THE RULE UNNECESSARY IS ALREADY IN " +
    "THIS TREE: render/motionVectors.mjs's fourth channel is zPrev, the depth a surface WOULD have had last " +
    "frame, and render/temporalReject.mjs already compares it against the depth recorded to decide disocclusion " +
    "per pixel. The dot product here is an approximation of that signal computed without it, and wiring the real " +
    "one is the next round rather than a claim in this one. THE RADIUS IS NOT DERIVED: section 4 measures that the " +
    "default is 6 dB wrong for an occluder moving 17.6 px, and the pass does not look at the field it was handed " +
    "to notice. ROTATION AND SCALE: an occluder that turns or approaches changes the hole's shape, and nothing " +
    "here has a hole that is not a straight strip. And fsr.html still calls none of it.");
process.exit(fails ? 1 : 0);
