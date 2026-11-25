#!/usr/bin/env node
// WebGLEngine/brain/spaceRocks-selfcheck.mjs -- the rock field of the space arena (brain/spaceRocks.mjs)
//
// Run: node brain/spaceRocks-selfcheck.mjs   (a few seconds)
// Gated by tools/ship/selfchecks.mjs (discovery gate -- found by name, not by a list).
//
// Holds: the field (its own stream, the band, the bearing, the sizes, frozen, refused counts); THE FIGHT WITHOUT ROCKS IS THE FIGHT IT WAS (the whole tally, and the
// arena's own fields); each rule on an arena built where the answer is known (a fighter flown into a rock is struck; a ship that drifts into one pays ROCK_DAMAGE
// once; a round fired through one stops there); friendly fire with rocks (whose own-part ids are negated too) runs and never takes a rock for a craft; and that a
// field across the approach does take fighters (a throwaway seed, in no set).
//
// ---- SABOTAGE LOG ----------------------------------------------------------------------------------------------
// 11 mutants (each in a backed-up copy, restored byte-identical and checked), all red by name in the end; THREE were not, first:
//   red at once: a struck fighter left unmarked (2); a ship paying for a rock every tick; the arena not handing rocks to the round stepper (red only once the
//   arena counted the rounds rocks stop -- the cover row had driven the helper, not the arena); friendly fire stripping rock hits after its ids are given back;
//   the bearing ignored; the rocks key always on the arena; capital ships skipping rocks; the band ignored (2); a field built for no count.
//   *** NOT AT FIRST: (1) the field drawn from the FIGHTERS' stream went 0 RED -- the row asked that the fighters start where they did, which separate
//   generators always do; the harm is CORRELATION (the k-th rock on the k-th fighter's bearing), and a row now asks for none on six seeds (1 red).
//   (2) rock hits kept as craft hits CRASHED the gate (a rock id is no craft): sections 2, 3 and 4 now catch and fail by name (5 red). ***
"use strict";

import * as SR from "./spaceRocks.mjs";
import * as SA from "./spaceArena.mjs";
import * as BF from "./battleshipFight.mjs";
import * as CS from "../physics/mechanics/capitalShip.mjs";
import * as G from "../physics/mechanics/flightGuns.mjs";

let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };
const sec = (t) => console.log("\n" + t);
const J = JSON.stringify, THROWAWAY = 9990003;
const thr = (f) => { try { f(); return ""; } catch (e) { return e.message; } };

sec("1. THE FIELD");
{
    const a = SR.rockField(THROWAWAY, "bow"), b = SR.rockField(THROWAWAY, "bow"), o = SR.ROCK_DEFAULTS;
    const dist = (q) => Math.hypot(...q.pos), az = (q) => Math.atan2(q.pos[1], q.pos[0]);
    ok("!! a seed and a kind give the same field every time: 24 rocks by default, each frozen, in the band 150-330 from the ship, radius 8-20",
        J(a) === J(b) && a.length === 24 && o.count === 24 && Object.isFrozen(a) && a.every((q) => Object.isFrozen(q) && Object.isFrozen(q.pos)) &&
        a.every((q) => dist(q) >= o.dMin - 1e-9 && dist(q) <= o.dMax + 1e-9 && q.radius >= o.rMin && q.radius <= o.rMax));
    const stern = SR.rockField(THROWAWAY, "stern"), swarm = SR.rockField(THROWAWAY, "swarm");
    ok("!! the field lies across the attack: bow rocks within 0.6 rad of the bow, stern rocks of the stern; a swarm's anywhere",
        a.every((q) => Math.abs(az(q)) <= o.spread + 1e-9) && stern.every((q) => Math.PI - Math.abs(az(q)) <= o.spread + 1e-9) && swarm.some((q) => Math.abs(az(q)) > 1.2) && swarm.some((q) => Math.abs(az(q)) < 1));
    // a stream of its own, and NOT the fighters': drawn from the same seed as the fighters, a swarm's first rock would sit on the first fighter's own bearing
    const azOf = (p) => Math.atan2(p[1], p[0]), corr = [1, 2, 3, 4, 5, THROWAWAY].filter((sd) => { const f = BF.scenario(sd, "swarm").fighters, r = SR.rockField(sd, "swarm"); return f.some((q, i) => r[i] && Math.abs(azOf(q.pos) - azOf(r[i].pos)) < 1e-9); });
    ok("!! the field has a STREAM OF ITS OWN: the fighters of a seed start where they did, rocks or none, and no rock is drawn on a fighter's own bearing (the fighters' stream would put the k-th rock on the k-th fighter's)",
        J(BF.build(THROWAWAY, "beam", { rocks: 24 }).scenario) === J(BF.scenario(THROWAWAY, "beam")) && corr.length === 0, corr.length ? "correlated on seeds " + corr.join(", ") : "");
    ok("a count of 0 is no field, a count is honoured, and a count that is not a whole number is refused by its words",
        SR.rockField(1, "bow", { count: 0 }).length === 0 && SR.rockField(1, "bow", { count: 7 }).length === 7 && /count must be a whole number/.test(thr(() => SR.rockField(1, "bow", { count: 2.5 }))));
}

sec("2. *** THE FIGHT WITHOUT ROCKS IS THE FIGHT IT WAS ***");
{
    let same = false, differ = false, crash = null;
    try {
        same = BF.KINDS.every((k) => J(BF.fight(THROWAWAY, k, { gunners: "regular" })) === J(BF.fight(THROWAWAY, k, { gunners: "regular", rocks: 0 })));
        differ = BF.KINDS.some((k) => J(BF.fight(THROWAWAY, k, { gunners: "regular" })) !== J(BF.fight(THROWAWAY, k, { gunners: "regular", rocks: 24 })));
    } catch (e) { crash = e.message; }
    ok("!! a fight with a rock field runs to its end (a rock is never taken for a craft)", crash === null, crash || "");
    const plain = BF.build(THROWAWAY, "bow").arena, keys = Object.keys(plain);
    ok("!! with no rocks the whole tally is the same, field for field, on all four kinds -- and with a field it is not; the arena carries no rock fields at all",
        same && differ && !keys.includes("rocks") && !keys.includes("rockTouched") && !("struck" in BF.fight(THROWAWAY, "bow")));
    const two = () => [{ id: 1, kind: "capital", ship: CS.createCapitalShip() }, { id: 2, kind: "fighter" }];
    ok("an arena refuses rocks that are not [{ pos, radius > 0 }]: a two-number position, a zero radius", /rocks are/.test(thr(() => SA.createSpaceArena({ crafts: two(), rocks: [{ pos: [0, 0], radius: 1 }] }))) && /rocks are/.test(thr(() => SA.createSpaceArena({ crafts: two(), rocks: [{ pos: [0, 0, 0], radius: 0 }] }))));
}

sec("3. EACH RULE, WHERE THE ANSWER IS KNOWN");
try {
    const ship = () => ({ id: 1, team: 1, kind: "capital", ship: CS.createCapitalShip(), state: { pos: [0, 0, 0], q: [1, 0, 0, 0] }, behaviour: "hold", cruise: 0 });
    // a fighter coasting straight at a rock: its pilot cuts the thrust and holds fire, so only the rock can stop it
    const coast = () => ({ torqueBody: [0, 0, 0], thrust: 0, firing: false });
    const fighter = (pos, vel) => ({ id: 2, team: 2, kind: "fighter", state: { pos, vel, q: [1, 0, 0, 0] }, pilot: coast });
    const ar = SA.createSpaceArena({ crafts: [ship(), fighter([0, 400, 0], [0, -30, 0])], seconds: 6, rocks: [{ pos: [0, 340, 0], radius: 10 }] });
    let ev = null; while (!ar.done) { SA.stepSpaceArena(ar); ev = ev || ar.events.find((e) => e.type === "rock"); }
    const f = ar.crafts[1], tl = BF.tally(ar);
    ok("!! a fighter coasting into a rock is lost to it: status struck, a rock event naming the rock, counted in the tally as struck and not as killed",
        f.status === "struck" && f.dead && ev && ev.craft === 2 && ev.rock === 0 && tl.struck === 1 && tl.killed === 0, `struck at t ${ev ? ev.t.toFixed(2) : "-"}`);
    const miss = SA.createSpaceArena({ crafts: [ship(), fighter([0, 400, 0], [0, -30, 0])], seconds: 3, rocks: [{ pos: [100, 340, 0], radius: 10 }] }); SA.runSpaceArena(miss);
    ok("...and one that passes 100 units wide of the rock flies on", miss.crafts[1].status === "flying");
    // a ship drifting through a rock: hit points down by ROCK_DAMAGE, once, however many ticks it overlaps
    const drift = { ...ship(), state: { pos: [0, 0, 0], vel: [0, 0, 6], q: [1, 0, 0, 0] } };
    const sa = SA.createSpaceArena({ crafts: [drift, fighter([2000, 2000, 0], [0, 0, 0])], seconds: 20, rocks: [{ pos: [0, 0, 40], radius: 12 }] });
    const hp0 = sa.crafts[0].hp; let rockEvents = 0; while (!sa.done) { SA.stepSpaceArena(sa); rockEvents += sa.events.filter((e) => e.type === "rock" && e.craft === 1).length; }
    ok("!! a capital ship drifting through a rock pays ROCK_DAMAGE ONCE, however many ticks it overlaps, and the rock stays", hp0 - sa.crafts[0].hp === SR.ROCK_DAMAGE && rockEvents === 1 && sa.rocks.length === 1, `${hp0} -> ${sa.crafts[0].hp}`);
    // a round fired through a rock at a target behind it stops at the rock
    const round = { pos: [0, 0, 0], vel: [900, 0, 0], age: 0, owner: 7, team: 2, dmg: 18, life: 2.5 };
    const target = { id: 3, from: [60, 0, 0], to: [60, 0, 0], radius: 2 }, rock = [{ pos: [30, 0, 0], radius: 5 }];
    const bare = G.stepRounds([round], 1 / 10, [target], { g: 0, ground: null, life: 5 }), shield = SR.stripRockHits(G.stepRounds([round], 1 / 10, [target, ...SR.rockTargets(rock)], { g: 0, ground: null, life: 5 }));
    ok("!! rocks are cover: a round that hits a target in the open stops at a rock put in its path -- no craft hit, the round gone, the rock's hit stripped",
        bare.hits.length === 1 && bare.hits[0].target === 3 && shield.hits.length === 0 && shield.rockHits.length === 1 && shield.rounds.length === 0);
    ok("rock ids sit below every craft id and every negated craft id", SR.rockTargets(rock)[0].id === -SR.ROCK_ID_BASE && SR.isRockHit({ target: -SR.ROCK_ID_BASE - 3 }) && !SR.isRockHit({ target: -50 }) && !SR.isRockHit({ target: 4 }));
} catch (e) { ok("!! section 3 ran to its end (no arena threw)", false, e.message); }

sec("4. IN A WHOLE FIGHT");
try {
    let threw = null, ff = null;
    try { ff = BF.fight(THROWAWAY, "swarm", { gunners: "regular", rocks: 24, friendlyFire: true }); } catch (e) { threw = e.message; }
    ok("!! friendly fire with rocks runs to its end and never takes a rock for a craft (its own-part ids are negated too)", threw === null && ff && ff.over && Number.isInteger(ff.struck), threw || `struck ${ff.struck}`);
    const rows = BF.KINDS.map((k) => { const b = BF.build(THROWAWAY, k, { gunners: "regular", rocks: 24 }); SA.runSpaceArena(b.arena); return { ...BF.tally(b.arena), stopped: b.arena.roundsStopped }; });
    ok("!! a field across the approach takes fighters: over the four kinds of a throwaway seed, today's autopilot flies some into the rocks", rows.reduce((a, r) => a + r.struck, 0) > 0, rows.map((r, i) => BF.KINDS[i] + " " + r.struck).join(", "));
    ok("!! and the ARENA's own rounds are stopped by rocks in a whole fight (the arena hands the rocks to the round stepper, and counts what they stop)", rows.reduce((a, r) => a + r.stopped, 0) > 0, rows.map((r, i) => BF.KINDS[i] + " " + r.stopped).join(", ") + " rounds stopped");
} catch (e) { ok("!! section 4 ran to its end (no fight threw)", false, e.message); }

console.log();
if (fails) { console.log("spaceRocks-selfcheck: " + fails + " FAILURES"); process.exit(1); }
console.log("spaceRocks-selfcheck: all checks pass");
