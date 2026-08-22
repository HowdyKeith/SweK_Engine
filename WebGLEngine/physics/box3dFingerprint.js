// WebGLEngine/physics/box3dFingerprint.js — v2620
//
// A CANONICAL box3d SIMULATION WHOSE HASH ANSWERS "IS THE PHYSICS BIT-IDENTICAL ACROSS MACHINES?"
//
// ---- WHY THIS EXISTS -----------------------------------------------------------------------------------------------
//
// The whole lockstep / co-op stack (box3dLockstep, box3dSyncCompare) rests on two machines computing the SAME
// physics from the same inputs. If they diverge by one bit, the sim desyncs and the divergedAt pinpointing
// fires. That has only ever been tested x86-to-x86. THE REAL QUESTION IS x86 vs arm64 -- Galaxina vs the
// M-series Mac -- and that needs the Mac, which is not here yet.
//
// So this records what CAN be recorded now: a fixed, seeded box3d scenario and the sha256 of its entire
// transform stream on x86_64. When the Mac is available, running the same scenario and comparing to this one
// number ANSWERS THE QUESTION INSTANTLY -- match means the physics is bit-identical across architectures and
// lockstep works cross-platform; diverge means the co-op path needs a determinism shim.
//
// ---- WHY THERE IS A GOOD CHANCE IT MATCHES -------------------------------------------------------------------------
//
// box3d runs here as WASM, and WASM floating point is STRICTLY specified: IEEE-754, round-to-nearest-even, no
// implicit fused-multiply-add contraction. That is deliberate -- WASM was designed so a module gives the same
// bits on every conforming engine and CPU. The one documented escape hatch is NaN payloads, which WASM leaves
// nondeterministic. MEASURED: this scenario's 18,900 floats contain ZERO NaN or Inf, so that hole is shut. The
// structural case for cross-arch determinism is therefore strong -- but STRONG IS NOT PROVEN, and only the Mac
// proves it. This file is the instrument, not the verdict.
//
// ---- THE REFERENCE -------------------------------------------------------------------------------------------------
//
// Recorded on x86_64 (this sandbox), bit-identical across 3 separate processes:
export const REFERENCE_X86_64 = "5c353d1bc5373381dbfd06acdeb73c03c414783fa7edf52a7c6895ee2f2a940c";
export const CANONICAL_STEPS = 300;
export const CANONICAL_BODIES = 8;

/**
 * Build the canonical scenario in a loaded box3d module and run it, hashing every transform of every step.
 * The scenario is FIXED -- eight dynamic boxes at deterministic positions dropped onto a static floor under
 * gravity -- so the only thing that can change the hash is the physics itself. No RNG, no time, no input.
 *
 * @param m a loaded box3d module (the caller owns loading it -- in Node via the fetch-shim, in the browser natively)
 * @param crypto node:crypto (passed in so this file has no import that only resolves in Node)
 * @returns { hex, nonFinite } -- the fingerprint, and a count of any NaN/Inf seen (must be 0 for cross-arch safety)
 */
export function fingerprint(m, crypto) {
    m._swk_world_create(0, -9.8, 0);
    m._swk_body_box(0, 0, -2.2, 0, 50, 0.5, 50, 1);                    // static floor
    const ids = [];
    for (let i = 0; i < CANONICAL_BODIES; i++) {
        // deterministic offsets: a leaning stack that will topple and settle, so contacts and friction are exercised
        ids.push(m._swk_body_box(1, (i % 3) * 0.3 - 0.3, 1 + i * 0.5, (i % 2) * 0.2, 0.2, 0.2, 0.2, 1));
    }
    const ptr = m._malloc((ids.length + 1) * 7 * 4);
    const hash = crypto.createHash("sha256");
    let nonFinite = 0;
    for (let step = 0; step < CANONICAL_STEPS; step++) {
        m._swk_world_step(1 / 60, 4);
        m._swk_transforms(ptr);
        const xf = new Float32Array(m.HEAPF32.buffer, ptr, (ids.length + 1) * 7);
        for (const v of xf) if (!Number.isFinite(v)) nonFinite++;
        hash.update(Buffer.from(xf.buffer, xf.byteOffset, xf.byteLength));
    }
    return { hex: hash.digest("hex"), nonFinite };
}

/**
 * The verdict a machine reports about itself against the recorded reference.
 * MATCH   -> this machine's box3d is bit-identical to x86_64: lockstep is safe here.
 * DIVERGE -> arch-dependent physics: the co-op path needs a determinism shim before it can include this machine.
 */
export function verdict(hex) {
    if (hex === REFERENCE_X86_64) return "MATCH (bit-identical to x86_64 -- lockstep safe)";
    return "DIVERGE (arch-dependent physics -- co-op needs a determinism shim)";
}
