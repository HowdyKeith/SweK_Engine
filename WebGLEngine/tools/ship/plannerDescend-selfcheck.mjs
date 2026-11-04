// WebGLEngine/tools/ship/plannerDescend-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node tools/ship/plannerDescend-selfcheck.mjs      (about 15 s: hand fixtures and a few 100-second dives)
//
// THE GATE OF tools/ship/plannerDescend.mjs (Round 29 of brain/NEEDS_AND_LIMITS.md, registered first).
//   1 SETS      selection 5801-5900 (200 dives an arm) and confirmation 5401-5500, 5501-5600, 5601-5700 (200 dives a block, 600 an arm) of far and both, disjoint from every seed of Rounds 1-27; the nine-arm grid and the reference.
//   2 SHIFT     the arm names, the shifts they stand for and the parameters after the shift (low and high move, nothing else); a name outside the grid is refused.
//   3 WINNER    the highest mean wins; a tie goes to the arm nearest the reference, then to the smaller low shift; an incomplete selection is refused.
//   4 LINES     the three bottom lines in all their cases.
//   5 CHECKS    grid distinct, sizes, kinds aligned; a failed check says NOT WEIGHED.
//   6 REPORT    the lines.
//   7 FLIGHT    real 100-second dives: a selection arm is the twin on the shifted constants, TWIN-WIN uses the winner's constants and TWIN-REF the reference's, the TUNED arms the bare rule; unknown arm or block refused.
//   8 SOURCE    the seeds appear in one place; no clock, random or file.
// NOT CHECKED, said plainly: whether any retune helps (that is the experiment).
// SABOTAGE LOG (41 mutants of tools/ship/plannerDescend.mjs, run against a copy of this gate, each applied alone): 39 went red by name on the first pass. 2 went 0 red: the retune's differences pooled over the first block only (the fixture was symmetric across blocks: a row with +0.3 on one block only, now red) and the tie-break distance measured from zero instead of from the reference -- EQUIVALENT on this grid, since every arm's low shift is at or below the reference's the two distances differ by the constant 0.04 and order the nine arms identically (a row pins the tie-break behaviour that does exist). The others: the grid's lows, highs and reference, the name's sign, the shift's sign, size and target (low, high, alpha), shiftsOf accepting anything, the winner picking the lowest, the tie-breaks, an incomplete selection, the job list, TWIN-WIN/TWIN-REF/TUNED arms given each other's constants or pilot, the gauge dropped, seconds ignored, the unknown block and arm refusals, each bottom line reading another difference, the winner==reference case, a 1 se reading, the checks forced true, the sizes, alignment, assemble, the selection range, the head's round and the report's marker and selection advantage.
"use strict";
import fs from "node:fs";
let fails = 0, finished = false;
const died = (e) => { console.log("  FAIL  !! THE GATE THREW before it finished: " + String((e && e.stack) || e).split("\n").slice(0, 3).join(" | ").slice(0, 400)); process.exitCode = 1; };
process.on("uncaughtException", died); process.on("unhandledRejection", died);
process.on("exit", () => { if (!finished) { console.log("  FAIL  !! THE GATE ENDED BEFORE IT FINISHED"); process.exitCode = 1; } });
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const sec = (t) => console.log("\n" + t);
const J = JSON.stringify, near = (a, b, t = 1e-9) => Math.abs(a - b) < t;
import * as T from "../../brain/needsTask.mjs";
import * as U from "../../brain/tunedRule.mjs";
import * as Q from "../../brain/plannerPerturbed.mjs";
import * as X from "./plannerDescend.mjs";
console.log("plannerDescend-selfcheck -- the Round 29 search for the low trip point\n");
const code = fs.readFileSync(new URL("./plannerDescend.mjs", import.meta.url), "utf8").split("\n").filter((l) => !/^\s*\/\//.test(l)).join("\n");
const rangeOf = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);
const R8 = { alpha: 0.001, low: 0.38036, high: 0.68938, ramp: 20, cap: 0.88615 };

sec("1. SETS");
{
    const prior = new Set([...rangeOf(1, 1100), ...rangeOf(1101, 1208), ...rangeOf(1221, 1328), ...rangeOf(1341, 1448), ...rangeOf(1461, 1568), ...rangeOf(1601, 1768), ...rangeOf(1801, 2100), ...rangeOf(2201, 2308), ...rangeOf(2401, 3400), ...rangeOf(3501, 3850), ...rangeOf(3901, 4096), ...rangeOf(4201, 4348), ...rangeOf(4401, 4700), ...rangeOf(4801, 5100), ...rangeOf(5201, 5300), ...rangeOf(5401, 5700)]);
    const seeds = [...rangeOf(5801, 5900), ...rangeOf(5901, 6000), ...rangeOf(6001, 6100), ...rangeOf(6101, 6200)];
    ok("!! selection 5801-5900 and confirmation K2a 5901-6000, K2b 6001-6100, K2c 6101-6200 (400 distinct seeds), 200 dives each of far and both, share no seed with Rounds 1-28", J(X.SEL_RANGE) === J([5801, 5900]) && J(X.CONF_RANGES) === J({ K2a: [5901, 6000], K2b: [6001, 6100], K2c: [6101, 6200] }) && J(X.CONF_NAMES) === J(["K2a", "K2b", "K2c"]) && new Set(seeds).size === 400 && seeds.every((s) => !prior.has(s)) && X.SEL_DIVES === 200 && X.BLOCK_DIVES === 200);
    ok("!! the grid is the four arms low -0.12, -0.16, -0.20, -0.23 at high 0 in that order; the reference is L-0.12H0 (Round 28's winner)", J(X.GRID) === J(["L-0.12H0", "L-0.16H0", "L-0.20H0", "L-0.23H0"]) && X.REF === "L-0.12H0" && J(X.LOWS) === J([-0.12, -0.16, -0.2, -0.23]) && J(X.HIGHS) === J([0]));
    ok("!! four confirmation arms on three blocks: 12 jobs", J(X.CONF_ARMS) === J(["TWIN-WIN", "TWIN-REF", "TUNED-WIN", "TUNED-REF"]) && X.JOBS.length === 12 && X.JOBS.filter(([a]) => a === "TWIN-WIN").length === 3);
}
sec("2. SHIFT");
{
    const p = X.paramsOf("L-0.23H0", R8), q = X.paramsOf("L-0.12H0", R8), thr = (n) => { try { X.shiftsOf(n); return false; } catch { return true; } };
    ok("!! L-0.23H0 moves low down by 0.23 (to 0.15036, inside the rule's bound 0.15) and changes nothing else; the Round 8 object is not changed", near(p.low, 0.15036) && p.high === R8.high && p.alpha === R8.alpha && p.ramp === R8.ramp && p.cap === R8.cap && R8.low === 0.38036 && R8.high === 0.68938 && U.normalise(p, U.WIDE_BOUNDS).low === p.low);
    ok("!! the reference moves low by -0.12 and leaves high where it was", near(q.low, 0.26036) && q.high === R8.high);
    ok("!! shiftsOf is the inverse of the name for all four arms; a name outside the grid (L-0.06H0, L-0.12H+0.04, TWIN-WIN, '', a prototype name) is refused", X.GRID.every((n) => { const s = X.shiftsOf(n); return X.armName(s.dl, s.dh) === n; }) && thr("L-0.06H0") && thr("L-0.12H+0.04") && thr("L-0.04H0") && thr("TWIN-WIN") && thr("") && thr("constructor") && X.armName(0, 0) === "L0H0");
}
sec("3. WINNER");
{
    const sel = (f) => Object.fromEntries(X.GRID.map((n) => [n, { score: f(n) }]));
    ok("!! the highest mean wins", X.winnerOf(sel((n) => (n === "L-0.20H0" ? 0.9 : 0.8))) === "L-0.20H0" && X.winnerOf(sel((n) => (n === "L-0.12H0" ? 0.9 : 0.8))) === "L-0.12H0");
    ok("!! an exact tie goes to the arm nearest the reference (the reference itself over any other; between L-0.16H0 and L-0.23H0 the nearer, L-0.16H0)", X.winnerOf(sel(() => 0.8)) === "L-0.12H0" && X.winnerOf(sel((n) => (n === "L-0.16H0" || n === "L-0.23H0" ? 0.9 : 0.8))) === "L-0.16H0");
    ok("!! the nearer arm wins a tie even when it is listed after the farther one (L-0.20H0 over L-0.23H0 and not by list position: the sort is by distance)", X.winnerOf(sel((n) => (n === "L-0.20H0" || n === "L-0.23H0" ? 0.9 : 0.8))) === "L-0.20H0");
    const thr = (s) => { try { X.winnerOf(s); return false; } catch (e) { return /must hold all 4 grid arms, got 3/.test(e.message); } };
    const part = sel(() => 0.8); delete part["L-0.20H0"];
    ok("!! a selection with an arm missing is refused with its own message, not a TypeError", thr(part));
}
// synthetic confirmation: 200 dives a block (100 far, 100 both)
const mkRun = (arm, off, b) => ({ score: 0.7, crashed: 0, stranded: 0, runs: Array.from({ length: 200 }, (_, i) => { const base = 0.6 + 0.1 * Math.sin(i + 7 * b), g = off ? off(b, i) : 0; return { kind: i < 100 ? "far" : "both", score: base + g, fingerprint: g !== 0 ? `${arm}_${b}_${i}` : `B${b}_${i}` }; }) });
const synthAu = (o = {}) => Object.fromEntries(X.CONF_NAMES.map((n, b) => [n, { "TWIN-WIN": mkRun("TWIN-WIN", o.win, b), "TWIN-REF": mkRun("TWIN-REF", o.ref, b), "TUNED-WIN": mkRun("TUNED-WIN", o.tw, b), "TUNED-REF": mkRun("TUNED-REF", o.tr, b) }]));
const synthSel = (win = "L-0.16H0") => Object.fromEntries(X.GRID.map((n, i) => [n, { score: n === win ? 0.82 : 0.8 + i * 0.0001, runs: Array.from({ length: 200 }, (_, k) => ({ kind: k < 100 ? "far" : "both", score: 0.8, fingerprint: n + "_" + k })) }]));
const every = (k, v) => (b, i) => (i % k === 0 ? v : 0);
sec("4. LINES");
{
    const L = (o, w = "L-0.16H0") => X.bottomLines(synthAu(o), w);
    ok("!! a real retune: line 1 names the winner with its estimate and se; line 2 the twin's gain over the rule on the winner's constants", /^A LOWER TRIP POINT STILL HELPS \(L-0\.16H0: \+0\.0200, se [0-9.]+\)$/.test(L({ win: every(2, 0.14), ref: every(2, 0.1), tw: every(10, 0.1), tr: every(10, 0.1) })[0]) && /^THE TWIN'S GAIN SURVIVES \(\+0\.0[0-9]{3}, se 0\.0[0-9]{3}\)$/.test(L({ win: every(2, 0.14), ref: every(2, 0.1), tw: every(10, 0.1), tr: every(10, 0.1) })[1]));
    ok("!! when the winner IS the reference line 1 says THE OPTIMUM IS AT OR ABOVE -0.12 even if the (identical) arms differ in the fixture", L({ win: every(2, 0.14), ref: every(2, 0.1) }, "L-0.12H0")[0] === "THE OPTIMUM IS AT OR ABOVE LOW -0.12 (L-0.12H0)");
    ok("!! a non-real difference is no improvement; a real WORSE winner is no improvement either", L({ win: every(2, 0.1), ref: every(2, 0.1) })[0] === "THE OPTIMUM IS AT OR ABOVE LOW -0.12 (L-0.16H0)" && L({ win: every(2, 0.05), ref: every(2, 0.1) })[0] === "THE OPTIMUM IS AT OR ABOVE LOW -0.12 (L-0.16H0)");
    ok("!! the twin's gain: does not survive when the twin is no better than the rule on the winner's constants", L({ win: every(2, 0.1), tw: every(2, 0.1) })[1] === "THE TWIN'S GAIN DOES NOT SURVIVE");
    ok("!! line 3: the rule alone IMPROVES TOO when TUNED-WIN beats TUNED-REF, wants OTHER CONSTANTS when it is really worse, the SAME CONSTANTS when neither", L({ tw: every(2, 0.1), tr: every(2, 0.05) })[2] === "THE RULE ALONE IMPROVES TOO" && L({ tw: every(2, 0.05), tr: every(2, 0.1) })[2] === "THE RULE ALONE WANTS OTHER CONSTANTS THAN THE TWIN" && L({})[2] === "THE RULE ALONE WANTS THE SAME CONSTANTS");
    ok("!! the differences pool all three blocks: +0.3 on the first block only and nothing elsewhere is +0.1 pooled (n 600), not the first block's +0.3", (() => { const d = X.differences(synthAu({ win: (b, i) => (b === 0 && i % 2 === 0 ? 0.3 : 0) })).retune; return d.n === 600 && near(d.mean, 0.05, 1e-9); })());
    {   // line 4: the hull
        const hull = (mut) => { const au = synthAu(); mut(au); return X.bottomLines(au, "L-0.16H0")[3]; };
        ok("!! the hull line: UNHARMED when no confirmation arm has a crushed or stranded dive", hull(() => {}) === "THE HULL IS UNHARMED (0 CRUSHED, 0 STRANDED)");
        ok("!! a crushed dive in any block or arm makes the hull PAY, counted over all arms and blocks and naming only the arms that paid (2 crushed in TWIN-WIN, 3 stranded in TUNED-REF)", hull((au) => { au.K2a["TWIN-WIN"].crashed = 1; au.K2c["TWIN-WIN"].crashed = 1; au.K2b["TUNED-REF"].stranded = 3; }) === "THE HULL PAYS: 2 CRUSHED, 3 STRANDED (TWIN-WIN, TUNED-REF)");
        ok("!! crushed alone pays too (1 crushed in TWIN-REF, nothing stranded)", hull((au) => { au.K2b["TWIN-REF"].crashed = 1; }) === "THE HULL PAYS: 1 CRUSHED, 0 STRANDED (TWIN-REF)");
        ok("!! stranded alone pays too; the count adds over the three blocks (1 + 1 + 1)", hull((au) => { for (const n of X.CONF_NAMES) au[n]["TUNED-WIN"].stranded = 1; }) === "THE HULL PAYS: 0 CRUSHED, 3 STRANDED (TUNED-WIN)");
    }
    ok("!! exactly 2 se is not real: a fixture whose retune mean is below 2 se does not pass", (() => { const au = synthAu({ win: (b, i) => (i === 7 ? 0.5 : 0) }); const d = X.differences(au).retune; return d.mean < 2 * d.se && X.bottomLines(au, "L-0.16H0")[0].startsWith("THE OPTIMUM"); })());
}
sec("5. CHECKS");
{
    const names = (sel, au) => X.checksOf(sel, au).filter((c) => !c.ok).map((c) => c.name);
    ok("!! three check rows on a clean audit: GRID DISTINCT, SIZES, KINDS ALIGNED; all pass", J(X.checksOf(synthSel(), synthAu()).map((c) => c.name)) === J(["GRID DISTINCT", "SIZES", "KINDS ALIGNED"]) && names(synthSel(), synthAu()).length === 0);
    const same = synthSel(); same["L-0.16H0"].runs = same["L-0.12H0"].runs.map((r) => ({ ...r }));
    ok("!! two grid arms with identical dives break GRID DISTINCT only", J(names(same, synthAu())) === J(["GRID DISTINCT"]));
    const sz = synthSel(); sz["L-0.12H0"].runs.pop(); const sz2 = synthAu(); sz2.K2b["TWIN-WIN"].runs.pop();
    ok("!! a selection arm of 199 dives, or a confirmation arm of 199, breaks SIZES", names(sz, synthAu()).includes("SIZES") && names(synthSel(), sz2).includes("SIZES"));
    const k = synthAu(); k.K2c["TUNED-WIN"].runs[3].kind = "both";
    ok("!! a dive of another kind than TWIN-REF's breaks KINDS ALIGNED only", J(names(synthSel(), k)) === J(["KINDS ALIGNED"]));
}
sec("6. REPORT");
{
    const au = synthAu({ win: every(2, 0.14), ref: every(2, 0.1), tw: every(10, 0.1), tr: every(10, 0.1) }), L = X.report(synthSel(), au, "L-0.16H0"), txt = L.join("\n");
    ok("!! the head names the selection and the three blocks with 600 dives per arm; the three checks pass first", /^ROUND 29: .*Selection K1 5801-5900 \(four arms, 200 dives each\); confirmation K2a 5901-6000, K2b 6001-6100, K2c 6101-6200 \(600 dives per arm; read once\)$/.test(L[0]) && L.slice(1, 4).every((l) => /^  PASS /.test(l)));
    ok("!! four selection rows with the difference from the reference, the winner and the reference marked", X.GRID.every((n) => txt.includes("  " + n.padEnd(13))) && /L-0\.16H0 +0\.8200 +\+0\.0[0-9]{3}  <- WINNER/.test(txt) && /L-0\.12H0 .*\(reference\)/.test(txt));
    ok("!! the winner line gives its selection advantage; the three confirmation differences carry se and counts", /winner L-0\.16H0 \(selection advantage over L-0\.12H0: \+0\.0[0-9]{3}\)/.test(txt) && /TWIN-WIN minus TWIN-REF: \+0\.0200 \(se [0-9.]+; better [0-9]+, worse [0-9]+, same [0-9]+\)/.test(txt) && /TWIN-WIN minus TUNED-WIN \(the twin over the rule on the winner's constants\):/.test(txt) && /TUNED-WIN minus TUNED-REF \(the rule alone/.test(txt));
    ok("!! the four bottom lines come last, each prefixed BOTTOM LINE:", L.slice(-4).every((l) => l.startsWith("BOTTOM LINE: ")) && /LOWER TRIP POINT|OPTIMUM/.test(L[L.length - 4]) && /TWIN'S GAIN/.test(L[L.length - 3]) && /RULE ALONE/.test(L[L.length - 2]) && /HULL/.test(L[L.length - 1]));
    const bad = synthAu({}); bad.K2a["TWIN-WIN"].runs.pop(); const Lb = X.report(synthSel(), bad, "L-0.16H0");
    ok("!! a failed check puts FAIL on its row, says the verdicts are NOT WEIGHED and puts that on a single bottom line", Lb.some((l) => /^  FAIL SIZES/.test(l)) && Lb.includes("A CHECK FAILED: the verdicts below are NOT WEIGHED.") && Lb[Lb.length - 1] === "BOTTOM LINE: NOT WEIGHED (a check failed)" && Lb.filter((l) => l.startsWith("BOTTOM LINE")).length === 1);
}
sec("7. FLIGHT");
{
    X.setFlight({ seconds: 100 });
    const rng = [1344, 1345], tw = (p) => T.evaluate(T.flyDecision(Q.perturbedSeat(p, {}, { seconds: 100 })), T.setOf(X.HARD, rng[0], rng[1]), { gauge: T.GAUGE, seconds: 100 });
    const a = X.flySelection("L-0.23H0", R8, { range: rng }), d = tw({ ...R8, low: R8.low - 0.23 }), ref = X.flySelection("L-0.12H0", R8, { range: rng });
    ok("!! a selection arm is the full twin on the shifted constants, dive for dive (L-0.23H0 on seeds 1344-1345 at 100 s), four dives far, far, both, both", a.runs.length === 4 && J(a.runs.map((r) => r.kind)) === J(["far", "far", "both", "both"]) && a.runs.every((r, i) => r.fingerprint === d.runs[i].fingerprint));
    X.setFlight({ seconds: 200 });
    { const a2 = X.flySelection("L-0.23H0", R8, { range: rng }), ref2 = X.flySelection("L-0.12H0", R8, { range: rng });
      ok("!! and over 200 seconds (a 100-second dive never gets low enough to meet the trip point) it differs from the reference's dives on three of the four (the shift reaches the seat)", a2.runs.filter((r, i) => r.fingerprint !== ref2.runs[i].fingerprint).length === 3); }
    X.setFlight({ seconds: 100 });
    X.setFlight({ seconds: 200 });
    const a200 = X.flySelection("L-0.23H0", R8, { range: rng }), ref200 = X.flySelection("L-0.12H0", R8, { range: rng });
    const ranges = { K2a: rng, K2b: rng, K2c: rng }, cf = (arm, w) => X.flyConfirm(arm, w, R8, "K2b", { ranges });
    const win = cf("TWIN-WIN", "L-0.23H0"), tref = cf("TWIN-REF", "L-0.23H0"), tw1 = cf("TUNED-WIN", "L-0.23H0"), tr1 = cf("TUNED-REF", "L-0.23H0");
    ok("!! TWIN-WIN is the twin on the winner's constants and TWIN-REF the twin on the reference's, whatever the winner is", win.runs.every((r, i) => r.fingerprint === a200.runs[i].fingerprint) && tref.runs.every((r, i) => r.fingerprint === ref200.runs[i].fingerprint) && win.runs.some((r, i) => r.fingerprint !== tref.runs[i].fingerprint));
    const bare = (p) => T.evaluate(T.flyDecision(U.tunedSeat(p, U.WIDE_BOUNDS)), T.setOf(X.HARD, rng[0], rng[1]), { gauge: T.GAUGE, seconds: 200 });
    ok("!! TUNED-WIN and TUNED-REF are the bare rule on the winner's and the reference's constants with the noisy gauge, dive for dive (and differ from the twin arms)", tw1.runs.every((r, i) => r.fingerprint === bare({ ...R8, low: R8.low - 0.23 }).runs[i].fingerprint) && tr1.runs.every((r, i) => r.fingerprint === bare({ ...R8, low: R8.low - 0.12 }).runs[i].fingerprint) && tw1.runs.some((r, i) => r.fingerprint !== win.runs[i].fingerprint));
    X.setFlight({});
    const msg = (f) => { try { f(); return ""; } catch (e) { return String(e.message); } };
    ok("!! an unknown confirmation arm and an unknown block are each refused with their own message (not a TypeError)", /plannerDescend\.flyConfirm: unknown arm "TWIN-FAST"/.test(msg(() => X.flyConfirm("TWIN-FAST", "L-0.12H0", R8, "K2a", { ranges }))) && /unknown block "K2z" \(K2a, K2b, K2c\)/.test(msg(() => X.flyConfirm("TWIN-WIN", "L-0.12H0", R8, "K2z", { ranges }))));
    ok("!! a winner outside the grid is refused at the flight, not flown on the Round 8 constants", /is not a grid arm/.test(msg(() => X.flyConfirm("TWIN-WIN", "L-0.07H0", R8, "K2a", { ranges }))) && /is not a grid arm/.test(msg(() => X.flySelection("L-0.07H0", R8, { range: rng }))));
    ok("!! assemble keys blocks then arms", J(Object.keys(X.assemble({ A: { K2a: 1, K2b: 2, K2c: 3 }, B: { K2a: 4, K2b: 5, K2c: 6 } }).K2b)) === J(["A", "B"]) && X.assemble({ A: { K2a: 1, K2b: 2, K2c: 3 } }).K2c.A === 3);
}
sec("8. SOURCE");
{
    ok("!! the seeds 5801, 5900, 5901, 6000, 6001, 6100, 6101 and 6200 appear once each", ["5801", "5900", "5901", "6000", "6001", "6100", "6101", "6200"].every((s) => code.split(s).length === 2));
    ok("!! the file reads no clock, no random number and nothing from the disk", !/Date\.now|Math\.random|performance\.now|readFileSync|writeFileSync/.test(code));
}
console.log(fails ? `\n${fails} FAIL` : "\nall checks pass");
finished = true;
