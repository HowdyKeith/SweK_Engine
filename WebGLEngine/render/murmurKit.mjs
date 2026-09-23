// WebGLEngine/render/murmurKit.mjs
//
// THE SHARED KIT the eighteen murmur-web species are all built out of -- the CPU half, playing exactly the
// role render/aiPresenceOrbState.mjs plays for render/aiPresenceOrbTsl.mjs and render/swiftShaderModel.mjs
// plays for render/swiftShaderPass.js: a reference the shader is graded against, and the one place each
// porting decision is argued rather than re-derived per species.
//
// *** WHY THIS FILE EXISTS AT ALL, MEASURED BEFORE IT WAS WRITTEN. *** tools/ship/nextRounds.mjs's
// ai-presence-orb-widget entry says the first round ported "the shared foundation ('the kit') plus exactly ONE
// species". The state machine half of that is true and faithful. The KIT half was not: grepped across both
// halves of the existing port, `mh_exit`, `mh_flourish`, `mh_medium`, `mh_scatter`, `mh_transmit`, the
// MH_TAPS march, MH_EXT and MH_SPREAD appear NOWHERE -- zero occurrences, not "simplified". What shipped was
// an analytic sphere with a fresnel rim, two speculars, a constant interior floor and a glint that is a
// gaussian in TIME ONLY. murmur's own still.ts puts its glint on a THREE-DIMENSIONAL PATH through the volume
// and solves it at the ray's closest approach, calling that out as the thing that matters most in the file
// ("it is the only event in the frame"). A gaussian in t has the same value over the entire orb at a given
// instant; there is no path, and no closest approach, because there was no volume to have one in.
//
// *** AND THE TWO GAPS WERE ONE GAP. *** The existing shader computes a Snell-refracted ray with a
// total-internal-reflection guard -- correct code, matching murmur's mh_refract line for line -- and then
// never uses the variable again. The first round's gate proved that guard "analytically unreachable at
// MH_ETA", which is a true statement about a value that reaches no pixel. In murmur's kit that vector is
// mh_look's return: it is the DIRECTION THE INTERIOR IS MARCHED ALONG. It had nowhere to go here because the
// march did not exist. So the repair is to build the volume, not to delete the line -- and the same round
// that gives the ray somewhere to go is what makes the TIR proof about something.
//
// ---- PROVENANCE ----------------------------------------------------------------------------------------
//
// krispuckett/murmur-web's OWN src/shaders/kit.ts was fetched and read directly for every number below, in
// the same discipline the first round used. Nothing here is recalled, and the one place that distinction
// bites is recorded in full at HASH_SHIFT_V4623 rather than left as a footnote: murmur's avalanche is
// murmur3's fmix32 constants with a DIFFERENT FIRST SHIFT, and the cost of writing the canonical function
// from memory is MEASURED rather than guessed: over the 64,000 lattice cells 0..39 cubed, the two disagree on
// 63,999 of them. (The first draft of this very sentence said "4 of every 5", written from intuition and not
// from a run -- corrected here rather than quietly, because a number nobody measured is the thing this file's
// whole provenance discipline exists to refuse.)
//
// This is a hand-port of a design whose real numbers were checked, not vendored code. No file is copied.
"use strict";

// *** THE OKLab PAIR IS IMPORTED, NOT COPIED, AND THE DIRECTION IS DELIBERATE. *** render/aiPresenceOrbState
// .mjs already carries Bjoern Ottosson's forward and inverse matrices, cross-checked against a real fetched
// implementation (color-js/color.js) before it shipped and round-trip tested by its own gate. A second copy
// here would be two sets of the same sixteen constants free to drift apart silently, which is the failure
// this tree spends most of its gates on. That module is pure -- it imports nothing -- so there is no cycle,
// and the gate asserts the two files agree by IDENTITY rather than by coincidence.
import { srgbToLinear, linearToSrgb, linearToOklab, oklabToLinear } from "./aiPresenceOrbState.mjs";
export { srgbToLinear, linearToSrgb, linearToOklab, oklabToLinear };

// ---------------------------------------------------------------------------------------------------------
// CONSTANTS. Every one of these is murmur's own, quoted from kit.ts with its own stated reason, because a
// magic number whose justification lives in another repository is a magic number.
// ---------------------------------------------------------------------------------------------------------

/** Body radius in uv. kit.ts: "Not a dial: the silhouette is this family's identity." */
export const MH_R = 0.300;

/** Refractive index. kit.ts: 1.20 rather than a physical ~1.45, so the limb does not swallow the interior. */
export const MH_ETA = 1.0 / 1.20;

/** Extinction. kit.ts: "Over a two-unit chord a third of the light survives" -- exp(-0.55*2) = 0.333. */
export const MH_EXT = 0.55;

/** Interior lean per unit of tilt. kit.ts: "a spirit level under glass, not a marble in a bowl." */
export const MH_TILT = 0.13;

/** Scatter width, kit.ts's own 1/3.2^2 -- the same gaussian 3.2x wider for the cost of one exp. */
export const MH_SCATTER_K = 0.098;

/** Hue spread through depth. */
export const MH_SPREAD = 0.50;

/** Interior ray length cap. kit.ts: "so a grazing pixel cannot send the loop off into space." */
export const MH_EXIT_CAP = 2.2;

// ---------------------------------------------------------------------------------------------------------
// THE INTEGER AVALANCHE.
// ---------------------------------------------------------------------------------------------------------

/**
 * *** THE FIRST SHIFT IS 15 AND CANONICAL murmur3 USES 16. *** kit.ts's own words for why the function is
 * here at all are worth keeping, because this tree spent five rounds arriving at the same conclusion from the
 * other direction: "A sine hash was the other option and it drifts into visible repeats once the domain gets
 * large, which the long previews here would find." That is render/exactHash.mjs's entire subject, reached
 * independently by murmur's authors and by v4577-v4582 here.
 *
 * The multipliers ARE murmur3's fmix32 (0x85EBCA6B, 0xC2B2AE35) and the last two shifts are its 13 and 16.
 * Only the first differs. This tree already carries the canonical function -- ev/esAuthority.js's weight()
 * finalizer, shift 16 -- so the difference is not a matter of opinion, and the gate runs both over the same
 * pre-mix word rather than asserting it: 63,999 of 64,000 cells disagree.
 *
 * *** AND THE REASON murmur GIVES FOR USING AN INTEGER HASH IS THIS TREE'S OWN FINDING, REACHED SEPARATELY. ***
 * Measured here for the comparison: mhHash yields 215,996 distinct values over the 216,000 cells of a 60^3
 * lattice -- 4 collisions, against the ~5 a birthday estimate predicts for 216,000 draws from 2^32. The
 * fract(sin(dot)) idiom v4577-v4582 spent five rounds removing from this tree yields 7,112 distinct values
 * over the same 216,000 cells. That is the whole argument, in one pair of numbers.
 */
export function mhHash(x, y, z) {
    const h0 = (Math.imul(x >>> 0, 1597334673) ^ Math.imul(y >>> 0, 3812015801) ^ Math.imul(z >>> 0, 2798796415)) >>> 0;
    let h = h0;
    h = (h ^ (h >>> 15)) >>> 0; h = Math.imul(h, 2246822519) >>> 0;   // 0x85EBCA6B
    h = (h ^ (h >>> 13)) >>> 0; h = Math.imul(h, 3266489917) >>> 0;   // 0xC2B2AE35
    h = (h ^ (h >>> 16)) >>> 0;
    return h;
}

/** kit.ts's own canonical-shift sibling, present ONLY so the gate can show the two are different functions. */
export function fmix32Canonical(h0) {
    let h = h0 >>> 0;
    h = (h ^ (h >>> 16)) >>> 0; h = Math.imul(h, 2246822519) >>> 0;
    h = (h ^ (h >>> 13)) >>> 0; h = Math.imul(h, 3266489917) >>> 0;
    h = (h ^ (h >>> 16)) >>> 0;
    return h;
}

/**
 * A unit vector uniform on the sphere from one lattice cell. kit.ts: "Uniform matters: gradients bunched near
 * the poles put a grain in the field that reads as a weave once the octaves stack."
 *
 * The +4096 is murmur's own, and it is an `ivec3 + int` BEFORE the unsigned cast, so a cell below -4096 wraps
 * rather than clamping. Mirrored exactly: `>>> 0` on the sum reproduces the wrap instead of hiding it.
 */
export function mhGrad3(cx, cy, cz) {
    const h = mhHash((cx + 4096) >>> 0, (cy + 4096) >>> 0, (cz + 4096) >>> 0);
    const z = (h & 0xFFFF) * (2.0 / 65535.0) - 1.0;
    const a = ((h >>> 16) & 0xFFFF) * (6.28318530718 / 65536.0);
    const r = Math.sqrt(Math.max(0.0, 1.0 - z * z));
    return [r * Math.cos(a), r * Math.sin(a), z];
}

/** Gradient noise, quintic fade, eight corners. kit.ts's mh_noise3 exactly. */
export function mhNoise3(px, py, pz) {
    const ix = Math.floor(px), iy = Math.floor(py), iz = Math.floor(pz);
    const fx = px - ix, fy = py - iy, fz = pz - iz;
    const q = (f) => f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
    const ux = q(fx), uy = q(fy), uz = q(fz);
    const corner = (dx, dy, dz) => {
        const g = mhGrad3(ix + dx, iy + dy, iz + dz);
        return g[0] * (fx - dx) + g[1] * (fy - dy) + g[2] * (fz - dz);
    };
    const va = corner(0, 0, 0), vb = corner(1, 0, 0), vc = corner(0, 1, 0), vd = corner(1, 1, 0);
    const ve = corner(0, 0, 1), vf = corner(1, 0, 1), vg = corner(0, 1, 1), vh = corner(1, 1, 1);
    const lerp = (a, b, t) => a + (b - a) * t;
    return lerp(lerp(lerp(va, vb, ux), lerp(vc, vd, ux), uy),
                lerp(lerp(ve, vf, ux), lerp(vg, vh, ux), uy), uz);
}

/** One lane of the hash as a 0..1 float. The >> 8 keeps 24 bits, which is float32's exact integer range. */
export function mhHash1(cell, lane) {
    const c = (Math.trunc(cell) + 32768) >>> 0;
    const l = (Math.trunc(lane) + 32768) >>> 0;
    return (mhHash(c, l, 0x9E3779B9) >>> 8) * (1.0 / 16777216.0);
}

// ---------------------------------------------------------------------------------------------------------
// THE GESTURE CLOCK.
// ---------------------------------------------------------------------------------------------------------

/**
 * kit.ts: "APERIODIC, NEVER A METRONOME... DETERMINISTIC: the slot index is floor(t / slot) and everything
 * else is a hash of it, so any t at all renders the correct frame. NOTHING SNAPS: the envelope is sin^2(pi u),
 * zero with zero slope at both ends."
 *
 * Returns { env, u, rand, dur } -- murmur's vec4 in the same order.
 */
export function mhFlourish(t, lane, slotLen) {
    const SLOT = Math.max(slotLen, 1.0);
    const slot = Math.floor(t / SLOT);
    const local = t - slot * SLOT;
    const start = 0.9 + (SLOT * 0.28) * mhHash1(slot, lane);
    const dur = SLOT * (0.24 + 0.16 * mhHash1(slot + 811.0, lane));
    const u = (local - start) / dur;
    const uc = Math.min(1, Math.max(0, u));
    const sn = Math.sin(Math.PI * uc);
    const env = (u <= 0.0 || u >= 1.0) ? 0.0 : sn * sn;
    return { env, u: uc, rand: mhHash1(slot + 1607.0, lane), dur };
}

/**
 * *** THE SAME GESTURE CLOCK WITH THE SLOT INDEX SUPPLIED RATHER THAN DIVIDED OUT -- v4656. ***
 *
 * mh_flourish takes a slot LENGTH and computes `floor(t / SLOT)`. Three of murmur's species make that length
 * a function of the live signals -- still divides it by (1 + 0.30*pace + 1.70*drive), abyss by (1 + 0.55*voice
 * + 0.35*pace + 1.60*drive), tempest's two lightning lanes by (1 + 1.30*energy) -- and a divisor that moves
 * makes `floor(t / SLOT)` JUMP. The index is not a phase: every hash in this function is keyed on it, so a
 * jump does not advance the gesture, IT REPLACES IT. The bolt in the air becomes a different bolt, with a
 * different start, a different duration and a different direction, between one frame and the next.
 *
 * MEASURED on tempest's first lane as the voice rises, at a 1/60 s frame: after half an hour of running the
 * index moves TWENTY-ONE SLOTS in one frame and the envelope steps 0.9614 of its full range. still reaches
 * 0.9989 and abyss 0.9996 -- a gesture at essentially full brightness appearing out of nothing, or vanishing
 * mid-stroke. It is not a large-t defect the way the phase teleport was: the envelope step is already 0.995
 * after thirty seconds. What grows with t is HOW OFTEN it happens, because d(floor(t/SLOT))/dSLOT is -t/SLOT^2
 * and at large t an arbitrarily small change of slot length flips the index.
 *
 * *** THE REPAIR IS THE SAME FACTORING AS v4654's AND IT COSTS NO NEW UNIFORM. *** The honest generalisation
 * of "time cut into slots" when the slot length moves is that a boundary falls wherever the ACCUMULATED slot
 * count crosses an integer:
 *
 *     S(t) = integral of dt / SLOT(t) = integral of F(t) dt / B = (t + a*P + b*V + c*D) / B
 *
 * because SLOT is B / F with B a style constant and F the signal sum. That is mhRatePhase with a base of 1/B
 * and the three integrals the host already sends. S is continuous and strictly increasing, so floor(S) can
 * only ever step by ONE -- measured at 0 jumps over 1,673 frames across three species and seven session
 * lengths -- and the per-gesture hash stays put for the whole of its own gesture.
 *
 * *** AND IT REDUCES TO murmur's OWN EXPRESSION AT A HELD SIGNAL, which is what protects every recorded
 * frame. *** Held, P = pace*t, so S = t*F/B = t/SLOT: floor(S) IS floor(t/SLOT) and S - floor(S) IS
 * local/SLOT. The one term that has to be read in seconds is murmur's 0.9 s LEAD-IN, which is an absolute
 * duration and not a fraction of the slot, so it enters as 0.9/SLOT at the instantaneous length. That is
 * murmur's rule faithfully read rather than an artefact of the repair: a fixed 0.9 s IS a larger share of a
 * slot that has got shorter, so the start of a gesture genuinely slides while a signal moves. It is
 * CONTINUOUS, and it is why the repaired envelope can step up to 9.0x the rate of its own progress during a
 * transition -- against murmur's 0.9996, which is not a rate at all but a discontinuity.
 *
 * `slotLen` is still taken, for that lead-in and for the `dur` this returns in seconds.
 */
export function mhFlourishPhase(slotPhase, slotLen, lane) {
    const SLOT = Math.max(slotLen, 1.0);
    const slot = Math.floor(slotPhase);
    const localPhase = slotPhase - slot;
    const startPhase = 0.9 / SLOT + 0.28 * mhHash1(slot, lane);
    const durPhase = 0.24 + 0.16 * mhHash1(slot + 811.0, lane);
    const u = (localPhase - startPhase) / durPhase;
    const uc = Math.min(1, Math.max(0, u));
    const sn = Math.sin(Math.PI * uc);
    const env = (u <= 0.0 || u >= 1.0) ? 0.0 : sn * sn;
    return { env, u: uc, rand: mhHash1(slot + 1607.0, lane), dur: SLOT * durPhase };
}

/**
 * kit.ts's mh_drift: an EASED angular travel. rate*t plus a sine whose amplitude is tied to the rate, so the
 * thing "hurries through part of its lap and dawdles through the rest -- a light going somewhere, not a light
 * going round. At a constant rate this species was a spinner."
 *
 * *** THE 0.72 CAP IS CARRIED, AND THE REASON IS NOT INVENTED FOR IT. *** The first draft of this comment said
 * the clamp exists because "past that the derivative goes negative and the travel reverses". That is a tidy
 * story and it is false: d/dt = rate * (1 + k*cos(...)), whose minimum is rate*(1-k), so the travel reverses
 * at k > 1 and not at 0.72 -- measured, min d/dt is 0.38*rate at murmur's own 0.62 and 0.28*rate at the cap.
 * So the cap leaves real margin and kit.ts does not say why. Carried as shipped, with the margin recorded and
 * the reason marked unknown, because a constant explained by a rationale the source never gave is worse than
 * one left unexplained: the next reader believes it.
 */
export function mhDrift(t, rate, wobble, lane) {
    const k = Math.min(0.72, Math.max(0, wobble));
    const w2 = 0.137 + 0.0413 * lane;
    return rate * t + (k * rate / w2) * Math.sin(w2 * t + lane * 1.71);
}

/**
 * *** THE SECULAR PHASE OF A SIGNAL-MODULATED RATE, WHICH IS WHERE THIS PORT DIVERGES FROM murmur ON
 * PURPOSE. ***
 *
 * murmur's species build a rate out of the live signals and hand it to mh_drift, whose phase is rate * t.
 * When the rate moves -- and pace, voice and drive all move constantly -- that expression JUMPS by t * dRate,
 * an error with no ceiling that grows with how long the orb has been on screen. It is the same defect v4650
 * repaired on the HOST clock (2.902 s of shader time in one frame after a minute of idle; 86.191 s after
 * half an hour), one level down, where no host-side integrator can reach it.
 *
 * *** THE REPAIR IS EXACT, NOT AN APPROXIMATION, BECAUSE THE INTEGRAL FACTORS. *** base and the coefficients
 * are constant per species -- they come from style knobs, which do not move -- so
 *
 *     integral of base * (1 + a*pace + b*voice + c*drive) dt  =  base * (t + a*P + b*V + c*D)
 *
 * with P, V, D the running integrals of the three conditioned signals. The shader needs three numbers, not a
 * history. Measured against a numerically integrated reference across a pace ramp and a RESPONDING ramp, the
 * factored form tracks it to the integrator's own step error while rate(t) * t finishes 28.14 radians ahead
 * and stays there.
 *
 * *** AND IT REDUCES TO murmur's OWN EXPRESSION WHEREVER NOTHING IS CHANGING. *** With a constant signal,
 * P = pace * t, so base * (t + a*pace*t) is base * (1 + a*pace) * t -- the line it replaces. That is why
 * this divergence moves no recorded frame: the two differ only while a signal is in motion, which is
 * precisely where murmur's is wrong.
 */
/*
 * *** THE THREE PAIRS ARE NAMED kA/intA RATHER THAN kPace/paceInt, AND THAT IS A CORRECTION MADE AT v4657. ***
 * The function is a sum of three coefficient-and-integral pairs; nine of its ten call sites spend them on
 * pace, voice and drive, and duet spends its middle one on its OWN GESTURE ENVELOPE, which the host
 * integrates because duet's flourish lane and slot are style constants. Under the old names that call site
 * read `float(DU.rateFlourish), uniforms.duetFlourishInt` in the slots labelled kVoice and voiceInt -- an
 * argument named for one signal carrying another, which is a small lie in the one place a reader looks to
 * find out what a rate is made of. The generality was always there; the names hid it.
 */
export function mhRatePhase(base, t, kA, intA, kB, intB, kC, intC) {
    return base * (t + kA * intA + kB * intB + kC * intC);
}

/**
 * *** THE TERMS A RATE NEEDS WHEN IT IS NOT A SUM OF THE THREE CONDITIONED SIGNALS -- v4657. ***
 *
 * mhRatePhase covers base * (1 + a*pace + b*voice + c*drive), which is every rate in murmur's roster but
 * one. limn's is a PRODUCT of two modulated factors:
 *
 *     rate = base * (1 + 0.95*pace + 0.30*voice) * (1 + 1.05*drive)
 *          = base * (1 + 0.95p + 0.30v + 1.05d + 0.9975*p*d + 0.3150*v*d)
 *
 * and the last two terms are integrals of a PRODUCT, which is not the product of two integrals. The host
 * accumulates them from the conditioned pair at each instant -- see render/aiPresenceOrbState.mjs -- and
 * this adds them to what mhRatePhase already returned. Together the two reproduce murmur's product EXACTLY
 * at a held signal (3.6e-12 over 144 operating points out to an hour), which is what protects every
 * recorded frame, and diverge only while a signal is moving, which is where murmur's is wrong: 68.3121 rad
 * of limn's travel in one 1/60 s frame after half an hour, against a flat 0.056582.
 *
 * *** IT IS SPLIT FROM mhRatePhase RATHER THAN FOLDED INTO IT because ONE species has cross terms. *** A
 * five-pair mhRatePhase would make nine call sites pass 0.0 twice, and a coefficient of zero grades nothing
 * -- this tree has found that exact shape in three consecutive rounds. A separate function is a separate
 * claim, and limn is the only caller that has one to make.
 */
export function mhCrossPhase(base, kPaceDrive, paceDriveInt, kVoiceDrive, voiceDriveInt) {
    return base * (kPaceDrive * paceDriveInt + kVoiceDrive * voiceDriveInt);
}

/**
 * *** THE THIRD RATE SHAPE IN murmur's ROSTER: A MIX OF TWO ARMS THAT BOTH CARRY THE SPEED FACTOR -- v4668. ***
 *
 * mhRatePhase covers a rate that is a SUM of conditioned signals; mhCrossPhase adds the terms a PRODUCT of
 * two modulated factors needs. Two species spell a clock a third way, as a MIX whose weight is itself a
 * signal and whose two arms are both scaled by murmur's own speed factor:
 *
 *   geode.ts   ay = mix(mh_drift(t, 0.088 * sp, 0.48, 2.0), t * 0.30 * sp, st.drive * 0.70)
 *   fathom.ts  a1 = mix(mh_drift(t, -0.062 * sp, 0.50, 2.0), a0, st.drive * 0.70)
 *              a2 = mix(mh_drift(t,  0.108 * sp, 0.40, 3.0), a0, st.drive * 0.70)
 *
 * with sp = (1 + q * live.pace + s * st.drive) -- q,s = 0.80,1.00 for geode and 0.85,1.10 for fathom.
 *
 * *** THE MIX OF TWO RATES IS ONE RATE, AND THAT IS THE WHOLE STEP. *** Writing w = m * drive and reading
 * `base` for the drifting arm's rate and `toward` for the arm it is pulled onto,
 *
 *     mixed = sp * (base * (1 - w) + toward * w)
 *           = sp * (base + m * (toward - base) * drive)
 *           = (1 + q*pace + s*drive) * (A + B*drive),    A = base,  B = m * (toward - base)
 *           = A + A*q*pace + (A*s + B)*drive + B*q*pace*drive + B*s*drive*drive
 *
 * so the exact integral is A*t + A*q*P + (A*s + B)*D + B*q*PD + B*s*DD, and the only integral in it this
 * host was not already sending is DD -- the integral of drive SQUARED. ONE accumulator closes all three
 * sites, which is why they were held together for one round rather than wired one at a time.
 *
 * *** IT IS A FUNCTION OF murmur's FOUR NUMBERS AND NOT A TABLE OF FIVE DERIVED ONES. *** `base`, `toward`,
 * `mixW`, `kPace` and `kDrive` are what geode.ts and fathom.ts literally contain; every coefficient above is
 * computed from them here, so an edit to either source moves all five together. Writing 0.113190 down would
 * present a derived quantity as a transcription and leave it free to go stale -- the defect this tree has
 * repaired in its own records more often than in its code.
 *
 * *** AND B IS SIGNED, WHICH IS NOT A DETAIL. *** fathom's second shell has base -0.062 and toward +0.085,
 * so B is positive and large enough to carry the shell THROUGH zero: at a held pace of 0.30 its rate runs
 * -0.077810 rad/s at rest and +0.096320 at full drive. The shell REVERSES under RESPONDING, because it is
 * being pulled onto the first shell's turn and the first shell turns the other way. A port that dropped the
 * mix ran it at a flat -0.062 -- the wrong direction at full drive, at 64% of the right speed.
 */
export function mhSpMixCoef(base, toward, mixW, kPace, kDrive) {
    const A = base, B = mixW * (toward - base);
    return { t: A, pace: A * kPace, drive: A * kDrive + B, paceDrive: B * kPace, driveSq: B * kDrive };
}

/** The secular phase mhSpMixCoef's coefficients describe. Its shader twin is murmurKitTsl's mhSpMixPhase. */
export function mhSpMixPhase(c, t, paceInt, driveInt, paceDriveInt, driveSqInt) {
    return c.t * t + c.pace * paceInt + c.drive * driveInt + c.paceDrive * paceDriveInt + c.driveSq * driveSqInt;
}

/**
 * The INSTANTANEOUS mix weight and speed factor the wobble halves keep -- see mhDriftPhase for why the
 * bounded term is transcribed rather than integrated. Both are plain reads of the signals at this instant.
 */
export function mhSpFactor(kPace, kDrive, pace, drive) { return 1 + kPace * pace + kDrive * drive; }

/**
 * mh_drift with the secular term supplied rather than computed, so a modulated rate cannot teleport it.
 *
 * *** THE WOBBLE TERM KEEPS murmur's INSTANTANEOUS RATE AS ITS AMPLITUDE, AND THAT IS A DELIBERATE LIMIT ON
 * THE DIVERGENCE. *** kit.ts's closed form is the exact integral of rate * (1 + k*cos(w2*t + phi)) for a
 * CONSTANT rate; with a moving rate neither half is exactly right, but only the secular half is unbounded.
 * The wobble contributes at most k*rate/w2 -- for the largest rate and lane in the roster that is under two
 * radians, and it does not accumulate. So this repairs the term that grows without limit and transcribes the
 * one that does not, rather than inventing a second-order correction murmur never had and nothing can check.
 */
export function mhDriftPhase(secular, rate, wobble, lane, t) {
    const k = Math.min(MH_DRIFT_WOBBLE_CAP, Math.max(0, wobble));
    const w2 = 0.137 + 0.0413 * lane;
    return secular + (k * rate / w2) * Math.sin(w2 * t + lane * 1.71);
}

/** The maximum wobble kit.ts allows. Its reason is NOT stated upstream and is not guessed here -- see mhDrift. */
export const MH_DRIFT_WOBBLE_CAP = 0.72;

/** kit.ts: two periods whose ratio is irrational enough not to repeat, weighted 0.62/0.38 so the sum is not a sine. */
export function mhBreath(t, lane) {
    const a = Math.sin(t * 0.668 + lane);
    const b = Math.sin(t * 0.427 + lane * 2.3 + 1.1);
    return 0.5 + 0.5 * (0.62 * a + 0.38 * b);
}

// ---------------------------------------------------------------------------------------------------------
// THE GLASS BODY: entry, direction, and how far the ray runs.
// ---------------------------------------------------------------------------------------------------------

const dot3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const len3 = (a) => Math.hypot(a[0], a[1], a[2]);
const norm3 = (a) => { const L = len3(a) || 1; return [a[0] / L, a[1] / L, a[2] / L]; };
export { dot3, len3, norm3 };

/** kit.ts's mh_refract: Snell written out so the total-internal guard is visible rather than a silent NaN. */
export function mhRefract(V, N, eta = MH_ETA) {
    const ci = Math.min(1, Math.max(0, -dot3(V, N)));
    const k = 1.0 - eta * eta * (1.0 - ci * ci);
    if (k <= 0.0) return [V[0], V[1], V[2]];
    const s = eta * ci - Math.sqrt(k);
    return norm3([eta * V[0] + s * N[0], eta * V[1] + s * N[1], eta * V[2] + s * N[2]]);
}

/**
 * kit.ts's mh_look. "Bending the RAY rather than moving the content is what makes one line serve every hero,
 * and because the offset accumulates along the ray, deep content moves further than shallow content for free."
 * The zero test is murmur's own EXACT comparison, not an epsilon -- at tilt (0,0) this returns mh_refract's
 * vector untouched, and the gate asserts that identity rather than a closeness.
 */
export function mhLook(V, N, tilt = [0, 0]) {
    const rd = mhRefract(V, N, MH_ETA);
    if (tilt[0] === 0.0 && tilt[1] === 0.0) return rd;
    return norm3([rd[0] + tilt[0] * MH_TILT, rd[1] + tilt[1] * MH_TILT, rd[2]]);
}

/**
 * How far the interior ray travels before it leaves, against the UNDEFORMED unit sphere -- which kit.ts
 * chooses deliberately ("a second deformation solve per pixel would double the body's cost to move the last
 * tap by a pixel"), and which is EXACTLY the case this port ships, so nothing is approximated here.
 */
export function mhExit(P, rd) {
    const b = dot3(P, rd);
    const c = dot3(P, P) - 1.0;
    const disc = b * b - c;
    if (disc <= 0.0) return 0.0;
    return Math.min(MH_EXIT_CAP, Math.max(0.0, -b + Math.sqrt(disc)));
}

// ---------------------------------------------------------------------------------------------------------
// THE MEDIUM.
// ---------------------------------------------------------------------------------------------------------

export function smoothstep(e0, e1, x) { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); }

/** kit.ts's mh_haze: one octave, advecting on all three axes so it is never a still texture. */
export function mhHaze(p, t, scale) {
    const n = mhNoise3(p[0] * scale + t * 0.051, p[1] * scale - t * 0.033, p[2] * scale + t * 0.089);
    return Math.min(1, Math.max(0, 0.5 + 0.85 * n));
}

/** kit.ts's mh_medium: "a body whose ambient interior is zero reads HOLLOW, so there is a floor." */
export function mhMedium(p, t, scale) {
    const fog = 1.0 - smoothstep(0.05, 0.98, len3(p));
    return fog * (0.55 + 0.45 * mhHaze(p, t, scale));
}

/** kit.ts's mh_inside: "CONTENT FLOATS, IT DOES NOT TOUCH THE WALL." */
export function mhInside(p) { return 1.0 - smoothstep(0.76, 0.99, len3(p)); }

/** kit.ts's mh_transmit. Exponent 2.2 and the 0.88 are murmur's, and its header says why not a steeper one. */
export function mhTransmit(fres) { return 1.0 - 0.88 * Math.pow(Math.min(1, Math.max(0, fres)), 2.2); }

/** kit.ts's mh_scatter: the same gaussian 3.2x wider for one more exp. */
export function mhScatter(arg, amp) { return amp * Math.exp(-arg * MH_SCATTER_K); }

// ---------------------------------------------------------------------------------------------------------
// THE MARCH, and still's own interior.
// ---------------------------------------------------------------------------------------------------------

/** murmur's own default tap count (kit.ts makes it a uniform, u_taps; this is the value the demo runs at). */
export const MH_TAPS = 24;

/**
 * still.ts's interior integral, transcribed: the same loop, the same order of operations, the same early-out.
 * Returns { lum, hueNum, trans } -- acc.x, acc.y and the surviving transmittance.
 *
 * ORDER MATTERS AND IS NOT TIDIED. `trans` multiplies the contribution BEFORE it is updated, so the first tap
 * is unattenuated; moving the update above the accumulate changes the result by the full first-tap weight.
 */
export function marchStillInterior(P, rd, { t = 0, scale = 1.9, floorAmt = 0.05, taps = MH_TAPS, complete = 0, sweep = 0 } = {}) {
    const L = mhExit(P, rd);
    let accX = 0, accY = 0, trans = 1.0;
    if (!(L > 0)) return { lum: 0, hueNum: 0, trans, L };
    const ds = L / taps;
    for (let i = 0; i < taps; i++) {
        const s = (i + 0.5) * ds;
        const p = [P[0] + rd[0] * s, P[1] + rd[1] * s, P[2] + rd[2] * s];
        if (mhInside(p) <= 0.001) continue;
        let e = mhMedium(p, t, scale) * floorAmt;
        if (complete > 0.001) {
            const sr = (len3(p) - (0.02 + (0.95 - 0.02) * sweep)) / 0.26;
            e += complete * 0.30 * Math.exp(-sr * sr);
        }
        accX += e * trans * ds;
        accY += e * Math.min(1, Math.max(-1, p[2])) * trans * ds;
        trans *= Math.exp(-(2.0 * e + MH_EXT) * ds);
    }
    return { lum: accX, hueNum: accY, trans, L };
}

/**
 * still.ts's glint, SOLVED AT THE RAY'S CLOSEST APPROACH rather than marched -- its own file says why: "On the
 * only event in the frame, sampling artefacts are the entire picture, so this one is never marched."
 *
 * This is the piece the first round did not have. Its glint was exp(-(t mod period)^2 / w^2): one number per
 * FRAME, identical across every pixel of the orb. This one depends on where the ray is and where the light is,
 * which is what makes it cross the volume.
 */
export function stillGlintSolved(P, rd, gp, gw, { bright = 1 } = {}) {
    const L = mhExit(P, rd);
    const toG = [gp[0] - P[0], gp[1] - P[1], gp[2] - P[2]];
    const sG = dot3(toG, rd);
    if (!(sG > 0 && sG < L)) return 0;
    const argG = Math.max(dot3(toG, toG) - sG * sG, 0.0) / Math.max(gw * gw, 1e-6);
    const at = [P[0] + rd[0] * sG, P[1] + rd[1] * sG, P[2] + rd[2] * sG];
    const visG = mhInside(at) * Math.exp(-MH_EXT * sG);
    return (Math.exp(-argG) * 1.05 + mhScatter(argG, 0.38)) * visG * bright;
}

/**
 * still.ts's glint PATH. The light enters one side and leaves by the other along a line hashed per gesture;
 * under drive the lines converge on a single axis so an occasional wander becomes a traverse.
 */
export function stillGlintPath(fl, drive = 0) {
    const ga = fl.rand * 6.2831853;
    const wander = [Math.cos(ga), 0.42 * Math.sin(ga * 1.3), Math.sin(ga)];
    const axis = [0.92, -0.18, 0.35];
    const dir = norm3([
        wander[0] + (axis[0] - wander[0]) * drive,
        wander[1] + (axis[1] - wander[1]) * drive,
        wander[2] + (axis[2] - wander[2]) * drive,
    ]);
    const side = norm3([
        dir[1] * 0.12 - dir[2] * 1.0,
        dir[2] * 0.06 - dir[0] * 0.12,
        dir[0] * 1.0 - dir[1] * 0.06,
    ]);
    const lateral = 0.34 * (fl.rand * 2.0 - 1.0) * (1.0 - 0.7 * drive);
    const along = -0.62 + 1.24 * smoothstep(0, 1, fl.u);
    return [
        side[0] * lateral + dir[0] * along,
        side[1] * lateral + dir[1] * along,
        side[2] * lateral + dir[2] * along,
    ];
}

// ---------------------------------------------------------------------------------------------------------
// LIMN -- the second species. "Near-dark glass whose EDGE is alive."
// ---------------------------------------------------------------------------------------------------------

/** limn.ts's own four knobs and their shipped defaults, from murmur's src/styles.ts roster. */
export const LIMN_DEFAULTS = Object.freeze({ rimWidth: 0.4, travel: 0.5, innerHint: 0.3, spread: 0.4 });

/**
 * *** THE COMMA, AND WHY IT IS TWO VON MISES BUMPS RATHER THAN A GAUSSIAN. *** limn.ts records its own first
 * cut failing and says exactly how: "one gaussian in the angle, narrow ahead of the head and wide behind it
 * ... left a razor-thin dark seam down one radius of the body. The two halves do not agree where the wrap
 * happens: at plus and minus pi the narrow side had fallen to 0.03 and the wide side was still at 0.21, so
 * the field simply steps. A GAUSSIAN IN A WRAPPED ANGLE IS NOT A PERIODIC FUNCTION and no amount of tuning
 * makes it one."
 *
 * So the profile is exp(k*(cos(x)-1)) -- a function of cos(x) alone, therefore periodic BY CONSTRUCTION. A
 * tight lobe at the head plus a broad one at 0.52 amplitude offset about a radian behind it. The gate checks
 * the periodicity as an identity at the wrap rather than trusting the construction.
 */
export function vonMises(x, k) { return Math.exp(k * (Math.cos(x) - 1)); }

/** limn's arc profile at angular offset `aw` from the head. kHead/kTail/offT are murmur's own. */
export function limnArc(aw, { kHead = 9.0, kTail = 1.6, offT = -1.05 } = {}) {
    return vonMises(aw, kHead) + 0.52 * vonMises(aw - offT, kTail);
}

/**
 * The tail's share of the light at this angle -- limn's own hue weight, and its reason is worth carrying:
 * "the honest measure of how much of what I am seeing here is old light and, unlike the wrapped angle the
 * first cut used, PERIODIC -- so the hue has no seam either."
 */
export function limnTailShare(aw, opts = {}) {
    const { kHead = 9.0, kTail = 1.6, offT = -1.05 } = opts;
    const head = vonMises(aw, kHead), tail = 0.52 * vonMises(aw - offT, kTail);
    return tail / Math.max(head + tail, 1e-4);
}

/** Wrap an angle to -pi..pi the way limn.ts does it -- subtracting a rounded turn, not an atan round-trip. */
export function wrapPi(a) { return a - 2 * Math.PI * Math.floor(a / (2 * Math.PI) + 0.5); }

// ---------------------------------------------------------------------------------------------------------
// THE DEFORMED BODY -- the half of the kit the first three species did not need.
//
// still, limn and comet are all solved against an UNDEFORMED sphere, which is what the port has carried since
// v4623. droplet is the species where "the body itself is the species: a sphere of water in free fall", so it
// needs mh_shape / mh_deform / mh_body -- and having them is what unlocks the silhouette-deforming half of
// murmur's roster rather than one more species.
// ---------------------------------------------------------------------------------------------------------

/** THE CLIP IS THE LAW. kit.ts clamps amp here and says so: "Everything downstream trusts this cap." */
export const MH_AMP_CAP = 0.085;

/** A still shape: three slow modes, no travelling wave. hi is the tremor, gain scales SHADING past physical. */
export function mhShape(amp, hi = 0, gain = 1.35, flow = null) {
    return {
        amp, hi, gain,
        flowDir: flow ? flow.dir : [0, 0, 1],
        flowAmp: flow ? flow.amp : 0,
        flowPhase: flow ? flow.phase : 0,
    };
}

/**
 * THE DEFORMATION, AND ITS EXACT GRADIENT.
 *
 * Three modes, each a sine of the dot product with a slowly rotating axis. kit.ts on the wavenumbers 1.7, 2.6
 * and 3.4: "low enough that the result reads as 'slightly out of round' rather than as texture, which is the
 * entire difference between a water droplet and a golf ball." The axes turn at 0.083, 0.061 and 0.047 rad/s --
 * periods of 76, 103 and 134 seconds, mutually incommensurate, "so the shape never repeats and never sits still".
 *
 * *** THE GRADIENT IS FREE AND EXACT, AND THAT IS THE WHOLE REASON THIS IS A SINE SUM. *** d/dn of
 * sin(k * dot(n, a)) is k*cos(...)*a, so the surface NORMAL is analytic rather than finite-differenced -- which
 * is what lets the specular and the fresnel rim ride the wobble without stair-stepping. The gate checks the
 * analytic gradient against a central difference rather than taking the claim on trust.
 *
 * Returns { d, g } -- displacement and its gradient with respect to n.
 */
export function mhDeform(n, t, sh) {
    const a1 = t * 0.083, a2 = t * 0.061 + 2.10, a3 = t * 0.047 + 4.37;
    const ax1 = norm3([Math.cos(a1), 0.62, Math.sin(a1)]);
    const ax2 = norm3([0.55, Math.cos(a2), Math.sin(a2)]);
    const ax3 = norm3([Math.sin(a3), -0.44, Math.cos(a3)]);
    const k1 = 1.70, k2 = 2.60, k3 = 3.40;
    const w1 = 0.55, w2 = 0.30, w3 = 0.18;
    const NORM = 1 / (w1 + w2 + w3);

    const u1 = dot3(n, ax1), u2 = dot3(n, ax2), u3 = dot3(n, ax3);
    let d = (w1 * Math.sin(k1 * u1) + w2 * Math.sin(k2 * u2 + 1.9) + w3 * Math.sin(k3 * u3 + 4.1)) * NORM;
    const g = [0, 0, 0];
    const addG = (c, ax) => { g[0] += c * ax[0]; g[1] += c * ax[1]; g[2] += c * ax[2]; };
    addG(w1 * k1 * Math.cos(k1 * u1) * NORM, ax1);
    addG(w2 * k2 * Math.cos(k2 * u2 + 1.9) * NORM, ax2);
    addG(w3 * k3 * Math.cos(k3 * u3 + 4.1) * NORM, ax3);

    // The tremor: a fourth mode at wavenumber 6.9, texture rather than shape, whose axis turns eight times
    // faster than the body's. Only droplet's activity response ever gives it amplitude.
    if (sh.hi > 1e-4) {
        const a4 = t * 0.63;
        const ax4 = norm3([Math.cos(a4) * 0.8, Math.sin(a4 * 0.77), Math.sin(a4)]);
        const k4 = 6.90, u4 = dot3(n, ax4);
        d += sh.hi * Math.sin(k4 * u4);
        addG(sh.hi * k4 * Math.cos(k4 * u4), ax4);
    }
    // The travelling wave: how RESPONDING gets a heading into the silhouette.
    if (sh.flowAmp > 1e-4) {
        const kf = 3.20, uf = dot3(n, sh.flowDir);
        d += sh.flowAmp * Math.sin(kf * uf + sh.flowPhase);
        addG(sh.flowAmp * kf * Math.cos(kf * uf + sh.flowPhase), sh.flowDir);
    }
    return { d, g };
}

/**
 * *** SOLVING A STAR-SHAPED SDF WITHOUT MARCHING IT. *** The surface is r = Rd(n) about the origin, so for an
 * orthographic ray at in-plane radius rho the entry height satisfies z = sqrt(Rd(n)^2 - rho^2) with n itself
 * depending on z. kit.ts: "Two fixed-point iterations solve it to well under a pixel for displacements this
 * small, and two evaluations of mh_deform is a tenth of what a sphere-trace would cost." The gate measures
 * that convergence against a run-to-fixpoint solve rather than repeating the claim.
 *
 * THE NORMAL is exact: for F(p) = |p| - Rd(p/|p|) the gradient is n minus the tangential part of Rd's gradient
 * over Rd, and mhDeform hands the gradient back. `gain` then scales the perturbation PAST physical, because
 * "the silhouette is capped by the clip but the SHADING is not, so a droplet can look far more liquid than its
 * outline is allowed to be".
 *
 * Returns { m, P, N, Rd, rho, fres } in BODY UNITS, where the undeformed radius is 1.
 */
export function mhBody(uv, t, px, shIn) {
    const sh = { ...shIn, amp: Math.min(MH_AMP_CAP, Math.max(0, shIn.amp)) };
    const s = [uv[0] / MH_R, uv[1] / MH_R];
    const rho = Math.hypot(s[0], s[1]);

    const z0 = Math.sqrt(Math.max(1 - Math.min(rho * rho, 1), 0));
    const n0 = norm3([s[0], s[1], z0 + 1e-6]);
    const R0 = 1 + mhDeform(n0, t, sh).d * sh.amp;

    const z1 = Math.sqrt(Math.max(R0 * R0 - rho * rho, 0));
    const n1 = norm3([s[0], s[1], z1 + 1e-6]);
    const d1 = mhDeform(n1, t, sh);
    const Rd = 1 + d1.d * sh.amp;

    const z2 = Math.sqrt(Math.max(Rd * Rd - rho * rho, 0));
    const P = [s[0], s[1], z2];

    let gt = [d1.g[0] * sh.amp, d1.g[1] * sh.amp, d1.g[2] * sh.amp];
    const gn = dot3(gt, n1);
    gt = [gt[0] - gn * n1[0], gt[1] - gn * n1[1], gt[2] - gn * n1[2]];
    const denom = Math.max(Rd, 1e-3);
    const N = norm3([n1[0] - gt[0] * sh.gain / denom, n1[1] - gt[1] * sh.gain / denom, n1[2] - gt[2] * sh.gain / denom]);

    // THE SILHOUETTE IS SOFT BY TWO NUMBERS ADDED RATHER THAN MULTIPLIED: a fixed 1.8% of organic feather,
    // "because nothing in this house has a hard edge", plus 1.3 pixels of antialiasing, "because at 18 pt the
    // fixed feather is a fifth of a pixel and would alias to a staircase".
    const feather = Math.max(0.018, 1.3 * px);
    const m = 1 - smoothstep(Rd - feather, Rd + feather, rho);
    return { m, P, N, Rd, rho, fres: 1 - Math.min(1, Math.max(0, N[2])) };
}

// ---- the surface: mh_key / mh_small / mh_surface ---------------------------------------------------------
// *** EVERY ONE OF murmur's EIGHTEEN SPECIES CALLS mh_surface, AND UNTIL v4629 THIS PORT APPROXIMATED IT. ***
// render/aiPresenceOrbTsl.mjs carried its own fresnel rim at a fixed exponent of 4.5, two specular lobes off a
// FIXED light direction of its own choosing, and no contact glow at all -- against a function whose light
// drifts, whose rim exponent and asymmetry both move with the ground, whose tight lobe is size-adaptive, and
// which carries a contact bloom every species asks for. kit.ts calls this "THE SURFACE, shared by every hero".

// ---- opal's lives and abyss's clocks ---------------------------------------------------------------------
// The two species whose subject is TIME, so the two whose defining properties are cheapest to check here and
// most expensive to check on pixels: a render samples four or five instants, and these are claims about every
// instant. Both are transcribed from their own files and neither is used by the shader -- the shader inlines
// the same arithmetic, and tools/ship/murmurSpecies3-selfcheck.mjs grades the PICTURE while the kit gate
// grades these. That is the same division the march and mh_exit already have.

/** opal's four life periods, seconds. Mutually incommensurate so no two flashes ever arrive together. */
export const OPAL_PERIODS = Object.freeze([14.3, 17.0, 19.7, 22.4]);

/**
 * ONE FLASH'S LIFE. opal.ts: "each one rides its own life envelope on a period between fourteen and
 * twenty-two seconds, out of phase with the others, so no two arrive together and none of them ever appears
 * or vanishes. The envelope has a floor rather than a zero, so a flash at its dimmest is still faintly
 * present and there is no moment of switching on."
 *
 * sin SQUARED, not |sin|: the square has a ZERO DERIVATIVE at both ends, which is what "flat ends" means and
 * what stops the arrival reading as an event. A floor of 0.16 rather than 0 is the rest of it.
 */
export function opalLife(k, t) {
    const per = 14.3 + 2.7 * k, ph = k * 1.97;
    const sn = Math.sin(2 * Math.PI * t / per + ph);
    return 0.16 + 0.84 * sn * sn;
}

/** opal's hue key for flash k: -1, -1/3, +1/3, +1 -- four points across the spread, two either side. */
export function opalHueKey(k) { return (k - 1.5) / 1.5; }

/**
 * abyss's SLOT LENGTH in seconds -- how long between passes on one lane.
 *
 * abyss.ts: "RARITY IS THE SLOT LENGTH and it runs the intuitive way: high is rarer." Voice and drive shorten
 * it hard ("speak to it and the abyss becomes populated", the one reading of level that suits a species whose
 * subject is scarcity) and the small mounts shorten it again by a third, "so the species shows itself at a
 * glance" rather than making a thirteen-point bead sit through its own silence.
 */
export function abyssSlot(rarity, voice = 0, pace = 0, drive = 0, small = 0) {
    const r = Math.min(1, Math.max(0, rarity));
    const base = (9.0 + (26.0 - 9.0) * r) / (1 + 0.55 * voice + 0.35 * pace + 1.60 * drive);
    return base * (1 + (0.66 - 1) * small);
}

/**
 * *** THE THREE SPECIES WHOSE GESTURE SLOT READS THE LIVE SIGNALS, AND THE COEFFICIENTS THEY READ IT WITH. ***
 *
 * A slot length is B / F, where B is a style constant and F is this sum. Every other species hands
 * mh_flourish a fixed number of seconds, so its slot is not here -- a table naming eighteen species where
 * three have an entry is a table nobody can read.
 *
 *   still    still.ts:   mix(11.5, 7.0, glintK) / (1 + 0.30*live.pace + 1.70*st.drive)
 *   abyss    abyss.ts:   mix(9, 26, rarityK) / (1 + 0.55*live.voice + 0.35*live.pace + 1.60*st.drive)
 *   tempest  tempest.ts: mix(2.9, 5.2, small) * 1/(1 + 1.30*energy), energy = clamp(0.85*live.voice, 0, 1.6)
 *
 * *** tempest's VOICE COEFFICIENT IS A PRODUCT AND IT IS ONLY A CONSTANT BECAUSE THE CLAMP IS INERT. ***
 * 1.30 * 0.85 is 1.105, and folding the two is the same function as murmur's only while `energy` is a LINEAR
 * function of voice. mh_live's voice output is bounded to [0,1] in both halves of the kit, so energy tops out
 * at 0.85 against a ceiling of 1.6 -- a margin of 1.88x, measured at v4655 for the drift that reads the same
 * clamp and re-checked here for the slot.
 *
 * These are the ORB's coefficients. abyssSlot above carries its own three because it is a transcription of
 * abyss.ts in its own right and the two are meant to be able to disagree -- the v4579 distinction. The gate
 * RECOVERS this table's abyss row from that function by inversion rather than comparing the literals, so a
 * drift between them is caught without either being a restatement of the other.
 */
export const MH_SLOT_SIGNAL = Object.freeze({
    still:   Object.freeze({ pace: 0.30, voice: 0.00, drive: 1.70 }),
    abyss:   Object.freeze({ pace: 0.35, voice: 0.55, drive: 1.60 }),
    // *** tempest's ENTRY WAS BUILT ON THE WRONG SIGNAL AND v4663 REBUILT IT. *** The divisor is
    // (1 + 1.30 * energy) and v4656 folded it as 1.30 * 0.85 on VOICE, because this port's energy was
    // 0.85*voice. tempest.ts's energy is 0.85*live.pace + 0.65*think + 0.55*st.drive, so the weight that sat
    // entirely on voice is distributed across three signals and voice carries NONE of it. `k` is the 1.30
    // itself, named rather than folded, so the three coefficients below are readable as what they are --
    // the divisor's weight times each of energy's own terms -- and so the shader's instantaneous divisor
    // and this table cannot drift apart.
    //
    // THE `think` SLOT IS NOT A CONDITIONED SIGNAL and the field is named for it rather than for `voice`,
    // which is the field mhRatePhase's middle pair will carry for this species. A slot called voice holding
    // a think coefficient is how a census reads the wrong number and reports it confidently.
    tempest: Object.freeze({ k: 1.30, pace: 1.30 * 0.85, think: 1.30 * 0.65, voice: 0.00, drive: 1.30 * 0.55 }),
});

/**
 * *** limn's TRAVEL RATE -- THE ONE RATE IN murmur's ROSTER THAT IS A PRODUCT. ***
 *
 * limn.ts: rate = (0.34 + 0.40*travelK) * (1 + 0.95*live.pace + 0.30*live.voice) * (1 + 1.05*st.drive),
 * and wobble = mix(0.62, 0.14, st.drive) -- "roughly doubles the rate: a decisive sweep", with the ease
 * flattening as it goes so the sweep reads as decision rather than as hurry.
 *
 * THE CROSS COEFFICIENTS ARE NOT IN THIS TABLE ON PURPOSE. The expansion's pace*drive term is 0.95 * 1.05
 * and its voice*drive term is 0.30 * 1.05, and the shader forms those PRODUCTS from the two factors rather
 * than reading a third pair of numbers. A table carrying 0.9975 beside 0.95 and 1.05 is two spellings of
 * one fact, and the day somebody edits one of the three the other two stop describing murmur.
 */
export const MH_LIMN_RATE = Object.freeze({
    base: 0.34, travelK: 0.40,
    pace: 0.95, voice: 0.30, drive: 1.05,
    wobLo: 0.62, wobHi: 0.14, lane: 1.0,
});

/** abyss's three lanes: their seeds and the multipliers on the slot, so the gaps are never equal. */
export const ABYSS_LANES = Object.freeze([
    Object.freeze({ seed: 31.0, slot: 1.00 }),
    Object.freeze({ seed: 37.0, slot: 1.37 }),
    Object.freeze({ seed: 41.0, slot: 1.81 }),
]);

/**
 * THE CONTAINMENT, and kit.ts is explicit that it is NOT the design of the edge: "In this family the body has
 * its own silhouette well inside the circular clip, so this is a safety net FOR THE CONTACT GLOW rather than
 * the design of the edge -- which is why the span is 0.26 here rather than the 0.31 the other packs use.
 * Called at 0.72, the fall runs from a uv radius of 0.36 to 0.49, and the body's worst case is 0.339."
 *
 * *** THIS PORT CLIPPED AT THE BODY INSTEAD, AND THAT DELETED THE CONTACT GLOW ENTIRELY. *** The species'
 * alpha was 1 - smoothstep(R - feather, R, rho) with R the body radius, so the mask went to zero exactly
 * where mh_surface's glow lives -- outside the silhouette, which is the only place it is nonzero. The term
 * was computed correctly and reached no pixel, which is the same shape of defect as the refracted ray v4624
 * found this file computing and discarding.
 */
export function mhContainment(uvLen, reach = 0.72) {
    return 1 - smoothstep(reach, reach + 0.26, uvLen * 2.0);
}

/**
 * THE KEY LIGHT, AND IT MOVES. kit.ts: "The light sits up and to the left and drifts about four degrees over
 * half a minute, which is enough that the highlight is never in the same place twice and not enough that
 * anybody watches it move."
 *
 * *** SCREEN Y RUNS DOWN IN A colorEffect, SO UP-LEFT IS NEGATIVE IN BOTH. *** That is why both leading
 * coefficients are negative, and it is the single easiest thing to get backwards in this whole file -- a port
 * that "fixed" the signs would light the orb from below-right and every specular in the family would move.
 *
 * It is deliberately further out than a beauty light: kit.ts says at (-0.52, -0.60) the highlight lands "at
 * about 0.45 of the radius, clear of whatever the hero has put in the middle".
 */
export function mhKey(t) {
    const dr = t * 0.21;
    return norm3([-0.52 + 0.055 * Math.sin(dr), -0.60 + 0.045 * Math.cos(dr * 0.83), 0.61]);
}

/**
 * THE SIZE DIAL. kit.ts: "One number, 1 at 18 pt and 0 at 120 pt and above, and every species spends it the
 * same way: structure counts down, strokes thicken."
 *
 * *** ITS STATED MIDPOINT AND ITS REAL ONE DISAGREE, AND THE CODE IS SHIPPED AS WRITTEN. *** The header says
 * "the midpoint sits at about 46 pt, the chip mount"; smoothstep(16, 88, x) reaches a half at the arithmetic
 * middle of its edges, which is 52. The gate asserts 52 and reports the gap, the same way MH_SCATTER_K's
 * prose-versus-code split and droplet's 0.339 arithmetic slip are carried: a port that corrects its source
 * has stopped being a port.
 */
export function mhSmall(w, h) {
    return 1 - smoothstep(16.0, 88.0, Math.max(Math.min(w, h), 1.0));
}

/**
 * THE SURFACE EVERY HERO SHARES: rim, specular, and the contact bloom outside the silhouette.
 *
 * `b` is an mhBody result ({m, P, N, Rd, rho, fres}); `tilt` is the device tilt in [-1,1]^2; rimK/specK/glowK
 * are the species' own three numbers off murmur's roster. Returns { rim, spec, glow } in the same energy
 * units the colour rail's mh_lit consumes.
 *
 * FIVE THINGS THIS DOES THAT THE APPROXIMATION IT REPLACES DID NOT, each a number rather than a flourish:
 *   - the RIM GAIN rises by a third on paper (mix(1, 1.32, paper)), "because the edge does more work on paper
 *     than it ever does on ink: it is the whole silhouette of an object that is otherwise nearly the colour of
 *     the page. A third more of it, and no other term changes."
 *   - the TIGHT LOBE IS SIZE-ADAPTIVE, mix(96, 16, small): a 96-exponent highlight "covers about four pixels
 *     at 120 pt and a third of one at 18 pt, where it would flicker in and out as the body wobbled underneath
 *     it". 96 rather than the 58 a first cut used, and for the VALUE HIERARCHY rather than realism -- at 58
 *     "the glint's saturated core was a tenth of the frame across, a second bright object competing with the
 *     interior".
 *   - the RIM IS NOT A RING: 55 per cent everywhere plus 45 per cent on the side AWAY from the key, "which is
 *     the wrap light every product photograph of a glass object has" -- and that asymmetry FLATTENS toward
 *     0.88 on paper, where the rim stops being lighting at all and becomes the refracted edge of a clear
 *     sphere, which goes all the way round.
 *   - the RIM EXPONENT MOVES WITH THE GROUND, mix(3.9, 5.4, paper). 3.9 is fitted against a capture rather
 *     than chosen: "at 3 the rim is a broad wash that reads as the body being lit from behind. At 3.9 the
 *     light lives in the outer eighth." It tightens on paper "where a dark edge has to be FINE to read as an
 *     edge rather than as a dirty ring".
 *   - the ENVIRONMENT term, and kit.ts's rule for it is that "if you can see it, it is wrong": fourteen per
 *     cent on the rim, read straight off the surface normal. IT IS A VALUE GRADIENT AND NOT A COLOUR ONE, on
 *     purpose -- "a second hue arriving through a term nobody dialled would break the one-hue-family law from
 *     underneath" -- AND IT INVERTS ON PAPER, so the top of the sphere is the lighter half of its edge on both
 *     grounds.
 *
 * AND THE CONTACT GLOW, which this port had no equivalent of whatsoever. It lives OUTSIDE the silhouette --
 * (1 - m) is zero underneath the body and rises through the edge -- and it pools DOWNWARD rather than evenly,
 * because kit.ts says its job "is to stop the silhouette meeting the ink as a cut line, not to be a halo
 * anybody notices". 0.13 body units of width, down from 0.20, where "the bloom was wide enough to read as a
 * second disc around the body".
 */
export function mhSurface(b, t, small, inkRgb, tilt, rimKIn, specK, glowK) {
    const paper = mhPaper(inkRgb);
    const rimK = rimKIn * (1 + (1.32 - 1) * paper);

    // THE BARELY COUNTER-MOVE: tilting the device turns the ORB relative to the room, so the catchlight shifts
    // AGAINST the tilt -- the world stays put while the object turns. A fifth of what the interior does, and
    // kit.ts says it is "meant to be subliminal".
    const k = mhKey(t);
    const H = norm3([k[0] - tilt[0] * (MH_TILT * 0.20),
                     k[1] - tilt[1] * (MH_TILT * 0.20),
                     k[2] + 1.0]);
    const nh = Math.min(1, Math.max(0, dot3(b.N, H)));
    const tight = 96.0 + (16.0 - 96.0) * small;
    const skyN = 0.5 - 0.5 * Math.min(1, Math.max(-1, b.N[1]));
    const spec = (Math.pow(nh, tight) + 0.09 * Math.pow(nh, 4.0)) * b.m * specK
               * (0.92 + (1.08 - 0.92) * skyN);

    const nxy = Math.hypot(b.N[0] + 1e-4, b.N[1] + 1e-4);
    const kxy = Math.hypot(0.42, 0.50);
    const align = Math.min(1, Math.max(0, ((b.N[0] + 1e-4) * 0.42 + (b.N[1] + 1e-4) * 0.50) / (nxy * kxy)));
    let wrap = 0.55 + 0.45 * align;
    wrap = wrap + (0.88 - wrap) * paper;

    const envRim = (0.86 + (1.14 - 0.86) * skyN) + ((1.14 + (0.86 - 1.14) * skyN) - (0.86 + (1.14 - 0.86) * skyN)) * paper;
    const rim = Math.pow(b.fres, 3.9 + (5.4 - 3.9) * paper) * b.m * wrap * rimK * envRim;

    const outr = (b.rho - b.Rd) / 0.13;
    const pool = 0.55 + 0.55 * smoothstep(-0.25, 0.85, b.P[1]);
    const glow = Math.exp(-outr * outr) * (1 - b.m) * pool * glowK;

    return { rim, spec, glow };
}

/**
 * THE SPECIES' OWN THREE SURFACE NUMBERS, transcribed from each hero's own mh_surface call site rather than
 * invented. Each entry is [rimBase, rimVoice, specBase, specVoice, glowK] so that a species whose rim or
 * specular rises with voice carries that as data instead of a branch.
 *
 * *** TWO OF murmur's FILES EACH CLAIM THE HIGHEST RIM IN THE COLLECTION, AND ONLY ONE OF THEM IS RIGHT. ***
 * still.ts: "THE HIGHEST RIM AND SPECULAR IN THE COLLECTION: with no interior to protect, the edge and the
 * highlight are free to be the figure." abyss.ts: "1.70 is the highest in the collection, which is right:
 * this is the hero with the least else." Measured over this table, abyss wins the rim at every voice (1.70
 * against 1.15 at rest, 2.25 against 1.60 at full) and still wins the SPECULAR outright (1.30 against
 * nebula's 0.98). still.ts's sentence bundles the two together and is half wrong; the gate asserts both
 * halves rather than repeating either file's word for it.
 */
/**
 * EACH SPECIES' OWN BODY, transcribed from its mh_shape call rather than assumed.
 *
 * *** NOT ONE OF THE EIGHTEEN HAS amp = 0, AND THIS PORT TREATED THREE OF THEM AS SPHERES UNTIL v4632. ***
 * A v4626 note said still, limn and comet "are not standing on different geometry -- they are on the amp = 0
 * case of this one". That is a true statement about mh_body and a false one about those species: their amps
 * are 0.018, 0.020 and 0.024. Measured over 2,000 directions the deformed radius strays 3.06%, 3.40% and
 * 4.08% of the radius -- about half a pixel at 48 px, and MOVING, since the three axes turn on periods of 76,
 * 103 and 134 seconds.
 *
 * [ampBase, ampBreath, breathPeriod, gain]. A species with ampBreath 0 has a fixed amplitude; droplet is the
 * one whose amplitude comes from its own knobs instead and is not in this table.
 */
/**
 * *** SUCCESS: THE INTERIOR IGNITES AND SETTLES, AND EVERY ONE OF THE EIGHTEEN DOES IT. *** kit.ts calls this
 * "this family's flash", and it is the one state whose physics is shared outright: "The light in a success is
 * NOT an overlay: every species multiplies its own interior energy by (1 + complete), which brightens exactly
 * what is already there and leaves the dark dark."
 *
 * THE SETTLE IS THE TAIL OF IT, and it is the half that is genuinely universal: nineteen sites across the
 * eighteen sources, each `(1 + k * st.settled)` on an interior, with k drawn from a five-value set. Ported as
 * a TABLE for the same reason MH_SHAPE is one -- a constant per species, read off each file rather than
 * averaged, so a gate can assert the roster instead of a copy of this tree's own guess at it.
 *
 * TWO OF THE NINETEEN ARE NOT INTERIOR MULTIPLIERS AND ARE CARRIED AS THEMSELVES:
 *   comet   has TWO -- 0.25 on its headBright, which is the point of light itself, and 0.20 on the interior.
 *           The species whose subject is one bright point spends its settle on the point first.
 *   droplet has an ADDITIVE one: coreBright = 1 + 0.85 * live.voice + 0.35 * st.settled, so the settle lands
 *           beside the voice in a brightness rather than on a marched accumulation. Transcribed, not
 *           normalised into the others' shape -- droplet is the hero whose body IS the subject and its core
 *           brightness is not an interior gain.
 */
export const MH_SETTLED = Object.freeze({
    still: 0.22, limn: 0.30, comet: 0.20, droplet: 0.35, opal: 0.22, abyss: 0.26,
    nebula: 0.20, tempest: 0.20, fathom: 0.20, geode: 0.22, arc: 0.22, sol: 0.20,
    aura: 0.22, flux: 0.22, duet: 0.20, chorus: 0.22, prism: 0.22, helix: 0.22,
});
/** comet's SECOND settle, on the head rather than the interior -- see MH_SETTLED's note. */
export const MH_SETTLED_COMET_HEAD = 0.25;

/**
 * *** THE SEVENTEEN WHOSE SETTLE IS AN INTERIOR GAIN, WHICH IS MH_SETTLED MINUS DROPLET. ***
 *
 * Derived rather than hand-written so a change to a species' number cannot make the two tables disagree, and
 * it exists at all because the alternative was a conditional. render/aiPresenceOrbTsl.mjs applies the settle
 * at the ONE site all eighteen interiors pass through, and droplet has to be excluded there -- its settle is
 * an ADDITIVE term on coreBright, at its own site. That exclusion first shipped as
 * `species === "droplet" ? 0.0 : MH_SETTLED[species]`, and a sabotage deleted the conditional and walked
 * through every gate in the round: droplet would have taken the settle TWICE and no instrument renders
 * droplet in SUCCESS. A missing key cannot be deleted by a tidying pass the way a ternary can, and a census
 * row can ask which key is missing and why, which is what tools/ship/murmurLive-selfcheck.mjs now does.
 */
export const MH_SETTLED_INTERIOR = Object.freeze(Object.fromEntries(
    Object.entries(MH_SETTLED).filter(([k]) => k !== "droplet")));

/**
 * *** THE OTHER HALF OF THE SUCCESS FLASH: IT BRIGHTENS WHAT IS ALREADY THERE -- v4658. ***
 *
 * kit.ts: "The light in a success is NOT an overlay: every species multiplies its own interior energy by
 * (1 + complete), which brightens exactly what is already there and leaves the dark dark." v4644 ported the
 * SHELL -- the gaussian ring that travels out along `sweep` -- and MH_IGNITE's own note says the rest spend
 * `complete` on their own figures. What neither said is that FOUR of them spend it at the ONE SITE ALL
 * EIGHTEEN INTERIORS PASS THROUGH, right beside the settle:
 *
 *     interior = acc.x * GAIN * b.m * mh_transmit(b.fres) * (1.0 + K * st.complete) * (1.0 + S * st.settled)
 *
 * and this port had the second factor and not the first. Counted in murmur's own eighteen files, exactly the
 * four below carry a complete factor on that line, and every other `st.complete` in the roster is somewhere
 * else -- a shell, a per-figure saturation, or a brightness of its own. THE RULE IS CHECKABLE RATHER THAN
 * REMEMBERED: the shared interior line is the one carrying `(1 + S * st.settled)`, so a site belongs here if
 * and only if its complete factor sits on that same line. tools/ship/murmurComplete-selfcheck.mjs holds it.
 *
 * A MISSING KEY AND NOT A ZERO, for MH_SETTLED_INTERIOR's reason: a table with fourteen zeroes in it reads
 * as "these species were considered and given nothing", which is false -- they spend their flash elsewhere.
 */
export const MH_COMPLETE_INTERIOR = Object.freeze({
    limn: 1.60, arc: 0.90, aura: 0.45, flux: 0.75,
});

/**
 * *** THE SATURATION: A FIGURE THAT IS PULLED TOWARD FULL RATHER THAN SCALED. ***
 *
 * Three species spend `complete` on a per-figure LIFE rather than on the interior, and all three spell it as
 * the same mix:
 *
 *     life = mix(life, target, st.complete * k)
 *
 * which is a saturation and not a gain: at complete = 1 the figure IS the target whatever it was before, so
 * a flash makes every flash/prominence/voice arrive together and the differences between them close. That is
 * the opposite of the interior factor above, which preserves every difference and scales them all.
 *
 * *** chorus's TARGET OVERSHOOTS AND THE OTHER TWO DO NOT, which is the one number here worth reading twice.
 * *** opal and sol mix toward 1.0; chorus mixes toward 1.0 + 0.45 * st.complete, so its seven voices go PAST
 * full at the peak of the flash. chorus.ts is the one species licensed a rhythm and the one whose subject is
 * an ensemble arriving together -- overshooting is how the arrival reads as louder than the parts.
 */
export const MH_COMPLETE_LIFT = Object.freeze({
    opal:   Object.freeze({ k: 0.85, over: 0.00 }),
    sol:    Object.freeze({ k: 0.85, over: 0.00 }),
    chorus: Object.freeze({ k: 0.90, over: 0.45 }),
});

/**
 * *** THE LAST OF st.complete: NINE NUMBERS ACROSS SEVEN SPECIES, AND NOT ONE OF THEM SHARES A SHAPE -- v4661.
 * ***
 *
 * v4658 took the four that sit on the shared interior line, the three saturations and sol's core gain. v4659
 * took the four ignition figures that turned out to be ONE shape on four axes. v4660 took the four that were
 * four shapes. What is left is the residue, and the residue is the point: every arc before this one found a
 * rule and wrote a table, and the temptation at the end of that is to look for a tenth rule. THERE IS NOT
 * ONE. These nine are nine lines in seven files, and the only thing they have in common is the signal.
 *
 * They are one table anyway, and the reason is the opposite of a rule: a constant per SITE, named for the
 * site, so a reader can see at a glance that the names do not rhyme. Four of the nine are not even the
 * family's `(1 + k * complete)` shape:
 *
 *   dropletCore  ADDITIVE, beside the voice and the settle on a brightness -- coreBright = 1 + 0.85*voice
 *                + 0.35*settled + 0.26*complete. droplet's body IS its subject and its core brightness is
 *                not an interior gain, which is the same reason MH_SETTLED.droplet is carried separately.
 *   limnRing     ADDITIVE AND GATED BY THE BAND: rimE += complete * band * 1.20, so the flash lands on the
 *                RING and nowhere else -- limn's arc brightens along its own edge rather than the whole
 *                volume brightening under it.
 *   chorusSync   ADDITIVE ON A CONTROL RATHER THAN ON ANY LIGHT: sync = clamp(syncK + 0.55*complete, 0, 1).
 *                chorus.ts: "That transition from many rhythms to one is the whole species." Its success is
 *                not the seven getting brighter -- it is the seven falling into phase. The only site in the
 *                roster where complete moves a PARAMETER of the species instead of an intensity.
 *   duetShrink   THE ONLY SUBTRACTION: rSep *= (1 - 0.62 * complete). duet.ts names all four terms on that
 *                separation in one line -- "Cadence closes it a little, responding a lot, the gesture
 *                briefly, and success all the way in" -- and this is the last of the four. Every other
 *                complete in the roster makes something larger or brighter; duet's brings the pair together.
 *
 * AND TWO SPECIES HAVE TWO EACH, which is why this is nine numbers and seven species rather than nine and
 * nine. limn spends one on its ring and one on its interior HINT -- the volume glowing where the arc's light
 * entered -- on top of the 1.60 it already has on the shared interior line, so limn carries THREE. duet
 * spends one on the flare and one on the shrink, in opposite directions at the same instant: the two lights
 * get brighter as they come together.
 */
export const MH_COMPLETE_SINGLE = Object.freeze({
    stillGlint: 0.85,     // (1 + k*complete) on the solved glint -- the one event in still's frame
    cometHead: 2.20,      // (1 + k*complete) on headBright, beside its own 0.25 settle. The largest in the roster.
    dropletCore: 0.26,    // ADDITIVE on coreBright
    limnRing: 1.20,       // ADDITIVE and band-gated: rimE += complete * band * k
    limnHint: 0.90,       // (1 + k*complete) on the interior hint's amount -- limn's SECOND interior
    duetFlare: 1.15,      // (1 + k*complete) on each of the pair's solved lights
    duetShrink: 0.62,     // (1 - k*complete) on the separation -- the only SHRINK in the roster
    chorusSync: 0.55,     // ADDITIVE on the SYNC KNOB, not on a light
    prismBeam: 1.10,      // (1 + k*complete) on brightP, which beams AND the hue numerator both read
});

/** sol's SECOND complete, on the core's brightness rather than a figure -- sol.ts line 91. */
export const MH_COMPLETE_SOL_CORE = 0.55;

/**
 * The saturation itself, so the three callers share one spelling and there is a pair to grade. `over` is
 * chorus's overshoot and is 0 for the other two, which makes the target 1.0 exactly.
 */
export function mhCompleteLift(x, complete, k, over) {
    const t = 1.0 + over * complete;
    return x + (t - x) * (complete * k);
}

/**
 * *** THE IGNITION's OTHER SHAPE: A GAUSSIAN THAT TRAVELS ALONG THE SPECIES' OWN AXIS -- v4659. ***
 *
 * MH_IGNITE's shell is a ring in |p|: it leaves the heart and reaches the surface, and seven species run it.
 * Four more run the SAME arithmetic on a coordinate of their own instead, and it took reading all eight of
 * the remaining figures side by side to see that they are one shape and not four:
 *
 *     r = (coord - mix(lo, hi, st.sweep)) / width;   figure += st.complete * (flat + gain * exp(-r*r))
 *
 * arc runs it along `th`, the angle round its own arc; flux along q.x, the length of its stream; prism along
 * s1, the distance out its beams; helix along q.y, the height of its strands. The axis is whatever that
 * species is built along, which is why this is a different table from the shell rather than four more rows
 * in it -- the shell's coordinate is |p| for everybody.
 *
 * *** EACH ONE IS THE SPECIES' OWN GESTURE FIGURE, RUN ON `sweep` AND DRAWN TIGHTER. *** arc's flourish
 * pulse is the same expression at width 0.34 and the ignition is 0.30; flux 0.42 against 0.38; prism 0.28
 * against 0.26. The success is the gesture the species already performs, once, travelling the whole length
 * and a little sharper -- which is a design statement the port can now make because both are here.
 *
 * `lo` and `hi` are in the species' own units, and arc's are a FRACTION of its own span: its ends are
 * -span and +span, where span is a runtime value from the arc's extent, so its entry carries -1 and 1 and
 * its call site multiplies. helix is the only one with a `flat` term: 0.35 of the flash reaches the whole
 * strand whether or not the gaussian does, so the ignition lifts the figure everywhere and brightens hardest
 * where the front is.
 */
export const MH_IGNITE_AXIS = Object.freeze({
    arc:   Object.freeze({ lo: -1.00, hi: 1.00, width: 0.30, gain: 1.80, flat: 0.00, spanScaled: true,  gestureW: 0.34 }),
    flux:  Object.freeze({ lo: -1.00, hi: 1.00, width: 0.38, gain: 1.70, flat: 0.00, spanScaled: false, gestureW: 0.42 }),
    prism: Object.freeze({ lo:  0.00, hi: 2.10, width: 0.26, gain: 1.60, flat: 0.00, spanScaled: false, gestureW: 0.28 }),
    helix: Object.freeze({ lo: -1.00, hi: 1.00, width: 0.26, gain: 2.10, flat: 0.35, spanScaled: false, gestureW: 0.00 }),
});

/**
 * The travelling gaussian itself. Returns what the flash ADDS to the species' figure, which is 0 at
 * complete 0 for every coordinate -- the property that keeps every non-SUCCESS frame where it was.
 */
export function mhIgniteAxis(coord, complete, sweep, lo, hi, width, gain, flat) {
    const r = (coord - (lo + (hi - lo) * sweep)) / width;
    return complete * (flat + gain * Math.exp(-r * r));
}

/**
 * *** THE LAST FOUR IGNITION FIGURES, WHICH REALLY ARE FOUR SHAPES -- v4660. ***
 *
 * v4659 found that four of the eight remaining figures were one shape on four different axes. These four are
 * not: each does something the others do not, and reading them together is what says so.
 *
 *   aura   A VON MISES IN THE ANGLE, not a gaussian, and aura.ts gives the reason in one line: "it wraps
 *          with no seam: a seam here would be a dark notch running across all three ribbons at once". It is
 *          the only figure in the roster that spends `sweep` as a position going ROUND something. exp(k*(cos
 *          x - 1)) is a function of cos alone and is therefore periodic by construction -- the same argument
 *          limn's arc profile makes, and the same one that got a gaussian thrown out there.
 *   fathom THE SHELLS LIGHT IN SEQUENCE, outermost first. Each shell has a `turn` -- (2-k)*0.33 -- and a
 *          triangular window in the sweep around it, so the flash passes through the nest from outside in.
 *          The only figure keyed on WHICH PART of the species it is, rather than on where the part is.
 *   geode  A FLAT LIFT, complete * 0.70, with no sweep at all. geode's light is a facet term on a normal;
 *          there is no path for a front to travel along, so the stone simply brightens. It is in the table
 *          because a reader who found three travelling figures and one absence would assume the fourth was
 *          missing.
 *   comet  THE ONLY ONE THAT ADDS NO LIGHT. It lengthens the trail instead: decay = mix(decay, 9.0, sweep),
 *          and decay sits in the DENOMINATOR of exp(-age/decay), so a larger one fades slower and the orbit
 *          fills in behind the head out to wherever the sweep has reached. The flash is the path becoming
 *          visible, which is the one thing comet has that nothing else does.
 *
 * *** comet's DECAY LINE CARRIES TWO MORE TERMS THIS PORT NEVER HAD, on the same line. *** comet.ts spells
 * it (1.30 + 2.60*trailK) * (1 + 1.25*st.drive) * mix(1.0, 0.40, small) -- so the lean LENGTHENS the trail
 * and the small mounts shorten it to two fifths. Both are bounded multipliers on a decay rather than on a
 * clock, so neither can teleport anything and both go in as murmur spells them.
 */
export const MH_IGNITE_LAP = Object.freeze({ flat: 0.18, gain: 0.80, k: 2.40 });
export const MH_IGNITE_TURN = Object.freeze({ step: 0.33, lead: 0.16, edge: 0.42, flat: 0.50, gain: 2.40 });
export const MH_IGNITE_FLAT_GEODE = 0.70;
export const MH_COMET_TRAIL = Object.freeze({ to: 9.00, driveK: 1.25, small: 0.40 });

/**
 * aura's ignition: a von Mises bump at the sweep's angle. Returns what the flash ADDS, which is 0 at
 * complete 0 for every angle. The bump is widest at the back -- exp(2.4*(cos-1)) is 1 at the centre and
 * 8.3e-3 at the far side -- so the ribbons are never fully dark behind it.
 */
export function mhIgniteLap(ang, complete, sweep, flat, gain, k) {
    return complete * (flat + gain * Math.exp(k * (Math.cos(ang - sweep * 6.2831853) - 1.0)));
}

/**
 * fathom's ignition: a triangular window in the sweep around this shell's own turn.
 *
 * *** THE PARAMETER IS turnIndex AND NOT k, AND THE FIRST DRAFT OF THIS NOTE HAD IT BACKWARDS. *** fathom.ts
 * writes turn = float(2 - k) * 0.33, so the shell with k = 2 has turn 0 and its window is centred at sweep
 * 0.16 -- it lights FIRST. k = 2 is the INNERMOST shell: MH_FATHOM's weights fall away inward (1.00, 0.74,
 * 0.52) with k = 0 the outer. So the flash starts at the middle of the nest and travels OUTWARD, which is
 * the same direction mh_ignite's shell runs and the same thing fathom.ts's own comment says. Passing k here
 * instead of 2 - k reverses the species, and it reverses it into something that still looks like an
 * ignition -- which is why the gate measures the ORDER the three peak in rather than that they peak.
 */
export function mhIgniteTurn(turnIndex, complete, sweep, step, lead, edge, flat, gain) {
    const x = Math.abs(sweep - turnIndex * step - lead) / edge;
    const t = Math.min(1, Math.max(0, x));
    const w = 1.0 - t * t * (3.0 - 2.0 * t);
    return complete * (flat + gain * w);
}

/**
 * *** THE IGNITION SHELL: A GAUSSIAN RING THAT LEAVES THE HEART AND REACHES THE SURFACE. ***
 *
 * kit.ts: "`sweep` is the same window read as a POSITION, 0 to 1 over 0.95 s, and it is what each species runs
 * the ignition ALONG." Seven of the eighteen run it as a shell down the marched ray, and they run it as ONE
 * formula with four constants:
 *
 *     sr = (|p| - mix(lo, hi, sweep)) / width;   e += complete * gain * exp(-sr * sr)
 *
 * so the ring starts at `lo` (the heart) and ends at `hi` (the surface, or just past it), `width` is how thick
 * the shell is in body units, and `gain` is how much light it carries. The other eleven species spend
 * `complete` on their own figures instead -- arc on its filament, limn on its rim, aura on its ribbons -- and
 * those are per-species transcriptions rather than this one shape, which is why they are not in this table.
 *
 * *** TWO OF THE SEVEN ALSO PRE-MULTIPLY THE WHOLE MARCH, and that is a different statement from the shell. ***
 * nebula and tempest do `e *= 1 + preK * complete` BEFORE adding the ring, so the entire cloud brightens and
 * then the ring travels through it; the other five brighten only along the ring. Carried as `preK`, zero where
 * the source has none, because a cloud lighting up whole is what those two species ARE.
 *
 * `into` records where the ring's light goes: five species add it to the march's own `e`, and droplet puts it
 * in a separate `shell` term that is summed with the medium before the fade -- its ring is a thing crossing
 * the water rather than more of the water.
 */
export const MH_IGNITE = Object.freeze({
    still:   Object.freeze({ lo: 0.02, hi: 0.95, width: 0.26, gain: 0.30, preK: 0.00, into: "e" }),
    opal:    Object.freeze({ lo: 0.02, hi: 1.00, width: 0.24, gain: 0.30, preK: 0.00, into: "e" }),
    abyss:   Object.freeze({ lo: 0.02, hi: 1.00, width: 0.26, gain: 0.42, preK: 0.00, into: "e" }),
    droplet: Object.freeze({ lo: 0.05, hi: 1.00, width: 0.20, gain: 0.34, preK: 0.00, into: "shell" }),
    duet:    Object.freeze({ lo: 0.02, hi: 1.00, width: 0.22, gain: 0.26, preK: 0.00, into: "e" }),
    nebula:  Object.freeze({ lo: 0.02, hi: 1.05, width: 0.24, gain: 0.50, preK: 0.65, into: "e" }),
    tempest: Object.freeze({ lo: 0.02, hi: 1.05, width: 0.24, gain: 0.55, preK: 0.70, into: "e" }),
});

/**
 * The shell's own profile, WITHOUT the species' gain: complete * exp(-((|p| - mix(lo, hi, sweep)) / width)^2).
 *
 * The gain is left to the caller because two of the seven multiply it by their own local density as well
 * (nebula and tempest spend it `* dens`), and folding a gain in here would make those two look like the other
 * five with a different number rather than like what they are.
 */
export function mhIgnite(pLen, complete, sweep, lo, hi, width) {
    const sr = (pLen - (lo + (hi - lo) * sweep)) / width;
    return complete * Math.exp(-sr * sr);
}

/**
 * *** THE RESPONDING LEAN: THE WANDER ACQUIRES A HEADING. ***
 *
 * st.drive is mh_state's fourth output, ramping in over half a second "so entering the state is a lean and
 * not a jolt", and its 45 references across murmur's eighteen sources do three different things. This table
 * holds the first: SIX species take a direction that is otherwise hashed, random or slowly tumbling, and mix
 * it toward a FIXED unit vector. still.ts: "Under drive the lines converge on one axis, so an occasional
 * wander becomes a traverse." abyss.ts: "under drive they all take one heading and the abyss becomes a
 * current." opal.ts, of its own lean: "a procession, not a swarm."
 *
 * *** THE SIX ARE TWO FAMILIES AND THE SIGN OF z IS WHAT SEPARATES THEM. ***
 *
 *     still    (0.92, -0.18,  0.35)   mix into a hashed glint path      k 1.00
 *     abyss    (0.90, -0.22,  0.37)   mix into three hashed lanes       k 0.80
 *     sol      (0.86, -0.32,  0.39)   mix into a tumbling prominence    k 0.70
 *     droplet  (0.92,  0.20,  0.34)   a FLOW through the silhouette     k 0.30
 *     ---------------------------------------------------------------------------
 *     nebula   (0.86,  0.24, -0.45)   ADVECTION of the whole domain     k 0.42
 *     tempest  (0.88,  0.20, -0.43)   the same, on the second cloud     k 0.50
 *
 * The four above the line all point INTO the screen's near half (+z, toward the viewer in this port's frame)
 * and three of the four lean DOWN. The two below point the other way in depth: the volumetric pair stream
 * AWAY. That is not a stylistic accident -- a cloud advecting toward the viewer would grow across the frame
 * and read as an approach, where a point of light travelling toward it reads as attention.
 *
 * *** AND `wired` IS A RECORD OF WHAT THIS ROUND DID NOT DO, GUARDED RATHER THAN WRITTEN IN PROSE. ***
 * nebula's and tempest's headings are spelled `adv = V * (st.drive * k * t)` -- a displacement PROPORTIONAL
 * TO ELAPSED TIME -- so a drive that ramps while t is large advects the domain by t * k * dDrive in one
 * frame. That is exactly the shape v4650 repaired on the host side of this same orb, where entering
 * RESPONDING after a minute of idle moved the clock 2.902 s in one frame and after half an hour 86.191 s.
 * This round wires only terms that are a DIRECTION or a SIZE and touches nothing that multiplies a clock, so
 * those two are carried here with their numbers and marked unwired; tools/ship/murmurDrive-selfcheck.mjs
 * asserts that exactly the `wired` entries are read by the shader builder, so the day somebody wires them the
 * census goes red and this note gets read.
 */
/**
 * *** AND `pre` IS NOT A TIDYING FLAG: NOT ONE OF THESE SIX VECTORS IS A UNIT VECTOR. ***
 *
 * Measured: still 1.000650, abyss 0.997647, sol 0.997046, droplet 1.001000, nebula 0.999850, tempest
 * 0.999650 -- hand-picked numbers, off unit by as much as 0.295%. That would be a curiosity except that
 * murmur normalizes them INCONSISTENTLY, and the inconsistency changes the answer at partial drive:
 *
 *   still, abyss   normalize(mix(wander, V, a))              -- V goes in RAW
 *   sol            normalize(mix(dir, normalize(V), a))      -- V is normalized FIRST
 *   droplet        flowDir = normalize(V)                    -- not a mix at all, a direct assignment
 *
 * Mixing toward a 0.997-long vector is not the same direction as mixing toward its unit version anywhere
 * except a = 0 and a = 1, which is every frame of the ramp that RESPONDING is made of. Transcribed per
 * species rather than normalised into one spelling, the same call this port made for opal's two prose
 * periods, MH_SCATTER_K's 3.2 against 0.098 and droplet's 0.339 against 0.34177.
 */
export const MH_DRIVE_HEADING = Object.freeze({
    still:   Object.freeze({ v: Object.freeze([0.92, -0.18, 0.35]), k: 1.00, pre: false, wired: true }),
    abyss:   Object.freeze({ v: Object.freeze([0.90, -0.22, 0.37]), k: 0.80, pre: false, wired: true }),
    sol:     Object.freeze({ v: Object.freeze([0.86, -0.32, 0.39]), k: 0.70, pre: true,  wired: true }),
    droplet: Object.freeze({ v: Object.freeze([0.92,  0.20, 0.34]), k: 0.30, pre: true,  wired: true }),
    // wired at v4662 -- see MH_ADVECT_SIGN. These two do not point a path at V, they carry the whole cloud
    // along it, and the displacement is k * driveInt rather than murmur's k * drive * t.
    nebula:  Object.freeze({ v: Object.freeze([0.86,  0.24, -0.45]), k: 0.42, pre: false, wired: true }),
    tempest: Object.freeze({ v: Object.freeze([0.88,  0.20, -0.43]), k: 0.50, pre: false, wired: true }),
});

/**
 * *** THE LAST TWO BARE `rate * t` SITES IN THE ROSTER, AND BOTH ARE ABSENCES RATHER THAN TELEPORTS --
 * v4662. ***
 *
 * v4654 chose to integrate rather than transcribe, and v4655-v4657 took the four mechanisms that were
 * already MOVING in this port: the rates handed to mh_drift, the rates that multiply mh_drift's whole
 * result, the flourish slot divisors, and the two rates that are products. What was left were two sites
 * where murmur's rate moves and THIS PORT'S DOES NOT -- so there was no teleport here to repair, only a
 * signal that never arrived. An absence is not findable by any census that hunts for signals: these two
 * came out of reading opal.ts and geode.ts against this file, which is the same instrument that found
 * helix's climb at v4655.
 *
 * ADDING THEM AS murmur SPELLS THEM WOULD HAVE SHIPPED TWO NEW TELEPORTS, at the end of an arc whose whole
 * subject was removing them. Adding them in the integrated form costs nothing new: both rates are SUMS of
 * the conditioned signals, the three integrals are already sent to the shader, and the reduction at a held
 * signal is exact -- so neither moves a recorded frame.
 */
export const MH_OPAL_DRIFT = Object.freeze({ base: 0.055, knob: 0.075, pace: 0.75, drive: 0.95 });

/**
 * *** geode's IS A MIX AND NOT A PRODUCT, WHICH IS WHY ITS COEFFICIENT IS DERIVED HERE RATHER THAN WRITTEN
 * DOWN. ***
 *
 * geode.ts spells the spin as mix(mh_drift(t, 0.088*sp, ...), t * 0.30 * sp, st.drive * 0.70): under drive
 * the stone stops wobbling around its own slow turn and takes a faster, steadier one. The secular half
 * expands to
 *
 *     0.088*sp*t*(1 - 0.70*d) + 0.30*sp*t*0.70*d  =  0.088*sp*t * (1 + ((0.30*0.70)/0.088 - 0.70) * d)
 *
 * -- sp cancels, and the drive coefficient is 1.686364, which is 0.1484 of absolute rate. THAT NUMBER IS
 * NOT ONE murmur WROTE. Writing 1.686364 into a table would present a derived quantity as a transcription,
 * and the next reader could not check it against geode.ts without re-deriving it; worse, a later edit to
 * `to` or `w` would leave it silently stale. So the two numbers murmur DID write are the table, the
 * coefficient is a function of them and of the species' own rate, and
 * tools/ship/murmurClock3-selfcheck.mjs grades the identity against murmur's mix at held drive rather than
 * against this arithmetic restated.
 *
 * THE WOBBLE IS MIXED TOO AND IT STAYS INSTANTANEOUS, which is v4655's rule and not a new decision: the mix
 * scales mh_drift's whole result by (1 - w*d), so the wobble amplitude is (1 - w*d) * k*rate/w2 -- bounded
 * by construction, it cannot accumulate, and only the secular half needed the integral.
 */
export const MH_GEODE_SPIN = Object.freeze({ to: 0.30, w: 0.70 });
//
// *** THE FUNCTION THAT USED TO LIVE HERE IS GONE, AND ITS REMOVAL IS THE POINT -- v4668. *** v4662 shipped
// mhGeodeSpinDrive(rate, to, w) = (to*w)/rate - w, which is the drive coefficient of this same mix WHEN THE
// SPEED FACTOR IS 1. That was true of this port because the port had no speed factor; it was never true of
// geode.ts, which multiplies both arms by sp. Leaving it exported once the shader stopped calling it would
// have left a gate grading a helper no picture depends on -- a reference is only evidence about the thing it
// is actually applied to, and this tree has repaired that exact shape four times. mhSpMixCoef is the general
// form and the sp = 1 case falls out of it: B / base is (to - base) * w / base = (to*w)/base - w.

/**
 * *** geode's SECOND DRIVE SITE, WHICH NO ROUND HAD LOOKED FOR -- v4668. *** geode.ts line 64:
 * `ax = mix(0.34 + 0.22 * sin(t * 0.041), 0.30, st.drive * 0.7)` -- the stone stops NODDING under drive at
 * the same moment it stops wobbling. v4664's st.drive audit passed this site because it counts COEFFICIENTS
 * and 0.70 was already present in MH_GEODE_SPIN, which is exactly the weakness that audit states about
 * itself: a number being present does not prove it is on the right expression. Measured at full drive the
 * tilt's swing falls from +/-0.22 rad to +/-0.066 and its centre rises from 0.34 to 0.312.
 *
 * NO CLOCK AND NO INTEGRAL: the rate 0.041 is a style constant, nothing conditioned multiplies t, and the
 * mix moves an ANGLE rather than a phase. It is in this round because it is geode's, not because it shares
 * the arithmetic.
 */

/**
 * *** AND THE ADVECTION: THE LAST TWO `wired: false` ENTRIES IN MH_DRIVE_HEADING -- v4662. ***
 *
 * nebula and tempest do not point a path at the heading the way still and abyss do; they carry the whole
 * CLOUD along it. nebula.ts spells adv = V * (st.drive * k * t) and displaces the medium's sample point by
 * it, so under drive the field streams past in one direction instead of turning over in place.
 *
 * *** IT WAS HELD BACK FOR ONE REASON AND THAT REASON IS GONE. *** v4653 recorded it as "the same hazard
 * wearing the heading family's clothes" -- a displacement proportional to elapsed time, which jumps by
 * t * dDrive the instant drive moves, exactly like every rate this arc has repaired. The integral of
 * drive * k dt IS k * driveInt, the host has been accumulating it since v4654, and the substitution is one
 * argument. A census row in tools/ship/murmurDrive-selfcheck.mjs was set to go RED the day anyone wired
 * these two, so that the note would be read before the jump shipped; it fires on this round by design, and
 * the answer it gets is that the jump is not being shipped.
 *
 * THE SIGN IS A DECISION AND IT IS STATED: the sample point is displaced by MINUS the advection, so the
 * pattern APPEARS to move along +V. Sampling at p + adv would move the cloud the other way for the same
 * arithmetic, and V is the same vector the heading family leans toward -- a cloud leaning one way while
 * still and abyss lean the other would be a different design, not a sign convention.
 */
/**
 * *** tempest's ENERGY WAS THE WRONG SIGNAL ENTIRELY, FOR AS LONG AS THIS PORT HAS HAD A tempest. ***
 *
 * tempest.ts: `energy = clamp(0.85 * live.pace + 0.65 * think + 0.55 * st.drive, 0.0, 1.6)`, and the file
 * says what it is for in the line above it: "THINKING IS THIS SPECIES' HOME STATE, so it is read directly
 * rather than through mh_state, which only designs success and responding. A storm that rises while the
 * assistant thinks is the whole concept."
 *
 * THIS PORT SPELLED IT `clamp(0.85 * voice, 0, 1.6)`. The coefficient is right and the SIGNAL is not: the
 * storm rose when somebody spoke and did nothing at all while the assistant thought, which is the one thing
 * tempest is about. It reached four sites -- the fold, the drift's whole output, both bolt slot divisors and
 * the flicker amplitude -- so every one of them has been reading the wrong input.
 *
 * *** `think` IS A STATE INDICATOR AND NOT A CONDITIONED SIGNAL, AND IT NEEDS ITS OWN INTEGRAL. *** It is
 * 1 in THINKING and 0 everywhere else, so it is a square wave the host can accumulate exactly like the
 * other three -- `thinkInt` is the time spent in THINKING, in shader time. The drift and the slot divisors
 * are SECULAR and read the integral; the fold and the flicker are instantaneous and read `energy` itself.
 * That is v4654's split applied to a fourth signal rather than a new idea.
 */
export const MH_TEMPEST_ENERGY = Object.freeze({ pace: 0.85, think: 0.65, drive: 0.55, cap: 1.6 });

/** THINKING is murmur's state index 2, read directly -- see MH_TEMPEST_ENERGY. */
export const MH_THINKING_INDEX = 2;

/**
 * *** droplet's TREMOR AMPLITUDE IS THE CADENCE, and this port passed a constant. *** droplet.ts:
 * `mh_shape(wob, 0.012 * live.pace * tremGate, 3.30)` -- the ripple on the drop's surface is proportional
 * to the cadence and is gated to nothing when it would alias. An AMPLITUDE and not a clock, so there is no
 * integral here and nothing can teleport: this is a transcription in the plainest sense.
 */
export const MH_DROPLET_TREM = 0.012;

/**
 * *** fathom's AND geode's SHARED `sp`: ONE FACTOR ON EVERY ONE OF THE SPECIES' OWN CLOCKS. ***
 *
 * fathom.ts: `sp = (1.0 + 0.85 * live.pace + 1.10 * st.drive)`, then `a0 = mh_drift(t, 0.085 * sp, ...)`.
 * geode.ts:  `sp = (1.0 + 0.80 * live.pace + 1.00 * st.drive)`, then the spin mix MH_GEODE_SPIN describes.
 * Neither signal was in this port at all: both species turned at one fixed speed whatever the orb did.
 *
 * *** v4663 WIRED ONLY fathom's FIRST SHELL, AND v4668 WIRED THE REST. *** a0's rate is `0.085 * sp` -- a
 * clean SUM of the conditioned signals, which mhRatePhase integrates exactly. fathom's a1 and a2, and
 * geode's spin, are MIXES of two speed-factored arms by `st.drive * 0.7`, whose rate carries a term in drive
 * SQUARED; that integral is not driveInt squared and was not among the six the host sent. The expansion is
 * mhSpMixCoef's and the accumulator is driveSqInt. It was held for a round rather than approximated because
 * an `sp` folded into the mix without its cross terms is not murmur's number at any partial drive, and
 * partial drive is every frame of the ramp that RESPONDING is made of -- measured, fathom's second shell at
 * the ramp's own 0.568 turns at 0.006679 rad/s with the cross terms and 0.058100 without.
 *
 * *** AND THE MIX ITSELF WAS ABSENT, WHICH IS THE LARGER HALF OF THE MISS. *** Before v4668 this port's a1
 * and a2 were plain `mh_drift(t, rate, wob, lane)` at murmur's rates -- no sp, no mix, no drive. So the
 * second and third shells turned at one fixed speed in one fixed direction whatever the orb did, while
 * murmur pulls them onto the FIRST shell's turn as the orb responds. At full drive a1's rate is +0.096320
 * against this port's -0.062: the shell reverses, and the nest closes up into one turning thing.
 */
export const MH_FATHOM_SP = Object.freeze({ pace: 0.85, drive: 1.10, mixW: 0.70 });
export const MH_GEODE_SP = Object.freeze({ pace: 0.80, drive: 1.00, mixW: 0.70 });

/**
 * *** THE WARP LOOKUP TAKES HALF THE ADVECTION, AND v4662 GAVE IT ALL OF IT. *** nebula.ts and tempest.ts
 * both spell the two noise reads differently: `mh_noise3(p * warpScale + ... - adv * 0.5)` for the warp and
 * `p * scale + ... - adv` for the density. The warp is the noise that DISPLACES the coordinates the density
 * is read at, so carrying it at the same speed as the field it warps would move the two together and the
 * fold would stream without deforming. v4662 wired both at full and no row could tell -- the advection's
 * own gate measures that the FIELD moves and the BODY does not, which is true either way.
 */
export const MH_ADVECT_WARP = 0.5;

export const MH_ADVECT_SIGN = -1;

/**
 * *** RESPONDING HAS A THIRD THING AND THIS PORT HAD TWO OF THEM -- v4664. ***
 *
 * v4653 ported the HEADING (a swarm acquires an axis) and the NARROWING (it stops scattering around it).
 * Read across murmur's eighteen sources, st.drive does a third thing at eight more sites, and every one of
 * them is the same idea in that species' own terms: THE PARTS ACT IN FORMATION.
 *
 *   aura    "responding pulls the tilts halfway toward a common one ... What drive actually does is make
 *           them travel together and faster, in formation." align = st.drive, alignT = 0.5 * align, and
 *           each ribbon's yaw and tilt mix toward 0.30 and 0.34 by alignT.
 *           *** THE ROLLS DO NOT ALIGN, AND aura.ts SAYS SO IN THE SAME BREATH: *** "The rolls -- which are
 *           what keeps the sheets in visibly different planes -- do not align at all." Three sheets that
 *           agreed on all three angles would be one sheet drawn three times.
 *   opal    "Responding brightens them in sequence along the procession axis" and "Under drive they all
 *           lean the same way: a procession, not a swarm." TWO mixes, both by st.drive outright: the life
 *           toward a travelling wave, and the wander toward a common lean.
 *   chorus  sync = clamp(syncK * 0.75 + 0.85 * st.drive + 0.55 * st.complete, 0, 1) -- the same knob the
 *           flash pushes, pushed by the lean as well. v4661 took the complete term and left this one.
 *   flux    "responding stills the turn and leans it": ay = mix(mh_drift(...), 0.42, st.drive * 0.6).
 *
 * AND THREE THAT ARE PLAIN BRIGHTNESS, which belong here because they are the same signal at the same
 * instant and nothing else in the roster carries them: arc's shimmer takes 0.75 * st.drive beside its
 * cadence term, flux's brightness 0.35 and prism's 0.55.
 *
 * *** NOT ONE OF THE EIGHT IS A CLOCK. *** Every one multiplies an amplitude, mixes toward a constant, or
 * moves a knob inside a clamp, so all eight read the INSTANTANEOUS drive and none of them has an integral.
 * After four rounds of integrating, that is worth stating rather than leaving the reader to check.
 */
export const MH_DRIVE_FORMATION = Object.freeze({
    // aura: the mix target for yaw and tilt, and the HALF that makes it a pull rather than a snap.
    auraHalf: 0.50, auraYaw: 0.30, auraTilt: 0.34,
    // opal: both mixes are by st.drive outright, so the constants here are the TARGETS they mix toward.
    opalLifeB: 0.30, opalLifeK: 0.70, opalPeriod: 5.2, opalLane: 1.4,
    opalKeep: 0.55, opalLean: Object.freeze([0.42, -0.10, 0.18]),
    // chorus: the sync knob's drive weight, beside v4661's complete weight of 0.55.
    chorusSync: 0.85,
    // flux: the yaw's mix weight and its target -- "stills the turn and leans it".
    fluxTurn: 0.60, fluxYaw: 0.42,
    // the three brightnesses
    arcShim: 0.75, fluxBright: 0.35, prismBright: 0.55,
});

/**
 * *** AND THE OTHER HALF OF THE LEAN: IT STOPS SCATTERING. ***
 *
 * A heading alone would be a swarm that happens to face one way. What makes murmur's RESPONDING read as
 * intent is that the spread collapses at the same time -- still and abyss narrow the LATERAL offset of their
 * hashed paths by the identical 0.70, so the lines converge on the axis they just acquired rather than
 * running parallel to it. Seven species carry a term of this kind and every one of them is a DISTANCE, an
 * ANGLE or a SHAPE PARAMETER; not one is a rate, which is why they are all in this round.
 *
 * Each field is murmur's literal coefficient and the operation is named, because they are not all the same
 * operation and folding them into one sign would lose that:
 *
 *   still.lateral   0.70  * (1 - k*drive)   on the glint path's sideways offset
 *   abyss.lateral   0.70  * (1 - k*drive)   the same, on all three lanes
 *   limn.tailK      0.30  / (1 + k*drive)   a DIVISOR on the tail lobe's concentration: the tail broadens
 *   limn.tailOff    0.30  - k*drive         SUBTRACTED from the tail's angular offset: it swings round
 *   arc.sway        0.55  * (1 - k*drive)   "Responding stills the wander and takes the bow out"
 *   arc.pin         0.40  * (1 - k*drive)   ...and the bow itself flattens
 *   duet.sep        0.34  * (1 - k*drive)   "Cadence closes it a little, responding a lot"
 *   prism.fan       0.62  * (1 - k*drive)   "THE FAN. Responding closes it"
 *   helix.r0        0.14  * (1 - k*drive)   the strands draw in toward the axis
 *   helix.turns     0.35  * (1 + k*drive)   ...and there are MORE of them: the one term here that GROWS
 *
 * helix is the reason the table carries signs rather than magnitudes: it narrows and winds at once, which is
 * a spring compressing rather than a thing shrinking, and a table of "how much smaller" could not say so.
 */
export const MH_DRIVE_FORM = Object.freeze({
    still:   Object.freeze({ lateral: 0.70 }),
    abyss:   Object.freeze({ lateral: 0.70 }),
    limn:    Object.freeze({ tailK: 0.30, tailOff: 0.30 }),
    arc:     Object.freeze({ sway: 0.55, pin: 0.40 }),
    duet:    Object.freeze({ sep: 0.34 }),
    prism:   Object.freeze({ fan: 0.62 }),
    helix:   Object.freeze({ r0: 0.14, turns: 0.35 }),
});

/**
 * The heading mix itself: normalize(mix(wander, V, drive * k)).
 *
 * It is a function rather than three transcriptions because three species spell it identically and the
 * NORMALIZE is the part worth owning -- mixing two unit vectors does not give a unit vector, and a port that
 * dropped the normalize would still point the right way while changing the SPEED along the path, which is a
 * different species. `pre` carries murmur's per-species choice of whether V is normalized BEFORE the mix;
 * see MH_DRIVE_HEADING's note, and note that it is not cosmetic. droplet is not a caller at all: its heading
 * goes into the body's flow deformation rather than into a direction it marches along.
 */
export function mhDriveHeading(wander, V, drive, k, pre = false) {
    let T = V;
    if (pre) { const n = Math.hypot(V[0], V[1], V[2]) || 1; T = [V[0] / n, V[1] / n, V[2] / n]; }
    const a = Math.min(1, Math.max(0, drive * k));
    const m = [wander[0] + (T[0] - wander[0]) * a,
               wander[1] + (T[1] - wander[1]) * a,
               wander[2] + (T[2] - wander[2]) * a];
    const len = Math.hypot(m[0], m[1], m[2]) || 1;
    return [m[0] / len, m[1] / len, m[2] / len];
}

export const MH_SHAPE = Object.freeze({
    still: Object.freeze([0.018, 0.006, 4.2, 1.12]),
    limn: Object.freeze([0.020, 0.000, 0.0, 1.05]),
    comet: Object.freeze([0.024, 0.000, 0.0, 1.30]),
    opal: Object.freeze([0.022, 0.008, 7.4, 1.22]),
    abyss: Object.freeze([0.019, 0.006, 14.1, 1.14]),
    // *** THE TWO VOLUMETRIC HEROES, AND THEIR DEFORMED RADII ARE A WARNING ABOUT THE ROW BELOW THEM. ***
    // nebula's spread is 3.74% -- the SAME figure opal's carries, to two decimals -- off a different
    // amplitude, a different breath period and a different gain. Two heroes can agree on the derived number
    // and be different shapes, which is exactly why murmurKit-selfcheck asserts that no two ENTRIES are
    // equal rather than that no two spreads are: a row built on the percentage would call these one species.
    nebula: Object.freeze([0.022, 0.008, 1.6, 1.25]),
    tempest: Object.freeze([0.023, 0.009, 9.2, 1.28]),
    // The two SOLVED-GEOMETRY heroes. They share an amplitude and a breath depth to three decimals and
    // differ only in lane and gain -- another pair the derived percentage cannot tell apart, and another
    // reason the row below grades ENTRIES rather than spreads.
    fathom: Object.freeze([0.021, 0.007, 5.3, 1.20]),
    // THE TWO LINE-DRAWING HEROES, and they are the widest-apart breath LANES in the table: sol's 12.9 is
    // more than twice arc's 6.1, which is the difference between a star that swells slowly and a stroke that
    // is laid down. Their gains, 1.20 and 1.24, are a hundredth apart from fathom's and geode's -- a fourth
    // and fifth pair the derived-percentage row could not tell from the others, and the last argument the
    // ENTRIES-not-spreads rule needed.
    arc: Object.freeze([0.021, 0.007, 6.1, 1.20]),
    sol: Object.freeze([0.022, 0.008, 12.9, 1.24]),
    // THE TWO SHEET HEROES, and their breath LANES are the widest-apart pair in the table after arc and sol:
    // aura's 0.4 against flux's 8.6, a factor of twenty-one. aura's body is asked to do almost nothing --
    // "This hero's business is inside, and a wobbling shell would compete with the ribbons for the same
    // attention" -- and its 1.35 gain is the LARGEST of the twelve, which is the same sentence read the other
    // way: a shell that deforms little needs a firmer edge to still be a shell.
    aura: Object.freeze([0.022, 0.008, 0.4, 1.35]),
    flux: Object.freeze([0.022, 0.008, 8.6, 1.22]),
    // THE LAST TWO OF THE SIXTEEN THIS PORT CARRIES, and they close the table's widest gap: chorus's breath
    // lane is 15.6 against duet's 3.1, a factor of five, which is a shell that swells once a quarter-minute
    // against a pair that breathes with its own orbit.
    duet: Object.freeze([0.023, 0.007, 3.1, 1.25]),
    chorus: Object.freeze([0.021, 0.008, 15.6, 1.20]),
    // THE LAST TWO, and with them the table carries all eighteen of murmur's heroes. prism's 2.4 is the
    // fastest breath in the set and helix's 10.4 sits mid-table -- and their gains are IDENTICAL at 1.20,
    // the fourth pair to share one, which is the last argument the ENTRIES-not-spreads rule ever needed.
    prism: Object.freeze([0.021, 0.007, 2.4, 1.20]),
    helix: Object.freeze([0.021, 0.007, 10.4, 1.20]),
    geode: Object.freeze([0.021, 0.007, 11.7, 1.22]),
});

/**
 * THE TWO VOLUMETRIC HEROES' OWN NUMBERS, in the kit rather than inline in the species file.
 *
 * *** INLINE, THESE CANNOT BE GRADED, AND THE SABOTAGE SWEEP PROVED IT TWICE IN ONE ROUND. *** v4634's first
 * cut kept them beside the march. Changing tempest's absorption from 3.60 to nebula's 3.10 -- the coefficient
 * nebula.ts calls "THE LINE" -- left every row in every murmur gate green, and so did swapping its density
 * curve. That is the same finding v4632 made about opal's life and abyss's slot, and the same answer: a
 * constant a gate can read is a constant a gate can grade.
 *
 * Every field is transcribed from murmur's own src/shaders/nebula.ts and tempest.ts:
 *
 *   scale/warp    the mist's own frequency, and the frequency of the noise that WARPS it
 *   foldB/foldK   the warp amplitude, base and knob
 *   drB/drK/lane  the weather's clock, fed to mh_drift
 *   dLo/dHi       the density smoothstep. tempest's lower edge sits FURTHER UP, which is what gives its
 *                 cloud real holes for its lightning to be seen against
 *   gLo/gK/gFar   lit from within: emission rises toward the middle of the body and absorption does not
 *   absorb        "NEARER FOLDS OCCLUDE FARTHER GLOW, and that sentence is a coefficient of 3.1"
 *   emitB/emitK   emission, base and knob
 *   gain          the interior multiplier
 */
export const MH_MIST = Object.freeze({
    // *** THE TWO CLOUDS' LIVE COEFFICIENTS ARRIVE AT v4663, AND THEY ARE NOT THE SAME SHAPE. *** nebula's
    // fold and drift read the three conditioned signals directly; tempest's read its own ENERGY, which is a
    // signal it builds out of them (see MH_TEMPEST_ENERGY). So the pair share a builder and a table and do
    // NOT share this: `foldPace` is nebula's and `foldEnergy` is tempest's, and each is 0 in the other.
    // A shared coefficient with two meanings is how the port ended up reading tempest's energy off voice.
    // foldSmall differs too -- 0.55 against 0.50 -- and the port carried one literal for both until v4663.
    nebula: Object.freeze({ scale: 2.20, warp: 1.30, small: 0.58, foldB: 0.30, foldK: 0.70,
                            foldPace: 0.75, foldEnergy: 0.00, foldSmall: 0.55,
                            drPace: 0.65, drVoice: 0.35, drDrive: 0.90, drEnergy: 0.00,
                            drB: 0.052, drK: 0.055, drLane: 2.0, dLo: -0.20, dHi: 0.30,
                            gLo: 0.30, gK: 0.95, gFar: 0.88, absorb: 3.10, emitB: 0.62, emitK: 0.85,
                            gain: 3.30, voiceE: 0.75 }),
    tempest: Object.freeze({ scale: 2.55, warp: 1.45, small: 0.55, foldB: 0.42, foldK: 0.80,
                             foldPace: 0.00, foldEnergy: 0.85, foldSmall: 0.50,
                             drPace: 0.00, drVoice: 0.00, drDrive: 0.00, drEnergy: 0.95,
                             drB: 0.070, drK: 0.075, drLane: 3.0, dLo: -0.12, dHi: 0.46,
                             gLo: 0.26, gK: 0.72, gFar: 0.90, absorb: 3.60, emitB: 0.58, emitK: 0.72,
                             gain: 6.20, voiceE: 0.85 }),
});

/**
 * FATHOM'S THREE NESTED SHELLS, and the numbers that make them read as measurement rather than as a target.
 *
 * fathom.ts: "three legible SURFACES at three radii, each one a thin translucent skin you can see the next
 * one through. What the eye gets from a cloud is atmosphere; what it gets from nested shells is measurement."
 *
 *   R/rk/w      each shell's base radius, its response to the `layers` knob, and its intrinsic weight. The
 *               weights FALL AWAY INWARD (1.00, 0.74, 0.52) because the outer shell is the one the light
 *               reaches first -- "equal weights made the innermost read as a solid ball inside two rings".
 *   rates       the three turning rates, and they are DELIBERATELY UNEQUAL and one of them NEGATIVE: the
 *               parallax is made of the difference, and "identical rates would be one shell drawn three
 *               times".
 *   order       the compositing order, [0,1,2,2,1,0]. A ray entering from outside meets the biggest shell
 *               first, then the middle, then the smallest, then the smallest again on the way out. The order
 *               is known in advance and cannot vary, so the transmittance is correct with NO SORTING.
 *   grazeFloor  the cap on the 1/cos amplification. A crossing near a shell's own limb passes through
 *               several times as much skin, which is what sells translucency; 0.26 stops it diverging.
 */
export const MH_FATHOM = Object.freeze({
    shells: Object.freeze([
        Object.freeze({ base: 0.70, rk: 0.06, w: 1.00, rate: 0.085, wob: 0.45, lane: 1.0 }),
        Object.freeze({ base: 0.50, rk: -0.02, w: 0.74, rate: -0.062, wob: 0.50, lane: 2.0 }),
        Object.freeze({ base: 0.30, rk: -0.06, w: 0.52, rate: 0.108, wob: 0.40, lane: 3.0 }),
    ]),
    order: Object.freeze([0, 1, 2, 2, 1, 0]),
    rCap: 0.74, thickB: 0.062, thickK: 0.035, foldB: 0.055, foldK: 0.055, grazeFloor: 0.26,
    litB: 0.40, litK: 0.60, eB: 0.42, eK: 0.58,
    shellGain: 4.30, murkGain: 3.20, medB: 0.030, medK: 0.075, medAbsorb: 1.80,
    absorbB: 1.05, absorbK: 1.55,
});

/**
 * GEODE'S CONVEX SOLID: four axes, eight planes, and the slab method.
 *
 * geode.ts opens by rejecting its own first build: "A FACET IS A PLANE, AND THE FIRST BUILD'S WASN'T. It
 * partitioned the volume by which of six DIRECTIONS a point was most aligned with ... the partition was then
 * integrated along the view ray, and integrating a hard-edged structure through five samples averages exactly
 * the angularity that was the point." Which is the same lesson comet's head and droplet's heart taught this
 * port, arriving a third time.
 *
 * THE OFFSETS DIFFER ON THE TWO SIDES OF EVERY AXIS, which is what makes the gem irregular rather than a
 * symmetric octahedron, and the AXES ARE OFF THE CARDINALS so the cut never looks machined.
 */
export const MH_GEODE = Object.freeze({
    axes: Object.freeze([Object.freeze([0.92, 0.30, 0.25]), Object.freeze([-0.26, 0.90, 0.35]),
                         Object.freeze([0.20, -0.34, 0.92]), Object.freeze([0.58, -0.55, 0.60])]),
    dp: Object.freeze([1.00, 0.92, 0.98]), dm: Object.freeze([0.86, 1.04, 0.88]),
    o4: 6.0, o4Small: 1.02, o4m: 0.94,
    scaleB: 0.34, scaleK: 0.12, softB: 0.10, softK: 0.055,
    sharpB: 1.4, sharpK: 2.6, sharpV: 1.0, litB: 0.10, litK: 1.25,
    bodyEdge: 0.34, crystalGain: 0.92, medB: 0.048, medS: 0.028, medAbsorb: 2.00, murkGain: 3.20,
    spinRate: 0.088, spinWob: 0.48, spinLane: 2.0,
    tiltB: 0.34, tiltAmp: 0.22, tiltRate: 0.041, tiltTo: 0.30,
});

/**
 * ARC'S FILAMENT: the frame it is drawn in, the curve, and the spindle.
 *
 * arc.ts opens with the hardest sentence in the collection: "THE SPECIES IS A LINE, and a line is the hardest
 * thing this kit has been asked to draw. Everything else is either compact enough to solve at the ray's
 * closest approach or broad enough that five samples average it honestly. A filament is neither."
 *
 * THE SEARCH RUNS ALONG THE CURVE, NOT THE RAY, and that inversion is the trick. For a point C on the curve
 * the ray's closest approach is two dot products; sampling THAT along the curve and taking the smallest finds
 * where the ray passes nearest the filament. arc.ts on why it is stable: "Searching a smooth one-dimensional
 * function is what makes this stable: the samples slide continuously as the geometry moves, so nothing pops."
 *
 * TWO CROSSINGS, NOT ONE, and the reason is geometric rather than aesthetic: "a shallow U seen from most
 * angles is crossed twice, and a global minimum would find only one and break the thread where it passes over
 * itself". So the twenty samples are searched in two halves of ten and both winners are kept.
 */
export const MH_ARC = Object.freeze({
    samples: 20, halves: 2,
    // The frame. roll first (the xy rotation), then yaw and tilt.
    rollB: 0.55, rollAmp: 0.9, rollRate: 0.052, rollWob: 0.5, rollLane: 1.0,
    yawRate: 0.041, yawWob: 0.55, yawLane: 2.0,
    tiltB: 0.30, tiltAmp: 0.5, tiltRate: 0.037, tiltPhase: 2.2,
    swayB: 0.30, swayK: 0.60,
    // The geometry. pin is the arc's closest approach to the centre: "At 1 the filament passes right through
    // the core; at 0 it bows well clear."
    pinFar: 0.30, pinNear: 0.05, pinVoice: 0.30, pinFlourish: 0.35,
    rcB: 0.58, rcK: 0.14, spanB: 1.15, spanK: 0.35, spanSmall: 0.78,
    // THE THREAD. 0.052 body units at the middle of the knob's range is five per cent of the sphere's radius,
    // "about five pixels at 120 pt and two at 18 pt. Set purely by what reads as calligraphic, which is what
    // it should have been set by all along" -- that last clause being the escape from the march constraint.
    wB: 0.042, wK: 0.022, wSmall: 1.90,
    brightB: 0.90, brightVoice: 0.85, brightFlourish: 0.45,
    // THE SPINDLE, and it is TWO exponents on ONE profile, not one. Width rides prof linearly and brightness
    // rides prof^1.35, "so the thread reads as a stroke laid down with pressure in the middle and lifted at
    // both ends, rather than as a rod of even ink that happens to narrow".
    profPow: 0.85, wlFloor: 0.28, wlRide: 0.72, brightPow: 1.35,
    // The 1/sin(alpha) grazing term, floored at 0.58 rather than the 0.30 the geometry allows: "at three and
    // a third it put a bright BULGE wherever the filament leaned toward the viewer, and a thread with a
    // swelling two thirds along it is not brightest at its centre, which is the whole of the brief."
    sinFloor: 0.58,
    // The halo's coefficient is 0.09 where the marched heroes give their scatter 0.24, "because this one is
    // INTEGRATED rather than sampled. The integral scales with width, so a halo 3.2 times wider carries 3.2
    // times the light at the same coefficient -- it stopped being a glow around a thread and became a wide
    // band with a thread inside it."
    haloK: 0.09,
    shimCycles: 4.2, shimPace: 0.55, runFreq: 4.2, runRate: 2.4,
    sepIn: 0.16, sepOut: 0.44,
    medB: 0.055, medS: 0.030, medAbsorb: 2.00, medGain: 3.40,
    // THE GAIN, AND IT IS 35.0 BECAUSE A CLOSED FORM RETURNS A LENGTH. See mhTube's note: a march returns a
    // sum of samples times a step and the two are nowhere near the same scale.
    filGain: 35.0, filSmall: 0.52,
    flourishSlot: 11.0, flourishDur: 8.1,
});

/**
 * SOL'S CORE AND ITS PROMINENCES: a disc solved with one square root, and three tongues solved the way arc's
 * filament is.
 *
 * sol.ts: "THE CORE IS THE MASS AND THE PROMINENCES ARE THE LINE. Both are solved rather than sampled, and
 * they are solved differently because they are different kinds of thing." The core is "a perfect disc, and it
 * costs one square root ... exactly, analytically round from every angle, at every frame, with no sampling in
 * it anywhere". The prominences reuse the curve search, at NINE samples rather than arc's twenty because each
 * tongue is a short arch rather than a span.
 *
 * ONE OR TWO AT A TIME: "Three prominences on periods of 13, 17 and 21 seconds, each spending most of its
 * cycle flat against the surface, so the sun is never symmetric and never crowded. The lift is sin-squared,
 * flat at both ends."
 */
export const MH_SOL = Object.freeze({
    samples: 9, count: 3,
    rsB: 0.30, rsK: 0.09, rsSmall: 1.42, rsBreathLane: 2.7, rsBreath: 0.030, rsVoice: 0.035,
    // The disc's own threshold. It runs from 1.04 of the radius to 0.86 -- an eased edge on an ANALYTIC
    // circle, which is a soft edge on hard geometry rather than a blurred one.
    discOut: 1.04, discIn: 0.86,
    // The granulation is weighted to the disc's INTERIOR, and the reason is the one failure this species
    // cannot afford: "Granulation applied across the limb modulates the very threshold that makes the core
    // round, and the photosphere grew notches in its outline -- which on the one hero whose brief is a
    // composed circular core is the worst place to lose it."
    simCycles: 8.5, simB: 0.30, simK: 0.55, simPaceB: 0.55, simPaceK: 0.65,
    granK: 0.32, granIn: 0.55, granOut: 1.0, granScale: 8.5, granRateB: 0.35, granRateK: 0.75,
    coreB: 1.20, coreK: 0.45, coreVoice: 0.55,
    coronaWB: 0.16, coronaWK: 0.15, coronaWVoice: 0.25, coronaDisc: 0.60, coronaB: 0.42, coronaK: 0.30,
    pairIn: 0.28, pairOut: 0.70,
    promWB: 0.034, promWK: 0.017, promWSmall: 1.75,
    perB: 13.0, perK: 4.0, rootA1: 0.048, rootA1K: 0.011, rootA2: 0.037, rootA2K: 0.009,
    rootPh1: 1.9, rootPh2: 3.1,
    hkB: 0.24, hkK: 0.28, hkVoice: 0.45,
    // A WIDER SWEEP ALONG THE LIMB than the first build's: "At 0.55 they left radially and read as antennae;
    // a prominence is a loop rooted at two feet, not a spike."
    swpB: 0.85, swpK: 0.30,
    profFall: 0.85, profPow: 0.70, wlFloor: 0.42, wlRide: 0.58, sinFloor: 0.55,
    haloK: 0.10, haloW: 3.19, haloSpread: 10.2,
    // THE CORE OCCLUDES, at 0.94 rather than 1.0 so a tongue behind the star is dark rather than absent:
    // "which is the cue that makes the core read as a solid body rather than as a bright patch."
    occlude: 0.94,
    medB: 0.030, medS: 0.018, medAbsorb: 2.00, medGain: 3.00,
    // 6.60 against arc's 35.0, and the ratio is the point rather than an accident. sol.ts: "THE PROMINENCE
    // GAIN IS SMALL, NOT THE 26 A MARCHED HERO WOULD WANT ... Carrying a marched hero's gain across put every
    // tongue five times over the rail's top, which is why they drew as white slabs instead of as line work."
    promGain: 6.60,
    flourishSlot: 23.0, flourishDur: 12.4,
});

/**
 * AURA'S RIBBONS: three open SHEETS, and the numbers that make them cloth rather than glass.
 *
 * aura.ts's argument against the obvious shape is worth keeping whole: "WHY SHEETS AND NOT LOOPS. A loop
 * projects to an ellipse, and a band of finite thickness laid on an ellipse has two places where it turns
 * edge-on to the viewer and pinches to nearly nothing. Those pinches are corners, and a stroke with a sharp
 * turn in it IS calligraphy. A sheet has no turns because it has no ends inside the volume: it enters one
 * side of the glass and leaves the other, the way a length of silk hanging in water does."
 *
 * *** AND THE OCCLUSION IS THE SPECIES, WHICH IS WHY absorb IS IN THIS TABLE AND NOT IN THE SHADER. *** "The
 * interior march then does the rest for free -- a tap that lands in a near sheet attenuates what the far ones
 * contribute behind it, so the crossings resolve as occlusion rather than as addition." The coefficient is
 * fitted against a capture and its two failure modes are both named: "at 9 the far ribbon vanishes entirely
 * and the body loses its sense of fullness, at 1.5 nothing occludes anything and it is smoke again."
 *
 * THE RIPPLE USES TWO INCOMMENSURATE WAVES, never one: "One wave is a corrugation and reads as a machined
 * part; two at 1.7 and 1.1 with different phases give the surface a slow irregular lift that never repeats
 * along its length, which is what cloth does." And it is kept LOW on purpose -- "past about 0.3 the sheet
 * folds back on itself along the view ray and draws a bright seam where a fold is edge-on -- the loop's cusp
 * problem returning by another road."
 */
export const MH_AURA = Object.freeze({
    // thickness to width is about one to four, "which is a ribbon; at one to one it would be a slab".
    whB: 0.105, whK: -0.020, whSmall: 1.85, bwB: 0.400, bwK: -0.070, bwSmall: 1.25,
    // Per-ribbon face widths, as multiples of bw -- ribbon 1 wider and ribbon 2 narrower, "because two
    // identical ribbons at two angles still read as one thing said twice".
    faceMul: Object.freeze([1.00, 1.30, 0.80]),
    thirdIn: 0.55, thirdOut: 0.95, thirdSmallIn: 0.22, thirdSmallOut: 0.62,
    secondSmallIn: 0.52, secondSmallOut: 0.94, secondSmall: 0.34,
    w3B: 0.55, w3K: 0.45,
    // *** ratePace AND rateDrive ARRIVE AT v4654 AND THEY ARE NOT NEW NUMBERS -- they are two of murmur's
    // three that this port never carried. *** aura.ts: rate = (0.17 + 0.24*swirlK) * (1 + 0.85*live.voice +
    // 0.45*live.pace + 1.05*st.drive). This table held the voice term alone, so the ribbons answered a
    // raised voice and were deaf to how busy the exchange was -- on the one species whose brief is depth
    // through motion.
    rateB: 0.17, rateK: 0.24, rateVoice: 0.85, ratePace: 0.45, rateDrive: 1.05,
    rateLane: Object.freeze([1.00, 0.83, 1.17]),
    driftWob: Object.freeze([0.40, 0.52, 0.34]), driftPhase: Object.freeze([0.0, 2.1, 4.3]),
    ampB: 0.098, ampK: 0.130, ampVoice: 0.55, ampSmall: 0.78,
    // The three sheets' ripple: [along-x frequency, cross-z frequency, cross weight, phase, amp multiplier].
    ripple: Object.freeze([
        Object.freeze({ fx: 1.70, fz: 1.10, cw: 0.62, ph: 2.1, pk: 0.8, am: 1.00 }),
        Object.freeze({ fx: 1.30, fz: 1.55, cw: 0.58, ph: 4.3, pk: 0.7, am: 0.85 }),
        Object.freeze({ fx: 2.10, fz: 0.90, cw: 0.55, ph: 1.4, pk: 0.9, am: 1.15 }),
    ]),
    // THE DEPTH OFFSETS. "Each is displaced along its own frame's normal, and since the frames are rolled and
    // tilted differently, three displacements along three different directions put three surfaces genuinely
    // apart in the volume. That separation is what the parallax is made of."
    offsets: Object.freeze([-0.26, 0.24, 0.02]), offsetsSmall: Object.freeze([-0.20, 0.20, 0.02]),
    rollB: Object.freeze([0.15, 2.05, 3.85]), rollAmp: Object.freeze([0.22, 0.26, 0.20]),
    rollRate: Object.freeze([0.031, 0.024, 0.019]), rollPhase: Object.freeze([0.0, 2.2, 4.6]),
    yawRate: Object.freeze([0.061, 0.047, 0.039]), yawWob: Object.freeze([0.5, 0.6, 0.4]),
    yawLane: Object.freeze([4.0, 5.0, 6.0]), yawPhase: Object.freeze([0.0, 2.4, 4.7]),
    tiltB: Object.freeze([0.62, -0.78, 0.06]), tiltAmp: Object.freeze([0.16, 0.14, 0.20]),
    tiltRate: Object.freeze([0.043, 0.037, 0.029]), tiltPhase: Object.freeze([0.0, 1.9, 3.4]),
    // THE GRADIENT ALONG THE LENGTH, "the other half of the silk read: a ribbon of even brightness is a stroke
    // however soft its edges are." FLOORED AT 0.58 AND NEVER ZERO -- "a ribbon that goes fully dark has been
    // cut into pieces, and pieces are not silk."
    gFloor: 0.58, gRide: 0.42, gFreq: Object.freeze([2.1, 1.6, 1.3]),
    gRate: Object.freeze([0.083, 0.061, 0.047]), gPhase: Object.freeze([0.7, 3.9, 1.9]),
    scatterAmp: 0.17, shimCycles: 7.2, shimB: 0.20, shimK: 0.75, shimScale: 7.2, shimRate: 0.9,
    hueW: Object.freeze([-0.70, 0.55, 1.00]),
    medAmt: 0.075, medLane: 2.6, ribbonGain: 1.45,
    // *** THE OCCLUSION COEFFICIENT. *** See the header: 9 kills the far ribbon, 1.5 is smoke.
    absorb: 4.50,
    gain: 2.60, gainSmall: 0.92,
});

/**
 * FLUX'S CURTAINS: three vertical sheets, and the asymmetric profile that makes them hang.
 *
 * flux.ts: "THE ONE HERO ALLOWED A BROAD FLOWING FIELD, and it needs the permission because an aurora is not
 * an object. Everything else in this collection is something IN the glass; this is the only one whose
 * interior is a field with a direction."
 *
 * *** THE VERTICAL PROFILE IS ASYMMETRIC ON PURPOSE AND IT IS MOST OF THE SPECIES. *** "AURORAE ARE BRIGHT AT
 * THE BOTTOM AND FADE UPWARD, and getting that one profile right is most of what makes this read as an aurora
 * rather than as a vertical smear. The lower edge is where the atmosphere is dense enough to glow hard; above
 * it the light thins out over several times that height. So the vertical term is a sharp rise at the foot and
 * a long exponential decay above it, asymmetric on purpose -- a symmetric profile reads as a band of light
 * and not as a curtain hanging."
 *
 * *** AND UP IS NEGATIVE Y, WHICH IS A BUG THE SOURCE SHIPPED AND THEN NAMED. *** "A colorEffect's y runs
 * DOWN the screen, so the body frame's +y is the bottom of the picture -- and the first cut hung its curtains
 * from that, which put the bright foot along the TOP and the fade going down. An upside-down aurora is not a
 * subtle mistake; it reads as light pouring in from above rather than as curtains standing on something."
 *
 * THE WANDER IS WEIGHTED TOWARD DEPTH RATHER THAN HEIGHT, and the reason is the same failure helix names:
 * "a sheet whose position swings hard with height leans, and three leaning sheets read as diagonal streaks
 * rather than as curtains hanging; the same swing read in z folds the curtain toward and away from the
 * viewer, which is what an aurora does. So the height terms run at 1.1 and the depth terms carry the larger
 * share." Every height weight below is 0.55 and every depth weight is 0.90 or more.
 */
export const MH_FLUX = Object.freeze({
    yawRate: 0.047, yawWob: 0.50, yawLane: 2.0,
    tiltB: 0.16, tiltAmp: 0.10, tiltRate: 0.033,
    flowB: 0.26, flowK: 0.34, flowWob: 0.45, flowLane: 4.0, flowPace: 0.70,
    bendB: 0.30, bendK: 0.42, bendPace: 0.45, bendSmall: 0.50,
    wB: 0.105, wK: 0.030, wSmall: 2.00,
    // THE REACH ABOVE THE FOOT. hi runs 0.42 -> 0.88 of the body, which is what `height` buys.
    hiB: 0.42, hiK: 0.46, hiVoice: 0.45,
    // THE PROFILE: a sharp foot from -0.92 to -0.52 and then an exponential decay upward over hi.
    footIn: -0.92, footOut: -0.52, riseFrom: -0.52,
    secondSmallIn: 0.34, secondSmallOut: 0.76, thirdSmallIn: 0.16, thirdSmallOut: 0.54,
    brightB: 0.80, brightVoice: 0.80,
    // The three sheets: x offset, then the height and depth wander [freq, weight] and their phases.
    sheets: Object.freeze([
        Object.freeze({ x: -0.34, fy: 1.10, wy: 0.55, phy: 0.00, ky: 1.00, fz: 1.15, wz: 0.95, phz: 2.1, kz: 0.7, wm: 1.00 }),
        Object.freeze({ x: 0.04, fy: 0.85, wy: 0.55, phy: 2.40, ky: 1.18, fz: 1.55, wz: 1.00, phz: 4.3, kz: 0.6, wm: 1.25 }),
        Object.freeze({ x: 0.40, fy: 1.35, wy: 0.55, phy: 4.70, ky: 0.86, fz: 0.95, wz: 0.90, phz: 1.4, kz: 0.9, wm: 0.85 }),
    ]),
    scatterAmp: 0.20,
    striCycles: 6.5, striK: 0.32, striZ: 6.5, striY: 1.7, striFlow: 1.4,
    hueW: Object.freeze([-1.00, 0.15, 1.00]),
    medB: 0.055, medS: 0.030, medLane: 2.1, curtainGain: 0.85,
    absorb: 2.90, gain: 2.40,
    flourishSlot: 15.0, flourishDur: 11.3,
});

/**
 * DUET'S TWO BODIES: an orbit that is never face-on and never edge-on, and the occlusion that turns "dimmer"
 * into "behind".
 *
 * duet.ts states the whole species in one paragraph: "TWO THINGS IN ONE VOLUME IS A DEPTH PROBLEM ... Two
 * bright blobs going round each other on a flat disc is a loading spinner; two bodies passing in front of and
 * behind one another with the far one visibly dimmer and partly eaten by the near one is a conversation
 * happening in a space." Three mechanisms produce that and each is one line: the orbit is TILTED and
 * precesses; the far one is DIMMER, because both bodies are solved at the view ray's closest approach so each
 * knows how deep into the glass it is; and the near one OCCLUDES the far one -- "that is the cue that turns
 * dimmer into behind, and without it the pair reads as two lamps at different brightnesses rather than as two
 * objects at two depths."
 *
 * *** AND THE BALANCE IS A SPLIT, NOT A GAIN, WHICH IS THE PART A GATE CAN PROVE. *** brA = 2 * bal and
 * brB = 2 * (1 - bal), so the two brightnesses always SUM TO TWO however the balance moves. duet.ts: level
 * "pushes decisively toward one of them: somebody has the floor. Not both brighter, which would say nothing;
 * brighter THERE and dimmer here."
 */
export const MH_DUET = Object.freeze({
    leanB: 0.62, leanAmp: 0.20, leanRate: 0.037,
    precRate: 0.064, precWob: 0.45, precLane: 2.0,
    rNear: 0.30, rFar: 0.50, rSmall: 1.36,
    rateB: 0.40, rateK: 0.55, orbitWob: 0.40, orbitLane: 3.0,
    braidDrive: 0.16, braidFlourish: 0.06, braidRate: 3.0,
    wAB: 0.145, wAK: 0.030, wASmall: 1.50, ratioLo: 0.52, ratioHi: 1.0, ratioSmall: 0.65,
    swayB: 0.5, swayAmp: 0.15, swayRate: 0.21, swayWob: 0.50, swayLane: 7.0,
    balVoice: 0.40, balLo: 0.06, balHi: 0.94,
    // *** THE OCCLUSION COEFFICIENT. *** Whichever body the ray reaches FIRST eats the other by its own
    // density at this pixel: exp(-2.40 * core). The branch on sA < sB is the only ordering in the species and
    // it is exact, because both distances are known in closed form rather than sampled.
    occlude: 2.40,
    coreGain: 1.05, scatterAmp: 0.30,
    medB: 0.085, medS: 0.044, medLane: 2.2, medAbsorb: 2.20, medGain: 3.60,
    // A warm of the anchor, B cool of it -- and the weights are NOT symmetric (0.85 against 1.00), so the
    // pair's colour conversation leans the way its own file says it does.
    hueA: 0.85, hueB: -1.00,
    flourishSlot: 6.0, flourishDur: 8.3,
    // *** duet.ts's THREE RATE TERMS, of which this port carried ONE until v4657. ***
    //     rate = (0.40 + 0.55*orbitK) * (1 + 0.55*live.pace + 0.90*st.drive + 0.85*fl.x)
    // The flourish term was wired and the other two were not, so the pair sped up for its own gesture and
    // ignored the exchange entirely. It is also the term that made the rate MOVE, which is why duet's
    // orbital phase was jumping 1.8152 rad in a single frame after half an hour -- 29% of a whole turn of
    // the shared orbit -- every time a gesture fired.
    ratePace: 0.55, rateDrive: 0.90, rateFlourish: 0.85,
});

/**
 * CHORUS'S SEVEN VOICES: a Fibonacci shell, and the phase relationship that is the actual subject.
 *
 * *** THE LICENCE IS NARROW AND chorus.ts SPENDS ITS OPENING ON IT. *** "THE ONE HERO LICENSED A RHYTHM ...
 * The family's verbs are FLOW and SETTLE, and breathing luminance is banned as a default motif precisely
 * because it is the first thing everyone reaches for. The carve-out is for a species whose concept literally
 * IS a rhythm, and an ensemble breathing is that: the thing the species is actually about is not the
 * breathing at all but the PHASE RELATIONSHIP between the breaths."
 *
 * SO THE DESIGN IS SYNC, NOT PULSE: "At rest the voices are scattered across the cycle -- sync at zero
 * spreads them over a full period -- and what the eye reads is a loose, uncountable shimmer with no beat in
 * it, because nothing ever coincides. As sync rises they gather, and at one they breathe as a single body."
 * That is a claim about the ENSEMBLE'S TOTAL OVER TIME rather than about any one voice, which is why the gate
 * that grades it measures a variance across frames and not a brightness in one.
 *
 * KEPT GENTLE, which is the other half of the licence: the breath is floored so "no voice ever goes out and
 * the ensemble never blinks" -- life runs 1 - breathe + breathe * sin^2, so its floor is 1 - breathe.
 */
export const MH_CHORUS = Object.freeze({
    count: 7,
    // THE SHELL IS FIBONACCI so the seven "are evenly spread over the sphere without any two ever lining up
    // into a row or a ring". 2.39996323 is the golden angle in radians.
    golden: 2.39996323, shellR: 0.54, shellWob: 0.09, shellRate: 0.061, shellRateK: 0.009, shellPhase: 2.2,
    driftAmp: 0.05, driftRateX: 0.043, driftRateY: 0.037, driftPhaseY: 1.7,
    turnRate: 0.048, turnWob: 0.45, turnLane: 2.0,
    midIn: 0.26, midOut: 0.62, farIn: 0.10, farOut: 0.42,
    // "Small enough to stay separate on a shell this size: at 0.14 against a spacing of about 0.35 the seven
    // ran together into one lobed mass and the ensemble stopped being countable, WHICH IS THE ONE THING AN
    // ENSEMBLE HAS TO BE."
    radB: 0.082, radK: 0.038, radSmall: 1.75,
    brightB: 0.70, brightK: 0.55,
    syncK: 0.75, perB: 8.4, perPace: 2.2 * 0.6,
    breatheB: 0.30, breatheK: 0.45, breatheSmall: 1.35,
    // The phase ladder sync closes: voice k sits at k * 0.897 of a full turn at sync 0, and at 0 at sync 1.
    phaseStep: 0.897,
    // LEVEL PICKS OUT THE NEAREST rather than brightening the ensemble: "An ensemble where the front row
    // answers is a much better picture of being listened to than one where everybody gets louder."
    liftB: 0.25, liftFront: 1.15,
    coreAmp: 0.60, scatterAmp: 0.42,
    medB: 0.048, medS: 0.028, medLane: 2.1, medAbsorb: 2.00, medGain: 3.30,
    flourishSlot: 29.0, flourishDur: 11.1,
});

/**
 * *** HELIX'S OWN TAP COUNT, AND IT IS A SECOND UNIFORM IN murmur RATHER THAN A CONSTANT. *** kit.ts declares
 * two: "uniform int u_taps; // the family's five, scaled by rendered size" and "uniform int u_tapsHi;
 * // helix's twenty, likewise: its strands ARE the march". Only helix reads the second one.
 *
 * SO THE RATIO IS FOUR, AND THAT IS WHAT THIS PORT TRANSCRIBES rather than the number 20. MH_TAPS here is 24
 * -- the family's five as the demo scales it -- so the high count is 96 by the same scaling. Writing 20 would
 * have been transcribing another tree's mount, which is the error v4637 caught on arc's march interval and
 * which is worth not making twice.
 *
 * helix.ts on why the count cannot simply be dropped: "TWENTY STEPS, and they are cheap: one sincos each, no
 * noise, no atan ... PORT: scaled by rendered size like MH_TAPS, and floored well above zero rather than
 * switched off, because this is the one hero whose figure lives in the march. Dropping it to nothing leaves
 * an empty bead." And what the count buys: "twenty steps is what lets the strand be 0.062 wide instead of
 * 0.11" -- the same trade arc made by escaping the march entirely, made here by paying for a finer one.
 */
export const MH_TAPS_HI = MH_TAPS * 4;

/**
 * PRISM'S THREE SHAFTS: where they enter, where they are aimed, and why the fan opens across the screen.
 *
 * *** THE ENTRY POINT IS NOT ARBITRARY AND IT IS THE SPECIES' ONE NON-NEGOTIABLE. *** prism.ts: "The shafts
 * begin where the specular highlight is, because that is where the picture already says the light is coming
 * from, and a prism whose beams enter somewhere else is a prism nobody believes for a second. mh_key is a
 * shared function for exactly this reason: the highlight and the entry point read the same direction,
 * including its slow drift."
 *
 * *** AND THE BUNDLE IS NOT AIMED AT THE CENTRE, WHICH IS THE DIFFERENCE BETWEEN SHAFTS AND TADPOLES. ***
 * "Pointing it at the centre sends the beams substantially AWAY from the viewer, because the entry is on the
 * front of the sphere; their length then foreshortens to barely more than their width and three shafts render
 * as three blobs. Aiming instead at a point low and slightly toward the viewer sends them across the body
 * from upper left to lower right, almost in the screen plane, so nearly their whole length is visible."
 *
 * *** THE FAN OPENS ACROSS THE SCREEN BY CONSTRUCTION, NOT BY LUCK. *** "Taking u1 as the cross of the axis
 * with the view direction puts it in the screen plane by construction, so the fan is always seen side-on and
 * the split is always visible." u2 is then the depth direction and carries only small wobbles.
 *
 * SHAFTS, NEVER RAYS: each beam's width GROWS with distance from the entry. "A beam of constant width is a
 * laser; a beam that opens as it travels is a shaft of light in a medium." The opening rate is budgeted
 * explicitly -- "At 0.155 body units per unit travelled a beam is nearly four tenths wide at the far wall --
 * three of those plus their scatter is one lit balloon, not a split. At 0.055 a shaft roughly triples in
 * width crossing the body."
 */
export const MH_PRISM = Object.freeze({
    swRate: 0.048, swRateK: 0.040, swWob: 0.52, swLane: 4.0,
    entryJitter: 0.06, entryJitterK: 0.10, entryR: 1.03,
    // The aim point: low, and slightly toward the viewer. Not the centre, for the reason in the header.
    aim: Object.freeze([0.10, 0.62, 0.28]),
    divB: 0.17, divK: 0.42, divSmall: 1.35, divFlourish: 0.55,
    wobble: Object.freeze([0.05, 0.06, 0.05]), wobRate: Object.freeze([0.071, 0.043, 0.059]),
    wobPhase: Object.freeze([0.0, 1.1, 2.2]),
    w0B: 0.038, w0K: 0.035, w0Small: 1.85, w0Voice: 0.30, midWide: 1.10,
    // THE OPENING RATE, and its two rejected neighbours are in the header: 0.155 is a balloon, 0.055 triples.
    wGrowB: 0.040, wGrowK: 0.035,
    alphaIn: Object.freeze([0.12, 0.46]), alphaOut: Object.freeze([1.60, 2.35]),
    thirdIn: 0.30, thirdOut: 0.72,
    brightB: 0.76, brightVoice: 0.65,
    shimCycles: 5.4, shimK: 0.55, runFreq: 5.4, runRate: 2.6,
    pulseFrom: 2.0, pulseW: 0.28, pulseAmp: 1.05,
    scatterAmp: 0.16, beamGain: 0.95,
    medB: 0.058, medS: 0.030, medLane: 2.2, medAbsorb: 2.60,
    gain: 2.45,
    // The outer beams either side of the anchor and the middle one on it: "three neighbouring hues separated
    // in SPACE rather than mixed, which is the most literal use of the knob in the collection."
    hueW: Object.freeze([-1.0, 0.0, 1.0]),
    flourishSlot: 8.0, flourishDur: 9.1,
});

/**
 * HELIX'S TWO STRANDS: an upright that stays upright, a counted crossing rhythm, and threads rather than
 * streaks.
 *
 * *** THE GESTALT TEST IS THE SPEC: *** helix.ts -- "somebody says DNA inside three seconds or the species
 * has failed -- and the first build failed it by being a cousin of flux: broad soft strands on a leaning axis
 * read as crossing horizontal streaks. Three things were wrong and all three are structural."
 *
 *   THE AXIS IS VERTICAL AND STAYS VERTICAL. "A lean of twenty degrees is enough to destroy the read: a helix
 *   is legible only against a clear upright, and once the upright tips the crossings stop looking like
 *   crossings and start looking like a weave." The yaw is kept -- it turns the pair toward and away from the
 *   viewer without disturbing the upright -- and the tilt is down to about six degrees.
 *
 *   THE CROSSING RHYTHM IS COUNTED, not left to fall out. "A double helix seen side-on crosses twice per
 *   turn, so turns is set to put about one and three quarter turns inside the visible height: three or four
 *   crossings, which is the count the eye reads as a helix rather than as a spring."
 *
 *   THE STRANDS ARE THREADS, "and getting there meant giving up the atan2. The distance to the strand is
 *   measured IN THE HORIZONTAL PLANE AT THE SAMPLE'S OWN HEIGHT: at height y the strand is one point in that
 *   plane, so the distance is a subtract. That costs one sincos where the angular form cost an inverse
 *   tangent, which is what makes twenty steps affordable -- and twenty steps is what lets the strand be 0.062
 *   wide instead of 0.11."
 *
 * AND THE TWO STRANDS ARE EXACTLY ANTIPODAL: one sincos serves both, because the second strand is the
 * NEGATION of the first's offset. That is not an optimisation with a cost -- it is what a double helix IS.
 */
export const MH_HELIX = Object.freeze({
    yawRate: 0.055, yawWob: 0.50, yawLane: 2.0,
    // ABOUT SIX DEGREES, and the number is the species: 0.06 + 0.05 is 0.11 rad = 6.3 deg, against the twenty
    // that "is enough to destroy the read".
    tiltB: 0.06, tiltAmp: 0.05, tiltRate: 0.031,
    turnsB: 1.75, turnsK: 1.10, turnsSmall: 0.50,
    climbB: 0.20, climbK: 0.30, climbSmall: 0.70, climbWob: 0.44, climbLane: 5.0,
    // v4655 -- helix.ts scales its climb by (1 + 0.75*live.pace + 0.85*st.drive) and this port carried
    // the bare drift. Two of murmur's numbers that were simply absent, not two new ones.
    climbPace: 0.75, climbDrive: 0.85,
    r0B: 0.42, r0K: 0.10,
    wB: 0.062, wK: 0.022, wSmall: 1.90, wVoice: 0.25,
    brightB: 0.80, brightK: 0.65, brightVoice: 0.80,
    // The spindle, in HEIGHT rather than along a curve: "width and brightness fall together, so each strand
    // is a stroke laid down with pressure in the middle."
    profSpan: 0.88, profPow: 0.80, wlFloor: 0.30, wlRide: 0.70,
    scatterAmp: 0.16, strandGain: 0.80, absorb: 3.00,
    // THE MEDIUM AT A THIRD OF THE FAMILY'S USUAL: "nothing may compete with two thin lines."
    medB: 0.020, medS: 0.012, medLane: 2.1, medAbsorb: 2.00,
    gain: 5.60,
    flourishSlot: 17.0, flourishDur: 9.3,
});

/** tempest's lightning: the two lane seeds, their slot lengths, and the radius its depth mask kills at. */
export const MH_TEMPEST_BOLT = Object.freeze({
    lanes: Object.freeze([Object.freeze({ seed: 21.0, slot: 2.9 }), Object.freeze({ seed: 27.0, slot: 4.3 })]),
    maskIn: 0.35, maskOut: 0.62,
});

/** droplet's gain, which is nearly three times any other hero's -- "the body itself is the species". */
export const MH_DROPLET_GAIN = 3.30;

export const MH_SURFACE_KNOBS = Object.freeze({
    aura:    Object.freeze([0.88, 0.40, 0.52, 0.00, 0.16]),
    droplet: Object.freeze([1.05, 0.35, 0.42, 0.00, 0.16]),   // + 0.55/0.30 * sheenK, added by the species
    nebula:  Object.freeze([0.78, 0.35, 0.98, 0.00, 0.15]),
    prism:   Object.freeze([0.80, 0.35, 0.62, 0.25, 0.15]),
    limn:    Object.freeze([0.30, 0.00, 0.78, 0.35, 0.09]),
    duet:    Object.freeze([0.80, 0.35, 0.42, 0.00, 0.15]),
    fathom:  Object.freeze([0.78, 0.35, 0.46, 0.00, 0.14]),
    arc:     Object.freeze([0.80, 0.35, 0.30, 0.00, 0.14]),
    opal:    Object.freeze([0.80, 0.35, 0.52, 0.00, 0.14]),
    comet:   Object.freeze([0.80, 0.35, 0.22, 0.00, 0.15]),
    still:   Object.freeze([1.15, 0.45, 1.30, 0.35, 0.13]),
    flux:    Object.freeze([0.80, 0.35, 0.55, 0.00, 0.14]),
    tempest: Object.freeze([0.80, 0.35, 0.66, 0.00, 0.15]),
    helix:   Object.freeze([0.60, 0.28, 0.38, 0.00, 0.12]),
    geode:   Object.freeze([0.74, 0.32, 0.62, 0.00, 0.14]),
    sol:     Object.freeze([0.70, 0.32, 0.52, 0.00, 0.16]),
    abyss:   Object.freeze([1.70, 0.55, 0.38, 0.00, 0.11]),
    chorus:  Object.freeze([0.80, 0.35, 0.50, 0.00, 0.14]),
});

/** The deformed radius along a direction -- the silhouette itself, which for droplet IS the species. */
export function mhRadiusAt(n, t, sh) {
    const amp = Math.min(MH_AMP_CAP, Math.max(0, sh.amp));
    return 1 + mhDeform(norm3(n), t, sh).d * amp;
}

// ---------------------------------------------------------------------------------------------------------
// DROPLET -- the fourth species, and the first whose silhouette moves.
// ---------------------------------------------------------------------------------------------------------

/** droplet's own four knobs and their shipped defaults, from murmur's src/styles.ts roster. */
export const DROPLET_DEFAULTS = Object.freeze({ wobble: 0.5, tension: 0.5, sheen: 0.5, spread: 0.3 });

/**
 * droplet's wobble amplitude. "Higher tension means a body that holds its shape: the knob runs BACKWARDS
 * through the amplitude on purpose, because that is what tension IS."
 */
export function dropletWobble(wobbleK, tensionK, swell = 0, small = 0) {
    return (0.052 + 0.040 * wobbleK) * (1 - 0.22 * tensionK) * (1 + 0.30 * swell) * (1 + 0.20 * small);
}

/** The inhale: the breath is the carrier and voice is what fills it, so the swell arrives on a curve. */
export function dropletSwell(t, voice) { return (0.22 + 0.78 * mhBreath(t, 0.9)) * voice; }

/**
 * *** THE WORST-CASE SILHOUETTE, WHICH murmur ARGUES IS SAFE AND THIS TREE CHECKS. *** droplet.ts caps the
 * swell at 0.05 and states the arithmetic: "with the 0.085 deformation cap on top, the worst-case silhouette
 * is 0.300 * 1.05 * 1.085 = 0.339 uv, and the containment does not begin until 0.36."
 */
export function dropletWorstSilhouette() { return MH_R * 1.05 * (1 + MH_AMP_CAP); }

// ---------------------------------------------------------------------------------------------------------
// THE COLOUR RAIL -- mh_palette / mh_shade / mh_tier / mh_lit, and the last structural piece of the kit.
//
// *** THE FOUR SPECIES WERE PORTED AND THEIR COLOUR WAS NOT. *** render/aiPresenceOrbTsl.mjs has carried a
// fresnel rim at pow(fres, 4.5), two speculars on a fixed light direction, and an OKLab ramp from a BASE_L /
// BASE_C / BASE_H THIS PORT CHOSE -- its own header says so. murmur's own answer is a four-stop rail in OKLab
// built from one anchor, walked by an energy-to-lightness curve with a deliberate three-tier hierarchy, and
// mixed between an INK rail and a PAPER rail that run in OPPOSITE directions. None of that was here.
//
// It is the same shape as v4623's finding one layer out: the thing every species shares, approximated per
// species. And it is worth more than another species, because every species already ported is currently
// wearing the wrong colour.
// ---------------------------------------------------------------------------------------------------------

/** kit.ts: the spread cap, 0.50 rad -- "about 29 degrees of OKLAB hue either side of the anchor". */
export const MH_SPREAD_CAP = MH_SPREAD;

/** L, C, h -> OKLab. The rail is built in polar form because hue is the axis the family walks. */
export function mhLch(L, C, h) { return [L, C * Math.cos(h), C * Math.sin(h)]; }

/**
 * HOW LIGHT THE GROUND IS, in OKLAB lightness rather than an RGB average, "because a saturated mid-blue paper
 * and a light grey with the same channel mean are nowhere near the same brightness to the eye."
 *
 * kit.ts states three values for this function and the gate checks all three: 0 for the house ink (L about
 * 0.16), 1 for paper (L about 0.97), and a true mid grey -- sRGB 0.5, OKLab L 0.60 -- landing "about four
 * tenths across". It also states a PROPERTY: "Nothing in this file ever branches on it; every use is a mix,
 * so dragging the ink from ink to paper shows no jump" -- which is checked as continuity, not read.
 */
export function mhPaper(rgb) {
    const lin = rgb.map(srgbToLinear);
    return smoothstep(0.50, 0.72, linearToOklab(lin[0], lin[1], lin[2]).L);
}

/** sRGB triple -> OKLab as a 3-vector, the form the rail works in. */
function labOf(rgb) {
    const lin = rgb.map(srgbToLinear);
    const o = linearToOklab(lin[0], lin[1], lin[2]);
    return [o.L, o.a, o.b];
}

/**
 * FOUR OKLAB STOPS BUILT FROM ONE ANCHOR, on two rails that run opposite ways.
 *
 * THE INK RAIL climbs dark to bright: energy becomes light. Its shadow shifts WARM as it darkens -- about
 * twenty degrees toward ember -- and keeps most of its chroma, "a straight desaturating fall from gold to ink
 * passes through olive".
 *
 * THE PAPER RAIL descends and DEEPENS, "because on a light ground energy cannot become light. So energy
 * becomes chroma and shadow, which is what a tinted transparent object actually does to the light behind it."
 *
 * *** AND THE TWO ARE MIXED AT THE STOPS, WHICH kit.ts CALLS EXACT RATHER THAN AN APPROXIMATION: *** "mh_shade's
 * walk is linear in the stops for any fixed t." That is an identity, so the gate asserts it as one -- walking
 * the mixed stops must equal mixing the two walks.
 */
export function mhPalette(inkRgb, toneRgb, tone2Rgb, hueShift = 0, depth = 1) {
    const ink = labOf(inkRgb), tone = labOf(toneRgb), tone2 = labOf(tone2Rgb);
    const L = tone[0], C = Math.hypot(tone[1], tone[2]);
    const h = Math.atan2(tone[2], tone[1]) + hueShift;
    const d = Math.min(2.0, Math.max(0.30, depth));
    const paper = mhPaper(inkRgb);

    // THE SECOND ANCHOR, read as a DIFFERENCE from the first rather than as a palette of its own -- which is
    // what keeps duotone inside the family's one law. `duo` is EXACTLY ZERO when the anchors are equal, and
    // kit.ts calls that "the property the whole upgrade rests on: at zero every term below collapses to the
    // identity". The hue difference takes the SHORT way round, or two anchors either side of the origin would
    // walk the long way through green to reach each other.
    const C2 = Math.hypot(tone2[1], tone2[2]);
    const h2 = Math.atan2(tone2[2], tone2[1]) + hueShift;
    const dhRaw = h2 - (Math.atan2(tone[2], tone[1]) + hueShift);
    const dHue = wrapPi(dhRaw);
    const dC = C2 / Math.max(C, 1e-4);
    const dL = tone2[0] / Math.max(L, 1e-4);
    const duo = smoothstep(0.004, 0.035, Math.hypot(tone2[0] - tone[0], tone2[1] - tone[1], tone2[2] - tone[2]));

    const d0 = ink;
    const d1 = mhLch(ink[0] + (L - ink[0]) * (0.30 / d), C * (0.52 + 0.10 * d), h - 0.35);
    const d2 = mhLch(L, C, h);
    const d3 = mhLch(Math.min(L * (1.20 + 0.12 * d), 0.93), C * 0.55, h + 0.10);

    const Lp = ink[0];
    const l0 = ink;
    const l1 = mhLch(Lp + (L - Lp) * (0.42 / d), C * (0.34 + 0.10 * d), h + 0.05);
    const l2 = mhLch(L * (0.82 - 0.06 * d), C * (1.20 + 0.14 * d), h);
    const l3 = mhLch(Math.max(L * (0.52 - 0.05 * d), 0.18), C * (1.05 + 0.10 * d), h - 0.08);

    const mixv = (a, b) => [a[0] + (b[0] - a[0]) * paper, a[1] + (b[1] - a[1]) * paper, a[2] + (b[2] - a[2]) * paper];
    return { s0: mixv(d0, l0), s1: mixv(d1, l1), s2: mixv(d2, l2), s3: mixv(d3, l3), paper, duo, dHue, dC, dL };
}

/**
 * WALK THE FAMILY. Three segments, each eased so its ends are flat, "which makes the joins C1: no kink shows
 * up as a contour line in a smooth field". Returns LINEAR light.
 *
 * THE ONE EXTENSION is the hue rotation, and kit.ts is precise about why it is the safe axis: it "moves the
 * hue while holding lightness and chroma exactly. The unsafe one is trading chroma for hue, which is how a
 * warm palette turns to mud, and this cannot do it." Both halves are asserted in the gate as identities.
 */
/**
 * THE WALK ALONE, in OKLab and before the hue rotation or the decode -- split out of mhShade so kit.ts's
 * claim about it can be asserted as the IDENTITY it is rather than checked through two more transforms.
 * "mh_shade's walk is linear in the stops for any fixed t": at a fixed t this is a fixed convex combination
 * of s0..s3, so walking a mix of two palettes must equal mixing the two walks, to the last bit. That is true
 * of the lab walk and NOT of mhShade's return value, which is linear LIGHT -- the OKLab decode cubes its
 * inputs, so a row asserting the identity on the decoded colour measures 2.7e-1 and is simply asking the
 * wrong question. Measured that way first, which is why this split exists.
 */
export function mhWalk(p, t) {
    const tc = Math.min(1, Math.max(0, t));
    const mix3 = (a, b, u) => [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u];
    if (tc < 0.40) return mix3(p.s0, p.s1, smoothstep(0, 1, tc * 2.5));
    if (tc < 0.78) return mix3(p.s1, p.s2, smoothstep(0, 1, (tc - 0.40) / 0.38));
    return mix3(p.s2, p.s3, smoothstep(0, 1, (tc - 0.78) / 0.22));
}

export function mhShade(p, t, hue = 0) {
    const lab = mhWalk(p, t);

    // Decomposed into pos and neg rather than clamped to the cap, "because opal deliberately runs its spread
    // a third past MH_SPREAD". With one anchor both sides are the same rotation mirrored; with two, the
    // POSITIVE side becomes a walk toward tone2 and the negative side is left exactly as it was.
    const a = hue / MH_SPREAD;
    const pos = Math.max(a, 0), neg = Math.max(-a, 0);
    const rot = -neg * MH_SPREAD + pos * (MH_SPREAD + (p.dHue - MH_SPREAD) * p.duo);
    const w = Math.min(pos, 1) * p.duo;
    const cS = 1 + w * (p.dC - 1);
    const lS = 1 + w * (p.dL - 1);
    const ch = Math.cos(rot), sh = Math.sin(rot);
    const y = lab[1] * ch - lab[2] * sh, z = lab[1] * sh + lab[2] * ch;
    return oklabToLinear(lab[0] * lS, y * cS, z * cS);
}

/**
 * *** THE FINISH, AND THE ONE PLACE THE TWO GROUNDS ARE TOLD APART -- mh_present's tail, ported at v4643. ***
 *
 * kit.ts: "On ink the interior, rim, specular and contact bloom are all light and all belong in one energy.
 * On paper two of the four STOP BEING LIGHT: THE SPECULAR IS THE ONLY THING BRIGHTER THAN THE PAGE, so it
 * leaves the energy sum and comes back as a small mix toward a warm white; THE CONTACT BLOOM BECOMES A
 * CONTACT SHADOW, a soft neutral darkening weighted downward the way a shadow pools under a thing rather
 * than around it."
 *
 * This port had the first half of mh_present since v4627 -- railE = body + (spec + contact) * dark, the rail,
 * and the containment -- and NONE of the tail. On ink that cost exactly one term, the knee. On paper it cost
 * three, and two of them are the ones that make paper a different ground at all rather than a lighter one:
 * without the catchlight the specular is subtracted from the energy by `dark` and never comes back, so a
 * light ground LOSES its highlight instead of gaining a white one; and without the shadow the object floats.
 *
 * THE THREE TERMS, in murmur's own order and with its own numbers:
 *
 *   CATCHLIGHT   mix(rgb, lit, smoothstep(0.34, 0.92, spec) * paper), where lit is mh_lch(min(L0*1.06+0.05,
 *                1.02), 0.012, 0.9) -- "a warm white a whisper past the page, so the knee below turns it into
 *                a crisp small highlight rather than a soft one". A SMOOTHSTEP AND NOT A CLAMP, because "a
 *                soft white on a white page has no edge to be soft against, and the broad sheen mixed toward
 *                white spread the catchlight into a grey smudge half the width of the body".
 *   SHADOW       mix(rgb, inkLin * 0.55, clamp(contact * 2.60, 0, 1) * (0.06 + 1.05 * below) * paper), with
 *                below = smoothstep(-0.10, 0.66, uvY / MH_R). 0.06 above the centre line and full below it,
 *                so "the page is clean over the top of the object and darkens under it". A shadow POOLS, it
 *                does not ring.
 *   KNEE         mh_knee per channel at mix(0.90, 0.96, paper). It moves WITH the ground: 0.90 stops a bright
 *                field becoming flat white paper, but "when the ground already IS paper that same knee spends
 *                all its headroom on the page", so it opens to 0.96 and the page passes through almost
 *                untouched while the highlight still compresses rather than clipping.
 *
 * *** uvY's SIGN IS MEASURED IN THIS TREE AND NOT COPIED FROM THE SOURCE. *** murmur reads gl_FragCoord,
 * where y runs DOWN, so its +uv.y is BELOW; this port takes its quad from three's uv(). Rather than reason
 * about which way that lands after the render target and the readback -- the v4638 flux round is what asking
 * that question from the source costs -- the direction was read off the contact GLOW, which is the only term
 * outside the silhouette and which murmur already weights downward. Measured at 128 px over the annulus just
 * past the body, bottom-over-top light: limn 1.426, still 1.074, abyss 1.015. All above 1, so +y in this
 * file's body coordinates IS the image bottom and the caller passes uvY unnegated, exactly as murmur spells it.
 *
 * WHAT THIS IS NOT: mh_out. The triangular-PDF interleaved-gradient dither is still unported, so the
 * quantisation this compresses into is still the raw one. Named here rather than implied by the function's
 * name, which is why it is mhPresentFinish and not mhPresent.
 */
export function mhPresentFinish(rgb, spec, contact, uvY, pal, inkLinear) {
    return mhPresentKnee(mhPresentPaper(rgb, spec, contact, uvY, pal, inkLinear), pal.paper);
}

/** mh_present's tone knee, which MOVES with the ground: 0.90 on ink, 0.96 on paper. Per channel. */
export function mhPresentKnee(rgb, paper) {
    const knee = 0.90 + (0.96 - 0.90) * paper;
    return [mhKnee(rgb[0], knee), mhKnee(rgb[1], knee), mhKnee(rgb[2], knee)];
}

/**
 * *** THE TWO GROUND-DEPENDENT TERMS ALONE, SPLIT OUT FROM THE KNEE BECAUSE THE TWO BELONG TO DIFFERENT
 * STAGES OF THIS PORT'S PIPELINE. *** In kit.ts they sit in one function and this file's mhPresentFinish
 * still composes them that way, which is what murmurKit-selfcheck grades. But this tree has something
 * murmur's Metal path does not: render/aiPresenceOrbPresent.mjs, a port of murmur-web's OWN present.wgsl,
 * whose header states the shape outright -- "Every species renders radiance into an rgba16float target and
 * ends here, so exposure, bloom, THE TONE CURVE, the dither and the sRGB encode are WRITTEN ONCE" -- and
 * which already applies knee(x, 0.90).
 *
 * SO THE KNEE IS THE PRESENT PASS'S ON THE HDR PATH AND THE SHADER'S ON THE DIRECT ONE, exactly as the sRGB
 * encode already was: render/aiPresenceOrbTsl.mjs has ended with `linear ? colorLinear : linearToSrgb(...)`
 * since the HDR pass was built. The catchlight and the shadow are NOT in that bracket -- present.wgsl has no
 * notion of `paper`, so nothing downstream can apply them and they belong in the species shader on both paths.
 *
 * *** THIS WAS FOUND BY A GATE AND NOT BY READING. *** v4643's first cut applied the whole finish in the
 * fragment, which put a SECOND knee on the HDR path. tools/ship/aiPresenceOrbPresent-selfcheck.mjs's Y-flip
 * harness went red on it: the direct render's brightest pixel stayed at (12,12) and the pipeline's moved to
 * (17,15), because compressing an already-compressed peak flattened the lobe the argmax was reading.
 *
 * A GAP THIS LEAVES, NAMED RATHER THAN CLOSED: present.wgsl's knee is a fixed 0.90 and mh_present's moves to
 * 0.96 on paper. On ink the two agree exactly and nothing is lost; on a PAPER ground the HDR path compresses
 * at 0.90 where the direct path compresses at 0.96. Closing it means threading `paper` into the present pass,
 * which is a change to a shared post stage rather than a line here.
 */
export function mhPresentPaper(rgb, spec, contact, uvY, pal, inkLinear) {
    const paper = pal.paper;
    // *** murmur's `if (paper > 0.002)` IS AN EARLY-OUT AND NOT A BEHAVIOUR, so it is not carried. *** Both
    // weights below already have `paper` as a FACTOR, so at paper = 0 each mix is the identity and the branch
    // only saves the arithmetic. Dropping it is what makes this twin and the TSL one agree EXACTLY rather
    // than agree except on the sliver 0 < paper <= 0.002, where a branch on one side and none on the other
    // would put the pair a few thousandths apart in a place no gate would think to sample.
    const lit = oklabToLinear(...mhLch(Math.min(pal.s0[0] * 1.06 + 0.05, 1.02), 0.012, 0.9));
    const kCatch = smoothstep(0.34, 0.92, spec) * paper;
    let out = [rgb[0] + (lit[0] - rgb[0]) * kCatch, rgb[1] + (lit[1] - rgb[1]) * kCatch, rgb[2] + (lit[2] - rgb[2]) * kCatch];
    const below = smoothstep(-0.10, 0.66, uvY / MH_R);
    // *** THE SHADOW WEIGHT REACHES 1.11 AND THE MIX IS ALLOWED TO OVERSHOOT, which is murmur's own
    // arithmetic and not a slip: (0.06 + 1.05 * below) is 1.11 at below = 1, and GLSL's mix EXTRAPOLATES
    // past its endpoint there, taking the page a little darker than 0.55 of the ink. It is left exactly as
    // spelled. What murmur does NEXT is clamp, in mh_out, after the encode -- so the caller clamps, and this
    // function returns the un-clamped linear light mh_present hands on.
    const kShade = Math.min(1, Math.max(0, contact * 2.60)) * (0.06 + 1.05 * below) * paper;
    const shade = [inkLinear[0] * 0.55, inkLinear[1] * 0.55, inkLinear[2] * 0.55];
    return [out[0] + (shade[0] - out[0]) * kShade, out[1] + (shade[1] - out[1]) * kShade, out[2] + (shade[2] - out[2]) * kShade];
}

/** kit.ts's knee: identity below it, an asymptotic compression above, so a specular keeps its shape. */
export function mhKnee(x, knee) {
    return x < knee ? x : knee + (1 - knee) * (1 - Math.exp(-(x - knee) / Math.max(1 - knee, 1e-3)));
}

/**
 * THE VALUE HIERARCHY AS ONE CURVE. "Three tiers or it fails: ink ground, amber body, CREAM PEAKS." The bottom
 * 78% of the energy is compressed into the rail's first 72% -- the whole amber body -- and the last 22% of the
 * energy is spent on the rail's last 28%, where the specular lives, "so only the figure's key structure goes
 * cream, and when it goes it goes decisively rather than creeping". The join is smoothed over a fifth of the
 * range "because a slope kink in a map this shallow shows up as a contour line in a smooth field".
 */
export function mhTier(e) {
    const x = Math.min(1, Math.max(0, e));
    const K = 0.78;
    const body = (x / K) * 0.72;
    const peak = 0.72 + ((x - K) / (1 - K)) * 0.28;
    return body + (peak - body) * smoothstep(K - 0.10, K + 0.10, x);
}

/**
 * THE ONE PLACE ENERGY BECOMES LIGHT, and kit.ts says why that matters: "Every species computes a density in
 * 0..1 and hands it here, which is most of what keeps the family reading as one family."
 *
 * `glow` enters twice, "both times where it cannot lie": before the rail walk, so a lower setting walks less
 * far and reads cooler and deeper rather than merely faded, and again on the emission. AT glow = 0 A THIRD OF
 * THE ENERGY SURVIVES -- exactly 0.35 -- "because an indicator that can be switched off by a dial is a bug and
 * not a dial", which is an exact number the gate checks rather than a sentiment.
 */
export function mhLit(pal, e, glow, base, span, emis, hue = 0) {
    const G = Math.max(glow, 0);
    const en = Math.min(1, Math.max(0, mhKnee(Math.max(e, 0) * (0.35 + 0.65 * G), 0.92)));
    const tRail = Math.min(1, Math.max(0, base + span * mhTier(en)));
    const col = mhShade(pal, tRail, hue);
    // Emission is gated to the SPECULAR and not to the tone, and switched off as the ground goes light,
    // "because on paper the top of the rail is the DEEPEST colour rather than the brightest".
    const k = 1 + emis * G * (1 - pal.paper) * smoothstep(0.72, 1.0, tRail);
    return [col[0] * k, col[1] * k, col[2] * k];
}

// ---------------------------------------------------------------------------------------------------------
// COMET -- the third species. "One bright point on a tilted orbit inside the glass, trailing light."
// ---------------------------------------------------------------------------------------------------------

/** comet.ts's own four knobs and their shipped defaults, from murmur's src/styles.ts roster. */
export const COMET_DEFAULTS = Object.freeze({ orbitTilt: 0.5, trail: 0.5, pointSize: 0.4, spread: 0.3 });

/** kit.ts's mh_spin: yaw about y, then tilt about x. A rotation, so it preserves length -- asserted, not assumed. */
export function mhSpin(p, ay, ax) {
    const ca = Math.cos(ay), sa = Math.sin(ay);
    const q = [ca * p[0] + sa * p[2], p[1], -sa * p[0] + ca * p[2]];
    const cb = Math.cos(ax), sb = Math.sin(ax);
    return [q[0], cb * q[1] - sb * q[2], sb * q[1] + cb * q[2]];
}

/**
 * *** THE LIVE SIGNALS, CONDITIONED ONCE -- and until v4641 this port did not have them at all. ***
 *
 * kit.ts: "THE LIVE SIGNALS, CONDITIONED ONCE, so 'loud' and 'busy' mean the same thing across the family."
 * Every one of the eighteen species reads `live.voice` and most read `live.pace`; NONE of them reads a raw
 * level. This port fed them the raw knob at 44 sites and a STYLE knob (glintRate, which is still's own glint
 * rate from styles.ts) at 8 more, which is two different substitutions of an unconditioned number for a
 * conditioned one, in every species that ships.
 *
 * THE CURVE, in murmur's own words: "A microphone level mapped linearly spends most of its travel in the top
 * quarter and reads as a gate. Ordinary speech sits low and its interesting structure is down there, so voice
 * is raised to 0.65 -- a little stronger than a square root -- which puts a normal speaking level near two
 * thirds of the response. Cadence gets a gentler 0.85: typing rate arrives already smoothed by the host."
 *
 * THE STATE WEIGHTS: "Voice is at full strength in LISTENING and at 0.55 elsewhere. Cadence is at full
 * strength in THINKING and RESPONDING, where a token stream is the thing actually happening, and at 0.6
 * elsewhere." So the same microphone level means different things in different states, which is the whole
 * reason this is a function and not a multiply.
 *
 * THE CONSEQUENCE FOR THIS PORT IS NOT SMALL AND IT IS NOT UNIFORM. At the gates' own VOICE of 0.3, in the
 * idle state, murmur's live.voice is 0.3^0.65 * 0.55 = 0.2504 where this port was passing 0.3000 -- 20% hot.
 * At 1.0 it is 0.5500 against 1.0000, 45% hot. The error GROWS with the knob, so every species was loudest
 * exactly where it was least faithful.
 */
export function mhLive(level, activity, stateIndex) {
    const L = Math.min(1, Math.max(0, level));
    const A = Math.min(1, Math.max(0, activity));
    const listening = (stateIndex > 0.5 && stateIndex < 1.5) ? 1 : 0;
    const working = (stateIndex > 1.5 && stateIndex < 3.5) ? 1 : 0;
    return { voice: Math.pow(L, 0.65) * (0.55 + (1.00 - 0.55) * listening),
             pace: Math.pow(A, 0.85) * (0.60 + (1.00 - 0.60) * working) };
}

/**
 * *** THE STATE READ, SHARED BY EVERY SPECIES -- and this port has none of its four outputs wired yet. ***
 *
 * kit.ts: "SUCCESS (index 4) is this family's flash and it is always the same physics: THE INTERIOR IGNITES
 * AND SETTLES. `complete` is the breath of arrival: in over about a third of a second, out over the rest of
 * 1.2. `sweep` is the same window read as a position, 0 to 1 over 0.95 s, and it is what each species runs
 * the ignition ALONG. `settled` is what is left afterwards. The light in a success is NOT an overlay: every
 * species multiplies its own interior energy by (1 + complete), which brightens exactly what is already there
 * and leaves the dark dark." And: "RESPONDING (index 3) is decisive drive: `drive` ramps in over half a
 * second so entering the state is a lean and not a jolt."
 *
 * THE SWEEP IS EASED AT BOTH ENDS on purpose: "a flash that starts at full speed and stops dead is a wipe,
 * and a wipe is a UI transition rather than an arrival travelling through a material."
 *
 * *** WHAT THIS ROUND DOES AND DOES NOT DO WITH IT. *** The function is ported here, given a TSL twin in
 * murmurKitTsl.mjs, and graded against the real compiled shader by tools/ship/murmurKit-selfcheck.mjs. What
 * is NOT done is calling it from the orb: murmur's eighteen shaders reference st.drive 44 times, st.complete
 * 49, st.settled 19 and st.sweep 16, and every one of those is a transcription with its own constants.
 *
 * SO render/aiPresenceOrbTsl.mjs GAINED `activity` AND `stateIndex` THIS ROUND AND DELIBERATELY NOT
 * `stateTau`. Both of the two it gained are read -- mh_live takes all three of level, activity and state --
 * while stateTau is read by nothing until the state terms land, and a uniform nothing reads is a row that
 * cannot fail. That is the next piece and it is deliberately not this one, because `live` is a CORRECTNESS
 * fix to what already ships (a raw knob standing in for a conditioned signal) while `state` is an ABSENT
 * FEATURE, and mixing a fix with a feature makes a round whose verification cannot say which half moved.
 */
export function mhState(stateIndex, stateTau) {
    const o = { complete: 0, sweep: 0, settled: 0, drive: 0 };
    const tau = Math.max(stateTau, 0);
    const ss = (e0, e1, x) => { const u = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return u * u * (3 - 2 * u); };
    if (stateIndex > 3.5 && stateIndex < 4.5) {
        const a = Math.min(1, Math.max(0, tau / 1.20));
        o.complete = ss(0.0, 0.30, a) * (1 - ss(0.36, 1.0, a));
        o.settled = ss(0.30, 1.05, a);
        o.sweep = ss(0.0, 1.0, Math.min(1, Math.max(0, tau / 0.95)));
    } else if (stateIndex > 2.5 && stateIndex < 3.5) {
        o.drive = ss(0.0, 0.55, tau);
    }
    return o;
}

/**
 * ROLL -- the THIRD rotation, and kit.ts says exactly what goes wrong without it: "Yaw and tilt alone leave
 * every loop projecting to an ellipse whose long axis is still horizontal on screen, so three ribbons at
 * three yaws and three tilts came out as three horizontal swooshes stacked on each other, which is one
 * swoosh." It is a plain rotation in the xy plane, about the view axis, applied BEFORE yaw and tilt.
 */
export function mhRoll(p, a) {
    const c = Math.cos(a), s = Math.sin(a);
    return [c * p[0] - s * p[1], s * p[0] + c * p[1], p[2]];
}

/**
 * THE MOIRE GATE. kit.ts: a structure eases its CONTRIBUTION to nothing as it approaches a third of a cycle
 * per pixel, because past that it "stops being a form and becomes moire, which at 18 pt with the form scale
 * wound down is a real setting and not a theoretical one".
 *
 * `cycles` is the structure's wavenumber in radians per uv unit. THIS PORT EVALUATES IT AT ONE MOUNT -- the
 * nominal 120 pt that mhSmall is also read at in render/aiPresenceOrbTsl.mjs -- so for a given species it is
 * a constant. It is a FUNCTION here anyway, and not a baked number, for the reason the kit exists at all: a
 * baked number is a transcription that cannot be checked against the source it came from, and this one can.
 */
export function mhAa(cycles, sizeMin, pixelScale) {
    const px = Math.max(sizeMin, 1) * Math.max(pixelScale, 1);
    const perPixel = Math.max(cycles, 0) / (2 * Math.PI * px);
    const u = Math.min(1, Math.max(0, (perPixel - 0.16) / (0.36 - 0.16)));
    return 1 - u * u * (3 - 2 * u);
}

/**
 * *** THE CLOSED-FORM TUBE, WHICH IS WHY ARC AND SOL SHIP TOGETHER. *** A gaussian tube of width w, crossed
 * by a ray at angle alpha to the tube's own tangent, integrates ALONG THE WHOLE RAY to
 *
 *     w * sqrt(pi) / sin(alpha) * exp(-perp^2 / w^2)
 *
 * and that is the entire reason either species can draw a line at all. arc.ts states the constraint it
 * escapes: "A MARCHED FILAMENT CANNOT BE THINNER THAN ITS MARCH. At ten steps down a two-unit chord the
 * interval is 0.2, so a tube narrower than that is caught by whichever tap lands in it and missed otherwise,
 * and the line renders dim, uneven and flickering. Widening it to 0.125 was the only way to make ten taps
 * honest, and the verdict on that was a fat slug of light." sol.ts reaches the same formula from the other
 * side -- "THE PROMINENCES ... are integrated the way arc's filament is" -- and adds what it costs to get it
 * wrong in the other direction: "A closed-form line integral returns a LENGTH ... where a march returns a sum
 * of samples times a step, and the two are nowhere near the same scale. Carrying a marched hero's gain across
 * put every tongue five times over the rail's top."
 *
 * SO THE GAIN IS PART OF THE FORMULA'S MEANING AND NOT A TASTE SETTING, and the two species' gains differ by
 * more than five times (arc 35.0, sol 6.60) for that reason rather than despite it.
 *
 * `sinA` is floored by the CALLER, not here, because the two species floor it differently and for different
 * stated reasons -- arc at 0.58 because 1/sin at three and a third "put a bright BULGE wherever the filament
 * leaned toward the viewer", sol at 0.55. A floor baked in here would have silently overridden one of them.
 */
export const MH_SQRTPI = 1.7724539;
export function mhTube(w, sinA, perp2) {
    return (w * MH_SQRTPI / sinA) * Math.exp(-perp2 / (w * w));
}

/**
 * The orbit plane. comet.ts: "A tilt about x, then a slow eased precession about y, so the plane's edge-on
 * moment never lands twice in the same place. The tilt is bounded away from both failures: FACE-ON IS A CIRCLE
 * DRAWN ON THE GLASS, EDGE-ON IS A LINE." tau runs 0.30..1.05 radians for exactly that reason.
 */
export function cometBasis(tiltK, prec) {
    const tau = 0.30 + (1.05 - 0.30) * Math.min(1, Math.max(0, tiltK));
    const e1 = mhSpin([1, 0, 0], prec, 0);
    const e2 = mhSpin([0, Math.sin(tau), Math.cos(tau)], prec, 0);
    const nrm = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
    return { tau, e1, e2, nrm };
}

/**
 * *** THE TRAIL IS NOT A HISTORY BUFFER, AND COULD NOT BE. *** comet.ts: "these shaders are stateless by
 * contract: any time value has to render the correct frame. So the trail is solved geometrically instead."
 *
 * The orbit is a circle in a plane, so the nearest point on it is closed form: project into the plane's basis,
 * pull the in-plane component out to the orbit radius, and the leftover is the distance to the tube. The angle
 * of that nearest point, subtracted from the head's angle and wrapped, IS how long ago the head was there.
 *
 * Returns { dist2, psiP } -- squared distance to the orbit tube, and the nearest point's own angle.
 */
export function cometNearest(p, { e1, e2, nrm }, r0) {
    const u = dot3(p, e1), v = dot3(p, e2), w = dot3(p, nrm);
    const q = Math.hypot(u, v);
    const dq = q - r0;
    return { dist2: dq * dq + w * w, psiP: Math.atan2(v, u) };
}

/**
 * The trail's fall with age, in radians behind the head.
 *
 * *** IT IS TAKEN TO ZERO AT BOTH ENDS OF THE WRAPPED INTERVAL, AND comet.ts RECORDS WHAT HAPPENED WHEN IT WAS
 * NOT. *** "At a decay of 2.0 the trail is still at a fifth when it comes round to meet its own head, and the
 * scatter halo carried that step out into a wide swath: what drew was a hard-edged wedge cut through the glass
 * along the head's own radius. Two soft gradients meeting is a gradient; A SOFT GRADIENT MEETING A STEP IS THE
 * STEP." So: an exponential behind the head faded out before pi, and a short coma ahead of it gone by -pi.
 * They meet at the head at exactly 1, with a kink rather than a step -- and the kink sits under the head's own
 * bloom, "which is where a comet keeps it too".
 */
export function cometFall(age, decay) {
    if (age >= 0) return Math.exp(-age / Math.max(decay, 1e-3)) * (1 - smoothstep(2.30, 3.1416, age));
    return Math.exp(age / 0.30);
}

/** still.ts's glint slot length: ~11.5 s at rate 0 down to ~7 s at rate 1, shortened by pace and drive. */
export function stillGlintSlot(glintRate, { pace = 0, drive = 0 } = {}) {
    const k = Math.min(1, Math.max(0, glintRate));
    return (11.5 + (7.0 - 11.5) * k) / (1.0 + 0.30 * pace + 1.70 * drive);
}
