// WebGLEngine/brain/jetFight-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node brain/jetFight-selfcheck.mjs      (~40 s)
//
// THE JETS' DOGFIGHT, HELD TO THE TRAINERS' AND TO WHAT IT WAS BUILT TO FIND. brain/jetFight.mjs is numbers and a transform over brain/dogfightTask.mjs's fight, so this gate holds three things: that the numbers are the ones the header gives and the scenarios are EXACTLY the trainer's at jet scale; that the fights
// they make are real (nobody under 700 m, nobody stalled, nobody lost, the same fight through the steppable arena to the bit); and that each of the guide's two additions earns its place -- by taking it out and watching the fights it was added for stop being won. The measured numbers are pinned, so a change anywhere
// under them (the jet's wing, the engine, the pilot's gains, the gun) is a red row that names the fight it moved.
//
//   1  THE GUN AND THE GUIDE   frozen, every field; the guide is dogfightTask.GUIDE with exactly twelve fields changed; the boresight is the jet's trim angle of attack at 150 m/s (0.012) and the lead is the pilot's heading time constant (2.5 s)
//   2  THE SCENARIOS          dogfightTask.scenario(seed, kind) at jet scale, EXACTLY: lengths x 3.1, speeds x 140/45, altitude 2,000 m, turn rates x 0.8, headings and attitudes untouched; the ranges that follow; the sets are the trainer's sets
//   3  THE FIGHTS             the 24 fights and the 120 of the bench: the pinned scores by kind, every straight and turning fight a kill, nobody lost, grounded or collided, the altitude, angle of attack and closest approach bounded
//   4  THE GUIDE EARNS ITS PLACE   the trainer's own guide in the same fights (the jet fires nothing in the tail, offset and turning fights and three are lost); the angle-of-attack trim taken out (the turning fights drop by a quarter); the lead 0, 2 and 3.5 s (no turning fight hit: the window is about 0.3 s)
//   5  THE PILOT              the cruise gains in seat A against the fighting gains in seat B: the same straight fights, no turning fight, a lost duel -- the four numbers of AUTOPILOT_JET_FIGHT are the reason
//   6  THE ARENA IS THE SAME FIGHT   24 fights through dogfightArena (with the jet's model, gun and guide) and through duel(): every number identical to the bit; and the fingerprints of four fights are pinned
//   7  THE FRONT DOOR
//
// SABOTAGE LOG -- (filled in below once run)
"use strict";
import * as J from "./jetFight.mjs";
import * as D from "./dogfightTask.mjs";
import * as A from "./dogfightArena.mjs";
import * as AF from "./autopilotFlight.mjs";
import * as G from "../physics/mechanics/flightGuns.mjs";
import * as F from "../physics/mechanics/flightModel6dof.mjs";

let fails = 0;
function ok(name, cond, detail) { console.log(`  ${cond ? "PASS" : "FAIL"}  ${name}${detail ? "   " + detail : ""}`); if (!cond) fails++; }
const sec = (t) => console.log("\n" + t);
const near = (a, b, eps = 1e-9) => Math.abs(a - b) <= eps;
const throws = (fn) => { try { fn(); return null; } catch (e) { return e.message; } };
const R2D = 180 / Math.PI;
const W = (o) => Object.freeze({ ...J.GUIDE_JET, ...o });
/** The angle of attack the flight model gives the jet trimmed at V m/s and 2,000 m. */
const alphaAt = (V) => { const jet = AF.jetModel(), t = F.trim(jet, V, { altitude: 2000 }); return F.attitude(F.createState({ pos: [0, 0, 2000], speed: V, pitch: t.pitchAttitude, mass: jet.mass, inertia: jet.inertia })).alpha; };

console.log("jetFight-selfcheck -- the jets' dogfight, guns only\n");

sec("1. THE GUN AND THE GUIDE");
{
    const g = J.JET_GUN;
    ok("!! THE GUN IS A NOSE CANNON'S, frozen: 800 m/s, 15 rounds a second, 300 rounds, a muzzle 3 m ahead of the centre of mass, a boresight of -0.012 rad, a round that lives 1.5 s, a hit sphere of 6 m, 1 damage a hit and 20 hit points; no field is the trainer's except the rate, the magazine, the damage and the hit points", Object.isFrozen(g) && Object.isFrozen(g.muzzle) && g.muzzleSpeed === 800 && g.rate === 15 && g.magazine === 300 && g.muzzle.join() === "3,0,0" && g.boresight === -0.012 && g.life === 1.5 && g.hitRadius === 6 && g.damage === 1 && g.hp === 20 && Object.keys(g).length === 9
        && g.muzzleSpeed !== G.GUN.muzzleSpeed && g.muzzle[0] !== G.GUN.muzzle[0] && g.boresight !== G.GUN.boresight && g.life !== G.GUN.life && g.hitRadius !== G.GUN.hitRadius && g.rate === G.GUN.rate && g.magazine === G.GUN.magazine && g.damage === G.GUN.damage && g.hp === G.GUN.hp);
    ok("!! THE BORESIGHT IS THE JET'S ANGLE OF ATTACK AT TRIM, taken from the flight model and not from the header: the nose is 0.018 rad above the path at 140 m/s and 2,000 m, 0.0055 at 160, and the boresight (-0.012) is its value at 150 m/s to 0.001 -- a gun fixed along the nose points along the flight path in the cruise", near(-g.boresight, (alphaAt(140) + alphaAt(160)) / 2, 1e-3) && near(alphaAt(140), 0.0179, 5e-4) && near(alphaAt(160), 0.0055, 5e-4) && alphaAt(120) > 0.03 && alphaAt(175) < 0.001, `140 m/s ${alphaAt(140).toFixed(4)}, 150 ${alphaAt(150).toFixed(4)}, 160 ${alphaAt(160).toFixed(4)}`);
    const keys = Object.keys(D.GUIDE), changed = keys.filter((k) => JSON.stringify(J.GUIDE_JET[k]) !== JSON.stringify(D.GUIDE[k])).sort();
    ok("!! THE GUIDE IS THE TRAINER'S WITH TWELVE FIELDS CHANGED, frozen, and nothing added: the altitude floor 500, the trigger range 650, the speeds 110..190, the standoff 300, the break-off 300 m / 40 m/s / 90 m of climb, the keep-out 80 m / 3 m/s, the collision range 8 m, the angle-of-attack trim ON and the lead 2.5 s; the trigger's tolerance (1 radius), the closing law's gain (0.04) and the break-off's 0.9 rad are the trainer's", Object.isFrozen(J.GUIDE_JET) && Object.isFrozen(J.GUIDE_JET.speedLimits) && Object.keys(J.GUIDE_JET).sort().join() === keys.slice().sort().join() && changed.join() === "alphaTrim,breakClimb,breakClosing,breakRange,collisionRange,keepOutClosing,keepOutRange,leadTime,maxRange,minAltitude,speedLimits,standoff"
        && J.GUIDE_JET.minAltitude === 500 && J.GUIDE_JET.maxRange === 650 && J.GUIDE_JET.speedLimits.join() === "110,190" && J.GUIDE_JET.standoff === 300 && J.GUIDE_JET.breakRange === 300 && J.GUIDE_JET.breakClosing === 40 && J.GUIDE_JET.breakClimb === 90 && J.GUIDE_JET.keepOutRange === 80 && J.GUIDE_JET.keepOutClosing === 3 && J.GUIDE_JET.collisionRange === 8 && J.GUIDE_JET.alphaTrim === true && J.GUIDE_JET.leadTime === 2.5
        && J.GUIDE_JET.fireTolerance === 1 && J.GUIDE_JET.speedGain === 0.04 && J.GUIDE_JET.breakTurn === 0.9);
    ok("!! THE LEAD IS THE PILOT'S OWN TIME CONSTANT (the guide's 2.5 s is AUTOPILOT_JET_FIGHT's tauHeading, whatever it is changed to) and the trigger range puts the hit sphere at the angle the trainer's does (6 m at 650 m is 0.0092 rad; 4 m at 450 m, 0.0089: within 5%)", J.GUIDE_JET.leadTime === AF.AUTOPILOT_JET_FIGHT.tauHeading && Math.abs(J.JET_GUN.hitRadius / J.GUIDE_JET.maxRange / (G.GUN.hitRadius / D.MAX_RANGE) - 1) < 0.05);
    ok("!! JET_OPTS IS WHAT MAKES A FIGHT A JET'S, frozen: the jet's flight model (the one object AF.jetModel() returns), its gun on both sides, its guide and the fighting pilot in seat B -- and duel() and evaluate() add nothing else: duel() with no options is duel() with JET_OPTS", Object.isFrozen(J.JET_OPTS) && J.JET_OPTS.model === AF.jetModel() && J.JET_OPTS.spec === J.JET_GUN && J.JET_OPTS.specB === J.JET_GUN && J.JET_OPTS.guide === J.GUIDE_JET && J.JET_OPTS.pilotB === AF.jetFightPilot && Object.keys(J.JET_OPTS).sort().join() === "guide,model,pilotB,spec,specB"
        && D.duel(AF.jetFightPilot, J.scenario(2, "duel"), J.JET_OPTS).fingerprint === J.duel(AF.jetFightPilot, J.scenario(2, "duel")).fingerprint && J.scenario(2, "duel").seed === 2);
    ok("the scale constants: lengths x 3.1, speeds x 140/45, turn rates x 0.8, the fight at 2,000 m", J.SCALE === 3.1 && J.SPEED_SCALE === 140 / 45 && J.TURN_SCALE === 0.8 && J.ALTITUDE === 2000);
}

sec("2. THE SCENARIOS ARE THE TRAINER'S, SCALED");
{
    const kinds = D.KINDS, seeds = Array.from({ length: 40 }, (_, i) => i + 1);
    let bad = [];
    for (const k of kinds) for (const s of seeds) {
        const t = D.scenario(s, k), j = J.scenario(s, k);
        for (const side of ["a", "b"]) {
            const p = t[side], q = j[side];
            if (!(near(q.pos[0], p.pos[0] * 3.1, 1e-9) && near(q.pos[1], p.pos[1] * 3.1, 1e-9) && near(q.pos[2], 2000 + (p.pos[2] - 300) * 3.1, 1e-9) && near(q.speed, p.speed * 140 / 45, 1e-9) && q.heading === p.heading && q.pitch === p.pitch && q.bank === p.bank && q.gamma === p.gamma)) bad.push(`${k}${s}.${side}`);
        }
        const o = t.opponent, p = j.opponent;
        if (!(p.kind === o.kind && p.fires === o.fires && near(p.rate, o.rate * 0.8, 1e-12))) bad.push(`${k}${s}.opponent`);
        if (!(j.seed === s && j.kind === k && Object.isFrozen(j) && Object.isFrozen(j.a) && Object.isFrozen(j.b) && Object.isFrozen(j.opponent) && Object.isFrozen(j.a.pos))) bad.push(`${k}${s}.shape`);
    }
    ok("!! A JET SCENARIO IS THE TRAINER'S SCENARIO TRANSFORMED, EXACTLY: for all four kinds and seeds 1..40 both aircraft's x and y are 3.1 times the trainer's, the height is 2,000 + 3.1 (z - 300), the speed 140/45 times, the heading, pitch, bank and flight-path angle the same, and the opponent has the same kind and trigger and 0.8 of the turn rate; every scenario frozen down to the position", bad.length === 0, bad.slice(0, 4).join(" "));
    const all = kinds.flatMap((k) => seeds.map((s) => J.scenario(s, k)));
    const tails = all.filter((s) => s.kind === "tail" || s.kind === "turning");
    ok("!! TAIL AND TURNING: A starts 775..1,395 m behind B along B's heading (within 93 m to the side), within 78 m of B's height, B at 133.8..146.2 m/s and 2,000 m +- 124, A at 124..156 m/s; a turning B turns at 0.04..0.072 rad/s to either side", tails.every((s) => { const f = [Math.cos(s.b.heading), -Math.sin(s.b.heading)], d = [s.b.pos[0] - s.a.pos[0], s.b.pos[1] - s.a.pos[1]], along = d[0] * f[0] + d[1] * f[1], side = Math.abs(-d[0] * f[1] + d[1] * f[0]); return along >= 775 - 1e-6 && along <= 1395 + 1e-6 && side <= 93 + 1e-6 && Math.abs(s.a.pos[2] - s.b.pos[2]) <= 77.5 + 1e-6 && s.b.speed >= 43 * 140 / 45 - 1e-9 && s.b.speed <= 47 * 140 / 45 + 1e-9 && s.a.speed >= 40 * 140 / 45 - 1e-9 && s.a.speed <= 50 * 140 / 45 + 1e-9 && Math.abs(s.b.pos[2] - 2000) <= 124 + 1e-9; })
        && all.filter((s) => s.kind === "turning").every((s) => Math.abs(s.opponent.rate) >= 0.04 - 1e-12 && Math.abs(s.opponent.rate) <= 0.072 + 1e-12) && all.filter((s) => s.kind === "turning").some((s) => s.opponent.rate > 0) && all.filter((s) => s.kind === "turning").some((s) => s.opponent.rate < 0));
    const duels = all.filter((s) => s.kind === "duel");
    ok("!! DUEL: the aircraft start 2,170..3,170 m apart (the trainer's 700..1,000 m along the line of approach and 80..220 m to the side, times 3.1) facing each other, and B hunts and shoots", duels.every((s) => { const d = Math.hypot(s.b.pos[0] - s.a.pos[0], s.b.pos[1] - s.a.pos[1]); return d >= Math.hypot(700, 80) * 3.1 - 1e-6 && d <= Math.hypot(1000, 220) * 3.1 + 1e-6 && s.opponent.kind === "hunt" && s.opponent.fires === true; }));
    ok("an unknown kind is refused by the trainer's own message, and the default kind is a tail fight", /unknown kind "ambush"/.test(throws(() => J.scenario(1, "ambush")) || "") && J.scenario(5).kind === "tail");
    const ids = (set) => set.map((s) => s.kind + s.seed).join();
    ok("!! THE SETS ARE THE TRAINER'S SETS AT JET SCALE: JET_FIGHT_SET is DOGFIGHT_SET's 24 fights (six of each kind, seeds 1..6) and JET_BENCH_SET is DOGFIGHT_BENCH_SET's 120 (sixty duels and sixty turning fights, seeds 100..159), in the same order, frozen, each fight the jet scenario of that seed and kind", J.JET_FIGHT_SET.length === 24 && J.JET_BENCH_SET.length === 120 && ids(J.JET_FIGHT_SET) === ids(D.DOGFIGHT_SET) && ids(J.JET_BENCH_SET) === ids(D.DOGFIGHT_BENCH_SET) && Object.isFrozen(J.JET_FIGHT_SET) && Object.isFrozen(J.JET_BENCH_SET) && J.JET_FIGHT_SET.every((s) => JSON.stringify(s) === JSON.stringify(J.scenario(s.seed, s.kind))) && J.JET_BENCH_SET.every((s) => JSON.stringify(s) === JSON.stringify(J.scenario(s.seed, s.kind))));
}

sec("3. THE FIGHTS");
const fightSet = J.evaluate(AF.jetFightPilot, J.JET_FIGHT_SET), benchSet = J.evaluate(AF.jetFightPilot, J.JET_BENCH_SET);
{
    const r = fightSet, rs = r.results;
    ok("!! THE JET'S FIGHTING PILOT AGAINST ITSELF ON THE 24 FIGHTS IS PINNED: tail 1.107245, offset 1.103333, turning 1.119213, duel 0.259861 (the mean 0.897413), 447 hits landed on 652 rounds and 60 taken, 19 kills, nobody lost; the straight and turning fights are all kills (a score over 1.05) and no duel is a kill but one", near(r.score, 0.897413, 5e-7) && near(r.byKind.tail, 1.107245, 5e-7) && near(r.byKind.offset, 1.103333, 5e-7) && near(r.byKind.turning, 1.119213, 5e-7) && near(r.byKind.duel, 0.259861, 5e-7) && r.dealt === 447 && r.taken === 60 && r.fired === 652 && r.kills === 19 && r.deaths === 0
        && rs.filter((x) => x.kind !== "duel").every((x) => x.statusB === "destroyed" && x.statusA === "airborne" && x.taken === 0 && x.dealt === 20 && x.score > 1.05) && rs.filter((x) => x.kind === "duel" && x.statusB === "destroyed").length === 1, `${r.score.toFixed(6)} ${JSON.stringify(Object.fromEntries(Object.entries(r.byKind).map(([k, v]) => [k, +v.toFixed(6)])))}`);
    ok("!! ...AND THEY ARE REAL FLIGHTS: in the 24 nobody goes under 800 m (the floor is 500), the angle of attack never passes 5 degrees (the wing stalls at 13), the slowest airspeed is 126 m/s, the closest two aircraft come is 9 m in a duel (the collision range is 8), 600 m in the straight fights (they are over when the target is shot down) and 327..606 m in the turning ones, and nobody is grounded, collided or shot down in the straight and turning fights", rs.every((x) => x.minAltitude > 800 && x.maxAlpha < 5 / R2D && x.minV > 120 && x.closest > 8) && rs.filter((x) => x.kind === "tail" || x.kind === "offset").every((x) => x.closest > 600) && rs.filter((x) => x.kind === "turning").every((x) => x.closest > 300 && x.closest < 650) && Math.min(...rs.map((x) => x.closest)) < 12);
    const b = benchSet;
    ok("!! THE 120 BENCH FIGHTS ARE PINNED: turning 1.11085 and duel 0.065426 (the mean 0.588138), 2,096 hits landed on 2,918 rounds and 860 taken, 70 kills, nobody lost -- not grounded, not collided, not shot down -- the lowest 700 m, the angle of attack under 5 degrees and the closest approach 8.4 m", near(b.score, 0.588138, 5e-7) && near(b.byKind.turning, 1.11085, 5e-7) && near(b.byKind.duel, 0.065426, 5e-7) && b.dealt === 2096 && b.taken === 860 && b.fired === 2918 && b.kills === 70 && b.deaths === 0 && b.results.every((x) => x.statusA === "airborne" && x.minAltitude > 700 && x.maxAlpha < 5 / R2D) && near(Math.min(...b.results.map((x) => x.closest)), 8.4, 0.1), `${b.score.toFixed(6)} ${b.kills} kills`);
    ok("the score is the trainer's formula and nothing else: recomputed from each result's own fields it is (min(dealt, 20) - min(lost, 20)) / 20 plus the kill bonus 0.25 (60 - t) / 60 for a kill while airborne -- for all 24 and the 120", [...rs, ...b.results].every((x) => { const lost = x.statusA !== "airborne" ? 20 : x.taken, want = (Math.min(x.dealt, 20) - Math.min(lost, 20)) / 20 + (x.killedB !== null && x.statusA === "airborne" ? 0.25 * Math.max(0, 60 - x.killedB) / 60 : 0); return near(x.score, want, 1e-12); }));
}

sec("4. THE GUIDE EARNS ITS PLACE, BY TAKING IT OUT");
{
    const base = fightSet, trainer = J.evaluate(AF.jetFightPilot, J.JET_FIGHT_SET, { guide: D.GUIDE });
    ok("!! THE TRAINER'S OWN GUIDE CANNOT FLY A JET FIGHT: the same pilots in the same 24 fights with dogfightTask.GUIDE score 0.003 (against 0.897), the jet fires NOTHING in a tail, offset or turning fight (its trigger range is 450 m and it holds 300 m of standoff at a speed floor of 38 m/s, so it never gets within it), and three aircraft are lost", near(trainer.score, 0.003252, 5e-7) && ["tail", "offset", "turning"].every((k) => trainer.byKind[k] === 0) && trainer.results.filter((x) => x.kind !== "duel").every((x) => x.fired === 0) && trainer.deaths === 3 && base.score - trainer.score > 0.89, `${trainer.score.toFixed(4)}, ${trainer.deaths} lost`);
    const noTrim = J.evaluate(AF.jetFightPilot, J.JET_FIGHT_SET, { guide: W({ alphaTrim: false }) });
    ok("!! THE ANGLE-OF-ATTACK TRIM IS WHAT HITS A TARGET IN A HARD TURN: without it (everything else as it is) the turning fights drop from 1.119 to 0.761, the duels from 0.260 to -0.007, two aircraft are lost, and the straight fights are unmoved to 0.02 (the nose is on the path in the cruise: that is the boresight's job)", near(noTrim.byKind.turning, 0.761204, 5e-7) && near(noTrim.byKind.duel, -0.006829, 5e-7) && noTrim.deaths === 2 && Math.abs(noTrim.byKind.tail - base.byKind.tail) < 0.02 && Math.abs(noTrim.byKind.offset - base.byKind.offset) < 0.02 && base.byKind.turning - noTrim.byKind.turning > 0.3, `turning ${noTrim.byKind.turning.toFixed(3)}, duel ${noTrim.byKind.duel.toFixed(3)}`);
    const turnKills = (lead) => J.JET_FIGHT_SET.filter((s) => s.kind === "turning").filter((s) => J.duel(AF.jetFightPilot, s, { guide: W({ leadTime: lead }) }).statusB === "destroyed").length;
    const kills = { 0: turnKills(0), 2: turnKills(2), 2.5: turnKills(2.5), 2.6: turnKills(2.6), 3.5: turnKills(3.5) };
    ok("!! THE LEAD IS WHAT HITS A TURNING TARGET, AND ITS WINDOW IS NARROW: the six turning fights are all kills with a lead of 2.5 and of 2.6 s and NONE is hit with 0, 2 or 3.5 s (a steady heading error of the turn rate times the lead's mistake, against a hit sphere of 1.1 degrees: the window is about 0.3 s wide)", kills[2.5] === 6 && kills[2.6] === 6 && kills[0] === 0 && kills[2] === 0 && kills[3.5] === 0, JSON.stringify(kills));
    const noLead = J.evaluate(AF.jetFightPilot, J.JET_FIGHT_SET, { guide: W({ leadTime: 0 }) });
    ok("...and the lead costs the straight fights nothing: with a lead of 0 the tail and offset fights are 1.107 and 1.102 (a target that does not turn the line of sight has no rate to lead), the turning fights score 0, and the duels 0.217", Math.abs(noLead.byKind.tail - base.byKind.tail) < 0.001 && Math.abs(noLead.byKind.offset - base.byKind.offset) < 0.005 && noLead.byKind.turning === 0 && near(noLead.byKind.duel, 0.216667, 5e-7));
}

sec("5. THE PILOT: THE FOUR NUMBERS OF THE FIGHTING GAINS");
{
    const cruise = J.evaluate(AF.jetPilot, J.JET_FIGHT_SET);
    ok("!! THE JET'S CRUISE GAINS IN SEAT A (the fighting gains in B) FLY THE STRAIGHT FIGHTS AND NOT THE REST: tail 1.107 and offset 1.088 are kills, the turning fights score 0 (the lead of 2.5 s is the fighting gains' time constant, not the cruise gains' 5 s), the duels -0.475 against the fighting pilot, and one aircraft is lost -- the bank limit, the heading time constant and the climb stiffness are what a fight needs", near(cruise.byKind.tail, 1.106829, 5e-7) && near(cruise.byKind.offset, 1.087917, 5e-7) && cruise.byKind.turning === 0 && near(cruise.byKind.duel, -0.475, 5e-7) && cruise.deaths === 1 && cruise.score < 0.45, `${cruise.score.toFixed(4)}`);
    const swapped = J.evaluate(AF.jetFightPilot, J.JET_FIGHT_SET.filter((s) => s.kind === "duel"), { pilotB: AF.jetPilot });
    ok("...and the other way round, the fighting pilot in A against the cruise pilot in B wins the six duels clearly: a mean score of at least 0.4 (0.467), five won or drawn and one lost", swapped.score > 0.4 && swapped.deaths === 1, `${swapped.score.toFixed(3)}`);
}

sec("6. THE ARENA IS THE SAME FIGHT; THE FINGERPRINTS");
{
    const FIELDS = ["score", "dealt", "taken", "fired", "firedB", "hitRate", "firstHit", "killedB", "statusA", "statusB", "ticks", "closest", "minAltitude", "maxAlpha", "minV"];
    let diffs = [], n = 0;
    for (const sc of J.JET_FIGHT_SET) {
        const d = J.duel(AF.jetFightPilot, sc); let r;
        try { r = A.resultOf(A.runArena(A.arenaFromScenario(sc, AF.jetFightPilot, J.JET_OPTS)), D.A_ID); } catch (e) { diffs.push(`${sc.kind}${sc.seed} THREW ${e.message}`); continue; }
        n++;
        for (const k of FIELDS) if (!Object.is(d[k], r[k])) diffs.push(`${sc.kind}${sc.seed}.${k}: ${d[k]} vs ${r[k]}`);
    }
    ok("!! THE STEPPABLE ARENA FLIES THE JET'S FIGHT TO THE BIT: the 24 fights through dogfightArena with the jet's model, gun and guide (JET_OPTS) and through duel() give the same score, hits, rounds, times, statuses, tick counts, closest approach, lowest altitude, largest angle of attack and slowest airspeed (Object.is) -- so a page that watches a jet fight is flying the fight this gate graded", diffs.length === 0 && n === 24, diffs.slice(0, 3).join("; "));
    const fp = (kind, seed) => J.duel(AF.jetFightPilot, J.scenario(seed, kind)).fingerprint;
    ok("!! FOUR FIGHTS ARE FINGERPRINTED (position and hits every second): tail 1 d96f737d, offset 1 cf2a493c, turning 1 71712ee8, duel 1 3ef12346 -- the number moves if anything under them does (the wing, the engine, the atmosphere, the pilot, the gun, the guide)", fp("tail", 1) === "d96f737d" && fp("offset", 1) === "cf2a493c" && fp("turning", 1) === "71712ee8" && fp("duel", 1) === "3ef12346", `${fp("tail", 1)} ${fp("offset", 1)} ${fp("turning", 1)} ${fp("duel", 1)}`);
    ok("the same fight twice is the same fight, bit for bit, and a different seat for the pilot is a different fight", J.duel(AF.jetFightPilot, J.scenario(3, "duel")).fingerprint === J.duel(AF.jetFightPilot, J.scenario(3, "duel")).fingerprint && J.duel(AF.jetPilot, J.scenario(3, "duel")).fingerprint !== J.duel(AF.jetFightPilot, J.scenario(3, "duel")).fingerprint);
}

sec("7. THE FRONT DOOR");
{
    const L = J.reportLines();
    ok("!! the export list is pinned, and the report names the module, the 24 fights and the pilot's score, with no NaN or undefined", Object.keys(J).sort().join(",") === "ALTITUDE,GUIDE_JET,JET_BENCH_SET,JET_FIGHT_SET,JET_GUN,JET_OPTS,SCALE,SPEED_SCALE,TURN_SCALE,duel,evaluate,reportLines,scenario" && L.length === 2 && /jetFight/.test(L[0]) && /24 fights/.test(L[1]) && /0\.897/.test(L[1]) && !L.some((l) => /NaN|undefined/.test(l)), L[1]);
}

console.log(fails ? `\njetFight-selfcheck: ${fails} FAILED` : "\njetFight-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);

