// WebGLEngine/tools/ship/advisorLlmAudit.mjs -- UNNUMBERED (the version is chosen at ship time) (the library; the command is tools/ship/advisorLlmAuditCmd.mjs; the gate is tools/ship/advisorLlmAudit-selfcheck.mjs)
//
// THE LANGUAGE-MODEL CHIP, ROUND 5 (brain/NEEDS_AND_LIMITS.md, registered 2026-10-30 BEFORE this file existed and before any reserved seed was flown). A local language model sits in the Round 4 socket (the VETO combination) beside the
// brain `GUARDED-OBS`, asked every 600 ticks with the unchanged prompt (schema 1). It is flown on the seeds RESERVED for it (171-182, 191-202, 211-222; plain, deep, far and both; 48 dives each) and read against, on the SAME dives:
//   ALONE (the brain), three FIXED DEPTH CAPS (the VETO combination with a constant advisor that says only a cap: 0.50, 0.65, 0.75), and the two hand-written rule advisors of Round 4 (`GUARDED-FILTER`, `GUARDED`).
// Why those arms: on 16 PRACTICE dives a constant cap of 0.65 scored above the best of three models (computed afterwards, and said in the registration). A model has to beat the best fixed cap, per audit, to be credited with reading the situation.
//   record   fly the audit dives with a model in record mode (ONE recording per model; an existing output is never overwritten or extended; resumable from `<out>.calls.jsonl`). It REFUSES a model without a practice transcript
//            of the same configuration (the model id ends in -t0; the transcript's header names the model, every is 600, it covers the practice dives, and at least 95 percent of its replies parsed).
//   report   replay the recordings and fly the comparators; print the checks, the verdicts (the margin rule: A beats B on an audit iff the paired mean difference exceeds max(0.02, 2 se)) and the bottom line per model.
// This file does not run a model on any seed but the reserved ones, does not touch advisorLive's refusal of those seeds (only this tool flies them), and decides nothing the registration did not.
"use strict";
import fs from "node:fs";
import * as T from "../../brain/needsTask.mjs";
import * as A from "../../brain/advisorChip.mjs";
import * as X from "../../brain/advisorTranscript.mjs";
import * as L from "./advisorLive.mjs";
import { MIN_EDGE, SD_FACTOR } from "./trainSubCircuits.mjs";

export const AUDIT_NAMES = Object.freeze(["L1", "L2", "L3"]);
export const AUDIT_SEEDS = A.RESERVED_LLM;
export const EVERY = 600, MIN_PARSE = 0.95, CONSTANT_CAPS = Object.freeze([0.5, 0.65, 0.75]), DEFAULT_MAX_CALLS = 6000, PRACTICE_SEEDS = "501-508", PRACTICE_KINDS = Object.freeze(["far", "both"]);
export const GAUGE = T.GAUGE;
export const auditSet = (i) => T.setOf(T.KINDS, AUDIT_SEEDS[i][0], AUDIT_SEEDS[i][1]);
const brainSeat = T.ruleSeat("obs");   // the untrained circuit IS this rule (Round 3's start identity), as in advisorLive
/** A constant advisor: (ctx) -> seat that says only a depth cap. */
export const constantSeat = (cap) => () => () => ({ surface: false, station: null, cap, pump: false, repair: false });
export const capName = (c) => `CAP-${c.toFixed(2)}`, lmName = (id) => `LM:${id}`;
export const FIXED_ARMS = Object.freeze(CONSTANT_CAPS.map(capName)), RULE_ARMS = Object.freeze(["RULE-GF", "RULE-G"]);

/** The pilot factory of an arm. `transcript` is needed by an LM arm (replayed, never called). `seats` collects the model seats made, for their stats. */
export function armFactory(arm, { transcript = null, seats = null } = {}) {
    if (arm === "ALONE") return T.GUARDED_OBS;
    const cap = CONSTANT_CAPS.find((c) => capName(c) === arm); if (cap !== undefined) return A.advisedPilot(brainSeat, constantSeat(cap), "VETO");
    if (arm === "RULE-GF") return A.advisedPilot(brainSeat, A.ADVISORS["GUARDED-FILTER"], "VETO");
    if (arm === "RULE-G") return A.advisedPilot(brainSeat, A.ADVISORS["GUARDED"], "VETO");
    if (arm.startsWith("LM:")) {
        if (!transcript) throw new Error(`advisorLlmAudit.armFactory: ${arm} needs its transcript`);
        const inner = X.llmSeat({ transcript, mode: "replay" });
        return A.advisedPilot(brainSeat, (ctx) => { const s = inner(ctx); if (seats) seats.push(s); return s; }, "VETO");
    }
    throw new Error(`advisorLlmAudit.armFactory: unknown arm ${JSON.stringify(arm)}`);
}
const add = (a, b) => { for (const k of Object.keys(b)) a[k] = (a[k] || 0) + b[k]; return a; };
/** One arm over one set: { res (T.evaluate's), stats (the override counts summed over the dives), model (the model seats' stats summed, LM arms only) }. `ev` is the evaluator seam. */
export function flyArm(arm, set, { transcript = null, ev = T.evaluate } = {}) {
    const pilots = [], seats = [], make = armFactory(arm, { transcript, seats }), factory = (ctx) => { const p = make(ctx); pilots.push(p); return p; };
    const res = ev(factory, set, { gauge: GAUGE });
    const stats = {}; for (const p of pilots) { const st = p && p.stats; if (st) add(stats, st); }
    const model = {}; for (const s of seats) add(model, s.stats);
    return { res, stats, model };
}
/** Every arm on every audit: { L1: { ALONE: arm result, ... }, ... }. `sets` (default the reserved ones) and `ev` are seams. */
export function flyAudits(transcripts, { sets = AUDIT_NAMES.map((_, i) => auditSet(i)), ev = T.evaluate } = {}) {
    const out = {};
    AUDIT_NAMES.forEach((a, i) => {
        out[a] = {};
        for (const arm of ["ALONE", ...FIXED_ARMS, ...RULE_ARMS]) out[a][arm] = flyArm(arm, sets[i], { ev });
        for (const [id, tr] of Object.entries(transcripts)) out[a][lmName(id)] = flyArm(lmName(id), sets[i], { transcript: tr, ev });
    });
    return out;
}

// ---- the checks and the verdicts ---------------------------------------------------------------------------------------------------------------------------------------------------------------------
export const margin = (p) => Math.max(MIN_EDGE, SD_FACTOR * p.se);
export const signOf = (p) => (p.diff > margin(p) ? 1 : p.diff < -margin(p) ? -1 : 0);
const mean = (res) => res.score;
const pairedRuns = (a, b) => T.paired(a, b);
const kindsOf = (res, kinds) => ({ runs: res.runs.filter((r) => kinds.includes(r.kind)) });
/** The identity checks on a few dives: a null advisor is ALONE, a cap of 0.95 is ALONE, GUARDED-FILTER advised by itself is itself. { ok, rows }. */
export function identityChecks({ ev = T.evaluate, set = ["deep", "both"].map((k) => auditSet(0).find((d) => d.kind === k)) } = {}) {
    const run = (factory) => ev(factory, set, { gauge: GAUGE }), alone = run(T.GUARDED_OBS);
    const same = (a, b) => a.runs.length === b.runs.length && a.runs.every((r, i) => r.score === b.runs[i].score);
    const nul = run(A.advisedPilot(brainSeat, null, "VETO")), high = run(A.advisedPilot(brainSeat, constantSeat(0.95), "VETO"));
    const gf = run(A.ADVISOR_PILOTS["GUARDED-FILTER"]), gfSelf = run(A.advisedPilot(T.ruleSeat("obs", { alpha: T.FILTER_ALPHA }), A.ADVISORS["GUARDED-FILTER"], "VETO"));
    const rows = [
        { name: "IDENTITY", ok: same(nul, alone) && same(high, alone) && same(gfSelf, gf), text: `${same(nul, alone) ? "same" : "DIFFERENT"}: a null advisor in VETO is the brain alone; ${same(high, alone) ? "same" : "DIFFERENT"}: a cap of 0.95 changes nothing; ${same(gfSelf, gf) ? "same" : "DIFFERENT"}: GUARDED-FILTER advised by itself is itself (${set.length} dives: a deep and a both)` },
    ];
    return { ok: rows.every((r) => r.ok), rows };
}
/** The transcript checks for one model: header (id, every, prompt schema) and the parse rate over the situations it holds. */
export function transcriptChecks(id, tr) {
    const h = tr.header, entries = [...tr.entries.values()], valid = entries.filter((e) => e.decision).length, rate = entries.length ? valid / entries.length : 0;
    const headerOk = h.model.id === id && h.every === EVERY && h.promptSchema === X.PROMPT_SCHEMA;
    return { headerOk, rate, entries: entries.length, valid, parseOk: rate >= MIN_PARSE };
}
/** What the replies did, from the transcript's own entries (REPORTED, not in the verdicts): cap outside 0.5-0.95, early surfacing with stations unvisited before 300 s, pump advised with flooding at 0, the surface and repair shares. */
export function replyStats(tr) {
    const s = { n: 0, parsed: 0, capOut: 0, surface: 0, earlySurface: 0, pump: 0, pumpNoFlood: 0, repair: 0 };
    for (const e of tr.entries.values()) {
        s.n++; const p = X.parseReply(e.reply); if (!p.ok) continue; s.parsed++;
        const raw = p.decision, rawCap = (() => { try { const t = e.reply.slice(e.reply.indexOf("{"), e.reply.lastIndexOf("}") + 1); return JSON.parse(t).cap; } catch { return raw.cap; } })();
        if (rawCap < X.CAP_RANGE.lo || rawCap > X.CAP_RANGE.hi) s.capOut++;
        const flood = Number((/flooding ([\d.]+)/.exec(e.prompt) || [])[1]), t = Number((/time ([\d.]+) s/.exec(e.prompt) || [])[1]), unvisited = (e.prompt.match(/not visited/g) || []).length;
        if (raw.surface) { s.surface++; if (unvisited > 0 && t < 300) s.earlySurface++; }
        if (raw.pump) { s.pump++; if (flood === 0) s.pumpNoFlood++; }
        if (raw.repair) s.repair++;
    }
    return s;
}
/** The verdicts of one model over the flown audits. `audits` is flyAudits' result; `parseOk` false marks it NOT WEIGHED. */
export function verdictFor(audits, id, { parseOk = true } = {}) {
    const lm = lmName(id), rows = AUDIT_NAMES.map((a) => {
        const R = audits[a], strongestCap = FIXED_ARMS.reduce((best, c) => (mean(R[c].res) > mean(R[best].res) ? c : best), FIXED_ARMS[0]);
        const vs = (other) => pairedRuns(R[lm].res, R[other].res);
        return { audit: a, strongestCap, vsAlone: vs("ALONE"), vsCap: vs(strongestCap), vsGF: vs("RULE-GF"), vsG: vs("RULE-G") };
    });
    const all = (f, v) => rows.every((r) => f(r) === v), effect = all((r) => signOf(r.vsAlone), 1) ? "HELPS" : all((r) => signOf(r.vsAlone), -1) ? "HURTS" : rows.every((r) => signOf(r.vsAlone) === 0) ? "NO EFFECT" : "MIXED";
    const cap = all((r) => signOf(r.vsCap), 1) ? "BEATS A FIXED CAP" : all((r) => signOf(r.vsCap), -1) ? "LOSES TO A FIXED CAP" : "TIES A FIXED CAP";
    const beatsGF = all((r) => signOf(r.vsGF), 1), beatsG = all((r) => signOf(r.vsG), 1);
    let bottom;
    if (!parseOk) bottom = "NOT WEIGHED (the replies parse in under 95 percent of situations)";
    else if (effect === "HELPS" && cap === "BEATS A FIXED CAP") bottom = `ADDS CONTENT BEYOND A FIXED CAP (${beatsGF ? "and beats" : "but does not beat"} the rule GUARDED-FILTER${beatsG ? ", beats" : ", does not beat"} GUARDED)`;
    else if (effect === "HELPS") bottom = "HELPS, BUT NO MORE THAN A FIXED CAP";
    else if (effect === "HURTS") bottom = "HURTS";
    else bottom = effect === "MIXED" ? "NO CONSISTENT EFFECT (MIXED)" : "NO EFFECT";
    return { rows, effect, cap, beatsGF, beatsG, bottom, weighed: parseOk };
}

// ---- the report ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
const f3 = (v) => (Number.isFinite(v) ? v.toFixed(3) : "n/a");
const pc = (p) => `${p.diff >= 0 ? "+" : ""}${f3(p.diff)} (needs ${f3(margin(p))}: ${signOf(p) > 0 ? "WINS" : signOf(p) < 0 ? "LOSES" : "tie"})`;
/** The report lines. `models`: [{ id, tr }]; `audits` flyAudits' result; `idc` identityChecks'. */
export function reportLines({ models, audits, idc, checks }) {
    const Ls = [`LANGUAGE-MODEL CHIP (Round 5), noisy gauge: reserved seeds ${AUDIT_SEEDS.map(([a, b]) => `${a}-${b}`).join(" ")}, four kinds, brain GUARDED-OBS, VETO`];
    for (const r of idc.rows) Ls.push(`  ${r.ok ? "[ok]     " : "[FAILED] "} ${r.name}: ${r.text}`);
    for (const c of checks) Ls.push(`  ${c.ok ? "[ok]     " : "[FAILED] "} ${c.name}: ${c.text}`);
    const nontrivial = AUDIT_NAMES.map((a) => pairedRuns(kindsOf(audits[a]["RULE-GF"].res, ["far", "both"]), kindsOf(audits[a].ALONE.res, ["far", "both"])));
    const ntOk = nontrivial.every((p) => signOf(p) > 0);
    Ls.push(`  ${ntOk ? "[ok]     " : "[FAILED] "} THE RULE IS NOT TRIVIAL: RULE-GF minus ALONE on far and both: ${nontrivial.map((p) => `${f3(p.diff)} (needs ${f3(margin(p))})`).join(" | ")}`);
    const arms = ["ALONE", ...FIXED_ARMS, ...RULE_ARMS, ...models.map((m) => lmName(m.id))];
    Ls.push(`  means (${AUDIT_NAMES.join(" | ")}): ${arms.map((a) => `${a} ${AUDIT_NAMES.map((n) => f3(audits[n][a].res.score)).join(" | ")}`).join("; ")}`);
    Ls.push(`  crushed dives (${AUDIT_NAMES.join(" | ")}): ${arms.map((a) => `${a} ${AUDIT_NAMES.map((n) => audits[n][a].res.crashed).join("/")}`).join("; ")}`);
    const allOk = idc.ok && checks.filter((c) => !c.model).every((c) => c.ok) && ntOk;   // a check of one model's own recording weighs against that model only
    if (!allOk) Ls.push("  A CHECK FAILED: the verdicts below are printed and NOT weighed");
    for (const m of models) {
        const v = m.verdict, rs = m.replies;
        Ls.push(`  --- model ${m.id}`);
        Ls.push(`  strongest fixed cap per audit: ${v.rows.map((r) => r.strongestCap).join(" | ")}`);
        Ls.push(`  effect against ALONE: ${v.rows.map((r) => pc(r.vsAlone)).join(" | ")}  -> ${v.effect}`);
        Ls.push(`  against the strongest fixed cap: ${v.rows.map((r) => pc(r.vsCap)).join(" | ")}  -> ${v.cap}`);
        Ls.push(`  against RULE-GF: ${v.rows.map((r) => pc(r.vsGF)).join(" | ")}  -> ${v.beatsGF ? "BEATS THE RULE" : "does not beat it"}; against RULE-G: ${v.rows.map((r) => pc(r.vsG)).join(" | ")}  -> ${v.beatsG ? "BEATS THE RULE" : "does not beat it"}`);
        const st = AUDIT_NAMES.map((a) => audits[a][lmName(m.id)].stats);
        Ls.push(`  overrides of the brain (ticks, summed over the three audits): surface ${st.reduce((s, x) => s + (x.surface || 0), 0)}, station ${st.reduce((s, x) => s + (x.station || 0), 0)}, cap ${st.reduce((s, x) => s + (x.cap || 0), 0)}, pump ${st.reduce((s, x) => s + (x.pump || 0), 0)}, repair ${st.reduce((s, x) => s + (x.repair || 0), 0)}`);
        Ls.push(`  replies (reported): ${rs.n} situations, ${f3(rs.parsed / Math.max(1, rs.n))} parsed; cap outside 0.5-0.95 in ${rs.capOut}; surface advised ${rs.surface} (early, stations unvisited before 300 s: ${rs.earlySurface}); pump advised ${rs.pump} (with flooding at 0: ${rs.pumpNoFlood}); repair advised ${rs.repair}`);
        const mine = checks.filter((c) => c.model === m.id && !c.ok);
        if (mine.length) Ls.push(`  A CHECK OF THIS MODEL FAILED (${mine.map((c) => c.name).join(", ")}): its verdicts are NOT weighed`);
        Ls.push(`ADVISOR BOTTOM LINE (${m.id}): ${allOk && !mine.length ? v.bottom : "NOT WEIGHED (a check failed)"}`);
    }
    return Ls;
}

// ---- the commands --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
export function parseArgs(argv) {
    const [cmd, ...rest] = argv;
    if (cmd !== "record" && cmd !== "report") throw new Error(`the first word must be record or report, got ${JSON.stringify(cmd)}`);
    const known = { record: { "model-id": String, cmd: String, practice: String, out: String, "max-calls": Number, timeout: Number, "dry-run": Boolean }, report: { in: String } }[cmd], given = {};
    for (let i = 0; i < rest.length; i++) {
        const a = rest[i]; if (!a.startsWith("--")) throw new Error(`unexpected argument ${JSON.stringify(a)}`);
        const k = a.slice(2); if (!(k in known)) throw new Error(`unknown option ${JSON.stringify(a)} (known for ${cmd}: ${Object.keys(known).map((n) => "--" + n).join(", ")})`);
        if (known[k] === Boolean) given[k] = true; else { const v = rest[++i]; if (v == null || v.startsWith("--")) throw new Error(`${a} needs a value`); given[k] = known[k] === Number ? Number(v) : v; if (known[k] === Number && !Number.isFinite(given[k])) throw new Error(`${a} needs a number`); }
    }
    if (cmd === "report") { if (!given.in) throw new Error("report needs --in <transcript>[,<transcript>...]"); return { cmd, files: given.in.split(",").map((s) => s.trim()).filter(Boolean) }; }
    for (const k of ["model-id", "cmd", "practice", "out"]) if (!given[k]) throw new Error(`record needs --${k}`);
    const max = given["max-calls"] ?? DEFAULT_MAX_CALLS; if (!(Number.isInteger(max) && max >= 1)) throw new Error("--max-calls must be a whole number of 1 or more");
    return { cmd, modelId: given["model-id"], command: given.cmd, practice: given.practice, out: given.out, maxCalls: max, timeoutMs: given.timeout ?? L.DEFAULT_TIMEOUT_MS, dryRun: !!given["dry-run"] };
}
/** The practice gate of section 4: the model id says -t0; the practice transcript names this model, asks every 600, covers the practice dives (a replay of them never misses) and parses in at least 95 percent of situations. Throws with the reason. */
export function practiceGate(modelId, practiceText, { dives = L.divesOf(PRACTICE_KINDS, L.parseSeeds(PRACTICE_SEEDS)) } = {}) {
    if (!/-t0$/.test(modelId)) throw new Error(`advisorLlmAudit: the model id ${JSON.stringify(modelId)} must end in -t0 (the temperature-0 configuration of the registration)`);
    let tr; try { tr = X.parseTranscript(practiceText); } catch (e) { throw new Error(`advisorLlmAudit: the practice transcript does not read (${e.message})`); }
    const c = transcriptChecks(modelId, tr);
    if (!c.headerOk) throw new Error(`advisorLlmAudit: the practice transcript is not this model's configuration (header: model ${tr.header.model.id}, every ${tr.header.every}, prompt schema ${tr.header.promptSchema}; needs ${modelId}, ${EVERY}, ${X.PROMPT_SCHEMA})`);
    if (!c.parseOk) throw new Error(`advisorLlmAudit: the practice replies parse in ${(c.rate * 100).toFixed(1)} percent of situations; the model needs ${MIN_PARSE * 100} percent and is EXCLUDED`);
    try { for (const sc of dives) T.fly(A.advisedPilot(brainSeat, X.llmSeat({ transcript: tr, mode: "replay" }), "VETO"), sc, { gauge: GAUGE }); } catch (e) { throw new Error(`advisorLlmAudit: the practice transcript does not cover the practice dives (seeds ${PRACTICE_SEEDS}, kinds ${PRACTICE_KINDS.join(",")}, every ${EVERY}): ${e.message}`); }
    return c;
}
export const expectedCalls = (sets = AUDIT_NAMES.map((_, i) => auditSet(i))) => sets.reduce((n, st) => n + st.length, 0) * Math.ceil(T.SECONDS / T.DT / EVERY);

/** THE COMMAND, as a function. record: the practice gate, the call count (and stop with --dry-run), a refusal to overwrite, the resumable calls log, the dives flown with the model in record mode, the transcript written. report: replays the recordings and prints the report. io: { out, err, readFile, writeFile, appendFile, exists, makeModelFn, ev, sets }. Returns the exit code. */
export async function command(argv, io = {}) {
    const out = io.out || ((m) => console.log(m)), err = io.err || ((m) => console.error(m)), readFile = io.readFile || ((f) => fs.readFileSync(f, "utf8")), writeFile = io.writeFile || fs.writeFileSync, appendFile = io.appendFile || fs.appendFileSync, exists = io.exists || fs.existsSync;
    let o; try { o = parseArgs(argv); } catch (e) { err("advisorLlmAudit: " + e.message); return 2; }
    if (o.cmd === "report") {
        const models = [], trs = {};
        for (const f of o.files) { let tr; try { tr = X.parseTranscript(readFile(f)); } catch (e) { err(`advisorLlmAudit: ${f}: ${e.message}`); return 1; } const id = tr.header.model.id; if (trs[id]) { err(`advisorLlmAudit: two transcripts for ${id}`); return 1; } trs[id] = tr; models.push({ id, tr, file: f }); }
        const checks = []; let audits;
        for (const m of models) { const c = transcriptChecks(m.id, m.tr); m.check = c; checks.push({ name: `TRANSCRIPT ${m.id}`, model: m.id, ok: c.headerOk, text: `model ${m.tr.header.model.id}, every ${m.tr.header.every}, prompt schema ${m.tr.header.promptSchema}${c.headerOk ? "" : " -- needs every 600 and schema " + X.PROMPT_SCHEMA}` }); checks.push({ name: `PARSE RATE ${m.id}`, model: m.id, ok: c.parseOk, text: `${(c.rate * 100).toFixed(1)} percent of ${c.entries} situations (needs ${MIN_PARSE * 100})` }); }
        try { audits = flyAudits(trs, { ev: io.ev, sets: io.sets }); } catch (e) { err("advisorLlmAudit: " + e.message + (e instanceof X.TranscriptMiss ? " -- a recording must hold every situation of the audit dives" : "")); return 1; }
        for (const m of models) { m.verdict = verdictFor(audits, m.id); m.replies = replyStats(m.tr); }
        for (const l of reportLines({ models, audits, idc: (io.identity || identityChecks)(), checks })) out(l);
        return 0;
    }
    let practiceText; try { practiceText = readFile(o.practice); } catch (e) { err(`advisorLlmAudit: cannot read the practice transcript ${o.practice}`); return 1; }
    try { const c = practiceGate(o.modelId, practiceText, io.practiceDives ? { dives: io.practiceDives } : {}); out(`[advisorLlmAudit] practice gate passed: ${(c.rate * 100).toFixed(1)} percent of ${c.entries} practice situations parse`); } catch (e) { err(e.message); return 1; }
    const sets = io.sets || AUDIT_NAMES.map((_, i) => auditSet(i)), total = expectedCalls(sets);
    out(`[advisorLlmAudit] ${AUDIT_NAMES.map((n, i) => `${n} ${AUDIT_SEEDS[i][0]}-${AUDIT_SEEDS[i][1]}`).join(", ")}: ${sets.reduce((n, st) => n + st.length, 0)} dives, the model is asked every ${EVERY} ticks: at most ${total} calls (repeated situations are spared); the ceiling is ${o.maxCalls}${total > o.maxCalls ? " -- LOWER than the most it could make: the run will stop and can be resumed" : ""}`);
    if (o.dryRun) { out("[advisorLlmAudit] --dry-run: nothing was called"); return 0; }
    if (exists(o.out)) { err(`advisorLlmAudit: ${o.out} already exists; a recording is never overwritten or extended (one recording per model)`); return 1; }
    const callsFile = o.out + ".calls.jsonl", cache = new Map();
    if (exists(callsFile)) { for (const l of String(readFile(callsFile)).split("\n").filter(Boolean)) { try { const e = JSON.parse(l); cache.set(e.prompt, e.reply); } catch { err(`advisorLlmAudit: ${callsFile} has a line that is not json`); return 1; } } out(`[advisorLlmAudit] resuming: ${cache.size} answers already paid for in ${callsFile}`); }
    let raw; try { raw = (io.makeModelFn || ((a) => L.modelFnFromCommand({ command: a.command, timeoutMs: a.timeoutMs })))(o); } catch (e) { err("advisorLlmAudit: " + L.scrub(e.message)); return 1; }
    const fn = L.budgeted(raw, { maxCalls: o.maxCalls, cache, onNew: (prompt, reply) => appendFile(callsFile, JSON.stringify({ prompt, reply }) + "\n") });
    const tr = X.createTranscript({ model: { id: o.modelId, params: {} }, every: EVERY });
    try { for (const set of sets) for (const sc of set) T.fly((ctx) => A.advisedPilot(brainSeat, X.llmSeat({ transcript: tr, mode: "record", modelFn: fn }), "VETO")(ctx), sc, { gauge: GAUGE }); }
    catch (e) { err("advisorLlmAudit: " + L.scrub(e.message) + (fn.state.calls ? ` (${fn.state.calls} answers are saved in ${callsFile}; run the same command again to resume)` : "")); return 1; }
    writeFile(o.out, X.serialize(tr));
    out(`[advisorLlmAudit] recorded ${tr.entries.size} situations (${fn.state.calls} model calls, ${fn.state.hits} repeated or resumed) to ${o.out}; read it with: advisorLlmAuditCmd.mjs report --in ${o.out}`);
    return 0;
}
