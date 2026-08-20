// WebGLEngine/render/autoExposure.js — v3829 (sqrt-mean auto-exposure)
//
// AUTO-EXPOSURE THAT KEYS OFF THE SQRT-MEAN OF LUMINANCE, not the arithmetic mean and not the log-average. The
// choice is the whole point: the key is (mean over pixels of sqrt(luma))^2 -- a power-mean with exponent 1/2 --
// which sits BETWEEN the arithmetic mean (blown out by a few bright pixels: a sun, a muzzle flash) and the
// geometric/log mean (dragged to zero by any black pixel: space, shadow). So a bright scene with dark corners,
// or a dark scene with a hot highlight, both settle where the eye expects instead of pumping. Everything here is
// pure and renderer-agnostic: it turns a pixel buffer (or a precomputed key) into an exposure multiplier and
// eases toward it. render/bloomPass.js consumes .value for its uExposure; the Three.js pages set
// renderer.toneMappingExposure from it. Pinned in autoExposure-selfcheck.mjs.
//
// KEY SCALES LINEARLY WITH EXPOSURE: applying exposure E multiplies luma by E, so sqrt(luma) by sqrt(E), the
// mean by sqrt(E), and the squared key by E. Hence the exposure that maps a measured key to the target is simply
// target / key -- no iteration, no solve.

// Rec.709 relative luminance; inputs and output in 0..1 (feed linear-ish color).
export function luma(r, g, b) { return 0.2126 * r + 0.7152 * g + 0.0722 * b; }

// The sqrt-mean key over an RGBA byte buffer (0..255). stride subsamples for speed (1 = every pixel).
export function sqrtMeanKey(rgba, w, h, stride = 1) {
    let s = 0, n = 0, total = w * h;
    for (let i = 0; i < total; i += stride) {
        const o = i * 4;
        const l = luma(rgba[o] / 255, rgba[o + 1] / 255, rgba[o + 2] / 255);
        s += Math.sqrt(l > 0 ? l : 0); n++;
    }
    const m = n ? s / n : 0;
    return m * m;
}

// The exposure multiplier that would bring a measured key to targetKey, clamped so a black or blown frame can't
// drive it to absurd values.
export function exposureForKey(key, opts = {}) {
    const targetKey = opts.targetKey != null ? opts.targetKey : 0.20;
    const min = opts.min != null ? opts.min : 0.25, max = opts.max != null ? opts.max : 4.0;
    const e = targetKey / Math.max(key, 1e-4);
    return e < min ? min : (e > max ? max : e);
}

// Ease current exposure toward target this frame (eye adaptation). Exponential approach; separate up/down rates
// because real adaptation to darkness is slower than to light. Monotone and overshoot-free for any dt >= 0.
export function adapt(current, target, dt, opts = {}) {
    const up = opts.up != null ? opts.up : 2.5, down = opts.down != null ? opts.down : 1.2;
    const rate = target > current ? up : down;
    const k = 1 - Math.exp(-rate * (dt > 0 ? dt : 0));   // in [0,1]
    return current + (target - current) * k;
}

// Stateful controller. update(rgba,w,h,dt) or updateKey(key,dt) -> new exposure in .value. Holds the last key.
export function makeAutoExposure(opts = {}) {
    const o = Object.assign({ targetKey: 0.20, min: 0.25, max: 4.0, up: 2.5, down: 1.2, stride: 1, start: 1.0 }, opts);
    let value = o.start, lastKey = o.targetKey;
    function step(key, dt) {
        lastKey = key;
        const target = exposureForKey(key, o);
        value = adapt(value, target, dt == null ? 1 / 60 : dt, o);
        return value;
    }
    return {
        get value() { return value; },
        set value(v) { value = v; },
        get key() { return lastKey; },
        opts: o,
        update(rgba, w, h, dt) { return step(sqrtMeanKey(rgba, w, h, o.stride), dt); },
        updateKey(key, dt) { return step(key, dt); },
        reset(v) { value = v == null ? o.start : v; },
    };
}
