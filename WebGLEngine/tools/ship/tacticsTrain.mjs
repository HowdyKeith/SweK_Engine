// WebGLEngine/tools/ship/tacticsTrain.mjs -- v4849 (the library; the command is tools/ship/trainTactics.mjs)
//
// TRAIN THE ENDLESS-SKY TACTICS WEIGHTS IN THE ARENA AND SAY WHAT IT DID. ev/esTactics.js scores a target with eight numbers (five that weigh a target, three that decide when to break off), and until v4849 the only
// vectors anyone could pick were eight hand-named presets, the one the GPU Brain serves once it has learned enough, or a file. The presets were not tuned; the 200-battle matrix at v4843 found the plainest ('scatter':
// the nearest target and nothing else) at 59% against the hand weights and 64% against the field. This searches the numbers instead, in ev/tools/es-arena.mjs, on the substrate both pages fight on (box3d, where the
// ships collide), six ships a side, against ALL EIGHT presets from BOTH sides.
//
//   * the search is a (1+1)-ES over the six numbers the arena can see (a child moves one to three of them by a gaussian, held to the learner's own ranges; a child that scores exactly what its parent did replaces it);
//   * WHAT IT CANNOT SEE IS NOT TRAINED, AND THERE ARE TWO: the arena has no player, so wPlayer (the bias toward the player) changes no battle; and nothing in it repairs a ship, so a fleeing ship's health never climbs back over the bar
//     and fleeHyst (the margin it must recover to re-engage) changes no battle either (0 of 144 battles differed under heavy fleeing, and the gate holds both). The first full run moved fleeHyst anyway and pruning put it back; every search is now given the hand
//     values (wPlayer 0.35, fleeHyst 0.12) for both, whatever its start preset's own are (scatter's wPlayer is 0), so the file carries the game's own values for the two numbers it could not measure;
//   * each search starts from a different preset (scatter, stubborn, hand, brawler), and is PRUNED toward its start: every number that differs is put back unless the score needs it;
//   * the champion of the searches is picked on 24 HELD-OUT seeds, on the league score; 40 AUDIT seeds that nothing has read grade it once;
//   * the INCUMBENT is the preset with the best field score on the HELD-OUT seeds (never the audit), and a file is written only if the champion beats the incumbent head to head by at least H2H_FLOOR battles of the
//     80 on the audit, beats the incumbent's score against the other seven presets by at least FIELD_MARGIN, leads it on the held-out seeds, and no preset leads it by LOSS_TOLERANCE battles or more.
//
// A battle is scored from the candidate's side: 1 for a win, 0.5 for a draw, 0 for a loss, plus a quarter of the survivor margin ((mine - theirs) over six) so that a search has something to climb between wins.
// "No file written" is a result.
//
//   node tools/ship/trainTactics.mjs                          # 4 runs x 300 iterations, report only
//   node tools/ship/trainTactics.mjs --workers 4              # each search in its own process: the same answer to the bit
//   node tools/ship/trainTactics.mjs --write [--out <file>]   # write brain/tacticsWeightsTrained.json when the champion qualifies
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runBattle } from "../../ev/tools/es-arena.mjs";
import * as R from "../../brain/tacticsRoster.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const DEFAULT_OUT = path.resolve(HERE, "..", "..", "brain", "tacticsWeightsTrained.json");
export const FORMAT = "swek-tactics-v1", POLICY_ID = "esTactics";
export const PHYSICS = "box3d", COUNT = 6, MAX_SECONDS = 60;
export const OPPONENTS = Object.freeze(R.PRESET_IDS.slice());
/** The six numbers a battle in the arena can see. wPlayer and fleeHyst are NOT here: nothing in the arena is a player, and nothing in it repairs a ship, so neither changes a battle. */
export const TRAIN_KEYS = Object.freeze(["wClose", "wWeak", "wThreat", "wFocus", "fleeHealth", "fleeOdds"]);
export const FIXED_KEYS = Object.freeze(R.KEYS.filter((k) => !TRAIN_KEYS.includes(k)));
/** Each search starts from one of these presets, in this order (run k starts from START_PRESETS[k % 4]). */
export const START_PRESETS = Object.freeze(["scatter", "stubborn", "hand", "brawler"]);
/** The step of a mutation, per key: 0.3 on a target weight (range -2..4), 0.06 on a flee fraction (range 0..1). */
export const STEP = Object.freeze({ wClose: 0.3, wWeak: 0.3, wThreat: 0.3, wFocus: 0.3, fleeHealth: 0.06, fleeOdds: 0.06 });
export const RECIPE = Object.freeze({ runs: 4, iters: 300, seed: 6000, train: 24 });
/** The thresholds a champion must clear, chosen before the first search was run and stated here: battles of the 80 head to head, a score against the other seven presets, and the most any preset may lead it by. */
export const H2H_FLOOR = 8, FIELD_MARGIN = 0.02, LOSS_TOLERANCE = 8;

const seedsFrom = (base, n) => Object.freeze(Array.from({ length: n }, (_, i) => base + i * 7919));
// *** THE FIRST AUDIT SET, 50001 + 7919 i, IS SPENT: two full runs read it while the design was still being corrected (the first moved fleeHyst, which no battle can see; the second moved six numbers), and an audit is read ONCE. The champion is picked
// on the held-out seeds, so it does not depend on which audit grades it; the audit below was read by nothing before the run that wrote the shipped file. ***
export const TRAIN_SEEDS = seedsFrom(30001, 24), HELD_OUT_SEEDS = seedsFrom(40001, 24), AUDIT_SEEDS = seedsFrom(60001, 40);
export const SPENT_AUDIT_SEEDS = seedsFrom(50001, 40);

const mulberry = (a) => () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const gauss = (rng) => { let u = 0, v = 0; while (!u) u = rng(); while (!v) v = rng(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };

/** A plain object of the eight numbers, in KEYS order, for a preset id or a vector. */
export const vectorOf = (x) => { const w = typeof x === "string" ? R.presetWeights(x) : x; return Object.fromEntries(R.KEYS.map((k) => [k, w[k]])); };
/** A search's start: the preset's six trainable numbers, and the two the arena cannot see (wPlayer, fleeHyst) set to the HAND values whatever the preset's own are (scatter's wPlayer is 0). That changes no battle; it keeps the game's own values in the file. */
export const HAND_FIXED = Object.freeze(Object.fromEntries(FIXED_KEYS.map((k) => [k, R.presetWeights("hand")[k]])));
export const startVector = (id) => ({ ...vectorOf(id), ...HAND_FIXED });
export const hashOf = (w) => { let h = 0x811c9dc5; for (const k of R.KEYS) h = Math.imul(h ^ Math.round(w[k] * 1e6), 0x01000193) >>> 0; return h.toString(16).padStart(8, "0"); };

/** One battle from the candidate's side: weights `mine` against `theirs`, the candidate on side `side`. Returns { win, loss, draw, share, margin, score, ticks }. */
export function fight(mine, theirs, seed, side) {
    const r = runBattle({ seed, weightsA: side === "A" ? mine : theirs, weightsB: side === "A" ? theirs : mine, count: COUNT, maxSeconds: MAX_SECONDS, physics: PHYSICS });
    const sm = side === "A" ? r.survA : r.survB, st = side === "A" ? r.survB : r.survA, me = side;
    const win = r.winner === me, draw = r.winner === "draw", margin = (sm - st) / COUNT, share = win ? 1 : draw ? 0.5 : 0;
    return { win, loss: !win && !draw, draw, share, margin, score: share + 0.25 * margin, ticks: r.ticks };
}

/**
 * The candidate against each opponent (preset ids) over `seeds`, from BOTH sides: { score, share, wins, losses, draws, battles, byOpponent: { id: { score, share, wins, losses, draws, battles } } }.
 * `share` is the win rate with a draw as a half; `score` adds the survivor margin the search climbs.
 */
export function evaluate(w, seeds, opponents = OPPONENTS) {
    const by = {}; let tot = { score: 0, share: 0, wins: 0, losses: 0, draws: 0, battles: 0 };
    for (const id of opponents) {
        const o = vectorOf(id), a = { score: 0, share: 0, wins: 0, losses: 0, draws: 0, battles: 0 };
        for (const seed of seeds) for (const side of ["A", "B"]) {
            const f = fight(w, o, seed, side); a.battles++; a.score += f.score; a.share += f.share; if (f.win) a.wins++; else if (f.loss) a.losses++; else a.draws++;
        }
        by[id] = { ...a, score: a.score / a.battles, share: a.share / a.battles };
        for (const k of Object.keys(tot)) tot[k] += a[k];
    }
    return { ...tot, score: tot.score / tot.battles, share: tot.share / tot.battles, byOpponent: by };
}

/** A child of `w`: one to three of the six trainable numbers moved by a gaussian of their STEP times `scale`, held to the learner's ranges. wPlayer and fleeHyst are never touched. */
export function mutate(w, rng, scale = 1) {
    const o = { ...w }, k = 1 + Math.floor(rng() * 3);
    for (let j = 0; j < k; j++) {
        const key = TRAIN_KEYS[Math.floor(rng() * TRAIN_KEYS.length)], [lo, hi] = R.RANGES[key];
        o[key] = Math.min(hi, Math.max(lo, o[key] + gauss(rng) * STEP[key] * scale));
    }
    return o;
}

const round = (w) => { const o = { ...w }; for (const k of TRAIN_KEYS) o[k] = Math.round(o[k] * 1000) / 1000; return o; };

/** (1+1)-ES from `start` on `trainSeeds` against `opponents`. Deterministic for a seed. Returns { weights, trainScore, improved, neutral }. */
export function train({ start, seed, iters, trainSeeds = TRAIN_SEEDS, opponents = OPPONENTS }) {
    const rng = mulberry(seed); let best = typeof start === "string" ? startVector(start) : vectorOf(start), bestScore = evaluate(best, trainSeeds, opponents).score, improved = 0, neutral = 0;
    for (let i = 0; i < iters; i++) {
        const cand = mutate(best, rng), s = evaluate(cand, trainSeeds, opponents).score;
        if (s > bestScore + 1e-9) { best = cand; bestScore = s; improved++; } else if (s >= bestScore - 1e-9) { best = cand; neutral++; }
    }
    return { weights: best, trainScore: bestScore, improved, neutral };
}

/** Put every trainable number that differs from `toward` back to it, one at a time, whenever that does not lower the score on `trainSeeds`; go round again until a whole pass reverts nothing. Returns { weights, kept, moved, passes, trainScore }. */
export function prune(w, { toward, trainSeeds = TRAIN_SEEDS, opponents = OPPONENTS }) {
    const base = typeof toward === "string" ? startVector(toward) : vectorOf(toward), out = { ...w }, differs = () => TRAIN_KEYS.filter((k) => Math.abs(out[k] - base[k]) > 1e-9), moved = differs().length;
    let best = evaluate(out, trainSeeds, opponents).score, passes = 0, reverted;
    do {
        reverted = 0; passes++;
        for (const k of differs()) {
            const keep = out[k]; out[k] = base[k];
            const s = evaluate(out, trainSeeds, opponents).score;
            if (s >= best - 1e-9) { best = Math.max(best, s); reverted++; } else out[k] = keep;
        }
    } while (reverted > 0);
    return { weights: out, kept: differs().length, moved, passes, trainScore: best };
}

/** Parse `--name value` / `--flag` argv, REFUSING an option it does not know (a typo must not silently train the default recipe). */
export function parseArgs(argv) {
    const known = { runs: Number, iters: Number, seed: Number, train: Number, workers: Number, one: Number, out: String, write: Boolean, quiet: Boolean }, o = { ...RECIPE, workers: 1, one: null, out: DEFAULT_OUT, write: false, quiet: false };
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i]; if (!a.startsWith("--")) throw new Error(`unexpected argument ${JSON.stringify(a)}`);
        const k = a.slice(2); if (!(k in known)) throw new Error(`unknown option ${JSON.stringify(a)} (known: ${Object.keys(known).map((n) => "--" + n).join(", ")})`);
        if (known[k] === Boolean) o[k] = true; else { const v = argv[++i]; if (v == null) throw new Error(`${a} needs a value`); o[k] = known[k] === Number ? Number(v) : v; if (known[k] === Number && !Number.isFinite(o[k])) throw new Error(`${a} needs a number, got ${JSON.stringify(v)}`); }
    }
    if (o.train < 1 || o.train > TRAIN_SEEDS.length) throw new Error(`--train must be 1..${TRAIN_SEEDS.length}, got ${o.train}`);
    return o;
}

const lead = (r) => r.wins - r.losses;

/**
 * Does the champion qualify to ship? Pure, so the gate can drive it on made-up numbers.
 * champ: { h2h (the champion against the incumbent on the audit, an evaluate() entry), fieldChamp, fieldIncumbent (shares against the other seven presets), heldOut (the champion against the incumbent), byPreset: { id: { wins, losses } } }
 */
export function qualifies(champ) {
    const reasons = [];
    if (!(lead(champ.h2h) >= H2H_FLOOR)) reasons.push(`audit: leads the incumbent by ${lead(champ.h2h)} battles (${champ.h2h.wins} won, ${champ.h2h.losses} lost), under the floor of ${H2H_FLOOR}`);
    if (!(champ.fieldChamp >= champ.fieldIncumbent + FIELD_MARGIN)) reasons.push(`audit: its share against the other seven presets is ${champ.fieldChamp.toFixed(3)}, not ${FIELD_MARGIN} above the incumbent's ${champ.fieldIncumbent.toFixed(3)}`);
    if (!(lead(champ.heldOut) > 0)) reasons.push(`held-out: ${champ.heldOut.wins} won and ${champ.heldOut.losses} lost against the incumbent is not a lead`);
    for (const [id, r] of Object.entries(champ.byPreset)) if (r.losses - r.wins >= LOSS_TOLERANCE) reasons.push(`audit: preset '${id}' leads it by ${r.losses - r.wins} battles (${r.losses} to ${r.wins})`);
    return { ok: reasons.length === 0, reasons };
}

/** The incumbent: the preset with the best score against the whole field on the HELD-OUT seeds (ties to the earlier preset). Returns { id, share, table }. */
let incumbentTable = null;   // a pure function of the held-out seeds and the presets, so it is computed once per process (the gate calls finish() several times)
export function incumbentOf(log = () => {}) {
    if (!incumbentTable) {
        incumbentTable = OPPONENTS.map((id) => ({ id, share: evaluate(vectorOf(id), HELD_OUT_SEEDS, OPPONENTS.filter((o) => o !== id)).share }));
        incumbentTable.sort((a, b) => b.share - a.share || OPPONENTS.indexOf(a.id) - OPPONENTS.indexOf(b.id));
    }
    const table = incumbentTable.map((t) => ({ ...t }));
    log(`incumbent (best preset on the held-out seeds against the other seven): ${table.map((t) => `${t.id} ${(100 * t.share).toFixed(1)}%`).join(", ")}`);
    return { id: table[0].id, share: table[0].share, table };
}

const trainSeedsOf = (opts) => TRAIN_SEEDS.slice(0, opts.train);
const startOf = (opts, k) => START_PRESETS[k % START_PRESETS.length];

/** One independent search (run number k). Deterministic for (opts, k). Returns { k, seed, start, weights, trainScore, improved, neutral, moved, kept }. */
export function searchOne(opts, k) {
    const seed = opts.seed + k, start = startOf(opts, k), trainSeeds = trainSeedsOf(opts);
    const found = train({ start, seed, iters: opts.iters, trainSeeds });
    const out = prune(found.weights, { toward: start, trainSeeds });
    const rounded = round(out.weights), trainScore = evaluate(rounded, trainSeeds).score;
    return { k, seed, start, weights: rounded, trainScore, improved: found.improved, neutral: found.neutral, moved: out.moved, kept: TRAIN_KEYS.filter((key) => Math.abs(rounded[key] - startVector(start)[key]) > 1e-9).length };
}

/** The champion of `runs` (each from searchOne), the incumbent chosen on held-out, the audit read once, and the verdict. */
export function finish(opts, runs, log = () => {}) {
    const inc = incumbentOf(log), incW = vectorOf(inc.id), others = OPPONENTS.filter((o) => o !== inc.id);
    const scored = runs.map((r) => {
        const held = evaluate(r.weights, HELD_OUT_SEEDS);
        log(`  run ${r.k + 1}/${opts.runs} seed ${r.seed} from ${r.start}: train ${r.trainScore.toFixed(3)}, ${r.improved} improvements + ${r.neutral} neutral moves; ${r.moved} moved numbers pruned to ${r.kept}; held-out field score ${held.score.toFixed(3)} (share ${(100 * held.share).toFixed(1)}%)`);
        return { ...r, held };
    });
    scored.sort((a, b) => b.held.score - a.held.score || a.k - b.k);
    const c = scored[0], w = c.weights;
    // the audit is read ONCE, after the choice: the champion against every preset, and the incumbent against the same seven others
    const audit = evaluate(w, AUDIT_SEEDS), h2h = audit.byOpponent[inc.id], fieldChamp = evaluate(w, AUDIT_SEEDS, others).share, fieldIncumbent = evaluate(incW, AUDIT_SEEDS, others).share;
    const heldOut = evaluate(w, HELD_OUT_SEEDS, [inc.id]);
    const champion = { seed: c.seed, start: c.start, weights: w, kept: c.kept, moved: c.moved, held: c.held, audit, h2h, fieldChamp, fieldIncumbent, heldOut, byPreset: audit.byOpponent };
    const verdict = qualifies(champion);
    log(`champion (seed ${c.seed}, from ${c.start}, picked on the held-out field score): ${hashOf(w)} ${R.summary(w)}`);
    log(`  audit (${AUDIT_SEEDS.length} seeds x 2 sides = ${audit.battles / OPPONENTS.length} battles a preset): head to head with the incumbent '${inc.id}' ${h2h.wins} won, ${h2h.losses} lost, ${h2h.draws} drawn; share against the other seven ${(100 * fieldChamp).toFixed(1)}% (the incumbent's ${(100 * fieldIncumbent).toFixed(1)}%)`);
    log("  against each preset: " + OPPONENTS.map((id) => `${id} ${audit.byOpponent[id].wins}-${audit.byOpponent[id].losses}`).join(", "));
    log(verdict.ok ? "QUALIFIES: beats the incumbent head to head on seeds nothing has read, and beats its record against the rest of the field." : "DOES NOT QUALIFY: " + verdict.reasons.join("; "));
    return { incumbent: inc, runs: scored, champion, verdict };
}

/** Everything in this process, one search after another. */
export function run(opts, log = () => {}) {
    const runs = []; for (let k = 0; k < opts.runs; k++) runs.push(searchOne(opts, k));
    return finish(opts, runs, log);
}

/** The file written when the champion qualifies: the eight numbers in a { weights } wrapper the roster's sanitizer reads, with the recipe and the numbers it was graded on in `by`. */
export function blobOf(result, opts) {
    const c = result.champion, inc = result.incumbent, a = c.audit, rng = (s) => `${s[0]}..${s[s.length - 1]}`;
    const by = `fitted in ev/tools/es-arena.mjs on the box3d substrate (ships collide), ${COUNT} ships a side, ${MAX_SECONDS} s cap, against all eight presets from both sides: (1+1)-ES over the six numbers the arena can see, seed ${c.seed} of ${opts.runs} searches (${opts.seed}..${opts.seed + opts.runs - 1}) ` +
        `from the preset '${c.start}', ${opts.iters} iterations over ${opts.train} train seeds [${rng(TRAIN_SEEDS.slice(0, opts.train))}], pruned toward its start (${c.kept} of the 6 numbers differ from it); wPlayer and fleeHyst are not trained (nothing in the arena is a player, and nothing repairs a ship) and keep the hand values ${c.weights.wPlayer} and ${c.weights.fleeHyst} whatever the start preset's own are; ` +
        `champion picked on the held-out field score [${rng(HELD_OUT_SEEDS)}]; incumbent '${inc.id}' (best preset on the held-out seeds); audit seeds [${rng(AUDIT_SEEDS)}], ${a.battles / OPPONENTS.length} battles a preset: ` +
        `${c.h2h.wins} won, ${c.h2h.losses} lost, ${c.h2h.draws} drawn against '${inc.id}'; share against the other seven presets ${(100 * c.fieldChamp).toFixed(1)}% (the incumbent's ${(100 * c.fieldIncumbent).toFixed(1)}%); against each preset: ` +
        OPPONENTS.map((id) => `${id} ${a.byOpponent[id].wins}-${a.byOpponent[id].losses}`).join(", ");
    return { format: FORMAT, policy: POLICY_ID, weights: vectorOf(c.weights), score: Number(c.held.score.toFixed(3)), by, citation: "ev/esTactics.js (eight numbers scored by a dot product -- not the fly-wired network the pilots run on)" };
}
