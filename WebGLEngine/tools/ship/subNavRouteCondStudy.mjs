// WebGLEngine/tools/ship/subNavRouteCondStudy.mjs -- UNNUMBERED (the version is chosen at ship time; the registration is "ITEM 2, PART 3: WHEN THE PLAN CHANGES, IS IT FASTER?" of brain/NAV_PLUS_WIP.md;
// the gate is tools/ship/subNavRouteCondStudy-selfcheck.mjs)
//
//   node tools/ship/subNavRouteCondStudy.mjs --set dev3                 DEV (seeds 901 to 930): check 4 (the chain bites, field only), checks 2 and 3, the sanity flights (not a result)
//   node tools/ship/subNavRouteCondStudy.mjs --set held87 --write       the registered read: checks 2, 3 and 4 FIRST (a failure flies nothing), S fixed and printed, then HELD87 ONCE
// Part 2's kind, solver and arms (brain/subNavRoute.mjs) unchanged; only the reading is taken on S, the scenarios whose two t = 0 aim chains differ. --write puts every flight in
// brain/subNavRouteHeld87.jsonl. Pure apart from that file. No clock, no Math.random.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as N from "../../brain/subFieldNav.mjs";
import * as R from "../../brain/subNavRoute.mjs";
import { median, signP, cell, paired } from "./subNavPlusStudy.mjs";
import { routeRuns, oldFlightsStand, alongTrack, aimDiff, streamCurrent, pilot, STORED_73 } from "./subNavRouteStudy.mjs";
import { parseOrExit } from "./cliArgs.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url)), ENG = path.resolve(HERE, "..", "..");
export const OUT_FILE = "brain/subNavRouteHeld87.jsonl", BITE_BAR = 0.15, MIN_S = 20, FASTER_RATIO = 0.95, FASTER_P = 0.05, PARTLY_RATIO = 0.98, REACH_GAIN = 5, REACH_P = 0.10, HARMFUL = -5, TIE = 1e-9, STILL_SEEDS = 3, AIM_DEG = 5;

/** S of a list of scenarios: the set of seeds whose two t = 0 aim chains differ (field only). */
export const sOf = (scs, chains = R.planChains) => new Set(scs.filter((sc) => chains(sc).inS).map((sc) => sc.seed));
/** Check 2, flown: on DEV seeds 901 to 903 with the stream's speed 0, the two arms fly the same flight to the digit and neither chain differs. */
export function stillIsShared(fly = (sc, arm) => R.flyRoute(pilot, sc, arm), chains = R.planChains) {
    return R.ROUTE_SETS.dev3.slice(0, STILL_SEEDS).every((s) => { const sc = R.streamScenario(s, { speedScale: 0 }), a = fly(sc, R.ROUTE_REFERENCE), b = fly(sc, R.ROUTE_DESIGNATED); return !chains(sc).inS && a.status === b.status && a.ticks === b.ticks && a.path === b.path && a.minClearance === b.minClearance; });
}
const ratiosOf = (runs, keep = () => true) => {
    const ref = new Map(runs.filter((r) => r.arm === R.ROUTE_REFERENCE).map((r) => [r.seed, r]));
    return runs.filter((r) => r.arm === R.ROUTE_DESIGNATED && keep(r.seed)).map((r) => { const b = ref.get(r.seed); return b && r.reached && b.reached ? { seed: r.seed, r: r.t / b.t } : null; }).filter(Boolean);
};
const timeOf = (xs) => { const tie = (x) => Math.abs(x.r - 1) < TIE, f = xs.filter((x) => !tie(x) && x.r < 1).length, sl = xs.filter((x) => !tie(x) && x.r > 1).length, nt = xs.filter((x) => !tie(x));   // one tie test feeds every count (Amendment 1 of Part 3) return { n: xs.length, faster: f, slower: sl, ties: xs.length - nt.length, median: median(xs.map((x) => x.r)), medianNoTies: median(nt.map((x) => x.r)), p: signP(f, sl) }; };
/** The registered readings: R1 TIME on S; R2 REACH on all; the verdict; the reported items. */
export function judge(runs, S, scs = []) {
    const t = timeOf(ratiosOf(runs, (s) => S.has(s))), rest = timeOf(ratiosOf(runs, (s) => !S.has(s))), all = timeOf(ratiosOf(runs));
    const rt = runs.filter((r) => r.arm === R.ROUTE_DESIGNATED), ref = runs.filter((r) => r.arm === R.ROUTE_REFERENCE), pr = paired(rt, ref), cr = cell(rt), cf = cell(ref);
    const isFaster = t.median <= FASTER_RATIO && t.p <= FASTER_P, supported = isFaster && pr.gain >= 0 && cr.collided <= cf.collided;
    const partly = !supported && (isFaster || (t.median <= PARTLY_RATIO && t.p <= FASTER_P) || (pr.gain >= REACH_GAIN && pr.p <= REACH_P));
    const along = new Set(scs.filter(alongTrack).map((sc) => sc.seed));
    return { t, rest, all, pr, cr, cf, isFaster, supported, partly, harmful: pr.gain <= HARMFUL, verdict: supported ? "SUPPORTED" : partly ? "PARTLY SUPPORTED" : "NOT SUPPORTED",
        alongS: timeOf(ratiosOf(runs, (s) => S.has(s) && along.has(s))), acrossS: timeOf(ratiosOf(runs, (s) => S.has(s) && !along.has(s))) };
}
export function checksOf(runs, { still, old, bite, S, seeds = null, dev = false }) {
    const a = runs.filter((r) => r.arm === R.ROUTE_REFERENCE), b = runs.filter((r) => r.arm === R.ROUTE_DESIGNATED);
    const same = a.length > 0 && a.length === b.length && a.every((r, i) => r.seed === b[i].seed && r.kind === R.STREAM_KIND && b[i].kind === R.STREAM_KIND) && (!seeds || (a.length === seeds.length && a.every((r, i) => r.seed === seeds[i])));
    const nS = runs.length ? ratiosOf(runs, (s) => S.has(s)).length : 0;
    return [{ name: "SAME SCENARIOS", ok: same, text: `both arms fly the same ${a.length} scenarios, the expected seeds, in order: ${same}` },
        { name: "STILL WATER IS THE SHARED PLAN", ok: still === true, text: `on DEV seeds ${R.ROUTE_SETS.dev3[0]} to ${R.ROUTE_SETS.dev3[STILL_SEEDS - 1]} with the stream's speed 0 the two arms fly the same flight to the digit and neither chain differs: ${still}` },
        { name: "THE OLD FLIGHTS STAND", ok: old === true, text: `with the new options off any+crab reproduces ${STORED_73}: ${old}` },
        { name: "THE CHAIN BITES", ok: !!bite && bite.met, text: bite ? `${bite.inS} of ${bite.n} DEV scenarios (${(100 * bite.share).toFixed(1)} percent) have aim chains that differ; the bar is ${100 * BITE_BAR} percent` : "not measured" },
        ...(dev ? [] : [{ name: "S IS LARGE ENOUGH", ok: nS >= MIN_S, text: `${nS} scenarios of S are reached by both arms; at least ${MIN_S} are needed` }])];   // check 5 is the held read's; DEV has no verdict
}
export function report(runs, checks, S, scs, title, extra = {}, { dev = false } = {}) {
    const L = [`ITEM 2 PART 3, WHEN THE PLAN CHANGES: ${title}`];
    for (const c of checks) L.push(`  ${c.ok ? "PASS" : "FAIL"} ${c.name}: ${c.text}`);
    if (!dev && checks.some((c) => !c.ok)) { L.push("A CHECK FAILED: the verdict is NOT WEIGHED.", "VERDICT: NOT WEIGHED"); return L; }
    L.push("arm              reached  collided  left  timeout  other  median t (s)");
    for (const a of R.ROUTE_ARMS) { const rs = runs.filter((r) => r.arm === a), c = cell(rs); L.push(`  ${a.padEnd(15)} ${String(c.reached).padStart(3)}/${c.n}  ${String(c.collided).padStart(6)}  ${String(c.left).padStart(4)}  ${String(c.timeout).padStart(6)}  ${String(c.other).padStart(4)}   ${median(rs.filter((r) => r.reached).map((r) => r.t)).toFixed(1).padStart(8)}`); }
    const j = judge(runs, S, scs), f4 = (v) => (Number.isFinite(v) ? v.toFixed(4) : "-");
    L.push(`R1 TIME ON S (${S.size} scenarios; ${j.t.n} both reached): the route faster on ${j.t.faster}, slower on ${j.t.slower}, ties ${j.t.ties}; median ratio ${f4(j.t.median)}; exact sign p ${j.t.p.toFixed(4)}: ${j.isFaster ? "FASTER" : "not FASTER"} (the bar: median at most ${FASTER_RATIO} and p at most ${FASTER_P})`);
    L.push(`R2 REACH (all ${runs.length / 2}): ${j.pr.aOnly} only the route, ${j.pr.bOnly} only the reference, both ${j.pr.both}, neither ${j.pr.neither}; gain ${j.pr.gain}, exact sign p ${j.pr.p.toFixed(4)}; collisions ${j.cr.collided} against ${j.cf.collided}`);
    L.push(`reported (moves nothing): the complement of S: ${j.rest.n} both reached, ties ${j.rest.ties}, non-tied ${j.rest.faster + j.rest.slower} (faster ${j.rest.faster}, slower ${j.rest.slower}), their median ${f4(j.rest.medianNoTies)}`);
    L.push(`reported (moves nothing): over all scenarios (Part 2's reading): faster ${j.all.faster}, slower ${j.all.slower}, ties ${j.all.ties}, median ${f4(j.all.median)}, p ${j.all.p.toFixed(4)}; on S with ties dropped, median ${f4(j.t.medianNoTies)}`);
    for (const [name, x] of [["along the track", j.alongS], ["across it", j.acrossS]]) L.push(`reported (moves nothing): S with the stream ${name}: ${x.n} both reached, faster ${x.faster} slower ${x.slower} (p ${x.p.toFixed(4)}), median ${f4(x.median)}`);
    if (extra.bite !== undefined) L.push(`reported (moves nothing): ${extra.bite} of ${scs.length} scenarios have t = 0 start headings more than ${AIM_DEG} degrees apart; ${extra.inBand} have the start or the waypoint inside the stream's band`);
    L.push(dev ? "DEV: a sanity run, not a result (no verdict is drawn on DEV)" : `VERDICT: ${j.verdict}${j.harmful ? "   HARMFUL" : ""}`);
    return L;
}

export function command(argv, io = {}) {
    const out = io.out || ((m) => console.log(m)), err = io.err || ((m) => console.error(m)), writeFile = io.writeFile || fs.writeFileSync;
    const cli = parseOrExit("subNavRouteCondStudy", { values: { "--set": "string" }, flags: ["--write"] }, argv, io.exitIo), set = cli.values["--set"] || "dev3";
    if (set !== "dev3" && set !== "held87") { err(`subNavRouteCondStudy: --set needs dev3 or held87, got ${JSON.stringify(set)}`); return 2; }
    if (set === "dev3" && cli.flags.has("--write")) { err("subNavRouteCondStudy: --write goes with --set held87 only"); return 2; }
    if (set === "held87" && !cli.flags.has("--write")) { err("subNavRouteCondStudy: HELD87 is flown ONCE, so its flights are always written: add --write"); return 2; }
    if (set === "held87" && (io.exists || fs.existsSync)(path.join(ENG, OUT_FILE))) { err(`subNavRouteCondStudy: HELD87 was already flown (${OUT_FILE} exists); it is flown ONCE`); return 2; }
    const f = { s: sOf, runs: routeRuns, still: stillIsShared, old: () => oldFlightsStand(fs.readFileSync(path.join(ENG, STORED_73), "utf8").trim().split("\n").map((l) => JSON.parse(l))), extras: (scs) => ({ bite: scs.filter((sc) => aimDiff(sc, streamCurrent(sc)) > AIM_DEG).length, inBand: scs.filter((sc) => R.inBand(sc.stream, sc.start.x, sc.start.y) || R.inBand(sc.stream, sc.goal.x, sc.goal.y)).length }), ...(io.flights || {}) };
    const dev = R.streamSetOf("dev3"), devS = f.s(dev), bite = { n: dev.length, inS: devS.size, share: devS.size / dev.length, met: devS.size / dev.length >= BITE_BAR };
    out(`check 4 on DEV (field only, ${dev.length} hard-stream scenarios, seeds ${dev[0].seed} to ${dev.at(-1).seed}): ${bite.inS} in S, ${(100 * bite.share).toFixed(1)} percent against a bar of ${100 * BITE_BAR}`);
    const still = f.still(), old = f.old();
    if (set === "held87" && !(still && old && bite.met)) {   // every failed pre-flight check is named with its consequence; exit 3 (refused before flying)
        for (const c of checksOf([], { still, old, bite, S: new Set() }).filter((c) => !["SAME SCENARIOS", "S IS LARGE ENOUGH"].includes(c.name) && !c.ok)) out(`  FAIL ${c.name}: ${c.text}`);
        out("A CHECK FAILED before any HELD87 flight: HELD87 is NOT flown.");
        if (!(still && old)) out("VERDICT: NOT WEIGHED");
        if (!bite.met) out("VERDICT: NOT FLOWN: THE PLANS DO NOT DIFFER");
        return 3;
    }
    const scs = set === "dev3" ? dev : R.streamSetOf(set), S = set === "dev3" ? devS : f.s(scs);
    out(`S (fixed before any ${set.toUpperCase()} flight): ${S.size} of ${scs.length} scenarios: ${[...S].join(" ")}`);
    const runs = f.runs(scs);
    // the flights are written the moment they exist, before anything else can throw (a HELD87 read is never lost, and the file then refuses a second flight)
    if (cli.flags.has("--write")) { const byS = new Map(scs.map((sc) => [sc.seed, sc])); writeFile(path.join(ENG, OUT_FILE), runs.map((r) => JSON.stringify({ set, ...r, cMean: undefined, inS: S.has(r.seed), stream: byS.get(r.seed).stream, along: alongTrack(byS.get(r.seed)) })).join("\n") + "\n"); out(`wrote ${runs.length} flights to ${OUT_FILE}`); }
    const extra = f.extras(scs), dev = set === "dev3";
    for (const l of report(runs, checksOf(runs, { still, old, bite, S, seeds: dev ? R.ROUTE_SETS.dev3 : R.ROUTE_SETS.held87, dev }), S, scs, `${set.toUpperCase()}, ${scs.length} hard-stream scenarios${dev ? " (DEV: a sanity run, not a result)" : ", flown once"}`, extra, { dev })) out(l);
    return 0;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = command(process.argv.slice(2));
