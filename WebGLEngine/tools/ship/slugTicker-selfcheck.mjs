#!/usr/bin/env node
// WebGLEngine/tools/ship/slugTicker-selfcheck.mjs -- v4497
//
// THE 3-D TICKER OF SLUG GLYPHS AS BOX3D BODIES (task 43), GATED ON THE PLUMBING. render/slugTicker.mjs turns a laid-out
// string into one box3d box per inked glyph, drives them along a conveyor with a wrap, and draws each through the
// projective path task 42 held with rows = P * V * B. Section 1 holds the 4x4 helpers against hand cases and rowsFor
// against render/slugProjective.mjs's perspectiveRows for the same placement (two routes to one matrix); glyphBodies'
// extents against the glyph bboxes and each one-glyph stream centred at the origin. Section 2 runs the world in node
// (physics/box3d/box3dNode.mjs, the same wasm the page loads) through the adapter: two runs hash the same, every
// transform finite, every body resting on the floor within the lane after 900 ticks, the conveyor holding the mean
// x velocity to the plan's speed, wraps counted. Section 3 draws a 300-tick snapshot on both backends -- one batch
// per glyph, its own rows -- and holds the frame to slugEval through the perspective-correct model per body (the
// texcoord captured and fitted as the flat gate does), and the two backends to each other.
//
// MEASURED AT v4497: 33 glyph bodies from a 41-character string at 0.22 units an em; 900 ticks in node hash 3484815060 twice
// over, 116 wraps, every body resting between 0.031 and 0.104 (a tumbled glyph lies on whichever face is down), mean conveyor
// velocity 1.10 of the plan's 1.2 (friction takes its share inside each step). The tick-300 snapshot on both backends: the
// perspective-correct model per body reproduces the fragment's texcoord to 2.3e-7 em over 1,485 lit fragments at a 1/16 px snap
// and the frame is within 1 of 255 of slugEval through it; the backends within 1 of each other.
//
// TWO THINGS THE FIRST RUN FOUND THAT WERE NOT THE TICKER'S: (1) *** gfx/device.js's WebGPU pass applied only the LAST uniform
// write of a frame to every draw in it *** -- queue.writeBuffer lands before the command buffer, so 33 bodies drawn with 33
// matrices all drew at the 33rd (the model's texcoords matched at 36 fragments and 22 lit fragments had no triangle at all).
// Fixed in the device (a uniform buffer per draw that follows one, from a pool) and held by tools/ship/deviceUniformsPerDraw-
// selfcheck.mjs; ev/esShipLabels.js's device path had been drawing every label at the last label's rows on WebGPU since v4463.
// (2) The node-built vertex streams carried the node atlas's glyph locs (logWidth 11) into a browser atlas of logWidth 12:
// texcoords matched to 2e-7 em and the ink was garbage (worst 242). The browser builds its own bodies now; only rows cross.
// And a third, smaller: a 0.95 red tint in the bodies' default colour read as 242 of 255 against a coverage key -- white by default.
//
// SABOTAGE (v4497): A  mat4.fromPosQuat with one off-diagonal sign flipped                                    -> FIRST exit=1 with only the two frame rows red (worst 64 on
//                      2 pixels): the quarter-turn row reads column 0 alone and never saw the flipped term. The orthonormality row on a general
//                      quaternion was added; re-run -> exit=1, red 3: that row by name and the two frames
//                   B  rowsFor keeping the z column in the w slot                                             -> exit=1, red 6: both rows rows, the model over 0 fragments, both frames
//                   C  glyphBodies building each glyph's stream at its layout position, not centred            -> exit=1, red 1: the centred-quad row
//                   D  tickTicker never wrapping                                                               -> exit=1, red 6: the rest row (bodies past the lane), the conveyor row (no
//                      wraps), and a blank frame on both backends (every body has left the camera's view by tick 300)
//
// Run: node tools/ship/slugTicker-selfcheck.mjs      (~60 s)
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runInEngineOrigin, webgpuSkipReason } from "./webgpuHarness.mjs";
import { nullBackend } from "../../gfx/device.js";
import { parseFont } from "../../text/slugFont.js";
import { slugRender } from "../../text/slugEval.js";
import { SlugFontDevice } from "../../render/slugDevice.mjs";
import { perspectiveRows, project, quadTriangles, quadsOf } from "../../render/slugProjective.mjs";
import { mat4, rowsFor, TICKER, glyphBodies, worldFromModule, spawnTicker, tickTicker, cameraFor, bodyRows } from "../../render/slugTicker.mjs";
import { initNode, mod } from "../../physics/box3d/box3dNode.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let fails = 0;
const ok = (label, cond, detail) => { if (!cond) fails++; console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}${detail ? "   " + detail : ""}`); };
const report = (s) => console.log(`  ----  ${s}`);
const sec = (s) => console.log("\n" + s);
const W = 320, H = 150, TOL = 2, SUBPIXEL_CANDIDATES = [4, 8, 16, 32, 64, 128, 256, Infinity], SNAP_TICK = 300;
const CHARS = " " + TICKER.text + "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
const font = parseFont(new Uint8Array(fs.readFileSync(path.join(ENG, "vendor/fonts/IBMPlexSerif-Regular.ttf"))));
const nb = nullBackend();
let fd = new SlugFontDevice(nb, font, CHARS, { logWidth: 11 });
const near = (a, b, eps = 1e-9) => Math.abs(a - b) < eps;

sec("1. HEADLESS: the matrices, the rows, the bodies");
{
    const q90 = [0, 0, Math.SQRT1_2, Math.SQRT1_2];                                       // 90 degrees about z
    const R = mat4.fromPosQuat([1, 2, 3], q90), v = mat4.apply(R, [1, 0, 0]);
    ok("fromPosQuat: a quarter turn about z sends x to y and carries the position", near(v[0], 1) && near(v[1], 3) && near(v[2], 3) && near(v[3], 1), v.map((x) => x.toFixed(6)).join(","));
    // sabotage A (a sign flipped in one off-diagonal term) passed the quarter-turn row -- the x axis only reads column 0 -- and was
    // seen by two pixels of the frame; a rotation matrix is orthonormal, and a flipped term is not, so hold that on a general quaternion
    const qg = (() => { const a = [0.3, -0.5, 0.8], l = Math.hypot(...a), th = 1.1; return [a[0] / l * Math.sin(th / 2), a[1] / l * Math.sin(th / 2), a[2] / l * Math.sin(th / 2), Math.cos(th / 2)]; })();
    const Rg = mat4.fromPosQuat([0, 0, 0], qg); let ortho = 0;
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) { let d = 0; for (let k = 0; k < 3; k++) d += Rg[i * 4 + k] * Rg[j * 4 + k]; ortho = Math.max(ortho, Math.abs(d - (i === j ? 1 : 0))); }
    const det = Rg[0] * (Rg[5] * Rg[10] - Rg[6] * Rg[9]) - Rg[1] * (Rg[4] * Rg[10] - Rg[6] * Rg[8]) + Rg[2] * (Rg[4] * Rg[9] - Rg[5] * Rg[8]);
    ok("fromPosQuat on a general quaternion is orthonormal with determinant +1, and rotates the axis it was built about onto itself", ortho < 1e-12 && near(det, 1, 1e-12) && (() => { const a = [0.3, -0.5, 0.8], v = mat4.apply(Rg, a); return near(v[0], a[0], 1e-12) && near(v[1], a[1], 1e-12) && near(v[2], a[2], 1e-12); })(), `orthonormality ${ortho.toExponential(1)}, det ${det.toFixed(6)}`);
    ok("fromPosQuat with the identity quaternion is a translation; multiply and apply agree with hand arithmetic", JSON.stringify(mat4.fromPosQuat([4, 5, 6], [0, 0, 0, 1])) === JSON.stringify(mat4.translation(4, 5, 6)) && near(mat4.apply(mat4.multiply(mat4.translation(1, 0, 0), mat4.scale(2)), [1, 1, 1])[0], 3));
    const V = mat4.lookAt([0, 0, 5], [0, 0, 0]), e = mat4.apply(V, [0, 0, 0]);
    ok("lookAt from +z puts the target 5 in front of the eye (eye space -z), and the eye at the origin", near(e[2], -5) && near(e[0], 0) && near(e[1], 0) && near(mat4.apply(V, [0, 0, 5])[2], 0));
    // two routes to one placement: slugProjective.perspectiveRows against P * M through rowsFor
    const cfg = { yaw: 0.6, tilt: 0.5, dist: 180, ox: -101, oy: -6 }, rowsA = perspectiveRows(W, H, cfg);
    const cy = Math.cos(cfg.yaw), sy = Math.sin(cfg.yaw), ct = Math.cos(cfg.tilt), st = Math.sin(cfg.tilt);
    const M = [cy, 0, 0, cy * cfg.ox, 0, ct, 0, ct * cfg.oy, sy, st, 1, sy * cfg.ox + st * cfg.oy - cfg.dist, 0, 0, 0, 1];
    const rowsB = rowsFor(mat4.multiply(mat4.perspective(1.0, W / H, 1, 10000), M));
    let worst = 0; for (const [x, y] of [[0, 0], [202, 0], [0, 22], [202, 22]]) { const a = project(rowsA, x, y, W, H), b = project(rowsB, x, y, W, H); worst = Math.max(worst, Math.abs(a.sx - b.sx), Math.abs(a.sy - b.sy), Math.abs(a.w - b.w)); }
    ok("*** rowsFor(P * M) lands every corner where slugProjective's perspectiveRows does for the same placement -- two routes to one matrix ***", worst < 1e-6, `worst ${worst.toExponential(2)}`);
    ok("rowsFor drops the z column: every third slot is 0 and the w slots are the 4x4's last column (to f32)", Array.from(rowsB).every((v, i) => i % 4 !== 2 || v === 0) && near(rowsB[15], mat4.multiply(mat4.perspective(1.0, W / H, 1, 10000), M)[15], 1e-4));

    const gb = glyphBodies(font, (gi) => fd.entryFor(gi));
    const inked = gb.laid.glyphs.filter((g) => { const e = fd.entryFor(g.glyphIndex); return e && !e.empty; });
    ok(`glyphBodies makes one body per inked glyph (${gb.bodies.length}) with half extents from the glyph bbox at the size and the ticker depth`,
        gb.bodies.length === inked.length && gb.bodies.every((b, i) => { const e = fd.entryFor(inked[i].glyphIndex), s = inked[i].size; return near(b.half[0], (e.bbox.x1 - e.bbox.x0) / 2 * s, 1e-9) && near(b.half[1], (e.bbox.y1 - e.bbox.y0) / 2 * s, 1e-9) && b.half[2] === TICKER.depth; }));
    ok("every glyph's stream is one quad CENTRED at the origin: its corners span [-hx, hx] x [-hy, hy]", gb.bodies.every((b) => { const q = quadsOf(b.built); if (q.length !== 1) return false; const xs = q[0].corners.map((c) => c.pos[0]), ys = q[0].corners.map((c) => c.pos[1]); return near(Math.min(...xs), -b.half[0], 1e-5) && near(Math.max(...xs), b.half[0], 1e-5) && near(Math.min(...ys), -b.half[1], 1e-5) && near(Math.max(...ys), b.half[1], 1e-5); }));
    ok("the loop is longer than the string and at least the lane's double, so the head never wraps into its own tail", gb.plan.loop >= gb.laid.width * TICKER.size + TICKER.lane && gb.plan.loop >= 2 * TICKER.lane, `loop ${gb.plan.loop.toFixed(2)}, string ${(gb.laid.width * TICKER.size).toFixed(2)}`);
}

let snapshot = null, gbMain = null;
sec("2. THE WORLD IN NODE: the same wasm the page loads, through the adapter");
{
    const st = await initNode();
    ok("the box3d wasm loads in node", st.ready, st.reason || "");
    if (st.ready) {
        const m = mod(); gbMain = glyphBodies(font, (gi) => fd.entryFor(gi));
        const runs = [];
        for (let run = 0; run < 2; run++) {
            const w = worldFromModule(m); const { ids } = spawnTicker(w, gbMain.bodies, gbMain.plan);
            let wrapped = 0, xf = null, vxSum = 0, vxN = 0;
            for (let t = 1; t <= 900; t++) { const r = tickTicker(w, ids, gbMain.plan); xf = r.xf; wrapped += r.wrapped; if (t === SNAP_TICK && run === 0) snapshot = { xf: Array.from(xf), ids: ids.slice() };
                if (t > 600) { const v = w.readVelocities(); for (const i of ids) { vxSum += v[i * 3]; vxN++; } } }
            runs.push({ ids, xf, wrapped, hash: w.stateHash(), meanVx: vxSum / vxN }); w.destroy();
        }
        const [a, b] = runs;
        ok("two runs of 900 ticks hash the same: the ticker is deterministic (lockstep-safe)", a.hash === b.hash && a.wrapped === b.wrapped, `hash ${a.hash}, ${a.wrapped} wraps`);
        ok("every transform is finite", a.xf.every(Number.isFinite) && a.xf.length === (a.ids.length + 1) * 7);
        const ys = a.ids.map((i) => a.xf[i * 7 + 1]), xs = a.ids.map((i) => a.xf[i * 7]);
        report(`after 900 ticks: y from ${Math.min(...ys).toFixed(3)} to ${Math.max(...ys).toFixed(3)}, x from ${Math.min(...xs).toFixed(2)} to ${Math.max(...xs).toFixed(2)}, ${a.wrapped} wraps, mean vx over the last 300 ticks ${a.meanVx.toFixed(3)} against the plan's ${TICKER.speed}`);
        // a tumbled glyph lies on whichever face is down, so its height is the SMALLEST half extent at least and the largest plus a bounce
        ok("every glyph body rests on or just above the floor (y between its smallest half extent and its largest plus a quarter unit) and inside the lane", a.ids.every((i, k) => { const y = a.xf[i * 7 + 1], hs = gbMain.bodies[k].half; return y >= Math.min(...hs) - 1e-3 && y < Math.max(...hs) + 0.25 && a.xf[i * 7] <= TICKER.lane + 1e-6 && a.xf[i * 7] >= -gbMain.plan.loop; }));
        // the conveyor sets vx every tick and the solver's friction and collisions take some back inside the step: measured 1.10 of 1.2 (8%), held to 15%
        ok("the conveyor holds the mean x velocity within 15% of the plan's speed (the solver's friction takes its share inside each step), and bodies wrapped", Math.abs(a.meanVx - TICKER.speed) < TICKER.speed * 0.15 && a.wrapped > 10);
        ok("a snapshot at tick 300 was taken for the frame", !!snapshot && snapshot.xf.length === (snapshot.ids.length + 1) * 7);
    }
}

const bitsToF32 = (px, i, j) => { const o = (j * W + i) * 4; return new Float32Array(new Uint8Array([px[o], px[o + 1], px[o + 2], px[o + 3]]).buffer)[0]; };
function modelTris(Q) {
    const PV = cameraFor(W, H), tris = [];
    gbMain.bodies.forEach((b, k) => { const rows = bodyRows(PV, snapshot.xf, snapshot.ids[k]); for (const q of quadsOf(b.built)) tris.push(...quadTriangles(q, rows, W, H, Q).tris.map((t) => ({ ...t, e: fd.entryFor(b.glyphIndex) }))); });
    return tris.reverse();
}
function fit(cap) {
    const results = [];
    for (const Q of SUBPIXEL_CANDIDATES) { const tris = modelTris(Q); let worst = 0, n = 0, orphan = 0;
        for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) { const mtx = bitsToF32(cap.tx, i, j); if (mtx === 0) continue; const x = i + 0.5, y = j + 0.5; let hit = false;
            for (const t of tris) { if (!t.inside(x, y)) continue; const [tx, ty] = t.at(x, y); n++; hit = true; worst = Math.max(worst, Math.abs(tx - mtx), Math.abs(ty - bitsToF32(cap.ty, i, j))); break; } if (!hit) orphan++; }
        results.push({ Q, worst, n, orphan }); }
    results.sort((a, b) => a.worst - b.worst); return { best: results[0], all: results };
}
function expectedFrame(Q) {
    const tris = modelTris(Q), out = new Float32Array(W * H);
    for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) { const x = i + 0.5, y = j + 0.5; let acc = 0;
        for (const t of tris) { if (!t.inside(x, y)) continue; const [tx, ty] = t.at(x, y); const x0 = (i & ~1) + 0.5, y0 = (j & ~1) + 0.5, a = t.at(x0, y0), b = t.at(x0 + 1, y0), c = t.at(x0, y0 + 1);
            const cov = slugRender(fd.atlas, t.e, tx, ty, [Math.abs(b[0] - a[0]) + Math.abs(c[0] - a[0]), Math.abs(b[1] - a[1]) + Math.abs(c[1] - a[1])]); acc = cov + acc * (1 - cov); }
        out[j * W + i] = acc; }
    return out;
}

sec("3. THE FRAME, ON BOTH BACKENDS: the tick-300 snapshot drawn one body at a time, against the perspective-correct model per body");
{
    const skip = webgpuSkipReason();
    if (skip || !snapshot) { console.log(`  SKIP  ${skip || "no snapshot"}`); report("*** NOT A PASS. ***"); fails++; }
    else {
        const PV = cameraFor(W, H);
        // THE BROWSER BUILDS ITS OWN BODIES: a first draft shipped the node-built streams over, and their glyph locs and band
        // transforms were the node atlas's (logWidth 11) against the browser's (12) -- the texcoords matched the model to 2e-7 em
        // and every glyph was garbage ink. What crosses is the rows per body, nothing that names an atlas texel.
        const rowsPerBody = gbMain.bodies.map((b, k) => Array.from(bodyRows(PV, snapshot.xf, snapshot.ids[k])));
        const r = await runInEngineOrigin({ engineRoot: ENG, args: { W, H, CHARS, rowsPerBody }, script: `async (a) => {
            const { requestDevice } = await import("/gfx/device.js");
            const { parseFont } = await import("/text/slugFont.js");
            const M = await import("/render/slugDevice.mjs");
            const { glyphBodies } = await import("/render/slugTicker.mjs");
            const font = parseFont(await (await fetch("/vendor/fonts/IBMPlexSerif-Regular.ttf")).arrayBuffer());
            const { W, H, CHARS, rowsPerBody } = a; const out = {};
            for (const backend of ["webgpu", "webgl2"]) {
                const cv = document.createElement("canvas"); cv.width = W; cv.height = H;
                const dev = await requestDevice(cv, { backend, offscreen: backend === "webgpu" });
                const o = { backend: dev.backend, cap: {}, errs: [] };
                const fd = new M.SlugFontDevice(dev, font, CHARS); o.logWidth = fd.logWidth;
                const gb = glyphBodies(font, (gi) => fd.entryFor(gi)); o.bodies = gb.bodies.length;
                if (gb.bodies.length !== rowsPerBody.length) { o.errs.push("body count " + gb.bodies.length + " against " + rowsPerBody.length); out[backend] = o; continue; }
                const batches = gb.bodies.map((bd, k) => { const b = new M.SlugDeviceBatch(fd); b.setBuilt(bd.built); return { b, rows: new Float32Array(rowsPerBody[k]) }; });
                const fr = await dev.frame(({ pass }) => { pass.clear([0, 0, 0, 1]); for (const q of batches) q.b.draw(pass, q.rows, [W, H]); }, { read: true }); o.pixels = Array.from(fr.pixels);
                for (const what of ["tx", "ty"]) {
                    let d; try { d = M.slugCaptureDesc(fd.logWidth, what); } catch (e) { o.errs.push(what + ": " + e.message); continue; }
                    const pipe = dev.pipeline(d); if (pipe.compiled) { const err = await pipe.compiled; if (err) { o.errs.push(what + ": " + err); continue; } }
                    const cf = await dev.frame(({ pass }) => { pass.clear([0, 0, 0, 0]); pass.use(pipe); for (const q of batches) { for (let i = 0; i < 4; i++) pass.uniform("m" + i, q.rows.subarray(i * 4, i * 4 + 4)); pass.uniform("viewport", [W, H]);
                        pass.texture("curveTexture", fd.curveTexture, 0); pass.texture("bandTexture", fd.bandTexture, 1); pass.vertices(q.b.vb); pass.indices(q.b.ib); pass.drawIndexed(q.b.indexCount); } }, { read: true });
                    o.cap[what] = Array.from(cf.pixels);
                }
                for (const q of batches) q.b.destroy(); fd.destroy(); dev.destroy(); out[backend] = o;
            }
            return out;
        }` });
        ok(`*** both backends drew the ${rowsPerBody.length} glyph bodies of the snapshot and captured the texcoords ***`, r.ok && r.result && r.result.webgpu && r.result.webgl2 && r.result.webgpu.errs.length === 0 && r.result.webgl2.errs.length === 0, r.ok ? (r.result.webgpu.errs.concat(r.result.webgl2.errs).join(" | ") || "") : (r.error || (r.pageErrors || []).join(" | ")).slice(0, 300));
        if (r.ok) {
            fd = new SlugFontDevice(nb, font, CHARS, { logWidth: r.result.webgl2.logWidth });
            for (const bk of ["webgpu", "webgl2"]) {
                const o = r.result[bk], f = fit(o.cap);
                report(`${bk}: fit -- ` + f.all.slice(0, 3).map((x) => `1/${x.Q}: ${x.worst.toExponential(2)}`).join("  ") + `; ${f.best.orphan} lit fragments outside every model triangle`);
                ok(`*** ${bk}: the perspective-correct model per body reproduces the fragment's texcoord to 1e-5 em over ${f.best.n} fragments, none lit outside it ***`, f.best.worst < 1e-5 && f.best.n > 800 && f.best.orphan === 0, `worst ${f.best.worst.toExponential(2)} em at 1/${f.best.Q}`);
                const key = expectedFrame(f.best.Q); const lit = key.filter((v) => v > 0.02).length; let worst = 0, over = 0, at = -1;
                for (let i = 0; i < W * H; i++) { const want = Math.round(key[i] * 255), got = o.pixels[i * 4], d = Math.abs(got - want); if (d > TOL) over++; if (d > worst) { worst = d; at = i; } }
                ok(`  ${bk}: every pixel within ${TOL} of 255 of slugEval through the model (${lit} lit)`, over === 0 && lit > 300, `worst ${worst} at (${at % W}, ${Math.floor(at / W)}), ${over} over`);
            }
            const G = r.result.webgpu.pixels, L = r.result.webgl2.pixels; let pw = 0, po = 0; for (let i = 0; i < W * H; i++) { const d = Math.abs(G[i * 4] - L[i * 4]); if (d > TOL) po++; if (d > pw) pw = d; }
            ok(`  the two backends agree within ${TOL} of 255 on every pixel of the tumbling glyphs`, po === 0, `worst ${pw}`);
        }
        if (r && r.pageErrors && r.pageErrors.length) report("page errors: " + r.pageErrors.slice(0, 3).join(" | "));
    }
}

console.log(fails ? "\nFAIL -- " + fails + " check(s)" : "\nall checks pass");
console.log("unchecked here: a depth test between overlapping glyph bodies (drawn in body order, no depth); the box3d browser loader's module against node's (the page uses the same adapter over it); the ticker's cost on a rig.");
process.exit(fails ? 1 : 0);
