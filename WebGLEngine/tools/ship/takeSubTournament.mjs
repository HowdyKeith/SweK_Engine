// WebGLEngine/tools/ship/takeSubTournament.mjs -- UNNUMBERED (the version is chosen at ship time; the registration is brain/SUB_LEAGUE_WIP.md part A, the gate tools/ship/takeSubTournament-selfcheck.mjs)
//   node tools/ship/takeSubTournament.mjs [--only id,id,...] [--geometries N] [--first SEED] [--smoke] [--record FILE]
// THE RUNNER brain/subTournament.mjs NAMES AND NOTHING PROVIDED: it loads the four files the page sub-tournament.html loads (the fruit fly's 963 weights, the tuned theta, the search-ping theta, the two leagues), builds the page's roster (render/subTournamentView.mjs roster()), flies
// subTournament.roundRobin on geometries FIRST to FIRST+N-1 (default 24 from 97001, both seats: 48 duels a pair) and prints the report, each side's seat bias (a side against itself on 8 geometries), the cycles and the upsets. --smoke is geometries 1 to 4 and is never recorded;
// --record FILE writes the record once (a second write to an existing file is refused), in the keys of tools/ship/dogfightTournament-record.json: set, sides, pairs, ratings, fieldEdge, seat, cycles, upsets.
"use strict";
import fs from "node:fs";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import * as T from "../../brain/subTournament.mjs";
import { roster } from "../../render/subTournamentView.mjs";

const ENG = fileURLToPath(new URL("../../", import.meta.url));
export const FILES = Object.freeze({ weights: "brain/pilotSubWeightsWip.json", theta: "brain/subTacticsThetaWip.json", ping: "brain/subTacticsThetaSearchPingWip.json", league: "brain/subTacticsLeagueWip.json" });
export const DEFAULT = Object.freeze({ first: 97001, count: 24 }), SMOKE = Object.freeze({ first: 1, count: 4 }), SEAT_GEOMETRIES = 8;
export const ROSTER_IDS = Object.freeze(["hand", "hand+net", "champ", "champ+net", "ping", "league7001", "league7000"]);

/** The roster's sides from the four files (`read(path)` returns the parsed JSON, default from disk): [{ id, label, note, side }]. */
export function sidesOf(read = (f) => JSON.parse(fs.readFileSync(ENG + f, "utf8"))) {
    const files = {}; for (const [k, f] of Object.entries(FILES)) files[k] = read(f);
    return roster(files);
}
const sha = (v) => crypto.createHash("sha256").update(JSON.stringify(v)).digest("hex");

/** The record of a round robin, in the keys of the dogfight's: { set, sides, pairs, ratings, fieldEdge, seat, cycles, upsets }. `seat` is { id: { mean, se, n } } from seatBias, or {} when it was not measured. */
export function recordOf(result, sides, set, seat = {}) {
    const get = (x, y) => { const s = result.pairs[`${x}|${y}`]; if (s) return s.summary; const q = result.pairs[`${y}|${x}`]; return q ? T.flipSummary(q.summary) : null; };
    const fit = T.ratings(result, { summaryOf: get }), order = T.rankOf(fit, result.ids);
    return {
        set: { name: "subTournament", kind: "patrol", first: set.first, scenarios: set.count },
        sides: sides.filter((s) => result.ids.includes(s.id)).map((s) => ({ id: s.id, label: s.label, theta: s.side.theta, weightsSha256: s.side.weights ? sha(Array.from(s.side.weights)) : null })),
        pairs: Object.entries(result.pairs).map(([k, p]) => ({ pair: k, x: p.x, y: p.y, summary: p.summary })),
        ratings: { order, rating: fit.rating, converged: fit.converged }, fieldEdge: T.fieldEdges(result),
        seat, cycles: T.transitivity(result), upsets: T.upsets(result, fit),
    };
}

/** The two verdict lines of a record: the cycles (or that there is none) and the upsets (or that there is none). */
export function verdictLines(r) {
    return [
        r.cycles.length ? `  cycles: ${r.cycles.join("; ")}` : "  no cycle: the significant leads are transitive",
        r.upsets.length ? `  upsets: ${r.upsets.map((u) => `${u.lower} over ${u.higher} (edge ${u.edge.toFixed(3)}, z ${u.z.toFixed(1)})`).join("; ")}` : "  no upset: no significant lead runs against the rating",
    ];
}

/** The command: argv (after the program), io { log, exists, write, read } (defaults: the console and the file system). Returns the exit code. */
export function command(argv, io = {}) {
    const log = io.log || ((s) => console.log(s)), exists = io.exists || ((f) => fs.existsSync(ENG + f)), write = io.write || ((f, s) => fs.writeFileSync(ENG + f, s));
    const flag = (n) => { const i = argv.indexOf(n); return i < 0 ? null : argv[i + 1]; }, known = new Set(["--only", "--geometries", "--first", "--smoke", "--record"]);
    for (let i = 0; i < argv.length; i++) if (argv[i].startsWith("--") && !known.has(argv[i])) { log(`takeSubTournament: unknown argument ${argv[i]}`); return 2; }
    const smoke = argv.includes("--smoke"), rec = flag("--record");
    if (smoke && rec) { log("takeSubTournament: --smoke is never recorded"); return 2; }
    const gv = flag("--geometries"), fv = flag("--first"), n = gv === null ? (smoke ? SMOKE.count : DEFAULT.count) : /^\d+$/.test(gv) ? Number(gv) : NaN, first = fv === null ? (smoke ? SMOKE.first : DEFAULT.first) : /^\d+$/.test(fv) ? Number(fv) : NaN;
    if (!(n >= 1 && n <= 200) || !(first >= 1)) { log("takeSubTournament: --geometries is 1 to 200 and --first a seed of 1 or more"); return 2; }
    if (rec !== null && (rec === undefined || rec === "" || rec.startsWith("--"))) { log("takeSubTournament: --record needs a file"); return 2; }
    if (rec && exists(rec)) { log(`takeSubTournament: ${rec} exists; the record is written once`); return 2; }
    const all = sidesOf(io.read), only = flag("--only"), ids = only === null ? all.map((s) => s.id) : only.split(",").filter(Boolean);
    const missing = ids.filter((id) => !all.some((s) => s.id === id)); if (missing.length) { log(`takeSubTournament: no side named ${missing.join(", ")} (the roster has ${all.map((s) => s.id).join(", ")})`); return 2; }
    if (new Set(ids).size !== ids.length || ids.length < 2) { log("takeSubTournament: at least two different sides"); return 2; }
    const sides = ids.map((id) => all.find((s) => s.id === id)), set = { first, count: n }, geos = T.geometries(n, first), labels = Object.fromEntries(sides.map((s) => [s.id, s.label]));
    log(`[takeSubTournament] ${sides.length} sides (${ids.join(", ")}), geometries ${first} to ${first + n - 1}, both seats${smoke ? " (smoke: not recorded)" : ""}`);
    const result = T.roundRobin(sides.map((s) => s.side), geos, {});
    for (const l of T.reportLines(result, { labels })) log(l);
    const seat = {}, seatGeos = T.geometries(SEAT_GEOMETRIES, first); for (const s of sides) { seat[s.id] = T.seatBias(s.side, seatGeos); log(`  seat bias ${s.id}: seat A is worth ${seat[s.id].mean >= 0 ? "+" : ""}${seat[s.id].mean.toFixed(3)} a duel (se ${seat[s.id].se.toFixed(3)}, ${seat[s.id].n} geometries)`); }
    const r = recordOf(result, sides, set, seat);
    for (const l of verdictLines(r)) log(l);
    if (rec) { write(rec, JSON.stringify(r, null, 1) + "\n"); log(`  written ${rec}`); }
    return 0;
}

if (typeof process !== "undefined" && Array.isArray(process.argv)) {
    const { pathToFileURL } = await import("node:url");
    if (import.meta.url === pathToFileURL(process.argv[1] || "").href) process.exit(command(process.argv.slice(2)));
}
