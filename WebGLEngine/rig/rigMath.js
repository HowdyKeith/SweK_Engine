// FILE: rig/rigMath.js
// VERSION: v1 (v817)
//
// Minimal matrix + quaternion helpers for the rig system. Column-major
// 4×4 matrices (compatible with WebGL). All operations are explicit-
// offset to avoid creating temporary typed-array slices.

export function _mat4Identity(out, off = 0) {
    for (let i = 0; i < 16; i++) out[off + i] = 0;
    out[off + 0] = out[off + 5] = out[off + 10] = out[off + 15] = 1;
}

// out[off..off+15] = a[aOff..aOff+15] * b[bOff..bOff+15]
// Column-major.
export function _mat4Multiply(a, aOff, b, bOff, out, off) {
    const a00=a[aOff+0],  a01=a[aOff+1],  a02=a[aOff+2],  a03=a[aOff+3];
    const a10=a[aOff+4],  a11=a[aOff+5],  a12=a[aOff+6],  a13=a[aOff+7];
    const a20=a[aOff+8],  a21=a[aOff+9],  a22=a[aOff+10], a23=a[aOff+11];
    const a30=a[aOff+12], a31=a[aOff+13], a32=a[aOff+14], a33=a[aOff+15];
    const b00=b[bOff+0],  b01=b[bOff+1],  b02=b[bOff+2],  b03=b[bOff+3];
    const b10=b[bOff+4],  b11=b[bOff+5],  b12=b[bOff+6],  b13=b[bOff+7];
    const b20=b[bOff+8],  b21=b[bOff+9],  b22=b[bOff+10], b23=b[bOff+11];
    const b30=b[bOff+12], b31=b[bOff+13], b32=b[bOff+14], b33=b[bOff+15];
    out[off+0]  = a00*b00 + a10*b01 + a20*b02 + a30*b03;
    out[off+1]  = a01*b00 + a11*b01 + a21*b02 + a31*b03;
    out[off+2]  = a02*b00 + a12*b01 + a22*b02 + a32*b03;
    out[off+3]  = a03*b00 + a13*b01 + a23*b02 + a33*b03;
    out[off+4]  = a00*b10 + a10*b11 + a20*b12 + a30*b13;
    out[off+5]  = a01*b10 + a11*b11 + a21*b12 + a31*b13;
    out[off+6]  = a02*b10 + a12*b11 + a22*b12 + a32*b13;
    out[off+7]  = a03*b10 + a13*b11 + a23*b12 + a33*b13;
    out[off+8]  = a00*b20 + a10*b21 + a20*b22 + a30*b23;
    out[off+9]  = a01*b20 + a11*b21 + a21*b22 + a31*b23;
    out[off+10] = a02*b20 + a12*b21 + a22*b22 + a32*b23;
    out[off+11] = a03*b20 + a13*b21 + a23*b22 + a33*b23;
    out[off+12] = a00*b30 + a10*b31 + a20*b32 + a30*b33;
    out[off+13] = a01*b30 + a11*b31 + a21*b32 + a31*b33;
    out[off+14] = a02*b30 + a12*b31 + a22*b32 + a32*b33;
    out[off+15] = a03*b30 + a13*b31 + a23*b32 + a33*b33;
}

export function _mat4Translate(out, off, x, y, z) {
    _mat4Identity(out, off);
    out[off + 12] = x; out[off + 13] = y; out[off + 14] = z;
}

// Quat (x,y,z,w) at qSrc[qOff..qOff+3] → 4x4 rotation matrix at out[off..off+15]
export function _mat4FromQuat(qSrc, qOff, out, off) {
    const x = qSrc[qOff+0], y = qSrc[qOff+1], z = qSrc[qOff+2], w = qSrc[qOff+3];
    const xx = x*x, yy = y*y, zz = z*z;
    const xy = x*y, xz = x*z, yz = y*z;
    const wx = w*x, wy = w*y, wz = w*z;
    out[off+0]  = 1 - 2*(yy + zz);
    out[off+1]  = 2*(xy + wz);
    out[off+2]  = 2*(xz - wy);
    out[off+3]  = 0;
    out[off+4]  = 2*(xy - wz);
    out[off+5]  = 1 - 2*(xx + zz);
    out[off+6]  = 2*(yz + wx);
    out[off+7]  = 0;
    out[off+8]  = 2*(xz + wy);
    out[off+9]  = 2*(yz - wx);
    out[off+10] = 1 - 2*(xx + yy);
    out[off+11] = 0;
    out[off+12] = 0; out[off+13] = 0; out[off+14] = 0; out[off+15] = 1;
}

export function _vec3Lerp(a, b, u, out) {
    out[0] = a[0] + (b[0] - a[0]) * u;
    out[1] = a[1] + (b[1] - a[1]) * u;
    out[2] = a[2] + (b[2] - a[2]) * u;
}

// Shortest-path quaternion slerp. a, b stored as [x,y,z,w].
export function _quatSlerp(a, b, u, out) {
    let bx = b[0], by = b[1], bz = b[2], bw = b[3];
    let cos = a[0]*bx + a[1]*by + a[2]*bz + a[3]*bw;
    if (cos < 0) { cos = -cos; bx = -bx; by = -by; bz = -bz; bw = -bw; }
    let s0, s1;
    if (cos > 0.9995) {
        // Near-identical orientations — linear blend is fine
        s0 = 1 - u; s1 = u;
    } else {
        const theta = Math.acos(cos);
        const sinTheta = Math.sin(theta);
        s0 = Math.sin((1 - u) * theta) / sinTheta;
        s1 = Math.sin(u * theta) / sinTheta;
    }
    out[0] = s0 * a[0] + s1 * bx;
    out[1] = s0 * a[1] + s1 * by;
    out[2] = s0 * a[2] + s1 * bz;
    out[3] = s0 * a[3] + s1 * bw;
}

// v818 — Extract quaternion (x,y,z,w) from the 3x3 rotation part of a
// column-major mat4 at src[srcOff..srcOff+15]. Writes 4 floats at out[outOff..outOff+3].
// Assumes the rotation submatrix is orthonormal (no scale/skew). For
// our rig usage the bone delta is translation+rotation only — fine.
export function _quatFromMat4(src, srcOff, out, outOff) {
    // Column-major 3x3 entries:
    //   m[0,0]=src[0]   m[0,1]=src[4]   m[0,2]=src[8]
    //   m[1,0]=src[1]   m[1,1]=src[5]   m[1,2]=src[9]
    //   m[2,0]=src[2]   m[2,1]=src[6]   m[2,2]=src[10]
    const m00 = src[srcOff+0], m10 = src[srcOff+1], m20 = src[srcOff+2];
    const m01 = src[srcOff+4], m11 = src[srcOff+5], m21 = src[srcOff+6];
    const m02 = src[srcOff+8], m12 = src[srcOff+9], m22 = src[srcOff+10];
    const tr = m00 + m11 + m22;
    let qx, qy, qz, qw;
    if (tr > 0) {
        const s = Math.sqrt(tr + 1.0) * 2;    // s = 4w
        qw = 0.25 * s;
        qx = (m21 - m12) / s;
        qy = (m02 - m20) / s;
        qz = (m10 - m01) / s;
    } else if (m00 > m11 && m00 > m22) {
        const s = Math.sqrt(1.0 + m00 - m11 - m22) * 2;   // s = 4x
        qw = (m21 - m12) / s;
        qx = 0.25 * s;
        qy = (m01 + m10) / s;
        qz = (m02 + m20) / s;
    } else if (m11 > m22) {
        const s = Math.sqrt(1.0 + m11 - m00 - m22) * 2;   // s = 4y
        qw = (m02 - m20) / s;
        qx = (m01 + m10) / s;
        qy = 0.25 * s;
        qz = (m12 + m21) / s;
    } else {
        const s = Math.sqrt(1.0 + m22 - m00 - m11) * 2;   // s = 4z
        qw = (m10 - m01) / s;
        qx = (m02 + m20) / s;
        qy = (m12 + m21) / s;
        qz = 0.25 * s;
    }
    out[outOff+0] = qx; out[outOff+1] = qy; out[outOff+2] = qz; out[outOff+3] = qw;
}

// v818 — quaternion multiply (a * b). Order matters; this rotates by b
// first then by a (standard right-to-left composition).
export function _quatMul(a, aOff, b, bOff, out, outOff) {
    const ax = a[aOff+0], ay = a[aOff+1], az = a[aOff+2], aw = a[aOff+3];
    const bx = b[bOff+0], by = b[bOff+1], bz = b[bOff+2], bw = b[bOff+3];
    out[outOff+0] = aw*bx + ax*bw + ay*bz - az*by;
    out[outOff+1] = aw*by - ax*bz + ay*bw + az*bx;
    out[outOff+2] = aw*bz + ax*by - ay*bx + az*bw;
    out[outOff+3] = aw*bw - ax*bx - ay*by - az*bz;
}
