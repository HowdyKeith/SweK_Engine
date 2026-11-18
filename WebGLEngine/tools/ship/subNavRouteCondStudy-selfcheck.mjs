// WebGLEngine/tools/ship/subNavRouteCondStudy-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node tools/ship/subNavRouteCondStudy-selfcheck.mjs      (a few seconds; NOTHING here flies DEV3 or HELD87 or builds a field of them: the flights and S are fixtures, the command's
// flying is replaced. The command does build the two sets' scenario OBJECTS -- a seed's draws, no plan and no flight)
//
// THE GATE OF tools/ship/subNavRouteCondStudy.mjs (NAV_PLUS ITEM 2 PART 3, registered first):
//   1 THE READINGS  R1 TIME on S only (the complement does not move it), R2 REACH on all, the verdict's branches and HARMFUL, the reported complement and all-scenario lines.
//   2 THE CHECKS    each check fails on its own break and names itself; S too small is NOT WEIGHED.
//   3 THE COMMAND   refusals; checks 2, 3 and 4 before any HELD87 flight (a failure flies nothing); S printed BEFORE the flights; flown once; every flight written with its inS flag.
//   4 THE SOURCE    no clock, no Math.random; the registered numbers.
// SABOTAGE LOG (each broken in tools/ship/subNavRouteCondStudy.mjs, run, restored; red = failing rows):
//   D1 R1 read on all scenarios, not S 1 | D2 the collision condition dropped 1 | D3 ties dropped from the median 2 | D4 S's size never checked 2 | D5 HELD87 flown when the chain does not bite 1
//   D6 S printed after the flights 1 | D7 the inS flag not written 1 | D8 a second HELD87 flight allowed 1 | D9 the reach branch's gain bar 7 1
//   D10 check 2 blind to the chains: 0 red at first (the command's check was stubbed and stillIsShared had no row); the row added; then 1
//   PART 3 AMENDMENT 1's fixes, each with its row written first: E1 DEV judged like the held read (check 5 applied, no readings) 1 | E2 the flights written after the extras (a throw loses them) 1
//   E3 a refusal before flying exits 0 1 | E6 exact ties counted as faster or slower 2. *** THESE FOUR WERE FIRST RUN AGAINST A STUDY THAT DID NOT PARSE (an edit had commented out
//   the rest of a one-line function, and a name was declared twice), and the count -- FAIL rows -- read the import crash as green and each mutant as red. Re-run on the mended file,
//   counting only FAIL rows of a gate that loaded; the numbers here are those. *** Not given a mutant: check 1's literal list in the command -- in the gate the flown list IS the literal list,
//   so a mutant there is equivalent; the literal-list row holds checksOf itself.
"use strict";
import fs from "node:fs";
import * as Y from "./subNavRouteCondStudy.mjs";
import * as R from "../../brain/subNavRoute.mjs";
let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const sec = (t) => console.log("\n" + t);
const J = JSON.stringify;
console.log("subNavRouteCondStudy-selfcheck -- the conditional reading of the route round\n");

/** A fixture: per scenario [refStatus, refT, routeStatus, routeT], seeds from 9501. */
const runsOf = (rows) => rows.flatMap(([rs, rt, ws, wt], i) => [{ arm: "any+crab", kind: "hard-stream", seed: 9501 + i, status: rs, reached: rs === "reached", t: rs === "reached" ? rt : null, path: 400, chord: 380 }, { arm: "any+crab+route", kind: "hard-stream", seed: 9501 + i, status: ws, reached: ws === "reached", t: ws === "reached" ? wt : null, path: 410, chord: 380 }]);
const rep = (n, row) => Array.from({ length: n }, () => row);
const sFirst = (n) => new Set(Array.from({ length: n }, (_, i) => 9501 + i));

sec("1. THE READINGS");
{
    // 25 in S: faster at 0.9; then 150 outside S, all ties
    const runs = runsOf([...rep(22, ["reached", 150, "reached", 135]), ...rep(3, ["reached", 150, "reached", 155]), ...rep(150, ["reached", 150, "reached", 150])]), j = Y.judge(runs, sFirst(25));
    ok("!! R1 is read on S ONLY: 22 faster and 3 slower there, median 0.9: FASTER -- though 150 ties outside S would put the all-scenario median at 1; SUPPORTED", j.isFaster && j.t.n === 25 && Math.abs(j.t.median - 0.9) < 1e-12 && j.all.median === 1 && j.verdict === "SUPPORTED", `p ${j.t.p.toExponential(2)}`);
    ok("!! the complement is reported: 150 both reached, 150 ties", j.rest.n === 150 && j.rest.ties === 150);
    const crash = Y.judge(runsOf([...rep(25, ["reached", 150, "reached", 135]), ["timeout", 0, "collided", 0]]), sFirst(25));
    ok("!! FASTER on S but one more collision on ALL (outside S): PARTLY SUPPORTED", crash.isFaster && crash.cr.collided === 1 && crash.verdict === "PARTLY SUPPORTED");
    const edge = Y.judge(runsOf([...rep(12, ["reached", 150, "reached", 145.5]), ...rep(2, ["reached", 150, "reached", 153])]), sFirst(14));
    ok("!! on S a median of 0.97 with p 0.013: PARTLY SUPPORTED; the ties-dropped median is reported", !edge.isFaster && Math.abs(edge.t.median - 0.97) < 1e-12 && edge.t.p > 0.01 && edge.verdict === "PARTLY SUPPORTED" && Number.isFinite(edge.t.medianNoTies));
    const reach = Y.judge(runsOf([...rep(20, ["reached", 150, "reached", 150]), ...rep(6, ["timeout", 0, "reached", 200])]), sFirst(20));
    ok("!! 6 rescued OUTSIDE S, none lost (gain 6 on all 200, p 0.03): PARTLY SUPPORTED by reach", reach.pr.gain === 6 && !reach.isFaster && reach.verdict === "PARTLY SUPPORTED");
    const h5 = Y.judge(runsOf([...rep(20, ["reached", 150, "reached", 150]), ...rep(5, ["reached", 150, "timeout", 0])]), sFirst(20));
    ok("!! 5 lost: HARMFUL (gain <= -5), NOT SUPPORTED", h5.pr.gain === -5 && h5.harmful && h5.verdict === "NOT SUPPORTED");
    const tie = Y.judge(runsOf([...rep(10, ["reached", 150, "reached", 135]), ...rep(15, ["reached", 150, "reached", 150])]), sFirst(25));
    ok("!! ties in S are dropped from the sign test and kept in the median (median 1 here: not FASTER)", tie.t.faster === 10 && tie.t.slower === 0 && tie.t.ties === 15 && tie.t.median === 1 && !tie.isFaster);
}

sec("2. THE CHECKS");
{
    const runs = runsOf(rep(25, ["reached", 150, "reached", 140])), S = sFirst(25), good = { still: true, old: true, bite: { n: 30, inS: 9, share: 0.3, met: true }, S, seeds: runs.filter((r) => r.arm === "any+crab").map((r) => r.seed) };
    const bad = (o, r = runs) => Y.checksOf(r, { ...good, ...o }).filter((c) => !c.ok).map((c) => c.name);
    ok("!! each check fails on its own break and names itself", bad({}).length === 0 && J(bad({ seeds: [...good.seeds, 9999] })) === J(["SAME SCENARIOS"]) && J(bad({ still: false })) === J(["STILL WATER IS THE SHARED PLAN"]) && J(bad({ old: false })) === J(["THE OLD FLIGHTS STAND"]) && J(bad({ bite: { n: 30, inS: 4, share: 4 / 30, met: false } })) === J(["THE CHAIN BITES"]) && J(bad({ S: sFirst(19) })) === J(["S IS LARGE ENOUGH"]));
    const L = Y.report(runs, Y.checksOf(runs, { ...good, S: sFirst(19) }), sFirst(19), [], "fixture").join("\n");
    ok("!! S with 19 both reached (fewer than 20): NOT WEIGHED, no verdict", /VERDICT: NOT WEIGHED/.test(L) && !/R1 TIME/.test(L));
}

{
    const same = () => ({ status: "reached", ticks: 100, path: 300, minClearance: 5 });
    ok("!! check 2 also needs the chains: identical still-water flights with a chain that differs fail it; with none, pass", Y.stillIsShared(same, () => ({ inS: true })) === false && Y.stillIsShared(same, () => ({ inS: false })) === true && Y.stillIsShared((sc, arm) => ({ ...same(), ticks: arm === "any+crab" ? 100 : 101 }), () => ({ inS: false })) === false);
}

{
    const scs = [{ seed: 1001 }, { seed: 1002 }, { seed: 1003 }], S = Y.sOf(scs, (sc) => ({ inS: sc.seed !== 1002 }));
    const real = R.streamScenario(1001);
    ok("!! sOf is the set of seeds whose chains differ (stub chains); by default it reads R.planChains (seed 1001, in no set)", S instanceof Set && J([...S]) === J([1001, 1003]) && Y.sOf([real]).has(1001) === R.planChains(real).inS && Y.sOf([]).size === 0);
    const seen = [];
    Y.stillIsShared((sc, arm) => { seen.push(sc.seed); return { status: "reached", ticks: 1, path: 1, minClearance: 1 }; }, () => ({ inS: false }));
    ok("!! STILL_SEEDS is 3: check 2 reads DEV3's first three seeds (901 to 903), each under both arms", Y.STILL_SEEDS === 3 && J(seen) === J([901, 901, 902, 902, 903, 903]));
    const tj = Y.judge(runsOf([["reached", 150, "reached", 150 * (1 + 5e-10)], ["reached", 150, "reached", 150 * (1 - 5e-10)], ["reached", 150, "reached", 150 * (1 + 3e-9)]]), sFirst(3));
    ok("!! TIE is 1e-9: ratios within it of 1 are ties; 1 + 3e-9 is slower", Y.TIE === 1e-9 && tj.t.ties === 2 && tj.t.slower === 1 && tj.t.faster === 0);
}

sec("3. THE COMMAND");
{
    const run = (argv, fl = {}) => {
        const out = [], err = [], files = [], at = {}; let flown = 0;
        let code; try { code = Y.command(argv, { out: (m) => out.push(m), err: (m) => err.push(m), writeFile: (f, t) => files.push([f, t]), exists: fl.exists || (() => false), exitIo: { err: (m) => err.push(m), exit: (c) => { throw new Error("exit " + c); } },
            flights: { s: (scs) => new Set(scs.slice(0, Math.round(scs.length * 0.3)).map((sc) => sc.seed)), runs: (scs) => { at.runs = out.length; flown += scs.length; return runsOf(scs.map(() => ["reached", 150, "reached", 140])); }, still: () => true, old: () => true, extras: () => ({ bite: 7, inBand: 3 }), ...fl } }); } catch (e) { if (/^exit /.test(e.message)) throw e; err.push(String(e.message)); code = -1; }
        return { code, out: out.join("\n"), lines: out, err: err.join("\n"), files, flown, at };
    };
    const thrown = (f) => { try { f(); return ""; } catch (e) { return String(e.message); } };
    ok("!! refused: an unknown set; --write on DEV; HELD87 without --write; HELD87 already flown; an unknown option exits 2", run(["--set", "held86"]).code === 2 && run(["--write"]).code === 2 && run(["--set", "held87"]).code === 2 && run(["--set", "held87", "--write"], { exists: () => true }).code === 2 && /exit 2/.test(thrown(() => run(["--seeds", "3"]))));
    const nb = run(["--set", "held87", "--write"], { s: (scs) => new Set(scs.slice(0, 2).map((sc) => sc.seed)) }), ns = run(["--set", "held87", "--write"], { still: () => false });
    ok("!! a refusal before flying exits 3 and names each failed check with its consequence (check 4 failing and check 2 failing together print NOT WEIGHED and NOT FLOWN)", nb.code === 3 && ns.code === 3 && (() => { const both = run(["--set", "held87", "--write"], { still: () => false, s: (scs) => new Set(scs.slice(0, 2).map((sc) => sc.seed)) }); return /FAIL STILL WATER/.test(both.out) && /FAIL THE CHAIN BITES/.test(both.out) && /VERDICT: NOT WEIGHED/.test(both.out) && /VERDICT: NOT FLOWN/.test(both.out); })());
    ok("!! check 4 (the chain bites) or check 2 failing: HELD87 is NOT flown and nothing written", nb.flown === 0 && nb.files.length === 0 && /VERDICT: NOT FLOWN: THE PLANS DO NOT DIFFER/.test(nb.out) && ns.flown === 0 && /VERDICT: NOT WEIGHED/.test(ns.out) && run(["--set", "held87", "--write"], { old: () => false }).flown === 0);
    const w = run(["--set", "held87", "--write"]), sLine = w.lines.findIndex((l) => /^S \(fixed before any HELD87 flight\): 60 of 200/.test(l));
    ok("!! HELD87: S is printed BEFORE the flights are called; 200 flown once; the verdict; every flight written with its inS flag", sLine >= 0 && sLine < w.at.runs && w.flown === 200 && /VERDICT: SUPPORTED/.test(w.out) && w.files.length === 1 && w.files[0][0].endsWith("brain/subNavRouteHeld87.jsonl") && (() => { const ls = w.files[0][1].trim().split("\n").map((l) => JSON.parse(l)); return ls.length === 400 && ls.filter((l) => l.inS).length === 120 && ls.every((l) => l.stream && typeof l.along === "boolean"); })());
    const d = run(["--set", "dev3"]);
    ok("!! DEV is a sanity run: its readings and the arm table are printed (check 5 does not apply), no VERDICT line, nothing written", /R1 TIME ON S/.test(d.out) && /any\+crab\+route/.test(d.out) && !/VERDICT/.test(d.out) && /DEV: a sanity run, not a result/.test(d.out) && !/S IS LARGE ENOUGH/.test(d.out) && d.files.length === 0 && d.flown === 30);
    const tw = run(["--set", "held87", "--write"], { extras: () => { throw new Error("boom"); } });
    ok("!! the flights are written before anything after them can throw", tw.files.length === 1 && tw.files[0][1].trim().split("\n").length === 400, tw.err.slice(0, 80));
    ok("!! check 1 holds the flown seeds to the literal HELD87 list", Y.checksOf(runsOf(rep(200, ["reached", 150, "reached", 140])), { still: true, old: true, bite: { met: true, n: 30, inS: 9, share: 0.3 }, S: sFirst(30), seeds: R.ROUTE_SETS.held87 }).every((c) => c.ok) && !Y.checksOf(runsOf(rep(199, ["reached", 150, "reached", 140])), { still: true, old: true, bite: { met: true, n: 30, inS: 9, share: 0.3 }, S: sFirst(30), seeds: R.ROUTE_SETS.held87 })[0].ok);
    ok("!! OUT_FILE is brain/subNavRouteHeld87.jsonl, the file HELD87 is written to; AIM_DEG (5) is the start-heading bar printed with the extras", Y.OUT_FILE === "brain/subNavRouteHeld87.jsonl" && w.files[0][0].endsWith(Y.OUT_FILE) && Y.AIM_DEG === 5 && w.out.includes(`start headings more than ${Y.AIM_DEG} degrees apart`));
    ok("  the reported extras are printed (start-heading bite, start or waypoint in the band)", /7 of 200 scenarios have t = 0 start headings/.test(w.out) && /3 have the start or the waypoint inside the stream's band/.test(w.out));
}

sec("4. THE SOURCE");
{
    const code = fs.readFileSync(new URL("./subNavRouteCondStudy.mjs", import.meta.url), "utf8").split("\n").filter((l) => !l.trim().startsWith("//")).join("\n");
    ok("!! no clock and no Math.random; the registered numbers (15 percent, 20 in S, 0.95 and 0.05, 0.98, gain 5 at 0.10, -5, DEV 901 to 930, HELD87 9501 to 9700, chains differ beyond 1e-6 m within 400 steps)", !/Math\.random|Date\.now|new Date|performance\.now/.test(code) && Y.BITE_BAR === 0.15 && Y.MIN_S === 20 && Y.FASTER_RATIO === 0.95 && Y.FASTER_P === 0.05 && Y.PARTLY_RATIO === 0.98 && Y.REACH_GAIN === 5 && Y.REACH_P === 0.10 && Y.HARMFUL === -5 && R.ROUTE_SETS.dev3[0] === 901 && R.ROUTE_SETS.held87.at(-1) === 9700 && R.CHAIN_EPS === 1e-6 && R.CHAIN_STEPS === 400);
}

console.log(fails ? `\n${fails} FAIL` : "\nall checks pass");
process.exitCode = fails ? 1 : 0;
