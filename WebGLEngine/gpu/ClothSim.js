// FILE: gpu/ClothSim.js
// VERSION: v870 — Reusable cloth simulator
//
// Pure-CPU cloth physics, extracted from robotFaceAvatar.js so the
// algorithm can be reused by multiple systems:
//   - Avatar cape + magic carpet (the original use; v865-v869)
//   - Stream weapon ribbons (v871, planned)
//   - Kaiju / OGRE defensive cape-shields (v872, planned)
//   - Any future cloth-like effect
//
// The module exports a ClothSimulator class + a grid-edges helper.
//
// SEPARATION OF CONCERNS
// ─────────────────────
// ClothSimulator handles VERLET, CONSTRAINT RELAXATION, COLLISION,
// FACE-NORMAL RECOMPUTE — pure math on CPU arrays.
//
// The CALLER handles:
//   - Computing pin anchor world positions each frame (from bone
//     matrices, from gun-barrel transforms, from a kaiju position +
//     facing — whatever the use case needs) and passing them to step().
//   - Computing collider world centers (similarly) and passing them
//     via setColliders() before step().
//   - Uploading the simulator's positions/normals buffers to its GPU
//     pipeline however that pipeline likes.
//
// This split means ClothSimulator has zero coupling to WebGL, to
// avatars, to bones, to any particular renderer. It's a self-
// contained physics utility.
//
// ALGORITHM
// ─────────
// Standard Verlet cloth simulation:
//   1. For each non-pinned vert: newPos = pos + (pos - prevPos) * damping + accel * dt²
//      Acceleration = gravity (world -Y) + wind (configurable).
//   2. Hard-pin: pinned verts are overwritten with caller-supplied anchors.
//   3. Constraint relaxation: for ITERS passes, walk distance constraints
//      (edges from grid neighbors), push endpoints to maintain rest length.
//      Pinned ends absorb 0 correction; free ends absorb full; both-free
//      ends split.
//   4. Collision: for each sphere collider, push intruding non-pinned
//      verts to the sphere surface along the radial vector. Nudges
//      prevPos toward current so verlet velocity reflects the deflection.
//   5. Face-normal recompute: walk triangles, accumulate area-weighted
//      face normals into vertex slots, normalize.
//
// ───────────────────────────────────────────────────────────────

// ─── Default constants (matching the v865-v868 cape sim) ───────
const DEFAULT_GRAVITY  = -2.4;       // units / sec²; gentle (full Earth feels aggressive at this scale)
const DEFAULT_DAMPING  = 0.92;
const DEFAULT_ITERS    = 6;
const DEFAULT_DT_FIXED = 1 / 60;     // numerical stability independent of frame rate

export class ClothSimulator {
    /**
     * @param {Object} opts
     * @param {Float32Array} opts.positions       — initial vertex positions (bind-pose local space)
     * @param {Uint32Array}  opts.indices         — triangle index list (3 per triangle)
     * @param {Array<number>} opts.pinnedIndices  — vert indices that are pinned (caller controls their positions)
     * @param {Array<[number, number, number]>} opts.edges — distance constraints: [i, j, restLength]
     * @param {number} [opts.gravity]   — default -2.4
     * @param {number} [opts.damping]   — default 0.92
     * @param {number} [opts.iters]     — default 6
     * @param {number} [opts.dtFixed]   — default 1/60
     */
    constructor(opts) {
        if (!opts || !opts.positions || !opts.indices) {
            throw new Error("ClothSimulator: positions + indices required");
        }
        this.vertCount = opts.positions.length / 3;
        // Bind-pose local positions; useful for callers that want to
        // re-transform pin anchors but we don't actually use bindLocal
        // internally during step() — caller provides anchors directly.
        this.bindLocal = new Float32Array(opts.positions);
        this.indices = new Uint32Array(opts.indices);
        this.pinnedIndices = Array.from(opts.pinnedIndices || []);
        this.pinnedSet = new Set(this.pinnedIndices);
        this.edges = opts.edges || [];

        // Working buffers — caller uploads these to GPU each frame
        this.worldPos     = new Float32Array(opts.positions.length);
        this.prevWorldPos = new Float32Array(opts.positions.length);
        this.normals      = new Float32Array(opts.positions.length);

        // Config
        this.gravity = (opts.gravity ?? DEFAULT_GRAVITY);
        this.damping = (opts.damping ?? DEFAULT_DAMPING);
        this.iters   = (opts.iters   ?? DEFAULT_ITERS);
        this.dtFixed = (opts.dtFixed ?? DEFAULT_DT_FIXED);

        // Optional state — set via setWind / setColliders
        this.wind = null;
        this.colliders = [];
        this.collisionEnabled = true;

        // Did we initialize from world positions yet?
        this.initialized = false;
    }

    /**
     * Provide the initial world-space positions for ALL vertices.
     * Sets both worldPos and prevWorldPos (zero initial velocity).
     * Must be called before the first step().
     * @param {Float32Array} initialWorldPositions — length = vertCount × 3
     */
    initialize(initialWorldPositions) {
        if (initialWorldPositions.length !== this.worldPos.length) {
            throw new Error("ClothSimulator.initialize: length mismatch");
        }
        this.worldPos.set(initialWorldPositions);
        this.prevWorldPos.set(initialWorldPositions);
        this.initialized = true;
    }

    /**
     * Set the wind vector. Pass null to disable wind, or an object:
     *   { enabled, strength, baseX, baseY, baseZ, sineAmpX, sineAmpZ, sineFreq }
     * Wind acceleration in world space; same units as gravity.
     */
    setWind(w) {
        this.wind = w || null;
    }

    /**
     * Set the active collider list. Each entry is a world-space sphere:
     *   { cx, cy, cz, radius }   (already transformed to world by caller)
     * Pass empty array to disable collision.
     */
    setColliders(arr) {
        this.colliders = Array.isArray(arr) ? arr : [];
    }

    setCollisionEnabled(b) { this.collisionEnabled = !!b; }

    /**
     * Run one simulation step.
     *
     * @param {Float32Array} pinAnchors — world positions for pinned verts,
     *                                    length = pinnedIndices.length × 3,
     *                                    interleaved xyz in pinnedIndices order.
     * @param {number} [dtOverride]     — override the fixed timestep (rarely needed).
     */
    step(pinAnchors, dtOverride) {
        if (!this.initialized) {
            throw new Error("ClothSimulator.step: call initialize() first");
        }
        if (pinAnchors.length !== this.pinnedIndices.length * 3) {
            throw new Error("ClothSimulator.step: pinAnchors length mismatch");
        }

        const wp        = this.worldPos;
        const prev      = this.prevWorldPos;
        const pinnedSet = this.pinnedSet;
        const dt        = dtOverride || this.dtFixed;
        const dt2       = dt * dt;
        const gravStep  = this.gravity * dt2;
        const damping   = this.damping;

        // ─── Step 1: verlet for non-pinned verts ───────────────────
        // Compute wind acceleration this frame (constant + sine).
        let windX = 0, windY = 0, windZ = 0;
        if (this.wind && this.wind.enabled && this.wind.strength > 0) {
            const t = performance.now() * 0.001 * (this.wind.sineFreq || 0) * Math.PI * 2;
            const sineX = (this.wind.sineAmpX || 0) * Math.sin(t);
            const sineZ = (this.wind.sineAmpZ || 0) * Math.sin(t * 1.3 + 0.7);
            const s = this.wind.strength;
            windX = ((this.wind.baseX || 0) + sineX) * s * dt2;
            windY = ((this.wind.baseY || 0))         * s * dt2;
            windZ = ((this.wind.baseZ || 0) + sineZ) * s * dt2;
        }
        for (let i = 0; i < this.vertCount; i++) {
            if (pinnedSet.has(i)) continue;
            const i3 = i * 3;
            const px = wp[i3 + 0], py = wp[i3 + 1], pz = wp[i3 + 2];
            const ox = prev[i3 + 0], oy = prev[i3 + 1], oz = prev[i3 + 2];
            const nx = px + (px - ox) * damping + windX;
            const ny = py + (py - oy) * damping + gravStep + windY;
            const nz = pz + (pz - oz) * damping + windZ;
            prev[i3 + 0] = px;
            prev[i3 + 1] = py;
            prev[i3 + 2] = pz;
            wp[i3 + 0] = nx;
            wp[i3 + 1] = ny;
            wp[i3 + 2] = nz;
        }

        // ─── Step 2: hard-pin to caller-supplied anchors ───────────
        for (let k = 0; k < this.pinnedIndices.length; k++) {
            const i = this.pinnedIndices[k];
            const i3 = i * 3, k3 = k * 3;
            wp[i3 + 0]   = pinAnchors[k3 + 0];
            wp[i3 + 1]   = pinAnchors[k3 + 1];
            wp[i3 + 2]   = pinAnchors[k3 + 2];
            prev[i3 + 0] = pinAnchors[k3 + 0];
            prev[i3 + 1] = pinAnchors[k3 + 1];
            prev[i3 + 2] = pinAnchors[k3 + 2];
        }

        // ─── Step 3: constraint relaxation ─────────────────────────
        const edges = this.edges;
        for (let iter = 0; iter < this.iters; iter++) {
            for (let ei = 0; ei < edges.length; ei++) {
                const e = edges[ei];
                const i = e[0], j = e[1], rest = e[2];
                const i3 = i * 3, j3 = j * 3;
                const ax = wp[i3 + 0], ay = wp[i3 + 1], az = wp[i3 + 2];
                const bx = wp[j3 + 0], by = wp[j3 + 1], bz = wp[j3 + 2];
                const dx = bx - ax, dy = by - ay, dz = bz - az;
                const d  = Math.hypot(dx, dy, dz) || 0.0001;
                const diff = (d - rest) / d;
                const iPin = pinnedSet.has(i);
                const jPin = pinnedSet.has(j);
                if (iPin && jPin) continue;
                const halfDX = dx * 0.5 * diff;
                const halfDY = dy * 0.5 * diff;
                const halfDZ = dz * 0.5 * diff;
                if (iPin) {
                    wp[j3 + 0] -= halfDX * 2;
                    wp[j3 + 1] -= halfDY * 2;
                    wp[j3 + 2] -= halfDZ * 2;
                } else if (jPin) {
                    wp[i3 + 0] += halfDX * 2;
                    wp[i3 + 1] += halfDY * 2;
                    wp[i3 + 2] += halfDZ * 2;
                } else {
                    wp[i3 + 0] += halfDX;
                    wp[i3 + 1] += halfDY;
                    wp[i3 + 2] += halfDZ;
                    wp[j3 + 0] -= halfDX;
                    wp[j3 + 1] -= halfDY;
                    wp[j3 + 2] -= halfDZ;
                }
            }
        }

        // ─── Step 4: sphere collision ──────────────────────────────
        if (this.collisionEnabled && this.colliders.length > 0) {
            for (const collider of this.colliders) {
                const cx = collider.cx, cy = collider.cy, cz = collider.cz;
                const r = collider.radius;
                const r2 = r * r;
                for (let i = 0; i < this.vertCount; i++) {
                    if (pinnedSet.has(i)) continue;
                    const i3 = i * 3;
                    const dx = wp[i3 + 0] - cx;
                    const dy = wp[i3 + 1] - cy;
                    const dz = wp[i3 + 2] - cz;
                    const d2 = dx * dx + dy * dy + dz * dz;
                    if (d2 >= r2 || d2 < 1e-9) continue;
                    const d = Math.sqrt(d2);
                    const k = r / d;
                    wp[i3 + 0]   = cx + dx * k;
                    wp[i3 + 1]   = cy + dy * k;
                    wp[i3 + 2]   = cz + dz * k;
                    prev[i3 + 0] = wp[i3 + 0] - dx * 0.05;
                    prev[i3 + 1] = wp[i3 + 1] - dy * 0.05;
                    prev[i3 + 2] = wp[i3 + 2] - dz * 0.05;
                }
            }
        }

        // ─── Step 5: face-normal recompute ─────────────────────────
        const normals = this.normals;
        for (let i = 0; i < normals.length; i++) normals[i] = 0;
        const idx = this.indices;
        for (let t = 0; t < idx.length; t += 3) {
            const ia = idx[t]     * 3;
            const ib = idx[t + 1] * 3;
            const ic = idx[t + 2] * 3;
            const e1x = wp[ib + 0] - wp[ia + 0];
            const e1y = wp[ib + 1] - wp[ia + 1];
            const e1z = wp[ib + 2] - wp[ia + 2];
            const e2x = wp[ic + 0] - wp[ia + 0];
            const e2y = wp[ic + 1] - wp[ia + 1];
            const e2z = wp[ic + 2] - wp[ia + 2];
            const fnx = e1y * e2z - e1z * e2y;
            const fny = e1z * e2x - e1x * e2z;
            const fnz = e1x * e2y - e1y * e2x;
            normals[ia + 0] += fnx; normals[ia + 1] += fny; normals[ia + 2] += fnz;
            normals[ib + 0] += fnx; normals[ib + 1] += fny; normals[ib + 2] += fnz;
            normals[ic + 0] += fnx; normals[ic + 1] += fny; normals[ic + 2] += fnz;
        }
        for (let i = 0; i < normals.length; i += 3) {
            const nx = normals[i + 0], ny = normals[i + 1], nz = normals[i + 2];
            const len = Math.hypot(nx, ny, nz);
            if (len > 1e-7) {
                normals[i + 0] = nx / len;
                normals[i + 1] = ny / len;
                normals[i + 2] = nz / len;
            }
        }
    }
}

/**
 * Build distance constraints (edges) from a rectangular grid layout.
 * Horizontal neighbors + vertical neighbors. Returns Array<[i, j, restLen]>
 * suitable for ClothSimulator.edges.
 *
 * @param {Float32Array} positions — xyz per vertex
 * @param {number} rows
 * @param {number} cols
 * @returns {Array<[number, number, number]>}
 */
export function buildGridEdges(positions, rows, cols) {
    const edges = [];
    const stride = cols + 1;
    const dist = (i, j) => {
        const dx = positions[i * 3 + 0] - positions[j * 3 + 0];
        const dy = positions[i * 3 + 1] - positions[j * 3 + 1];
        const dz = positions[i * 3 + 2] - positions[j * 3 + 2];
        return Math.hypot(dx, dy, dz);
    };
    for (let r = 0; r <= rows; r++) {
        for (let c = 0; c <= cols; c++) {
            const idx = r * stride + c;
            if (c < cols) {
                const right = r * stride + c + 1;
                edges.push([idx, right, dist(idx, right)]);
            }
            if (r < rows) {
                const down = (r + 1) * stride + c;
                edges.push([idx, down, dist(idx, down)]);
            }
        }
    }
    return edges;
}

/**
 * Helper to transform a single point through a column-major 4×4 matrix.
 * Useful for callers computing pin anchors from bone matrices.
 */
export function transformPoint(m, x, y, z, out, outOffset = 0) {
    out[outOffset + 0] = m[0]*x + m[4]*y + m[8]*z  + m[12];
    out[outOffset + 1] = m[1]*x + m[5]*y + m[9]*z  + m[13];
    out[outOffset + 2] = m[2]*x + m[6]*y + m[10]*z + m[14];
}
