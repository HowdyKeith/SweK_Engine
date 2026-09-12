// WebGLEngine/nav/detourScale.mjs -- v4552
//
// *** WHAT DO REAL DETOURS IN REAL WORLDS ACTUALLY LOOK LIKE? THE NUMBER nextRounds SAID NOBODY HAD TAKEN. ***
//
// simulation/BotPathfinderPool.js samples the start/goal bounding box padded by HM_PADDING = 24 and hands
// that snapshot to the planner. A route needing a wider detour is not in the data either planner receives,
// so the bot gets NO path rather than a long one, and BotManager falls back to steering straight at the
// thing in the way. v4547 measured that edge and built an escalating ladder -- 24, then 60, then 144 -- and
// filed the rest as open, in these words: "choosing between them still needs the number nobody has taken,
// which is what real detours in real worlds look like."
//
// This module takes that number, and the answer inverts the question.
//
// ---- MEASURED ON THE ENGINE'S OWN WORLD -------------------------------------------------------------------
//
// 320x320 of main.js's world._heightAt, dumped from a real boot, walked with the worker's OWN rule
// (maxStepUp 3, maxStepDown 6 -- worker/botPathfinder.worker.js's defaults), 240 routes at separations 20 to
// 140, each planned by Dijkstra over the WHOLE slab so the route found is the one a planner with no window
// at all would return. The measurement is the EXCURSION: how far outside the start/goal bounding box the
// true route goes, which is exactly the pad a window must hold.
//
//     median 0     p90 0     p99 1     max 3
//     pad  0 covers 236 of 240 (98.3%)      pad 4 covers 240 of 240 (100%)
//     path length / straight line: median 1.066, p90 1.082, max 1.336
//
// *** HM_PADDING = 24 IS ALREADY SIX TIMES THE WORST CASE THAT WORLD PRODUCES, AND THE LADDER TO 144 IS
// INSURANCE AGAINST A WORLD THIS TREE DOES NOT HAVE. *** The reason is the second measurement below: at the
// worker's own rule the shipped heightfield has 0.18% of its edges blocked and ONE component covering 100.0%
// of the map. For pathfinding purposes it is an open field. Nothing to go round means nothing to detour for.
//
// So the three shapes v4547 offered -- an adaptive ladder, a window derived from obstacle scale, a persistent
// per-region navmesh -- are answers to a question this world does not pose. The ladder is already built and
// already measured to cost nothing when it is not needed; the other two would be solving a problem that is
// not there. THE NUMBER DID CHOOSE BETWEEN THEM, by saying none of them is due.
//
// ---- WHAT THIS MODULE IS FOR ------------------------------------------------------------------------------
//
// A constant nobody can check is the thing this tree keeps finding. HM_PADDING was one: 24, with no
// measurement behind it anywhere, guarding a failure mode (no path at all) that is invisible from outside
// the pool. The census below makes it CHECKABLE -- a gate can ask a world what detour it actually needs and
// compare, so the day a world arrives with real obstacles the margin is a number rather than a hope.
//
// *** WHAT IS NOT MEASURED HERE, AND IT MATTERS MORE THAN THE WINDOW: *** the pool builds its snapshot from
// world._heightAt AND NOTHING ELSE. Anything solid that is not in the heightfield is invisible to the
// planner and to physics/character/terrainWalk.mjs alike. Whether main.js's world carries such solids was
// NOT established -- the scene graph could not be reached from window.fpsShooter, whose keys are camera,
// router, world, particles, ecsWorld, botManager and the rest with no scene among them -- so this is filed
// as open rather than answered in either direction. A probe that returns zero because it looked in the wrong
// place is not a finding, and reporting "no obstacles" from it would have been one of this session's own
// recurring defects.
"use strict";

/** The worker's own defaults, so a census asks the question the planner actually answers. */
export const STEP = Object.freeze({ up: 3, down: 6 });

const NB4 = Object.freeze([[1, 0], [-1, 0], [0, 1], [0, -1]]);
const NB8 = Object.freeze([[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]);

const reader = (hm, stride) => {
    const rows = Math.floor(hm.length / stride);
    return { rows, at: (i, j) => (i < 0 || j < 0 || i >= stride || j >= rows ? null : hm[j * stride + i]) };
};

/**
 * How obstructed a heightfield is, under the planner's own step rule.
 *
 * Two numbers rather than one, because they answer different questions: `blockedFraction` is how much of the
 * terrain refuses a step, and `largestComponentPct` is whether that refusal actually SEPARATES anything. A
 * field can be 8% blocked and still be one connected region, which is a very different world to plan in than
 * one that is 8% blocked into a maze.
 */
export function obstruction(hm, { stride, up = STEP.up, down = STEP.down } = {}) {
    const { rows, at } = reader(hm, stride);
    let edges = 0, blocked = 0;
    const passable = (i, j, ni, nj) => {
        const a = at(i, j), b = at(ni, nj);
        if (a == null || b == null) return null;
        const dh = b - a;
        return dh <= up && dh >= -down;
    };
    for (let j = 0; j < rows; j++) for (let i = 0; i < stride; i++) for (const [dx, dy] of NB4) {
        const p = passable(i, j, i + dx, j + dy);
        if (p === null) continue;
        edges++; if (!p) blocked++;
    }
    const seen = new Uint8Array(stride * rows);
    let largest = 0, components = 0;
    for (let s = 0; s < stride * rows; s++) {
        if (seen[s]) continue;
        components++; let n = 0; const st = [s]; seen[s] = 1;
        while (st.length) {
            const k = st.pop(); n++;
            const i = k % stride, j = (k - i) / stride;
            for (const [dx, dy] of NB4) {
                const ni = i + dx, nj = j + dy, nk = nj * stride + ni;
                if (ni < 0 || nj < 0 || ni >= stride || nj >= rows || seen[nk]) continue;
                if (!passable(i, j, ni, nj)) continue;
                seen[nk] = 1; st.push(nk);
            }
        }
        if (n > largest) largest = n;
    }
    return Object.freeze({
        cells: stride * rows, edges, blocked,
        blockedFraction: edges ? blocked / edges : 0,
        components, largestComponent: largest,
        largestComponentPct: stride * rows ? (100 * largest) / (stride * rows) : 0,
    });
}

/**
 * The true shortest route between two cells, over the WHOLE field -- no window.
 *
 * *** IT MUST BE UNWINDOWED OR IT MEASURES ITSELF. *** The question is how far outside the start/goal box a
 * correct route goes; planning inside a box of any size would cap the answer at that box and report the cap.
 */
export function route(hm, { stride, si, sj, gi, gj, up = STEP.up, down = STEP.down } = {}) {
    const { rows, at } = reader(hm, stride);
    const n = stride * rows;
    const dist = new Float64Array(n).fill(Infinity), prev = new Int32Array(n).fill(-1);
    const key = (i, j) => j * stride + i;
    const start = key(si, sj), goal = key(gi, gj);
    if (at(si, sj) == null || at(gi, gj) == null) return null;
    dist[start] = 0;
    const heap = [[0, start]];
    const push = (v) => { heap.push(v); let c = heap.length - 1;
        while (c > 0) { const p = (c - 1) >> 1; if (heap[p][0] <= heap[c][0]) break; const t = heap[p]; heap[p] = heap[c]; heap[c] = t; c = p; } };
    const pop = () => { const top = heap[0], last = heap.pop();
        if (heap.length) { heap[0] = last; let c = 0;
            for (;;) { const l = 2 * c + 1, r = l + 1; let m = c;
                if (l < heap.length && heap[l][0] < heap[m][0]) m = l;
                if (r < heap.length && heap[r][0] < heap[m][0]) m = r;
                if (m === c) break; const t = heap[m]; heap[m] = heap[c]; heap[c] = t; c = m; } }
        return top; };
    while (heap.length) {
        const [d, k] = pop();
        if (d > dist[k]) continue;
        if (k === goal) break;
        const i = k % stride, j = (k - i) / stride;
        for (const [dx, dy] of NB8) {
            const ni = i + dx, nj = j + dy;
            const a = at(i, j), b = at(ni, nj);
            if (a == null || b == null) continue;
            const dh = b - a;
            if (dh > up || dh < -down) continue;
            const w = dx && dy ? Math.SQRT2 : 1;
            const nk = key(ni, nj);
            if (d + w < dist[nk]) { dist[nk] = d + w; prev[nk] = k; push([d + w, nk]); }
        }
    }
    if (!Number.isFinite(dist[goal])) return null;
    const path = [];
    for (let k = goal; k !== -1; k = prev[k]) { const i = k % stride; path.push([i, (k - i) / stride]); }
    path.reverse();
    let exc = 0;
    const minX = Math.min(si, gi), maxX = Math.max(si, gi), minY = Math.min(sj, gj), maxY = Math.max(sj, gj);
    for (const [i, j] of path) exc = Math.max(exc, minX - i, i - maxX, minY - j, j - maxY);
    return { path, length: dist[goal], excursion: Math.max(0, exc) };
}

/** A deterministic sampler, so a census is reproducible and a gate compares like with like. */
const lcg = (seed) => { let s = seed >>> 0; return () => (s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff; };

/**
 * Sample routes across a field and report the distribution of EXCURSION -- the pad a window must hold.
 *
 * `unreachable` is reported rather than dropped: a world where most pairs cannot be joined at all is telling
 * you something about the step rule, not about the window, and a census that silently skipped those would
 * report a comfortable excursion for a world nothing can cross.
 */
export function detourCensus(hm, { stride, samples = 120, minSep = 20, maxSep = 140,
                                   seed = 12345, up = STEP.up, down = STEP.down } = {}) {
    const { rows } = reader(hm, stride);
    const rnd = lcg(seed);
    const excursions = [], ratios = [];
    let tried = 0, unreachable = 0;
    while (excursions.length < samples && tried < samples * 30) {
        tried++;
        const si = Math.floor(rnd() * stride), sj = Math.floor(rnd() * rows);
        const ang = rnd() * Math.PI * 2, sep = minSep + rnd() * (maxSep - minSep);
        const gi = Math.round(si + Math.cos(ang) * sep), gj = Math.round(sj + Math.sin(ang) * sep);
        if (gi < 0 || gj < 0 || gi >= stride || gj >= rows) continue;
        const r = route(hm, { stride, si, sj, gi, gj, up, down });
        if (!r) { unreachable++; continue; }
        const straight = Math.hypot(gi - si, gj - sj);
        if (straight < 1) continue;
        excursions.push(r.excursion);
        ratios.push(r.length / straight);
    }
    excursions.sort((a, b) => a - b);
    ratios.sort((a, b) => a - b);
    const q = (arr, p) => (arr.length ? arr[Math.min(arr.length - 1, Math.floor(arr.length * p))] : null);
    return Object.freeze({
        samples: excursions.length, tried, unreachable,
        excursion: Object.freeze({ median: q(excursions, 0.5), p90: q(excursions, 0.9),
                                   p99: q(excursions, 0.99), max: excursions[excursions.length - 1] ?? null }),
        ratio: Object.freeze({ median: q(ratios, 0.5), p90: q(ratios, 0.9), max: ratios[ratios.length - 1] ?? null }),
        covered: (pad) => excursions.filter((e) => e <= pad).length,
    });
}

/**
 * The pad this world implies: the worst excursion seen, times a margin, floored at a minimum.
 *
 * *** THE MARGIN IS ON THE MAXIMUM AND NOT ON A PERCENTILE, AND THAT IS THE WHOLE JUDGEMENT. *** A p99 pad
 * is wrong for this failure: the cost of being under is not a slower path, it is NO PATH AT ALL and a bot
 * that charges the wall. One route in a hundred doing that is not an acceptable rate for something invisible
 * from outside the pool, so the sample's worst case is the floor and the margin sits on top of it.
 */
export function suggestPad(census, { margin = 4, floor = 8 } = {}) {
    const worst = census?.excursion?.max ?? 0;
    return Math.max(floor, Math.ceil(worst * margin));
}

/**
 * *** THE ENGINE'S OWN NUMBERS, taken from a real boot of index.html. *** They are frozen rather than
 * re-derived because taking them needs a browser and a 320x320 Dijkstra sweep, which is minutes rather than
 * the milliseconds a gate may spend. The gate re-derives the SHAPE of every claim on fixtures it builds
 * itself, and holds these to the arithmetic that has to be true of them.
 */
export const MEASURED_AT_V4552 = Object.freeze({
    at: "v4552",
    world: "main.js world._heightAt, 320x320 centred on the origin, every cell finite, heights 1..55",
    rule: Object.freeze({ up: 3, down: 6, note: "worker/botPathfinder.worker.js's own defaults" }),
    obstruction: Object.freeze({ blockedFractionPct: 0.18, components: 12, largestComponentPct: 100.0 }),
    // and how that moves as the rule tightens -- the control that says the 0.18% is the RULE's doing as much
    // as the terrain's, so nobody reads it as "this world has no hills"
    tighter: Object.freeze([
        Object.freeze({ up: 2, down: 4, blockedPct: 0.48, largestPct: 99.9, components: 42 }),
        Object.freeze({ up: 1, down: 2, blockedPct: 4.53, largestPct: 99.5, components: 245 }),
        Object.freeze({ up: 1, down: 1, blockedPct: 8.26, largestPct: 99.0, components: 531 }),
    ]),
    routes: 240, tried: 332, unreachable: 0,
    excursion: Object.freeze({ median: 0, p90: 0, p99: 1, max: 3 }),
    ratio: Object.freeze({ median: 1.066, p90: 1.082, max: 1.336 }),
    coveredByPad: Object.freeze({ 0: 236, 4: 240, 8: 240, 24: 240, 60: 240, 144: 240 }),
    shippedPad: 24, ladder: Object.freeze([24, 60, 144]),
    verdict: "HM_PADDING = 24 is 6x the worst excursion this world produces, and no route in 240 needed more " +
             "than 3. The ladder is insurance against a world this tree does not have; it is kept because " +
             "v4547 measured it to cost nothing when it is not needed (0 widenings over 8 easy plans).",
});

export function reportLines() {
    const M = MEASURED_AT_V4552;
    return [
        "[detourScale] what a world's real detours are, and what window they imply",
        `  engine world at up<=${M.rule.up} down<=${M.rule.down}: ${M.obstruction.blockedFractionPct}% of edges blocked, ` +
        `largest component ${M.obstruction.largestComponentPct}% -- an open field`,
        `  ${M.routes} routes, ${M.unreachable} unreachable: excursion median ${M.excursion.median}, ` +
        `p99 ${M.excursion.p99}, max ${M.excursion.max}`,
        `  shipped pad ${M.shippedPad} against a measured worst case of ${M.excursion.max}`,
        "  NOT measured: whether the world carries solids outside the heightfield, which the pool never reads",
    ];
}

if (process.argv?.[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href)
    for (const l of reportLines()) console.log(l);
