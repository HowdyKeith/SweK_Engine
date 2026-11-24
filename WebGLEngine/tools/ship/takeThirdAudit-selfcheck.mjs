// WebGLEngine/tools/ship/takeThirdAudit-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node tools/ship/takeThirdAudit-selfcheck.mjs      (about 5 s)
//
// THE GATE OF tools/ship/takeThirdAudit.mjs (+ takeThirdAuditCmd.mjs): the reader of the plain net's third audit, registered in brain/PLAIN_THIRD_AUDIT_WIP.md before any code. The audit files here are SYNTHETIC (built by this gate with the lead of the plain net chosen), except the earlier audit files, which are the real ones in brain/ (their leads are the numbers the notes printed). No arm is flown on the registered block.
//   1  THE CONSTANTS   the block (20001 to 20600, far and both), the arms, the digest (against the earlier audit files that recorded it), the series' two-se factor and floor, the hull thresholds, the registered words.
//   2  THE AUDIT FILE  readAudit refuses by its words.
//   3  THE CHECKS      all four pass on a good audit, word for word; each fails by its words.
//   4  THE READINGS    the verdict at the edge of 2 se and at zero; the pool (by hand); the floor; the hull numbers (strictly above a threshold); the leads read from the earlier files (synthetic and the real ones).
//   5  THE REPORT      word for word at the three readings, the pool and the hull lines, the label of a block that is not the registered one, the failed-check shape, the fourth reading.
//   6  THE COMMAND     the arguments and their refusals, the files through the seams, the real default files and the command line as a child process.
// NOT CHECKED, said plainly: the flight on the registered block (not made until the read); that a synthetic audit's numbers mean anything (they exercise the arithmetic and the words).
//
// SABOTAGE LOG (2026-11-07), tools/ship/takeThirdAudit.mjs -- 183 mutants: 160 mechanical (every comparison, sign, arithmetic operator, constant +-1 and boolean of every code line, one at a time) and 23 by hand (the pool's weights and se, the floor strict, the hull thresholds inclusive or reversed, a null strain counted, the weights, keys, arms, scores and unknown-arm checks switched off, duplicates allowed, the verdict read at twice the se, the label ignoring the kinds, Q1 reversed, the first and second files swapped, the fourth file read for another arm, the hull test's arguments swapped, the pool without the third audit or without the second, crushed counted as stranded), plus 2 of takeThirdAuditCmd.mjs; each applied to an isolated tree and this gate run; the file restored (sha256 db67419a... identical before and after).
//   FIRST PASS (40 rows): 153 red, 22 threw, 10 went 0 red. THE TEN: the printed sign of a lead of exactly 0 and of a lead that rounds to -0.0000 (the guard's decimals), the verdict read at twice the se (no lead between 2 and 4 se had been tried), and the rule's own hull numbers in the hull line and the bottom line (the rule had been given the same strains as the plain net, 0 and 0, in every test). Rows were written for each. SECOND PASS: the ten re-run against the 42-row gate: 7 red, 3 went 0 red.
//   THREE WERE ARGUED EQUIVALENT AND NOT KILLED: in readingOf, `p.mean > 0` as `>= 0`, `p.mean < 0` as `<= 0` and `p.mean < 0` as `< 1` after the clause that already returns TIE for a mean within 1e-9 of zero: a mean of exactly 0 never reaches them, a positive mean cannot satisfy `-p.mean > Z * p.se` (the se is not negative), and a mean of 1 or more is above zero either way. None can change a word the report prints.
//
"use strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import * as X from "./takeThirdAudit.mjs";
import * as RV from "./takeRankingValidity.mjs";
import * as B from "../../brain/switchboard.mjs";
import { keysOf } from "./takeDecisionCircuit.mjs";
import { MIN_EDGE } from "./trainNeedsCircuit.mjs";
import { readRecords } from "./trainSubCircuits.mjs";

let fails = 0, finished = false;
const died = (e) => { console.log("  FAIL  !! THE GATE THREW before it finished, which is a failure of whatever it was asking: " + String((e && e.stack) || e).split("\n").slice(0, 3).join(" | ").slice(0, 400)); process.exit(1); };
process.on("uncaughtException", died); process.on("unhandledRejection", died);
process.on("exit", () => { if (!finished) { console.log("  FAIL  !! THE GATE ENDED BEFORE IT FINISHED"); process.exitCode = 1; } });
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const sec = (t) => console.log("\n" + t);
const J = JSON.stringify;
const msg = (f) => { try { f(); return null; } catch (e) { return e.message; } };
const HERE = path.dirname(fileURLToPath(import.meta.url)), ENG = path.resolve(HERE, "..", "..");
const text = (f) => fs.readFileSync(path.join(ENG, f), "utf8");
console.log("takeThirdAudit-selfcheck -- the third audit of the plain net\n");

// ---- synthetic audits: the lead of plain:2 chosen, the strain pattern chosen, the same dives for both arms
const SMALL = { from: 1, to: 50 };
const mkAudit = ({ lead = 0.01, jitter = 0.02, range = SMALL, kinds = ["far", "both"], digest = "c916e7f5", strainOf = () => 0.5, ruleStrainOf = () => 0.5, over = {}, drop = [] } = {}) => {
    const ks = keysOf(range, kinds), arms = {
        "rule-low06": { arm: "rule-low06", range, kinds, seconds: null, runs: ks.map((key, i) => ({ key, score: 0.5, bad: false, crushed: false, stranded: false, maxStrain: ruleStrainOf(i) })) },
        "plain:2": { arm: "plain:2", range, kinds, seconds: null, digest, runs: ks.map((key, i) => ({ key, score: 0.5 + lead + (i % 2 ? -jitter : jitter), bad: false, crushed: false, stranded: false, maxStrain: strainOf(i) })), family: "plain", index: 2, champion: true } };
    for (const d of drop) delete arms[d];
    return { arms: { ...arms, ...over } };
};
const textOf = (au) => Object.values(au.arms).map((a) => J(a)).join("\n") + "\n";
const sg4 = (x) => (x >= 0 ? "+" : "") + x.toFixed(4);

sec("1. THE CONSTANTS");
{
    const reg = text("brain/PLAIN_THIRD_AUDIT_WIP.md");
    ok("!! the block is seeds 20001 to 20600 of far and both, frozen, as registered; the audit file and the arms are the registered names", J(X.RANGE) === J({ from: 20001, to: 20600 }) && J(X.KINDS) === J(["far", "both"]) && Object.isFrozen(X.RANGE) && Object.isFrozen(X.KINDS) && X.AUDIT_FILE === "brain/plainThirdAudit.jsonl" && X.RULE_ARM === "rule-low06" && X.PLAIN_ARM === "plain:2" && J(X.ARM_IDS) === J(["rule-low06", "plain:2"]) && /Seeds \*\*20001 to 20600\*\*/.test(reg) && /brain\/plainThirdAudit\.jsonl/.test(reg));
    const recorded = []; for (const f of ["brain/decisionCircuitAudit.jsonl", "brain/stationRoundAudit.jsonl"]) for (const r of readRecords(text(f))) if (r.arm === "circuit-plain") recorded.push(r.champion.digest);
    ok("!! the digest is the plain net's: both earlier audit files recorded c916e7f5 for circuit-plain, and it is the digest of the search plain:2 of the ranking-validity module", X.PLAIN_DIGEST === "c916e7f5" && recorded.length === 2 && recorded.every((d) => d === X.PLAIN_DIGEST) && RV.CHAMPION_DIGESTS.plain === X.PLAIN_DIGEST);
    ok("!! the series' factor of 2 se, the floor of 0.02 (the series' MIN_EDGE) and the hull thresholds 0.92 and 0.95; the earlier-file names are the registered ones", X.Z === 2 && X.Z === B.SE_FACTOR && X.FLOOR === 0.02 && X.FLOOR === MIN_EDGE && J(X.THRESHOLDS) === J([0.92, 0.95]) && Object.isFrozen(X.THRESHOLDS) && X.FIRST_FILE === "brain/decisionCircuitAudit.jsonl" && X.SECOND_FILE === "brain/stationRoundAudit.jsonl" && X.FOURTH_FILE === "brain/rankingValidityAudit.jsonl");
    ok("!! the three bottom lines are the registration's words", ["THE PLAIN NET'S GAIN REPLICATES", "THE PLAIN NET IS BELOW THE RULE", "THE PLAIN NET'S GAIN DOES NOT REPLICATE (A TIE)"].every((w) => reg.includes(w)) && X.bottomLine("REPLICATES") === "THE PLAIN NET'S GAIN REPLICATES" && X.bottomLine("BELOW") === "THE PLAIN NET IS BELOW THE RULE" && X.bottomLine("TIE") === "THE PLAIN NET'S GAIN DOES NOT REPLICATE (A TIE)");
}

sec("2. THE AUDIT FILE");
{
    const rd = X.readAudit(textOf(mkAudit()));
    ok("!! readAudit gives the two arms by name", Object.keys(rd.arms).join() === "rule-low06,plain:2" && rd.arms["plain:2"].digest === "c916e7f5");
    ok("!! readAudit refuses by its words: an arm that is neither the rule nor plain:2, an arm twice, a line with no arm, a line that is not JSON; an empty text is no arms", msg(() => X.readAudit(J({ arm: "cx:0", runs: [] }))) === 'takeThirdAudit.readAudit: unknown arm "cx:0" (rule-low06, plain:2)' && msg(() => X.readAudit(J({ arm: "plain:2" }) + "\n" + J({ arm: "plain:2" }))) === "takeThirdAudit.readAudit: arm plain:2 is in the file twice (the audit is read once)" && msg(() => X.readAudit(J({ x: 1 }))) === "takeThirdAudit.readAudit: a line has no arm" && msg(() => X.readAudit("{no")) === "results file line 1 is not JSON" && Object.keys(X.readAudit("").arms).length === 0);
}

sec("3. THE CHECKS");
{
    const by = (rows, n) => rows.find((r) => r.name === n), chk = (o) => X.checksOf(X.readAudit(textOf(mkAudit(o))));
    const good = chk({});
    ok("!! on a good audit the four checks come in this order and all pass, word for word", good.map((c) => c.name).join() === "ARMS,WEIGHTS,KEYS,SCORES" && good.every((c) => c.ok) && good[0].text === "rule-low06 and plain:2, once each" && good[1].text === "plain:2 flew the weights of the plain net the earlier audits flew (digest c916e7f5)" && good[2].text === "both arms flew the same 100 dives in the same order (seeds 1 to 50 of far and both)" && good[3].text === "every score is a number in [0, 1] and every strain a number or null", good.map((c) => c.text).join(" | "));
    ok("!! ARMS: an arm not flown is named (the rule, plain:2, both: in the order rule then plain:2), and the checks that need it fail by their words too", by(chk({ drop: ["plain:2"] }), "ARMS").text === "not flown: plain:2" && by(chk({ drop: ["rule-low06"] }), "ARMS").text === "not flown: rule-low06" && by(chk({ drop: ["rule-low06", "plain:2"] }), "ARMS").text === "not flown: rule-low06, plain:2" && by(chk({ drop: ["plain:2"] }), "WEIGHTS").text === "plain:2 was not flown" && by(chk({ drop: ["plain:2"] }), "KEYS").text === "both arms are needed to compare the dives" && by(chk({ drop: ["plain:2"] }), "SCORES").text === "an arm is missing" && by(chk({ drop: ["plain:2"] }), "WEIGHTS").ok === false && by(chk({ drop: ["rule-low06"] }), "KEYS").ok === false);
    const wr = by(chk({ digest: "deadbeef" }), "WEIGHTS"), no = (() => { const a = mkAudit(); delete a.arms["plain:2"].digest; return by(X.checksOf(X.readAudit(textOf(a))), "WEIGHTS"); })();
    ok("!! WEIGHTS: another digest is named with both digests; no digest at all fails too", wr.ok === false && wr.text === "plain:2 flew other weights (digest deadbeef) than the plain net the earlier audits flew (c916e7f5)" && no.ok === false);
    const a = mkAudit(), shifted = { ...a.arms["plain:2"], runs: [...a.arms["plain:2"].runs.slice(1), a.arms["plain:2"].runs[0]] };
    const kc = (over) => by(X.checksOf(X.readAudit(textOf(mkAudit({ over })))), "KEYS");
    ok("!! KEYS: plain:2 flying the dives in another order, another range or other kinds is named; the rule's own file is the reference", kc({ "plain:2": shifted }).text === "plain:2 did not fly the dives of the rule's file in the same order" && kc({ "plain:2": { ...a.arms["plain:2"], range: { from: 1, to: 51 } } }).ok === false && kc({ "plain:2": { ...a.arms["plain:2"], kinds: ["both", "far"] } }).ok === false && kc({ "plain:2": { ...a.arms["plain:2"], runs: a.arms["plain:2"].runs.slice(0, 99) } }).ok === false && kc({}).ok === true);
    const sc = (f) => { const x = mkAudit(); x.arms["plain:2"] = { ...x.arms["plain:2"], runs: x.arms["plain:2"].runs.map((r, i) => (i === 0 ? { ...r, ...f } : r)) }; return by(X.checksOf(X.readAudit(textOf(x))), "SCORES"); };
    const sr = (() => { const x = mkAudit(); x.arms["rule-low06"].runs[0].score = 1.5; return by(X.checksOf(X.readAudit(textOf(x))), "SCORES"); })();
    ok("!! SCORES: a score above 1, below 0, null (a NaN through JSON) or a string, or a strain that is a string, fails naming the arm; 0 and 1 and a null strain pass; the rule's scores are read too", [{ score: 1.01 }, { score: -0.01 }, { score: null }, { score: "0.5" }, { maxStrain: "x" }].every((f) => { const r = sc(f); return r.ok === false && r.text === "plain:2 hold a score outside [0, 1] or a strain that is not a number"; }) && sc({ score: 1 }).ok === true && sc({ score: 0 }).ok === true && sc({ maxStrain: null }).ok === true && sr.ok === false && sr.text === "rule-low06 hold a score outside [0, 1] or a strain that is not a number");
}

sec("4. THE READINGS");
{
    ok("!! the verdict at the edge of 2 se: a lead of exactly 2 se is a TIE, just above REPLICATES, just below zero by 2 se BELOW, exactly -2 se a TIE; zero or within 1e-9 is a TIE whatever the se (even se 0)", X.readingOf({ mean: 0.02, se: 0.01 }) === "TIE" && X.readingOf({ mean: 0.0200001, se: 0.01 }) === "REPLICATES" && X.readingOf({ mean: -0.02, se: 0.01 }) === "TIE" && X.readingOf({ mean: -0.0200001, se: 0.01 }) === "BELOW" && X.readingOf({ mean: 0, se: 0 }) === "TIE" && X.readingOf({ mean: 1e-9, se: 0 }) === "TIE" && X.readingOf({ mean: -1e-9, se: 0 }) === "TIE" && X.readingOf({ mean: 1.1e-9, se: 0 }) === "REPLICATES" && X.readingOf({ mean: -1.1e-9, se: 0 }) === "BELOW" && X.readingOf({ mean: 0.1, se: 0.0001 }) === "REPLICATES");
    const p = X.pool([{ mean: 0.01, se: 0.01 }, { mean: 0.03, se: 0.01 }]);
    ok("!! pool by inverse variance (by hand: equal se 0.01 -> the mean of the two, 0.02, and se 0.01/sqrt(2) = 0.007071, z = 2.828), a lead with a smaller se weighs more (0.01 at se 0.01 and 0.03 at se 0.005: weights 10^4 and 4x10^4 -> 0.026), a single lead is itself; the floor is reached at 0.02 exactly and not below", Math.abs(p.mean - 0.02) < 1e-12 && Math.abs(p.se - 0.01 / Math.SQRT2) < 1e-12 && Math.abs(p.z - 2 * Math.SQRT2) < 1e-9 && p.reachesFloor === true && Math.abs(X.pool([{ mean: 0.01, se: 0.01 }, { mean: 0.03, se: 0.005 }]).mean - 0.026) < 1e-12 && X.pool([{ mean: 0.005, se: 0.002 }]).mean === 0.005 && X.pool([{ mean: 0.005, se: 0.002 }]).se === 0.002 && X.pool([{ mean: 0.0199999, se: 0.002 }]).reachesFloor === false && X.pool([{ mean: 0.02, se: 0.002 }]).reachesFloor === true);
    ok("!! pool refuses by its words: no leads, a lead with no spread (it would carry all the weight), a negative or missing se", msg(() => X.pool([])) === "takeThirdAudit.pool: no leads" && msg(() => X.pool([{ mean: 0.1, se: 0 }])) === "takeThirdAudit.pool: a lead has no spread (se 0)" && msg(() => X.pool([{ mean: 0.1, se: -1 }])) === "takeThirdAudit.pool: a lead has no spread (se -1)" && msg(() => X.pool([{ mean: 0.1 }])) === "takeThirdAudit.pool: a lead has no spread (se undefined)");
    const runs = [0.5, 0.92, 0.9201, 0.95, 0.9501, 1.0, null, 0.1].map((m, i) => ({ key: "k" + i, score: 0.5, bad: i === 5 || i === 7, crushed: i === 5, stranded: i === 7, maxStrain: m }));
    ok("!! hullNumbers: strictly above each threshold (0.92 itself is not above 0.92, 0.95 not above 0.95), a null strain is skipped, the largest strain, crushed, stranded and bad counted (the bad ones are the runs' own flag)", J(X.hullNumbers(runs)) === J({ dives: 8, above: [4, 2], max: 1, crushed: 1, stranded: 1, bad: 2 }) && J(X.hullNumbers([{ maxStrain: null, bad: false }])) === J({ dives: 1, above: [0, 0], max: null, crushed: 0, stranded: 0, bad: 0 }) && J(X.hullNumbers([])) === J({ dives: 0, above: [0, 0], max: null, crushed: 0, stranded: 0, bad: 0 }));
    const mk = (a, b, extra) => [{ arm: "rule-low06", range: { from: 1, to: 2 }, kinds: ["far"], runs: [{ key: "far:1", score: 0.5 }, { key: "far:2", score: 0.5 }] }, { arm: "circuit-plain", range: { from: 1, to: 2 }, kinds: ["far"], runs: [{ key: "far:1", score: 0.5 + a }, { key: "far:2", score: 0.5 + b }] }, ...(extra || [])].map(J).join("\n");
    const lf = X.leadFrom(mk(0.1, 0.3), "circuit-plain");
    ok("!! leadFrom: the paired lead of an arm over the rule in a file's text (mean 0.2, n 2, the range), null for no text, no such arm, or no rule", Math.abs(lf.mean - 0.2) < 1e-12 && lf.n === 2 && lf.se > 0 && J(lf.range) === J({ from: 1, to: 2 }) && X.leadFrom(null, "circuit-plain") === null && X.leadFrom(mk(0.1, 0.3), "plain:2") === null && X.leadFrom(J({ arm: "circuit-plain", runs: [] }), "circuit-plain") === null && X.leadFrom(mk(0.1, 0.3), "rule-low06").mean === 0);
    const f1 = X.leadFrom(text(X.FIRST_FILE), "circuit-plain"), f2 = X.leadFrom(text(X.SECOND_FILE), "circuit-plain"), pl = X.pool([f1, f2]);
    ok("!! the REAL earlier audits: the first gave circuit-plain +0.0050 (se 0.0037, 600 dives, seeds 17001 to 17300), the second +0.0066 (se 0.0034, seeds 18001 to 18300), and their pool is +0.0059 (se 0.0025, 2.34 se: the notes said +0.0058, from the rounded leads)", sg4(f1.mean) === "+0.0050" && f1.se.toFixed(4) === "0.0037" && f1.n === 600 && f1.range.from === 17001 && sg4(f2.mean) === "+0.0066" && f2.se.toFixed(4) === "0.0034" && f2.n === 600 && f2.range.from === 18001 && sg4(pl.mean) === "+0.0059" && pl.se.toFixed(4) === "0.0025" && Math.abs(pl.mean - 0.005857188513513199) < 1e-12 && pl.reachesFloor === false, [sg4(f1.mean), sg4(f2.mean), sg4(pl.mean)].join(" "));
}

sec("5. THE REPORT");
{
    const rep = (o, earlier) => X.report(X.readAudit(textOf(mkAudit(o))), earlier);
    const reg = (o) => mkAudit({ range: X.RANGE, ...o }), repReg = (o, earlier) => X.report(X.readAudit(textOf(reg(o))), earlier);
    const seOf = (jitter, n) => jitter / Math.sqrt(n - 1), zOf = (lead, jitter, n) => lead / seOf(jitter, n);
    const L = rep({ lead: 0.04 });
    ok("!! a lead of +0.04 on 100 dives: a label that it is not the registered block, the header, four PASS lines, then Q1 word for word (lead, se, z, better / worse / same, REPLICATES)", L[0] === "NOT THE REGISTERED BLOCK: this file flew seeds 1 to 50 of far and both; the registered block is 20001 to 20600 of far and both. A smoke, not the read." && L[1] === "THE THIRD AUDIT OF THE PLAIN NET (brain/PLAIN_THIRD_AUDIT_WIP.md): plain:2 (circuit-plain) against rule-low06, paired dive by dive" && L.slice(2, 6).every((l) => l.startsWith("  PASS ")) && L[6] === `Q1 (THE VERDICT) the lead on 100 dives: +0.0400 (se ${seOf(0.02, 100).toFixed(4)}, ${zOf(0.04, 0.02, 100).toFixed(4)} se); better 100, worse 0, same 0: REPLICATES`, L.slice(0, 8).join(" || "));
    ok("!! ... without earlier files Q2a says they are not here; the hull line (no strain above 0.92: 0 of 100 for both, largest 0.5000, Round 33 NO WORSE) and the bottom line", L[7] === "Q2a the pool of the audits: the earlier audit files are not here" && L[8] === "Q2c the hull -- plain:2: strain above 0.92 in 0 of 100 dives, above 0.95 in 0, largest 0.5000, crushed 0, stranded 0; rule-low06: 0, 0, largest 0.5000, crushed 0, stranded 0; Round 33's test (crushed plus stranded 0 against 0): NO WORSE" && L[9] === `BOTTOM LINE: THE PLAIN NET'S GAIN REPLICATES (+0.0400, se ${seOf(0.02, 100).toFixed(4)}, on 100 dives of seeds 1 to 50; the hull: NO WORSE, 0 dives above 0.92 against 0)` && L.length === 10, L.slice(7).join(" || "));
    const T = rep({ lead: 0.002 }), Bw = rep({ lead: -0.04 });
    ok("!! a lead of +0.002 (1 se, better 50 and worse 50) reads a TIE and the bottom line says it does not replicate; a lead of -0.04 reads BELOW with the difference signed", T[6] === `Q1 (THE VERDICT) the lead on 100 dives: +0.0020 (se ${seOf(0.02, 100).toFixed(4)}, ${zOf(0.002, 0.02, 100).toFixed(4)} se); better 50, worse 50, same 0: TIE` && T[T.length - 1].startsWith("BOTTOM LINE: THE PLAIN NET'S GAIN DOES NOT REPLICATE (A TIE) (+0.0020,") && Bw[6] === `Q1 (THE VERDICT) the lead on 100 dives: -0.0400 (se ${seOf(0.02, 100).toFixed(4)}, ${(-zOf(0.04, 0.02, 100)).toFixed(4)} se); better 0, worse 100, same 0: BELOW` && Bw[Bw.length - 1].startsWith("BOTTOM LINE: THE PLAIN NET IS BELOW THE RULE (-0.0400,"), T[6]);
    const R = repReg({ lead: 0.01 });
    ok("!! on the registered range and kinds there is no label (the first line is the header) and the dives are 1,200; another kinds list or range alone triggers the label", R[0].startsWith("THE THIRD AUDIT OF THE PLAIN NET") && /^Q1 \(THE VERDICT\) the lead on 1200 dives: \+0\.0100/.test(R[5]) && rep({ range: X.RANGE, kinds: ["both", "far"] })[0].startsWith("NOT THE REGISTERED BLOCK: this file flew seeds 20001 to 20600 of both and far") && rep({ range: { from: 20001, to: 20601 } })[0].startsWith("NOT THE REGISTERED BLOCK"));
    const earlier = { first: { mean: 0.005, se: 0.0037, n: 600, range: { from: 17001, to: 17300 } }, second: { mean: 0.0066, se: 0.0034, n: 600, range: { from: 18001, to: 18300 } }, fourth: { mean: 0.004, se: 0.0024, n: 1200, range: { from: 19001, to: 19600 } } };
    const E = repReg({ lead: 0.01 }, earlier), Ei = E.findIndex((l) => l.startsWith("  the first audit"));
    ok("!! with the earlier leads: each is listed with its seeds, se and dives; the pool of three by inverse variance with its z and the floor; the fourth reading beside it and 'not pooled into the verdict'", Ei === 6 && E[6] === "  the first audit (seeds 17001 to 17300): +0.0050 (se 0.0037, 600 dives)" && E[7] === "  the second audit (seeds 18001 to 18300): +0.0066 (se 0.0034, 600 dives)" && /^Q2a the pool of 3 audits by inverse variance: \+0\.0\d{3} \(se 0\.00\d{2}, \d+\.\d{4} se\); reaches the series' floor of 0\.02: NO$/.test(E[8]) && E.includes("Q2d the fourth reading, round 1's flight (seeds 19001 to 19600, 1200 dives): +0.0040 (se 0.0024), beside this one and not pooled into the verdict"), E.slice(5, 10).join(" || "));
    const pooled = X.pool([earlier.first, earlier.second, { mean: 0.01, se: seOf(0.02, 1200) }]);
    ok("!! the pooled line's numbers are the inverse-variance pool computed independently (the third lead at its own se, jitter / sqrt(n - 1))", E[8] === `Q2a the pool of 3 audits by inverse variance: ${sg4(pooled.mean)} (se ${pooled.se.toFixed(4)}, ${pooled.z.toFixed(4)} se); reaches the series' floor of 0.02: NO`, E[8]);
    const E1 = repReg({ lead: 0.01 }, { first: earlier.first }), E0 = repReg({ lead: 0.01 }, { fourth: earlier.fourth });
    ok("!! with one earlier lead the pool is of 2 audits; with only the fourth there is no pool ('the earlier audit files are not here') and the fourth is still shown", E1.some((l) => l.startsWith("Q2a the pool of 2 audits")) && E0.includes("Q2a the pool of the audits: the earlier audit files are not here") && E0.some((l) => l.startsWith("Q2d the fourth reading")) && !E1.some((l) => l.startsWith("Q2d")) && !L.some((l) => l.startsWith("Q2d")));
    const H = rep({ lead: 0.04, strainOf: (i) => (i % 40 === 0 ? 0.96 : i % 10 === 0 ? 0.93 : 0.5) });
    ok("!! the hull line counts the dives above 0.92 and above 0.95 and the largest strain of the plain net (100 dives: 10 above 0.92, of them 3 above 0.95 at i = 0, 40, 80, largest 0.96)", H.includes("Q2c the hull -- plain:2: strain above 0.92 in 10 of 100 dives, above 0.95 in 3, largest 0.9600, crushed 0, stranded 0; rule-low06: 0, 0, largest 0.5000, crushed 0, stranded 0; Round 33's test (crushed plus stranded 0 against 0): NO WORSE") && H[H.length - 1].endsWith("the hull: NO WORSE, 10 dives above 0.92 against 0)"));
    const RH = rep({ lead: 0.04, strainOf: (i) => (i % 40 === 0 ? 0.96 : i % 10 === 0 ? 0.93 : 0.5), ruleStrainOf: (i) => (i % 50 === 0 ? 0.97 : i % 20 === 0 ? 0.94 : i % 25 === 0 ? 0.99 : 0.5) });
    ok("!! the rule's own hull numbers are printed in the rule's place (100 dives: above 0.92 in i = 0, 20, 25, 40, 50, 60, 75, 80 -> 8 of them, of which above 0.95: i = 0 (0.97), 25 (0.99), 50 (0.97), 75 (0.99) -> 4, largest 0.99) and the bottom line quotes the rule's count above 0.92", RH.some((l) => l.endsWith("rule-low06: 8, 4, largest 0.9900, crushed 0, stranded 0; Round 33's test (crushed plus stranded 0 against 0): NO WORSE")) && RH[RH.length - 1].endsWith("the hull: NO WORSE, 10 dives above 0.92 against 8)"), RH.find((l) => l.startsWith("Q2c")));
    const Z0 = rep({ lead: 0, jitter: 0 }), Zt = rep({ lead: -0.000001 }), Zs = rep({ lead: 0.006 });
    ok("!! a lead of exactly 0 prints +0.0000 and reads a TIE (se 0, so the z is not a number: NaN is printed as it is); a lead of -0.000001 prints +0.0000 and not -0.0000 (the guard); a lead of 0.006, about 3 se, is REPLICATES (the verdict is read at the se of the lead, not at twice it)", Z0[6] === "Q1 (THE VERDICT) the lead on 100 dives: +0.0000 (se 0.0000, NaN se); better 0, worse 0, same 100: TIE" && /^Q1 \(THE VERDICT\) the lead on 100 dives: \+0\.0000 \(se 0\.0020, -?0\.0005 se\);/.test(Zt[6]) && !Zt.some((l) => /-0\.0000/.test(l)) && /: REPLICATES$/.test(Zs[6]) && Zs[6].startsWith("Q1 (THE VERDICT) the lead on 100 dives: +0.0060 (se 0.0020, 2.98"), Zt[6] + " || " + Zs[6]);
    const bad = mkAudit({ lead: 0.04 }); bad.arms["plain:2"].runs.forEach((r, i) => { if (i < 12) { r.bad = true; r.crushed = i < 7; r.stranded = i >= 7; } });
    const PM = X.report(X.readAudit(textOf(bad)));
    ok("!! twelve crushed or stranded dives against none: Round 33's test says PAYS MORE and the bottom line carries it (crushed 7, stranded 5)", PM.some((l) => l.includes("crushed 7, stranded 5; rule-low06: 0, 0, largest 0.5000, crushed 0, stranded 0; Round 33's test (crushed plus stranded 12 against 0): PAYS MORE")) && PM[PM.length - 1].includes("the hull: PAYS MORE"));
    const F = X.report(X.readAudit(textOf(mkAudit({ drop: ["plain:2"] }))));
    ok("!! a failed check: the label, then the first CHECK FAILED line names the checks (ARMS, WEIGHTS, KEYS, SCORES as they fail), no Q1 or hull, and the bottom line says NOT WEIGHED", F[1] === "CHECK FAILED -- ARMS, WEIGHTS, KEYS, SCORES: THE CHECKS FAILED, THE VERDICT IS NOT WEIGHED" && F.includes("  FAIL ARMS: not flown: plain:2") && F[F.length - 1] === "BOTTOM LINE: NOT WEIGHED (a check failed)" && !F.some((l) => /^Q|REPLICATE|BELOW THE RULE/.test(l)) && X.report(X.readAudit(textOf(mkAudit({ digest: "x" }))))[1] === "CHECK FAILED -- WEIGHTS: THE CHECKS FAILED, THE VERDICT IS NOT WEIGHED", F.slice(0, 3).join(" || "));
    ok("!! a file with no rule only (the rule-less audit): the label is not printed (there is no range to compare), the check line says ARMS, WEIGHTS, KEYS", (() => { const r = X.report(X.readAudit(textOf(mkAudit({ drop: ["rule-low06"] })))); return r[0].startsWith("CHECK FAILED -- ARMS, KEYS") && !r.some((l) => l.startsWith("NOT THE REGISTERED")); })());
}

sec("6. THE COMMAND");
{
    const files = { [X.FIRST_FILE]: text(X.FIRST_FILE), [X.SECOND_FILE]: text(X.SECOND_FILE) };
    const mem = (extra = {}) => { const fsx = { ...files, ...extra }, o = { out: [], err: [], reads: [] }; return Object.assign(o, { io: { out: (m) => o.out.push(m), err: (m) => o.err.push(m), readFile: (f) => { o.reads.push(f); if (!(f in fsx)) throw new Error("ENOENT " + f); return fsx[f]; }, exists: (f) => f in fsx } }); };
    const run = (argv, m) => X.command(argv, m.io);
    let m = mem(); let c = await run(["go"], m);
    ok("!! a bad first word is exit 2 on the error stream with the name of the tool", c === 2 && m.err[0] === 'takeThirdAudit: the first word must be report, got "go"' && m.out.length === 0);
    m = mem(); c = await run([], m);
    ok("!! no words: 'got undefined'", c === 2 && m.err[0] === "takeThirdAudit: the first word must be report, got undefined");
    const refuse = async (argv) => { const mm = mem(); const cc = await run(argv, mm); return [cc, mm.err[0]]; };
    const r1 = await refuse(["report"]), r2 = await refuse(["report", "x"]), r3 = await refuse(["report", "--nope", "1"]), r4 = await refuse(["report", "--in"]), r5 = await refuse(["report", "--in", "--first"]);
    ok("!! the refusals, word for word: no --in, a stray word, an unknown option with the known ones, a missing value (end of line, or another option)", r1[0] === 2 && r1[1] === "takeThirdAudit: report needs --in <audit file>" && r2[0] === 2 && r2[1] === 'takeThirdAudit: unexpected argument "x"' && r3[0] === 2 && r3[1] === 'takeThirdAudit: unknown option "--nope" (known for report: --in, --first, --second, --fourth)' && r4[0] === 2 && r4[1] === "takeThirdAudit: --in needs a value" && r5[0] === 2 && r5[1] === "takeThirdAudit: --in needs a value");
    const au = textOf(mkAudit({ lead: 0.04 }));
    m = mem({ "a.jsonl": au }); c = await run(["report", "--in", "a.jsonl"], m);
    ok("!! report reads the audit and the two earlier audit files through io (the REAL ones: the pool names them), prints the lines, exit 0, nothing on the error stream; the fourth file is not there and the Q2d line is absent", c === 0 && m.err.length === 0 && m.out.some((l) => l.startsWith("Q1 (THE VERDICT)")) && m.out.some((l) => l.startsWith("  the first audit (seeds 17001 to 17300): +0.0050")) && m.out.some((l) => l.startsWith("Q2a the pool of 3 audits")) && !m.out.some((l) => l.startsWith("Q2d")) && m.reads.includes(X.FIRST_FILE) && m.reads.includes(X.SECOND_FILE));
    m = mem({ "a.jsonl": au, "f.jsonl": J({ arm: "rule-low06", range: { from: 1, to: 2 }, kinds: ["far"], runs: [{ key: "far:1", score: 0.5 }, { key: "far:2", score: 0.5 }] }) + "\n" + J({ arm: "plain:2", range: { from: 1, to: 2 }, kinds: ["far"], runs: [{ key: "far:1", score: 0.51 }, { key: "far:2", score: 0.53 }] }) + "\n", "x1.jsonl": files[X.FIRST_FILE], "x2.jsonl": files[X.SECOND_FILE] }); c = await run(["report", "--in", "a.jsonl", "--first", "x1.jsonl", "--second", "x2.jsonl", "--fourth", "f.jsonl"], m);
    ok("!! --first, --second and --fourth name other files (the fourth is read for plain:2, its lead +0.0200 over 2 dives)", c === 0 && m.reads.includes("x1.jsonl") && m.reads.includes("x2.jsonl") && m.reads.includes("f.jsonl") && !m.reads.includes(X.FIRST_FILE) && m.out.some((l) => l.startsWith("Q2d the fourth reading, round 1's flight (seeds 1 to 2, 2 dives): +0.0200")));
    m = mem({ "a.jsonl": au }); delete m.io.exists; m.io.exists = () => false; c = await run(["report", "--in", "a.jsonl"], m);
    ok("!! with no earlier files at all the report still runs (exit 0) and says they are not here", c === 0 && m.out.includes("Q2a the pool of the audits: the earlier audit files are not here") && !m.reads.includes(X.FIRST_FILE));
    const rmiss = mem(), c2 = await run(["report", "--in", "nope.jsonl"], rmiss), rempty = mem({ "e.jsonl": "" }), c3 = await run(["report", "--in", "e.jsonl"], rempty), rbad = mem({ "b.jsonl": J({ arm: "zz" }) + "\n" }), c4 = await run(["report", "--in", "b.jsonl"], rbad);
    ok("!! report refuses (exit 1, the tool's name): a missing audit file, an empty one, an unknown arm", c2 === 1 && rmiss.err[0] === "takeThirdAudit: ENOENT nope.jsonl" && c3 === 1 && rempty.err[0] === "takeThirdAudit: the audit file has no records" && c4 === 1 && rbad.err[0] === 'takeThirdAudit: takeThirdAudit.readAudit: unknown arm "zz" (rule-low06, plain:2)');
    const bruns = mem({ "bn.jsonl": J({ arm: "rule-low06", range: { from: 1, to: 1 }, kinds: ["far"], runs: null }) + "\n" + J({ arm: "plain:2", range: { from: 1, to: 1 }, kinds: ["far"], digest: "c916e7f5", runs: null }) + "\n" }); c = await run(["report", "--in", "bn.jsonl"], bruns);
    ok("!! a report that throws on a malformed audit (runs null) is exit 1 with the tool's name and the reason, nothing printed", c === 1 && typeof bruns.err[0] === "string" && /^takeThirdAudit: .+/.test(bruns.err[0]) && bruns.out.length === 0, String(bruns.err[0]).slice(0, 100));
    // the real default seams and the command line
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ta-")); try {
        fs.writeFileSync(path.join(tmp, "a.jsonl"), au);
        const lines = [], errs = [], ol = console.log, oe = console.error; let cd;
        console.log = (x) => lines.push(x); console.error = (x) => errs.push(x);
        try { cd = await X.command(["report", "--in", path.join(tmp, "a.jsonl")]); } finally { console.log = ol; console.error = oe; }
        ok("!! with no seams the command reads the real files (an absolute audit path; the earlier files from brain/ through the engine folder) and prints on console.log: exit 0, the real first audit's lead in the pool", cd === 0 && errs.length === 0 && lines.some((l) => l.startsWith("  the first audit (seeds 17001 to 17300): +0.0050")) && lines[lines.length - 1].startsWith("BOTTOM LINE: THE PLAIN NET'S GAIN REPLICATES"));
        const errs2 = []; console.error = (x) => errs2.push(x); let ce; try { ce = await X.command(["report", "--in", path.join(tmp, "none.jsonl")]); } finally { console.error = oe; }
        ok("!! with no seams a missing audit file goes to console.error: exit 1", ce === 1 && errs2.length === 1 && /^takeThirdAudit: ENOENT/.test(errs2[0]));
        const child = spawnSync(process.execPath, [path.join(HERE, "takeThirdAuditCmd.mjs"), "report", "--in", path.join(tmp, "a.jsonl")], { cwd: tmp, encoding: "utf8" });
        ok("!! the command line as a child process (started in another folder): exit 0, the report on stdout, nothing on stderr", child.status === 0 && child.stderr === "" && /BOTTOM LINE: THE PLAIN NET'S GAIN REPLICATES/.test(child.stdout) && /Q2a the pool of 3 audits/.test(child.stdout));
        const bye = spawnSync(process.execPath, [path.join(HERE, "takeThirdAuditCmd.mjs"), "go"], { cwd: tmp, encoding: "utf8" });
        ok("!! the command line with a bad word: exit code 2, the refusal on stderr, nothing on stdout", bye.status === 2 && bye.stdout === "" && /the first word must be report/.test(bye.stderr));
    } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
}

console.log(fails ? `\n${fails} FAIL` : "\nall checks pass");
finished = true;
process.exit(fails ? 1 : 0);
