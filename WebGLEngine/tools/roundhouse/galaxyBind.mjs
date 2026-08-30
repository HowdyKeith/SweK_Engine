// WebGLEngine/tools/roundhouse/galaxyBind.mjs -- v3382
//
// *** DEVICE 58: THE COSMIC MAP, GRADED BY LINEAR ALGEBRA. ***
//
// FOURTH OF THE FIVE FIELDS THAT HAD A MODULE AND A GATE AND NO BIND (elasticity, reaction, pulsar, galaxy,
// geostats). cosmicMap-selfcheck is short and sound, and EVERY ONE OF ITS THREE CHECKS IS A SEARCH GRADING A
// SEARCH: connectivity by breadth-first traversal, two-wayness by set membership, shortest routes by comparing
// shortestPath against bfsDistances -- which share the frontier idea, the adjacency list and the author. A
// DEVICE THAT RESTATED ANY OF THAT WOULD MOVE THE COVERAGE COUNT AND GRADE NOTHING NEW (the v3201 trap).
//
// *** THE INDEPENDENT ROUTE IS THE ADJACENCY MATRIX. *** Every claim the map makes about itself is also a
// theorem about A, and matrix arithmetic knows nothing about queues, frontiers or visited flags. Three keys,
// all EXACT INTEGERS with no tolerance anywhere:
//
//   TRACES        tr(A) = 0 (no system links to itself), tr(A^2) = the number of RECIPROCATED directed links,
//                 tr(A^3) = 6 x the number of triangles. tr(A^k) counts closed walks of length k, and the 6 is
//                 three starting points times two directions. Measured on the default map: 0, 228, 276 against
//                 228 links and 46 triangles enumerated by a triple loop that forms no matrix. Same shape as
//                 the vibrations device's sum rules (v3336) -- traces of a matrix the module never assembles.
//
//   SPECTRUM      the number of connected pieces equals the MULTIPLICITY OF THE ZERO EIGENVALUE of the graph
//                 Laplacian, and the second-smallest eigenvalue (Fiedler's algebraic connectivity) is positive
//                 exactly when the map is one piece. Measured: multiplicity 1, lambda2 = 5.643e-2, against
//                 components() reporting 1. Maroon a system and BOTH routes move together -- multiplicity 2,
//                 lambda2 EXACTLY 0, components() 2.
//
//   WALKS         the minimum number of jumps from i to j is the smallest L with (A^L)_ij > 0. Checked on ALL
//                 3600 ORDERED PAIRS against bfsDistances: zero mismatches, and the map's diameter is 12 hops. An integer answer
//                 per pair, so there is nothing to be within.
//
// *** THE LOAD-BEARING NEGATIVE NEEDS NO SABOTAGE AND NO TUNED THRESHOLD: tr(A^2) COUNTS ONLY LINKS THAT COME
// BACK. *** A closed walk of length two must leave and return, so a one-way link contributes nothing to it
// while still counting as a link. Drop one direction of one link and the map has 227 links with tr(A^2) = 226 --
// THE GAP IS THE NUMBER OF ONE-WAY LINKS, exactly, and it is computed by a route that never asks whether a
// reverse edge exists. The module's own gate answers the same question by looking the reverse up in a Set.
//
// The eigensolver is IMPORTED from physics/quantum/rmt.js, as the beam device already does -- one symmetric
// eigensolver in this tree, not two.
"use strict";
import { makeGalaxy, buildAdj, bfsDistances, components, asymmetricLinks } from "../../physics/galaxy/cosmicMap.js";
import { symEigenvalues } from "../../physics/quantum/rmt.js";

const DEF = { seed: 42, n: 60, k: 3, zeroTol: 1e-8, maxHops: 24, marooned: 0 };
// *** v3852 -- `unorderedtri` IS THE PLANT, AND `oneway` NEVER WAS ONE. *** plantedCoverage read this device
// as UNCOVERED while its header advertised a LOAD-BEARING NEGATIVE, and the census was right. `oneway` says
// tr(A^2) counts only links that come back, so the gap IS the number of one-way links -- an EXACT STRUCTURAL
// IDENTITY, and its own header says it "NEEDS NO SABOTAGE". A demonstration that an identity discriminates is
// not a plant: nothing is implemented wrongly in either arm.
//
// `unorderedtri` is a wrong method on the right problem: drop the j > i and k > j ordering in countTriangles
// and every triangle is found once per permutation of its vertices. The result is still a positive integer
// that scales with the graph. MEASURED: triangles 46 -> 276 and triangleErr 0 (exact) -> 1380, against a
// tr(A^3) of 276 that DOES NOT MOVE -- the trace route never enumerates a triple, so the identity's other
// side is untouched and the whole excursion belongs to the count.
export const MODES = ["traces", "spectrum", "walks", "island", "oneway", "unorderedtri"];

/** Row-major adjacency matrix from a directed link list. */
export function adjacencyMatrix(n, links) {
    const A = new Float64Array(n * n);
    for (const [a, b] of links) A[a * n + b] = 1;
    return A;
}

const matmul = (X, Y, n) => {
    const Z = new Float64Array(n * n);
    for (let i = 0; i < n; i++) for (let k = 0; k < n; k++) {
        const x = X[i * n + k]; if (x === 0) continue;
        for (let j = 0; j < n; j++) Z[i * n + j] += x * Y[k * n + j];
    }
    return Z;
};
const trace = (X, n) => { let s = 0; for (let i = 0; i < n; i++) s += X[i * n + i]; return s; };

/** Graph Laplacian D - A, symmetric whenever the link list is. */
export function laplacian(A, n) {
    const L = new Float64Array(n * n);
    for (let i = 0; i < n; i++) {
        let deg = 0;
        for (let j = 0; j < n; j++) if (i !== j) { L[i * n + j] = -A[i * n + j]; deg += A[i * n + j]; }
        L[i * n + i] = deg;
    }
    return L;
}

/** Triangles counted by ENUMERATION -- no matrix is formed, so tr(A^3)/6 has something to be checked against. */
/**
 * *** v3852 -- `unordered` DEFAULTS FALSE AND EXISTS SO A PLANT CAN SIT ON THE ONE LINE THAT MAKES THIS A
 * COUNT RATHER THAN AN ENUMERATION: the j > i and k > j ordering. *** Without it every triangle is found once
 * per permutation of its three vertices -- SIX TIMES -- and the result is still a positive integer, still
 * scales with the graph, and still looks exactly like a triangle count. Dropping a canonical ordering is the
 * classic combinatorial over-count, and nothing about the number's shape gives it away.
 *
 * THE TRACE IDENTITY IS THE INDEPENDENT ROUTE: tr(A^3) = 6 * triangles, computed by matrix multiplication that
 * never enumerates a triple. TWO ROUTES SHARING NO CODE, which is what lets one of them be planted.
 */
export function countTriangles(A, n, { unordered = false } = {}) {
    let t = 0;
    if (unordered) {
        for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) { if (!A[i * n + j]) continue; for (let k = 0; k < n; k++) if (A[j * n + k] && A[i * n + k]) t++; }
        return t;
    }
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) { if (!A[i * n + j]) continue; for (let k = j + 1; k < n; k++) if (A[j * n + k] && A[i * n + k]) t++; }
    return t;
}

/** First power L at which each ordered pair becomes reachable: the walk-theoretic hop distance. */
export function walkDistances(A, n, maxHops) {
    const D = new Array(n * n).fill(Infinity);
    for (let i = 0; i < n; i++) D[i * n + i] = 0;
    let P = A;
    for (let L = 1; L <= maxHops; L++) {
        let filledAny = false;
        for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) if (D[i * n + j] === Infinity && P[i * n + j] > 0.5) { D[i * n + j] = L; filledAny = true; }
        if (!filledAny && L > 1) break;
        if (L < maxHops) P = matmul(P, A, n);
    }
    return D;
}

function spectral(A, n, zeroTol) {
    const ev = Array.from(symEigenvalues(laplacian(A, n), n)).sort((p, q) => p - q);
    return { zeroMultiplicity: ev.filter((v) => Math.abs(v) < zeroTol).length, fiedler: ev[1], smallest: ev[0], largest: ev[ev.length - 1] };
}

export function defaults({ mode = "traces" } = {}) {
    if (!MODES.includes(mode)) return null;
    return { mode, config: { ...DEF } };
}

export function build({ mode = "traces", config = {} } = {}) {
    if (!MODES.includes(mode)) throw new Error("galaxy: undeclared mode " + mode);
    const c = { ...DEF, ...config };
    const G = makeGalaxy(c.seed, c.n, c.k), n = G.systems.length;
    const A = adjacencyMatrix(n, G.links);

    if (mode === "traces" || mode === "unorderedtri") {
        // The plant runs THIS fixture -- same map, same matrices -- and corrupts only the enumeration route,
        // so the trace side of the identity is untouched and the separation belongs to the count.
        const A2 = matmul(A, A, n), A3 = matmul(A2, A, n);
        const tri = countTriangles(A, n, { unordered: mode === "unorderedtri" });
        return {
            trA: trace(A, n), trA2: trace(A2, n), trA3: trace(A3, n),
            linkCount: G.links.length, triangles: tri,
            reciprocalGap: G.links.length - trace(A2, n),      // 0 iff every link comes back
            triangleErr: Math.abs(trace(A3, n) - 6 * tri),
            selfLoops: trace(A, n),
        };
    }

    if (mode === "spectrum") {
        const s = spectral(A, n, c.zeroTol);
        const comp = components(n, buildAdj(n, G.links));
        return {
            zeroMultiplicity: s.zeroMultiplicity, componentCount: comp.count,
            spectralAgrees: s.zeroMultiplicity === comp.count,
            fiedler: s.fiedler, connected: s.fiedler > c.zeroTol,
            smallestEigenvalue: s.smallest, largestEigenvalue: s.largest,
        };
    }

    if (mode === "walks") {
        const D = walkDistances(A, n, c.maxHops);
        let mismatches = 0, pairs = 0, ecc = 0;
        for (let i = 0; i < n; i++) {
            const bfs = bfsDistances(buildAdj(n, G.links), i);
            for (let j = 0; j < n; j++) { pairs++; if (D[i * n + j] !== bfs[j]) mismatches++; if (Number.isFinite(bfs[j])) ecc = Math.max(ecc, bfs[j]); }
        }
        return { pairs, mismatches, eccentricity: ecc, agreementFrac: (pairs - mismatches) / pairs };
    }

    if (mode === "island") {
        // Maroon one system by dropping every link that touches it. Two independent routes must BOTH notice.
        const cut = G.links.filter((e) => e[0] !== c.marooned && e[1] !== c.marooned);
        const Ac = adjacencyMatrix(n, cut);
        const before = spectral(A, n, c.zeroTol), after = spectral(Ac, n, c.zeroTol);
        return {
            multiplicityBefore: before.zeroMultiplicity, multiplicityAfter: after.zeroMultiplicity,
            fiedlerBefore: before.fiedler, fiedlerAfter: after.fiedler,
            bfsBefore: components(n, buildAdj(n, G.links)).count, bfsAfter: components(n, buildAdj(n, cut)).count,
            bothNoticed: after.zeroMultiplicity === components(n, buildAdj(n, cut)).count && after.zeroMultiplicity > before.zeroMultiplicity,
        };
    }

    // oneway: the trace identity as a symmetry test, by a route that never looks for a reverse edge.
    const [a0, b0] = G.links[0];
    const cut = G.links.filter((e) => !(e[0] === b0 && e[1] === a0));
    const Ac = adjacencyMatrix(n, cut);
    const gapClean = G.links.length - trace(matmul(A, A, n), n);
    const gapBroken = cut.length - trace(matmul(Ac, Ac, n), n);
    return {
        gapClean, gapBroken,
        setCountClean: asymmetricLinks(G.links), setCountBroken: asymmetricLinks(cut),
        traceMatchesSet: gapClean === asymmetricLinks(G.links) && gapBroken === asymmetricLinks(cut),
        linksClean: G.links.length, linksBroken: cut.length,
    };
}

/** Every observable any mode emits -- the roundhouse's proposer reads this list, so it must be complete. */
export const GALAXY_OBSERVABLES = [
    "trA", "trA2", "trA3", "linkCount", "triangles", "reciprocalGap", "triangleErr", "selfLoops",
    "zeroMultiplicity", "componentCount", "spectralAgrees", "fiedler", "connected", "smallestEigenvalue", "largestEigenvalue",
    "pairs", "mismatches", "eccentricity", "agreementFrac",
    "multiplicityBefore", "multiplicityAfter", "fiedlerBefore", "fiedlerAfter", "bfsBefore", "bfsAfter", "bothNoticed",
    "gapClean", "gapBroken", "setCountClean", "setCountBroken", "traceMatchesSet", "linksClean", "linksBroken",
];

/** The device descriptor, in the same shape every other bind uses -- ONE declaration, not a second convention. */
export const galaxyDevice = {
    // "traces" stays FIRST: it owns triangleErr, and the contract compares the plant against modes[0].
    modes: MODES, name: "cosmic-map-spectral", observables: GALAXY_OBSERVABLES, build, defaults,
    // v4129 -- RELABELED. plantMode/plantFlips are both declared and plantMode is in this device's own modes
    // list, so plantedCoverage.mjs's declaredPlantMode()/probeModePlant() path takes this device BEFORE the
    // method path ever runs and grades it as a mode-plant regardless of the label here -- MEASURED, triangleErr
    // 0 -> 1380 under mode "unorderedtri". "method" was the label for a mechanism this device does not use.
    plantMode: "unorderedtri", plantFlips: "triangleErr", plantKind: "mode",
};
export default galaxyDevice;
