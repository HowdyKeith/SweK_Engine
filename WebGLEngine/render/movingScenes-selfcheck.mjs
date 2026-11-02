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
    ok("  ...and temporalRound refuses any other round, naming 77", /70, 72 or 77/.test(bad || ""));
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
    ok("  the test command runs runMovingTest for a moving round and runTemporalTest otherwise", /\(RD\.moving \? LT\.runMovingTest : LT\.runTemporalTest\)\(\{ splits: RD\.splits,/.test(cli));
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

console.log(`\n${fails ? "FAIL -- " + fails + " check(s)" : "ALL GREEN"} (${Date.now() - t0} ms)` +
    "\nnot closed here: U_TH trained on moving sequences, or object motion vectors for Bt -- section 177's next round.");
process.exit(fails ? 1 : 0);
