// WebGLEngine/physics/mechanics/subSonar.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// WHAT A SUBMARINE CAN HEAR AND SEE. Radio waves do not travel in sea water, so a submarine's "radar" is sonar, and sonar is a budget in decibels: a source SHOUTS (source level), the sea THINS the sound out
// (transmission loss), the listener's own machinery and the ocean MASK it (noise), the array FOCUSES it (directivity gain), and a contact exists only if what is left clears a detection threshold:
//
//     SNR = SL - TL(r) - NL + DI          detected when SNR + (a few dB of luck) >= DT
//
// THE NUMBERS ARE A TOY, said plainly: relative dB chosen so the arena is a few hundred metres across and the TRADE-OFFS come out right -- they are not calibrated to any real sonar or any real boat.
//   SL    a boat's radiated noise: 100 dB at <= 0.5 m/s, +20 log10(v / 0.5) above that (112 at 2 m/s, 119 at the 4.55 m/s top speed): GOING FAST MAKES YOU LOUD. A torpedo is 125 dB. A ping is 150.
//   TL    spherical spreading and 1 dB per km of absorption: 20 log10(r) + 0.001 r.
//   NL    the ocean (66 dB) added in POWER to the listener's own flow noise, 50 dB at <= 0.5 m/s, +20 log10(v / 0.5): GOING FAST MAKES YOU DEAF TOO.
//   DI    15 dB for a boat's array (a torpedo seeker: see subTorpedo.mjs, which uses this module's budget with its own noise and gain).     DT  8 dB.
//   Which gives, in this toy: two boats at 2 m/s hear each other at ~364 m, a boat creeping at 0.5 m/s is heard from ~94 m, one at the 4.5 m/s top speed from ~780 m (all for a listener at 2 m/s).
//
// PASSIVE listening (listen): the contact is a BEARING and an ELEVATION and NO RANGE -- a passive array knows where the sound comes from, not how far. Bearing is RELATIVE to the nose, positive to the RIGHT (the engine's
//   convention: a right turn increases the heading, world +y is the vessel's left); its noise shrinks as the signal grows: sd = 5 degrees at the threshold, falling 20 dB per decade, never under 0.3 degrees; elevation
//   is twice as noisy. The SNR itself has 3 dB of luck either way (per look). A target astern, inside the 60-degree BAFFLES of the boat's own wake, is not heard at all.
// ACTIVE pinging (ping): the echo of a 150 dB ping off a target of strength 15 dB pays the transmission loss TWICE, so it reaches ~392 m: a little more than a 2 m/s boat is heard passively, 364 m (the active sonar's gift is range) --
//   and far further than a 0.5 m/s creeping boat's ~94 m (the gift is the QUIET boat). The echo has a bearing, an elevation AND A RANGE (1% plus 1 m). THE COST: every boat within ~10 km hears the ping (pingHeard) --
//   the pinger announces itself, with a bearing to it and no more.
//
// Sonar looks happen at 2 Hz in the duel (every 15th tick); this module is a pure function of ONE look: its platforms (a position, a heading and a speed), a seed, a tick and a channel. The luck is a hash, not a clock.
// Pure: no DOM, no Math.random, no clock.
"use strict";
import { attitude } from "./subModel6dof.mjs";

export const SONAR = Object.freeze({
    slBase: 100, slFloor: 0.5, torpedoSL: 125, pingSL: 150, targetStrength: 15,
    ambient: 66, selfBase: 50, di: 15, dt: 8, absorption: 0.001, luckSd: 3,
    bearingSdAtThreshold: 5 * Math.PI / 180, bearingSdFloor: 0.3 * Math.PI / 180, elevationFactor: 2, rangeSdFraction: 0.01, rangeSdFloor: 1, bafflesHalfAngle: 30 * Math.PI / 180,
});

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const log10 = Math.log10;

/** A boat's radiated noise (dB) at a speed through the water: 100 at <= 0.5 m/s, +20 log10(v / 0.5) above. */
export const sourceLevel = (speed) => SONAR.slBase + 20 * log10(Math.max(Math.abs(speed), SONAR.slFloor) / SONAR.slFloor);
/** The listener's own flow noise (dB) at its speed: 50 at <= 0.5 m/s, +20 log10(v / 0.5). */
export const selfNoise = (speed) => SONAR.selfBase + 20 * log10(Math.max(Math.abs(speed), SONAR.slFloor) / SONAR.slFloor);
/** The total masking noise (dB) for a listener at a speed: the ocean and the boat's own flow noise ADDED IN POWER. `extra` replaces the own-noise term (a torpedo seeker). */
export const noiseLevel = (speed, ambient = SONAR.ambient, own = selfNoise(speed)) => 10 * log10(10 ** (ambient / 10) + 10 ** (own / 10));
/** Transmission loss (dB) over a range: spherical spreading plus absorption. Ranges under 1 m are read as 1 m. */
export const transmissionLoss = (r) => 20 * log10(Math.max(r, 1)) + SONAR.absorption * Math.max(r, 1);
/** The one-way signal-to-noise (dB) of a source of level `sl` heard at `range` by a listener at `speed` (or with the given `nl` and `di`). */
export const passiveSNR = ({ sl, range, speed = 0, nl = noiseLevel(speed), di = SONAR.di }) => sl - transmissionLoss(range) - nl + di;
/** The two-way signal-to-noise (dB) of an active echo at `range` for a pinger at `speed`: the ping pays the loss out and the echo pays it back. */
export const activeSNR = ({ range, speed = 0, sl = SONAR.pingSL, ts = SONAR.targetStrength }) => sl + ts - 2 * transmissionLoss(range) - noiseLevel(speed) + SONAR.di;

/** The range (m) at which an SNR function (monotone falling in range) crosses `target` dB, by bisection on 1..100,000 m; 100,000 if it never does, 1 if it is already below at 1 m. */
export function rangeWhere(snrAt, target = SONAR.dt) {
    if (snrAt(1) < target) return 1;
    let lo = 1, hi = 1e5; if (snrAt(hi) >= target) return hi;
    for (let i = 0; i < 80; i++) { const mid = (lo + hi) / 2; if (snrAt(mid) >= target) lo = mid; else hi = mid; }
    return lo;
}
/** The passive detection range (m) of a source of level `sl` for a listener at `speed`: where the unlucky-less SNR equals the threshold. */
export const passiveRange = (sl, speed) => rangeWhere((r) => passiveSNR({ sl, range: r, speed }));
/** The active detection range (m) of a pinger at `speed`. */
export const activeRange = (speed) => rangeWhere((r) => activeSNR({ range: r, speed }));
/** The longest range at which a ping is still HEARD (one way) by a listener at `speed`. */
export const pingHeardRange = (speed) => rangeWhere((r) => passiveSNR({ sl: SONAR.pingSL, range: r, speed }));

/** A platform for the sonar: { pos: [x, y, z], heading, speed } from a vessel state (speed through the water). */
export function platformOf(state, current = [0, 0, 0]) { const a = attitude(state, current); return { pos: state.pos, heading: a.heading, speed: a.speed }; }

/** From one platform to another: { range, bearing (relative to the nose, right positive), elevation (up positive), absolute (the heading that points at it) }. */
export function geometry(from, to) {
    const dx = to.pos[0] - from.pos[0], dy = to.pos[1] - from.pos[1], dz = to.pos[2] - from.pos[2], h = Math.hypot(dx, dy), absolute = Math.atan2(-dy, dx);
    return { range: Math.hypot(h, dz), bearing: wrap(absolute - from.heading), elevation: Math.atan2(dz, h), absolute };
}
/** Is a relative bearing inside the boat's baffles (the 60 degrees dead astern, where its own wake deafens it)? */
export const inBaffles = (bearing) => Math.abs(wrap(bearing)) > Math.PI - SONAR.bafflesHalfAngle;

const mulberry = (a) => () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
/** Deterministic, roughly gaussian luck (unit sd) from a seed, a tick and a channel. */
export function luck(seed, tick, channel) {
    const r = mulberry((Math.imul(seed + 11, 0x9E3779B1) ^ Math.imul(tick + 1, 0x85EBCA6B) ^ Math.imul(channel + 5, 0xC2B2AE35)) >>> 0);
    return (r() + r() + r() + r() - 2) * Math.sqrt(3);
}
const bearingSd = (snr) => Math.max(SONAR.bearingSdFloor, SONAR.bearingSdAtThreshold * 10 ** (-(snr - SONAR.dt) / 20));

/**
 * One passive look: `listener` hears `source` (platforms) radiating `sl` dB (default the source's own noise at its speed). Returns null (nothing heard: out of range, in the baffles, unlucky) or a contact
 * { bearing, elevation, snr } -- A BEARING AND NO RANGE. `channel` separates independent looks in one tick (the listener's id).
 */
export function listen(listener, source, { seed = 0, tick = 0, channel = 0, sl = sourceLevel(source.speed), nl = noiseLevel(listener.speed), di = SONAR.di } = {}) {
    const g = geometry(listener, source);
    if (inBaffles(g.bearing)) return null;
    const snr = passiveSNR({ sl, range: g.range, nl, di }) + SONAR.luckSd * luck(seed, tick, 4 * channel);
    if (snr < SONAR.dt) return null;
    const sd = bearingSd(snr);
    return { bearing: wrap(g.bearing + sd * luck(seed, tick, 4 * channel + 1)), elevation: clamp(g.elevation + SONAR.elevationFactor * sd * luck(seed, tick, 4 * channel + 2), -Math.PI / 2, Math.PI / 2), snr };
}

/** One active look: `pinger` pings and `target` is the platform that may echo. Returns null or an echo { bearing, elevation, range, snr } (the range noisy by 1% plus 1 m). */
export function ping(pinger, target, { seed = 0, tick = 0, channel = 0 } = {}) {
    const g = geometry(pinger, target);
    if (inBaffles(g.bearing)) return null;
    const snr = activeSNR({ range: g.range, speed: pinger.speed }) + SONAR.luckSd * luck(seed, tick, 4 * channel + 3);
    if (snr < SONAR.dt) return null;
    const sd = bearingSd(snr), rsd = Math.max(SONAR.rangeSdFloor, SONAR.rangeSdFraction * g.range);
    return { bearing: wrap(g.bearing + sd * luck(seed, tick, 4 * channel + 1)), elevation: clamp(g.elevation + SONAR.elevationFactor * sd * luck(seed, tick, 4 * channel + 2), -Math.PI / 2, Math.PI / 2), range: Math.max(0, g.range + rsd * luck(seed, tick, 4 * channel + 4)), snr };
}

/** Does `listener` hear `pinger`'s ping? Returns null or { bearing, snr } (the bearing TO the pinger, relative to the listener's nose, noisy 2 degrees; NO RANGE). A ping is loud: it is heard from ~10 km. */
export function pingHeard(listener, pinger, { seed = 0, tick = 0, channel = 0 } = {}) {
    const g = geometry(listener, pinger), snr = passiveSNR({ sl: SONAR.pingSL, range: g.range, speed: listener.speed }) + SONAR.luckSd * luck(seed, tick, 4 * channel);
    if (snr < SONAR.dt) return null;
    return { bearing: wrap(g.bearing + (2 * Math.PI / 180) * luck(seed, tick, 4 * channel + 1)), snr };
}

export function reportLines() {
    return [
        `[subSonar] passive: a boat at 0.5 / 2 / 4.5 m/s is heard from ${passiveRange(sourceLevel(0.5), 2).toFixed(0)} / ${passiveRange(sourceLevel(2), 2).toFixed(0)} / ${passiveRange(sourceLevel(4.5), 2).toFixed(0)} m by a listener at 2 m/s; a torpedo from ${passiveRange(SONAR.torpedoSL, 2).toFixed(0)} m`,
        `  active: a ping at 2 m/s reaches ${activeRange(2).toFixed(0)} m and is heard from ${(pingHeardRange(2) / 1000).toFixed(1)} km; the listener's own speed costs it: passive range of a 2 m/s boat is ${passiveRange(sourceLevel(2), 0.5).toFixed(0)} m at 0.5 m/s and ${passiveRange(sourceLevel(2), 4.5).toFixed(0)} m at 4.5`,
    ];
}
if (typeof process !== "undefined" && Array.isArray(process.argv)) {
    const { pathToFileURL } = await import("node:url");
    if (import.meta.url === pathToFileURL(process.argv[1] || "").href) { for (const l of reportLines()) console.log(l); process.exit(0); }
}
