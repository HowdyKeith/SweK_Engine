// WebGLEngine/tools/ship/murmurSpecies10-selfcheck.mjs -- v4638
//
// GATE TEN OVER THE SPECIES: AURA, the thirteenth of murmur's eighteen. "Ribbons of coloured light, drifting
// slowly INSIDE the glass."
//
// *** THE SPECIES IS ABOUT DEPTH, AND ITS TEST IS ONE SENTENCE: *** aura.ts -- "the ribbons cross in front of
// and behind one another rather than sliding past each other in a plane."
//
// WHICH MAKES IT THE FIRST HERO IN FOUR ROUNDS THAT WANTS THE MARCH. fathom, geode, arc and sol were all
// built to ESCAPE the five taps; this one needs them: "The interior march then does the rest for FREE -- a tap
// that lands in a near sheet attenuates what the far ones contribute behind it, so the crossings resolve as
// OCCLUSION rather than as ADDITION." A closed form would have to sort the sheets to get that ordering; a
// march gets it from the marching.
//
// SO THE WHOLE GATE IS ONE MEASUREMENT TAKEN THREE WAYS: is the light SUB-ADDITIVE in the number of ribbons?
// Its sibling flux is graded next door in tools/ship/murmurSpecies11-selfcheck.mjs.
"use strict";
import * as K from "../../render/murmurKit.mjs";
import { N3, VOICE, sp, renderSpecies, light, interiorPeak } from "./murmurSpeciesFrames.mjs";

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const say = (m) => console.log("  ----  " + m);
const sec = (t) => console.log("\n" + t);

console.log("murmurSpecies10-selfcheck -- aura's three sheets, and the occlusion that makes them three depths\n");

const DIM = 0.15;
const BASE = { glint: 0, density: 0.5, fold: 0.5, spread: 0, glow: DIM,
               layers: 0.5, parallax: 0.5, murk: 0.4, facet: 0.5, glim: 0.5, stone: 0.5,
               bow: 0.5, sway: 0.5, pin: 0.5, corona: 0.5, prom: 0.5, simmer: 0.5,
               ribbon: 0.5, swirl: 0.5, depth3d: 0.5, stream: 0.5, bend: 0.5, height: 0.5 };
const AU = (t, extra = {}) => sp("aura", t, VOICE, { ...BASE, ...extra });
const T = 6.0;

const FRAMES = [AU(T), AU(T, { ribbon: 0.0 }), AU(T, { ribbon: 1.0 }), sp("nebula", T, VOICE, BASE)];
const F = { ref: 0, rLo: 1, rHi: 2, neb: 3 };
const run = await renderSpecies(FRAMES);
const okRun = run.ok && run.frames && run.frames.length === FRAMES.length;
if (!okRun) ok("!! the species render ran", false, `could not render: ${run.reason || "frames"}`);
const fr = (i) => run.frames[i];

const totalLight = (px) => { let s = 0; for (let y = 0; y < N3; y++) for (let x = 0; x < N3; x++) s += light(px, x, y); return s; };
// The interior's ordered light, so a percentile is a percentile of the BODY and not of the frame's corners.
const inner = (px) => {
    const V = [];
    for (let y = 0; y < N3; y++) for (let x = 0; x < N3; x++) {
        const dx = (x + 0.5) / N3 * 2 - 1, dy = (y + 0.5) / N3 * 2 - 1;
        if (Math.hypot(dx, dy) > 0.55) continue; V.push(light(px, x, y));
    }
    return V.sort((a, b) => a - b);
};
const pc = (V, p) => V[Math.floor(V.length * p)];

// =============================================================================================================
sec("1. *** THE THIRD RIBBON ADDS A THIRD OF A RIBBON'S LIGHT, BECAUSE THE OTHER TWO ARE IN FRONT OF IT ***");
{
    if (!okRun) { ok("!! aura rendered", false, "no frames"); }
    else {
        const t0 = totalLight(fr(F.rLo)), t1 = totalLight(fr(F.rHi));
        const ratio = t1 / t0;
        say(`ribbon 0 -> 1 (the knob that buys the third sheet): total light ${t0.toFixed(2)} -> ` +
            `${t1.toFixed(2)} = x${ratio.toFixed(3)}; peaks ${interiorPeak(fr(F.rLo))} / ${interiorPeak(fr(F.rHi))} of 765`);

        // *** THE BOUND IS TWO-SIDED AND BOTH SIDES ARE THE SOURCE'S OWN NAMED FAILURES. *** MH_AURA.absorb is
        // 4.50, and aura.ts says exactly what the neighbouring values look like: "at 9 the far ribbon vanishes
        // entirely and the body loses its sense of fullness, at 1.5 nothing occludes anything and it is smoke
        // again." Both were rendered. At 1.5 the same knob multiplies the frame's light by x1.886 -- very
        // nearly the x2 of pure addition, which is what "nothing occludes anything" IS when measured. At 9.0
        // it reads x1.104: the third sheet arrives and contributes a tenth, which is a ribbon that is not
        // there. The shipped 4.50 sits at x1.307 between them.
        //
        // SO THIS ROW DOES NOT ASSERT A THRESHOLD SOMEBODY CHOSE. It asserts that the light is neither
        // additive nor extinguished, with both ends measured off the two settings the source rejects by name.
        ok("!! *** AURA'S LIGHT IS SUB-ADDITIVE IN THE NUMBER OF SHEETS -- crossings occlude, not add ***",
            ratio > 1.15 && ratio < 1.60 && t0 > 0,
            `adding the third sheet multiplies the frame's light by x${ratio.toFixed(3)}, not by the x1.886 ` +
            `that the same knob produces with the occlusion turned down to the 1.5 aura.ts calls "smoke", ` +
            `and not by the x1.104 it produces at the 9 that makes "the far ribbon vanish entirely". The ` +
            `coefficient is ${K.MH_AURA.absorb} and the bound brackets it with the two values its own file ` +
            `rejects BY NAME, which is why this row is a measurement rather than a threshold.`);

        // AND THE SAME PHYSICS SHOWS IN THE DISTRIBUTION, not just the sum. Occlusion takes light OUT of the
        // bright crossings and leaves the dark glass between the ribbons alone, so it compresses the interior
        // from the top: at 1.5 the tenth-to-ninetieth spread runs 10.06x, at 4.50 it is 3.92x, at 9.0 it
        // collapses to 1.94x -- a body with no fullness left in it.
        const V = inner(fr(F.ref));
        const contrast = pc(V, 0.9) / Math.max(pc(V, 0.1), 1e-6);
        say(`interior p10 ${pc(V, 0.1).toFixed(4)} p50 ${pc(V, 0.5).toFixed(4)} p90 ${pc(V, 0.9).toFixed(4)} ` +
            `= ${contrast.toFixed(2)}x`);
        ok("!! ...and it shows in the SHAPE of the interior too, bracketed by the same two settings",
            contrast > 2.6 && contrast < 6.5,
            `the interior runs ${contrast.toFixed(2)}x from its tenth to its ninetieth percentile, against ` +
            `10.06x with the occlusion at 1.5 and 1.94x at 9.0. TWO STATISTICS, ONE MECHANISM: the sum says ` +
            `the far sheet is partly hidden and the spread says WHERE the light went -- out of the crossings, ` +
            `which is the only place two sheets are both present.`);
    }
}

// =============================================================================================================
sec("2. *** THE GRADIENT ALONG EACH RIBBON IS FLOORED, BECAUSE A RIBBON THAT GOES DARK IS IN PIECES ***");
{
    if (!okRun) { ok("!! aura rendered", false, "no frames"); }
    else {
        const V = inner(fr(F.ref));
        const midShare = pc(V, 0.5) / Math.max(pc(V, 0.9), 1e-6);
        say(`interior median over p90: ${pc(V, 0.5).toFixed(4)} / ${pc(V, 0.9).toFixed(4)} = ${midShare.toFixed(3)}`);

        // aura.ts: "Each sheet is multiplied by one slow wave in q.x ... Floor at 0.58, never zero: a ribbon
        // that goes fully dark has been cut into pieces, and pieces are not silk." A floor is invisible in a
        // sum and invisible at the bright end; what it does is hold the MIDDLE of the distribution up, because
        // it is the dim stretches of each ribbon that it rescues. Dropping it to zero and letting the wave
        // ride the full range takes the median from 0.479 of p90 to 0.330 while p90 itself barely moves --
        // the bright crossings are untouched and the ribbon between them has been cut.
        ok("!! *** THE DIM STRETCHES SURVIVE: the median holds near half the ninetieth percentile ***",
            midShare > 0.40 && midShare < 0.70,
            `the interior's median sits at ${midShare.toFixed(3)} of its ninetieth percentile. With the ` +
            `gradient floor dropped from ${K.MH_AURA.gFloor} to 0 -- the wave riding its full range, which is ` +
            `what "cut into pieces" means arithmetically -- that reads 0.330 while p90 moves only 0.0466 to ` +
            `0.0412. THE FLOOR IS INVISIBLE IN A SUM AND INVISIBLE AT THE BRIGHT END, which is why this row ` +
            `is a ratio of two percentiles and not a total.`);
    }
}

console.log("\n" + (fails ? "FAIL -- " + fails + " check(s)" : "ALL GREEN") +
    "\nAURA: three open sheets at three depths, whose crossings resolve as OCCLUSION rather than as addition " +
    "-- which is the one thing this family's march gives away free and a solved interior would have to sort " +
    "for. The third sheet adds a third of a sheet's light." +
    "\n*** ONE OF AURA'S MECHANISMS IS TRANSCRIBED AND NOT GRADED, with the measurement that decided it. " +
    "*** THE THREE DEPTH OFFSETS (-0.26, +0.24, +0.02): aura.ts calls them what \"the parallax is made of\". " +
    "Collapsing all three to 0.02 -- every sheet displaced the same distance along its own normal -- moves " +
    "this gate's numbers by almost nothing: frame total 24.21 to 24.76, interior spread 3.92x to 3.68x, the " +
    "third-sheet ratio 1.307 to 1.314. AND THE REASON IS IN AURA'S OWN SENTENCE, read more carefully than the " +
    "sabotage was written: \"since the frames are rolled and tilted DIFFERENTLY, three displacements along " +
    "three DIFFERENT DIRECTIONS put three surfaces genuinely apart\". The offsets are one factor in a product " +
    "whose other factors are the rolls and the tilts, and those are untouched, so three sheets at the same " +
    "offset along three different normals are still three sheets at three depths. The offsets are right; " +
    "what is retracted is any suggestion that they alone carry the separation." +
    "\nWHAT IS NOT CLAIMED HERE: flux, its sibling from the same round " +
    "(tools/ship/murmurSpecies11-selfcheck.mjs), arc and sol (…Species8 and …Species9), fathom and geode " +
    "(…Species6 and …Species7), and everything named in those. FOUR species remain: prism, duet, helix, chorus.");
process.exit(fails ? 1 : 0);
