// WebGLEngine/brain/racePlay.mjs -- v4827
//
// A HUMAN AT THE WHEEL OF A LOCKSTEP CAR, AS DATA: the keys, the commands they make, the race two people must agree on before they connect, and the pacing that turns
// an animation frame into a tick. race-lockstep.html is this module with a canvas around it.
//
// brain/raceLockstep.mjs said it in its header -- "a human at the wheel of one car is the same wire with a different propose()" -- and this is that sentence made to run.
// Each peer OWNS some cars. For a car it owns, a peer sends its commands AHEAD by the input delay; every peer, the owner too, steps the commands that came over the wire.
// Nothing about that cares who wrote them, so here the throttle, steer and brake are the player's keys, and the turret on the car is still worked by its gunner brain
// (the fly-wired Giant Fiber network of brain/gunnerPolicy.mjs, hand weights by default): you drive, a brain shoots. Z drops a slick and X lights it, on top of what
// the gunner decides. The keys are NOT deterministic and need not be: they are read once, on this machine, and what leaves it is the command, which the other
// machine steps byte for byte.
//
// Pure: no DOM, no clock, no storage. The page hands key events and frame lengths in and reads commands and a status out, which is what lets a gate drive the whole
// thing in node against two peers on a simulated wire.
"use strict";
import * as C from "../physics/raceCar.mjs";
import * as D from "./drivePolicy.mjs";
import * as G from "./gunnerPolicy.mjs";

export const PEERS = Object.freeze(["A", "B"]);
export const DEFAULT_SECONDS = 90;

/** The keys, by KeyboardEvent.code. Arrow keys and WASD both; the letters keep working on a keyboard with no arrows to reach. */
export const KEYMAP = Object.freeze({
    KeyW: "up", ArrowUp: "up", KeyS: "down", ArrowDown: "down", KeyA: "left", ArrowLeft: "left", KeyD: "right", ArrowRight: "right",
    Space: "brake", KeyZ: "drop", KeyX: "ignite",
});

/** The held state of the keys. press/release take KeyboardEvent.code (an unmapped key is ignored and says so), clear() lets go of everything (a blurred window). */
export function createKeys() {
    const held = new Set();
    return {
        press(code) { const a = KEYMAP[code]; if (!a) return false; held.add(a); return true; },
        release(code) { const a = KEYMAP[code]; if (!a) return false; held.delete(a); return true; },
        clear() { held.clear(); },
        snapshot: () => ({ up: held.has("up"), down: held.has("down"), left: held.has("left"), right: held.has("right"), brake: held.has("brake"), drop: held.has("drop"), ignite: held.has("ignite") }),
    };
}

/** The sign on the steer axis that turns the car to ITS LEFT. Measured, not assumed: the first draft said -1, and a car heading east with steer -1 went toward +z, which on a north-up map is a RIGHT turn. The gate drives a car and reads which way it went. */
export const LEFT_STEER = 1;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
/** How fast the car is going along its own nose, m/s (negative reversing): the pose's velocity on the heading. */
export const forwardSpeed = (pose) => pose.vel[0] * Math.sin(pose.yaw) + pose.vel[2] * Math.cos(pose.yaw);

/**
 * The drive command the keys make for a car on `pose`: { throttle, steer, brake }. Up is full throttle; Down brakes while the car is rolling forward and reverses once it has
 * (nearly) stopped; Space is the brake; Left and Right steer, by less the faster the car goes (a digital key at 25 m/s is a spin otherwise), never below 40%.
 */
export function driveFromKeys(k, pose) {
    const v = forwardSpeed(pose);
    let throttle = 0, brake = 0;
    if (k.up && !k.down) throttle = 1;
    else if (k.down && !k.up) { if (v > 1.5) brake = 1; else throttle = -1; }
    if (k.brake) { brake = 1; throttle = 0; }
    const dir = (k.left ? LEFT_STEER : 0) + (k.right ? -LEFT_STEER : 0);
    const steer = dir * clamp(1 - Math.abs(v) / 45, 0.4, 1);
    return { throttle, steer, brake };
}

/**
 * THE INPUT FUNCTION createRacePeer takes: (session) => (tick) => the commands for the cars this peer owns. `human` says which of them the keys drive (default: all of
 * them); an owned car that is not human's is driven by its policy, so a one-player race has a bot in the other car and the same wire. The gunner's yaw, pitch and fire are
 * always the policy's; drop and ignite are the policy's OR the key's.
 */
export function humanInputFn(selfId, keys, { human = null } = {}) {
    return (session) => () => {
        const owned = session.ownedBy(selfId), base = session.race.propose(owned), poses = session.race.poses(), k = keys.snapshot();
        return base.map((b) => {
            if (human && !human.includes(b.car)) return b;
            const u = driveFromKeys(k, poses[b.car]);
            return { ...b, throttle: u.throttle, steer: u.steer, brake: u.brake, drop: b.drop || k.drop ? 1 : 0, ignite: b.ignite || k.ignite ? 1 : 0 };
        });
    };
}

/**
 * The race two peers must be handed identically before they connect, or they desync at tick 0 and say so. Two human cars (A owns the red one, B the green) by default;
 * `solo` is one peer owning both with the second driven by the policy, so one person can play without anybody on the other end. `gunners` is "hand" or "zero" (a zero
 * gunner never fires: a race of pure driving). The real city, with no scripted demolition: the shells the gunners fire bring buildings down on their own.
 */
export function playableRace({ seconds = DEFAULT_SECONDS, seed = 1, gunners = "hand", solo = false } = {}) {
    const g = gunners === "zero" ? G.zeroWeights() : G.handWeights();
    return {
        peers: solo ? ["A"] : [...PEERS], owner: solo ? { 0: "A", 1: "A" } : { 0: "A", 1: "B" }, human: solo ? { A: [0] } : { A: [0], B: [1] },
        seed, seconds, drivers: [D.handWeights(), D.handWeights()], gunners: [g, g.slice()],
        city: {},
    };
}

/** What two peers must agree on, as a short string: it rides in the engine identity the lockstep announces, so a peer who opened a different link halts with a reason. */
export const configSignature = (c) => `${c.peers.length}p-seed${c.seed}-${c.seconds}s-${c.gunners[0].every((v) => v === 0) ? "zero" : "hand"}gun`;

/**
 * Pace a peer on a clock the caller owns. frame(dt) takes the seconds since the last frame and pumps once per 1/60 s of it: sim time follows the wall clock when the wire
 * keeps up, and waits (the pump finds a tick it holds no input for and steps nothing) when it does not. A frame that arrives after a long pause is capped at a quarter
 * of a second, and at 8 pumps: the cost of a stall is a slower race, never a lost tick. It stops pumping at `stopTick` and when the pair has halted or seen a desync.
 */
export function createPlayLoop(peer, { stopTick, maxPumpsPerFrame = 8, maxBacklog = 0.25 } = {}) {
    let acc = 0, pumps = 0, waits = 0;
    const s = peer.session;
    const state = () => {
        const d = s.desync(), h = peer.net.halted();
        if (h) return "halted";
        if (d) return "desync";
        if (s.tick >= stopTick) return "finished";
        return waits >= 30 ? "waiting" : "running";
    };
    return {
        frame(dt) {
            acc = Math.min(acc + Math.max(0, dt), maxBacklog); let n = 0;
            while (acc >= C.CAR.dt && n < maxPumpsPerFrame) {
                acc -= C.CAR.dt;
                if (s.tick >= stopTick || peer.net.halted() || s.desync()) { acc = 0; break; }
                const before = s.tick; peer.pump(); n++; pumps++;
                if (s.tick === before) waits++; else waits = 0;
            }
            return state();
        },
        status: () => ({ state: state(), tick: s.tick, of: stopTick, lead: peer.net.lead(), pumps, waits, hash: s.tick ? s.localHash(s.tick - 1) : null }),
        state,
    };
}

/** What the page shows after a finished race: the order and each car's laps, metres, shots and hits, the buildings that came down, and the fingerprint both machines should print. */
export function summarise(finish, names) {
    const rows = finish.results.map((r) => ({ car: r.car, name: names[r.car] || "car " + (r.car + 1), laps: r.laps, metres: Math.round(r.metres), shots: r.shots, hits: r.hits, damageTaken: Math.round(r.damageTaken || 0) }));
    return { order: finish.order, rows, fingerprint: finish.fingerprint, fallen: finish.city ? finish.city.topple.fallen : 0, shattered: finish.city ? finish.city.topple.shattered : 0 };
}

