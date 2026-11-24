// WebGLEngine/tools/ship/plain14Distribution.mjs -- UNNUMBERED (the version is chosen at ship time) (the command line is tools/ship/plain14DistributionCmd.mjs; the registration is brain/PLAIN14_DISTRIBUTION_WIP.md, written BEFORE this file and before any seed was trained; the gate is tools/ship/plain14Distribution-selfcheck.mjs)
//
// THE REPORT OF ROUND 7, STAGE 1: ten fly champions against ten plain 14-50-4 champions, each trained by `tools/ship/trainPilotSub.mjs --circuit <fly|plain14> --seed S --dump <file>` for S = 6310, 6320, ..., 6400 (the dumps are what the trainer's `--dump` writes: `dumpOf` in tools/ship/trainSubPilot.mjs). THIS FILE TRAINS NOTHING AND FLIES NOTHING: it reads the dumps in a directory, `fly<S>.json` and `plain<S>.json`.
//   CHECKS (a failure is the first line of the report and the reading is NOT WEIGHED): SEEDS (ten of each arm, each seed once), RECIPE (every dump records its circuit, 4 runs, 400 iterations, sigma 0.3, maxK 4, slice 1), ONE ENVIRONMENT (every dump carries the SAME autopilot numbers on the audit, the safety audit and the reserve: the hand weights fly the same dives, so a difference means other sets, vessel, engine or machine), CHAMPIONS (at least 8 draws of each arm have a champion).
//   THE READING, on the safety audit (500 dives): an exact one-sided rank-sum (Mann-Whitney) test of the fly's champions against the plain champions; BEATS iff the one-sided exact p that the fly is higher is at most 0.05, IS BELOW iff the p that it is lower is, else CANNOT BE TOLD APART. Ties count against the arm being tested (strict comparisons), so they are conservative. The audit and the reserve are reported beside it with their p-values.
// A library: no clock, no Math.random; the directory and the files are read through the seams `io` gives.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url)), ENG = path.resolve(HERE, "..", "..");
export const ARMS = Object.freeze(["fly", "plain14"]), PREFIX = Object.freeze({ fly: "fly", plain14: "plain" });
export const SEEDS = Object.freeze(Array.from({ length: 10 }, (_, i) => 6310 + 10 * i));
export const RECIPE = Object.freeze({ runs: 4, iters: 400, sigma: 0.3, maxK: 4, slice: 1 });
export const AUDITS = Object.freeze(["audit", "safetyAudit", "reserve"]), READ_ON = "safetyAudit", ALPHA = 0.05, MIN_DRAWS = 8, TOL = 1e-9;
export const COMMITTED_AUTOPILOT = Object.freeze({ audit: -0.4956, safetyAudit: -0.5564, reserve: -0.5146 });   // history: the numbers of brain/SUBMARINE_WIP.md; NOT a check

// ---- the dumps ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
/** A dump file parsed, its name in the error. */
export function parseDump(text, name) {
    let d; try { d = JSON.parse(text); } catch (e) { throw new Error(`plain14Distribution.parseDump: ${name} is not JSON`); }
    if (!d || typeof d !== "object" || !d.recipe || typeof d.recipe !== "object" || !d.auto) throw new Error(`plain14Distribution.parseDump: ${name} is not a dump of tools/ship/trainSubPilot.mjs (no recipe or no autopilot)`);
    return d;
}
/** One draw out of a dump: { arm, seed, recipe, champion (bool), qualifies, scores: { audit, safetyAudit, reserve } | null, auto: { audit, safetyAudit, reserve } | null }. */
export function drawOf(dump, name) {
    const num = (x) => (x && Number.isFinite(x.score) ? x.score : null), c = dump.champ || null;
    const auto = AUDITS.map((a) => num(dump.auto[a])), scores = c ? AUDITS.map((a) => num(c[a])) : null;
    return { name, arm: dump.recipe.circuit, seed: dump.recipe.seed, recipe: dump.recipe, champion: !!c && scores.every((s) => s !== null), qualifies: !!(dump.verdict && dump.verdict.ok), scores: c ? Object.fromEntries(AUDITS.map((a, i) => [a, scores[i]])) : null, auto: auto.every((s) => s !== null) ? Object.fromEntries(AUDITS.map((a, i) => [a, auto[i]])) : null };
}

// ---- the exact rank-sum ------------------------------------------------------------------------------------------------------------------------------------------------------------------------
/** The number of arrangements of n1 + n2 distinct values that give each value of U (the count of pairs in which a member of the first group is above a member of the second): an array indexed by U. */
export function uCounts(n1, n2) {
    const memo = new Map();
    const f = (a, b) => {
        if (a === 0 || b === 0) return [1];
        const k = a + "," + b; if (memo.has(k)) return memo.get(k);
        const x = f(a - 1, b), y = f(a, b - 1), out = new Array(a * b + 1).fill(0);
        x.forEach((c, u) => { out[u + b] += c; }); y.forEach((c, u) => { out[u] += c; });
        memo.set(k, out); return out;
    };
    return f(n1, n2);
}
/** The exact one-sided p that U is at least `u` among all arrangements of n1 and n2 values. */
export function pAtLeast(u, n1, n2) {
    const c = uCounts(n1, n2), total = c.reduce((s, x) => s + x, 0);
    let s = 0; for (let k = Math.max(0, Math.ceil(u)); k < c.length; k++) s += c[k];
    return s / total;
}
/** The number of pairs (a in A, b in B) with a above b, strictly (a tie counts for no one). */
export const above = (A, B) => A.reduce((s, a) => s + B.reduce((t, b) => t + (a > b ? 1 : 0), 0), 0);
export const meanOf = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
/** The reading of one audit: { nFly, nPlain, meanFly, meanPlain, diff, pHigher, pLower, reading }. */
export function readAudit(fly, plain) {
    const n1 = fly.length, n2 = plain.length, pHigher = pAtLeast(above(fly, plain), n1, n2), pLower = pAtLeast(above(plain, fly), n1, n2);
    return { nFly: n1, nPlain: n2, meanFly: meanOf(fly), meanPlain: meanOf(plain), diff: meanOf(fly) - meanOf(plain), pHigher, pLower, reading: pHigher <= ALPHA ? "BEATS" : pLower <= ALPHA ? "IS BELOW" : "TIES" };
}

// ---- the checks --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
/** The checks, in order: [{ name, ok, text }]. `draws` are drawOf's results. */
export function checksOf(draws) {
    const rows = [], by = (arm) => draws.filter((d) => d.arm === arm);
    const seedBad = [];
    for (const arm of ARMS) {
        const got = by(arm).map((d) => d.seed).sort((a, b) => a - b), dup = got.filter((s, i) => got.indexOf(s) !== i), miss = SEEDS.filter((s) => !got.includes(s)), extra = got.filter((s) => !SEEDS.includes(s));
        if (dup.length) seedBad.push(`${arm} has seed ${[...new Set(dup)].join(", ")} twice`);
        if (miss.length) seedBad.push(`${arm} is missing seed ${miss.join(", ")}`);
        if (extra.length) seedBad.push(`${arm} has seed ${extra.join(", ")}, which is not one of the ten`);
    }
    for (const d of draws) if (!ARMS.includes(d.arm)) seedBad.push(`${d.name} is of circuit ${JSON.stringify(d.arm)}, not fly or plain14`);
    rows.push({ name: "SEEDS", ok: seedBad.length === 0, text: seedBad.length ? seedBad.join("; ") : "ten fly draws and ten plain14 draws, seeds 6310 to 6400 once each" });
    const recipeBad = draws.filter((d) => ["runs", "iters", "sigma", "maxK", "slice"].some((k) => d.recipe[k] !== RECIPE[k])).map((d) => d.name);
    rows.push({ name: "RECIPE", ok: recipeBad.length === 0, text: recipeBad.length ? `${recipeBad.join(", ")} did not train by the base recipe (4 runs, 400 iterations, sigma 0.3, maxK 4, slice 1)` : "every dump trained by the base recipe (4 runs, 400 iterations, sigma 0.3, maxK 4, slice 1)" });
    const withAuto = draws.filter((d) => d.auto), noAuto = draws.filter((d) => !d.auto).map((d) => d.name), ref = withAuto[0];
    const diff = ref ? withAuto.filter((d) => AUDITS.some((a) => Math.abs(d.auto[a] - ref.auto[a]) > TOL)).map((d) => d.name) : [];
    rows.push({ name: "ONE ENVIRONMENT", ok: noAuto.length === 0 && diff.length === 0 && !!ref, text: !ref ? "no dump carries the autopilot's numbers" : noAuto.length ? `${noAuto.join(", ")} carry no autopilot numbers` : diff.length ? `${diff.join(", ")} carry other autopilot numbers than ${ref.name} (audit ${ref.auto.audit.toFixed(4)}, safety ${ref.auto.safetyAudit.toFixed(4)}, reserve ${ref.auto.reserve.toFixed(4)}): the dumps were not made in one environment` : `all ${draws.length} dumps carry the same autopilot numbers (audit ${ref.auto.audit.toFixed(4)}, safety ${ref.auto.safetyAudit.toFixed(4)}, reserve ${ref.auto.reserve.toFixed(4)}; the committed note's are ${COMMITTED_AUTOPILOT.audit.toFixed(4)}, ${COMMITTED_AUTOPILOT.safetyAudit.toFixed(4)}, ${COMMITTED_AUTOPILOT.reserve.toFixed(4)}, history and not a check)` });
    const few = ARMS.filter((arm) => by(arm).filter((d) => d.champion).length < MIN_DRAWS).map((arm) => `${arm} has ${by(arm).filter((d) => d.champion).length} draws with a champion (need ${MIN_DRAWS})`);
    rows.push({ name: "CHAMPIONS", ok: few.length === 0, text: few.length ? few.join("; ") : `at least ${MIN_DRAWS} draws of each arm have a champion (fly ${by("fly").filter((d) => d.champion).length}, plain14 ${by("plain14").filter((d) => d.champion).length})` });
    return rows;
}

// ---- the report --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
const f4 = (x) => (Number.isFinite(x) ? x.toFixed(4) : String(x)), sgn = (x) => (x >= 0 ? "+" : "") + x.toFixed(4), fp = (p) => (p < 0.001 ? p.toExponential(1) : p.toFixed(4));
/** The bottom line of a reading. */
export const bottomLine = (r) => (r.reading === "BEATS" ? "THE FLY'S WIRING BEATS ITS PLAIN CONTROLS" : r.reading === "IS BELOW" ? "THE FLY'S WIRING IS BELOW ITS PLAIN CONTROLS" : "THE FLY CANNOT BE TOLD APART FROM ITS PLAIN CONTROLS") + ` (safety audit: fly mean ${f4(r.meanFly)} of ${r.nFly}, plain14 mean ${f4(r.meanPlain)} of ${r.nPlain}, difference ${sgn(r.diff)}; exact one-sided p that the fly is higher ${fp(r.pHigher)}, lower ${fp(r.pLower)})`;
/** THE REPORT of the draws: the checks first; a failed check is the first line and the reading is NOT WEIGHED. Returns the lines. */
export function report(draws) {
    const L = [], checks = checksOf(draws), failed = checks.filter((c) => !c.ok);
    if (failed.length) L.push(`CHECK FAILED -- ${failed.map((c) => c.name).join(", ")}: THE CHECKS FAILED, THE READING IS NOT WEIGHED`);
    L.push(`ROUND 7 STAGE 1: ${draws.filter((d) => d.arm === "fly").length} fly draws against ${draws.filter((d) => d.arm === "plain14").length} plain 14-50-4 draws (brain/PLAIN14_DISTRIBUTION_WIP.md); each draw is a 4-search training, the champion read once on the audit (36 dives), the safety audit (500) and the reserve (18)`);
    for (const c of checks) L.push(`  ${c.ok ? "PASS" : "FAIL"} ${c.name}: ${c.text}`);
    for (const arm of ARMS) {
        const ds = draws.filter((d) => d.arm === arm).sort((a, b) => a.seed - b.seed);
        L.push(`${arm === "fly" ? "fly (Giant Fiber Circuit, 963 weights)" : "plain14 (14-50-4, 954 weights)"}: audit / safety audit / reserve of each draw's champion`);
        for (const d of ds) L.push(`  seed ${d.seed}: ${d.champion ? `${f4(d.scores.audit)}  ${f4(d.scores.safetyAudit)}  ${f4(d.scores.reserve)}  ${d.qualifies ? "QUALIFIES" : "does not qualify"}` : "no champion (no search was eligible): left out"}`);
    }
    if (failed.length) { L.push("BOTTOM LINE: NOT WEIGHED (a check failed)"); return L; }
    const pick = (arm, a) => draws.filter((d) => d.arm === arm && d.champion).map((d) => d.scores[a]), reads = Object.fromEntries(AUDITS.map((a) => [a, readAudit(pick("fly", a), pick("plain14", a))]));
    const q = (arm) => draws.filter((d) => d.arm === arm && d.champion && d.qualifies).length, n = (arm) => draws.filter((d) => d.arm === arm && d.champion).length;
    for (const a of AUDITS) { const r = reads[a]; L.push(`${a === READ_ON ? "READ ON " : ""}${a}: fly mean ${f4(r.meanFly)} (range ${f4(Math.min(...pick("fly", a)))} to ${f4(Math.max(...pick("fly", a)))}), plain14 mean ${f4(r.meanPlain)} (range ${f4(Math.min(...pick("plain14", a)))} to ${f4(Math.max(...pick("plain14", a)))}), difference ${sgn(r.diff)}; exact one-sided p fly higher ${fp(r.pHigher)}, fly lower ${fp(r.pLower)}: ${r.reading}`); }
    L.push(`draws that QUALIFY (the trainer's own test): fly ${q("fly")} of ${n("fly")}, plain14 ${q("plain14")} of ${n("plain14")}`);
    L.push(`BOTTOM LINE: ${bottomLine(reads[READ_ON])}`);
    return L;
}

// ---- the command -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
const NAME = /^(fly|plain)(\d+)\.json$/;
/** `report --dir <directory>`: reads fly<S>.json and plain<S>.json. Returns 0, 1 (a refusal) or 2 (a bad argument). `io`: { out, err, listDir, readFile }. */
export async function command(argv, io = {}) {
    const out = io.out || ((m) => console.log(m)), err = io.err || ((m) => console.error(m)), listDir = io.listDir || ((d) => fs.readdirSync(path.resolve(ENG, d))), readFile = io.readFile || ((f) => fs.readFileSync(path.resolve(ENG, f), "utf8"));
    const [cmd, ...rest] = argv;
    if (cmd !== "report") { err(`plain14Distribution: the first word must be report, got ${JSON.stringify(cmd)}`); return 2; }
    if (rest.length !== 2 || rest[0] !== "--dir" || !rest[1] || rest[1].startsWith("--")) { err(rest.length ? `plain14Distribution: report takes exactly --dir <directory> (got ${JSON.stringify(rest.join(" "))})` : "plain14Distribution: report needs --dir <directory>"); return 2; }
    const dir = rest[1]; let names;
    try { names = listDir(dir).filter((n) => NAME.test(n)).sort(); } catch (e) { err(`plain14Distribution: cannot read the directory ${dir}: ${e.message}`); return 1; }
    if (!names.length) { err(`plain14Distribution: ${dir} holds no fly<S>.json or plain<S>.json dump`); return 1; }
    const draws = [];
    for (const n of names) {
        try { draws.push(drawOf(parseDump(readFile(dir.replace(/[\\/]+$/, "") + "/" + n), n), n)); } catch (e) { err("plain14Distribution: " + e.message); return 1; }
        const m = NAME.exec(n), last = draws[draws.length - 1];
        if (last.arm !== (m[1] === "fly" ? "fly" : "plain14") || String(last.seed) !== m[2]) { err(`plain14Distribution: ${n} records circuit ${JSON.stringify(last.arm)} and seed ${last.seed}, which its name does not say`); return 1; }
    }
    for (const l of report(draws)) out(l);
    return 0;
}
