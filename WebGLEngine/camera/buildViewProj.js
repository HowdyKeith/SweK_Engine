// FILE: camera/buildViewProj.js
// VERSION: v1 - MISSING-FILE FIX (was imported by TVScreenCamera but absent)
//
// Builds a column-major view-projection matrix into `out` (a Float32Array(16)).
// Used by both the main first-person Camera and the TV-wall TVScreenCamera so
// they share matrix conventions.
//
// Convention matches Camera._move()'s forward vector:
//   forward = (sin(yaw)*cos(pitch),  sin(pitch),  -cos(yaw)*cos(pitch))
// At yaw=0, pitch=0 the camera looks down -Z (standard OpenGL).
// Positive pitch tilts up. World up axis is +Y.

export function buildViewProj(out, position, yaw, pitch, fov, near, far, aspect) {
    const cy = Math.cos(yaw);
    const sy = Math.sin(yaw);
    const cp = Math.cos(pitch);
    const sp = Math.sin(pitch);

    // Forward (already unit length given inputs are unit-magnitude)
    const fx = sy * cp;
    const fy = sp;
    const fz = -cy * cp;

    // Right = forward × up (up = +Y), then normalize
    let rx = fy * 0 - fz * 1;     // = -fz
    let ry = fz * 0 - fx * 0;     // = 0
    let rz = fx * 1 - fy * 0;     // = fx
    const rLen = Math.hypot(rx, ry, rz) || 1;
    rx /= rLen; ry /= rLen; rz /= rLen;

    // Up' = right × forward (orthonormal basis)
    const ux = ry * fz - rz * fy;
    const uy = rz * fx - rx * fz;
    const uz = rx * fy - ry * fx;

    // View matrix (column-major). Maps world to camera space:
    //   row 0 = right
    //   row 1 = up'
    //   row 2 = -forward
    //   translation = -dot(axis, eye)
    const ex = position.x, ey = position.y, ez = position.z;
    const v00 = rx, v01 = ux, v02 = -fx, v03 = 0;
    const v10 = ry, v11 = uy, v12 = -fy, v13 = 0;
    const v20 = rz, v21 = uz, v22 = -fz, v23 = 0;
    const v30 = -(rx * ex + ry * ey + rz * ez);
    const v31 = -(ux * ex + uy * ey + uz * ez);
    const v32 =  (fx * ex + fy * ey + fz * ez);
    const v33 = 1;

    // Perspective projection (column-major)
    const tanHalf = Math.tan(fov * 0.5);
    const f = 1 / tanHalf;
    const nf = 1 / (near - far);

    const p00 = f / aspect, p01 = 0,           p02 = 0,                       p03 = 0;
    const p10 = 0,          p11 = f,           p12 = 0,                       p13 = 0;
    const p20 = 0,          p21 = 0,           p22 = (far + near) * nf,       p23 = -1;
    const p30 = 0,          p31 = 0,           p32 = 2 * far * near * nf,     p33 = 0;

    // out = P * V (column-major multiply, hand-unrolled)
    out[0]  = p00 * v00 + p10 * v01 + p20 * v02 + p30 * v03;
    out[1]  = p01 * v00 + p11 * v01 + p21 * v02 + p31 * v03;
    out[2]  = p02 * v00 + p12 * v01 + p22 * v02 + p32 * v03;
    out[3]  = p03 * v00 + p13 * v01 + p23 * v02 + p33 * v03;

    out[4]  = p00 * v10 + p10 * v11 + p20 * v12 + p30 * v13;
    out[5]  = p01 * v10 + p11 * v11 + p21 * v12 + p31 * v13;
    out[6]  = p02 * v10 + p12 * v11 + p22 * v12 + p32 * v13;
    out[7]  = p03 * v10 + p13 * v11 + p23 * v12 + p33 * v13;

    out[8]  = p00 * v20 + p10 * v21 + p20 * v22 + p30 * v23;
    out[9]  = p01 * v20 + p11 * v21 + p21 * v22 + p31 * v23;
    out[10] = p02 * v20 + p12 * v21 + p22 * v22 + p32 * v23;
    out[11] = p03 * v20 + p13 * v21 + p23 * v22 + p33 * v23;

    out[12] = p00 * v30 + p10 * v31 + p20 * v32 + p30 * v33;
    out[13] = p01 * v30 + p11 * v31 + p21 * v32 + p31 * v33;
    out[14] = p02 * v30 + p12 * v31 + p22 * v32 + p32 * v33;
    out[15] = p03 * v30 + p13 * v31 + p23 * v32 + p33 * v33;

    return out;
}
