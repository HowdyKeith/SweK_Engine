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
