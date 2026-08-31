// render/meshLine.mjs -- v4225 -- a polyline with real width, real joins, and a width in PIXELS.
//
// The idea is Makio64/makio-meshline's, which is THREE.MeshLine's lineage (MIT): a line is not a line
// primitive, it is a triangle strip, and the sideways offset is applied IN THE VERTEX SHADER so the width can
// be measured in screen pixels rather than world units.
//
// *** WHY THIS EXISTS AT ALL: gl.lineWidth IS CLAMPED TO 1 ON EVERY DESKTOP DRIVER. *** It is in the spec, it
// is not deprecated, and it silently does nothing -- the Core Profile allows an implementation to support
// only a width of 1, and every desktop OpenGL driver takes that option. So `gl.lineWidth(4)` is not a
// thickness control, it is a no-op with a plausible name. Seven places in this tree draw gl.LINES:
// ev/galaxyMap.js (twice), rig/RigSystem.js (twice), demos/p3d/p3dDemo.js, render/entityDebugRenderer.js and
// render/voxelhighlight.js. Every one of them is one pixel wide and cannot be anything else.
//
// *** WHAT THE TREE ALREADY HAD, MEASURED, BECAUSE "NOTHING" WOULD HAVE BEEN WRONG. ***
//   * render/BeamRibbonRenderer.js -- ONE billboarded quad from source to target, width in WORLD units.
//   * render/sweptSpine.js -- a swept TUBE along a spine, radius in world units.
// Both are useful and neither is this. A single quad has no JOINT, so it never meets the problem below; and a
// world-space width means a line thins with distance, which is exactly what gl.lineWidth was supposed to
// avoid. There is no miter or bevel anywhere in the tree, and nothing measures a width in pixels.
"use strict";

export const DEFAULTS = Object.freeze({ width: 4, miterLimit: 4, closed: false });

/** Squared length, and a safe normalise that reports rather than returning NaN. */
const len2 = (x, y, z) => x * x + y * y + z * z;
export function normalise(v) {
    const L = Math.sqrt(len2(v[0], v[1], v[2]));
    return L > 1e-12 ? [v[0] / L, v[1] / L, v[2] / L] : null;
}

/**
 * Drop consecutive duplicates.
 *
 * *** A REPEATED POINT IS A ZERO-LENGTH SEGMENT, AND ITS DIRECTION IS 0/0. *** That NaN propagates into the
 * miter, into the vertex position, and out to the GPU, where the whole strip vanishes -- one degenerate point
 * in a thousand takes the entire line with it. Paths that come from a mouse, from a resampler, or from a
 * physics trail routinely contain them.
 */
export function dedupe(points, eps = 1e-9) {
    const out = [];
    for (const p of points) {
        const q = out[out.length - 1];
        if (!q || len2(p[0] - q[0], p[1] - q[1], p[2] - q[2]) > eps * eps) out.push([p[0], p[1], p[2]]);
    }
    return out;
}

/**
 * How far the outer corner of a miter joint sits from the path, as a multiple of half the width.
 *
 * For unit segment directions d1 and d2, the joint's outward direction bisects them and the offset needed to
 * keep both edges parallel to their segments is 1 / cos(theta/2), where theta is the turn angle.
 *
 * *** THIS DIVERGES. *** A path that doubles back on itself has theta -> 180 degrees, cos(theta/2) -> 0, and
 * the miter shoots off to infinity: the famous spike. It is not a rare input -- a trail that reverses, a
 * resampled curve with a cusp, or any hand-drawn stroke with a sharp return produces it. Every renderer that
 * draws wide lines has to cap this, which is what miterLimit is for.
 */
export function miterFactor(d1, d2) {
    const dot = d1[0] * d2[0] + d1[1] * d2[1] + d1[2] * d2[2];
    const c = Math.max(-1, Math.min(1, dot));
    const half = Math.acos(c) / 2;                       // theta/2, where theta is the TURN from d1 to d2
    const cosHalf = Math.cos(half);
    return cosHalf > 1e-9 ? 1 / cosHalf : Infinity;
}

/** Does this joint exceed the limit, and therefore need a bevel instead of a miter? */
export function shouldBevel(d1, d2, miterLimit = DEFAULTS.miterLimit) {
    const f = miterFactor(d1, d2);
    return !(f <= miterLimit);                            // NaN and Infinity both bevel
}

/** The turn angle at a joint, in radians. 0 is straight on, PI is a full reversal. */
export function turnAngle(d1, d2) {
    const dot = d1[0] * d2[0] + d1[1] * d2[1] + d1[2] * d2[2];
    return Math.acos(Math.max(-1, Math.min(1, dot)));
}

/**
 * Expand a polyline into the attribute buffers for a triangle strip.
 *
 * Each input point becomes TWO vertices with side = +1 and -1. The offset itself is NOT applied here: the
 * vertex shader does it, after projection, which is what makes the width a number of PIXELS rather than a
 * number of world units. That is also why `previous` and `next` are attributes -- the shader needs the
 * neighbouring points to know which way is sideways, and it cannot read other vertices.
 *
 * @returns { position, previous, next, side, along, index, count, points }
 */
export function expandPolyline(rawPoints, opts = {}) {
    const o = { ...DEFAULTS, ...opts };
    let pts = dedupe(rawPoints || []);
    if (o.closed && pts.length > 1) {
        const a = pts[0], b = pts[pts.length - 1];
        if (len2(a[0] - b[0], a[1] - b[1], a[2] - b[2]) > 1e-18) pts = pts.concat([[a[0], a[1], a[2]]]);
    }
    const n = pts.length;
    if (n < 2) return { position: new Float32Array(0), previous: new Float32Array(0), next: new Float32Array(0),
                        side: new Float32Array(0), along: new Float32Array(0), index: new Uint32Array(0),
                        count: 0, points: n };

    // arc length, so a dash pattern or a texture can be laid along the line
    const arc = new Float64Array(n);
    for (let i = 1; i < n; i++) {
        const a = pts[i - 1], b = pts[i];
        arc[i] = arc[i - 1] + Math.sqrt(len2(b[0] - a[0], b[1] - a[1], b[2] - a[2]));
    }
    const total = arc[n - 1] || 1;

    const position = new Float32Array(n * 2 * 3);
    const previous = new Float32Array(n * 2 * 3);
    const next = new Float32Array(n * 2 * 3);
    const side = new Float32Array(n * 2);
    const along = new Float32Array(n * 2);
    for (let i = 0; i < n; i++) {
        // *** THE ENDS BORROW THEIR NEIGHBOUR RATHER THAN REPEATING THEMSELVES. *** previous[0] = points[0]
        // would give the first vertex a zero-length direction -- the same 0/0 dedupe exists to prevent -- so
        // the first point's "previous" is extrapolated backwards along the first segment, and likewise at the
        // end. A closed path takes its neighbour from the far end instead, which is what makes the seam join.
        const prev = i > 0 ? pts[i - 1]
            : (o.closed ? pts[n - 2] : [2 * pts[0][0] - pts[1][0], 2 * pts[0][1] - pts[1][1], 2 * pts[0][2] - pts[1][2]]);
        const nxt = i < n - 1 ? pts[i + 1]
            : (o.closed ? pts[1] : [2 * pts[n - 1][0] - pts[n - 2][0], 2 * pts[n - 1][1] - pts[n - 2][1], 2 * pts[n - 1][2] - pts[n - 2][2]]);
        for (const s of [0, 1]) {
            const v = i * 2 + s, b3 = v * 3;
            position[b3] = pts[i][0]; position[b3 + 1] = pts[i][1]; position[b3 + 2] = pts[i][2];
            previous[b3] = prev[0]; previous[b3 + 1] = prev[1]; previous[b3 + 2] = prev[2];
            next[b3] = nxt[0]; next[b3 + 1] = nxt[1]; next[b3 + 2] = nxt[2];
            side[v] = s === 0 ? 1 : -1;
            along[v] = arc[i] / total;
        }
    }
    // two triangles per segment, wound consistently
    const segs = n - 1;
    const index = new Uint32Array(segs * 6);
    for (let i = 0; i < segs; i++) {
        const a = i * 2, b = a + 1, c = a + 2, d = a + 3;
        index.set([a, b, c, c, b, d], i * 6);
    }
    return { position, previous, next, side, along, index, count: index.length, points: n };
}

/** The joints of a path, classified. For a caller deciding whether a bevel or round join is worth adding. */
export function jointsOf(points, miterLimit = DEFAULTS.miterLimit) {
    const pts = dedupe(points);
    const out = [];
    for (let i = 1; i < pts.length - 1; i++) {
        const d1 = normalise([pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1], pts[i][2] - pts[i - 1][2]]);
        const d2 = normalise([pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1], pts[i + 1][2] - pts[i][2]]);
        if (!d1 || !d2) continue;
        const f = miterFactor(d1, d2);
        out.push({ at: i, turn: turnAngle(d1, d2), miter: f, bevel: !(f <= miterLimit) });
    }
    return out;
}

/**
 * The vertex shader. The offset is applied AFTER projection, in clip space scaled by the viewport, which is
 * what makes `uWidth` a number of pixels that does not change with distance.
 *
 * The aspect correction is not decoration: clip space is square and the viewport is not, so offsetting by a
 * raw clip-space vector makes a line thicker vertically than horizontally on a wide window.
 */
export const MESHLINE_VS = `#version 300 es
precision highp float;
in vec3 aPosition;
in vec3 aPrevious;
in vec3 aNext;
in float aSide;
in float aAlong;
uniform mat4 uViewProj;
uniform vec2 uResolution;
uniform float uWidth;          // in PIXELS
out float vAlong;
vec2 toScreen(vec4 clip) { return clip.xy / max(clip.w, 1e-6) * uResolution * 0.5; }
void main() {
    vec4 cur  = uViewProj * vec4(aPosition, 1.0);
    vec4 prev = uViewProj * vec4(aPrevious, 1.0);
    vec4 nxt  = uViewProj * vec4(aNext, 1.0);
    vec2 sCur = toScreen(cur), sPrev = toScreen(prev), sNext = toScreen(nxt);
    vec2 dirA = sCur - sPrev;
    vec2 dirB = sNext - sCur;
    float lA = length(dirA), lB = length(dirB);
    dirA = lA > 1e-6 ? dirA / lA : vec2(1.0, 0.0);
    dirB = lB > 1e-6 ? dirB / lB : dirA;
    vec2 dir = normalize(dirA + dirB);
    vec2 nrm = vec2(-dir.y, dir.x);
    // the miter scale, capped: 1/cos(theta/2) is dot(nrm, normal of segment A)
    vec2 nA = vec2(-dirA.y, dirA.x);
    float m = dot(nrm, nA);
    float scale = abs(m) > 0.25 ? 1.0 / m : 4.0;      // 4.0 is the miter limit, matching DEFAULTS
    vec2 offset = nrm * aSide * uWidth * 0.5 * scale;
    cur.xy += offset / (uResolution * 0.5) * cur.w;
    vAlong = aAlong;
    gl_Position = cur;
}`;

export const MESHLINE_FS = `#version 300 es
precision highp float;
in float vAlong;
uniform vec4 uColor;
uniform float uDash;           // 0 = solid; otherwise the period in units of the line's length
out vec4 fragColor;
void main() {
    if (uDash > 0.0 && fract(vAlong / uDash) > 0.5) discard;
    fragColor = uColor;
}`;

export default expandPolyline;
