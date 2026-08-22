// WebGLEngine/world/spaceStructures.js — v3843 (Long Silence: asteroids and stations, from the parts already here)
//
// The scene had a star, a sky and a planet and nothing in between -- nothing at ship scale to fly past. This
// builds the two things that fill that gap, and builds them out of parts the tree already owns rather than new
// ones: asteroids are an icosphere displaced by world/procPlanet.js's OWN fbm3 (the same noise that makes the
// planet's terrain, at a different scale), and stations are hull modules wearing render/greeble.js's plates.
// Technique from TheLongSilence (MIT, (c) 2026 Anshu Chimala), which populates its systems with asteroids and
// greebled structures; the noise, the greeble and the assembly here are SweK's own.
//
// TWO PROPERTIES THE GATE PINS, AND THEY ARE THE TWO THAT ACTUALLY BREAK:
//   1. AN ASTEROID IS A CLOSED SOLID. Every edge is shared by exactly two triangles and the signed volume comes
//      out POSITIVE -- so the winding is consistent and outward, which is what a lit surface and a collision hull
//      both depend on and what a displaced sphere silently loses if the seam vertices are not shared.
//   2. NOTHING INTERPENETRATES. Field rocks are placed by rejection with a minimum separation, and a station's
//      modules are laid along its spine without overlapping. Two solids in the same place is the failure that
//      looks like a rendering bug and is actually a generation bug.
//
// PURE: no Three, no GL, no DOM, no Math.random. Same seed -> identical geometry. The buffers come back as plain
// typed arrays for a BufferGeometry. Gated in world/spaceStructures-selfcheck.mjs.

import { rng, fbm3 } from "./procPlanet.js";        // the planet's own PRNG and fractal noise
import { greebleBox } from "../render/greeble.js";  // the plates a hull wears

const norm3 = (v) => { const n = 1 / Math.hypot(v[0], v[1], v[2]); return [v[0] * n, v[1] * n, v[2] * n]; };

// ---- icosphere ----
const T = (1 + Math.sqrt(5)) / 2;
const ICO_V = [
    [-1, T, 0], [1, T, 0], [-1, -T, 0], [1, -T, 0],
    [0, -1, T], [0, 1, T], [0, -1, -T], [0, 1, -T],
    [T, 0, -1], [T, 0, 1], [-T, 0, -1], [-T, 0, 1],
];
const ICO_F = [
    [0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11],
    [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
    [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9],
    [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1],
];

// A unit icosphere at the given subdivision. Edge midpoints are CACHED by edge key, so neighbouring triangles
// share the vertex they create -- that sharing is the whole reason the result stays a closed solid.
export function icosphere(subdiv = 2) {
    let verts = ICO_V.map(norm3);
    let faces = ICO_F.map((f) => f.slice());
    for (let s = 0; s < subdiv; s++) {
        const mid = new Map(), next = [];
        const midpoint = (a, b) => {
            const key = a < b ? a * 1e6 + b : b * 1e6 + a;
            let m = mid.get(key);
            if (m === undefined) {
                m = verts.length;
                verts.push(norm3([verts[a][0] + verts[b][0], verts[a][1] + verts[b][1], verts[a][2] + verts[b][2]]));
                mid.set(key, m);
            }
            return m;
        };
        for (const [a, b, c] of faces) {
            const ab = midpoint(a, b), bc = midpoint(b, c), ca = midpoint(c, a);
            next.push([a, ab, ca], [b, bc, ab], [c, ca, bc], [ab, bc, ca]);
        }
        faces = next;
    }
    return { verts, faces };
}

const ASTEROID_DEFAULTS = {
    subdiv: 3,        // 1280 triangles
    radius: 1,
    freq: 2.4,        // large-scale lumpiness
    detailFreq: 7.0,  // surface pitting
    amp: 0.34,        // how far the surface moves, as a fraction of the radius
    detailAmp: 0.10,
    squash: 0.35,     // how far from a ball the body may be stretched along its own axes
    octaves: 4,
};
export function makeAsteroidParams(opts = {}) { return { ...ASTEROID_DEFAULTS, ...opts }; }

// The radius of one asteroid in a direction: the SAME fbm3 the planet's terrain uses, at asteroid frequencies,
// plus a per-body axis squash so a field is not a bag of identical potatoes. A pure function of direction, so the
// surface closes on itself exactly the way the planet's cubemap does.
export function asteroidRadius(dir, P, seed) {
    const d = norm3(dir);
    const lump = fbm3(d[0] * P.freq, d[1] * P.freq, d[2] * P.freq, { seed, octaves: P.octaves, freq: 1 });
    const grit = fbm3(d[0] * P.detailFreq, d[1] * P.detailFreq, d[2] * P.detailFreq, { seed: seed ^ 0x5bd1, octaves: 2, freq: 1 });
    const r = rng(seed ^ 0x9e37);
    const sx = 1 + (r() - 0.5) * 2 * P.squash, sy = 1 + (r() - 0.5) * 2 * P.squash, sz = 1 + (r() - 0.5) * 2 * P.squash;
    const stretch = Math.hypot(d[0] * sx, d[1] * sy, d[2] * sz);
    return P.radius * stretch * (1 + (lump - 0.5) * 2 * P.amp + (grit - 0.5) * 2 * P.detailAmp);
}

// One asteroid as buffers. Normals are the AREA-WEIGHTED face normals accumulated per vertex -- the surface is
// not a sphere any more, so the position is no longer its own normal.
export function asteroidMesh(seed, opts = {}) {
    const P = makeAsteroidParams(opts);
    const { verts, faces } = icosphere(P.subdiv);
    const positions = new Float32Array(verts.length * 3), normals = new Float32Array(verts.length * 3);
    const indices = new Uint32Array(faces.length * 3);
    let rMin = Infinity, rMax = 0;
    for (let i = 0; i < verts.length; i++) {
        const r = asteroidRadius(verts[i], P, seed >>> 0);
        rMin = Math.min(rMin, r); rMax = Math.max(rMax, r);
        positions[i * 3] = verts[i][0] * r; positions[i * 3 + 1] = verts[i][1] * r; positions[i * 3 + 2] = verts[i][2] * r;
    }
    for (let f = 0; f < faces.length; f++) {
        const [a, b, c] = faces[f];
        indices[f * 3] = a; indices[f * 3 + 1] = b; indices[f * 3 + 2] = c;
        const ax = positions[a * 3], ay = positions[a * 3 + 1], az = positions[a * 3 + 2];
        const e1 = [positions[b * 3] - ax, positions[b * 3 + 1] - ay, positions[b * 3 + 2] - az];
        const e2 = [positions[c * 3] - ax, positions[c * 3 + 1] - ay, positions[c * 3 + 2] - az];
        const n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
        for (const v of [a, b, c]) { normals[v * 3] += n[0]; normals[v * 3 + 1] += n[1]; normals[v * 3 + 2] += n[2]; }
    }
    for (let i = 0; i < verts.length; i++) {
        const n = norm3([normals[i * 3], normals[i * 3 + 1], normals[i * 3 + 2]]);
        normals[i * 3] = n[0]; normals[i * 3 + 1] = n[1]; normals[i * 3 + 2] = n[2];
    }
    return { positions, normals, indices, vertexCount: verts.length, triangleCount: faces.length, rMin, rMax };
}

// Signed volume of a closed indexed mesh (the divergence theorem, one tetrahedron per triangle against the
// origin). POSITIVE means the winding is consistent and outward -- the one number that catches a flipped face.
export function meshVolume(positions, indices) {
    let vol = 0;
    for (let k = 0; k < indices.length; k += 3) {
        const a = indices[k] * 3, b = indices[k + 1] * 3, c = indices[k + 2] * 3;
        const cx = positions[b + 1] * positions[c + 2] - positions[b + 2] * positions[c + 1];
        const cy = positions[b + 2] * positions[c] - positions[b] * positions[c + 2];
        const cz = positions[b] * positions[c + 1] - positions[b + 1] * positions[c];
        vol += (positions[a] * cx + positions[a + 1] * cy + positions[a + 2] * cz) / 6;
    }
    return vol;
}

// ---- asteroid fields ----
const FIELD_DEFAULTS = {
    count: 40,
    inner: 90, outer: 260,   // the shell the belt occupies
    thickness: 40,           // half-height of the disc
    rMin: 3, rMax: 14,
    gap: 1.25,               // required clearance as a multiple of the two radii summed
    tries: 60,               // rejection attempts per rock before giving up on it
};
export function makeFieldParams(opts = {}) { return { ...FIELD_DEFAULTS, ...opts }; }

// Place rocks in a disc shell with NO INTERPENETRATION, by rejection. It returns what it managed to place, and
// `requested` beside it -- a placer that quietly returns fewer than asked, or that overlaps to hit the number,
// is the same lie in two directions.
export function asteroidField(seed, opts = {}) {
    const P = makeFieldParams(opts), r = rng(seed >>> 0), rocks = [];
    for (let i = 0; i < P.count; i++) {
        for (let t = 0; t < P.tries; t++) {
            const ang = r() * Math.PI * 2, rad = P.inner + r() * (P.outer - P.inner);
            const pos = [Math.cos(ang) * rad, (r() - 0.5) * 2 * P.thickness, Math.sin(ang) * rad];
            const radius = P.rMin + r() * (P.rMax - P.rMin);
            let clear = true;
            for (const o of rocks) {
                const d = Math.hypot(pos[0] - o.pos[0], pos[1] - o.pos[1], pos[2] - o.pos[2]);
                if (d < (radius + o.radius) * P.gap) { clear = false; break; }
            }
            if (!clear) continue;
            rocks.push({
                pos, radius, seed: (r() * 1e9) | 0,
                spin: (r() - 0.5) * 0.4, axis: norm3([r() - 0.5, r() - 0.5, r() - 0.5]),
            });
            break;
        }
    }
    return { rocks, requested: P.count, placed: rocks.length };
}

// ---- stations ----
const STATION_DEFAULTS = {
    seed: 31337,
    modules: 5,        // hull segments along the spine
    hubRadius: 7,
    segMin: 5, segMax: 12,
    gapMin: 1.5, gapMax: 4,
    armChance: 0.6,    // chance a module grows a docking arm
    armLength: 9,
    greeble: { depth: 4, tiers: 3, step: 0.02 },
};
export function makeStationParams(opts = {}) { return { ...STATION_DEFAULTS, ...opts }; }

// A station as a list of axis-aligned hull modules strung along +X/-X from a central hub, each with its own
// greeble plates. Modules are laid END TO END with a declared gap, so by construction none can overlap another --
// and the gate checks the construction rather than trusting it.
export function stationSpec(opts = {}) {
    const P = makeStationParams(opts), r = rng(P.seed >>> 0);
    const parts = [];
    parts.push({ kind: "hub", center: [0, 0, 0], size: [P.hubRadius * 1.4, P.hubRadius * 2, P.hubRadius * 1.4] });
    for (const dir of [+1, -1]) {
        let cursor = P.hubRadius * 0.7;
        for (let m = 0; m < P.modules; m++) {
            const gap = P.gapMin + r() * (P.gapMax - P.gapMin);
            const len = P.segMin + r() * (P.segMax - P.segMin);
            const w = P.hubRadius * (0.45 + r() * 0.5), h = P.hubRadius * (0.45 + r() * 0.5);
            const cx = dir * (cursor + gap + len * 0.5);
            parts.push({ kind: "module", center: [cx, 0, 0], size: [len, h, w] });
            if (r() < P.armChance) {
                const s = r() < 0.5 ? 1 : -1;
                parts.push({ kind: "arm", center: [cx, 0, s * (w * 0.5 + P.armLength * 0.5)], size: [len * 0.35, h * 0.35, P.armLength] });
            }
            cursor += gap + len;
        }
    }
    const plates = [];
    for (let i = 0; i < parts.length; i++) {
        for (const pl of greebleBox(parts[i].size, { ...P.greeble, seed: (P.seed ^ (i * 0x27d4eb2d)) | 0 })) {
            plates.push({
                part: i, tone: pl.tone, size: pl.size,
                center: [pl.center[0] + parts[i].center[0], pl.center[1] + parts[i].center[1], pl.center[2] + parts[i].center[2]],
            });
        }
    }
    const span = parts.reduce((s, p) => Math.max(s, Math.abs(p.center[0]) + p.size[0] * 0.5), 0) * 2;
    return { parts, plates, span, spin: 0.05 + r() * 0.06 };
}
