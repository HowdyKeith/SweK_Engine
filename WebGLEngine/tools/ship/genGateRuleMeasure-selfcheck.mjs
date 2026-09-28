#!/usr/bin/env node
// WebGLEngine/tools/ship/genGateRuleMeasure-selfcheck.mjs -- v4703: H6 as render/gate-rule-preregistration.md
// declared it at v4702, re-derived from the two committed caches rather than read off the runner's summary.
//
// *** THE PRE-REGISTERED DIRECTION FAILED, AND THE OPPOSITE ONE IS NOT TESTED HERE. *** The score ranks BELOW chance
// on five scenes of seven at both speeds. Its negation would therefore look good, and choosing a direction after
// seeing which one wins is precisely the move a pre-registration exists to prevent -- so the negation is reported as
// a number with no test, and anything built on it owes a new document and data that has not seen it.
// Run: node tools/ship/genGateRuleMeasure-selfcheck.mjs
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { RULE_KEYS, declared, readDoc, foldMean } from "./foldStats.mjs";
import { PREREG_H6, RESULT_H6, CELLS, ruleScore, loadCell, sceneAucs, h6 } from "./genGateRule.mjs";
import { jointRows } from "./genGateFolds.mjs";
import { N_FEATURES, N_FEATURES_V2, auc } from "../../render/genGate.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let fails = 0;
const ok = (l, c, n = "") => { if (!c) fails++; console.log(`  ${c ? "PASS" : "FAIL"}  ${l}${n ? "   " + n : ""}`); };
const say = (s) => console.log(`  ----  ${s}`);
const J = (x) => JSON.stringify(x);
const spearman = (a, b) => { const rk = (v) => { const o = v.map((x, i) => [x, i]).sort((p, q) => p[0] - q[0]), r = []; o.forEach(([, i], k) => { r[i] = k + 1; }); return r; };
    const ra = rk(a), rb = rk(b), n = a.length; return 1 - 6 * ra.reduce((s, v, i) => s + (v - rb[i]) ** 2, 0) / (n * (n * n - 1)); };

const d = declared(readDoc(PREREG_H6), RULE_KEYS);
const R = JSON.parse(fs.readFileSync(path.join(ENG, RESULT_H6), "utf8"));
const learned = Object.fromEntries(d.speeds.map((sp) => [sp, JSON.parse(fs.readFileSync(path.join(ENG, CELLS[sp].result), "utf8"))]));

console.log("genGateRuleMeasure-selfcheck -- a rule with nothing fitted, measured as declared, re-derived from its data\n");

console.log("1. *** PROVENANCE, AND THE COLUMNS ON EVERY REAL BLOCK ***");
const cells = {}, rowsBy = {};   // rows built ONCE per scene: the first draft rebuilt them six times and ran 3.4 s
{
    ok("*** the run's constants are the document's today ***", J(R.declared) === J(d));
    let loaded = true, why = "";
    for (const sp of d.speeds) { try { cells[sp] = loadCell(sp, d.scenes); } catch (e) { loaded = false; why = String(e.message).slice(0, 160); } }
    ok("*** both caches load AND each is the one its harvesting run recorded -- checkCell and matchesMeta, on the real files ***",
       loaded, loaded ? d.speeds.map((sp) => `x${sp}: ${d.scenes.length} scenes, counts match ${CELLS[sp].result.split("/").pop()}`).join("; ") : why);
    if (!loaded) { console.log(`\ngenGateRuleMeasure-selfcheck: ${fails} FAILED`); process.exit(1); }
    for (const sp of d.speeds) rowsBy[sp] = Object.fromEntries(d.scenes.map((s) => [s, jointRows(cells[sp][s])]));
    let worst = 0, n = 0;
    for (const sp of d.speeds) for (const s of d.scenes) { const r = rowsBy[sp][s];
        for (let i = 0; i < r.n; i++, n++) worst = Math.max(worst, Math.abs(ruleScore(r.x1[i * N_FEATURES], r.x1[i * N_FEATURES + 1], r.x1[i * N_FEATURES + 2]) + r.x2[i * N_FEATURES_V2 + 2])); }
    ok("*** C16 on EVERY usable block of both cells: the score is the negated third scale-free column, which the page computed by separate code ***",
       worst <= d.columnTol, `${n.toLocaleString()} blocks, worst |score + x2[2]| ${worst.toExponential(2)} against columnTol ${d.columnTol}.`);
}

console.log("\n2. *** H6, RE-DERIVED -- NOT SUPPORTED, AND IN THE WRONG DIRECTION ***");
const per = Object.fromEntries(d.speeds.map((sp) => [sp, sceneAucs(cells[sp], d.scenes)]));
const H = h6(per, d);
{
    ok("*** every per-scene AUC, recomputed from the caches, is the recorded one -- and so is the verdict ***",
       J(per) === J(R.per) && J(H) === J(R.h6));
    for (const sp of d.speeds) {
        say(`x${sp}: ` + d.scenes.map((s) => `${s} ${per[sp][s].auc.toFixed(3)}`).join("  "));
        const c = H.cells[sp], below = d.scenes.filter((s) => per[sp][s].auc < 0.5);
        ok(`*** x${sp} FAILS: the score is BELOW chance on ${below.length} scenes of 7, and its mean is negative ***`,
           c.reportable && !c.cleared && c.test.sign.up === 2 && c.test.t.mean < 0 && below.length === 5,
           `AUC - 0.5 mean ${c.test.t.mean.toFixed(4)}, t p ${c.test.t.p.toFixed(3)}, sign ${c.test.sign.up}/7 p ${c.test.sign.p}. Above chance only on ${d.scenes.filter((s) => per[sp][s].auc > 0.5).join(" and ")}.`);
    }
    ok("*** H6 IS NOT SUPPORTED at either speed -- and the pre-registered reading for this row UNDERSTATED what happened ***",
       H.reportable && !H.supported,
       "the document's fails/fails row reads \"block-local motion evidence ... does not rank the decision\". It anticipated a score NEAR chance. " +
       "The score ranks FAR from chance, backwards, on most scenes -- checker 0.183 at x2 -- which is ranking information with the wrong sign, " +
       "not its absence. The document is left standing; this row records where its reading and the data part.");
    const neg = d.speeds.map((sp) => d.scenes.filter((s) => 1 - per[sp][s].auc > 0.5).length);
    say(`NOT TESTED, NOT PROMOTED: the NEGATED score would sit above chance on ${neg.join(" and ")} scenes of 7 at x${d.speeds.join(" and x")}. ` +
        "Its direction would be chosen by these data, which is the one thing the pre-registration forbids; it owes a new document and unseen data.");
}

console.log("\n3. *** SECONDARIES -- REPORTED, NEVER PROMOTED ***");
{
    for (const sp of d.speeds) {
        const rule = d.scenes.map((s) => per[sp][s].auc), v1 = d.scenes.map((s) => foldMean(learned[sp].results[s].V1)), v2 = d.scenes.map((s) => foldMean(learned[sp].results[s].V2));
        say(`S20 x${sp}: scene / rule / learned V1 / learned V2 -- ` + d.scenes.map((s, i) => `${s} ${rule[i].toFixed(3)}/${v1[i].toFixed(3)}/${v2[i].toFixed(3)}`).join("  "));
        say(`S20b x${sp}: Spearman rho across the seven scenes, rule AUC against learned V1 ${spearman(rule, v1).toFixed(3)}, against V2 ${spearman(rule, v2).toFixed(3)}. ` +
            "Negative means the scenes the rule ranks backwards are the ones the learned sets ranked forwards. A description over seven points.");
    }
    say("S20c edges, where every learned arm ranked BELOW chance at both speeds, is where the rule ranks furthest ABOVE it: " +
        d.speeds.map((sp) => `x${sp} rule ${per[sp].edges.auc.toFixed(3)}, V1 ${foldMean(learned[sp].results.edges.V1).toFixed(3)}`).join("; ") +
        ". The first draft of this line read that as the learned sets having learned the compensation gain with the sign most " +
        "training scenes carry. The flat-block line below undercuts it: most of edges' rule advantage is its flat blocks, which " +
        "score exactly 0 and almost never win. What remains without them is near chance. No mechanism is claimed.");
    for (const sp of d.speeds) {
        const rows = d.scenes.map((s) => { const r = rowsBy[sp][s]; let keep = 0, agree = 0;
            for (let i = 0; i < r.n; i++) { const g = ruleScore(r.x1[i * N_FEATURES], r.x1[i * N_FEATURES + 1], r.x1[i * N_FEATURES + 2]) > 0 ? 1 : 0; keep += g; agree += g === r.y[i] ? 1 : 0; }
            return `${s} keeps ${(100 * keep / r.n).toFixed(0)}% vs oracle ${(100 * per[sp][s].pos / r.n).toFixed(0)}%, agrees ${(100 * agree / r.n).toFixed(0)}%`; });
        say(`S21 x${sp}, generate iff score > 0: ` + rows.join("; ") + ". Still not dB.");
    }
    say("S21b THE DECLARED THRESHOLD SEPARATES ALMOST NOTHING: on six scenes of seven every usable block scores above 0, so " +
        "\"generate iff score > 0\" IS always-generate there. S21 was declared without knowing that; it is reported, and a threshold " +
        "that means something would have to be chosen on data -- which makes it a parameter, which is what this rule was not to have.");
    for (const sp of d.speeds) {
        const parts = d.scenes.map((s) => { const r = rowsBy[sp][s], sc = new Float64Array(r.n); let flat = 0, flatWin = 0;
            for (let i = 0; i < r.n; i++) { sc[i] = ruleScore(r.x1[i * N_FEATURES], r.x1[i * N_FEATURES + 1], r.x1[i * N_FEATURES + 2]);
                if (sc[i] === 0) { flat++; flatWin += r.y[i]; } }
            const keep = [...sc.keys()].filter((i) => sc[i] !== 0);
            const a = keep.length ? auc(Float64Array.from(keep.map((i) => sc[i])), Uint8Array.from(keep.map((i) => r.y[i]))).auc : null;
            return `${s} ${(100 * flat / r.n).toFixed(0)}% score 0 (win ${flat ? (100 * flatWin / flat).toFixed(0) : "-"}%), non-zero AUC ${a === null ? "n/a" : a.toFixed(3)}`; });
        say(`UNDECLARED, NO TEST -- x${sp}, the blocks scoring EXACTLY 0 (all three SADs at eps: flat content) and the AUC without them: ${parts.join("; ")}.`);
    }
    for (const sp of d.speeds) {
        const cols = ["sadApp", "sadFlow", "sadStill"].map((nm, c) => `${nm} ` + d.scenes.map((s) => { const r = rowsBy[sp][s];
            const sc = new Float64Array(r.n); for (let i = 0; i < r.n; i++) sc[i] = r.x1[i * N_FEATURES + c]; return auc(sc, r.y).auc.toFixed(2); }).join("/"));
        say(`S22 x${sp}, each SAD alone as a score (scenes in declared order): ${cols.join("; ")}.`);
    }
}

console.log(`\ngenGateRuleMeasure-selfcheck: ${fails ? fails + " FAILED" : "ALL GREEN"}`);
console.log("unchecked here: THE NEGATED SCORE, WHICH IS NOT TESTED; ANYTHING IN dB; anything beyond seven synthetic scenes at two speeds.");
process.exit(fails ? 1 : 0);
