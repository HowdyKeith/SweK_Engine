// WebGLEngine/tools/ship/needsHead-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node tools/ship/needsHead-selfcheck.mjs      (about 40 s: hand fixtures and one short real audit)
//
// THE GATE OF tools/ship/needsHead.mjs (Round H3 of brain/HEAD_TO_HEAD.md, registered first).
//   1 SETS      the sixteen arms in order, the twelve circuits, the three real wirings, the four kinds, seeds 15001-15060 (240 dives), none of the seeds of the Rounds' sets; boardOf's controls and refusals.
//   2 READINGS  a circuit's three readings (vs rule-obs, vs rule-low06, vs twin-low06) at 1.5 and 2.5 se; the family comparison (real against shuffled, Welch on the means).
//   3 LINES     the five bottom lines in all their cases.
//   4 CHECKS    sizes, dives aligned, rules distinct, scores in [0, 1], reproduction; a failed check says NOT WEIGHED.
//   5 REPORT    the means table, the per-kind line, the per-circuit blocks, the seat-minus-rule line, the lines last.
//   6 FLIGHT    one real short audit (seeds 15001-15002, far and both, 200 s): every arm flies, rule-obs is T.GUARDED_OBS, a circuit is its recorded weights through trainNeedsCircuit's policy, the step is first-order.
//   7 SOURCE    the first-order import is first; the seeds appear once; no clock, random or file.
// NOT CHECKED, said plainly: which arm is best (that is the experiment).
// SABOTAGE LOG (46 mutants of tools/ship/needsHead.mjs, each alone in its own worktree copy): 40 went red by name on the first pass, 1 pattern was not found and was rewritten. 5 went 0 red and got rows, then red: the circuits' reading against rule-r8 instead of rule-obs (the fixture had rule-r8 equal to rule-obs), line 2 built from the start's readings, the family test without the controls' spread, the hull line's rule (the pattern).
//   ONE DECLARED EQUIVALENT: "check finite" (dropping Number.isFinite from the score check): NaN fails `r.score >= 0` anyway, so the range test alone catches it.
"use strict";
import fs from "node:fs";
let fails = 0, finished = false;
const died = (e) => { console.log("  FAIL  !! THE GATE THREW before it finished: " + String((e && e.stack) || e).split("\n").slice(0, 3).join(" | ").slice(0, 400)); process.exitCode = 1; };
process.on("uncaughtException", died); process.on("unhandledRejection", died);
process.on("exit", () => { if (!finished) { console.log("  FAIL  !! THE GATE ENDED BEFORE IT FINISHED"); process.exitCode = 1; } });
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const sec = (t) => console.log("\n" + t);
const J = JSON.stringify, near = (a, b, t = 1e-9) => Math.abs(a - b) < t;
import * as X from "./needsHead.mjs";
import * as T from "../../brain/needsTask.mjs";
import * as B from "../../brain/switchboard.mjs";
import * as C from "./trainNeedsCircuit.mjs";
import * as R from "../../physics/mechanics/rigidBody6dof.mjs";
const thr = (f) => { try { f(); return ""; } catch (e) { return String(e.message); } };
const raw = fs.readFileSync(new URL("./needsHead.mjs", import.meta.url), "utf8"), code = raw.split("\n").filter((l) => !/^\s*\/\//.test(l)).join("\n");
const eng = new URL("../../", import.meta.url);
const records = fs.readFileSync(new URL("brain/rig-results/needsCircuitStageA.rerun-amendment3.jsonl", eng), "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
const circuit = C.loadCircuit();
console.log("needsHead-selfcheck -- Round H3\n");

sec("1. SETS");
{
    ok("!! sixteen arms in order: the four rules (rule-obs, rule-r8, rule-low06, twin-low06) then circ-cx, circ-nostate, circ-withheld, circ-er0..2, circ-layer0..2, circ-degree0..2; the lists are frozen", J(X.ARM_IDS) === J(["rule-obs", "rule-r8", "rule-low06", "twin-low06", "circ-cx", "circ-nostate", "circ-withheld", "circ-er0", "circ-er1", "circ-er2", "circ-layer0", "circ-layer1", "circ-layer2", "circ-degree0", "circ-degree1", "circ-degree2"]) && X.CIRCUITS.length === 12 && J(X.REAL) === '["cx","nostate","withheld"]' && Object.isFrozen(X.ARM_IDS) && Object.isFrozen(X.CIRCUITS) && Object.isFrozen(X.RANGE) && Object.isFrozen(X.KINDS));
    ok("!! seeds 15001-15060 of plain, deep, far and both: 240 dives an arm; no seed of an earlier round's set (Rounds 8-33 used up to 14950; the circuits' searches 61000 and up)", X.RANGE.from === 15001 && X.RANGE.to === 15060 && J(X.KINDS) === '["plain","deep","far","both"]' && X.PER_ARM === 240 && (X.RANGE.to - X.RANGE.from + 1) * X.KINDS.length === X.PER_ARM && X.RANGE.from > 14950);
    const b = X.boardOf(circuit, records), a = (id) => b.arms.get(id);
    ok("!! the controls: rule-obs and rule-r8 none, rule-low06 held to rule-r8, the twin to rule-low06, every circuit to rule-obs, rule-low06 and the twin", a("rule-obs").controls.length === 0 && a("rule-r8").controls.length === 0 && J(a("rule-low06").controls) === '["rule-r8"]' && J(a("twin-low06").controls) === '["rule-low06"]' && X.CIRCUITS.every((s) => J(a("circ-" + s.replace(":", "")).controls) === '["rule-obs","rule-low06","twin-low06"]') && b.tasks.has("survey") && [...b.arms.values()].every((x) => x.layer === "decision"));
    const no = records.filter((r) => r.spec !== "cx"), bad = records.map((r) => (r.spec === "er:1" ? { ...r, weights: r.weights.slice(1) } : r)), none = records.map((r) => (r.spec === "layer:0" ? { ...r, weights: undefined } : r));
    ok("!! boardOf refuses a missing record, weights of another count than the policy's and a record with no weights, naming the circuit", /the record of cx is missing/.test(thr(() => X.boardOf(circuit, no))) && /er:1 has \d+ recorded weights and its policy takes \d+/.test(thr(() => X.boardOf(circuit, bad))) && /the record of layer:0 is missing/.test(thr(() => X.boardOf(circuit, none))) && /the record of cx is missing/.test(thr(() => X.boardOf(circuit, null))));
}
// a synthetic audit: n dives, per arm a score list
const N = 40, base = Array.from({ length: N }, (_, i) => 0.6 + 0.02 * Math.sin(i));
const wob = (i, a) => (i % 2 ? a : -a);
const mkAu = (spec = {}, n = N, kinds = ["far", "both"]) => {
    const au = { runs: {}, range: { from: 1, to: n / kinds.length }, kinds, seconds: null };
    X.ARM_IDS.forEach((a, k) => { const f = (spec[a] && spec[a].f) || (() => 0), lost = (spec[a] && spec[a].lost) || 0; au.runs[a] = Array.from({ length: n }, (_, i) => ({ key: `${kinds[i % kinds.length]}:${Math.floor(i / kinds.length) + 1}`, score: base[i % N] + f(i) + (a === "rule-obs" ? 0 : (i % 2 ? 1 : -1) * 0.0001 * k), bad: i < lost })); });
    return au;
};
sec("2. READINGS");
{
    const au = mkAu({ "circ-cx": { f: (i) => 0.1 + wob(i, 0.02) }, "circ-er0": { f: (i) => -0.1 + wob(i, 0.02) }, "twin-low06": { f: (i) => 0.05 + wob(i, 0.01) }, "rule-low06": { f: (i) => 0.02 + wob(i, 0.01) } });
    const c = X.readingsOf(au, "cx"), e = X.readingsOf(au, "er:0");
    ok("!! a circuit 0.1 above the start, the rule and the twin: vs rule-obs BETTER (+0.1), vs rule-low06 BETTER (+0.08), vs twin BETTER (+0.05); its mean and bad count carried", c.vsObs.reading === "BETTER" && near(c.vsObs.mean, 0.1, 1e-3) && c.vsRule.reading === "BETTER" && near(c.vsRule.mean, 0.08, 1e-3) && c.vsTwin.reading === "BETTER" && near(c.vsTwin.mean, 0.05, 1e-3) && c.id === "circ-cx" && c.bad === 0 && near(c.mean, X.scoreMean(au.runs["circ-cx"])));
    ok("!! a circuit 0.1 below: WORSE against all three; the arms the readings use are the NAMED ones (vs the rule is rule-low06 and not rule-r8: raise rule-r8 by 0.3 and nothing moves)", e.vsObs.reading === "WORSE" && e.vsRule.reading === "WORSE" && e.vsTwin.reading === "WORSE" && (() => { const au2 = mkAu({ "circ-cx": { f: (i) => 0.1 + wob(i, 0.02) }, "rule-r8": { f: () => 0.3 } }); const x = X.readingsOf(au2, "cx"), y = X.readingsOf(mkAu({ "circ-cx": { f: (i) => 0.1 + wob(i, 0.02) } }), "cx"); return near(x.vsRule.mean, y.vsRule.mean, 1e-12); })());
    const amp = 0.03, se = amp * Math.sqrt(N / (N - 1)) / Math.sqrt(N), g = (k) => X.readingsOf(mkAu({ "circ-cx": { f: (i) => wob(i, amp) + k * se } }), "cx").vsObs.reading;
    ok("!! 2 se on both sides against the start: +2.5 se BETTER, +1.5 se TIES, -1.5 se TIES, -2.5 se WORSE", g(2.5) === "BETTER" && g(1.5) === "TIES" && g(-1.5) === "TIES" && g(-2.5) === "WORSE");
    const fam = X.familyOf(mkAu({ "circ-cx": { f: () => 0.1 }, "circ-nostate": { f: () => 0.12 }, "circ-withheld": { f: () => 0.08 } }));
    ok("!! the family comparison: three real wirings at +0.1 on average against nine controls level: the means, the difference +0.1, the Welch se (real sd 0.02 over 3, controls tiny), ABOVE (0.1 > 2 se)", near(fam.diff, 0.1, 2e-3) && fam.above === true && near(fam.real - fam.ctrl, fam.diff, 1e-12) && near(fam.se, Math.sqrt(0.0004 / 3 + 0 / 9), 2e-3));
    const f2 = X.familyOf(mkAu({ "circ-cx": { f: () => 0.1 }, "circ-nostate": { f: () => -0.1 }, "circ-withheld": { f: () => 0.0 }, "circ-er0": { f: () => 0.1 }, "circ-layer1": { f: () => -0.1 } })), f3 = X.familyOf(mkAu({ "circ-cx": { f: () => -0.1 }, "circ-nostate": { f: () => -0.1 }, "circ-withheld": { f: () => -0.1 } }));
    ok("!! a real family that is noisy is NOT ABOVE even at a positive difference (sd 0.1 over three), and a real family BELOW the controls is NOT ABOVE with a negative difference", f2.above === false && f3.above === false && f3.diff < 0);
}
sec("3. LINES");
{
    const up = (names, d = 0.1) => Object.fromEntries(names.map((n) => ["circ-" + n.replace(":", ""), { f: (i) => d + wob(i, 0.02) }]));
    const a = X.bottomLines(mkAu(up(["cx", "er:0"])));
    ok("!! two circuits above the start and the rule: lines 1 and 2 name them in order; line 3 names the best circuit with its mean and says it BEATS the twin; the family line reports the means", a[0] === "2 OF 12 CIRCUITS BEAT THEIR START (RULE-OBS) (cx, er:0)" && a[1] === "2 OF 12 CIRCUITS BEAT THE TUNED RULE AT THE SEAT'S CONSTANTS (cx, er:0)" && /^THE BEST CIRCUIT \((cx|er:0), 0\.[0-9]{4}\) BEATS THE TWIN SEAT \(\+0\.1[0-9]{3}\)$/.test(a[2]) && /^THE REAL WIRINGS AVERAGE 0\.[0-9]{4} AND THE SHUFFLED CONTROLS 0\.[0-9]{4}: /.test(a[3]));
    const n0 = X.bottomLines(mkAu({}));
    ok("!! none beats anything: 0 OF 12 with (none); the best circuit TIES the twin; the family is NOT ABOVE", n0[0] === "0 OF 12 CIRCUITS BEAT THEIR START (RULE-OBS) (none)" && n0[1] === "0 OF 12 CIRCUITS BEAT THE TUNED RULE AT THE SEAT'S CONSTANTS (none)" && /TIES THE TWIN SEAT/.test(n0[2]) && /: NOT ABOVE \(/.test(n0[3]));
    const bl = X.bottomLines(mkAu({ "circ-cx": { f: (i) => -0.1 + wob(i, 0.02) }, "circ-er1": { f: (i) => 0.1 + wob(i, 0.02) } }));
    ok("!! a circuit below its start and the rule is named after the semicolon in lines 1 and 2: '; cx ARE BELOW IT'; the best circuit below the twin says IS BELOW when every circuit is poorer", bl[0] === "1 OF 12 CIRCUITS BEAT THEIR START (RULE-OBS) (er:1); cx ARE BELOW IT" && bl[1] === "1 OF 12 CIRCUITS BEAT THE TUNED RULE AT THE SEAT'S CONSTANTS (er:1); cx ARE BELOW IT" && /IS BELOW THE TWIN SEAT/.test(X.bottomLines(mkAu({ "twin-low06": { f: () => 0.3 } }))[2]));
    const h = X.bottomLines(mkAu({ "rule-low06": { lost: 3 }, "twin-low06": { lost: 1 }, "circ-cx": { lost: 2 }, "circ-er0": { lost: 5 } }))[4];
    ok("!! the hull line counts the rule's, the twin's and the circuits' bad dives (3, 1, circuits 7 with 5 in the worst)", h === "HULL: crushed or stranded dives: rule-low06 3, twin 1, circuits 7 (5 in the worst)");
}
{
    const r = X.bottomLines(mkAu({ "circ-cx": { f: (i) => 0.1 + wob(i, 0.02) }, "rule-r8": { f: () => 0.3 }, "rule-low06": { f: () => 0.2 } }));
    ok("!! the start and the rule are different arms: with rule-low06 raised by 0.2 and rule-r8 by 0.3 (rule-obs left), cx is +0.1 over its start (line 1 names it) and BELOW the rule (line 2 says 0 OF 12 and names cx among those below), whichever of the rules is raised", r[0] === "1 OF 12 CIRCUITS BEAT THEIR START (RULE-OBS) (cx)" && /^0 OF 12 CIRCUITS BEAT THE TUNED RULE AT THE SEAT'S CONSTANTS \(none\); cx,.* ARE BELOW IT$/.test(r[1]) && X.readingsOf(mkAu({ "circ-cx": { f: (i) => 0.1 + wob(i, 0.02) }, "rule-r8": { f: () => 0.3 } }), "cx").vsObs.reading === "BETTER");
    const ctl = { "circ-er0": 0.3, "circ-er1": -0.3, "circ-er2": 0.3, "circ-layer0": -0.3, "circ-layer1": 0.3, "circ-layer2": -0.3, "circ-degree0": 0.3, "circ-degree1": -0.3, "circ-degree2": 0 }, sp = { "circ-cx": { f: () => 0.1 }, "circ-nostate": { f: () => 0.1 }, "circ-withheld": { f: () => 0.1 } };
    for (const [k, v] of Object.entries(ctl)) sp[k] = { f: () => v };
    const fm = X.familyOf(mkAu(sp));
    ok("!! the controls' spread counts in the family test: three real wirings at +0.1 (no spread) against nine controls swinging +-0.3 around 0: the difference +0.1 is inside 2 se (about 0.2), NOT ABOVE", near(fm.diff, 0.1, 2e-3) && near(fm.se, 0.1, 5e-3) && fm.above === false);
}
sec("4. CHECKS");
{
    const names = (au, rp) => X.checksOf(au, rp).filter((c) => !c.ok).map((c) => c.name), good = () => mkAu({ "circ-cx": { f: () => 0.05 } }), rep = { "rule-r8": [0.5], "rule-low06": [0.5], "twin-low06": [0.5], ok: true };
    ok("!! five check rows with the reproduction, four without it; all pass on a clean audit", J(X.checksOf(good(), rep).map((c) => c.name)) === J(["SIZES", "DIVES ALIGNED", "RULES DISTINCT", "SCORES IN [0, 1]", "REPRODUCTION"]) && X.checksOf(good()).length === 4 && names(good(), rep).length === 0);
    const a1 = good(); a1.runs["circ-er2"].pop(); const a2 = good(); a2.runs["circ-cx"][3].key = "x:9"; const a3 = good(); a3.runs["rule-r8"] = a3.runs["rule-obs"].map((r) => ({ ...r })); const a4 = good(); a4.runs["circ-cx"][0].score = 1.2; const a5 = good(); a5.runs["circ-cx"][0].score = NaN;
    ok("!! a short arm breaks SIZES, a different dive DIVES ALIGNED, two identical rules RULES DISTINCT, a score of 1.2 or NaN SCORES IN [0, 1]", names(a1).includes("SIZES") && names(a2).includes("DIVES ALIGNED") && names(a3).includes("RULES DISTINCT") && names(a4).includes("SCORES IN [0, 1]") && names(a5).includes("SCORES IN [0, 1]"));
    ok("!! the reproduction fails when its flag is false, when a rule's scores are missing and when one is not a number", names(good(), { ...rep, ok: false }).includes("REPRODUCTION") && names(good(), { ...rep, "rule-r8": [] }).includes("REPRODUCTION") && names(good(), { ...rep, "twin-low06": [NaN] }).includes("REPRODUCTION") && names(good(), { ...rep, "rule-low06": undefined }).includes("REPRODUCTION"));
    const a6 = good(); a6.range = { from: 1, to: 21 };
    ok("!! the expected size is the range times the kinds: a 21-seed range with 20 seeds' dives breaks SIZES", names(a6).includes("SIZES"));
}
sec("5. REPORT");
{
    const au = mkAu({ "circ-cx": { f: (i) => 0.1 + wob(i, 0.02) } }), rep = { "rule-r8": [0.5], "rule-low06": [0.5], "twin-low06": [0.5], ok: true }, L = X.report(au, rep), t = L.join("\n");
    ok("!! the head names the seeds, the kinds, the dives an arm, the gauge, the first-order step and 'read once'; the five checks pass first", /^ROUND H3: .* Seeds 1-20 of far, both \(40 dives an arm\), gauge sd 0\.10, first-order orientation step; read once$/.test(L[0]) && L.slice(1, 6).every((l) => /^  PASS /.test(l)));
    const mean = (a) => X.scoreMean(au.runs[a]), row = (a) => t.split("\n").find((l) => l.startsWith("  " + a.padEnd(16)));
    ok("!! a means table with all sixteen arms, each its own mean to four places and its bad count; the per-kind line; one block per circuit with three readings; the seat-minus-rule line", X.ARM_IDS.every((a) => row(a) === `  ${a.padEnd(16)} ${mean(a).toFixed(4)}  bad 0`) && /^per kind: rule-obs: far [0-9.]+ both [0-9.]+ \| rule-r8: /m.test(t) && X.CIRCUITS.every((s) => new RegExp(`^${s.replace(":", ":")}:\\n   vs rule-obs .*\\n   vs rule-low06 .*\\n   vs twin-low06 `, "m").test(t)) && /^twin-low06 minus rule-low06 /m.test(t));
    ok("!! the five bottom lines come last, each prefixed BOTTOM LINE:", L.slice(-5).every((l) => l.startsWith("BOTTOM LINE: ")) && /CIRCUITS BEAT THEIR START/.test(L[L.length - 5]) && /^BOTTOM LINE: HULL/.test(L[L.length - 1]));
    const bad = mkAu({}); bad.runs["rule-obs"].pop(); const Lb = X.report(bad);
    ok("!! a failed check says the verdicts are NOT WEIGHED, with one bottom line and no table", Lb.some((l) => /^  FAIL SIZES/.test(l)) && Lb.includes("A CHECK FAILED: the verdicts below are NOT WEIGHED.") && Lb[Lb.length - 1] === "BOTTOM LINE: NOT WEIGHED (a check failed)" && Lb.filter((l) => l.startsWith("BOTTOM LINE")).length === 1 && !Lb.some((l) => /^means/.test(l)));
}
sec("6. FLIGHT");
{
    const range = { from: 15001, to: 15002 }, kinds = ["far", "both"], au = X.audit(circuit, records, { range, kinds, seconds: 200 }), set = T.setOf(kinds, 15001, 15002), opt = { gauge: T.GAUGE, seconds: 200 };
    ok("!! an audit flies sixteen arms on 4 dives each (2 seeds of far and both), keys 'kind:seed' kind-major, the same in every arm", Object.keys(au.runs).length === 16 && X.ARM_IDS.every((a) => au.runs[a].length === 4 && J(au.runs[a].map((r) => r.key)) === J(["far:15001", "far:15002", "both:15001", "both:15002"])));
    const direct = T.evaluate(T.GUARDED_OBS, set, opt), rec = records.find((r) => r.spec === "cx"), Pol = C.policyOf(C.parseSpecs("cx")[0], circuit), dc = T.evaluate(Pol.pilotFor(Float32Array.from(rec.weights)), set, opt);
    ok("!! rule-obs is T.GUARDED_OBS and circ-cx is the cx record's champion weights through trainNeedsCircuit's own policy, dive for dive (the gauge is the task's sd 0.1)", au.runs["rule-obs"].every((r, i) => r.score === direct.runs[i].score) && au.runs["circ-cx"].every((r, i) => r.score === dc.runs[i].score));
    ok("!! the circuits are other pilots than their start and than each other (some circuit differs from rule-obs on a dive; two circuits differ), and the five checks pass on the real audit (rules distinct needs more than 4 dives, so it is the one allowed to read false here)", X.CIRCUITS.some((s) => au.runs["circ-" + s.replace(":", "")].some((r, i) => r.score !== au.runs["rule-obs"][i].score)) && au.runs["circ-cx"].some((r, i) => r.score !== au.runs["circ-er0"][i].score) && X.checksOf(au).filter((c) => !c.ok).every((c) => c.name === "RULES DISTINCT"));
    ok("!! the first-order orientation step is the default in this process (the import is first): the module says euler, not rk4", R.orientationDefault() === "euler");
}
sec("7. SOURCE");
{
    const first = raw.split("\n").find((l) => /^import /.test(l));
    ok("!! the first import is the first-order orientation step; the seeds 15001 and 15060 appear once each; no clock, no random number, nothing read from the disk", /rigidBody6dofEuler/.test(first) && code.split("15001").length === 2 && code.split("15060").length === 2 && !/Date\.now|Math\.random|performance\.now|readFileSync|writeFileSync/.test(code));
}
console.log(fails ? `\n${fails} FAIL` : "\nall checks pass");
finished = true;
