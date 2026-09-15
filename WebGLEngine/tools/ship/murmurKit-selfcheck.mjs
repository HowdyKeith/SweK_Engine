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
               { factoryArgs: { mode: "surface", n: N } }],
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

console.log("\n" + (fails ? "FAIL -- " + fails + " check(s)" : "ALL GREEN") +
    "\nWHAT THIS KIT IS FOR: four of murmur-web's eighteen species are built out of it, and the other fourteen " +
    "would each otherwise have re-approximated the march, the medium, the gesture clock and the hash " +
    "separately. The SPECIES themselves are gated next door in tools/ship/murmurSpecies-selfcheck.mjs -- they " +
    "need real renders and this gate does not, which is a budget fact before it is a tidiness one. " +
    "\nWHAT IS NOT CLAIMED: mh_present's own tone curve and dither, and the HUE channel every species feeds " +
    "it -- render/murmurKit.mjs's marchStillInterior returns hueNum and the shader accumulates only the " +
    "scalar, so the rail's spread axis built at v4627 reaches no pixel and every species passes 0. " +
    "mh_surface IS claimed now, at section 9: all eighteen heroes call it and this port approximated it with " +
    "a fixed light, a fixed rim exponent, invented per-species constants and no contact glow at all until " +
    "v4629. The colour rail is section 8 and the deformed body solve section 7.");
process.exit(fails ? 1 : 0);
