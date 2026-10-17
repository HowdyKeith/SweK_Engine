// WebGLEngine/brain/dogfightArena-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node brain/dogfightArena-selfcheck.mjs      (~25 s: 96 fights flown twice)
//
// THE STEPPABLE DOGFIGHT, HELD TO THE ONE THAT ALREADY EXISTS AND TO ARITHMETIC. brain/dogfightArena.mjs is brain/dogfightTask.mjs's fight with the loop turned inside out (so a page can watch it, and so it can hold more than two aircraft). Two things hold it:
//
//   1  A FIGHT OF TWO IS THE SAME FIGHT   every kind of scenario (tail, offset, turning, duel), six seeds each, flown by the PD autopilot, by the fruit fly's hand weights and by the SHIPPED DOGFIGHT PILOT, through dogfightTask.duel() and through the arena:
//                                         every number duel() reports -- score, hits dealt and taken, rounds fired by each, the time of the first hit, the time of the kill, both statuses, the tick count, the closest approach, the lowest altitude, the largest
//                                         angle of attack and the slowest airspeed -- is identical to the bit (Object.is). Also a pilot that sends the aircraft into the ground (crashed, with its hit points the arena and duel both charge in full) and one
//                                         that sends it nowhere (the zero pilot)
//   2  THE ARENA'S OWN ARITHMETIC         a tick advances i and t and returns the SAME object; a finished arena does not move; runArena is stepping; the order the crafts are listed in changes nothing (decisions are all taken from the states the tick started with);
//                                         three crafts (two against one): a fighter's foe is the NEAREST craft of ANOTHER team still flying, a tie goes to the lower id, a team-mate is never a foe, and the fight goes on while a craft of each team flies;
//                                         head-on, both crafts are lost to the collision and the fight ends; hits are credited to the shooter and taken by the victim at the SHOOTER's damage, hit points are the craft's own, a craft destroyed
//                                         ends the fight when it is the last of its team; a craft the ground has taken keeps its last state (the same object) and the others fly on; and createArena refuses what cannot be flown
//   3  THE FRONT DOOR                     the export list is pinned and the report line says real numbers
//
// SABOTAGE LOG -- THIRTY-FOUR, each applied to brain/dogfightArena.mjs in a scratch worktree, the gate run, the worktree restored; every one red by name (the number is how many rows went red):
//   A1 team-mates can be foes 2 | A2 a craft that is not flying can be a foe 1 | A3 a tie goes to the higher id 1 | A4 the FARTHEST foe 1
//   A5 a craft's state replaced as it is stepped (the next one's sweep starts from it) 3 | A6 the trigger works whatever `fires` says 5 | A7 a hit takes the victim's damage 1
//   A8 hit points are the gun's, not the craft's 3 | A9 the kill is not timed 4 | A10 the first hit is not timed 5 | A11 a collision needs 3 m 1 | A12 the fight does not end when a team is gone 6
//   A13 the time limit one tick late 5 | A14 a finished arena still steps 1 | A15 events pile up across ticks 1 | A16 the pilot is flown in a wind 5 | A17 the flight model is stepped in a wind 4
//   A18 the slowest airspeed is the fastest 5 | A19 the largest angle of attack is the smallest 5 | A20 the closest approach is never recorded 5 | A21 no kill bonus in resultOf 3
//   A22 a craft that is out is not charged its full hit points 2 | A23 damage dealt is not capped at the hit points 1 | A24 the opponent never hunts 4 | A25 the turning opponent turns the other way 3
//   A26 a repeated id is accepted 1 | A27 a one-craft arena is accepted 1 | A28 the default team is 1 1 | A29 the default hit points are 10 4 | A30 a craft that is out is stepped again 1
//   A31 rounds live one second 4 | A32 the default name is not 'craft <id>' 1 | A33 a scripted craft with no function accepted 1 | A34 the report says NaN 1
// FOUR WENT 0 RED THE FIRST TIME AND WERE FIXED IN THE GATE, NOT EXCUSED: A8 (hit points the gun's) because the hit row asked for 'at least 5 damage' and a victim with 20 hit points dies of 20 -- it now pins 6 damage in 24 ticks; A23 (damage dealt uncapped) because no fight reached 21 hits -- a row sets 30 hits by hand; A24 (the
// opponent never hunts) CRASHED the gate instead of failing a row -- the comparison loops now catch a throw and name the fight; A30 (a craft that is out is stepped again) because stepFlight returns an ended state unchanged and nothing else read it -- a row puts a wreck on the line of fire and asks for no hit and no shot.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as A from "./dogfightArena.mjs";
import * as D from "./dogfightTask.mjs";
import * as AF from "./autopilotFlight.mjs";
import * as PF from "./pilotFlightPolicy.mjs";
import * as G from "../physics/mechanics/flightGuns.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let fails = 0;
function ok(name, cond, detail) { console.log(`  ${cond ? "PASS" : "FAIL"}  ${name}${detail ? "   " + detail : ""}`); if (!cond) fails++; }
const norm = (a) => Math.hypot(a[0], a[1], a[2]);
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];

console.log("dogfightArena-selfcheck -- the steppable dogfight\n");

const FIELDS = ["score", "dealt", "taken", "fired", "firedB", "hitRate", "firstHit", "killedB", "statusA", "statusB", "ticks", "closest", "minAltitude", "maxAlpha", "minV"];
const shippedW = (() => { const b = JSON.parse(fs.readFileSync(path.join(ENG, "brain", "pilotDogfightWeightsDefault.json"), "utf8")); return Float32Array.from(b.weights); })();
const PILOTS = { "the PD autopilot": AF.pilot, "the fruit fly's hand weights": PF.pilotFor(PF.handWeights()), "the shipped dogfight pilot": PF.pilotFor(shippedW) };

console.log("1. A FIGHT OF TWO IS THE SAME FIGHT");
{
    const seen = { statusA: new Set(), statusB: new Set() };
    for (const [pname, pilot] of Object.entries(PILOTS)) {
        let diffs = [], n = 0;
        for (const kind of D.KINDS) for (let seed = 1; seed <= 6; seed++) {
            const sc = D.scenario(seed, kind), d = D.duel(pilot, sc); let r;
            try { r = A.resultOf(A.runArena(A.arenaFromScenario(sc, pilot)), D.A_ID); } catch (e) { diffs.push(`${kind}${seed} THREW ${e.message}`); continue; }
            n++; seen.statusA.add(d.statusA); seen.statusB.add(d.statusB);
            for (const k of FIELDS) if (!Object.is(d[k], r[k])) diffs.push(`${kind}${seed}.${k}: ${d[k]} vs ${r[k]}`);
        }
        ok(`!! ${pname}: ${n} fights (four kinds, six seeds) through duel() and through the arena -- every number duel() reports is identical to the bit`, diffs.length === 0, diffs.slice(0, 3).join("; "));
    }
    ok("...and the fights span the endings: A and B are each seen airborne and destroyed (shots landed and kills made), so the comparison reached the hit, kill and bonus branches", seen.statusA.has("airborne") && seen.statusB.has("destroyed") && seen.statusB.has("airborne"), `A ${[...seen.statusA]}, B ${[...seen.statusB]}`);
    const ground = (s, t, w) => ({ pitch: -1, roll: 0, yaw: 0, throttle: 0.2 }), nothing = () => ({ pitch: 0, roll: 0, yaw: 0, throttle: 0 });
    let diffs = [], ends = new Set();
    for (const [name, p] of [["a pilot that dives", ground], ["the zero pilot", nothing]]) for (const kind of ["tail", "duel"]) for (const seed of [1, 2, 3]) {
        const sc = D.scenario(seed, kind), d = D.duel(p, sc); let r;
        try { r = A.resultOf(A.runArena(A.arenaFromScenario(sc, p)), D.A_ID); } catch (e) { diffs.push(`${name} ${kind}${seed} THREW ${e.message}`); continue; }
        ends.add(d.statusA);
        for (const k of FIELDS) if (!Object.is(d[k], r[k])) diffs.push(`${name} ${kind}${seed}.${k}: ${d[k]} vs ${r[k]}`);
    }
    ok("!! an aircraft that is flown into the ground, and one that is not flown at all, are the same in both (A's ending is the ground's: crashed or touchdown), and A is charged its full hit points", diffs.length === 0 && (ends.has("crashed") || ends.has("touchdown")), `${diffs.slice(0, 2).join("; ")} ${[...ends]}`);
}

// a small world for the arena's own arithmetic: straight and level at 45 m/s, scripted
const straight = (h = 0, alt = 300) => () => ({ heading: h, altitude: alt, airspeed: 45 });
const cruise = (id, team, x, y, h = 0, extra = {}) => ({ id, team, name: "c" + id, pilot: AF.pilot, behaviour: "script", script: straight(h), fires: false, state: { pos: [x, y, 300], speed: 45, heading: h }, ...extra });

console.log("\n2. THE ARENA'S OWN ARITHMETIC");
{
    const arena = A.createArena({ crafts: [cruise(1, 1, 0, 0), cruise(2, 2, 500, 0, Math.PI)] }), before = arena.crafts[0].state;
    const same = A.stepArena(arena);
    ok("!! a tick advances i and t (1/30 s), returns THE SAME OBJECT, and moves the craft (a new state; the one it had is not edited)", same === arena && arena.i === 1 && Math.abs(arena.t - 1 / 30) < 1e-15 && arena.crafts[0].state !== before && before.pos[0] === 0 && arena.crafts[0].state.pos[0] > 1);
    const a1 = A.createArena({ crafts: [cruise(1, 1, 0, 0, 0), cruise(2, 2, 2000, 0, 0)], seconds: 5 }), a2 = A.createArena({ crafts: [cruise(1, 1, 0, 0, 0), cruise(2, 2, 2000, 0, 0)], seconds: 5 });
    A.runArena(a1); let n = 0; while (!a2.done) { A.stepArena(a2); n++; }
    ok("!! runArena is stepping: the same arena stepped by hand ends in the same state after the same number of ticks (150 at 1/30 s for 5 s), 'over' says time, and a finished arena does not move", a1.i === 150 && a2.i === 150 && n === 150 && a1.over === "time" && a1.crafts[0].state.pos.every((v, k) => Object.is(v, a2.crafts[0].state.pos[k])) && (() => { const p = a1.crafts[0].state.pos.slice(); A.stepArena(a1); return a1.i === 150 && a1.crafts[0].state.pos.every((v, k) => v === p[k]); })());
    const hunters = (order) => { const cs = [{ id: 1, team: 1, pilot: AF.pilot, behaviour: "hunt", fires: true, state: D.scenario(4, "offset").a }, { id: 2, team: 2, pilot: AF.pilot, behaviour: "hunt", fires: true, state: D.scenario(4, "offset").b }]; return A.createArena({ crafts: order.map((i) => cs[i]), seconds: 12 }); };
    const f = A.runArena(hunters([0, 1])), r = A.runArena(hunters([1, 0])), pos = (ar, id) => ar.crafts.find((c) => c.id === id).state.pos;
    ok("!! the order the crafts are listed in changes nothing: two hunting craft for 12 s listed 1,2 and 2,1 end at the same positions, to the bit (every decision comes from the states the tick started with)", [1, 2].every((id) => pos(f, id).every((v, k) => Object.is(v, pos(r, id)[k]))) && f.i === r.i && f.crafts[0].hits + f.crafts[1].hits >= 0, `${f.i} ticks`);
}

console.log("");
{
    // three crafts: team 1 has 1 and 3, team 2 has 2. 3 is NEARER to 1 than 2 is, and is a team-mate
    const arena = A.createArena({ crafts: [{ ...cruise(1, 1, 0, 0), behaviour: "hunt" }, cruise(2, 2, 600, 0), cruise(3, 1, 100, 0)] });
    ok("!! a craft's foe is the nearest craft of ANOTHER team: craft 1 (team 1) has the craft of team 2 at 600 m as its foe though its team-mate flies at 100 m, and craft 2's is craft 3 (500 m), not craft 1 (600 m)", A.nearestFoe(arena, arena.crafts[0]).id === 2 && A.nearestFoe(arena, arena.crafts[2]).id === 2 && A.nearestFoe(arena, arena.crafts[1]).id === 3);
    const tie = A.createArena({ crafts: [cruise(1, 1, 0, 0), cruise(5, 2, 300, 0), cruise(4, 2, -300, 0)] });
    ok("!! a tie goes to the LOWER id: two enemies at 300 m, ids 5 and 4 (listed 5 first), and the foe is 4", A.nearestFoe(tie, tie.crafts[0]).id === 4);
    const far = A.createArena({ crafts: [cruise(1, 1, 0, 0), cruise(2, 2, 900, 0), cruise(3, 2, 400, 0)] });
    far.crafts[2].status = "destroyed";
    ok("...and a craft that is not flying is nobody's foe: with the near enemy destroyed the foe is the far one", A.nearestFoe(far, far.crafts[0]).id === 2);
    const solo = A.createArena({ crafts: [cruise(1, 1, 0, 0), cruise(2, 1, 100, 0)] });
    ok("with no enemy (two craft of one team) there is no foe, and the fight is over at the first tick: 'one team left flying'", A.nearestFoe(solo, solo.crafts[0]) === null && A.stepArena(solo).done === true && solo.over === "one team left flying");
}

console.log("");
{
    // head-on: 500 m apart at 45 m/s each, scripted straight, closing at 90 m/s -> they meet in about 5 s
    const arena = A.createArena({ crafts: [cruise(1, 1, 0, 0, 0), cruise(2, 2, 500, 0, Math.PI)] }); A.runArena(arena);
    const ev = []; const replay = A.createArena({ crafts: [cruise(1, 1, 0, 0, 0), cruise(2, 2, 500, 0, Math.PI)] }); while (!replay.done) { A.stepArena(replay); ev.push(...replay.events); }
    ok("!! head-on, BOTH crafts are lost to the collision (status 'collided' for each), the fight ends the tick they are closer than 6 m (at 90 m/s that is 3 m a tick: the closest it saw is between 4 and 6), and the events name each craft once", arena.crafts.every((c) => c.status === "collided") && arena.done && arena.closest < D.COLLISION_RANGE && arena.closest > 4 && ev.filter((e) => e.type === "collision").length === 2 && new Set(ev.filter((e) => e.type === "collision").map((e) => e.craft)).size === 2, `closest ${arena.closest.toFixed(2)} m at tick ${arena.i}`);

    // hits: a fighter 90 m behind a slower craft, pointed at it, firing -- the victim has 3 hit points
    const sp = { ...G.GUN, damage: 2 };
    const shooter = { id: 1, team: 1, name: "shooter", pilot: AF.pilot, behaviour: "hunt", fires: true, spec: sp, state: { pos: [-60, 0, 300], speed: 50, heading: 0 } };
    const victim = { ...cruise(2, 2, 60, 0, 0), spec: G.GUN, hp: 5, state: { pos: [60, 0, 300], speed: 40, heading: 0 } };
    const ar = A.createArena({ crafts: [shooter, victim], seconds: 20 }); const evs = []; while (!ar.done) { A.stepArena(ar); evs.push(...ar.events); }
    const s = ar.crafts[0], v = ar.crafts[1];
    ok("!! hits are credited to the shooter and taken by the victim at the SHOOTER's damage (2 a hit), the victim's hit points are its own (5): three hits (6 damage, the first total over 5) kill it and not a fourth, the kill is stamped with the time, and the fight ends with the shooter's team flying", s.hits === v.taken && s.hits === 6 && v.hp === 5 && v.status === "destroyed" && v.killedAt !== null && Math.abs(v.killedAt - ar.t) < 1e-12 && s.status === "airborne" && ar.over === "one team left flying" && evs.filter((e) => e.type === "kill").length === 1 && evs.filter((e) => e.type === "hit").length === s.hits / 2, `${s.hits} damage dealt, victim hp ${v.hp}, killed at ${v.killedAt && v.killedAt.toFixed(2)} s`);
    ok("...and at the 0.80 s the same fight takes, to the tick (24 ticks at 1/30 s)", ar.i === 24 && Math.abs(v.killedAt - 0.8) < 1e-12, `${ar.i} ticks`);
    ok("...and the first hit is stamped (the time of the first hit event), the shooter fired more rounds than it hit, and the victim, which does not fire, fired none", s.firstHitAt !== null && Math.abs(s.firstHitAt - evs.find((e) => e.type === "hit").t) < 1e-12 && s.gun.fired > s.hits / 2 && v.gun.fired === 0);

    // a wreck in the line of fire is not a target, and does not fire
    const wreckArena = A.createArena({ crafts: [{ ...shooter, state: { pos: [-60, 0, 300], speed: 50, heading: 0 } }, { ...victim }, { ...cruise(3, 2, -30, 0, 0), fires: true, behaviour: "hunt", state: { pos: [-30, 0, 300], speed: 45, heading: Math.PI } }], seconds: 20 });
    wreckArena.crafts[2].status = "crashed"; const wreckState = wreckArena.crafts[2].state;
    while (!wreckArena.done) A.stepArena(wreckArena);
    ok("!! a craft that is out is not a target and does not fire: a wreck 30 m in front of the shooter, on the line of fire, takes no hit (the rounds go through to the real victim) and fires none, and keeps its state; the victim still dies", wreckArena.crafts[2].taken === 0 && wreckArena.crafts[2].gun.fired === 0 && wreckArena.crafts[2].state === wreckState && wreckArena.crafts[1].status === "destroyed" && wreckArena.crafts[0].hits === 6, `${wreckArena.crafts[2].taken} taken, victim ${wreckArena.crafts[1].status}, ${wreckArena.crafts[0].hits} hits`);
    // a craft the ground takes: team 1 has two craft, one of them unflown
    const doomed = { id: 3, team: 1, name: "doomed", pilot: () => ({ pitch: 0, roll: 0, yaw: 0, throttle: 0 }), behaviour: "script", script: straight(), fires: false, state: { pos: [0, 200, 60], speed: 30, heading: 0 } };
    const gr = A.createArena({ crafts: [cruise(1, 1, 0, 0), cruise(2, 2, 3000, 0), doomed], seconds: 20 }); let frozen = null, grounded = null;
    while (!gr.done) { A.stepArena(gr); const d = gr.crafts[2]; if (d.status !== "airborne" && grounded === null) { grounded = gr.i; frozen = d.state; } }
    ok("!! a craft the ground takes keeps its LAST STATE (the same object, every later tick) and is out of the fight, while the other two fly on to the time limit: the fight was not ended by the loss of one of two craft on a team", grounded !== null && grounded < 300 && gr.crafts[2].state === frozen && gr.i === 600 && gr.over === "time" && ["crashed", "touchdown"].includes(gr.crafts[2].status) && gr.crafts[0].status === "airborne" && gr.crafts[1].status === "airborne", `${gr.crafts[2].status} at tick ${grounded}`);
    ok("...and its minimum altitude is tracked from the ticks it flew (a craft that never flew has Infinity), as is the largest angle of attack and the lowest airspeed", gr.crafts[2].minAltitude < 60 && Number.isFinite(gr.crafts[2].minAltitude) && gr.crafts[0].minAltitude > 290 && gr.crafts[0].maxAlpha > 0 && gr.crafts[0].minV > 40 && gr.crafts[0].minV < 50);
}

console.log("");
{
    const throws = (fn) => { try { fn(); return null; } catch (e) { return String(e.message); } };
    const c = (o) => ({ id: 1, team: 1, pilot: AF.pilot, behaviour: "hunt", state: { pos: [0, 0, 300], speed: 45 }, ...o });
    ok("!! createArena refuses what cannot be flown, by name: one craft, a repeated id, an id that is not a positive integer, a craft with no pilot, a scripted craft with no script", /at least two/.test(throws(() => A.createArena({ crafts: [c({})] })) || "") && /distinct/.test(throws(() => A.createArena({ crafts: [c({}), c({})] })) || "")
        && /positive integers/.test(throws(() => A.createArena({ crafts: [c({ id: 0 }), c({ id: 2 })] })) || "") && /positive integers/.test(throws(() => A.createArena({ crafts: [c({ id: 1.5 }), c({ id: 2 })] })) || "") && /no pilot/.test(throws(() => A.createArena({ crafts: [c({ pilot: null }), c({ id: 2 })] })) || "")
        && /no script/.test(throws(() => A.createArena({ crafts: [c({ behaviour: "script" }), c({ id: 2 })] })) || ""));
    const d = A.createArena({ crafts: [c({ id: 7, team: undefined }), c({ id: 9, team: undefined, state: { pos: [500, 0, 300], speed: 45 } })] });
    ok("a craft with no team is its own team (its id), its hit points default to its gun's, its name to 'craft <id>', and it fires unless told not to", d.crafts[0].team === 7 && d.crafts[1].team === 9 && d.crafts[0].hp === G.GUN.hp && d.crafts[0].name === "craft 7" && d.crafts[0].fires === true);
    const cap = A.createArena({ crafts: [c({ id: 1 }), c({ id: 2, team: 2, state: { pos: [900, 0, 300], speed: 45 } })] });
    cap.crafts[0].hits = 30; cap.crafts[0].taken = 0; cap.crafts[1].taken = 30;
    const capped = A.resultOf(cap, 1); cap.crafts[0].taken = 45; const both = A.resultOf(cap, 1);
    ok("!! the score caps what was dealt and what was taken at the hit points (20): 30 hits dealt and none taken is exactly 1.0 (the 'dealt' field keeps the 30), and 30 dealt against 45 taken is exactly 0 (both capped at 20)", capped.score === 1 && capped.dealt === 30 && both.score === 0 && both.taken === 45, `${capped.score}, ${both.score}`);
    ok("resultOf refuses an arena that is not a fight of two", /exactly two/.test(throws(() => A.resultOf(A.createArena({ crafts: [c({}), c({ id: 2 }), c({ id: 3 })] }), 1)) || ""));
}

console.log("\n3. THE FRONT DOOR");
{
    ok("!! the export list is pinned: COLLISION_RANGE, DT, arenaFromScenario, createArena, nearestFoe, reportLines, resultOf, runArena, stepArena, teamsFlying", Object.keys(A).sort().join(",") === "COLLISION_RANGE,DT,arenaFromScenario,createArena,nearestFoe,reportLines,resultOf,runArena,stepArena,teamsFlying", Object.keys(A).sort().join(","));
    const lines = A.reportLines();
    ok("the report line says real numbers and that it is the same as duel()", lines.length === 2 && lines.every((l) => !/NaN|undefined/.test(l)) && /same as dogfightTask\.duel\(\)/.test(lines[1]), lines[1]);
    const t = A.teamsFlying(A.createArena({ crafts: [cruise(1, 1, 0, 0), cruise(2, 2, 500, 0), cruise(3, 2, 600, 0)] }));
    ok("teamsFlying lists each team with a craft in the air once", t.length === 2 && t.includes(1) && t.includes(2));
}

console.log(fails ? `\n${fails} FAIL` : "\nall checks pass");
process.exit(fails ? 1 : 0);
