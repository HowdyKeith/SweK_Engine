// fx/nebula/nebula.js -- the look of space: a parallax volumetric-ish NEBULA for the EV flight view. Domain-warped
// fractal noise makes wispy colored gas clouds, a second noise tints them across a nebula palette (magenta / teal /
// ember), a starfield sits behind, and a camera offset gives PARALLAX so flying through it feels like real depth.
// This file is the CPU reference -- the ground truth the shaders are checked against, and a Canvas2D fallback that
// renders (downsampled) so the nebula shows on any device. The WGSL (WebGPU) + GLSL (WebGL2) ports mirror this math.
"use strict";

function hash2(x, y) { const h = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return h - Math.floor(h); }
function vnoise(x, y) {
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    const a = hash2(xi, yi), b = hash2(xi + 1, yi), c = hash2(xi, yi + 1), d = hash2(xi + 1, yi + 1);
    return a * (1 - u) * (1 - v) + b * u * (1 - v) + c * (1 - u) * v + d * u * v;
}
function fbm(x, y, oct) {
    let f = 0, amp = 0.5, fx = x, fy = y;
    for (let i = 0; i < oct; i++) { f += amp * vnoise(fx, fy); fx *= 2.01; fy *= 2.01; amp *= 0.5; }
    return f;
}
function mix3(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }
const PAL = { magenta: [0.62, 0.12, 0.52], teal: [0.10, 0.42, 0.55], ember: [0.72, 0.34, 0.10] };

// nebula colour at a pixel. cam = {x,y} in world units (parallax), time in seconds. Returns rgb [0,1].
function nebulaColorAt(px, py, W, H, cam, time) {
    // normalize to height, offset by the camera for parallax (gas drifts slowly with time too)
    const u = px / H + cam.x * 0.00035 + time * 0.004, v = py / H + cam.y * 0.00035;
    // domain-warped fbm -> wispy gas
    const w1 = fbm(u * 2.4, v * 2.4, 5);
    const dens = fbm(u * 2.4 + 4.7 + w1 * 1.6, v * 2.4 + 1.9 + w1 * 1.2, 5);
    const density = Math.pow(Math.max(0, dens - 0.42) / 0.58, 1.6);
    // colour variation across the palette
    const cvar = fbm(u * 1.1 + 9.3, v * 1.1 - 3.7, 3);
    let col = mix3(mix3(PAL.teal, PAL.magenta, Math.min(1, cvar * 1.4)), PAL.ember, Math.max(0, cvar - 0.55) * 2.2);
    col = [col[0] * density, col[1] * density, col[2] * density];
    // faint deep-space base tint so it's never pure black
    col = [col[0] + 0.012, col[1] + 0.016, col[2] + 0.03];
    // starfield: sparse bright points from a high-frequency hash (screen-space, parallaxed lightly)
    const sxf = px + cam.x * 0.02, syf = py + cam.y * 0.02;
    const sv = hash2(Math.floor(sxf * 0.9), Math.floor(syf * 0.9));
    if (sv > 0.994) { const b = (sv - 0.994) / 0.006; col = [Math.min(1, col[0] + b), Math.min(1, col[1] + b), Math.min(1, col[2] + b)]; }
    return [Math.min(1, col[0]), Math.min(1, col[1]), Math.min(1, col[2])];
}

// CPU fallback render (downsampled by `step` for speed), into an ImageData-like Uint8 buffer
function renderNebulaCPU(W, H, cam, time, step = 4) {
    const buf = new Uint8ClampedArray(W * H * 4);
    for (let y = 0; y < H; y += step) for (let x = 0; x < W; x += step) {
        const c = nebulaColorAt(x, y, W, H, cam, time);
        const r = c[0] * 255, g = c[1] * 255, b = c[2] * 255;
        for (let yy = y; yy < Math.min(H, y + step); yy++) for (let xx = x; xx < Math.min(W, x + step); xx++) { const o = (yy * W + xx) * 4; buf[o] = r; buf[o + 1] = g; buf[o + 2] = b; buf[o + 3] = 255; }
    }
    return buf;
}

export { hash2, vnoise, fbm, nebulaColorAt, renderNebulaCPU, PAL };
if (typeof module !== "undefined" && module.exports) module.exports = { hash2, vnoise, fbm, nebulaColorAt, renderNebulaCPU, PAL };
