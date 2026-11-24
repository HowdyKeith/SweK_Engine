// WebGLEngine/tools/ship/plain14RobustStage.mjs -- UNNUMBERED (the version is chosen at ship time) (the command line is tools/ship/plain14RobustStageCmd.mjs; the registration is brain/PLAIN14_ROBUST_STAGE_WIP.md, written BEFORE this file and before any search was run; the gate is tools/ship/plain14RobustStage-selfcheck.mjs)
//
// ROUND 7 STAGE 2 AS ONE STAGE. Twenty draws, ten per arm (fly = the Giant Fiber Circuit, plain14 = a 14-50-4 relu net), each STARTED from its own stage-1 champion (the weights in the stage-1 dump of the same seed and arm,
// brain/rig-results/plain14/{fly,plain}<S>.json) and trained for the ROBUST stage of the fly's chain: 4 searches x 200 iterations of tools/trainSubRobust.mjs (five vessels, no actuator limits), seeds 52000 + 10 d + k, under the
// first-order orientation step. The champion of a draw is the search with the best robust held-out score. Then, once, on FRESH audits (auditSets(95000): the 500-dive safety audit and the 36-dive audit; the 18-dive reserve is BASELINE_SET,
// as in stage 1), each flown on all five vessels and averaged: the champion, its own start and the PD autopilot.
//   run     trains one draw (`run --arm fly|plain14 --seed S`) or all twenty (`run --all`, the arms alternating by seed so that a partial run is balanced), writing robust-<fly|plain>-<S>.json; a draw whose file exists is skipped.
//   report  reads those files and the stage-1 dumps: the checks first (SEEDS, RECIPE, ONE ENVIRONMENT, START, CHAMPIONS; a failure is the first line and the reading is NOT WEIGHED), then the stage-1 reading on the safety audit:
//           an exact one-sided rank-sum, reused from tools/ship/plain14Distribution.mjs.
// Everything that touches the world (the files, the child processes, the flying of the audits, the environment) comes in through the seams of `io`, so the gate drives every branch with none of them.
"use strict";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { spawn as nodeSpawn } from "node:child_process";
import * as D from "./plain14Distribution.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url)), ENG = path.resolve(HERE, "..", "..");
export const ARMS = D.ARMS, SEEDS = D.SEEDS, AUDITS = D.AUDITS, READ_ON = D.READ_ON, ALPHA = D.ALPHA, MIN_DRAWS = D.MIN_DRAWS, TOL = D.TOL;
export const STAGE1_PREFIX = Object.freeze({ fly: "fly", plain14: "plain" }), WEIGHTS = Object.freeze({ fly: 963, plain14: 954 });
export const RECIPE = Object.freeze({ searches: 4, iters: 200, sigma: 0.3, maxK: 4, vessels: 5, actuators: false, orientation: "euler" });
export const AUDIT_BASE = 95000, SEARCH_SEED_BASE = 52000;
export const DEFAULT_OUT = "brain/rig-results/plain14-robust", DEFAULT_STAGE1 = "brain/rig-results/plain14";
/** The seed of search k (0 to 3) of the draw with index d (0 to 9). */
export const searchSeed = (d, k) => SEARCH_SEED_BASE + 10 * d + k;
export const recordName = (arm, seed) => `robust-${STAGE1_PREFIX[arm]}-${seed}.json`;
/** The five vessels: the same five tools/trainSubRobust.mjs trains on (the gate holds the two literals equal). */
export const VARIANTS_SOURCE = "const E = S.EXPLORER, VARIANTS = [{}, { munk: 3000 }, { munk: 0 }, { finArea: E.finArea * 0.6 }, { bg: E.bg * 2.5 }];";

// ---- weights ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
/** A short hash of a weight list, as float32 (the trainer works in float32): the same hash on every machine. */
export const hashOf = (w) => crypto.createHash("sha256").update(JSON.stringify(Array.from(Float32Array.from(w)))).digest("hex").slice(0, 16);
/** The champion of a stage-1 dump: { seed, weights }. The champion is the run whose seed is `champion`; its weights must be the arm's length. */
export function championWeights(dump, arm, name = "the dump") {
    if (!dump || !Array.isArray(dump.runs) || !Number.isInteger(dump.champion)) throw new Error(`plain14RobustStage.championWeights: ${name} has no champion (no run was eligible)`);
    const run = dump.runs.find((r) => r && r.seed === dump.champion);
    if (!run || !Array.isArray(run.weights)) throw new Error(`plain14RobustStage.championWeights: ${name} names champion ${dump.champion} but holds no such run with weights`);
    if (run.weights.length !== WEIGHTS[arm]) throw new Error(`plain14RobustStage.championWeights: ${name}'s champion has ${run.weights.length} weights, a ${arm} net has ${WEIGHTS[arm]}`);
    if (!run.weights.every(Number.isFinite)) throw new Error(`plain14RobustStage.championWeights: ${name}'s champion has a weight that is not a number`);
    return { seed: dump.champion, weights: run.weights };
}
/** The champion of a draw's searches: the best finite heldScore; a tie goes to the lower seed; null when no search has one. */
export function pickChampion(searches) {
    const ok = searches.filter((s) => s && Number.isFinite(s.heldScore) && Array.isArray(s.weights));
    if (!ok.length) return null;
    return ok.reduce((a, b) => (b.heldScore > a.heldScore || (b.heldScore === a.heldScore && b.seed < a.seed) ? b : a));
}

// ---- running one draw ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------
/**
 * Train one draw and write its record. io: { readFile, writeFile, exists, mkdir, spawn, flyAudits, env, log, outDir, stage1Dir }.
 *   spawn({ args, env }) -> Promise<{ code }> runs `node tools/trainSubRobust.mjs ...args`; flyAudits(arm, weights | null) -> Promise<{ audit, safetyAudit, reserve }> (each { score, crashed }; null weights = the PD autopilot).
 * Returns { skipped: true } when the record exists, else { record, file }.
 */
export async function runDraw(arm, seed, io) {
    const d = SEEDS.indexOf(seed);
    if (!ARMS.includes(arm) || d < 0) throw new Error(`plain14RobustStage.runDraw: ${JSON.stringify(arm)} ${JSON.stringify(seed)} is not an arm and one of the ten seeds`);
    const out = io.outDir || DEFAULT_OUT, stage1 = io.stage1Dir || DEFAULT_STAGE1, file = `${out}/${recordName(arm, seed)}`;
    if (io.exists(file)) { io.log(`${arm} ${seed}: ${file} exists, skipped`); return { skipped: true, file }; }
    const dumpName = `${stage1}/${STAGE1_PREFIX[arm]}${seed}.json`, start = championWeights(D.parseDump(io.readFile(dumpName), dumpName), arm, dumpName);
    io.mkdir(out);
    const startFile = `${out}/start-${STAGE1_PREFIX[arm]}-${seed}.json`;
    io.writeFile(startFile, JSON.stringify({ arm, seed, fromSeed: start.seed, hash: hashOf(start.weights), weights: start.weights }));
    const env = { ...io.env, SWEK_6DOF_ORIENTATION: RECIPE.orientation };
    io.log(`${arm} ${seed}: ${RECIPE.searches} searches of ${RECIPE.iters} iterations from the stage-1 champion (seed ${start.seed}), five vessels`);
    const files = Array.from({ length: RECIPE.searches }, (_, k) => `${out}/search-${STAGE1_PREFIX[arm]}-${seed}-${k}.json`);
    const codes = await Promise.all(files.map((f, k) => io.spawn({ env, args: ["--circuit", arm, "--seed", String(searchSeed(d, k)), "--iters", String(RECIPE.iters), "--from", startFile, "--out", f] })));
    const searches = files.map((f, k) => {
        const base = { k, seed: searchSeed(d, k), code: codes[k] && codes[k].code, iters: null, actuators: null, trainScore: null, heldScore: null, weights: null };
        if (!codes[k] || codes[k].code !== 0) return base;   // a search that died is passed over even if an older run left its file behind; a file that is missing or not JSON is passed over by the catch below
        try { const r = JSON.parse(io.readFile(f)); return { ...base, iters: r.iters, actuators: r.actuators, circuit: r.circuit || "fly", trainScore: r.trainScore, heldScore: r.heldScore, weights: r.weights }; } catch (e) { return base; }
    });
    const pick = pickChampion(searches);
    const startScores = await io.flyAudits(arm, start.weights), auto = await io.flyAudits(arm, null), champScores = pick ? await io.flyAudits(arm, pick.weights) : null;
    const record = {
        schema: 1, kind: "plain14-robust-stage", arm, seed, index: d, recipe: { ...RECIPE, orientation: env.SWEK_6DOF_ORIENTATION }, startFrom: start.seed, startHash: hashOf(start.weights),
        searches: searches.map(({ weights, ...rest }) => ({ ...rest, weightsHash: weights ? hashOf(weights) : null })), champion: pick ? pick.seed : null, championHash: pick ? hashOf(pick.weights) : null,
        championWeights: pick ? pick.weights : null, scores: champScores, start: startScores, auto,
    };
    io.writeFile(file, JSON.stringify(record));
    io.log(`${arm} ${seed}: ${pick ? `champion search ${pick.seed}, safety audit ${champScores.safetyAudit.score.toFixed(4)} (start ${startScores.safetyAudit.score.toFixed(4)}, autopilot ${auto.safetyAudit.score.toFixed(4)})` : "NO search produced a held-out score"}`);
    return { record, file };
}

// ---- reading the records ------------------------------------------------------------------------------------------------------------------------------------------------------------------------
/** A record file parsed, its name in the error. */
export function parseRecord(text, name) {
    let r; try { r = JSON.parse(text); } catch (e) { throw new Error(`plain14RobustStage.parseRecord: ${name} is not JSON`); }
    if (!r || r.kind !== "plain14-robust-stage" || !r.recipe || !r.auto || !r.start || !Array.isArray(r.searches)) throw new Error(`plain14RobustStage.parseRecord: ${name} is not a record of this tool`);
    return r;
}
const num = (x) => (x && Number.isFinite(x.score) ? x.score : null), cr = (x) => (x && Number.isFinite(x.crashed) ? x.crashed : null);
/** One draw from a record: { name, arm, seed, recipe, startHash, searches, champion (bool), scores, start, auto, crashed (the champion's early ends per audit) }. */
export function drawOf(r, name) {
    const read = (o) => (o && AUDITS.every((a) => num(o[a]) !== null) ? Object.fromEntries(AUDITS.map((a) => [a, num(o[a])])) : null);
    const scores = r.champion !== null && r.champion !== undefined ? read(r.scores) : null;
    return { name, arm: r.arm, seed: r.seed, recipe: r.recipe, startHash: r.startHash, searches: r.searches, champion: scores !== null, scores, start: read(r.start), auto: read(r.auto), crashed: scores ? Object.fromEntries(AUDITS.map((a) => [a, cr(r.scores[a])])) : null };
}

/** The checks, in order: [{ name, ok, text }]. `draws` are drawOf's results; `stage1` maps `${arm}:${seed}` to the hash of that stage-1 dump's champion. */
export function checksOf(draws, stage1) {
    const rows = [], by = (arm) => draws.filter((d) => d.arm === arm), seedBad = [];
    for (const arm of ARMS) {
        const got = by(arm).map((d) => d.seed).sort((a, b) => a - b), dup = got.filter((s, i) => got.indexOf(s) !== i), miss = SEEDS.filter((s) => !got.includes(s)), extra = got.filter((s) => !SEEDS.includes(s));
        if (dup.length) seedBad.push(`${arm} has seed ${[...new Set(dup)].join(", ")} twice`);
        if (miss.length) seedBad.push(`${arm} is missing seed ${miss.join(", ")}`);
        if (extra.length) seedBad.push(`${arm} has seed ${extra.join(", ")}, which is not one of the ten`);
    }
    for (const d of draws) if (!ARMS.includes(d.arm)) seedBad.push(`${d.name} is of circuit ${JSON.stringify(d.arm)}, not fly or plain14`);
    rows.push({ name: "SEEDS", ok: seedBad.length === 0, text: seedBad.length ? seedBad.join("; ") : "ten fly draws and ten plain14 draws, seeds 6310 to 6400 once each" });
    const recipeBad = draws.filter((d) => Object.keys(RECIPE).some((k) => d.recipe[k] !== RECIPE[k]) || d.searches.length !== RECIPE.searches || d.searches.some((s, k) => s.iters !== null && (s.iters !== RECIPE.iters || s.actuators !== false || s.seed !== searchSeed(SEEDS.indexOf(d.seed), k)))).map((d) => d.name);
    rows.push({ name: "RECIPE", ok: recipeBad.length === 0, text: recipeBad.length ? `${recipeBad.join(", ")} did not run the recipe (4 searches, 200 iterations, sigma 0.3, maxK 4, five vessels, no limits, first-order step, seeds 52000 + 10 d + k)` : "every draw ran the recipe (4 searches, 200 iterations, sigma 0.3, maxK 4, five vessels, no limits, first-order step)" });
    const withAuto = draws.filter((d) => d.auto), noAuto = draws.filter((d) => !d.auto).map((d) => d.name), ref = withAuto[0];
    const diff = ref ? withAuto.filter((d) => AUDITS.some((a) => Math.abs(d.auto[a] - ref.auto[a]) > TOL)).map((d) => d.name) : [];
    rows.push({ name: "ONE ENVIRONMENT", ok: noAuto.length === 0 && diff.length === 0 && !!ref, text: !ref ? "no record carries the autopilot's numbers" : noAuto.length ? `${noAuto.join(", ")} carry no autopilot numbers` : diff.length ? `${diff.join(", ")} carry other autopilot numbers than ${ref.name} (safety audit ${ref.auto.safetyAudit.toFixed(4)})` : `all ${withAuto.length} records carry the same autopilot numbers (audit ${ref.auto.audit.toFixed(4)}, safety ${ref.auto.safetyAudit.toFixed(4)}, reserve ${ref.auto.reserve.toFixed(4)}, five vessels)` });
    const startBad = draws.filter((d) => !stage1 || stage1[`${d.arm}:${d.seed}`] === undefined || stage1[`${d.arm}:${d.seed}`] !== d.startHash).map((d) => d.name);
    rows.push({ name: "START", ok: startBad.length === 0, text: startBad.length ? `${startBad.join(", ")} did not start from the champion of the stage-1 dump of the same seed and arm (the hashes differ, or there is no such dump)` : "every draw started from the champion of its own stage-1 dump (the hashes match)" });
    const few = ARMS.filter((arm) => by(arm).filter((d) => d.champion).length < MIN_DRAWS).map((arm) => `${arm} has ${by(arm).filter((d) => d.champion).length} draws with a champion (need ${MIN_DRAWS})`);
    rows.push({ name: "CHAMPIONS", ok: few.length === 0, text: few.length ? few.join("; ") : `at least ${MIN_DRAWS} draws of each arm have a champion (fly ${by("fly").filter((d) => d.champion).length}, plain14 ${by("plain14").filter((d) => d.champion).length})` });
    return rows;
}

const f4 = (x) => (Number.isFinite(x) ? x.toFixed(4) : String(x)), fp = (p) => (p < 0.001 ? p.toExponential(1) : p.toFixed(4));
const WORDS = { BEATS: "THE FLY'S WIRING BEATS ITS PLAIN CONTROLS UNDER THE ROBUST OBJECTIVE", "IS BELOW": "THE FLY'S WIRING IS BELOW ITS PLAIN CONTROLS UNDER THE ROBUST OBJECTIVE", TIES: "THE FLY CANNOT BE TOLD APART FROM ITS PLAIN CONTROLS UNDER THE ROBUST OBJECTIVE" };
/** The bottom line of a reading. */
export const bottomLine = (r) => `${WORDS[r.reading]} (five-vessel safety audit: fly mean ${f4(r.meanFly)} of ${r.nFly}, plain14 mean ${f4(r.meanPlain)} of ${r.nPlain}, difference ${r.diff >= 0 ? "+" : ""}${f4(r.diff)}; exact one-sided p that the fly is higher ${fp(r.pHigher)}, lower ${fp(r.pLower)})`;
/** THE REPORT of the draws: the checks first; a failed check is the first line and the reading is NOT WEIGHED. Returns the lines. */
export function report(draws, stage1) {
    const L = [], checks = checksOf(draws, stage1), failed = checks.filter((c) => !c.ok);
    if (failed.length) L.push(`CHECK FAILED -- ${failed.map((c) => c.name).join(", ")}: THE CHECKS FAILED, THE READING IS NOT WEIGHED`);
    L.push(`ROUND 7 STAGE 2 AS ONE STAGE: ${draws.filter((d) => d.arm === "fly").length} fly draws against ${draws.filter((d) => d.arm === "plain14").length} plain 14-50-4 draws, each started from its own stage-1 champion and trained for the five-vessel robust objective (brain/PLAIN14_ROBUST_STAGE_WIP.md); the champion read once on fresh audits flown on all five vessels: the audit (36 dives), the safety audit (500) and the reserve (18)`);
    for (const c of checks) L.push(`  ${c.ok ? "PASS" : "FAIL"} ${c.name}: ${c.text}`);
    const ref = draws.find((d) => d.auto);
    if (ref) L.push(`the PD autopilot on the same audits and vessels: ${AUDITS.map((a) => `${a} ${f4(ref.auto[a])}`).join(" | ")}`);
    for (const arm of ARMS) {
        const ds = draws.filter((d) => d.arm === arm).sort((a, b) => a.seed - b.seed);
        L.push(`${arm === "fly" ? "fly (Giant Fiber Circuit, 963 weights)" : "plain14 (14-50-4, 954 weights)"}: audit / safety audit / reserve of each draw's champion, then of its own start, and the safety-audit dives that ended early`);
        for (const d of ds) L.push(`  seed ${d.seed}: ${d.champion ? `${f4(d.scores.audit)}  ${f4(d.scores.safetyAudit)}  ${f4(d.scores.reserve)}   start ${d.start ? `${f4(d.start.audit)}  ${f4(d.start.safetyAudit)}  ${f4(d.start.reserve)}` : "unknown"}   ended early ${d.crashed.safetyAudit}` : "no champion (no search produced a held-out score): left out"}`);
    }
    if (failed.length) { L.push("BOTTOM LINE: NOT WEIGHED (a check failed)"); return L; }
    const pick = (arm, a) => draws.filter((d) => d.arm === arm && d.champion).map((d) => d.scores[a]), reads = Object.fromEntries(AUDITS.map((a) => [a, D.readAudit(pick("fly", a), pick("plain14", a))]));
    for (const a of AUDITS) { const r = reads[a]; L.push(`${a === READ_ON ? "READ ON " : ""}${a}: fly mean ${f4(r.meanFly)} (range ${f4(Math.min(...pick("fly", a)))} to ${f4(Math.max(...pick("fly", a)))}), plain14 mean ${f4(r.meanPlain)} (range ${f4(Math.min(...pick("plain14", a)))} to ${f4(Math.max(...pick("plain14", a)))}), difference ${r.diff >= 0 ? "+" : ""}${f4(r.diff)}; exact one-sided p fly higher ${fp(r.pHigher)}, fly lower ${fp(r.pLower)}: ${r.reading}`); }
    const n = (arm) => draws.filter((d) => d.arm === arm && d.champion).length, better = (arm) => draws.filter((d) => d.arm === arm && d.champion && d.start && d.scores.safetyAudit > d.start.safetyAudit).length, early = (arm) => draws.filter((d) => d.arm === arm && d.champion && d.crashed.safetyAudit > 0).length;
    L.push(`draws that IMPROVED on their own start on the safety audit: fly ${better("fly")} of ${n("fly")}, plain14 ${better("plain14")} of ${n("plain14")}; draws with a dive that ended early on it: fly ${early("fly")}, plain14 ${early("plain14")}`);
    L.push(`BOTTOM LINE: ${bottomLine(reads[READ_ON])}`);
    return L;
}

// ---- the world ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
/** The gate sets this: a mutant of this file that leaked a REAL child process or a REAL audit (hundreds of flights) would otherwise run for an hour behind the gate's back. The gate's own few real calls pass `allowReal`. */
const forbidReal = (allow) => process.env.SWEK_P14RS_FORBID_REAL === "1" && !allow;
/**
 * Fly the audits for real: the champion (weights), or the PD autopilot (null), on the five vessels, averaged. Imports the physics lazily so a report never loads it.
 * opts: { sets } replaces the audit sets (the gate flies two dives), { allowReal } lets it run when the gate has forbidden real work.
 */
export async function realFlyAudits(arm, weights, opts = {}) {
    if (forbidReal(opts.allowReal)) throw new Error("plain14RobustStage.realFlyAudits: real flying is forbidden here (SWEK_P14RS_FORBID_REAL)");
    const T = await import("../../brain/subTask.mjs"), S = await import("../../physics/mechanics/subModel6dof.mjs"), AS = await import("../../brain/autopilotSub.mjs"), { auditSets } = await import("../auditSubChampion.mjs");
    const P = arm === "plain14" ? (await import("../../brain/pilotSubPlain.mjs")).PLAIN14 : await import("../../brain/pilotSubPolicy.mjs");
    const E = S.EXPLORER, VARIANTS = [{}, { munk: 3000 }, { munk: 0 }, { finArea: E.finArea * 0.6 }, { bg: E.bg * 2.5 }], models = VARIANTS.map((v) => S.createSubModel(Object.freeze({ ...E, ...v })));
    const fresh = auditSets(AUDIT_BASE), sets = opts.sets || { audit: fresh.audit, safetyAudit: fresh.safety, reserve: T.BASELINE_SET }, w = weights ? Float32Array.from(weights) : null, out = {};
    for (const a of AUDITS) {
        const runs = models.map((m) => (w ? P.evaluate(w, sets[a], { model: m }) : T.evaluate(AS.pilot(), sets[a], { model: m })));
        out[a] = { score: runs.reduce((s, r) => s + r.score, 0) / runs.length, crashed: runs.reduce((s, r) => s + r.crashed, 0), vessels: runs.length };
    }
    return out;
}
/** Run `node tools/trainSubRobust.mjs ...args` with a child process; progress lines of the child go to `log` behind its search number. */
export function realSpawn({ args, env, allowReal }) {
    if (forbidReal(allowReal)) return Promise.reject(new Error("plain14RobustStage.realSpawn: a real child process is forbidden here (SWEK_P14RS_FORBID_REAL)"));
    return new Promise((resolve) => {
        const tag = args[args.indexOf("--seed") + 1], p = nodeSpawn(process.execPath, [path.join(ENG, "tools", "trainSubRobust.mjs"), ...args], { cwd: ENG, env, stdio: ["ignore", "ignore", "pipe"], windowsHide: true });
        p.stderr.on("data", (b) => { for (const l of String(b).split(/\r?\n/)) if (l.trim()) console.error(`[search ${tag}] ${l}`); });
        p.on("error", () => resolve({ code: -1 })); p.on("close", (code) => resolve({ code: code === null ? -1 : code }));
    });
}
export const realIo = (over = {}) => ({
    readFile: (f) => fs.readFileSync(path.resolve(ENG, f), "utf8"), writeFile: (f, t) => fs.writeFileSync(path.resolve(ENG, f), t), exists: (f) => fs.existsSync(path.resolve(ENG, f)), mkdir: (d) => fs.mkdirSync(path.resolve(ENG, d), { recursive: true }),
    listDir: (d) => fs.readdirSync(path.resolve(ENG, d)), spawn: realSpawn, flyAudits: realFlyAudits, env: process.env, log: (m) => console.log(m), ...over,
});

// ---- the command -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
const RECORD = /^robust-(fly|plain)-(\d+)\.json$/;
const USAGE = "plain14RobustStage: run --all | run --arm fly|plain14 --seed S [--out DIR] [--stage1 DIR]   or   report [--dir DIR] [--stage1 DIR]";
/** Parse `--name value` pairs after the command; null for anything that is not a known pair. */
function pairs(rest, known) {
    const o = {};
    for (let i = 0; i < rest.length; i += 2) { const k = rest[i]; if (!known.includes(k) || rest[i + 1] === undefined || String(rest[i + 1]).startsWith("--") || k in o) return null; o[k] = rest[i + 1]; }
    return o;
}
/** `run` and `report`. Returns 0, 1 (a refusal or a failure) or 2 (a bad argument). `io` replaces the seams of realIo. */
export async function command(argv, io = {}) {
    const w = realIo(io), err = io.err || ((m) => console.error(m)), out = io.out || ((m) => console.log(m)), [cmd, ...rest] = argv;
    if (cmd === "run") {
        const all = rest[0] === "--all", p = pairs(all ? rest.slice(1) : rest, all ? ["--out", "--stage1"] : ["--arm", "--seed", "--out", "--stage1"]);
        if (!p || (!all && (!p["--arm"] || !p["--seed"]))) { err(USAGE); return 2; }
        const outDir = p["--out"] || DEFAULT_OUT, stage1Dir = p["--stage1"] || DEFAULT_STAGE1, ctx = { ...w, outDir, stage1Dir };
        let todo;
        if (all) todo = SEEDS.flatMap((s) => ARMS.map((a) => [a, s]));
        else { const s = Number(p["--seed"]); if (!ARMS.includes(p["--arm"]) || !SEEDS.includes(s)) { err(`plain14RobustStage: --arm must be fly or plain14 and --seed one of ${SEEDS.join(", ")}`); return 2; } todo = [[p["--arm"], s]]; }
        for (const [arm, seed] of todo) { try { await runDraw(arm, seed, ctx); } catch (e) { err(`plain14RobustStage: ${arm} ${seed}: ${e.message}`); return 1; } }
        return 0;
    }
    if (cmd === "report") {
        const p = pairs(rest, ["--dir", "--stage1"]);
        if (!p) { err(USAGE); return 2; }
        const dir = (p["--dir"] || DEFAULT_OUT).replace(/[\\/]+$/, ""), stage1Dir = (p["--stage1"] || DEFAULT_STAGE1).replace(/[\\/]+$/, "");
        let names; try { names = w.listDir(dir).filter((n) => RECORD.test(n)).sort(); } catch (e) { err(`plain14RobustStage: cannot read the directory ${dir}: ${e.message}`); return 1; }
        if (!names.length) { err(`plain14RobustStage: ${dir} holds no robust-fly-<S>.json or robust-plain-<S>.json record`); return 1; }
        const draws = [], stage1 = {};
        for (const n of names) {
            let r; try { r = parseRecord(w.readFile(`${dir}/${n}`), n); } catch (e) { err("plain14RobustStage: " + e.message); return 1; }
            const m = RECORD.exec(n);
            if (r.arm !== (m[1] === "fly" ? "fly" : "plain14") || String(r.seed) !== m[2]) { err(`plain14RobustStage: ${n} records arm ${JSON.stringify(r.arm)} and seed ${r.seed}, which its name does not say`); return 1; }
            draws.push(drawOf(r, n));
            const dn = `${stage1Dir}/${STAGE1_PREFIX[r.arm]}${r.seed}.json`;
            try { stage1[`${r.arm}:${r.seed}`] = hashOf(championWeights(D.parseDump(w.readFile(dn), dn), r.arm, dn).weights); } catch (e) { /* no stage-1 champion to compare with: the START check names this draw */ }
        }
        for (const l of report(draws, stage1)) out(l);
        return 0;
    }
    err(USAGE); return 2;
}
