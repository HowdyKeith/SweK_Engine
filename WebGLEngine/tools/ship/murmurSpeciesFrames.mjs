// WebGLEngine/tools/ship/murmurSpeciesFrames.mjs -- v4630
//
// THE SHARED HALF OF THE SPECIES GATES: the frame budget, the render call, and the handful of measurements
// every species row is built out of. It runs nothing itself and is not a gate.
//
// *** IT EXISTS BECAUSE ONE SPECIES GATE CANNOT HOLD EIGHTEEN SPECIES, AND THE SPLIT WAS MADE BEFORE THE
// SPECIES THAT FORCED IT RATHER THAN AFTER. *** tools/ship/murmurSpecies-selfcheck.mjs was at 2,780 ms against
// a 3,000 ms ceiling with FOUR of the eighteen ported. A species costs about 195 ms -- one WGSL compile plus
// one render -- so the fifth crossed it. reuseInstances was already spent (ten frames, five shaders), which
// was the last lever of that kind. v4626 made exactly this split one level up, between the kit and the
// species, and recorded why: a gate over budget does not run at ship time AT ALL, so the round that adds the
// species that crosses the line is the round whose red nobody sees.
//
// *** AND THE MEASUREMENTS LIVE HERE RATHER THAN BEING COPIED INTO EACH GATE. *** Two gates with their own
// copy of "the light at a point" is two gates that will eventually disagree about what they measured, which
// is the defect this tree has repaired in the record itself three times over (runtimeGap's WebAssembly row).
// One definition, imported.
"use strict";

import path from "node:path";
import { fileURLToPath } from "node:url";
import { renderThreeTslToPixels } from "./webgpuHarness.mjs";
import { srgbToLinear, linearToOklab } from "../../render/murmurKit.mjs";

export const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

// 48 rather than 64: every claim below is a separation of threefold or more and the instruments sweep 64 or
// 72 angles either way, so the frame size buys nothing but readback.
export const N3 = 48;
export const VOICE = 0.3;
// *** THE SILHOUETTE PAIR RUNS AT VOICE ZERO, AND THAT IS WHAT GIVES ITS ROW A ZERO FLOOR. *** With voice up,
// droplet's breath scales the WHOLE body between two frames, so the outline changes even when the deformation
// is switched off -- measured, an amp of 0 still moved it 0.36% and the row stayed green under exactly that
// sabotage. At voice 0 the swell is 0 and bodyScale is exactly 1.
export const SIL_VOICE = 0;
// murmur's own paper ground, the light half of the two the rail is built for.
export const PAPER_INK = [0.97, 0.96, 0.94];

// murmur's house ink, the dark ground. Named here so EVERY frame can state it -- see sp() below.
export const INK = [0x0A / 255, 0x0A / 255, 0x0B / 255];

/**
 * A frame request.
 *
 * *** IT ALWAYS NAMES THE INK, AND THAT IS A BUG FIX RATHER THAN A STYLE. *** reuseInstances shares one
 * compiled shader between frames that differ only in knobs, and render/aiPresenceOrbTsl.mjs's setKnobs writes
 * only the names PRESENT in its argument -- so a knob one frame sets and the next does not mention KEEPS the
 * first frame's value. v4629's own note said exactly that and called it the promise a caller turning
 * reuseInstances on is making. v4630 broke it inside one gate: a paper-ground frame set `colors`, the next
 * frame did not mention them, and a still-on-ink frame rendered on PAPER. It read as a 0.57 lightness shift
 * in a row asking whether the spread knob moves lightness -- a real number measuring the wrong two frames.
 *
 * So the ink is stated on every frame by default, which makes the knob NAMES identical across frames and the
 * hazard unreachable rather than merely documented. A caller wanting paper passes it explicitly.
 */
export const sp = (species, time, voice = VOICE, extra = {}) =>
    ({ factoryArgs: { species }, knobs: { time, voice, colors: { ink: INK }, ...extra } });

/**
 * ONE LAUNCH FOR EVERY FRAME A GATE ASKS FOR. The launch is nearly the whole cost, so they share a page, and
 * reuseInstances means frames differing only in knobs share a compiled shader as well -- nine frames built
 * four shaders when this was one gate, and 0 bytes of 82,944 differed from building nine.
 */
export async function renderSpecies(frames) {
    return renderThreeTslToPixels({
        engineRoot: ENG, moduleImportPath: "/render/aiPresenceOrbTsl.mjs", factoryName: "makeAiPresenceOrbTsl",
        factoryArgs: frames[0].factoryArgs, knobs: frames[0].knobs, width: N3, height: N3,
        variants: frames.slice(1), reuseInstances: true,
    });
}

// ---- the measurements ------------------------------------------------------------------------------------
// One 8-bit sRGB channel back to the light it encodes. The real curve and not a 2.2 power, which is off by up
// to 4% near black -- precisely where the dark side of limn's ring and the whole contact-glow band live.
export const lin = (c) => { const v = c / 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };

/** The summed linear light at an integer pixel. */
export const light = (px, x, y) => { const i = (y * N3 + x) * 4; return lin(px[i]) + lin(px[i + 1]) + lin(px[i + 2]); };

/** Bilinear, because a 72-sample ring at a 13-px radius snaps onto far fewer than 72 distinct pixels. */
export const bil = (px, x, y) => {
    const x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0;
    let v = 0;
    for (const [dx, dy, w] of [[0, 0, (1 - fx) * (1 - fy)], [1, 0, fx * (1 - fy)],
                               [0, 1, (1 - fx) * fy], [1, 1, fx * fy]]) {
        const xx = Math.min(N3 - 1, Math.max(0, x0 + dx)), yy = Math.min(N3 - 1, Math.max(0, y0 + dy));
        const i = (yy * N3 + xx) * 4;
        v += w * (lin(px[i]) + lin(px[i + 1]) + lin(px[i + 2]));
    }
    return v;
};

/** The light on a ring at radius r of the quad, sampled bilinearly at `n` angles. */
export const ringProfile = (px, r, n = 64) => {
    const out = [];
    for (let a = 0; a < n; a++) {
        const th = a * 2 * Math.PI / n;
        out.push(bil(px, N3 / 2 + r * (N3 / 2) * Math.cos(th) - 0.5,
                         N3 / 2 + r * (N3 / 2) * Math.sin(th) - 0.5));
    }
    return out;
};

/** The ring's quarter-point: the rim with every species' own bright feature sorted out of the way. */
export const edgeQuartile = (px, r = 0.62) => {
    const v = ringProfile(px, r, 72).slice().sort((a, b) => a - b);
    return v[Math.floor(v.length / 4)];
};

/** A ring divided by the alpha actually read back, since the containment fades alpha across the glow band. */
export const ringNorm = (px, r) => {
    let sum = 0, alpha = 0, n = 0;
    for (let a = 0; a < 64; a++) {
        const th = a * Math.PI / 32;
        const x = Math.round(N3 / 2 + r * (N3 / 2) * Math.cos(th));
        const y = Math.round(N3 / 2 + r * (N3 / 2) * Math.sin(th));
        if (x < 0 || y < 0 || x >= N3 || y >= N3) continue;
        const i = (y * N3 + x) * 4;
        sum += light(px, x, y); alpha += px[i + 3]; n++;
    }
    return n && alpha ? sum / n / (alpha / n / 255) : 0;
};

/**
 * HOW MUCH THE LIGHT ON A FIXED RING CHANGES between two frames. A wobbling body moves its own rim in and out
 * past a fixed sampling circle, so the profile ON that circle changes; a frozen body's does not. No threshold,
 * no bisection, no edge to find -- which is why it is stable where three radius-FINDING measures were not (a
 * luminance threshold swung 63 to 174%, the peak-brightness radius read 0% and 56% on IDENTICAL pixels at two
 * frame sizes, because the interior and the specular both outrank the rim on some rays).
 */
export const ringChange = (a, b, r = 0.62) => {
    const A = ringProfile(a, r), B = ringProfile(b, r);
    const mean = A.reduce((x, y) => x + y, 0) / A.length;
    const d = A.map((v, i) => Math.abs(v - B[i]));
    return { max: Math.max(...d) / mean, mean: d.reduce((x, y) => x + y, 0) / d.length / mean };
};

/** The brightest interior pixel's position, clear of the rim. */
export const hotspot = (px) => {
    let best = -1, bx = 0, by = 0;
    for (let y = 0; y < N3; y++) for (let x = 0; x < N3; x++) {
        const dx = (x + 0.5) / N3 * 2 - 1, dy = (y + 0.5) / N3 * 2 - 1;
        if (Math.hypot(dx, dy) > 0.62 * 0.75) continue;
        const i = (y * N3 + x) * 4, v = px[i] + px[i + 1] + px[i + 2];
        if (v > best) { best = v; bx = x; by = y; }
    }
    return [bx, by];
};

/** The brightest interior value, clear of the rim. */
export const interiorPeak = (px) => {
    let best = -1;
    for (let y = 0; y < N3; y++) for (let x = 0; x < N3; x++) {
        const dx = (x + 0.5) / N3 * 2 - 1, dy = (y + 0.5) / N3 * 2 - 1;
        if (Math.hypot(dx, dy) > 0.62 * 0.75) continue;
        const i = (y * N3 + x) * 4, v = px[i] + px[i + 1] + px[i + 2];
        if (v > best) best = v;
    }
    return best;
};

/** The widest distance between a set of hotspots, in BODY RADII so the figure does not move with frame size. */
export const travelRadii = (pts) => {
    let m = 0;
    for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++)
        m = Math.max(m, Math.hypot(pts[i][0] - pts[j][0], pts[i][1] - pts[j][1]));
    return m / (0.62 * N3 / 2);
};

/** The mean linear light inside a disk of `r` body radii -- what a lit interior has and a dark shell has not. */
export const interiorMeanLight = (px, r = 0.70) => {
    let sum = 0, n = 0;
    for (let y = 0; y < N3; y++) for (let x = 0; x < N3; x++) {
        const dx = (x + 0.5) / N3 * 2 - 1, dy = (y + 0.5) / N3 * 2 - 1;
        if (Math.hypot(dx, dy) > 0.62 * r) continue;
        sum += light(px, x, y); n++;
    }
    return { mean: sum / n, n };
};

/**
 * HOW FAR THE COLOUR MOVED, SPLIT INTO LIGHTNESS AND HUE. The rail's spread axis is meant to move one and not
 * the other -- kit.ts: it "moves the hue while holding lightness and chroma exactly. The unsafe one is
 * trading chroma for hue, which is how a warm palette turns to mud" -- so a row that only asked whether the
 * picture CHANGED would pass on exactly the failure the axis exists to rule out.
 *
 * Pixels below `minChroma` are skipped because HUE IS UNDEFINED AT ZERO CHROMA: a near-neutral pixel has an
 * arbitrary angle and averaging it in is averaging in noise.
 */
export const hueShift = (a, b, minChroma = 0.01) => {
    const lab = (f, i) => linearToOklab(srgbToLinear(f[i] / 255), srgbToLinear(f[i + 1] / 255), srgbToLinear(f[i + 2] / 255));
    let dL = 0, dH = 0, n = 0;
    for (let i = 0; i < a.length; i += 4) {
        if (a[i + 3] < 200) continue;
        const A = lab(a, i), B = lab(b, i);
        if (Math.hypot(A.a, A.b) < minChroma || Math.hypot(B.a, B.b) < minChroma) continue;
        let dh = Math.atan2(B.b, B.a) - Math.atan2(A.b, A.a);
        dh = Math.abs(Math.atan2(Math.sin(dh), Math.cos(dh)));   // the SHORT way round
        dL += Math.abs(B.L - A.L); dH += dh; n++;
    }
    return { dL: dL / n, dHueDeg: dH / n * 180 / Math.PI, n };
};
