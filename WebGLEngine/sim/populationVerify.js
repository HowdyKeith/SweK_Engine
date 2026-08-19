// WebGLEngine/sim/populationVerify.js -- v3122
//
// COMPARING THE DEVICE AGAINST THE REFERENCE.
//
// v3121 shipped the update rule written twice -- GLSL for the device, JS for the gate -- and closed by saying
// what was still unproven: THAT THE TWO PRODUCE THE SAME NUMBERS. The coefficients match character for
// character, which catches a typo and nothing else. Only a device can settle it.
//
// *** AND THE TOLERANCE IS THE WHOLE DESIGN. *** GLSL runs 32-bit floats; JS runs 64-bit doubles; sin and cos
// are implemented by different code on each side. THE POSITIONS WILL NOT MATCH EXACTLY AND SHOULD NOT BE
// EXPECTED TO. But LIVENESS IS A DISCRETE OUTCOME -- an agent is alive or it is not -- and applying a tolerance
// to a discrete decision would hide precisely the bug worth finding. So the comparison is asymmetric on
// purpose: POSITIONS WITHIN A STATED EPSILON, LIVENESS EXACTLY EQUAL, and a single disagreement on liveness
// fails the whole comparison however small the position error was.
//
// The boundary case is where those two meet: an agent sitting a hair outside the world on one side and a hair
// inside on the other will disagree on liveness for a position difference of 1e-7. THAT IS NOT A FALSE
// POSITIVE -- it is the honest report that the two implementations disagree about a real decision, and the fix
// is to move the fixture away from the boundary rather than to loosen the rule.

export const POS_EPSILON = 1e-3;      // generous: 32-bit sin/cos against 64-bit, over a world of 64 units

/**
 * @param gpu Float32Array read back from the device after ONE step
 * @param ref Float32Array from stepReference on the SAME input
 * @returns { agree, slots, worstPos, worstAt, livenessMismatches, examples }
 */
export function compareFields(gpu, ref, { epsilon = POS_EPSILON } = {}) {
    if (!gpu || !ref || gpu.length !== ref.length) {
        // A LENGTH MISMATCH IS NOT A DISAGREEMENT, it is a wiring error, and reporting it as "the shader is
        // wrong" would send somebody to the GLSL for a bug in the harness.
        throw new RangeError("field lengths differ: gpu " + (gpu ? gpu.length : "null") + " vs ref " + (ref ? ref.length : "null"));
    }
    const slots = gpu.length / 4;
    let worstPos = 0, worstAt = -1, livenessMismatches = 0;
    const examples = [];
    for (let i = 0; i < slots; i++) {
        const o = i * 4;
        for (let c = 0; c < 3; c++) {
            const d = Math.abs(gpu[o + c] - ref[o + c]);
            if (d > worstPos) { worstPos = d; worstAt = i; }
        }
        // EXACT. See the header -- a tolerance here would hide the only outcome that is not a matter of degree.
        const gLive = Math.round(gpu[o + 3]) % 2 === 1, rLive = Math.round(ref[o + 3]) % 2 === 1;
        if (gLive !== rLive) {
            livenessMismatches++;
            if (examples.length < 5) {
                examples.push({ slot: i, gpuAlpha: gpu[o + 3], refAlpha: ref[o + 3], gpuLive: gLive, refLive: rLive });
            }
        }
    }
    return {
        agree: livenessMismatches === 0 && worstPos <= epsilon,
        slots, worstPos, worstAt, livenessMismatches, examples, epsilon,
    };
}

/** One line a person reads, naming WHICH kind of disagreement it is. */
export function verdictLine(r) {
    if (r.livenessMismatches > 0) {
        return "DISAGREE on liveness in " + r.livenessMismatches + " of " + r.slots + " slots -- a discrete " +
               "decision differs, which no float tolerance can excuse (worst position drift " + r.worstPos.toExponential(2) + ")";
    }
    if (r.worstPos > r.epsilon) {
        return "DISAGREE on position: worst " + r.worstPos.toExponential(3) + " at slot " + r.worstAt +
               ", above the stated epsilon " + r.epsilon.toExponential(1) + " -- liveness agrees everywhere";
    }
    return "AGREE across " + r.slots.toLocaleString() + " slots: liveness exact, worst position drift " +
           r.worstPos.toExponential(2) + " within " + r.epsilon.toExponential(1);
}
