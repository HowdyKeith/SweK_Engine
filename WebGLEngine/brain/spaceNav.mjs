// WebGLEngine/brain/spaceNav.mjs -- UNNUMBERED (the version is chosen at ship time) (the gate is brain/spaceNav-selfcheck.mjs)
//
// THE NAVIGATION LAYER FOR THE ROCK FIELD (brain/ROCK_NAV_WIP.md, Round A; backlog nav-match-consumes-layer). The submarine's 2-D flow field, in 3-D:
//   buildField(rocks, origin, goalR) -- a cube of half-width HALF around `origin`, cells of CELL; a cell is BLOCKED when its centre lies within
//     rock radius + FIGHTER radius + MARGIN + 0.87 CELL of a rock's centre; distances are 26-neighbour Dijkstra (64-bit: the 32-bit store
//     the prototype had made the stale-entry skip fail and the search re-expand without end) toward every free cell within goalR of origin.
//   aimOf(field, pos) -- walk the steepest descent from pos's cell; the aim is the farthest cell centre on that walk still in clear line of
//     sight (sampled every half cell against the blocked grid), or null when none is.
//   navPilot(arenaOf, field) -- a battleshipFight/spaceArena pilot: beyond SA.STRAFE_RANGE of the capital ship's CURRENT centre and with an
//     aim, AP.decide toward the aim at rest; otherwise AP.decide(body, target, opts) exactly (THE HAND-BACK). Aims are cached per fighter
//     for EVERY ticks.
// Pure: no I/O, no clock, no Math.random.
"use strict";

import * as SA from "./spaceArena.mjs";
import * as AP from "./autopilot6dof.mjs";

export const NAV_DEFAULTS = Object.freeze({ cell: 16, half: 560, margin: 20, every: 15, lane: false });

/**
 * The field: { origin, cell, half, n, blocked (Uint8Array), dist (Float64Array), margin, goalR, lane }. With `lane` (Round B, the clear lane), a goal cell
 * must also have a clear line from its centre to the origin, so the layer routes each fighter to a point with a clear run at the ship. Default off:
 * Round A's field, to the bit.
 */
export function buildField(rocks, origin, goalR, opts = {}) {
    const o = { ...NAV_DEFAULTS, ...opts }, n = Math.round(2 * o.half / o.cell), n3 = n * n * n;
    const F = { origin: Object.freeze([...origin]), cell: o.cell, half: o.half, n, margin: o.margin, goalR, lane: !!o.lane, blocked: new Uint8Array(n3), dist: new Float64Array(n3).fill(Infinity) };
    const cen = (i, ax) => origin[ax] - o.half + (i + 0.5) * o.cell;
    for (const q of rocks) {
        const r = q.radius + SA.FIGHTER.radius + o.margin, reach = r + o.cell * 0.87;
        const lo = [0, 1, 2].map((ax) => cellOf(F, q.pos[ax] - reach, ax)), hi = [0, 1, 2].map((ax) => cellOf(F, q.pos[ax] + reach, ax));
        for (let i = lo[0]; i <= hi[0]; i++) for (let j = lo[1]; j <= hi[1]; j++) for (let k = lo[2]; k <= hi[2]; k++)
            if (Math.hypot(cen(i, 0) - q.pos[0], cen(j, 1) - q.pos[1], cen(k, 2) - q.pos[2]) <= reach) F.blocked[(i * n + j) * n + k] = 1;
    }
    // Dijkstra, a binary heap on two parallel arrays
    let hd = new Float64Array(1024), hv = new Int32Array(1024), size = 0;
    const push = (d, v) => {
        if (size === hd.length) { const d2 = new Float64Array(size * 2), v2 = new Int32Array(size * 2); d2.set(hd); v2.set(hv); hd = d2; hv = v2; }
        let c = size++; while (c > 0) { const p = (c - 1) >> 1; if (hd[p] <= d) break; hd[c] = hd[p]; hv[c] = hv[p]; c = p; } hd[c] = d; hv[c] = v;
    };
    const pop = () => {
        const v = hv[0]; size--; const d = hd[size], w = hv[size]; let c = 0;
        for (;;) { const l = 2 * c + 1; if (l >= size) break; const m = l + 1 < size && hd[l + 1] < hd[l] ? l + 1 : l; if (hd[m] >= d) break; hd[c] = hd[m]; hv[c] = hv[m]; c = m; }
        hd[c] = d; hv[c] = w; return v;
    };
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) for (let k = 0; k < n; k++) {
        const v = (i * n + j) * n + k;
        if (!F.blocked[v] && Math.hypot(cen(i, 0) - origin[0], cen(j, 1) - origin[1], cen(k, 2) - origin[2]) <= goalR && (!o.lane || lineClear(F, [cen(i, 0), cen(j, 1), cen(k, 2)], origin))) { F.dist[v] = 0; push(0, v); }
    }
    // 2026-11-26 (rock nav Round E; the fallback DIAGNOSTIC of brain/ROCK_NAV_WIP.md): with `lane`, an EMPTY lane goal -- the origin's own cell blocked, so no cell has a clear
    // line to it, which a field rebuilt round a ship drifting near a rock meets -- falls back to the plain goal and marks the build laneEmpty. A field built round the
    // ship's start never meets it (rocks lie 150 or more out), so Rounds B-D's fields are unchanged to the bit.
    F.laneEmpty = false;
    if (o.lane && size === 0) {
        F.laneEmpty = true;
        for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) for (let k = 0; k < n; k++) {
            const v = (i * n + j) * n + k;
            if (!F.blocked[v] && Math.hypot(cen(i, 0) - origin[0], cen(j, 1) - origin[1], cen(k, 2) - origin[2]) <= goalR) { F.dist[v] = 0; push(0, v); }
        }
    }
    const off = [];
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (let c = -1; c <= 1; c++) if (a || b || c) off.push([a, b, c, Math.hypot(a, b, c)]);
    // A correct search pushes at most 26 entries per settled cell plus the goal cells, so it pops at most 27 per cell. Past that it is not
    // settling (a 32-bit store, a heap out of order) and it throws, so a broken search fails its gate rows by name instead of hanging the gate.
    let pops = 0; const popCap = 27 * n3 + 1024;
    while (size) {
        if (++pops > popCap) throw new Error(`spaceNav.buildField: the search did not settle within ${popCap} pops (a 32-bit distance store or a heap out of order)`);
        const d0 = hd[0], v = pop(); if (d0 > F.dist[v]) continue;
        const i = Math.floor(v / (n * n)), j = Math.floor(v / n) % n, k = v % n;
        for (const [a, b, c, w] of off) {
            const ii = i + a, jj = j + b, kk = k + c; if (ii < 0 || jj < 0 || kk < 0 || ii >= n || jj >= n || kk >= n) continue;
            const u = (ii * n + jj) * n + kk; if (F.blocked[u]) continue;
            const nd = d0 + w; if (nd < F.dist[u]) { F.dist[u] = nd; push(nd, u); }
        }
    }
    return F;
}

/** The cell index along axis `ax` of coordinate x (clamped to the grid). */
export function cellOf(F, x, ax) { return Math.max(0, Math.min(F.n - 1, Math.floor((x - F.origin[ax] + F.half) / F.cell))); }
/** The flat index of the cell holding `p`. */
export const indexOf = (F, p) => (cellOf(F, p[0], 0) * F.n + cellOf(F, p[1], 1)) * F.n + cellOf(F, p[2], 2);
/** The centre of cell (i, j, k). */
export const centreOf = (F, i, j, k) => [F.origin[0] - F.half + (i + 0.5) * F.cell, F.origin[1] - F.half + (j + 0.5) * F.cell, F.origin[2] - F.half + (k + 0.5) * F.cell];
/** Is the segment a-b clear of blocked cells, sampled every half cell? */
export function lineClear(F, a, b) {
    const L = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]), m = Math.max(1, Math.ceil(L / (F.cell / 2)));
    for (let s = 0; s <= m; s++) { const t = s / m; if (F.blocked[indexOf(F, [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t])]) return false; }
    return true;
}

/**
 * The aim from `pos`: the farthest cell centre on the steepest descent still in clear line of sight. When no cell on the walk is in sight (a
 * diagonal step can cut the corner of a blocked zone, so the line to every cell clips it), the aim is the walk's FIRST cell, the adjacent one,
 * and `info.near` is set (amendment 2026-11-25, before any DEV seed: the registered null sent the fighter back to the doctrine, straight at the
 * rock). Null only when the fighter's own cell is a goal cell or has no lower neighbour.
 */
export function aimOf(F, pos, info = null) {
    const n = F.n; let i = cellOf(F, pos[0], 0), j = cellOf(F, pos[1], 1), k = cellOf(F, pos[2], 2), aim = null, first = null;
    if (info) info.near = false;
    const done = () => { if (!aim && first) { if (info) info.near = true; return first; } return aim; };
    for (let step = 0; step < 4 * n; step++) {
        const v = (i * n + j) * n + k;
        if (F.dist[v] === 0) { if (step === 0) return null; const c = centreOf(F, i, j, k); if (lineClear(F, pos, c)) return c; return done(); }
        let best = null, bd = F.dist[v];
        for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (let c = -1; c <= 1; c++) {
            const ii = i + a, jj = j + b, kk = k + c; if (ii < 0 || jj < 0 || kk < 0 || ii >= n || jj >= n || kk >= n) continue;
            const u = (ii * n + jj) * n + kk; if (F.dist[u] < bd) { bd = F.dist[u]; best = [ii, jj, kk]; }
        }
        if (!best) return done();
        [i, j, k] = best; const c = centreOf(F, i, j, k);
        if (!first) first = c;
        if (lineClear(F, pos, c)) aim = c; else if (aim) return aim;
    }
    return done();
}

/** The capital ship of an arena (the first craft of kind "capital"). */
export const shipOf = (arena) => arena.crafts.find((c) => c.kind === "capital");

/**
 * The layer's pilot. `arenaOf()` returns the arena (bound after build); `field` is a field, or a function returning the current one (followingField; an aim
 * cached under one field is never reused under another). `probe`, when given, is written each call: { calls, aimed, fallback,
 * handBack, near (aimed calls flying a NEAR aim), last: { inside, aim } }. Inside the strafe range it returns AP.decide(body, target, opts) unchanged.
 */
export function navPilot(arenaOf, field, { every = NAV_DEFAULTS.every, probe = null } = {}) {
    const cache = new Map();
    return (body, target, opts) => {
        const arena = arenaOf(), ship = shipOf(arena), s = ship.body.pos, F = typeof field === "function" ? field() : field;
        const inside = Math.hypot(body.pos[0] - s[0], body.pos[1] - s[1], body.pos[2] - s[2]) <= SA.STRAFE_RANGE;
        if (probe) probe.calls++;
        if (!inside) {
            const c = arena.crafts.find((x) => x.body === body), hit = cache.get(c.id);
            let aim;
            let near = false;
            if (hit && hit.F === F && arena.i - hit.i < every) ({ aim, near } = hit); else { const info = {}; aim = aimOf(F, body.pos, info); near = info.near; cache.set(c.id, { i: arena.i, aim, near, F }); }
            if (probe && near) probe.near = (probe.near || 0) + 1;
            if (probe) probe.last = { inside: false, aim, field: F };
            if (aim) { if (probe) probe.aimed++; return AP.decide(body, { pos: aim, vel: [0, 0, 0] }, opts); }
            if (probe) probe.fallback++;
            return AP.decide(body, target, opts);
        }
        if (probe) { probe.handBack++; probe.last = { inside: true, aim: null, field: F }; }
        return AP.decide(body, target, opts);
    };
}

/**
 * ROUND C: a field that follows the ship. Returns a function handing back the current field; the first call builds it round the capital ship's CURRENT centre,
 * and the first call at or after `every` ticks since the last build rebuilds it there. Pass it to navPilot in place of a field. `fieldOf.builds` lists each
 * build as { i, origin, shipPos } (the ship's position when it was built, for the check that they agree).
 */
export function followingField(arenaOf, rocks, { every = 60, lane = false, goalR = SA.STRAFE_RANGE, ...fieldOpts } = {}) {
    let F = null, at = -Infinity;
    const fieldOf = () => {
        const arena = arenaOf();
        if (!F || arena.i - at >= every) {
            const s = [...shipOf(arena).body.pos];
            F = buildField(rocks, s, goalR, { ...fieldOpts, lane }); at = arena.i;
            fieldOf.builds.push({ i: arena.i, origin: [...F.origin], shipPos: s });
        }
        return F;
    };
    fieldOf.builds = [];
    return fieldOf;
}

/**
 * The space doctrine's closing-speed cap (brain/SPACE_DOCTRINE_WIP.md; rock nav Round D in brain/ROCK_NAV_WIP.md) on any pilot: its output with the thrust set to 0 whenever
 * the closing speed of the body on its nearest foe's centre (SA.nearestFoe, -d(range)/dt) is at or above `cap`. The rule of rockNavStudy's arm LC, as a wrapper the page can use.
 * `probe`, when given, counts { overCap, cut }.
 */
export function capThrust(pilot, arenaOf, cap = 12, probe = null) {
    return (body, target, opts) => {
        const out = pilot(body, target, opts), arena = arenaOf(), c = arena.crafts.find((x) => x.body === body), foe = c ? SA.nearestFoe(arena, c) : null;
        if (!foe) return out;
        const r = [0, 1, 2].map((k) => foe.body.pos[k] - body.pos[k]), v = [0, 1, 2].map((k) => foe.body.vel[k] - body.vel[k]), d = Math.max(Math.hypot(r[0], r[1], r[2]), 1e-9);
        if (-(r[0] * v[0] + r[1] * v[1] + r[2] * v[2]) / d < cap) return out;
        if (probe) { probe.overCap = (probe.overCap || 0) + 1; if (out.thrust > 0) probe.cut = (probe.cut || 0) + 1; }
        return { ...out, thrust: 0 };
    };
}

export function reportLines() {
    return ["[spaceNav] the navigation layer for the rock field: a 3-D Dijkstra field toward the strafe sphere, the aim the farthest descent cell in sight, flown outside the strafe range only (brain/ROCK_NAV_WIP.md)",
        `  cell ${NAV_DEFAULTS.cell}, half-width ${NAV_DEFAULTS.half}, margin ${NAV_DEFAULTS.margin}, re-aim every ${NAV_DEFAULTS.every} ticks`];
}
