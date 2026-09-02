// WebGLEngine/world/planetSurface-selfcheck.mjs — v3842
//
// The surface bake's claims are all arithmetic, so all of them are checkable without a GPU: the cubemap spends
// its texels evenly where equirect does not, the six faces are seamless because colour is a function of direction
// and nothing else, the normal is a real derivative of the gated height field (and a banded world proves the
// derivative's AXES are right), and the whole thing is deterministic. What the surface LOOKS like is Keith's.
//
// Run: node world/planetSurface-selfcheck.mjs   (exit 0 all-pass, 1 on any fail)

import { planetSpec, heightAt, surfaceColor } from "./procPlanet.js";
import { faceTexelDir } from "../render/cubeBake.js";
import {
    makeSurfaceParams, tangentFrame, heightAtDir, surfaceGradient, surfaceNormal, roughnessAt, surfaceSample,
    bakeSurfaceCubemap, cubeTexelSolidAngle, equirectTexelSolidAngle, texelAreaSpread, cubeTotalSolidAngle,
    dirToTexel, sampleCubeScalar,
} from "./planetSurface.js";

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error("  FAIL  " + m); } };
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const len = (a) => Math.hypot(a[0], a[1], a[2]);
const S = 24;

// A spread of directions that avoids the poles being the only interesting place.
const DIRS = [];
for (let i = 0; i < 240; i++) {
    const a = i * 0.37, b = (i % 53) * 0.06 - 1.5;
    DIRS.push([Math.cos(a) * Math.cos(b), Math.sin(b), Math.sin(a) * Math.cos(b)]);
}
// A banded (gas) world and a rocky one, found by seed sweep rather than hard-coded.
let GAS = null, ROCK = null;
for (let i = 0; i < 300 && (!GAS || !ROCK); i++) {
    const s = planetSpec(i * 7 + 3);
    if (s.noise.banded && !GAS) GAS = s;
    if (!s.noise.banded && s.type === "terran" && !ROCK) ROCK = s;
}

// 1) THE TANGENT FRAME is orthonormal and geographic (east is horizontal, north climbs).
{
    let orth = true, horiz = true;
    for (const d of DIRS) {
        const n = 1 / len(d), u = [d[0] * n, d[1] * n, d[2] * n];
        const { east, north } = tangentFrame(u);
        if (Math.abs(len(east) - 1) > 1e-12 || Math.abs(len(north) - 1) > 1e-12) orth = false;
        if (Math.abs(dot(east, north)) > 1e-12 || Math.abs(dot(east, u)) > 1e-12 || Math.abs(dot(north, u)) > 1e-12) orth = false;
        if (Math.abs(east[1]) > 1e-12) horiz = false;   // east never has a vertical component
    }
    ok(orth, "tangent frame is orthonormal against the surface direction");
    ok(horiz, "east is horizontal everywhere (the frame is geographic, not arbitrary)");
    const pole = tangentFrame([0, 1, 0]);
    ok(Math.abs(len(pole.east) - 1) < 1e-12 && Math.abs(len(pole.north) - 1) < 1e-12, "the frame survives the pole (degenerate cross product)");
}

// 2) THE HEIGHT FIELD IS THE SAME ONE -- heightAtDir is procPlanet's heightAt, not a second copy.
{
    let same = true;
    for (const d of DIRS.slice(0, 40)) {
        const n = 1 / len(d), u = [d[0] * n, d[1] * n, d[2] * n];
        if (heightAtDir(ROCK, d) !== heightAt(ROCK, u[0], u[1], u[2])) same = false;
    }
    ok(same, "heightAtDir IS procPlanet.heightAt (one height field, not two)");
    ok(heightAtDir(ROCK, [0, 0, 3]) === heightAtDir(ROCK, [0, 0, 1]), "height depends on direction only, not on the vector's length");
}

// 3) THE GRADIENT IS A REAL DERIVATIVE -- it points where the height actually rises. Checked on a deliberately
//    SMOOTH world (one octave) where the differencing step is far below the feature scale, so the property is
//    exact there; on the real multi-octave field the same test is statistical (a central difference can straddle
//    a fine ridge and be positive at a local maximum), and that is asserted as the statistic it is.
{
    const P = makeSurfaceParams();
    const SMOOTH = { ...ROCK, noise: { ...ROCK.noise, freq: 1, octaves: 1 } };
    const rises = (spec, thresh, step) => {
        let agree = 0, tried = 0, worst = 0;
        for (const u of DIRS) {
            const g = surfaceGradient(spec, u, P);
            if (Math.abs(g.dEast) < thresh) continue;
            const { east } = tangentFrame(u), s = step * Math.sign(g.dEast);
            const h0 = heightAtDir(spec, u);
            const h1 = heightAtDir(spec, [u[0] + east[0] * s, u[1] + east[1] * s, u[2] + east[2] * s]);
            tried++; if (h1 > h0) agree++;
            const pred = Math.abs(g.dEast) * Math.abs(s);
            worst = Math.max(worst, Math.abs((h1 - h0) - pred) / pred);
        }
        return { agree, tried, worst };
    };
    const sm = rises(SMOOTH, 0.02, P.eps);
    ok(sm.tried > 100 && sm.agree === sm.tried, `on a smooth world, stepping along +dEast raises the height EVERY time (${sm.agree}/${sm.tried})`);
    ok(sm.worst < 0.15, `and the gradient predicts the rise to within ${(sm.worst * 100).toFixed(1)}% (a derivative, not a direction hint)`);
    const rl = rises(ROCK, 0.3, P.eps * 0.25);
    ok(rl.tried > 100 && rl.agree / rl.tried > 0.95, `on the real fractal field it still rises ${(100 * rl.agree / rl.tried).toFixed(1)}% of the time (fine octaves take the rest)`);
    ok(surfaceGradient(ROCK, [0.3, 0.5, 0.8], P).dEast === surfaceGradient(ROCK, [0.3, 0.5, 0.8], P).dEast, "gradient is deterministic");
}

// 4) A BANDED WORLD PROVES THE AXES. A gas giant's height varies with LATITUDE only, so its gradient must lie
//    along north and all but vanish along east. A rocky world is isotropic and must NOT show that split. This is
//    the check that would catch a swapped or rotated tangent frame, which no magnitude test can see.
{
    const P = makeSurfaceParams();
    const anis = (spec) => {
        let e = 0, n = 0;
        for (const d of DIRS) { const g = surfaceGradient(spec, d, P); e += Math.abs(g.dEast); n += Math.abs(g.dNorth); }
        return n / Math.max(1e-9, e);
    };
    const gasA = anis(GAS), rockA = anis(ROCK);
    ok(gasA > 5, `a banded world's gradient runs north, not east (|dNorth|/|dEast| = ${gasA.toFixed(2)})`);
    ok(rockA > 0.6 && rockA < 1.6, `a rocky world's gradient is isotropic (ratio ${rockA.toFixed(2)})`);
    ok(gasA > rockA * 4, "banding is a property of the world, not of the differencing");
}

// 5) THE NORMAL: unit, outward, and a smooth ball when relief is off.
{
    const P = makeSurfaceParams(), P0 = makeSurfaceParams({ relief: 0 });
    let unit = true, outward = true, identity = true, moved = false;
    for (const d of DIRS) {
        const n = 1 / len(d), u = [d[0] * n, d[1] * n, d[2] * n];
        const nn = surfaceNormal(ROCK, u, P);
        if (Math.abs(len(nn) - 1) > 1e-12) unit = false;
        if (dot(nn, u) <= 0) outward = false;
        if (dot(nn, u) < 0.999999) moved = true;
        const flat = surfaceNormal(ROCK, u, P0);
        if (Math.abs(flat[0] - u[0]) > 1e-15 || Math.abs(flat[1] - u[1]) > 1e-15 || Math.abs(flat[2] - u[2]) > 1e-15) identity = false;
    }
    ok(unit, "the perturbed normal is always a unit vector");
    ok(outward, "the normal never tips past the horizon (dot(normal, dir) > 0 everywhere)");
    ok(identity, "relief 0 returns the sphere normal EXACTLY (a smooth ball, no drift)");
    ok(moved, "relief on actually moves the normal (the terrain is not a decal)");
}

// 5b) THE TILT RUNS THE RIGHT WAY. A slope tilts its normal AWAY from uphill, so the normal's east component
//     must carry the opposite sign to dEast (and north to dNorth). This is the check a flipped sign fails and
//     every magnitude test above survives.
{
    const P = makeSurfaceParams();
    let agreeE = 0, agreeN = 0, tried = 0;
    for (const u of DIRS) {
        const g = surfaceGradient(ROCK, u, P);
        if (Math.abs(g.dEast) < 0.3 || Math.abs(g.dNorth) < 0.3) continue;
        const n = surfaceNormal(ROCK, u, P), { east, north } = tangentFrame(u);
        tried++;
        if (Math.sign(dot(n, east)) === -Math.sign(g.dEast)) agreeE++;
        if (Math.sign(dot(n, north)) === -Math.sign(g.dNorth)) agreeN++;
    }
    ok(tried > 50 && agreeE === tried, `the normal leans AWAY from uphill in east (${agreeE}/${tried})`);
    ok(agreeN === tried, `and away from uphill in north (${agreeN}/${tried})`);
}

// 6) THE TILT CAP holds even when the relief is turned up past anything sane.
{
    const P = makeSurfaceParams({ relief: 40 });
    let held = true, minDot = 1;
    for (const d of DIRS) {
        const n = 1 / len(d), u = [d[0] * n, d[1] * n, d[2] * n];
        const dd = dot(surfaceNormal(ROCK, u, P), u);
        minDot = Math.min(minDot, dd); if (dd <= 0) held = false;
    }
    const bound = 1 / Math.hypot(1, makeSurfaceParams().maxTilt);
    ok(held && minDot >= bound - 1e-9, `relief 40 still cannot tip a normal past the cap (min dot ${minDot.toFixed(4)} >= ${bound.toFixed(4)})`);
}

// 7) ROUGHNESS: water is smooth, ground is not, and the shoreline is a blend rather than a cliff.
{
    const P = makeSurfaceParams();
    const sea = roughnessAt(ROCK, ROCK.seaLevel - 0.2, P), land = roughnessAt(ROCK, ROCK.seaLevel + 0.2, P);
    ok(sea < land, "sea is smoother than land");
    ok(Math.abs(sea - P.seaRough) < 1e-9 && Math.abs(land - P.landRough) < 1e-9, "roughness saturates to the two declared values");
    const shore = roughnessAt(ROCK, ROCK.seaLevel, P);
    ok(shore > sea && shore < land, "the shoreline blends rather than steps");
    let mono = true;
    for (let h = 0; h < 1; h += 0.01) if (roughnessAt(ROCK, h + 0.01, P) < roughnessAt(ROCK, h, P) - 1e-12) mono = false;
    ok(mono, "roughness is monotone in height");
}

// 8) NO PER-FACE TERM -- the baked texel is exactly surfaceSample of that texel's direction, on every face. This
//    is the property that makes the cubemap seamless, and it is the whole reason for leaving equirect behind.
{
    const P = makeSurfaceParams({ size: S });
    const bake = bakeSurfaceCubemap(ROCK, { size: S });
    let match = true;
    for (let f = 0; f < 6; f++) for (const [i, j] of [[0, 0], [S - 1, S - 1], [S >> 1, 3], [2, S - 2]]) {
        const s = surfaceSample(ROCK, faceTexelDir(f, i, j, S), P);
        const k = j * S + i, o = k * 3;
        if (Math.round(s.color[0] * 255) !== bake.albedo[f][o]) match = false;
        if (Math.round((s.normal[1] * 0.5 + 0.5) * 255) !== bake.normal[f][o + 1]) match = false;
        if (Math.round(s.rough * 255) !== bake.rough[f][k]) match = false;
        if (Math.round(s.height * 255) !== bake.height[f][k]) match = false;
    }
    ok(match, "every baked texel equals surfaceSample(its direction) -- no per-face contamination");
}

// 9) SEAM CONTINUITY at a shared edge: +X and +Z meet along [1,0,1] and must agree there.
{
    const P = makeSurfaceParams();
    const a = surfaceSample(ROCK, faceTexelDir(0, 0, S >> 1, S), P);        // +X face, u ~ -1 edge
    const b = surfaceSample(ROCK, faceTexelDir(4, S - 1, S >> 1, S), P);    // +Z face, u ~ +1 edge
    const dc = Math.max(Math.abs(a.color[0] - b.color[0]), Math.abs(a.color[1] - b.color[1]), Math.abs(a.color[2] - b.color[2]));
    ok(dc < 0.05, "the two faces sharing an edge give matching colour there (seamless by construction)");
    ok(Math.abs(a.height - b.height) < 0.05, "and matching height");
}

// 10) THE BIOME RULE IS THE SHARED ONE -- the cube bake paints with procPlanet's surfaceColor, so a palette
//     change moves both bakes or neither. (Compared to 1e-9 rather than bit-exact: surfaceSample re-normalises
//     the direction it is handed, which moves the last bits of an already-unit vector.)
{
    const P = makeSurfaceParams();
    let worst = 0;
    for (const d of DIRS.slice(0, 30)) {
        const n = 1 / len(d), u = [d[0] * n, d[1] * n, d[2] * n];
        const s = surfaceSample(ROCK, u, P);
        const c = surfaceColor(ROCK, heightAt(ROCK, u[0], u[1], u[2]), u[1]);
        for (let k = 0; k < 3; k++) worst = Math.max(worst, Math.abs(s.color[k] - c[k]));
    }
    ok(worst < 1e-9, `the cube bake paints with procPlanet's own biome rule (one owner, two bakes; worst delta ${worst.toExponential(1)})`);
}

// 11) DETERMINISM and SEED SENSITIVITY.
{
    const a = bakeSurfaceCubemap(ROCK, { size: 12 }), b = bakeSurfaceCubemap(ROCK, { size: 12 });
    let same = true;
    for (let f = 0; f < 6; f++) {
        for (let k = 0; k < a.albedo[f].length; k++) if (a.albedo[f][k] !== b.albedo[f][k]) same = false;
        for (let k = 0; k < a.normal[f].length; k++) if (a.normal[f][k] !== b.normal[f][k]) same = false;
    }
    ok(same, "the same spec bakes byte-identical faces");
    const other = bakeSurfaceCubemap(GAS, { size: 12 });
    let diff = false;
    for (let k = 0; k < a.albedo[0].length; k++) if (a.albedo[0][k] !== other.albedo[0][k]) { diff = true; break; }
    ok(diff, "a different planet bakes a different surface");
    ok(a.albedo.length === 6 && a.albedo[0].length === 12 * 12 * 3 && a.rough[0].length === 12 * 12, "bake shape correct (6 faces, 3 bytes albedo/normal, 1 byte rough/height)");
    let valid = true;
    for (let f = 0; f < 6; f++) for (let k = 0; k < a.normal[f].length; k++) if (!(a.normal[f][k] >= 0 && a.normal[f][k] <= 255)) valid = false;
    ok(valid, "every baked byte is a byte");
}

// 12) THE PROJECTION CLAIM, MEASURED. This is the reason the round exists, so it is asserted and not asserted
//     loosely: the cube's worst texel-area ratio is bounded by 3^1.5 at EVERY resolution, equirect's grows with
//     height and is already past 80x at the 256x128 the v3830 backdrop bakes.
{
    const cube = texelAreaSpread("cube", 64), equi = texelAreaSpread("equirect", 256, 128);
    ok(cube.ratio < Math.pow(3, 1.5) + 1e-9, `cube texel-area spread ${cube.ratio.toFixed(3)} stays under 3^1.5 = 5.196`);
    ok(equi.ratio > 80, `equirect at 256x128 spends texels ${equi.ratio.toFixed(1)}x more densely at the pole than the equator`);
    ok(equi.ratio / cube.ratio > 15, "the cube bake is more than an order of magnitude more even");
    const c16 = texelAreaSpread("cube", 16).ratio, c256 = texelAreaSpread("cube", 256).ratio;
    ok(c16 < 5.196 && c256 < 5.196 && c256 > c16, "the cube bound holds at every resolution and tightens toward it");
    const e64 = texelAreaSpread("equirect", 128, 64).ratio, e256 = texelAreaSpread("equirect", 512, 256).ratio;
    ok(e256 > e64 * 3, "equirect's waste GROWS with resolution (it does not converge to anything)");
    ok(equirectTexelSolidAngle(0, 256, 128) < equirectTexelSolidAngle(64, 256, 128), "the equirect pole texel is the small one (the pinch is real)");
}

// 13) THE BAKE'S GEOMETRY CHECKS ITSELF against a constant it was never told: the six faces' texel solid angles
//     must sum to the sphere's 4*pi, and the midpoint sum must converge at SECOND order (4x per doubling).
{
    const err = (s) => Math.abs(cubeTotalSolidAngle(s) - 4 * Math.PI);
    ok(err(64) < 1e-3, `six faces of texels sum to 4*pi (err ${err(64).toExponential(2)} at size 64)`);
    const r1 = err(16) / err(32), r2 = err(32) / err(64), r3 = err(64) / err(128);
    ok(Math.abs(r1 - 4) < 0.3 && Math.abs(r2 - 4) < 0.3 && Math.abs(r3 - 4) < 0.3,
        `and converges at second order (${r1.toFixed(2)}, ${r2.toFixed(2)}, ${r3.toFixed(2)} -- 4x per doubling)`);
    ok(cubeTexelSolidAngle(0, 32, 32, 64) > cubeTexelSolidAngle(0, 0, 0, 64), "the face centre texel covers more sky than the corner one");
}

// 14) READING THE BAKE BACK. dirToTexel must invert faceTexelDir, or the front door's CPU displacement would
//     push vertices out by somebody else's terrain. Every texel must round-trip to itself, and every direction
//     must land within one texel of where it came from.
{
    const size = 16;
    let selfTrip = true, worstAngle = 0;
    for (let f = 0; f < 6; f++) for (let j = 0; j < size; j++) for (let i = 0; i < size; i++) {
        const t = dirToTexel(faceTexelDir(f, i, j, size), size);
        if (t.f !== f || t.i !== i || t.j !== j) selfTrip = false;
    }
    ok(selfTrip, `every one of the ${6 * size * size} texel centres round-trips to its own face and index`);
    for (const d of DIRS) {
        const n = 1 / len(d), u = [d[0] * n, d[1] * n, d[2] * n];
        const t = dirToTexel(u, size), back = faceTexelDir(t.f, t.i, t.j, size);
        worstAngle = Math.max(worstAngle, Math.acos(Math.min(1, dot(u, back))));
    }
    const texelAngle = Math.atan(2 / size) * Math.SQRT2;   // half-diagonal of a face texel, in radians
    ok(worstAngle < texelAngle, `every direction lands within one texel of itself (worst ${worstAngle.toFixed(4)} rad < ${texelAngle.toFixed(4)})`);
    // and the scalar read agrees with the bake it came from
    const bake = bakeSurfaceCubemap(ROCK, { size });
    let agree = true;
    for (let f = 0; f < 6; f++) for (const [i, j] of [[0, 0], [size - 1, 3], [size >> 1, size >> 1]]) {
        const d = faceTexelDir(f, i, j, size);
        if (sampleCubeScalar(bake.height, size, d) !== bake.height[f][j * size + i] / 255) agree = false;
    }
    ok(agree, "sampleCubeScalar reads back the same byte the bake wrote");
}

if (fail) { console.error(`\nplanetSurface-selfcheck: ${pass} pass, ${fail} FAIL`); process.exit(1); }
console.log(`planetSurface-selfcheck: all ${pass} pass`);
