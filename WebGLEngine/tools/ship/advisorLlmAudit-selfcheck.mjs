// WebGLEngine/tools/ship/advisorLlmAudit-selfcheck.mjs -- UNNUMBERED. Gate for tools/ship/advisorLlmAudit.mjs (Round 5, the language-model chip: the arms, the reserved sets, the checks, the verdicts, the report, the record and report commands).
// Run: node tools/ship/advisorLlmAudit-selfcheck.mjs     (no model, no network: a scripted model; real flights on a handful of dives; the commands on stub evaluators)
// SABOTAGED -- 104 mutants of tools/ship/advisorLlmAudit.mjs, each run against a copy of this gate, 4 at a time, a mutant past 150 s counted red, every one red BY NAME; plus an IDENTITY mutant that reads 0 red (it does).
// FIRST PASS: 23 read 0 red -- the gate had passed on its first run and was weaker than it looked. ROWS ADDED: each arm equals the thing the registration names (caps, GF, G, ALONE) on a dive where they differ; each audit is flown on its own set; 'beats' and 'loses' need all three audits (per-audit cap and rule strengths); RULE-GF and RULE-G told apart; the default practice dives are 501-508 (a transcript of 501-502 is refused); the unreadable-transcript reason; each identity clause failing alone; the recording the command makes equals a direct VETO recording under the noisy gauge; the crushed line; THE RULE IS NOT TRIVIAL failing; a badly parsing recording; two recordings with one not weighed. CHANGED: the identity check's default dives are a deep and a both (the first four of the set were all plain and could not see a cap); a model's OWN checks (header, parse rate) weigh against that model only, a global check (identity, the rule) against all (the first version un-weighed every model for one model's parse rate); the command reads identity through a seam. CUT AS DEAD: passing the parse flag to verdictFor from the command (the report weighs the model itself). The practice gate's coverage replay flies only the advised pilot (half the flights).
// Gate time here: about 16 s (real flights on a handful of dives; the commands on stub evaluators).
"use strict";
import fs from "node:fs";
import * as M from "./advisorLlmAudit.mjs";
import * as T from "../../brain/needsTask.mjs";
import * as A from "../../brain/advisorChip.mjs";
import * as X from "../../brain/advisorTranscript.mjs";
import * as L from "./advisorLive.mjs";

let fails = 0, finished = false;
const died = (e) => { console.log("  FAIL  !! THE GATE THREW before it finished, which is a failure of whatever it was asking: " + String((e && e.stack) || e).split("\n").slice(0, 3).join(" | ").slice(0, 400)); process.exitCode = 1; };
process.on("uncaughtException", died); process.on("unhandledRejection", died);
process.on("exit", () => { if (!finished) { console.log("  FAIL  !! THE GATE ENDED BEFORE IT FINISHED"); process.exitCode = 1; } });
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const sec = (t) => console.log("\n" + t);
const J = JSON.stringify, throws = (f) => { try { f(); return false; } catch { return true; } };
const msgOf = (f) => { try { f(); return ""; } catch (e) { return e.message; } };
const recOnly = (dives, modelFn, id) => { const t = X.createTranscript({ model: { id, params: {} }, every: 600 }); for (const sc of dives) T.fly(A.advisedPilot(T.ruleSeat("obs"), X.llmSeat({ transcript: t, mode: "record", modelFn }), "VETO"), sc, { gauge: T.GAUGE }); return t; };

sec("1. THE REGISTERED CONSTANTS");
ok("!! the audits are the reserved seeds 171-182, 191-202, 211-222 (L1, L2, L3), four kinds each, 48 dives a set, the first dive of each set is its first seed (plain first); advisorLive still REFUSES those seeds", J(M.AUDIT_NAMES) === J(["L1", "L2", "L3"]) && J(M.AUDIT_SEEDS) === J([[171, 182], [191, 202], [211, 222]]) && [0, 1, 2].every((i) => M.auditSet(i).length === 48 && M.auditSet(i)[0].seed === M.AUDIT_SEEDS[i][0] && new Set(M.auditSet(i).map((d) => d.kind)).size === 4) && L.FORBIDDEN_SEEDS.has(171) && L.FORBIDDEN_SEEDS.has(222) && !L.FORBIDDEN_SEEDS.has(501));
ok("!! asked every 600 ticks, parse line 95 percent, the fixed caps 0.50 / 0.65 / 0.75, practice seeds 501-508 on far and both, the gauge is the survey run's noisy one, the call ceiling 6000", M.EVERY === 600 && M.MIN_PARSE === 0.95 && J(M.CONSTANT_CAPS) === J([0.5, 0.65, 0.75]) && M.PRACTICE_SEEDS === "501-508" && J(M.PRACTICE_KINDS) === J(["far", "both"]) && M.GAUGE === T.GAUGE && M.DEFAULT_MAX_CALLS === 6000);
ok("!! the arm names: CAP-0.50 / CAP-0.65 / CAP-0.75, RULE-GF and RULE-G, LM:<id>; the expected calls are 144 dives x 30 asks (600 s at 0.05 s a tick is 18,000 ticks, one ask per 600 ticks) = 4,320", J(M.FIXED_ARMS) === J(["CAP-0.50", "CAP-0.65", "CAP-0.75"]) && J(M.RULE_ARMS) === J(["RULE-GF", "RULE-G"]) && M.lmName("x-t0") === "LM:x-t0" && M.capName(0.5) === "CAP-0.50" && M.expectedCalls() === 4320 && M.expectedCalls([[1, 2], [3]]) === 90);

sec("2. THE ARMS");
{
    ok("!! ALONE is the brain GUARDED-OBS itself; an unknown arm and an LM arm without its transcript are refused; a constant advisor says only a cap", M.armFactory("ALONE") === T.GUARDED_OBS && throws(() => M.armFactory("NOPE")) && /needs its transcript/.test(msgOf(() => M.armFactory("LM:x"))) && J(M.constantSeat(0.65)()()) === J({ surface: false, station: null, cap: 0.65, pump: false, repair: false }));
    const pick = (kind) => M.auditSet(0).find((d) => d.kind === kind);
    const FB = [pick("far"), pick("both")], tiny = [FB, FB.map((d) => d), FB.map((d) => d)];
    const idc = M.identityChecks(); globalThis.__idc = idc;
    let call0 = 0; const only = (n) => () => { call0++; return { runs: [{ score: call0 === n ? 9 : 1, kind: "x" }], score: 1, crashed: 0 }; };
    const iso = [2, 3, 5].map((n) => { call0 = 0; return M.identityChecks({ ev: only(n) }); });
    ok("!! each identity clause fails the check ALONE: only the null advisor differing, only the 0.95 cap differing, only GUARDED-FILTER-by-itself differing each makes ok false and prints DIFFERENT exactly once, for that clause", iso.every((r) => !r.ok && (r.rows[0].text.match(/DIFFERENT/g) || []).length === 1) && /DIFFERENT: a null advisor/.test(iso[0].rows[0].text) && /DIFFERENT: a cap of 0\.95/.test(iso[1].rows[0].text) && /DIFFERENT: GUARDED-FILTER advised by itself/.test(iso[2].rows[0].text));
    ok("!! the identity checks hold on real flights: a null advisor in VETO is the brain, a cap of 0.95 changes nothing, GUARDED-FILTER advised by itself is itself (a deep and a both dive)", idc.ok && idc.rows.length === 1 && /\(2 dives: a deep and a both\)/.test(idc.rows[0].text) && /same: a null advisor/.test(idc.rows[0].text) && /same: a cap of 0.95/.test(idc.rows[0].text) && /same: GUARDED-FILTER advised by itself/.test(idc.rows[0].text));
    let call = 0; const stub = (f) => () => { call++; return { runs: [{ score: f(call), kind: "x" }], score: f(call), crashed: 0 }; };
    call = 0; const i1 = M.identityChecks({ ev: stub((c) => c) });
    call = 0; const i2 = M.identityChecks({ ev: stub(() => 1) });
    ok("!! an evaluator whose arms differ makes the identity check FAIL and names which (the text says DIFFERENT), and one whose arms agree passes", !i1.ok && /DIFFERENT/.test(i1.rows[0].text) && i2.ok && !/DIFFERENT/.test(i2.rows[0].text));
    const refOf = (factory) => T.evaluate(factory, [FB[1]], { gauge: M.GAUGE }).runs.map((r) => r.score), flown = (arm) => M.flyArm(arm, [FB[1]]).res.runs.map((r) => r.score);
    ok("!! each arm is the thing the registration names: the fixed caps are the VETO combination with the constant advisor, RULE-GF and RULE-G the VETO combination with the Round 4 advisors GUARDED-FILTER and GUARDED, ALONE the brain; the two rules differ from each other on these dives", J(flown("CAP-0.65")) === J(refOf(A.advisedPilot(T.ruleSeat("obs"), M.constantSeat(0.65), "VETO"))) && J(flown("CAP-0.75")) !== J(refOf(A.advisedPilot(T.ruleSeat("obs"), M.constantSeat(0.65), "VETO"))) && J(flown("CAP-0.65")) !== J(flown("ALONE")) && J(flown("RULE-GF")) === J(refOf(A.advisedPilot(T.ruleSeat("obs"), A.ADVISORS["GUARDED-FILTER"], "VETO"))) && J(flown("RULE-G")) === J(refOf(A.advisedPilot(T.ruleSeat("obs"), A.ADVISORS["GUARDED"], "VETO"))) && J(flown("RULE-GF")) !== J(flown("RULE-G")) && J(flown("ALONE")) === J(refOf(T.GUARDED_OBS)));
    const cap50 = M.flyArm("CAP-0.50", [FB[1]]);
    ok("!! a flown arm returns the evaluation, the override counts summed over its dives (the cap advice is taken: ticks counted, the cap override fires on a far or both dive) and no model stats for a non-model arm", cap50.res.runs.length === 1 && cap50.res.runs.every((r) => Number.isFinite(r.score)) && cap50.stats.ticks > 0 && cap50.stats.cap > 0 && Object.keys(cap50.model).length === 0);
    // a scripted model recorded over the tiny sets, with some replies invalid
    const scripted = (prompt) => { let h = 0; for (let i = 0; i < prompt.length; i++) h = (h * 31 + prompt.charCodeAt(i)) >>> 0; return h % 5 === 0 ? "I would rather not." : `{"surface": ${h % 7 === 0}, "station": ${h % 3}, "cap": ${[0.4, 0.6, 0.8, 1.2][h % 4]}, "pump": ${h % 11 === 0}, "repair": false}`; };
    globalThis.__tr = X.createTranscript({ model: { id: "m-t0", params: {} }, every: 600 });
    for (const set of tiny) for (const sc of set) T.fly((ctx) => A.advisedPilot(T.ruleSeat("obs"), X.llmSeat({ transcript: globalThis.__tr, mode: "record", modelFn: scripted }), "VETO")(ctx), sc, { gauge: M.GAUGE });
    const tr = globalThis.__tr, lm1 = M.flyArm("LM:m-t0", FB, { transcript: tr });
    ok("!! an LM arm replays the recorded advice (no model is called) and reports the model's own stats: asks, hits, invalid replies counted from the transcript's null decisions", lm1.model.asks > 0 && lm1.model.hits === lm1.model.asks && lm1.model.calls === 0 && lm1.model.invalid > 0 && lm1.model.invalid < lm1.model.asks && lm1.res.runs.length === 2);
    globalThis.__flown = M.flyAudits({ "m-t0": tr }, { sets: [[FB[0]], [FB[0]], [FB[0]]] });
    const mixedSets = M.flyAudits({}, { sets: [[FB[0]], [FB[1]], [FB[0], FB[1]]] });
    ok("!! each audit is flown on ITS OWN set (a far dive, a both dive, both): the kinds and the number of runs follow the sets given to each", mixedSets.L1.ALONE.res.runs[0].kind === "far" && mixedSets.L2.ALONE.res.runs[0].kind === "both" && mixedSets.L3.ALONE.res.runs.length === 2 && mixedSets.L2.ALONE.res.runs.length === 1);
    const fl = globalThis.__flown;
    ok("!! flyAudits flies every arm on every audit with the sets it is given (ALONE, three caps, two rules, one LM arm per model: 7 arms) and the same dives in each (the same kinds and scores per dive for ALONE in the three audits)", Object.keys(fl).join() === "L1,L2,L3" && Object.keys(fl.L1).join() === "ALONE,CAP-0.50,CAP-0.65,CAP-0.75,RULE-GF,RULE-G,LM:m-t0" && J(fl.L1.ALONE.res.runs.map((r) => r.score)) === J(fl.L2.ALONE.res.runs.map((r) => r.score)) && fl.L1.ALONE.res.runs.length === 1);
}

sec("3. THE CHECKS AND THE REPLY STATISTICS");
{
    const mk = (id, every, n, nulls, schema = X.PROMPT_SCHEMA) => { const t = X.createTranscript({ model: { id, params: {} }, every }); t.header.promptSchema = schema; for (let i = 0; i < n; i++) t.entries.set("k" + i, { key: "k" + i, prompt: "p" + i, reply: "{}", decision: i < nulls ? null : { surface: false, station: 0, cap: 0.6, pump: false, repair: false } }); return t; };
    const a = M.transcriptChecks("m-t0", mk("m-t0", 600, 20, 1)), b = M.transcriptChecks("m-t0", mk("m-t0", 600, 20, 2)), c = M.transcriptChecks("m-t0", mk("other", 600, 20, 0)), d = M.transcriptChecks("m-t0", mk("m-t0", 300, 20, 0)), e = M.transcriptChecks("m-t0", mk("m-t0", 600, 20, 0, 2)), z = M.transcriptChecks("m-t0", mk("m-t0", 600, 0, 0));
    ok("!! the transcript check: the header must name the model, every 600 and prompt schema 1; the parse rate is valid/all, and the line is inclusive (19 of 20 = 0.95 passes, 18 of 20 does not); an empty transcript has rate 0", a.headerOk && a.rate === 0.95 && a.parseOk && !b.parseOk && b.rate === 0.9 && !c.headerOk && !d.headerOk && !e.headerOk && z.rate === 0 && !z.parseOk && a.entries === 20 && a.valid === 19);
    const P = (time, flood, unvisited) => `SURVEY RUN\ntime ${time} s of 600. depth 10 m. charge gauge reads 0.5 (it is noisy). flooding ${flood}.\n` + "station 0: not visited, 100 m away\n".repeat(unvisited) + "station 9: VISITED, 5 m\n";
    const tr = X.createTranscript({ model: { id: "m-t0", params: {} }, every: 600 });
    const put = (i, prompt, reply) => tr.entries.set("k" + i, { key: "k" + i, prompt, reply, decision: null });
    put(0, P(100, 0, 2), '{"surface": true, "station": 0, "cap": 0.2, "pump": true, "repair": false}');
    put(1, P(400, 0.1, 2), '{"surface": true, "station": 0, "cap": 0.99, "pump": true, "repair": true}');
    put(2, P(100, 0, 0), '{"surface": true, "station": null, "cap": 0.7, "pump": false, "repair": false}');
    put(3, P(100, 0, 1), '{"surface": false, "station": 1, "cap": 0.5, "pump": false, "repair": false}');
    put(4, P(100, 0, 1), "no json here");
    const rs = M.replyStats(tr);
    ok("!! the reply statistics (reported): of 5 situations 4 parse; the cap is outside 0.5-0.95 in two (0.2 and 0.99, read from the RAW reply before the reader clamps it); surface is advised 3 times and EARLY (stations unvisited, before 300 s) once; the pump twice, once with flooding at 0; repair once", rs.n === 5 && rs.parsed === 4 && rs.capOut === 2 && rs.surface === 3 && rs.earlySurface === 1 && rs.pump === 2 && rs.pumpNoFlood === 1 && rs.repair === 1);
}

sec("4. THE VERDICTS (margin rule max(0.02, 2 se), paired)");
{
    // a fake flown audit: runs of 8 dives; scores built so the paired diffs and se are known
    const base = [0.2, 0.4, 0.6, 0.8, 0.2, 0.4, 0.6, 0.8];
    const arm = (add, jitter = 0) => ({ res: { score: base.reduce((s, x) => s + x + add, 0) / 8, runs: base.map((x, i) => ({ score: x + add + (i % 2 ? jitter : -jitter), kind: "far", crushed: false })), crashed: 0 } });
    const audits = (lm, caps = [0, 0.05, 0.02], gf = 0.05, g = 0.0) => Object.fromEntries(M.AUDIT_NAMES.map((n, i) => [n, { ALONE: arm(0), "CAP-0.50": arm(caps[0]), "CAP-0.65": arm(caps[1]), "CAP-0.75": arm(caps[2]), "RULE-GF": arm(gf), "RULE-G": arm(g), "LM:m-t0": arm(typeof lm === "function" ? lm(i) : lm) }]));
    const v1 = M.verdictFor(audits(0.2), "m-t0");
    ok("!! a model +0.20 above the brain, above the best cap (0.05) and the rules on all three audits: HELPS, BEATS A FIXED CAP, beats both rules, and the bottom line says it adds content and that it beats the rule GUARDED-FILTER and GUARDED", v1.effect === "HELPS" && v1.cap === "BEATS A FIXED CAP" && v1.beatsGF && v1.beatsG && /^ADDS CONTENT BEYOND A FIXED CAP \(and beats the rule GUARDED-FILTER, beats GUARDED\)$/.test(v1.bottom));
    const v2 = M.verdictFor(audits(0.04), "m-t0");
    ok("!! a model +0.04 above the brain but below the best cap (+0.05): HELPS (0.04 > 0.02), TIES the fixed cap (0.04 against 0.05: -0.01 inside the margin), so the bottom line is 'HELPS, BUT NO MORE THAN A FIXED CAP'; the strongest cap is the 0.65 one on every audit", v2.effect === "HELPS" && v2.cap === "TIES A FIXED CAP" && v2.bottom === "HELPS, BUT NO MORE THAN A FIXED CAP" && v2.rows.every((r) => r.strongestCap === "CAP-0.65"));
    const v3 = M.verdictFor(audits(-0.2), "m-t0"), v4 = M.verdictFor(audits(0.01), "m-t0"), v5 = M.verdictFor(audits((i) => (i === 0 ? 0.2 : -0.2)), "m-t0");
    ok("!! -0.20 below the brain on all three: HURTS, and it LOSES TO A FIXED CAP; +0.01 (inside the 0.02 line): NO EFFECT; helps on one audit and hurts on another: MIXED, bottom line 'NO CONSISTENT EFFECT (MIXED)'", v3.effect === "HURTS" && v3.cap === "LOSES TO A FIXED CAP" && v3.bottom === "HURTS" && v4.effect === "NO EFFECT" && v4.bottom === "NO EFFECT" && v5.effect === "MIXED" && v5.bottom === "NO CONSISTENT EFFECT (MIXED)");
    const v6 = M.verdictFor(audits(0.2, [0, 0.3, 0.02]), "m-t0"), v7 = M.verdictFor(audits(0.2, [0.3, 0, 0.02], 0.3, 0.3), "m-t0");
    ok("!! beating the STRONGEST cap is required: with a cap at +0.30 on every audit the +0.20 model LOSES to it (not 'adds content'); with the best cap differing by audit the strongest is taken per audit; with the rules at +0.30 it does not beat them and the bottom line says so", v6.cap === "LOSES TO A FIXED CAP" && v6.bottom === "HELPS, BUT NO MORE THAN A FIXED CAP" && M.verdictFor(audits(0.2, [0.1, 0.0, 0.0]), "m-t0").rows.every((r) => r.strongestCap === "CAP-0.50") && !v7.beatsGF && !v7.beatsG);
    // the boundary: the line is strict and the minimum edge is 0.02
    const edge = (d) => M.signOf({ diff: d, se: 0 }), edge2 = (d, se) => M.signOf({ diff: d, se });
    ok("!! the margin rule: with se 0 the line is 0.02 and strict (0.02 is a tie, 0.0201 wins, -0.0201 loses); with se 0.05 the line is 0.10 (0.09 ties, 0.11 wins)", edge(0.02) === 0 && edge(0.0201) === 1 && edge(-0.0201) === -1 && edge2(0.09, 0.05) === 0 && edge2(0.11, 0.05) === 1 && M.margin({ se: 0 }) === 0.02 && Math.abs(M.margin({ se: 0.05 }) - 0.1) < 1e-12);
    const audits2 = (lm, capFn, gfFn, gFn) => Object.fromEntries(M.AUDIT_NAMES.map((n, i) => [n, { ALONE: arm(0), "CAP-0.50": arm(capFn(i)), "CAP-0.65": arm(0), "CAP-0.75": arm(0), "RULE-GF": arm(gfFn(i)), "RULE-G": arm(gFn(i)), "LM:m-t0": arm(lm) }]));
    const w1 = M.verdictFor(audits2(0.2, (i) => (i === 0 ? 0 : 0.2), () => 0, () => 0), "m-t0"), w2 = M.verdictFor(audits2(0.2, (i) => (i === 0 ? 0.4 : 0), () => 0, () => 0), "m-t0"), w3 = M.verdictFor(audits2(0.2, () => 0, (i) => (i === 0 ? 0 : 0.2), () => 0.4), "m-t0"), w4 = M.verdictFor(audits2(0.2, () => 0, () => 0.4, (i) => (i === 0 ? 0 : 0.2)), "m-t0");
    ok("!! 'beats' and 'loses' need ALL THREE audits: a model that beats the strongest cap on one audit and ties it on two TIES it; one that loses to it on one audit and ties on two does not 'lose to a fixed cap'; likewise for the rules: beating RULE-GF on one audit of three is not beating it", w1.cap === "TIES A FIXED CAP" && w2.cap === "TIES A FIXED CAP" && !w3.beatsGF && !w3.beatsG && !w4.beatsGF && !w4.beatsG);
    const x1 = M.verdictFor(audits2(0.2, () => 0, () => 0.4, () => 0), "m-t0"), x2 = M.verdictFor(audits2(0.2, () => 0, () => 0, () => 0.4), "m-t0");
    ok("!! RULE-GF and RULE-G are told apart: a strong RULE-GF with a weak RULE-G is 'does not beat GF, beats G'; the reverse the other way; and the bottom line names which", !x1.beatsGF && x1.beatsG && x2.beatsGF && !x2.beatsG);
    const v8 = M.verdictFor(audits(0.2), "m-t0", { parseOk: false });
    ok("!! a model whose replies parse in under 95 percent is marked NOT WEIGHED whatever its numbers", v8.weighed === false && /^NOT WEIGHED/.test(v8.bottom) && v8.effect === "HELPS");
    const j = (jit) => M.verdictFor(audits(0.04, [0, 0, 0], 0.0, 0.0), "m-t0");
    const noisy = (() => { const a = audits(0.04, [0, 0, 0]); for (const n of M.AUDIT_NAMES) a[n]["LM:m-t0"] = arm(0.04, 0.4); return M.verdictFor(a, "m-t0"); })();
    ok("!! the paired standard error is used: +0.04 with a spread of +-0.4 across the dives is not a win (se large), the same +0.04 with no spread is", noisy.effect !== "HELPS" && j().effect === "HELPS");
}

sec("5. THE REPORT");
{
    const fl = globalThis.__flown, tr = globalThis.__tr, c = M.transcriptChecks("m-t0", tr);
    const model = { id: "m-t0", tr, verdict: M.verdictFor(fl, "m-t0", { parseOk: c.parseOk }), replies: M.replyStats(tr) };
    const lines = M.reportLines({ models: [model], audits: fl, idc: globalThis.__idc, checks: [{ name: "TRANSCRIPT m-t0", ok: true, text: "x" }, { name: "PARSE RATE m-t0", ok: true, text: "y" }] });
    ok("!! the report names the round, the reserved seeds and the brain; prints each check with [ok] or [FAILED]; the means and the crushed counts of every arm on the three audits; per model the strongest cap, the three comparisons with WINS / LOSES / tie, the overrides, the reply statistics, and the bottom line", /^LANGUAGE-MODEL CHIP \(Round 5\), noisy gauge: reserved seeds 171-182 191-202 211-222/.test(lines[0]) && lines.some((l) => /\[ok\]\s+IDENTITY/.test(l)) && lines.some((l) => /means \(L1 \| L2 \| L3\): ALONE .*CAP-0\.50 .*RULE-GF .*LM:m-t0/.test(l)) && lines.some((l) => /crushed dives \(L1 \| L2 \| L3\): ALONE/.test(l)) && lines.some((l) => /--- model m-t0/.test(l)) && lines.some((l) => /strongest fixed cap per audit: CAP-0\.\d\d \| CAP-0\.\d\d \| CAP-0\.\d\d/.test(l)) && lines.some((l) => /effect against ALONE: .*\(needs .*(WINS|LOSES|tie)\)/.test(l)) && lines.some((l) => /against RULE-GF: .* against RULE-G: /.test(l)) && lines.some((l) => /overrides of the brain \(ticks, summed over the three audits\): surface \d+, station \d+, cap \d+, pump \d+, repair \d+/.test(l)) && lines.some((l) => /replies \(reported\): \d+ situations/.test(l)) && /^ADVISOR BOTTOM LINE \(m-t0\): /.test(lines[lines.length - 1]));
    const fk = (gfAdd, crush) => Object.fromEntries(M.AUDIT_NAMES.map((n) => [n, Object.fromEntries(["ALONE", ...M.FIXED_ARMS, ...M.RULE_ARMS, "LM:m-t0"].map((a) => [a, { res: { score: a === "RULE-GF" ? 0.5 + gfAdd : 0.5, runs: [{ score: a === "RULE-GF" ? 0.5 + gfAdd : 0.5, kind: "far" }, { score: a === "RULE-GF" ? 0.5 + gfAdd : 0.5, kind: "both" }], crashed: crush[a] }, stats: {}, model: {} }]))]));
    const crush = { ALONE: 3, "CAP-0.50": 1, "CAP-0.65": 4, "CAP-0.75": 5, "RULE-GF": 6, "RULE-G": 7, "LM:m-t0": 2 }, okLines = M.reportLines({ models: [model], audits: fk(0.3, crush), idc: globalThis.__idc, checks: [] }), badLines = M.reportLines({ models: [model], audits: fk(0.0, crush), idc: globalThis.__idc, checks: [] });
    ok("!! the crushed line gives each arm's own count on each audit (ALONE 3/3/3, CAP-0.50 1/1/1, ... RULE-G 7/7/7, LM 2/2/2), not a score", okLines.some((l) => /crushed dives \(L1 \| L2 \| L3\): ALONE 3\/3\/3; CAP-0\.50 1\/1\/1; CAP-0\.65 4\/4\/4; CAP-0\.75 5\/5\/5; RULE-GF 6\/6\/6; RULE-G 7\/7\/7; LM:m-t0 2\/2\/2/.test(l)));
    ok("!! THE RULE IS NOT TRIVIAL is checked on far and both: RULE-GF 0.3 above ALONE passes ([ok]); RULE-GF equal to ALONE FAILS ([FAILED]) and the report then says the verdicts are NOT weighed", okLines.some((l) => /\[ok\]\s+THE RULE IS NOT TRIVIAL/.test(l)) && !okLines.some((l) => /A CHECK FAILED/.test(l)) && badLines.some((l) => /\[FAILED\]\s+THE RULE IS NOT TRIVIAL/.test(l)) && badLines.some((l) => /A CHECK FAILED/.test(l)));
    const bad = M.reportLines({ models: [model], audits: fl, idc: { ok: false, rows: [{ name: "IDENTITY", ok: false, text: "DIFFERENT" }] }, checks: [] });
    ok("!! a failed check is the first line of the report after the header ([FAILED]), says the verdicts are NOT weighed, and the bottom line reads NOT WEIGHED (a check failed)", bad.some((l) => /\[FAILED\]\s+IDENTITY/.test(l)) && bad.some((l) => /A CHECK FAILED: the verdicts below are printed and NOT weighed/.test(l)) && /NOT WEIGHED \(a check failed\)$/.test(bad[bad.length - 1]));
}

sec("6. THE PRACTICE GATE");
{
    const dives = L.divesOf(M.PRACTICE_KINDS, L.parseSeeds(M.PRACTICE_SEEDS));
    const good = (prompt) => `{"surface": false, "station": 0, "cap": 0.7, "pump": false, "repair": false}`;
    const ptr = recOnly(dives, good, "m-t0"), text = X.serialize(ptr);
    const withHeader = (f) => { const t = X.parseTranscript(text); f(t); return X.serialize(t); };
    const g = M.practiceGate("m-t0", text);
    ok("!! a practice transcript of the same configuration (named, every 600, covering the 16 practice dives, every reply parsing) passes and reports its rate", g.rate === 1 && g.headerOk && g.parseOk && g.entries === ptr.entries.size && g.entries > 20);
    ok("!! the model id must end in -t0; a transcript of another model, of another every, or of an unreadable file is refused with the reason", /must end in -t0/.test(msgOf(() => M.practiceGate("m", text))) && /not this model's configuration/.test(msgOf(() => M.practiceGate("other-t0", text))) && /not this model's configuration/.test(msgOf(() => M.practiceGate("m-t0", withHeader((t) => { t.header.every = 300; })))) && /does not read/.test(msgOf(() => M.practiceGate("m-t0", "not json"))));
    const mostlyBad = withHeader((t) => { let i = 0; for (const e of t.entries.values()) if (i++ % 4 === 0) e.decision = null; });
    ok("!! a practice transcript whose replies parse in under 95 percent is refused and the model is EXCLUDED (25 percent invalid here)", /EXCLUDED/.test(msgOf(() => M.practiceGate("m-t0", mostlyBad))) && /75\.\d percent/.test(msgOf(() => M.practiceGate("m-t0", mostlyBad))));
    const partial = withHeader((t) => { const keep = [...t.entries.keys()].slice(0, 5); for (const k of [...t.entries.keys()]) if (!keep.includes(k)) t.entries.delete(k); });
    ok("!! a practice transcript that does not hold every situation of the practice dives (a replay would miss) is refused with the coverage reason", /does not cover the practice dives/.test(msgOf(() => M.practiceGate("m-t0", partial))));
    const short = X.serialize(recOnly(L.divesOf(M.PRACTICE_KINDS, L.parseSeeds("501-502")), good, "m-t0"));
    ok("!! the default practice dives are seeds 501-508 on far and both: a transcript that covers only 501-502 is refused by the default gate (and accepted when the gate is told those are the dives)", /does not cover the practice dives/.test(msgOf(() => M.practiceGate("m-t0", short))) && M.practiceGate("m-t0", short, { dives: L.divesOf(M.PRACTICE_KINDS, L.parseSeeds("501-502")) }).headerOk);
    ok("!! an unreadable practice transcript is refused WITH the underlying reason (not just 'does not read')", /does not read \(.+\)/.test(msgOf(() => M.practiceGate("m-t0", "not json"))));
    globalThis.__practice = text;
}

sec("7. THE COMMANDS");
{
    const logs = [], errs = [], files = new Map();
    const pick = (kind) => M.auditSet(0).find((d) => d.kind === kind), FB = [pick("far"), pick("both")], tiny = [[FB[1]], [FB[1]], [FB[1]]];
    const io = (extra = {}) => ({ out: (m) => logs.push(m), err: (m) => errs.push(m), readFile: (f) => { if (!files.has(f)) throw new Error("ENOENT " + f); return files.get(f); }, writeFile: (f, t) => files.set(f, t), appendFile: (f, t) => files.set(f, (files.get(f) || "") + t), exists: (f) => files.has(f), sets: tiny, practiceDives: PD, identity: () => globalThis.__idc, ...extra });
    const PD = L.divesOf(["far", "both"], [501]), pt = recOnly(PD, () => '{"surface": false, "station": 0, "cap": 0.7, "pump": false, "repair": false}', "m-t0");
    files.set("practice.jsonl", X.serialize(pt));
    const args = ["record", "--model-id", "m-t0", "--cmd", "x", "--practice", "practice.jsonl", "--out", "rec.jsonl"];
    ok("!! arguments: the first word is record or report; record needs --model-id, --cmd, --practice and --out; an unknown option, a missing value and a bad --max-calls are refused; report needs --in and splits it on commas", throws(() => M.parseArgs([])) && throws(() => M.parseArgs(["x"])) && ["--model-id", "--cmd", "--practice", "--out"].every((k) => throws(() => M.parseArgs(args.filter((_, i, a) => a[i] !== k && a[i - 1] !== k)))) && throws(() => M.parseArgs([...args, "--bogus", "1"])) && throws(() => M.parseArgs([...args, "--max-calls"])) && throws(() => M.parseArgs([...args, "--max-calls", "0"])) && /report needs --in/.test(msgOf(() => M.parseArgs(["report"]))) && J(M.parseArgs(["report", "--in", "a, b"]).files) === J(["a", "b"]) && M.parseArgs(args).maxCalls === 6000);
    let asked = 0; const model = (prompt) => { asked++; return `{"surface": false, "station": ${asked % 3}, "cap": 0.7, "pump": false, "repair": false}`; };
    const dry = await M.command([...args, "--dry-run"], io({ makeModelFn: () => model }));
    ok("!! record --dry-run passes the practice gate, prints the dives and the call count with the ceiling, and calls nothing (no calls file, no output)", dry === 0 && asked === 0 && !files.has("rec.jsonl") && !files.has("rec.jsonl.calls.jsonl") && logs.some((l) => /practice gate passed: 100\.0 percent/.test(l)) && logs.some((l) => /L1 171-182, L2 191-202, L3 211-222: 3 dives, the model is asked every 600 ticks: at most 90 calls/.test(l)) && logs.some((l) => /--dry-run: nothing was called/.test(l)));
    logs.length = 0; errs.length = 0;
    const noPractice = await M.command([...args.slice(0, 5), "--practice", "missing.jsonl", "--out", "r2.jsonl"], io({ makeModelFn: () => model })), badId = await M.command(["record", "--model-id", "m", "--cmd", "x", "--practice", "practice.jsonl", "--out", "r3.jsonl"], io({ makeModelFn: () => model }));
    ok("!! record refuses, calling nothing and writing nothing, when the practice transcript cannot be read or the model id is not a -t0 id", noPractice === 1 && /cannot read the practice transcript/.test(errs[0]) && badId === 1 && /must end in -t0/.test(errs[1]) && asked === 0 && !files.has("r2.jsonl") && !files.has("r3.jsonl"));
    errs.length = 0; logs.length = 0;
    let n = 0; const flaky = (prompt) => { if (++n > 5) throw new Error("model died"); return model(prompt); };
    const c1 = await M.command(args, io({ makeModelFn: () => flaky }));
    ok("!! a model that dies part-way stops the record with exit 1, every paid answer is already in the calls file, the output is NOT written, and the message says to run the same command again", c1 === 1 && !files.has("rec.jsonl") && files.get("rec.jsonl.calls.jsonl").split("\n").filter(Boolean).length === 5 && /5 answers are saved in rec\.jsonl\.calls\.jsonl; run the same command again to resume/.test(errs[0]));
    errs.length = 0; logs.length = 0; asked = 0;
    const c2 = await M.command(args, io({ makeModelFn: () => model }));
    ok("!! the same command again resumes from the calls file (the first 5 prompts are not asked again), writes the recording, and the recording holds every situation of the dives", c2 === 0 && files.has("rec.jsonl") && logs.some((l) => /resuming: 5 answers already paid for/.test(l)) && logs.some((l) => /recorded \d+ situations \(\d+ model calls, [5-9]\d* repeated or resumed\)/.test(l)) && X.parseTranscript(files.get("rec.jsonl")).entries.size === files.get("rec.jsonl.calls.jsonl").split("\n").filter(Boolean).length);
    // the recording is flown in VETO under the survey run's noisy gauge: a fresh recording equals one made directly
    let k1 = 0, k2 = 0; const seqModel = (c) => () => { c.n++; return `{"surface": false, "station": ${c.n % 3}, "cap": 0.7, "pump": false, "repair": false}`; };
    const refTr = X.createTranscript({ model: { id: "m-t0", params: {} }, every: 600 }), cA = { n: 0 };
    for (const set of tiny) for (const sc of set) T.fly((ctx) => A.advisedPilot(T.ruleSeat("obs"), X.llmSeat({ transcript: refTr, mode: "record", modelFn: seqModel(cA) }), "VETO")(ctx), sc, { gauge: M.GAUGE });
    const cB = { n: 0 }, cmdR = await M.command(["record", "--model-id", "m-t0", "--cmd", "x", "--practice", "practice.jsonl", "--out", "rec3.jsonl"], io({ makeModelFn: () => seqModel(cB) }));
    const got = X.parseTranscript(files.get("rec3.jsonl"));
    ok("!! the recording the command makes IS the VETO recording under the noisy gauge: the same model sequence recorded directly (VETO, the survey gauge) holds exactly the same situations and replies, and replays under VETO with no miss", cmdR === 0 && J([...got.entries.keys()].sort()) === J([...refTr.entries.keys()].sort()) && J([...got.entries.values()].map((e) => e.reply).sort()) === J([...refTr.entries.values()].map((e) => e.reply).sort()) && (() => { try { M.flyArm("LM:m-t0", tiny[0], { transcript: got }); return true; } catch { return false; } })());
    errs.length = 0; const before = files.get("rec.jsonl"), c3 = await M.command(args, io({ makeModelFn: () => model }));
    ok("!! an existing recording is never overwritten or extended: exit 1 and the file is unchanged", c3 === 1 && /already exists; a recording is never overwritten or extended/.test(errs[0]) && files.get("rec.jsonl") === before);
    errs.length = 0; files.delete("rec2.jsonl"); files.delete("rec2.jsonl.calls.jsonl"); const c4 = await M.command(["record", "--model-id", "m-t0", "--cmd", "x", "--practice", "practice.jsonl", "--out", "rec2.jsonl", "--max-calls", "3"], io({ makeModelFn: () => model }));
    ok("!! the call ceiling stops a run (3 here): exit 1, no recording, and the saved answers are kept for a resume", c4 === 1 && !files.has("rec2.jsonl") && /the call budget of 3 is spent/.test(errs[0]) && files.get("rec2.jsonl.calls.jsonl").split("\n").filter(Boolean).length === 3);
    // report with a stub evaluator
    // a stub evaluator that does not fly: it builds each pilot (so the transcripts are consulted) and scores RULE-GF (the 5th arm of every audit) 0.3 above the rest, so the rule check passes
    const mkStub = (models) => { let c = 0; return (factory, set) => { const bonus = c++ % (6 + models) === 4 ? 0.3 : 0; const runs = set.map((sc, i) => { factory({ scenario: sc }); return { kind: sc.kind, score: 0.5 + 0.01 * i + bonus, crushed: false, stranded: false }; }); return { runs, score: runs.reduce((s, r) => s + r.score, 0) / runs.length, crashed: 0, stranded: 0 }; }; }, stubEv = mkStub(1);
    logs.length = 0; errs.length = 0;
    const r1 = await M.command(["report", "--in", "rec.jsonl"], io({ ev: mkStub(1) }));
    ok("!! report on a recording prints the report with the model id from the recording's own header, exit 0", r1 === 0 && logs[0].startsWith("LANGUAGE-MODEL CHIP (Round 5)") && logs.some((l) => /--- model m-t0/.test(l)) && logs.some((l) => /\[ok\]\s+TRANSCRIPT m-t0/.test(l)) && logs.some((l) => /\[ok\]\s+PARSE RATE m-t0: 100\.0 percent/.test(l)));
    const pt2 = recOnly(PD, () => '{"surface": false, "station": 0, "cap": 0.7, "pump": false, "repair": false}', "m2-t0"); files.set("practice2.jsonl", X.serialize(pt2));
    let z = 0; const spotty = () => () => (++z % 3 === 0 ? "I cannot." : '{"surface": false, "station": 1, "cap": 0.7, "pump": false, "repair": false}');
    const cs = await M.command(["record", "--model-id", "m2-t0", "--cmd", "x", "--practice", "practice2.jsonl", "--out", "rec4.jsonl"], io({ makeModelFn: spotty })); logs.length = 0; errs.length = 0;
    const r5 = await M.command(["report", "--in", "rec4.jsonl"], io({ ev: mkStub(1) }));
    ok("!! a recording whose replies parse in under 95 percent: the report prints [FAILED] PARSE RATE with the rate, says the verdicts are NOT weighed, and the model's own bottom line is NOT WEIGHED", cs === 0 && r5 === 0 && logs.some((l) => /\[FAILED\]\s+PARSE RATE m2-t0: [5-7]\d\.\d percent/.test(l)) && !logs.some((l) => /^  A CHECK FAILED/.test(l)) && logs.some((l) => /A CHECK OF THIS MODEL FAILED \(PARSE RATE m2-t0\): its verdicts are NOT weighed/.test(l)) && /NOT WEIGHED/.test(logs[logs.length - 1]));
    logs.length = 0; const r6 = await M.command(["report", "--in", "rec.jsonl,rec4.jsonl"], io({ ev: mkStub(2) })), bl = logs.filter((l) => /^ADVISOR BOTTOM LINE/.test(l));
    ok("!! with two recordings, one model whose replies parse badly is NOT WEIGHED and the other keeps its real verdict (a model's own check weighs against that model only); the report does not claim a global failure", r6 === 0 && bl.length === 2 && !/NOT WEIGHED/.test(bl[0]) && /^ADVISOR BOTTOM LINE \(m-t0\): /.test(bl[0]) && /^ADVISOR BOTTOM LINE \(m2-t0\): NOT WEIGHED/.test(bl[1]) && !logs.some((l) => /^  A CHECK FAILED/.test(l)));
    files.set("dup.jsonl", files.get("rec.jsonl")); logs.length = 0; errs.length = 0;
    const r2 = await M.command(["report", "--in", "rec.jsonl,dup.jsonl"], io({ ev: stubEv })), r3 = await M.command(["report", "--in", "nope.jsonl"], io({ ev: stubEv })), r4 = await M.command(["report", "--in", "practice.jsonl"], io({ ev: stubEv }));
    ok("!! report refuses two recordings of one model (one recording per model), an unreadable file, and a transcript missing situations of the audit dives (the practice transcript is not an audit recording) with the reason", r2 === 1 && /two transcripts for m-t0/.test(errs[0]) && r3 === 1 && /nope\.jsonl/.test(errs[1]));
    ok("!! a recording that lacks situations of the audit dives is refused by the REPORT with the transcript-miss reason (a replay never invents an answer), flown (a real evaluator, one far dive an audit) on audit dives the practice transcript never saw", await (async () => { errs.length = 0; const code = await M.command(["report", "--in", "practice.jsonl"], io({ sets: [[FB[0]], [FB[0]], [FB[0]]] })); return code === 1 && /advisorLlmAudit: .*never invents.*a recording must hold every situation of the audit dives/.test(errs[0] || ""); })());
}

sec("8. THE SOURCE");
{
    const src = fs.readFileSync(new URL("./advisorLlmAudit.mjs", import.meta.url), "utf8"), code = src.split("\n").filter((l) => !l.trim().startsWith("//")).join("\n");
    ok("!! no Math.random and no clock anywhere (every number comes from the dives and the recording), and the library never imports a trainer", !/Math\.random|Date\.now|new Date|performance\.now/.test(code) && !/trainSub|trainNeeds|pilotSub/.test(code.replace(/trainSubCircuits/g, "")));
    ok("!! it flies the reserved seeds only through its own sets: it never passes them to advisorLive's divesOf (which refuses them), and it takes the seeds from advisorChip's RESERVED_LLM", !/L\.divesOf\(M\.AUDIT|divesOf\(.*AUDIT_SEEDS/.test(code) && /A\.RESERVED_LLM/.test(code));
    const cmd = fs.readFileSync(new URL("./advisorLlmAuditCmd.mjs", import.meta.url), "utf8");
    ok("!! the command file imports command from the library, sets the exit code from it, and has no exports", /import \{ command \} from "\.\/advisorLlmAudit\.mjs"/.test(cmd) && /process\.exitCode = await command\(process\.argv\.slice\(2\)\)/.test(cmd) && !/^export /m.test(cmd));
}

console.log(fails ? `\n${fails} FAIL` : "\nall checks pass");
finished = true;
process.exitCode = fails ? 1 : 0;
