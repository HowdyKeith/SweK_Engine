#!/usr/bin/env node
// WebGLEngine/tools/ship/splatProbes-selfcheck.mjs -- v4513
//
// AN IRRADIANCE PROBE VOLUME FOR A SPLAT SCENE (task 59): render/splatProbes.mjs, from the technique of
// isaac-mason/three-spark-light-probes and not its source (that repository carries no LICENSE file), headless. Section 1, the
// quadrature: the six faces' texel solid angles sum to 4 pi at every face size, and the nine basis functions are orthonormal
// under it. Section 2, THE CLOSED FORMS: a constant radiance L projects to L sqrt(4 pi) and eight zeros; a single lit +z face
// projects to (2 pi / 3) c0 in the constant term and, in the z and 3z^2-1 terms, to the integrals of z and z^2 over the face
// reduced to one dimension by hand (the u integral in closed form, the v integral by Simpson at 1e-12); a smooth gradient
// 1 + z / 2 projects to sqrt(4 pi) and (c1 / 2)(4 pi / 3) with every other term zero. Section 3, irradiance: a constant
// radiance gives pi L in every normal; a lit face gives E(+z) > E(+x) > E(-z) and E(+z) against the direct cosine integral.
// Section 4, the grid and the sample: probes at the box corners, the sample at a probe's own position ITS coefficients, at
// the midpoint of two probes their mean, outside the box the boundary probe, and a radiance that varies linearly with x bakes
// to probes whose sample between them is the linear interpolation. Section 5, the packing: seven RGBA planes, the layout
// spelled out, the spare slot zero, the round-trip exact in Float32. Section 6, the splat source: nearest-hit by name (a hit
// splat's colour, a miss the sky, the nearer of two the winner); a probe with one red splat in +z bakes a positive red z term
// and a sky-coloured -z; a bake over a hand cloud packs, unpacks and shades.
//
// MEASURED AT v4513: the six faces cover 12.56637061 at n 1, 4, 16 and 64 (the exact formula); the basis Gram matrix at n 128 is the
// identity to 2.5e-5 on the diagonal and 1e-15 off it; a constant radiance 0.75 projects to 2.65868078 = 0.75 sqrt(4 pi); the lit
// face's z term at n 512 is 0.85057828 against 0.85057855 from the reduced integral (INT_Z 1.74083950) and its 3z^2-1 term
// 0.72836529 against 0.72836562 (INT_Z2 1.46793206); the gradient's z term 1.02332671 against 1.02332671; a constant 0.75 gives
// irradiance 2.35619449 = pi L in six normals; the lit face's E(+z) by SH is 1.75484756 against the direct 1.74083950, 0.80 % off
// (order-2 truncation, said); a red splat of radius 0.5 at distance 2 fills a 1.59 % cap and bakes a mean red of 0.31078952 over
// a sky of 0.3; the 300-splat bake is 7 x 7 x 7 probes in 0.3 s; the round-trip of 27 x 45 coefficients is exact after Math.fround.
// A CORRECTION in the first run: three holds compared a Float32 face value 0.7 against the Float64 0.7 and missed by 4e-8 -- the
// gate's constants are now Float32-exact (0.75, 0.25, 1), and the linearity hold says why its tolerance is 1e-6.
//
// SABOTAGE (v4513): A  texel solid angle replaced by the flat 4 / n^2                  -> 20 red: the faces cover 24 not 4 pi, every closed
//                                                                                        form and every bake off by name.
//                   B  the y basis sign flipped (shBasis)                            -> 1 red: the y gradient lands with the wrong sign
//                                                                                        (the orthonormality and every z-only hold stay green
//                                                                                        -- a sign is invisible to a symmetric radiance,
//                                                                                        which is why the gate projects an x and a y ramp).
//                   C  sampleProbes weights with f instead of 1 - f on the low probe -> 4 red: a probe's own position reads its neighbour,
//                                                                                        the interior point reads 0.2 for 0.3.
//                   D  packProbes writing plane s % 7 instead of s >> 2              -> 5 red: the layout holds, the round-trip and the
//                                                                                        packed shade.
//                   Each restored and the baseline re-run: 0 red.
//
// Run: node tools/ship/splatProbes-selfcheck.mjs      (~2 s)
"use strict";
import { SQRT_4PI, SH_C, COS_LOBE, PLANES, shBasis, evalSH, irradianceSH, faceDirection, texelSolidAngle, projectCubeSH, renderCubeFaces,
         probeGrid, probeIndex, bakeProbes, cloudBounds, splatRadiance, packProbes, unpackProbes, sampleProbes, shadeAt } from "../../render/splatProbes.mjs";
import { sphereCloud } from "../../physics/splat/splatMesh.mjs";

let fails = 0;
const ok = (label, cond, detail) => { if (!cond) fails++; console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}${detail ? "   " + detail : ""}`); };
const report = (s) => console.log(`  ----  ${s}`);
const sec = (s) => console.log("\n" + s);
const near = (a, b, eps = 1e-9) => Math.abs(a - b) < eps;
const fmt = (v) => (+v).toFixed(8);

const constFaces = (n, rgb) => Array.from({ length: 6 }, () => { const a = new Float32Array(n * n * 3); for (let k = 0; k < n * n; k++) { a[k * 3] = rgb[0]; a[k * 3 + 1] = rgb[1]; a[k * 3 + 2] = rgb[2]; } return a; });
const funcFaces = (n, fn) => Array.from({ length: 6 }, (_, f) => { const a = new Float32Array(n * n * 3);
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) { const d = faceDirection(f, (2 * i + 1) / n - 1, (2 * j + 1) / n - 1), v = fn(d), k = (j * n + i) * 3; a[k] = a[k + 1] = a[k + 2] = v; }
    return a; });
/** Simpson over v in [-1, 1] of g(a) with a^2 = 1 + v^2 */
function simpsonV(g, N = 20000) { const h = 2 / N; let s = 0; for (let k = 0; k <= N; k++) { const v = -1 + k * h, w = k === 0 || k === N ? 1 : k % 2 ? 4 : 2; s += w * g(Math.sqrt(1 + v * v)); } return s * h / 3; }
/** the integral of z over the +z face, u integral in closed form */
const INT_Z = simpsonV((a) => 1 / (a * a * (a * a + 1)) + Math.atan(1 / a) / (a * a * a));
/** the integral of z^2 over the +z face */
const INT_Z2 = simpsonV((a) => 2 * (2 + 3 * a * a) / (3 * a ** 4 * Math.pow(a * a + 1, 1.5)));

// ---------------------------------------------------------------------------------------------------------------------------------
sec("1. the quadrature: solid angles and orthonormality");
for (const n of [1, 4, 16, 64]) {
    let tot = 0; for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) tot += texelSolidAngle(2 * i / n - 1, 2 * (i + 1) / n - 1, 2 * j / n - 1, 2 * (j + 1) / n - 1);
    ok(`six faces of ${n} x ${n} texels cover 4 pi`, near(tot * 6, 4 * Math.PI, 1e-9), `${fmt(tot * 6)} vs ${fmt(4 * Math.PI)}`);
}
{
    const n = 128, G = Array.from({ length: 9 }, () => new Array(9).fill(0));
    for (let f = 0; f < 6; f++) for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
        const u0 = 2 * i / n - 1, u1 = 2 * (i + 1) / n - 1, v0 = 2 * j / n - 1, v1 = 2 * (j + 1) / n - 1, w = texelSolidAngle(u0, u1, v0, v1), b = shBasis(faceDirection(f, (u0 + u1) / 2, (v0 + v1) / 2));
        for (let p = 0; p < 9; p++) for (let q = 0; q < 9; q++) G[p][q] += b[p] * b[q] * w;
    }
    let worstDiag = 0, worstOff = 0;
    for (let p = 0; p < 9; p++) for (let q = 0; q < 9; q++) { const e = Math.abs(G[p][q] - (p === q ? 1 : 0)); if (p === q) worstDiag = Math.max(worstDiag, e); else worstOff = Math.max(worstOff, e); }
    ok("the nine basis functions are orthonormal under the cube quadrature (n 128)", worstDiag < 1e-4 && worstOff < 1e-4, `worst diagonal ${worstDiag.toExponential(2)}, worst off-diagonal ${worstOff.toExponential(2)}`);
    for (let f = 0; f < 6; f++) { const d = faceDirection(f, 0, 0); ok(`face ${f} centre points along its axis`, Math.abs(Math.abs(d[f >> 1]) - 1) < 1e-12 && Math.sign(d[f >> 1]) === (f & 1 ? -1 : 1)); }
}

// ---------------------------------------------------------------------------------------------------------------------------------
sec("2. the closed forms");
{
    const n = 32, L = [0.75, 0.25, 1.0], c = projectCubeSH(constFaces(n, L), n);   // Float32-exact values: the faces are Float32
    ok("constant radiance: the constant term is L sqrt(4 pi) per channel", near(c[0][0], L[0] * SQRT_4PI) && near(c[0][1], L[1] * SQRT_4PI) && near(c[0][2], L[2] * SQRT_4PI), `${fmt(c[0][0])} vs ${fmt(L[0] * SQRT_4PI)}`);
    ok("constant radiance: the eight higher terms are zero", c.slice(1).every((t) => t.every((v) => Math.abs(v) < 1e-9)), `worst ${Math.max(...c.slice(1).flat().map(Math.abs)).toExponential(2)}`);
}
{
    const n = 512, faces = constFaces(n, [0, 0, 0]); faces[4] = constFaces(n, [1, 1, 1])[4];   // the midpoint rule converges as 1 / n^2; 512 puts the quadratic term under 1e-6
    const c = projectCubeSH(faces, n), eL00 = 2 * Math.PI / 3 * SH_C.c0, eL10 = SH_C.c1 * INT_Z, eL20 = SH_C.c2[2] * (3 * INT_Z2 - 2 * Math.PI / 3);
    ok("one lit +z face: the constant term is (2 pi / 3) c0 exactly", near(c[0][0], eL00), `${fmt(c[0][0])} vs ${fmt(eL00)}`);
    ok("one lit +z face: the z term is c1 times the reduced integral of z (1e-6, n 512)", near(c[2][0], eL10, 1e-6), `${fmt(c[2][0])} vs ${fmt(eL10)}`);
    ok("one lit +z face: the 3z^2-1 term is c2 times the reduced integral (1e-6)", near(c[6][0], eL20, 1e-6), `${fmt(c[6][0])} vs ${fmt(eL20)}`);
    ok("one lit +z face: the x, y, xy, yz, xz and x^2-y^2 terms vanish by symmetry", [1, 3, 4, 5, 7, 8].every((s) => Math.abs(c[s][0]) < 1e-9), `worst ${Math.max(...[1, 3, 4, 5, 7, 8].map((s) => Math.abs(c[s][0]))).toExponential(2)}`);
    report(`INT_Z ${fmt(INT_Z)}, INT_Z2 ${fmt(INT_Z2)}`);
}
{
    const n = 128, c = projectCubeSH(funcFaces(n, (d) => 1 + 0.5 * d[2]), n), eL10 = 0.5 * SH_C.c1 * 4 * Math.PI / 3;
    ok("gradient 1 + z / 2: the constant term is sqrt(4 pi)", near(c[0][0], SQRT_4PI, 1e-9), `${fmt(c[0][0])}`);
    ok("gradient 1 + z / 2: the z term is (c1 / 2)(4 pi / 3) (1e-6)", near(c[2][0], eL10, 1e-6), `${fmt(c[2][0])} vs ${fmt(eL10)}`);
    ok("gradient 1 + z / 2: every other term vanishes (1e-6)", [1, 3, 4, 5, 6, 7, 8].every((s) => Math.abs(c[s][0]) < 1e-6), `worst ${Math.max(...[1, 3, 4, 5, 6, 7, 8].map((s) => Math.abs(c[s][0]))).toExponential(2)}`);
    const cx = projectCubeSH(funcFaces(n, (d) => 1 + 0.5 * d[0]), n), cy = projectCubeSH(funcFaces(n, (d) => 1 + 0.5 * d[1]), n);
    ok("gradients along x and y land in the x and y terms with the tree's signs", near(cx[3][0], -eL10, 1e-6) && near(cy[1][0], -eL10, 1e-6), `x ${fmt(cx[3][0])}, y ${fmt(cy[1][0])}`);
    ok("the projection is linear: the sum of two radiances projects to the sum", (() => { const s = projectCubeSH(funcFaces(n, (d) => 2 + 0.5 * d[2] + 0.5 * d[0]), n); return s.every((t, i) => near(t[0], c[i][0] + cx[i][0], 1e-6)); })(), "(1e-6: the faces are stored in Float32)");
}

// ---------------------------------------------------------------------------------------------------------------------------------
sec("3. irradiance");
{
    const n = 32, L = 0.75, c = irradianceSH(projectCubeSH(constFaces(n, [L, L, L]), n)), dirs = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
    ok("a constant radiance L gives irradiance pi L in six normals", dirs.every((d) => near(evalSH(c, d)[0], Math.PI * L)), `${fmt(evalSH(c, [0, 0, 1])[0])} vs ${fmt(Math.PI * L)}`);
    ok("the cosine lobe factors are pi, 2 pi / 3, pi / 4", near(COS_LOBE[0], Math.PI) && near(COS_LOBE[1], 2 * Math.PI / 3) && near(COS_LOBE[2], Math.PI / 4));
}
{
    const n = 64, faces = constFaces(n, [0, 0, 0]); faces[4] = constFaces(n, [1, 1, 1])[4];
    const c = irradianceSH(projectCubeSH(faces, n)), ez = evalSH(c, [0, 0, 1])[0], ex = evalSH(c, [1, 0, 0])[0], emz = evalSH(c, [0, 0, -1])[0];
    ok("one lit +z face: E(+z) > E(+x) > E(-z)", ez > ex && ex > emz, `${fmt(ez)} > ${fmt(ex)} > ${fmt(emz)}`);
    ok("one lit +z face: E(+z) by SH is within 5 % of the direct cosine integral over the face", Math.abs(ez - INT_Z) / INT_Z < 0.05, `SH ${fmt(ez)}, direct ${fmt(INT_Z)}, ${(100 * Math.abs(ez - INT_Z) / INT_Z).toFixed(2)} % off (order-2 truncation)`);
    ok("one lit +z face: E(+x) by SH is within 5 % of the direct cosine integral", (() => { let e = 0; const m = 512; for (let j = 0; j < m; j++) for (let i = 0; i < m; i++) { const u0 = 2 * i / m - 1, u1 = 2 * (i + 1) / m - 1, v0 = 2 * j / m - 1, v1 = 2 * (j + 1) / m - 1, d = faceDirection(4, (u0 + u1) / 2, (v0 + v1) / 2); e += Math.max(0, d[0]) * texelSolidAngle(u0, u1, v0, v1); } return Math.abs(ex - e) / e < 0.05; })());
}

// ---------------------------------------------------------------------------------------------------------------------------------
sec("4. the grid and the sample");
{
    const g = probeGrid({ min: [-1, 0, -2], max: [1, 1, 2] }, 0.5);
    ok("counts from the spacing: 5 x 3 x 9 probes", g.counts.join("x") === "5x3x9" && g.total === 135, g.counts.join(" x "));
    const last = probeIndex(g.counts, 4, 2, 8) * 3;
    ok("the first probe is the box's min corner and the last its max", g.positions[0] === -1 && g.positions[1] === 0 && g.positions[2] === -2 && g.positions[last] === 1 && g.positions[last + 1] === 1 && g.positions[last + 2] === 2);
    ok("a box thinner than the spacing still gets two probes per axis", probeGrid({ min: [0, 0, 0], max: [0.1, 0.1, 0.1] }, 0.5).counts.join() === "2,2,2");
    bakeProbes(g, (p) => [p[0], p[1], p[2]], 8);
    ok("a radiance equal to the position bakes each probe's constant term to sqrt(4 pi) times its position", (() => { for (let i = 0; i < g.total; i++) for (let a = 0; a < 3; a++) if (!near(g.coefficients[i][0][a], SQRT_4PI * g.positions[i * 3 + a], 1e-6)) return false; return true; })());
    const i1 = probeIndex(g.counts, 2, 1, 4), p1 = [g.positions[i1 * 3], g.positions[i1 * 3 + 1], g.positions[i1 * 3 + 2]], s1 = sampleProbes(g, p1);
    ok("the sample at a probe's own position is that probe's coefficients", s1.every((t, s) => t.every((v, a) => near(v, g.coefficients[i1][s][a]))), `probe ${i1} at ${p1.join(", ")}`);
    const i2 = probeIndex(g.counts, 3, 1, 4), mid = sampleProbes(g, [(p1[0] + g.positions[i2 * 3]) / 2, p1[1], p1[2]]);
    ok("the sample midway between two probes is their mean", mid.every((t, s) => t.every((v, a) => near(v, (g.coefficients[i1][s][a] + g.coefficients[i2][s][a]) / 2))));
    const inside = sampleProbes(g, [0.3, 0.7, 1.1]);
    ok("an interior point of the linear bake reads the linear interpolation (the position itself)", near(inside[0][0], SQRT_4PI * 0.3, 1e-6) && near(inside[0][1], SQRT_4PI * 0.7, 1e-6) && near(inside[0][2], SQRT_4PI * 1.1, 1e-6), `${fmt(inside[0][0] / SQRT_4PI)}, ${fmt(inside[0][1] / SQRT_4PI)}, ${fmt(inside[0][2] / SQRT_4PI)}`);
    const out = sampleProbes(g, [5, -3, 9]);
    ok("a point outside the box clamps to the boundary probe", near(out[0][0], SQRT_4PI * 1, 1e-6) && near(out[0][1], 0, 1e-6) && near(out[0][2], SQRT_4PI * 2, 1e-6));
    const sh = shadeAt(g, [0.5, 0.5, 0.5], [0, 0, 1], [1, 1, 1]);
    ok("shadeAt of a constant-in-direction bake is albedo times the position (E / pi = L)", near(sh[0], 0.5, 1e-6) && near(sh[1], 0.5, 1e-6) && near(sh[2], 0.5, 1e-6), sh.map(fmt).join(", "));
}

// ---------------------------------------------------------------------------------------------------------------------------------
sec("5. the packing");
{
    const g = probeGrid({ min: [0, 0, 0], max: [2, 1, 1] }, 0.5);
    bakeProbes(g, (p, d) => [p[0] + d[0] * 0.3, p[1] + d[1] * 0.2, p[2] + d[2] * 0.1 + 0.5], 8);
    const packed = packProbes(g), per = g.total * 4;
    ok("seven RGBA planes of counts x 4 floats", packed.planes === PLANES && packed.data.length === 7 * per, `${packed.data.length} floats for ${g.total} probes`);
    const i = probeIndex(g.counts, 1, 1, 0), c = g.coefficients[i];
    ok("the layout: plane 0 holds coefficient 0's rgb and coefficient 1's r for a probe", packed.data[i * 4] === Math.fround(c[0][0]) && packed.data[i * 4 + 1] === Math.fround(c[0][1]) && packed.data[i * 4 + 2] === Math.fround(c[0][2]) && packed.data[i * 4 + 3] === Math.fround(c[1][0]));
    ok("the layout: plane 6 holds coefficient 8's rgb and a zero spare", packed.data[6 * per + i * 4] === Math.fround(c[8][0]) && packed.data[6 * per + i * 4 + 2] === Math.fround(c[8][2]) && packed.data[6 * per + i * 4 + 3] === 0);
    const back = unpackProbes(packed);
    ok("the round-trip is exact in Float32 for every coefficient of every probe", back.total === g.total && back.coefficients.every((cc, k) => cc.every((t, s) => t.every((v, a) => v === Math.fround(g.coefficients[k][s][a])))));
    ok("the unpacked grid samples where the original does", (() => { const p = [1.3, 0.4, 0.8], a = sampleProbes(g, p), b = sampleProbes(back, p); return a.every((t, s) => t.every((v, ch) => Math.abs(v - b[s][ch]) < 1e-6)); })());
}

// ---------------------------------------------------------------------------------------------------------------------------------
sec("6. the splat source");
{
    const cloud = { count: 2, positions: new Float32Array([0, 0, 2, 0, 0, 4]), scales: new Float32Array([0.5, 0.5, 0.5, 1, 1, 1]), opacities: new Float32Array([1, 1]) };
    const colours = new Float32Array([1, 0, 0, 0, 1, 0]), sky = [0.3, 0.4, 0.6], rad = splatRadiance(cloud, colours, sky);
    ok("a ray into a splat returns its colour", rad([0, 0, 0], [0, 0, 1]).join() === "1,0,0");
    ok("a ray past every splat returns the sky", rad([0, 0, 0], [0, 0, -1]) === sky && rad([0, 0, 0], [1, 0, 0]) === sky);
    ok("the nearer of two splats on one ray wins (nearest hit, not first in the list)", (() => { const swapped = { ...cloud, positions: new Float32Array([0, 0, 4, 0, 0, 2]), scales: new Float32Array([1, 1, 1, 0.5, 0.5, 0.5]) }; return splatRadiance(swapped, colours, sky)([0, 0, 0], [0, 0, 1]).join() === "0,1,0"; })());
    ok("a splat behind the ray's origin is not hit", rad([0, 0, 3], [0, 0, -1]).join() === "1,0,0" && rad([0, 0, 5], [0, 0, 1]) === sky);
    const g = probeGrid({ min: [0, 0, 0], max: [0, 0, 0] }, 1); bakeProbes(g, rad, 32);
    const c = g.coefficients[0], ir = irradianceSH(c);
    ok("a probe with a red splat in +z bakes a positive red z term and a negative blue one", c[2][0] > 0.05 && c[2][2] < -0.05, `red z ${fmt(c[2][0])}, blue z ${fmt(c[2][2])}`);
    ok("its irradiance is redder facing +z and bluer facing -z", evalSH(ir, [0, 0, 1])[0] > evalSH(ir, [0, 0, -1])[0] && evalSH(ir, [0, 0, -1])[2] > evalSH(ir, [0, 0, 1])[2]);
    ok("the constant term is the solid-angle mix of splat and sky", (() => { const cap = 2 * Math.PI * (1 - Math.sqrt(1 - 0.25 * 0.25)), f = cap / (4 * Math.PI); return Math.abs(c[0][0] / SQRT_4PI - (f + (1 - f) * sky[0])) < 0.01 && Math.abs(c[0][2] / SQRT_4PI - (1 - f) * sky[2]) < 0.01; })(), `mean red ${fmt(c[0][0] / SQRT_4PI)} for a cap of ${(100 * 2 * Math.PI * (1 - Math.sqrt(1 - 0.0625)) / (4 * Math.PI)).toFixed(2)} % over sky red ${sky[0]}`);
}
{
    const cloud = sphereCloud({ n: 300, radius: 1, scale: 0.15, opacity: 1 }), colours = new Float32Array(cloud.count * 3);
    for (let i = 0; i < cloud.count; i++) { const up = cloud.positions[i * 3 + 1] > 0; colours[i * 3] = up ? 1 : 0.1; colours[i * 3 + 1] = 0.5; colours[i * 3 + 2] = up ? 0.1 : 1; }
    const b = cloudBounds(cloud, 0.5), g = probeGrid(b, 0.5), t0 = Date.now(); bakeProbes(g, splatRadiance(cloud, colours), 8);
    ok(`a bake over a 300-splat cloud: ${g.counts.join(" x ")} probes, every coefficient finite`, g.coefficients.every((c) => c.every((t) => t.every(Number.isFinite))), `${Date.now() - t0} ms`);
    const inside = shadeAt(g, [0, 0, 0], [0, 1, 0]), down = shadeAt(g, [0, 0, 0], [0, -1, 0]);
    ok("inside the two-tone shell an upward normal reads redder than a downward one", inside[0] > down[0] && down[2] > inside[2], `up ${inside.map(fmt).join(", ")}; down ${down.map(fmt).join(", ")}`);
    const packed = packProbes(g), back = unpackProbes(packed), s = shadeAt(back, [0.2, 0.3, -0.1], [0, 1, 0]), s0 = shadeAt(g, [0.2, 0.3, -0.1], [0, 1, 0]);
    ok("the packed volume shades the same point the same way", s.every((v, a) => Math.abs(v - s0[a]) < 1e-5));
}

console.log(`\n${fails === 0 ? "all checks pass" : fails + " check(s) FAILED"}`);
process.exit(fails ? 1 : 0);
