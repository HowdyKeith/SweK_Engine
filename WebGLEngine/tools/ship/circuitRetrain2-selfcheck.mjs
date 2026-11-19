// WebGLEngine/tools/ship/circuitRetrain2-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node tools/ship/circuitRetrain2-selfcheck.mjs      (about half a minute: fixtures, a tiny checkpointed search on the smoke sets, dives on the gate's two seeds)
//
// THE GATE OF tools/ship/circuitRetrain2.mjs (Round 41 of brain/NEEDS_AND_LIMITS.md, registered before it existed).
//   1 REGISTRATION  the three changes: TRAIN_SET, seven checkpoints chosen on HELD_OUT_SET, the score line; the search seeds; the audit seeds and arms.
//   2 TRAINING      the ES loop IS trainNeedsCircuit.search() (pruneBudget 0) child for child; the checkpoints; the choice (best held-out, ties earlier); the champion; the ledger.
//   3 VERDICTS      V1, V2 (the hull) and V3 (the score at REF and under BIAS, not below the seat beyond 2 se); the bottom line names what it misses.
//   4 CHECKS        each of the nine checks fails on a fixture that breaks it; a failed check says NOT WEIGHED.
//   5 FLIGHT        CUR is the aquarium's circuit profile (full dives); NEW flies the weights it is given on -0.04; SEAT-04 the shipped seat; refusals.
//   6 SOURCE        the seeds in one place; Round 40's policy imported; no prune; no clock, random or file.
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
const tryOr = (f) => { try { return f(); } catch (e) { return { error: String(e.message) }; } };
import * as T from "../../brain/needsTask.mjs";
import * as SS from "../../brain/surveySeat.mjs";
import * as TN from "./trainNeedsCircuit.mjs";
import * as R40 from "./circuitRetrain.mjs";
import * as X from "./circuitRetrain2.mjs";
import { circuitSeat, CIRCUIT_CHAMPION } from "../../render/subAquariumCircuit.mjs";
const t0 = Date.now();
console.log("circuitRetrain2-selfcheck -- Round 41, a better-trained circuit profile\n");

sec("1. REGISTRATION");
ok("!! (1) the training set is TRAIN_SET (40 dives, seeds 1-10 of four kinds); held-out HELD_OUT_SET (40); pool POOL_SET (48) -- not TRAIN_SMALL", (() => { const s = X.setsOf41(); return s.train === T.TRAIN_SET && s.train.length === 40 && s.heldOut === T.HELD_OUT_SET && s.pool === T.POOL_SET && s.train !== T.TRAIN_SMALL_SET; })());
ok("!! (2) seven checkpoints at children 0, 50, ..., 300; the recipe's ES unchanged (4 searches x 300, sigma 0.3, maxK 4); search seeds 97600-97603", J(X.CHECKPOINTS) === J([0, 50, 100, 150, 200, 250, 300]) && X.EVERY === 50 && X.RECIPE === TN.RECIPE && X.SEARCHES === 4 && J(X.SEARCH_SEEDS) === J([97600, 97601, 97602, 97603]));
ok("!! Round 40's policy and gauges, imported: the -0.04 base, REF's and BIAS's gauges", X.retrainPolicy === R40.retrainPolicy && X.BASE_04 === R40.BASE_04 && J(X.BASE_04) === J(SS.SURVEY_CONSTANTS) && X.SOUND === R40.SOUND && X.BIASED === R40.BIASED);
{ const ch = Array.from({ length: X.CHUNKS }, (_, j) => X.chunkRange(j));
  ok("!! CHUNKS is 4 and chunkRange cuts 55001-55300 into four runs of 75 that cover it once, in order; a chunk outside 0..3 is refused", X.CHUNKS === 4 && ch[0][0] === 55001 && ch[3][1] === 55300 && ch.every((c, j) => c[1] - c[0] === 74 && (j === 0 || c[0] === ch[j - 1][1] + 1)) && throws(() => X.chunkRange(4), /not 0\.\.3/)); }
ok("!! notHurts is V3's test: true unless the mean is below -2 se", X.notHurts({ mean: -0.01, se: 0.006 }) && !X.notHurts({ mean: -0.013, se: 0.006 }) && X.notHurts({ mean: 0.05, se: 0.001 }));
ok("!! the audit: seeds 55001-55300 (both, 300 dives), the gate's 55901-55902; arms NEW, CUR, SEAT-04; REF and BIAS; 24 jobs", J(X.SEEDS) === J([55001, 55300]) && X.KIND === "both" && X.DIVES === 300 && J(X.GATE_SEEDS) === J([55901, 55902]) && J(X.ARMS) === J(["NEW", "CUR", "SEAT-04"]) && J(X.COND_NAMES) === J(["REF", "BIAS"]) && X.AUDIT_JOBS.length === 24);

sec("2. TRAINING");
{
    const P = X.retrainPolicy(), s = X.setsOf41({ smoke: true }), rec = { ...X.RECIPE, iters: 6 };
    const a = X.esWithCheckpoints(P, 97600, rec, s.train, 3), b = TN.search(P, 97600, 0, { ...rec, pruneBudget: 0 }, s.train, null);
    ok("!! the ES loop IS trainNeedsCircuit.search() with no prune: the same final weights and train score, child for child (6 children on the smoke set)", a.best.length === b.weights.length && a.best.every((v, i) => v === b.weights[i]) && a.bestScore === b.trainScore && a.improved === b.improved && a.neutral === b.neutral);
    ok("!! checkpoints every `every` children, the start first; each holds the best weights at that child", J(a.checkpoints.map((c) => c.at)) === J([0, 3, 6]) && a.checkpoints[0].weights.every((v, i) => v === P.handWeights()[i]) && a.checkpoints[2].weights.every((v, i) => v === a.best[i]));
    const cp = (h) => h.map((heldOut, i) => ({ at: i * 50, heldOut }));
    ok("!! a search chooses its best held-out checkpoint, ties to the EARLIER (0.80 at child 50 over 0.80 at 150; the start when nothing beats it)", X.chosenOf(cp([0.7, 0.8, 0.75, 0.8])) === 1 && X.chosenOf(cp([0.9, 0.8, 0.85])) === 0 && X.chosenOf(cp([0.7, 0.7, 0.71])) === 2);
    const r = (k, held, pool, at = 50, startPool = 2) => ({ k, seed: X.SEARCH_SEEDS[k], recipe: X.RECIPE, weightCount: 1, weights: [k], checkpoints: X.CHECKPOINTS.map((x) => ({ at: x, heldOut: 0.5 })), chosenAt: at, heldOut: held, poolCrashed: pool, start: { train: 0.5, heldOut: 0.5, poolCrashed: startPool } });
    const recs = [r(0, 0.9, 3), r(1, 0.7, 2), r(2, 0.7, 1), r(3, 0.6, 0)], c = X.championOf(recs);
    ok("!! the champion: eligible = pool crushed no more than the start's; the best held-out, ties to the lower k (k 1 over k 2 at 0.70; k 0 not eligible); not the start", c.record.k === 1 && c.eligible === 3 && !c.none && !c.isStart);
    ok("!! a champion whose chosen checkpoint is child 0 IS THE START (isStart), and none eligible gives the start's weights", X.championOf([r(0, 0.9, 0, 0)]).isStart === true && X.championOf([r(0, 0.9, 5)]).none === true && J(Array.from(X.championWeights([r(0, 0.9, 5)]))) === J(Array.from(X.retrainPolicy().handWeights())));
    ok("!! the ledger: four searches once each, seven checkpoints at 0..300, one recipe, one start, own seeds -- each break named", X.ledgerChecks(recs).length === 0 && /searches are 0,1,2/.test(X.ledgerChecks(recs.slice(0, 3)).join()) &&
        /checkpoints are not/.test(X.ledgerChecks([...recs.slice(0, 3), { ...recs[3], checkpoints: recs[3].checkpoints.slice(0, 6) }]).join()) && /START/.test(X.ledgerChecks([...recs.slice(0, 3), { ...recs[3], start: { ...recs[3].start, train: 0.4 } }]).join()) && /seed/.test(X.ledgerChecks([...recs.slice(0, 3), { ...recs[3], seed: 1 }]).join()));
    const tiny = tryOr(() => X.searchJob(0, { recipe: { iters: 4 }, sets: s, every: 2 }));
    ok("!! a tiny real search: three checkpoints scored on held-out, the chosen one's weights kept (float32 of six decimals), the start's numbers, seed 97600", !tiny.error && tiny.seed === 97600 && tiny.checkpoints.length === 3 && tiny.checkpoints[tiny.chosen].at === tiny.chosenAt && tiny.heldOut === tiny.checkpoints[tiny.chosen].heldOut &&
        tiny.weights.length === tiny.weightCount && tiny.weights.every((v) => v === Math.fround(Math.round(v * 1e6) / 1e6)) && tiny.start.heldOut === tiny.checkpoints[0].heldOut && throws(() => X.searchJob(4), /not 0\.\.3/), tiny.error || "");
}

sec("3. VERDICTS");
const run = (score, i, fp = "f") => ({ score, kind: "both", damage0: i, fingerprint: fp + i });
const r0 = (sc, crashed = 0, fp = "f") => ({ runs: sc.map((s, i) => run(s, i, fp)), crashed, stranded: 0, score: sc.reduce((a, b) => a + b, 0) / sc.length });
const S = [0.5, 0.6, 0.7, 0.8], down = (k) => S.map((v, i) => v - k - i * 0.001), fx = (o = {}) => Object.fromEntries(X.ARMS.map((a) => [a, { REF: (o[a] || {}).REF || r0(S), BIAS: (o[a] || {}).BIAS || r0(S) }]));
{
    ok("!! all null: V1, V2 and V3 hold, and it REPLACES", X.bottomLine(fx()) === "THE BETTER-TRAINED CIRCUIT HOLDS ITS HULL AND ITS SCORE: IT REPLACES THE AQUARIUM'S CIRCUIT PROFILE");
    ok("!! V3 at REF: NEW 0.05 below the seat beyond 2 se MISSES, and the bottom line names it -- Round 40's case, which replaced, would not replace now",
        X.bottomLine(fx({ NEW: { REF: r0(down(0.05)) } })) === "THE BETTER-TRAINED CIRCUIT DOES NOT CLEAR THE LINE (V3 the score at REF): NOTHING IS REPLACED");
    // V3 is BOTH halves (mutant M12, v3 read off REF alone, went 0 red while only the bottom line was asserted): the combined field is held here too
    ok("!! V3 under BIAS is its own line: NEW below the seat under BIAS only names that, and V3 as a whole is then false", X.bottomLine(fx({ NEW: { BIAS: r0(down(0.05)) } })) === "THE BETTER-TRAINED CIRCUIT DOES NOT CLEAR THE LINE (V3 the score under BIAS): NOTHING IS REPLACED" &&
        X.verdictsOf(fx({ NEW: { BIAS: r0(down(0.05)) } })).v3 === false && X.verdictsOf(fx()).v3 === true);
    ok("!! V3 is 'not HURTS': a small loss inside 2 se clears, a gain clears", X.verdictsOf(fx({ NEW: { REF: { ...r0(S.map((v, i) => v - (i % 2 ? 0.02 : -0.019))) } } })).v3ref === true && X.verdictsOf(fx({ NEW: { REF: r0(S.map((v, i) => v + 0.05 + i * 0.001)) } })).v3ref === true);
    ok("!! V1 against the seat's BIAS count (9 against 10 holds, the seat's REF 0 notwithstanding), V2 at REF (6 against 0 misses); every miss named in order",
        X.verdictsOf(fx({ NEW: { BIAS: r0(S, 9) }, "SEAT-04": { BIAS: r0(S, 10) } })).v1 === true &&
        X.bottomLine(fx({ NEW: { REF: r0(down(0.05), 6), BIAS: r0(S, 9) }, "SEAT-04": { BIAS: r0(S, 1) } })) === "THE BETTER-TRAINED CIRCUIT DOES NOT CLEAR THE LINE (V1 the hull under BIAS; V2 the hull at REF; V3 the score at REF): NOTHING IS REPLACED");
    ok("  CUR enters no verdict: CUR far ahead of NEW changes nothing", X.bottomLine(fx({ CUR: { REF: r0(S.map((v) => v + 0.2)), BIAS: r0(S.map((v) => v + 0.2)) } })) === X.bottomLine(fx()));
}

sec("4. CHECKS");
{
    const recs = X.SEARCH_SEEDS.map((seed, k) => ({ k, seed, recipe: X.RECIPE, weightCount: 1, weights: [0], checkpoints: X.CHECKPOINTS.map((at) => ({ at, heldOut: 0.5 })), chosenAt: 0, heldOut: 0.5, poolCrashed: 0, start: { train: 0.5, heldOut: 0.5, poolCrashed: 0 } }));
    const good = () => Object.fromEntries(X.ARMS.map((a, k) => [a, { REF: r0(S, 0, "r" + k), BIAS: r0(S, 0, "b" + k) }]));
    const names = (res, o = {}, rs = recs) => X.checksOf(res, rs, { dives: 4, ...o }).filter((c) => !c.ok).map((c) => c.name);
    ok("!! a well-formed fixture passes all nine checks", names(good()).length === 0 && X.checksOf(good(), recs, { dives: 4 }).length === 9);
    const short = good(); short.CUR.BIAS = r0([0.5, 0.6, 0.7], 0, "b1");
    const swap = good(); swap.NEW.REF.runs = [...swap.NEW.REF.runs].reverse();
    const still = good(); still["SEAT-04"].BIAS = r0(S, 0, "r2");
    const same = good(); same.CUR.REF = r0(S, 0, "r0");
    ok("!! each break fails its own check: SIZES, ALIGNED, THE FAULT REACHES THE PILOT, THE ARMS DIFFER, the ledger, the start, the profile, the shipped seat",
        names(short).includes("SIZES") && names(swap).includes("ALIGNED") && J(names(still)) === J(["THE FAULT REACHES THE PILOT"]) && J(names(same)) === J(["THE ARMS DIFFER"]) && J(names(good(), {}, recs.slice(0, 3))) === J(["THE LEDGER IS COMPLETE"]) &&
        J(names(good(), { start: false })) === J(["NEW'S START IS R04"]) && J(names(good(), { profile: false })) === J(["CUR IS THE AQUARIUM'S CIRCUIT PROFILE"]) && J(names(good(), { shipped: false })) === J(["SEAT-04 IS THE SHIPPED SEAT"]));
    const rep = X.report(still, recs, { dives: 4 });
    ok("!! a failed check says NOT WEIGHED, that nothing is replaced, and draws no verdict", rep.includes("A CHECK FAILED: the verdicts below are NOT WEIGHED and nothing is replaced.") && rep[rep.length - 1] === "BOTTOM LINE: NOT WEIGHED (a check failed)" && !rep.some((l) => /^ {2}V[123] /.test(l)));
    const full = X.report(good(), recs, { dives: 4 }), tl = X.trainingLines(recs);
    ok("  the report: the training lines (a line per search with its held-out by checkpoint and the child it chose; the champion, flagged THE START when child 0), a row per arm, V1, V2, V3, the reported line, one bottom line",
        tl.length === 6 && tl.slice(1, 5).every((l, k) => l.startsWith(`  search ${k} (seed ${X.SEARCH_SEEDS[k]})`) && /chose child 0/.test(l)) && /THE START/.test(tl[5]) &&
        X.ARMS.every((a) => full.some((l) => l.trim().startsWith(a + " "))) && ["V1", "V2", "V3"].every((v) => full.some((l) => l.startsWith(`  ${v} `))) && full.some((l) => l.startsWith("REPORTED, NOT WEIGHED")) && full.filter((l) => l.startsWith("BOTTOM LINE:")).length === 1);
}

sec("5. FLIGHT (the gate's two seeds)");
{
    const set = T.setOf(["both"], X.GATE_SEEDS[0], X.GATE_SEEDS[1]), fps = (p) => T.evaluate(p, set, { gauge: X.BIASED }).runs.map((r) => r.fingerprint).join("|");
    ok("!! CUR is the aquarium's circuit profile (CIRCUIT_CHAMPION on -0.04) on full BIAS dives, and profileSame() says so", fps(X.pilotOf("CUR")) === fps(T.flyDecision(circuitSeat("circuit"))) && X.profileSame(circuitSeat));
    const hand = X.retrainPolicy().handWeights();
    ok("!! NEW flies the weights it is given on the -0.04 seat: the start's are R04's dives (R40.startIsR04), CUR's weights are CUR's dives", fps(X.pilotOf("NEW", { weights: Array.from(hand) })) === fps(R40.pilotOf("NEW", { weights: Array.from(hand) })) && R40.startIsR04() &&
        fps(X.pilotOf("NEW", { weights: Array.from(CIRCUIT_CHAMPION.weights) })) === fps(X.pilotOf("CUR")));
    ok("!! SEAT-04 is the shipped seat (shippedSame)", X.shippedSame());
    ok("  refusals: NEW without weights, an unknown arm or condition", throws(() => X.pilotOf("NEW"), /needs the champion's weights/) && throws(() => X.pilotOf("C06"), /unknown arm/) && throws(() => X.auditJob("CUR", "DROP", "0"), /unknown condition/));
}

sec("6. SOURCE");
{
    const code = fs.readFileSync(new URL("./circuitRetrain2.mjs", import.meta.url), "utf8").split("\n").filter((l) => !/^\s*(\/\/|\/\*\*|\*)/.test(l)).join("\n");   // line and block comments out
    ok("!! Round 40's policy, base and gauges are imported, not rewritten; there is no prune (no tryRevert, no pruneBudget read)", /import \{ retrainPolicy, BASE_04, SOUND, BIASED \} from "\.\/circuitRetrain\.mjs"/.test(code) && !/tryRevert|pruneBudget/.test(code) && !/makeSeat|createPlainPolicy/.test(code));
    ok("!! the seeds appear once each in the code; no clock, random or file", ["97600", "55001", "55300", "55901"].every((s) => (code.match(new RegExp(s, "g")) || []).length === 1) && !/Date\.now|Math\.random|new Date|node:fs|readFile|writeFile/.test(code));
}

finished = true;
console.log(`\n${fails ? "FAIL -- " + fails + " check(s)" : "ALL GREEN"} (${Date.now() - t0} ms)\nnot checked here: what the training finds, and what the champion does on the audit dives.`);
process.exitCode = fails ? 1 : 0;
// SABOTAGE LOG (18 mutants of tools/ship/circuitRetrain2.mjs, each alone, restored byte-identical, sha-256 checked; a red counts only as a FAIL row of a gate that loaded and printed its line):
//   M1 TRAIN_SMALL for the fitness (1 red), M2 checkpoints every 60 (2), M3 search seeds from 97610 (3), M4 the ES dropping neutral moves (1), M5 a checkpoint holding the start (1),
//   M6 ties to the later checkpoint (1), M7 chosen on the train score (1), M8 eligibility strict (2), M9 isStart at the last checkpoint (2), M10 the ledger ignoring the checkpoints (1),
//   M11 the score line always clearing (3), M13 V1 against the seat's REF (1), M14 the bottom line ignoring V2 (1), M15 the bite always true (2), M16 the profile check ignored (1),
//   M17 the report ignoring a failed check (1), M18 CUR flying the rule (2). *** ONE WENT 0 RED ***: M12 (V3 read off REF alone) -- only the bottom line, which reads the two halves,
//   was asserted, so the combined field went unread; the under-BIAS row now holds it: 1 red. 18 of 18.
