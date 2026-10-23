// WebGLEngine/brain/jetLeagueSets.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// THE FIGHTS THE JET NETWORKS ARE TRAINED, PICKED AND GRADED ON. tools/ship/trainDogfightLeague.mjs trains a dogfight network against a league (the autopilot, its own shipped fighter, the other brain's) and grades it ONCE on audit sets it never saw; this file is those sets for the JETS (brain/jetFight.mjs): the same slots, the same sizes, the
// same four kinds, flown at jet scale (jetFight.scenario(seed, kind) is dogfightTask.scenario(seed, kind) with every length x3.1 and every speed x140/45), on seeds NO OTHER SET USES -- the trainers' sets end at 9103, the jets' bench set is 100..159, and every seed here is 15000 or more, so a jet network is never graded on a fight that is the same
// geometry as one a trainer pilot (or a jet pilot) was trained, picked or audited on.
//
//   slot                 fights                          seeds            used for
//   train                12 duels                        15200..15211     the objective of every search
//   heldOut              32 duels                        15300..15331     picks the champion among the eligible searches
//   pool                 100 duels                       15600..15699     eligibility (nothing trains on it)
//   audit (fruit fly)    100 duels                       15400..15499     the verdict, read once for one champion
//   audit2 (GPU Brain)   100 duels                       15500..15599     the verdict, read once for one champion
//   classicPool          100 of each of the four kinds   15000..15099     eligibility against the autopilot (400 fights)
//   classicAudit         30 of each kind                 15700..15729     the verdict, fruit fly (120 fights)
//   classicAudit2        30 of each kind                 15800..15829     the verdict, GPU Brain
//   safety               50 of each kind                 15900..15949     the tails, fruit fly (200 fights)
//   safety2              50 of each kind                 16000..16049     the tails, GPU Brain
//   reserve              60 duels + 60 turning           100..159         jetFight.JET_BENCH_SET (already the jets' bench: read before, never trained on)
//   smoke                4 duels / 8 fights              9100..9103 / 9000..9001   throwaway, so that running the command to see that it runs reads no audit
//
// THE AUDITS ARE EACH READ ONCE, FOR ONE CHAMPION (the rule of every league in this tree): a set that has graded a champion is SPENT, whatever the verdict was, and a retrain needs fresh seeds -- the next free block is 16100 and up.
// Pure: no DOM, no clock, no random, no file access.
"use strict";
import * as JF from "./jetFight.mjs";
import * as D from "./dogfightTask.mjs";

const range = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);
const mk = (spec) => Object.freeze(spec.flatMap(([kind, seeds]) => seeds.map((s) => JF.scenario(s, kind))));
const kinds = (a, b) => D.KINDS.map((k) => [k, range(a, b)]);

/** Which seeds each slot holds (first, last), so the gate and a reader can state them without counting a set. */
export const SEEDS = Object.freeze({
    train: Object.freeze([15200, 15211]), heldOut: Object.freeze([15300, 15331]), pool: Object.freeze([15600, 15699]),
    audit: Object.freeze([15400, 15499]), audit2: Object.freeze([15500, 15599]),
    classicPool: Object.freeze([15000, 15099]), classicAudit: Object.freeze([15700, 15729]), classicAudit2: Object.freeze([15800, 15829]),
    safety: Object.freeze([15900, 15949]), safety2: Object.freeze([16000, 16049]),
});
export const NEXT_FREE_SEED = 16100;

export const JET_LEAGUE_TRAIN_SET = mk([["duel", range(...SEEDS.train)]]);
export const JET_LEAGUE_HELD_OUT_SET = mk([["duel", range(...SEEDS.heldOut)]]);
export const JET_LEAGUE_POOL_SET = mk([["duel", range(...SEEDS.pool)]]);
export const JET_LEAGUE_AUDIT_SET = mk([["duel", range(...SEEDS.audit)]]);
export const JET_LEAGUE_AUDIT2_SET = mk([["duel", range(...SEEDS.audit2)]]);
export const JET_POOL_FIGHT_SET = mk(kinds(...SEEDS.classicPool));
export const JET_AUDIT_FIGHT_SET = mk(kinds(...SEEDS.classicAudit));
export const JET_AUDIT2_FIGHT_SET = mk(kinds(...SEEDS.classicAudit2));
export const JET_SAFETY_FIGHT_SET = mk(kinds(...SEEDS.safety));
export const JET_SAFETY2_FIGHT_SET = mk(kinds(...SEEDS.safety2));
export const JET_LEAGUE_SMOKE_SET = mk([["duel", range(9100, 9103)]]);
export const JET_SMOKE_FIGHT_SET = mk(kinds(9000, 9001));

/** The slots of the league library for each brain, in the library's own names (trainDogfightLeague.SETS). */
export const SETS_FLY = Object.freeze({ train: JET_LEAGUE_TRAIN_SET, heldOut: JET_LEAGUE_HELD_OUT_SET, pool: JET_LEAGUE_POOL_SET, audit: JET_LEAGUE_AUDIT_SET, classicPool: JET_POOL_FIGHT_SET, classicAudit: JET_AUDIT_FIGHT_SET, safety: JET_SAFETY_FIGHT_SET, reserve: JF.JET_BENCH_SET });
export const SETS_GPU = Object.freeze({ ...SETS_FLY, audit: JET_LEAGUE_AUDIT2_SET, classicAudit: JET_AUDIT2_FIGHT_SET, safety: JET_SAFETY2_FIGHT_SET });
export const SETS_SMOKE = Object.freeze({ train: JET_LEAGUE_SMOKE_SET, heldOut: JET_LEAGUE_SMOKE_SET, pool: JET_LEAGUE_SMOKE_SET, audit: JET_LEAGUE_SMOKE_SET, classicPool: JET_SMOKE_FIGHT_SET, classicAudit: JET_SMOKE_FIGHT_SET, safety: JET_SMOKE_FIGHT_SET, reserve: JET_SMOKE_FIGHT_SET });

export function reportLines() {
    const n = (s) => s.length;
    return [`[jetLeagueSets] the fights the jet networks are trained, picked and graded on: jet-scale scenarios on seeds 15000 and up (the next free block is ${NEXT_FREE_SEED})`,
        `  train ${n(JET_LEAGUE_TRAIN_SET)} duels, held-out ${n(JET_LEAGUE_HELD_OUT_SET)}, pool ${n(JET_LEAGUE_POOL_SET)}, audits ${n(JET_LEAGUE_AUDIT_SET)} + ${n(JET_LEAGUE_AUDIT2_SET)} duels; classic pool ${n(JET_POOL_FIGHT_SET)} fights, classic audits ${n(JET_AUDIT_FIGHT_SET)} + ${n(JET_AUDIT2_FIGHT_SET)}, safety ${n(JET_SAFETY_FIGHT_SET)} + ${n(JET_SAFETY2_FIGHT_SET)}, reserve ${n(JF.JET_BENCH_SET)}`];
}
if (typeof process !== "undefined" && Array.isArray(process.argv)) {   // see physics/mechanics/aircraftAssembly.mjs for why this is guarded and the import is dynamic
    const { pathToFileURL } = await import("node:url");
    if (import.meta.url === pathToFileURL(process.argv[1] || "").href) { for (const l of reportLines()) console.log(l); process.exit(0); }
}
