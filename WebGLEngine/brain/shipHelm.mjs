// WebGLEngine/brain/shipHelm.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// THE SHIP'S SEAT: THE HELM (Keith, 2026-11-28: "Could the ships have ai brain seats like the subs do?" -- "then sub vs ship"). A surface ship (physics/mechanics/surfaceShip.mjs)
// is steered the way a sub's tactician steers a boat (brain/subTactics.mjs): at every look it is handed what its own hull sonar hears and answers { heading, speed }. This file
// is the seat and its first three occupants, HAND-WRITTEN like the subs' scripted drones; a learned or connectome helm takes the same seat later (the contract is the seat).
//
//   obs = { t (s), self: { x, y, heading, speed, hp, cls, maxSpeed }, contacts: [{ kind: "torpedo" | "boat", bearing (rad, relative to the bow, + to starboard ... the subs'), snr }] }
//   decide(obs) -> { heading, speed }
//
//   steady    holds its course at cruise (60% of its top speed): a target
//   zigzag    legs of `leg` seconds, alternately `angle` rad either side of its base course, at cruise: what a convoy did
//   evade     zigzag until it HEARS A TORPEDO, then for `evadeTime` s turns to put the torpedo astern (the bearing plus pi: "combing" the track, the smallest target and the
//             longest chase) at full speed; then back to zigzag on its base course
// Pure: no DOM, no Math.random, no clock.
"use strict";
export const HELMS = Object.freeze(["steady", "zigzag", "evade"]);
export const HELM_DEFAULTS = Object.freeze({ cruise: 0.6, leg: 60, angle: 0.6, evadeTime: 60 });
const wrap = (a) => { a = (a + Math.PI) % (2 * Math.PI); if (a < 0) a += 2 * Math.PI; return a - Math.PI; };

/** A helm of kind `kind` on base course `base` (rad). Returns decide(obs). */
export function makeHelm(kind = "zigzag", { base = 0, ...opts } = {}) {
    if (!HELMS.includes(kind)) throw new Error(`shipHelm.makeHelm: unknown helm "${kind}" (${HELMS.join(", ")})`);
    const P = { ...HELM_DEFAULTS, ...opts };
    let evadeUntil = -1, evadeHeading = 0;
    return function decide(obs) {
        const s = obs.self, cruise = P.cruise * s.maxSpeed;
        if (kind === "steady") return { heading: base, speed: cruise };
        if (kind === "evade") {
            const torp = (obs.contacts || []).filter((c) => c.kind === "torpedo").sort((a, b) => b.snr - a.snr)[0];
            if (torp) { evadeUntil = obs.t + P.evadeTime; evadeHeading = wrap(s.heading + torp.bearing + Math.PI); }
            if (obs.t < evadeUntil) return { heading: evadeHeading, speed: s.maxSpeed };
        }
        const legNo = Math.floor(obs.t / P.leg);
        return { heading: wrap(base + (legNo % 2 === 0 ? P.angle : -P.angle)), speed: cruise };
    };
}
