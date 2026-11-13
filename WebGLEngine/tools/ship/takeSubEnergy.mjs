// WebGLEngine/tools/ship/takeSubEnergy.mjs -- UNNUMBERED (the version is chosen at ship time; the registration is brain/SUB_ENERGY_WIP.md, the gate brain/subEnergy-selfcheck.mjs)
//   node tools/ship/takeSubEnergy.mjs dev [--set smoke|dev] [--write]       the calibration: the five capacities of the ladder, the search-ping champion against the default tactician on the DEV geometries (94001 to 94024), and where the cost BINDS
//   node tools/ship/takeSubEnergy.mjs held --rung N --write                 read 1, flown ONCE for rung N on the HELD geometries (95001 to 95024): the four doctrines' round robin with and without the cost
//   node tools/ship/takeSubEnergy.mjs retune [--dir brain] [--write]        read 2: the four searches of tools/tuneSubTactics.mjs --needs (seeds 6100 to 6103, files subEnergyTuned610N.json) against the no-cost champion
// A rung BINDS iff, in the calibration duels (the search-ping champion X against the default tactician Y, both seats, no kit), a boat's screw dies before the duel ends in at least BIND of the boat-duels (twice the duels); the task is the first
// (largest-capacity) rung that binds. Read 1 says the cost MATTERS to the ranking iff in some pair the sign of the edge differs between the runs and the larger |edge| is at least 0.05 with z at least 2 in the run where it is larger.
"use strict";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import * as D from "../../brain/subDuel.mjs";
import * as T from "../../brain/subTournament.mjs";
import { roster } from "../../render/subTournamentView.mjs";

const ENG = fileURLToPath(new URL("../../", import.meta.url));
export const DEV_FILE = "brain/subEnergyDev.json", HELD_FILE = "brain/subEnergyHeld.json", RETUNE_FILE = "brain/subEnergyRetune.json", TUNED_PREFIX = "brain/subEnergyTuned";
export const SETS = Object.freeze({ smoke: Object.freeze({ first: 1, count: 4 }), dev: Object.freeze({ first: 94001, count: 24 }), held: Object.freeze({ first: 95001, count: 24 }) });
export const LADDER = Object.freeze([3.0e6, 1.5e6, 0.75e6, 0.4e6, 0.2e6]);   // joules a boat starts with; rung 0 is the battery class's own capacity
export const BIND = 0.25, SLOW_BY = 0.5, MATTERS_EDGE = T.DECISIVE, MATTERS_Z = 2, TUNE_SEEDS = Object.freeze([6100, 6101, 6102, 6103]);
export const DOCTRINES = Object.freeze(["hand", "champ", "ping", "league7001"]);
export const needsOf = (rung) => { if (!Number.isInteger(rung) || rung < 0 || rung >= LADDER.length) throw new Error(`takeSubEnergy.needsOf: no rung ${rung} (0 to ${LADDER.length - 1})`); return { cls: "battery", energyJ: LADDER[rung] }; };
export const geometriesOf = (set) => T.geometries(SETS[set].count, SETS[set].first);

const FILES = Object.freeze({ weights: "brain/pilotSubWeightsWip.json", theta: "brain/subTacticsThetaWip.json", ping: "brain/subTacticsThetaSearchPingWip.json", league: "brain/subTacticsLeagueWip.json" });
/** The sides of the four doctrines of read 1, from the files the tournament page loads: { id: { id, label, side } }. `read(path)` returns the parsed JSON (default: from disk). */
export function sidesOf(read = (f) => JSON.parse(fs.readFileSync(ENG + f, "utf8"))) {
    const files = {}; for (const [k, f] of Object.entries(FILES)) files[k] = read(f);
    const all = roster(files), out = {}; for (const id of DOCTRINES) { const s = all.find((x) => x.id === id); if (!s) throw new Error(`takeSubEnergy.sidesOf: the roster has no side "${id}"`); out[id] = s.side; }
    return out;
}

/** One pair, X against Y on `geos`, both seats each, with `needs` (null: none): { fights, summary, dead: [X boat-duels with a dead screw, Y's], boatDuels (per side), charge: [X's mean charge left, Y's], sunk }. */
export function pair(x, y, geos, needs) {
    const fights = []; const dead = [0, 0], ch = [0, 0]; let n = 0;
    for (const sc of geos) {
        const a = D.duel(x.side(), sc, { opponent: y.side(), needs }), b = D.duel(y.side(), sc, { opponent: x.side(), needs });
        fights.push({ seed: sc.seed, seat: "A", sx: a.score, sy: D.scoreFor(a, "B"), statusX: a.fates[0], statusY: a.fates[1], xKilledY: a.fates[1] === "sunk", yKilledX: a.fates[0] === "sunk", ticks: a.ticks });
        fights.push({ seed: sc.seed, seat: "B", sx: D.scoreFor(b, "B"), sy: b.score, statusX: b.fates[1], statusY: b.fates[0], xKilledY: b.fates[0] === "sunk", yKilledX: b.fates[1] === "sunk", ticks: b.ticks });
        if (needs) { if (a.deadAt[0] !== null) dead[0]++; if (a.deadAt[1] !== null) dead[1]++; if (b.deadAt[1] !== null) dead[0]++; if (b.deadAt[0] !== null) dead[1]++; ch[0] += a.charge[0] + b.charge[1]; ch[1] += a.charge[1] + b.charge[0]; }
        n += 2;
    }
    return { fights, summary: T.summary(fights), dead, boatDuels: n, charge: needs ? [ch[0] / n, ch[1] / n] : null, sunk: fights.filter((f) => f.xKilledY || f.yKilledX).length, xSunk: fights.filter((f) => f.yKilledX).length, ySunk: fights.filter((f) => f.xKilledY).length };
}

/** Does a rung bind: the boat-duels with a dead screw (`dead` is [X's, Y's]) are at least BIND of the 2 x `boatDuels` boats? */
export const bindsAt = (dead, boatDuels) => (dead[0] + dead[1]) / (2 * boatDuels) >= BIND;

/** The calibration over `set`: every rung, the search-ping champion against the default; { set, rows: [{ rung, energyJ, pair, deadShare, binds }], chosen }. */
export function calibrate(set = "dev", sides = sidesOf(), onRung = null) {
    const geos = geometriesOf(set), rows = [];
    for (let rung = 0; rung < LADDER.length; rung++) {
        const p = pair(sides.ping, sides.hand, geos, needsOf(rung)), deadShare = (p.dead[0] + p.dead[1]) / (2 * p.boatDuels), row = { rung, energyJ: LADDER[rung], pair: p, deadShare, binds: bindsAt(p.dead, p.boatDuels) };
        rows.push(row); if (onRung) onRung(row);
    }
    const first = rows.find((r) => r.binds); return { set, rows, chosen: first ? first.rung : null };
}

/** Read 1's rule for one pair, from its summaries without and with the cost ({ edge, z } each): { flips (the sign of the edge changed), big (the summary with the larger |edge|), matters (flipped, that larger |edge| at least MATTERS_EDGE with |z| at least MATTERS_Z) }. */
export function mattersOf(free, cost) {
    const flips = Math.sign(free.edge) * Math.sign(cost.edge) < 0, big = Math.abs(free.edge) >= Math.abs(cost.edge) ? free : cost;
    return { flips, big, matters: flips && Math.abs(big.edge) >= MATTERS_EDGE && Math.abs(big.z) >= MATTERS_Z };
}

/** Read 1 on `set` at `rung`: every pair of the four doctrines, with and without the cost. Returns { rung, set, ids, runs: { free, cost }, pairs: [{ x, y, free: summary, cost: summary, flips, matters }], matters, doctrines: [{ id, deadShare, charge }], ratings }. */
export function readRanking(rung, set = "held", sides = sidesOf(), check = checks) {
    const geos = geometriesOf(set), ids = DOCTRINES, runs = { free: { ids: [...ids], scenarios: geos.length, pairs: {} }, cost: { ids: [...ids], scenarios: geos.length, pairs: {} } }, tally = Object.fromEntries(ids.map((id) => [id, { dead: 0, boatDuels: 0, charge: 0 }])), out = [];
    for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) {
        const x = sides[ids[i]], y = sides[ids[j]], free = pair(x, y, geos, null), cost = pair(x, y, geos, needsOf(rung));
        runs.free.pairs[`${ids[i]}|${ids[j]}`] = { x: ids[i], y: ids[j], fights: free.fights, summary: free.summary }; runs.cost.pairs[`${ids[i]}|${ids[j]}`] = { x: ids[i], y: ids[j], fights: cost.fights, summary: cost.summary };
        for (const [k, id] of [[0, ids[i]], [1, ids[j]]]) { tally[id].dead += cost.dead[k]; tally[id].boatDuels += cost.boatDuels; tally[id].charge += cost.charge[k] * cost.boatDuels; }
        const fe = free.summary, ce = cost.summary, m = mattersOf(fe, ce);
        out.push({ x: ids[i], y: ids[j], free: { edge: fe.edge, z: fe.z }, cost: { edge: ce.edge, z: ce.z }, flips: m.flips, matters: m.matters });
    }
    const decisive = { free: 0, cost: 0 }, flown = { free: 0, cost: 0 }; for (const k of ["free", "cost"]) for (const q of Object.values(runs[k].pairs)) { flown[k] += q.fights.length; decisive[k] += q.fights.filter((f) => f.xKilledY || f.yKilledX).length; }
    const ratings = {}; for (const k of ["free", "cost"]) { const sum = (a, b) => { const s = runs[k].pairs[`${a}|${b}`]; if (s) return s.summary; const q = runs[k].pairs[`${b}|${a}`]; return q ? T.flipSummary(q.summary) : null; }; const fit = T.ratings(runs[k], { summaryOf: sum }); ratings[k] = Object.fromEntries(ids.map((id) => [id, fit.rating[id]])); }
    const self = pair(sides.hand, sides.hand, geos, needsOf(rung)), bad = check(Object.values(runs.cost.pairs).map((q) => ({ fights: q.fights, charge: [0, 0] })), { selfEdge: self.summary.edge });
    return { rung, set, ids, checks: bad, sunkShare: { free: decisive.free / flown.free, cost: decisive.cost / flown.cost }, spread: Object.fromEntries(["free", "cost"].map((k) => [k, Math.max(...ids.map((id) => ratings[k][id])) - Math.min(...ids.map((id) => ratings[k][id]))])), pairs: out, matters: out.some((p) => p.matters), doctrines: ids.map((id) => ({ id, deadShare: tally[id].dead / tally[id].boatDuels, charge: tally[id].charge / tally[id].boatDuels })), ratings };
}

/** Read 2: the four re-tuned champions' files (`read(path)` -> parsed JSON or null) against the no-cost champion's speeds. Returns { champion (the file's seed, picked on held score), speeds, free, delta, reading ("SLOWS" | "as fast" | "faster"), files }. */
export function readRetune(read = (f) => (fs.existsSync(ENG + f) ? JSON.parse(fs.readFileSync(ENG + f, "utf8")) : null), dir = "brain") {
    const files = TUNE_SEEDS.map((s) => ({ seed: s, d: read(`${dir}/subEnergyTuned${s}.json`) })), have = files.filter((f) => f.d);
    if (have.length < TUNE_SEEDS.length) return { error: `only ${have.length} of the ${TUNE_SEEDS.length} tuning files exist (${TUNE_SEEDS.map((s) => `${dir}/subEnergyTuned${s}.json`).join(", ")})` };
    const champ = have.reduce((a, b) => (b.d.heldScore > a.d.heldScore ? b : a)), free = read(FILES.ping).theta, mean = (t) => (t.searchSpeed + t.trackSpeed) / 2, delta = mean(champ.d.theta) - mean(free);
    return { champion: champ.seed, held: have.map((f) => ({ seed: f.seed, held: f.d.heldScore, train: f.d.trainScore })), speeds: { searchSpeed: champ.d.theta.searchSpeed, trackSpeed: champ.d.theta.trackSpeed, evadeSpeed: champ.d.theta.evadeSpeed }, free: { searchSpeed: free.searchSpeed, trackSpeed: free.trackSpeed, evadeSpeed: free.evadeSpeed }, delta, reading: delta <= -SLOW_BY ? "SLOWS" : delta >= SLOW_BY ? "faster" : "as fast", needs: champ.d.needs };
}

/** The checks that void a read (a failure and the readings are NOT WEIGHED): [] for none. `pairs` is a list of pair() results (flown with the cost where `.charge` is set); `selfEdge` (optional) is the edge of a doctrine against itself, which must be exactly 0; `mustFire` (optional) says the cost must have killed a screw somewhere in `pairs`. */
export function checks(pairs, { selfEdge = null, mustFire = false } = {}) {
    const out = [];
    if (pairs.some((p) => p.fights.some((f) => !Number.isFinite(f.sx) || !Number.isFinite(f.sy)))) out.push("a score is non-finite");
    if (pairs.some((p) => p.charge && p.charge.some((c) => !Number.isFinite(c)))) out.push("a charge is non-finite");
    if (selfEdge !== null && selfEdge !== 0) out.push(`a doctrine against itself has an edge of ${selfEdge}, not exactly 0`);
    if (mustFire && !pairs.some((p) => p.dead && p.dead[0] + p.dead[1] > 0)) out.push("no screw died anywhere in the calibration arm: the cost did not fire");
    return out;
}

const pct = (v) => (100 * v).toFixed(0) + "%";
const J = (e) => (e / 1e6).toFixed(2) + " MJ";
/** The command: argv (after the program), io { log, exists, write, read, heldSet } (defaults: the console and the file system; heldSet is for the gate, which flies the smoke geometries). Returns the exit code. */
export function command(argv, io = {}) {
    const log = io.log || ((s) => console.log(s)), exists = io.exists || ((f) => fs.existsSync(ENG + f)), write = io.write || ((f, s) => fs.writeFileSync(ENG + f, s)), check = io.checks || checks;   // io.checks, io.devSet and io.heldSet are for the gate (a failed check to see the exit code; smoke geometries instead of the DEV and HELD sets)
    const mode = argv[0], flag = (n) => { const i = argv.indexOf(n); return i < 0 ? null : argv[i + 1]; };
    if (!["dev", "held", "retune"].includes(mode)) { log("usage: takeSubEnergy.mjs dev [--set smoke|dev] [--write] | held --rung N --write | retune [--dir D] [--write]"); return 2; }
    if (mode === "dev") {
        const set = io.devSet || flag("--set") || "dev"; if (set !== "smoke" && set !== "dev") { log(`takeSubEnergy: --set is smoke or dev, not "${set}" (the HELD set is read by the held command, once)`); return 2; }
        if (argv.includes("--write") && set !== "dev" && !io.devSet) { log("takeSubEnergy: --write is for the dev set"); return 2; }
        log(`[takeSubEnergy] DEV calibration, set ${set} (geometries ${SETS[set].first} to ${SETS[set].first + SETS[set].count - 1}, both seats): the search-ping champion against the default tactician, no kit; a rung BINDS at ${pct(BIND)} of the boat-duels with a dead screw`);
        const res = calibrate(set, io.sides || sidesOf(io.read), (r) => {
            const p = r.pair; log(`  RUNG ${r.rung}  ${J(r.energyJ)} a boat`); log(`    screws dead: ping ${p.dead[0]}/${p.boatDuels}, hand ${p.dead[1]}/${p.boatDuels}  (${pct(r.deadShare)} of the boat-duels); charge left: ping ${p.charge[0].toFixed(2)}, hand ${p.charge[1].toFixed(2)}; a boat sunk in ${p.sunk} of ${p.fights.length} duels (ping sunk ${p.xSunk}, hand sunk ${p.ySunk}); ping mean ${p.summary.meanX.toFixed(3)}  ->  ${r.binds ? "BINDS" : "does not bind"}`);
        });
        log(res.chosen === null ? "  RESULT: no rung binds; the reads are not flown and a budget of these sizes does not bind within a duel" : `  RESULT: the cost binds first at rung ${res.chosen} (${J(LADDER[res.chosen])})`);
        const bad = check(res.rows.map((r) => r.pair), { mustFire: res.chosen !== null }); if (bad.length) log("  CHECKS FAILED, NOT WEIGHED: " + bad.join("; "));
        if (argv.includes("--write")) { write(DEV_FILE, JSON.stringify({ set, chosen: res.chosen, bind: BIND, rows: res.rows.map((r) => ({ rung: r.rung, energyJ: r.energyJ, deadShare: r.deadShare, binds: r.binds, dead: r.pair.dead, boatDuels: r.pair.boatDuels, charge: r.pair.charge, sunk: r.pair.sunk, xSunk: r.pair.xSunk, ySunk: r.pair.ySunk, meanX: r.pair.summary.meanX })) }, null, 1) + "\n"); log(`  written ${DEV_FILE}`); }
        return bad.length ? 1 : 0;
    }
    if (mode === "held") {
        const rv = flag("--rung"), rung = rv !== null && /^\d+$/.test(rv) ? Number(rv) : NaN; if (!Number.isInteger(rung) || rung < 0 || rung >= LADDER.length) { log(`takeSubEnergy: held needs --rung N, N one of 0 to ${LADDER.length - 1}`); return 2; }
        if (!io.heldSet && !argv.includes("--write")) { log("takeSubEnergy: the HELD set is read once and the read is recorded; run held with --write"); return 2; }
        if (argv.includes("--write") && exists(HELD_FILE)) { log(`takeSubEnergy: ${HELD_FILE} exists; the HELD set is read once and a second read is refused`); return 2; }
        const hs = io.heldSet || "held", r = readRanking(rung, hs, io.sides || sidesOf(io.read), check);
        log(`[takeSubEnergy] HELD read 1, rung ${rung} (${J(LADDER[rung])} a boat), geometries ${SETS[hs].first} to ${SETS[hs].first + SETS[hs].count - 1}, both seats; the four doctrines' round robin without and with the cost`);
        log(`  ratings (Bradley-Terry, Elo scale; read DIFFERENCES): ${r.ids.map((id) => `${id} ${r.ratings.free[id].toFixed(0)} -> ${r.ratings.cost[id].toFixed(0)}`).join(", ")}`);
        log(`  duels with a boat sunk: ${pct(r.sunkShare.free)} without the cost, ${pct(r.sunkShare.cost)} with it; the ratings' spread (best less worst): ${r.spread.free.toFixed(0)} without, ${r.spread.cost.toFixed(0)} with   (printed; NOT in the rule)`);
        for (const p of r.pairs) log(`    ${p.x} v ${p.y}: edge ${p.free.edge >= 0 ? "+" : ""}${p.free.edge.toFixed(3)} (z ${p.free.z.toFixed(1)}) -> ${p.cost.edge >= 0 ? "+" : ""}${p.cost.edge.toFixed(3)} (z ${p.cost.z.toFixed(1)})${p.flips ? "  SIGN FLIPS" : ""}${p.matters ? "  MATTERS" : ""}`);
        for (const d of r.doctrines) log(`    ${d.id}: screw dead in ${pct(d.deadShare)} of its boat-duels, ${d.charge.toFixed(2)} of the charge left on average`);
        if (r.checks.length) log("  CHECKS FAILED, NOT WEIGHED: " + r.checks.join("; "));
        log(`  READING: the cost ${r.matters ? "MATTERS to the ranking" : "does not matter to the ranking"} by the rule (a flipped sign, the larger |edge| at least ${MATTERS_EDGE}, z at least ${MATTERS_Z})`);
        if (argv.includes("--write")) { write(HELD_FILE, JSON.stringify({ ...r, set: hs }, null, 1) + "\n"); log(`  written ${HELD_FILE}`); }
        return r.checks.length ? 1 : 0;
    }
    const dir = flag("--dir") || "brain", r = readRetune(io.read, dir);
    if (r.error) { log("takeSubEnergy: " + r.error); return 2; }
    log(`[takeSubEnergy] HELD read 2, the doctrine re-tuned under the cost (seeds ${TUNE_SEEDS.join(", ")}, needs ${r.needs === undefined ? "?" : J(r.needs)} a boat); the champion is seed ${r.champion} (the best held score of the four: ${r.held.map((h) => `${h.seed} ${h.held.toFixed(3)}`).join(", ")})`);
    log(`  speeds (m/s)   search ${r.speeds.searchSpeed.toFixed(2)} (was ${r.free.searchSpeed.toFixed(2)}), track ${r.speeds.trackSpeed.toFixed(2)} (was ${r.free.trackSpeed.toFixed(2)}), evade ${r.speeds.evadeSpeed.toFixed(2)} (was ${r.free.evadeSpeed.toFixed(2)})`);
    log(`  READING: the mean of search and track speed moved by ${r.delta >= 0 ? "+" : ""}${r.delta.toFixed(2)} m/s: the doctrine ${r.reading === "SLOWS" ? "SLOWS" : r.reading === "faster" ? "is FASTER" : "is as fast"} by the rule (${SLOW_BY} m/s)`);
    if (argv.includes("--write")) { if (exists(RETUNE_FILE)) { log(`takeSubEnergy: ${RETUNE_FILE} exists; read 2 is recorded once`); return 2; } write(RETUNE_FILE, JSON.stringify(r, null, 1) + "\n"); log(`  written ${RETUNE_FILE}`); }
    return 0;
}

if (typeof process !== "undefined" && Array.isArray(process.argv)) {
    const { pathToFileURL } = await import("node:url");
    if (import.meta.url === pathToFileURL(process.argv[1] || "").href) process.exit(command(process.argv.slice(2)));
}
