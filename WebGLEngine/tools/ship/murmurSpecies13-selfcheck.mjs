// WebGLEngine/tools/ship/murmurSpecies13-selfcheck.mjs -- v4639
//
// GATE THIRTEEN OVER THE SPECIES: CHORUS, the sixteenth of murmur's eighteen and the last this port carries
// of the four remaining after v4638. "Many faint lights breathing loosely, falling into alignment."
//
// *** THE SPECIES IS NOT THE BREATHING, AND ITS OWN FILE SPENDS ITS OPENING REFUSING THAT READING: *** "THE
// ONE HERO LICENSED A RHYTHM, and the licence is narrow. The family's verbs are FLOW and SETTLE, and
// breathing luminance is banned as a default motif precisely because it is the first thing everyone reaches
// for. The carve-out is for a species whose concept literally IS a rhythm ... the thing the species is
// actually about is not the breathing at all but the PHASE RELATIONSHIP between the breaths."
//
// *** AND THAT RELATIONSHIP IS THE ONE CLAIM THIS GATE CANNOT MAKE, FOR A REASON THAT IS ARITHMETIC IN
// murmur'S OWN SOURCE RATHER THAN A FAULT IN THE PORT. SECTION 3 IS THE MEASUREMENT. ***
//
// Its sibling duet is graded in tools/ship/murmurSpecies12-selfcheck.mjs; both solve their lights at the
// ray's closest approach rather than marching them, which is why they ship together.
"use strict";
import * as K from "../../render/murmurKit.mjs";
import { N3, sp, renderSpecies, light, interiorPeak } from "./murmurSpeciesFrames.mjs";

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const say = (m) => console.log("  ----  " + m);
const sec = (t) => console.log("\n" + t);

console.log("murmurSpecies13-selfcheck -- chorus's seven voices, their floor, and the phase ladder\n");

const DIM = 0.15;
const BASE = { glint: 0, density: 0.5, fold: 0.5, spread: 0, glow: DIM, glintRate: 0,
               layers: 0.5, parallax: 0.5, murk: 0.4, facet: 0.5, glim: 0.5, stone: 0.5,
               bow: 0.5, sway: 0.5, pin: 0.5, corona: 0.5, prom: 0.5, simmer: 0.5,
               ribbon: 0.5, swirl: 0.5, depth3d: 0.5, stream: 0.5, bend: 0.5, height: 0.5,
               sep: 0.5, orbit: 0.5, ratio: 0.5, voices: 0.5, sync: 0.5, breath: 0.5 };
const CH = (t, voice, extra = {}) => sp("chorus", t, voice, { ...BASE, ...extra });

// ONE BREATH PERIOD, off the species' own clock. per = 8.4 - pace * 1.32, and this gate runs at pace 0, so
// the period is exactly MH_CHORUS.perB. Fourteen samples across it.
const PER = K.MH_CHORUS.perB;
const CT = Array.from({ length: 14 }, (_, i) => i * PER / 14);

const FRAMES = [
    ...CT.map((t) => CH(t, 0.0, { breath: 1.0 })),   //  0..13  deepest breath
    ...CT.map((t) => CH(t, 0.0, { breath: 0.0 })),   // 14..27  shallowest
    CH(3.0, 0.0), CH(3.0, 1.0),                      // 28,29   level
];
const F = { deep: 0, shallow: 14, vLo: 28, vHi: 29 };
const run = await renderSpecies(FRAMES);
const okRun = run.ok && run.frames && run.frames.length === FRAMES.length;
if (!okRun) ok("!! the species render ran", false, `could not render: ${run.reason || "frames"}`);
const fr = (i) => run.frames[i];

// THE VOICES' OWN LIGHT, with the frame's background taken off. Seven small lights are a small part of a
// frame that also carries a medium and a lit shell, so a frame TOTAL is the wrong instrument for them -- the
// first cut of section 3 used one and read the medium.
const voiceLight = (px, q = 0.80) => {
    const V = [];
    for (let y = 0; y < N3; y++) for (let x = 0; x < N3; x++) {
        const dx = (x + 0.5) / N3 * 2 - 1, dy = (y + 0.5) / N3 * 2 - 1;
        if (Math.hypot(dx, dy) > 0.55) continue; V.push(light(px, x, y));
    }
    const S = V.slice().sort((a, b) => a - b), th = S[Math.floor(S.length * q)];
    return V.filter((v) => v > th).reduce((a, b) => a + (b - th), 0);
};
// HOW UNEQUAL THE VOICES ARE: the brightest LOCAL MAXIMUM over the fifth brightest, with the frame's median
// taken off both first.
//
// *** THE FIRST VERSION OF THIS TOOK A PERCENTILE THRESHOLD AND A SABOTAGE WALKED THROUGH IT. *** It read
// "brightest over dimmest among pixels above the 88th percentile", and the row built on it claimed a ratio is
// blind to a uniform gain. It is not, when the threshold is read off the same data: the voices sit on a
// BACKGROUND of medium and lit shell that does not scale with level, so raising every voice by one factor
// changes WHICH pixels clear the threshold, and the ratio grows even when the ensemble stays perfectly even.
// Replacing liftFront with an equal-average uniform lift took it from 5.00x to 13.11x -- indistinguishable
// from the real thing.
//
// Local maxima are threshold-free, and subtracting the median makes the ratio genuinely gain-invariant:
// (b + g*v1 - b) / (b + g*v5 - b) = v1/v5 for any g. Measured, the uniform lift now reads x0.858 against the
// front-weighted x3.828.
const voiceSpread = (px, n = 5) => {
    const V = [], M = [];
    for (let y = 1; y < N3 - 1; y++) for (let x = 1; x < N3 - 1; x++) {
        const dx = (x + 0.5) / N3 * 2 - 1, dy = (y + 0.5) / N3 * 2 - 1;
        if (Math.hypot(dx, dy) > 0.55) continue;
        const v = light(px, x, y); V.push(v);
        if (v >= light(px, x + 1, y) && v >= light(px, x - 1, y) &&
            v >= light(px, x, y + 1) && v >= light(px, x, y - 1)) M.push(v);
    }
    V.sort((a, b) => a - b);
    const med = V[Math.floor(V.length / 2)];
    M.sort((a, b) => b - a);
    return M.length < n ? 1 : (M[0] - med) / Math.max(M[n - 1] - med, 1e-9);
};

// =============================================================================================================
sec("1. *** THE ENSEMBLE NEVER BLINKS: the breath is floored and no voice goes out ***");
{
    if (!okRun) { ok("!! chorus rendered", false, "no frames"); }
    else {
        const deep = CT.map((_, i) => voiceLight(fr(F.deep + i)));
        const shal = CT.map((_, i) => voiceLight(fr(F.shallow + i)));
        const rd = Math.min(...deep) / Math.max(...deep), rs = Math.min(...shal) / Math.max(...shal);
        say(`over one breath period (${PER} s): breath 1 min/max ${rd.toFixed(3)}, breath 0 ${rs.toFixed(3)}; ` +
            `peak ${interiorPeak(fr(F.deep))} of 765`);

        // chorus.ts: "KEPT GENTLE, which is the other half of the licence. The depth of the breath is capped
        // so no voice ever goes out entirely -- the floor is a third -- and the period is long ... What that
        // produces even at full alignment is a slow swell across a field of small lights, not a blink."
        // life = 1 - breathe + breathe * sin^2, so one voice's floor is 1 - breathe: 0.25 at breath 1 and
        // 0.70 at breath 0. The ENSEMBLE's floor is higher than one voice's, because the seven are out of
        // phase and never bottom together -- which is why this row bounds the measured 0.375 rather than the
        // per-voice 0.25 it is derived from.
        ok("!! *** THE ENSEMBLE'S LIGHT NEVER FALLS BELOW A THIRD OF ITS PEAK, at the DEEPEST breath ***",
            rd > 0.30 && rd < 0.55 && rs > rd * 1.4,
            `at breath 1 the voices' light runs ${rd.toFixed(3)} of its own maximum at the bottom of the ` +
            `cycle, and at breath 0 ${rs.toFixed(3)}. One voice's floor is 1 - breathe, which is ` +
            `${(1 - (K.MH_CHORUS.breatheB + K.MH_CHORUS.breatheK)).toFixed(2)} at the deepest setting; the ` +
            `ensemble's is higher because the seven are out of phase and never bottom together. THE UPPER ` +
            `BOUND IS AS LOAD-BEARING AS THE LOWER: above 0.55 the breath would not be visible at all, which ` +
            `is the other way to fail "a slow swell across a field of small lights".`);
    }
}

// =============================================================================================================
sec("2. *** LEVEL PICKS OUT THE NEAREST, rather than turning everybody up ***");
{
    if (!okRun) { ok("!! the level frames rendered", false, "no frames"); }
    else {
        const a = voiceSpread(fr(F.vLo)), b = voiceSpread(fr(F.vHi));
        say(`brightest peak over fifth-brightest, median subtracted: voice 0 ${a.toFixed(3)} -> voice 1 ${b.toFixed(3)}`);

        // chorus.ts: "LEVEL PICKS OUT THE NEAREST. Voice does not simply brighten the ensemble: it weights
        // each voice by how near the front of the glass it is, so speaking makes the closest lights bloom and
        // leaves the far ones where they were. An ensemble where the front row answers is a much better
        // picture of being listened to than one where everybody gets louder." The lift is
        // 1 + voice * (0.25 + 1.15 * front), so a voice at the back gains 1.25x and one at the front 2.40x --
        // and the measurable consequence is that the SPREAD across the ensemble widens, which a uniform gain
        // cannot do at all: multiplying every voice by one number leaves a ratio of two of them unchanged.
        ok("!! *** THE ENSEMBLE GETS MORE UNEQUAL, WHICH A UNIFORM GAIN CANNOT DO ***",
            b > a * 1.8 && a > 1.5,
            `voice 0 -> 1 takes the brightest peak over the fifth-brightest from ${a.toFixed(3)} to ` +
            `${b.toFixed(3)}, x${(b / a).toFixed(2)} -- against x0.858 for a uniform lift of the same average, ` +
            `which is the sabotage that forced this instrument. The lift is 1 + voice * (${K.MH_CHORUS.liftB} + ` +
            `${K.MH_CHORUS.liftFront} * front), so the back of the shell gains ` +
            `${(1 + K.MH_CHORUS.liftB).toFixed(2)}x and the front ` +
            `${(1 + K.MH_CHORUS.liftB + K.MH_CHORUS.liftFront).toFixed(2)}x. A RATIO IS THE RIGHT ` +
            `INSTRUMENT ONLY ONCE IT IS BLIND TO A UNIFORM GAIN, which took two tries: see the note on ` +
            `voiceSpread above. Local maxima with the median subtracted are; a percentile threshold is not.`);
    }
}

// =============================================================================================================
sec("3. *** THE PHASE LADDER: what sync does, measured, and it is not what the prose says ***");
{
    // *** THIS SECTION MAKES NO ASSERTION, AND THAT IS ITS POINT. *** chorus.ts's headline is "As sync rises
    // they gather, and at one they breathe as a single body. That transition from many rhythms to one is the
    // whole species." The port transcribes the line that implements it exactly:
    //
    //     float phase = mix(fk * 0.897, 0.0, sync) * 6.2831853;
    //
    // AND THAT SCALES A MODULAR QUANTITY LINEARLY. Phase lives on a circle, so multiplying the ladder by
    // (1 - sync) does not gather the seven -- it RE-SPACES them, at a spacing of 0.897 * (1 - sync) turns,
    // and whether that spacing clusters them depends on its fractional part, which wanders. Computed off the
    // same constants the shader uses, over three breath periods, the ensemble's modulation is:
    //
    //     sync 0.00  ->  9.89% of mean, min/max 0.755     phases 0.00 0.90 0.79 0.69 0.59 0.49 0.38
    //     sync 0.25  ->  6.63%,         0.829             phases 0.00 0.67 0.35 0.02 0.69 0.36 0.04
    //     sync 0.50  -> 14.65%,         0.657             phases 0.00 0.45 0.90 0.35 0.79 0.24 0.69
    //     sync 0.75  ->  2.61%,         0.929             phases 0.00 0.22 0.45 0.67 0.90 0.12 0.35
    //     sync 0.90  ->  8.17%,         0.793             phases 0.00 0.09 0.18 0.27 0.36 0.45 0.54
    //     sync 1.00  -> 42.43%,         0.250             phases 0.00 0.00 0.00 0.00 0.00 0.00 0.00
    //
    // NOT MONOTONIC, AND THE GATHER IS AN ENDPOINT EFFECT: only at sync exactly 1 do all seven phases
    // collapse to zero. AND THIS PORT CANNOT REACH THAT ENDPOINT. The shader computes
    // sync = clamp(syncK * 0.75 + 0.85 * drive + 0.55 * complete), and neither `drive` nor `complete` is a
    // signal this port wires -- it has no state machine -- so the knob alone tops out at 0.75, which the
    // table above shows is the LEAST modulated setting of any sampled.
    //
    // SO THE SPECIES' HEADLINE IS UNREACHABLE HERE, AND FAITHFULLY SO. Three things follow, and the third is
    // the one that matters:
    //   (a) The port is correct: the line is transcribed, the constant is murmur's, the clamp is murmur's.
    //   (b) A row asserting "sync raises the ensemble's swell" would be FALSE over the reachable range and
    //       would have been written if the prose had been trusted instead of measured. The first cut of this
    //       gate did exactly that and read 4.32% at sync 0 against 3.52% at sync 1 -- backwards, and small
    //       enough to look like noise rather than like a finding.
    //   (c) WHAT IS BEING REPORTED IS A PROPERTY OF murmur's SOURCE, not of this port, and it is reported
    //       rather than repaired because repairing it would mean diverging from the source on this port's
    //       own authority. Somebody who wants the gather from the knob wants phase = fk * 0.897 * (1 - sync)
    //       replaced by a scheme that is monotone on the circle; that is a change to the design and it needs
    //       murmur's agreement, not a gate's.
    say("sync is NOT graded: the phase ladder is scaled linearly on a circle, so its modulation runs 9.89%, " +
        "6.63%, 14.65%, 2.61%, 8.17%, 42.43% at sync 0, 0.25, 0.50, 0.75, 0.90, 1.00 -- non-monotonic, and " +
        "the gather happens only AT 1.00. This port's knob tops out at 0.75 because `drive` and `complete` " +
        "are not wired, so the species' headline gesture is unreachable here. Faithful, measured, and " +
        "reported rather than repaired -- see the note above this line.");
}

console.log("\n" + (fails ? "FAIL -- " + fails + " check(s)" : "ALL GREEN") +
    "\nCHORUS: seven voices on a Fibonacci shell, each solved at the ray's closest approach, breathing on a " +
    "floor that keeps the ensemble from ever blinking, with level picking out the front row rather than " +
    "turning everybody up. THE PHASE RELATIONSHIP THE SPECIES IS ABOUT IS MEASURED AND NOT ASSERTED, for the " +
    "reason section 3 sets out at length." +
    "\nALSO NOT CLAIMED: the SHELL'S ARRANGEMENT. chorus.ts spreads the seven by the golden angle so they " +
    "are \"evenly spread over the sphere without any two ever lining up into a row or a ring\", and replacing " +
    "2.39996 with a seventh of a turn -- perfectly regular azimuths -- changes nothing these rows measure, " +
    "because none of them reads WHERE the voices are. Grading it wants a spatial instrument at a frame size " +
    "that can resolve seven voices, which is the same limit the next paragraph runs into." +
    "\nALSO NOT CLAIMED: that the seven are COUNTABLE. chorus.ts calls that \"the one thing an ensemble has " +
    "to be\" and sizes its voices for it -- at 0.14 against a spacing of 0.35 \"the seven ran together into " +
    "one lobed mass\". At this gate's 48-pixel frame a voice is about one and a half pixels across and the " +
    "scatter halo is wider than the spacing, so a flood fill above the ninetieth percentile finds two or " +
    "three blobs, not seven. That is the FRAME's limit and not the shader's, and a row built on it would be " +
    "grading the harness." +
    "\nWHAT IS NOT CLAIMED HERE: duet, its sibling from the same round " +
    "(tools/ship/murmurSpecies12-selfcheck.mjs), and everything named there. TWO species remain: prism and " +
    "helix.");
process.exit(fails ? 1 : 0);
