// WebGLEngine/tools/roundhouse/box3dHybridShips.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// SHIPS ON THE ENGINE'S OWN STEP, CONTACTS ON box3d, as physics/mechanics/BOX3D_HYBRID_SHIPS_WIP.md registers the round (with its correction,
// committed before any code: a contact tick's impulse is the momentum box3d's contact moved). The library: the registration as data, the
// three ways of flying a duel (E, H, E'), the cells, the four scenes, the controls and the readings. The outcome, the comparison, the sign
// test and the reading are the orientation round's own (tools/roundhouse/orientationStep.mjs); box3d is sixdof-box3d's; the hybrid's contact
// tick is physics/mechanics/shipContactBox3d.mjs. The command is box3dHybridShipsRun.mjs and prints no score; the gate is
// box3dHybridShips-selfcheck.mjs.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as RB from "../../physics/mechanics/rigidBody6dof.mjs";
import * as RBC from "../../physics/mechanics/rigidBody6dofCollision.mjs";
import * as HC from "../../physics/mechanics/shipContactBox3d.mjs";
import * as P6 from "../../brain/pilot6dofPolicy.mjs";
import * as SC from "../../brain/shipCollision6dof.mjs";
import * as OS from "./orientationStep.mjs";
import * as SB3 from "./sixdofBox3d.mjs";
import * as SB from "./spinningBody.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url)), ENG = path.resolve(HERE, "..", "..");
const range = (a, n) => Object.freeze(Array.from({ length: n }, (_, i) => a + i)), J = JSON.stringify;
export const REGISTRATION = "physics/mechanics/BOX3D_HYBRID_SHIPS_WIP.md";
export const DEFAULT_RESULTS = path.join(ENG, "physics", "mechanics", "box3dHybridShipsResults.json");
export const SCENARIOS = OS.SCENARIOS, DUEL_DT = 1 / 30;
/** 100 fresh seeds of each scenario; E' moves A's start 1e-9 m in y. */
export const FIGHT = Object.freeze({ seeds: range(85001, 100), nudge: 1e-9 });
export const WAYS = Object.freeze(["E", "H", "E'"]);
export const ALPHA = 0.01;
/**
 * C-unchanged's anchors, recorded from the unchanged duel() at ffa3623d (the registration's commit), collisions on, under the default
 * orientation step: [fingerprint, rams, ticks] for the ten pilot and scenario pairs at seed 86005, and one more that rams.
 */
export const ANCHORS = Object.freeze({
    seed: 86005,
    flights: Object.freeze({ "scripted/standoff": ["e7deecfa", 0, 183], "scripted/joust": ["a2d76669", 0, 344], "shipped/standoff": ["c3daff30", 0, 164], "shipped/joust": ["a79c4d3a", 0, 317],
        "league/standoff": ["76b44095", 0, 164], "league/joust": ["ba907dc8", 0, 327], "close/standoff": ["88ee41c2", 0, 164], "close/joust": ["49e127f5", 0, 894],
        "gpu/standoff": ["7a7a2069", 0, 183], "gpu/joust": ["3cb94a1b", 0, 335] }),
    ram: Object.freeze({ seed: 86010, scenario: "joust", fingerprint: "f314ba5f", rams: 1, ramTicks: 3, ramHp: 21.465, ticks: 160 }),
});
/** The four scenes: [A, B], each { pos, vel, q, w } (q as [qw, qx, qy, qz], w body-frame), a tick from touching. */
const turnZ = (deg) => { const h = (deg * Math.PI) / 360; return [Math.cos(h), 0, 0, Math.sin(h)]; };
export const SCENES = Object.freeze({
    S1: [{ pos: [-1.65, 0, 0], vel: [5, 0, 0], q: [1, 0, 0, 0], w: [0, 0, 0] }, { pos: [1.65, 0, 0], vel: [-5, 0, 0], q: [1, 0, 0, 0], w: [0, 0, 0] }],
    S2: [{ pos: [-1.65, 0, 0], vel: [5, 0, 0], q: [1, 0, 0, 0], w: [0, 0, 0] }, { pos: [1.65, 0.5, 0], vel: [-5, 0, 0], q: [1, 0, 0, 0], w: [0, 0, 0] }],
    S3: [{ pos: [-1.65, 0, 0], vel: [5, 0, 0], q: [1, 0, 0, 0], w: [0, 0, 0] }, { pos: [1.75, 0.3, 0], vel: [-5, 0, 0], q: turnZ(30), w: [0, 0, 0] }],
    S4: [{ pos: [-1.65, 0, 0], vel: [0, 0, 0], q: [1, 0, 0, 0], w: [0, 0, 3] }, { pos: [1.65, 0, 0], vel: [-5, 0, 0], q: [1, 0, 0, 0], w: [0, 0, 0] }],
});

// ---- a fight ------------------------------------------------------------------------------------------------------------------
/** The engine's own resolver through duel()'s hook, watched: resolveShipCollisions itself, with the ticks it touched noted. */
export function engineContacts(watch = null) {
    return (ships, half, ctx) => { const ev = SC.resolveShipCollisions(ships, half); if (watch && ev.length) for (const e of ev) watch.push({ tick: ctx.tick, impulse: e.impulse, dmg: e.dmg }); return ev; };
}
const read = (r, watch) => ({ outcome: OS.outcomeOf(r), fingerprint: r.fingerprint, ticks: r.ticks, rams: r.rams, ramTicks: r.ramTicks, ramHp: r.ramHp,
    firstContact: watch && watch.length ? watch[0].tick : null, contactTicks: watch ? new Set(watch.map((w) => w.tick)).size : null });
/** One duel of `pilot` as A against the PD autopilot as B, collisions on, flown `way`. "E~" is E through the hook (for its contact ticks). */
export function fight(b3, pilot, seed, scenario, way, { nudge = FIGHT.nudge, watch = null } = {}) {
    const o = { seed, scenario, collisions: true };
    if (way === "E") return read(P6.duel(pilot, "autopilot", o), null);
    if (way === "E'") return read(P6.duel(pilot, "autopilot", { ...o, nudge }), null);
    if (way === "E~") { const w = watch || []; return read(P6.duel(pilot, "autopilot", { ...o, contacts: engineContacts(w) }), w); }
    if (way === "H") { const w = watch || []; return read(P6.duel(pilot, "autopilot", { ...o, contacts: HC.box3dContacts(b3, { watch: w }) }), w); }
    throw new Error(`box3dHybridShips: no such way ${J(way)}`);
}
const tallyOf = (rs) => ({ win: rs.filter((r) => r.outcome === "win").length, loss: rs.filter((r) => r.outcome === "loss").length, draw: rs.filter((r) => r.outcome === "draw").length });
const ramOf = (rs) => ({ duelsWithRam: rs.filter((r) => r.rams > 0).length, rams: rs.reduce((s, r) => s + r.rams, 0), ramTicks: rs.reduce((s, r) => s + r.ramTicks, 0), ramHp: rs.reduce((s, r) => s + r.ramHp, 0) });

// ---- the cells ----------------------------------------------------------------------------------------------------------------
export function measure(b3, pilots, seeds = FIGHT.seeds, { nudge = FIGHT.nudge } = {}) {
    const cells = [];
    for (const p of pilots) for (const scenario of SCENARIOS) {
        const flights = {}, hWatch = [];
        for (const way of [...WAYS, "E~"]) flights[way] = seeds.map((s) => {
            if (way !== "H") return fight(b3, p.pilot, s, scenario, way, { nudge });
            const w = []; const f = fight(b3, p.pilot, s, scenario, way, { nudge, watch: w }); hWatch.push(...w); return f;
        });
        const h = OS.compare(flights.E, flights.H), chaos = OS.compare(flights.E, flights["E'"]);
        cells.push({ pilot: p.id, scenario, seeds: [...seeds], h, chaos, reading: OS.readingOf(h), chaosReading: OS.readingOf(chaos),
            tally: Object.fromEntries(WAYS.map((way) => [way, tallyOf(flights[way])])), ram: { E: ramOf(flights.E), H: ramOf(flights.H) },
            moved: { H: flights.H.filter((f, i) => f.fingerprint !== flights.E[i].fingerprint).length, "E'": flights["E'"].filter((f, i) => f.fingerprint !== flights.E[i].fingerprint).length },
            contact: { flightsWithContact: flights["E~"].filter((f) => f.firstContact !== null).length, hContactTicks: hWatch.length, hBox3dReported: hWatch.filter((w) => w.points > 0).length },
            flights });
    }
    return { cells };
}

// ---- the scenes ---------------------------------------------------------------------------------------------------------------
const I = RB.boxInertia({ m: P6.SHIP_MASS, hx: P6.HALF[0], hy: P6.HALF[1], hz: P6.HALF[2] });
const bodyOf = (s) => RB.createBody({ mass: P6.SHIP_MASS, I, pos: s.pos, vel: s.vel, q: s.q, w: s.w });
const sub = (a, b) => a.map((x, i) => x - b[i]), add = (a, b) => a.map((x, i) => x + b[i]), dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
/** The pair's linear momentum, angular momentum about its centre of mass, and kinetic energy. */
export function pairState([a, b]) {
    const m = a.mass + b.mass, c = a.pos.map((x, i) => (a.mass * x + b.mass * b.pos[i]) / m);
    const spin = (x) => RB.rotateByQuat(x.q, [x.I[0] * x.w[0], x.I[1] * x.w[1], x.I[2] * x.w[2]]);
    const p = add(a.vel.map((v) => v * a.mass), b.vel.map((v) => v * b.mass));
    const L = [a, b].reduce((s, x) => add(s, add(cross(sub(x.pos, c), x.vel.map((v) => v * x.mass)), spin(x))), [0, 0, 0]);
    const ke = [a, b].reduce((s, x) => s + 0.5 * x.mass * dot(x.vel, x.vel) + 0.5 * (x.I[0] * x.w[0] ** 2 + x.I[1] * x.w[1] ** 2 + x.I[2] * x.w[2] ** 2), 0);
    return { p, L, ke };
}
const ZERO = () => RB.createAccumulator();
/** The scenes are flown this many ticks (0.5 s), with no force or torque (the registration's second correction: one tick cannot show box3d's contact). */
export const SCENE_TICKS = 15;
/**
 * One scene under `way`, tick by tick: E steps both ships with rigidBody6dof.step() and resolves with the engine's model; H steps them the same
 * way and flies each contact tick on box3d. Read after SCENE_TICKS ticks, against the start.
 */
export function scene(b3, id, way, ticks = SCENE_TICKS, set = SCENES) {
    const start = set[id].map(bodyOf), dt = DUEL_DT, half = P6.HALF, hResolve = way === "H" ? HC.box3dContacts(b3) : null;
    const touchingAtStart = RBC.checkContact(start[0], half, start[1], half).hit;
    const ships = start.map((body, k) => ({ id: k ? "B" : "A", body, hp: 100, dead: false }));
    let impulse = 0, dmg = 0, touchingTicks = 0, firstTouch = null, apartAgain = null, deepest = 0, normal = null, touchingAfterStep = null;
    for (let t = 0; t < ticks; t++) {
        const tickStart = ships.map((x) => x.body);
        for (const x of ships) x.body = RB.step(x.body, ZERO(), dt);
        const c = RBC.checkContact(ships[0].body, half, ships[1].body, half), touching = !!(c.hit && c.normal);
        if (t === 0) touchingAfterStep = touching;
        if (touching) { deepest = Math.max(deepest, c.depth); if (!normal) normal = [...c.normal]; }
        const ev = way === "E" ? SC.resolveShipCollisions(ships, half) : hResolve(ships, half, { start: tickStart, acc: [ZERO(), ZERO()], dt, tick: t });
        if (ev.length) { touchingTicks++; if (firstTouch === null) firstTouch = t; for (const e of ev) { impulse += e.impulse; dmg += e.dmg; } }
        else if (firstTouch !== null && apartAgain === null) apartAgain = t;
    }
    const n = normal || [1, 0, 0], relN = (bs) => dot(sub(bs[1].vel, bs[0].vel), n);
    return { id, way, ticks, touchingAtStart, touchingAfterStep, normal: n, before: pairState(start), after: pairState(ships.map((x) => x.body)),
        relNormalBefore: relN(start), relNormalAfter: relN(ships.map((x) => x.body)), impulse, dmg, touchingTicks, firstTouch, apartAgain, deepest, hp: ships.map((x) => x.hp) };
}
export const scenes = (b3, set = SCENES) => Object.keys(set).flatMap((id) => ["E", "H"].map((way) => scene(b3, id, way, SCENE_TICKS, set)));

// ---- the controls -------------------------------------------------------------------------------------------------------------
/** C-unchanged: given no contact resolver, the duel is the anchors, flight for flight. `duelFn` is the duel (a gate hands it one that is not). */
export function cUnchanged(pilots, duelFn = P6.duel) {
    const off = [];
    for (const p of pilots) for (const scenario of SCENARIOS) { const r = duelFn(p.pilot, "autopilot", { seed: ANCHORS.seed, scenario, collisions: true }); if (J([r.fingerprint, r.rams, r.ticks]) !== J(ANCHORS.flights[`${p.id}/${scenario}`])) off.push(`${p.id}/${scenario}`); }
    const a = ANCHORS.ram, r = duelFn("autopilot", "autopilot", { seed: a.seed, scenario: a.scenario, collisions: true });
    const ram = r.fingerprint === a.fingerprint && r.rams === a.rams && r.ramTicks === a.ramTicks && r.ramHp.toFixed(3) === a.ramHp.toFixed(3) && r.ticks === a.ticks;
    return { ok: off.length === 0 && ram && pilots.length === 5, off, ram, flights: pilots.length * SCENARIOS.length + 1 };
}
/** C-free (and E~ is E): through the hook, the engine's own resolver flies E to the bit; a flight with no contact tick is E under H; a first contact tick is the same under E and H. */
export function cFree(cells) {
    let hookSame = 0, noContact = 0, noContactSame = 0, firstSame = 0, withContact = 0;
    for (const c of cells) c.flights.E.forEach((e, i) => {
        const t = c.flights["E~"][i], h = c.flights.H[i];
        if (t.fingerprint === e.fingerprint && t.rams === e.rams && t.ramHp === e.ramHp) hookSame++;
        if (t.firstContact === null) { noContact++; if (h.fingerprint === e.fingerprint && h.firstContact === null) noContactSame++; }
        else { withContact++; if (h.firstContact === t.firstContact) firstSame++; }
    });
    const n = cells.reduce((s, c) => s + c.flights.E.length, 0);
    return { ok: n > 0 && hookSame === n && noContactSame === noContact && firstSame === withContact, flights: n, hookSame, noContact, noContactSame, withContact, firstSame };
}
/** C-box3d: a contact tick's world holds both ships with the coefficients set and the damping zero by its effect, and box3d reports the contact. */
export function cBox3d(b3) {
    const free = [bodyOf({ pos: [-10, 0, 0], vel: [2, 0.5, 0], q: [1, 0, 0, 0], w: [0, 0.4, 0] }), bodyOf({ pos: [10, 0, 0], vel: [-1, 0, 0.25], q: [1, 0, 0, 0], w: [0.3, 0, 0] })];
    const coast = HC.flyPair(b3, P6.HALF, free, [ZERO(), ZERO()], DUEL_DT), keeps = coast.bodies.every((b, k) => Math.hypot(...sub(b.vel, free[k].vel)) < 1e-6);
    // the report is asked of a pair that already overlaps at the tick's start -- S1 one engine step on (the second correction: box3d sees a
    // contact only within 0.02 m of touching at its step's start, so S1 itself, 0.1 m apart, is resolved a tick later)
    const overlapping = SCENES.S1.map(bodyOf).map((b) => RB.step(b, ZERO(), DUEL_DT)), hit = HC.flyPair(b3, P6.HALF, overlapping, [ZERO(), ZERO()], DUEL_DT);
    return { ok: coast.set && keeps && coast.points === 0 && hit.set && hit.points > 0 && !!hit.normal, coastKeepsVelocity: keeps, coastPoints: coast.points, hitPoints: hit.points, hitNormal: hit.normal };
}
/** C-scenes: every scene starts apart and the engine's test finds it touching after one step. */
export const cScenes = (sceneRows, n = Object.keys(SCENES).length) => ({ ok: sceneRows.length === 2 * n && sceneRows.every((s) => !s.touchingAtStart && s.touchingAfterStep), rows: sceneRows.map((s) => `${s.id}/${s.way}`) });
/** C-momentum: the pair's linear momentum through each scene's tick, to 1e-9 relative under E and 1e-5 under H. */
export function cMomentum(sceneRows) {
    const rel = (s) => Math.hypot(...sub(s.after.p, s.before.p)) / Math.max(1e-12, Math.hypot(...s.before.p), P6.SHIP_MASS * 5);
    const rows = sceneRows.map((s) => ({ id: s.id, way: s.way, rel: rel(s) }));
    return { ok: rows.every((r) => r.rel <= (r.way === "E" ? 1e-9 : 1e-5)), rows };
}
export const chaosHolds = (cells, alpha = ALPHA) => cells.length > 0 && cells.every((c) => c.chaos.p >= alpha);
export function cDeterminism(b3, pilots, seed = FIGHT.seeds[0]) {
    const off = pilots.filter((p) => J(fight(b3, p.pilot, seed, "joust", "H")) !== J(fight(b3, p.pilot, seed, "joust", "H"))).map((p) => p.id);
    return { flights: pilots.length * 2, ok: off.length === 0, off };
}

// ---- the run ------------------------------------------------------------------------------------------------------------------
/** Everything the registration names, in its order. The options let a gate fly a miniature on other seeds and scenes of its own -- never the registered run. */
export async function run({ pilots = OS.loadPilots(), seeds = FIGHT.seeds, nudge = FIGHT.nudge, sceneSet = SCENES } = {}) {
    const b3 = await SB3.box3dReady(), m = measure(b3, pilots, seeds, { nudge }), sceneRows = scenes(b3, sceneSet);
    const controls = { unchanged: cUnchanged(pilots), free: cFree(m.cells), box3d: cBox3d(b3), scenes: cScenes(sceneRows, Object.keys(sceneSet).length), momentum: cMomentum(sceneRows),
        chaos: { ok: chaosHolds(m.cells), cells: m.cells.map((c) => ({ pilot: c.pilot, scenario: c.scenario, p: c.chaos.p, changed: c.chaos.changed })) }, determinism: cDeterminism(b3, pilots, seeds[0]) };
    return {
        registration: REGISTRATION, pilots: pilots.map((p) => ({ id: p.id, hash: p.hash })), ways: [...WAYS], cells: m.cells, scenes: sceneRows, controls,
        readings: readingsOf(m.cells),
    };
}
/** The round's readings: each cell's H against E (not its chaos control). */
export const readingsOf = (cells) => cells.map((c) => ({ pilot: c.pilot, scenario: c.scenario, reading: c.reading, better: c.h.better, worse: c.h.worse, p: c.h.p }));
export const serialize = SB.serialize;
export const refuseExisting = SB.refuseExisting;
