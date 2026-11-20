// WebGLEngine/tools/ship/subNavRouteStudy-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node tools/ship/subNavRouteStudy-selfcheck.mjs      (a few seconds; NOTHING here flies DEV or HELD86: the flights are fixtures and the command's flying is replaced)
//
// THE GATE OF tools/ship/subNavRouteStudy.mjs (NAV_PLUS ITEM 2 PART 2, registered first):
//   1 THE READINGS  R1 TIME (median ratio and the sign test, ties dropped), R2 REACH, the verdict's three branches and HARMFUL, each by the registered rule, on fixtures.
//   2 THE CHECKS    each check fails on its own break and names itself; one failure prints NOT WEIGHED and no verdict.
//   3 THE BITE      aimDiff's angle on a real field; biteOf's share against the 15 percent bar.
//   4 THE COMMAND   argument refusals; HELD86 NOT FLOWN when check 4 fails on DEV (nothing flown); --write writes every flight; PART A prints its record and flies nothing.
//   5 THE SOURCE    no clock, no Math.random; the registered numbers.
// SABOTAGE LOG (each broken in tools/ship/subNavRouteStudy.mjs, run, restored; red = failing rows):
//   Y1 the FASTER bar 0.97 2 | Y2 ties counted as faster 1 | Y3 the collision condition dropped from SUPPORTED 1 (the gain-0 crash row was added before the pass, for this)
//   Y4 HARMFUL at gain < -5: 0 red at first (no fixture at exactly -5); the -5 row added; then 1 | Y5 HELD86 flown when check 4 fails on DEV 1 | Y6 check 4 always passes 1
//   Y7 PART A planned in still water 1 (the row was added before the pass) | Y8 the partial bar's p 0.01: 0 red at first (the fixture's p was tiny); the p 0.013 row added; then 1
//   Y9 the along bar 0.9: 0 red at first (the fixture's angles were far from the bar); the acos(0.75) / acos(0.65) row added; then 1
//   AMENDMENT 1's fixes, each with its row written first: Z1 checks 2 and 3 after the HELD86 flights again 1 | Z2 a second HELD86 flight allowed (the file exists) 1 | Z3 HELD86 without --write 1
//   Z4 the held set's start-heading share not reported 1 | Z5 SAME SCENARIOS blind to the seed list 1 | Z6 HARMFUL not beside the verdict 1 | Z7 --part a with --set accepted 1 | Z8 DEV's share reported as the held set's 1
"use strict";
import fs from "node:fs";
import * as Y from "./subNavRouteStudy.mjs";
import * as R from "../../brain/subNavRoute.mjs";
import * as P from "../../brain/subNavPlus.mjs";
import * as AP from "../../brain/autopilotSub.mjs";
import { CURRENT_KINDS } from "./subNavPlusStudy.mjs";
let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const sec = (t) => console.log("\n" + t);
const J = JSON.stringify;
console.log("subNavRouteStudy-selfcheck -- the readings, checks and command of the route round\n");

/** A fixture: per scenario [refStatus, refT, routeStatus, routeT]. */
const runsOf = (rows) => rows.flatMap(([rs, rt, ws, wt], i) => [{ arm: "any+crab", kind: "hard-stream", seed: 9301 + i, status: rs, reached: rs === "reached", t: rs === "reached" ? rt : null, path: 400, chord: 380 }, { arm: "any+crab+route", kind: "hard-stream", seed: 9301 + i, status: ws, reached: ws === "reached", t: ws === "reached" ? wt : null, path: 410, chord: 380 }]);
const rep = (n, row) => Array.from({ length: n }, () => row);

sec("1. THE READINGS");
{
    const fast = Y.judge(runsOf([...rep(30, ["reached", 150, "reached", 135]), ...rep(5, ["reached", 150, "reached", 160])]));
    ok("!! 30 faster at ratio 0.9 and 5 slower: median 0.9, sign p well under 0.05: FASTER; reach equal, no collisions: SUPPORTED", fast.isFaster && fast.faster === 30 && fast.slower === 5 && Math.abs(fast.median - 0.9) < 1e-12 && fast.verdict === "SUPPORTED", `p ${fast.pT.toExponential(2)}`);
    const tie = Y.judge(runsOf([...rep(30, ["reached", 150, "reached", 135]), ...rep(40, ["reached", 150, "reached", 150])]));
    ok("!! exact ties (|r - 1| < 1e-9) are dropped from the sign test but stay in the median (here 1: not FASTER)", tie.faster === 30 && tie.slower === 0 && tie.median === 1 && !tie.isFaster);
    const coll = Y.judge(runsOf([...rep(30, ["reached", 150, "reached", 135]), ["reached", 150, "collided", 0]]));
    ok("!! FASTER but the route collided where the reference reached (gain -1, one collision more): PARTLY SUPPORTED, not SUPPORTED", coll.isFaster && coll.pr.gain === -1 && coll.cr.collided === 1 && coll.verdict === "PARTLY SUPPORTED");
    const crash = Y.judge(runsOf([...rep(30, ["reached", 150, "reached", 135]), ["timeout", 0, "collided", 0]]));
    ok("!! FASTER and no reach lost (gain 0) but one more collision: PARTLY SUPPORTED, not SUPPORTED", crash.isFaster && crash.pr.gain === 0 && crash.cr.collided === 1 && crash.cf.collided === 0 && crash.verdict === "PARTLY SUPPORTED");
    const mild = Y.judge(runsOf(rep(30, ["reached", 150, "reached", 145.5])));
    ok("!! a median ratio of 0.97 with p <= 0.05 is not FASTER (bar 0.95) but is PARTLY SUPPORTED (median at most 0.98)", !mild.isFaster && Math.abs(mild.median - 0.97) < 1e-12 && mild.verdict === "PARTLY SUPPORTED");
    const reach = Y.judge(runsOf([...rep(6, ["timeout", 0, "reached", 200]), ...rep(20, ["reached", 150, "reached", 150])]));
    ok("!! no time gain but 6 rescued and none lost (gain 6, p 0.03): PARTLY SUPPORTED by reach", reach.pr.gain === 6 && reach.pr.p <= 0.10 && !reach.isFaster && reach.verdict === "PARTLY SUPPORTED");
    const harm = Y.judge(runsOf([...rep(6, ["reached", 150, "timeout", 0]), ...rep(20, ["reached", 150, "reached", 150])]));
    ok("!! 6 lost: gain -6, NOT SUPPORTED and HARMFUL", harm.pr.gain === -6 && harm.harmful && harm.verdict === "NOT SUPPORTED");
    const h5 = Y.judge(runsOf([...rep(5, ["reached", 150, "timeout", 0]), ...rep(20, ["reached", 150, "reached", 150])]));
    ok("!! exactly 5 lost (gain -5) is HARMFUL too: the bar is gain <= -5", h5.pr.gain === -5 && h5.harmful);
    const edge = Y.judge(runsOf([...rep(12, ["reached", 150, "reached", 145.5]), ...rep(2, ["reached", 150, "reached", 153])]));
    ok("!! a median of 0.97 with sign p 0.013 (12 faster, 2 slower): PARTLY SUPPORTED -- the partial bar's p is 0.05, the same as FASTER's", Math.abs(edge.median - 0.97) < 1e-12 && edge.pT > 0.01 && edge.pT <= 0.05 && edge.verdict === "PARTLY SUPPORTED", `p ${edge.pT.toFixed(4)}`);
    const slow = Y.judge(runsOf(rep(30, ["reached", 150, "reached", 165])));
    ok("  slower everywhere: NOT SUPPORTED, not harmful", slow.verdict === "NOT SUPPORTED" && !slow.harmful);
    const scs = [{ seed: 9301, start: { x: 0, y: 0 }, goal: { x: 380, y: 0 }, stream: { theta: 0.1 } }, { seed: 9302, start: { x: 0, y: 0 }, goal: { x: 380, y: 0 }, stream: { theta: Math.PI / 2 } }];
    const sp = Y.judge(runsOf([["reached", 150, "reached", 120], ["reached", 150, "reached", 150]]), scs);
    ok("  the along/across split (reported): a stream within acos(0.7) of the track is along, a perpendicular one across", sp.along.n === 1 && Math.abs(sp.along.median - 0.8) < 1e-12 && sp.across.n === 1 && sp.across.median === 1);
    ok("  the split's bar is |cos| >= 0.7: a stream at acos(0.75) from the track is along, one at acos(0.65) across", Y.alongTrack({ start: { x: 0, y: 0 }, goal: { x: 380, y: 0 }, stream: { theta: Math.acos(0.75) } }) && !Y.alongTrack({ start: { x: 0, y: 0 }, goal: { x: 380, y: 0 }, stream: { theta: Math.acos(0.65) } }));
}

sec("2. THE CHECKS");
{
    const runs = runsOf(rep(4, ["reached", 150, "reached", 140])), good = { still: true, old: true, bite: { n: 30, moved: 9, share: 0.3, met: true } };
    const bad = (o, r = runs) => Y.checksOf(r, { ...good, ...o }).filter((c) => !c.ok).map((c) => c.name);
    const shifted = runs.map((r) => (r.arm === "any+crab+route" ? { ...r, seed: r.seed + 1 } : r));
    ok("!! each check fails on its own break and names itself", bad({}).length === 0 && J(bad({}, shifted)) === J(["SAME SCENARIOS"]) && J(bad({ still: false })) === J(["STILL WATER IS THE SHARED PLAN"]) && J(bad({ old: false })) === J(["THE OLD FLIGHTS STAND"]) && J(bad({ bite: { n: 30, moved: 4, share: 4 / 30, met: false } })) === J(["THE ROUTE BITES"]));
    const L = Y.report(runs, Y.checksOf(runs, { ...good, old: false }), [], "fixture").join("\n");
    ok("!! SAME SCENARIOS names the seeds: a run of 3 scenarios against an expected list of 4 fails it", J(Y.checksOf(runs.slice(0, 6), { ...good, seeds: [9301, 9302, 9303, 9304] }).filter((c) => !c.ok).map((c) => c.name)) === J(["SAME SCENARIOS"]) && Y.checksOf(runs, { ...good, seeds: [9301, 9302, 9303, 9304] }).every((c) => c.ok));
    ok("!! HARMFUL is printed beside the verdict", /VERDICT: NOT SUPPORTED   HARMFUL/.test(Y.report(runsOf([...rep(6, ["reached", 150, "timeout", 0]), ...rep(20, ["reached", 150, "reached", 150])]), Y.checksOf(runsOf([...rep(6, ["reached", 150, "timeout", 0]), ...rep(20, ["reached", 150, "reached", 150])]), good), [], "fixture").join("\n")));
    ok("!! one failed check: NOT WEIGHED and no verdict", /VERDICT: NOT WEIGHED/.test(L) && !/R1 TIME/.test(L));
}

sec("3. THE BITE");
{
    const sc = R.streamScenario(504), d = Y.aimDiff(sc, Y.streamCurrent(sc)), d0 = Y.aimDiff(R.streamScenario(504, { speedScale: 0 }), () => [0, 0]);
    ok("!! aimDiff is an angle in degrees, 0 in still water", Number.isFinite(d) && d >= 0 && d <= 180 && d0 === 0, `seed 504 (in no set): ${d.toFixed(2)} deg`);
    const pa = Y.partAScenarios(), m = Y.meanCurrent(pa[0])(123, -45);
    ok("!! PART A's fields: DEV seeds 1 to 30 of hard-current then hard-current-gap (60), each planned in its MEAN current, the same everywhere", pa.length === 60 && pa[0].kind === "hard-current" && pa[59].kind === "hard-current-gap" && pa[0].seed === 1 && pa[29].seed === 30 && m[0] === pa[0].current.mean[0] && m[1] === pa[0].current.mean[1] && J(Y.meanCurrent(pa[0])(0, 0)) === J(m));
    ok("!! the bar is 15 percent: 4 of 30 is below it, 5 of 30 meets it", Y.BITE_BAR === 0.15 && 4 / 30 < Y.BITE_BAR && 5 / 30 >= Y.BITE_BAR);
}

sec("3b. THE FLIGHT HELPERS (stub flights, or hard-stream seed 501, in no set)");
{
    let calls = 0, same = 0;
    const via = (s, t, c) => { calls++; const a = Y.pilot(s, t, c); if (J(a) === J(AP.decide(s, t, c))) same++; return a; };
    const rr = Y.routeRuns([R.streamScenario(501)], { pilot: via });
    ok("!! routeRuns flies each scenario under each arm in R.ROUTE_ARMS order with o.pilot; pilot is AP.decide at every tick", J(rr.map((r) => [r.arm, r.seed, r.kind])) === J([["any+crab", 501, "hard-stream"], ["any+crab+route", 501, "hard-stream"]]) && calls > 0 && same === calls && J(Y.routeRuns([])) === J([]), `seed 501: ${calls} pilot calls`);
    const seen = [], fine = (sc, arm) => { seen.push([sc.seed, arm, R.streamAt(sc.stream, sc.start.x, sc.start.y).every((v) => v === 0)]); return { status: "reached", ticks: 100, path: 300, minClearance: 5 }; };
    ok("!! stillIsShared flies DEV seeds 1 to STILL_SEEDS (3) in still water under both arms; identical flights pass, one tick apart fails", Y.STILL_SEEDS === 3 && Y.stillIsShared(fine) === true && J(seen.map((x) => x[0])) === J([1, 1, 2, 2, 3, 3]) && seen.every((x) => x[2]) && J(seen.slice(0, 2).map((x) => x[1])) === J([R.ROUTE_REFERENCE, R.ROUTE_DESIGNATED]) && Y.stillIsShared((sc, arm) => ({ ...fine(sc, arm), ticks: arm === R.ROUTE_DESIGNATED ? 101 : 100 })) === false);
    const keys = CURRENT_KINDS.flatMap((k) => P.PLUS_SETS.held73.slice(0, Y.REPRO_SEEDS).map((s) => [k, s])), g = (sc) => ({ status: "reached", ticks: sc.seed, path: 7 });
    const stored = keys.map(([kind, seed]) => ({ arm: "any+crab", kind, seed, status: "reached", ticks: seed, path: 7 }));
    let n = 0; const counted = (sc) => { n++; return g(sc); };
    ok("!! oldFlightsStand (stub flights) checks REPRO_SEEDS (5) seeds of each kind against the stored any+crab rows: all match passes, one ticks off or one missing fails", Y.REPRO_SEEDS === 5 && Y.oldFlightsStand(stored, counted) === true && n === 2 * Y.REPRO_SEEDS && Y.oldFlightsStand(stored.map((r, i) => (i === 3 ? { ...r, ticks: r.ticks + 1 } : r)), g) === false && Y.oldFlightsStand(stored.slice(1), g) === false && Y.oldFlightsStand(stored.map((r) => ({ ...r, arm: "any" })), g) === false);
    const st73 = fs.readFileSync(new URL("../../" + Y.STORED_73, import.meta.url), "utf8").trim().split("\n").map((l) => JSON.parse(l)), have = new Set(st73.filter((r) => r.arm === "any+crab").map((r) => `${r.kind}|${r.seed}`));
    ok("!! STORED_73 is brain/subNavPlusCrabHeld73.jsonl and holds an any+crab row for every key oldFlightsStand reads; OUT_FILE is brain/subNavRouteHeld86.jsonl, the path --write uses", Y.STORED_73 === "brain/subNavPlusCrabHeld73.jsonl" && keys.every(([k, s]) => have.has(`${k}|${s}`)) && Y.OUT_FILE === "brain/subNavRouteHeld86.jsonl" && Y.checksOf([], { still: true, old: true, bite: null })[2].text.includes(Y.STORED_73));
    const tj = Y.judge(runsOf([["reached", 150, "reached", 150 * (1 + 5e-10)], ["reached", 150, "reached", 150 * (1 - 5e-10)], ["reached", 150, "reached", 150 * (1 + 3e-9)]]));
    ok("!! TIE is 1e-9: ratios within it of 1 are neither faster nor slower; 1 + 3e-9 is slower", Y.TIE === 1e-9 && tj.faster === 0 && tj.slower === 1 && tj.n === 3);
}

sec("4. THE COMMAND");
{
    const run = (argv, fl = {}) => { const out = [], err = [], files = []; let flown = 0; const code = Y.command(argv, { out: (m) => out.push(m), err: (m) => err.push(m), writeFile: (f, t) => files.push([f, t]), exitIo: { err: (m) => err.push(m), exit: (c) => { throw new Error("exit " + c); } }, exists: fl.exists || (() => false), flights: { bite: () => ({ n: 30, moved: 9, share: 0.3, met: true }), runs: (scs) => { flown += scs.length; return runsOf(scs.map(() => ["reached", 150, "reached", 140])); }, still: () => true, old: () => true, ...fl } }); return { code, out: out.join("\n"), err: err.join("\n"), files, flown }; };
    const thrown = (f) => { try { f(); return ""; } catch (e) { return String(e.message); } };
    ok("!! refused: an unknown set, --part b, --write on DEV, --seeds on HELD86; an unknown option exits 2 before anything runs", run(["--set", "held9"]).code === 2 && run(["--part", "b"]).code === 2 && run(["--write"]).code === 2 && run(["--set", "held86", "--seeds", "3"]).code === 2 && /exit 2/.test(thrown(() => run(["--sets", "dev"]))));
    const nf = run(["--set", "held86", "--write"], { bite: () => ({ n: 30, moved: 3, share: 0.1, met: false }) });
    ok("!! check 4 failing on DEV: HELD86 is NOT flown and nothing is written", nf.code === 0 && nf.flown === 0 && nf.files.length === 0 && /VERDICT: NOT FLOWN: THE STREAM DOES NOT MOVE THE PLAN/.test(nf.out));
    const w = run(["--set", "held86", "--write"]);
    ok("!! HELD86: 200 scenarios flown, the verdict printed, every flight written to brain/subNavRouteHeld86.jsonl", w.flown === 200 && /VERDICT: SUPPORTED/.test(w.out) && w.files.length === 1 && w.files[0][0].replace(/\\/g, "/").endsWith("brain/subNavRouteHeld86.jsonl") && w.files[0][1].trim().split("\n").length === 400);
    ok("!! HELD86 is flown ONCE: refused without --write, and refused when brain/subNavRouteHeld86.jsonl already exists, before anything is measured or flown", run(["--set", "held86"]).code === 2 && run(["--set", "held86"]).flown === 0 && (() => { const x = run(["--set", "held86", "--write"], { exists: () => true }); return x.code === 2 && x.flown === 0 && /already flown/.test(x.err); })());
    const ck = run(["--set", "held86", "--write"], { still: () => false });
    ok("!! check 2 (or 3) failing is found BEFORE any HELD86 flight: nothing flown, nothing written, NOT WEIGHED", ck.flown === 0 && ck.files.length === 0 && /FAIL STILL WATER IS THE SHARED PLAN/.test(ck.out) && /VERDICT: NOT WEIGHED/.test(ck.out) && run(["--set", "held86", "--write"], { old: () => false }).flown === 0);
    let bitten = []; const rb = run(["--set", "held86", "--write"], { bite: (scs) => { bitten.push(scs.length); return { n: scs.length, moved: scs.length === 200 ? 17 : 9, share: scs.length === 200 ? 0.085 : 0.3, met: true }; } });
    ok("!! the held set's own start-heading share is reported (field only), beside DEV's check 4; each written flight carries its stream and the along flag", J(bitten) === J([30, 200]) && /reported \(moves nothing\): 17 of 200 of these scenarios/.test(rb.out) && (() => { const l = JSON.parse(rb.files[0][1].split("\n")[0]); return l.stream && typeof l.along === "boolean" && l.set === "held86"; })());
    ok("  --part a refuses --set, --seeds and --write", run(["--part", "a", "--set", "dev"]).code === 2 && run(["--part", "a", "--seeds", "3"]).code === 2 && run(["--part", "a", "--write"]).code === 2);
    const a = run(["--part", "a"], { bite: () => ({ n: 60, moved: 0, share: 0, met: false }), runs: () => { throw new Error("PART A must not fly"); } });
    ok("!! PART A prints its record and its reading and flies nothing", a.code === 0 && a.flown === 0 && /PART A \(a record, not a test\): 0 of 60/.test(a.out) && /DOES NOT MOVE THE PLAN: the uniform-current route arm is NOT FLOWN/.test(a.out));
}

sec("5. THE SOURCE");
{
    const code = ["../../brain/subNavRoute.mjs", "../../brain/flowfieldDirectional.mjs", "./subNavRouteStudy.mjs"].map((p) => fs.readFileSync(new URL(p, import.meta.url), "utf8").split("\n").filter((l) => !l.trim().startsWith("//")).join("\n")).join("\n");
    ok("!! no clock and no Math.random; the registered numbers (5 degrees, 15 percent, 0.95 and 0.05, 0.98, gain 5 at 0.10, -5, along at 0.7, HELD86 = 9301 to 9500, V the cruise)", !/Math\.random|Date\.now|new Date|performance\.now/.test(code) && Y.AIM_DEG === 5 && Y.BITE_BAR === 0.15 && Y.FASTER_RATIO === 0.95 && Y.FASTER_P === 0.05 && Y.PARTLY_RATIO === 0.98 && Y.REACH_GAIN === 5 && Y.REACH_P === 0.10 && Y.HARMFUL === -5 && Y.ALONG === 0.7 && R.ROUTE_SETS.held86[0] === 9301 && R.ROUTE_SETS.held86.at(-1) === 9500 && R.V_PLAN === 3);
}

console.log(fails ? `\n${fails} FAIL` : "\nall checks pass");
process.exitCode = fails ? 1 : 0;
