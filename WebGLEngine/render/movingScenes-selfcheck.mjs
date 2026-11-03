#!/usr/bin/env node
// WebGLEngine/render/movingScenes-selfcheck.mjs -- FSR4 round 77 (pre-registration section 176): moving scenes, on non-dataset
// scenes at 16-32 px:
//   1. the motion: who moves, how fast, in which plane, from which stream; each frame's spheres; the mover pixels
//   2. the moving example against its still twin: the same measured frame, references, light sources and B1; a different history
//   3. round 77's study code: the round, the cache key, the masked grade, the history length, the moving test's arms and verdict,
//      and the commands
//
// SABOTAGED, each restored byte-identical (/root/swek-sab/safe2.py, against this gate and denoiseScenes-selfcheck):
//   the motion: M1 the lights moved too, M2 the speed range to 0.09, M3 the motion run forwards, M4 the last frame a copy of
//   S.scene, M5 the movers rising 0.01 a frame, M7 moverMask off by one -> 1 red each; M6 the stream's salt dropped -> *** 0 RED at
//   first ***, then 1 with the stream row added;
//   the example: E1 the history's geometry left still, E3 the references re-rendered, E4 the mover mask of frame 0 -> 1 red each;
//   E2 the history frames rendered from the still scene and E5 their guides from it -> *** 0 RED at first *** (the moved geometry
//   alone kept Bt different), then 1 each once exampleFrames was split out and frame 3 rebuilt by hand; E6 the light-source mask
//   from the still scene -> *** 0 RED at first, and on 40 scenes *** (no mover crossed a light), then 1 on R 991030, found by search;
//   the study: S1 the still twin's Bt graded on the moving example -> 2 red; S2 H1 against B1, S3 movingKey unmarked, S4 the
//   masked grade in linear light, S5 the history times 7, S6 the drop's sign, S7 the moving test without its motion -> 1 red each;
//   the commands: C1 the test never dispatching runMovingTest, C2 the training refusal gone, C3 round 77 reading its own net -> 1 red
//   each; D1 the moving seeds left out of the reserved set -> 1 red (denoiseScenes-selfcheck).
// SECTION 177 (the verdict rows, sabotaged in the committed results file and the registration, each restored byte-identical): V1 the
//   run's commit typed 4eb0c2e6, V2 H77a's count typed 16, V5 the first moving history typed 5.95, V6 the mover gain typed 0.036, V7
//   H77b's p typed 0.0405, V8 the slowest mover typed 0.0904, V9 section 177 calling P6 held, V10 it dropping the sentence that the file
//   was seen before it was committed -> 1 red each; V4 Bt's first still grade typed 9.27e-4 -> 2 red; V3 U_TH's first moving grade
//   typed 7.79e-4 -> 4 red.
// ROUND 78 (section 178), against this gate and denoiseScenes-selfcheck, each restored byte-identical: R1 the moving twins without their
//   motion, R2 the moving twins first, R3 training ignoring `moving`, R4 the config's `moving` dropped, R5 H1 against Bt with a baseline,
//   R6 U_TH's still arm graded with U_THM, R7 vsU0.still inverted, R8 the baseline round 70's, R9 temporalRound(78) round 77's, R10 the
//   training refusing round 78, R11 the training not told to move, R12 the baseline not recorded, R13 round 78's R seeds round 77's,
//   R14 round 78's seeds not reserved -> 1 red each.
// SECTION 179 (the verdict rows, sabotaged in the committed files and the registration, each restored byte-identical): W1 the test's commit
//   typed a2cf6596, W2 H78a's count typed 9, W3 H78a typed supported, W5 U_TH's first still grade typed 1.54e-3, W6 the first mover U_THM
//   grade typed 2.11e-3, W7 the baseline's candidate typed 2, W8 the training's commit typed 4da3371b, W9 section 179 keeping U_THM, W10 its
//   table's U_THM mean typed 2.1678e-3 (the figure I first wrote there, before checking it) -> 1 red each; W4 U_THM's first moving grade
//   typed 1.46e-3 -> 4 red.
// ROUND 79 (section 180), against this gate and denoiseScenes-selfcheck, each restored byte-identical: Q1 the vector's sign flipped, Q2 the
//   position test against P not P - v, Q7 Bt_MV's input with the old unclamped history, Q8 H1 reversed, Q9 H2 against Bt, Q12 vectorsKey
//   unmarked, Q13 the test command running the moving test for round 79, Q14 round 79 without vectors -> 1 red each; Q4 accumulateUpscaled
//   dropping vel, Q6 Bt_MV accumulated without its vectors, Q10 U_TH on Bt_MV given the old input, Q15 round 79's R seeds round 78's, Q16 its
//   seeds not reserved -> 2 red each; Q3 the projection of P not P - v -> 3 red; Q5 the ground given a velocity -> 4 red; Q11 C2 graded on
//   the old Bt -> *** 0 RED at first ***, then 1 with the C2 row added.
// SECTION 181 (the verdict rows, sabotaged in the committed file and the registration, each restored byte-identical): Y1 the run's commit
//   typed 2f0c10c6, Y2 H79a typed supported, Y3 its count typed 14, Y5 U_TH-on-Bt's first grade typed 3.98e-4, Y6 the first mover Bt_MV grade
//   typed 2.04e-3, Y7 the first Bt_MV history typed 4.01, Y8 H79b's p typed 0.0277, Y9 section 181 opening round 80, Y10 its Bt_MV mean typed
//   1.9926e-3 -> 1 red each; Y4 Bt_MV's first grade typed 2.43e-4 -> 4 red.
// ROUND 80 (section 182), against this gate and denoiseScenes-selfcheck, each restored byte-identical: K2 sigma taken as the variance, K4 the
//   clip without the clamp, K6 mvc's unclamped twin the clipped one, K8 H1 against Bt_MV, K9 H2 Bt_MV against Bt, K10 C2 on Bt_MV, K13 the
//   test command running the vectors test, K14 checkKey without its gamma -> 1 red each; K1 the clip on every pixel, K3 centred on the pixel
//   not the mean, K5 a 5-tap cross, K15 round 80's C seeds round 79's, K16 its seeds not reserved -> 2 red each; K11 gamma 1.5 and K12 the
//   test's gamma not passed -> 3 red each; K7 Bt_MVC's image from the vectors' own history -> *** 0 RED at first ***, then 1 with the
//   rebuilt-image row added.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const imp = (p) => import(pathToFileURL(path.join(ENG, p)).href);
let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const t0 = Date.now();
const M = await imp("render/movingScenes.mjs"), T = await imp("render/learnedUpscaleTemporal.mjs"), LT = await imp("render/learnedUpscaleTemporalStudy.mjs");
const D = await imp("render/denoiseScenes.mjs"), { FRAMES, cameraPath, firstHits } = await imp("render/denoiseTemporal.mjs"), { decodeNet } = await imp("render/denoiseDevice.mjs");
const { gradeDisplay } = await imp("render/learnedUpscaleStudy.mjs"), { relMSE, effects } = await imp("render/denoiseStats.mjs"), { toPerceptual } = await imp("render/denoiseUpscale.mjs");
const net = decodeNet(JSON.parse(fs.readFileSync(path.join(ENG, "render", "denoise-net-r11.json"), "utf8")).net);
const same = (a, b) => a.length === b.length && a.every((v, i) => Object.is(v, b[i]));
const FIX = [["R", 990950], ["C", 990951]];

console.log("1. THE MOTION");
{
    ok("  MOVE_SPEED is section 176's 0.01-0.08 world units a frame, frozen; the stream's salt is 77", M.MOVE_SPEED.join() === "0.01,0.08" && Object.isFrozen(M.MOVE_SPEED) && M.MOTION_SALT === 77);
    const rows = FIX.map(([f, s]) => { const S = D.makeScene(f, s); return { S, mo: M.sceneMotion(S) }; });
    ok("!! sceneMotion: every sphere but the ground and the lights moves, once, in the ground plane, at a speed inside MOVE_SPEED",
        rows.every(({ S, mo }) => mo.map((m) => m.index).join() === S.scene.map((s, i) => (i === 0 || s.emit ? -1 : i)).filter((i) => i >= 0).join() &&
            mo.every((m) => m.v[1] === 0 && Math.hypot(m.v[0], m.v[2]) >= M.MOVE_SPEED[0] && Math.hypot(m.v[0], m.v[2]) <= M.MOVE_SPEED[1]) && Object.isFrozen(mo)),
        rows.map(({ mo }) => mo.length + " movers").join(", "));
    const S = rows[0].S, mo = rows[0].mo, again = M.sceneMotion(D.makeScene("R", 990950)), other = M.sceneMotion(D.makeScene("R", 990952));
    const rr = (await imp("physics/render/furnace.mjs")).rng((((990950 >>> 0) * 3266489917) + 77) >>> 0), a0 = 2 * Math.PI * rr(), sp0 = 0.01 + 0.07 * rr();
    ok("!! ...from its own stream, rng(seed x 3266489917 + MOTION_SALT): the first mover's direction and speed are that stream's first two draws",
        mo[0].v[0] === sp0 * Math.cos(a0) && mo[0].v[2] === sp0 * Math.sin(a0), `${sp0.toFixed(4)} a frame at ${(a0 * 180 / Math.PI).toFixed(1)} degrees`);
    ok("  ...deterministic by seed, and another seed draws another motion; the scene itself is not touched (makeScene draws the same spheres after)",
        JSON.stringify(again) === JSON.stringify(mo) && JSON.stringify(other) !== JSON.stringify(mo) && JSON.stringify(D.makeScene("R", 990950).scene) === JSON.stringify(S.scene));
    const f3 = M.sceneAt(S, mo, 3), k = 3 - (FRAMES - 1);
    ok("!! sceneAt: the LAST frame is S.scene itself; frame f puts each mover at centre + v (f - 7) and keeps every other sphere the scene's own object",
        M.sceneAt(S, mo, FRAMES - 1) === S.scene && M.sceneAt(S, null, 2) === S.scene && f3 !== S.scene && f3.length === S.scene.length &&
        mo.every((m) => f3[m.index].centre[0] === S.scene[m.index].centre[0] + m.v[0] * k && f3[m.index].centre[2] === S.scene[m.index].centre[2] + m.v[2] * k && f3[m.index].centre[1] === S.scene[m.index].centre[1] && f3[m.index].radius === S.scene[m.index].radius) &&
        S.scene.every((s, i) => mo.some((m) => m.index === i) || f3[i] === s));
    let bad = 0; for (const f of [-1, FRAMES, 2.5]) { try { M.sceneAt(S, mo, f); } catch (e) { if (/is not one of the 8/.test(e.message)) bad++; } }
    ok("  ...and a frame outside 0-7 is refused", bad === 3);
    const hits = firstHits(S, S.eye, 24, 24), mask = M.moverMask(mo, hits), movers = new Set(mo.map((m) => m.index));
    ok("  moverMask: 1 exactly where the measured frame's first hit is a moving sphere", mask.length === 576 && mask.some((v) => v) && mask.every((v, p) => v === (movers.has(hits.obj[p]) ? 1 : 0)));
}

console.log("\n2. THE MOVING EXAMPLE AGAINST ITS STILL TWIN");
const W = 32, opt = { W, sppIn: 2, sppRef: 4, ref2: true };
const pairs = FIX.map(([f, s]) => {
    const st = T.temporalExample(f, s, net, opt), mo = M.sceneMotion(D.makeScene(f, s));
    return { f, s, st, mo, mv: T.temporalExample(f, s, net, { ...opt, motion: mo, refs: { ref: st.ref, ref2: st.ref2 } }) };
});
{
    const chan = (ex, cs) => { const out = []; for (let p = 0; p < ex.W * ex.H; p++) for (const c of cs) out.push(ex.x[p * T.UT_CHANNELS + c]); return out; };
    ok("!! the measured frame is the still twin's: B1, the light sources, the guides (channels 10-16) and the current EASU (C, channels 6-8) bit for bit, and the references are the twin's own arrays",
        pairs.every(({ st, mv }) => same(mv.b1, st.b1) && same(mv.cov, st.cov) && same(mv.E, st.E) && same(mv.noisy, st.noisy) && same(chan(mv, [6, 7, 8, 10, 11, 12, 13, 14, 15, 16]), chan(st, [6, 7, 8, 10, 11, 12, 13, 14, 15, 16])) &&
            mv.ref === st.ref && mv.ref2 === st.ref2));
    ok("!! ...and the history is not: Bt, A (channels 0-2) and the history length differ, and Bt keeps a shorter history on both scenes",
        pairs.every(({ st, mv }) => !same(mv.bt, st.bt) && !same(chan(mv, [0, 1, 2]), chan(st, [0, 1, 2])) && LT.meanHistory(mv) < LT.meanHistory(st)),
        pairs.map(({ f, st, mv }) => `${f}: n ${LT.meanHistory(st).toFixed(2)} still, ${LT.meanHistory(mv).toFixed(2)} moving`).join("; "));
    const { f, s, mo, st } = pairs[0], hits = firstHits(D.makeScene(f, s), D.makeScene(f, s).eye, W, W);
    ok("  the moving example carries the measured frame's mover pixels (moverMask over its last frame's hits); the still one carries none",
        same(pairs[0].mv.mover, M.moverMask(mo, hits)) && !("mover" in st));
    const zero = T.temporalExample(f, s, net, { ...opt, motion: mo.map((m) => ({ ...m, v: [0, 0, 0] })), refs: { ref: st.ref, ref2: st.ref2 } });
    ok("!! a motion of zero speed is the still example bit for bit (Bt, the input, B1) -- so the difference above is the motion's and nothing else's",
        same(zero.bt, st.bt) && same(zero.x, st.x) && same(zero.b1, st.b1));
    // the history frames themselves, rebuilt by hand: frame 3 of the moving sequence renders, guides and masks sceneAt(S, mo, 3)
    const S = D.makeScene(f, s), fr = T.exampleFrames(S, net, { W, sppIn: 2, motion: mo }), still = T.exampleFrames(S, net, { W, sppIn: 2 });
    const { render } = await imp("physics/render/pathTracer.mjs"), TU = await imp("render/denoiseTemporalUpscale.mjs"), { denoise } = await imp("render/denoiseNet.mjs");
    const { emitterCoverage, withMask } = await imp("render/denoiseMask.mjs"), { fillEmitters, upscale } = await imp("render/denoiseUpscale.mjs");
    const k = 3, eye = cameraPath(S).eyes[k], S3 = { ...S, scene: M.sceneAt(S, mo, k), eye }, w = W / 2, rs = TU.temporalUpscaleSeeds(s);
    const inp = render(S3.scene, { w, h: w, spp: 2, seed: rs.half[k], rgb: true, eye, look: S.look, up: S.up, fovDeg: S.fovDeg, sky: S.sky, pixelOffset: TU.JITTER[k] });
    const g3 = D.guideBuffers(S3, w, w, TU.JITTER[k]), c3 = emitterCoverage(S3, w, w, TU.JITTER[k]);
    const y3 = upscale(fillEmitters(denoise(net, withMask(D.inputChannels(inp, g3.albedo, g3.normal, w, w), c3), w, w).y, c3, w, w), w, w, W, W, "easu");
    ok("!! exampleFrames: a moving history frame is rendered, guided and masked from the MOVED spheres (frame 3 rebuilt by hand from sceneAt, bit for bit), and the last frame is the still sequence's",
        same(fr[k].input, inp) && same(fr[k].cov, c3) && same(fr[k].y, y3) && !same(fr[k].input, still[k].input) &&
        same(fr[FRAMES - 1].input, still[FRAMES - 1].input) && same(fr[FRAMES - 1].y, still[FRAMES - 1].y));
    // ...and the light-source mask follows the movers too: on R 991030 a mover passes in front of a light in frame 0 (found by search;
    // on the two fixtures above no mover ever covers a light, so this row is the only one that can see the mask taken from the still scene)
    const Sx = D.makeScene("R", 991030), mx = M.sceneMotion(Sx), e0 = cameraPath(Sx).eyes[0], fx = T.exampleFrames(Sx, net, { W, sppIn: 1, motion: mx });
    const covMoved = emitterCoverage({ ...Sx, scene: M.sceneAt(Sx, mx, 0), eye: e0 }, w, w, TU.JITTER[0]), covStill = emitterCoverage({ ...Sx, eye: e0 }, w, w, TU.JITTER[0]);
    ok("  ...the light-source mask too: where a mover crosses a light (R 991030, frame 0) the frame's mask is the moved scene's, not the still one's",
        !D.isDatasetSeed(991030) && same(fx[0].cov, covMoved) && !same(covMoved, covStill));
    const own = T.temporalExample(f, s, net, { ...opt, motion: mo });
    ok("  without `refs` the moving example renders its references itself, and they are the twin's (the same measured frame and seeds)", same(own.ref, st.ref) && same(own.ref2, st.ref2) && same(own.bt, pairs[0].mv.bt));
}

console.log("\n3. ROUND 77's STUDY CODE");
{
    const R = LT.ROUND_UPSCALE_MOVING, R72 = LT.ROUND_UPSCALE_TEMPORAL_72;
    ok("!! ROUND_UPSCALE_MOVING: round 77, a test only, of round 72's U_TH (its net file), on SPLITS_UPSCALE_MOVING at round 72's settings, its own results file",
        R.round === 77 && R.moving === true && R.net === "render/upscale-net-r72.json" && R.net === R72.net && R.variant === "half" && R.splits === D.SPLITS_UPSCALE_MOVING &&
        R.image === 256 && R.sppIn === 4 && R.sppRefTest === 2048 && R.c1Min === 22 && R.minGain === 0.01 && R.test === "signflip" &&
        R.results === "render/denoise-results-upscale-moving-r77.json" && LT.temporalRound(77) === R && LT.temporalRound(72) === R72);
    let bad = null; try { LT.temporalRound(73); } catch (e) { bad = e.message; }
    ok("  ...and temporalRound refuses any other round, naming 77 (and, since sections 178 and 180, 78 and 79)", /70, 72, 77, 78, 79 or 80/.test(bad || ""));
    const o = { W: 256, sppIn: 4, sppRef: 2048, ref2: true, harvest: true };
    ok("  movingKey is the still sequence's key marked moving, so the two never share a cache entry", LT.movingKey("R", 77000, o) === LT.temporalKey("R", 77000, o) + "-moving");
    const y = Float64Array.from({ length: 12 }, (_, i) => 0.1 + i / 20), r = Float64Array.from({ length: 12 }, (_, i) => 0.12 + i / 21), m = Uint8Array.of(1, 0, 1, 0);
    const pick = (a) => Float64Array.from([0, 1, 2, 6, 7, 8].map((i) => toPerceptual(a[i])));
    ok("!! maskedDisplay is the display relMSE over the masked pixels only; all of them is gradeDisplay; none is null",
        LT.maskedDisplay(y, r, m) === relMSE(pick(y), pick(r)) && LT.maskedDisplay(y, r, Uint8Array.of(1, 1, 1, 1)) === gradeDisplay(y, { ref: r }) && LT.maskedDisplay(y, r, new Uint8Array(4)) === null);
    const ex = { W: 2, H: 2, x: new Float64Array(4 * T.UT_CHANNELS) }; [0.125, 0.5, 1, 0.25].forEach((v, p) => { ex.x[p * T.UT_CHANNELS + 9] = v; });
    ok("  meanHistory is Bt's mean history length, channel 9 times 8", LT.meanHistory(ex) === (1 + 4 + 8 + 2) / 4);

    const tr = JSON.parse(fs.readFileSync(path.join(ENG, R.net), "utf8")), U = decodeNet(tr.runs.find((x) => x.seed === tr.candidate).net), Uc2 = decodeNet(tr.c2.net);
    const split = { T1: { family: "R+C", families: ["R", "C"], seeds: FIX.map((x) => x[1]) } };
    const out = LT.runMovingTest({ splits: split, net, U, Uc2, W, sppIn: 2, sppRef: 4 });
    const gu = pairs.map(({ mv }) => gradeDisplay(T.temporalChain(U, mv), mv)), gb = pairs.map(({ mv }) => gradeDisplay(mv.bt, mv));
    const su = pairs.map(({ st }) => gradeDisplay(T.temporalChain(U, st), st)), sb = pairs.map(({ st }) => gradeDisplay(st.bt, st)), mean = (a) => a.reduce((q, v) => q + v, 0) / a.length;
    ok("!! runMovingTest grades U_TH and Bt on the MOVING examples, and the still twins beside them, each as gradeDisplay of that arm",
        same(out.tables.U, gu) && same(out.tables.bt, gb) && same(out.still.U, su) && same(out.still.bt, sb) &&
        same(out.tables.b1, pairs.map(({ st }) => gradeDisplay(st.b1, st))), `moving U ${gu.map((v) => v.toExponential(3)).join(", ")}; Bt ${gb.map((v) => v.toExponential(3)).join(", ")}`);
    ok("!! ...its verdict is H1 against Bt and H2 against B1 on the moving tables, and the gains, the drop and the history lengths are what they say",
        same(out.verdict.hypotheses.H1.d, effects(gb, gu)) && same(out.verdict.hypotheses.H2.d, effects(out.tables.b1, gu)) && out.determinism === true && out.secondary.gainOverBt === 1 - mean(gu) / mean(gb) && out.secondary.stillGainOverBt === 1 - mean(su) / mean(sb) &&
        out.secondary.drop === out.secondary.stillGainOverBt - out.secondary.gainOverBt && same(out.secondary.history.moving, pairs.map(({ mv }) => LT.meanHistory(mv))) &&
        same(out.secondary.history.still, pairs.map(({ st }) => LT.meanHistory(st))));
    ok("  ...the mover pixels' and the rest's grades are maskedDisplay over the moving example's mask and its complement; the speeds are each mover's",
        same(out.secondary.mover.U, pairs.map(({ mv }) => LT.maskedDisplay(T.temporalChain(U, mv), mv.ref, mv.mover))) &&
        same(out.secondary.rest.bt, pairs.map(({ mv }) => LT.maskedDisplay(mv.bt, mv.ref, Uint8Array.from(mv.mover, (v) => 1 - v)))) &&
        JSON.stringify(out.secondary.speeds) === JSON.stringify(pairs.map(({ mo }) => mo.map((m) => Math.hypot(m.v[0], m.v[2])))));
    let refused = null; try { LT.runMovingTest({ splits: split, net, U }); } catch (e) { refused = e.message; }
    ok("  ...and it refuses a call without C2's U_TH", /the candidate U_TH and C2's/.test(refused || ""));

    const cli = fs.readFileSync(path.join(ENG, "tools", "denoiseStudy.mjs"), "utf8");
    ok("  the test command runs runMovingTest for a moving round and runTemporalTest otherwise", /RD\.moving \? LT\.runMovingTest : LT\.runTemporalTest\)\(\{ U0, gamma: RD\.moverGamma, splits: RD\.splits,/.test(cli));
    const resFile = path.join(ENG, R.results), before = fs.existsSync(resFile) ? fs.readFileSync(resFile, "utf8") : null;   // since section 177 the results are committed
    let code = 0, said = ""; try { said = execFileSync(process.execPath, [path.join(ENG, "tools", "denoiseStudy.mjs"), "--harvest-upscale-temporal-train", "--round", "77"], { cwd: ENG, encoding: "utf8" }); } catch (e) { code = e.status; said = String(e.stdout); }
    ok("!! the training command refuses round 77 by name, exit 2, and writes nothing", code === 2 && /round 77 is a test only \(section 176\) -- it trains nothing/.test(said) && (fs.existsSync(resFile) ? fs.readFileSync(resFile, "utf8") : null) === before);
    const reg = fs.readFileSync(path.join(ENG, "render", "learned-denoiser-preregistration.md"), "utf8"), s176 = reg.slice(reg.indexOf("## 176."));
    ok("  the registration (section 176) states what the code does: 0.01-0.08 a frame, centre + v (f - 7), 77000-77011 and 78000-78011, round 72's net, the results file",
        reg.includes("## 176.") && /0\.01-0\.08 world units a frame/.test(s176) && /centre \+ v \(f - 7\)/.test(s176) && /77000-77011/.test(s176) && /78000-78011/.test(s176) &&
        s176.includes("render/upscale-net-r72.json") && s176.includes(R.results));
}

console.log("\n4. SECTION 177: ROUND 77's VERDICT, RE-DERIVED FROM ITS COMMITTED FILE");
{
    const R = LT.ROUND_UPSCALE_MOVING, r = JSON.parse(fs.readFileSync(path.join(ENG, R.results), "utf8")), H = r.verdict.hypotheses, T = r.tables, St = r.still, sec = r.secondary;
    const mean = (a) => a.reduce((q, v) => q + v, 0) / a.length, { effects } = await imp("render/denoiseStats.mjs");
    const sameD = (a, b) => a.length === b.length && a.every((v, i) => Math.abs(v - b[i]) < 1e-15);
    ok("!! the run is round 77's: its commit 4eb0c2e5 (round 77's setup), round 72's candidate (seed 1, trained at 670c28bd), the shipped denoiser, 24 scenes, 48 sequences rendered and none cached",
        r.round === 77 && r.commit === "4eb0c2e5" && r.trained.file === R.net && r.trained.candidate === 1 && r.trained.commit === "670c28bd" && r.shipped.file === "render/denoise-net-r11.json" &&
        T.U.length === 24 && St.U.length === 24 && r.cache.misses === 48 && r.cache.hits === 0 && r.determinism === true);
    ok("!! *** H77a SUPPORTED: on the moving scenes U_TH beats Bt -- 17 of 24, sign-flip p 0.00037 under Holm's 0.025, C1-C5 held -- its d re-derived from the file's own tables ***",
        H.H1.status === "supported" && H.H1.k === 17 && H.H1.n === 24 && H.H1.p < H.H1.threshold && H.H1.threshold === 0.025 && Math.abs(H.H1.p - 0.000371) < 1e-6 &&
        sameD(H.H1.d, effects(T.bt, T.U)) && r.verdict.run === "reported" && r.verdict.controls.C1 && r.verdict.controls.C4 && r.verdict.controls.C5 && r.verdict.controls.C2.ok && H.H1.c3.resolvable,
        `p ${H.H1.p.toFixed(5)}, ${H.H1.k} of ${H.H1.n}`);
    ok("  H77b SUPPORTED: against B1, 16 of 24, p 0.031 under 0.05", H.H2.status === "supported" && H.H2.k === 16 && Math.abs(H.H2.p - 0.0305) < 1e-4 && H.H2.p < H.H2.threshold && sameD(H.H2.d, effects(T.b1, T.U)));
    const gm = 1 - mean(T.U) / mean(T.bt), gs = 1 - mean(St.U) / mean(St.bt);
    ok("!! *** the gain: 4.49 % below Bt moving, 5.71 % still -- motion takes 1.2 points -- past the 1 % rule, and the file's own figures agree ***",
        Math.abs(gm - 0.04487) < 5e-5 && Math.abs(gs - 0.05712) < 5e-5 && gm >= R.minGain && Math.abs(sec.gainOverBt - gm) < 1e-15 && Math.abs(sec.stillGainOverBt - gs) < 1e-15 && Math.abs(sec.drop - (gs - gm)) < 1e-15,
        `${(100 * gm).toFixed(2)} % moving, ${(100 * gs).toFixed(2)} % still`);
    const fam = (a, k) => (k === "R" ? a.slice(0, 12) : a.slice(12)), g = (u, b) => 1 - mean(u) / mean(b);
    ok("  ...by family: R 5.51 % moving against 5.99 % still, C 4.28 % against 5.65 % -- C lost more; the drop is positive on 16 of 24 scenes",
        Math.abs(g(fam(T.U, "R"), fam(T.bt, "R")) - 0.0551) < 5e-5 && Math.abs(g(fam(St.U, "R"), fam(St.bt, "R")) - 0.0599) < 5e-5 && Math.abs(g(fam(T.U, "C"), fam(T.bt, "C")) - 0.0428) < 5e-5 &&
        Math.abs(g(fam(St.U, "C"), fam(St.bt, "C")) - 0.0565) < 5e-5 && sec.dropByScene.filter((v) => v > 0).length === 16);
    ok("!! P5 HELD: Bt's history is shorter moving than still on all 24 scenes, 5.04 still to 4.57 moving; 56 of the 113 movers under 0.04 a frame",
        sec.history.moving.every((v, i) => v < sec.history.still[i]) && Math.abs(mean(sec.history.still) - 5.037) < 1e-3 && Math.abs(mean(sec.history.moving) - 4.566) < 1e-3 &&
        sec.speeds.flat().length === 113 && sec.speeds.flat().filter((v) => v < 0.04).length === 56 && sec.speeds.flat().every((v) => v >= 0.01 && v <= 0.08));
    const mv = sec.mover, rs = sec.rest;
    ok("!! *** P6 MISSED: on the mover pixels U_TH is only 3.60 % below Bt (13 of 24 scenes), on the rest 9.39 % (22 of 24) -- the smaller gain is where Bt's error is 5.8 x larger ***",
        Math.abs(g(mv.U, mv.bt) - 0.0360) < 5e-5 && Math.abs(mv.gain - g(mv.U, mv.bt)) < 1e-15 && Math.abs(g(rs.U, rs.bt) - 0.0939) < 5e-5 && mv.U.filter((v, i) => v < mv.bt[i]).length === 13 &&
        rs.U.filter((v, i) => v < rs.bt[i]).length === 22 && g(mv.U, mv.bt) < g(rs.U, rs.bt) && Math.abs(mean(mv.bt) / mean(rs.bt) - 5.84) < 0.005 && Math.abs(mean(mv.share) - 0.2408) < 1e-4,
        `mover ${(100 * g(mv.U, mv.bt)).toFixed(2)} %, rest ${(100 * g(rs.U, rs.bt)).toFixed(2)} %`);
    const reg = fs.readFileSync(path.join(ENG, "render", "learned-denoiser-preregistration.md"), "utf8"), s177 = reg.slice(reg.indexOf("## 177."));
    ok("  section 177 says each of these, and says the file was seen before it was committed",
        reg.includes("## 177.") && /H77a SUPPORTED/.test(s177) && /4\.49 % below Bt/.test(s177) && /P6 MISSED/.test(s177) && /shown to me when it was uploaded, before it was committed/.test(s177));
}

console.log("\n5. ROUND 78 (section 178): U_THM, TRAINED STILL AND MOVING, AGAINST ROUND 72's U_TH");
{
    const R = LT.ROUND_UPSCALE_MOVING_78, R72 = LT.ROUND_UPSCALE_TEMPORAL_72, Sp = D.SPLITS_UPSCALE_MOVING_78;
    ok("!! ROUND_UPSCALE_MOVING_78: round 78, trained on moving sequences and tested on moving ones, its own net and results, round 72's U_TH the baseline, round 72's network shape and settings",
        R.round === 78 && R.moving === true && R.trainMoving === true && R.net === "render/upscale-net-r78.json" && R.baseline === R72.net && R.results === "render/denoise-results-upscale-moving-r78.json" &&
        R.variant === "half" && R.image === 256 && R.sppRef === 512 && R.sppRefTest === 2048 && R.train === R72.train && R.seeds === R72.seeds && R.minGain === 0.01 && R.splits === Sp && LT.temporalRound(78) === R);
    const seen = new Set([D.SPLITS_UPSCALE_LEARNED_67, D.SPLITS_UPSCALE_LEARNED_68, D.SPLITS_UPSCALE_LEARNED_69, D.SPLITS_UPSCALE_TEMPORAL, D.SPLITS_UPSCALE_TEMPORAL_72, D.SPLITS_UPSCALE_MOVING].flatMap((s) => s.T1.seeds));
    ok("  SPLITS_UPSCALE_MOVING_78: round 65's training and validation, a new test set of 12 R at 79000-79011 and 12 C at 80000-80011, reserved, no earlier test seed",
        Sp.train === D.SPLITS_UPSCALE_LEARNED.train && Sp.val === D.SPLITS_UPSCALE_LEARNED.val && Sp.T1.seeds.length === 24 && Sp.T1.seeds[0] === 79000 && Sp.T1.seeds[12] === 80000 &&
        Sp.T1.families.slice(0, 12).every((f) => f === "R") && Sp.T1.families.slice(12).every((f) => f === "C") && Sp.T1.seeds.every((x) => D.isDatasetSeed(x) && !seen.has(x)));

    const split = { family: "R", seeds: [990950, 990952] }, so = { W: 32, sppIn: 1, sppRef: 2 };
    const still = LT.sequenceSet(split, net, so), both = LT.sequenceSet(split, net, { ...so, moving: true });
    const mvx = split.seeds.map((sd) => T.temporalExample("R", sd, net, { ...so, motion: M.sceneMotion(D.makeScene("R", sd)) }));
    ok("!! sequenceSet with `moving`: each scene twice -- the still sequences first, exactly as without it, then each moving twin (sceneMotion's motion, sharing its twin's reference)",
        still.length === 2 && both.length === 4 && [0, 1].every((i) => same(both[i].x, still[i].x) && same(both[i].bt, still[i].bt)) &&
        [0, 1].every((i) => same(both[2 + i].x, mvx[i].x) && same(both[2 + i].bt, mvx[i].bt) && both[2 + i].ref === both[i].ref && !same(both[2 + i].bt, both[i].bt)));
    const tr = LT.runTemporalTraining({ splits: { train: split, val: { family: "R", seeds: [990954] } }, net, ...so, seeds: [1], train: { steps: 2, batch: 1, crop: 16 }, variant: "half", moving: true });
    const vset = LT.sequenceSet({ family: "R", seeds: [990954] }, net, { ...so, moving: true });
    ok("!! runTemporalTraining with `moving` trains and validates on the twins: 4 training and 2 validation sequences, its validation the candidate's grade of the still and the moving twin, and the config says so",
        tr.config.moving === true && tr.config.splits.train === 4 && tr.config.splits.val === 2 && tr.runs[0].val.length === 2 &&
        same(tr.runs[0].val, vset.map((e) => gradeDisplay(T.temporalChain(tr.runs[0].net, e), e))));

    const t72 = JSON.parse(fs.readFileSync(path.join(ENG, R72.net), "utf8")), U72 = decodeNet(t72.runs.find((x) => x.seed === t72.candidate).net), Uc = decodeNet(t72.c2.net);
    const Um = tr.runs[0].net, sp1 = { T1: { family: "R+C", families: ["R", "C"], seeds: FIX.map((x) => x[1]) } };
    const out = LT.runMovingTest({ splits: sp1, net, U: Um, Uc2: Uc, U0: U72, round: 78, W, sppIn: 2, sppRef: 4 }), mean = (a) => a.reduce((q, v) => q + v, 0) / a.length;
    const g0 = pairs.map(({ mv }) => gradeDisplay(T.temporalChain(U72, mv), mv)), gm = pairs.map(({ mv }) => gradeDisplay(T.temporalChain(Um, mv), mv));
    ok("!! *** with a baseline, H1 is U_THM AGAINST U_TH on the moving scenes and H2 against Bt; U_TH is graded on every arm beside it ***",
        same(out.tables.U0, g0) && same(out.tables.U, gm) && same(out.verdict.hypotheses.H1.d, effects(g0, gm)) && same(out.verdict.hypotheses.H2.d, effects(out.tables.bt, gm)) &&
        same(out.still.U0, pairs.map(({ st }) => gradeDisplay(T.temporalChain(U72, st), st))) &&
        same(out.secondary.mover.U0, pairs.map(({ mv }) => LT.maskedDisplay(T.temporalChain(U72, mv), mv.ref, mv.mover))));
    ok("  ...and its vsU0 figures are U_THM's gain over U_TH, moving and still, and U_TH's own over Bt",
        out.secondary.vsU0.moving === 1 - mean(gm) / mean(g0) && out.secondary.vsU0.still === 1 - mean(out.still.U) / mean(out.still.U0) && out.secondary.vsU0.u0OverBt.moving === 1 - mean(g0) / mean(out.tables.bt));
    const plain = LT.runMovingTest({ splits: sp1, net, U: U72, Uc2: Uc, W, sppIn: 2, sppRef: 4 });
    ok("  without a baseline the moving test is round 77's: no U_TH arm, H1 against Bt", !("U0" in plain.tables) && !("vsU0" in plain.secondary) && same(plain.verdict.hypotheses.H1.d, effects(plain.tables.bt, plain.tables.U)));

    const cli = fs.readFileSync(path.join(ENG, "tools", "denoiseStudy.mjs"), "utf8");
    ok("!! the commands: training refuses only a TEST-ONLY moving round and passes `moving` for round 78; the test reads round 72's candidate from RD.baseline as U0 and records it",
        /if \(RD\.moving && !RD\.trainMoving\) \{/.test(cli) && /variant: RD\.variant, moving: !!RD\.trainMoving,/.test(cli) &&
        /U0 = b0 \? decodeNet\(b0\.runs\.find\(\(x\) => x\.seed === b0\.candidate\)\.net\) : null;/.test(cli) && /if \(b0\) out\.baseline = \{ file: RD\.baseline, candidate: b0\.candidate, commit: b0\.commit \};/.test(cli));
    const reg = fs.readFileSync(path.join(ENG, "render", "learned-denoiser-preregistration.md"), "utf8"), s178 = reg.slice(reg.indexOf("## 178."), reg.indexOf("## 179.") > 0 ? reg.indexOf("## 179.") : undefined);
    ok("  section 178 states what the code does: each scene twice, still and moving; 79000-79011 and 80000-80011; U_THM against U_TH on the moving scenes; both files",
        /each TWICE, still and moving/.test(s178) && /79000-79011/.test(s178) && /80000-80011/.test(s178) && /\*\*H78a:\*\* on the MOVING scenes U_THM's chain beats U_TH's/.test(s178) && s178.includes(R.net) && s178.includes(R.results));
}

console.log("\n6. SECTION 179: ROUND 78's VERDICT, RE-DERIVED FROM ITS COMMITTED FILES");
{
    const R = LT.ROUND_UPSCALE_MOVING_78, r = JSON.parse(fs.readFileSync(path.join(ENG, R.results), "utf8")), tr = JSON.parse(fs.readFileSync(path.join(ENG, R.net), "utf8"));
    const t72 = JSON.parse(fs.readFileSync(path.join(ENG, R.baseline), "utf8")), H = r.verdict.hypotheses, T = r.tables, St = r.still, sec = r.secondary;
    const mean = (a) => a.reduce((q, v) => q + v, 0) / a.length, g = (u, b) => 1 - mean(u) / mean(b), near = (a, b, e = 5e-5) => Math.abs(a - b) < e;
    ok("!! the runs are round 78's: the training at 4da3371a (seed 3 the candidate, 400 + 40 sequences with motion), the test at a2cf6595 (the commit holding that file), round 72's candidate as the baseline, 48 sequences rendered",
        tr.round === 78 && tr.commit === "4da3371a" && tr.candidate === 3 && tr.config.moving === true && tr.config.splits.train === 400 && tr.config.splits.val === 40 &&
        r.round === 78 && r.commit === "a2cf6595" && r.trained.file === R.net && r.trained.candidate === 3 && r.trained.commit === "4da3371a" &&
        r.baseline.file === R.baseline && r.baseline.candidate === t72.candidate && r.baseline.commit === t72.commit && r.cache.misses === 48 && r.determinism === true && T.U.length === 24);
    ok("!! *** H78a NOT SUPPORTED: on the moving scenes U_THM is better than U_TH on only 8 of 24, p 0.93 -- its d re-derived from the file's own U_THM and U_TH tables ***",
        H.H1.status === "not supported" && H.H1.k === 8 && near(H.H1.p, 0.9288, 1e-4) && same(H.H1.d, effects(T.U0, T.U)) && r.verdict.run === "reported" &&
        r.verdict.controls.C1 && r.verdict.controls.C4 && r.verdict.controls.C5 && r.verdict.controls.C2.ok && near(r.verdict.controls.C2.meanD, -3.2804, 1e-4), `p ${H.H1.p.toFixed(3)}, ${H.H1.k} of 24`);
    ok("  H78b SUPPORTED: against Bt, 17 of 24, p 0.0015 under Holm's 0.025", H.H2.status === "supported" && H.H2.k === 17 && near(H.H2.p, 0.00147, 1e-5) && H.H2.p < H.H2.threshold && same(H.H2.d, effects(T.bt, T.U)));
    ok("!! *** the means: U_THM 2.1012e-3, U_TH 2.0751e-3, Bt 2.2076e-3 -- U_THM 1.26 % ABOVE U_TH moving, 4.82 % below Bt, U_TH 6.00 % below Bt ***",
        near(mean(T.U), 2.1012e-3, 5e-8) && near(mean(T.U0), 2.0751e-3, 5e-8) && near(mean(T.bt), 2.2076e-3, 5e-8) && near(g(T.U, T.U0), -0.0126) && near(g(T.U, T.bt), 0.0482) && near(g(T.U0, T.bt), 0.0600) &&
        sec.vsU0.moving === g(T.U, T.U0) && sec.gainOverBt === g(T.U, T.bt));
    ok("!! P5 MISSED: still, U_THM is 3.66 % WORSE than U_TH (better on 4 of 24) -- 4.52 % below Bt against U_TH's 7.89 %",
        near(g(St.U, St.U0), -0.0366) && St.U.filter((v, i) => v < St.U0[i]).length === 4 && near(g(St.U, St.bt), 0.0452) && near(g(St.U0, St.bt), 0.0789) && sec.vsU0.still === g(St.U, St.U0));
    const mv = sec.mover, rs = sec.rest;
    ok("!! *** P4 MISSED: on the mover pixels U_THM is only 0.90 % below Bt (11 of 24), against a predicted 5-12 % -- and U_TH 1.58 % (13 of 24) ***",
        near(g(mv.U, mv.bt), 0.0090) && near(g(mv.U0, mv.bt), 0.0158) && mv.U.filter((v, i) => v < mv.bt[i]).length === 11 && mv.U0.filter((v, i) => v < mv.bt[i]).length === 13 &&
        near(g(mv.U, mv.U0), -0.0069) && near(g(rs.U, rs.bt), 0.1384) && near(g(rs.U0, rs.bt), 0.1611) && near(mean(mv.bt) / mean(rs.bt), 6.32, 0.005));
    ok("  ...by family U_THM is 5.07 % worse than U_TH on R moving and 0.17 % on C; Bt's history is shorter moving on all 24",
        near(g(T.U.slice(0, 12), T.U0.slice(0, 12)), -0.0507) && near(g(T.U.slice(12), T.U0.slice(12)), -0.0017) && sec.history.moving.every((v, i) => v < sec.history.still[i]));
    const c = tr.runs.find((x) => x.seed === tr.candidate), c72 = t72.runs.find((x) => x.seed === t72.candidate);
    ok("  validation said so first: on the 20 still validation scenes round 78's candidate is 2.0 % worse than round 72's on the same scenes",
        c.val.length === 40 && c72.val.length === 20 && near(mean(c.val.slice(0, 20)), 1.6944e-3, 5e-8) && near(mean(c72.val), 1.6612e-3, 5e-8) && near(g(c.val.slice(0, 20), c72.val), -0.0200, 5e-4));
    const reg = fs.readFileSync(path.join(ENG, "render", "learned-denoiser-preregistration.md"), "utf8"), s179 = reg.slice(reg.indexOf("## 179."));
    ok("  section 179 says each of these, that U_TH stays, and that the test file was seen before it was committed",
        reg.includes("## 179.") && /H78a NOT SUPPORTED/.test(s179) && /\*\*P4 MISSED, and badly:\*\*/.test(s179) && /\*\*P5 MISSED:\*\*/.test(s179) && /So U_TH \(round 72\) stays\*\*/.test(s179) &&
        /the test file was shown to me when it was uploaded, before it was committed/.test(s179) && s179.includes("| U_THM (round 78) | 2.1012e-3 |"));
}

console.log("\n7. ROUND 79 (section 180): OBJECT MOTION VECTORS FOR Bt's HISTORY");
{
    const Tm = await imp("render/denoiseTemporal.mjs"), TU = await imp("render/denoiseTemporalUpscale.mjs");
    const S = D.makeScene("R", 990950), mo = M.sceneMotion(S), vel = M.velocities(S, mo);
    ok("  velocities: one entry per scene object, each mover's own v, every other entry empty, frozen",
        vel.length === S.scene.length && Object.isFrozen(vel) && mo.every((m) => vel[m.index] === m.v) && vel.every((v, i) => v === null || mo.some((m) => m.index === i)));
    const eyes = cameraPath(S).eyes, W1 = 128, g6 = firstHits({ ...S, scene: M.sceneAt(S, mo, 6) }, eyes[6], W1, W1), g7 = firstHits(S, eyes[7], W1, W1), mm = M.moverMask(mo, g7);
    const r0 = Tm.reproject(g6, g7, W1, W1), rN = Tm.reproject(g6, g7, W1, W1, null), rE = Tm.reproject(g6, g7, W1, W1, new Array(S.scene.length).fill(null)), rV = Tm.reproject(g6, g7, W1, W1, vel);
    const rW = Tm.reproject(g6, g7, W1, W1, vel.map((v) => v && v.map((x) => -x)));
    ok("!! reproject: no vectors, or an empty table, is the old reprojection bit for bit; with the vectors only the mover pixels can change",
        same(rN.taps, r0.taps) && same(rN.wts, r0.wts) && same(rE.wts, r0.wts) && same(rE.valid, r0.valid) &&
        Array.from(mm).every((m, p) => m || ([0, 1, 2, 3].every((k) => rV.taps[4 * p + k] === r0.taps[4 * p + k] && Object.is(rV.wts[4 * p + k], r0.wts[4 * p + k])) && rV.valid[p] === r0.valid[p])));
    const off = (r) => { let s0 = 0, n = 0, kept = 0, m = 0; for (let p = 0; p < W1 * W1; p++) { if (!mm[p]) continue; m++; if (!r.valid[p]) continue; kept++; const v = vel[g7.obj[p]];
        for (let k = 0; k < 4; k++) { const q = r.taps[4 * p + k]; if (q >= 0) s0 += r.wts[4 * p + k] * Math.hypot(g6.pos[q * 3] - g7.pos[p * 3] + v[0], g6.pos[q * 3 + 1] - g7.pos[p * 3 + 1] + v[1], g6.pos[q * 3 + 2] - g7.pos[p * 3 + 2] + v[2]); } n++; }
        return { d: s0 / n, kept: kept / m }; };
    const o0 = off(r0), oV = off(rV), oW = off(rW);
    ok("!! *** the vectors point the right way: with P - v the movers keep more history, and what they keep is where the surface point really was -- under half the distance without vectors, and with the sign flipped they keep less ***",
        oV.kept > o0.kept && oV.kept > oW.kept && oV.d < 0.5 * o0.d && oV.d < oW.d, `kept ${(100 * o0.kept).toFixed(1)} / ${(100 * oV.kept).toFixed(1)} / ${(100 * oW.kept).toFixed(1)} %, off by ${o0.d.toFixed(4)} / ${oV.d.toFixed(4)} / ${oW.d.toFixed(4)} units (none / P - v / P + v)`);

    const W = 32, so = { W, sppIn: 2, sppRef: 4 }, e = T.temporalExample("R", 990950, net, { ...so, motion: mo, vectors: true });
    const fr = T.exampleFrames(S, net, { W, sppIn: 2, motion: mo }), geo = eyes.map((eye, f) => firstHits({ ...S, scene: M.sceneAt(S, mo, f) }, eye, W, W));
    const am = TU.accumulateUpscaled(fr, geo, W, W, { vel }), aum = TU.accumulateUpscaled(fr, geo, W, W, { clamp: false, vel }).A, plain = TU.accumulateUpscaled(fr, geo, W, W);
    const ch = (x, c) => Array.from({ length: W * W }, (_, p) => x[p * T.UT_CHANNELS + c]);
    ok("!! temporalExample `vectors`: mv's input is the same frames and hits accumulated with the velocities -- A, the unclamped history and n rebuilt by hand -- and every other channel is the example's own",
        [0, 1, 2].every((c) => same(ch(e.mv.x, c), Array.from({ length: W * W }, (_, p) => am.A[p * 3 + c])) && same(ch(e.mv.x, 3 + c), Array.from({ length: W * W }, (_, p) => aum[p * 3 + c]))) &&
        same(ch(e.mv.x, 9), Array.from(am.n, (v) => v / FRAMES)) && [6, 7, 8, 10, 11, 12, 13, 14, 15, 16].every((c) => same(ch(e.mv.x, c), ch(e.x, c))) && !same(Array.from(am.A), Array.from(plain.A)));
    ok("!! *** Bt_MV is Bt bit for bit off the mover pixels, and differs on them -- section 180's 'any difference is on the movers' ***",
        Array.from(e.mover).every((m, p) => m || [0, 1, 2].every((c) => Object.is(e.mv.bt[p * 3 + c], e.bt[p * 3 + c]))) && Array.from(e.mover).some((m, p) => m && !Object.is(e.mv.bt[p * 3], e.bt[p * 3])));
    const zero = mo.map((m) => ({ ...m, v: [0, 0, 0] })), ez = T.temporalExample("R", 990950, net, { ...so, motion: zero, vectors: true });
    ok("  ...and on a still scene (every mover at zero speed) Bt_MV is Bt exactly", same(ez.mv.bt, ez.bt) && same(ez.mv.x, ez.x));
    let bad = null; try { T.temporalExample("R", 990950, net, { ...so, vectors: true }); } catch (err) { bad = err.message; }
    ok("  vectors without a motion are refused", /object motion vectors need a motion/.test(bad || ""));

    const R = LT.ROUND_UPSCALE_VECTORS, R72 = LT.ROUND_UPSCALE_TEMPORAL_72, Sp = D.SPLITS_UPSCALE_VECTORS;
    ok("!! ROUND_UPSCALE_VECTORS: round 79, a test only, of round 72's U_TH on Bt and Bt_MV, on SPLITS_UPSCALE_VECTORS (12 R at 81000, 12 C at 82000, reserved) at round 72's settings",
        R.round === 79 && R.vectors === true && R.moving === true && !R.trainMoving && R.net === R72.net && R.results === "render/denoise-results-upscale-vectors-r79.json" && R.splits === Sp &&
        R.sppRefTest === 2048 && R.image === 256 && R.minGain === 0.01 && LT.temporalRound(79) === R && Sp.T1.seeds.length === 24 && Sp.T1.seeds[0] === 81000 && Sp.T1.seeds[12] === 82000 &&
        Sp.T1.seeds.every((x) => D.isDatasetSeed(x)) && LT.vectorsKey("R", 81000, { W: 256 }) === LT.temporalKey("R", 81000, { W: 256 }) + "-moving-vectors");
    const t72 = JSON.parse(fs.readFileSync(path.join(ENG, R72.net), "utf8")), U = decodeNet(t72.runs.find((x) => x.seed === t72.candidate).net), Uc = decodeNet(t72.c2.net);
    const sp1 = { T1: { family: "R+C", families: ["R", "C"], seeds: FIX.map((x) => x[1]) } }, out = LT.runVectorTest({ splits: sp1, net, U, Uc2: Uc, W, sppIn: 2, sppRef: 4 });
    const ex = FIX.map(([f, sd]) => T.temporalExample(f, sd, net, { W, sppIn: 2, sppRef: 4, ref2: true, motion: M.sceneMotion(D.makeScene(f, sd)), vectors: true }));
    const gB = ex.map((x) => gradeDisplay(x.bt, x)), gM = ex.map((x) => gradeDisplay(x.mv.bt, x)), gUM = ex.map((x) => gradeDisplay(T.temporalChain(U, { ...x, x: x.mv.x }), x)), gU = ex.map((x) => gradeDisplay(T.temporalChain(U, x), x));
    ok("!! *** runVectorTest: H1 is Bt_MV against Bt, H2 U_TH-on-Bt_MV against Bt_MV, each arm gradeDisplay of that image against the example's own reference ***",
        same(out.tables.bt, gB) && same(out.tables.btMV, gM) && same(out.tables.uMV, gUM) && same(out.tables.u, gU) && same(out.verdict.hypotheses.H1.d, effects(gB, gM)) &&
        same(out.verdict.hypotheses.H2.d, effects(gM, gUM)) && out.determinism === true, `Bt ${gB.map((v) => v.toExponential(3)).join(", ")}; Bt_MV ${gM.map((v) => v.toExponential(3)).join(", ")}`);
    const mean = (a) => a.reduce((q, v) => q + v, 0) / a.length;
    ok("  ...its gains, history lengths and mover grades are what they say",
        out.secondary.gains.btMVoverBt === 1 - mean(gM) / mean(gB) && out.secondary.gains.uMVoverBtMV === 1 - mean(gUM) / mean(gM) && out.secondary.gains.uMVoverU === 1 - mean(gUM) / mean(gU) &&
        same(out.secondary.history.mv, ex.map((x) => LT.meanHistory({ ...x, x: x.mv.x }))) && same(out.secondary.history.bt, ex.map((x) => LT.meanHistory(x))) &&
        same(out.secondary.mover.btMV, ex.map((x) => LT.maskedDisplay(x.mv.bt, x.ref, x.mover))));
    const gC = ex.map((x) => gradeDisplay(T.temporalChain(Uc, { ...x, x: x.mv.x }), x));
    ok("  ...and its control C2 is round 72's shuffled-target U_TH on Bt_MV's input, its effects against Bt_MV", same(out.tables.c2, gC) && same(out.secondary.c2, effects(gM, gC)));
    let refused = null; try { LT.runVectorTest({ splits: sp1, net, U }); } catch (err) { refused = err.message; }
    const cli = fs.readFileSync(path.join(ENG, "tools", "denoiseStudy.mjs"), "utf8");
    ok("  ...it refuses a call without C2; the test command dispatches it for a vectors round", /round 72's U_TH and its C2/.test(refused || "") &&
        /RD\.vectors \? LT\.runVectorTest : RD\.moving \? LT\.runMovingTest : LT\.runTemporalTest\)\(\{ U0, gamma: RD\.moverGamma, splits: RD\.splits,/.test(cli));
    let code = 0, said = ""; try { said = execFileSync(process.execPath, [path.join(ENG, "tools", "denoiseStudy.mjs"), "--harvest-upscale-temporal-train", "--round", "79"], { cwd: ENG, encoding: "utf8" }); } catch (err) { code = err.status; said = String(err.stdout); }
    const reg = fs.readFileSync(path.join(ENG, "render", "learned-denoiser-preregistration.md"), "utf8"), s180 = reg.slice(reg.indexOf("## 180."), reg.indexOf("## 181.") > 0 ? reg.indexOf("## 181.") : undefined);
    ok("  the training command refuses round 79; section 180 states P - v, the bit-for-bit claim, 81000-81011 and 82000-82011, and the results file",
        code === 2 && /round 79 is a test only/.test(said) && /\*\*P - v\*\*/.test(s180) && /Bt_MV is Bt exactly off the mover pixels, and on every still scene/.test(s180) && /81000-81011/.test(s180) && /82000-82011/.test(s180) && s180.includes(R.results));
}

console.log("\n8. SECTION 181: ROUND 79's VERDICT, RE-DERIVED FROM ITS COMMITTED FILE");
{
    const R = LT.ROUND_UPSCALE_VECTORS, r = JSON.parse(fs.readFileSync(path.join(ENG, R.results), "utf8")), H = r.verdict.hypotheses, T = r.tables, sec = r.secondary;
    const mean = (a) => a.reduce((q, v) => q + v, 0) / a.length, g = (u, b) => 1 - mean(u) / mean(b), near = (a, b, e = 5e-5) => Math.abs(a - b) < e;
    ok("!! the run is round 79's: its commit 2f0c10c5, round 72's candidate (seed 1, trained at 670c28bd), the shipped denoiser, 24 moving sequences rendered and none cached",
        r.round === 79 && r.commit === "2f0c10c5" && r.trained.file === R.net && r.trained.candidate === 1 && r.trained.commit === "670c28bd" && r.shipped.file === "render/denoise-net-r11.json" &&
        T.bt.length === 24 && r.cache.misses === 24 && r.cache.hits === 0 && r.determinism === true);
    ok("!! *** H79a NOT SUPPORTED: Bt_MV is 4.12 % below Bt on the mean -- past the 1 % rule -- but better on only 13 of 24 scenes, sign-flip p 0.145; its d re-derived from the file's own tables ***",
        H.H1.status === "not supported" && H.H1.k === 13 && near(H.H1.p, 0.1453, 1e-4) && !(H.H1.p < H.H1.threshold) && same(H.H1.d, effects(T.bt, T.btMV)) && near(g(T.btMV, T.bt), 0.0412) && g(T.btMV, T.bt) >= R.minGain &&
        near(Math.max(...H.H1.d), 0.1687, 1e-4) && near(Math.min(...H.H1.d), -0.1279, 1e-4) && r.verdict.run === "reported" && r.verdict.controls.C1 && r.verdict.controls.C4 && r.verdict.controls.C5 && r.verdict.controls.C2.ok,
        `p ${H.H1.p.toFixed(3)}, ${H.H1.k} of 24, mean ${(100 * g(T.btMV, T.bt)).toFixed(2)} %`);
    ok("!! H79b SUPPORTED: U_TH on Bt_MV is 5.50 % below Bt_MV, 18 of 24, p 0.00018 under Holm's 0.025",
        H.H2.status === "supported" && H.H2.k === 18 && near(H.H2.p, 0.000177, 1e-6) && H.H2.p < H.H2.threshold && same(H.H2.d, effects(T.btMV, T.uMV)) && near(g(T.uMV, T.btMV), 0.0550));
    ok("!! *** the chain, descriptively: means Bt 2.0573e-3, Bt_MV 1.9726e-3, U_TH on Bt_MV 1.8641e-3, U_TH on Bt 1.9529e-3, B1 1.8652e-3 -- U_TH on Bt_MV 4.55 % below U_TH on Bt (15 of 24), 9.39 % below Bt ***",
        near(mean(T.bt), 2.0573e-3, 5e-8) && near(mean(T.btMV), 1.9726e-3, 5e-8) && near(mean(T.uMV), 1.8641e-3, 5e-8) && near(mean(T.u), 1.9529e-3, 5e-8) && near(mean(T.b1), 1.8652e-3, 5e-8) &&
        near(g(T.uMV, T.u), 0.0455) && T.uMV.filter((v, i) => v < T.u[i]).length === 15 && near(g(T.uMV, T.bt), 0.0939) && near(g(T.u, T.bt), 0.0507) && sec.gains.uMVoverU === g(T.uMV, T.u));
    const M = sec.mover;
    ok("!! P3 MISSED: on the mover pixels (28 % of the frame) Bt_MV is only 5.38 % below Bt, better on 13 of 24, against a predicted 8-25 %; U_TH on Bt_MV is 6.37 % below U_TH on Bt there",
        near(g(M.btMV, M.bt), 0.0538) && M.btMV.filter((v, i) => v < M.bt[i]).length === 13 && near(mean(M.share), 0.2780, 1e-4) && near(g(M.uMV, M.u), 0.0637) && M.gains.btMVoverBt === g(M.btMV, M.bt));
    ok("  P5's first half HELD: Bt_MV's history is longer than Bt's on all 24 scenes, 5.11 against 4.37; by family the vectors took 0.98 % off on R and 4.76 % on C",
        sec.history.mv.every((v, i) => v > sec.history.bt[i]) && near(mean(sec.history.mv), 5.105, 1e-3) && near(mean(sec.history.bt), 4.370, 1e-3) &&
        near(g(T.btMV.slice(0, 12), T.bt.slice(0, 12)), 0.0098) && near(g(T.btMV.slice(12), T.bt.slice(12)), 0.0476));
    const reg = fs.readFileSync(path.join(ENG, "render", "learned-denoiser-preregistration.md"), "utf8"), s181 = reg.slice(reg.indexOf("## 181."));
    ok("  section 181 says each of these, that round 80 is not opened, and that the file was seen before it was committed",
        reg.includes("## 181.") && /H79a NOT SUPPORTED/.test(s181) && /Round 80 \(the\s+device chain's vectors\) is not opened on this result/.test(s181) && /\*\*P3 MISSED:\*\*/.test(s181) &&
        /shown to me when it was uploaded, before it was committed/.test(s181) && s181.includes("| Bt_MV | 1.9726e-3 |"));
}

console.log("\n9. ROUND 80 (section 182): THE MOVER HISTORY CLIPPED TO MEAN +- GAMMA SIGMA");
{
    const TU = await imp("render/denoiseTemporalUpscale.mjs"), W = 32, S = D.makeScene("C", 990951), mo = M.sceneMotion(S), vel = M.velocities(S, mo), eyes = cameraPath(S).eyes;
    const fr = T.exampleFrames(S, net, { W, sppIn: 2, motion: mo }), geo = eyes.map((eye, f) => firstHits({ ...S, scene: M.sceneAt(S, mo, f) }, eye, W, W)), mm = M.moverMask(mo, geo[FRAMES - 1]);
    const mv = TU.accumulateUpscaled(fr, geo, W, W, { vel }), c1 = TU.accumulateUpscaled(fr, geo, W, W, { vel, moverGamma: 1 }), big = TU.accumulateUpscaled(fr, geo, W, W, { vel, moverGamma: 1e9 });
    const c0 = TU.accumulateUpscaled(fr, geo, W, W, { vel, moverGamma: 0 }), off = TU.accumulateUpscaled(fr, geo, W, W, { vel, moverGamma: 1, clamp: false }), unc = TU.accumulateUpscaled(fr, geo, W, W, { vel, clamp: false });
    const last = fr[FRAMES - 1], cur = TU.shiftResample(last.y, W, W, ...last.shift);
    const nb = (p, c) => { const px = p % W, py = (p / W) | 0, v = []; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const qx = px + dx, qy = py + dy; if (qx >= 0 && qy >= 0 && qx < W && qy < W) v.push(cur[(qy * W + qx) * 3 + c]); }
        const mu = v.reduce((q, x) => q + x, 0) / v.length; return { mu, sd: Math.sqrt(Math.max(0, v.reduce((q, x) => q + x * x, 0) / v.length - mu * mu)) }; };
    ok("!! moverGamma: absent, or so wide it never binds, is Bt_MV bit for bit; it touches only the mover pixels; and it does nothing without the clamp",
        same(big.A, mv.A) && same(big.n, mv.n) && Array.from(mm).every((m, p) => m || [0, 1, 2].every((c) => Object.is(c1.A[p * 3 + c], mv.A[p * 3 + c]))) && same(off.A, unc.A) && !same(c1.A, mv.A));
    const valid = Array.from(mm).map((m, p) => (m && c1.n[p] > 1 ? p : -1)).filter((p) => p >= 0);
    ok("!! *** gamma 0 puts a mover's history at its 3 x 3 mean -- the last frame's A is mu + (cur - mu) / n there, rebuilt by hand ***",
        valid.length > 20 && valid.every((p) => [0, 1, 2].every((c) => { const { mu } = nb(p, c); return Math.abs(c0.A[p * 3 + c] - (mu + (cur[p * 3 + c] - mu) / c0.n[p])) < 1e-12; })), `${valid.length} mover pixels with a history`);
    let inside = 0, onEdge = 0, total = 0;
    for (const p of valid) for (let c = 0; c < 3; c++) { const { mu, sd } = nb(p, c), h = (c1.A[p * 3 + c] * c1.n[p] - cur[p * 3 + c]) / (c1.n[p] - 1); total++; if (h >= mu - sd - 1e-9 && h <= mu + sd + 1e-9) inside++; if (Math.abs(Math.abs(h - mu) - sd) < 1e-9) onEdge++; }
    ok("!! *** gamma 1: every mover history the last frame kept, unpicked from A = h + (cur - h) / n, lies inside its neighbourhood's mean +- sigma -- and some sit on the edge, so the clip bound ***",
        inside === total && onEdge > 0, `${total} channel histories, ${onEdge} on the edge`);

    const so = { W, sppIn: 2, sppRef: 4 }, e = T.temporalExample("C", 990951, net, { ...so, motion: mo, vectors: true, moverGamma: 1 }), ch = (x, c) => Array.from({ length: W * W }, (_, p) => x[p * T.UT_CHANNELS + c]);
    ok("!! temporalExample `moverGamma`: mvc's A and n are the clipped accumulation, its unclamped twin is Bt_MV's, every other channel the example's own; Bt_MVC is Bt bit for bit off the movers",
        [0, 1, 2].every((c) => same(ch(e.mvc.x, c), Array.from({ length: W * W }, (_, p) => c1.A[p * 3 + c])) && same(ch(e.mvc.x, 3 + c), ch(e.mv.x, 3 + c))) && same(ch(e.mvc.x, 9), Array.from(c1.n, (v) => v / FRAMES)) &&
        [6, 7, 8, 10, 11, 12, 13, 14, 15, 16].every((c) => same(ch(e.mvc.x, c), ch(e.x, c))) && Array.from(e.mover).every((m, p) => m || [0, 1, 2].every((c) => Object.is(e.mvc.bt[p * 3 + c], e.bt[p * 3 + c]))));
    const { compositeEmitters } = await imp("render/denoiseUpscale.mjs");
    ok("  ...and Bt_MVC's image is the clipped accumulation composited with the light sources, rebuilt from it by hand, not the vectors' own",
        same(e.mvc.bt, compositeEmitters(c1.A, { cov: e.cov, E: e.E })) && !same(e.mvc.bt, e.mv.bt));
    let bad = null; try { T.temporalExample("C", 990951, net, { ...so, motion: mo, moverGamma: 1 }); } catch (err) { bad = err.message; }
    ok("  the mover clip without the vectors is refused; with no gamma there is no mvc", /the mover clip runs on the vectors' history/.test(bad || "") && !("mvc" in T.temporalExample("C", 990951, net, { ...so, motion: mo, vectors: true })));

    const R = LT.ROUND_UPSCALE_CHECK, R72 = LT.ROUND_UPSCALE_TEMPORAL_72, Sp = D.SPLITS_UPSCALE_CHECK;
    ok("!! ROUND_UPSCALE_CHECK: round 80, a test only, gamma 1.0 fixed (MOVER_GAMMA), round 72's U_TH, SPLITS_UPSCALE_CHECK (12 R at 83000, 12 C at 84000, reserved), its own results file",
        R.round === 80 && R.check === true && R.vectors === true && R.moving === true && !R.trainMoving && LT.MOVER_GAMMA === 1 && R.moverGamma === LT.MOVER_GAMMA && R.net === R72.net &&
        R.results === "render/denoise-results-upscale-check-r80.json" && R.splits === Sp && LT.temporalRound(80) === R && Sp.T1.seeds[0] === 83000 && Sp.T1.seeds[12] === 84000 && Sp.T1.seeds.length === 24 &&
        Sp.T1.seeds.every((x) => D.isDatasetSeed(x)) && LT.checkKey("R", 83000, { W: 256 }, 1) === LT.temporalKey("R", 83000, { W: 256 }) + "-moving-vectors-clip1");
    const t72 = JSON.parse(fs.readFileSync(path.join(ENG, R72.net), "utf8")), U = decodeNet(t72.runs.find((x) => x.seed === t72.candidate).net), Uc = decodeNet(t72.c2.net);
    const sp1 = { T1: { family: "R+C", families: ["R", "C"], seeds: FIX.map((x) => x[1]) } }, out = LT.runCheckTest({ splits: sp1, net, U, Uc2: Uc, W, sppIn: 2, sppRef: 4 });
    const ex = FIX.map(([f, sd]) => T.temporalExample(f, sd, net, { W, sppIn: 2, sppRef: 4, ref2: true, motion: M.sceneMotion(D.makeScene(f, sd)), vectors: true, moverGamma: 1 }));
    const gB = ex.map((x) => gradeDisplay(x.bt, x)), gM = ex.map((x) => gradeDisplay(x.mv.bt, x)), gC = ex.map((x) => gradeDisplay(x.mvc.bt, x)), gUC = ex.map((x) => gradeDisplay(T.temporalChain(U, { ...x, x: x.mvc.x }), x));
    const gC2 = ex.map((x) => gradeDisplay(T.temporalChain(Uc, { ...x, x: x.mvc.x }), x)), mean = (a) => a.reduce((q, v) => q + v, 0) / a.length;
    ok("!! *** runCheckTest: H1 is Bt_MVC against Bt, H2 Bt_MVC against Bt_MV, each arm gradeDisplay of its own image; C2 is round 72's on Bt_MVC ***",
        same(out.tables.bt, gB) && same(out.tables.btMV, gM) && same(out.tables.btMVC, gC) && same(out.tables.uMVC, gUC) && same(out.tables.c2, gC2) && same(out.secondary.c2, effects(gC, gC2)) &&
        same(out.verdict.hypotheses.H1.d, effects(gB, gC)) && same(out.verdict.hypotheses.H2.d, effects(gM, gC)) && out.determinism === true && out.gamma === 1,
        `Bt ${gB.map((v) => v.toExponential(3)).join(", ")}; Bt_MV ${gM.map((v) => v.toExponential(3)).join(", ")}; Bt_MVC ${gC.map((v) => v.toExponential(3)).join(", ")}`);
    ok("  ...its gains, history lengths and mover grades are what they say",
        out.secondary.gains.btMVCoverBt === 1 - mean(gC) / mean(gB) && out.secondary.gains.btMVCoverBtMV === 1 - mean(gC) / mean(gM) && out.secondary.gains.uMVCoverBtMVC === 1 - mean(gUC) / mean(gC) &&
        same(out.secondary.history.mvc, ex.map((x) => LT.meanHistory({ ...x, x: x.mvc.x }))) && same(out.secondary.mover.btMVC, ex.map((x) => LT.maskedDisplay(x.mvc.bt, x.ref, x.mover))));
    let refused = null; try { LT.runCheckTest({ splits: sp1, net, U }); } catch (err) { refused = err.message; }
    const cli = fs.readFileSync(path.join(ENG, "tools", "denoiseStudy.mjs"), "utf8");
    let code = 0, said = ""; try { said = execFileSync(process.execPath, [path.join(ENG, "tools", "denoiseStudy.mjs"), "--harvest-upscale-temporal-train", "--round", "80"], { cwd: ENG, encoding: "utf8" }); } catch (err) { code = err.status; said = String(err.stdout); }
    const reg = fs.readFileSync(path.join(ENG, "render", "learned-denoiser-preregistration.md"), "utf8"), s182 = reg.slice(reg.indexOf("## 182."), reg.indexOf("## 183.") > 0 ? reg.indexOf("## 183.") : undefined);
    ok("  the commands and the registration: it refuses a call without C2; the test dispatches it with the round's gamma; training refuses round 80; section 182 states mean +- gamma sigma, gamma 1.0, the bit-for-bit claim and the seeds",
        /round 72's U_TH and its C2/.test(refused || "") && /\(RD\.check \? LT\.runCheckTest : RD\.vectors \? LT\.runVectorTest :/.test(cli) && /\(\{ U0, gamma: RD\.moverGamma, splits: RD\.splits,/.test(cli) &&
        code === 2 && /round 80 is a test only/.test(said) && /\*\*mean ± γσ\*\*/.test(s182) && /\*\*γ = 1\.0, fixed now and not tuned:\*\*/.test(s182) && /Off the movers Bt_MVC is Bt \(and Bt_MV\) bit for bit/.test(s182) &&
        /83000-83011/.test(s182) && /84000-84011/.test(s182) && s182.includes(R.results));
}

console.log(`\n${fails ? "FAIL -- " + fails + " check(s)" : "ALL GREEN"} (${Date.now() - t0} ms)` +
    "\nnot closed here: whether Bt_MVC beats Bt and Bt_MV on moving scenes. That is round 80's harvest, section 183's.");
process.exit(fails ? 1 : 0);
