// WebGLEngine/brain/dogfightArena-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node brain/dogfightArena-selfcheck.mjs      (~30 s: 96 fights flown twice)
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
//   3  FRIENDLY FIRE                      a round hits a team-mate (the rounds of a fixed gun go through whatever is on the line): the hit takes the team-mate's hit points, is flagged friendly, is NOT credited to the shooter (hits, first-hit time and the score stay the
//                                         enemy's) and is counted apart; a craft's `holdFire` (default on) holds the trigger while the round would pass within the team-mate's size plus 2 m of it inside the time the enemy's range takes plus 0.15 s;
//                                         friendInLine is the true closest approach (refined between the 20 ms samples), the nearest team-mate wins, and a team-mate that is flying and of the same team is the only kind that counts
//   4  THE BOMBER IN THE ARENA            its flight (its own model, the existing pilot shown the trainer's world), its five seats (the rounds are the bomber's; a gunner is shown the enemy craft still flying and no one else), its hull of spheres (a hit names
//                                         the part, the spheres are swept through the tick, a fighter in the hull is a collision and one clear of every sphere is not), its engines (8 hits put one out, once; the thrust falls to the bit with modelFor(n)) and its aim radius
//   5  THE FRONT DOOR                     the export list is pinned and the report line says real numbers
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
// SABOTAGE LOG, SECTIONS 3 AND 4 (the friendly-fire rule and the bomber in the arena) -- FIFTY-ONE MORE, each applied to brain/dogfightArena.mjs in a scratch worktree, the gate run, the worktree restored; every one red by name:
//   A35 friendly hits are credited to the shooter as hits dealt 2 | A36 a friendly hit takes nothing from the team-mate 3 | A37 the hit event never says friendly 1
//   A38 the victim's friendlyTaken is not counted 1 | A39 the shooter's friendlyHits is not counted 2 | A40 a friendly hit stamps the first-hit time 2 | A41 hold-fire is off unless asked for 3
//   A42 the hold-fire rule never holds 3 | A43 the hold-fire flag is ignored (always on) 3 | A44 it holds fire for ANY team-mate flying, in the line or not 2 | A45 a held trigger is not counted 2
//   A46 last.held is never set 2 | A47 an ENEMY in the line holds fire too (any craft, not a team-mate) 14 | A48 a team-mate that is not flying holds fire 2 | A49 the margin is 0 2 | A50 the margin is 4 1
//   A51 the team-mate's size is ignored 2 | A52 the reach is ignored (2 s) 2 | A53 no gravity on the round 2 | A54 the team-mate is taken as standing still 3 | A55 the closest sample is not refined 2
//   A56 the farthest team-mate in the line is named, not the nearest 1 | A57 the muzzle velocity is not added to the round's (fixed-world round) 3 | A58 the reach has no slack past the enemy's range 1
//   A59 the thrust never falls (the full model, always) 1 | A60 the thrust of the wrong number of engines 1 | A61 the bomber's pilot is not shown the trainer's world 4 | A62 the pilot is shown the wrong scale 2
//   A63 a bomber's hit points are the gun's 1 | A64 the aim radius is 0.2 of the span 3 | A65 the fighter's trigger ignores the foe's aim radius 1 | A66 a gunner is shown the gun's hit sphere for a bomber 1
//   A67 a gunner is shown its own team-mates 1 | A68 a gunner is shown the destroyed 1 | A69 the gunner factory is ignored 2 | A70 the gunner factory is given the wrong index 1
//   A71 the seat's rounds are owned by another craft 2 | A72 the seats' rounds are never launched 2 | A73 the bomber is one sphere (no parts) 4 | A74 the part sweep ends where it began 1
//   A75 a hit does not name the part 2 | A76 an engine has 80 hit points 2 | A77 an engine dead already goes out again on every hit 2 | A78 an engine out takes two engines 2
//   A79 the engine event names the wrong engine 1 | A80 the part tally is not kept 2 | A81 a hit on a wing counts against the first engine 1 | A82 the hull's spheres are not grown for the other craft's size 1
//   A83 a bomber collides by the plain 6 m rule 2 | A84 two bombers collide by their spheres 1 | A85 the hull is tested against the bomber's own position, not the other's 9
// THREE WENT 0 RED THE FIRST TIME AND WERE FIXED IN THE GATE, NOT EXCUSED: A58 (the hold-fire reach loses its 0.15 s past the enemy's range) because no row had a team-mate just BEYOND the enemy -- a row now puts one 30 m behind it (held) and one 70 m behind it (not); A74 (the hull's sweep ends where it began) because the injected rounds
// all arrived head-on and hit a static sphere as well -- a round standing still 2.2 m ahead of an engine, reached only by the bomber's own motion in the tick, now has to hit, and one at 3 m not; A81 (a hit on a wing puts an engine out) was an INERT SABOTAGE -- the engine's hit points for a wing are undefined and NaN <= 0 is false -- and is
// now 'a hit on a wing counts against the first engine', which the wing row (12 hits, no engine out) catches.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as A from "./dogfightArena.mjs";
import * as D from "./dogfightTask.mjs";
import * as AF from "./autopilotFlight.mjs";
import * as PF from "./pilotFlightPolicy.mjs";
import * as G from "../physics/mechanics/flightGuns.mjs";
import * as F from "../physics/mechanics/flightModel6dof.mjs";
import * as BM from "../physics/mechanics/bomber.mjs";

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


console.log("\n3. FRIENDLY FIRE: A ROUND HITS A TEAM-MATE, IT IS NOT CREDITED, AND A FIXED GUN HOLDS FIRE FOR ONE IN ITS LINE");
{
    const flat = (h = 0, alt = 300, v = 50) => () => ({ heading: h, altitude: alt, airspeed: v });
    // the shooter (team 1, hunting, firing) 140 m behind a team-mate that flies the same course at the same speed, with the enemy (team 2, 40 m/s, not firing) 300 m ahead of the shooter, all on one line
    const world = (hold, matePos = [-60, 0, 300], mateExtra = {}, shooterExtra = {}, enemyX = 100) => A.createArena({ seconds: 6, crafts: [
        { id: 1, team: 1, name: "shooter", pilot: AF.pilot, behaviour: "hunt", fires: true, ...(hold === undefined ? {} : { holdFire: hold }), state: { pos: [-200, 0, 300], speed: 50, heading: 0, pitch: 0.05 }, ...shooterExtra },
        { id: 3, team: 1, name: "mate", pilot: AF.pilot, behaviour: "script", script: flat(0, 300, 50), fires: false, state: { pos: matePos, speed: 50, heading: 0, pitch: 0.05 }, ...mateExtra },
        { id: 2, team: 2, name: "enemy", pilot: AF.pilot, behaviour: "script", script: flat(0, 300, 40), fires: false, state: { pos: [enemyX, 0, 300], speed: 40, heading: 0, pitch: 0.05 } }] });
    const fly = (ar) => { const evs = []; while (!ar.done) { A.stepArena(ar); evs.push(...ar.events); } return evs; };
    const open = world(false), evOpen = fly(open), [so, mo, eo] = open.crafts;
    ok("!! with the hold-fire rule OFF the rounds go through the team-mate that is in front of the shooter: it takes hits (its hit points go), every hit event says friendly: true with the shooter and the victim named, and the enemy beyond it takes none", mo.taken > 5 && evOpen.filter((e) => e.type === "hit").length === mo.taken && evOpen.filter((e) => e.type === "hit").every((e) => e.friendly === true && e.shooter === 1 && e.victim === 3) && eo.taken === 0, `${mo.taken} taken by the team-mate, ${eo.taken} by the enemy`);
    ok("!! ...and those hits are NOT CREDITED: the shooter's `hits` stays 0 and so does its first-hit time (the score is the enemy's), they are counted in its friendlyHits and the team-mate's friendlyTaken (equal to what the team-mate took), and no trigger was held back", so.hits === 0 && so.firstHitAt === null && so.friendlyHits === mo.taken && mo.friendlyTaken === mo.taken && so.friendlyTaken === 0 && mo.friendlyHits === 0 && so.held === 0, `friendlyHits ${so.friendlyHits}, friendlyTaken ${mo.friendlyTaken}`);
    const held = world(), evHeld = fly(held), [sh, mh, eh] = held.crafts;
    ok("!! with the rule at its DEFAULT (on) the same shooter holds its fire: no round leaves the gun while the team-mate is on the line (0 fired over 6 s), 38 trigger ticks were held back, the team-mate takes nothing and no hit happens at all", sh.gun.fired === 0 && sh.held === 38 && mh.taken === 0 && evHeld.filter((e) => e.type === "hit").length === 0 && sh.friendlyHits === 0, `${sh.gun.fired} fired, ${sh.held} held`);
    const aside = world(undefined, [-60, 70, 300]), evA = fly(aside), [sa, ma, ea] = aside.crafts;
    ok("!! ...and it does NOT hold fire for a team-mate that is not in the line: 70 m off to the side, the shooter fires (19 rounds), holds nothing, hits the enemy (6 hits credited, the first stamped) and the team-mate takes nothing -- the rule is a line, not a blanket", sa.gun.fired === 19 && sa.held === 0 && sa.hits === 6 && ea.taken === 6 && sa.firstHitAt !== null && ma.taken === 0 && evA.every((e) => e.type !== "hit" || e.friendly === false), `${sa.gun.fired} fired, ${sa.held} held, ${sa.hits} hits`);
    // the reach is the enemy's range plus a little: the enemy is 150 m ahead (0.5 s of flight), a team-mate in the line just BEHIND it (180 m, 0.57 s) is held for, one 220 m out (0.70 s) is not
    const firstTick = (x) => { const a = world(undefined, [x, 0, 300], {}, {}, -50); A.stepArena(a); return a.crafts[0].last; };
    const behind30 = firstTick(-20), behind70 = firstTick(20);
    ok("!! the hold-fire reach is the enemy's flight time PLUS A LITTLE (0.15 s): with the enemy 150 m ahead, a team-mate in the line 30 m beyond it is held for (a round that misses the enemy reaches it 0.07 s later), one 70 m beyond it is not -- the first tick of each, the trigger held (fire false, held true) or pulled (fire true, held false)", behind30.fire === false && behind30.held === true && behind70.fire === true && behind70.held === false, `30 m beyond: fire ${behind30.fire} held ${behind30.held}; 70 m beyond: fire ${behind70.fire} held ${behind70.held}`);
    const kill = world(false, [-60, 0, 300], { hp: 3 }), evK = fly(kill), mk = kill.crafts[1];
    ok("!! a team-mate shot to nothing by friendly fire is DESTROYED like any craft (3 hit points, 3 friendly hits, timed at 5.40 s, one 'kill' event) and the fight goes on (the enemy still flies, so it ran to the time limit); the rounds that get past the wreck then hit the ENEMY and THOSE are credited (3 hits dealt, the first stamped after the team-mate's loss) while the 3 friendly ones stay out of `hits`", mk.status === "destroyed" && Math.abs(mk.killedAt - 5.4) < 1e-9 && evK.filter((e) => e.type === "kill").length === 1 && evK.filter((e) => e.type === "kill")[0].craft === 3 && kill.crafts[0].friendlyHits === 3 && kill.crafts[0].hits === 3 && kill.crafts[2].taken === 3 && kill.crafts[0].firstHitAt >= mk.killedAt && kill.over === "time" && kill.crafts[2].status === "airborne", `${mk.status} at ${mk.killedAt && mk.killedAt.toFixed(2)} s, ${kill.crafts[0].friendlyHits} friendly / ${kill.crafts[0].hits} credited, ${kill.over}`);
    // friendInLine, directly: place the team-mate so the shooter's round passes through its centre at 0.4 s, then move it sideways by d
    const probe = world(true), c = probe.crafts[0], mate = probe.crafts[1], m = G.muzzleOf(c.state, c.spec), v = m.vel.map((x, k) => x + m.dir[k] * c.spec.muzzleSpeed), place = (t0, dy) => { mate.state = { ...mate.state, pos: [m.pos[0] + (v[0] - mate.state.vel[0]) * t0, m.pos[1] + (v[1] - mate.state.vel[1]) * t0 + dy, m.pos[2] + (v[2] - mate.state.vel[2]) * t0 - 0.5 * G.GRAVITY * t0 * t0] }; };
    const near = G.GUN.hitRadius + A.HOLD_FIRE_MARGIN, inside = (() => { place(0.4, near - 0.3); return A.friendInLine(probe, c, 1.0); })(), outside = (() => { place(0.4, near + 0.3); return A.friendInLine(probe, c, 1.0); })(), centre = (() => { place(0.4, 0); return A.friendInLine(probe, c, 1.0); })();
    ok("!! friendInLine is the closest approach of the round to the team-mate against its size plus the 2 m margin (6 m): through its centre the miss is 0, 5.7 m to the side is in the line (miss 5.7), 6.3 m to the side is not (null)", A.HOLD_FIRE_MARGIN === 2 && centre && centre.craft.id === 3 && Math.abs(centre.miss) < 1e-6 && inside && Math.abs(inside.miss - (near - 0.3)) < 1e-3 && outside === null, `centre ${centre && centre.miss.toExponential(1)}, inside ${inside && inside.miss.toFixed(3)}, outside ${outside}`);
    const between = (() => { place(0.411, 0); const a = A.friendInLine(probe, c, 1.0); place(0.411, 5.9); const b = A.friendInLine(probe, c, 1.0); return { a, b }; })();
    ok("!! ...and it is the TRUE closest approach, not the nearest 20 ms sample (the round and the team-mate close at 300 m/s, 6 m a sample): the round that passes through the team-mate's centre at 0.411 s, between samples, is a miss of 0, and one that passes 5.9 m to the side is still in the line (miss 5.9)", between.a && Math.abs(between.a.miss) < 1e-6 && between.b && Math.abs(between.b.miss - 5.9) < 1e-3, `${between.a && between.a.miss.toExponential(1)}, ${between.b && between.b.miss.toFixed(4)}`);
    place(1.0, 0); const late = A.friendInLine(probe, c, 0.5), early = A.friendInLine(probe, c, 1.2);
    ok("!! ...and only INSIDE THE TIME THE ROUND IS WANTED: a team-mate the round would reach at 1.0 s is not in the line for a 0.5 s reach and is for a 1.2 s one; a team-mate that is no longer flying, and one of ANOTHER team, are never in the line", late === null && early !== null && (() => { mate.status = "destroyed"; const r = A.friendInLine(probe, c, 1.2); mate.status = "airborne"; mate.team = 9; const o = A.friendInLine(probe, c, 1.2); mate.team = 1; return r === null && o === null; })());
    // the nearest of two
    const lvl = (id, team, x, y, h = 0) => cruise(id, team, x, y, h, { state: { pos: [x, y, 300], speed: 45, heading: h, pitch: 0.05 } });
    const pair = A.createArena({ seconds: 2, crafts: [lvl(1, 1, -200, 0), lvl(3, 1, -100, 0), lvl(4, 1, -100, 3), lvl(2, 2, 500, 0, Math.PI)] }), c2 = pair.crafts[0], first = A.friendInLine(pair, c2, 0.8);
    pair.crafts[1].status = "destroyed"; const second = A.friendInLine(pair, c2, 0.8);
    ok("...and of two team-mates in the line it names the one the round passes NEAREST (the one on the bore, under 1.5 m, not the one 3 m aside); with the near one gone it names the other", first && first.craft.id === 3 && first.miss < 1.5 && second && second.craft.id === 4 && second.miss > first.miss, `${first && first.craft.id} at ${first && first.miss.toFixed(2)} m, then ${second && second.craft.id} at ${second && second.miss.toFixed(2)} m`);
    const rec = world(); let tick = 0; while (!rec.crafts[0].last || !rec.crafts[0].last.held) { if (++tick > 179) break; A.stepArena(rec); }
    ok("the arena says whether the rule is on: a craft's `holdFire` is true unless it is told false, and `last.held` is true (with `last.fire` false) on a tick the trigger was held back, and false on the ticks it was not", held.crafts[0].holdFire === true && open.crafts[0].holdFire === false && rec.crafts[0].last.held === true && rec.crafts[0].last.fire === false && rec.crafts[0].held >= 1 && (() => { const a = world(false); A.stepArena(a); return a.crafts[0].last.held === false; })(), `first held at tick ${tick}`);
}

console.log("\n4. THE BOMBER IN THE ARENA: ITS FLIGHT, ITS SEATS, ITS HULL OF SPHERES AND ITS ENGINES");
{
    const bomber = BM.createBomber(), alt = bomber.altitude, cv = bomber.cruiseSpeed;
    const quiet = () => (seat, st) => ({ yaw: st.yaw, pitch: st.pitch, fire: false });
    const bomberCraft = (extra = {}) => ({ id: 1, team: 1, name: "bomber", bomber, pilot: AF.pilot, behaviour: "script", script: () => ({ heading: 0, altitude: alt, airspeed: cv }), fires: false, state: { pos: [0, 0, alt], speed: cv, heading: 0, pitch: 0.16 }, ...extra });
    const escort = (id, x, y, z, extra = {}) => ({ id, team: 2, name: "e" + id, pilot: AF.pilot, behaviour: "script", script: () => ({ heading: 0, altitude: alt + z, airspeed: cv }), fires: false, state: { pos: [x, y, alt + z], speed: cv, heading: 0, pitch: 0.16 }, ...extra });
    const fly = (ar) => { const evs = []; while (!ar.done) { A.stepArena(ar); evs.push(...ar.events); } return evs; };

    const calm = A.createArena({ crafts: [bomberCraft({ gunner: quiet }), escort(2, 3000, 0, 0)], seconds: 20 }); A.runArena(calm); const cb = calm.crafts[0];
    ok("!! a bomber craft flies the bomber's own model with the existing pilot: 20 s on a script holds its cruise speed to 0.1 m/s and its altitude to 1 m, and it is a craft with 60 hit points, an aim radius of 0.35 of its span, five seats and four engines running", Math.abs(F.attitude(cb.state).airspeed - cv) < 0.1 && Math.abs(cb.state.pos[2] - alt) < 1 && cb.hp === 60 && Math.abs(cb.aimRadius - 0.35 * bomber.span) < 1e-12 && cb.seats.length === 5 && cb.enginesRunning === 4 && cb.model === bomber.model, `${F.attitude(cb.state).airspeed.toFixed(3)} m/s, ${cb.state.pos[2].toFixed(2)} m`);
    const plain = A.createArena({ crafts: [cruise(1, 1, 0, 0), cruise(2, 2, 500, 0)] }).crafts[0];
    ok("...and a craft with no bomber is what it was: no seats, no engines to lose, the trainer's model and the gun's hit points", plain.bomber === null && plain.seats.length === 0 && plain.enginesRunning === 0 && plain.hp === G.GUN.hp && plain.aimRadius === G.GUN.hitRadius);
    let seenP = null; const spy = (s, t, w) => { if (!seenP) seenP = { s, t }; return AF.pilot(s, t, w); };
    const sp = A.createArena({ crafts: [bomberCraft({ gunner: quiet, pilot: spy }), escort(2, 3000, 0, 0)], seconds: 1 }); A.stepArena(sp);
    ok("!! the bomber's pilot is shown THE TRAINER'S WORLD (froudeScale.scalePilot): at scale 2 it sees the altitude halved (250 m), the target altitude halved, the airspeed target and the speed over sqrt 2 (30.6 m/s), and its four controls are the ones the bomber flew on", seenP && Math.abs(seenP.s.pos[2] - alt / 2) < 1e-9 && Math.abs(seenP.t.altitude - alt / 2) < 1e-9 && Math.abs(seenP.t.airspeed - cv / Math.SQRT2) < 1e-9 && Math.abs(Math.hypot(...seenP.s.vel) - cv / Math.SQRT2) < 1e-6 && JSON.stringify(sp.crafts[0].last.controls) === JSON.stringify(AF.pilot(seenP.s, seenP.t, [0, 0, 0])));

    // the seats: a fighter in formation 80 m off the right wing and 20 m up, not firing
    const form = A.createArena({ crafts: [bomberCraft(), escort(2, -40, -80, 20)], seconds: 30 }), evF = fly(form), bf = form.crafts[0], ff = form.crafts[1];
    ok("!! the gun seats fire at an enemy in the arena: the two upper turrets that can see a fighter 80 m off the right wing put 36 rounds in the air (18 each; the lower turrets and the tail, which cannot see it, none), THE ROUNDS ARE THE BOMBER'S (every hit event names the bomber as shooter), 20 hits kill the 20-hit-point fighter, the bomber's own forward gun fired nothing, and the fight ends 'one team left flying'", bf.seats.map((x) => x.state.gun.fired).join() === "18,0,18,0,0" && ff.status === "destroyed" && ff.taken === 20 && bf.hits === 20 && bf.gun.fired === 0 && evF.filter((e) => e.type === "hit").length === 20 && evF.every((e) => e.type !== "hit" || (e.shooter === 1 && e.victim === 2 && e.friendly === false)) && form.over === "one team left flying", `${bf.seats.map((x) => x.state.gun.fired)}, killed at ${ff.killedAt && ff.killedAt.toFixed(2)} s`);
    ok("...and the first hit is the bomber's (stamped 1.6 s into the fight) and the kill 1.9 s; a plain fighter has no hit parts, so its hits carry no `part`", Math.abs(bf.firstHitAt - 1.6) < 1e-9 && Math.abs(ff.killedAt - 1.9) < 1e-9 && evF.filter((e) => e.type === "hit").every((e) => e.part === undefined), `first ${bf.firstHitAt}, killed ${ff.killedAt}`);
    const logs = []; const shownBy = (seat, k) => (s, st, body, shown) => { if (k === 0) logs.push(shown.map((x) => `${x.id}:${x.radius.toFixed(2)}`).join(",")); return { yaw: st.yaw, pitch: st.pitch, fire: false }; };
    const sh = A.createArena({ crafts: [bomberCraft({ gunner: shownBy }), escort(2, 600, 0, 0), escort(3, 700, 0, 0), { ...escort(4, 100, 0, 0), team: 1 }, { ...bomberCraft({ gunner: quiet }), id: 5, team: 2, state: { pos: [4000, 0, alt], speed: cv, heading: 0, pitch: 0.16 } }], seconds: 2 }); A.stepArena(sh); sh.crafts[2].status = "destroyed"; A.stepArena(sh);
    ok("!! a gunner is shown the enemy craft still flying and nobody else (a team-mate 100 m away is not shown; a destroyed enemy is dropped the next tick), each with the radius a round has to reach (a fighter's hit sphere, 4 m; an enemy BOMBER's aim radius, 7.42 m), and the `gunner(seat, index)` factory is called once per seat", logs.join(" | ") === "2:4.00,3:4.00,5:7.42 | 2:4.00,5:7.42" && sh.crafts[0].seats.length === 5);

    // the hull: rounds put into the bomber name the part they reached
    const inject = (ar, partId, owner = 2) => { const c = ar.crafts[0], p = BM.partCentres(c.bomber, c.state)[partId]; ar.rounds = [...ar.rounds, { pos: [p.center[0], p.center[1], p.center[2] + 15], vel: [c.state.vel[0], c.state.vel[1], c.state.vel[2] - 300], age: 0, owner }]; };
    const E2 = bomber.engines[1], hull = A.createArena({ crafts: [bomberCraft({ gunner: quiet }), escort(2, 5000, 0, 0)], seconds: 30 }); let evH = [];
    for (let n = 0; n < 12; n++) { inject(hull, E2); A.stepArena(hull); evH.push(...hull.events); }
    const bh = hull.crafts[0], hitsH = evH.filter((e) => e.type === "hit"), engEv = evH.filter((e) => e.type === "engine");
    ok("!! a hit on a bomber NAMES THE PART it reached: 12 rounds dropped on the inner left engine (from 15 m above, 300 m/s) are 11 hits (the first needs a tick to arrive), every one carries part " + E2 + " and friendly: false, the part's tally and the bomber's damage taken agree (11), and the shooter (the enemy fighter that owns the rounds) is credited", hitsH.length === 11 && hitsH.every((e) => e.part === E2 && e.friendly === false && e.victim === 1 && e.shooter === 2) && bh.partHits.get(E2) === 11 && bh.taken === 11 && hull.crafts[1].hits === 11, `${hitsH.length} hits, part tally ${bh.partHits.get(E2)}`);
    ok("!! an engine shot to nothing goes OUT, once: its 8 hit points go on the 8th hit (0.30 s), ONE 'engine' event names it ('engine 2 (inner left)', 3 running), the hits after that (3 more) land on the dead engine without a second event, and the other three engines keep their hit points", engEv.length === 1 && engEv[0].part === E2 && engEv[0].running === 3 && /inner left/.test(engEv[0].name) && Math.abs(engEv[0].t - 0.3) < 1e-9 && bh.enginesRunning === 3 && bh.engineHp.get(E2) === -3 && bomber.engines.filter((e) => e !== E2).every((e) => bh.engineHp.get(e) === 8), `${engEv.length} event(s), running ${bh.enginesRunning}, engine hp ${bh.engineHp.get(E2)}`);
    const E3 = bomber.engines[2], two = A.createArena({ crafts: [bomberCraft({ gunner: quiet }), escort(2, 5000, 0, 0)], seconds: 30 }); const evT = [];
    for (let n = 0; n < 24; n++) { inject(two, n < 10 ? E2 : E3); A.stepArena(two); evT.push(...two.events); }
    ok("...and a second engine goes out the same way (two engines out, 2 running; the second event says 2), and a hit on a wing or the fuselage costs hit points but no engine", two.crafts[0].enginesRunning === 2 && evT.filter((e) => e.type === "engine").map((e) => e.running).join() === "3,2" && (() => { const w = A.createArena({ crafts: [bomberCraft({ gunner: quiet }), escort(2, 5000, 0, 0)], seconds: 30 }); const wing = bomber.parts.find((p) => p.name === "left wing").id, evs = []; for (let n = 0; n < 12; n++) { inject(w, wing); A.stepArena(w); evs.push(...w.events); } return w.crafts[0].enginesRunning === 4 && w.crafts[0].taken > 5 && w.crafts[0].partHits.get(wing) === w.crafts[0].taken && !evs.some((e) => e.type === "engine"); })());
    // the hull moves with the bomber through the tick: a round that sits still 2.2 m ahead of an engine (1.08 m radius) is reached by the engine within the tick (the bomber flies 1.44 m a tick), one 3 m ahead is not
    const sit = (ahead) => { const ar = A.createArena({ crafts: [bomberCraft({ gunner: quiet }), escort(2, 5000, 0, 0)], seconds: 3 }), c = ar.crafts[0], pc = BM.partCentres(c.bomber, c.state)[E2]; ar.rounds = [{ pos: [pc.center[0] + ahead, pc.center[1], pc.center[2]], vel: [0, 0, 0], age: 0, owner: 2 }]; A.stepArena(ar); return ar.events.filter((e) => e.type === "hit"); };
    const swept = sit(2.2), missed = sit(3.0);
    ok("!! the hull's spheres are SWEPT through the tick (from where they were to where the bomber's motion carries them): a round standing still 2.2 m ahead of the inner left engine is hit by it within one tick (part " + E2 + "), one 3.0 m ahead (past the engine's 1.08 m and the tick's 1.44 m) is not", swept.length === 1 && swept[0].part === E2 && missed.length === 0, `${swept.length} / ${missed.length}`);
    // the thrust falls: an engine out from the start, full throttle, against the same flight stepped by hand
    const full = () => ({ pitch: 0, roll: 0, yaw: 0, throttle: 1 });
    const flyN = (n) => { const ar = A.createArena({ crafts: [bomberCraft({ gunner: quiet, pilot: full }), escort(2, 9000, 0, 0)], seconds: 30 }); ar.crafts[0].enginesRunning = n; for (let i = 0; i < 60; i++) A.stepArena(ar); return ar.crafts[0].state; };
    const byHand = (n) => { const mdl = bomber.modelFor(n); let st = F.createState({ pos: [0, 0, alt], speed: cv, heading: 0, pitch: 0.16, mass: bomber.model.mass, inertia: bomber.model.inertia }); for (let i = 0; i < 60; i++) st = F.stepFlight(mdl, st, { pitch: 0, roll: 0, yaw: 0, throttle: 1 }, A.DT, [0, 0, 0]).state; return st; };
    const same = (a, b) => a.pos.every((v, k) => Object.is(v, b.pos[k])) && a.vel.every((v, k) => Object.is(v, b.vel[k]));
    const s4 = flyN(4), s3 = flyN(3), s0 = flyN(0);
    ok("!! the thrust falls with the engines: two seconds at full throttle with 4 engines running, with 3 and with none are, to the bit, the flights the bomber's own modelFor(n) gives stepped by hand; and 4 is faster than 3 is faster than 0", same(s4, byHand(4)) && same(s3, byHand(3)) && same(s0, byHand(0)) && Math.hypot(...s4.vel) > Math.hypot(...s3.vel) + 0.3 && Math.hypot(...s3.vel) > Math.hypot(...s0.vel) + 0.3, `${Math.hypot(...s4.vel).toFixed(2)} > ${Math.hypot(...s3.vel).toFixed(2)} > ${Math.hypot(...s0.vel).toFixed(2)} m/s`);

    // collisions with the hull: a fighter in a wing, not 6 m from the centre
    const col = (y, z = 0.3, x = -0.25) => { const ar = A.createArena({ crafts: [bomberCraft({ gunner: quiet }), escort(2, x, y, z)], seconds: 3 }); A.runArena(ar); return ar; };
    const tip = col(11.6), clear = col(12.0), roof = col(0, 5, 0);
    ok("!! a fighter that is in the bomber's HULL has hit it: 3.0 m off the left wing tip's centre (inside the sphere grown by 2 m for the fighter's size, 11.6 m from the bomber's centre) both are lost on the first tick; at 3.4 m (12.0 m from the centre) they fly on to the time limit", tip.crafts.every((c) => c.status === "collided") && tip.i === 1 && tip.over === "no team left flying" && clear.crafts.every((c) => c.status === "airborne") && clear.over === "time" && clear.closest > 12 && clear.closest < 12.1, `${tip.crafts.map((c) => c.status)} / ${clear.over}`);
    ok("!! ...and the hull is NOT the plain 6 m rule: a fighter 5 m above the bomber's centre, clear of every sphere, flies alongside for 3 s without a collision (the plain rule would have lost them both); and two bombers use the plain range between centres (5 m apart vertically, both lost, where a fighter at the same place is not)", roof.crafts.every((c) => c.status === "airborne") && roof.closest < 5.1 && (() => { const ar = A.createArena({ crafts: [bomberCraft({ gunner: quiet }), { ...bomberCraft({ gunner: quiet }), id: 2, team: 2, state: { pos: [0, 0, alt + 5], speed: cv, heading: 0, pitch: 0.16 } }], seconds: 3 }); A.runArena(ar); return ar.crafts.every((c) => c.status === "collided"); })(), `${roof.closest.toFixed(2)} m`);
    // the aim radius: the fighter's trigger is as generous as the bomber is big. A fighter 150 m behind, 46 m/s, nose at the bomber's height, offset sideways: the predicted miss is the offset (D.fireControl: 5.1 m at 5, 9.1 m at 9)
    const aim = (y, extra) => { const ar = A.createArena({ crafts: [bomberCraft({ gunner: quiet, ...extra }), { id: 2, team: 2, name: "shooter", pilot: AF.pilot, behaviour: "hunt", fires: true, state: { pos: [-150, y, alt], speed: 46, heading: 0, pitch: 0.05 } }], seconds: 1 }); A.stepArena(ar); return ar.crafts[1].last.fire; };
    ok("!! the fighter's trigger uses the bomber's AIM RADIUS (0.35 of its span, 7.4 m, not the 4 m of a fighter): the same approach 5 m off the line (a 5.1 m predicted miss) fires at a bomber of the default radius and does NOT at one told its aim radius is 1.5 m, and 9 m off the line (a 9.1 m miss) does not fire even at the default", aim(5, {}) === true && aim(5, { aimRadius: 1.5 }) === false && aim(9, {}) === false && aim(0, { aimRadius: 1.5 }) === true);
}

console.log("\n5. THE FRONT DOOR");
{
    ok("!! the export list is pinned: COLLISION_RANGE, DT, HOLD_FIRE_MARGIN, arenaFromScenario, createArena, friendInLine, nearestFoe, reportLines, resultOf, runArena, stepArena, teamsFlying", Object.keys(A).sort().join(",") === "COLLISION_RANGE,DT,HOLD_FIRE_MARGIN,arenaFromScenario,createArena,friendInLine,nearestFoe,reportLines,resultOf,runArena,stepArena,teamsFlying", Object.keys(A).sort().join(","));
    const lines = A.reportLines();
    ok("the report line says real numbers and that it is the same as duel()", lines.length === 2 && lines.every((l) => !/NaN|undefined/.test(l)) && /same as dogfightTask\.duel\(\)/.test(lines[1]), lines[1]);
    const t = A.teamsFlying(A.createArena({ crafts: [cruise(1, 1, 0, 0), cruise(2, 2, 500, 0), cruise(3, 2, 600, 0)] }));
    ok("teamsFlying lists each team with a craft in the air once", t.length === 2 && t.includes(1) && t.includes(2));
}

console.log(fails ? `\n${fails} FAIL` : "\nall checks pass");
process.exit(fails ? 1 : 0);
