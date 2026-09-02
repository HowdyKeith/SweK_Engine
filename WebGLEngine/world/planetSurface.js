// WebGLEngine/world/planetSurface.js — v3842 (Long Silence: the planet's SURFACE, cube-baked with relief)
//
// v3830 gave the planet a body: a seed picks a type and a palette, 3D fBm gives a height field, a biome rule
// paints it. It painted into an EQUIRECTANGULAR texture, and that projection has two defects a backdrop can hide
// but a place cannot. (1) A POLE PINCH: every texel of the top row describes very nearly the same direction, so
// the poles are baked at ~80x the resolution of the equator at 256x128 and the equator is the part you fly past.
// (2) A WRAP SEAM at lon = +/-pi, held together by wrapS rather than by construction. This round bakes the same
// surface into a CUBEMAP instead -- the shape the skybox (v3833) and the star (v3835) already proved out, where
// every texel is a pure function of DIRECTION so the six faces agree at their shared edges for free.
//
// It also bakes what a surface needs and a painted ball does not: a NORMAL derived analytically from the height
// field's tangent-plane gradient, so terrain catches the key light instead of reading as a decal; a ROUGHNESS
// mask so sea is smooth and land is not; and the HEIGHT itself, so the front door can push the silhouette out.
//
// ONE OWNER, TWO BAKES. The type, the palette, the noise and the biome rule all still live in world/procPlanet.js
// -- this file imports heightAt and surfaceColor rather than growing a second copy, exactly as the star imports
// the skybox's fbm. The cube geometry (faceTexelDir) comes from render/cubeBake.js for the same reason (v4327;
// it lived in render/nebulaSkybox.js until then, which had this file reaching into a backdrop for its geometry).
//
// PURE: no Three, no GL, no DOM, no Math.random. Same spec -> byte-identical faces. Gated headless in
// world/planetSurface-selfcheck.mjs.

import { faceTexelDir, bakeCubemapTargets } from "../render/cubeBake.js";   // the SAME cube geometry, and its walk
import { heightAt, surfaceColor } from "./procPlanet.js";   // the SAME height field and biome rule as the equirect bake

const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const norm3 = (v) => { const n = 1 / Math.hypot(v[0], v[1], v[2]); return [v[0] * n, v[1] * n, v[2] * n]; };

const DEFAULTS = {
    size: 128,        // face resolution
    relief: 0.08,     // how hard the height gradient tilts the normal (0 = a smooth ball). At this value the
                      // measured mean tilt is ~0.27 (about 15 deg) and NOTHING clips the cap below -- the cap is
                      // a guard against a violent seed, not the working regime.
    eps: 0.004,       // tangent step used to difference the height field
    maxTilt: 0.86,    // cap on the tangential component of the normal (~59 deg); keeps normals above the horizon
    seaRough: 0.18,   // roughness of water (smooth -> specular)
    landRough: 0.94,  // roughness of ground
};
export function makeSurfaceParams(opts = {}) { return { ...DEFAULTS, ...opts }; }

// ---- geographic tangent frame ----
// EAST is the direction of increasing longitude, NORTH completes the frame. Choosing the frame geographically
// (rather than an arbitrary perpendicular) is what makes a banded world checkable: a gas giant's height varies
// with latitude only, so its surface gradient must lie along NORTH and vanish along EAST.
export function tangentFrame(dir) {
    const d = norm3(dir);
    let e = [d[2], 0, -d[0]];                      // cross([0,1,0], d), the eastward tangent
    const len = Math.hypot(e[0], e[1], e[2]);
    if (len < 1e-6) e = [1, 0, 0]; else { e = [e[0] / len, e[1] / len, e[2] / len]; }
    const n = [d[1] * e[2] - d[2] * e[1], d[2] * e[0] - d[0] * e[2], d[0] * e[1] - d[1] * e[0]];   // cross(d, e)
    return { east: e, north: norm3(n) };
}

// Height at a direction, on the SAME field the equirect bake uses.
export function heightAtDir(spec, dir) { const d = norm3(dir); return heightAt(spec, d[0], d[1], d[2]); }

/**
 * v4053 -- THE DISPLACED SURFACE RADIUS AT A DIRECTION: how far the ground actually is from the planet's centre,
 * once the relief has pushed the mesh out. es-box3d-fly3d.html has computed this inline since v3842 to displace
 * its sphere's vertices; rig/cinematicShot.js now needs the SAME number to know where the ground is, and two
 * copies of a displacement formula is how a camera ends up flying through a mountain that the renderer drew and
 * the camera never knew about. One declaration, two consumers.
 *
 * `height` may be passed in when the caller already has the BAKED value (the page reads it back out of its
 * cubemap, which is quantised to bytes); omitted, the analytic field answers. Those two agree by construction
 * but are not bit-identical, which is exactly why a camera clearance should carry a margin rather than trust
 * equality -- see the gate, which measures the gap rather than assuming it away.
 *
 * Sea stays a LEVEL surface: heights below sea level all displace to the same radius, so an ocean is flat.
 */
export function surfaceRadiusAt(spec, dir, { radius = 1, ampFrac = 0.035, height = null } = {}) {
    const h = (height === null || height === undefined) ? heightAtDir(spec, dir) : height;
    const k = 1 + ampFrac * (Math.max(h, spec.seaLevel) - spec.seaLevel) / Math.max(1e-3, 1 - spec.seaLevel);
    return radius * k;
}

// The height field's gradient in the tangent plane: { dEast, dNorth }, a central difference over a small angular
// step. Pure arithmetic on the gated height field, so a wrong sign here is arithmetic, not taste.
export function surfaceGradient(spec, dir, P) {
    const d = norm3(dir), { east, north } = tangentFrame(d), e = P.eps;
    const step = (t, s) => heightAtDir(spec, [d[0] + t[0] * s, d[1] + t[1] * s, d[2] + t[2] * s]);
    return {
        dEast: (step(east, e) - step(east, -e)) / (2 * e),
        dNorth: (step(north, e) - step(north, -e)) / (2 * e),
    };
}

// Outward normal perturbed by the terrain. A height field r = 1 + a*h tilts its normal AGAINST the gradient, so
// the tangential part is subtracted. The tangential magnitude is capped at maxTilt, which is what keeps a normal
// from tipping past the horizon (dot(n, dir) > 0 always) no matter how violent the noise is.
export function surfaceNormal(spec, dir, P) {
    const d = norm3(dir);
    if (P.relief <= 0) return d;
    const { dEast, dNorth } = surfaceGradient(spec, dir, P);
    const { east, north } = tangentFrame(d);
    let tE = -P.relief * dEast, tN = -P.relief * dNorth;
    const mag = Math.hypot(tE, tN);
    if (mag > P.maxTilt) { const k = P.maxTilt / mag; tE *= k; tN *= k; }
    return norm3([d[0] + east[0] * tE + north[0] * tN, d[1] + east[1] * tE + north[1] * tN,
                  d[2] + east[2] * tE + north[2] * tN]);
}

// Water is smooth, ground is not. Sea level is the switch, with a narrow blend across the shoreline.
export function roughnessAt(spec, height, P) {
    const blend = 0.03;
    const t = clamp01((height - spec.seaLevel + blend) / (2 * blend));
    return P.seaRough + (P.landRough - P.seaRough) * t;
}

// Everything the surface knows in one direction. A PURE FUNCTION OF DIRECTION -- this is the property that makes
// the six faces seamless, and it is the property the gate gets to check by construction.
export function surfaceSample(spec, dir, P) {
    const d = norm3(dir);
    const height = heightAt(spec, d[0], d[1], d[2]);
    return {
        height,
        color: surfaceColor(spec, height, d[1]),        // d[1] IS sin(latitude) on the unit sphere
        normal: surfaceNormal(spec, d, P),
        rough: roughnessAt(spec, height, P),
    };
}

// Bake the surface to six faces. Returns { size, albedo, normal, rough, height } where albedo/normal are
// 3 bytes/texel and rough/height are 1 byte/texel, six buffers each, in GL face order. Normals are OBJECT SPACE,
// encoded 0.5 + 0.5*n, so the front door samples them by the same direction it samples the albedo with.
export function bakeSurfaceCubemap(spec, opts = {}) {
    const P = makeSurfaceParams(opts), size = P.size;
    // v4336 -- the walk is cubeBake's MULTI-TARGET form, and this bake is the reason that form exists. Four
    // targets come out of ONE surfaceSample per texel; a single-target helper would have called it four times,
    // so the generalisation is the number of targets rather than a fourth copy of the loop. Byte-for-byte the
    // same output as the hand-written version -- the digests in the gate were taken before the change.
    const { targets } = bakeCubemapTargets(size, [3, 3, 1, 1], (dir) => {
        const s = surfaceSample(spec, dir, P);
        return [s.color, [s.normal[0] * 0.5 + 0.5, s.normal[1] * 0.5 + 0.5, s.normal[2] * 0.5 + 0.5],
                [s.rough], [s.height]];
    });
    return { size, albedo: targets[0], normal: targets[1], rough: targets[2], height: targets[3] };
}

// ---- the projection claim, as arithmetic ----
// Solid angle of one cube-face texel. The face plane element (2/size)^2 is projected onto the sphere: the ray
// through the texel has length L = |v| and meets the plane at cos = 1/L, so dOmega = (2/size)^2 / L^3.
export function cubeTexelSolidAngle(f, i, j, size) {
    const u = ((i + 0.5) / size) * 2 - 1, v = ((j + 0.5) / size) * 2 - 1;
    const L = Math.sqrt(1 + u * u + v * v);
    return (2 / size) * (2 / size) / (L * L * L);
}

// Solid angle of one equirect texel in row y of a w x h texture: the row spans dLat = pi/h and dLon = 2pi/w,
// scaled by cos(lat) -- which is what collapses to nothing at the poles.
export function equirectTexelSolidAngle(y, w, h) {
    const lat = (0.5 - (y + 0.5) / h) * Math.PI;
    return (2 * Math.PI / w) * (Math.PI / h) * Math.cos(lat);
}

// The ratio of the largest to the smallest texel in a projection -- how unevenly it spends its texels on the
// sphere. 1 would be perfect. The cube's worst case is 3^1.5 = 5.196 (centre against corner) at every resolution;
// equirect's grows without bound with h. Returns { min, max, ratio }.
export function texelAreaSpread(kind, size, h) {
    let mn = Infinity, mx = 0;
    if (kind === "cube") {
        for (let j = 0; j < size; j++) for (let i = 0; i < size; i++) {
            const s = cubeTexelSolidAngle(0, i, j, size); if (s < mn) mn = s; if (s > mx) mx = s;
        }
    } else {
        const H = h || size;
        for (let y = 0; y < H; y++) { const s = equirectTexelSolidAngle(y, size, H); if (s < mn) mn = s; if (s > mx) mx = s; }
    }
    return { min: mn, max: mx, ratio: mx / mn };
}

// Total solid angle of a whole cube bake: a midpoint sum that must converge on the sphere's own 4*pi. This is the
// bake's geometry checking itself against a constant it was never told.
export function cubeTotalSolidAngle(size) {
    let sum = 0;
    for (let j = 0; j < size; j++) for (let i = 0; i < size; i++) sum += cubeTexelSolidAngle(0, i, j, size);
    return sum * 6;
}

// ---- reading the bake back ----
// Inverse of faceTexelDir: which face and which texel a direction lands on. The largest component picks the face;
// dividing the other two by it gives the face coordinates. The front door uses this to read the baked HEIGHT on
// the CPU and push the sphere's vertices out, so the planet's silhouette carries the terrain too -- no vertex
// texture fetch, nothing that depends on a GPU feature.
export function dirToTexel(dir, size) {
    const [x, y, z] = norm3(dir);
    const ax = Math.abs(x), ay = Math.abs(y), az = Math.abs(z);
    let f, u, v;
    if (ax >= ay && ax >= az) {
        if (x > 0) { f = 0; u = -z / ax; v = -y / ax; } else { f = 1; u = z / ax; v = -y / ax; }
    } else if (ay >= az) {
        if (y > 0) { f = 2; u = x / ay; v = z / ay; } else { f = 3; u = x / ay; v = -z / ay; }
    } else {
        if (z > 0) { f = 4; u = x / az; v = -y / az; } else { f = 5; u = -x / az; v = -y / az; }
    }
    const clampIdx = (t) => (t < 0 ? 0 : t > size - 1 ? size - 1 : t);
    return { f, i: clampIdx(Math.floor((u + 1) * 0.5 * size)), j: clampIdx(Math.floor((v + 1) * 0.5 * size)) };
}

// Read one 1-byte-per-texel channel (height or rough) of a bake in a given direction, as a float in [0, 1].
export function sampleCubeScalar(faces, size, dir) {
    const { f, i, j } = dirToTexel(dir, size);
    return faces[f][j * size + i] / 255;
}
