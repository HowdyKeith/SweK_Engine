// WebGLEngine/render/nebulaSkybox-selfcheck.mjs — v3833
//
// The skybox is baked, not painted, so the things that can be wrong are arithmetic: is it deterministic, do the
// six faces meet without a seam, does the gradient run the right way, is the nebula actually varying, are there
// stars and not a snowstorm. None of that needs a GPU. The look -- whether it is BEAUTIFUL -- is Keith's, and
// there is no check for it here; every number under the look is pinned first.
//
// Run: node render/nebulaSkybox-selfcheck.mjs   (exit 0 all-pass, 1 on any fail)

import { bakeNebulaCubemap, shadeDirection, faceTexelDir, makeParams } from "./nebulaSkybox.js";

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error("  FAIL  " + m); } };
const near = (a, b, e) => Math.abs(a - b) <= e;
const norm = (d) => { const n = 1 / Math.hypot(d[0], d[1], d[2]); return [d[0] * n, d[1] * n, d[2] * n]; };

const S = 24;

// 1) DETERMINISM -- same seed, byte-identical faces.
{
    const a = bakeNebulaCubemap({ seed: 7, size: S }), b = bakeNebulaCubemap({ seed: 7, size: S });
    let same = true;
    for (let f = 0; f < 6; f++) for (let k = 0; k < a.faces[f].length; k++) if (a.faces[f][k] !== b.faces[f][k]) { same = false; break; }
    ok(same, "same seed bakes byte-identical faces");
}

// 2) SEED SENSITIVITY -- a different seed changes the sky.
{
    const a = bakeNebulaCubemap({ seed: 1, size: S }), b = bakeNebulaCubemap({ seed: 2, size: S });
    let diff = false;
    for (let k = 0; k < a.faces[0].length; k++) if (a.faces[0][k] !== b.faces[0][k]) { diff = true; break; }
    ok(diff, "a different seed produces a different sky");
}

// 3) NO PER-FACE TERM -- the baked texel is exactly shadeDirection of that texel's direction, on every face. This
//    is the property that makes the cubemap seamless: colour depends on DIRECTION, never on which face we baked.
{
    const P = makeParams({ seed: 9 });
    const bake = bakeNebulaCubemap({ seed: 9, size: S });
    let match = true;
    for (const f of [0, 2, 4]) for (const [i, j] of [[0, 0], [S - 1, S - 1], [S >> 1, 3]]) {
        const c = shadeDirection(faceTexelDir(f, i, j, S), P);
        const o = (j * S + i) * 3;
        const b = bake.faces[f];
        if (Math.round(c[0] * 255) !== b[o] || Math.round(c[1] * 255) !== b[o + 1] || Math.round(c[2] * 255) !== b[o + 2]) match = false;
    }
    ok(match, "each baked texel equals shadeDirection(its direction) -- no per-face contamination");
}

// 4) SEAM CONTINUITY -- the +X and +Z faces meet along the direction [1,0,1]; their nearest texels agree in
//    colour (stars off, so the gradient+nebula are continuous across the edge).
{
    const P = makeParams({ seed: 3, starDensity: 0 });
    const cX = shadeDirection(faceTexelDir(0, 0, S >> 1, S), P);        // +X, u ~ -1 edge, mid v
    const cZ = shadeDirection(faceTexelDir(4, S - 1, S >> 1, S), P);    // +Z, u ~ +1 edge, mid v
    const d = Math.max(Math.abs(cX[0] - cZ[0]), Math.abs(cX[1] - cZ[1]), Math.abs(cX[2] - cZ[2]));
    ok(d < 0.03, "the two faces sharing an edge give matching colour there (seamless)");
}

// 5) GRADIENT DIRECTION -- with nebula and stars off, up (dir.y = +1) is lighter than down (dir.y = -1).
{
    const P = makeParams({ nebulaIntensity: 0, starDensity: 0 });
    const up = shadeDirection([0, 1, 0], P), down = shadeDirection([0, -1, 0], P);
    ok(up[2] > down[2] && up[1] > down[1], "the vertical gradient brightens toward the zenith");
    // monotone along a sweep
    let mono = true, prev = -1;
    for (let k = 0; k <= 10; k++) { const y = -1 + (2 * k) / 10; const c = shadeDirection(norm([0.001, y, 0.001]), P); if (c[2] < prev - 1e-9) mono = false; prev = c[2]; }
    ok(mono, "blue channel is monotone from horizon to zenith");
}

// 6) NEBULA IS LIVE -- with a flat gradient and no stars, turning the nebula on adds variance that turning it
//    off does not (the noise is actually contributing).
{
    const flat = { lowColor: [0.02, 0.02, 0.05], highColor: [0.02, 0.02, 0.05], starDensity: 0, seed: 11, size: S };
    const varOf = (bake) => { const a = bake.faces[0]; let m = 0, m2 = 0, n = a.length / 3; for (let k = 0; k < a.length; k += 3) { m += a[k]; m2 += a[k] * a[k]; } m /= n; return m2 / n - m * m; };
    const on = varOf(bakeNebulaCubemap({ ...flat, nebulaIntensity: 1 }));
    const off = varOf(bakeNebulaCubemap({ ...flat, nebulaIntensity: 0 }));
    ok(off < 1e-6, "with the nebula off and gradient flat, the face is uniform (variance ~ 0)");
    ok(on > 1.0, "with the nebula on, the face varies (the noise reaches the pixels)");
}

// 7) STARS ARE SPARSE AND PRESENT -- some texels are much brighter than any gradient+nebula pixel, but only a few.
{
    const bake = bakeNebulaCubemap({ seed: 5, size: 48 });
    let stars = 0, total = 0;
    for (let f = 0; f < 6; f++) { const a = bake.faces[f]; for (let k = 0; k < a.length; k += 3) { total++; if (a[k] > 120 && a[k + 1] > 120 && a[k + 2] > 120) stars++; } }
    ok(stars > 0, "the star field places at least some stars");
    ok(stars < total * 0.1, "the star field is sparse (not a whiteout)");
}

// 8) DIRECTIONS ARE UNIT VECTORS on every face.
{
    let unit = true;
    for (let f = 0; f < 6; f++) for (const [i, j] of [[0, 0], [S - 1, 0], [5, 17], [S >> 1, S >> 1]]) { const d = faceTexelDir(f, i, j, S); if (!near(Math.hypot(d[0], d[1], d[2]), 1, 1e-9)) unit = false; }
    ok(unit, "faceTexelDir returns unit directions");
}

// ---- CONTROLS: each shows a property above going the wrong way under a deliberate break. ----
{
    // C1: a shade WITH a per-face term would no longer equal shadeDirection(dir) -> the seam guarantee is gone.
    const P = makeParams({ seed: 9 });
    const d = faceTexelDir(2, 3, 3, S);
    const honest = shadeDirection(d, P)[0];
    const contaminated = honest + 0.2;   // as if the bake added a per-face offset
    ok(!near(honest, contaminated, 1e-6), "control: a per-face offset WOULD break the baked==shade(dir) match");

    // C2: a flipped gradient (low/high swapped) makes the zenith darker than the horizon.
    const flip = makeParams({ nebulaIntensity: 0, starDensity: 0, lowColor: [0.02, 0.045, 0.09], highColor: [0.01, 0.02, 0.05] });
    ok(shadeDirection([0, 1, 0], flip)[2] < shadeDirection([0, -1, 0], flip)[2], "control: swapping low/high inverts the gradient");
}

// v4129 -- *** STARS ARE SHADED, NOT FLAT BLOCKS. *** Keith: "the stars in Escape velocity Nebula are square
// voxels, can they be stars?" Nothing was drawing a square -- the lattice test gave every direction inside a
// cell the SAME brightness, so a star was a flat-topped block and read as a voxel once magnified across a
// skybox face. The measurable difference is not "is it round" (a texel grid cannot answer that) but WHETHER
// ADJACENT LIT TEXELS DIFFER: flat tops means they mostly do not, a radial falloff means they nearly all do.
// starRadius:0 restores the old behaviour exactly, so the two are compared against each other rather than
// against a number I chose -- the falloff has to earn the difference.
{
    const S = 256, SEED = 7;
    const flatField = { seed: SEED, size: S, nebulaIntensity: 0, lowColor: [0, 0, 0], highColor: [0, 0, 0] };
    const measure = (starRadius) => {
        const bake = bakeNebulaCubemap({ ...flatField, starRadius });
        let lit = 0, pairs = 0, differing = 0;
        for (let f = 0; f < 6; f++) {
            const a = bake.faces[f], at = (x, y) => a[(y * S + x) * 3];
            for (let y = 1; y < S - 1; y++) for (let x = 1; x < S - 1; x++) {
                const v = at(x, y); if (!v) continue; lit++;
                for (const [qx, qy] of [[x + 1, y], [x, y + 1]]) { const w = at(qx, qy); if (!w) continue; pairs++; if (w !== v) differing++; }
            }
        }
        return { lit, pairs, pct: pairs ? (100 * differing / pairs) : 0 };
    };
    const hard = measure(0), soft = measure(undefined);   // undefined -> the shipped default
    ok(hard.pairs > 50 && soft.pairs > 50, "both settings put enough adjacent lit texels down to compare");
    ok(hard.pct < 40, `control: with starRadius 0 the stars ARE flat tops (${hard.pct.toFixed(0)}% of adjacent pairs differ)`);
    ok(soft.pct > 90, `the shipped falloff shades every star (${soft.pct.toFixed(0)}% of adjacent pairs differ)`);
    // The footprint must SURVIVE the change: a "fix" that shades stars by deleting most of them is a different
    // sky, not a rounder star -- and a smaller radius does exactly that, which is why this is pinned.
    ok(soft.lit >= hard.lit * 0.9, `the star field keeps its density (${soft.lit} lit vs ${hard.lit} before)`);
}

console.log(`nebulaSkybox-selfcheck: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
