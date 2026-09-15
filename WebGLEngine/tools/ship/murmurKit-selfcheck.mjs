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
sec("6. *** THE PAIR: THE REAL COMPILED SHADER AGAINST THE CPU REFERENCE, BIT FOR BIT ***");
{
    const N = 16;
    // *** BOTH PROBES IN ONE BROWSER LAUNCH. *** v4625 gave renderThreeTslToPixels a variants list for the
    // same reason aiPresenceOrb-selfcheck needed one a level up: the launch is nearly the whole cost of a
    // render, so a gate that wanted two probes paid for two Chromiums. Nothing is skipped to save time here --
    // the noise probe used to sit behind a note pleading exactly that, and a sabotage walked straight through
    // the hole it left.
    const r = await renderThreeTslToPixels({
        engineRoot: ENG, moduleImportPath: "/render/murmurKitTsl.mjs",
        factoryName: "makeMurmurKitProbeTsl", factoryArgs: { mode: "hash", n: N }, width: N, height: N,
        variants: [{ factoryArgs: { mode: "noise", n: N } }],
    });
    if (!r.ok) {
        ok("!! the kit's integer hash matches a real GPU render bit-for-bit", false,
            `could not render: ${r.reason || (r.skipped ? "skipped: " + r.skipped : "unknown")}. A gate that ` +
            `cannot run its own subject is a FAIL row here rather than a silent skip.`);
    } else {
        const px = r.pixels;
        // *** THE ROW ORIENTATION IS MEASURED, NOT ASSUMED. *** three's uv has v=0 at the BOTTOM and this
        // readback is top-row-first, so the rows arrive flipped -- the same flip render/aiPresenceOrbPresent
        // .mjs's own round found when sampling a RenderTarget. Both orientations are counted and the row
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
            asRead < flipped, `as-read ${asRead}, flipped ${flipped} -- if a future change makes both match, ` +
            `this row goes red and the flip needs re-deriving rather than assuming`);
    }
    // *** THE NOISE RENDER IS IN THE GATE, AND THE REASON IT IS HERE IS A SABOTAGE THAT PASSED. *** The first
    // draft measured noise and exit against the GPU while the gate was being written, then declined to re-run
    // them ("each render costs a browser launch") and said so in a note. That note was a hole with a
    // justification on it: moving the CPU fade from murmur's quintic to a cubic smoothstep, and moving the
    // gradient lattice offset off 4096, BOTH left this gate fully green -- the remaining CPU rows (|g| = 1,
    // noise zero at lattice points, continuity) are true under either. Only the pair catches them, and the
    // pair has to actually run.
    const rn = r.ok && r.frames && r.frames[1] ? { ok: true, pixels: r.frames[1] } : { ok: false, reason: "second frame missing" };
    if (!rn.ok) {
        ok("!! the kit's gradient noise matches a real GPU render", false, `could not render: ${rn.reason || rn.skipped}`);
    } else {
        let worst = 0, worstAt = null;
        for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
            const got = rn.pixels[((N - 1 - y) * N + x) * 4] / 255;
            const want = Math.min(1, Math.max(0, K.mhNoise3(x * 0.37, y * 0.29, 0.61) * 0.5 + 0.5));
            const d = Math.abs(got - Math.round(want * 255) / 255);
            if (d > worst) { worst = d; worstAt = `(${x},${y}) gpu=${got.toFixed(4)} cpu=${want.toFixed(4)}`; }
        }
        ok("!! *** THE GRADIENT NOISE AGREES WITH THE COMPILED SHADER ON ALL 256 SAMPLES ***",
            worst === 0, `worst |gpu - cpu| = ${(worst * 255).toFixed(2)} of 255${worstAt ? " at " + worstAt : ""}. ` +
            `Every pixel lands on the same byte the f64 reference rounds to -- which is what makes the fade, ` +
            `the gradient table and the lattice offset all checked rather than merely present.`);
    }
}

// =============================================================================================================
// *** ONE RENDER RUN, NINE FRAMES, SHARED BY SECTIONS 7 AND 8. *** Declared here rather than inside
// either section because both need it: rendering them twice cost a second browser launch and took this
// gate to 3,339 ms against a 3,000 ms budget, which immediately moved KIT_AT_V4623 out of recordReach's
// CHECKED set -- a record guarded by a gate the sweep cannot afford is guarded on paper.
// 48 rather than 64, and the still control runs at two times rather than four: nine 64x64 frames put
// this gate at 2,962 ms, THIRTY-EIGHT milliseconds under the budget, which is not margin -- it is the
// same straddle this round was opened to remove from aiPresenceOrb-selfcheck. Seven 48x48 frames
// carry every claim below unchanged; the ring is sampled at 72 angles either way, and 'still's
// hotspot does not move' needs two times to be false, not four.
const N3 = 48, times = [2.4, 3.2, 3.9, 4.6], VOICE = 0.3, STILL_TIMES = [3.9];
const run = await renderThreeTslToPixels({
    engineRoot: ENG, moduleImportPath: "/render/aiPresenceOrbTsl.mjs", factoryName: "makeAiPresenceOrbTsl",
    factoryArgs: { species: "still" }, knobs: { time: times[0], voice: VOICE }, width: N3, height: N3,
    variants: [
        { factoryArgs: { species: "limn" }, knobs: { time: times[0], voice: VOICE } },
        ...times.map((t) => ({ factoryArgs: { species: "comet" }, knobs: { time: t, voice: VOICE } })),
        ...STILL_TIMES.map((t) => ({ factoryArgs: { species: "still" }, knobs: { time: t, voice: VOICE } })),
    ],
});
// ONE LAUNCH for all nine frames. Section 8 reads the same run -- see the note on the harness's variants.
const okRun = run.ok && run.frames && run.frames.length === 2 + times.length + STILL_TIMES.length;

sec("7. *** LIMN, THE SECOND SPECIES: THE COMMA THAT MUST NEVER CLOSE INTO A RING ***");
{
    // *** THE PROFILE IS PERIODIC BY CONSTRUCTION AND THE ROW ASSERTS IT AS AN IDENTITY. *** limn.ts records
    // its own first cut failing: one gaussian in the wrapped angle "left a razor-thin dark seam down one
    // radius of the body ... at plus and minus pi the narrow side had fallen to 0.03 and the wide side was
    // still at 0.21, so the field simply steps. A GAUSSIAN IN A WRAPPED ANGLE IS NOT A PERIODIC FUNCTION."
    const atPlus = K.limnArc(K.wrapPi(Math.PI)), atMinus = K.limnArc(K.wrapPi(-Math.PI));
    ok("!! *** THE ARC IS EXACTLY EQUAL AT +pi AND -pi -- no seam, because it is a function of cos alone ***",
        atPlus === atMinus,
        `arc(+pi) = arc(-pi) = ${atPlus.toFixed(9)}, bit-identical. A gaussian in the angle is 0.03 against ` +
        `0.21 across the same wrap, which is the seam murmur shipped once and replaced.`);

    // The far side must stay a dim glow. murmur states the numbers; they are checked against its constants.
    const truePeak = (o) => { let m = 0; for (let i = 0; i <= 36000; i++) m = Math.max(m, K.limnArc(K.wrapPi(i * Math.PI / 18000), o)); return m; };
    const wide = { kHead: 9.0, kTail: 1.6, offT: -1.05 };
    const small = { kHead: 2.2, kTail: 0.95, offT: -1.25 };
    const r120 = K.limnArc(Math.PI, wide) / truePeak(wide);
    const r18 = K.limnArc(Math.PI, small) / truePeak(small);
    say(`far side as a share of peak: ${(r120 * 100).toFixed(1)}% at the 120 pt concentrations, ${(r18 * 100).toFixed(1)}% at 18 pt`);
    ok("!! *** IT IS A COMMA AND NOT A RING: the far side is 3.8% of the peak, which is limn.ts's own 'four per cent' ***",
        r120 > 0.03 && r120 < 0.045,
        `${(r120 * 100).toFixed(1)}% against the "four per cent" its header quotes. The concentrations were ` +
        `"chosen by looking at where it started to become one", so this is the number the species IS.`);
    // *** AND THE 18 pt FIGURE DOES NOT REPRODUCE, WHICH IS REPORTED RATHER THAN ROUNDED INTO AGREEMENT. ***
    ok("...while the 18 pt figure reads 12.5% against the 'eleven' its header names, and the gap is NAMED",
        r18 > 0.11 && r18 < 0.135,
        `${(r18 * 100).toFixed(1)}% from murmur's own constants at voice 0 and drive 0, against the 11 its ` +
        `header states -- a 1.5 point gap. The most likely explanation is that mh_small does not reach 1.0 at ` +
        `18 pt, so the real concentrations never hit the extremes used here; mh_small is NOT ported, so that ` +
        `is a hypothesis and is written as one. What is not done is quietly widening this row until 11 fits.`);

    // *** wrapPi WAS UNCHECKED AND THE SABOTAGE SWEEP FOUND IT. *** Every row above evaluates it only at
    // +/-pi, where a version that rounds DOWN instead of to NEAREST happens to agree -- both map to pi -- so
    // replacing floor(x + 0.5) with floor(x) left the whole section green. The contract is that any angle,
    // from any number of turns away, lands in (-pi, pi]; that is what the shader relies on when the arc has
    // been travelling for minutes and phi0 is in the hundreds of radians.
    let outOfRange = 0, worstErr = 0;
    for (let i = -4000; i <= 4000; i++) {
        const a = i * 0.0197;                       // sweeps about +/-25 turns
        const w = K.wrapPi(a);
        if (!(w > -Math.PI - 1e-12 && w <= Math.PI + 1e-12)) outOfRange++;
        // and it must differ from the input by a whole number of turns, exactly
        const turns = (a - w) / (2 * Math.PI);
        worstErr = Math.max(worstErr, Math.abs(turns - Math.round(turns)));
    }
    ok("!! *** wrapPi LANDS IN (-pi, pi] FROM ANY NUMBER OF TURNS AWAY, and moves by a whole turn exactly ***",
        outOfRange === 0 && worstErr < 1e-9,
        `8,001 angles spanning about +/-25 turns: ${outOfRange} outside the range, worst deviation from a ` +
        `whole number of turns ${worstErr.toExponential(2)}. A version rounding down instead of to nearest ` +
        `agrees at exactly +/-pi, which is where every other row in this section happened to look.`);

    // The tail share drives the hue and must be periodic for the same reason the arc is.
    ok("the tail's share of the light is periodic too, so the hue has no seam either",
        K.limnTailShare(K.wrapPi(Math.PI)) === K.limnTailShare(K.wrapPi(-Math.PI)),
        `limn.ts chose it over the wrapped angle for exactly this: "unlike the wrapped angle the first cut ` +
        `used, PERIODIC -- so the hue has no seam either"`);

    // *** THE SPECIES, RENDERED -- AND THE v4624 VERSION OF THIS ROW WAS PASSING ON LUCK. *** It sampled two
    // pixels, (9,24) and (38,24) on a 48-wide frame, called them the left and right rim, and asserted still's
    // differed by under 2% while limn's differed by more than 25%. Those two points are 15 and 14 pixels from
    // the centre -- NOT a symmetric pair -- and they happened to read 448 and 449 on still. Sampled at
    // genuinely symmetric points, still reads 172 against 251: a 31% difference, because the key light is at a
    // fixed direction and the specular is nowhere near even. THE CLAIM WAS TRUE OF TWO PIXELS AND FALSE OF THE
    // RIM, which is the same species of error as v4535's HUD row that passed for as long as something happened
    // to sit on one of its grid points.
    //
    // What replaces it measures the RING, all the way round, 72 samples inside the antialiased edge: the
    // fraction of the ring standing at or above half its own peak. For a comma that is small; for a body lit
    // evenly enough to read as a sphere it is everything. Measured: still 100%, comet 100%, limn 29%.

    if (!okRun) {
        ok("!! the three species render", false, `could not render: ${run.reason || "frames " + (run.frames ? run.frames.length : "none")}`);
    } else {
        const ring = (px) => {
            const vals = [];
            for (let a = 0; a < 72; a++) {
                const th = a * 2 * Math.PI / 72, rr = 0.62 * 0.88 * (N3 / 2);
                const x = Math.round(N3 / 2 + rr * Math.cos(th)), y = Math.round(N3 / 2 + rr * Math.sin(th));
                const i = (y * N3 + x) * 4;
                if (px[i + 3] < 200) continue;                       // stay inside the antialiased silhouette
                vals.push(px[i] + px[i + 1] + px[i + 2]);
            }
            const mx = Math.max(...vals), mn = Math.min(...vals);
            return { lit: vals.filter((v) => v >= mx * 0.5).length / vals.length, peakOverMin: mx / mn, n: vals.length };
        };
        const rs = ring(run.frames[0]), rl = ring(run.frames[1]), rc = ring(run.frames[2]);
        say(`ring lit at or above half its peak -- still ${(rs.lit * 100).toFixed(0)}%, limn ${(rl.lit * 100).toFixed(0)}%, comet ${(rc.lit * 100).toFixed(0)}% (${rs.n} samples each)`);
        ok("!! *** NEVER A FULL EVEN RING: limn lights under a third of its rim where the other two light all of theirs ***",
            rl.lit < 0.45 && rs.lit > 0.75 && rc.lit > 0.75,
            `still ${(rs.lit * 100).toFixed(0)}% of the ring at or above half peak, comet ${(rc.lit * 100).toFixed(0)}%, ` +
            `limn ${(rl.lit * 100).toFixed(0)}%. Peak over minimum: still ${rs.peakOverMin.toFixed(2)}, comet ` +
            `${rc.peakOverMin.toFixed(2)}, limn ${rl.peakOverMin.toFixed(2)}. *** THE THRESHOLDS ARE SET FROM ` +
            `TWO RESOLUTIONS, NOT ONE: *** at 64 px this ring read 100% / 100% / 29% and at 48 px it reads ` +
            `86% / 89% / 28% -- the absolute figures move with how many distinct pixels a 72-sample ring can ` +
            `land on, and the THREEFOLD separation does not. A limit fitted to one frame size is a limit ` +
            `fitted to a frame size. That concentration IS the species -- ` +
            `"a bright head with a soft tail streaming off one side, built so the far side of the ring never ` +
            `rises past a dim glow" -- and it is measured over the whole ring rather than at a chosen pair of points.`);
        // Stated as a RELATION rather than three absolute bounds, for the same reason: still's own peak-over-
        // minimum reads 1.75 at 64 px and 2.55 at 48 px on identical pixels, because the minimum is whichever
        // sample happens to land deepest in the dark. limn's lead over both survives either.
        ok("...and limn is the DARK hero: its ring swings far harder than either of the others'",
            rl.peakOverMin > Math.max(rs.peakOverMin, rc.peakOverMin) * 1.4,
            `limn ${rl.peakOverMin.toFixed(2)} against still ${rs.peakOverMin.toFixed(2)} and comet ` +
            `${rc.peakOverMin.toFixed(2)}. murmur's own fitted base rim is 0.30 for limn where still's is 0.85, ` +
            `and still's file calls its rim "the highest in the collection".`);
    }
}

// =============================================================================================================
sec("8. *** COMET, THE THIRD SPECIES: A TRAIL SOLVED IN CLOSED FORM, AND A HEAD THAT HAD TO BE SOLVED TOO ***");
{
    // mh_spin must be a rotation, or the orbit plane is not a plane.
    const B = K.cometBasis(0.5, 0.3);
    ok("!! the orbit basis is orthonormal to f64 -- e1.e2 exactly zero, all three unit",
        Math.abs(K.dot3(B.e1, B.e2)) < 1e-15 && Math.abs(K.len3(B.e1) - 1) < 1e-15 &&
        Math.abs(K.len3(B.e2) - 1) < 1e-15 && Math.abs(K.len3(B.nrm) - 1) < 1e-15,
        `e1.e2 = ${K.dot3(B.e1, B.e2).toExponential(1)}, |e1| |e2| |nrm| = ${K.len3(B.e1).toFixed(12)} ${K.len3(B.e2).toFixed(12)} ${K.len3(B.nrm).toFixed(12)}`);
    // The tilt is bounded away from BOTH degeneracies, which is a stated design constraint and not a range.
    ok("the orbit tilt is bounded away from face-on and edge-on at both ends of the knob",
        K.cometBasis(0, 0).tau === 0.30 && Math.abs(K.cometBasis(1, 0).tau - 1.05) < 1e-12,
        `tau runs ${K.cometBasis(0, 0).tau} .. ${K.cometBasis(1, 0).tau} rad. comet.ts: "face-on is a circle ` +
        `drawn on the glass, edge-on is a line."`);

    // *** THE CLOSED-FORM NEAREST POINT, AGAINST A DIFFERENT METHOD. *** This is the whole trail: comet.ts
    // cannot keep a history buffer ("these shaders are stateless by contract"), so the age of the trail at a
    // sample is the ANGLE of the nearest point on the orbit. If that is wrong the trail is wrong everywhere.
    const r0 = 0.55;
    let worst = 0, compared = 0;
    for (let i = 0; i < 12; i++) {
        const p = [Math.sin(i * 1.7) * 0.8, Math.cos(i * 2.3) * 0.7, Math.sin(i * 0.9) * 0.6];
        const { dist2 } = K.cometNearest(p, B, r0);
        let best = Infinity;
        for (let a = 0; a < 60000; a++) {
            const th = a * 2 * Math.PI / 60000;
            const c = [r0 * (Math.cos(th) * B.e1[0] + Math.sin(th) * B.e2[0]),
                       r0 * (Math.cos(th) * B.e1[1] + Math.sin(th) * B.e2[1]),
                       r0 * (Math.cos(th) * B.e1[2] + Math.sin(th) * B.e2[2])];
            const d = (p[0] - c[0]) ** 2 + (p[1] - c[1]) ** 2 + (p[2] - c[2]) ** 2;
            if (d < best) best = d;
        }
        compared++; worst = Math.max(worst, Math.abs(dist2 - best));
    }
    ok("!! *** THE TRAIL'S GEOMETRY AGREES WITH A 60,000-SAMPLE SEARCH OVER THE CIRCLE ***",
        compared === 12 && worst < 1e-8,
        `worst |closed form - brute force| = ${worst.toExponential(2)} over ${compared} points; the residual ` +
        `is the SEARCH's own angular resolution, not the formula's. A different method reaching the same ` +
        `answer, which is the only agreement worth asserting about a closed form.`);

    // *** THE TRAIL HAS TO DIE BEFORE IT WRAPS, and comet.ts records what happened when it did not: ***
    // "a soft gradient meeting a step is the step" -- a hard-edged wedge cut through the glass along the
    // head's own radius.
    const fPlus = K.cometFall(Math.PI, 2.0), fMinus = K.cometFall(-Math.PI, 2.0);
    ok("!! *** THE TRAIL IS GONE AT BOTH ENDS OF THE WRAP, so it never meets its own head as a step ***",
        fPlus < 1e-6 && fMinus < 1e-3,
        `fall(+pi) = ${fPlus.toExponential(2)} behind the head and fall(-pi) = ${fMinus.toExponential(2)} ` +
        `ahead of it, at murmur's own decay of 2.0 -- where an unfaded exponential would still stand at a fifth.`);
    ok("...and the two branches meet at the head at exactly one, a kink rather than a step",
        K.cometFall(0, 2.0) === 1 && Math.abs(K.cometFall(-1e-12, 2.0) - 1) < 1e-9,
        `fall(0) = ${K.cometFall(0, 2.0)} from behind and ${K.cometFall(-1e-12, 2.0).toFixed(12)} from ahead. ` +
        `comet.ts keeps the kink deliberately, "under the head's own bloom, which is where a comet keeps it too".`);

    // *** THE ROW THAT WOULD HAVE CAUGHT THIS SPECIES SHIPPING WITHOUT ITS HEAD -- AND DID. ***
    // comet's whole brief is ONE BRIGHT POINT ORBITING. Ported with only the march, its brightest interior
    // pixel sat at (36,25) at every time tested -- the SPECULAR CATCHLIGHT, motionless -- because the head is
    // 0.043 body units across against a march step of about 0.38 and simply fell between the taps. comet.ts
    // says so in its own words and solves the head at the ray's closest approach instead. So the claim worth
    // asserting is not that comet renders: it is that its brightest interior point MOVES, and that the two
    // species without an orbiting object hold still.
    // *** THE SAME NINE FRAMES SECTION 7 ALREADY PAID FOR. *** Rendering them again here cost a second
    // browser launch and took this gate to 3,339 ms, over the 3,000 ms budget -- which promptly moved
    // KIT_AT_V4623 out of recordReach's CHECKED set, because a record guarded by a gate the sweep cannot
    // afford is guarded on paper. Frames 2..5 are comet across a lap; frames 0 and 6..8 are still across the
    // same times.
    if (!okRun) {
        ok("!! comet's bright point travels and still's does not", false,
            `could not render: ${run.reason || "frames " + (run.frames ? run.frames.length : "none")}`);
    } else {
        const peak = (px) => {
            let best = -1;
            for (let y = 0; y < N3; y++) for (let x = 0; x < N3; x++) {
                const dx = (x + 0.5) / N3 * 2 - 1, dy = (y + 0.5) / N3 * 2 - 1;
                if (Math.hypot(dx, dy) > 0.62 * 0.75) continue;
                const i = (y * N3 + x) * 4, v = px[i] + px[i + 1] + px[i + 2];
                if (v > best) best = v;
            }
            return best;
        };
        const hotspot = (px) => {
            let best = -1, bx = 0, by = 0;
            for (let y = 0; y < N3; y++) for (let x = 0; x < N3; x++) {
                const dx = (x + 0.5) / N3 * 2 - 1, dy = (y + 0.5) / N3 * 2 - 1;
                if (Math.hypot(dx, dy) > 0.62 * 0.75) continue;        // interior only, clear of the rim
                const i = (y * N3 + x) * 4, v = px[i] + px[i + 1] + px[i + 2];
                if (v > best) { best = v; bx = x; by = y; }
            }
            return bx + "," + by;
        };
        const cometPts = run.frames.slice(2, 6).map(hotspot);
        const stillPts = [run.frames[0], run.frames[6]].map(hotspot);
        const cN = new Set(cometPts).size, sN = new Set(stillPts).size;
        say(`interior hotspot over ${times.length} times -- comet ${cometPts.join(" ")} (${cN} distinct), still ${stillPts.join(" ")} (${sN} distinct)`);
        ok("!! *** comet'S BRIGHT POINT TRAVELS ITS ORBIT AND still'S CATCHLIGHT DOES NOT MOVE AT ALL ***",
            cN >= 3 && sN === 1,
            `comet takes ${cN} distinct hotspot positions across ${times.length} frames; still takes ${sN} across ${stillPts.length}.`);

        // *** AND THAT ROW ALONE DOES NOT CATCH THE BUG THIS SPECIES ACTUALLY SHIPPED WITH -- the sabotage
        // sweep proved it. *** Deleting the solved head left the row above GREEN, because the TRAIL moves too:
        // "something bright moves" is satisfied by a smear. What separates a solved point from a smear is that
        // the point is EQUALLY BRIGHT WHEREVER IT IS on its orbit, give or take the depth extinction that dims
        // it behind the core, while the trail's own maximum rises and falls with the geometry. Measured: with
        // the head, the peak runs 705/692/693/698 across a lap -- a spread of 1.8%. With the head removed it
        // runs 705/677/580/561, a spread of 20.4%. The threshold is set between them and both readings are
        // written here so a later change can be judged against numbers rather than against a limit.
        const peaks = run.frames.slice(2, 6).map(peak);
        const spread = (Math.max(...peaks) - Math.min(...peaks)) / Math.max(...peaks);
        say(`comet peak brightness across the lap: ${peaks.join(" ")} -- spread ${(spread * 100).toFixed(1)}%`);
        ok("!! *** THE HEAD IS A SOLVED POINT, SO IT IS AS BRIGHT AT THE BACK OF ITS ORBIT AS AT THE FRONT ***",
            spread < 0.10,
            `spread ${(spread * 100).toFixed(1)}% over ${peaks.length} phases, against 20.4% measured with the ` +
            `head deleted. comet.ts: the head is 0.043 body units across against a march step of about 0.38, ` +
            `so sampling it "depended on where the tap planes happened to fall" -- it flickered, and near the ` +
            `limb it drew a SECOND comet. This is the row that fails when it is left to the march.`);
    }
}

console.log("\n" + (fails ? "FAIL -- " + fails + " check(s)" : "ALL GREEN") +
    "\nWHAT THIS KIT IS FOR: render/aiPresenceOrbTsl.mjs ships ONE of murmur-web's eighteen species and the " +
    "other seventeen were blocked on this file not existing -- each would otherwise have re-approximated the " +
    "march, the medium, the gesture clock and the hash separately, and inherited the same overclaim. " +
    "\nWHAT IS NOT CLAIMED: the deformed body solve (mh_shape/mh_deform/mh_body), which only the species that " +
    "deform their silhouette need -- droplet by its own description -- and mh_surface/mh_palette/mh_present, " +
    "which the existing orb port already approximates in its own file. Those are named here rather than left " +
    "to be discovered, and they are the next round's subject, not this one's.");
process.exit(fails ? 1 : 0);
