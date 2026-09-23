// WebGLEngine/tools/ship/murmurSpecies12-selfcheck.mjs -- v4639
//
// GATE TWELVE OVER THE SPECIES: DUET, the fifteenth of murmur's eighteen. "Two lights orbiting a common
// centre inside the glass: the conversation."
//
// duet.ts: "TWO THINGS IN ONE VOLUME IS A DEPTH PROBLEM, and solving it properly is the whole species. Two
// bright blobs going round each other on a flat disc is a loading spinner; two bodies passing in front of and
// behind one another with the far one visibly dimmer and partly eaten by the near one is a conversation
// happening in a space."
//
// BOTH BODIES ARE SOLVED AT THE RAY'S CLOSEST APPROACH -- two dot products each, no march -- which is what
// chorus does with its seven, and why the two ship together (…murmurSpecies13-selfcheck.mjs).
"use strict";
import * as K from "../../render/murmurKit.mjs";
import { N3, VOICE, ACTIVITY, flourishQuadrature, sp, renderSpecies, light, interiorPeak } from "./murmurSpeciesFrames.mjs";

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const say = (m) => console.log("  ----  " + m);
const sec = (t) => console.log("\n" + t);

console.log("murmurSpecies12-selfcheck -- duet's two bodies, and which of them has the floor\n");

const DIM = 0.15;
const BASE = { glint: 0, density: 0.5, fold: 0.5, spread: 0, glow: DIM,
               layers: 0.5, parallax: 0.5, murk: 0.4, facet: 0.5, glim: 0.5, stone: 0.5,
               bow: 0.5, sway: 0.5, pin: 0.5, corona: 0.5, prom: 0.5, simmer: 0.5,
               ribbon: 0.5, swirl: 0.5, depth3d: 0.5, stream: 0.5, bend: 0.5, height: 0.5,
               sep: 0.5, orbit: 0.5, ratio: 0.5, voices: 0.5, sync: 0.5, breath: 0.5 };
const DU = (t, voice, extra = {}) => sp("duet", t, voice, { ...BASE, ...extra });

// ONE FULL ORBIT, AND IT IS SOLVED FROM THE PHASE RATHER THAN DIVIDED OUT OF A RATE.
//
// *** THIS WAS `2*pi / (rateB + 0.5*rateK)` UNTIL v4657, AND THAT STOPPED BEING AN ORBIT. *** The base rate
// is 0.675 rad/s, so fourteen samples across 9.3 s covered exactly one turn -- while duet's rate WAS the
// base rate. v4657 gave it murmur's three modulated terms (0.55*live.pace + 0.90*st.drive + 0.85*fl.x), so
// at this gate's own operating point the rate is about 16% higher and rises again whenever a gesture fires.
// The old span covered 86% of a turn and the row still passed, saying "across one full orbit" about
// something that was not one. A GATE THAT SILENTLY MEASURES LESS THAN IT CLAIMS IS WORSE THAN A RED ONE.
//
// So the times are SOLVED: psi is the phase the shader actually computes, and these are the fourteen times
// at which it has advanced by equal fractions of 2*pi. That is exact whatever the rate does, and it stays
// exact the next time somebody adds a term.
const RATE = K.MH_DUET.rateB + 0.5 * K.MH_DUET.rateK;
const DUET_PSI = (t) => {
    const lv = K.mhLive(VOICE, ACTIVITY, 0);   // this gate's operating point; stateIndex 0, so drive is 0
    const rateNow = RATE * (1 + K.MH_DUET.ratePace * lv.pace +
                            K.MH_DUET.rateFlourish * K.mhFlourish(t, K.MH_DUET.flourishSlot, K.MH_DUET.flourishDur).env);
    return K.mhDriftPhase(
        K.mhRatePhase(RATE, t, K.MH_DUET.ratePace, lv.pace * t,
                      K.MH_DUET.rateFlourish, flourishQuadrature(t), K.MH_DUET.rateDrive, 0),
        rateNow, K.MH_DUET.orbitWob, K.MH_DUET.orbitLane, t);
};
const DT = (() => {
    const psi0 = DUET_PSI(0), want = Array.from({ length: 14 }, (_, i) => psi0 + i * 2 * Math.PI / 14);
    const out = [];
    let t = 0;
    for (const target of want) {
        while (DUET_PSI(t) < target && t < 120) t += 1 / 240;
        out.push(Math.round(t * 240) / 240);
    }
    return out;
})();
const ORBIT_S = DT[DT.length - 1] * 14 / 13 / 2;   // the half-turn these samples actually span

const FRAMES = [
    DU(3.0, 0.0), DU(3.0, 1.0),                      // 0,1  the balance
    DU(3.0, 0.0, { sep: 0.0 }), DU(3.0, 0.0, { sep: 1.0 }),  // 2,3
    ...DT.map((t) => DU(t, 0.0)),                    // 4..17  one full orbit
];
const F = { vLo: 0, vHi: 1, sLo: 2, sHi: 3, orbit: 4 };
const run = await renderSpecies(FRAMES);
const okRun = run.ok && run.frames && run.frames.length === FRAMES.length;
if (!okRun) ok("!! the species render ran", false, `could not render: ${run.reason || "frames"}`);
const fr = (i) => run.frames[i];

// THE TWO BODIES: the brightest pixel, and the brightest one at least six pixels away from it. Six because
// the pair's own separation runs about 6 to 14 px across the knob, so anything closer is the same body.
const twoPeaks = (px) => {
    const P = [];
    for (let y = 0; y < N3; y++) for (let x = 0; x < N3; x++) {
        const dx = (x + 0.5) / N3 * 2 - 1, dy = (y + 0.5) / N3 * 2 - 1;
        if (Math.hypot(dx, dy) > 0.55) continue; P.push([x, y, light(px, x, y)]);
    }
    P.sort((a, b) => b[2] - a[2]);
    const a = P[0]; let b = null;
    for (const p of P) if (Math.hypot(p[0] - a[0], p[1] - a[1]) > 6) { b = p; break; }
    return { hi: a[2], lo: b ? b[2] : 0, ratio: b ? a[2] / Math.max(b[2], 1e-9) : null,
             dist: b ? Math.hypot(a[0] - b[0], a[1] - b[1]) : null };
};

// =============================================================================================================
sec("1. *** SOMEBODY HAS THE FLOOR: level is a SPLIT, not a gain ***");
{
    if (!okRun) { ok("!! duet rendered", false, "no frames"); }
    else {
        const a = twoPeaks(fr(F.vLo)), b = twoPeaks(fr(F.vHi));
        say(`voice 0: bodies ${a.hi.toFixed(4)} / ${a.lo.toFixed(4)} = ${a.ratio.toFixed(3)}x apart ${a.dist.toFixed(1)} px; ` +
            `voice 1: ${b.hi.toFixed(4)} / ${b.lo.toFixed(4)} = ${b.ratio.toFixed(3)}x apart ${b.dist.toFixed(1)} px; ` +
            `peaks ${interiorPeak(fr(F.vLo))} / ${interiorPeak(fr(F.vHi))} of 765`);

        // *** THE SECOND BODY GETS DIMMER, AND THAT IS THE WHOLE ROW. *** duet.ts: level "pushes decisively
        // toward one of them: somebody has the floor. Not both brighter, which would say nothing; brighter
        // THERE and dimmer here." The weights are brA = 2 * bal and brB = 2 * (1 - bal), which sum to two for
        // every balance -- so a shader that merely brightened the pair would raise BOTH peaks, and this row
        // asserts that the quieter one falls.
        ok("!! *** LEVEL BRIGHTENS ONE BODY AND DIMS THE OTHER -- not both, which would say nothing ***",
            b.ratio > a.ratio * 3 && b.hi > a.hi * 2.5 && b.lo < a.lo,
            `voice 0 -> 1 multiplies the louder body by x${(b.hi / a.hi).toFixed(2)} and the quieter one by ` +
            `x${(b.lo / a.lo).toFixed(2)} -- it goes DOWN -- taking the pair's ratio from ` +
            `${a.ratio.toFixed(3)}x to ${b.ratio.toFixed(3)}x. The weights are 2*bal and 2*(1-bal) with bal ` +
            `running ${K.MH_DUET.balLo} to ${K.MH_DUET.balHi}, so they sum to 2 at every balance and the ` +
            `species can only ever move the floor from one body to the other. A GAIN WOULD RAISE BOTH, and ` +
            `the falling half of this row is what rejects one.`);

        // AND THE SEPARATION IS ITS OWN KNOB, which keeps the row above from being a claim about geometry.
        const s0 = twoPeaks(fr(F.sLo)), s1 = twoPeaks(fr(F.sHi));
        say(`sep 0: apart ${s0.dist.toFixed(1)} px; sep 1: apart ${s1.dist.toFixed(1)} px`);
        ok("!! ...and `sep` moves them apart, which `voice` did not",
            s1.dist > s0.dist * 1.4 && Math.abs(b.dist - a.dist) < 2,
            `sep 0 -> 1 takes the two bodies from ${s0.dist.toFixed(1)} px apart to ${s1.dist.toFixed(1)} ` +
            `(x${(s1.dist / s0.dist).toFixed(2)}), driving r from ${K.MH_DUET.rNear} to ${K.MH_DUET.rFar} of ` +
            `the body. Over the same range VOICE moved them ${Math.abs(b.dist - a.dist).toFixed(1)} px, i.e. ` +
            `not at all -- two knobs, two quantities, neither doing the other's job.`);
    }
}

// =============================================================================================================
sec("2. *** THE PAIR PASSES IN FRONT OF AND BEHIND ITSELF, AND THE LIGHT SAYS SO ***");
{
    if (!okRun) { ok("!! the orbit frames rendered", false, "no frames"); }
    else {
        // *** THE INSTRUMENT ASSERTS ITS OWN COVERAGE BEFORE IT SAYS ANYTHING ABOUT THE SPECIES. ***
        // Every row below is "across one full orbit", and that is a claim about these fourteen times and not
        // about duet. It went quietly untrue at v4657 when duet's rate gained murmur's three modulated terms
        // -- the old span covered 86% of a turn and nothing noticed, because the rows are about ranges and a
        // range measured over six sevenths of an orbit is still a range. A sabotage that puts the old
        // base-rate division back walks through every one of them unless something checks the span itself.
        const turns = (DUET_PSI(DT[13]) - DUET_PSI(DT[0])) / (2 * Math.PI) * 14 / 13;
        ok("!! *** THE FOURTEEN SAMPLES COVER EXACTLY ONE TURN OF THE PHASE THE SHADER COMPUTES ***",
            Math.abs(turns - 1) < 0.02,
            `psi advances ${turns.toFixed(4)} turns across the fourteen, solved from duet's own phase rather ` +
            `than divided out of a rate. THE BASE RATE IS ${RATE.toFixed(3)} rad/s AND THAT IS NO LONGER ` +
            `duet's RATE: murmur multiplies it by (1 + 0.55*live.pace + 0.90*st.drive + 0.85*fl.x), so a span ` +
            `computed as 2*pi / base covers ${(RATE / (RATE * (1 + K.MH_DUET.ratePace * K.mhLive(VOICE, ACTIVITY, 0).pace))).toFixed(2)} ` +
            `of a turn at this gate's operating point and less whenever a gesture is up. A GATE THAT ` +
            `SILENTLY MEASURES LESS THAN IT CLAIMS IS WORSE THAN A RED ONE, because the rows keep passing.`);
        const D = DT.map((_, i) => twoPeaks(fr(F.orbit + i)));
        const R = D.map((d) => d.ratio).filter((v) => v !== null);
        const lo = Math.min(...R), hi = Math.max(...R);
        say(`across one full orbit -- ${(DT[13] - DT[0]).toFixed(2)} s of shader time, solved so psi advances ` +
            `${((DUET_PSI(DT[13]) - DUET_PSI(DT[0])) / (2 * Math.PI) * 14 / 13).toFixed(3)} turns over the ` +
            `fourteen, against a BASE rate of ${RATE.toFixed(3)} rad/s that is no longer duet's rate: ratio runs ` +
            `${lo.toFixed(2)}x to ${hi.toFixed(2)}x; separations [${D.map((d) => d.dist === null ? "-" : d.dist.toFixed(0)).join(", ")}] px`);

        // *** THE ORBIT IS TILTED AND PRECESSES, AND BOTH BOUNDS ARE WHY. *** duet.ts bounds the tilt away
        // from two failures: "Face-on is the spinner; edge-on is a line." Face-on would hold both bodies at
        // the same depth all the way round, so the ratio would never move; edge-on would put them on top of
        // one another twice a turn, so the separation would collapse to zero. The measurement rejects both:
        // the ratio SWINGS, which means the depth ordering keeps changing, and the separation never closes.
        ok("!! *** NEITHER FACE-ON NOR EDGE-ON: the depth ordering swings and the pair never collapses ***",
            hi / lo > 2.5 && Math.min(...D.map((d) => d.dist || 0)) > 3,
            `the brighter-to-dimmer ratio runs ${lo.toFixed(2)}x to ${hi.toFixed(2)}x over one orbit -- ` +
            `x${(hi / lo).toFixed(1)} of swing, which is the far body passing behind the near one and back -- ` +
            `while the two are never closer than ` +
            `${Math.min(...D.map((d) => d.dist || 0)).toFixed(0)} px. A FACE-ON ORBIT HOLDS THE RATIO FLAT ` +
            `(both bodies at one depth, forever) and an EDGE-ON ONE DRIVES THE SEPARATION TO ZERO twice a ` +
            `turn. The lean is ${K.MH_DUET.leanB} +/- ${K.MH_DUET.leanAmp} rad and it precesses, so the ` +
            `pair's geometry never repeats -- and both halves of this row are needed, because each alone is ` +
            `satisfied by one of the two shapes the source rejects.`);
    }
}

console.log("\n" + (fails ? "FAIL -- " + fails + " check(s)" : "ALL GREEN") +
    "\nDUET: two bodies solved at the ray's closest approach, on an orbit bounded away from face-on and " +
    "edge-on, with the floor moving from one to the other rather than the pair simply getting louder." +
    "\n*** ONE OF THIS SPECIES' THREE NAMED MECHANISMS IS TRANSCRIBED AND NOT GRADED, with the measurement " +
    "that decided it. *** THE OCCLUSION -- duet.ts's \"line that turns dimmer into behind\" -- is exact here, " +
    "because sA and sB are solved rather than sampled, and it is worth about four per cent. Setting " +
    "MH_DUET.occlude from 2.40 to 0 across a full orbit at the CLOSEST setting the knob allows moves the " +
    "bodies' light from a mean of 4.124 to 4.284 (+3.9%), and raising it to 8.0 gives 4.026 (-2.4%). The " +
    "reason is geometric: at sep 0 the two sit about 0.60 of the body apart and each is about 0.15 wide, so " +
    "they almost never overlap ON SCREEN, and a term that only bites where one body covers the other has " +
    "almost nowhere to bite. It is correct and it is not defended here." +
    "\nWHAT IS NOT CLAIMED HERE: chorus, its sibling from the same round " +
    "(tools/ship/murmurSpecies13-selfcheck.mjs), aura and flux (…Species10 and …Species11), and everything " +
    "named in those. TWO species remain: prism and helix.");
process.exit(fails ? 1 : 0);
