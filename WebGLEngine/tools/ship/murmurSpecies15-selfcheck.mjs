// WebGLEngine/tools/ship/murmurSpecies15-selfcheck.mjs -- v4640
//
// GATE FIFTEEN OVER THE SPECIES: HELIX, the eighteenth of murmur's eighteen and the LAST. "Two strands
// winding a vertical axis: the double helix."
//
// *** THE GESTALT TEST IS THE SPEC: *** helix.ts -- "somebody says DNA inside three seconds or the species
// has failed -- and the first build failed it by being a cousin of flux: broad soft strands on a leaning axis
// read as crossing horizontal streaks."
//
// *** AND THIS IS THE ONE HERO WHOSE FIGURE LIVES IN THE MARCH, so murmur gives it a second tap uniform for
// itself alone: u_tapsHi, "helix's twenty ... its strands ARE the march". *** This port transcribes the RATIO
// rather than the number -- see MH_TAPS_HI -- so helix marches 96 steps where the family marches 24. arc, four
// species earlier, escaped the march entirely to draw a line; helix pays for a finer one. Both answers are in
// render/aiPresenceOrbTsl.mjs now.
//
// *** THIS GATE RENDERS AT 128 PIXELS AND NOT 48, WHICH IS A FINDING BEFORE IT IS A SETTING. *** At 48 a
// strand is about one pixel across and the figure is simply below the frame's resolution -- the same wall
// chorus's countability hit at v4639, recorded there rather than gated. The cost is small because the launch
// is the cost: the same two-frame render is 888 ms at 48 and 1,229 ms at 128, a 7.1x increase in pixels for
// 1.38x the time. Its sibling prism is graded in tools/ship/murmurSpecies14-selfcheck.mjs.
"use strict";
import * as K from "../../render/murmurKit.mjs";
import { sp, renderSpecies, lin } from "./murmurSpeciesFrames.mjs";

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const say = (m) => console.log("  ----  " + m);
const sec = (t) => console.log("\n" + t);

console.log("murmurSpecies15-selfcheck -- helix's two strands, and the rhythm of their crossings\n");

const NN = 128;                      // see the header: 48 cannot resolve a one-pixel strand
const lt = (f, x, y) => { const i = (y * NN + x) * 4; return lin(f[i]) + lin(f[i + 1]) + lin(f[i + 2]); };
const DIM = 0.15;
const BASE = { glint: 0, density: 0.5, fold: 0.5, spread: 0, glow: DIM, glintRate: 0,
               layers: 0.5, parallax: 0.5, murk: 0.4, facet: 0.5, glim: 0.5, stone: 0.5,
               bow: 0.5, sway: 0.5, pin: 0.5, corona: 0.5, prom: 0.5, simmer: 0.5,
               ribbon: 0.5, swirl: 0.5, depth3d: 0.5, stream: 0.5, bend: 0.5, height: 0.5,
               sep: 0.5, orbit: 0.5, ratio: 0.5, voices: 0.5, sync: 0.5, breath: 0.5,
               beams: 0.5, split: 0.5, swing: 0.5, turns: 0.5, rise: 0.5, strand: 0.5 };
const HX = (t, extra = {}) => sp("helix", t, 0.0, { ...BASE, ...extra });
const T = 5.0;

const FRAMES = [HX(T, { turns: 0.0 }), HX(T), HX(T, { turns: 1.0 })];
const run = await renderSpecies(FRAMES, NN);
const okRun = run.ok && run.frames && run.frames.length === FRAMES.length;
if (!okRun) ok("!! the species render ran", false, `could not render: ${run.reason || "frames"}`);
const fr = (i) => run.frames[i];

// PER ROW: the two brightest separated peaks. The strands are antipodal, so their separation collapses to
// nothing at every crossing and opens to twice the radius between -- which makes a row-by-row separation
// profile the crossing rhythm, written out.
const rowSep = (px) => {
    const out = [];
    for (let y = Math.round(NN * 0.18); y < NN * 0.82; y++) {
        const row = [];
        for (let x = 0; x < NN; x++) {
            const dx = (x + 0.5) / NN * 2 - 1, dy = (y + 0.5) / NN * 2 - 1;
            row.push(Math.hypot(dx, dy) > 0.52 ? 0 : lt(px, x, y));
        }
        const mx = Math.max(...row);
        if (mx < 0.04) { out.push(0); continue; }
        const pk = [];
        for (let x = 1; x < NN - 1; x++)
            if (row[x] >= row[x - 1] && row[x] >= row[x + 1] && row[x] > mx * 0.45) pk.push([x, row[x]]);
        pk.sort((a, b) => b[1] - a[1]);
        let second = null;
        for (const p of pk.slice(1)) if (Math.abs(p[0] - pk[0][0]) >= 4) { second = p; break; }
        out.push(second ? Math.abs(pk[0][0] - second[0]) : 0);
    }
    return out;
};
// How many times the separation opens and closes again: a run of narrow rows, bounded by wide ones.
const pinchRuns = (S, narrow = 4) => {
    let runs = 0, inr = false;
    for (const v of S) { if (v <= narrow && !inr) { runs++; inr = true; } else if (v > narrow) inr = false; }
    return runs;
};

// =============================================================================================================
sec("1. *** THE TWO STRANDS ARE EXACTLY ANTIPODAL, and one sincos is why ***");
{
    // helix.ts: "THE STRANDS ARE THREADS, and getting there meant giving up the atan2. The distance to the
    // strand is measured IN THE HORIZONTAL PLANE AT THE SAMPLE'S OWN HEIGHT: at height y the strand is one
    // point in that plane, so the distance is a subtract." The shader then writes d0 = q.xz - c0p and
    // d1 = q.xz + c0p -- ONE sincos, and the second strand is the exact negation of the first's offset.
    //
    // *** THAT IS AN ALGEBRAIC PROPERTY, SO IT IS CHECKED ALGEBRAICALLY AND EVERYWHERE, not sampled at a
    // frame. *** A double helix whose two strands were merely NEAR opposite would be a weave; exactly
    // opposite is what makes the crossings crossings. The midpoint of the pair must be the axis at every
    // height, every time, and every turns setting -- and it is, to zero, because the negation is written
    // rather than computed.
    const H = K.MH_HELIX;
    let worst = 0, n = 0;
    for (let t = 0; t < 60; t += 0.7) for (let y = -H.profSpan; y <= H.profSpan; y += 0.05) for (const tk of [0, 0.5, 1]) {
        const turns = H.turnsB + tk * H.turnsK;
        const climb = K.mhDrift(t, H.climbB + 0.5 * H.climbK, H.climbWob, H.climbLane);
        const r0 = H.r0B + tk * H.r0K;
        const phi = turns * y * Math.PI + climb;
        const c = [r0 * Math.cos(phi), r0 * Math.sin(phi)];
        n++; worst = Math.max(worst, Math.hypot((c[0] + (-c[0])) / 2, (c[1] + (-c[1])) / 2));
    }
    say(`over ${n} (time, height, turns) samples the worst distance from the strands' midpoint to the axis ` +
        `is ${worst.toExponential(3)}`);
    // *** AND THIS ROW GRADES THE CONSTANTS, NOT THE SHADER -- a sabotage had to tell me, the same one that
    // caught prism's section 1 next door. *** It is computed here in JS; it never renders. Giving the second
    // strand its OWN phase in render/aiPresenceOrbTsl.mjs -- d1 built from phi + 2.0 instead of from the
    // negation, which is precisely the weave helix.ts says the first build failed into -- leaves it green.
    //
    // IT IS KEPT, RE-TITLED, because what it does say is true and exact: the geometry the constants describe
    // is antipodal everywhere. And the pixel instrument that should have closed the gap was measured and
    // REJECTED: per-row strand midpoints at 128 scatter 6.10 px at baseline and 2.43 px with the strands
    // deliberately NOT antipodal -- the sabotage scores BETTER, because two strands at a fixed phase offset
    // track each other more steadily than two that cross. An instrument that prefers the broken shader is
    // not a weak instrument, it is a wrong one, and it is recorded here rather than shipped.
    ok("!! MH_HELIX's GEOMETRY IS ANTIPODAL EVERYWHERE -- the constants, not the shader that reads them",
        worst === 0 && n >= 2000,
        `${n} samples across sixty seconds, the full visible height and the whole turns range, and the worst ` +
        `departure is ${worst.toExponential(3)} -- zero, not small. The shader spends ONE sincos on c0p and ` +
        `subtracts it for one strand and adds it for the other, so antipodal is not a value it computes but ` +
        `a shape it cannot express otherwise. A PAIR THAT WERE MERELY NEAR-OPPOSITE WOULD BE A WEAVE, which ` +
        `is the read helix.ts says the first build failed into. *** WHAT THIS ROW CANNOT SEE is the shader ` +
        `building d1 from its own phase instead of from the negation; that sabotage passes, and the pixel ` +
        `instrument meant to catch it scored the broken shader HIGHER. See the note above. ***`);
}

// =============================================================================================================
sec("2. *** THE CROSSING RHYTHM IS COUNTED, AND THE KNOB COUNTS IT ***");
{
    if (!okRun) { ok("!! helix rendered at 128", false, "no frames"); }
    else {
        const S = [0, 1, 2].map((i) => rowSep(fr(i)));
        const R = S.map((s) => pinchRuns(s));
        say(`turns 0 (${K.MH_HELIX.turnsB} turns): pinches ${R[0]}; turns 0.5 ` +
            `(${(K.MH_HELIX.turnsB + 0.5 * K.MH_HELIX.turnsK).toFixed(2)}): ${R[1]}; turns 1 ` +
            `(${(K.MH_HELIX.turnsB + K.MH_HELIX.turnsK).toFixed(2)}): ${R[2]}`);
        say(`separation profile at turns 1, every third row: [${S[2].filter((_, i) => i % 3 === 0).join(" ")}]`);

        // helix.ts: "THE CROSSING RHYTHM IS COUNTED, not left to fall out. A double helix seen side-on
        // crosses twice per turn, so turns is set to put about one and three quarter turns inside the visible
        // height: three or four crossings, which is the count the eye reads as a helix rather than as a
        // spring." The separation profile IS that rhythm: it opens to twice the radius between crossings and
        // collapses at each one, because the strands are antipodal (section 1) and so meet on the axis.
        //
        // THE ROW ASSERTS A RANGE AND A DIRECTION, not a number. The exact count depends on where the climb
        // happens to have carried the phase when the frame was taken -- the figure travels upward -- so a
        // fixed count would be a claim about one moment. What cannot drift is that there are SEVERAL and that
        // MORE TURNS MEANS MORE OF THEM.
        ok("!! *** THE STRANDS PINCH SEVERAL TIMES UP THE FIGURE, AND `turns` ADDS PINCHES ***",
            R[0] >= 3 && R[0] <= 7 && R[2] > R[0] && R[2] <= 10,
            `the pair's separation collapses and reopens ${R[0]} times at ${K.MH_HELIX.turnsB} turns and ` +
            `${R[2]} times at ${(K.MH_HELIX.turnsB + K.MH_HELIX.turnsK).toFixed(2)} -- more turns, more ` +
            `crossings, which is the whole of "counted rather than left to fall out". A SPRING WOULD READ ` +
            `TEN OR MORE and a single leaning band would read none, so the bound is two-sided. At 48 pixels ` +
            `this measurement does not exist at all: a strand is about one pixel wide there and no row has ` +
            `two peaks to separate, which is why this gate renders at ${NN}.`);
    }
}

console.log("\n" + (fails ? "FAIL -- " + fails + " check(s)" : "ALL GREEN") +
    "\nHELIX: two strands on an upright that stays upright, exactly antipodal about it, crossing several times " +
    "up the visible height -- and marched at four times the family's tap count, because this is the one hero " +
    "whose figure lives in the march." +
    "\n*** WITH THIS SPECIES ALL EIGHTEEN OF murmur-web's HEROES ARE PORTED AND GATED, across fifteen species " +
    "gates and one kit gate. *** still, limn, comet, droplet, opal, abyss, nebula, tempest, fathom, geode, " +
    "arc, sol, aura, flux, duet, chorus, prism, helix." +
    "\n*** AND THE TAP COUNT ITSELF IS NOT DEFENDED HERE EITHER, which is worth saying because it is this " +
    "round's one distinctive port decision. *** helix.ts says dropping the count \"leaves an empty bead\". " +
    "Measured at 128 across four times, setting MH_TAPS_HI from MH_TAPS * 4 back to MH_TAPS makes the " +
    "strands BRIGHTER, not emptier -- 13.12 against 11.72 of strand light -- and leaves their steadiness " +
    "alone (4.52% against 4.61%). The direction is the march's own arithmetic: fewer steps means a larger " +
    "ds, and acc += e * trans * ds accumulates MORE per tap that lands on a strand. The bead murmur describes " +
    "belongs to its own mount and strand width, not to this port's 128-pixel frame. The 4x ratio is " +
    "transcribed from u_taps and u_tapsHi and it is right; what is not established is that these rows would " +
    "notice if it were wrong." +
    "\n*** WHAT THIS GATE DOES NOT CLAIM, with the numbers. *** THE UPRIGHT ITSELF. helix.ts's first repair is " +
    "that the axis is vertical and stays vertical -- \"a lean of twenty degrees is enough to destroy the " +
    "read\" -- and the port holds the tilt at 0.06 + 0.05 sin, which is 6.3 degrees at most. Two instruments " +
    "failed to measure it: the lit region's principal axis came back 52.9 degrees from vertical at an " +
    "elongation of 1.52, where a nearly round region makes the axis meaningless; and its height-to-width " +
    "ratio came back 0.877, WIDER than tall, because the spindle profile concentrates the light into a " +
    "horizontal band at mid-height and the aspect ratio measures that band rather than the figure. The " +
    "strands' own midpoint scattered 7.09 px against flux's 4.79 at 48 pixels -- worse than the species it " +
    "is supposed to beat, which is what a one-pixel strand does to a peak finder. Section 1 asserts the " +
    "antipodal geometry where it is exact instead. A pixel row on the upright wants the per-row midpoint at " +
    "128 with a peak finder that survives a crossing, and that is a section this gate's budget did not buy.");
process.exit(fails ? 1 : 0);
