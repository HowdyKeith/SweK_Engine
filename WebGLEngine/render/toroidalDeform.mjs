// WebGLEngine/render/toroidalDeform.mjs -- UNNUMBERED (the version is chosen at ship time).
//
// *** SLICE 1 OF snowflow-lift: THE TOROIDAL DEFORMATION FIELD, ADAPTED FROM Noniv/snowflow_demo (MIT, vendor/snowflow). ***
// A persistent, additive surface-state buffer that follows a focus point WITHOUT ever being copied: a texel's world position is its uv * size wrapped to the window around the focus, so
// moving the focus only changes which world position each texel stands for. Four channels per texel -- R depression (m), G displaced mass (m), B compression 0..1, A ice 0..1 -- and one
// pass per frame that scrolls (zeroes what just wrapped in), relaxes (diffusion, wind infill, slump, decay), splats the frame's brushes, and clamps. Feet, wakes, wheel ruts, craters and
// spells all write the same buffer through brush(); that shared write path is what makes the marks part of the surface instead of decals on it.
//
// WHAT IS UPSTREAM'S AND WHAT IS OURS. The pass, its constants and its function bodies (texelWorld, the five-point Laplacian, the wind infill, the slump, the decay time constants, the
// brush shaping, the clamp) are upstream's vendor/snowflow/src/shaders/deformSim.fragment.wgsl; the hash and gradient noise are its lib/noise.wgsl. Upstream's pass is Babylon-flavoured
// WGSL (a fragment shader over a half-float render target, `#include<snowNoise>`, loose uniforms) and does not run outside Babylon. OURS: (1) the same math as a COMPUTE kernel over plain
// storage buffers (KERNEL_WGSL), one thread per texel, f32 state; (2) a CPU TWIN (stepField) that is the specification the kernel is graded against; (3) DeformField, the driver, with the brush
// queue and the banked-time rule from vendor/snowflow/src/terrain/deformation.js; (4) the half-float finding re-measured instead of repeated (render/toroidalDeform-selfcheck.mjs).
//
// THE BANKED-TIME RULE, and what the gate measured about it: upstream stores the field in half float, where a decay as slow as 1/400 per second applied every frame is smaller than one
// ULP and rounds away or snaps to the wrong neighbour; so relaxation time is BANKED and spent in steps of RELAX_STEP seconds. This module keeps f32 state (a storage buffer, not a half-float
// target) and keeps the rule anyway, because a field that is later stored as f16 for bandwidth needs it, and because every relax term is an exact no-op at dt = 0 (the gate proves that).
//
// NOT DONE, said plainly: the READ side (vendor/snowflow/src/shaders/lib/deform.wgsl: displacement with a band-limited 3x3 binomial filter and a falloff before the seam) is not adapted; nothing
// draws this field; the engine has no caller yet. The kernel is run and compared with the twin on this box's software adapter only -- no real GPU, no timing.
"use strict";

export const COVERAGE = 80;          // metres of world per window, as upstream
export const RELAX_STEP = 0.4;       // seconds of banked relaxation worth spending
export const MAX_BRUSHES = 96;
export const BRUSH_ROWS = 3;
export const CHANNELS = 4;

// ---------------------------------------------------------------------------------------------------------------- the twin
const fract = (x) => x - Math.floor(x);
const smoothstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
/** WGSL's rounding of a tie goes to the even neighbour, which Math.round (half up) does not. */
export function roundHalfEven(x) { const r = Math.round(x); return Math.abs(x % 1) === 0.5 && r % 2 !== 0 ? r - 1 : r; }

/**
 * upstream lib/noise.wgsl hash21, with every operation rounded to f32 in the order the source writes them. The hash is where f32 and f64 part company: its fract chain throws away the high bits.
 * MEASURED (render/toroidalDeform-selfcheck.mjs section 4): even so the kernel on the software adapter differs from this by up to ~2e-3 in the hash and ~3e-3 in noise2 (fused
 * multiply-adds and the adapter's own sin/cos are not reproduced here), which is why the kernel is graded tightly where no noise enters and to a stated bound where it does.
 */
export function hash21(px, py) {
    const f = Math.fround, fr = (v) => f(v - Math.floor(v)), k = f(0.1031), c = f(33.33);
    let x = fr(f(f(px) * k)), y = fr(f(f(py) * k)), z = x;
    const d = f(f(x * f(y + c)) + f(y * f(z + c)) + f(z * f(x + c)));
    x = f(x + d); y = f(y + d); z = f(z + d);
    return fr(f(f(x + y) * z));
}
const grad2 = (ix, iy) => { const a = hash21(ix, iy) * 6.28318530718; return [Math.cos(a), Math.sin(a)]; };
/** upstream lib/noise.wgsl noise2 (the value of noised) */
export function noise2(px, py) {
    const ix = Math.floor(px), iy = Math.floor(py), fx = px - ix, fy = py - iy;
    const ux = fx * fx * fx * (fx * (fx * 6 - 15) + 10), uy = fy * fy * fy * (fy * (fy * 6 - 15) + 10);
    const ga = grad2(ix, iy), gb = grad2(ix + 1, iy), gc = grad2(ix, iy + 1), gd = grad2(ix + 1, iy + 1);
    const va = ga[0] * fx + ga[1] * fy, vb = gb[0] * (fx - 1) + gb[1] * fy, vc = gc[0] * fx + gc[1] * (fy - 1), vd = gd[0] * (fx - 1) + gd[1] * (fy - 1);
    return va + (vb - va) * ux + (vc - va) * uy + (va - vb - vc + vd) * ux * uy;
}

/**
 * One pass over the whole field -- the CPU twin and the specification. `prev` and `out` are Float32Array(res*res*4); `P` is { center:[x,z], prevCenter:[x,z], size, res, dt, brushCount, refillRate,
 * maxDepth, maxBerm, windAngle }; `brushes` is the upstream layout: three rows of MAX_BRUSHES vec4 -- (x, z, radius, elongation) / (cos yaw, sin yaw, depth, berm) / (compression, ice, edge, seed).
 */
export function stepField(prev, out, P, brushes) {
    const { res, size, dt, refillRate, maxDepth, maxBerm, windAngle } = P, n = Math.floor(P.brushCount), stride = MAX_BRUSHES * 4;
    const wrap = (i) => ((i % res) + res) % res, at = (x, y) => (wrap(y) * res + wrap(x)) * 4;
    const sampleAt = (px, py, ch) => {   // bilinear, wrap, texel centres at integers (what the sampler does for uv * res - 0.5)
        const x0 = Math.floor(px), y0 = Math.floor(py), fx = px - x0, fy = py - y0;
        return (prev[at(x0, y0) + ch] * (1 - fx) + prev[at(x0 + 1, y0) + ch] * fx) * (1 - fy) + (prev[at(x0, y0 + 1) + ch] * (1 - fx) + prev[at(x0 + 1, y0 + 1) + ch] * fx) * fy;
    };
    const wdx = Math.sin(windAngle), wdz = Math.cos(windAngle);
    for (let y = 0; y < res; y++) for (let x = 0; x < res; x++) {
        const u = (x + 0.5) / res, v = (y + 0.5) / res;
        const bx = u * size, bz = v * size;
        const wx = bx + size * roundHalfEven((P.center[0] - bx) / size), wz = bz + size * roundHalfEven((P.center[1] - bz) / size);
        let dep = 0, berm = 0, comp = 0, ice = 0;
        // scroll: a texel outside last frame's window just wrapped in and holds the far side's state
        if (Math.abs(wx - P.prevCenter[0]) <= size * 0.5 && Math.abs(wz - P.prevCenter[1]) <= size * 0.5) {
            const o = at(x, y), l = at(x - 1, y), r = at(x + 1, y), d = at(x, y - 1), up = at(x, y + 1);
            dep = prev[o]; berm = prev[o + 1]; comp = prev[o + 2]; ice = prev[o + 3];
            const k = Math.min(1, Math.max(0, refillRate * dt)), kDep = Math.min(0.22, 0.004 * k), kBerm = Math.min(0.22, 0.012 * k);
            dep += (prev[l] + prev[r] + prev[d] + prev[up] - 4 * dep) * kDep;
            berm += (prev[l + 1] + prev[r + 1] + prev[d + 1] + prev[up + 1] - 4 * berm) * kBerm;
            const kAdv = Math.min(0.2, 0.002 * k), ux = x - wdx * 1.6, uz = y - wdz * 1.6;   // the upwind tap is wdir * (1.6 texels), in texel units
            dep = dep + (sampleAt(ux, uz, 0) - dep) * (kAdv * 0.6);
            berm = berm + (sampleAt(ux, uz, 1) - berm) * kAdv;
            const slump = Math.min(berm, dep) * Math.min(0.6, 0.002 * refillRate * dt);
            dep -= slump; berm -= slump;
            dep *= Math.exp(-dt * refillRate / 400); berm *= Math.exp(-dt * refillRate / 250);
            comp *= Math.exp(-dt * refillRate / 300); ice *= Math.exp(-dt * refillRate / 900);
        }
        // splat
        for (let i = 0; i < n; i++) {
            const a = i * 4, b = stride + i * 4, c = stride * 2 + i * 4, radius = brushes[a + 2];
            if (radius <= 0) continue;
            let px = wx - brushes[a], pz = wz - brushes[a + 1];
            px -= size * roundHalfEven(px / size); pz -= size * roundHalfEven(pz / size);
            const reach = radius * Math.max(brushes[a + 3], 1) * 1.6;
            if (Math.abs(px) > reach || Math.abs(pz) > reach) continue;
            const qx = (px * brushes[b] + pz * brushes[b + 1]) / (radius * brushes[a + 3]), qy = (-px * brushes[b + 1] + pz * brushes[b]) / radius;
            const dd = Math.hypot(qx, qy);
            if (dd > 1.55) continue;
            const ang = Math.atan2(qy, qx), wob = 1 + brushes[c + 2] * 0.22 * noise2(Math.cos(ang) * 2.7 + brushes[c + 3], Math.sin(ang) * 2.7 + brushes[c + 3]);
            const dn = dd / wob, core = 1 - smoothstep(0.42, 1, dn), ringD = (dn - 1.04) * 3.4, ring = Math.exp(-ringD * ringD);
            const grain = 0.72 + 0.56 * (noise2(qx * 7.5 + brushes[c + 3] * 3.1, qy * 7.5 + brushes[c + 3] * 3.1) * 0.5 + 0.5);
            dep += brushes[b + 2] * core; berm += brushes[b + 3] * ring * grain; comp += brushes[c] * core; ice = Math.max(ice, brushes[c + 1] * core);
        }
        const o = (y * res + x) * 4;
        out[o] = Math.min(maxDepth, Math.max(0, dep)); out[o + 1] = Math.min(maxBerm, Math.max(0, berm));
        out[o + 2] = Math.min(1, Math.max(0, comp)); out[o + 3] = Math.min(1, Math.max(0, ice));
    }
}

// -------------------------------------------------------------------------------------------------------------- the kernel
/** The same pass as a compute kernel: one thread per texel, f32 storage. Bindings: 0 out (rw), 1 params (uniform), 2 prev (ro), 3 brushes (ro). Dispatch (res/8, res/8). */
export const KERNEL_WGSL = /* wgsl */ `
struct Params { center: vec2f, prevCenter: vec2f, size: f32, res: f32, dt: f32, brushCount: f32, refillRate: f32, maxDepth: f32, maxBerm: f32, windAngle: f32 };
@group(0) @binding(0) var<storage, read_write> outBuf: array<f32>;
@group(0) @binding(1) var<uniform> U: Params;
@group(0) @binding(2) var<storage, read> prevBuf: array<f32>;
@group(0) @binding(3) var<storage, read> brushBuf: array<f32>;
const MAXB: u32 = ${MAX_BRUSHES}u;

// ---- upstream lib/noise.wgsl, bodies unchanged
fn hash21(p: vec2f) -> f32 {
    var p3 = fract(vec3f(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
}
fn grad2(i: vec2f) -> vec2f {
    let a = hash21(i) * 6.28318530718;
    return vec2f(cos(a), sin(a));
}
fn noised(p: vec2f) -> vec3f {
    let i = floor(p);
    let f = p - i;
    let u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
    let du = 30.0 * f * f * (f * (f - 2.0) + 1.0);
    let ga = grad2(i + vec2f(0.0, 0.0));
    let gb = grad2(i + vec2f(1.0, 0.0));
    let gc = grad2(i + vec2f(0.0, 1.0));
    let gd = grad2(i + vec2f(1.0, 1.0));
    let va = dot(ga, f - vec2f(0.0, 0.0));
    let vb = dot(gb, f - vec2f(1.0, 0.0));
    let vc = dot(gc, f - vec2f(0.0, 1.0));
    let vd = dot(gd, f - vec2f(1.0, 1.0));
    let k0 = va;
    let k1 = vb - va;
    let k2 = vc - va;
    let k3 = va - vb - vc + vd;
    let value = k0 + k1 * u.x + k2 * u.y + k3 * u.x * u.y;
    let deriv = ga + u.x * (gb - ga) + u.y * (gc - ga) + u.x * u.y * (ga - gb - gc + gd) + du * (vec2f(u.y, u.x) * k3 + vec2f(k1, k2));
    return vec3f(value, deriv);
}
fn noise2(p: vec2f) -> f32 { return noised(p).x; }

// ---- ours: buffer access in place of the sampler (wrap, bilinear, texel centres at integers)
fn texelAt(ix: i32, iy: i32) -> vec4f {
    let r = i32(U.res);
    let x = ((ix % r) + r) % r;
    let y = ((iy % r) + r) % r;
    let o = u32((y * r + x) * 4);
    return vec4f(prevBuf[o], prevBuf[o + 1u], prevBuf[o + 2u], prevBuf[o + 3u]);
}
fn sampleWrap(p: vec2f) -> vec4f {
    let b = floor(p);
    let f = p - b;
    let x0 = i32(b.x);
    let y0 = i32(b.y);
    return mix(mix(texelAt(x0, y0), texelAt(x0 + 1, y0), f.x), mix(texelAt(x0, y0 + 1), texelAt(x0 + 1, y0 + 1), f.x), f.y);
}
fn brushVec(row: u32, i: u32) -> vec4f {
    let o = row * MAXB * 4u + i * 4u;
    return vec4f(brushBuf[o], brushBuf[o + 1u], brushBuf[o + 2u], brushBuf[o + 3u]);
}

// ---- upstream deformSim.fragment.wgsl, bodies unchanged except where a texture fetch became texelAt / sampleWrap
fn texelWorld(uv: vec2f, centre: vec2f, size: f32) -> vec2f {
    let base = uv * size;
    return base + size * round((centre - base) / size);
}

@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) gid: vec3u) {
    let res = i32(U.res);
    if (i32(gid.x) >= res || i32(gid.y) >= res) { return; }
    let x = i32(gid.x);
    let y = i32(gid.y);
    let uv = (vec2f(f32(x), f32(y)) + 0.5) / U.res;
    let size = U.size;
    let dt = U.dt;
    let world = texelWorld(uv, U.center, size);

    var dep = 0.0;
    var berm = 0.0;
    var comp = 0.0;
    var ice = 0.0;

    let wasInside = all(abs(world - U.prevCenter) <= vec2f(size * 0.5));
    if (wasInside) {
        let c = texelAt(x, y);
        let xl = texelAt(x - 1, y);
        let xr = texelAt(x + 1, y);
        let zd = texelAt(x, y - 1);
        let zu = texelAt(x, y + 1);
        dep = c.r;
        berm = c.g;
        comp = c.b;
        ice = c.a;

        let k = clamp(U.refillRate * dt, 0.0, 1.0);
        let kDep = min(0.22, 0.004 * k);
        let kBerm = min(0.22, 0.012 * k);
        let lapDep = (xl.r + xr.r + zd.r + zu.r) - 4.0 * dep;
        let lapBerm = (xl.g + xr.g + zd.g + zu.g) - 4.0 * berm;
        dep += lapDep * kDep;
        berm += lapBerm * kBerm;

        let wdir = vec2f(sin(U.windAngle), cos(U.windAngle));
        let uw = sampleWrap(vec2f(f32(x), f32(y)) - wdir * 1.6);
        let kAdv = min(0.2, 0.002 * k);
        dep = mix(dep, uw.r, kAdv * 0.6);
        berm = mix(berm, uw.g, kAdv);

        let slump = min(berm, dep) * min(0.6, 0.002 * U.refillRate * dt);
        dep -= slump;
        berm -= slump;

        let r = U.refillRate;
        dep *= exp(-dt * r / 400.0);
        berm *= exp(-dt * r / 250.0);
        comp *= exp(-dt * r / 300.0);
        ice *= exp(-dt * r / 900.0);
    }

    let n = i32(U.brushCount);
    for (var i = 0; i < n; i++) {
        let a = brushVec(0u, u32(i));
        let b = brushVec(1u, u32(i));
        let c = brushVec(2u, u32(i));
        let radius = a.z;
        if (radius <= 0.0) { continue; }
        var p = world - a.xy;
        p -= size * round(p / size);
        let reach = radius * max(a.w, 1.0) * 1.6;
        if (abs(p.x) > reach || abs(p.y) > reach) { continue; }
        let q = vec2f(
            (p.x * b.x + p.y * b.y) / (radius * a.w),
            (-p.x * b.y + p.y * b.x) / radius
        );
        let d = length(q);
        if (d > 1.55) { continue; }
        let ang = atan2(q.y, q.x);
        let wob = 1.0 + c.z * 0.22 * noise2(vec2f(cos(ang), sin(ang)) * 2.7 + c.w);
        let dn = d / wob;
        let core = 1.0 - smoothstep(0.42, 1.0, dn);
        let ringD = (dn - 1.04) * 3.4;
        let ring = exp(-ringD * ringD);
        let grain = 0.72 + 0.56 * (noise2(q * 7.5 + c.w * 3.1) * 0.5 + 0.5);
        dep += b.z * core;
        berm += b.w * ring * grain;
        comp += c.x * core;
        ice = max(ice, c.y * core);
    }

    dep = clamp(dep, 0.0, U.maxDepth);
    berm = clamp(berm, 0.0, U.maxBerm);
    comp = clamp(comp, 0.0, 1.0);
    ice = clamp(ice, 0.0, 1.0);
    let o = u32((y * res + x) * 4);
    outBuf[o] = dep;
    outBuf[o + 1u] = berm;
    outBuf[o + 2u] = comp;
    outBuf[o + 3u] = ice;
}
`;

/** upstream's noise (hash21, grad2, noised, noise2) as WGSL text, for any shader that wants the same function the kernel uses */
export const NOISE_WGSL = KERNEL_WGSL.slice(KERNEL_WGSL.indexOf("// ---- upstream lib/noise.wgsl"), KERNEL_WGSL.indexOf("// ---- ours"));

/** The uniform block's 12 floats, in the kernel's field order. */
export const packParams = (P) => [P.center[0], P.center[1], P.prevCenter[0], P.prevCenter[1], P.size, P.res, P.dt, P.brushCount, P.refillRate, P.maxDepth, P.maxBerm, P.windAngle];

// ------------------------------------------------------------------------------------------------------------- the driver
/**
 * The field with its brush queue and the banked-time rule, stepped by the CPU twin. `step()` is what a GPU driver would replace; params() and brushes() hand the kernel the same inputs.
 */
export class DeformField {
    constructor({ res = 256, size = COVERAGE, refillRate = 1, depthScale = 1, bermScale = 1, windDirectionDeg = 0 } = {}) {
        this.res = res; this.size = size; this.texel = size / res;
        this.refillRate = refillRate; this.maxDepth = 0.55 * depthScale; this.maxBerm = 0.34 * bermScale; this.windAngle = windDirectionDeg * Math.PI / 180;
        this.center = [0, 0]; this.prevCenter = [0, 0];
        this.state = new Float32Array(res * res * CHANNELS); this._next = new Float32Array(res * res * CHANNELS);
        this._brushes = new Float32Array(MAX_BRUSHES * BRUSH_ROWS * 4); this.brushCount = 0;
        this.relaxOwed = 0; this.lastRelaxDt = 0;
    }
    /** Queue a brush for the next update(), positions in absolute world metres. Returns false if it was dropped (queue full, no radius, or outside the window). */
    brush(x, z, radius, depth, berm, compression, ice, yaw = 0, elongation = 1, edge = 1) {
        if (this.brushCount >= MAX_BRUSHES || !(radius > 0)) return false;
        const halfPlus = this.size * 0.5 + radius * 2;
        if (Math.abs(x - this.center[0]) > halfPlus || Math.abs(z - this.center[1]) > halfPlus) return false;
        const d = this._brushes, s = MAX_BRUSHES * 4, a = this.brushCount++ * 4;
        d[a] = x; d[a + 1] = z; d[a + 2] = radius; d[a + 3] = elongation || 1;
        d[s + a] = Math.cos(yaw); d[s + a + 1] = Math.sin(yaw); d[s + a + 2] = depth; d[s + a + 3] = berm;
        d[s * 2 + a] = compression; d[s * 2 + a + 1] = ice; d[s * 2 + a + 2] = edge; d[s * 2 + a + 3] = (x * 0.37 + z * 0.71) % 100;
        return true;
    }
    /** The inputs the kernel takes this frame (after update() has set the centre and the banked dt). */
    params() { return { center: this.center, prevCenter: this.prevCenter, size: this.size, res: this.res, dt: this.lastRelaxDt, brushCount: this.brushCount, refillRate: this.refillRate, maxDepth: this.maxDepth, maxBerm: this.maxBerm, windAngle: this.windAngle }; }
    brushes() { return this._brushes; }
    /**
     * The bookkeeping of a frame WITHOUT the pass: snap the centre to a texel boundary, clear the stale brush tail, bank the time and spend it only in steps of RELAX_STEP. A GPU driver calls this, hands params()
     * and brushes() to the kernel, then calls endFrame(); update() is advance + the CPU twin's pass + endFrame.
     */
    advance(dt, focus) {
        this.prevCenter = [this.center[0], this.center[1]];
        this.center = [Math.round(focus.x / this.texel) * this.texel, Math.round(focus.z / this.texel) * this.texel];
        for (let i = this.brushCount; i < MAX_BRUSHES; i++) this._brushes[i * 4 + 2] = 0;
        this.relaxOwed += dt; this.lastRelaxDt = 0;
        if (this.relaxOwed >= RELAX_STEP) { this.lastRelaxDt = this.relaxOwed; this.relaxOwed = 0; }
        return this.params();
    }
    endFrame() { this.brushCount = 0; }
    /** Advance one frame: bookkeeping, the CPU twin's pass, clear the queue. */
    update(dt, focus) {
        this.advance(dt, focus);
        stepField(this.state, this._next, this.params(), this._brushes);
        [this.state, this._next] = [this._next, this.state];
        this.endFrame();
        return this.state;
    }
    /** Net height offset (piled mass minus depression, metres) at a world position, bilinear, or null outside the window. */
    netHeightAt(x, z) {
        if (Math.abs(x - this.center[0]) > this.size * 0.5 || Math.abs(z - this.center[1]) > this.size * 0.5) return null;
        const r = this.res, px = (((x / this.size) % 1 + 1) % 1) * r - 0.5, pz = (((z / this.size) % 1 + 1) % 1) * r - 0.5, x0 = Math.floor(px), z0 = Math.floor(pz), fx = px - x0, fz = pz - z0;
        const w = (i) => ((i % r) + r) % r, g = (ix, iz) => { const o = (w(iz) * r + w(ix)) * 4; return this.state[o + 1] - this.state[o]; };
        return (g(x0, z0) * (1 - fx) + g(x0 + 1, z0) * fx) * (1 - fz) + (g(x0, z0 + 1) * (1 - fx) + g(x0 + 1, z0 + 1) * fx) * fz;
    }
}

/** The bench report. */
export function reportLines(f = new DeformField({ res: 64, size: 8 })) {
    const L = ["[toroidalDeform] " + f.res + "x" + f.res + " field over " + f.size + " m (" + (f.texel * 100).toFixed(1) + " cm texels), " + CHANNELS + " channels (depression, displaced mass, compression, ice)",
        "  relax banked in " + RELAX_STEP + " s steps; at most " + MAX_BRUSHES + " brushes a frame; maxDepth " + f.maxDepth.toFixed(3) + " m, maxBerm " + f.maxBerm.toFixed(3) + " m",
        "  the kernel is upstream's pass as a compute kernel over storage buffers; the CPU twin (stepField) is what it is graded against"];
    return L;
}
