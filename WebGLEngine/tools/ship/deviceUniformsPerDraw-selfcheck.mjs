#!/usr/bin/env node
// WebGLEngine/tools/ship/deviceUniformsPerDraw-selfcheck.mjs -- v4497
//
// *** A UNIFORM WRITTEN BETWEEN TWO DRAWS OF ONE FRAME REACHES ONLY THE DRAW THAT FOLLOWS IT. *** Found by
// tools/ship/slugTicker-selfcheck.mjs at v4497: gfx/device.js's WebGPU pass wrote every pass.uniform() into the pipeline's
// one uniform buffer with queue.writeBuffer, which lands BEFORE the command buffer it precedes -- so all N draws of a
// frame read the Nth uniform. WebGL2 sets uniforms immediately per draw and never had it. The fix keeps a CPU shadow and
// a pool of uniform buffers per pipeline: the first uniform() after a draw moves to the next buffer, copies the shadow
// in and rebinds. This gate draws FOUR quads in one pass with four different offsets and four colours from the same
// pipeline, reads the frame back on both backends, and holds every quad at its own place in its own colour; then two
// frames in a row (the pool resets per frame), and the null backend's op record (one write per uniform, as before).
//
// SABOTAGE (v4497): A  pass.uniform() never moving to a fresh buffer (the pre-v4497 line)                 -> exit=1, red 3: every quad drawn at the last offset in the last
//                      colour on WebGPU (0/0/0 0/0/0 0/0/0 255/255/0), frame 2 likewise, the backends 2,028 bytes apart -- the finding, by name
//                      (that was the first draft with its own quad pipeline; re-run on the Slug batch -> exit=1, red: one lit quadrant of four on WebGPU)
//                   B  the pool moving to a fresh buffer but not copying the shadow in                       -> FIRST 0 RED: the gate's frames wrote BOTH uniforms before every
//                      draw, so no draw ever read a value from before the previous draw. Frame 3 was added -- one colour set once, four offsets --
//                      and the sabotage re-run -> exit=1, red: frame 3 on WebGPU (the colour reads as zero after the first draw). ON THE SLUG BATCH it went
//                      0 red AGAIN: a pool buffer keeps its bytes between frames, and the first pipeline's buffers still held last frame's viewport.
//                      Frame 3 now runs on a fresh pipeline (fresh buffers, zeros) -> exit=1, red: frame 3 (one quadrant lit, the rest NaN'd away)
//                   C  the per-frame reset dropped (the pool position never returns to 0)                    -> FIRST 0 RED: the picture stays right while the pool grows by four
//                      buffers a frame -- a leak no pixel shows. The pool-length row was added (four after every frame); re-run -> exit=1, red: that row
//
// Run: node tools/ship/deviceUniformsPerDraw-selfcheck.mjs      (~25 s)
"use strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runInEngineOrigin, webgpuSkipReason } from "./webgpuHarness.mjs";
import fs from "node:fs";
import { nullBackend } from "../../gfx/device.js";
import { parseFont } from "../../text/slugFont.js";
import { SlugFontDevice, SlugDeviceBatch } from "../../render/slugDevice.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let fails = 0;
const ok = (label, cond, detail) => { if (!cond) fails++; console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}${detail ? "   " + detail : ""}`); };
const report = (s) => console.log(`  ----  ${s}`);
const sec = (s) => console.log("\n" + s);
const W = 160, H = 160;
// THE PIPELINE IS THE SLUG TEXT PIPELINE, NOT ONE WRITTEN HERE: a gate carrying shader text of its own is a shader producer to
// the parity census (backendParity-selfcheck counts importers of gfx/device.js among shader-bearing files, and a first draft
// of this gate arrived as a third device consumer with a GLSL vertex stage). Slug's rows m0..m3 are per-draw uniforms and its
// viewport is one set once -- exactly the two cases the fix must carry. Four draws of one batch ("Ab") at four offsets.
const QUADS = [[-0.5, 0.5], [0.5, 0.5], [-0.5, -0.5], [0.5, -0.5]];   // NDC centres of the four placements
const TEXT = "Ab", CHARS = " Ab", SIZE = 28;

sec("1. THE NULL BACKEND: the op record");
{
    const nb = nullBackend();
    const font = parseFont(new Uint8Array(fs.readFileSync(path.join(ENG, "vendor/fonts/IBMPlexSerif-Regular.ttf"))));
    const fd = new SlugFontDevice(nb, font, CHARS, { logWidth: 11 }); const b = new SlugDeviceBatch(fd); b.set(TEXT, { size: SIZE });
    nb.ops.length = 0;
    nb.frame(({ pass }) => { pass.clear([0, 0, 0, 1]); for (const q of QUADS) b.draw(pass, rowsAt(q), [W, H]); });
    const uni = nb.ops.filter((o) => o[0] === "uniform").length, draws = nb.ops.filter((o) => o[0] === "drawIndexed").length;
    ok("four draws with five uniforms each record twenty uniform ops and four indexed draws, in order", uni === 20 && draws === 4, `${uni} uniform ops, ${draws} draws`);
}
/** rows placing the text's origin at an NDC centre: the orthographic pixel rows with the origin moved */
function rowsAt([nx, ny]) { const ox = (nx + 1) / 2 * W - 12, oy = (1 - ny) / 2 * H + 8; return new Float32Array([2 / W, 0, 0, (2 / W) * ox - 1, 0, 2 / H, 0, 1 - (2 / H) * oy, 0, 0, 0, 0, 0, 0, 0, 1]); }

sec("2. THE BROWSER, BOTH BACKENDS: one batch drawn four times at four offsets in one pass");
{
    const skip = webgpuSkipReason();
    if (skip) { console.log(`  SKIP  ${skip}`); report("*** NOT A PASS. ***"); fails++; }
    else {
        const ROWS = QUADS.map((q) => Array.from(rowsAt(q)));
        const r = await runInEngineOrigin({ engineRoot: ENG, args: { W, H, TEXT, CHARS, SIZE, ROWS }, script: `async (a) => {
            const { requestDevice } = await import("/gfx/device.js");
            const { parseFont } = await import("/text/slugFont.js");
            const M = await import("/render/slugDevice.mjs");
            const font = parseFont(await (await fetch("/vendor/fonts/IBMPlexSerif-Regular.ttf")).arrayBuffer());
            const { W, H, TEXT, CHARS, SIZE, ROWS } = a; const out = {};
            for (const backend of ["webgpu", "webgl2"]) {
                const cv = document.createElement("canvas"); cv.width = W; cv.height = H;
                const dev = await requestDevice(cv, { backend, offscreen: backend === "webgpu" });
                const o = { backend: dev.backend, frames: [], pool: [] };
                const fd = new M.SlugFontDevice(dev, font, CHARS); const b = new M.SlugDeviceBatch(fd); b.set(TEXT, { size: SIZE, color: [1, 1, 1, 1] });
                const rows = ROWS.map((r) => new Float32Array(r));
                // frame 3 runs on a FRESH pipeline: a pool buffer keeps its bytes between frames, so on the first pipeline a fresh buffer
                // still held last frame's viewport and a dropped shadow copy went unseen (sabotage B, 0 red). New pipeline, new buffers, zeros.
                const fd2 = new M.SlugFontDevice(dev, font, CHARS); const b2 = new M.SlugDeviceBatch(fd2); b2.set(TEXT, { size: SIZE, color: [1, 1, 1, 1] });
                for (let f = 0; f < 3; f++) {
                    // frame 1: rows and viewport per draw (the shipped draw()); frame 2: reversed; frame 3: the VIEWPORT set once, then only
                    // the rows per draw -- a draw relying on a uniform written before the previous draw (the shadow copy's job)
                    const order = f === 1 ? rows.slice().reverse() : rows;
                    const fr = await dev.frame(({ pass }) => { pass.clear([0, 0, 0, 1]);
                        if (f === 2) { pass.use(fd2.pipeline); pass.uniform("viewport", [W, H]); pass.texture("curveTexture", fd2.curveTexture, 0); pass.texture("bandTexture", fd2.bandTexture, 1); pass.vertices(b2.vb); pass.indices(b2.ib);
                            for (const rw of order) { for (let i = 0; i < 4; i++) pass.uniform("m" + i, rw.subarray(i * 4, i * 4 + 4)); pass.drawIndexed(b2.indexCount); } }
                        else for (const rw of order) b.draw(pass, rw, [W, H]); }, { read: true });
                    o.frames.push(Array.from(fr.pixels)); o.pool.push((f === 2 ? fd2 : fd).pipeline._upool ? (f === 2 ? fd2 : fd).pipeline._upool.length : -1);
                }
                b.destroy(); fd.destroy(); b2.destroy(); fd2.destroy(); dev.destroy(); out[backend] = o;
            }
            return out;
        }` });
        ok("both backends drew the three frames", r.ok && r.result && r.result.webgpu && r.result.webgl2, r.ok ? "" : (r.reason || r.error || (r.pageErrors || []).join(" | ")).slice(0, 400));
        if (r.ok) {
            // ink per quadrant: the text sits inside its quadrant, so each quadrant's lit count says whether that draw landed there
            const quadrantInk = (px) => { const c = [0, 0, 0, 0]; for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) if (px[(j * W + i) * 4] > 64) c[(j < H / 2 ? 0 : 2) + (i < W / 2 ? 0 : 1)]++; return c; };
            for (const bk of ["webgpu", "webgl2"]) {
                const o = r.result[bk];
                for (let f = 0; f < 3; f++) {
                    const c = quadrantInk(o.frames[f]);
                    ok(`*** ${bk} frame ${f + 1}: ink in all four quadrants -- ${f === 2 ? "the viewport set ONCE before four row writes reaches all four draws (the shadow copy)" : "each draw at the rows it was given, not the last rows written"} ***`, c.every((n) => n > 40) && Math.max(...c) < 3 * Math.min(...c), `quadrants ${c.join(", ")}`);
                }
                const same = o.frames[0].every((v, i) => Math.abs(v - o.frames[1][i]) <= 1) && o.frames[0].every((v, i) => Math.abs(v - o.frames[2][i]) <= 1);
                ok(`  ${bk}: the three frames are the same picture (draw order and the once-set viewport change nothing)`, same);
                if (bk === "webgpu") ok(`  webgpu: the first pipeline's pool holds four buffers after frame 1 and STILL four after frame 2 (the per-frame reset reuses them rather than growing); the fresh pipeline's holds four after frame 3`, o.pool[0] === 4 && o.pool[1] === 4 && o.pool[2] === 4, `pool ${o.pool.join(", ")}`);
            }
            let d = 0; for (let i = 0; i < W * H * 4; i += 4) if (Math.abs(r.result.webgpu.frames[0][i] - r.result.webgl2.frames[0][i]) > 2) d++;
            ok("the two backends draw the same picture within 2 of 255", d === 0, `${d} pixels differ`);
        }
    }
}

console.log(fails ? "\nFAIL -- " + fails + " check(s)" : "\nall checks pass");
console.log("unchecked here: more draws than the pool has buffers in a frame is handled by growth (33 bodies in slugTicker-selfcheck); a compute pipeline's uniforms between dispatches (compute() has its own path).");
process.exit(fails ? 1 : 0);
