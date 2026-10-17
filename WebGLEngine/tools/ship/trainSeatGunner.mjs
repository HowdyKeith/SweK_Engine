// WebGLEngine/tools/ship/trainSeatGunner.mjs -- UNNUMBERED (the version is chosen at ship time; the command is tools/ship/trainGunnerSeat.mjs)
//
// TRAIN A NETWORK TO BE THE HAND OF THE BATTLESHIP'S GUNNERS AND SAY WHAT IT DID. The gunner in a gun seat is a SIGHT (what it knows of a target, how late and how noisily) and a HAND (the aim error, the trigger);
// brain/seatGunnerPolicy.mjs (the fruit fly's escape circuit) and brain/seatGunnerMlp.mjs (the GPU Brain's plain network) are the hand, written so that their hand weights ARE the hand gunner. This trains them:
// a sparse-mutation (1+1)-ES from those weights (pilot6dofPolicy.train's recipe -- one to four weights per child, a child that scores exactly what its parent did replaces it), every candidate judged by flying
// battleshipFight.fight() -- thirteen seats of the candidate, behind the GREEN sight, against the PD-autopilot fighters -- on the TRAIN fights; several independent searches, the champion picked on the HELD-OUT
// fights, the AUDIT fights (which no search and no choice ever saw) read once; a network is written only if it beats the hand gunner on the held-out AND the audit fights. If none does, nothing is written and the
// output says so: "no learned hand beat the hand gunner" is a result, and the page then has no trained choice rather than one that is not better.
//
//   THE SCORE OF A FIGHT is dense on purpose: the share of the fighters' hit points the ship took off them (0..1), plus half the share of them it shot down, minus half the share of its own hit points it lost.
//   (Kills alone are a plateau: a green sight with a good trigger and one without both kill 3 of 8.)
//   WHAT IS TRAINED AGAINST: the sight is `green` (a 0.6 s delay, 0.06 rad of noise), the one where a better hand has room; the report ALSO flies the trained network behind the other three sights, which it was
//   never trained for, and says what happened, because a hand that only helps one sight is a thing to know.
//
// Deterministic: the same options give the same weights to the bit (the fights, the seeds and the search's generator are all seeded).
"use strict";
import * as BF from "../../brain/battleshipFight.mjs";
import * as SA from "../../brain/spaceArena.mjs";
import * as PB from "../../brain/peerBrain.mjs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const SECONDS = 40, SIGHT = "green", KINDS = BF.KINDS;
export const DEFAULT_OUT = Object.freeze({ fruitfly: path.resolve(HERE, "..", "..", "brain", "seatGunnerWeightsDefault.json"), mlp: path.resolve(HERE, "..", "..", "brain", "seatGunnerMlpWeightsDefault.json") });
export const POLICY_ID = Object.freeze({ fruitfly: "seatGunnerPolicy", mlp: "seatGunnerMlp" });
export const RECIPE = Object.freeze({ runs: 2, iters: 300, seed: 3000, sigma: 0.3, maxK: 4, passes: 2, liveShare: 0.5 });
const fights = (kinds, seeds) => Object.freeze(kinds.flatMap((kind) => seeds.map((seed) => Object.freeze({ kind, seed }))));
export const TRAIN_FIGHTS = fights(["bow", "stern", "swarm"], [1, 2]);                 // 6 fights
export const HELD_OUT_FIGHTS = fights(KINDS, [11, 12]);                                // 8 fights
export const AUDIT_FIGHTS = fights(KINDS, [21, 22, 23]);                               // 12 fights

/** A fight's number: the share of the fighters' hit points taken off them, plus half the share shot down, minus half the share of the ship's own hit points lost. */
export function scoreOf(arena) {
    const t = BF.tally(arena), fs = arena.crafts.slice(1), ship = arena.crafts[0];
    const dealt = fs.reduce((a, c) => a + (c.hpMax - Math.max(0, c.hp)), 0) / fs.reduce((a, c) => a + c.hpMax, 0);
    return dealt + 0.5 * (t.killed / fs.length) - 0.5 * (t.damageOnShip / ship.hpMax);
}
/** The network `net` (a module with gunnerFactory, handWeights, mutate, rngFor) with weights `w` over `list` (default the train fights), behind `sight`: { score (the mean), killed, dealt (mean share), damage (mean hit points lost), wins, runs }. */
export function evaluate(net, w, list = TRAIN_FIGHTS, { sight = SIGHT, seconds = SECONDS, pilot } = {}) {
    const runs = list.map(({ kind, seed }) => {
        const b = BF.build(seed, kind, { gunners: sight, seconds, ...(pilot ? { pilot } : {}), ...(w ? { network: { module: net, weights: w } } : {}) });
        SA.runSpaceArena(b.arena);
        const t = BF.tally(b.arena);
        return { kind, seed, score: scoreOf(b.arena), killed: t.killed, damage: t.damageOnShip, win: t.winner === "ship", rounds: t.ship.seatRounds, hits: t.ship.hitsDealt };
    });
    const mean = (f) => runs.reduce((a, r) => a + f(r), 0) / runs.length;
    return { score: mean((r) => r.score), killed: runs.reduce((a, r) => a + r.killed, 0), damage: mean((r) => r.damage), wins: runs.filter((r) => r.win).length, rounds: runs.reduce((a, r) => a + r.rounds, 0), hits: runs.reduce((a, r) => a + r.hits, 0), runs };
}
/** One line for an evaluate() result. The shipped file's `by` quotes it, and the gate recomputes it. */
export const describeEval = (r) => `${r.score.toFixed(3)} (${r.killed} of ${r.runs.length * BF.FIGHTERS} fighters down, W${r.wins}/${r.runs.length}, ${r.damage.toFixed(0)} hit points lost a fight, ${r.rounds} rounds, ${r.hits} hit points dealt)`;

const gauss = (rng) => { let u = 0, v = 0; while (!u) u = rng(); while (!v) v = rng(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
/** A child of `w` with one to `maxK` of the weights at `idx` moved by a gaussian of `sigma` (the net's own mutate() moves any of all of them). */
function mutateAt(w, idx, sigma, rng, maxK) { const o = Float32Array.from(w), k = 1 + Math.floor(rng() * maxK); for (let j = 0; j < k; j++) o[idx[Math.floor(rng() * idx.length)]] += gauss(rng) * sigma; return o; }
/**
 * (1+1)-ES from the hand weights of `net`, judged on `trainFights`. Returns { weights, trainScore, history, iters, improved, neutral }. UNLIKE pilot6dofPolicy.train, a child that scores exactly its parent's does NOT replace it unless `acceptNeutral` is on (and is then counted apart): the pilot's duel
 * is full of plateaus a search must cross, but this score is dense (hit points, not kills), so an exactly equal child is one whose moved weights changed nothing the train fights could see -- drift, which prune() has to fly every weight of to put back (the first four searches, with it on, spent an hour and a quarter
 * of CPU each in the first run and had not finished pruning). HALF THE CHILDREN (`liveShare`) are bred from the net's liveIndices() alone -- the 19 (21) weights wired into the hand path, which a random move of one to four of 860 (1,571) almost never reaches (the first searches, without it, found no
 * improvement in 150 iterations for the fruit fly) -- and the rest are the net's own mutate().
 */
export function train(net, { seed = 7, iters = RECIPE.iters, sigma = RECIPE.sigma, start = null, trainFights = TRAIN_FIGHTS, maxK = RECIPE.maxK, onIter = null, sight = SIGHT, seconds = SECONDS, acceptNeutral = false, liveShare = RECIPE.liveShare, scoreFn = (w) => evaluate(net, w, trainFights, { sight, seconds }).score } = {}) {
    const rng = net.rngFor(seed), live = typeof net.liveIndices === "function" ? net.liveIndices() : null; let best = start ? Float32Array.from(start) : net.handWeights();
    let bestScore = scoreFn(best), improved = 0, neutral = 0; const history = [{ i: 0, score: bestScore }];
    for (let i = 1; i <= iters; i++) {
        const cand = live && rng() < liveShare ? mutateAt(best, live, sigma, rng, maxK) : net.mutate(best, sigma, rng, maxK), score = scoreFn(cand);
        if (score > bestScore + 1e-9) { best = cand; bestScore = score; improved++; }
        else if (acceptNeutral && score >= bestScore - 1e-9) { best = cand; neutral++; }
        if (i % 25 === 0 || i === iters) history.push({ i, score: bestScore });
        if (onIter) onIter(i, { score: bestScore, improved, neutral });
    }
    return { weights: best, trainScore: bestScore, history, iters, improved, neutral };
}
/** Put every weight that differs from the hand weights back to them whenever that does not lower the score on `trainFights`, and go round again until a pass reverts nothing (see pilot6dofPolicy.prune). Returns { weights, kept, moved, passes, trainScore }. */
export function prune(net, w, { trainFights = TRAIN_FIGHTS, sight = SIGHT, seconds = SECONDS, maxPasses = RECIPE.passes, scoreFn = (v) => evaluate(net, v, trainFights, { sight, seconds }).score } = {}) {
    const base0 = net.handWeights(), out = Float32Array.from(w);
    const differs = () => { const idx = []; for (let i = 0; i < out.length; i++) if (Math.abs(out[i] - base0[i]) > 1e-6) idx.push(i); return idx; };
    const moved = differs().length; let best = scoreFn(out), passes = 0, reverted;
    do {
        reverted = 0; passes++;
        for (const i of differs()) { const keep = out[i]; out[i] = base0[i]; const s = scoreFn(out); if (s >= best - 1e-9) { best = Math.max(best, s); reverted++; } else out[i] = keep; }
    } while (reverted > 0 && passes < maxPasses);
    return { weights: out, kept: differs().length, moved, passes, trainScore: best };
}

/** Parse `--name value` / `--flag` argv, REFUSING an option it does not know (a typo must not silently train the default recipe). */
export function parseArgs(argv) {
    const known = { net: String, runs: Number, iters: Number, seed: Number, sigma: Number, passes: Number, live: Number, out: String, write: Boolean, quiet: Boolean }, o = { ...RECIPE, net: "fruitfly", out: null, write: false, quiet: false };
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i]; if (!a.startsWith("--")) throw new Error(`unexpected argument ${JSON.stringify(a)}`);
        const k = a.slice(2); if (!(k in known)) throw new Error(`unknown option ${JSON.stringify(a)} (known: ${Object.keys(known).map((n) => "--" + n).join(", ")})`);
        if (known[k] === Boolean) o[k] = true; else { const v = argv[++i]; if (v == null) throw new Error(`${a} needs a value`); o[k] = known[k] === Number ? Number(v) : v; if (known[k] === Number && !Number.isFinite(o[k])) throw new Error(`${a} needs a number (got ${JSON.stringify(v)})`); }
    }
    if (!(o.net in DEFAULT_OUT)) throw new Error(`--net must be one of ${Object.keys(DEFAULT_OUT).join(", ")} (got ${JSON.stringify(o.net)})`);
    if (!o.out) o.out = DEFAULT_OUT[o.net];
    o.liveShare = o.live ?? RECIPE.liveShare; delete o.live;
    return o;
}
/** Does the champion qualify to ship? Pure, so the gate can drive it on made-up numbers. Beats the hand gunner's score on held-out AND audit, and loses no fights it won (wins) on either. */
export function qualifies(champ, hand) {
    const reasons = [];
    if (!(champ.heldOut.score > hand.heldOut.score)) reasons.push(`held-out score ${champ.heldOut.score.toFixed(3)} does not beat the hand gunner's ${hand.heldOut.score.toFixed(3)}`);
    if (!(champ.audit.score > hand.audit.score)) reasons.push(`audit score ${champ.audit.score.toFixed(3)} does not beat the hand gunner's ${hand.audit.score.toFixed(3)}`);
    if (!(champ.heldOut.killed >= hand.heldOut.killed)) reasons.push(`held-out kills ${champ.heldOut.killed} are behind the hand gunner's ${hand.heldOut.killed}`);
    if (!(champ.audit.killed >= hand.audit.killed)) reasons.push(`audit kills ${champ.audit.killed} are behind the hand gunner's ${hand.audit.killed}`);
    return { ok: reasons.length === 0, reasons };
}

/** `sets` (default the real ones) lets the gate fly the whole procedure on a handful of short fights: { train, heldOut, audit, seconds }. */
export function run(net, opts, log = () => {}, sets = { train: TRAIN_FIGHTS, heldOut: HELD_OUT_FIGHTS, audit: AUDIT_FIGHTS, seconds: SECONDS }) {
    const ev = { seconds: sets.seconds }, hand = net.handWeights(), handRes = { train: evaluate(net, hand, sets.train, ev), heldOut: evaluate(net, hand, sets.heldOut, ev), audit: evaluate(net, hand, sets.audit, ev) };
    log(`hand gunner (the sight's own trigger, through the network), behind the ${SIGHT} sight: train ${describeEval(handRes.train)} | held-out ${describeEval(handRes.heldOut)} | audit ${describeEval(handRes.audit)}`);
    const runs = [];
    for (let r = 0; r < opts.runs; r++) {
        const seed = opts.seed + r, t0 = Date.now(), found = train(net, { seed, iters: opts.iters, sigma: opts.sigma, maxK: opts.maxK, liveShare: opts.liveShare, trainFights: sets.train, seconds: sets.seconds, onIter: (i, st) => { if (i % 50 === 0) log(`    run ${r + 1} iteration ${i}: train ${st.score.toFixed(3)}, ${st.improved} improvements`); } });
        const out = prune(net, found.weights, { maxPasses: opts.passes, trainFights: sets.train, seconds: sets.seconds }), heldOut = evaluate(net, out.weights, sets.heldOut, ev);
        runs.push({ seed, weights: out.weights, train: out.trainScore, heldOut, improved: found.improved, neutral: found.neutral, moved: out.moved, kept: out.kept });
        log(`  run ${r + 1}/${opts.runs} seed ${seed}: train ${found.trainScore.toFixed(3)}, ${found.improved} improvements + ${found.neutral} neutral moves; pruned ${out.moved} moved weights to ${out.kept}; held-out ${describeEval(heldOut)}  [${((Date.now() - t0) / 1000).toFixed(0)} s]`);
    }
    runs.sort((a, b) => b.heldOut.score - a.heldOut.score);
    const champ = runs[0], audit = evaluate(net, champ.weights, sets.audit, ev), trainRes = evaluate(net, champ.weights, sets.train, ev);
    const champion = { seed: champ.seed, weights: champ.weights, kept: champ.kept, moved: champ.moved, train: trainRes, heldOut: champ.heldOut, audit };
    const verdict = qualifies(champion, handRes);
    log(`champion (seed ${champ.seed}, picked on held-out): train ${describeEval(trainRes)} | held-out ${describeEval(champ.heldOut)} | audit ${describeEval(audit)}`);
    const others = {}; for (const s of ["perfect", "ace", "regular"]) { const h = evaluate(net, hand, sets.audit, { ...ev, sight: s }), c = evaluate(net, champ.weights, sets.audit, { ...ev, sight: s }); others[s] = { hand: h, champion: c }; log(`  behind the ${s} sight (never trained for), audit fights: hand ${describeEval(h)} | champion ${describeEval(c)}`); }
    log(verdict.ok ? "QUALIFIES: beats the hand gunner on the held-out fights and on the audit fights." : "DOES NOT QUALIFY: " + verdict.reasons.join("; "));
    return { hand: handRes, runs, champion, verdict, others };
}
/** What the champion did behind the sights it was NOT trained for, on the audit fights, in one sentence: "perfect 1.500 -> 1.369, ace 1.500 -> 1.381, regular 1.433 -> 1.400" (the hand gunner's score, then the champion's). */
export const describeOthers = (others) => Object.entries(others).map(([k, o]) => `${k} ${o.hand.score.toFixed(3)} -> ${o.champion.score.toFixed(3)}`).join(", ");
/** The file written when the champion qualifies: the portable swek-brain-v1 blob with the recipe and the scores in `by`. */
export function blobOf(net, result, opts) {
    const c = result.champion, desc = PB.describePolicy(POLICY_ID[opts.net], net);
    const by = `sparse-mutation (1+1)-ES from the hand weights, seed ${c.seed} of ${opts.runs} runs (${opts.seed}..${opts.seed + opts.runs - 1}), sigma ${opts.sigma}, 1-${opts.maxK} weights per child, ${opts.iters} iterations (strict improvements only; ${Math.round(opts.liveShare * 100)}% of the children bred from the ${net.liveIndices().length} live weights) over the train fights (${TRAIN_FIGHTS.map((f) => f.kind + f.seed).join(",")}; ${SECONDS} s, the ${SIGHT} sight, PD-autopilot fighters), then pruned (at most ${opts.passes} passes): ${c.kept} of ${net.WEIGHT_COUNT} weights differ from the hand gunner; ` +
        `champion picked on held-out (${HELD_OUT_FIGHTS.map((f) => f.kind + f.seed).join(",")}); behind the ${SIGHT} sight: held-out ${describeEval(c.heldOut)}, audit (${AUDIT_FIGHTS.map((f) => f.kind + f.seed).join(",")}) ${describeEval(c.audit)}; the hand gunner scores ${describeEval(result.hand.audit)} on the same audit; behind the sights it was NOT trained for, on the audit fights (the hand gunner's score -> the champion's): ${describeOthers(result.others)}`;
    return PB.exportBrain(desc, c.weights, { score: Number(c.heldOut.score.toFixed(3)), by, citation: opts.net === "fruitfly" ? "male-cns Giant Fiber Circuit (Janelia FlyEM, vendor/male-cns/PROVENANCE.md)" : "plain 12-32-32-3 relu network (the GPU Brain's shape)" });
}
