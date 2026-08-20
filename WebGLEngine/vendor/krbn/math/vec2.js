// Immutable 2-vector algebra (screen / plane space). Mirrors vec3.ts.
export const vec2 = (x, y) => [x, y];
export function add2(a, b) {
    return [a[0] + b[0], a[1] + b[1]];
}
export function sub2(a, b) {
    return [a[0] - b[0], a[1] - b[1]];
}
export function scale2(a, s) {
    return [a[0] * s, a[1] * s];
}
export function dot2(a, b) {
    return a[0] * b[0] + a[1] * b[1];
}
/** 2D scalar cross (z of the 3D cross) — sign gives orientation. */
export function cross2(a, b) {
    return a[0] * b[1] - a[1] * b[0];
}
export function length2(a) {
    return Math.hypot(a[0], a[1]);
}
export function distance2(a, b) {
    return Math.hypot(a[0] - b[0], a[1] - b[1]);
}
export function normalize2(a) {
    const len = length2(a);
    if (len === 0)
        return a;
    const inv = 1 / len;
    return [a[0] * inv, a[1] * inv];
}
export function approxEqual2(a, b, eps) {
    return Math.abs(a[0] - b[0]) <= eps && Math.abs(a[1] - b[1]) <= eps;
}
//# sourceMappingURL=vec2.js.map