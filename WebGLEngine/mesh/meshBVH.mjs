// mesh/meshBVH.mjs -- v4221 -- one ray-triangle kernel, and a tree so it is not called for every triangle.
//
// Taken from gkjohnson/three-mesh-bvh (MIT). What is taken is the ACCELERATION STRUCTURE -- binned-SAH build,
// stackless-ish traversal with near-child-first ordering and best-t pruning -- and not the three.js binding,
// because this tree's two ray casters are not three.js meshes.
//
// *** MEASURED BEFORE BUILDING: THE TREE RAYCASTS TRIANGLES BY BRUTE FORCE, IN TWO SEPARATE PLACES, WITH NO
// ACCELERATION STRUCTURE ANYWHERE. *** multiplayer/wadLevelHost.js:180 walks a flat Float32Array of wall
// triangles for an occlusion test; tools/krbn/krbnCompare.js:84 walks an indexed mesh for a nearest hit. They
// are independent implementations of the same Moller-Trumbore intersection and they disagree in three ways
// that each matter:
//
//   * DATA LAYOUT  -- a flat 9-floats-per-triangle buffer, versus arrays of [x,y,z] with an index triple.
//   * EPSILON      -- 1e-6 on the determinant, versus 1e-9 with a separate 1e-6 on the barycentrics.
//   * QUERY        -- ANY hit within a SEGMENT and early out, versus the NEAREST hit along an infinite ray.
//
// The third is the reason a single "raycast" function would have been the wrong unification: an occlusion
// test that computes the nearest hit does strictly more work than it needs, and a nearest-hit query that
// early-outs is wrong. So there is one KERNEL and two QUERIES over it.
"use strict";

/** The kernel. Moller-Trumbore, watertight in the sense that the barycentric tests use one consistent epsilon. */
export const EPS = 1e-9;

/**
 * Ray against one triangle. Returns the ray parameter t, or null.
 * `tris` is a flat buffer, `i` the index of this triangle's first float.
 */
export function rayTriangle(ox, oy, oz, dx, dy, dz, tris, i, eps = EPS, detRel = undefined) {
    const ax = tris[i], ay = tris[i + 1], az = tris[i + 2];
    const e1x = tris[i + 3] - ax, e1y = tris[i + 4] - ay, e1z = tris[i + 5] - az;
    const e2x = tris[i + 6] - ax, e2y = tris[i + 7] - ay, e2z = tris[i + 8] - az;
    const px = dy * e2z - dz * e2y, py = dz * e2x - dx * e2z, pz = dx * e2y - dy * e2x;
    const det = e1x * px + e1y * py + e1z * pz;
    // det is an AREA (|e1||e2| x the sine of their angle x the cosine of the ray's angle to the normal), and `eps` is
    // a length: the default test rejects every triangle with edges under ~sqrt(eps) whatever the ray's angle. A caller
    // passing `detRel` gets the dimensionless test instead -- parallel iff |det| <= detRel x |e1| x |e2| -- see
    // physics/mesh/meshPointClassify.mjs (BVH-CSG round 11), the one caller that needs it. The default is unchanged.
    if (detRel === undefined) { if (det > -eps && det < eps) return null; }   // ray parallel to the triangle's plane
    else if (det * det <= detRel * detRel * (e1x * e1x + e1y * e1y + e1z * e1z) * (e2x * e2x + e2y * e2y + e2z * e2z)) return null;
    const inv = 1 / det;
    const tx = ox - ax, ty = oy - ay, tz = oz - az;
    const u = (tx * px + ty * py + tz * pz) * inv;
    if (u < 0 || u > 1) return null;
    const qx = ty * e1z - tz * e1y, qy = tz * e1x - tx * e1z, qz = tx * e1y - ty * e1x;
    const v = (dx * qx + dy * qy + dz * qz) * inv;
    if (v < 0 || u + v > 1) return null;
    const t = (e2x * qx + e2y * qy + e2z * qz) * inv;
    return t > eps ? t : null;
}

/** Barycentric (u,v) of the hit, for a caller that needs where on the triangle it landed. */
export function baryAt(tris, i, px, py, pz) {
    const ax = tris[i], ay = tris[i + 1], az = tris[i + 2];
    const e1x = tris[i + 3] - ax, e1y = tris[i + 4] - ay, e1z = tris[i + 5] - az;
    const e2x = tris[i + 6] - ax, e2y = tris[i + 7] - ay, e2z = tris[i + 8] - az;
    const vx = px - ax, vy = py - ay, vz = pz - az;
    const d11 = e1x * e1x + e1y * e1y + e1z * e1z, d12 = e1x * e2x + e1y * e2y + e1z * e2z;
    const d22 = e2x * e2x + e2y * e2y + e2z * e2z;
    const dp1 = vx * e1x + vy * e1y + vz * e1z, dp2 = vx * e2x + vy * e2y + vz * e2z;
    const den = d11 * d22 - d12 * d12;
    if (!den) return [1, 0, 0];
    const v = (d22 * dp1 - d12 * dp2) / den, w = (d11 * dp2 - d12 * dp1) / den;
    return [1 - v - w, v, w];
}

/**
 * The triangle's own face normal: cross(e1, e2), normalized. The SAME formula physics/render/rtPipeline.mjs's
 * WGSL rtTriNormal() computes on the GPU (its own header names the same restatement for rtVertColor/baryAt --
 * a shared formula on both sides of the CPU/GPU boundary, not a second declaration of a shared algorithm).
 * Exported here so a CPU reference tracer that walks this class's own raycastFirst() can shade what it hits
 * without a second, drifting copy of the cross product.
 *
 * NAME COLLISION, NOTED RATHER THAN HIDDEN: physics/mesh/uvLscm.mjs exports its own `triNormal(P, T)` -- a
 * DIFFERENT signature (nested [x,y,z] positions plus a separate triangle index triple, returning {n, area2})
 * for a different caller. No import ever collides (nothing imports both under the same name), but a reader
 * grepping "triNormal" will find two; `i` here is always a FLOAT OFFSET into a flat buffer, matching
 * rayTriangle/baryAt's own convention in this file, never a positions/indices pair.
 */
export function triNormal(tris, i) {
    const ax = tris[i], ay = tris[i + 1], az = tris[i + 2];
    const e1x = tris[i + 3] - ax, e1y = tris[i + 4] - ay, e1z = tris[i + 5] - az;
    const e2x = tris[i + 6] - ax, e2y = tris[i + 7] - ay, e2z = tris[i + 8] - az;
    const nx = e1y * e2z - e1z * e2y, ny = e1z * e2x - e1x * e2z, nz = e1x * e2y - e1y * e2x;
    const l = Math.hypot(nx, ny, nz) || 1;
    return [nx / l, ny / l, nz / l];
}

/** Flatten an indexed mesh -- positions as [[x,y,z],...] and triangles as [[i,j,k],...] -- into the buffer. */
export function trianglesFrom(positions, indices) {
    const out = new Float64Array(indices.length * 9);
    for (let n = 0; n < indices.length; n++) {
        const [i, j, k] = indices[n];
        const A = positions[i], B = positions[j], C = positions[k];
        const o = n * 9;
        out[o] = A[0]; out[o + 1] = A[1]; out[o + 2] = A[2];
        out[o + 3] = B[0]; out[o + 4] = B[1]; out[o + 5] = B[2];
        out[o + 6] = C[0]; out[o + 7] = C[1]; out[o + 8] = C[2];
    }
    return out;
}

const AXIS = 3;

/**
 * A bounding volume hierarchy over a flat triangle buffer.
 *
 * Nodes live in typed arrays rather than objects: `bounds` holds six floats per node and `meta` holds three
 * ints. A LEAF is marked by meta[0] < 0 and carries (start, count) in meta[1..2]; an INTERIOR node carries
 * (left, right) in meta[0..1].
 *
 * *** BOTH CHILD INDICES ARE STORED, AND ASSUMING right === left + 1 IS A REAL BUG I WROTE. *** In a
 * depth-first build the left call allocates its ENTIRE SUBTREE before returning, so the right child sits at
 * whatever the node counter reached afterwards -- never at left+1 except for the shallowest leaves. With the
 * assumption in place the traversal descended into arbitrary interior nodes and the whole tree MISSED:
 * measured, 0 hits out of 13 rays that brute force found, while running 63x "faster" because it was
 * traversing nonsense and finding nothing.
 */
export class MeshBVH {
    constructor(tris, opts = {}) {
        this.tris = tris;
        this.count = (tris.length / 9) | 0;
        this.maxLeaf = opts.maxLeaf || 8;
        this.bins = opts.bins || 12;
        this.order = new Int32Array(this.count);
        for (let i = 0; i < this.count; i++) this.order[i] = i;
        // centroid per triangle, computed once -- the build sorts on these, never on the vertices
        this._cent = new Float64Array(this.count * 3);
        for (let n = 0; n < this.count; n++) {
            const o = n * 9;
            this._cent[n * 3] = (tris[o] + tris[o + 3] + tris[o + 6]) / 3;
            this._cent[n * 3 + 1] = (tris[o + 1] + tris[o + 4] + tris[o + 7]) / 3;
            this._cent[n * 3 + 2] = (tris[o + 2] + tris[o + 5] + tris[o + 8]) / 3;
        }
        const maxNodes = Math.max(1, 2 * this.count);
        this.bounds = new Float64Array(maxNodes * 6);
        this.meta = new Int32Array(maxNodes * 3);
        this.nodes = 0;
        this.leaves = 0;
        this.depth = 0;
        if (this.count) this._build(0, this.count, 0);
        else { this.nodes = 1; this.meta[1] = 0; this.meta[2] = 0; for (let k = 0; k < 6; k++) this.bounds[k] = k < 3 ? Infinity : -Infinity; }
    }

    _boundsOf(start, end, out) {
        let x0 = Infinity, y0 = Infinity, z0 = Infinity, x1 = -Infinity, y1 = -Infinity, z1 = -Infinity;
        for (let s = start; s < end; s++) {
            const o = this.order[s] * 9;
            for (let c = 0; c < 3; c++) {
                const x = this.tris[o + c * 3], y = this.tris[o + c * 3 + 1], z = this.tris[o + c * 3 + 2];
                if (x < x0) x0 = x; if (x > x1) x1 = x;
                if (y < y0) y0 = y; if (y > y1) y1 = y;
                if (z < z0) z0 = z; if (z > z1) z1 = z;
            }
        }
        out[0] = x0; out[1] = y0; out[2] = z0; out[3] = x1; out[4] = y1; out[5] = z1;
    }

    // *** BVH-CSG ROUND 15: THE SAME TREE, BUILT WITHOUT ITS WASTE. *** The page's blast rebuilds this over the whole
    // wall every shot, and on a 13,448-triangle wall the build was 21.8 ms of a 41 ms pin-prick shot. Four changes, each
    // a reorganisation of exact operations, so `order`, `bounds` and `meta` come out bit for bit as before (min and max
    // are exact; the SAH sums are formed from the same operands in the same order -- tools/ship/meshBVH-selfcheck.mjs
    // holds the tree against a frozen copy of the old build): (1) no typed array allocated per node -- the bin scratch is
    // reused, as nothing reads it after the partition; (2) the chosen axis's centroid range is kept, not scanned twice;
    // (3) the split sweep is prefix/suffix, O(bins) rather than O(bins^2); (4) a child's bounds are the union of its
    // side's bins -- exactly the min/max of its triangles' vertices -- instead of a second pass over them (the
    // rank-split fallback still scans).
    _build(start, end, depth, pre = null) {
        const node = this.nodes++;
        if (depth > this.depth) this.depth = depth;
        const o6 = node * 6;
        if (pre) for (let k = 0; k < 6; k++) this.bounds[o6 + k] = pre[k];
        else {
            const b = this._b6 || (this._b6 = new Float64Array(6));
            this._boundsOf(start, end, b);
            this.bounds.set(b, o6);
        }
        const n = end - start;
        if (n <= this.maxLeaf) { this.meta[node * 3] = -1; this.meta[node * 3 + 1] = start; this.meta[node * 3 + 2] = n; this.leaves++; return node; }

        // *** BINNED SAH, AND THE FALLBACK MATTERS AS MUCH AS THE SPLIT. *** When every centroid coincides --
        // coplanar fans, or a mesh of degenerate triangles -- no split separates anything, every SAH cost is
        // equal, and a naive "best bin" returns an empty side. That recurses on the same range forever. If no
        // bin split is valid the range is halved by rank instead, which always terminates.
        const cent = this._cent, order = this.order, tris = this.tris;
        let axis = 0, extent = -1, lo = 0, hi = 0;
        for (let a = 0; a < AXIS; a++) {
            let l = Infinity, h = -Infinity;
            for (let s = start; s < end; s++) { const c = cent[order[s] * 3 + a]; if (c < l) l = c; if (c > h) h = c; }
            if (h - l > extent) { extent = h - l; axis = a; lo = l; hi = h; }
        }
        let mid = -1, leftB = null, rightB = null;
        if (extent > 0) {
            const B = this.bins, scale = B / (hi - lo);
            if (!this._cnt || this._cnt.length !== B) {
                this._cnt = new Int32Array(B); this._bb = new Float64Array(B * 6);
                this._pre = new Float64Array((B + 1) * 6); this._suf = new Float64Array((B + 1) * 6);
                this._pc = new Int32Array(B + 1); this._sc = new Int32Array(B + 1);
            }
            const cnt = this._cnt, bb = this._bb;
            cnt.fill(0);
            for (let i = 0; i < B; i++) { bb[i * 6] = bb[i * 6 + 1] = bb[i * 6 + 2] = Infinity; bb[i * 6 + 3] = bb[i * 6 + 4] = bb[i * 6 + 5] = -Infinity; }
            for (let s = start; s < end; s++) {
                const t = order[s];
                let bi = ((cent[t * 3 + axis] - lo) * scale) | 0; if (bi >= B) bi = B - 1;
                cnt[bi]++;
                const o = t * 9, q = bi * 6;
                for (let c = 0; c < 3; c++) {
                    const x = tris[o + c * 3], y = tris[o + c * 3 + 1], z = tris[o + c * 3 + 2];
                    if (x < bb[q]) bb[q] = x; if (x > bb[q + 3]) bb[q + 3] = x;
                    if (y < bb[q + 1]) bb[q + 1] = y; if (y > bb[q + 4]) bb[q + 4] = y;
                    if (z < bb[q + 2]) bb[q + 2] = z; if (z > bb[q + 5]) bb[q + 5] = z;
                }
            }
            // pre[s] = union of bins [0, s), suf[s] = union of bins [s, B): the same min/max the per-split loops formed
            const pre6 = this._pre, suf = this._suf, pc = this._pc, sc = this._sc;
            pre6[0] = pre6[1] = pre6[2] = Infinity; pre6[3] = pre6[4] = pre6[5] = -Infinity; pc[0] = 0;
            for (let i = 0; i < B; i++) {
                const p = i * 6, q = p + 6, g = i * 6;
                pre6[q] = bb[g] < pre6[p] ? bb[g] : pre6[p]; pre6[q + 1] = bb[g + 1] < pre6[p + 1] ? bb[g + 1] : pre6[p + 1]; pre6[q + 2] = bb[g + 2] < pre6[p + 2] ? bb[g + 2] : pre6[p + 2];
                pre6[q + 3] = bb[g + 3] > pre6[p + 3] ? bb[g + 3] : pre6[p + 3]; pre6[q + 4] = bb[g + 4] > pre6[p + 4] ? bb[g + 4] : pre6[p + 4]; pre6[q + 5] = bb[g + 5] > pre6[p + 5] ? bb[g + 5] : pre6[p + 5];
                pc[i + 1] = pc[i] + cnt[i];
            }
            const e = B * 6;
            suf[e] = suf[e + 1] = suf[e + 2] = Infinity; suf[e + 3] = suf[e + 4] = suf[e + 5] = -Infinity; sc[B] = 0;
            for (let i = B - 1; i >= 0; i--) {
                const q = i * 6, p = q + 6, g = i * 6;
                suf[q] = bb[g] < suf[p] ? bb[g] : suf[p]; suf[q + 1] = bb[g + 1] < suf[p + 1] ? bb[g + 1] : suf[p + 1]; suf[q + 2] = bb[g + 2] < suf[p + 2] ? bb[g + 2] : suf[p + 2];
                suf[q + 3] = bb[g + 3] > suf[p + 3] ? bb[g + 3] : suf[p + 3]; suf[q + 4] = bb[g + 4] > suf[p + 4] ? bb[g + 4] : suf[p + 4]; suf[q + 5] = bb[g + 5] > suf[p + 5] ? bb[g + 5] : suf[p + 5];
                sc[i] = sc[i + 1] + cnt[i];
            }
            const area = (A, k) => {
                if (!(A[k + 3] >= A[k])) return 0;
                const dx = A[k + 3] - A[k], dy = A[k + 4] - A[k + 1], dz = A[k + 5] - A[k + 2];
                return 2 * (dx * dy + dy * dz + dz * dx);
            };
            let bestCost = Infinity, bestBin = -1;
            for (let split = 1; split < B; split++) {
                const lc = pc[split], rc = sc[split];
                if (!lc || !rc) continue;
                const cost = lc * area(pre6, split * 6) + rc * area(suf, split * 6);
                if (cost < bestCost) { bestCost = cost; bestBin = split; }
            }
            if (bestBin > 0) {
                // partition in place around the chosen bin
                let i = start, j = end - 1;
                while (i <= j) {
                    const t = order[i];
                    let bi = ((cent[t * 3 + axis] - lo) * scale) | 0; if (bi >= B) bi = B - 1;
                    if (bi < bestBin) i++;
                    else { order[i] = order[j]; order[j] = t; j--; }
                }
                if (i > start && i < end) {
                    mid = i;
                    // the children's boxes, which recursion below would overwrite in the scratch: kept per depth
                    const lv = this._lvl || (this._lvl = []);
                    const slot = lv[depth] || (lv[depth] = new Float64Array(12));
                    for (let k = 0; k < 6; k++) { slot[k] = pre6[bestBin * 6 + k]; slot[6 + k] = suf[bestBin * 6 + k]; }
                    leftB = slot.subarray(0, 6); rightB = slot.subarray(6, 12);
                }
            }
        }
        if (mid < 0) {
            // the fallback described above: split by rank, which cannot produce an empty side
            mid = (start + end) >> 1;
            const slice = Array.from(order.subarray(start, end));
            slice.sort((a, b2) => cent[a * 3 + axis] - cent[b2 * 3 + axis]);
            order.set(slice, start);
        }
        const left = this._build(start, mid, depth + 1, leftB);
        const right = this._build(mid, end, depth + 1, rightB);
        this.meta[node * 3] = left; this.meta[node * 3 + 1] = right; this.meta[node * 3 + 2] = 0;
        return node;
    }

    /**
     * Ray against the node's box, returning the entry distance or Infinity.
     *
     * *** THE ZERO-DIRECTION GUARD IS A SPEED GUARD, AND I FIRST WROTE THAT IT WAS A CORRECTNESS ONE. ***
     * A ray parallel to an axis has 1/d === Infinity there, and if the origin sits exactly on a slab plane
     * the numerator is 0, so the product is NaN. The comment here used to say the box was then "silently
     * MISSED", which is false and worth correcting rather than deleting: EVERY comparison against NaN is
     * false, and the only early-out below is `t0 > t1`, so a NaN can never trigger it. The box comes back
     * HIT -- conservatively, and the triangle test still decides. MEASURED by removing the guard entirely:
     * 3000 axis-aligned rays against 20000 triangles returned the same 2874 hits, in 57ms against 41ms.
     * So it is worth about 28% on axis-aligned rays -- which a wall occlusion test fires constantly -- and
     * nothing at all in correctness. The gate asserts both halves of that.
     */
    _hitBox(node, ox, oy, oz, ix, iy, iz, dx, dy, dz, maxT) {
        const b = node * 6;
        let t0 = 0, t1 = maxT;
        const o = [ox, oy, oz], inv = [ix, iy, iz], d = [dx, dy, dz];
        for (let a = 0; a < AXIS; a++) {
            const lo = this.bounds[b + a], hi = this.bounds[b + a + 3];
            if (d[a] === 0) { if (o[a] < lo || o[a] > hi) return Infinity; continue; }
            let n0 = (lo - o[a]) * inv[a], n1 = (hi - o[a]) * inv[a];
            if (n0 > n1) { const t = n0; n0 = n1; n1 = t; }
            if (n0 > t0) t0 = n0;
            if (n1 < t1) t1 = n1;
            if (t0 > t1) return Infinity;
        }
        return t0;
    }

    /** Nearest hit along the ray. Returns { t, tri, point } or null. `tri` indexes triangles, not floats. */
    raycastFirst(ox, oy, oz, dx, dy, dz, maxT = Infinity, eps = EPS) {
        if (!this.count) return null;
        const ix = dx === 0 ? Infinity : 1 / dx, iy = dy === 0 ? Infinity : 1 / dy, iz = dz === 0 ? Infinity : 1 / dz;
        let best = maxT, bestTri = -1;
        const stack = [0];
        while (stack.length) {
            const node = stack.pop();
            if (this._hitBox(node, ox, oy, oz, ix, iy, iz, dx, dy, dz, best) === Infinity) continue;
            const left = this.meta[node * 3];
            if (left < 0) {
                const start = this.meta[node * 3 + 1], n = this.meta[node * 3 + 2];
                for (let s = start; s < start + n; s++) {
                    const tri = this.order[s];
                    const t = rayTriangle(ox, oy, oz, dx, dy, dz, this.tris, tri * 9, eps);
                    if (t !== null && t < best) { best = t; bestTri = tri; }
                }
                continue;
            }
            // *** NEAR CHILD LAST ONTO THE STACK, SO IT IS POPPED FIRST. *** Visiting the nearer box first is
            // what makes `best` tight early, which is what prunes the far subtree. Reversed, the traversal is
            // still CORRECT and much slower -- a performance bug that no correctness test can see.
            const right = this.meta[node * 3 + 1];
            const dl = this._hitBox(left, ox, oy, oz, ix, iy, iz, dx, dy, dz, best);
            const dr = this._hitBox(right, ox, oy, oz, ix, iy, iz, dx, dy, dz, best);
            if (dl < dr) { stack.push(right); stack.push(left); }
            else { stack.push(left); stack.push(right); }
        }
        if (bestTri < 0) return null;
        return { t: best, tri: bestTri, point: [ox + best * dx, oy + best * dy, oz + best * dz] };
    }

    /** Is anything in the way between a and b? Any-hit, early out -- the occlusion query. */
    intersectsSegment(ax, ay, az, bx, by, bz, eps = 1e-6) {
        if (!this.count) return false;
        const dx = bx - ax, dy = by - ay, dz = bz - az;
        const ix = dx === 0 ? Infinity : 1 / dx, iy = dy === 0 ? Infinity : 1 / dy, iz = dz === 0 ? Infinity : 1 / dz;
        const stack = [0];
        while (stack.length) {
            const node = stack.pop();
            if (this._hitBox(node, ax, ay, az, ix, iy, iz, dx, dy, dz, 1) === Infinity) continue;
            const left = this.meta[node * 3];
            if (left < 0) {
                const start = this.meta[node * 3 + 1], n = this.meta[node * 3 + 2];
                for (let s = start; s < start + n; s++) {
                    const t = rayTriangle(ax, ay, az, dx, dy, dz, this.tris, this.order[s] * 9, eps);
                    if (t !== null && t > eps && t < 1 - eps) return true;      // early out: any hit will do
                }
                continue;
            }
            stack.push(left); stack.push(this.meta[node * 3 + 1]);
        }
        return false;
    }

    /**
     * v4235 -- THE THIRD QUERY. Which triangles could a BOX touch?
     *
     * *** THIS FILE'S OWN HEADER ARGUES THAT A SINGLE "raycast" WOULD HAVE BEEN THE WRONG UNIFICATION: one
     * KERNEL, several QUERIES. THIS IS THE CASE THAT ARRIVED. *** A BSP boolean does not cast a ray at all --
     * it asks which polygons a blast's bounding box can reach, so that the rest of the wall is never handed to
     * the boolean. Measured in physics/mesh/meshCSG.mjs: twelve blasts on one wall cost 2154 ms whole-wall and
     * 362 ms localised, and the localised mesh is 2.3x SMALLER as well as 5.9x faster, because clipping a
     * polygon through a BSP splits it along planes it lies nowhere near.
     *
     * The test is AABB-vs-AABB, which is CONSERVATIVE ON PURPOSE: it can return a triangle the box does not
     * actually touch, and it can never miss one it does. That is the only direction a boolean can tolerate --
     * a false positive costs a wasted split, a false negative silently leaves solid geometry where a hole
     * should be, and nothing downstream would notice.
     */
    trianglesInBox(lo, hi) {
        const out = [];
        if (!this.count) return out;
        const stack = [0];
        while (stack.length) {
            const node = stack.pop(), o = node * 6;
            if (this.bounds[o] > hi[0] || this.bounds[o + 3] < lo[0] ||
                this.bounds[o + 1] > hi[1] || this.bounds[o + 4] < lo[1] ||
                this.bounds[o + 2] > hi[2] || this.bounds[o + 5] < lo[2]) continue;
            const left = this.meta[node * 3];
            if (left < 0) {
                const start = this.meta[node * 3 + 1], n = this.meta[node * 3 + 2];
                for (let s = start; s < start + n; s++) {
                    const t = this.order[s], b = t * 9;
                    let x0 = Infinity, y0 = Infinity, z0 = Infinity, x1 = -Infinity, y1 = -Infinity, z1 = -Infinity;
                    for (let c = 0; c < 3; c++) {
                        const x = this.tris[b + c * 3], y = this.tris[b + c * 3 + 1], z = this.tris[b + c * 3 + 2];
                        if (x < x0) x0 = x; if (x > x1) x1 = x;
                        if (y < y0) y0 = y; if (y > y1) y1 = y;
                        if (z < z0) z0 = z; if (z > z1) z1 = z;
                    }
                    if (x0 <= hi[0] && x1 >= lo[0] && y0 <= hi[1] && y1 >= lo[1] && z0 <= hi[2] && z1 >= lo[2]) out.push(t);
                }
                continue;
            }
            stack.push(left); stack.push(this.meta[node * 3 + 1]);
        }
        return out;
    }

    stats() { return { triangles: this.count, nodes: this.nodes, leaves: this.leaves, depth: this.depth, maxLeaf: this.maxLeaf }; }
}

export default MeshBVH;
