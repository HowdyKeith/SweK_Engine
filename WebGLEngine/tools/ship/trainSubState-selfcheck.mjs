// WebGLEngine/tools/ship/trainSubState-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node tools/ship/trainSubState-selfcheck.mjs      (~60 s)
//
// THE GATE OF tools/ship/trainSubState.mjs AND tools/ship/trainSubStateFamily.mjs: the fly's heading loop and its controls trained as stateful reservoir pilots through a compass dropout, and the verdict rule brain/SUBMARINE_WIP.md wrote down before any of it
// was built (rung 3's rule with the subject cx). The arithmetic (mean, sample sd, ranks, Spearman, the winning margin) is tools/ship/trainSubCircuits.mjs's and is held by that file's gate; here: the specs and seeds, the verdict from hand-built records (rung 3's numbers
// again: an ER family of four with audit scores -0.40 -0.41 -0.39 -0.40 has mean -0.40 and sd 0.008165; a cx at -0.37 is 0.03 above and wins, at -0.385 it does not), the heading error inside the dark windows against an independent reckoning, the command with a stand-in
// for the training, and one real run on a few throwaway dives in this process and through child processes.
//
// SABOTAGED -- (the log is written below when the sabotage has run)
//
"use strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import * as C from "../../brain/pilotSubCircuit.mjs";
import * as A from "../../brain/autopilotSub.mjs";
import * as T from "../../brain/subTask.mjs";
import * as D from "../subDropout.mjs";
import * as S from "../../physics/mechanics/subModel6dof.mjs";
import * as L from "./trainSubState.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
let fails = 0, finished = false;
const died = (e) => { console.log("  FAIL  !! THE GATE THREW before it finished, which is a failure of whatever it was asking: " + String((e && e.stack) || e).split("\n").slice(0, 3).join(" | ").slice(0, 400)); process.exit(1); };
process.on("uncaughtException", died); process.on("unhandledRejection", died);
process.on("exit", () => { if (!finished) { console.log("  FAIL  !! THE GATE ENDED BEFORE IT FINISHED"); process.exitCode = 1; } });
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const sec = (t) => console.log("\n" + t);
const throws = (f) => { try { f(); return null; } catch (e) { return String(e.message || e); } };
const guarded = async (name, f) => { try { await f(); } catch (e) { ok(`${name} ran to the end`, false, "THREW " + String((e && e.message) || e).slice(0, 220)); } };
const J = (v) => JSON.stringify(v), near = (a, b, tol) => Math.abs(a - b) <= tol;
console.log("trainSubState-selfcheck -- the fly's heading loop against its controls, through a compass dropout\n");

const sco = (v) => ({ score: v, crashed: 0, byKind: {} });
function rec(family, index, a, s, r, pairs = 100, { champion = true, smoke = false } = {}) {
    return { spec: family === "cx" ? "cx" : `${family}:${index}`, family, index, smoke, recipe: { runs: 4, iters: 400, sigma: 0.3, maxK: 4, auditBase: smoke ? null : 30000 }, seedBase: 31000, reach: { outputsReached: 40, inputsReaching: 30, pairs }, weightCount: 1729,
        champion: champion ? 31001 : null, qualifies: champion, reasons: [], searches: [], weights: null,
        mechanism: { autopilot: { dark: 0.9, lit: 0.2, darkTicks: 100, litTicks: 100 }, champion: champion ? { dark: 0.6, lit: 0.2, darkTicks: 100, litTicks: 100 } : null },
        scores: { autopilot: { audit: sco(-0.5), safetyAudit: sco(-0.6), reserve: sco(-0.55) }, champion: champion ? { heldOut: sco(-0.4), audit: sco(a), safetyAudit: sco(s), reserve: sco(r) } : null } };
}
const family = (fam, vals, pairs = 100) => vals.map((v, i) => rec(fam, i, v[0], v[1], v[2], pairs));
const ER = family("er", [[-0.40, -0.50, -0.45], [-0.41, -0.51, -0.46], [-0.39, -0.49, -0.44], [-0.40, -0.50, -0.45]], 150);
const LAYER = family("layer", [[-0.39, -0.49, -0.44], [-0.40, -0.50, -0.45], [-0.38, -0.48, -0.43], [-0.39, -0.49, -0.44]], 300), DEGREE = family("degree", [[-0.385, -0.485, -0.435], [-0.395, -0.495, -0.445], [-0.375, -0.475, -0.425], [-0.385, -0.485, -0.435]], 350);

sec("1. specs, seeds and circuits");
await guarded("section 1", async () => {
    const sp = L.parseSpecs("cx,er:0-2,nostate:5,layer:3");
    ok("parseSpecs reads cx, a range and single indices, in order: cx, er 0 1 2, nostate 5, layer 3", J(sp.map(L.specName)) === '["cx","er:0","er:1","er:2","nostate:5","layer:3"]' && sp[0].family === "cx");
    ok("STAGE A is 28 circuits (cx, 6 each of ER, TYPE-BLOCK and DEGREE, 3 each of SIGN, COUNT and NO STATE) and STAGE B the other six of each of ER, TYPE-BLOCK and DEGREE: 18", L.parseSpecs(L.STAGE_A).length === 28 && L.parseSpecs(L.STAGE_B).length === 18 && L.parseSpecs(L.STAGE_A).filter((s) => s.family === "nostate").length === 3);
    const bad = (t) => throws(() => L.parseSpecs(t));
    const rows = [["an empty spec", "cx,,er:0", /an empty spec/], ["an unknown family", "wire:0", /unknown family "wire"/], ["the other rung's subject", "fish", /cannot read "fish"/], ["text it cannot read", "er0", /cannot read "er0"/], ["a backwards range", "er:5-2", /runs backwards/], ["an index past 19", "er:20", /past index 19/],
        ["cx twice", "cx,cx", /cx is named twice/], ["a circuit twice", "er:1,er:0-3", /er:1 is named twice/], ["cx with an index", "cx:0", /unknown family "cx"/]];
    for (const [what, t, re] of rows) { const e = bad(t); ok(`parseSpecs refuses ${what} by name`, e !== null && /^trainSubState\.parseSpecs: /.test(e) && re.test(e), e || "did not throw"); }
    const fams = (f, i) => L.seedBaseOf({ family: f, index: i });
    ok("the first search seed of a circuit: cx 31000, er:0 31010, er:19 31200, layer:0 31210, degree:0 31410, sign:0 31610, count:0 31810, nostate:0 32010, nostate:19 32200; all 121 are different, ten apart", fams("cx", 0) === 31000 && fams("er", 0) === 31010 && fams("er", 19) === 31200 && fams("layer", 0) === 31210 && fams("degree", 0) === 31410 &&
        fams("sign", 0) === 31610 && fams("count", 0) === 31810 && fams("nostate", 0) === 32010 && fams("nostate", 19) === 32200 && new Set(L.parseSpecs("cx,er:0-19,layer:0-19,degree:0-19,sign:0-19,count:0-19,nostate:0-19").map(L.seedBaseOf)).size === 121);
    const circuit = L.loadCircuit();
    ok("the vendored heading loop is read as { neurons, edges, io } (148 cells, 7,080 edges, 88 input and 64 output cells)", circuit.neurons.length === 148 && circuit.edges.length === 7080 && circuit.io.inputs.length === 88 && circuit.io.outputs.length === 64 && L.CIRCUIT_FILE.endsWith("vendor/hemibrain/hemibrain-cx-heading-loop.json"));
    ok("cx and NO STATE are the circuit itself; the K-th control of a family is the family's function at its fixed seed (er 1000 + K, layer 2000 + K, degree 3000 + K, sign 4000 + K, count 5000 + K), the same however it is asked for, and keeps `io`",
        L.circuitFor({ family: "cx", index: 0 }, circuit) === circuit && L.circuitFor({ family: "nostate", index: 2 }, circuit) === circuit && J(L.circuitFor({ family: "er", index: 3 }, circuit)) === J(C.erControl(circuit, 1003)) && J(L.circuitFor({ family: "layer", index: 0 }, circuit)) === J(C.layerControl(circuit, 2000)) &&
        J(L.circuitFor({ family: "degree", index: 7 }, circuit)) === J(C.degreeControl(circuit, 3007)) && J(L.circuitFor({ family: "sign", index: 2 }, circuit)) === J(C.signControl(circuit, 4002)) && J(L.circuitFor({ family: "count", index: 1 }, circuit)) === J(C.countControl(circuit, 5001)) &&
        J(L.circuitFor({ family: "er", index: 3 }, circuit).io) === J(circuit.io) && J(L.circuitFor({ family: "er", index: 3 }, circuit)) !== J(L.circuitFor({ family: "er", index: 4 }, circuit)));
    ok("a spec's policy is a stateful reservoir of its circuit with the state kept, except NO STATE, which resets it every tick; each is named for its spec and has 1,729 trained weights", L.policyOf({ family: "cx", index: 0 }, circuit).persist === true && L.policyOf({ family: "er", index: 1 }, circuit).persist === true && L.policyOf({ family: "nostate", index: 0 }, circuit).persist === false &&
        L.policyOf({ family: "layer", index: 2 }, circuit).name === "layer:2" && L.policyOf({ family: "cx", index: 0 }, circuit).WEIGHT_COUNT === 1729);
    ok("the constants: audits on base 30000 (not rung 3's 20000), search seeds from 31000, the families in order, the verdict families, the three audits, the margin 0.02 and 2 sd, three controls to assess a family; frozen", L.AUDIT_BASE === 30000 && L.SEARCH_BASE === 31000 && J(L.FAMILIES) === '["er","layer","degree","sign","count","nostate"]' && J(L.VERDICT_FAMILIES) === '["er","layer","degree"]' && J(L.AUDITS) === '["audit","safetyAudit","reserve"]' &&
        L.MIN_EDGE === 0.02 && L.SD_FACTOR === 2 && L.MIN_CONTROLS === 3 && Object.isFrozen(L.FAMILIES) && Object.isFrozen(L.CONTROL_BASE) && Object.isFrozen(L.VERDICT_FAMILIES));
    const fresh = L.setsOf(), sm = L.setsOf({ smoke: true }), seedsOf = (set) => set.map((d) => d.seed ?? d.id ?? J(d));
    ok("the audits are the fresh range: the 500-dive safety audit and the 36-dive audit of auditSets(30000), not the 7000 or 20000 ranges; smoke sets are 2, 2, 3, 2, 3, 2 dives", fresh.safetyAudit.length === 500 && fresh.audit.length === 36 && J(seedsOf(fresh.audit)) !== J(seedsOf(L.setsOf({ auditBase: 20000 }).audit)) && J(seedsOf(fresh.safetyAudit)) !== J(seedsOf(L.setsOf({ auditBase: 7000 }).safetyAudit)) &&
        fresh.train === T.TRAIN_SET && [sm.train, sm.heldOut, sm.pool, sm.audit, sm.safetyAudit, sm.reserve].map((x) => x.length).join() === "2,2,3,2,3,2");
});

sec("2. the verdict, from hand-built records");
await guarded("section 2", async () => {
    const SIGN = family("sign", [[-0.30, -0.40, -0.35], [-0.31, -0.41, -0.36], [-0.29, -0.39, -0.34]], 699), NOSTATE = family("nostate", [[-0.34, -0.44, -0.39], [-0.335, -0.435, -0.385], [-0.345, -0.445, -0.395]], 699);
    const all = (cx, extra = []) => [cx, ...ER, ...LAYER, ...DEGREE, ...extra];
    const pass = L.verdictOf(all(rec("cx", 0, -0.33, -0.43, -0.38, 699)));
    ok("PASS: a cx 0.05 above the strongest family (DEGREE, mean -0.385) on every audit beats ER, TYPE-BLOCK and DEGREE everywhere", pass.verdict === "PASS" && /cx beats ER, TYPE-BLOCK and DEGREE on all three audits/.test(pass.why) && L.VERDICT_FAMILIES.every((f) => L.AUDITS.every((a) => pass.families[f].audits[a].wins)), pass.verdict + " " + pass.why);
    ok("the strongest family on each audit is the one with the highest mean: DEGREE on all three", J(pass.strongest) === J({ audit: "degree", safetyAudit: "degree", reserve: "degree" }));
    const fail = L.verdictOf(all(rec("cx", 0, -0.39, -0.49, -0.34, 699)));
    ok("FAIL: a cx inside the spread on the audit and the safety audit (it wins the reserve only) wins against the strongest family on 1 of 3", fail.verdict === "FAIL" && /wins on 1 of 3 audits/.test(fail.why), fail.verdict + " " + fail.why);
    const wins2 = L.verdictOf(all(rec("cx", 0, -0.33, -0.43, -0.435, 699)));
    ok("IN BETWEEN: a cx that beats the strongest family on two audits and not the third", wins2.verdict === "IN BETWEEN" && /at least two/.test(wins2.why), wins2.verdict + " " + wins2.why);
    const wide = family("layer", [[-0.20, -0.30, -0.25], [-0.50, -0.60, -0.55], [-0.40, -0.50, -0.45], [-0.46, -0.56, -0.51]], 300), mixed = L.verdictOf([rec("cx", 0, -0.33, -0.43, -0.38, 699), ...ER, ...wide, ...DEGREE]);
    ok("IN BETWEEN also when cx beats the strongest family but not a noisier weaker one (a TYPE-BLOCK family with sd 0.13 needs 0.26): the verdict needs EVERY family on every audit", mixed.verdict === "IN BETWEEN" && /does not beat every family on every audit/.test(mixed.why) && mixed.families.degree.audits.audit.wins && !mixed.families.layer.audits.audit.wins && near(mixed.families.layer.audits.audit.needs, 0.2663, 1e-3));
    const extra = L.verdictOf(all(rec("cx", 0, -0.33, -0.43, -0.38, 699), [...SIGN, ...NOSTATE]));
    ok("SIGN and NO STATE are reported by the same rule and are NOT in the verdict: the same PASS with them present (SIGN at -0.30 is above cx, NO STATE near it), each family appearing with its own margins", extra.verdict === "PASS" && extra.families.sign.n === 3 && extra.families.nostate.n === 3 && extra.families.sign.audits.audit.wins === false && near(extra.families.nostate.audits.audit.m, -0.34, 1e-12));
    const few = L.verdictOf([rec("cx", 0, -0.33, -0.43, -0.38), ...ER, ...LAYER.slice(0, 2), ...DEGREE]), nocx = L.verdictOf([...ER, ...LAYER, ...DEGREE]);
    ok("NOT ASSESSED while a family of the verdict has fewer than three finished controls, and with no cx record", few.verdict === "NOT ASSESSED" && /layer need at least 3 finished controls/.test(few.why) && nocx.verdict === "NOT ASSESSED" && /no cx record/.test(nocx.why) && nocx.cx === null);
    const nochamp = L.verdictOf(all(rec("cx", 0, -0.33, -0.43, -0.38, 699, { champion: false })));
    ok("a cx with no eligible champion is scored as the autopilot (-0.5, -0.6, -0.55, far below every control): FAIL", nochamp.verdict === "FAIL" && near(nochamp.families.er.audits.audit.F, -0.5, 1e-12));
    const ctl = (fam) => [100, 200, 300].map((p, i) => rec(fam, i, -0.5 + 0.1 * i, -0.6 + 0.1 * i, -0.3 - 0.1 * i, p)), rv = L.verdictOf([rec("cx", 0, -0.33, -0.43, -0.38, 699), ...ctl("er"), ...ctl("layer"), ...ctl("degree")]);
    ok("the reach correlation is Spearman over the ER, TYPE-BLOCK and DEGREE controls: reach 100, 200, 300 in each family with the audit and safety audit rising and the reserve falling gives exactly +1, +1 and -1; SIGN, COUNT, NO STATE and cx do not enter it", near(rv.reach.audit, 1, 1e-12) && near(rv.reach.safetyAudit, 1, 1e-12) && near(rv.reach.reserve, -1, 1e-12) &&
        J(L.verdictOf([rec("cx", 0, -0.33, -0.43, -0.38, 699), ...ctl("er"), ...ctl("layer"), ...ctl("degree"), ...ctl("sign").map((r) => ({ ...r, reach: { ...r.reach, pairs: 9999 } })), ...ctl("nostate")]).reach) === J(rv.reach));
    const lines = L.reportLines(all(rec("cx", 0, -0.33, -0.43, -0.38, 699), [...SIGN, ...NOSTATE]));
    ok("the report prints the autopilot's audits (flown with the dropout), cx, the mechanism line, one line a family named as the notes name it (ER, TYPE-BLOCK, DEGREE, SIGN, NO STATE), the reach correlation and the verdict; SIGN and NO STATE are marked as not in the verdict",
        /^the autopilot on the audits, flown with the compass dropout: audit -0\.5000 \| safety audit -0\.6000 \| reserve -0\.5500$/.test(lines[0]) && /^CX .*champion seed 31001, QUALIFIES against the autopilot \| audit -0\.3300 \| safety audit -0\.4300 \| reserve -0\.3800$/.test(lines[1]) &&
        /^mechanism, mean heading error inside the dark windows \/ outside them \(36 audit dives\): the autopilot 0\.9000 \/ 0\.2000, the cx champion 0\.6000 \/ 0\.2000$/.test(lines[2]) && lines.some((l) => /^ER x4 \(0 with no champion; reach 150-150 pairs\): audit -0\.4000 \+- 0\.0082 \(cx \+0\.0700, needs 0\.0200: WINS\)/.test(l)) &&
        lines.some((l) => /^TYPE-BLOCK x4 /.test(l)) && lines.some((l) => /^DEGREE x4 /.test(l)) && lines.some((l) => /^SIGN x3 .*\[reported, not in the verdict\]$/.test(l)) && lines.some((l) => /^NO STATE x3 .*\[reported, not in the verdict\]$/.test(l)) && lines.some((l) => /^rank correlation of reach with score/.test(l)) && /^RUNG 4a \(fly heading loop, compass dropout\): PASS -- /.test(lines[lines.length - 1]), lines.join(" | "));
});

sec("3. the heading error inside the dark windows, against an independent reckoning");
await guarded("section 3", async () => {
    const set = T.TRAIN_SET.filter((d, i) => i % 13 === 0).slice(0, 3), AP = A.pilot();
    const m = L.headingErrorByWindow(AP, set), runs = T.evaluate(D.dropout(A.pilot()), set).runs;
    const overall = runs.reduce((s, r) => s + r.eHdg * r.ticks, 0) / runs.reduce((s, r) => s + r.ticks, 0);
    ok("three dives flown through the dropout: 960 dark and 840 lit ticks each (2880 and 2520), both means finite and between 0 and 3", m.darkTicks === 2880 && m.litTicks === 2520 && Number.isFinite(m.dark) && Number.isFinite(m.lit) && m.dark >= 0 && m.dark <= 3 && m.lit >= 0 && m.lit <= 3, J(m));
    ok("and they are the dives' own error split: the tick-weighted mean of the dark and lit errors equals the mean heading error the dives report (the dive runner's own eHdg), to 1e-9", near((m.dark * m.darkTicks + m.lit * m.litTicks) / (m.darkTicks + m.litTicks), overall, 1e-9), `${((m.dark * m.darkTicks + m.lit * m.litTicks) / (m.darkTicks + m.litTicks)).toFixed(9)} vs ${overall.toFixed(9)}`);
    const none = L.headingErrorByWindow(AP, set, { windows: 0 }), cleanRuns = T.evaluate(A.pilot(), set).runs, cleanMean = cleanRuns.reduce((s, r) => s + r.eHdg * r.ticks, 0) / cleanRuns.reduce((s, r) => s + r.ticks, 0);
    ok("with no windows there is no dark tick (dark null, 0 dark ticks) and the lit error is the plain dives' error (1e-9)", none.dark === null && none.darkTicks === 0 && none.litTicks === 5400 && near(none.lit, cleanMean, 1e-9));
    let cleanDark = 0, cleanN = 0;   // the same dives flown by the plain autopilot, its error counted over the ticks that are dark in the dropout flight (post-step, as the runner counts)
    for (const scn of set) {
        const wr = D.dropout(A.pilot()), valid = []; T.fly((st, tgt, cur) => { const c = wr(st, tgt, cur); valid.push(wr.log.valid[wr.log.valid.length - 1]); return c; }, scn);
        const e = [], p2 = A.pilot(), errOf = (hdg) => Math.min(3, Math.abs(Math.atan2(Math.sin(scn.target.heading - hdg), Math.cos(scn.target.heading - hdg)))); let i = 0;
        const fr = T.fly((st, tgt, cur) => { if (i++ > 0) e.push(errOf(S.attitude(st, cur).heading)); return p2(st, tgt, cur); }, scn); e.push(errOf(fr.final.hdg));
        e.forEach((v, k) => { if (valid[k] === 0) { cleanDark += v; cleanN++; } });
    }
    ok("the dropout is felt: over the very ticks that are dark, the autopilot's heading error flown through the dropout (" + m.dark.toFixed(4) + ") is more than half as large again as the same autopilot's flown clean (" + (cleanDark / cleanN).toFixed(4) + ", " + cleanN + " ticks) -- NOT dark against lit, which differ in where the dive's own transient sits", cleanN === m.darkTicks && m.dark > 1.5 * (cleanDark / cleanN));
    const short = L.headingErrorByWindow(AP, set, { seconds: 8 });
    ok("another window length changes the split (8 s windows: 480 dark ticks a dive, 1440 for three)", short.darkTicks === 1440 && short.litTicks === 3960);
});

sec("4. the arguments and the results file");
await guarded("section 4", async () => {
    const p = (a) => { try { return L.parseArgs(a); } catch (e) { return { threw: e.message }; } };
    const d = p(["run", "--specs", "cx", "--out", "r.jsonl"]);
    ok("run with a spec and an --out is the recorded recipe: 4 runs x 400 children, sigma 0.3, 1-4 weights, one at a time, the vendored heading loop, audits on base 30000, not smoke, not quiet", d.cmd === "run" && J(d.recipe) === J({ runs: 4, iters: 400, sigma: 0.3, maxK: 4 }) && d.workers === 1 && d.circuitFile === L.CIRCUIT_FILE && d.auditBase === 30000 && d.smoke === false && d.quiet === false && d.one === null && d.out === "r.jsonl");
    const all = p(["run", "--specs", "er:0-2", "--out", "o", "--workers", "3", "--runs", "2", "--iters", "9", "--sigma", "0.1", "--maxK", "2", "--circuit-file", "c.json", "--audit-base", "40000", "--smoke", "--quiet"]);
    ok("every run option is read, an explicit option beats the default", all.workers === 3 && J(all.recipe) === J({ runs: 2, iters: 9, sigma: 0.1, maxK: 2 }) && all.circuitFile === "c.json" && all.auditBase === 40000 && all.smoke && all.quiet);
    ok("--one SPEC needs no --specs and no --out; report reads --in and --allow-smoke", p(["run", "--one", "er:3"]).one === "er:3" && p(["report", "--in", "r.jsonl", "--allow-smoke"]).allowSmoke === true && p(["report", "--in", "x"]).allowSmoke === false);
    const bad = [["no command", [], /the first word must be run or report, got undefined/], ["another command", ["train"], /got "train"/], ["a stray word", ["run", "cx"], /unexpected argument "cx"/], ["an unknown option", ["run", "--specs", "cx", "--out", "o", "--itres", "5"], /unknown option "--itres"/],
        ["an option of the other command", ["report", "--in", "x", "--specs", "cx"], /unknown option "--specs" \(known for report: --in, --allow-smoke\)/], ["a missing value", ["run", "--specs"], /--specs needs a value/], ["an option as a value", ["run", "--specs", "--out", "x"], /--specs needs a value/],
        ["a value that is not a number", ["run", "--specs", "cx", "--out", "o", "--iters", "many"], /--iters needs a number, got "many"/], ["no specs", ["run", "--out", "o"], /run needs --specs/], ["no --out", ["run", "--specs", "cx"], /run needs --out/],
        ["zero runs", ["run", "--specs", "cx", "--out", "o", "--runs", "0"], /--runs must be a whole number of 1 or more, got 0/], ["fractional iters", ["run", "--specs", "cx", "--out", "o", "--iters", "2.5"], /--iters must be a whole number/], ["zero workers", ["run", "--specs", "cx", "--out", "o", "--workers", "0"], /--workers must be a whole number/],
        ["a zero maxK", ["run", "--specs", "cx", "--out", "o", "--maxK", "0"], /--maxK must be a whole number/], ["a sigma of 0", ["run", "--specs", "cx", "--out", "o", "--sigma", "0"], /--sigma must be above 0/], ["a bad spec", ["run", "--specs", "er:99", "--out", "o"], /past index 19/],
        ["two specs for --one", ["run", "--one", "cx,er:0"], /--one takes a single spec/], ["report without --in", ["report"], /report needs --in/]];
    for (const [what, a, re] of bad) { const r = p(a); ok(`${what} is refused by name`, typeof r.threw === "string" && re.test(r.threw), r.threw || J(r)); }
});

sec("5. the command, with a stand-in for the training");
await guarded("section 5", async () => {
    const files = new Map(), appended = [], outs = [], errs = [];
    const mkRunner = (calls) => (spec, circuit, opts) => { calls.push(L.specName(spec)); const base = -0.4 - ((0.01 * L.ordinalOf(spec)) % 0.05); const r = rec(spec.family, spec.index, base, base - 0.1, base - 0.05, 100 + L.ordinalOf(spec), { smoke: opts.smoke }); r.recipe = { ...opts.recipe, auditBase: opts.smoke ? null : opts.auditBase }; return r; };
    const io = (calls) => ({ out: (m) => outs.push(m), err: (m) => errs.push(m), readFile: (f) => { if (!files.has(f)) throw new Error("ENOENT " + f); return files.get(f); }, exists: (f) => files.has(f), appendFile: (f, t) => { appended.push([f, t]); files.set(f, (files.get(f) || "") + t); }, runner: mkRunner(calls) });
    const calls1 = [];
    const code = await L.command(["run", "--specs", "cx,er:0-2", "--out", "r.jsonl"], io(calls1));
    ok("run trains every spec in order, appends ONE line per finished circuit to --out, prints the progress (naming the dropout) and the report, and exits 0", code === 0 && J(calls1) === '["cx","er:0","er:1","er:2"]' && appended.length === 4 && files.get("r.jsonl").trim().split("\n").length === 4 &&
        outs.some((m) => /4 circuits asked for, 0 already in r\.jsonl, 4 to train: 4 searches x 400 children each, audits on base 30000 with the compass dropout, 1 at a time/.test(m)) && outs.some((m) => /^\[trainSubStateFamily\] er:1 done: champion seed 31001/.test(m)) && outs.some((m) => /^RUNG 4a/.test(m)), outs.slice(0, 2).join(" | "));
    const calls2 = []; outs.length = 0; appended.length = 0;
    const code2 = await L.command(["run", "--specs", "cx,er:0-4", "--out", "r.jsonl"], io(calls2));
    ok("a second run with more specs RESUMES: it trains only er:3 and er:4, says 4 were already there, and the report covers all six", code2 === 0 && J(calls2) === '["er:3","er:4"]' && appended.length === 2 && outs.some((m) => /6 circuits asked for, 4 already in r\.jsonl, 2 to train/.test(m)) && outs.some((m) => /^ER x5/.test(m)));
    const stale = async (extra, label) => { const c = []; errs.length = 0; const code = await L.command(["run", "--specs", "er:0", "--out", "r.jsonl", ...extra], io(c)); return { code, c, e: errs[0] || "", label }; };
    const s1 = await stale(["--iters", "10"]), s2 = await stale(["--audit-base", "40000"]), s3 = await stale(["--smoke"]);
    ok("a results file of another recipe, another audit range or a smoke run is NOT mixed with: exit 1, nothing trained, the six records named, a way out given", [s1, s2, s3].every((s) => s.code === 1 && s.c.length === 0 && /holds 6 record\(s\) of another recipe or another audit range \(cx, er:0, er:1, er:2, er:3, er:4\)/.test(s.e) && /use another --out/.test(s.e)), [s1, s2, s3].map((s) => s.e.slice(0, 50)).join(" | "));
    outs.length = 0; errs.length = 0;
    const code6 = await L.command(["report", "--in", "r.jsonl"], io([]));
    ok("report prints the table from the file alone and exits 0; the verdict is not assessed with one family only", code6 === 0 && outs.some((m) => /^CX /.test(m)) && outs.some((m) => /^ER x5 /.test(m)) && outs.some((m) => /NOT ASSESSED -- layer, degree need at least 3 finished controls/.test(m)));
    files.set("smoke.jsonl", J(rec("cx", 0, -0.3, -0.4, -0.35, 699, { smoke: true })) + "\n"); outs.length = 0; errs.length = 0;
    const code7 = await L.command(["report", "--in", "smoke.jsonl"], io([])), code7b = await L.command(["report", "--in", "smoke.jsonl", "--allow-smoke"], io([]));
    ok("report refuses smoke records unless --allow-smoke", code7 === 1 && /smoke records/.test(errs[0]) && code7b === 0 && outs.some((m) => /^CX /.test(m)));
    files.set("empty.jsonl", "\n"); files.set("junk.jsonl", "{oops\n"); errs.length = 0;
    const code8 = await L.command(["report", "--in", "empty.jsonl"], io([])), code9 = await L.command(["report", "--in", "missing.jsonl"], io([])), code10 = await L.command(["report", "--in", "junk.jsonl"], io([]));
    ok("report refuses an empty file, a missing one and one with a line that is not JSON: exit 1 each, with a message", code8 === 1 && code9 === 1 && code10 === 1 && /no records/.test(errs[0]) && /ENOENT/.test(errs[1]) && /line 1 is not JSON/.test(errs[2]), errs.join(" | "));
    errs.length = 0; const code11 = await L.command(["run", "--specs"], io([])), code12 = await L.command(["run", "--specs", "cx", "--out", "x", "--circuit-file", "/nonexistent/c.json"], io([]));
    ok("a bad argument is exit 2 on stderr; a circuit file that cannot be read is exit 1", code11 === 2 && /^trainSubStateFamily: --specs needs a value/.test(errs[0]) && code12 === 1 && /cannot read the circuit file/.test(errs[1]), errs.join(" | "));
    outs.length = 0; const code13 = await L.command(["run", "--specs", "cx", "--out", "q.jsonl", "--quiet"], io([]));
    ok("--quiet drops the progress lines and keeps the report", code13 === 0 && !outs.some((m) => /circuits asked for/.test(m)) && outs.some((m) => /^RUNG 4a/.test(m)));
    const one = []; await L.command(["run", "--one", "nostate:2", "--quiet"], { ...io([]), out: (m) => one.push(m) });
    ok("--one prints the circuit as one RESULT line of JSON and writes nothing", one.length === 1 && /^RESULT \{/.test(one[0]) && JSON.parse(one[0].slice(7)).spec === "nostate:2");
});

sec("6. one real run on a few throwaway dives, in this process and through children");
await guarded("section 6", async () => {
    const circuit = L.loadCircuit(), opts = { recipe: { runs: 2, iters: 12, sigma: 0.25, maxK: 3 }, smoke: true, auditBase: 30000 };
    const c1 = L.runCircuit({ family: "cx", index: 0 }, circuit, opts), c2 = L.runCircuit({ family: "cx", index: 0 }, circuit, opts), e0 = L.runCircuit({ family: "er", index: 0 }, circuit, opts), n0 = L.runCircuit({ family: "nostate", index: 0 }, circuit, opts);
    ok("cx's record: spec cx, seeds 31000 and 31001, 1,729 trained weights, 5,632 (input, output) pairs reached (every input reaches every output in three steps), the recipe, smoke marked, three audits flown by the autopilot", c1.spec === "cx" && c1.seedBase === 31000 && J(c1.searches.map((s) => s.seed).sort()) === "[31000,31001]" && c1.weightCount === 1729 && c1.reach.pairs === 5632 && c1.reach.outputsReached === 64 &&
        c1.recipe.runs === 2 && c1.recipe.iters === 12 && c1.recipe.sigma === 0.25 && c1.recipe.maxK === 3 && c1.recipe.auditBase === null && c1.smoke === true && L.AUDITS.every((a) => Number.isFinite(c1.scores.autopilot[a].score)));
    ok("the run is deterministic (the same record twice, byte for byte)", J(c1) === J(c2));
    ok("EVERY CIRCUIT STARTS AS THE SAME AUTOPILOT, FLOWN WITH THE SAME DROPOUT: cx's, an ER control's and NO STATE's autopilot scores on the three audits are identical, to the bit; and the mechanism of the autopilot too", J(c1.scores.autopilot) === J(e0.scores.autopilot) && J(c1.scores.autopilot) === J(n0.scores.autopilot) && J(c1.mechanism.autopilot) === J(e0.mechanism.autopilot) && e0.seedBase === 31010 && n0.seedBase === 32010);
    ok("the audits are flown on the smoke sets WITH the dropout: the autopilot's audit is on 2 dives, safety audit on 3, reserve on 2, and each dive is dark for 960 ticks (the mechanism counts 1,920 dark and 1,680 lit ticks on 2 dives)", c1.scores.autopilot.audit.n === 2 && c1.scores.autopilot.safetyAudit.n === 3 && c1.scores.autopilot.reserve.n === 2 && c1.mechanism.autopilot.darkTicks === 1920 && c1.mechanism.autopilot.litTicks === 1680);
    ok("a champion (when there is one) carries its four scores, its weights and a mechanism of its own; with none, weights and the champion's mechanism are null", (c1.champion === null ? c1.weights === null && c1.scores.champion === null && c1.mechanism.champion === null : c1.weights.length === 1729 && J(Object.keys(c1.scores.champion)) === '["heldOut","audit","safetyAudit","reserve"]' && c1.mechanism.champion.darkTicks === 1920), c1.champion === null ? "no champion" : "champion " + c1.champion);
    ok("the two searches of a circuit are different searches", J(c1.searches.map((s) => [s.improved, s.neutral, s.moved, s.kept])) !== J([c1.searches[0], c1.searches[0]].map((s) => [s.improved, s.neutral, s.moved, s.kept])) || c1.searches[0].moved !== c1.searches[1].moved, J(c1.searches.map((s) => [s.seed, s.improved, s.neutral, s.moved, s.kept])));
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "substate-")), file = path.join(dir, "r.jsonl"), outs = [];
    const args = ["run", "--specs", "cx,nostate:0", "--out", file, "--workers", "2", "--runs", "2", "--iters", "12", "--sigma", "0.25", "--maxK", "3", "--smoke", "--quiet"];
    const code = await L.command(args, { out: (m) => outs.push(m), err: (m) => outs.push("ERR " + m), selfPath: path.join(HERE, "trainSubStateFamily.mjs") });
    const recs = fs.existsSync(file) ? fs.readFileSync(file, "utf8").trim().split("\n").map((l) => JSON.parse(l)) : [];
    ok("through child processes (--workers 2): both circuits finished, one line each, the same records as the in-process run (the same answer to the bit), the report printed", code === 0 && recs.length === 2 && J(recs.find((r) => r.spec === "cx")) === J(c1) && J(recs.find((r) => r.spec === "nostate:0")) === J(n0) && outs.some((m) => /^RUNG 4a/.test(m)), outs.join(" | ").slice(0, 300));
    const again = await L.command(args, { out: (m) => outs.push(m), err: (m) => outs.push("ERR " + m), selfPath: path.join(HERE, "trainSubStateFamily.mjs") });
    ok("running the same command again finds both circuits in the file and trains nothing (the file still has two lines)", again === 0 && fs.readFileSync(file, "utf8").trim().split("\n").length === 2);
    const cmdFile = path.join(HERE, "trainSubStateFamily.mjs"), bad = spawnSync(process.execPath, [cmdFile, "run", "--specs"], { encoding: "utf8" }), rep = spawnSync(process.execPath, [cmdFile, "report", "--in", file, "--allow-smoke"], { encoding: "utf8" });
    ok("the command file is three lines that call it: a bad argument is exit 2 on stderr; report on the file just written prints cx and exits 0", bad.status === 2 && /--specs needs a value/.test(bad.stderr) && rep.status === 0 && /^CX /m.test(rep.stdout), bad.stderr.slice(0, 80));
    fs.rmSync(dir, { recursive: true, force: true });
});

sec("7. NOT CHECKED");
console.log("  NOT CHECKED  a full-recipe run (4 searches x 400 children on the real dives, with the dropout): this gate runs the plumbing on a few throwaway dives and the logic on hand-built records; the real run is the experiment");
console.log("  NOT CHECKED  that the verdict rule is the right rule: it is the one brain/SUBMARINE_WIP.md fixed in writing before any circuit was trained; the gate holds that the code is that rule");

finished = true;
console.log(fails ? `\ntrainSubState-selfcheck: ${fails} FAILED` : "\ntrainSubState-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
