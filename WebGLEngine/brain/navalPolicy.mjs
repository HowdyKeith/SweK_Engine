// FILE: brain/navalPolicy.mjs -- v4206
//
// A GUNNERY POLICY: which cell to shell next, and whether to LOB or fire FLAT.
//
// Same shape as brain/csTacticsPolicy.js -- a weight vector over a feature vector, scored linearly, served
// by the brain and learnable from outcomes. Deliberately not a second idiom: counter-strike.html already
// asks "which enemy does the brain shoot first?" and this asks "which water does the brain shell next?",
// which is the same question with a different board.
//
// *** WHAT MAKES IT MORE THAN A BATTLESHIP BOT IS THAT THE SHELLS ARE REAL. *** v4205 gave the tree
// physics/ballistics.mjs, and that turns two things that were flavour into decisions:
//
//   1. DISPERSION DEPENDS ON RANGE, AND NOT THE WAY ANYONE EXPECTS. A gun's aiming error is angular, and the
//      ground error it produces is dR/dtheta = 2 v^2 cos(2 theta) / g -- which is ZERO at 45 degrees, and 45
//      degrees is maximum range. So a gun is MOST accurate at the edge of its envelope and LEAST accurate up
//      close. MEASURED at v=100 in vacuum: 34.90 m per degree at 200 m, and 1.33 m per degree at 1019 m.
//      A 26x difference, favouring the long shot.
//
//   2. LOB AND FLAT SCATTER IDENTICALLY IN VACUUM AND DO NOT IN AIR. The two roots sit symmetrically about
//      45 degrees, so |dR/dtheta| is exactly equal for both -- MEASURED ratio 1.000. Add drag and the
//      symmetry breaks: at 100 m with drag 0.002 the lob scatters 14.36 m/deg against the flat shot's 26.96,
//      so THE LOB IS 47% TIGHTER, and the advantage fades with range (ratio 0.533 at 100 m, 0.956 at 440 m).
//      A policy that always fires flat is giving that away at close range.
//
// Neither fact is invented for the game. Both fall out of the ballistics module, and the gate measures them
// rather than asserting them.
"use strict";

import { launchAngles, maxRange, maxRangeDrag, flyShell, GRAVITY } from "../physics/ballistics.mjs";

/** Weight names. Mirrors csTacticsPolicy's W_KEYS/F_KEYS pairing so the brain can serve either. */
export const W_KEYS = Object.freeze(["wBias", "wDensity", "wHunt", "wParity", "wAim", "wFlight"]);
export const F_KEYS = Object.freeze(["reach", "density", "hunt", "parity", "aim", "flight"]);

/**
 * The hand policy: what a person would write down, then correct with an ablation.
 *
 * *** TWO OF THE SIX WEIGHTS ARE ZERO BECAUSE MEASUREMENT PUT THEM THERE, AND ONE OF THEM IS THE FEATURE
 * THIS WHOLE MODULE WAS BUILT AROUND. *** Ablating each feature against the full policy, 50-game blocks at
 * v=12.5 and aimError 2:
 *
 *     wDensity = 0   costs +26.8 salvos   REAL
 *     wHunt    = 0   costs +26.2 salvos   REAL
 *     wAim     = 0   costs  +1.4 salvos   within noise
 *     wParity  = 0   gains  -2.6 salvos   within noise
 *
 * The noise floor was measured first, by running the SAME policy against itself over six seed blocks: mean
 * 69.77 salvos, sd 2.31, so anything under about 4.6 salvos is nothing. Without that floor the aim and
 * parity numbers read like small real effects, and they are not.
 *
 * *** THE AIM FEATURE IS THE ONE I EXPECTED TO MATTER AND IT DOES NOT, AT ANY GUN QUALITY TESTED. *** It
 * scores a cell by how tightly the shell would land there, which is real physics and a real gradient across
 * this board. It loses to density and hunt by twenty-five salvos, because knowing WHERE THE SHIP PROBABLY IS
 * beats knowing where the shell will certainly go. Chasing accurate cells actively fights density: the
 * accurate cells are the far ones, and the far ones are the low-density back row.
 *
 * On a deliberately terrible gun (aimError 6) one 50-game block showed wAim=1.5 beating wAim=0 by 8.6
 * salvos, 6.4%. Across three blocks the mean is 0.8. THAT FIRST BLOCK IS EXACTLY THE NUMBER THAT WOULD HAVE
 * BEEN SHIPPED AS "the ballistics pays off" by anyone who ran the experiment once.
 *
 * The features are still computed and still exported, because the brain may find a use for them that a hand
 * weight cannot; what is not honest is a hand policy carrying a weight the evidence does not support.
 * wParity stays zero for a different reason: parity is a cheap SUBSTITUTE for density, not a complement, so
 * with density switched on it is noise at best.
 */
export function handWeights() {
    return { wBias: 0.05, wDensity: 1.0, wHunt: 2.5, wParity: 0, wAim: 0, wFlight: -0.1 };
}

/** The hand policy as first written, before the ablation. Kept so the gate can re-run the comparison. */
export function untunedWeights() {
    return { wBias: 0.05, wDensity: 1.0, wHunt: 2.5, wParity: 0.35, wAim: 0.4, wFlight: -0.1 };
}

/** A deliberately bad opponent: fires at whatever is legal, ignoring every feature. The floor to beat. */
export function blindWeights() {
    return { wBias: 1, wDensity: 0, wHunt: 0, wParity: 0, wAim: 0, wFlight: 0 };
}

export function score(w, f) {
    // reach GATES rather than contributes: an unreachable cell is not a low-scoring shot, it is not a shot.
    // Same structure as csTacticsPolicy's score(), where reach multiplies the whole sum.
    const d = w.wBias + w.wDensity * f.density + w.wHunt * f.hunt + w.wParity * f.parity
            + w.wAim * f.aim + w.wFlight * f.flight;
    return (f.reach || 0) * d;
}

// ---------------------------------------------------------------- the board

/** Cell states a shooter can see on the enemy board. Everything else is its own bookkeeping. */
export const UNKNOWN = 0, MISS = 1, HIT = 2, SUNK = 3;

/**
 * How many ways the remaining ships could still cover each unknown cell.
 *
 * *** THIS IS THE ACTUAL BATTLESHIP OPTIMUM AND IT IS NOT "SHOOT THE MIDDLE". *** Counting placements
 * consistent with what has been observed is what makes a solver strong; parity is a cheap approximation of
 * it that only helps while hunting. Both are features here so the duel can measure which is carrying the
 * result rather than assuming.
 */
export function densityMap(board, remainingShips, n) {
    const dens = new Array(n * n).fill(0);
    for (const len of remainingShips) {
        for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
            for (const [dr, dc] of [[0, 1], [1, 0]]) {
                const er = r + dr * (len - 1), ec = c + dc * (len - 1);
                if (er >= n || ec >= n) continue;
                let fits = true;
                for (let k = 0; k < len && fits; k++) {
                    const s = board[(r + dr * k) * n + (c + dc * k)];
                    if (s === MISS || s === SUNK) fits = false;
                }
                if (!fits) continue;
                for (let k = 0; k < len; k++) {
                    const i = (r + dr * k) * n + (c + dc * k);
                    if (board[i] === UNKNOWN) dens[i]++;
                }
            }
        }
    }
    return dens;
}

/** Cells adjacent to a HIT that is not yet part of a sunk ship -- the hunt/target switch, as a number. */
export function huntMap(board, n) {
    const hunt = new Array(n * n).fill(0);
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
        if (board[r * n + c] !== HIT) continue;
        for (const [dr, dc] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
            const rr = r + dr, cc = c + dc;
            if (rr < 0 || cc < 0 || rr >= n || cc >= n) continue;
            if (board[rr * n + cc] === UNKNOWN) hunt[rr * n + cc] += 1;
            // In line with an existing hit is worth more than merely touching one: a ship is a straight run,
            // so the continuation of a two-hit line is very nearly certain.
            const br = r - dr, bc = c - dc;
            if (br >= 0 && bc >= 0 && br < n && bc < n && board[br * n + bc] === HIT
                && rr >= 0 && cc >= 0 && rr < n && cc < n && board[rr * n + cc] === UNKNOWN) hunt[rr * n + cc] += 2;
        }
    }
    return hunt;
}

// ---------------------------------------------------------------- the gunnery

/**
 * The ground scatter one degree of aiming error produces at this range, for each arc.
 *
 * *** IN VACUUM THIS IS EXACT AND COSTS NOTHING, AND MY FIRST VERSION INTEGRATED IT ANYWAY. *** Six full
 * trajectory flights per candidate CELL, a hundred cells a salvo, a few hundred salvos a duel -- the first
 * 60-game series did not finish in two minutes. dR/dtheta = 2 v^2 cos(2 theta) / g is a two-line derivative
 * of a formula this module already solves, so the vacuum branch is now closed form: exact, and free.
 * Simulation is kept for the drag case, where no closed form exists, and memoised by range because a square
 * grid asks about the same distances over and over.
 *
 * The zero of that cosine at theta = 45 degrees is the whole reason this function is interesting: a gun is
 * MOST accurate at maximum range.
 *
 * @returns {{flat:{elevation,dispersion,flight}, lob:{...}}|null}
 */
export function arcOptions(range, v, { drag = 0, g = GRAVITY, rise = 0, dt = 1 / 2000 } = {}) {
    const a = launchAngles(range, rise, v, g);
    if (!a) return null;
    if (!(drag > 0)) {
        const one = (e) => ({
            elevation: e,
            dispersion: Math.abs(2 * v * v * Math.cos(2 * e) / g) * (Math.PI / 180),
            flight: range / (v * Math.cos(e)),
        });
        return { flat: one(a.flat), lob: one(a.lob) };
    }
    const key = `${range.toFixed(4)}|${v}|${drag}|${g}|${rise}|${dt}`;
    const hit = _arcCache.get(key);
    if (hit !== undefined) return hit;
    const land = (e) => { const r = flyShell({ vx: v * Math.cos(e), vy: v * Math.sin(e) }, { dt, groundY: rise, drag, gravity: g });
        return r.landed ? { x: r.x, t: r.t } : null; };
    const one = (e) => {
        const h = 1e-4, lo = land(e - h), hi = land(e + h), mid = land(e);
        if (!lo || !hi || !mid) return null;
        return { elevation: e, dispersion: Math.abs((hi.x - lo.x) / (2 * h) * (Math.PI / 180)), flight: mid.t };
    };
    const flat = one(a.flat), lob = one(a.lob);
    const out = flat && lob ? { flat, lob } : null;
    // Bounded so a long-running duel cannot grow it without limit; ranges on a grid repeat, so a modest cap
    // still hits almost every time.
    if (_arcCache.size > 4096) _arcCache.clear();
    _arcCache.set(key, out);
    return out;
}

const _arcCache = new Map();

/** Drop the memo. Only a test needs this, and a test that cannot clear a cache is testing the cache. */
export function _clearArcCache() { _arcCache.clear(); }

/** Which arc scatters less here. In vacuum they tie exactly; in air the lob wins at close range. */
export function bestArc(range, v, opts = {}) {
    const o = arcOptions(range, v, opts);
    if (!o) return null;
    // A tie is a real outcome, not a rounding artefact -- vacuum makes them exactly equal, and picking
    // "flat" on a tie is a stated convention rather than an accident of comparison order.
    return o.lob.dispersion < o.flat.dispersion - 1e-9 ? "lob" : "flat";
}

// ---------------------------------------------------------------- features and choice

/**
 * Score every unknown cell and return the best shot, or null when the board is exhausted.
 *
 * @param state { board, n, remaining, gun:{ pos:[r,c], v, drag } }
 * @returns {{index, r, c, arc, elevation, dispersion, flight, score, feats}|null}
 */
export function chooseShot(state, weights, opts = {}) {
    const { board, n, remaining, gun } = state;
    const dens = densityMap(board, remaining, n);
    const hunt = huntMap(board, n);
    const maxDens = Math.max(1, ...dens);
    const maxHunt = Math.max(1, ...hunt);
    const envelope = gun.drag > 0 ? maxRangeDrag(gun.v, { drag: gun.drag, dt: opts.dt || 1 / 480 }).range
                                  : maxRange(gun.v);
    let best = null;
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
        const i = r * n + c;
        if (board[i] !== UNKNOWN) continue;
        const range = Math.hypot(r - gun.pos[0], c - gun.pos[1]) * (gun.cellSize || 1);
        const arcs = range > 1e-9 ? arcOptions(range, gun.v, { drag: gun.drag, dt: opts.dt || 1 / 2000 }) : null;
        const reach = arcs ? 1 : 0;
        // Pick the tighter arc, then score the cell with the dispersion that arc actually gives.
        const arc = !arcs ? "flat" : (arcs.lob.dispersion < arcs.flat.dispersion - 1e-9 ? "lob" : "flat");
        const chosen = arcs ? arcs[arc] : null;
        // aim: 1 when the shot is pinpoint, 0 when the scatter is a whole cell or worse. This is the feature
        // that carries fact (1) above -- and it makes LONG shots attractive, which reads as backwards until
        // you have seen the measurement.
        const cell = gun.cellSize || 1;
        const aim = chosen ? Math.max(0, 1 - chosen.dispersion / cell) : 0;
        const flight = chosen ? chosen.flight / 10 : 0;
        const feats = {
            reach,
            density: dens[i] / maxDens,
            hunt: hunt[i] / maxHunt,
            parity: ((r + c) % 2 === 0) ? 1 : 0,
            aim, flight,
        };
        const s = score(weights, feats);
        if (!best || s > best.score) {
            best = { index: i, r, c, arc, elevation: chosen ? chosen.elevation : 0,
                     dispersion: chosen ? chosen.dispersion : Infinity,
                     flight: chosen ? chosen.flight : Infinity, range, score: s, feats };
        }
    }
    return best;
}

/** Everything wrong with a weight set. Empty means the brain can serve it. */
export function validateWeights(w) {
    const p = [];
    if (!w || typeof w !== "object") return ["not an object"];
    for (const k of W_KEYS) {
        if (!(k in w)) p.push(`missing ${k}`);
        else if (!Number.isFinite(w[k])) p.push(`${k} is not finite`);
    }
    for (const k of Object.keys(w)) if (!W_KEYS.includes(k)) p.push(`unknown weight ${k}`);
    return p;
}
