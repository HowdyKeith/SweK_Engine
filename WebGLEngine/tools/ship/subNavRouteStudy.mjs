// WebGLEngine/tools/ship/subNavRouteStudy.mjs -- UNNUMBERED (the version is chosen at ship time; the registration is "ITEM 2, PART 2: THE CURRENT IN THE COST" of brain/NAV_PLUS_WIP.md; the gate is
// tools/ship/subNavRouteStudy-selfcheck.mjs)
//
//   node tools/ship/subNavRouteStudy.mjs --part a                      PART A, the uniform current RECORDED (no flight): the share of DEV fields whose start aim moves by more than 5 degrees
//   node tools/ship/subNavRouteStudy.mjs --set dev [--seeds N]         PART B on DEV: check 4 (the route bites, field only), checks 2 and 3, and the sanity flights (not a result)
//   node tools/ship/subNavRouteStudy.mjs --set held86 [--write]        PART B's registered read: check 4 on DEV FIRST (below its bar, nothing is flown), then HELD86 ONCE
// --write puts every HELD86 flight in brain/subNavRouteHeld86.jsonl. Pure apart from that file. No clock, no Math.random.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as N from "../../brain/subFieldNav.mjs";
import * as H from "../../brain/subHardNav.mjs";
import * as P from "../../brain/subNavPlus.mjs";
import * as R from "../../brain/subNavRoute.mjs";
import * as AP from "../../brain/autopilotSub.mjs";
import { median, signP, cell, paired, CURRENT_KINDS } from "./subNavPlusStudy.mjs";
import { parseOrExit } from "./cliArgs.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url)), ENG = path.resolve(HERE, "..", "..");
export const OUT_FILE = "brain/subNavRouteHeld86.jsonl", STORED_73 = "brain/subNavPlusCrabHeld73.jsonl";
export const AIM_DEG = 5, BITE_BAR = 0.15, FASTER_RATIO = 0.95, FASTER_P = 0.05, PARTLY_RATIO = 0.98, REACH_GAIN = 5, REACH_P = 0.10, HARMFUL = -5, TIE = 1e-9, ALONG = 0.7, REPRO_SEEDS = 5, STILL_SEEDS = 3;
export const pilot = (s, t, c) => AP.decide(s, t, c);

/** The heading the arm's t = 0 plan gives at the start: the aim point's, else the cell flow's, else null. */
const startHeading = (field, aim, st) => N.aimHeading(field, aim, st.x, st.y) ?? N.fieldHeading(field, st.x, st.y, "cell");
/** The two t = 0 plans of a scenario (the shared one and the directional one in `currentAt`) and the angle (degrees) between their start headings: Infinity when exactly one is null, 0 when both are. */
export function aimDiff(sc, currentAt) {
    const shapes = H.planShapes(sc, 0), f0 = H.buildLadderField(shapes, sc.goal, sc.start), f1 = R.buildRouteLadder(shapes, sc.goal, sc.start, { currentAt, V: R.V_PLAN });
    const h0 = startHeading(f0, N.aimOf(f0, sc.goal), sc.start), h1 = startHeading(f1, R.timedAimOf(f1, sc.goal), sc.start);
    if (h0 === null || h1 === null) return h0 === h1 ? 0 : Infinity;
    return Math.abs(Math.atan2(Math.sin(h1 - h0), Math.cos(h1 - h0))) * 180 / Math.PI;
}
/** The bite of a list of scenarios: { n, moved (start headings more than AIM_DEG apart), share, met (share >= BITE_BAR) }. `currentOf(sc)` is the plan's current map. */
export function biteOf(scs, currentOf) {
    const moved = scs.filter((sc) => aimDiff(sc, currentOf(sc)) > AIM_DEG).length;
    return { n: scs.length, moved, share: moved / scs.length, met: moved / scs.length >= BITE_BAR };
}
/** PART A's fields: DEV seeds 1 to 30 of the two uniform-current kinds, each in its MEAN current. */
export const partAScenarios = () => CURRENT_KINDS.flatMap((k) => N.range(1, 30).map((s) => P.plusScenario(s, k)));
export const meanCurrent = (sc) => { const m = [sc.current.mean[0], sc.current.mean[1]]; return () => m; };
export const streamCurrent = (sc) => (x, y) => R.streamAt(sc.stream, x, y);

/** The flights: each scenario under each arm, scenario-major. */
export function routeRuns(scs, o = {}) { return scs.flatMap((sc) => R.ROUTE_ARMS.map((arm) => R.flyRoute(o.pilot || pilot, sc, arm))); }
/** Check 2, flown: on DEV seeds 1 to STILL_SEEDS with the stream's speed 0, both arms fly the same flight to the digit. */
export function stillIsShared(fly = (sc, arm) => R.flyRoute(pilot, sc, arm)) {
    return N.range(1, STILL_SEEDS).every((s) => { const sc = R.streamScenario(s, { speedScale: 0 }), a = fly(sc, R.ROUTE_REFERENCE), b = fly(sc, R.ROUTE_DESIGNATED); return a.status === b.status && a.ticks === b.ticks && a.path === b.path && a.minClearance === b.minClearance; });
}
/** Check 3, flown: with the new options off, any+crab reproduces the stored HELD73 flights on its first REPRO_SEEDS seeds of each kind. */
export function oldFlightsStand(stored, fly = (sc) => P.flyPlus(pilot, sc, "any+crab")) {
    const want = new Map(stored.filter((r) => r.arm === "any+crab").map((r) => [`${r.kind}|${r.seed}`, r]));
    return CURRENT_KINDS.every((k) => P.PLUS_SETS.held73.slice(0, REPRO_SEEDS).every((s) => { const w = want.get(`${k}|${s}`), g = fly(P.plusScenario(s, k)); return !!w && w.status === g.status && w.ticks === g.ticks && w.path === g.path; }));
}
export function checksOf(runs, { still, old, bite, seeds = null }) {
    const a = runs.filter((r) => r.arm === R.ROUTE_REFERENCE), b = runs.filter((r) => r.arm === R.ROUTE_DESIGNATED);
    const same = a.length > 0 && a.length === b.length && a.every((r, i) => r.seed === b[i].seed && r.kind === b[i].kind && r.kind === R.STREAM_KIND) && (!seeds || (a.length === seeds.length && a.every((r, i) => r.seed === seeds[i])));
    return [{ name: "SAME SCENARIOS", ok: same, text: `both arms fly the same ${a.length} scenarios in the same order: ${same}` },
        { name: "STILL WATER IS THE SHARED PLAN", ok: still === true, text: `on DEV seeds 1 to ${STILL_SEEDS} with the stream's speed 0 the two arms fly the same flight to the digit: ${still}` },
        { name: "THE OLD FLIGHTS STAND", ok: old === true, text: `with the new options off any+crab reproduces ${STORED_73} on HELD73's first ${REPRO_SEEDS} seeds of each kind: ${old}` },
        { name: "THE ROUTE BITES", ok: !!bite && bite.met, text: bite ? `${bite.moved} of ${bite.n} DEV scenarios (${(100 * bite.share).toFixed(1)} percent) have t = 0 start headings more than ${AIM_DEG} degrees apart; the bar is ${100 * BITE_BAR} percent` : "not measured" }];
}
/** The track bearing of a scenario and whether its stream lies along it (|cos(theta - bearing)| >= ALONG). */
export const alongTrack = (sc) => Math.abs(Math.cos(sc.stream.theta - Math.atan2(sc.goal.y - sc.start.y, sc.goal.x - sc.start.x))) >= ALONG;
/** The registered readings. `scs` gives each scenario's stream for the split (reported). */
export function judge(runs, scs = []) {
    const ref = runs.filter((r) => r.arm === R.ROUTE_REFERENCE), rt = runs.filter((r) => r.arm === R.ROUTE_DESIGNATED), bm = new Map(ref.map((r) => [`${r.kind}|${r.seed}`, r]));
    const ratios = rt.map((r) => { const b = bm.get(`${r.kind}|${r.seed}`); return b && r.reached && b.reached ? { seed: r.seed, r: r.t / b.t } : null; }).filter(Boolean);
    const faster = ratios.filter((x) => x.r < 1 - TIE).length, slower = ratios.filter((x) => x.r > 1 + TIE).length, med = median(ratios.map((x) => x.r)), pT = signP(faster, slower);
    const pr = paired(rt, ref), cr = cell(rt), cf = cell(ref);
    const isFaster = med <= FASTER_RATIO && pT <= FASTER_P, safe = pr.gain >= 0 && cr.collided <= cf.collided;
    const supported = isFaster && safe, partly = !supported && (isFaster || (med <= PARTLY_RATIO && pT <= FASTER_P) || (pr.gain >= REACH_GAIN && pr.p <= REACH_P));
    const along = new Set(scs.filter(alongTrack).map((sc) => sc.seed)), split = (inSet) => {
        const xs = ratios.filter((x) => along.has(x.seed) === inSet), f = xs.filter((x) => x.r < 1 - TIE).length, sl = xs.filter((x) => x.r > 1 + TIE).length, sub = (rs) => rs.filter((r) => along.has(r.seed) === inSet), q = paired(sub(rt), sub(ref));
        return { n: xs.length, median: median(xs.map((x) => x.r)), faster: f, slower: sl, pT: signP(f, sl), gain: q.gain, pR: q.p, collided: [cell(sub(rt)).collided, cell(sub(ref)).collided] };
    };
    return { n: ratios.length, faster, slower, median: med, pT, isFaster, pr, cr, cf, supported, partly, harmful: pr.gain <= HARMFUL, verdict: supported ? "SUPPORTED" : partly ? "PARTLY SUPPORTED" : "NOT SUPPORTED",
        medT: { route: median(rt.filter((r) => r.reached).map((r) => r.t)), ref: median(ref.filter((r) => r.reached).map((r) => r.t)) }, along: split(true), across: split(false) };
}
export function report(runs, checks, scs, title, flownBite = null) {
    const L = [`ITEM 2 PART 2, THE CURRENT IN THE COST: ${title}`];
    for (const c of checks) L.push(`  ${c.ok ? "PASS" : "FAIL"} ${c.name}: ${c.text}`);
    if (checks.some((c) => !c.ok)) { L.push("A CHECK FAILED: the verdict is NOT WEIGHED.", "VERDICT: NOT WEIGHED"); return L; }
    L.push("arm              reached  collided  left  timeout  other  median t (s)  median path/chord");
    for (const a of R.ROUTE_ARMS) { const rs = runs.filter((r) => r.arm === a), c = cell(rs); L.push(`  ${a.padEnd(15)} ${String(c.reached).padStart(3)}/${c.n}  ${String(c.collided).padStart(6)}  ${String(c.left).padStart(4)}  ${String(c.timeout).padStart(6)}  ${String(c.other).padStart(4)}   ${median(rs.filter((r) => r.reached).map((r) => r.t)).toFixed(1).padStart(8)}      ${c.medianChord.toFixed(3)}`); }
    const j = judge(runs, scs);
    L.push(`R1 TIME (both reached, ${j.n}): the route faster on ${j.faster}, slower on ${j.slower}; median ratio ${j.median.toFixed(4)}; exact sign p ${j.pT.toFixed(4)}: ${j.isFaster ? "FASTER" : "not FASTER"} (the bar: median at most ${FASTER_RATIO} and p at most ${FASTER_P})`);
    L.push(`R2 REACH: ${j.pr.aOnly} only the route, ${j.pr.bOnly} only the reference, both ${j.pr.both}, neither ${j.pr.neither}; gain ${j.pr.gain}, exact sign p ${j.pr.p.toFixed(4)}; collisions ${j.cr.collided} against ${j.cf.collided}${j.harmful ? "   HARMFUL" : ""}`);
    for (const [name, x] of [["along the track", j.along], ["across it", j.across]]) L.push(`reported (moves nothing): the stream ${name}: ${x.n} both reached, median ratio ${x.median.toFixed(4)}, faster ${x.faster} slower ${x.slower} (p ${x.pT.toFixed(4)}); reach gain ${x.gain} (p ${x.pR.toFixed(4)}); collisions ${x.collided[0]} against ${x.collided[1]}`);
    if (flownBite) L.push(`reported (moves nothing): ${flownBite.moved} of ${flownBite.n} of these scenarios (${(100 * flownBite.share).toFixed(1)} percent) have t = 0 start headings more than ${AIM_DEG} degrees apart`);
    L.push(`VERDICT: ${j.verdict}${j.harmful ? "   HARMFUL" : ""}`);
    return L;
}

export function command(argv, io = {}) {
    const out = io.out || ((m) => console.log(m)), err = io.err || ((m) => console.error(m)), writeFile = io.writeFile || fs.writeFileSync;
    const spec = { values: { "--part": "string", "--set": "string", "--seeds": "number" }, flags: ["--write"] };
    const cli = parseOrExit("subNavRouteStudy", spec, argv, io.exitIo), part = cli.values["--part"], set = cli.values["--set"] || "dev", seeds = cli.values["--seeds"];
    if (part !== undefined && part !== "a") { err("subNavRouteStudy: --part takes a (PART B is --set dev or --set held86)"); return 2; }
    if (part !== undefined && (cli.values["--set"] !== undefined || seeds !== undefined || cli.flags.has("--write"))) { err("subNavRouteStudy: --part a takes no --set, --seeds or --write (it flies nothing and writes nothing)"); return 2; }
    if (part === undefined && !R.ROUTE_SETS[set]) { err(`subNavRouteStudy: --set needs dev or held86, got ${JSON.stringify(set)}`); return 2; }
    if (cli.flags.has("--write") && set !== "held86") { err("subNavRouteStudy: --write goes with --set held86 only"); return 2; }
    if (seeds && set === "held86") { err("subNavRouteStudy: HELD86 is flown whole; --seeds is for DEV"); return 2; }
    if (set === "held86" && !cli.flags.has("--write")) { err("subNavRouteStudy: HELD86 is flown ONCE, so its flights are always written: add --write"); return 2; }
    if (set === "held86" && (io.exists || fs.existsSync)(path.join(ENG, OUT_FILE))) { err(`subNavRouteStudy: HELD86 was already flown (${OUT_FILE} exists); it is flown ONCE`); return 2; }
    const f = { bite: biteOf, runs: routeRuns, still: stillIsShared, old: () => oldFlightsStand(fs.readFileSync(path.join(ENG, STORED_73), "utf8").trim().split("\n").map((l) => JSON.parse(l))), ...(io.flights || {}) };
    if (part === "a") {
        const b = f.bite(partAScenarios(), meanCurrent);
        out(`PART A (a record, not a test): ${b.moved} of ${b.n} DEV fields of hard-current and hard-current-gap (each in its mean current) have t = 0 start headings more than ${AIM_DEG} degrees apart: ${(100 * b.share).toFixed(1)} percent; the bar is ${100 * BITE_BAR} percent`);
        out(`PART A: ${b.met ? "THE UNIFORM CURRENT MOVES THE PLAN: a uniform-current route arm would be worth registering" : "THE UNIFORM CURRENT DOES NOT MOVE THE PLAN: the uniform-current route arm is NOT FLOWN"}`);
        return 0;
    }
    const dev = R.streamSetOf("dev"), bite = f.bite(dev, streamCurrent);
    out(`check 4 on DEV (field only, ${dev.length} hard-stream scenarios): ${bite.moved} moved, ${(100 * bite.share).toFixed(1)} percent against a bar of ${100 * BITE_BAR}`);
    if (set === "held86" && !bite.met) { out("THE ROUTE DOES NOT BITE on DEV: HELD86 is NOT flown."); out("VERDICT: NOT FLOWN: THE STREAM DOES NOT MOVE THE PLAN"); return 0; }
    // checks 2 and 3 do not read the flights: they are flown FIRST, and a failure on HELD86 flies nothing (Amendment 1)
    const still = f.still(), old = f.old();
    if (set === "held86" && !(still && old)) { for (const c of checksOf([], { still, old, bite }).filter((c) => c.name !== "SAME SCENARIOS" && !c.ok)) out(`  FAIL ${c.name}: ${c.text}`); out("A CHECK FAILED before any HELD86 flight: HELD86 is NOT flown."); out("VERDICT: NOT WEIGHED"); return 0; }
    const scs = set === "dev" ? (seeds ? dev.slice(0, seeds) : dev) : R.streamSetOf(set), flownBite = set === "dev" && !seeds ? bite : f.bite(scs, streamCurrent), runs = f.runs(scs);
    for (const l of report(runs, checksOf(runs, { still, old, bite, seeds: scs.map((sc) => sc.seed) }), scs, `${set.toUpperCase()}, ${scs.length} hard-stream scenarios${set === "dev" ? " (DEV: a sanity run, not a result)" : ", flown once"}`, flownBite)) out(l);
    if (cli.flags.has("--write")) { const byS = new Map(scs.map((sc) => [sc.seed, sc])); writeFile(path.join(ENG, OUT_FILE), runs.map((r) => JSON.stringify({ set, ...r, cMean: undefined, stream: byS.get(r.seed).stream, along: alongTrack(byS.get(r.seed)) })).join("\n") + "\n"); out(`wrote ${runs.length} flights to ${OUT_FILE}`); }
    return 0;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = command(process.argv.slice(2));
