// WebGLEngine/tools/ship/circuitRetrain-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node tools/ship/circuitRetrain-selfcheck.mjs      (about half a minute: fixtures, a tiny search on the smoke sets, dives on the gate's two seeds)
//
// THE GATE OF tools/ship/circuitRetrain.mjs (Round 40 of brain/NEEDS_AND_LIMITS.md, registered before it existed).
//   1 REGISTRATION  the net (84 hidden, the aquarium circuit's), the recipe (trainNeedsCircuit's, unchanged), the search seeds, the base by value, the two gauges, the audit seeds and arms.
//   2 TRAINING      the two-gauge seam (both gauges flown, sound first; the mean score, the summed counts); the champion rule; the ledger's checks; a tiny real search.
//   3 VERDICTS      V1 under BIAS and V2 at REF against the shipped seat; the bottom line replaces only on both.
//   4 CHECKS        each of the nine checks fails on a fixture that breaks it; a failed check says NOT WEIGHED and nothing is replaced.
//   5 FLIGHT        the untrained policy IS R04; a moved readout is not; C06 is the aquarium's circuit profile; SEAT-04 the shipped seat; refusals.
//   6 SOURCE        the seeds in one place; the trainer's search imported, not copied; no clock, random or file.
// NOT CHECKED, said plainly: what the training finds and what the champion does on the audit dives (that is the experiment).
// SABOTAGE LOG: see the end of this file.
"use strict";
import fs from "node:fs";
let fails = 0, finished = false;
const died = (e) => { console.log("  FAIL  !! THE GATE THREW before it finished: " + String((e && e.stack) || e).split("\n").slice(0, 3).join(" | ").slice(0, 400)); process.exitCode = 1; };
process.on("uncaughtException", died); process.on("unhandledRejection", died);
process.on("exit", () => { if (!finished) { console.log("  FAIL  !! THE GATE ENDED BEFORE IT FINISHED"); process.exitCode = 1; } });
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const sec = (t) => console.log("\n" + t);
const J = JSON.stringify;
const throws = (f, re) => { try { f(); return false; } catch (e) { return re.test(String(e.message)); } };
import * as T from "../../brain/needsTask.mjs";
import * as SS from "../../brain/surveySeat.mjs";
import * as U from "../../brain/tunedRule.mjs";
import * as TN from "./trainNeedsCircuit.mjs";
import * as X from "./circuitRetrain.mjs";
import { circuitSeat, PLAIN_CHAMPION, CIRCUIT_CHAMPION } from "../../render/subAquariumCircuit.mjs";
const t0 = Date.now();
console.log("circuitRetrain-selfcheck -- Round 40, the decision-circuit net retrained with a biased gauge\n");

sec("1. REGISTRATION");
ok("!! the net is the aquarium circuit's (84 hidden, 21 -> 84 -> 7); the recipe is trainNeedsCircuit's, unchanged (4 x 300, sigma 0.3, maxK 4, prune 60); search seeds 97500-97503", X.HIDDEN === 84 && X.HIDDEN === PLAIN_CHAMPION.hidden && X.retrainPolicy().WEIGHT_COUNT === PLAIN_CHAMPION.weights.length &&
    X.RECIPE === TN.RECIPE && J(X.RECIPE) === J({ runs: 4, iters: 300, sigma: 0.3, maxK: 4, pruneBudget: 60 }) && X.SEARCHES === 4 && J(X.SEARCH_SEEDS) === J([97500, 97501, 97502, 97503]));
ok("!! the base BY VALUE: the Round 8 constants with low -0.04 and nothing else (the shipped seat's SURVEY_CONSTANTS); the gauges are REF's and BIAS's (+0.10)", J(X.BASE_04) === J(SS.SURVEY_CONSTANTS) && X.BASE_04.low === SS.SURVEY_R8.low - 0.04 &&
    J(X.SOUND) === J({ sd: 0.1, hz: 1 }) && J(X.BIASED) === J({ sd: 0.1, hz: 1, fault: { bias: 0.1 } }));
const ch = Array.from({ length: X.CHUNKS }, (_, j) => X.chunkRange(j));
ok("!! the audit: seeds 52001-52300 (both, 300 dives), the gate's 52901-52902 outside them; arms NEW, C06, SEAT-04; REF and BIAS; 24 jobs in four chunks", J(X.SEEDS) === J([52001, 52300]) && X.KIND === "both" && X.DIVES === 300 && J(X.GATE_SEEDS) === J([52901, 52902]) &&
    J(X.ARMS) === J(["NEW", "C06", "SEAT-04"]) && J(X.COND_NAMES) === J(["REF", "BIAS"]) && X.AUDIT_JOBS.length === 24 && ch[0][0] === 52001 && ch[3][1] === 52300 && ch.every((c, j) => j === 0 || c[0] === ch[j - 1][1] + 1));

sec("2. TRAINING");
{
    const res = (score, crashed, n, tag) => ({ score, crashed, stranded: 0, runs: Array.from({ length: n }, (_, i) => ({ tag, i })) });
    const both = X.bothGauges(res(0.8, 1, 3, "s"), res(0.6, 4, 3, "b"));
    ok("!! bothGauges: the mean score, the summed crushed, the sound runs then the biased; the two scores kept", Math.abs(both.score - 0.7) < 1e-12 && both.crashed === 5 && both.runs.length === 6 && both.runs[0].tag === "s" && both.runs[3].tag === "b" && both.sound === 0.8 && both.biased === 0.6 &&
        throws(() => X.bothGauges(res(0.8, 0, 3), res(0.6, 0, 2)), /different numbers of dives/));
    const calls = [], stub = (pilot, set, o) => { calls.push(o.gauge); return res(o.gauge && o.gauge.fault ? 0.5 : 0.9, o.gauge && o.gauge.fault ? 2 : 0, set.length, "x"); };
    const P = X.retrainPolicy({ evalOf: stub }), seam = typeof P.evaluate === "function", e = seam ? P.evaluate(P.pilotFor(P.handWeights()), [1, 2]) : null;
    // the seam's absence must turn this row red, not crash the gate (mutant M16 first crashed it): `seam` is tested before anything calls it
    ok("!! the seam: every evaluation flies the set at the sound gauge, then with the +0.10 bias, and returns their mean (what search() and the held-out and pool read)",
        seam && calls.length === 2 && J(calls[0]) === J(X.SOUND) && J(calls[1]) === J(X.BIASED) && Math.abs(e.score - 0.7) < 1e-12 && e.crashed === 2 && Math.abs(TN.evaluateW(P, P.handWeights(), [1], null).score - 0.7) < 1e-12, seam ? "" : "the policy has no evaluate seam");
    const rec = (k, held, pool, startPool = 2) => ({ k, seed: X.SEARCH_SEEDS[k], recipe: X.RECIPE, weightCount: 3, weights: [0, 0, 0], heldOut: held, poolCrashed: pool, start: { train: 0.5, heldOut: 0.5, poolCrashed: startPool } });
    const recs = [rec(0, 0.7, 3), rec(1, 0.65, 2), rec(2, 0.65, 1), rec(3, 0.6, 0)];
    const c = X.championOf(recs);
    ok("!! the champion: eligible = pool crushed no more than the start's (2); the best held-out of the eligible, ties to the lower k (k 1 over k 2 at 0.65; k 0's 0.70 is not eligible)", c.record.k === 1 && c.eligible === 3 && !c.none);
    ok("!! none eligible -> the champion is the start, and championWeights hands back the start's weights", X.championOf([rec(0, 0.9, 5), rec(1, 0.9, 3)]).none === true &&
        J(Array.from(X.championWeights([rec(0, 0.9, 5)]))) === J(Array.from(X.retrainPolicy().handWeights())) && J(Array.from(X.championWeights(recs))) === J([0, 0, 0]));
    ok("!! the ledger: four searches once each, one recipe, one start, weights of their count and each search's own seed -- each break named", X.ledgerChecks(recs).length === 0 &&
        /searches are 0,1,2/.test(X.ledgerChecks(recs.slice(0, 3)).join()) && /more than one recipe/.test(X.ledgerChecks([...recs.slice(0, 3), { ...recs[3], recipe: { ...X.RECIPE, iters: 10 } }]).join()) &&
        /START/.test(X.ledgerChecks([...recs.slice(0, 3), { ...recs[3], start: { ...recs[3].start, train: 0.4 } }]).join()) && /seed/.test(X.ledgerChecks([...recs.slice(0, 3), { ...recs[3], seed: 1 }]).join()));
    const tiny = (() => { try { return X.searchJob(0, { recipe: { iters: 2, pruneBudget: 2 }, sets: TN.setsOf({ smoke: true }) }); } catch (e) { return { error: String(e.message), weights: [], start: {} }; } })();   // a throw is this row's red, not the gate's crash
    ok("!! a tiny real search on the smoke sets: the record keeps its seed (97500), the start's three numbers, both held-out halves, and each weight the float32 of its six-decimal rounding (the trainer's own storage)", !tiny.error && tiny.seed === 97500 && tiny.k === 0 && tiny.weights.length === tiny.weightCount &&
        tiny.weights.every((v) => v === Math.fround(Math.round(v * 1e6) / 1e6)) && ["train", "heldOut", "poolCrashed"].every((k) => k in tiny.start) && Number.isFinite(tiny.heldOutSound) && Number.isFinite(tiny.heldOutBiased) && throws(() => X.searchJob(4), /not 0\.\.3/));
}

sec("3. VERDICTS");
const run = (score, i, fp = "f") => ({ score, kind: "both", damage0: i, fingerprint: fp + i });
const r0 = (sc, crashed = 0, fp = "f") => ({ runs: sc.map((s, i) => run(s, i, fp)), crashed, stranded: 0, score: sc.reduce((a, b) => a + b, 0) / sc.length });
const S = [0.5, 0.6, 0.7, 0.8], fx = (o = {}) => Object.fromEntries(X.ARMS.map((a) => [a, { REF: (o[a] || {}).REF || r0(S), BIAS: (o[a] || {}).BIAS || r0(S) }]));
{
    ok("!! all null: V1 and V2 hold, and the retrained circuit REPLACES the profile", X.bottomLine(fx()) === "THE RETRAINED CIRCUIT HOLDS ITS HULL: IT REPLACES THE AQUARIUM'S CIRCUIT PROFILE");
    ok("!! V1: NEW at 9 under BIAS against the seat's 1 is worse -> NOTHING IS REPLACED; C06's 88 does not enter it", X.bottomLine(fx({ NEW: { BIAS: r0(S, 9) }, "SEAT-04": { BIAS: r0(S, 1) }, C06: { BIAS: r0(S, 88) } })) === "THE RETRAINED CIRCUIT DOES NOT HOLD ITS HULL: NOTHING IS REPLACED" &&
        X.verdictsOf(fx({ NEW: { BIAS: r0(S, 9) }, "SEAT-04": { BIAS: r0(S, 1) } })).v1 === false && X.verdictsOf(fx({ NEW: { BIAS: r0(S, 3) }, "SEAT-04": { BIAS: r0(S, 1) } })).v1 === true);
    // V1 reads the seat's BIAS count, not its REF count: the seat at 0 (REF) and 10 (BIAS), NEW at 9 under BIAS holds against 10 and would fail against 0 (mutant M9 went 0 red without this)
    ok("!! V1 is against the seat's BIAS count: NEW 9 against the seat's 10 under BIAS holds, though the seat crushed none at REF", X.verdictsOf(fx({ NEW: { BIAS: r0(S, 9) }, "SEAT-04": { BIAS: r0(S, 10) } })).v1 === true);
    ok("!! V2: NEW at 6 at REF against the seat's 0 is worse -> NOTHING IS REPLACED, even with V1 holding", X.verdictsOf(fx({ NEW: { REF: r0(S, 6) } })).v2 === false && X.verdictsOf(fx({ NEW: { REF: r0(S, 6) } })).v1 === true &&
        X.bottomLine(fx({ NEW: { REF: r0(S, 6) } })) === "THE RETRAINED CIRCUIT DOES NOT HOLD ITS HULL: NOTHING IS REPLACED");
    const lower = fx({ NEW: { REF: r0(S.map((v, i) => v - 0.05 - i * 0.001)) } }), v = X.verdictsOf(lower);
    ok("!! the score is REPORTED, never weighed: NEW 0.05 lower at REF HURTS and still replaces", X.keepsOf(v.refVsSeat) === "HURTS" && X.bottomLine(lower) === "THE RETRAINED CIRCUIT HOLDS ITS HULL: IT REPLACES THE AQUARIUM'S CIRCUIT PROFILE");
}

sec("4. CHECKS");
{
    const recs = X.SEARCH_SEEDS.map((seed, k) => ({ k, seed, recipe: X.RECIPE, weightCount: 1, weights: [0], trainScore: 0.5, moved: 0, kept: 0, heldOut: 0.5, heldOutSound: 0.5, heldOutBiased: 0.5, poolCrashed: 0, start: { train: 0.5, heldOut: 0.5, poolCrashed: 0 } }));
    const good = () => Object.fromEntries(X.ARMS.map((a, k) => [a, { REF: r0(S, 0, "r" + k), BIAS: r0(S, 0, "b" + k) }]));
    const names = (res, o = {}, rs = recs) => X.checksOf(res, rs, { dives: 4, ...o }).filter((c) => !c.ok).map((c) => c.name);
    ok("!! a well-formed fixture passes all nine checks", names(good()).length === 0 && X.checksOf(good(), recs, { dives: 4 }).length === 9);
    const short = good(); short.C06.BIAS = r0([0.5, 0.6, 0.7], 0, "b1");
    const swap = good(); swap.NEW.REF.runs = [...swap.NEW.REF.runs].reverse();
    const still = good(); still["SEAT-04"].BIAS = r0(S, 0, "r2");
    const same = good(); same.C06.REF = r0(S, 0, "r0");
    ok("!! each break fails its own check: SIZES, ALIGNED, THE FAULT REACHES THE PILOT, THE ARMS DIFFER, the ledger, the start, the profile, the shipped seat",
        names(short).includes("SIZES") && names(swap).includes("ALIGNED") && J(names(still)) === J(["THE FAULT REACHES THE PILOT"]) && J(names(same)) === J(["THE ARMS DIFFER"]) && J(names(good(), {}, recs.slice(0, 3))) === J(["THE LEDGER IS COMPLETE"]) &&
        J(names(good(), { start: false })) === J(["NEW'S START IS R04"]) && J(names(good(), { profile: false })) === J(["C06 IS THE AQUARIUM'S CIRCUIT PROFILE"]) && J(names(good(), { shipped: false })) === J(["SEAT-04 IS THE SHIPPED SEAT"]));
    const rep = X.report(still, recs, { dives: 4 });
    ok("!! a failed check says NOT WEIGHED, that nothing is replaced, and draws no verdict", rep.includes("A CHECK FAILED: the verdicts below are NOT WEIGHED and nothing is replaced.") && rep[rep.length - 1] === "BOTTOM LINE: NOT WEIGHED (a check failed)" && !rep.some((l) => /^ {2}V[12] /.test(l)));
    const tl = X.trainingLines(recs), tlNone = X.trainingLines(recs.map((r) => ({ ...r, poolCrashed: 1 })));
    ok("  trainingLines: a header, one line per search with ELIGIBLE or not, and the champion -- or 'none eligible -- NEW is the start (R04)'", tl.length === 6 && tl[0].startsWith("ROUND 40 TRAINING") && tl.slice(1, 5).every((l, k) => l.startsWith(`  search ${k} (seed ${X.SEARCH_SEEDS[k]})`) && /ELIGIBLE/.test(l)) &&
        tl[5] === "CHAMPION: search 0 (held-out 0.5000), 4 of 4 eligible" && tlNone[5] === "CHAMPION: none eligible -- NEW is the start (R04)" && tlNone.slice(1, 5).every((l) => /not eligible/.test(l)));
    const full = X.report(good(), recs, { dives: 4 });
    ok("  a passing report has the training lines, a row per arm, V1, V2, the reported line and one bottom line", full[0].startsWith("ROUND 40 TRAINING") && full.some((l) => l.startsWith("CHAMPION:")) && X.ARMS.every((a) => full.some((l) => l.trim().startsWith(a + " "))) &&
        full.some((l) => /^ {2}V1 /.test(l)) && full.some((l) => /^ {2}V2 /.test(l)) && full.some((l) => l.startsWith("REPORTED, NOT WEIGHED")) && full.filter((l) => l.startsWith("BOTTOM LINE:")).length === 1);
}

sec("5. FLIGHT (the gate's two seeds)");
{
    const set = T.setOf(["both"], X.GATE_SEEDS[0], X.GATE_SEEDS[1]), fps = (p, g) => T.evaluate(p, set, { gauge: g }).runs.map((r) => r.fingerprint).join("|");
    const P = X.retrainPolicy(), hand = P.handWeights(), moved = Float32Array.from(hand); moved[P.offsets.B2] = 0.9;   // the surfacing output's bias pushed hard
    ok("!! the untrained policy IS R04 (tunedSeat on low -0.04, WIDE_BOUNDS), and startIsR04() says so", fps(P.pilotFor(hand), X.BIASED) === fps(T.flyDecision(U.tunedSeat({ ...SS.SURVEY_R8, low: SS.SURVEY_R8.low - 0.04 }, U.WIDE_BOUNDS)), X.BIASED) && X.startIsR04());
    ok("!! a moved readout is not the rule: the surfacing bias at 0.9 changes the dives", fps(P.pilotFor(moved), X.BIASED) !== fps(P.pilotFor(hand), X.BIASED));
    // 2026-11-19, the replacement made: the audit's check (profileSame) was PASS when flown (the committed report says so); since then the profile IS the retrained NEW, not C06
    const champW = X.championWeights([0, 1, 2, 3].map((k) => JSON.parse(fs.readFileSync(new URL(`../../brain/rig-results/circuit-retrain/search-${k}.json`, import.meta.url), "utf8"))));
    ok("!! *** THE REPLACEMENT MADE: the aquarium's circuit profile now flies NEW (the champion on -0.04), not C06; profileSame() was PASS in the committed report and is false since; SEAT-04 is the shipped seat ***",
        // RESTATED 2026-11-21: Round 40's NEW was the profile until Round 42 replaced it with the planner circuit (the shipped seat); it is reached by name now, CIRCUIT_CHAMPION
        fps(T.flyDecision(circuitSeat("circuit", CIRCUIT_CHAMPION)), X.BIASED) === fps(X.pilotOf("NEW", { weights: Array.from(champW) }), X.BIASED) && X.profileSame(circuitSeat) === false && X.shippedSame() &&
        /PASS C06 IS THE AQUARIUM'S CIRCUIT PROFILE/.test(fs.readFileSync(new URL("../../brain/rig-results/circuit-retrain-report.json", import.meta.url), "utf8")));
    ok("!! NEW flies the weights it is handed on the -0.04 seat: the start's weights fly R04's dives", fps(X.pilotOf("NEW", { weights: Array.from(hand) }), X.BIASED) === fps(P.pilotFor(hand), X.BIASED));
    ok("  refusals: NEW without weights, an unknown arm or condition", throws(() => X.pilotOf("NEW"), /needs the champion's weights/) && throws(() => X.pilotOf("C04"), /unknown arm/) && throws(() => X.auditJob("C06", "DROP", "0"), /unknown condition/));
}

sec("6. SOURCE");
{
    const code = fs.readFileSync(new URL("./circuitRetrain.mjs", import.meta.url), "utf8").split("\n").filter((l) => !/^\s*\/\//.test(l)).join("\n");
    ok("!! the search is trainNeedsCircuit's (imported, called, not copied): no mutate loop or prune of its own", /import \{ RECIPE, setsOf, search \} from "\.\/trainNeedsCircuit\.mjs"/.test(code) && /search\(Pol, SEARCH_SEEDS\[k\], k, recipe, sets\.train, null\)/.test(code) && !/Pol\.mutate|tryRevert/.test(code));
    ok("!! the seeds appear once each in the code; the base by value; no clock, random or file", ["97500", "52001", "52300", "52901"].every((s) => (code.match(new RegExp(s, "g")) || []).length === 1) && /SS\.SURVEY_R8\.low - 0\.04/.test(code) && !/SURVEY_CONSTANTS/.test(code) && !/Date\.now|Math\.random|new Date|node:fs|readFile|writeFile/.test(code));
}

sec("7. THE RESULT, RE-DERIVED FROM THE COMMITTED RUN (brain/rig-results/circuit-retrain/, the ledger committed before the audit, the audit read once)");
{
    const dir = new URL("../../brain/rig-results/circuit-retrain/", import.meta.url), rd = (f) => JSON.parse(fs.readFileSync(new URL(f, dir), "utf8"));
    const recs = [0, 1, 2, 3].map((k) => rd(`search-${k}.json`)), c = X.championOf(recs);
    const res = Object.fromEntries(X.ARMS.map((a) => [a, Object.fromEntries(X.COND_NAMES.map((cd) => [cd, X.mergeKinds(Array.from({ length: X.CHUNKS }, (_, j) => rd(`${a}__${cd}__${j}.json`)))]))]));
    const v = X.verdictsOf(res), nr = (a, b) => Math.abs(a - b) < 5e-5;
    ok("!! the ledger: four searches, the champion search 1 (held-out 0.8706), 3 of 4 eligible (search 2 crushed one pool dive), and EVERY held-out below the start's 0.8913",
        X.ledgerChecks(recs).length === 0 && c.record.k === 1 && c.eligible === 3 && recs[2].poolCrashed === 1 && nr(c.record.heldOut, 0.8706) && recs.every((r) => r.heldOut < r.start.heldOut) && nr(recs[0].start.heldOut, 0.8913));
    ok("!! the five data checks pass on the committed audit", X.checksOf(res, recs).every((x) => x.ok));
    ok("!! *** the table: NEW lost 0 at REF and 5 under BIAS (4 crushed, 1 stranded), C06 77, the seat 2; V1 and V2 hold; the bottom line REPLACES ***",
        res.NEW.REF.crashed === 0 && res.NEW.BIAS.crashed === 4 && res.NEW.BIAS.stranded === 1 && res.C06.BIAS.crashed === 77 && res["SEAT-04"].BIAS.crashed === 2 && v.v1 && v.v2 && X.bottomLine(res) === "THE RETRAINED CIRCUIT HOLDS ITS HULL: IT REPLACES THE AQUARIUM'S CIRCUIT PROFILE");
    ok("!! the price, reported: NEW minus the seat -0.0269 at REF and -0.0390 under BIAS, both HURTS; NEW minus C06 under BIAS +0.1648 KEEPS",
        nr(v.refVsSeat.mean, -0.0269) && X.keepsOf(v.refVsSeat) === "HURTS" && nr(v.biasVsSeat.mean, -0.0390) && X.keepsOf(v.biasVsSeat) === "HURTS" && nr(v.biasVsC06.mean, 0.1648) && X.keepsOf(v.biasVsC06) === "KEEPS");
    const nl = fs.readFileSync(new URL("../../brain/NEEDS_AND_LIMITS.md", import.meta.url), "utf8"), i = nl.indexOf("## Round 40, RESULT"), t = i > 0 ? nl.slice(i) : "";
    ok("  the RESULT note states the replacement, the price beyond 2 se, and that the training did not carry to the held-out dives", /IT REPLACES THE AQUARIUM'S CIRCUIT PROFILE/.test(t) && /-0\.0269/.test(t) && /did not carry/.test(t));
}
// SECTION 7 SABOTAGE (each restored byte-identical): Q1 one NEW BIAS crush added to its job file -> 1 red ("the table"); Q2 search 2's pool crush removed (it becomes eligible and
//   champion) -> 2 red ("the ledger", and "THE REPLACEMENT MADE", since the champion it names is then another search).

finished = true;
console.log(`\n${fails ? "FAIL -- " + fails + " check(s)" : "ALL GREEN"} (${Date.now() - t0} ms)\nnot checked here: what the training finds, and what the champion does on the audit dives.`);
process.exitCode = fails ? 1 : 0;
// SABOTAGE LOG (17 mutants of tools/ship/circuitRetrain.mjs, each alone, restored byte-identical, sha-256 checked; a red counts only as a FAIL row of a gate that loaded and printed its line):
//   M1 the search seeds from 97510 (3 red), M2 the base at -0.05 (3), M3 the fitness reading the sound gauge only (2), M4 the seam flying the sound gauge twice (1), M5 eligibility
//   strict (1), M6 ties to the higher k (1), M7 none eligible taking the first record (1), M8 the ledger ignoring the recipe (1), M10 the bottom line without V2 (1), M11 the bottom
//   line on either (2), M12 the bite always true (2), M13 the arms always differ (1), M14 the start check ignored (1), M15 the report ignoring a failed check (1), M17 the crushed
//   count of the biased gauge only (1).
//   *** 2 FINDINGS ON THE FIRST PASS ***: M9 (V1 against the seat's REF count) went 0 RED -- every fixture's seat counts gave one answer either way; a row with the seat at 0 and 10
//   was added: 1 red. M16 (the two-gauge seam removed) CRASHED the gate rather than reddening it (the seam row called the missing function, and the tiny search threw): both are now
//   guarded so a broken library is a red row: 2 red, the gate loaded. 17 of 17.
