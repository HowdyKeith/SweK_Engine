// WebGLEngine/brain/subTournament.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// EVERY SUBMARINE SIDE AGAINST EVERY OTHER, ON THE SAME GEOMETRIES, FROM BOTH SEATS. brain/subDuel.mjs grades a side against ONE scripted drone (patrol, quiet, evader, hunter); the flight side has had a round robin of pilots against each other for a long time
// (brain/dogfightTournament.mjs) and the sea had none. This is it, built ON that module's own statistics rather than beside them: the duel is subDuel's (sonar, four torpedoes, 100 hit points, the same seats and the same score formula for either side, which subDuel's
// `opponent` option and scoreFor() exist for), and the pairing, the Bradley-Terry rating, the paired standard error, the transitivity and upset reports and the stability study are dogfightTournament's, imported and not copied.
//
//   * A SIDE is { id, side } where side() makes a FRESH { tactics, pilot } (the tactician has memory, so one per duel): the hand tactician with a theta (brain/subTactics.mjs) and a motion pilot -- the PD autopilot, or the connectome-wired network with its 963 weights.
//   * A FIGHT is one duel; a PAIR is one geometry flown TWICE, X in seat A and then in seat B (seat A starts with B within 60 degrees of its nose, so the seats are NOT equal: the pair cancels it and seatBias() measures it).
//   * THE SCORE of a seat is subDuel's: damage dealt less damage taken (per 100 hit points), +0.5 for sinking the other boat (and up to +0.5 more for doing it early), -0.5 for losing the boat to a torpedo or to the floor, the surface or the crush depth.
//   * WHO WON is the side whose score is higher by more than DECISIVE (0.05); the table counts wins, draws and losses; the rating is Bradley-Terry on the Elo scale (read DIFFERENCES); upsets() names the pairs whose lead runs AGAINST the rating.
//   * THE EXTRAS A SUB HAS: boats lost to the water and not to a torpedo (`floorX`, `floorY`: grounded, broached, crushed or lost), which dogfightTournament's `groundX` (its flight vocabulary: crashed, touchdown, lost) does not see.
//
// WHAT IT IS NOT: a ranking of brains. A side here is a tactician AND a motion pilot, and the tournament cannot say which of the two earned the result; roster() names both, and a ladder of single changes (the same tactician with each pilot, each tactician with the same pilot) is the way to ask.
// Pure: no DOM, no clock, no random, no file access (tools/ship/takeSubTournament.mjs and sub-tournament.html load the JSON and hand it in).
"use strict";
import * as D from "./subDuel.mjs";
import * as TA from "./subTactics.mjs";
import * as AS from "./autopilotSub.mjs";
import * as PS from "./pilotSubPolicy.mjs";
import * as DT from "./dogfightTournament.mjs";

export const { DECISIVE, MIN_Z, PRIOR_GAMES, summarize, flip, against, ratings, fieldEdges, rankOf, transitivity, upsets, stability } = DT;
export const WATER_FATES = Object.freeze(["grounded", "broached", "crushed", "lost"]);

/**
 * A side from a tactician theta and optionally network weights: { id, label, theta, weights, side }. `theta` null is the hand tactician's default; `weights` null is the PD autopilot, else the 963-weight network (a vector of any other
 * length is refused by name -- a tournament with a silently corrupt pilot is a tournament of the autopilot).
 */
export function makeSide(id, { theta = null, weights = null, label = "" } = {}) {
    if (weights && weights.length !== PS.WEIGHT_COUNT) throw new Error(`subTournament.makeSide(${id}): ${weights.length} weights, the network takes ${PS.WEIGHT_COUNT}`);
    const th = TA.clampTheta(theta || TA.THETA_DEFAULT), w = weights ? Float32Array.from(weights) : null;
    return { id, label: label || id, theta: th, weights: w, side: () => ({ tactics: TA.makeTactician(th), pilot: w ? PS.pilotFor(w) : AS.pilot() }) };
}

/** The scenarios of a tournament: `n` geometries of subDuel.scenario (the drone's kind only sets the other boat's start speed, and `quiet` starts it at 0.5, so every geometry here is `patrol`: 2 m/s for both). */
export const geometries = (n, first = 1) => Array.from({ length: n }, (_, i) => D.scenario(first + i, "patrol"));

/** One geometry flown twice: X in seat A, then in seat B. Two records from X's side in dogfightTournament's shape: { seed, seat, sx, sy, statusX, statusY, xKilledY, yKilledX, ticks }. */
export function fightPair(x, y, sc, opts = {}) {
    const seconds = opts.seconds || D.SECONDS;
    const a = D.duel(x.side(), sc, { ...opts, opponent: y.side() }), b = D.duel(y.side(), sc, { ...opts, opponent: x.side() });
    return [
        { seed: sc.seed, seat: "A", sx: a.score, sy: D.scoreFor(a, "B", seconds), statusX: a.fates[0], statusY: a.fates[1], xKilledY: a.fates[1] === "sunk", yKilledX: a.fates[0] === "sunk", ticks: a.ticks },
        { seed: sc.seed, seat: "B", sx: D.scoreFor(b, "B", seconds), sy: b.score, statusX: b.fates[1], statusY: b.fates[0], xKilledY: b.fates[0] === "sunk", yKilledX: b.fates[1] === "sunk", ticks: b.ticks },
    ];
}

/** dogfightTournament's summary of a list of records plus the water losses: { ...summarize(fights), floorX, floorY }. */
export function summary(fights) {
    const s = DT.summarize(fights);
    return { ...s, floorX: fights.filter((f) => WATER_FATES.includes(f.statusX)).length, floorY: fights.filter((f) => WATER_FATES.includes(f.statusY)).length };
}
/** The flip with the water losses swapped too. */
export const flipSummary = (s) => ({ ...DT.flip(s), floorX: s.floorY, floorY: s.floorX });

/** X against Y on a set of geometries (each flown from both seats): { x, y, fights, summary }. */
export function matchup(x, y, set, opts = {}) {
    const fights = []; for (const sc of set) fights.push(...fightPair(x, y, sc, opts));
    return { x: x.id, y: y.id, fights, summary: summary(fights) };
}

/** The round robin, every pair i < j in roster order: { ids, scenarios, pairs: { "x|y": matchup } }. `onPair(matchup, done, total)` reports progress. Duplicate ids and fewer than two sides are refused. */
export function roundRobin(sides, set, opts = {}, onPair = null) {
    const ids = sides.map((p) => p.id); if (new Set(ids).size !== ids.length) throw new Error(`subTournament.roundRobin(): duplicate side id in ${ids.join(", ")}`);
    if (sides.length < 2) throw new Error("subTournament.roundRobin(): at least two sides");
    const pairs = {}, total = sides.length * (sides.length - 1) / 2; let done = 0;
    for (let i = 0; i < sides.length; i++) for (let j = i + 1; j < sides.length; j++) { const m = matchup(sides[i], sides[j], set, opts); pairs[`${ids[i]}|${ids[j]}`] = m; if (onPair) onPair(m, ++done, total); }
    return { ids, scenarios: set.length, pairs };
}

/** How much a seat is worth: one side flown against ITSELF on every geometry, A's score less B's, averaged: { mean, se, n }. Zero would be a fair start; it is not (seat A has the other boat in its forward arc). */
export function seatBias(side, set, opts = {}) {
    const seconds = opts.seconds || D.SECONDS, v = set.map((sc) => { const r = D.duel(side.side(), sc, { ...opts, opponent: side.side() }); return r.score - D.scoreFor(r, "B", seconds); });
    const m = v.reduce((a, b) => a + b, 0) / v.length, sd = v.length > 1 ? Math.sqrt(v.reduce((a, b) => a + (b - m) ** 2, 0) / (v.length - 1)) : 0;
    return { mean: m, se: sd / Math.sqrt(v.length), n: v.length };
}

/** The table, ratings and notes as lines of text (what the tool prints and the page shows). */
export function reportLines(result, { labels = {} } = {}) {
    const fit = ratings(result, { summaryOf: (x, y) => { const s = result.pairs[`${x}|${y}`]; if (s) return s.summary; const q = result.pairs[`${y}|${x}`]; return q ? flipSummary(q.summary) : null; } }), order = rankOf(fit, result.ids), name = (id) => labels[id] || id;
    const sum = (x, y) => { const s = result.pairs[`${x}|${y}`]; if (s) return s.summary; const q = result.pairs[`${y}|${x}`]; return q ? flipSummary(q.summary) : null; };
    const L = [`[subTournament] ${result.ids.length} sides, ${result.scenarios} geometries, every pair from both seats (${result.scenarios * 2} duels a pair)`];
    L.push("  rank  rating  mean edge  side");
    const fe = {}; for (const x of result.ids) { const o = result.ids.filter((y) => y !== x).map((y) => sum(x, y).edge); fe[x] = o.reduce((a, b) => a + b, 0) / o.length; }
    order.forEach((id, i) => L.push(`  ${String(i + 1).padStart(4)}  ${fit.rating[id].toFixed(0).padStart(6)}  ${(fe[id] >= 0 ? "+" : "") + fe[id].toFixed(3)}      ${name(id)}`));
    L.push("  head to head (wins-draws-losses, edge +- paired se):");
    for (let i = 0; i < result.ids.length; i++) for (let j = i + 1; j < result.ids.length; j++) { const x = result.ids[i], y = result.ids[j], s = sum(x, y); L.push(`    ${name(x)} v ${name(y)}: ${s.winsX}-${s.draws}-${s.winsY}  edge ${(s.edge >= 0 ? "+" : "") + s.edge.toFixed(3)} +- ${s.se.toFixed(3)} (z ${Number.isFinite(s.z) ? s.z.toFixed(1) : s.z})`); }
    return L;
}
