// WebGLEngine/brain/subStations.mjs -- UNNUMBERED (the version is chosen at ship time; the design is brain/SUB_STATIONS_WIP.md; the gate is brain/subStations-selfcheck.mjs)
//
// THE STATIONS OF A SUBMARINE AND THE CAPTAIN THAT DECIDES BETWEEN THEM (backlog `ai-managed-sub-stations`, Keith's idea: "the engine's AI managing ALL the stations of a submarine ... each by a brain, instead of one pilot flying the whole boat").
// The backlog's own sketch, made concrete: "a station is a function from what that station can sense to what it commands, a captain layer decides between them, and the existing per-purpose pieces are the first station brains."
//
// THE SHAPE. Every tick the captain is handed the boat's state, the MISSION target (where the boat has been told to be) and the current, and asks its stations in a fixed order:
//   TARGET STATIONS   may CLAIM the target the helm will fly (a depth, a heading, a speed, `surface`): the energy station claims the surface when the charge rule says so. A claim carries a priority; the highest wins outright, a tie goes
//                     to the earlier station. A station that does not claim says nothing.
//   THE HELM          flies the chosen target: one pilot function (state, target, current, aux) -> { pitch, yaw, thrust, ballast, ... }. It is the boat's pilot behind the surfacing wrapper, so it can also come up and stay up.
//   COMMAND STATIONS  may OVERRIDE the helm's commands after it has spoken: damage control blows the tank and drops the weight when the boat is sinking past its target. Applied in order, each seeing the commands so far.
//   AUX               the pump and the repair (physics/mechanics/subNeeds.mjs stepNeeds' aux): each station may ask for them; the captain gives the LARGEST asked, so a station can ask for help and never take it away.
// THE FIRST CAPTAIN IS FIXED PRIORITY (FIXED_CAPTAIN): it is what the tank's nested wrappers already do, written down. With one station speaking it is that station's wrapper BIT FOR BIT (the gate flies both and compares every
// command of every tick): energy alone is brain/needsAdvisor.mjs's wrap, damage control alone is brain/emergencyPilot.mjs's wrap. What is new is that SEVERAL stations can run at once (the tank today runs one event at a time),
// and that every tick says who had the con and why (`log`, `watch`). Whether a different captain does better is a question for a registered round (brain/SUB_STATIONS_WIP.md section 5), not for this file.
// WHAT A STATION SEES is what it is given, and no more: the energy station is given read() (the needs readings) and nothing of the mission; damage control the state and the target the helm flew; the helm the target and the state.
// Pure: no DOM, no clock, no Math.random.
"use strict";
import * as AV from "./needsAdvisor.mjs";
import * as EP from "./emergencyPilot.mjs";
import * as SP from "./surfacePilot.mjs";
import { sanitize } from "../physics/mechanics/subModel6dof.mjs";   // the sanitize emergencyPilot.wrap uses, so a damage override is the wrapper's bit for bit

export const KINDS = Object.freeze(["target", "command"]);
export const PRIORITY = Object.freeze({ mission: 0, navigation: 10, sonar: 30, energy: 50, damage: 90 });   // 2026-11-19: sonar between navigation and energy (brain/SUB_STATIONS_WIP.md section 11)

const isFn = (f) => typeof f === "function";
function check(st) {
    if (!st || typeof st.name !== "string" || !st.name) throw new Error("subStations: a station needs a name");
    if (!KINDS.includes(st.kind)) throw new Error(`subStations: station ${st.name}'s kind must be one of ${KINDS.join(", ")}, got ${JSON.stringify(st.kind)}`);
    if (!isFn(st.propose)) throw new Error(`subStations: station ${st.name} needs a propose function`);
    return st;
}

/** THE ENERGY STATION: the Round 4 rule of brain/needsAdvisor.mjs (adviceOf, surfaceTarget). Claims the surface (or the snorkel band) when the advice says surface; always asks for the pump and the repair the advice gives. Sees read() only. */
export function energyStation({ read, speed = 1.5, snorkelFraction = 0.75, priority = PRIORITY.energy } = {}) {
    if (!isFn(read)) throw new Error("subStations.energyStation: a read() function is needed");
    return check({ name: "energy", kind: "target", priority, propose: ({ target }) => {
        const r = read(), advice = AV.adviceOf(r), aux = { pump: advice.pump ? 1 : 0, repair: advice.repair ? 1 : 0 };
        if (!advice.surface) return { claim: null, aux, advice, reason: null };
        return { claim: AV.surfaceTarget(target, r, { speed, snorkelFraction }), aux, advice, reason: `charge under ${Math.round(advice.threshold * 100)}% at ${Math.round(r.depth)} m` };
    } });
}

/** DAMAGE CONTROL: brain/emergencyPilot.mjs's stages (blow, then the drop weight) on the commands the helm gave, judged against the target the helm flew. Sees the state and that target. */
export function damageStation(opts = {}) {
    return check({ name: "damage", kind: "command", priority: PRIORITY.damage, propose: ({ state, flown, cmd }) => {
        const st = EP.stage(state, flown, opts);
        if (st === "ok" || st === "gone") return { cmd: null, reason: null };
        return { cmd: { ...cmd, pitch: 1, thrust: 1, blow: 1, release: st === "release" ? 1 : 0 }, reason: st === "release" ? "sinking past the target: drop the weight" : "sinking past the target: blow" };
    } });
}

/** A TARGET STATION from a function (state, target) -> null | target, for anything that only moves the target (a navigator's waypoint, a mission's next leg). */
export function targetStation(name, fn, { priority = PRIORITY.navigation } = {}) {
    if (!isFn(fn)) throw new Error(`subStations.targetStation: station ${name} needs a function`);
    return check({ name, kind: "target", priority, propose: ({ state, target }) => { const t = fn(state, target); return { claim: t || null, aux: null, reason: t ? `${name}'s target` : null }; } });
}

/** THE HELM: the boat's pilot behind the surfacing wrapper (brain/surfacePilot.mjs), so a claim of `surface: true` is flown. `model` is the vessel (its float depth). */
export const helmOf = (pilot, { model } = {}) => { if (!isFn(pilot)) throw new Error("subStations.helmOf: a pilot function is needed"); return SP.wrap(pilot, { model }); };

/**
 * THE CAPTAIN: captain({ helm, stations }) -> pilot(state, mission, current, aux) with:
 *   .log    the last tick: { con, reason, flown, overrides: [names], aux } (`con` is the station whose target was flown, "mission" when none claimed)
 *   .watch  the ticks each station has held the con (and "mission"), and the ticks each command station overrode the helm
 *   .aux    the pump and repair the stations asked for on the last tick (the largest asked), or null when none asked for either
 * The stations are asked in the order given; the helm is the pilot every tick. The aux argument the caller passes is handed to the helm unchanged.
 */
export function captain({ helm, stations = [] } = {}) {
    if (!isFn(helm)) throw new Error("subStations.captain: a helm (a pilot function) is needed");
    const st = stations.map(check), names = st.map((s) => s.name);
    if (new Set(names).size !== names.length) throw new Error(`subStations.captain: a station is named twice (${names.join(", ")})`);
    const targetSt = st.filter((s) => s.kind === "target"), commandSt = st.filter((s) => s.kind === "command");
    const watch = { con: { mission: 0 }, overrides: {} };
    for (const s of targetSt) watch.con[s.name] = 0;
    for (const s of commandSt) watch.overrides[s.name] = 0;
    let log = null, auxOut = null;
    const pilot = (state, mission, current = [0, 0, 0], aux) => {
        let flown = mission, con = "mission", reason = null, best = -Infinity, asked = null;
        for (const s of targetSt) {
            const p = s.propose({ state, target: mission });
            if (p && p.aux) asked = { pump: Math.max(asked ? asked.pump : 0, p.aux.pump || 0), repair: Math.max(asked ? asked.repair : 0, p.aux.repair || 0) };
            if (p && p.claim && s.priority > best) { best = s.priority; flown = p.claim; con = s.name; reason = p.reason; }
        }
        let cmd = helm(state, flown, current, aux);
        const overrides = [];
        for (const s of commandSt) {
            const p = s.propose({ state, flown, cmd });
            if (p && p.cmd) { cmd = p.cmd; overrides.push(s.name); watch.overrides[s.name]++; if (!reason) reason = p.reason; }
        }
        watch.con[con]++;
        auxOut = asked; log = { con, reason, flown, overrides, aux: asked };
        return overrides.length ? sanitize(cmd) : cmd;
    };
    Object.defineProperty(pilot, "log", { get: () => (log ? { ...log, overrides: [...log.overrides] } : null) });
    Object.defineProperty(pilot, "watch", { get: () => ({ con: { ...watch.con }, overrides: { ...watch.overrides } }) });
    Object.defineProperty(pilot, "aux", { get: () => (auxOut ? { ...auxOut } : null) });
    return pilot;
}

/**
 * THE TRIAGE CAPTAIN (round 2, brain/SUB_STATIONS_WIP.md sections 7 and 8): the SAME energy and damage stations, and a captain that knows what their actions cost. Only the captain's choices change:
 *   T1  damage control's rescue thrust is capped by the charge left: thrust <= clamp(frac / thrustFull, thrustFloor, 1) (thrust spends the charge the boat needs to reach the surface). Off with thrustFull null.
 *   T2  in trouble with the charge under `earlyDropBelow`, the weight goes at once instead of after the blow (it costs no charge; it is one-way). Off with null.
 *   T4  (added in registration B, from the DEV failures) once damage control has acted, the boat is BREACHED for the rest of the dive and the captain claims the surface itself (the energy station's surfaceTarget) while it still has
 *       charge: holding depth against a leak that never stops costs charge for ever. Off with surfaceOnBreach false.
 *   T3  while the energy station claims the surface AND the boat sinks faster than `unrationSink` (m/s), the claim is flown by the bare pilot towards the float depth, without the surfacing wrapper's bottle rationing. Off with null.
 * `pilot` is the bare pilot, `model` the vessel, `read` the needs readings. Returns a pilot with the same log, watch and aux as captain(), and `.triage` counting the ticks each of T1 to T3 changed something.
 */
export const TRIAGE_OFF = Object.freeze({ thrustFull: null, thrustFloor: 0, earlyDropBelow: null, unrationSink: null, surfaceOnBreach: false });
// v4930 (round 7) -- `more`: extra target stations asked FIRST (round 7's COMBINED puts ROUTE's legs station here); `energyAllow`: a gate on the energy station's surface claim (null: none; ROUTE shuts it). Both default to v4929's captain.
export function triageCaptain({ pilot, model, read, knobs = TRIAGE_OFF, damageOpts = {}, more = [], energyAllow = null } = {}) {
    if (!isFn(pilot) || !isFn(read)) throw new Error("subStations.triageCaptain: a pilot and a read() function are needed");
    const k = { ...TRIAGE_OFF, ...knobs }, helm = helmOf(pilot, { model }), energy = energyAllow ? gatedStation(energyStation({ read }), energyAllow) : energyStation({ read }), damage = damageStation(damageOpts), SD = model ? SP.surfacedDepth(model) : SP.SURFACED_DEPTH;
    const counts = { T1: 0, T2: 0, T3: 0, T4: 0 };
    let breached = false;
    // the stations are asked through the same captain() so the log, the watch and the aux are kept the same way; T3 swaps the helm for the tick, T1 and T2 edit the commands after it
    let bare = false;
    const swapHelm = (state, target, current, aux) => (bare ? pilot(state, { ...target, depth: SD }, current, aux) : helm(state, target, current, aux));
    const breach = check({ name: "breach", kind: "target", priority: PRIORITY.energy, propose: ({ target }) => (breached ? { claim: AV.surfaceTarget(target, read()), aux: null, reason: "breached: up while there is charge" } : { claim: null, aux: null, reason: null }) });
    const run = captain({ helm: swapHelm, stations: [...more, ...(k.surfaceOnBreach ? [energy, breach, damage] : [energy, damage])] });
    const out = (state, mission, current = [0, 0, 0], aux) => {
        const r = read(), sinking = k.unrationSink !== null && state.vel[2] < -k.unrationSink;
        bare = false;
        if (sinking) { const p = energy.propose({ state, target: mission }); if ((p.claim && p.claim.surface) || (breached && k.surfaceOnBreach && read().refillDepth <= 1)) { bare = true; counts.T3++; } }
        if (breached && k.surfaceOnBreach) counts.T4++;
        let cmd = run(state, mission, current, aux);
        const log = run.log;
        if (log.overrides.includes("damage")) breached = true;
        if (log.overrides.includes("damage")) {
            let c = { ...cmd }, changed = false;
            if (k.thrustFull !== null) { const cap = Math.max(k.thrustFloor, Math.min(1, r.frac / k.thrustFull)); if (c.thrust > cap) { c.thrust = cap; counts.T1++; changed = true; } }
            if (k.earlyDropBelow !== null && r.frac < k.earlyDropBelow && c.release !== 1 && !(state.tank && state.tank.released)) { c.release = 1; counts.T2++; changed = true; }
            if (changed) cmd = sanitize(c);
        }
        return cmd;
    };
    Object.defineProperty(out, "log", { get: () => run.log });
    Object.defineProperty(out, "watch", { get: () => run.watch });
    Object.defineProperty(out, "aux", { get: () => run.aux });
    Object.defineProperty(out, "triage", { get: () => ({ ...counts }) });
    return out;
}

// ---- 2026-11-19: NAVIGATION AND SONAR AS STATIONS (brain/SUB_STATIONS_WIP.md section 11) -----------------------------------------------------------------------------------------------------------------

/**
 * NAVIGATION: the Sub Aquarium's navigator (brain/subTankNav.mjs createNavigator: a goal through a sea of islands, icebergs and ships) as a target station. It is STEPPED EVERY TICK whoever has the con -- it keeps its counters
 * (arrivals, hits) and its plan from the boat's real position -- and claims the target it returns, at the navigation priority. `clock()` is the tank's time, `fleet()` the other subs as traffic (or null), `avoidFleet()` whether to
 * treat them so. Alone under a captain it IS the tank's courier: the gate flies both and compares every command.
 */
export function navigationStation(nav, { clock, dt, fleet = () => null, avoidFleet = () => true, priority = PRIORITY.navigation } = {}) {
    if (!nav || !isFn(nav.step)) throw new Error("subStations.navigationStation: a navigator (with step) is needed");
    if (!isFn(clock) || !Number.isFinite(dt)) throw new Error("subStations.navigationStation: a clock() and a tick length dt are needed");
    return check({ name: "navigation", kind: "target", priority, propose: ({ state }) => ({ claim: nav.step(state, clock(), dt, fleet(), avoidFleet()), aux: null, reason: "navigation: to the goal" }) });
}

/**
 * SONAR AND WEAPONS: the duel's tactician (brain/subDuel.mjs: at each LOOK it is handed the passive contacts, its echoes and the pings it heard, and answers a depth, a heading, a speed, fire and ping) as a target station.
 * The duel itself holds the look, clamps the answer into the boat's target and fires and pings; the station holds that target and claims it at the sonar priority, so another station (energy, damage control) can outrank it.
 * `hold(target)` is called with the duel's target; `propose` claims it. Before the first look it claims nothing.
 */
export function sonarStation({ priority = PRIORITY.sonar } = {}) {
    let held = null;
    const st = check({ name: "sonar", kind: "target", priority, propose: () => (held ? { claim: { ...held }, aux: null, reason: "sonar: the tactician's target" } : { claim: null, aux: null, reason: null }) });
    st.hold = (t) => { held = t ? { ...t } : null; };
    return st;
}

/**
 * A DUEL SIDE CREWED BY STATIONS: { tactics, pilot } for brain/subDuel.mjs's duel(). `tactics` is the tactician (passed through unchanged: the duel acts on its fire and ping); the pilot is a captain whose sonar station
 * holds the target the duel hands the helm, beside any `stations` (made by `more(sonar)` so they can see it) under the helm `helm`. With no other station it is the plain side bit for bit (the gate compares whole duels).
 */
export function duelSide({ tactics, helm, more = () => [], captainOf = (h, stations) => captain({ helm: h, stations }) } = {}) {
    if (!isFn(tactics) || !isFn(helm)) throw new Error("subStations.duelSide: a tactician and a helm are needed");
    const sonar = sonarStation(), cap = captainOf(helm, [sonar, ...more(sonar)]);
    const pilot = (state, target, current, aux) => { sonar.hold(target); return cap(state, target, current, aux); };
    Object.defineProperty(pilot, "log", { get: () => cap.log });
    Object.defineProperty(pilot, "watch", { get: () => cap.watch });
    return { tactics, pilot, captain: cap, sonar };
}

/**
 * A GATED STATION (round 3, brain/SUB_STATIONS_WIP.md section 12): `station`'s claim passes only while `allow()` is true; its aux asks always pass (a pump is cheap; a change of course is what costs). The name, kind and priority are the
 * station's, so the captain ranks it as before. `.blocked` counts the ticks a claim was held back.
 */
export function gatedStation(station, allow) {
    check(station);
    if (!isFn(allow)) throw new Error(`subStations.gatedStation: station ${station.name} needs an allow() function`);
    let blocked = 0;
    const g = check({ name: station.name, kind: station.kind, priority: station.priority, propose: (ctx) => {
        const p = station.propose(ctx);
        if (!p || !p.claim || allow()) return p;
        blocked++; return { ...p, claim: null, reason: null };
    } });
    Object.defineProperty(g, "blocked", { get: () => blocked });
    return g;
}

