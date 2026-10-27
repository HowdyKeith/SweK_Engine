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
import * as FL from "../brain/floodTask.mjs";
import * as EP from "../brain/emergencyPilot.mjs";
import * as SP from "../brain/surfacePilot.mjs";
import { turnWorld } from "../tools/subDropout.mjs";
import { navigator as deadReckoning } from "../tools/subNavigator.mjs";
import { steerWeights } from "../render/brainLens.mjs";
import * as N from "../physics/mechanics/subNeeds.mjs";
import * as NP from "../brain/needsPilot.mjs";

export const LENGTH = 500, WIDTH = 300, MARGIN = 60, DEPTH_MIN = 14, DEPTH_MAX = 40, TRAIL = 80, TRAIL_EVERY = 0.5, MAX_STEP = 0.1;
const DT = S.DT, wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const mulberry = (a) => () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const hash = (str) => { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };

// ---- EVENTS (v4901): a sub in the tank can be flooded or told to surface -----------------------------------------------------------------------------------------------------------------------------------
// *** OFF BY DEFAULT: a sub with no event is flown exactly as before (the hull's own model, the pilot alone, no tank state). *** An event puts the sub on a model with a TANK (physics/mechanics/subModel6dof.mjs v4901: a pump that moves
// 0.25 level units a second, a 1.5 bottle, an emergency blow, a 6% drop weight -- brain/floodTask.mjs FLOOD_SPEC's fields on the sub's own hull) and wraps its pilot:
//   "flood"    a leak of LEAK (6%) of the weight builds over 5 s, the target depth is held where it was, and the pilot is brain/emergencyPilot.mjs's wrap (blow, then the drop weight): the boat holds
//   "sink"     the same leak and NO rescue: the autopilot blows its tank to the stop and still sinks to the seabed; the boat is lost and put back (the count shows it)
//   "surface"  brain/surfacePilot.mjs's wrap with `surface: true` in the target: the boat rises, blows its tank and rides on its buoyancy with the tower out of the water
// setEvent(id, null) ends it: the leak stops, the tank state goes (the boat is repaired and the weight is back: it is an aquarium), the sub is flown as before. Pure like the rest: no clock but the tank's.
export const EVENTS = Object.freeze(["flood", "sink", "surface", "dropout", "navigator", "fly-estimator", "er-estimator", "needs"]);
// THE COMPASS EVENTS (tools/subDropout.mjs and tools/subNavigator.mjs, rung 4a, in the tank): for the event's own clock the compass reports for COMPASS.darkFrom seconds, then stops for COMPASS.darkLen seconds, and repeats every COMPASS.period.
//   "dropout"    the plain pilot, shown a heading that stays at the last valid one while the compass is dark (a rotated copy of the world: body rates, pitch, depth and speed stay true)
//   "navigator"  the SAME pilot behind the dead-reckoning navigator: it integrates the vessel's own heading rate through the dark and hands the pilot that estimate. Started on two subs at once the two meet the same windows.
//   "fly-estimator" / "er-estimator"  (v4904, PORTED from the tank-wide compass of b6b418f..b30f9e0 onto these per-sub events): the study's two estimators, the fly's heading-loop circuit and the best random wiring, each a pilot a PAGE builds
//                (tank.registerEstimator(event, build): build(inner) -> pilot(state, target, current, aux), `inner` the sub's own pilot seen through a spy). The sub is flown through the same dark windows as the others; the heading the
//                autopilot read on its LAST tick (the spy) is what the snapshot's `compass.seen` carries, so a page draws the amber ring and the ghost line along the heading the autopilot BELIEVES while the sub's own nose is the truth.
//                An estimator event with no builder registered throws and changes nothing (a tank without the page's circuit has none to run).
//   "needs"      (v4904, physics/mechanics/subNeeds.mjs and brain/needsPilot.mjs): the sub has a CHARGE that its thrust drains and only the surface (a battery hull) or a snorkel depth refills, and a HULL that feels the pressure and can be injured (a collapse depth that damage
//                lowers, a leak that grows with depth and damage). It rides the tank model of the flood events (so it can blow its tank and surface) and flies behind the refill-trip rule over the surfacing pilot: low charge -> up, charged -> back to its task. `setNeeds(id, class, { crushDepth })`
//                starts it (the tank-scale crush depth is 60 m: the Explorer's 100 m would never be felt in a 50 m tank), `injure(id, amount)` hurts the hull. One event at a time: it does not mix with the flood events or the compass ones.
// Neither needs a tank: the sub keeps its hull's own model. The snapshot's `compass` says { valid, seen (the heading the pilot is shown, rad), error (seen less true, wrapped, rad) }.
export const COMPASS = Object.freeze({ period: 40, darkFrom: 10, darkLen: 16 });
/** Is the compass reporting at event time t (seconds)? */
export const compassValidAt = (t) => { const p = ((t % COMPASS.period) + COMPASS.period) % COMPASS.period; return !(p >= COMPASS.darkFrom && p < COMPASS.darkFrom + COMPASS.darkLen); };
export const ESTIMATORS = Object.freeze(["fly-estimator", "er-estimator"]);
const isEstimator = (ev) => ESTIMATORS.includes(ev);
const isCompass = (ev) => ev === "dropout" || ev === "navigator" || isEstimator(ev);
const needsTank = (ev) => ev === "flood" || ev === "sink" || ev === "surface" || ev === "needs";
export const LEAK = 0.06;
export const NEEDS_CRUSH = 60;   // the tank-scale hull: the 50 m tank would never feel the Explorer's 100 m
const TANK_FIELDS = Object.freeze({ tankRate: FL.FLOOD_SPEC.tankRate, airMax: FL.FLOOD_SPEC.airMax, emergencyRate: FL.FLOOD_SPEC.emergencyRate, emergencyAirCost: FL.FLOOD_SPEC.emergencyAirCost, dropMass: FL.FLOOD_SPEC.dropMass });
// the tank is 50 m deep and a sub may be 40 m down when the leak starts, so the rescue works to the room there is: blow at 2 m deeper than the held depth, drop the weight at 4 (brain/emergencyPilot.mjs defaults, 5 and 10, are the flood task's, where a boat starts 25..35 m down)
export const RESCUE = Object.freeze({ blowDepth: 2, releaseDepth: 4 });
// a vessel whose tank can offset the leak twice over (a 25% main ballast against a 6% leak) has no emergency: its own ballast law trims it out, and the full blow of the rescue would only spend the bottle (measured: it emptied the 1.5 bottle
// in 15 s on the high rider and the boat grounded). The EXPLORER's 3% cannot, and gets the rescue.
export const trimsOut = (model) => model.spec.ballastRange >= 2 * LEAK;
const withTank = (model) => S.createSubModel(Object.freeze({ ...model.spec, ...TANK_FIELDS }));

/** The heading that points from (x, y) at (tx, ty), in the engine's convention (0 = +x, a right turn increases it). */
export const headingTo = (x, y, tx, ty) => Math.atan2(-(ty - y), tx - x);
/** Is a point inside the steering box (MARGIN m in from every wall)? */
export const insideBox = (x, y) => x >= MARGIN && x <= LENGTH - MARGIN && y >= MARGIN && y <= WIDTH - MARGIN;


/** A new tank. `sync(list)` reconciles it with the aquarium's list; `step(seconds)` advances it; `subs` are the live boats. */
export function createTank({ hull = "nominal", length = LENGTH, width = WIDTH } = {}) {
    // v4902 -- the tank may be bigger than the default 500 x 300 m (the subs need room to swim: the Sea OGRE and a crowded tank both do); every wall below is THIS tank's own
    const insideBox = (x, y) => x >= MARGIN && x <= length - MARGIN && y >= MARGIN && y <= width - MARGIN;
    const subs = new Map();   // id -> live sub
    const estimators = new Map();   // event name -> build(inner) -> pilot, registered by a page (the estimators need the fly circuit it loads)
    let clock = 0, hullName = hull, MODEL = H.model(hull);   // the vessel every sub in the tank is (physics/mechanics/subHulls.mjs); the pilots do not know which

    function spawn(entry, rng, atCentre = false) {
        const x = atCentre ? length / 2 + (rng() - 0.5) * 60 : MARGIN + rng() * (length - 2 * MARGIN), y = atCentre ? width / 2 + (rng() - 0.5) * 40 : MARGIN + rng() * (width - 2 * MARGIN);
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
    // the compass events' pilot: the same inner pilot, shown the held heading in the dark (tools/subDropout.mjs turnWorld), behind the dead-reckoning navigator for "navigator". The navigator tells a new target by its IDENTITY, and the
    // tank makes a fresh target object every tick outside the steering box, so the pilot is handed ONE object that is rewritten each tick.
    function compassPilot(sub, kind) {
        // kind: "plain", "nav" (the dead-reckoning navigator) or an estimator event name (the page's build(spy))
        const nav = kind === "nav", seen = { h: 0 };
        const spy = (st, tg, cur, aux) => { seen.h = S.attitude(st).heading; return sub.pilot(st, tg, cur, aux); };   // the heading the autopilot READ on its last tick
        const inner = nav ? deadReckoning(sub.pilot) : estimators.has(kind) ? estimators.get(kind)(spy) : sub.pilot, tgt = {}; let held = null;
        return (state, t, current) => {
            Object.assign(tgt, t);
            const valid = compassValidAt(sub.eventT), psi = S.attitude(state).heading;
            if (valid || held === null) held = psi;
            if (valid) { const cmd = inner(state, tgt, current, { compassValid: 1, dt: sub.tickDt }); sub.compass = { valid: true, seen: estimators.has(kind) ? seen.h : psi, error: estimators.has(kind) ? wrap(seen.h - psi) : 0 }; return cmd; }
            const sw = turnWorld(state, current, held - psi);
            const cmd = inner(sw.state, tgt, sw.current, { compassValid: 0, dt: sub.tickDt });
            const b = nav ? inner.last.estimate : estimators.has(kind) ? seen.h : held;
            sub.compass = { valid: false, seen: b, error: wrap(b - psi) };
            return cmd;
        };
    }
    function clearEvent(sub) {
        if (!sub.event) return;
        if (sub.state && sub.state.tank) { const { tank, ...rest } = sub.state; sub.state = rest; }
        sub.event = null; sub.eventT = 0; sub.eventModel = null; sub.eventPilot = null; sub.compass = null; sub.needs = null; sub.needsInfo = null;
    }
    function add(entry) {
        const rng = mulberry(hash(entry.id));
        const sub = { id: entry.id, name: entry.name, hue: entry.hue, pilotKind: entry.pilot, from: entry.from, local: !!entry.local, rng, pilot: pilotFor(entry), weights: entry.weights && entry.weights.length === PS.WEIGHT_COUNT ? Float32Array.from(entry.weights) : null, tgt: null, state: null, target: null, nextTarget: 0, age: 0, lost: 0, wasInside: true, status: "swimming", trail: [], trailT: 0, event: null, eventT: 0, eventModel: null, eventPilot: null, holdDepth: 0, compass: null };
        sub.state = spawn(entry, rng); retarget(sub);
        subs.set(entry.id, sub);
        return sub;
    }
    return {
        subs, length, width,
        get clock() { return clock; },
        get hull() { return hullName; },
        /** Change the vessel of the whole tank (a name from physics/mechanics/subHulls.mjs; an unknown name throws and changes nothing). Every sub is put back in the water on the new hull, at a fresh start, with its trail cleared. */
        setHull(name) {
            const m = H.model(name); MODEL = m; hullName = name;
            for (const sub of subs.values()) { clearEvent(sub); sub.state = spawn(sub, sub.rng, true); sub.trail.length = 0; sub.wasInside = true; sub.status = "swimming"; retarget(sub); }
            return name;
        },
        /**
         * STEER a hidden neuron of a network sub (v4904): neuron `i` of the last hidden layer is pushed by `delta` (hidden units; the brain panel's lens names a push in the same units), through the output layer -- the weights the sub flies on become a copy
         * with each output's bias moved by W[j,i] x delta (render/brainLens.mjs steerWeights), so the panel's outputs show it and the sub flies it. `i` null (or delta 0) clears it. Returns { neuron, delta } or null. Only a sub given the 963 weights has a
         * network (anything else throws and changes nothing); a bad neuron throws; an unknown id returns null; a sub with an EVENT running is refused (an event wraps the pilot it was started with: end it first). The steer survives a loss and respawn.
         */
        setSteer(id, i, delta) {
            const sub = subs.get(id); if (!sub) return null;
            if (!sub.weights) throw new Error("subAquariumSim.setSteer: only a sub flown by a network (963 weights) has a neuron to steer");
            if (sub.event) throw new Error("subAquariumSim.setSteer: end the sub's event first (an event wraps the pilot it was started with)");
            if (i === null || i === undefined || delta === 0) { sub.steer = null; sub.steerW = null; sub.pilot = PS.pilotFor(Float32Array.from(sub.weights)); return null; }
            const w = steerWeights(PS, sub.weights, i, delta); if (!w) throw new Error(`subAquariumSim.setSteer: neuron ${i} is not one of the ${PS.HIDDEN} hidden neurons, or delta ${delta} is not a number`);
            sub.steer = { neuron: i, delta }; sub.steerW = w; sub.pilot = PS.pilotFor(Float32Array.from(w));
            return { ...sub.steer };
        },
        /**
         * Start the needs event on a sub with a hull CLASS (subNeeds.CLASSES: battery, snorkel, airIndependent, unlimited) and an undamaged collapse depth (default NEEDS_CRUSH). A bad class or crush depth throws and changes nothing; an unknown id answers null; a sub with a steer is refused
         * (see setEvent). Returns the event now running ("needs").
         */
        setNeeds(id, cls, { crushDepth = NEEDS_CRUSH } = {}) {
            const n = N.initialNeeds(cls, { crushDepth });   // throws on a bad class or crush depth BEFORE anything changes
            const sub = subs.get(id); if (!sub) return null;
            sub.pendingNeeds = n; try { return this.setEvent(id, "needs"); } catch (e) { sub.pendingNeeds = null; throw e; }
        },
        /** Hurt the hull of a sub that has needs by `amount` of its life (0..1; NaN and negatives do nothing). Answers its damage now; an unknown id answers null; a sub with no needs throws (start them with setNeeds). */
        injure(id, amount) {
            const sub = subs.get(id); if (!sub) return null;
            if (!sub.needs) throw new Error("subAquariumSim.injure: the sub has no needs (start them with setNeeds)");
            sub.needs = N.injure(sub.needs, amount); return sub.needs.damage;
        },
        /** A page's estimator pilot for an estimator event (fly-estimator, er-estimator): build(inner) -> pilot(state, target, current, aux), `inner` the sub's own pilot seen through a spy. Applies to events started AFTER the call. A bad name or builder throws and changes nothing. */
        registerEstimator(event, build) {
            if (!isEstimator(event)) throw new Error(`subAquariumSim.registerEstimator: an estimator event (${ESTIMATORS.join(", ")}), got ${JSON.stringify(event)}`);
            if (typeof build !== "function") throw new Error("subAquariumSim.registerEstimator: a builder (a function) is needed");
            estimators.set(event, build);
        },
        /**
         * Start (or, with null, end) an event on one sub: "flood", "sink" or "surface" (see EVENTS). Returns the event now running, or null. An unknown event name throws and changes nothing; an unknown id does nothing and returns null.
         * Starting one on a sub that already has one swaps it: the tank state is kept (a dropped weight stays dropped, the air stays spent), the leak and the clock start again.
         */
        setEvent(id, ev) {
            const sub = subs.get(id);
            if (sub && sub.steer && ev !== null && ev !== undefined && ev !== "") throw new Error("subAquariumSim.setEvent: clear the sub's steer first (an event wraps the pilot it was started with)");
            if (ev !== null && ev !== undefined && ev !== "" && !EVENTS.includes(ev)) throw new Error(`subAquariumSim.setEvent: unknown event "${ev}" (${EVENTS.join(", ")})`);
            if (isEstimator(ev) && !estimators.has(ev)) throw new Error(`subAquariumSim.setEvent: no builder is registered for "${ev}" (a page registers one with registerEstimator)`);
            if (!sub) return null;
            if (ev === null || ev === undefined || ev === "") { clearEvent(sub); return null; }
            if (needsTank(ev)) {
                if (!sub.state.tank) { sub.eventModel = withTank(MODEL); sub.state = { ...sub.state, tank: { ...S.initialTank(sub.eventModel), level: sub.cmd ? Math.max(-1, Math.min(1, sub.cmd.ballast)) : 0 } }; }
            } else if (sub.state.tank) { const { tank, ...rest } = sub.state; sub.state = rest; sub.eventModel = MODEL; }   // a compass event has no tank
            else sub.eventModel = MODEL;
            sub.event = ev; sub.eventT = 0; sub.holdDepth = -sub.state.pos[2]; sub.compass = null; sub.needsInfo = null;
            if (ev === "needs") { sub.needs = sub.pendingNeeds || N.initialNeeds("battery", { crushDepth: NEEDS_CRUSH }); sub.pendingNeeds = null; } else sub.needs = null;
            sub.eventPilot = ev === "needs" ? NP.wrap(SP.wrap(sub.pilot, { model: sub.eventModel }), { read: () => N.readings(sub.eventModel, sub.needs, sub.state) }) : ev === "flood" ? (trimsOut(sub.eventModel) ? sub.pilot : EP.wrap(sub.pilot, RESCUE)) : ev === "surface" ? SP.wrap(sub.pilot, { model: sub.eventModel }) : isCompass(ev) ? compassPilot(sub, ev === "navigator" ? "nav" : ev === "dropout" ? "plain" : ev) : sub.pilot;
            return ev;
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
                    if (!inside && sub.wasInside) { sub.target = { depth: sub.target.depth, heading: wrap(headingTo(x, y, length / 2, width / 2) + (sub.rng() - 0.5) * 0.8), speed: Math.min(sub.target.speed, 2.5) }; sub.nextTarget = sub.age + 15 + sub.rng() * 15; }
                    sub.wasInside = inside;
                    const t = sub.tgt = inside ? sub.target : { depth: sub.target.depth, heading: headingTo(x, y, length / 2, width / 2), speed: Math.min(sub.target.speed, 2) };
                    sub.tickDt = dt;   // the navigator integrates over THIS tick, which is shorter than DT when a frame ends mid-tick
                    const ev = sub.event, model = ev ? sub.eventModel : MODEL;
                    const tg = ev === "surface" ? { ...t, surface: true } : ev === "flood" || ev === "sink" ? { ...t, depth: sub.holdDepth } : t;   // a flooded boat holds the depth it was at; a surfacing one is asked to surface
                    const cmd = (ev ? sub.eventPilot : sub.pilot)(s, tg, [0, 0, 0]);
                    let res;
                    if (ev === "needs") { res = N.stepNeeds(model, s, sub.needs, cmd, dt, [0, 0, 0], 0); sub.needs = res.needs; sub.needsInfo = { watts: res.watts, charging: res.charging, exposed: res.exposed }; }
                    else res = S.stepSub(model, s, cmd, dt, [0, 0, 0], ev === "flood" || ev === "sink" ? FL.leakAt({ leak: LEAK }, sub.eventT) : 0);
                    if (ev) sub.eventT += dt;
                    sub.cmd = { pitch: cmd.pitch, yaw: cmd.yaw, thrust: cmd.thrust, ballast: cmd.ballast };   // what the pilot asked for this tick: the page draws the fins from it
                    if (cmd.blow !== undefined) sub.cmd.blow = cmd.blow; if (cmd.release !== undefined) sub.cmd.release = cmd.release;
                    sub.state = res.state;
                    if (res.status !== "submerged" || !Number.isFinite(res.state.pos[0])) { sub.lost++; sub.status = res.status; clearEvent(sub); sub.state = spawn(sub, sub.rng, true); sub.trail.length = 0; sub.wasInside = true; retarget(sub); continue; }
                    sub.status = "swimming";
                    sub.trailT += dt;
                    if (sub.trailT >= TRAIL_EVERY) { sub.trailT = 0; sub.trail.push([sub.state.pos[0], sub.state.pos[1], -sub.state.pos[2]]); if (sub.trail.length > TRAIL) sub.trail.shift(); }
                }
            }
        },
        /** What a brain panel needs of one sub (render/brainPanel.mjs subPanel): { id, name, kind ("fly" when it was given the 963 weights, else "autopilot"), weights, state, target (the one it was flown to last tick) }, or null for an unknown id. The state is the live one: read it, do not keep it. */
        probe(id) { const sub = subs.get(id); return sub ? { id: sub.id, name: sub.name, kind: sub.weights ? "fly" : "autopilot", weights: sub.steerW || sub.weights, steer: sub.steer ? { ...sub.steer } : null, state: sub.state, target: sub.tgt || sub.target } : null; },
        /** What a page draws: one plain record per sub. */
        snapshot() {
            return [...subs.values()].map((sub) => { const a = S.attitude(sub.state); return { hull: hullName, id: sub.id, name: sub.name, hue: sub.hue, pilot: sub.pilotKind, from: sub.from, local: sub.local, x: sub.state.pos[0], y: sub.state.pos[1], depth: a.depth, heading: a.heading, pitch: a.pitch, speed: a.speed, cmd: sub.cmd ? { ...sub.cmd } : { pitch: 0, yaw: 0, thrust: 0, ballast: 0 }, event: sub.event, steer: sub.steer ? { ...sub.steer } : null, needs: sub.needs ? { ...N.readings(sub.eventModel, sub.needs, sub.state), refilling: !!(sub.eventPilot && sub.eventPilot.refilling), watts: sub.needsInfo ? sub.needsInfo.watts : 0, charging: !!(sub.needsInfo && sub.needsInfo.charging) } : null, compass: sub.compass ? { ...sub.compass } : null, tank: sub.state.tank ? { level: sub.state.tank.level, air: sub.state.tank.air, airMax: sub.eventModel ? sub.eventModel.spec.airMax : null, released: sub.state.tank.released, blowing: !!(sub.cmd && sub.cmd.blow > 0.5) } : null, target: sub.target, lost: sub.lost, status: sub.status, trail: sub.trail.slice() }; });
        },
    };
}
