// WebGLEngine/render/clusteredLights.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// MANY LIGHTS: CLUSTERED LIGHTING AND A SHADOW ATLAS, FOR WEBGL2. Backlog: render/BACKLOG_2026-11-21_PLAYCANVAS.md, `clustered-lights` (PlayCanvas src/scene/lighting/world-clusters.js,
// src/scene/renderer/world-clusters-allocator.js, src/scene/lighting/light-texture-atlas.js). Keith: "keep going with clustered lighting and the shadow atlas".
//
// THE CLUSTERS (PlayCanvas's design: in WORLD space, not the camera's). A grid of cells over the box that holds every light's range; each cell lists the lights whose sphere of
// range touches it (up to `maxPerCell`; the rest are counted as OVERFLOW, never silently lost). A pixel finds its cell from its world position and loops over that cell's lights
// only. A light reaches nothing past its range (the window below is exactly 0 there), so a cell that lists every light touching it shades EXACTLY as a loop over all the lights.
//      buildClusters(lights, { cells: [nx, ny, nz], maxPerCell }) -> { min, max, dims, size, counts, lists, overflow }
// THE LIGHTS: { type: "point" | "spot", position, range, color, intensity, direction (spot), innerAngle, outerAngle (radians, half-angles), shadow (bool), priority }
//      falloff  window(d, r) = clamp(1 - (d/r)^4, 0, 1)^2 / (d^2 + 1)      (Karis 2013's; 0 at and past the range, smooth there)
//      spot     smoothstep(cos outer, cos inner, the angle off the spot's axis)
//      shading  albedo * radiance * max(n.l, 0) + 0.25 * radiance * max(n.h, 0)^32 (Blinn-Phong), summed over the cell's lights, times each light's shadow
// THE SHADOW ATLAS. One depth texture `atlasSize` square, divided into `slots` x `slots` tiles. Shadowed lights are taken in order of `priority` (higher first, then their order);
// a spot light takes one tile (a perspective shadow map down its cone), a point light SIX (the cube's faces, 90 degrees each, in the order +x, -x, +y, -y, +z, -z). A light that
// does not fit goes without a shadow and is listed as such (allocateAtlas(...).unshadowed). Shadows are sampled with the hardware's 2 x 2 comparison (sampler2DShadow), inside
// the tile only (half a texel in from its border). THE BIAS IS IN WORLD UNITS: the point looked up is moved off the surface along its normal and half as far toward the light,
// by bias * (1 + its distance from the light) -- the normal part is what a grazing light needs (found by the gate: ground 5.5 units from the point light, lit at 14 degrees, had
// acne with a bias toward the light alone) --
// a bias in depth would be metres at the far end of a light's range, where perspective depth is compressed (found by the gate: a constant 0.002 of depth was about two units
// at seven, and pillars near the ground cast no shadow from the spot lights).
//      allocateAtlas(lights, { atlasSize, slots }) -> { faces: [{ light, face, rect: [x, y, w, h] in 0..1, viewProj }], byLight: Map(index -> [first face, count]), unshadowed }
//      faceMatrices(light) -> [{ view, proj, viewProj }]   one for a spot light, six for a point light
//
//   const L = createClusteredLighting(gl, { maxLights: 256, cells: [12, 4, 12], maxPerCell: 24, atlasSize: 2048, slots: 4 })
//   L.update(lights)                  clusters built and uploaded, the atlas allocated, the light and face textures written
//   L.renderShadows(drawDepth)        for each atlas face: the atlas framebuffer bound, the tile's viewport and scissor set, drawDepth(viewProj) called (the page draws its
//                                     casters' depth with that matrix)
//   L.bind(program, firstUnit)        the five textures and the uniforms of CLUSTERED_GLSL on `program` (texture units firstUnit .. firstUnit + 3)
//   CLUSTERED_GLSL                    the shading chunk: vec3 clusteredLight(vec3 p, vec3 n, vec3 v, vec3 albedo) -- #define CLUSTERED_BRUTE before it to loop over every
//                                     light instead (the gate's reference); #define CLUSTERED_NO_SHADOWS to skip the atlas
//   shadeCPU(lights, clusters, p, n, v, albedo, { brute, shadowOf }) the same sum on the CPU
// Held by tools/ship/clusteredLights-selfcheck.mjs (lights-demo.html in headless Chromium).
"use strict";

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2], len = (a) => Math.hypot(a[0], a[1], a[2]);
const norm = (a) => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; }, cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const DEFAULTS = Object.freeze({ maxLights: 256, cells: [12, 4, 12], maxPerCell: 24, atlasSize: 2048, slots: 4, bias: 0.006 });
export const window_ = (d, r) => { const x = Math.min(1, Math.max(0, 1 - Math.pow(d / r, 4))); return (x * x) / (d * d + 1); };
const smoothstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

/** The cluster grid over the lights' ranges. */
export function buildClusters(lights, { cells = DEFAULTS.cells, maxPerCell = DEFAULTS.maxPerCell } = {}) {
    const [nx, ny, nz] = cells, N = nx * ny * nz, counts = new Int32Array(N), lists = new Int32Array(N * maxPerCell).fill(-1);
    if (!lights.length) return { min: [0, 0, 0], max: [1, 1, 1], dims: [nx, ny, nz], size: [1 / nx, 1 / ny, 1 / nz], counts, lists, overflow: 0, maxPerCell };
    const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
    for (const l of lights) for (let k = 0; k < 3; k++) { min[k] = Math.min(min[k], l.position[k] - l.range); max[k] = Math.max(max[k], l.position[k] + l.range); }
    const size = [0, 1, 2].map((k) => (max[k] - min[k]) / cells[k] || 1);
    let overflow = 0;
    lights.forEach((l, i) => {
        const lo = [0, 1, 2].map((k) => Math.max(0, Math.floor((l.position[k] - l.range - min[k]) / size[k]))), hi = [0, 1, 2].map((k) => Math.min(cells[k] - 1, Math.floor((l.position[k] + l.range - min[k]) / size[k])));
        for (let z = lo[2]; z <= hi[2]; z++) for (let y = lo[1]; y <= hi[1]; y++) for (let x = lo[0]; x <= hi[0]; x++) {
            // the sphere against the cell's box: the nearest point of the box within the range
            const b0 = [min[0] + x * size[0], min[1] + y * size[1], min[2] + z * size[2]], q = [0, 1, 2].map((k) => Math.min(Math.max(l.position[k], b0[k]), b0[k] + size[k]));
            if (len(sub(q, l.position)) >= l.range) continue;
            const c = (z * ny + y) * nx + x;
            if (counts[c] < maxPerCell) lists[c * maxPerCell + counts[c]++] = i; else overflow++;
        }
    });
    return { min, max, dims: [nx, ny, nz], size, counts, lists, overflow, maxPerCell };
}
/** The cell index of a world point, or -1 outside the grid. */
export function cellOf(C, p) {
    const c = [0, 1, 2].map((k) => Math.floor((p[k] - C.min[k]) / C.size[k]));
    if (c.some((v, k) => v < 0 || v >= C.dims[k])) return -1;
    return (c[2] * C.dims[1] + c[1]) * C.dims[0] + c[0];
}

/** One light's radiance at p (with its window and cone), and its direction l from p. */
export function lightAt(l, p) {
    const d = sub(l.position, p), dist = len(d), L = dist > 0 ? [d[0] / dist, d[1] / dist, d[2] / dist] : [0, 1, 0];
    let a = window_(dist, l.range) * l.intensity;
    if (l.type === "spot") a *= smoothstep(Math.cos(l.outerAngle), Math.cos(l.innerAngle), dot([-L[0], -L[1], -L[2]], norm(l.direction)));
    return { L, rad: l.color.map((c) => c * a) };
}
/** The shading sum on the CPU: the cell's lights (or, `brute`, every light), each times shadowOf(i, p) (1 when not given). */
export function shadeCPU(lights, C, p, n, v, albedo, { brute = false, shadowOf = null } = {}) {
    const out = [0, 0, 0], idx = brute ? lights.map((_, i) => i) : (() => { const c = cellOf(C, p); if (c < 0) return []; return Array.from(C.lists.subarray(c * C.maxPerCell, c * C.maxPerCell + C.counts[c])); })();
    for (const i of idx) {
        const { L, rad } = lightAt(lights[i], p), nl = Math.max(0, dot(n, L)), h = norm([L[0] + v[0], L[1] + v[1], L[2] + v[2]]), sp = Math.pow(Math.max(0, dot(n, h)), 32) * 0.25, s = shadowOf ? shadowOf(i, p) : 1;
        for (let k = 0; k < 3; k++) out[k] += (albedo[k] * rad[k] * nl + rad[k] * sp * (nl > 0 ? 1 : 0)) * s;
    }
    return out;
}

/** Column-major 4x4. */
const mul4 = (a, b) => { const o = new Float32Array(16); for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) { let s = 0; for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k]; o[c * 4 + r] = s; } return o; };
export function lookAt(eye, target, up) { const z = norm(sub(eye, target)), x = norm(cross(up, z)), y = cross(z, x); return new Float32Array([x[0], y[0], z[0], 0, x[1], y[1], z[1], 0, x[2], y[2], z[2], 0, -dot(x, eye), -dot(y, eye), -dot(z, eye), 1]); }
export function perspective(fovY, aspect, near, far) { const f = 1 / Math.tan(fovY / 2), nf = 1 / (near - far); return new Float32Array([f / aspect, 0, 0, 0, 0, f, 0, 0, 0, 0, (far + near) * nf, -1, 0, 0, 2 * far * near * nf, 0]); }
export const CUBE_FACES = Object.freeze([[[1, 0, 0], [0, -1, 0]], [[-1, 0, 0], [0, -1, 0]], [[0, 1, 0], [0, 0, 1]], [[0, -1, 0], [0, 0, -1]], [[0, 0, 1], [0, -1, 0]], [[0, 0, -1], [0, -1, 0]]]);
export const NEAR = 0.05;
/** The shadow matrices of a light: a spot light's down its cone (a field of twice the outer angle, a hair wider), a point light's six cube faces. */
export function faceMatrices(l) {
    if (l.type === "spot") { const d = norm(l.direction), up = Math.abs(d[1]) > 0.99 ? [1, 0, 0] : [0, 1, 0], view = lookAt(l.position, [l.position[0] + d[0], l.position[1] + d[1], l.position[2] + d[2]], up), proj = perspective(Math.min(Math.PI * 0.95, 2 * l.outerAngle * 1.05), 1, NEAR, l.range); return [{ view, proj, viewProj: mul4(proj, view) }]; }
    return CUBE_FACES.map(([f, up]) => { const view = lookAt(l.position, [l.position[0] + f[0], l.position[1] + f[1], l.position[2] + f[2]], up), proj = perspective(Math.PI / 2, 1, NEAR, l.range); return { view, proj, viewProj: mul4(proj, view) }; });
}
/** The face of a point light's cube a direction from it falls in (the largest component; ties to the earlier face). */
export function cubeFace(v) { const a = v.map(Math.abs); if (a[0] >= a[1] && a[0] >= a[2]) return v[0] >= 0 ? 0 : 1; if (a[1] >= a[2]) return v[1] >= 0 ? 2 : 3; return v[2] >= 0 ? 4 : 5; }

/** The atlas's tiles, handed out by priority. */
export function allocateAtlas(lights, { slots = DEFAULTS.slots } = {}) {
    const order = lights.map((l, i) => i).filter((i) => lights[i].shadow).sort((a, b) => (lights[b].priority ?? 0) - (lights[a].priority ?? 0) || a - b);
    const faces = [], byLight = new Map(), unshadowed = []; let next = 0;
    for (const i of order) {
        const need = lights[i].type === "spot" ? 1 : 6;
        if (next + need > slots * slots) { unshadowed.push(i); continue; }
        byLight.set(i, [faces.length, need]);
        faceMatrices(lights[i]).forEach((m, f) => { const s = next++, x = s % slots, y = Math.floor(s / slots); faces.push({ light: i, face: f, rect: [x / slots, y / slots, 1 / slots, 1 / slots], viewProj: m.viewProj, slot: s }); });
    }
    return { faces, byLight, unshadowed };
}

export const CLUSTERED_GLSL = `
uniform highp sampler2D uClusterCells;   // R32F: row c = cell c; texel 0 its count, texels 1.. its light indices
uniform highp sampler2D uClusterLights;  // RGBA32F: row i = light i, 4 texels
uniform highp sampler2D uShadowFaces;    // RGBA32F: row f = atlas face f, 5 texels (the view-projection's columns, then the tile's rect)
uniform highp sampler2DShadow uShadowAtlas;
uniform vec3 uClusterMin, uClusterSize; uniform ivec3 uClusterDims; uniform int uClusterMaxPerCell, uLightCount; uniform float uShadowBias, uAtlasTexel;
float clWindow(float d, float r) { float x = clamp(1.0 - pow(d / r, 4.0), 0.0, 1.0); return x * x / (d * d + 1.0); }
int clCubeFace(vec3 v) { vec3 a = abs(v); if (a.x >= a.y && a.x >= a.z) return v.x >= 0.0 ? 0 : 1; if (a.y >= a.z) return v.y >= 0.0 ? 2 : 3; return v.z >= 0.0 ? 4 : 5; }
float clShadow(vec3 p, vec3 n, vec3 lp, int first, int count) {
#ifdef CLUSTERED_NO_SHADOWS
    return 1.0;
#else
    if (count <= 0) return 1.0;
    int f = first + (count == 6 ? clCubeFace(p - lp) : 0);
    vec3 L = normalize(lp - p); p += (n + 0.5 * L) * uShadowBias * (1.0 + length(lp - p));   // the bias in WORLD units: off the surface along its normal (what a grazing light needs) and toward the light, growing with distance (a bias in depth would be metres far away)
    mat4 m = mat4(texelFetch(uShadowFaces, ivec2(0, f), 0), texelFetch(uShadowFaces, ivec2(1, f), 0), texelFetch(uShadowFaces, ivec2(2, f), 0), texelFetch(uShadowFaces, ivec2(3, f), 0));
    vec4 r = texelFetch(uShadowFaces, ivec2(4, f), 0), q = m * vec4(p, 1.0);
    if (q.w <= 0.0) return 1.0;
    vec3 s = q.xyz / q.w * 0.5 + 0.5;
    if (s.z >= 1.0) return 1.0;
    vec2 uv = r.xy + clamp(s.xy, vec2(0.0), vec2(1.0)) * r.zw; uv = clamp(uv, r.xy + vec2(uAtlasTexel * 0.5), r.xy + r.zw - vec2(uAtlasTexel * 0.5));
    return texture(uShadowAtlas, vec3(uv, s.z));
#endif
}
vec3 clOne(int i, vec3 p, vec3 n, vec3 v, vec3 albedo) {
    vec4 a = texelFetch(uClusterLights, ivec2(0, i), 0), b = texelFetch(uClusterLights, ivec2(1, i), 0), c = texelFetch(uClusterLights, ivec2(2, i), 0), d = texelFetch(uClusterLights, ivec2(3, i), 0);
    vec3 dl = a.xyz - p; float dist = length(dl); vec3 L = dist > 0.0 ? dl / dist : vec3(0.0, 1.0, 0.0);
    float att = clWindow(dist, a.w);
    if (b.w > 0.5) { float t = clamp((dot(-L, c.xyz) - c.w) / max(d.x - c.w, 1e-6), 0.0, 1.0); att *= t * t * (3.0 - 2.0 * t); }
    if (att <= 0.0) return vec3(0.0);
    vec3 rad = b.rgb * att; float nl = max(dot(n, L), 0.0); vec3 h = normalize(L + v); float sp = nl > 0.0 ? pow(max(dot(n, h), 0.0), 32.0) * 0.25 : 0.0;
    return (albedo * rad * nl + rad * sp) * clShadow(p, n, a.xyz, int(d.y), int(d.z));
}
vec3 clusteredLight(vec3 p, vec3 n, vec3 v, vec3 albedo) {
    vec3 sum = vec3(0.0);
#ifdef CLUSTERED_BRUTE
    for (int i = 0; i < 1024; i++) { if (i >= uLightCount) break; sum += clOne(i, p, n, v, albedo); }
#else
    ivec3 c = ivec3(floor((p - uClusterMin) / uClusterSize));
    if (any(lessThan(c, ivec3(0))) || any(greaterThanEqual(c, uClusterDims))) return sum;
    int cell = (c.z * uClusterDims.y + c.y) * uClusterDims.x + c.x, count = int(texelFetch(uClusterCells, ivec2(0, cell), 0).r);
    for (int k = 0; k < 64; k++) { if (k >= count || k >= uClusterMaxPerCell) break; sum += clOne(int(texelFetch(uClusterCells, ivec2(k + 1, cell), 0).r), p, n, v, albedo); }
#endif
    return sum;
}`;

export function createClusteredLighting(gl, opts = {}) {
    const O = { ...DEFAULTS, ...opts }, N = O.cells[0] * O.cells[1] * O.cells[2];
    if (O.maxPerCell > 64) throw new Error("clusteredLights: maxPerCell is at most 64");
    const tex = (w, h, ifmt, fmt, type, filter = gl.NEAREST) => { const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t); gl.texImage2D(gl.TEXTURE_2D, 0, ifmt, w, h, 0, fmt, type, null); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE); return t; };
    const cellsTex = tex(O.maxPerCell + 1, N, gl.R32F, gl.RED, gl.FLOAT), lightsTex = tex(4, O.maxLights, gl.RGBA32F, gl.RGBA, gl.FLOAT), maxFaces = O.slots * O.slots, facesTex = tex(5, maxFaces, gl.RGBA32F, gl.RGBA, gl.FLOAT);
    const atlas = tex(O.atlasSize, O.atlasSize, gl.DEPTH_COMPONENT24, gl.DEPTH_COMPONENT, gl.UNSIGNED_INT, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_MODE, gl.COMPARE_REF_TO_TEXTURE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_FUNC, gl.LEQUAL);
    const fbo = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, fbo); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, atlas, 0); gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    const self = { options: O, clusters: null, atlas: null, lights: [], atlasTexture: atlas };
    self.update = (lights) => {
        if (lights.length > O.maxLights) throw new Error(`clusteredLights: ${lights.length} lights, at most ${O.maxLights}`);
        const C = buildClusters(lights, O), A = allocateAtlas(lights, O); self.clusters = C; self.atlas = A; self.lights = lights;
        const cd = new Float32Array((O.maxPerCell + 1) * N); for (let c = 0; c < N; c++) { cd[c * (O.maxPerCell + 1)] = C.counts[c]; for (let k = 0; k < C.counts[c]; k++) cd[c * (O.maxPerCell + 1) + 1 + k] = C.lists[c * O.maxPerCell + k]; }
        const ld = new Float32Array(16 * O.maxLights);
        lights.forEach((l, i) => { const o = i * 16, d = l.type === "spot" ? norm(l.direction) : [0, 0, 0], s = A.byLight.get(i) || [0, 0];
            ld.set([...l.position, l.range, ...l.color.map((c) => c * l.intensity), l.type === "spot" ? 1 : 0, ...d, l.type === "spot" ? Math.cos(l.outerAngle) : -2, l.type === "spot" ? Math.cos(l.innerAngle) : -1, s[0], s[1], 0], o); });
        const fd = new Float32Array(20 * maxFaces); A.faces.forEach((f, k) => { fd.set(f.viewProj, k * 20); fd.set(f.rect, k * 20 + 16); });
        gl.bindTexture(gl.TEXTURE_2D, cellsTex); gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, O.maxPerCell + 1, N, gl.RED, gl.FLOAT, cd);
        gl.bindTexture(gl.TEXTURE_2D, lightsTex); gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, 4, O.maxLights, gl.RGBA, gl.FLOAT, ld);
        gl.bindTexture(gl.TEXTURE_2D, facesTex); gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, 5, maxFaces, gl.RGBA, gl.FLOAT, fd);
        return { cells: N, overflow: C.overflow, faces: A.faces.length, unshadowed: A.unshadowed.length };
    };
    self.renderShadows = (drawDepth) => {
        if (!self.atlas) return;
        gl.bindFramebuffer(gl.FRAMEBUFFER, fbo); gl.viewport(0, 0, O.atlasSize, O.atlasSize); gl.depthMask(true); gl.clearDepth(1); gl.clear(gl.DEPTH_BUFFER_BIT);
        gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL); gl.enable(gl.SCISSOR_TEST);
        for (const f of self.atlas.faces) { const [x, y, w, h] = f.rect.map((v) => Math.round(v * O.atlasSize)); gl.viewport(x, y, w, h); gl.scissor(x, y, w, h); drawDepth(f.viewProj, f); }
        gl.disable(gl.SCISSOR_TEST); gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    };
    self.bind = (program, firstUnit = 4) => {
        const u = (n) => gl.getUniformLocation(program, n), C = self.clusters || buildClusters([], O);
        [[cellsTex, "uClusterCells"], [lightsTex, "uClusterLights"], [facesTex, "uShadowFaces"], [atlas, "uShadowAtlas"]].forEach(([t, n], k) => { gl.activeTexture(gl.TEXTURE0 + firstUnit + k); gl.bindTexture(gl.TEXTURE_2D, t); gl.uniform1i(u(n), firstUnit + k); });
        gl.activeTexture(gl.TEXTURE0);
        gl.uniform3fv(u("uClusterMin"), Float32Array.from(C.min)); gl.uniform3fv(u("uClusterSize"), Float32Array.from(C.size)); gl.uniform3iv(u("uClusterDims"), Int32Array.from(C.dims));
        gl.uniform1i(u("uClusterMaxPerCell"), O.maxPerCell); gl.uniform1i(u("uLightCount"), self.lights.length); gl.uniform1f(u("uShadowBias"), O.bias); gl.uniform1f(u("uAtlasTexel"), 1 / O.atlasSize);
    };
    self.destroy = () => { for (const t of [cellsTex, lightsTex, facesTex, atlas]) gl.deleteTexture(t); gl.deleteFramebuffer(fbo); };
    return self;
}
