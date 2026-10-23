// WebGLEngine/tools/ship/tournamentDogfight.mjs -- UNNUMBERED (the version is chosen at ship time) (the library; the command is tools/ship/runDogfightTournament.mjs)
//
// THE SHIPPED PILOTS, LOADED FROM THEIR FILES AND PUT THROUGH brain/dogfightTournament.mjs. The roster is what the dogfight page offers (dogfight.html): the PD autopilot, the fruit fly trained to fly, the fruit fly trained to fight, the GPU Brain (its CPU twin) trained to fly and trained to fight,
// each from its own swek-brain-v1 file through brain/peerBrain.mjs's importer (the page's own door: a file for the wrong policy, with the wrong weight count or a non-finite weight is refused by name), plus -- only if the file exists -- the league pilots tools/ship/trainDogfightLeague.mjs writes when
// a champion qualifies. THE TOURNAMENT IS A MEASUREMENT AND NOT AN AUDIT: it flies TOURNAMENT_SET (120 duels no pilot has trained on), it can be read again, and the record it writes is what a note may quote.
//
//     node tools/ship/runDogfightTournament.mjs                       # the round robin, report only
//     node tools/ship/runDogfightTournament.mjs --only autopilot,flyDogfight,gpuDogfight   # a subset (ids as in ROSTER)
//     node tools/ship/runDogfightTournament.mjs --smoke               # four throwaway duels, to see that it runs
//     node tools/ship/runDogfightTournament.mjs --record <file>       # also write the numbers as a JSON record (tools/ship/dogfightTournament-record.json is the committed one)
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as AF from "../../brain/autopilotFlight.mjs";
import * as PF from "../../brain/pilotFlightPolicy.mjs";
import * as MF from "../../brain/pilotFlightMlp.mjs";
import * as PB from "../../brain/peerBrain.mjs";
import * as D from "../../brain/dogfightTask.mjs";
import * as T from "../../brain/dogfightTournament.mjs";
import { weightsHash } from "../../brain/drivePolicy.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const BRAIN_DIR = path.resolve(HERE, "..", "..", "brain");
/** The roster, in table order. `optional`: skipped (and said) when the file is not there. */
export const ROSTER = Object.freeze([
    Object.freeze({ id: "autopilot", label: "PD autopilot (the hand rule)", hand: true }),
    Object.freeze({ id: "flyFlight", label: "fruit fly trained to FLY", policy: PF, policyId: "pilotFlightPolicy", file: "pilotFlightWeightsDefault.json" }),
    Object.freeze({ id: "flyDogfight", label: "fruit fly trained to FIGHT", policy: PF, policyId: "pilotFlightPolicy", file: "pilotDogfightWeightsDefault.json" }),
    Object.freeze({ id: "gpuFlight", label: "GPU Brain trained to FLY (CPU twin)", policy: MF, policyId: "pilotFlightMlp", file: "pilotFlightMlpWeightsDefault.json" }),
    Object.freeze({ id: "gpuDogfight", label: "GPU Brain trained to FIGHT (CPU twin)", policy: MF, policyId: "pilotFlightMlp", file: "pilotDogfightMlpWeightsDefault.json" }),
    Object.freeze({ id: "flyLeague", label: "fruit fly league pilot", policy: PF, policyId: "pilotFlightPolicy", file: "pilotDogfightWeightsLeague.json", optional: true }),
    Object.freeze({ id: "gpuLeague", label: "GPU Brain league pilot (CPU twin)", policy: MF, policyId: "pilotFlightMlp", file: "pilotDogfightMlpWeightsLeague.json", optional: true }),
]);

/**
 * Load the roster (or `only`, a list of ids, in ROSTER order). Returns { pilots: [{ id, label, fn, file, hash }], skipped: [ids of optional pilots whose file is absent] }. Throws, naming the pilot and the reason, when a file that is there
 * is refused by the importer or a required file is missing, and when `only` names an id the roster does not have.
 */
export function loadRoster({ dir = BRAIN_DIR, only = null, read = (f) => fs.readFileSync(f, "utf8"), exists = (f) => fs.existsSync(f) } = {}) {
    if (only) { const bad = only.filter((id) => !ROSTER.some((r) => r.id === id)); if (bad.length) throw new Error(`unknown pilot ${bad.map((b) => JSON.stringify(b)).join(", ")} (known: ${ROSTER.map((r) => r.id).join(", ")})`); }
    const pilots = [], skipped = [];
    for (const r of ROSTER) {
        if (only && !only.includes(r.id)) continue;
        if (r.hand) { pilots.push({ id: r.id, label: r.label, fn: AF.pilot, file: null, hash: null }); continue; }
        const f = path.join(dir, r.file);
        if (!exists(f)) { if (r.optional) { skipped.push(r.id); continue; } throw new Error(`${r.id}: ${r.file} is missing`); }
        const imp = PB.importBrain(PB.describePolicy(r.policyId, r.policy), JSON.parse(read(f)));
        if (!imp.ok) throw new Error(`${r.id}: ${r.file} refused: ${imp.reason}`);
        pilots.push({ id: r.id, label: r.label, fn: r.policy.pilotFor(imp.weights), file: r.file, hash: weightsHash(imp.weights) });
    }
    return { pilots, skipped };
}

const round6 = (x) => (Number.isFinite(x) ? Math.round(x * 1e6) / 1e6 : String(x));
/** The record: the numbers a note may quote, rounded to 1e-6. Deterministic (no clock). */
export function recordOf(result, pilots, seat, set) {
    const fit = T.ratings(result), order = T.rankOf(fit, result.ids), keys = Object.keys(result.pairs);
    return {
        set: { name: set.name, scenarios: result.scenarios, kind: "duel", seeds: [set.lo, set.hi] },
        pilots: pilots.map((p) => ({ id: p.id, label: p.label, file: p.file, hash: p.hash })),
        pairs: keys.map((k) => { const s = result.pairs[k].summary; return { x: result.pairs[k].x, y: result.pairs[k].y, fights: s.fights, winsX: s.winsX, winsY: s.winsY, draws: s.draws, edge: round6(s.edge), se: round6(s.se), z: round6(s.z), meanX: round6(s.meanX), meanY: round6(s.meanY), killsX: s.killsX, killsY: s.killsY, collisions: s.collisions, groundX: s.groundX, groundY: s.groundY }; }),
        ratings: order.map((id) => ({ id, rating: round6(fit.rating[id]) })), converged: fit.converged,
        fieldEdge: Object.entries(T.fieldEdges(result)).sort((a, b) => b[1] - a[1]).map(([id, edge]) => ({ id, edge: round6(edge) })),
        seat: Object.fromEntries(Object.keys(seat).map((id) => [id, { n: seat[id].n, mean: round6(seat[id].mean), se: round6(seat[id].se) }])),
        cycles: T.transitivity(result), upsets: T.upsets(result, fit).map((u) => ({ lower: u.lower, higher: u.higher, edge: round6(u.edge), z: round6(u.z) })),
        stability: T.stability(result, [10, 20, 40, 80]).map((s) => ({ n: s.n, maxShift: round6(s.maxShift), sameOrder: s.sameOrder })),
    };
}

/** The sets the command can fly: the tournament's 120 duels, or the four throwaway ones under --smoke. */
export const SETS = Object.freeze({ tournament: Object.freeze({ name: "TOURNAMENT_SET", set: D.TOURNAMENT_SET, lo: 4000, hi: 4119 }), smoke: Object.freeze({ name: "LEAGUE_SMOKE_SET", set: D.LEAGUE_SMOKE_SET, lo: 9100, hi: 9103 }) });

/** Parse argv in one pass, REFUSING an option it does not know (a typo must not silently fly the default roster). */
export function parseArgs(argv) {
    const known = { only: String, record: String, smoke: Boolean, quiet: Boolean }, given = {};
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i]; if (!a.startsWith("--")) throw new Error(`unexpected argument ${JSON.stringify(a)}`);
        const k = a.slice(2); if (!(k in known)) throw new Error(`unknown option ${JSON.stringify(a)} (known: ${Object.keys(known).map((n) => "--" + n).join(", ")})`);
        if (known[k] === Boolean) given[k] = true; else { const v = argv[++i]; if (v == null || v.startsWith("--")) throw new Error(`${a} needs a value`); given[k] = v; }
    }
    const only = "only" in given ? given.only.split(",").map((s) => s.trim()).filter(Boolean) : null;
    if (only && only.length < 2) throw new Error("--only needs at least two pilot ids");
    if (only && new Set(only).size !== only.length) throw new Error("--only names a pilot twice");
    return { only, record: given.record || null, smoke: !!given.smoke, quiet: !!given.quiet };
}

/**
 * THE COMMAND, as a function (tools/ship/runDogfightTournament.mjs is the three lines that call it): load, fly the round robin, print the report, write the record if asked. Returns the exit code: 0 done, 2 a bad argument or a roster that cannot be loaded.
 * `io` is for the gate: { out, err, writeFile, load, rr, seatOf }.
 */
export function command(argv, io = {}) {
    const out = io.out || ((m) => console.log(m)), err = io.err || ((m) => console.error(m)), writeFile = io.writeFile || fs.writeFileSync, load = io.load || loadRoster, rr = io.rr || T.roundRobin, seatOf = io.seatOf || T.seatBias;
    let opts, roster;
    try { opts = parseArgs(argv); roster = load({ only: opts.only }); } catch (e) { err("runDogfightTournament: " + e.message); return 2; }
    const { pilots, skipped } = roster;
    if (pilots.length < 2) { err(`runDogfightTournament: ${pilots.length} pilot${pilots.length === 1 ? "" : "s"} loaded; a tournament needs two`); return 2; }
    const set = SETS[opts.smoke ? "smoke" : "tournament"], log = opts.quiet ? () => {} : out;
    log(`roster: ${pilots.map((p) => p.id + (p.hash ? " " + p.hash : "")).join(", ")}${skipped.length ? " (no file yet for: " + skipped.join(", ") + ")" : ""}; ${set.name}: ${set.set.length} duels, each flown from both seats by every pair`);
    const result = rr(pilots, set.set, {}, (m, done, total) => log(`  pair ${done}/${total}: ${m.x} against ${m.y}: ${m.summary.winsX}-${m.summary.draws}-${m.summary.winsY}, edge ${m.summary.edge.toFixed(3)} +- ${m.summary.se.toFixed(3)}`));
    const seat = {}; for (const p of pilots) seat[p.id] = seatOf(p, set.set);
    const labels = Object.fromEntries(pilots.map((p) => [p.id, p.label]));
    for (const l of T.reportLines(result, { labels, seat, sizes: [10, 20, 40, 80].filter((n) => n <= set.set.length) })) out(l);
    if (opts.record) { writeFile(opts.record, JSON.stringify(recordOf(result, pilots, seat, set), null, 1) + "\n"); out(`wrote the record to ${opts.record}`); }
    return 0;
}
