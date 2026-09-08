// WebGLEngine/tools/ship/nextRounds.mjs — v3340
// ---------------------------------------------------------------------------------------------------------------
// THE STANDING LIST OF WHAT IS DEFERRED AND WHY — because a backlog that lives in a conversation is not a backlog.
//
// v3314 audited the tree's fifteen "its own round" notes and found that SEVEN WERE ALREADY SETTLED, FOUR WERE
// NEVER DEFERRALS AT ALL, and one was a refusal recorded as an omission. The failure mode is not forgetting to
// write things down; it is writing them down in prose that nothing ever re-reads, so a finished item keeps
// advertising itself as open and the next reader spends a round rediscovering that.
//
// So each entry here carries a BLOCKER rather than a priority, and the blocker is the thing that can be checked.
// "Needs a rig" is a fact about the world. "High priority" is a fact about somebody's mood last Tuesday.
//
// THE THREE BLOCKER KINDS, and only the first is anyone's to schedule:
//   OPEN      -- doable in the sandbox now. Nothing is stopping it but the work.
//   HARDWARE  -- needs a GPU, a browser, a second machine, or a WASM build that does not exist here.
//   UPSTREAM  -- doable, but worth nothing until something else lands first, and the entry says which.
// ---------------------------------------------------------------------------------------------------------------
"use strict";

import { pathToFileURL } from "node:url";
export const NEXT_ROUNDS = [
    { id: "population-autopin", state: "CLOSED", note: "DONE at v3553. populationCensus.mjs records the population at ship time and diffs it, and gateReach-selfcheck now reads that record instead of a typed number. The verdicts distinguish routine growth from the thing that should stop a ship: GREW names every addition and reconciles the totals; REMOVALS is treated harder than a gain, because adding physics is routine and physics quietly disappearing is how a deletion ships unnoticed, and the old pin fired identically for both. NO-RECORD is its own verdict rather than a pass. And the gate does NOT rewrite the record it compares against -- writing is a ship step, comparing is the gate, deliberately different programs, because a check that repairs its own expectation can never fail twice." },
    { id: "flip3d-gate", state: "CLOSED", note: "DONE at v3427. Free fall to 1.4e-7, 9216 particles conserved exactly, divergence down 2.1e+4 and -- unlike 2D -- MONOTONICALLY. Two differences from the 2D sibling recorded: the monotone convergence, and that step() is synchronous here while 2D's is async, despite the header calling the pipeline identical." },
    { id: "beer-lambert", state: "CLOSED", note: "DONE at v3426. The exact half holds to 5.6e-17 and optical depths add bit-exactly, which is what makes a line integral the right object for CT. The failing half is measured: with a real spectrum the effective attenuation falls 4.4x with depth and a uniform cylinder cups by 30%. The cost to ct.js is now a number -- 12.0562 against a true line integral of 35.3854 for the same slab." },
    {
        id: "browser-screenshot-floor",
        blocker: "HARDWARE",
        what: "Measure the perceptual floor for browser screenshots, so render-QA's SSIM/pHash/IoU signals can gate instead of merely being recorded.",
        how: "On the rig: run render-qa twice with no code change between runs. The spread between two identical runs IS the floor -- antialiasing, font hinting, compositor timing. Two commands.",
        why: "v3339 wired the signals into all 54 pages as RECORDED, NOT GATING, because the headless floor is exactly zero (Jolt is deterministic) and a browser is not. Gating on an unmeasured number is the failure the whole perceptual line of work exists to avoid.",
    },
    {
        id: "cross-backend-envelope",
        blocker: "HARDWARE",
        what: "Record the box3d-vs-Jolt drift, pixel and perceptual envelope.",
        how: "On a rig where box3d's WASM builds: `node physics/backend-qa-check.mjs --update`. One command.",
        why: "backend-baseline.json has carried \"pairs\": {} since 2026-07-13 because box3d has never loaded wherever --update was run. v3338 made a missing envelope fail as UNMEASURED instead of passing silently, so the first run where box3d loads goes RED and names the command rather than measuring the pair and discarding it.",
    },
    {
        id: "device-verdicts",
        blocker: "HARDWARE",
        what: "Four pages owe a report from real hardware: hmc-bench, ising-bench, magmap-bench, consistency-fleet.",
        how: "Open each page on a machine with a GPU and press submit. They are parked in Arriving Pages with the reason attached, and `node tools/render-qa/deviceOwed.mjs` prints who still owes what.",
        why: "Received kinds: NONE. The ising kernel in particular is graded at ZERO tolerance -- bit-exact or rejected -- so there is no partial credit and no way to infer the answer from here.",
    },
    {
        id: "sys-lag-reading",
        blocker: "HARDWARE",
        what: "One `GET /sys/lag` on Keith's rig after a few minutes of uptime.",
        how: "curl it. The response names each blocking callback by its REGISTRATION site, not its fire site.",
        why: "v3317 re-read the v3278 samples and found the duty cycle FALLS to ~22% and plateaus rather than growing without bound -- so there are two problems, a startup burst and a steady periodic cost, and only a reading tells us which callback owns the second.",
    },
    {
        id: "image-pair-second-side",
        blocker: "UPSTREAM",
        what: "A second, independent renderer for the image-based consistency pair.",
        how: "The render-qa Playwright rig can capture a real render; wiring it to frame the same scene as the headless rasteriser would give two mechanisms.",
        why: "physics/imagePair.mjs declares the pair INCOMPLETE because only one side exists. A pair assembled from one mechanism twice is reproducibility wearing the costume of corroboration, and the board's admission rule does not bend for a pair that would be convenient.",
        upstream: "browser-screenshot-floor -- without a floor there is nothing to gate the pair against",
    },
    {
        id: "ensemble-weighting",
        blocker: "UPSTREAM",
        what: "Weight the soft signals rather than averaging them equally.",
        how: "Fit weights against cases where the right answer is known.",
        why: "Deferred twice for the same reason: there was nothing to tune against. v3340 changed that -- the CT sweep gives labelled degradation against exact ground truth, and it already showed edge overlap is worth far more than pHash there (0.223 vs 4 bits of 63 at 8 angles). An equal average is currently wrong in a measurable direction.",
        upstream: "reconQuality gives the first labelled data; more would come from the browser floor",
    },
    // ---- v4535: the first entries from the third-party repo sweep, WITH THE CORRECTIONS THAT SURVIVED
    // CHECKING. *** THREE OF THE SWEEP'S LOAD-BEARING CLAIMS WERE WRONG, AND TWO OF THEM SAT UNDER ITS
    // SECOND-RANKED ITEM. *** They are recorded in the `why` of each entry rather than in a conversation,
    // which is this file's entire reason to exist: a candidate list that arrives with an unchecked premise
    // costs the next reader the same afternoon it cost this one.
    {
        id: "sweep-budget-calibration",
        state: "CLOSED",
        note: "MEASURED AND REJECTED AT v4536, AND THE ROUND SHIPPED A DIFFERENT REPAIR. The diagnosis was " +
              "right -- a millisecond on a loaded box and one on a quiet box were being compared as the same " +
              "quantity -- and the proposed cure does not survive being built. Two reference workloads were " +
              "driven under load: a pure integer loop moved 1.02x while gates moved 1.22-2.26x, and `node -e " +
              "0` moved 2.43x. Neither tracks. AND THE DRIFT IS NOT A COMMON FACTOR, so no scalar could: on " +
              "code byte-identical since the earlier reading, microfacetVndf/water2d/slugReupload moved " +
              "1.12-1.13x while probeLab and meshLine moved 1.36x. *** WORSE, meshLine WALKS THE TREE, so " +
              "part of its 1.36x is the tree growing -- real work a normaliser would have divided away and " +
              "filed as a slow hour. *** What shipped instead is corroboration: quickSweep.MIN_CROSSINGS_TO_" +
              "EVICT, a crossing must be reproduced on a later sweep before it evicts, which is v4297's rule " +
              "for reds applied to time. See BUDGET_DRIFT_V4536 in sweepCoverage.mjs for every reading. " +
              "STILL OPEN AND LARGER THAN ANY OF THIS: the timings file mixes 8-way parallel readings with " +
              "serial ones and compares both against one budget -- twelve unchanged gates from a single " +
              "capture re-measured serially came in at 0.41x to 0.92x, a 2.24x spread. That is the next one.",
    },
    { id: "ibl-specular-half", state: "CLOSED", note: "DONE at v4539, and the round it replaced was aimed wrong. The sweep that raised this recorded IBL as absent; it was HALF absent -- render/splatProbes.mjs (v4513) bakes an order-2 SH irradiance volume and render/probeLit.mjs (v4514) evaluates it on both backends, so the DIFFUSE side had shipped. physics/render/splitSum.mjs adds the specular side: Karis's split sum, a BRDF table in (n.v, roughness) plus a GGX-prefiltered environment. *** GRADED AGAINST A NUMBER THE TREE ALREADY HAD RATHER THAN A TOLERANCE: *** at F0 = 1 Schlick's Fresnel is identically 1, so A + B IS the directional albedo, which energyCompensation.mjs computes by an unrelated route for an unrelated purpose -- median disagreement 4e-5 across alpha 0.1 to 1.0, and the worst (6.4e-3) lands exactly where that reference's own header says it is weakest. The factorisation's cost is measured, not waved at: 0% exactly on a constant environment, 2.1-4.6% on a gradient, 13.8-32.8% on a small bright light. *** WHAT IS NOT CLAIMED: *** no prefiltered mip CHAIN is baked and nothing on a device samples this yet -- prefilterEnv convolves an environment FUNCTION, so the cubemap capture, the mip layout and the WGSL that reads them are the next piece, and they are the piece that needs a GPU. The n = v = R simplification that lets one chain serve every view angle is named in the module and throws away the lobe's stretch at grazing angles, which is a second approximation stacked on the factorisation and is not yet measured." },
    { id: "uv-unwrap", state: "CLOSED", note: "DONE in two halves, v4536 and v4537, and the three files that routed around the absence can stop. THE PLANAR HALF (physics/mesh/uvUnwrap.mjs): meshCSG's booleans emit convex planar polygons that already carry their plane, and projection into a polygon's own plane is an ISOMETRY, so it owed no stretch minimiser at all -- worst edge-length change 0.00e+0, texel-density spread 1.7e-15 across 60 edges of real subtract() output. THE CURVED HALF (physics/mesh/uvLscm.mjs): weld, segment into disk charts by normal deviation, least-squares conformal maps per chart, pack. RobotExpressive.glb -- the asset reskin.js called unavailable -- is 3,234 of 3,234 triangles unwrapped across 735 charts, 0 flipped, worst conformal 1.18, 100 ms. *** WHAT MEASURING IT FOUND FIRST: three quarters of that shipped vertex buffer is duplication (7,214 -> 1,759 across 19 primitives, valence 1.35 -> 5.52), and 71% of the welded mesh is CLOSED surface -- so 'unwrap the disks and report the rest' would have left most of the robot untextured, and segmentation is the job rather than an optimisation. *** WHAT IS NOT CLAIMED: LSCM minimises angle distortion and guarantees nothing about injectivity; a chart can be a topological disk and still fold over itself, which is exactly what the flips past a 100-degree normal limit are. And area distortion is not controlled and cannot be -- on a sphere cap it runs 1.15 to 4.61 as the cap widens, which is Gauss rather than a defect. *** v4538 GAVE IT A CONSUMABLE SHAPE AND PROVED IT END TO END: *** unwrapToMesh() splits the seams a per-vertex buffer needs -- 48.5% of RobotExpressive's welded vertices sit on one, so 1,759 + 1,187 copies = 2,946, still 59% fewer than the 7,214 the file ships -- and the result round-trips through tools/export/sceneGlb.mjs as a GLB carrying TEXCOORD_0, decoded by hand from the container and exact to 0.00e+0. polysToMesh() answers meshCSG directly, CUT faces only if asked, with texel-density spread 0.00e+0 because a cut face is planar by construction. *** STILL OPEN: NO SHIPPING MODULE CALLS EITHER. *** tools/ship/orphanTriage.mjs still lists physics/mesh/uvLscm.mjs in its actionable pile and is right to -- every caller is a gate. The two candidates both carry a problem: tools/export/reskin.js chose vertex colours BECAUSE UVs were unavailable, so wiring it re-opens a decision somebody already made, and world/worldGlbExport.js is colour-based by design and has never asked for UVs. Picking one needs a real want behind it, and inventing one is the exact trap this file exists to prevent. *** v4540 CLOSED IT, AND WITHOUT RE-OPENING ANYTHING: *** reskin.js gained ROUTE 3, a UV texture route, which does not touch route 1 -- it removes the limit route 1 STATES in its own header -- 7,214 vertices is about 85x85 if it were a texture, too coarse for photographic detail. 7,214 vertices shade at 7,214 samples; a 1024-square atlas at 51.1% coverage is 535,822 texels, 74x the budget, for 154 extra vertices (2.1%) and positions, normals, joints and weights bit-identical per vertex. THE MEASUREMENT THAT SHAPED IT: the weld that UNWRAPS is not the weld that EXPORTS -- of 5,455 coincident pairs uvLscm merges to recover connectivity, 229 have different SKINNING and 5,346 have different NORMALS, so rebuilding the output from the welded mesh would break the deform and flatten every hard edge. The UVs come back to the original vertices instead. orphanTriage no longer lists physics/mesh/uvLscm.mjs." },
    {
        id: "gltf-conformance-fixtures",
        blocker: "OPEN",
        what: "Conformance fixtures for gpu/GLBParser.js against the glTF feature matrix, starting with sparse accessors.",
        how: "KhronosGroup/glTF-Asset-Generator (MIT, one root licence, synthetic geometry -- none of the per-model licence trouble gpu/khronosSamples.mjs exists to handle). Assets ship in release zips, not as raw repo files. Strip them header-only the way gpu/fixtures/ already does, with the same PROVENANCE.md discipline.",
        why: "SPARSE ACCESSORS ARE GENUINELY UNSUPPORTED -- zero occurrences of `sparse` in gpu/GLBParser.js. Correcting the sweep on the other half: INTERLEAVED buffers ARE handled, via view.byteStride at GLBParser.js:1162 and 1236. And the exporters are not ungated: tools/ship/sceneGlb-selfcheck.mjs and voxelGlb-selfcheck.mjs check magic, version, chunk order, 4-byte alignment and space-padding -- the CONTAINER. Nothing checks spec SEMANTICS, which is the narrower and true form of \"no conformance check on the exported files\".",
    },
    {
        id: "spherical-gaussian-view-dependence",
        blocker: "UPSTREAM",
        what: "Spherical GAUSSIANS for view-dependent appearance, BakedSDF-style -- a lobe basis that can hold a sharp specular highlight, where the spherical harmonics already shipped here cannot.",
        how: "Read the technique, not the repositories: BakedSDF is Google Research's published 'Meshing Neural SDFs for Real-Time View Synthesis', and the tooling found for it (UnityBakedSDF and friends) is C#/ShaderLab/C++ for Unity and Unreal -- the wrong engine, so nothing is portable and nothing needs to be. What is worth taking is the pair of ideas: encode view dependence as a few spherical GAUSSIAN lobes per vertex rather than as SH bands, and bake the result onto a TRIANGLE MESH so it rasterises anywhere.",
        why: "*** THE SWEEP THAT RAISED THIS CALLED VIEW-DEPENDENT SHADING A CONFIRMED-ABSENT TECHNIQUE. IT IS NOT ABSENT; IT IS SHIPPED, AND IN A SHADER. *** render/SplatRenderer.js evaluates first-order spherical harmonics per splat in its vertex shader, with the basis constant written out (SH1 = sqrt(3/(4pi)) = 0.4886025119029199) and the three lobes summed against the view direction; gpu/SplatLoader.js parses f_rest_0..f_rest_8 to feed it and REFUSES a partial set rather than zero-filling, which tools/ship/splatRoundTrip-selfcheck.mjs asserts. Only the LITERAL claim survives -- there are no spherical Gaussians, no BakedSDF, no MobileNeRF and no binary opacity grids anywhere, all four greps empty.\n\nWHAT IS TRUE AND USEFUL IS NARROWER AND SHARPER: the tree carries TWO splat paths and they disagree about this. engine/SplatRenderer.js uses SH band 0 only and says so in its own 'what we still don't do' list -- 'so reflections/specular lose detail' -- while engine/splatParser.js 'deliberately skip[s] the higher SH coefficients (f_rest_*, 45 values)'. render/SplatRenderer.js and gpu/SplatLoader.js do the opposite. So the real gap is not view dependence; it is that ORDER ONE IS THREE LOBES AND A SPECULAR HIGHLIGHT IS NARROWER THAN THAT, which is precisely the case spherical Gaussians exist for and precisely what engine/SplatRenderer.js's header already complains about losing.",
        upstream: "Something that wants a sharp view-dependent highlight on a GENERATED asset, and a source that carries the data to make one. The tree's own splat generators are the obstacle: ai-bridge/kaggle_templates/ (triposr, triposg, triposplat, instantmesh) produce assets from images and text, and engine/SplatRenderer.js records that 'splats imported from CRM/Hunyuan already discard these in the parser anyway' -- so even the SH bands the tree CAN render are frequently not in the file. Fitting spherical Gaussians needs multi-view radiance to fit them FROM, which a single-image generator does not have. The cheaper question comes first and is entirely in-tree: unify the two splat paths so the band-0 renderer stops discarding SH the other one loads, and measure what order 1 is actually worth on the assets this tree really makes. If that turns out to be the ceiling, THEN the lobe basis is the next move.",
    },
    {
        id: "cellocut-watertight-remesh",
        blocker: "UPSTREAM",
        what: "Read the technique behind CelloCut -- Constructive Watertight Remeshing via Tetrahedral Cell Cuts -- against the crack meshCSG.mjs has measured and not closed.",
        how: "Apache 2.0 and arXiv-published, so the technique is readable regardless of its toolchain: embed a defective mesh in a tetrahedral cell complex and solve an interior/exterior labelling by graph cut, which makes the boundary watertight BY CONSTRUCTION rather than by patching a boolean's output afterwards. The repository itself is C++/CUDA over CGAL, Eigen and libigl -- the wrong toolchain here, which is why this is a read rather than a port.",
        why: "*** THE WANT IS MEASURED, WRITTEN DOWN, AND ITS CAUSE IS UNKNOWN -- which is exactly the case a by-construction method answers. *** physics/mesh/meshCSG.mjs: on ONE blast its settle pass reaches 100.0%, every edge matched, zero T-junctions, zero gaps. Over twelve it does not -- 15 of 12,847 directed edges (0.12%) survive UNCOVERED, real cracks rather than T-junctions -- and the file states plainly that the reason is not known. THREE EXPLANATIONS WERE PROPOSED AND ALL THREE MEASURED AND REFUTED: dropped slivers (the counter says 0 of 37,708 splits), too tight a weld tolerance (identical 20 of 64,064 from 1e-9 to 1e-7, worse at 1e-5), and one corner spelled two ways by two split orders (snapVertices closes none of them at any tolerance from 1e-12 to 1e-6). What IS known is that the solid is right: volume 20.112588161 to the last digit across every combination of snap, merge and weld, and A-B plus A AND B reconstruct A to 9.7e-14. So a hairline of the surface is not sewn and nobody knows why, recorded as an open limit because 'a gate that asserted watertight here would be asserting something false'. A graph-cut interior/exterior labelling over a cell complex does not need the cause found: it cannot produce a hole in the first place.",
        upstream: "Nothing here needs a watertight guarantee badly enough yet to pay for a tetrahedral cell complex and a graph cut -- the 20 edges are recorded, attributed and survivable. It becomes worth doing when something downstream REFUSES a cracked solid: an export that must be printable, a fluid boundary, or a tet-mesh body (see tet-cut, which needs one too). NOT VERIFIED HERE: those figures are meshCSG's own recorded measurements on its twelve-blast fixture and were not reproduced for this entry -- an ad-hoc twelve-subtract fixture built while filing it dropped ZERO slivers and its unmatched edges were its own open boundary, a different thing, said so rather than counted as corroboration. *** v4542 NARROWED WHAT THE CRACK IS, WITHOUT CLOSING IT. *** An audit of meshCSG-selfcheck against a formal CSG property list added a ray-parity row: 100 rays across the twelve-blast wall's whole cross-section cross the surface an EVEN number of times, 652 crossings, 0 odd -- and a planted face-sized hole (settle() made to drop one polygon) reads 5 of 100 odd, so the row discriminates. So the 15 uncovered edges are HAIRLINES rather than missing faces, which is a weaker defect than the bare phrase not-watertight suggests and moves this item further down rather than up. The same audit found the eight degenerate CONTACT cases a watertight remesher would have to handle -- flush faces, a corner on an edge, an edge along an edge, a cutter identical to the solid -- are already exact here to 1e-12 against an interval oracle and settle to zero unmatched edges, so what CelloCut would buy is narrower than it looked: not correctness on hard contacts, only the last hairline.",
    },
    {
        id: "tet-cut",
        blocker: "UPSTREAM",
        what: "Cutting a tetrahedral mesh along an arbitrary path -- Ruprecht-Muller (1998) edge-cut subdivision, so a surface separates the way a scalpel does rather than the way a thread snaps.",
        how: "The algorithm is 1998 published academic work, not any repository's IP: 11 deterministically generated equivalence classes of cutting template, a 6-bit edge mask looked up against ~64 entries, corner-peeling and optimal-apex coning. matthias-research/tet-cut is a from-scratch WebGL prototype of it with a Node regression twin -- the same 'hand-written pair, gate with a runnable twin' shape this tree uses -- and carries no licence, which does not matter for a published algorithm reimplemented from the paper.",
        why: "*** THE CAPABILITY IS GENUINELY ABSENT AND GENUINELY DIFFERENT FROM WHAT IS HERE. *** physics/xpbd/tear.js is a FAILURE RESPONSE, and says so in its own first line: 'tearing REMOVES constraints whose strain, measured against a snapshot, has exceeded a breaking threshold ... a tear is PERMANENT'. Removing constraints is not refining topology along a path, and fx/fracture/cellFracture.js (Voronoi) is not either. Nothing in the tree cuts.",
        upstream: "A DEFORMABLE TETRAHEDRAL BODY, WHICH THIS TREE DOES NOT HAVE -- and the sweep that raised this assumed it does. Its words were that tet-cut 'pairs naturally with the volumetric soft-body constraints (volume.js, muscle.js, plastic.js) already built', and all three are edge- or surface-based: volume.js is ONE global pressure constraint over a closed TRIANGLE mesh whose 'tetrahedra' are the divergence-theorem signed tets used to integrate enclosed volume, not a mesh; muscle.js and plastic.js modulate per-constraint rest lengths. A grep for a deformable tet mesh across physics/, fx/ and world/ returns NOTHING. Tetrahedra appear in exactly two unrelated places: marching TETRAHEDRA in physics/mesh/marchingCubes.js (isosurface extraction) and finite-volume gradient reconstruction in physics/mesh/tetReconstruct.mjs (CFD). Ruprecht-Muller subdivides a tet mesh; there is none to subdivide, so the prerequisite is a tetrahedralised soft body with volumetric constraints -- a substantial piece this tree has never needed. Worth building the day something wants to be cut open rather than torn.",
    },
    {
        id: "transvoxel-transition-cells",
        blocker: "UPSTREAM",
        what: "Crack-free seams between volumetric chunks meshed at different resolutions (Transvoxel transition cells).",
        how: "Port the transition-cell table as data with citation -- the posture simulation/MarchingCubes.js already takes with the Bourke 256-case tables -- hand-write the stitching, and grade the seams with physics/mesh/manifoldCensus.mjs, which exists to catch exactly non-manifold and cracked output.",
        why: "*** THE SWEEP READ \"ZERO OCTREE ANYWHERE IN world/*.js\" AND CONCLUDED THE TREE HAS NO OCTREE. IT HAS THREE. *** physics/octree/ carries a CPU sparse octree that merges uniform regions (octree.js), a GPU-packed Laine-Karras SVO (svoGenerator.js), a CPU raymarcher holding the GLSL one honest (svoMarch.mjs), and gates for each. The substrate exists, so this is a smaller job than the sweep sized. Its second claim is also wrong: dualContour takes `n` and marchScalarField takes dimX/dimY/dimZ -- BOTH TAKE A RESOLUTION. What neither takes is a NEIGHBOUR'S resolution, which is the actual precondition. The real gap, grepped rather than inferred: physics/mesh, simulation, world and render contain ZERO references to octree, svoMarch or svoGenerator -- no mesher has ever consulted the octree.",
        upstream: "any mesher that consults physics/octree at all -- today none does, so a transition cell would have nothing to sit between. world/chunkMarchingCubes.js calls itself a near-camera cosmetic pass, so nothing is straining against this yet",
    },
    { id: "fbp-gain-normalisation", state: "CLOSED", note: "ANSWERED NO at v3378, and the measurement is in reconQuality.mjs. The gain is NOT a filter constant: it runs 0.4319 to 0.9340 across fixtures, nearly invariant in ANGLE COUNT but tracking N and nDet -- and gain*nDet/N collapses to 0.9456 with a spread of 0.0185. IT IS A SAMPLING RATIO. Correcting 0.649 in the filter would be right at N=96/nDet=140, this gate's own fixture, and wrong everywhere else." },
];

export const byBlocker = (kind) => NEXT_ROUNDS.filter((r) => r.blocker === kind);

export function lines() {
    // *** v3941 -- IT NAMES ITSELF, BECAUSE A REPORT WITH NO NAME ON IT IS UNATTRIBUTABLE THE MOMENT TWO OF
    // THEM SHARE A TERMINAL. *** That is toolFrontDoor's rule, and the reason this tool could not be added to
    // the REPORTING registry until now: it printed a bare "UPSTREAM (2):" and nothing said whose it was.
    const out = ["[nextRounds] what the next rounds are, and what is blocking each"];
    for (const kind of ["OPEN", "UPSTREAM", "HARDWARE"]) {
        const rows = byBlocker(kind);
        if (!rows.length) continue;
        out.push(`${kind} (${rows.length}):`);
        for (const r of rows) out.push(`  ${r.id} -- ${r.what}`);
    }
    out.push("");
    out.push("A blocker is a fact about the world. A priority is a fact about somebody's mood last Tuesday.");
    return out;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) for (const l of lines()) console.log(l);
