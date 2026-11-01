// WebGLEngine/tools/ship/advisorChipStudy.mjs -- UNNUMBERED (the version is chosen at ship time) (the library; the command is tools/ship/advisorChipStudyCmd.mjs; the gate is tools/ship/advisorChipStudy-selfcheck.mjs)
//
// THE ADVISOR CHIP TEST, AS REGISTERED IN brain/NEEDS_AND_LIMITS.md ("Round 4" and its Amendment 1, written before any of this): the champions Round 3 trained (brain/needsCircuitStageA.jsonl, the noisy condition) flown ALONE and with an advisor beside them (GUARDED, and
// GUARDED-FILTER for scale) in the modes of brain/advisorChip.mjs, on FRESH audits (seeds 111-162), then graded by the registered rules. Nothing is trained and nothing is selected on the audits; every arm is flown once per audit.
//   ARMS      per circuit: ALONE, and for each advisor VETO, V-SURFACE, V-CAP, V-SAFETY, V-STATION and STALE (13 arms), each on the three audits (48 dives each).
//   CHECKS    IDENTITY (the advisor that is the brain's own decision, no advisor, GUARDED advised by GUARDED and GUARDED-FILTER by itself are the unadvised pilots, 4 baseline dives), STAGE A COMPLETE (the 13 records of the study, none smoke), THE ADVISOR IS NOT TRIVIAL (GUARDED-FILTER beats
//             SPIN on far and both on each audit). A failed check is the first line of the report and the verdicts are not weighed.
//   VERDICTS  (Section 6) per circuit and advisor: HELPS / HURTS / NO EFFECT / MIXED (VETO against ALONE, paired); the WIRING-CHIP verdict (does cx GAIN MORE from the chip than ER, TYPE-BLOCK and DEGREE do); BRAIN ADDS TO THE RULE; CONTENT (VETO against STALE); the bottom line.
// A pilot A beats B on an audit iff the paired mean difference exceeds max(0.02, 2 se) (the same dives); the family comparison uses the sd of the family's effects, as Round 3.
// Pure apart from the files it reads and the processes it starts. No clock, no Math.random.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import * as T from "../../brain/needsTask.mjs";
import * as A from "../../brain/advisorChip.mjs";
import * as TR from "./trainNeedsCircuit.mjs";
import { meanOf, sdOf, readRecords, MIN_EDGE, SD_FACTOR, MIN_CONTROLS } from "./trainSubCircuits.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const STAGE_A_FILE = path.resolve(HERE, "..", "..", "brain", "needsCircuitStageA.jsonl");
export const ADVISOR_NAMES = Object.freeze(Object.keys(A.ADVISORS)), PRIMARY = "GUARDED", SECONDARY = "GUARDED-FILTER";
export const CHIP_MODES = Object.freeze(A.MODES.filter((m) => m !== "ALONE"));
export const AUDITS = A.ADV_AUDIT_NAMES;
export const GAUGE = T.GAUGE, STUDY = TR.STUDY, VERDICT_FAMILIES = TR.VERDICT_FAMILIES;
export const REFERENCE_NAMES = Object.freeze(["GUARDED", "GUARDED_FILTER", "GUARDED_OBS", "GUARDED_1T", "SPIN"]);
const REFERENCE = { GUARDED: T.GUARDED, GUARDED_FILTER: T.GUARDED_FILTER, GUARDED_OBS: T.GUARDED_OBS, GUARDED_1T: T.GUARDED_1T, SPIN: T.SPIN };
const NAMES = { nostate: "NO STATE", withheld: "WITHHELD", er: "ER", layer: "TYPE-BLOCK", degree: "DEGREE" };

/** The arms of one circuit, in the order they are flown: ALONE, then each advisor's chip modes. key "ALONE" or "GUARDED:VETO". */
export const armKey = (adv, mode) => (mode === "ALONE" ? "ALONE" : `${adv}:${mode}`);
export const ARMS = Object.freeze([{ key: "ALONE", adv: null, mode: "ALONE" }, ...ADVISOR_NAMES.flatMap((adv) => CHIP_MODES.map((mode) => ({ key: armKey(adv, mode), adv, mode })))]);

/** The audit sets; `smoke` shrinks each to every eighth dive. */
export function setsOf({ smoke = false } = {}) {
    return Object.fromEntries(AUDITS.map((k) => [k, smoke ? A.ADV_AUDITS[k].filter((_, i) => i % 8 === 0) : A.ADV_AUDITS[k]]));
}
export const summary = TR.summary;

// ---- stage A: the champions ------------------------------------------------------------------------------------------------------------------------------------------------------------------------
/** The champions of a stage A file's records: { refs, circuits: { spec: { spec, family, index, weights (Float32Array or null), hadChampion } }, hash }. The hash names exactly the weights the study will fly. */
export function championsOf(records) {
    const circuits = {}; let refs = null, h = 0x811c9dc5;
    for (const r of records) {
        if (r.family === "refs") { refs = r; continue; }
        const w = r.champion !== null && r.champion !== undefined && Array.isArray(r.weights) ? Float32Array.from(r.weights) : null;
        circuits[r.spec] = { spec: r.spec, family: r.family, index: r.index, weights: w, hadChampion: !!w, condition: r.condition, smoke: !!r.smoke };
        for (const ch of r.spec + "|" + (w ? Array.from(w).join(",") : "start")) { h ^= ch.charCodeAt(0); h = Math.imul(h, 0x01000193) >>> 0; }
    }
    return { refs, circuits, hash: h.toString(16).padStart(8, "0") };
}
/** Is stage A complete (the references record and the 12 circuits of the registered study, noisy, none smoke)? { ok, missing, why }. */
export function stageComplete(records) {
    const want = TR.parseSpecs(TR.STUDY).map(TR.specName), have = new Map(records.filter((r) => r.family !== "refs").map((r) => [r.spec, r]));
    const missing = want.filter((n) => !have.has(n)), hasRefs = records.some((r) => r.family === "refs");
    const bad = [...have.values()].filter((r) => r.condition !== "noisy" || r.smoke).map((r) => r.spec);
    return { ok: hasRefs && !missing.length && !bad.length, missing, why: !hasRefs ? "no references record" : missing.length ? "missing " + missing.join(", ") : bad.length ? "not noisy or a smoke record: " + bad.join(", ") : "" };
}

// ---- arms ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
const add = (a, b) => { for (const k of Object.keys(b)) a[k] = (a[k] || 0) + b[k]; return a; };
/** Fly one factory over a set under the gauge; the pilots made are kept so their stats can be summed. `ev` is the evaluator (T.evaluate; a gate may inject a stub). Returns { summary, stats }. */
export function flyArm(make, set, gauge, ev = T.evaluate, meta = null) {
    const pilots = [], factory = (ctx) => { const p = make(ctx); pilots.push(p); return p; };
    const res = ev(factory, set, { gauge }, meta);
    const stats = {}; for (const p of pilots) { const st = p && p.stats; if (st) add(stats, st); }
    return { summary: summary(res), stats };
}
/** The pilot factory of one arm for one brain seat. */
export const armFactory = (brainSeatOf, arm) => A.advisedPilot(brainSeatOf, arm.adv ? A.ADVISORS[arm.adv] : null, arm.mode);

/** The brain seat of a circuit: the champion's weights, or the untrained start (GUARDED-OBS exactly) when there was no champion. */
export function brainSeatOf(spec, circuit, champion, policyOf = TR.policyOf) {
    const Pol = policyOf(spec, circuit);
    return Pol.seatFor(champion && champion.weights ? champion.weights : Pol.handWeights());
}

/** One circuit: every arm on every audit. Returns the record the file keeps. */
export function runCircuit(spec, circuit, champion, opts = {}, log = () => {}) {
    const sets = opts.sets || setsOf({ smoke: !!opts.smoke }), ev = opts.evaluate || T.evaluate, name = TR.specName(spec);
    const seatOf = brainSeatOf(spec, circuit, champion, opts.policyOf);
    const arms = {}, stats = {};
    for (const arm of ARMS) {
        arms[arm.key] = {}; stats[arm.key] = {};
        for (const a of AUDITS) { const r = flyArm(armFactory(seatOf, arm), sets[a], GAUGE, ev, { spec: name, arm: arm.key, audit: a }); arms[arm.key][a] = r.summary; stats[arm.key][a] = r.stats; }
        log(`  ${name}: ${arm.key} ${AUDITS.map((a) => arms[arm.key][a].score.toFixed(3)).join(" | ")}`);
    }
    return { spec: name, family: spec.family, index: spec.index, smoke: !!opts.smoke, stageAHash: opts.stageAHash || null, hadChampion: !!(champion && champion.weights), arms, stats };
}

// ---- the references record: the unadvised rules on the audits, and the identity checks ---------------------------------------------------------------------------------------------------------
/** The four registered identity checks, flown on 4 baseline dives: [{ name, same }]. */
export function identityChecks(ev = T.evaluate) {
    const dives = [["far", 503, T.GAUGE], ["both", 501, T.GAUGE], ["deep", 502, null], ["plain", 501, T.GAUGE]].map(([kind, seed, gauge]) => ({ sc: T.scenario(seed, kind), gauge }));
    const flyAll = (f) => dives.map(({ sc, gauge }) => T.fly(f, sc, { gauge })), same = (x, y) => x.every((r, i) => r.fingerprint === y[i].fingerprint && r.score === y[i].score);
    const obs = T.ruleSeat("obs"), G = A.ADVISORS.GUARDED, F = A.ADVISORS["GUARDED-FILTER"], base = flyAll(T.GUARDED_OBS);
    return [
        { name: "a null advisor in VETO is the brain alone (GUARDED-OBS, 4 dives)", same: same(flyAll(A.advisedPilot(obs, null, "VETO")), base) },
        { name: "an advisor that is a second copy of the brain's own rule changes nothing", same: same(flyAll(A.advisedPilot(obs, obs, "VETO")), base) },
        { name: "GUARDED advised by GUARDED is GUARDED", same: same(flyAll(A.advisedPilot(G, G, "VETO")), flyAll(T.GUARDED)) },
        { name: "GUARDED-FILTER advised by itself is GUARDED-FILTER", same: same(flyAll(A.advisedPilot(F, F, "VETO")), flyAll(T.GUARDED_FILTER)) },
    ];
}
/** The references on the three audits (noisy gauge) and the identity checks. */
export function refsRecord(opts = {}) {
    const sets = opts.sets || setsOf({ smoke: !!opts.smoke }), ev = opts.evaluate || T.evaluate, references = {};
    for (const n of REFERENCE_NAMES) references[n] = Object.fromEntries(AUDITS.map((a) => [a, summary(ev(REFERENCE[n], sets[a], { gauge: GAUGE }, { ref: n, audit: a }))]));
    return { family: "refs", spec: "refs", smoke: !!opts.smoke, stageAHash: opts.stageAHash || null, references, identity: (opts.identity || identityChecks)() };
}

// ---- the checks, the verdicts, the report -------------------------------------------------------------------------------------------------------------------------------------------------------
const kindsOf = (s, kinds) => ({ runs: s.runs.filter((r) => kinds.includes(r.kind)) });
export const margin = (p) => Math.max(MIN_EDGE, SD_FACTOR * p.se);
const sign = (p) => (p.diff > margin(p) ? 1 : p.diff < -margin(p) ? -1 : 0);
const pairedOf = (a, b) => T.paired(a, b);
/** The registered checks. `stage` is stageComplete(...). { ok, rows: [{ name, ok, text }] }. */
export function checksOf(refs, stage) {
    const rows = [];
    rows.push({ name: "STAGE A COMPLETE", ok: stage.ok, text: stage.ok ? "the references record and the 12 circuits of the registered study, noisy, none smoke" : stage.why });
    rows.push({ name: "IDENTITY", ok: refs.identity.length > 0 && refs.identity.every((x) => x.same), text: refs.identity.map((x) => `${x.same ? "same" : "DIFFERENT"}: ${x.name}`).join("; ") });
    const FN = ["far", "both"], sp = AUDITS.map((a) => pairedOf(kindsOf(refs.references.GUARDED_FILTER[a], FN), kindsOf(refs.references.SPIN[a], FN)));
    rows.push({ name: "THE ADVISOR IS NOT TRIVIAL", ok: sp.every((p) => p.diff > margin(p)), text: `GUARDED-FILTER minus SPIN on far and both: ${sp.map((p) => `${p.diff.toFixed(3)} (needs ${margin(p).toFixed(3)})`).join(" | ")}` });
    return { ok: rows.every((r) => r.ok), rows };
}

/** The chip effect of one circuit and advisor: per audit the paired VETO - ALONE { diff, se, n, sign }. */
export function effectOf(rec, adv, mode = "VETO") {
    return Object.fromEntries(AUDITS.map((a) => { const p = pairedOf(rec.arms[armKey(adv, mode)][a], rec.arms.ALONE[a]); return [a, { ...p, sign: sign(p) }]; }));
}
/** HELPS / HURTS / NO EFFECT / MIXED from the three audits' signs. */
export function chipVerdict(eff) {
    const s = AUDITS.map((a) => eff[a].sign);
    return s.every((x) => x > 0) ? "HELPS" : s.every((x) => x < 0) ? "HURTS" : s.every((x) => x === 0) ? "NO EFFECT" : "MIXED";
}
const brainLevel = (rec) => meanOf(AUDITS.map((a) => rec.arms.ALONE[a].score));

/** The verdicts for one advisor over the records. */
export function verdictFor(records, refs, adv) {
    const rs = records.filter((r) => r.family !== "refs"), cx = rs.find((r) => r.family === "cx");
    const out = { adv, cx: null, wiring: { verdict: "NOT ASSESSED", why: "no cx record" }, rows: {}, content: null, addsToRule: null, families: {}, pairs: {} };
    for (const r of rs) { const eff = effectOf(r, adv); out.rows[r.spec] = { eff, verdict: chipVerdict(eff), level: brainLevel(r), hadChampion: r.hadChampion }; }
    if (!cx) return out;
    out.cx = out.rows.cx;
    const rule = refs.references[adv === PRIMARY ? "GUARDED" : "GUARDED_FILTER"];
    out.addsToRule = AUDITS.map((a) => { const p = pairedOf(cx.arms[armKey(adv, "VETO")][a], rule[a]); return { audit: a, ...p, wins: p.diff > margin(p) }; });
    out.content = AUDITS.map((a) => { const p = pairedOf(cx.arms[armKey(adv, "VETO")][a], cx.arms[armKey(adv, "STALE")][a]); return { audit: a, ...p, wins: p.diff > margin(p) }; });
    for (const fam of VERDICT_FAMILIES) {
        const recs = rs.filter((r) => r.family === fam); if (!recs.length) continue;
        out.families[fam] = { n: recs.length, audits: {} };
        for (const a of AUDITS) { const e = recs.map((r) => out.rows[r.spec].eff[a].diff), m = meanOf(e), s = sdOf(e), gain = out.cx.eff[a].diff - m; out.families[fam].audits[a] = { m, s, gain, needs: Math.max(MIN_EDGE, SD_FACTOR * s), wins: gain > Math.max(MIN_EDGE, SD_FACTOR * s) }; }
    }
    const missing = VERDICT_FAMILIES.filter((f) => !out.families[f] || out.families[f].n < MIN_CONTROLS);
    if (missing.length) out.wiring = { verdict: "NOT ASSESSED", why: `${missing.join(", ")} need at least ${MIN_CONTROLS} finished controls` };
    else {
        const strongest = Object.fromEntries(AUDITS.map((a) => [a, VERDICT_FAMILIES.reduce((b, f) => (out.families[f].audits[a].m > out.families[b].audits[a].m ? f : b), VERDICT_FAMILIES[0])]));
        const pass = VERDICT_FAMILIES.every((f) => AUDITS.every((a) => out.families[f].audits[a].wins)), lost = AUDITS.filter((a) => !out.families[strongest[a]].audits[a].wins).length;
        out.wiring = { verdict: pass ? "PASS" : lost >= 2 ? "FAIL" : "IN BETWEEN", why: pass ? "cx gains more from the chip than ER, TYPE-BLOCK and DEGREE on all three audits" : lost >= 2 ? `against the strongest family cx gains more on ${3 - lost} of 3 audits` : `cx gains more than the strongest family on ${3 - lost} of 3 audits but not on every family on every audit`, strongest };
    }
    for (const fam of ["nostate", "withheld"]) { const r = rs.find((x) => x.family === fam); if (r) out.pairs[fam] = AUDITS.map((a) => ({ audit: a, cx: out.cx.eff[a].diff, other: out.rows[r.spec].eff[a].diff })); }
    return out;
}
/** The registered bottom line for one advisor (Section 6). */
export function bottomLine(v) {
    const head = `ADVISOR CHIP BOTTOM LINE (${v.adv})`;
    if (!v.cx) return `${head}: NOT YET -- no cx record`;
    const verdict = chipVerdict(v.cx.eff), contentOk = !!v.content && v.content.every((x) => x.wins);
    if (verdict === "HELPS" && !contentOk) return `${head}: any conservative nudge helps and the advisor's content is not what mattered (cx HELPS but VETO does not beat the delayed advisor on every audit)`;
    if (verdict === "HELPS" && v.wiring.verdict === "PASS") return `${head}: the real wiring made better use of the chip than its controls did, and the benefit is the advisor's reading`;
    if (verdict === "HELPS") return `${head}: a rule helps any brain about equally -- the chip is a repair for a weak brain, not a partner for this wiring (cx HELPS; wiring-chip ${v.wiring.verdict}: ${v.wiring.why})`;
    if (verdict === "HURTS") return `${head}: the advisor's reading is worse than the brain's at what it vetoes (cx HURTS)`;
    return `${head}: the chip neither helps nor hurts cx consistently (${verdict})`;
}

const f3 = (v) => (v === null || v === undefined || !Number.isFinite(v) ? "n/a" : v.toFixed(3));
const pearson = (xs, ys) => { if (xs.length < 3) return null; const mx = meanOf(xs), my = meanOf(ys); let sxy = 0, sxx = 0, syy = 0; for (let i = 0; i < xs.length; i++) { sxy += (xs[i] - mx) * (ys[i] - my); sxx += (xs[i] - mx) ** 2; syy += (ys[i] - my) ** 2; } return sxx > 0 && syy > 0 ? sxy / Math.sqrt(sxx * syy) : null; };
export function reportLines(records, stage) {
    const refs = records.find((r) => r.family === "refs"), rs = records.filter((r) => r.family !== "refs"), lines = [];
    if (!refs) return ["no references record in the file"];
    const st = stage || { ok: true, why: "" }, checks = checksOf(refs, st);
    lines.push(`ADVISOR CHIP, noisy gauge: ${rs.length} circuits, fresh audits ${A.ADV_SEEDS.map(([a, b]) => `${a}-${b}`).join(" ")}`);
    for (const r of checks.rows) lines.push(`  ${r.ok ? "[ok]     " : "[FAILED] "} ${r.name}: ${r.text}`);
    if (!checks.ok) lines.push("  A CHECK FAILED: the verdicts below are printed and NOT weighed");
    lines.push("  references (mean on A | B | C): " + REFERENCE_NAMES.map((n) => `${n} ${AUDITS.map((a) => f3(refs.references[n][a].score)).join(" | ")}`).join("; "));
    for (const adv of ADVISOR_NAMES) {
        const v = verdictFor(records, refs, adv);
        lines.push(`  --- advisor ${adv}`);
        for (const r of rs) { const row = v.rows[r.spec]; lines.push(`  ${r.spec.padEnd(10)} alone ${f3(row.level)}${row.hadChampion ? "" : " (no champion: the start)"}  VETO effect ${AUDITS.map((a) => (row.eff[a].diff >= 0 ? "+" : "") + f3(row.eff[a].diff)).join(" | ")}  ${row.verdict}`); }
        if (v.cx) {
            lines.push(`  one-field effects for cx: ${A.FIELD_MODES.concat(["STALE"]).map((m) => `${m} ${AUDITS.map((a) => { const e = effectOf(rs.find((x) => x.family === "cx"), adv, m)[a]; return (e.diff >= 0 ? "+" : "") + f3(e.diff); }).join("/")}`).join("; ")}`);
            lines.push(`  BRAIN ADDS TO THE RULE (VETO(cx) minus ${adv} alone): ${v.addsToRule.map((x) => `${x.diff >= 0 ? "+" : ""}${f3(x.diff)}${x.wins ? " wins" : ""}`).join(" | ")}; CONTENT (VETO minus STALE): ${v.content.map((x) => `${x.diff >= 0 ? "+" : ""}${f3(x.diff)}${x.wins ? " wins" : ""}`).join(" | ")}`);
            for (const fam of VERDICT_FAMILIES) { const d = v.families[fam]; if (d) lines.push(`  ${NAMES[fam]} x${d.n}: effect ${AUDITS.map((a) => `${f3(d.audits[a].m)} +- ${f3(d.audits[a].s)} (cx gains ${d.audits[a].gain >= 0 ? "+" : ""}${f3(d.audits[a].gain)}${d.audits[a].wins ? " more" : ""})`).join(" | ")}`); }
            for (const fam of ["nostate", "withheld"]) if (v.pairs[fam]) lines.push(`  ${NAMES[fam]} effect against cx's: ${v.pairs[fam].map((x) => `${f3(x.other)} vs ${f3(x.cx)}`).join(" | ")}`);
        }
        const lv = rs.map((r) => v.rows[r.spec].level), ef = rs.map((r) => meanOf(AUDITS.map((a) => v.rows[r.spec].eff[a].diff)));
        const rr = pearson(lv, ef); lines.push(`  the chip effect against the brain's own level across the ${rs.length} circuits: r = ${rr === null ? "n/a" : rr.toFixed(2)} (a strongly negative r says the chip repairs weak brains)`);
        const ov = rs.find((x) => x.family === "cx"); if (ov && ov.stats && ov.stats[armKey(adv, "VETO")]) { const s = AUDITS.reduce((m, a) => add(m, ov.stats[armKey(adv, "VETO")][a] || {}), {}); lines.push(`  how often ${adv} overrode cx (share of ticks, VETO): ` + A.FIELDS.map((f) => `${f} ${s.ticks ? (100 * (s[f] || 0) / s.ticks).toFixed(1) : "n/a"}%`).join(", ")); }
        lines.push(`  WIRING-CHIP VERDICT (${adv}): ${v.wiring.verdict} -- ${v.wiring.why}`);
        lines.push(checks.ok ? bottomLine(v) : `ADVISOR CHIP BOTTOM LINE (${adv}): NOT READ -- a check failed (${checks.rows.filter((r) => !r.ok).map((r) => r.name).join(", ")})`);
    }
    return lines;
}

// ---- the command ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
export function parseArgs(argv) {
    const [cmd, ...rest] = argv;
    if (cmd !== "run" && cmd !== "report") throw new Error(`the first word must be run or report, got ${JSON.stringify(cmd)}`);
    const known = cmd === "run" ? { "stage-a": String, out: String, specs: String, workers: Number, one: String, smoke: Boolean, quiet: Boolean, "circuit-file": String } : { in: String, "stage-a": String, "allow-smoke": Boolean }, given = {};
    for (let i = 0; i < rest.length; i++) {
        const a = rest[i]; if (!a.startsWith("--")) throw new Error(`unexpected argument ${JSON.stringify(a)}`);
        const k = a.slice(2); if (!(k in known)) throw new Error(`unknown option ${JSON.stringify(a)} (known for ${cmd}: ${Object.keys(known).map((n) => "--" + n).join(", ")})`);
        if (known[k] === Boolean) given[k] = true; else { const v = rest[++i]; if (v == null || v.startsWith("--")) throw new Error(`${a} needs a value`); given[k] = known[k] === Number ? Number(v) : v; if (known[k] === Number && !Number.isFinite(given[k])) throw new Error(`${a} needs a number, got ${JSON.stringify(v)}`); }
    }
    if (cmd === "report") { if (!given.in) throw new Error("report needs --in <results file>"); return { cmd, in: given.in, stageA: given["stage-a"] || null, allowSmoke: !!given["allow-smoke"] }; }
    if (!given.one && !given.out) throw new Error("run needs --out <results file>");
    const workers = given.workers ?? 1; if (!(Number.isInteger(workers) && workers >= 1)) throw new Error(`--workers must be a whole number of 1 or more, got ${workers}`);
    const specs = given.specs || given.one || TR.STUDY; TR.parseSpecs(specs); if (given.one && TR.parseSpecs(given.one).length !== 1) throw new Error("--one takes a single spec");
    return { cmd, stageA: given["stage-a"] || STAGE_A_FILE, out: given.out || null, specs, one: given.one || null, workers, smoke: !!given.smoke, quiet: !!given.quiet, circuitFile: given["circuit-file"] || TR.CIRCUIT_FILE };
}
/**
 * THE COMMAND, as a function: `run` reads stage A, refuses unless it is complete (a --smoke run is exempt, so the machinery can be tried on any file), computes the references record once, flies the circuits not yet in --out (each in its own process when --workers is above 1) and appends one
 * line each; `report` prints the checks, the references, the verdicts and the bottom lines. `io` is for the gate: { out, err, readFile, appendFile, exists, runner, refsRunner, spawner }.
 */
export async function command(argv, io = {}) {
    const out = io.out || ((m) => console.log(m)), err = io.err || ((m) => console.error(m)), readFile = io.readFile || ((f) => fs.readFileSync(f, "utf8")), appendFile = io.appendFile || fs.appendFileSync, exists = io.exists || fs.existsSync;
    let o; try { o = parseArgs(argv); } catch (e) { err("advisorChipStudy: " + e.message); return 2; }
    const loadStage = () => { const recs = readRecords(readFile(o.stageA)); return { recs, stage: stageComplete(recs), ch: championsOf(recs) }; };
    if (o.cmd === "report") {
        let records; try { records = readRecords(readFile(o.in)); } catch (e) { err("advisorChipStudy: " + e.message); return 1; }
        if (!records.length) { err("advisorChipStudy: the results file has no records"); return 1; }
        if (records.some((r) => r.smoke) && !o.allowSmoke) { err("advisorChipStudy: the file holds smoke records (a few dives): pass --allow-smoke to read them anyway"); return 1; }
        let stage = null; if (o.stageA) { try { stage = loadStage().stage; } catch (e) { err("advisorChipStudy: " + e.message); return 1; } }
        for (const l of reportLines(records, stage)) out(l); return 0;
    }
    let S; try { S = loadStage(); } catch (e) { err("advisorChipStudy: cannot read stage A (" + o.stageA + "): " + e.message); return 1; }
    if (!S.stage.ok && !o.smoke) { err(`advisorChipStudy: stage A is not complete (${S.stage.why}); the audits are fresh and are not flown against an unfinished stage A (--smoke tries the machinery on a few dives)`); return 1; }
    let circuit; try { circuit = TR.loadCircuit(o.circuitFile); } catch (e) { err("advisorChipStudy: cannot read the circuit file: " + e.message); return 1; }
    const opts = { smoke: o.smoke, stageAHash: S.ch.hash }, log = o.quiet ? () => {} : out;
    const champOf = (spec) => S.ch.circuits[TR.specName(spec)] || null;
    if (o.one) { const spec = TR.parseSpecs(o.one)[0], rec = (io.runner || runCircuit)(spec, circuit, champOf(spec), opts, o.quiet ? () => {} : (m) => err(m)); out("RESULT " + JSON.stringify(rec)); return 0; }
    let have = []; if (exists(o.out)) { try { have = readRecords(readFile(o.out)); } catch (e) { err("advisorChipStudy: " + e.message); return 1; } }
    const stale = have.filter((r) => !!r.smoke !== o.smoke || r.stageAHash !== S.ch.hash);
    if (stale.length) { err(`advisorChipStudy: ${o.out} holds ${stale.length} record(s) of another stage A or a smoke run (${stale.map((r) => r.spec).join(", ")}): it is not mixed with this run -- use another --out`); return 1; }
    const done = new Set(have.map((r) => r.spec)), specs = TR.parseSpecs(o.specs), todo = specs.filter((s) => !done.has(TR.specName(s))), needRefs = !done.has("refs"), records = [...have];
    const missingChamp = todo.filter((s) => !champOf(s)).map(TR.specName);
    if (missingChamp.length && !o.smoke) { err(`advisorChipStudy: stage A has no record for ${missingChamp.join(", ")}`); return 1; }
    log(`[advisorChipStudy] ${specs.length} circuits, ${specs.length - todo.length} already in ${o.out}, ${todo.length} to fly; references ${needRefs ? "to compute" : "already there"}; ${o.workers} worker(s); stage A ${S.ch.hash}`);
    const keep = (rec) => { appendFile(o.out, JSON.stringify(rec) + "\n"); records.push(rec); };
    if (needRefs) { keep((io.refsRunner || refsRecord)(opts)); log("[advisorChipStudy] references done"); }
    const spawner = io.spawner || ((spec) => runChild(spec, o)), queue = [...todo];
    const worker = async () => { while (queue.length) { const s = queue.shift(); const rec = o.workers > 1 ? await spawner(s) : (io.runner || runCircuit)(s, circuit, champOf(s), opts, (m) => log(m)); keep(rec); log(`[advisorChipStudy] ${rec.spec} done`); } };
    await Promise.all(Array.from({ length: Math.max(1, Math.min(o.workers, queue.length || 1)) }, worker));
    for (const l of reportLines(records, S.stage)) out(l);
    return 0;
}
function runChild(spec, o) {
    return new Promise((resolve, reject) => {
        const args = [path.join(HERE, "advisorChipStudyCmd.mjs"), "run", "--one", TR.specName(spec), "--stage-a", o.stageA, "--circuit-file", o.circuitFile, "--quiet", ...(o.smoke ? ["--smoke"] : [])];
        const p = spawn(process.execPath, args, { stdio: ["ignore", "pipe", "inherit"] }); let buf = "";
        p.stdout.on("data", (d) => { buf += d; }); p.on("error", reject);
        p.on("close", (code) => { const line = buf.split("\n").find((l) => l.startsWith("RESULT ")); if (code !== 0 || !line) reject(new Error(`child for ${TR.specName(spec)} ended with ${code} and no RESULT`)); else resolve(JSON.parse(line.slice(7))); });
    });
}
