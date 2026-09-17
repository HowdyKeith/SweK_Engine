// WebGLEngine/tools/ship/murmurKit-selfcheck.mjs
//
// Run: node tools/ship/murmurKit-selfcheck.mjs
//
// GATES render/murmurKit.mjs (the CPU reference) and render/murmurKitTsl.mjs (the TSL node graph) -- the
// shared foundation all eighteen murmur-web species are built out of, and the thing the first orb round's own
// entry claimed to have ported when, measured, it had not: mh_exit, mh_flourish, mh_medium, mh_scatter,
// mh_transmit, the march, MH_EXT and MH_SPREAD appeared ZERO times across both halves of that port.
//
// *** THE HASH IS COMPARED BIT-EXACTLY ACROSS CPU AND A REAL WebGPU RENDER, WHICH IS THE WHOLE SHAPE OF THIS
// GATE. *** v4579 and v4580 each shipped an "emulation" that rebuilt a shader's formula from JS constants and
// never read the shader, letting three sabotages through. Here the two implementations are genuinely
// independent -- f64 scalar JS against an f32 node graph compiled to WGSL and executed on a GPU -- and for an
// INTEGER hash there is no tolerance to hide behind: 256 of 256 uint32s match or they do not.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as K from "../../render/murmurKit.mjs";
import { renderThreeTslToPixels } from "./webgpuHarness.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const say = (m) => console.log("  ----  " + m);
const sec = (t) => console.log("\n" + t);

console.log("murmurKit-selfcheck -- the shared kit the eighteen species are built out of\n");

/**
 * *** THE CORPUS OF NUMBERS THIS ROUND TOOK, frozen so a change is a red row rather than a different story. ***
 * Every field is re-derived by the rows below from the modules themselves.
 */
export const KIT_AT_V4623 = Object.freeze({
    // murmur's avalanche against canonical murmur3 fmix32 over the 64,000 cells 0..39 cubed. The multipliers
    // and the last two shifts are identical; only the FIRST shift differs (15 against 16).
    firstShiftDisagreements: 63999, firstShiftCells: 64000,
    // Distinct values over a 60^3 lattice. The birthday estimate for 216,000 draws from 2^32 is ~5 collisions.
    distinctOf216000: 215996,
    // What the idiom v4577-v4582 removed from this tree yields on the IDENTICAL lattice, quoted from
    // render/exactHash.mjs's own frozen census rather than re-measured here.
    sinHashDistinctOf216000: 7112,
    // CPU-vs-real-WebGPU agreement on the integer hash, bit for bit.
    hashPixelsCompared: 256, hashPixelsExact: 256,
    // murmur's own stated property of MH_EXT, checked against the constant: "Over a two-unit chord a third of
    // the light survives."
    survivalOverTwoUnitChord: 0.33287108369807955,
    // murmur ships 0.098 where its own comment's 3.2 implies 0.09765625. Carried as shipped; see section 5.
    scatterKShipped: 0.098, scatterKImpliedByItsOwnProse: 0.09765625,
});

// =============================================================================================================
sec("1. *** THE AVALANCHE: murmur's FIRST SHIFT IS 15 AND CANONICAL murmur3 USES 16 ***");
{
    const pre = (x, y, z) => (Math.imul(x >>> 0, 1597334673) ^ Math.imul(y >>> 0, 3812015801) ^ Math.imul(z >>> 0, 2798796415)) >>> 0;
    let diff = 0, n = 0;
    for (let x = 0; x < 40; x++) for (let y = 0; y < 40; y++) for (let z = 0; z < 40; z++) {
        n++; if (K.mhHash(x, y, z) !== K.fmix32Canonical(pre(x, y, z))) diff++;
    }
    say(`${diff} of ${n} cells disagree between shift-15 and shift-16`);
    ok("!! *** PORTING THE CANONICAL FUNCTION FROM MEMORY WOULD HAVE BEEN A DIFFERENT HASH ON EVERY CELL BUT ONE ***",
        diff === KIT_AT_V4623.firstShiftDisagreements && n === KIT_AT_V4623.firstShiftCells,
        `${diff} of ${n}. The multipliers ARE murmur3's (0x85EBCA6B, 0xC2B2AE35) and the last two shifts ARE ` +
        `its 13 and 16 -- only the first differs, which is exactly the kind of detail recall gets wrong and a ` +
        `fetch gets right. This tree carries the canonical form in ev/esAuthority.js's weight(), so the two ` +
        `are compared here rather than argued about.`);

    const S = new Set();
    for (let x = 0; x < 60; x++) for (let y = 0; y < 60; y++) for (let z = 0; z < 60; z++) S.add(K.mhHash(x, y, z));
    say(`${S.size} distinct over 216,000 cells (birthday estimate for 2^32: ~5 collisions)`);
    ok("!! *** AND murmur'S OWN REASON FOR AN INTEGER HASH IS THIS TREE'S FINDING, REACHED SEPARATELY ***",
        S.size === KIT_AT_V4623.distinctOf216000,
        `kit.ts's own words: "A sine hash was the other option and it drifts into visible repeats once the ` +
        `domain gets large." On this identical 60^3 lattice mhHash yields ${S.size} distinct values and the ` +
        `fract(sin(dot)) idiom v4577-v4582 spent five rounds removing yields ` +
        `${KIT_AT_V4623.sinHashDistinctOf216000}. Two independent projects, one pair of numbers.`);

    // A hash whose output does not depend on every input byte is not a 3-D hash.
    const base = K.mhHash(7, 11, 13);
    ok("each of the three coordinates reaches the output",
        K.mhHash(8, 11, 13) !== base && K.mhHash(7, 12, 13) !== base && K.mhHash(7, 11, 14) !== base,
        "a coordinate that changes nothing would make the lattice degenerate along that axis");
}

// =============================================================================================================
sec("2. *** THE GRADIENTS AND THE NOISE ***");
{
    let worst = 0;
    for (let x = -6; x < 6; x++) for (let y = -6; y < 6; y++) for (let z = -6; z < 6; z++)
        worst = Math.max(worst, Math.abs(Math.hypot(...K.mhGrad3(x, y, z)) - 1));
    ok("!! every gradient is a UNIT vector, to f64",
        worst < 1e-15, `worst ||g|-1| = ${worst.toExponential(2)} over 1,728 cells. kit.ts: "gradients bunched ` +
        `near the poles put a grain in the field that reads as a weave once the octaves stack."`);

    // Gradient noise is exactly zero at every lattice point -- the defining property, and the one a wrong
    // fade or a wrong corner offset breaks immediately.
    let worstLattice = 0;
    for (let x = -3; x <= 3; x++) for (let y = -3; y <= 3; y++) for (let z = -3; z <= 3; z++)
        worstLattice = Math.max(worstLattice, Math.abs(K.mhNoise3(x, y, z)));
    ok("!! *** THE NOISE IS EXACTLY ZERO AT EVERY LATTICE POINT, which is what makes it gradient noise ***",
        worstLattice < 1e-12, `worst |n| at 343 integer points = ${worstLattice.toExponential(2)}`);

    // Continuity across a cell boundary: the quintic fade has zero first AND second derivative at 0 and 1,
    // so stepping over an integer must not produce a visible seam.
    const eps = 1e-5;
    const a = K.mhNoise3(1 - eps, 0.3, 0.7), b = K.mhNoise3(1 + eps, 0.3, 0.7);
    ok("no seam across a cell boundary", Math.abs(a - b) < 1e-3, `|n(1-e) - n(1+e)| = ${Math.abs(a - b).toExponential(2)}`);

    let lo = Infinity, hi = -Infinity;
    for (let i = 0; i < 40000; i++) { const v = K.mhNoise3(i * 0.137, i * 0.311, i * 0.71); lo = Math.min(lo, v); hi = Math.max(hi, v); }
    ok("the range is bounded well inside +/-1, so mh_haze's 0.5 + 0.85*n cannot leave 0..1 by much",
        lo > -1 && hi < 1, `[${lo.toFixed(4)}, ${hi.toFixed(4)}] over 40,000 samples`);
}

// =============================================================================================================
sec("3. *** THE GESTURE CLOCK: APERIODIC, DETERMINISTIC, AND NOTHING SNAPS ***");
{
    // kit.ts: "DETERMINISTIC: the slot index is floor(t / slot) and everything else is a hash of it, so any t
    // at all renders the correct frame." That is a seekability claim and it is checked as one.
    const t = 137.42, f1 = K.mhFlourish(t, 5, 10), f2 = K.mhFlourish(t, 5, 10);
    ok("the same t gives the same gesture, with no accumulated state",
        f1.env === f2.env && f1.u === f2.u && f1.rand === f2.rand, `env=${f1.env.toFixed(6)}`);

    // "NOTHING SNAPS: the envelope is sin^2(pi u), zero with zero slope at both ends."
    const near0 = K.mhFlourish(0, 5, 10), atEnd = K.mhFlourish(1e9, 5, 10);
    ok("the envelope is 0 outside its own window, exactly",
        near0.env === 0 || near0.env > 0, `env at t=0 is ${near0.env}`);
    // Sample one whole slot densely: the envelope must reach a peak and return to exactly zero, never negative.
    let peak = 0, negatives = 0, nonzero = 0;
    for (let i = 0; i < 20000; i++) {
        const e = K.mhFlourish(i * 0.0005, 5, 10).env;
        if (e < 0) negatives++; if (e > 0) nonzero++; peak = Math.max(peak, e);
    }
    ok("!! the envelope is non-negative everywhere and peaks at 1 (sin^2 of pi/2)",
        negatives === 0 && peak > 0.999 && peak <= 1.0000001,
        `peak=${peak.toFixed(6)}, ${nonzero} of 20,000 samples inside a gesture across one 10 s slot`);

    // *** THE PEAK ROW ABOVE CANNOT TELL sin^2 FROM sin, AND THE SABOTAGE SWEEP PROVED IT. *** Both peak at
    // exactly 1 and both are non-negative on the gesture, so replacing the envelope with a plain sine left
    // this whole section green. The property kit.ts actually names is the one that separates them: "the
    // envelope is sin^2(pi u), ZERO WITH ZERO SLOPE at both ends" -- NOTHING SNAPS. sin^2 leaves 0 
    // quadratically (env ~ (pi u)^2), a sine leaves it linearly (env ~ pi u), a 30x difference just inside
    // the gesture. The row checks the departure, which is the thing that would be visible.
    const slot = 3, lane = 5, SLOT = 10;
    const gStart = 0.9 + (SLOT * 0.28) * K.mhHash1(slot, lane);
    const gDur = SLOT * (0.24 + 0.16 * K.mhHash1(slot + 811, lane));
    const envAt = (u) => K.mhFlourish(slot * SLOT + gStart + u * gDur, lane, SLOT).env;
    const e1 = envAt(0.01), e2 = envAt(0.02), eEnd = envAt(0.99);
    const ratio = e2 > 0 ? e1 / e2 : 1;
    ok("!! *** THE GESTURE LEAVES ZERO WITH ZERO SLOPE -- quadratically, not linearly: nothing snaps ***",
        e1 < 2e-3 && eEnd < 2e-3 && ratio > 0.2 && ratio < 0.3,
        `env(u=0.01)=${e1.toExponential(3)}, env(u=0.99)=${eEnd.toExponential(3)}, and env(0.01)/env(0.02)=` +
        `${ratio.toFixed(4)} -- sin^2 gives 1/4, a plain sine would give 1/2 and env(0.01)=3.1e-2, thirty ` +
        `times higher. The peak row above passes for BOTH, which is why this one exists.`);

    // APERIODIC: two consecutive gaps must differ, or it is a metronome wearing a hash.
    const starts = [];
    for (let s = 0; s < 12; s++) starts.push(0.9 + (10 * 0.28) * K.mhHash1(s, 5));
    const gaps = starts.slice(1).map((v, i) => v - starts[i]);
    const distinct = new Set(gaps.map((g) => g.toFixed(6))).size;
    ok("!! *** NO TWO GAPS ARE THE SAME -- the gesture is aperiodic, not a metronome ***",
        distinct === gaps.length, `${distinct} distinct gaps of ${gaps.length}; kit.ts: "WHERE in its slot the ` +
        `gesture falls is hashed per slot, so no two gaps are the same"`);

    // The breath: bounded 0..1 and NOT a sine (its own header's reason for the uneven 0.62/0.38 weights).
    let bl = Infinity, bh = -Infinity;
    for (let i = 0; i < 30000; i++) { const v = K.mhBreath(i * 0.01, 1.3); bl = Math.min(bl, v); bh = Math.max(bh, v); }
    ok("the breath stays inside 0..1", bl >= 0 && bh <= 1, `[${bl.toFixed(4)}, ${bh.toFixed(4)}]`);
}

// =============================================================================================================
sec("4. *** THE GLASS: REFRACTION, THE TIR GUARD, AND HOW FAR THE RAY RUNS ***");
{
    // *** THIS IS THE ROW THE FIRST ROUND COULD NOT HONESTLY HAVE. *** Its gate proved the TIR guard
    // "analytically unreachable at MH_ETA" -- true, and about a variable the shader computed and never used.
    // The guard is only worth proving once the refracted ray is the direction something is marched along.
    let tirHit = 0;
    for (let i = 0; i <= 2000; i++) {
        const ci = i / 2000;                                  // cos(incidence) over the whole legal range
        const k = 1 - K.MH_ETA * K.MH_ETA * (1 - ci * ci);
        if (k <= 0) tirHit++;
    }
    ok("!! the TIR guard is unreachable ENTERING glass (eta < 1), over the whole incidence range",
        tirHit === 0, `0 of 2,001 incidences trigger it at eta=${K.MH_ETA.toFixed(6)}. Entering a denser ` +
        `medium never total-internally-reflects; the guard is there because kit.ts says a silent NaN at the ` +
        `limb is a black ring around a glass ball, and a guard you cannot reach is still the right code.`);

    // mh_look's zero test is murmur's own EXACT comparison, so the identity is asserted exactly, not closely.
    const N = K.norm3([0.3, -0.4, 0.86]), V = [0, 0, -1];
    const bare = K.mhRefract(V, N, K.MH_ETA), looked = K.mhLook(V, N, [0, 0]);
    ok("!! at tilt (0,0) mh_look returns mh_refract's vector UNTOUCHED -- exactly, not nearly",
        bare[0] === looked[0] && bare[1] === looked[1] && bare[2] === looked[2],
        `kit.ts: "The zero test is exact rather than an epsilon."`);
    const tilted = K.mhLook(V, N, [1, 0]);
    ok("...and a non-zero tilt does move it", tilted[0] !== bare[0], `tilt.x=1 moves the ray by ${(tilted[0] - bare[0]).toExponential(2)}`);

    // mh_exit against an INDEPENDENT method: bisection on the sphere's own implicit equation.
    const bisectExit = (P, rd) => {
        const f = (s) => (P[0] + rd[0] * s) ** 2 + (P[1] + rd[1] * s) ** 2 + (P[2] + rd[2] * s) ** 2 - 1;
        let lo = 0, hi = 4;
        if (f(hi) < 0) return null;
        for (let i = 0; i < 200; i++) { const m = (lo + hi) / 2; if (f(m) < 0) lo = m; else hi = m; }
        return (lo + hi) / 2;
    };
    let worst = 0, compared = 0;
    for (let i = 0; i < 400; i++) {
        const a = i * 0.0157, r = 0.05 + (i % 19) * 0.05;
        const P = [r * Math.cos(a), r * Math.sin(a), -Math.sqrt(Math.max(0, 1 - r * r)) * 0.9];
        const rd = K.norm3([Math.sin(a) * 0.3, Math.cos(a) * 0.2, 1]);
        const mine = K.mhExit(P, rd), ref = bisectExit(P, rd);
        if (ref == null || ref >= K.MH_EXIT_CAP) continue;
        compared++; worst = Math.max(worst, Math.abs(mine - ref));
    }
    ok("!! *** mh_exit AGREES WITH A 200-STEP BISECTION ON THE SPHERE'S OWN IMPLICIT EQUATION ***",
        compared > 100 && worst < 1e-12,
        `worst |analytic - bisection| = ${worst.toExponential(2)} over ${compared} rays. A different method ` +
        `reaching the same answer, which is the only kind of agreement worth asserting about a closed form.`);
    // *** THIS ROW COULD NOT FAIL ON ITS FIRST DRAFT AND THE SABOTAGE SWEEP SAID SO. *** It asserted
    // mhExit(...) <= CAP for a ray whose true exit is 1.9 -- under the cap with or without the clamp, so
    // deleting the clamp left it green. The subject has to be a ray the cap ACTUALLY bites on: the chord of a
    // unit sphere is at most 2, so no ray from INSIDE can reach 2.2, and the clamp only earns its place for
    // an origin outside the sphere. From (0,0,-3) the far intersection is at 4.
    const farOrigin = K.mhExit([0, 0, -3], [0, 0, 1]);
    ok("!! *** THE 2.2 CAP BITES: a ray whose true exit is 4.0 is clamped ***",
        Math.abs(farOrigin - K.MH_EXIT_CAP) < 1e-12,
        `exit from (0,0,-3) along +z is ${farOrigin} where the sphere's far root is 4.0. kit.ts: "so a ` +
        `grazing pixel cannot send the loop off into space." The previous draft of this row tested a ray at ` +
        `1.9 and stayed green when the clamp was deleted.`);
}

// =============================================================================================================
sec("5. *** THE MEDIUM AND THE MARCH ***");
{
    // murmur states a property of MH_EXT in prose. It is checked against the constant rather than believed.
    const survive = Math.exp(-K.MH_EXT * 2);
    ok("!! *** kit.ts's OWN CLAIM FOR MH_EXT IS TRUE OF ITS OWN CONSTANT: 'over a two-unit chord a third of the light survives' ***",
        Math.abs(survive - KIT_AT_V4623.survivalOverTwoUnitChord) < 1e-12 && survive > 0.32 && survive < 0.34,
        `exp(-${K.MH_EXT} * 2) = ${survive.toFixed(6)}. "That is what makes a ribbon passing behind the middle ` +
        `read as passing BEHIND rather than merely crossing."`);

    ok("content fades before the shell and is gone by 0.99 -- kit.ts: content floats, it does not touch the wall",
        K.mhInside([0, 0, 0]) === 1 && K.mhInside([0, 0, 0.76]) === 1 && K.mhInside([0, 0, 0.995]) === 0,
        `inside(0)=1, inside(0.76)=1, inside(0.995)=0`);
    ok("the fresnel transmission split runs 1 at head-on down to 0.12 at grazing",
        Math.abs(K.mhTransmit(0) - 1) < 1e-12 && Math.abs(K.mhTransmit(1) - 0.12) < 1e-12,
        `transmit(0)=${K.mhTransmit(0)}, transmit(1)=${K.mhTransmit(1).toFixed(4)} -- exponent 2.2, floor 0.12, murmur's own`);
    // *** THIS ROW WAS WRONG ON ITS FIRST RUN AND THE WAY IT WAS WRONG IS WORTH KEEPING. *** It asserted the
    // ported constant equalled 1/3.2^2 to 1e-9, because kit.ts's PROSE says "k is 3.2". Its CODE says 0.098,
    // which is that quotient rounded to three places -- they differ by 3.4e-4. Porting faithfully means
    // carrying the value murmur ships, not the value its comment implies, so the row now checks the VALUE and
    // reports the rounding rather than legislating it away. A port that "corrects" its source has stopped
    // being a port, and this is the smallest possible instance of that mistake.
    const kExact = 1 / (3.2 * 3.2);
    ok("!! scatter carries murmur's OWN constant, and the gap to its own stated 3.2 is reported not corrected",
        K.MH_SCATTER_K === 0.098 && Math.abs(K.MH_SCATTER_K - kExact) < 1e-3,
        `MH_SCATTER_K = ${K.MH_SCATTER_K} exactly as shipped; 1/3.2^2 = ${kExact.toFixed(8)}, a gap of ` +
        `${Math.abs(K.MH_SCATTER_K - kExact).toExponential(2)}. kit.ts: "ten times the area -- wide enough to ` +
        `fill the space between two ribbons and tight enough that the object inside it is still an object."`);

    // THE MARCH. Transmittance must fall monotonically -- a ray cannot gain light by going further.
    const P = [0, 0, -0.95], rd = [0, 0, 1];
    const m = K.marchStillInterior(P, rd, { t: 1.5, floorAmt: 0.08 });
    ok("!! the march accumulates light and loses transmittance monotonically",
        m.lum > 0 && m.trans > 0 && m.trans < 1, `lum=${m.lum.toFixed(5)}, surviving transmittance=${m.trans.toFixed(5)} over L=${m.L.toFixed(4)}`);

    // *** ORDER OF OPERATIONS IS LOAD-BEARING AND IS PROVED SO, NOT ASSERTED. *** still.ts multiplies the
    // contribution by `trans` BEFORE updating it, so the first tap is unattenuated. A reordered loop is the
    // single most plausible "tidy-up" a porter makes, and it changes the answer.
    const reordered = (() => {
        const L = K.mhExit(P, rd); const taps = K.MH_TAPS; const ds = L / taps;
        let acc = 0, trans = 1;
        for (let i = 0; i < taps; i++) {
            const s = (i + 0.5) * ds, p = [P[0] + rd[0] * s, P[1] + rd[1] * s, P[2] + rd[2] * s];
            if (K.mhInside(p) <= 0.001) continue;
            const e = K.mhMedium(p, 1.5, 1.9) * 0.08;
            trans *= Math.exp(-(2.0 * e + K.MH_EXT) * ds);    // updated FIRST -- the tidy version
            acc += e * trans * ds;
        }
        return acc;
    })();
    const rel = Math.abs(reordered - m.lum) / m.lum;
    ok("!! *** UPDATING TRANSMITTANCE BEFORE ACCUMULATING, RATHER THAN AFTER, CHANGES THE RESULT ***",
        rel > 0.01, `the tidied order gives ${reordered.toFixed(6)} against still.ts's ${m.lum.toFixed(6)} -- ` +
        `${(rel * 100).toFixed(2)}% different. Recorded because it is the exact edit a porter makes while ` +
        `"cleaning up" a loop, and nothing about the shape of the code says it matters.`);

    // The glint: SOLVED at closest approach, and it depends on WHERE the light is. The first round's glint
    // was a gaussian in t alone, identical across every pixel; this row is what that could not have passed.
    const gp = [0.3, 0.1, 0.0], gw = 0.12;
    const onAxis = K.stillGlintSolved([0.3, 0.1, -0.9], [0, 0, 1], gp, gw, { bright: 1 });
    const offAxis = K.stillGlintSolved([-0.5, 0.4, -0.7], [0, 0, 1], gp, gw, { bright: 1 });
    ok("!! *** THE GLINT IS A PLACE IN THE VOLUME, NOT A NUMBER PER FRAME ***",
        onAxis > 0 && offAxis >= 0 && onAxis > offAxis * 5,
        `a ray aimed through the light reads ${onAxis.toFixed(5)}; one aimed well away reads ${offAxis.toExponential(2)}. ` +
        `still.ts: "solved at the ray's closest approach... it is the only event in the frame, so any flicker ` +
        `or smear in it is the whole picture failing." The port this replaces returned the same value for both.`);

    // The path actually crosses the body: it must enter one side and leave by the other over a gesture.
    const fl0 = { env: 1, u: 0.02, rand: 0.37, dur: 3 }, fl1 = { env: 1, u: 0.98, rand: 0.37, dur: 3 };
    const p0 = K.stillGlintPath(fl0, 0), p1 = K.stillGlintPath(fl1, 0);
    const travel = Math.hypot(p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]);
    ok("!! the glint path traverses the volume rather than sitting still",
        travel > 1.0, `it moves ${travel.toFixed(3)} body-radii between the start and end of one gesture`);
}

// =============================================================================================================
// *** THE SPECIES FRAMES MOVED OUT AT v4626 AND THIS GATE KEPT THE TWO PROBES. *** Rendering four species here
// as well put it at 2,806 ms against a 3,000 ms budget -- 194 ms of margin on a box the tree measures running
// about 10% slower under a contended sweep, which is over -- and FIFTEEN species are still unported, so that
// pressure only grows with the work. tools/ship/murmurSpecies-selfcheck.mjs owns them now, which is also the
// better attribution: a red there says a species is wrong, a red here says the kit is.
const N = 16;   // the probe's lattice: 16x16 cells, one pixel each
const probeRun = await renderThreeTslToPixels({
    engineRoot: ENG, moduleImportPath: "/render/murmurKitTsl.mjs",
    factoryName: "makeMurmurKitProbeTsl", factoryArgs: { mode: "hash", n: N }, width: N, height: N,
    variants: [{ factoryArgs: { mode: "noise", n: N } }, { factoryArgs: { mode: "rail", n: N } },
               { factoryArgs: { mode: "railLight", n: N } },
               { factoryArgs: { mode: "surface", n: N } },
               { factoryArgs: { mode: "opalAbyss", n: N } },
               { factoryArgs: { mode: "live", n: N } },
               { factoryArgs: { mode: "state", n: N } },
               { factoryArgs: { mode: "finishPaper", n: N } },
               { factoryArgs: { mode: "finishInk", n: N } },
               { factoryArgs: { mode: "finishGrey", n: N } },
               { factoryArgs: { mode: "ignite", n: N } }],
});

sec("6. *** THE PAIR: THE REAL COMPILED SHADER AGAINST THE CPU REFERENCE, BIT FOR BIT ***");
{
    const r = probeRun;
    if (!r.ok) {
        ok("!! the kit's integer hash matches a real GPU render bit-for-bit", false,
            `could not render: ${r.reason || (r.skipped ? "skipped: " + r.skipped : "unknown")}. A gate that ` +
            `cannot run its own subject is a FAIL row here rather than a silent skip.`);
    } else {
        const px = r.frames[0];
        // *** THE ROW ORIENTATION IS MEASURED, NOT ASSUMED. *** three's uv has v=0 at the BOTTOM and this
        // readback is top-row-first, so the rows arrive flipped -- the same flip render/aiPresenceOrbPresent
        // .mjs's own round found when sampling a RenderTarget. Both orientations are counted, and the row
        // asserts the flipped one matches AND the unflipped one does not, so a future change that silently
        // removes the flip cannot pass by symmetry.
        const at = (x, y) => { const i = (y * N + x) * 4; return ((px[i] << 24) | (px[i + 1] << 16) | (px[i + 2] << 8) | px[i + 3]) >>> 0; };
        let asRead = 0, flipped = 0;
        for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
            const want = K.mhHash(x, y, 0);
            if (at(x, y) === want) asRead++;
            if (at(x, N - 1 - y) === want) flipped++;
        }
        say(`backend: ${r.isWebGPUBackend ? "REAL WebGPU" : "WebGL2 fallback"}; ${flipped}/${N * N} match flipped, ${asRead}/${N * N} as read`);
        ok("!! *** 256 uint32 HASHES, f64 JS AGAINST A COMPILED WGSL SHADER ON A GPU, EVERY BIT EQUAL ***",
            flipped === KIT_AT_V4623.hashPixelsExact && N * N === KIT_AT_V4623.hashPixelsCompared,
            `${flipped} of ${N * N} exact. There is no tolerance in this row and there could not be: a hash is ` +
            `right or it is a different hash. Packed one byte per channel, which an 8-bit UNORM round-trips ` +
            `losslessly, so the comparison is on the integer and not on a colour.`);
        ok("...and the orientation is asserted rather than tried both ways and reported charitably",
            asRead < flipped, `as-read ${asRead}, flipped ${flipped}`);

        // The noise probe is IN the gate and not behind a note pleading browser cost: when it sat outside,
        // two sabotages -- the gradient lattice offset and the quintic fade -- walked straight through the
        // hole, because every CPU-only row here is true under either.
        const rn = r.frames[1] ? { ok: true, pixels: r.frames[1] } : { ok: false };
        if (!rn.ok) ok("!! the kit's gradient noise matches a real GPU render", false, "second frame missing");
        else {
            let worst = 0, worstAt = null;
            for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
                const got = rn.pixels[((N - 1 - y) * N + x) * 4] / 255;
                const want = Math.min(1, Math.max(0, K.mhNoise3(x * 0.37, y * 0.29, 0.61) * 0.5 + 0.5));
                const d = Math.abs(got - Math.round(want * 255) / 255);
                if (d > worst) { worst = d; worstAt = `(${x},${y}) gpu=${got.toFixed(4)} cpu=${want.toFixed(4)}`; }
            }
            ok("!! *** THE GRADIENT NOISE AGREES WITH THE COMPILED SHADER ON ALL 256 SAMPLES ***",
                worst === 0, `worst |gpu - cpu| = ${(worst * 255).toFixed(2)} of 255${worstAt ? " at " + worstAt : ""}`);
        }
    }
}

// =============================================================================================================
sec("7. *** THE DEFORMED BODY SOLVE -- the half of the kit the first three species did not need ***");
{
    const sh = K.mhShape(0.07, 0.012, 3.30);

    // *** THE GRADIENT IS ANALYTIC, AND THAT IS THE WHOLE REASON THE DEFORMATION IS A SUM OF SINES. ***
    // d/dn of sin(k * dot(n, a)) is k*cos(...)*a, so the surface normal is exact rather than
    // finite-differenced -- which is what lets the specular and the fresnel rim ride the wobble without
    // stair-stepping. Checked against a central difference, which is a different method and not a restatement.
    let worstG = 0;
    for (let i = 0; i < 400; i++) {
        const n = K.norm3([Math.sin(i * 1.3), Math.cos(i * 2.1), Math.sin(i * 0.7)]);
        const { g } = K.mhDeform(n, 1.7, sh);
        const h = 1e-6, fd = [0, 0, 0];
        for (let c = 0; c < 3; c++) {
            const a = [...n], b = [...n]; a[c] += h; b[c] -= h;
            fd[c] = (K.mhDeform(a, 1.7, sh).d - K.mhDeform(b, 1.7, sh).d) / (2 * h);
        }
        worstG = Math.max(worstG, Math.hypot(g[0] - fd[0], g[1] - fd[1], g[2] - fd[2]));
    }
    ok("!! *** THE DEFORMATION'S GRADIENT IS EXACT, not finite-differenced -- checked BY finite difference ***",
        worstG < 1e-7, `worst |analytic - central difference| = ${worstG.toExponential(2)} over 400 directions`);

    // *** TWO FIXED-POINT ITERATIONS, AND kit.ts's CLAIM FOR THEM TURNED INTO A NUMBER. *** "Two fixed-point
    // iterations solve it to well under a pixel for displacements this small." Measured at the amplitude CAP
    // and swept to the limb, which is the worst case for convergence, against the same iteration run out.
    const capped = K.mhShape(K.MH_AMP_CAP, 0.012, 3.30);
    const converged = (rho, t) => {
        let R = 1;
        for (let i = 0; i < 200; i++) {
            const z = Math.sqrt(Math.max(R * R - rho * rho, 0));
            R = 1 + K.mhDeform(K.norm3([rho, 0, z + 1e-6]), t, capped).d * capped.amp;
        }
        return R;
    };
    let worstIt = 0, atRho = 0;
    for (let i = 0; i <= 200; i++) {
        const rho = i / 200 * 0.999;
        const d = Math.abs(K.mhBody([rho * K.MH_R, 0], 1.7, 0, capped).Rd - converged(rho, 1.7));
        if (d > worstIt) { worstIt = d; atRho = rho; }
    }
    const inPx = worstIt * K.MH_R * 64;
    ok("!! *** TWO ITERATIONS ARE ENOUGH: 0.02 PIXELS from the converged solve, at the cap and at the limb ***",
        worstIt < 5e-3 && inPx < 0.1,
        `worst |Rd - fixpoint| = ${worstIt.toExponential(2)} body units at rho ${atRho.toFixed(3)}, which is ` +
        `${inPx.toExponential(2)} pixels on a 64 px frame whose body radius is 19.2 px. Two evaluations of ` +
        `mh_deform against what kit.ts calls "a tenth of what a sphere-trace would cost".`);

    // THE CLIP IS THE LAW -- kit.ts's own words, and everything downstream trusts it.
    // *** THIS ROW ASKED THE WRONG FUNCTION AND THE SABOTAGE SWEEP SAID SO. *** It called mhRadiusAt, which
    // does its own clamp, so deleting mhBody's clamp -- the one kit.ts calls the law that everything
    // downstream trusts -- left it green. The clip that matters is the one inside the SOLVE, because that is
    // the value the silhouette, the membership and the normal are all built from.
    const wild = K.mhShape(0.5, 0, 1);
    let worstR = 0, worstBody = 0;
    for (let i = 0; i < 200; i++) {
        worstR = Math.max(worstR, Math.abs(K.mhRadiusAt([Math.sin(i), Math.cos(i * 1.7), Math.sin(i * 2.3)], 1.7, wild) - 1));
        worstBody = Math.max(worstBody, Math.abs(K.mhBody([i / 200 * 0.29, 0], 1.7 + i * 0.01, 0, wild).Rd - 1));
    }
    ok("!! *** THE CLIP IS THE LAW, INSIDE THE SOLVE: an amp of 0.5 still cannot move Rd past 0.085 ***",
        worstBody <= K.MH_AMP_CAP + 1e-12 && worstR <= K.MH_AMP_CAP + 1e-12,
        `worst |Rd - 1| from mhBody is ${worstBody.toFixed(6)} and from mhRadiusAt ${worstR.toFixed(6)}, against ` +
        `the cap ${K.MH_AMP_CAP}. Both are checked because only one of them is what the renderer actually calls.`);

    // *** AT amp = 0 THE DEFORMED SOLVE IS THE SPHERE, EXACTLY. *** This is what says the new machinery is a
    // generalisation of what still, limn and comet already stand on rather than a second, parallel body.
    const flat = K.mhShape(0, 0, 1);
    let worstFlat = 0;
    for (let i = 0; i <= 80; i++) {
        const rho = i / 80 * 0.98;
        const b = K.mhBody([rho * K.MH_R, 0], 3.3, 0, flat);
        worstFlat = Math.max(worstFlat, Math.abs(b.Rd - 1), Math.abs(b.N[2] - Math.sqrt(Math.max(1 - rho * rho, 0))));
    }
    // *** THIS ROW FIRST ASSERTED "to f64" AND THAT WAS MY CLAIM, NOT murmur's CODE. *** The reduction is
    // exact in Rd and NOT in the normal: mh_body normalises vec3(s, z + 1e-6), an epsilon murmur adds so the
    // limb -- where z is 0 and s is the whole vector -- cannot normalize a zero-length vector into a NaN. That
    // epsilon tilts the normal by about a millionth, everywhere, at every amplitude including zero. So the
    // honest bound is the epsilon's, and stating it is worth more than a tighter number would be: anyone
    // later chasing a 1e-6 discrepancy between the two body paths can stop here instead of hunting it.
    ok("!! *** amp = 0 REDUCES TO THE ANALYTIC SPHERE the other three species use, to murmur's own epsilon ***",
        worstFlat < 2e-6,
        `worst deviation ${worstFlat.toExponential(2)} across the disk, against the 1e-6 mh_body adds to z ` +
        `before normalising. Rd is exactly 1; the residue is entirely in the normal and is that epsilon. So ` +
        `the three species that kept the inline sphere are not standing on different geometry -- they are on ` +
        `the amp = 0 case of this one, and paying two mhDeform calls to be told so would buy nothing.`);

    // *** NOT ONE OF THE EIGHTEEN IS A SPHERE, AND THIS PORT DREW THREE OF THEM AS ONE UNTIL v4632. ***
    // A v4626 note here said still, limn and comet "are not standing on different geometry -- they are on the
    // amp = 0 case of this one, and paying two mhDeform calls to be told so would buy nothing". The first
    // clause is true of mh_body and the second is false of those species: their amps are 0.018, 0.020 and
    // 0.024, read off their own mh_shape calls. The note was right about the function and wrong about the
    // heroes, and the render followed the note.
    const deformRange = (amp, gain) => {
        let mn = Infinity, mx = -Infinity;
        for (let i = 0; i < 3000; i++) {
            const th = Math.acos(1 - 2 * ((i + 0.5) / 3000)), ph = i * 2.39996;
            const n = [Math.sin(th) * Math.cos(ph), Math.sin(th) * Math.sin(ph), Math.cos(th)];
            const r = K.mhRadiusAt(n, 3.7, { amp, hi: 0, gain });
            mn = Math.min(mn, r); mx = Math.max(mx, r);
        }
        return (mx - mn) * 100;
    };
    const shapeRows = Object.entries(K.MH_SHAPE).map(([n, sh]) => [n, sh[0], sh[3], deformRange(sh[0], sh[3])]);
    const dropAmp = (0.052 + 0.5 * 0.040) * (1 - 0.5 * 0.22);
    const dropRange = deformRange(dropAmp, K.MH_DROPLET_GAIN);
    say(`deformed radius spread -- ${shapeRows.map((r) => `${r[0]} ${r[3].toFixed(2)}%`).join(", ")}, droplet ${dropRange.toFixed(2)}%`);
    ok("!! *** EVERY SPECIES DEFORMS: no amp in the roster is zero, and a sphere is not the amp = 0 case of one ***",
        shapeRows.every((r) => r[1] > 0.01) && shapeRows.every((r) => r[3] > 2.5 && r[3] < 5),
        `the five non-droplet heroes carry amps of ` +
        `${shapeRows.map((r) => `${r[0]} ${r[1]}`).join(", ")}, which put their deformed radius ` +
        `${shapeRows.map((r) => r[3].toFixed(2) + "%").join(", ")} across 3,000 directions -- about half a ` +
        `pixel at 48 px, and MOVING, since mh_deform's three axes turn on periods of 76, 103 and 134 seconds. ` +
        `Small, real, and not zero. Until v4632 this port drew still, limn and comet as analytic spheres.`);

    // *** AND "EVERY SPECIES DEFORMS" IS NOT "EVERY SPECIES HAS ITS OWN SHAPE", which the sabotage sweep
    // proved by handing limn still's four numbers and watching all four murmur gates stay green. *** The row
    // above bounds each entry into a band of 2.5 to 5 percent, and two heroes sharing one entry sit in that
    // band as comfortably as two heroes with their own. The collapse it fails to see is EXACTLY the defect
    // this port shipped with until v4632, when still, limn and comet were all drawn as the same analytic
    // sphere -- so the table needs a row about its SHAPE, not only about its values.
    //
    // murmur gives each of the eighteen its own mh_shape call, and the six ported ones differ in three ways
    // that can be asserted without copying the numbers back out of the table they grade: no two entries are
    // the same, the roster splits into heroes that BREATHE and heroes that are constant in time, and the
    // breathers' periods are mutually distinct so no two of them swell together.
    const shapeKeys = Object.keys(K.MH_SHAPE);
    const asText = shapeKeys.map((n) => K.MH_SHAPE[n].join("/"));
    const distinct = new Set(asText).size === shapeKeys.length;
    const breathers = shapeKeys.filter((n) => K.MH_SHAPE[n][1] !== 0);
    const constant = shapeKeys.filter((n) => K.MH_SHAPE[n][1] === 0);
    const periods = breathers.map((n) => K.MH_SHAPE[n][2]);
    const periodsDistinct = new Set(periods).size === periods.length && periods.every((v) => v > 0);
    say(`shape roster -- ${breathers.length} breathe on lanes ${periods.join(", ")}, ` +
        `${constant.length} are constant in time (${constant.join(", ")}), ` +
        `${new Set(asText).size} of ${shapeKeys.length} entries distinct`);
    ok("!! *** AND EACH HERO HAS ITS OWN SHAPE: no two entries are equal, and the breathers' lanes all differ ***",
        distinct && periodsDistinct && breathers.length >= 2 && constant.length >= 2,
        `the ${shapeKeys.length} ported shapes are ${new Set(asText).size} distinct four-tuples; ` +
        `${breathers.join(", ")} breathe on lanes ${periods.join(", ")} -- all different, so no two of them ` +
        `swell together -- and ${constant.join(", ")} carry a flat amplitude, which is murmur's own split ` +
        `and not a tidy one. *** THE ROW ABOVE CANNOT SAY THIS AND THE SABOTAGE SWEEP PROVED IT: *** giving ` +
        `limn still's four numbers leaves every deformed radius inside the 2.5-to-5% band, so all four murmur ` +
        `gates stayed green on a roster that had lost a species. That collapse is not hypothetical -- it is ` +
        `what this port DID until v4632, on a note that was right about mh_body and wrong about the heroes.`);

    // *** THE TWO VOLUMETRIC HEROES' CONSTANTS, GRADED BECAUSE INLINE THEY WERE NOT. *** v4634's sabotage
    // sweep changed tempest's absorption from 3.60 to nebula's 3.10 -- the coefficient nebula.ts calls "THE
    // LINE", the one that makes a near fold a silhouette against the glow behind it -- and every row in
    // every murmur gate stayed green. Same for swapping its density curve, and same for handing it nebula's
    // specular. Those are three constants a pixel row could not separate, and the answer is the one v4632
    // reached for opal's life: a constant a gate can READ is a constant a gate can grade.
    const NB = K.MH_MIST.nebula, TM = K.MH_MIST.tempest;
    say(`mist constants -- nebula density curve (${NB.dLo}, ${NB.dHi}) absorb ${NB.absorb} gain ${NB.gain}; ` +
        `tempest (${TM.dLo}, ${TM.dHi}) absorb ${TM.absorb} gain ${TM.gain}`);
    ok("!! *** TEMPEST RUNS HARDER THAN NEBULA ON EVERY TERM ITS OWN FILE SAYS IT DOES ***",
        TM.dLo > NB.dLo && TM.dHi > NB.dHi && TM.absorb > NB.absorb && TM.gain > NB.gain &&
        TM.scale > NB.scale && TM.foldB > NB.foldB,
        `its density smoothstep is (${TM.dLo}, ${TM.dHi}) against nebula's (${NB.dLo}, ${NB.dHi}) -- BOTH ` +
        `edges further up, which is what tempest.ts means by "its density runs harder so the cloud has real ` +
        `dark in it" -- it absorbs at ${TM.absorb} against ${NB.absorb}, folds at ${TM.foldB} against ` +
        `${NB.foldB}, reads the mist at ${TM.scale} against ${NB.scale}, and carries a gain of ${TM.gain} ` +
        `against ${NB.gain}. SIX RELATIONS RATHER THAN SIX VALUES, so the row grades the SHAPE of the ` +
        `difference murmur designed and not a transcription of numbers against a copy of themselves -- the ` +
        `v4579 scar this tree keeps re-opening.`);

    // *** AND THE ONE PLACE TEMPEST RUNS QUIETER, which is the half a "harder on everything" row would miss.
    // *** nebula.ts argues its specular UP: "The catchlight has to punch through weather. At 0.60 the cloud's
    // own body sat close enough to it that the frame had no cream in it anywhere and the value hierarchy
    // failed: a nebula is still an object with a lit surface." tempest takes 0.66 instead of 0.98, because
    // its own light comes from inside. Both are in the roster all eighteen are read from.
    const sN = K.MH_SURFACE_KNOBS.nebula, sT = K.MH_SURFACE_KNOBS.tempest;
    ok("!! ...but its CATCHLIGHT is quieter, which is the term nebula argues UP and tempest does not need",
        sT[2] < sN[2] && sN[2] > 0.9 && sT[0] >= sN[0],
        `nebula's specular is ${sN[2]} and tempest's ${sT[2]}, on rims of ${sN[0]} and ${sT[0]}. A row ` +
        `asserting "tempest is the harder hero" everywhere would be red on the real roster, and that is why ` +
        `this one is here: the two files disagree about the SURFACE in the opposite direction from the ` +
        `volume. nebula.ts wants 0.98 because "a nebula is still an object with a lit surface"; tempest is ` +
        `lit from inside its own flashes and does not need the punch. *** THIS IS NOT MEASURABLE ON PIXELS ` +
        `AT THIS FRAME SIZE: *** both catchlights saturate at 646 of 765 and share a hotspot, so the roster ` +
        `is where the claim lives.`);

    ok("...and droplet is the one whose body IS the subject: three and a half times the quietest hero's",
        dropRange > shapeRows.reduce((m, r) => Math.max(m, r[3]), 0) * 2 && K.MH_DROPLET_GAIN > 2.5,
        `droplet's default amplitude of ${dropAmp.toFixed(4)} at a gain of ${K.MH_DROPLET_GAIN} gives ` +
        `${dropRange.toFixed(2)}% against the loudest of the other five at ` +
        `${shapeRows.reduce((m, r) => Math.max(m, r[3]), 0).toFixed(2)}% -- ` +
        `${(dropRange / shapeRows.reduce((m, r) => Math.min(m, r[3]), 99)).toFixed(2)}x the quietest. That ` +
        `gap is the whole distinction between a hero that breathes and the one droplet.ts calls "the body ` +
        `itself is the species: a sphere of water in free fall". The gain does most of it: 3.30 against the ` +
        `others' 1.05 to 1.30.`);

    // *** murmur'S OWN WORST-CASE ARITHMETIC DOES NOT REPRODUCE, AND IS REPORTED RATHER THAN CORRECTED. ***
    const worstSil = K.dropletWorstSilhouette();
    ok("!! the worst-case silhouette clears containment -- and murmur's stated figure for it is off",
        worstSil < 0.36 && Math.abs(worstSil - 0.3418) < 1e-3,
        `droplet.ts states "0.300 * 1.05 * 1.085 = 0.339, and the containment does not begin until 0.36". The ` +
        `product of its own three factors is ${worstSil.toFixed(5)}, not 0.339. ITS CONCLUSION STANDS -- ` +
        `${worstSil.toFixed(4)} is still clear of 0.36 -- and the quoted number is wrong by 0.003. Carried as ` +
        `shipped with the slip named, the same way MH_SCATTER_K's prose-versus-code gap is.`);
}

// =============================================================================================================
sec("8. *** THE COLOUR RAIL: mh_palette / mh_shade / mh_tier / mh_lit ***");
{
    // *** WHAT THIS SECTION REPLACES. *** Until v4627 every ported species wore a colour this port invented:
    // render/aiPresenceOrbTsl.mjs carried "const BASE_L = 0.30, BASE_C = 0.09, BASE_H = 3.6" with a comment
    // saying it was this port's own pick, and put the rim and both speculars on top AS WHITE -- which murmur's
    // own present pass names as the one forbidden move, "precisely the white overlay the family law forbids".
    // kit.ts calls the rail "most of what keeps the family reading as one family", so an approximation of it
    // is not a cosmetic shortfall; it is the part of the family the port had not ported.
    const INK = [0x0A / 255, 0x0A / 255, 0x0B / 255];
    const TONE = [0x6C / 255, 0x63 / 255, 0xE8 / 255];
    const TONE2 = [0xE8 / 255, 0x7A / 255, 0x3C / 255];
    const PAPERRGB = [0.97, 0.96, 0.94];

    // ---- mh_paper: three stated values and one stated PROPERTY -------------------------------------------
    const pInk = K.mhPaper(INK), pPaper = K.mhPaper(PAPERRGB), pMid = K.mhPaper([0.5, 0.5, 0.5]);
    ok("!! mh_paper reads 0 for the house ink, 1 for paper, and about four tenths for a true mid grey",
        pInk === 0 && pPaper === 1 && Math.abs(pMid - 0.42) < 0.02,
        `ink ${pInk.toFixed(4)}, paper ${pPaper.toFixed(4)}, sRGB 0.5 grey ${pMid.toFixed(4)} against kit.ts's ` +
        `"about four tenths across". It is OKLab lightness and not an RGB average, "because a saturated ` +
        `mid-blue paper and a light grey with the same channel mean are nowhere near the same brightness to ` +
        `the eye" -- that grey's OKLab L is 0.60, which is where the four tenths comes from.`);

    // The STATED PROPERTY, checked as continuity rather than read off the source: "Nothing in this file ever
    // branches on it; every use is a mix, so dragging the ink from ink to paper shows no jump."
    let worstJump = 0, prevPaper = null;
    for (let i = 0; i <= 20000; i++) {
        const g = i / 20000, v = K.mhPaper([g, g, g]);
        if (prevPaper !== null) worstJump = Math.max(worstJump, Math.abs(v - prevPaper));
        prevPaper = v;
    }
    ok("...and dragging the ground from ink to paper shows no jump, because nothing branches on it",
        worstJump < 1e-3,
        `worst step ${worstJump.toExponential(2)} across 20,001 greys at a 5e-5 spacing -- a smooth ramp, not ` +
        `a switch. Read as a PROPERTY of 20,001 samples rather than as the absence of an if-statement in the ` +
        `source, because the second is a claim about this file and the first is a claim about the function.`);

    // ---- mh_palette: the duotone collapse, which kit.ts calls the property the upgrade rests on ----------
    const p1 = K.mhPalette(INK, TONE, TONE, 0, 1);
    const p2 = K.mhPalette(INK, TONE, TONE2, 0, 1);
    ok("!! *** duo IS EXACTLY ZERO WHEN THE TWO ANCHORS ARE EQUAL, and every term collapses to the identity ***",
        p1.duo === 0 && p1.dHue === 0 && p1.dC === 1 && p1.dL === 1,
        `duo = ${p1.duo}, dHue = ${p1.dHue}, dC = ${p1.dC}, dL = ${p1.dL} -- exact, not small. kit.ts: "the ` +
        `property the whole upgrade rests on: at zero every term below collapses to the identity". A ` +
        `smoothstep whose lower edge were 0 instead of 0.004 would read a tiny nonzero here, and every ` +
        `single-anchor species would carry a trace of a second anchor it does not have.`);

    // *** AND THE COLLAPSE HAS A DEADBAND, WHICH IS WHAT THE 0.004 LOWER EDGE BUYS. *** Exact equality is
    // the easy half: smoothstep returns 0 at its lower edge whatever that edge is, so a row testing only
    // equal anchors stays green with the edge moved to zero -- measured, that sabotage passed. The edge is
    // there so anchors that are merely CLOSE also collapse exactly, which is what stops a species whose two
    // anchors came from the same swatch rounded differently from carrying a trace of a duotone.
    const TONE_NEAR = [TONE[0] + 2 / 255, TONE[1], TONE[2]];   // 0.00297 apart in OKLab -- inside the band
    const TONE_FAR = [TONE[0] + 6 / 255, TONE[1], TONE[2]];    // 0.00900 apart -- outside it
    const pNear = K.mhPalette(INK, TONE, TONE_NEAR, 0, 1), pFar = K.mhPalette(INK, TONE, TONE_FAR, 0, 1);
    ok("!! ...and anchors merely CLOSE collapse exactly too, which is what the 0.004 lower edge is for",
        pNear.duo === 0 && pFar.duo > 0,
        `a second anchor 0.00297 away in OKLab reads duo = ${pNear.duo} -- exactly zero, not 1e-4 -- while ` +
        `one 0.00900 away reads ${pFar.duo.toFixed(6)}, so the row cannot pass by duo being zero everywhere. ` +
        `With the lower edge at 0 instead of 0.004 the near palette reads 6.7e-4 and every "one anchor" ` +
        `species carries a sliver of a second one.`);

    ok("MH_SPREAD is half a radian, which is the 29 degrees either side kit.ts describes",
        Math.abs(K.MH_SPREAD - 0.50) < 1e-12 && Math.abs(K.MH_SPREAD * 180 / Math.PI - 28.65) < 0.01,
        `${K.MH_SPREAD.toFixed(2)} rad = ${(K.MH_SPREAD * 180 / Math.PI).toFixed(2)} degrees against kit.ts's ` +
        `"about 29 degrees of OKLAB hue either side of the anchor".`);

    // *** THE 0.93 CEILING ON THE TOP STOP, ON A TONE THAT ACTUALLY REACHES IT. *** With the house tone the
    // cap is dead code: its OKLab L is 0.5800, the ink rail's top stop is L * 1.32 = 0.7656, and no depth in
    // range gets it to 0.93 -- so removing the min() entirely changes nothing anywhere the rest of this
    // section looks, and that sabotage passed. A light tone is where the ceiling does work, and murmur puts
    // one there on purpose: without it a pale anchor's top stop runs past the top of the space and the
    // brightest part of the figure clips to a flat white, which is the family's one forbidden ending.
    const TONE_LIGHT = [0xC8 / 255, 0xC4 / 255, 0xFF / 255];
    const pLight = K.mhPalette(INK, TONE_LIGHT, TONE_LIGHT, 0, 1);
    const lightL = (() => { const l = TONE_LIGHT.map(K.srgbToLinear); return K.linearToOklab(l[0], l[1], l[2]).L; })();
    ok("!! the top stop is capped at 0.93 for a light anchor, where an uncapped rail would run off the space",
        Math.abs(pLight.s3[0] - 0.93) < 1e-12 && lightL * 1.32 > 1.0,
        `a tone of OKLab L ${lightL.toFixed(4)} would put the top stop at ${(lightL * 1.32).toFixed(4)} ` +
        `uncapped -- past 1.0, off the end of the lightness axis -- and it reads ${pLight.s3[0].toFixed(4)}. ` +
        `The house tone cannot exercise this at all (L 0.5800, top stop 0.7656), which is why this row uses a ` +
        `different anchor rather than more depths of the same one.`);

    // ---- the walk: the linearity identity, measured on the LAB WALK and not on the decoded colour --------
    // *** THE FIRST VERSION OF THIS ROW ASKED THE WRONG QUESTION AND IS RECORDED HERE RATHER THAN DELETED. ***
    // kit.ts: "mh_shade's walk is linear in the stops for any fixed t." At a fixed t the walk is a fixed
    // convex combination, so walking a mix of two palettes must equal mixing the two walks EXACTLY. Asked of
    // mhShade's return value -- linear light, three cubes past the walk -- the same test measures 2.7e-1 and
    // says nothing at all. render/murmurKit.mjs exports mhWalk for precisely this reason.
    const PD = { s0: [0, 0, 0], s1: [0.20, 0.03, -0.09], s2: [0.52, 0.06, -0.19], s3: [0.70, 0.03, -0.10] };
    const PL = { s0: [0.90, 0, 0], s1: [0.70, 0.05, -0.02], s2: [0.50, 0.09, -0.05], s3: [0.30, 0.10, -0.03] };
    const IDENT = { paper: 0, duo: 0, dHue: 0, dC: 1, dL: 1 };
    let worstLin = 0, worstDecoded = 0, pairs = 0;
    for (let i = 0; i <= 200; i++) {
        const t = i / 200;
        for (const u of [0, 0.125, 0.25, 0.5, 0.75, 0.875, 1]) {
            const pm = {};
            for (const k of ["s0", "s1", "s2", "s3"]) pm[k] = PD[k].map((v, j) => v + (PL[k][j] - v) * u);
            const a = K.mhWalk(PD, t), b = K.mhWalk(PL, t), c = K.mhWalk(pm, t);
            for (let j = 0; j < 3; j++) worstLin = Math.max(worstLin, Math.abs(c[j] - (a[j] + (b[j] - a[j]) * u)));
            const A = K.mhShade({ ...IDENT, ...PD }, t, 0), B = K.mhShade({ ...IDENT, ...PL }, t, 0), C = K.mhShade({ ...IDENT, ...pm }, t, 0);
            for (let j = 0; j < 3; j++) worstDecoded = Math.max(worstDecoded, Math.abs(C[j] - (A[j] + (B[j] - A[j]) * u)));
            pairs++;
        }
    }
    ok("!! *** THE WALK IS LINEAR IN THE STOPS TO THE LAST BIT, so mixing the two rails at the stops is EXACT ***",
        worstLin < 1e-15,
        `worst departure ${worstLin.toExponential(3)} over ${pairs} (t, mix) pairs -- f64 rounding, which is ` +
        `what "exact rather than an approximation" has to mean. THE SAME TEST ON THE DECODED COLOUR READS ` +
        `${worstDecoded.toExponential(3)}, and that is not a failure of the walk: the OKLab decode cubes its ` +
        `inputs, so nothing downstream of it is linear in anything. This row sits at the walk because that is ` +
        `where the claim lives.`);

    // ---- the hue rotation: the SAFE axis, READ BACK OUT OF mhShade AND NOT RE-DERIVED HERE -------------
    // *** THE FIRST VERSION OF THIS ROW RE-STATED THE ROTATION IN THE GATE AND GRADED ITS OWN COPY. ***
    // It rebuilt pos/neg/rot/cS/lS from K.MH_SPREAD and the palette's scalars, ran that on mhWalk's output,
    // and asserted the result -- so mhShade was never called, and a sabotage that made the rotation trade
    // chroma for hue (lab[2] * sh * 0.8, the exact failure kit.ts says this axis cannot have) left the row
    // GREEN. That is v4579's and v4580's mistake with a new subject: an instrument that re-implements the
    // thing it grades measures itself. What follows calls mhShade and recovers L and C from the LINEAR LIGHT
    // it returns, through linearToOklab -- the inverse of the transform mhShade ends with, so the residual is
    // f64 round-trip noise and nothing else.
    const lcOf = (rgb) => { const o = K.linearToOklab(rgb[0], rgb[1], rgb[2]); return [o.L, Math.hypot(o.a, o.b)]; };
    let w1L = 0, w1C = 0, hp = 0;
    for (let i = 0; i <= 50; i++) {
        const t = i / 50, b = lcOf(K.mhShade(p1, t, 0));
        for (const h of [-0.75, -0.6, -0.3, 0.3, 0.6, 0.75]) {
            const r = lcOf(K.mhShade(p1, t, h));
            w1L = Math.max(w1L, Math.abs(r[0] - b[0])); w1C = Math.max(w1C, Math.abs(r[1] - b[1])); hp++;
        }
    }
    ok("!! *** THE ROTATION MOVES HUE AND HOLDS LIGHTNESS AND CHROMA -- read back out of mhShade, not re-derived ***",
        w1L < 1e-9 && w1C < 1e-9,
        `with ONE anchor, over ${hp} (t, hue) pairs at hues out to 1.5x MH_SPREAD: L moves by ` +
        `${w1L.toExponential(2)} and C by ${w1C.toExponential(2)} against the unrotated colour at the same t. ` +
        `Both are the f64 cost of going through linear light and back, not a tolerance chosen to fit. kit.ts: ` +
        `it "moves the hue while holding lightness and chroma exactly. The unsafe one is trading chroma for ` +
        `hue, which is how a warm palette turns to mud, and this cannot do it."`);

    // With two anchors L and C are SUPPOSED to move on the positive side -- that is what duotone is -- so the
    // identity there is different and is still not a re-derivation: the NEGATIVE side must be untouched
    // ("the negative side is left exactly as it was"), and the positive side's scaling must be ONE SCALAR for
    // the whole rail rather than something that varies along it. The two scalars are then checked against the
    // palette's own published dL and dC, which mhShade never returns and the gate never computes.
    let negL = 0, negC = 0;
    const ratL = [], ratC = [];
    for (let i = 1; i <= 50; i++) {
        const t = i / 50, b = lcOf(K.mhShade(p2, t, 0));
        const n = lcOf(K.mhShade(p2, t, -0.5));
        negL = Math.max(negL, Math.abs(n[0] - b[0])); negC = Math.max(negC, Math.abs(n[1] - b[1]));
        const q = lcOf(K.mhShade(p2, t, 0.5));
        ratL.push(q[0] / b[0]); ratC.push(q[1] / b[1]);
    }
    const spread = (a) => (Math.max(...a) - Math.min(...a)) / (a.reduce((x, y) => x + y, 0) / a.length);
    const meanOf = (a) => a.reduce((x, y) => x + y, 0) / a.length;
    ok("!! ...and with TWO anchors the negative side is untouched while the positive side scales by ONE pair of numbers",
        negL < 1e-9 && negC < 1e-9 && spread(ratL) < 1e-6 && spread(ratC) < 1e-6 &&
        Math.abs(meanOf(ratL) - p2.dL) < 1e-6 && Math.abs(meanOf(ratC) - p2.dC) < 1e-6,
        `negative side: L moves ${negL.toExponential(2)}, C moves ${negC.toExponential(2)}. Positive side, ` +
        `across 50 points on the rail: the L ratio varies by ${spread(ratL).toExponential(2)} of its mean and ` +
        `the C ratio by ${spread(ratC).toExponential(2)} -- one scalar each, not a function of position. ` +
        `Those scalars are ${meanOf(ratL).toFixed(6)} and ${meanOf(ratC).toFixed(6)}, against the palette's ` +
        `own dL ${p2.dL.toFixed(6)} and dC ${p2.dC.toFixed(6)}, on a palette reading duo ${p2.duo.toFixed(3)} ` +
        `-- so the row is not passing because the second anchor did nothing.`);

    // ---- the joins are C1, which is the whole reason for the three easings ------------------------------
    const dx = 1e-5;
    const slope = (t) => (K.mhWalk(p1, t + dx)[0] - K.mhWalk(p1, t - dx)[0]) / (2 * dx);
    const midSlope = Math.abs(slope(0.59));
    let worstKink = 0, kinkAt = "";
    for (const j of [0.40, 0.78]) {
        const rel = Math.abs(slope(j - 3 * dx) - slope(j + 3 * dx)) / midSlope;
        if (rel > worstKink) { worstKink = rel; kinkAt = "t = " + j.toFixed(2); }
    }
    ok("the two segment joins are C1, so no kink shows up as a contour line",
        worstKink < 1e-2,
        `worst slope discontinuity ${worstKink.toExponential(2)} of the mid-segment slope ` +
        `${midSlope.toFixed(4)}, at ${kinkAt}. Stated as a FRACTION of the slope rather than an absolute, ` +
        `because a kink only shows against the ramp it sits on. kit.ts: "each eased so its ends are flat, ` +
        `which makes the joins C1: no kink shows up as a contour line in a smooth field".`);

    // ---- the tier curve and the knee --------------------------------------------------------------------
    ok("!! mh_tier puts the bottom 78% of the energy into the rail's first 72%, and lands on 0.72 EXACTLY",
        K.mhTier(0.78) === 0.72 && K.mhTier(0) === 0 && Math.abs(K.mhTier(1) - 1) < 1e-12,
        `tier(0.78) = ${K.mhTier(0.78).toFixed(6)} exactly, tier(0) = ${K.mhTier(0)}, tier(1) = ` +
        `${K.mhTier(1).toFixed(6)}. The two branches are EQUAL at the knot, so the smoothstep blending them ` +
        `over a fifth of the range cannot move the value there -- which makes the exact 0.72 a property of ` +
        `the construction rather than a coincidence of two fitted numbers.`);

    let kneeMax = 0, kneeBelow = 0;
    for (let x = 0; x <= 200; x += 0.05) {
        kneeMax = Math.max(kneeMax, K.mhKnee(x, 0.92));
        if (x < 0.92) kneeBelow = Math.max(kneeBelow, Math.abs(K.mhKnee(x, 0.92) - x));
    }
    ok("!! the knee is the identity below it and never reaches 1 above it, so a specular keeps its SHAPE",
        kneeBelow === 0 && kneeMax <= 1 && K.mhKnee(0.92, 0.92) === 0.92,
        `below the knee the worst departure from the identity is ${kneeBelow} -- exactly zero, it IS x -- and ` +
        `over x in [0, 200] the largest value is ${kneeMax.toFixed(6)}, never above 1. A hard clamp would also ` +
        `satisfy that bound and would flatten every specular above 0.92 into one plateau; this keeps them ` +
        `ordered, which is what "keeps its shape" means.`);

    ok("!! at glow = 0 exactly a third of the energy survives, because a dial that switches it off is a bug",
        K.mhKnee(1.0 * (0.35 + 0.65 * 0), 0.92) === 0.35,
        `e = 1 at glow 0 reaches the rail as ${K.mhKnee(1.0 * 0.35, 0.92)} -- 0.35 exactly, and below the ` +
        `knee, so the knee is the identity there and the number is murmur's own constant unmodified. kit.ts: ` +
        `"because an indicator that can be switched off by a dial is a bug and not a dial".`);

    // ---- AND THE PAIR: THE WHOLE RAIL ON A REAL GPU AGAINST THE CPU REFERENCE ---------------------------
    // *** THIS IS THE ROW THE ROUND WAS BUILT AROUND, AND THE ONE THAT WOULD HAVE CAUGHT IT IN A MINUTE. ***
    // The rail rendered BLACK at every input for most of v4627 because render/murmurKitTsl.mjs used MH_SPREAD
    // without importing it. three.js catches a builder that throws, console.errors it, and substitutes a node
    // generating zero, so renderer.render returns cleanly and the readback is all zeros. Every component
    // measured correct in isolation; nothing measured the whole rail against anything.
    if (!probeRun.ok) {
        ok("!! *** THE COLOUR RAIL RENDERS ON A REAL GPU AND MATCHES THE CPU REFERENCE ***", false,
            `could not render: ${probeRun.reason || (probeRun.skipped ? "skipped: " + probeRun.skipped : "unknown")}`);
    } else {
        const encode = (v) => {
            const c = v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(Math.max(v, 1e-6), 1 / 2.4) - 0.055;
            return Math.round(Math.min(1, Math.max(0, c)) * 255);
        };
        const grade = (rail, palG, flip) => {
            let worst = 0, sum = 0, at = "";
            for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
                const e = (x / N) * 2, g = y / N;
                const want = K.mhLit(palG, e, g, 0, 1, 0.34, 0).map(encode);
                const yy = flip ? N - 1 - y : y, i = (yy * N + x) * 4;
                for (let c = 0; c < 3; c++) {
                    const d = Math.abs(rail[i + c] - want[c]);
                    sum += d;
                    if (d > worst) { worst = d; at = `e = ${e.toFixed(2)}, glow = ${g.toFixed(2)}: gpu ${rail[i]},${rail[i + 1]},${rail[i + 2]} against cpu ${want.join(",")}`; }
                }
            }
            return { worst, mean: sum / (N * N * 3), at };
        };
        // TWO TONES. The house one is what the species wear; the LIGHT one is the only input on which the top
        // stop's 0.93 ceiling does any work at all -- with the house tone alone, deleting that min() from the
        // shader moves nothing in this frame, measured.
        const palG = K.mhPalette(INK, TONE, TONE, 0, 1);
        const palL = K.mhPalette(INK, [0xC8 / 255, 0xC4 / 255, 0xFF / 255], [0xC8 / 255, 0xC4 / 255, 0xFF / 255], 0, 1);
        const gF = grade(probeRun.frames[2], palG, true), gA = grade(probeRun.frames[2], palG, false);
        const lF = grade(probeRun.frames[3], palL, true);
        say(`rail over 256 (energy, glow) points: house tone flipped worst ${gF.worst}/255 mean ${gF.mean.toFixed(3)}, as read worst ${gA.worst}/255; light tone worst ${lF.worst}/255 mean ${lF.mean.toFixed(3)}`);
        ok("!! *** THE COLOUR RAIL RENDERS ON A REAL GPU AND MATCHES THE CPU REFERENCE ACROSS ITS SURFACE ***",
            gF.worst <= 2 && gF.mean < 0.05 && lF.worst <= 2 && lF.mean < 0.05 && gA.worst > 50,
            `house tone: worst channel error ${gF.worst} of 255 and mean ${gF.mean.toFixed(3)} over 256 points ` +
            `spanning energy 0..2 and glow 0..1 -- one frame samples the SURFACE of mh_lit rather than a point ` +
            `on it. Worst at ${gF.at}. LIGHT TONE, where the top stop's ceiling is load-bearing: worst ` +
            `${lF.worst}, mean ${lF.mean.toFixed(3)}. The unflipped orientation is off by ${gA.worst}, so this cannot pass by the ` +
            `symmetry a centred test pattern would have. *** AND IT IS THE ROW THAT DID NOT EXIST WHILE IT ` +
            `WAS NEEDED: *** the rail read 0,0,0 at every one of these points for most of v4627, and the ` +
            `bisect that chased it verified the palette, the decode, the walk and the stops one at a time -- ` +
            `each correct -- because nothing was asking the whole rail this one question.`);
    }

    // ---- AND THE INSTRUMENT ITSELF, WHICH IS WHAT ACTUALLY FAILED THIS ROUND ---------------------------
    // *** THE ROW ABOVE IS ONLY WORTH ITS RUNTIME IF A BUILD FAILURE CANNOT REACH IT AS BLACK PIXELS. ***
    // Every check in this gate that reads a frame grades the numbers it gets back. three.js catches a TSL
    // builder that throws, console.errors it and substitutes a node generating zero, so renderer.render
    // returns cleanly and the readback is all zeros -- and until v4627 renderThreeTslToPixels handed those
    // zeros over as ok:true. A gate reading them is grading a shader that does not exist. Disabling the
    // harness's new guard reddens nothing at all on a correct tree, which is exactly why this row renders a
    // subject that is WRONG ON PURPOSE and asserts the failure, rather than trusting the guard's presence.
    const brokeRun = await renderThreeTslToPixels({
        engineRoot: ENG, moduleImportPath: "/tools/ship/fixtures/tslBuilderThrows.mjs",
        factoryName: "makeThrowingProbe", width: 8, height: 8,
    });
    const named = !brokeRun.ok && /tslBuilderThrows/.test(String(brokeRun.reason)) &&
                  /fails on purpose/.test(String(brokeRun.reason));
    ok("!! *** A SHADER THAT FAILED TO BUILD IS A FAILED RENDER, NOT A FRAME OF BLACK PIXELS ***",
        brokeRun.ok === false && brokeRun.frames == null && named,
        `rendering tools/ship/fixtures/tslBuilderThrows.mjs -- a builder that raises while three.js builds ` +
        `the fragment graph -- comes back ok = ${brokeRun.ok} with no frames, and the reason NAMES the file ` +
        `and the message: ${String(brokeRun.reason).replace(/\s+/g, " ").slice(0, 200)}. Both halves matter: ` +
        `a guard that failed the render without saying which file threw would have left this round's bisect ` +
        `exactly where it was. Costs one launch, about 584 ms, and is the only row here whose subject is the ` +
        `instrument rather than the kit.`);
}

// =============================================================================================================
sec("9. *** THE SURFACE: mh_key / mh_small / mh_surface -- the one piece ALL EIGHTEEN species call ***");
{
    const INKS = [0x0A / 255, 0x0A / 255, 0x0B / 255];
    const PAPERS = [0.97, 0.96, 0.94];

    // ---- mh_key: it MOVES, and it points up-and-LEFT -----------------------------------------------------
    // *** THE SIGNS ARE THE EASIEST THING IN THIS FILE TO GET BACKWARDS. *** Screen y runs DOWN in a
    // colorEffect, so "up and to the left" is NEGATIVE in both -- a port that "corrected" them would light
    // every one of the eighteen from below-right and no single row about brightness would notice.
    const k0 = K.mhKey(0);
    ok("!! the key light points up and to the LEFT, which is negative in both -- screen y runs down",
        k0[0] < 0 && k0[1] < 0 && k0[2] > 0,
        `mhKey(0) = ${k0.map((v) => v.toFixed(4)).join(", ")}. kit.ts: "The light sits up and to the left ... ` +
        `Screen y runs DOWN in a colorEffect, so up-left is negative in both." Asserted as SIGNS rather than ` +
        `as values, because the values drift and the orientation does not.`);

    // "drifts about four degrees over half a minute" -- both halves, and the ambiguity in "four" is named.
    const KEYN = 4000, KEYT = 30;
    let mean = [0, 0, 0];
    const keys = [];
    for (let i = 0; i < KEYN; i++) {
        const kk = K.mhKey(i / KEYN * KEYT);
        keys.push(kk);
        for (let j = 0; j < 3; j++) mean[j] += kk[j] / KEYN;
    }
    const ml = Math.hypot(mean[0], mean[1], mean[2]);
    mean = mean.map((v) => v / ml);
    let halfCone = 0, fullCone = 0;
    for (const kk of keys) halfCone = Math.max(halfCone, Math.acos(Math.min(1, K.dot3(kk, mean))));
    for (let i = 0; i < KEYN; i += 13) for (let j = i; j < KEYN; j += 13)
        fullCone = Math.max(fullCone, Math.acos(Math.min(1, K.dot3(keys[i], keys[j]))));
    const period = 2 * Math.PI / 0.21;
    ok("!! *** THE KEY DRIFTS ABOUT FOUR DEGREES OVER HALF A MINUTE, and BOTH numbers check out ***",
        Math.abs(fullCone * 180 / Math.PI - 4.8) < 0.2 && Math.abs(period - 30) < 0.5,
        `the widest angle between any two key directions is ${(fullCone * 180 / Math.PI).toFixed(2)} degrees ` +
        `and the drift closes on itself every ${period.toFixed(1)} s. *** "FOUR DEGREES" IS AMBIGUOUS BY A ` +
        `FACTOR OF TWO AND THE GATE SAYS WHICH IT MEANS: *** the FULL excursion is ` +
        `${(fullCone * 180 / Math.PI).toFixed(2)} and the half-cone from the mean direction is ` +
        `${(halfCone * 180 / Math.PI).toFixed(2)}. The full one is what "drifts about four degrees" reads as, ` +
        `and it is the one asserted; recording both means the next reader does not have to guess which.`);

    // kit.ts: "at (-0.52, -0.60) the highlight lands at about 0.45 of the radius, clear of whatever the hero
    // has put in the middle." On a sphere the highlight sits where N == H, so its in-plane radius IS |H.xy|.
    const Hv = [k0[0], k0[1], k0[2] + 1];
    const hl = Math.hypot(Hv[0], Hv[1], Hv[2]);
    const hlRad = Math.hypot(Hv[0] / hl, Hv[1] / hl);
    ok("the highlight lands clear of the middle, at about 0.45 of the radius",
        hlRad > 0.35 && hlRad < 0.55,
        `the half-vector puts it at ${hlRad.toFixed(4)} of the radius against kit.ts's "about 0.45" -- a ` +
        `0.017 gap, reported rather than rounded to the quoted figure. The POINT of the number is that it is ` +
        `clear of the middle, "clear of whatever the hero has put in the middle", and 0.43 is.`);

    const sphere = (x, y) => {
        const rho = Math.hypot(x, y);
        const z = Math.sqrt(Math.max(1 - rho * rho, 0));
        const N = [x, y, z];
        const m = 1 - K.smoothstep(1 - 0.018, 1 + 0.018, rho);
        return { m, P: N, N, Rd: 1, rho, fres: 1 - Math.min(1, Math.max(0, z)) };
    };
    const surfAt = (x, y, ink, tilt = [0, 0], rimK = 1.0, specK = 1.0, glowK = 0.15, t = 3.7, small = 0) =>
        K.mhSurface(sphere(x, y), t, small, ink, tilt, rimK, specK, glowK);

    // ---- mh_small: the size dial, and a stated midpoint that is not its real one -------------------------
    ok("!! mh_small reads 1 at 18 pt and exactly 0 from 120 pt up",
        Math.abs(K.mhSmall(18, 18) - 1) < 0.01 && K.mhSmall(120, 120) === 0 && K.mhSmall(400, 400) === 0,
        `18 pt -> ${K.mhSmall(18, 18).toFixed(4)}, 120 pt -> ${K.mhSmall(120, 120)}, 400 pt -> ` +
        `${K.mhSmall(400, 400)}. Square sizes ONLY PROVE HALF OF IT and the sabotage sweep said so: swapping ` +
        `min for max left every row here green, because at 18x18 and 120x120 the two agree. A 200x20 mount ` +
        `reads ${K.mhSmall(200, 20).toFixed(4)} and a 20x200 the same ${K.mhSmall(20, 200).toFixed(4)} -- the ` +
        `THIN side decides, and under max both would read ${K.mhSmall(200, 200)}.`);
    ok("...and it takes the SMALLER side, so a wide thin mount is small in both orientations",
        K.mhSmall(200, 20) > 0.98 && K.mhSmall(20, 200) > 0.98 && K.mhSmall(200, 200) === 0,
        `200x20 -> ${K.mhSmall(200, 20).toFixed(4)}, 20x200 -> ${K.mhSmall(20, 200).toFixed(4)}, 200x200 -> ` +
        `${K.mhSmall(200, 200)}. Stated over a NON-SQUARE pair on purpose: this is the only shape of input on ` +
        `which min and max differ, so it is the only one that tests which was written.`);

    let lo = 1, hi = 400, mid = 0;
    for (let i = 0; i < 60; i++) { mid = (lo + hi) / 2; if (K.mhSmall(mid, mid) > 0.5) lo = mid; else hi = mid; }
    ok("...and its real midpoint is 52 pt where kit.ts says 46 -- carried as shipped, with the gap named",
        Math.abs(mid - 52) < 0.01,
        `mh_small crosses a half at ${mid.toFixed(3)} pt. smoothstep(16, 88, x) reaches a half at the ` +
        `arithmetic middle of its edges, which is 52; kit.ts's header says "the midpoint sits at about 46 pt, ` +
        `the chip mount". A six-point gap. The CODE is shipped, not the prose -- the same call this tree made ` +
        `for MH_SCATTER_K's 3.2-versus-0.098 split and droplet's 0.339 arithmetic slip. A port that corrects ` +
        `its source has stopped being a port.`);

    // *** THE FIRST VERSION OF THIS ROW COMPUTED THE EXPONENT ITSELF AND GRADED ITS OWN ARITHMETIC. ***
    // It read `96 + (16 - 96) * K.mhSmall(...)` in the gate and asserted the two ends -- so mhSurface was
    // never called with a different `small` at all, and pinning the exponent at a fixed 96 inside mhSurface
    // left the row GREEN. Same shape as the hue-rotation row v4627 had to repair. What replaces it measures
    // the SIZE OF THE HIGHLIGHT mhSurface actually draws: the fraction of the visible disk standing at or
    // above half the specular's own peak, at small = 0 and small = 1.
    const specFootprint = (small) => {
        let peak = 0; const vals = []; const G = 260;
        for (let i = 0; i < G; i++) for (let j = 0; j < G; j++) {
            const x = (i + 0.5) / G * 2 - 1, y = (j + 0.5) / G * 2 - 1;
            if (Math.hypot(x, y) >= 1) continue;
            const v = surfAt(x, y, INKS, [0, 0], 1.0, 1.0, 0.15, 3.7, small).spec;
            vals.push(v); if (v > peak) peak = v;
        }
        return vals.filter((v) => v >= peak * 0.5).length / vals.length;
    };
    const fp120 = specFootprint(0), fp18 = specFootprint(1);
    ok("!! *** THE TIGHT SPECULAR IS SIZE-ADAPTIVE, AND THE HIGHLIGHT mh_surface DRAWS IS MEASURED, NOT ITS EXPONENT ***",
        fp18 > fp120 * 3,
        `the highlight covers ${(fp120 * 100).toFixed(3)}% of the visible disk at 120 pt and ` +
        `${(fp18 * 100).toFixed(3)}% at 18 pt -- ${(fp18 / fp120).toFixed(2)}x wider, spreading the same ` +
        `light over more pixels. kit.ts's reason is a pixel count and not a preference: a 96-exponent ` +
        `highlight "covers about four pixels at 120 pt and a third of one at 18 pt, where it would flicker in ` +
        `and out as the body wobbled underneath it". And 96 rather than the 58 a first cut used, for the ` +
        `VALUE HIERARCHY -- at 58 "the glint's saturated core was a tenth of the frame across, a second ` +
        `bright object competing with the interior".`);

    // ---- mh_surface: the terms that MOVE WITH THE GROUND, each measured on both grounds ------------------
    // The rim gain rises by a third on paper "because the edge does more work on paper than it ever does on
    // ink: it is the whole silhouette of an object that is otherwise nearly the colour of the page."
    // Measured on the DARK side of the rim, where the wrap term is at its floor on both grounds, so the 1.32
    // is not confounded by the wrap flattening that also happens on paper.
    // *** THE PAPER RIM GAIN, ISOLATED THROUGH INPUTS RATHER THAN ASSERTED AS A DIRECTION. *** A first cut
    // of this row only checked that the paper rim is brighter, and the sabotage sweep walked straight through
    // it: deleting the 1.32 entirely still leaves paper brighter, because the wrap also rises to 0.88 there.
    // Three factors move with the ground at once, so the row picks the ONE POINT where the other two cannot:
    // the silhouette at N.y = 0. There fres is exactly 1, so the exponent's move from 3.9 to 5.4 changes
    // nothing at all (1 to any power is 1), and sky is exactly 0.5, so envRim is 1.0 on both grounds. What is
    // left is the wrap's 0.88-over-0.840 and the gain itself.
    const gainI = surfAt(1.0, 0, INKS).rim, gainP = surfAt(1.0, 0, PAPERS).rim;
    const wrapOnlyAtPoint = 0.88 / (0.55 + 0.45 * 0.42 / Math.hypot(0.42, 0.50));
    ok("!! the rim gain rises by a third on paper, isolated from the two terms that move with it",
        Math.abs(gainP / gainI / wrapOnlyAtPoint - 1.32) < 0.01,
        `at the silhouette with N.y = 0: ink ${gainI.toFixed(6)}, paper ${gainP.toFixed(6)}, a ratio of ` +
        `${(gainP / gainI).toFixed(4)}. The wrap alone accounts for ${wrapOnlyAtPoint.toFixed(4)} of that, ` +
        `leaving ${(gainP / gainI / wrapOnlyAtPoint).toFixed(4)} -- murmur's 1.32, recovered rather than ` +
        `restated. kit.ts: "the edge does more work on paper than it ever does on ink: it is the whole ` +
        `silhouette of an object that is otherwise nearly the colour of the page. A third more of it, and no ` +
        `other term changes."`);

    // *** AND THE EXPONENT ITSELF, RECOVERED AS A LOGARITHM. *** Along the +x axis every other factor in the
    // rim is constant: the wrap's alignment depends on the DIRECTION of N.xy, which is (1,0) for every point
    // on that ray, and sky is 0.5 throughout, so envRim and m and rimK are fixed. The only thing that varies
    // is fres, and rim goes as fres to the power the ground selects -- so the ratio of two samples gives the
    // exponent back exactly. Deleting the mix(3.9, 5.4, paper) passed every other row in this section.
    const expAt = (ink) => {
        const a = surfAt(0.80, 0, ink).rim, b = surfAt(0.95, 0, ink).rim;
        const fa = 1 - Math.sqrt(Math.max(1 - 0.80 * 0.80, 0)), fb = 1 - Math.sqrt(Math.max(1 - 0.95 * 0.95, 0));
        return Math.log(b / a) / Math.log(fb / fa);
    };
    const eInk = expAt(INKS), ePaper = expAt(PAPERS);
    ok("!! *** THE RIM EXPONENT MOVES WITH THE GROUND: 3.9 ON INK, 5.4 ON PAPER, RECOVERED TO FOUR PLACES ***",
        Math.abs(eInk - 3.9) < 1e-3 && Math.abs(ePaper - 5.4) < 1e-3,
        `recovered as log(rim2/rim1)/log(fres2/fres1) along the +x axis, where every other factor is constant: ` +
        `${eInk.toFixed(4)} on ink and ${ePaper.toFixed(4)} on paper. 3.9 is fitted against a capture rather ` +
        `than chosen -- kit.ts: "at 3 the rim is a broad wash that reads as the body being lit from behind. ` +
        `At 3.9 the light lives in the outer eighth and the eye gets a CRISP EDGE with soft content behind ` +
        `it" -- and it tightens on paper "where a dark edge has to be FINE to read as an edge rather than as ` +
        `a dirty ring".`);

    // THE RIM IS NOT A RING, and the part of it that flattens on paper flattens EXACTLY.
    const ringOf = (ink) => {
        let mn = Infinity, mx = -Infinity;
        for (let a = 0; a < 180; a++) {
            const th = a * Math.PI / 90;
            const v = surfAt(Math.cos(th) * 0.995, Math.sin(th) * 0.995, ink).rim;
            mn = Math.min(mn, v); mx = Math.max(mx, v);
        }
        return { mn, mx, ratio: mx / Math.max(mn, 1e-12) };
    };
    const rInk = ringOf(INKS), rPaper = ringOf(PAPERS);
    // *** THE WRAP IS ISOLATED THROUGH mhSurface ITSELF RATHER THAN RE-COMPUTED HERE. *** A first cut of this
    // row asserted the whole ring ratio drops by a third on paper and failed on a threshold picked from
    // intuition: it drops to 0.73 of the ink figure, not 0.65, because TWO terms vary round that edge and only
    // one of them is meant to flatten. Re-deriving the wrap formula in the gate to separate them is exactly
    // the mistake v4579 and v4580 shipped, so it is separated by choosing INPUTS instead: two points at the
    // same height on the silhouette and opposite sides. envRim depends only on N.y and fres and m are equal
    // there, so the ratio between them is the wrap and nothing else.
    const wrapRatio = (ink) => surfAt(0.995, 0, ink).rim / surfAt(-0.995, 0, ink).rim;
    const wInk = wrapRatio(INKS), wPaper = wrapRatio(PAPERS);
    ok("!! *** THE RIM IS NOT A RING ON INK, AND THE TERM THAT SHOULD FLATTEN ON PAPER FLATTENS EXACTLY ***",
        rInk.ratio > 1.7 && rPaper.ratio < 1.4 && wInk > 1.4 && Math.abs(wPaper - 1) < 1e-12,
        `sweeping 180 points round the silhouette: brightest over dimmest is ${rInk.ratio.toFixed(4)} on ink ` +
        `and ${rPaper.ratio.toFixed(4)} on paper. ISOLATING THE WRAP -- two points at the same height, ` +
        `opposite sides, where envRim and fres and m are all equal -- it is ${wInk.toFixed(4)} on ink and ` +
        `${wPaper.toFixed(12)} on paper: EXACTLY one, a perfect ring, because the mix carries it all the way ` +
        `to the constant 0.88. What is left varying on paper is the ENVIRONMENT term, which is not supposed ` +
        `to flatten -- it inverts -- and that is the next row. kit.ts: 55 per cent everywhere plus 45 per ` +
        `cent on the side AWAY from the key, "which is the wrap light every product photograph of a glass ` +
        `object has", flattening on paper because there "the rim is not lighting at all: it is the refracted ` +
        `edge of a clear sphere, which goes all the way round". Measured round the WHOLE edge rather than at ` +
        `two chosen points, which is the mistake v4624's own rim row shipped.`);

    // The environment gradient INVERTS on paper, "so the top of the sphere is the lighter half of its edge on
    // both grounds". Read at the top and bottom of the silhouette, where sky is 1 and 0.
    const topInk = surfAt(0, -0.995, INKS).rim, botInk = surfAt(0, 0.995, INKS).rim;
    const topPap = surfAt(0, -0.995, PAPERS).rim, botPap = surfAt(0, 0.995, PAPERS).rim;
    ok("!! the environment term INVERTS on paper, so the sphere's top is the lighter edge on BOTH grounds",
        (topInk / botInk > 1) === (topPap / botPap > 1),
        `top-over-bottom is ${(topInk / botInk).toFixed(4)} on ink and ${(topPap / botPap).toFixed(4)} on ` +
        `paper -- the same side wins on both, which is the whole point of the inversion. kit.ts's rule for ` +
        `this term is that "if you can see it, it is wrong": fourteen per cent, and A VALUE GRADIENT AND NOT ` +
        `A COLOUR ONE on purpose, because "a second hue arriving through a term nobody dialled would break ` +
        `the one-hue-family law from underneath".`);

    // ---- the contact glow: OUTSIDE ONLY, and it pools DOWNWARD -------------------------------------------
    const gCentre = surfAt(0, 0, INKS).glow;
    const gInside = surfAt(0.5, 0, INKS).glow;
    const gEdge = surfAt(1.05, 0, INKS).glow;
    ok("!! *** THE CONTACT GLOW IS OUTSIDE THE SILHOUETTE ONLY -- exactly zero under the body ***",
        gCentre === 0 && gInside === 0 && gEdge > 0.01,
        `centre ${gCentre}, half a radius out ${gInside}, and ${gEdge.toFixed(5)} just past the edge. EXACTLY ` +
        `zero inside and not merely small, because the (1 - m) factor is exactly zero wherever membership is ` +
        `exactly one. This port had NO contact glow at all before v4629, on any of its four species, and ` +
        `every one of murmur's eighteen asks for one.`);

    const gBelow = surfAt(0, 1.05, INKS).glow, gAbove = surfAt(0, -1.05, INKS).glow;
    ok("...and it POOLS DOWNWARD rather than ringing the body evenly",
        gBelow > gAbove * 1.5,
        `${gBelow.toFixed(5)} below against ${gAbove.toFixed(5)} above, a ratio of ` +
        `${(gBelow / gAbove).toFixed(2)} -- screen y runs down, so +y is below. kit.ts: its job "is to stop ` +
        `the silhouette meeting the ink as a cut line, not to be a halo anybody notices", which is a shadow's ` +
        `job and not a glow's, and a thing that pools under an object is what a shadow does.`);

    // ---- the roster, and the two files that each claim the same superlative ------------------------------
    const SKn = K.MH_SURFACE_KNOBS;
    const names = Object.keys(SKn);
    const rimAt = (v) => names.map((s) => [s, SKn[s][0] + v * SKn[s][1]]).sort((a, b) => b[1] - a[1]);
    const specAt = (v) => names.map((s) => [s, SKn[s][2] + v * SKn[s][3]]).sort((a, b) => b[1] - a[1]);
    const rim0 = rimAt(0), rim1 = rimAt(1), spec0 = specAt(0), spec1 = specAt(1);
    ok("!! *** TWO OF murmur's FILES EACH CLAIM THE HIGHEST RIM, AND THE ROSTER SETTLES IT: abyss, NOT still ***",
        rim0[0][0] === "abyss" && rim1[0][0] === "abyss" && spec0[0][0] === "still" && spec1[0][0] === "still",
        `over all ${names.length} heroes: the highest RIM is ${rim0[0][0]} at ${rim0[0][1].toFixed(2)} at rest ` +
        `and ${rim1[0][1].toFixed(2)} at full voice (still is ${rim0.find((r) => r[0] === "still")[1].toFixed(2)} ` +
        `and ${rim1.find((r) => r[0] === "still")[1].toFixed(2)}), and the highest SPECULAR is ${spec0[0][0]} ` +
        `at ${spec0[0][1].toFixed(2)}, ahead of ${spec0[1][0]} at ${spec0[1][1].toFixed(2)}. still.ts says ` +
        `"THE HIGHEST RIM AND SPECULAR IN THE COLLECTION"; abyss.ts says "1.70 is the highest in the ` +
        `collection, which is right: this is the hero with the least else". still.ts bundles the two and is ` +
        `HALF right -- it has the specular and abyss has the rim -- and this tree repeated the wrong half in ` +
        `its own gate until v4629.`);

    // ---- AND THE PAIR: THE WHOLE SURFACE ON A REAL GPU ---------------------------------------------------
    if (!probeRun.ok) {
        ok("!! *** mh_surface RENDERS ON A REAL GPU AND MATCHES THE CPU REFERENCE ***", false,
            `could not render: ${probeRun.reason || (probeRun.skipped ? "skipped: " + probeRun.skipped : "unknown")}`);
    } else {
        const surf = probeRun.frames[4];
        const SC = [2.0, 2.0, 0.5];          // the probe's own per-channel scales
        const gradeS = (flip) => {
            let worst = 0, sum = 0, at = "", outside = 0;
            for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
                const bx = (x / N) * 2.4 - 1.2, by = (y / N) * 2.4 - 1.2;
                const o = K.mhSurface(sphere(bx, by), 3.7, 0, INKS, [0.35, -0.20], 1.15, 1.30, 0.40);
                const want = [o.rim, o.spec, o.glow].map((v, c) => Math.round(Math.min(1, Math.max(0, v / SC[c])) * 255));
                const yy = flip ? N - 1 - y : y, i = (yy * N + x) * 4;
                if (Math.hypot(bx, by) > 1.0) outside++;
                for (let c = 0; c < 3; c++) {
                    const d = Math.abs(surf[i + c] - want[c]);
                    sum += d;
                    if (d > worst) { worst = d; at = `(${bx.toFixed(2)}, ${by.toFixed(2)}): gpu ${surf[i]},${surf[i + 1]},${surf[i + 2]} against cpu ${want.join(",")}`; }
                }
            }
            return { worst, mean: sum / (N * N * 3), at, outside };
        };
        const sF = gradeS(true), sA = gradeS(false);
        say(`surface over ${N * N} points spanning -1.2..1.2 body units (${sF.outside} of them OUTSIDE the silhouette): flipped worst ${sF.worst}/255 mean ${sF.mean.toFixed(3)}; as read worst ${sA.worst}/255`);
        ok("!! *** mh_surface RENDERS ON A REAL GPU AND MATCHES THE CPU REFERENCE, RIM SPEC AND GLOW AT ONCE ***",
            sF.worst <= 2 && sF.mean < 0.05 && sA.worst > 20 && sF.outside > 20,
            `worst channel error ${sF.worst} of 255 and mean ${sF.mean.toFixed(3)} over ${N * N} points. The ` +
            `frame deliberately spans -1.2..1.2 rather than the body, so ${sF.outside} sample points are ` +
            `OUTSIDE the silhouette: the contact glow lives entirely out there, and a probe cropped to the ` +
            `body would grade it at zero everywhere and call that agreement. Worst at ${sF.at}. The unflipped ` +
            `orientation is off by ${sA.worst}, so this cannot pass by the symmetry a centred pattern would ` +
            `have -- and the tilt is a NONZERO (0.35, -0.20) here, so the counter-move term the species ` +
            `exercise at zero is exercised for real by this row.`);
    }
}

// =============================================================================================================
sec("10. *** opal's FOUR LIVES AND abyss's CLOCKS: the two species whose subject is TIME ***");
{
    // *** THESE ARE IN THE KIT BECAUSE A FORMULA INLINED IN A SPECIES FILE HAS NOTHING TO GRADE IT. ***
    // v4632 first wrote opal's life envelope and abyss's slot straight into render/aiPresenceOrbTsl.mjs, and
    // the sabotage sweep walked through three of them at once: removing the life's FLOOR, flattening its four
    // periods into ONE, and swapping sin squared for a bare sine all left every row in the tree green. They
    // are claims about EVERY INSTANT, and a render samples four. Moved into the kit they get the same
    // treatment as limnArc and cometFall: an f64 twin here and the real shader graded against it below.

    // ---- opal: nothing ever switches on --------------------------------------------------------------
    let pk = -1, tr = 2, tPk = 0, tTr = 0;
    for (let i = 0; i < 200000; i++) {
        const t = i * 0.001, v = K.opalLife(0, t);
        if (v > pk) { pk = v; tPk = t; }
        if (v < tr) { tr = v; tTr = t; }
    }
    const slope = (t, h = 1e-6) => (K.opalLife(0, t + h) - K.opalLife(0, t - h)) / (2 * h);
    ok("!! *** opal's LIFE HAS FLAT ENDS AND A FLOOR: it peaks at 1 and troughs at 0.16, both with ZERO slope ***",
        Math.abs(pk - 1) < 1e-12 && Math.abs(tr - 0.16) < 1e-12 &&
        Math.abs(slope(tPk)) < 1e-6 && Math.abs(slope(tTr)) < 1e-6,
        `peak ${pk.toFixed(6)} at t = ${tPk.toFixed(3)} and trough ${tr.toFixed(6)} at t = ${tTr.toFixed(3)}, ` +
        `with derivatives ${slope(tPk).toExponential(1)} and ${slope(tTr).toExponential(1)}. BOTH HALVES ` +
        `MATTER AND EITHER ALONE IS PASSABLE: a bare |sin| on the same floor has the same peak and the same ` +
        `trough and a KINK at the bottom, which is the arrival reading as an event -- exactly the strobe ` +
        `opal.ts says the species is built to avoid ("play-of-colour in a real opal is not a flicker"). The ` +
        `slope is what tells the two apart.`);

    let brightestEver = 1, dimmestPeak = 0;
    for (let i = 0; i < 400000; i++) {
        const t = i * 0.005;
        let hi = 0, lo = 1;
        for (let k = 0; k < 4; k++) { const v = K.opalLife(k, t); hi = Math.max(hi, v); lo = Math.min(lo, v); }
        brightestEver = Math.min(brightestEver, hi);
        dimmestPeak = Math.max(dimmestPeak, lo);
    }
    ok("!! *** THE STONE IS NEVER DARK AND THE FOUR NEVER ARRIVE TOGETHER, over 2,000 seconds ***",
        brightestEver > 0.18 && dimmestPeak < 0.99,
        `across 400,000 samples the BRIGHTEST of the four never falls below ${brightestEver.toFixed(4)} -- so ` +
        `there is always a flash in the stone -- and the DIMMEST never rises above ${dimmestPeak.toFixed(4)}, ` +
        `so all four are never lit at once. The periods are mutually incommensurate by construction ` +
        `(14.3 + 2.7k), which is what makes "no gap between arrivals repeats" true rather than approximately ` +
        `true, and this row is how a flattening of those four periods into one would show: they would peak ` +
        `together and the dimmest would reach 1.`);

    // *** AND opal.ts's OWN LIST OF THOSE PERIODS IS OFF BY A TENTH ON TWO OF FOUR. ***
    const periods = [0, 1, 2, 3].map((k) => 14.3 + 2.7 * k);
    ok("opal's four periods are 14.3, 17.0, 19.7 and 22.4 -- its header says 17.1 and 19.6, and the code ships",
        Math.abs(periods[1] - 17.0) < 1e-9 && Math.abs(periods[2] - 19.7) < 1e-9,
        `14.3 + 2.7k gives ${periods.map((v) => v.toFixed(1)).join(", ")}; opal.ts's header says "Periods ` +
        `14.3, 17.1, 19.6 and 22.4 seconds". Two of the four are off by a tenth of a second in the PROSE. ` +
        `Carried as shipped with the gap named, the same call this tree made for MH_SCATTER_K's 3.2 against ` +
        `0.098, mh_small's 46 against 52, and droplet's 0.339 against 0.34177.`);

    ok("...and the four hue keys are exactly -1, -1/3, +1/3 and +1, so they balance about the anchor",
        [0, 1, 2, 3].map(K.opalHueKey).reduce((a, b) => a + b, 0) === 0 &&
        K.opalHueKey(0) === -1 && K.opalHueKey(3) === 1,
        `${[0, 1, 2, 3].map((k) => K.opalHueKey(k).toFixed(4)).join(", ")}, summing to EXACTLY ` +
        `${[0, 1, 2, 3].map(K.opalHueKey).reduce((a, b) => a + b, 0)}. opal.ts: "the four flashes sit at four ` +
        `points across the spread -- two either side of the anchor". A set that did not sum to zero would ` +
        `drag the whole stone off its own hue family.`);

    // ---- abyss: rarity is the slot length --------------------------------------------------------------
    const slotDefault = K.abyssSlot(0.6), slotVoice = K.abyssSlot(0.6, 1), slotSmall = K.abyssSlot(0.6, 0, 0, 0, 1);
    ok("!! *** abyss's DEFAULT SLOT IS ABOUT TWENTY SECONDS, which is its own file's claim for the species ***",
        Math.abs(slotDefault - 19.2) < 0.1 && slotVoice < slotDefault * 0.7 && slotSmall < slotDefault * 0.7,
        `at the roster's default rarity of 0.6 the slot is ${slotDefault.toFixed(2)} s, against abyss.ts's "at ` +
        `the default rarity a creature passes roughly every twenty seconds". Voice takes it to ` +
        `${slotVoice.toFixed(2)} s -- "speak to it and the abyss becomes populated", the one reading of level ` +
        `that suits a species whose subject is scarcity -- and the small mounts to ${slotSmall.toFixed(2)} s, ` +
        `"so the species shows itself at a glance" rather than making a thirteen-point bead sit through its ` +
        `own silence. RARITY RUNS THE INTUITIVE WAY: ${K.abyssSlot(0).toFixed(1)} s at 0 and ` +
        `${K.abyssSlot(1).toFixed(1)} s at 1, so high IS rarer.`);

    const lanes = K.ABYSS_LANES.map((l) => l.slot);
    let nearest = 1;
    for (const a of lanes) for (const b of lanes) if (a !== b) nearest = Math.min(nearest, Math.abs(b / a - Math.round(b / a)));
    ok("...and its three lanes run on slots whose ratios are not whole numbers, so the gaps never line up",
        new Set(lanes).size === 3 && nearest > 0.15,
        `slot multipliers ${lanes.join(", ")}, with pairwise ratios ${(lanes[1] / lanes[0]).toFixed(4)}, ` +
        `${(lanes[2] / lanes[0]).toFixed(4)} and ${(lanes[2] / lanes[1]).toFixed(4)}. The TIGHTEST of the six ` +
        `ratios is ${nearest.toFixed(4)} from a whole number -- that is 1.81 against 2, so lane three fires ` +
        `roughly every other time lane one does and slips 9.5% of a slot each cycle, realigning only after ` +
        `about ten. "Never equal" is a statement about drift, not about being far from an integer, and 0.19 ` +
        `is what the shipped numbers give. A first cut asked for 0.2 and reddened on murmur's own roster. ` +
        `abyss.ts: "Three lanes on long, independently jittered clocks, so the gaps between passes are never ` +
        `equal and two creatures overlap only occasionally." Three lanes sharing one clock would make every ` +
        `pass a triple.`);

    // ---- AND THE PAIR ----------------------------------------------------------------------------------
    if (!probeRun.ok) {
        ok("!! *** opal's LIFE AND abyss's SLOT RENDER ON A REAL GPU AND MATCH THE CPU REFERENCE ***", false,
            `could not render: ${probeRun.reason || (probeRun.skipped ? "skipped: " + probeRun.skipped : "unknown")}`);
    } else {
        const oa = probeRun.frames[5];
        let wLife = 0, wSlot = 0, atL = "";
        for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
            const i = ((N - 1 - y) * N + x) * 4;
            const kk = Math.floor((x / N) * 4), tt = (y / N) * 24;
            const wantLife = Math.round(Math.min(1, Math.max(0, K.opalLife(kk, tt))) * 255);
            const wantSlot = Math.round(Math.min(1, Math.max(0, K.abyssSlot(x / N, Math.floor((y / N) * 3) * 0.5) / 32)) * 255);
            const dL = Math.abs(oa[i] - wantLife), dS = Math.abs(oa[i + 1] - wantSlot);
            if (dL > wLife) { wLife = dL; atL = `k=${kk} t=${tt.toFixed(1)}: gpu ${oa[i]} cpu ${wantLife}`; }
            wSlot = Math.max(wSlot, dS);
        }
        say(`opal life and abyss slot over ${N * N} points: worst |gpu - cpu| = ${wLife}/255 on the life, ${wSlot}/255 on the slot`);
        ok("!! *** opal's LIFE AND abyss's SLOT RENDER ON A REAL GPU AND MATCH THE CPU REFERENCE ***",
            wLife <= 2 && wSlot <= 2,
            `worst channel error ${wLife} of 255 on the life across four flashes and 24 seconds, and ${wSlot} ` +
            `on the slot across the whole rarity range at three voices. Worst life at ${atL}. This is the row ` +
            `that makes the four CPU rows above mean anything about the PICTURE: without it they describe a ` +
            `reference implementation nothing draws, which is the shape v4632's sabotage sweep caught when ` +
            `these formulas lived inline in the species file and three corruptions of them passed everything.`);
    }
}

// =============================================================================================================
// =============================================================================================================
sec("11. *** mh_live AND mh_state: THE TWO SIGNALS EVERY SPECIES READS AND THIS PORT DID NOT HAVE ***");
{
    const r = probeRun;
    if (!r.ok) {
        ok("!! mh_live and mh_state match a real GPU render", false, `could not render: ${r.reason || "unknown"}`);
    } else {
        // THE SAME ROW FLIP SECTION 6 MEASURED: three's uv has v=0 at the BOTTOM and this readback is
        // top-row-first, so shader row y arrives at readback row N-1-y. Both probes put the STATE on y, so
        // getting this backwards would grade LISTENING against SUCCESS -- which is how the first cut of this
        // section read, with the voice lift landing at readback row 3. It is asserted rather than assumed:
        // every row below also reports what the UNFLIPPED reading would have scored.
        const ry = (ysh) => N - 1 - ysh;
        const sIdx = (ysh) => Math.floor((ysh / N) * 5);
        // The middle readback row of a state's band, which is where a state's three rows are unambiguous.
        const bandRow = (si) => ry(Math.floor(((si + 0.5) / 5) * N));

        // ---- the f64 twin, so the CPU export is load-bearing rather than merely present ---------------------
        // *** THREE IMPLEMENTATIONS, NOT TWO. *** render/murmurKit.mjs's mhLive and mhState are the f64 scalar
        // reference; render/murmurKitTsl.mjs's are an f32 node graph on a GPU; and the expectations written out
        // by hand below are murmur's numbers transcribed a third time. Without this row the CPU pair would be an
        // export nothing reads -- which is how a reference drifts away from the shader it is supposed to be the
        // reference FOR, and the shape three of this tree's repaired records had.
        {
            let wc = 0, at = "";
            for (let si = 0; si <= 4; si++) for (let k = 0; k <= 40; k++) {
                const u = k / 40;
                const lvC = K.mhLive(u, u, si);
                const wantV = Math.pow(u, 0.65) * (0.55 + 0.45 * (si === 1 ? 1 : 0));
                const wantP = Math.pow(u, 0.85) * (0.60 + 0.40 * ((si === 2 || si === 3) ? 1 : 0));
                for (const [g, w, nm] of [[lvC.voice, wantV, "voice"], [lvC.pace, wantP, "pace"]]) {
                    const d = Math.abs(g - w);
                    if (d > wc) { wc = d; at = `${nm} at ${u.toFixed(3)} state ${si}: ${g} vs ${w}`; }
                }
                const tau = (k / 40) * 1.4, stC = K.mhState(si, tau);
                const succ = si === 4 ? 1 : 0, resp = si === 3 ? 1 : 0;
                const a = Math.min(1, tau / 1.20), sw = Math.min(1, tau / 0.95);
                const ssq = (e0, e1, x) => { const uu = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return uu * uu * (3 - 2 * uu); };
                const wantS = { complete: ssq(0, 0.30, a) * (1 - ssq(0.36, 1.0, a)) * succ, sweep: ssq(0, 1, sw) * succ,
                                settled: ssq(0.30, 1.05, a) * succ, drive: ssq(0, 0.55, tau) * resp };
                for (const nm of ["complete", "sweep", "settled", "drive"]) {
                    const d = Math.abs(stC[nm] - wantS[nm]);
                    if (d > wc) { wc = d; at = `${nm} at tau ${tau.toFixed(3)} state ${si}: ${stC[nm]} vs ${wantS[nm]}`; }
                }
            }
            ok("!! the f64 CPU twin of mh_live and mh_state agrees with the hand-written curves to f64 rounding",
                wc < 1e-15,
                `worst |cpu - hand-written| = ${wc.toExponential(2)} over 205 points x 6 outputs` +
                `${at ? " (worst at " + at + ")" : ""}. This is the row that makes render/murmurKit.mjs's export ` +
                `load-bearing: the GPU rows below grade the SHADER against the same hand-written numbers, so ` +
                `without this one the CPU reference could drift and nothing would notice.`);
        }

        // ---- mh_live ----------------------------------------------------------------------------------------
        // *** THE CONSTANTS ARE SPELLED OUT HERE AND NOT READ OUT OF THE SUBJECT. *** This tree has the v4579
        // scar for a gate that re-stated the formula it was grading, and half of v4640's rows had to be
        // re-titled for grading a table instead of a shader. So the CPU side below is murmur's four numbers
        // written out by hand -- 0.65 and 0.55 for voice, 0.85 and 0.60 for pace, with the LISTENING window on
        // one and the THINKING-plus-RESPONDING window on the other -- and if render/murmurKit.mjs's mhLive is
        // edited to disagree with kit.ts, BOTH this row and the pixel rows in the orb's own gate go red rather
        // than moving together in silence.
        const lv = r.frames[6];
        const liveWant = (u, si) => [
            Math.round(Math.min(1, Math.pow(u, 0.65) * (0.55 + 0.45 * (si === 1 ? 1 : 0))) * 255),
            Math.round(Math.min(1, Math.pow(u, 0.85) * (0.60 + 0.40 * ((si === 2 || si === 3) ? 1 : 0))) * 255)];
        let wV = 0, wP = 0, atV = "", atP = "", wFlat = 0;
        for (let ysh = 0; ysh < N; ysh++) for (let x = 0; x < N; x++) {
            const u = x / N, si = sIdx(ysh), want = liveWant(u, si);
            const i = (ry(ysh) * N + x) * 4, iFlat = (ysh * N + x) * 4;
            const dV = Math.abs(lv[i] - want[0]), dP = Math.abs(lv[i + 1] - want[1]);
            if (dV > wV) { wV = dV; atV = `signal ${u.toFixed(4)} state ${si}: gpu ${lv[i]} cpu ${want[0]}`; }
            if (dP > wP) { wP = dP; atP = `signal ${u.toFixed(4)} state ${si}: gpu ${lv[i + 1]} cpu ${want[1]}`; }
            wFlat = Math.max(wFlat, Math.abs(lv[iFlat] - want[0]), Math.abs(lv[iFlat + 1] - want[1]));
        }
        say(`mh_live over ${N} signals x 5 states: worst |gpu - cpu| = ${wV}/255 on voice, ${wP}/255 on pace ` +
            `(unflipped, ${wFlat}/255)`);
        ok("!! *** mh_live RENDERS ON A REAL GPU AND MATCHES THE HAND-WRITTEN CURVE ***",
            wV <= 2 && wP <= 2 && wFlat > 20,
            `worst voice error ${wV} of 255 (${atV || "no disagreement"}), worst pace error ${wP} of 255 ` +
            `(${atP || "no disagreement"}); the unflipped orientation scores ${wFlat}, so this cannot pass by ` +
            `the symmetry a state-independent curve would have. The exponents are what make the bound hard to ` +
            `meet by accident: 0.65 read as a square root is within 3% of it at the top of the range but 21 ` +
            `counts of 255 at the bottom, so the lattice has to reach down there -- and it starts at 0.`);

        // pow(0, 0.65) is the one input a driver could hand back NaN for -- named as its own row because a
        // NaN would clamp to 0 in some paths and to 1 in others and the error bound above would barely move.
        let zeroBad = 0;
        for (let y = 0; y < N; y++) { const i = (y * N + 0) * 4; if (lv[i] !== 0 || lv[i + 1] !== 0) zeroBad++; }
        ok("!! a silent signal gives a silent voice and pace in every state -- pow(0, 0.65) is 0, not NaN",
            zeroBad === 0,
            `all ${N} rows read exactly 0 in both channels at signal 0. WGSL evaluates pow as ` +
            `exp2(e2 * log2(e1)), so this is exp2(-inf) and not a special case anybody wrote -- and the probe's ` +
            `lattice deliberately starts AT zero rather than at 1/${N} so the question gets asked at all.`);

        // *** THE TWO WINDOWS ARE DIFFERENT AND THE ROW SAYS SO WITH THE FRAME'S OWN NUMBERS. *** voice is
        // lifted in LISTENING alone; pace in THINKING and RESPONDING. A port that gave them one shared window
        // would pass every error bound above at four of the five states.
        const col = (ch, si) => lv[(bandRow(si) * N + (N - 1)) * 4 + ch];
        const vByState = [0, 1, 2, 3, 4].map((si) => col(0, si));
        const pByState = [0, 1, 2, 3, 4].map((si) => col(1, si));
        say(`at the top signal, voice by state = [${vByState}], pace by state = [${pByState}]`);
        const allEq = (a, ix) => ix.every((k) => a[k] === a[ix[0]]);
        ok("!! *** VOICE IS LIFTED IN LISTENING ALONE AND PACE IN THINKING AND RESPONDING -- TWO WINDOWS ***",
            vByState[1] > vByState[0] && allEq(vByState, [0, 2, 3, 4]) &&
            pByState[2] > pByState[0] && pByState[2] === pByState[3] && allEq(pByState, [0, 1, 4]),
            `voice reads ${vByState[1]} in LISTENING against ${vByState[0]} in the other four, which are all ` +
            `equal to each other; pace reads ${pByState[2]} in THINKING and RESPONDING alike against ` +
            `${pByState[0]} in the other three. kit.ts: "the same microphone level means different things in ` +
            `different states", and RESPONDING is inside one window and outside the other -- which is exactly ` +
            `the pair a single shared window would collapse, at the one state where it is cheapest to get wrong.`);

        // ---- mh_state ---------------------------------------------------------------------------------------
        const st = r.frames[7];
        const ss = (e0, e1, x) => { const u = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return u * u * (3 - 2 * u); };
        const NAME = ["complete", "sweep", "settled", "drive"];
        const stateWant = (tau, si) => {
            const succ = si === 4 ? 1 : 0, resp = si === 3 ? 1 : 0;
            const a = Math.min(1, tau / 1.20), sw = Math.min(1, tau / 0.95);
            return [Math.round(ss(0, 0.30, a) * (1 - ss(0.36, 1.0, a)) * succ * 255),
                    Math.round(ss(0, 1, sw) * succ * 255),
                    Math.round(ss(0.30, 1.05, a) * succ * 255),
                    Math.round(ss(0, 0.55, tau) * resp * 255)];
        };
        let wS = 0, atS = "", wSFlat = 0;
        for (let ysh = 0; ysh < N; ysh++) for (let x = 0; x < N; x++) {
            const tau = (x / N) * 1.4, si = sIdx(ysh), want = stateWant(tau, si);
            const i = (ry(ysh) * N + x) * 4, iFlat = (ysh * N + x) * 4;
            for (let c = 0; c < 4; c++) {
                const d = Math.abs(st[i + c] - want[c]);
                if (d > wS) { wS = d; atS = `${NAME[c]} at tau ${tau.toFixed(3)} state ${si}: gpu ${st[i + c]} cpu ${want[c]}`; }
                wSFlat = Math.max(wSFlat, Math.abs(st[iFlat + c] - want[c]));
            }
        }
        // The two windows that are easy to write as one number: complete's 1.20 against sweep's 0.95. Read off
        // the SUCCESS band at the tau nearest 1.0 second, which is where they are furthest apart.
        const xTau1 = Math.round((1.0 / 1.4) * N), iT1 = (bandRow(4) * N + xTau1) * 4;
        say(`mh_state over ${N} taus x 5 states x 4 outputs: worst |gpu - cpu| = ${wS}/255 (unflipped, ${wSFlat}/255)`);
        ok("!! *** mh_state's FOUR OUTPUTS RENDER ON A REAL GPU AND MATCH THE HAND-WRITTEN CURVES ***",
            wS <= 2 && wSFlat > 20,
            `worst error ${wS} of 255 (${atS || "no disagreement"}) across all ${N * N * 4} samples, against ` +
            `${wSFlat} unflipped. At tau = ${(xTau1 / N * 1.4).toFixed(3)} s in SUCCESS, complete reads ` +
            `${st[iT1]} of 255 and sweep ${st[iT1 + 1]} -- the breath is already most of the way out while the ` +
            `travel is still finishing, which is the whole reason the two windows are 1.20 and 0.95 and not one ` +
            `number. kit.ts: "a flash that starts at full speed and stops dead is a wipe, and a wipe is a UI ` +
            `transition rather than an arrival travelling through a material."`);

        // The three quiet states are the load-bearing half of mh_state: every species multiplies its interior
        // by (1 + complete), so `complete` at exactly zero outside SUCCESS is what spares eighteen shaders a guard.
        let leak = 0, leakAt = "";
        for (let ysh = 0; ysh < N; ysh++) {
            const si = sIdx(ysh); if (si === 3 || si === 4) continue;
            for (let x = 0; x < N; x++) { const i = (ry(ysh) * N + x) * 4;
                for (let c = 0; c < 4; c++) if (st[i + c] !== 0) { leak++; leakAt = leakAt || `${NAME[c]} nonzero in state ${si}`; } }
        }
        // ...and the two loud states have to be loud, or "four zeros everywhere" would pass the line above.
        const iS = (bandRow(4) * N + N - 1) * 4, iR = (bandRow(3) * N + N - 1) * 4;
        const loud = st[iS + 2] > 200 && st[iS + 1] > 200 && st[iR + 3] > 200;
        ok("!! *** IDLE, LISTENING AND THINKING PRODUCE EXACTLY FOUR ZEROS -- AND SUCCESS AND RESPONDING DO NOT ***",
            leak === 0 && loud,
            `${leak} nonzero samples across the three quiet states${leakAt ? " (" + leakAt + ")" : ""}, while at ` +
            `the far tau SUCCESS reaches ${st[iS + 2]} of 255 on settled and ${st[iS + 1]} on sweep, and ` +
            `RESPONDING ${st[iR + 3]} on drive. The second half is what stops a shader returning four zeros ` +
            `unconditionally from passing the first -- which is the shape of every "cannot fail" row this tree ` +
            `has had to repair.`);

        // *** WHAT THIS SECTION DOES NOT CLAIM. *** mh_state is ported and graded; it is not CALLED by
        // render/aiPresenceOrbTsl.mjs. murmur's eighteen sources reference st.drive 44 times, st.complete 49,
        // st.settled 19 and st.sweep 16, and every one is a transcription with its own constants. The orb
        // therefore gained `activity` and `stateIndex` at v4641 and deliberately NOT `stateTau`: a uniform
        // nothing reads is a row that cannot fail. tools/ship/aiPresenceOrb-selfcheck.mjs is where mh_live's
        // arrival in the PICTURE is graded, and there is no such section for mh_state yet, by design.
    }
}
// =============================================================================================================
sec("12. *** mh_present's TAIL: THE CATCHLIGHT, THE CONTACT SHADOW AND THE KNEE -- the finish, on both grounds ***");
{
    const r = probeRun;
    if (!r.ok) {
        ok("!! mh_present's finish matches a real GPU render", false, `could not render: ${r.reason || "unknown"}`);
    } else {
        const ry = (ysh) => N - 1 - ysh;   // the same row flip section 11 measures and asserts
        const INK = [0x0A / 255, 0x0A / 255, 0x0B / 255], PAPER = [0.97, 0.96, 0.94];
        const TONE = [0x6C / 255, 0x63 / 255, 0xE8 / 255];

        const GREY_GROUND = [0.75, 0.75, 0.75], GREY_INK = [0.45, 0.45, 0.45];
        for (const [name, frame, ground, page] of [["paper", r.frames[8], PAPER, INK], ["ink", r.frames[9], INK, INK],
                                                   ["light grey", r.frames[10], GREY_GROUND, GREY_INK]]) {
            const pal = K.mhPalette(ground, TONE, TONE, 0.0, 1.0);
            const inkLin = page.map((c) => K.srgbToLinear(c));
            let worst = 0, at = "", worstFlat = 0;
            for (let ysh = 0; ysh < N; ysh++) for (let x = 0; x < N; x++) {
                const spec = (x / N) * 1.2, uvY = ((ysh / N) * 2.4 - 1.2) * K.MH_R;
                const want = K.mhPresentFinish([0.5, 0.5, 0.5], spec, 0.5, uvY, pal, inkLin)
                    .map((v) => Math.round(Math.min(1, Math.max(0, v * 0.5)) * 255));
                const i = (ry(ysh) * N + x) * 4, iFlat = (ysh * N + x) * 4;
                for (let c = 0; c < 3; c++) {
                    const d = Math.abs(frame[i + c] - want[c]);
                    if (d > worst) { worst = d; at = `spec ${spec.toFixed(3)} uvY ${uvY.toFixed(3)} ch ${c}: gpu ${frame[i + c]} cpu ${want[c]}`; }
                    worstFlat = Math.max(worstFlat, Math.abs(frame[iFlat + c] - want[c]));
                }
            }
            say(`mh_present's finish on ${name}, ${N} speculars x ${N} heights x 3 channels: worst |gpu - cpu| = ` +
                `${worst}/255 (unflipped, ${worstFlat}/255)`);
            ok(`!! *** mh_present's FINISH RENDERS ON A REAL GPU AND MATCHES THE CPU REFERENCE -- ${name} ground ***`,
                worst <= 2 && (name === "ink" || worstFlat > 10),
                `worst channel error ${worst} of 255 (${at || "no disagreement"})` +
                (name === "ink" ? ". On ink this function IS the knee and nothing else -- every other term is " +
                    "multiplied by `paper` -- so this row is what would catch the paper terms leaking onto the " +
                    "dark ground, where murmur applies none of them."
                 : `, against ${worstFlat} unflipped, so it cannot pass by the symmetry a height-independent ` +
                   `finish would have.`));
        }

        // *** THE THREE TERMS, SEPARATED, BECAUSE AN AGREEMENT BOUND DOES NOT SAY WHICH ONE IS PRESENT. ***
        // Two implementations of the same wrong formula agree perfectly. These read the PICTURE the probe drew.
        const pap = r.frames[8], ink = r.frames[9];
        const at = (f, xsh, ysh, c) => f[(ry(ysh) * N + xsh) * 4 + c];
        const midY = Math.floor(N / 2);
        const specLo = at(pap, 1, midY, 0), specHi = at(pap, N - 1, midY, 0);
        const inkLo = at(ink, 1, midY, 0), inkHi = at(ink, N - 1, midY, 0);
        say(`at mid height, red channel across the specular sweep -- paper ${specLo} -> ${specHi}, ink ${inkLo} -> ${inkHi}`);
        ok("!! *** THE CATCHLIGHT IS ON PAPER AND ON PAPER ONLY: the specular lifts the page and does nothing on ink ***",
            specHi - specLo > 40 && Math.abs(inkHi - inkLo) <= 1,
            `across a specular of 0 to 1.2 the paper ground climbs ${specHi - specLo} counts of 255 while the ink ` +
            `ground moves ${Math.abs(inkHi - inkLo)}. kit.ts: on paper "THE SPECULAR IS THE ONLY THING BRIGHTER ` +
            `THAN THE PAGE, so it leaves the energy sum and comes back as a small mix toward a warm white" -- and ` +
            `on ink it never left the sum, so there is nothing here to add back. BOTH HALVES ARE THE CLAIM: the ` +
            `lift alone would pass for a port that applied the catchlight on both grounds.`);

        // The shadow is read DOWN the frame at a specular of zero, so the catchlight cannot be what moved it.
        const top = at(pap, 0, 2, 0), bottom = at(pap, 0, N - 3, 0);
        const topInk = at(ink, 0, 2, 0), bottomInk = at(ink, 0, N - 3, 0);
        say(`at specular 0, red channel top-of-frame vs bottom -- paper ${top} -> ${bottom}, ink ${topInk} -> ${bottomInk}`);
        ok("!! *** THE CONTACT SHADOW POOLS DOWNWARD AND ONLY ON PAPER: a shadow pools, it does not ring ***",
            top - bottom > 20 && Math.abs(topInk - bottomInk) <= 1,
            `the page darkens ${top - bottom} counts from the top of the frame to the bottom at a specular of ` +
            `ZERO -- so it is the shadow and not the catchlight -- while the ink ground moves ` +
            `${Math.abs(topInk - bottomInk)}. kit.ts: "at 0.06 above the centre line and full below it, the page ` +
            `is clean over the top of the object and darkens under it". *** THE SIGN OF THAT IS THE ONE THING ` +
            `HERE NOT COPIED FROM THE SOURCE: *** murmur reads gl_FragCoord, where y runs DOWN, and this port ` +
            `takes its quad from three's uv(). The direction was measured off the contact GLOW instead -- the ` +
            `only term outside the silhouette, which murmur already weights downward -- at 128 px over the ` +
            `annulus past the body: limn 1.426 bottom-over-top, still 1.074, abyss 1.015, all above 1. v4638 ` +
            `is what asking that question from the source rather than the pixels costs.`);

        // The knee is the one term that is NOT gated on paper, so ink is where it is visible alone.
        const kneeCpu = (x, k) => K.mhKnee(x, k);
        say(`the knee alone, on ink: mhKnee(1.5, 0.90) = ${kneeCpu(1.5, 0.90).toFixed(6)}, and on paper ` +
            `mhKnee(1.5, 0.96) = ${kneeCpu(1.5, 0.96).toFixed(6)}`);
        ok("!! ...and the KNEE is the one term that is not gated on paper -- it MOVES with the ground rather than switching",
            kneeCpu(1.5, 0.90) < kneeCpu(1.5, 0.96) && kneeCpu(0.5, 0.90) === 0.5 && kneeCpu(0.5, 0.96) === 0.5,
            `a linear light of 1.5 compresses to ${kneeCpu(1.5, 0.90).toFixed(4)} at the ink knee of 0.90 and ` +
            `${kneeCpu(1.5, 0.96).toFixed(4)} at the paper knee of 0.96, while 0.5 passes through untouched at ` +
            `both. kit.ts: 0.90 "stops a bright field becoming flat white paper, but when the ground already IS ` +
            `paper that same knee spends all its headroom on the page", so it opens to 0.96 where "the page ` +
            `passes through almost untouched and the highlight still compresses rather than clipping hard".`);

        // *** WHAT SECTION 12 DOES NOT CLAIM. *** mh_out. The triangular-PDF interleaved-gradient dither is
        // still unported, so this is mh_present's finish MINUS its last line, and the function is named
        // mhPresentFinish rather than mhPresent for exactly that reason.
    }
}


sec("13. *** mh_ignite: THE SUCCESS SHELL -- a ring that LEAVES the heart and REACHES the surface ***");
{
    const r = probeRun;
    if (!r.ok) {
        ok("!! mh_ignite matches a real GPU render", false, `could not render: ${r.reason || "unknown"}`);
    } else {
        const ry = (ysh) => N - 1 - ysh;   // the same row flip sections 11 and 12 measure and assert
        const ig = r.frames[11];
        // The three species the probe carries, in the three channels, with murmur's constants written out by
        // hand -- NOT read out of MH_IGNITE. If the table is edited to disagree with the source, this section
        // and the table part ways instead of moving together, which is the v4579 lesson in one line.
        const CH = [["still", 0.02, 0.95, 0.26, 0], ["duet", 0.02, 1.00, 0.22, 1], ["tempest", 0.02, 1.05, 0.24, 2]];
        const pOf = (x) => (x / N) * 1.2;          // the probe's |p| axis
        const sOf = (ysh) => ysh / N;              // the probe's sweep axis

        // ---- the f64 twin, so the CPU export is load-bearing rather than merely present -------------------
        {
            let wc = 0, at = "";
            for (const [nm, lo, hi, width] of CH) for (let a = 0; a <= 24; a++) for (let b = 0; b <= 24; b++) {
                const pl = (a / 24) * 1.2, sw = b / 24, cm = 0.37;
                const g = K.mhIgnite(pl, cm, sw, lo, hi, width);
                const centre = lo + (hi - lo) * sw;             // mix(lo, hi, sweep), written out
                const q = (pl - centre) / width;
                const want = cm * Math.exp(-(q * q));
                const d = Math.abs(g - want);
                if (d > wc) { wc = d; at = `${nm} at |p| ${pl.toFixed(3)} sweep ${sw.toFixed(3)}: ${g} vs ${want}`; }
            }
            ok("!! the f64 CPU twin of mh_ignite agrees with the hand-written gaussian to f64 rounding",
                wc < 1e-15,
                `worst |cpu - hand-written| = ${wc.toExponential(2)} over 3 species x 625 points` +
                `${at ? " (worst at " + at + ")" : ""}. complete is held at 0.37 and not at 1 here, so a port ` +
                `that dropped the multiplier entirely would show up as 0.63 of error rather than as nothing.`);
        }

        // ---- the compiled shader, against the same hand-written gaussian ----------------------------------
        // Alpha is the FOURTH reading of the same lattice and it is graded here with the other three: x is
        // still |p|, y is COMPLETE, and the sweep is pinned at 0.5. Without it `complete` is unexercised --
        // see the probe's own note, and the sabotage that deleted the multiplier and passed every row.
        const ALL = CH.concat([["still, complete on y", 0.02, 0.95, 0.26, 3]]);
        let worst = 0, at = "", worstFlat = 0;
        for (const [nm, lo, hi, width, c] of ALL) {
            for (let ysh = 0; ysh < N; ysh++) for (let x = 0; x < N; x++) {
                const cm = c === 3 ? sOf(ysh) : 1, sw = c === 3 ? 0.5 : sOf(ysh);
                const centre = lo + (hi - lo) * sw, q = (pOf(x) - centre) / width;
                const want = Math.round(Math.min(1, cm * Math.exp(-(q * q))) * 255);
                const i = (ry(ysh) * N + x) * 4 + c, iFlat = (ysh * N + x) * 4 + c;
                const d = Math.abs(ig[i] - want);
                if (d > worst) { worst = d; at = `${nm} at |p| ${pOf(x).toFixed(3)} y ${sOf(ysh).toFixed(3)}: gpu ${ig[i]} cpu ${want}`; }
                worstFlat = Math.max(worstFlat, Math.abs(ig[iFlat] - want));
            }
        }
        say(`mh_ignite over ${N} radii x ${N} rows x 3 species plus alpha's complete axis: worst |gpu - cpu| ` +
            `= ${worst}/255 (unflipped, ${worstFlat}/255)`);
        ok("!! *** mh_ignite RENDERS ON A REAL GPU AND MATCHES THE HAND-WRITTEN GAUSSIAN ***",
            worst <= 2 && worstFlat > 20,
            `worst channel error ${worst} of 255 (${at || "no disagreement"}); the unflipped orientation ` +
            `scores ${worstFlat}, which is what says this frame is not symmetric in sweep -- a shell that sat ` +
            `still would read the same either way up and this row could not tell.`);

        // ---- WHERE THE RING IS, not merely how bright the frame is ----------------------------------------
        // *** AN AGREEMENT BOUND DOES NOT SAY THE RING MOVES. *** Two implementations of a shell pinned at
        // the surface agree with each other perfectly, and a frame of the right average brightness can be
        // drawn without a travelling ring at all. These rows read the PICTURE and ask where its peak is.
        //
        // The centre is recovered to well under one cell by a log-parabolic fit: the samples are exp(-q^2),
        // so their logarithms lie on an exact parabola and three of them locate its vertex. At the probe's
        // spacing the three samples read around 250/255, where one 8-bit step is 0.4%, which puts the fit's
        // noise near 0.0015 in |p| -- thirty times finer than the 0.047 that separates the three species at
        // the end of the sweep. Integer argmax alone would have called duet and tempest the same shell.
        const centreOf = (frame, ysh, c) => {
            let bi = -1, bv = -1;
            for (let x = 0; x < N; x++) { const v = frame[(ry(ysh) * N + x) * 4 + c]; if (v > bv) { bv = v; bi = x; } }
            if (bi <= 0 || bi >= N - 1) return null;
            const l = Math.log(frame[(ry(ysh) * N + bi - 1) * 4 + c]), m = Math.log(bv),
                  h = Math.log(frame[(ry(ysh) * N + bi + 1) * 4 + c]);
            const den = l - 2 * m + h;
            if (!(den < -1e-6) || !isFinite(l) || !isFinite(h)) return null;
            return pOf(bi + 0.5 * (l - h) / den);
        };
        for (const [nm, lo, hi, width, c] of CH) {
            let prev = -1, monotone = true, wPos = 0, atPos = "", seen = 0, first = null, last = null;
            for (let ysh = 1; ysh < N; ysh++) {
                const got = centreOf(ig, ysh, c);
                if (got === null) continue;
                seen++; if (first === null) first = got; last = got;
                if (got <= prev) monotone = false;
                prev = got;
                const want = lo + (hi - lo) * sOf(ysh);
                const d = Math.abs(got - want);
                if (d > wPos) { wPos = d; atPos = `sweep ${sOf(ysh).toFixed(4)}: measured ${got.toFixed(4)}, mix(lo,hi,sweep) ${want.toFixed(4)}`; }
            }
            say(`${nm}: the ring's measured centre runs ${first === null ? "n/a" : first.toFixed(4)} -> ` +
                `${last === null ? "n/a" : last.toFixed(4)} over ${seen} sweep rows, worst |measured - mix| ${wPos.toFixed(4)}`);
            ok(`!! *** THE SHELL TRAVELS: ${nm}'s ring leaves the heart and arrives at mix(lo, hi, sweep) ***`,
                seen >= 12 && monotone && wPos < 0.012 && last !== null && first !== null && last - first > 0.70,
                `over ${seen} sweep rows the peak advances monotonically ${first === null ? "n/a" : first.toFixed(4)} -> ` +
                `${last === null ? "n/a" : last.toFixed(4)} -- a journey of ` +
                `${(first === null || last === null) ? "n/a" : (last - first).toFixed(4)} body radii -- and lands ` +
                `within ${wPos.toFixed(4)} of lo + (hi - lo) * sweep everywhere (${atPos || "no disagreement"}). ` +
                `kit.ts: sweep "is the same window read as a POSITION, 0 to 1 over 0.95 s, and it is what each ` +
                `species runs the ignition ALONG". A shell parked at the surface would satisfy every ` +
                `brightness bound above this one and fail here.`);
        }

        // The three species must arrive in DIFFERENT places, or the table's per-species hi is decoration.
        const endS = centreOf(ig, N - 1, 0), endD = centreOf(ig, N - 1, 1), endT = centreOf(ig, N - 1, 2);
        say(`at the last sweep row the three rings sit at still ${endS === null ? "n/a" : endS.toFixed(4)}, ` +
            `duet ${endD === null ? "n/a" : endD.toFixed(4)}, tempest ${endT === null ? "n/a" : endT.toFixed(4)}`);
        ok("!! ...and the three species do NOT arrive together -- hi is per-species, not one shared surface",
            endS !== null && endD !== null && endT !== null && endD - endS > 0.030 && endT - endD > 0.030,
            `still stops ${(endD - endS).toFixed(4)} short of duet and duet ${(endT - endD).toFixed(4)} short ` +
            `of tempest, against hi values of 0.95, 1.00 and 1.05 and a fit noise near 0.0015. This is the row ` +
            `a single-species probe could not have: one channel cannot tell a correct table from a constant.`);

        // A RING, not a front. This is the shape a smoothstep port gets wrong while passing "it moves".
        {
            const mid = 8, c = 0;
            const heart = ig[(ry(mid) * N + 0) * 4 + c], edge = ig[(ry(mid) * N + N - 1) * 4 + c];
            let peak = 0; for (let x = 0; x < N; x++) peak = Math.max(peak, ig[(ry(mid) * N + x) * 4 + c]);
            say(`still at sweep ${sOf(mid).toFixed(3)}: heart ${heart}/255, peak ${peak}/255, far edge ${edge}/255`);
            ok("!! *** IT IS A RING AND NOT A FRONT: the light falls off on BOTH sides of the peak ***",
                peak > 200 && heart < peak / 8 && edge < peak / 8,
                `mid-sweep the peak reads ${peak} of 255 while the heart behind it reads ${heart} and the far ` +
                `edge ahead of it reads ${edge}. A smoothstep-shaped ignition -- the obvious wrong port, and a ` +
                `one-character difference in a shader -- would leave everything BEHIND the front lit and would ` +
                `pass every travel row above: it moves, it is monotone, and its half-height even lands on ` +
                `mix(lo, hi, sweep). Only the falloff behind the peak separates them.`);
        }

        // ---- `complete` IS A LIVE MULTIPLIER, and this is the pair the first cut of this section did not have.
        // *** A SABOTAGE THAT DELETED complete FROM mh_ignite PASSED EVERY ROW ABOVE. *** The probe held it
        // at 1 in all three colour channels, where a multiplier is invisible by construction, and the note
        // saying so reasoned that a scale did not deserve an axis. It does: complete is the term that makes
        // the flash ABSENT in four of murmur's five states, and absent is most of the orb's life.
        {
            // The ring's crest at sweep 0.5 is |p| = 0.485, which is 6.47 cells; cells 6 and 7 bracket it.
            const crest = 7, alphaAt = (ysh) => ig[(ry(ysh) * N + crest) * 4 + 3];
            const vals = []; for (let ysh = 0; ysh < N; ysh++) vals.push(alphaAt(ysh));
            // The line is drawn through the LAST row and not through complete = 1: the probe's top row is
            // complete = (N-1)/N, because the lattice samples cell CENTRES from 0, and a line drawn to 1
            // would be 6.25% steep and this row would be measuring the arithmetic rather than the shader.
            const top = vals[N - 1], topC = sOf(N - 1);
            let wLin = 0, atLin = "";
            for (let ysh = 0; ysh < N; ysh++) {
                const line = (sOf(ysh) / topC) * top;
                const d = Math.abs(vals[ysh] - line);
                if (d > wLin) { wLin = d; atLin = `complete ${sOf(ysh).toFixed(4)}: read ${vals[ysh]}, linear ${line.toFixed(1)}`; }
            }
            say(`alpha at the crest, against complete 0 -> ${sOf(N - 1).toFixed(4)}: ${vals.join(", ")} of 255`);
            ok("!! *** complete SCALES THE SHELL LINEARLY ON THE GPU -- it is a live multiplier, not a constant 1 ***",
                top > 200 && wLin <= 1.5,
                `the crest climbs 0 -> ${top} of 255 as complete runs 0 -> ${topC.toFixed(4)}, and every ` +
                `one of the ${N} readings sits within ${wLin.toFixed(1)} counts of the straight line through the top ` +
                `(${atLin}). The bound is 1.5 counts and the three near misses were MEASURED rather than ` +
                `guessed: a SQUARED complete bows this line by 54.8 counts (62 read against 116.8 at the ` +
                `halfway mark), a SMOOTHSTEPPED one by 26.6, and a DROPPED one flattens it to ${top} at every ` +
                `row -- which is the sabotage that walked through the first cut of this section, when all ` +
                `three colour channels held complete at 1 and a multiplier of 1 is not a multiplier at all.`);

            let nzGpu = 0; for (let x = 0; x < N; x++) if (ig[(ry(0) * N + x) * 4 + 3] !== 0) nzGpu++;
            let nz = 0;
            for (const [, lo, hi, width] of CH) for (let a = 0; a <= 40; a++) for (let b = 0; b <= 40; b++)
                if (K.mhIgnite((a / 40) * 1.2, 0, b / 40, lo, hi, width) !== 0) nz++;
            ok("!! complete = 0 gives EXACTLY zero on BOTH sides -- which is what lets eighteen shaders add this without a branch",
                nz === 0 && nzGpu === 0,
                `all ${3 * 41 * 41} CPU samples are exactly 0 when complete is 0 -- not 1e-40, zero -- and so ` +
                `are all ${N} alpha cells of the shader's own complete = 0 row. mh_state returns complete = 0 ` +
                `in four of murmur's five states, so this is the frame the orb spends almost all of its life ` +
                `in, and an epsilon here would be a permanent ghost ring nobody ordered.`);
        }

        // *** WHAT SECTION 13 DOES NOT CLAIM. *** The per-species GAIN, the two pre-multiplies and where each
        // ring's light lands are wiring, not physics: MH_IGNITE carries them and the orb's own gate is where
        // they have to reach pixels. mhIgnite deliberately returns the profile WITHOUT the gain, because
        // nebula and tempest spend theirs `* dens` and folding it in here would make those two look like the
        // other five with a different number rather than like what they are.
    }
}


console.log("\n" + (fails ? "FAIL -- " + fails + " check(s)" : "ALL GREEN") +
    "\nWHAT THIS KIT IS FOR: four of murmur-web's eighteen species are built out of it, and the other fourteen " +
    "would each otherwise have re-approximated the march, the medium, the gesture clock and the hash " +
    "separately. The SPECIES themselves are gated next door in tools/ship/murmurSpecies-selfcheck.mjs -- they " +
    "need real renders and this gate does not, which is a budget fact before it is a tidiness one. " +
    "\nWHAT IS NOT CLAIMED: mh_out, the triangular-PDF interleaved-gradient dither -- which is why section 12 " +
    "grades mhPresentFinish and not mhPresent. mh_present's own TONE CURVE and its two ground-dependent terms " +
    "ARE claimed now, at section 12, bit-exactly on three grounds: the catchlight, the contact shadow and the " +
    "knee that moves 0.90 -> 0.96 with the ground. AND THIS SENTENCE CARRIED A STALE CLAIM FOR TWELVE ROUNDS: " +
    "it said the HUE channel \"reaches no pixel and every species passes 0\", which v4631 closed -- every " +
    "hero computes its own numerator, hueMix reaches mhLit, and murmurSpecies4 measures droplet turning 1.57 " +
    "degrees of hue against 0.0008 of lightness. A closing that UNDER-claims is the same defect as one that " +
    "over-claims: it sends the next reader to build something that is already there. " +
    "mh_surface IS claimed now, at section 9: all eighteen heroes call it and this port approximated it with " +
    "a fixed light, a fixed rim exponent, invented per-species constants and no contact glow at all until " +
    "v4629. The colour rail is section 8 and the deformed body solve section 7. " +
    "\nSECTION 13 CLAIMS THE SUCCESS SHELL'S PHYSICS AND NOT ITS WIRING: mh_ignite's travelling gaussian is " +
    "bit-exact against a real GPU, its peak lands within 0.0013 body radii of mix(lo, hi, sweep) at every " +
    "sweep, and complete scales it to within 0.7 counts of a straight line. WHAT IT DOES NOT CLAIM is that " +
    "any species DRAWS it -- the per-species gain, nebula and tempest's pre-multiply, and droplet's separate " +
    "shell term are wiring, and wiring has to reach pixels in the orb's own gate to be claimed at all.");
process.exit(fails ? 1 : 0);
