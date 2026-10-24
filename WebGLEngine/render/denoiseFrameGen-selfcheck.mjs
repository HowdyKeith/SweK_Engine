// WebGLEngine/render/denoiseFrameGen-selfcheck.mjs -- the denoiser arc, round 59 (pre-registration section 133)
//
// Run: node render/denoiseFrameGen-selfcheck.mjs
//
// GATES render/denoiseFrameGen.mjs: FSR3's generator between two of round 32's chain frames on the path tracer's output. Its
// exports, each named here: FRAMEGEN_FILL, PREV_FRAME, CUR_FRAME, SKY_DEPTH, FRAMEGEN_SEED_BASE, frameGenSeeds, midEye,
// projectTo, motionField, renderFrameGenImages, frameGenFrames.
//
// *** NOTHING HERE RENDERS A DATASET SEED. *** Every scene this gate draws is seeded from 990900 up, outside every split; the
// rows that touch the split ask only for its seeds and for the refusal, which throws before rendering.
//
// ---- SABOTAGES, WITH THEIR RESULTS ---------------------------------------------------------------------------
//   FG1 the field's vectors reversed                                    2 RED (the field row; the study gate's miniature row)
//   FG2 the generator reading the field as indexed by the older frame   1 RED (the G-is-interpolateFrameCPU's row)
//   FG3 FRAMEGEN_FILL reaching 8                                        2 RED (the fill row; the study gate's miniature row)
//   FG4 the midpoint eye at frame 7's                                   1 RED (the midpoint row)
//   FG5 the cross-fade at t 0.3                                         1 RED (the X-is-the-cross-fade row)
//   FG6 O6 accumulated through frame 7                                  1 RED (the R-differs-from-O7 row)
//   FG7 SPLITS_FRAMEGEN left out of the dataset refusal                 2 RED (the split row here; the study gate's refusal row)
//   and round 60's light-free arrangement (section 136):
//   LF1 G' generated between the lit frames                             1 RED (the G'-X'-R' row)
//   LF2 the arms lit with frame 7's light sources                       2 RED (the G'-X'-R' row; the noisy frame's row)
//   LF3 the cross-fade arm left unlit                                   1 RED (the G'-X'-R' row)
//   LF4 the light-free noisy frame lit at frame 7                       1 RED (the noisy frame's row -- added before the runner, as the
//       arms' row did not see the noisy frame)
//   LF7 SPLITS_FRAMEGEN_LF left out of the dataset refusal              1 RED (the study gate's refusal row)
// The field row was first written at a third of the unmoved distance; the R scene at 48 x 48 read 0.45 (the check rounds to
// whole pixels), so it holds half -- which FG1's reversed field still fails.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const imp = (p) => import(pathToFileURL(path.join(ENG, p)).href);
const FG = await imp("render/denoiseFrameGen.mjs");
const { makeScene, renderSeeds, SPLITS_FRAMEGEN, SPLITS_TEMPORALUP, familyOf } = await imp("render/denoiseScenes.mjs");
const { cameraPath, firstHits, FRAMES } = await imp("render/denoiseTemporal.mjs");
const { cameraBasis, pixelRay } = await imp("physics/render/pathTracer.mjs");
const { interpolateFrameCPU } = await imp("render/frameInterp.mjs");
const { temporalUpscaleSeeds } = await imp("render/denoiseTemporalUpscale.mjs");
const { decodeNet } = await imp("render/denoiseDevice.mjs");
let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const t0 = Date.now();

console.log("\n1. THE CAMERA: THE ORBIT'S LAST STEP AND ITS MIDPOINT, AND THE PROJECTION");
{
    const S = makeScene("R", 990900), P = cameraPath(S), m = FG.midEye(P), a = P.eyes[FG.PREV_FRAME], b = P.eyes[FG.CUR_FRAME];
    const ang = (e) => Math.atan2(e[2], e[0]), R = (e) => Math.hypot(e[0], e[2]);
    ok("!! the midpoint eye is on the orbit's ring and height, halfway in angle between frames 6 and 7, equidistant from both and neither",
        FG.PREV_FRAME === FRAMES - 2 && FG.CUR_FRAME === FRAMES - 1 && Math.abs(R(m) - R(b)) < 1e-12 && m[1] === b[1] && Math.abs(ang(m) - (ang(a) + ang(b)) / 2) < 1e-12 &&
        Math.abs(Math.hypot(m[0] - a[0], m[2] - a[2]) - Math.hypot(m[0] - b[0], m[2] - b[2])) < 1e-12 && Math.hypot(m[0] - b[0], m[2] - b[2]) > 1e-3,
        `step ${P.stepDeg.toFixed(2)} degrees`);
    // projectTo inverts pixelRay: every pixel centre's ray, and a point along it, land back on the pixel
    const B = cameraBasis({ ...S, eye: b }), W = 24, H = 16;
    let worst = 0;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const d = pixelRay(x, y, 0.5, 0.5, W, H, B), pd = FG.projectTo(B, W, H, d, true), pp = FG.projectTo(B, W, H, [b[0] + 3.7 * d[0], b[1] + 3.7 * d[1], b[2] + 3.7 * d[2]]);
        worst = Math.max(worst, Math.abs(pd[0] - x), Math.abs(pd[1] - y), Math.abs(pp[0] - x), Math.abs(pp[1] - y));
    }
    const behind = FG.projectTo(B, W, H, [b[0] - 2 * B.fwd[0], b[1] - 2 * B.fwd[1], b[2] - 2 * B.fwd[2]]);
    ok("!! projectTo is pixelRay inverted -- a direction and a point along it land on the pixel's centre, within 1e-9 -- and a point behind the camera has no position",
        worst < 1e-9 && behind === null, `worst ${worst.toExponential(1)}`);
}

console.log("\n2. THE MOTION FIELD, THE SCENE'S OWN");
{
    // moved along the field, a pixel's surface point is the newer frame's; unmoved, it is the orbit's step away
    const rows = [["R", 990901], ["C", 990902]].map(([fam, s]) => {
        const S = makeScene(fam, s), P = cameraPath(S), W = 48, H = 48, e6 = P.eyes[FG.PREV_FRAME], e7 = P.eyes[FG.CUR_FRAME];
        const m = FG.motionField(S, e6, e7, W, H), g6 = firstHits(S, e6, W, H), g7 = firstHits(S, e7, W, H);
        let warped = 0, still = 0, nw = 0, ns = 0, skyOk = true, finite = 0;
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
            const p = y * W + x, vx = m.flow[p * 2], vy = m.flow[p * 2 + 1];
            if (Number.isFinite(vx)) finite++;
            if (g7.obj[p] < 0) { skyOk &&= m.depth[p] === FG.SKY_DEPTH; continue; }
            skyOk &&= m.depth[p] > 0 && m.depth[p] < FG.SKY_DEPTH;
            const X = Math.round(x - vx), Y = Math.round(y - vy), q = Y * W + X, d = (q, p) => Math.hypot(g6.pos[q * 3] - g7.pos[p * 3], g6.pos[q * 3 + 1] - g7.pos[p * 3 + 1], g6.pos[q * 3 + 2] - g7.pos[p * 3 + 2]);
            if (X >= 0 && Y >= 0 && X < W && Y < H && g6.obj[q] === g7.obj[p]) { warped += d(q, p); nw++; }
            if (g6.obj[p] === g7.obj[p]) { still += d(p, p); ns++; }
        }
        return { fam, warped: warped / nw, still: still / ns, skyOk, finite, n: W * H, sky: m.sky };
    });
    // first written at a third: the R scene at 48 x 48 read 0.45 -- the check rounds each moved pixel to a whole one, half a pixel's
    // error on a 2-3 px motion -- so the row holds half, which an unmoved field (ratio 1) or a reversed one cannot meet
    ok("!! moved along the field, each pixel's surface point is within half the distance it is unmoved, on an R and a C scene; sky at SKY_DEPTH, every surface nearer, every vector finite",
        rows.every((r) => r.warped < r.still / 2 && r.skyOk && r.finite === r.n && r.sky > 0),
        rows.map((r) => `${r.fam}: ${r.warped.toFixed(4)} moved against ${r.still.toFixed(4)} still, ${r.sky} sky`).join("; "));
}

console.log("\n3. THE FRAMES: THE CHAIN TWICE, THE GENERATOR AS FSR3 RUNS IT, AND THE TWO CONTROLS");
{
    // the generator's fill is fx/fsr/fsrFrameGenTsl.mjs's makeFrameGen default, read off its text, with the fill's own prefer default
    const tsl = fs.readFileSync(path.join(ENG, "fx/fsr/fsrFrameGenTsl.mjs"), "utf8"), def = (tsl.match(/export function makeFrameGen\(THREE, TSL, \{[^}]*fill = (\{[^}]*\})/) || [])[1];
    const tslFill = def ? Function(`return (${def})`)() : null;
    ok("!! FRAMEGEN_FILL is fsr-three.html's generator's own default -- makeFrameGen's fill (radius 4, reach 16, blended), the farther neighbour",
        !!tslFill && tslFill.radius === FG.FRAMEGEN_FILL.radius && tslFill.reach === FG.FRAMEGEN_FILL.reach && tslFill.side === FG.FRAMEGEN_FILL.side && FG.FRAMEGEN_FILL.prefer === "farther" &&
        /prefer: fill\.prefer \?\? "farther"/.test(tsl) && Object.isFrozen(FG.FRAMEGEN_FILL), def || "no default read");
    const net = decodeNet(JSON.parse(fs.readFileSync(path.join(ENG, "render", "denoise-net-r11.json"), "utf8")).net);
    const seq = FG.renderFrameGenImages("C", 990903, { w: 16, h: 16, sppIn: 4, sppRef: 8 }), F = FG.frameGenFrames(seq, net), N = 256;
    const keys = ["G", "X", "R", "O7", "noisy", "Bmid1", "GNoFill"];
    ok("  every arm is a 16 x 16 rgb frame, finite", keys.every((k) => F[k].length === N * 3 && Array.from(F[k]).every(Number.isFinite)));
    // the cross-fade is the two frames' f32 mean; G is interpolateFrameCPU's own frame, called here directly with the field and fill
    const f32 = Math.fround, xOk = Array.from(F.X).every((v, i) => v === f32(f32(f32(F.R[i]) * 0.5) + f32(f32(F.O7[i]) * 0.5)));
    const S = makeScene("C", 990903), m = FG.motionField(S, seq.path.eyes[FG.PREV_FRAME], seq.path.eyes[FG.CUR_FRAME], 16, 16);
    const rgba = (a) => { const o = new Float32Array(N * 4); for (let p = 0; p < N; p++) { for (let c = 0; c < 3; c++) o[p * 4 + c] = a[p * 3 + c]; o[p * 4 + 3] = 1; } return o; };
    const g = interpolateFrameCPU({ prev: rgba(F.R), cur: rgba(F.O7), w: 16, h: 16, flow: m.flow, bw: 16, bh: 16, block: 1, depthBlock: m.depth, indexedBy: "cur", t: 0.5, fill: FG.FRAMEGEN_FILL });
    const gOk = Array.from(F.G).every((v, i) => v === g.frame[Math.floor(i / 3) * 4 + (i % 3)]);
    ok("!! X is O6 and O7's cross-fade at 0.5, float for float, and G is interpolateFrameCPU's frame between them -- the scene's field, indexed by the newer frame, block 1, FRAMEGEN_FILL, t 0.5 -- bit for bit",
        xOk && gOk && F.field.holes === g.holes && F.field.holesNoFill >= F.field.holes, `${F.field.holesNoFill} holes before the fill, ${F.field.holes} after`);
    const again = FG.frameGenFrames(seq, net);
    ok("  C4's basis: the frames re-made from the same sequence are the same, bit for bit", keys.every((k) => Array.from(again[k]).every((v, i) => Object.is(v, F[k][i]))));
    ok("  R is O6 and differs from O7 -- the two frames are the orbit's step apart", F.R.some((v, i) => v !== F.O7[i]));
}

console.log("\n5. ROUND 60 (section 136): THE SAME GENERATOR BETWEEN LIGHT-FREE FRAMES, LIT AT THE MIDPOINT");
{
    const { compositeEmitters } = await imp("render/denoiseUpscale.mjs"), { crossFadeCPU } = await imp("render/frameInterp.mjs");
    const net = decodeNet(JSON.parse(fs.readFileSync(path.join(ENG, "render", "denoise-net-r11.json"), "utf8")).net);
    const seq = FG.renderFrameGenImages("R", 990904, { w: 16, h: 16, sppIn: 4, sppRef: 8 }), F = FG.frameGenFrames(seq, net), N = 256;
    const bits = (a, b) => a.length === b.length && Array.from(a).every((v, i) => Object.is(v, b[i]));
    const rgba = (a) => { const o = new Float32Array(N * 4); for (let p = 0; p < N; p++) { for (let c = 0; c < 3; c++) o[p * 4 + c] = a[p * 3 + c]; o[p * 4 + 3] = 1; } return o; };
    const rgb = (a) => { const o = new Float64Array(N * 3); for (let p = 0; p < N; p++) for (let c = 0; c < 3; c++) o[p * 3 + c] = a[p * 4 + c]; return o; };
    // L6 and L7 are the frames round 59 composited: lit with their own eyes' light sources they ARE O6 and O7, bit for bit
    ok("!! L6 and L7 are the chain's accumulations before the composite: lit with frames 6's and 7's own light sources they are O6 and O7, bit for bit",
        bits(compositeEmitters(F.L6, seq.E.prev), F.R) && bits(compositeEmitters(F.L7, seq.E.cur), F.O7));
    const S = makeScene("R", 990904), m = FG.motionField(S, seq.path.eyes[FG.PREV_FRAME], seq.path.eyes[FG.CUR_FRAME], 16, 16);
    const g = interpolateFrameCPU({ prev: rgba(F.L6), cur: rgba(F.L7), w: 16, h: 16, flow: m.flow, bw: 16, bh: 16, block: 1, depthBlock: m.depth, indexedBy: "cur", t: 0.5, fill: FG.FRAMEGEN_FILL });
    const mid = (y) => compositeEmitters(y, seq.E.mid);
    ok("!! G' is interpolateFrameCPU's frame between L6 and L7 lit with the midpoint's light sources, X' their cross-fade lit the same, R' L6 lit the same -- bit for bit",
        bits(F.Gl, mid(rgb(g.frame))) && bits(F.Xl, mid(rgb(crossFadeCPU({ prev: rgba(F.L6), cur: rgba(F.L7), w: 16, h: 16, t: 0.5 })))) && bits(F.Rl, mid(F.L6)) &&
        ["Gl", "Xl", "Rl", "noisyMid", "GlNoFill"].every((k) => F[k].length === N * 3 && Array.from(F[k]).every(Number.isFinite)));
    // the noisy frame is the newer frame's half-size input through the chain's fill, bilinear upscale and shift, lit at the midpoint
    const { upscale, fillEmitters } = await imp("render/denoiseUpscale.mjs"), { shiftResample, halfShift } = await imp("render/denoiseTemporalUpscale.mjs");
    const last = seq.frames[FG.CUR_FRAME], nl = shiftResample(upscale(fillEmitters(last.half.input, last.half.cov, 8, 8), 8, 8, 16, 16, "bilinear"), 16, 16, ...halfShift(last.jitter));
    ok("!! the light-free arrangement's noisy frame is the newer frame's half-size input through the chain's fill, bilinear upscale and shift, lit at the midpoint as the arms are -- bit for bit",
        bits(F.noisyMid, mid(nl)) && bits(F.noisy, compositeEmitters(nl, seq.E.cur)));
    // the light sources at the midpoint are where the geometry puts them there: E_mid is emitterRadiance from the midpoint eye
    const { emitterRadiance } = await imp("render/denoiseMask.mjs"), Em = emitterRadiance({ ...S, eye: seq.mid }, 16, 16);
    ok("  E_mid is emitterRadiance from the midpoint eye, and differs from frame 7's -- the light sources moved half a step",
        bits(Em.E, seq.E.mid.E) && bits(Em.cov, seq.E.mid.cov) && !bits(seq.E.mid.cov, seq.E.cur.cov) || (bits(Em.E, seq.E.mid.E) && seq.E.cur.cov.every((v) => v === 0)),
        `${seq.E.mid.cov.filter((v) => v > 0).length} pixels lit at the midpoint, ${seq.E.cur.cov.filter((v) => v > 0).length} at frame 7`);
}

// section 151's sabotages: H1s GhX filled from L6 -> 1 red (the fallback row); H2s HOLE_FILL radius 2 / reach 3 -> 2 red here and 1 in the
// study gate. Each restored byte-identical.
console.log("\n6. ROUND 66 (section 151): THE FILL SCALED TO 1080p's HOLES, AND WHAT A HOLE SHOWS");
{
    const { compositeEmitters } = await imp("render/denoiseUpscale.mjs"), { crossFadeCPU } = await imp("render/frameInterp.mjs");
    const net = decodeNet(JSON.parse(fs.readFileSync(path.join(ENG, "render", "denoise-net-r11.json"), "utf8")).net);
    // 48 x 48: the smallest size at which this scene leaves holes under the scaled fill (26; none at 32)
    const D = 48, N = D * D, seq = FG.renderFrameGenImages("R", 990916, { w: D, h: D, sppIn: 4, sppRef: 8 }), F = FG.frameGenFrames(seq, net, { holes: true });
    const bits = (a, b) => a.length === b.length && Array.from(a).every((v, i) => Object.is(v, b[i]));
    const rgba = (a) => { const o = new Float32Array(N * 4); for (let p = 0; p < N; p++) { for (let c = 0; c < 3; c++) o[p * 4 + c] = a[p * 3 + c]; o[p * 4 + 3] = 1; } return o; };
    const rgb = (a) => { const o = new Float64Array(N * 3); for (let p = 0; p < N; p++) for (let c = 0; c < 3; c++) o[p * 3 + c] = a[p * 4 + c]; return o; };
    const S = makeScene("R", 990916), m = FG.motionField(S, seq.path.eyes[FG.PREV_FRAME], seq.path.eyes[FG.CUR_FRAME], D, D), mid = (y) => compositeEmitters(y, seq.E.mid);
    const g = interpolateFrameCPU({ prev: rgba(F.L6), cur: rgba(F.L7), w: D, h: D, flow: m.flow, bw: D, bh: D, block: 1, depthBlock: m.depth, indexedBy: "cur", t: 0.5, fill: FG.HOLE_FILL });
    ok("!! HOLE_FILL is the fill scaled by 256 / 1920 -- radius 1, reach 2, blended, the farther -- and Gh is interpolateFrameCPU's frame with it between L6 and L7, lit at the midpoint, its holes black; holeMask its holes",
        FG.HOLE_FILL.radius === 1 && FG.HOLE_FILL.reach === 2 && FG.HOLE_FILL.side === "blend" && FG.HOLE_FILL.prefer === "farther" && Object.isFrozen(FG.HOLE_FILL) &&
        bits(F.Gh, mid(rgb(g.frame))) && bits(F.holeMask, g.hole) && F.holesScaled === g.holes && g.holes > 0, `${g.holes} of ${N} holes`);
    // each fallback is Gh outside the holes and its source inside them, lit the same (the composite is per pixel)
    const xf = mid(rgb(crossFadeCPU({ prev: rgba(F.L6), cur: rgba(F.L7), w: D, h: D, t: 0.5 }))), l7 = mid(F.L7), l6 = mid(F.L6);
    const per = (A, src) => { let bad = 0; for (let p = 0; p < N; p++) for (let c = 0; c < 3; c++) if (!Object.is(A[p * 3 + c], F.holeMask[p] ? src[p * 3 + c] : F.Gh[p * 3 + c])) bad++; return bad; };
    ok("!! GhX, GhC and GhP are Gh outside its holes and, inside them, the cross-fade of L6 and L7, L7, and L6 -- each lit at the midpoint, bit for bit",
        per(F.GhX, xf) === 0 && per(F.GhC, l7) === 0 && per(F.GhP, l6) === 0 && !bits(F.GhX, F.Gh) && !bits(F.GhC, F.GhX), `${per(F.GhX, xf)}, ${per(F.GhC, l7)}, ${per(F.GhP, l6)} differences`);
    ok("  ...and without { holes: true } none of the round's arms is made -- rounds 59-62's frames are as they were", !("Gh" in FG.frameGenFrames(seq, net)));
}

console.log("\n4. THE SEEDS AND THE SPLIT");
{
    const r = FG.frameGenSeeds(53000), all = SPLITS_FRAMEGEN.T1.seeds.flatMap((s) => { const q = FG.frameGenSeeds(s); return [...q.half, q.mid, q.ref, q.ref2]; });
    const r32 = SPLITS_TEMPORALUP.T1.seeds.flatMap((s) => { const q = temporalUpscaleSeeds(s); return [...q.half, ...q.full1, q.ref, q.ref2]; });
    ok("!! each image's render seeds: FRAMES half-size frames and the midpoint's above FRAMEGEN_SEED_BASE, renderSeeds' two references -- 132 distinct over the split, none of round 32's",
        r.half.length === FRAMES && r.half[0] === FG.FRAMEGEN_SEED_BASE + 53000 * 16 && r.mid === r.half[FRAMES - 1] + 1 && r.ref === renderSeeds(53000).ref && r.ref2 === renderSeeds(53000).ref2 &&
        new Set(all).size === all.length && all.length === 132 && all.every((s) => !r32.includes(s)));
    let refused = 0;
    for (const s of SPLITS_FRAMEGEN.T1.seeds) { try { FG.renderFrameGenImages("R", s, { w: 2, h: 2, sppIn: 1, sppRef: 1 }); } catch (e) { if (/dataset seed/.test(e.message)) refused++; } }
    ok("!! SPLITS_FRAMEGEN: 6 of R at 53000 and 6 of C at 54000, each its own family, every one refused without harvest",
        SPLITS_FRAMEGEN.T1.seeds.length === 12 && SPLITS_FRAMEGEN.T1.seeds[0] === 53000 && SPLITS_FRAMEGEN.T1.seeds[6] === 54000 &&
        SPLITS_FRAMEGEN.T1.seeds.every((s, i) => familyOf(SPLITS_FRAMEGEN.T1, i) === (i < 6 ? "R" : "C")) && refused === 12, `${refused} of 12 refused`);
}

console.log(`\n${fails ? "FAIL -- " + fails + " check(s)" : "ALL GREEN"} (${Date.now() - t0} ms)` +
    "\nnot closed here: whether the generated frame is closer to the truth than the controls. That is the harvest's question, section 134's.");
process.exit(fails ? 1 : 0);
