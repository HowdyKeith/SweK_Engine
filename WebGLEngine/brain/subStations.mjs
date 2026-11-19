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
export const PRIORITY = Object.freeze({ mission: 0, navigation: 10, energy: 50, damage: 90 });

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
