// WebGLEngine/render/sweptSpine.js — v3834 (a swept-spine trail/beam/streak primitive)
//
// Technique reimplemented from Noniv/snowflow_demo's surf-wake and water-spell construction (verified, nothing
// vendored -- see the external-repos notes): draw a trail/ribbon/beam as ONE static index-only mesh whose every
// vertex is placed from a small per-frame data texture holding the spine. A 2-metre trail and a 19-metre trail
// are the same buffer and the same upload -- length is free, only the spine data changes -- with no per-frame CPU
// mesh rebuild and no particles.
//
// This file is the PURE, GPU-FREE HALF: resample a path to a fixed sample count, carry a ROTATION-MINIMIZING
// frame along it (so the ribbon does not barrel-roll when the ship pitches through vertical -- the classic Frenet
// singularity), lay the samples out in the exact texture layout the vertex shader reads, build the static ring
// topology, and provide a CPU reference for the vertex placement so the GLSL is checkable against arithmetic. No
// Three, no GL, no DOM. The ShaderMaterial that reads all this lives in es-box3d-fly3d.html and is Keith's to see.
// Gated headless in render/sweptSpine-selfcheck.mjs.

// ---- tiny vec3 helpers (arrays [x,y,z]) --------------------------------------------------------------------
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const scale = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const len = (a) => Math.hypot(a[0], a[1], a[2]);
const norm = (a) => { const l = len(a); return l > 1e-12 ? [a[0] / l, a[1] / l, a[2] / l] : [0, 0, 0]; };

// Resample a polyline `path` ([[x,y,z],...]) to exactly `count` points EVENLY SPACED IN ARC LENGTH from the first
// point to the last. This is what makes length free: any path length yields the same `count` samples, so the data
// texture is a fixed size. Degenerate paths (fewer than 2 distinct points) return `count` copies of the first.
export function resampleByArcLength(path, count) {
    if (count < 2) throw new Error("sweptSpine: count must be >= 2");
    const pts = path && path.length ? path : [[0, 0, 0]];
    if (pts.length === 1) return Array.from({ length: count }, () => pts[0].slice());
    // cumulative arc length
    const cum = [0];
    for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + len(sub(pts[i], pts[i - 1])));
    const total = cum[cum.length - 1];
    if (total <= 1e-12) return Array.from({ length: count }, () => pts[0].slice());
    const out = [];
    let seg = 0;
    for (let k = 0; k < count; k++) {
        const target = (k / (count - 1)) * total;
        while (seg < pts.length - 2 && cum[seg + 1] < target) seg++;
        const segLen = cum[seg + 1] - cum[seg];
        const f = segLen > 1e-12 ? (target - cum[seg]) / segLen : 0;
        out.push(add(pts[seg], scale(sub(pts[seg + 1], pts[seg]), f)));
    }
    return out;
}

// Per-point unit tangents of a polyline (central difference interior, one-sided at the ends).
export function tangents(points) {
    const n = points.length, t = [];
    for (let i = 0; i < n; i++) {
        let d;
        if (i === 0) d = sub(points[1], points[0]);
        else if (i === n - 1) d = sub(points[n - 1], points[n - 2]);
        else d = sub(points[i + 1], points[i - 1]);
        const nd = norm(d);
        t.push((nd[0] || nd[1] || nd[2]) ? nd : (t[i - 1] || [1, 0, 0]));
    }
    return t;
}

// A starting normal perpendicular to t: project a world axis off t. Uses up=(0,1,0), or x if t is near-vertical.
function initialNormal(t) {
    const up = Math.abs(t[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0];
    return norm(sub(up, scale(t, dot(up, t))));
}

// ROTATION-MINIMIZING FRAMES along the points, by Wang et al.'s double-reflection method. Returns per-sample
// { T, N, B } orthonormal, right-handed (B = T x N), with NO accumulated twist about the tangent -- so a straight
// run keeps a constant normal and a tangent that sweeps through vertical never flips. This is the whole reason a
// naive Frenet or fixed-up frame is wrong here.
export function rotationMinimizingFrames(points, seedNormal) {
    const T = tangents(points), n = points.length;
    const N = new Array(n), B = new Array(n);
    N[0] = seedNormal ? norm(sub(seedNormal, scale(T[0], dot(seedNormal, T[0])))) : initialNormal(T[0]);
    if (len(N[0]) < 1e-9) N[0] = initialNormal(T[0]);
    B[0] = norm(cross(T[0], N[0]));
    for (let i = 0; i < n - 1; i++) {
        const v1 = sub(points[i + 1], points[i]);
        const c1 = dot(v1, v1);
        let rL = N[i], tL = T[i];
        if (c1 > 1e-12) { rL = sub(N[i], scale(v1, (2 / c1) * dot(v1, N[i]))); tL = sub(T[i], scale(v1, (2 / c1) * dot(v1, T[i]))); }
        const v2 = sub(T[i + 1], tL);
        const c2 = dot(v2, v2);
        let r = rL;
        if (c2 > 1e-12) r = sub(rL, scale(v2, (2 / c2) * dot(v2, rL)));
        N[i + 1] = norm(r);
        B[i + 1] = norm(cross(T[i + 1], N[i + 1]));
    }
    return points.map((_, i) => ({ T: T[i], N: N[i], B: B[i] }));
}

// The cross-section ring: `ringVerts` unit offsets in the (N, B) plane, an ellipse of radii (rx, ry). Closed loop.
export function profileRing(ringVerts, rx = 1, ry = 1) {
    const out = [];
    for (let j = 0; j < ringVerts; j++) { const a = (j / ringVerts) * Math.PI * 2; out.push([Math.cos(a) * rx, Math.sin(a) * ry]); }
    return out;
}

// Place ONE vertex in world space: sample position + (offset.n * N + offset.b * B) * radius. THE CPU REFERENCE the
// vertex shader mirrors exactly. `frame` is { N, B }; `offset` is a [n, b] entry from profileRing.
export function placeVertex(pos, frame, offset, radius) {
    return add(pos, scale(add(scale(frame.N, offset[0]), scale(frame.B, offset[1])), radius));
}

// The STATIC index-only topology for a tube of `segments` samples around a closed ring of `ringVerts`. Vertex
// (i, j) has flat index i*ringVerts + j. Two triangles per quad, wrapping j. Winding is consistent (CCW seen from
// outside a convex ring). Returns a Uint32Array. Triangle count = 2*(segments-1)*ringVerts.
export function buildRingIndex(segments, ringVerts) {
    const idx = [];
    for (let i = 0; i < segments - 1; i++) {
        for (let j = 0; j < ringVerts; j++) {
            const j1 = (j + 1) % ringVerts;
            const a = i * ringVerts + j, b = i * ringVerts + j1;
            const c = (i + 1) * ringVerts + j, d = (i + 1) * ringVerts + j1;
            idx.push(a, b, c,  b, d, c);   // two triangles of the quad, wound OUTWARD (a,b on ring i; c,d on ring i+1)
        }
    }
    return new Uint32Array(idx);
}

// Pack ONE strand's spine into the RGBA32F data-texture layout the vertex shader samples. Texture is width =
// `count`, height = 3 (three rows): row 0 = (pos.xyz, radius), row 1 = (N.xyz, age), row 2 = (B.xyz, 0). Returns a
// Float32Array of length count*3*4 in row-major order (row0 all columns, then row1, then row2). `radii`/`ages` are
// per-sample arrays (defaulted). A front end copies this block into a bigger multi-strand texture at a row offset.
export function packStrand(samples, frames, opts = {}) {
    const n = samples.length;
    const radii = opts.radii || new Array(n).fill(opts.radius === undefined ? 1 : opts.radius);
    const ages = opts.ages || new Array(n).fill(0);
    const out = new Float32Array(n * 3 * 4);
    for (let i = 0; i < n; i++) {
        const p = samples[i], f = frames[i];
        let o = (0 * n + i) * 4; out[o] = p[0]; out[o + 1] = p[1]; out[o + 2] = p[2]; out[o + 3] = radii[i];
        o = (1 * n + i) * 4;     out[o] = f.N[0]; out[o + 1] = f.N[1]; out[o + 2] = f.N[2]; out[o + 3] = ages[i];
        o = (2 * n + i) * 4;     out[o] = f.B[0]; out[o + 1] = f.B[1]; out[o + 2] = f.B[2]; out[o + 3] = 0;
    }
    return out;
}

// Read a packed strand back (the inverse of packStrand) -- used by the gate to prove the layout round-trips, and a
// convenience for tests. Returns { pos, N, B, radius, age } arrays.
export function unpackStrand(buf, count) {
    const pos = [], N = [], B = [], radius = [], age = [];
    for (let i = 0; i < count; i++) {
        let o = (0 * count + i) * 4; pos.push([buf[o], buf[o + 1], buf[o + 2]]); radius.push(buf[o + 3]);
        o = (1 * count + i) * 4;     N.push([buf[o], buf[o + 1], buf[o + 2]]); age.push(buf[o + 3]);
        o = (2 * count + i) * 4;     B.push([buf[o], buf[o + 1], buf[o + 2]]);
    }
    return { pos, N, B, radius, age };
}
