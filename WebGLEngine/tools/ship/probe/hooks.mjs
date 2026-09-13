// WebGLEngine/tools/ship/probe/hooks.mjs -- v4567
//
// The resolve hook that makes the shims real. A module.register() loader runs in its OWN thread-local module
// graph, and a `resolve` hook returning a different URL is the one mechanism that reaches a NAMED import of
// a builtin -- patching the exports object does not, which is the measurement v4567 is built on.
//
// THE SHIM'S OWN IMPORT OF THE REAL BUILTIN MUST NOT BE REDIRECTED, or the shim resolves to itself and dies
// with "Cannot access 'real' before initialization" -- which is exactly how the first draft failed. The
// parentURL check is that guard, and it is why the shims live in their own directory: one prefix test.
const DIR = new URL("./", import.meta.url).href;
const SHIMS = new Map([
    ["fs", "fsShim.mjs"], ["node:fs", "fsShim.mjs"],
    ["fs/promises", "fsPromisesShim.mjs"], ["node:fs/promises", "fsPromisesShim.mjs"],
    ["child_process", "cpShim.mjs"], ["node:child_process", "cpShim.mjs"],
]);

// *** AND THE HOOK HAD TO TAKE OVER RECORDING MODULE LOADS, BECAUSE REGISTERING IT STOPPED THEM. ***
// v4566 got the transitive closure for free: Node's ESM loader read module source through the public
// fs.readFileSync, so a patched fs saw every import as a read, and a gate was correctly invalidated by a
// change to something it imports THROUGH something it imports. Registering a loader hook moves that reading
// onto the hooks thread and off the patched object -- so the first run of v4567 recorded ZERO reads for
// tools/ship/vacuity-selfcheck.mjs, a gate whose entire input set is two module files. The mechanism that
// closed two holes had quietly opened a bigger one, and it looked like a SMALLER input set rather than an
// error, which is the direction that gets shipped.
//
// A `load` hook is the right instrument anyway: it names the module being loaded outright instead of
// inferring it from an incidental read. Depending on an internal implementation detail for the closure was
// always the weaker version, and this replaces it rather than restoring it.
//
// THE HOOKS RUN ON THEIR OWN THREAD, so they cannot reach ./record.mjs's sets in the main one. They write
// their OWN file into SWEK_PROBE_DIR instead -- which the recorder already merges, because a gate's node
// CHILDREN write files there too. One union, three writers.
import { appendFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import nodePath from "node:path";

const ENG = nodePath.resolve(fileURLToPath(DIR), "..", "..", "..");
const OUT = process.env.SWEK_PROBE_DIR
    ? nodePath.join(process.env.SWEK_PROBE_DIR, `loads-${process.pid}.txt`) : null;

function noteLoad(url) {
    if (!OUT || !url.startsWith("file:")) return;
    try {
        const r = nodePath.relative(ENG, fileURLToPath(url)).split(nodePath.sep).join("/");
        if (!r.startsWith("..")) appendFileSync(OUT, r + "\n");
    } catch {}
}

export async function resolve(spec, ctx, next) {
    const shim = SHIMS.get(spec);
    if (shim && !(ctx.parentURL || "").startsWith(DIR)) return { url: DIR + shim, shortCircuit: true };
    return next(spec, ctx);
}

export async function load(url, ctx, next) {
    noteLoad(url);
    return next(url, ctx);
}
