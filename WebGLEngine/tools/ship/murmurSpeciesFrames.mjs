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

/**
 * *** THE OPERATING POINT IS STATED AS THE CONDITIONED SIGNAL NOW, AND THE RAW KNOBS ARE DERIVED FROM IT. ***
 *
 * Until v4641 render/aiPresenceOrbTsl.mjs handed the raw `voice` uniform straight to 44 species sites and the
 * STYLE knob `glintRate` to 8 more, so setting voice = 0.3 put 0.3 into the shader. It now calls the kit's
 * mh_live first, exactly as murmur's eighteen do, and 0.3 idle conditions to 0.3^0.65 * 0.55 = 0.2504.
 *
 * SO THESE TWO CONSTANTS ANSWER A QUESTION THE ROUND HAD TO ANSWER: hold the RAW knob and let every species
 * row see a 20% smaller signal, or hold the CONDITIONED one and let the rows keep the calibration they were
 * measured at? Holding the raw knob would have moved four gates below their bounds -- abyss's creature row,
 * droplet's swell, sol's granulation and flux's curtains, the last of which stopped finding a half-height at
 * all -- and repairing that by lowering four bounds is indistinguishable from budgeting a red down to green.
 * Holding the CONDITIONED signal instead leaves ALL EIGHTEEN species BYTE-IDENTICAL to
 * v4640, which is the strongest thing a correctness fix to the wiring can say for itself: the signal the
 * species see is the same signal, and only the path it arrives by changed.
 *
 * VOICE and ACTIVITY are therefore the raw knob values that PRODUCE the conditioned pair below, and gates
 * whose CPU half predicts what the shader will do must use VOICE_LIVE and PACE_LIVE rather than these. The
 * inversion here is not a grading of mh_live -- tools/ship/murmurLive-selfcheck.mjs does that, against the
 * four constants written out by hand -- it is only how this file names where it stands.
 *
 * PACE_LIVE is 0.30 because that is what the eight borrowed sites were reading: glintRate's own default out of
 * murmur's styles.ts roster. Choosing any other number would have moved six species for a reason unrelated to
 * the fix.
 */
export const VOICE_LIVE = 0.30;
export const PACE_LIVE = 0.30;
//
// BOTH ARE A GENUINE INVERSE AND NOT A RATIO, which is worth the line because the first cut of this file got
// exactly that wrong: it wrote VOICE_LIVE * 0.55^(-1/0.65), which is the factor between two LEVELS that
// condition to the same signal in two different states -- the right formula for the equivalence rows in
// tools/ship/murmurLive-selfcheck.mjs and the wrong one for an operating point. It put the conditioned voice
// at 0.457 instead of 0.300, and all eighteen species moved rather than the six with a cadence site. The
// inverse of v = L^e * w is L = (v / w)^(1/e).
export const VOICE = Math.pow(VOICE_LIVE / 0.55, 1 / 0.65);       // 0.3935693
export const ACTIVITY = Math.pow(PACE_LIVE / 0.60, 1 / 0.85);     // 0.4424325
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
    ({ factoryArgs: { species },
       // activity and stateIndex are named on EVERY frame for the same reason the ink is: setKnobs writes only
       // the names present in its argument, so a knob one frame sets and the next does not mention keeps the
       // previous frame's value. They are also the two knobs a species gate never wants to vary -- a row here
       // grades a SPECIES, and tools/ship/murmurLive-selfcheck.mjs is where the live signals are the subject.
       knobs: { time, voice, activity: ACTIVITY, stateIndex: 0, colors: { ink: INK }, ...extra } });

/**
 * ONE LAUNCH FOR EVERY FRAME A GATE ASKS FOR. The launch is nearly the whole cost, so they share a page, and
 * reuseInstances means frames differing only in knobs share a compiled shader as well -- nine frames built
 * four shaders when this was one gate, and 0 bytes of 82,944 differed from building nine.
 */
/**
 * *** AND THE FRAME SIZE IS AN ARGUMENT NOW, BECAUSE TWO SPECIES ASKED FOR IT AND ONE OF THEM COULD NOT BE
 * GRADED WITHOUT IT. *** N3 is 48, which is plenty for a body, a medium and anything that fills them -- and
 * it is below the resolution of a FIGURE. chorus's seven voices are about one and a half pixels across at 48
 * and its own file calls being countable "the one thing an ensemble has to be"; helix's strands are 0.062 of
 * the body wide, which is about one pixel, and its own file sets its whole spec as whether somebody says
 * "DNA" inside three seconds. Both were recorded as ungradeable at 48 rather than graded by proxy.
 *
 * THE COST IS SMALL BECAUSE THE LAUNCH IS THE COST. Measured on this box, the same two-frame helix render
 * takes 888 ms at 48, 924 ms at 96 and 1,229 ms at 128 -- a 7.1x increase in pixels for 1.38x the time,
 * because a headless Chromium start dominates everything the GPU then does. A gate that needs to see a figure
 * should pay the 340 ms rather than measure something else and call it the figure.
 *
 * Callers that pass nothing get N3 and are byte-for-byte unaffected.
 */
export async function renderSpecies(frames, size = N3) {
    return renderThreeTslToPixels({
        engineRoot: ENG, moduleImportPath: "/render/aiPresenceOrbTsl.mjs", factoryName: "makeAiPresenceOrbTsl",
        factoryArgs: frames[0].factoryArgs, knobs: frames[0].knobs, width: size, height: size,
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

/**
 * THE SAME ROTATION WITH ITS SIGN KEPT, and the sign is the whole reason this exists next to hueShift().
 *
 * hueShift() takes an absolute value per pixel, which is right for "did the spread axis turn the body" and
 * WRONG for "did these two events turn it in OPPOSITE DIRECTIONS". abyss's three lanes take one hue step each
 * -- -1, 0, +1 -- so a pass by its first lane must turn the body one way and a pass by its third must turn it
 * the other. Under |dh| those two readings are indistinguishable from each other AND from a species whose
 * every lane took the same step: all three give a positive number. Measured on real frames, the signed
 * version reads +17.8 degrees on a third-lane pass and -10.5 on a first-lane pass, and the absolute version
 * reads 17.8 and 10.5 -- two numbers that agree with the hero and with three sabotages of it equally well.
 *
 * The mean is taken over the SIGNED per-pixel rotation, so a body whose halves turned opposite ways would
 * read near zero here and large under hueShift(); both figures are reported by the rows that use this.
 */
export const hueTurn = (a, b, minChroma = 0.01) => {
    const lab = (f, i) => linearToOklab(srgbToLinear(f[i] / 255), srgbToLinear(f[i + 1] / 255), srgbToLinear(f[i + 2] / 255));
    let dH = 0, n = 0;
    for (let i = 0; i < a.length; i += 4) {
        if (a[i + 3] < 200) continue;
        const A = lab(a, i), B = lab(b, i);
        if (Math.hypot(A.a, A.b) < minChroma || Math.hypot(B.a, B.b) < minChroma) continue;
        const dh = Math.atan2(B.b, B.a) - Math.atan2(A.b, A.a);
        dH += Math.atan2(Math.sin(dh), Math.cos(dh)); n++;   // the SHORT way round, sign kept
    }
    return { deg: n ? dH / n * 180 / Math.PI : 0, n };
};

/** How far apart two hotspots are, in PIXELS of the rendered frame. */
export const hotspotMove = (a, b) => {
    const p = hotspot(a), q = hotspot(b);
    return Math.hypot(p[0] - q[0], p[1] - q[1]);
};

/**
 * THE BEST-FIT RADIAL MAGNIFICATION between two frames: the s for which B's ring profile matches A's read at
 * r/s, over a band spanning the rim. Each profile is normalised by its own mean first, so a frame that is
 * simply brighter does not register as a frame that is bigger.
 *
 * *** IT DOES NOT MEASURE SCALE ON ITS OWN, AND THE ROW THAT USES IT HAS TO EARN THAT. *** Three
 * radius-FINDING instruments were already rejected in this module with their numbers recorded; this one is a
 * fourth measurement that fails the same way if it is read naively. Measured: droplet at a FIXED bodyScale
 * of exactly 1, with only its deformation amplitude taken from 0.052 to 0.092 by the wobble knob, fits a
 * "magnification" of 1.0220 -- LARGER than the 1.0085 its real swell produces across a time pair. A bigger
 * amplitude pushes the rim outward on average, and this fit cannot tell that from a bigger body.
 *
 * So it is only a scale when the two frames carry the SAME deformation amplitude. droplet's amplitude and
 * its bodyScale are both driven by `swell`, but `wobble` moves the amplitude alone -- so trading voice
 * against wobble holds the amplitude fixed while the scale moves, and the fit then reads 1.0420 against a
 * bodyScale prediction of 1.04983 from the CPU half, with a species whose bodyScale is always 1 reading
 * 1.0000 across the same voice change. See tools/ship/murmurSpecies2-selfcheck.mjs section 5.
 */
export const radialScale = (a, b, lo = 0.50, hi = 0.80, step = 0.01) => {
    const radii = [];
    for (let r = lo; r <= hi + 1e-9; r += step) radii.push(r);
    const band = (px, r) => {
        let s = 0;
        for (let k = 0; k < 96; k++) {
            const th = k * 2 * Math.PI / 96;
            s += bil(px, N3 / 2 + r * (N3 / 2) * Math.cos(th) - 0.5, N3 / 2 + r * (N3 / 2) * Math.sin(th) - 0.5);
        }
        return s / 96;
    };
    const prof = (px) => radii.map((r) => band(px, r));
    const at = (p, r) => {
        if (r <= radii[0]) return p[0];
        if (r >= radii[radii.length - 1]) return p[p.length - 1];
        const i = Math.min(radii.length - 2, Math.floor((r - radii[0]) / step)), f = (r - radii[i]) / step;
        return p[i] * (1 - f) + p[i + 1] * f;
    };
    const pa = prof(a), pb = prof(b);
    const na = pa.reduce((x, y) => x + y, 0) / pa.length, nb = pb.reduce((x, y) => x + y, 0) / pb.length;
    let best = 1, bestErr = Infinity;
    for (let s = 0.90; s <= 1.10001; s += 0.0005) {
        let e = 0;
        for (let i = 0; i < radii.length; i++) e += Math.abs(pb[i] / nb - at(pa, radii[i] / s) / na);
        if (e < bestErr) { bestErr = e; best = s; }
    }
    return best;
};

/**
 * THE INTERIOR'S LIGHT AS A DISTRIBUTION rather than as a mean, which is the only way to say "this cloud has
 * real dark in it" without saying it about the average.
 *
 * *** A MEAN CANNOT TELL A CLOUD FROM A GRADIENT, and that is the whole reason this exists. *** murmur's two
 * volumetric heroes are domain-warped mist whose design question, in nebula.ts's own words, is "whether five
 * samples down a refracted ray can make a cloud read as a cloud rather than as a soft gradient with noise on
 * it". A gradient and a cloud can carry the same mean; what separates them is the SPREAD between the dark
 * gaps and the lit folds. tempest sets its density smoothstep's lower edge further up than nebula's
 * (-0.12 against -0.20) and absorbs at 3.60 against 3.10, precisely so its cloud has somewhere dark for its
 * lightning to be seen against -- and that difference is invisible to a mean and plain in the percentiles.
 */
export const interiorSpread = (px, r = 0.70) => {
    const v = [];
    for (let y = 0; y < N3; y++) for (let x = 0; x < N3; x++) {
        const dx = (x + 0.5) / N3 * 2 - 1, dy = (y + 0.5) / N3 * 2 - 1;
        if (Math.hypot(dx, dy) > 0.62 * r) continue;
        v.push(light(px, x, y));
    }
    v.sort((a, b) => a - b);
    const at = (q) => v[Math.min(v.length - 1, Math.floor(v.length * q))];
    return { p10: at(0.10), median: at(0.50), p90: at(0.90), n: v.length,
             contrast: at(0.90) / Math.max(at(0.10), 1e-6) };
};
