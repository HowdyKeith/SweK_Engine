// WebGLEngine/physics/mechanics/subTorpedo.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// A TORPEDO FOR THE SUBMARINE ARENA: a small, fast, quick-turning body that is fired along its launcher's nose, runs straight until its seeker hears something, and then homes on the noise. It is a POINT with a
// heading, a pitch and a speed (not a 6-DOF rigid body): a torpedo is steered by rate-limited turns, and the whole interest is in the geometry of the chase, which a point shows exactly.
//
//   RUN      launched at 2 m/s ALONG THE LAUNCHER'S NOSE, accelerating at 1.5 m/s^2 to a 6.5 m/s cruise (faster than any boat's 4.55 m/s top: it cannot be outrun in a straight line); it burns for 90 s (585 m of run) and expires.
//            It turns at most 0.25 rad/s in heading and 0.15 rad/s in pitch (a boat turns slower than it dives: a hard turn is how a boat shakes one off), pitch within +-0.6 rad, and is lost above 3 m depth or below the floor.
//   SEEKER   PASSIVE, forward-looking: it hears a target only INSIDE A 35-DEGREE HALF-CONE about its velocity, with the sonar budget of physics/mechanics/subSonar.mjs but its OWN ears: a 20 dB nose array and 75 dB of flow
//            noise of its own (a torpedo is deaf). Looks at 5 Hz. It hears the LOUDEST target in the cone: a boat at 2 m/s is heard from ~235 m, at 4.5 m/s from ~540 m, but a boat CREEPING at 0.5 m/s only from ~65 m.
//            THAT IS THE EVASION GAME: a torpedo that has not locked on is fooled by a quiet boat, and a boat that runs for it is a louder target. A torpedo that is already locked and then loses the target for 3 s runs on straight.
//   HOMING   proportional navigation, N = 3, with a pursuit term: rate = N * (the line-of-sight's own turn rate, measured between looks) + 0.5 * (the measured bearing off the nose), clamped to the turn limits, in both
//            heading and pitch. Between looks the last command holds.
//   WARHEAD  ARMED after 40 m of run (a torpedo does not go off in its own tube), then it DETONATES the tick it is within 8 m of a target: 100 damage inside 3 m, falling linearly to 40 at 8 m, none beyond. One event, then done.
//
// WHAT IS NOT IN IT: no wire guidance, no active homing, no decoys or countermeasures, no wake homing, no hydrodynamic coupling to the sea (current), no buoyancy, no fuel other than time. Said plainly; the arena (brain/subDuel.mjs)
// is built so each of those is an addition to this file, not a change to it.
// Pure: no DOM, no Math.random, no clock.
"use strict";
import * as K from "./subSonar.mjs";

export const TORPEDO = Object.freeze({
    launchSpeed: 2, cruise: 6.5, accel: 1.5, turnRate: 0.25, pitchRate: 0.15, maxPitch: 0.6, endurance: 90, armDistance: 40, lethalRadius: 8, fullDamageRadius: 3, fullDamage: 100, edgeDamage: 40,
    halfCone: 35 * Math.PI / 180, seekerDi: 20, seekerOwnNoise: 75, lookEvery: 6, loseLockAfter: 18, navN: 3, pursuitGain: 0.5, minDepth: 3, maxDepth: 95,
});

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const forward = (h, p) => [Math.cos(h) * Math.cos(p), -Math.sin(h) * Math.cos(p), Math.sin(p)];

/** The seeker's noise floor (dB): the ocean added in power to the torpedo's own 75 dB of flow noise. */
export const seekerNoise = () => K.noiseLevel(0, K.SONAR.ambient, TORPEDO.seekerOwnNoise);
/** The seeker's SNR (dB) on a target of source level `sl` at `range`. */
export const seekerSNR = (sl, range) => K.passiveSNR({ sl, range, nl: seekerNoise(), di: TORPEDO.seekerDi });
/** The range (m) at which the seeker hears a boat moving at `speed`. */
export const seekerRange = (speed) => K.rangeWhere((r) => seekerSNR(K.sourceLevel(speed), r));

/** The damage a detonation at `distance` does: 100 inside 3 m, falling linearly to 40 at 8 m, nothing beyond. */
export function damageAt(distance) {
    const T = TORPEDO;
    if (!(distance <= T.lethalRadius)) return 0;
    if (distance <= T.fullDamageRadius) return T.fullDamage;
    return T.fullDamage + (T.edgeDamage - T.fullDamage) * (distance - T.fullDamageRadius) / (T.lethalRadius - T.fullDamageRadius);
}

/** A torpedo fired by `owner` (an id) from a launcher platform { pos, heading, pitch } along its nose, starting `muzzle` m ahead of its position. */
export function launch(owner, launcher, { muzzle = 6, id = 0 } = {}) {
    const f = forward(launcher.heading, launcher.pitch || 0);
    return Object.freeze({ id, owner, pos: [launcher.pos[0] + muzzle * f[0], launcher.pos[1] + muzzle * f[1], launcher.pos[2] + muzzle * f[2]], heading: launcher.heading, pitch: launcher.pitch || 0, speed: TORPEDO.launchSpeed, age: 0, run: 0, armed: false, locked: false, sinceLook: 0, lastLos: null, cmd: Object.freeze({ heading: 0, pitch: 0 }), status: "running", ticks: 0 });
}

/** The torpedo as a sonar source: a platform { pos, heading, speed } that is LOUD (the arena adds subSonar.SONAR.torpedoSL). */
export const platformOf = (t) => ({ pos: t.pos, heading: t.heading, speed: t.speed });

/**
 * One tick. `targets` is a list of { id, pos, heading, speed } (anything that can be homed on and hit; the torpedo's OWNER is skipped). Returns { torpedo (a new frozen state), event } where event is null or
 * { type: "hit", target: id, damage, distance }. A torpedo that has ended (hit, expired, lost) is returned unchanged. `tick` and `seed` feed the sonar luck; `floor` is the seabed depth (m).
 */
export function stepTorpedo(t, targets, { dt = 1 / 30, tick = 0, seed = 0, floor = TORPEDO.maxDepth } = {}) {
    if (t.status !== "running") return { torpedo: t, event: null };
    const T = TORPEDO, mine = targets.filter((x) => x.id !== t.owner);
    let { heading, pitch, locked, sinceLook, lastLos, cmd } = t;
    // ---- the seeker: a look every `lookEvery` ticks, on the loudest target inside the cone and above the threshold ----
    if (t.ticks % T.lookEvery === 0) {
        const f = forward(heading, pitch); let best = null;
        for (const x of mine) {
            const dx = x.pos[0] - t.pos[0], dy = x.pos[1] - t.pos[1], dz = x.pos[2] - t.pos[2], range = Math.hypot(dx, dy, dz);
            if (range < 1e-9) continue;
            const cos = (dx * f[0] + dy * f[1] + dz * f[2]) / range;
            if (Math.acos(clamp(cos, -1, 1)) > T.halfCone) continue;
            const snr = seekerSNR(K.sourceLevel(x.speed), range) + K.SONAR.luckSd * K.luck(seed, tick, 4 * (x.id + 1) + 900 + 7 * t.id);
            if (snr < K.SONAR.dt) continue;
            if (!best || snr > best.snr) best = { x, snr, dx, dy, dz, range };
        }
        if (best) {
            const sd = Math.max(K.SONAR.bearingSdFloor, K.SONAR.bearingSdAtThreshold * 10 ** (-(best.snr - K.SONAR.dt) / 20)), nz = (c) => K.luck(seed, tick, 3000 + 5 * t.id + c);
            const losH = Math.atan2(-best.dy, best.dx) + sd * nz(0), losP = Math.atan2(best.dz, Math.hypot(best.dx, best.dy)) + K.SONAR.elevationFactor * sd * nz(1), dtLook = T.lookEvery * dt;
            const hRate = lastLos ? wrap(losH - lastLos.h) / dtLook : 0, pRate = lastLos ? (losP - lastLos.p) / dtLook : 0;
            cmd = Object.freeze({ heading: T.navN * hRate + T.pursuitGain * wrap(losH - heading), pitch: T.navN * pRate + T.pursuitGain * (losP - pitch) });
            lastLos = Object.freeze({ h: losH, p: losP }); locked = true; sinceLook = 0;
        } else { sinceLook += T.lookEvery; if (locked && sinceLook >= T.loseLockAfter) { locked = false; cmd = Object.freeze({ heading: 0, pitch: 0 }); lastLos = null; } }
    }
    // ---- the body: rate-limited turns, a speed ramp, a straight step ----
    heading = wrap(heading + clamp(cmd.heading, -T.turnRate, T.turnRate) * dt);
    pitch = clamp(pitch + clamp(cmd.pitch, -T.pitchRate, T.pitchRate) * dt, -T.maxPitch, T.maxPitch);
    const speed = Math.min(T.cruise, t.speed + T.accel * dt), f2 = forward(heading, pitch), step = speed * dt;
    const pos = [t.pos[0] + step * f2[0], t.pos[1] + step * f2[1], t.pos[2] + step * f2[2]], run = t.run + step, age = t.age + dt, armed = t.armed || run >= T.armDistance;
    let status = "running", event = null;
    if (armed) {
        let near = null;
        for (const x of mine) { const d = Math.hypot(x.pos[0] - pos[0], x.pos[1] - pos[1], x.pos[2] - pos[2]); if (d <= T.lethalRadius && (!near || d < near.d)) near = { x, d }; }
        if (near) { status = "hit"; event = { type: "hit", target: near.x.id, damage: damageAt(near.d), distance: near.d }; }
    }
    if (status === "running") { if (age >= T.endurance) status = "expired"; else if (-pos[2] < T.minDepth || -pos[2] > Math.min(floor, T.maxDepth)) status = "lost"; }
    return { torpedo: Object.freeze({ ...t, pos, heading, pitch, speed, age, run, armed, locked, sinceLook, lastLos, cmd, status, ticks: t.ticks + 1 }), event };
}

export function reportLines() {
    return [`[subTorpedo] ${TORPEDO.cruise} m/s cruise (the fastest boat is 4.55), ${TORPEDO.endurance} s burn = ${(TORPEDO.cruise * TORPEDO.endurance).toFixed(0)} m, turns ${TORPEDO.turnRate} rad/s, seeker cone +-${(TORPEDO.halfCone * 180 / Math.PI).toFixed(0)} deg, armed after ${TORPEDO.armDistance} m`,
        `  its seeker hears a boat at 0.5 / 2 / 4.5 m/s from ${seekerRange(0.5).toFixed(0)} / ${seekerRange(2).toFixed(0)} / ${seekerRange(4.5).toFixed(0)} m: a creeping boat is nearly invisible to it; damage ${TORPEDO.fullDamage} inside ${TORPEDO.fullDamageRadius} m, ${TORPEDO.edgeDamage} at ${TORPEDO.lethalRadius} m`];
}
if (typeof process !== "undefined" && Array.isArray(process.argv)) {
    const { pathToFileURL } = await import("node:url");
    if (import.meta.url === pathToFileURL(process.argv[1] || "").href) { for (const l of reportLines()) console.log(l); process.exit(0); }
}
