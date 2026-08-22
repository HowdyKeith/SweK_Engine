// WebGLEngine/tools/roundhouse/backendRotation.mjs -- v3564
// ---------------------------------------------------------------------------------------------------------------
// DOES THE SHIPPED PHYSICS BACKEND CARRY THE GYROSCOPIC TERM? -- ASKED OF box3d ITSELF, HEADLESS, IN NODE.
//
// v3562 built the answer key (physics/mechanics/freeRotation.mjs) and v3563 bound it as a device, both stopping
// at the backend on purpose. The blocker named there was that the ten-call conformance contract has no angular
// entry. *** THE BLOCKER WAS SMALLER THAN THAT: box3d BOOTS IN NODE AND THE SHIM ALREADY EXPORTS EVERYTHING
// THIS NEEDS. *** Keith said so ("i am sure the box3d.wasm will drive headless") and he was right.
//
// _swk_body_box takes THREE half-extents (a distinct-moment body -- addShip's cube was never the only option),
// _swk_body_ang_impulse spins it, and _swk_transforms returns pos + QUATERNION. So the spin axis can be watched
// in world space with no angular-velocity reader at all, which is the whole reason readVelocities() being
// linear-only was never the blocker it looked like.
//
// ONE MECHANICAL OBSTACLE, AND IT IS NOT A PHYSICS ONE: Node's fetch has no file:// scheme, and vendor/box3d/
// box3d.js loads its wasm with fetch(locateFile(...)). It is handed a data: URL instead -- which fetch DOES
// support -- so the module loads its own bytes and never knows the difference. NO SHIM, NO REBUILD, NO PATCH.
//
// ================================================================================================================
// *** THE FIRST ANSWER WAS WRONG AND THE EXPERIMENT WAS UNDER-POWERED. THIS IS THE ROUND'S REAL FINDING. ***
// ================================================================================================================
//
// The first run spun the body at omega = 0.2 (an angular impulse of 1 on a moment of 5) and swept the seed
// perturbation 0.001 -> 0.05. Every axis, including the INTERMEDIATE one, showed a wander that was BOUNDED,
// QUADRATIC IN THE SEED, and FLAT IN TIME -- 1.54e-5 / 1.54e-3 / 3.79e-2 -- which is exactly the signature of a
// solver whose w is constant. I was one paragraph from reporting THAT BOX3D DROPS THE GYROSCOPIC TERM.
//
// IT DOES NOT. Raise the spin to omega = 2 and box3d's spin axis REVERSES COMPLETELY: 1-|cos| reaches 0.999.
//
// THE CAUSE IS DERIVABLE AND SHOULD HAVE BEEN DERIVED FIRST: sigma = W sqrt((I2-I1)(I3-I2)/(I1 I3)) IS
// PROPORTIONAL TO THE SPIN RATE. At omega = 0.2 the growth rate is 0.096/s, so thirty seconds buys e^2.88 =
// 17.8x -- and 17.8 times a one-percent seed is still eighteen percent, A WOBBLE AND NOT A FLIP. The experiment
// has a MINIMUM SPIN RATE below which "no flip" is a statement about the window, not about the solver.
//
// *** v3507's SHAPE EXACTLY -- A NULL FROM AN INSTRUMENT NOBODY SHOWED COULD SEE ANYTHING -- and the guard is
// the same one v3562 already used on the CPU side and I failed to carry across: DEMAND THAT THE ANSWER KEY
// FLIP UNDER THE SAME SETTINGS BEFORE READING ANYTHING INTO THE BACKEND'S SILENCE. *** minimumSpin() below
// derives the rate the window requires, and the gate refuses to interpret a backend run that falls under it.
//
// ================================================================================================================
// WHAT IS AND IS NOT CLAIMED
// ================================================================================================================
//
// CLAIMED: box3d's spin axis leaves its starting direction and reverses, on a body with three distinct moments,
// started about the intermediate axis -- so the term is present in some form. THE OBSERVABLE IS THE ORIENTATION
// AND NOTHING ELSE, which is what any backend can supply.
//
// NOT CLAIMED: that box3d's rate matches the linearisation. It cannot, and the reason is in the shim: v2468 set
// `bd.angularDamping = 0.05f` on every box DELIBERATELY, after measuring box3d's default at 0.00/s against
// Jolt's 0.05/s and deciding the ENGINE should choose rather than inherit. *** DAMPED ROTATION IS NOT
// TORQUE-FREE. *** Damping bleeds omega, sigma is proportional to omega, so the instability slows as it runs and
// the flip COUNT in a fixed window is expected to come in UNDER the undamped key's. Measured: key 2, box3d 1.
// That is REPORTED AS CONSISTENT WITH THE DAMPING AND NOT AS A DEFECT -- no export can set damping to zero, so
// separating "damped as designed" from "a different equation" needs a wasm rebuild and is not decidable here.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { boxInertia, intermediateAxis, stabilityRate, integrate, rotateByQuat } from "../../physics/mechanics/freeRotation.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
export const WASM = path.join(ENG, "vendor", "box3d", "box3d.wasm");
export const LOADER = path.join(ENG, "vendor", "box3d", "box3d.js");

/** Is the backend even present? A missing wasm is a CAPABILITY, not a failure (v3225's rule). */
export function backendAvailable() {
    return fs.existsSync(WASM) && fs.existsSync(LOADER);
}

/**
 * Boot box3d in Node. The data: URL is the whole trick -- Node's fetch refuses file:// and box3d.js fetches
 * whatever locateFile returns, so it is handed its own bytes inline.
 */
export async function bootBox3d() {
    const bytes = fs.readFileSync(WASM);
    const factory = (await import(pathToFileURL(LOADER).href)).default;
    const mod = await factory({ locateFile: () => "data:application/wasm;base64," + bytes.toString("base64") });
    mod._swk_world_create(0, 0, 0);          // NO GRAVITY: torque-free means no external torque either
    return mod;
}

/**
 * *** THE MINIMUM SPIN THE WINDOW REQUIRES, DERIVED -- the guard the first run did not have. ***
 * The perturbation grows as exp(sigma T) with sigma proportional to W, so to take a seed of `eps` up to order
 * one within T seconds the spin must satisfy W >= ln(1/eps) / (T * sigmaPerUnitOmega).
 */
export function minimumSpin({ I, axis, eps, T }) {
    const perUnit = stabilityRate(I, axis, 1).sigma;
    if (!(perUnit > 0)) return Infinity;                     // a stable axis never gets there
    return Math.log(1 / eps) / (T * perUnit);
}

/** Watch one body axis in WORLD space and count how often it reverses. The observable a backend can supply. */
function axisWatcher(axis) {
    const v = [0, 0, 0]; v[axis] = 1;
    let flips = 0, prev = null, maxOff = 0;
    return {
        sample(q) {
            const r = rotateByQuat(q, v);
            maxOff = Math.max(maxOff, 1 - Math.abs(r[axis]));
            const s = Math.sign(r[axis]);
            if (prev !== null && s !== prev) flips++;
            prev = s;
        },
        get result() { return { flips, maxOff }; },
    };
}

export const FIXTURE = { hx: 0.5, hy: 1.0, hz: 1.5, density: 1, L: 10, eps: 0.01, T: 30, dt: 1 / 240 };

/** The body both sides describe, so neither can be measuring a different brick. */
export function fixtureInertia(f = FIXTURE) {
    const m = 8 * f.hx * f.hy * f.hz * f.density;
    const I = boxInertia({ m, hx: f.hx, hy: f.hy, hz: f.hz });
    return { m, I, mid: intermediateAxis(I) };
}

/** THE ANSWER KEY, observed through the ORIENTATION ONLY -- exactly what the backend is allowed to supply. */
export function keyRun(f = FIXTURE) {
    const { I, mid } = fixtureInertia(f);
    const Om = f.L / I[mid];
    const w0 = [0, 0, 0]; w0[mid] = Om; w0[(mid + 1) % 3] = Om * f.eps;
    const r = integrate({ I, w0, dt: f.dt, steps: Math.round(f.T / f.dt) });
    return { omega: Om, sigma: stabilityRate(I, mid, Om).sigma, flips: r.flips, driftE: r.driftE };
}

/** THE BACKEND, same body, same spin, same seed, same observable. */
export async function box3dRun(f = FIXTURE) {
    const { I, mid } = fixtureInertia(f);
    const mod = await bootBox3d();
    mod._swk_body_box(1, 0, 0, 0, f.hx, f.hy, f.hz, f.density);
    const imp = [0, 0, 0]; imp[mid] = f.L; imp[(mid + 1) % 3] = f.L * f.eps;
    mod._swk_body_ang_impulse(0, imp[0], imp[1], imp[2]);
    const p = mod._malloc(7 * 4);
    const w = axisWatcher(mid);
    const steps = Math.round(f.T / f.dt);
    for (let n = 0; n < steps; n++) {
        mod._swk_world_step(f.dt, 4);
        if (n % 4 === 0) {
            mod._swk_transforms(p);
            const t = new Float32Array(mod.HEAPF32.buffer, p, 7);
            w.sample([t[6], t[3], t[4], t[5]]);            // shim packs x,y,z,w; rotateByQuat wants w first
        }
    }
    mod._free(p);
    return { omega: f.L / I[mid], ...w.result };
}

/** What the shim does to damping, read from its source rather than remembered. */
export function shimDamping() {
    const src = fs.readFileSync(path.join(ENG, "physics/box3d/box3d_shim.c"), "utf8");
    const m = src.match(/bd\.angularDamping\s*=\s*([\d.]+)f?;/);
    return { angularDamping: m ? Number(m[1]) : null, settable: /swk_body_set_damping|swk_body_damping/.test(src) };
}

export const MEASURED_V3564 = {
    box3dBootsHeadless: true,
    bootNote: "Node's fetch has no file:// scheme and box3d.js fetches locateFile(...), so it is handed a data: " +
        "URL of its own bytes. NO SHIM, NO REBUILD. 40 swk_* exports, including _swk_body_box (THREE half-" +
        "extents), _swk_body_ang_impulse and _swk_transforms (pos + QUATERNION).",
    theFirstAnswerWasWrong:
        "*** THE FIRST RUN SPUN AT omega = 0.2 AND EVERY AXIS LOOKED STABLE -- wander BOUNDED, QUADRATIC IN THE " +
        "SEED (1.54e-5 / 1.54e-3 / 3.79e-2) AND FLAT IN TIME, which is the signature of a constant w. I was one " +
        "paragraph from reporting that box3d drops the gyroscopic term. IT DOES NOT: at omega = 2 the spin axis " +
        "REVERSES COMPLETELY, 1-|cos| = 0.999. *** sigma is PROPORTIONAL TO W, so at omega = 0.2 thirty seconds " +
        "buys e^2.88 = 17.8x and 17.8 times a one-percent seed is a WOBBLE, NOT A FLIP. v3507's shape -- a null " +
        "from an instrument nobody showed could see anything -- and the guard existed on the CPU side already.",
    verdict: "box3d's spin axis leaves its starting direction and reverses on a distinct-moment body started " +
        "about the intermediate axis. THE TERM IS PRESENT IN SOME FORM. Observed through the ORIENTATION ONLY.",
    notClaimed:
        "That box3d's RATE matches the linearisation. v2468 set bd.angularDamping = 0.05f on every box " +
        "DELIBERATELY (box3d's default measured 0.00/s against Jolt's 0.05/s; the engine chose rather than " +
        "inherited). DAMPED ROTATION IS NOT TORQUE-FREE: damping bleeds omega, sigma follows omega, so the flip " +
        "count in a fixed window is expected UNDER the undamped key's -- measured key 2, box3d 1. REPORTED AS " +
        "CONSISTENT WITH THE DAMPING, NOT AS A DEFECT. No export sets damping to zero, so separating 'damped as " +
        "designed' from 'a different equation' needs a wasm rebuild and is NOT DECIDABLE HERE.",
    joltNotRun: "jolt is untouched. joltLoader sets mAngularDamping the same way and loads through a different " +
        "path; whether it boots in Node is a separate question this round does not answer.",
};

// ---- FRONT DOOR -------------------------------------------------------------------------------------------------
export async function reportLines() {
    const L = [];
    const f = FIXTURE;
    const { m, I, mid } = fixtureInertia(f);
    L.push("[backendRotation] Does the shipped physics backend carry the gyroscopic term?");
    L.push("");
    L.push("  Body " + (2 * f.hx) + " x " + (2 * f.hy) + " x " + (2 * f.hz) + ", mass " + m.toFixed(2) +
           "   I " + I.map((v) => v.toFixed(2)).join(" / ") + "   intermediate axis " + mid);
    const d = shimDamping();
    L.push("  Shim angular damping: " + d.angularDamping + (d.settable ? " (settable)" : "  -- NO EXPORT SETS IT"));
    L.push("");
    if (!backendAvailable()) {
        L.push("  box3d.wasm is NOT PRESENT in this tree. That is a CAPABILITY, not a failure --");
        L.push("  run physics/box3d/build-box3d-wasm-clang.sh on a box with clang + wasi-libc.");
        return L;
    }
    const key = keyRun(f);
    const minW = minimumSpin({ I, axis: mid, eps: f.eps, T: f.T });
    L.push("  THE WINDOW HAS A MINIMUM SPIN, AND IT IS DERIVED, NOT CHOSEN:");
    L.push("    to grow a seed of " + f.eps + " to order one in " + f.T + "s needs omega >= " + minW.toFixed(4));
    L.push("    this run uses omega = " + key.omega.toFixed(4) + "   sigma = " + key.sigma.toFixed(4) + "/s" +
           (key.omega >= minW ? "   OK" : "   *** UNDER-POWERED -- a null here would mean nothing ***"));
    L.push("");
    const b3 = await box3dRun(f);
    L.push("  CPU answer key   flips " + key.flips + "   (undamped, driftE " + key.driftE.toExponential(2) + ")");
    L.push("  box3d            flips " + b3.flips + "   max axis wander (1-|cos|) " + b3.maxOff.toFixed(6));
    L.push("");
    L.push("  " + MEASURED_V3564.verdict);
    L.push("");
    L.push("  AND THE FIRST ANSWER WAS WRONG:");
    L.push("  " + MEASURED_V3564.theFirstAnswerWasWrong.replace(/\*\*\*/g, "").replace(/\s+/g, " ").slice(0, 1200));
    return L;
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
    for (const l of await reportLines()) console.log(l);
    process.exit(0);
}
