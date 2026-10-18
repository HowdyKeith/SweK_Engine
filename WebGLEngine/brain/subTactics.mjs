// WebGLEngine/brain/subTactics.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// WHAT A SUBMARINE DECIDES WHEN IT CAN HEAR: the TACTICS layer of the duel (brain/subDuel.mjs). A tactician sees ONLY what sonar gives it -- bearings, elevations, a range from an echo, torpedo noise, a ping heard --
// plus its own gauges (depth, heading, speed, position, hit points, torpedoes left), and answers every look (2 Hz) with { depth, heading, speed, fire, ping }: where to go, whether to fire a torpedo NOW along
// the nose, whether to ping NOW. The MOTION layer under it (the PD autopilot of brain/autopilotSub.mjs, or the connectome-wired network of brain/pilotSubPolicy.mjs) turns "depth, heading, speed" into plane, rudder,
// screw and tank, exactly as it does for every task before this one. It never sees the other boat's true position.
//
//   THE HAND TACTICIAN (makeTactician(theta)) is a small state machine, the baseline and the start of the search:
//     EVADE   a torpedo heard (torpedo noise is loud: ~1.4 km) -> for evadeTime seconds turn evadeTurn off its bearing, go to evadeSpeed (0.5 creeps and hides, 4.5 runs and shouts) and change depth by 12 m; no firing.
//     ATTACK  a fresh echo (younger than echoWindow) gives a range and a bearing: the target's position is estimated, the boat points its nose at it and fires when it is inside fireRange and the nose is within
//             aimTol of the estimate. (Torpedoes go where the NOSE points: a boat that cannot aim cannot shoot.) blindSnr > 0 also fires on a passive contact louder than that many dB (a loud contact is a near one).
//     TRACK   a passive contact (or a ping heard) in the last 10 s: turn toward its bearing at trackSpeed; after pingAfter contacts, and no sooner than pingEvery seconds since the last, PING (it buys a range and
//             tells every boat within ten kilometres where you are).
//     SEARCH  otherwise sweep: hold the starting depth at searchSpeed, turning 0.8 rad one way then the other every 40 s. With searchPing >= 1 it also PINGS every searchPing seconds while it hears nothing: the only way to
//             find a boat creeping at 0.5 m/s (heard passively from ~94 m, echoed from ~392 m) -- at the price of announcing itself to everything within ten kilometres. 0 (the default) never pings blind; a value under 1 reads as 0.
//   theta is a vector of NAMES -> numbers (THETA_DEFAULT); the search (a (1+1)-ES) mutates it.
//
//   THE SCRIPTED OPPONENTS (scripted(kind, sc)) are the drones the baseline is graded against: patrol (a steady 2 m/s, drifting its heading, deaf and mute), quiet (the same at 0.5 m/s: nearly inaudible),
//   evader (patrol that evades torpedoes with the hand tactician's evade), hunter (the hand tactician itself, with default theta: an equal that shoots back).
//
// Pure: no DOM, no Math.random, no clock. A tactician is a closure with its own memory: make one per duel.
"use strict";

export const THETA_DEFAULT = Object.freeze({ searchSpeed: 2.0, trackSpeed: 1.5, evadeSpeed: 4.0, fireRange: 320, aimTol: 0.17, pingAfter: 2, echoWindow: 8, evadeTime: 20, evadeTurn: 1.4, blindSnr: 99, pingEvery: 12, searchPing: 0 });
export const THETA_BOUNDS = Object.freeze({ searchSpeed: [0.5, 4.5], trackSpeed: [0.5, 4.5], evadeSpeed: [0.5, 4.5], fireRange: [60, 500], aimTol: [0.03, 0.6], pingAfter: [1, 6], echoWindow: [2, 20], evadeTime: [5, 40], evadeTurn: [0.4, 2.8], blindSnr: [15, 99], pingEvery: [4, 40], searchPing: [0, 40] });
export const THETA_NAMES = Object.freeze(Object.keys(THETA_DEFAULT));

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const DEPTH_MIN = 15, DEPTH_MAX = 42;

/** theta clipped into THETA_BOUNDS (every name present; a missing one takes the default; pingAfter rounded). */
export function clampTheta(theta = {}) {
    const o = {}; for (const k of THETA_NAMES) { const [lo, hi] = THETA_BOUNDS[k]; const v = Number.isFinite(theta[k]) ? theta[k] : THETA_DEFAULT[k]; o[k] = clamp(k === "pingAfter" ? Math.round(v) : v, lo, hi); }
    return Object.freeze(o);
}
export const thetaToVector = (theta) => THETA_NAMES.map((k) => theta[k]);
export const thetaFromVector = (vec) => clampTheta(Object.fromEntries(THETA_NAMES.map((k, i) => [k, vec[i]])));

/** The world position `range` metres along a sonar line from `self` at an ABSOLUTE bearing and an elevation (up positive): the engine's heading, 0 = +x, a right turn increases it. */
export function pointAlong(self, absBearing, elevation, range) {
    const c = Math.cos(elevation);
    return [self.x + range * c * Math.cos(absBearing), self.y - range * c * Math.sin(absBearing), -self.depth + range * Math.sin(elevation)];
}

/** The evade order for a torpedo contact `c` heard by a boat `s`: turn evadeTurn off its bearing (away from the side it is on), change depth by 12 m (away from the middle band). */
export function evadeOrder(s, c, th) {
    const abs = wrap(s.heading + c.bearing);
    return { heading: wrap(abs + (c.bearing >= 0 ? -th.evadeTurn : th.evadeTurn)), depth: clamp(s.depth < 30 ? s.depth + 12 : s.depth - 12, DEPTH_MIN, DEPTH_MAX) };
}

/**
 * A hand tactician with parameters `theta`. Returns decide(obs) -> { depth, heading, speed, fire, ping }. obs = { t (s), self: { depth, heading, speed, x, y, hp, ammo, ready (a tube can fire),
 * contacts: [{ kind: "boat" | "torpedo", bearing (relative to the nose, right positive), elevation, snr }], echoes: [{ bearing, elevation, range }], pings: [{ bearing }] }. Memory lives in the closure.
 * `canFire` / `canPing` / `canEvade` switch abilities off (the scripted drones use them).
 */
export function makeTactician(theta = THETA_DEFAULT, { canFire = true, canPing = true, canEvade = true } = {}) {
    const th = clampTheta(theta);
    let startDepth = null, startHeading = null, evadeUntil = -1, evade = null, est = null, lastPingT = -1e9, contactTimes = [], lastAbs = null, lastSnr = 0;
    return function decide(obs) {
        const s = obs.self, t = obs.t;
        if (startDepth === null) { startDepth = s.depth; startHeading = s.heading; }
        const out = { depth: s.depth, heading: s.heading, speed: th.searchSpeed, fire: false, ping: false };
        // ---- EVADE ----
        const torp = obs.contacts.filter((c) => c.kind === "torpedo");
        if (canEvade && torp.length) {
            const c = torp.reduce((a, b) => (b.snr > a.snr ? b : a));
            evadeUntil = t + th.evadeTime; evade = evadeOrder(s, c, th);
        }
        if (canEvade && t < evadeUntil && evade) return { depth: evade.depth, heading: evade.heading, speed: th.evadeSpeed, fire: false, ping: false };
        // ---- what the sonar says ----
        for (const c of obs.contacts) if (c.kind === "boat") { contactTimes.push(t); lastAbs = { t, bearing: wrap(s.heading + c.bearing), elevation: c.elevation }; lastSnr = c.snr; }
        for (const p of obs.pings) { contactTimes.push(t); lastAbs = { t, bearing: wrap(s.heading + p.bearing), elevation: 0 }; lastSnr = 0; }
        contactTimes = contactTimes.filter((x) => t - x <= 10);
        for (const e of obs.echoes) est = { t, pos: pointAlong(s, wrap(s.heading + e.bearing), e.elevation, e.range) };
        // ---- ATTACK ----
        if (est && t - est.t <= th.echoWindow) {
            const dx = est.pos[0] - s.x, dy = est.pos[1] - s.y, dz = est.pos[2] + s.depth, range = Math.hypot(dx, dy, dz), want = Math.atan2(-dy, dx), off = Math.abs(wrap(want - s.heading));
            out.heading = want; out.depth = clamp(-est.pos[2], DEPTH_MIN, DEPTH_MAX); out.speed = th.trackSpeed;
            if (canFire && s.ammo > 0 && s.ready && range <= th.fireRange && off <= th.aimTol) out.fire = true;
            return out;
        }
        // ---- TRACK ----
        if (lastAbs && t - lastAbs.t <= 10) {
            out.heading = lastAbs.bearing; out.speed = th.trackSpeed;
            if (canFire && s.ammo > 0 && s.ready && lastSnr >= th.blindSnr && Math.abs(wrap(lastAbs.bearing - s.heading)) <= th.aimTol && obs.contacts.some((c) => c.kind === "boat")) out.fire = true;
            if (canPing && contactTimes.length >= th.pingAfter && t - lastPingT >= th.pingEvery) { out.ping = true; lastPingT = t; }
            return out;
        }
        // ---- SEARCH ----
        out.heading = wrap(startHeading + (Math.floor(t / 40) % 2 === 0 ? 0.8 : -0.8)); out.depth = startDepth; out.speed = th.searchSpeed;
        if (canPing && th.searchPing >= 1 && t - lastPingT >= th.searchPing) { out.ping = true; lastPingT = t; }
        return out;
    };
}

export const SCRIPTED_KINDS = Object.freeze(["patrol", "quiet", "evader", "hunter"]);
/** A scripted opponent for a duel scenario: a tactician with the same decide(obs) contract. */
export function scripted(kind, sc = {}) {
    if (!SCRIPTED_KINDS.includes(kind)) throw new Error(`subTactics.scripted: unknown kind "${kind}" (${SCRIPTED_KINDS.join(", ")})`);
    if (kind === "hunter") return makeTactician(THETA_DEFAULT);
    if (kind === "evader") {
        const th = clampTheta(THETA_DEFAULT), drift = sc.drift || 0.004; let h0 = null, until = -1, order = null;
        return (obs) => {
            const s0 = obs.self, torp = obs.contacts.filter((c) => c.kind === "torpedo");
            if (h0 === null) h0 = s0.heading;
            if (torp.length) { until = obs.t + th.evadeTime; order = evadeOrder(s0, torp.reduce((a, b) => (b.snr > a.snr ? b : a)), th); }
            if (obs.t < until && order) return { depth: order.depth, heading: order.heading, speed: th.evadeSpeed, fire: false, ping: false };
            return { depth: s0.depth, heading: wrap(h0 + drift * obs.t), speed: 2.0, fire: false, ping: false };
        };
    }
    const speed = kind === "quiet" ? 0.5 : 2.0, drift = sc.drift || 0.004; let h0 = null;
    return (obs) => { if (h0 === null) h0 = obs.self.heading; return { depth: obs.self.depth, heading: wrap(h0 + drift * obs.t), speed, fire: false, ping: false }; };
}
