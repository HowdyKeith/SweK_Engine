// WebGLEngine/bz/bzPilot.js — what a tank decides to do.
//
// Pure. `decide()` takes a tank, a world and a list of targets, and returns the same input object a human
// hand on a keyboard would produce: `{ forward, turn, jump, fire }`. It touches nothing and knows nothing
// about networks. That is what lets bz/tools/bz-pilot-selfcheck.mjs prove it never wedges itself in a
// corner, never fires through a wall, and never ends a frame inside an obstacle -- headlessly, before it
// has ever driven anywhere real.
//
// The same shape as ev/esTactics.js: a weighted score over features, a chosen target and the runner-up it
// was chosen over. Keeping the counterfactual is what makes an outcome teachable later; a decision with no
// alternative carries no gradient, and a policy that never recorded one cannot learn from a death.
//
// Sensors are three whiskers, because a tank has no eyes and a raycast per obstacle per frame is a lie
// about how much a bot knows. It probes where its own body would be a moment from now, using exactly the
// predicate the physics uses -- `free()`. If the probe says a place is occupied, it is occupied.

"use strict";

import { free } from "./bzTank.js";
import { lineOfFire } from "./bzCombat.js";

// v2186 -- the same names brain/bzTacticsPolicy.js uses, because the bridge serves this object straight
// into `decide()`. `wBias` is the baseline desire before any feature speaks; its feature is constant 1.
// The pilot runs these until the bridge has seen enough decisions to serve better ones, and the bridge
// never serves half-learned numbers -- an untrained policy answers "hand" and the pilot keeps these.
const DEFAULT_W = {
    wBias: 0.0,
    wNear: 1.0,        // prefer a close target
    wAhead: 0.6,       // ...and one it is already pointing at
    wExposed: 0.4,     // ...and one it can actually shoot
    wAirborne: -0.3,   // a jumping target is a hard target -- and the policy may yet disagree
};

const WHISKER_ANGLES = [-0.45, 0, 0.45];

// How closely a shot must be aimed to be worth taking. Not a constant: a target's ANGULAR size is what
// decides whether a shot hits it, and that shrinks with range. A tank is 2.8 metres wide, so at twenty
// metres it subtends 0.14 radians and at three hundred, 0.009. A fixed tolerance either wastes the
// close-range shot or throws the long one away. The first draft used 0.045 for both and fired once in
// twenty seconds.
function aimTolerance(dist, halfWidth) { return Math.atan2(halfWidth, Math.max(1, dist)); }

// A tank reloads for 3.5 seconds and drives at 25 metres a second, so a pilot that charges straight at its
// target crosses eighty-seven metres between shots and is never lined up when the gun is ready. It fires
// once, aims beautifully at nothing for three and a half seconds, and overshoots. The first draft did
// exactly that: 778 frames with the gun ready, 216 aligned, and two shots.
//
// So it keeps its distance. A shot travels 350 metres; there is no reason to be closer than fifty.
const STANDOFF_NEAR = 25;      // inside this, back off
const STANDOFF_FAR = 60;       // outside this, close in
const EVADE_SECONDS = 0.7;     // how long a turn away from a wall is held before the pilot reconsiders
function approach(dist) { return dist > STANDOFF_FAR ? 1 : (dist > STANDOFF_NEAR ? 0.35 : -0.6); }

function angleTo(from, to) { return Math.atan2(to[1] - from[1], to[0] - from[0]); }
function wrap(a) { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; }

// Where the tank's body would be `reach` metres ahead along `angle`. Free or not, by the physics' rules.
function probe(world, tank, angle, reach) {
    const x = tank.pos[0] + Math.cos(angle) * reach;
    const y = tank.pos[1] + Math.sin(angle) * reach;
    return free(world, tank, x, y, tank.pos[2], tank.angle);
}

// Three whiskers: left, ahead, right. Returns which are clear.
function whiskers(world, tank, reach) {
    return WHISKER_ANGLES.map((d) => probe(world, tank, tank.angle + d, reach));
}

// The features a target is scored on. All normalised, so a weight means the same thing whatever the map.
function featuresFor(tank, target, world, opts) {
    const dist = Math.hypot(target.pos[0] - tank.pos[0], target.pos[1] - tank.pos[1]);
    const range = tank.spec.shotRange;
    const err = Math.abs(wrap(angleTo(tank.pos, target.pos) - tank.angle));
    const muzzle = [tank.pos[0] + Math.cos(tank.angle) * tank.spec.muzzleFront,
        tank.pos[1] + Math.sin(tank.angle) * tank.spec.muzzleFront,
        tank.pos[2] + tank.spec.muzzleHeight];
    const aim = [target.pos[0], target.pos[1], target.pos[2] + tank.spec.muzzleHeight];
    return {
        near: 1 - Math.min(1, dist / range),
        ahead: 1 - err / Math.PI,
        exposed: (opts && opts.skipLineOfFire) ? 1 : (lineOfFire(world, muzzle, aim) ? 1 : 0),
        airborne: target.onGround === false ? 1 : 0,
        _dist: dist, _err: err, _muzzle: muzzle, _aim: aim,
    };
}
function score(f, w) {
    return (w.wBias || 0) + w.wNear * f.near + w.wAhead * f.ahead + w.wExposed * f.exposed + w.wAirborne * f.airborne;
}

// The weights the bridge is allowed to hand us. Anything missing, infinite, or absurd and we keep our own:
// a pilot that drives on numbers it cannot check is a pilot with no floor under it.
const W_KEYS = ["wBias", "wNear", "wAhead", "wExposed", "wAirborne"];
function sanitizeWeights(w) {
    if (!w || typeof w !== "object") return null;
    const out = {};
    for (const k of W_KEYS) {
        const v = Number(w[k]);
        if (!Number.isFinite(v) || v < -2 || v > 4) return null;   // the policy's own clamp band
        out[k] = v;
    }
    return out;
}

// The chosen target, and the one it was chosen over. With fewer than two candidates there is no
// counterfactual, and the runner-up is null -- which is the truth, and is what a learner must be told.
function chooseTarget(tank, targets, world, w = DEFAULT_W, opts) {
    let best = null, bestS = -Infinity, alt = null, altS = -Infinity;
    for (const t of targets) {
        if (t.dead || t.id === tank.id) continue;
        const f = featuresFor(tank, t, world, opts);
        const s = score(f, w);
        if (s > bestS) { alt = best; altS = bestS; best = { target: t, f, s }; bestS = s; }
        else if (s > altS) { alt = { target: t, f, s }; altS = s; }
    }
    return best ? { chosen: best, alt } : null;
}

// One decision. `state` is the pilot's own scratch space: it remembers where it was, so it can notice
// that it has stopped moving and do something about it.
function makePilotState() { return { stuckFor: 0, last: null, wander: 0, evade: 0, evadeDir: 0, evadeFwd: 0 }; }

function decide(tank, world, targets, state, w = DEFAULT_W, opts = {}) {
    const s = tank.spec;
    const dt = opts.dt || 1 / 60;
    const reach = s.length * 1.2;
    const out = { forward: 0, turn: 0, jump: false, fire: false, target: null, feat: null, alt: null };
    if (tank.dead) return out;

    const pick = chooseTarget(tank, targets, world, w, opts);
    const [left, ahead, right] = whiskers(world, tank, reach);

    // 1. Where to point. At a target if there is one; otherwise wherever it is not blocked.
    let want = null;
    if (pick) {
        out.target = pick.chosen.target.id;
        out.feat = pick.chosen.f;
        out.alt = pick.alt ? pick.alt.f : null;
        want = angleTo(tank.pos, pick.chosen.target.pos);
    }

    // 2. Wall avoidance overrides aiming, and it COMMITS. A pilot that re-decides which way to turn every
    // frame oscillates: it reverses out of a corner, sees the way ahead clear, drives back in, and repeats.
    // The first draft did exactly that -- twenty seconds in a corner and it moved three metres. So a turn,
    // once chosen, is held for `EVADE_SECONDS` whatever the whiskers say next frame.
    if (!ahead && state.evade <= 0) {
        state.evadeDir = left && !right ? 1 : (right && !left ? -1 : (state.wander || 1));
        // The THROTTLE is chosen once too. Recomputing it from the whiskers each frame flips its sign as
        // the tank rotates -- forward, reverse, forward -- and the tank spins on the spot travelling
        // nowhere. Back out of a dead end; ease forward past a single wall.
        state.evadeFwd = (left || right) ? 0.5 : -0.6;
        state.evade = EVADE_SECONDS;
    }
    if (state.evade > 0) {
        state.evade -= dt;
        out.turn = state.evadeDir;
        out.forward = state.evadeFwd;
    } else if (want != null) {
        const err = wrap(want - tank.angle);
        out.turn = Math.max(-1, Math.min(1, err / (s.angVel * dt * 4)));
        // Point first, then close -- and hold at a range where the gun is ready before the target is past.
        out.forward = Math.abs(err) < 0.9 ? approach(pick.chosen.f._dist) : 0.2;
    } else {
        // No target, nothing in the way: patrol. The wander flips on a schedule, not at random, so a
        // headless test is reproducible and a bot does not look like it is having a seizure.
        state.wander = state.wander || 1;
        out.turn = 0.15 * state.wander;
        out.forward = 1;
    }

    // 3. Fire, when it can hit and the shot has somewhere to go.
    if (pick && tank.reload <= 0) {
        const f = pick.chosen.f;
        if (f._err < aimTolerance(f._dist, s.dy) && f._dist < s.shotRange && f.exposed > 0) out.fire = true;
    }

    // 4. Unstick. If the tank has not moved for a while, it is wedged: jump, and reverse.
    //
    // It must NOT fire while an evasion is running. The first draft let it, and the two fed each other:
    // the unstick flipped the evade direction every 0.6s, the tank turned one way and then the other, its
    // net movement stayed near zero -- which is exactly what the unstick was watching for. Twenty seconds
    // in a corner and it travelled four metres, oscillating the whole time. An evasion, once begun, is
    // allowed to finish.
    const moved = state.last ? Math.hypot(tank.pos[0] - state.last[0], tank.pos[1] - state.last[1]) : 1;
    if (moved < 0.02 && tank.onGround) state.stuckFor += dt; else state.stuckFor = 0;
    if (state.stuckFor > 0.6 && state.evade <= 0) {
        out.jump = true;
        out.turn = state.wander = state.evadeDir = -(state.wander || 1);
        out.forward = -0.8;
        state.evade = EVADE_SECONDS;
        state.stuckFor = 0;
    }
    state.last = tank.pos.slice();
    return out;
}

// What a death and a kill are worth, in the shape ev/tacticsBridge.js already accepts: a chosen feature
// vector, the alternative it beat, and a reward. A decision with no counterfactual is not reported --
// there is nothing to learn from a choice that had no alternative.
function outcomeForDeath(feat, alt) { return (feat && alt) ? { chosen: strip(feat), alt: strip(alt), reward: -1 } : null; }
function outcomeForKill(feat, alt) { return (feat && alt) ? { chosen: strip(feat), alt: strip(alt), reward: +1 } : null; }
function strip(f) { const o = {}; for (const k in f) if (k[0] !== "_") o[k] = f[k]; return o; }

export { decide, chooseTarget, featuresFor, score, whiskers, probe, makePilotState, outcomeForDeath, outcomeForKill, strip, DEFAULT_W, W_KEYS, sanitizeWeights, aimTolerance, approach, STANDOFF_NEAR, STANDOFF_FAR, EVADE_SECONDS, wrap, angleTo };
if (typeof module !== "undefined" && module.exports)
    module.exports = { decide, chooseTarget, featuresFor, score, whiskers, probe, makePilotState, outcomeForDeath, outcomeForKill, strip, DEFAULT_W, aimTolerance, approach, STANDOFF_NEAR, STANDOFF_FAR, EVADE_SECONDS, wrap, angleTo };
