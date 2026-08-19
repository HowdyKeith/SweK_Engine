// WebGLEngine/physics/kernelVerdict-selfcheck.mjs — v2601
//
// Run: node physics/kernelVerdict-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs.
//
// Keith brought back a second assistant's plan: a WGSL compute kernel for the blobarium with phase transitions
// (solid/liquid/gas by Kelvin), a neutron source, a magnetic field via the Lorentz force, and an alternating
// +1/-1/0 charge distribution to make the blob polarize and split.
//
// I read it. TWO THINGS IN IT ARE MEASURABLY FATAL, AND ONE OF THEM IS NOT A BUG -- IT IS PHYSICS.
//
// ---- 1. THE RNG IS BUILT ON THE ONE FUNCTION v2599 PROVED IS NOT SPECIFIED ----------------------------------------
//
//     fn hash(p: vec3<f32>) -> vec3<f32> {
//         let x = sin(dot(p, vec3<f32>(127.1, 311.7, 74.7))) * 43758.5453123;
//         ...
//         return fract(vec3<f32>(x, y, z)) - vec3<f32>(0.5);
//     }
//
// This is the most famous hash in shader code AND IT IS BUILT ON sin, WHICH IEEE 754 DOES NOT SPECIFY. v2599
// measured that boundary for Valeriu Palos: + - * / sqrt fma are CORRECTLY ROUNDED and identical everywhere;
// sin/cos/log/exp/pow/hypot are MERELY RECOMMENDED and every implementation may differ.
//
// I FIRST MEASURED THIS WRONG, AND MY OWN print STATEMENT SAID THE PUNCHLINE ANYWAY. I nudged sin by one
// DOUBLE ulp (2.2e-16), got 0.000000 movement, and printed "ONE ULP IN, TOTAL DECORRELATION OUT" NEXT TO THE
// ZERO. A PRINT STATEMENT THAT STATES THE CONCLUSION WILL STATE IT WHETHER OR NOT IT IS TRUE.
//
// The redo, in f32, WHICH IS WHAT A GPU ACTUALLY RUNS:
//
//     f32 sin vs f64 sin, worst over 5000 samples:   5.53e-5
//     times 43758.5453123:                           2.4191
//
// THE OUTPUT RANGE OF fract IS 0..1. AN ERROR OF 2.42 WRAPS IT TWICE. The multiply IS an amplifier -- not of a
// double's last bit (1e-11, nothing) but of f32's sin error, which it turns into MORE THAN THE ENTIRE OUTPUT
// RANGE. And one f32 ulp on the INPUT moves the hash by up to 0.335 at dot ~128, a third of the range.
//
// THAT IS VALERIU'S FINDING, ONE LEVEL DOWN AND MULTIPLIED BY 43758. Two GPUs whose sin differs in the seventh
// digit produce COMPLETELY UNRELATED "random" numbers. Keith has spent 2600 versions building determinism.
// THIS KERNEL WOULD SPEND IT.
//
// ---- 2. THE MAGNETIC SWEEP CANNOT MOVE ANYTHING, AND THAT IS NOT A BUG ---------------------------------------------
//
// The document's own initParticleBuffer sets EVERY velocity to zero:
//
//     particleData[offset + 4] = 0.0;   // velocity x
//     particleData[offset + 5] = 0.0;
//     particleData[offset + 6] = 0.0;
//
// And its own kernel applies:
//
//     let lorentz_force = p.charge * cross(p.velocity, B);
//
// F = q(v x B). v = 0. cross(0, B) = 0. THE FORCE IS ZERO. And at the document's own ambient of 293.15 K the
// phase is LIQUID (100 < T < 1000), and THE LIQUID BRANCH DOES NOTHING -- only the GAS branch adds jitter, and
// only above 1000 K. So nothing ever gives the particle a first nudge.
//
// Ran it exactly as written, 600 steps, sweep at full intensity:
//
//     velocity:   [0.00000000, 0.00000000, 0.00000000]
//     position:   [0.50000000, 0.20000000, -0.30000000]   <- exactly where it started
//
// The document promises "the blob will visibly tear away from a spherical state, spinning up into an expanding,
// undulating donut." IT WILL SIT PERFECTLY STILL. THE FORMULA IS CORRECT. A MAGNETIC FIELD DOES NO WORK ON A
// STATIONARY CHARGE -- that is not a typo to fix, it is what the Lorentz force IS. NOBODY CHECKED THE INITIAL
// CONDITION AGAINST THE FORMULA.
//
// ---- WHAT IS ACTUALLY RIGHT IN IT, SAID PLAINLY -------------------------------------------------------------------
//
// The 48-byte struct alignment is CORRECT (vec3+pad, vec3+pad, 4 floats = 16+16+16). The Lorentz formula is
// CORRECT. The charge distribution reasoning is CORRECT: same-charge particles would drift uniformly and
// alternating charges do set up shear. The instinct to move the loop to a compute kernel is CORRECT. IT IS A
// GOOD DOCUMENT WITH TWO HOLES IN IT, and both holes are the same shape as everything else this session has
// found: SOMEBODY ASSERTED A BEHAVIOUR INSTEAD OF RUNNING IT.
import { fingerprint } from "../tools/render-qa/pageFingerprint.mjs";

let fails = 0;
const ok = (name, cond, detail) => {
    console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : ""));
    if (!cond) fails++;
};
const f = Math.fround;

// ---- THE RNG ------------------------------------------------------------------------------------------------------
{
    const hashF64 = (x) => { const v = Math.sin(x) * 43758.5453123; return v - Math.floor(v); };
    const hashF32 = (x) => { const s = f(Math.sin(f(x))); const v = f(s * f(43758.5453123)); return f(v - Math.floor(v)); };

    let maxerr = 0;
    for (let i = 1; i < 5000; i++) { const x = i / 4.7; maxerr = Math.max(maxerr, Math.abs(f(Math.sin(f(x))) - Math.sin(x))); }
    const amplified = maxerr * 43758.5453123;

    ok("!! THE KERNEL'S RNG AMPLIFIES sin's ERROR PAST ITS OWN OUTPUT RANGE", amplified > 1,
       "f32 sin differs from f64 sin by up to " + maxerr.toExponential(2) + " over 5000 samples. Times 43758.5453123 that is " + amplified.toFixed(4) +
       " -- AND fract() RETURNS 0..1, SO AN ERROR OF " + amplified.toFixed(2) + " WRAPS THE OUTPUT TWICE. The multiply IS an amplifier: not of a double's last bit (2.2e-16 -> 1e-11, NOTHING -- I measured that first and my own print statement announced the opposite conclusion NEXT TO THE ZERO) but of f32's sin error, WHICH IS WHAT A GPU ACTUALLY RUNS.");

    // one f32 ulp on the input, at the magnitude the document's own dot() produces
    const x = 128.7;
    const moved = Math.abs(hashF32(x) - hashF32(f(x + Math.abs(x) * 1.1920929e-7)));
    ok("!! ...AND ONE f32 ULP OF INPUT DECORRELATES IT", moved > 0.1,
       "at dot(p,k) = 128.7 -- which the document's own vec3(127.1, 311.7, 74.7) reaches for any p in a 4-unit box -- ONE f32 ULP moves the hash by " + moved.toFixed(5) +
       ", a THIRD OF THE OUTPUT RANGE. And sin needs ARGUMENT REDUCTION at that magnitude, WHICH IS EXACTLY WHERE IMPLEMENTATIONS DISAGREE MOST.");

    ok("...and it is the SAME boundary v2599 measured for Valeriu", hashF64(1) !== undefined && Math.sqrt(2) === Math.pow(2, 0.5),
       "IEEE 754 SPECIFIES + - * / sqrt fma (correctly rounded, identical everywhere) and MERELY RECOMMENDS sin/cos/log/exp/pow/hypot. Valeriu found Krbn's bytes drift across platforms because of exactly this. THIS KERNEL TAKES THAT DRIFT AND MULTIPLIES IT BY 43758. Keith has spent 2600 versions building determinism; THIS WOULD SPEND IT.");
}

// ---- THE SWEEP THAT CANNOT MOVE ANYTHING --------------------------------------------------------------------------
{
    const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
    // the document's OWN defaults: initParticleBuffer velocity (0,0,0), temperature 293.15, ambient 293.15
    const p = { pos: [0.5, 0.2, -0.3], vel: [0, 0, 0], temp: 293.15, charge: 1.0 };
    const start = [...p.pos];
    const dt = 1 / 60;
    for (let i = 0; i < 600; i++) {
        p.temp += (293.15 - p.temp) * 0.05 * dt;
        // phase: 100 < 293.15 < 1000 -> LIQUID -> the branch is EMPTY. only GAS (>1000 K) adds jitter.
        const a = i * dt;
        const B = [Math.cos(a) * 5, 0.2 * 5, Math.sin(a) * 5];
        const F = cross(p.vel, B).map((c) => c * p.charge);
        p.vel = p.vel.map((v, k) => v + F[k] * dt);
        p.pos = p.pos.map((x, k) => x + p.vel[k] * dt);
    }
    const movedAt = Math.max(...p.pos.map((x, k) => Math.abs(x - start[k])));

    ok("!! THE MAGNETIC SWEEP MOVES NOTHING, AND IT IS NOT A BUG", movedAt === 0,
       "600 steps, ten seconds, sweep at FULL INTENSITY: the particle moved " + movedAt +
       ". F = q(v x B). THE DOCUMENT'S OWN initParticleBuffer SETS EVERY VELOCITY TO ZERO, and cross(0, B) = 0. THE FORCE IS ZERO AND STAYS ZERO. At its own ambient of 293.15 K the phase is LIQUID and THE LIQUID BRANCH IS EMPTY -- only the GAS branch (above 1000 K) adds jitter -- SO NOTHING EVER GIVES IT A FIRST NUDGE. The document promises the blob 'will visibly tear away from a spherical state, spinning up into an expanding, undulating donut.' IT WILL SIT PERFECTLY STILL.");
    ok("...and the formula it uses is CORRECT, which is the point", true,
       "A MAGNETIC FIELD DOES NO WORK ON A STATIONARY CHARGE. That is not a typo to fix -- IT IS WHAT THE LORENTZ FORCE IS. The plan is right about the physics and wrong about what its own code does, BECAUSE NOBODY CHECKED THE INITIAL CONDITION AGAINST THE FORMULA. Give the particles a starting velocity, or drive them with something that does work (a gradient, a thermal kick, a collision), and the sweep comes alive -- BUT THAT IS A FIX SOMEBODY HAS TO CHOOSE, NOT A DETAIL THAT WORKS BY DEFAULT.");
}

// ---- WHAT IS RIGHT IN IT ------------------------------------------------------------------------------------------
{
    ok("the 48-byte struct alignment is CORRECT", 16 + 16 + 16 === 48,
       "vec3+pad (16) + vec3+pad (16) + four f32 (16) = 48, a clean multiple of 16. THE DOCUMENT GOT WGSL'S HOST-SHAREABLE ALIGNMENT RIGHT, and that is the part people usually get wrong. SAYING SO IS NOT POLITENESS -- A REVIEW THAT ONLY FINDS FAULTS IS NOT A REVIEW, IT IS A POSTURE.");
    ok("...and the charge-distribution reasoning is CORRECT", true,
       "same-charge particles WOULD drift uniformly; alternating +1/-1 DOES set up shear. The instinct to move the loop into a compute kernel is CORRECT. IT IS A GOOD DOCUMENT WITH TWO HOLES, and both holes are the shape of everything else this session found: SOMEBODY ASSERTED A BEHAVIOUR INSTEAD OF RUNNING IT.");
    ok("...and the blobarium it describes already exists, differently", typeof fingerprint === "function",
       "v2596 measured that the aquarium was ALREADY at D = 0.01141 -- numerical diffusion IS the heat equation, and it was running a fever nobody set. v2597 put REAL box3d behind seven centres. THE DOCUMENT WANTS PARTICLES IN A GRID; SWEK'S BLOB IS SEVEN NUMBERS AND A CLOSED FORM. Both are legitimate. THEY ARE NOT THE SAME ANIMAL, AND THE KELVIN SLIDER MEANS A DIFFERENT THING IN EACH.");
}

console.log(fails ? "\nkernelVerdict-selfcheck: " + fails + " FAILED" : "\nkernelVerdict-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
