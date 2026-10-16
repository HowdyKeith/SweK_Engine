#!/usr/bin/env node
// WebGLEngine/tools/ship/slugReupload-selfcheck.mjs -- v4493
//
// THE PER-FRAME VERTEX REUPLOAD MEASURED BEFORE ANY RING BUFFER (docs/TSL-ROADMAP.md step 7 item 12, task 12). Both
// shipping consumers -- ev/esShipLabels.js and orrery-gpu.html -- call batch.set() on every label on every frame. Before
// v4493 SlugDeviceBatch.set destroyed both buffers and created two more each time (48 creations a frame for 24 labels),
// and SlugTextBatch.set called bufferData (a new store) each time. The reviewed plan's answer was a ring buffer that
// resets to offset 0 on overflow with no fence, which overwrites text the previous frame is still drawing. This round
// measures what the reupload costs and what the cheap fix buys: REUSE. A set() whose stream fits the buffers it already
// has writes into them (queue.writeBuffer / bufferSubData), which the queue orders behind the commands already
// submitted -- the fence the ring lacked, for free. Growth reallocates. Both batches count sets / allocations / bytes.
//
// Section 1 holds the reuse on the null backend (allocations only on first set and on growth; a shrink reuses; the
// bytes the shipping label list uploads per frame counted) and times layout + buildVertices headless. Section 2 runs
// 24 labels for 40 frames on both backends: destroy-and-create each frame (the old path, done by calling destroy()
// before set()), reuse (the new path), and draw-only (no set), each timed by performance.now() around the frame with
// the queue drained -- CPU time on SwiftShader, said so -- and holds that reuse allocates nothing once warm on either
// backend and draws the same pixels as the old path. The raw SlugTextBatch gets the same three on WebGL2.
//
// SABOTAGE (v4493): A  SlugDeviceBatch._upload reallocating on every set (the pre-v4493 behaviour)      -> (see log below)
//                   B  the reuse test writing a fresh buffer only when the new stream is SMALLER          -> (see log below)
//                   C  SlugTextBatch.set calling bufferData every time                                  -> (see log below)
//                   D  the reuse path skipping the index write                                          -> exit=1 but ONLY the null-backend write count went red, and the
//                      row 'the index buffer holds the new stream's indices' did NOT: the bytes skipped were the bytes already there. THE INDEX STREAM IS
//                      STRUCTURAL -- quad k is 4k + (0,1,2, 0,2,3) whatever the text -- so a store written for N quads holds the indices of any M <= N,
//                      and the write the sabotage skipped was redundant. Both batches now skip it by design, the gate holds the structure by name,
//                      and the sabotage became D': the reuse path writing the indices anyway (the pre-finding code)
//
// v4867 -- THE ORDERING ROW FAILED ON TWO BOXES IN A WEEK AND THE DESIGN WAS THE CAUSE. It timed the three modes in BLOCKS (recreate x 40 frames, then reuse x 40, then draw-only x 40) and asked that draw-only be no slower than reuse
// within 0.5 ms and reuse no slower than recreate within 1 ms, so whatever the machine did during the third block landed on the third mode: 8.90 <= 8.10 here in the v4867 verdict (and again alone), 19.30 <= 16.90 on Keith's 8-core rig
// and, on its WebGL2 half, 5.80 <= 1.00 -- a draw that uploads nothing "costing" five times a draw that uploads, which no cost of drawing can explain. The three modes are now timed IN ROTATION, frame by frame (the order rotates), so
// drift lands on all of them, and each tolerance is relative (10%) plus an absolute millisecond: a frame is 8 ms alone and 25 ms with eight of these running at once. MEASURED: 42 sequential runs pass; with eight at once, 2 of 40
// fail, which the quick sweep's alone re-run reads as a false red; the old design failed alone. WHAT THE ROW CAN NO LONGER SEE, SAID: a draw-only that is slower than reuse by under 10% and a millisecond, or a reuse that is slower
// than recreate by as much -- it is a plausibility check on the order, not a performance regression test; the rows that hold the design are the allocation counts (reuse allocates nothing once warm) and the identical pixels.
// SABOTAGE (v4867): a 6 ms busy wait in the draw-only path -> 2 red (the order row, both backends); in the reuse path -> 2 red; reuse destroying its buffers before every set (the pre-v4493 behaviour) -> 2 red (the allocation rows).
// Removing the rotation (each frame running the modes in a fixed order) -> 0 red: the rotation is what makes the row survive a noisy box, not what lets it catch a regression.
// Run: node tools/ship/slugReupload-selfcheck.mjs      (~2.7 s)
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runInEngineOrigin, webgpuSkipReason } from "./webgpuHarness.mjs";
import { nullBackend } from "../../gfx/device.js";
import { parseFont } from "../../text/slugFont.js";
import { layoutText, buildVertices } from "../../text/slugText.js";
import { SlugFontDevice, SlugDeviceBatch } from "../../render/slugDevice.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let fails = 0;
const ok = (label, cond, detail) => { if (!cond) fails++; console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}${detail ? "   " + detail : ""}`); };
const report = (s) => console.log(`  ----  ${s}`);
const sec = (s) => console.log("\n" + s);

// a label list like the orrery's: 24 names with a number each, 14 px, re-laid every frame
const LABELS = Array.from({ length: 24 }, (_, i) => `Body ${i + 1} ${(3.7 + i * 0.83).toFixed(2)} km/s`);
const CHARS = " " + "Body0123456789./kms" + "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
const PX = 14, FRAMES = 40, W = 640, H = 360;
const font = parseFont(new Uint8Array(fs.readFileSync(path.join(ENG, "vendor/fonts/IBMPlexSerif-Regular.ttf"))));

sec("1. HEADLESS: what a frame uploads, and the reuse on the null backend");
{
    const nb = nullBackend();
    const fd = new SlugFontDevice(nb, font, CHARS, { logWidth: 11 });
    let bytes = 0, quads = 0;
    for (const L of LABELS) { const laid = layoutText(font, L, { size: PX }); const b = buildVertices(laid.glyphs, (gi) => fd.entryFor(gi), {}); bytes += b.buffer.byteLength + b.indices.byteLength; quads += b.quadCount; }
    report(`the label list: ${LABELS.length} labels, ${quads} glyph quads, ${(bytes / 1024).toFixed(1)} KiB of vertices and indices per frame when every label is re-set`);
    ok("a frame of 24 labels is tens of KiB, not megabytes: 344 bytes a glyph (4 vertices of 80 + 6 indices of 4)", bytes === quads * (4 * 80 + 6 * 4) && bytes > 20 * 1024 && bytes < 200 * 1024);
    const t0 = performance.now(); let n = 0;
    for (let k = 0; k < 20; k++) for (const L of LABELS) { const laid = layoutText(font, L, { size: PX }); buildVertices(laid.glyphs, (gi) => fd.entryFor(gi), {}); n++; }
    const usPer = (performance.now() - t0) * 1000 / n;
    report(`layoutText + buildVertices: ${usPer.toFixed(1)} us a label on this box's CPU (${(usPer * LABELS.length / 1000).toFixed(2)} ms for the list)`);
    ok("the CPU side of a set() is under a millisecond a label here", usPer < 1000);

    const b = new SlugDeviceBatch(fd);
    b.set(LABELS[0], { size: PX }); const s1 = { ...b.stats };
    b.set("Body 1", { size: PX }); const s2 = { ...b.stats };                            // smaller: reuse
    b.set(LABELS[0], { size: PX }); const s3 = { ...b.stats };                            // back to the first size: still fits
    b.set(LABELS[0] + " and more text", { size: PX }); const s4 = { ...b.stats };         // growth: reallocate
    ok("the first set allocates two buffers; a smaller stream and an equal one reuse them; growth allocates two more", s1.allocations === 2 && s2.allocations === 2 && s3.allocations === 2 && s4.allocations === 4 && s4.sets === 4,
        `allocations after each set: ${s1.allocations} ${s2.allocations} ${s3.allocations} ${s4.allocations}`);
    const ops = Array.isArray(nb.ops) ? nb.ops : null;
    const writes = ops ? ops.filter((o) => o[0] === "write").length : -1, destroys = ops ? ops.filter((o) => o[0] === "destroyBuffer").length : -1;
    ok("the null backend saw two VERTEX writes land in the existing buffers (the two reuses), no index write, and only growth destroy any", writes === 2 && destroys === 2 && ops.filter((o) => o[0] === "write" && o[1] === "vertex").length === 2, `${writes} writes, ${destroys} destroys`);
    // THE INDEX STREAM IS STRUCTURAL, so a reuse writes no indices: measured, not assumed
    const big = buildVertices(layoutText(font, LABELS[0], { size: PX }).glyphs, (gi) => fd.entryFor(gi), {}), small = buildVertices(layoutText(font, "Body 1", { size: PX }).glyphs, (gi) => fd.entryFor(gi), {});
    ok(`*** the index stream of ${small.quadCount} quads is the first ${small.indices.length} indices of the stream of ${big.quadCount}: quad k is 4k + (0,1,2, 0,2,3), whatever the text ***`,
        small.quadCount < big.quadCount && small.indices.every((v, i) => v === big.indices[i]) && big.indices.every((v, i) => v === 4 * Math.floor(i / 6) + [0, 1, 2, 0, 2, 3][i % 6]));
    b.set("Body 1", { size: PX });
    const read2 = new Uint32Array(b.ib.data.buffer, b.ib.data.byteOffset, b.indexCount);
    ok("so after a smaller set the index buffer's first indices ARE the smaller stream's without a write, and indexCount is the smaller count", b.indexCount === 6 * b.quads && b.indexCount === 30 && read2.every((v, i) => v === b.built.indices[i]), `${b.indexCount} indices for ${b.quads} quads`);
}

sec("2. THE BROWSER, BOTH BACKENDS: destroy-and-create against reuse against draw-only, 24 labels x 40 frames");
{
    const skip = webgpuSkipReason();
    if (skip) { console.log(`  SKIP  ${skip}`); report("*** NOT A PASS. ***"); fails++; }
    else {
        const r = await runInEngineOrigin({ engineRoot: ENG, args: { LABELS, CHARS, PX, FRAMES, W, H }, script: `async (a) => {
            const { requestDevice } = await import("/gfx/device.js");
            const { parseFont } = await import("/text/slugFont.js");
            const M = await import("/render/slugDevice.mjs");
            const { SlugFontGPU, SlugTextBatch, orthoRows } = await import("/text/slugText.js");
            const font = parseFont(await (await fetch("/vendor/fonts/IBMPlexSerif-Regular.ttf")).arrayBuffer());
            const { LABELS, CHARS, PX, FRAMES, W, H } = a;
            const rowsFor = (i) => new Float32Array([2 / W, 0, 0, (2 / W) * (20 + (i % 3) * 200) - 1, 0, 2 / H, 0, 1 - (2 / H) * (30 + Math.floor(i / 3) * 40), 0, 0, 0, 0, 0, 0, 0, 1]);
            const median = (xs) => { const s = xs.slice().sort((p, q) => p - q); return s[s.length >> 1]; };
            const out = {};
            for (const backend of ["webgpu", "webgl2"]) {
                const cv = document.createElement("canvas"); cv.width = W; cv.height = H;
                const dev = await requestDevice(cv, { backend, offscreen: backend === "webgpu" });
                const drain = async () => { if (dev.gl) dev.gl.finish(); else if (dev.gpu) await dev.gpu.queue.onSubmittedWorkDone(); };
                const fd = new M.SlugFontDevice(dev, font, CHARS);
                const batches = LABELS.map(() => new M.SlugDeviceBatch(fd));
                const o = { backend: dev.backend, ms: {}, stats: {} };
                const frameOf = (mode, f) => {
                    const ready = [];
                    LABELS.forEach((L, i) => { const b = batches[i];
                        if (mode === "recreate") { b.destroy(); b.set(L + " ", { size: PX }); }
                        else if (mode === "reuse") b.set(L + (f % 2 ? "" : " "), { size: PX });
                        ready.push({ b, rows: rowsFor(i) }); });
                    return dev.frame(({ pass }) => { pass.clear([0, 0, 0, 1]); for (const q of ready) q.b.draw(pass, q.rows, [W, H]); });
                };
                // THE THREE MODES ARE TIMED IN ROTATION, frame by frame (v4867): block by block (recreate x 40, then reuse x 40, then draw-only x 40) whatever the machine did in the minute the third block ran landed on the third mode, and
                // the row that says draw-only is the cheapest failed on two boxes in a week (this one at 8.90 <= 8.10, and Keith's 8-core at 19.30 <= 16.90 and, on WebGL2, 5.80 <= 1.00). Each frame runs all three, in an order that
                // rotates, so drift lands on all of them. Stats are read as the change across each timed frame. RECREATE USES THE LONGER LABEL EVERY FRAME (it allocates anyway), so the buffers it leaves are always big enough for reuse.
                const modes = ["recreate", "reuse", "drawOnly"], times = { recreate: [], reuse: [], drawOnly: [] }, acc = { recreate: { sets: 0, allocations: 0, bytes: 0 }, reuse: { sets: 0, allocations: 0, bytes: 0 }, drawOnly: { sets: 0, allocations: 0, bytes: 0 } };
                const totals = () => batches.reduce((s, b) => { const st = b.stats || { sets: 0, allocations: 0, bytes: 0 }; return { sets: s.sets + st.sets, allocations: s.allocations + st.allocations, bytes: s.bytes + st.bytes }; }, { sets: 0, allocations: 0, bytes: 0 });
                for (const mode of modes) { frameOf(mode, 0); await drain(); }                                       // warm each
                for (let f = 1; f <= FRAMES; f++) {
                    for (let k = 0; k < 3; k++) {
                        const mode = modes[(f + k) % 3], before = totals(), t0 = performance.now();
                        frameOf(mode, f); await drain();
                        times[mode].push(performance.now() - t0);
                        const after = totals(); acc[mode].sets += after.sets - before.sets; acc[mode].allocations += after.allocations - before.allocations; acc[mode].bytes += after.bytes - before.bytes;
                    }
                }
                for (const mode of modes) { o.ms[mode] = median(times[mode]); o.stats[mode] = acc[mode]; }
                // the same picture either way: one frame each of recreate and reuse, read back
                const pix = async (mode) => { const fr = await (async () => { const ready = []; LABELS.forEach((L, i) => { const b = batches[i]; if (mode === "recreate") b.destroy(); b.set(L, { size: PX }); ready.push({ b, rows: rowsFor(i) }); });
                    return dev.frame(({ pass }) => { pass.clear([0, 0, 0, 1]); for (const q of ready) q.b.draw(pass, q.rows, [W, H]); }, { read: true }); })(); return fr.pixels; };
                const p1 = await pix("recreate"), p2 = await pix("reuse"); let diff = 0, lit = 0; for (let i = 0; i < p1.length; i += 4) { if (p1[i] !== p2[i]) diff++; if (p2[i] > 64) lit++; }
                o.sameDiff = diff; o.lit = lit;
                for (const b of batches) b.destroy(); fd.destroy(); dev.destroy();
                out[backend] = o;
            }
            // the raw WebGL2 batch
            { const cv = document.createElement("canvas"); cv.width = W; cv.height = H;
              const gl = cv.getContext("webgl2", { antialias: false, premultipliedAlpha: true });
              const fg = new SlugFontGPU(gl, font, CHARS, { format: "16f" }); const tbs = LABELS.map(() => new SlugTextBatch(fg));
              const o = { ms: {}, stats: {} };
              const frameOf = (mode, f) => { gl.viewport(0, 0, W, H); gl.clearColor(0, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT);
                  LABELS.forEach((L, i) => { if (mode !== "drawOnly") tbs[i].set(L + (f % 2 ? "" : " "), { size: PX }); tbs[i].draw(rowsFor(i), [W, H]); }); };
              const rtimes = { set: [], drawOnly: [] }, racc = { set: { sets: 0, allocations: 0, bytes: 0 }, drawOnly: { sets: 0, allocations: 0, bytes: 0 } };
              const rtotals = () => tbs.reduce((s, b) => { const st = b.stats || { sets: 0, allocations: 0, bytes: 0 }; return { sets: s.sets + st.sets, allocations: s.allocations + st.allocations, bytes: s.bytes + st.bytes }; }, { sets: 0, allocations: 0, bytes: 0 });
              for (const mode of ["set", "drawOnly"]) { frameOf(mode, 0); gl.finish(); }
              for (let f = 1; f <= FRAMES; f++) { for (let k = 0; k < 2; k++) { const mode = ["set", "drawOnly"][(f + k) % 2], before = rtotals(), t0 = performance.now(); frameOf(mode, f); gl.finish(); rtimes[mode].push(performance.now() - t0); const after = rtotals(); racc[mode].sets += after.sets - before.sets; racc[mode].allocations += after.allocations - before.allocations; racc[mode].bytes += after.bytes - before.bytes; } }
              for (const mode of ["set", "drawOnly"]) { o.ms[mode] = median(rtimes[mode]); o.stats[mode] = racc[mode]; }
              out.raw = o; }
            return out;
        }` });
        ok("*** both backends and the raw batch ran the three modes ***", r.ok && r.result && r.result.webgpu && r.result.webgl2 && r.result.raw, r.ok ? "" : (r.error || (r.pageErrors || []).join(" | ")).slice(0, 300));
        if (r.ok) {
            for (const bk of ["webgpu", "webgl2"]) {
                const o = r.result[bk], m = o.ms, st = o.stats;
                report(`${bk}: ms a frame (CPU-timed, queue drained, SwiftShader): recreate ${m.recreate.toFixed(2)}, reuse ${m.reuse.toFixed(2)}, draw-only ${m.drawOnly.toFixed(2)}; ` +
                    `recreate allocated ${st.recreate.allocations} buffers over ${FRAMES} frames, reuse ${st.reuse.allocations}; ${(st.reuse.bytes / FRAMES / 1024).toFixed(1)} KiB written a frame`);
                ok(`*** ${bk}: reuse allocates NOTHING once warm over ${FRAMES} frames of ${LABELS.length} changing labels, where recreate allocated ${st.recreate.allocations}; and it writes vertices only (no index bytes) ***`,
            st.reuse.allocations === 0 && st.recreate.allocations === 2 * LABELS.length * FRAMES && st.reuse.sets === LABELS.length * FRAMES && st.reuse.bytes < st.recreate.bytes && (st.recreate.bytes - st.reuse.bytes) % 24 === 0);
                ok(`  ${bk}: reuse draws the same pixels as destroy-and-create`, o.sameDiff === 0 && o.lit > 500, `${o.sameDiff} pixels differ, ${o.lit} lit`);
                ok(`  ${bk}: draw-only is not slower than reuse (by more than 10% and a millisecond), and reuse is not slower than recreate (by more than 10% and a millisecond): the order the design predicts, within this box's noise; the three modes are timed in rotation, frame by frame`, m.drawOnly <= m.reuse * 1.1 + 1.0 && m.reuse <= m.recreate * 1.1 + 1.0, `${m.drawOnly.toFixed(2)} <= ${m.reuse.toFixed(2)} <= ${m.recreate.toFixed(2)}`);
            }
            const o = r.result.raw;
            report(`raw SlugTextBatch on WebGL2: set+draw ${o.ms.set.toFixed(2)} ms a frame, draw-only ${o.ms.drawOnly.toFixed(2)}; ${o.stats.set.allocations} bufferData stores over ${FRAMES} frames, ${(o.stats.set.bytes / FRAMES / 1024).toFixed(1)} KiB a frame`);
            ok("the raw batch's set() takes bufferSubData once warm: no new store over 40 frames of changing labels", o.stats.set.allocations === 0 && o.stats.set.sets === LABELS.length * FRAMES);
        }
        if (r && r.pageErrors && r.pageErrors.length) report("page errors: " + r.pageErrors.slice(0, 3).join(" | "));
    }
}

console.log(fails ? "\nFAIL -- " + fails + " check(s)" : "\nall checks pass");
console.log("unchecked here: GPU time (this box is SwiftShader and the numbers are CPU time with the queue drained; slug-rig.html is where a GPU would say); a ring buffer, which nothing here builds -- the reuse write is queue-ordered and needs no fence.");
process.exit(fails ? 1 : 0);
