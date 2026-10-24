// WebGLEngine/tools/ship/trainDogfightLeague.mjs -- UNNUMBERED (the version is chosen at ship time) (the library; the command is tools/ship/trainLeagueDogfight.mjs)
//
// TRAIN THE DOGFIGHT PILOTS AGAINST EACH OTHER AND SAY WHAT THEY DID. tools/ship/trainDogfightPilot.mjs made the two shipped fighters (brain/pilotDogfightWeightsDefault.json, brain/pilotDogfightMlpWeightsDefault.json) against ONE opponent, the PD autopilot, and wrote "GRADED ONLY AGAINST THE PD AUTOPILOT" into
// their files. The tournament (tools/ship/dogfightTournament-record.json) then flew them against each other and found what that grading could not: the fruit fly's fighter leads every pilot, the GPU Brain's fighter loses to it by 0.59 a fight, and the fighter trained to fight is not the better of the two GPU pilots
// on wins. This is the second generation, the same shape as tools/ship/train6dofLeague.mjs for the space pilot: the same sparse-mutation (1+1)-ES, STARTED FROM THE SHIPPED FIGHTER of its own brain and scored against a LEAGUE of three fixed opponents, each flown from BOTH seats:
//
//     autopilot      the PD autopilot (the floor: the pilot a league pilot must still beat)
//     self           the shipped fighter of the brain being trained (the champion's own parent: to be better than it is the point)
//     other          the shipped fighter of the OTHER brain (fly <-> gpu): the head-to-head the first generation never flew
//
//   * THE OBJECTIVE is the mean, over the three opponents and both seats of every LEAGUE_TRAIN_SET duel (12 duels, 72 fights), of the candidate's OWN score (a collision costs it its 20 as it costs the shipped pilot).
//   * EACH SEARCH IS PRUNED TOWARD THE SHIPPED FIGHTER, not toward the autopilot: every weight that differs from it is put back unless the score needs it, so what is shipped is the shipped fighter's small, named delta.
//   * ELIGIBILITY (the pool, nothing trains on it): a search may be champion only if on LEAGUE_POOL_SET (100 duels, both seats, three opponents: 600 fights) it loses no more fights to the ground or a collision, against each opponent, than the shipped fighter does plus two standard errors of a count (allowance());
//     and on POOL_FIGHT_SET (the classic four kinds, 400 fights against the autopilot) it loses no fight to the ground or a collision that the shipped fighter does not, goes past the full-stall angle in no more than the allowance, and scores no more than POOL_SLACK below it.
//   * `--train wide` (the jets only; the second recipe): the objective is judged on EIGHT BATCHES of twelve fresh duels (brain/jetLeagueSets.mjs, seeds 16100..16195), parent and child on the same batch and a different batch each iteration (brain/dogfightTrain.trainBatchedWith), and the prune is on 24 more fresh
//     duels (16200..16223). The first recipe's twelve training duels showed the search no failure at all (eight searches lost 0 of their own 72 training fights and 4.5 to 12 percent of the pool's: brain/DOGFIGHT_LEAGUE_WIP.md). Everything after the search -- eligibility, the champion, the audits, qualifies() -- is the same.
//   * `--guard LAMBDA` (with `--train wide`; the third recipe): the search's own score gets a PRICE ON WHAT ELIGIBILITY FORBIDS. A fight's score is hits dealt minus hits taken plus a kill bonus, so a fight ended by a collision costs the search almost nothing, while the pool filter lets a search lose no more than the shipped fighter's number (plus an allowance). The guarded objective is J = league score - LAMBDA x max(0, fights lost to the ground or a collision - the shipped fighter's count on the SAME duels) / fights (guardedScorer()); nothing is paid for being below the shipped fighter's number, or a search would be paid to stay away from the opponent. The batches and the prune set both use it. Off (0) by default: no existing search, cache key or file moves.
//   * CHAMPION: the eligible search with the best league score on LEAGUE_HELD_OUT_SET (32 duels, 192 fights). None eligible, no champion, nothing written, and the audit is NOT read.
//   * VERDICT. qualifies(), fixed in this file BEFORE any audit was read, graded ONCE on the league audit (100 duels, 600 fights, fresh seeds: LEAGUE_AUDIT_SET for the fruit fly, LEAGUE_AUDIT2_SET for the GPU Brain) and the classic audit and safety audit (AUDIT5/SAFETY5, AUDIT6/SAFETY6):
//        - the champion beats the shipped fighter head-to-head: its edge over it is at least MIN_EDGE (0.05) and at least Z_MIN (2) paired standard errors, and it wins more fights than it loses; its held-out league score beats the shipped fighter's;
//        - it regresses against neither of the other opponents: its own score against the autopilot and against the other brain's fighter is no more than REGRESS_SLACK (0.05) below the shipped fighter's own, on the same duels;
//        - it loses no more fights to the ground or a collision, against any opponent, than the shipped fighter loses against that opponent plus the allowance;
//        - it has not forgotten the classic fights: the classic audit no more than CLASSIC_SLACK (0.02) below the shipped fighter's, no kind more than KIND_SLACK (0.05) below, the reserve (DOGFIGHT_BENCH_SET) no more than RESERVE_SLACK (0.02) below, no more audit fights lost than the shipped fighter loses, and the safety audit's tails no worse.
//   * "No league pilot beat the shipped one" is a result, written down as one.
//   * WHAT THIS DOES NOT TEACH, SAID PLAINLY: the networks still take {heading, altitude, airspeed} from the pursuit guidance and a hand rule still pulls the trigger, so a search can only find a pilot that FLIES THE GUIDANCE better against these three opponents; the opponents are FIXED (not co-evolving), so a
//     champion is a pilot that beats THESE and is not shown to beat a pilot that has seen it.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import * as AF from "../../brain/autopilotFlight.mjs";
import * as PF from "../../brain/pilotFlightPolicy.mjs";
import * as MF from "../../brain/pilotFlightMlp.mjs";
import * as PJ from "../../brain/pilotJetPolicy.mjs";
import * as PJM from "../../brain/pilotJetMlp.mjs";
import * as JF from "../../brain/jetFight.mjs";
import * as JLS from "../../brain/jetLeagueSets.mjs";
import * as D from "../../brain/dogfightTask.mjs";
import * as DT from "../../brain/dogfightTrain.mjs";
import * as T from "../../brain/dogfightTournament.mjs";
import * as PB from "../../brain/peerBrain.mjs";
import * as TR from "./trainDogfightPilot.mjs";
import { weightsHash } from "../../brain/drivePolicy.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const BRAIN_DIR = path.resolve(HERE, "..", "..", "brain");
export const RECIPE = Object.freeze({ runs: 4, iters: 400, sigma: 0.3, maxK: 4 });
/** The opponents, in the order they are averaged and reported. */
export const MEMBERS = Object.freeze(["autopilot", "self", "other"]);
/** The champion's head-to-head edge over the shipped fighter (an absolute floor) in paired standard errors, how far below the shipped fighter's own score it may be against the other two, and the classic slacks: chosen floors, not test statistics. */
export const MIN_EDGE = 0.05, Z_MIN = 2, REGRESS_SLACK = 0.05, CLASSIC_SLACK = 0.02, POOL_SLACK = 0.02;
const { KIND_SLACK, RESERVE_SLACK } = TR;
const LOST = new Set(["crashed", "touchdown", "lost", "collided"]);

/** The two brains: the policy, the shipped fighter it starts from, the OTHER brain's shipped fighter (a league member), the file a qualifying champion is written to, and a seed of its own. */
export const BRAINS = Object.freeze({
    fly: Object.freeze({ id: "fly", air: "trainer", policy: PF, policyId: "pilotFlightPolicy", start: "pilotDogfightWeightsDefault.json", other: Object.freeze({ id: "gpuDogfight", policy: MF, policyId: "pilotFlightMlp", file: "pilotDogfightMlpWeightsDefault.json" }),
        out: path.join(BRAIN_DIR, "pilotDogfightWeightsLeague.json"), seed: 10000, name: "the fruit fly's Giant Fiber Circuit", citation: "male-cns Giant Fiber Circuit (Janelia FlyEM, vendor/male-cns/PROVENANCE.md), trained on dogfights against a league" }),
    gpu: Object.freeze({ id: "gpu", air: "trainer", policy: MF, policyId: "pilotFlightMlp", start: "pilotDogfightMlpWeightsDefault.json", other: Object.freeze({ id: "flyDogfight", policy: PF, policyId: "pilotFlightPolicy", file: "pilotDogfightWeightsDefault.json" }),
        out: path.join(BRAIN_DIR, "pilotDogfightMlpWeightsLeague.json"), seed: 11000, name: "the GPU Brain's MLP", citation: "SweK GPU Brain: brain/mlp.js BatchedMLP, an 18-32-32-4 relu network trained on dogfights against a league" }),
});
/**
 * THE JETS (`--aircraft jet`): the same two networks in the jet's layouts (brain/pilotJetPolicy.mjs, brain/pilotJetMlp.mjs), flown at jet scale (brain/jetFight.mjs, guns only) on the sets of brain/jetLeagueSets.mjs. No jet network has been trained, so there is NO SHIPPED FIGHTER to start from: a search starts from the network's HAND WEIGHTS -- the jet fighting autopilot's laws written into the
 * weights, equal to it to float32 -- and the league is the jet autopilot (autopilotFlight.jetFightPilot), `self` (that start, the champion's own parent) and `other` (the other brain's hand-weight twin). At the start the three are one pilot to float32, so the first thing a search can find is any way to beat the hand rule; "beats the hand weights" is the bar the rules ask of it.
 */
export const BRAINS_JET = Object.freeze({
    fly: Object.freeze({ id: "fly", air: "jet", policy: PJ, policyId: "pilotJetPolicy", start: "the jet autopilot's hand weights", other: Object.freeze({ id: "gpuJet", policy: PJM, policyId: "pilotJetMlp", file: null }),
        out: path.join(BRAIN_DIR, "pilotJetWeightsLeague.json"), seed: 12000, name: "the fruit fly's Giant Fiber Circuit flying the jet", citation: "male-cns Giant Fiber Circuit (Janelia FlyEM, vendor/male-cns/PROVENANCE.md) in the jet's layout (brain/pilotJetPolicy.mjs), trained on jet dogfights against a league" }),
    gpu: Object.freeze({ id: "gpu", air: "jet", policy: PJM, policyId: "pilotJetMlp", start: "the jet autopilot's hand weights", other: Object.freeze({ id: "flyJet", policy: PJ, policyId: "pilotJetPolicy", file: null }),
        out: path.join(BRAIN_DIR, "pilotJetMlpWeightsLeague.json"), seed: 13000, name: "the GPU Brain's MLP flying the jet", citation: "SweK GPU Brain: brain/mlp.js BatchedMLP, an 18-32-32-4 relu network in the jet's layout (brain/pilotJetMlp.mjs), trained on jet dogfights against a league" }),
});
/** The brain an option names (default the fruit fly) in the table of the aircraft it names (default the trainers). */
export const brainOf = (opts) => { const table = opts && opts.aircraft === "jet" ? BRAINS_JET : BRAINS, b = table[(opts && opts.brain) || "fly"]; if (!b) throw new Error(`unknown brain ${JSON.stringify(opts.brain)} (known: ${Object.keys(table).join(", ")})`); return b; };

/** The sets. `train`, `heldOut`, `pool`, `audit` are DUELS (flown from both seats against each opponent); `classicPool`, `classicAudit`, `safety`, `reserve` are the four-kind fights against the autopilot. The audits are each read once, for one champion. */
export const SETS = Object.freeze({ train: D.LEAGUE_TRAIN_SET, heldOut: D.LEAGUE_HELD_OUT_SET, pool: D.LEAGUE_POOL_SET, audit: D.LEAGUE_AUDIT_SET, classicPool: D.POOL_FIGHT_SET, classicAudit: D.AUDIT5_FIGHT_SET, safety: D.SAFETY_AUDIT5_FIGHT_SET, reserve: D.DOGFIGHT_BENCH_SET });
export const SETS_GPU = Object.freeze({ ...SETS, audit: D.LEAGUE_AUDIT2_SET, classicAudit: D.AUDIT6_FIGHT_SET, safety: D.SAFETY_AUDIT6_FIGHT_SET });
/** `--smoke`: every duel slot is the four throwaway duels and every classic slot the eight throwaway fights, so running the command to see that it runs reads no audit. */
export const SETS_SMOKE = Object.freeze({ train: D.LEAGUE_SMOKE_SET, heldOut: D.LEAGUE_SMOKE_SET, pool: D.LEAGUE_SMOKE_SET, audit: D.LEAGUE_SMOKE_SET, classicPool: D.SMOKE_FIGHT_SET, classicAudit: D.SMOKE_FIGHT_SET, safety: D.SMOKE_FIGHT_SET, reserve: D.SMOKE_FIGHT_SET });
export const setsOf = (opts) => (brainOf(opts).air === "jet" ? (opts && opts.smoke ? JLS.SETS_SMOKE : brainOf(opts).id === "gpu" ? JLS.SETS_GPU : JLS.SETS_FLY) : opts && opts.smoke ? SETS_SMOKE : brainOf(opts).id === "gpu" ? SETS_GPU : SETS);

/** Parse `--name value` / `--flag` argv in ONE pass, REFUSING an option it does not know; the brain's defaults (its seed, its file) go under what was given. `--one K` is the child's mode. */
export function parseArgs(argv) {
    const known = { runs: Number, iters: Number, seed: Number, sigma: Number, maxK: Number, workers: Number, one: Number, out: String, dump: String, cache: String, brain: String, aircraft: String, train: String, guard: Number, write: Boolean, quiet: Boolean, smoke: Boolean };
    const given = {};
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i]; if (!a.startsWith("--")) throw new Error(`unexpected argument ${JSON.stringify(a)}`);
        const k = a.slice(2);
        if (!(k in known)) throw new Error(`unknown option ${JSON.stringify(a)} (known: ${Object.keys(known).map((n) => "--" + n).join(", ")})`);
        if (known[k] === Boolean) given[k] = true; else { const v = argv[++i]; if (v == null) throw new Error(`${a} needs a value`); given[k] = known[k] === Number ? Number(v) : v; if (known[k] === Number && !Number.isFinite(given[k])) throw new Error(`${a} needs a number, got ${JSON.stringify(v)}`); }
    }
    const want = "brain" in given ? given.brain : "fly", air = "aircraft" in given ? given.aircraft : "trainer";
    if (air !== "trainer" && air !== "jet") throw new Error(`--aircraft must be trainer or jet, got ${JSON.stringify(air)}`);
    const train = "train" in given ? given.train : "fixed";
    if (train !== "fixed" && train !== "wide") throw new Error(`--train must be fixed or wide, got ${JSON.stringify(train)}`);
    if (train === "wide" && air !== "jet") throw new Error("--train wide has its training sets for the jets only (--aircraft jet)");
    const guard = "guard" in given ? given.guard : 0;
    if (!Number.isFinite(guard) || guard < 0) throw new Error(`--guard must be a number, 0 or more, got ${JSON.stringify(given.guard)}`);
    if (guard > 0 && train !== "wide") throw new Error("--guard has its objective for --train wide only");
    const table = air === "jet" ? BRAINS_JET : BRAINS;
    if (!table[want]) throw new Error(`--brain must be one of ${Object.keys(table).join(", ")}, got ${JSON.stringify(want)}`);
    const b = table[want];
    if (given.smoke && given.write) throw new Error("--smoke and --write do not go together: a champion found on throwaway fights is never written");
    return { ...RECIPE, seed: b.seed, workers: 1, one: null, out: b.out, dump: null, cache: null, write: false, quiet: false, smoke: false, ...given, brain: b.id, aircraft: air, train, guard };
}

// ---- the league ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
/** Load a swek-brain-v1 file through the page's importer: { weights (Float32Array), hash }. Throws, naming the file and the reason, when it is refused. */
export function loadFile(policyId, policy, file, { dir = BRAIN_DIR, read = (f) => fs.readFileSync(f, "utf8") } = {}) {
    const imp = PB.importBrain(PB.describePolicy(policyId, policy), JSON.parse(read(path.join(dir, file))));
    if (!imp.ok) throw new Error(`${file} refused: ${imp.reason}`);
    return { weights: imp.weights, hash: weightsHash(imp.weights) };
}
/** The league of a brain: { startW (the shipped fighter's weights, where the search starts and what it is pruned toward), hashes, members: { autopilot, self, other } as pilot functions }. */
export function loadLeague(brain, io = {}) {
    if (brain.air === "jet") {   // no shipped fighter: the hand weights are the start, the other brain's hand weights its twin, and the autopilot the jet's fighting one
        const sw = brain.policy.handWeights(), ow = brain.other.policy.handWeights();
        return { startW: sw, hashes: { start: weightsHash(sw), other: weightsHash(ow) }, members: { autopilot: AF.jetFightPilot, self: brain.policy.pilotFor(sw), other: brain.other.policy.pilotFor(ow) } };
    }
    const s = loadFile(brain.policyId, brain.policy, brain.start, io), o = loadFile(brain.other.policyId, brain.other.policy, brain.other.file, io);
    return { startW: s.weights, hashes: { start: s.hash, other: o.hash }, members: { autopilot: AF.pilot, self: brain.policy.pilotFor(s.weights), other: brain.other.policy.pilotFor(o.weights) } };
}

/** The candidate against every member over a set of duels, each flown from both seats: { score (the mean of the members' means of the candidate's own score), by: { member: matchup } }. */
export function leagueEval(candFn, members, set, sim = {}) {
    const by = {}; let sum = 0;
    for (const m of MEMBERS) { by[m] = T.matchup({ id: "cand", fn: candFn }, { id: m, fn: members[m] }, set, sim); sum += by[m].summary.meanX; }
    return { score: sum / MEMBERS.length, by };
}
const perScenario = (fights) => Array.from({ length: fights.length / 2 }, (_, i) => (fights[2 * i].sx + fights[2 * i + 1].sx) / 2);
const lostIds = (fights, m) => fights.filter((f) => LOST.has(f.statusX)).map((f) => `${m}:${f.seed}:${f.seat}`);
/** What a league evaluation says, member by member: { score, by: { member: { mean, perScenario (the candidate's own score per duel, the two seats averaged), lost (ids of fights lost to the ground or a collision), summary } } }. */
export function viewOf(res) {
    const by = {}; for (const m of MEMBERS) by[m] = { mean: res.by[m].summary.meanX, perScenario: perScenario(res.by[m].fights), lost: lostIds(res.by[m].fights, m), summary: res.by[m].summary };
    return { score: res.score, by };
}
/** The PAIRED difference of two lists of per-duel scores: { n, diff (mean a - b), se }. */
export function pairedDiff(a, b) {
    if (a.length !== b.length) throw new Error(`pairedDiff(): ${a.length} duels against ${b.length}`);
    const d = a.map((x, i) => x - b[i]), n = d.length, m = d.reduce((s, x) => s + x, 0) / n, sd = n > 1 ? Math.sqrt(d.reduce((s, x) => s + (x - m) ** 2, 0) / (n - 1)) : 0;
    return { n, diff: m, se: sd / Math.sqrt(n) };
}
/** The score of a weight vector against the league on a set of duels: a function of the weights alone. */
export const scorer = (policy, members, set, sim = {}) => (w) => leagueEval(policy.pilotFor(w), members, set, sim).score;
/** How many fights a league evaluation lost to the ground or a collision (over the three members and both seats, the count eligibility uses) and how many fights it flew. */
export const lostOf = (res) => ({ lost: MEMBERS.reduce((s, m) => s + res.by[m].fights.filter((f) => LOST.has(f.statusX)).length, 0), fights: MEMBERS.reduce((s, m) => s + res.by[m].fights.length, 0) });
/** The GUARDED objective of `--guard LAMBDA`: the league score minus LAMBDA times the share of the set's fights lost to the ground or a collision ABOVE the shipped fighter's own count on the same set (worked out once, here, from `startW`). Nothing is paid for being below it. */
export function guardedScorer(policy, members, set, sim, { lambda, startW }) {
    const ref = lostOf(leagueEval(policy.pilotFor(startW), members, set, sim)).lost;
    return (w) => { const res = leagueEval(policy.pilotFor(w), members, set, sim), l = lostOf(res); return res.score - (lambda * Math.max(0, l.lost - ref)) / l.fights; };
}

// ---- eligibility and the verdict -----------------------------------------------------------------------------------------------------------------------------------------------------------------------
/** Why a search may NOT be champion (an empty list when it may): `r` and `S` are { pool: viewOf(league pool), classicPool (D.evaluate result) } for the search and for the shipped fighter. Pure. */
export function eligibility(r, S) {
    const reasons = [];
    for (const m of MEMBERS) { const n = r.pool.by[m].lost.length, s = S.pool.by[m].lost.length, cap = TR.allowance(s); if (n > cap) reasons.push(`on the league pool it loses ${n} fights to the ground or a collision against ${m}, the shipped fighter's ${s} (more than ${cap})`); }
    reasons.push(...TR.tailReasons(TR.tails(r.classicPool), TR.tails(S.classicPool), "the classic pool"));
    if (!(r.classicPool.score >= S.classicPool.score - POOL_SLACK)) reasons.push(`the classic pool score ${r.classicPool.score.toFixed(4)} is more than ${POOL_SLACK} below the shipped fighter's ${S.classicPool.score.toFixed(4)}`);
    return reasons;
}

/**
 * Does the champion qualify to ship? Pure, so the gate can drive it on made-up numbers.
 * champ / shipped: { heldOut: { score }, audit: viewOf(league audit), classic: { audit, reserve (D.evaluate results), safety (tails()) } }.
 */
export function qualifies(champ, shipped) {
    const reasons = [], vs = champ.audit.by.self.summary;
    if (!(champ.heldOut.score > shipped.heldOut.score)) reasons.push(`held-out league score ${champ.heldOut.score.toFixed(4)} does not beat the shipped fighter's ${shipped.heldOut.score.toFixed(4)}`);
    if (!(vs.edge >= MIN_EDGE)) reasons.push(`its edge over the shipped fighter on the audit duels is ${vs.edge.toFixed(4)}, under the ${MIN_EDGE} floor`);
    if (!(vs.z >= Z_MIN)) reasons.push(`its edge over the shipped fighter is ${vs.z.toFixed(2)} paired standard errors (${vs.edge.toFixed(4)} +- ${vs.se.toFixed(4)}), under ${Z_MIN}`);
    if (!(vs.winsX > vs.winsY)) reasons.push(`against the shipped fighter it wins ${vs.winsX} fights and loses ${vs.winsY}: not more wins than losses`);
    for (const m of ["autopilot", "other"]) { const p = pairedDiff(champ.audit.by[m].perScenario, shipped.audit.by[m].perScenario); if (!(p.diff >= -REGRESS_SLACK)) reasons.push(`against ${m} its own score is ${p.diff.toFixed(4)} (+- ${p.se.toFixed(4)}) from the shipped fighter's on the same duels, more than ${REGRESS_SLACK} below`); }
    for (const m of MEMBERS) { const n = champ.audit.by[m].lost.length, s = shipped.audit.by[m].lost.length, cap = TR.allowance(s); if (n > cap) reasons.push(`on the audit duels it loses ${n} fights to the ground or a collision against ${m}, the shipped fighter's ${s} (more than ${cap})`); }
    const c = champ.classic, h = shipped.classic;
    if (!(c.audit.score >= h.audit.score - CLASSIC_SLACK)) reasons.push(`the classic audit fights score ${c.audit.score.toFixed(4)}, more than ${CLASSIC_SLACK} below the shipped fighter's ${h.audit.score.toFixed(4)}`);
    for (const k of D.KINDS) if (k in h.audit.byKind && !((c.audit.byKind[k] ?? -Infinity) >= h.audit.byKind[k] - KIND_SLACK)) reasons.push(`the ${k} audit fights score ${(c.audit.byKind[k] ?? NaN).toFixed(4)}, more than ${KIND_SLACK} below the shipped fighter's ${h.audit.byKind[k].toFixed(4)}`);
    if (!(c.reserve.score >= h.reserve.score - RESERVE_SLACK)) reasons.push(`the reserve fights score ${c.reserve.score.toFixed(4)}, more than ${RESERVE_SLACK} below the shipped fighter's ${h.reserve.score.toFixed(4)}`);
    const lostC = c.audit.results.filter((r) => LOST.has(r.statusA)).length, lostH = h.audit.results.filter((r) => LOST.has(r.statusA)).length;
    if (lostC > lostH) reasons.push(`${lostC} classic audit fights lost to the ground or a collision against the shipped fighter's ${lostH}`);
    reasons.push(...TR.tailReasons(c.safety, h.safety, "the classic safety audit"));
    return { ok: reasons.length === 0, reasons };
}

// ---- the search ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
/** What a command needs to run: the brain, its league, its sets. `io` is for the gate (a directory, a reader). */
export function contextOf(opts, io = {}) {
    const brain = brainOf(opts), league = loadLeague(brain, io);
    return { brain, ...league, sets: setsOf(opts), sim: brain.air === "jet" ? JF.JET_OPTS : {} };
}

/** One independent search (run number k of the recipe), from the shipped fighter and pruned back toward it. Deterministic for (opts, k). Returns { k, seed, weights, trainScore, improved, neutral, moved, kept }. */
export function searchOne(opts, k, ctx = contextOf(opts)) {
    const P = ctx.brain.policy, seed = opts.seed + k;
    if (opts.train === "wide") {   // the second recipe: the objective on one batch of fresh duels at a time, the prune on a fixed fresh set of its own
        const objective = (set) => (opts.guard > 0 ? guardedScorer(P, ctx.members, set, ctx.sim, { lambda: opts.guard, startW: ctx.startW }) : scorer(P, ctx.members, set, ctx.sim));
        const scores = ctx.sets.trainBatches.map(objective);
        const found = DT.trainBatchedWith(P, scores, { seed, iters: opts.iters, sigma: opts.sigma, maxK: opts.maxK, start: ctx.startW });
        const pruned = DT.pruneWith(P, objective(ctx.sets.trainPrune), found.weights, { toward: ctx.startW });
        return { k, seed, weights: pruned.weights, trainScore: pruned.trainScore, improved: found.improved, neutral: found.neutral, moved: pruned.moved, kept: pruned.kept };
    }
    const score = scorer(P, ctx.members, ctx.sets.train, ctx.sim);
    const found = DT.trainWith(P, score, { seed, iters: opts.iters, sigma: opts.sigma, maxK: opts.maxK, start: ctx.startW }), out = DT.pruneWith(P, score, found.weights, { toward: ctx.startW });
    return { k, seed, weights: out.weights, trainScore: out.trainScore, improved: found.improved, neutral: found.neutral, moved: out.moved, kept: out.kept };
}

const describeView = (v) => `${v.score.toFixed(4)} (${MEMBERS.map((m) => `${m} ${v.by[m].mean.toFixed(3)}`).join(", ")})`;
const describeLost = (v) => MEMBERS.map((m) => `${v.by[m].lost.length} vs ${m}`).join(", ");

/**
 * The champion of `runs` (each from searchOne): eligibility on the pools, the best held-out among the eligible, then the audits read once and the verdict. `ev` is for the gate: { league(weights, set) -> a league evaluation, classic(weights, set) -> D.evaluate's result };
 * it lets the eligibility, the champion and the read-once audits be driven on scripted numbers. The default is the fight itself.
 */
export function finish(opts, runs, log = () => {}, ctx = contextOf(opts), ev = null) {
    const P = ctx.brain.policy, sets = ctx.sets, startW = ctx.startW;
    const e = ev || { league: (w, set) => leagueEval(P.pilotFor(w), ctx.members, set, ctx.sim), classic: (w, set) => D.evaluate(P.pilotFor(w), set, ctx.sim) };
    const S = { heldOut: viewOf(e.league(startW, sets.heldOut)), pool: viewOf(e.league(startW, sets.pool)), classicPool: e.classic(startW, sets.classicPool) };
    log(`the shipped fighter (${ctx.hashes.start}) against the league: held-out ${describeView(S.heldOut)} | league pool: ${describeLost(S.pool)} lost to the ground or a collision of ${sets.pool.length * 2} fights each | classic pool ${TR.describeEval(S.classicPool)}`);
    const scored = runs.map((r) => {
        const heldOut = viewOf(e.league(r.weights, sets.heldOut)), pool = viewOf(e.league(r.weights, sets.pool)), classicPool = e.classic(r.weights, sets.classicPool), why = eligibility({ pool, classicPool }, S);
        log(`  run ${r.k + 1}/${opts.runs} seed ${r.seed}: train ${r.trainScore.toFixed(4)}, ${r.improved} improvements + ${r.neutral} neutral moves; pruned ${r.moved} moved weights to ${r.kept}; held-out ${describeView(heldOut)}; league pool: ${describeLost(pool)} lost; classic pool ${classicPool.score.toFixed(4)} -- ${why.length ? "NOT ELIGIBLE: " + why.join("; ") : "eligible"}`);
        return { ...r, heldOut, pool, classicPool, eligible: why.length === 0, ineligible: why };
    });
    scored.sort((a, b) => b.heldOut.score - a.heldOut.score || a.k - b.k);
    const c = scored.find((r) => r.eligible);
    if (!c) {
        const verdict = { ok: false, reasons: ["no search is eligible: " + scored.map((r) => `seed ${r.seed}: ${r.ineligible[0]}`).join(" | ")] };
        log("NO CHAMPION. " + verdict.reasons[0] + " -- the audit was not read.");
        return { shipped: S, runs: scored, champion: null, verdict };
    }
    const shipped = { heldOut: S.heldOut, audit: viewOf(e.league(startW, sets.audit)), classic: { audit: e.classic(startW, sets.classicAudit), reserve: e.classic(startW, sets.reserve), safety: TR.tails(e.classic(startW, sets.safety)) } };
    const champion = { seed: c.seed, weights: c.weights, kept: c.kept, moved: c.moved, heldOut: c.heldOut, pool: c.pool, audit: viewOf(e.league(c.weights, sets.audit)), classic: { audit: e.classic(c.weights, sets.classicAudit), reserve: e.classic(c.weights, sets.reserve), safety: TR.tails(e.classic(c.weights, sets.safety)) } };
    champion.vsAudit = Object.fromEntries(["autopilot", "other"].map((m) => [m, pairedDiff(champion.audit.by[m].perScenario, shipped.audit.by[m].perScenario)]));
    const verdict = qualifies(champion, shipped), vs = champion.audit.by.self.summary;
    log(`the shipped fighter on what the champion is graded on: audit ${describeView(shipped.audit)}, ${describeLost(shipped.audit)} lost | classic audit ${TR.describeEval(shipped.classic.audit)} | reserve ${TR.describeEval(shipped.classic.reserve)}`);
    log(`champion (seed ${c.seed}, the best held-out of the eligible): held-out ${describeView(c.heldOut)} | audit ${describeView(champion.audit)}, ${describeLost(champion.audit)} lost; against the shipped fighter ${vs.winsX}-${vs.draws}-${vs.winsY}, edge ${vs.edge.toFixed(4)} +- ${vs.se.toFixed(4)} (${vs.z.toFixed(2)} paired standard errors); own score against the autopilot ${champion.vsAudit.autopilot.diff >= 0 ? "+" : ""}${champion.vsAudit.autopilot.diff.toFixed(4)} and against the other brain's fighter ${champion.vsAudit.other.diff >= 0 ? "+" : ""}${champion.vsAudit.other.diff.toFixed(4)} from the shipped fighter's | classic audit ${TR.describeEval(champion.classic.audit)} | reserve ${TR.describeEval(champion.classic.reserve)}`);
    log(verdict.ok ? "QUALIFIES: beats the shipped fighter head-to-head by more than two paired standard errors, regresses against neither the autopilot nor the other brain's fighter, loses no more fights to the ground or a collision, and has not forgotten the classic fights." : "DOES NOT QUALIFY: " + verdict.reasons.join("; "));
    return { shipped: { ...S, audit: shipped.audit, classic: shipped.classic }, runs: scored, champion, verdict };
}

/** Everything in this process, one search after another. */
export function run(opts, log = () => {}, ctx = contextOf(opts)) {
    const runs = []; for (let k = 0; k < opts.runs; k++) runs.push(searchOne(opts, k, ctx));
    return finish(opts, runs, log, ctx);
}

/** Every run's pruned weights and scores and the verdict, as one JSON-able object (`--dump`): a result that did not qualify can still be looked at; NOT a shipped file, and nothing reads it back. */
export function dumpOf(result, opts) {
    const sc = (v) => ({ score: v.score, by: Object.fromEntries(MEMBERS.map((m) => [m, { mean: v.by[m].mean, lost: v.by[m].lost.length }])) });
    return { recipe: { brain: brainOf(opts).id, aircraft: brainOf(opts).air, runs: opts.runs, iters: opts.iters, seed: opts.seed, sigma: opts.sigma, maxK: opts.maxK, train: opts.train || "fixed", guard: opts.guard || 0 }, champion: result.champion ? result.champion.seed : null, verdict: result.verdict,
        shipped: { heldOut: sc(result.shipped.heldOut), pool: sc(result.shipped.pool), audit: result.shipped.audit ? sc(result.shipped.audit) : null },
        runs: result.runs.map((r) => ({ k: r.k, seed: r.seed, trainScore: r.trainScore, heldOut: sc(r.heldOut), pool: sc(r.pool), eligible: r.eligible, ineligible: r.ineligible, kept: r.kept, moved: r.moved, weights: Array.from(r.weights) })) };
}

/** The file written when the champion qualifies: the portable swek-brain-v1 blob, with the recipe and the numbers it was graded on in `by`. */
export function blobOf(result, opts, ctx = contextOf(opts)) {
    const B = brainOf(opts), sets = setsOf(opts), c = result.champion, desc = PB.describePolicy(B.policyId, B.policy), vs = c.audit.by.self.summary, sh = result.shipped;
    const lost = (v) => MEMBERS.map((m) => `${v.by[m].lost.length} against ${m}`).join(", ");
    const jetNote = B.air === "jet" ? `THE JETS (brain/jetFight.mjs, guns only, jet scale): there is no shipped jet fighter, so 'the shipped fighter' below is this network's HAND WEIGHTS (${B.policyId}.handWeights(): the jet fighting autopilot's laws in the weights, hash ${ctx.hashes.start}), which every search started from. ` : "";
    const by = jetNote + `LEAGUE-TRAINED ON DOGFIGHTS (brain/dogfightTask.mjs duels flown from both seats against a league of the PD autopilot, the shipped fighter this was started from (${ctx.hashes.start}) and the other brain's shipped fighter (${ctx.hashes.other})): sparse-mutation (1+1)-ES from the shipped fighter, seed ${c.seed} of ${opts.runs} runs (${opts.seed}..${opts.seed + opts.runs - 1}), sigma ${opts.sigma}, 1-${opts.maxK} weights per child, ${opts.iters} iterations ${opts.train === "wide" ? `each judged on one of ${sets.trainBatches.length} batches of ${sets.trainBatches[0].length} fresh duels (parent and child on the same batch, a different batch each iteration${opts.guard > 0 ? `, the score charged ${opts.guard} times the share of fights lost to the ground or a collision above the shipped fighter's own count on the same duels` : ""})` : `over the ${sets.train.length} league train duels`}, ` +
        `then pruned toward the shipped fighter${opts.train === "wide" ? ` on ${sets.trainPrune.length} further fresh duels` : ""}: ${c.kept} of the ${B.policy.WEIGHT_COUNT} weights differ from it; champion picked on the ${sets.heldOut.length} held-out duels among the searches no more dangerous than the shipped fighter on the ${sets.pool.length}-duel league pool and the ${sets.classicPool.length}-fight classic pool; ` +
        `audit of ${sets.audit.length} duels from both seats: against the shipped fighter ${vs.winsX} fights won, ${vs.draws} level, ${vs.winsY} lost, edge ${vs.edge.toFixed(4)} +- ${vs.se.toFixed(4)} (${vs.z.toFixed(2)} paired standard errors); own score against the autopilot ${c.vsAudit.autopilot.diff >= 0 ? "+" : ""}${c.vsAudit.autopilot.diff.toFixed(4)} and against the other brain's fighter ${c.vsAudit.other.diff >= 0 ? "+" : ""}${c.vsAudit.other.diff.toFixed(4)} from the shipped fighter's; ` +
        `fights lost to the ground or a collision: ${lost(c.audit)} (the shipped fighter ${lost(sh.audit)}); classic audit ${c.classic.audit.score.toFixed(4)} (the shipped fighter ${sh.classic.audit.score.toFixed(4)}), reserve ${c.classic.reserve.score.toFixed(4)} (${sh.classic.reserve.score.toFixed(4)}), classic safety audit ${c.classic.safety.lost.length} lost to the ground or a collision (${sh.classic.safety.lost.length}). ` +
        `GRADED AGAINST A FIXED LEAGUE OF THREE, NOT AGAINST A PILOT THAT HAS SEEN IT.`;
    return PB.exportBrain(desc, c.weights, { score: Number(c.heldOut.score.toFixed(4)), by, citation: B.citation });
}

// ---- the cache of finished searches (a search is tens of minutes; a restart must not lose them) -------------------------------------------------------------------------------------------------------------
/** The key a cached search must match: everything its weights are a function of. */
export const cacheKey = (opts, ctx, k) => JSON.stringify({ brain: ctx.brain.id, k, seed: opts.seed, iters: opts.iters, sigma: opts.sigma, maxK: opts.maxK, smoke: !!opts.smoke, start: ctx.hashes.start, other: ctx.hashes.other, ...(ctx.brain.air === "jet" ? { aircraft: "jet" } : {}), ...(opts.train === "wide" ? { train: "wide" } : {}), ...(opts.guard > 0 ? { guard: opts.guard } : {}) });
export const cachePath = (opts, k) => path.join(opts.cache, `league-${brainOf(opts).id}${opts.smoke ? "-smoke" : ""}${opts.train === "wide" ? "-wide" : ""}${opts.guard > 0 ? "-g" + opts.guard : ""}-${k}.json`);
export function cacheRead(opts, ctx, k, { read = (f) => fs.readFileSync(f, "utf8"), exists = (f) => fs.existsSync(f) } = {}) {
    if (!opts.cache) return null;
    const f = cachePath(opts, k); if (!exists(f)) return null;
    try { const j = JSON.parse(read(f)); if (j.key !== cacheKey(opts, ctx, k)) return null; const r = { ...j.search, weights: Float32Array.from(j.search.weights) }; return r; } catch (e) { return null; }
}
export function cacheWrite(opts, ctx, k, search, { write = (f, c) => fs.writeFileSync(f, c), mkdir = (d) => fs.mkdirSync(d, { recursive: true }) } = {}) {
    if (!opts.cache) return; mkdir(opts.cache);
    write(cachePath(opts, k), JSON.stringify({ key: cacheKey(opts, ctx, k), search: { ...search, weights: Array.from(search.weights) } }) + "\n");
}

/**
 * THE COMMAND, as a function (tools/ship/trainLeagueDogfight.mjs is the three lines that call it): parse, search (in this process, or each search in its own with `--workers`; a search already in `--cache` is not run again), grade, and write only what qualifies. Returns the exit
 * code: 0 done, 1 `--write` asked and the champion does not qualify (nothing written), 2 a bad argument or a league that cannot be loaded. `io` is for the gate: { out, err, writeFile, run, finish, selfPath, ctx }.
 */
export async function command(argv, io = {}) {
    const out = io.out || ((m) => console.log(m)), err = io.err || ((m) => console.error(m)), writeFile = io.writeFile || fs.writeFileSync, doFinish = io.finish || finish;
    let opts, ctx; try { opts = parseArgs(argv); ctx = io.ctx || contextOf(opts); } catch (e) { err("trainLeagueDogfight: " + e.message); return 2; }
    const log = opts.quiet ? () => {} : out;
    if (opts.one != null) { const r = searchOne(opts, opts.one, ctx); out("SEARCH " + JSON.stringify({ ...r, weights: Array.from(r.weights) })); return 0; }
    log(`league for ${ctx.brain.name}: starts from ${ctx.brain.start} (${ctx.hashes.start}); opponents: autopilot, self, ${ctx.brain.other.id} (${ctx.hashes.other}); ${opts.runs} runs x ${opts.iters} iterations${opts.train === "wide" ? ` (WIDE training: each iteration judged on one of ${ctx.sets.trainBatches.length} batches of ${ctx.sets.trainBatches[0].length} fresh duels, pruned on ${ctx.sets.trainPrune.length} more${opts.guard > 0 ? `; GUARD ${opts.guard}: a fight lost to the ground or a collision above the shipped fighter's count costs ${opts.guard} times its share of the set` : ""})` : ""}${opts.smoke ? " (SMOKE: throwaway fights, no audit read)" : ""}`);
    const doSearch = io.run ? null : (k) => { const hit = cacheRead(opts, ctx, k); if (hit) { log(`  search ${k + 1}/${opts.runs} (seed ${hit.seed}) read from the cache: pruned ${hit.moved} moved weights to ${hit.kept}`); return hit; } const t0 = Date.now(), r = searchOne(opts, k, ctx); cacheWrite(opts, ctx, k, r); log(`  search ${k + 1}/${opts.runs} (seed ${r.seed}) done in ${((Date.now() - t0) / 1000).toFixed(0)} s: pruned ${r.moved} moved weights to ${r.kept}`); return r; };
    let result;
    if (opts.workers > 1 && opts.runs > 1) {
        const passthrough = ["--brain", opts.brain, "--aircraft", opts.aircraft, "--iters", opts.iters, "--seed", opts.seed, "--sigma", opts.sigma, "--maxK", opts.maxK, "--runs", opts.runs, ...(opts.train === "wide" ? ["--train", "wide"] : []), ...(opts.guard > 0 ? ["--guard", String(opts.guard)] : []), ...(opts.smoke ? ["--smoke"] : [])].map(String);
        const runOne = (k) => new Promise((resolve, reject) => {
            const hit = cacheRead(opts, ctx, k); if (hit) { log(`  search ${k + 1}/${opts.runs} (seed ${hit.seed}) read from the cache: pruned ${hit.moved} moved weights to ${hit.kept}`); return resolve(hit); }
            const t0 = Date.now(), child = spawn(process.execPath, [io.selfPath, ...passthrough, "--one", String(k)], { stdio: ["ignore", "pipe", "inherit"] });
            let buf = ""; child.stdout.on("data", (d) => { buf += d; });
            child.on("error", reject);
            child.on("close", (code) => {
                const line = buf.split("\n").find((l) => l.startsWith("SEARCH "));
                if (code !== 0 || !line) return reject(new Error(`search ${k} exited ${code} without a result`));
                const r = JSON.parse(line.slice(7)); r.weights = Float32Array.from(r.weights); cacheWrite(opts, ctx, k, r);
                log(`  search ${k + 1}/${opts.runs} (seed ${r.seed}) done in ${((Date.now() - t0) / 1000).toFixed(0)} s: pruned ${r.moved} moved weights to ${r.kept}`);
                resolve(r);
            });
        });
        const pending = Array.from({ length: opts.runs }, (_, k) => k), runs = new Array(opts.runs);
        try { await Promise.all(Array.from({ length: Math.min(opts.workers, opts.runs) }, async () => { while (pending.length) { const k = pending.shift(); runs[k] = await runOne(k); } })); } catch (e) { err("trainLeagueDogfight: " + e.message); return 2; }
        result = doFinish(opts, runs, log, ctx);
    } else if (io.run) result = io.run(opts, log, ctx);
    else { const runs = []; for (let k = 0; k < opts.runs; k++) runs.push(doSearch(k)); result = doFinish(opts, runs, log, ctx); }
    if (opts.dump) { writeFile(opts.dump, JSON.stringify(dumpOf(result, opts)) + "\n"); out(`dumped every run's weights and scores to ${opts.dump} (not a shipped file)`); }
    if (opts.write) {
        if (!result.verdict.ok) { out("not written: " + result.verdict.reasons.join("; ")); return 1; }
        const blob = blobOf(result, opts, ctx); writeFile(opts.out, JSON.stringify(blob) + "\n");
        out(`wrote ${opts.out}: ${blob.weightCount} weights, hash ${weightsHash(result.champion.weights)}`);
    }
    return 0;
}
export { weightsHash };
