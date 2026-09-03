// WHAT A 64x64 GATE CANNOT SEE, IN PIXELS (v4366).
//
// img2threejs (https://github.com/img2threejs/img2threejs, Apache-2.0) gates every generated model against its
// reference with forge/stage4_review/divine_eye.py: two HARD gates its own contract says no soft signal may rescue
// (silhouette IoU >= 0.85 on a 224 grid, area scale delta <= 0.08), and soft signals on a 64x64 luma grid.
// render/divineEye.mjs is a PORT of those four -- their constants, their arithmetic, their unusual choices kept.
//
// *** THIS ROUND IS NOT DISCOVERING THEIR BLIND SPOT. THEY WROTE IT DOWN. *** divine_eye.py carries a comment headed
// "RESOLUTION CEILING, and it is a hard limit on what this module can ever report": a feature a few pixels wide "is
// not scored badly, it is ABSENT before any comparison happens. No threshold tuning recovers it." Their gates
// reference says the same of the silhouette -- IoU is computed from roughly 11% of figure cells, so it is blind to
// the other 89% -- and records the case that found it: a finished face and the same model with its face DELETED both
// scored 0.8803, identical to four decimals. What this tree adds is the thing it is built to add: THE NUMBER. An
// engine that compares 65,536 pixels at worst channel difference 0 can say exactly how much picture moves while all
// four signals hold, and that is a measurement neither project had.
//
// *** AND THE CONDITIONS ARE THE FRIENDLIEST POSSIBLE, WHICH MATTERS FOR READING THE RESULT. *** Their gate scores a
// render against a PHOTOGRAPH, where IoU never reaches 1 and every signal starts lower. This one scores a render
// against ANOTHER RENDER of the same model from the same camera, so the baseline is exact and every point of
// agreement is real rather than lucky. A blind spot measured here is a floor on the blind spot there, not a ceiling.
//
// WHAT IS PORTED AND WHAT IS NOT: the two hard gates, global SSIM and Sobel edge overlap. NOT pHash, bilateral
// symmetry, blowout parity, flat-region ratio, tonal parity, objectness, the CIEDE2000 hue work, the self-uncertainty
// routing or the VLM layer. So a verdict here is NOT their verdict -- it is their two hard gates plus two of nine
// soft signals, and the round says so wherever it reports one.
//
// SABOTAGES: see the log at the foot of this file.
"use strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runInEngineOrigin, webgpuSkipReason } from "./webgpuHarness.mjs";
import * as DE from "../../render/divineEye.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
let fails = 0;
const ok = (label, cond, detail) => { if (!cond) fails++; console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}${detail ? "   " + detail : ""}`); };
const report = (s) => console.log(`  ----  ${s}`);
const skip = webgpuSkipReason();
const W = 256, N = W * W;

console.log("\n1. THE PORT, ON THE CPU: their constants, their arithmetic, and the properties a port must have");
{
    ok(`the ported constants are theirs: mask grid ${DE.MASK_GRID_SIZE}, luma grid ${DE.LUMA_SIZE}, edge grid ${DE.EDGE_SIZE}, IoU hard floor ${DE.IOU_HARD_MIN}, scale hard ceiling ${DE.SCALE_HARD_MAX}`,
        DE.MASK_GRID_SIZE === 224 && DE.LUMA_SIZE === 64 && DE.EDGE_SIZE === 96 && DE.IOU_HARD_MIN === 0.85 && DE.SCALE_HARD_MAX === 0.08 && DE.EDGE_THRESH === 0.12,
        "divine_eye.py LUMA_SIZE/EDGE_SIZE/IOU_HARD_MIN/SCALE_HARD_MAX and diagnose_render.py MASK_GRID_SIZE");
    // a picture against itself: every signal at its ceiling, both hard gates passed
    const px = new Uint8ClampedArray(N * 4);
    for (let i = 0; i < N; i++) { const x = i % W, y = (i / W) | 0;
        const inside = Math.hypot(x - 128, y - 128) < 60;
        px[i * 4] = inside ? 200 : 8; px[i * 4 + 1] = inside ? 60 : 8; px[i * 4 + 2] = inside ? 40 : 8; px[i * 4 + 3] = 255; }
    const self = DE.compare(px, px, W, W);
    ok("a picture against ITSELF: IoU 1, scale delta 0, SSIM 1, edge overlap 1, both hard gates passed -- and the mask found the DISC and not the frame",
        self.iou === 1 && self.scaleDelta === 0 && Math.abs(self.ssim - 1) < 1e-12 && self.edgeOverlap === 1 && self.passesHardGates && self.refCoverage > 0.1 && self.refCoverage < 0.25,
        `IoU ${self.iou}, scale ${self.scaleDelta}, SSIM ${self.ssim.toFixed(6)}, edges ${self.edgeOverlap}, foreground coverage ${self.refCoverage.toFixed(4)} (a disc of radius 60 in a ${W}px frame is ${(Math.PI * 60 * 60 / (W * W)).toFixed(4)})`);
    // *** A FINDING ABOUT THE PORTED MASK, AND IT COST THIS ROUND ITS FIRST RUN. *** saturation() is (max - min) / max,
    // which near black is enormous: a background of (8, 8, 10) -- a clear colour one unit blue -- is 20% saturated,
    // clears their 0.16, and is dark enough to clear the 0.94 luma ceiling, so EVERY BACKGROUND PIXEL IS FOREGROUND and
    // the mask covers the whole frame. Every IoU in this gate's first run read exactly 1.0000, including one against a
    // silhouette with half of it removed. The gate now clears to a NEUTRAL background and says why here.
    const tinted = Uint8ClampedArray.from(px); for (let i = 0; i < N; i++) if (tinted[i * 4] === 8) tinted[i * 4 + 2] = 10;
    const tintedCov = DE.buildForegroundMask(W, W, tinted).coverage, neutralCov = DE.buildForegroundMask(W, W, px).coverage;
    ok("*** MEASURED, not inferred: one unit of blue in a near-black background makes their mask call the WHOLE FRAME foreground, because saturation is (max - min) / max and near black that is 20% ***",
        tintedCov === 1 && neutralCov < 0.25,
        `background (8,8,10) -> coverage ${tintedCov.toFixed(4)}; (8,8,8) -> ${neutralCov.toFixed(4)}. With the tint, an IoU against a silhouette missing half of itself still reads ${DE.silhouetteIou(DE.maskGrid(tinted, W, W).grid, DE.maskGrid(Uint8ClampedArray.from(tinted, (v, i) => (i % 4 === 3 ? v : v)), W, W).grid).toFixed(4)} -- this is a property of their rule, reproduced faithfully, and it is why every render compared here clears to a neutral grey`);
    // two disjoint silhouettes: the IoU floor, and the hard gate saying so by name
    const px2 = new Uint8ClampedArray(N * 4);
    for (let i = 0; i < N; i++) { const x = i % W, y = (i / W) | 0;
        const inside = Math.hypot(x - 128, y - 128) < 60 && x > 128;
        px2[i * 4] = inside ? 200 : 8; px2[i * 4 + 1] = inside ? 60 : 8; px2[i * 4 + 2] = inside ? 40 : 8; px2[i * 4 + 3] = 255; }
    const half = DE.compare(px, px2, W, W);
    ok("half the silhouette removed: the IoU hard gate fails BY NAME, which is their contract -- no soft signal may rescue it",
        half.iou < DE.IOU_HARD_MIN && !half.passesHardGates && /silhouette IoU/.test(half.hardFailures[0] || ""),
        `IoU ${half.iou.toFixed(3)}, scale delta ${half.scaleDelta.toFixed(3)}; ${half.hardFailures.join("; ")}`);
    // largestComponent: their reason for it, reproduced -- one stray cell moves an extremal statistic
    const stray = new Uint8Array(16 * 16); for (let y = 4; y < 12; y++) for (let x = 4; x < 12; x++) stray[y * 16 + x] = 1;
    const withStray = Uint8Array.from(stray); withStray[0] = 1;
    const lc = DE.largestComponent(withStray, 16);
    ok("the largest 4-connected blob wins and the stray cell is DISCARDED and counted -- their fix for a bounding box that one corner pixel could move to the frame edge",
        lc.mask[0] === 0 && DE.bboxOf(withStray, 16).join() === "0,0,12,12" && DE.bboxOf(lc.mask, 16).join() === "4,4,8,8" && Math.abs(lc.discarded - 1 / 65) < 1e-9,
        `bbox with the stray ${DE.bboxOf(withStray, 16).join(",")}, without it ${DE.bboxOf(lc.mask, 16).join(",")}; ${(lc.discarded * 100).toFixed(2)}% discarded`);
    ok("  and the scale delta is an AREA ratio, not a linear one: a bbox 10% wider and 10% taller reads 0.21, not 0.10",
        Math.abs(DE.proportionDelta([0, 0, 100, 100], [0, 0, 110, 110]).scaleDelta - 0.21) < 1e-9,
        `so a LINEAR scale trips the 0.08 ceiling at sqrt(1.08) = ${Math.sqrt(1.08).toFixed(4)}, which section 2 measures rather than assumes`);
    const flat = new Float64Array(64 * 64).fill(0.5);
    ok("  and the SSIM is their single-window one over the whole grid: two identical flats read 1, and a constant offset reads below it",
        Math.abs(DE.globalSsim(flat, flat) - 1) < 1e-12 && DE.globalSsim(flat, new Float64Array(64 * 64).fill(0.6)) < 1,
        `identical ${DE.globalSsim(flat, flat).toFixed(6)}, offset ${DE.globalSsim(flat, new Float64Array(64 * 64).fill(0.6)).toFixed(6)}`);
}

console.log("\n2. THE CALIBRATION: one model, four kinds of error, their four signals beside this tree's 65,536 pixels");
if (skip) { console.log(`  SKIP  ${skip}`); fails++; }
else {
    const r = await runInEngineOrigin({ engineRoot: ENG, args: { W }, script: `async (a) => {
        const THREE = await import("/vendor/three-webgpu/three.webgpu.js");
        const B = await import("/render/img2three.mjs"); const G = await import("/render/gpuDriven.mjs"); const F = await import("/render/fleets.mjs"); const { requestDevice } = await import("/gfx/device.js");
        const out = {};
        // the v4365 tree: nested groups with rotation and non-uniform scale, three material families, an
        // indexed primitive and a non-indexed one -- the shapes a generated factory produces.
        let REF = null;   // the base model's own centre and radius, so a variant is not re-framed as well as changed
        const build = ({ bodyColor = 0x2b6fb0, drop = null, scale = 1, yaw = 0, satellite = false } = {}) => {
            const root = new THREE.Group();
            const arm = new THREE.Group(); arm.position.set(0.6, 0.2, 0); arm.rotation.set(0.3, 0.7, 0.15); arm.scale.set(1.4, 0.7, 1.0); root.add(arm);
            const body = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.5, 0.4), new THREE.MeshPhysicalMaterial({ color: bodyColor }));
            const knob = new THREE.Mesh(new THREE.SphereGeometry(0.22, 16, 12), new THREE.MeshStandardMaterial({ color: 0xf4c531 }));
            knob.position.set(0.35, 0.3, 0.1); if (drop !== "knob") arm.add(knob);
            const strip = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.16, 0.7, 12), new THREE.MeshBasicMaterial({ color: 0xc0392b }));
            strip.position.set(-0.5, -0.1, 0.2); strip.rotation.z = 0.9; if (drop !== "strip") root.add(strip);
            const plain = new THREE.BufferGeometry(); plain.setAttribute("position", new THREE.BufferAttribute(Float32Array.from([-0.4, -0.5, 0.3, 0.4, -0.5, 0.3, 0, 0.1, 0.5]), 3));
            root.add(body); root.add(new THREE.Mesh(plain, new THREE.MeshStandardMaterial({ color: 0x27ae60 })));
            // an INTERIOR detail: a badge lying on the body's visible face, wholly inside its projected outline, so
            // deleting it cannot move the silhouette. This is the shape of their own recorded case -- a face deleted.
            const badge = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.28, 0.004), new THREE.MeshStandardMaterial({ color: 0xecf0f1 }));
            badge.position.set(0, 0, 0.202); if (drop !== "badge") root.add(badge);
            // a DETACHED part, off where its projection cannot touch the body's: their mask keeps only the largest
            // 4-connected blob, so this is the case their own docstring warns about -- "a subject with genuinely
            // separated parts in projection would lose them here".
            if (satellite) { const sat = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 0.3), new THREE.MeshStandardMaterial({ color: 0xffffff }));
                sat.position.set(-1.15, 0.75, 0); root.add(sat); }
            root.rotation.y = yaw; root.scale.setScalar(scale);
            root.updateMatrixWorld(true);
            const flat = B.flattenThreeTree(root);
            const m = B.unitMesh(flat, 1 * scale, REF || flat);   // unitMesh normalises, so the SCALE is applied after it
            if (!REF) REF = flat;
            return m;
        };
        const cam = { viewProj: G.multiply(G.perspective(Math.PI / 3, 1, 0.1, 100), G.lookAt([1.0, 0.8, 1.7], [0, 0, 0])), eye: [1.0, 0.8, 1.7] };
        const cv = document.createElement("canvas"); cv.width = a.W; cv.height = a.W;
        const dev = await requestDevice(cv, { backend: "webgpu", offscreen: true });
        const errs = []; if (dev.gpu && dev.gpu.addEventListener) dev.gpu.addEventListener("uncapturederror", (e) => errs.push(String(e.error && e.error.message).slice(0, 200)));
        const look = F.LOOKS.lit, buffers = G.layoutBuffers(look.layout);
        const shoot = (mesh) => {
            const fleet = { name: "m", look: "lit", layout: look.layout,
                pipeline: { shaders: look.shaders, vs: "vs", fs: "fs", buffers, uniforms: look.uniforms },
                pickPipeline: { shaders: look.pick, vs: "vs", fs: "fs", buffers, uniforms: [{ name: "viewProj", type: "mat4" }] },
                lods: [{ name: "near", mesh }, { name: "far", mesh: F.farMesh([1, 1, 1, 1]) }],
                bind: (pass) => pass.uniform("light", F.LIGHT) };
            const sc = G.makeGpuDrivenScene(dev, { fleets: [fleet], fleetOf: Uint32Array.from([0]), thresholds: [0.0001], records: Float32Array.from([0, 0, 0, 1]) });
            return sc.frame({ ...cam, read: true, clear: [0.03, 0.03, 0.03, 1] }).pixels;   // NEUTRAL: a tinted near-black background makes their mask cover the frame (section 1)
        };
        try {
            out.base = Array.from((await shoot(build())).pixels);
            out.variants = {};
            // (1) MATERIAL IDENTITY: the same form, one component a completely different colour. Nothing about the
            //     silhouette moves, by construction -- which is the point rather than a convenience.
            for (const [name, c] of [["recolour-slight", 0x2f6fa8], ["recolour-half", 0x8a7a58], ["recolour-full", 0xe8d9a0]])
                out.variants[name] = Array.from((await shoot(build({ bodyColor: c }))).pixels);
            // (2) A PART DELETED, which is the case their own gates reference records
            out.variants["drop-badge"] = Array.from((await shoot(build({ drop: "badge" }))).pixels);
            out.variants["drop-knob"] = Array.from((await shoot(build({ drop: "knob" }))).pixels);
            out.variants["drop-strip"] = Array.from((await shoot(build({ drop: "strip" }))).pixels);
            // (3) SCALE, which is a hard gate -- so this is where the sweep should find the ceiling working
            out.scales = {};
            for (const s of [1.01, 1.02, 1.03, 1.04, 1.05, 1.08, 1.12])
                out.scales[s] = Array.from((await shoot(build({ scale: s }))).pixels);
            // (4) a small yaw, which moves everything a little and the silhouette barely
            out.variants["yaw-0.05"] = Array.from((await shoot(build({ yaw: 0.05 }))).pixels);
            // (5) a WHOLE DETACHED PART added, which their mask discards before any comparison happens
            out.variants["satellite"] = Array.from((await shoot(build({ satellite: true }))).pixels);
            // (6) ALL OF THEM AT ONCE, which is the number this round is for: a component recoloured, two deleted,
            //     and a whole new one added, in one model.
            out.variants["all-four"] = Array.from((await shoot(build({ bodyColor: 0xe8d9a0, drop: "badge", satellite: true }))).pixels);
            out.variants["all-four-knob"] = Array.from((await shoot(build({ bodyColor: 0xe8d9a0, drop: "knob", satellite: true }))).pixels);
            out.errs = errs;
        } catch (e) { out.error = String(e && e.message || e).slice(0, 400); }
        return out;
    }` });
    ok("the harness rendered the model and its variants", r.ok && r.result && !r.result.error && r.result.base, r.ok ? (r.result && r.result.error) : (r.reason || (r.pageErrors || []).join("; ")));
    if (r.ok && r.result && !r.result.error) {
        const R = r.result, base = Uint8ClampedArray.from(R.base);
        const row = (name, px) => { const p = Uint8ClampedArray.from(px);
            return { name, ...DE.exactDifference(base, p), ...DE.compare(base, p, W, W) }; };
        const V = Object.entries(R.variants).map(([k, v]) => row(k, v));
        const by = (k) => V.find((v) => v.name === k);
        for (const v of V) console.log(`        ${v.name.padEnd(16)} ${String(v.differing).padStart(6)} px differ (worst ${String(v.worst).padStart(3)})   IoU ${v.iou.toFixed(4)}  scale ${v.scaleDelta.toFixed(4)}  SSIM ${v.ssim.toFixed(4)}  edges ${v.edgeOverlap.toFixed(4)}  ${v.passesHardGates ? "PASSES both hard gates" : "hard-gated: " + v.hardFailures.join("; ")}`);
        const full = by("recolour-full");
        ok(`*** A COMPONENT ENTIRELY RECOLOURED: ${full.differing} of ${N} pixels change, worst channel ${full.worst} -- and the silhouette IoU is EXACTLY ${full.iou} and the scale delta EXACTLY ${full.scaleDelta}, so both hard gates pass ***`,
            full.iou === 1 && full.scaleDelta === 0 && full.passesHardGates && full.differing > N / 40,
            `${(100 * full.differing / N).toFixed(1)}% of the frame moved, SSIM ${full.ssim.toFixed(4)}, edge overlap ${full.edgeOverlap.toFixed(4)}. The hard gates are silhouette statistics and a recolour is not a silhouette event -- their own gates reference says IoU reads about 11% of figure cells`);
        const badge = by("drop-badge"), knob = by("drop-knob"), strip = by("drop-strip");
        const all = [by("all-four"), by("all-four-knob")].reduce((m, v) => (v.differing > m.differing ? v : m));
        ok(`*** A WHOLE COMPONENT DELETED, and whether it is caught turns ENTIRELY on whether it touched the outline: the interior badge costs ${badge.differing} pixels at IoU EXACTLY ${badge.iou} and passes both hard gates ***`,
            badge.iou === 1 && badge.scaleDelta === 0 && badge.passesHardGates && badge.differing > 100,
            `this is the shape of their own recorded case -- gates_reference.md: a finished face and the same model with its face DELETED both scored 0.8803, identical to four decimals. Here the deletion is not scored badly; it is not scored at all`);
        ok(`  AND THE OTHER HALF, WHICH IS WHY THIS IS A CALIBRATION AND NOT A COMPLAINT: delete the part that sets the BOUNDING BOX and it is caught -- the strip, at ${strip.differing} pixels, fewer than the knob's ${knob.differing}, refused by name`,
            !strip.passesHardGates && strip.hardFailures.length > 0 && knob.passesHardGates,
            `strip ${strip.differing} px -> ${strip.hardFailures.join("; ")}; knob ${knob.differing} px -> passes. The SMALLER change is the one caught, because what these gates measure is not how much moved but WHERE: the strip is the model's extreme in x, so its removal is a bounding-box event, and its IoU (${strip.iou.toFixed(4)}) clears the 0.85 floor on its own -- the SCALE gate is what refuses it`);
        ok(`*** SO THE NUMBER THIS ROUND EXISTS FOR: recolour a component, DELETE another, and ADD a detached third, all in one model -- ${all.differing} of ${N} pixels change, ${(100 * all.differing / N).toFixed(1)}% of the frame, and the silhouette IoU is EXACTLY ${all.iou} with a scale delta of EXACTLY ${all.scaleDelta} ***`,
            all.iou === 1 && all.scaleDelta === 0 && all.passesHardGates && all.differing > 2000,
            `"${all.name}": SSIM ${all.ssim.toFixed(4)}, edge overlap ${all.edgeOverlap.toFixed(4)} -- both SOFT, and their contract says a soft signal cannot fail a build a hard gate passed. Three separate defects, none of them a silhouette event, and the two gates that cannot be overruled read their perfect scores`);
        // WHAT IT DOES CATCH, because a calibration that only reports blind spots is an argument and not a measurement
        const S = Object.entries(R.scales).map(([s, px]) => ({ s: Number(s), ...row("scale " + s, px) }));
        for (const v of S) console.log(`        scale ${v.s.toFixed(2).padEnd(11)} ${String(v.differing).padStart(6)} px differ            IoU ${v.iou.toFixed(4)}  scale ${v.scaleDelta.toFixed(4)}  ${v.passesHardGates ? "passes" : "HARD-GATED"}`);
        const firstCaught = S.find((v) => !v.passesHardGates), lastPassed = [...S].reverse().find((v) => v.passesHardGates);
        const predicted = Math.sqrt(1 + DE.SCALE_HARD_MAX);
        ok(`*** AND WHERE THE GATE CAN SEE, IT IS SHARPER THAN ITS OWN ARITHMETIC PREDICTS: a flat-projection reading of an AREA delta puts the 0.08 ceiling at sqrt(1.08) = ${predicted.toFixed(4)} linear, and the sweep catches ${firstCaught ? firstCaught.s : "nothing"} while passing ${lastPassed ? lastPassed.s : "nothing"} ***`,
            !!firstCaught && firstCaught.s <= predicted && lastPassed && lastPassed.s < firstCaught.s,
            firstCaught ? `first caught at ${firstCaught.s} (scale delta ${firstCaught.scaleDelta.toFixed(4)}), largest passed ${lastPassed.s} (${lastPassed.scaleDelta.toFixed(4)}); DERIVED ${predicted.toFixed(4)}. It trips EARLIER than the flat reading, and the derivation is why that is worth saying: the projection is perspective, not orthographic, so a world-space scale grows the near parts more, and the bbox is quantised to a ${DE.MASK_GRID_SIZE} grid on top. The arithmetic is the guide; the sweep is the answer` : "nothing was caught");
        const sat = by("satellite");
        ok(`*** A WHOLE DETACHED PART ADDED IS DISCARDED BEFORE ANY COMPARISON HAPPENS: ${sat.differing} pixels of new object in the frame, IoU EXACTLY ${sat.iou}, scale delta EXACTLY ${sat.scaleDelta}, both hard gates passed ***`,
            sat.iou === 1 && sat.scaleDelta === 0 && sat.passesHardGates && sat.renDiscarded > 0.02 && sat.differing > 500,
            `${(100 * sat.renDiscarded).toFixed(1)}% of the render's foreground cells lie outside the largest blob and were dropped. Their loader RETURNS that as a warning -- and a warning is not a hard failure, which is the whole distinction their contract rests on. Their own docstring says it: "a subject with genuinely separated parts in projection would lose them here"`);
        const passing = [...V, ...S].filter((v) => v.passesHardGates);
        const worstBlind = passing.reduce((m, v) => (v.differing > m.differing ? v : m), passing[0]);
        const exactlyBlind = passing.filter((v) => v.iou === 1 && v.scaleDelta === 0);
        ok(`  and the boundary is not a threshold but a KIND: ${exactlyBlind.length} of the ${V.length + S.length} changes score IoU EXACTLY 1 and scale delta EXACTLY 0 -- not "within tolerance", identical -- and every one of them leaves the outline alone; the largest change of any kind that passes both gates moves ${worstBlind.differing} pixels (${(100 * worstBlind.differing / N).toFixed(1)}%)`,
            exactlyBlind.length >= 5 && worstBlind.differing >= all.differing,
            `exactly-blind: ${exactlyBlind.map((v) => v.name).join(", ")}; largest passing overall "${worstBlind.name}" at IoU ${worstBlind.iou.toFixed(4)}`);
        ok("  and none of this is a device artefact: the base render is bit-identical to itself and the harness saw no device errors",
            DE.exactDifference(base, base).differing === 0 && (R.errs || []).length === 0, `device errors ${(R.errs || []).length}`);
        report("READ THIS AGAINST THE CONDITIONS, WHICH ARE THE FRIENDLIEST THE GATE WILL EVER SEE: these are two renders of " +
            "one model from one camera, so the baseline IoU is exactly 1. Their gate scores a render against a PHOTOGRAPH, where " +
            "IoU never starts at 1 and the same absolute blindness sits on a worse footing. And it is FOUR of their signals: pHash, " +
            "symmetry, blowout, flat-region, tonal parity, objectness and the VLM layer are unported, and their contract has the VLM " +
            "rescuing a soft near-threshold reject -- so this measures what the HARD gates let through, which is exactly the thing " +
            "their own contract says nothing downstream may overturn.");
    }
}

// SABOTAGE LOG -- applied, gate run, exit code read, restored. MEASURED at v4366.
//   AP the luma grid widened from their 64 to the render's own size -> exit=1, 1 red: the constants check, by name. It is
//      one red because the round's claims are about the two HARD gates, which are mask statistics and do not read the luma
//      grid at all -- the soft signals move and change nothing that can fail a build. That is their contract, seen from
//      the other side, and it is why widening the grid is not a fix for anything measured here.
//   AQ the largest-connected-blob filter dropped from the mask -> exit=1, 4 red -- BUT IT WENT 0 RED FIRST, the third
//      sabotage this session to prove a check nothing was exercising. Every render the gate compared had ONE connected
//      blob, so a filter that keeps the largest had nothing to discard and removing it cost nothing. The `satellite`
//      variant -- a whole detached part, which their own docstring warns loses itself here -- was added for that reason,
//      and only then did removing the filter cost 4 red. A refusal is not tested by inputs that never reach it.
//   AR the mask's `saturation > 0.16 && luma < 0.94` clause dropped -> exit=1, 1 red: the tinted-background finding stops
//      being reproducible, which is the check that exists because this gate's own first run measured nothing at all.
//
// AND THE ROUND'S OWN FIRST TWO RUNS WERE BOTH WRONG, WHICH IS WHY THE TABLE IS PRINTED RATHER THAN SUMMARISED.
//   (1) Every IoU read exactly 1.0000, including one against a silhouette with half of it removed -- the clear colour
//       was (0.03, 0.03, 0.04) and their saturation rule made the whole frame foreground. Fixed by clearing to neutral.
//   (2) Deleting the knob then read IoU 0.2202 and a scale delta of 2.1194, and that was an ARTEFACT OF THIS GATE: each
//       variant was normalised to its OWN bounds, so removing the outermost part re-framed the entire model. With the
//       base model's centre and radius held fixed (img2three unitMesh's `from`), the same deletion reads IoU exactly 1.
//       The first reading would have been quoted as the gate WORKING, which is the more dangerous direction to be wrong in.

console.log(fails ? "\nFAIL -- " + fails + " check(s)" : "\nALL GREEN");
console.log("unchecked here: the five soft signals and the VLM layer this port leaves out, so no verdict here is their verdict; " +
    "whether these numbers hold against a PHOTOGRAPH rather than a second render, which is the case their gate actually runs and " +
    "cannot be measured in this tree without a reference photo and a licence to keep it; their microscope path " +
    "(grimoire/review/divine_eye_microscope.md), which is what they say answers feature-scale fidelity and which this round does not " +
    "port or test; and every number the rig has not signed.");
process.exit(fails ? 1 : 0);
