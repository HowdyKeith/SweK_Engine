// WebGLEngine/render/proceduralStar-selfcheck.mjs — v3835
//
// The star reuses the skybox generator, so what is left to pin is star-specific: does the temperature ramp run
// the right way (hotter = bluer, not redder), does limb darkening dim the edge and not the centre, is the
// photosphere seamless and actually granulated. The LOOK -- whether it reads as a sun -- is Keith's; the
// arithmetic under it is here.
//
// Run: node render/proceduralStar-selfcheck.mjs   (exit 0 all-pass, 1 on any fail)

import { temperatureColor, limbDarkening, starSurface, bakeStarCubemap, makeStarParams } from "./proceduralStar.js";
import { faceTexelDir } from "./nebulaSkybox.js";

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error("  FAIL  " + m); } };
const near = (a, b, e = 1e-9) => Math.abs(a - b) <= e;

// 1) TEMPERATURE RAMP runs the right way: as it heats, red falls and blue rises; ~5800 K is near-white.
{
    const cool = temperatureColor(3000), mid = temperatureColor(5800), hot = temperatureColor(12000);
    ok(cool[0] > hot[0], "hotter stars are less red");
    ok(hot[2] > cool[2], "hotter stars are more blue");
    ok(mid[0] > 0.9 && mid[1] > 0.9 && mid[2] > 0.85, "~5800 K is near-white");
    // monotone sweep: red non-increasing, blue non-decreasing
    let monoR = true, monoB = true, pr = 2, pb = -1;
    for (let k = 3000; k <= 12000; k += 500) { const c = temperatureColor(k); if (c[0] > pr + 1e-9) monoR = false; if (c[2] < pb - 1e-9) monoB = false; pr = c[0]; pb = c[2]; }
    ok(monoR && monoB, "red falls and blue rises monotonically across the range");
}

// 2) LIMB DARKENING: centre full, edge dimmer, monotone, bounded.
{
    ok(near(limbDarkening(1, 0.6), 1), "disc centre (mu=1) is full brightness");
    ok(near(limbDarkening(0, 0.6), 0.4), "disc edge (mu=0) falls to 1 - coeff");
    let mono = true, prev = -1;
    for (let k = 0; k <= 10; k++) { const v = limbDarkening(k / 10, 0.6); if (v < prev - 1e-9) mono = false; prev = v; }
    ok(mono, "limb darkening increases monotonically from edge to centre");
    ok(limbDarkening(0.5, 0.6) < limbDarkening(1, 0.6) && limbDarkening(0.5, 0.6) > limbDarkening(0, 0.6), "mid-disc sits between edge and centre");
}

// 3) PHOTOSPHERE IS SEAMLESS -- every baked texel equals starSurface of its direction (no per-face term).
{
    const P = makeStarParams({ seed: 5 }), S = 16, bake = bakeStarCubemap({ seed: 5, size: S });
    let match = true;
    for (const f of [0, 3, 5]) for (const [i, j] of [[0, 0], [S - 1, 4], [S >> 1, S - 1]]) {
        const c = starSurface(faceTexelDir(f, i, j, S), P), o = (j * S + i) * 3, b = bake.faces[f];
        if (Math.round(c[0] * 255) !== b[o] || Math.round(c[1] * 255) !== b[o + 1] || Math.round(c[2] * 255) !== b[o + 2]) match = false;
    }
    ok(match, "each baked texel equals starSurface(its direction) -- the cubemap is seamless");
}

// 4) GRANULATION IS LIVE -- turning it off flattens the surface variance.
{
    const S = 24;
    const varOf = (opts) => { const a = bakeStarCubemap({ ...opts, size: S }).faces[0]; let m = 0, m2 = 0, n = a.length / 3; for (let k = 0; k < a.length; k += 3) { m += a[k]; m2 += a[k] * a[k]; } m /= n; return m2 / n - m * m; };
    const on = varOf({ seed: 2, granDepth: 0.35, spotThreshold: 0 });
    const off = varOf({ seed: 2, granDepth: 0, spotThreshold: 0 });
    ok(off < 1e-6, "granulation off + no spots -> a flat disc (variance ~ 0)");
    ok(on > 1.0, "granulation on -> the photosphere varies (the noise reaches the pixels)");
}

// 5) DETERMINISM.
{
    const a = bakeStarCubemap({ seed: 3, size: 16 }), b = bakeStarCubemap({ seed: 3, size: 16 });
    let same = true; for (let k = 0; k < a.faces[0].length; k++) if (a.faces[0][k] !== b.faces[0][k]) same = false;
    ok(same, "same seed bakes an identical star");
}

// ---- CONTROLS ----
{
    // a flipped temperature ramp would make the HOT star less blue than the cool one
    const flipped = (k) => temperatureColor(15000 - k);   // ramp reversed
    ok(flipped(12000)[2] < flipped(3000)[2] && temperatureColor(12000)[2] > temperatureColor(3000)[2],
       "control: a reversed ramp makes the hot star less blue than the cool one");
    // constant limb darkening would leave the edge as bright as the centre
    const constLimb = (mu) => 1.0;
    ok(constLimb(0) === constLimb(1) && limbDarkening(0, 0.6) < limbDarkening(1, 0.6), "control: a constant limb law would not dim the edge");
}

console.log(`proceduralStar-selfcheck: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
