// WebGLEngine/tools/ship/coverageTriage.mjs — v3410
// ---------------------------------------------------------------------------------------------------------------
// THE UNGATED 125 ARE NOT 125 UNGATED PHYSICS MODULES. NINE ARE.
//
// gateReach reports "213 of 338 physics modules reachable from a gate (63%)" and is careful to call that A
// DENOMINATOR, NOT A VERDICT. This is the round that finally looked at what is in it.
//
// *** 116 OF THE 125 ARE FLAT simulation/*.js FILES, AND NOT ONE OF THEM IMPORTS ANY PHYSICS MODULE. *** They
// are AliveLayer, AmbientNPCs, AquariumDemo, AsteroidsDemo, BoidsDemo, BossPhaseManager -- scene and demo code
// that was never physics with an answer key. The classification is evidence, not taste: a file that imports
// nothing from physics/, lbm, em, tomo or cosmo is not a physics module whatever directory it sits in.
//
// AND THE PHYSICS SUBDIRECTORIES ARE ESSENTIALLY FULLY GATED: simulation/lbm 18/18, simulation/em 2/2,
// simulation/cosmo 4/4, simulation/life 1/1, simulation/tomo 12/13.
//
// SO THE HONEST COVERAGE FIGURE IS 213 OF 222, WHICH IS 95.9%, NOT 63%. The denominator swept in a hundred and
// sixteen demo scenes because PHYSICS_ROOTS includes "simulation" wholesale. That is not a criticism of
// gateReach -- it said what it measured and warned against over-reading it -- but the number has been quoted in
// three changelogs, and a number quoted three times is a number people have started believing.
//
// *** THE NINE, CLASSIFIED. *** Two of them are real: fluid/flip2d.mjs describes ITSELF as "a correct 2D
// FLIP/PIC fluid solver" and had no gate at all. That is the finding this round was looking for, and it took
// correcting the denominator to see it -- 125 unexamined files is a number nobody can act on, and nine is a
// list somebody can read in a minute.
// ---------------------------------------------------------------------------------------------------------------
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { reach } from "./gateReach.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

/** A module counts as physics-bearing if it imports one. Checkable, and independent of where it lives. */
export function importsPhysics(rel) {
    let s = "";
    try { s = fs.readFileSync(path.join(ENG, rel), "utf8"); } catch { return false; }
    return /from\s+["'][^"']*(physics\/|\/lbm\/|\/em\/|\/tomo\/|\/cosmo\/)[^"']*["']/.test(s);
}

/**
 * The nine non-scene ungated modules, each with a verdict and a reason. This list is HAND-WRITTEN because the
 * distinction it draws -- solver against glue -- is not derivable from imports or filenames, and pretending
 * otherwise would produce a classifier that is confidently wrong about the interesting cases.
 */
export const NON_SCENE = {
    "fluid/flip2d.mjs": { verdict: "GATEABLE", why: "a correct 2D FLIP/PIC fluid solver by its own description, with maxDivergence() sitting unexercised. GATED in v3410." },
    "fluid/flip3d.mjs": { verdict: "GATEABLE", why: "the 3D extension of the same algorithm. GATED in v3427, and being named here first is why: the triage turned an unactionable count of 125 into a list of nine, and both gateable entries on it are now closed." },
    "physics/backend.js": { verdict: "GLUE", why: "a facade over box3d and Jolt. It has no physics of its own: what it dispatches to is gated, and backend-qa-check grades the pair." },
    "physics/box3dMeshOverlay.js": { verdict: "GLUE", why: "draws a mesh over a body. Rendering, with no quantity to be right or wrong about." },
    "physics/fire/fireMesh.js": { verdict: "GLUE", why: "mesh generation for a fire effect. Appearance rather than a measurement." },
    "physics/fluidBox3d.js": { verdict: "CANDIDATE", why: "a co-simulation coupler between box3d and the fluid. Momentum exchange across the coupling COULD be an exact key (what one side loses the other gains), which would be a real gate rather than a smoke test." },
    "physics/voxel/fracture.js": { verdict: "CANDIDATE", why: "turns a broken voxel structure into rigid bodies. Total mass before and after a fracture is conserved exactly, which is a key nobody has written." },
    "simulation/euler/eulerShader.js": { verdict: "HARDWARE", why: "compressible Euler as a WGSL compute kernel. Needs a real GPU, like the bench pages, so it cannot be gated in a sandbox." },
    // v3853 -- the first UNCLASSIFIED entry this list has had since it was written, and the classification is
    // the module's own: its header opens by saying it is DELIBERATELY not named *-selfcheck.mjs.
    "physics/mpm/gpuKernelInterp.mjs": { verdict: "DEPENDENCY", why: "a WGSL interpreter harness built on wgsl_reflect, a package that is NOT in the tree and cannot be installed on a machine with no network. Its own header says it is deliberately not named *-selfcheck.mjs because 'a gate that fails because a dependency is missing is a gate that cries wolf' -- the numbers it produces are recorded in gpuKernel-selfcheck.mjs where they can be contradicted, and the tool ships so the measurement can be retaken rather than trusted." },
    "simulation/tomo/honest-error.mjs": { verdict: "GATEABLE", why: "133 lines, and NOT merely a helper: it builds a phantom, scans it, and reports correlation and RMS against the TRUTH IMAGE it generated. That is an answer key by construction. GATED in v3436." },
};

export function triage() {
    const r = reach();
    const scene = [], nonScene = [];
    for (const p of r.ungated) {
        // *** v3436 -- I PROPOSED WIDENING THIS TEST AND MEASURED MY WAY OUT OF IT. *** At v3429 I reported
        // that simulation/MarchingCubes.js -- 521 lines, nine consumer pages -- was UNGATED and excluded from
        // the denominator by the "imports no physics" clause, and I repeated it for four rounds as a number we
        // were quoting wrongly. IT IS GATED: physics/soft/fleshSph-selfcheck.mjs, volume-selfcheck.mjs and
        // boneField-selfcheck.mjs all import it, so gateReach never had it in `ungated` and this clause never
        // saw it. THE 97.0% WAS RIGHT THE WHOLE TIME.
        //
        // AND THE MISTAKE IS THE EXACT ONE gateReach's OWN HEADER WARNS ABOUT, in its own words: "I searched for
        // a file named rasterProbe-selfcheck, found none, and reported it ungated." I looked for
        // MarchingCubes-selfcheck.mjs, found none, and concluded the same thing -- AGAINST THE TOOL WHOSE
        // HEADER EXISTS TO STOP EXACTLY THAT. A NEIGHBOUR IS NOT A GATE; REACHABILITY IS.
        //
        // The widened test I wrote (a flat file several pages import is a library, not a scene) is defensible
        // and has ZERO INSTANCES, so it was REMOVED rather than shipped: a page-walk per module, costing real
        // time, guarding against a case that does not exist and was invented by my own error.
        const flatSim = p.startsWith("simulation/") && p.split("/").length === 2;
        if (flatSim && !importsPhysics(p)) scene.push(p); else nonScene.push(p);
    }
    const counts = { GATEABLE: 0, CANDIDATE: 0, GLUE: 0, HARDWARE: 0, UNCLASSIFIED: 0 };
    for (const p of nonScene) {
        const v = NON_SCENE[p] ? NON_SCENE[p].verdict : "UNCLASSIFIED";
        counts[v] = (counts[v] || 0) + 1;
    }
    const total = r.total, physicsTotal = total - scene.length;
    return { total, scene: scene.length, nonScene, counts,
             physicsTotal, physicsGated: r.gated,
             honestFraction: physicsTotal ? r.gated / physicsTotal : 0,
             rawFraction: r.fraction, sceneSample: scene.slice(0, 6) };
}

export function triageLines(t) {
    const out = [];
    out.push(`${t.total} modules counted; ${t.scene} are flat simulation scene files importing NO physics`);
    out.push(`  raw coverage ${(t.rawFraction * 100).toFixed(1)}%  ->  honest coverage ${(t.honestFraction * 100).toFixed(1)}% (${t.physicsGated} of ${t.physicsTotal})`);
    out.push(`  the ${t.nonScene.length} non-scene ungated: ` +
             Object.entries(t.counts).filter(([, n]) => n).map(([k, n]) => `${n} ${k}`).join(", "));
    for (const p of t.nonScene) {
        const e = NON_SCENE[p];
        out.push(`    ${(e ? e.verdict : "UNCLASSIFIED").padEnd(10)} ${p}`);
    }
    return out;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) for (const l of triageLines(triage())) console.log(l);
