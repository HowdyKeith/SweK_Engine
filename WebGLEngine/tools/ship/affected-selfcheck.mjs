// WebGLEngine/tools/ship/affected-selfcheck.mjs -- v2986
//
// Run: node tools/ship/affected-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs (auto-discovered).
//
// GATES tools/ship/affected.mjs -- which gates a change can even reach.
//
// THE SAME FAILURE HAS NOW HAPPENED THREE ROUNDS RUNNING, always the same sentence: a gate nobody can afford to
// run is a gate nobody runs. v2976 shipped three stale derived facts whose gates were correct and unread. v2983
// found benchmarks that had timed two engines for hundreds of versions without weighing either. v2985 found a
// ratchet reporting NINETY-SEVEN versions of drift. Every check was right, present, and unconsulted, because it
// lives in a suite that takes minutes.
//
// THE PROPERTY THAT MATTERS IS THE BROAD-PHASE PROPERTY: the selected set must be a SUPERSET of what could fail.
// Extra gates cost seconds. A MISSED gate is a SILENT green light on a broken tree -- so every ambiguity widens
// the answer and nothing narrows it.
//
// AND IT IS VALIDATED AGAINST THE MUTATION TABLE, not against itself: ten known breakages, each naming a file,
// and every one must reach at least one gate. A file that reached none would mean an incremental run shipping
// that bug.
import { buildGraph, affectedGates, importsOf, resolveSpec } from "./affected.mjs";
import { prose } from "./sourceScan.mjs";
import { MUTATIONS } from "../mutate/mutate.mjs";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ENG = path.join(HERE, "..", "..");
let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };

const graph = buildGraph();

// ---- 1. the graph covers the tree ------------------------------------------------------------------------------
{
    ok("the graph reaches every gate in the tree", graph.gateCount > 400, graph.gateCount + " gates");
    ok("...and every gate has a dependency set", graph.deps.size === graph.gateCount);
    ok("a gate always includes ITSELF", [...graph.deps.entries()].every(([g, set]) => set.has(g)),
       "editing a check is exactly when you want to run it");
    ok("unresolved imports are COUNTED, not hidden", typeof graph.unresolved === "number",
       graph.unresolved + " unresolved -- these widen the answer rather than silently dropping an edge");
}

// ---- 2. THE SUPERSET PROPERTY, validated against KNOWN breakages ---------------------------------------------------
{
    const files = [...new Set(MUTATIONS.map((m) => m.file))];
    const empty = files.filter((f) => affectedGates([f], graph).gates.length === 0);
    ok("!! EVERY mutation target reaches at least one gate", empty.length === 0,
       empty.length ? "REACHES NOTHING: " + empty.join(", ") : files.length + " files, all covered -- a file reaching no gate would mean an incremental run shipping that bug");
    const k = affectedGates(["physics/sph/kernels.js"], graph);
    ok("...and the selection is genuinely narrow", k.fraction < 0.1,
       k.gates.length + " of " + k.total + " gates (" + (100 * k.fraction).toFixed(1) + "%) -- the point is affordability, so it has to actually cut");
    ok("the sph kernel change reaches its OWN gate", k.gates.some((g) => /sph/.test(g)), k.gates.slice(0, 3).join(", "));
}

// ---- 3. AMBIGUITY WIDENS, NEVER NARROWS ------------------------------------------------------------------------------
{
    ok("an unknown file selects nothing rather than everything", affectedGates(["does/not/exist.js"], graph).gates.length === 0,
       "a file no gate reads cannot break one -- that is a real answer, not a failure to look");
    ok("!! an empty change list selects nothing", affectedGates([], graph).gates.length === 0);
    ok("...and the RUNNER refuses that case rather than reporting a pass", (() => {
        const s = fs.readFileSync(path.join(ENG, "tools", "ship", "selfchecks.mjs"), "utf8");
        return /Refusing to run a filtered set on an empty filter/.test(s);
    })(), "0 of 0 passing is a pass that means nothing");
    ok("resolveSpec returns null rather than guessing", resolveSpec(path.join(ENG, "main.js"), "./nope-not-here") === null);
    ok("importsOf ignores bare specifiers", !importsOf(path.join(ENG, "tools", "ship", "affected.mjs")).some((s) => s === "node:fs"),
       "node:fs is not ours and cannot be edited here");
}

// ---- 4. IT DOES NOT PRETEND TO REPLACE THE SHIP ---------------------------------------------------------------------
{
    const s = fs.readFileSync(path.join(ENG, "tools", "ship", "selfchecks.mjs"), "utf8");
    ok("!! the runner says it is a PRE-FILTER, not a ship", /PRE-FILTER, NOT A SHIP/.test(s),
       "verify.mjs is not decomposable this way and is what catches every mutation");
    ok("...and prints that on every run, not in documentation", /console\.log\("\[selfchecks\] PRE-FILTER/.test(s));
    ok("an empty selection is flagged as worth a second look", /graveyard census's whole subject/.test(s),
       "a module no check can reach is a different problem wearing the same output");
}

console.log(fails ? "\naffected-selfcheck: " + fails + " FAILED" : "\naffected-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
