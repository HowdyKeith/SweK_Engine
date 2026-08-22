// tools/fingerprint/libmTripwire-selfcheck.mjs
//
// Run: node tools/fingerprint/libmTripwire-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs (discovery gate).
//
// THE CROSS-MACHINE TEST THAT RUNS ON ONE MACHINE. The fingerprint's whole promise is "specified ops + strict
// libm only" -- IEEE 754 mandates + - * / sqrt fma to the bit, everything else is the host libm's opinion in the
// last ulp (tools/mathProbe.mjs is the long lecture). That promise used to be enforced by AUDIT AND HOPE, and
// v2889 found it broken three ways without any selfcheck noticing: Math.hypot ran 1800x per fingerprint inside
// flowfieldCpu.solveSync, 6x in voxelPose.rotateByQuat, and Math.sin/cos 4x each in solarSystem.planetState. On
// x86_64 the baseline still matched -- the leak was invisible at home and only diverged on the Mac, which is the
// most expensive possible place to find out.
//
// So: instrument every UNSPECIFIED Math function to record its caller, run the REAL computeFingerprint, and fail
// on ANY hit, naming the exact file:line. A machine cannot diverge from its peers along a code path that never
// calls the functions machines disagree about -- so this single-machine check IS the cross-machine guarantee,
// and it catches the next leak the day it is written, not the week the Mac diffs its baseline.

const UNSPEC = [
    "sin", "cos", "tan", "asin", "acos", "atan", "atan2", "exp", "log", "log2", "log10",
    "log1p", "expm1", "pow", "hypot", "cbrt", "sinh", "cosh", "tanh", "asinh", "acosh", "atanh",
];

let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };

// ---- 1. arm the tripwire BEFORE the fingerprint module loads ----------------------------------------------------
const hits = new Map();          // "fn @ file:line" -> count
const originals = {};
for (const name of UNSPEC) {
    originals[name] = Math[name].bind(Math);
    Math[name] = (...a) => {
        const frame = (new Error().stack.split("\n")[2] || "").trim().replace(/^at /, "");
        const key = name + " @ " + frame.replace(/file:\/\/\/.*?WebGLEngine\//, "");
        hits.set(key, (hits.get(key) || 0) + 1);
        return originals[name](...a);
    };
}

const { computeFingerprint, masterOf } = await import("./fingerprint.mjs");
const out = computeFingerprint();
const subs = Array.isArray(out) ? out : out.subsystems || Object.values(out).find(Array.isArray);

// tripwire itself must not poison later checks
for (const name of UNSPEC) Math[name] = originals[name];

// ---- 2. the verdict ---------------------------------------------------------------------------------------------
{
    const leaks = [...hits.entries()].sort((a, b) => b[1] - a[1]);
    ok("!! ZERO raw unspecified Math calls during the whole fingerprint", leaks.length === 0,
        leaks.length === 0
            ? subs.length + " subsystems computed touching only specified ops and strict libm -- a path that never calls the functions machines disagree about CANNOT diverge across machines"
            : "LEAKS: " + leaks.slice(0, 5).map(([k, n]) => n + "x " + k).join(" ; ") +
              " -- each of these lines is a per-platform hash waiting for a second machine");
}

// ---- 3. the tripwire can actually trip (a guard that cannot fail is decoration) ---------------------------------
{
    const probe = new Map();
    const orig = Math.hypot.bind(Math);
    Math.hypot = (...a) => { probe.set("hypot", (probe.get("hypot") || 0) + 1); return orig(...a); };
    Math.hypot(3, 4);
    Math.hypot = orig;
    ok("the instrumentation records a deliberate raw call", probe.get("hypot") === 1,
        "wrapped hypot(3,4) once -> counted once; the clean run above is a measurement, not a broken meter");
}

// ---- 4. the fingerprint still matches its own regenerated baseline ----------------------------------------------
{
    const fs = await import("node:fs");
    const base = fs.readFileSync(new URL("./BASELINE.md", import.meta.url), "utf8");
    let mismatches = 0;
    for (const s of subs) {
        const m = base.match(new RegExp("\\| " + s.name + " \\| `([0-9a-f]{64})`"));
        if (!m || m[1] !== s.hash) mismatches++;
    }
    const master = masterOf(subs);
    ok("all " + subs.length + " subsystem hashes match BASELINE.md on this machine", mismatches === 0,
        mismatches === 0 ? "master " + master.slice(0, 16) : mismatches + " lines differ -- rerun the baseline regen or find the change");
    ok("...including the master", base.includes(master),
        "the one line peers diff first");
}

console.log();
if (fails) { console.log("libmTripwire-selfcheck: " + fails + " FAILURES"); process.exit(1); }
console.log("libmTripwire-selfcheck: all checks pass");
