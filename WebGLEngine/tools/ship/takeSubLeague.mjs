// WebGLEngine/tools/ship/takeSubLeague.mjs -- UNNUMBERED (the version is chosen at ship time; the registration is brain/SUB_LEAGUE_WIP.md part B, the gate tools/ship/takeSubLeague-selfcheck.mjs)
//   node tools/ship/takeSubLeague.mjs read [--smoke] [--write]
// THE READ OF THE REPLICATED LEAGUES. The runs themselves are tools/selfPlaySubTactics.mjs's, started by hand (six leagues, seeds 7100 to 7105, and six exploiters, seeds 7200 to 7205):
//   node tools/selfPlaySubTactics.mjs league --seed 7100 --gens 3 --iters 60 --from brain/subTacticsThetaSearchPingWip.json --out brain/subLeagueRuns/league7100.json
//   node tools/selfPlaySubTactics.mjs league --seed 7200 --gens 1 --iters 180 --from brain/subTacticsThetaSearchPingWip.json --out brain/subLeagueRuns/exploit7200.json
// This command reads those twelve files and the two leagues of the notes (brain/subTacticsLeagueWip.json), and for each run flies its final generation against generation 0 on the fresh geometries (96001 to 96024, both seats; --smoke is geometries 1 to 4), with the
// tournament's own statistics (subTournament.matchup). A run FINDS a counter-doctrine iff the edge is at least FIND_EDGE with z at least FIND_Z. Of the eight leagues the recipe is ROBUST iff at least ROBUST find one, FRAGILE iff at most FRAGILE do, else MIXED.
// Then the exploiters the same way, the final generations' cross-play (the 28 pairs of the eight leagues), and the direction of each final theta. --write records brain/subLeagueRead.json once (a second write is refused); the real set is flown only with --write.
"use strict";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import * as T from "../../brain/subTournament.mjs";
import * as TA from "../../brain/subTactics.mjs";

const ENG = fileURLToPath(new URL("../../", import.meta.url));
export const DIR = "brain/subLeagueRuns", OLD_FILE = "brain/subTacticsLeagueWip.json", PING_FILE = "brain/subTacticsThetaSearchPingWip.json", READ_FILE = "brain/subLeagueRead.json";
export const SETS = Object.freeze({ smoke: Object.freeze({ first: 1, count: 4 }), read: Object.freeze({ first: 96001, count: 24 }) });
export const LEAGUE_SEEDS = Object.freeze([7100, 7101, 7102, 7103, 7104, 7105]), EXPLOIT_SEEDS = Object.freeze([7200, 7201, 7202, 7203, 7204, 7205]), OLD_KEYS = Object.freeze(["league7000", "league7001"]);
export const FIND_EDGE = 0.5, FIND_Z = 2, ROBUST = 6, FRAGILE = 2;
export const DIRECTION = Object.freeze(["searchPing", "aimTol", "evadeTurn", "echoWindow", "searchSpeed", "trackSpeed", "fireRange"]);

/** Does a summary { edge, z } find a counter-doctrine: an edge of at least FIND_EDGE and z of at least FIND_Z? */
export const finds = (s) => s.edge >= FIND_EDGE && s.z >= FIND_Z;
/** The recipe's verdict from the number of leagues that find one (of `n`, 8 in the registration): ROBUST iff at least ROBUST, FRAGILE iff at most FRAGILE, else MIXED. */
export const verdictOf = (k) => (k >= ROBUST ? "ROBUST" : k <= FRAGILE ? "FRAGILE" : "MIXED");
export const median = (a) => { const s = [...a].sort((x, y) => x - y), m = s.length >> 1; return s.length === 0 ? NaN : s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

/**
 * The runs from files (`read(path)` returns the parsed JSON or null; default: the file system): [{ id, kind ("league" | "old" | "exploit"), seed, gen0, final, generations }], or { error } naming what is missing or malformed. A league has the default and generations 0 to 3 (5 thetas),
 * an exploiter the default, 0 and 1 (3); every theta must be what `clampTheta` leaves unchanged; generation 0 of every run must be the search-ping champion.
 */
export function loadRuns(read = (f) => (fs.existsSync(ENG + f) ? JSON.parse(fs.readFileSync(ENG + f, "utf8")) : null)) {
    const ping = read(PING_FILE); if (!ping || !ping.theta) return { error: `${PING_FILE} is missing` };
    const champ = TA.clampTheta(ping.theta), runs = [], missing = [], bad = [], old = read(OLD_FILE);
    const take = (id, kind, seed, o, want) => {
        if (!o || !Array.isArray(o.thetas)) { missing.push(id); return; }
        if (o.thetas.length !== want) { bad.push(`${id} has ${o.thetas.length} thetas, not ${want}`); return; }
        const th = o.thetas.map((t) => TA.clampTheta(t));
        if (o.thetas.some((t) => TA.THETA_NAMES.some((k) => !Number.isFinite(t[k]) || TA.clampTheta(t)[k] !== t[k]))) { bad.push(`${id} has a theta that is not finite or not inside its bounds`); return; }
        if (JSON.stringify(th[1]) !== JSON.stringify(champ)) { bad.push(`${id}: generation 0 is not the search-ping champion`); return; }
        runs.push({ id, kind, seed, gen0: th[1], final: th[th.length - 1], generations: th.length - 2 });
    };
    for (const k of OLD_KEYS) take(k, "old", Number(k.slice(6)), old && old[k], 5);
    for (const s of LEAGUE_SEEDS) take(`league${s}`, "league", s, read(`${DIR}/league${s}.json`), 5);
    for (const s of EXPLOIT_SEEDS) take(`exploit${s}`, "exploit", s, read(`${DIR}/exploit${s}.json`), 3);
    if (missing.length || bad.length) return { error: [...(missing.length ? [`missing: ${missing.join(", ")}`] : []), ...bad].join("; ") };
    return { runs };
}

/** The read over `set` ("read" or "smoke"): every run's final generation against generation 0, the verdict, the exploiters, the cross-play of the eight leagues' final generations. */
export function readLeagues(runs, set = "read") {
    const geos = T.geometries(SETS[set].count, SETS[set].first), side = (id, theta) => T.makeSide(id, { theta }), rows = [];
    for (const r of runs) { const m = T.matchup(side(r.id, r.final), side("gen0", r.gen0), geos), s = m.summary; rows.push({ id: r.id, kind: r.kind, edge: s.edge, se: s.se, z: s.z, finds: finds(s), winsX: s.winsX, draws: s.draws, winsY: s.winsY, direction: Object.fromEntries(DIRECTION.map((k) => [k, r.final[k] - r.gen0[k]])) }); }
    const leagues = rows.filter((r) => r.kind !== "exploit"), exploiters = rows.filter((r) => r.kind === "exploit"), k = leagues.filter((r) => r.finds).length;
    const finals = runs.filter((r) => r.kind !== "exploit"), cross = T.roundRobin(finals.map((r) => side(r.id, r.final)), geos, {}), cyc = T.transitivity(cross);
    const edges = []; for (const [key, p] of Object.entries(cross.pairs)) edges.push({ pair: key, edge: p.summary.edge, z: p.summary.z });
    const same = edges.filter((e) => Math.abs(e.edge) >= FIND_EDGE && Math.abs(e.z) >= FIND_Z);
    const self = T.matchup(side("a", finals[0].final), side("b", finals[0].final), geos).summary.edge;
    const checks = []; if (rows.some((r) => !Number.isFinite(r.edge) || !Number.isFinite(r.z))) checks.push("a score is non-finite"); if (self !== 0) checks.push(`a final generation against itself has an edge of ${self}, not exactly 0`); if (finals.length !== 8) checks.push(`${finals.length} leagues, not 8`); if (exploiters.length !== 6) checks.push(`${exploiters.length} exploiters, not 6`);
    return { set, rows, leagues: { n: leagues.length, finds: k, verdict: verdictOf(k), medianEdge: median(leagues.map((r) => r.edge)) }, exploiters: { n: exploiters.length, finds: exploiters.filter((r) => r.finds).length, medianEdge: median(exploiters.map((r) => r.edge)) }, cross: { edges, decisive: same.length, cycles: cyc }, checks };
}

const f2 = (v) => (v >= 0 ? "+" : "") + v.toFixed(3);
/** The command: argv (after the program), io { log, exists, write, read } (defaults: the console and the file system). Returns the exit code. */
export function command(argv, io = {}) {
    const log = io.log || ((s) => console.log(s)), exists = io.exists || ((f) => fs.existsSync(ENG + f)), write = io.write || ((f, s) => fs.writeFileSync(ENG + f, s));
    if (argv[0] !== "read") { log("usage: takeSubLeague.mjs read [--smoke] [--write]"); return 2; }
    for (const a of argv.slice(1)) if (a !== "--smoke" && a !== "--write") { log(`takeSubLeague: unknown argument ${a}`); return 2; }
    const smoke = argv.includes("--smoke"), wr = argv.includes("--write");
    if (smoke && wr) { log("takeSubLeague: --smoke is never recorded"); return 2; }
    if (!smoke && !wr && !io.set) { log("takeSubLeague: the read set is flown once and the read is recorded; run read with --write (or --smoke to see that it runs)"); return 2; }
    if (wr && exists(READ_FILE)) { log(`takeSubLeague: ${READ_FILE} exists; the read is flown once and a second read is refused`); return 2; }
    const L = loadRuns(io.read); if (L.error) { log("takeSubLeague: " + L.error); return 2; }
    const set = io.set || (smoke ? "smoke" : "read"), r = readLeagues(L.runs, set);
    log(`[takeSubLeague] the replicated leagues, final generation against generation 0 on geometries ${SETS[set].first} to ${SETS[set].first + SETS[set].count - 1} (both seats); a run FINDS a counter-doctrine at edge >= ${FIND_EDGE} and z >= ${FIND_Z}`);
    for (const x of r.rows) log(`  ${x.id.padEnd(12)} ${x.kind.padEnd(7)} edge ${f2(x.edge)} +- ${x.se.toFixed(3)} (z ${x.z.toFixed(1)}), ${x.winsX}-${x.draws}-${x.winsY}  ${x.finds ? "FINDS" : "does not"}    final minus gen0: ${DIRECTION.map((k) => `${k} ${x.direction[k] >= 0 ? "+" : ""}${x.direction[k].toFixed(2)}`).join(", ")}`);
    log(`  LEAGUES: ${r.leagues.finds} of ${r.leagues.n} find one (median edge ${f2(r.leagues.medianEdge)})  ->  the recipe is ${r.leagues.verdict} (at least ${ROBUST} of 8 is ROBUST, at most ${FRAGILE} FRAGILE)`);
    log(`  EXPLOITERS: ${r.exploiters.finds} of ${r.exploiters.n} find one (median edge ${f2(r.exploiters.medianEdge)}; the leagues' median ${f2(r.leagues.medianEdge)})`);
    log(`  CROSS-PLAY of the eight final generations: ${r.cross.decisive} of ${r.cross.edges.length} pairs decided by at least ${FIND_EDGE} at z ${FIND_Z}; ${r.cross.cycles.length ? "cycles: " + r.cross.cycles.join("; ") : "no cycle"}`);
    if (r.checks.length) log("  CHECKS FAILED, NOT WEIGHED: " + r.checks.join("; "));
    if (wr) { write(READ_FILE, JSON.stringify(r, null, 1) + "\n"); log(`  written ${READ_FILE}`); }
    return r.checks.length ? 1 : 0;
}

if (typeof process !== "undefined" && Array.isArray(process.argv)) {
    const { pathToFileURL } = await import("node:url");
    if (import.meta.url === pathToFileURL(process.argv[1] || "").href) process.exit(command(process.argv.slice(2)));
}
