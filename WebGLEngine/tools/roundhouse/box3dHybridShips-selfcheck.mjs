// WebGLEngine/tools/roundhouse/box3dHybridShips-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node tools/roundhouse/box3dHybridShips-selfcheck.mjs      (about half a minute)
//
// THE GATE OF THE HYBRID ROUND, physics/mechanics/BOX3D_HYBRID_SHIPS_WIP.md (with its two corrections): ships on the engine's own step, their
// contacts on box3d. IT NEVER FLIES THE REGISTERED ROUND: not the seeds 85001-85100 and not the four registered scenes. It holds the
// registration as data, the duel's `contacts` hook, the hybrid's contact tick (physics/mechanics/shipContactBox3d.mjs), the scenes' machinery
// on scenes of its own, the controls' logic on hand-made cells, and run() on a miniature (seeds 86001-86004, its own scenes).
//
//   1  THE REGISTRATION AS DATA      seeds, ways, anchors, scenes, ticks, the engine's coefficients and the results path are the note's
//   2  THE DUEL'S HOOK               off unless given (C-unchanged, flown); handed the stepped ships, their states and accumulators at the tick's
//                                    start, dt and the tick, once a tick; what it returns is what the duel counts; the engine's own resolver
//                                    through it flies E to the bit
//   3  THE HYBRID'S CONTACT TICK     both ships, the coefficients set, no damping; a pair that overlaps is reported and one 0.1 m apart is not;
//                                    the impulse is the momentum moved, not box3d's report; the engine's damage rule; a world only on a contact tick
//   4  THE SCENES' MACHINERY         fifteen ticks under each model, on the gate's own scenes: the readings, C-scenes and C-momentum
//   5  THE CONTROLS' LOGIC           C-free, C-scenes and C-momentum shown failing on hand-made rows; C-chaos's line
//   6  THE MINIATURE                 run() itself: every control holds and everything the registration names is there, in its order
//   7  THE RESULTS FILE              written once; the command prints no reading
// SABOTAGE LOG -- THIRTY-ONE, AND TWO OF THEM AGAIN, 2026-11-04, each applied to the duel's hook, the contact tick, the library or the command through a byte-safe
// runner (one at a time, every file restored and its sha256 checked), the gate run whole (the number is how many rows went red):
//   G1 the duel never calls the resolver 5 | G2 the resolver is handed the states after the step, not before 1 | G3 the resolver is handed empty accumulators 1
//   G4 the resolver is always told tick 0 3 | G5 every contact tick counts as a new ram 4 | G6 box3d's restitution is 0 1 | G7 box3d's damping is left at 0.5 4
//   G8 the replay drops the tick's force 1 | G9 the replay drops the tick's torque 1 | G10 the replay starts each ship without its spin 1 | G11 the contact's impulse is box3d's report 1
//   G12 only the first ship takes the damage 2 | G13 the damage is not capped 1 | G14 every tick is flown on box3d, the engine's test skipped 3 | G16 the fight's seeds start at 85002 1
//   G17 the scenes are flown 10 ticks 2 | G18 S3's B back at x +1.65, as first written 1 | G19 the ram anchor says 21.466 3 | G20 H is flown on the engine's own contacts 1
//   G21 E' is flown without its nudge 1 | G22 C-free does not hold the hook's E to E 1 | G23 C-momentum's line under H is 1e-3 1
//   G24 C-scenes does not ask that the step bring the ships into contact 1 | G26 C-chaos's line excludes 0.01 1 | G27 run() flies no scene 2 | G28 the cells fly no E~ 1
//   G29 the readings are each cell's chaos reading 0 | G29' the readings are each cell's chaos reading 1 | G30 the command prints the readings 1
//   G31 the command does not refuse an existing file 1 | G32 the impulse leaves the thrust in 1 | G33 C-unchanged does not fly the ram anchor 0
//   G33' C-unchanged does not fly the ram anchor 1
// TWO WENT 0 RED THE FIRST TIME AND WERE GAPS IN THE GATE, both fixed and run again red (the primed ones). G29, the readings taken from the chaos control: on the
// miniature both read 'changes nothing', so no row could tell them apart; the readings are now their own function, readingsOf(), held on a hand-made cell whose
// two readings differ. G33, C-unchanged's ram anchor short-circuited: the control still passed, because nothing ever handed it a duel that should fail; it now
// takes the duel, and is shown failing on one whose ramming flight is a thousandth of a hit point off and on one whose jousts fly otherwise.
// G15 and G25 were drafted and dropped before the run: G15 (box3d's rows for both bodies, not the first) moves only a diagnostic count, and G25 (C-box3d's coast
// check made always true) only loosens a control that holds; both are equivalent at this level. Four gaps were closed before the first sabotage ran, seen in
// the gate's first draft: the replay's force and torque, a contact's impulse being the momentum moved, H moving joust flights in the miniature, and the
// readings mirroring the cells.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import * as L from "./box3dHybridShips.mjs";
import * as OS from "./orientationStep.mjs";
import * as SB3 from "./sixdofBox3d.mjs";
import * as PJ from "./box3dPdJoust.mjs";
import * as BB from "./box3dBothShips.mjs";
import * as HC from "../../physics/mechanics/shipContactBox3d.mjs";
import * as RB from "../../physics/mechanics/rigidBody6dof.mjs";
import * as RBC from "../../physics/mechanics/rigidBody6dofCollision.mjs";
import * as P6 from "../../brain/pilot6dofPolicy.mjs";
import * as SC from "../../brain/shipCollision6dof.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url)), ENG = path.resolve(HERE, "..", "..");
let fails = 0;
function ok(name, cond, detail) { console.log(`  ${cond ? "PASS" : "FAIL"}  ${name}${detail ? "   " + detail : ""}`); if (!cond) fails++; }
async function section(fn) { try { await fn(); } catch (e) { ok(`!! the section THREW instead of answering: ${e.message}`, false, String(e.stack).split("\n").slice(1, 3).join(" | ")); } }
const J = JSON.stringify, src = (f) => fs.readFileSync(path.join(ENG, f), "utf8"), NOTE = src(L.REGISTRATION);
/** The gate's own: seeds no round flies and scenes the registration does not name. */
const MINI = Object.freeze({ seeds: [86001, 86002, 86003, 86004], nudge: 1e-3 });
const MINI_SCENES = Object.freeze({
    M1: [{ pos: [-1.62, 0, 0], vel: [6, 0, 0], q: [1, 0, 0, 0], w: [0, 0, 0] }, { pos: [1.62, 0, 0], vel: [-6, 0, 0], q: [1, 0, 0, 0], w: [0, 0, 0] }],
    M2: [{ pos: [-1.7, 0, 0], vel: [4, 0, 0], q: [1, 0, 0, 0], w: [0, 1, 0] }, { pos: [1.66, -0.4, 0.2], vel: [-4, 0, 0], q: [1, 0, 0, 0], w: [0, 0, 0] }],
});
const I = RB.boxInertia({ m: P6.SHIP_MASS, hx: P6.HALF[0], hy: P6.HALF[1], hz: P6.HALF[2] }), bodyOf = (s) => RB.createBody({ mass: P6.SHIP_MASS, I, pos: s.pos, vel: s.vel, q: s.q, w: s.w });
const ZERO = () => RB.createAccumulator();
const b3 = await SB3.box3dReady();
const pilots = OS.loadPilots();

console.log("box3dHybridShips-selfcheck -- ships on the engine's own step, contacts on box3d: the round's parts, never its run\n");

console.log("1. THE REGISTRATION AS DATA");
await section(async () => {
    const P = await import("../ship/sixdofPageFight.mjs");
    const used = new Set([...P6.TRAIN_SEEDS, ...P6.HELD_OUT_SEEDS, ...P6.AUDIT_SEEDS, ...P6.LEAGUE_TRAIN_SEEDS, ...P6.LEAGUE_HELD_OUT_SEEDS, ...P6.LEAGUE_AUDIT_SEEDS, ...P6.CLOSE_TRAIN_SEEDS,
        ...P6.CLOSE_HELD_OUT_SEEDS, ...P6.CLOSE_AUDIT_SEEDS, ...P6.BASELINE_SEEDS, ...P.CONTROL_DUEL_SEEDS, ...OS.FIGHT.seeds, OS.ANCHOR.seed, ...SB3.FIGHT.seeds, ...SB3.TURN.seeds, SB3.ANCHOR.seed,
        ...PJ.FIGHT.seeds, ...BB.FIGHT.seeds, 92001, 92002, 92003, 94001, 94002, 94003, 94004, 97001, 97002, 97003, 97004, 97005, 97006, 98001, 98002, 98003, 98004]);
    const fresh = Array.from({ length: 100 }, (_, i) => 85001 + i);
    ok("!! the seeds are the registration's: 85001-85100 of each scenario, none flown by an earlier 6-DOF round or miniature, and the gate's own 86001-86004 none of them, nor the anchors' 86005 and 86010",
        J(L.FIGHT.seeds) === J(fresh) && fresh.every((s) => !used.has(s)) && MINI.seeds.every((s) => !fresh.includes(s) && !used.has(s) && s !== L.ANCHORS.seed && s !== L.ANCHORS.ram.seed) &&
        J(L.SCENARIOS) === J(["standoff", "joust"]) && /85001 to 85100/.test(NOTE), `${used.size} seeds kept by earlier rounds`);
    ok("!! the ways, the line and the pilots are the registration's: E, H and E', the nudge 1e-9 m, p < 0.01, and the five pilots on the page's Load Pilots panel -- the PD autopilot, and four held to their weights' hashes",
        J(L.WAYS) === J(["E", "H", "E'"]) && L.FIGHT.nudge === 1e-9 && L.ALPHA === 0.01 && J(pilots.map((p) => [p.id, p.hash])) === J([["scripted", null], ["shipped", "215e26d9"], ["league", "32789ff9"], ["close", "360580a7"], ["gpu", "0ffd8554"]]),
        J(pilots.map((p) => [p.id, p.hash])));
    const a = L.ANCHORS;
    ok("!! C-unchanged's anchors are the note's: ten at seed 86005, and the ramming one at 86010 (f314ba5f, one ram over 3 ticks for 21.465 hit points, 160 ticks)",
        a.seed === 86005 && Object.keys(a.flights).length === 10 && a.ram.seed === 86010 && a.ram.fingerprint === "f314ba5f" && a.ram.rams === 1 && a.ram.ramTicks === 3 && a.ram.ramHp === 21.465 && a.ram.ticks === 160 &&
        /seed 86005/.test(NOTE) && /seed 86010, which rams once over 3 ticks for 21\.465 hit/.test(NOTE) && /fingerprint f314ba5f, 160 ticks/.test(NOTE));
    const S = L.SCENES, row = (id) => (NOTE.match(new RegExp(`^\\| ${id} [^|]*\\|([^|]*)\\|([^|]*)\\|`, "m")) || []).slice(1).map((x) => x.trim());
    ok("!! the four scenes are the note's table -- S3's B at x +1.75, as corrected -- and are flown for 15 ticks, as the second correction says",
        J(S.S1) === J([{ pos: [-1.65, 0, 0], vel: [5, 0, 0], q: [1, 0, 0, 0], w: [0, 0, 0] }, { pos: [1.65, 0, 0], vel: [-5, 0, 0], q: [1, 0, 0, 0], w: [0, 0, 0] }]) &&
        J(S.S2[1].pos) === J([1.65, 0.5, 0]) && J(S.S3[1].pos) === J([1.75, 0.3, 0]) && Math.abs(2 * Math.acos(S.S3[1].q[0]) * 180 / Math.PI - 30) < 1e-9 && S.S3[1].q[3] > 0 &&
        J(S.S4[0].w) === J([0, 0, 3]) && J(S.S4[0].vel) === J([0, 0, 0]) && L.SCENE_TICKS === 15 &&
        /at x \+1\.75, 5 m\/s along -x, turned 30 degrees about z and 0\.3 m up in y/.test(row("S3")[1] || "") && /spinning 3 rad\/s about z/.test(row("S4")[0] || "") && /for 15 ticks/.test(NOTE));
    ok("!! the contact tick is the engine's coefficients and rule on box3d: restitution 0.35, friction 0.5, 0.3 hit points per unit of normal impulse at most 25, four substeps",
        HC.RESTITUTION === SC.RESTITUTION && HC.FRICTION === SC.FRICTION && HC.RAM.perImpulse === SC.RAM_DAMAGE_PER_IMPULSE && HC.RAM.cap === SC.RAM_DAMAGE_CAP && HC.SUBSTEPS === 4 && SC.RESTITUTION === 0.35 && SC.FRICTION === 0.5);
    ok("the results go where the note says", L.DEFAULT_RESULTS === path.join(ENG, "physics", "mechanics", "box3dHybridShipsResults.json") && NOTE.includes("physics/mechanics/box3dHybridShipsResults.json"));
});

console.log("\n2. THE DUEL'S HOOK");
await section(() => {
    const u = L.cUnchanged(pilots);
    ok("!! C-unchanged: given no resolver the duel is its anchors -- the ten flights at seed 86005 and the one that rams at 86010 -- to the bit", u.ok && u.flights === 11, J(u));
    ok("...and the duel takes `contacts` with a default that is off, used only where contact is resolved", /stepB = null, contacts = null \} = \{\}\) \{/.test(src("brain/pilot6dofPolicy.mjs")) &&
        /const events = contacts \? contacts\(\[A, B\], HALF, \{ start: tickStart, acc: tickAcc, dt, tick: t \}\) : SC\.resolveShipCollisions\(\[A, B\], HALF\)/.test(src("brain/pilot6dofPolicy.mjs")));
    let calls = 0, ticksSeen = [], startsTrue = true, dtSeen = new Set();
    const probe = (ships, half, ctx) => {
        calls++; ticksSeen.push(ctx.tick); dtSeen.add(ctx.dt);
        for (let k = 0; k < 2; k++) if (J(RB.step(ctx.start[k], ctx.acc[k], ctx.dt)) !== J(ships[k].body)) startsTrue = false;
        return SC.resolveShipCollisions(ships, half);
    };
    const r = P6.duel("autopilot", "autopilot", { seed: 86010, scenario: "joust", collisions: true, contacts: probe });
    ok("!! the resolver is called once a tick, the tick counting from 0, with dt 1/30, and handed each ship's state and accumulator at the tick's start: the engine's own step of them is the ship it is handed",
        calls === r.ticks && J(ticksSeen) === J(Array.from({ length: r.ticks }, (_, i) => i)) && dtSeen.size === 1 && dtSeen.has(1 / 30) && startsTrue, `${calls} calls in ${r.ticks} ticks`);
    let off = 0; P6.duel("autopilot", "autopilot", { seed: 86010, scenario: "joust", collisions: false, contacts: () => { off++; return []; } });
    ok("...never with collisions off", off === 0);
    ok("!! through the hook, the engine's own resolver flies E to the bit (the ram anchor: f314ba5f, one ram, 21.465)", r.fingerprint === L.ANCHORS.ram.fingerprint && r.rams === 1 && r.ramHp.toFixed(3) === "21.465");
    const fake = (ships, half, ctx) => (ctx.tick === 10 || ctx.tick === 11 ? [{ a: ships[0], b: ships[1], impulse: 1, dmg: 0.5 }] : []);
    const f = P6.duel("autopilot", "autopilot", { seed: 86001, scenario: "standoff", collisions: true, contacts: fake });
    ok("...and what a resolver returns is what the duel counts: a contact on two ticks running is one ram of two ticks, its damage summed", f.rams === 1 && f.ramTicks === 2 && f.ramHp === 1, `${f.rams} rams, ${f.ramTicks} ticks, ${f.ramHp} hp`);
});

console.log("\n3. THE HYBRID'S CONTACT TICK");
await section(() => {
    const free = [bodyOf({ pos: [-10, 0, 0], vel: [2, 0.5, 0], q: [1, 0, 0, 0], w: [0, 0.4, 0] }), bodyOf({ pos: [10, 0, 0], vel: [-1, 0, 0.25], q: [1, 0, 0, 0], w: [0.3, 0, 0] })];
    const coast = HC.flyPair(b3, P6.HALF, free, [ZERO(), ZERO()], 1 / 30);
    ok("!! the tick's world holds both ships with every coefficient set, and a pair apart coasts through it at its velocity (damping zero by its effect), touching nothing",
        coast.set && coast.points === 0 && coast.bodies.every((b, k) => Math.hypot(b.vel[0] - free[k].vel[0], b.vel[1] - free[k].vel[1], b.vel[2] - free[k].vel[2]) < 1e-6 &&
            Math.hypot(b.w[0] - free[k].w[0], b.w[1] - free[k].w[1], b.w[2] - free[k].w[2]) < 1e-5), J(coast.bodies.map((b) => [b.vel, b.w])));
    const push = [{ force: [16, -8, 4], torque: [0, 0, 0] }, { force: [0, 0, 0], torque: [0.5, 0, -0.25] }], still = [bodyOf({ pos: [-10, 0, 0], vel: [0, 0, 0], q: [1, 0, 0, 0], w: [0, 0, 0] }), bodyOf({ pos: [10, 0, 0], vel: [0, 0, 0], q: [1, 0, 0, 0], w: [0, 0, 0] })];
    // at the duel's 1/30 s, where box3d's gyroscopic coupling of the torque (second order in the step) is under 1e-7 rad/s
    const h = 1 / 30, pushed = HC.flyPair(b3, P6.HALF, still, push, h), dv = pushed.bodies[0].vel, dw = pushed.bodies[1].w;
    ok("!! ...and the tick's own force and torque are given in the replay, as the stepper gives them: a ship at rest gains F dt / m, a still ship I^-1 tau dt",
        Math.hypot(dv[0] - 16 * h / 8, dv[1] + 8 * h / 8, dv[2] - 4 * h / 8) < 1e-6 && Math.hypot(dw[0] - 0.5 * h / I[0], dw[1], dw[2] + 0.25 * h / I[2]) < 1e-6, `${J(dv)} ${J(dw)}`);
    const M1 = MINI_SCENES.M1.map(bodyOf), over = M1.map((b) => RB.step(b, ZERO(), 1 / 30));
    const apart = HC.flyPair(b3, P6.HALF, M1, [ZERO(), ZERO()], 1 / 30), hit = HC.flyPair(b3, P6.HALF, over, [ZERO(), ZERO()], 1 / 30);
    ok("!! THE SECOND CORRECTION'S FINDING, HELD: box3d reports a contact for a pair that overlaps at the tick's start, and none for one 0.04 m apart and closing, which it carries into each other",
        !RBC.checkContact(M1[0], P6.HALF, M1[1], P6.HALF).hit && apart.points === 0 && RBC.checkContact(apart.bodies[0], P6.HALF, apart.bodies[1], P6.HALF).hit && hit.points > 0 && !!hit.normal,
        `apart: ${apart.points} points; overlapping: ${hit.points} points, normal ${J(hit.normal)}`);
    const n = hit.normal, J0 = HC.contactImpulse(over[0], hit.bodies[0], ZERO(), 1 / 30, n);
    const hand = Math.abs((P6.SHIP_MASS * (hit.bodies[0].vel[0] - over[0].vel[0])) * n[0] + (P6.SHIP_MASS * (hit.bodies[0].vel[1] - over[0].vel[1])) * n[1] + (P6.SHIP_MASS * (hit.bodies[0].vel[2] - over[0].vel[2])) * n[2]);
    ok("!! the impulse is the momentum box3d's contact moved along its normal -- the hand sum -- and not box3d's own report, which is larger (it sums the solve and relax passes)",
        J0 > 0 && Math.abs(J0 - hand) <= 1e-9 * hand && hit.reportedImpulse > 1.2 * J0, `moved ${J0.toFixed(3)}, box3d reported ${hit.reportedImpulse.toFixed(3)}`);
    const thrust = { force: [16, 0, 0], torque: [0, 0, 0] }, start = bodyOf({ pos: [0, 0, 0], vel: [1, 0, 0], q: [1, 0, 0, 0], w: [0, 0, 0] }), after = { ...start, vel: [3, 0, 0] };
    ok("...and less the tick's thrust impulse, along the normal it is given (any length)", Math.abs(HC.contactImpulse(start, after, thrust, 0.5, [2, 0, 0]) - Math.abs(8 * 2 - 16 * 0.5)) < 1e-12);
    const worlds = { made: 0 }, counting = new Proxy(b3, { get(t, k) { return k === "createWorld" ? (...a) => { worlds.made++; return t.createWorld(...a); } : t[k]; } });
    const watch = [], res = HC.box3dContacts(counting, { watch });
    const shipsApart = free.map((body, k) => ({ id: k ? "B" : "A", body, hp: 100, dead: false })), none = res(shipsApart, P6.HALF, { start: free, acc: [ZERO(), ZERO()], dt: 1 / 30, tick: 0 });
    const madeApart = worlds.made;
    const ov = over.map((b) => RB.step(b, ZERO(), 1 / 30)), shipsHit = ov.map((body, k) => ({ id: k ? "B" : "A", body, hp: 100, dead: false }));
    const ev = res(shipsHit, P6.HALF, { start: over, acc: [ZERO(), ZERO()], dt: 1 / 30, tick: 7 });
    const want = Math.min(25, 0.3 * ev[0].impulse);
    const moved = HC.contactImpulse(over[0], shipsHit[0].body, ZERO(), 1 / 30, HC.flyPair(b3, P6.HALF, over, [ZERO(), ZERO()], 1 / 30).normal);
    ok("!! a world is made only on a contact tick; a contact's impulse is the momentum it moved; it takes the engine's rule -- 0.3 per unit, at most 25 -- from BOTH ships, and is watched",
        none.length === 0 && madeApart === 0 && worlds.made === 1 && ev.length === 1 && ev[0].impulse > 0 && Math.abs(ev[0].impulse - moved) <= 1e-9 * moved && ev[0].box3d.reportedImpulse > 1.2 * ev[0].impulse && Math.abs(ev[0].dmg - want) < 1e-12 && shipsHit.every((s) => Math.abs(s.hp - (100 - want)) < 1e-12) &&
        watch.length === 1 && watch[0].tick === 7 && watch[0].normalFrom === "box3d", `impulse ${ev[0] && ev[0].impulse.toFixed(3)}, damage ${ev[0] && ev[0].dmg.toFixed(3)}`);
    const big = HC.box3dContacts(b3, { ram: { perImpulse: 100, cap: 25 } }), shipsBig = ov.map((body, k) => ({ id: k ? "B" : "A", body, hp: 100, dead: false }));
    const evB = big(shipsBig, P6.HALF, { start: over, acc: [ZERO(), ZERO()], dt: 1 / 30, tick: 0 });
    const dead = ov.map((body, k) => ({ id: k ? "B" : "A", body, hp: 100, dead: k === 1 })), evD = HC.box3dContacts(b3)(dead, P6.HALF, { start: over, acc: [ZERO(), ZERO()], dt: 1 / 30, tick: 0 });
    ok("...the damage stops at the cap, and a dead ship is never touched", evB.length === 1 && evB[0].dmg === 25 && shipsBig.every((s) => s.hp === 75) && evD.length === 0);
    const wApart = [], resA = HC.box3dContacts(b3, { watch: wApart }), M1s = M1.map((body, k) => ({ id: k ? "B" : "A", body: RB.step(body, ZERO(), 1 / 30), hp: 100, dead: false }));
    const evA = resA(M1s, P6.HALF, { start: M1, acc: [ZERO(), ZERO()], dt: 1 / 30, tick: 0 });
    ok("...and where box3d reports no contact on a contact tick, the engine's normal is the one used, the momentum moved is zero, and so is the damage", evA.length === 1 && evA[0].impulse === 0 && evA[0].dmg === 0 && wApart[0].normalFrom === "engine" && wApart[0].points === 0);
});

console.log("\n4. THE SCENES' MACHINERY (the gate's own scenes)");
await section(() => {
    const rows = L.scenes(b3, MINI_SCENES), get = (id, way) => rows.find((r) => r.id === id && r.way === way);
    ok("!! each scene is flown fifteen ticks under each model and read against its start: momentum, angular momentum, energy, the relative normal speed, the impulse and damage over the ticks, the touching ticks, the deepest overlap, the tick they part",
        rows.length === 4 && rows.every((r) => r.ticks === 15 && Array.isArray(r.before.p) && Array.isArray(r.after.L) && typeof r.after.ke === "number" && typeof r.relNormalAfter === "number" &&
            r.firstTouch === 0 && r.touchingTicks >= 1 && r.apartAgain !== null && r.deepest > 0 && r.impulse > 0 && r.dmg > 0), J(rows.map((r) => [r.id, r.way, r.touchingTicks, +r.impulse.toFixed(2)])));
    const m1e = get("M1", "E"), m1h = get("M1", "H");
    ok("!! ...and under H box3d resolves the contact from overlap, a tick after the engine's test first finds it: longer in touch and deeper than under E, its relative normal speed reversed",
        m1h.touchingTicks > m1e.touchingTicks && m1h.deepest > m1e.deepest && m1h.relNormalAfter > 0 && m1e.relNormalAfter > 0, `touching ${m1e.touchingTicks} and ${m1h.touchingTicks} ticks, deepest ${m1e.deepest.toFixed(3)} and ${m1h.deepest.toFixed(3)} m`);
    const cs = L.cScenes(rows, 2), cm = L.cMomentum(rows);
    ok("C-scenes and C-momentum hold on them: apart at the start, touching after one step, the pair's momentum kept through fifteen ticks", cs.ok && cm.ok, J(cm.rows));
});

console.log("\n5. THE CONTROLS' LOGIC (hand-made)");
await section(() => {
    const fl = (fp, first, rams = 0) => ({ fingerprint: fp, firstContact: first, rams, ramHp: 0 });
    const cell = (E, Et, H) => ({ flights: { E, "E~": Et, H } });
    const good = L.cFree([cell([fl("a", null), fl("b", 5, 1)], [fl("a", null), fl("b", 5, 1)], [fl("a", null), fl("c", 5, 1)])]);
    const moved = L.cFree([cell([fl("a", null)], [fl("a", null)], [fl("z", null)])]), late = L.cFree([cell([fl("b", 5, 1)], [fl("b", 5, 1)], [fl("c", 6, 1)])]), hook = L.cFree([cell([fl("a", null)], [fl("x", null)], [fl("a", null)])]);
    ok("!! C-free holds when a flight with no contact is E's under H and a first contact tick is the same; it fails if a no-contact flight moves, if the first contact tick differs, or if the hook's E is not E",
        good.ok && !moved.ok && !late.ok && !hook.ok, J([good.ok, moved.ok, late.ok, hook.ok]));
    const r = (way, before, after) => ({ id: "X", way, touchingAtStart: false, touchingAfterStep: true, before: { p: before }, after: { p: after } });
    // relative to the larger of the pair's momentum and one ship's at 5 m/s (40): a head-on pair's momentum is zero
    ok("C-momentum's lines are 1e-9 under E and 1e-5 under H, relative (to the pair's momentum or one ship's at 5 m/s, the larger)", L.cMomentum([r("E", [40, 0, 0], [40 + 2e-8, 0, 0])]).ok && !L.cMomentum([r("E", [40, 0, 0], [40 + 4e-7, 0, 0])]).ok &&
        L.cMomentum([r("E", [0, 0, 0], [2e-8, 0, 0])]).ok && !L.cMomentum([r("E", [0, 0, 0], [4e-7, 0, 0])]).ok &&
        L.cMomentum([r("H", [40, 0, 0], [40 + 3e-4, 0, 0])]).ok && !L.cMomentum([r("H", [40, 0, 0], [40 + 3e-3, 0, 0])]).ok);
    ok("C-scenes fails on a scene that starts touching, or one the step does not bring into contact", !L.cScenes([{ ...r("E"), touchingAtStart: true }, r("H")], 1).ok && !L.cScenes([{ ...r("E"), touchingAfterStep: false }, r("H")], 1).ok && L.cScenes([r("E"), r("H")], 1).ok);
    const rc = [{ pilot: "x", scenario: "joust", reading: "changes how that pilot fights (worse)", chaosReading: "changes nothing a sign test can see", h: { better: 1, worse: 12, p: 0.003 }, chaos: { better: 0, worse: 0, p: 1 } }];
    ok("!! the round's readings are each cell's H against E, never its chaos control", J(L.readingsOf(rc)) === J([{ pilot: "x", scenario: "joust", reading: "changes how that pilot fights (worse)", better: 1, worse: 12, p: 0.003 }]));
    const perturb = (when) => (a, b, o) => { const r = P6.duel(a, b, o); return when(o) ? { ...r, ramHp: r.ramHp + 1e-3, fingerprint: r.fingerprint } : r; };
    const bent = (a, b, o) => { const r = P6.duel(a, b, o); return o.seed === L.ANCHORS.seed && o.scenario === "joust" && a !== "autopilot" ? { ...r, fingerprint: "00000000" } : r; };
    const uRam = L.cUnchanged(pilots, perturb((o) => o.seed === L.ANCHORS.ram.seed)), uBent = L.cUnchanged(pilots, bent);
    ok("!! C-unchanged fails on a duel that is not the anchors: one whose ramming flight takes another thousandth of a hit point, and one whose seed-86005 jousts fly otherwise",
        !uRam.ok && !uRam.ram && uRam.off.length === 0 && !uBent.ok && uBent.ram && uBent.off.length === 4, J({ ram: uRam.ram, off: uBent.off }));
    ok("C-chaos holds when every cell's p is at or above 0.01", L.chaosHolds([{ chaos: { p: 0.01 } }, { chaos: { p: 1 } }]) && !L.chaosHolds([{ chaos: { p: 0.0099 } }]) && !L.chaosHolds([]));
});

console.log("\n6. THE MINIATURE");
await section(async () => {
    const res = await L.run({ pilots, seeds: MINI.seeds, nudge: MINI.nudge, sceneSet: MINI_SCENES }), back = JSON.parse(L.serialize(res));
    ok("!! run() holds everything the registration names, in its order: the registration, the five pilots by hash, the ways, the ten cells, the scenes, the controls and the readings",
        J(Object.keys(back)) === J(["registration", "pilots", "ways", "cells", "scenes", "controls", "readings"]) && back.registration === L.REGISTRATION && back.pilots.length === 5 && back.cells.length === 10 &&
        back.scenes.length === 4 && back.readings.length === 10 && J(Object.keys(back.controls)) === J(["unchanged", "free", "box3d", "scenes", "momentum", "chaos", "determinism"]));
    const failed = Object.entries(back.controls).filter(([, v]) => !v.ok).map(([k]) => k);
    ok("!! ...and every control holds on it -- C-unchanged with the five pilots, C-free over its 40 flights, C-box3d, C-scenes, C-momentum, C-chaos at a 1e-3 m nudge, C-determinism", failed.length === 0, failed.length ? `FAILED: ${failed.join(", ")}` : `${back.controls.free.flights} flights, ${back.controls.free.withContact} with a contact`);
    const joust = back.cells.filter((c) => c.scenario === "joust"), stand = back.cells.filter((c) => c.scenario === "standoff");
    ok("...each cell carries its tallies, its ram readings under E and H, the flights H moves and its contact ticks; the standoff's have no contact and move nothing",
        back.cells.every((c) => c.tally.E && c.tally.H && c.ram.E && c.ram.H && typeof c.moved.H === "number" && typeof c.contact.hContactTicks === "number") &&
        stand.every((c) => c.moved.H === 0 && c.contact.flightsWithContact === 0) && joust.some((c) => c.contact.flightsWithContact > 0));
    ok("!! ...and H is box3d's: it moves joust flights, on ticks where box3d reported the contact; the 1e-3 m nudge moves some flights too; and the readings are each cell's H against E",
        joust.some((c) => c.moved.H > 0) && joust.some((c) => c.contact.hBox3dReported > 0) && back.cells.some((c) => c.moved["E'"] > 0) &&
        back.readings.every((r, i) => r.pilot === back.cells[i].pilot && r.scenario === back.cells[i].scenario && r.reading === back.cells[i].reading && r.better === back.cells[i].h.better && r.worse === back.cells[i].h.worse && r.p === back.cells[i].h.p),
        J(joust.map((c) => [c.pilot, c.moved.H, c.contact.hBox3dReported, c.moved["E'"]])));
});

console.log("\n7. THE RESULTS FILE");
await section(() => {
    ok("a results file is written once", /never overwritten/.test(L.refuseExisting(L.DEFAULT_RESULTS, () => true) || "") && L.refuseExisting("/no/such/file.json") === null);
    const cmd = src("tools/roundhouse/box3dHybridShipsRun.mjs"), logs = cmd.split("\n").filter((l) => /console\.(log|error)/.test(l));
    ok("!! the command prints where it wrote and nothing it read: no reading, no cell, no scene", logs.length === 3 && logs.every((l) => !/result\.|readings|cells|scenes|controls/.test(l)) && /refuseExisting\(results\)/.test(cmd) && /await run\(\)/.test(cmd));
    let refusedUnknown = false; try { execFileSync(process.execPath, [path.join(HERE, "box3dHybridShipsRun.mjs"), "--nope"], { cwd: ENG, stdio: "pipe" }); } catch (e) { refusedUnknown = e.status === 2 && /unknown option/.test(String(e.stderr)); }
    ok("...and refuses an option it does not know, before running anything", refusedUnknown);
});

console.log(`\nbox3dHybridShips-selfcheck: ${fails === 0 ? "all checks pass" : fails + " FAILED"}`);
process.exit(fails === 0 ? 0 : 1);
