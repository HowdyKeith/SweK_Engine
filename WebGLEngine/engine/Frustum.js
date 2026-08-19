// FILE: engine/Frustum.js
// VERSION: v1 — round 354
//
// Standard view-frustum culling primitives. Used by all six format
// renderers (splat/p3d/ovm/mol/mto/wnd) to skip drawElements calls for
// entities outside the camera's view.
//
// Convention: 6 planes stored as [a, b, c, d] where a*x + b*y + c*z + d
// >= 0 means "inside" the plane. Sphere is inside the frustum iff its
// center is at signed distance >= -radius from every plane.

/**
 * Extract the 6 view-frustum planes from a view-projection matrix.
 *
 * @param {Float32Array(16)} vp — column-major view × projection (or
 *                                proj × view depending on convention,
 *                                whichever you upload as u_proj * u_view
 *                                in shaders). Engine convention here:
 *                                vp = proj * view, column-major.
 * @returns {number[][]} 6 planes [left, right, bottom, top, near, far]
 */
export function extractFrustumPlanes(vp) {
    // Gribb-Hartmann method. With column-major storage and column-vector
    // convention (gl_Position = M * v), the 6 planes are linear
    // combinations of M's rows:
    //   left   = row3 + row0      right  = row3 - row0
    //   bottom = row3 + row1      top    = row3 - row1
    //   near   = row3 + row2      far    = row3 - row2
    // In column-major layout, row i element j is vp[i + 4*j].
    const planes = [
        [vp[3] + vp[0], vp[7] + vp[4], vp[11] + vp[8],  vp[15] + vp[12]],   // left
        [vp[3] - vp[0], vp[7] - vp[4], vp[11] - vp[8],  vp[15] - vp[12]],   // right
        [vp[3] + vp[1], vp[7] + vp[5], vp[11] + vp[9],  vp[15] + vp[13]],   // bottom
        [vp[3] - vp[1], vp[7] - vp[5], vp[11] - vp[9],  vp[15] - vp[13]],   // top
        [vp[3] + vp[2], vp[7] + vp[6], vp[11] + vp[10], vp[15] + vp[14]],   // near
        [vp[3] - vp[2], vp[7] - vp[6], vp[11] - vp[10], vp[15] - vp[14]],   // far
    ];
    // Normalize each plane so plane[0..2] is a unit normal and plane[3]
    // is the signed distance from origin. This makes sphere tests work
    // directly with the sphere's world radius.
    for (const p of planes) {
        const L = Math.hypot(p[0], p[1], p[2]);
        if (L > 0) {
            p[0] /= L; p[1] /= L; p[2] /= L; p[3] /= L;
        }
    }
    return planes;
}

/**
 * @returns true iff the sphere is at least partially inside the frustum.
 */
export function sphereInFrustum(cx, cy, cz, radius, planes) {
    for (let i = 0; i < 6; i++) {
        const p = planes[i];
        const d = p[0] * cx + p[1] * cy + p[2] * cz + p[3];
        if (d < -radius) return false;
    }
    return true;
}

/**
 * Compute a bounding sphere over a set of points stored as a flat
 * typed array. Uses Ritter's heuristic (one O(n) pass each for center
 * estimate and radius expansion). Good enough for visibility culling.
 *
 * @param {Float32Array | Int16Array} positions — N × 3 flat array
 * @param {number} count — number of points
 * @returns {{center: [x,y,z], radius: number}}
 */
export function computeBoundingSphere(positions, count) {
    if (count === 0) return { center: [0, 0, 0], radius: 0 };
    // Pass 1: compute centroid (rough center)
    let cx = 0, cy = 0, cz = 0;
    for (let i = 0; i < count; i++) {
        cx += positions[i * 3];
        cy += positions[i * 3 + 1];
        cz += positions[i * 3 + 2];
    }
    cx /= count; cy /= count; cz /= count;
    // Pass 2: find max distance from centroid → that's the radius
    let maxSq = 0;
    for (let i = 0; i < count; i++) {
        const dx = positions[i * 3]     - cx;
        const dy = positions[i * 3 + 1] - cy;
        const dz = positions[i * 3 + 2] - cz;
        const dSq = dx * dx + dy * dy + dz * dz;
        if (dSq > maxSq) maxSq = dSq;
    }
    return { center: [cx, cy, cz], radius: Math.sqrt(maxSq) };
}

/**
 * Transform a local-space sphere through an entity's position+rotation+
 * scale. Rotation is yaw-only around Y (matches all the renderer
 * conventions). Scale is uniform.
 *
 * @returns {[wx, wy, wz, wr]} world-space center + radius
 */
export function transformSphere(localCenter, localRadius, position, rotation, scale) {
    const cos = Math.cos(rotation), sin = Math.sin(rotation);
    const lx = localCenter[0], ly = localCenter[1], lz = localCenter[2];
    return [
        position[0] + scale * ( cos * lx + sin * lz),
        position[1] + scale *  ly,
        position[2] + scale * (-sin * lx + cos * lz),
        scale * localRadius,
    ];
}

/**
 * Column-major 4x4 multiply: out = a * b. Used by each renderer to
 * build the view-projection matrix for frustum plane extraction.
 *
 * @returns Float32Array(16)
 */
export function multiplyMat4(a, b) {
    const out = new Float32Array(16);
    for (let col = 0; col < 4; col++) {
        for (let row = 0; row < 4; row++) {
            let v = 0;
            for (let k = 0; k < 4; k++) v += a[k * 4 + row] * b[col * 4 + k];
            out[col * 4 + row] = v;
        }
    }
    return out;
}
