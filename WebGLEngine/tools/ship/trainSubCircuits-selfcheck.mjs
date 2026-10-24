// WebGLEngine/tools/ship/trainSubCircuits-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node tools/ship/trainSubCircuits-selfcheck.mjs      (~30 s)
//
// THE GATE OF tools/ship/trainSubCircuits.mjs AND tools/ship/trainSubCircuitFamily.mjs: the family of circuits trained by the submarine recipe, and the verdict rule that brain/SUBMARINE_WIP.md wrote down BEFORE any pilot was trained. Pure
// parts first (specs, seeds, the verdict from hand-built records, every number worked out here), then the command with a stand-in for the training, then one real end-to-end run on a few throwaway dives (in this process and through
// child processes), to show the plumbing and that every circuit starts as the same autopilot.
//
// THE HAND-WORKED VERDICT (records below; a score is a mean dive score, higher is better): an ER family of four with audit scores -0.40 -0.41 -0.39 -0.40 has mean -0.40, deviations 0 -0.01 +0.01 0, sample variance 0.0002/3,
//   sd 0.008165; a fish at -0.37 is 0.03 above the mean and needs max(0.02, 2 x 0.008165 = 0.01633) = 0.02: it WINS; at -0.385 it is 0.015 above: it does not.
//
// SABOTAGED -- 92 mutants of tools/ship/trainSubCircuits.mjs, each applied in a scratch tree and run alone against this gate, every one red by a row that names it:
//   specs and seeds F01 an empty spec | F02 fish twice | F03 an unknown family | F04 a backwards range | F05 an index past 19 | F06 a circuit twice | F07 fish with an index | F08 a range one short | F09 the families overlap in the order |
//   F10 search seeds four apart | F11 search seeds in the audit range | F12 the spent audit range | F13-F17 each family's control seed base | F18 the fish is a control | F19 a control's index ignored | F20 stage A without the degree controls |
//   F21 stage B without them | F22 floor 0.01 | F23 spread factor 1 | F24 two controls make a family | F25 SIGN in the verdict families | F26 audits on the spent range | F27 and F28 smoke sets one dive too many / too few
//   the circuit run F29 every search the first seed | F30 the children not the recipe's | F31 the step not the recipe's | F32 prune on the held-out set | F33 the old audits | F34 the autopilot's audit flown on the safety audit |
//   F35 its reserve flown on the audit | F36 the champion's audit is the safety audit | F38 weights kept without a champion | F39 the dive count not kept | F40 and F41 the effective score always / never the autopilot's
//   the verdict F42 sd divides by n | F43 the mean is a sum | F44 tied ranks take the smallest | F45 two pairs make a correlation | F46 a constant list has one | F47 the floor dropped | F48 the spread dropped | F49 the margin the wrong way |
//   F50 the strongest family is the weakest | F51 a pass needs one audit | F52 a pass needs one family | F53 one lost audit fails | F54 three needed | F55 a family needs one control | F56 the fish is the first record |
//   F57 reach correlated with the fish and the shuffles | F58 with one fixed audit | F59 WINS in lower case | F60 no verdict line | F61 SIGN not marked | F62 the no-champion count inverted
//   the command F63 report is not a command | F64 an unknown option | F65 an option as a value | F66 a non-number | F67 --one needs a list | F68 --out optional | F69 zero workers | F70 fractional iters | F71 sigma 0 | F72 specs unchecked |
//   F73 --one with several | F74 the default audit range | F76 another audit range mixes | F77 another number of children mixes | F78 another recipe not refused | F79 a bad line numbered from zero | F80 a resumed run trains again |
//   F81 a record with no end of line | F82 smoke records read unasked | F83 an empty file reported | F84 a bad argument exits 1 | F85 a circuit file error exits 2 | F86 no report after a run | F87 --quiet keeps the progress |
//   F88-F91 and F94 a child not told the runs / children / step / smoke / maxK | F92 the one result unmarked | F95 the dive count zero
// WHAT THE SABOTAGE FOUND, FIXED: five 0-red mutants the first time. F34 and F35 (the autopilot's audits flown on the wrong set) sat in a fallback that only ran when there was NO champion, which no smoke run has: the fallback was cut and the
// autopilot's three audits are flown for every circuit (about 12 s). F37 (the eligible count) could not be told in a run where every search is eligible: the field was cut from the record (the searches carry their own flag). F75 (the smoke clause
// of the resume check) was EQUIVALENT -- a smoke record has no audit base and a full one has, so the audit-base clause already refuses the mix: the clause was cut. F90 (a child not told the step) because the children ran at the default
// sigma: the gate now runs everything at sigma 0.25 and maxK 3. F41 first went red only as "section ran to the end": the row catches the throw. F93 (children one at a time) is EQUIVALENT in output (it changes the clock only) and was dropped;
// the patterns of F20, F21 and F56 matched twice and were made unique.
// NOT TRIED: the strict inequality of beats() (equivalent: 0.02 is not a number a double holds, so no input sits on the boundary).
//
"use strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as C from "../../brain/pilotSubCircuit.mjs";
import * as T from "../../brain/subTask.mjs";
import * as L from "./trainSubCircuits.mjs";

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
console.log("trainSubCircuits-selfcheck -- the family of circuits, its seeds and the pre-registered verdict\n");

// ---- hand-built records ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
const sco = (v) => ({ score: v, crashed: 0, byKind: {} });
function rec(family, index, a, s, r, pairs = 100, { champion = true, smoke = false } = {}) {
    return { spec: family === "fish" ? "fish" : `${family}:${index}`, family, index, smoke, recipe: { runs: 4, iters: 400, sigma: 0.3, maxK: 4, auditBase: smoke ? null : 20000 }, seedBase: 21000, reach: { outputsReached: 40, inputsReaching: 30, pairs }, weightCount: 885,
        champion: champion ? 21001 : null, eligible: champion ? 2 : 0, qualifies: champion, reasons: [], searches: [], weights: null,
        scores: { autopilot: { audit: sco(-0.5), safetyAudit: sco(-0.6), reserve: sco(-0.55) }, champion: champion ? { heldOut: sco(-0.4), audit: sco(a), safetyAudit: sco(s), reserve: sco(r) } : null } };
}
const family = (fam, vals, pairs = 100) => vals.map((v, i) => rec(fam, i, v[0], v[1], v[2], pairs));
const ER = family("er", [[-0.40, -0.50, -0.45], [-0.41, -0.51, -0.46], [-0.39, -0.49, -0.44], [-0.40, -0.50, -0.45]], 150);

// ================================================================================================================================================================================================================
sec("1. specs, seeds and circuits");
await guarded("section 1", async () => {
    const sp = L.parseSpecs("fish,er:0-2,layer:5,sign:3-4");
    ok("parseSpecs reads fish, a range and a single index, in order: fish, er 0 1 2, layer 5, sign 3 4", J(sp.map(L.specName)) === '["fish","er:0","er:1","er:2","layer:5","sign:3","sign:4"]' && sp[0].family === "fish" && sp[3].index === 2);
    ok("STAGE A is 39 circuits (fish, 10 ER, 10 LAYER, 10 DEGREE, 4 SIGN, 4 COUNT) and STAGE B the other ten of each of ER, LAYER and DEGREE: 30", L.parseSpecs(L.STAGE_A).length === 39 && L.parseSpecs(L.STAGE_B).length === 30);
    const bad = (t) => throws(() => L.parseSpecs(t));
    const rows = [["an empty spec", "fish,,er:0", /an empty spec/], ["an unknown family", "wire:0", /unknown family "wire"/], ["text it cannot read", "er0", /cannot read "er0"/], ["a backwards range", "er:5-2", /runs backwards/], ["an index past 19", "er:20", /past index 19/], ["a range past 19", "er:18-21", /past index 19/],
        ["fish twice", "fish,fish", /fish is named twice/], ["a circuit twice", "er:1,er:0-3", /er:1 is named twice/], ["nothing", "", /an empty spec/], ["fish with an index", "fish:0", /unknown family "fish"/]];
    for (const [what, t, re] of rows) { const e = bad(t); ok(`parseSpecs refuses ${what} by name`, e !== null && /^trainSubCircuits\.parseSpecs: /.test(e) && re.test(e), e || "did not throw"); }
    ok("the first search seed of a circuit: fish 21000, er:0 21010, er:19 21200, layer:0 21210, degree:0 21410, sign:0 21610, count:0 21810, count:19 22000, and all 101 are different", L.seedBaseOf({ family: "fish", index: 0 }) === 21000 && L.seedBaseOf({ family: "er", index: 0 }) === 21010 && L.seedBaseOf({ family: "er", index: 19 }) === 21200 &&
        L.seedBaseOf({ family: "layer", index: 0 }) === 21210 && L.seedBaseOf({ family: "degree", index: 0 }) === 21410 && L.seedBaseOf({ family: "sign", index: 0 }) === 21610 && L.seedBaseOf({ family: "count", index: 0 }) === 21810 && L.seedBaseOf({ family: "count", index: 19 }) === 22000 &&
        new Set(L.parseSpecs("fish,er:0-19,layer:0-19,degree:0-19,sign:0-19,count:0-19").map(L.seedBaseOf)).size === 101);
    ok("four searches of a circuit never meet another's seeds (the bases are ten apart and a run takes at most four)", L.parseSpecs("fish,er:0-19,layer:0-19,degree:0-19,sign:0-19,count:0-19").every((s, i, all) => i === 0 || L.seedBaseOf(s) - L.seedBaseOf(all[i - 1]) === 10));
    const circuit = L.loadCircuit();
    ok("the vendored circuit is read as { neurons, edges } (99 and 148)", circuit.neurons.length === 99 && circuit.edges.length === 148 && L.CIRCUIT_FILE.endsWith("vendor/zebrafish/fish1-hmi-spn.json"));
    ok("the fish spec is the circuit itself; the K-th control of a family is the family's function at its fixed seed (er 1000 + K, layer 2000 + K, degree 3000 + K, sign 4000 + K, count 5000 + K), the same however it is asked for",
        L.circuitFor({ family: "fish", index: 0 }, circuit) === circuit && J(L.circuitFor({ family: "er", index: 3 }, circuit)) === J(C.erControl(circuit, 1003)) && J(L.circuitFor({ family: "layer", index: 0 }, circuit)) === J(C.layerControl(circuit, 2000)) &&
        J(L.circuitFor({ family: "degree", index: 7 }, circuit)) === J(C.degreeControl(circuit, 3007)) && J(L.circuitFor({ family: "sign", index: 2 }, circuit)) === J(C.signControl(circuit, 4002)) && J(L.circuitFor({ family: "count", index: 1 }, circuit)) === J(C.countControl(circuit, 5001)) &&
        J(L.circuitFor({ family: "er", index: 3 }, circuit)) !== J(L.circuitFor({ family: "er", index: 4 }, circuit)));
    ok("the constants are the ones the note fixes: audits on base 20000, the winning margin 0.02 and 2 standard deviations, three controls to assess a family, the three families of the verdict and the three audits", L.AUDIT_BASE === 20000 && L.MIN_EDGE === 0.02 && L.SD_FACTOR === 2 && L.MIN_CONTROLS === 3 && J(L.VERDICT_FAMILIES) === '["er","layer","degree"]' && J(L.AUDITS) === '["audit","safetyAudit","reserve"]' && J(L.FAMILIES) === '["er","layer","degree","sign","count"]' && Object.isFrozen(L.FAMILIES) && Object.isFrozen(L.CONTROL_BASE));
    const fresh = L.setsOf(), old = L.setsOf({ auditBase: 7000 });
    const seedsOf = (set) => set.map((d) => d.seed ?? d.id ?? J(d));
    ok("the audits are the fresh range: the 500-dive safety audit and the 36-dive audit of auditSets(20000), nothing like the spent 7000 range; the train, held-out, pool and reserve sets are the trainer's own", fresh.safetyAudit.length === 500 && fresh.audit.length === 36 && J(seedsOf(fresh.audit)) !== J(seedsOf(old.audit)) && J(seedsOf(fresh.safetyAudit)) !== J(seedsOf(old.safetyAudit)) &&
        fresh.train === T.TRAIN_SET && fresh.heldOut === T.HELD_OUT_SET && fresh.pool === T.SAFETY_POOL_SET && fresh.reserve === T.BASELINE_SET);
    const sm = L.setsOf({ smoke: true });
    ok("smoke sets are a few dives of each kind (2, 2, 3, 2, 3, 2)", [sm.train, sm.heldOut, sm.pool, sm.audit, sm.safetyAudit, sm.reserve].map((x) => x.length).join() === "2,2,3,2,3,2");
});

// ================================================================================================================================================================================================================
sec("2. the arithmetic of the verdict");
await guarded("section 2", async () => {
    ok("meanOf and sdOf (sample, n - 1): the ER audit scores -0.40 -0.41 -0.39 -0.40 have mean -0.40 and sd 0.008165; one value has sd 0", near(L.meanOf([-0.40, -0.41, -0.39, -0.40]), -0.40, 1e-12) && near(L.sdOf([-0.40, -0.41, -0.39, -0.40]), Math.sqrt(0.0002 / 3), 1e-12) && L.sdOf([5]) === 0 && L.sdOf([]) === 0);
    ok("ranksOf gives 1-based ranks and ties share the mean of their ranks: [10, 30, 20] -> [1, 3, 2]; [1, 1, 2] -> [1.5, 1.5, 3]; [5, 5, 5] -> [2, 2, 2]", J(L.ranksOf([10, 30, 20])) === "[1,3,2]" && J(L.ranksOf([1, 1, 2])) === "[1.5,1.5,3]" && J(L.ranksOf([5, 5, 5])) === "[2,2,2]");
    ok("spearman: +1 for a rising pair, -1 for a falling one, 0.8660 for the tied example worked by hand (1.5 / sqrt(3)), null for a constant list or fewer than three pairs or lists of different length",
        near(L.spearman([100, 200, 300, 400], [-0.5, -0.4, -0.3, -0.2]), 1, 1e-12) && near(L.spearman([1, 2, 3, 4], [4, 3, 2, 1]), -1, 1e-12) && near(L.spearman([1, 1, 2], [1, 2, 3]), 1.5 / Math.sqrt(3), 1e-12) && L.spearman([1, 2, 3], [7, 7, 7]) === null && L.spearman([1, 2], [3, 4]) === null && L.spearman([1, 2, 3], [1, 2]) === null);
    const b = L.beats(-0.37, [-0.40, -0.41, -0.39, -0.40]), b2 = L.beats(-0.385, [-0.40, -0.41, -0.39, -0.40]), b3 = L.beats(-0.30, [-0.40, -0.50, -0.30, -0.60]);
    ok("beats: -0.37 against the ER scores is 0.03 above the mean, needs max(0.02, 0.01633) = 0.02, wins; -0.385 is 0.015 above, no; against a wide family (-0.40 -0.50 -0.30 -0.60: mean -0.45, sd 0.1291) -0.30 is 0.15 above and needs 0.2582: no",
        b.wins && near(b.margin, 0.03, 1e-12) && near(b.needs, 0.02, 1e-12) && !b2.wins && near(b2.margin, 0.015, 1e-12) && !b3.wins && near(b3.needs, 2 * Math.sqrt(0.05 / 3), 1e-9) && near(b3.margin, 0.15, 1e-12));
    ok("the floor of 0.02 holds with no spread at all: 0.019 above a family of identical scores does not win and 0.021 above does (0.02 itself is not a number a double holds, so the strict inequality is not testable)", !L.beats(-0.381, [-0.40, -0.40, -0.40]).wins && L.beats(-0.379, [-0.40, -0.40, -0.40]).wins);
    const ef = (r) => { try { return J(L.effectiveOf(r)); } catch (e) { return "THREW " + e.message; } };
    ok("effectiveOf is the champion's three audit scores, or the AUTOPILOT's when there is no champion", ef(rec("er", 0, -0.4, -0.5, -0.45)) === J({ audit: -0.4, safetyAudit: -0.5, reserve: -0.45 }) && ef(rec("er", 0, -0.4, -0.5, -0.45, 100, { champion: false })) === J({ audit: -0.5, safetyAudit: -0.6, reserve: -0.55 }));
});

// ================================================================================================================================================================================================================
sec("3. the verdict, from hand-built records");
await guarded("section 3", async () => {
    const LAYER = family("layer", [[-0.39, -0.49, -0.44], [-0.40, -0.50, -0.45], [-0.38, -0.48, -0.43], [-0.39, -0.49, -0.44]], 300), DEGREE = family("degree", [[-0.385, -0.485, -0.435], [-0.395, -0.495, -0.445], [-0.375, -0.475, -0.425], [-0.385, -0.485, -0.435]], 350);
    const SIGN = family("sign", [[-0.30, -0.40, -0.35], [-0.31, -0.41, -0.36], [-0.29, -0.39, -0.34]], 699);
    const all = (fish, extra = []) => [fish, ...ER, ...LAYER, ...DEGREE, ...extra];
    const pass = L.verdictOf(all(rec("fish", 0, -0.33, -0.43, -0.38, 699)));
    ok("PASS: a fish 0.05 above the strongest family (DEGREE, mean -0.385) on every audit beats ER, LAYER and DEGREE everywhere", pass.verdict === "PASS" && /beats ER, LAYER and DEGREE on all three audits/.test(pass.why) && L.VERDICT_FAMILIES.every((f) => L.AUDITS.every((a) => pass.families[f].audits[a].wins)), J(pass.verdict) + " " + pass.why);
    ok("the strongest family on each audit is the one with the highest mean: DEGREE on all three here (-0.385, -0.485, -0.435 against LAYER's -0.39, -0.49, -0.44)", J(pass.strongest) === J({ audit: "degree", safetyAudit: "degree", reserve: "degree" }));
    const fail = L.verdictOf(all(rec("fish", 0, -0.39, -0.49, -0.34, 699)));
    ok("FAIL: a fish inside the spread on the audit and the safety audit (it wins the reserve only) loses against the strongest family on 2 of 3: the rung is failed", fail.verdict === "FAIL" && /wins on 1 of 3 audits/.test(fail.why), fail.verdict + " " + fail.why);
    const wins2 = L.verdictOf(all(rec("fish", 0, -0.33, -0.43, -0.435, 699)));
    ok("IN BETWEEN: a fish that beats the strongest family on two audits and not the third is neither a pass nor a fail", wins2.verdict === "IN BETWEEN" && /at least two/.test(wins2.why), wins2.verdict + " " + wins2.why);
    const wide = family("layer", [[-0.20, -0.30, -0.25], [-0.50, -0.60, -0.55], [-0.40, -0.50, -0.45], [-0.46, -0.56, -0.51]], 300);
    const mixed = L.verdictOf([rec("fish", 0, -0.33, -0.43, -0.38, 699), ...ER, ...wide, ...DEGREE]);
    ok("IN BETWEEN also when the fish beats the strongest family on all three audits but not a noisier weaker one (a LAYER family with sd 0.13 needs 0.26): the verdict needs EVERY family on every audit", mixed.verdict === "IN BETWEEN" && /does not beat every family on every audit/.test(mixed.why) && mixed.families.degree.audits.audit.wins && !mixed.families.layer.audits.audit.wins && near(mixed.families.layer.audits.audit.needs, 0.2663, 1e-3), mixed.verdict + " " + mixed.why);
    const sc = L.verdictOf(all(rec("fish", 0, -0.33, -0.43, -0.38, 699), SIGN));
    ok("SIGN (and COUNT) are reported by the same rule and are NOT in the verdict: the same PASS with a SIGN family at the fish's own level, and the family appears with its own margins", sc.verdict === "PASS" && sc.families.sign.n === 3 && sc.families.sign.audits.audit.wins === false && near(sc.families.sign.audits.audit.m, -0.30, 1e-12));
    const few = L.verdictOf([rec("fish", 0, -0.33, -0.43, -0.38), ...ER, ...LAYER.slice(0, 2), ...DEGREE]);
    ok("NOT ASSESSED while a family of the verdict has fewer than three finished controls", few.verdict === "NOT ASSESSED" && /layer need at least 3 finished controls/.test(few.why));
    const nofish = L.verdictOf([...ER, ...LAYER, ...DEGREE]);
    ok("NOT ASSESSED with no fish record", nofish.verdict === "NOT ASSESSED" && /no fish record/.test(nofish.why) && nofish.fish === null);
    const nochamp = L.verdictOf(all(rec("fish", 0, -0.33, -0.43, -0.38, 699, { champion: false })));
    ok("a fish with no eligible champion is scored as the autopilot (-0.5, -0.6, -0.55: far below every control), so the verdict is FAIL", nochamp.verdict === "FAIL" && near(nochamp.families.er.audits.audit.F, -0.5, 1e-12));
    const ncs = L.verdictOf([rec("fish", 0, -0.33, -0.43, -0.38, 699), ...ER.map((r) => ({ ...r, scores: { ...r.scores, champion: null } })), ...LAYER, ...DEGREE]);
    ok("a CONTROL with no champion is scored as the autopilot too (ER at -0.5 on the audit: mean -0.5)", near(ncs.families.er.audits.audit.m, -0.5, 1e-12) && near(ncs.families.er.audits.safetyAudit.m, -0.6, 1e-12));
    const ctl = (fam) => [100, 200, 300].map((p, i) => rec(fam, i, -0.5 + 0.1 * i, -0.6 + 0.1 * i, -0.3 - 0.1 * i, p));
    const rv = L.verdictOf([rec("fish", 0, -0.33, -0.43, -0.38, 699), ...ctl("er"), ...ctl("layer"), ...ctl("degree")]);
    ok("the reach correlation is Spearman over the ER, LAYER and DEGREE controls: reach 100, 200, 300 in each family with the audit and the safety audit rising and the reserve falling gives exactly +1, +1 and -1", near(rv.reach.audit, 1, 1e-12) && near(rv.reach.safetyAudit, 1, 1e-12) && near(rv.reach.reserve, -1, 1e-12), J(rv.reach));
    const rv2 = L.verdictOf([rec("fish", 0, -0.33, -0.43, -0.38, 699), ...ctl("er"), ...ctl("layer"), ...ctl("degree"), ...ctl("sign").map((r) => ({ ...r, reach: { ...r.reach, pairs: 9999 } })), ...ctl("count")]);
    ok("the fish, SIGN and COUNT records do not enter the reach correlation (adding a SIGN family at reach 9999 changes nothing)", J(rv2.reach) === J(rv.reach));
    ok("the verdict does not read the SIGN and COUNT records' reach (a SIGN family at reach 699 changes nothing)", J(L.verdictOf(all(rec("fish", 0, -0.33, -0.43, -0.38, 699), SIGN)).reach) === J(pass.reach));
    const lines = L.reportLines(all(rec("fish", 0, -0.33, -0.43, -0.38, 699), SIGN));
    ok("the report prints the autopilot's audits, the fish, one line a family (with its reach range and no-champion count), the reach correlation and the verdict; SIGN is marked as not in the verdict",
        /^the autopilot on the audits: audit -0\.5000 \| safety audit -0\.6000 \| reserve -0\.5500$/.test(lines[0]) && /^FISH .*champion seed 21001, QUALIFIES against the autopilot \| audit -0\.3300 \| safety audit -0\.4300 \| reserve -0\.3800$/.test(lines[1]) &&
        lines.some((l) => /^ER x4 \(0 with no champion; reach 150-150 pairs\): audit -0\.4000 \+- 0\.0082 \(fish \+0\.0700, needs 0\.0200: WINS\)/.test(l)) && lines.some((l) => /^SIGN x3 .*\[reported, not in the verdict\]$/.test(l)) && lines.some((l) => /^rank correlation of reach with score/.test(l)) && /^RUNG 3 \(HMI circuit\): PASS -- /.test(lines[lines.length - 1]), lines.join(" | "));
});

// ================================================================================================================================================================================================================
sec("4. the arguments and the results file");
await guarded("section 4", async () => {
    const p = (a) => { try { return L.parseArgs(a); } catch (e) { return { threw: e.message }; } };
    const d = p(["run", "--specs", "fish", "--out", "r.jsonl"]);
    ok("run with a spec and an --out is the recorded recipe: 4 runs x 400 children, sigma 0.3, 1-4 weights, one at a time, the vendored circuit, audits on base 20000, not smoke, not quiet", d.cmd === "run" && J(d.recipe) === J({ runs: 4, iters: 400, sigma: 0.3, maxK: 4 }) && d.workers === 1 && d.circuitFile === L.CIRCUIT_FILE && d.auditBase === 20000 && d.smoke === false && d.quiet === false && d.one === null && d.out === "r.jsonl");
    const all = p(["run", "--specs", "er:0-2", "--out", "o", "--workers", "3", "--runs", "2", "--iters", "9", "--sigma", "0.1", "--maxK", "2", "--circuit-file", "c.json", "--audit-base", "30000", "--smoke", "--quiet"]);
    ok("every run option is read, an explicit option beats the default", all.workers === 3 && J(all.recipe) === J({ runs: 2, iters: 9, sigma: 0.1, maxK: 2 }) && all.circuitFile === "c.json" && all.auditBase === 30000 && all.smoke && all.quiet);
    ok("--one SPEC is the child's mode: it needs no --specs and no --out", p(["run", "--one", "er:3"]).one === "er:3" && p(["run", "--one", "er:3"]).threw === undefined);
    const rep = p(["report", "--in", "r.jsonl", "--allow-smoke"]);
    ok("report reads --in and --allow-smoke", rep.cmd === "report" && rep.in === "r.jsonl" && rep.allowSmoke === true && p(["report", "--in", "x"]).allowSmoke === false);
    const bad = [["no command", [], /the first word must be run or report, got undefined/], ["another command", ["train"], /got "train"/], ["a stray word", ["run", "fish"], /unexpected argument "fish"/], ["an unknown option", ["run", "--specs", "fish", "--out", "o", "--itres", "5"], /unknown option "--itres" \(known for run: --specs/],
        ["an option of the other command", ["report", "--in", "x", "--specs", "fish"], /unknown option "--specs" \(known for report: --in, --allow-smoke\)/], ["a missing value", ["run", "--specs"], /--specs needs a value/], ["an option as a value", ["run", "--specs", "--out", "x"], /--specs needs a value/],
        ["a value that is not a number", ["run", "--specs", "fish", "--out", "o", "--iters", "many"], /--iters needs a number, got "many"/], ["no specs", ["run", "--out", "o"], /run needs --specs/], ["no --out", ["run", "--specs", "fish"], /run needs --out/],
        ["zero runs", ["run", "--specs", "fish", "--out", "o", "--runs", "0"], /--runs must be a whole number of 1 or more, got 0/], ["a fractional iters", ["run", "--specs", "fish", "--out", "o", "--iters", "2.5"], /--iters must be a whole number/],
        ["zero workers", ["run", "--specs", "fish", "--out", "o", "--workers", "0"], /--workers must be a whole number/], ["a zero maxK", ["run", "--specs", "fish", "--out", "o", "--maxK", "0"], /--maxK must be a whole number/], ["a sigma of 0", ["run", "--specs", "fish", "--out", "o", "--sigma", "0"], /--sigma must be above 0/],
        ["a bad spec", ["run", "--specs", "er:99", "--out", "o"], /past index 19/], ["two specs for --one", ["run", "--one", "fish,er:0"], /--one takes a single spec/], ["report without --in", ["report"], /report needs --in/]];
    for (const [what, a, re] of bad) { const r = p(a); ok(`${what} is refused by name`, typeof r.threw === "string" && re.test(r.threw), r.threw || J(r)); }
    const text = J({ a: 1 }) + "\n\n" + J({ b: 2 }) + "\n";
    ok("readRecords reads one JSON object a line and skips blank lines; a line that is not JSON is refused with its number", L.readRecords(text).length === 2 && /line 2 is not JSON/.test(throws(() => L.readRecords('{"a":1}\n{oops\n')) || ""));
});

// ================================================================================================================================================================================================================
sec("5. the command, with a stand-in for the training");
await guarded("section 5", async () => {
    const files = new Map(), appended = [], outs = [], errs = [];
    const mkRunner = (calls) => (spec, circuit, opts, log) => { calls.push(L.specName(spec)); const base = -0.4 - 0.01 * L.ordinalOf(spec) % 0.05; const r = rec(spec.family, spec.index, base, base - 0.1, base - 0.05, 100 + L.ordinalOf(spec), { smoke: opts.smoke }); r.recipe = { ...opts.recipe, auditBase: opts.smoke ? null : opts.auditBase }; return r; };
    const io = (calls) => ({ out: (m) => outs.push(m), err: (m) => errs.push(m), readFile: (f) => { if (!files.has(f)) throw new Error("ENOENT " + f); return files.get(f); }, exists: (f) => files.has(f), appendFile: (f, t) => { appended.push([f, t]); files.set(f, (files.get(f) || "") + t); }, runner: mkRunner(calls) });
    const calls1 = []; files.clear();
    const code = await L.command(["run", "--specs", "fish,er:0-2", "--out", "r.jsonl"], io(calls1));
    ok("run trains every spec in order, appends ONE line per finished circuit to --out, prints the progress and the report, and exits 0", code === 0 && J(calls1) === '["fish","er:0","er:1","er:2"]' && appended.length === 4 && appended.every(([f]) => f === "r.jsonl") && files.get("r.jsonl").trim().split("\n").length === 4 &&
        outs.some((m) => /4 circuits asked for, 0 already in r\.jsonl, 4 to train: 4 searches x 400 children each, audits on base 20000, 1 at a time/.test(m)) && outs.some((m) => /^\[trainSubCircuitFamily\] er:1 done: champion seed 21001/.test(m)) && outs.some((m) => /^RUNG 3/.test(m)), outs.slice(0, 2).join(" | "));
    const calls2 = []; outs.length = 0; appended.length = 0;
    const code2 = await L.command(["run", "--specs", "fish,er:0-4", "--out", "r.jsonl"], io(calls2));
    ok("a second run with more specs RESUMES: it trains only er:3 and er:4, says 4 were already there, and the report covers all six", code2 === 0 && J(calls2) === '["er:3","er:4"]' && appended.length === 2 && outs.some((m) => /6 circuits asked for, 4 already in r\.jsonl, 2 to train/.test(m)) && outs.some((m) => /^ER x5/.test(m)));
    const calls3 = []; outs.length = 0; appended.length = 0; errs.length = 0;
    const code3 = await L.command(["run", "--specs", "er:0", "--out", "r.jsonl", "--iters", "10"], io(calls3));
    ok("a results file of another recipe is NOT mixed with: exit 1, nothing trained or appended, the records named", code3 === 1 && calls3.length === 0 && appended.length === 0 && errs.length === 1 && /holds 6 record\(s\) of another recipe or another audit range \(fish, er:0, er:1, er:2, er:3, er:4\)/.test(errs[0]) && /use another --out/.test(errs[0]), errs.join(" | "));
    const calls4 = []; errs.length = 0;
    const code4 = await L.command(["run", "--specs", "er:0", "--out", "r.jsonl", "--audit-base", "30000"], io(calls4));
    ok("so is a results file of another audit range", code4 === 1 && calls4.length === 0 && /another recipe or another audit range/.test(errs[0]));
    const calls5 = []; errs.length = 0;
    const code5 = await L.command(["run", "--specs", "er:0", "--out", "r.jsonl", "--smoke"], io(calls5));
    ok("and a smoke run does not mix with a full file", code5 === 1 && calls5.length === 0);
    outs.length = 0; errs.length = 0;
    const code6 = await L.command(["report", "--in", "r.jsonl"], io([]));
    ok("report prints the table from the file alone (fish, five ER, the verdict line) and exits 0; the verdict is not assessed with one family only", code6 === 0 && outs.some((m) => /^FISH /.test(m)) && outs.some((m) => /^ER x5 /.test(m)) && outs.some((m) => /NOT ASSESSED -- layer, degree need at least 3 finished controls/.test(m)));
    files.set("smoke.jsonl", J(rec("fish", 0, -0.3, -0.4, -0.35, 699, { smoke: true })) + "\n"); outs.length = 0; errs.length = 0;
    const code7 = await L.command(["report", "--in", "smoke.jsonl"], io([])), code7b = await L.command(["report", "--in", "smoke.jsonl", "--allow-smoke"], io([]));
    ok("report refuses smoke records unless --allow-smoke (exit 1 and a message, then exit 0)", code7 === 1 && /smoke records/.test(errs[0]) && code7b === 0 && outs.some((m) => /^FISH /.test(m)));
    files.set("empty.jsonl", "\n"); errs.length = 0;
    const code8 = await L.command(["report", "--in", "empty.jsonl"], io([])), code9 = await L.command(["report", "--in", "missing.jsonl"], io([]));
    files.set("junk.jsonl", "{oops\n"); const code10 = await L.command(["report", "--in", "junk.jsonl"], io([]));
    ok("report refuses an empty file (exit 1), a missing one (exit 1) and one with a line that is not JSON (exit 1), each with a message", code8 === 1 && code9 === 1 && code10 === 1 && /no records/.test(errs[0]) && /ENOENT/.test(errs[1]) && /line 1 is not JSON/.test(errs[2]), errs.join(" | "));
    errs.length = 0; const code11 = await L.command(["run", "--specs"], io([])), code12 = await L.command(["run", "--specs", "fish", "--out", "x", "--circuit-file", "/nonexistent/c.json"], io([]));
    ok("a bad argument is exit 2 with the message on stderr; a circuit file that cannot be read is exit 1", code11 === 2 && /^trainSubCircuitFamily: --specs needs a value/.test(errs[0]) && code12 === 1 && /cannot read the circuit file/.test(errs[1]), errs.join(" | "));
    outs.length = 0; const code13 = await L.command(["run", "--specs", "fish", "--out", "q.jsonl", "--quiet"], io([]));
    ok("--quiet drops the progress lines and keeps the report", code13 === 0 && !outs.some((m) => /circuits asked for/.test(m)) && outs.some((m) => /^RUNG 3/.test(m)));
    const one = []; await L.command(["run", "--one", "layer:2", "--quiet"], { ...io([]), out: (m) => one.push(m) });
    ok("--one prints the circuit as one RESULT line of JSON and writes nothing", one.length === 1 && /^RESULT \{/.test(one[0]) && JSON.parse(one[0].slice(7)).spec === "layer:2");
});

// ================================================================================================================================================================================================================
sec("6. one real run on a few throwaway dives, in this process and through children");
await guarded("section 6", async () => {
    const circuit = L.loadCircuit(), opts = { recipe: { runs: 2, iters: 40, sigma: 0.25, maxK: 3 }, smoke: true, auditBase: 20000 };
    const f1 = L.runCircuit({ family: "fish", index: 0 }, circuit, opts), f2 = L.runCircuit({ family: "fish", index: 0 }, circuit, opts), e0 = L.runCircuit({ family: "er", index: 0 }, circuit, opts);
    ok("the fish's record: spec fish, seeds 21000 and 21001, 885 weights, reach 699 pairs and 43 output cells, the recipe it ran with, smoke marked, and the three audits flown by the autopilot", f1.spec === "fish" && f1.family === "fish" && f1.seedBase === 21000 && J(f1.searches.map((s) => s.seed).sort()) === "[21000,21001]" && f1.weightCount === 885 && f1.reach.pairs === 699 && f1.reach.outputsReached === 43 &&
        f1.recipe.runs === 2 && f1.recipe.iters === 40 && f1.recipe.sigma === 0.25 && f1.recipe.maxK === 3 && f1.recipe.auditBase === null && f1.smoke === true && L.AUDITS.every((a) => Number.isFinite(f1.scores.autopilot[a].score)));
    ok("the run is deterministic (the same record twice, byte for byte) and the record is plain JSON", J(f1) === J(f2) && J(JSON.parse(J(f1))) === J(f1));
    ok("EVERY CIRCUIT STARTS AS THE SAME AUTOPILOT: the fish's and an ER control's autopilot scores on the three audits are identical, to the bit", J(f1.scores.autopilot) === J(e0.scores.autopilot) && e0.seedBase === 21010 && e0.reach.pairs < f1.reach.pairs);
    ok("a champion (when there is one) carries its four scores and its weights, and effectiveOf is finite either way; with none, weights are null and the effective scores are the autopilot's", (f1.champion === null ? f1.weights === null && f1.scores.champion === null && J(L.effectiveOf(f1)) === J({ audit: f1.scores.autopilot.audit.score, safetyAudit: f1.scores.autopilot.safetyAudit.score, reserve: f1.scores.autopilot.reserve.score }) :
        f1.weights.length === 885 && J(Object.keys(f1.scores.champion)) === '["heldOut","audit","safetyAudit","reserve"]') && L.AUDITS.every((a) => Number.isFinite(L.effectiveOf(f1)[a])), f1.champion === null ? "no champion" : "champion " + f1.champion);
    ok("the two searches of a circuit are different searches (their seeds differ, so their moves do): not the same improvements, neutral moves and pruned weights", J(f1.searches.map((s) => [s.improved, s.neutral, s.moved, s.kept]).sort()) !== J([f1.searches[0], f1.searches[0]].map((s) => [s.improved, s.neutral, s.moved, s.kept])) && f1.searches[0].moved !== f1.searches[1].moved, J(f1.searches.map((s) => [s.seed, s.improved, s.neutral, s.moved, s.kept])));
    const nOf = (r) => r && r.n;
    ok("every audit is flown on the sets it names: the autopilot's audit on 2 dives, safety audit on 3, reserve on 2 (smoke sets), and the champion's held-out on 2, audit on 2, safety audit on 3, reserve on 2 -- not the other sets", [f1.scores.autopilot.audit, f1.scores.autopilot.reserve].every((x) => nOf(x) === 2) && nOf(f1.scores.autopilot.safetyAudit) === 3 && (f1.champion === null || (nOf(f1.scores.champion.heldOut) === 2 && nOf(f1.scores.champion.audit) === 2 && nOf(f1.scores.champion.safetyAudit) === 3 && nOf(f1.scores.champion.reserve) === 2)));
    ok("each search reports its seed, train score, held-out score, eligibility and how far prune took it", f1.searches.length === 2 && f1.searches.every((s) => Number.isFinite(s.trainScore) && Number.isFinite(s.heldOut) && typeof s.eligible === "boolean" && s.moved >= s.kept));
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "subcirc-")), file = path.join(dir, "r.jsonl"), outs = [];
    const code = await L.command(["run", "--specs", "fish,er:0", "--out", file, "--workers", "2", "--runs", "2", "--iters", "40", "--sigma", "0.25", "--maxK", "3", "--smoke", "--quiet"], { out: (m) => outs.push(m), err: (m) => outs.push("ERR " + m), selfPath: path.join(HERE, "trainSubCircuitFamily.mjs") });
    const recs = fs.existsSync(file) ? fs.readFileSync(file, "utf8").trim().split("\n").map((l) => JSON.parse(l)) : [];
    ok("through child processes (--workers 2): both circuits finished, one line each in the file, the same records as the in-process run (the same answer to the bit), the report printed", code === 0 && recs.length === 2 && J(recs.map((r) => r.spec).sort()) === '["er:0","fish"]' && J(recs.find((r) => r.spec === "fish")) === J(f1) && J(recs.find((r) => r.spec === "er:0")) === J(e0) && outs.some((m) => /^RUNG 3/.test(m)), outs.join(" | ").slice(0, 300));
    const again = await L.command(["run", "--specs", "fish,er:0", "--out", file, "--workers", "2", "--runs", "2", "--iters", "40", "--sigma", "0.25", "--maxK", "3", "--smoke", "--quiet"], { out: (m) => outs.push(m), err: (m) => outs.push("ERR " + m), selfPath: path.join(HERE, "trainSubCircuitFamily.mjs") });
    ok("running the same command again finds both circuits in the file and trains nothing (the file still has two lines)", again === 0 && fs.readFileSync(file, "utf8").trim().split("\n").length === 2);
    const cmdFile = path.join(HERE, "trainSubCircuitFamily.mjs"), spawnSync = (await import("node:child_process")).spawnSync;
    const bad = spawnSync(process.execPath, [cmdFile, "run", "--specs"], { encoding: "utf8" }), ok0 = spawnSync(process.execPath, [cmdFile, "report", "--in", file, "--allow-smoke"], { encoding: "utf8" });
    ok("the command file is three lines that call it: a bad argument is exit 2 on stderr; report on the file just written prints the fish and exits 0", bad.status === 2 && /--specs needs a value/.test(bad.stderr) && ok0.status === 0 && /^FISH /m.test(ok0.stdout), bad.stderr.slice(0, 80));
    fs.rmSync(dir, { recursive: true, force: true });
});

// ================================================================================================================================================================================================================
sec("7. NOT CHECKED");
console.log("  NOT CHECKED  a full-recipe run (4 searches x 400 children on the real dives): this gate runs the plumbing on a few throwaway dives and the logic on hand-built records; the real run is the experiment");
console.log("  NOT CHECKED  that the verdict rule is the right rule: it is the one brain/SUBMARINE_WIP.md fixed in writing before any pilot was trained; the gate holds that the code is that rule");

finished = true;
console.log(fails ? `\ntrainSubCircuits-selfcheck: ${fails} FAILED` : "\ntrainSubCircuits-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
