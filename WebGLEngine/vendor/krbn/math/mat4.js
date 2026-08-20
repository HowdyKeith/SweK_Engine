// 4x4 matrix algebra, row-major. A quadric surface is the symmetric 4×4 matrix Q
// with Pᵀ Q P = 0 for homogeneous P = (x, y, z, 1). The apparent-contour method
// (docs/DESIGN.md §2.2) needs the *dual* quadric adj(Q), so determinant and
// adjugate live here alongside the basic ops.
export function mat4(...m) {
    return m;
}
/** Symmetric 4×4 from its upper triangle (row-major fill of the mirror). */
export function symmetric4(m00, m01, m02, m03, m11, m12, m13, m22, m23, m33) {
    return [
        m00, m01, m02, m03,
        m01, m11, m12, m13,
        m02, m12, m22, m23,
        m03, m13, m23, m33,
    ];
}
export function get4(m, r, c) {
    return m[r * 4 + c];
}
export function transpose4(m) {
    const t = new Array(16);
    for (let r = 0; r < 4; r++)
        for (let c = 0; c < 4; c++)
            t[c * 4 + r] = m[r * 4 + c];
    return t;
}
export function mulM4(a, b) {
    const out = new Array(16).fill(0);
    for (let r = 0; r < 4; r++)
        for (let c = 0; c < 4; c++) {
            let s = 0;
            for (let k = 0; k < 4; k++)
                s += a[r * 4 + k] * b[k * 4 + c];
            out[r * 4 + c] = s;
        }
    return out;
}
/** M · (v, w) as a homogeneous 4-vector. */
export function mulVec4(m, x, y, z, w) {
    return [
        m[0] * x + m[1] * y + m[2] * z + m[3] * w,
        m[4] * x + m[5] * y + m[6] * z + m[7] * w,
        m[8] * x + m[9] * y + m[10] * z + m[11] * w,
        m[12] * x + m[13] * y + m[14] * z + m[15] * w,
    ];
}
/** Gradient direction (∇ of Pᵀ Q P = 2 Q P) at a point on a quadric — the surface normal. */
export function quadricNormal(q, p) {
    const g = mulVec4(q, p[0], p[1], p[2], 1);
    return [g[0], g[1], g[2]];
}
// 3×3 minor determinant of the 4×4 with row `sr` and column `sc` removed.
function minor3(m, sr, sc) {
    const rows = [];
    const cols = [];
    for (let i = 0; i < 4; i++) {
        if (i !== sr)
            rows.push(i);
        if (i !== sc)
            cols.push(i);
    }
    const a = (r, c) => m[rows[r] * 4 + cols[c]];
    return (a(0, 0) * (a(1, 1) * a(2, 2) - a(1, 2) * a(2, 1)) -
        a(0, 1) * (a(1, 0) * a(2, 2) - a(1, 2) * a(2, 0)) +
        a(0, 2) * (a(1, 0) * a(2, 1) - a(1, 1) * a(2, 0)));
}
export function det4(m) {
    let d = 0;
    for (let c = 0; c < 4; c++) {
        const sign = c % 2 === 0 ? 1 : -1;
        d += sign * m[c] * minor3(m, 0, c);
    }
    return d;
}
/**
 * Adjugate (transpose of the cofactor matrix). adj(Q) is the dual quadric; for
 * an invertible Q it is det(Q)·Q⁻¹. Symmetric when Q is symmetric.
 */
export function adjugate4(m) {
    const out = new Array(16);
    for (let r = 0; r < 4; r++)
        for (let c = 0; c < 4; c++) {
            const sign = (r + c) % 2 === 0 ? 1 : -1;
            // cofactor_{r,c} = sign · minor(r,c); adjugate = transpose ⇒ store at (c,r)
            out[c * 4 + r] = sign * minor3(m, r, c);
        }
    return out;
}
//# sourceMappingURL=mat4.js.map