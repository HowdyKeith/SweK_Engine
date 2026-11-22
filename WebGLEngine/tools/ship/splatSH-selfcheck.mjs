// WebGLEngine/tools/ship/splatSH-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node tools/ship/splatSH-selfcheck.mjs      (a second)
//
// A SPLAT'S COLOUR FROM WHERE YOU STAND, HELD ON THE CPU. render/splatSH.mjs is the table; engine/splatParser.js reads f_rest into it; engine/plyWriter.mjs
// writes it. The card's side (the WGSL from the same table, against a CPU picture, from two eyes) is tools/ship/splatRendererGPU-selfcheck.mjs.
//
//   1  THE TABLE   the 15 basis functions (bands 1-3) with their constants are ORTHONORMAL over the sphere (integrated numerically, independent of the
//                  constants' source), together with band 0; band 1's signs are the reference rasteriser's (-y, +z, -x); a degree-1 coefficient points the
//                  colour the way it should (brighter seen along it); the WGSL is written from the same numbers
//   2  THE FILE    a .ply with 9, 24 or 45 f_rest values a splat comes back as sh at degree 1, 2, 3, reordered from the file's channel-by-channel to
//                  coefficient-by-coefficient, bit for bit; a file without f_rest has no sh; an odd count of f_rest is not
//                  read; the writer refuses gaussians that disagree on how many
//   3  THE COLOUR  viewColors is band 0 plus the higher bands, floored at 0; with no sh it is band 0 exactly
//
// SABOTAGE LOG: see the bottom of this file.
"use strict";
import * as SH from "../../render/splatSH.mjs";
import { writePly } from "../../engine/plyWriter.mjs";
import { parsePly } from "../../engine/splatParser.js";

let fails = 0;
function ok(name, cond, detail) { console.log(`  ${cond ? "PASS" : "FAIL"}  ${name}${detail ? "   " + detail : ""}`); if (!cond) fails++; }
const section = (fn) => { try { fn(); } catch (e) { ok(`!! the section THREW instead of answering: ${e.message}`, false, String(e.stack).split("\n")[1]); } };
const h = (i) => { const x = Math.sin(i * 12.9898 + 78.233) * 43758.5453; return x - Math.floor(x); };

console.log("splatSH-selfcheck -- spherical harmonics for splats\n");

console.log("1. THE TABLE");
section(() => {
    // Gauss-Legendre-free quadrature: a fine midpoint grid in (cos theta, phi) is exact enough for polynomials of degree 6 on the sphere
    const NT = 200, NP = 400, G = Array.from({ length: 16 }, () => new Float64Array(16));
    for (let a = 0; a < NT; a++) for (let p = 0; p < NP; p++) {
        const z = -1 + (2 * (a + 0.5)) / NT, ph = (2 * Math.PI * (p + 0.5)) / NP, r = Math.sqrt(1 - z * z), x = r * Math.cos(ph), y = r * Math.sin(ph);
        const b = [SH.SH_C0, ...SH.shBasis(15, x, y, z)], w = (2 / NT) * ((2 * Math.PI) / NP);
        for (let i = 0; i < 16; i++) for (let j = 0; j < 16; j++) G[i][j] += b[i] * b[j] * w;
    }
    let worst = 0; for (let i = 0; i < 16; i++) for (let j = 0; j < 16; j++) worst = Math.max(worst, Math.abs(G[i][j] - (i === j ? 1 : 0)));
    ok("!! THE 16 BASIS FUNCTIONS ARE ORTHONORMAL over the sphere (bands 0-3, every constant), to 1e-3", worst < 1e-3, `worst Gram entry off by ${worst.toExponential(2)}`);
    const b1 = SH.shBasis(3, 0.2, 0.3, 0.4);
    ok("!! band 1's signs are the reference rasteriser's: -C1 y, +C1 z, -C1 x", Math.abs(b1[0] + SH.SH_C1 * 0.3) < 1e-12 && Math.abs(b1[1] - SH.SH_C1 * 0.4) < 1e-12 && Math.abs(b1[2] + SH.SH_C1 * 0.2) < 1e-12);
    ok("!! shBasis gives 3, 8 and 15 values for degrees 1, 2, 3; degreeOfRest maps 9/24/45 and nothing else", [1, 2, 3].every((d) => SH.shBasis(SH.SH_K[d], 0, 0, 1).length === SH.SH_K[d]) && SH.degreeOfRest(9) === 1 && SH.degreeOfRest(24) === 2 && SH.degreeOfRest(45) === 3 && SH.degreeOfRest(12) === 0 && SH.degreeOfRest(0) === 0);
    // a splat whose second coefficient (+C1 z) is red: looking along +z at it (camera behind, splat ahead) it is redder than looking along -z
    const sh = new Float32Array(9); sh[1 * 3 + 0] = 0.5;
    const ahead = SH.shRest(sh, 0, 3, [0, 0, 1]), back = SH.shRest(sh, 0, 3, [0, 0, -1]);
    ok("!! a coefficient shows along its direction: +C1 z of 0.5 in red adds +0.244 red seen along +z and takes it away along -z, nothing to green or blue; the direction need not be unit", Math.abs(ahead[0] - 0.5 * SH.SH_C1) < 1e-9 && Math.abs(back[0] + 0.5 * SH.SH_C1) < 1e-9 && ahead[1] === 0 && ahead[2] === 0 && Math.abs(SH.shRest(sh, 0, 3, [0, 0, 7])[0] - ahead[0]) < 1e-9);
    const nums = [...SH.SH_WGSL.matchAll(/-?\d+\.\d{6,}/g)].map((m) => Number(m[0])), want = [-SH.SH_C1, SH.SH_C1, ...SH.SH_C2, ...SH.SH_C3];
    ok("!! THE CARD'S TABLE IS THIS TABLE: the WGSL's constants are these 15 numbers, in this order (band 1's two minus signs included)", nums.length === 15 && nums.every((v, i) => (i < 3 ? [-SH.SH_C1, SH.SH_C1, -SH.SH_C1][i] : want[i - 1]) === v), nums.join(", "));
});

section(() => {
    const nums = [...SH.SH_GLSL.matchAll(/-?\d+\.\d{6,}/g)].map((m) => Number(m[0])), want = [-SH.SH_C1, SH.SH_C1, -SH.SH_C1, ...SH.SH_C2, ...SH.SH_C3];
    ok("!! THE WEBGL2 TABLE IS THIS TABLE TOO (2026-11-21): the GLSL's 15 constants are these, in this order, and it reads texel idx * K + j at (t % width, t / width)", nums.length === 15 && nums.every((v, i) => v === want[i]) && new RegExp(`t % ${SH.SH_TEX_WIDTH}u.*t / ${SH.SH_TEX_WIDTH}u`).test(SH.SH_GLSL) && /idx \* uint\(K\) \+ uint\(j\)/.test(SH.SH_GLSL), nums.join(", "));
    const sh = Float32Array.from({ length: 5000 * 15 * 3 }, (_, i) => i % 997), T = SH.packShTexture(sh, 5000, 15), at = (t) => { const x = t % SH.SH_TEX_WIDTH, y = Math.floor(t / SH.SH_TEX_WIDTH), o = (y * T.width + x) * 4; return [T.data[o], T.data[o + 1], T.data[o + 2]]; };
    const small = SH.packShTexture(sh, 10, 15);
    ok("!! THE TEXTURE'S LAYOUT IS THE SHADER'S: 75,000 coefficients in rows of 4,096 texels, each texel (r, g, b) of one coefficient where the shader looks for it; a small cloud one row of exactly its texels", T.width === 4096 && T.height === Math.ceil(75000 / 4096) && [0, 1, 4095, 4096, 74999].every((t) => at(t).join() === [sh[t * 3], sh[t * 3 + 1], sh[t * 3 + 2]].join()) && small.width === 150 && small.height === 1 && small.data.length === 600);
});

console.log("2. THE FILE");
section(() => {
    const mk = (n, nRest) => Array.from({ length: n }, (_, i) => ({ x: h(i), y: h(i + 100), z: h(i + 200), scale: [-2, -2.5, -3], rot: [1, 0, 0, 0], color: [0.1, 0.2, 0.3], opacity: 1, ...(nRest ? { rest: Array.from({ length: nRest }, (_, r) => Math.fround((h(i * 97 + r) - 0.5) * 2)) } : {}) }));
    const buf = (u) => u.buffer.slice(u.byteOffset, u.byteOffset + u.byteLength);
    let good = true, detail = [];
    for (const [nRest, deg] of [[9, 1], [24, 2], [45, 3]]) for (const format of ["binary_little_endian"]) {
        const gs = mk(7, nRest), c = parsePly(buf(writePly(gs, { format }))), K = nRest / 3;
        let exact = c.shDegree === deg && c.sh && c.sh.length === 7 * nRest;
        if (exact) for (let i = 0; i < 7; i++) for (let j = 0; j < K; j++) for (let ch = 0; ch < 3; ch++) if (c.sh[(i * K + j) * 3 + ch] !== gs[i].rest[ch * K + j]) exact = false;
        if (!exact) { good = false; detail.push(`${nRest} ${format}`); }
    }
    ok("!! 9, 24, 45 f_rest values come back as sh at degree 1, 2, 3, reordered to coefficient-by-coefficient, bit for bit (the parser reads binary little-endian, as before)", good, detail.join("; "));
    const plain = parsePly(buf(writePly(mk(5, 0))));
    ok("!! a file without f_rest has no sh and no degree (the band-0 renderer path)", plain.sh === undefined && plain.shDegree === undefined && plain.count === 5);
    const odd = parsePly(buf(writePly(mk(5, 12))));
    ok("!! an odd count of f_rest (12) is not read: no sh, the rest of the splat parsed", odd.sh === undefined && odd.count === 5 && Math.abs(odd.positions[0] - Math.fround(h(0))) < 1e-7);
    let threw = false; try { writePly([...mk(2, 9), ...mk(1, 24)]); } catch (e) { threw = /same number of f_rest/.test(e.message); }
    ok("!! the writer refuses gaussians that disagree on how many f_rest values they carry", threw);
});

console.log("3. THE COLOUR");
section(() => {
    const n = 30, s = { count: n, positions: new Float32Array(n * 3).map((_, k) => h(k) * 2 - 1), colors: new Float32Array(n * 3).map((_, k) => h(k + 999)), shDegree: 2, sh: new Float32Array(n * 24).map((_, k) => (h(k + 5e3) - 0.5) * 1.5) };
    const eye = [0.3, -2, 4], origin = [0.1, 0, 0], scale = 1.2, got = SH.viewColors(s, eye, { origin, scale });
    let worst = 0, floored = 0;
    for (let i = 0; i < n; i++) { const d = [0, 1, 2].map((k) => s.positions[i * 3 + k] * scale + origin[k] - eye[k]), r = SH.shRest(s.sh, i, 8, d); for (let c = 0; c < 3; c++) { const want = Math.max(0, s.colors[i * 3 + c] + r[c]); if (want === 0) floored++; worst = Math.max(worst, Math.abs(got[i * 3 + c] - want)); } }
    ok("!! viewColors is band 0 plus the higher bands seen from the eye, the cloud placed and scaled, floored at 0 (some here are)", worst < 1e-6 && floored > 0, `worst ${worst.toExponential(2)}, ${floored} channels floored`);
    const flat = SH.viewColors({ ...s, sh: undefined, shDegree: undefined }, eye);
    ok("!! with no sh it is band 0 exactly", flat.every((v, k) => v === s.colors[k]));
});

console.log(`\n${fails === 0 ? "ALL PASS" : fails + " FAILED"}`);
process.exit(fails === 0 ? 0 : 1);

// SABOTAGE LOG:
// 7 mutants of render/splatSH.mjs, each in a hard-linked copy of the tree: ALL 7 RED (band 1's first sign, a band-2 term, a band-3 constant, no floor at 0,
// the direction not made unit, the WGSL's first sign, the eye's direction ignoring the cloud's scale). 3 of engine/splatParser.js: ALL 3 RED (the file's
// channel-by-channel order not undone, any count of f_rest taken as degree 3, sh not handed out).
