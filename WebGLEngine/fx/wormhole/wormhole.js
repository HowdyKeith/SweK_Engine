// fx/wormhole/wormhole.js -- CPU REFERENCE for a traversable-wormhole lensing effect, for ES system jumps. This is
// the ground truth the WGSL/GLSL shaders mirror (bit-identical, checked), following the same discipline as the
// nebula. The geometry is an Ellis wormhole (the "Visualizing Interstellar's Wormhole" metric, as in sirxemic's MIT
// project): ds^2 = dl^2 + r(l)^2 dphi^2 with r(l) = sqrt(k^2 + x^2), x = max(0, |l|-a). Light follows spatial
// geodesics of that curved geometry. A ray aimed near the center (small impact parameter) passes THROUGH the throat
// to the far system; a ray aimed wide bends around and stays on the near system -- which produces the iconic disc of
// the other sky ringed by a lensed distortion of this one.
//
// We integrate the geodesic with RK4 in an affine parameter (handles the turning point smoothly, unlike a
// sqrt(1 - h^2/r^2) form), so a ray at screen-radius rho yields { side, defl } used to sample the near/far nebula.
"use strict";

// r(l) and r'(l) for the Ellis metric
function rOf(l, k, a) { const x = Math.max(0, Math.abs(l) - a); return Math.sqrt(k * k + x * x); }
function rPrime(l, k, a) { const al = Math.abs(l); if (al <= a) return 0; const x = al - a, r = Math.sqrt(k * k + x * x); return (x / r) * Math.sign(l); }

// geodesic derivatives for state [l, phi, dl, dphi] (affine param s), metric ds^2 = dl^2 + r^2 dphi^2:
//   l''   = r r' (phi')^2
//   phi'' = -2 (r'/r) l' phi'
function deriv(st, k, a) { const [l, , dl, dphi] = st; const r = rOf(l, k, a), rp = rPrime(l, k, a); return [dl, dphi, r * rp * dphi * dphi, -2 * (rp / r) * dl * dphi]; }
function rk4(st, h, k, a) {
    const add = (a1, b1, s) => a1.map((v, i) => v + b1[i] * s);
    const k1 = deriv(st, k, a), k2 = deriv(add(st, k1, h / 2), k, a), k3 = deriv(add(st, k2, h / 2), k, a), k4 = deriv(add(st, k3, h), k, a);
    return st.map((v, i) => v + (h / 6) * (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i]));
}

// trace one ray. camL: camera radial coord (>0, near side). psi: ray angle off the inward (-l) axis (0 = straight at
// the throat). Returns { side: +1 near / -1 far, phi: total deflection, l: final radial }. Fixed step budget so the
// shader can mirror it exactly.
function traceRay(psi, opts = {}) {
    const k = opts.k || 1, a = opts.a || 0.5, camL = opts.camL || 6, steps = opts.steps || 160, ds = opts.ds || 0.14;
    const r0 = rOf(camL, k, a);
    // initial null-normalized direction: dl = -cos(psi) (inward), r*dphi = sin(psi)
    let st = [camL, 0, -Math.cos(psi), Math.sin(psi) / r0];
    for (let i = 0; i < steps; i++) { st = rk4(st, ds, k, a); if (Math.abs(st[0]) > camL + 40) break; }
    return { side: st[0] >= 0 ? 1 : -1, phi: st[2] < 0 && st[0] > 0 ? -Math.abs(st[1]) : st[1], l: st[0], out: st[2] };
}

// map a screen radius rho (0..1 from center) to a max ray angle, integrate, and return where to sample.
//   side  -1 -> sample the FAR nebula (through the throat); +1 -> the NEAR nebula, lensed.
//   uv angle offset = the ray's net deflection, so the near sky smears into an Einstein-ring near the disc edge.
function deflectAt(rho, opts = {}) {
    const maxPsi = opts.maxPsi || 1.35;                 // widest ray angle at the screen edge
    const psi = rho * maxPsi;
    const t = traceRay(psi, opts);
    return { side: t.side, psi, deflection: t.phi, throat: t.side < 0 };
}

// a compact CPU render to an RGBA buffer, sampling two palettes (near = teal/magenta, far = amber/gold), used only to
// verify the look off-rig. WebGL/WebGPU do the real thing.
function palNear(t) { return [40 + 150 * t, 120 + 80 * t, 150 + 90 * t]; }
function palFar(t) { return [180 + 60 * t, 120 + 70 * t, 40 + 60 * t]; }
function fract(x) { return x - Math.floor(x); }
function renderWormholeCPU(W, H, opts = {}) {
    const buf = new Uint8ClampedArray(W * H * 4), cx = W / 2, cy = H / 2, R = Math.min(W, H) / 2;
    // optional sky samplers (skyNear/skyFar(u,v) -> [r,g,b] 0..255) let the wormhole show the LIVING NEBULA on each
    // system; without them it falls back to the two placeholder palettes.
    const skyNear = opts.skyNear, skyFar = opts.skyFar;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const dx = (x - cx) / R, dy = (y - cy) / R, rho = Math.min(1, Math.hypot(dx, dy)), ang = Math.atan2(dy, dx);
        const d = deflectAt(rho, opts);
        const u = fract((ang + d.deflection) / (Math.PI * 2) * 3 + 0.5), v = fract(rho * 2.3 + d.deflection * 0.2);
        let c;
        if (d.throat && skyFar) c = skyFar(u, v); else if (!d.throat && skyNear) c = skyNear(u, v);
        else { const t = fract(u * 0.7 + v * 0.3); c = d.throat ? palFar(t) : palNear(t); }
        const i = (y * W + x) * 4; buf[i] = c[0]; buf[i + 1] = c[1]; buf[i + 2] = c[2]; buf[i + 3] = 255;
    }
    return buf;
}

export { rOf, rPrime, traceRay, deflectAt, renderWormholeCPU };
if (typeof module !== "undefined" && module.exports) module.exports = { rOf, rPrime, traceRay, deflectAt, renderWormholeCPU };
