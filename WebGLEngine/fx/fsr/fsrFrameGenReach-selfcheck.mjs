#!/usr/bin/env node
// WebGLEngine/fx/fsr/fsrFrameGenReach-selfcheck.mjs -- v4769
//
// WHERE THE FLOW LOST TO THE VECTORS ON PANS, AND WHY IT WAS NOT THE APERTURE PROBLEM. fx/fsr/fsrFlowSeed-selfcheck.mjs left it
// open: on a wall whose texture scrolls while the camera pans -- the texture stretched 40 units wide, the pan 2 px a frame -- the
// generator with the flow read 28.25 dB and the vectors alone 36.98, and v4758 guessed at a low, anisotropic texture letting a
// wrong shift explain the window better. MEASURED here, it did not: the pixels the flow takes carry the wall's TRUE motion,
// the pan and the scroll together, where the application's vector is the pan's alone. The flow is right, and being right is
// what costs: the wall now moves 8 px against the knot in front of it and the frame's edge, and the gap it opens is wider than
// the fill's radius of 4 -- those pixels are left BLACK. The vectors are wrong the same way everywhere and open no gap.
// render/holeFill.mjs's `reach` (v4769): a hole with nothing within the radius searches again out to the reach, by the same
// rules; every hole the radius fills is filled as it was. Graded here against the frame rendered at the midpoint, on the pans
// v4758 found and a faster one, the vectors and the flow each with the radius alone and with a reach of 12.
// *** WEBGPU ONLY. *** render/holeFillTsl-selfcheck.mjs holds the reach to fillHolesCPU on both backends, exactly.
"use strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runInEngineOrigin, webgpuSkipReason } from "../../tools/ship/webgpuHarness.mjs";
import { gateReport } from "../../tools/ship/gateReport.mjs";
const REPORT = gateReport("fx/fsr/fsrFrameGenReach-selfcheck.mjs");

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let fails = 0;
const ok = (label, cond, detail) => { if (!cond) fails++; console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}${detail ? "   " + detail : ""}`); };
const say = (s) => console.log(`  ----  ${s}`);
// *** v4778 RIG RUN 8 -- A COST ROW IS SWIFTSHADER'S COST MODEL, ASSERTED ON SOFTWARE AND REPORTED ON A GPU (Keith's decision). ***
// The rows costRow carries assert how SwiftShader, a CPU rasteriser, spends its time; their own text says "SwiftShader's
// milliseconds". On Keith's GTX 1080 (realGpuRun, three runs) a fixed cost of a few ms swallowed every proportion they hold,
// and the readings moved run to run by more than the claims' margins. So: on an adapter the harness KNOWS is hardware, the
// row is printed with its figures and whether it would hold, and not asserted; on software, or an adapter it cannot name,
// it is asserted as before. A GPU cost model is a separate measurement nobody has taken.
const adapterName = (r) => (r && r.adapter ? [r.adapter.vendor, r.adapter.architecture].filter(Boolean).join(" ") || "unnamed" : "unknown");
const costRow = (r, label, cond, detail) => {
    if (r && r.software === false) { say(`NOT ASSERTED on a hardware adapter (${adapterName(r)}), by decision -- ${cond ? "holds here too" : "does not hold here"}: ${label.replace(/\*\*\* ?| ?\*\*\*/g, "")}`); return false; }
    ok(label, cond, detail); return true;
};
// ...and the scope is itself held: on software, the cost row WAS asserted, or the decision above has been widened by accident.
const costHeld = (r, asserted) => ok(`the cost row was ${asserted ? "asserted" : "reported"} on a ${r && r.software === false ? "hardware" : "software"} adapter (${adapterName(r)}), as decided`,
    asserted === !(r && r.software === false), "SwiftShader's cost model is held where it was measured and reported where it was not");
const D = 128, CASES = ["wideSlow", "scroll13", "wide13", "pan24"];

console.log("\n1. ON THE DEVICE: a knot in front of a wall, the camera panning and the wall's texture scrolling");
const skip = webgpuSkipReason();
if (skip) { console.log(`  SKIP  ${skip}`); console.log("  ----  *** NOT A PASS. *** Nothing here is static."); fails++; }
else {
    const r = await runInEngineOrigin({ engineRoot: ENG, timeoutMs: 300000, args: { D }, script: `async (a) => {
        const THREE = await import("/vendor/three-webgpu/three.webgpu.js"); const T = await import("/vendor/three-webgpu/three.tsl.js");
        const TT = await import("/render/temporalTsl.mjs"); const FG = await import("/fx/fsr/fsrFrameGenTsl.mjs");
        const OF = await import("/render/opticalFlowTsl.mjs"); const RC = await import("/render/flowReconcileTsl.mjs");
        const out = {};
        for (const mode of ["webgpu"]) {
            try {
                const D = a.D, canvas = document.createElement("canvas"); canvas.width = 512; canvas.height = 512;
                const renderer = new THREE.WebGPURenderer({ canvas, antialias: false }); await renderer.init(); renderer.setSize(512, 512, false);
                const tgt = (n) => new THREE.RenderTarget(n, n, { type: THREE.FloatType, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter });
                const read = async (t, n) => { const px = await renderer.readRenderTargetPixelsAsync(t, 0, 0, n, n), s = Math.ceil(n / 16) * 16, o = new Float32Array(n * n * 4);
                    for (let y = 0; y < n; y++) for (let x = 0; x < n * 4; x++) o[y * n * 4 + x] = px[y * s * 4 + x]; return o; };
                const cl = (v) => Math.min(1, Math.max(0, v)), gl = TT.glClip(THREE, renderer);
                // v4768's fill, the radius alone, against the generator's default
                const fill4 = { radius: 4, side: "blend" };
                const arms = { vectors: FG.makeFrameGen(THREE, T, { w: D, h: D, fill: fill4 }), vectorsReach: FG.makeFrameGen(THREE, T, { w: D, h: D }),
                               flow: FG.makeFrameGen(THREE, T, { w: D, h: D, flow: {}, fill: fill4 }), flowReach: FG.makeFrameGen(THREE, T, { w: D, h: D, flow: {} }) };
                const o = { dflt: arms.vectorsReach.fill, given: arms.vectors.fill };
                // the pixels the flow takes, audited: the same flow and reconciliation as the flow arm, standalone
                const of = OF.makeOpticalFlow(THREE, T, { w: D, h: D, grid: "level" }), rc = RC.makeFlowReconcile(THREE, T, { w: D, h: D, audit: true });
                const A = tgt(D), B = tgt(D), o2 = tgt(D), big = tgt(D * 4), older = tgt(D), ortho = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
                const stage = TT.makeMotionStage(THREE, T, { w: D, h: D, gl, camera: true });
                const km = new THREE.NodeMaterial(); km.fragmentNode = T.textureLoad(stage.depth.texture, T.ivec2(T.int(T.screenCoordinate.x), T.int(T.screenCoordinate.y)));
                km.blending = THREE.NoBlending; km.depthTest = false; km.depthWrite = false; const keepSc = new THREE.Scene(); keepSc.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), km));
                for (const [cn, sc, pan, wide] of [["wideSlow", 0.12, 0.05, 40], ["scroll13", 0.12, 0.5, 14], ["wide13", 0.12, 0.5, 40], ["pan24", 0, 1.0, 14]]) {
                    const scene = new THREE.Scene(); scene.background = new THREE.Color(0.02, 0.03, 0.06);
                    const knot = new THREE.Mesh(new THREE.TorusKnotGeometry(0.9, 0.28, 220, 24), new THREE.MeshNormalNodeMaterial()); scene.add(knot);
                    const scroll = T.uniform(0.0), wm = new THREE.MeshBasicNodeMaterial();
                    wm.colorNode = T.Fn(() => { const q = T.vec2(T.uv().x.mul(14.0).add(scroll), T.uv().y.mul(8.0)).mul(1.6);
                        const n3 = T.mx_noise_vec3(T.vec3(q.x, q.y, 0.37)).add(T.mx_noise_vec3(T.vec3(q.x.mul(2.1), q.y.mul(2.1), 4.1)).mul(0.5)); return T.vec3(0.5).add(n3.mul(0.3)); })();
                    const wall = new THREE.Mesh(new THREE.PlaneGeometry(wide, 8), wm); wall.position.z = -2; scene.add(wall); const cam = new THREE.PerspectiveCamera(40, 1, 0.1, 50);
                    const setT = (k) => { const t = k / 60; knot.rotation.set(0.4 + t * 0.4, 0.6 + t * 0.6, 0); knot.updateMatrixWorld(); scroll.value = k * sc;
                        cam.position.set(k * pan, 0.6, 5.2); cam.lookAt(k * pan, 0, 0); cam.updateMatrixWorld(); };
                    setT(0); renderer.setRenderTarget(A); await renderer.renderAsync(scene, cam); setT(1); renderer.setRenderTarget(B); await renderer.renderAsync(scene, cam);
                    setT(0.5); renderer.setRenderTarget(big); await renderer.renderAsync(scene, cam); const t4 = await read(big, D * 4);
                    const truth = new Float32Array(D * D * 4); for (let y = 0; y < D; y++) for (let x = 0; x < D; x++) for (let c = 0; c < 3; c++) { let s = 0;
                        for (let sy = 0; sy < 4; sy++) for (let sx = 0; sx < 4; sx++) s += t4[((y * 4 + sy) * D * 4 + x * 4 + sx) * 4 + c]; truth[(y * D + x) * 4 + c] = s / 16; }
                    const ps = (img) => { let q = 0; for (let i = 0; i < D * D; i++) for (let c = 0; c < 3; c++) q += (cl(img[i * 4 + c]) - cl(truth[i * 4 + c])) ** 2; return 10 * Math.log10(1 / (q / (D * D * 3))); };
                    // one stage pass a frame, shared by the arms; the pair's older depth copied from frame 0's and given as depthPrev
                    setT(0); await stage.render(renderer, scene, cam); renderer.setRenderTarget(older); await renderer.renderAsync(keepSc, ortho); setT(1); await stage.render(renderer, scene, cam);
                    const c = {};
                    for (const [an, g] of Object.entries(arms)) {
                        await g.generate(renderer, { prev: A.texture, cur: B.texture, motion: stage.motion.texture, depth: stage.depth.texture, depthPrev: older.texture, camera: g.reconcile ? stage.camera.texture : null }, o2);
                        const img = await read(o2, D); let black = 0; for (let i = 0; i < D * D; i++) if (img[i * 4] + img[i * 4 + 1] + img[i * 4 + 2] === 0) black++;
                        c[an] = { db: ps(img), black };
                    }
                    if (cn === "wideSlow") {
                        // the audit: where the flow took a pixel, its vector against the application's -- and against the wall's TRUE
                        // motion, which is the application's scaled: the pan and the scroll are both translations along the wall
                        await of.flow(renderer, B.texture, A.texture);
                        await rc.reconcile(renderer, { lumaCur: of.pyramids.cur.targets[0].texture, lumaPrev: of.pyramids.prev.targets[0].texture, flow: of.target.texture, motion: stage.motion.texture, depth: stage.depth.texture, camera: stage.camera.texture });
                        const px = await read(rc.targets.pixel, D), fld = await read(rc.targets.field, D), mv = await read(stage.motion, D);
                        // the knot's pixels, drawn alone: the wall hidden and the background black
                        wall.visible = false; const bgc = scene.background; scene.background = new THREE.Color(0, 0, 0); renderer.setRenderTarget(o2); await renderer.renderAsync(scene, cam); const kn = await read(o2, D); wall.visible = true; scene.background = bgc;
                        const f = (pan + sc * wide / 14) / pan; let took = 0, atTrue = 0, atApp = 0, gap = 0;
                        for (let i = 0; i < D * D; i++) { if (px[i * 4] !== 2 || kn[i * 4] + kn[i * 4 + 1] + kn[i * 4 + 2] !== 0) continue; took++;
                            // the application's vector in the field's own sense: the flow's x is forward pixels, the motion's du is uv
                            const ax = -mv[i * 4] * D; gap += Math.abs(fld[i * 4] - ax);
                            if (Math.abs(fld[i * 4] - ax * f) < 1) atTrue++; if (Math.abs(fld[i * 4] - ax) < 1) atApp++; }
                        c.audit = { took, atTrue, atApp, meanGap: gap / Math.max(1, took), factor: f };
                    }
                    o[cn] = c; wm.dispose();
                }
                for (const g of Object.values(arms)) g.dispose(); of.dispose(); rc.dispose(); stage.dispose(); km.dispose(); for (const t of [A, B, o2, big, older]) t.dispose();
                out[mode] = o; renderer.dispose();
            } catch (err) { out[mode] = { err: String(err && err.stack || err).slice(0, 700) }; }
        }
        return out;
    }` });
    ok("the harness ran every pan", r.ok && r.result && !r.result.webgpu.err, r.ok ? `webgpu ${r.result.webgpu.err || "ok"}` : (r.reason || (r.pageErrors || []).join("; ")));
    if (r.ok && r.result && !r.result.webgpu.err) {
        const o = r.result.webgpu, f = (v) => v.toFixed(2), d = (x, y) => (x - y >= 0 ? "+" : "") + (x - y).toFixed(2), a = o.wideSlow.audit;
        const names = { wideSlow: "v4758's wall, 40 wide, scrolling 8.4 px under a 1.2 px pan", scroll13: "the wall scrolling 2.9 px under a 12 px pan", wide13: "the 40-wide wall under the 12 px pan", pan24: "a 24 px pan, nothing scrolling" };
        for (const cn of CASES) say(`${names[cn]}: the vectors ${f(o[cn].vectors.db)} dB with the radius alone (${o[cn].vectors.black} pixels black), ${f(o[cn].vectorsReach.db)} reaching 16 (${o[cn].vectorsReach.black}); the flow ${f(o[cn].flow.db)} (${o[cn].flow.black}), ${f(o[cn].flowReach.db)} (${o[cn].flowReach.black})`);
        REPORT.table("the fill's radius alone against reaching 16: dB and pixels left black", ["case", "vectors dB", "vectors black", "vectors reaching 16 dB", "...black",
            "flow dB", "flow black", "flow reaching 16 dB", "...black"],
            CASES.map((cn) => [cn, o[cn].vectors.db, o[cn].vectors.black, o[cn].vectorsReach.db, o[cn].vectorsReach.black, o[cn].flow.db, o[cn].flow.black, o[cn].flowReach.db, o[cn].flowReach.black]));
        ok(`  [webgpu] the generator's default fill reaches 16 past its radius of 4, and a fill given without a reach does not: ${JSON.stringify(o.dflt).replace(/"/g, "")} and ${JSON.stringify(o.given).replace(/"/g, "")}`,
           o.dflt && o.dflt.radius === 4 && o.dflt.reach === 16 && o.dflt.side === "blend" && o.given && o.given.reach === null,
           "fx/fsr/fsrFrameGenTsl.mjs: fill = { radius: 4, reach: 16, side: \"blend\" } unless given");
        say(`the audit, on v4758's wall: the flow took ${a.took} of its pixels; ${a.atTrue} of them within a pixel of the wall's TRUE motion -- the application's vector times ${a.factor.toFixed(3)}, the pan and the scroll together -- and ${a.atApp} within a pixel of the application's own; the chosen vector ${a.meanGap.toFixed(2)} px from the application's on average`);
        ok(`*** [webgpu] v4758's loss was not the aperture problem: where the flow takes the scrolling wall its vector is the wall's true motion at ${a.atTrue} of ${a.took} pixels, and the application's at ${a.atApp} -- and the flow's frame had ${o.wideSlow.flow.black} pixels BLACK, the vectors' ${o.wideSlow.vectors.black} ***`,
           a.took > 3000 && a.atTrue > 0.75 * a.took && a.atApp < 0.1 * a.took && o.wideSlow.flow.black > 40 && o.wideSlow.vectors.black === 0,
           "the pan moves the wall 1.2 px and the scroll 8.4 more; the application's vector is the pan's alone. A wrong shift along a stretched texture would have scattered the chosen vectors along it; four in five are within a pixel of the one true motion. Right, the flow moves the wall 8 px against the knot in front of it, and the gap it opens is past the fill's radius of 4. The vectors are wrong the same way everywhere and open none");
        ok(`*** [webgpu] reaching 16 fills what the radius left, and the flow's frame on that wall goes from ${f(o.wideSlow.flow.db)} dB to ${f(o.wideSlow.flowReach.db)} -- ${d(o.wideSlow.flowReach.db, o.wideSlow.vectorsReach.db)} against the vectors' ${f(o.wideSlow.vectorsReach.db)} -- and on the 12 px pans the flow beats the vectors by ${d(o.scroll13.flowReach.db, o.scroll13.vectorsReach.db)} and ${d(o.wide13.flowReach.db, o.wide13.vectorsReach.db)}, where the radius alone gave ${d(o.scroll13.flow.db, o.scroll13.vectors.db)} and ${d(o.wide13.flow.db, o.wide13.vectors.db)} ***`,
           o.wideSlow.flowReach.db - o.wideSlow.flow.db > 6 && o.wideSlow.flowReach.black === 0 && o.scroll13.flowReach.db - o.scroll13.vectorsReach.db > 2 && o.wide13.flowReach.db - o.wide13.vectorsReach.db > 2
               && o.wide13.flow.db < o.wide13.vectors.db,
           "on v4758's slow wall the flow is still a little below the vectors: the texture is stretched 2.9 times across, and a vector 8.4 px wrong along it costs the vectors little");
        ok(`  [webgpu] ...and the vectors alone gain too, wherever a pan brings content in at the frame's edge: ${CASES.map((cn) => `${cn} ${d(o[cn].vectorsReach.db, o[cn].vectors.db)}`).join(", ")} dB, the black pixels ${CASES.map((cn) => `${o[cn].vectors.black} to ${o[cn].vectorsReach.black}`).join(", ")}`,
           o.scroll13.vectorsReach.db - o.scroll13.vectors.db > 3 && o.pan24.vectorsReach.db - o.pan24.vectors.db > 3 && o.wideSlow.vectorsReach.db === o.wideSlow.vectors.db && CASES.every((cn) => o[cn].vectorsReach.black <= o[cn].vectors.black),
           "a hole with nothing within 4 px searches out to 16; one the radius filled is filled as it was -- on the slow pan there were none, and the frame is the same to the bit. Under the 24 px pan the frame's edge is 12 px wide at the midpoint, and some of it is still past 16");
    }
}
console.log("\n2. ON THE DEVICE: WHAT THE FILL COSTS -- its field pass alone, 256 x 256, with no holes, a tenth of the pixels and all of them");
if (!skip) {
    const r = await runInEngineOrigin({ engineRoot: ENG, timeoutMs: 300000, args: { N: 256 }, script: `async (a) => {
        const THREE = await import("/vendor/three-webgpu/three.webgpu.js"); const T = await import("/vendor/three-webgpu/three.tsl.js");
        const HF = await import("/render/holeFillTsl.mjs");
        const N = a.N, canvas = document.createElement("canvas"); canvas.width = 8; canvas.height = 8;
        const renderer = new THREE.WebGPURenderer({ canvas, antialias: false }); await renderer.init();
        const ortho = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1), rt = new THREE.RenderTarget(N, N, { type: THREE.FloatType, depthBuffer: false }), out = {};
        for (const [nm, frac, reach, runs] of [["none", 0, null, 5], ["tenth", 0.1, null, 5], ["all", 1, null, 5], ["noneReach", 0, 16, 5], ["tenthReach", 0.1, 16, 5]]) {
            // a vector everywhere the splat landed, holes scattered at random: most 2 x 2 quads of a tenth hold one
            const d = new Float32Array(N * N * 4); let s = 7; const rnd = () => (s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
            for (let i = 0; i < N * N; i++) { const hole = frac === 1 || (frac > 0 && rnd() < frac); d[i * 4] = 1; d[i * 4 + 2] = 0.5; d[i * 4 + 3] = hole ? 0 : 1; }
            const tex = new THREE.DataTexture(d, N, N, THREE.RGBAFormat, THREE.FloatType); tex.needsUpdate = true;
            const n = HF.fillHolesNodes(T, tex, { w: N, h: N, radius: 4, side: "blend", reach }), m = new THREE.NodeMaterial(); m.fragmentNode = n.fieldNode;
            m.blending = THREE.NoBlending; m.depthTest = false; m.depthWrite = false; const sc = new THREE.Scene(); sc.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), m));
            renderer.setRenderTarget(rt); await renderer.renderAsync(sc, ortho); await renderer.readRenderTargetPixelsAsync(rt, 0, 0, 1, 1);
            const ts = []; for (let k = 0; k < runs; k++) { const t0 = performance.now(); renderer.setRenderTarget(rt); await renderer.renderAsync(sc, ortho); await renderer.readRenderTargetPixelsAsync(rt, 0, 0, 1, 1); ts.push(performance.now() - t0); }
            ts.sort((x, y) => x - y); out[nm] = ts[(runs - 1) >> 1]; m.dispose(); tex.dispose();
        }
        rt.dispose(); renderer.dispose(); return out;
    }` });
    ok("the harness timed the fill", r.ok && r.result, r.ok ? "" : (r.reason || (r.pageErrors || []).join("; ")));
    if (r.ok && r.result) {
        const t = r.result, f = (v) => v.toFixed(1);
        say(`the radius alone: no holes ${f(t.none)} ms, a tenth ${f(t.tenth)}, all ${f(t.all)}; reaching 16: ${f(t.noneReach)} and ${f(t.tenthReach)} -- the median of five, SwiftShader's milliseconds`);
        REPORT.table("the fill's time, the median of five, this device's ms", ["holes", "radius alone ms", "reaching 16 ms"],
            [["none", t.none, t.noneReach], ["a tenth", t.tenth, t.tenthReach], ["all", t.all, "not timed"]]);
        costHeld(r, costRow(r, `*** [webgpu] only a hole searches: a frame with none costs ${f(t.none)} ms against ${f(t.all)} with every pixel one -- and reaching 16 costs nothing where the radius finds something, ${f(t.tenthReach)} ms against ${f(t.tenth)} for a tenth of the pixels ***`,
           t.none < 0.3 * t.all && t.noneReach < 0.3 * t.all && t.tenthReach < 1.5 * t.tenth + 3,
           "v4737's fill searched its window at every pixel and returned the landed ones' own texel after; it skips the search there now (the fill is fillHolesCPU's to the bit either way, render/holeFillTsl-selfcheck.mjs). " +
           "What the reach costs is the holes it searches for: a frame of holes nothing is near pays (2 x 16 + 1)^2 taps a pixel -- MEASURED ONCE when this round was built, 650 to 693 ms here, and not re-measured each run for the gate's time; no generated frame here comes near it"));
    }
}

// ---- v4769 SABOTAGE LOG ----------------------------------------------------------------------------------------
// Against render/holeFill.mjs, in render/holeFill-selfcheck.mjs and render/holeFillTsl-selfcheck.mjs (the parity rows, both
// backends): H1 the reach never searched -> 0, 6; H2 the reach searched where the radius found -> 0, 2; H3 a reach not past the
// radius not refused -> 1, 0; H4 the reached ones not counted -> 0, 2. *** H2 WAS SEEN BY ONE FIXTURE, THE WHOLE INTERPOLATION. ***
// The 14-wide strip's pixels near one side are more than 8 px from the other, so a reach of 8 searched again there finds only
// what the radius found; the moving square's disocclusion is narrow enough for both sides to be in reach.
// Against render/holeFillTsl.mjs, in render/holeFillTsl-selfcheck.mjs and here: T1 every pixel searches -> 0, 1 -- the fill is
// the same to the bit, and only this gate's time sees it (57.9 ms with no holes against 52.8 with all); T2 the reach never
// walked -> 6, 2; T3 the reach walked where the radius found -> 2, 2; T4 the reach walked at the radius -> 6, 2; T5 the reach
// not refused -> 1, 0. Against render/frameInterp.mjs: F1 the reach dropped -> 2 (render/holeFillTsl-selfcheck.mjs). Against
// render/frameInterpTsl.mjs: F2 the reach dropped -> 2, 2. Against fx/fsr/fsrFrameGenTsl.mjs, here and in
// fx/fsr/fsrFlowSeed-selfcheck.mjs: G1 the default reaching nothing -> 3, 1; G2 the default reaching 8 -> 3, 1 -- at 8 the
// seed's gain on the scrolling wall is -0.02 and -0.08 dB, which is part of why the default is 16.
REPORT.write();
// ---- v4778 RIG RUN 8 SABOTAGE LOG ------------------------------------------------------------------------------------
// S1 costRow's scope widened to report on any adapter not known to be software -> 1 red here, the "as decided" row (run
// against fsrFrameGenLayerCost and fsrFrameGenReach, each restored and md5 verified; the helper is the same three lines in
// fsrFlowCost). The hardware branch is the rig's to show: this box has no GPU.
console.log(fails ? "\nFAIL -- " + fails + " check(s)" : "\nALL GREEN");
console.log("unchecked here: what a reached hole is filled WITH -- the farthest vector within 16 px and the blend of both frames, which is " +
    "the radius's rule carried further and not a measured choice for gaps this wide; content entering at the frame's edge, which " +
    "no frame holds and a fill only guesses at; and what the fill costs on a GPU, whose occupancy and branching are not SwiftShader's.");
process.exitCode = fails ? 1 : 0;
