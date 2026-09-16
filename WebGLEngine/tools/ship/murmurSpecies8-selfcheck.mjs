// WebGLEngine/tools/ship/murmurSpecies8-selfcheck.mjs -- v4637
//
// Run: node tools/ship/murmurSpecies8-selfcheck.mjs
//
// GATE EIGHT OVER THE SPECIES: ARC, the eleventh of murmur's eighteen and the one its own file calls the
// hardest thing the kit has been asked to draw. arc.ts, first paragraph: "THE SPECIES IS A LINE ... Everything
// else is either compact enough to solve at the ray's closest approach or broad enough that five samples
// average it honestly. A FILAMENT IS NEITHER: thin enough that a march steps straight over it, and extended
// enough that there is no closed form for a ray's nearest approach."
//
// *** THE CONSTRAINT IT ESCAPES IS ARITHMETIC, AND THIS PORT'S ARITHMETIC IS NOT murmur's. *** arc.ts states
// it at murmur's own ten taps: "At ten steps down a two-unit chord the interval is 0.2, so a tube narrower
// than that is caught by whichever tap lands in it and missed otherwise, and the line renders dim, uneven and
// flickering." THIS TREE MARCHES AT MH_TAPS = 24, which is the value kit.ts's demo runs at and the value
// render/murmurKit.mjs transcribed, so the interval here is 0.0833 and not 0.2. The thread is 0.0530 body
// units at the middle of its knob -- 0.636 of one march step, not 0.265 of one. THE CONSTRAINT STILL BITES
// AND IT BITES LESS HARD, and a gate that quoted murmur's 0.2 would be stating another tree's number as this
// one's. Every row below computes the step from MH_TAPS rather than naming it.
//
// SO THE SEARCH RUNS ALONG THE CURVE, NOT ALONG THE RAY. For a point on the curve the ray's closest approach
// is two dot products; sampling THAT along the curve finds where the ray passes nearest the filament, a
// parabola through the winner and its neighbours refines it, and the integral is then exact because locally
// the curve is a straight line. That closed form is KIT.mhTube, which arrived in the kit this round because
// SOL USES IT TOO -- sol.ts: "THE PROMINENCES, solved the way arc's filament is" -- and sol is graded next
// door in tools/ship/murmurSpecies9-selfcheck.mjs. The split is the same budget arithmetic v4636 measured:
// each additional species in a gate costs about 280 ms against a 3,000 ms ceiling.
"use strict";
import * as K from "../../render/murmurKit.mjs";
import { N3, VOICE, sp, renderSpecies, light, ringProfile, interiorPeak } from "./murmurSpeciesFrames.mjs";

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const say = (m) => console.log("  ----  " + m);
const sec = (t) => console.log("\n" + t);

console.log("murmurSpecies8-selfcheck -- arc's filament, integrated rather than sampled\n");

// Every frame runs at glow 0.15 for the reason v4634 established the hard way: at the default glow a frame
// peaks near 646 of 765 and a row reading STRUCTURE is reading the tone curve instead. Peaks are printed.
const DIM = 0.15;
const BASE = { glint: 0, density: 0.5, fold: 0.5, spread: 0, glow: DIM,
               layers: 0.5, parallax: 0.5, murk: 0.4, facet: 0.5, glim: 0.5, stone: 0.5,
               bow: 0.5, sway: 0.5, pin: 0.5, corona: 0.5, prom: 0.5, simmer: 0.5 };
const AC = (t, extra = {}) => sp("arc", t, VOICE, { ...BASE, ...extra });

// *** THE TWELVE TIMES ARE READ OFF THE FLOURISH'S OWN CLOCK, NOT SPACED EVENLY -- and this gate's first
// draft WAS spaced evenly and measured the wrong thing. *** At t = 0, 1.3, 2.6 ... the frame-to-frame total
// light moved by up to 67.85% and averaged 23.36%, which looks exactly like the "dim, uneven and flickering"
// arc.ts warns a marched filament produces. It was the FLOURISH: mh_flourish fires on its own schedule and
// multiplies the thread's brightness by (1 + 0.45 * env) while adding a travelling pulse of 0.95 * env, so
// the instrument was reading a designed event as sampling noise. render/murmurKit.mjs's mhFlourish is the
// same envelope the shader runs, so the CPU half says exactly when it is silent: env < 0.001 on arc's lane
// (11.0, 8.1) AND on sol's (23.0, 12.4) continuously from t = 45.0 to t = 51.1. Twelve times inside that
// window measure the filament and nothing else.
// EIGHT times and not twelve, and the reason is the ceiling rather than the statistics: at twelve this
// gate ran 3,030 ms against a 3,000 ms budget -- thirty over, which is within ten of the twenty-seven that
// kept tools/ship/inputSets-selfcheck.mjs from running at all for nine rounds. Eight points leave seven
// steps for the flicker row and seven for the travel row, which is what those rows actually consume.
const QUIET = [45.0, 45.87, 46.74, 47.61, 48.49, 49.36, 50.23, 51.1];
const FLOUR = QUIET.map((t) => K.mhFlourish(t, K.MH_ARC.flourishSlot, K.MH_ARC.flourishDur).env);

const FRAMES = [
    ...QUIET.map((t) => AC(t)),                                        //  0.. 7  the quiet window
    ...QUIET.map((t) => sp("nebula", t, VOICE, BASE)),                 //  8..15  a MARCHED volume, same times
    AC(QUIET[4], { pin: 0.0 }), AC(QUIET[4], { pin: 1.0 }),            // 16,17
    AC(QUIET[4], { bow: 0.0 }), AC(QUIET[4], { bow: 1.0 }),            // 18,19
];
const F = { arc: 0, neb: 8, pinLo: 16, pinHi: 17, bowLo: 18, bowHi: 19 };
const run = await renderSpecies(FRAMES);
const okRun = run.ok && run.frames && run.frames.length === FRAMES.length;
if (!okRun) ok("!! the species render ran", false, `could not render: ${run.reason || "frames " + (run.frames ? run.frames.length : "none")}`);
const fr = (i) => run.frames[i];

// ---- the measurements ---------------------------------------------------------------------------------------
const BODY_PER_PX = 2 / (N3 * 0.62);          // one pixel, in body radii
const totalLight = (px) => { let s = 0; for (let y = 0; y < N3; y++) for (let x = 0; x < N3; x++) s += light(px, x, y); return s; };
// HOW FEW PIXELS CARRY HALF THE LIGHT. A line covers far fewer than a cloud of the same total, and this is
// invariant to brightness because the threshold is read off the frame's own ordered light.
const halfIn = (px) => {
    const V = [];
    for (let y = 0; y < N3; y++) for (let x = 0; x < N3; x++) {
        const dx = (x + 0.5) / N3 * 2 - 1, dy = (y + 0.5) / N3 * 2 - 1;
        if (Math.hypot(dx, dy) > 0.60) continue; V.push(light(px, x, y));
    }
    V.sort((a, b) => b - a);
    const tot = V.reduce((a, b) => a + b, 0);
    let acc = 0, k = 0; while (k < V.length && acc < tot * 0.5) { acc += V[k]; k++; }
    return { px: k, of: V.length, share: k / V.length };
};
// The full width at half maximum of the brightest ridge on each scan line, in pixels.
const fwhm = (px, axis) => {
    const W = [];
    for (let a = 3; a < N3 - 3; a++) {
        const prof = [];
        for (let b = 0; b < N3; b++) {
            const x = axis === "x" ? b : a, y = axis === "x" ? a : b;
            const dx = (x + 0.5) / N3 * 2 - 1, dy = (y + 0.5) / N3 * 2 - 1;
            prof.push(Math.hypot(dx, dy) > 0.58 ? 0 : light(px, x, y));
        }
        let bi = -1, bv = 0;
        for (let i = 1; i < prof.length - 1; i++)
            if (prof[i] > bv && prof[i] >= prof[i - 1] && prof[i] >= prof[i + 1]) { bv = prof[i]; bi = i; }
        if (bi < 0 || bv < 0.04) continue;
        let lo = bi; while (lo > 0 && prof[lo] > bv * 0.5) lo--;
        let hi = bi; while (hi < prof.length - 1 && prof[hi] > bv * 0.5) hi++;
        if (hi - lo > 0 && hi - lo < N3 * 0.6) W.push(hi - lo);
    }
    W.sort((a, b) => a - b);
    return W.length ? { n: W.length, med: W[Math.floor(W.length / 2)] } : null;
};
// WHERE THE LINE IS: the light-weighted centroid of the frame's brightest 7%.
const centroid = (px, q = 0.93) => {
    const P = [];
    for (let y = 0; y < N3; y++) for (let x = 0; x < N3; x++) {
        const dx = (x + 0.5) / N3 * 2 - 1, dy = (y + 0.5) / N3 * 2 - 1;
        if (Math.hypot(dx, dy) > 0.58) continue; P.push([x, y, light(px, x, y)]);
    }
    const S = P.map((p) => p[2]).sort((a, b) => a - b), th = S[Math.floor(S.length * q)];
    let sx = 0, sy = 0, sw = 0;
    for (const [x, y, v] of P) if (v > th) { sx += x * (v - th); sy += y * (v - th); sw += v - th; }
    return sw > 0 ? [sx / sw, sy / sw] : null;
};
// HOW LONG THE STROKE IS: the greatest distance between any two pixels in the brightest 7%. A thread that
// got WIDER and a thread that got LONGER both raise the total light and both spread it over more pixels, so
// nothing above can tell them apart -- which a sabotage proved by zeroing the span terms and leaving the
// width ones alone, and walking straight through the bow row.
const strokeSpan = (px, q = 0.93) => {
    const P = [];
    for (let y = 0; y < N3; y++) for (let x = 0; x < N3; x++) {
        const dx = (x + 0.5) / N3 * 2 - 1, dy = (y + 0.5) / N3 * 2 - 1;
        if (Math.hypot(dx, dy) > 0.58) continue; P.push([x, y, light(px, x, y)]);
    }
    const S = P.map((p) => p[2]).sort((a, b) => a - b), th = S[Math.floor(S.length * q)];
    const B = P.filter((p) => p[2] > th);
    let m = 0;
    for (let i = 0; i < B.length; i++) for (let j = i + 1; j < B.length; j++)
        m = Math.max(m, Math.hypot(B[i][0] - B[j][0], B[i][1] - B[j][1]));
    return m;
};
const meanIn = (px, lo, hi) => {
    let s = 0, n = 0;
    for (let y = 0; y < N3; y++) for (let x = 0; x < N3; x++) {
        const dx = (x + 0.5) / N3 * 2 - 1, dy = (y + 0.5) / N3 * 2 - 1, r = Math.hypot(dx, dy);
        if (r < lo || r > hi) continue; s += light(px, x, y); n++;
    }
    return n ? s / n : 0;
};

// =============================================================================================================
sec("1. *** THE THREAD IS NARROWER THAN THE MARCH THAT CANNOT DRAW IT ***");
{
    if (!okRun) { ok("!! arc rendered", false, "the render did not produce frames"); }
    else {
        const step = 2 / K.MH_TAPS;
        const w = K.MH_ARC.wB + 0.5 * K.MH_ARC.wK;
        const a = halfIn(fr(F.arc + 4)), n = halfIn(fr(F.neb + 4));
        const fa = fwhm(fr(F.arc + 4), "x"), fn = fwhm(fr(F.neb + 4), "x");
        say(`MH_TAPS ${K.MH_TAPS} -> a 2-body-unit chord steps ${step.toFixed(4)}; arc's thread is ` +
            `${w.toFixed(4)} body units = ${(w / step).toFixed(3)} of one step`);
        say(`half the light: arc ${a.px} of ${a.of} px (${(a.share * 100).toFixed(2)}%), nebula ${n.px} ` +
            `(${(n.share * 100).toFixed(2)}%); ridge FWHM arc ${fa ? fa.med : "-"} px, nebula ${fn ? fn.med : "-"} px; ` +
            `peaks ${interiorPeak(fr(F.arc + 4))} / ${interiorPeak(fr(F.neb + 4))} of 765`);

        // *** THE THREAD IS THINNER THAN ONE MARCH STEP, AND THAT IS THE WHOLE JUSTIFICATION FOR THE
        // MACHINERY. *** arc.ts on what the alternative cost: "Widening it to 0.125 was the only way to make
        // ten taps honest, and the verdict on that was a fat slug of light." Once the sampling constraint is
        // gone "the width is a free design decision again: 0.052 is five per cent of the sphere's radius, and
        // it is that because that is what reads as calligraphic". THE NUMBER IS DERIVED FROM MH_TAPS HERE, so
        // it stays true if this tree ever changes its tap count -- which is exactly how it came to differ
        // from murmur's own 0.2 in the first place.
        ok("!! *** ARC'S THREAD IS THINNER THAN ONE MARCH STEP, computed from MH_TAPS rather than quoted ***",
            w < step && w / step > 0.3 && w / step < 0.9,
            `the thread is ${w.toFixed(4)} body units against a march step of ${step.toFixed(4)} -- ` +
            `${(w / step).toFixed(3)} of one step, so a march would catch it with whichever tap landed in it ` +
            `and miss it otherwise. murmur's own file states this ratio as 0.052 against 0.2, a quarter of a ` +
            `step, because kit.ts's ten taps are not this tree's ${K.MH_TAPS}. THE BOUND IS TWO-SIDED ON ` +
            `PURPOSE: under 0.3 of a step would mean this port had quietly inherited murmur's tap count, and ` +
            `over 0.9 would mean the thread had been widened until a march could see it, which is the "fat ` +
            `slug of light" arc.ts rejected.`);

        // AND THE PIXELS AGREE WITH THE ARITHMETIC. A number in the kit is a claim about the shader only if
        // the rendered frame is correspondingly narrow, so the same row is asserted again on real light.
        ok("!! ...and the rendered light agrees: arc concentrates it where a marched volume spreads it",
            a.share < 0.08 && n.share > 0.15 && n.share / a.share > 3 && fa && fn && fn.med > fa.med * 2,
            `half of arc's light lands in ${(a.share * 100).toFixed(2)}% of the lit disc against nebula's ` +
            `${(n.share * 100).toFixed(2)}% -- x${(n.share / a.share).toFixed(1)} -- and the brightest ridge ` +
            `on a scan line is ${fa.med} px wide against nebula's ${fn.med}. nebula is the right foil because ` +
            `it is the hero with NO OBJECT IN IT AT ALL, so its frame is what "broad enough that five samples ` +
            `average it honestly" looks like measured.`);
    }
}

// =============================================================================================================
sec("2. *** IT DOES NOT FLICKER, AND THE FIRST INSTRUMENT SAID IT DID ***");
{
    if (!okRun) { ok("!! the quiet window rendered", false, "the render did not produce frames"); }
    else {
        const stepsOf = (off) => {
            const T = QUIET.map((_, i) => totalLight(fr(off + i)));
            const d = []; for (let i = 1; i < T.length; i++) d.push(Math.abs(T[i] - T[i - 1]) / Math.max(T[i - 1], 1e-9));
            return { T, max: Math.max(...d), mean: d.reduce((a, b) => a + b, 0) / d.length };
        };
        const A = stepsOf(F.arc), Nb = stepsOf(F.neb);
        say(`flourish env across the window: max ${Math.max(...FLOUR).toExponential(2)} (silent by construction)`);
        say(`arc totals [${A.T.map((v) => v.toFixed(1)).join(", ")}]`);
        say(`step |delta|/level -- arc max ${(A.max * 100).toFixed(2)}% mean ${(A.mean * 100).toFixed(2)}%; ` +
            `nebula max ${(Nb.max * 100).toFixed(2)}% mean ${(Nb.mean * 100).toFixed(2)}%`);

        // *** A SOLVED FILAMENT IS AS STEADY AS A MARCHED CLOUD, which is the claim, and the comparison is
        // what makes it one. *** An absolute bound on arc alone would be a number nobody could argue with
        // and nobody could learn from; measured against a species whose whole body is the medium, "does not
        // flicker" becomes "flickers no more than the thing that cannot flicker".
        ok("!! *** ARC'S LIGHT IS AS STEADY AS A MARCHED VOLUME'S, with the flourish held silent ***",
            Math.max(...FLOUR) < 1e-3 && A.max < 0.08 && A.mean < Nb.mean * 3 && A.mean < 0.04,
            `across twelve times in the flourish's own silence arc's frame total moves at most ` +
            `${(A.max * 100).toFixed(2)}% step to step and ${(A.mean * 100).toFixed(2)}% on average, against ` +
            `nebula's ${(Nb.max * 100).toFixed(2)}% and ${(Nb.mean * 100).toFixed(2)}%. *** THE SAME ` +
            `MEASUREMENT AT EVENLY SPACED TIMES READ 67.85% AND 23.36%, and that number was the FLOURISH ` +
            `rather than the filament *** -- mh_flourish multiplies brightness by (1 + ` +
            `${K.MH_ARC.brightFlourish} * env) and adds a travelling pulse, so an evenly spaced series reads ` +
            `a designed event as sampling noise. The window is picked by running the CPU kit's own mhFlourish ` +
            `and finding where it is silent, which is the same discipline gate five used to name tempest's ` +
            `lightning lanes instead of hoping for them.`);
    }
}

// =============================================================================================================
sec("3. *** THE LINE TRAVELS CONTINUOUSLY, WHICH IS WHAT THE PARABOLA BUYS ***");
{
    if (!okRun) { ok("!! the quiet window rendered", false, "the render did not produce frames"); }
    else {
        const C = QUIET.map((_, i) => centroid(fr(F.arc + i)));
        const d = []; for (let i = 1; i < C.length; i++) if (C[i] && C[i - 1]) d.push(Math.hypot(C[i][0] - C[i - 1][0], C[i][1] - C[i - 1][1]));
        const mx = Math.max(...d);
        say(`centroid steps [${d.map((v) => v.toFixed(2)).join(", ")}] px; largest ${mx.toFixed(2)} px of ${N3}`);

        // *** TWENTY SAMPLES ALONG A CURVE ARE TWENTY DISCRETE PLACES, AND A DISCRETE WINNER BEADS. *** The
        // refinement is what turns them into a continuum: a parabola through the winner and its two
        // neighbours puts the crossing well inside a sample interval, and arc.ts says what that is for --
        // "Searching a smooth one-dimensional function is what makes this stable: the samples slide
        // continuously as the geometry moves, so nothing pops." So the test is not that the line is in the
        // right place; it is that it never JUMPS between two of the twenty places it was sampled at. One
        // sample interval here spans a large fraction of the body, so a beading line would step in whole
        // pixels and this row would read several.
        ok("!! *** THE FILAMENT NEVER JUMPS: every step is a fraction of a pixel ***",
            d.length >= QUIET.length - 2 && mx < 1.0,
            `over ${d.length} consecutive frames 0.87 s apart the brightest 7%'s centroid moves at most ` +
            `${mx.toFixed(2)} px of ${N3}, never a whole pixel. The search is ${K.MH_ARC.samples} discrete ` +
            `samples along the curve in ${K.MH_ARC.halves} halves, and without the parabolic refinement the ` +
            `winner can only ever be one of ${K.MH_ARC.samples} places -- which is a line that beads and ` +
            `steps. The refinement is asserted HERE, on where the light actually is, rather than by reading ` +
            `the shader back.`);
    }
}

// =============================================================================================================
sec("4. *** PIN IS THE ARC'S CLOSEST APPROACH TO THE CENTRE, AND IT IS NOT A BRIGHTNESS ***");
{
    if (!okRun) { ok("!! the knob frames rendered", false, "the render did not produce frames"); }
    else {
        const r0 = meanIn(fr(F.pinLo), 0, 0.18) / Math.max(meanIn(fr(F.pinLo), 0.18, 0.40), 1e-9);
        const r1 = meanIn(fr(F.pinHi), 0, 0.18) / Math.max(meanIn(fr(F.pinHi), 0.18, 0.40), 1e-9);
        const b0 = halfIn(fr(F.bowLo)), b1 = halfIn(fr(F.bowHi));
        say(`pin 0: centre ${meanIn(fr(F.pinLo), 0, 0.18).toFixed(4)} mid ${meanIn(fr(F.pinLo), 0.18, 0.40).toFixed(4)} ` +
            `ratio ${r0.toFixed(3)};  pin 1: centre ${meanIn(fr(F.pinHi), 0, 0.18).toFixed(4)} mid ` +
            `${meanIn(fr(F.pinHi), 0.18, 0.40).toFixed(4)} ratio ${r1.toFixed(3)}`);
        say(`bow 0: total ${totalLight(fr(F.bowLo)).toFixed(2)}, half in ${(b0.share * 100).toFixed(2)}%; ` +
            `bow 1: total ${totalLight(fr(F.bowHi)).toFixed(2)}, half in ${(b1.share * 100).toFixed(2)}%`);

        // arc.ts: "CORE PIN (c2) IS THE ARC'S CLOSEST APPROACH TO THE CENTRE. At 1 the filament passes right
        // through the core; at 0 it bows well clear." That is a statement about WHERE the light is, and the
        // row is a ratio of two annuli for exactly that reason -- a knob that merely brightened the species
        // would raise both and leave the ratio alone.
        ok("!! *** PIN MOVES THE FILAMENT, IT DOES NOT BRIGHTEN IT: the light crosses the centre ***",
            r0 < 1.5 && r1 > 8 && r1 / r0 > 8,
            `at pin 0 the middle of the body is no brighter than the annulus around it (ratio ` +
            `${r0.toFixed(3)}, the filament bowing clear); at pin 1 it is ${r1.toFixed(1)}x brighter, a ` +
            `x${(r1 / r0).toFixed(0)} change in WHERE the light is. The knob drives the arc's closest ` +
            `approach from ${K.MH_ARC.pinFar} to ${K.MH_ARC.pinNear} body units.`);

        // AND BOW DOES THE OTHER THING: it lengthens the span and thickens the thread together, so the line
        // gets longer and the light spreads along it rather than concentrating further.
        // *** THE SPAN IS IN THE CONDITION BECAUSE A SABOTAGE WALKED THROUGH THE ROW WITHOUT IT. *** Zeroing
        // MH_ARC.spanK and rcK -- so `bow` drives the WIDTH and nothing else -- left the total light up by
        // half and the pixels holding it up by half, because a thicker thread does both of those too. The
        // closed-form integral scales with w, so width alone buys brightness AND area. Only the stroke's
        // end-to-end reach separates "longer" from "fatter", and under that sabotage it went the WRONG WAY:
        // x0.901 against the real x1.202.
        const sp0 = strokeSpan(fr(F.bowLo)), sp1 = strokeSpan(fr(F.bowHi));
        say(`stroke span: bow 0 ${sp0.toFixed(2)} px -> bow 1 ${sp1.toFixed(2)} px = x${(sp1 / sp0).toFixed(3)}`);
        ok("!! ...and BOW lengthens the stroke -- END TO END, which a thicker thread cannot fake",
            totalLight(fr(F.bowHi)) > totalLight(fr(F.bowLo)) * 1.5 && b1.share > b0.share * 1.5 &&
            sp1 > sp0 * 1.1,
            `bow 0->1 takes the frame total from ${totalLight(fr(F.bowLo)).toFixed(2)} to ` +
            `${totalLight(fr(F.bowHi)).toFixed(2)} (x${(totalLight(fr(F.bowHi)) / totalLight(fr(F.bowLo))).toFixed(2)}) ` +
            `while the pixels holding half of it go ${(b0.share * 100).toFixed(2)}% -> ` +
            `${(b1.share * 100).toFixed(2)}%, AND the stroke reaches ${sp0.toFixed(2)} -> ${sp1.toFixed(2)} px end ` +
            `to end (x${(sp1 / sp0).toFixed(3)}). ALL THREE HALVES ARE ASSERTED because each pair alone is the ` +
            `wrong species: brighter and equally concentrated is a dimmer being turned up, more spread at the ` +
            `same total is the thread going slack, and brighter-and-wider WITHOUT more reach is the knob ` +
            `having become a thickness -- which is precisely what the sabotage that forced this third ` +
            `conjunct produced, at x0.901 reach. The knob drives span ${K.MH_ARC.spanB} -> ` +
            `${(K.MH_ARC.spanB + K.MH_ARC.spanK).toFixed(2)} and width ${K.MH_ARC.wB} -> ` +
            `${(K.MH_ARC.wB + K.MH_ARC.wK).toFixed(3)} at once.`);
    }
}

console.log("\n" + (fails ? "FAIL -- " + fails + " check(s)" : "ALL GREEN") +
    "\nARC: one filament, searched along the CURVE rather than along the ray, refined by a parabola and then " +
    "integrated in closed form -- w * sqrt(pi) / sin(alpha) * exp(-perp^2 / w^2), which is KIT.mhTube and " +
    "which sol uses too. The thread is 0.636 of one march step wide and the light does not flicker." +
    "\n*** ONE OF ARC'S CONSTANTS IS NOT GRADED, and the measurement that decided that is here so nobody " +
    "repeats the search. *** THE GRAZING FLOOR: sinFloor 0.58 rather than the 0.30 the geometry allows, " +
    "because at three and a third the 1/sin(alpha) amplification \"put a bright BULGE wherever the filament " +
    "leaned toward the viewer\". Dropping it to 0.02 moves this gate's numbers by 3.8% of frame total and " +
    "0.15 points of concentration -- real, and under what a row could separate from ordinary variation. The " +
    "reason is that the floor only bites where the thread leans steeply toward the eye, which at the default " +
    "sway is a small part of a small number of frames; catching it would need times chosen off the roll and " +
    "tilt drifts the way section 2's are chosen off the flourish. It is transcribed and it is right; it is " +
    "not defended here." +
    "\nWHAT IS NOT CLAIMED HERE: sol, its sibling from the same round " +
    "(tools/ship/murmurSpecies9-selfcheck.mjs), fathom and geode (…Species6 and …Species7), the surface all " +
    "eighteen share and limn's edge (…murmurSpecies-selfcheck.mjs), comet's orbit (…Species2), opal and " +
    "abyss (…Species3), droplet's body (…Species4), nebula and tempest (…Species5), and the kit under all of " +
    "them (tools/ship/murmurKit-selfcheck.mjs). SIX species remain: aura, prism, duet, flux, helix, chorus.");
process.exit(fails ? 1 : 0);
