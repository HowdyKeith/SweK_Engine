// WebGLEngine/physics/mechanics/terrain.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// THE GROUND AS A HEIGHT FUNCTION, ONCE, FOR EVERY FLIGHT MODEL, EVERY PILOT AND EVERY PAGE. Until this file the flight models' ground was the plane z = 0 (physics/mechanics/flightModel6dof.mjs and rotorcraftModel6dof.mjs both said so in their headers), a ridge or a wall was a function only a PILOT was handed
// (brain/autopilotRotor.mjs reads `terrain(x, y)` and keeps its skids off it) and the machine flew THROUGH it when the pilot failed -- the pilot's gate could only measure "the clearance goes negative" where it should have measured "it crashes". This is the terrain the models' contact tests read, the
// pilots' look-ahead reads, and the pages' mesh is built from, so that the three cannot disagree about where the ground is.
//
//   const t = createTerrain({ kind: "fbm", seed: 7, amplitude: 60, wavelength: 400, octaves: 4, clearing: [0, 0, 150, 400] });
//   t.height(x, y)      the ground's height at (x, y), metres (world +Z up)
//   t.gradient(x, y)    [dh/dx, dh/dy]                     (analytic where the kind has one, a central difference of 0.25 m where it has not)
//   t.normal(x, y)      the unit surface normal, (-gx, -gy, 1) / |.|, always pointing up
//   t.flat              true only for the flat ground at height 0 -- the models take a bit-for-bit fast path for it, so that "no terrain" and "FLAT" are the SAME flights to the bit
//
// A TERRAIN IS A SPEC, AND A SPEC IS JSON: { kind, ...numbers }, frozen, so that a peer or a lockstep payload can carry the ground by value and rebuild the same heights (integer-hashed noise, no Math.random: the same bytes on every engine). THE KINDS:
//   flat     { level }                                            the plane z = level (level 0 is FLAT)
//   plane    { gx, gy, level, x0, y0 }                            a constant slope
//   bump     { x0, y0, height, radius }                           a gaussian hill: height * exp(-(r / radius)^2)
//   ridge    { x0, height, width, angle }                         a gaussian ridge, long across `angle` (0: the ridge runs along y and is crossed along x): height * exp(-(s / width)^2), s the distance across it
//   wall     { x0, height, angle }                                a STEP: height on the far side of x0, 0 on the near side. DISCONTINUOUS ON PURPOSE: it is the ground a look-ahead can see only at its sample distances, and its face is a hit for any point of a machine that is inside it
//   rolling  { amplitude, wavelength, ripple, rippleWavelength }  a swell along x with a ripple on it: amplitude (1 - cos(2 pi x / wavelength)) / 2 + ripple sin^2(pi x / rippleWavelength)  (the pilot gate's hills)
//   fbm      { seed, amplitude, wavelength, octaves, level, clearing }  render/valueNoise.js's fractal noise: level + mask * amplitude * (2 fbm - 1), `clearing` [cx, cy, r0, r1] flattens the ground to `level` inside r0 and blends to the noise by r1 (a place to start from)
//   sum      { parts: [spec, ...] }                               the heights and gradients added
//
// Pure: no DOM, no clock, no random.
"use strict";
import { fbm } from "../../render/valueNoise.js";

export const KINDS = Object.freeze(["flat", "plane", "bump", "ridge", "wall", "rolling", "fbm", "sum"]);
const num = (v, d) => (v === undefined ? d : v);
const smoothstep = (a, b, x) => { if (!(b > a)) return x >= b ? 1 : 0; const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const fd = 0.25;   // the step of a central difference, metres
const deepFreeze = (o) => { if (o && typeof o === "object" && !Object.isFrozen(o)) { Object.freeze(o); for (const k of Object.keys(o)) deepFreeze(o[k]); } return o; };

/** The spec with its defaults filled in and every number checked; throws on an unknown kind or a non-finite number. A spec is plain data (JSON). */
export function normalizeSpec(spec) {
    if (!spec || typeof spec !== "object" || !KINDS.includes(spec.kind)) throw new Error(`terrain: unknown kind "${spec && spec.kind}" (${KINDS.join(", ")})`);
    const k = spec.kind, out = { kind: k };
    const put = (name, def) => { const v = num(spec[name], def); if (!Number.isFinite(v)) throw new Error(`terrain: ${k}.${name} is not a finite number (${v})`); out[name] = v; };
    if (k === "flat") put("level", 0);
    else if (k === "plane") { put("gx", 0); put("gy", 0); put("level", 0); put("x0", 0); put("y0", 0); }
    else if (k === "bump") { put("x0", 0); put("y0", 0); put("height", 10); put("radius", 50); if (!(out.radius > 0)) throw new Error("terrain: bump.radius must be positive"); }
    else if (k === "ridge") { put("x0", 0); put("height", 20); put("width", 40); put("angle", 0); if (!(out.width > 0)) throw new Error("terrain: ridge.width must be positive"); }
    else if (k === "wall") { put("x0", 0); put("height", 30); put("angle", 0); }
    else if (k === "rolling") { put("amplitude", 40); put("wavelength", 800); put("ripple", 0); put("rippleWavelength", 116); if (!(out.wavelength > 0) || !(out.rippleWavelength > 0)) throw new Error("terrain: rolling wavelengths must be positive"); }
    else if (k === "fbm") {
        put("seed", 1); put("amplitude", 30); put("wavelength", 300); put("octaves", 4); put("level", 0);
        if (!(out.wavelength > 0) || !(out.octaves >= 1) || out.octaves !== Math.floor(out.octaves)) throw new Error("terrain: fbm needs a positive wavelength and a whole number of octaves");
        const c = spec.clearing; if (c !== undefined) { if (!Array.isArray(c) || c.length !== 4 || !c.every(Number.isFinite) || !(c[3] >= c[2])) throw new Error("terrain: fbm.clearing is [cx, cy, r0, r1] with r1 >= r0"); out.clearing = c.slice(); }
    } else if (k === "sum") {
        if (!Array.isArray(spec.parts) || !spec.parts.length) throw new Error("terrain: sum needs parts");
        out.parts = spec.parts.map(normalizeSpec);
    }
    return out;
}

// height and gradient of one normalised spec: [h, gx, gy] (a kind with no analytic gradient returns gx = gy = NaN and is differenced by the caller)
function evalSpec(s, x, y) {
    switch (s.kind) {
        case "flat": return [s.level, 0, 0];
        case "plane": return [s.level + s.gx * (x - s.x0) + s.gy * (y - s.y0), s.gx, s.gy];
        case "bump": { const dx = x - s.x0, dy = y - s.y0, e = s.height * Math.exp(-((dx * dx + dy * dy) / (s.radius * s.radius))); return [e, e * (-2 * dx / (s.radius * s.radius)), e * (-2 * dy / (s.radius * s.radius))]; }
        case "ridge": { const c = Math.cos(s.angle), sn = Math.sin(s.angle), d = (x - s.x0) * c + y * sn, e = s.height * Math.exp(-((d / s.width) ** 2)), g = e * (-2 * d / (s.width * s.width)); return [e, g * c, g * sn]; }
        case "wall": { const d = (x - s.x0) * Math.cos(s.angle) + y * Math.sin(s.angle); return [d >= 0 ? s.height : 0, 0, 0]; }
        case "rolling": {
            const a = 2 * Math.PI / s.wavelength, b = Math.PI / s.rippleWavelength, sw = Math.sin(b * x);
            return [s.amplitude * (1 - Math.cos(a * x)) / 2 + s.ripple * sw * sw, s.amplitude * Math.sin(a * x) * a / 2 + s.ripple * 2 * sw * Math.cos(b * x) * b, 0];
        }
        case "fbm": {
            const f = (px, py) => {
                let m = 1; if (s.clearing) m = smoothstep(s.clearing[2], s.clearing[3], Math.hypot(px - s.clearing[0], py - s.clearing[1]));
                return s.level + m * s.amplitude * (2 * fbm(px / s.wavelength, py / s.wavelength, 0.5, s.seed, s.octaves) - 1);
            };
            return [f(x, y), (f(x + fd, y) - f(x - fd, y)) / (2 * fd), (f(x, y + fd) - f(x, y - fd)) / (2 * fd)];
        }
        case "sum": { let h = 0, gx = 0, gy = 0; for (const p of s.parts) { const r = evalSpec(p, x, y); h += r[0]; gx += r[1]; gy += r[2]; } return [h, gx, gy]; }
        default: throw new Error("terrain: unreachable kind " + s.kind);
    }
}

/** A terrain from a spec (see the header). Frozen; `spec` is its normalised, frozen data and rebuilds the same terrain: createTerrain(JSON.parse(JSON.stringify(t.spec))). */
export function createTerrain(spec = { kind: "flat" }) {
    const s = deepFreeze(normalizeSpec(spec)), isFlat = s.kind === "flat" && s.level === 0;
    const gradient = (x, y) => { const r = evalSpec(s, x, y); return [r[1], r[2]]; };
    const normal = (x, y) => { const r = evalSpec(s, x, y), n = Math.hypot(r[1], r[2], 1); return [-r[1] / n, -r[2] / n, 1 / n]; };
    return Object.freeze({ spec: s, flat: isFlat, height: (x, y) => evalSpec(s, x, y)[0], gradient, normal });
}

/** The flat ground at height 0: what a model uses when it is given no terrain. */
export const FLAT = createTerrain({ kind: "flat" });

/** A terrain from a bare function (x, y) -> height, gradient by central difference: how brain/autopilotRotor.mjs's pilot gate handed it ground before this file existed. NaN heights stay NaN (the caller's guards decide). */
export function fromFunction(fn) {
    const grad = (x, y) => [(fn(x + fd, y) - fn(x - fd, y)) / (2 * fd), (fn(x, y + fd) - fn(x, y - fd)) / (2 * fd)];
    return Object.freeze({ spec: null, flat: false, height: (x, y) => fn(x, y), gradient: grad, normal: (x, y) => { const g = grad(x, y), n = Math.hypot(g[0], g[1], 1); return [-g[0] / n, -g[1] / n, 1 / n]; } });
}

/** Whatever a caller was given -> a terrain: nothing is FLAT, a function is fromFunction, an object with `height` is itself, a spec is createTerrain. */
export function asTerrain(t) {
    if (t == null) return FLAT;
    if (typeof t === "function") return fromFunction(t);
    if (typeof t.height === "function" && typeof t.normal === "function") return t;
    return createTerrain(t);
}

/** Height of a point above the terrain under it. */
export const agl = (terrain, pos) => pos[2] - terrain.height(pos[0], pos[1]);

/**
 * A triangle mesh of the ground over a rectangle: { positions (Float32Array, nx*ny*3), normals (same), indices (Uint32Array, 6 (nx-1)(ny-1), counter-clockwise seen from above), bounds: { min, max } (of the heights) }.
 * Vertex (i, j) is at (x0 + i step, y0 + j step). Pure geometry: the page hands it to a THREE.BufferGeometry, so that what is drawn is what the model collides with.
 */
export function meshOf(terrain, { x0 = -500, y0 = -500, nx = 65, ny = 65, step = 16 } = {}) {
    if (!(nx >= 2 && ny >= 2 && step > 0)) throw new Error("terrain.meshOf: needs nx, ny >= 2 and a positive step");
    const positions = new Float32Array(nx * ny * 3), normals = new Float32Array(nx * ny * 3), indices = new Uint32Array(6 * (nx - 1) * (ny - 1));
    let lo = Infinity, hi = -Infinity;
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
        const x = x0 + i * step, y = y0 + j * step, h = terrain.height(x, y), n = terrain.normal(x, y), o = 3 * (j * nx + i);
        positions[o] = x; positions[o + 1] = y; positions[o + 2] = h; normals[o] = n[0]; normals[o + 1] = n[1]; normals[o + 2] = n[2];
        if (h < lo) lo = h; if (h > hi) hi = h;
    }
    let k = 0;
    for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) {
        const a = j * nx + i, b = a + 1, c = a + nx, d = c + 1;
        indices[k++] = a; indices[k++] = b; indices[k++] = d; indices[k++] = a; indices[k++] = d; indices[k++] = c;
    }
    return { positions, normals, indices, bounds: { min: lo, max: hi } };
}

export function reportLines() {
    const t = createTerrain({ kind: "fbm", seed: 7, amplitude: 60, wavelength: 400, octaves: 4, clearing: [0, 0, 150, 400] }), m = meshOf(t, { nx: 33, ny: 33, step: 32 });
    return [`[terrain] the ground as a height function for the flight models, the pilots and the pages: ${KINDS.join(", ")}`,
        `  a ${t.spec.kind} of amplitude ${t.spec.amplitude} m over ${t.spec.wavelength} m: heights ${m.bounds.min.toFixed(1)}..${m.bounds.max.toFixed(1)} m over a 1 km square; flat at its centre (${t.height(0, 0).toFixed(1)} m); the default FLAT is height 0 and the models' bit-for-bit fast path`];
}
if (typeof process !== "undefined" && Array.isArray(process.argv)) {   // see physics/mechanics/aircraftAssembly.mjs for why this is guarded and the import is dynamic
    const { pathToFileURL } = await import("node:url");
    if (import.meta.url === pathToFileURL(process.argv[1] || "").href) { for (const l of reportLines()) console.log(l); process.exit(0); }
}
