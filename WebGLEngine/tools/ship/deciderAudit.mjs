// WebGLEngine/tools/ship/deciderAudit.mjs -- UNNUMBERED (the version is chosen at ship time) (the gate is tools/ship/deciderAudit-selfcheck.mjs)
//
// THE AUDIT OF ROUND 14 (brain/NEEDS_AND_LIMITS.md, registered before any of this): the arms, the sets, the checks, the verdicts, the report and the `record` and `report` commands for the Decider chip (brain/deciderAdvisor.mjs).
// Built on tools/ship/advisorLlmAudit.mjs (Round 5): the same brain (GUARDED-OBS), socket (VETO), noisy gauge, comparators and margin rule max(0.02, 2 se); what differs is the seat (typed questions, probabilities, a threshold applied at REPLAY) and the sets
// (D1 1301-1312, D2 1321-1332, D3 1341-1352: seeds no earlier round reads).
// THE MODEL IS CALLED ONLY BY `record`, once, through a local server (tools/ship/deciderServe.py keeps the weights loaded): the dives are flown with the model in the loop, every answer stored under a key of (model, params, prompt) in a transcript, and
// every later reading (`report`) REPLAYS it and never calls a model. One recording per model id; the command refuses to overwrite or extend it, and a crashed run resumes from its calls log without paying for an answer twice.
// Both thresholds (DECIDER-T50, DECIDER-T80) read the SAME recorded probabilities: tau is never shown to the model. BUT a replay at a threshold flies the dives THAT threshold's advice makes, and those pass through situations the other
// threshold's dives never reach, so the recording flies every dive once per threshold on one transcript (shared situations are asked once). Round 14 Amendment 1 says so.
"use strict";
import fs from "node:fs";
import { spawnSync } from "node:child_process";
import * as T from "../../brain/needsTask.mjs";
import * as A from "../../brain/advisorChip.mjs";
import * as D from "../../brain/deciderAdvisor.mjs";
import * as LA from "./advisorLlmAudit.mjs";
import * as L from "./advisorLive.mjs";

export const AUDIT_NAMES = Object.freeze(["D1", "D2", "D3"]);
export const EVERY = D.EVERY, MIN_ANSWER_RATE = 0.95, DEFAULT_MAX_CALLS = 9000, DEFAULT_TIMEOUT_MS = 120000, DEFAULT_URL = "http://127.0.0.1:8765/ask";
export const DECIDER_ARMS = Object.freeze({ "DECIDER-T50": D.TAUS.T50, "DECIDER-T80": D.TAUS.T80 });
export const auditSet = (i) => T.setOf(T.KINDS, D.DECIDER_AUDITS[i][0], D.DECIDER_AUDITS[i][1]);
export const { margin, signOf, FIXED_ARMS, RULE_ARMS, GAUGE } = LA;
const brainSeat = T.ruleSeat("obs");

/** The pilot factory of an arm. A DECIDER arm REPLAYS `transcript` at its tau (it never calls a model); `seats` collects the seats made, for their stats. */
export function armFactory(arm, { transcript = null, seats = null } = {}) {
    if (!Object.prototype.hasOwnProperty.call(DECIDER_ARMS, arm)) return LA.armFactory(arm);
    if (!transcript) throw new Error(`deciderAudit.armFactory: ${arm} needs its transcript`);
    const tau = DECIDER_ARMS[arm], make = D.deciderSeat({ transcript, mode: "replay", tau });
    return A.advisedPilot(brainSeat, (ctx) => { const s = make(ctx); if (seats) seats.push(s); return s; }, "VETO");
}
const add = (a, b) => { for (const k of Object.keys(b)) a[k] = typeof b[k] === "object" ? add(a[k] || (a[k] = {}), b[k]) : (a[k] || 0) + b[k]; return a; };
/** One arm over one set: { res, stats (the override counts), model (the decider seats' stats summed) }. */
export function flyArm(arm, set, { transcript = null, ev = T.evaluate } = {}) {
    const pilots = [], seats = [], make = armFactory(arm, { transcript, seats }), factory = (ctx) => { const p = make(ctx); pilots.push(p); return p; };
    const res = ev(factory, set, { gauge: GAUGE });
    const stats = {}; for (const p of pilots) { const st = p && p.stats; if (st) add(stats, st); }
    const model = {}; for (const s of seats) add(model, s.stats);
    return { res, stats, model };
}
const BASE_ARMS = Object.freeze(["ALONE", ...FIXED_ARMS, ...RULE_ARMS]);
/** Every arm on every audit: { D1: { ALONE: arm result, ..., "DECIDER-T50": ... }, ... }. `sets` and `ev` are seams. */
export function flyAudits(transcript, { sets = AUDIT_NAMES.map((_, i) => auditSet(i)), ev = T.evaluate } = {}) {
    const out = {};
    AUDIT_NAMES.forEach((a, i) => {
        out[a] = {};
        for (const arm of BASE_ARMS) out[a][arm] = flyArm(arm, sets[i], { ev });
        for (const arm of Object.keys(DECIDER_ARMS)) out[a][arm] = flyArm(arm, sets[i], { transcript, ev });
    });
    return out;
}

// ---- the checks ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
const FORBIDDEN = /seed|kind|unreachable|GUARDED|RULE|ALONE|energy|capacityJ|reachable|scenario/i;
/** The transcript checks: the header is this chip's (kind, schema, every 600, the model id), the answer rate (the share of asks with a valid answer to every question), and the fairness scan of every prompt. */
export function transcriptChecks(id, tr) {
    const h = tr.header, entries = [...tr.entries.values()];
    let full = 0, leaks = 0;
    for (const e of entries) {
        let p = null, a = null; try { p = JSON.parse(e.prompt); a = JSON.parse(e.reply); } catch {}
        if (p && D.invalidQuestions(a, p.questions) === 0) full++;
        if (FORBIDDEN.test(e.prompt)) leaks++;
    }
    const rate = entries.length ? full / entries.length : 0;
    return { headerOk: h.kind === "decider-transcript" && h.schema === D.SCHEMA && h.model.id === id && h.every === EVERY, entries: entries.length, rate, answerOk: rate >= MIN_ANSWER_RATE, leaks, fairOk: leaks === 0 };
}
/** What the answers did at `tau`, from the transcript's own entries (REPORTED, not in the verdicts): surface advised (early: stations unvisited before 300 s), pump advised (with flooding at 0), repair advised. */
export function askStats(tr, tau) {
    const s = { asks: 0, surface: 0, earlySurface: 0, pump: 0, pumpNoFlood: 0, repair: 0 };
    for (const e of tr.entries.values()) {
        let p, a; try { p = JSON.parse(e.prompt); a = JSON.parse(e.reply); } catch { continue; }
        s.asks++;
        const yes = (id) => a && a[id] && a[id].probs && a[id].probs.yes >= tau, st = p.state;
        if (yes("surface")) { s.surface++; if (st.time_s < 300 && st.stations.some((q) => !q.visited)) s.earlySurface++; }
        if (yes("pump")) { s.pump++; if (st.flooding === 0) s.pumpNoFlood++; }
        if (yes("repair")) s.repair++;
    }
    return s;
}
const silentSeat = () => (ctx) => D.deciderSeat({ transcript: D.createTranscript({ model: { id: "silent" }, every: EVERY }), mode: "record", tau: 1.5, deciderFn: () => ({ surface: { probs: { yes: 0.99, no: 0.01 } } }) })(ctx);
/** Identity on two dives of D1 (deep and both): a null advisor is ALONE, a decider whose every answer is below tau is ALONE, GUARDED-FILTER advised by itself is itself. */
export function identityChecks({ ev = T.evaluate, set = ["deep", "both"].map((k) => auditSet(0).find((d) => d.kind === k)) } = {}) {
    const run = (factory) => ev(factory, set, { gauge: GAUGE }), alone = run(T.GUARDED_OBS);
    const same = (a, b) => a.runs.length === b.runs.length && a.runs.every((r, i) => r.score === b.runs[i].score);
    const nul = run(A.advisedPilot(brainSeat, null, "VETO")), silent = run(A.advisedPilot(brainSeat, silentSeat(), "VETO"));
    const gf = run(A.ADVISOR_PILOTS["GUARDED-FILTER"]), gfSelf = run(A.advisedPilot(T.ruleSeat("obs", { alpha: T.FILTER_ALPHA }), A.ADVISORS["GUARDED-FILTER"], "VETO"));
    const rows = [{ name: "IDENTITY", ok: same(nul, alone) && same(silent, alone) && same(gfSelf, gf), text: `${same(nul, alone) ? "same" : "DIFFERENT"}: a null advisor in VETO is the brain alone; ${same(silent, alone) ? "same" : "DIFFERENT"}: a decider below tau changes nothing; ${same(gfSelf, gf) ? "same" : "DIFFERENT"}: GUARDED-FILTER advised by itself is itself` }];
    return { ok: rows.every((r) => r.ok), rows };
}

// ---- the verdicts -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
const pairedRuns = (a, b) => T.paired(a, b), kindsOf = (res, kinds) => ({ runs: res.runs.filter((r) => kinds.includes(r.kind)) });
/** The verdict of one DECIDER arm against ALONE, the strongest fixed cap and the rules, on all three audits (Round 14 section 7). */
export function verdictFor(audits, arm, { weighed = true } = {}) {
    const rows = AUDIT_NAMES.map((a) => {
        const R = audits[a], strongestCap = FIXED_ARMS.reduce((best, c) => (R[c].res.score > R[best].res.score ? c : best), FIXED_ARMS[0]), vs = (o) => pairedRuns(R[arm].res, R[o].res);
        return { audit: a, strongestCap, vsAlone: vs("ALONE"), vsCap: vs(strongestCap), vsGF: vs("RULE-GF"), vsG: vs("RULE-G") };
    });
    const all = (f, v) => rows.every((r) => f(r) === v), effect = all((r) => signOf(r.vsAlone), 1) ? "HELPS" : all((r) => signOf(r.vsAlone), -1) ? "HURTS" : rows.every((r) => signOf(r.vsAlone) === 0) ? "NO EFFECT" : "MIXED";
    const cap = all((r) => signOf(r.vsCap), 1) ? "BEATS A FIXED CAP" : all((r) => signOf(r.vsCap), -1) ? "LOSES TO A FIXED CAP" : "TIES A FIXED CAP";
    const beatsGF = all((r) => signOf(r.vsGF), 1), beatsG = all((r) => signOf(r.vsG), 1);
    let bottom;
    if (!weighed) bottom = "NOT WEIGHED (fewer than 95 percent of asks were fully answered)";
    else if (effect === "HELPS" && cap === "BEATS A FIXED CAP") bottom = `ADDS CONTENT BEYOND A FIXED CAP (${beatsGF ? "and beats" : "but does not beat"} the rule GUARDED-FILTER${beatsG ? ", beats" : ", does not beat"} GUARDED)`;
    else if (effect === "HELPS") bottom = "HELPS, BUT NO MORE THAN A FIXED CAP";
    else if (effect === "HURTS") bottom = "HURTS";
    else bottom = effect === "MIXED" ? "NO CONSISTENT EFFECT (MIXED)" : "NO EFFECT";
    return { rows, effect, cap, beatsGF, beatsG, bottom, weighed };
}
/** (d) CONFIDENCE CARRIES INFORMATION iff DECIDER-T80 beats DECIDER-T50 on all three audits (paired, the margin rule). */
export function confidenceVerdict(audits) {
    const rows = AUDIT_NAMES.map((a) => pairedRuns(audits[a]["DECIDER-T80"].res, audits[a]["DECIDER-T50"].res));
    return { rows, carries: rows.every((p) => signOf(p) > 0), hurts: rows.every((p) => signOf(p) < 0) };
}

// ---- the report ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
const f3 = (v) => (Number.isFinite(v) ? v.toFixed(3) : "n/a");
const pc = (p) => `${p.diff >= 0 ? "+" : ""}${f3(p.diff)} (needs ${f3(margin(p))}: ${signOf(p) > 0 ? "WINS" : signOf(p) < 0 ? "LOSES" : "tie"})`;
/** The report lines for one recording: `tr`, the transcript; `audits` flyAudits' result; `idc` identityChecks'; `checks` the rows of transcriptChecks. */
export function reportLines({ id, tr, audits, idc, checks }) {
    const Ls = [`DECIDER CHIP (Round 14), noisy gauge: seeds ${D.DECIDER_AUDITS.map(([a, b]) => `${a}-${b}`).join(" ")}, four kinds, brain GUARDED-OBS, VETO, model ${id}`];
    for (const r of idc.rows) Ls.push(`  ${r.ok ? "[ok]     " : "[FAILED] "} ${r.name}: ${r.text}`);
    for (const c of checks) Ls.push(`  ${c.ok ? "[ok]     " : "[FAILED] "} ${c.name}: ${c.text}`);
    const nontrivial = AUDIT_NAMES.map((a) => pairedRuns(kindsOf(audits[a]["RULE-GF"].res, ["far", "both"]), kindsOf(audits[a].ALONE.res, ["far", "both"]))), ntOk = nontrivial.every((p) => signOf(p) > 0);
    Ls.push(`  ${ntOk ? "[ok]     " : "[FAILED] "} THE RULE IS NOT TRIVIAL: RULE-GF minus ALONE on far and both: ${nontrivial.map((p) => `${f3(p.diff)} (needs ${f3(margin(p))})`).join(" | ")}`);
    const arms = [...BASE_ARMS, ...Object.keys(DECIDER_ARMS)];
    Ls.push(`  means (${AUDIT_NAMES.join(" | ")}): ${arms.map((a) => `${a} ${AUDIT_NAMES.map((n) => f3(audits[n][a].res.score)).join(" | ")}`).join("; ")}`);
    Ls.push(`  crushed dives (${AUDIT_NAMES.join(" | ")}): ${arms.map((a) => `${a} ${AUDIT_NAMES.map((n) => audits[n][a].res.crashed).join("/")}`).join("; ")}`);
    const hard = checks.filter((c) => !c.answerRate).every((c) => c.ok) && idc.ok && ntOk, answerOk = checks.every((c) => !c.answerRate || c.ok), allOk = hard && answerOk;
    if (!hard) Ls.push("  A CHECK FAILED: the verdicts below are printed and NOT weighed");
    for (const arm of Object.keys(DECIDER_ARMS)) {
        const v = verdictFor(audits, arm, { weighed: allOk }), st = AUDIT_NAMES.map((a) => audits[a][arm].stats), sum = (k) => st.reduce((s, x) => s + (x[k] || 0), 0), as = askStats(tr, DECIDER_ARMS[arm]);
        Ls.push(`  --- ${arm} (tau ${DECIDER_ARMS[arm]})`);
        Ls.push(`  strongest fixed cap per audit: ${v.rows.map((r) => r.strongestCap).join(" | ")}`);
        Ls.push(`  effect against ALONE: ${v.rows.map((r) => pc(r.vsAlone)).join(" | ")}  -> ${v.effect}`);
        Ls.push(`  against the strongest fixed cap: ${v.rows.map((r) => pc(r.vsCap)).join(" | ")}  -> ${v.cap}`);
        Ls.push(`  against RULE-GF: ${v.rows.map((r) => pc(r.vsGF)).join(" | ")}  -> ${v.beatsGF ? "BEATS THE RULE" : "does not beat it"}; against RULE-G: ${v.rows.map((r) => pc(r.vsG)).join(" | ")}  -> ${v.beatsG ? "BEATS THE RULE" : "does not beat it"}`);
        Ls.push(`  overrides of the brain (ticks, summed over the three audits): surface ${sum("surface")}, station ${sum("station")}, cap ${sum("cap")}, pump ${sum("pump")}, repair ${sum("repair")} of ${sum("ticks")} ticks`);
        Ls.push(`  advice at this tau (reported): ${as.asks} asks; surface advised ${as.surface} (early, stations unvisited before 300 s: ${as.earlySurface}); pump advised ${as.pump} (with flooding at 0: ${as.pumpNoFlood}); repair advised ${as.repair}`);
        Ls.push(`DECIDER BOTTOM LINE (${arm}): ${allOk ? v.bottom : "NOT WEIGHED (a check failed)"}`);
    }
    const c = confidenceVerdict(audits);
    Ls.push(`  (d) CONFIDENCE: DECIDER-T80 minus DECIDER-T50: ${c.rows.map(pc).join(" | ")}  -> ${c.carries ? "CONFIDENCE CARRIES INFORMATION" : c.hurts ? "the higher threshold is WORSE on every audit" : "NOT SHOWN (the higher threshold does not beat the lower on all three audits)"}${allOk ? "" : " (NOT WEIGHED)"}`);
    return Ls;
}

// ---- the commands ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
export function parseArgs(argv) {
    const [cmd, ...rest] = argv;
    if (cmd !== "record" && cmd !== "report") throw new Error(`the first word must be record or report, got ${JSON.stringify(cmd)}`);
    const known = { record: { "model-id": String, url: String, out: String, "max-calls": Number, timeout: Number, "dry-run": Boolean }, report: { in: String } }[cmd], given = {};
    for (let i = 0; i < rest.length; i++) {
        const a = rest[i]; if (!a.startsWith("--")) throw new Error(`unexpected argument ${JSON.stringify(a)}`);
        const k = a.slice(2); if (!(k in known)) throw new Error(`unknown option ${JSON.stringify(a)} (known for ${cmd}: ${Object.keys(known).map((n) => "--" + n).join(", ")})`);
        if (known[k] === Boolean) given[k] = true; else { const v = rest[++i]; if (v == null || v.startsWith("--")) throw new Error(`${a} needs a value`); given[k] = known[k] === Number ? Number(v) : v; if (known[k] === Number && !Number.isFinite(given[k])) throw new Error(`${a} needs a number`); }
    }
    if (cmd === "report") { if (!given.in) throw new Error("report needs --in <recording>"); return { cmd, file: given.in }; }
    for (const k of ["model-id", "out"]) if (!given[k]) throw new Error(`record needs --${k}`);
    const max = given["max-calls"] ?? DEFAULT_MAX_CALLS; if (!(Number.isInteger(max) && max >= 1)) throw new Error("--max-calls must be a whole number of 1 or more");
    const url = given.url || DEFAULT_URL; if (!/^http:\/\/(127\.0\.0\.1|localhost|\[::1\])(:\d+)?\//.test(url)) throw new Error("--url must be a local server (http://127.0.0.1:PORT/...): the state of a dive is not sent anywhere else");
    return { cmd, modelId: given["model-id"], url, out: given.out, maxCalls: max, timeoutMs: given.timeout ?? DEFAULT_TIMEOUT_MS, dryRun: !!given["dry-run"] };
}
/** The model function over a local server: POST the prompt, return the reply text. curl (no shell: arguments only), with the prompt on stdin. */
export function modelFnFromUrl({ url, timeoutMs = DEFAULT_TIMEOUT_MS, spawn = spawnSync }) {
    return (prompt) => {
        const r = spawn("curl", ["-sS", "--fail-with-body", "-m", String(Math.ceil(timeoutMs / 1000)), "-H", "Content-Type: application/json", "--data-binary", "@-", url], { input: prompt, encoding: "utf8", maxBuffer: 16 * 1024 * 1024, windowsHide: true });
        if (r.error) throw new Error(`cannot call curl: ${r.error.message}`);
        if (r.status !== 0) throw new Error(`the model server at ${url} failed (curl exit ${r.status}): ${String(r.stderr || r.stdout).trim().slice(0, 300)}`);
        return String(r.stdout);
    };
}
/** The most model calls a recording can need: every dive is flown once PER THRESHOLD (the two thresholds advise differently, so their dives pass through different situations; shared situations are asked once). */
export const expectedCalls = (sets = AUDIT_NAMES.map((_, i) => auditSet(i))) => sets.reduce((n, st) => n + st.length, 0) * Math.ceil(T.SECONDS / T.DT / EVERY) * Object.keys(DECIDER_ARMS).length;

/** THE COMMAND, as a function. io: { out, err, readFile, writeFile, appendFile, exists, makeModelFn, sets, ev, identity, now } -- all seams for the gate. Returns the exit code. */
export async function command(argv, io = {}) {
    const out = io.out || ((m) => console.log(m)), err = io.err || ((m) => console.error(m)), readFile = io.readFile || ((f) => fs.readFileSync(f, "utf8")), writeFile = io.writeFile || fs.writeFileSync, appendFile = io.appendFile || fs.appendFileSync, exists = io.exists || fs.existsSync, now = io.now || (() => Date.now());
    let o; try { o = parseArgs(argv); } catch (e) { err("deciderAudit: " + e.message); return 2; }
    if (o.cmd === "report") {
        let tr; try { tr = D.parseTranscript(readFile(o.file)); } catch (e) { err(`deciderAudit: ${o.file}: ${e.message}`); return 1; }
        const id = tr.header.model.id, c = transcriptChecks(id, tr), checks = [
            { name: `TRANSCRIPT ${id}`, ok: c.headerOk, text: `kind ${tr.header.kind}, schema ${tr.header.schema}, every ${tr.header.every}${c.headerOk ? "" : " -- needs decider-transcript, schema " + D.SCHEMA + " and every " + EVERY}` },
            { name: "ANSWER RATE", answerRate: true, ok: c.answerOk, text: `${f3(c.rate)} of ${c.entries} asks had a valid answer to every question (needs ${MIN_ANSWER_RATE})` },
            { name: "THE QUESTIONS ARE FAIR", ok: c.fairOk, text: c.fairOk ? `no prompt carries a seed, kind, unreachable flag, true charge or comparator name (${c.entries} scanned)` : `${c.leaks} prompts carry a forbidden word` }];
        let audits; try { audits = flyAudits(tr, { ev: io.ev, sets: io.sets }); } catch (e) { err("deciderAudit: " + e.message + (e instanceof D.TranscriptMiss ? " -- a recording must hold every situation of the audit dives" : "")); return 1; }
        for (const l of reportLines({ id, tr, audits, idc: (io.identity || identityChecks)(), checks })) out(l);
        return 0;
    }
    const sets = io.sets || AUDIT_NAMES.map((_, i) => auditSet(i)), total = expectedCalls(sets);
    out(`[deciderAudit] ${AUDIT_NAMES.map((n, i) => `${n} ${D.DECIDER_AUDITS[i][0]}-${D.DECIDER_AUDITS[i][1]}`).join(", ")}: ${sets.reduce((n, st) => n + st.length, 0)} dives, the model is asked every ${EVERY} ticks, each dive flown once per threshold (${Object.keys(DECIDER_ARMS).join(", ")}): at most ${total} calls (repeated situations are spared); the ceiling is ${o.maxCalls}${total > o.maxCalls ? " -- LOWER than the most that could be needed: raise --max-calls" : ""}`);
    if (o.dryRun) { out("[deciderAudit] --dry-run: nothing was called"); return 0; }
    if (exists(o.out)) { err(`deciderAudit: ${o.out} already exists; a recording is never overwritten or extended (one recording per model)`); return 1; }
    const callsFile = o.out + ".calls.jsonl", cache = new Map();
    if (exists(callsFile)) { for (const l of String(readFile(callsFile)).split("\n").filter(Boolean)) { try { const e = JSON.parse(l); cache.set(e.prompt, e.reply); } catch { err(`deciderAudit: ${callsFile} has a line that is not json`); return 1; } } out(`[deciderAudit] resuming: ${cache.size} answers already paid for in ${callsFile}`); }
    let raw; try { raw = (io.makeModelFn || ((a) => modelFnFromUrl({ url: a.url, timeoutMs: a.timeoutMs })))(o); } catch (e) { err("deciderAudit: " + L.scrub(e.message)); return 1; }
    let spent = 0; const timed = (p) => { const t0 = now(); const r = raw(p); spent += now() - t0; return r; };
    const fn = L.budgeted(timed, { maxCalls: o.maxCalls, cache, onNew: (prompt, reply) => appendFile(callsFile, JSON.stringify({ prompt, reply }) + "\n") });
    const deciderFn = (state, questions) => JSON.parse(fn(JSON.stringify({ schema: D.SCHEMA, state, questions })));
    const tr = D.createTranscript({ model: { id: o.modelId, params: { engine: "decider-ai", server: "deciderServe.py" } }, every: EVERY });
    // once per threshold, on the same transcript: a replay at tau follows the dives that tau's advice makes, so those are the situations the recording must hold
    try { for (const tau of Object.values(DECIDER_ARMS)) for (const set of sets) for (const sc of set) T.fly((ctx) => A.advisedPilot(brainSeat, D.deciderSeat({ transcript: tr, mode: "record", tau, deciderFn }), "VETO")(ctx), sc, { gauge: GAUGE }); }
    catch (e) { err("deciderAudit: " + L.scrub(e.message) + (fn.state.calls ? ` (${fn.state.calls} answers are saved in ${callsFile}; run the same command again to resume)` : "")); return 1; }
    writeFile(o.out, D.serialize(tr));
    out(`[deciderAudit] recorded ${tr.entries.size} situations (${fn.state.calls} model calls, ${fn.state.hits} repeated or resumed; ${fn.state.calls ? (spent / fn.state.calls / 1000).toFixed(2) : "n/a"} s per call) to ${o.out}; read it with: deciderAuditCmd.mjs report --in ${o.out}`);
    return 0;
}
