// WebGLEngine/tools/ship/gateReach.mjs — v3318
// ---------------------------------------------------------------------------------------------------------------
// WHICH PHYSICS MODULES ARE GRADED BY ANY GATE AT ALL — the denominator nobody had.
//
// gradedCoverage.mjs reports "50 of 124 physics modules WITH A SELFCHECK are reachable from a device bind". That
// is a real and useful measurement, and its denominator is SELF-SELECTING: a module with no sibling selfcheck is
// not in the 124, so it cannot appear as uncovered. The population it cannot see is invisible to it by
// construction.
//
// AND A SIBLING FILE IS NOT THE CRITERION ANYWAY. simulation/em/fdtd1d.js has no sibling selfcheck and is
// thoroughly gated -- by tools/ship/physicsSuite.mjs, three directories away. Counting files that lack a
// neighbour would have called it ungated and been wrong. Reachability through the IMPORT GRAPH is the only
// honest test, and affected.mjs already builds one.
//
// MEASURED: 317 physics modules, 187 reachable from at least one gate, 130 from none.
//
// *** WHAT THIS DOES NOT CLAIM. *** The 130 are NOT 130 defects. gradedCoverage says it plainly for its own
// number and it is just as true here: many of these are loaders, meshers, glue and UI adapters, and a solver
// needs self-consistency rather than an answer key. This is a DENOMINATOR, not a verdict. Its value is that
// nobody could previously say how large the unexamined population was, and "we grade 50 of 124" reads very
// differently from "we grade 187 of 317, and 130 have never been looked at".
// ---------------------------------------------------------------------------------------------------------------
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { buildGraph } from "./affected.mjs";
import { gateFiles } from "./staleness.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
export const PHYSICS_ROOTS = ["physics", "simulation", "fluid"];

// v3350 -- *** THE POPULATION WAS PHYSICS ONLY, AND THE QUESTION THAT EXPOSED IT WAS ABOUT render/. ***
// Asked "is render/rasterProbe.js gated", I searched for a file named rasterProbe-selfcheck, found none, and
// reported it ungated. IT IS GATED -- by tools/ship/compositeDepth-selfcheck.mjs, which imports it. THIS FILE'S
// OWN HEADER, WRITTEN AT v3318, SAYS EXACTLY WHY THAT SEARCH IS WRONG: "A SIBLING FILE IS NOT THE CRITERION
// ANYWAY... Counting files that lack a neighbour would have called it ungated and been wrong." The tool that
// would have answered me existed, and its population did not reach the directory I was asking about, so the
// right correction is not to be more careful -- it is to widen the population.
export const RENDER_ROOTS = ["render", "voxel", "world", "mesh"];
export const ALL_ROOTS = [...PHYSICS_ROOTS, ...RENDER_ROOTS];
const rel = (p) => path.relative(ENG, p).replace(/\\/g, "/");

/** Every physics module, excluding the gates themselves. */
export function physicsModules(roots = PHYSICS_ROOTS) {
    const out = [];
    const walk = (d) => {
        for (const e of fs.readdirSync(d, { withFileTypes: true })) {
            if (e.name === "node_modules" || e.name.startsWith(".")) continue;
            const p = path.join(d, e.name);
            if (e.isDirectory()) { walk(p); continue; }
            if (!/\.(js|mjs)$/.test(e.name) || /-selfcheck\./.test(e.name)) continue;
            out.push(rel(p));
        }
    };
    for (const r of roots) { const d = path.join(ENG, r); if (fs.existsSync(d)) walk(d); }
    return out.sort();
}

/** Reachability from ANY gate, through the real import graph. */
export function reach(roots = PHYSICS_ROOTS) {
    const mods = physicsModules(roots);
    const g = buildGraph();
    const covered = new Set();
    for (const [, deps] of g.deps) for (const d of (deps || [])) {
        covered.add(rel(path.isAbsolute(d) ? d : path.join(ENG, d)));
    }
    const gated = mods.filter((m) => covered.has(m));
    const ungated = mods.filter((m) => !covered.has(m));
    return { total: mods.length, gated: gated.length, ungated, gates: gateFiles().length,
             roots, fraction: mods.length ? gated.length / mods.length : 0 };
}

export function reachLines(r) {
    const out = [];
    out.push(`${r.total} physics modules; ${r.gated} reachable from at least one of ${r.gates} gates (${(r.fraction * 100).toFixed(1)}%)`);
    out.push(`  ${r.ungated.length} reachable from none — A DENOMINATOR, NOT A VERDICT: many are loaders, meshers and glue,`);
    out.push(`  and a solver needs self-consistency rather than an answer key. What it buys is knowing the size of the`);
    out.push(`  unexamined population, which nobody could state before.`);
    return out;
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
    const r = reach();
    for (const l of reachLines(r)) console.log(l);
    console.log("\n  first twenty with no gate at all:");
    for (const m of r.ungated.slice(0, 20)) console.log("    " + m);
}
