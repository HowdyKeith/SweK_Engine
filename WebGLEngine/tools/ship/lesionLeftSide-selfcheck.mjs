// WebGLEngine/tools/ship/lesionLeftSide-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node tools/ship/lesionLeftSide-selfcheck.mjs      (a few seconds: a synthetic task for the plan, the checks and the report; two short real flights for the no-op)
//
// THE GATE OF tools/ship/lesionLeftSide.mjs, the left-side lesion round registered in brain/LESION_LEFT_SIDE_WIP.md.
//   1 PLAN     402 arms: 1 intact, 4 + 316 primary, 4 + 76 mirror, 1 no-op; the registered classes, groupings, seed and draw counts; every draw role-matched and equal to randomSets at the seed; the no-op flies two ids, the rest twenty.
//   2 HOLM     the step-down on hand-made p values: each threshold, the stop at the first failure, ties, and the 1/80 floor passing step 1.
//   3 BOTTOM   the five words for 0 to 4 confirmed classes.
//   4 CHECKS   a complete synthetic file passes; each registered check goes red by name on a file broken its way.
//   5 REPORT   cost, rank p and Holm read from synthetic scores as written by hand; a confirmed cost under 1 percent is said to be; NOT WEIGHED when a check fails; the mirror lines.
//   6 REAL     the no-op arm flies the intact arm exactly on two real ids (20 s).
// SABOTAGE LOG: brain/LESION_LEFT_SIDE_WIP.md, the build section.
"use strict";
import fs from "node:fs";
let fails = 0, finished = false;
const died = (e) => { console.log("  FAIL  !! THE GATE THREW before it finished: " + String((e && e.stack) || e).split("\n").slice(0, 3).join(" | ").slice(0, 400)); process.exitCode = 1; };
process.on("uncaughtException", died); process.on("unhandledRejection", died);
process.on("exit", () => { if (!finished) { console.log("  FAIL  !! THE GATE ENDED BEFORE IT FINISHED"); process.exitCode = 1; } });
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const sec = (t) => console.log("\n" + t);
const J = JSON.stringify;
const R = await import((process.env.LLS_UNDER_TEST ? new URL("file://" + process.env.LLS_UNDER_TEST) : new URL("./lesionLeftSide.mjs", import.meta.url)).href);
import * as L from "../../brain/lesion.mjs";
import * as LF from "../../brain/lesionFlyCx.mjs";
const eng = new URL("../../", import.meta.url), rd = (f) => JSON.parse(fs.readFileSync(new URL(f, eng), "utf8"));
const [base] = LF.flyCxArms({ circuit: rd("vendor/hemibrain/hemibrain-cx-heading-loop.json"), file: rd("brain/pilotSubFlyCxWip.json") }), T = base.topo, plan = R.planArms(base);
console.log("lesionLeftSide-selfcheck -- the left-side lesion round\n");

sec("1. PLAN");
{
    const n = (role) => plan.filter((p) => p.role === role).length;
    ok("!! 402 arms: 1 intact, 4 primary + 316 draws, 4 mirrors + 76 draws, 1 no-op; ids unique", plan.length === 402 && n("intact") === 1 && n("primary") === 4 && n("primary-random") === 316 && n("mirror") === 4 && n("mirror-random") === 76 && n("noop") === 1 && new Set(plan.map((p) => p.id)).size === 402);
    ok("!! the registered classes and groupings: EPG_L, PEG_L by side; L5, L7 by glomerulus; mirrors EPG_R, PEG_R, R4 (of L5), R2 (of L7)", J(R.PRIMARY.map((c) => c.cls + "/" + c.by)) === J(["EPG_L/side", "PEG_L/side", "L5/glomerulus", "L7/glomerulus"]) && J(R.MIRRORS.map((c) => c.cls + "/" + c.by + "/" + c.of)) === J(["EPG_R/side/EPG_L", "PEG_R/side/PEG_L", "R4/glomerulus/L5", "R2/glomerulus/L7"]));
    ok("!! the registered numbers: ids 6001-6020, 120 s, seed 20261117, 79 and 19 draws, alpha 0.05, no-op on 6001-6002", R.IDS.from === 6001 && R.IDS.to === 6020 && R.SECONDS === 120 && R.SEED === 20261117 && R.DRAWS_PRIMARY === 79 && R.DRAWS_MIRROR === 19 && R.ALPHA === 0.05 && R.NOOP_IDS.from === 6001 && R.NOOP_IDS.to === 6002);
    const cls = (c, by) => L.classesOf(T, by).classes[c];
    ok("!! each class arm silences exactly its class's cells", R.PRIMARY.concat(R.MIRRORS).every((c) => J(plan.find((p) => p.cls === c.cls && (p.role === "primary" || p.role === "mirror")).neurons) === J(cls(c.cls, c.by))));
    const roleCount = (s) => J(T.STRATA.map((g) => g.filter((i) => s.includes(i)).length));
    ok("!! every draw is role-matched to its class, distinct from it and from the others, and equals randomSets at the registered seed", R.PRIMARY.concat(R.MIRRORS).every((c) => {
        const d = plan.filter((p) => p.cls === c.cls && p.role.endsWith("-random")).map((p) => p.neurons), want = L.randomSets(T, cls(c.cls, c.by), { count: d.length, seed: 20261117, matched: true });
        return J(d) === J(want) && d.every((s) => roleCount(s) === roleCount(cls(c.cls, c.by)) && s.join() !== cls(c.cls, c.by).join()) && new Set(d.map((s) => s.join())).size === d.length;
    }));
    ok("!! the no-op flies the first two ids, every other arm the twenty; the no-op silences nothing", J(R.rangeOf("noop")) === J({ from: 6001, to: 6002 }) && J(R.rangeOf("primary")) === J({ from: 6001, to: 6020 }) && plan.find((p) => p.role === "noop").neurons.length === 0 && J(plan.find((p) => p.role === "noop").arm.entry("x").weights) === J(base.entry("x").weights));
    ok("!! a base without the reservoir topology is refused", /must carry the fly's reservoir topology/.test((() => { try { R.planArms({ ...base, topo: null }); return ""; } catch (e) { return e.message; } })()));
}

sec("2. HOLM");
{
    const h = (ps) => R.holm(ps.map((p, i) => ({ name: "c" + i, p })));
    ok("!! thresholds 0.0125, 0.0167, 0.025, 0.05 by rank; all pass when each p is at its threshold", (() => { const x = h([0.05, 0.0125, 0.025, 0.05 / 3]); return x.every((y) => y.confirmed) && J(x.map((y) => y.rank)) === "[4,1,3,2]" && Math.abs(x[1].threshold - 0.0125) < 1e-12 && Math.abs(x[3].threshold - 0.05 / 3) < 1e-12; })());
    ok("!! the step-down stops at the first failure: [0.0125, 0.03, 0.01, 0.9] confirms the first and the third only (0.03 fails step 3's 0.025)", J(h([0.0125, 0.03, 0.01, 0.9]).map((y) => y.confirmed)) === "[true,false,true,false]" && J(h([0.0125, 0.02, 0.01, 0.9]).map((y) => y.confirmed)) === "[true,true,true,false]");
    ok("!! a later p under its own threshold is NOT confirmed after a failure: [0.0125, 0.03, 0.03, 0.04]", J(h([0.0125, 0.03, 0.03, 0.04]).map((y) => y.confirmed)) === "[true,false,false,false]");
    ok("!! the smallest p 79 draws give (1/80) passes step 1; 2/80 fails it", h([1 / 80, 1, 1, 1])[0].confirmed && !h([2 / 80, 1, 1, 1])[0].confirmed);
    ok("!! ties keep the input order and both are judged", J(h([0.01, 0.01, 0.5, 0.5]).map((y) => [y.rank, y.confirmed])) === "[[1,true],[2,true],[3,false],[4,false]]");
}

sec("3. BOTTOM");
ok("!! 0 NOT REPLICATED, 1 ONE CLASS CONFIRMED, 2-3 PARTLY REPLICATED (k of 4), 4 REPLICATED", /NOT REPLICATED/.test(R.bottomLine([])) && /ONE CLASS CONFIRMED \(L5\) -- not a left-side pattern/.test(R.bottomLine(["L5"])) && /PARTLY REPLICATED -- 2 of 4 .*\(EPG_L, L7\)/.test(R.bottomLine(["EPG_L", "L7"])) && /PARTLY REPLICATED -- 3 of 4/.test(R.bottomLine(["a", "b", "c"])) && /: REPLICATED -- all four/.test(R.bottomLine(["a", "b", "c", "d"])));

// a synthetic task: score = 0.8 - (cost of the arm) + a per-id wobble shared by every arm, the cost set per arm id by `costs`
const wob = (n) => 0.01 * Math.sin(n * 1.7);
const synth = (costs) => plan.map((p) => { const rg = R.rangeOf(p.role), runs = []; for (let n = rg.from; n <= rg.to; n++) runs.push({ key: "sb-" + n, score: 0.8 - (costs[p.id] || 0) - wob(n) * (p.role === "intact" || p.role === "noop" ? 1 : 1), bad: false }); return { kind: "arm", id: p.id, role: p.role, cls: p.cls, by: p.by, neurons: p.neurons, runs }; });
const header = { kind: "header", sha256: "abc", seed: 20261117, from: 6001, to: 6020, seconds: 120 };
sec("4. CHECKS");
{
    const good = [header, ...synth({})], C = (recs, sha = "abc") => R.checks(recs, { plan, sha256: sha });
    ok("!! a complete synthetic file passes every check", C(good).length === 0, J(C(good).slice(0, 2)));
    const drop = good.filter((r) => r.id !== plan[7].id), dup = [...good, good[5]];
    ok("!! COMPLETE: a missing arm, a repeated arm and an arm not in the plan each go red by name", C(drop).some((f) => /COMPLETE: arm .* is missing/.test(f)) && C(dup).some((f) => /appears twice/.test(f)) && C([...good, { ...good[3], id: "x~y" }]).some((f) => /not in the registered plan/.test(f)));
    ok("!! IDS: an arm on other ids goes red", C(good.map((r, i) => (i === 4 ? { ...r, runs: r.runs.map((x, k) => ({ ...x, key: "sb-" + (7001 + k) })) } : r))).some((f) => /^IDS:/.test(f)));
    ok("!! DRAWS: an arm whose silenced cells are not the seed's goes red", C(good.map((r, i) => (i === 9 ? { ...r, neurons: [0, 1, 2] } : r))).some((f) => /^DRAWS:/.test(f)));
    ok("!! WEIGHTS: another sha goes red; HEADER: another seed goes red; no header goes red", C(good, "zzz").some((f) => /^WEIGHTS:/.test(f)) && C([{ ...header, seed: 1 }, ...good.slice(1)]).some((f) => /^HEADER:/.test(f)) && C(good.slice(1)).some((f) => /no header record/.test(f)));
    ok("!! NO-OP: a no-op arm that differs from the intact arm goes red", C(good.map((r) => (r.id === "flycx-stateful~noop" ? { ...r, runs: r.runs.map((x) => ({ ...x, score: x.score + 1e-9 })) } : r))).some((f) => /^NO-OP:/.test(f)));
}

sec("5. REPORT");
{
    // EPG_L costs 0.02 (above every draw); PEG_L costs 0.001 and 79 draws cost 0.002 (p = 1); L5 0.015, and 2 of its draws cost 0.016 (p = 3/80); L7 0.012 (above every draw); mirrors: R4 costs 0.005
    const costs = {}, draws = (c) => plan.filter((p) => p.cls === c && p.role.endsWith("-random"));
    costs["flycx-stateful~EPG_L"] = 0.02; costs["flycx-stateful~PEG_L"] = 0.001; for (const p of draws("PEG_L")) costs[p.id] = 0.002;
    costs["flycx-stateful~L5"] = 0.015; draws("L5").slice(0, 2).forEach((p) => { costs[p.id] = 0.016; });
    costs["flycx-stateful~L7"] = 0.012; costs["flycx-stateful~R4"] = 0.005;
    const recs = [header, ...synth(costs)], lines = R.reportLines(recs, { plan, sha256: "abc" }), txt = lines.join("\n");
    ok("!! the checks pass and are said to", lines[0] === "CHECKS: IDS, WEIGHTS, DRAWS, COMPLETE, NO-OP all pass");
    ok("!! EPG_L: cost +0.0200, p 0.0125, Holm step 1, CONFIRMED", /EPG_L .*cost \+0\.0200 .*rank p 0\.0125; Holm step 1 needs 0\.0125: CONFIRMED/.test(txt), lines.find((l) => /EPG_L /.test(l)));
    ok("!! L7: cost +0.0120, p 0.0125, step 2, CONFIRMED; L5: p 3/80 = 0.0375 at step 3 (needs 0.025): NOT CONFIRMED; PEG_L p 1: NOT CONFIRMED", /L7 .*cost \+0\.0120 .*rank p 0\.0125; Holm step 2 needs 0\.0167: CONFIRMED/.test(txt) && /L5 .*rank p 0\.0375; Holm step 3 needs 0\.0250: NOT CONFIRMED/.test(txt) && /PEG_L .*rank p 1\.0000; Holm step 4 needs 0\.0500: NOT CONFIRMED/.test(txt));
    ok("!! the bottom line names the two confirmed classes; the percent of the intact score is printed and 'under 1 percent' is not said of 2.5 percent", /^LEFT-SIDE ROUND: PARTLY REPLICATED -- 2 of 4 primary classes confirmed \(EPG_L, L7\)$/m.test(txt) && /2\.5\d percent of the intact score/.test(txt) && !/EPG_L .*under 1 percent/.test(txt));
    const small = { ...costs, "flycx-stateful~EPG_L": 0.005 }, t2 = R.reportLines([header, ...synth(small)], { plan, sha256: "abc" }).join("\n");
    ok("!! a confirmed cost under 1 percent of the score is said to be", /EPG_L .*CONFIRMED.*a cost under 1 percent of the score/.test(t2));
    ok("!! the intact arm against each lesion uses the board's word: EPG_L IS BELOW (a constant 0.02 with no spread)", /EPG_L .*against the intact arm IS BELOW \(-0\.0200/.test(txt));
    ok("!! the mirror lines: R4 cost +0.0050, p over 19 draws, left minus right +0.0100 (the left lesion costs more)", /mirror R4 +of L5: cost \+0\.0050, rank p 0\.050 .*left minus right .* \+0\.0100, se 0\.0000: the left lesion costs more/.test(txt), lines.find((l) => /mirror R4/.test(l)));
    const broken = R.reportLines([{ ...header, seed: 9 }, ...synth(costs)], { plan, sha256: "abc" }).join("\n");
    ok("!! a failed check is the first line and the bottom line is marked NOT WEIGHED", /^CHECKS FAILED \(1\)/.test(broken) && /\[NOT WEIGHED\] LEFT-SIDE ROUND/.test(broken));
    ok("!! costOf and rankP are lesionReading's: cost = mean(intact - lesioned), p counts ties against the class", Math.abs(R.costOf({ runs: [{ score: 0.7 }, { score: 0.5 }] }, { runs: [{ score: 0.8 }, { score: 0.8 }] }) - 0.2) < 1e-12 && R.rankP(0.1, [0.1, 0.05, 0.2]) === 3 / 4 && R.rankP(0.3, [0.1]) === 0.5);
}

sec("6. REAL");
{
    const intact = plan.find((p) => p.role === "intact"), noop = plan.find((p) => p.role === "noop");
    const a = R.flyArm(intact, { seconds: 20 }), b = R.flyArm(noop, { seconds: 20 });
    ok("!! the no-op arm flies the intact arm exactly on sb-6001 and sb-6002 (20 s)", J(b.runs) === J(a.runs.slice(0, 2)) && b.runs.length === 2 && a.runs.length === 20 && a.runs[0].key === "sb-6001", J(b.runs.map((r) => r.score.toFixed(4))));
}

finished = true;
console.log(`\n${fails ? "FAIL" : "PASS"}  lesionLeftSide-selfcheck: ${fails} failing row${fails === 1 ? "" : "s"}`);
if (fails) process.exitCode = 1;
