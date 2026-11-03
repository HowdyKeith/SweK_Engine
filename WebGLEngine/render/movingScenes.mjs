// WebGLEngine/render/movingScenes.mjs -- FSR4 round 77 (pre-registration section 176): scenes whose objects move.
//
// Every sphere that is neither the ground (index 0) nor a light moves in a straight line in the ground plane at its own
// constant velocity: a direction uniform on the circle and a speed uniform in MOVE_SPEED world units a frame, drawn from a
// stream seeded by the scene's seed and salted apart from every stream the scene already draws. The lights, the ground and
// the camera path are untouched.
//
// THE MOTION RUNS BACKWARDS FROM THE MEASURED FRAME: frame f puts each mover at centre + v (f - (FRAMES - 1)), so the last
// frame IS the scene makeScene draws (sceneAt returns S.scene itself there). The measured frame, its guides, its light
// sources and its references are the still example's bit for bit, and only the seven history frames differ.
"use strict";
import { rng } from "../physics/render/furnace.mjs";
import { FRAMES } from "./denoiseTemporal.mjs";

/** Section 176: a mover's speed, world units a frame. It straddles POS_TOL's ~0.04 at 256 x 256 on purpose. */
export const MOVE_SPEED = Object.freeze([0.01, 0.08]);
/** The salt that keeps the motion's stream apart from makeScene's and cameraPath's. */
export const MOTION_SALT = 77;

/** A scene's movers and their velocities: [{ index, v: [vx, 0, vz] }], one per sphere that is not the ground or a light. */
export function sceneMotion(S) {
    const r = rng((((S.seed >>> 0) * 3266489917) + MOTION_SALT) >>> 0), out = [];
    S.scene.forEach((s, i) => {
        if (i === 0 || s.emit) return;
        const a = 2 * Math.PI * r(), sp = MOVE_SPEED[0] + (MOVE_SPEED[1] - MOVE_SPEED[0]) * r();
        out.push(Object.freeze({ index: i, v: Object.freeze([sp * Math.cos(a), 0, sp * Math.sin(a)]) }));
    });
    return Object.freeze(out);
}

/** Frame f's spheres: each mover at centre + v (f - (FRAMES - 1)), every other sphere the scene's own object. The last frame is S.scene itself. */
export function sceneAt(S, motion, f) {
    if (!Number.isInteger(f) || f < 0 || f >= FRAMES) throw new Error(`movingScenes: frame ${f} is not one of the ${FRAMES}`);
    if (f === FRAMES - 1 || !motion) return S.scene;
    const out = S.scene.slice(), k = f - (FRAMES - 1);
    for (const m of motion) { const s = S.scene[m.index]; out[m.index] = { ...s, centre: [s.centre[0] + m.v[0] * k, s.centre[1], s.centre[2] + m.v[2] * k] }; }
    return out;
}

/** The measured frame's mover pixels: 1 where the first hit is a moving sphere. `hits` is firstHits' result. */
export function moverMask(motion, hits) {
    const movers = new Set(motion.map((m) => m.index)), mask = new Uint8Array(hits.obj.length);
    for (let p = 0; p < mask.length; p++) if (movers.has(hits.obj[p])) mask[p] = 1;
    return mask;
}

/** Round 79 (section 180): the movers' velocities indexed by scene object -- what reproject and accumulateUpscaled take as `vel`. Every other index is empty. */
export function velocities(S, motion) {
    const vel = new Array(S.scene.length).fill(null);
    for (const m of motion) vel[m.index] = m.v;
    return Object.freeze(vel);
}
