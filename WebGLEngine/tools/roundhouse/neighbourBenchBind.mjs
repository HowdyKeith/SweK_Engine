// tools/roundhouse/neighbourBenchBind.mjs -- v3805
//
// *** KEITH ASKED FOR THIS AT v3792 IN HIS OWN WORDS: a Morton BVH is "the alternative worth MEASURING rather
// than assuming better" for SPH neighbour search. THE ANSWER IS THAT IT IS NOT BETTER HERE, AND THE MARGIN IS
// NOT CLOSE: the hashed grid examines 33.4 / 71.8 / 92.2 candidates per query at N = 500 / 2000 / 8000, and
// the BVH visits 278.3 / 580.9 / 819.9 nodes -- 8.3x, 8.1x, 8.9x MORE WORK, STABLE ACROSS A SIXTEENFOLD RANGE
// so it is not a size artefact. And that is BEFORE the rebuild, which SPH pays EVERY STEP because the
// particles move: 15999 nodes at N = 8000. ***
//
// *** WHY, AND THE REASON IS ABOUT THE WORKLOAD RATHER THAN THE STRUCTURES: SPH PARTICLES ARE NEAR-UNIFORMLY
// DISTRIBUTED AND SHARE ONE INTERACTION RADIUS, which is precisely the case a uniform hash grid is optimal
// for -- constant-time bucketing with no tree to descend. A BVH earns its keep on HETEROGENEOUS SIZES and
// SPARSE OR CLUSTERED data, and SPH has neither. Keith's reference demo has both: 10,000 boxes of RANDOM
// SIZES flying through mostly-empty space. THE DEMO IS RIGHT AND SO IS THE GRID; THEY ARE ANSWERING DIFFERENT
// QUESTIONS. ***
//
// *** AND THE COUNTS ARE ONLY READ BECAUSE CORRECTNESS PASSED FIRST: 2000 of 2000 neighbour lists IDENTICAL.
// A FASTER STRUCTURE THAT RETURNS A DIFFERENT SET IS NOT FASTER, IT IS WRONG. The count is node visits and
// candidate examinations, NOT milliseconds -- this sandbox is one core, so a runtime here is not a runtime for
// the rig. CHECKS ARE MACHINE-INDEPENDENT. ***

import { buildBvh, bvhNear } from "../../physics/sph/bvhNeighbours.mjs";
import { SpatialGrid } from "../../physics/sph/spatialGrid.js";

export const NBENCH_OBSERVABLES = [
    "sizes", "identicalLists", "differingLists", "listsMatch",
    "gridCandPerQuery", "bvhVisitsPerQuery", "ratios", "gridWins", "ratioStable", "bvhBuildNodes",
];

export const NBENCH_MODES = ["compare", "boxhits"];

const DEF = { sizes: [[500, 0.15], [2000, 0.12]], seed: 7 };

export function nbenchDefaults(hyp) {
    const h = { mode: "compare", ...(hyp || {}) };
    const c = { ...DEF, ...(h.config || {}) };
    if (!Array.isArray(c.sizes) || !c.sizes.length) c.sizes = DEF.sizes.map((s) => s.slice());
    h.config = c;
    if (!NBENCH_MODES.includes(h.mode)) h.mode = "compare";
    return h;
}

const cloud = (n, seed) => {
    let s = seed; const rnd = () => (s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
    const ps = []; for (let i = 0; i < n; i++) ps.push({ x: rnd(), y: rnd(), z: rnd() });
    return ps;
};
const within = (ps, i, j, r) => {
    const a = ps[i], b = ps[j];
    return (a.x - b.x) ** 2 + (a.y - b.y) ** 2 + (a.z - b.z) ** 2 <= r * r;
};
const key = (arr) => [...new Set(arr)].sort((a, b) => a - b).join(",");

export async function buildNbench(hyp, base = {}) {
    const h = nbenchDefaults({ ...hyp, config: { ...(hyp && hyp.config), ...base } });
    const c = h.config;
    // *** THE PLANT: compare the BVH's RAW BOX HITS against the grid's radius-filtered list. The BVH then looks
    // like it is doing less work per USEFUL result, because it is being credited with answering an easier
    // question -- exactly the trap the v3792 conditions named. ***
    const boxHits = h.mode === "boxhits";

    const out = { sizes: c.sizes.map((s) => s.slice()) };
    let identical = 0, differing = 0;
    const gridCand = [], bvhVisits = [], build = [];

    for (const [N, R] of c.sizes) {
        const ps = cloud(N, c.seed);
        const g = new SpatialGrid(R); g.rebuild(ps);
        const bvh = buildBvh(ps, R);
        build.push(bvh.built);
        let cand = 0, visits = 0;
        for (let i = 0; i < N; i++) {
            const p = ps[i];
            g.forEachNear(p.x, p.y, p.z, () => { cand++; });
            const bb = bvhNear(bvh, p.x, p.y, p.z, R);
            visits += bb.checks;
            const gh = g.near(p.x, p.y, p.z).filter((j) => within(ps, i, j, R));
            const bh = boxHits ? bb.hits : bb.hits.filter((j) => within(ps, i, j, R));
            if (key(gh) === key(bh)) identical++; else differing++;
        }
        gridCand.push(cand / N);
        bvhVisits.push(visits / N);
    }

    out.identicalLists = identical;
    out.differingLists = differing;
    // *** THE PRECONDITION: the counts below mean NOTHING unless both structures answered the same question. ***
    out.listsMatch = differing === 0;
    out.gridCandPerQuery = gridCand;
    out.bvhVisitsPerQuery = bvhVisits;
    out.bvhBuildNodes = build;
    out.ratios = bvhVisits.map((v, i) => v / gridCand[i]);
    out.gridWins = out.listsMatch && out.ratios.every((r) => r > 1);
    const lo = Math.min(...out.ratios), hi = Math.max(...out.ratios);
    out.ratioStable = hi / lo < 1.5;      // stable across sizes means a property, not an artefact of one N
    return out;
}

export const neighbourBenchDevice = {
    // *** v4035 -- DECLARED, BECAUSE THE ELEMENTWISE LADDER IS RIGHT TO DECLINE THIS ONE. ***
    // `sizes` is a list of (N, radius) PAIRS, so its entries are arrays rather than numbers and knobLiveness's
    // array ladder correctly refuses it -- scaling a pair would multiply a particle count and a cutoff radius
    // by the same factor, which is two different physical changes wearing one number. The alternatives move
    // each independently: one raises the counts at the default radii, the other widens the radii at the
    // default counts, so a reading that came only from N and one that came only from h are distinguishable.
    knobChoices: { sizes: [[[500, 0.15], [2000, 0.12]], [[800, 0.15], [3000, 0.12]], [[500, 0.25], [2000, 0.2]]] },

    modes: NBENCH_MODES,
    plantMode: "boxhits", plantFlips: "differingLists", plantKind: "mode",
    plantIdeal: 0, plantIdealWhy:
        "differingLists counts neighbour lists on which two methods disagree, so agreement is exactly 0 of 2500; boxhits disagrees on ALL 2500, and identicalLists falls 2500 -> 0 as the paired positive statement",
    name: "sph-neighbour-bench", observables: NBENCH_OBSERVABLES,
    build: buildNbench, defaults: nbenchDefaults,
};
