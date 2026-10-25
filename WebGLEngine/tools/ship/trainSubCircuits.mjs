// WebGLEngine/tools/ship/trainSubCircuits.mjs -- UNNUMBERED (the version is chosen at ship time) (the library; the command is tools/ship/trainSubCircuitFamily.mjs; the gate is tools/ship/trainSubCircuits-selfcheck.mjs)
//
// THE FISH CIRCUIT AGAINST ITS CONTROLS, AS THE PRE-REGISTERED RUNG 3 OF brain/SUBMARINE_WIP.md ("The hindbrain integrator's circuit", written BEFORE any pilot was trained on it). brain/pilotSubCircuit.mjs is a submarine pilot whose
// only path from sensors to controls is a circuit's wiring (the 885-weight pilot of the vendored hindbrain-integrator circuit) and five controls made from it; this file trains each of them by the recipe of tools/ship/trainSubPilot.mjs and
// grades the family:
//   SPEC       `fish` (the circuit as vendored) or `family:K` -- er, layer, degree, sign, count -- the K-th control of that family (a seed of its own); `fish,er:0-9,layer:0-9,degree:0-9,sign:0-3,count:0-3` is STAGE A
//              (29 circuits), `er:10-19,layer:10-19,degree:10-19` is STAGE B (only if stage A reads as a pass).
//   TRAINING   exactly the recipe of every submarine pilot here: 4 independent (1+1)-ES searches (sparse mutation of 1 to 4 weights, sigma 0.3, 400 children) from the start (the autopilot), each pruned back toward it; eligibility on the
//              500-dive safety pool; the champion is the best HELD-OUT score among the eligible; then, ONCE and only for the champion, the audits are read -- `auditSets(20000)`, which nothing in the tree has touched.
//   A CIRCUIT WITH NO ELIGIBLE CHAMPION is scored AS THE AUTOPILOT (it found nothing), on the same audits.
//   THE VERDICT (fixed in the note before any run): for each of the three audits, with F the fish's champion score and m, s the mean and the sample standard deviation of a family's scores, the fish BEATS the family on that audit iff
//              F - m > max(0.02, 2 s). RUNG 3 PASSES iff the fish beats the ER, LAYER and DEGREE families on all three audits; it FAILS iff, against the family with the highest mean on that audit, it does not win on at least two of the
//              three; anything else is IN BETWEEN. SIGN and COUNT are reported by the same rule and are not in the verdict. A family needs three finished controls to be assessed. The reach of every circuit (how many (input, output) pairs
//              the wiring connects in three steps) is printed beside its scores, with the rank correlation between reach and score across the controls, because the controls reach far less than the real wiring does.
// Pure apart from the files it reads. No clock, no Math.random.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as C from "../../brain/pilotSubCircuit.mjs";
import * as T from "../../brain/subTask.mjs";
import { auditSets } from "../auditSubChampion.mjs";
import { RECIPE, SETS as SETS_7000, finish } from "./trainSubPilot.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const CIRCUIT_FILE = path.resolve(HERE, "..", "..", "vendor", "zebrafish", "fish1-hmi-spn.json");
export const AUDIT_BASE = 20000, SEARCH_BASE = 21000;
export const FAMILIES = Object.freeze(["er", "layer", "degree", "sign", "count"]);
/** The seed of the K-th control of a family, and the first search seed of a circuit: fixed here, so a control is the same circuit however it is asked for. */
export const CONTROL_BASE = Object.freeze({ er: 1000, layer: 2000, degree: 3000, sign: 4000, count: 5000 });
export const MAX_INDEX = 19;
export const STAGE_A = "fish,er:0-9,layer:0-9,degree:0-9,sign:0-3,count:0-3", STAGE_B = "er:10-19,layer:10-19,degree:10-19";
export const MIN_EDGE = 0.02, SD_FACTOR = 2, MIN_CONTROLS = 3;
export const VERDICT_FAMILIES = Object.freeze(["er", "layer", "degree"]), AUDITS = Object.freeze(["audit", "safetyAudit", "reserve"]);
/** The sets: the trainer's own (train, held-out, safety pool, reserve) with the two audits on the fresh range. `smoke` shrinks every set to a few dives: for trying the plumbing. */
export function setsOf({ auditBase = AUDIT_BASE, smoke = false } = {}) {
    const a = auditSets(auditBase), s = { ...SETS_7000, audit: a.audit, safetyAudit: a.safety };
    return smoke ? { train: s.train.slice(0, 2), heldOut: s.heldOut.slice(0, 2), pool: s.pool.slice(0, 3), audit: s.audit.slice(0, 2), safetyAudit: s.safetyAudit.slice(0, 3), reserve: s.reserve.slice(0, 2) } : s;
}

// ---- specs ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
/** `fish,er:0-9,sign:2` -> [{ family: "fish", index: 0 }, { family: "er", index: 0 }, ...]. Refuses what it cannot read, a family it does not know, an index above 19, a backwards range and a spec named twice. */
export function parseSpecs(text) {
    const out = [], seen = new Set();
    for (const raw of String(text).split(",")) {
        const part = raw.trim(); if (!part) throw new Error(`trainSubCircuits.parseSpecs: an empty spec in ${JSON.stringify(text)}`);
        if (part === "fish") { if (seen.has("fish")) throw new Error("trainSubCircuits.parseSpecs: fish is named twice"); seen.add("fish"); out.push({ family: "fish", index: 0 }); continue; }
        const m = /^([a-z]+):(\d+)(?:-(\d+))?$/.exec(part);
        if (!m) throw new Error(`trainSubCircuits.parseSpecs: cannot read ${JSON.stringify(part)} (a spec is fish or family:K or family:K-L)`);
        if (!FAMILIES.includes(m[1])) throw new Error(`trainSubCircuits.parseSpecs: unknown family ${JSON.stringify(m[1])} (known: fish, ${FAMILIES.join(", ")})`);
        const lo = Number(m[2]), hi = m[3] === undefined ? lo : Number(m[3]);
        if (hi < lo) throw new Error(`trainSubCircuits.parseSpecs: the range ${JSON.stringify(part)} runs backwards`);
        if (hi > MAX_INDEX) throw new Error(`trainSubCircuits.parseSpecs: ${JSON.stringify(part)} is past index ${MAX_INDEX}`);
        for (let k = lo; k <= hi; k++) { const name = `${m[1]}:${k}`; if (seen.has(name)) throw new Error(`trainSubCircuits.parseSpecs: ${name} is named twice`); seen.add(name); out.push({ family: m[1], index: k }); }
    }
    return out;
}
export const specName = (s) => (s.family === "fish" ? "fish" : `${s.family}:${s.index}`);
/** Where a spec sits in the fixed order fish, er 0-19, layer 0-19, degree 0-19, sign 0-19, count 0-19 (20 a family): the first search seed is SEARCH_BASE + 10 x that. */
export const ordinalOf = (s) => (s.family === "fish" ? 0 : 1 + FAMILIES.indexOf(s.family) * (MAX_INDEX + 1) + s.index);
export const seedBaseOf = (s) => SEARCH_BASE + 10 * ordinalOf(s);
/** The circuit of a spec, from the vendored circuit { neurons, edges }. */
export function circuitFor(spec, circuit) {
    if (spec.family === "fish") return circuit;
    return C.CONTROLS[spec.family](circuit, CONTROL_BASE[spec.family] + spec.index);
}
export const loadCircuit = (file = CIRCUIT_FILE) => { const j = JSON.parse(fs.readFileSync(file, "utf8")); return { neurons: j.neurons, edges: j.edges }; };

// ---- one circuit ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
const sc = (r) => (r ? { score: r.score, crashed: r.crashed, byKind: r.byKind, n: r.runs.length } : null);
/**
 * Train and grade one circuit: its searches (in this process), then finish() of tools/ship/trainSubPilot.mjs, which picks the champion and reads the audits once. Returns the record the file keeps: { spec, recipe, reach, champion, scores,
 * searches, weights }, where scores.autopilot is always the three audits flown by the start and scores.champion is those of the champion (null when there is none). `runner` is for the gate (a stand-in for the searches).
 */
export function runCircuit(spec, circuit, opts = {}, log = () => {}) {
    const recipe = { ...RECIPE, ...(opts.recipe || {}) }, sets = opts.sets || setsOf({ smoke: !!opts.smoke }), name = specName(spec), cir = circuitFor(spec, circuit), P = C.createCircuitPolicy(cir, name), base = seedBaseOf(spec);
    const runs = [];
    for (let k = 0; k < recipe.runs; k++) {
        const found = P.train({ seed: base + k, iters: recipe.iters, sigma: recipe.sigma, maxK: recipe.maxK, trainSet: sets.train }), out = P.prune(found.weights, { trainSet: sets.train });
        runs.push({ k, seed: base + k, weights: out.weights, trainScore: out.trainScore, improved: found.improved, neutral: found.neutral, moved: out.moved, kept: out.kept });
        log(`  ${name}: search ${k + 1}/${recipe.runs} (seed ${base + k}): ${out.moved} moved weights pruned to ${out.kept}, train ${out.trainScore.toFixed(4)}`);
    }
    const result = finish({ ...recipe, policy: P, seed: base, circuit: name }, runs, (m) => log(`  ${name}: ${m}`), sets);
    const handW = P.handWeights(), ev = (w, set) => P.evaluate(w, set);
    const auto = { audit: sc(ev(handW, sets.audit)), safetyAudit: sc(ev(handW, sets.safetyAudit)), reserve: sc(ev(handW, sets.reserve)) };   // flown here for every circuit: finish() reads them only when there is a champion
    const c = result.champion;
    return {
        spec: name, family: spec.family, index: spec.index, smoke: !!opts.smoke, recipe: { ...recipe, auditBase: opts.smoke ? null : (opts.auditBase || AUDIT_BASE) }, seedBase: base,
        reach: P.reach, weightCount: P.WEIGHT_COUNT, champion: c ? c.seed : null,
        qualifies: !!(c && result.verdict.ok), reasons: c ? result.verdict.reasons : result.verdict.reasons,
        scores: { autopilot: auto, champion: c ? { heldOut: sc(c.heldOut), audit: sc(c.audit), safetyAudit: sc(c.safetyAudit), reserve: sc(c.reserve) } : null },
        searches: result.runs.map((r) => ({ k: r.k, seed: r.seed, trainScore: r.trainScore, heldOut: r.heldOut.score, eligible: r.eligible, improved: r.improved, neutral: r.neutral, moved: r.moved, kept: r.kept })),
        weights: c ? Array.from(c.weights) : null,
    };
}
/** The three audit scores a record counts for: the champion's, or the autopilot's when there is no champion. */
export const effectiveOf = (rec) => Object.fromEntries(AUDITS.map((a) => [a, (rec.scores.champion ? rec.scores.champion[a] : rec.scores.autopilot[a]).score]));

// ---- the verdict -----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
export const meanOf = (v) => v.reduce((s, x) => s + x, 0) / v.length;
export const sdOf = (v) => { if (v.length < 2) return 0; const m = meanOf(v); return Math.sqrt(v.reduce((s, x) => s + (x - m) ** 2, 0) / (v.length - 1)); };
/** The rank of each value (ties share the mean of their ranks, 1-based). */
export function ranksOf(v) {
    const idx = v.map((x, i) => [x, i]).sort((a, b) => a[0] - b[0]), r = new Array(v.length);
    for (let i = 0; i < idx.length;) { let j = i; while (j + 1 < idx.length && idx[j + 1][0] === idx[i][0]) j++; const mean = (i + j) / 2 + 1; for (let q = i; q <= j; q++) r[idx[q][1]] = mean; i = j + 1; }
    return r;
}
/** Spearman's rank correlation of two equal-length lists; null when either is constant or there are fewer than three pairs. */
export function spearman(a, b) {
    if (a.length !== b.length || a.length < 3) return null;
    const ra = ranksOf(a), rb = ranksOf(b), ma = meanOf(ra), mb = meanOf(rb);
    let num = 0, da = 0, db = 0; for (let i = 0; i < ra.length; i++) { num += (ra[i] - ma) * (rb[i] - mb); da += (ra[i] - ma) ** 2; db += (rb[i] - mb) ** 2; }
    return da === 0 || db === 0 ? null : num / Math.sqrt(da * db);
}
/** Does F beat a family's scores `values` (mean m, sd s): F - m > max(0.02, 2 s)? */
export const beats = (F, values) => { const m = meanOf(values), s = sdOf(values); return { m, s, margin: F - m, needs: Math.max(MIN_EDGE, SD_FACTOR * s), wins: F - m > Math.max(MIN_EDGE, SD_FACTOR * s) }; };
/**
 * The verdict over a list of records (one `fish` and the controls). Returns { fish, families: { fam: { n, audits: { audit: { m, s, F, margin, needs, wins } } } }, strongest: { audit: family }, verdict: "PASS" | "FAIL" | "IN BETWEEN" | "NOT ASSESSED", why, reach }.
 */
export function verdictOf(records) {
    const fish = records.find((r) => r.family === "fish");
    if (!fish) return { fish: null, families: {}, strongest: {}, verdict: "NOT ASSESSED", why: "no fish record", reach: null };
    const F = effectiveOf(fish), families = {}, strongest = {};
    for (const fam of FAMILIES) {
        const recs = records.filter((r) => r.family === fam); if (!recs.length) continue;
        families[fam] = { n: recs.length, audits: {} };
        for (const a of AUDITS) { const values = recs.map((r) => effectiveOf(r)[a]); families[fam].audits[a] = { F: F[a], ...beats(F[a], values) }; }
    }
    const missing = VERDICT_FAMILIES.filter((f) => !families[f] || families[f].n < MIN_CONTROLS);
    const controls = records.filter((r) => VERDICT_FAMILIES.includes(r.family)), reach = {};
    for (const a of AUDITS) reach[a] = spearman(controls.map((r) => r.reach.pairs), controls.map((r) => effectiveOf(r)[a]));
    if (missing.length) return { fish, families, strongest, verdict: "NOT ASSESSED", why: `${missing.join(", ")} need at least ${MIN_CONTROLS} finished controls`, reach };
    for (const a of AUDITS) strongest[a] = VERDICT_FAMILIES.reduce((best, f) => (families[f].audits[a].m > families[best].audits[a].m ? f : best), VERDICT_FAMILIES[0]);
    const passes = VERDICT_FAMILIES.every((f) => AUDITS.every((a) => families[f].audits[a].wins));
    const lost = AUDITS.filter((a) => !families[strongest[a]].audits[a].wins).length;
    const verdict = passes ? "PASS" : lost >= 2 ? "FAIL" : "IN BETWEEN";
    return { fish, families, strongest, verdict, why: passes ? "the fish beats ER, LAYER and DEGREE on all three audits" : lost >= 2 ? `against the strongest family the fish wins on ${3 - lost} of 3 audits` : "the fish does not beat every family on every audit, but wins against the strongest on at least two", reach };
}

// ---- the report ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
const f4 = (v) => (v === null || v === undefined || !Number.isFinite(v) ? "n/a" : v.toFixed(4));
export function reportLines(records) {
    const v = verdictOf(records), lines = [];
    const fish = records.find((r) => r.family === "fish");
    if (fish) {
        const e = effectiveOf(fish), a = fish.scores.autopilot;
        lines.push(`the autopilot on the audits: audit ${f4(a.audit.score)} | safety audit ${f4(a.safetyAudit.score)} | reserve ${f4(a.reserve.score)}`);
        lines.push(`FISH (the vendored hindbrain-integrator circuit; reach ${fish.reach.pairs} pairs, ${fish.reach.outputsReached} output cells): ${fish.champion === null ? "NO ELIGIBLE CHAMPION (scored as the autopilot)" : "champion seed " + fish.champion + (fish.qualifies ? ", QUALIFIES against the autopilot" : ", does not qualify against the autopilot")} | audit ${f4(e.audit)} | safety audit ${f4(e.safetyAudit)} | reserve ${f4(e.reserve)}`);
    }
    for (const fam of FAMILIES) {
        const recs = records.filter((r) => r.family === fam); if (!recs.length) continue;
        const d = v.families[fam];
        lines.push(`${fam.toUpperCase()} x${recs.length} (${recs.filter((r) => r.champion === null).length} with no champion; reach ${recs.map((r) => r.reach.pairs).sort((x, y) => x - y)[0]}-${recs.map((r) => r.reach.pairs).sort((x, y) => y - x)[0]} pairs): ` +
            AUDITS.map((a) => `${a} ${f4(d.audits[a].m)} +- ${f4(d.audits[a].s)} (fish ${d.audits[a].margin >= 0 ? "+" : ""}${f4(d.audits[a].margin)}, needs ${f4(d.audits[a].needs)}: ${d.audits[a].wins ? "WINS" : "no"})`).join(" | ") + (VERDICT_FAMILIES.includes(fam) ? "" : "   [reported, not in the verdict]"));
    }
    lines.push(`rank correlation of reach with score across the ER, LAYER and DEGREE controls: ${AUDITS.map((a) => `${a} ${v.reach && v.reach[a] !== null ? v.reach[a].toFixed(2) : "n/a"}`).join(" | ")}`);
    lines.push(`RUNG 3 (HMI circuit): ${v.verdict} -- ${v.why}`);
    return lines;
}

// ---- the command ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
/** Parse `run ...` / `report ...` argv, REFUSING an option it does not know. Returns { cmd, ...options }. */
export function parseArgs(argv) {
    const [cmd, ...rest] = argv;
    if (cmd !== "run" && cmd !== "report") throw new Error(`the first word must be run or report, got ${JSON.stringify(cmd)}`);
    const known = cmd === "run" ? { specs: String, out: String, workers: Number, runs: Number, iters: Number, sigma: Number, maxK: Number, "circuit-file": String, "audit-base": Number, one: String, smoke: Boolean, quiet: Boolean } : { in: String, "allow-smoke": Boolean };
    const given = {};
    for (let i = 0; i < rest.length; i++) {
        const a = rest[i]; if (!a.startsWith("--")) throw new Error(`unexpected argument ${JSON.stringify(a)}`);
        const k = a.slice(2); if (!(k in known)) throw new Error(`unknown option ${JSON.stringify(a)} (known for ${cmd}: ${Object.keys(known).map((n) => "--" + n).join(", ")})`);
        if (known[k] === Boolean) given[k] = true; else { const v = rest[++i]; if (v == null || v.startsWith("--")) throw new Error(`${a} needs a value`); given[k] = known[k] === Number ? Number(v) : v; if (known[k] === Number && !Number.isFinite(given[k])) throw new Error(`${a} needs a number, got ${JSON.stringify(v)}`); }
    }
    if (cmd === "report") { if (!given.in) throw new Error("report needs --in <results file>"); return { cmd, in: given.in, allowSmoke: !!given["allow-smoke"] }; }
    if (!given.one && !given.specs) throw new Error("run needs --specs <list> (for example the stage A list: " + STAGE_A + ")");
    if (!given.one && !given.out) throw new Error("run needs --out <results file>");
    const o = { cmd, specs: given.specs || given.one, one: given.one || null, out: given.out || null, workers: given.workers ?? 1, recipe: { runs: given.runs ?? RECIPE.runs, iters: given.iters ?? RECIPE.iters, sigma: given.sigma ?? RECIPE.sigma, maxK: given.maxK ?? RECIPE.maxK },
        circuitFile: given["circuit-file"] || CIRCUIT_FILE, auditBase: given["audit-base"] ?? AUDIT_BASE, smoke: !!given.smoke, quiet: !!given.quiet };
    for (const [k, v] of [["workers", o.workers], ["runs", o.recipe.runs], ["iters", o.recipe.iters], ["maxK", o.recipe.maxK]]) if (!(Number.isInteger(v) && v >= 1)) throw new Error(`--${k} must be a whole number of 1 or more, got ${v}`);
    if (!(o.recipe.sigma > 0)) throw new Error(`--sigma must be above 0, got ${o.recipe.sigma}`);
    parseSpecs(o.specs);
    if (o.one && parseSpecs(o.one).length !== 1) throw new Error("--one takes a single spec");
    return o;
}
const sameRecipe = (rec, o) => rec.recipe.runs === o.recipe.runs && rec.recipe.iters === o.recipe.iters && rec.recipe.sigma === o.recipe.sigma && rec.recipe.maxK === o.recipe.maxK && rec.recipe.auditBase === (o.smoke ? null : o.auditBase);
/** The records of a results file (one JSON object a line); a line that is not JSON is an error naming its number. */
export function readRecords(text) {
    return text.split("\n").filter((l) => l.trim()).map((l, i) => { try { return JSON.parse(l); } catch (e) { throw new Error(`results file line ${i + 1} is not JSON`); } });
}
/**
 * THE COMMAND, as a function (tools/ship/trainSubCircuitFamily.mjs calls it). `run` trains the specs not yet in --out (each circuit in its own process when --workers is above 1; each finished circuit is appended as one line, so a stopped run
 * resumes), then prints the report; `report` prints it for a results file. Returns the exit code: 0, 1 a refusal while running, 2 a bad argument. `io` is for the gate: { out, err, readFile, appendFile, exists, runner, selfPath }.
 */
export async function command(argv, io = {}) {
    const out = io.out || ((m) => console.log(m)), err = io.err || ((m) => console.error(m)), readFile = io.readFile || ((f) => fs.readFileSync(f, "utf8")), appendFile = io.appendFile || fs.appendFileSync, exists = io.exists || fs.existsSync;
    let o; try { o = parseArgs(argv); } catch (e) { err("trainSubCircuitFamily: " + e.message); return 2; }
    if (o.cmd === "report") {
        let records; try { records = readRecords(readFile(o.in)); } catch (e) { err("trainSubCircuitFamily: " + e.message); return 1; }
        if (!records.length) { err("trainSubCircuitFamily: the results file has no records"); return 1; }
        if (records.some((r) => r.smoke) && !o.allowSmoke) { err("trainSubCircuitFamily: the file holds smoke records (a throwaway recipe on a few dives): pass --allow-smoke to read them anyway"); return 1; }
        for (const l of reportLines(records)) out(l);
        return 0;
    }
    let circuit; try { circuit = loadCircuit(o.circuitFile); } catch (e) { err("trainSubCircuitFamily: cannot read the circuit file: " + e.message); return 1; }
    const sets = setsOf({ auditBase: o.auditBase, smoke: o.smoke }), opts = { recipe: o.recipe, sets, smoke: o.smoke, auditBase: o.auditBase }, log = o.quiet ? () => {} : out;
    if (o.one) {
        const spec = parseSpecs(o.one)[0], rec = (io.runner || runCircuit)(spec, circuit, opts, o.quiet ? () => {} : (m) => err(m));
        out("RESULT " + JSON.stringify(rec)); return 0;
    }
    const specs = parseSpecs(o.specs);
    let have = []; if (exists(o.out)) { try { have = readRecords(readFile(o.out)); } catch (e) { err("trainSubCircuitFamily: " + e.message); return 1; } }
    const stale = have.filter((r) => !sameRecipe(r, o));
    if (stale.length) { err(`trainSubCircuitFamily: ${o.out} holds ${stale.length} record(s) of another recipe or another audit range (${stale.map((r) => r.spec).join(", ")}): it is not mixed with this run -- use another --out`); return 1; }
    const done = new Set(have.map((r) => r.spec)), todo = specs.filter((s) => !done.has(specName(s)));
    log(`[trainSubCircuitFamily] ${specs.length} circuits asked for, ${specs.length - todo.length} already in ${o.out}, ${todo.length} to train: ${o.recipe.runs} searches x ${o.recipe.iters} children each, audits on ${o.smoke ? "a few throwaway dives" : "base " + o.auditBase}, ${o.workers} at a time`);
    const records = [...have];
    const finishOne = (rec) => { appendFile(o.out, JSON.stringify(rec) + "\n"); records.push(rec); log(`[trainSubCircuitFamily] ${rec.spec} done: ${rec.champion === null ? "no eligible champion" : "champion seed " + rec.champion}; audit ${f4(effectiveOf(rec).audit)} | safety audit ${f4(effectiveOf(rec).safetyAudit)} | reserve ${f4(effectiveOf(rec).reserve)} (reach ${rec.reach.pairs} pairs)`); };
    if (o.workers > 1 && todo.length > 1 || io.forceChildren) {
        const { spawn } = await import("node:child_process");
        const pass = ["--circuit-file", o.circuitFile, "--audit-base", String(o.auditBase), "--runs", String(o.recipe.runs), "--iters", String(o.recipe.iters), "--sigma", String(o.recipe.sigma), "--maxK", String(o.recipe.maxK), ...(o.smoke ? ["--smoke"] : []), "--quiet"];
        const one = (spec) => new Promise((resolve, reject) => {
            const child = spawn(process.execPath, [io.selfPath, "run", "--one", specName(spec), ...pass], { stdio: ["ignore", "pipe", "inherit"] }); let buf = "";
            child.stdout.on("data", (d) => { buf += d; }); child.on("error", reject);
            child.on("close", (code) => { const line = buf.split("\n").find((l) => l.startsWith("RESULT ")); if (code !== 0 || !line) return reject(new Error(`${specName(spec)} exited ${code} without a result`)); resolve(JSON.parse(line.slice(7))); });
        });
        const pending = todo.slice(); let failed = null;
        await Promise.all(Array.from({ length: Math.max(1, Math.min(o.workers, todo.length)) }, async () => { while (pending.length && !failed) { const s = pending.shift(); try { finishOne(await one(s)); } catch (e) { failed = e; } } }));
        if (failed) { err("trainSubCircuitFamily: " + failed.message); return 1; }
    } else for (const s of todo) finishOne((io.runner || runCircuit)(s, circuit, opts, log));
    for (const l of reportLines(records)) out(l);
    return 0;
}
