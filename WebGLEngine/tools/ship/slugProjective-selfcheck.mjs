#!/usr/bin/env node
// WebGLEngine/tools/ship/slugProjective-selfcheck.mjs -- v4496
//
// SLUG TEXT ROTATED AND IN PERSPECTIVE, HELD ON THE DEVICE (task 42). The flat gate (slugDevice-selfcheck) holds the
// orthographic case and says in its last line that perspective is unchecked. render/slugProjective.mjs carries the CPU
// side: SlugDilate once more on the CPU, rows for a rotation and for a text plane yawed and tilted under a real
// perspective projection, and a rasteriser model whose texcoords are PERSPECTIVE-CORRECT (tex/w and 1/w affine in
// screen space, divided at the pixel). Section 1 holds the module headless: dilateCpu under orthographic rows is the
// flat gate's half pixel per zw component; rotatedRows projects a hand-rotated point; perspectiveRows' w varies across
// the text by the ratio the placement was tuned to; the perspective-correct interpolation reduces to affine where w
// is constant and departs from it where w is not (the departure measured, so the model is shown to be doing
// something); quadsOf decodes buildVertices. Section 2, on both backends, for the ROTATED and the PERSPECTIVE case:
// the fragment's texcoord captured as bits and reproduced by the model over every lit pixel (the snapped-corner fit
// as the flat gate's), the lit footprint equal to the model's, the frame within 2 of 255 of slugEval through the
// model, and the two backends agreeing.
//
// MEASURED AT v4496 (Plex 28 px, "Sphinx 42% AV", 320 x 150): ROTATED 0.5 rad, the model reproduces the fragment's texcoord to
// 1.27e-7 em over 3,492 fragments at a 1/16 px snap and the frame is exact on both backends; PERSPECTIVE (yaw 0.6, tilt 0.5,
// w from 115 to 244 across the text, ratio 2.11), to 2.11e-7 em over 1,985 fragments, the frame exact on WebGPU and within 2
// of 255 on WebGL2 (180 pixels off by 1 or 2). An affine model is 0.635 em off under the perspective -- the same wrong number
// at every snap, which is what "not a snap" looks like. And SlugDilate under perspective does what it was designed for: at
// the far corner of the last glyph the vertex-space push is (0.522, -0.522) and ON SCREEN it is (0.500, 0.500) px -- half a
// pixel per axis, the same as the orthographic case, from a different push in vertex space.
//
// SABOTAGE (v4496): A  dilateCpu dropping the t term (the perspective part of SlugDilate)                    -> exit=1, red 4: the perspective model rows (the rotated case
//                      has t = 0 anyway, and stays green -- which is the point: t IS the perspective term) and the perspective frames (worst 118)
//                   B  the model interpolating texcoords affinely (no 1/w)                                     -> exit=1, red 5: the headless departure row (0.000 px), both perspective
//                      model rows and both perspective frames (worst 238); the rotated case stays green, as it should
//                   C  perspectiveRows ignoring yaw                                                            -> exit=1, red 1: the w-ratio row, headless. The browser cases pass, because
//                      the page draws whatever rows the builder made and the model reads the same rows -- a rows sabotage is a headless finding by design
//                   D  the frame key using the flat gate's emsPerPixel (constant) instead of the local one      -> exit=1, red 4: all four frames (rotated worst 41, perspective 88): the filter
//                      width is the 2x2 quad's own differences, and under a rotation it is already not 1/size per axis
//
// Run: node tools/ship/slugProjective-selfcheck.mjs      (~60 s)
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runInEngineOrigin, webgpuSkipReason } from "./webgpuHarness.mjs";
import { nullBackend } from "../../gfx/device.js";
import { parseFont } from "../../text/slugFont.js";
import { slugRender } from "../../text/slugEval.js";
import { layoutText, buildVertices } from "../../text/slugText.js";
import { SlugFontDevice } from "../../render/slugDevice.mjs";
import { dilateCpu, project, placeRows, rotatedRows, perspectiveRows, wRange, quadTriangles, quadsOf } from "../../render/slugProjective.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let fails = 0;
const ok = (label, cond, detail) => { if (!cond) fails++; console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}${detail ? "   " + detail : ""}`); };
const report = (s) => console.log(`  ----  ${s}`);
const sec = (s) => console.log("\n" + s);

const W = 320, H = 150, SIZE = 28, TEXT = "Sphinx 42% AV";
const CHARS = " " + TEXT + "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789.,%";
const TOL = 2, SUBPIXEL_CANDIDATES = [4, 8, 16, 32, 64, 128, 256, Infinity];
const ROT = { angle: 0.5, ox: 70, oy: 120 };
const PERSP = { yaw: 0.6, tilt: 0.5, dist: 180, ox: -101, oy: -6 };
const CASES = { rotated: (W, H) => rotatedRows(W, H, ROT.ox, ROT.oy, ROT.angle), perspective: (W, H) => perspectiveRows(W, H, PERSP) };

const font = parseFont(new Uint8Array(fs.readFileSync(path.join(ENG, "vendor/fonts/IBMPlexSerif-Regular.ttf"))));
const nb = nullBackend();
let fd = new SlugFontDevice(nb, font, CHARS, { logWidth: 11 });
const laid = layoutText(font, TEXT, { size: SIZE });
const builtFor = () => buildVertices(laid.glyphs, (gi) => fd.entryFor(gi), {});

sec("1. HEADLESS: the CPU dilation, the rows, the perspective-correct model");
{
    const o = placeRows(W, H, 10, 50);
    const d = dilateCpu([0, 0, -1, -1], [0.1, 0.2], [1 / SIZE, 0, 0, 1 / SIZE], o.subarray(0, 4), o.subarray(4, 8), o.subarray(12, 16), [W, H]);
    ok("under orthographic rows dilateCpu pushes half a pixel per zw component, and the texcoord by that over the size -- the flat gate's number", Math.abs(d.d[0] + 0.5) < 1e-7 && Math.abs(d.d[1] + 0.5) < 1e-7 && Math.abs(d.tex[0] - (0.1 - 0.5 / SIZE)) < 1e-9, `d ${d.d.map((v) => v.toFixed(6)).join(",")}`);
    const r = rotatedRows(W, H, 100, 100, 0.5), p = project(r, 10, 0, W, H), hx = 100 + 10 * Math.cos(0.5), hy = 100 - 10 * Math.sin(0.5);
    ok("rotatedRows projects a point where a hand rotation puts it, with w = 1", Math.abs(p.sx - hx) < 1e-6 && Math.abs(p.sy - hy) < 1e-6 && p.w === 1, `${p.sx.toFixed(3)},${p.sy.toFixed(3)} against ${hx.toFixed(3)},${hy.toFixed(3)}`);
    const P = CASES.perspective(W, H), corners = [[0, -8], [laid.width, -8], [0, 22], [laid.width, 22]], wr = wRange(P, corners, W, H);
    report(`the perspective placement: w from ${wr.lo.toFixed(1)} to ${wr.hi.toFixed(1)} across the text (ratio ${wr.ratio.toFixed(2)}); corners on screen ${corners.map(([x, y]) => { const q = project(P, x, y, W, H); return `(${q.sx.toFixed(0)},${q.sy.toFixed(0)})`; }).join(" ")}`);
    ok("perspectiveRows makes w vary by more than 1.8x across the text, and every corner lands inside the frame", wr.ratio > 1.8 && corners.every(([x, y]) => { const q = project(P, x, y, W, H); return q.sx > 0 && q.sx < W && q.sy > 0 && q.sy < H; }));
    ok("without yaw or tilt the same rows have w constant across the text (a control for the case above)", Math.abs(wRange(perspectiveRows(W, H, { ...PERSP, yaw: 0, tilt: 0 }), corners, W, H).ratio - 1) < 1e-9);
    const quads = quadsOf(builtFor());
    ok(`quadsOf decodes buildVertices: ${quads.length} quads, each corner's zw a (+-1, +-1) and its Jacobian the flat 1/size`, quads.length === laid.glyphs.filter((g) => { const e = fd.entryFor(g.glyphIndex); return e && !e.empty; }).length && quads.every((q) => q.corners.every((c) => Math.abs(c.pos[2]) === 1 && Math.abs(c.pos[3]) === 1 && Math.abs(c.jac[0] - 1 / SIZE) < 1e-6 && c.jac[1] === 0)));   // 1e-6: the stream is f32
    // the model: affine where w is constant, and measurably NOT affine where it is not
    const qa = quadTriangles(quads[0], CASES.rotated(W, H), W, H, Infinity), tri = qa.tris[0], C = tri.corners;
    const mid = [(C[0].sx + C[1].sx + C[2].sx) / 3, (C[0].sy + C[1].sy + C[2].sy) / 3], texMid = tri.at(mid[0], mid[1]);
    const affineMid = [(C[0].tex[0] + C[1].tex[0] + C[2].tex[0]) / 3, (C[0].tex[1] + C[1].tex[1] + C[2].tex[1]) / 3];
    ok("under the rotation (w = 1) the perspective-correct texcoord at a triangle's centroid IS the affine one", Math.abs(texMid[0] - affineMid[0]) < 1e-12 && Math.abs(texMid[1] - affineMid[1]) < 1e-12);
    const qp = quadTriangles(quads[quads.length - 1], P, W, H, Infinity), tp = qp.tris[0], Cp = tp.corners;
    const midp = [(Cp[0].sx + Cp[1].sx + Cp[2].sx) / 3, (Cp[0].sy + Cp[1].sy + Cp[2].sy) / 3], tm = tp.at(midp[0], midp[1]), am = [(Cp[0].tex[0] + Cp[1].tex[0] + Cp[2].tex[0]) / 3, (Cp[0].tex[1] + Cp[1].tex[1] + Cp[2].tex[1]) / 3];
    const dep = Math.hypot(tm[0] - am[0], tm[1] - am[1]) * SIZE;
    ok(`under the perspective the two differ at the last glyph's centroid by ${dep.toFixed(3)} px -- the model is doing something the affine one cannot`, dep > 0.01);
    const dl = qp.corners[1].dil, base = project(P, quads[quads.length - 1].corners[1].pos[0], quads[quads.length - 1].corners[1].pos[1], W, H);
    report(`the dilation under perspective at the last glyph's far corner: vertex-space push (${dl.d[0].toFixed(3)}, ${dl.d[1].toFixed(3)}), on screen (${(qp.corners[1].screen.sx - base.sx).toFixed(3)}, ${(qp.corners[1].screen.sy - base.sy).toFixed(3)}) px`);
}

const bitsToF32 = (px, i, j) => { const o = (j * W + i) * 4; return new Float32Array(new Uint8Array([px[o], px[o + 1], px[o + 2], px[o + 3]]).buffer)[0]; };
function modelTris(rows, Q) { const out = []; for (const q of quadsOf(builtFor())) out.push(...quadTriangles(q, rows, W, H, Q).tris.map((t) => ({ ...t, e: fd.entryFor(laid.glyphs.filter((g) => { const e = fd.entryFor(g.glyphIndex); return e && !e.empty; })[q.q].glyphIndex) }))); return out.reverse(); }
function fit(rows, cap) {
    const results = [];
    for (const Q of SUBPIXEL_CANDIDATES) {
        const tris = modelTris(rows, Q); let worst = 0, n = 0, orphan = 0;
        for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) { const mtx = bitsToF32(cap.tx, i, j); if (mtx === 0) continue; const x = i + 0.5, y = j + 0.5; let hit = false;
            for (const t of tris) { if (!t.inside(x, y)) continue; const [tx, ty] = t.at(x, y); n++; hit = true; worst = Math.max(worst, Math.abs(tx - mtx), Math.abs(ty - bitsToF32(cap.ty, i, j))); break; }
            if (!hit) orphan++; }
        results.push({ Q, worst, n, orphan });
    }
    results.sort((a, b) => a.worst - b.worst); return { best: results[0], all: results };
}
/** the frame key: coverage at the model's texcoord with the fragment's own filter width -- the 2x2 quad's finite differences, as fwidth is */
function expectedFrame(rows, Q, localFw = true) {
    const tris = modelTris(rows, Q), out = new Float32Array(W * H);
    for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
        const x = i + 0.5, y = j + 0.5; let acc = 0;
        for (const t of tris) { if (!t.inside(x, y)) continue;
            const [tx, ty] = t.at(x, y);
            let fw;
            if (localFw) { const x0 = (i & ~1) + 0.5, y0 = (j & ~1) + 0.5, a = t.at(x0, y0), b = t.at(x0 + 1, y0), c = t.at(x0, y0 + 1); fw = [Math.abs(b[0] - a[0]) + Math.abs(c[0] - a[0]), Math.abs(b[1] - a[1]) + Math.abs(c[1] - a[1])]; }
            else fw = [1 / SIZE, 1 / SIZE];
            acc = slugRender(fd.atlas, t.e, tx, ty, fw) + acc * (1 - slugRender(fd.atlas, t.e, tx, ty, fw)); }
        out[j * W + i] = acc;
    }
    return out;
}

sec("2. THE FRAME, ON BOTH BACKENDS, ROTATED AND IN PERSPECTIVE: the captured texcoord against the perspective-correct model, and slugEval through it");
{
    const skip = webgpuSkipReason();
    if (skip) { console.log(`  SKIP  ${skip}`); report("*** NOT A PASS. ***"); fails++; }
    else {
        const rowsIn = { rotated: Array.from(CASES.rotated(W, H)), perspective: Array.from(CASES.perspective(W, H)) };
        const r = await runInEngineOrigin({ engineRoot: ENG, args: { W, H, SIZE, TEXT, CHARS, ROWS: rowsIn }, script: `async (a) => {
            const { requestDevice } = await import("/gfx/device.js");
            const { parseFont } = await import("/text/slugFont.js");
            const M = await import("/render/slugDevice.mjs");
            const font = parseFont(await (await fetch("/vendor/fonts/IBMPlexSerif-Regular.ttf")).arrayBuffer());
            const { W, H, SIZE, TEXT, CHARS, ROWS } = a; const out = {};
            for (const backend of ["webgpu", "webgl2"]) {
                const cv = document.createElement("canvas"); cv.width = W; cv.height = H;
                const dev = await requestDevice(cv, { backend, offscreen: backend === "webgpu" });
                const o = { backend: dev.backend, cases: {}, errs: [] };
                const fd = new M.SlugFontDevice(dev, font, CHARS); o.logWidth = fd.logWidth;
                const b = new M.SlugDeviceBatch(fd); b.set(TEXT, { size: SIZE, color: [1, 1, 1, 1] });
                for (const name of Object.keys(ROWS)) {
                    const rows = new Float32Array(ROWS[name]); const c = { cap: {} };
                    const fr = await dev.frame(({ pass }) => { pass.clear([0, 0, 0, 1]); b.draw(pass, rows, [W, H]); }, { read: true }); c.pixels = Array.from(fr.pixels);
                    for (const what of ["tx", "ty"]) {
                        let d; try { d = M.slugCaptureDesc(fd.logWidth, what); } catch (e) { o.errs.push(what + ": " + e.message); continue; }
                        const pipe = dev.pipeline(d); if (pipe.compiled) { const err = await pipe.compiled; if (err) { o.errs.push(what + ": " + err); continue; } }
                        const cf = await dev.frame(({ pass }) => { pass.clear([0, 0, 0, 0]); pass.use(pipe); for (let i = 0; i < 4; i++) pass.uniform("m" + i, rows.subarray(i * 4, i * 4 + 4)); pass.uniform("viewport", [W, H]);
                            pass.texture("curveTexture", fd.curveTexture, 0); pass.texture("bandTexture", fd.bandTexture, 1); pass.vertices(b.vb); pass.indices(b.ib); pass.drawIndexed(b.indexCount); }, { read: true });
                        c.cap[what] = Array.from(cf.pixels);
                    }
                    o.cases[name] = c;
                }
                b.destroy(); fd.destroy(); dev.destroy(); out[backend] = o;
            }
            return out;
        }` });
        ok("*** both backends drew the rotated and the perspective text and captured the texcoords ***", r.ok && r.result && r.result.webgpu && r.result.webgl2 && r.result.webgpu.errs.length === 0 && r.result.webgl2.errs.length === 0, r.ok ? (r.result.webgpu.errs.concat(r.result.webgl2.errs).join(" | ") || "") : (r.error || (r.pageErrors || []).join(" | ")).slice(0, 300));
        if (r.ok) {
            fd = new SlugFontDevice(nb, font, CHARS, { logWidth: r.result.webgl2.logWidth });
            for (const name of ["rotated", "perspective"]) {
                const rows = CASES[name](W, H);
                for (const bk of ["webgpu", "webgl2"]) {
                    const c = r.result[bk].cases[name];
                    const f = fit(rows, c.cap);
                    report(`${name} / ${bk}: fit -- ` + f.all.map((x) => `1/${x.Q}: ${x.worst.toExponential(2)}`).join("  ") + `; ${f.best.orphan} lit fragments outside every model triangle`);
                    const tol = name === "rotated" ? 1e-6 : 1e-5;
                    ok(`*** ${name} / ${bk}: the perspective-correct model reproduces the fragment's texcoord to ${tol} em over ${f.best.n} fragments (1/${f.best.Q} px), none lit outside it ***`, f.best.worst < tol && f.best.n > 1500 && f.best.orphan === 0, `worst ${f.best.worst.toExponential(2)} em`);
                    const key = expectedFrame(rows, f.best.Q);
                    const lit = key.filter((v) => v > 0.02).length; let worst = 0, over = 0, exact = 0, at = -1;
                    for (let i = 0; i < W * H; i++) { const want = Math.round(key[i] * 255), got = c.pixels[i * 4], d = Math.abs(got - want); if (d === 0) exact++; if (d > TOL) over++; if (d > worst) { worst = d; at = i; } }
                    ok(`  ${name} / ${bk}: every pixel within ${TOL} of 255 of slugEval through the model with the fragment's own filter width`, over === 0 && lit > 500, `worst ${worst} at (${at % W}, ${Math.floor(at / W)}), ${exact} of ${W * H} exact, ${lit} lit`);
                }
                const G = r.result.webgpu.cases[name].pixels, L = r.result.webgl2.cases[name].pixels; let pw = 0, po = 0;
                for (let i = 0; i < W * H; i++) { const d = Math.abs(G[i * 4] - L[i * 4]); if (d > TOL) po++; if (d > pw) pw = d; }
                ok(`  ${name}: the two backends agree within ${TOL} of 255 on every pixel`, po === 0, `worst ${pw}`);
            }
        }
        if (r && r.pageErrors && r.pageErrors.length) report("page errors: " + r.pageErrors.slice(0, 3).join(" | "));
    }
}

console.log(fails ? "\nFAIL -- " + fails + " check(s)" : "\nall checks pass");
console.log("unchecked here: a depth test against a scene (the text is drawn alone); text on a curve in perspective; the cost of a projective draw on a rig.");
process.exit(fails ? 1 : 0);
