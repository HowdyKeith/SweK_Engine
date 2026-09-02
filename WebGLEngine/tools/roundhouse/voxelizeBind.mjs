// tools/roundhouse/voxelizeBind.mjs -- v3782
//
// *** TIER 2. THE ROADMAP NAMED "volume convergence against an analytic solid" AND THERE ARE TWO CONVERGENCES
// HERE, NOT ONE. Measuring both before building was what decided the key.
//
//   (a) TESSELLATION -> ANALYTIC. meshVolume() is the divergence theorem over the triangles; a tessellated
//       sphere is INSCRIBED, so it under-reports, and the deficit falls SECOND ORDER as segments double.
//       MEASURED at r=1 against (4/3)pi: 1.600e-1 at seg 8, 4.211e-2 at 16, 1.066e-2 at 32, 2.674e-3 at 64 --
//       RATIOS 3.80, 3.95, 3.99, APPROACHING EXACTLY 4 PER DOUBLING. THAT IS THE KEY.
//
//   (b) VOXELS -> TESSELLATION. voxelVolume() counts filled cells. MEASURED, IT DOES NOT CONVERGE: the
//       relative error against meshVolume is NON-MONOTONE AND MESH-DEPENDENT: at segments 64 it reads
//       1.317e-3, 1.313e-3, 1.908e-3 over n = 16/32/64 (flat, then RISING), and at segments 32 it reads
//       9.199e-4, 1.450e-3, 2.730e-4 (the MIDDLE point is the worst). A RATE KEY HERE WOULD SIMPLY FAIL, and
//       (v4300: BOTH SEQUENCES RE-RUN AND EXACT, non-monotone and bounded in each. Only the segments=32 one is
//       watched -- it is the default and the device emits `ladder` -- so the segments=64 half of the argument
//       for reporting a BOUND AND A SHAPE rather than a rate is confirmed by nothing but a deliberate re-run.)
//       a two-sample "last beats first" test called those two sequences TRUE and FALSE for the same
//       underlying behaviour. THE HONEST READING IS A BOUND PLUS A SHAPE. That is not a defect:
//       a cell-CENTRE membership test has an O(h) SIGNED error that oscillates as centres fall in and out of
//       the surface, and at this size it is already down in the noise of that oscillation rather than in a
//       clean asymptotic regime. IT IS REPORTED AS AN AGREEMENT BOUND, NOT AS A RATE. ***
//
// *** THE DIFFERENCE MATTERS BECAUSE (a) AND (b) ARE DIFFERENT ROUTES. meshVolume integrates over TRIANGLES
// and never visits a grid; voxelize tests POINTS and never sums a triangle. Neither is told (4/3)pi r^3. So
// the analytic value is a third opinion, and the rate in (a) is a claim about the DISCRETISATION rather than
// about either implementation. ***

import { voxelize, meshVolume, voxelVolume, isClosed } from "../../physics/mesh/voxelize.mjs";
import { sphereMesh } from "../../physics/mesh/glb.mjs";

export const VOXELIZE_OBSERVABLES = [
    "analyticVolume", "meshVolumeAt", "deficit", "order", "orderRatios", "secondOrder",
    "voxelVolumeAt", "voxelAgreement", "voxelMonotone", "voxelBounded", "closed", "boundaryEdges", "nonManifoldEdges",
    "radius", "segments", "gridN",
    // v4085 -- COMPLETED: `ladder` (the per-resolution sweep table order/agreement/oneaxis compute from) was
    // returned and never declared. Same defect as v3850/v4082/v4084.
    "ladder",
];

export const VOXELIZE_MODES = ["order", "agreement", "closure", "oneaxis"];

const DEF = { radius: 1, segments: 32, gridN: 32 };

export function voxelizeDefaults(hyp) {
    const h = { mode: "order", ...(hyp || {}) };
    const c = { ...DEF, ...(h.config || {}) };
    const num = (v, d) => (typeof v === "number" && Number.isFinite(v) && v > 0 ? v : d);
    c.radius = Math.min(100, Math.max(0.01, num(c.radius, DEF.radius)));
    c.segments = Math.min(128, Math.max(6, num(c.segments, DEF.segments) | 0));
    c.gridN = Math.min(96, Math.max(8, num(c.gridN, DEF.gridN) | 0));   // voxelize is O(n^3) per point test
    h.config = c;
    if (!VOXELIZE_MODES.includes(h.mode)) h.mode = "order";
    return h;
}

const analyticOf = (r) => 4 / 3 * Math.PI * r * r * r;
const meshAt = (r, seg, oneAxis) => sphereMesh(r, seg, oneAxis ? 4 : Math.max(4, Math.round(seg * 3 / 4)));

export async function buildVoxelize(hyp, base = {}) {
    const h = voxelizeDefaults({ ...hyp, config: { ...(hyp && hyp.config), ...base } });
    const c = h.config;
    const analytic = analyticOf(c.radius);
    const out = { radius: c.radius, segments: c.segments, gridN: c.gridN, analyticVolume: analytic };

    if (h.mode === "closure") {
        const info = isClosed(meshAt(c.radius, c.segments, false));
        out.closed = info.closed;
        out.boundaryEdges = info.boundaryEdges;
        out.nonManifoldEdges = info.nonManifoldEdges;
        return out;
    }

    if (h.mode === "agreement") {
        // *** REPORTED AS A BOUND, NOT A RATE -- see the header. The voxel error is flat across refinement. ***
        const m = meshAt(c.radius, c.segments, false);
        const mv = meshVolume(m);
        const rows = [16, 32, 64].filter((n) => n <= c.gridN * 2).map((n) => {
            const vv = voxelVolume(voxelize(m, { nx: n, ny: n, nz: n }));
            return { n, vv, err: Math.abs(vv - mv) / mv };
        });
        out.meshVolumeAt = mv;
        out.voxelVolumeAt = rows[rows.length - 1].vv;
        out.voxelAgreement = Math.max(...rows.map((r) => r.err));
        // *** `voxelConverges` FIRST READ `last < first/2` AND THAT WAS A BAD TEST -- IT COMPARES TWO SAMPLES
        // AND CALLS THE RESULT CONVERGENCE. Measured, the error is NON-MONOTONE and depends on the mesh it is
        // measuring: at segments 32 it reads 9.199e-4, 1.450e-3, 2.730e-4 over n = 16/32/64 (the MIDDLE point
        // is the worst) and at segments 64 it reads 1.317e-3, 1.313e-3, 1.908e-3 (flat, then RISING). The
        // two-sample test called the first TRUE and the second FALSE for the same underlying behaviour.
        // WHAT IS ACTUALLY TRUE IS A BOUND AND A SHAPE, so both are reported: the error stays small at every
        // resolution, and it DOES NOT FALL MONOTONICALLY. A cell-CENTRE membership test has an O(h) SIGNED
        // error that oscillates as centres cross the surface; there is no clean rate to grade here, and
        // claiming one would be inventing an asymptotic regime this fixture is not in. ***
        out.voxelMonotone = rows.every((r, i) => i === 0 || r.err <= rows[i - 1].err);
        out.voxelBounded = out.voxelAgreement < 5e-3;
        out.ladder = rows;
        return out;
    }

    // *** THE KEY: the tessellation deficit falls SECOND ORDER.
    // `oneaxis` IS THE PLANT AND ITS NAME IS THE FIX FOR A WORSE ONE: I first called it `flatnormal`, which
    // describes SHADING and not what it does. IT PINS THE RINGS AT 4 WHILE THE SEGMENTS DOUBLE -- refining
    // ONE AXIS AND CALLING THE RESULT CONVERGENCE. That is a real modelling mistake (you double a parameter,
    // expect 4x, and the OTHER direction never moved) and the name now says so. A MODE NAMED FOR SOMETHING IT
    // DOES NOT DO IS A LABEL THAT WILL MISLEAD THE NEXT READER. ***
    const flat = h.mode === "oneaxis";
    const segs = [8, 16, 32, 64];
    const rows = segs.map((s) => {
        const mv = meshVolume(meshAt(c.radius, s, flat));
        return { seg: s, mv, deficit: (analytic - mv) / analytic };
    });
    const ratios = [];
    for (let i = 1; i < rows.length; i++) ratios.push(rows[i - 1].deficit / rows[i].deficit);
    out.meshVolumeAt = rows[rows.length - 1].mv;
    out.deficit = rows[rows.length - 1].deficit;
    out.orderRatios = ratios;
    // log2 of the mean ratio: 4x per doubling is order 2. DERIVED FROM CONSECUTIVE PAIRS, never fitted.
    out.order = Math.log2(ratios.reduce((a, b) => a + b, 0) / ratios.length);
    out.secondOrder = ratios.every((r) => r > 3.3 && r < 4.6);
    out.ladder = rows;
    return out;
}

export const voxelizeDevice = {
    modes: VOXELIZE_MODES,
    // "order" is FIRST so the mode-plant contract compares the plant against the mode that owns the rate.
    plantMode: "oneaxis", plantFlips: "order", plantKind: "mode",
    plantIdeal: 2, plantIdealWhy:
        "order is the measured convergence order of the voxelised volume, and a correct three-axis sampling is SECOND order, so the ideal is 2 -- not 0. Sampling one axis takes it 1.97 -> 0.227",
    name: "mesh-volume-convergence", observables: VOXELIZE_OBSERVABLES,
    build: buildVoxelize, defaults: voxelizeDefaults,
};
