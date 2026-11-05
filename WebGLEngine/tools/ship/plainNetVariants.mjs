// WebGLEngine/tools/ship/plainNetVariants.mjs -- UNNUMBERED (the version is chosen at ship time) (the library; the command is tools/ship/plainNetVariantsCmd.mjs; the gate is tools/ship/plainNetVariants-selfcheck.mjs)
//
// THE PLAIN-NET CONTROL ACROSS ARCHITECTURES, AS REGISTERED IN brain/PLAIN_NET_VARIANTS_WIP.md (written before this file existed; backlog `fly-plain-net-variants`). The first round (brain/PLAIN_NET_CONTROL_WIP.md, tools/ship/plainNetStudy.mjs) read NOT SUPPORTED on all four cells of rung 4b: a plain relu net with the circuit's senses and its number of trained WEIGHTS keeps the real wiring's gain.
// It named two things it did not run, and this runs them:
//   MC  relu, one hidden layer of the circuit's number of central CELLS: 42 (P/B), 47 (P/whole), 5 (E/E), 47 (E/whole) units, 382 / 427 / 49 / 427 weights (the first round's MN: 65 / 72 / 9 / 72 units, 589 / 652 / 85 / 652 weights)
//   MT  tanh, MN's widths and weight counts
//   eight pilots a cell in each family (64), the first round's recipe (4 searches x 300 children, sigma 0.3, prune budget 60) unchanged, init seed 4811 + ordinal, search seeds 80000 + 10 x ordinal, ordinal 16 c + 8 f + k (c the cell in the order P/B, P/whole, E/E, E/whole; f 0 for MC and 1 for MT)
//   NOTHING IS RE-FLOWN: the variants are flown on the first round's own audits (4b-P seeds 86001-86060, 4b-E 88001-88048), each champion once, and set against the real-wiring NO STATE circuits and the references that brain/plainNetStudy.jsonl keeps. They are trained on the 4b training dives and chosen on the held-out dives; no audit selects anything.
// THE TEST is the first round's, per family and cell (tools/ship/plainNetStudy.mjs cellReading, called unchanged on the 4 REAL circuits and the 8 variants relabelled as its plain family): validity, then the exact one-sided permutation test (real above variant, 495 splits, p <= 0.05), the margin rule, the share of REAL's gain kept.
// THE READING: (a) HOLDS iff both families read NOT SUPPORTED overall and each keeps at least 90 percent of REAL's gain on at least two audits in at least three cells; (b) BREAKS FOR a family iff it reads SUPPORTED or MIXED; (c) otherwise NOT EXTENDED, with the clause.
// Pure apart from the files it reads and the processes it starts. No clock, no Math.random.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import * as T from "../../brain/subTask.mjs";
import * as AS from "../../brain/autopilotSub.mjs";
import * as P from "../../brain/pilotSubPlainNet.mjs";
import * as PS from "./plainNetStudy.mjs";
import * as TR from "./trainSubVestibular.mjs";
import { meanOf, sdOf, readRecords, MIN_EDGE, SD_FACTOR } from "./trainSubCircuits.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const ENG = path.resolve(HERE, "..", "..");
export const STUDY_FILE = "brain/rig-results/plainNetStudy.jsonl", OUT_FILE = "brain/plainNetVariants.jsonl";
export const CELL_NAMES = PS.CELL_NAMES, CELLS = PS.CELLS, AUDITS = PS.AUDITS, RECIPE = PS.RECIPE;
export const FAMILIES = Object.freeze({ mc: Object.freeze({ id: "mc", n: 8, offset: 0, activation: "relu" }), mt: Object.freeze({ id: "mt", n: 8, offset: 8, activation: "tanh" }) });
export const CELL_UNITS = Object.freeze({ "P/B": 42, "P/whole": 47, "E/E": 5, "E/whole": 47 });
export const PER_CELL = 16, SEARCH_BASE = 80000, INIT_BASE = 4811, START_PROBE = 4, KEEP_SHARE = 0.9;
const f3 = (v) => (Number.isFinite(v) ? v.toFixed(3) : "n/a");

// ---- jobs -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
/** The name of a job: `P/B/mc:3`. */
export const specName = (s) => `${s.task}/${s.arm}/${s.family}:${s.index}`;
/** Where a pilot sits in the fixed order: 16 a cell, MC 0-7 then MT 8-15. */
export const ordinalOf = (s) => {
    const c = CELL_NAMES.indexOf(`${s.task}/${s.arm}`);
    if (c < 0 || !FAMILIES[s.family] || !Number.isInteger(s.index) || s.index < 0 || s.index >= FAMILIES[s.family].n) throw new Error(`plainNetVariants.ordinalOf: ${JSON.stringify(s)} is not a pilot of the study`);
    return PER_CELL * c + FAMILIES[s.family].offset + s.index;
};
export const seedBaseOf = (s) => SEARCH_BASE + 10 * ordinalOf(s);
export const initSeedOf = (s) => INIT_BASE + ordinalOf(s);
/** All 64 pilots, in ordinal order. */
export const pilotJobs = () => CELLS.flatMap(([task, arm]) => Object.values(FAMILIES).flatMap((f) => Array.from({ length: f.n }, (_, index) => ({ kind: "pilot", task, arm, family: f.id, index }))));
/** The specs of a list `P/B/mc:0-7,E/E/mt:3`; a range expands to its members. */
export function parseSpecs(text) {
    const out = [], seen = new Set();
    for (const raw of String(text).split(",")) {
        const part = raw.trim(); if (!part) throw new Error(`plainNetVariants.parseSpecs: an empty spec in ${JSON.stringify(text)}`);
        const m = /^([A-Z])\/([A-Za-z]+)\/([a-z]+):(\d+)(?:-(\d+))?$/.exec(part);
        if (!m) throw new Error(`plainNetVariants.parseSpecs: cannot read ${JSON.stringify(part)} (a pilot is task/arm/mc:K or task/arm/mt:K-L)`);
        const [, task, arm, family, a, b] = m, lo = Number(a), hi = b === undefined ? lo : Number(b);
        if (!CELL_NAMES.includes(`${task}/${arm}`)) throw new Error(`plainNetVariants.parseSpecs: ${task}/${arm} is not one of the four cells (${CELL_NAMES.join(", ")})`);
        if (!FAMILIES[family]) throw new Error(`plainNetVariants.parseSpecs: ${JSON.stringify(family)} is not a variant family (${Object.keys(FAMILIES).join(", ")})`);
        if (hi < lo) throw new Error(`plainNetVariants.parseSpecs: the range ${a}-${b} runs backwards`);
        if (hi >= FAMILIES[family].n) throw new Error(`plainNetVariants.parseSpecs: ${part} runs past index ${FAMILIES[family].n - 1}`);
        for (let index = lo; index <= hi; index++) { const s = { kind: "pilot", task, arm, family, index }, n = specName(s); if (seen.has(n)) throw new Error(`plainNetVariants.parseSpecs: ${n} is named twice`); seen.add(n); out.push(s); }
    }
    return out;
}

// ---- the pilots ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
/** The hidden width of a job: MC the circuit's cell count, MT the weight-matched width of the first round's MN. */
export const widthsOf = (s) => (s.family === "mc" ? [CELL_UNITS[`${s.task}/${s.arm}`]] : [P.matchedHidden(PS.noStateCount(s.arm))]);
/** The plain-net pilot of a job: the init draw seeded 4811 + ordinal, the task's scales, the family's activation, the 4b evaluator. */
export const policyOf = (s, scales) => P.createPlainNetPolicy(widthsOf(s), specName(s), { seed: initSeedOf(s), scales, activation: FAMILIES[s.family].activation, evaluate: (pilot, set) => TR.evalDives(pilot, set) });

/** Train and grade one pilot on the FIRST ROUND'S sets (tools/ship/plainNetStudy.mjs setsFor). THE AUDITS ARE READ HERE, ONCE, FOR THE CHAMPION. Returns the record the file keeps. */
export function runPilot(spec, opts = {}, log = () => {}) {
    const recipe = { ...RECIPE, ...(opts.recipe || {}) }, sets = opts.sets || PS.setsFor(spec.task, { smoke: !!opts.smoke }), scales = opts.scales || TR.scalesOf(sets.train);
    const name = specName(spec), Pol = (opts.policyOf || policyOf)(spec, scales), base = seedBaseOf(spec), hand = Pol.handWeights(), startHeld = Pol.evaluate(hand, sets.heldOut), runs = [];
    const probe = sets.train.slice(0, START_PROBE), want = TR.evalDives(AS.pilot(), probe).score, got = Pol.evaluate(hand, probe).score;
    for (let k = 0; k < recipe.runs; k++) {
        const r = TR.search(Pol, base + k, k, recipe, sets.train), held = Pol.evaluate(r.weights, sets.heldOut);
        runs.push({ ...r, heldOut: held.score, heldEarly: held.early, eligible: held.early <= startHeld.early });
        log(`  ${name}: search ${k + 1}/${recipe.runs} (seed ${base + k}): ${r.moved} moved weights pruned to ${r.kept} (${r.pruneEvals} evaluations), train ${r.trainScore.toFixed(4)}, held-out ${held.score.toFixed(4)}, ended early ${held.early} (start ${startHeld.early}) ${held.early <= startHeld.early ? "eligible" : "NOT eligible"}`);
    }
    const eligible = runs.filter((r) => r.eligible).sort((a, b) => b.heldOut - a.heldOut || a.k - b.k), c = eligible[0] || null;
    const champion = c ? Object.fromEntries(AUDITS.map((a) => [a, Pol.evaluate(c.weights, sets[a])])) : null;
    return { spec: name, task: spec.task, arm: spec.arm, family: spec.family, index: spec.index, smoke: !!opts.smoke, recipe, seedBase: base, initSeed: initSeedOf(spec), widths: Pol.widths, activation: Pol.activation, weightCount: Pol.WEIGHT_COUNT, scales,
        startCheck: { same: got === want || Math.abs(got - want) < 1e-9, got, want }, champion: c ? c.seed : null, asStart: !c, startHeldEarly: startHeld.early,
        searches: runs.map((r) => ({ k: r.k, seed: r.seed, trainScore: r.trainScore, heldOut: r.heldOut, heldEarly: r.heldEarly, eligible: r.eligible, improved: r.improved, neutral: r.neutral, moved: r.moved, kept: r.kept })),
        movement: c ? { moved: c.moved, kept: c.kept, largest: Math.max(...Array.from(c.weights, (v, i) => Math.abs(v - hand[i]))) } : null, scores: { champion }, weights: c ? Array.from(c.weights, (v) => Math.round(v * 1e6) / 1e6) : null };
}

// ---- the readings ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
/** The first round's records split for a cell: { real (the 4 REAL circuits), mn (its 8 plain nets), refs (the cell's task references record) }. */
export function firstRound(records, cell) {
    const [task, arm] = cell.split("/"), real = records.filter((r) => r.family === "cmp" && r.task === task && r.arm === arm && r.group === PS.REAL_GROUP[task]), mn = records.filter((r) => r.family === "mn" && r.task === task && r.arm === arm), refs = records.find((r) => r.spec === PS.REFS[task]) || null;
    return { real, mn, refs };
}
/**
 * The reading of one family in one cell: the first round's cellReading on the 4 REAL circuits and this family's pilots (relabelled as its plain family), the share kept per audit, and the family against MN by the margin rule. Never throws on a partial file.
 * Returns { cell, family, status, test, audits, validity, n, stuck, keepsShare (audits with at least 90 percent of REAL's gain kept), againstMN }.
 */
export function familyCell(cell, family, first, variants) {
    const [task, arm] = cell.split("/"), mine = variants.filter((r) => r.task === task && r.arm === arm && r.family === family);
    const rd = PS.cellReading(cell, [...first.real, ...mine.map((r) => ({ ...r, family: "mn" }))], first.refs);
    const keeps = rd.audits.filter((x) => x.kept !== null && x.kept >= KEEP_SHARE).length;
    let againstMN = null;
    if (rd.audits.length && first.mn.length === 8) {
        const val = (rs, a) => rs.map((r) => TR.effectiveOf(r, first.refs)[a].score);
        againstMN = AUDITS.map((a) => { const v = val(mine, a), margin = meanOf(v) - meanOf(val(first.mn, a)), needs = Math.max(MIN_EDGE, SD_FACTOR * sdOf(v)); return { audit: a, margin, needs, reading: margin > needs ? "ahead" : margin < -needs ? "behind" : "tie" }; });
    }
    return { cell, family, status: rd.status, test: rd.test, audits: rd.audits, validity: rd.validity, n: mine.length, stuck: mine.filter((r) => r.asStart).length, keepsAudits: keeps, keepsCell: keeps >= 2, againstMN };
}
/** The verdict of the question from the two families' cell readings ({ mc: [4 cells], mt: [4 cells] }): { word, lines } (a), (b) or (c) of the registration. */
export function verdictOf(readings) {
    const lines = [], overall = {}, broken = [];
    for (const f of Object.keys(FAMILIES)) {
        const o = PS.overallOf(readings[f].map((c) => ({ status: c.status }))), keeps = readings[f].filter((c) => c.keepsCell).length;
        overall[f] = { ...o, keeps }; lines.push(`${f.toUpperCase()}: ${o.word} (${o.supported} of ${o.assessed} assessed cells supported); keeps ${Math.round(KEEP_SHARE * 100)} percent of REAL's gain on at least 2 audits in ${keeps} of ${CELLS.length} cells`);
        if (o.word === "SUPPORTED" || o.word === "MIXED") broken.push(f.toUpperCase());
    }
    if (broken.length) return { word: `THE FIRST ROUND'S READING BREAKS FOR ${broken.join(" AND ")}`, lines, overall };
    const holds = Object.keys(FAMILIES).every((f) => overall[f].word === "NOT SUPPORTED" && overall[f].keeps >= 3);
    if (holds) return { word: "THE FIRST ROUND'S READING HOLDS ACROSS THESE VARIANTS", lines, overall };
    const why = Object.keys(FAMILIES).flatMap((f) => (overall[f].word !== "NOT SUPPORTED" ? [`${f.toUpperCase()} reads ${overall[f].word}`] : overall[f].keeps < 3 ? [`${f.toUpperCase()} keeps the share in only ${overall[f].keeps} cells`] : []));
    return { word: `NOT EXTENDED (${why.join("; ")})`, lines, overall };
}
/** The checks of a variants file against the first round's records: { ok, rows }. */
export function checksOf(records, firstRecords) {
    const rows = []; let ok = true;
    const add = (name, pass, text) => { rows.push({ name, ok: pass, text }); if (!pass) ok = false; };
    const fc = PS.studyChecks(firstRecords);
    add("FIRST ROUND", fc.ok, fc.ok ? `the first round's own checks pass (${fc.rows.length} rows)` : `the first round's file fails its own checks: ${fc.rows.filter((r) => !r.ok).map((r) => r.name).join(", ")}`);
    const bad = records.filter((r) => !r.startCheck || r.startCheck.same !== true);
    add("START CHECK", records.length > 0 && bad.length === 0, records.length === 0 ? "no pilot in the file" : bad.length ? `${bad.length} pilot(s) do not start as the autopilot: ${bad.map((r) => r.spec).join(", ")}` : `all ${records.length} pilots start as the autopilot (the untrained pilot scores the autopilot's on ${START_PROBE} training dives)`);
    const wrong = records.filter((r) => { let w; try { w = widthsOf(r); } catch { return true; } return JSON.stringify(r.widths) !== JSON.stringify(w) || r.activation !== FAMILIES[r.family].activation; });
    add("SIZES", wrong.length === 0, wrong.length ? `${wrong.length} pilot(s) are not the registered net: ${wrong.map((r) => r.spec).join(", ")}` : "every pilot is the registered width and activation (MC 42 / 47 / 5 / 47 relu units, MT the weight-matched tanh width)");
    return { ok, rows };
}
/** The report of a variants file against the first round's records, as lines. The checks come first; if one fails the verdicts are marked NOT READ. */
export function reportLines(records, firstRecords) {
    const L = [`THE PLAIN-NET CONTROL ACROSS ARCHITECTURES (registered in brain/PLAIN_NET_VARIANTS_WIP.md): does the plain net's reading survive the circuit's cell count as its width, and a tanh activation?`, `${records.length} of ${pilotJobs().length} variant pilots in the file`];
    const checks = checksOf(records, firstRecords);
    for (const r of checks.rows) L.push(`  CHECK ${r.ok ? "PASS" : "FAIL"}  ${r.name}: ${r.text}`);
    if (!checks.ok) { L.push("A CHECK FAILED: it is stated above and the verdicts below are NOT READ."); return L; }
    const readings = {};
    for (const f of Object.keys(FAMILIES)) {
        readings[f] = CELL_NAMES.map((cell) => familyCell(cell, f, firstRound(firstRecords, cell), records));
        for (const c of readings[f]) {
            L.push(`${f.toUpperCase()} CELL ${c.cell}: ${c.status} (${c.n} of ${FAMILIES[f].n} pilots${c.stuck ? `, ${c.stuck} with no eligible champion` : ""})`);
            if (!c.audits.length) continue;
            for (const x of c.audits) L.push(`  ${x.audit}: autopilot ${f3(x.autopilot)} | REAL ${f3(x.real.mean)} | ${f.toUpperCase()} ${f3(x.plain.mean)} (sd ${f3(x.plain.sd)})${x.plainOffAutopilot ? "" : " (NOT off the autopilot)"} | REAL against it: ${x.margin.reading} (${f3(x.margin.margin)} against ${f3(x.margin.needs)}) | keeps ${Number.isFinite(x.kept) ? Math.round(100 * x.kept) + " percent" : "n/a"} of REAL's gain`);
            L.push(`  REGISTERED TEST: REAL above ${f.toUpperCase()}, U ${c.test.U} of ${c.test.max}, exact one-sided p ${c.test.p.toFixed(4)} over ${c.test.splits} splits -> ${c.test.supported ? "SUPPORTED" : "not supported"}${c.validity.learned ? "" : "; THE VARIANT DID NOT LEARN"}`);
            if (c.againstMN) L.push(`  ${f.toUpperCase()} against MN, the first round's plain net (reported; needs the larger of 0.02 and 2 sd of the variant): ${c.againstMN.map((m) => `${m.audit} ${m.reading} (${f3(m.margin)} against ${f3(m.needs)})`).join(" | ")}`);
        }
    }
    const v = verdictOf(readings);
    for (const l of v.lines) L.push(l);
    L.push(`VERDICT: ${v.word}`);
    return L;
}

// ---- the command -----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
export function parseArgs(argv) {
    const [cmd, ...rest] = argv;
    if (cmd !== "run" && cmd !== "report") throw new Error(`the first word must be run or report, got ${JSON.stringify(cmd)}`);
    const known = cmd === "run" ? { specs: String, out: String, workers: Number, runs: Number, iters: Number, sigma: Number, maxK: Number, "prune-budget": Number, one: String, smoke: Boolean, quiet: Boolean } : { in: String, study: String, "allow-smoke": Boolean }, given = {};
    for (let i = 0; i < rest.length; i++) {
        const a = rest[i]; if (!a.startsWith("--")) throw new Error(`unexpected argument ${JSON.stringify(a)}`);
        const k = a.slice(2); if (!(k in known)) throw new Error(`unknown option ${JSON.stringify(a)} (known for ${cmd}: ${Object.keys(known).map((n) => "--" + n).join(", ")})`);
        if (known[k] === Boolean) given[k] = true; else { const v = rest[++i]; if (v == null || v.startsWith("--")) throw new Error(`${a} needs a value`); given[k] = known[k] === Number ? Number(v) : v; if (known[k] === Number && !Number.isFinite(given[k])) throw new Error(`${a} needs a number, got ${JSON.stringify(v)}`); }
    }
    if (cmd === "report") { if (!given.in) throw new Error("report needs --in <results file>"); return { cmd, in: given.in, study: given.study || STUDY_FILE, allowSmoke: !!given["allow-smoke"] }; }
    if (!given.one && !given.specs) throw new Error("run needs --specs <list> (all, or a list such as P/B/mc:0-7,E/E/mt:0-7)");
    if (!given.one && !given.out) throw new Error("run needs --out <results file>");
    const text = given.specs === "all" ? pilotJobs().map(specName).join(",") : given.specs || given.one;
    const o = { cmd, specs: text, one: given.one || null, out: given.out || null, workers: given.workers ?? 1, recipe: { runs: given.runs ?? RECIPE.runs, iters: given.iters ?? RECIPE.iters, sigma: given.sigma ?? RECIPE.sigma, maxK: given.maxK ?? RECIPE.maxK, pruneBudget: given["prune-budget"] ?? RECIPE.pruneBudget }, smoke: !!given.smoke, quiet: !!given.quiet };
    for (const [k, v] of [["workers", o.workers], ["runs", o.recipe.runs], ["iters", o.recipe.iters], ["maxK", o.recipe.maxK]]) if (!(Number.isInteger(v) && v >= 1)) throw new Error(`--${k} must be a whole number of 1 or more, got ${v}`);
    if (!(o.recipe.sigma > 0)) throw new Error(`--sigma must be above 0, got ${o.recipe.sigma}`);
    if (!(Number.isInteger(o.recipe.pruneBudget) && o.recipe.pruneBudget >= 0)) throw new Error(`--prune-budget must be a whole number of 0 or more, got ${o.recipe.pruneBudget}`);
    parseSpecs(o.specs); if (o.one && parseSpecs(o.one).length !== 1) throw new Error("--one takes a single spec");
    return o;
}
const sameRecipe = (rec, o) => ["runs", "iters", "sigma", "maxK", "pruneBudget"].every((k) => rec.recipe[k] === o.recipe[k]);
/**
 * THE COMMAND, as a function: `run` trains the pilots not yet in --out (each in its own process when --workers is above 1, by --one), appending one line each, and prints the report; `report` prints it for a results file against the first round's. Returns the exit code: 0, 1 a refusal while running, 2 a bad argument.
 * `io`: { out, err, readFile, appendFile, exists, runner, spawner } for the gate.
 */
export async function command(argv, io = {}) {
    const out = io.out || ((m) => console.log(m)), err = io.err || ((m) => console.error(m)), readFile = io.readFile || ((f) => fs.readFileSync(path.resolve(ENG, f), "utf8")), appendFile = io.appendFile || ((f, t) => fs.appendFileSync(path.resolve(ENG, f), t)), exists = io.exists || ((f) => fs.existsSync(path.resolve(ENG, f)));
    let o; try { o = parseArgs(argv); } catch (e) { err("plainNetVariants: " + e.message); return 2; }
    if (o.cmd === "report") {
        let records, first; try { records = readRecords(readFile(o.in)); first = readRecords(readFile(o.study)); } catch (e) { err("plainNetVariants: " + e.message); return 1; }
        if (!records.length) { err("plainNetVariants: the results file has no records"); return 1; }
        if (records.some((r) => r.smoke) && !o.allowSmoke) { err("plainNetVariants: the file holds smoke records (a throwaway recipe on a few dives): pass --allow-smoke to read them anyway"); return 1; }
        for (const l of reportLines(records, first)) out(l); return 0;
    }
    const opts = { recipe: o.recipe, smoke: o.smoke }, log = o.quiet ? () => {} : out, runJob = (s, lg) => (io.runner ? io.runner(s, opts, lg) : runPilot(s, opts, lg));
    if (o.one) { const rec = runJob(parseSpecs(o.one)[0], o.quiet ? () => {} : (m) => err(m)); out("RESULT " + JSON.stringify(rec)); return 0; }
    let have = []; if (exists(o.out)) { try { have = readRecords(readFile(o.out)); } catch (e) { err("plainNetVariants: " + e.message); return 1; } }
    const stale = have.filter((r) => !!r.smoke !== o.smoke || !sameRecipe(r, o));
    if (stale.length) { err(`plainNetVariants: ${o.out} holds ${stale.length} record(s) of another recipe or a smoke run (${stale.map((r) => r.spec).join(", ")}): it is not mixed with this run -- use another --out`); return 1; }
    const specs = parseSpecs(o.specs), done = new Set(have.map((r) => r.spec)), todo = specs.filter((s) => !done.has(specName(s))), records = [...have];
    log(`[plainNetVariants] ${specs.length} jobs, ${specs.length - todo.length} already in ${o.out}, ${todo.length} to run; ${o.workers} worker(s); recipe ${o.recipe.runs} x ${o.recipe.iters}${o.smoke ? " (SMOKE)" : ""}`);
    const spawner = io.spawner || ((spec) => runChild(spec, o)), queue = [...todo];
    const worker = async () => { while (queue.length) { const s = queue.shift(), rec = o.workers > 1 ? await spawner(s) : runJob(s, o.quiet ? () => {} : (m) => log(m)); appendFile(o.out, JSON.stringify(rec) + "\n"); records.push(rec); log(`[plainNetVariants] ${specName(s)} done${rec.asStart ? " (no eligible champion)" : " (champion seed " + rec.champion + ")"}`); } };
    try { await Promise.all(Array.from({ length: Math.max(1, Math.min(o.workers, queue.length || 1)) }, worker)); } catch (e) { err("plainNetVariants: " + e.message + " (the records finished so far are in " + o.out + "; run the same command again to resume)"); return 1; }
    let first; try { first = readRecords(readFile(STUDY_FILE)); } catch (e) { err("plainNetVariants: the first round's file " + STUDY_FILE + " cannot be read, so there is no report: " + e.message); return 1; }
    for (const l of reportLines(records, first)) out(l);
    return 0;
}
/** One job in a child process (this command with --one; `script` is for the gate): resolves the record. */
export function runChild(spec, o, script = path.join(HERE, "plainNetVariantsCmd.mjs")) {
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
