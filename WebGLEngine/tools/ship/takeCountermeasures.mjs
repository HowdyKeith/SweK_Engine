// WebGLEngine/tools/ship/takeCountermeasures.mjs -- UNNUMBERED (the library is brain/subCountermeasures.mjs, the registration brain/SUB_COUNTERMEASURES_WIP.md, the gate brain/subCountermeasures-selfcheck.mjs)
//   node tools/ship/takeCountermeasures.mjs [--arena duel|ogre|both] [--set dev|held75] [--seeds N] [--write]
// ARENA A (duel): the default tactician with a kit (decoy, screen, interceptor, all three) against the same tactician without, each geometry flown from both seats; prints the tournament's edge and z and the reading (BEATS iff the edge is at least 0.05 and z >= 2, IS BELOW iff the edge is at most -0.05 and
// z <= -2, else TIES), the boats each side lost, and what the countermeasures did. Then the sensitivity (the release thresholds moved to 18 and to 28 dB; printed, not weighed). ARENA B (the Sea OGRE): three defenders with GUNNER_THETA with and without all three, the fight's own
// score paired by scenario (BETTER iff above 2 se). The checks come first: a failure and the readings are NOT WEIGHED. --set dev is a sanity run (duel geometries 1 to 4, OGRE scenarios 1 to 4); --set held75 is the registered read, flown ONCE (duel geometries 901 to 924 -- Amendment A moved them from
// 801 to 824 -- and OGRE scenarios 101 to 112); --write (held75 only, the whole set) writes every fight to brain/subCountermeasuresHeld75.jsonl. --seeds N takes the first N of each set (with --write it is refused).
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as D from "../../brain/subDuel.mjs";
import * as G from "../../brain/seaOgre.mjs";
import * as T from "../../brain/subTournament.mjs";
import * as TA from "../../brain/subTactics.mjs";
import * as AS from "../../brain/autopilotSub.mjs";
import * as C from "../../brain/subCountermeasures.mjs";
import * as B from "../../brain/switchboard.mjs";

const ENG = fileURLToPath(new URL("../../", import.meta.url));
export const OUT_FILE = "brain/subCountermeasuresHeld75.jsonl";
export const SETS = Object.freeze({ dev: Object.freeze({ duel: Object.freeze({ first: 1, count: 4 }), ogre: Object.freeze({ first: 1, count: 4 }) }), held75: Object.freeze({ duel: Object.freeze({ first: 901, count: 24 }), ogre: Object.freeze({ first: 101, count: 12 }) }) });
export const KITS = Object.freeze({ decoy: Object.freeze({ decoy: true }), screen: Object.freeze({ screen: true }), interceptor: Object.freeze({ interceptor: true }), all: Object.freeze({ decoy: true, screen: true, interceptor: true }) });
export const SENSITIVITY = Object.freeze([18, 28]);
export const Z_BAR = 2, EDGE_BAR = T.DECISIVE;   // a lead needs 2 paired standard errors AND the edge of a won fight (0.05: one net hit; the tournament's own DECISIVE) -- Amendment B

/** A duel side of the default tactician with the kit `enabled` (null: none): { id, side: () => { tactics, pilot, cm } } -- the form brain/subTournament.mjs flies. `thr` moves the three release thresholds together (the sensitivity). */
export function sideOf(id, enabled = null, thr = null) {
    const th = thr === null ? C.CM.tactician : { ...C.CM.tactician, decoySnr: thr, screenSnr: thr, interceptSnr: thr + 2 };
    return { id, side: () => ({ tactics: enabled ? C.withCountermeasures(TA.makeTactician(TA.THETA_DEFAULT), th, enabled) : TA.makeTactician(TA.THETA_DEFAULT), pilot: AS.pilot(), cm: enabled ? C.kitOf(enabled) : null }) };
}
/** The reading of an edge and its z: BEATS iff the edge is at least EDGE_BAR and z at least Z_BAR, IS BELOW iff the edge is at most -EDGE_BAR and z at most -Z_BAR, else TIES. */
export const readingOf = (s) => (s.edge >= EDGE_BAR && s.z >= Z_BAR ? "BEATS" : s.edge <= -EDGE_BAR && s.z <= -Z_BAR ? "IS BELOW" : "TIES");

/** X (with a kit) against Y (without) over geometries: both seats each. Returns { fights, summary, stats (the countermeasures X's duels counted, summed over the duels where X carried them), xSunk, ySunk }. */
export function duelMatchup(x, y, geos) {
    const fights = [], stats = { decoysReleased: 0, screensReleased: 0, interceptorsLaunched: 0, decoyed: 0, intercepted: 0 };
    for (const sc of geos) {
        const a = D.duel(x.side(), sc, { opponent: y.side() }), b = D.duel(y.side(), sc, { opponent: x.side() });
        for (const r of [a, b]) if (r.cm) for (const k of Object.keys(stats)) stats[k] += r.cm[k] || 0;
        fights.push({ seed: sc.seed, seat: "A", sx: a.score, sy: D.scoreFor(a, "B"), statusX: a.fates[0], statusY: a.fates[1], xKilledY: a.fates[1] === "sunk", yKilledX: a.fates[0] === "sunk", ticks: a.ticks });
        fights.push({ seed: sc.seed, seat: "B", sx: D.scoreFor(b, "B"), sy: b.score, statusX: b.fates[1], statusY: b.fates[0], xKilledY: b.fates[0] === "sunk", yKilledX: b.fates[1] === "sunk", ticks: b.ticks });
    }
    return { fights, summary: T.summary(fights), stats, xSunk: fights.filter((f) => f.yKilledX).length, ySunk: fights.filter((f) => f.xKilledY).length };
}
const sidesOgre = (n, enabled) => Array.from({ length: n }, (_, i) => { const sd = T.makeSide("d" + i, { theta: G.GUNNER_THETA }).side(); return enabled ? { ...sd, tactics: C.withCountermeasures(sd.tactics, C.CM.tactician, enabled), cm: C.kitOf(enabled) } : sd; });
/** The Sea OGRE over scenarios: three defenders with and without all three countermeasures. Returns { runs: { base: [{ key, score, outcome, lost, ogreFired }], cm: [...] }, stats } with the countermeasures' counts summed. */
export function ogreRuns(seeds, n = 3) {
    const runs = { base: [], cm: [] }, stats = { decoysReleased: 0, screensReleased: 0, interceptorsLaunched: 0, decoyed: 0, intercepted: 0 };
    for (const seed of seeds) {
        for (const arm of ["base", "cm"]) {
            const r = G.fight(sidesOgre(n, arm === "cm" ? KITS.all : null), G.scenario(seed, n));
            runs[arm].push({ key: "ogre:" + seed, score: r.score, outcome: r.outcome, lost: r.lost, ogreFired: r.ogreFired });
            if (r.cm) for (const k of Object.keys(stats)) stats[k] += r.cm[k] || 0;
        }
    }
    return { runs, stats };
}
const f4 = (x) => `${x >= 0 ? "+" : ""}${x.toFixed(4)}`;

export function command(argv, io = {}) {
    const out = io.out || ((m) => console.log(m)), err = io.err || ((m) => console.error(m)), writeFile = io.writeFile || fs.writeFileSync, sets = io.sets || SETS;
    const o = { arena: "both", set: "dev", seeds: null, write: false };
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i];
        if (a === "--write") o.write = true;
        else if (a === "--arena") { o.arena = argv[++i]; if (!["duel", "ogre", "both"].includes(o.arena)) { err("takeCountermeasures: --arena needs duel, ogre or both"); return 2; } }
        else if (a === "--set") { o.set = argv[++i]; if (!sets[o.set]) { err(`takeCountermeasures: --set needs one of ${Object.keys(sets).join(", ")}`); return 2; } }
        else if (a === "--seeds") { const v = Number(argv[++i]); if (!Number.isInteger(v) || v <= 0) { err("takeCountermeasures: --seeds needs a positive whole number"); return 2; } o.seeds = v; }
        else { err(`takeCountermeasures: unknown argument ${JSON.stringify(a)}`); return 2; }
    }
    if (o.write && o.set !== "held75") { err("takeCountermeasures: --write goes with --set held75 only"); return 2; }
    if (o.write && (o.seeds !== null || o.arena !== "both")) { err("takeCountermeasures: --write needs the whole set of both arenas (no --seeds, no --arena)"); return 2; }
    const sz = (s) => (o.seeds ? Math.min(s.count, o.seeds) : s.count), rows = [], real = o.set !== "dev", tag = real ? "the registered read" : "a sanity run of the code, not a result";
    for (const l of C.reportLines()) out(l);
    if (o.arena !== "ogre") {
        const geos = T.geometries(sz(sets[o.set].duel), sets[o.set].duel.first), none = sideOf("none"), self = duelMatchup(none, sideOf("none2"), geos);
        out(`ARENA A (duel): ${o.set.toUpperCase()} geometries ${geos[0].seed} to ${geos[geos.length - 1].seed}, ${geos.length * 2} duels a matchup (${tag})`);
        const results = {}; for (const k of Object.keys(KITS)) results[k] = duelMatchup(sideOf(k, KITS[k]), none, geos);
        const failures = [];
        if (self.summary.edge !== 0) failures.push(`a side without countermeasures against itself has an edge of ${self.summary.edge} (it must be exactly 0)`);
        if (Object.values(results).some((r) => r.fights.some((f) => !Number.isFinite(f.sx) || !Number.isFinite(f.sy)))) failures.push("a duel has a non-finite score");
        const fires = { decoy: results.decoy.stats.decoysReleased, screen: results.screen.stats.screensReleased, interceptor: results.interceptor.stats.interceptorsLaunched };
        for (const k of Object.keys(fires)) if (!(fires[k] > 0)) failures.push(`the ${k} matchup released nothing (a read of nothing)`);
        if (failures.length) for (const f of failures) out(`CHECK FAILED -- the readings below are NOT WEIGHED: ${f}`); else out("checks: the self edge is exactly 0, no score is non-finite, each mechanism fired in its matchup");
        for (const k of Object.keys(KITS)) {
            const r = results[k], s = r.summary;
            out(`  ${k.padEnd(11)} against none: ${readingOf(s)} (edge ${f4(s.edge)}, z ${Number.isFinite(s.z) ? s.z.toFixed(2) : String(s.z)}; wins ${s.winsX} draws ${s.draws} losses ${s.winsY} of ${s.fights}; boats sunk: with ${r.xSunk}, without ${r.ySunk}; released ${r.stats.decoysReleased} decoys ${r.stats.screensReleased} screens ${r.stats.interceptorsLaunched} interceptors; ${r.stats.decoyed} torpedoes decoyed, ${r.stats.intercepted} intercepted)`);
            for (const f of r.fights) rows.push({ set: o.set, arena: "duel", kit: k, ...f });
        }
        for (const thr of SENSITIVITY) { const r = duelMatchup(sideOf("all@" + thr, KITS.all, thr), none, geos), s = r.summary; out(`  sensitivity, release at ${thr} dB (printed, not weighed): all against none ${readingOf(s)} (edge ${f4(s.edge)}, z ${Number.isFinite(s.z) ? s.z.toFixed(2) : String(s.z)}; boats sunk: with ${r.xSunk}, without ${r.ySunk})`); }
        out("");
    }
    if (o.arena !== "duel") {
        const sc = sets[o.set].ogre, seeds = Array.from({ length: sz(sc) }, (_, i) => sc.first + i), R = ogreRuns(seeds), failures = [];
        out(`ARENA B (the Sea OGRE): ${o.set.toUpperCase()} scenarios ${seeds[0]} to ${seeds[seeds.length - 1]}, three defenders with GUNNER_THETA, with and without all three countermeasures (${tag})`);
        if ([...R.runs.base, ...R.runs.cm].some((r) => !Number.isFinite(r.score))) failures.push("a fight has a non-finite score");
        if (!(R.stats.decoysReleased + R.stats.screensReleased + R.stats.interceptorsLaunched > 0)) failures.push("the defenders released nothing (a read of nothing)");
        if (failures.length) for (const f of failures) out(`CHECK FAILED -- the readings below are NOT WEIGHED: ${f}`); else out("checks: no score is non-finite, the defenders released countermeasures");
        const p = B.paired(R.runs.cm, R.runs.base), count = (arm, k) => R.runs[arm].filter((r) => r.outcome === k).length, lostOf = (arm) => R.runs[arm].reduce((a, r) => a + r.lost, 0);
        out(`  with all three against without: ${B.readingOf(p)} (${f4(p.mean)}, se ${p.se.toFixed(4)}; better ${p.better}, worse ${p.worse}, same ${p.same}, of ${p.n}); defended ${count("cm", "defended")} against ${count("base", "defended")}, breached ${count("cm", "breached")} against ${count("base", "breached")}, holdout ${count("cm", "holdout")} against ${count("base", "holdout")}; defenders lost ${lostOf("cm")} against ${lostOf("base")}; the OGRE fired ${R.runs.cm.reduce((a, r) => a + r.ogreFired, 0)} and ${R.runs.base.reduce((a, r) => a + r.ogreFired, 0)} torpedoes; released ${R.stats.decoysReleased} decoys ${R.stats.screensReleased} screens ${R.stats.interceptorsLaunched} interceptors; ${R.stats.decoyed} decoyed, ${R.stats.intercepted} intercepted`);
        for (const arm of ["base", "cm"]) for (const r of R.runs[arm]) rows.push({ set: o.set, arena: "ogre", kit: arm === "cm" ? "all" : "none", key: r.key, score: r.score, outcome: r.outcome, lost: r.lost, ogreFired: r.ogreFired });
    }
    if (o.write) { writeFile(path.join(ENG, OUT_FILE), rows.map((r) => JSON.stringify(r)).join("\n") + "\n"); out(`wrote ${rows.length} fights to ${OUT_FILE}`); }
    return 0;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = command(process.argv.slice(2));
