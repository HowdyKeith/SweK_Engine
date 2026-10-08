// WebGLEngine/render/denoiseTemporal-selfcheck.mjs -- the denoiser arc, round 4
//
// Run: node render/denoiseTemporal-selfcheck.mjs
//
// GATES render/denoiseTemporal.mjs -- the sequences and the shared history front-end of pre-registration section 17.
// Its exports, each named here: FRAMES, STEP_DEG, TCHANNELS, POS_TOL, NORMAL_DOT, HISTORY_SEED_BASE, historySeed,
// sequenceSeeds, cameraPath, firstHits, reproject, accumulate, renderSequence, temporalChannels. Section 7 runs
// render/denoiseStudy.mjs's pipeline in its temporal mode on the miniature (scenes seeded outside every split).
//
// *** NOTHING HERE RENDERS A DATASET SEED. *** Every scene is seeded from 950000 up or built by hand; the rows that
// touch the splits ask only for seeds and for the refusal, which throws before rendering.
//
// ---- SABOTAGES, WITH THEIR RESULTS ---------------------------------------------------------------------------
//   T1  the inverse projection's v with its sign flipped                         4 RED
//   T2  the bilinear weights' fx and fy swapped                                  4 RED
//   T3  the same-object test dropped                                             2 RED (1 until the row for the object test alone was written)
//   T4  alpha a constant 1 / FRAMES instead of 1 / n                             2 RED
//   T5  history seeds on 8 s + k (the base set to 0, f + 2)                      1 RED
//   T6  the last frame's eye recomputed from the angle instead of the scene's    1 RED
//   T7  the history length not capped at FRAMES                                  1 RED
//   T8  the temporal run's C5 counts only 8 s + k, not the history seeds         1 RED (the row counts the seeds; a boolean alone stayed green)
//   T9  the no-history networks trained on the 13-channel input                  1 RED (the row asks for finite errors; lengths alone stayed green)
"use strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const imp = (p) => import(pathToFileURL(path.join(ENG, p)).href);
const { FRAMES, STEP_DEG, TCHANNELS, POS_TOL, NORMAL_DOT, HISTORY_SEED_BASE, historySeed, sequenceSeeds, cameraPath, firstHits, reproject, accumulate,
        renderSequence, temporalChannels } = await imp("render/denoiseTemporal.mjs");
const { SPLITS, SPLITS_R2, SPLITS_R3, SPLITS_R4, makeScene, renderImages, renderSeeds, remodulate, CHANNELS } = await imp("render/denoiseScenes.mjs");
const { relMSE } = await imp("render/denoiseStats.mjs");
const { pixelRay } = await imp("physics/render/pathTracer.mjs");
const { MINI, runStudy } = await imp("render/denoiseStudy.mjs");

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const t0 = Date.now();
const W = 32, H = 32;

console.log("1. THE CONSTANTS AND THE RENDER SEEDS");
{
    ok("  8 frames, a 1.5-4 degree step, 13 input channels, taps within 3 footprints facing within 0.9, history seeds from 1e7",
        FRAMES === 8 && STEP_DEG.join() === "1.5,4" && TCHANNELS === CHANNELS + 4 && POS_TOL === 3 && NORMAL_DOT === 0.9 && HISTORY_SEED_BASE === 1e7);
    const all = [SPLITS, SPLITS_R2, SPLITS_R3, SPLITS_R4].flatMap((S) => Object.values(S).flatMap((s) => s.seeds));
    const scene = [...new Set(all)], round = new Set(scene.flatMap((s) => { const r = renderSeeds(s); return [r.input, r.ref, r.ref2]; }));
    const hist = scene.flatMap((s) => Array.from({ length: FRAMES - 1 }, (_, f) => historySeed(s, f)));
    ok("!! C5 for sequences: every history render seed of every dataset scene is distinct, and none is any scene's 8 s + 1, + 2 or + 3",
        new Set(hist).size === hist.length && hist.every((v) => !round.has(v)) && sequenceSeeds(1000).length === FRAMES + 2 && new Set(sequenceSeeds(1000)).size === FRAMES + 2,
        `${hist.length} history seeds over ${scene.length} scenes`);
    let threw = null; try { historySeed(1000, FRAMES - 1); } catch (e) { threw = e.message; }
    ok("  the measured frame has no history seed -- it keeps 8 s + 1 -- and asking for one is refused", /not in 0\.\.6/.test(threw || ""), threw);
    let refused = null; try { renderSequence("A", SPLITS.train.seeds[0], { w: 2, h: 2, sppIn: 1, sppRef: 1 }); } catch (e) { refused = e.message; }
    ok("!! a dataset seed is refused without { harvest: true }, before a frame is rendered", /dataset seed/.test(refused || ""), refused);
}

console.log("\n2. THE CAMERA PATH");
{
    let lastIsEye = true, onRing = true, even = true, inRange = true, dirs = new Set(), lo = Infinity, hi = 0;
    for (let s = 950000; s < 950200; s++) {
        const S = makeScene(s % 2 ? "B" : "A", s), P = cameraPath(S), R = Math.hypot(S.eye[0], S.eye[2]);
        lastIsEye &&= P.eyes[FRAMES - 1] === S.eye;
        onRing &&= P.eyes.every((e) => Math.abs(Math.hypot(e[0], e[2]) - R) < 1e-12 && e[1] === S.eye[1]);
        const angs = P.eyes.map((e) => Math.atan2(e[2], e[0]));
        for (let f = 1; f < FRAMES; f++) { let d = angs[f] - angs[f - 1]; d = Math.atan2(Math.sin(d), Math.cos(d)); even &&= Math.abs(Math.abs(d) * 180 / Math.PI - P.stepDeg) < 1e-9; }
        inRange &&= P.stepDeg >= STEP_DEG[0] && P.stepDeg <= STEP_DEG[1]; dirs.add(P.dir); lo = Math.min(lo, P.stepDeg); hi = Math.max(hi, P.stepDeg);
    }
    ok("!! over 200 scenes the LAST frame's eye is the scene's own eye -- the same array -- so the measured frame is the image rounds 1-3 measured", lastIsEye);
    ok("  every frame's eye is on the scene's ring at its height, the steps are equal, within 1.5-4 degrees, and both directions occur",
        onRing && even && inRange && dirs.size === 2, `steps ${lo.toFixed(2)}-${hi.toFixed(2)} degrees`);
}

console.log("\n3. THE INVERSE PROJECTION, AGAINST THE FORWARD ONE");
{
    const S = makeScene("A", 950003), P = cameraPath(S), g0 = firstHits(S, P.eyes[5], W, H), g1 = firstHits(S, P.eyes[6], W, H), R = reproject(g0, g1, W, H);
    // a pixel whose four taps all held: the weights ARE the bilinear fractions, so the tap corner and fractions give the
    // continuous position, and the previous camera's own ray through it must pass through the current pixel's hit point
    let worst = 0, n = 0;
    for (let p = 0; p < W * H; p++) {
        if (![0, 1, 2, 3].every((k) => R.taps[4 * p + k] >= 0)) continue;
        const q0 = R.taps[4 * p], x0 = q0 % W, y0 = (q0 / W) | 0, fx = R.wts[4 * p + 1] + R.wts[4 * p + 3], fy = R.wts[4 * p + 2] + R.wts[4 * p + 3];
        const d = pixelRay(x0, y0, 0.5 + fx, 0.5 + fy, W, H, g0.B), Pp = [g1.pos[p * 3], g1.pos[p * 3 + 1], g1.pos[p * 3 + 2]];
        const v = [Pp[0] - g0.eye[0], Pp[1] - g0.eye[1], Pp[2] - g0.eye[2]], t = v[0] * d[0] + v[1] * d[1] + v[2] * d[2];
        worst = Math.max(worst, Math.hypot(v[0] - t * d[0], v[1] - t * d[1], v[2] - t * d[2])); n++;
    }
    ok(`!! the previous camera's ray through the reprojected position passes through the current hit point: worst miss ${worst.toExponential(1)} over ${n} pixels`, n > 300 && worst < 1e-9);
    let skyKept = 0; for (let p = 0; p < W * H; p++) if (g1.obj[p] < 0 && R.valid[p]) skyKept++;
    ok("  sky pixels carry no history", skyKept === 0);
}

console.log("\n4. DISOCCLUSION: A POINT HIDDEN IN THE PREVIOUS FRAME IS NOT READ FROM WHAT HID IT");
{
    // ground and one sphere in front of the look point; the eye steps 10 degrees -- more than a sequence ever does, so the
    // uncovered strip is several pixels wide and its inside is not all silhouette
    const S = { scene: [{ centre: [0, -100, 0], radius: 100, albedo: [0.5, 0.5, 0.5] }, { centre: [0, 0.5, 1.5], radius: 0.5, albedo: [0.8, 0.2, 0.2] }],
                look: [0, 0.4, 0], up: [0, 1, 0], fovDeg: 40 };
    const a = 0.3, d4 = 10 * Math.PI / 180, cur = firstHits(S, [4.5 * Math.cos(a), 1.2, 4.5 * Math.sin(a)], W, H), prev = firstHits(S, [4.5 * Math.cos(a + d4), 1.2, 4.5 * Math.sin(a + d4)], W, H);
    const R = reproject(prev, cur, W, H);
    let hidden = 0, hiddenInvalid = 0, wrongObj = 0;
    for (let p = 0; p < W * H; p++) {
        for (let k = 0; k < 4; k++) { const q = R.taps[4 * p + k]; if (q >= 0 && prev.obj[q] !== cur.obj[p]) wrongObj++; }
        if (cur.obj[p] !== 0) continue;
        // was this ground point behind the sphere from the previous eye?
        const P = [cur.pos[p * 3], cur.pos[p * 3 + 1], cur.pos[p * 3 + 2]], e = prev.eye, c = S.scene[1].centre;
        const dv = [P[0] - e[0], P[1] - e[1], P[2] - e[2]], L = Math.hypot(...dv), u = dv.map((v) => v / L), oc = [e[0] - c[0], e[1] - c[1], e[2] - c[2]];
        const b = oc[0] * u[0] + oc[1] * u[1] + oc[2] * u[2], disc = b * b - (oc[0] ** 2 + oc[1] ** 2 + oc[2] ** 2 - 0.25);
        if (disc > 0 && -b - Math.sqrt(disc) > 0 && -b - Math.sqrt(disc) < L - 1e-6) {
            hidden++;
            // every 4-neighbourhood tap of a point hidden deep behind the sphere saw the sphere; the pixel restarts
            if (!R.valid[p]) hiddenInvalid++;
        }
    }
    ok("!! no kept tap ever saw a different object", wrongObj === 0);
    // the object test on its own: the previous frame IS the current one (every tap at the same place, facing the same
    // way), but one object's index is changed -- its pixels must restart, and every other pixel must keep its history
    const relabel = { ...cur, obj: Int32Array.from(cur.obj, (o) => (o === 1 ? 7 : o)) }, Rs = reproject(relabel, cur, W, H);
    let sphereKept = 0, groundLost = 0;
    for (let p = 0; p < W * H; p++) { if (cur.obj[p] === 1 && Rs.valid[p]) sphereKept++; if (cur.obj[p] === 0 && !Rs.valid[p]) groundLost++; }
    ok("!! the same place, the same normal, a DIFFERENT object: refused -- and the untouched object keeps every pixel", sphereKept === 0 && groundLost === 0,
        `${sphereKept} sphere pixels kept, ${groundLost} ground pixels lost`);
    ok("!! ground the sphere hid in the previous frame is uncovered in this one, and most of it restarts its history instead of reading the sphere",
        hidden > 5 && hiddenInvalid / hidden > 0.5, `${hidden} hidden ground pixels, ${hiddenInvalid} restarted (the rest sit at the silhouette, where a tap saw nearby ground)`);
}

console.log("\n5. THE RUNNING AVERAGE");
{
    const S = makeScene("A", 950004), g = firstHits(S, S.eye, W, H);
    let k = 7; const u = () => ((k = (k * 1664525 + 1013904223) >>> 0) / 4294967296);
    const frames = Array.from({ length: FRAMES }, () => Float64Array.from({ length: W * H * 3 }, () => u()));
    const { A, n } = accumulate(frames, Array(FRAMES).fill(g), W, H);
    let worst = 0, nOk = true;
    for (let p = 0; p < W * H; p++) {
        const sky = g.obj[p] < 0; nOk &&= n[p] === (sky ? 1 : FRAMES);
        for (let c = 0; c < 3; c++) { const want = sky ? frames[FRAMES - 1][p * 3 + c] : frames.reduce((a, F) => a + F[p * 3 + c], 0) / FRAMES; worst = Math.max(worst, Math.abs(A[p * 3 + c] - want)); }
    }
    ok("!! a camera that does not move makes the accumulation the exact mean of the 8 frames, history length 8 -- and the sky its last sample, length 1",
        worst < 1e-12 && nOk, `worst ${worst.toExponential(1)}`);
    const ten = Array.from({ length: 10 }, (_, i) => frames[i % FRAMES]), R10 = accumulate(ten, Array(10).fill(g), W, H);
    ok("  the history length stops at 8 however many frames come", R10.n.every((v, p) => v === (g.obj[p] < 0 ? 1 : FRAMES)));
}

console.log("\n6. A SEQUENCE, END TO END, ON NON-DATASET SCENES");
{
    let red = true; const notes = [];
    for (const [fam, seed] of [["A", 950001], ["B", 960002]]) {
        const s = renderSequence(fam, seed, { w: W, h: H, sppRef: 128 });
        const noisy = relMSE(s.input, s.ref), acc = relMSE(remodulate(s.A, s.albedo), s.ref);
        red &&= acc < 0.5 * noisy; notes.push(`${fam}: x${(acc / noisy).toFixed(3)}`);
        if (fam === "A") {
            const I = renderImages(fam, seed, { w: W, h: H, sppRef: 128 });
            ok("!! the measured frame is renderImages' own: the same input, reference, albedo and normal, bit for bit",
                ["input", "ref", "albedo", "normal"].every((key) => I[key].every((v, i) => v === s[key][i])));
            const x = temporalChannels(s), p = 37, C = TCHANNELS;
            ok("  the 13 channels: accumulated irradiance, albedo, normal, then the measured frame's own irradiance and the history length / 8",
                x.length === W * H * C && [0, 1, 2].every((c) => x[p * C + c] === s.A[p * 3 + c] && x[p * C + 3 + c] === s.albedo[p * 3 + c] && x[p * C + 6 + c] === s.normal[p * 3 + c] &&
                    x[p * C + 9 + c] === s.irr[p * 3 + c]) && x[p * C + 12] === s.n[p] / FRAMES);
        }
    }
    ok("!! seven frames of history at least halve the single frame's error on both families", red, notes.join(", "));
}

console.log("\n7. THE STUDY'S TEMPORAL PIPELINE, ON THE MINIATURE");
{
    // (the 1-sample secondary's code path is section 2's; leaving it out here keeps this gate inside the sweep budget)
    const out = runStudy({ ...MINI, train: { ...MINI.train, steps: 2 }, secondarySpp: [], c0: false, head: "kernel", temporal: true, compareNoHistory: true });
    const order = ["train rendered", "filter tuned", "networks trained", "C0", "C6", "tests rendered", "shuffled networks trained", "measured", "secondary"];
    ok("!! the temporal pipeline runs in order -- C6 measured right after C0, both before the test scenes are rendered",
        order.every((k, i) => out.timings[k] >= (i ? out.timings[order[i - 1]] : 0)) && out.historyFit && typeof out.historyFit.ratio === "number" && out.verdict.controls.C6 === out.historyFit,
        `C6 ratio ${out.historyFit.ratio.toFixed(3)} on the miniature`);
    const N1 = out.secondary["T1@noHistory"];
    ok("  the secondaries: the accumulation alone, the filter re-tuned on single frames, and three no-history networks, on the same test images",
        N1 && N1.accumulation.length === 2 && N1.filter.length === 2 && N1.net.length === 3 && typeof out.secondary.filterNoHistory.sS === "number" &&
        out.secondary["T2@noHistory"].net.every((a) => a.length === 2) && [...N1.accumulation, ...N1.filter, ...N1.net.flat()].every((v) => Number.isFinite(v) && v > 0));
    ok("!! C5 over sequences: the run's seed check counts every history frame -- 8 scenes x 10 render seeds, all distinct", out.seedsDistinct === true &&
        out.seedCount === Object.values(MINI.splits).flatMap((s) => s.seeds).length * (FRAMES + 2) && out.seedCount === 80, `${out.seedCount} render seeds checked`);
    const probe = { ...MINI, image: 8, splits: { ...MINI.splits, T1: SPLITS_R4.T1, T2: SPLITS_R4.T2 }, train: { steps: 0, batch: 1, crop: 8 }, head: "kernel", temporal: true };
    let st = null, threw = null; try { st = runStudy({ ...probe, c0: true }); } catch (e) { threw = e.message; }
    ok("!! and in the temporal pipeline the stop comes before seed 9000 is rendered", !threw && st.tables === null && st.verdict.run === "not reported", threw || st.verdict.reasons[0]);
}

console.log(`\n${fails ? "FAIL -- " + fails + " check(s)" : "ALL GREEN"} (${Date.now() - t0} ms)` +
    "\nnot closed here: whether a network does more with this history than the filter does. That is section 17's measurement.");
process.exit(fails ? 1 : 0);
