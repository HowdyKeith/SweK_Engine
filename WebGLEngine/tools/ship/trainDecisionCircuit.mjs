// WebGLEngine/tools/ship/trainDecisionCircuit.mjs -- UNNUMBERED (the version is chosen at ship time) (the command line is tools/ship/trainDecisionCircuitCmd.mjs; the policies are brain/circuitSeat.mjs; the registration brain/DECISION_CIRCUIT_VS_TWIN_WIP.md; the gate tools/ship/trainDecisionCircuit-selfcheck.mjs)
//
// THE TRAINING OF THE DECISION CIRCUITS (decision D6 of the registration): three families -- `cx` (the reservoir with its memory), `nostate` (the same, state zeroed before every update), `plain` (a relu net of the same weight count) -- each by the recipe of rung 4a that tools/ship/trainNeedsCircuit.mjs
// holds (RECIPE: 4 searches x 300 children, sigma 0.3, 1 to 4 weights a child, a prune toward the start with a budget of 60 evaluations; fitness the mean survey score on TRAIN_SMALL under the noisy gauge), starting from the RE-BASED rule (every readout at zero: the untrained circuit IS `rule-low06`). The recipe's constants, the search
// and the sets are IMPORTED from trainNeedsCircuit.mjs, not copied.
//   ONE JOB IS ONE SEARCH (family, k): the record keeps its seed, its pruned weights (to six decimals; the held-out and pool scores are taken from THESE weights, so the champion that is flown is the champion that was chosen), its train score, the HELD-OUT score, the POOL crushed count, and the START's three numbers (the
//   untrained pilot on the same sets). Twelve jobs; resumable; any number of worker processes (--workers).
//   THE CHAMPION of a family is chosen from its records by `championOf` BEFORE any audit is touched, and the audit is NOT read here: ELIGIBLE = crushed in no more POOL runs than the start; the best HELD-OUT of the eligible, ties to the lower k; none eligible -> the family IS `rule-low06` (Round 3 section 7).
// Pure apart from the files it reads and the processes it starts. No clock, no Math.random.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import * as T from "../../brain/needsTask.mjs";
import * as CS from "../../brain/circuitSeat.mjs";
import { mulberry } from "../../brain/pilotSubPolicy.mjs";
import { RECIPE, CONDITIONS, setsOf, search, evaluateW, loadCircuit } from "./trainNeedsCircuit.mjs";
import { readRecords } from "./trainSubCircuits.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url)), ENG = path.resolve(HERE, "..", "..");
export const SEARCH_BASE = 96500, FAMILIES = Object.freeze(["cx", "nostate", "plain"]), OUT_FILE = "brain/decisionCircuitTraining.jsonl";
export { RECIPE };
/** The search seed of a job: SEARCH_BASE + 10 x the family's place (cx 0, nostate 1, plain 2) + k. */
export const seedOf = (s) => SEARCH_BASE + 10 * FAMILIES.indexOf(s.family) + s.index;
export const specName = (s) => `${s.family}:${s.index}`;
/** Specs: "all", or a comma list of `family:K` and `family:K-L` (K, L from 0 to the recipe's runs - 1 is not checked here; the recipe decides). */
export function parseSpecs(text, runs = RECIPE.runs) {
    const out = [], seen = new Set(), t = String(text).trim();
    if (t === "all") return FAMILIES.flatMap((family) => Array.from({ length: runs }, (_, index) => ({ family, index })));
    for (const raw of t.split(",")) {
        const part = raw.trim(); if (!part) throw new Error(`trainDecisionCircuit.parseSpecs: an empty spec in ${JSON.stringify(text)}`);
        const m = /^([a-z]+):(\d+)(?:-(\d+))?$/.exec(part);
        if (!m) throw new Error(`trainDecisionCircuit.parseSpecs: cannot read ${JSON.stringify(part)} (a spec is family:K or family:K-L, or all)`);
        if (!FAMILIES.includes(m[1])) throw new Error(`trainDecisionCircuit.parseSpecs: unknown family ${JSON.stringify(m[1])} (known: ${FAMILIES.join(", ")})`);
        const lo = Number(m[2]), hi = m[3] === undefined ? lo : Number(m[3]);
        if (hi < lo) throw new Error(`trainDecisionCircuit.parseSpecs: the range ${JSON.stringify(part)} runs backwards`);
        if (hi >= runs) throw new Error(`trainDecisionCircuit.parseSpecs: ${JSON.stringify(part)} is past the recipe's ${runs} searches (0 to ${runs - 1})`);
        for (let k = lo; k <= hi; k++) { const name = `${m[1]}:${k}`; if (seen.has(name)) throw new Error(`trainDecisionCircuit.parseSpecs: ${name} is named twice`); seen.add(name); out.push({ family: m[1], index: k }); }
    }
    return out;
}
let FAM = null;
/** The three policies over the vendored heading-loop circuit (built once). */
export const familyPolicy = (family) => { FAM = FAM || CS.familiesOf(loadCircuit()); if (!FAM[family]) throw new Error(`trainDecisionCircuit.familyPolicy: unknown family ${JSON.stringify(family)}`); return FAM[family]; };
const round6 = (w) => Float32Array.from(w, (v) => Math.round(v * 1e6) / 1e6);

/** One search of one family, graded: the record the file keeps. `opts`: recipe, smoke, sets, policy (a test hands one in), gauge. THE AUDITS ARE NOT READ. */
export function runSearch(spec, opts = {}, log = () => {}) {
    const recipe = { ...RECIPE, ...(opts.recipe || {}) }, sets = opts.sets || setsOf({ smoke: !!opts.smoke }), gauge = opts.gauge === undefined ? CONDITIONS.noisy : opts.gauge, Pol = opts.policy || familyPolicy(spec.family), hand = Pol.handWeights();
    const startTrain = evaluateW(Pol, hand, sets.train, gauge), startHeld = evaluateW(Pol, hand, sets.heldOut, gauge), startPool = evaluateW(Pol, hand, sets.pool, gauge);
    const seed = seedOf(spec), r = search(Pol, seed, spec.index, recipe, sets.train, gauge), w = round6(r.weights);
    const held = evaluateW(Pol, w, sets.heldOut, gauge), pool = evaluateW(Pol, w, sets.pool, gauge);
    log(`  ${specName(spec)} (seed ${seed}): ${r.moved} moved weights pruned to ${r.kept}, train ${r.trainScore.toFixed(4)} (start ${startTrain.score.toFixed(4)}), held-out ${held.score.toFixed(4)} (start ${startHeld.score.toFixed(4)}), pool crushed ${pool.crashed} (start ${startPool.crashed})`);
    return { spec: specName(spec), family: spec.family, index: spec.index, seed, smoke: !!opts.smoke, recipe, weightCount: Pol.WEIGHT_COUNT, trainScore: r.trainScore, improved: r.improved, neutral: r.neutral, moved: r.moved, kept: r.kept, pruneEvals: r.pruneEvals,
        heldOut: held.score, poolCrashed: pool.crashed, start: { train: startTrain.score, heldOut: startHeld.score, poolCrashed: startPool.crashed }, weights: Array.from(w) };
}

/** The champion of a family from its records: { record, eligible: [...], none: bool }. ELIGIBLE = poolCrashed no more than the start's; best heldOut, ties to the lower k; none -> the family IS the rule. */
export function championOf(records, family) {
    const rs = records.filter((r) => r.family === family).sort((a, b) => a.index - b.index);
    const eligible = rs.filter((r) => r.poolCrashed <= r.start.poolCrashed).sort((a, b) => b.heldOut - a.heldOut || a.index - b.index);
    return { family, searches: rs.length, eligible: eligible.length, record: eligible[0] || null, none: !eligible[0] };
}
/** The checks of the training records: 12 searches (3 families x runs), one record each, one recipe, the same start numbers within a family, a weight count that fits. Returns the failures. */
export function checksOf(records, runs = RECIPE.runs) {
    const f = [];
    for (const fam of FAMILIES) {
        const rs = records.filter((r) => r.family === fam), idx = rs.map((r) => r.index).sort((a, b) => a - b);
        if (idx.join() !== Array.from({ length: runs }, (_, i) => i).join()) f.push(`${fam} has the searches ${idx.join(",") || "none"} (it needs 0 to ${runs - 1}, once each)`);
        if (rs.some((r) => JSON.stringify(r.recipe) !== JSON.stringify(rs[0].recipe))) f.push(`${fam} has records of more than one recipe`);
        if (rs.some((r) => r.start.train !== rs[0].start.train || r.start.heldOut !== rs[0].start.heldOut || r.start.poolCrashed !== rs[0].start.poolCrashed)) f.push(`${fam}'s records disagree about the START (the untrained pilot is one pilot)`);
        if (rs.some((r) => !Array.isArray(r.weights) || r.weights.length !== r.weightCount)) f.push(`${fam} has a record whose weights do not fit its count`);
    }
    const starts = FAMILIES.map((fam) => records.find((r) => r.family === fam)).filter(Boolean);
    if (starts.length === FAMILIES.length && starts.some((r) => r.start.train !== starts[0].start.train || r.start.heldOut !== starts[0].start.heldOut || r.start.poolCrashed !== starts[0].start.poolCrashed)) f.push("the three families do not start from the same numbers (every untrained circuit is rule-low06)");
    return f;
}
const f4 = (x) => (Number.isFinite(x) ? x.toFixed(4) : String(x));
/** The training ledger (registered section 4): per family the eligible searches, the champion, its train and held-out scores against the start's, the weights that moved. */
export function reportLines(records) {
    const lines = [], fails = checksOf(records);
    if (fails.length) for (const x of fails) lines.push(`CHECK FAILED -- ${x}`); else lines.push("checks: three families of four searches, one recipe, one start");
    for (const fam of FAMILIES) {
        const c = championOf(records, fam), rs = records.filter((r) => r.family === fam).sort((a, b) => a.index - b.index);
        if (!rs.length) { lines.push(`  ${fam.padEnd(8)} no records`); continue; }
        const s0 = rs[0].start;
        lines.push(`  ${fam.padEnd(8)} ${rs[0].weightCount} weights; start train ${f4(s0.train)} held-out ${f4(s0.heldOut)} pool crushed ${s0.poolCrashed}; ${c.eligible} of ${c.searches} searches eligible; ` + (c.none ? "NO ELIGIBLE CHAMPION: the family IS rule-low06" : `champion k ${c.record.index}: train ${f4(c.record.trainScore)}, held-out ${f4(c.record.heldOut)}, pool crushed ${c.record.poolCrashed}, ${c.record.kept} weights kept of ${c.record.moved} moved`));
        for (const r of rs) lines.push(`      k ${r.index}: train ${f4(r.trainScore)}, held-out ${f4(r.heldOut)}, pool crushed ${r.poolCrashed}, moved ${r.moved}, kept ${r.kept}${r.poolCrashed <= r.start.poolCrashed ? "" : " NOT ELIGIBLE"}`);
    }
    return lines;
}

// ---- the command --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
export function parseArgs(argv) {
    const [cmd, ...rest] = argv;
    if (cmd !== "run" && cmd !== "report") throw new Error(`the first word must be run or report, got ${JSON.stringify(cmd)}`);
    const known = cmd === "run" ? { specs: String, out: String, workers: Number, runs: Number, iters: Number, sigma: Number, maxK: Number, "prune-budget": Number, one: String, smoke: Boolean, quiet: Boolean } : { in: String, "allow-smoke": Boolean }, given = {};
    for (let i = 0; i < rest.length; i++) {
        const a = rest[i]; if (!a.startsWith("--")) throw new Error(`unexpected argument ${JSON.stringify(a)}`);
        const k = a.slice(2); if (!(k in known)) throw new Error(`unknown option ${JSON.stringify(a)} (known for ${cmd}: ${Object.keys(known).map((n) => "--" + n).join(", ")})`);
        if (known[k] === Boolean) given[k] = true; else { const v = rest[++i]; if (v == null || v.startsWith("--")) throw new Error(`${a} needs a value`); given[k] = known[k] === Number ? Number(v) : v; if (known[k] === Number && !Number.isFinite(given[k])) throw new Error(`${a} needs a number, got ${JSON.stringify(v)}`); }
    }
    if (cmd === "report") { if (!given.in) throw new Error("report needs --in <results file>"); return { cmd, in: given.in, allowSmoke: !!given["allow-smoke"] }; }
    if (!given.one && !given.specs) throw new Error("run needs --specs <list> (all, or a list such as cx:0-3,plain:0-3)");
    if (!given.one && !given.out) throw new Error("run needs --out <results file>");
    const o = { cmd, specs: given.specs || given.one, one: given.one || null, out: given.out || null, workers: given.workers ?? 1, recipe: { runs: given.runs ?? RECIPE.runs, iters: given.iters ?? RECIPE.iters, sigma: given.sigma ?? RECIPE.sigma, maxK: given.maxK ?? RECIPE.maxK, pruneBudget: given["prune-budget"] ?? RECIPE.pruneBudget }, smoke: !!given.smoke, quiet: !!given.quiet };
    for (const [k, v] of [["workers", o.workers], ["runs", o.recipe.runs], ["iters", o.recipe.iters], ["maxK", o.recipe.maxK]]) if (!(Number.isInteger(v) && v >= 1)) throw new Error(`--${k} must be a whole number of 1 or more, got ${v}`);
    if (!(o.recipe.sigma > 0)) throw new Error(`--sigma must be above 0, got ${o.recipe.sigma}`);
    if (!(Number.isInteger(o.recipe.pruneBudget) && o.recipe.pruneBudget >= 0)) throw new Error(`--prune-budget must be a whole number of 0 or more, got ${o.recipe.pruneBudget}`);
    parseSpecs(o.specs, o.recipe.runs); if (o.one && parseSpecs(o.one, o.recipe.runs).length !== 1) throw new Error("--one takes a single spec");
    return o;
}
const sameRecipe = (rec, o) => ["runs", "iters", "sigma", "maxK", "pruneBudget"].every((k) => rec.recipe[k] === o.recipe[k]);
/** THE COMMAND as a function: `run` trains the searches not yet in --out (each in its own process when --workers is above 1), appending one line each, and prints the ledger; `report` prints it. Returns 0, 1 (a refusal while running) or 2 (a bad argument). `io`: { out, err, readFile, appendFile, exists, runner, spawner }. */
export async function command(argv, io = {}) {
    const out = io.out || ((m) => console.log(m)), err = io.err || ((m) => console.error(m)), readFile = io.readFile || ((f) => fs.readFileSync(path.resolve(ENG, f), "utf8")), appendFile = io.appendFile || ((f, t) => fs.appendFileSync(path.resolve(ENG, f), t)), exists = io.exists || ((f) => fs.existsSync(path.resolve(ENG, f)));
    let o; try { o = parseArgs(argv); } catch (e) { err("trainDecisionCircuit: " + e.message); return 2; }
    if (o.cmd === "report") {
        let records; try { records = readRecords(readFile(o.in)); } catch (e) { err("trainDecisionCircuit: " + e.message); return 1; }
        if (!records.length) { err("trainDecisionCircuit: the results file has no records"); return 1; }
        if (records.some((r) => r.smoke) && !o.allowSmoke) { err("trainDecisionCircuit: the file holds smoke records (a throwaway recipe on a few dives): pass --allow-smoke to read them anyway"); return 1; }
        for (const l of reportLines(records)) out(l); return 0;
    }
    const opts = { recipe: o.recipe, smoke: o.smoke }, log = o.quiet ? () => {} : out, runJob = (s, lg) => (io.runner ? io.runner(s, opts, lg) : runSearch(s, opts, lg));
    if (o.one) { const rec = runJob(parseSpecs(o.one, o.recipe.runs)[0], o.quiet ? () => {} : (m) => err(m)); out("RESULT " + JSON.stringify(rec)); return 0; }
    let have = []; if (exists(o.out)) { try { have = readRecords(readFile(o.out)); } catch (e) { err("trainDecisionCircuit: " + e.message); return 1; } }
    const stale = have.filter((r) => !!r.smoke !== o.smoke || !sameRecipe(r, o));
    if (stale.length) { err(`trainDecisionCircuit: ${o.out} holds ${stale.length} record(s) of another recipe or a smoke run (${stale.map((r) => r.spec).join(", ")}): it is not mixed with this run -- use another --out`); return 1; }
    const specs = parseSpecs(o.specs, o.recipe.runs), done = new Set(have.map((r) => r.spec)), todo = specs.filter((s) => !done.has(specName(s))), records = [...have];
    log(`[trainDecisionCircuit] ${specs.length} searches, ${specs.length - todo.length} already in ${o.out}, ${todo.length} to run; ${o.workers} worker(s); recipe ${o.recipe.runs} x ${o.recipe.iters}${o.smoke ? " (SMOKE)" : ""}`);
    const spawner = io.spawner || ((spec) => runChild(spec, o)), queue = [...todo];
    const worker = async () => { while (queue.length) { const s = queue.shift(), rec = o.workers > 1 ? await spawner(s) : runJob(s, o.quiet ? () => {} : (m) => log(m)); appendFile(o.out, JSON.stringify(rec) + "\n"); records.push(rec); log(`[trainDecisionCircuit] ${specName(s)} done`); } };
    try { await Promise.all(Array.from({ length: Math.min(o.workers, queue.length) }, worker)); } catch (e) { err("trainDecisionCircuit: " + e.message + " (the records finished so far are in " + o.out + "; run the same command again to resume)"); return 1; }
    for (const l of reportLines(records)) out(l);
    return 0;
}
/** One search in a child process (this command with --one; `script` is for the gate): resolves the record. */
export function runChild(spec, o, script = path.join(HERE, "trainDecisionCircuitCmd.mjs")) {
    return new Promise((resolve, reject) => {
        const args = [script, "run", "--one", specName(spec), "--runs", String(o.recipe.runs), "--iters", String(o.recipe.iters), "--sigma", String(o.recipe.sigma), "--maxK", String(o.recipe.maxK), "--prune-budget", String(o.recipe.pruneBudget), "--quiet", ...(o.smoke ? ["--smoke"] : [])];
        const p = spawn(process.execPath, args, { stdio: ["ignore", "pipe", "inherit"] }); let buf = "";
        p.stdout.on("data", (d) => { buf += d; }); p.on("error", reject);
        p.on("close", (code) => {
            const line = buf.split("\n").find((l) => l.startsWith("RESULT "));
            if (!line) return reject(new Error(`child for ${specName(spec)} ended with ${code} and no RESULT`));
            try { resolve(JSON.parse(line.slice(7))); } catch (e) { reject(new Error(`child for ${specName(spec)} printed a RESULT that is not JSON: ${e.message}`)); }
        });
    });
}
