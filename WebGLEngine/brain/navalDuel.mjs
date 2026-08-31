// FILE: brain/navalDuel.mjs -- v4206
//
// TWO GUNNERY POLICIES, ONE OCEAN. A headless duel between two weight vectors from brain/navalPolicy.mjs,
// fought with the real shells of physics/ballistics.mjs.
//
// *** DETERMINISTIC FROM A SEED, WHICH IS THE ONLY WAY A DUEL PROVES ANYTHING. *** Two policies that beat
// each other on different random boards have told you nothing. Same seed means same fleet placement and the
// same scatter draws, so a difference in the result is a difference in the POLICY. rigid-selfcheck's "two
// identical worlds stay bit-identical" is the same discipline; this file is that applied to a game.
//
// *** AND THE SHOTS MISS FOR A REASON. *** A shell is aimed at a cell and lands where the physics puts it:
// the aiming error is ANGULAR, and brain/navalPolicy.mjs turns it into a ground error through the real
// trajectory. So a close-range shot scatters wildly and a long one lands where it was sent -- the opposite
// of the intuition, and the thing that makes arc choice and range choice worth anything.
"use strict";

import { UNKNOWN, MISS, HIT, SUNK, chooseShot } from "./navalPolicy.mjs";

/** The classic fleet. Lengths only -- the duel does not care what they are called. */
export const FLEET = Object.freeze([5, 4, 3, 3, 2]);

/**
 * mulberry32. Small, fast, and ITS STATE IS ONE 32-BIT WORD, which is what makes a duel reproducible from a
 * single integer rather than from a snapshot of an engine's RNG.
 */
export function rng32(seed) {
    let a = seed >>> 0;
    return function () {
        a = (a + 0x6D2B79F5) >>> 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

/** Place a fleet at random without overlaps. Returns { cells: Int8Array, ships: [{len, cells}] }. */
export function placeFleet(n, rand, fleet = FLEET) {
    const occupied = new Array(n * n).fill(-1);
    const ships = [];
    for (let s = 0; s < fleet.length; s++) {
        const len = fleet[s];
        for (let attempt = 0; attempt < 1000; attempt++) {
            const horiz = rand() < 0.5;
            const r = Math.floor(rand() * (horiz ? n : n - len + 1));
            const c = Math.floor(rand() * (horiz ? n - len + 1 : n));
            const cells = [];
            let free = true;
            for (let k = 0; k < len; k++) {
                const i = (r + (horiz ? 0 : k)) * n + (c + (horiz ? k : 0));
                if (occupied[i] >= 0) { free = false; break; }
                cells.push(i);
            }
            if (!free) continue;
            for (const i of cells) occupied[i] = s;
            ships.push({ len, cells, hits: 0 });
            break;
        }
    }
    return { occupied, ships };
}

/**
 * Where a shell aimed at a cell actually lands.
 *
 * *** THE SCATTER IS THE POLICY'S OWN DISPERSION NUMBER, NOT A FUDGE FACTOR. *** chooseShot() reports the
 * ground error per degree of aiming error at that range and arc; multiply by the gun's angular error and
 * that is the standard deviation of the miss, in the same units the board is measured in. A tighter shot is
 * tighter because the trajectory says so.
 *
 * Box-Muller on the seeded stream, so the scatter is part of what a seed reproduces.
 */
export function scatterShot(shot, gun, n, rand) {
    const sigmaCells = (shot.dispersion * (gun.aimError || 0)) / (gun.cellSize || 1);
    if (!(sigmaCells > 0)) return shot.index;
    // Range error lies ALONG the line of fire -- an elevation error makes a shell fall short or long, it
    // does not push it sideways. Modelling it as a circular blob would be a different and wrong physics.
    const u = Math.max(1e-12, rand()), v = rand();
    const g = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    const dr = shot.r - gun.pos[0], dc = shot.c - gun.pos[1];
    const L = Math.hypot(dr, dc) || 1;
    const rr = Math.round(shot.r + (dr / L) * g * sigmaCells);
    const cc = Math.round(shot.c + (dc / L) * g * sigmaCells);
    if (rr < 0 || cc < 0 || rr >= n || cc >= n) return -1;          // fell off the board; a wasted salvo
    return rr * n + cc;
}

/**
 * Fire one salvo. Mutates the shooter's view of the enemy board and the defender's ship damage.
 * Returns what the shooter learns, which is all it is allowed to learn.
 */
export function fireSalvo(view, defender, gun, n, weights, rand, opts = {}) {
    const remaining = defender.ships.filter((s) => s.hits < s.len).map((s) => s.len);
    if (!remaining.length) return { over: true };
    const shot = chooseShot({ board: view, n, remaining, gun }, weights, opts);
    if (!shot) return { over: true, exhausted: true };
    const landed = scatterShot(shot, gun, n, rand);
    // *** A SHELL THAT SCATTERS ONTO AN ALREADY-KNOWN CELL IS A WASTED SALVO, NOT A FREE RE-ROLL. *** That
    // is the cost of a loose shot and the reason aim is worth weighting at all.
    if (landed < 0 || view[landed] !== UNKNOWN) return { aimed: shot.index, landed, wasted: true, arc: shot.arc, shot };
    const shipIdx = defender.occupied[landed];
    if (shipIdx < 0) { view[landed] = MISS; return { aimed: shot.index, landed, hit: false, arc: shot.arc, shot }; }
    const ship = defender.ships[shipIdx];
    ship.hits++;
    view[landed] = HIT;
    let sunk = false;
    if (ship.hits >= ship.len) { sunk = true; for (const i of ship.cells) view[i] = SUNK; }
    return { aimed: shot.index, landed, hit: true, sunk, arc: shot.arc, shot };
}

/**
 * Play one duel. A wins if it clears B's fleet in strictly fewer salvos.
 *
 * Both sides shoot at boards laid out from the SAME seed stream, so neither gets an easier ocean.
 */
export function duel(weightsA, weightsB, seed, opts = {}) {
    const n = opts.n || 10;
    const gun = { pos: [-2, Math.floor(n / 2)], v: opts.v || 40, drag: opts.drag || 0,
                  cellSize: opts.cellSize || 1, aimError: opts.aimError ?? 0.35, ...(opts.gun || {}) };
    const rand = rng32(seed);
    // One fleet layout, played by both -- the fairest comparison there is.
    const layout = placeFleet(n, rand, opts.fleet || FLEET);
    const clone = () => ({ occupied: layout.occupied.slice(), ships: layout.ships.map((s) => ({ ...s, cells: s.cells.slice(), hits: 0 })) });
    const out = {};
    for (const [name, w] of [["a", weightsA], ["b", weightsB]]) {
        const view = new Array(n * n).fill(UNKNOWN);
        const def = clone();
        // Each side gets its OWN scatter stream from the same seed, so the draws are identical shot-for-shot
        // and a difference in outcome cannot be blamed on luck.
        const r2 = rng32(seed ^ 0x9E3779B9);
        let salvos = 0, hits = 0, wasted = 0, lobs = 0;
        const cap = opts.cap || n * n * 3;
        while (salvos < cap) {
            const res = fireSalvo(view, def, gun, n, w, r2, opts);
            if (res.over) break;
            salvos++;
            if (res.hit) hits++;
            if (res.wasted) wasted++;
            if (res.arc === "lob") lobs++;
            if (def.ships.every((s) => s.hits >= s.len)) break;
        }
        out[name] = { salvos, hits, wasted, lobs, cleared: def.ships.every((s) => s.hits >= s.len) };
    }
    out.winner = !out.a.cleared && !out.b.cleared ? "neither"
               : !out.b.cleared ? "a" : !out.a.cleared ? "b"
               : out.a.salvos < out.b.salvos ? "a" : out.b.salvos < out.a.salvos ? "b" : "draw";
    out.seed = seed;
    return out;
}

/** Run a series and report the record. The only honest way to compare two policies. */
export function series(weightsA, weightsB, { games = 100, seed0 = 1, ...opts } = {}) {
    let a = 0, b = 0, draws = 0, salvosA = 0, salvosB = 0, unfinished = 0;
    for (let i = 0; i < games; i++) {
        const d = duel(weightsA, weightsB, seed0 + i, opts);
        if (d.winner === "a") a++; else if (d.winner === "b") b++;
        else if (d.winner === "draw") draws++; else unfinished++;
        salvosA += d.a.salvos; salvosB += d.b.salvos;
    }
    return { games, a, b, draws, unfinished,
             meanSalvosA: salvosA / games, meanSalvosB: salvosB / games,
             winRateA: a / games };
}
