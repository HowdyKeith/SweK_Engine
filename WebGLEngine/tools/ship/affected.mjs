// WebGLEngine/tools/ship/affected.mjs -- v2986
//
// WHICH GATES COULD THIS CHANGE POSSIBLY BREAK?
//
// THIS ROUND EXISTS BECAUSE THE SAME FAILURE HAS NOW HAPPENED THREE TIMES IN A ROW, and it is always the same
// sentence: A GATE NOBODY CAN AFFORD TO RUN IS A GATE NOBODY RUNS.
//
//   v2976  three derived facts shipped stale. Two were gated, CORRECTLY, in the slow suite. Never consulted.
//   v2983  benchmarks timed two engines for hundreds of versions without weighing either.
//   v2985  the graveyard census, baseline 2, reported TWELVE -- ninety-seven versions of drift, because the
//          ratchet lives in the 465-gate suite that takes minutes and the ship gate is 74 checks that take one.
//
// Every one of those checks was right, present, and unread. The suite is minutes, so it runs at the end of a
// long session if at all -- which is exactly when a check you broke is most expensive to have introduced.
//
// So: given a set of changed files, which gates can even SEE them? Walk the import graph from every selfcheck
// and ask what it transitively reads. A change to physics/sph/kernels.js cannot break a gate that never loads it.
//
// THE PROPERTY THIS MUST HAVE, AND IT IS THE BROAD-PHASE PROPERTY EXACTLY: the selected set must be a SUPERSET of
// the gates that would actually fail. Extra gates cost seconds. A MISSED gate is a green light on a broken tree,
// and it would be SILENT. So every ambiguity WIDENS the answer: an unresolved import is counted as reaching
// everything downstream rather than nothing, and a gate whose own file changed is always included.
//
// AND IT IS VALIDATED AGAINST THE MUTATION TABLE rather than against itself. tools/mutate holds ten known
// breakages, each naming a file. For every one, the affected set for that file must be NON-EMPTY -- otherwise an
// incremental run would have shipped that bug. That is a test of the analysis, not of the code that implements it.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { gateFiles } from "./staleness.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ENG = path.resolve(HERE, "..", "..");
const rel = (p) => path.relative(ENG, p).replace(/\\/g, "/");

// v4283 -- *** THE THIRD WALKER THE v3041 NOTE BELOW IS ABOUT WAS NEVER ACTUALLY REMOVED, ONLY ORPHANED. ***
// A private walk() sat here with its own SKIP regex, called by nothing but itself -- v3041 stopped USING it and
// left it in the file. That is worse than either keeping or deleting it, because a dead walker reads as a live
// one to whoever revives it next, and this one was subtly wrong: its skip pattern was /[\\/]vendor/, unanchored
// to a path segment, so it matched "/vendoredLicences-selfcheck.mjs" as readily as "/vendor/". Reviving it
// would have silently dropped a real gate whose name merely STARTS with the word being excluded. Deleted, so
// that gateFiles() from staleness.mjs is the one walker in fact and not only in the comment.

/** Relative import specifiers. Bare ones (node:fs, three) are not ours and cannot be edited here. */
export function importsOf(file) {
    let src = "";
    try { src = fs.readFileSync(file, "utf8"); } catch { return []; }
    const out = new Set();
    const add = (s) => { if (s && (s.startsWith("./") || s.startsWith("../"))) out.add(s); };
    for (const m of src.matchAll(/\bfrom\s+["']([^"']+)["']/g)) add(m[1]);
    for (const m of src.matchAll(/\bimport\s*\(\s*["']([^"']+)["']\s*\)/g)) add(m[1]);
    for (const m of src.matchAll(/\brequire\(\s*["']([^"']+)["']\s*\)/g)) add(m[1]);
    return [...out];
}

/** Resolve against the extensions this tree actually uses. Returns null when it cannot -- the caller WIDENS. */
export function resolveSpec(fromFile, spec) {
    const base = path.resolve(path.dirname(fromFile), spec);
    for (const c of [base, base + ".js", base + ".mjs", base + ".cjs",
                     path.join(base, "index.js"), path.join(base, "index.mjs")]) {
        try { if (fs.statSync(c).isFile()) return c; } catch {}
    }
    return null;
}

/** { gate -> Set(files it transitively reads) }, plus a count of edges that could not be resolved. */
export function buildGraph() {
    // v3041 -- was a THIRD definition of "a gate exists here" (/selfcheck.*\.mjs$/), which matched
    // tools/ship/selfchecks.mjs -- the runner -- and built an import graph rooted at it. staleness.mjs owns the
    // one walker; this imports it. Three walkers, two patterns, one silent extra gate for 153 versions.
    const gates = gateFiles();
    const deps = new Map();
    let unresolved = 0;
    for (const g of gates) {
        const seen = new Set([g]);
        const stack = [g];
        while (stack.length) {
            const cur = stack.pop();
            for (const spec of importsOf(cur)) {
                const r = resolveSpec(cur, spec);
                if (!r) { unresolved++; continue; }
                if (seen.has(r)) continue;
                seen.add(r); stack.push(r);
            }
        }
        deps.set(rel(g), new Set([...seen].map(rel)));
    }
    return { deps, gateCount: gates.length, unresolved };
}

/** Gates a change can reach. A gate whose own file changed is ALWAYS included. */
/**
 * v3465 -- A RE-EXPORT HUB DEFEATS DEPENDENCY SELECTION, AND THE FIX IS TO SEE THROUGH IT.
 *
 * tools/roundhouse/devices.mjs statically imports every *Bind.mjs, and every bind imports its physics. NINETY-
 * SEVEN roundhouse gates import devices.mjs. So a change to ANY physics module reaches almost every gate through
 * that one file: of the 121 gates selected for a change to physics/sph/kernels.js, 111 -- ninety-two percent --
 * arrive via the hub. Selectivity was fine for tooling (a valueMatch.mjs change selects 6 gates, 0.8%) and
 * collapsed for physics (15.2%), which is what tripped the affordability check.
 *
 * *** THE HUB IS TRANSPARENT IF THE GATE NAMES ITS DEVICES, AND 83 OF THE 97 DO. *** A gate calling
 * getDevice("kerr") depends on kerrBind and its physics, not on every bind in the registry. Resolving that turns
 * one edge into the right edge rather than deleting information.
 *
 * THE OTHER FOURTEEN NAME NO DEVICE -- they iterate DEVICE_NAMES, because they are the CENSUSES: gradedCoverage,
 * valueMatch, sensitivity, resultBaseline. Those genuinely depend on every device and SHOULD be selected by any
 * physics change. They keep the hub edge, and that is correct behaviour rather than a residue.
 *
 * WHAT THIS DELIBERATELY DOES NOT DO is make the imports dynamic. That would also break the hub edge, and it
 * would break it by making a REAL dependency invisible -- a gate that tests xpbd genuinely does depend on
 * xpbdBind, and a selector that stopped seeing it would under-select and skip the gate that matters. Silence is
 * not selectivity.
 */
// *** AND THERE IS NO SECOND HUB OF THIS SHAPE, WHICH WAS CHECKED RATHER THAN ASSUMED. ***
//
// Ranking every file by how many gates reach it, the next candidates after devices.mjs resolve away on their
// own: blobPhantom 17.6% -> 9.4%, xpbd.js 17.5% -> 9.1%, md.js 16.3% -> 8.1%, flowfieldCpu 16.0% -> 7.7%. They
// were high only because they were reached THROUGH the registry.
//
// One does not move: tools/strictTrig.mjs, at 17.0% before and after. It is not a hub -- it is a genuine deep
// dependency. Four gates import it directly and 137 reach it through the physics that calls it, and that is
// correct: strictTrig provides sin and cos that are the same bits on every machine, so if those bits change,
// every downstream result changes with them. Selecting 137 gates for a change to it is the honest answer.
//
// THE DISTINCTION IS REGISTRY versus LIBRARY. A registry hands a gate everything whether it uses it or not, so
// the edge is spurious and worth resolving. A library hands a gate what it calls, so the edge is real and
// resolving it would be under-selection. Only devices.mjs is the first kind.
const HUB = "tools/roundhouse/devices.mjs";

/** Devices a gate names literally. Empty means it iterates the registry and depends on all of them. */
export function namedDevices(gateSource) {
    const out = new Set();
    for (const m of gateSource.matchAll(/getDevice\(\s*["']([A-Za-z0-9_]+)["']/g)) out.add(m[1]);
    return [...out];
}

/**
 * Rebuild one gate's dependency set with the hub resolved to the binds it actually reaches.
 * Returns null when the gate does not go through the hub, or names nothing (a census).
 */
export function resolveHub(gate, files, readFile, graph) {
    if (!files.has(HUB)) return null;
    const src = readFile(gate);
    if (src == null) return null;
    const named = namedDevices(src);
    if (!named.length) return null;                       // a census -- depends on everything, correctly

    const keep = new Set();
    for (const f of files) {
        // drop bind files and their physics unless the gate named that device
        const m = /^tools\/roundhouse\/([A-Za-z0-9_]+)Bind\.mjs$/.exec(f);
        if (m) {
            const dev = m[1].toLowerCase();
            if (named.some((n) => n.toLowerCase() === dev)) keep.add(f);
            continue;
        }
        keep.add(f);
    }
    // v3465b -- THE BIND CLOSURE MUST BE WALKED, NOT LOOKED UP.
    //
    // The first version did graph.deps.get(bindFile). deps keys only GATES, so that was always undefined,
    // viaNamed stayed empty, and EVERY physics file was stripped from EVERY named-device gate. Measured: 45 of
    // 46 single-device gates stopped being selected for their own physics. The headline 15.2% -> 6.5% was
    // under-selection wearing selectivity's clothes -- exactly what the comment above warns against, shipped
    // anyway because the fraction moved the right way and I read that as success.
    //
    // A dependency selector that gets QUIETER is indistinguishable from one that gets SMARTER by looking at the
    // number alone. The check that separates them is whether a gate testing device X is still selected when X's
    // physics changes, and it has to be run before the improvement is believed.
    const viaNamed = new Set();
    for (const f of keep) {
        if (!/Bind\.mjs$/.test(f)) continue;
        const seen = new Set([f]);
        const stack = [f];
        while (stack.length) {
            const cur = stack.pop();
            for (const spec of importsOf(cur)) {
                const r = resolveSpec(cur, spec);
                if (!r) continue;
                const rr = rel(r);
                if (seen.has(rr)) continue;
                seen.add(rr); stack.push(rr);
            }
        }
        for (const d of seen) viaNamed.add(d);
    }
    const result = new Set();
    for (const f of files) {
        if (/^physics\/|^simulation\/|^fluid\/|^brain\//.test(f)) {
            if (viaNamed.has(f)) result.add(f);
            continue;
        }
        if (/Bind\.mjs$/.test(f)) { if (keep.has(f)) result.add(f); continue; }
        result.add(f);
    }
    return result;
}

export function affectedGates(changedFiles, graph = null) {
    const g = graph || buildGraph();
    const changed = new Set((changedFiles || []).map((f) => String(f).replace(/\\/g, "/").replace(/^\.\//, "")));
    const hit = [];
    // v3465 -- resolve the devices.mjs hub per gate before testing membership. A gate that NAMES its devices
    // depends on those binds and their physics, not on every bind in the registry.
    const readFile = (f) => { try { return fs.readFileSync(f, "utf8"); } catch { return null; } };
    for (const [gate, files] of g.deps) {
        if (changed.has(gate)) { hit.push(gate); continue; }
        const resolved = resolveHub(gate, files, readFile, g) || files;
        for (const f of changed) if (resolved.has(f)) { hit.push(gate); break; }
    }
    return { gates: hit.sort(), total: g.deps.size, fraction: hit.length / Math.max(1, g.deps.size) };
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
    const files = process.argv.slice(2);
    if (!files.length) {
        const g = buildGraph();
        console.log("[affected] " + g.gateCount + " gates, " + g.unresolved + " unresolved imports (these WIDEN the answer)");
        console.log("[affected] usage: node tools/ship/affected.mjs <changed file> [...]");
    } else {
        const a = affectedGates(files);
        console.log("[affected] " + a.gates.length + " of " + a.total + " gates (" + (100 * a.fraction).toFixed(1) + "%)");
        for (const x of a.gates) console.log("   " + x);
    }
}
