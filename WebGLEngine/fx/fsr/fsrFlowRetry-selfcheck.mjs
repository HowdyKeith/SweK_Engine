#!/usr/bin/env node
// WebGLEngine/fx/fsr/fsrFlowRetry-selfcheck.mjs -- v4768
//
// A SMALL THING MOVING FAST OVER A STILL BACKGROUND, IN THE GENERATOR. v4759's gate (fx/fsr/fsrFlowStill-selfcheck.mjs) left it
// unchecked: the flow's coarse blocks are mostly background, so they take the background's motion, and the windows below reach
// 12 px back from it. `retryRadius` (render/opticalFlow.mjs, v4768) searches again, wider, at the blocks the window did not
// explain -- on the mirror (render/flowCost-selfcheck.mjs, section 6) it takes a moving square's blocks from 56 of 236 right to
// 169, for 4 % more reads. What that is worth in a generated frame is measured here, on content the application's vectors
// cannot see: a picture on a still wall -- a screen, a projection -- with a textured square moving across it. The wall stands
// still, so every vector is zero; the square moves 16 or 12 px a frame. Three arms: the vectors, the flow, and the flow retrying
// within 8; graded against the midpoint, over the frame and over the square's pixels where it is at the midpoint.
// *** WEBGPU ONLY. *** render/opticalFlowTsl-selfcheck.mjs holds `retryRadius` to the mirror at every block on both backends.
"use strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runInEngineOrigin, webgpuSkipReason } from "../../tools/ship/webgpuHarness.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let fails = 0;
const ok = (label, cond, detail) => { if (!cond) fails++; console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}${detail ? "   " + detail : ""}`); };
const say = (s) => console.log(`  ----  ${s}`);
const D = 128;

console.log("\n1. ON THE DEVICE: a square moving across a picture on a still wall");
const skip = webgpuSkipReason();
if (skip) { console.log(`  SKIP  ${skip}`); console.log("  ----  *** NOT A PASS. *** Nothing here is static."); fails++; }
else {
    const r = await runInEngineOrigin({ engineRoot: ENG, timeoutMs: 300000, args: { D }, script: `async (a) => {
        const THREE = await import("/vendor/three-webgpu/three.webgpu.js"); const T = await import("/vendor/three-webgpu/three.tsl.js");
        const TT = await import("/render/temporalTsl.mjs"); const FG = await import("/fx/fsr/fsrFrameGenTsl.mjs");
        const out = {};
        for (const mode of ["webgpu"]) {
            try {
                const D = a.D, canvas = document.createElement("canvas"); canvas.width = 8; canvas.height = 8;
                const renderer = new THREE.WebGPURenderer({ canvas, antialias: false }); await renderer.init();
                const tgt = (n) => new THREE.RenderTarget(n, n, { type: THREE.FloatType, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter });
                const read = async (t, n) => { const px = await renderer.readRenderTargetPixelsAsync(t, 0, 0, n, n), s = Math.ceil(n / 16) * 16, o = new Float32Array(n * n * 4);
                    for (let y = 0; y < n; y++) for (let x = 0; x < n * 4; x++) o[y * n * 4 + x] = px[y * s * 4 + x]; return o; };
                const cl = (v) => Math.min(1, Math.max(0, v)), gl = TT.glClip(THREE, renderer);
                const stage = TT.makeMotionStage(THREE, T, { w: D, h: D, gl });
                const arms = { vectors: FG.makeFrameGen(THREE, T, { w: D, h: D }), flow: FG.makeFrameGen(THREE, T, { w: D, h: D, flow: {} }), retry: FG.makeFrameGen(THREE, T, { w: D, h: D, flow: { retryRadius: 8 } }) };
                const A = tgt(D), B = tgt(D), o2 = tgt(D), big = tgt(D * 4), older = tgt(D);
                // the pair's older depth, copied from the stage's pass at frame 0 and given as depthPrev (v4751): one stage pass a frame,
                // shared by the arms, and no priming generation
                const ortho = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1), keeps = [];
                const keeper = (st) => { const m0 = new THREE.NodeMaterial(); m0.fragmentNode = T.textureLoad(st.depth.texture, T.ivec2(T.int(T.screenCoordinate.x), T.int(T.screenCoordinate.y)));
                    m0.blending = THREE.NoBlending; m0.depthTest = false; m0.depthWrite = false; const sc = new THREE.Scene(); sc.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), m0)); keeps.push(m0);
                    return async () => { renderer.setRenderTarget(older); await renderer.renderAsync(sc, ortho); }; };
                const keep1 = keeper(stage);
                // and one built only to be asked what it was given: a ratio that is not the default
                const given = FG.makeFrameGen(THREE, T, { w: D, h: D, flow: { retryRadius: 4, retryRatio: 0.2 } });
                const o = { flags: { flow: arms.flow.opticalFlow.retryRadius, retry: arms.retry.opticalFlow.retryRadius, ratio: arms.retry.opticalFlow.retryRatio, given: [given.opticalFlow.retryRadius, given.opticalFlow.retryRatio] } };
                given.dispose();
                // the wall: one noise, still; the square: 24 px of another, moving with its own content. The camera looks at the
                // wall square on, one wall unit a pixel, so the square's place in pixels is its uniform's
                const S = 24, c0 = T.uniform(new THREE.Vector2(40, 60)), bright = T.uniform(0), m = new THREE.MeshBasicNodeMaterial();
                m.colorNode = T.Fn(() => { const p = T.uv().mul(D), wall = T.vec3(0.35).add(T.mx_noise_vec3(T.vec3(p.x.mul(0.19), p.y.mul(0.19), 0.37)).mul(0.3));
                    const q = p.sub(c0), inside = q.x.greaterThanEqual(0.0).and(q.x.lessThan(S)).and(q.y.greaterThanEqual(0.0)).and(q.y.lessThan(S));
                    const plain = T.vec3(0.35).add(T.mx_noise_vec3(T.vec3(q.x.mul(0.19), q.y.mul(0.19), 5.1)).mul(0.3));
                    const lit = T.vec3(0.55, 0.5, 0.45).add(T.mx_noise_vec3(T.vec3(q.x.mul(0.23), q.y.mul(0.23), 5.1)).mul(T.vec3(0.5, 0.45, 0.4))), sq = T.mix(plain, lit, bright);
                    return T.select(inside, sq, wall); })();
                const scene = new THREE.Scene(), wallMesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), m); scene.add(wallMesh);
                const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 10); cam.position.set(0, 0, 5); cam.lookAt(0, 0, 0); cam.updateMatrixWorld();
                for (const [cn, vx, vy, br] of [["16 px", 16, 4, 0], ["12 px", 12, -8, 0], ["16 px bright", 16, 4, 1]]) {
                    bright.value = br;
                    const setT = (k) => { c0.value.set(40 + vx * k, 60 + vy * k); };
                    setT(0); renderer.setRenderTarget(A); await renderer.renderAsync(scene, cam); setT(1); renderer.setRenderTarget(B); await renderer.renderAsync(scene, cam);
                    setT(0.5); renderer.setRenderTarget(big); await renderer.renderAsync(scene, cam); const t4 = await read(big, D * 4);
                    const truth = new Float32Array(D * D * 4); for (let y = 0; y < D; y++) for (let x = 0; x < D; x++) for (let c = 0; c < 3; c++) { let s = 0;
                        for (let sy = 0; sy < 4; sy++) for (let sx = 0; sx < 4; sx++) s += t4[((y * 4 + sy) * D * 4 + x * 4 + sx) * 4 + c]; truth[(y * D + x) * 4 + c] = s / 16; }
                    // the square at the midpoint. *** uv's v RUNS UP THE WALL AND THE READBACK'S ROWS RUN DOWN, *** as the flow's y does:
                    // a pixel in row r is at D - r in the wall's pixels. The first draft took the rows for the wall's and graded a
                    // mask four rows of which were on the square
                    const onSq = (i, k) => { const x = (i % D) + 0.5, y = D - (Math.floor(i / D) + 0.5), sx = 40 + vx * k, sy = 60 + vy * k; return x >= sx && x < sx + S && y >= sy && y < sy + S; };
                    const sqm = Uint8Array.from({ length: D * D }, (_, i) => (onSq(i, 0.5) ? 1 : 0));
                    const ps = (img, mk) => { let q = 0, n = 0; for (let i = 0; i < D * D; i++) { if (mk && !mk[i]) continue; n++; for (let c = 0; c < 3; c++) q += (cl(img[i * 4 + c]) - cl(truth[i * 4 + c])) ** 2; } return 10 * Math.log10(1 / (q / (n * 3))); };
                    const ghm = Uint8Array.from({ length: D * D }, (_, i) => ([0, 0.5, 1].some((k) => onSq(i, k)) ? 1 : 0));
                    const c = { sqPx: sqm.reduce((q, v) => q + v, 0) };
                    setT(0); await stage.render(renderer, scene, cam); await keep1(); setT(1); await stage.render(renderer, scene, cam);
                    for (const [an, g] of Object.entries(arms)) {
                        await g.generate(renderer, { prev: A.texture, cur: B.texture, motion: stage.motion.texture, depth: stage.depth.texture, depthPrev: older.texture }, o2);
                        const img = await read(o2, D); c[an] = { all: ps(img), sq: ps(img, sqm), ghost: ps(img, ghm) };
                        if (g.opticalFlow) { const F = g.opticalFlow, fl = await read(F.target, Math.max(F.bw, F.bh)); let k = 0, n = 0;
                            for (let by = 0; by < F.bh; by++) for (let bx = 0; bx < F.bw; bx++) { const X = bx * 8, Y = D - by * 8 - 8; if (X >= 40 + vx && X + 8 <= 40 + vx + S && Y >= 60 + vy && Y + 8 <= 60 + vy + S) { n++;
                                const i = (by * Math.max(F.bw, F.bh) + bx) * 4; if (Math.hypot(fl[i] - vx, fl[i + 1] + vy) < 0.75) k++; } }
                            c[an].blocks = k + "/" + n; }
                    }
                    // the vectors really are zero: the wall does not move
                    const mv = await read(stage.motion, D); let mx = 0; for (let i = 0; i < D * D; i++) mx = Math.max(mx, Math.abs(mv[i * 4]), Math.abs(mv[i * 4 + 1]));
                    c.maxVector = mx; o[cn] = c;
                }
                // 2. fx/fsr/fsrFlowGrid-selfcheck.mjs's "scroll": the knot turning in front of a wall whose texture scrolls 3 px a frame,
                // the camera still -- graded over the frame and over the wall's clear interior, that gate's mask
                {
                    const sc2 = new THREE.Scene(); sc2.background = new THREE.Color(0.02, 0.03, 0.06);
                    const knot = new THREE.Mesh(new THREE.TorusKnotGeometry(0.9, 0.28, 220, 24), new THREE.MeshNormalNodeMaterial()); sc2.add(knot);
                    const scroll = T.uniform(0.0), wm = new THREE.MeshBasicNodeMaterial();
                    wm.colorNode = T.Fn(() => { const q = T.vec2(T.uv().x.mul(14.0).add(scroll), T.uv().y.mul(8.0)).mul(1.6);
                        const n3 = T.mx_noise_vec3(T.vec3(q.x, q.y, 0.37)).add(T.mx_noise_vec3(T.vec3(q.x.mul(2.1), q.y.mul(2.1), 4.1)).mul(0.5));
                        return T.vec3(0.5).add(n3.mul(0.3)); })();
                    const wall = new THREE.Mesh(new THREE.PlaneGeometry(14, 8), wm); wall.position.z = -2; sc2.add(wall);
                    const pc = new THREE.PerspectiveCamera(40, 1, 0.1, 50), st2 = TT.makeMotionStage(THREE, T, { w: D, h: D, gl, camera: true });
                    const setT = (k) => { const t = k / 60 * 6; knot.rotation.set(0.4 + t * 0.4, 0.6 + t * 0.6, 0); knot.updateMatrixWorld(); scroll.value = k * 0.12;
                        pc.position.set(0, 0.6, 5.2); pc.lookAt(0, 0, 0); pc.updateMatrixWorld(); };
                    setT(0); renderer.setRenderTarget(A); await renderer.renderAsync(sc2, pc); setT(1); renderer.setRenderTarget(B); await renderer.renderAsync(sc2, pc);
                    setT(0.5); renderer.setRenderTarget(big); await renderer.renderAsync(sc2, pc); const t4 = await read(big, D * 4);
                    const truth = new Float32Array(D * D * 4); for (let y = 0; y < D; y++) for (let x = 0; x < D; x++) for (let c = 0; c < 3; c++) { let s = 0;
                        for (let sy = 0; sy < 4; sy++) for (let sx = 0; sx < 4; sx++) s += t4[((y * 4 + sy) * D * 4 + x * 4 + sx) * 4 + c]; truth[(y * D + x) * 4 + c] = s / 16; }
                    const ps = (img, mk) => { let q = 0, n = 0; for (let i = 0; i < D * D; i++) { if (mk && !mk[i]) continue; n++; for (let c = 0; c < 3; c++) q += (cl(img[i * 4 + c]) - cl(truth[i * 4 + c])) ** 2; } return 10 * Math.log10(1 / (q / (n * 3))); };
                    wall.visible = false; const bgc = sc2.background; sc2.background = new THREE.Color(0, 0, 0);
                    setT(0); renderer.setRenderTarget(o2); await renderer.renderAsync(sc2, pc); const k0 = await read(o2, D);
                    setT(1); renderer.setRenderTarget(o2); await renderer.renderAsync(sc2, pc); const k1 = await read(o2, D);
                    wall.visible = true; sc2.background = bgc;
                    const clear = Uint8Array.from({ length: D * D }, (_, i) => k0[i * 4] + k0[i * 4 + 1] + k0[i * 4 + 2] === 0 && k1[i * 4] + k1[i * 4 + 1] + k1[i * 4 + 2] === 0 ? 1 : 0);
                    const inner = Uint8Array.from({ length: D * D }, (_, i) => { const x = i % D, y = (i / D) | 0; if (x < 6 || y < 6 || x >= D - 6 || y >= D - 6) return 0;
                        for (let dy = -6; dy <= 6; dy++) for (let dx = -6; dx <= 6; dx++) if (!clear[(y + dy) * D + x + dx]) return 0; return 1; });
                    const c = { innerPx: inner.reduce((q, v) => q + v, 0) }, keep2 = keeper(st2);
                    setT(0); await st2.render(renderer, sc2, pc); await keep2(); setT(1); await st2.render(renderer, sc2, pc);
                    for (const an of ["flow", "retry"]) { const g = arms[an];
                        await g.generate(renderer, { prev: A.texture, cur: B.texture, motion: st2.motion.texture, depth: st2.depth.texture, depthPrev: older.texture, camera: st2.camera.texture }, o2);
                        const img = await read(o2, D), F = g.opticalFlow, fl = await read(F.target, F.bw); c[an] = { all: ps(img), wall: ps(img, inner), field: Array.from(fl) }; }
                    let changed = 0; for (let q = 0; q < c.flow.field.length / 4; q++) if (Math.abs(c.flow.field[q * 4] - c.retry.field[q * 4]) > 1e-4 || Math.abs(c.flow.field[q * 4 + 1] - c.retry.field[q * 4 + 1]) > 1e-4) changed++;
                    c.changed = changed; c.blocks = c.flow.field.length / 4;
                    { const bw = Math.sqrt(c.blocks); c.changedAt = []; for (let q = 0; q < c.blocks; q++) if (Math.abs(c.flow.field[q * 4] - c.retry.field[q * 4]) > 1e-4) { const bx = q % bw, by = (q / bw) | 0; let inn = 0; for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) inn += inner[(by * 8 + y) * D + bx * 8 + x];
                        const nb = []; for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) { const k = (by + j) * bw + bx + i; nb.push(c.flow.field.slice(k * 4, k * 4 + 3).map((v) => +v.toFixed(2)).join(",")); }
                        c.changedAt.push({ bx, by, inn, flow: c.flow.field.slice(q * 4, q * 4 + 3), retry: c.retry.field.slice(q * 4, q * 4 + 3), nb }); } }
                    delete c.flow.field; delete c.retry.field;
                    o.scroll = c; st2.dispose();
                }
                for (const g of Object.values(arms)) g.dispose(); stage.dispose(); for (const t of [A, B, o2, big, older]) t.dispose(); for (const m0 of keeps) m0.dispose();
                out[mode] = o; renderer.dispose();
            } catch (err) { out[mode] = { err: String(err && err.stack || err).slice(0, 700) }; }
        }
        return out;
    }` });
    ok("the harness ran both motions", r.ok && r.result && !r.result.webgpu.err, r.ok ? `webgpu ${r.result.webgpu.err || "ok"}` : (r.reason || (r.pageErrors || []).join("; ")));
    if (r.ok && r.result && !r.result.webgpu.err) {
        const o = r.result.webgpu, f = (v) => v.toFixed(2), d = (x, y) => (x - y >= 0 ? "+" : "") + (x - y).toFixed(2);
        for (const cn of ["16 px", "12 px", "16 px bright"]) say(`${cn}: the square's ${o[cn].sqPx} pixels -- vectors ${f(o[cn].vectors.sq)} dB, the flow ${f(o[cn].flow.sq)}, retrying ${f(o[cn].retry.sq)}; where it was, is and will be ${f(o[cn].vectors.ghost)}, ${f(o[cn].flow.ghost)}, ${f(o[cn].retry.ghost)}; the frame ${f(o[cn].vectors.all)}, ${f(o[cn].flow.all)}, ${f(o[cn].retry.all)}; its blocks right ${o[cn].flow.blocks} and ${o[cn].retry.blocks}`);
        ok(`  [webgpu] the generator asks for the retry only when told: ${JSON.stringify(o.flags).replace(/"/g, "")} -- and the wall's vectors are zero, largest ${Math.max(...["16 px", "12 px", "16 px bright"].map((c) => o[c].maxVector))}`,
           o.flags.flow === null && o.flags.retry === 8 && o.flags.ratio === 0.3 && o.flags.given[0] === 4 && o.flags.given[1] === 0.2 && ["16 px", "12 px", "16 px bright"].every((c) => o[c].maxVector === 0),
           "fx/fsr/fsrFrameGenTsl.mjs passes { retryRadius: flow.retryRadius ?? null, retryRatio: flow.retryRatio } to render/opticalFlowTsl.mjs; the square is content the application's vectors cannot see");
        const a = o["16 px"], b = o["12 px"], c = o["16 px bright"];
        ok(`*** [webgpu] the retry finds the square the flow lost, and the generated frame shows it: at 16 px a frame its blocks right ${a.flow.blocks} to ${a.retry.blocks}, its pixels ${d(a.retry.sq, a.flow.sq)} dB and the frame ${d(a.retry.all, a.flow.all)}; at 12 px ${b.flow.blocks} to ${b.retry.blocks}, ${d(b.retry.sq, b.flow.sq)} and ${d(b.retry.all, b.flow.all)} ***`,
           a.flow.blocks.startsWith("0/") && a.retry.blocks === "9/9" && b.flow.blocks.startsWith("0/") && b.retry.blocks === "4/4" && a.retry.sq - a.flow.sq > 8 && a.retry.all - a.flow.all > 2 && b.retry.sq - b.flow.sq > 1 && b.retry.all - b.flow.all > 0.5,
           "a square in the wall's own statistics: its coarse blocks are mostly wall and take the wall's standing still, and its own blocks' windows reach 12 px from that. Without the flow's answer the reconciliation keeps the vectors, which say it stands still");
        ok(`  [webgpu] ...and where the flow already sees it -- a bright square, which its coarse blocks follow, ${c.flow.blocks} right without the retry -- the square is where it was, ${d(c.retry.sq, c.flow.sq)} dB, and the frame ${d(c.retry.all, c.flow.all)}`,
           c.flow.blocks === "9/9" && Math.abs(c.retry.sq - c.flow.sq) < 0.05 && Math.abs(c.retry.all - c.flow.all) < 0.2,
           "the blocks it explains do not retry; the ones that do are where the square uncovers the wall and nothing explains them");

        console.log("\n2. ON THE DEVICE: WHY IT IS NOT THE DEFAULT -- fx/fsr/fsrFlowGrid-selfcheck.mjs's scrolling wall");
        const w = o.scroll, j = w.changedAt[0] || { flow: [], retry: [], nb: [] }, v = (a) => `(${a.slice(0, 2).map((x) => x.toFixed(1)).join(", ")}) at ${(a[2] ?? 0).toFixed(2)}`;
        say(`the block it changed, (${j.bx}, ${j.by}), ${j.inn} of its 64 pixels in the interior: ${v(j.flow)} without the retry and ${v(j.retry)} with it; the wall beside it ${j.nb[3] ? v(j.nb[3].split(",").map(Number)) : "-"}`);
        say(`the knot in front of a wall scrolling 3 px a frame: the frame ${f(w.flow.all)} dB with the flow, ${f(w.retry.all)} retrying; the wall's clear interior (${w.innerPx} px) ${f(w.flow.wall)} and ${f(w.retry.wall)}; the retry changed ${w.changed} of ${w.blocks} blocks`);
        ok(`*** [webgpu] on a wall whose texture scrolls behind a turning knot the retry changes ${w.changed} block of ${w.blocks} and costs the wall's clear interior ${d(w.retry.wall, w.flow.wall)} dB, the frame ${d(w.retry.all, w.flow.all)} -- so \`flow: { retryRadius: 8 }\` is there and is not the default ***`,
           w.changed >= 1 && w.changed <= 4 && w.retry.wall - w.flow.wall < -3,
           "a block at the knot's edge, the knot turning and the wall beside it moving 3 px: its window answered neither, and the retry found an offset that scores lower and is neither either, at a higher confidence -- which the reconciliation reads 3 x 3 blocks about each pixel, so it reaches the wall's interior. A retry takes the lowest score, and where two motions share a block the lowest score is not the motion. " +
           "MEASURED ONCE when this round was built, the eleven gates that generate with the flow run with the retry the default: three go red -- fx/fsr/fsrFlowGrid-selfcheck.mjs (this wall's interior 53.47 dB to 42.72), " +
           "fx/fsr/fsrFrameGenFlow-selfcheck.mjs (its gain over the vectors there +12.38 to +1.63) and fx/fsr/fsrFlowSeed-selfcheck.mjs (the seed's +0.47 on a reflection to -0.01, the flow alone having risen 0.48 to meet it); a shadow on a plain floor " +
           "loses 1.80 dB where it changed and a lens's backdrop 0.30 to 0.87; the belt's highlight at 16 px gains 0.25, fine glass 0.77, sparks 0.81");
    }
}

// ---- v4768 SABOTAGE LOG ----------------------------------------------------------------------------------------
// Against render/opticalFlow.mjs, in render/flowCost-selfcheck.mjs and render/opticalFlowTsl-selfcheck.mjs (the parity row, both
// backends): V1 the retry never runs -> 4, 4; V2 the retry at the coarsest level too -> 1, 0 (the count); V3 the energy across
// only, counted as two -> 0, 2; V4 the second window about standing still, not the guess -> 1, 2; V5 no eight about the winner
// -> 1, 2; V6 the window already searched searched again -> 1, 0 (the count only: a candidate scored twice ties itself); V7 a tie
// taken in the second window -> 0, 2; V8 the ratio 0.5 by default -> 4, 2.
// Against render/opticalFlowTsl.mjs, in render/opticalFlowTsl-selfcheck.mjs: T1 the retry never runs -> 4; T2 the energy against
// the older frame -> 4; T3 the second window about the window's winner, not the guess -> 4; T5 the ratio ignored -> 2; T7 the
// retry's winner not kept -> 4. *** T4 AND T6 ARE EQUIVALENT, AND WHY. *** T4 walks the second window over the first one's edge
// as well (>= for >), and T6 scores the eight's centre: every candidate either adds was scored already, and a score equal to
// one already seen is never STRICTLY better than the best. They cost the device reads, which no gate times -- the mirror's V6 is
// the same mutant, and there the count is what catches it.
// *** THE PARITY CASES FIRST PASSED A RATIO OF 0.5 TO BOTH MODULES, SO NEITHER MODULE'S DEFAULT WAS COMPARED. *** V8 -- the
// mirror's default back at 0.5 -- was 0 red in the parity row until the cases left the ratio out; they do now, and one case
// gives 0.5, so both a default and a given ratio are held.
// Against render/flowCost.mjs: K1 the energy not counted -> 1; K2 the second window counted whole -> 2; K3 the eight not counted
// -> 1. Against fx/fsr/fsrFrameGenTsl.mjs, here: G1 the retry not asked for -> 3; G2 the ratio not passed -> 1, which a
// generator built with a ratio that is not the default is here to see.
console.log(fails ? "\nFAIL -- " + fails + " check(s)" : "\nALL GREEN");
console.log("unchecked here: a 16 px square, which is a level-1 block's width -- found at half its placements on the mirror (render/flowCost-selfcheck.mjs, " +
    "section 6) and at none of this gate's; motion past 16 px a frame at level 1, which the retry does not reach; and what a frame's retries cost on a GPU, " +
    "which render/flowCost.mjs counts and does not time.");
process.exitCode = fails ? 1 : 0;
