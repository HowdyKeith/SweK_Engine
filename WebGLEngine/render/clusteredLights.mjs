// WebGLEngine/render/clusteredLights.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// MANY LIGHTS: CLUSTERED LIGHTING, A SHADOW ATLAS, CASCADED SUN SHADOWS AND LIGHT COOKIES, FOR WEBGL2 AND WEBGPU. Backlog: render/BACKLOG_2026-11-21_PLAYCANVAS.md, `clustered-lights`
// (PlayCanvas src/scene/lighting/world-clusters.js, src/scene/renderer/world-clusters-allocator.js, src/scene/lighting/light-texture-atlas.js, the cascades of
// src/scene/renderer/shadow-renderer-directional.js and the cookies of src/scene/light.js). Keith: "keep going with clustered lighting and the shadow atlas", "the WebGPU version",
// then "clusters fitted to the camera's view, cascaded shadows for the sun, and light cookies".
//
// THE CLUSTERS, IN ONE OF TWO SPACES (option `space`):
//   "world" (PlayCanvas's): a grid of cells over the box that holds every light's range.        buildClusters(lights, { cells, maxPerCell })
//   "view" (2026-11-22, FROXELS): the camera's frustum cut into screen tiles and EXPONENTIAL depth slices (slice s spans near (far/near)^(s/nz) .. near (far/near)^((s+1)/nz)),
//          rebuilt with the camera each frame; a froxel's box in view space holds its tile's four rays between its slice's two depths.
//                                                                                                buildViewClusters(lights, camera, { viewCells, maxPerCell })
//   Either way each cell lists the lights whose sphere of range touches its box (up to `maxPerCell`; the rest counted as OVERFLOW, never silently lost); a point looks up its
//   cell and loops over that cell's lights only. A light reaches nothing past its range (the window is exactly 0 there), so a cell that lists every light touching it shades
//   EXACTLY as a loop over all the lights. A pixel finds its froxel by projecting its world point (not from gl_FragCoord), the same on WebGL2 and WebGPU.
// THE LIGHTS: { type: "point" | "spot" | "directional", position, range, color, intensity, direction, innerAngle, outerAngle (radians, half-angles), shadow, priority, cookie }
//      falloff  window(d, r) = clamp(1 - (d/r)^4, 0, 1)^2 / (d^2 + 1)      (Karis 2013's; 0 at and past the range); a directional light has none
//      spot     smoothstep(cos outer, cos inner, the angle off the spot's axis)
//      shading  albedo * radiance * max(n.l, 0) + 0.25 * radiance * max(n.h, 0)^32 (Blinn-Phong), summed, each times its shadow
//   THE SUN: one directional light (the first), lighting everything, outside the clusters (it has no range): every pixel adds it once.
// THE SHADOW ATLAS. One depth texture `atlasSize` square in `slots` x `slots` tiles. THE SUN'S CASCADES COME FIRST (`cascades` tiles, 2026-11-22), then the other shadowed
// lights by `priority` (higher first, then their order): a spot light one tile, a point light six (cube faces +x, -x, +y, -y, +z, -z). A light with no room goes without a shadow,
// listed (allocateAtlas(...).unshadowed). Sampled with the hardware's 2 x 2 comparison, inside the tile only. THE BIAS IS IN WORLD UNITS, along the surface normal and half as far
// toward the light: bias * (1 + distance to the light) for a spot or point light (a depth bias would be metres far away, where depth is compressed; along the light alone it
// left acne at grazing angles -- both found by the gate), and two of its cascade's texels for the sun.
//   SOFT SHADOWS (2026-11-22, Keith's "shadow quality": softer edges): with CLUSTERED_SOFT defined before CLUSTERED_GLSL, or clusteredWGSL({ soft: true }), every shadow is
//   PERCENTAGE-CLOSER SOFT (Fernando 2005), contact-hardening: 16 taps (POISSON16) within `maxPenumbra` texels find the blockers' mean depth; the penumbra is the light's size
//   by similar triangles -- a light's `softness` is its emitter's radius in world units (spot, point) or its angular radius in radians (the sun) -- in texels at the receiver,
//      spot, point   softness * (d_r - d_b) / (d_b * d_r) / texelAngle        d linear depths from the light, texelAngle = 2 tan(fov / 2) / tile pixels
//      sun           (z_r - z_b) * depthRange * tan(softness) / worldTexel    z the tile's 0..1 depth (an orthographic map: linear)
//   clamped to 1 .. maxPenumbra texels (penumbraTexels(face, zr, zb) on the CPU, from the face's `penumbra`, `depthNear`, `depthFar`); then 16 comparison taps within it. A
//   shadow touching its caster is hard; it widens with the gap. Without softness a light's shadow is a 1-texel-radius filter of 16 taps.
//   CASCADES (2026-11-22): the camera's view out to `shadowDistance` split by the practical scheme (Zhang 2006: lambda of the logarithmic split plus 1 - lambda of the even one);
//   each cascade an orthographic map of the bounding sphere of its slice of the frustum, pushed `casterReach` back toward the sun for casters outside the view, its centre snapped
//   to whole texels in the light's frame so it does not shimmer as the camera moves. A point takes the first cascade whose far split is beyond its view depth; past the last,
//   no sun shadow.            cascadeSplits(near, distance, n, lambda); cascadeMatrices(sun, camera, { cascades, shadowDistance, lambda, tileSize, casterReach })
// LIGHT COOKIES (2026-11-22): a spot light with `cookie: k` multiplies its light by tile k of a COOKIE ATLAS (2 x 2 tiles of RGB), projected down its cone (the same matrix as its
//   shadow); outside the projection, nothing. makeCookieAtlas(size) makes the four patterns (window panes, rings, stained glass, leaves) the demos use; cookieSample is the
//   bilinear lookup the GPU does, on the CPU. Row 0 of the cookie data is v = 0 on both backends.
//
// THE CAMERA, for view clusters and cascades: { view, proj, near, far } (column-major, WebGL2's -1..1 depth; WebGPU's shaders read the same view and the same x and y scale).
//   const L = createClusteredLighting(gl, opts)       WebGL2         const L = createClusteredLightingGPU(device, opts)    WebGPU
//   L.update(lights, camera, cookies?)                clusters, atlas, light and face data built and uploaded (cookies: makeCookieAtlas's, uploaded once when given)
//   L.renderShadows(drawDepth)  /  L.renderShadows(encoder, drawDepth)       for each atlas face, its tile's viewport, drawDepth(viewProj, face) / drawDepth(pass, face)
//   L.bind(program, firstUnit)  /  L.bindGroupFor(pipeline, group)           the chunk's textures and uniforms
//   CLUSTERED_GLSL (#define CLUSTERED_BRUTE, CLUSTERED_NO_SHADOWS before it)  /  clusteredWGSL({ group, brute, shadows })
//      vec3 clusteredLight(vec3 p, vec3 n, vec3 v, vec3 albedo)  /  fn clusteredLight(p: vec3f, n: vec3f, v: vec3f, albedo: vec3f) -> vec3f
//   shadeCPU(lights, clusters, p, n, v, albedo, { brute, shadowOf, cookies }) the same sum on the CPU
//   FOR THE FOG (2026-11-27, Keith's "close the shadow gaps"): clInScatter(i, p, dir, g) -- light i's in-scattering at a point of a ray, shadowed, cone, cookie and all -- and
//   clSunShadowAt(p), in both chunks; inScatterCPU(light, p, dir, g, { shadow, cookies }) on the CPU. render/volumetricFog.mjs marches them.
// Held by tools/ship/clusteredLights-selfcheck.mjs (lights-demo.html and lights-gpu.html in headless Chromium).
"use strict";

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]], mul = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2], len = (a) => Math.hypot(a[0], a[1], a[2]);
const norm = (a) => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; }, cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const DEFAULTS = Object.freeze({ maxPenumbra: 24, maxLights: 256, cells: [12, 4, 12], viewCells: [16, 9, 24], space: "world", maxPerCell: 24, atlasSize: 2048, slots: 4, bias: 0.006, cascades: 3, shadowDistance: 30, lambda: 0.6, casterReach: 20, cookieSize: 256 });
export const window_ = (d, r) => { const x = Math.min(1, Math.max(0, 1 - Math.pow(d / r, 4))); return (x * x) / (d * d + 1); };
const smoothstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const T4 = (m, v) => [0, 1, 2, 3].map((r) => m[r] * v[0] + m[4 + r] * v[1] + m[8 + r] * v[2] + m[12 + r] * v[3]);
const isSun = (l) => l.type === "directional";
export const sunIndexOf = (lights) => lights.findIndex(isSun);

/** The cluster grid over the lights' ranges (world space). The sun has no range: it is not in any cell. */
export function buildClusters(lights, { cells = DEFAULTS.cells, maxPerCell = DEFAULTS.maxPerCell } = {}) {
    const [nx, ny, nz] = cells, N = nx * ny * nz, counts = new Int32Array(N), lists = new Int32Array(N * maxPerCell).fill(-1), ranged = lights.map((l, i) => [l, i]).filter(([l]) => !isSun(l));
    if (!ranged.length) return { mode: "world", min: [0, 0, 0], max: [1, 1, 1], dims: [nx, ny, nz], size: [1 / nx, 1 / ny, 1 / nz], counts, lists, overflow: 0, maxPerCell };
    const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
    for (const [l] of ranged) for (let k = 0; k < 3; k++) { min[k] = Math.min(min[k], l.position[k] - l.range); max[k] = Math.max(max[k], l.position[k] + l.range); }
    const size = [0, 1, 2].map((k) => (max[k] - min[k]) / cells[k] || 1);
    let overflow = 0;
    for (const [l, i] of ranged) {
        const lo = [0, 1, 2].map((k) => Math.max(0, Math.floor((l.position[k] - l.range - min[k]) / size[k]))), hi = [0, 1, 2].map((k) => Math.min(cells[k] - 1, Math.floor((l.position[k] + l.range - min[k]) / size[k])));
        for (let z = lo[2]; z <= hi[2]; z++) for (let y = lo[1]; y <= hi[1]; y++) for (let x = lo[0]; x <= hi[0]; x++) {
            const b0 = [min[0] + x * size[0], min[1] + y * size[1], min[2] + z * size[2]], q = [0, 1, 2].map((k) => Math.min(Math.max(l.position[k], b0[k]), b0[k] + size[k]));
            if (len(sub(q, l.position)) >= l.range) continue;
            const c = (z * ny + y) * nx + x;
            if (counts[c] < maxPerCell) lists[c * maxPerCell + counts[c]++] = i; else overflow++;
        }
    }
    return { mode: "world", min, max, dims: [nx, ny, nz], size, counts, lists, overflow, maxPerCell };
}
/** The world cell of a point, or -1 outside the grid. */
export function cellOf(C, p) {
    if (C.mode === "view") return cellOfView(C, p);
    const c = [0, 1, 2].map((k) => Math.floor((p[k] - C.min[k]) / C.size[k]));
    if (c.some((v, k) => v < 0 || v >= C.dims[k])) return -1;
    return (c[2] * C.dims[1] + c[1]) * C.dims[0] + c[0];
}
/** The depth at which view slice s begins (s = nz is the far plane). */
export const sliceDepth = (C, s) => C.near * Math.pow(C.far / C.near, s / C.dims[2]);
/** A froxel's box in view space: { lo, hi }. */
export function froxelBox(C, x, y, s) {
    const [tx, ty] = C.dims, d0 = sliceDepth(C, s), d1 = sliceDepth(C, s + 1), lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
    for (const nx of [-1 + (2 * x) / tx, -1 + (2 * (x + 1)) / tx]) for (const ny of [-1 + (2 * y) / ty, -1 + (2 * (y + 1)) / ty]) for (const d of [d0, d1]) {
        const v = [(nx * d) / C.P00, (ny * d) / C.P11, -d]; for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], v[k]); hi[k] = Math.max(hi[k], v[k]); }
    }
    return { lo, hi };
}
/** FROXELS: the frustum's clusters, rebuilt with the camera. */
export function buildViewClusters(lights, camera, { viewCells = DEFAULTS.viewCells, maxPerCell = DEFAULTS.maxPerCell } = {}) {
    if (!camera || !camera.view || !camera.proj) throw new Error("clusteredLights.buildViewClusters: a camera { view, proj, near, far } is needed");
    const [tx, ty, nz] = viewCells, N = tx * ty * nz, counts = new Int32Array(N), lists = new Int32Array(N * maxPerCell).fill(-1);
    const C = { mode: "view", view: Float32Array.from(camera.view), P00: camera.proj[0], P11: camera.proj[5], near: camera.near, far: camera.far, dims: [tx, ty, nz], counts, lists, overflow: 0, maxPerCell, min: [0, 0, 0], size: [1, 1, 1] };
    const L = Math.log(C.far / C.near), boxes = []; for (let s = 0; s < nz; s++) for (let y = 0; y < ty; y++) for (let x = 0; x < tx; x++) boxes.push(froxelBox(C, x, y, s));
    lights.forEach((l, i) => {
        if (isSun(l)) return;
        const c = T4(C.view, [...l.position, 1]), d0 = -c[2] - l.range, d1 = -c[2] + l.range;
        if (d1 <= C.near || d0 >= C.far) return;
        const s0 = Math.max(0, Math.floor((Math.log(Math.max(d0, C.near) / C.near) / L) * nz)), s1 = Math.min(nz - 1, Math.floor((Math.log(Math.min(d1, C.far) / C.near) / L) * nz));
        for (let s = s0; s <= s1; s++) for (let y = 0; y < ty; y++) for (let x = 0; x < tx; x++) {
            const k = (s * ty + y) * tx + x, b = boxes[k], q = [0, 1, 2].map((j) => Math.min(Math.max(c[j], b.lo[j]), b.hi[j]));
            if (Math.hypot(q[0] - c[0], q[1] - c[1], q[2] - c[2]) >= l.range) continue;
            if (counts[k] < maxPerCell) lists[k * maxPerCell + counts[k]++] = i; else C.overflow++;
        }
    });
    return C;
}
/** The froxel of a world point, or -1 outside the frustum's depth. */
export function cellOfView(C, p) {
    const v = T4(C.view, [...p, 1]), d = -v[2];
    if (!(d > C.near) || d >= C.far) return -1;
    const [tx, ty, nz] = C.dims, x = Math.min(tx - 1, Math.max(0, Math.floor(((C.P00 * v[0]) / d * 0.5 + 0.5) * tx))), y = Math.min(ty - 1, Math.max(0, Math.floor(((C.P11 * v[1]) / d * 0.5 + 0.5) * ty)));
    const s = Math.min(nz - 1, Math.max(0, Math.floor((Math.log(d / C.near) / Math.log(C.far / C.near)) * nz)));
    return (s * ty + y) * tx + x;
}

/** One light's radiance at p (window, cone and cookie) and its direction from p. */
export function lightAt(l, p, cookies = null) {
    if (isSun(l)) { const L = norm(l.direction).map((v) => -v); return { L, rad: l.color.map((c) => c * l.intensity) }; }
    const d = sub(l.position, p), dist = len(d), L = dist > 0 ? [d[0] / dist, d[1] / dist, d[2] / dist] : [0, 1, 0];
    let a = window_(dist, l.range) * l.intensity, tint = [1, 1, 1];
    if (l.type === "spot") a *= smoothstep(Math.cos(l.outerAngle), Math.cos(l.innerAngle), dot([-L[0], -L[1], -L[2]], norm(l.direction)));
    if (l.type === "spot" && cookies && l.cookie != null && a > 0) tint = cookieAt(cookies, l, p);
    return { L, rad: l.color.map((c, k) => c * a * tint[k]) };
}
/** For the fog: a (non-sun) light's in-scattering at p for a ray going `dir`, per unit of scattering -- its radiance at p (lightAt: window, cone, cookie) times shadow (1 when
 *  not given) times 4 pi Henyey-Greenstein(g), the angle between the ray and the way to the light. clInScatter in the shaders. */
export function inScatterCPU(l, p, dir, g, { shadow = 1, cookies = null } = {}) {
    const { L, rad } = lightAt(l, p, cookies), c = dot(dir, L), ph = (1 - g * g) / Math.pow(1 + g * g - 2 * g * c, 1.5);
    return rad.map((r) => r * ph * shadow);
}
/** The shading sum on the CPU: the cell's lights plus the sun (or, `brute`, every light), each times shadowOf(i, p) (1 when not given). */
export function shadeCPU(lights, C, p, n, v, albedo, { brute = false, shadowOf = null, cookies = null } = {}) {
    const out = [0, 0, 0], sun = sunIndexOf(lights);
    const idx = brute ? lights.map((_, i) => i) : (() => { const c = cellOf(C, p), list = c < 0 ? [] : Array.from(C.lists.subarray(c * C.maxPerCell, c * C.maxPerCell + C.counts[c])); return sun >= 0 ? [...list, sun] : list; })();
    for (const i of idx) {
        const { L, rad } = lightAt(lights[i], p, cookies), nl = Math.max(0, dot(n, L)), h = norm(add(L, v)), sp = Math.pow(Math.max(0, dot(n, h)), 32) * 0.25, s = shadowOf ? shadowOf(i, p) : 1;
        for (let k = 0; k < 3; k++) out[k] += (albedo[k] * rad[k] * nl + rad[k] * sp * (nl > 0 ? 1 : 0)) * s;
    }
    return out;
}

/** Column-major 4x4. */
const mul4 = (a, b) => { const o = new Float32Array(16); for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) { let s = 0; for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k]; o[c * 4 + r] = s; } return o; };
export function lookAt(eye, target, up) { const z = norm(sub(eye, target)), x = norm(cross(up, z)), y = cross(z, x); return new Float32Array([x[0], y[0], z[0], 0, x[1], y[1], z[1], 0, x[2], y[2], z[2], 0, -dot(x, eye), -dot(y, eye), -dot(z, eye), 1]); }
export function perspective(fovY, aspect, near, far) { const f = 1 / Math.tan(fovY / 2), nf = 1 / (near - far); return new Float32Array([f / aspect, 0, 0, 0, 0, f, 0, 0, 0, 0, (far + near) * nf, -1, 0, 0, 2 * far * near * nf, 0]); }
export function ortho(l, r, b, t, n, f) { return new Float32Array([2 / (r - l), 0, 0, 0, 0, 2 / (t - b), 0, 0, 0, 0, -2 / (f - n), 0, -(r + l) / (r - l), -(t + b) / (t - b), -(f + n) / (f - n), 1]); }
export const CUBE_FACES = Object.freeze([[[1, 0, 0], [0, -1, 0]], [[-1, 0, 0], [0, -1, 0]], [[0, 1, 0], [0, 0, 1]], [[0, -1, 0], [0, 0, -1]], [[0, 0, 1], [0, -1, 0]], [[0, 0, -1], [0, -1, 0]]]);
export const NEAR = 0.05;
/** The shadow matrices of a spot light (down its cone, a field of twice the outer angle, a hair wider) or a point light (six cube faces). */
export function faceMatrices(l) {
    if (l.type === "spot") { const d = norm(l.direction), up = Math.abs(d[1]) > 0.99 ? [1, 0, 0] : [0, 1, 0], view = lookAt(l.position, add(l.position, d), up), fov = Math.min(Math.PI * 0.95, 2 * l.outerAngle * 1.05), proj = perspective(fov, 1, NEAR, l.range); return [{ view, proj, viewProj: mul4(proj, view), fov }]; }
    return CUBE_FACES.map(([f, up]) => { const view = lookAt(l.position, add(l.position, f), up), proj = perspective(Math.PI / 2, 1, NEAR, l.range); return { view, proj, viewProj: mul4(proj, view), fov: Math.PI / 2 }; });
}
/** The face of a point light's cube a direction from it falls in (the largest component; ties to the earlier face). */
export function cubeFace(v) { const a = v.map(Math.abs); if (a[0] >= a[1] && a[0] >= a[2]) return v[0] >= 0 ? 0 : 1; if (a[1] >= a[2]) return v[1] >= 0 ? 2 : 3; return v[2] >= 0 ? 4 : 5; }

/** THE CASCADES' far depths, the practical split. */
export function cascadeSplits(near, distance, n, lambda = DEFAULTS.lambda) {
    return Array.from({ length: n }, (_, k) => { const f = (k + 1) / n; return lambda * near * Math.pow(distance / near, f) + (1 - lambda) * (near + (distance - near) * f); });
}
const invRot = (m) => [[m[0], m[4], m[8]], [m[1], m[5], m[9]], [m[2], m[6], m[10]]];   // a view matrix's rotation rows: the camera's right, up and back in world space
/** The sun's cascades for a camera: [{ viewProj, splitNear, splitFar, worldTexel, center, radius }]. */
export function cascadeMatrices(sun, camera, { cascades = DEFAULTS.cascades, shadowDistance = DEFAULTS.shadowDistance, lambda = DEFAULTS.lambda, tileSize = 512, casterReach = DEFAULTS.casterReach } = {}) {
    const V = camera.view, [right, up, back] = invRot(V), eye = [0, 1, 2].map((k) => -(V[12] * right[k] + V[13] * up[k] + V[14] * back[k]));
    const tx = 1 / camera.proj[0], ty = 1 / camera.proj[5], splits = cascadeSplits(camera.near, shadowDistance, cascades, lambda), dir = norm(sun.direction);
    const lu = Math.abs(dir[1]) > 0.99 ? [1, 0, 0] : [0, 1, 0], R = lookAt([0, 0, 0], dir, lu), [lr, lup] = invRot(R);
    return splits.map((far, k) => {
        const nearD = k === 0 ? camera.near : splits[k - 1], corners = [];
        for (const d of [nearD, far]) for (const sx of [-1, 1]) for (const sy of [-1, 1]) corners.push(add(eye, add(mul(right, sx * tx * d), add(mul(up, sy * ty * d), mul(back, -d)))));
        let c = corners.reduce((s, q) => add(s, q), [0, 0, 0]).map((v) => v / 8), r = Math.max(...corners.map((q) => len(sub(q, c))));
        r = Math.ceil(r * 16) / 16;   // a stable radius: it changes in sixteenths, not every frame
        const texel = (2 * r) / tileSize, cx = Math.round(dot(c, lr) / texel) * texel, cy = Math.round(dot(c, lup) / texel) * texel, cz = dot(c, norm(cross(lr, lup)));
        c = add(add(mul(lr, cx), mul(lup, cy)), mul(norm(cross(lr, lup)), cz));   // the centre snapped to whole texels in the light's frame
        const view = lookAt(sub(c, mul(dir, r + casterReach)), c, lu), proj = ortho(-r, r, -r, r, 0.01, 2 * r + casterReach);
        return { viewProj: mul4(proj, view), splitNear: nearD, splitFar: far, worldTexel: texel, center: c, radius: r };
    });
}

/** The atlas's tiles: the sun's cascades first, then by priority. Each face: { light, face, rect, viewProj, worldBias, splitFar }. */
export function allocateAtlas(lights, { slots = DEFAULTS.slots, camera = null, atlasSize = DEFAULTS.atlasSize, cascades = DEFAULTS.cascades, shadowDistance = DEFAULTS.shadowDistance, lambda = DEFAULTS.lambda, casterReach = DEFAULTS.casterReach } = {}) {
    const faces = [], byLight = new Map(), unshadowed = []; let next = 0;
    const place = (i, mats) => { byLight.set(i, [faces.length, mats.length]); mats.forEach((m, f) => { const s = next++, x = s % slots, y = Math.floor(s / slots); faces.push({ light: i, face: f, rect: [x / slots, y / slots, 1 / slots, 1 / slots], viewProj: m.viewProj, worldBias: m.worldBias || 0, splitFar: m.splitFar || 0, penumbra: m.penumbra || 0, depthNear: m.depthNear || 0, depthFar: m.depthFar || 0, slot: s }); }); };
    const sun = sunIndexOf(lights);
    if (sun >= 0 && lights[sun].shadow) {
        if (!camera) throw new Error("clusteredLights.allocateAtlas: the sun's cascades need the camera");
        if (cascades > slots * slots || cascades > 4) unshadowed.push(sun);
        else place(sun, cascadeMatrices(lights[sun], camera, { cascades, shadowDistance, lambda, tileSize: atlasSize / slots, casterReach }).map((m) => ({ ...m, worldBias: 2 * m.worldTexel, penumbra: (2 * m.radius + casterReach - 0.01) * Math.tan(lights[sun].softness || 0) / m.worldTexel, depthNear: 0, depthFar: 0 })));
    }
    const order = lights.map((l, i) => i).filter((i) => lights[i].shadow && !isSun(lights[i])).sort((a, b) => (lights[b].priority ?? 0) - (lights[a].priority ?? 0) || a - b);
    for (const i of order) {
        const need = lights[i].type === "spot" ? 1 : 6;
        if (next + need > slots * slots) { unshadowed.push(i); continue; }
        const tile = atlasSize / slots; place(i, faceMatrices(lights[i]).map((m) => ({ ...m, penumbra: (lights[i].softness || 0) / (2 * Math.tan(m.fov / 2) / tile), depthNear: NEAR, depthFar: lights[i].range })));
    }
    return { faces, byLight, unshadowed };
}

/** The 16 taps of the soft shadows' blocker search and filter (a Poisson disc in the unit circle). */
export const POISSON16 = Object.freeze([[-0.94201624, -0.39906216], [0.94558609, -0.76890725], [-0.09418410, -0.92938870], [0.34495938, 0.29387760], [-0.91588581, 0.45771432], [-0.81544232, -0.87912464], [-0.38277543, 0.27676845], [0.97484398, 0.75648379], [0.44323325, -0.97511554], [0.53742981, -0.47373420], [-0.26496911, -0.41893023], [0.79197514, 0.19090188], [-0.24188840, 0.99706507], [-0.81409955, 0.91437590], [0.19984126, 0.78641367], [0.14383161, -0.14100790]]);
/** A soft shadow's penumbra, in atlas texels, for a receiver at tile depth zr behind blockers at mean tile depth zb (0..1 both): the shaders' formula before its clamp. */
export function penumbraTexels(face, zr, zb) {
    if (!(face.depthNear > 0)) return face.penumbra * (zr - zb);
    const n = face.depthNear, f = face.depthFar, lin = (z) => (n * f) / (f - z * (f - n)), dr = lin(zr), db = lin(zb);
    return (face.penumbra * (dr - db)) / (db * dr);
}

/** THE COOKIE ATLAS: 2 x 2 tiles of RGB, `size` square, row 0 at v = 0. Tile k = (k % 2, k >> 1). */
export function makeCookieAtlas(size = DEFAULTS.cookieSize) {
    const data = new Uint8Array(size * size * 4), h = size / 2, f = (v) => Math.round(Math.min(1, Math.max(0, v)) * 255);
    const pat = [
        (u, v) => { const g = (x) => { const t = (x * 4) % 1; return t > 0.12 && t < 0.88 ? 1 : 0.08; }, w = g(u) * g(v); return [w, w * 0.95, w * 0.85]; },                    // window panes
        (u, v) => { const r = Math.hypot(u - 0.5, v - 0.5), w = 0.55 + 0.45 * Math.cos(r * 40); return [w, w, w]; },                                                   // rings
        (u, v) => { const a = Math.atan2(v - 0.5, u - 0.5), s = Math.floor(((a + Math.PI) / (2 * Math.PI)) * 6); return [[1, 0.25, 0.2], [1, 0.8, 0.2], [0.3, 1, 0.3], [0.2, 0.8, 1], [0.35, 0.3, 1], [1, 0.3, 0.9]][s % 6]; },   // stained glass
        (u, v) => { const w = 0.5 + 0.5 * Math.sin(u * 23 + 3 * Math.sin(v * 9)) * Math.sin(v * 17 + 2 * Math.cos(u * 11)); return [w * 0.9, w, w * 0.7]; },                  // leaves
    ];
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) { const k = (x >= h ? 1 : 0) + (y >= h ? 2 : 0), u = ((x % h) + 0.5) / h, v = ((y % h) + 0.5) / h, c = pat[k](u, v), o = (y * size + x) * 4; data[o] = f(c[0]); data[o + 1] = f(c[1]); data[o + 2] = f(c[2]); data[o + 3] = 255; }
    return { size, data, tiles: 2 };
}
export const cookieRect = (k) => [(k % 2) / 2, Math.floor(k / 2) / 2, 0.5, 0.5];
/** The GPU's bilinear lookup of the cookie atlas at (u, v) in 0..1, clamped half a texel inside tile `rect`: [r, g, b] in 0..1. */
export function cookieSample(A, rect, u, v) {
    const hx = 0.5 / A.size, uu = Math.min(Math.max(rect[0] + u * rect[2], rect[0] + hx), rect[0] + rect[2] - hx), vv = Math.min(Math.max(rect[1] + v * rect[3], rect[1] + hx), rect[1] + rect[3] - hx);
    const x = uu * A.size - 0.5, y = vv * A.size - 0.5, x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0, at = (i, j, c) => A.data[((Math.min(A.size - 1, Math.max(0, j)) * A.size) + Math.min(A.size - 1, Math.max(0, i))) * 4 + c] / 255;
    return [0, 1, 2].map((c) => (at(x0, y0, c) * (1 - fx) + at(x0 + 1, y0, c) * fx) * (1 - fy) + (at(x0, y0 + 1, c) * (1 - fx) + at(x0 + 1, y0 + 1, c) * fx) * fy);
}
/** A spot light's cookie at p: its projection down the cone, or black outside it. */
export function cookieAt(A, l, p) {
    const q = T4(faceMatrices(l)[0].viewProj, [...p, 1]);
    if (q[3] <= 0) return [0, 0, 0];
    const u = (q[0] / q[3]) * 0.5 + 0.5, v = (q[1] / q[3]) * 0.5 + 0.5;
    if (u < 0 || u > 1 || v < 0 || v > 1) return [0, 0, 0];
    return cookieSample(A, cookieRect(l.cookie), u, v);
}

/** The light rows both backends read: 9 vec4s a light. */
function packLights(lights, A, maxLights) {
    const ld = new Float32Array(36 * maxLights);
    lights.forEach((l, i) => {
        const o = i * 36, sun = isSun(l), spot = l.type === "spot", d = sun || spot ? norm(l.direction) : [0, 0, 0], s = A.byLight.get(i) || [0, 0], cookie = spot && l.cookie != null;
        ld.set([...(sun ? [0, 0, 0] : l.position), sun ? 1e9 : l.range, ...l.color.map((c) => c * l.intensity), sun ? 2 : spot ? 1 : 0, ...d, spot ? Math.cos(l.outerAngle) : -2, spot ? Math.cos(l.innerAngle) : -1, s[0], s[1], cookie ? 1 : 0], o);
        if (cookie) { ld.set(faceMatrices(l)[0].viewProj, o + 16); ld.set(cookieRect(l.cookie), o + 32); }
    });
    return ld;
}
/** The face rows: 6 vec4s a face (the view-projection, the tile's rect, (world bias, penumbra scale, near, far) -- near 0 for the sun's orthographic cascades). */
function packFaces(A, maxFaces, transform = (m) => m) {
    const fd = new Float32Array(24 * maxFaces);
    A.faces.forEach((f, k) => { fd.set(transform(f.viewProj), k * 24); fd.set(f.rect, k * 24 + 16); fd.set([f.worldBias, f.penumbra || 0, f.depthNear || 0, f.depthFar || 0], k * 24 + 20); });
    return fd;
}
const packCells = (C, N, maxPerCell, Typed) => { const cd = new Typed(N * (maxPerCell + 1)); for (let c = 0; c < N; c++) { cd[c * (maxPerCell + 1)] = C.counts[c]; for (let k = 0; k < C.counts[c]; k++) cd[c * (maxPerCell + 1) + 1 + k] = C.lists[c * maxPerCell + k]; } return cd; };
const build = (O, lights, camera) => {
    const C = O.space === "view" ? buildViewClusters(lights, camera, O) : buildClusters(lights, O), A = allocateAtlas(lights, { ...O, camera });
    const sun = sunIndexOf(lights), sunFaces = sun >= 0 ? A.byLight.get(sun) : null, splits = [0, 0, 0, 0]; if (sunFaces) for (let k = 0; k < sunFaces[1]; k++) splits[k] = A.faces[sunFaces[0] + k].splitFar;
    return { C, A, sun, cascades: sunFaces ? sunFaces[1] : 0, splits };
};

export const CLUSTERED_GLSL = `
uniform highp sampler2D uClusterCells;   // R32F: row c = cell c; texel 0 its count, texels 1.. its light indices
uniform highp sampler2D uClusterLights;  // RGBA32F: row i = light i, 9 texels (position and range; colour and type; direction and cos outer; cos inner, first face, faces, cookie; the cookie's matrix; its rect)
uniform highp sampler2D uShadowFaces;    // RGBA32F: row f = atlas face f, 6 texels (the view-projection's columns; the tile's rect; world bias, penumbra scale, near, far)
uniform highp sampler2DShadow uShadowAtlas;
uniform highp sampler2D uCookies;
uniform vec3 uClusterMin, uClusterSize; uniform ivec3 uClusterDims; uniform int uClusterMaxPerCell, uLightCount, uClusterMode, uSunIndex, uSunCascades; uniform float uShadowBias, uAtlasTexel;
uniform mat4 uClusterView; uniform vec4 uClusterProj;   // P00, P11, near, far
uniform vec4 uCascadeSplits;
#ifdef CLUSTERED_SOFT
uniform highp sampler2D uShadowDepth;   // the atlas again, read raw (a sampler object without comparison) for the blocker search
uniform float uMaxPenumbra;
const vec2 CL_POISSON[16] = vec2[16](vec2(-0.94201624, -0.39906216), vec2(0.94558609, -0.76890725), vec2(-0.09418410, -0.92938870), vec2(0.34495938, 0.29387760), vec2(-0.91588581, 0.45771432), vec2(-0.81544232, -0.87912464), vec2(-0.38277543, 0.27676845), vec2(0.97484398, 0.75648379), vec2(0.44323325, -0.97511554), vec2(0.53742981, -0.47373420), vec2(-0.26496911, -0.41893023), vec2(0.79197514, 0.19090188), vec2(-0.24188840, 0.99706507), vec2(-0.81409955, 0.91437590), vec2(0.19984126, 0.78641367), vec2(0.14383161, -0.14100790));
float clSoft(vec4 ex, vec4 r, vec2 uv, float z) {
    vec2 lo = r.xy + vec2(uAtlasTexel * 0.5), hi = r.xy + r.zw - vec2(uAtlasTexel * 0.5), dim = vec2(textureSize(uShadowDepth, 0));
    float nb = 0.0, sb = 0.0;
    for (int k = 0; k < 16; k++) { vec2 q = clamp(uv + CL_POISSON[k] * uMaxPenumbra * uAtlasTexel, lo, hi); float d = texelFetch(uShadowDepth, ivec2(q * dim), 0).r; if (d < z) { nb += 1.0; sb += d; } }
    if (nb == 0.0) return 1.0;
    float zb = sb / nb, pen;
    if (ex.z == 0.0) pen = ex.y * (z - zb);
    else { float dr = ex.z * ex.w / (ex.w - z * (ex.w - ex.z)), db = ex.z * ex.w / (ex.w - zb * (ex.w - ex.z)); pen = ex.y * (dr - db) / (db * dr); }
    pen = clamp(pen, 1.0, uMaxPenumbra);
    float sum = 0.0;
    for (int k = 0; k < 16; k++) sum += texture(uShadowAtlas, vec3(clamp(uv + CL_POISSON[k] * pen * uAtlasTexel, lo, hi), z));
    return sum / 16.0;
}
#endif
float clWindow(float d, float r) { float x = clamp(1.0 - pow(d / r, 4.0), 0.0, 1.0); return x * x / (d * d + 1.0); }
int clCubeFace(vec3 v) { vec3 a = abs(v); if (a.x >= a.y && a.x >= a.z) return v.x >= 0.0 ? 0 : 1; if (a.y >= a.z) return v.y >= 0.0 ? 2 : 3; return v.z >= 0.0 ? 4 : 5; }
float clShadow(vec3 p0, vec3 n, vec3 L, vec3 lp, bool sun, int first, int count) {
#ifdef CLUSTERED_NO_SHADOWS
    return 1.0;
#else
    if (count <= 0) return 1.0;
    int f = first;
    if (sun) { float d = -(uClusterView * vec4(p0, 1.0)).z; int k = 0; for (int j = 0; j < 4; j++) { if (j >= count) break; if (d >= uCascadeSplits[j]) k = j + 1; } if (k >= count) return 1.0; f = first + k; }
    else if (count == 6) f = first + clCubeFace(p0 - lp);
    vec4 ex = texelFetch(uShadowFaces, ivec2(5, f), 0);
    vec3 p = p0 + (n + 0.5 * L) * (sun ? ex.x : uShadowBias * (1.0 + length(lp - p0)));
    mat4 m = mat4(texelFetch(uShadowFaces, ivec2(0, f), 0), texelFetch(uShadowFaces, ivec2(1, f), 0), texelFetch(uShadowFaces, ivec2(2, f), 0), texelFetch(uShadowFaces, ivec2(3, f), 0));
    vec4 r = texelFetch(uShadowFaces, ivec2(4, f), 0), q = m * vec4(p, 1.0);
    if (q.w <= 0.0) return 1.0;
    vec3 s = q.xyz / q.w * 0.5 + 0.5;
    if (s.z >= 1.0) return 1.0;
    vec2 uv = r.xy + clamp(s.xy, vec2(0.0), vec2(1.0)) * r.zw; uv = clamp(uv, r.xy + vec2(uAtlasTexel * 0.5), r.xy + r.zw - vec2(uAtlasTexel * 0.5));
#ifdef CLUSTERED_SOFT
    return clSoft(ex, r, uv, s.z);
#else
    return texture(uShadowAtlas, vec3(uv, s.z));
#endif
#endif
}
vec3 clCookie(int i, vec3 p) {
    mat4 m = mat4(texelFetch(uClusterLights, ivec2(4, i), 0), texelFetch(uClusterLights, ivec2(5, i), 0), texelFetch(uClusterLights, ivec2(6, i), 0), texelFetch(uClusterLights, ivec2(7, i), 0));
    vec4 r = texelFetch(uClusterLights, ivec2(8, i), 0), q = m * vec4(p, 1.0);
    if (q.w <= 0.0) return vec3(0.0);
    vec2 t = q.xy / q.w * 0.5 + 0.5;
    if (any(lessThan(t, vec2(0.0))) || any(greaterThan(t, vec2(1.0)))) return vec3(0.0);
    float h = 0.5 / float(textureSize(uCookies, 0).x); vec2 uv = clamp(r.xy + t * r.zw, r.xy + vec2(h), r.xy + r.zw - vec2(h));
    return texture(uCookies, uv).rgb;
}
vec3 clOne(int i, vec3 p, vec3 n, vec3 v, vec3 albedo) {
    vec4 a = texelFetch(uClusterLights, ivec2(0, i), 0), b = texelFetch(uClusterLights, ivec2(1, i), 0), c = texelFetch(uClusterLights, ivec2(2, i), 0), d = texelFetch(uClusterLights, ivec2(3, i), 0);
    bool sun = b.w > 1.5; vec3 L; float att;
    if (sun) { L = -c.xyz; att = 1.0; }
    else {
        vec3 dl = a.xyz - p; float dist = length(dl); L = dist > 0.0 ? dl / dist : vec3(0.0, 1.0, 0.0);
        att = clWindow(dist, a.w);
        if (b.w > 0.5) { float t = clamp((dot(-L, c.xyz) - c.w) / max(d.x - c.w, 1e-6), 0.0, 1.0); att *= t * t * (3.0 - 2.0 * t); }
    }
    if (att <= 0.0) return vec3(0.0);
    vec3 rad = b.rgb * att; if (d.w > 0.5) rad *= clCookie(i, p);
    float nl = max(dot(n, L), 0.0); vec3 h = normalize(L + v); float sp = nl > 0.0 ? pow(max(dot(n, h), 0.0), 32.0) * 0.25 : 0.0;
    return (albedo * rad * nl + rad * sp) * clShadow(p, n, L, a.xyz, sun, int(d.y), int(d.z));
}
// FOR THE FOG (render/volumetricFog.mjs's shafts): light i's in-scattering at p for a ray going dir, per unit of scattering -- its radiance (window, cone, cookie) times its
// shadow times 4 pi Henyey-Greenstein(g) -- and the sun's shadow at p. No surface: the shadow's bias is along the light alone.
vec3 clInScatter(int i, vec3 p, vec3 dir, float g) {
    vec4 a = texelFetch(uClusterLights, ivec2(0, i), 0), b = texelFetch(uClusterLights, ivec2(1, i), 0), c = texelFetch(uClusterLights, ivec2(2, i), 0), d = texelFetch(uClusterLights, ivec2(3, i), 0);
    vec3 dl = a.xyz - p; float dist = length(dl); vec3 L = dist > 0.0 ? dl / dist : vec3(0.0, 1.0, 0.0);
    float att = clWindow(dist, a.w);
    if (b.w > 0.5) { float t = clamp((dot(-L, c.xyz) - c.w) / max(d.x - c.w, 1e-6), 0.0, 1.0); att *= t * t * (3.0 - 2.0 * t); }
    if (att <= 0.0) return vec3(0.0);
    vec3 rad = b.rgb * att; if (d.w > 0.5) rad *= clCookie(i, p);
    float cs = dot(dir, L), ph = (1.0 - g * g) / pow(1.0 + g * g - 2.0 * g * cs, 1.5);
    return rad * ph * clShadow(p, vec3(0.0), L, a.xyz, false, int(d.y), int(d.z));
}
float clSunShadowAt(vec3 p) {
    if (uSunIndex < 0) return 1.0;
    vec4 c = texelFetch(uClusterLights, ivec2(2, uSunIndex), 0), d = texelFetch(uClusterLights, ivec2(3, uSunIndex), 0);
    return clShadow(p, vec3(0.0), -c.xyz, vec3(0.0), true, int(d.y), int(d.z));
}
int clCell(vec3 p) {
    if (uClusterMode == 1) {
        vec4 vv = uClusterView * vec4(p, 1.0); float d = -vv.z;
        if (d <= uClusterProj.z || d >= uClusterProj.w) return -1;
        ivec2 t = clamp(ivec2(floor((vec2(uClusterProj.x * vv.x, uClusterProj.y * vv.y) / d * 0.5 + 0.5) * vec2(uClusterDims.xy))), ivec2(0), uClusterDims.xy - 1);
        int s = clamp(int(floor(log(d / uClusterProj.z) / log(uClusterProj.w / uClusterProj.z) * float(uClusterDims.z))), 0, uClusterDims.z - 1);
        return (s * uClusterDims.y + t.y) * uClusterDims.x + t.x;
    }
    ivec3 c = ivec3(floor((p - uClusterMin) / uClusterSize));
    if (any(lessThan(c, ivec3(0))) || any(greaterThanEqual(c, uClusterDims))) return -1;
    return (c.z * uClusterDims.y + c.y) * uClusterDims.x + c.x;
}
vec3 clusteredLight(vec3 p, vec3 n, vec3 v, vec3 albedo) {
    vec3 sum = vec3(0.0);
#ifdef CLUSTERED_BRUTE
    for (int i = 0; i < 1024; i++) { if (i >= uLightCount) break; sum += clOne(i, p, n, v, albedo); }
#else
    if (uSunIndex >= 0) sum += clOne(uSunIndex, p, n, v, albedo);
    int cell = clCell(p);
    if (cell < 0) return sum;
    int count = int(texelFetch(uClusterCells, ivec2(0, cell), 0).r);
    for (int k = 0; k < 64; k++) { if (k >= count || k >= uClusterMaxPerCell) break; sum += clOne(int(texelFetch(uClusterCells, ivec2(k + 1, cell), 0).r), p, n, v, albedo); }
#endif
    return sum;
}`;

export function createClusteredLighting(gl, opts = {}) {
    const O = { ...DEFAULTS, ...opts }, dims = O.space === "view" ? O.viewCells : O.cells, N = dims[0] * dims[1] * dims[2];
    if (O.maxPerCell > 64) throw new Error("clusteredLights: maxPerCell is at most 64");
    const tex = (w, h, ifmt, fmt, type, filter = gl.NEAREST, data = null) => { const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t); gl.texImage2D(gl.TEXTURE_2D, 0, ifmt, w, h, 0, fmt, type, data); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE); return t; };
    const cellsTex = tex(O.maxPerCell + 1, N, gl.R32F, gl.RED, gl.FLOAT), lightsTex = tex(9, O.maxLights, gl.RGBA32F, gl.RGBA, gl.FLOAT), maxFaces = O.slots * O.slots, facesTex = tex(6, maxFaces, gl.RGBA32F, gl.RGBA, gl.FLOAT);
    let cookieTex = tex(1, 1, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, gl.LINEAR, new Uint8Array([255, 255, 255, 255])), cookieSource = null;
    const atlas = tex(O.atlasSize, O.atlasSize, gl.DEPTH_COMPONENT24, gl.DEPTH_COMPONENT, gl.UNSIGNED_INT, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_MODE, gl.COMPARE_REF_TO_TEXTURE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_FUNC, gl.LEQUAL);
    const rawSampler = gl.createSampler(); gl.samplerParameteri(rawSampler, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.samplerParameteri(rawSampler, gl.TEXTURE_MAG_FILTER, gl.NEAREST); gl.samplerParameteri(rawSampler, gl.TEXTURE_COMPARE_MODE, gl.NONE);
    const fbo = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, fbo); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, atlas, 0); gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    const self = { options: O, clusters: null, atlas: null, lights: [], atlasTexture: atlas, camera: null };
    self.update = (lights, camera = null, cookies = null) => {
        if (lights.length > O.maxLights) throw new Error(`clusteredLights: ${lights.length} lights, at most ${O.maxLights}`);
        const B = build(O, lights, camera); Object.assign(self, { clusters: B.C, atlas: B.A, lights, camera, sun: B.sun, cascades: B.cascades, splits: B.splits });
        if (cookies && cookies !== cookieSource) { gl.deleteTexture(cookieTex); cookieTex = tex(cookies.size, cookies.size, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, gl.LINEAR, cookies.data); cookieSource = cookies; }
        gl.bindTexture(gl.TEXTURE_2D, cellsTex); gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, O.maxPerCell + 1, N, gl.RED, gl.FLOAT, packCells(B.C, N, O.maxPerCell, Float32Array));
        gl.bindTexture(gl.TEXTURE_2D, lightsTex); gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, 9, O.maxLights, gl.RGBA, gl.FLOAT, packLights(lights, B.A, O.maxLights));
        gl.bindTexture(gl.TEXTURE_2D, facesTex); gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, 6, maxFaces, gl.RGBA, gl.FLOAT, packFaces(B.A, maxFaces));
        return { cells: N, overflow: B.C.overflow, faces: B.A.faces.length, unshadowed: B.A.unshadowed.length, cascades: B.cascades, space: O.space };
    };
    self.renderShadows = (drawDepth) => {
        if (!self.atlas) return;
        gl.bindFramebuffer(gl.FRAMEBUFFER, fbo); gl.viewport(0, 0, O.atlasSize, O.atlasSize); gl.depthMask(true); gl.clearDepth(1); gl.clear(gl.DEPTH_BUFFER_BIT);
        gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL); gl.enable(gl.SCISSOR_TEST);
        for (const f of self.atlas.faces) { const [x, y, w, h] = f.rect.map((v) => Math.round(v * O.atlasSize)); gl.viewport(x, y, w, h); gl.scissor(x, y, w, h); drawDepth(f.viewProj, f); }
        gl.disable(gl.SCISSOR_TEST); gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    };
    self.bind = (program, firstUnit = 4) => {
        const u = (n) => gl.getUniformLocation(program, n), C = self.clusters || buildClusters([], O), view = C.mode === "view";
        [[cellsTex, "uClusterCells"], [lightsTex, "uClusterLights"], [facesTex, "uShadowFaces"], [atlas, "uShadowAtlas"], [cookieTex, "uCookies"]].forEach(([t, n], k) => { gl.activeTexture(gl.TEXTURE0 + firstUnit + k); gl.bindTexture(gl.TEXTURE_2D, t); gl.uniform1i(u(n), firstUnit + k); });
        if (u("uShadowDepth")) { gl.activeTexture(gl.TEXTURE0 + firstUnit + 5); gl.bindTexture(gl.TEXTURE_2D, atlas); gl.bindSampler(firstUnit + 5, rawSampler); gl.uniform1i(u("uShadowDepth"), firstUnit + 5); gl.uniform1f(u("uMaxPenumbra"), O.maxPenumbra); }   // CLUSTERED_SOFT: unit firstUnit + 5 keeps this sampler object
        gl.activeTexture(gl.TEXTURE0);
        gl.uniform3fv(u("uClusterMin"), Float32Array.from(C.min)); gl.uniform3fv(u("uClusterSize"), Float32Array.from(C.size)); gl.uniform3iv(u("uClusterDims"), Int32Array.from(C.dims));
        gl.uniform1i(u("uClusterMaxPerCell"), O.maxPerCell); gl.uniform1i(u("uLightCount"), self.lights.length); gl.uniform1f(u("uShadowBias"), O.bias); gl.uniform1f(u("uAtlasTexel"), 1 / O.atlasSize);
        gl.uniform1i(u("uClusterMode"), view ? 1 : 0); gl.uniform1i(u("uSunIndex"), self.sun ?? -1); gl.uniform1i(u("uSunCascades"), self.cascades || 0); gl.uniform4fv(u("uCascadeSplits"), Float32Array.from(self.splits || [0, 0, 0, 0]));
        gl.uniformMatrix4fv(u("uClusterView"), false, self.camera ? Float32Array.from(self.camera.view) : new Float32Array(16)); gl.uniform4f(u("uClusterProj"), view ? C.P00 : 1, view ? C.P11 : 1, view ? C.near : 0.1, view ? C.far : 100);
    };
    self.destroy = () => { for (const t of [cellsTex, lightsTex, facesTex, atlas, cookieTex]) gl.deleteTexture(t); gl.deleteFramebuffer(fbo); gl.deleteSampler(rawSampler); };
    return self;
}

// ================================================================================================================================================================
// WEBGPU. The same clusters, lights, atlas, sun and cookies, in WGSL, from STORAGE buffers. The shadow matrices are given WebGPU's 0..1 depth (ZO * viewProj); a tile's rect is in
// the atlas's own pixel order, top row first, as setViewport takes it, so a point's place in its tile is (x * 0.5 + 0.5, 0.5 - y * 0.5). The cookie atlas is sampled at
// (x * 0.5 + 0.5, y * 0.5 + 0.5) on both backends (its row 0 is v = 0 on both).
export const ZO = Object.freeze([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0.5, 0, 0, 0, 0.5, 1]);
export function clusteredWGSL({ group = 1, brute = false, shadows = true, soft = false } = {}) {
    return `
struct CLLight { posRange: vec4f, colorType: vec4f, dirCosOuter: vec4f, cosInnerFaces: vec4f, cookie: mat4x4f, cookieRect: vec4f };
struct CLFace { viewProj: mat4x4f, rect: vec4f, extra: vec4f };
struct CLParams { minv: vec4f, size: vec4f, dims: vec4u, misc: vec4f, view: mat4x4f, proj: vec4f, sun: vec4f, splits: vec4f };   // misc = (bias, atlas texel, light count, max per cell); sun = (index or -1, cascades, view mode, max penumbra in texels)
@group(${group}) @binding(0) var<uniform> clP: CLParams;
@group(${group}) @binding(1) var<storage, read> clCells: array<u32>;
@group(${group}) @binding(2) var<storage, read> clLights: array<CLLight>;
@group(${group}) @binding(3) var<storage, read> clFaces: array<CLFace>;
@group(${group}) @binding(4) var clAtlas: texture_depth_2d;
@group(${group}) @binding(5) var clCmp: sampler_comparison;
@group(${group}) @binding(6) var clCookies: texture_2d<f32>;
@group(${group}) @binding(7) var clCookieSampler: sampler;
${soft ? `var<private> CL_POISSON: array<vec2f, 16> = array<vec2f, 16>(vec2f(-0.94201624, -0.39906216), vec2f(0.94558609, -0.76890725), vec2f(-0.09418410, -0.92938870), vec2f(0.34495938, 0.29387760), vec2f(-0.91588581, 0.45771432), vec2f(-0.81544232, -0.87912464), vec2f(-0.38277543, 0.27676845), vec2f(0.97484398, 0.75648379), vec2f(0.44323325, -0.97511554), vec2f(0.53742981, -0.47373420), vec2f(-0.26496911, -0.41893023), vec2f(0.79197514, 0.19090188), vec2f(-0.24188840, 0.99706507), vec2f(-0.81409955, 0.91437590), vec2f(0.19984126, 0.78641367), vec2f(0.14383161, -0.14100790));
fn clSoft(face: CLFace, uv: vec2f, z: f32) -> f32 {
    let tx = clP.misc.y; let lo = face.rect.xy + vec2f(tx * 0.5); let hi = face.rect.xy + face.rect.zw - vec2f(tx * 0.5); let maxP = clP.sun.w; let dim = vec2f(textureDimensions(clAtlas));
    var nb = 0.0; var sb = 0.0;
    for (var k = 0; k < 16; k++) { let q = clamp(uv + CL_POISSON[k] * maxP * tx, lo, hi); let d = textureLoad(clAtlas, vec2i(q * dim), 0); if (d < z) { nb += 1.0; sb += d; } }
    if (nb == 0.0) { return 1.0; }
    let zb = sb / nb; let ex = face.extra; var pen = 0.0;
    if (ex.z == 0.0) { pen = ex.y * (z - zb); }
    else { let dr = ex.z * ex.w / (ex.w - z * (ex.w - ex.z)); let db = ex.z * ex.w / (ex.w - zb * (ex.w - ex.z)); pen = ex.y * (dr - db) / (db * dr); }
    pen = clamp(pen, 1.0, maxP);
    var sum = 0.0;
    for (var k = 0; k < 16; k++) { sum += textureSampleCompareLevel(clAtlas, clCmp, clamp(uv + CL_POISSON[k] * pen * tx, lo, hi), z); }
    return sum / 16.0;
}` : ""}
fn clWindow(d: f32, r: f32) -> f32 { let x = clamp(1.0 - pow(d / r, 4.0), 0.0, 1.0); return x * x / (d * d + 1.0); }
fn clCubeFace(v: vec3f) -> u32 { let a = abs(v); if (a.x >= a.y && a.x >= a.z) { return select(1u, 0u, v.x >= 0.0); } if (a.y >= a.z) { return select(3u, 2u, v.y >= 0.0); } return select(5u, 4u, v.z >= 0.0); }
fn clShadow(p0: vec3f, n: vec3f, L: vec3f, lp: vec3f, sun: bool, first: u32, count: u32) -> f32 {
    ${shadows ? "" : "return 1.0;"}
    if (count == 0u) { return 1.0; }
    var f = first;
    if (sun) { let d = -(clP.view * vec4f(p0, 1.0)).z; var k = 0u; for (var j = 0u; j < min(count, 4u); j++) { if (d >= clP.splits[j]) { k = j + 1u; } } if (k >= count) { return 1.0; } f = first + k; }
    else if (count == 6u) { f = first + clCubeFace(p0 - lp); }
    let face = clFaces[f];
    let p = p0 + (n + 0.5 * L) * select(clP.misc.x * (1.0 + length(lp - p0)), face.extra.x, sun);
    let q = face.viewProj * vec4f(p, 1.0);
    if (q.w <= 0.0) { return 1.0; }
    let s = q.xyz / q.w;
    if (s.z >= 1.0) { return 1.0; }
    let t = clamp(vec2f(s.x * 0.5 + 0.5, 0.5 - s.y * 0.5), vec2f(0.0), vec2f(1.0));
    let h = vec2f(clP.misc.y * 0.5); let uv = clamp(face.rect.xy + t * face.rect.zw, face.rect.xy + h, face.rect.xy + face.rect.zw - h);
    ${soft ? "return clSoft(face, uv, s.z);" : "return textureSampleCompareLevel(clAtlas, clCmp, uv, s.z);"}
}
fn clCookie(l: CLLight, p: vec3f) -> vec3f {
    let q = l.cookie * vec4f(p, 1.0);
    if (q.w <= 0.0) { return vec3f(0.0); }
    let t = q.xy / q.w * 0.5 + 0.5;
    if (any(t < vec2f(0.0)) || any(t > vec2f(1.0))) { return vec3f(0.0); }
    let h = 0.5 / f32(textureDimensions(clCookies).x); let r = l.cookieRect; let uv = clamp(r.xy + t * r.zw, r.xy + vec2f(h), r.xy + r.zw - vec2f(h));
    return textureSampleLevel(clCookies, clCookieSampler, uv, 0.0).rgb;
}
fn clOne(i: u32, p: vec3f, n: vec3f, v: vec3f, albedo: vec3f) -> vec3f {
    let l = clLights[i]; let sun = l.colorType.w > 1.5; var L = vec3f(0.0, 1.0, 0.0); var att = 1.0;
    if (sun) { L = -l.dirCosOuter.xyz; }
    else {
        let dl = l.posRange.xyz - p; let dist = length(dl); if (dist > 0.0) { L = dl / dist; }
        att = clWindow(dist, l.posRange.w);
        if (l.colorType.w > 0.5) { let t = clamp((dot(-L, l.dirCosOuter.xyz) - l.dirCosOuter.w) / max(l.cosInnerFaces.x - l.dirCosOuter.w, 1e-6), 0.0, 1.0); att = att * t * t * (3.0 - 2.0 * t); }
    }
    if (att <= 0.0) { return vec3f(0.0); }
    var rad = l.colorType.rgb * att; if (l.cosInnerFaces.w > 0.5) { rad = rad * clCookie(l, p); }
    let nl = max(dot(n, L), 0.0); let hv = normalize(L + v); var sp = 0.0; if (nl > 0.0) { sp = pow(max(dot(n, hv), 0.0), 32.0) * 0.25; }
    return (albedo * rad * nl + rad * sp) * clShadow(p, n, L, l.posRange.xyz, sun, u32(l.cosInnerFaces.y), u32(l.cosInnerFaces.z));
}
fn clInScatter(i: u32, p: vec3f, dir: vec3f, g: f32) -> vec3f {   // for the fog: as CLUSTERED_GLSL's
    let l = clLights[i]; let dl = l.posRange.xyz - p; let dist = length(dl); var L = vec3f(0.0, 1.0, 0.0); if (dist > 0.0) { L = dl / dist; }
    var att = clWindow(dist, l.posRange.w);
    if (l.colorType.w > 0.5) { let t = clamp((dot(-L, l.dirCosOuter.xyz) - l.dirCosOuter.w) / max(l.cosInnerFaces.x - l.dirCosOuter.w, 1e-6), 0.0, 1.0); att = att * t * t * (3.0 - 2.0 * t); }
    if (att <= 0.0) { return vec3f(0.0); }
    var rad = l.colorType.rgb * att; if (l.cosInnerFaces.w > 0.5) { rad = rad * clCookie(l, p); }
    let cs = dot(dir, L); let ph = (1.0 - g * g) / pow(1.0 + g * g - 2.0 * g * cs, 1.5);
    return rad * ph * clShadow(p, vec3f(0.0), L, l.posRange.xyz, false, u32(l.cosInnerFaces.y), u32(l.cosInnerFaces.z));
}
fn clSunShadowAt(p: vec3f) -> f32 {
    if (clP.sun.x < 0.0) { return 1.0; }
    let l = clLights[u32(clP.sun.x)];
    return clShadow(p, vec3f(0.0), -l.dirCosOuter.xyz, vec3f(0.0), true, u32(l.cosInnerFaces.y), u32(l.cosInnerFaces.z));
}
fn clCell(p: vec3f) -> i32 {
    if (clP.sun.z > 0.5) {
        let vv = clP.view * vec4f(p, 1.0); let d = -vv.z;
        if (d <= clP.proj.z || d >= clP.proj.w) { return -1; }
        let t = clamp(vec2i(floor((vec2f(clP.proj.x * vv.x, clP.proj.y * vv.y) / d * 0.5 + 0.5) * vec2f(clP.dims.xy))), vec2i(0), vec2i(clP.dims.xy) - 1);
        let s = clamp(i32(floor(log(d / clP.proj.z) / log(clP.proj.w / clP.proj.z) * f32(clP.dims.z))), 0, i32(clP.dims.z) - 1);
        return (s * i32(clP.dims.y) + t.y) * i32(clP.dims.x) + t.x;
    }
    let cf = floor((p - clP.minv.xyz) / clP.size.xyz);
    if (any(cf < vec3f(0.0)) || any(cf >= vec3f(clP.dims.xyz))) { return -1; }
    let c = vec3i(cf); return (c.z * i32(clP.dims.y) + c.y) * i32(clP.dims.x) + c.x;
}
fn clusteredLight(p: vec3f, n: vec3f, v: vec3f, albedo: vec3f) -> vec3f {
    var sum = vec3f(0.0);
${brute ? `    _ = arrayLength(&clCells);   // the cells unread here, but bound: an auto layout keeps the binding
    for (var i = 0u; i < u32(clP.misc.z); i++) { sum += clOne(i, p, n, v, albedo); }
    return sum;` : `    if (clP.sun.x >= 0.0) { sum += clOne(u32(clP.sun.x), p, n, v, albedo); }
    let cell = clCell(p);
    if (cell < 0) { return sum; }
    let stride = u32(clP.misc.w) + 1u; let base = u32(cell) * stride; let count = min(clCells[base], u32(clP.misc.w));
    for (var k = 0u; k < count; k++) { sum += clOne(clCells[base + 1u + k], p, n, v, albedo); }
    return sum;`}
}`;
}

export function createClusteredLightingGPU(device, opts = {}) {
    const O = { ...DEFAULTS, ...opts }, dims = O.space === "view" ? O.viewCells : O.cells, N = dims[0] * dims[1] * dims[2], BU = globalThis.GPUBufferUsage, TU = globalThis.GPUTextureUsage, maxFaces = O.slots * O.slots;
    const buf = (size, usage) => device.createBuffer({ size: Math.max(16, size), usage: usage | BU.COPY_DST });
    const params = buf(176, BU.UNIFORM), cells = buf(4 * N * (O.maxPerCell + 1), BU.STORAGE), lightsB = buf(144 * O.maxLights, BU.STORAGE), faces = buf(96 * maxFaces, BU.STORAGE);
    const atlas = device.createTexture({ size: [O.atlasSize, O.atlasSize], format: "depth32float", usage: TU.RENDER_ATTACHMENT | TU.TEXTURE_BINDING });
    const cmp = device.createSampler({ compare: "less-equal", magFilter: "linear", minFilter: "linear" }), lin = device.createSampler({ magFilter: "linear", minFilter: "linear" }), faceBuffers = Array.from({ length: maxFaces }, () => buf(64, BU.UNIFORM));
    let cookieTex = device.createTexture({ size: [1, 1], format: "rgba8unorm", usage: TU.TEXTURE_BINDING | TU.COPY_DST }), cookieSource = null; device.queue.writeTexture({ texture: cookieTex }, new Uint8Array([255, 255, 255, 255]), { bytesPerRow: 4 }, [1, 1]);
    const self = { options: O, clusters: null, atlas: null, lights: [], atlasTexture: atlas, faceBuffers, camera: null, cookieVersion: 0 };
    const zo = (m) => mul4(ZO, m);
    self.update = (lights, camera = null, cookies = null) => {
        if (lights.length > O.maxLights) throw new Error(`clusteredLights: ${lights.length} lights, at most ${O.maxLights}`);
        const B = build(O, lights, camera), C = B.C, view = C.mode === "view"; Object.assign(self, { clusters: C, atlas: B.A, lights, camera, sun: B.sun, cascades: B.cascades, splits: B.splits });
        if (cookies && cookies !== cookieSource) { cookieTex.destroy(); cookieTex = device.createTexture({ size: [cookies.size, cookies.size], format: "rgba8unorm", usage: TU.TEXTURE_BINDING | TU.COPY_DST }); device.queue.writeTexture({ texture: cookieTex }, cookies.data, { bytesPerRow: cookies.size * 4 }, [cookies.size, cookies.size]); cookieSource = cookies; self.cookieVersion++; }
        B.A.faces.forEach((f, k) => device.queue.writeBuffer(faceBuffers[k], 0, zo(f.viewProj)));
        const pf = new Float32Array(44), pu = new Uint32Array(pf.buffer);
        pf.set([...C.min, 0, ...C.size, 0], 0); pu.set([...C.dims, 0], 8); pf.set([O.bias, 1 / O.atlasSize, lights.length, O.maxPerCell], 12);
        pf.set(camera ? Float32Array.from(camera.view) : new Float32Array(16), 16); pf.set([view ? C.P00 : 1, view ? C.P11 : 1, view ? C.near : 0.1, view ? C.far : 100], 32); pf.set([B.sun, B.cascades, view ? 1 : 0, O.maxPenumbra], 36); pf.set(B.splits, 40);
        device.queue.writeBuffer(params, 0, pf);
        device.queue.writeBuffer(cells, 0, packCells(C, N, O.maxPerCell, Uint32Array)); device.queue.writeBuffer(lightsB, 0, packLights(lights, B.A, O.maxLights)); device.queue.writeBuffer(faces, 0, packFaces(B.A, maxFaces, zo));
        return { cells: N, overflow: C.overflow, faces: B.A.faces.length, unshadowed: B.A.unshadowed.length, cascades: B.cascades, space: O.space };
    };
    // `timer` (2026-11-27, render/gpuTimer.mjs createGpuTimer): every pass of the atlas timed under the label "shadows" (summed), for tools/lightingCost.mjs
    self.renderShadows = (enc, drawDepth, { timer = null } = {}) => {
        if (!self.atlas) return;
        const ts = () => (timer ? { timestampWrites: timer.writes("shadows") } : {});
        enc.beginRenderPass({ colorAttachments: [], depthStencilAttachment: { view: atlas.createView(), depthLoadOp: "clear", depthClearValue: 1, depthStoreOp: "store" }, ...ts() }).end();
        self.atlas.faces.forEach((f, k) => {
            const [x, y, w, h] = f.rect.map((v) => Math.round(v * O.atlasSize)), pass = enc.beginRenderPass({ colorAttachments: [], depthStencilAttachment: { view: atlas.createView(), depthLoadOp: "load", depthStoreOp: "store" }, ...ts() });
            pass.setViewport(x, y, w, h, 0, 1); pass.setScissorRect(x, y, w, h); drawDepth(pass, { ...f, index: k, viewProj: zo(f.viewProj), buffer: faceBuffers[k] }); pass.end();
        });
    };
    /** The chunk's bind group. Made again after a new cookie atlas (cookieVersion changes). */
    self.bindGroupFor = (pipeline, group = 1) => device.createBindGroup({ layout: pipeline.getBindGroupLayout(group), entries: [{ binding: 0, resource: { buffer: params } }, { binding: 1, resource: { buffer: cells } }, { binding: 2, resource: { buffer: lightsB } }, { binding: 3, resource: { buffer: faces } }, { binding: 4, resource: atlas.createView() }, { binding: 5, resource: cmp }, { binding: 6, resource: cookieTex.createView() }, { binding: 7, resource: lin }] });
    self.destroy = () => { for (const b of [params, cells, lightsB, faces, ...faceBuffers]) b.destroy(); atlas.destroy(); cookieTex.destroy(); };
    return self;
}
