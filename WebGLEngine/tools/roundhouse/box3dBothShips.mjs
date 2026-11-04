// WebGLEngine/tools/roundhouse/box3dBothShips.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// THE FIGHTS WITH BOTH SHIPS ON box3d, as physics/mechanics/BOX3D_BOTH_SHIPS_WIP.md registers the round. The library: the registration
// as data, the four ways of flying a duel (E, BB, A3, E'), the cells, the controls and the readings. The outcome, the comparison, the
// sign test and the reading are the orientation round's own (tools/roundhouse/orientationStep.mjs); box3d and its stepper are
// sixdof-box3d's (tools/roundhouse/sixdofBox3d.mjs). The command is box3dBothShipsRun.mjs and prints no score; the gate is
// box3dBothShips-selfcheck.mjs.
//
// NODE ONLY: box3d is adopted from the vendored wasm through sixdof-box3d's box3dReady(). Each ship on box3d has a stepper of its own,
// and each stepper builds the ship's world for the tick and destroys it after, so box3d's one world at a time is never exceeded.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as RB from "../../physics/mechanics/rigidBody6dof.mjs";
import * as P6 from "../../brain/pilot6dofPolicy.mjs";
import * as OS from "./orientationStep.mjs";
import * as SB3 from "./sixdofBox3d.mjs";
import * as PJ from "./box3dPdJoust.mjs";
import * as SB from "./spinningBody.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url)), ENG = path.resolve(HERE, "..", "..");
const range = (a, n) => Object.freeze(Array.from({ length: n }, (_, i) => a + i)), J = JSON.stringify;
export const REGISTRATION = "physics/mechanics/BOX3D_BOTH_SHIPS_WIP.md";
export const DEFAULT_RESULTS = path.join(ENG, "physics", "mechanics", "box3dBothShipsResults.json");
export const SCENARIOS = OS.SCENARIOS, PILOTS = OS.PILOTS, PILOT_IDS = OS.PILOT_IDS, DUEL_DT = SB3.DUEL_DT;
/** 100 fresh seeds of each scenario; E' moves A's start 1e-9 m in y. */
export const FIGHT = Object.freeze({ seeds: range(96001, 100), nudge: 1e-9 });
/** The four ways each duel is flown: both on the engine's own; both on box3d; A only on box3d; both on the engine's own, A nudged. */
export const WAYS = Object.freeze(["E", "BB", "A3", "E'"]);
export const ALPHA = 0.01;
export const CAPS = PJ.CAPS;
/** A flight is at the cap when its ships' top spin comes within 1e-3 rad/s of box3d's 0.25 pi / dt (box3d reads back in float32). */
export const AT_CAP = 1e-3;

// ---- a fight ------------------------------------------------------------------------------------------------------------------
const read = (r) => ({ outcome: OS.outcomeOf(r), fingerprint: r.fingerprint, ticks: r.ticks });
/** One duel of `pilot` as A against the PD autopilot as B, flown `way`; box3d's steppers watched, when a watch is given. */
export function fight(b3, pilot, seed, scenario, way, { nudge = FIGHT.nudge, watch = null } = {}) {
    const w = (f) => (watch ? PJ.watched(watch, f) : f);
    if (way === "E") return read(P6.duel(pilot, "autopilot", { seed, scenario }));
    if (way === "E'") return read(P6.duel(pilot, "autopilot", { seed, scenario, nudge }));
    if (way === "A3") return SB3.withStepper(b3, (sa) => read(P6.duel(pilot, "autopilot", { seed, scenario, stepA: w(sa.step) })));
    if (way === "BB") return SB3.withStepper(b3, (sa) => SB3.withStepper(b3, (sb) => read(P6.duel(pilot, "autopilot", { seed, scenario, stepA: w(sa.step), stepB: w(sb.step) }))));
    throw new Error(`box3dBothShips: no such way ${J(way)}`);
}
const tallyOf = (rs) => ({ win: rs.filter((r) => r.outcome === "win").length, loss: rs.filter((r) => r.outcome === "loss").length, draw: rs.filter((r) => r.outcome === "draw").length });
const movedOf = (flights, way) => flights[way].filter((f, i) => f.fingerprint !== flights.E[i].fingerprint).length;

// ---- the cells ----------------------------------------------------------------------------------------------------------------
// Each BB and A3 flight is watched on its own: the cell reports its top speed and spin and how many flights reached the spin cap, and the
// BB flights' watches add up to C-caps' (added while building, reporting only -- see the note's build record).
const merge = (into, w) => { into.ticks += w.ticks; into.maxSpeed = Math.max(into.maxSpeed, w.maxSpeed); into.maxSpin = Math.max(into.maxSpin, w.maxSpin); return into; };
export function measure(b3, pilots, seeds = FIGHT.seeds, { nudge = FIGHT.nudge } = {}) {
    const cells = [], watch = PJ.newWatch();
    for (const p of pilots) for (const scenario of SCENARIOS) {
        const flights = {}, caps = { BB: { ticks: 0, maxSpeed: 0, maxSpin: 0, atCap: 0 }, A3: { ticks: 0, maxSpeed: 0, maxSpin: 0, atCap: 0 } };
        for (const way of WAYS) flights[way] = seeds.map((s) => {
            if (way !== "BB" && way !== "A3") return fight(b3, p.pilot, s, scenario, way, { nudge });
            const fw = PJ.newWatch(), f = fight(b3, p.pilot, s, scenario, way, { nudge, watch: fw });
            merge(caps[way], fw); if (fw.maxSpin >= CAPS.spin - AT_CAP) caps[way].atCap++; if (way === "BB") merge(watch, fw);
            return f;
        });
        const bb = OS.compare(flights.E, flights.BB), a3 = OS.compare(flights.E, flights.A3), chaos = OS.compare(flights.E, flights["E'"]);
        cells.push({ pilot: p.id, scenario, seeds: [...seeds], bb, a3, chaos, reading: OS.readingOf(bb), a3Reading: OS.readingOf(a3), chaosReading: OS.readingOf(chaos),
            tally: Object.fromEntries(WAYS.map((way) => [way, tallyOf(flights[way])])), moved: { BB: movedOf(flights, "BB"), A3: movedOf(flights, "A3"), "E'": movedOf(flights, "E'") }, caps, flights });
    }
    return { cells, watch };
}

// ---- the controls -------------------------------------------------------------------------------------------------------------
export const cUnchanged = (pilots) => SB3.cUnchanged(pilots);
/** C-stepB: stepB as rigidBody6dof.step() itself flies the plain duel to the bit, called once a tick; and it is first handed B's start. */
export function cStepB(seed = 93100, scenario = "joust", duelFn = P6.duel) {
    let calls = 0, first = null;
    const counting = (b, a, h) => { calls++; if (!first) first = b; return RB.step(b, a, h); };
    const plain = P6.duel("autopilot", "autopilot", { seed, scenario }), rec = {}, through = duelFn("autopilot", "autopilot", { seed, scenario, stepB: counting, record: rec });
    const isB = !!first && first.pos[0] > 0 && J(first.q) === J([0, 0, 1, 0]) && J(first) !== J(rec.start) && rec.start.pos[0] < 0;
    return { ok: J(plain) === J(through) && calls === plain.ticks && isB, calls, ticks: plain.ticks, isB };
}
/** C-replicates: sixdof-box3d's committed flights of the PD autopilot's joust at seed 93001, on E and with A on box3d, fly again to the bit. */
export function cReplicates(b3) {
    const file = JSON.parse(fs.readFileSync(SB3.DEFAULT_RESULTS, "utf8")), cell = file.m2.cells.find((c) => c.pilot === "scripted" && c.scenario === "joust"), s = cell.seeds[0];
    const e = fight(b3, "autopilot", s, "joust", "E"), a3 = fight(b3, "autopilot", s, "joust", "A3");
    const sameE = J(e) === J(cell.flights.E[0]), sameA3 = J(a3) === J(cell.flights.B3[0]);
    return { seed: s, ok: s === 93001 && sameE && sameA3, sameE, sameA3 };
}
/** C-caps: neither ship reached box3d's caps in any BB flight. */
export const cCaps = (watch) => ({ maxSpeed: watch.maxSpeed, maxSpin: watch.maxSpin, ticks: watch.ticks, ok: watch.ticks > 0 && watch.maxSpeed < CAPS.speed && watch.maxSpin < CAPS.spin });
/** C-chaos holds when no cell's nudge changes how its pilot fights by the sign test: every cell's p at or above ALPHA. */
export const chaosHolds = (cells, alpha = ALPHA) => cells.length > 0 && cells.every((c) => c.chaos.p >= alpha);
export function cDeterminism(b3, pilots, seed = FIGHT.seeds[0]) {
    const off = [];
    for (const p of pilots) for (const scenario of SCENARIOS) if (J(fight(b3, p.pilot, seed, scenario, "BB")) !== J(fight(b3, p.pilot, seed, scenario, "BB"))) off.push(`${p.id}/${scenario}`);
    return { flights: pilots.length * SCENARIOS.length * 2, ok: off.length === 0, off };
}

// ---- the run ------------------------------------------------------------------------------------------------------------------
/** Everything the registration names, in its order. The options let a gate fly a miniature on other seeds -- never the registered run. */
export async function run({ pilots = OS.loadPilots(), seeds = FIGHT.seeds, nudge = FIGHT.nudge } = {}) {
    const b3 = await SB3.box3dReady(), m = measure(b3, pilots, seeds, { nudge });
    const controls = { unchanged: cUnchanged(pilots), stepB: cStepB(), replicates: cReplicates(b3), box3d: SB3.cBox3d(b3), caps: cCaps(m.watch),
        chaos: { ok: chaosHolds(m.cells), cells: m.cells.map((c) => ({ pilot: c.pilot, scenario: c.scenario, p: c.chaos.p, changed: c.chaos.changed })) }, determinism: cDeterminism(b3, pilots, seeds[0]) };
    return {
        registration: REGISTRATION, pilots: pilots.map((p) => ({ id: p.id, hash: p.hash })), ways: [...WAYS], cells: m.cells, controls,
        readings: m.cells.map((c) => ({ pilot: c.pilot, scenario: c.scenario, reading: c.reading, better: c.bb.better, worse: c.bb.worse, p: c.bb.p })),
    };
}
export const serialize = SB.serialize;
export const refuseExisting = SB.refuseExisting;
