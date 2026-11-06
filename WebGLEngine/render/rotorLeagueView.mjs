// WebGLEngine/render/rotorLeagueView.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// WHAT rotor-league.html SHOWS OF brain/rotorLeague.mjs, AS PURE FUNCTIONS: the roster the page offers (the board's pilots for a rotorcraft, from whatever weight files loaded), the head-to-head matrix of a league as rows of cells in rating order, and the rating bars. A gate holds all of it without a browser;
// the page only wires the buttons and draws what these return. A pilot flies alone here: a cell is "scenarios X won - drew - lost against Y", compared by score, and the page says so.
"use strict";
import * as RB from "../brain/rotorcraftBoard.mjs";
import * as L from "../brain/rotorLeague.mjs";

/** The pilots the page offers for a rotorcraft ("rotor" or "drone"), from the parsed weight files { fly, mlp, mlpV2 } (each an array of weights, each optional): [{ id, label, note }] in the board's order; the ones that need a file are there only if it loaded. */
export function roster(which, weights = {}) {
    if (!RB.TASKS[which]) throw new Error(`rotorLeagueView.roster: unknown rotorcraft "${which}" (${Object.keys(RB.TASKS).join(", ")})`);
    const arms = which === "rotor" ? RB.rotorArms(weights) : RB.droneArms(weights), by = Object.fromEntries(arms.map((a) => [a.id, a]));
    return RB.ARM_IDS[which].filter((id) => by[id]).map((id) => ({ id, label: id, note: by[id].note }));
}

/**
 * A league as rows of cells in rating order (best first): { order, fit, rows: [{ id, rating, cells: [{ id (the column), text ("5-1-0": X won 5, drew 1, lost 0 against the column's pilot; "" on the diagonal), reading ("BEATS" | "IS BELOW" | "TIES" | ""), p, edge, z, tone ("win" | "loss" | "even" | "self") }] }] }.
 * `result` is rotorLeague.roundRobin's. A cell is X's record from X's side (the flip of a pair that was formed the other way round); its tone is the league's own reading.
 */
export function matrixModel(result) {
    const fit = L.ratingOf(result), order = fit.order;
    const rows = order.map((x) => ({ id: x, rating: fit.rating[x], cells: order.map((y) => {
        if (x === y) return { id: y, text: "", reading: "", p: 1, edge: 0, z: 0, tone: "self" };
        const direct = result.pairs[`${x}|${y}`], s = direct ? direct.summary : null, back = result.pairs[`${y}|${x}`];
        const sum = s || (back ? { ...back.summary, winsX: back.summary.winsY, winsY: back.summary.winsX, edge: -back.summary.edge, z: -back.summary.z } : null);
        if (!sum) return { id: y, text: "?", reading: "", p: 1, edge: 0, z: 0, tone: "even" };
        const reading = L.readingOf(sum);
        return { id: y, text: `${sum.winsX}-${sum.draws}-${sum.winsY}`, reading, p: L.signP(sum.winsX, sum.winsY), edge: sum.edge, z: sum.z, tone: reading === "BEATS" ? "win" : reading === "IS BELOW" ? "loss" : "even" };
    }) }));
    return { order, fit, rows };
}

/** The rating bars: [{ id, rating, width (0..100, the lowest rating is 0 and the highest 100; all equal is 100 each), negative }] in rating order. */
export function barsModel(fit) {
    const ids = fit.order, lo = Math.min(...ids.map((id) => fit.rating[id])), hi = Math.max(...ids.map((id) => fit.rating[id])), span = hi - lo;
    return ids.map((id) => ({ id, rating: fit.rating[id], width: span > 0 ? 100 * (fit.rating[id] - lo) / span : 100, negative: fit.rating[id] < 0 }));
}

/** The three leagues of a board result's runs for the page: { all, standing, failure } each { result, matrix, bars, lines }; a league that cannot be formed (no scenario of its kinds) is null. */
export function leaguesOf(which, runs, margin = L.DECISIVE) {
    const out = {};
    for (const lg of L.LEAGUES) { try { const result = L.roundRobin(which, runs, lg, margin), m = matrixModel(result); out[lg] = { result, matrix: m, bars: barsModel(m.fit), lines: L.leagueLines(which, result, L.fitOf(result)) }; } catch (e) { out[lg] = null; } }
    return out;
}
