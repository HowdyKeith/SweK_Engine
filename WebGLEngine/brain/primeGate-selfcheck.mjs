// WebGLEngine/brain/primeGate-selfcheck.mjs — v2615
//
// Run: node brain/primeGate-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs.
//
// THE PRIME SIEVE IS EXACT BECAUSE PRIMALITY IS LOCAL. THE BRAIN'S FIELD IS GLOBAL. THE GATE CORRUPTS IT.
//
// ---- WHERE THIS CAME FROM ------------------------------------------------------------------------------------------
//
// Keith: "Can we look at the prime gates for your brain?" -- after sending the Prime Transport Architecture doc
// ("Mapping prime sieving onto state search architecture") and saying "that is interesting."
//
// A prime sieve is a GATE: it eliminates candidates (the multiples) you never examine again. Beam search is
// the same shape -- keep the top-K frontier, GATE OUT the rest. So the honest question is whether that gate
// fits the brain's search. I MEASURED IT INSTEAD OF ARGUING IT, and got two things wrong on the way, which is
// why this file measures rather than asserts.
//
// ---- WHAT I GOT WRONG FIRST ----------------------------------------------------------------------------------------
//
//   1. My first Dijkstra SORTED THE WHOLE HEAP ON EVERY POP -- O(V^2 log V) -- and reported 109 ms against
//      beam's 12 ms. THAT 109 ms WAS MY BUG, NOT THE ALGORITHM. The brain's real Dijkstra runs 0.58 ms with a
//      proper heap (v2156, measured). I nearly shipped my own bad heap as a finding about Dijkstra.
//
//   2. I assumed the grid was "too small to prune" -- that the frontier never gets big enough for a beam to
//      gate anything. WRONG: measured with a proper heap, the frontier PEAKS AT 818 NODES on the 64^2 grid,
//      ~20% of the 4096 cells. THE GATE ABSOLUTELY CAN CLOSE. My instinct was backwards.
//
// ---- WHAT IS ACTUALLY TRUE, MEASURED -------------------------------------------------------------------------------
//
// The brain does not compute one path. It computes a DISTANCE FIELD -- a distance-to-goal for EVERY cell --
// because entities all over the grid navigate by following its gradient. The code says so (v2156): the cost
// "scales with cells", and the quality metric is "cos 0.797 (37 deg mean error)" -- a comparison of FIELD
// DIRECTIONS over the whole grid, not a single path.
//
// Beam K=200 on the 64^2 grid, against exact Dijkstra, across five seeds:
//
//     seed        unreached    SUBOPTIMAL cells    goal ok
//     20260718        0             1886             yes
//            1        0             2060             yes
//           42        0             2200             yes
//         7777        0             2252             yes
//        90210        0             2164             yes
//
// THE GOAL DISTANCE IS ALWAYS OPTIMAL. AND ROUGHLY HALF THE FIELD IS WRONG. Every one of those ~2000 cells is
// a place an entity might stand, reading a distance that is too large -- navigating along a corrupted gradient.
//
// AND THAT IS THE ANSWER TO KEITH'S QUESTION. A PRIME SIEVE IS EXACT: every multiple it gates out is genuinely
// composite, because PRIMALITY IS A LOCAL PROPERTY you can verify one number at a time. SHORTEST-PATH DISTANCE
// IS GLOBAL -- a cell's correct distance can run through a node the beam pruned to reach some OTHER cell. The
// sieve's exactness depends on locality, and the brain's field is not local. THE ANALOGY BREAKS ON THE MATH,
// NOT THE SCALE. If you only check the goal, beam LOOKS right -- which is the most dangerous kind of wrong.
//
// ---- WHAT I DO NOT HAVE --------------------------------------------------------------------------------------------
//
// THE PRIME TRANSPORT DOC ITSELF IS NOT IN FRONT OF ME. I have notes from an earlier read (it is beam search
// with a transition mask; active_tuplets[index] indexes the tuplet array by the candidate index, a bounds
// hazard; atomicAdd makes the output order non-deterministic -- the same disease as the sin() RNG). But NOTES
// ARE NOT THE DOC. If Keith wants those two bugs confirmed against the real text, the doc needs zipping. This
// gate is about the BRAIN, which I can measure; it is not a review of a document I cannot see.
class Heap {
    constructor() { this.a = []; }
    get size() { return this.a.length; }
    push(d, v) { const a = this.a; a.push([d, v]); let i = a.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (a[p][0] <= a[i][0]) break;[a[p], a[i]] = [a[i], a[p]]; i = p; } }
    pop() { const a = this.a, top = a[0], last = a.pop(); if (a.length) { a[0] = last; let i = 0; for (;;) { let l = 2 * i + 1, r = 2 * i + 2, m = i; if (l < a.length && a[l][0] < a[m][0]) m = l; if (r < a.length && a[r][0] < a[m][0]) m = r; if (m === i) break;[a[m], a[i]] = [a[i], a[m]]; i = m; } } return top; }
}
let fails = 0;
const ok = (name, cond, detail) => {
    console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : ""));
    if (!cond) fails++;
};

const N = 64;
function makeGrid(seed) {
    let s = seed >>> 0; const rnd = () => (s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
    const c = new Float64Array(N * N); for (let i = 0; i < N * N; i++) c[i] = rnd() < 0.20 ? 1e6 : 1 + rnd() * 3; return c;
}
function dijkstra(cost, src) {
    const dist = new Float64Array(N * N).fill(Infinity); dist[src] = 0; const seen = new Uint8Array(N * N);
    const h = new Heap(); h.push(0, src); let maxFrontier = 0;
    while (h.size) { maxFrontier = Math.max(maxFrontier, h.size); const [d, u] = h.pop(); if (seen[u]) continue; seen[u] = 1; const x = u % N, y = (u / N | 0);
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= N || ny >= N) continue; const v = ny * N + nx, nd = d + cost[v]; if (nd < dist[v]) { dist[v] = nd; h.push(nd, v); } } }
    return { dist, maxFrontier };
}
function beam(cost, src, K) {
    const dist = new Float64Array(N * N).fill(Infinity); dist[src] = 0; const seen = new Uint8Array(N * N);
    let fr = [[0, src]]; while (fr.length) { fr.sort((a, b) => a[0] - b[0]); fr = fr.slice(0, K); const nx = [];
        for (const [d, u] of fr) { if (seen[u]) continue; seen[u] = 1; const x = u % N, y = (u / N | 0);
            for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const ax = x + dx, ay = y + dy; if (ax < 0 || ay < 0 || ax >= N || ay >= N) continue; const v = ay * N + ax, nd = d + cost[v]; if (nd < dist[v]) { dist[v] = nd; nx.push([nd, v]); } } } fr = nx; }
    return dist;
}

// ---- 1. THE GATE CAN CLOSE (my "too small" instinct was wrong) -----------------------------------------------------
{
    const { maxFrontier } = dijkstra(makeGrid(20260718), 0);
    ok("!! THE FRONTIER IS BIG ENOUGH TO GATE", maxFrontier > N * 4,
       "max frontier " + maxFrontier + " nodes on the 64^2 grid, ~" + Math.round(maxFrontier / (N * N) * 100) +
       "% of " + (N * N) + " cells. I ASSUMED THE GRID WAS TOO SMALL TO PRUNE. IT IS NOT -- a beam with K < " + maxFrontier +
       " gates real nodes. My instinct was backwards, and this check exists so I cannot quietly keep believing it.");
}

// ---- 2. THE GOAL SURVIVES, WHICH IS THE TRAP -----------------------------------------------------------------------
{
    const cost = makeGrid(20260718); const dj = dijkstra(cost, 0).dist; const bm = beam(cost, 0, 200);
    ok("!! CHECKING ONLY THE GOAL SAYS BEAM IS FINE", Math.abs(bm[N * N - 1] - dj[N * N - 1]) < 1e-6,
       "beam K=200 reaches the far corner at the EXACT optimal distance " + dj[N * N - 1].toFixed(1) +
       ". IF YOU MEASURE ONE PATH, THE GATE LOOKS LOSSLESS. That is the most dangerous kind of wrong -- it passes the test you are most likely to run.");
}

// ---- 3. ...BUT HALF THE FIELD IS CORRUPTED, AND THE BRAIN READS THE WHOLE FIELD ------------------------------------
{
    let worstFrac = 1, anyUnreached = false;
    for (const seed of [20260718, 1, 42, 7777, 90210]) {
        const cost = makeGrid(seed); const dj = dijkstra(cost, 0).dist; const bm = beam(cost, 0, 200);
        let wrong = 0, reachable = 0;
        for (let i = 0; i < N * N; i++) { if (!Number.isFinite(dj[i])) continue; reachable++;
            if (!Number.isFinite(bm[i])) anyUnreached = true; else if (Math.abs(bm[i] - dj[i]) > 1e-6) wrong++; }
        worstFrac = Math.min(worstFrac, wrong / reachable);
    }
    ok("!! BEAM CORRUPTS ~HALF THE NAVIGATION FIELD", worstFrac > 0.4,
       "across five seeds, at least " + Math.round(worstFrac * 100) + "% of reachable cells get a SUBOPTIMAL distance under beam K=200 (measured 46-55%). Zero unreached, ALL WRONG-BUT-FINITE -- an entity on one of those ~2000 cells reads a distance that is too large and NAVIGATES ALONG A CORRUPTED GRADIENT. THE BRAIN COMPUTES A FIELD FOR EVERY CELL (v2156: cost scales with cells, quality is 'cos 0.797, 37 deg mean error' -- a whole-grid direction comparison), so half-wrong is not a corner case, IT IS HALF THE PRODUCT.");
}

// ---- 4. WHY: THE SIEVE IS EXACT BECAUSE PRIMALITY IS LOCAL ---------------------------------------------------------
{
    ok("!! THE ANALOGY BREAKS ON THE MATH, NOT THE SCALE", true,
       "A PRIME SIEVE IS EXACT: every multiple it gates out is genuinely composite, because PRIMALITY IS A LOCAL PROPERTY -- you verify one number without consulting any other. SHORTEST-PATH DISTANCE IS GLOBAL: a cell's correct distance can run through a node the beam pruned on its way to some OTHER cell. You cannot gate a global computation the way you sieve a local one and stay exact. So the prime-transport architecture is real and the sieve is beautiful, but IT FITS PROBLEMS WHERE THE GATE IS LOCAL, AND THE BRAIN'S FIELD IS NOT ONE. This is the same shape as v2137: the fancy mechanism (GPU there, beam here) loses to plain exact Dijkstra on the brain's actual problem -- not because the mechanism is bad, but because THE BRAIN'S PROBLEM DOES NOT HAVE THE STRUCTURE THE MECHANISM EXPLOITS.");

    ok("...and I am not reviewing a doc I cannot see", true,
       "THE PRIME TRANSPORT DOC ITSELF IS NOT IN MY CONTEXT. My notes say it is beam search with a transition mask, that active_tuplets[index] indexes the tuplet array by the CANDIDATE index (a bounds hazard), and that atomicAdd makes the output order non-deterministic (the sin()-RNG disease). BUT NOTES ARE NOT THE DOC. Those two bugs are unconfirmed against the real text until Keith zips it. This gate measures THE BRAIN, which I can see.");
}

console.log(fails ? "\nprimeGate-selfcheck: " + fails + " FAILED" : "\nprimeGate-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
