// tools/roundhouse/magmapGpu.mjs
//
// v2903 -- THE FIRST KERNEL. GPU proposes, CPU adjudicates.
//
// The magnification map is the slowest computation in the lab (441 cells x 4.2 ms) and every cell is an
// independent quadrature, so it is the obvious candidate. v2899 built the provenance guard and v2900 made the
// reference portable specifically so that this round would have something to be verified AGAINST. This is the
// round that spends that.
//
// THE ONE RULE THIS FILE EXISTS TO ENFORCE. The map's graded observable is mapPeak -- the brightest cell,
// compared against the closed form sqrt(1 + 4/rho^2). Emulating the kernel's f32 arithmetic cell by cell shows
// the worst f32 error over the whole grid lands ON THE CENTRE CELL, u0 = 0, which is the peak: 4.4e-6 relative,
// against a CPU reference whose own peak error is 1.35e-7. The single number the map is graded on is the single
// number the GPU computes worst. That is not a coincidence -- the caustic is where the magnification diverges and
// the quadrature works hardest -- and it settles the architecture:
//
//     the GPU may propose the MAP. The PEAK is recomputed on the CPU, always, and is what crystallises.
//
// v2894's rule verbatim: the image is a measurement when it has an answer key, and the answer key stays on the
// deterministic path. gradedPeak() below refuses a GPU-sourced value rather than trusting one.
//
// TOLERANCE. proposeAndVerify defaults to tol = 1e-6. A CORRECT f32 kernel measures 4.4e-6 worst, so the default
// would reject it, and the reflex when that happened would be to widen the tolerance until it passed -- which is
// how a gate stops meaning anything. The tolerance is therefore set HERE, once, from the emulated floor plus a
// stated margin, and the selfcheck fails if the measured floor ever moves above it. A tolerance is a claim about
// what the hardware can do; it is allowed to be loose, but it has to be earned before the first failure, not after.

import { markGpu, proposeAndVerify } from "./gpuProvenance.mjs";
import { sampleTable, cellMag, cellOffset, referenceCell, muPoint } from "./magmapKernel.mjs";
// v3965 -- the SHIPPED kernel is now DERIVED from the base below by the same function the bench uses. See
// SHIPPED_VARIANT. magmapVariants.mjs imports nothing, so this direction cannot make a cycle.
import { variantWgsl, SHARED_CAP } from "./magmapVariants.mjs";

/**
 * f32 FLOOR, HEADROOM OVER THE MEASURED WORST -- AND THE OLD NUMBER WAS MEASURED ONE ROUNDING SHORT OF THE KERNEL.
 *
 * IT USED TO READ: "MEASURED f32 FLOOR: 4.385e-6 worst relative error over a 9x9 grid at rho=0.1 with the 48x48
 * quadrature, against the f64 reference." That number is exactly what magmapKernel's cellMag() returns -- and
 * cellMag RETURNS A DOUBLE. *** THE SHIPPED KERNEL WRITES `out : array<f32>`, so the result is rounded to f32 ONE
 * MORE TIME on the store, and 4.385e-6 was measured without it. *** magmapEmulated(), which stores into a
 * Float32Array and therefore models the kernel's own output buffer, gives 4.4196e-6 at n = 9, 21 and 33 alike.
 *
 * A DEVICE SETTLES WHICH MODEL IS RIGHT, AND IT IS NOT THE RECORDED ONE: run headlessly at v4405, the shipped
 * wg128-shared kernel measures 4.420e-6 against the f64 reference -- the Float32Array emulator's number, not
 * cellMag's. The floor was below what a correct kernel actually produces.
 *
 * IT WENT UNNOTICED FOR TWO REASONS, AND THE SECOND IS THE ONE WORTH FIXING. magmap-selfcheck re-measured the
 * floor with cellMag too, so the check and the constant shared the same one-rounding-short model and agreed with
 * each other; and it asserted `worst <= F32_FLOOR * 2` while this file's header promised "the selfcheck fails if
 * the measured floor ever moves above it". A 2x slack with no stated reason will hide a 0.8% disagreement
 * forever. The check now measures through the STORE, and is strict; the slack lives in this constant, where it
 * is visible, which is the shape hmcGpu.mjs uses for F32_FLOOR_HMC.
 *
 * The fma sentence was wrong too -- it said the contracted variant differs by "at most 6.3e-8" and it is
 * 2.578e-7, four times that. *** THE CONCLUSION IT SUPPORTED IS RIGHT AND IS NOW MEASURED ON A DEVICE RATHER
 * THAN ARGUED FROM AN EMULATOR: *** contraction is not the dominant term. The device sits 7.634e-7 from the
 * uncontracted emulator and 7.634e-7 from the contracted one -- the SAME distance from both, so whatever
 * separates a device from the model, it is not fma. See tools/roundhouse/magmapDevice-selfcheck.mjs.
 */
export const MEASURED_F32_WORST = 4.4196e-6;   // through the f32 STORE, as the kernel does; re-measured every run
export const F32_FLOOR = 4.5e-6;               // headroom over it, stated here rather than hidden in a check
export const MAGMAP_TOL = 1e-5;

export const WGSL = /* wgsl */ `
// magmap.wgsl -- one thread per map cell, one uniform-disc quadrature per thread.
//
// SPECIFIED OPERATIONS ONLY: + - * / sqrt. No sin, no cos, no pow, no inverseSqrt -- the sampling table arrives
// precomputed from the CPU's strictTrig, because WGSL pins the rounding of none of the transcendentals.
// The accumulation is sequential within the thread, so there is no reduction order to be nondeterministic about.
struct Params {
  n      : u32,   // grid is n x n
  nR     : u32,   // radial quadrature points
  nT     : u32,   // angular quadrature points (= table length)
  _pad   : u32,
  span   : f32,   // grid half-width in Einstein radii
  rho    : f32,   // source radius
  _pad2  : vec2<f32>,
};

@group(0) @binding(0) var<uniform>             P    : Params;
@group(0) @binding(1) var<storage, read>       cosT : array<f32>;
@group(0) @binding(2) var<storage, read>       sinT : array<f32>;
@group(0) @binding(3) var<storage, read_write> out  : array<f32>;

// mu at one image position: |theta^3 / (beta * (theta^2 + 1))|, beta = theta - 1/theta.
// Analytic derivative. The CPU reference's central difference with h = |theta|*1e-6 is NOT portable to f32 --
// the step is below the epsilon it differences against and the result loses every digit. Measured at 7e-2.
fn magAt(t : f32) -> f32 {
  let t2   = t * t;
  let beta = t - 1.0 / t;
  return abs((t2 * t) / (beta * (t2 + 1.0)));
}

// Both images of a point source at offset u. theta^2 - u*theta - 1 = 0, solved exactly.
// The reference bisects 200 times per image; in f32 bisection stalls at representable spacing and the roots
// bracket differently per rounding, so the closed form is not an optimisation here, it is the correctness fix.
fn muPoint(u : f32) -> f32 {
  let d = sqrt(u * u + 4.0);
  return magAt((u + d) * 0.5) + magAt((u - d) * 0.5);
}

@compute @workgroup_size(64)
fn k_magmap(@builtin(global_invocation_id) gid : vec3<u32>) {
  let k = gid.x;
  let total = P.n * P.n;
  if (k >= total) { return; }

  let step = (2.0 * P.span) / f32(P.n - 1u);
  let ux0  = -P.span + f32(k % P.n) * step;
  let uy0  = -P.span + f32(k / P.n) * step;
  let u0   = sqrt(ux0 * ux0 + uy0 * uy0);

  var acc  : f32 = 0.0;
  var wsum : f32 = 0.0;
  for (var i : u32 = 0u; i < P.nR; i = i + 1u) {
    let rr = P.rho * (f32(i) + 0.5) / f32(P.nR);
    for (var j : u32 = 0u; j < P.nT; j = j + 1u) {
      let ux = u0 + rr * cosT[j];
      let uy = rr * sinT[j];
      let u  = sqrt(ux * ux + uy * uy);
      if (u >= 1e-12) {
        acc  = acc + muPoint(u) * rr;
        wsum = wsum + rr;
      }
    }
  }
  out[k] = select(0.0, acc / wsum, wsum > 0.0);
}
`;

/**
 * v3965 -- *** THE DEFAULT IS NOW wg128-shared, AND IT IS DERIVED RATHER THAN REWRITTEN. ***
 *
 * Keith's rig, Intel gen-9, medians of 7: base-wg64 10.7ms, wg128-shared 8.1ms -- 1.32x, the fastest of the
 * seven variants, all seven agreeing with the CPU f64 reference to the same 3.79e-6. So the incumbent is
 * replaced by the variant that beat it.
 *
 * *** WGSL ABOVE STAYS PRISTINE, AND THAT IS THE WHOLE DESIGN. *** The obvious way to do this is to edit the
 * source above -- change 64 to 128 and paste the workgroup-memory code in. That would have broken the bench
 * that MEASURED the win, silently and in the direction that looks fine: magmap-bench does
 * `variantWgsl(WGSL, v)` for every row, so a base that already carried shared trig would make the four
 * "non-shared" variants shared too (step 4's cosT->cosW replace has nothing left to do), and the three shared
 * ones would declare `var<workgroup> cosW` TWICE. Half the table would be mislabelled and the other half would
 * not compile. THE THING THAT PROVED THE CHANGE WOULD HAVE STOPPED BEING ABLE TO PROVE ANYTHING.
 *
 * So the base is left exactly as it was, and the shipped kernel is `variantWgsl(WGSL, SHIPPED_VARIANT)` -- one
 * transformation, one declaration, and "the shipped kernel is wg128-shared" is a fact the code computes rather
 * than a second hand-written copy that can drift from the variant it claims to be.
 */
// *** THE WIN IS ARCHITECTURE-DEPENDENT, AND A SECOND DEVICE SAID SO IN THE OPPOSITE DIRECTION. ***
// Intel gen-9 (Keith's rig, real silicon): 1.32x. SwiftShader (Google's software rasteriser, which is what the
// sandbox running the gates has): 0.45x -- MORE THAN TWICE AS SLOW. That is not a contradiction to resolve, it
// is the mechanism showing through: SwiftShader has no on-chip shared memory, so `var<workgroup>` is ordinary
// system RAM and the cooperative load plus barrier buy nothing while costing a synchronisation. Shared-trig is
// a win exactly where workgroup memory is real, and a loss where it is emulated.
//
// Recorded rather than dropped, because it is the fact that decides how much this default is worth: it is a
// measurement on ONE real GPU, and the bench exists to be re-run. Correctness is unaffected either way -- both
// devices grade at the same 4.4e-6 and the kernels are bit-identical.
export const SHIPPED_VARIANT = { id: "wg128-shared", workgroup: 128, sharedTrig: true,
                                 note: "the shipped default since v3965 -- 1.32x the old wg64 on Intel gen-9 " +
                                       "(but 0.45x on SwiftShader, which has no real workgroup memory)" };
export const SHIPPED_WGSL = variantWgsl(WGSL, SHIPPED_VARIANT);

/**
 * Run the kernel. Returns a GPU-TAGGED Float32Array, so anything downstream that reads it while a portability
 * measurement is armed trips the v2899 guard rather than being stamped portable for free.
 */
export async function magmapGpu(device, { n = 21, span = 1.0, rho = 0.1, nR = 48, nT = 48, wgsl = null } = {}) {
    // v2948: `wgsl` lets the A/B bench drive a VARIANT of the kernel (different workgroup size, or trig tables
    // cached in workgroup memory) without touching the default path -- null means the shipped kernel, exactly as
    // before. Variants are bit-identical by construction; the bench verifies that on the device before timing.
    // *** THE SHARED-TRIG KERNEL IS ONLY CORRECT UP TO SHARED_CAP, AND THAT IS A SILENT FAILURE IF UNGUARDED. ***
    // cosW/sinW are `array<f32, SHARED_CAP>` and the cooperative load writes cosW[t] for t < P.nT. At nT > 64
    // that is an OUT-OF-BOUNDS WORKGROUP WRITE: no error, no crash, just wrong numbers from a kernel that looks
    // like it ran. magmap-bench already knew this and SKIPS its shared rows above the cap -- but the bench is
    // not the only caller, and a default that is wrong outside a range nothing enforces is worse than a slower
    // default. Every GPU caller in this tree uses nT=48 today; magmapGpu's own signature accepts any nT, and
    // lensBind's finiteSourceMag runs 240 on the CPU, so "nobody passes more than 64" is a fact about today
    // rather than a property. Above the cap it falls back to the pristine base, and `kernel` in the returned
    // tag says which one ran, because a fallback nobody can see is a fallback nobody can debug.
    //
    // *** ONE DECISION, TWO OUTPUTS. *** The first cut chose SRC with one expression and built the provenance
    // label with a second one that re-tested the same conditions. They agreed -- and a probe that removed the
    // cap guard showed what the shape costs: the kernel changed and THE LABEL DID NOT, so the run reported
    // "base-wg64(nT>cap)" while executing the shared kernel. A tag that can disagree with the thing it names is
    // worse than no tag, because it is believed. Deciding once makes the disagreement unrepresentable.
    const pick = wgsl ? { src: wgsl, label: "custom" }
        : nT <= SHARED_CAP ? { src: SHIPPED_WGSL, label: SHIPPED_VARIANT.id }
            : { src: WGSL, label: "base-wg64(nT>cap)" };
    const SRC = pick.src;
    const table = sampleTable(nT);
    const total = n * n;

    const mod = device.createShaderModule({ code: SRC });
    const pipe = device.createComputePipeline({ layout: "auto", compute: { module: mod, entryPoint: "k_magmap" } });

    const uni = device.createBuffer({ size: 32, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    const ub = new ArrayBuffer(32), u32 = new Uint32Array(ub), f32v = new Float32Array(ub);
    u32[0] = n; u32[1] = nR; u32[2] = nT; f32v[4] = span; f32v[5] = rho;
    device.queue.writeBuffer(uni, 0, ub);

    const mk = (arr) => {
        const b = device.createBuffer({ size: arr.byteLength, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
        device.queue.writeBuffer(b, 0, arr); return b;
    };
    const bCos = mk(table.cos), bSin = mk(table.sin);
    const bOut = device.createBuffer({ size: total * 4, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC });
    const bStage = device.createBuffer({ size: total * 4, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });

    const bg = device.createBindGroup({
        layout: pipe.getBindGroupLayout(0),
        entries: [
            { binding: 0, resource: { buffer: uni } },
            { binding: 1, resource: { buffer: bCos } },
            { binding: 2, resource: { buffer: bSin } },
            { binding: 3, resource: { buffer: bOut } },
        ],
    });

    const enc = device.createCommandEncoder();
    const pass = enc.beginComputePass();
    pass.setPipeline(pipe); pass.setBindGroup(0, bg);
    // v3962 -- *** THE DIVISOR WAS THE LITERAL 64 WHILE THE VARIANT REWRITES @workgroup_size(N). ***
    //
    // magmapVariants exists to change exactly that number, so this line was wrong for every variant that is not
    // the incumbent -- and wrong in the one direction that produces a PLAUSIBLE result. wg32 dispatched
    // ceil(441/64) = 7 groups of 32 = 224 threads for 441 cells: 217 cells were never written, stayed 0, and the
    // kernel returned in a bit over half the time. On Keith's rig it read "wg32  6.40  1.14x  0.0e+0  ok" -- the
    // fastest correct variant on the page. IT WAS NOT FASTER, IT WAS DOING HALF THE WORK, and the only thing
    // standing between that and a tuning decision was the correctness check that (v3962, same round) had never
    // compared anything. Two independent bugs, and the second one hid the first exactly.
    //
    // wg128 and wg256 were unaffected and that is the trap, not the consolation: ceil(441/64) = 7 groups of 128
    // OVER-dispatches, and over-dispatch is harmless because the kernel bounds-checks. So the defect was
    // invisible in three of four variants and fatal in the fourth, which is how it read as a device quirk.
    //
    // THE COUNT IS NOW DERIVED FROM THE SHADER THAT IS ACTUALLY BEING RUN rather than from a constant that
    // happens to match one of them. Parsed from the WGSL because the WGSL is the authority -- a caller-supplied
    // width could disagree with the source and would reintroduce the same class of bug one level up.
    const wgSize = (() => {
        // SRC, not `wgsl`: `wgsl` is the optional OVERRIDE and is null on the default path, so parsing it
        // would have thrown for the shipped kernel and worked only for variants -- the same "reads the wrong
        // source of truth" mistake this block is fixing, made once more while fixing it.
        const m = /@workgroup_size\(\s*(\d+)/.exec(SRC);
        // No match means the shader is not the shape this function knows how to dispatch. THROWING IS THE POINT:
        // a default of 64 here is precisely the assumption that cost 217 cells, and a wrong dispatch does not
        // fail loudly -- it returns a partly-filled buffer that looks like an answer.
        if (!m) throw new Error("magmapGpu: no @workgroup_size(N) in the WGSL -- refusing to guess the dispatch");
        return parseInt(m[1], 10);
    })();
    pass.dispatchWorkgroups(Math.ceil(total / wgSize));
    pass.end();
    enc.copyBufferToBuffer(bOut, 0, bStage, 0, total * 4);
    device.queue.submit([enc.finish()]);

    await bStage.mapAsync(GPUMapMode.READ);
    const cells = new Float32Array(bStage.getMappedRange().slice(0));
    bStage.unmap();
    for (const b of [uni, bCos, bSin, bOut, bStage]) b.destroy?.();

    const adapter = device.__adapterLabel || "unknown";
    // v3965 -- the tag names WHICH kernel produced these numbers. Two kernels can now serve this call, and a
    // provenance record that said only "magmap.wgsl" would make the fallback invisible in exactly the logs
    // somebody would be reading to find out why a run differed.
    return markGpu(cells, { kernel: "magmap.wgsl/" + pick.label, adapter });
}

/**
 * HEADLESS PROPOSER. Reproduces the shader's f32 arithmetic on the CPU so the adjudication path can be exercised
 * on a machine with no GPU -- which is most of this fleet when the selfcheck runs.
 *
 * It is tagged with adapter "cpu-f32-emulator" and NOT with a card name, deliberately. An emulator that claimed
 * to be a GPU would make this whole file the thing the house rule warns about: a test that passes because the
 * experiment did not run. It models f32 rounding and nothing else -- not drivers, not miscompilation, not
 * fast-math, not a wrong workgroup index. Running magmapGpu() in a browser is the experiment; this is the harness
 * proving the harness works.
 */
export function magmapEmulated({ n = 21, span = 1.0, rho = 0.1, nR = 48, nT = 48, contractFma = false } = {}) {
    const table = sampleTable(nT);
    const cells = new Float32Array(n * n);
    for (let k = 0; k < n * n; k++) {
        cells[k] = cellMag(cellOffset(k, n, span).u0, rho, table, { precision: "f32", contractFma, nR });
    }
    return markGpu(cells, { kernel: "magmap.wgsl", adapter: "cpu-f32-emulator" });
}

/**
 * THE SEAM. Take a proposal from wherever, adjudicate a sample of it against the CPU, and return the map plus the
 * disagreement rate -- which is itself an observable about the hardware, not merely a pass/fail.
 */
export function adjudicate(proposal, { n = 21, span = 1.0, rho = 0.1, nR = 48, nT = 48, sample = 32, tol = MAGMAP_TOL } = {}) {
    const table = sampleTable(nT);
    return proposeAndVerify({
        proposal,
        recompute: (k) => referenceCell(k, { n, span, rho, table, nR }),
        sample, tol,
    });
}

/**
 * THE GRADED NUMBER, AND IT NEVER COMES FROM THE GPU.
 *
 * The peak cell is compared against sqrt(1 + 4/rho^2). The GPU's own worst cell is the peak, so accepting a
 * GPU-sourced peak would degrade the map's graded error from 1.35e-7 to ~4e-6 while looking like a speedup.
 * The kernel's role is the other 440 cells -- the picture -- and the picture is not the measurement.
 */
export function gradedPeak({ n = 21, span = 1.0, rho = 0.1, nR = 48, nT = 48 } = {}) {
    const table = sampleTable(nT);
    // The caustic of a point lens is a point, and the grid is centred, so the peak cell is known by construction.
    // It is still RECOMPUTED rather than read from any proposal -- that is the whole point of this function.
    const centre = (n % 2 === 1) ? ((n * n - 1) / 2) : null;
    let peak = -Infinity, at = -1;
    const scan = centre === null ? [...Array(n * n).keys()] : [centre];
    for (const k of scan) {
        const v = referenceCell(k, { n, span, rho, table, nR });
        if (v > peak) { peak = v; at = k; }
    }
    const exact = Math.sqrt(1 + 4 / (rho * rho));
    return {
        peak, exact, peakErrFrac: Math.abs(peak - exact) / exact,
        cell: at, source: "cpu-f64",
        note: centre === null ? "even grid: full scan" : "odd grid: caustic sits on the centre cell",
    };
}

/**
 * Full round trip: propose (GPU if a device is given, emulator otherwise), adjudicate, and grade on the CPU.
 * A rejected proposal is not a crash -- it falls back to the CPU map, exactly as terrainWasm demotes to JS.
 */
export async function magmapRun({ device = null, n = 21, span = 1.0, rho = 0.1, nR = 48, nT = 48 } = {}) {
    const cfg = { n, span, rho, nR, nT };
    const proposal = device ? await magmapGpu(device, cfg) : magmapEmulated(cfg);
    const verdict = adjudicate(proposal, cfg);
    return {
        ...cfg,
        proposedBy: device ? "gpu" : "cpu-f32-emulator",
        verdict,
        graded: gradedPeak(cfg),
        // the map is USED only if it was accepted; otherwise the caller draws the CPU map
        map: verdict.accepted ? proposal : null,
        fellBack: !verdict.accepted,
    };
}
