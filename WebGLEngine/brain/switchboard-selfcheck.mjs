// WebGLEngine/brain/switchboard-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node brain/switchboard-selfcheck.mjs      (about 10-20 s: hand fixtures and a few short real flights)
//
// THE GATE OF brain/switchboard.mjs (backlog item `switchboard-core`, brain/BACKLOG_2026-11-04_BRAINS.md).
//   1 PAIRED    the pooled paired difference (mean, se, better/worse/same, bad counts); mismatched keys or lengths are refused; the reading at 1.5 and 2.5 se on both sides, zero and zero-spread cases.
//   2 BOARD     tasks and arms register with their own refusals; run refuses an unknown task or arm, no arms, a repeated arm, an arm of the other layer, and unequal run lists.
//   3 READ      the per-arm table and the control lines on synthetic tasks: BEATS, TIES, IS BELOW, and "was not flown" for a missing control.
//   4 SURVEY    the built-in decision arms: ids and controls, each arm IS the pilot it names (dive for dive on real 200 s dives), keys, the gauge noise and the kinds options reach the flight.
//   5 DROPOUT   the built-in flying task on real tank flights: deterministic, the same spawn for every arm, scores in (0, 1), an arm without an entry refused, the event option changes the bucket, a network differs from the autopilot.
//   6 SOURCE    no clock, random number or file; the header names the backlog item.
// NOT CHECKED, said plainly: which brain is better (that is the experiment); the page; any arm that is not built in.
// SABOTAGE LOG (49 mutants of brain/switchboard.mjs, each alone in its own worktree copy): 39 went red by name on the first pass; 10 went 0 red and each got a row: the twin arm's profile ignored, badOf without the crushed or the stranded half, the age clock never reset on a new target, the settle test dropped, one-scenario se (NaN), the same-difference tolerance (1e-9 against 0), a lost sub not marked bad, the angle wrap dropped (badOf and wrap became exports so they can be tested directly; the dropout task gained a `settle` option for the same reason). All ten then red by name.
//   ONE DECLARED EQUIVALENT: "better with no positive-mean test" (mean > 2 se without mean > 0): se is never negative, so mean > 2 se already implies mean > 0.
//   First draft of the twin-profile row used seeds 1344-1346: at 200 s every profile flies the same six dives there, so the row could not see the profile; it uses 1400-1405 now, where the ensemble differs.
"use strict";
import fs from "node:fs";
let fails = 0, finished = false;
const died = (e) => { console.log("  FAIL  !! THE GATE THREW before it finished: " + String((e && e.stack) || e).split("\n").slice(0, 3).join(" | ").slice(0, 400)); process.exitCode = 1; };
process.on("uncaughtException", died); process.on("unhandledRejection", died);
process.on("exit", () => { if (!finished) { console.log("  FAIL  !! THE GATE ENDED BEFORE IT FINISHED"); process.exitCode = 1; } });
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const sec = (t) => console.log("\n" + t);
const J = JSON.stringify, near = (a, b, t = 1e-9) => Math.abs(a - b) < t;
import * as T from "./needsTask.mjs";
import * as U from "./tunedRule.mjs";
import * as S from "./surveySeat.mjs";
import * as B from "./switchboard.mjs";
const thr = (f) => { try { f(); return ""; } catch (e) { return String(e.message); } };
const code = fs.readFileSync(new URL("./switchboard.mjs", import.meta.url), "utf8").split("\n").filter((l) => !/^\s*\/\//.test(l)).join("\n");
const head = fs.readFileSync(new URL("./switchboard.mjs", import.meta.url), "utf8").split("\n").filter((l) => /^\s*\/\//.test(l)).join("\n");
console.log("switchboard-selfcheck -- the switchboard core\n");
const runs = (scores, bad = []) => scores.map((s, i) => ({ key: "k" + i, score: s, bad: !!bad[i] }));

sec("1. PAIRED");
{
    const a = runs([0.9, 0.8, 0.7, 0.6], [0, 1, 0, 0]), b = runs([0.8, 0.8, 0.8, 0.5], [1, 1, 0, 0]), p = B.paired(a, b);
    ok("!! paired is a minus b scenario by scenario: n 4, mean +0.0250, better 2 (0.9 v 0.8, 0.6 v 0.5), worse 1 (0.7 v 0.8), same 1, bad counts 1 and 2", p.n === 4 && near(p.mean, 0.025) && p.better === 3 - 1 && p.worse === 1 && p.same === 1 && p.badA === 1 && p.badB === 2);
    const d = [0.1, -0.1, 0.1, -0.1], q = B.paired(runs(d), runs([0, 0, 0, 0]));
    ok("!! the se is the standard error of the differences (n - 1): +-0.1 over four scenarios has se 0.0577", near(q.se, 0.1 * Math.sqrt(4 / 3) / 2, 1e-9), `${q.se.toFixed(4)}`);
    ok("!! a different key in the same place, or a different number of scenarios, is refused with this library's message", /switchboard\.paired: scenario 1 is "k1" for one arm and "x" for the other/.test(thr(() => B.paired(runs([1, 2]), [{ key: "k0", score: 1, bad: false }, { key: "x", score: 2, bad: false }]))) && /flew 2 and 3 scenarios/.test(thr(() => B.paired(runs([1, 2]), runs([1, 2, 3])))));
    ok("!! one scenario has se 0 (not NaN), and differences of 1e-12 count as the same, not better or worse", B.paired(runs([0.7]), runs([0.5])).se === 0 && (() => { const x = B.paired(runs([0.5 + 1e-12, 0.5 - 1e-12]), runs([0.5, 0.5])); return x.same === 2 && x.better === 0 && x.worse === 0; })());
    const r = (mean, se) => B.readingOf({ mean, se });
    ok("!! the reading is 2 se on both sides: +2.5 se BETTER, +1.5 se TIES, -2.5 se WORSE, -1.5 se TIES, exactly 2 se TIES (strict)", r(0.025, 0.01) === "BETTER" && r(0.015, 0.01) === "TIES" && r(-0.025, 0.01) === "WORSE" && r(-0.015, 0.01) === "TIES" && r(0.02, 0.01) === "TIES" && r(-0.02, 0.01) === "TIES");
    ok("!! no difference TIES; a difference with no spread (se 0) is decisive by its sign: +0.1 BETTER, -0.1 WORSE", r(0, 0) === "TIES" && r(0.1, 0) === "BETTER" && r(-0.1, 0) === "WORSE" && r(0, 0.5) === "TIES");
}

sec("2. BOARD");
{
    const fresh = () => B.createBoard(), task = (name = "t", layer = "decision", run = (arm) => runs(arm.scores)) => ({ name, layer, run });
    const arm = (id, scores, extra = {}) => ({ id, layer: "decision", scores, ...extra });
    ok("!! addTask refuses a nameless task, an unknown layer, no run(), and a name twice, each with its own message", /needs a name/.test(thr(() => fresh().addTask({ layer: "decision", run() {} }))) && /layer "x" is not one of decision, flying/.test(thr(() => fresh().addTask({ name: "t", layer: "x", run() {} }))) && /has no run\(\)/.test(thr(() => fresh().addTask({ name: "t", layer: "flying" }))) && /already registered/.test(thr(() => fresh().addTask(task()).addTask(task()))));
    ok("!! addArm refuses an arm with no id, an unknown layer and a repeated id; a registered arm gets controls [] by default", /needs an id/.test(thr(() => fresh().addArm({ layer: "decision" }))) && /arm a has layer "z"/.test(thr(() => fresh().addArm({ id: "a", layer: "z" }))) && /already registered/.test(thr(() => fresh().addArm(arm("a", [])).addArm(arm("a", [])))) && J(fresh().addArm(arm("a", [])).arms.get("a").controls) === "[]");
    const b = fresh().addTask(task()).addTask(task("f", "flying")).addArm(arm("a", [0.5, 0.6])).addArm(arm("c", [0.5])).addArm({ id: "fl", layer: "flying", scores: [0.1, 0.2] });
    const msg = (...a) => thr(() => b.run(...a));
    ok("!! run refuses an unknown task, an unknown arm, no arms, an arm named twice and an arm of the other layer", /unknown task "zz" \(t, f\)/.test(msg("zz", ["a"], {})) && /unknown arm "q" \(a, c, fl\)/.test(msg("t", ["q"], {})) && /name at least one arm/.test(msg("t", [], {})) && /named twice/.test(msg("t", ["a", "a"], {})) && /arm fl is a flying-layer arm and task t is a decision-layer task/.test(msg("t", ["a", "fl"], {})) && /arm a is a decision-layer arm and task f is a flying-layer task/.test(msg("f", ["a"], {})));
    ok("!! run refuses arms that flew different numbers of scenarios, and otherwise returns the task, layer, range, options and each arm's runs", /arm c flew 1 scenarios and a 2/.test(msg("t", ["a", "c"], {})) && (() => { const r = b.run("t", ["a"], { from: 1, to: 2 }, { x: 1 }); return r.task === "t" && r.layer === "decision" && J(r.range) === J({ from: 1, to: 2 }) && J(r.opts) === J({ x: 1 }) && r.runs.a.length === 2; })());
}

sec("3. READ");
{
    const b = B.createBoard().addTask({ name: "t", layer: "decision", run: (arm) => runs(arm.scores, arm.bad) });
    const base = Array.from({ length: 40 }, (_, i) => 0.5 + 0.01 * Math.sin(i)), plus = (k, w = 0.02) => base.map((x, i) => x + k + (i % 2 ? w : -w));
    b.addArm({ id: "base", layer: "decision", scores: base, controls: [] }).addArm({ id: "good", layer: "decision", scores: plus(0.1), controls: ["base"], bad: [] })
        .addArm({ id: "same", layer: "decision", scores: plus(0, 0.02), controls: ["base"] }).addArm({ id: "poor", layer: "decision", scores: plus(-0.1), controls: ["base"] })
        .addArm({ id: "orphan", layer: "decision", scores: base, controls: ["gone"] }).addArm({ id: "twice", layer: "decision", scores: plus(0.1), controls: ["good", "base"], bad: base.map((_, i) => i < 3) });
    const res = b.run("t", ["base", "good", "same", "poor", "orphan", "twice"], {}), rd = b.read(res), L = rd.lines.join("\n");
    ok("!! the head names the task, the layer, the scenario and arm counts and the threshold; every arm has a table line with its mean and bad count", /^t \(decision layer\), 40 scenarios, 6 arms; paired on the same scenarios, BETTER\/WORSE at 2 se/.test(rd.lines[0]) && rd.per.length === 6 && near(rd.per[0].mean, base.reduce((a, x) => a + x, 0) / 40) && rd.per[5].bad === 3 && /  twice +mean [0-9.]+  bad 3/.test(L));
    ok("!! a better arm BEATS its control, a level one TIES it, a poorer one IS BELOW it, each line with the difference, se and counts", /good BEATS its control base \(\+0\.1000, se [0-9.]+; better 40, worse 0, same 0; bad 0 against 0\)/.test(L) && /same TIES its control base/.test(L) && /poor IS BELOW its control base \(-0\.1000/.test(L));
    ok("!! an arm with two controls gets a line for each, in order; the bad counts are the arm's against the control's", rd.pairs.filter((p) => p.arm === "twice").map((p) => p.control).join() === "good,base" && /twice (BEATS|TIES) its control good/.test(L) && /twice BEATS its control base \([^)]*bad 3 against 0\)/.test(L));
    ok("!! a control that was not flown gets no reading, only the line saying so; an arm with no controls gets no line", /orphan: its control gone was not flown, so no line/.test(L) && !/^base (BEATS|TIES)/m.test(L) && rd.pairs.some((p) => p.arm === "orphan" && p.missing === true));
}

sec("4. SURVEY");
{
    const bd = B.standardBoard(), ids = [...bd.arms.values()].filter((a) => a.layer === "decision").map((a) => a.id);
    ok("!! the decision arms are rule-r8, rule-low06 and one twin per profile; rule-r8 has no control, rule-low06 is held to rule-r8, each twin to rule-low06 (the rule at the SAME constants)", J(ids) === J(["rule-r8", "rule-low06", "twin-standard", "twin-events", "twin-wide", "twin-ensemble"]) && bd.arms.get("rule-r8").controls.length === 0 && J(bd.arms.get("rule-low06").controls) === '["rule-r8"]' && S.PROFILE_NAMES.every((p) => J(bd.arms.get("twin-" + p).controls) === '["rule-low06"]'));
    const range = { from: 1344, to: 1346 }, opts = { seconds: 200 }, set = T.setOf(["far", "both"], 1344, 1346), ev = (pilot, sd = T.GAUGE.sd) => T.evaluate(pilot, set, { gauge: { sd, hz: T.GAUGE.hz }, seconds: 200 });
    const res = bd.run("survey", ["rule-r8", "rule-low06", "twin-standard"], range, opts);
    const d1 = ev(T.flyDecision(U.tunedSeat(S.SURVEY_R8, U.WIDE_BOUNDS))), d2 = ev(T.flyDecision(U.tunedSeat(S.SURVEY_CONSTANTS, U.WIDE_BOUNDS))), d3 = ev(S.surveyPilot({ overrides: { seconds: 200 } }));
    ok("!! each arm IS the pilot it names, dive for dive: rule-r8 is the tuned rule at the Round 8 constants, rule-low06 the rule at the seat's constants, twin-standard the survey seat (six dives, 200 s: score)", [[res.runs["rule-r8"], d1], [res.runs["rule-low06"], d2], [res.runs["twin-standard"], d3]].every(([r, d]) => r.length === 6 && r.every((x, i) => x.score === d.runs[i].score)));
    ok("!! the two rules differ on at least one dive (the shift reaches the flight), and the keys are 'kind:seed' kind-major (far 1344-1346 then both)", res.runs["rule-r8"].some((x, i) => x.score !== res.runs["rule-low06"][i].score) && J(res.runs["rule-r8"].map((x) => x.key)) === J(["far:1344", "far:1345", "far:1346", "both:1344", "both:1345", "both:1346"]));
    const noisy = bd.run("survey", ["rule-low06"], range, { seconds: 200, sd: 0.3 }), one = bd.run("survey", ["rule-low06"], range, { seconds: 200, kinds: ["far"] }), dn = ev(T.flyDecision(U.tunedSeat(S.SURVEY_CONSTANTS, U.WIDE_BOUNDS)), 0.3);
    ok("!! the gauge noise option reaches the flight (sd 0.3 flies the sd 0.3 dives and not the default ones) and the kinds option picks the kinds (far only: three scenarios)", noisy.runs["rule-low06"].every((x, i) => x.score === dn.runs[i].score) && noisy.runs["rule-low06"].some((x, i) => x.score !== res.runs["rule-low06"][i].score) && one.runs["rule-low06"].length === 3 && one.runs["rule-low06"].every((x) => x.key.startsWith("far:")));
    ok("!! badOf marks a crushed dive or a stranded one and nothing else (an ordinary dive, a grounded one with neither flag is not bad); the six real dives have none", B.badOf({ crushed: true }) === true && B.badOf({ stranded: true }) === true && B.badOf({ crushed: false, stranded: false, status: "grounded" }) === false && B.badOf({}) === false && res.runs["rule-r8"].every((x) => x.bad === false));
    ok("!! each twin arm flies its own profile: on twelve dives (1400-1405, far and both, 200 s) twin-events and twin-ensemble equal the survey seat's events and ensemble profiles dive for dive, and the ensemble arm differs from the standard arm on at least one (the profile reaches the board's arm)", (() => { const r6 = { from: 1400, to: 1405 }, w2 = bd.run("survey", ["twin-standard", "twin-events", "twin-ensemble"], r6, opts), s6 = T.setOf(["far", "both"], 1400, 1405), e6 = (p) => T.evaluate(S.surveyPilot({ profile: p, overrides: { seconds: 200 } }), s6, { gauge: T.GAUGE, seconds: 200 }), de = e6("events"), dn2 = e6("ensemble"); return w2.runs["twin-events"].every((x, i) => x.score === de.runs[i].score) && w2.runs["twin-ensemble"].every((x, i) => x.score === dn2.runs[i].score) && w2.runs["twin-ensemble"].some((x, i) => x.score !== w2.runs["twin-standard"][i].score); })());
    ok("!! a survey arm without a pilot() is refused with the arm's name", /arm nopilot has no pilot\(\)/.test(thr(() => B.surveyTask.run({ id: "nopilot" }, range, opts))));
}

sec("5. DROPOUT");
{
    const w = (v) => Array.from({ length: 963 }, (_, i) => v * Math.sin(i * 1.7));
    const bd = B.standardBoard({ small: w(0.05), big: w(0.4) }), ids = [...bd.arms.values()].filter((a) => a.layer === "flying").map((a) => a.id);
    ok("!! the flying arms are the autopilot (no control) and one per network handed in, each held to the autopilot", J(ids) === J(["autopilot", "network-small", "network-big"]) && bd.arms.get("autopilot").controls.length === 0 && J(bd.arms.get("network-big").controls) === '["autopilot"]' && B.standardBoard().arms.has("network-small") === false);
    const range = { from: 0, to: 1 }, o = { seconds: 60 }, r1 = bd.run("dropout", ids, range, o), r2 = bd.run("dropout", ["autopilot"], range, o);
    ok("!! the flight is deterministic (the same arm twice gives the same scores), the keys are the ids sb-0 and sb-1 for every arm, and every score is inside (0, 1)", J(r1.runs.autopilot) === J(r2.runs.autopilot) && ids.every((id) => J(r1.runs[id].map((x) => x.key)) === '["sb-0","sb-1"]' && r1.runs[id].every((x) => x.score > 0 && x.score < 1 && x.bad === false)));
    ok("!! a network is another pilot than the autopilot on these ids (different scores), and two different networks differ from each other", r1.runs["network-big"].some((x, i) => x.score !== r1.runs.autopilot[i].score) && r1.runs["network-big"].some((x, i) => x.score !== r1.runs["network-small"][i].score));
    const lit = bd.run("dropout", ["autopilot"], range, { seconds: 60, event: null });
    ok("!! event null scores the lit run (all ticks, no dark bucket): its scores differ from the dropout run's on at least one id", lit.runs.autopilot.some((x, i) => x.score !== r1.runs.autopilot[i].score) && lit.runs.autopilot.every((x) => x.score > 0 && x.score < 1));
    ok("!! a flying arm without an entry() is refused; a run too short to reach a scored tick says so instead of scoring NaN", /arm bare has no entry\(\)/.test(thr(() => B.dropoutTask.run({ id: "bare" }, range, o))) && /has no ticks in the bucket it is scored on/.test(thr(() => B.dropoutTask.run(bd.arms.get("autopilot"), { from: 0, to: 0 }, { seconds: 1 }))));
    ok("!! an arm's register(tank) hook runs before its sub joins (the way a pilot kind will be added): the hook sees an empty tank", (() => { let seen = -1; B.dropoutTask.run({ id: "hooked", register: (q) => { seen = q.snapshot().length; }, entry: () => ({ pilot: "autopilot", circuit: "gfc", weights: null }) }, { from: 0, to: 0 }, o); return seen === 0; })());
}

{
    const q = B.standardBoard(), a = q.arms.get("autopilot"), long = { from: 0, to: 1 }, f = (settle) => B.dropoutTask.run(a, long, { seconds: 120, settle }).map((x) => x.score);
    ok("!! the settle option picks the scored ticks: settle 0 (every dark tick) differs from the default 12 s on at least one id; and a settle longer than any target lives (50 s) has no settled tick, so it scores the same as 1e9 (all dark ticks) -- the age clock resets at every new target", J(f(0)) !== J(f(12)) && J(f(50)) === J(f(1e9)) && J(f(50)) === J(f(0)));
    ok("!! wrap puts any angle into (-pi, pi]: 3.5 -> 3.5 - 2pi, -3.5 -> 2pi - 3.5, pi stays pi, 0 and small angles stay, 7 -> 7 - 2pi", near(B.wrap(3.5), 3.5 - 2 * Math.PI) && near(B.wrap(-3.5), 2 * Math.PI - 3.5) && near(B.wrap(Math.PI), Math.PI) && B.wrap(0) === 0 && near(B.wrap(0.3), 0.3) && near(B.wrap(7), 7 - 2 * Math.PI));
    const w9 = Array.from({ length: 963 }, (_, i) => 900 * Math.sin(i));
    const crazy = B.dropoutTask.run({ id: "crazy", entry: () => ({ pilot: "network", circuit: "gfc", weights: w9 }) }, { from: 0, to: 3 }, { seconds: 120 });
    ok("!! a lost sub is marked bad: a network with huge weights is lost on all four ids (bad true), and the autopilot on the same ids is not (bad false)", crazy.every((x) => x.bad === true) && B.dropoutTask.run(a, { from: 0, to: 3 }, { seconds: 120 }).every((x) => x.bad === false));
}
sec("6. SOURCE");
{
    ok("!! the module reads no clock, no random number and nothing from the disk", !/Date\.now|Math\.random|performance\.now|readFileSync|writeFileSync/.test(code));
    ok("!! the header names the backlog item, the two layers, the control lines and the two built-in tasks", /switchboard-core/.test(head) && /DECISION layer/.test(head) && /FLYING layer/.test(head) && /TIES its control/.test(head) && /SURVEY/.test(head) && /DROPOUT/.test(head));
}
console.log(fails ? `\n${fails} FAIL` : "\nall checks pass");
finished = true;
