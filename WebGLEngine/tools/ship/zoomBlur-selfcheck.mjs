#!/usr/bin/env node
// WebGLEngine/tools/ship/zoomBlur-selfcheck.mjs -- v4478
//
// Run: node tools/ship/zoomBlur-selfcheck.mjs   (~25s, needs a native GPU)
// Gated by tools/ship/selfchecks.mjs (discovery gate -- found by name, not by a list).
//
// THE ROUND'S CLAIM IS NOT "THE TREE HAS A ZOOM BLUR NOW". It is that a zoom blur, unlike the thing this tree
// already had, CAN BE GRADED WITHOUT A REFERENCE IMAGE. render/bloomPass.js's GODRAYS_FS marches from a pixel
// toward a screen-space point and accumulates -- the same loop -- and every contract around that loop is
// inverted. Section 5 reads those differences out of bloomPass.js's own source rather than restating them.
//
// The properties are exact statements about floating point, not likenesses:
//
//   P1  a flat image comes back BIT-IDENTICAL                          -- section 2, and ON THE GPU in section 4
//   P2  strength 0 is the IDENTITY, bit-for-bit, for every image       -- section 2, and ON THE GPU in section 4
//   P3  the centre pixel is a FIXED POINT at any strength              -- section 2
//   P4  an image constant along rays is a fixed point TO 4 ULP         -- section 3, with its singularity named
//   P5  on a radial ramp the output is STRICTLY BELOW the input        -- section 2, which is what fixes the sign
//
// *** P1 IS THE DESIGN, NOT A FREEBIE, AND SECTION 1 PROVES IT BY BREAKING IT. *** The obvious kernel --
// `acc += sample` then `acc /= N` -- fails P1: summing 32 copies of 0.1 left to right gives 0.09999997 back.
// The shipped kernel reduces pairwise over a power-of-two count, where every partial sum is a doubling and a
// doubling is exact. reduceSequential is exported from the module so this gate can DEMONSTRATE the failure
// rather than assert that it would happen.
//
// ---- SABOTAGE LOG -- 23 edits, 23 red by name, and FIVE of them were 0 RED first ---------------------------
// Caught immediately: the reduction becomes a running total (4 red); the power-of-two refusal removed (1);
// the march goes AWAY from the centre (4); the mean divides by samples-1 (10); the GLSL pastes a fixed sum
// instead of generating one (1); the WGSL sums with a running total (4); the emitters stop refusing a bad
// count (1); gateIsAlsoTheWeight hardcoded false (2); the angular image offered to the GPU arm (1); the radial
// image made constant so P5 is vacuous (3); the ulp budget widened to swallow anything (1); god rays lose
// their decay in bloomPass (1); MAX_STRENGTH allows overshoot (1); the default strength is no longer off (1).
//
// *** THE FOUR THAT SURVIVED ARE ONE SPECIES, AND IT IS THE SPECIES THIS FILE IS ABOUT: AN ORACLE THAT IS
// MORE ACCURATE THAN THE SHADER STILL PASSES EVERY COMPARISON WITH IT. *** None of them changes an answer by
// more than an ulp, so nothing that compares against hardware inside a tolerance can see them at all.
//
//   1. `SAMPLES: 32 -> 48` CRASHED instead of reddening -- exit 1 with ZERO checks run, because reduceTree
//      refused at the first call and every line after it threw. Refusing is right; dying in place of a gate is
//      not. Section 0 now asks the question before anything depends on the answer, so a bad constant is one
//      named red. Same split v4471 had to make for gateBudget.slowestRun: deriving is total, refusing is the
//      gate's job.
//   2. Dropping `Math.fround(strength)` in sampleT went 0 RED. That fround was added by hand an hour earlier
//      after the oracle disagreed with the GPU at 11 of 32 sample positions -- the uniform arrives as f32, so
//      an oracle multiplying by the f64 0.7 grades a computation nothing runs. The fix was unguarded. What
//      catches it is IDEMPOTENCE, not a hardware comparison: feeding the kernel 0.7 and its f32 must give the
//      same answer, because the shader cannot tell them apart.
//   3. Dropping the inner rounding in samplePoint went 0 RED: it is ONE rounding instead of two, which is more
//      accurate and sits inside the ulp budget. Closed by rebuilding the whole kernel in this gate with every
//      operation rounded on its own and requiring bit equality -- the module owns the ORDER, this gate owns
//      the ROUNDING.
//   5. THE GATE POISONED THE SHIP SWEEP, and no sabotage found that -- two ship verdicts did. This box's GPU
//      cannot serve two processes at once: eight concurrent runs of this gate ALL failed, and
//      backendParity-selfcheck failed every time any GPU gate ran beside it. The sweep runs EIGHT-WAY
//      PARALLEL, and the first version of section 4 acquired a device NINETEEN times, so verdicts named six
//      and then five "new reds" -- backendParity, budgetEvidence, releaseLedger, runtimeGap, shaderPairs and
//      this gate -- none of which reproduced alone. The repair is one dispatch for all 18 cases, not a
//      budget exemption: every case still runs, and what shrinks is how often the device is taken.
//
//   4. Dropping it on the Y COMPONENT ALONE went 0 RED THREE TIMES, through three successively better
//      fixtures. MEASURED: over a 513x513 grid of dyadic uv coordinates fl(centre - uv) rounds 0 times out of
//      263,169 -- pixel centres are k/width and their differences are exact -- so no pixel grid can host the
//      test. Then a search for "the subtraction rounds" found pairs where the POSITION moved by less than half
//      an ulp of the image, so the output did not. Then adversarial-in-x-only tested x only. The search now
//      aims at the thing in question: inputs where the two rounding disciplines give different kernel outputs.

import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as Z from "../../render/zoomBlur.mjs";
import { runWgslComputeNative, headlessGpuSkipReason, exitCleanly } from "./headlessGpu.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
let fails = 0;
const ok = (name, cond, detail) => {
    console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : ""));
    if (!cond) fails++;
};
const say = (m) => console.log("  ----  " + m);
const sec = (t) => console.log("\n" + t);

const fr = Math.fround;
const C = [0.5, 0.5];
const N = 64;
const GRID = [];
for (let y = 0; y < N; y += 7) for (let x = 0; x < N; x += 7) GRID.push([fr(x / N), fr(y / N)]);
const offCentre = GRID.filter((p) => !(p[0] === C[0] && p[1] === C[1]));
const at = (key, p) => fr(Z.IMAGES[key].cpu(p[0], p[1]));

// ULP distance between two f32 values, used only where an exact answer is not claimed.
const UB = new DataView(new ArrayBuffer(4));
const bits = (v) => { UB.setFloat32(0, v); return UB.getUint32(0); };
const ulps = (a, b) => (a === b ? 0 : (Math.sign(a) !== Math.sign(b) ? Infinity : Math.abs(bits(a) - bits(b))));

// *** THE TOLERANCE IS FROZEN HERE, BEFORE ANY COMPARISON RUNS, AND IT IS DERIVED RATHER THAN FITTED. ***
// The kernel is a 5-level pairwise tree (log2 of 32) over samples whose positions cost two rounded operations
// each and whose image evaluation costs up to three. Each rounding can move the result by at most half an ulp
// of its own magnitude, so a bound of 8 ulp is the depth of the computation, not an observation of it.
// MEASURED, for the record and NOT as the bound: 3 ulp worst over 18 GPU runs of 4096 pixels. If a later box
// exceeds 8 this gate goes red and somebody re-derives; it does not get widened to whatever that box said.
const ULP_BUDGET = 8;
const ULP_MEASURED_AT_V4478 = 3;

// ---- 0. PREFLIGHT: A BAD CONSTANT IS A NAMED FAILURE, NOT A CRASH ------------------------------------------
// Setting SAMPLES to 48 made every line below throw and the gate exited 1 with ZERO checks run -- which reads
// as a crash, not as a red, and a crash tells nobody which property broke. reduceTree is right to refuse; what
// was missing is somebody asking the question before the refusal fires. Deriving is total, refusing is the
// gate's job -- the same split v4471 had to make for gateBudget.slowestRun.
sec("0. *** THE CONSTANTS, BEFORE ANYTHING DEPENDS ON THEM ***");
{
    const powerOfTwo = Z.isPowerOfTwo(Z.ZOOM.SAMPLES);
    ok("!! the sample count is a power of two, which every exactness claim below rests on",
        powerOfTwo,
        `SAMPLES = ${Z.ZOOM.SAMPLES}. Checked HERE so a bad constant is one named red rather than a stack trace ` +
        "in place of a gate -- an exit 1 with no checks run is a crash, and this suite grades crashes as such");
    ok("strength is clamped to a range where the last sample does not overshoot the centre",
        Z.ZOOM.MAX_STRENGTH === 1.0 && Z.ZOOM.DEFAULT_STRENGTH === 0,
        `MAX_STRENGTH ${Z.ZOOM.MAX_STRENGTH}, default ${Z.ZOOM.DEFAULT_STRENGTH}. Above 1 the march would pass ` +
        "THROUGH the centre and the filter would stop averaging the segment it claims to average");
    if (!powerOfTwo) {
        console.log("\nzoomBlur-selfcheck: " + fails + " FAILURES -- refusing to run the rest against a kernel " +
                    "whose exactness argument does not hold");
        exitCleanly(1);
    }
}

// ---- 1. P1 IS ENGINEERED: THE OBVIOUS KERNEL FAILS IT ------------------------------------------------------
sec("1. *** THE SUMMATION ORDER IS THE DESIGN, AND THE OBVIOUS ORDER IS WRONG ***");
{
    const p = [fr(21 / N), fr(35 / N)], S = 0.8;
    const want = at("flat", p);
    const tree = Z.zoomBlurCpu(Z.IMAGES.flat.cpu, p, C, S);
    const seq = Z.zoomBlurSequential(Z.IMAGES.flat.cpu, p, C, S);
    ok("!! *** P1: a flat image survives the pairwise kernel BIT-IDENTICALLY ***",
        tree === want,
        `${tree} against the image's own ${want}. Every one of the 32 samples is the same value, so the sum is ` +
        "a chain of doublings and each one is an exponent shift with no mantissa rounding");
    ok("!! ...and the SEQUENTIAL kernel does not -- the failure is demonstrated, not predicted",
        seq !== want && Math.abs(seq - want) > 0,
        `${seq} against ${want}, off by ${Math.abs(seq - want).toExponential(2)}. This is the kernel almost ` +
        "every zoom blur in the wild ships. It is not visibly wrong on screen, which is precisely why nothing " +
        "catches it without a property to check");
    let seqBad = 0, treeBad = 0;
    for (const q of GRID) for (const s of [0.25, 0.5, 0.8, 1.0]) {
        if (Z.zoomBlurSequential(Z.IMAGES.flat.cpu, q, C, s) !== want) seqBad++;
        if (Z.zoomBlurCpu(Z.IMAGES.flat.cpu, q, C, s) !== want) treeBad++;
    }
    ok("...across the whole grid, at four strengths: the tree is exact everywhere and the chain is not",
        treeBad === 0 && seqBad > GRID.length,
        `${treeBad} of ${GRID.length * 4} tree failures against ${seqBad} sequential ones. A single lucky point ` +
        "would prove nothing either way, which is why both are swept");
    // *** THIS ROW EXISTS BECAUSE THE FIX IT GUARDS WAS MADE BY HAND AND NOTHING CAUGHT ITS ABSENCE. ***
    // sampleT rounds `strength` to f32 before using it. Removing that fround was sabotaged and went 0 RED: the
    // GPU divergence it causes (549 differing pixels against 351) sits comfortably inside the ulp budget, so
    // no comparison against hardware could see it. The property that CAN see it is idempotence -- an oracle
    // must not be able to use precision the uniform cannot carry, so feeding it the f64 0.7 and the f32 0.7
    // must give the same answer. 0.7 is chosen because it is not representable in f32.
    const S64 = 0.7, S32 = fr(0.7);
    let widened = 0;
    for (let i = 0; i < Z.ZOOM.SAMPLES; i++) if (Z.sampleT(i, S64) !== Z.sampleT(i, S32)) widened++;
    let kernelWidened = 0;
    for (const k of Object.keys(Z.IMAGES)) for (const q of GRID) {
        if (Z.zoomBlurCpu(Z.IMAGES[k].cpu, q, C, S64) !== Z.zoomBlurCpu(Z.IMAGES[k].cpu, q, C, S32)) kernelWidened++;
    }
    ok("!! the oracle cannot see precision the uniform cannot carry -- f64 0.7 and f32 0.7 agree exactly",
        widened === 0 && kernelWidened === 0 && S64 !== S32,
        `0 of ${Z.ZOOM.SAMPLES} sample positions and 0 of ${Object.keys(Z.IMAGES).length * GRID.length} pixels ` +
        `move, while 0.7 and its f32 ${S32} are genuinely different numbers. An oracle that multiplied by the ` +
        "f64 would be grading a computation nothing runs -- it diverged from the GPU at 11 of 32 sample " +
        "positions and looked exactly like a hardware disagreement");
    // *** AND THE OTHER HALF OF THE SAME HAZARD: AN ORACLE CAN BE MORE ACCURATE THAN THE SHADER. ***
    // Dropping the INNER fround in samplePoint -- letting (centre - uv) * t stay in f64 until the final round
    // -- was sabotaged and went 0 RED. It is a single-rounding variant, it sits inside the ulp budget, and
    // every exact property above involves either t = 0 or identical samples, where rounding cannot show. So
    // the rounding discipline is pinned directly: the gate rebuilds the sample position with each f32
    // operation rounded separately, written here rather than imported, and requires bit equality. The spec is
    // "every operation the shader performs is one rounding"; this is that spec, applied independently.
    // *** AND IT HAS TO BE THE WHOLE KERNEL AT A NON-DYADIC CENTRE, WHICH TWO MORE SABOTAGES ESTABLISHED. ***
    // A first version checked only the sample POSITION, at centre (0.5, 0.5). Both survived: dropping the
    // rounding on (centre - uv) alone is invisible when every coordinate is dyadic, because 0.5 minus a
    // multiple of 1/64 is exact and there is nothing to round; and dropping it inside the SUM is not a
    // position at all. So the re-derivation covers the full kernel and runs at a centre whose coordinates are
    // not dyadic. The module still owns the ORDER -- reduceTree is called, not reimplemented -- and this gate
    // owns the ROUNDING, which is the half a wrong oracle gets wrong.
    const stepHere = (uv, ctr, t) => [
        fr(uv[0] + fr(fr(ctr[0] - uv[0]) * t)),
        fr(uv[1] + fr(fr(ctr[1] - uv[1]) * t)),
    ];
    const blurHere = (img, uv, ctr, st) => {
        const v = [];
        for (let i = 0; i < Z.ZOOM.SAMPLES; i++) {
            const p = stepHere(uv, ctr, Z.sampleT(i, st));
            v.push(fr(img(p[0], p[1])));
        }
        return fr(Z.reduceTree(v, (a, b) => fr(a + b)) / Z.ZOOM.SAMPLES);
    };
    // *** THE ADVERSARIAL PAIRS ARE FOUND BY SEARCH, BECAUSE A PIXEL GRID CANNOT EXPOSE THIS. ***
    // MEASURED: over a 513x513 grid of dyadic UV coordinates, fl(centre - uv) rounds 0 times out of 263,169 --
    // pixel centres are k/width, and the difference of two such values is exactly representable. So dropping
    // the rounding on the subtraction is semantics-preserving for every PIXEL pair, and a sabotage of it
    // survived two grids. It is NOT redundant in general: the centre is a uniform rather than a pixel, and on
    // non-dyadic coordinates the same subtraction rounds 31% of the time. The pairs below are searched for
    // rather than typed in, so this row keeps its teeth if the grid or the images change.
    // The WRONG discipline, built here so the search can aim at inputs that actually distinguish the two.
    // Two weaker predicates were tried first and both let a sabotage through: "fl(centre - uv) rounds" is
    // necessary and not sufficient (the position moves by less than half an ulp of the IMAGE, so the output
    // does not), and adversarial-in-x-only tests x only. What discriminates the disciplines is the kernel's
    // own output, so that is what the search looks for.
    const blurWrong = (img, uv, ctr, st) => {
        const v = [];
        for (let i = 0; i < Z.ZOOM.SAMPLES; i++) {
            const t = Z.sampleT(i, st);
            const p = [fr(uv[0] + fr((ctr[0] - uv[0]) * t)), fr(uv[1] + fr((ctr[1] - uv[1]) * t))];
            v.push(fr(img(p[0], p[1])));
        }
        return fr(Z.reduceTree(v, (a, b) => fr(a + b)) / Z.ZOOM.SAMPLES);
    };
    const adversarial = [];
    outer:
    for (let i = 1; i <= 120; i++) for (let j = 1; j <= 120; j++) {
        const c = fr(i / 401), u = fr(j / 397);
        const ctr = [c, c], uv = [u, u];
        for (const k of Object.keys(Z.IMAGES)) for (const st of [0.25, 0.7, 1.0]) {
            if (blurHere(Z.IMAGES[k].cpu, uv, ctr, st) !== blurWrong(Z.IMAGES[k].cpu, uv, ctr, st)) {
                adversarial.push([ctr, uv]);
                if (adversarial.length >= 8) break outer;
                break;
            }
        }
    }
    const CENTRES = [C, [fr(0.31), fr(0.62)]];        // dyadic, then deliberately not
    let roundDrift = 0, checked = 0;
    for (const ctr of CENTRES) for (const k of Object.keys(Z.IMAGES)) for (const q of GRID) {
        for (const st of [0.25, 0.7, 1.0]) {
            checked++;
            if (Z.zoomBlurCpu(Z.IMAGES[k].cpu, q, ctr, st) !== blurHere(Z.IMAGES[k].cpu, q, ctr, st)) roundDrift++;
        }
    }
    let advDrift = 0, advChecked = 0;
    for (const [ctr, uv] of adversarial) for (const k of Object.keys(Z.IMAGES)) for (const st of [0.25, 0.7, 1.0]) {
        advChecked++;
        if (Z.zoomBlurCpu(Z.IMAGES[k].cpu, uv, ctr, st) !== blurHere(Z.IMAGES[k].cpu, uv, ctr, st)) advDrift++;
    }
    ok("!! the search found inputs where the two rounding disciplines DISAGREE -- the row below is not vacuous",
        adversarial.length === 8 && advChecked > 50,
        `${adversarial.length} centre/uv pairs at which a kernel rounding the subtraction and one that does not ` +
        `give different answers, and ${advChecked} results compared there. Over a 513x513 grid of DYADIC uv ` +
        "coordinates the subtraction never rounds at all -- 0 of 263,169 -- so a pixel grid cannot host this " +
        "test and the pairs have to be hunted for. An empty search fails here rather than letting the next row " +
        "pass over a domain that cannot tell the two kernels apart");
    ok("!! every f32 operation is rounded SEPARATELY -- an oracle more accurate than the shader is a wrong oracle",
        roundDrift === 0 && advDrift === 0 && checked > 2000,
        `0 of ${checked} results differ from a kernel rebuilt in this gate with every multiply, add and ` +
        "subtract rounded on its own, over two centres and four images. Keeping an intermediate in f64 is one " +
        "rounding instead of two: MORE accurate, inside the ulp budget, and a computation no shader performs. " +
        "The non-dyadic centre is load-bearing -- at (0.5, 0.5) the subtraction is exact and the defect hides");
    ok("the reduction REFUSES a leaf count it cannot make exact, rather than falling back",
        (() => { try { Z.reduceTree([1, 2, 3], (a, b) => a + b); return false; } catch (e) { return /power-of-two/.test(e.message); } })() &&
        Z.isPowerOfTwo(Z.ZOOM.SAMPLES),
        `SAMPLES = ${Z.ZOOM.SAMPLES}. A tree over 48 leaves has an odd level and the exactness argument dies ` +
        "there; a silent fallback to a running total would fail P1 without ever saying why");
}

// ---- 2. THE EXACT PROPERTIES -------------------------------------------------------------------------------
sec("2. *** P2, P3, P5 -- EXACT, OVER THE GRID, WITH NO TOLERANCE ***");
{
    const keys = Object.keys(Z.IMAGES);
    let p2 = 0;
    for (const k of keys) for (const p of GRID) if (Z.zoomBlurCpu(Z.IMAGES[k].cpu, p, C, 0) !== at(k, p)) p2++;
    ok("!! *** P2: strength 0 is the IDENTITY, bit-for-bit, for every image ***",
        p2 === 0,
        `0 of ${keys.length * GRID.length} pixels move. THIS IS WHAT WOULD MAKE WIRING THE PASS IN SAFE: "off" ` +
        "means the scene comes back unchanged, not close to unchanged -- and it is a consequence of P1 rather " +
        "than a separate mechanism, because at strength 0 every sample lands on the pixel itself");

    let p3 = 0;
    for (const k of keys) for (const s of [0, 0.1, 0.5, 0.9, 1.0]) {
        if (Z.zoomBlurCpu(Z.IMAGES[k].cpu, C, C, s) !== at(k, C)) p3++;
    }
    ok("!! P3: the centre pixel is a fixed point at every strength",
        p3 === 0,
        `0 of ${keys.length * 5}. At uv = centre the direction vector is exactly zero, so every sample lands ` +
        "on the same texel however far it is told to travel");

    let p5 = 0, shrank = 0;
    for (const s of [0.25, 0.5, 0.9, 1.0]) for (const p of offCentre) {
        const g = Z.zoomBlurCpu(Z.IMAGES.radial.cpu, p, C, s);
        if (!(g < at("radial", p))) p5++; else shrank++;
    }
    ok("!! *** P5: on a radial ramp the output is STRICTLY below the input -- this fixes the SIGN ***",
        p5 === 0 && shrank > 0,
        `${shrank} of ${offCentre.length * 4} pixels strictly decrease, 0 exceptions. An implementation that ` +
        "marched AWAY from the centre would satisfy P1, P2 and P3 unchanged and fail only here: the direction " +
        "is not visible in any property about averages, so it needs an image whose value grows with radius");
}

// ---- 3. P4, AND THE SINGULARITY AT FULL STRENGTH -----------------------------------------------------------
sec("3. *** P4 -- AND IT IS NOT EXACT, WHICH IS THE INTERESTING PART ***");
{
    let worst = 0, worstAt = null;
    for (const s of [0.25, 0.5, 0.8, 0.9]) for (const p of offCentre) {
        const u = ulps(Z.zoomBlurCpu(Z.IMAGES.angular.cpu, p, C, s), at("angular", p));
        if (u > worst) { worst = u; worstAt = [p, s]; }
    }
    ok("!! P4: an image constant along rays from the centre is a fixed point, to " + ULP_BUDGET + " ulp",
        worst <= ULP_BUDGET,
        `worst ${worst} ulp at uv ${JSON.stringify(worstAt && worstAt[0])}, strength ${worstAt && worstAt[1]}. ` +
        "Exact in real arithmetic -- every sample sits on the same ray, so the angle never changes -- and NOT " +
        "exact in f32, because uv + (centre - uv) * t does not land precisely on the ray. Stated as a bound " +
        "rather than as an equality because that is what it is");

    // The strength = 1.0 case, which is a fact about the filter rather than about rounding.
    const tLast = Z.sampleT(Z.ZOOM.SAMPLES - 1, 1.0);
    const pLast = Z.samplePoint([fr(14 / N), fr(21 / N)], C, tLast);
    let full = 0, fullWorst = 0;
    for (const p of offCentre) {
        const u = ulps(Z.zoomBlurCpu(Z.IMAGES.angular.cpu, p, C, 1.0), at("angular", p));
        if (u > ULP_BUDGET) full++;
        if (u > fullWorst) fullWorst = u;
    }
    ok("!! *** AND AT STRENGTH 1.0 IT BREAKS COMPLETELY, FOR A REASON WORTH KNOWING ***",
        tLast === 1 && pLast[0] === C[0] && pLast[1] === C[1] && full === offCentre.length && fullWorst > 1000,
        `the last sample's t is exactly ${tLast}, so it lands exactly on the centre -- and a direction-valued ` +
        `image is SINGULAR there (atan2(0,0) = 0). ${full} of ${offCentre.length} pixels blow the budget, worst ` +
        `${fullWorst} ulp. This is not rounding and it is not a defect: MAX_STRENGTH = 1 means "the last sample ` +
        'IS the centre", and every image that is defined by direction rather than position has no value there. ' +
        "P4's own subject is the one image that exposes it");
    say("P4's image is CPU-only and section 4 does not run it: atan2 is not bit-identical across");
    say("implementations, so a GPU comparison on it would be measuring two libraries, not one kernel.");
    ok("...and the module says so in its own table rather than leaving it to this gate",
        Z.IMAGES.angular.transcendental === true && Z.IMAGES.angular.arm === -1 &&
        Object.values(Z.IMAGES).filter((i) => !i.transcendental).every((i) => i.arm >= 0),
        "the images the GPU arm can run carry an arm index and the one it cannot carries -1. A gate that just " +
        "skipped it quietly would leave the reason in nobody's hands");
}

// ---- 4. THE SAME KERNEL, ON A REAL GPU ---------------------------------------------------------------------
sec("4. *** THE SHIPPED KERNEL ON REAL HARDWARE, NOT A JS COPY OF IT ***");
{
    const skip = headlessGpuSkipReason();
    ok("a native GPU is present -- this section is not allowed to skip quietly",
        !skip,
        skip || "the WGSL below is generated from the same reduceTree() call the oracle uses, so what is " +
                "compared is one kernel on two machines rather than two kernels on one");
    if (!skip) {
        // *** ONE DISPATCH FOR ALL 18 CASES, AND THE REASON IS A DEFECT THIS GATE CAUSED. ***
        // The first version acquired a device per case, nineteen times. This box's GPU cannot serve two
        // processes at once -- eight concurrent runs of this gate ALL failed, and backendParity-selfcheck
        // failed whenever any GPU gate ran beside it -- and the ship sweep runs EIGHT-WAY PARALLEL. Two verdicts
        // named five and six false reds, none of them reproducible alone, and this gate was the reason. It now
        // takes the device once. The cases are read from the module's own gpuCases(), which is what the shader
        // was generated from, so a cell cannot be compared against the wrong parameters.
        const cases = Z.gpuCases();
        const PX = N * N;
        const r = await runWgslComputeNative({
            code: Z.wgslSource({ n: N }), outCount: cases.length * PX,
            uniforms: [C[0], C[1], 0, 0], workgroups: Math.ceil((cases.length * PX) / 64),
        });
        ok("the whole matrix dispatches in ONE device acquisition",
            r.ok && r.values.length === cases.length * PX,
            r.ok ? `${cases.length} cases x ${PX} pixels in one run, adapter ${r.adapter && r.adapter.architecture}`
                 : r.reason + " " + JSON.stringify(r.errors || []).slice(0, 200));
        if (r.ok) {
            let worstAll = 0, flatExact = true, zeroExact = true;
            const cell = (c) => r.values.subarray ? r.values.subarray(cases.indexOf(c) * PX, (cases.indexOf(c) + 1) * PX)
                                                  : r.values.slice(cases.indexOf(c) * PX, (cases.indexOf(c) + 1) * PX);
            cases.forEach((c, ci) => {
                let w = 0, diff = 0;
                for (let i = 0; i < PX; i++) {
                    const x = fr((i % N) / N), y = fr(Math.floor(i / N) / N);
                    const u = ulps(r.values[ci * PX + i], Z.zoomBlurCpu(Z.IMAGES[c.key].cpu, [x, y], C, c.strength));
                    if (u > 0) diff++;
                    if (u > w) w = u;
                }
                if (c.key === "flat" && w !== 0) flatExact = false;
                if (c.strength === 0 && w !== 0) zeroExact = false;
                if (w > worstAll) worstAll = w;
                say(`${c.key.padEnd(7)} s=${String(c.strength).padEnd(5)} worst ${w} ulp, ${diff} of ${PX} differing`);
            });
            void cell;
            ok("!! *** P1 HOLDS ON THE GPU BIT-FOR-BIT: the flat image is exact at every strength ***",
                flatExact,
                `0 ulp on all ${Z.GPU_STRENGTHS.length} strengths. The pairwise tree's exactness is a property ` +
                "of IEEE-754 rather than of an implementation, so a machine that disagreed here would be a " +
                "finding about the machine");
            ok("!! *** P2 HOLDS ON THE GPU: strength 0 is bit-identical for every image ***",
                zeroExact,
                `0 ulp for ${Z.GPU_ARMS.join(", ")} at strength 0 -- the identity survives the trip to hardware, ` +
                "which is the claim a wiring round would actually rest on");
            ok("images that VARY along the ray agree within the frozen budget",
                worstAll <= ULP_BUDGET,
                `worst ${worstAll} ulp against a budget of ${ULP_BUDGET} derived from the reduction depth. ` +
                `Recorded at v4478: ${ULP_MEASURED_AT_V4478} ulp. The budget was written down before this ran`);

            // *** THE FIRST DRAFT OF THIS ROW ASSERTED `true` AND QUOTED TWO NUMBERS FROM MY SCRATCH BUFFER. ***
            // A check that cannot fail is not a check. Both oracles are built here and compared to the SAME
            // dispatch above -- no extra device acquisition -- so the rejection is re-derived every run.
            const li = cases.findIndex((c) => c.key === "linear" && c.strength === 0.7);
            const blurWith = (uv, fma) => {
                const v = [];
                for (let i = 0; i < Z.ZOOM.SAMPLES; i++) {
                    const t = Z.sampleT(i, 0.7);
                    const dx = fr(C[0] - uv[0]), dy = fr(C[1] - uv[1]);
                    const p = fma ? [fr(dx * t + uv[0]), fr(dy * t + uv[1])]
                                  : [fr(uv[0] + fr(dx * t)), fr(uv[1] + fr(dy * t))];
                    v.push(fr(p[0] + p[1]));
                }
                return fr(Z.reduceTree(v, (a, b) => fr(a + b)) / Z.ZOOM.SAMPLES);
            };
            let sepBad = 0, fmaBad = 0;
            for (let i = 0; i < PX; i++) {
                const x = fr((i % N) / N), y = fr(Math.floor(i / N) / N);
                if (r.values[li * PX + i] !== blurWith([x, y], false)) sepBad++;
                if (r.values[li * PX + i] !== blurWith([x, y], true)) fmaBad++;
            }
            ok("!! and the disagreement is NOT fma contraction -- the obvious explanation, TESTED AND REJECTED HERE",
                fmaBad > sepBad && sepBad > 0,
                `modelling uv + (centre - uv) * t as a single-rounded fma makes agreement WORSE: ${fmaBad} ` +
                `mismatches against the shipped kernel's ${sepBad}, on the linear image at strength 0.7. Both ` +
                "oracles are built in this gate and compared to the same dispatch, so the rejection is " +
                "re-derived rather than quoted. THE CAUSE IS UNRESOLVED AND IS RECORDED AS UNRESOLVED: v3313 " +
                "guessed a mechanism and v3314 had to correct it");
        }
    }
}

// ---- 5. THE NEAR MISS, READ OUT OF bloomPass.js ------------------------------------------------------------
sec("5. *** THE SHADER THE TREE ALREADY HAD, AND WHY IT IS NOT THIS ONE ***");
{
    const g = Z.godRaysContract();
    const z = Z.zoomBlurContract();
    ok("GODRAYS_FS is still in bloomPass.js and still has the shape this comparison rests on",
        g.found && g.marchesTowardAPoint && g.samples === 48,
        `${g.samples} samples, decay ${g.decay}. Read out of the file, so this table cannot become a ` +
        "description of a shader that has since changed");
    const differ = Object.keys(z).filter((k) => k !== "found" && g[k] !== z[k]);
    const same = Object.keys(z).filter((k) => k !== "found" && g[k] === z[k]);
    ok("!! the two agree on the LOOP and differ on every contract around it",
        same.includes("marchesTowardAPoint") && differ.length >= 6 &&
        ["luminanceGate", "gateIsAlsoTheWeight", "depthGate", "additiveAtComposite", "replacesScene"].every((k) => differ.includes(k)),
        `same: ${same.join(", ")} -- differ: ${differ.join(", ")}. That is the near miss: the part worth ` +
        "copying is the only part they share");
    ok("!! *** and the god-ray gate is ALSO its weight, which is why it can have no P1 ***",
        g.luminanceGate && g.gateIsAlsoTheWeight && g.decay < 1,
        `col += c * illum * (lum - uThreshold) with illum decaying at ${g.decay}. The weight of a sample is ` +
        "how far past the threshold it is, so the weights sum to a quantity that depends on the image. No " +
        "input reproduces its output, which is not a defect -- god rays are a light effect and were never " +
        "claiming to be an average. It is the reason a zoom blur is gradeable and this is not");
    ok("...and it ADDS to the scene where a zoom blur REPLACES it",
        g.additiveAtComposite && !g.replacesScene && z.replacesScene && !z.additiveAtComposite,
        "col += gr * uGodRayStrength in COMPOSITE_FS. An additive pass cannot be an identity at zero strength " +
        "in the same sense -- it is already zero, and the scene it did not touch is somebody else's output");
}

// ---- 6. THE GLSL, AND WHAT THIS ROUND DID NOT DO -----------------------------------------------------------
sec("6. *** ONE HOME FOR THE ORDER, AND THE LIMITS SAID PLAINLY ***");
{
    const shape = Z.sumTreeShape(8);
    const glsl = Z.glslSource();
    const wgsl = Z.wgslSource();
    ok("!! the GLSL and the WGSL carry the SAME parenthesisation, because both came from reduceTree()",
        glsl.includes(Z.sumTreeShape(Z.ZOOM.SAMPLES)) && wgsl.includes(Z.sumTreeShape(Z.ZOOM.SAMPLES)),
        `at 8 leaves the shape is ${shape}. The emitters call the same reduction the oracle calls, with string ` +
        "concatenation instead of addition, so the parenthesisation in the shader IS the evaluation order the " +
        "oracle took. There is no second declaration of the order to fall out of step");
    ok("...and changing the sample count moves both, so they are generated rather than pasted",
        Z.glslSource({ samples: 8 }).includes(shape) && Z.wgslSource({ samples: 8 }).includes(shape) &&
        !Z.glslSource({ samples: 8 }).includes(Z.sumTreeShape(32)),
        "a shader that merely happened to contain the right text today would pass the row above and fail this one");
    ok("both emitters REFUSE a non-power-of-two count rather than emitting a kernel that fails P1",
        [() => Z.glslSource({ samples: 12 }), () => Z.wgslSource({ samples: 12 })]
            .every((f) => { try { f(); return false; } catch (e) { return /power of two/.test(e.message); } }),
        "the refusal is in the emitter, not only in the reduction, because a shader is the one artefact that " +
        "leaves this repository");
    say("");
    say("WHAT THIS ROUND DID NOT DO:");
    say("  - The GLSL is NOT wired into bloomPass.js's post chain. It is generated, its order is graded, and");
    say("    no WebGL context has compiled it here -- this box has no headless GL, only WebGPU. P2 is exactly");
    say("    what a wiring round would rest on, and it is now measured on hardware rather than assumed.");
    say("  - No rendered image moves. Nothing imports zoomBlur.mjs except this gate.");
    say("  - The GPU disagreement above is bounded, not explained. fma was tested and rejected; the cause is open.");
    // *** THE CLAIM IS ABOUT IMPORTS, SO THE SEARCH HAS TO BE TOO. *** A first version grepped for the NAME and
    // went red on gateSweep.mjs's own ledger entry, which names the gate file because that is what a ledger
    // does. Naming is not importing, and a check that cannot tell them apart would push the next round to
    // either weaken it or stop recording the gate in the ledger -- both worse than reading the right thing.
    const importers = (() => {
        const r = spawnSync("grep", ["-rlE", "(from|import)\\s*\\(?\\s*[\"'][^\"']*zoomBlur",
                                     "--include=*.js", "--include=*.mjs", "--include=*.html",
                                     path.join(HERE, "../..")], { encoding: "utf8" });
        return (r.stdout || "").split("\n").filter(Boolean)
            .filter((f) => !/node_modules|\/vendor\//.test(f))
            .map((f) => path.relative(path.join(HERE, "../.."), f)).sort();
    })();
    ok("the claim that nothing else imports it is CHECKED, not asserted",
        importers.length === 1 && importers[0] === "tools/ship/zoomBlur-selfcheck.mjs",
        `importers: ${importers.join(", ") || "none"}. Exactly one file imports the module and it is this gate. ` +
        "A round that said 'not wired' while something quietly imported it would be the same shape as a claim " +
        "nobody re-derives");
}

console.log();
if (fails) { console.log("zoomBlur-selfcheck: " + fails + " FAILURES"); exitCleanly(1); }
console.log("zoomBlur-selfcheck: all checks pass");
exitCleanly(0);
