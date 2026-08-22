// WebGLEngine/render/autoExposure-selfcheck.mjs — v3829
//
// Answer key for sqrt-mean auto-exposure. The load-bearing property is WHY sqrt-mean: it must sit strictly
// between the arithmetic mean (highlight-blown) and the geometric mean (black-dragged), so highlights and dark
// corners both stop pumping the exposure. That, plus the target/key mapping, the clamps, and the monotone
// overshoot-free adaptation, are pinned here on constructed buffers -- Node-only.

import { luma, sqrtMeanKey, exposureForKey, adapt, makeAutoExposure } from "./autoExposure.js";

let pass = 0, fail = 0;
const near = (a, b, e = 1e-6) => Math.abs(a - b) <= e;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error("  FAIL  " + m); } };

// helper: a w*h RGBA buffer where value(i) -> [r,g,b] in 0..255 (grayscale l -> [l,l,l])
function buf(w, h, val) { const a = new Uint8ClampedArray(w * h * 4); for (let i = 0; i < w * h; i++) { const g = val(i); const o = i * 4; a[o] = a[o + 1] = a[o + 2] = g; a[o + 3] = 255; } return a; }

// 1) LUMA basics
ok(near(luma(1, 1, 1), 1) && near(luma(0, 0, 0), 0), "luma white=1, black=0");
ok(near(luma(0, 1, 0), 0.7152) && near(luma(1, 0, 0), 0.2126), "luma is Rec.709 weighted");

// 2) SQRT-MEAN on a UNIFORM gray == that gray's luma (all sqrt equal -> (mean)^2 = luma).
{
    const g = 64; const l = g / 255;               // uniform gray
    ok(near(sqrtMeanKey(buf(8, 8, () => g), 8, 8), l, 1e-6), "uniform gray: sqrt-mean key == luma");
}

// 3) THE POINT: for a half-black/half-white image, geo < sqrt-mean < arith.
{
    const b = buf(8, 8, (i) => (i % 2 ? 255 : 0));   // checker: half luma 1, half luma 0
    const key = sqrtMeanKey(b, 8, 8);
    const arith = 0.5;                                // mean luma
    const geo = 0;                                    // geometric mean with a zero is 0
    ok(key > geo && key < arith, `sqrt-mean ${key.toFixed(3)} strictly between geo(0) and arith(0.5)`);
    ok(near(key, 0.25, 1e-6), "half/half sqrt-mean is exactly ((0+1)/2)^2 = 0.25");
    // a single hot pixel in an otherwise mid scene moves sqrt-mean far less than it moves the arithmetic mean
    const mid = buf(64, 1, () => 96);                 // luma ~0.376 everywhere
    const midHot = buf(64, 1, (i) => (i === 0 ? 255 : 96));
    const dKeySqrt = Math.abs(sqrtMeanKey(midHot, 64, 1) - sqrtMeanKey(mid, 64, 1));
    // arithmetic-mean-luma delta from the same hot pixel:
    const meanL = (b2) => { let s = 0; for (let i = 0; i < 64; i++) s += b2[i * 4] / 255; return s / 64; };
    const dMeanArith = Math.abs(meanL(midHot) - meanL(mid));
    ok(dKeySqrt < dMeanArith, "one hot pixel perturbs sqrt-mean less than the arithmetic mean (highlight-robust)");
}

// 4) EXPOSURE MAPPING -- dark scene brightens, bright darkens, clamps hold, key==target -> exposure 1.
{
    ok(exposureForKey(0.20, { targetKey: 0.20 }) === 1, "key==target -> exposure 1");
    ok(exposureForKey(0.05, { targetKey: 0.20 }) > 1, "dark scene -> brighten");
    ok(exposureForKey(0.80, { targetKey: 0.20 }) < 1, "bright scene -> darken");
    ok(exposureForKey(1e-9, { targetKey: 0.20, max: 4 }) === 4, "black frame clamps to max, not infinity");
    ok(exposureForKey(1e9, { targetKey: 0.20, min: 0.25 }) === 0.25, "blown frame clamps to min");
    // applying the returned exposure maps the key to target (key scales linearly with exposure)
    const k = 0.05, e = exposureForKey(k, { targetKey: 0.20, min: 0.01, max: 100 });
    ok(near(k * e, 0.20, 1e-9), "key * exposureForKey(key) == target");
    // monotone decreasing in key
    ok(exposureForKey(0.1) > exposureForKey(0.2) && exposureForKey(0.2) > exposureForKey(0.4), "exposure decreases as key rises");
}

// 5) ADAPTATION -- moves toward target, never past it; asymmetric up/down; converges.
{
    ok(adapt(1, 2, 1 / 60) > 1 && adapt(1, 2, 1 / 60) < 2, "steps toward a higher target without overshoot");
    ok(adapt(2, 1, 1 / 60) < 2 && adapt(2, 1, 1 / 60) > 1, "steps toward a lower target without overshoot");
    ok(adapt(1, 2, 0) === 1, "dt 0 -> no change");
    // brightening (up) is faster than darkening (down) for the same gap
    const upStep = adapt(1, 2, 0.1, { up: 2.5, down: 1.2 }) - 1;
    const downStep = 2 - adapt(2, 1, 0.1, { up: 2.5, down: 1.2 });
    ok(upStep > downStep, "up-adaptation faster than down (eye model)");
    // converges to target over time
    let v = 1; for (let i = 0; i < 400; i++) v = adapt(v, 2.0, 1 / 60); ok(near(v, 2.0, 1e-3), "adaptation converges to target");
}

// 6) CONTROLLER -- a dark scene drives exposure up (clamped), a bright one down; value stays in range.
{
    const ae = makeAutoExposure({ targetKey: 0.20, min: 0.3, max: 4, up: 3, down: 3 });
    const dark = buf(16, 16, () => 16);    // luma ~0.063
    let v; for (let i = 0; i < 200; i++) v = ae.update(dark, 16, 16, 1 / 60);
    ok(v > 1 && v <= 4, "controller brightens a dark scene, within max (" + v.toFixed(2) + ")");
    const bright = buf(16, 16, () => 230);
    for (let i = 0; i < 200; i++) v = ae.update(bright, 16, 16, 1 / 60);
    ok(v < 1 && v >= 0.3, "controller then darkens a bright scene, within min (" + v.toFixed(2) + ")");
    ok(near(ae.value, v), ".value tracks the last update");
    // updateKey path agrees with update() on a uniform buffer
    const ae2 = makeAutoExposure({ targetKey: 0.2 }); const g = buf(8, 8, () => 100);
    const a = ae2.update(g, 8, 8, 1 / 60); ae2.reset(1); const b = ae2.updateKey(sqrtMeanKey(g, 8, 8), 1 / 60);
    ok(near(a, b), "update(buffer) and updateKey(key) agree");
}

if (fail) { console.error(`\nautoExposure-selfcheck: ${pass} pass, ${fail} FAIL`); process.exit(1); }
console.log(`autoExposure-selfcheck: all ${pass} pass`);
