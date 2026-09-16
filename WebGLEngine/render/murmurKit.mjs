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
    nebula: Object.freeze({ scale: 2.20, warp: 1.30, small: 0.58, foldB: 0.30, foldK: 0.70,
                            drB: 0.052, drK: 0.055, drLane: 2.0, dLo: -0.20, dHi: 0.30,
                            gLo: 0.30, gK: 0.95, gFar: 0.88, absorb: 3.10, emitB: 0.62, emitK: 0.85,
                            gain: 3.30, voiceE: 0.75 }),
    tempest: Object.freeze({ scale: 2.55, warp: 1.45, small: 0.55, foldB: 0.42, foldK: 0.80,
                             drB: 0.070, drK: 0.075, drLane: 3.0, dLo: -0.12, dHi: 0.46,
                             gLo: 0.26, gK: 0.72, gFar: 0.90, absorb: 3.60, emitB: 0.58, emitK: 0.72,
                             gain: 6.20, voiceE: 0.85 }),
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
