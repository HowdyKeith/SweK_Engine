// WebGLEngine/brain/jetFight.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// THE JETS' DOGFIGHT: the trainers' fight (brain/dogfightTask.mjs) at the size of a jet, GUNS ONLY. A light jet (physics/mechanics/flightModel6dof.mjs's JET_TRAINER) flies at 140 m/s, three times the trainer's speed, with the guns that a jet carries in its nose and no missiles of any kind: the fight is the same job -- two aircraft, a fixed forward gun each,
// a minute, hits landed minus hits taken -- and it is graded by the same function (D.duel, D.sideScore), so a jet's score means what a trainer's does. THIS FILE IS NUMBERS AND A TRANSFORM, NOT A SECOND FIGHT: the loop, the guidance and the trigger are dogfightTask's, handed this file's `guide` (dogfightTask.GUIDE's fields for a jet) and its gun, and the
// steppable arena (brain/dogfightArena.mjs) takes the same options, so a page that watches a jet fight is flying the fight the gate graded.
//
//   THE SCENARIOS ARE THE TRAINER'S, SCALED, and that is the whole of their design: jet.scenario(seed, kind) is dogfightTask.scenario(seed, kind) with every length multiplied by 3.1 (a tail fight starts 775..1,395 m behind, not 250..450), every speed by 140/45 (B flies at 134..146 m/s, A at 124..156), the altitude moved to 2,000 m, and a turning opponent's rate by 0.8
//   (0.04..0.072 rad/s: the jet's best sustained rate is about 0.1, the trainer's 0.11). The same seed is the same fight at jet scale, which is what lets the two sizes be compared; the angles are the trainer's, and so is the geometry's difficulty.
//
//   THE GUN  JET_GUN: 800 m/s muzzle speed (a nose cannon's, not the trainer's 300), 15 rounds a second, 300 rounds (20 seconds of fire), a round that lives 1.5 s (a reach of 1,300 m with the aircraft's own speed added), a hit sphere of 6 m (the trainer's 4 m is 0.4 of its wing; the jet is 11 m long),
//            20 hit points of 1 damage. The muzzle is 3 m ahead of the centre of mass. THE BORESIGHT IS -0.012 RAD, the jet's trim angle of attack at 150 m/s and 2,000 m, so that a gun fixed along the nose points along the flight path in the cruise (MEASURED, trim at 2,000 m: the nose is 0.037 rad above the path at 120 m/s, 0.018 at 140, 0.0055 at 160 and
//            -0.001 at 175 -- this jet's wing has 2 degrees of incidence and a lift slope that makes an angle of attack of 1 degree enough for level flight at 140 m/s; the trainer's boresight of -0.05 is ITS angle of attack at 45 m/s).
//   THE GUIDE GUIDE_JET  dogfightTask.GUIDE with the jet's ranges and speeds (an altitude floor of 500 m, the trigger inside 650 m (the hit sphere of 6 m subtends 0.0092 rad there, the trainer's 4 m at 450 m 0.0089), 110..190 m/s, a standoff of 300 m, the break-off inside 300 m closing over 40 m/s and the keep-out inside 80 m, a collision inside 8 m)
//            and the two options the trainer's guidance does not use. `alphaTrim`: the flight path is aimed lower by range x (the angle of attack it has + the boresight), so that the GUN and not the velocity points at the lead point -- in a hard turn the nose is 4 degrees above the path, which is 40 m at 600 m on a hit sphere of 6 m. `leadTime` 2.5 s: the heading asked for leads the
//            line of sight by its turn rate times 2.5 s, THE HEADING TIME CONSTANT OF THE PILOT THAT FLIES IT: a pilot that holds a heading with a proportional law runs a steady error behind a turning target of the turn rate times that constant (0.06 rad/s x 2.5 s is 8.6 degrees; the hit sphere at 300 m is 1.1), and the lead takes exactly that out. MEASURED, 40 turning fights with the lead as the only thing changed: 2.2 s kills 13,
//            2.4 s 39, 2.5 s ALL 40, 2.6 s ALL 40, 2.8 s 33; 0 and 2 s hit nothing, and neither does 3.5 s. THE WINDOW IS ABOUT 0.3 s WIDE, which is a finding about the pilot and not a tuning to be proud of: a hit sphere of 1.1 degrees against a steady error of turn rate x the lead's mistake.
//   THE PILOT  autopilotFlight.jetFightPilot (AUTOPILOT_JET_FIGHT: the jet's gains with a 63-degree bank limit, a 2.5 s heading time constant and a stiffer climb command) flies both seats unless told otherwise.
//
// WHAT IS NOT HERE, SAID PLAINLY: no missile, no seeker, no countermeasure (guns only, as asked); no pilot but the hand-written one has flown these fights (the networks' jet layouts are the next slice, and nothing here is trained); no wind; the aircraft fly 2,000 m above a flat sea level with the standard atmosphere; and the scenarios keep the trainer's four kinds, so a fight in which the
// two aircraft start at different heights, or in cloud, or with a wingman, is not graded.
"use strict";
import * as D from "./dogfightTask.mjs";
import * as AF from "./autopilotFlight.mjs";

export const SCALE = 3.1, SPEED_SCALE = 140 / 45, TURN_SCALE = 0.8, ALTITUDE = 2000;
export const JET_GUN = Object.freeze({ muzzleSpeed: 800, rate: 15, magazine: 300, muzzle: Object.freeze([3, 0, 0]), boresight: -0.012, life: 1.5, hitRadius: 6, damage: 1, hp: 20 });
export const GUIDE_JET = Object.freeze({ ...D.GUIDE, minAltitude: 500, maxRange: 650, speedLimits: Object.freeze([110, 190]), standoff: 300, breakRange: 300, breakClosing: 40, breakClimb: 90, keepOutRange: 80, keepOutClosing: 3, collisionRange: 8, alphaTrim: true, leadTime: 2.5 });
/** The options that make dogfightTask.duel(), dogfightTask.evaluate() and dogfightArena.arenaFromScenario() fly a jet fight: the jet's flight model, its gun on both sides, its guide, and the fighting pilot in seat B. Spread it and override what a caller needs (`pilotB` above all). */
export const JET_OPTS = Object.freeze({ model: AF.jetModel(), spec: JET_GUN, specB: JET_GUN, guide: GUIDE_JET, pilotB: AF.jetFightPilot });

/** dogfightTask.scenario(seed, kind) at jet scale (see the header). Deterministic and frozen; an unknown kind is refused by dogfightTask's own message. */
export function scenario(seed, kind = "tail") {
    const t = D.scenario(seed, kind);
    const place = (o) => Object.freeze({ ...o, pos: Object.freeze([o.pos[0] * SCALE, o.pos[1] * SCALE, ALTITUDE + (o.pos[2] - 300) * SCALE]), speed: o.speed * SPEED_SCALE });
    return Object.freeze({ seed: t.seed, kind: t.kind, a: place(t.a), b: place(t.b), opponent: Object.freeze(t.opponent.kind === "turn" ? { ...t.opponent, rate: t.opponent.rate * TURN_SCALE } : { ...t.opponent }) });
}
const mk = (src) => Object.freeze(src.map((s) => scenario(s.seed, s.kind)));
/** The fights a jet pilot is graded on: the trainer's DOGFIGHT_SET at jet scale -- six of each kind, seeds 1..6 (24 fights). */
export const JET_FIGHT_SET = mk(D.DOGFIGHT_SET);
/** The larger set to measure with: the trainer's DOGFIGHT_BENCH_SET at jet scale -- sixty duels and sixty turning fights, seeds 100..159 (120 fights). */
export const JET_BENCH_SET = mk(D.DOGFIGHT_BENCH_SET);

/** One fight: `pilotA` in seat A, the fighting pilot in seat B (override with `pilotB`). Everything else is dogfightTask.duel's, and so is the result. */
export const duel = (pilotA, sc, opts = {}) => D.duel(pilotA, sc, { ...JET_OPTS, ...opts });
/** A pilot over a set of jet fights (default JET_FIGHT_SET): dogfightTask.evaluate's result. */
export const evaluate = (pilot, set = JET_FIGHT_SET, opts = {}) => D.evaluate(pilot, set, { ...JET_OPTS, ...opts });

export function reportLines() {
    const r = evaluate(AF.jetFightPilot);
    return ["[jetFight] the jets' dogfight, guns only: the trainers' fight at jet scale (140 m/s, 2,000 m, a nose cannon of 800 m/s), graded by the same function",
        `  ${JET_FIGHT_SET.length} fights (${D.KINDS.join(", ")}): the jet's fighting pilot against itself scores ${r.score.toFixed(3)} (${D.KINDS.map((k) => `${k} ${r.byKind[k].toFixed(3)}`).join(", ")}); ${r.dealt} hits landed on ${r.fired} rounds, ${r.taken} taken, ${r.kills} kills, ${r.deaths} lost`];
}

if (typeof process !== "undefined" && Array.isArray(process.argv)) {   // see physics/mechanics/aircraftAssembly.mjs for why this is guarded and the import is dynamic
    const { pathToFileURL } = await import("node:url");
    if (import.meta.url === pathToFileURL(process.argv[1] || "").href) { for (const l of reportLines()) console.log(l); process.exit(0); }
}
