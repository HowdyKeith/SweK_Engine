import { pathToFileURL, fileURLToPath } from "node:url";
// WebGLEngine/tools/roundhouse/gradedCoverage.mjs -- v3195
//
// HOW MUCH OF THE PROVEN PHYSICS IS ACTUALLY GRADED BY THE LAB?
//
// Keith asked whether proven physics modules are missing from the graded lab, and named figureEight and
// gyroscope. They are, and so are dozens more: 96 physics modules carry their own selfcheck, and only 22 are
// reachable from a device bind.
//
// *** REACHABILITY IS EXACT AND CLASSIFICATION IS NOT, WHICH IS WHY THIS REPORTS ONE AND REFUSES THE OTHER. ***
// A module is graded if some tools/roundhouse/*Bind.mjs imports it -- that is a fact about the import graph,
// decidable by reading. Whether an UNGRADED module "has an answer key" is not: I classified them by keyword and
// it put gyroscope in the wrong pile, even though its gate holds dL/dt = tau and proves that a faster spin
// precesses SLOWER. THE KEYWORD PROBE HAS NOW MISLED THIS PROJECT THREE TIMES -- v3174's mode count, v3189's
// census, and that. So this module counts what it can count and NAMES the rest for a person to read.
//
// THE RATCHET DIRECTION IS DOWNWARD-IS-WRONG. Wiring a proven module into a device is progress and must not
// fail a build; UNWIRING one is a regression and must. So the assertion is that the GRADED COUNT DOES NOT
// SHRINK -- not that the ungraded count stays put, which would punish exactly the work this is meant to prompt.

import fs from "node:fs";
import path from "node:path";

/**
 * Folders whose selfchecks prove PHYSICS, with the reason each is here.
 *   physics/     the obvious one, and the only root this census had until v3298
 *   simulation/  lattice Boltzmann, tomographic reconstruction, ferromagnetics, ragdoll dynamics -- physics that
 *                predates the physics/ folder, which is exactly why it sat outside it
 *   fluid/       the multigrid pressure solve and its GPU port
 */
export const PHYSICS_ROOTS = ["physics", "simulation", "fluid"];

/** Every physics module that has its own selfcheck beside it -- "proven" in this tree's sense. */
export function provenModules(engRoot) {
    const out = [];
    const walk = (d) => {
        let ents; try { ents = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
        for (const e of ents) {
            const p = path.join(d, e.name);
            if (e.isDirectory()) { walk(p); continue; }
            if (!/-selfcheck\.mjs$/.test(e.name)) continue;
            const base = p.replace(/-selfcheck\.mjs$/, "");
            for (const ext of [".js", ".mjs"]) {
                if (fs.existsSync(base + ext)) { out.push({ mod: path.relative(engRoot, base + ext).replace(/\\/g, "/"),
                                                            gate: path.relative(engRoot, p).replace(/\\/g, "/") }); break; }
            }
        }
    };
    // v3298 -- THE CENSUS SCANNED ONE FOLDER, AND THE FOLDER WAS NOT THE SUBJECT.
    //
    // Keith asked why non-physics folders were excluded, given that many devices predate the physics/ directory.
    // The answer is that they were not excluded on purpose -- the walk was rooted at physics/ and nothing ever
    // revisited it. The cost, measured: 72 proven modules carry their own selfcheck outside physics/, and
    // simulation/ alone holds 22, including simulation/lbm/ (lattice Boltzmann), simulation/tomo/ (tomographic
    // reconstruction) and ferro/ferroThermal. Those are physics by any reading; only their path said otherwise.
    // v3297 wired simulation/lbm/twoFExperiment.mjs as a graded device and THE COUNT DID NOT MOVE, which is how
    // the blind spot surfaced.
    //
    // REGISTERED, NOT GUESSED. The roots are a list with a reason each, so adding one is a visible decision.
    // brain/, render/, mesh/, core/ and engine/ are deliberately NOT here: their selfchecks prove software
    // (a policy cache, a mesh decimator, an SSAO pass), and a census of PROVEN PHYSICS that counted them would
    // be measuring a different thing while keeping the same name.
    for (const root of PHYSICS_ROOTS) walk(path.join(engRoot, root));
    return out;
}

/**
 * Which physics modules a device bind imports. EXACT: it reads the import specifiers rather than guessing from
 * names -- v3194 found that 'ct' lives in tomographyBind.mjs and 'windtunnel' is exported as fluidDevice, so
 * A NAME IS NOT A LOCATION and a name-based scan misses real wiring.
 */
export function importedByBinds(engRoot) {
    const dir = path.join(engRoot, "tools", "roundhouse");
    const hit = new Set();
    for (const f of fs.readdirSync(dir).filter((x) => /Bind\.mjs$/.test(x))) {
        const s = fs.readFileSync(path.join(dir, f), "utf8");
        // v3298 -- THE SAME FOLDER ASSUMPTION, IN A SECOND PLACE. This regex hardcoded "physics/" in the import
        // SPECIFIER, so a bind importing ../../simulation/lbm/twoFExperiment.mjs was invisible even after the
        // walk was widened to include simulation/. The denominator moved from 113 to 123 and the numerator did
        // not, which is how the second copy surfaced -- one assumption, written twice, fixed once.
        const rootAlt = PHYSICS_ROOTS.join("|");
        for (const m of s.matchAll(new RegExp(`from\\s+["']([^"']*(?:${rootAlt})\\/[^"']+)["']`, "g"))) {
            hit.add(path.normalize(path.join("tools", "roundhouse", m[1])).replace(/\\/g, "/"));
        }
    }
    return hit;
}

/**
 * v3458 -- THE METRIC COUNTS WHAT A BIND IMPORTS, NOT WHAT IT EXERCISES, AND THAT UNDERCOUNTS.
 *
 * xpbdBind imports physics/xpbd/compliance.mjs, which imports physics/xpbd/xpbd.js and drives it -- the Hooke
 * key, the iteration-independence claim and a planted PBD variant all run THROUGH xpbd.js. It is graded in every
 * sense that matters and this function still lists it as ungraded, because importedByBinds reads only the
 * DIRECT import line of a *Bind.mjs file.
 *
 * The proxy is "a bind names it, therefore a device drives it", and the proxy breaks the moment a device reaches
 * its physics through a helper. Deepening it to a transitive walk would fix the undercount and widen the
 * numerator by whatever else helpers pull in, which is a change to what the number MEANS and not a bug fix.
 *
 * Recorded rather than worked around. Adding a direct import to xpbdBind purely to move this number would be
 * making the metric agree with reality by editing the reality, which is the wrong direction.
 */
export function gradedCoverage(engRoot) {
    const proven = provenModules(engRoot);
    const imported = importedByBinds(engRoot);
    const graded = [], ungraded = [];
    for (const p of proven) (imported.has(path.normalize(p.mod).replace(/\\/g, "/")) ? graded : ungraded).push(p);
    return {
        proven: proven.length,
        graded: graded.map((x) => x.mod),
        ungraded: ungraded.map((x) => x.mod),
        // NO "has a key" FIELD, DELIBERATELY. That is the judgement a keyword probe got wrong, and offering it
        // as a number would invite somebody to trust it.
    };
}

const ENGROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

// v3219 -- A FRONT DOOR. *** RUNNING THIS FILE PRINTED NOTHING AND EXITED 0, WHICH READS AS A CLEAN BILL. ***
// EIGHT of this tree's analysis tools did that, not the two on record: an empty report and a tool that never
// ran are indistinguishable from a shell, and every one of them was ALSO reported by graveyard-selfcheck as an
// orphaned utility -- because its only consumer was its own gate. One main block answers both: the tool becomes
// runnable by a person, and it acquires a caller that is not a test.

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
    const r = gradedCoverage(ENGROOT);
    console.log("[gradedCoverage] " + r.graded.length + " of " + r.proven + " physics modules with a selfcheck are reachable from a device bind.");
    console.log("[gradedCoverage] REACHABILITY IS EXACT (read from the import specifier). It does NOT claim the");
    console.log("[gradedCoverage] ungraded deserve devices -- many are solvers, and a solver needs self-consistency, not an answer key.");
    console.log("  graded:");
    for (const m of r.graded) console.log("      " + m);
    console.log("  ungraded (" + r.ungraded.length + "):");
    for (const m of r.ungraded) console.log("      " + m);
}
