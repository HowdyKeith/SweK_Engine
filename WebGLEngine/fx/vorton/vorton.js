// fx/vorton/vorton.js -- CPU REFERENCE for a vortex-particle ("vorton") fluid, the Gourlay/VorteGrid technique
// (implemented from the freely published Fluids-for-Games articles, not from that repo's code). A handful of vortons
// -- little blobs of vorticity -- induce a whole velocity field by a regularized Biot-Savart law; that field advects
// the vortons themselves and a large cloud of cheap tracer particles. It runs on the CPU on purpose (leaves the GPU
// for rendering) and is divergence-free by construction, which is why it keeps the beautiful filamentary wisps a
// grid solver smears away. Here it drives the nebula gas so it actually swirls. This is the ground truth the shader
// swirl mirrors.
//
// A vorton is { x:[x,y,z], w:[wx,wy,wz] } (position, vorticity vector). Velocity uses a smooth blob kernel so the
// core is bounded (no 1/r^2 singularity): v(q) = (1/4pi) sum_i (w_i x r) / (|r|^2 + sigma^2)^(3/2),  r = q - x_i.
"use strict";

const INV4PI = 1 / (4 * Math.PI);
function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }

// velocity induced at point q by all vortons (skipping index `skip` if given, for self-advection)
function inducedVelocity(vortons, q, sigma, skip) {
    const s2 = sigma * sigma; let vx = 0, vy = 0, vz = 0;
    for (let i = 0; i < vortons.length; i++) {
        if (i === skip) continue; const vt = vortons[i];
        const rx = q[0] - vt.x[0], ry = q[1] - vt.x[1], rz = q[2] - vt.x[2];
        const denom = Math.pow(rx * rx + ry * ry + rz * rz + s2, 1.5), f = INV4PI / denom;
        const c = cross(vt.w, [rx, ry, rz]); vx += c[0] * f; vy += c[1] * f; vz += c[2] * f;
    }
    return [vx, vy, vz];
}

// advance the vortons: each moves in the velocity the OTHERS induce at it (RK2 midpoint for stability)
function stepVortons(vortons, dt, sigma) {
    const v0 = vortons.map((vt, i) => inducedVelocity(vortons, vt.x, sigma, i));
    const mid = vortons.map((vt, i) => ({ x: [vt.x[0] + v0[i][0] * dt * 0.5, vt.x[1] + v0[i][1] * dt * 0.5, vt.x[2] + v0[i][2] * dt * 0.5], w: vt.w }));
    const vm = mid.map((vt, i) => inducedVelocity(mid, vt.x, sigma, i));
    for (let i = 0; i < vortons.length; i++) { vortons[i].x[0] += vm[i][0] * dt; vortons[i].x[1] += vm[i][1] * dt; vortons[i].x[2] += vm[i][2] * dt; }
}
function advectTracers(tracers, vortons, dt, sigma) { for (const t of tracers) { const v = inducedVelocity(vortons, t, sigma); t[0] += v[0] * dt; t[1] += v[1] * dt; t[2] += v[2] * dt; } }

// 2D specialization for the nebula plane: a vorton with scalar strength at (x,y) induces a tangential swirl.
//   v = (strength / 2pi) * (-(qy-y), (qx-x)) / (|r|^2 + sigma^2)
function swirl2D(vortons2D, qx, qy, sigma) {
    const s2 = sigma * sigma; let vx = 0, vy = 0;
    for (const v of vortons2D) { const rx = qx - v.x, ry = qy - v.y, f = (v.s / (2 * Math.PI)) / (rx * rx + ry * ry + s2); vx += -ry * f; vy += rx * f; }
    return [vx, vy];
}

export { inducedVelocity, stepVortons, advectTracers, swirl2D, cross };
if (typeof module !== "undefined" && module.exports) module.exports = { inducedVelocity, stepVortons, advectTracers, swirl2D, cross };
