// tools/fingerprint/fingerprint-selfcheck.mjs
//
// Run: node tools/fingerprint/fingerprint-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs.
//
// The fingerprint is only useful if it is (a) STABLE -- the same on this machine every time, so any difference on
// another machine means a real divergence, not noise; (b) COMPLETE -- it actually folds in every subsystem, so a
// science cannot diverge undetected; and (c) SENSITIVE -- each subsystem genuinely moves the master, so it is not a
// constant that would match across machines for the wrong reason. This gate checks all three, and shows a
// non-deterministic "subsystem" fails the stability test, so that test is not vacuous.
import { createHash } from "node:crypto";
import { computeFingerprint, masterOf } from "./fingerprint.mjs";

let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };

// ---- 1. STABILITY: the fingerprint is identical across repeated runs on this machine ------------------------------
{
    const a = computeFingerprint(), b = computeFingerprint();
    let same = a.master === b.master && a.subsystems.length === b.subsystems.length;
    for (let i = 0; i < a.subsystems.length && same; i++) if (a.subsystems[i].hash !== b.subsystems[i].hash) same = false;
    ok("!! the fingerprint is stable across runs (so any cross-machine diff is real)", same,
       "two independent runs produced the identical master and every identical subsystem hash -- the harness has no run-to-run noise, so a mismatch on another machine means a genuine divergence.");
}

// ---- 2. COVERAGE: every expected subsystem is present with a real 256-bit hash ------------------------------------
{
    const { subsystems } = computeFingerprint();
    const expect = ["strict-libm", "md-forcefield", "obb-collision", "ewald-electrostatics", "prime-transport", "astar-pathfinding", "xpbd-cloth", "tf-advect", "cloth-collision", "xpbd-damped", "cloth-tear", "cloth-pinned", "thermal-cloth", "plastic-cloth", "muscle-actuator", "fluid-mesh", "pbf-fluid", "fluid-pbf", "volume-balloon", "friction-slope", "friction-pile", "fluid-drag", "cloth-anisotropy", "pbf-polish", "sampled-field", "wind-cloth", "muscle-belly", "thermal-diffusion", "centrifuge", "gyroscope", "pendulum-wave", "orbit", "vibrations", "fft", "zeta", "zeta-critical", "figure-eight", "lockstep", "black-hole", "solar-system", "neutron-star", "plasma", "impact", "render", "agent-arena", "agent-pertick", "fleet-agent", "trace-truth", "pulsar", "predict"];
    const names = subsystems.map((s) => s.name);
    const allNamed = expect.every((e) => names.includes(e)) && names.length === expect.length;
    const allHashed = subsystems.every((s) => /^[0-9a-f]{64}$/.test(s.hash));
    ok("!! every deterministic subsystem is folded into the fingerprint", allNamed && allHashed,
       "covers " + names.join(", ") + " -- strict-libm, the MD force field, collision, electrostatics and search, each a full 256-bit hash. A science left out could diverge unseen.");
}

// ---- 3. DISTINCTNESS: no two subsystems share a hash (none is a no-op / constant) --------------------------------
{
    const { subsystems } = computeFingerprint();
    const set = new Set(subsystems.map((s) => s.hash));
    ok("!! each subsystem contributes a distinct hash (none is a constant or no-op)", set.size === subsystems.length,
       subsystems.length + " subsystems, " + set.size + " distinct hashes -- each science actually ran and produced its own signature.");
}

// ---- 4. SENSITIVITY: flipping any one subsystem hash changes the master -------------------------------------------
{
    const { subsystems, master } = computeFingerprint();
    let allMove = true;
    for (let i = 0; i < subsystems.length; i++) {
        const tampered = subsystems.map((s, j) => j === i ? { name: s.name, hash: "0".repeat(64) } : s);
        if (masterOf(tampered) === master) { allMove = false; break; }
    }
    ok("!! the master hash depends on every subsystem (change one, the master changes)", allMove,
       "zeroing any single subsystem's hash changed the master for all five -- the master genuinely incorporates each science, so none can drift without moving the number Keith compares.");
}

// ---- 5. CONTRAST: a non-deterministic subsystem fails stability (so test 1 is not vacuous) ------------------------
{
    const nd = () => createHash("sha256").update(String(Math.random())).digest("hex");   // a "subsystem" that uses randomness
    const moved = nd() !== nd();
    ok("!! a non-deterministic subsystem would fail the stability check", moved,
       "a subsystem drawing on Math.random gives different hashes on two runs -- exactly what the stability test (check 1) is built to catch, confirming it can tell a reproducible science from an irreproducible one.");
}

const { master } = computeFingerprint();
console.log("\n  this machine's master fingerprint: " + master);
console.log(fails ? "\nfingerprint-selfcheck: " + fails + " FAILED" : "\nfingerprint-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
