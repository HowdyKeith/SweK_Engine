// WebGLEngine/brain/battleshipDuel-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node brain/battleshipDuel-selfcheck.mjs      (about 60 fights)
//
// CAPITAL SHIP AGAINST CAPITAL SHIP, HELD TO ITS OWN ARITHMETIC AND PINNED TO THE NUMBERS IT GIVES. brain/battleshipDuel.mjs sets two sides -- a ship or a line of ships each, with escorts -- against each other in brain/spaceArena.mjs, in a geometry a seed fixes, and gives each the submarine duel's score. Eight things hold it:
//
//   1  THE SCENARIO IS THE SEED'S    the same seed is the same scenario and another seed another; over 40 seeds every kind is inside its stated box (range, elevation, where B is from A's nose, where B's nose points) and both beams occur; a line of ships is SHIP_SPACING apart, centred on the flagship, at right angles to its heading;
//                                    the escorts are 60-110 units out with their noses on the other flagship, and a fight without them starts where it did; a bad kind and bad counts are refused by name
//   2  A SIDE IS CHECKED             the defaults; every bad field refused by name; a seat takes the network its own id names, else its group's, else `network`, else the rule
//   3  THE BUILD IS WIRED            ids, teams and names; a side with no cannon never fires one and a side with one does; the sights' seeds are the craft's own
//   4  THE BROADSIDE HELM            no enemy: the rule's own answer; its torque is inside the hull's limit; it turns the ship beam-on and rolls the deck toward the enemy (the angles, pinned); without the roll the main battery of a ship whose enemy is below its deck never fires
//   5  THE SCORE                     scoreFor's closed forms; a fight's scores are scoreFor of its own hit points; the winner is the higher score by more than DECISIVE; the fight ends when a side's capital ships are gone
//   6  THE SAME FIGHT                twice is the same fingerprint; with the brain count off it is the same fight; the hand weights in every seat and the zero helm are the hand rules TO THE BIT while 'asked' counts them; a pair is antisymmetric and a side against itself leads by nothing
//   7  LIVE BRAINS                   the networks a side seats (13 seats and a helm a ship, an escort's pilot) and the peak asked in one tick is never more than were seated; a fleet's count
//   8  PEERS' BRAINS                 the shipped brain files are dealt to the seats, the helm and the escorts as the header says; a file for another policy, a truncated one, a second helm and plain junk are refused with a reason and seat nothing; the side fights
//   9  THE FINDINGS, PINNED          (seeds 1-2 of each kind, eight pairs a row) the bow-on rule beats the broadside rule; the GPU Brain's shipped hand against the fruit fly's
//
// SABOTAGE LOG (34 mutants, each applied to a COPY of brain/battleshipDuel.mjs with a copy of this gate importing it, the copies deleted by name; the number is how many rows went red):
//   S1 the nearest start is 400 3 | S2 the elevation is up to 0.3 3 | S3 the broadside is always to port 3 | S4 head-on: B's nose is not on A 2 | S5 crossing: B is not beam-on 3 | S6 the line is not centred 1 | S7 the escorts start up to 160 out 1 | S8 an escort's nose is along the flagships' line 1
//   S9 no enemy gives a copy of the rule 1 | S10 the lean is the wrong way 2 | S11 the roll is the wrong way 4 | S12 the helm's torque is not limited 1 | S13 the broadside helm cuts the engines 2 | S14 a seat's group is asked before its id 1 | S15 `network` is ignored 5 | S16 a side without the cannon has it 2
//   S17 every ship's sights share their seeds 2 (the pinned findings only) | S18 the kill bonus is given without the kill 5 | S19 losing the ship is rewarded 4 | S20 the fight runs until the arena is over 1 | S21 any lead wins 1 | S22 the speed bonus is for being slow 4 | S23 a pair adds the seats 3
//   S25 the tick's count is never reset 2 | S26 the count cannot be turned off for seats 1 | S27 a second helm takes the helm 1 | S28 every seat takes the first gunner 1 | S29 a refused file is seated 1 | S30 a fleet has one helm 2 | S31 every escort takes the first pilot 1
//   S32 a helm network drops the broadside rule 2 | S33 the damage is not over the side's hit points 4 | S34 B's escorts are team 1 too 1
// FOUR WENT 0 RED THE FIRST TIME. THREE WERE GAPS IN THE GATE, closed and re-run (the counts above are the re-run's): S21 -- no fight had a lead between 0 and 0.05, so the draw was never read (section 5 now cuts two fights short, one with the small lead on each side: the first row added had it on B's side only and the mutant, which is A's branch, still went 0 red); S29 -- the gate THREW instead of going red (a throw names no row: the bad files
// are now read through `safely`); S31 -- nothing looked at which escort flew which pilot (the zero-weights pilot of section 8 never fires). ONE WAS DEAD CODE IN THE MODULE, cut: S24 (a helm with no enemy is counted) -- the count asked `ctx.foe` first, and spaceArena.nearestFoe has no range limit, so a ship
// with a helm has an enemy for as long as the arena runs; the condition could not be false.
"use strict";
import fs from "node:fs";
import * as D from "./battleshipDuel.mjs";
import * as SA from "./spaceArena.mjs";
import * as BF from "./battleshipFight.mjs";
import * as CS from "../physics/mechanics/capitalShip.mjs";
import * as RB from "../physics/mechanics/rigidBody6dof.mjs";
import * as SG from "./seatGunnerPolicy.mjs";
import * as SM from "./seatGunnerMlp.mjs";
import * as HP from "./helmPolicy.mjs";
import * as P6 from "./pilot6dofPolicy.mjs";

let fails = 0;
function ok(name, cond, detail) { console.log(`  ${cond ? "PASS" : "FAIL"}  ${name}${detail ? "   " + detail : ""}`); if (!cond) fails++; }
const throwsWith = (f, re) => { try { f(); return false; } catch (e) { return re.test(e.message); } };
const J = (f) => JSON.parse(fs.readFileSync(new URL(f, import.meta.url), "utf8")), W = (f) => Float32Array.from(J(f).weights);
const sub = (a, b) => a.map((v, i) => v - b[i]), norm = (a) => Math.hypot(...a), wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const noseOf = (q) => RB.rotateByQuat(q, [1, 0, 0]);
const FACE = D.makeSide("face"), BEAM = D.makeSide("broadside", { helmRule: "broadside" });
const flyNet = { module: SG, weights: W("./seatGunnerWeightsDefault.json") }, mlpNet = { module: SM, weights: W("./seatGunnerMlpWeightsDefault.json") }, flyPilot = { module: P6, weights: W("./pilot6dofWeightsDefault-d18.json") };

console.log("battleshipDuel-selfcheck -- capital ship against capital ship\n");

console.log("1. THE SCENARIO IS THE SEED'S");
{
    ok("the same seed and kind is the same scenario, another seed and another kind are others", JSON.stringify(D.scenario(7, "head-on")) === JSON.stringify(D.scenario(7, "head-on")) && JSON.stringify(D.scenario(7, "head-on")) !== JSON.stringify(D.scenario(8, "head-on")) && D.scenario(7, "chase").range !== D.scenario(7, "head-on").range);
    const all = {}; for (const k of D.KINDS) all[k] = Array.from({ length: 40 }, (_, i) => D.scenario(i + 1, k));
    const every = Object.values(all).flat();
    ok("over 40 seeds of each kind: A's flagship is at the origin on the identity attitude, B's is 500-800 units away and within 0.2 rad of A's deck plane, at the range and the angles the scenario states", every.every((s) => norm(s.a.ships[0].pos) === 0 && s.a.ships[0].q.join() === "1,0,0,0" && s.range >= 500 && s.range <= 800 && Math.abs(s.elevation) <= 0.2 && Math.abs(norm(s.b.ships[0].pos) - s.range) < 1e-9 && Math.abs(Math.asin(s.b.ships[0].pos[2] / s.range) - s.elevation) < 1e-9 && Math.abs(wrap(Math.atan2(s.b.ships[0].pos[1], s.b.ships[0].pos[0]) - s.bearing)) < 1e-9));
    ok("... and the box is REACHED: ranges under 530 and over 770, elevations under -0.17 and over 0.17", every.some((s) => s.range < 530) && every.some((s) => s.range > 770) && every.some((s) => s.elevation < -0.17) && every.some((s) => s.elevation > 0.17));
    const noseB = (s) => noseOf(s.b.ships[0].q), toA = (s) => s.b.ships[0].pos.map((v) => -v / s.range);
    ok("head-on: B is within 0.3 rad of A's nose and its nose is on A to within 0.2 rad of yaw (and a deck that stays level)", all["head-on"].every((s) => Math.abs(s.bearing) <= 0.3 && Math.abs(wrap(s.headingB - s.bearing - Math.PI)) <= 0.2 + 1e-12 && Math.abs(noseB(s)[2]) < 1e-12 && Math.acos(noseB(s)[0] * toA(s)[0] + noseB(s)[1] * toA(s)[1] + noseB(s)[2] * toA(s)[2]) < 0.2 + 0.2 + 1e-9));
    ok("broadside: B is within 0.3 rad of A's beam, on A's heading to within 0.2 rad, and both beams occur", all.broadside.every((s) => Math.abs(Math.abs(s.bearing) - Math.PI / 2) <= 0.3 && Math.abs(s.headingB) <= 0.2) && all.broadside.some((s) => s.bearing > 0) && all.broadside.some((s) => s.bearing < 0));
    ok("crossing: B is within 0.3 rad of A's nose and beam-on to A's heading (90 degrees off it to within 0.2 rad), either way", all.crossing.every((s) => Math.abs(s.bearing) <= 0.3 && Math.abs(Math.abs(s.headingB) - Math.PI / 2) <= 0.2) && all.crossing.some((s) => s.headingB > 0) && all.crossing.some((s) => s.headingB < 0));
    ok("chase: B is within 0.3 rad of A's nose on A's heading to within 0.2 rad -- A looks at its stern", all.chase.every((s) => Math.abs(s.bearing) <= 0.3 && Math.abs(s.headingB) <= 0.2 && noseB(s)[0] > 0.98));
    const f3 = D.scenario(5, "broadside", { ships: 3 }), dirB = [-Math.sin(f3.headingB), Math.cos(f3.headingB), 0];
    ok("a line of three: 140 apart, centred on where the one ship was, at right angles to the heading in the deck plane, all on the flagship's attitude", f3.a.ships.map((s) => s.pos.join()).join(" ") === "0,-140,0 0,0,0 0,140,0" && f3.b.ships.every((s, k) => norm(sub(s.pos, D.scenario(5, "broadside").b.ships[0].pos.map((v, i) => v + dirB[i] * (k - 1) * 140))) < 1e-9 && s.q.join() === f3.b.ships[0].q.join()));
    const e = D.scenario(5, "head-on", { escorts: 6 }), plain = D.scenario(5, "head-on");
    ok("six escorts a side: 60-110 units from their flagship, on the enemy's side of it, nose on the enemy flagship to 1e-9; and the ships start where they do without them", JSON.stringify(e.a.ships) === JSON.stringify(plain.a.ships) && JSON.stringify(e.b.ships) === JSON.stringify(plain.b.ships) && e.a.escorts.length === 6 && e.b.escorts.length === 6
        && [[e.a, [0, 0, 0], e.b.ships[0].pos], [e.b, e.b.ships[0].pos, [0, 0, 0]]].every(([side, from, to]) => side.escorts.every((x) => { const d = norm(sub(x.pos, from)), l = sub(to, x.pos), n = noseOf(x.q); return d >= 60 && d <= 110 && norm(sub(to, x.pos)) < norm(sub(to, from)) && Math.abs(n[0] * l[0] + n[1] * l[1] + n[2] * l[2] - norm(l)) < 1e-9; })));
    ok("a kind that is not one, five ships and thirteen escorts are refused by name", throwsWith(() => D.scenario(1, "ramming"), /kind must be one of head-on, broadside, crossing, chase \(got ramming\)/) && throwsWith(() => D.scenario(1, "chase", { ships: 5 }), /ships must be a whole number from 1 to 4 a side \(got 5\)/) && throwsWith(() => D.scenario(1, "chase", { ships: 0 }), /ships must be/) && throwsWith(() => D.scenario(1, "chase", { escorts: 13 }), /escorts must be a whole number from 0 to 12 a side \(got 13\)/));
}

console.log("2. A SIDE IS CHECKED");
{
    ok("the defaults: regular gunners behind the hand rule (with the three shared numbers: gravity 0, reach 600, a one-second burst), the arena's own helm, the cannon, PD-autopilot escorts", FACE.gunners === "regular" && FACE.gunnerOptions.delay === 0.4 && FACE.gunnerOptions.gravity === 0 && FACE.gunnerOptions.maxRange === 600 && FACE.gunnerOptions.burst === 1 && FACE.network === null && FACE.seatNetworks === null && FACE.helmRule === "face" && FACE.helmNet === null && FACE.cannon === true && FACE.pilot === null && FACE.label === "face" && Object.isFrozen(FACE));
    ok("refused by name: no id, gunners that are not a setting, a helm rule that is not one, a network without its weights, a seat that does not exist, a helm that is a gunner, a pilot that is a helm, a cannon that is not a boolean",
        throwsWith(() => D.makeSide(""), /a side needs an id/) && throwsWith(() => D.makeSide("x", { gunners: "elite" }), /side "x": gunners must be one of perfect, ace, regular, green/) && throwsWith(() => D.makeSide("x", { helmRule: "ram" }), /helmRule must be one of face, broadside \(got ram\)/)
        && throwsWith(() => D.makeSide("x", { network: { module: SG, weights: new Float32Array(3) } }), /network must be \{ module/) && throwsWith(() => D.makeSide("x", { seatNetworks: { "main-z": null } }), /seatNetworks names "main-z", which is neither a seat/) && throwsWith(() => D.makeSide("x", { seatNetworks: { main: { module: SG } } }), /seatNetworks\["main"\] must be/)
        && throwsWith(() => D.makeSide("x", { helmNet: flyNet }), /helmNet must be \{ module \(a helm library/) && throwsWith(() => D.makeSide("x", { pilot: { module: HP, weights: HP.handWeights() } }), /pilot must be \{ module \(a 6DOF pilot library/) && throwsWith(() => D.makeSide("x", { cannon: 1 }), /cannon is true or false/));
    const s = D.makeSide("mixed", { network: flyNet, seatNetworks: { main: mlpNet, "main-b": null, "pd-p1": mlpNet } });
    ok("a seat takes the network its own id names (main-b: the rule; pd-p1: the GPU Brain's), else its group's (main-a: the GPU Brain's), else `network` (pd-p2: the fruit fly's), else the rule", D.seatNetOf(s, "main-b") === null && D.seatNetOf(s, "pd-p1") === mlpNet && D.seatNetOf(s, "main-a") === mlpNet && D.seatNetOf(s, "pd-p2") === flyNet && D.seatNetOf(FACE, "main-a") === null);
}

console.log("3. THE BUILD IS WIRED");
{
    const b = D.build(D.makeSide("red", { label: "Red" }), D.makeSide("blue", { cannon: false }), 3, "head-on", { ships: 2, escorts: 3, seconds: 77 }), c = b.arena.crafts;
    ok("two ships and three escorts a side: ids 1-2 are A's ships, 3-4 B's, 5-7 A's escorts, 8-10 B's; team 1 is A; the names carry the side's label; the time limit reaches the arena", c.map((x) => `${x.id}:${x.team}:${x.kind[0]}`).join(" ") === "1:1:c 2:1:c 3:2:c 4:2:c 5:1:f 6:1:f 7:1:f 8:2:f 9:2:f 10:2:f" && c[0].name === "Red ship 1" && c[3].name === "blue ship 2" && c[4].name === "Red escort 1" && b.arena.seconds === 77 && JSON.stringify(b.shipIds) === "[[1,2],[3,4]]");
    ok("every craft starts where the scenario put it", c.slice(0, 2).every((x, k) => x.body.pos.join() === b.scenario.a.ships[k].pos.join()) && c.slice(2, 4).every((x, k) => x.body.pos.join() === b.scenario.b.ships[k].pos.join() && x.body.q.join() === b.scenario.b.ships[k].q.join()) && c.slice(7).every((x, k) => x.body.pos.join() === b.scenario.b.escorts[k].pos.join()));
    ok("a side without the cannon has a cannon that never finishes charging, and the other side's is the ship's own (12 s)", c[2].ship.waveGun.charge === Infinity && c[3].ship.waveGun.charge === Infinity && c[0].ship.waveGun.charge === 12 && c[0].ship.waveGun.damage === 400);
    const withC = D.duel(FACE, FACE, 1, "head-on"), noB = D.duel(FACE, D.makeSide("nc", { cannon: false }), 1, "head-on");
    ok("!! head-on, seed 1: two bow-on ships with cannons both fire them; take B's away and B fires none while A still does", withC.waves[0] > 0 && withC.waves[1] > 0 && noB.waves[1] === 0 && noB.waves[0] > 0, `waves ${withC.waves} and ${noB.waves}`);
}

console.log("4. THE BROADSIDE HELM");
{
    const SHIP = CS.createCapitalShip(), body = (o = {}) => ({ ...RB.createBody({ mass: SHIP.mass, I: [...SHIP.I] }), ...o }), rule = { torque: [1, 2, 3], thrust: 450 }, helm = D.broadsideHelm();
    ok("with no enemy the rule's own answer is handed back (the same object)", helm(rule, { body: body(), ship: SHIP, foe: null }) === rule);
    const lim = SHIP.I.map((i) => i * SHIP.maxAlpha), outs = [[600, 0, 0], [0, 600, 0], [-300, 40, -200], [100, -100, 100]].map((p) => helm(rule, { body: body({ w: [0.3, -0.2, 0.1] }), ship: SHIP, foe: { body: { pos: p, vel: [0, 0, 0] } } }));
    ok("its torque is inside the hull's limit on every axis and its thrust is the rule's", outs.every((o) => o.thrust === 450 && o.torque.every((t, i) => Math.abs(t) <= lim[i] + 1e-9)) && outs.some((o) => o.torque.some((t, i) => Math.abs(Math.abs(t) - lim[i]) < 1e-9)));
    const far = helm(rule, { body: body(), ship: SHIP, foe: { body: { pos: [0, 900, 0], vel: [0, 0, 0] } } }), nearF = helm(rule, { body: body(), ship: SHIP, foe: { body: { pos: [0, 100, 0], vel: [0, 0, 0] } } });
    ok("an enemy abeam to port and FAR (900) turns the nose toward it (a positive torque about the deck's axis); one abeam and NEAR (100) turns it away", far.torque[2] > 0 && nearF.torque[2] < 0, `${far.torque[2].toFixed(1)} and ${nearF.torque[2].toFixed(1)}`);
    const below = helm(rule, { body: body(), ship: SHIP, foe: { body: { pos: [0, 300, -100], vel: [0, 0, 0] } } }), noRoll = D.broadsideHelm({ roll: null })(rule, { body: body(), ship: SHIP, foe: { body: { pos: [0, 300, -100], vel: [0, 0, 0] } } }), stbd = helm(rule, { body: body(), ship: SHIP, foe: { body: { pos: [0, -300, -100], vel: [0, 0, 0] } } });
    ok("an enemy to port and BELOW the deck rolls the ship one way and one to starboard and below the other (the deck goes toward the enemy), and with `roll: null` nothing is asked about the nose axis", below.torque[0] < 0 && stbd.torque[0] > 0 && noRoll.torque[0] === 0, `${below.torque[0].toFixed(1)}, ${stbd.torque[0].toFixed(1)}, ${noRoll.torque[0]}`);
    // in a fight: the angles over the last half of a broadside-against-bow-on fight
    const fly = (side) => { const b = D.build(side, D.makeSide("f", { cannon: false }), 1, "head-on"), a = b.arena, A = a.crafts[0], B = a.crafts[1]; let off = 0, el = 0, n = 0; while (!a.done && !A.dead && !B.dead) { SA.stepSpaceArena(a); if (a.t > 20) { const lb = RB.rotateByQuat([A.body.q[0], -A.body.q[1], -A.body.q[2], -A.body.q[3]], sub(B.body.pos, A.body.pos)), d = norm(lb); off += Math.acos(lb[0] / d); el += Math.asin(lb[2] / d); n++; } } return { off: off / n, el: el / n, mains: A.seats.slice(0, 3).reduce((x, s) => x + s.state.gun.fired, 0) }; };
    const rolled = fly(D.makeSide("b", { helmRule: "broadside", cannon: false }));
    ok("!! head-on, seed 1, after 20 s: the broadside ship holds its enemy well off its nose and ABOVE its deck, and its main battery fires", rolled.off > 0.5 && rolled.el > 0 && rolled.mains > 30, `${rolled.off.toFixed(2)} rad off the nose, ${rolled.el.toFixed(2)} rad above the deck, ${rolled.mains} main rounds`);
}

console.log("5. THE SCORE");
{
    ok("scoreFor: nothing happened is 0; 300 dealt and 150 taken of 1,500 is 0.1; a kill at half time is +0.75; losing the ship is -0.5; both gone at the bell is 0", D.scoreFor(0, 0, false, false, 0.4, 1500) === 0 && Math.abs(D.scoreFor(300, 150, false, false, 0.5, 1500) - 0.1) < 1e-12 && D.scoreFor(1500, 0, true, false, 0.5, 1500) === 1.75 && D.scoreFor(0, 1500, false, true, 0.5, 1500) === -1.5 && D.scoreFor(1500, 1500, true, true, 0, 1500) === 0);
    const d = D.duel(FACE, BEAM, 2, "crossing"), left = Math.max(0, 1 - d.t / 180);
    ok("a fight's scores are scoreFor of its own numbers, the damage and the hit points left add up to 1,500 a side, and the winner is the higher score by more than 0.05", Math.abs(d.scores[0] - D.scoreFor(d.damage[0], d.damage[1], d.lost[1] === 1, d.lost[0] === 1, left, 1500)) < 1e-12 && Math.abs(d.scores[1] - D.scoreFor(d.damage[1], d.damage[0], d.lost[0] === 1, d.lost[1] === 1, left, 1500)) < 1e-12 && d.hp[0] + d.damage[1] === 1500 && d.hp[1] + d.damage[0] === 1500 && d.score === d.scores[0] && d.winner === (d.scores[0] - d.scores[1] > 0.05 ? "A" : d.scores[1] - d.scores[0] > 0.05 ? "B" : "draw"), `scores ${d.scores.map((x) => x.toFixed(3))}, winner ${d.winner}`);
    ok("... it ended when a side's ship was gone, before the three minutes", d.lost[0] + d.lost[1] >= 1 && d.t < 180 && d.ticks === Math.round(d.t * 30));
    let last = null; const e = D.duel(FACE, FACE, 4, "chase", { escorts: 2, seconds: 300, onTick: (a) => { last = a; if (a.i === 1) a.crafts[1].hp = 0; } });   // B's flagship is struck out by hand after the first tick: the natural fights never leave an escort flying (see the findings)
    ok("with escorts, a fight ends when a side has no capital ship flying although four escorts fly on and the arena itself is not over: two ticks, B's ship lost, the kill bonus and nearly all of the speed bonus to A", e.lost.join() === "0,1" && e.ticks === 2 && e.escortsLost.join() === "0,0" && last.done === false && e.winner === "A" && Math.abs(e.scores[0] - (1 + 0.5 + 0.5 * (1 - e.t / 300))) < 1e-12 && Math.abs(e.scores[1] - (-1 - 0.5)) < 1e-12, `t ${e.t.toFixed(3)}, scores ${e.scores.map((x) => x.toFixed(3))}`);
    const close = D.duel(FACE, BEAM, 2, "head-on", { seconds: 8 });
    const closeA = D.duel(FACE, BEAM, 3, "crossing", { seconds: 12 });
    ok("a lead that is not more than 0.05 is a DRAW, whichever side has it: head-on, seed 2, cut at eight seconds, 320 hit points dealt against 350 is 0.04 to B; crossing, seed 3, cut at twelve, 200 against 190 is 0.013 to A", close.damage.join() === "320,350" && Math.abs(close.scores[1] - close.scores[0] - 0.04) < 1e-12 && close.winner === "draw" && closeA.damage.join() === "200,190" && closeA.scores[0] > closeA.scores[1] && closeA.winner === "draw");
    const short = D.duel(FACE, FACE, 1, "broadside", { seconds: 5 });
    ok("a fight cut at five seconds ends at the bell with both ships flying and no bonus: the two scores are each other's negative", short.lost.join() === "0,0" && Math.abs(short.t - 5) < 0.04 && Math.abs(short.scores[0] + short.scores[1]) < 1e-12);
}

console.log("6. THE SAME FIGHT");
{
    const a = D.duel(BEAM, FACE, 3, "broadside"), b = D.duel(BEAM, FACE, 3, "broadside");
    ok("the same fight twice is the same result to the bit, and another seed is another fight", JSON.stringify(a) === JSON.stringify(b) && a.fingerprint !== D.duel(BEAM, FACE, 4, "broadside").fingerprint);
    const hands = D.makeSide("hands", { helmRule: "broadside", network: { module: SG, weights: SG.handWeights() }, helmNet: { module: HP, weights: HP.handWeights() } }), n = D.duel(hands, FACE, 3, "broadside"), off = D.duel(hands, FACE, 3, "broadside", { countBrains: false });
    ok("!! the fruit fly's HAND weights in thirteen seats and the zero helm are the hand rules to the bit (the fingerprint, the scores, the rounds) -- and they were asked", n.fingerprint === a.fingerprint && JSON.stringify(n.scores) === JSON.stringify(a.scores) && n.rounds.join() === a.rounds.join() && n.brains.asked > 1000 && a.brains.asked === 0, `asked ${n.brains.asked} times in ${n.ticks} ticks`);
    ok("with the brain count off it is the same fight and nothing is counted", off.fingerprint === n.fingerprint && off.brains.asked === 0 && off.brains.peak === 0);
    const p = D.pair(BEAM, FACE, 2, "crossing"), q = D.pair(FACE, BEAM, 2, "crossing"), self = D.pair(FACE, FACE, 2, "crossing");
    ok("a pair is the two seats: X's lead is the negative of Y's, the seat's worth is the same either way, and a side against itself leads by nothing", p.lead === -q.lead && p.seat === q.seat && self.lead === 0 && p.first.fingerprint === q.second.fingerprint, `lead ${p.lead.toFixed(3)}, seat A worth ${p.seat.toFixed(3)}`);
}

console.log("7. LIVE BRAINS");
{
    const full = D.makeSide("full", { network: flyNet, helmNet: { module: HP, weights: HP.handWeights() }, pilot: flyPilot }), part = D.makeSide("part", { seatNetworks: { main: mlpNet } });
    ok("seated: a ship with a network in every seat and at the helm is 14, two of them with four escorts 32; the three turrets alone are 3 a ship; the hand rules are none", JSON.stringify(D.seatedBrains(full)) === '{"seats":13,"helms":1,"pilots":0,"total":14}' && D.seatedBrains(full, { ships: 2, escorts: 4 }).total === 32 && D.seatedBrains(part, { ships: 2, escorts: 4 }).total === 6 && D.seatedBrains(FACE, { ships: 4, escorts: 12 }).total === 0);
    const d = D.duel(full, part, 2, "head-on", { ships: 2, escorts: 4 });
    ok("!! two ships and four escorts a side, 32 networks against 6: the count is what was seated, the most asked in one tick is never more than that and more than the escorts and helms alone, and the mean is under the peak", d.brains.seated.join() === "32,6" && d.brains.peak <= 38 && d.brains.peak > 10 && d.brains.mean < d.brains.peak && d.brains.mean > 1 && Math.abs(d.brains.mean - d.brains.asked / d.ticks) < 1e-12, `peak ${d.brains.peak} of 38 seated, mean ${d.brains.mean.toFixed(1)} a tick, ${d.brains.asked} forward passes in ${d.ticks} ticks`);
}

console.log("8. PEERS' BRAINS");
{
    const fly = J("./seatGunnerWeightsDefault.json"), mlp = J("./seatGunnerMlpWeightsDefault.json"), pil = J("./pilot6dofWeightsDefault-d18.json"), pm = J("./pilot6dofMlpWeightsDefault.json"), helm = { ...pil, policy: "helmPolicy", weights: Array.from(HP.handWeights()), by: "a peer's helm" };
    const r = D.sideFromBrains("peers", [fly, mlp, helm, pil, pm], { helmRule: "broadside" }), ids = CS.createCapitalShip().seats.map((s) => s.id);
    ok("five files, five seated: the two gunners are dealt round the thirteen seats in turn (seven and six), the helm takes the helm, the two pilots the escorts in turn", r.refused.length === 0 && r.seated.length === 5 && r.seated[0].where.join() === ids.filter((_, k) => k % 2 === 0).join() && r.seated[1].where.join() === ids.filter((_, k) => k % 2 === 1).join() && r.seated[2].where.join() === "helm" && r.seated[3].role === "pilot" && r.side.pilots.length === 2 && r.side.pilots[0].module === P6 && r.side.helmRule === "broadside" && r.side.helmNet.module === HP && D.seatNetOf(r.side, "main-a").module === SG && D.seatNetOf(r.side, "main-b").module === SM && r.seated[0].by === fly.by);
    const safely = (f) => { try { return f(); } catch (e) { return { seated: [], refused: [], side: { seatNetworks: e.message, pilots: e.message } }; } };   // a sideFromBrains that throws on a bad file is a red row, not a gate that stops
    const bad = safely(() => D.sideFromBrains("bad", [{ ...fly, policy: "drivePolicy" }, { ...mlp, weights: [1, 2] }, helm, helm, null, 7, { ...fly, weights: fly.weights.map((v, i) => (i ? v : 1e40)) }, { ...fly, format: "swek-brain-v0" }]));
    ok("refused with a reason, seating nothing: another policy's brain, a truncated one, a SECOND helm, null, a number, a weight that overflows a float32, another format -- one helm of eight files is seated and the side has no seat network", bad.seated.length === 1 && bad.seated[0].role === "helm" && bad.refused.map((x) => x.index).join() === "0,1,3,4,5,6,7" && bad.side.seatNetworks === null && bad.side.pilots === null
        && /policy "drivePolicy"/.test(bad.refused[0].reason) && /weight count 2 does not match/.test(bad.refused[1].reason) && /one helm and an earlier brain took it/.test(bad.refused[2].reason) && /overflows/.test(bad.refused[5].reason) && /unknown format/.test(bad.refused[6].reason));
    ok("what is not an array is refused by name", throwsWith(() => D.sideFromBrains("x", fly), /the brains are an array of exported brains/));
    const two = D.sideFromBrains("two", [pil, { ...pil, weights: Array.from(P6.zeroWeights()), by: "a pilot that does nothing" }]), tb = D.build(two.side, FACE, 2, "head-on", { escorts: 4, seconds: 20 }); SA.runSpaceArena(tb.arena);
    const firedA = tb.arena.crafts.filter((c) => c.kind === "fighter" && c.team === 1).map((c) => c.gun.fired);
    ok("two pilots are dealt round four escorts in turn: the first and the third fly the shipped pilot and fire, the second and the fourth fly the zero weights and never do", firedA.join() === "3,0,26,0" && two.seated.map((x) => x.where.join()).join(" | ") === "escort 1 of every 2 | escort 2 of every 2", `rounds fired ${firedA}`);
    const d = D.duel(r.side, FACE, 3, "head-on", { escorts: 4 });
    ok("!! the peers' side fights: 13 seats, a helm and four escorts are 18 networks seated, and they are asked", d.brains.seated.join() === "18,0" && d.brains.asked > 500 && d.brains.peak <= 18, `peak ${d.brains.peak}, ${d.brains.asked} forward passes, scores ${d.scores.map((x) => x.toFixed(2))}`);
}

console.log("9. THE FINDINGS, PINNED (seeds 1-2 of each kind: eight pairs, sixteen fights a row)");
{
    const row = (X, Y) => { let w = 0, l = 0, lead = 0; for (const kind of D.KINDS) for (const seed of [1, 2]) { const p = D.pair(X, Y, seed, kind); lead += p.lead; w += p.lead > D.DECISIVE ? 1 : 0; l += p.lead < -D.DECISIVE ? 1 : 0; } return { w, l, lead: lead / 8 }; };
    const a = row(FACE, BEAM);
    ok("!! THE BOW-ON RULE BEATS THE BROADSIDE RULE: the arena's own helm wins seven pairs of eight against the hand broadside helm and loses none (a bow-on hull is a small target and its cannon bears)", a.w === 7 && a.l === 0 && Math.abs(a.lead - 2.074) < 0.0005, `${a.w} won, ${a.l} lost, mean lead ${a.lead.toFixed(3)}`);
    const g = row(D.makeSide("gpu", { network: mlpNet }), D.makeSide("fly", { network: flyNet }));
    ok("!! THE GPU BRAIN'S SHIPPED HAND AGAINST THE FRUIT FLY'S, both bow-on behind regular sights (neither was trained against a ship or behind this sight): the GPU Brain's wins seven pairs of eight and loses none", g.w === 7 && g.l === 0 && Math.abs(g.lead - 1.012) < 0.0005, `${g.w} won, ${g.l} lost, mean lead ${g.lead.toFixed(3)}`);
    ok("the report lines say real numbers", D.reportLines().length === 2 && /\d+ pairs won, \d+ lost of 8, mean lead -?\d\.\d{3}/.test(D.reportLines()[1]));
    ok("the front door: the export list", Object.keys(D).sort().join() === "BROADSIDE_LEAN,BROADSIDE_RANGE,BROADSIDE_ROLL,BROADSIDE_SLOPE,DECISIVE,HELM_RULES,KILL_BONUS,KINDS,LOSS,MAX_ESCORTS,MAX_SHIPS,PEER_POLICIES,RANGE,SECONDS,SHIP_SPACING,SPEED_BONUS,broadsideHelm,build,duel,makeSide,pair,quatYaw,reportLines,scenario,scoreFor,seatNetOf,seatedBrains,sideFromBrains");
}

console.log(`\n${fails === 0 ? "ALL PASS" : fails + " FAILED"}`);
process.exit(fails === 0 ? 0 : 1);
