// WebGLEngine/tools/ship/murmurSpecies9-selfcheck.mjs -- v4637
//
// Run: node tools/ship/murmurSpecies9-selfcheck.mjs
//
// GATE NINE OVER THE SPECIES: SOL, the twelfth of murmur's eighteen. "A miniature sun: one composed core, and
// prominences as calligraphy."
//
// *** IT SHIPS WITH ARC BECAUSE ITS OWN FILE SAYS SO IN SIX WORDS: "THE PROMINENCES, solved the way arc's
// filament is." *** Same curve search, same parabolic refinement, same closed-form tube -- which is why
// KIT.mhTube moved into render/murmurKit.mjs this round rather than being written twice. arc is graded next
// door in tools/ship/murmurSpecies8-selfcheck.mjs; the split is the budget arithmetic v4636 measured, about
// 280 ms per additional species against a 3,000 ms ceiling.
//
// AND THE TWO HALVES OF THIS SPECIES ARE SOLVED DIFFERENTLY ON PURPOSE. sol.ts: "THE CORE IS THE MASS AND THE
// PROMINENCES ARE THE LINE. Both are solved rather than sampled, and they are solved differently because they
// are different kinds of thing." The core is "a perfect disc, and it costs one square root ... exactly,
// analytically round from every angle, at every frame, with no sampling in it anywhere." The tongues are line
// integrals. Sections 1 and 3 below grade those two halves separately, because they are two claims.
"use strict";
import * as K from "../../render/murmurKit.mjs";
import { N3, VOICE, sp, renderSpecies, light, bil, ringProfile, interiorPeak } from "./murmurSpeciesFrames.mjs";

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const say = (m) => console.log("  ----  " + m);
const sec = (t) => console.log("\n" + t);

console.log("murmurSpecies9-selfcheck -- sol's analytic disc and its three solved tongues\n");

const DIM = 0.15;
const BASE = { glint: 0, density: 0.5, fold: 0.5, spread: 0, glow: DIM,
               layers: 0.5, parallax: 0.5, murk: 0.4, facet: 0.5, glim: 0.5, stone: 0.5,
               bow: 0.5, sway: 0.5, pin: 0.5, corona: 0.5, prom: 0.5, simmer: 0.5 };
const SL = (t, extra = {}) => sp("sol", t, VOICE, { ...BASE, ...extra });

// *** THE TWO TIMES ARE READ OFF THE TONGUES' OWN CLOCKS. *** Each prominence lifts on sin-squared of its own
// period -- 13, 17 and 21 seconds -- and spends most of its cycle flat against the surface, which is the
// design ("so the sun is never symmetric and never crowded"). An evenly spaced pair of times would have given
// two moments with no way to say what either one caught. render/murmurKit.mjs carries the periods, so the CPU
// half says exactly when one tongue is up and when all three are down, and mhFlourish says when the gesture
// is silent on BOTH species' lanes so neither moment is a flourish in disguise:
//
//     t = 143.30   lifts 0.021 / 0.987 / 0.000   -- ONE tongue up, the other two flat
//     t =  70.85   lifts 0.095 / 0.002 / 0.102   -- ALL THREE flat, which is what "most of its cycle" means
const UP = 143.3, FLAT = 70.85;
const liftAt = (t, k) => { const s = Math.sin(2 * Math.PI * t / (K.MH_SOL.perB + K.MH_SOL.perK * k) + k * 2.13); return s * s; };
const LIFT_UP = [0, 1, 2].map((k) => liftAt(UP, k));
const LIFT_FLAT = [0, 1, 2].map((k) => liftAt(FLAT, k));
const QUIET_OK = Math.max(K.mhFlourish(UP, K.MH_SOL.flourishSlot, K.MH_SOL.flourishDur).env,
                          K.mhFlourish(FLAT, K.MH_SOL.flourishSlot, K.MH_SOL.flourishDur).env) < 1e-3;

const FRAMES = [
    SL(UP),                                                            // 0  the reference frame
    sp("nebula", UP, VOICE, BASE),                                     // 1  a MARCHED body, for roundness
    SL(UP, { simmer: 0.0, glintRate: 1.0 }), SL(UP, { simmer: 1.0, glintRate: 1.0 }),   // 2,3
    SL(UP, { prom: 0.0, corona: 0.0 }), SL(UP, { prom: 1.0, corona: 0.0 }),             // 4,5
    SL(FLAT, { prom: 0.0, corona: 0.0 }), SL(FLAT, { prom: 1.0, corona: 0.0 }),         // 6,7
    SL(UP, { corona: 0.0 }), SL(UP, { corona: 1.0 }),                  // 8,9
];
const F = { ref: 0, neb: 1, simLo: 2, simHi: 3, upLo: 4, upHi: 5, flatLo: 6, flatHi: 7, corLo: 8, corHi: 9 };
const run = await renderSpecies(FRAMES);
const okRun = run.ok && run.frames && run.frames.length === FRAMES.length;
if (!okRun) ok("!! the species render ran", false, `could not render: ${run.reason || "frames " + (run.frames ? run.frames.length : "none")}`);
const fr = (i) => run.frames[i];

// ---- the measurements ---------------------------------------------------------------------------------------
// THE DISC'S OWN OUTLINE: along 64 rays from the frame's centre, the radius where the light first falls below
// half its central value, to sub-sample precision. The spread of those 64 radii is how far out of round the
// body is -- and it is read at HALF the central value rather than at a fixed level, so a brighter or dimmer
// frame gives the same answer.
const outline = (px, nA = 64) => {
    const peak = bil(px, N3 / 2 - 0.5, N3 / 2 - 0.5);
    const R = [];
    for (let a = 0; a < nA; a++) {
        const th = a / nA * Math.PI * 2;
        let prev = peak, rr = null;
        for (let r = 0.02; r <= 0.62; r += 0.004) {
            const v = bil(px, (Math.cos(th) * r * 0.5 + 0.5) * N3 - 0.5, (Math.sin(th) * r * 0.5 + 0.5) * N3 - 0.5);
            if (v < peak * 0.5) { rr = r - 0.004 * (peak * 0.5 - v) / Math.max(prev - v, 1e-9); break; }
            prev = v;
        }
        if (rr !== null) R.push(rr);
    }
    if (!R.length) return null;
    const m = R.reduce((a, b) => a + b, 0) / R.length;
    const sd = Math.sqrt(R.map((x) => (x - m) ** 2).reduce((a, b) => a + b, 0) / R.length);
    return { n: R.length, mean: m, sd, round: sd / m };
};
// TEXTURE inside the disc: the mean absolute difference between neighbouring pixels. A zero-mean noise raises
// this and leaves the MEAN alone, which is exactly what granulation is and exactly what a level is not.
const texture = (px, rmax = 0.16) => {
    let d = 0, n = 0, s = 0, m = 0;
    for (let y = 1; y < N3 - 1; y++) for (let x = 1; x < N3 - 1; x++) {
        const dx = (x + 0.5) / N3 * 2 - 1, dy = (y + 0.5) / N3 * 2 - 1;
        if (Math.hypot(dx, dy) > rmax) continue;
        const v = light(px, x, y);
        d += Math.abs(v - light(px, x + 1, y)) + Math.abs(v - light(px, x, y + 1)); n += 2; s += v; m++;
    }
    return { tex: d / Math.max(n, 1), mean: s / Math.max(m, 1) };
};
// ANGULAR ASYMMETRY on a ring. The corona is radially symmetric BY CONSTRUCTION -- it is exp(-(perp - Rs)/w),
// a function of radius alone -- so anything that breaks the symmetry off the limb is a tongue and not the
// corona. This measurement subtracts the corona for free, without modelling it.
const asym = (px, r) => {
    const a = ringProfile(px, r, 96), m = a.reduce((x, y) => x + y, 0) / a.length;
    return { mean: m, rel: a.map((v) => Math.abs(v - m)).reduce((x, y) => x + y, 0) / a.length / Math.max(m, 1e-9),
             max: Math.max(...a) / Math.max(m, 1e-9) };
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
sec("1. *** THE CORE IS EXACTLY ROUND, BECAUSE NOTHING SAMPLED IT ***");
{
    if (!okRun) { ok("!! sol rendered", false, "the render did not produce frames"); }
    else {
        const s = outline(fr(F.ref)), n = outline(fr(F.neb));
        say(`sol outline r ${s.mean.toFixed(4)} sd ${s.sd.toFixed(5)} = ${(s.round * 100).toFixed(2)}% out of ` +
            `round over ${s.n} rays; nebula ${n.mean.toFixed(4)} sd ${n.sd.toFixed(5)} = ` +
            `${(n.round * 100).toFixed(2)}%; peaks ${interiorPeak(fr(F.ref))} / ${interiorPeak(fr(F.neb))} of 765`);

        // *** ONE SQUARE ROOT, AND THE OUTLINE IS A CIRCLE TO WITHIN A FEW PER CENT OF ITS OWN RADIUS. ***
        // sol.ts: "The photosphere is a sphere centred at the origin, so the only thing a view ray needs to
        // know is its own perpendicular distance to that origin -- and a disc thresholded on that distance is
        // exactly, analytically round from every angle, at every frame, with no sampling in it anywhere."
        // The comparison is what gives the number meaning: nebula's body is a marched density field, and its
        // half-max contour is what a body looks like when five samples decide where it ends.
        ok("!! *** SOL'S OUTLINE IS A CIRCLE AND A MARCHED BODY'S IS NOT -- an order of magnitude apart ***",
            s.round < 0.06 && n.round > 0.15 && n.round / s.round > 5 && s.n >= 60 && n.n >= 60,
            `sol's half-max outline is ${(s.round * 100).toFixed(2)}% out of round across ${s.n} rays against ` +
            `nebula's ${(n.round * 100).toFixed(2)}% -- x${(n.round / s.round).toFixed(1)}. The residual is ` +
            `the 48-pixel frame and the eased threshold (the disc runs from ${K.MH_SOL.discOut} of the radius ` +
            `to ${K.MH_SOL.discIn}), not the geometry: there is no sampling in the core at all. THE RADIUS IS ` +
            `READ AT HALF THE FRAME'S OWN CENTRAL VALUE rather than at a fixed level, so this row cannot be ` +
            `passed or failed by a species simply being brighter.`);
    }
}

// =============================================================================================================
sec("2. *** THE GRANULATION IS TEXTURE, NOT LEVEL, AND IT MUST NOT NOTCH THE OUTLINE ***");
{
    if (!okRun) { ok("!! the simmer frames rendered", false, "the render did not produce frames"); }
    else {
        const t0 = texture(fr(F.simLo)), t1 = texture(fr(F.simHi));
        const o0 = outline(fr(F.simLo)), o1 = outline(fr(F.simHi));
        say(`simmer 0: texture ${t0.tex.toFixed(5)} mean ${t0.mean.toFixed(4)} round ${(o0.round * 100).toFixed(2)}%; ` +
            `simmer 1: texture ${t1.tex.toFixed(5)} mean ${t1.mean.toFixed(4)} round ${(o1.round * 100).toFixed(2)}%`);

        // *** THIS ROW EXISTS BECAUSE THE SPECIES ALREADY FAILED IT ONCE, AND SAYS SO. *** sol.ts on the
        // first build: "Granulation applied across the limb modulates the very threshold that makes the core
        // round, and the photosphere grew NOTCHES in its outline -- which on the one hero whose brief is a
        // composed circular core is the worst place to lose it." The repair is the smoothstep(0.55, 1.0,
        // disc) weighting that keeps the noise in the disc's interior. So the row asserts BOTH halves at
        // once: the texture must rise, and the outline must not move. Either alone is satisfiable by doing
        // nothing or by doing the broken thing.
        // *** AND THE SENTENCE THAT STOOD HERE WAS FALSE, WHICH ONLY A SABOTAGE FOUND. *** It read "this row
        // is what would catch that weighting being removed", and it is not. Moving the weighting from
        // smoothstep(0.55, 1.0, disc) to smoothstep(0.0, 0.02, disc) -- granulation applied across the whole
        // disc INCLUDING the limb, sol.ts's own named first-build bug -- changes this gate's numbers by
        // essentially nothing: the interior texture response is x1.582 either way to three decimals, the
        // texture response at the limb goes x1.024 to x1.022, and the outline's roundness moves 0.051 to
        // 0.061 percentage points. THE REASON IS GEOMETRY, NOT A BAD INSTRUMENT: the granulation multiplies
        // coreE = disc * gran * bright, so out where disc is small the term it perturbs carries almost no
        // light, and a notch bitten out of a 48-pixel outline at that amplitude is under the frame's own
        // resolution. The weighting is still right and it is still transcribed; what is retracted is the
        // claim that these rows defend it.
        ok("!! *** SIMMER RAISES THE TEXTURE AND LEAVES THE OUTLINE ALONE -- both halves, or it is the bug ***",
            t1.tex > t0.tex * 1.3 && Math.abs(t1.mean / t0.mean - 1) < 0.08 &&
            Math.abs(o1.round - o0.round) < 0.01 && o1.round < 0.06,
            `simmer 0->1 multiplies the neighbour-to-neighbour difference inside the disc by ` +
            `x${(t1.tex / t0.tex).toFixed(3)} while moving its MEAN by only ` +
            `${((t1.mean / t0.mean - 1) * 100).toFixed(1)}% -- which is what a zero-mean noise does and what ` +
            `a brightness cannot. And the outline goes ${(o0.round * 100).toFixed(2)}% -> ` +
            `${(o1.round * 100).toFixed(2)}% out of round, i.e. nowhere. The noise is weighted by ` +
            `smoothstep(${K.MH_SOL.granIn}, ${K.MH_SOL.granOut}, disc) for exactly this reason. WHAT THIS ROW ` +
            `DOES NOT DEFEND IS THAT WEIGHTING -- see the note above it.`);
    }
}

// =============================================================================================================
sec("3. *** A TONGUE NEEDS BOTH THE KNOB AND THE PHASE, AND THE CORONA CANNOT FAKE ONE ***");
{
    if (!okRun) { ok("!! the prominence frames rendered", false, "the render did not produce frames"); }
    else {
        const R = 0.46;
        const uLo = asym(fr(F.upLo), R), uHi = asym(fr(F.upHi), R);
        const fLo = asym(fr(F.flatLo), R), fHi = asym(fr(F.flatHi), R);
        say(`lifts at t=${UP}: ${LIFT_UP.map((v) => v.toFixed(3)).join(" / ")}; at t=${FLAT}: ` +
            `${LIFT_FLAT.map((v) => v.toFixed(3)).join(" / ")}; flourish silent on both: ${QUIET_OK}`);
        say(`asymmetry at r=${R}: tongue UP prom 0 ${(uLo.rel * 100).toFixed(2)}% -> prom 1 ` +
            `${(uHi.rel * 100).toFixed(2)}% (brightest ${uHi.max.toFixed(2)}x its ring mean); ALL FLAT prom 0 ` +
            `${(fLo.rel * 100).toFixed(2)}% -> prom 1 ${(fHi.rel * 100).toFixed(2)}%`);

        // *** THE CORONA IS RADIALLY SYMMETRIC BY CONSTRUCTION, SO ANGULAR ASYMMETRY OFF THE LIMB IS THE
        // TONGUES AND NOTHING ELSE. *** exp(-(perp - Rs)/w) is a function of radius alone; it cannot produce
        // a bright place at one bearing. That is why this row measures a ring's departure from its own mean
        // rather than the light in an annulus -- an annulus mean at r=0.46 is mostly corona, and the first
        // cut of this row read x1.035 for a knob that moves the tongues from nothing to everything.
        //
        // AND THE ROW NEEDS ALL FOUR FRAMES. The knob alone proves nothing (a tongue at zero lift has nowhere
        // to go), and the phase alone proves nothing (at prom 0 the tongues barely leave the limb). Only the
        // pair of pairs says the species is doing what sol.ts describes: "each spending most of its cycle
        // flat against the surface, so the sun is never symmetric and never crowded".
        ok("!! *** THE TONGUE APPEARS ONLY WHEN THE KNOB IS UP AND ITS OWN PHASE IS UP -- all four frames ***",
            QUIET_OK && Math.max(...LIFT_UP) > 0.9 && Math.max(...LIFT_FLAT) < 0.2 &&
            uHi.rel > uLo.rel * 5 && uHi.rel > 0.15 && uHi.max > 2.5 &&
            Math.abs(fHi.rel / Math.max(fLo.rel, 1e-9) - 1) < 0.5 && fHi.rel < 0.06,
            `with one tongue at lift ${Math.max(...LIFT_UP).toFixed(3)} the knob takes the ring at r=${R} ` +
            `from ${(uLo.rel * 100).toFixed(2)}% to ${(uHi.rel * 100).toFixed(2)}% out of round, ` +
            `x${(uHi.rel / uLo.rel).toFixed(1)}, with its brightest bearing ${uHi.max.toFixed(2)}x its own ` +
            `ring mean -- a LOCAL spike, which is what a loop rooted at two feet looks like from outside. ` +
            `With all three tongues flat (max lift ${Math.max(...LIFT_FLAT).toFixed(3)}) the SAME knob moves ` +
            `it ${(fLo.rel * 100).toFixed(2)}% -> ${(fHi.rel * 100).toFixed(2)}%, i.e. nothing. The corona is ` +
            `switched off in all four so the ring carries the tongues alone, and it could not have faked ` +
            `this anyway: it is a function of radius and has no bearing at all.`);
    }
}

// =============================================================================================================
sec("4. *** THE CORONA REACHES, AND IT REACHES FURTHER THAN IT BRIGHTENS ***");
{
    if (!okRun) { ok("!! the corona frames rendered", false, "the render did not produce frames"); }
    else {
        const near0 = meanIn(fr(F.corLo), 0.30, 0.45), near1 = meanIn(fr(F.corHi), 0.30, 0.45);
        const far0 = meanIn(fr(F.corLo), 0.45, 0.58), far1 = meanIn(fr(F.corHi), 0.45, 0.58);
        const o0 = outline(fr(F.corLo)), o1 = outline(fr(F.corHi));
        say(`corona 0: near ${near0.toFixed(5)} far ${far0.toFixed(5)} core r ${o0.mean.toFixed(4)}; ` +
            `corona 1: near ${near1.toFixed(5)} far ${far1.toFixed(5)} core r ${o1.mean.toFixed(4)}`);

        // The corona is exp(-(perp - Rs) / w) with w running 0.16 -> 0.31 of the body, so the knob is a
        // LENGTH SCALE rather than a gain, and a length scale shows up as the near and far annuli moving by
        // DIFFERENT factors. It also grows the disc (Rs runs 0.30 -> 0.39), which is the same knob doing a
        // second thing its own file names -- so the row asserts that too rather than pretending c0 is one
        // quantity.
        ok("!! *** CORONA IS A LENGTH SCALE, NOT A GAIN: the near and far annuli move by different factors ***",
            near1 > near0 * 2 && far1 > far0 * 1.5 && (near1 / near0) / (far1 / far0) > 1.3 &&
            o1.mean > o0.mean * 1.15 && o1.round < 0.06,
            `corona 0->1 multiplies the 0.30-0.45 annulus by x${(near1 / near0).toFixed(2)} and the ` +
            `0.45-0.58 one by x${(far1 / far0).toFixed(2)} -- a ratio of ` +
            `${((near1 / near0) / (far1 / far0)).toFixed(2)}, which is a falloff getting longer rather than a ` +
            `light getting brighter. The width runs ${K.MH_SOL.coronaWB} -> ` +
            `${(K.MH_SOL.coronaWB + K.MH_SOL.coronaWK).toFixed(2)} of the body. The same knob also grows the ` +
            `photosphere, ${K.MH_SOL.rsB} -> ${(K.MH_SOL.rsB + K.MH_SOL.rsK).toFixed(2)}, and the measured ` +
            `outline follows at x${(o1.mean / o0.mean).toFixed(3)} WHILE STAYING ROUND ` +
            `(${(o1.round * 100).toFixed(2)}%) -- a disc that grew by being sampled more coarsely would not.`);
    }
}

console.log("\n" + (fails ? "FAIL -- " + fails + " check(s)" : "ALL GREEN") +
    "\nSOL: a photosphere that is one square root and exactly round, a granulation that is texture rather than " +
    "level and stays off the limb, and three tongues integrated the way arc's filament is -- each spending " +
    "most of its cycle flat against the surface, so the sun is never symmetric and never crowded." +
    "\n*** TWO OF THIS SPECIES' FOUR NAMED MECHANISMS ARE NOT GRADED, AND THE MEASUREMENTS THAT DECIDED " +
    "THAT ARE HERE SO NOBODY REPEATS THE SEARCH. *** (a) THE CORE'S OCCLUSION of a tongue behind it -- " +
    "sol.ts's cue \"that makes the core read as a solid body rather than as a bright patch\". Setting " +
    "MH_SOL.occlude from 0.94 to 0.0 at the most favourable moment in 400 seconds of the species' own clock " +
    "(t = 233.3, where tongue 2 is at lift 0.945 and rooted at dir.z = +0.943, squarely behind the core) " +
    "moves the tongues' whole contribution by 9.0% and the frame total by 1.4%. The reason is that a lifted " +
    "tongue arches OUT: with hk near 0.49 body units above a photosphere at 0.30, most of its arc is outside " +
    "the disc where `hidden` is zero by construction, so the occlusion bites only near the feet. A row at " +
    "that sensitivity would be reading driver noise. (b) THE GRANULATION'S LIMB WEIGHTING, measured in " +
    "section 2's note. Both are transcribed and both are right; neither is defended here." +
    "\nWHAT IS NOT CLAIMED HERE: arc, its sibling from the same round " +
    "(tools/ship/murmurSpecies8-selfcheck.mjs), fathom and geode (…Species6 and …Species7), the surface all " +
    "eighteen share and limn's edge (…murmurSpecies-selfcheck.mjs), comet's orbit (…Species2), opal and " +
    "abyss (…Species3), droplet's body (…Species4), nebula and tempest (…Species5), and the kit under all of " +
    "them (tools/ship/murmurKit-selfcheck.mjs). SIX species remain: aura, prism, duet, flux, helix, chorus.");
process.exit(fails ? 1 : 0);
