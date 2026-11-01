// WebGLEngine/tools/ship/trainSubState.mjs -- UNNUMBERED (the version is chosen at ship time) (the library; the command is tools/ship/trainSubStateFamily.mjs; the gate is tools/ship/trainSubState-selfcheck.mjs)
//
// THE FLY'S HEADING LOOP AGAINST ITS CONTROLS, AS THE PRE-REGISTERED RUNG 4a OF brain/SUBMARINE_WIP.md ("the fly central complex as a stateful heading pilot", fixed before anything was built, and again after the real export was read). brain/pilotSubCircuitState.mjs is a pilot
// whose only memory is a circuit's wiring (a reservoir with the real circuit's fixed recurrent weights); tools/subDropout.mjs takes the compass away for two 16-second windows a dive. This file trains each circuit of the family by the recipe of tools/ship/trainSubPilot.mjs with
// every dive flown WITH the dropout, and grades the family by the rule of tools/ship/trainSubCircuits.mjs (rung 3), which it imports for the arithmetic and does not change:
//   SPEC       `cx` (the circuit as vendored) or `family:K`: er, layer (the TYPE-BLOCK control: every edge keeps its source cell type and its target cell type), degree, sign, count -- the K-th control of that family -- and nostate (the real wiring with the state
//              reset every tick, trained again from a different seed: K is the repeat). `cx,er:0-5,layer:0-5,degree:0-5,sign:0-2,count:0-2,nostate:0-2` is STAGE A (28 circuits); `er:6-11,layer:6-11,degree:6-11` is STAGE B (only if stage A reads as a pass).
//   THE AUDITS  `auditSets(30000)`, flown with the dropout; a circuit with no eligible champion is scored as the autopilot (also flown with the dropout).
//   THE VERDICT  rung 3's, with the subject named cx: F beats a family iff F - mean > max(0.02, 2 sd); PASS iff cx beats ER, TYPE-BLOCK and DEGREE on all three audits; FAIL iff, against the strongest family, it does not win on at least two audits. SIGN, COUNT and NO STATE are
//              reported by the same rule and are not in the verdict. REPORTED BESIDE IT: the mean heading error inside the dark windows alone (the mechanism), for the autopilot and for each champion, and the rank correlation of reach with score.
// Pure apart from the files it reads. No clock, no Math.random.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as C from "../../brain/pilotSubCircuit.mjs";
import * as CS from "../../brain/pilotSubCircuitState.mjs";
import * as T from "../../brain/subTask.mjs";
import * as S from "../../physics/mechanics/subModel6dof.mjs";
import * as D from "../subDropout.mjs";
import { auditSets } from "../auditSubChampion.mjs";
import { RECIPE, SETS as SETS_7000, finish } from "./trainSubPilot.mjs";
import { meanOf, sdOf, spearman, beats, effectiveOf, readRecords, MIN_EDGE, SD_FACTOR, MIN_CONTROLS, AUDITS } from "./trainSubCircuits.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const CIRCUIT_FILE = path.resolve(HERE, "..", "..", "vendor", "hemibrain", "hemibrain-cx-heading-loop.json");
export const AUDIT_BASE = 30000, SEARCH_BASE = 31000, MAX_INDEX = 19;
export const FAMILIES = Object.freeze(["er", "layer", "degree", "sign", "count", "nostate"]);
export const VERDICT_FAMILIES = Object.freeze(["er", "layer", "degree"]);
/** The seed of the K-th control of a family (nostate has none: it IS the real circuit). */
export const CONTROL_BASE = Object.freeze({ er: 1000, layer: 2000, degree: 3000, sign: 4000, count: 5000 });
export const STAGE_A = "cx,er:0-5,layer:0-5,degree:0-5,sign:0-2,count:0-2,nostate:0-2", STAGE_B = "er:6-11,layer:6-11,degree:6-11";
export { MIN_EDGE, SD_FACTOR, MIN_CONTROLS, AUDITS };

/** The dropout every dive is flown with (the default task of tools/subDropout.mjs: two windows of 16 s). */
export const taskWrap = (pilot) => D.dropout(pilot);
/** The sets: the trainer's own with the two audits on the fresh range; `smoke` shrinks every set to a few dives. */
export function setsOf({ auditBase = AUDIT_BASE, smoke = false } = {}) {
    const a = auditSets(auditBase), s = { ...SETS_7000, audit: a.audit, safetyAudit: a.safety };
    return smoke ? { train: s.train.slice(0, 2), heldOut: s.heldOut.slice(0, 2), pool: s.pool.slice(0, 3), audit: s.audit.slice(0, 2), safetyAudit: s.safetyAudit.slice(0, 3), reserve: s.reserve.slice(0, 2) } : s;
}

// ---- specs ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
/** `cx,er:0-5,nostate:1` -> [{ family: "cx", index: 0 }, { family: "er", index: 0 }, ...]. Refuses what it cannot read, an unknown family, an index above 19, a backwards range and a spec named twice. */
export function parseSpecs(text) {
    const out = [], seen = new Set();
    for (const raw of String(text).split(",")) {
        const part = raw.trim(); if (!part) throw new Error(`trainSubState.parseSpecs: an empty spec in ${JSON.stringify(text)}`);
        if (part === "cx") { if (seen.has("cx")) throw new Error("trainSubState.parseSpecs: cx is named twice"); seen.add("cx"); out.push({ family: "cx", index: 0 }); continue; }
        const m = /^([a-z]+):(\d+)(?:-(\d+))?$/.exec(part);
        if (!m) throw new Error(`trainSubState.parseSpecs: cannot read ${JSON.stringify(part)} (a spec is cx or family:K or family:K-L)`);
        if (!FAMILIES.includes(m[1])) throw new Error(`trainSubState.parseSpecs: unknown family ${JSON.stringify(m[1])} (known: cx, ${FAMILIES.join(", ")})`);
        const lo = Number(m[2]), hi = m[3] === undefined ? lo : Number(m[3]);
        if (hi < lo) throw new Error(`trainSubState.parseSpecs: the range ${JSON.stringify(part)} runs backwards`);
        if (hi > MAX_INDEX) throw new Error(`trainSubState.parseSpecs: ${JSON.stringify(part)} is past index ${MAX_INDEX}`);
        for (let k = lo; k <= hi; k++) { const name = `${m[1]}:${k}`; if (seen.has(name)) throw new Error(`trainSubState.parseSpecs: ${name} is named twice`); seen.add(name); out.push({ family: m[1], index: k }); }
    }
    return out;
}
export const specName = (s) => (s.family === "cx" ? "cx" : `${s.family}:${s.index}`);
/** Where a spec sits in the fixed order cx, er 0-19, layer 0-19, ... nostate 0-19 (20 a family): the first search seed is SEARCH_BASE + 10 x that. */
export const ordinalOf = (s) => (s.family === "cx" ? 0 : 1 + FAMILIES.indexOf(s.family) * (MAX_INDEX + 1) + s.index);
export const seedBaseOf = (s) => SEARCH_BASE + 10 * ordinalOf(s);
/** The circuit of a spec from the vendored circuit { neurons, edges, io }: cx and nostate are the circuit itself, the others its controls (which keep `io`). */
export function circuitFor(spec, circuit) {
    if (spec.family === "cx" || spec.family === "nostate") return circuit;
    return C.CONTROLS[spec.family](circuit, CONTROL_BASE[spec.family] + spec.index);
}
export function loadCircuit(file = CIRCUIT_FILE) { const j = JSON.parse(fs.readFileSync(file, "utf8")); return { neurons: j.neurons, edges: j.edges, io: j.io }; }
/** The pilot policy of a spec: the stateful reservoir of the spec's circuit, with the state kept unless the spec is nostate, flown with the dropout. */
export const policyOf = (spec, circuit) => CS.createStatePolicy(circuitFor(spec, circuit), specName(spec), { persist: spec.family !== "nostate", wrap: taskWrap });

// ---- the mechanism -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
/**
 * The mean heading error inside the dark windows and outside them, over a set of dives flown by `pilot` through ONE dropout wrapper (so its windows are the ones evaluate() draws): { dark, lit, darkTicks, litTicks }. The error of a tick is the one
 * brain/subTask.mjs charges (the absolute angle to the target heading, at most 3), taken from the TRUE state.
 */
export function headingErrorByWindow(pilot, set, opts = {}) {
    const w = D.dropout(pilot, opts), sums = { dark: 0, lit: 0 }, n = { dark: 0, lit: 0 }, err = (target, hdg) => Math.min(3, Math.abs(Math.atan2(Math.sin(target - hdg), Math.cos(target - hdg))));
    for (const sc of set) {
        let key = null;   // the window of the tick whose command made the state the pilot is handed now: the dive runner charges the error AFTER each tick's step, so that is the one counted here (the last tick's from the result)
        const r = T.fly((st, tgt, cur) => {
            const cmd = w(st, tgt, cur);
            if (key !== null) { sums[key] += err(sc.target.heading, S.attitude(st, cur).heading); n[key]++; }
            key = w.log.valid[w.log.valid.length - 1] === 0 ? "dark" : "lit";
            return cmd;
        }, sc);
        if (r.status === "submerged") { sums[key] += err(sc.target.heading, r.final.hdg); n[key]++; }
    }
    return { dark: n.dark ? sums.dark / n.dark : null, lit: n.lit ? sums.lit / n.lit : null, darkTicks: n.dark, litTicks: n.lit };
}

// ---- one circuit ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
const sc = (r) => (r ? { score: r.score, crashed: r.crashed, byKind: r.byKind, n: r.runs.length } : null);
/**
 * Train and grade one circuit: its searches (in this process), then finish() of tools/ship/trainSubPilot.mjs, which picks the champion and reads the audits once. Returns the record the file keeps: { spec, family, index, recipe, reach, champion, scores, mechanism, searches, weights }.
 * `reach` is reachOfIo of the spec's circuit.
 */
export function runCircuit(spec, circuit, opts = {}, log = () => {}) {
    const recipe = { ...RECIPE, ...(opts.recipe || {}) }, sets = opts.sets || setsOf({ smoke: !!opts.smoke }), name = specName(spec), P = policyOf(spec, circuit), base = seedBaseOf(spec), runs = [];
    for (let k = 0; k < recipe.runs; k++) {
        const found = P.train({ seed: base + k, iters: recipe.iters, sigma: recipe.sigma, maxK: recipe.maxK, trainSet: sets.train }), out = P.prune(found.weights, { trainSet: sets.train });
        runs.push({ k, seed: base + k, weights: out.weights, trainScore: out.trainScore, improved: found.improved, neutral: found.neutral, moved: out.moved, kept: out.kept });
        log(`  ${name}: search ${k + 1}/${recipe.runs} (seed ${base + k}): ${out.moved} moved weights pruned to ${out.kept}, train ${out.trainScore.toFixed(4)}`);
    }
    const result = finish({ ...recipe, policy: P, seed: base, circuit: name }, runs, (m) => log(`  ${name}: ${m}`), sets);
    const handW = P.handWeights(), ev = (w, set) => P.evaluate(w, set), c = result.champion;
    const auto = { audit: sc(ev(handW, sets.audit)), safetyAudit: sc(ev(handW, sets.safetyAudit)), reserve: sc(ev(handW, sets.reserve)) };
    const mech = (w) => headingErrorByWindow(P.pilotFor(w), sets.audit), reach = reachOfIo(circuitFor(spec, circuit));
    return {
        spec: name, family: spec.family, index: spec.index, smoke: !!opts.smoke, recipe: { ...recipe, auditBase: opts.smoke ? null : (opts.auditBase || AUDIT_BASE) }, seedBase: base,
        reach, weightCount: P.WEIGHT_COUNT, champion: c ? c.seed : null, qualifies: !!(c && result.verdict.ok), reasons: result.verdict.reasons,
        scores: { autopilot: auto, champion: c ? { heldOut: sc(c.heldOut), audit: sc(c.audit), safetyAudit: sc(c.safetyAudit), reserve: sc(c.reserve) } : null },
        mechanism: { autopilot: mech(handW), champion: c ? mech(c.weights) : null },
        searches: result.runs.map((r) => ({ k: r.k, seed: r.seed, trainScore: r.trainScore, heldOut: r.heldOut.score, eligible: r.eligible, improved: r.improved, neutral: r.neutral, moved: r.moved, kept: r.kept })),
        weights: c ? Array.from(c.weights) : null,
    };
}
/** The number of (input, output) cell pairs the circuit connects within three steps, how many output cells are reached and how many input cells reach one (the circuit's own io, not a layer rule). */
export function reachOfIo(circuit) {
    const out = new Map(); for (const [f, t] of circuit.edges) { if (!out.has(f)) out.set(f, []); out.get(f).push(t); }
    const isOut = new Set(circuit.io.outputs), reached = new Set(); let pairs = 0, inputsReaching = 0;
    for (const s of circuit.io.inputs) {
        let frontier = new Set([s]); const seen = new Set([s]);
        for (let d = 0; d < 3; d++) { const next = new Set(); for (const u of frontier) for (const v of out.get(u) || []) if (!seen.has(v)) { seen.add(v); next.add(v); } frontier = next; }
        let hit = 0; for (const v of seen) if (isOut.has(v)) { hit++; reached.add(v); }
        pairs += hit; if (hit) inputsReaching++;
    }
    return { outputsReached: reached.size, inputsReaching, pairs };
}

// ---- the verdict -----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
export { meanOf, sdOf, spearman, beats, effectiveOf, readRecords };
/** The verdict over a list of records (one `cx` and the controls): rung 3's rule with the subject cx. Returns { cx, families, strongest, verdict, why, reach }. */
export function verdictOf(records) {
    const cx = records.find((r) => r.family === "cx");
    if (!cx) return { cx: null, families: {}, strongest: {}, verdict: "NOT ASSESSED", why: "no cx record", reach: null };
    const F = effectiveOf(cx), families = {}, strongest = {};
    for (const fam of FAMILIES) {
        const recs = records.filter((r) => r.family === fam); if (!recs.length) continue;
        families[fam] = { n: recs.length, audits: {} };
        for (const a of AUDITS) families[fam].audits[a] = { F: F[a], ...beats(F[a], recs.map((r) => effectiveOf(r)[a])) };
    }
    const missing = VERDICT_FAMILIES.filter((f) => !families[f] || families[f].n < MIN_CONTROLS), controls = records.filter((r) => VERDICT_FAMILIES.includes(r.family)), reach = {};
    for (const a of AUDITS) reach[a] = spearman(controls.map((r) => r.reach.pairs), controls.map((r) => effectiveOf(r)[a]));
    if (missing.length) return { cx, families, strongest, verdict: "NOT ASSESSED", why: `${missing.join(", ")} need at least ${MIN_CONTROLS} finished controls`, reach };
    for (const a of AUDITS) strongest[a] = VERDICT_FAMILIES.reduce((best, f) => (families[f].audits[a].m > families[best].audits[a].m ? f : best), VERDICT_FAMILIES[0]);
    const passes = VERDICT_FAMILIES.every((f) => AUDITS.every((a) => families[f].audits[a].wins)), lost = AUDITS.filter((a) => !families[strongest[a]].audits[a].wins).length;
    const verdict = passes ? "PASS" : lost >= 2 ? "FAIL" : "IN BETWEEN";
    return { cx, families, strongest, verdict, why: passes ? "cx beats ER, TYPE-BLOCK and DEGREE on all three audits" : lost >= 2 ? `against the strongest family cx wins on ${3 - lost} of 3 audits` : "cx does not beat every family on every audit, but wins against the strongest on at least two", reach };
}
const f4 = (v) => (v === null || v === undefined || !Number.isFinite(v) ? "n/a" : v.toFixed(4));
const NAMES = { er: "ER", layer: "TYPE-BLOCK", degree: "DEGREE", sign: "SIGN", count: "COUNT", nostate: "NO STATE" };
export function reportLines(records) {
    const v = verdictOf(records), lines = [], cx = records.find((r) => r.family === "cx");
    if (cx) {
        const e = effectiveOf(cx), a = cx.scores.autopilot, m = cx.mechanism;
        lines.push(`the autopilot on the audits, flown with the compass dropout: audit ${f4(a.audit.score)} | safety audit ${f4(a.safetyAudit.score)} | reserve ${f4(a.reserve.score)}`);
        lines.push(`CX (the vendored heading loop; reach ${cx.reach.pairs} pairs, ${cx.reach.outputsReached} output cells): ${cx.champion === null ? "NO ELIGIBLE CHAMPION (scored as the autopilot)" : "champion seed " + cx.champion + (cx.qualifies ? ", QUALIFIES against the autopilot" : ", does not qualify against the autopilot")} | audit ${f4(e.audit)} | safety audit ${f4(e.safetyAudit)} | reserve ${f4(e.reserve)}`);
        if (m) lines.push(`mechanism, mean heading error inside the dark windows / outside them (36 audit dives): the autopilot ${f4(m.autopilot.dark)} / ${f4(m.autopilot.lit)}${m.champion ? `, the cx champion ${f4(m.champion.dark)} / ${f4(m.champion.lit)}` : ""}`);
    }
    for (const fam of FAMILIES) {
        const recs = records.filter((r) => r.family === fam); if (!recs.length) continue;
        const d = v.families[fam], reaches = recs.map((r) => r.reach.pairs).sort((x, y) => x - y);
        lines.push(`${NAMES[fam]} x${recs.length} (${recs.filter((r) => r.champion === null).length} with no champion; reach ${reaches[0]}-${reaches[reaches.length - 1]} pairs): ` +
            AUDITS.map((a) => `${a} ${f4(d.audits[a].m)} +- ${f4(d.audits[a].s)} (cx ${d.audits[a].margin >= 0 ? "+" : ""}${f4(d.audits[a].margin)}, needs ${f4(d.audits[a].needs)}: ${d.audits[a].wins ? "WINS" : "no"})`).join(" | ") + (VERDICT_FAMILIES.includes(fam) ? "" : "   [reported, not in the verdict]"));
    }
    lines.push(`rank correlation of reach with score across the ER, TYPE-BLOCK and DEGREE controls: ${AUDITS.map((a) => `${a} ${v.reach && v.reach[a] !== null ? v.reach[a].toFixed(2) : "n/a"}`).join(" | ")}`);
    lines.push(`RUNG 4a (fly heading loop, compass dropout): ${v.verdict} -- ${v.why}`);
    return lines;
}

// ---- the command ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
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
/**
 * THE COMMAND, as a function (tools/ship/trainSubStateFamily.mjs calls it): `run` trains the specs not yet in --out (each circuit in its own process when --workers is above 1; each finished circuit is appended as one line, so a stopped run resumes), then prints the report;
 * `report` prints it for a results file. Returns the exit code: 0, 1 a refusal while running, 2 a bad argument. `io` is for the gate: { out, err, readFile, appendFile, exists, runner, selfPath }.
 */
export async function command(argv, io = {}) {
    const out = io.out || ((m) => console.log(m)), err = io.err || ((m) => console.error(m)), readFile = io.readFile || ((f) => fs.readFileSync(f, "utf8")), appendFile = io.appendFile || fs.appendFileSync, exists = io.exists || fs.existsSync;
    let o; try { o = parseArgs(argv); } catch (e) { err("trainSubStateFamily: " + e.message); return 2; }
    if (o.cmd === "report") {
        let records; try { records = readRecords(readFile(o.in)); } catch (e) { err("trainSubStateFamily: " + e.message); return 1; }
        if (!records.length) { err("trainSubStateFamily: the results file has no records"); return 1; }
        if (records.some((r) => r.smoke) && !o.allowSmoke) { err("trainSubStateFamily: the file holds smoke records (a throwaway recipe on a few dives): pass --allow-smoke to read them anyway"); return 1; }
        for (const l of reportLines(records)) out(l);
        return 0;
    }
    let circuit; try { circuit = loadCircuit(o.circuitFile); } catch (e) { err("trainSubStateFamily: cannot read the circuit file: " + e.message); return 1; }
    const sets = setsOf({ auditBase: o.auditBase, smoke: o.smoke }), opts = { recipe: o.recipe, sets, smoke: o.smoke, auditBase: o.auditBase }, log = o.quiet ? () => {} : out;
    if (o.one) {
        const spec = parseSpecs(o.one)[0], rec = (io.runner || runCircuit)(spec, circuit, opts, o.quiet ? () => {} : (m) => err(m));
        out("RESULT " + JSON.stringify(rec)); return 0;
    }
    const specs = parseSpecs(o.specs);
    let have = []; if (exists(o.out)) { try { have = readRecords(readFile(o.out)); } catch (e) { err("trainSubStateFamily: " + e.message); return 1; } }
    const stale = have.filter((r) => !sameRecipe(r, o));
    if (stale.length) { err(`trainSubStateFamily: ${o.out} holds ${stale.length} record(s) of another recipe or another audit range (${stale.map((r) => r.spec).join(", ")}): it is not mixed with this run -- use another --out`); return 1; }
    const done = new Set(have.map((r) => r.spec)), todo = specs.filter((s) => !done.has(specName(s)));
    log(`[trainSubStateFamily] ${specs.length} circuits asked for, ${specs.length - todo.length} already in ${o.out}, ${todo.length} to train: ${o.recipe.runs} searches x ${o.recipe.iters} children each, audits on ${o.smoke ? "a few throwaway dives" : "base " + o.auditBase} with the compass dropout, ${o.workers} at a time`);
    const records = [...have];
    const finishOne = (rec) => { appendFile(o.out, JSON.stringify(rec) + "\n"); records.push(rec); log(`[trainSubStateFamily] ${rec.spec} done: ${rec.champion === null ? "no eligible champion" : "champion seed " + rec.champion}; audit ${f4(effectiveOf(rec).audit)} | safety audit ${f4(effectiveOf(rec).safetyAudit)} | reserve ${f4(effectiveOf(rec).reserve)} (reach ${rec.reach.pairs} pairs)`); };
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
        if (failed) { err("trainSubStateFamily: " + failed.message); return 1; }
    } else for (const s of todo) finishOne((io.runner || runCircuit)(s, circuit, opts, log));
    for (const l of reportLines(records)) out(l);
    return 0;
}
