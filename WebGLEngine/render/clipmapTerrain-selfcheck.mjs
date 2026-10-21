// WebGLEngine/render/clipmapTerrain-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time). (~6 s)
//
// Run: node render/clipmapTerrain-selfcheck.mjs
//
// THE CLIPMAP, HELD TO UPSTREAM'S TEXT AND TO ITS OWN CRACK-FREE CLAIM:
//   1  LIFTED     placeClipmapVertex's body and the bicubic weights are upstream's lib/clipmap.wgsl, statement for statement;
//   2  THE MESH   the upstream counts: 207,368 vertices and 332,936 triangles at 160 x 8, the index list is in range, each ring's quads respect the hole, the winding is one way, the whole clipmap reaches 870.4 m
//                 from the camera (upstream's lib/deform.wgsl comment says "870 m ACROSS": measured, it is the half-extent -- recorded as a finding, not repeated);
//   3  THE RULES  the ring origin is a multiple of twice the ring's spacing and does not move while the camera stays inside a snap cell; the morph is 0 inside 0.70 of the ring and 1 from 0.86; at morph 1 a vertex
//                 sits on the coarser lattice of its own ring AND on the next ring's lattice (for random cameras: every outer-band vertex of ring L lies on ring L+1's lattice, exactly);
//   4  NO GAPS    on a reduced clipmap (32 quads, 4 rings), for random cameras, every random point out to (outer extent - 2 x the outermost spacing) lies in at least one drawn triangle: no crack, no hole between rings; and with the
//                 hole shrink removed the same test is run and its count printed, to show the test can see a gap;
//   5  THE FETCH  the four-tap bicubic equals a direct 16-tap cubic B-spline (worst 1e-5), reproduces a constant exactly, and low-passes a checkerboard;
//   6  THE KERNEL (needs the software WebGPU adapter; SKIPPED, and said, without one) the placement kernel on Dawn over a sample of the real mesh's vertices equals the twin (worst difference under 1e-3 m
//                 at 870 m, f32).
// NOT GRADED, said plainly: the draw on a GPU, shadow-pass bit-identity (one function, but no shadow pass exists here), any timing.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import * as CM from "./clipmapTerrain.mjs";
import { runWgslComputeNative, headlessGpuSkipReason, exitCleanly } from "../tools/ship/headlessGpu.mjs";

const require_ = createRequire(import.meta.url);
const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let fails = 0;
const ok = (l, c, n = "") => { if (!c) fails++; console.log(`  ${c ? "PASS" : "FAIL"}  ${l}${n ? "   " + n : ""}`); };
const report = (l) => console.log("  ----  " + l);
const norm = (s) => s.replace(/\/\/[^\n]*/g, "").replace(/\/\/\/[^\n]*/g, "").replace(/\s+/g, " ").trim();
const rng = (seed) => () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };

console.log("clipmapTerrain-selfcheck -- the nested-ring clipmap\n");
console.log("1. LIFTED");
{
    const up = norm(fs.readFileSync(path.join(ENG, "vendor/snowflow/src/shaders/lib/clipmap.wgsl"), "utf8")), kern = norm(CM.PLACE_KERNEL_WGSL);
    const stmts = [
        "let spacing = baseSpacing * exp2(level); let snap = spacing * 2.0; let origin = floor(camXZ / snap) * snap; var local = grid * spacing;",
        "let extent = gridHalfN * spacing; let cheb = max(abs(local.x), abs(local.y)) / extent;",
        "let morph = clamp((cheb - 0.70) / 0.16, 0.0, 1.0);",
        "let coarseGrid = floor(grid * 0.5) * 2.0; let coarseLocal = coarseGrid * spacing; local = mix(local, coarseLocal, morph);",
        "out.worldXZ = origin + local; out.spacing = spacing * (1.0 + morph); out.morph = morph; return out;",
    ];
    const missing = stmts.filter((s) => !(up.includes(s) && kern.includes(s)));
    ok("!! placeClipmapVertex's body is upstream's lib/clipmap.wgsl statement for statement (snap to 2 x spacing, the Chebyshev morph 0.70..0.86, the coarse lattice)", missing.length === 0, stmts.length + " statements in both" + (missing.length ? "; MISSING " + missing.map((m) => m.slice(0, 40)).join(" | ") : ""));
    const bicubic = ["let w0 = (1.0 - 3.0 * f + 3.0 * f2 - f3) / 6.0;", "let w1 = (4.0 - 6.0 * f2 + 3.0 * f3) / 6.0;", "let w2 = (1.0 + 3.0 * f + 3.0 * f2 - 3.0 * f3) / 6.0;", "let w3 = f3 / 6.0;"];
    const js = fs.readFileSync(path.join(ENG, "render/clipmapTerrain.mjs"), "utf8");
    ok("  the bicubic B-spline weights are upstream's four polynomials (found in upstream's text, and the twin spells the same four)", bicubic.every((s) => up.includes(s)) && /\(1 - 3 \* f \+ 3 \* f2 - f3\) \/ 6/.test(js) && /\(4 - 6 \* f2 \+ 3 \* f3\) \/ 6/.test(js) && /\(1 \+ 3 \* f \+ 3 \* f2 - 3 \* f3\) \/ 6/.test(js) && /f3 \/ 6\]/.test(js));
}

console.log("\n2. THE MESH");
{
    const m = CM.buildClipmap();
    ok("!! at 160 x 8 the mesh has upstream's counts: 161 x 161 x 8 = 207,368 vertices and 332,936 triangles, and the index list holds exactly that many", m.vertices === 207368 && m.triangles === 332936 && m.indices.length === 332936 * 3);
    let max = 0, bad = 0; for (const i of m.indices) { if (i > max) max = i; if (i >= m.vertices) bad++; }
    ok("  every index names a vertex", bad === 0 && max < m.vertices);
    // the hole: ring 1+ draws no quad whose corners are all within holeHalf of the centre
    const holeHalf = m.gridN / 4 - CM.HOLE_SHRINK; let inHole = 0, ring0 = 0;
    for (let t = 0; t < m.triangles; t++) { const v = m.indices[t * 3], lvl = m.positions[v * 3 + 1]; if (lvl === 0) { ring0++; continue; } const gi = m.positions[v * 3], gj = m.positions[v * 3 + 2]; if (Math.abs(gi) < holeHalf && Math.abs(gj) < holeHalf) inHole++; }
    ok("  ring 0 is a solid square (" + ring0 + " triangles = 2 x 160 x 160) and no outer ring has a triangle in its hole", ring0 === 2 * 160 * 160 && inHole === 0);
    // winding: signed xz area of the first triangle of each parity, then all
    let pos = 0, neg = 0; const p = m.positions;
    for (let t = 0; t < m.triangles; t += 7) { const a = m.indices[t * 3], b = m.indices[t * 3 + 1], c = m.indices[t * 3 + 2]; const ar = (p[b * 3] - p[a * 3]) * (p[c * 3 + 2] - p[a * 3 + 2]) - (p[b * 3 + 2] - p[a * 3 + 2]) * (p[c * 3] - p[a * 3]); if (ar > 0) pos++; else if (ar < 0) neg++; }
    ok("!! one winding throughout: every sampled triangle has the same sign of xz area (" + (pos ? "+" : "-") + "), so a flat heightfield faces one way; in a right-handed scene with +y up that is " + (pos ? "downward -- the page flips the index order" : "upward"), (pos === 0) !== (neg === 0));
    ok("!! the whole clipmap reaches " + CM.outerExtent().toFixed(1) + " m from the camera (the finest ring " + CM.innerExtent().toFixed(2) + " m): upstream's lib/deform.wgsl says '870 m across', which is the half-extent -- the clipmap is 1740.8 m across", Math.abs(CM.outerExtent() - 870.4) < 1e-9 && Math.abs(CM.innerExtent() - 6.8) < 1e-9);
    let threw = false; try { CM.buildClipmap({ gridN: 6 }); } catch { threw = true; }
    ok("  a grid not divisible by 4 throws (upstream's rule: the hole is a quarter of the grid)", threw);
}

console.log("\n3. THE RULES");
{
    const r = rng(5), cams = []; for (let i = 0; i < 40; i++) cams.push([(r() - 0.5) * 4000, (r() - 0.5) * 4000]);
    let snapOk = true; for (const cam of cams) for (let L = 0; L < CM.LEVELS; L++) { const o = CM.ringOrigin(L, cam), s = CM.BASE_SPACING * Math.pow(2, L) * 2; if (Math.abs(o[0] / s - Math.round(o[0] / s)) > 1e-9 || Math.abs(o[1] / s - Math.round(o[1] / s)) > 1e-9) snapOk = false; }
    ok("!! every ring's origin is a whole multiple of twice its spacing, for 40 random cameras over all 8 rings", snapOk);
    const L = 3, s = CM.BASE_SPACING * Math.pow(2, L) * 2, o = CM.ringOrigin(L, [10.1, -5.3]), inCell = CM.ringOrigin(L, [10.1 + s * 0.3 * (o[0] + s > 10.1 + s * 0.3 ? 1 : 0), -5.3]);
    ok("  the origin does not move while the camera stays inside its snap cell (the lattice does not slide)", CM.ringOrigin(L, [o[0] + s * 0.1, o[1] + s * 0.1]).join() === o.join() && CM.ringOrigin(L, [o[0] + s * 0.999, o[1] + s * 0.5]).join() === o.join() && CM.ringOrigin(L, [o[0] + s * 1.001, o[1]]).join() !== o.join());
    const half = CM.GRID_N / 2, at = (gi, gj, lvl, cam) => CM.placeVertex(gi, gj, lvl, cam);
    ok("!! the morph is 0 inside 0.70 of the ring's extent, 1 from 0.86, and 0.5 at 0.78 (Chebyshev: a corner counts as its larger axis)", at(0, 0, 2, [0, 0]).morph === 0 && at(Math.round(0.70 * half), 0, 2, [0, 0]).morph < 1e-9 && at(Math.round(0.86 * half) + 1, 3, 2, [0, 0]).morph === 1 && at(half, half, 2, [0, 0]).morph === 1 && Math.abs(CM.placeVertex(0.78 * half, 0, 2, [0, 0]).morph - 0.5) < 1e-9);
    // crack-free lattice claim: outer-band vertices (morph 1) of ring L sit on ring L+1's lattice, for random cameras
    let worst = 0, checked = 0;
    for (const cam of cams) for (let Lv = 0; Lv < CM.LEVELS - 1; Lv++) for (let k = 0; k < 40; k++) {
        const gi = Math.round((r() * 2 - 1) * half), gj = Math.round((r() * 2 - 1) * half);
        if (Math.max(Math.abs(gi), Math.abs(gj)) / half < 0.86) continue;
        const v = CM.placeVertex(gi, gj, Lv, cam), o2 = CM.ringOrigin(Lv + 1, cam), s2 = CM.BASE_SPACING * Math.pow(2, Lv + 1);
        const ex = (v.x - o2[0]) / s2, ez = (v.z - o2[1]) / s2; worst = Math.max(worst, Math.abs(ex - Math.round(ex)), Math.abs(ez - Math.round(ez))); checked++;
    }
    ok("!! " + checked + " outer-band vertices of ring L (random cameras, rings 0-6) land EXACTLY on ring L+1's lattice (worst fractional offset " + worst.toExponential(1) + " of a cell): the seam between rings has no T-junction", checked > 500 && worst < 1e-6);
}

console.log("\n4. NO GAPS");
{
    const cover = (shrink, seed) => {
        const mesh = CM.buildClipmap({ gridN: 32, levels: 4, holeShrink: shrink }), r = rng(seed), base = 1, snapTop = base * Math.pow(2, 3) * 2, ext = CM.outerExtent(32, base, 4) - snapTop; let uncovered = 0, total = 0;
        for (let k = 0; k < 4; k++) {
            const cam = [(r() - 0.5) * 300, (r() - 0.5) * 300], placed = CM.placeAll(mesh, cam, undefined, base), tris = [];
            for (let t = 0; t < mesh.triangles; t++) { const a = mesh.indices[t * 3], b = mesh.indices[t * 3 + 1], c = mesh.indices[t * 3 + 2]; tris.push([placed[a * 4], placed[a * 4 + 1], placed[b * 4], placed[b * 4 + 1], placed[c * 4], placed[c * 4 + 1]]); }
            for (let n = 0; n < 1500; n++) {
                const px = cam[0] + (r() * 2 - 1) * ext, pz = cam[1] + (r() * 2 - 1) * ext; let hit = false;
                for (const T of tris) { const d = (T[3] - T[5]) * (T[0] - T[4]) + (T[4] - T[2]) * (T[1] - T[5]); if (d === 0) continue; const l1 = ((T[3] - T[5]) * (px - T[4]) + (T[4] - T[2]) * (pz - T[5])) / d, l2 = ((T[5] - T[1]) * (px - T[4]) + (T[0] - T[4]) * (pz - T[5])) / d, l3 = 1 - l1 - l2; if (l1 >= -1e-9 && l2 >= -1e-9 && l3 >= -1e-9) { hit = true; break; } }
                total++; if (!hit) uncovered++;
            }
        }
        return { uncovered, total };
    };
    const real = cover(3, 7), none = cover(0, 7), neg = cover(-2, 7);
    ok("!! with upstream's hole shrink (3 cells) every one of " + real.total + " random points out to (outer extent - 2 x the outermost spacing) of the camera, over 4 random cameras, lies in a drawn triangle: no crack, no hole between rings", real.uncovered === 0, "uncovered " + real.uncovered);
    report("FINDING: the first draft of this test asked for 0.9 of the outer extent and found 20 of 6000 uncovered, every one in the outermost ring's outer band: that ring's origin is snapped to twice ITS spacing, so its outer edge sits up to 2 x spacing inside the camera's circle. The true guarantee is outer extent minus 2 x the outermost spacing (97.5% at upstream's 8 rings), which is what this row asks.");
    report("the test can see a gap: with the hole shrink 0 it finds " + none.uncovered + " of " + none.total + " uncovered, with the hole GROWN by 2 cells (shrink -2) " + neg.uncovered + " of " + neg.total + ".");
    ok("!! ... and at least one of those two controls is not clean, so the coverage test is not vacuous", none.uncovered + neg.uncovered > 0);
}

console.log("\n5. THE FETCH");
{
    const r = rng(11), res = 16, h = new Float32Array(res * res); for (let i = 0; i < h.length; i++) h[i] = r() * 4 - 2;
    let worst = 0; for (let k = 0; k < 200; k++) { const u = 0.1 + r() * 0.8, v = 0.1 + r() * 0.8; worst = Math.max(worst, Math.abs(CM.bicubicHeight(h, res, u, v) - CM.bicubicDirect(h, res, u, v))); }
    ok("!! the four-bilinear-tap fetch equals a direct 16-tap cubic B-spline over 200 random positions (worst " + worst.toExponential(1) + ")", worst < 1e-5);
    const flat = new Float32Array(res * res).fill(1.5);
    ok("  a constant field is reproduced exactly (the weights sum to 1)", Math.abs(CM.bicubicHeight(flat, res, 0.37, 0.61) - 1.5) < 1e-6);
    const chk = new Float32Array(res * res); for (let y = 0; y < res; y++) for (let x = 0; x < res; x++) chk[y * res + x] = (x + y) % 2 ? 1 : -1;
    ok("!! it LOW-PASSES (approximates, does not interpolate): a +-1 checkerboard sampled at a texel centre reads about 0.11, not 1, as upstream says ('gently low-passes the bake')", Math.abs(CM.bicubicHeight(chk, res, 8.5 / res, 8.5 / res)) < 0.2, "reads " + CM.bicubicHeight(chk, res, 8.5 / res, 8.5 / res).toFixed(3));
}

console.log("\n6. THE KERNEL");
{
    const skip = headlessGpuSkipReason(require_);
    if (skip) { report("kernel half SKIPPED -- " + skip); report("*** THAT IS A SKIP AND NOT A PASS: sections 1-5 never run the WGSL"); }
    else {
        const m = CM.buildClipmap(), r = rng(3), N = 4096, v = new Float32Array(N * 3); for (let i = 0; i < N; i++) { const src = Math.floor(r() * m.vertices); v[i * 3] = m.positions[src * 3]; v[i * 3 + 1] = m.positions[src * 3 + 1]; v[i * 3 + 2] = m.positions[src * 3 + 2]; }
        const cam = [123.456, -78.9];
        const g = await runWgslComputeNative({ code: CM.PLACE_KERNEL_WGSL, outCount: N * 4, uniforms: [cam[0], cam[1], CM.BASE_SPACING, CM.GRID_N / 2], inputs: [{ binding: 2, data: v }], workgroups: Math.ceil(N / 64), requireFn: require_ });
        if (!g.ok) ok("!! the placement kernel runs", false, (g.reason || "") + " " + (g.errors || []).join(" | "));
        else {
            let worst = 0, worstMorph = 0, morphing = 0; for (let i = 0; i < N; i++) { const t = CM.placeVertex(v[i * 3], v[i * 3 + 2], v[i * 3 + 1], cam); worst = Math.max(worst, Math.abs(g.values[i * 4] - t.x), Math.abs(g.values[i * 4 + 1] - t.z), Math.abs(g.values[i * 4 + 2] - t.spacing)); worstMorph = Math.max(worstMorph, Math.abs(g.values[i * 4 + 3] - t.morph)); if (t.morph > 0 && t.morph < 1) morphing++; }
            ok("!! the placement kernel equals the twin over 4096 vertices of the real mesh, camera at (123.5, -78.9): positions and spacing within 1e-3 m (f32 at up to 870 m), morph within 1e-5 (" + morphing + " vertices mid-morph)", worst < 1e-3 && worstMorph < 1e-5 && morphing > 50 && !g.wroteNothing, "worst " + worst.toExponential(2) + " m, morph " + worstMorph.toExponential(1));
        }
    }
}

console.log(`\nclipmapTerrain-selfcheck: ${fails === 0 ? "all passed" : fails + " FAILED"}`);
exitCleanly(fails === 0 ? 0 : 1);
