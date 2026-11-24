// WebGLEngine/brain/rotorLeague.mjs -- UNNUMBERED (the version is chosen at ship time; the registration is brain/ROTOR_LEAGUE_WIP.md, the command tools/ship/takeRotorLeague.mjs, the page rotor-league.html, the gate brain/rotorLeague-selfcheck.mjs)
//
// THE HELICOPTER AND QUADROTOR PILOTS IN A LEAGUE: every pilot of the board (brain/rotorcraftBoard.mjs) against every other, on the same scenarios, rated. A rotorcraft does not fight another: each pilot flies ALONE in its own copy of the scenario, so a "fight" here is ONE scenario flown by X and by Y and
// COMPARED BY SCORE: X wins if its score is above Y's by more than the margin (DECISIVE), loses if below by more, draws otherwise. There are no seats and no interaction; this is a different way of counting the flights the board averages -- by scenarios won, which a few lost flights with a large score
// cannot dominate -- and it gives every pilot against every pilot (not only against the hand pilot and the floor), a Bradley-Terry rating and a matrix like the jets' and the boats' tournaments. It says so on its face (the page and every report line).
//   * Each pilot flies each scenario ONCE (n x s flights, not n^2 x s): the board's own run. A pair is read off the two score lists.
//   * The round robin has the SHAPE of brain/dogfightTournament.mjs's ({ ids, scenarios, pairs: { "x|y": { summary } } }) and that module's `ratings`, `against`, `flip`, `fieldEdges`, `rankOf`, `transitivity` and `upsets` are reused, not copied; the summary has ONE fight a scenario (fights = scenarios), which is what
//     the rating's game counts need.
//   * THREE LEAGUES from the same flights: ALL (every kind), STANDING (every kind but the failure kind: the helicopter's `engine`, the quadrotor's `motor`, which no quadrotor pilot survives) and FAILURE (that kind alone).
//   * THE READING OF A PAIR (the league's own): X BEATS Y iff X wins more than it loses AND the exact two-sided sign test on the decisive fights gives p <= 0.05; IS BELOW iff the mirror; else TIES. The edge (mean score difference) and its paired z, the other tournaments' reading, are printed beside it.
// THE MARGIN IS A CHOICE (0.01 of a score), made from the sizes of the differences in the two sets the board has read; the sensitivity is printed. Pure: no DOM, no clock, no Math.random, no file.
"use strict";
import * as DT from "./dogfightTournament.mjs";
import * as RB from "./rotorcraftBoard.mjs";

export const DECISIVE = 0.01, SENSITIVITY = Object.freeze([0.002, 0.05]), STABILITY_SIZES = Object.freeze([10, 20, 40]), P_BAR = 0.05, TWIN_EDGE = 1e-3, TWIN_DRAWS = 0.9;
export const LEAGUE_SETS = Object.freeze({ dev: Object.freeze({ first: 1, count: 3 }), held76: Object.freeze({ first: 8301, count: 40 }) });
export const LEAGUES = Object.freeze(["all", "standing", "failure"]);
const kindOf = (r) => r.key.split(":")[0];
const mean = (a) => a.reduce((s, x) => s + x, 0) / a.length;
const sdOf = (a) => { if (a.length < 2) return 0; const m = mean(a); return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1)); };

/** Which runs a league keeps: ALL every one, STANDING those that are not the rotorcraft's failure kind, FAILURE those that are. Refuses an unknown league or rotorcraft by name. */
export function keepOf(which, league) {
    if (!RB.TASKS[which]) throw new Error(`rotorLeague.keepOf: unknown rotorcraft "${which}" (${Object.keys(RB.TASKS).join(", ")})`);
    if (!LEAGUES.includes(league)) throw new Error(`rotorLeague.keepOf: unknown league "${league}" (${LEAGUES.join(", ")})`);
    const out = RB.TASKS[which].outKind;
    return league === "all" ? () => true : league === "standing" ? (r) => kindOf(r) !== out : (r) => kindOf(r) === out;
}

/** The exact two-sided sign test: the probability, under a fair coin, of a split at least as uneven as a against b (1 for no decisive fights). */
export function signP(a, b) {
    const n = a + b; if (n === 0) return 1;
    const k = Math.min(a, b); let tail = 0, term = Math.pow(0.5, n);   // the term for i = 0
    for (let i = 0; i <= k; i++) { tail += term; term = term * (n - i) / (i + 1); }
    return Math.min(1, 2 * tail);
}

/** One pair read off two score lists (the same scenarios in the same order): { n, fights, winsX, winsY, draws, edge, se, z, meanX, meanY, killsX, killsY, collisions, groundX, groundY } -- dogfightTournament's summary with ONE fight a scenario. */
export function summarize(sx, sy, margin = DECISIVE) {
    if (sx.length !== sy.length || !sx.length) throw new Error(`rotorLeague.summarize: ${sx.length} and ${sy.length} scores`);
    const n = sx.length, v = sx.map((x, i) => x - sy[i]), edge = mean(v), se = sdOf(v) / Math.sqrt(n);
    return { n, fights: n, winsX: v.filter((d) => d > margin).length, winsY: v.filter((d) => d < -margin).length, draws: v.filter((d) => Math.abs(d) <= margin).length, edge, se, z: se > 0 ? edge / se : (edge > 0 ? Infinity : edge < 0 ? -Infinity : 0), meanX: mean(sx), meanY: mean(sy), killsX: 0, killsY: 0, collisions: 0, groundX: 0, groundY: 0 };
}
/** The league's reading of a pair from X's side: "BEATS" iff X wins more than it loses and the sign test p <= P_BAR, "IS BELOW" iff the mirror, else "TIES". */
export function readingOf(s) { const p = signP(s.winsX, s.winsY); return s.winsX > s.winsY && p <= P_BAR ? "BEATS" : s.winsY > s.winsX && p <= P_BAR ? "IS BELOW" : "TIES"; }

/** A round robin from the board's runs ({ armId: [{ key, score, bad }] }, the same keys in the same order for every arm) for one league: { ids, scenarios, pairs, league, margin }, every pair i < j in roster order. */
export function roundRobin(which, runs, league = "all", margin = DECISIVE) {
    const ids = Object.keys(runs); if (ids.length < 2) throw new Error("rotorLeague.roundRobin: at least two pilots");
    const keep = keepOf(which, league), first = runs[ids[0]], idx = first.map((r, i) => i).filter((i) => keep(first[i]));
    if (!idx.length) throw new Error(`rotorLeague.roundRobin: the ${league} league has no scenario in these runs`);
    for (const id of ids) if (runs[id].length !== first.length || runs[id].some((r, i) => r.key !== first[i].key)) throw new Error(`rotorLeague.roundRobin: ${id} did not fly the same scenarios in the same order as ${ids[0]}`);
    const pairs = {};
    for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) pairs[`${ids[i]}|${ids[j]}`] = { x: ids[i], y: ids[j], summary: summarize(idx.map((k) => runs[ids[i]][k].score), idx.map((k) => runs[ids[j]][k].score), margin) };
    return { ids, scenarios: idx.length, pairs, league, margin };
}
/** The rating of a round robin: { rating, iterations, converged, order }, the Bradley-Terry fit on the Elo scale (differences are what mean something) and the ids best first. It needs no complete table (a missing pair is left out of the fit). */
export function ratingOf(result) { const fit = DT.ratings(result); return { ...fit, order: DT.rankOf(fit, result.ids) }; }
/** The rating plus each pilot's mean edge against the rest (a complete round robin, which roundRobin makes): { rating, order, edges, ... }. */
export function fitOf(result) { return { ...ratingOf(result), edges: DT.fieldEdges(result) }; }

/**
 * The checks of a league's runs (brain/ROTOR_LEAGUE_WIP.md section 3): every pilot flew the same scenarios in the same order; no score is non-finite; hand-net against hand has an edge below TWIN_EDGE in size on STANDING and draws at least TWIN_DRAWS of ALL; zero is rated lowest in ALL and in STANDING;
 * the matrix is antisymmetric. Returns { ok, failures: [string] } -- a failure and the readings are NOT WEIGHED.
 */
export function checksOf(which, runs, margin = DECISIVE) {
    const ids = Object.keys(runs), failures = [], first = runs[ids[0]];
    for (const id of ids) {
        if (runs[id].length !== first.length || runs[id].some((r, i) => r.key !== first[i].key)) failures.push(`${id} did not fly the same scenarios in the same order as ${ids[0]}`);
        if (runs[id].some((r) => !Number.isFinite(r.score))) failures.push(`${id} has a non-finite score`);
    }
    if (failures.length) return { ok: false, failures };
    const all = roundRobin(which, runs, "all", margin), standing = roundRobin(which, runs, "standing", margin);
    if (runs.hand && runs["hand-net"]) {
        const s = DT.against(standing, "hand-net", "hand"), a = DT.against(all, "hand-net", "hand");
        if (!(Math.abs(s.edge) < TWIN_EDGE)) failures.push(`hand-net is not the hand pilot: its edge over hand on the standing kinds is ${s.edge.toExponential(2)} (the limit is ${TWIN_EDGE})`);
        if (!(a.draws >= TWIN_DRAWS * a.fights)) failures.push(`hand-net draws only ${a.draws} of ${a.fights} fights against hand (at least ${Math.ceil(TWIN_DRAWS * a.fights)} are required)`);
    }
    if (runs.zero) for (const [name, lg] of [["ALL", all], ["STANDING", standing]]) { const o = fitOf(lg).order; if (o[o.length - 1] !== "zero") failures.push(`zero is not rated lowest in ${name} (the last is ${o[o.length - 1]})`); }
    for (const lg of [all, standing]) for (const x of lg.ids) for (const y of lg.ids) if (x !== y) { const a = DT.against(lg, x, y), b = DT.flip(DT.against(lg, y, x)); if (a.winsX !== b.winsX || a.winsY !== b.winsY || a.draws !== b.draws || a.edge !== b.edge) { failures.push(`the ${lg.league} matrix is not antisymmetric at ${x} against ${y}`); break; } }
    return { ok: failures.length === 0, failures };
}

/** The rating refit on the first `n` scenarios of each kind (n in `sizes`, n <= the scenarios a kind has): [{ n, order, maxShift, sameOrder }] against the fit to all of them. */
export function stability(which, runs, league = "all", margin = DECISIVE, sizes = STABILITY_SIZES) {
    const ids = Object.keys(runs), first = runs[ids[0]], kinds = [...new Set(first.map(kindOf))], perKind = first.filter((r) => kindOf(r) === kinds[0]).length;
    const full = fitOf(roundRobin(which, runs, league, margin));
    return sizes.filter((n) => n >= 1 && n <= perKind).map((n) => {
        const seen = {}, take = first.map((r) => { const k = kindOf(r); seen[k] = (seen[k] || 0) + 1; return seen[k] <= n; });
        const sub = Object.fromEntries(ids.map((id) => [id, runs[id].filter((r, i) => take[i])])), fit = fitOf(roundRobin(which, sub, league, margin));
        return { n, order: fit.order, maxShift: Math.max(...ids.map((id) => Math.abs(fit.rating[id] - full.rating[id]))), sameOrder: fit.order.join() === full.order.join() };
    });
}

const sgn = (x, d = 4) => (x >= 0 ? "+" : "") + x.toFixed(d);
const zText = (z) => (Number.isFinite(z) ? z.toFixed(2) : String(z));
/** The lines of a league: the title (which says the fights are not fights), the ratings in order, every pair in roster order with its reading, the transitivity and upset reports. */
export function leagueLines(which, result, fit = fitOf(result)) {
    const title = `${which} league ${result.league.toUpperCase()}: ${result.ids.length} pilots, ${result.scenarios} scenarios, margin ${result.margin} (a pilot flies alone: a fight is one scenario compared by score)`, L = [title];
    fit.order.forEach((id, i) => L.push(`  ${String(i + 1).padStart(2)}. ${id.padEnd(8)} rating ${sgn(fit.rating[id], 1)} Elo, mean edge against the rest ${sgn(fit.edges[id])}`));
    for (let i = 0; i < result.ids.length; i++) for (let j = i + 1; j < result.ids.length; j++) {
        const s = result.pairs[`${result.ids[i]}|${result.ids[j]}`].summary;
        L.push(`  ${result.ids[i]} against ${result.ids[j]}: ${readingOf(s)} (wins ${s.winsX} draws ${s.draws} losses ${s.winsY}; sign p ${signP(s.winsX, s.winsY).toFixed(4)}; edge ${sgn(s.edge)}, z ${zText(s.z)})`);
    }
    const tri = DT.transitivity(result), ups = DT.upsets(result, fit);
    L.push(`  cycles: ${tri.length ? tri.join("; ") : "none"}; upsets (a significant lead against the rating): ${ups.length ? ups.map((u) => `${u.lower} over ${u.higher}`).join("; ") : "none"}`);
    return L;
}
/** Every line of a read: the checks first (a failure marks the readings NOT WEIGHED), the three leagues, the stability of ALL, and the sensitivity (the margin moved: the order of ALL, printed, not weighed). */
export function readLines(which, runs, margin = DECISIVE) {
    const ck = checksOf(which, runs, margin), L = [];
    if (!ck.ok) for (const f of ck.failures) L.push(`CHECK FAILED -- the readings below are NOT WEIGHED: ${f}`);
    else L.push("checks: every pilot flew the same scenarios, no score is non-finite, hand-net is the hand pilot, zero is rated lowest, the matrix is antisymmetric");
    if (ck.failures.some((f) => /did not fly the same|non-finite/.test(f))) return L;
    for (const lg of LEAGUES) { try { L.push(...leagueLines(which, roundRobin(which, runs, lg, margin))); } catch (e) { L.push(`the ${lg} league could not be formed: ${e.message}`); } }
    for (const st of stability(which, runs, "all", margin)) L.push(`  stability, first ${st.n} of each kind: ${st.sameOrder ? "the same order" : "a different order"} (${st.order.join(" > ")}), the largest rating shift ${st.maxShift.toFixed(1)} Elo`);
    for (const m of SENSITIVITY) L.push(`  sensitivity, margin ${m} (printed, not weighed): ALL order ${fitOf(roundRobin(which, runs, "all", m)).order.join(" > ")}`);
    return L;
}
