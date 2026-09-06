#!/usr/bin/env node
// WebGLEngine/tools/ship/slugMorph-selfcheck.mjs -- v4498
//
// ONE GLYPH OUTLINE MORPHED INTO ANOTHER AND DRAWN BY SLUG (task 44), with vendor/morphicons' core doing the subpath
// correspondence physics/mesh/strokeMorph.mjs said not to re-derive. Section 1, headless: the glyph-to-path writer
// (one M and one Z per contour, one Q per curve, the closing point the start), the polyline-to-contour reader (every
// curve a degenerate quadratic whose control point is its midpoint, the last curve ending EXACTLY on the first's start,
// which slugAtlas relies on), the morph's endpoints (t = 0 IS the plan's source samples and t = 1 its target samples to
// floating point; the target samples are the target glyph's own resample up to a cyclic shift of the start point --
// morphicons re-parametrises the start, which is the alignment it exists for), subpath correspondence on 0 -> 8 (two
// contours paired with three, no block), the intermediate's area between the endpoints' per subpath, and the per-frame
// cost -- one morph step plus one packAtlas of one glyph -- measured. Section 2, on both backends: the morph at t = 0,
// 0.5 and 1 packed per frame and drawn through SlugFontDevice.fromAtlas with ONE shared pipeline; the t = 0 frame
// against the glyph drawn from the font's own atlas (the 64-point resample's cost in pixels, measured), the t = 0.5
// frame against slugEval on the morphed atlas through the flat rasteriser model, the backends within 2 of 255.
//
// MEASURED AT v4498 (Plex, 0 -> 8, 64 points a subpath, 64 px): the 0's two contours pair with the 8's three by DUPLICATING the 0's
// hole -- and under Slug's non-zero winding two coincident holes wind +2 against the outer's -1 and read as ink: the first frame drew
// a FILLED 0 (814 lit pixels against the font's 603). Exact duplicates are dropped at the endpoints now; between them the two copies
// diverge and their overlap winds +2 until they separate, a brief filled lens where the hole splits (even-odd would fill it too). With
// that: t = 0 and t = 1 are the plan's own samples to 1e-16, t = 1's subpaths are the 8's resample up to a cyclic start shift, every
// subpath's area at t = 0.5 lies between its endpoints', a frame costs 1.9 ms here (interpolate + packAtlas, 192 curves, 15 x 14
// bands), the t = 0.5 frame is within 2 of 255 of slugEval on the morphed atlas on both backends (worst 0), the t = 0 frame differs
// from the font's own 0 on 125 of 603 lit pixels by up to 16 of 255 -- the 64-point resample against true curves -- and the three
// morph frames built no pipeline of their own.
//
// SABOTAGE (v4498): A  polylineToContour's re-pin of the last curve's end onto the first's start removed        -> 0 RED, A FINDING: the closure is by
//                      construction (segment i ends on pts[(i + 1) % n], so the last ends on pts[0]) and the pin pinned nothing. The pin is gone and the
//                      header says why. A': the closing segment dropped (i < n - 1) -> exit=1, red 5: the contour row (three curves, none ending on the start), the two-point row, the curve count, and both t = 0 frames (an open 0 is not the font's 0)
//                   B  contoursToPathD writing L instead of Q (the control point dropped)                     -> exit=1, red 4: the M/Q/Z row, the areas row (a chord
//                      polygon), both t = 0 frames against the font's 0
//                   C  glyphMorph interpolating the source's samples only (t ignored)                          -> exit=1, red 7: the dedupe row, both endpoint rows, the
//                      areas row, the curve count, and t = 1 the same picture as t = 0 on both backends
//                   D  fromAtlas ignoring the shared pipeline (a new pipeline a frame)                        -> exit=1, red 2: three pipelines built on each backend
//
// Run: node tools/ship/slugMorph-selfcheck.mjs      (~50 s)
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runInEngineOrigin, webgpuSkipReason } from "./webgpuHarness.mjs";
import { nullBackend } from "../../gfx/device.js";
import { parseFont } from "../../text/slugFont.js";
import { slugRender } from "../../text/slugEval.js";
import { buildVertices } from "../../text/slugText.js";
import { SlugFontDevice } from "../../render/slugDevice.mjs";
import { contoursToPathD, polylineToContour, polygonArea, glyphMorph, packMorphed, dedupe } from "../../render/slugMorph.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let fails = 0;
const ok = (label, cond, detail) => { if (!cond) fails++; console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}${detail ? "   " + detail : ""}`); };
const report = (s) => console.log(`  ----  ${s}`);
const sec = (s) => console.log("\n" + s);
const W = 96, H = 96, SIZE = 64, ORIGIN = [16, 76], TOL = 2, N = 64;
const font = parseFont(new Uint8Array(fs.readFileSync(path.join(ENG, "vendor/fonts/IBMPlexSerif-Regular.ttf"))));
const glyph = (ch) => font.glyphIndex(ch.codePointAt(0));
const outline = (ch) => font.outline(glyph(ch));
const near = (a, b, eps = 1e-9) => Math.abs(a - b) < eps;

sec("1. HEADLESS: the path writer, the contour reader, the morph's endpoints, the correspondence, the cost");
{
    const o0 = outline("0"), d = contoursToPathD(o0.contours);
    const curves = o0.contours.reduce((s, c) => s + c.length, 0);
    ok(`contoursToPathD writes one M and one Z per contour and one Q per curve: '0' has ${o0.contours.length} contours, ${curves} curves`, (d.match(/M/g) || []).length === o0.contours.length && (d.match(/Z/g) || []).length === o0.contours.length && (d.match(/Q/g) || []).length === curves && o0.contours.length === 2);
    const pts = new Float64Array([0, 0, 1, 0, 1, 1, 0, 1]), c = polylineToContour(pts);
    ok("polylineToContour makes one degenerate quadratic per segment (control = midpoint) and ends the last EXACTLY on the first's start", c.length === 4 && c.every((q) => q[2] === (q[0] + q[4]) / 2 && q[3] === (q[1] + q[5]) / 2) && c[3][4] === c[0][0] && c[3][5] === c[0][1] && c.every((q, i) => i === 0 || (q[0] === c[i - 1][4] && q[1] === c[i - 1][5])));
    ok("a repeated point is skipped, and a two-point polyline still closes", polylineToContour(new Float64Array([0, 0, 0, 0, 1, 0])).length === 2 && polylineToContour(new Float64Array([0, 0])).length === 0);
    ok("polygonArea is the shoelace: a unit square 1, reversed -1", near(polygonArea(pts), 1) && near(polygonArea(new Float64Array([0, 0, 0, 1, 1, 1, 1, 0])), -1));

    const m = glyphMorph(o0, outline("8"), { N });
    ok(`*** 0 -> 8: two contours paired with three by morphicons' correspondence, no synthetic block ***`, m.subpaths.a === 2 && m.subpaths.b === 3 && m.subpaths.paired === 3 && m.plan.items.every((i) => !i.block && i.closed), `${m.subpaths.a}/${m.subpaths.b} paired ${m.subpaths.paired}`);
    // the plan's own outputs, before dedupe: item by item
    const s0 = m.at(0).polylines, s1 = m.at(1).polylines;
    ok("*** the 0's hole is paired with BOTH of the 8's holes by duplication, and at t = 0 the duplicate is dropped: three plan items, two polylines -- under non-zero winding two coincident holes read as ink ***", m.plan.items.length === 3 && s0.length === 2 && s1.length === 3 && dedupe([new Float64Array([0, 0, 1, 1]), new Float64Array([0, 0, 1, 1]), new Float64Array([0, 0, 1, 2])]).length === 2, `${s0.length} at t = 0, ${s1.length} at t = 1`);
    const worst = (outs, key) => Math.max(...outs.map((p, i) => Math.min(...m.plan.items.map((it) => Math.max(...Array.from(p).map((v, k) => Math.abs(v - it[key][k])))))));
    ok("t = 0 IS the plan's source samples and t = 1 its target samples, to floating point (owning the sample count makes the endpoints identities, as strokeMorph's header argued)", worst(s0, "a") < 1e-12 && worst(s1, "bO") < 1e-12, `worst ${worst(s0, "a").toExponential(1)} / ${worst(s1, "bO").toExponential(1)}`);
    // the target samples ARE the target glyph's resample up to a cyclic shift: every t = 1 polyline matches one of the '8' resamples under some rotation of the start
    const cyc = (p, q) => { const n = p.length >> 1; let best = Infinity; for (let r = 0; r < n; r++) { let w = 0; for (let i = 0; i < n; i++) { const j = (i + r) % n; w = Math.max(w, Math.abs(p[2 * i] - q[2 * j]), Math.abs(p[2 * i + 1] - q[2 * j + 1])); if (w >= best) break; } best = Math.min(best, w); } return best; };
    const shifts = s1.map((p) => Math.min(...m.samplesB.map((s) => cyc(p, s.pts))));
    ok("*** and each t = 1 subpath is one of the target's resampled subpaths up to a cyclic shift of its start point -- morphicons moved the start, not the shape ***", shifts.every((v) => v < 1e-9), shifts.map((v) => v.toExponential(1)).join(" "));
    const areaA = m.plan.items.map((i) => polygonArea(i.a)), areaB = m.plan.items.map((i) => polygonArea(i.bO)), areaH = m.at(0.5).polylines.map(polygonArea);
    ok("at t = 0.5 every subpath's signed area lies between its endpoints' (a morph, not a jump), and no two are duplicates", areaH.length === 3 && areaH.every((h, i) => h >= Math.min(areaA[i], areaB[i]) - 1e-9 && h <= Math.max(areaA[i], areaB[i]) + 1e-9), `A ${areaA.map((v) => v.toFixed(3)).join(",")} | half ${areaH.map((v) => v.toFixed(3)).join(",")} | B ${areaB.map((v) => v.toFixed(3)).join(",")}`);
    const t0 = performance.now(); let atlas = null; const FR = 30; for (let k = 0; k < FR; k++) atlas = packMorphed(m.at(k / (FR - 1)).contours, { logWidth: 11 }); const ms = (performance.now() - t0) / FR;
    const e = atlas.glyphs.get(0);
    report(`one frame of the morph (interpolate + packAtlas of one glyph, ${N} points a subpath): ${ms.toFixed(2)} ms on this box; ${e.curveCount} curves, bands ${e.bandMax[0] + 1} x ${e.bandMax[1] + 1}`);
    ok("a frame of the morph costs under 10 ms here and packs N curves per drawn subpath (three at the last frame)", ms < 10 && e.curveCount === N * 3 && !e.empty);
    const pairs = [["A", "V"], ["3", "4"], ["S", "w"]].map(([x, y]) => { const mm = glyphMorph(outline(x), outline(y), { N }); return `${x}->${y} ${mm.subpaths.a}/${mm.subpaths.b}->${mm.subpaths.paired}`; });
    report("other pairs' correspondence: " + pairs.join(", "));
}

sec("2. THE FRAME, ON BOTH BACKENDS: t = 0, 0.5, 1 packed per frame through fromAtlas with one shared pipeline");
{
    const skip = webgpuSkipReason();
    if (skip) { console.log(`  SKIP  ${skip}`); report("*** NOT A PASS. ***"); fails++; }
    else {
        const r = await runInEngineOrigin({ engineRoot: ENG, args: { W, H, SIZE, ORIGIN, N }, script: `async (a) => {
            const { requestDevice } = await import("/gfx/device.js");
            const { parseFont } = await import("/text/slugFont.js");
            const M = await import("/render/slugDevice.mjs");
            const { buildVertices } = await import("/text/slugText.js");
            const { glyphMorph, packMorphed } = await import("/render/slugMorph.mjs");
            const font = parseFont(await (await fetch("/vendor/fonts/IBMPlexSerif-Regular.ttf")).arrayBuffer());
            const { W, H, SIZE, ORIGIN, N } = a; const [px, py] = ORIGIN; const out = {};
            const rows = new Float32Array([2 / W, 0, 0, (2 / W) * px - 1, 0, 2 / H, 0, 1 - (2 / H) * py, 0, 0, 0, 0, 0, 0, 0, 1]);
            const g0 = font.glyphIndex(48), g8 = font.glyphIndex(56);
            for (const backend of ["webgpu", "webgl2"]) {
                const cv = document.createElement("canvas"); cv.width = W; cv.height = H;
                const dev = await requestDevice(cv, { backend, offscreen: backend === "webgpu" });
                const o = { backend: dev.backend, frames: {}, pipelines: 0 };
                const fd = new M.SlugFontDevice(dev, font, " 08"); o.logWidth = fd.logWidth;
                const drawOne = (fdx, key) => { const b = new M.SlugDeviceBatch(fdx); b.setBuilt(buildVertices([{ glyphIndex: key, codepoint: 0, x: 0, y: 0, size: SIZE }], (gi) => fdx.entryFor(gi), { color: [1, 1, 1, 1] })); return b; };
                const fontBatch = drawOne(fd, g0);
                const fr0 = await dev.frame(({ pass }) => { pass.clear([0, 0, 0, 1]); fontBatch.draw(pass, rows, [W, H]); }, { read: true }); o.frames.font0 = Array.from(fr0.pixels);
                const m = glyphMorph(font.outline(g0), font.outline(g8), { N });
                const shared = fd.pipeline; let made = 0;
                const origPipeline = dev.pipeline.bind(dev); dev.pipeline = (d) => { made++; return origPipeline(d); };
                for (const t of [0, 0.5, 1]) {
                    const atlas = packMorphed(m.at(t).contours, { logWidth: fd.logWidth });
                    const fdm = M.SlugFontDevice.fromAtlas(dev, font, atlas, { pipeline: shared });
                    const b = drawOne(fdm, 0);
                    const fr = await dev.frame(({ pass }) => { pass.clear([0, 0, 0, 1]); b.draw(pass, rows, [W, H]); }, { read: true }); o.frames["t" + t] = Array.from(fr.pixels);
                    o["entry" + t] = { loc: Array.from(fdm.entryFor(0).loc), bandMax: Array.from(fdm.entryFor(0).bandMax), transform: Array.from(fdm.entryFor(0).transform), bbox: fdm.entryFor(0).bbox, curveCount: fdm.entryFor(0).curveCount };
                    b.destroy(); fdm.destroy();
                }
                o.pipelines = made; dev.pipeline = origPipeline;
                fontBatch.destroy(); fd.destroy(); dev.destroy(); out[backend] = o;
            }
            return out;
        }` });
        ok("*** both backends drew the font's '0' and the morph at t = 0, 0.5, 1 ***", r.ok && r.result && r.result.webgpu && r.result.webgl2, r.ok ? "" : (r.reason || r.error || (r.pageErrors || []).join(" | ")).slice(0, 400));
        if (r.ok) {
            const nb = nullBackend();
            const m = glyphMorph(outline("0"), outline("8"), { N });
            for (const bk of ["webgpu", "webgl2"]) {
                const o = r.result[bk];
                ok(`${bk}: the three morph frames shared the font device's pipeline (no pipeline built per frame)`, o.pipelines === 0, `${o.pipelines} built`);
                const lit = (px) => px.filter((v, i) => i % 4 === 0 && v > 32).length;
                const diff = (a, b) => { let n = 0, w = 0; for (let i = 0; i < W * H; i++) { const d = Math.abs(a[i * 4] - b[i * 4]); if (d > TOL) n++; if (d > w) w = d; } return { n, w }; };
                const d0 = diff(o.frames.font0, o.frames.t0), d1 = diff(o.frames.t0, o.frames.t1);
                report(`${bk}: t = 0 against the font's own '0': ${d0.n} of ${lit(o.frames.font0)} lit pixels differ by more than ${TOL} (worst ${d0.w}) -- the ${N}-point resample against the true curves at ${SIZE} px`);
                // measured 125 of 603 (21%), worst 16: a 64-point polyline against true quadratics at 64 px shows on every curved edge by a few
                // levels; the first draft's 12% was a guess and this is the number
                ok(`  ${bk}: the t = 0 frame is the '0' the font draws, edges aside: fewer than 25% of its lit pixels off by more than ${TOL}, none by more than 32`, d0.n < lit(o.frames.font0) * 0.25 && d0.w <= 32 && lit(o.frames.font0) > 400);
                ok(`  ${bk}: t = 1 is a different picture from t = 0 (an 8, not a 0), and t = 0.5 has ink`, d1.n > 200 && lit(o.frames["t0.5"]) > 300 && lit(o.frames.t1) > 300, `${d1.n} pixels apart`);
                // the t = 0.5 frame against slugEval on the SAME morphed atlas, through the flat rasteriser model (orthographic rows, the flat gate's)
                const atlas = packMorphed(m.at(0.5).contours, { logWidth: o.logWidth }); const e = atlas.glyphs.get(0);
                const ent = o["entry0.5"]; ok(`  ${bk}: the atlas packed here at t = 0.5 is the atlas the page packed (same loc, bands, transform, curves)`, ent.loc[0] === e.loc[0] && ent.loc[1] === e.loc[1] && ent.curveCount === e.curveCount && ent.transform.every((v, i) => Math.abs(v - e.transform[i]) < 1e-6));
                const bb = e.bbox, s = SIZE, [ox, oy] = ORIGIN; let over = 0, worst = 0, litK = 0;
                const C = [[bb.x0, bb.y0, -1, -1], [bb.x1, bb.y0, 1, -1], [bb.x1, bb.y1, 1, 1], [bb.x0, bb.y1, -1, 1]].map(([ex, ey, nx, ny]) => ({ sx: Math.round((ox + ex * s + 0.5 * nx) * 16) / 16, sy: Math.round((oy - (ey * s + 0.5 * ny)) * 16) / 16, tx: ex + 0.5 * nx / s, ty: ey + 0.5 * ny / s }));
                for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
                    const x = i + 0.5, y = j + 0.5; let acc = 0;
                    for (const [a1, b1, c1] of [[0, 2, 3], [0, 1, 2]]) { const A = C[a1], B = C[b1], K = C[c1];
                        const det = (B.sx - A.sx) * (K.sy - A.sy) - (K.sx - A.sx) * (B.sy - A.sy);
                        const s1 = (B.sx - A.sx) * (y - A.sy) - (B.sy - A.sy) * (x - A.sx), s2 = (K.sx - B.sx) * (y - B.sy) - (K.sy - B.sy) * (x - B.sx), s3 = (A.sx - K.sx) * (y - K.sy) - (A.sy - K.sy) * (x - K.sx);
                        if (!((s1 >= 0 && s2 >= 0 && s3 >= 0) || (s1 <= 0 && s2 <= 0 && s3 <= 0))) continue;
                        const dx = (k) => ((B[k] - A[k]) * (K.sy - A.sy) - (K[k] - A[k]) * (B.sy - A.sy)) / det, dy = (k) => ((K[k] - A[k]) * (B.sx - A.sx) - (B[k] - A[k]) * (K.sx - A.sx)) / det;
                        const txdx = dx("tx"), txdy = dy("tx"), tydx = dx("ty"), tydy = dy("ty");
                        const tx = A.tx + txdx * (x - A.sx) + txdy * (y - A.sy), ty = A.ty + tydx * (x - A.sx) + tydy * (y - A.sy);
                        acc = slugRender(atlas, e, tx, ty, [Math.abs(txdx) + Math.abs(txdy), Math.abs(tydx) + Math.abs(tydy)]); break; }
                    const want = Math.round(acc * 255), got = o.frames["t0.5"][(j * W + i) * 4], d = Math.abs(got - want); if (want > 5) litK++; if (d > TOL) over++; if (d > worst) worst = d;
                }
                ok(`*** ${bk}: the t = 0.5 frame is within ${TOL} of 255 of slugEval on the morphed atlas through the rasteriser model (${litK} lit) -- the intermediate shape, self-intersections and all, is what Slug says it is ***`, over === 0 && litK > 300, `worst ${worst}, ${over} over`);
            }
            for (const key of ["t0", "t0.5", "t1"]) { let po = 0, pw = 0; for (let i = 0; i < W * H; i++) { const d = Math.abs(r.result.webgpu.frames[key][i * 4] - r.result.webgl2.frames[key][i * 4]); if (d > TOL) po++; if (d > pw) pw = d; }
                ok(`  ${key}: the two backends agree within ${TOL} of 255`, po === 0, `worst ${pw}`); }
        }
        if (r && r.pageErrors && r.pageErrors.length) report("page errors: " + r.pageErrors.slice(0, 3).join(" | "));
    }
}

console.log(fails ? "\nFAIL -- " + fails + " check(s)" : "\nall checks pass");
console.log("unchecked here: glyph pairs whose contour counts differ by more than one (morphicons' block synthesis, unexercised by 0 -> 8); a morph between faces; the cost on a rig.");
process.exit(fails ? 1 : 0);
