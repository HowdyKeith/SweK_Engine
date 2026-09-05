#!/usr/bin/env node
// WebGLEngine/tools/ship/slugCurve-selfcheck.mjs -- v4491
//
// CURVED SLUG TEXT (docs/TSL-ROADMAP.md step 7 item 10, task 10): text/slugCurve.mjs cuts each glyph into strips along
// a curve, each strip with its midpoint frame's Jacobian and its edges at their own normals. Section 1 holds the module
// headless: the straight line with one strip is buildVertices' own stream to the float; the arc's inverse round-trips
// and its branch hint is load-bearing (text longer than pi r); adjacent strips share their edge exactly and push only
// along the normal there; the TEXCOORD ERROR against the arc's exact inverse converges as the strips double, and one
// bent quad (the thing the roadmap says never to do) is measured beside it; stripsFor's chord bound is measured for
// what it buys in texcoord error, which is not the number it promises. Section 2 draws the strips through
// render/slugDevice.mjs on both backends and holds the frame to slugEval through the flat gate's rasteriser model
// (snapped dilated corners, affine texcoords per triangle) and reports the pixels where the exact planar resample
// disagrees -- the tessellation's visible cost.
//
// MEASURED AT v4491 (Plex, "Sphinx 42% AV" at 28 px, 202 px long): on r = 120 the worst texcoord error is 0.84 px with
// ONE bent quad per glyph, 0.35 / 0.17 / 0.08 / 0.04 px with 2 / 4 / 8 / 16 strips -- halving per doubling, FIRST order,
// because each strip is a trapezoid (its far edge shorter by height over radius) and two affine triangles cannot
// interpolate a trapezoid exactly; the chord-sag bound is second order and is not the bound that matters. stripsFor
// at 0.25 px buys 0.51 px worst texcoord error there: about twice the tolerance it was asked for, and the gate says so
// rather than the docstring promising 0.25. The first probe read 377 px on r = 60: the inverse took the branch nearest
// theta0 for text spanning 3.4 rad, and the hint was added for it.
//
// SABOTAGE (v4491): A  the strip's Jacobian left as the flat (invS, 0, 0, invS)                          -> FIRST exit=1 with 2 red, BOTH the visible-cost rows and
//                      NEITHER of the headless ones: the rasteriser model reads the same wrong Jacobian from the records and reproduces the device
//                      exactly, and the headless hold ("orthogonal rows of norm 1/size") is a property the flat Jacobian also has. The hold is now the
//                      midpoint frame itself (T/s, N/s). Re-run -> exit=1, red: the Jacobian row by name and the two cost rows
//                   B  interior edges given the outer corners' tangent push (nx = +-1 everywhere)         -> exit=1, red 7: the seam row (3 tangent pushes), the model
//                      missing the texcoord by 3.6e-3 em, the frame off by 56 of 255, the cost rows (a seam pushed from both sides double-blends)
//                   C  corners placed with the STRIP MIDPOINT's normal instead of each edge's own         -> exit=1, red 8: 77 cracks, the bent quad at 1.06 px, stripsFor's
//                      buy at 0.68, r = 60 at 0.115, the frame off by 255 (a crack is a hole) and the cost rows
//                   D  setBuilt uploading buildVertices' flat stream instead of the curved one            -> exit=1, red 6: the model matches no fragment (0 over 0), the frame
//                      off by 255 on both backends, the cost rows
//
// Run: node tools/ship/slugCurve-selfcheck.mjs      (~40 s; section 1 is headless)
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
import { arcCurve, lineCurve, stripsFor, buildCurvedVertices, tessellationError } from "../../text/slugCurve.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let fails = 0;
const ok = (label, cond, detail) => { if (!cond) fails++; console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}${detail ? "   " + detail : ""}`); };
const report = (s) => console.log(`  ----  ${s}`);
const sec = (s) => console.log("\n" + s);

const W = 320, H = 150, SIZE = 28, ORIGIN = [160, 148];       // screen pixel of vertex-space (0, 0), y up; the arc's centre is there, its top 28 px below the frame's top
const TEXT = "Sphinx 42% AV";
const CHARS = " " + TEXT + "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789.,%";
const RADIUS = 120, STRIPS = 8, TOL = 2;
const SUBPIXEL_CANDIDATES = [4, 8, 16, 32, 64, 128, 256, Infinity];
const MODEL_TOL_EM = 1e-6;

const font = parseFont(new Uint8Array(fs.readFileSync(path.join(ENG, "vendor/fonts/IBMPlexSerif-Regular.ttf"))));
const nb = nullBackend();
let fd = new SlugFontDevice(nb, font, CHARS, { logWidth: 11 });   // section 2 rebuilds it at the browser's logWidth, as the flat gate does
const entryFor = (gi) => fd.entryFor(gi);
const laid = layoutText(font, TEXT, { size: SIZE });
const arcFor = (r) => arcCurve({ cx: 0, cy: 0, r, theta0: Math.PI / 2 + laid.width / (2 * r), ccw: false });   // text reads along the top

sec("1. HEADLESS: the line control, the inverse, the seams, the error and its convergence");
{
    const flat = new Float32Array(buildVertices(laid.glyphs, entryFor, {}).buffer);
    const line = buildCurvedVertices(laid.glyphs, entryFor, lineCurve(), { strips: 1 });
    let diff = 0; const lf = new Float32Array(line.buffer); for (let i = 0; i < flat.length; i++) if (flat[i] !== lf[i]) diff++;
    ok("CONTROL: on a straight line with one strip, the curved stream IS buildVertices' stream, float for float", diff === 0 && flat.length === lf.length && lf.length > 0, `${diff} of ${flat.length} floats differ`);

    const c = arcCurve({ cx: 3, cy: -2, r: 50, theta0: 1.1, ccw: true });
    let worst = 0; for (let u = -40; u <= 40; u += 5) for (const v of [-10, 0, 7]) { const P = c.pointAt(u), N = c.normalAt(u); const [uu, vv] = c.invert(P[0] + N[0] * v, P[1] + N[1] * v, u); worst = Math.max(worst, Math.abs(uu - u), Math.abs(vv - v)); }
    ok("the arc's inverse round-trips pointAt + normalAt to floating point", worst < 1e-9, `worst ${worst.toExponential(2)}`);
    const far = arcFor(60), uFar = laid.width - 2, Pf = far.pointAt(uFar);
    const hinted = far.invert(Pf[0], Pf[1], uFar)[0], unhinted = far.invert(Pf[0], Pf[1])[0];
    ok("*** the branch hint is load-bearing: 202 px of text on r = 60 spans more than pi, and the far end inverts right only with it ***",
        Math.abs(hinted - uFar) < 1e-9 && Math.abs(unhinted - uFar) > 100, `hinted ${hinted.toFixed(3)}, unhinted ${unhinted.toFixed(3)}, true ${uFar.toFixed(3)}`);
    const T0 = far.tangentAt(0), N0 = far.normalAt(0);
    ok("the frame is right-handed like (x, y): N = perp(T) with T x N = +1", Math.abs(T0[0] * N0[1] - T0[1] * N0[0] - 1) < 1e-12 && Math.abs(Math.hypot(...T0) - 1) < 1e-12);

    const curve = arcFor(RADIUS), built = buildCurvedVertices(laid.glyphs, entryFor, curve, { strips: STRIPS });
    let seams = 0, cracks = 0, tangentPush = 0, badJac = 0;
    for (let i = 0; i + 1 < built.records.length; i++) {
        const a = built.records[i], b = built.records[i + 1]; if (a.g !== b.g) continue;
        seams++;
        if (a.corners[1].px !== b.corners[0].px || a.corners[1].py !== b.corners[0].py || a.corners[2].px !== b.corners[3].px || a.corners[2].py !== b.corners[3].py) cracks++;
        const Te = curve.tangentAt(a.xb);
        for (const cn of [a.corners[1], a.corners[2], b.corners[0], b.corners[3]]) if (Math.abs(cn.ox * Te[0] + cn.oy * Te[1]) > 1e-12) tangentPush++;
    }
    // the flat (1/s, 0, 0, 1/s) is a rotation over the size too -- sabotage A left it and only the visible-cost row caught it, so
    // the hold is the midpoint frame ITSELF, not a property it shares with the wrong answer
    for (const r of built.records) { const [a, b, c2, d] = r.jac, s = r.g.size, T = curve.tangentAt((r.xa + r.xb) / 2), N = curve.normalAt((r.xa + r.xb) / 2);
        if (Math.abs(a - T[0] / s) > 1e-12 || Math.abs(b - T[1] / s) > 1e-12 || Math.abs(c2 - N[0] / s) > 1e-12 || Math.abs(d - N[1] / s) > 1e-12) badJac++; }
    ok(`adjacent strips share their edge EXACTLY (same floats) and push only along the normal there: ${seams} seams, no crack, no tangent push`, seams > 40 && cracks === 0 && tangentPush === 0, `${cracks} cracks, ${tangentPush} tangent pushes`);
    const inked = laid.glyphs.filter((g) => { const e = entryFor(g.glyphIndex); return e && !e.empty; }).length;
    ok("every strip's Jacobian IS its midpoint frame over the size (T/s, N/s) -- not merely a rotation, which the flat one also is -- and every inked glyph has its strips", badJac === 0 && built.records.length === inked * STRIPS, `${badJac} bad of ${built.records.length}; ${inked} inked glyphs x ${STRIPS}`);

    const errs = [1, 2, 4, 8, 16].map((n) => ({ n, e: tessellationError(buildCurvedVertices(laid.glyphs, entryFor, curve, { strips: n }), curve, 8) }));
    report("r = 120, worst texcoord error in px by strips per glyph: " + errs.map(({ n, e }) => `${n}: ${e.worstPx.toFixed(3)}`).join("  "));
    const ratios = errs.slice(1).map((x, i) => errs[i].e.worstPx / x.e.worstPx);
    ok(`*** the error halves as the strips double (first order: a strip is a trapezoid): ratios ${ratios.map((r) => r.toFixed(2)).join(" / ")} ***`, ratios.every((r) => r > 1.8 && r < 2.6));
    ok(`*** ONE BENT QUAD PER GLYPH IS WRONG BY ${errs[0].e.worstPx.toFixed(2)} px -- more than the half-pixel dilation it corrupts; eight strips are under a tenth ***`, errs[0].e.worstPx > 0.5 && errs[3].e.worstPx < 0.1);
    const auto = buildCurvedVertices(laid.glyphs, entryFor, curve, {}), ae = tessellationError(auto, curve, 8);
    ok(`stripsFor at 0.25 px chord sag buys ${ae.worstPx.toFixed(2)} px worst texcoord error at r = 120 -- about twice what it was asked for, said plainly`, ae.worstPx > 0.25 && ae.worstPx < 0.6 && auto.strips > laid.glyphs.length, `${auto.strips} strips for ${laid.glyphs.length} glyphs`);
    ok("stripsFor is 1 on a straight line and grows with width over root radius", stripsFor(100, Infinity) === 1 && stripsFor(100, 100) > stripsFor(100, 400) && stripsFor(0, 100) === 1, `${stripsFor(100, 100)} at r 100, ${stripsFor(100, 400)} at r 400`);
    const tight = arcFor(60), te = tessellationError(buildCurvedVertices(laid.glyphs, entryFor, tight, { strips: 16 }), tight, 8);
    ok(`on r = 60 (3.4 rad of text) sixteen strips hold under a tenth of a pixel`, te.worstPx < 0.1, `${te.worstPx.toFixed(3)} px`);
}

/* the rasteriser model of the flat gate, fed the strips' corners: dilate half a pixel along the outward direction, carry the
 * push into texcoords through the strip's Jacobian, snap corners to 1/Q px, affine texcoords per triangle */
function curvedTris(records, Q) {
    const [ox, oy] = ORIGIN, tris = [];
    for (const r of records) {
        // SlugDilate under an orthographic matrix: d = pos.zw * 0.5 -- HALF A PIXEL PER COMPONENT OF zw, not along its unit
        // vector (the flat gate's "half a pixel per axis"). An outer corner's zw = +-T +-N has length root 2 and moves 0.707 px;
        // an interior corner's zw = +-N moves 0.5. A first draft normalised zw and pushed 0.5 along it; the model then missed
        // the device's texcoord by 5e-4 em on every fragment and owned none of the outermost pixels. The texcoord moves by d . jac.
        const C = r.corners.map((c) => {
            const dx = 0.5 * c.ox, dy = 0.5 * c.oy;
            const X = c.px + dx, Y = c.py + dy;
            let sx = X + ox, sy = oy - Y; if (isFinite(Q)) { sx = Math.round(sx * Q) / Q; sy = Math.round(sy * Q) / Q; }
            return { sx, sy, tx: c.ex + (dx * r.jac[0] + dy * r.jac[1]), ty: c.ey + (dx * r.jac[2] + dy * r.jac[3]) };
        });
        for (const [a, b, c] of [[0, 1, 2], [0, 2, 3]]) {
            const A = C[a], B = C[b], K = C[c];
            const det = (B.sx - A.sx) * (K.sy - A.sy) - (K.sx - A.sx) * (B.sy - A.sy);
            const dx = (k) => ((B[k] - A[k]) * (K.sy - A.sy) - (K[k] - A[k]) * (B.sy - A.sy)) / det;
            const dy = (k) => ((K[k] - A[k]) * (B.sx - A.sx) - (B[k] - A[k]) * (K.sx - A.sx)) / det;
            const m = { txdx: dx("tx"), txdy: dy("tx"), tydx: dx("ty"), tydy: dy("ty") };
            m.tx0 = A.tx - m.txdx * A.sx - m.txdy * A.sy; m.ty0 = A.ty - m.tydx * A.sx - m.tydy * A.sy;
            const inside = (x, y) => { const s1 = (B.sx - A.sx) * (y - A.sy) - (B.sy - A.sy) * (x - A.sx), s2 = (K.sx - B.sx) * (y - B.sy) - (K.sy - B.sy) * (x - B.sx), s3 = (A.sx - K.sx) * (y - K.sy) - (A.sy - K.sy) * (x - K.sx);
                return (s1 >= 0 && s2 >= 0 && s3 >= 0) || (s1 <= 0 && s2 <= 0 && s3 <= 0); };
            tris.push({ e: r.e, m, inside });
        }
    }
    return tris.reverse();          // the last triangle drawn owns a pixel (v4485)
}
const bitsToF32 = (px, i, j) => { const o = (j * W + i) * 4; return new Float32Array(new Uint8Array([px[o], px[o + 1], px[o + 2], px[o + 3]]).buffer)[0]; };
function fitSubpixel(records, cap) {
    const results = [];
    for (const Q of SUBPIXEL_CANDIDATES) {
        const tris = curvedTris(records, Q); let worst = 0, n = 0;
        for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
            const mtx = bitsToF32(cap.tx, i, j); if (mtx === 0) continue;
            const x = i + 0.5, y = j + 0.5;
            for (const t of tris) { if (!t.inside(x, y)) continue; const m = t.m; n++; worst = Math.max(worst, Math.abs(m.tx0 + m.txdx * x + m.txdy * y - mtx), Math.abs(m.ty0 + m.tydx * x + m.tydy * y - bitsToF32(cap.ty, i, j))); break; }
        }
        results.push({ Q, worst, n });
    }
    results.sort((a, b) => a.worst - b.worst);
    return { best: results[0], all: results };
}
function expectedFrame(records, Q) {
    const tris = curvedTris(records, Q), out = new Float32Array(W * H);
    for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
        const x = i + 0.5, y = j + 0.5; let acc = 0;
        for (const t of tris) { if (!t.inside(x, y)) continue; const m = t.m;
            const cov = slugRender(fd.atlas, t.e, m.tx0 + m.txdx * x + m.txdy * y, m.ty0 + m.tydx * x + m.tydy * y, [Math.abs(m.txdx) + Math.abs(m.txdy), Math.abs(m.tydx) + Math.abs(m.tydy)]);
            acc = cov + acc * (1 - cov); }
        out[j * W + i] = acc;
    }
    return out;
}
/** the planar target resampled: every pixel's centre inverted through the arc to its flat position, the glyph there evaluated at
 * the EXACT texcoord -- with the flat quad's half-pixel dilation (ink reaches half a pixel past the bbox on each axis) and the
 * filter width the fragment would see there (fwidth of a texcoord rotated by the local frame: (|T.x| + |T.y|) / size on x,
 * (|N.x| + |N.y|) / size on y), so that what is counted afterwards is the tessellation's texcoord error and nothing else */
function exactFrame(curve) {
    const [ox, oy] = ORIGIN, out = new Float32Array(W * H);
    const spans = laid.glyphs.map((g) => { const e = entryFor(g.glyphIndex); return e && !e.empty ? { g, e, xa: g.x + e.bbox.x0 * g.size - 0.5, xb: g.x + e.bbox.x1 * g.size + 0.5, ya: g.y + e.bbox.y0 * g.size - 0.5, yb: g.y + e.bbox.y1 * g.size + 0.5 } : null; }).filter(Boolean);
    for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
        const X = i + 0.5 - ox, Y = oy - (j + 0.5);
        const [u, v] = curve.invert(X, Y, laid.width / 2); let acc = 0;
        const T = curve.tangentAt(u), N = curve.normalAt(u);
        for (const s of spans) { if (u < s.xa || u > s.xb || v < s.ya || v > s.yb) continue;
            const cov = slugRender(fd.atlas, s.e, (u - s.g.x) / s.g.size, (v - s.g.y) / s.g.size, [(Math.abs(T[0]) + Math.abs(T[1])) / s.g.size, (Math.abs(N[0]) + Math.abs(N[1])) / s.g.size]); acc = cov + acc * (1 - cov); }
        out[j * W + i] = acc;
    }
    return out;
}

sec("2. THE FRAME, ON BOTH BACKENDS: the strips through render/slugDevice.mjs against the rasteriser model, and the exact resample's disagreement counted");
{
    const skip = webgpuSkipReason();
    if (skip) { console.log(`  SKIP  ${skip}`); report("*** NOT A PASS. ***"); fails++; }
    else {
        const r = await runInEngineOrigin({ engineRoot: ENG, args: { W, H, SIZE, ORIGIN, TEXT, CHARS, RADIUS, STRIPS }, script: `async (a) => {
            const { requestDevice } = await import("/gfx/device.js");
            const { parseFont } = await import("/text/slugFont.js");
            const M = await import("/render/slugDevice.mjs");
            const { layoutText } = await import("/text/slugText.js");
            const { arcCurve, buildCurvedVertices } = await import("/text/slugCurve.mjs");
            const font = parseFont(await (await fetch("/vendor/fonts/IBMPlexSerif-Regular.ttf")).arrayBuffer());
            const { W, H, SIZE, TEXT, CHARS, RADIUS, STRIPS } = a; const [px, py] = a.ORIGIN;
            const rows = new Float32Array([2 / W, 0, 0, (2 / W) * px - 1, 0, 2 / H, 0, 1 - (2 / H) * py, 0, 0, 0, 0, 0, 0, 0, 1]);
            const out = {};
            for (const backend of ["webgpu", "webgl2"]) {
                const cv = document.createElement("canvas"); cv.width = W; cv.height = H;
                const dev = await requestDevice(cv, { backend, offscreen: backend === "webgpu" });
                const o = { backend: dev.backend, cap: {}, capErrors: [] };
                const fd = new M.SlugFontDevice(dev, font, CHARS);
                o.logWidth = fd.logWidth;
                const laid = layoutText(font, TEXT, { size: SIZE });
                const curve = arcCurve({ cx: 0, cy: 0, r: RADIUS, theta0: Math.PI / 2 + laid.width / (2 * RADIUS), ccw: false });
                const built = buildCurvedVertices(laid.glyphs, (gi) => fd.entryFor(gi), curve, { strips: STRIPS, color: [1, 1, 1, 1] });
                const b = new M.SlugDeviceBatch(fd); b.setBuilt(built, laid); o.quads = b.quads; o.strips = built.strips;
                const fr = await dev.frame(({ pass }) => { pass.clear([0, 0, 0, 1]); b.draw(pass, rows, [W, H]); }, { read: true });
                o.pixels = Array.from(fr.pixels);
                for (const what of ["tx", "ty"]) {
                    let d; try { d = M.slugCaptureDesc(fd.logWidth, what); } catch (e) { o.capErrors.push(what + ": " + e.message); continue; }
                    const pipe = dev.pipeline(d);
                    if (pipe.compiled) { const err = await pipe.compiled; if (err) { o.capErrors.push(what + ": " + err); continue; } }
                    const cf = await dev.frame(({ pass }) => { pass.clear([0, 0, 0, 0]); pass.use(pipe); for (let i = 0; i < 4; i++) pass.uniform("m" + i, rows.subarray(i * 4, i * 4 + 4)); pass.uniform("viewport", [W, H]);
                        pass.texture("curveTexture", fd.curveTexture, 0); pass.texture("bandTexture", fd.bandTexture, 1); pass.vertices(b.vb); pass.indices(b.ib); pass.drawIndexed(b.indexCount); }, { read: true });
                    o.cap[what] = Array.from(cf.pixels);
                }
                b.destroy(); fd.destroy(); dev.destroy();
                out[backend] = o;
            }
            return out;
        }` });
        ok("*** both backends drew curved Slug text through gfx/device.js from setBuilt ***", r.ok && r.result && r.result.webgpu && r.result.webgl2, r.ok ? `${r.result.webgpu.strips} strips on each` : (r.error || (r.pageErrors || []).join(" | ")).slice(0, 300));
        if (r.ok) {
            fd = new SlugFontDevice(nb, font, CHARS, { logWidth: r.result.webgl2.logWidth });
            const curve = arcFor(RADIUS), built = buildCurvedVertices(laid.glyphs, entryFor, curve, { strips: STRIPS });
            const exact = exactFrame(curve);
            for (const bk of ["webgpu", "webgl2"]) {
                const o = r.result[bk];
                ok(`${bk}: the texcoord captures compiled and drew`, o.capErrors.length === 0 && Object.keys(o.cap).length === 2 && o.strips === built.strips && o.logWidth === fd.logWidth, o.capErrors.join(" | ") || `logWidth ${o.logWidth}`);
                if (o.capErrors.length) continue;
                const fit = fitSubpixel(built.records, o.cap);
                ok(`*** ${bk}: the snapped-corner model with the STRIPS' Jacobians reproduces the fragment's texcoord to ${MODEL_TOL_EM} em ***`, fit.best.worst < MODEL_TOL_EM && fit.best.n > 1000,
                    `worst ${fit.best.worst.toExponential(2)} em over ${fit.best.n} fragments at 1/${fit.best.Q}`);
                const key = expectedFrame(built.records, fit.best.Q);
                const lit = key.filter((v) => v > 0.02).length, partial = key.filter((v) => v > 0.02 && v < 0.98).length;
                ok(`  ${bk}: CONTROL -- the key has ink and antialiased edges`, lit > 500 && partial > 200, `${lit} lit, ${partial} partial`);
                let worst = 0, over = 0, exactN = 0, worstAt = -1, exOver = 0, exWorst = 0, exWorstAt = -1, exBig = 0, exSum = 0, exN = 0;
                for (let i = 0; i < W * H; i++) {
                    const want = Math.round(key[i] * 255), got = o.pixels[i * 4], d = Math.abs(got - want);
                    if (d === 0) exactN++; if (d > TOL) over++; if (d > worst) { worst = d; worstAt = i; }
                    const ex = Math.round(exact[i] * 255); if (got < 5 && ex < 5) continue;
                    const de = Math.abs(got - ex); exN++; exSum += de; if (de > TOL) exOver++; if (de > 32) exBig++; if (de > exWorst) { exWorst = de; exWorstAt = i; }
                }
                ok(`*** ${bk}: every pixel within ${TOL} of 255 of slugEval through the model -- the dilation and the Jacobian are right per strip ***`, over === 0,
                    `worst ${worst} at (${worstAt % W}, ${Math.floor(worstAt / W)}), ${exactN} of ${W * H} exact`);
                // THE TESSELLATION'S VISIBLE COST, COUNTED AND NOT PRESUMED. A first draft held "fewer than 3% of the lit pixels differ by more
                // than 2": measured, MORE THAN HALF do -- a 0.08 px texcoord error moves every antialiased edge by a few levels of 255, and
                // 1,750 lit pixels are mostly edge. The mean is what the strips cost (5.0 of 255 at 8 strips; held under 7 for a box whose device differs from the model by the 2 the flat gate allows). The worst (89) is not the
                // strips': the shipped evaluator's coverage STEPS from 0.000 to 0.346 across 0.0002 em at A's texcoord (0.4341, 0.0537) --
                // sampled on slugEval, same band index (3) on both sides, so not a band boundary -- and the interpolated texcoord lands on
                // the other side of that step from the exact one. The device draws what slugEval says at its texcoord (the row above).
                report(`${bk}: against the EXACT planar resample over ${exN} lit pixels: ${exOver} differ by more than ${TOL}, ${exBig} by more than 32, mean ${(exSum / exN).toFixed(2)} of 255, worst ${exWorst} at (${exWorstAt % W}, ${Math.floor(exWorstAt / W)})`);
                ok(`  ${bk}: the strips cost under 7 of 255 on average over the lit pixels, and fewer than 1% of them sit across a coverage step`, exSum / exN < 7 && exBig < exN * 0.01 && exN > 500);
                ok(`  ${bk}: the frame is not blank and alpha is 1`, o.pixels.some((v, i) => i % 4 === 0 && v > 128) && o.pixels.every((v, i) => i % 4 !== 3 || v === 255));
            }
            const L = r.result.webgl2.pixels, G = r.result.webgpu.pixels; let pw = 0, po = 0;
            for (let i = 0; i < W * H; i++) { const d = Math.abs(G[i * 4] - L[i * 4]); if (d > TOL) po++; if (d > pw) pw = d; }
            ok(`*** the two backends agree within ${TOL} of 255 on every pixel of the curved text ***`, po === 0, `worst ${pw}`);
        }
        if (r && r.pageErrors && r.pageErrors.length) report("page errors: " + r.pageErrors.slice(0, 3).join(" | "));
    }
}

console.log(fails ? "\nFAIL -- " + fails + " check(s)" : "\nall checks pass");
console.log("unchecked here: a curve that is not a circle (the inverse is closed-form only there; a spline would need a search); text in perspective on a curve; the cost of the extra strips on a rig (slug-rig.html's question).");
process.exit(fails ? 1 : 0);
