// FILE: tools/ship/budgetExile.mjs -- v4425
//
// *** CROSSING THE SHIP-TIME BUDGET IS A ONE-WAY DOOR, AND NOTHING IN THE TREE CAN OPEN IT. ***
//
// tools/ship/quickSweep.mjs decides which gates a round runs:
//
//     selectGates:   timings[g] > budgetMs  ->  skipped, not run
//     runQuickSweep: for (const r of rows) timings[r.gate] = r.serialMs ?? r.parallelMs;
//
// and `rows` is built only from the gates it RAN. So a skipped gate's recorded time is never rewritten, and
// the only thing that could rewrite it is the sweep that just refused to run it. ONCE A GATE'S TIME CROSSES
// THE BUDGET, IT STAYS ACROSS FOREVER. A single slow observation -- eight-way contention, a cold cache, one
// unlucky minute -- exiles a gate from every future ship sweep, permanently, and no amount of the gate
// getting faster can bring it back.
//
// *** THIS IS NOT A THEORY ABOUT THE CODE. FOUR GATES ARE SITTING IN IT RIGHT NOW WITH A RECORDED FAILURE. ***
// v4424 found six gates carrying exit code 1 in sweep-timings.json and on no register at all. Run one at a
// time they ALL EXIT 0 -- the codes are stale, from whenever those gates last ran. Four of the six now finish
// in under the 3 s budget (fetchCap 5976 -> 2157, orrery 13931 -> 2369, splatSort 3615 -> 1230, typecheck
// 5292 -> 2391) and are STILL SKIPPED, on a number that has been wrong for as long as it has been unread.
// The record of their failure is preserved indefinitely by the same rule that guarantees it can never be
// corrected.
//
// ---- *** WHY THIS IS THE OTHER HALF OF v4424 AND NOT A REPEAT OF IT *** ---------------------------------------
//
// That round measured the 63 gates redCensus NAMES as unmeasured and found three standing reds. The wider
// fact it uncovered was that the ship gate runs 936 of 1446 gates, skips 510 over the budget, and 437 of
// those are on no register at all. v4424 said out loud that one red outside the bucket was an anecdote and
// not a rate. This round asks what the 510 actually are -- and the answer turns out to be less about what
// they contain than about how they got there and why they cannot leave.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runQuickSweep, selectGates, DEFAULTS } from "./quickSweep.mjs";

export const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

/**
 * *** THE RULE, WRITTEN DOWN SO A CHECK CAN FAIL ON IT RATHER THAN ON A PARAPHRASE OF IT. ***
 *
 * Both halves are needed and neither is enough alone: a budget that skips is fine if something re-measures,
 * and a rewrite that skips the skipped is fine if nothing is ever excluded. Together they absorb.
 */
export const ABSORBING = Object.freeze({
    skipRule: "selectGates: a gate is skipped when its LAST RECORDED time exceeds the budget",
    writeRule: "runQuickSweep: timings are rewritten only for gates that RAN",
    consequence: "a skipped gate's time can never decrease, so the skip is permanent",
    escapes: "raising --budget, or editing the file by hand. Nothing automatic, and no round has done either.",
});

/**
 * Demonstrate the absorbing state end to end against the real sweep.
 *
 * *** A PROPERTY ABOUT TWO FUNCTIONS COMPOSED IS NOT PROVED BY READING EITHER OF THEM. *** This seeds a
 * timings file that claims one cheap gate is slow, runs the actual quickSweep over that one gate, and reads
 * the file back: the gate is not run, and its lie survives the write.
 *
 * @param gate a CHEAP real gate. It must not be this module's own gate, which would recurse.
 */
export async function demonstrateAbsorbing({ gate = "ev/tools/es-tactics-selfcheck.mjs", staleMs = 999999,
                                             budgetMs = DEFAULTS.budgetMs, root = ENG } = {}) {
    const rel = path.join("tools", "ship", ".budgetExile-fixture-timings.json");
    const abs = path.join(root, rel);
    fs.writeFileSync(abs, JSON.stringify({ captured: null, budgetMs, capMs: DEFAULTS.capMs,
        timings: { [gate]: staleMs }, codes: { [gate]: 1 }, observed: { [gate]: "2020-01-01T00:00:00.000Z" } }, null, 1));
    try {
        const out = await runQuickSweep({ gates: [gate], budgetMs, timingsFile: rel, root, write: true, workers: 1 });
        const after = JSON.parse(fs.readFileSync(abs, "utf8"));
        return { ran: out.ran, skipped: out.skippedOverBudget, msAfter: after.timings[gate], codeAfter: after.codes[gate],
                 observedAfter: (after.observed || {})[gate], captured: after.captured };
    } finally {
        try { fs.unlinkSync(abs); } catch { /* the fixture is scratch: a failed unlink is not a finding */ }
    }
}

/** The skip decision alone, for a hand-made timings map. */
export function exiled(gates, timings, budgetMs = DEFAULTS.budgetMs) {
    return selectGates(gates, timings, budgetMs).skipped;
}

// ==== MEASURED_V4425 ====
export const MEASURED_V4425 = Object.freeze({
    "ai-bridge/assetSync-perf-selfcheck.mjs": { verdict: "GREEN", ms: 3057 },
    "ai-bridge/deviceOffThread-selfcheck.mjs": { verdict: "GREEN", ms: 6687 },
    "ai-bridge/deviceWorker-selfcheck.mjs": { verdict: "GREEN", ms: 6831 },
    "ai-bridge/fingerprintBridge-selfcheck.mjs": { verdict: "GREEN", ms: 7259 },
    "ai-bridge/freshMachine-selfcheck.mjs": { verdict: "GREEN", ms: 5194 },
    "ai-bridge/tools/discovery-selfcheck.mjs": { verdict: "GREEN", ms: 5853 },
    "brain/bench/bandit-selfcheck.mjs": { verdict: "GREEN", ms: 5252 },
    "brain/rl/dock-selfcheck.mjs": { verdict: "GREEN", ms: 4266 },
    "brain/rl/hunt-transfer-selfcheck.mjs": { verdict: "GREEN", ms: 2555 },
    "brain/rl/imitation-selfcheck.mjs": { verdict: "GREEN", ms: 5799 },
    "brain/rl/memory-selfcheck.mjs": { verdict: "GREEN", ms: 961 },
    "brain/rl/memoryPolicy-selfcheck.mjs": { verdict: "GREEN", ms: 1528 },
    "brain/rl/occlusion-memory-selfcheck.mjs": { verdict: "GREEN", ms: 4747 },
    "brain/rl/tools/rocket-selfcheck.mjs": { verdict: "GREEN", ms: 8942 },
    "brain/tools/maze-walker-selfcheck.mjs": { verdict: "GREEN", ms: 941 },
    "engine/frameDirty-selfcheck.mjs": { verdict: "GREEN", ms: 820 },
    "ev/esFleetSize-selfcheck.mjs": { verdict: "GREEN", ms: 9045 },
    "ev/tools/es-arena-selfcheck.mjs": { verdict: "GREEN", ms: 2212 },
    "fluid/flip2d-selfcheck.mjs": { verdict: "GREEN", ms: 1083 },
    "fluid/freeSurface-selfcheck.mjs": { verdict: "GREEN", ms: 2491 },
    "physics/adaptiveKnob-selfcheck.mjs": { verdict: "GREEN", ms: 3527 },
    "physics/blackhole/kerrOrbit-selfcheck.mjs": { verdict: "GREEN", ms: 1363 },
    "physics/blackhole/mission-selfcheck.mjs": { verdict: "GREEN", ms: 5934 },
    "physics/blackhole/navigate-selfcheck.mjs": { verdict: "GREEN", ms: 1614 },
    "physics/blackhole/tour-selfcheck.mjs": { verdict: "GREEN", ms: 1152 },
    "physics/control/cartPole-selfcheck.mjs": { verdict: "GREEN", ms: 6843 },
    "physics/control/controlMargins-selfcheck.mjs": { verdict: "GREEN", ms: 911 },
    "physics/control/controlStability-selfcheck.mjs": { verdict: "GREEN", ms: 1032 },
    "physics/control/controlStateSpace-selfcheck.mjs": { verdict: "GREEN", ms: 6102 },
    "physics/diffusionKnob-selfcheck.mjs": { verdict: "GREEN", ms: 9605 },
    "physics/em/fresnelJoin-selfcheck.mjs": { verdict: "GREEN", ms: 1662 },
    "physics/em/hall-selfcheck.mjs": { verdict: "GREEN", ms: 1376 },
    "physics/em/waveguide-selfcheck.mjs": { verdict: "GREEN", ms: 1059 },
    "physics/fluid/gravityWaves-selfcheck.mjs": { verdict: "GREEN", ms: 1272 },
    "physics/fluidBox3d-selfcheck.mjs": { verdict: "GREEN", ms: 8233 },
    "physics/hmc/inference-selfcheck.mjs": { verdict: "GREEN", ms: 2702 },
    "physics/jolt/jolt-ragdoll-vs-wall-selfcheck.mjs": { verdict: "GREEN", ms: 964 },
    "physics/jolt/jolt-structures-selfcheck.mjs": { verdict: "GREEN", ms: 2185 },
    "physics/knobRegistry-selfcheck.mjs": { verdict: "GREEN", ms: 5361 },
    "physics/md/diffusion-selfcheck.mjs": { verdict: "GREEN", ms: 7997 },
    "physics/md/maxwellSpeed-selfcheck.mjs": { verdict: "GREEN", ms: 1280 },
    "physics/mechanics/contactKeys-selfcheck.mjs": { verdict: "GREEN", ms: 2369 },
    "physics/mechanics/reposeOps-selfcheck.mjs": { verdict: "GREEN", ms: 2292 },
    "physics/mesh/dualContour-selfcheck.mjs": { verdict: "GREEN", ms: 1078 },
    "physics/mesh/manifoldCensus-selfcheck.mjs": { verdict: "GREEN", ms: 574 },
    "physics/mesh/marchingCubes-selfcheck.mjs": { verdict: "GREEN", ms: 1556 },
    "physics/mesh/meshCSG-selfcheck.mjs": { verdict: "GREEN", ms: 5665 },
    "physics/mesh/quadraticRecon-selfcheck.mjs": { verdict: "GREEN", ms: 1372 },
    "physics/mesh/quadraticWall-selfcheck.mjs": { verdict: "GREEN", ms: 1474 },
    "physics/mesh/rowWeight-selfcheck.mjs": { verdict: "GREEN", ms: 2204 },
    "physics/mesh/svgProfile-selfcheck.mjs": { verdict: "GREEN", ms: 2036 },
    "physics/mesh/tetRank-selfcheck.mjs": { verdict: "GREEN", ms: 875 },
    "physics/mesh/voxelize-selfcheck.mjs": { verdict: "GREEN", ms: 1071 },
    "physics/mpm/mpmDevice-selfcheck.mjs": { verdict: "GREEN", ms: 1011 },
    "physics/nuclear/kinetics-selfcheck.mjs": { verdict: "GREEN", ms: 4794 },
    "physics/octree/svoMarch-selfcheck.mjs": { verdict: "GREEN", ms: 971 },
    "physics/optics/diffraction-selfcheck.mjs": { verdict: "GREEN", ms: 998 },
    "physics/optics/fresnel-selfcheck.mjs": { verdict: "GREEN", ms: 2190 },
    "physics/percolation/percolation-selfcheck.mjs": { verdict: "GREEN", ms: 3185 },
    "physics/pileKnob-selfcheck.mjs": { verdict: "GREEN", ms: 3391 },
    "physics/quantum/bell-selfcheck.mjs": { verdict: "GREEN", ms: 3897 },
    "physics/quantum/kronigPenney-selfcheck.mjs": { verdict: "GREEN", ms: 3132 },
    "physics/quantum/landauZener-selfcheck.mjs": { verdict: "GREEN", ms: 2709 },
    "physics/render/directStrategy-selfcheck.mjs": { verdict: "GREEN", ms: 4351 },
    "physics/render/energyCompWgsl-selfcheck.mjs": { verdict: "GREEN", ms: 7724 },
    "physics/render/energyCompensation-selfcheck.mjs": { verdict: "GREEN", ms: 2101 },
    "physics/render/fresnelWgsl-selfcheck.mjs": { verdict: "GREEN", ms: 3392 },
    "physics/render/furnaceWgsl-selfcheck.mjs": { verdict: "GREEN", ms: 7783 },
    "physics/render/lightRouting-selfcheck.mjs": { verdict: "GREEN", ms: 1376 },
    "physics/render/microfacet-selfcheck.mjs": { verdict: "GREEN", ms: 2392 },
    "physics/render/microfacetAnisoWgsl-selfcheck.mjs": { verdict: "GREEN", ms: 1617 },
    "physics/render/microfacetSampleWgsl-selfcheck.mjs": { verdict: "GREEN", ms: 1906 },
    "physics/render/microfacetVndf-selfcheck.mjs": { verdict: "GREEN", ms: 2878 },
    "physics/render/microfacetWgsl-selfcheck.mjs": { verdict: "GREEN", ms: 1319 },
    "physics/render/misWgsl-selfcheck.mjs": { verdict: "GREEN", ms: 3227 },
    "physics/render/msDirect-selfcheck.mjs": { verdict: "GREEN", ms: 5115 },
    "physics/render/pathStrat-selfcheck.mjs": { verdict: "GREEN", ms: 1491 },
    "physics/render/pathTracer-selfcheck.mjs": { verdict: "GREEN", ms: 1344 },
    "physics/render/pathTracerNEE-selfcheck.mjs": { verdict: "GREEN", ms: 779 },
    "physics/render/renderBsdf-selfcheck.mjs": { verdict: "GREEN", ms: 5365 },
    "physics/render/sdfMarch-selfcheck.mjs": { verdict: "GREEN", ms: 2763 },
    "physics/render/shuffleEffect-selfcheck.mjs": { verdict: "GREEN", ms: 5043 },
    "physics/scoreDirection-selfcheck.mjs": { verdict: "GREEN", ms: 4239 },
    "physics/soft/fleshSph-selfcheck.mjs": { verdict: "GREEN", ms: 4370 },
    "physics/sph/cfl-selfcheck.mjs": { verdict: "GREEN", ms: 8593 },
    "physics/sph/cflStabilityKeys-selfcheck.mjs": { verdict: "GREEN", ms: 1062 },
    "physics/sph/spatialGrid-selfcheck.mjs": { verdict: "GREEN", ms: 1283 },
    "physics/statmech/binderBudget-selfcheck.mjs": { verdict: "GREEN", ms: 9355 },
    "physics/statmech/ising-selfcheck.mjs": { verdict: "GREEN", ms: 6649 },
    "physics/statmech/tempering-selfcheck.mjs": { verdict: "GREEN", ms: 1780 },
    "physics/statmech/wolff-selfcheck.mjs": { verdict: "GREEN", ms: 2282 },
    "physics/stellar/laneEmden-selfcheck.mjs": { verdict: "GREEN", ms: 10045 },
    "physics/sync/kuramoto-selfcheck.mjs": { verdict: "GREEN", ms: 9219 },
    "physics/tempModulator-selfcheck.mjs": { verdict: "GREEN", ms: 3788 },
    "physics/thermal/bec-selfcheck.mjs": { verdict: "GREEN", ms: 2459 },
    "physics/thermal/chemicalPotential-selfcheck.mjs": { verdict: "GREEN", ms: 720 },
    "physics/thermal/freeze-selfcheck.mjs": { verdict: "GREEN", ms: 2670 },
    "physics/tomography/adjoint-selfcheck.mjs": { verdict: "GREEN", ms: 1570 },
    "physics/tomography/sirtKeys-selfcheck.mjs": { verdict: "GREEN", ms: 1409 },
    "physics/vibrationKnob-selfcheck.mjs": { verdict: "GREEN", ms: 12142 },
    "physics/xpbd/frictionKey-selfcheck.mjs": { verdict: "GREEN", ms: 3938 },
    "physics/xpbd/frictionalContact-selfcheck.mjs": { verdict: "GREEN", ms: 1682 },
    "physics/xpbd/scheduleKey-selfcheck.mjs": { verdict: "GREEN", ms: 2961 },
    "physics/xpbd/solverParity-selfcheck.mjs": { verdict: "GREEN", ms: 2924 },
    "physicsLab-selfcheck.mjs": { verdict: "GREEN", ms: 3608 },
    "shaders/ashimaNoise-selfcheck.mjs": { verdict: "GREEN", ms: 1598 },
    "simulation/lbm/twoFExperiment-selfcheck.mjs": { verdict: "GREEN", ms: 1072 },
    "simulation/lbm/twoFFrequency-selfcheck.mjs": { verdict: "GREEN", ms: 4231 },
    "tools/bench/fleetBench-selfcheck.mjs": { verdict: "GREEN", ms: 5807 },
    "tools/caseStudy-selfcheck.mjs": { verdict: "RED", ms: 770 },
    "tools/catalog/catalog-selfcheck.mjs": { verdict: "GREEN", ms: 1947 },
    "tools/fingerprint/attest-selfcheck.mjs": { verdict: "GREEN", ms: 2338 },
    "tools/fingerprint/fingerprint-selfcheck.mjs": { verdict: "GREEN", ms: 2146 },
    "tools/fingerprint/libmTripwire-selfcheck.mjs": { verdict: "GREEN", ms: 729 },
    "tools/fingerprint/peerReport-selfcheck.mjs": { verdict: "GREEN", ms: 6636 },
    "tools/frame-budget-selfcheck.mjs": { verdict: "GREEN", ms: 792 },
    "tools/hashConsistency-selfcheck.mjs": { verdict: "GREEN", ms: 724 },
    "tools/krbn/sceneMeshes-selfcheck.mjs": { verdict: "GREEN", ms: 1934 },
    "tools/render-qa/edgeBiasOracle-selfcheck.mjs": { verdict: "GREEN", ms: 5263 },
    "tools/render-qa/traceAscii-selfcheck.mjs": { verdict: "GREEN", ms: 2494 },
    "tools/roundhouse/airySlitAdoption-selfcheck.mjs": { verdict: "GREEN", ms: 6172 },
    "tools/roundhouse/androidVerdict-selfcheck.mjs": { verdict: "GREEN", ms: 6196 },
    "tools/roundhouse/bellBind-selfcheck.mjs": { verdict: "GREEN", ms: 7925 },
    "tools/roundhouse/blackHoleBind-selfcheck.mjs": { verdict: "GREEN", ms: 2134 },
    "tools/roundhouse/blobBodies-selfcheck.mjs": { verdict: "GREEN", ms: 3105 },
    "tools/roundhouse/boundKeys-selfcheck.mjs": { verdict: "GREEN", ms: 4743 },
    "tools/roundhouse/cartPoleBind-selfcheck.mjs": { verdict: "GREEN", ms: 6947 },
    "tools/roundhouse/cflBind-selfcheck.mjs": { verdict: "GREEN", ms: 1663 },
    "tools/roundhouse/chemicalPotentialBind-selfcheck.mjs": { verdict: "GREEN", ms: 1319 },
    "tools/roundhouse/configContract-selfcheck.mjs": { verdict: "GREEN", ms: 3026 },
    "tools/roundhouse/corroborate-selfcheck.mjs": { verdict: "GREEN", ms: 6062 },
    "tools/roundhouse/crossDevice-selfcheck.mjs": { verdict: "GREEN", ms: 1854 },
    "tools/roundhouse/diffusion-selfcheck.mjs": { verdict: "GREEN", ms: 2252 },
    "tools/roundhouse/errorPairAudit-selfcheck.mjs": { verdict: "GREEN", ms: 6540 },
    "tools/roundhouse/errorSign-selfcheck.mjs": { verdict: "GREEN", ms: 2880 },
    "tools/roundhouse/escTolKnob-selfcheck.mjs": { verdict: "GREEN", ms: 8413 },
    "tools/roundhouse/escapeBudget-selfcheck.mjs": { verdict: "GREEN", ms: 5114 },
    "tools/roundhouse/gateActivity-selfcheck.mjs": { verdict: "GREEN", ms: 4473 },
    "tools/roundhouse/gpuProvenance-selfcheck.mjs": { verdict: "GREEN", ms: 3784 },
    "tools/roundhouse/inference-selfcheck.mjs": { verdict: "GREEN", ms: 1930 },
    "tools/roundhouse/isingSweep-selfcheck.mjs": { verdict: "GREEN", ms: 935 },
    "tools/roundhouse/kineticsBind-selfcheck.mjs": { verdict: "GREEN", ms: 2588 },
    "tools/roundhouse/knobCandidates-selfcheck.mjs": { verdict: "GREEN", ms: 5364 },
    "tools/roundhouse/knobGate-selfcheck.mjs": { verdict: "GREEN", ms: 2190 },
    "tools/roundhouse/knobPromotions-selfcheck.mjs": { verdict: "GREEN", ms: 2566 },
    "tools/roundhouse/landauZener-selfcheck.mjs": { verdict: "GREEN", ms: 949 },
    "tools/roundhouse/laneEmdenBind-selfcheck.mjs": { verdict: "GREEN", ms: 14114 },
    "tools/roundhouse/lensLiveness-selfcheck.mjs": { verdict: "GREEN", ms: 2294 },
    "tools/roundhouse/lensTidal-selfcheck.mjs": { verdict: "GREEN", ms: 2268 },
    "tools/roundhouse/magmapBenchVerdict-selfcheck.mjs": { verdict: "GREEN", ms: 3504 },
    "tools/roundhouse/magmapDefault-selfcheck.mjs": { verdict: "GREEN", ms: 730 },
    "tools/roundhouse/magmapDevice-selfcheck.mjs": { verdict: "GREEN", ms: 1176 },
    "tools/roundhouse/magmapTaichiRun-selfcheck.mjs": { verdict: "GREEN", ms: 1050 },
    "tools/roundhouse/manifoldCensusBind-selfcheck.mjs": { verdict: "GREEN", ms: 553 },
    "tools/roundhouse/mpmRefineBind-selfcheck.mjs": { verdict: "GREEN", ms: 2071 },
    "tools/roundhouse/multigrid3dBind-selfcheck.mjs": { verdict: "GREEN", ms: 2305 },
    "tools/roundhouse/nuisanceKnobs-selfcheck.mjs": { verdict: "GREEN", ms: 2914 },
    "tools/roundhouse/percolation-selfcheck.mjs": { verdict: "GREEN", ms: 4329 },
    "tools/roundhouse/physicsBaselineCoverage-selfcheck.mjs": { verdict: "GREEN", ms: 1949 },
    "tools/roundhouse/plantedError-selfcheck.mjs": { verdict: "GREEN", ms: 3350 },
    "tools/roundhouse/policyPilot-selfcheck.mjs": { verdict: "GREEN", ms: 2388 },
    "tools/roundhouse/quantumBind-selfcheck.mjs": { verdict: "GREEN", ms: 3083 },
    "tools/roundhouse/readerPlant-selfcheck.mjs": { verdict: "GREEN", ms: 8999 },
    "tools/roundhouse/reconQualityBind-selfcheck.mjs": { verdict: "GREEN", ms: 2250 },
    "tools/roundhouse/refinementKnobs-selfcheck.mjs": { verdict: "GREEN", ms: 8150 },
    "tools/roundhouse/renderBounceBind-selfcheck.mjs": { verdict: "GREEN", ms: 816 },
    "tools/roundhouse/runtimeBench-selfcheck.mjs": { verdict: "GREEN", ms: 4888 },
    "tools/roundhouse/sdfMarchDevice-selfcheck.mjs": { verdict: "GREEN", ms: 1710 },
    "tools/roundhouse/seedSpread-selfcheck.mjs": { verdict: "GREEN", ms: 5027 },
    "tools/roundhouse/splatNuisance-selfcheck.mjs": { verdict: "GREEN", ms: 2131 },
    "tools/roundhouse/strictConfig-selfcheck.mjs": { verdict: "GREEN", ms: 984 },
    "tools/roundhouse/sweepBudget-selfcheck.mjs": { verdict: "GREEN", ms: 2318 },
    "tools/roundhouse/tempering-selfcheck.mjs": { verdict: "GREEN", ms: 981 },
    "tools/roundhouse/thermalPlants-selfcheck.mjs": { verdict: "GREEN", ms: 9776 },
    "tools/roundhouse/wolff-selfcheck.mjs": { verdict: "GREEN", ms: 1466 },
    "tools/ship/affected-selfcheck.mjs": { verdict: "GREEN", ms: 3605 },
    "tools/ship/androidTvNav-selfcheck.mjs": { verdict: "GREEN", ms: 1853 },
    "tools/ship/artefactWriters-selfcheck.mjs": { verdict: "GREEN", ms: 1709 },
    "tools/ship/artifactWeight-selfcheck.mjs": { verdict: "GREEN", ms: 1256 },
    "tools/ship/asciify-selfcheck.mjs": { verdict: "GREEN", ms: 314 },
    "tools/ship/atmosphere-selfcheck.mjs": { verdict: "GREEN", ms: 1556 },
    "tools/ship/atmosphereMulti-selfcheck.mjs": { verdict: "GREEN", ms: 2704 },
    "tools/ship/avatarFraming-selfcheck.mjs": { verdict: "GREEN", ms: 12446 },
    "tools/ship/avatarServerViews-selfcheck.mjs": { verdict: "RED", ms: 6055 },
    "tools/ship/badTvDevicePass-selfcheck.mjs": { verdict: "GREEN", ms: 1215 },
    "tools/ship/badTvThreeParity-selfcheck.mjs": { verdict: "GREEN", ms: 1269 },
    "tools/ship/badTvWgsl-selfcheck.mjs": { verdict: "GREEN", ms: 170 },
    "tools/ship/ballistics-selfcheck.mjs": { verdict: "GREEN", ms: 2125 },
    "tools/ship/bellPage-selfcheck.mjs": { verdict: "GREEN", ms: 3434 },
    "tools/ship/bezierEasing-selfcheck.mjs": { verdict: "GREEN", ms: 1456 },
    "tools/ship/blameChain-selfcheck.mjs": { verdict: "GREEN", ms: 1590 },
    "tools/ship/blobulatorSkins-selfcheck.mjs": { verdict: "GREEN", ms: 4190 },
    "tools/ship/bloomFused-selfcheck.mjs": { verdict: "GREEN", ms: 1432 },
    "tools/ship/bloomFusedTexture-selfcheck.mjs": { verdict: "GREEN", ms: 817 },
    "tools/ship/bootFingerprint-selfcheck.mjs": { verdict: "GREEN", ms: 1086 },
    "tools/ship/boundListener-selfcheck.mjs": { verdict: "GREEN", ms: 634 },
    "tools/ship/boundaryLint-selfcheck.mjs": { verdict: "RED", ms: 5537 },
    "tools/ship/box3dFilter-selfcheck.mjs": { verdict: "GREEN", ms: 1253 },
    "tools/ship/brainTrail-selfcheck.mjs": { verdict: "GREEN", ms: 1938 },
    "tools/ship/browserSafety-selfcheck.mjs": { verdict: "GREEN", ms: 2519 },
    "tools/ship/canvasFill-selfcheck.mjs": { verdict: "RED", ms: 4945 },
    "tools/ship/cartPolePage-selfcheck.mjs": { verdict: "GREEN", ms: 14047 },
    "tools/ship/carve-selfcheck.mjs": { verdict: "GREEN", ms: 4385 },
    "tools/ship/carveJudged-selfcheck.mjs": { verdict: "GREEN", ms: 1735 },
    "tools/ship/checkerCensus-selfcheck.mjs": { verdict: "GREEN", ms: 3496 },
    "tools/ship/chipOrder-selfcheck.mjs": { verdict: "GREEN", ms: 1580 },
    "tools/ship/citedSources-selfcheck.mjs": { verdict: "GREEN", ms: 1064 },
    "tools/ship/clothSoak-selfcheck.mjs": { verdict: "GREEN", ms: 3026 },
    "tools/ship/consoleOrder-selfcheck.mjs": { verdict: "GREEN", ms: 1285 },
    "tools/ship/controlDossier-selfcheck.mjs": { verdict: "GREEN", ms: 3173 },
    "tools/ship/copiedOutsideVendor-selfcheck.mjs": { verdict: "GREEN", ms: 234 },
    "tools/ship/corpusFilters-selfcheck.mjs": { verdict: "GREEN", ms: 1104 },
    "tools/ship/coverageTriage-selfcheck.mjs": { verdict: "GREEN", ms: 3466 },
    "tools/ship/crossBackend-selfcheck.mjs": { verdict: "RED", ms: 11435 },
    "tools/ship/crtPass-selfcheck.mjs": { verdict: "GREEN", ms: 2247 },
    "tools/ship/crtToggle-selfcheck.mjs": { verdict: "GREEN", ms: 3018 },
    "tools/ship/ddaPrecision-selfcheck.mjs": { verdict: "GREEN", ms: 1146 },
    "tools/ship/deadImportScan-selfcheck.mjs": { verdict: "GREEN", ms: 2929 },
    "tools/ship/deletionHarness-selfcheck.mjs": { verdict: "GREEN", ms: 1422 },
    "tools/ship/demoChrome-selfcheck.mjs": { verdict: "GREEN", ms: 7334 },
    "tools/ship/deviceBridge-selfcheck.mjs": { verdict: "GREEN", ms: 2844 },
    "tools/ship/deviceCritic-selfcheck.mjs": { verdict: "GREEN", ms: 1360 },
    "tools/ship/deviceTexture-selfcheck.mjs": { verdict: "GREEN", ms: 927 },
    "tools/ship/dockRows-selfcheck.mjs": { verdict: "GREEN", ms: 4336 },
    "tools/ship/domAnimation-selfcheck.mjs": { verdict: "GREEN", ms: 931 },
    "tools/ship/domDisintegrate-selfcheck.mjs": { verdict: "GREEN", ms: 775 },
    "tools/ship/domToTexture-selfcheck.mjs": { verdict: "GREEN", ms: 2819 },
    "tools/ship/downloadScan-selfcheck.mjs": { verdict: "GREEN", ms: 403 },
    "tools/ship/dracoWeld-selfcheck.mjs": { verdict: "GREEN", ms: 81 },
    "tools/ship/duplicateFiles-selfcheck.mjs": { verdict: "GREEN", ms: 471 },
    "tools/ship/ecologyPage-selfcheck.mjs": { verdict: "GREEN", ms: 5258 },
    "tools/ship/economyLockstep-selfcheck.mjs": { verdict: "GREEN", ms: 9113 },
    "tools/ship/effectMerge-selfcheck.mjs": { verdict: "GREEN", ms: 13712 },
    "tools/ship/exitBanner-selfcheck.mjs": { verdict: "GREEN", ms: 71 },
    "tools/ship/exportResolve-selfcheck.mjs": { verdict: "GREEN", ms: 2411 },
    "tools/ship/fetchCap-selfcheck.mjs": { verdict: "GREEN", ms: 2157 },
    "tools/ship/fetchProgress-selfcheck.mjs": { verdict: "GREEN", ms: 1232 },
    "tools/ship/firePaint-selfcheck.mjs": { verdict: "GREEN", ms: 7583 },
    "tools/ship/firewallBanner-selfcheck.mjs": { verdict: "GREEN", ms: 7126 },
    "tools/ship/fireworkShell-selfcheck.mjs": { verdict: "GREEN", ms: 789 },
    "tools/ship/fleetMask-selfcheck.mjs": { verdict: "GREEN", ms: 4767 },
    "tools/ship/fleets-selfcheck.mjs": { verdict: "GREEN", ms: 3053 },
    "tools/ship/frameDirtyProbes-selfcheck.mjs": { verdict: "GREEN", ms: 4305 },
    "tools/ship/frozenReferee-selfcheck.mjs": { verdict: "GREEN", ms: 416 },
    "tools/ship/gateMutation-selfcheck.mjs": { verdict: "GREEN", ms: 9076 },
    "tools/ship/gatesBridge-selfcheck.mjs": { verdict: "GREEN", ms: 598 },
    "tools/ship/generatedLadder-selfcheck.mjs": { verdict: "GREEN", ms: 25025 },
    "tools/ship/gitEconomy-selfcheck.mjs": { verdict: "GREEN", ms: 11313 },
    "tools/ship/githubPanelLive-selfcheck.mjs": { verdict: "GREEN", ms: 2719 },
    "tools/ship/glCapture-selfcheck.mjs": { verdict: "GREEN", ms: 555 },
    "tools/ship/goLinkStyle-selfcheck.mjs": { verdict: "GREEN", ms: 3922 },
    "tools/ship/gpuDriven-selfcheck.mjs": { verdict: "GREEN", ms: 3531 },
    "tools/ship/gpuGitTime-selfcheck.mjs": { verdict: "GREEN", ms: 899 },
    "tools/ship/gpuOrbits-selfcheck.mjs": { verdict: "GREEN", ms: 3705 },
    "tools/ship/gpuPick-selfcheck.mjs": { verdict: "GREEN", ms: 1337 },
    "tools/ship/gpuTerrain-selfcheck.mjs": { verdict: "GREEN", ms: 3932 },
    "tools/ship/headlessGpu-selfcheck.mjs": { verdict: "GREEN", ms: 813 },
    "tools/ship/hiZ-selfcheck.mjs": { verdict: "GREEN", ms: 3231 },
    "tools/ship/homography-selfcheck.mjs": { verdict: "RED", ms: 1568 },
    "tools/ship/hostScale-selfcheck.mjs": { verdict: "GREEN", ms: 88 },
    "tools/ship/hostingControls-selfcheck.mjs": { verdict: "GREEN", ms: 2327 },
    "tools/ship/img2three-selfcheck.mjs": { verdict: "GREEN", ms: 3645 },
    "tools/ship/inputChain-selfcheck.mjs": { verdict: "GREEN", ms: 634 },
    "tools/ship/instruments-selfcheck.mjs": { verdict: "GREEN", ms: 542 },
    "tools/ship/inverseSolve-selfcheck.mjs": { verdict: "GREEN", ms: 808 },
    "tools/ship/iosDevice-selfcheck.mjs": { verdict: "GREEN", ms: 152 },
    "tools/ship/keplerPage-selfcheck.mjs": { verdict: "GREEN", ms: 1258 },
    "tools/ship/krbnPaint-selfcheck.mjs": { verdict: "GREEN", ms: 1945 },
    "tools/ship/labCensus-selfcheck.mjs": { verdict: "GREEN", ms: 480 },
    "tools/ship/lagBlame-selfcheck.mjs": { verdict: "GREEN", ms: 3385 },
    "tools/ship/lagReading-selfcheck.mjs": { verdict: "GREEN", ms: 519 },
    "tools/ship/landing-selfcheck.mjs": { verdict: "GREEN", ms: 943 },
    "tools/ship/lathe-selfcheck.mjs": { verdict: "GREEN", ms: 685 },
    "tools/ship/lbmGpu-selfcheck.mjs": { verdict: "GREEN", ms: 6885 },
    "tools/ship/lensingPage-selfcheck.mjs": { verdict: "GREEN", ms: 4628 },
    "tools/ship/liquefy-selfcheck.mjs": { verdict: "GREEN", ms: 1450 },
    "tools/ship/localModelProbe-selfcheck.mjs": { verdict: "GREEN", ms: 2778 },
    "tools/ship/loopMetric-selfcheck.mjs": { verdict: "GREEN", ms: 8880 },
    "tools/ship/macSession-selfcheck.mjs": { verdict: "GREEN", ms: 2396 },
    "tools/ship/markerSingleSource-selfcheck.mjs": { verdict: "GREEN", ms: 4031 },
    "tools/ship/meshBVH-selfcheck.mjs": { verdict: "GREEN", ms: 2204 },
    "tools/ship/meshLine-selfcheck.mjs": { verdict: "RED", ms: 2858 },
    "tools/ship/meshPerf-selfcheck.mjs": { verdict: "GREEN", ms: 3621 },
    "tools/ship/modelBench-selfcheck.mjs": { verdict: "GREEN", ms: 3838 },
    "tools/ship/moduleHistory-selfcheck.mjs": { verdict: "GREEN", ms: 9600 },
    "tools/ship/mpmGpuPage-selfcheck.mjs": { verdict: "GREEN", ms: 4588 },
    "tools/ship/multigrid3dTiming-selfcheck.mjs": { verdict: "GREEN", ms: 1864 },
    "tools/ship/namedNotChecked-selfcheck.mjs": { verdict: "GREEN", ms: 940 },
    "tools/ship/navalDuel-selfcheck.mjs": { verdict: "GREEN", ms: 3814 },
    "tools/ship/noisePrecision-selfcheck.mjs": { verdict: "GREEN", ms: 1047 },
    "tools/ship/notifyDoor-selfcheck.mjs": { verdict: "GREEN", ms: 916 },
    "tools/ship/orrery-selfcheck.mjs": { verdict: "GREEN", ms: 2435 },
    "tools/ship/orreryEjecta-selfcheck.mjs": { verdict: "RED", ms: 866 },
    "tools/ship/orreryFleet-selfcheck.mjs": { verdict: "RED", ms: 8718 },
    "tools/ship/orreryPost-selfcheck.mjs": { verdict: "RED", ms: 5402 },
    "tools/ship/orreryReached-selfcheck.mjs": { verdict: "GREEN", ms: 19189 },
    "tools/ship/pageGround-selfcheck.mjs": { verdict: "GREEN", ms: 3029 },
    "tools/ship/pageSections-selfcheck.mjs": { verdict: "GREEN", ms: 1009 },
    "tools/ship/paintFields-selfcheck.mjs": { verdict: "GREEN", ms: 13998 },
    "tools/ship/paintFloor-selfcheck.mjs": { verdict: "GREEN", ms: 3520 },
    "tools/ship/paintTransfer-selfcheck.mjs": { verdict: "GREEN", ms: 19611 },
    "tools/ship/paintTransforms-selfcheck.mjs": { verdict: "GREEN", ms: 11100 },
    "tools/ship/passFootprint-selfcheck.mjs": { verdict: "GREEN", ms: 7501 },
    "tools/ship/patchScanDoor-selfcheck.mjs": { verdict: "GREEN", ms: 366 },
    "tools/ship/peerDebounce-selfcheck.mjs": { verdict: "GREEN", ms: 1120 },
    "tools/ship/perspectiveWarp-selfcheck.mjs": { verdict: "GREEN", ms: 1210 },
    "tools/ship/phoneFrontDoor-selfcheck.mjs": { verdict: "GREEN", ms: 1174 },
    "tools/ship/phoneQR-selfcheck.mjs": { verdict: "GREEN", ms: 10269 },
    "tools/ship/physicsReach-selfcheck.mjs": { verdict: "RED", ms: 518 },
    "tools/ship/physicsShaders-selfcheck.mjs": { verdict: "GREEN", ms: 2173 },
    "tools/ship/platformRequires-selfcheck.mjs": { verdict: "GREEN", ms: 1942 },
    "tools/ship/polyBrush-selfcheck.mjs": { verdict: "GREEN", ms: 3597 },
    "tools/ship/populationPolicy-selfcheck.mjs": { verdict: "GREEN", ms: 774 },
    "tools/ship/portBeacon-selfcheck.mjs": { verdict: "GREEN", ms: 587 },
    "tools/ship/proseAudit-selfcheck.mjs": { verdict: "RED", ms: 1846 },
    "tools/ship/qrChannel-selfcheck.mjs": { verdict: "GREEN", ms: 3824 },
    "tools/ship/quickSweep-selfcheck.mjs": { verdict: "GREEN", ms: 4104 },
    "tools/ship/racesAct-selfcheck.mjs": { verdict: "GREEN", ms: 530 },
    "tools/ship/reachedLicences-selfcheck.mjs": { verdict: "GREEN", ms: 1198 },
    "tools/ship/reactorPage-selfcheck.mjs": { verdict: "GREEN", ms: 4345 },
    "tools/ship/rebar-selfcheck.mjs": { verdict: "GREEN", ms: 2538 },
    "tools/ship/recordFloat-selfcheck.mjs": { verdict: "GREEN", ms: 3434 },
    "tools/ship/redCensusFresh-selfcheck.mjs": { verdict: "GREEN", ms: 3427 },
    "tools/ship/registerResidue-selfcheck.mjs": { verdict: "RED", ms: 1238 },
    "tools/ship/repoTerrain-selfcheck.mjs": { verdict: "GREEN", ms: 578 },
    "tools/ship/requestPathSync-selfcheck.mjs": { verdict: "GREEN", ms: 646 },
    "tools/ship/rigCanvas-selfcheck.mjs": { verdict: "GREEN", ms: 15390 },
    "tools/ship/rigJobs-selfcheck.mjs": { verdict: "GREEN", ms: 6065 },
    "tools/ship/rigLabGeminiKey-selfcheck.mjs": { verdict: "GREEN", ms: 11604 },
    "tools/ship/rigProgress-selfcheck.mjs": { verdict: "GREEN", ms: 11422 },
    "tools/ship/rigTiming-selfcheck.mjs": { verdict: "GREEN", ms: 14864 },
    "tools/ship/rleRegionVolume-selfcheck.mjs": { verdict: "GREEN", ms: 410 },
    "tools/ship/roughDiffuse-selfcheck.mjs": { verdict: "GREEN", ms: 421 },
    "tools/ship/roughDiffuseWired-selfcheck.mjs": { verdict: "GREEN", ms: 1673 },
    "tools/ship/roundTrip-selfcheck.mjs": { verdict: "GREEN", ms: 4919 },
    "tools/ship/runnerBudget-selfcheck.mjs": { verdict: "RED", ms: 2934 },
    "tools/ship/shadowedHelper-selfcheck.mjs": { verdict: "GREEN", ms: 650 },
    "tools/ship/sharpBridge-selfcheck.mjs": { verdict: "GREEN", ms: 2258 },
    "tools/ship/shippedLadder-selfcheck.mjs": { verdict: "GREEN", ms: 20479 },
    "tools/ship/solidTexture-selfcheck.mjs": { verdict: "GREEN", ms: 2045 },
    "tools/ship/solverFit-selfcheck.mjs": { verdict: "GREEN", ms: 649 },
    "tools/ship/songGlobe-selfcheck.mjs": { verdict: "GREEN", ms: 1558 },
    "tools/ship/sourceChain-selfcheck.mjs": { verdict: "GREEN", ms: 1856 },
    "tools/ship/sourceScan-selfcheck.mjs": { verdict: "GREEN", ms: 6004 },
    "tools/ship/spacesimStart-selfcheck.mjs": { verdict: "GREEN", ms: 1277 },
    "tools/ship/splatRoundTrip-selfcheck.mjs": { verdict: "GREEN", ms: 595 },
    "tools/ship/splatSort-selfcheck.mjs": { verdict: "GREEN", ms: 1287 },
    "tools/ship/staleQueue-selfcheck.mjs": { verdict: "GREEN", ms: 947 },
    "tools/ship/staleness-selfcheck.mjs": { verdict: "RED", ms: 540 },
    "tools/ship/stealthRace-selfcheck.mjs": { verdict: "GREEN", ms: 886 },
    "tools/ship/steamdeckLaunch-selfcheck.mjs": { verdict: "GREEN", ms: 294 },
    "tools/ship/stellarPage-selfcheck.mjs": { verdict: "GREEN", ms: 3283 },
    "tools/ship/strengthField-selfcheck.mjs": { verdict: "GREEN", ms: 2201 },
    "tools/ship/swiftShaders-selfcheck.mjs": { verdict: "GREEN", ms: 14738 },
    "tools/ship/traderGraph-selfcheck.mjs": { verdict: "GREEN", ms: 1780 },
    "tools/ship/transitionSpec-selfcheck.mjs": { verdict: "GREEN", ms: 648 },
    "tools/ship/tsl-selfcheck.mjs": { verdict: "GREEN", ms: 1987 },
    "tools/ship/tslPhysics-selfcheck.mjs": { verdict: "GREEN", ms: 6121 },
    "tools/ship/tslRace-selfcheck.mjs": { verdict: "GREEN", ms: 23473 },
    "tools/ship/tslRig-selfcheck.mjs": { verdict: "GREEN", ms: 1859 },
    "tools/ship/tslSource-selfcheck.mjs": { verdict: "GREEN", ms: 1814 },
    "tools/ship/tunnelSpawn-selfcheck.mjs": { verdict: "GREEN", ms: 606 },
    "tools/ship/typecheck-selfcheck.mjs": { verdict: "GREEN", ms: 1521 },
    "tools/ship/unboundBuiltin-selfcheck.mjs": { verdict: "GREEN", ms: 705 },
    "tools/ship/universeJournal-selfcheck.mjs": { verdict: "GREEN", ms: 8029 },
    "tools/ship/universeWire-selfcheck.mjs": { verdict: "GREEN", ms: 4184 },
    "tools/ship/unknownNotDefault-selfcheck.mjs": { verdict: "GREEN", ms: 3095 },
    "tools/ship/vbaArchive-selfcheck.mjs": { verdict: "GREEN", ms: 529 },
    "tools/ship/verifiedPolygonIntersection-selfcheck.mjs": { verdict: "GREEN", ms: 5108 },
    "tools/ship/videoFrames-selfcheck.mjs": { verdict: "GREEN", ms: 1060 },
    "tools/ship/voxtralBrowser-selfcheck.mjs": { verdict: "GREEN", ms: 3014 },
    "tools/ship/wasmSupport-selfcheck.mjs": { verdict: "RED", ms: 2477 },
    "tools/ship/webrtxBrowser-selfcheck.mjs": { verdict: "GREEN", ms: 915 },
    "tools/ship/wgslLayout-selfcheck.mjs": { verdict: "GREEN", ms: 533 },
    "tools/ship/wgslSpec-selfcheck.mjs": { verdict: "RED", ms: 2524 },
    "tools/ship/windowsImport-selfcheck.mjs": { verdict: "GREEN", ms: 570 },
    "tools/ship/xbarPlugin-selfcheck.mjs": { verdict: "GREEN", ms: 2825 },
    "ui/pageGauges-selfcheck.mjs": { verdict: "GREEN", ms: 2346 },
});
// ==== /MEASURED_V4425 ====

/**
 * *** THE SIX STALE FAILURES v4424 FOUND, WITH WHAT THEY ACTUALLY DO. ***
 *
 * Recorded exit 1 in sweep-timings.json, on no register, and green when run. `recordedMs` is what the file
 * says and `serialMs` what one run alone measures; four of the six are now under the budget that exiles them.
 */
export const STALE_FAILURES = Object.freeze([
    { gate: "tools/ship/fetchCap-selfcheck.mjs",        recordedMs: 5976,  recordedCode: 1, serialMs: 2157,  serialCode: 0 },
    { gate: "tools/ship/moduleHistory-selfcheck.mjs",   recordedMs: 19168, recordedCode: 1, serialMs: 18118, serialCode: 0 },
    { gate: "tools/ship/orrery-selfcheck.mjs",          recordedMs: 13931, recordedCode: 1, serialMs: 2369,  serialCode: 0 },
    { gate: "tools/ship/splatSort-selfcheck.mjs",       recordedMs: 3615,  recordedCode: 1, serialMs: 1230,  serialCode: 0 },
    { gate: "tools/ship/steamdeckLaunch-selfcheck.mjs", recordedMs: 5334,  recordedCode: 1, serialMs: 9146,  serialCode: 0 },
    { gate: "tools/ship/typecheck-selfcheck.mjs",       recordedMs: 5292,  recordedCode: 1, serialMs: 2391,  serialCode: 0 },
]);

/**
 * *** WHAT THE EXILE WAS HIDING: TEN REDS ON NO REGISTER, AND FOUR OF THEM ARE THIS SESSION'S. ***
 *
 * Seventeen of the 378 exit non-zero. Seven are in redCensus.RED_AT_V4279 and are accounted for. The other
 * TEN are on no register at all -- and EVERY ONE OF THE TEN carries a recorded exit code of 0, meaning the
 * last run that saw them saw them pass. They went red AFTER being exiled, which is the whole mechanism: the
 * door shuts on a slow observation and the regression happens on the other side of it.
 *
 * *** THESE ARE NOT LISTED IN A REGISTER, ON PURPOSE. *** gateSweep.SWEEP_V4297 says it best about its own
 * six: "they are the reds a round is meant to repair, and listing them here would make their red acceptable
 * again." Four are repaired in this round. The rest are named, attributed where the evidence attributes them,
 * and left red.
 */
export const EXILED_REGRESSIONS = Object.freeze([
    { gate: "tools/ship/runnerBudget-selfcheck.mjs", mine: "v4424", state: "REPAIRED HERE",
      fails: "every runner that budgets a gate reads the one table, or says why it does not -- 4 runners, 1 silent: tools/ship/slowCensus.mjs",
      note: "v4424 shipped a module that spawns gates under a flat 180s cap and neither read gateBudget.mjs nor " +
            "declared its own. It declares one now, and the reason is real: every gate it runs is one with NO " +
            "measured budget, which is what put it in the bucket, so a per-gate table has nothing to say about it." },
    { gate: "tools/ship/crossBackend-selfcheck.mjs", mine: "v4408-v4416", state: "REPAIRED HERE",
      fails: "every WGSL producer is either IN the corpus or excluded WITH A REASON -- NINE were neither",
      note: "COMP_WGSL, FRESNEL_WGSL, FURNACE_WGSL, ANISO_WGSL, MIS_WGSL, buildSampleWgsl and buildWgsl are in " +
            "the corpus now, compile-only: each already RUNS on a device in its own gate, and what the corpus " +
            "adds is the SECOND BACKEND'S COMPILER, which is a different question from whether the numbers are " +
            "right. lobeWgsl (a function with no entry point) and glslFnToWgsl (a translator) are EXCLUDED by " +
            "name, the way the six before them were. Corpus 43 -> 50." },
    { gate: "tools/ship/staleness-selfcheck.mjs", mine: "the ritual itself", state: "REPAIRED HERE",
      fails: "case-study gate count claims 1446, actual 1447", note: "staleness.mjs --fix, run after the gate was added rather than before" },
    { gate: "tools/caseStudy-selfcheck.mjs", mine: "the ritual itself", state: "REPAIRED HERE",
      fails: "the baked subsystem and gate counts match reality", note: "the same stale number, read by a second gate" },
    { gate: "tools/ship/physicsReach-selfcheck.mjs", mine: "v4408-v4416", state: "OWED",
      fails: "no more than 35 graded physics modules are unreachable from every door -- 36 of 136",
      note: "SEVEN of the 36 are this session's WGSL modules under physics/render/. A door is a roundhouse " +
            "device, an instruments row or a page, and being in the WGSL corpus is none of those. Moving the " +
            "baseline to 36 would be the 'record of having given up' this arc refused for graveyard at v4424, " +
            "and building a device page for seven shader-source modules is a round, not a patch." },
    { gate: "tools/ship/orreryEjecta-selfcheck.mjs", mine: "partly -- not established here", state: "OWED",
      fails: "three-webgpu: 12 importers, recorded 7",
      note: "an importer-count baseline. This session added importers of that body; whether it added all five " +
            "is not established, and the gate's own note calls rebaking a separate decision because every " +
            "recorded figure citing a planet's size moves at once." },
    { gate: "tools/ship/orreryFleet-selfcheck.mjs", mine: "same cause as orreryEjecta", state: "OWED",
      fails: "every body's satellite count equals world/orreryEjecta.mjs's recorded importer count -- three-webgpu: fleet 12, ejecta baseline 7" },
    { gate: "tools/ship/meshLine-selfcheck.mjs", mine: "not attributed here", state: "OWED",
      fails: "the seven call sites the module header names are still there -- 8 sites in 6 files" },
    { gate: "tools/ship/orreryPost-selfcheck.mjs", mine: "not attributed here", state: "OWED",
      fails: "CONTROL: the page is PAUSED, so a difference is the effect and not the clock -- the page is still moving" },
    { gate: "tools/ship/wgslSpec-selfcheck.mjs", mine: "not attributed here", state: "OWED",
      fails: "across 4283 files requiredLimits appears 5 times -- every device runs at the defaults, so a 1024-wide workgroup cannot be created here",
      note: "*** AND THIS ONE BROKE THE INSTRUMENT. *** It prints its verdict on STDERR and nothing on stdout, " +
            "so the first runner counted zero checks and called a RED a CRASH. v4424 argued its check counter's " +
            "undercount 'cannot change a verdict, since an undercount can only turn a RED into a CRASH and " +
            "nothing here was classified CRASH' -- SOUND FOR THAT DATA AND NOT A GENERAL LAW. The wider run is " +
            "what found the case, and slowCensus.runGateSerial counts both streams now." },
]);

/** Of the exiled gates measured alone, how many would clear the budget today. */
export function wouldRunNow(measured = MEASURED_V4425, budgetMs = DEFAULTS.budgetMs) {
    const done = Object.entries(measured).filter(([, m]) => m.verdict === "GREEN" || m.verdict === "RED");
    return { under: done.filter(([, m]) => m.ms <= budgetMs).length, measured: done.length };
}

/** recorded / serial, per gate: how much the eight-way sweep inflated the number that exiled it. */
export function inflation(recorded, measured = MEASURED_V4425) {
    const out = [];
    for (const [gate, m] of Object.entries(measured)) {
        if (!(m.verdict === "GREEN" || m.verdict === "RED")) continue;
        const r = recorded[gate];
        if (r == null || m.ms <= 0) continue;
        out.push({ gate, recorded: r, serial: m.ms, ratio: r / m.ms });
    }
    return out;
}

/**
 * *** THE ONE REPAIR THIS ROUND MAKES, AND IT IS NOT A POLICY DECISION. ***
 *
 * sweep-timings.json's note said its contents were "OBSERVED at the last quickSweep run". That was true of
 * the rows the run rewrote and FALSE of every other row -- and the other rows are exactly the exiled gates,
 * whose recorded time is the only reason they were not run. One whole-file `captured` date cannot say when
 * an individual row was seen, so the file now carries `observed` per gate: the run's stamp for a gate that
 * ran, whatever it had for a gate that did not, and `null` for a row written before the field existed.
 *
 * Choosing what the sweep should COST is a decision about the ship ritual and is not made here. Saying when
 * a number was taken is not a choice at all.
 */
export const RECORD_REPAIR = Object.freeze({
    field: "observed",
    was: "one `captured` date for the whole file, which dated the RUN and was read as dating the ROWS",
    now: "an ISO stamp per row, or null for a row older than the field",
    notAPolicy: "the budget, the cap and the sweep's cost are unchanged",
});

// ---- WHAT THIS ROUND DOES NOT CLAIM --------------------------------------------------------------------
//
// It does not raise the budget, and it does not rewrite sweep-timings.json to release the exiles. Choosing
// what the sweep should cost is a decision about the ship ritual, and making it inside the round that
// measured the exiles would be the same move v4424 refused: the granting and the resolving in one place.
//
// It does not claim the exiled gates are green. Most of them are, on this box, today; a verdict from one run
// on one machine is a measurement and not a guarantee, and the ones that ran past this round's cap have no
// verdict at all.
