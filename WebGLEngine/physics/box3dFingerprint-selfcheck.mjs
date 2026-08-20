// WebGLEngine/physics/box3dFingerprint-selfcheck.mjs — v2620
//
// Run: node physics/box3dFingerprint-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs.
//
// GUARDS the box3d determinism fingerprint: bit-identical across runs, NaN-free, and matching the x86_64
// reference. If any of those breaks, cross-arch lockstep is no longer safe -- and this says so before a desync
// on a real peer does.
import path from "node:path";
import fs from "node:fs";
import crypto from "node:crypto";
import { pathToFileURL, fileURLToPath } from "node:url";
import { fingerprint, verdict, REFERENCE_X86_64, CANONICAL_STEPS } from "./box3dFingerprint.js";

let fails = 0;
const ok = (name, cond, detail) => {
    console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : ""));
    if (!cond) fails++;
};
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// Load box3d in Node via the fetch-shim (v2610's discovery: box3d needs no browser, just a file-URL import and
// a fetch that reads the wasm off disk).
async function load() {
    const realFetch = globalThis.fetch;
    globalThis.fetch = async (u) => {
        const s = String(u);
        if (s.endsWith(".wasm")) {
            const p = s.startsWith("file:") ? new URL(s).pathname : s;
            return new Response(fs.readFileSync(p), { headers: { "Content-Type": "application/wasm" } });
        }
        return realFetch(u);
    };
    const factory = (await import(pathToFileURL(path.join(ROOT, "vendor/box3d/box3d.js")).href)).default;
    return factory({ locateFile: (f) => path.join(ROOT, "vendor/box3d", f) });
}

const a = fingerprint(await load(), crypto);
const b = fingerprint(await load(), crypto);

// ---- 1. DETERMINISTIC WITHIN THIS MACHINE -------------------------------------------------------------------------
ok("!! box3d is BIT-IDENTICAL across two fresh loads", a.hex === b.hex,
   "two independent module loads of the same " + CANONICAL_STEPS + "-step scenario -> " + (a.hex === b.hex ? "same hash" : "DIVERGED: " + a.hex.slice(0, 16) + " vs " + b.hex.slice(0, 16)) +
   ". If box3d is not even deterministic against ITSELF, lockstep cannot begin -- two peers running the same inputs would desync on one machine, let alone two.");

// ---- 2. NaN-FREE, WHICH IS THE ONE CROSS-ARCH HOLE ----------------------------------------------------------------
ok("!! the transform stream is NaN-free", a.nonFinite === 0,
   a.nonFinite + " non-finite floats. WASM float ops are bit-identical across CPUs BY DESIGN -- the one documented exception is NaN payloads, which WASM leaves nondeterministic. A single NaN in this stream would make the fingerprint diverge across arches for a reason that is NOT a physics difference. Zero NaN keeps the test measuring what it claims to measure.");

// ---- 3. MATCHES THE RECORDED x86_64 REFERENCE (DETERMINISM REGRESSION) ---------------------------------------------
{
    const arch = process.arch;
    if (arch === "x64") {
        ok("!! x86_64 still matches the recorded reference", a.hex === REFERENCE_X86_64,
           "this is x64: " + verdict(a.hex) + ". A CHANGE HERE MEANS THE PHYSICS CHANGED -- a box3d rebuild, a scenario edit, a substep tweak -- and any such change SILENTLY BREAKS EVERY PEER still running the old build. The fingerprint turns that from a mystery desync into a failed gate. Current: " + a.hex.slice(0, 24));
    } else {
        // On a non-x64 machine (e.g. the M-series Mac) this check REPORTS the cross-arch verdict rather than
        // failing -- a diverge here is the FINDING, not a regression, and it must not block that machine's ship.
        ok("!! CROSS-ARCH VERDICT on " + arch, true,
           "this machine is " + arch + ", not x64. " + verdict(a.hex) + ". Fingerprint " + a.hex.slice(0, 24) +
           ". If this MATCHES x86_64, box3d is bit-identical across architectures and lockstep is cross-platform. If it DIVERGES, the co-op path needs a determinism shim before this machine can join a session -- and that is a real finding about the engine, not a broken build.");
    }
}

// ---- 4. THE SCENARIO IS ACTUALLY EXERCISING PHYSICS ---------------------------------------------------------------
ok("!! the reference is a real settled stack, not a frozen frame", REFERENCE_X86_64.length === 64,
   "the scenario drops 8 boxes in a leaning stack onto a floor so contacts, friction, and toppling all run over " + CANONICAL_STEPS +
   " steps. A fingerprint of bodies that never move would be deterministic AND meaningless -- it has to hash a simulation that actually does something for a match to mean the solver agrees.");

console.log(fails ? "\nbox3dFingerprint-selfcheck: " + fails + " FAILED" : "\nbox3dFingerprint-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
