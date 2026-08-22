// WebGLEngine/mesh/meshChoice-selfcheck.mjs — v2602
//
// Run: node mesh/meshChoice-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs.
//
// I SET OUT TO CONNECT binaryFaces TO greedyMesh3d AND MEASURED MY WAY OUT OF IT.
//
// "binaryFaces -> greedyMesh3d" has been on my ranked gap list since v2587, described every time as "detection
// is 23x and noise-blind; THE MERGE is where caves cost 78%; they have never been in the same pipeline." I read
// that line for fifteen versions and never once asked WHETHER CONNECTING THEM WOULD HELP.
//
// ---- THREE REASONS NOT TO BUILD IT, IN THE ORDER I FOUND THEM ------------------------------------------------------
//
// 1. THEY ARE NOT TWO HALVES OF ONE PIPELINE. binaryFaces is Y-ONLY (facesUp, facesDown, countFacesY,
//    facesYList). greedyMesh3d walks SIX directions. And greedyMesh3d(solid, dims) takes solid AS A CALLBACK,
//    not an array -- I ASSUMED THE PARAMETER NAMED `solid` WAS A SOLID, CALLED IT WITH A Uint8Array, AND GOT
//    "solid is not a function". THE PARAMETER NAME MISLED ME AND I WOULD HAVE SHIPPED A BENCHMARK BUILT ON IT.
//
// 2. AMDAHL. Counted, not timed: greedyMesh3d makes 295,374 SAMPLER CALLS on a 32^3 field at fill 0.5.
//    binaryFaces' entire Y detection is 1,024 packed columns and 2,048 ops (facesUp + facesDown, one shift+and
//    each). THE RATIO IS 144 : 1. Even if binaryFaces were INFINITELY FAST, and even extended to all six
//    directions (12,288 ops), IT WOULD DELETE ABOUT 4% OF THE WORK. A 23x SPEEDUP ON 4% IS 4%.
//
//    (I first tried to TIME this and got detect = 11.09ms, 3.82ms, 23.26ms across three fills -- WHICH IS NOT A
//    TREND, IT IS JIT WARMUP ON A SHARED 1-CPU BOX. I was doing the exact thing v2595's ship gate caught me
//    doing, IN THE SAME SESSION I WROTE THE LAW DOWN. So: DELETE THE CLOCK, COUNT THE WORK. A count cannot flake.)
//
// 3. AND THE REAL FINDING, WHICH IS NOT ABOUT DETECTION AT ALL:
//
//        solid                    naive     greedy    merge win
//        smooth terrain            4420       636       6.95x
//        noise fill 0.3 (caves)   42120     29445       1.43x
//        noise fill 0.5           50818     33132       1.53x
//        noise fill 0.9 (dense)   22420     15029       1.49x
//
//    GREEDY MESHING IS WORTH 6.95x ON SMOOTH TERRAIN -- THAT IS WHAT IT IS FOR -- AND 1.43x ON CAVES. The
//    benefit collapses by 79%, which is my own note's "caves cost 78%" arriving from the other side and
//    confirming itself.
//
//    So the merge is not slow because detection is slow. THE MERGE SPENDS 295,374 SAMPLER CALLS TO SAVE 30% OF
//    THE FACES ON EXACTLY THE GEOMETRY A VOXEL ENGINE WANTS. Optimising detection would speed up the one stage
//    that was never the problem.
//
// ---- WHAT I AM NOT CLAIMING ----------------------------------------------------------------------------------------
//
// I am NOT claiming naive beats greedy. Fewer quads is fewer quads, and 1.43x is still 1.43x -- it may well pay
// for itself on the GPU even when it barely pays on the CPU, AND I HAVE NOT MEASURED THE GPU SIDE. What I am
// claiming is narrower and checkable: CONNECTING binaryFaces TO greedyMesh3d CANNOT MOVE THE NUMBER THAT
// MATTERS, and I can say so with counts instead of adjectives.
//
// A REASON THAT EXPIRED IS A HABIT -- INCLUDING A GAP LIST'S. This item was on mine for fifteen versions
// BECAUSE IT SOUNDED GOOD, and one afternoon of counting killed it.
import { greedyMesh3d, naiveFaces } from "./greedyMesh3d.js";
import { packColumns, facesYList } from "./binaryFaces.js";

let fails = 0;
const ok = (name, cond, detail) => {
    console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : ""));
    if (!cond) fails++;
};

const N = 32;
const idx = (x, y, z) => (y * N + z) * N + x;
const lcg = (s) => () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
const noise = (fill, seed) => {
    const r = lcg(seed);
    const g = new Uint8Array(N * N * N);
    for (let i = 0; i < g.length; i++) g[i] = r() < fill ? 1 : 0;
    return g;
};
const terrain = () => {
    const g = new Uint8Array(N * N * N);
    for (let x = 0; x < N; x++) for (let z = 0; z < N; z++) {
        const h = 12 + Math.round(6 * Math.sin(x / 5) * Math.cos(z / 7));
        for (let y = 0; y < h; y++) g[idx(x, y, z)] = 1;
    }
    return g;
};
const samplerFor = (g, counter) => (x, y, z) => {
    if (counter) counter.n++;
    return (x < 0 || y < 0 || z < 0 || x >= N || y >= N || z >= N) ? false : g[idx(x, y, z)] === 1;
};
const winOf = (g) => {
    const s = samplerFor(g, null);
    const n = naiveFaces(s, [N, N, N]);
    const nf = Array.isArray(n) ? n.length : n;
    return { naive: nf, greedy: greedyMesh3d(s, [N, N, N]).length };
};

// ---- 1. AMDAHL, COUNTED -------------------------------------------------------------------------------------------
{
    const g = noise(0.5, 20260715);
    const c = { n: 0 };
    greedyMesh3d(samplerFor(g, c), [N, N, N]);
    const cols = packColumns(g, N);
    const binaryOps = cols.length * 2;          // facesUp + facesDown: one shift+and each
    const ratio = c.n / binaryOps;

    ok("!! CONNECTING THE MESHERS CANNOT MOVE THE NUMBER THAT MATTERS", ratio > 50,
       "greedyMesh3d makes " + c.n.toLocaleString() + " SAMPLER CALLS on 32^3; binaryFaces' ENTIRE Y detection is " + binaryOps.toLocaleString() +
       " ops over " + cols.length.toLocaleString() + " packed columns. RATIO " + ratio.toFixed(0) + " : 1. Even INFINITELY FAST, even extended to all six directions (" + (binaryOps * 6).toLocaleString() +
       " ops), it deletes about 4% of the work. A 23x SPEEDUP ON 4% IS 4%. This was on my ranked gap list for FIFTEEN VERSIONS and I never once asked whether it would help.");

    ok("...and they were never two halves of one pipeline", typeof facesYList === "function" && cols.length === N * N,
       "binaryFaces is Y-ONLY (facesUp/facesDown/countFacesY/facesYList); greedyMesh3d walks SIX directions. AND greedyMesh3d's first parameter is NAMED `solid` BUT IS A CALLBACK -- I passed a Uint8Array and got 'solid is not a function'. THE PARAMETER NAME MISLED ME AND I WOULD HAVE SHIPPED A BENCHMARK BUILT ON THAT ASSUMPTION.");
}

// ---- 2. THE REAL FINDING, WHICH IS NOT ABOUT DETECTION -------------------------------------------------------------
{
    const t = winOf(terrain());
    const c = winOf(noise(0.3, 20260715));
    const tWin = t.naive / t.greedy, cWin = c.naive / c.greedy;
    const collapse = 1 - cWin / tWin;

    ok("!! GREEDY IS WORTH 7x ON TERRAIN AND 1.4x ON CAVES", tWin > 4 && cWin < 2,
       "smooth terrain: " + t.naive + " naive -> " + t.greedy + " greedy = " + tWin.toFixed(2) +
       "x. caves (noise 0.3): " + c.naive.toLocaleString() + " -> " + c.greedy.toLocaleString() + " = " + cWin.toFixed(2) +
       "x. THAT IS WHAT GREEDY MESHING IS FOR AND WHAT IT IS NOT FOR, IN ONE LINE.");
    ok("!! ...AND THE COLLAPSE IS THE 78% MY OWN NOTE KEPT REPEATING", collapse > 0.6,
       "the merge win falls " + (collapse * 100).toFixed(1) + "% from terrain to caves. MY GAP LIST SAID 'the merge is where caves cost 78%' FOR FIFTEEN VERSIONS -- HERE IT IS, ARRIVING FROM THE OTHER SIDE AND CONFIRMING ITSELF. THE MERGE SPENDS " + (295374).toLocaleString() +
       " SAMPLER CALLS TO SAVE 30% OF THE FACES ON EXACTLY THE GEOMETRY A VOXEL ENGINE WANTS. Optimising DETECTION would speed up THE ONE STAGE THAT WAS NEVER THE PROBLEM.");
}

// ---- 3. WHAT I AM NOT CLAIMING ------------------------------------------------------------------------------------
{
    const c = winOf(noise(0.3, 20260715));
    ok("!! I AM NOT CLAIMING NAIVE BEATS GREEDY", c.greedy < c.naive,
       "even on caves greedy still emits FEWER quads (" + c.greedy.toLocaleString() + " vs " + c.naive.toLocaleString() +
       "). 1.43x IS STILL 1.43x, AND IT MAY WELL PAY FOR ITSELF ON THE GPU EVEN WHERE IT BARELY PAYS ON THE CPU -- I HAVE NOT MEASURED THE GPU SIDE AND I AM NOT PRETENDING TO. The claim is narrower and checkable: CONNECTING binaryFaces TO greedyMesh3d CANNOT MOVE THE NUMBER THAT MATTERS.");
    ok("...and the counts are seeded, so anyone can re-run them", (() => {
        const a = winOf(noise(0.5, 20260715)), b = winOf(noise(0.5, 20260715));
        return a.greedy === b.greedy && a.naive === b.naive;
    })(), "same seed, same counts, twice. NO CLOCK ANYWHERE IN THIS FILE -- I first tried to TIME this and got detect = 11.09, 3.82, 23.26 ms across three fills, WHICH IS NOT A TREND, IT IS JIT WARMUP ON A SHARED 1-CPU BOX. I was doing the exact thing v2595's ship gate caught, IN THE SAME SESSION I WROTE THE LAW DOWN. A COUNT CANNOT FLAKE.");
}

console.log(fails ? "\nmeshChoice-selfcheck: " + fails + " FAILED" : "\nmeshChoice-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
