// WebGLEngine/brain/dogfightTournament.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// EVERY PILOT AGAINST EVERY OTHER, ON THE SAME FIGHTS, FROM BOTH SEATS. brain/dogfightTask.mjs grades a pilot against ONE opponent, the PD autopilot, and that is all any trainer in this tree has ever reported: "beats the autopilot" is the only bar a learned pilot has cleared, and it says nothing about
// how the fruit fly's and the GPU Brain's pilots compare with EACH OTHER. This is the other half: a round robin whose every fight is a DUEL (the only scenario in which the opponent hunts and shoots, so the only one two pilots under test can be put in), flown by both pilots from BOTH seats, with the numbers that
// make a ranking worth reading and the ones that say when it is not.
//
//   * A FIGHT is brain/dogfightTask.mjs's duel() with `pilotB`: seat A's pilot and seat B's pilot are each pursuit guidance and a hand trigger rule around the pilot under test, and each is scored from its own seat (duel() returns `score` for A and `scoreB` for B, one formula, sideScore()).
//   * A MATCHUP is one scenario flown TWICE, once with X in seat A and once with Y (the seats are not the same: A starts 80..220 m to one side and the geometry is drawn from A's frame), so a seat's advantage CANCELS in the pair's numbers and is MEASURED separately (seatBias()).
//   * THE EDGE of X over Y is the mean of (X's score - Y's score) over the fights: exactly antisymmetric (edge(Y, X) = -edge(X, Y), to the bit), exactly 0 for a pilot against itself, and the PAIRED standard error is taken over the scenarios (a scenario's two fights are one observation: the geometry's own difficulty cancels).
//     Its scale: one net hit is 0.1; a kill by one side with the other untouched is 2.0 plus the bonus.
//   * WHO WON A FIGHT is the side whose score is higher by more than DECISIVE (0.05: less than one net hit is a draw); the table counts wins, draws and losses of the pilot in the row against the pilot in the column.
//   * THE RATING is a Bradley-Terry fit to those counts (a draw is half a win each side), regularised by ONE drawn game against a phantom pilot of strength 1 (without it a pilot that never loses has an infinite strength), on the Elo scale (400 log10 of the strength): read DIFFERENCES, the zero is the phantom's.
//     It is a summary of the counts and it is only as good as the counts are transitive: transitivity() lists the triples X > Y > Z > X in which every one of the three leads is at least MIN_Z paired standard errors, and upsets() lists the pairs whose lead runs AGAINST the rating -- a brain that beats the champion and
//     loses to the hand rule is a finding, not a bug.
//   * HOW MANY SCENARIOS THE RATINGS NEED is measured, not assumed: stability() refits on the first n scenarios for several n and says how far each pilot's rating moves from the fit to all of them.
//
// Pure: no DOM, no clock, no Math.random, no file access (tools/ship/tournamentDogfight.mjs loads the shipped pilots and writes the record). A pilot here is { id, fn } with fn (state, target, wind) -> controls, exactly what duel() flies.
"use strict";
import * as D from "./dogfightTask.mjs";

export const DECISIVE = 0.05;      // a fight is won by the side whose score is above the other's by more than this (one net hit is 0.1, so a fight with equal hits is a draw)
export const MIN_Z = 2;            // a lead is called a lead at this many paired standard errors
export const PRIOR_GAMES = 1;      // the regularising game against the phantom, drawn
const ELO = 400 / Math.LN10;

const fmt = (x, d = 3) => { const t = x.toFixed(d); return /^-0\.?0*$/.test(t) ? t.slice(1) : t; };   // no "-0.000"
const mean = (xs) => xs.reduce((s, x) => s + x, 0) / xs.length;
const sdOf = (xs) => { if (xs.length < 2) return 0; const m = mean(xs); return Math.sqrt(xs.reduce((s, x) => s + (x - m) ** 2, 0) / (xs.length - 1)); };

/** One scenario flown twice: X in seat A, then X in seat B. Returns two records of how it went from X's side: { seed, seat ("A" | "B"), sx, sy (the two scores), statusX, statusY, xKilledY, yKilledX, ticks }. */
export function fightPair(x, y, sc, opts = {}) {
    const a = D.duel(x.fn, sc, { ...opts, pilotB: y.fn }), b = D.duel(y.fn, sc, { ...opts, pilotB: x.fn });
    return [
        { seed: sc.seed, seat: "A", sx: a.score, sy: a.scoreB, statusX: a.statusA, statusY: a.statusB, xKilledY: a.killedB !== null, yKilledX: a.killedA !== null, ticks: a.ticks },
        { seed: sc.seed, seat: "B", sx: b.scoreB, sy: b.score, statusX: b.statusB, statusY: b.statusA, xKilledY: b.killedA !== null, yKilledX: b.killedB !== null, ticks: b.ticks },
    ];
}

/**
 * What a list of fightPair() records says (two per scenario, in scenario order): { n (scenarios), fights, winsX, winsY, draws, edge, se, z, meanX, meanY, killsX, killsY, collisions, groundX, groundY }.
 * `edge` is the mean over scenarios of the scenario's two fights' mean of (sx - sy); `se` the standard error of those n values; `z` = edge / se (+-Infinity when se is 0 and the edge is not).
 */
export function summarize(fights) {
    if (!fights.length || fights.length % 2) throw new Error(`summarize(): ${fights.length} fights (two per scenario expected)`);
    const n = fights.length / 2, v = [];
    for (let i = 0; i < n; i++) v.push(((fights[2 * i].sx - fights[2 * i].sy) + (fights[2 * i + 1].sx - fights[2 * i + 1].sy)) / 2);
    const edge = mean(v), se = sdOf(v) / Math.sqrt(n);
    const lead = (f) => f.sx - f.sy;
    return { n, fights: fights.length, winsX: fights.filter((f) => lead(f) > DECISIVE).length, winsY: fights.filter((f) => lead(f) < -DECISIVE).length, draws: fights.filter((f) => Math.abs(lead(f)) <= DECISIVE).length,
        edge, se, z: se > 0 ? edge / se : (edge > 0 ? Infinity : edge < 0 ? -Infinity : 0), meanX: mean(fights.map((f) => f.sx)), meanY: mean(fights.map((f) => f.sy)),
        killsX: fights.filter((f) => f.xKilledY).length, killsY: fights.filter((f) => f.yKilledX).length, collisions: fights.filter((f) => f.statusX === "collided").length,
        groundX: fights.filter((f) => ["crashed", "touchdown", "lost"].includes(f.statusX)).length, groundY: fights.filter((f) => ["crashed", "touchdown", "lost"].includes(f.statusY)).length };
}

/** The same summary from the other pilot's side (X and Y swapped): exactly antisymmetric in the edge. */
export function flip(s) {
    return { ...s, winsX: s.winsY, winsY: s.winsX, edge: -s.edge, z: -s.z, meanX: s.meanY, meanY: s.meanX, killsX: s.killsY, killsY: s.killsX, groundX: s.groundY, groundY: s.groundX };
}

/** X against Y on a set of scenarios (each flown from both seats): { x, y, fights (the records), summary }. */
export function matchup(x, y, set, opts = {}) {
    const fights = []; for (const sc of set) fights.push(...fightPair(x, y, sc, opts));
    return { x: x.id, y: y.id, fights, summary: summarize(fights) };
}

/**
 * The round robin: every pair i < j of `pilots` over `set`. Returns { ids, set (the scenario count), pairs: { "x|y": matchup } } for the pairs in roster order. `onPair(matchup, done, total)` reports progress.
 * Two pilots may not share an id (a table keyed by ids would silently merge them).
 */
export function roundRobin(pilots, set, opts = {}, onPair = null) {
    const ids = pilots.map((p) => p.id); if (new Set(ids).size !== ids.length) throw new Error(`roundRobin(): duplicate pilot id in ${ids.join(", ")}`);
    if (pilots.length < 2) throw new Error("roundRobin(): at least two pilots");
    const pairs = {}, total = pilots.length * (pilots.length - 1) / 2; let done = 0;
    for (let i = 0; i < pilots.length; i++) for (let j = i + 1; j < pilots.length; j++) { const m = matchup(pilots[i], pilots[j], set, opts); pairs[`${ids[i]}|${ids[j]}`] = m; if (onPair) onPair(m, ++done, total); }
    return { ids, scenarios: set.length, pairs };
}

/** The summary of X against Y out of a round robin, from X's side whichever way the pair was flown (null if it was not). */
export function against(result, x, y) {
    const direct = result.pairs[`${x}|${y}`]; if (direct) return direct.summary;
    const back = result.pairs[`${y}|${x}`]; return back ? flip(back.summary) : null;
}

/**
 * The Bradley-Terry fit: strengths p_i with P(i beats j) = p_i / (p_i + p_j), found by the minorise-maximise iteration on the win counts (a draw is half a win each side), with PRIOR_GAMES drawn games against a phantom of strength 1.
 * `summaryOf(x, y)` gives the counts (default: `against` the result). Returns { rating: { id: Elo-scale rating }, iterations, converged }. Pure and deterministic.
 */
export function ratings(result, { summaryOf = null, tol = 1e-12, maxIter = 100000, prior = PRIOR_GAMES } = {}) {
    const ids = result.ids, get = summaryOf || ((x, y) => against(result, x, y)), n = ids.length;
    const W = ids.map(() => prior / 2), games = ids.map(() => Array(n).fill(0));
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) if (i !== j) { const s = get(ids[i], ids[j]); if (!s) continue; W[i] += s.winsX + s.draws / 2; games[i][j] = s.fights; }
    let p = ids.map(() => 1), iterations = 0, converged = false;
    for (; iterations < maxIter; iterations++) {
        const next = p.map((pi, i) => { let d = prior / (pi + 1); for (let j = 0; j < n; j++) if (j !== i && games[i][j]) d += games[i][j] / (pi + p[j]); return W[i] / d; });
        const shift = Math.max(...next.map((q, i) => Math.abs(Math.log(q) - Math.log(p[i]))));
        p = next; if (shift < tol) { converged = true; iterations++; break; }
    }
    const rating = {}; ids.forEach((id, i) => { rating[id] = ELO * Math.log(p[i]); });
    return { rating, iterations, converged };
}

/**
 * Each pilot's MEAN EDGE against the rest of the field: the average of its pairwise edges, the SCORE-based order. The rating counts fights won by more than one net hit and a pilot that wins many fights by one hit and loses a few by many rates higher on counts and lower on score;
 * the two are reported side by side and `upsets()` names the pairs where they part. Returns { id: mean edge }.
 */
export function fieldEdges(result) {
    const out = {}; for (const x of result.ids) out[x] = mean(result.ids.filter((y) => y !== x).map((y) => against(result, x, y).edge));
    return out;
}

/** The ids ordered by rating, best first (ties by roster order). */
export const rankOf = (fit, ids) => ids.map((id, i) => ({ id, i })).sort((a, b) => fit.rating[b.id] - fit.rating[a.id] || a.i - b.i).map((x) => x.id);

/** Does X lead Y at MIN_Z paired standard errors? */
const leads = (result, x, y) => { const s = against(result, x, y); return !!s && s.edge > 0 && s.z >= MIN_Z; };

/** The triples with a significant lead all the way round: ["a > b > c > a", ...] (each cycle once, starting from its first pilot in roster order). */
export function transitivity(result) {
    const ids = result.ids, out = [];
    for (let i = 0; i < ids.length; i++) for (let j = 0; j < ids.length; j++) for (let k = 0; k < ids.length; k++) {
        if (i === j || j === k || i === k || i > j || i > k) continue;
        if (leads(result, ids[i], ids[j]) && leads(result, ids[j], ids[k]) && leads(result, ids[k], ids[i])) out.push(`${ids[i]} > ${ids[j]} > ${ids[k]} > ${ids[i]}`);
    }
    return out;
}

/** The pairs whose significant lead runs AGAINST the rating: [{ lower, higher, edge, z }] where `lower` (the lower-rated pilot) leads `higher` by MIN_Z standard errors. */
export function upsets(result, fit) {
    const out = [], ids = result.ids;
    for (const x of ids) for (const y of ids) if (x !== y && fit.rating[x] < fit.rating[y] && leads(result, x, y)) { const s = against(result, x, y); out.push({ lower: x, higher: y, edge: s.edge, z: s.z }); }
    return out;
}

/**
 * HOW MANY SCENARIOS THE RATINGS NEED: the fit refitted on the first n scenarios of every matchup, for each n in `sizes` (n <= the scenarios flown). Returns [{ n, rating, order, maxShift (the largest |rating - the fit to all of them|, Elo points), sameOrder (the order is the full fit's) }].
 */
export function stability(result, sizes) {
    const full = ratings(result), order = rankOf(full, result.ids), N = result.scenarios;
    return sizes.filter((n) => n >= 1 && n <= N).map((n) => {
        const sub = (x, y) => { const p = result.pairs[`${x}|${y}`]; if (p) return summarize(p.fights.slice(0, 2 * n)); const q = result.pairs[`${y}|${x}`]; return q ? flip(summarize(q.fights.slice(0, 2 * n))) : null; };
        const fit = ratings(result, { summaryOf: sub }), ord = rankOf(fit, result.ids);
        return { n, rating: fit.rating, order: ord, maxShift: Math.max(...result.ids.map((id) => Math.abs(fit.rating[id] - full.rating[id]))), sameOrder: ord.join() === order.join() };
    });
}

/** A pilot against ITSELF over a set, both seats: { n, mean (seat A's score minus seat B's, per fight), se, z } -- the seat's advantage, which a matchup cancels and this measures. Positive: seat A is the better seat. */
export function seatBias(pilot, set, opts = {}) {
    const d = set.map((sc) => { const r = D.duel(pilot.fn, sc, { ...opts, pilotB: pilot.fn }); return r.score - r.scoreB; }), m = mean(d), se = sdOf(d) / Math.sqrt(d.length);
    return { n: d.length, mean: m, se, z: se > 0 ? m / se : (m > 0 ? Infinity : m < 0 ? -Infinity : 0) };
}

/** The report, as lines: the counts matrix, the edges, the ratings, the checks. `labels` maps id -> a name for the table. */
export function reportLines(result, { labels = {}, seat = {}, sizes = [10, 20, 40, 80] } = {}) {
    const ids = result.ids, name = (id) => labels[id] || id, fit = ratings(result), order = rankOf(fit, ids), f = fmt;
    const L = [`[dogfightTournament] ${ids.length} pilots, every pair over ${result.scenarios} duels flown from both seats (${result.scenarios * 2} fights a pair)`];
    L.push("  WINS-DRAWS-LOSSES of the row against the column (a fight is won by more than one net hit of score):");
    for (const x of ids) L.push(`    ${name(x).padEnd(34)} ${ids.map((y) => { if (x === y) return "   -   "; const s = against(result, x, y); return `${s.winsX}-${s.draws}-${s.winsY}`.padStart(9); }).join(" ")}`);
    L.push("  EDGE of the row over the column (mean score difference per fight +- paired standard error; one net hit is 0.1):");
    for (const x of ids) L.push(`    ${name(x).padEnd(34)} ${ids.map((y) => { if (x === y) return "        -        "; const s = against(result, x, y); return `${(f(s.edge)[0] === "-" ? "" : "+") + f(s.edge)}+-${f(s.se)}`.padStart(16); }).join(" ")}`);
    L.push(`  RATINGS (Bradley-Terry on the counts, Elo scale, zero = the regularising phantom; ${fit.converged ? "converged in " + fit.iterations + " iterations" : "NOT CONVERGED"}):`);
    for (const id of order) { const mine = ids.filter((o) => o !== id).map((o) => against(result, id, o)); L.push(`    ${f(fit.rating[id], 1).padStart(8)}  ${name(id).padEnd(34)} ${mine.reduce((s, m) => s + m.winsX, 0)}-${mine.reduce((s, m) => s + m.draws, 0)}-${mine.reduce((s, m) => s + m.winsY, 0)}  kills ${mine.reduce((s, m) => s + m.killsX, 0)}, shot down ${mine.reduce((s, m) => s + m.killsY, 0)}, collisions ${mine.reduce((s, m) => s + m.collisions, 0)}, to the ground ${mine.reduce((s, m) => s + m.groundX, 0)}`); }
    const fe = fieldEdges(result), byEdge = ids.map((id, i) => ({ id, i })).sort((a, b) => fe[b.id] - fe[a.id] || a.i - b.i).map((x) => x.id);
    L.push(`  MEAN EDGE AGAINST THE FIELD (the score-based order; the rating above counts won fights): ${byEdge.map((id) => `${name(id)} ${fe[id] >= 0 && f(fe[id])[0] !== "-" ? "+" : ""}${f(fe[id])}`).join(" > ")}; the two orders ${byEdge.join() === order.join() ? "AGREE" : "DISAGREE (" + order.join(" > ") + " by rating, " + byEdge.join(" > ") + " by edge)"}`);
    const cyc = transitivity(result), up = upsets(result, fit);
    L.push(`  TRANSITIVE? ${cyc.length ? "NO -- " + cyc.join("; ") : "no significant cycle (a lead of at least " + MIN_Z + " paired standard errors all the way round)"}; ${up.length ? "leads against the rating: " + up.map((u) => `${u.lower} over ${u.higher} (${f(u.edge)}, z ${f(u.z, 1)})`).join("; ") : "no significant lead runs against the rating"}`);
    const st = stability(result, sizes);
    for (const s of st) L.push(`  STABILITY on the first ${String(s.n).padStart(3)} scenarios: largest rating shift ${f(s.maxShift, 1)} Elo from the fit to all ${result.scenarios}; ${s.sameOrder ? "same order" : "order " + s.order.join(" > ")}`);
    for (const id of Object.keys(seat)) L.push(`  SEAT (${name(id)} against itself): seat A scores ${f(seat[id].mean)[0] === "-" ? "" : "+"}${f(seat[id].mean)} +- ${f(seat[id].se)} per fight over seat B (${f(seat[id].z, 1)} standard errors, ${seat[id].n} duels)`);
    return L;
}
