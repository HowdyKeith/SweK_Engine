// WebGLEngine/tools/ship/train6dofLeague.mjs -- v4846, profiles v4848 (the library; the command is tools/ship/trainLeague6dof.mjs)
//
// TRAIN THE SPACE-BATTLE PILOT AGAINST ITSELF AND SAY WHAT IT DID. tools/ship/train6dofPilot.mjs made the pilot the page ships (brain/pilot6dofWeightsDefault.json) by training against the PD autopilot, and that pilot
// beats the autopilot 39-0 over both sides of the audit seeds; against a copy of itself it wins 8, loses 2 and draws 10 of 20 from side A, which is a coin the first side holds. This is the second generation: the same
// sparse-mutation (1+1)-ES, but STARTED FROM THE SHIPPED PILOT and scored against a LEAGUE of two opponents -- the PD autopilot and the shipped pilot itself -- each on every seed from BOTH sides (brain/pilot6dofPolicy.mjs's
// evaluateLeague: the duel favours the side that acts first, so a pilot judged or trained from one side is judged and trained partly on the side).
//
//   * the search trains on 48 seeds (the first probe, on twelve, improved its train score and made its held-out result worse: it had learned the twelve);
//   * the champion of several searches is picked on 24 HELD-OUT seeds, on the league score;
//   * 40 AUDIT seeds that nothing has ever read grade the champion once, against the shipped pilot, from both sides;
//   * and each search is PRUNED TOWARD THE SHIPPED PILOT, not toward the PD autopilot: every weight that differs from it is put back unless the score needs it, so what is shipped is the shipped pilot's small, named delta.
//
// A file is written only if the champion (1) leads the shipped pilot by LEAD_FLOOR games over the 80 audit games and scores above the shipped pilot's own mirror score, (2) leads it on the held-out seeds, and
// (3) has not regressed against the PD autopilot (no more losses than the shipped pilot has on the first audit, and a score no more than REGRESSION_SLACK below its). If none does, nothing is written and the output says
// so: "no league pilot beat the shipped one" is a result.
//
//   node tools/ship/trainLeague6dof.mjs                          # 4 runs x 800 iterations, report only
//   node tools/ship/trainLeague6dof.mjs --workers 4              # the four searches in four processes: the same answer to the bit, about a quarter of the time
//   node tools/ship/trainLeague6dof.mjs --write [--out <file>]   # write brain/pilot6dofWeightsLeague.json when the champion qualifies
//
// *** PROFILES (v4848): WHAT THE LEAGUE IS PLAYED IN. *** "league" is v4846's, unchanged: the standoff start (84 m apart, at rest), no collisions. It is a shooting contest, and v4848 measured how little else it is: the
// centres never came nearer than 55 m in an audit game, a fight lasts 1.6-3.9 s, and in 400 games with collisions switched on there was not one contact. So a pilot trained there has never been near a ship, and the v4846
// league pilot, put in a JOUST start (14-40 m apart, each closing at 3-12 m/s), lands no hit in 80 games against even the PD autopilot. "close" plays every game in BOTH starts with collisions on (the page's own ram
// damage, to both ships); "careful" is "close" with a score cost per hit point lost to rams, and must also cut the rams it takes part in against the shipped pilot to half. Each profile has seed sets nothing has read.
//
// *** RESULTS AT v4848 (4 runs x 500 iterations, 32 train seeds, from the shipped pilot, both profiles). *** CLOSE QUALIFIED and is shipped as brain/pilot6dofWeightsClose.json: against the shipped pilot on the 160 audit games it won 106,
// lost 12 and drew 42 (standoff 41-6, joust 65-6; the shipped pilot against itself is 42-42), and against the PD autopilot it lost 1 where the shipped pilot lost 3. IT DOES NOT RAM LESS: 31 impacts and 534 hit points in the 80 audit jousts
// against the shipped pilot's own mirror's 30 and 439. It wins by shooting better in close quarters. CAREFUL DID NOT QUALIFY, and no file was written: at a penalty of 0.05 a hit point its best champion won 90 and lost 21 but its joust games
// cost 509 hit points to rams against the 220 the floor allows (half the mirror's 439). The shortfall is probably not the search. Measured in the scratch tree afterwards: every contact in the shipped pilot's jousts falls 1.2-1.6 s after the
// start, at 2-14 m/s; the ship has 16 N on 8 kg, about 2 m/s^2, so it can move about 1.5 m sideways in that time, and hulls that are rotating to aim need up to 3 m of clearance; and a scripted dodge (thrust away from the predicted closest
// approach, from 3-6 s out) did not lower the shipped pilot's ram games either (34 of 80 against its 30). THE JOUST CANNOT ASK WHETHER A PILOT CAN CHOOSE NOT TO RAM: its contacts are mostly committed at the start. A scenario with time to react
// (a gap of 60-100 m, closing at 4-10 m/s, so seconds and not a second) is what `careful` needs, and the profile is left in this file for that run.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as P from "../../brain/pilot6dofPolicy.mjs";
import * as PB from "../../brain/peerBrain.mjs";
import { weightsHash } from "../../brain/drivePolicy.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const DEFAULT_OUT = path.resolve(HERE, "..", "..", "brain", "pilot6dofWeightsLeague.json");
export const PREVIOUS_FILE = path.resolve(HERE, "..", "..", "brain", "pilot6dofWeightsDefault.json");
export const POLICY_ID = "pilot6dofPolicy";
export const RECIPE = Object.freeze({ runs: 4, iters: 800, seed: 4000, sigma: 0.3, maxK: 4, train: 48 });
/** The champion must lead the shipped pilot by at least this many games (wins minus losses) of the 80 audit games (40 seeds, both sides): a chosen floor so a coin-flip lead cannot qualify, not a test statistic. */
export const LEAD_FLOOR = 8;
/** How far below the shipped pilot's score against the PD autopilot (first audit, both sides) the champion may be. */
export const REGRESSION_SLACK = 0.5;
const cmp = P.describeEval;

const BRAIN_DIR = path.resolve(HERE, "..", "..", "brain");
/** The three profiles. `seeds` are the sets the search trains on, the champion is picked on, and the audit reads once; `ramFloor` is null or the fraction of the shipped pilot's ram damage the champion may keep (joust, audit). */
export const PROFILES = Object.freeze({
    league: Object.freeze({ id: "league", collisions: false, ramPenalty: 0, scenarios: Object.freeze(["standoff"]), ramFloor: null, out: DEFAULT_OUT, autoSeeds: P.AUDIT_SEEDS,
        seeds: Object.freeze({ train: P.LEAGUE_TRAIN_SEEDS, held: P.LEAGUE_HELD_OUT_SEEDS, audit: P.LEAGUE_AUDIT_SEEDS }), recipe: RECIPE }),
    close: Object.freeze({ id: "close", collisions: true, ramPenalty: 0, scenarios: Object.freeze(["standoff", "joust"]), ramFloor: null, out: path.join(BRAIN_DIR, "pilot6dofWeightsClose.json"), autoSeeds: P.CLOSE_AUDIT_SEEDS,
        seeds: Object.freeze({ train: P.CLOSE_TRAIN_SEEDS, held: P.CLOSE_HELD_OUT_SEEDS, audit: P.CLOSE_AUDIT_SEEDS }), recipe: Object.freeze({ runs: 4, iters: 500, seed: 5000, sigma: 0.3, maxK: 4, train: 32 }) }),
    careful: Object.freeze({ id: "careful", collisions: true, ramPenalty: 0.05, scenarios: Object.freeze(["standoff", "joust"]), ramFloor: 0.5, out: path.join(BRAIN_DIR, "pilot6dofWeightsCareful.json"), autoSeeds: P.CLOSE_AUDIT_SEEDS,
        seeds: Object.freeze({ train: P.CLOSE_TRAIN_SEEDS, held: P.CLOSE_HELD_OUT_SEEDS, audit: P.CLOSE_AUDIT_SEEDS }), recipe: Object.freeze({ runs: 4, iters: 500, seed: 5100, sigma: 0.3, maxK: 4, train: 32 }) }),
});
/** The duel options a profile plays under, for P.evaluate / P.train / P.prune. */
export const duelOf = (profile) => ({ collisions: profile.collisions, ramPenalty: profile.ramPenalty, scenarios: [...profile.scenarios] });

/** The shipped pilot's weights, through the importer the page uses. */
export function previousWeights(file = PREVIOUS_FILE) {
    const imp = PB.importBrain(PB.describePolicy(POLICY_ID, P), JSON.parse(fs.readFileSync(file, "utf8")));
    if (!imp.ok) throw new Error("the shipped pilot does not import: " + imp.reason);
    return imp.weights;
}

/** Parse `--name value` / `--flag` argv, REFUSING an option it does not know (a typo must not silently train the default recipe). `--profile` (league | close | careful) picks the recipe, the seeds, the file. */
export function parseArgs(argv) {
    const known = { runs: Number, iters: Number, seed: Number, sigma: Number, train: Number, workers: Number, one: Number, out: String, profile: String, write: Boolean, quiet: Boolean }, set = {};
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i]; if (!a.startsWith("--")) throw new Error(`unexpected argument ${JSON.stringify(a)}`);
        const k = a.slice(2); if (!(k in known)) throw new Error(`unknown option ${JSON.stringify(a)} (known: ${Object.keys(known).map((n) => "--" + n).join(", ")})`);
        if (known[k] === Boolean) set[k] = true; else { const v = argv[++i]; if (v == null) throw new Error(`${a} needs a value`); set[k] = known[k] === Number ? Number(v) : v; if (known[k] === Number && !Number.isFinite(set[k])) throw new Error(`${a} needs a number, got ${JSON.stringify(v)}`); }
    }
    const profile = PROFILES[set.profile || "league"]; if (!profile) throw new Error(`--profile must be one of ${Object.keys(PROFILES).join(", ")}, got ${JSON.stringify(set.profile)}`);
    const o = { ...profile.recipe, workers: 1, one: null, out: profile.out, write: false, quiet: false, ...set, profile: profile.id };
    if (o.train < 1 || o.train > profile.seeds.train.length) throw new Error(`--train must be 1..${profile.seeds.train.length}, got ${o.train}`);
    return o;
}

const lead = (r) => r.wins - r.losses;
const profileOf = (opts) => PROFILES[(opts && opts.profile) || "league"];
const joustOnly = (r) => r.scenario === "joust";

/**
 * Does the champion qualify to ship? Pure, so the gate can drive it on made-up numbers.
 * champ: { audit: { vsPrev, mirror }, heldOut: { vsPrev }, auto: { champ, prev } } -- each an evaluate() result (score, wins, losses; for a profile that plays more than one scenario, `runs` too).
 * `profile` (default league): the lead floor scales with the scenarios it plays (LEAD_FLOOR per scenario), no scenario may be behind the shipped pilot, and a profile with a `ramFloor` must cut the damage rams do
 * in the champion's joust games against the shipped pilot to that fraction of what the shipped pilot's own joust games against itself cost.
 */
export function qualifies(champ, profile = PROFILES.league) {
    const reasons = [], a = champ.audit, floor = LEAD_FLOOR * profile.scenarios.length;
    if (!(lead(a.vsPrev) >= floor)) reasons.push(`audit: leads the shipped pilot by ${lead(a.vsPrev)} games (${a.vsPrev.wins} won, ${a.vsPrev.losses} lost), under the floor of ${floor}`);
    if (!(a.vsPrev.score > a.mirror.score)) reasons.push(`audit score ${a.vsPrev.score.toFixed(2)} against the shipped pilot does not beat the shipped pilot's own ${a.mirror.score.toFixed(2)} against itself`);
    if (!(lead(champ.heldOut.vsPrev) > 0)) reasons.push(`held-out: ${champ.heldOut.vsPrev.wins} won and ${champ.heldOut.vsPrev.losses} lost against the shipped pilot is not a lead`);
    if (profile.scenarios.length > 1) for (const sc of profile.scenarios) {
        const r = P.subset(a.vsPrev, (x) => x.scenario === sc);
        if (!(lead(r) >= 0)) reasons.push(`audit, ${sc} start: ${r.wins} won and ${r.losses} lost against the shipped pilot is behind it`);
    }
    if (!(champ.auto.champ.losses <= champ.auto.prev.losses)) reasons.push(`against the PD autopilot it loses ${champ.auto.champ.losses} games where the shipped pilot loses ${champ.auto.prev.losses}`);
    if (!(champ.auto.champ.score >= champ.auto.prev.score - REGRESSION_SLACK)) reasons.push(`against the PD autopilot it scores ${champ.auto.champ.score.toFixed(2)}, more than ${REGRESSION_SLACK} under the shipped pilot's ${champ.auto.prev.score.toFixed(2)}`);
    if (profile.ramFloor != null) {
        const mine = P.subset(a.vsPrev, joustOnly).ramHp, theirs = P.subset(a.mirror, joustOnly).ramHp;
        if (!(mine <= profile.ramFloor * theirs)) reasons.push(`joust: the champion's games against the shipped pilot cost ${mine.toFixed(0)} hit points to rams where the shipped pilot's against itself cost ${theirs.toFixed(0)}; the floor is ${profile.ramFloor} of that (${(profile.ramFloor * theirs).toFixed(0)})`);
    }
    return { ok: reasons.length === 0, reasons };
}

const leagueOf = (prev) => ["autopilot", prev];
const trainSeedsOf = (opts) => profileOf(opts).seeds.train.slice(0, opts.train);
const brief = (r, profile) => profile.scenarios.length > 1 ? `${cmp(r)}; ` + profile.scenarios.map((sc) => { const x = P.subset(r, (y) => y.scenario === sc); return `${sc} W${x.wins}/L${x.losses}, rams ${x.rams} (${x.ramHp.toFixed(0)} hp)`; }).join("; ") : cmp(r);

/** One independent search (run number k of the recipe). Deterministic for (opts, k). Returns { k, seed, weights, trainScore, improved, neutral, moved, kept }. */
export function searchOne(opts, k, prev = previousWeights()) {
    const profile = profileOf(opts), seed = opts.seed + k, trainSeeds = trainSeedsOf(opts), opponent = leagueOf(prev), dopts = duelOf(profile);
    const found = P.train({ seed, iters: opts.iters, sigma: opts.sigma, maxK: opts.maxK, start: prev, trainSeeds, opponent, ...dopts });
    // a child that scores EXACTLY what its parent did replaces it, so most moved weights are drift: put back every one that carries nothing -- TOWARD THE SHIPPED PILOT, so what is left is its delta
    const out = P.prune(found.weights, { toward: prev, trainSeeds, opponent, ...dopts });
    return { k, seed, weights: out.weights, trainScore: out.trainScore, improved: found.improved, neutral: found.neutral, moved: out.moved, kept: out.kept };
}

/** The champion of `runs` (each from searchOne), the audit read once, and the verdict. */
export function finish(opts, runs, log = () => {}, prev = previousWeights()) {
    const profile = profileOf(opts), dopts = duelOf(profile), S = profile.seeds, opponent = leagueOf(prev), hand = P.handWeights();
    const base = { audit: P.evaluate(prev, S.audit, { opponent: [prev], ...dopts }), auto: P.evaluate(prev, profile.autoSeeds, { opponent: ["autopilot"], ...dopts }), held: P.evaluate(prev, S.held, { opponent, ...dopts }) };
    log(`shipped pilot (the one being improved on): vs itself on the audit seeds ${brief(base.audit, profile)} | vs the PD autopilot (first audit) ${brief(base.auto, profile)} | league score on the held-out seeds ${base.held.score.toFixed(2)}`);
    const scored = runs.map((r) => {
        const held = P.evaluate(r.weights, S.held, { opponent, ...dopts });
        log(`  run ${r.k + 1}/${opts.runs} seed ${r.seed}: train ${r.trainScore.toFixed(2)}, ${r.improved} improvements + ${r.neutral} neutral moves; pruned ${r.moved} moved weights to ${r.kept}; held-out league ${held.score.toFixed(2)}`);
        return { ...r, held };
    });
    // the champion is picked on the HELD-OUT league score only; the audit is read once, after
    scored.sort((a, b) => b.held.score - a.held.score || a.k - b.k);
    const c = scored[0], w = c.weights;
    const champion = {
        seed: c.seed, weights: w, kept: c.kept, moved: c.moved, held: c.held,
        differsFromHand: Array.from(w).filter((v, i) => Math.abs(v - hand[i]) > 1e-6).length,
        audit: { vsPrev: P.evaluate(w, S.audit, { opponent: [prev], ...dopts }), mirror: base.audit, vsAuto: P.evaluate(w, S.audit, { opponent: ["autopilot"], ...dopts }) },
        heldOut: { vsPrev: P.evaluate(w, S.held, { opponent: [prev], ...dopts }) },
        auto: { champ: P.evaluate(w, profile.autoSeeds, { opponent: ["autopilot"], ...dopts }), prev: base.auto },
    };
    const verdict = qualifies(champion, profile);
    log(`champion (seed ${c.seed}, picked on the held-out league score): ${c.kept} weights differ from the shipped pilot | audit vs the shipped pilot ${brief(champion.audit.vsPrev, profile)} (the shipped pilot against itself: ${brief(base.audit, profile)}) | held-out vs it ${cmp(champion.heldOut.vsPrev)} | vs the PD autopilot (first audit) ${brief(champion.auto.champ, profile)}`);
    log(verdict.ok ? "QUALIFIES: leads the shipped pilot from both sides on seeds nothing has read, and has not regressed against the PD autopilot." : "DOES NOT QUALIFY: " + verdict.reasons.join("; "));
    return { previous: base, previousHash: weightsHash(prev), runs: scored, champion, verdict };
}

/** Everything in this process, one search after another. */
export function run(opts, log = () => {}) {
    const prev = previousWeights(), runs = [];
    for (let k = 0; k < opts.runs; k++) runs.push(searchOne(opts, k, prev));
    return finish(opts, runs, log, prev);
}

/** The file written when the champion qualifies: the portable swek-brain-v1 blob, with the recipe and the numbers it was graded on in `by`. */
export function blobOf(result, opts) {
    const profile = profileOf(opts), S = profile.seeds, c = result.champion, desc = PB.describePolicy(POLICY_ID, P), a = c.audit, prev = result.previous, range = (x) => `[${x[0]}..${x[x.length - 1]}]`;
    const where = profile.id === "league" ? "" : `, every game played in BOTH starts (${profile.scenarios.join(" and ")}) with ship-ship collisions on${profile.ramPenalty ? ` and ${profile.ramPenalty} of score charged per hit point lost to rams` : ""}`;
    const by = `league-trained from the shipped pilot ${result.previousHash} (brain/pilot6dofWeightsDefault.json): sparse-mutation (1+1)-ES, seed ${c.seed} of ${opts.runs} runs (${opts.seed}..${opts.seed + opts.runs - 1}), sigma ${opts.sigma}, 1-${opts.maxK} weights per child, ${opts.iters} iterations ` +
        `over ${opts.train} train seeds ${range(S.train.slice(0, opts.train))} against the league [the PD autopilot, the shipped pilot] from both sides${where}, then pruned toward the shipped pilot: ${c.kept} of the ${P.WEIGHT_COUNT} weights differ from it and ${c.differsFromHand} from the PD autopilot; ` +
        `champion picked on the held-out league score ${range(S.held)}; ` +
        `vs the shipped pilot on the audit seeds ${range(S.audit)}, both sides: ${brief(a.vsPrev, profile)} (the shipped pilot against itself scores ${prev.audit.score.toFixed(2)} there); ` +
        `vs the PD autopilot on the first audit ${range(profile.autoSeeds)}: ${cmp(c.auto.champ)} (the shipped pilot: ${cmp(prev.auto)})`;
    // `score` is the HELD-OUT league score the champion was picked on: the page prints it as "held-out score" for every pilot
    return PB.exportBrain(desc, c.weights, { score: Number(c.held.score.toFixed(3)), by, citation: "male-cns Giant Fiber Circuit (Janelia FlyEM, vendor/male-cns/PROVENANCE.md)" });
}
export { weightsHash };
