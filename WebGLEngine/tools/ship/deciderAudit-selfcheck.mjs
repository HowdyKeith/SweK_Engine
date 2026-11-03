// WebGLEngine/tools/ship/deciderAudit-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node tools/ship/deciderAudit-selfcheck.mjs      (about a minute: it flies a few real dives)
// Gated by tools/ship/selfchecks.mjs (auto-discovered).
//
// THE GATE OF tools/ship/deciderAudit.mjs (+ deciderAuditCmd.mjs and deciderServe.py), the audit of brain/NEEDS_AND_LIMITS.md "Round 14" and its Amendment 1. NO MODEL IS CALLED HERE: the recording is exercised against a stub model
// function and tiny sets, and the report against that recording; what is held is the machinery the real run will rely on.
//   1  CONSTANTS    the arms, the sets (144 dives, disjoint from every other round), the thresholds, the ceiling covers the most a recording can need (both thresholds flown).
//   2  ARGUMENTS    record and report parse; unknown options, a missing value, a non-local --url and a bad ceiling are refused.
//   3  RECORD       the stub model is asked once per distinct situation; every dive is flown once per threshold; a transcript is written that REPLAYS both thresholds without a miss; an existing recording is never overwritten;
//                   --dry-run calls nothing; the ceiling stops the run and keeps the paid answers; a rerun resumes and pays for nothing twice; a failing server stops the run with a scrubbed message.
//   4  CHECKS       the header, the answer rate (95 percent), the fairness scan; each fails by name.
//   5  VERDICTS     every branch of the margin rule, the cap and rule comparisons, the bottom lines, the confidence verdict, NOT WEIGHED.
//   6  REPORT       end to end on the recording of 3: both arms and (d) are printed, a failed check says NOT WEIGHED, and `report` never calls a model.
//   7  THE ADAPTER  deciderServe.py's translation both ways (python3 -I --selftest), and the local-only bind.
//
// SABOTAGE LOG (35 mutants of tools/ship/deciderAudit.mjs and tools/ship/deciderServe.py, each run against this gate with the original saved beside it and restored; every one red BY NAME):
//   the recording: only one threshold flown, the ceiling counted once / set to 8000, a non-local --url accepted (no check; a prefix-only check that "127.0.0.1.evil.example" passes), an existing recording overwritten, the resume ignored, the calls log not written, the ceiling ignored.
//   the checks: the answer-rate floor 0.5, a partial answer counted as full, the fairness scan missing `seed` / `GUARDED`, the header's kind unchecked, the identity row not requiring the silent decider, early surfacing at 600 s instead of 300 s.
//   the verdicts: effect on SOME audit instead of all, the strongest cap picked as the lowest, weighed ignored, the confidence verdict reversed, a DECIDER arm replayed at the wrong tau.
//   the model call: curl through a shell, a curl failure / error ignored, --fail-with-body dropped, the prompt not on stdin, `report` building a model function.
//   the adapter: bound to 0.0.0.0, a probability not clamped, unoffered options kept, yes/no swapped, an unknown question type accepted.
//   Three went 0 red on the first pass and each led to a new row: the identity row (now run through the evaluator seam with one run altered), the early-surfacing boundary (hand-made asks at 299 s, 300 s, visited, flooded) and the per-arm tau (T80 must advise surfacing on fewer ticks than T50 on the same dives). A DESIGN DEFECT was found while writing the gate, before any run: a replay at one threshold asks situations the other threshold's dives never reach, so the recording must fly every dive once per threshold (Round 14 Amendment 1).
// NOT CHECKED, said plainly: a real Decider (its weights could not be fetched on this build box), the real server, the real curl call, and anything about how well the model advises (that is the experiment).
"use strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import * as T from "../../brain/needsTask.mjs";
import * as A from "../../brain/advisorChip.mjs";
import * as D from "../../brain/deciderAdvisor.mjs";
import * as X from "./deciderAudit.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let fails = 0, finished = false;
const died = (e) => { console.log("  FAIL  !! THE GATE THREW before it finished: " + String((e && e.stack) || e).split("\n").slice(0, 3).join(" | ").slice(0, 400)); process.exit(1); };
process.on("uncaughtException", died); process.on("unhandledRejection", died);
process.on("exit", () => { if (!finished) { console.log("  FAIL  !! THE GATE ENDED BEFORE IT FINISHED"); process.exitCode = 1; } });
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const sec = (t) => console.log("\n" + t);
const J = JSON.stringify;
console.log("deciderAudit-selfcheck -- the Decider audit (Round 14)\n");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "swek-decider-"));

sec("1. THE CONSTANTS");
{
    ok("the arms are the registered two, at tau 0.50 and 0.80", J(X.DECIDER_ARMS) === '{"DECIDER-T50":0.5,"DECIDER-T80":0.8}' && X.DECIDER_ARMS["DECIDER-T50"] === D.TAUS.T50);
    const sets = X.AUDIT_NAMES.map((_, i) => X.auditSet(i));
    ok("!! three audits of 48 dives, four kinds each, the seeds of Round 14 and no others", X.AUDIT_NAMES.join() === "D1,D2,D3" && sets.every((s) => s.length === 48) && sets.every((s, i) => s.every((sc) => sc.seed >= D.DECIDER_AUDITS[i][0] && sc.seed <= D.DECIDER_AUDITS[i][1])) && sets.every((s) => new Set(s.map((sc) => sc.kind)).size === 4));
    ok("!! the most a recording can need is 8,640 calls (144 dives x 30 asks x 2 thresholds) and the default ceiling covers it", X.expectedCalls() === 8640 && X.DEFAULT_MAX_CALLS >= 8640, "ceiling " + X.DEFAULT_MAX_CALLS);
    ok("the comparators are Round 5's: three fixed caps and the two rules", X.FIXED_ARMS.join() === "CAP-0.50,CAP-0.65,CAP-0.75" && X.RULE_ARMS.join() === "RULE-GF,RULE-G");
    ok("a DECIDER arm without its transcript is refused, an unknown arm is refused", /needs its transcript/.test((() => { try { X.armFactory("DECIDER-T50"); } catch (e) { return e.message; } })() || "") && /unknown arm/.test((() => { try { X.armFactory("NOPE"); } catch (e) { return e.message; } })() || ""));
}

sec("2. THE ARGUMENTS");
{
    const bad = (a) => { try { X.parseArgs(a); return null; } catch (e) { return e.message; } };
    const r = X.parseArgs(["record", "--model-id", "Mapika/decider-2b", "--out", "o.jsonl"]);
    ok("record: a model id and an out file are enough; the url defaults to the local server, the ceiling to 9000", r.modelId === "Mapika/decider-2b" && r.url === X.DEFAULT_URL && r.maxCalls === 9000 && r.dryRun === false);
    ok("report: needs --in", X.parseArgs(["report", "--in", "a.jsonl"]).file === "a.jsonl" && /--in/.test(bad(["report"]) || ""));
    ok("!! a non-local --url is REFUSED (a dive's state is not sent anywhere else): a public host, https, a lookalike, and a userinfo trick", ["http://example.com/ask", "https://127.0.0.1/ask", "http://127.0.0.1.evil.example/ask", "http://localhost@evil.example/ask"].every((u) => /local server/.test(bad(["record", "--model-id", "m", "--out", "o", "--url", u]) || "")));
    ok("localhost, 127.0.0.1 and [::1] with a port are accepted", ["http://127.0.0.1:8765/ask", "http://localhost:9/ask", "http://[::1]:8765/ask"].every((u) => bad(["record", "--model-id", "m", "--out", "o", "--url", u]) === null));
    ok("a first word that is not record or report, an unknown option, a missing value, a missing model id, a bad ceiling", ["go", "record --nope", "record --model-id", "record --out o", "record --model-id m --out o --max-calls 0", "record --model-id m --out o --max-calls x"].every((s) => bad(s === "go" ? ["go"] : s.split(" ")) !== null));
}

// a stub model: answers every question from the prompt text itself, deterministically (a hash of the state), counting calls
let calls = 0;
const stub = () => (prompt) => {
    calls++;
    const p = JSON.parse(prompt), h = [...JSON.stringify(p.state)].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7), u = (k) => (((h >>> k) & 255) / 255);
    const a = { surface: { probs: { yes: u(1), no: 1 - u(1) } }, pump: { probs: { yes: u(3), no: 1 - u(3) } }, repair: { probs: { yes: u(5), no: 1 - u(5) } } };
    const cap = p.questions.find((q) => q.id === "cap"), st = p.questions.find((q) => q.id === "station");
    a.cap = { probs: Object.fromEntries(cap.options.map((o, i) => [o, i === (h >>> 9) % cap.options.length ? 0.9 : 0.1 / (cap.options.length - 1)])) };
    if (st) a.station = { probs: Object.fromEntries(st.options.map((o, i) => [o, i === (h >>> 11) % st.options.length ? 0.85 : 0.15 / (st.options.length - 1)])) };   // no station question once every station is visited
    return JSON.stringify(a);
};
const tiny = [T.scenario(1301, "plain"), T.scenario(1321, "far"), T.scenario(1341, "both")].map((sc) => [sc]);
const tinyAll = (n) => Array.from({ length: 3 }, (_, i) => [T.scenario(1301 + 20 * i, T.KINDS[(i + n) % 4])]);

sec("3. RECORD");
{
    const out = path.join(tmp, "rec.jsonl"), logs = [], errs = [], io = (extra = {}) => ({ out: (m) => logs.push(m), err: (m) => errs.push(m), sets: tiny, makeModelFn: stub, ...extra });
    const dry = await X.command(["record", "--model-id", "stub", "--out", out, "--dry-run"], io());
    ok("!! --dry-run calls nothing and writes nothing", dry === 0 && calls === 0 && !fs.existsSync(out) && logs.some((l) => /dry-run/.test(l)));
    const code = await X.command(["record", "--model-id", "stub", "--out", out], io());
    ok("the recording succeeds, writes the transcript, and reports its calls", code === 0 && fs.existsSync(out) && calls > 0 && logs.some((l) => /recorded \d+ situations/.test(l)), logs.at(-1).slice(0, 110));
    const tr = D.parseTranscript(fs.readFileSync(out, "utf8")), paid = calls;
    ok("!! one call per DISTINCT situation: the transcript holds exactly as many entries as the model was called (repeats are spared)", tr.entries.size === paid && tr.header.model.id === "stub" && tr.header.every === 600 && tr.header.kind === "decider-transcript");
    ok("...and every dive was flown once per threshold: more asks than the 30 of a single flight of three dives", paid > 3 * 1 && paid <= X.expectedCalls(tiny));
    const rep = []; const rc = await X.command(["report", "--in", out], { out: (m) => rep.push(m), err: (m) => errs.push(m), sets: tiny, makeModelFn: () => { throw new Error("report must not call a model"); } });
    ok("!! the recording REPLAYS both thresholds on the same dives without a miss (and report never builds a model function)", rc === 0 && calls === paid && rep.some((l) => /DECIDER BOTTOM LINE \(DECIDER-T50\)/.test(l)) && rep.some((l) => /DECIDER BOTTOM LINE \(DECIDER-T80\)/.test(l)));
    const again = []; const c2 = await X.command(["record", "--model-id", "stub", "--out", out], io({ err: (m) => again.push(m) }));
    ok("!! an existing recording is never overwritten or extended", c2 === 1 && /already exists/.test(again.join()) && calls === paid);

    // the ceiling: stops, keeps what it paid for; the rerun resumes and pays for nothing twice
    const out2 = path.join(tmp, "rec2.jsonl"); calls = 0; const e2 = [];
    const c3 = await X.command(["record", "--model-id", "stub", "--out", out2, "--max-calls", "3"], io({ err: (m) => e2.push(m) }));
    const log = fs.readFileSync(out2 + ".calls.jsonl", "utf8").split("\n").filter(Boolean);
    ok("!! a ceiling of 3 stops the run after exactly 3 paid calls, writes no transcript, and keeps the 3 answers", c3 === 1 && calls === 3 && log.length === 3 && !fs.existsSync(out2) && /budget/.test(e2.join()) && /run the same command again/.test(e2.join()));
    calls = 0; const l2 = []; const c4 = await X.command(["record", "--model-id", "stub", "--out", out2], io({ out: (m) => l2.push(m) }));
    ok("!! the rerun RESUMES: it reads the 3 saved answers, pays only for the rest, and the transcript equals the uninterrupted one", c4 === 0 && l2.some((l) => /resuming: 3 answers/.test(l)) && calls === paid - 3 && fs.readFileSync(out2, "utf8") === fs.readFileSync(out, "utf8"));

    const e3 = []; const c5 = await X.command(["record", "--model-id", "stub", "--out", path.join(tmp, "rec3.jsonl")], io({ err: (m) => e3.push(m), makeModelFn: () => () => { throw new Error("the model server at http://127.0.0.1:8765/ask failed (curl exit 7)"); } }));
    ok("a failing model server stops the run with its reason, writes no transcript", c5 === 1 && /curl exit 7/.test(e3.join()) && !fs.existsSync(path.join(tmp, "rec3.jsonl")));
    const e4 = []; await X.command(["record", "--model-id", "stub", "--out", path.join(tmp, "rec4.jsonl")], io({ err: (m) => e4.push(m), makeModelFn: () => () => "not json at all" }));
    ok("a server that answers something that is not json is an error that stops the run, not a silent neutral dive", e4.length > 0 && !fs.existsSync(path.join(tmp, "rec4.jsonl")));
    ok("a missing recording and a damaged one are read as errors by report", (await X.command(["report", "--in", path.join(tmp, "nope.jsonl")], { err: () => {} })) === 1 && (fs.writeFileSync(path.join(tmp, "bad.jsonl"), "garbage"), await X.command(["report", "--in", path.join(tmp, "bad.jsonl")], { err: () => {} })) === 1);
    // keep for later sections
    globalThis.__rec = { out, tr };
}

sec("4. THE CHECKS");
{
    const { tr } = globalThis.__rec;
    const good = X.transcriptChecks("stub", tr);
    ok("the recording passes: header, answer rate 1.000, no leaks", good.headerOk && good.rate === 1 && good.answerOk && good.fairOk, J({ rate: good.rate, entries: good.entries }));
    ok("!! a different model id, every, schema or kind fails the header check", !X.transcriptChecks("other", tr).headerOk && !X.transcriptChecks("stub", { ...tr, header: { ...tr.header, every: 30 } }).headerOk && !X.transcriptChecks("stub", { ...tr, header: { ...tr.header, kind: "advisor-transcript" } }).headerOk && !X.transcriptChecks("stub", { ...tr, header: { ...tr.header, schema: 2 } }).headerOk);
    const mutate = (n, f) => { const t = D.createTranscript({ model: tr.header.model, every: 600 }); let i = 0; for (const [k, e] of tr.entries) t.entries.set(k, i++ < n ? f(e) : e); return t; };
    const half = mutate(tr.entries.size, (e) => e), cut = (frac) => mutate(Math.ceil(tr.entries.size * frac), (e) => ({ ...e, reply: J({ ...JSON.parse(e.reply), surface: null }) }));
    ok("!! the answer rate counts asks with EVERY question answered: 4 percent damaged passes (>= 0.95), 10 percent damaged fails", X.transcriptChecks("stub", half).answerOk && X.transcriptChecks("stub", cut(0.04)).answerOk && !X.transcriptChecks("stub", cut(0.10)).answerOk, [0.04, 0.1].map((f) => X.transcriptChecks("stub", cut(f)).rate.toFixed(3)).join(" / "));
    ok("an ask whose reply is not json at all counts as unanswered, not as a crash", !X.transcriptChecks("stub", mutate(tr.entries.size, (e) => ({ ...e, reply: "oops" }))).answerOk);
    const leaky = mutate(2, (e) => ({ ...e, prompt: e.prompt.replace('"state"', '"seed":1301,"state"') }));
    ok("!! the fairness scan finds a prompt that carries a seed, `unreachable`, a comparator's name or the true energy", X.transcriptChecks("stub", leaky).leaks === 2 && !X.transcriptChecks("stub", leaky).fairOk && ["unreachable", "GUARDED", "RULE-GF", "energy", "kind"].every((w) => !X.transcriptChecks("stub", mutate(1, (e) => ({ ...e, prompt: e.prompt + w }))).fairOk));
    const as = X.askStats(tr, 0.5), as2 = X.askStats(tr, 1.5);
    ok("askStats counts what was advised at a tau and nothing at tau above 1; early surfacing counts only asks before 300 s with stations unvisited", as.asks === tr.entries.size && as.surface > 0 && as.earlySurface <= as.surface && as.pumpNoFlood <= as.pump && as2.surface === 0 && as2.pump === 0 && as2.repair === 0);
    let kn = 0; const hand = D.createTranscript({ model: { id: "h" }, every: 600 }), ask = (t, flood, visited, yes) => ({ key: "k" + kn++, prompt: J({ schema: 1, state: { time_s: t, flooding: flood, stations: [{ visited }] }, questions: [] }), reply: J({ surface: { probs: { yes } }, pump: { probs: { yes } }, repair: { probs: { yes: 0.1 } } }) });
    for (const e of [ask(100, 0, false, 0.9), ask(299, 0, false, 0.9), ask(300, 0, false, 0.9), ask(400, 0.2, false, 0.9), ask(100, 0, true, 0.9), ask(100, 0, false, 0.4)]) hand.entries.set(e.key, e);
    const hs = X.askStats(hand, 0.5);
    ok("!! askStats on hand-made asks: surface counted at yes >= tau (5 of 6), EARLY only before 300 s with a station unvisited (299 s yes, 300 s no, visited no: 2), pump with flooding at 0 counted separately (4 of 5)", hs.asks === 6 && hs.surface === 5 && hs.earlySurface === 2 && hs.pump === 5 && hs.pumpNoFlood === 4 && hs.repair === 0, J(hs));
    const calls3 = []; const evSpy = (factory, set, o) => { calls3.push(1); const r = T.evaluate(factory, set, o); return calls3.length === 3 ? { ...r, runs: r.runs.map((x) => ({ ...x, score: x.score + 0.5 })) } : r; };
    ok("!! identityChecks goes RED when the silent-decider run differs from ALONE (the third run is altered through the evaluator seam)", X.identityChecks({ ev: evSpy, set: [T.scenario(1301, "deep")] }).ok === false);
    const fa = (arm) => X.flyArm(arm, tiny.flat(), { transcript: globalThis.__rec.tr });
    const a50 = fa("DECIDER-T50"), a80 = fa("DECIDER-T80");
    ok("!! each DECIDER arm replays at ITS OWN tau: on the same dives T80 advises surfacing on fewer ticks than T50", a80.model.advised.surface < a50.model.advised.surface && a50.model.advised.surface > 0, `surface ticks ${a50.model.advised.surface} (T50) vs ${a80.model.advised.surface} (T80)`);
    const idc = X.identityChecks({ set: [T.scenario(1301, "deep"), T.scenario(1321, "both")] });
    ok("!! the identities hold on real dives: a null advisor, a decider below tau, and GUARDED-FILTER advised by itself", idc.ok && idc.rows[0].ok, idc.rows[0].text.slice(0, 120));
}

sec("5. THE VERDICTS");
{
    // synthetic audits: arm results are { res: { score, runs: [{kind, score}] } } over 12 paired dives
    const mk = (scores) => ({ res: { score: scores.reduce((a, b) => a + b, 0) / scores.length, runs: scores.map((s, i) => ({ kind: T.KINDS[i % 4], score: s })), crashed: 0 }, stats: {}, model: {} });
    const base = (v, jitter = 0) => Array.from({ length: 12 }, (_, i) => v + jitter * (((i * 7) % 5) - 2) / 10);
    const audit = (o) => ({ ALONE: mk(base(o.alone ?? 0.5, 0.01)), "CAP-0.50": mk(base(o.cap ?? 0.4, 0.01)), "CAP-0.65": mk(base(o.cap ?? 0.4, 0.01)), "CAP-0.75": mk(base(o.cap ?? 0.4, 0.01)), "RULE-GF": mk(base(o.rule ?? 0.8, 0.01)), "RULE-G": mk(base(o.g ?? 0.5, 0.01)), "DECIDER-T50": mk(base(o.t50 ?? 0.5, 0.01)), "DECIDER-T80": mk(base(o.t80 ?? 0.5, 0.01)) });
    const all = (o) => ({ D1: audit(o), D2: audit(o), D3: audit(o) });
    const v = (o, arm = "DECIDER-T50", w = true) => X.verdictFor(all(o), arm, { weighed: w });
    ok("HELPS and beats the cap, beats GUARDED (0.5) but not GUARDED-FILTER (0.8) -> 'ADDS CONTENT BEYOND A FIXED CAP (but does not beat the rule GUARDED-FILTER, beats GUARDED)'", /^ADDS CONTENT BEYOND A FIXED CAP \(but does not beat the rule GUARDED-FILTER, beats GUARDED\)/.test(v({ t50: 0.7 }).bottom), v({ t50: 0.7 }).bottom);
    ok("...and below both rules it beats neither", /\(but does not beat the rule GUARDED-FILTER, does not beat GUARDED\)/.test(v({ alone: 0.3, cap: 0.2, t50: 0.4, g: 0.6 }).bottom));
    ok("...and beating both rules says so", /\(and beats the rule GUARDED-FILTER, beats GUARDED\)/.test(v({ t50: 0.95 }).bottom));
    ok("!! HELPS without beating a fixed cap that is as good -> 'HELPS, BUT NO MORE THAN A FIXED CAP'", v({ alone: 0.4, cap: 0.6, t50: 0.6 }).bottom === "HELPS, BUT NO MORE THAN A FIXED CAP", v({ alone: 0.4, cap: 0.6, t50: 0.6 }).bottom);
    ok("HURTS on all three audits -> HURTS; equal to ALONE -> NO EFFECT", v({ t50: 0.3 }).bottom === "HURTS" && v({ t50: 0.5 }).bottom === "NO EFFECT");
    const mixed = { D1: audit({ t50: 0.7 }), D2: audit({ t50: 0.3 }), D3: audit({ t50: 0.5 }) };
    ok("!! signs that differ across audits are MIXED, not averaged", X.verdictFor(mixed, "DECIDER-T50").bottom === "NO CONSISTENT EFFECT (MIXED)");
    ok("the margin rule: a gain of 0.01 (under the 0.02 floor) is a tie even when the audits agree on its sign", v({ t50: 0.51 }).effect === "NO EFFECT" && v({ t50: 0.53 }).effect === "HELPS");
    ok("the strongest fixed cap is picked PER AUDIT (the highest mean)", (() => { const a = all({}); a.D2["CAP-0.75"] = mk(base(0.9, 0.01)); return X.verdictFor(a, "DECIDER-T50").rows.map((r) => r.strongestCap).join() === "CAP-0.50,CAP-0.75,CAP-0.50"; })());
    ok("!! weighed=false prints NOT WEIGHED instead of a verdict", /^NOT WEIGHED/.test(v({ t50: 0.7 }, "DECIDER-T50", false).bottom));
    ok("(d) CONFIDENCE: T80 beating T50 on all three audits carries information; T80 worse hurts; equal is not shown", X.confidenceVerdict(all({ t50: 0.5, t80: 0.7 })).carries && X.confidenceVerdict(all({ t50: 0.7, t80: 0.5 })).hurts && !X.confidenceVerdict(all({})).carries && !X.confidenceVerdict({ D1: audit({ t80: 0.7 }), D2: audit({ t80: 0.7 }), D3: audit({ t80: 0.5 }) }).carries);
}

sec("6. THE REPORT");
{
    const { out, tr } = globalThis.__rec, lines = [];
    await X.command(["report", "--in", out], { out: (m) => lines.push(m), err: () => {}, sets: tiny });
    const text = lines.join("\n");
    ok("the report prints the identity, the three checks, the rule check, both arms with their bottom lines, and (d)", /\]\s+IDENTITY/.test(text) && /TRANSCRIPT stub/.test(text) && /ANSWER RATE/.test(text) && /THE QUESTIONS ARE FAIR/.test(text) && /THE RULE IS NOT TRIVIAL/.test(text) && /--- DECIDER-T50 \(tau 0.5\)/.test(text) && /--- DECIDER-T80 \(tau 0.8\)/.test(text) && /\(d\) CONFIDENCE/.test(text));
    ok("...each arm reports its overrides and the advice at its tau (reported, not in the verdict)", (text.match(/overrides of the brain/g) || []).length === 2 && (text.match(/advice at this tau/g) || []).length === 2);
    // a damaged recording: the report says NOT WEIGHED
    const dmg = path.join(tmp, "dmg.jsonl"), t2 = D.createTranscript({ model: tr.header.model, every: 600 });
    // damage only `repair` answers whose P(yes) is under BOTH thresholds: the question goes neutral (false) exactly as the real answer did, so the dives are unchanged and every situation is still held
    let n = 0, quota = Math.ceil(tr.entries.size * 0.12);
    for (const [k, e] of tr.entries) { const a = JSON.parse(e.reply); if (n < quota && a.repair.probs.yes < 0.5) { a.repair = null; n++; } t2.entries.set(k, { ...e, reply: J(a) }); }
    fs.writeFileSync(dmg, D.serialize(t2));
    const l2 = []; await X.command(["report", "--in", dmg], { out: (m) => l2.push(m), err: () => {}, sets: tiny });
    ok("!! a recording whose answer rate fails the check prints its verdicts as NOT WEIGHED, with the failed row first", l2.some((l) => /\[FAILED\]\s+ANSWER RATE/.test(l)) && l2.filter((l) => /DECIDER BOTTOM LINE/.test(l)).every((l) => /NOT WEIGHED/.test(l)));
    const truncated = path.join(tmp, "cut.jsonl"), t3 = D.createTranscript({ model: tr.header.model, every: 600 }); [...tr.entries].slice(0, 2).forEach(([k, e]) => t3.entries.set(k, e)); fs.writeFileSync(truncated, D.serialize(t3));
    const e5 = []; const rc = await X.command(["report", "--in", truncated], { out: () => {}, err: (m) => e5.push(m), sets: tiny });
    ok("!! a recording that does not hold every situation of the dives is a refusal that says so, never an invented answer", rc === 1 && /hold every situation/.test(e5.join()));
}

sec("7. THE ADAPTER AND THE SOURCE");
{
    const py = spawnSync("python3", ["-I", path.join(ENG, "tools", "ship", "deciderServe.py"), "--selftest"], { encoding: "utf8" });
    if (py.error) console.log("  ----  python3 not available here: the adapter's translation check was SKIPPED");
    else ok("!! deciderServe.py's translation holds both ways (questions to Decider's dict, answers back; an unoffered option dropped, a probability clamped, an unknown type refused)", py.status === 0 && /selftest: ok/.test(py.stdout), (py.stderr || py.stdout).trim().slice(0, 120));
    const serve = fs.readFileSync(path.join(ENG, "tools", "ship", "deciderServe.py"), "utf8"), lib = fs.readFileSync(path.join(ENG, "tools", "ship", "deciderAudit.mjs"), "utf8"), code = lib.replace(/^\s*\/\/.*$/gm, "");
    ok("!! the server binds 127.0.0.1 only", /HTTPServer\(\("127\.0\.0\.1"/.test(serve) && !/0\.0\.0\.0/.test(serve));
    ok("the model is reached through curl with arguments and the prompt on stdin: no shell, no template-built command", /spawn\("curl", \[/.test(code) && !/shell\s*:\s*true/.test(code) && /input: prompt/.test(code));
    {
        const seen = []; const fake = (status, stdout = "", stderr = "", error = null) => (cmd, args, o) => { seen.push({ cmd, args, o }); return { status, stdout, stderr, error }; };
        const f = X.modelFnFromUrl({ url: "http://127.0.0.1:8765/ask", timeoutMs: 90000, spawn: fake(0, '{"a":1}') }), reply = f('{"p":1}');
        ok("!! modelFnFromUrl runs curl with an ARGUMENT LIST (no shell), the prompt on stdin, the url last, a timeout in seconds, --fail-with-body, and returns the body", reply === '{"a":1}' && seen[0].cmd === "curl" && Array.isArray(seen[0].args) && seen[0].o.input === '{"p":1}' && seen[0].args.at(-1) === "http://127.0.0.1:8765/ask" && seen[0].args.includes("--fail-with-body") && seen[0].args[seen[0].args.indexOf("-m") + 1] === "90" && seen[0].o.shell !== true);
        const thr = (spawn) => { try { X.modelFnFromUrl({ url: "http://127.0.0.1:1/ask", spawn })("{}"); return null; } catch (e) { return e.message; } };
        ok("!! a curl failure (exit 22/7), a missing curl, and an HTTP error body are errors with their reason, never an empty answer", /curl exit 22/.test(thr(fake(22, '{"error":"boom"}', "")) || "") && /boom/.test(thr(fake(22, '{"error":"boom"}', "")) || "") && /cannot call curl/.test(thr(fake(null, "", "", new Error("ENOENT"))) || "") && /curl exit 7/.test(thr(fake(7, "", "refused")) || ""));
    }
    ok("`report` can never call a model: the only model function is built inside the record branch", code.indexOf("io.makeModelFn") > code.indexOf('if (o.dryRun)') && code.indexOf("io.makeModelFn") > code.indexOf('if (o.cmd === "report")') + 200);
    ok("the tool names no seed outside the module's DECIDER_AUDITS (the sets are read from one place)", !/\b13[0-9]{2}\b/.test(code));
}

fs.rmSync(tmp, { recursive: true, force: true });
finished = true;
console.log("\ndeciderAudit-selfcheck: " + (fails ? fails + " FAILED" : "all checks pass"));
process.exit(fails ? 1 : 0);
