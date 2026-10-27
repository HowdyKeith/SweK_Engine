// WebGLEngine/tools/ship/trainNeedsCircuit-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node tools/ship/trainNeedsCircuit-selfcheck.mjs      (~12 s -- to be restated at ship)
//
// THE GATE OF tools/ship/trainNeedsCircuit.mjs (and its command): the training and grading of piece 4, registered in brain/NEEDS_AND_LIMITS.md ("Round 3", Amendments 1 and 2) before it was written. Nothing is trained for real here; the search runs on a STUB POLICY whose score is a known function of one weight, so every branch of the recipe has a worked answer, and the verdicts run on
// hand-built records.
//   1  CONSTANTS    the recipe (4 x 300, sigma 0.3, maxK 4, a prune budget of 60), the seed base, the families, the audits (audit, audit2, reserve), the two conditions (noisy = the registered gauge, clean = none), the registered study of 12 circuits.
//   2  SPECS        what parses and what is refused; the seed of every spec distinct and the condition not in it; the controls keep the cx cells' type, side and io; nostate and withheld are the cx circuit with the right flags.
//   3  THE SETS     the full sizes (16, 40, 48, 48, 48, 48) and the smoke shrink; the audits are the registered sets.
//   4  THE SEARCH   on the stub: deterministic, improving, the prune by block halving puts irrelevant weights back and keeps the essential one, within its budget (0 leaves everything), and never changes the score it started from.
//   5  ONE CIRCUIT  eligibility (crushed in no more pool runs than the start), the champion the best held-out of the eligible, no champion -> scored as the start, and THE AUDITS READ ONCE: the number of evaluations made is counted (a circuit with no champion reads no audit; one with a champion reads exactly three).
//   6  THE REFERENCES  seven rules x three audits, the start check on four runs, the checks (start, memory-need, hysteresis, observation-only, task re-check) in every branch.
//   7  THE VERDICTS  wiring PASS / FAIL / IN BETWEEN / NOT ASSESSED, the margin rule at its edges, the strongest family, the rule verdict (every audit, the crushed count), NO STATE and WITHHELD pairs, a circuit with no champion read as GUARDED-OBS, and every branch of the bottom line.
//   8  THE COMMAND  arguments, the references first, one line a circuit, resumable, workers by child processes (stubbed), the refusals (another condition or recipe, smoke records, clean for a control), the report.
// NOT CHECKED, said plainly: that a real training finds anything (that is the experiment); the process spawning itself beyond its arguments.
//
// SABOTAGE LOG: filled in at the foot of this header when run.
"use strict";
import fs from "node:fs";
import * as T from "../../brain/needsTask.mjs";
import * as TR from "./trainNeedsCircuit.mjs";

let fails = 0, finished = false;
const died = (e) => { console.log("  FAIL  !! THE GATE THREW before it finished, which is a failure of whatever it was asking: " + String((e && e.stack) || e).split("\n").slice(0, 3).join(" | ").slice(0, 400)); process.exit(1); };
process.on("uncaughtException", died); process.on("unhandledRejection", died);
process.on("exit", () => { if (!finished) { console.log("  FAIL  !! THE GATE ENDED BEFORE IT FINISHED"); process.exitCode = 1; } });
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const sec = (t) => console.log("\n" + t);
const throws = (f) => { try { f(); return null; } catch (e) { return String(e.message || e); } };
const near = (a, b, tol) => Math.abs(a - b) <= tol, J = JSON.stringify;
console.log("trainNeedsCircuit-selfcheck -- the training and grading of piece 4\n");

const cx = TR.loadCircuit();

sec("1. THE CONSTANTS");
ok("!! the recipe is 4 searches x 300 children, sigma 0.3, 1 to 4 weights, a prune budget of 60 (frozen); the seed base 61000", J(TR.RECIPE) === J({ runs: 4, iters: 300, sigma: 0.3, maxK: 4, pruneBudget: 60 }) && Object.isFrozen(TR.RECIPE) && TR.SEARCH_BASE === 61000 && TR.MAX_INDEX === 19);
ok("!! the families (nostate, withheld, er, layer, degree), the verdict families (er, layer, degree), the control bases, the audits (audit, audit2, reserve) and the two conditions (noisy = the registered gauge, clean = none)", J(TR.FAMILIES) === J(["nostate", "withheld", "er", "layer", "degree"]) && J(TR.VERDICT_FAMILIES) === J(["er", "layer", "degree"]) && J(TR.CONTROL_BASE) === J({ er: 1000, layer: 2000, degree: 3000 }) && J(TR.AUDITS) === J(["audit", "audit2", "reserve"]) && TR.CONDITIONS.noisy === T.GAUGE && TR.CONDITIONS.clean === null && TR.MIN_EDGE === 0.02 && TR.SD_FACTOR === 2 && TR.MIN_CONTROLS === 3);
ok("!! the registered study is the 12 circuits cx, nostate, withheld, er:0-2, layer:0-2, degree:0-2 and the clean check is cx, nostate, withheld; the seven reference rules are named", TR.STUDY === "cx,nostate,withheld,er:0-2,layer:0-2,degree:0-2" && TR.CLEAN_STUDY === "cx,nostate,withheld" && TR.parseSpecs(TR.STUDY).length === 12 && J(TR.REFERENCE_NAMES) === J(["SPIN", "DIRECT", "HULLONLY", "GUARDED", "GUARDED_1T", "GUARDED_OBS", "GUARDED_FILTER"]));

sec("2. THE SPECS AND THE CIRCUITS");
{
    const ps = TR.parseSpecs, names = (t) => ps(t).map(TR.specName).join();
    ok("!! specs parse: cx, nostate, withheld, family:K and family:K-L; the registered study reads in order", names("cx,nostate,withheld,er:0-2,layer:1,degree:0-1") === "cx,nostate,withheld,er:0,er:1,er:2,layer:1,degree:0,degree:1" && names(TR.STUDY).split(",").length === 12);
    ok("!! what cannot be read is refused: an empty spec, an unknown family (sign), a backwards range, an index past 19, a spec named twice (cx, nostate, withheld, er:1), a bare family", /empty/.test(throws(() => ps("cx,,er:0")) || "") && /unknown family/.test(throws(() => ps("sign:0")) || "") && /backwards/.test(throws(() => ps("er:3-1")) || "") && /past index 19/.test(throws(() => ps("er:20")) || "") && /twice/.test(throws(() => ps("cx,cx")) || "") && /twice/.test(throws(() => ps("nostate,nostate")) || "") && /twice/.test(throws(() => ps("withheld,withheld")) || "") && /twice/.test(throws(() => ps("er:1,er:0-2")) || "") && /cannot read/.test(throws(() => ps("er")) || ""));
    const all = ps(TR.STUDY), seeds = all.map(TR.seedBaseOf);
    ok("!! every spec of the study has its own seed base (61000 + 10 x its place: cx 0, nostate 1, withheld 2, er 3.., layer 23.., degree 43..), and the places do not collide", new Set(seeds).size === 12 && TR.seedBaseOf({ family: "cx", index: 0 }) === 61000 && TR.seedBaseOf({ family: "nostate", index: 0 }) === 61010 && TR.seedBaseOf({ family: "withheld", index: 0 }) === 61020 && TR.seedBaseOf({ family: "er", index: 0 }) === 61030 && TR.seedBaseOf({ family: "er", index: 2 }) === 61050 && TR.seedBaseOf({ family: "layer", index: 0 }) === 61230 && TR.seedBaseOf({ family: "degree", index: 0 }) === 61430);
    const c0 = TR.circuitFor({ family: "cx", index: 0 }, cx), er = TR.circuitFor({ family: "er", index: 0 }, cx), tb = TR.circuitFor({ family: "layer", index: 0 }, cx), dg = TR.circuitFor({ family: "degree", index: 0 }, cx);
    ok("!! cx, nostate and withheld are the vendored circuit itself; ER, TYPE-BLOCK and DEGREE are rewirings that keep the cells' type, side and io", TR.circuitFor({ family: "nostate", index: 0 }, cx) === cx && TR.circuitFor({ family: "withheld", index: 0 }, cx) === cx && c0 === cx && [er, tb, dg].every((c) => c !== cx && J(c.edges) !== J(cx.edges) && c.neurons.every((n, i) => n.cls === cx.neurons[i].cls && n.side === cx.neurons[i].side) && J(c.io) === J(cx.io) && c.edges.length === cx.edges.length) && J(TR.circuitFor({ family: "er", index: 0 }, cx).edges) === J(er.edges) && J(TR.circuitFor({ family: "er", index: 1 }, cx).edges) !== J(er.edges));
    const pn = TR.policyOf({ family: "nostate", index: 0 }, cx), pw = TR.policyOf({ family: "withheld", index: 0 }, cx), pc = TR.policyOf({ family: "cx", index: 0 }, cx);
    ok("!! the policies carry the variants: nostate has no recurrence, withheld has the needs inputs zeroed, cx has both, each 2,452 numbers", pn.persist === false && pn.withheld === false && pw.persist === true && pw.withheld === true && pc.persist === true && pc.withheld === false && [pn, pw, pc].every((p) => p.WEIGHT_COUNT === 2452) && pn.name === "nostate" && pc.name === "cx");
}

sec("3. THE SETS");
{
    const full = TR.setsOf(), sm = TR.setsOf({ smoke: true });
    ok("!! the full sets: train 16 (TRAIN_SMALL), held-out 40, pool 48, audit 48, audit2 48, reserve 48 -- the registered sets themselves (the same objects)", full.train === T.TRAIN_SMALL_SET && full.heldOut === T.HELD_OUT_SET && full.pool === T.POOL_SET && full.audit === T.AUDIT_SET && full.audit2 === T.AUDIT2_SET && full.reserve === T.RESERVE_SET && [16, 40, 48, 48, 48, 48].every((n, i) => Object.values(full)[i].length === n));
    ok("!! the smoke sets are every eighth dive of each (2, 5, 6, 6, 6, 6) and a subset of the full ones", [2, 5, 6, 6, 6, 6].every((n, i) => Object.values(sm)[i].length === n) && Object.keys(sm).every((k) => sm[k].every((x) => full[k].includes(x))));
}

// a stub policy: the score is a function of weight 0 (>= 0.5 -> GUARDED, else SPIN) so the recipe has worked answers; weights 1..9 are irrelevant
const stub = (opts = {}) => { const calls = { pilotFor: 0 }; return { calls, name: "stub", WEIGHT_COUNT: 10, handWeights: () => new Float32Array(10), mutate: (w, sigma, rng, maxK) => { const o = Float32Array.from(w), k = 1 + Math.floor(rng() * maxK); for (let j = 0; j < k; j++) { const i = Math.floor(rng() * 10); o[i] += i === 0 ? 0.5 : 1; } return o; }, pilotFor: (w) => { calls.pilotFor++; return (opts.crashIfMoved && [...w].slice(1).some((v) => v !== 0)) ? T.DIRECT : (w[0] >= 0.5 ? T.GUARDED : T.SPIN); } }; };
const trainTiny = T.setOf(["plain"], 1, 2);

sec("4. THE SEARCH (on the stub)");
{
    const S = stub(), r1 = TR.search(S, 777, 0, { iters: 12, sigma: 0.3, maxK: 4, pruneBudget: 60 }, trainTiny, null), r2 = TR.search(S, 777, 0, { iters: 12, sigma: 0.3, maxK: 4, pruneBudget: 60 }, trainTiny, null);
    const gScore = T.evaluate(T.GUARDED, trainTiny).score, sScore = T.evaluate(T.SPIN, trainTiny).score;
    ok("!! a search is deterministic from its seed (same weights, same counts) and improves the score: from SPIN's to GUARDED's on two plain dives (each computed independently) once weight 0 reaches 0.5", J([...r1.weights]) === J([...r2.weights]) && r1.improved === r2.improved && near(r1.trainScore, gScore, 1e-12) && gScore > sScore + 0.1 && r1.improved >= 1, `train ${r1.trainScore}, ${r1.improved} improvements, ${r1.neutral} neutral`);
    ok("!! the prune puts the irrelevant moved weights back and keeps the essential one: after the prune only weight 0 differs from the start, kept < moved (moved counts every changed weight before the prune)", r1.kept === 1 && r1.weights[0] >= 0.5 && [...r1.weights].slice(1).every((v) => v === 0) && r1.moved > r1.kept, `moved ${r1.moved}, kept ${r1.kept}, ${r1.pruneEvals} evaluations`);
    const r0 = TR.search(S, 777, 0, { iters: 12, sigma: 0.3, maxK: 4, pruneBudget: 0 }, trainTiny, null);
    ok("!! a prune budget of 0 does nothing (kept = moved, no evaluations), and a budget of 2 uses at most 2", r0.kept === r0.moved && r0.pruneEvals === 0 && TR.search(S, 777, 0, { iters: 12, sigma: 0.3, maxK: 4, pruneBudget: 2 }, trainTiny, null).pruneEvals <= 2);
    const rn = TR.search(S, 5, 0, { iters: 0, sigma: 0.3, maxK: 4, pruneBudget: 60 }, trainTiny, null);
    ok("!! with no children the search returns the start itself (moved 0, kept 0, its own train score: SPIN's)", rn.moved === 0 && rn.kept === 0 && near(rn.trainScore, sScore, 1e-12) && [...rn.weights].every((v) => v === 0));
}

sec("5. ONE CIRCUIT (stub policy, tiny sets): eligibility, the champion, the start, and the audits read once");
{
    const recipe = { runs: 2, iters: 6, sigma: 0.3, maxK: 4, pruneBudget: 3 }, spec = { family: "cx", index: 0 };
    const tiny = { train: T.setOf(["plain"], 1, 1), heldOut: T.setOf(["plain"], 3, 3), pool: T.setOf(["deep"], 1, 1), audit: T.setOf(["plain"], 4, 4), audit2: T.setOf(["plain"], 5, 5), reserve: T.setOf(["plain"], 6, 6) };
    const S1 = stub(), rec = TR.runCircuit(spec, cx, { recipe, sets: tiny, smoke: true, condition: "noisy", policyOf: () => S1 });
    ok("!! a circuit with a champion: the record names its spec, condition, seed base, the champion's seed (the best held-out of the eligible), the weights (10), the movement and its scores on the THREE audits", rec.spec === "cx" && rec.condition === "noisy" && rec.seedBase === 61000 && rec.champion !== null && rec.asStart === false && rec.weightCount === 10 && rec.weights.length === 10 && TR.AUDITS.every((a) => rec.scores.champion[a].runs.length === 4 || rec.scores.champion[a].runs.length === 1) && rec.searches.length === 2 && rec.movement.kept >= 0 && rec.smoke === true, `champion seed ${rec.champion}`);
    const elig = rec.searches.filter((s) => s.eligible), best = elig.reduce((b, s) => (s.heldOut > b.heldOut ? s : b), elig[0]);
    ok("!! the champion is the eligible search with the best held-out mean", rec.champion === best.seed && elig.every((s) => s.heldOut <= best.heldOut + 1e-12));
    // the evaluations: 1 (the start's pool) + per search (iters + 1 start + prune evals + held-out + pool) + 3 audits
    const searchEvals = rec.searches.reduce((n, s) => n + recipe.iters + 1 + 1 + 1, 0), pruneEvals = S1.calls.pilotFor - 1 - searchEvals - 3;
    ok("!! the audits are read exactly three times (once each) for a champion: the evaluations made are 1 + the searches' + the prune's (at most 3 a search) + 3", pruneEvals >= 0 && pruneEvals <= 2 * recipe.pruneBudget && S1.calls.pilotFor === 1 + searchEvals + pruneEvals + 3, `${S1.calls.pilotFor} evaluations`);
    const S3 = stub({ crashIfMoved: true }), none = TR.runCircuit(spec, cx, { recipe: { runs: 2, iters: 8, sigma: 0.3, maxK: 4, pruneBudget: 0 }, sets: tiny, smoke: true, condition: "noisy", policyOf: () => S3 });
    ok("!! a search whose pilot is crushed on the pool when the start is not is NOT eligible; when no search is eligible there is NO champion: asStart, scores.champion null, no weights, and THE AUDITS WERE NOT READ (the evaluations are the start's pool + each search's children, start, held-out and pool, and not one more)", none.searches.every((s) => !s.eligible) && none.asStart === true && none.champion === null && none.scores.champion === null && none.weights === null && none.movement === null && S3.calls.pilotFor === 1 + none.searches.length * (8 + 1 + 1 + 1), `${S3.calls.pilotFor} evaluations, eligible ${none.searches.map((s) => s.eligible ? "E" : "n").join("")}`);
    ok("!! a condition that is neither noisy nor clean is refused", /condition/.test(throws(() => TR.runCircuit(spec, cx, { recipe, sets: tiny, condition: "foggy", policyOf: () => stub() })) || ""));
    const src = fs.readFileSync(new URL("./trainNeedsCircuit.mjs", import.meta.url), "utf8"), fn = src.slice(src.indexOf("export function runCircuit"), src.indexOf("// ---- the references record"));
    ok("!! in the source of runCircuit the audit sets appear in ONE place only, the champion's line (sets[a] for a in AUDITS), and the search/held-out/pool read sets.train, sets.heldOut, sets.pool", (fn.match(/sets\[a\]/g) || []).length === 1 && !/sets\.audit|sets\.reserve/.test(fn) && /sets\.train/.test(fn) && /sets\.heldOut/.test(fn) && /sets\.pool/.test(fn));
}

sec("6. THE REFERENCES AND THE CHECKS");
{
    const one = { audit: T.setOf(["far"], 4, 4), audit2: T.setOf(["far"], 5, 5), reserve: T.setOf(["far"], 6, 6) }, refs = TR.refsRecord(cx, { smoke: true, condition: "noisy", sets: one });
    ok("!! the references record: seven rules on each of the three audits, a summary each (score, runs with kind and crushed, byKind), and the start check on four runs all the same (the untrained cx pilot is GUARDED-OBS)", refs.family === "refs" && refs.condition === "noisy" && TR.REFERENCE_NAMES.every((n) => TR.AUDITS.every((a) => refs.references[n][a].runs.length === 1 && Number.isFinite(refs.references[n][a].score))) && refs.startCheck.length === 4 && refs.startCheck.every((x) => x.same === true), refs.startCheck.map((x) => x.kind + x.seed + (x.gauge ? "+g" : "")).join(" "));
    // hand-built references for the checks: the per-run scores are chosen
    const mkS = (fn) => ({ score: 0, crashed: 0, stranded: 0, byKind: {}, runs: ["far", "both", "deep", "plain"].flatMap((k) => Array.from({ length: 12 }, (_, i) => ({ kind: k, score: fn(k, i), crushed: false }))) });
    const H = (over = {}) => { const base = { SPIN: () => 0.55, DIRECT: (k) => (k === "deep" ? 0 : 0.5), HULLONLY: () => 0.6, GUARDED: () => 0.85, GUARDED_1T: () => 0.4, GUARDED_OBS: () => 0.85, GUARDED_FILTER: () => 0.85, ...over }, R = {}; for (const n of TR.REFERENCE_NAMES) R[n] = Object.fromEntries(TR.AUDITS.map((a) => { const s = mkS(base[n]); s.score = s.runs.reduce((x, r) => x + r.score, 0) / s.runs.length; s.crashed = n === "DIRECT" ? 12 : 0; if (n === "DIRECT") s.runs.forEach((r) => { if (r.kind === "deep") r.crushed = true; }); return [a, s]; })); return R; };
    const mk = (condition, over, start = [{ same: true }]) => ({ family: "refs", condition, references: H(over), startCheck: start });
    const names = (c) => c.rows.filter((r) => !r.info && !r.ok).map((r) => r.name).join();
    ok("!! a clean references record whose hysteresis and baselines behave passes the START, HYSTERESIS and TASK checks and READS the observation-only tie ('the clean task needs no internal state') because GUARDED-OBS equals GUARDED", TR.checksOf(mk("clean", {})).ok && /NEEDS NO INTERNAL STATE/.test(TR.checksOf(mk("clean", {})).rows.find((r) => r.name === "OBSERVATION-ONLY CHECK").text));
    ok("!! the START check fails if any of the runs differs; the HYSTERESIS check (clean) fails if GUARDED does not beat GUARDED-1T by the margin; the MEMORY-NEED check (noisy) fails if the filter does not beat GUARDED-OBS", /START CHECK/.test(names(TR.checksOf(mk("clean", {}, [{ same: true }, { same: false }])))) && /HYSTERESIS/.test(names(TR.checksOf(mk("clean", { GUARDED_1T: () => 0.85 })))) && /MEMORY-NEED/.test(names(TR.checksOf(mk("noisy", { GUARDED_OBS: () => 0.85 })))) && TR.checksOf(mk("noisy", { GUARDED_OBS: () => 0.2 })).ok);
    ok("!! the TASK RE-CHECK fails if GUARDED does not beat SPIN on far and both, or if DIRECT is crushed in under a quarter of the deep runs", /TASK RE-CHECK/.test(names(TR.checksOf(mk("clean", { GUARDED: () => 0.5, GUARDED_OBS: () => 0.5 })))) && (() => { const m = mk("clean", {}); for (const a of TR.AUDITS) m.references.DIRECT[a].runs.forEach((r) => { r.crushed = false; }); return /TASK RE-CHECK/.test(names(TR.checksOf(m))); })());
    ok("!! the observation-only line is only a READING (it never fails the checks): GUARDED-OBS far below GUARDED is printed without a tie sentence", TR.checksOf(mk("clean", { GUARDED_OBS: () => 0.3 })).rows.find((r) => r.name === "OBSERVATION-ONLY CHECK").info === true && !/NEEDS NO INTERNAL STATE/.test(TR.checksOf(mk("clean", { GUARDED_OBS: () => 0.3 })).rows.find((r) => r.name === "OBSERVATION-ONLY CHECK").text));
}

sec("7. THE VERDICTS");
{
    const run = (kind, score, crushed = false) => ({ kind, score, crushed });
    const summ = (score, n = 8, crashed = 0, jitter = 0) => ({ score, crashed, stranded: 0, byKind: {}, runs: Array.from({ length: n }, (_, i) => run(["plain", "deep", "far", "both"][i % 4], score + (i % 2 ? jitter : -jitter))) });
    const rec = (family, index, scores, extra = {}) => ({ spec: family === "cx" || family === "nostate" || family === "withheld" ? family : `${family}:${index}`, family, index, condition: "noisy", asStart: false, champion: 1, scores: { champion: Object.fromEntries(TR.AUDITS.map((a, i) => [a, summ(scores[i], 8, extra.crashed || 0)])) }, searches: [{ eligible: true }], movement: { moved: 3, kept: 2, largest: 0.5 }, ...extra });
    const refs = { family: "refs", condition: "noisy", startCheck: [{ same: true }], references: Object.fromEntries(TR.REFERENCE_NAMES.map((n) => [n, Object.fromEntries(TR.AUDITS.map((a) => [a, summ(n === "GUARDED" ? 0.8 : n === "GUARDED_OBS" ? 0.3 : n === "GUARDED_FILTER" ? 0.8 : n === "SPIN" ? 0.55 : 0.4)]))])) };
    // make the checks pass on the hand references: the filter beats OBS, GUARDED beats SPIN, DIRECT crushed in deep, GUARDED_1T not needed (noisy)
    for (const a of TR.AUDITS) { refs.references.DIRECT[a].runs.forEach((r) => { if (r.kind === "deep") r.crushed = true; }); }
    const ctl = (fam, vals) => vals.map((v, k) => rec(fam, k, [v, v, v]));
    const wired = (cxv, e, w, nsv, whv) => [refs, rec("cx", 0, cxv), rec("nostate", 0, [nsv, nsv, nsv]), rec("withheld", 0, [whv, whv, whv]), ...ctl("er", [e, e, e]), ...ctl("layer", [e, e, e]), ...ctl("degree", [w, w, w])];
    const vOf = (recs) => TR.verdictOf(recs, recs[0]);
    ok("!! the checks on the hand-built references pass (the filter at 0.8 against GUARDED-OBS at 0.3, GUARDED over SPIN, DIRECT crushed in deep)", vOf(wired([0.9, 0.9, 0.9], 0.5, 0.5, 0.5, 0.5)).checks.ok);
    const p = vOf(wired([0.9, 0.9, 0.9], 0.5, 0.5, 0.5, 0.5));
    ok("!! WIRING PASS: cx at 0.9 against ER, TYPE-BLOCK and DEGREE at 0.5 (the margin 0.4 over max(0.02, 2 sd = 0)) on all three audits; cx beats NO STATE and WITHHELD at 0.5 on every audit; RULE: 0.9 over GUARDED's 0.8 is 0.1 over max(0.02, 2 se of the paired difference)", p.wiring.verdict === "PASS" && Object.values(p.families).every((f) => TR.AUDITS.every((a) => f.audits[a].wins)) && p.pairs.nostate.every((x) => x.wins) && p.pairs.withheld.every((x) => x.wins) && p.rule.verdict === "BEATS THE RULE", `${p.wiring.verdict}; ${p.rule.verdict}`);
    const f = vOf(wired([0.4, 0.4, 0.4], 0.5, 0.5, 0.5, 0.5)), ib = vOf(wired([0.9, 0.9, 0.4], 0.5, 0.5, 0.5, 0.5));
    ok("!! FAIL: cx at 0.4 against controls at 0.5 wins against the strongest family on 0 of 3 audits; IN BETWEEN: cx beats everyone on two audits and not on the third (wins against the strongest on at least two but not every family on every audit)", f.wiring.verdict === "FAIL" && /0 of 3/.test(f.wiring.why) && ib.wiring.verdict === "IN BETWEEN", `${ib.wiring.verdict}: ${ib.wiring.why}`);
    const edge = vOf(wired([0.5199, 0.5201, 0.5201], 0.5, 0.5, 0.5, 0.5));
    ok("!! the margin rule at its edge: a lead of 0.0199 does not win and 0.0201 does (the floor max(0.02, 2 sd = 0))", edge.families.er.audits.audit.wins === false && edge.families.er.audits.audit2.wins === true && edge.families.er.audits.reserve.wins === true);
    const sd = vOf([refs, rec("cx", 0, [0.6, 0.6, 0.6]), ...[0.3, 0.5, 0.7].map((v, k) => rec("er", k, [v, v, v])), ...ctl("layer", [0.4, 0.4, 0.4]), ...ctl("degree", [0.4, 0.4, 0.4])]);
    ok("!! the margin uses the family's spread: ER at 0.3, 0.5, 0.7 has mean 0.5 and sd 0.2, so a lead of 0.1 does NOT win (needs 0.4); the strongest family on an audit is the one with the highest mean (ER at 0.5)", sd.families.er.audits.audit.wins === false && near(sd.families.er.audits.audit.needs, 0.4, 1e-9) && sd.strongest.audit === "er" && sd.wiring.verdict === "FAIL");
    const na = vOf([refs, rec("cx", 0, [0.9, 0.9, 0.9]), ...ctl("er", [0.5, 0.5]), ...ctl("layer", [0.5, 0.5, 0.5]), ...ctl("degree", [0.5, 0.5, 0.5])]);
    ok("!! NOT ASSESSED below three finished controls of a family (ER has two), and with no cx record or no references", na.wiring.verdict === "NOT ASSESSED" && /er need at least 3/.test(na.wiring.why) && TR.verdictOf([refs], refs).wiring.verdict === "NOT ASSESSED" && TR.verdictOf(wired([0.9, 0.9, 0.9], 0.5, 0.5, 0.5, 0.5), null).wiring.verdict === "NOT ASSESSED");
    const rl = vOf(wired([0.9, 0.9, 0.9], 0.5, 0.5, 0.5, 0.5)), crushedCx = wired([0.9, 0.9, 0.9], 0.5, 0.5, 0.5, 0.5); crushedCx[1].scores.champion.reserve = summ(0.9, 8, 3);
    ok("!! the RULE verdict needs every audit's lead and no more crushed runs than GUARDED: the same scores with cx crushed in 3 reserve runs against GUARDED's 0 read 'does not beat the rule'; cx at 0.82 against GUARDED's 0.8 does not beat it either (a lead of 0.02 is under the floor with the paired se 0)", vOf(crushedCx).rule.verdict === "DOES NOT BEAT THE RULE" && vOf(wired([0.82, 0.82, 0.82], 0.5, 0.5, 0.5, 0.5)).rule.verdict === "DOES NOT BEAT THE RULE" && rl.rule.rows.every((x) => x.wins));
    const stt = wired([0.9, 0.9, 0.9], 0.5, 0.5, 0.5, 0.5); stt[2] = { ...stt[2], asStart: true, champion: null, scores: { champion: null } };
    ok("!! a circuit with NO champion is read as its start, which is the reference GUARDED-OBS (0.3 in the hand references): NO STATE with no champion reads 0.3 on every audit", Object.values(TR.effectiveOf(stt[2], refs)).every((s) => s.score === 0.3) && vOf(stt).pairs.nostate.every((x) => near(x.other, 0.3, 1e-12)));
    const tieNs = vOf(wired([0.9, 0.9, 0.9], 0.5, 0.5, 0.9, 0.5)), tieWh = vOf(wired([0.9, 0.9, 0.9], 0.5, 0.5, 0.5, 0.9));
    const b = (v) => TR.bottomLine(v, "noisy");
    ok("!! the bottom line: all four wins reads 'used the needs better than its controls and than the rule'; a tie with NO STATE reads 'the memory did not matter'; a tie with WITHHELD reads 'the needs did not matter to what was learned'", /used the needs better than its controls and than the rule/.test(b(p)) && /ties NO STATE: the memory did not matter/.test(b(tieNs)) && /ties WITHHELD: the needs did not matter to what was learned/.test(b(tieWh)));
    ok("!! a wiring FAIL reads 'wiring FAIL' with the rule verdict and the memory and needs readings; a failed check makes the bottom line NOT READ and names it; too few controls is NOT YET", /wiring FAIL, does not beat the rule/.test(b(f)) && /NOT READ.*MEMORY-NEED/.test(b(vOf(wired([0.9, 0.9, 0.9], 0.5, 0.5, 0.5, 0.5).map((x, i) => (i === 0 ? { ...x, references: { ...x.references, GUARDED_FILTER: x.references.GUARDED_OBS } } : x))))) && /NOT YET/.test(b(na)));
    const lines = TR.reportLines(wired([0.9, 0.9, 0.9], 0.5, 0.5, 0.5, 0.5)).join("\n");
    ok("!! the report prints the checks first, the references, cx, NO STATE, WITHHELD, the three families, the training line, both verdicts and the bottom line (in that order)", /PIECE 4, condition noisy[\s\S]*START CHECK[\s\S]*references[\s\S]*CX:[\s\S]*NO STATE:[\s\S]*WITHHELD:[\s\S]*ER x3[\s\S]*TYPE-BLOCK x3[\s\S]*DEGREE x3[\s\S]*training:[\s\S]*WIRING VERDICT \(noisy\): PASS[\s\S]*RULE VERDICT \(noisy\): BEATS THE RULE[\s\S]*BOTTOM LINE/.test(lines) && TR.reportLines([rec("cx", 0, [1, 1, 1])]).length === 1);
}

sec("8. THE COMMAND");
{
    const pa = (a) => TR.parseArgs(a);
    ok("!! run needs --specs (or --one) and --out; the condition defaults to noisy and must be noisy or clean; the recipe flags default to the registered one", /specs/.test(throws(() => pa(["run", "--out", "x"])) || "") && /out/.test(throws(() => pa(["run", "--specs", "cx"])) || "") && pa(["run", "--specs", "cx", "--out", "x"]).condition === "noisy" && /noisy or clean/.test(throws(() => pa(["run", "--specs", "cx", "--out", "x", "--condition", "foggy"])) || "") && J(pa(["run", "--specs", "cx", "--out", "x"]).recipe) === J(TR.RECIPE));
    ok("!! the clean condition is for cx, nostate and withheld ONLY (a control is refused); bad numbers, a backwards flag and an unknown option are refused; report needs --in; a bad first word is refused", pa(["run", "--specs", "cx,nostate,withheld", "--out", "x", "--condition", "clean"]).condition === "clean" && /clean condition/.test(throws(() => pa(["run", "--specs", "cx,er:0", "--out", "x", "--condition", "clean"])) || "") && /whole number/.test(throws(() => pa(["run", "--specs", "cx", "--out", "x", "--iters", "0"])) || "") && /sigma/.test(throws(() => pa(["run", "--specs", "cx", "--out", "x", "--sigma", "0"])) || "") && /unknown option/.test(throws(() => pa(["run", "--specs", "cx", "--out", "x", "--nope"])) || "") && /--in/.test(throws(() => pa(["report"])) || "") && /run or report/.test(throws(() => pa(["fly"])) || "") && /prune-budget/.test(throws(() => pa(["run", "--specs", "cx", "--out", "x", "--prune-budget", "-1"])) || ""));
    const files = new Map(), logs = [], errs = [], calls = { runs: [], refs: 0, spawn: [] };
    const fakeRec = (s, o) => ({ spec: TR.specName(s), family: s.family, index: s.index, condition: o.condition, smoke: !!o.smoke, recipe: { ...o.recipe }, asStart: false, champion: 1, searches: [{ eligible: true }], movement: { moved: 1, kept: 1, largest: 0.1 }, scores: { champion: Object.fromEntries(TR.AUDITS.map((a) => [a, { score: 0.5, crashed: 0, stranded: 0, runs: [{ kind: "far", score: 0.5, crushed: false }] }])) } });
    const fakeRefs = (c, o) => ({ family: "refs", spec: "refs", condition: o.condition, smoke: !!o.smoke, startCheck: [{ same: true }], references: Object.fromEntries(TR.REFERENCE_NAMES.map((n) => [n, Object.fromEntries(TR.AUDITS.map((a) => [a, { score: 0.5, crashed: 0, stranded: 0, runs: [{ kind: "far", score: 0.5, crushed: false }] }]))])) });
    const io = { out: (m) => logs.push(m), err: (m) => errs.push(m), readFile: (f) => files.get(f), appendFile: (f, t) => files.set(f, (files.get(f) || "") + t), exists: (f) => files.has(f), runner: (s, c, o) => { calls.runs.push(TR.specName(s)); return fakeRec(s, o); }, refsRunner: (c, o) => { calls.refs++; return fakeRefs(c, o); }, spawner: async (s) => { calls.spawn.push(TR.specName(s)); return fakeRec(s, { condition: "noisy", smoke: false, recipe: TR.RECIPE }); } };
    const run = (args) => TR.command(args, io);
    const code1 = await run(["run", "--specs", "cx,nostate", "--out", "R.jsonl", "--quiet"]);
    const lines1 = String(files.get("R.jsonl")).trim().split("\n").map((l) => JSON.parse(l));
    ok("!! a run writes the references record FIRST and then one line per circuit (1 + 2), exit 0, and the recipe and condition ride in every record", code1 === 0 && lines1.length === 3 && lines1[0].family === "refs" && lines1[0].condition === "noisy" && calls.refs === 1 && J(calls.runs) === J(["cx", "nostate"]) && lines1[1].recipe.iters === 300 && lines1[1].condition === "noisy");
    const code2 = await run(["run", "--specs", "cx,nostate,withheld", "--out", "R.jsonl", "--quiet"]);
    ok("!! it is resumable: a second run with one more circuit trains only that one and does not compute the references again", code2 === 0 && J(calls.runs) === J(["cx", "nostate", "withheld"]) && calls.refs === 1);
    files.set("S.jsonl", J({ ...lines1[1], condition: "clean" }) + "\n"); const code3 = await run(["run", "--specs", "cx", "--out", "S.jsonl"]);
    files.set("T.jsonl", J({ ...lines1[1], recipe: { ...lines1[1].recipe, iters: 5 } }) + "\n"); const code4 = await run(["run", "--specs", "cx", "--out", "T.jsonl"]);
    ok("!! a results file holding another condition, or another recipe, is refused (exit 1), not mixed", code3 === 1 && code4 === 1 && errs.some((m) => /another condition, recipe/.test(m)));
    const before = calls.runs.length, code5 = await run(["run", "--specs", "cx,nostate", "--workers", "2", "--out", "W.jsonl", "--quiet"]);
    ok("!! with --workers above 1 each circuit goes to a child process (the spawner) and the parent keeps the records; nothing is trained in the parent", code5 === 0 && J(calls.spawn.slice().sort()) === J(["cx", "nostate"]) && calls.runs.length === before && String(files.get("W.jsonl")).trim().split("\n").length === 3);
    const code6 = await run(["run", "--one", "er:1", "--quiet"]);
    ok("!! --one trains a single circuit and prints one RESULT line for a parent to read", code6 === 0 && logs.some((m) => /^RESULT \{/.test(m)) && calls.runs.at(-1) === "er:1");
    files.set("M.jsonl", J({ ...lines1[1], smoke: true }) + "\n" + J(lines1[0]) + "\n"); const rs = await run(["report", "--in", "M.jsonl"]);
    ok("!! report prints for a results file; smoke records are refused without --allow-smoke (exit 1); a missing file is exit 1; a bad argument list is exit 2", (await run(["report", "--in", "R.jsonl"])) === 0 && logs.some((m) => /PIECE 4 BOTTOM LINE/.test(m)) && rs === 1 && errs.some((m) => /smoke/.test(m)) && (await run(["report", "--in", "M.jsonl", "--allow-smoke"])) === 0 && (await run(["report", "--in", "nope.jsonl"])) === 1 && (await run(["run"])) === 2);
    const cmdSrc = fs.readFileSync(new URL("./trainNeedsCircuitCmd.mjs", import.meta.url), "utf8");
    ok("!! the command file is three lines that import command from the library and set the exit code", /import \{ command \} from "\.\/trainNeedsCircuit\.mjs"/.test(cmdSrc) && /process\.exitCode = await command\(process\.argv\.slice\(2\)\)/.test(cmdSrc));
}

console.log(fails ? `\n${fails} FAIL` : "\nall checks pass");
finished = true;
process.exit(fails ? 1 : 0);
