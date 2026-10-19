// WebGLEngine/render/subAquariumSim.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// THE TANK OF sub-aquarium.html, WITHOUT A PICTURE: every submarine the aquarium holds swims in a box of water, each flown by ITS OWN pilot -- the PD autopilot (brain/autopilotSub.mjs) when it arrived with no weights, or the
// connectome-wired network (brain/pilotSubPolicy.mjs) with the 963 weights it arrived with -- through the same vessel (physics/mechanics/subModel6dof.mjs) and the same (state, target, current) -> controls contract
// as every task before this one. The page draws what this module computes; this module draws nothing, so a gate can fly a tank for minutes in a few milliseconds.
//
// WHAT A SUB DOES IN THE TANK: it WANDERS. Every 20-45 seconds it picks a new heading, depth (14..40 m) and speed (1.5..3 m/s). The moment it crosses MARGIN metres in from a wall it is RETARGETED toward the middle
// (within 0.4 rad of it, for 15-30 s), and while it is outside the margin it steers for the middle regardless -- so it comes BACK from a wall and does not bounce along it (the first draft only overrode the target outside the margin,
// and a boat aimed at the wall hugged it). A boat that is lost
// (the floor, the surface, the crush depth) is put back in the middle, and the count of those is kept (a pilot that keeps being lost is a pilot you can SEE failing). Nothing here fights: this is an aquarium.
// The wandering is a function of the sub's id and its age (a seeded hash), so the same sub in the same tank swims the same way.
//
// TANK COORDINATES: x along the length 0..LENGTH, y across 0..WIDTH, depth positive down (the vessel's own convention: heading 0 = +x, a right turn increases it, world +y is the vessel's left).
// Pure: no DOM, no clock (the caller says how long a frame took), no Math.random.
"use strict";
import * as S from "../physics/mechanics/subModel6dof.mjs";
import * as AS from "../brain/autopilotSub.mjs";
import * as PS from "../brain/pilotSubPolicy.mjs";
import * as H from "../physics/mechanics/subHulls.mjs";

export const LENGTH = 500, WIDTH = 300, MARGIN = 60, DEPTH_MIN = 14, DEPTH_MAX = 40, TRAIL = 80, TRAIL_EVERY = 0.5, MAX_STEP = 0.1;
const DT = S.DT, wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const mulberry = (a) => () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const hash = (str) => { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };

/** The heading that points from (x, y) at (tx, ty), in the engine's convention (0 = +x, a right turn increases it). */
export const headingTo = (x, y, tx, ty) => Math.atan2(-(ty - y), tx - x);
/** Is a point inside the steering box (MARGIN m in from every wall)? */
export const insideBox = (x, y) => x >= MARGIN && x <= LENGTH - MARGIN && y >= MARGIN && y <= WIDTH - MARGIN;


/** A new tank. `sync(list)` reconciles it with the aquarium's list; `step(seconds)` advances it; `subs` are the live boats. */
export function createTank({ hull = "nominal" } = {}) {
    const subs = new Map();   // id -> live sub
    let clock = 0, hullName = hull, MODEL = H.model(hull);   // the vessel every sub in the tank is (physics/mechanics/subHulls.mjs); the pilots do not know which

    function spawn(entry, rng, atCentre = false) {
        const x = atCentre ? LENGTH / 2 + (rng() - 0.5) * 60 : MARGIN + rng() * (LENGTH - 2 * MARGIN), y = atCentre ? WIDTH / 2 + (rng() - 0.5) * 40 : MARGIN + rng() * (WIDTH - 2 * MARGIN);
        const depth = DEPTH_MIN + rng() * (DEPTH_MAX - DEPTH_MIN), heading = (rng() - 0.5) * 2 * Math.PI;
        return S.createState({ depth, pos: [x, y, -depth], speed: 2, heading, model: MODEL });
    }
    function pilotFor(entry) {
        if (entry.weights && entry.weights.length === PS.WEIGHT_COUNT) return PS.pilotFor(Float32Array.from(entry.weights));
        return AS.pilot();
    }
    function retarget(sub) {
        const r = sub.rng(), q = sub.rng(), z = sub.rng();
        sub.target = { depth: DEPTH_MIN + r * (DEPTH_MAX - DEPTH_MIN), heading: (q - 0.5) * 2 * Math.PI, speed: 1.5 + z * 1.5 };
        sub.nextTarget = sub.age + 20 + sub.rng() * 25;
    }
    function add(entry) {
        const rng = mulberry(hash(entry.id));
        const sub = { id: entry.id, name: entry.name, hue: entry.hue, pilotKind: entry.pilot, from: entry.from, local: !!entry.local, rng, pilot: pilotFor(entry), state: null, target: null, nextTarget: 0, age: 0, lost: 0, wasInside: true, status: "swimming", trail: [], trailT: 0 };
        sub.state = spawn(entry, rng); retarget(sub);
        subs.set(entry.id, sub);
        return sub;
    }
    return {
        subs,
        get clock() { return clock; },
        get hull() { return hullName; },
        /** Change the vessel of the whole tank (a name from physics/mechanics/subHulls.mjs; an unknown name throws and changes nothing). Every sub is put back in the water on the new hull, at a fresh start, with its trail cleared. */
        setHull(name) {
            const m = H.model(name); MODEL = m; hullName = name;
            for (const sub of subs.values()) { sub.state = spawn(sub, sub.rng, true); sub.trail.length = 0; sub.wasInside = true; sub.status = "swimming"; retarget(sub); }
            return name;
        },
        /** Reconcile with the aquarium's list [{ id, name, hue, pilot, from, local, weights }]: new ids join, ids that are gone leave, the ones that stay keep swimming. Returns { added, removed }. */
        sync(list) {
            const want = new Set(list.map((e) => e.id)); let added = 0, removed = 0;
            for (const e of list) if (!subs.has(e.id)) { add(e); added++; }
            for (const id of [...subs.keys()]) if (!want.has(id)) { subs.delete(id); removed++; }
            return { added, removed };
        },
        /** Advance `seconds` of tank time in vessel ticks (a long frame is clipped to MAX_STEP so a hidden tab does not fast-forward the sea). */
        step(seconds) {
            let left = Math.min(Math.max(0, seconds || 0), MAX_STEP);
            while (left > 1e-9) {
                const dt = Math.min(DT, left); left -= dt; clock += dt;
                for (const sub of subs.values()) {
                    sub.age += dt;
                    const s = sub.state, x = s.pos[0], y = s.pos[1];
                    if (sub.age >= sub.nextTarget) retarget(sub);
                    const inside = insideBox(x, y);
                    if (!inside && sub.wasInside) { sub.target = { depth: sub.target.depth, heading: wrap(headingTo(x, y, LENGTH / 2, WIDTH / 2) + (sub.rng() - 0.5) * 0.8), speed: Math.min(sub.target.speed, 2.5) }; sub.nextTarget = sub.age + 15 + sub.rng() * 15; }
                    sub.wasInside = inside;
                    const t = inside ? sub.target : { depth: sub.target.depth, heading: headingTo(x, y, LENGTH / 2, WIDTH / 2), speed: Math.min(sub.target.speed, 2) };
                    const res = S.stepSub(MODEL, s, sub.pilot(s, t, [0, 0, 0]), dt);
                    sub.state = res.state;
                    if (res.status !== "submerged" || !Number.isFinite(res.state.pos[0])) { sub.lost++; sub.status = res.status; sub.state = spawn(sub, sub.rng, true); sub.trail.length = 0; sub.wasInside = true; retarget(sub); continue; }
                    sub.status = "swimming";
                    sub.trailT += dt;
                    if (sub.trailT >= TRAIL_EVERY) { sub.trailT = 0; sub.trail.push([sub.state.pos[0], sub.state.pos[1], -sub.state.pos[2]]); if (sub.trail.length > TRAIL) sub.trail.shift(); }
                }
            }
        },
        /** What a page draws: one plain record per sub. */
        snapshot() {
            return [...subs.values()].map((sub) => { const a = S.attitude(sub.state); return { hull: hullName, id: sub.id, name: sub.name, hue: sub.hue, pilot: sub.pilotKind, from: sub.from, local: sub.local, x: sub.state.pos[0], y: sub.state.pos[1], depth: a.depth, heading: a.heading, pitch: a.pitch, speed: a.speed, target: sub.target, lost: sub.lost, status: sub.status, trail: sub.trail.slice() }; });
        },
    };
}
