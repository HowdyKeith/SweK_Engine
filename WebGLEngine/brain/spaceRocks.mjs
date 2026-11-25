// WebGLEngine/brain/spaceRocks.mjs -- UNNUMBERED (the version is chosen at ship time) (the gate is brain/spaceRocks-selfcheck.mjs)
//
// A ROCK FIELD FOR THE SPACE ARENA (Keith, 2026-11-25: "Rock field first" -- backlog nav-match-consumes-layer was parked because no space scene had anything
// to route around). Static spheres, placed per seed on a stream of their own, in the band between the fighters' starting shell and the ship, centred on the
// attack's bearing so they lie across the approaches. brain/spaceArena.mjs takes them as the option `rocks` (default none: every fight pinned without it is the
// same fight, bit for bit); brain/battleshipFight.mjs builds them from the option `rocks` (a count, default 0).
//   a FIGHTER that touches a rock is lost: status "struck", an event { type: "rock" };
//   a CAPITAL SHIP that touches a rock takes ROCK_DAMAGE, once per rock, and the rock stays;
//   a ROUND that reaches a rock stops there: rocks are cover. They take part in flightGuns.stepRounds as targets with ids below ROCK_ID_BASE, and those hits
//   are stripped before the arena reads its hits, so a rock is never a victim and never confused with the friendly-fire branch's negated own-part ids.
// WHAT IS NOT HERE: rocks do not move, spin, break or block sight; the autopilot does not know they exist (that is the point of the round that follows).
// Pure: no I/O, no clock, no Math.random.
"use strict";

export const ROCK_DEFAULTS = Object.freeze({ count: 24, rMin: 8, rMax: 20, dMin: 150, dMax: 330, spread: 0.6, elevation: 0.5 });
export const ROCK_DAMAGE = 100;
/** Rock ids handed to flightGuns.stepRounds: -(ROCK_ID_BASE + k). Far below any craft id and any negated craft id. */
export const ROCK_ID_BASE = 1e6;

const mulberry = (a) => () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const CENTRE = Object.freeze({ bow: 0, stern: Math.PI });

/**
 * The rock field of a seed and a kind (battleshipFight's kinds): [{ pos, radius }], frozen. Its own stream, seed*17+11, so a fight's fighters are where they
 * were. Azimuth around the kind's bearing (swarm: anywhere; beam: either side, rock by rock), elevation within +-`elevation`, distance dMin-dMax from the ship.
 */
export function rockField(seed, kind, opts = {}) {
    const o = { ...ROCK_DEFAULTS, ...opts };
    if (!Number.isInteger(o.count) || o.count < 0) throw new Error(`spaceRocks.rockField: count must be a whole number, 0 or more (got ${o.count})`);
    const r = mulberry(seed * 17 + 11), u = (lo, hi) => lo + (hi - lo) * r(), out = [];
    for (let k = 0; k < o.count; k++) {
        let az;
        if (kind === "swarm") az = u(-Math.PI, Math.PI);
        else { const c = kind in CENTRE ? CENTRE[kind] : (r() < 0.5 ? Math.PI / 2 : -Math.PI / 2); az = c + u(-o.spread, o.spread); }
        const el = u(-o.elevation, o.elevation), d = u(o.dMin, o.dMax), radius = u(o.rMin, o.rMax);
        out.push(Object.freeze({ pos: Object.freeze([d * Math.cos(el) * Math.cos(az), d * Math.cos(el) * Math.sin(az), d * Math.sin(el)]), radius }));
    }
    return Object.freeze(out);
}

/** The rocks as flightGuns.stepRounds targets (static: from === to). */
export const rockTargets = (rocks) => rocks.map((q, k) => ({ id: -(ROCK_ID_BASE + k), from: q.pos, to: q.pos, radius: q.radius }));
/** Is a stepRounds hit a rock's? */
export const isRockHit = (h) => h.target <= -ROCK_ID_BASE;
/** Split a stepRounds result: { hits (the craft hits, unchanged), rockHits }. The rounds that hit a rock are already gone from `rounds`. */
export function stripRockHits(res) {
    const hits = [], rockHits = [];
    for (const h of res.hits) (isRockHit(h) ? rockHits : hits).push(h);
    return { rounds: res.rounds, hits, rockHits };
}
/** The index of the first rock a sphere at `pos` of radius `radius` touches, or -1. */
export function touchedRock(rocks, pos, radius) {
    for (let k = 0; k < rocks.length; k++) { const q = rocks[k]; if (Math.hypot(pos[0] - q.pos[0], pos[1] - q.pos[1], pos[2] - q.pos[2]) < q.radius + radius) return k; }
    return -1;
}
