// FILE: render/frustum.js
// VERSION: v1 - round 43p
//
// Six-plane view frustum extraction from a column-major view-projection
// matrix, plus axis-aligned bounding box vs frustum test. Used by the
// voxel renderer to skip chunks that are not in the camera's view —
// typical scenes cull 50-70% of loaded chunks at any given camera
// orientation.
//
// Reference: Gribb-Hartmann method
//   https://www.gamedevs.org/uploads/fast-extraction-viewing-frustum-planes-from-world-view-projection-matrix.pdf
//
// The 6 planes are extracted directly from the view-projection matrix
// without any inversion. After extraction each plane is normalized so
// the dot-product distance test is in world units.

export class Frustum {

    constructor() {
        // 6 planes: left, right, bottom, top, near, far
        // Each stored as [nx, ny, nz, d] where plane equation is
        // n . p + d = 0 (positive side = visible).
        this.planes = new Float32Array(24);
    }

    // m: column-major Float32Array(16) view-projection matrix.
    // After this call planes[] is populated and normalized.
    extractFrom(m) {
        const p = this.planes;
        // Column-major layout — m[col*4 + row]:
        //   m[0]  m[4]  m[8]   m[12]   ← row 0
        //   m[1]  m[5]  m[9]   m[13]   ← row 1
        //   m[2]  m[6]  m[10]  m[14]   ← row 2
        //   m[3]  m[7]  m[11]  m[15]   ← row 3
        // Plane_i = row3 ± row_i  (left=+x, right=-x, etc.)
        // LEFT  (row3 + row0)
        p[0] = m[3]  + m[0];
        p[1] = m[7]  + m[4];
        p[2] = m[11] + m[8];
        p[3] = m[15] + m[12];
        // RIGHT (row3 - row0)
        p[4] = m[3]  - m[0];
        p[5] = m[7]  - m[4];
        p[6] = m[11] - m[8];
        p[7] = m[15] - m[12];
        // BOTTOM (row3 + row1)
        p[8]  = m[3]  + m[1];
        p[9]  = m[7]  + m[5];
        p[10] = m[11] + m[9];
        p[11] = m[15] + m[13];
        // TOP (row3 - row1)
        p[12] = m[3]  - m[1];
        p[13] = m[7]  - m[5];
        p[14] = m[11] - m[9];
        p[15] = m[15] - m[13];
        // NEAR (row3 + row2)
        p[16] = m[3]  + m[2];
        p[17] = m[7]  + m[6];
        p[18] = m[11] + m[10];
        p[19] = m[15] + m[14];
        // FAR (row3 - row2)
        p[20] = m[3]  - m[2];
        p[21] = m[7]  - m[6];
        p[22] = m[11] - m[10];
        p[23] = m[15] - m[14];

        // Normalize each plane so the .d term reflects world-unit distance
        for (let i = 0; i < 6; i++) {
            const o = i * 4;
            const len = Math.hypot(p[o], p[o + 1], p[o + 2]);
            if (len > 0) {
                const inv = 1 / len;
                p[o]     *= inv;
                p[o + 1] *= inv;
                p[o + 2] *= inv;
                p[o + 3] *= inv;
            }
        }
    }

    // AABB vs frustum. AABB has minX/maxX/minY/maxY/minZ/maxZ.
    // Returns true if AABB intersects the frustum (or is fully inside).
    // Uses the "n-vertex" / positive-vertex trick — for each plane, pick
    // the AABB corner farthest along the plane normal; if THAT corner
    // is on the negative side, the whole box is outside.
    aabbVisible(aabb) {
        const p = this.planes;
        for (let i = 0; i < 6; i++) {
            const o = i * 4;
            const nx = p[o], ny = p[o + 1], nz = p[o + 2], d = p[o + 3];
            // Far-vertex along plane normal (max along axis if normal > 0)
            const px = nx >= 0 ? aabb.maxX : aabb.minX;
            const py = ny >= 0 ? aabb.maxY : aabb.minY;
            const pz = nz >= 0 ? aabb.maxZ : aabb.minZ;
            if (nx * px + ny * py + nz * pz + d < 0) {
                return false;   // box fully behind this plane
            }
        }
        return true;
    }
}
