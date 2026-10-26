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
// THE COMPASS (UNNUMBERED, `setCompass`): 'lit' (the default: every pilot reads the true heading) or 'dropout': every sub's compass goes dark for DARK_SECONDS in every CYCLE_SECONDS, each sub on its own phase (a seeded hash of its id and its age: the same tank goes dark the same way twice). While a sub's compass is
// dark its pilot is shown the world turned about the vertical so that the heading it reads stays at the last heading it saw lit (tools/subDropout.mjs turnWorld: the body rates, depth, pitch, bank and speed stay true) and is told { compassValid: 0 } as a fourth argument. A pilot of kind 'navigator' (the PD autopilot behind
// tools/subNavigator.mjs: it integrates the exact heading rate while the compass is dark) has no weights, so it is a NAME and not a 963-number sub: a page adds it to its own list, the bridge never carries it, and a peer cannot send one (the registry stamps every pilot kind itself). `registerPilot(kind, factory)` adds a kind a page builds (the estimators of the
// compass-dropout view); a pilot with a `believed()` method tells the snapshot which heading its autopilot read last (`believed`; `shown` is what the compass says). WHAT IT IS NOT: a model of a real compass failure; the tank's targets are its own wandering, not the dives of the study.
// Pure: no DOM, no clock (the caller says how long a frame took), no Math.random.
"use strict";
import * as S from "../physics/mechanics/subModel6dof.mjs";
import * as AS from "../brain/autopilotSub.mjs";
import * as PS from "../brain/pilotSubPolicy.mjs";
import * as H from "../physics/mechanics/subHulls.mjs";
import * as D from "../tools/subDropout.mjs";
import * as N from "../tools/subNavigator.mjs";

export const LENGTH = 500, WIDTH = 300, MARGIN = 60, DEPTH_MIN = 14, DEPTH_MAX = 40, TRAIL = 80, TRAIL_EVERY = 0.5, MAX_STEP = 0.1;
export const CYCLE_SECONDS = 48, DARK_SECONDS = 16, COMPASS_MODES = Object.freeze(["lit", "dropout"]);
const DT = S.DT, wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const mulberry = (a) => () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const hash = (str) => { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };

/** The state of a sub's compass at `age` seconds with `phase` seconds of offset, in the dropout mode: { dark, left } -- dark for the last DARK_SECONDS of every CYCLE_SECONDS, `left` the seconds until the light comes back (0 when lit). */
export function compassState(age, phase) {
    const t = (((age + phase) % CYCLE_SECONDS) + CYCLE_SECONDS) % CYCLE_SECONDS, dark = t >= CYCLE_SECONDS - DARK_SECONDS;
    return { dark, left: dark ? CYCLE_SECONDS - t : 0 };
}

/**
 * A pilot built as build(inner), `inner` being the PD autopilot seen through a spy: the pilot has a `believed()` method, the heading the autopilot read on its last tick (a page draws it as the ghost line from a sub whose compass is dark).
 * A page registers a kind with it (tank.registerPilot(kind, () => withBelief(build))) and never touches the vessel's attitude itself.
 */
export function withBelief(build) {
    const seen = { h: 0 }, inner = AS.pilot(), pilot = build((st, tgt, cur, aux) => { seen.h = S.attitude(st).heading; return inner(st, tgt, cur, aux); });
    pilot.believed = () => seen.h;
    return pilot;
}

/** The heading that points from (x, y) at (tx, ty), in the engine's convention (0 = +x, a right turn increases it). */
export const headingTo = (x, y, tx, ty) => Math.atan2(-(ty - y), tx - x);
/** Is a point inside the steering box (MARGIN m in from every wall)? */
export const insideBox = (x, y) => x >= MARGIN && x <= LENGTH - MARGIN && y >= MARGIN && y <= WIDTH - MARGIN;


/** A new tank. `sync(list)` reconciles it with the aquarium's list; `step(seconds)` advances it; `subs` are the live boats. */
export function createTank({ hull = "nominal" } = {}) {
    const subs = new Map();   // id -> live sub
    const extraPilots = new Map();   // kind -> factory(entry) -> pilot(state, target, current, aux)
    let clock = 0, hullName = hull, MODEL = H.model(hull), compassMode = "lit";   // the vessel every sub in the tank is (physics/mechanics/subHulls.mjs); the pilots do not know which

    function spawn(entry, rng, atCentre = false) {
        const x = atCentre ? LENGTH / 2 + (rng() - 0.5) * 60 : MARGIN + rng() * (LENGTH - 2 * MARGIN), y = atCentre ? WIDTH / 2 + (rng() - 0.5) * 40 : MARGIN + rng() * (WIDTH - 2 * MARGIN);
        const depth = DEPTH_MIN + rng() * (DEPTH_MAX - DEPTH_MIN), heading = (rng() - 0.5) * 2 * Math.PI;
        return S.createState({ depth, pos: [x, y, -depth], speed: 2, heading, model: MODEL });
    }
    function pilotFor(entry) {
        if (extraPilots.has(entry.pilot)) return extraPilots.get(entry.pilot)(entry);
        if (entry.pilot === "navigator") return withBelief((inner) => N.navigator(inner));   // the PD autopilot behind the navigator
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
        const sub = { id: entry.id, name: entry.name, hue: entry.hue, pilotKind: entry.pilot, from: entry.from, local: !!entry.local, rng, pilot: pilotFor(entry), state: null, target: null, nextTarget: 0, age: 0, lost: 0, wasInside: true, status: "swimming", trail: [], trailT: 0, steer: { depth: 0, heading: 0, speed: 0 }, phase: (hash(entry.id + "|compass") % (CYCLE_SECONDS * 1000)) / 1000, held: 0, dark: false, darkLeft: 0 };
        sub.state = spawn(entry, rng); sub.held = S.attitude(sub.state).heading; retarget(sub);
        subs.set(entry.id, sub);
        return sub;
    }
    return {
        subs,
        get clock() { return clock; },
        get hull() { return hullName; },
        get compass() { return compassMode; },
        /** 'lit' or 'dropout' (see the header); anything else throws and changes nothing. Every sub's held heading starts from the heading it has at the moment of the change. */
        setCompass(mode) {
            if (!COMPASS_MODES.includes(mode)) throw new Error(`subAquariumSim.setCompass: the compass is lit or dropout, got ${JSON.stringify(mode)}`);
            compassMode = mode; for (const sub of subs.values()) { sub.held = S.attitude(sub.state).heading; sub.dark = false; sub.darkLeft = 0; }
            return mode;
        },
        /** A kind of pilot a page builds: sub entries whose `pilot` is `kind` are flown by factory(entry) -> pilot(state, target, current, aux). It applies to subs added AFTER the call. */
        registerPilot(kind, factory) { if (typeof kind !== "string" || !kind || typeof factory !== "function") throw new Error("subAquariumSim.registerPilot: a kind (a string) and a factory (a function) are needed"); extraPilots.set(kind, factory); },
        /** Change the vessel of the whole tank (a name from physics/mechanics/subHulls.mjs; an unknown name throws and changes nothing). Every sub is put back in the water on the new hull, at a fresh start, with its trail cleared. */
        setHull(name) {
            const m = H.model(name); MODEL = m; hullName = name;
            for (const sub of subs.values()) { sub.state = spawn(sub, sub.rng, true); sub.held = S.attitude(sub.state).heading; sub.steer = { depth: 0, heading: 0, speed: 0 }; sub.trail.length = 0; sub.wasInside = true; sub.status = "swimming"; retarget(sub); }
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
                    const t = sub.steer;   // ONE object for the sub's life (a pilot that resets when its target object changes, like the navigator, must not reset at every wandering target); the values are the same as before
                    if (inside) { t.depth = sub.target.depth; t.heading = sub.target.heading; t.speed = sub.target.speed; } else { t.depth = sub.target.depth; t.heading = headingTo(x, y, LENGTH / 2, WIDTH / 2); t.speed = Math.min(sub.target.speed, 2); }
                    const psi = S.attitude(s).heading, dark = compassMode === "dropout" && compassState(sub.age, sub.phase).dark;
                    if (!dark) sub.held = psi;
                    sub.dark = dark; sub.darkLeft = dark ? compassState(sub.age, sub.phase).left : 0;
                    const seen = dark ? D.turnWorld(s, [0, 0, 0], sub.held - psi) : null;
                    const res = S.stepSub(MODEL, s, sub.pilot(dark ? seen.state : s, t, dark ? seen.current : [0, 0, 0], { compassValid: dark ? 0 : 1 }), dt);
                    sub.state = res.state;
                    if (res.status !== "submerged" || !Number.isFinite(res.state.pos[0])) { sub.lost++; sub.status = res.status; sub.state = spawn(sub, sub.rng, true); sub.held = S.attitude(sub.state).heading; sub.steer = { depth: 0, heading: 0, speed: 0 }; sub.trail.length = 0; sub.wasInside = true; retarget(sub); continue; }
                    sub.status = "swimming";
                    sub.trailT += dt;
                    if (sub.trailT >= TRAIL_EVERY) { sub.trailT = 0; sub.trail.push([sub.state.pos[0], sub.state.pos[1], -sub.state.pos[2]]); if (sub.trail.length > TRAIL) sub.trail.shift(); }
                }
            }
        },
        /** What a page draws: one plain record per sub. */
        snapshot() {
            return [...subs.values()].map((sub) => { const a = S.attitude(sub.state); return { hull: hullName, id: sub.id, name: sub.name, hue: sub.hue, pilot: sub.pilotKind, from: sub.from, local: sub.local, x: sub.state.pos[0], y: sub.state.pos[1], depth: a.depth, heading: a.heading, pitch: a.pitch, speed: a.speed, target: sub.target, lost: sub.lost, status: sub.status, trail: sub.trail.slice(), compass: compassMode, dark: sub.dark, darkLeft: sub.darkLeft, shown: sub.dark ? sub.held : a.heading, believed: typeof sub.pilot.believed === "function" ? sub.pilot.believed() : (sub.dark ? sub.held : a.heading) }; });
        },
    };
}
