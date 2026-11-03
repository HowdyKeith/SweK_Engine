// WebGLEngine/tools/ship/plannerRetune-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node tools/ship/plannerRetune-selfcheck.mjs      (about 15 s: hand fixtures and a few 100-second dives)
//
// THE GATE OF tools/ship/plannerRetune.mjs (Round 28 of brain/NEEDS_AND_LIMITS.md, registered first).
//   1 SETS      selection 5201-5300 (200 dives an arm) and confirmation 5401-5500, 5501-5600, 5601-5700 (200 dives a block, 600 an arm) of far and both, disjoint from every seed of Rounds 1-27; the nine-arm grid and the reference.
//   2 SHIFT     the arm names, the shifts they stand for and the parameters after the shift (low and high move, nothing else); a name outside the grid is refused.
//   3 WINNER    the highest mean wins; a tie goes to the arm nearest the reference, then to the smaller low shift; an incomplete selection is refused.
//   4 LINES     the three bottom lines in all their cases.
//   5 CHECKS    grid distinct, sizes, kinds aligned; a failed check says NOT WEIGHED.
//   6 REPORT    the lines.
//   7 FLIGHT    real 100-second dives: a selection arm is the twin on the shifted constants, TWIN-WIN uses the winner's constants and TWIN-REF the reference's, the TUNED arms the bare rule; unknown arm or block refused.
//   8 SOURCE    the seeds appear in one place; no clock, random or file.
// NOT CHECKED, said plainly: whether any retune helps (that is the experiment).
// SABOTAGE LOG: (filled in below after the mutation pass)
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
import * as X from "./plannerRetune.mjs";
console.log("plannerRetune-selfcheck -- the Round 28 retune\n");
const code = fs.readFileSync(new URL("./plannerRetune.mjs", import.meta.url), "utf8").split("\n").filter((l) => !/^\s*\/\//.test(l)).join("\n");
const rangeOf = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);
const R8 = { alpha: 0.001, low: 0.38036, high: 0.68938, ramp: 20, cap: 0.88615 };

sec("1. SETS");
{
    const prior = new Set([...rangeOf(1, 1100), ...rangeOf(1101, 1208), ...rangeOf(1221, 1328), ...rangeOf(1341, 1448), ...rangeOf(1461, 1568), ...rangeOf(1601, 1768), ...rangeOf(1801, 2100), ...rangeOf(2201, 2308), ...rangeOf(2401, 3400), ...rangeOf(3501, 3850), ...rangeOf(3901, 4096), ...rangeOf(4201, 4348), ...rangeOf(4401, 4700), ...rangeOf(4801, 5100)]);
    const seeds = [...rangeOf(5201, 5300), ...rangeOf(5401, 5500), ...rangeOf(5501, 5600), ...rangeOf(5601, 5700)];
    ok("!! selection 5201-5300 and confirmation J2a 5401-5500, J2b 5501-5600, J2c 5601-5700 (400 distinct seeds), 200 dives each of far and both, share no seed with Rounds 1-27", J(X.SEL_RANGE) === J([5201, 5300]) && J(X.CONF_RANGES) === J({ J2a: [5401, 5500], J2b: [5501, 5600], J2c: [5601, 5700] }) && J(X.CONF_NAMES) === J(["J2a", "J2b", "J2c"]) && new Set(seeds).size === 400 && seeds.every((s) => !prior.has(s)) && X.SEL_DIVES === 200 && X.BLOCK_DIVES === 200);
    ok("!! the grid is the nine arms low -0.04, -0.08, -0.12 by high -0.04, 0, +0.04 in that order; the reference is L-0.04H0 (Round 26's TWIN-LOW)", J(X.GRID) === J(["L-0.04H-0.04", "L-0.04H0", "L-0.04H+0.04", "L-0.08H-0.04", "L-0.08H0", "L-0.08H+0.04", "L-0.12H-0.04", "L-0.12H0", "L-0.12H+0.04"]) && X.REF === "L-0.04H0" && J(X.LOWS) === J([-0.04, -0.08, -0.12]) && J(X.HIGHS) === J([-0.04, 0, 0.04]));
    ok("!! four confirmation arms on three blocks: 12 jobs", J(X.CONF_ARMS) === J(["TWIN-WIN", "TWIN-REF", "TUNED-WIN", "TUNED-REF"]) && X.JOBS.length === 12 && X.JOBS.filter(([a]) => a === "TWIN-WIN").length === 3);
}
sec("2. SHIFT");
{
    const p = X.paramsOf("L-0.12H+0.04", R8), q = X.paramsOf("L-0.04H0", R8), thr = (n) => { try { X.shiftsOf(n); return false; } catch { return true; } };
    ok("!! L-0.12H+0.04 moves low down by 0.12 and high up by 0.04 and changes nothing else; the Round 8 object is not changed", near(p.low, 0.26036) && near(p.high, 0.72938) && p.alpha === R8.alpha && p.ramp === R8.ramp && p.cap === R8.cap && R8.low === 0.38036 && R8.high === 0.68938);
    ok("!! the reference moves low by -0.04 and leaves high where it was", near(q.low, 0.34036) && q.high === R8.high);
    ok("!! shiftsOf is the inverse of the name for all nine arms; a name outside the grid (L-0.06H0, TWIN-WIN, '', a prototype name) is refused", X.GRID.every((n) => { const s = X.shiftsOf(n); return X.armName(s.dl, s.dh) === n; }) && thr("L-0.06H0") && thr("TWIN-WIN") && thr("") && thr("constructor") && X.armName(0, 0) === "L0H0");
}
sec("3. WINNER");
{
    const sel = (f) => Object.fromEntries(X.GRID.map((n) => [n, { score: f(n) }]));
    ok("!! the highest mean wins", X.winnerOf(sel((n) => (n === "L-0.08H+0.04" ? 0.9 : 0.8))) === "L-0.08H+0.04");
    ok("!! an exact tie goes to the arm nearest the reference: L-0.04H0 itself over any other; between two non-reference arms the nearer one (L-0.08H0 at distance 0.04 over L-0.12H+0.04 at 0.12)", X.winnerOf(sel(() => 0.8)) === "L-0.04H0" && X.winnerOf(sel((n) => (n === "L-0.08H0" || n === "L-0.12H+0.04" ? 0.9 : 0.8))) === "L-0.08H0");
    ok("!! at equal distance from the reference the smaller low shift wins: L-0.08H0 (low -0.08, distance 0.04) and L-0.04H+0.04 (low -0.04, distance 0.04) -- the one with the smaller (less negative) low shift", X.winnerOf(sel((n) => (n === "L-0.08H0" || n === "L-0.04H+0.04" ? 0.9 : 0.8))) === "L-0.04H+0.04");
    const thr = (s) => { try { X.winnerOf(s); return false; } catch (e) { return /must hold all 9 grid arms, got 8/.test(e.message); } };
    const part = sel(() => 0.8); delete part["L-0.12H0"];
    ok("!! a selection with an arm missing is refused with its own message, not a TypeError", thr(part));
}
// synthetic confirmation: 200 dives a block (100 far, 100 both)
const mkRun = (arm, off, b) => ({ score: 0.7, crashed: 0, stranded: 0, runs: Array.from({ length: 200 }, (_, i) => { const base = 0.6 + 0.1 * Math.sin(i + 7 * b), g = off ? off(b, i) : 0; return { kind: i < 100 ? "far" : "both", score: base + g, fingerprint: g !== 0 ? `${arm}_${b}_${i}` : `B${b}_${i}` }; }) });
const synthAu = (o = {}) => Object.fromEntries(X.CONF_NAMES.map((n, b) => [n, { "TWIN-WIN": mkRun("TWIN-WIN", o.win, b), "TWIN-REF": mkRun("TWIN-REF", o.ref, b), "TUNED-WIN": mkRun("TUNED-WIN", o.tw, b), "TUNED-REF": mkRun("TUNED-REF", o.tr, b) }]));
const synthSel = (win = "L-0.08H0") => Object.fromEntries(X.GRID.map((n, i) => [n, { score: n === win ? 0.82 : 0.8 + i * 0.0001, runs: Array.from({ length: 200 }, (_, k) => ({ kind: k < 100 ? "far" : "both", score: 0.8, fingerprint: n + "_" + k })) }]));
const every = (k, v) => (b, i) => (i % k === 0 ? v : 0);
sec("4. LINES");
{
    const L = (o, w = "L-0.08H0") => X.bottomLines(synthAu(o), w);
    ok("!! a real retune: line 1 names the winner with its estimate and se; line 2 the twin's gain over the rule on the winner's constants", /^THE RETUNE IMPROVES ON LOW-0\.04 \(L-0\.08H0: \+0\.0200, se [0-9.]+\)$/.test(L({ win: every(2, 0.14), ref: every(2, 0.1), tw: every(10, 0.1), tr: every(10, 0.1) })[0]) && /^THE TWIN'S GAIN SURVIVES THE RETUNE \(\+0\.0[0-9]{3}, se 0\.0[0-9]{3}\)$/.test(L({ win: every(2, 0.14), ref: every(2, 0.1), tw: every(10, 0.1), tr: every(10, 0.1) })[1]));
    ok("!! when the winner IS the reference line 1 says NO RETUNE IMPROVES even if the (identical) arms differ in the fixture", L({ win: every(2, 0.14), ref: every(2, 0.1) }, "L-0.04H0")[0] === "NO RETUNE IMPROVES ON LOW-0.04 (L-0.04H0)");
    ok("!! a non-real difference is no improvement; a real WORSE winner is no improvement either", L({ win: every(2, 0.1), ref: every(2, 0.1) })[0] === "NO RETUNE IMPROVES ON LOW-0.04 (L-0.08H0)" && L({ win: every(2, 0.05), ref: every(2, 0.1) })[0] === "NO RETUNE IMPROVES ON LOW-0.04 (L-0.08H0)");
    ok("!! the twin's gain: does not survive when the twin is no better than the rule on the winner's constants", L({ win: every(2, 0.1), tw: every(2, 0.1) })[1] === "THE TWIN'S GAIN DOES NOT SURVIVE THE RETUNE");
    ok("!! line 3: the rule alone IMPROVES TOO when TUNED-WIN beats TUNED-REF, wants OTHER CONSTANTS when it is really worse, the SAME CONSTANTS when neither", L({ tw: every(2, 0.1), tr: every(2, 0.05) })[2] === "THE RULE ALONE IMPROVES TOO" && L({ tw: every(2, 0.05), tr: every(2, 0.1) })[2] === "THE RULE ALONE WANTS OTHER CONSTANTS THAN THE TWIN" && L({})[2] === "THE RULE ALONE WANTS THE SAME CONSTANTS");
    ok("!! exactly 2 se is not real: a fixture whose retune mean is below 2 se does not pass", (() => { const au = synthAu({ win: (b, i) => (i === 7 ? 0.5 : 0) }); const d = X.differences(au).retune; return d.mean < 2 * d.se && X.bottomLines(au, "L-0.08H0")[0].startsWith("NO RETUNE"); })());
}
sec("5. CHECKS");
{
    const names = (sel, au) => X.checksOf(sel, au).filter((c) => !c.ok).map((c) => c.name);
    ok("!! three check rows on a clean audit: GRID DISTINCT, SIZES, KINDS ALIGNED; all pass", J(X.checksOf(synthSel(), synthAu()).map((c) => c.name)) === J(["GRID DISTINCT", "SIZES", "KINDS ALIGNED"]) && names(synthSel(), synthAu()).length === 0);
    const same = synthSel(); same["L-0.08H0"].runs = same["L-0.12H0"].runs.map((r) => ({ ...r }));
    ok("!! two grid arms with identical dives break GRID DISTINCT only", J(names(same, synthAu())) === J(["GRID DISTINCT"]));
    const sz = synthSel(); sz["L-0.04H0"].runs.pop(); const sz2 = synthAu(); sz2.J2b["TWIN-WIN"].runs.pop();
    ok("!! a selection arm of 199 dives, or a confirmation arm of 199, breaks SIZES", names(sz, synthAu()).includes("SIZES") && names(synthSel(), sz2).includes("SIZES"));
    const k = synthAu(); k.J2c["TUNED-WIN"].runs[3].kind = "both";
    ok("!! a dive of another kind than TWIN-REF's breaks KINDS ALIGNED only", J(names(synthSel(), k)) === J(["KINDS ALIGNED"]));
}
sec("6. REPORT");
{
    const au = synthAu({ win: every(2, 0.14), ref: every(2, 0.1), tw: every(10, 0.1), tr: every(10, 0.1) }), L = X.report(synthSel(), au, "L-0.08H0"), txt = L.join("\n");
    ok("!! the head names the selection and the three blocks with 600 dives per arm; the three checks pass first", /^ROUND 28: .*Selection J1 5201-5300 \(nine arms, 200 dives each\); confirmation J2a 5401-5500, J2b 5501-5600, J2c 5601-5700 \(600 dives per arm; read once\)$/.test(L[0]) && L.slice(1, 4).every((l) => /^  PASS /.test(l)));
    ok("!! nine selection rows with the difference from the reference, the winner and the reference marked", X.GRID.every((n) => txt.includes("  " + n.padEnd(13))) && /L-0\.08H0 +0\.8200 +\+0\.0[0-9]{3}  <- WINNER/.test(txt) && /L-0\.04H0 .*\(reference\)/.test(txt));
    ok("!! the winner line gives its selection advantage; the three confirmation differences carry se and counts", /winner L-0\.08H0 \(selection advantage over L-0\.04H0: \+0\.0[0-9]{3}\)/.test(txt) && /TWIN-WIN minus TWIN-REF: \+0\.0200 \(se [0-9.]+; better [0-9]+, worse [0-9]+, same [0-9]+\)/.test(txt) && /TWIN-WIN minus TUNED-WIN \(the twin over the rule on the winner's constants\):/.test(txt) && /TUNED-WIN minus TUNED-REF \(the rule alone/.test(txt));
    ok("!! the three bottom lines come last, each prefixed BOTTOM LINE:", L.slice(-3).every((l) => l.startsWith("BOTTOM LINE: ")) && /RETUNE/.test(L[L.length - 3]) && /TWIN'S GAIN/.test(L[L.length - 2]) && /RULE ALONE/.test(L[L.length - 1]));
    const bad = synthAu({}); bad.J2a["TWIN-WIN"].runs.pop(); const Lb = X.report(synthSel(), bad, "L-0.08H0");
    ok("!! a failed check puts FAIL on its row, says the verdicts are NOT WEIGHED and puts that on a single bottom line", Lb.some((l) => /^  FAIL SIZES/.test(l)) && Lb.includes("A CHECK FAILED: the verdicts below are NOT WEIGHED.") && Lb[Lb.length - 1] === "BOTTOM LINE: NOT WEIGHED (a check failed)" && Lb.filter((l) => l.startsWith("BOTTOM LINE")).length === 1);
}
sec("7. FLIGHT");
{
    X.setFlight({ seconds: 100 });
    const rng = [1344, 1345], tw = (p) => T.evaluate(T.flyDecision(Q.perturbedSeat(p, {}, { seconds: 100 })), T.setOf(X.HARD, rng[0], rng[1]), { gauge: T.GAUGE, seconds: 100 });
    const a = X.flySelection("L-0.12H+0.04", R8, { range: rng }), d = tw({ ...R8, low: R8.low - 0.12, high: R8.high + 0.04 }), ref = X.flySelection("L-0.04H0", R8, { range: rng });
    ok("!! a selection arm is the full twin on the shifted constants, dive for dive (L-0.12H+0.04 on seeds 1344-1345 at 100 s), four dives far, far, both, both", a.runs.length === 4 && J(a.runs.map((r) => r.kind)) === J(["far", "far", "both", "both"]) && a.runs.every((r, i) => r.fingerprint === d.runs[i].fingerprint));
    ok("!! and it differs from the reference's dives on at least one (the shift reaches the seat)", a.runs.some((r, i) => r.fingerprint !== ref.runs[i].fingerprint));
    const ranges = { J2a: rng, J2b: rng, J2c: rng }, cf = (arm, w) => X.flyConfirm(arm, w, R8, "J2b", { ranges });
    const win = cf("TWIN-WIN", "L-0.12H+0.04"), tref = cf("TWIN-REF", "L-0.12H+0.04"), tw1 = cf("TUNED-WIN", "L-0.12H+0.04"), tr1 = cf("TUNED-REF", "L-0.12H+0.04");
    ok("!! TWIN-WIN is the twin on the winner's constants and TWIN-REF the twin on the reference's, whatever the winner is", win.runs.every((r, i) => r.fingerprint === a.runs[i].fingerprint) && tref.runs.every((r, i) => r.fingerprint === ref.runs[i].fingerprint));
    const bare = (p) => T.evaluate(T.flyDecision(U.tunedSeat(p, U.WIDE_BOUNDS)), T.setOf(X.HARD, rng[0], rng[1]), { gauge: T.GAUGE, seconds: 100 });
    ok("!! TUNED-WIN and TUNED-REF are the bare rule on the winner's and the reference's constants with the noisy gauge, dive for dive (and differ from the twin arms)", tw1.runs.every((r, i) => r.fingerprint === bare({ ...R8, low: R8.low - 0.12, high: R8.high + 0.04 }).runs[i].fingerprint) && tr1.runs.every((r, i) => r.fingerprint === bare({ ...R8, low: R8.low - 0.04 }).runs[i].fingerprint) && tw1.runs.some((r, i) => r.fingerprint !== win.runs[i].fingerprint));
    X.setFlight({});
    const msg = (f) => { try { f(); return ""; } catch (e) { return String(e.message); } };
    ok("!! an unknown confirmation arm and an unknown block are each refused with their own message (not a TypeError)", /plannerRetune\.flyConfirm: unknown arm "TWIN-FAST"/.test(msg(() => X.flyConfirm("TWIN-FAST", "L-0.04H0", R8, "J2a", { ranges }))) && /unknown block "J2z" \(J2a, J2b, J2c\)/.test(msg(() => X.flyConfirm("TWIN-WIN", "L-0.04H0", R8, "J2z", { ranges }))));
    ok("!! a winner outside the grid is refused at the flight, not flown on the Round 8 constants", /is not a grid arm/.test(msg(() => X.flyConfirm("TWIN-WIN", "L-0.07H0", R8, "J2a", { ranges }))) && /is not a grid arm/.test(msg(() => X.flySelection("L-0.07H0", R8, { range: rng }))));
    ok("!! assemble keys blocks then arms", J(Object.keys(X.assemble({ A: { J2a: 1, J2b: 2, J2c: 3 }, B: { J2a: 4, J2b: 5, J2c: 6 } }).J2b)) === J(["A", "B"]) && X.assemble({ A: { J2a: 1, J2b: 2, J2c: 3 } }).J2c.A === 3);
}
sec("8. SOURCE");
{
    ok("!! the seeds 5201, 5300, 5401, 5500, 5501, 5600, 5601 and 5700 appear once each", ["5201", "5300", "5401", "5500", "5501", "5600", "5601", "5700"].every((s) => code.split(s).length === 2));
    ok("!! the file reads no clock, no random number and nothing from the disk", !/Date\.now|Math\.random|performance\.now|readFileSync|writeFileSync/.test(code));
}
console.log(fails ? `\n${fails} FAIL` : "\nall checks pass");
finished = true;
