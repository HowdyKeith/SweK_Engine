// tools/roundhouse/gpuProvenance.mjs
//
// v2899 -- CLOSING A BLIND SPOT BEFORE THE FIRST KERNEL LANDS.
//
// The fleet is bit-identical across three machines, verified. That guarantee rests on measurePortability(), which
// arms a tripwire on Math.* and refuses any observable whose code path touches an unspecified transcendental --
// because a path that never calls the functions libms disagree about cannot disagree across machines.
//
// A GPU RESULT WALKS STRAIGHT PAST THAT GUARD. A value returned from a compute shader triggers no Math.* call, so
// the tripwire sees a clean run and stamps the observable portable. It is not: WGSL does not guarantee correctly
// rounded transcendentals, fma contraction is vendor-dependent, and parallel reduction order is not fixed. Two
// GPUs can legitimately disagree in the last ulps, and the fingerprint would report a divergence with no
// explanation -- or worse, would not report one, because the baseline was captured on whichever card ran first.
//
// The blind spot only bites once a GPU path exists, which is exactly when it is hardest to see. So this lands
// first, empty, and the guard is armed before there is anything to catch.
//
// HOW: a GPU result is not a bare number, it is a TAGGED value. Reading one goes through unwrapGpu(), and while
// a portability measurement is armed every such read is counted -- the same shape as the libm tripwire, for the
// same reason. A device that hands back bare floats from a shader is not "trusting the GPU", it is discarding the
// provenance that makes the trust question answerable.
//
// AND THE USEFUL HALF: none of this says do not use the GPU. It says do not let it ADJUDICATE. proposeAndVerify()
// is the roundhouse contract applied to hardware -- the GPU computes the whole map fast, the CPU recomputes a
// sampled subset on the deterministic path, and the disagreement rate becomes an observable in its own right.
// GPU proposes, CPU adjudicates: the same shape as v2890, where a trained policy proposes and the physics grades.

const GPU_TAG = Symbol("swek.gpu.provenance");

let _armed = false;
let _reads = 0;
const _kernels = new Map();

/** Tag a value (or array) as GPU-sourced. Kernels return these; nothing else should. */
export function markGpu(value, { kernel = "unnamed", adapter = "unknown" } = {}) {
    return { [GPU_TAG]: true, kernel, adapter, value };
}

export function isGpuSourced(x) {
    return !!(x && typeof x === "object" && x[GPU_TAG] === true);
}

/**
 * Read a GPU-tagged value. While a portability measurement is armed this is COUNTED, which is what makes a
 * GPU-sourced observable detectable at all. Passing a bare value through is allowed and does nothing -- the guard
 * is about provenance that exists, not about forcing every number through a wrapper.
 */
export function unwrapGpu(x) {
    if (!isGpuSourced(x)) return x;
    if (_armed) {
        _reads++;
        _kernels.set(x.kernel, (_kernels.get(x.kernel) || 0) + 1);
    }
    return x.value;
}

/** Arm/disarm the GPU tripwire. Used by measurePortabilityGpu; exported for tests. */
export function armGpuTripwire() { _armed = true; _reads = 0; _kernels.clear(); }
export function disarmGpuTripwire() {
    _armed = false;
    return { reads: _reads, kernels: [..._kernels.entries()].map(([k, n]) => n + "x " + k) };
}

/**
 * Portability with BOTH tripwires: unspecified libm calls AND GPU-sourced reads. An observable is portable only
 * when neither fires. Takes the libm measurement as an injected function so this module does not duplicate it.
 */
export async function measurePortabilityGpu(fn, measurePortabilityAsync) {
    armGpuTripwire();
    let res, err = null;
    try { res = await measurePortabilityAsync(fn); } catch (e) { err = e; }
    const gpu = disarmGpuTripwire();
    if (err) throw err;
    return {
        ...res,
        gpuReads: gpu.reads,
        gpuKernels: gpu.kernels,
        // The full claim: nothing unspecified, and nothing from a device whose float behaviour is not pinned.
        portable: res.rawCalls === 0 && gpu.reads === 0,
        reason: res.rawCalls > 0 ? "raw libm calls: " + res.sites.join("; ")
            : gpu.reads > 0 ? "GPU-sourced values read: " + gpu.kernels.join("; ") +
                " -- WGSL does not pin transcendental rounding, fma contraction or reduction order, so two cards may legitimately differ"
            : null,
    };
}

/**
 * THE CONTRACT: GPU proposes, CPU adjudicates.
 *
 *   proposal   the GPU's full result (tagged), as an array
 *   recompute  (index) -> number, the CPU's deterministic recomputation of one entry
 *   sample     how many entries to verify (spread evenly, plus the extremes, which is where GPU maths breaks first)
 *   tol        relative tolerance for agreement
 *
 * Returns the verified proposal plus the DISAGREEMENT RATE, which is an observable: a GPU whose map drifts from
 * the CPU is telling you something measurable about the kernel, and refusing silently would throw that away.
 */
export function proposeAndVerify({ proposal, recompute, sample = 32, tol = 1e-6 }) {
    const raw = isGpuSourced(proposal) ? unwrapGpu(proposal) : proposal;
    const n = raw.length;
    if (!n) throw new Error("proposeAndVerify: empty proposal");
    const idx = new Set([0, n - 1]);
    for (let i = 0; i < sample; i++) idx.add(Math.min(n - 1, Math.floor((i + 0.5) * n / sample)));
    const checked = [...idx].sort((a, b) => a - b);

    let worst = 0, worstAt = -1, disagreed = 0;
    for (const i of checked) {
        const cpu = recompute(i);
        const rel = Math.abs(raw[i] - cpu) / Math.max(Math.abs(cpu), 1e-300);
        if (rel > worst) { worst = rel; worstAt = i; }
        if (rel > tol) disagreed++;
    }
    return {
        accepted: disagreed === 0,
        checked: checked.length,
        disagreed,
        disagreementRate: disagreed / checked.length,
        worstRelDiff: worst,
        worstIndex: worstAt,
        tol,
        // A rejected proposal is not a crash: the caller falls back to the CPU path, exactly as terrainWasm
        // demotes to JS. What must never happen is a rejected proposal being crystallised anyway.
        verdict: disagreed === 0 ? "accepted" : "REJECTED -- fall back to the CPU path; the GPU map is fast, not authoritative",
    };
}
