// WebGLEngine/tools/ship/tournamentDogfightShipped-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node tools/ship/tournamentDogfightShipped-selfcheck.mjs      (~170 s)
//
// THE COMMITTED TOURNAMENT, FLOWN AGAIN FROM THE FILES. tools/ship/dogfightTournament-record.json is what a note quotes: every shipped pilot against every other on the 120 tournament duels, from both seats, with the counts, edges, ratings, the checks on them and the seat biases. A record
// nobody can reproduce is a claim, so this gate loads the roster from the files in brain/, flies the whole round robin and the seat measurements again, and holds the record to them: the counts to the integer, the real numbers to 2e-6 (the record is rounded to 1e-6). A pilot's file retrained without
// the record being written again, or a league pilot's file added to the tree, turns it red BY NAME -- the record is the roster's, and the roster is the files'.
//
//   1  THE RECORD   parses; names the tournament set (TOURNAMENT_SET, 120 duels, seeds 4000..4119, duels only); lists exactly the pilots the files give (ids, files, hashes), in order
//   2  FLOWN AGAIN  every pair (counts exact; edge, standard error, z, means to 2e-6; kills, collisions and ground contacts exact), the ratings and their order, the field edges and their order, the cycles and the upsets, the stability rows, the seat biases
//   3  WHAT IT SAYS  the sentences a note may quote, derived from the record and held to it: the fruit fly trained to fight leads every other pilot at two paired standard errors or more; the order by rating and the order by score; whether they agree; how many duels the ratings needed
//
// SABOTAGE LOG -- (filled in below once run)
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as TD from "./tournamentDogfight.mjs";
import * as T from "../../brain/dogfightTournament.mjs";
import * as D from "../../brain/dogfightTask.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let fails = 0;
function ok(name, cond, detail) { console.log(`  ${cond ? "PASS" : "FAIL"}  ${name}${detail ? "   " + detail : ""}`); if (!cond) fails++; }
const sec = (t) => console.log("\n" + t);
const same = (a, b, tol = 2e-6) => (typeof a === "number" && typeof b === "number" ? Math.abs(a - b) <= tol : a === b);
/** Two JSON-able values equal: numbers within `tol`, everything else exactly; returns the first difference as a path, or null. */
function diff(a, b, where = "", tol = 2e-6) {
    if (typeof a === "number" && typeof b === "number") return same(a, b, tol) ? null : `${where}: ${a} vs ${b}`;
    if (Array.isArray(a) || Array.isArray(b)) { if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return `${where}: length ${a && a.length} vs ${b && b.length}`; for (let i = 0; i < a.length; i++) { const d = diff(a[i], b[i], `${where}[${i}]`, tol); if (d) return d; } return null; }
    if (a && b && typeof a === "object" && typeof b === "object") { const ka = Object.keys(a), kb = Object.keys(b); if (ka.join() !== kb.join()) return `${where}: keys ${ka.join()} vs ${kb.join()}`; for (const k of ka) { const d = diff(a[k], b[k], `${where}.${k}`, tol); if (d) return d; } return null; }
    return a === b ? null : `${where}: ${JSON.stringify(a)} vs ${JSON.stringify(b)}`;
}

console.log("tournamentDogfightShipped-selfcheck -- the committed tournament, flown again from the files\n");

const RECORD = path.join(ENG, "tools", "ship", "dogfightTournament-record.json");
sec("1. THE RECORD");
let rec = null;
try { rec = JSON.parse(fs.readFileSync(RECORD, "utf8")); } catch (e) { rec = null; }
ok("!! THE RECORD EXISTS AND PARSES (tools/ship/dogfightTournament-record.json; `node tools/ship/runDogfightTournament.mjs --record tools/ship/dogfightTournament-record.json` writes it)", rec !== null && Array.isArray(rec.pairs) && Array.isArray(rec.pilots) && Array.isArray(rec.ratings));
if (!rec) { console.log("\ntournamentDogfightShipped-selfcheck: 1 FAILED (no record)"); process.exit(1); }
const roster = TD.loadRoster();
ok("!! IT IS THE TOURNAMENT SET: TOURNAMENT_SET, 120 scenarios, duels, seeds 4000..4119, and the set in the tree is those 120 duels and nothing else", rec.set.name === "TOURNAMENT_SET" && rec.set.scenarios === 120 && rec.set.kind === "duel" && rec.set.seeds.join() === "4000,4119" && D.TOURNAMENT_SET.length === 120 && D.TOURNAMENT_SET.every((s, i) => s.kind === "duel" && s.seed === 4000 + i));
const mine = roster.pilots.map((p) => ({ id: p.id, label: p.label, file: p.file, hash: p.hash }));
const stale = rec.pilots.filter((p, i) => !mine[i] || mine[i].id !== p.id || mine[i].hash !== p.hash || mine[i].file !== p.file).map((p) => p.id), extra = mine.filter((p) => !rec.pilots.some((r) => r.id === p.id)).map((p) => p.id);
ok("!! THE RECORD'S PILOTS ARE THE FILES' PILOTS, in order, with the hashes the files have now: a pilot whose file was retrained since the record was written, or a league file that has appeared, is named here and the record is to be written again", stale.length === 0 && extra.length === 0 && rec.pilots.length === mine.length, stale.length || extra.length ? `stale: ${stale.join(", ") || "-"}; not in the record: ${extra.join(", ") || "-"}` : rec.pilots.map((p) => p.id + (p.hash ? " " + p.hash : "")).join(", "));

sec("2. FLOWN AGAIN");
const t0 = Date.now();
const flown = T.roundRobin(roster.pilots, D.TOURNAMENT_SET);
const seat = {}; for (const p of roster.pilots) seat[p.id] = T.seatBias(p, D.TOURNAMENT_SET);
const again = TD.recordOf(flown, roster.pilots, seat, { name: "TOURNAMENT_SET", lo: 4000, hi: 4119 });
console.log(`  ----  ${Object.keys(flown.pairs).length} pairs and ${roster.pilots.length} seat measurements flown in ${((Date.now() - t0) / 1000).toFixed(0)} s`);
{
    const pairDiffs = rec.pairs.map((p, i) => diff(p, again.pairs[i], `pair ${p.x}|${p.y}`)).filter(Boolean);
    ok("!! EVERY PAIR IS THE SAME WHEN FLOWN AGAIN: the wins, draws, losses, kills, collisions and ground contacts to the integer; the edge, standard error, z and mean scores to 2e-6", rec.pairs.length === again.pairs.length && pairDiffs.length === 0, pairDiffs[0] || `${rec.pairs.length} pairs, ${rec.pairs.reduce((s, p) => s + p.fights, 0)} fights`);
    ok("!! THE RATINGS ARE THE SAME, AND IN THE SAME ORDER", diff(rec.ratings, again.ratings, "ratings") === null && rec.converged === true && again.converged === true, diff(rec.ratings, again.ratings, "ratings") || rec.ratings.map((r) => `${r.id} ${r.rating.toFixed(1)}`).join(", "));
    ok("!! THE FIELD EDGES ARE THE SAME, AND IN THE SAME ORDER", diff(rec.fieldEdge, again.fieldEdge, "fieldEdge") === null, diff(rec.fieldEdge, again.fieldEdge, "fieldEdge") || rec.fieldEdge.map((r) => `${r.id} ${r.edge.toFixed(3)}`).join(", "));
    ok("!! THE CHECKS ARE THE SAME: the cycles (none, or named), the leads against the rating, and the stability rows (how far the ratings move when fitted on the first 10, 20, 40, 80 duels)", diff(rec.cycles, again.cycles, "cycles") === null && diff(rec.upsets, again.upsets, "upsets") === null && diff(rec.stability, again.stability, "stability") === null, diff(rec.stability, again.stability, "stability") || diff(rec.upsets, again.upsets, "upsets") || "");
    ok("!! THE SEAT BIASES ARE THE SAME (every pilot against itself over the 120 duels)", diff(rec.seat, again.seat, "seat") === null, diff(rec.seat, again.seat, "seat") || Object.entries(rec.seat).map(([id, s]) => `${id} ${s.mean.toFixed(3)}`).join(", "));
    ok("the whole record is the re-flown one, key for key (nothing in the file that the flight does not make, nothing the flight makes that the file lacks)", diff(rec, again, "record") === null, diff(rec, again, "record") || "");
}

sec("3. WHAT IT SAYS");
{
    const at = (x, y) => rec.pairs.find((p) => p.x === x && p.y === y) || (() => { const q = rec.pairs.find((p) => p.x === y && p.y === x); return q ? { ...q, edge: -q.edge, z: typeof q.z === "number" ? -q.z : q.z } : null; })();
    const others = rec.pilots.map((p) => p.id).filter((id) => id !== "flyDogfight");
    ok("!! THE FRUIT FLY TRAINED TO FIGHT LEADS EVERY OTHER PILOT, each at two paired standard errors or more (edge over the autopilot, over the fruit fly trained to fly, over the GPU Brain trained to fly and to fight)", others.length >= 4 && others.every((id) => { const p = at("flyDogfight", id); return p && p.edge > 0 && (p.z === "Infinity" || p.z >= 2); }), others.map((id) => `${id} ${at("flyDogfight", id).edge.toFixed(3)} (z ${at("flyDogfight", id).z})`).join(", "));
    const byRating = rec.ratings.map((r) => r.id), byEdge = rec.fieldEdge.map((r) => r.id);
    ok("!! THE ORDER BY RATING AND THE ORDER BY SCORE, as a note may quote them: by rating flyDogfight, gpuFlight, gpuDogfight, autopilot, flyFlight; by mean edge against the field flyDogfight, gpuDogfight, gpuFlight, autopilot, flyFlight -- THEY DISAGREE on the two GPU pilots, the GPU pilot trained to fight leading the one trained to fly by 0.203 (z 3.9) on score while winning fewer fights outright, and the record lists it as the one lead that runs against the rating", byRating.join() === "flyDogfight,gpuFlight,gpuDogfight,autopilot,flyFlight" && byEdge.join() === "flyDogfight,gpuDogfight,gpuFlight,autopilot,flyFlight" && rec.upsets.length === 1 && rec.upsets[0].lower === "gpuDogfight" && rec.upsets[0].higher === "gpuFlight" && Math.abs(rec.upsets[0].edge - 0.203082) < 2e-6 && rec.cycles.length === 0, `${byRating.join(" > ")} | ${byEdge.join(" > ")}`);
    const ground = (id) => rec.pairs.reduce((s, p) => s + (p.x === id ? p.groundX : 0) + (p.y === id ? p.groundY : 0), 0), collisions = rec.pairs.reduce((s, p) => s + p.collisions, 0);
    ok("!! THE TAILS A NOTE MAY QUOTE: the fruit fly trained to FLY ends 136 of its 960 fights on the ground (44 against the fruit fly trained to fight, 92 against the GPU Brain trained to fly), the fruit fly trained to FIGHT 26 of its 960 (4 against the fruit fly trained to fly, 15 against the GPU Brain trained to fly, 7 against the one trained to fight), the GPU Brain trained to fly 3, the one trained to fight and the autopilot none; 14 of the 2,400 fights end in a collision", ground("flyFlight") === 136 && ground("flyDogfight") === 26 && ground("gpuFlight") === 3 && ground("gpuDogfight") === 0 && ground("autopilot") === 0 && rec.pairs.find((p) => p.x === "flyFlight" && p.y === "flyDogfight").groundX === 44 && rec.pairs.find((p) => p.x === "flyFlight" && p.y === "gpuFlight").groundX === 92 && rec.pairs.find((p) => p.x === "flyDogfight" && p.y === "gpuFlight").groundX === 15 && rec.pairs.find((p) => p.x === "flyDogfight" && p.y === "gpuDogfight").groundX === 7 && collisions === 14, `ground: ${rec.pilots.map((p) => p.id + " " + ground(p.id)).join(", ")}; collisions ${collisions}`);
    const st = rec.stability;
    ok("!! HOW MANY DUELS THE RATINGS NEEDED: fitted on the first 10 duels the order of the five is NOT the order of the 120 and a pilot's rating is up to 32 Elo off; from 20 duels on the order is the same, and the shift falls to 23, 19 and 11 Elo at 20, 40 and 80", st.length === 4 && st[0].sameOrder === false && st.slice(1).every((s) => s.sameOrder) && Math.abs(st[0].maxShift - 31.925089) < 2e-6 && Math.abs(st[3].maxShift - 11.276418) < 2e-6 && st.every((s, i) => i === 0 || s.maxShift < st[i - 1].maxShift));
    const sb = rec.seat;
    ok("!! THE SEATS: the autopilot and both fruit fly pilots show no seat advantage (under one and a half standard errors of 0 in 120 duels against themselves) while both GPU pilots do -- seat A scores 0.18 +- 0.08 and 0.22 +- 0.11 per fight over seat B, about two standard errors each -- which the matchups cancel by flying every duel from both seats", ["autopilot", "flyFlight", "flyDogfight"].every((id) => Math.abs(sb[id].mean) < 1.5 * sb[id].se) && ["gpuFlight", "gpuDogfight"].every((id) => sb[id].mean > 0 && sb[id].mean > 2 * sb[id].se) && Math.abs(sb.gpuFlight.mean - 0.17906) < 2e-6 && Math.abs(sb.gpuDogfight.mean - 0.221175) < 2e-6);
}

console.log(fails ? `\ntournamentDogfightShipped-selfcheck: ${fails} FAILED` : "\ntournamentDogfightShipped-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
