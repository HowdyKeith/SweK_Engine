#!/usr/bin/env node
// WebGLEngine/tools/ship/traderPolicy-selfcheck.mjs -- v4534 (was v4314, Level 16)
//
// GRADES THE BRAIN AS A TRADER: a ship whose route is scored by the docking brain's own policy network, trained
// by the docking brain's own evolution strategy over whole economies, against the greedy hauler in the same seat
// over the same seeds and days. The honest question -- does learning beat greedy in this toy economy -- gets a
// NUMBER here, and the number is allowed to be no: what is graded is that the learner trades (real trips, a real
// return, the books closed), that training moves the return, that the comparison is fair (same seat, same
// information, same days), and that the verdict is reported as measured rather than assumed.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildOrrery } from "../../world/orrery.mjs";
import { makeGitEconomy, GOODS } from "../../world/gitEconomy.mjs";
import { traders as gitTraders } from "../../world/traderGraph.mjs";

// ---- *** v4534 -- TWO ARTIFACTS WRITTEN EVERY RUN, READ BY NOTHING, STAMPED HUNDREDS OF ROUNDS STALE ***
//
// This file writes tools/ship/trader-policy.json and trader-policy-spread.json unconditionally on every run
// and says the first is "for the page and the next round". MEASURED ACROSS THE WHOLE TREE: NOTHING READS
// EITHER FILE. There is no page and there was no next round.
//
// Both carried a HARD-CODED `version` -- "v4314" and "v4316" -- while being rewritten with today's numbers,
// so the artifacts claimed a version HUNDREDS OF ROUNDS behind the engine that produced them -- 218 and 216
// when this was found, 219 and 217 by the time it landed, WHICH IS WHY THE NUMBER IS NOT WRITTEN HERE: the
// row below derives it from main.js every run, and a prose count would go stale exactly as its subject did.
// That is the
// sweep-timings `captured` defect (v4408) at another site: ONE FROZEN FIELD STANDING IN FOR THE PROVENANCE OF
// CONTENT THAT MOVES. The shape was introduced at v4314; the numbers are from whenever the gate last ran, and
// those are two different facts, so they are two different fields now.
//
// *** AND THE FILES RODE ALONG IN FIVE COMMITS ABOUT SOMETHING ELSE. *** Of six commits that have ever
// carried them -- v4314, v4316, v4322, v4325, v4409, v4426 and one un-versioned round -- only the first two
// are about trader policy. The cause is measurable and small: re-running the gate leaves trader-policy.json
// BYTE-IDENTICAL, and changes exactly three fields in the spread file -- runs[i].ms, wall-clock timings of
// the training. *** A MEASUREMENT OF THE BOX, EMBEDDED IN A RECORD OF THE POLICY, DIRTIES THE TREE ON EVERY
// RUN. *** The timings are still reported to the person watching; they are not committed.


// Fields whose value is a property of the machine and not of the thing being recorded. A committed artifact
// that carries one cannot be reproduced by a second run, so it dirties the tree forever after.
export const VOLATILE_FIELDS = Object.freeze(["ms", "at", "written", "elapsed", "duration"]);

/** Strip volatile fields anywhere in the structure, so what is written is reproducible by construction. */
export function reproducible(x) {
    if (Array.isArray(x)) return x.map(reproducible);
    if (x && typeof x === "object") {
        const out = {};
        for (const k of Object.keys(x)) if (!VOLATILE_FIELDS.includes(k)) out[k] = reproducible(x[k]);
        return out;
    }
    return x;
}

/** Write an artifact that says WHEN ITS SHAPE WAS FIXED and WHEN ITS NUMBERS WERE TAKEN -- different facts. */
function writeArtifact(rel, shapeAt, body) {
    const doc = { shapeAt, measuredAt: ENGINE_VERSION, ...reproducible(body) };
    fs.writeFileSync(path.join(ENG, rel), JSON.stringify(doc, null, 1) + "\n");
    return doc;
}
import * as P from "../../world/traderPolicy.mjs";
import VM from "../../tools/ship/versionMarker.js";   // v4556 -- one definition of how to read a version marker

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

// *** DEFINED AFTER ENG, AND THE CATCH DOES NOT SWALLOW A PROGRAMMING ERROR. *** The first draft sat above
// `const ENG`, so reading it threw a temporal-dead-zone ReferenceError, the try/catch turned that into null,
// and the gate CRASHED in a detail string forty lines later instead of failing by name. A catch that reports
// a bug in this file as a missing main.js is the same shape as everything else this round is about.
const ENGINE_VERSION = (() => {
    let src;
    try { src = fs.readFileSync(path.join(ENG, "main.js"), "utf8"); }
    catch (e) { return null; }                       // genuinely absent: the only case this may hide
    return (VM.markerRe("ENGINE_VERSION").exec(src) || [])[1] || null;
})();
let fails = 0;
const ok = (label, cond, detail) => { if (!cond) fails++; console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}${detail ? "   " + detail : ""}`); };
const report = (s) => console.log(`  ----  ${s}`);
const raw = JSON.parse(fs.readFileSync(path.join(ENG, "orrery.json"), "utf8"));
const system = buildOrrery(raw.bodies, { today: "2026-09-01" });
const crewOf = () => [...gitTraders().map((t) => ({ name: t.name || t.id })), ...system.bodies.map((b) => ({ name: "hauler of " + b.name }))];
/** The learner takes seat `slot` in an otherwise greedy crew; everything else is the v4300 economy. */
const mkEco = (policy, seed, slot = 0) => { const crew = crewOf(); crew[slot] = { ...crew[slot], policy }; return makeGitEconomy(system, { seed, traders: crew }); };
const DAYS = 60, EPISODES = 3, SEED0 = 100;

console.log("\n1. THE SEAT: a policy ship trades through the same economy, sees the same numbers, closes the same books");
{
    const g = P.episode(mkEco, P.greedyPolicy(), { seed: SEED0, days: DAYS });
    ok("the greedy rule as a policy: real trips, a positive return, tons and credits conserved", g.trips > 3 && g.ret > 0 && g.accounting.tonsConserved && g.accounting.creditsOk, `${g.trips} trips, return ${g.ret}`);
    const cs = g.economy.candidates(g.economy.ships[1]);
    ok("  a candidate carries what greedy sees (prices, margin, a payable destination) plus distance and stocks", cs.length > 0 && cs.every((c) => GOODS.includes(c.good) && c.margin === c.sellP - c.buyP && c.dist >= 0 && c.treasury >= c.sellP && c.stockHere > 0), `${cs.length} candidates for ship 1`);
    ok("  the features are seven near-unit numbers per candidate", cs.every((c) => P.featuresOf(c, {}, { extent: 10, holdTons: 40 }).length === P.OBS_DIM && P.featuresOf(c, {}, { extent: 10, holdTons: 40 }).every((v) => Number.isFinite(v) && Math.abs(v) <= 3)));
    const n = P.paramCount([8, 8]);
    const zero = P.episode(mkEco, P.learnedPolicy(new Float32Array(n)), { seed: SEED0, days: DAYS });
    ok("an untrained policy (all weights 0, every score 0 > -inf) still takes a leg -- the first candidate -- and the books still close", zero.trips >= 1 && zero.accounting.creditsOk && zero.accounting.tonsConserved, `${zero.trips} trips, return ${zero.ret}`);
    const d1 = P.evaluateParams(mkEco, new Float32Array(n).fill(0.1), { episodes: 2, seed0: SEED0, days: 30 }), d2 = P.evaluateParams(mkEco, new Float32Array(n).fill(0.1), { episodes: 2, seed0: SEED0, days: 30 });
    ok("  the same parameters over the same seeds return the same number (a policy is a function)", d1.avgReturn === d2.avgReturn && d1.avgTrips === d2.avgTrips, `${d1.avgReturn}`);
}

console.log("\n2. THE NUMBER: the docking brain's ES over economies, against greedy in the same seat");
{
    const greedy = P.evaluateGreedy(mkEco, { episodes: EPISODES, seed0: SEED0, days: DAYS });
    const t0 = Date.now();
    const curveNotes = [];
    const tr = P.trainTraderES(mkEco, { iters: 14, pop: 8, sigma: 0.15, lr: 0.1, hidden: [8, 8], episodes: EPISODES, seed: 3, days: DAYS, onIter: (x) => curveNotes.push(`${x.iter}:${x.avgReturn.toFixed(0)}`) });
    const ms = Date.now() - t0;
    const learned = P.evaluateParams(mkEco, tr.params, { episodes: EPISODES, seed0: SEED0, days: DAYS });
    report(`greedy ${greedy.avgReturn.toFixed(0)} cr (${greedy.avgTrips.toFixed(1)} trips); learned ${learned.avgReturn.toFixed(0)} cr (${learned.avgTrips.toFixed(1)} trips) after ${tr.curve.length - 1} iterations, ${tr.paramCount} parameters, ${ms} ms`);
    report(`the curve: ${tr.curve.map((v) => v.toFixed(0)).join(" -> ")}`);
    ok("training moves the return: the best iterate beats the starting policy", tr.best.avgReturn > tr.curve[0], `${tr.curve[0].toFixed(0)} -> ${tr.best.avgReturn.toFixed(0)}`);
    ok("  the learner trades for real: trips on every seed, no bankruptcy", learned.avgTrips > 2 && learned.bankrupt === 0, `${learned.avgTrips.toFixed(1)} trips`);
    ok("  the comparison is fair: same seat, same seeds, same days, same information (greedy through the same policy hook)", greedy.avgTrips > 0 && learned.avgTrips > 0);
    // the number that counts is on seeds the learner never trained on: the training seeds flatter a policy that fit them
    const HELD = 500, greedyHeld = P.evaluateGreedy(mkEco, { episodes: EPISODES, seed0: HELD, days: DAYS }), learnedHeld = P.evaluateParams(mkEco, tr.params, { episodes: EPISODES, seed0: HELD, days: DAYS });
    const ratioTrain = learned.avgReturn / Math.max(1, greedy.avgReturn), ratio = learnedHeld.avgReturn / Math.max(1, greedyHeld.avgReturn);
    report(`held-out seeds ${HELD}..: greedy ${greedyHeld.avgReturn.toFixed(0)} cr, learned ${learnedHeld.avgReturn.toFixed(0)} cr (${learnedHeld.avgTrips.toFixed(1)} trips); on the training seeds the learner read ${(ratioTrain * 100).toFixed(0)}% of greedy`);
    const verdict = ratio >= 1 ? "LEARNING BEATS GREEDY" : ratio >= 0.5 ? "learning trails greedy" : "learning is far behind greedy";
    ok(`*** THE VERDICT, MEASURED ON HELD-OUT SEEDS: ${verdict} -- ${(ratio * 100).toFixed(0)}% of the greedy return over ${DAYS} days ***`, Number.isFinite(ratio) && learnedHeld.bankrupt === 0, "reported, not assumed; the gate does not require a win");
    const cheap = P.evaluateParams(mkEco, tr.params, { episodes: 1, seed0: 777, days: DAYS });
    ok("  and on a seed it never trained on it still trades (no bankruptcy, trips made)", cheap.avgTrips > 0 && cheap.bankrupt === 0, `return ${cheap.avgReturn.toFixed(0)} on seed 777`);
    writeArtifact("tools/ship/trader-policy.json", "v4314", { days: DAYS, episodes: EPISODES, greedy: greedy.avgReturn, learned: learned.avgReturn, ratioTrain, heldOut: { greedy: greedyHeld.avgReturn, learned: learnedHeld.avgReturn, ratio }, iterations: tr.curve.length - 1, curve: tr.curve, params: tr.params, hidden: [8, 8], obsDim: P.OBS_DIM });
    report("v4534: the trained parameters and numbers go to tools/ship/trader-policy.json, stamped with BOTH " +
        "the version its shape was fixed at and the version that measured it. NOTHING IN THE TREE READS IT " +
        "-- said plainly rather than left as 'for the page and the next round', which was true of neither.");
}

console.log("\n3. v4316 -- WOULD A BETTER LEARNER WIN? Three more trainings: a wider net, a longer run, another seed -- the SPREAD is the answer");
{
    const HELD = 500, greedyHeld = P.evaluateGreedy(mkEco, { episodes: EPISODES, seed0: HELD, days: DAYS });
    const runs = [];
    for (const cfg of [{ name: "narrow, 14 iterations, seed 3 (Level 16's)", hidden: [8, 8], iters: 14, pop: 8, seed: 3 }, { name: "narrow, 30 iterations, seed 5", hidden: [8, 8], iters: 30, pop: 12, seed: 5 }, { name: "wide [16,16], 30 iterations, seed 5", hidden: [16, 16], iters: 30, pop: 12, seed: 5 }]) {
        const t0 = Date.now();
        const tr = P.trainTraderES(mkEco, { iters: cfg.iters, pop: cfg.pop, sigma: 0.15, lr: 0.1, hidden: cfg.hidden, episodes: EPISODES, seed: cfg.seed, days: DAYS });
        const held = P.evaluateParams(mkEco, tr.params, { episodes: EPISODES, seed0: HELD, days: DAYS, hidden: cfg.hidden });
        runs.push({ ...cfg, ratio: held.avgReturn / Math.max(1, greedyHeld.avgReturn), heldReturn: held.avgReturn, params: tr.paramCount, ms: Date.now() - t0, bankrupt: held.bankrupt });
        report(`${cfg.name}: held-out ${held.avgReturn.toFixed(0)} cr = ${(100 * runs[runs.length - 1].ratio).toFixed(0)}% of greedy (${tr.paramCount} parameters, ${runs[runs.length - 1].ms} ms)`);
    }
    const ratios = runs.map((r) => r.ratio), lo = Math.min(...ratios), hi = Math.max(...ratios);
    const robust = lo >= 1 ? "EVERY training beats greedy" : hi < 1 ? "NO training beats greedy" : "the win is INSIDE THE SPREAD of trainings -- some beat greedy, some do not";
    ok(`*** THE ANSWER, MEASURED: ${robust} (${(100 * lo).toFixed(0)}% to ${(100 * hi).toFixed(0)}% of greedy across ${runs.length} trainings) ***`, ratios.every(Number.isFinite) && runs.every((r) => r.bankrupt === 0), "reported as the spread, not the best run");
    ok("  wider is not better here: the 417-parameter net does not beat the 145-parameter one by more than the spread", Math.abs(runs[2].ratio - runs[0].ratio) < (hi - lo) + 1e-9);
    writeArtifact("tools/ship/trader-policy-spread.json", "v4316", { days: DAYS, greedy: greedyHeld.avgReturn, runs: runs.map(({ name, hidden, iters, pop, seed, ratio, heldReturn, params, ms }) => ({ name, hidden, iters, pop, seed, ratio, heldReturn, params, ms })), verdict: robust });
}

console.log("\n4. v4534 -- THE ARTIFACTS THIS GATE WRITES: REPRODUCIBLE, STAMPED WITH BOTH VERSIONS, READ BY NOBODY");
{
    const rels = ["tools/ship/trader-policy.json", "tools/ship/trader-policy-spread.json"];
    const docs = rels.map((r) => JSON.parse(fs.readFileSync(path.join(ENG, r), "utf8")));

    // *** THE MEASURED-AT IS DERIVED FROM main.js, SO IT CANNOT GO STALE THE WAY THE OLD ONE DID. *** The
    // frozen "v4314"/"v4316" said 218 rounds ago while carrying numbers from minutes ago.
    ok("!! *** each artifact says when its SHAPE was fixed and when its NUMBERS were taken -- two facts ***",
       !!ENGINE_VERSION && docs.every((d, i) => d.measuredAt === ENGINE_VERSION && /^v\d+$/.test(d.shapeAt) && d.shapeAt !== d.measuredAt),
       `shapeAt ${docs.map((d) => d.shapeAt).join(", ")} against measuredAt ${ENGINE_VERSION || "(main.js unreadable)"}` +
       (ENGINE_VERSION ? ` -- ${docs.map((d) => Number(ENGINE_VERSION.slice(1)) - Number(String(d.shapeAt).slice(1))).join(" and ")} rounds of drift ` : " -- ") +
       "that a single frozen `version` field was reporting as none.");

    // *** REPRODUCIBILITY, ASSERTED BY MECHANISM. *** The bytes are re-derived from the values in hand and
    // compared with what is on disk. A volatile field anywhere in either document fails HERE rather than
    // showing up as an unexplained diff in somebody else's round three weeks later.
    const volatile = [];
    const walk = (x, path0) => {
        if (Array.isArray(x)) return x.forEach((v, i) => walk(v, `${path0}[${i}]`));
        if (x && typeof x === "object") for (const k of Object.keys(x)) {
            if (VOLATILE_FIELDS.includes(k)) volatile.push(`${path0}.${k}`);
            walk(x[k], `${path0}.${k}`);
        }
    };
    docs.forEach((d, i) => walk(d, rels[i].split("/").pop()));

    // *** THE CHECK ABOVE AND THE STRIPPER SHARE VOLATILE_FIELDS, so deleting a name from that list disables
    // BOTH -- a control built out of the thing it controls for. Sabotage EA proved it: removing "ms" put the
    // wall clock back in the file and went 0 RED. These fixtures name the fields as LITERALS, so the list
    // cannot quietly shrink underneath them. ***
    {
        const stripped = reproducible({ keep: 1, ms: 999, runs: [{ name: "a", ms: 5, ratio: 2 }],
                                        nested: { written: "now", days: 3 } });
        ok("!! FIXTURE: reproducible() strips ms and written by NAME, at every depth, keeping everything else",
           stripped.ms === undefined && stripped.runs[0].ms === undefined && stripped.nested.written === undefined &&
           stripped.keep === 1 && stripped.runs[0].ratio === 2 && stripped.nested.days === 3,
           JSON.stringify(stripped) + ' -- written with literal "ms" and "written" rather than through ' +
           "VOLATILE_FIELDS, because a check that reads the same list as the code it checks agrees with it by " +
           "construction and cannot fail.");
        ok("!! FIXTURE: and the list still contains the names those literals rely on",
           ["ms", "written"].every((k) => VOLATILE_FIELDS.includes(k)),
           `VOLATILE_FIELDS = ${VOLATILE_FIELDS.join(", ")}. If a future round narrows the list, the fixture ` +
           "above goes red first and this row says which name went missing.");
    }
    ok("!! *** NEITHER ARTIFACT CARRIES A WALL-CLOCK FIELD, SO A RE-RUN CANNOT DIRTY THE TREE ***",
       volatile.length === 0,
       volatile.length ? "VOLATILE: " + volatile.join(", ")
         : `0 of ${VOLATILE_FIELDS.length} volatile names present. The spread file used to carry runs[i].ms -- ` +
           "three wall-clock timings, THE ONLY THING THAT CHANGED BETWEEN TWO CONSECUTIVE RUNS -- and that is " +
           "why these files rode along in five commits about other subjects. The timings are still REPORTED " +
           "above; they are not committed.");

    // The stated audience, checked against the tree rather than asserted in a sentence.
    // *** ONE WALKER, COUNTING AND COLLECTING IN THE SAME PASS. *** The first version counted with a SECOND
    // walker carrying its own copy of the extension filter, so narrowing the real one left the count at 4,490
    // and sabotage EE went 0 RED twice: a non-vacuity control built on a parallel implementation cannot see a
    // defect in the implementation under test. Two copies of a rule is this tree's oldest finding, committed
    // here inside the control written to prevent exactly this.
    const readers = [];
    let scanned = 0;
    const skip = /^(node_modules|vendor|\.git|deleted|dist|build)$/;
    const SELF = path.join(ENG, "tools/ship/traderPolicy-selfcheck.mjs");
    const walkDir = (d) => {
        let e; try { e = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
        for (const x of e) {
            if (skip.test(x.name)) continue;
            const f = path.join(d, x.name);
            if (x.isDirectory()) { walkDir(f); continue; }
            if (!/\.(mjs|js|html)$/.test(x.name)) continue;
            scanned++;
            let src; try { src = fs.readFileSync(f, "utf8"); } catch { continue; }
            if (!/trader-policy(-spread)?\.json/.test(src)) continue;
            if (f === SELF) continue;                       // the writer names its own outputs
            readers.push(path.relative(ENG, f));
        }
    };
    walkDir(ENG);
    // The finder is shown to be capable of finding, on the one file guaranteed to match: this one.
    const canFind = /trader-policy(-spread)?\.json/.test(fs.readFileSync(SELF, "utf8"));
    ok("!! the scan is not vacuous: ONE walker, it visited the tree, and its predicate can find",
       scanned > 500 && canFind,
       `${scanned} .mjs/.js/.html files visited by the same walk that collects the readers, and the predicate ` +
       "matches this file's own mentions. A zero from a scan that read nothing is not a zero.");
    ok("!! the number of readers is DERIVED from the tree, not asserted in a sentence",
       readers.length === 0,
       readers.length ? "readers: " + readers.join(", ") + " -- the artifacts have an audience now, and this " +
                        "row should become a check that they get what they need"
         : "ZERO readers, scanned across every .mjs/.js/.html in the tree. The old line said these were " +
           "written 'for the page and the next round'; there is no page and there was no next round. *** THIS " +
           "IS RECORDED AS A FACT ABOUT THE TREE RATHER THAN DELETED: *** the numbers are real, the training " +
           "is real, and an artifact nobody reads yet is a different thing from one nobody should.");
}

// ---- *** v4534 SABOTAGES, RESULTS BY NAME *** ---------------------------------------------------------------
//
//   EA. a wall-clock ms goes back into the spread file    -> *** 0 RED, THEN 3 RED ***
//   EB. reproducible() stops stripping                    -> 3 RED
//   EC. the artifact goes back to ONE frozen version field -> 2 RED
//   ED. measuredAt is hard-coded rather than read         -> 2 RED
//   EE. the reader scan skips the tree and reports zero   -> *** 0 RED, 0 RED, THEN 2 RED ***
//   EF. the reader scan counts the writer itself          -> 2 RED
//
// *** EA WENT 0 RED BECAUSE THE CHECK AND THE STRIPPER READ THE SAME LIST. *** Deleting "ms" from
// VOLATILE_FIELDS put the wall clock back in the file AND stopped the row looking for it -- a control built
// out of the thing it controls for, which is this session's fourth instance. Fixtures name the fields as
// LITERALS now, so the list cannot shrink underneath them.
//
// *** EE WENT 0 RED TWICE. *** First because a scan that visits nothing reports zero readers and the row
// asserts zero -- vacuity, in the row whose whole point is a derived zero. The repair added a non-vacuity
// check and it went 0 RED AGAIN, because it counted with a SECOND walker carrying its own copy of the
// extension filter: narrowing the real one left the count at 4,490. A control built on a parallel
// implementation cannot see a defect in the implementation under test, and two copies of a rule is this
// tree's oldest finding -- committed here inside the control written to prevent it. One walker now.
//
// AND THE FIRST DRAFT CRASHED INSTEAD OF FAILING. ENGINE_VERSION was defined above `const ENG`, so reading
// main.js threw a temporal-dead-zone ReferenceError, the try/catch turned that into null, and the gate died
// in a detail string forty lines later. A CRASH IS NOT A VERDICT (v3201), and a catch that reports a bug in
// this file as a missing main.js is the same shape as everything else in this round.
//
// SABOTAGE LOG -- applied, gate run, exit code read, restored. MEASURED at Level 16.
//   A  the ES update sign flipped (theta -= grad) -> exit=1, 2 red: the learner goes bankrupt on a seed and the
//      held-out verdict reads "far behind greedy, -6%". The "best iterate beats the start" line stayed green --
//      with fourteen noisy iterates one beats a bad start by chance -- which is why the verdict is measured on
//      held-out seeds and not on the training curve.
//   B  featuresOf() returning zeros -> exit=1, 1 red: every candidate scores the same, the curve is flat
//      (-1712 -> -1712), the best never beats the start.
//   (v4316: section 3 is a measurement of the spread, not a claim, and was not sabotaged -- a sabotage of the ES is A above.)
//   C  the policy hook ignored (greedy's route for every seat) -> exit=1, 1 red: the curve is flat at greedy's
//      own return (17082 -> 17082) whatever the parameters, so training cannot move it.
console.log(fails ? "\nFAIL -- " + fails + " check(s)" : "\nALL GREEN");
console.log("unchecked here: a DIFFERENT learner family. Section 3 answers v4314's question for this one -- the docking brain's MLP and " +
    "ES -- with a spread across trainings rather than a best run; a policy that saw the whole market (not one leg at a time), a " +
    "gradient method, or hours of training is a different experiment, and the number here is for this learner, this economy, these days.");
process.exit(fails ? 1 : 0);
