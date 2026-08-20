// tools/roundhouse/magmapVariants.mjs
//
// v2948 -- KERNEL VARIANTS FOR ON-DEVICE A/B TIMING. The magmap kernel has never been tuned: workgroup_size(64)
// was chosen once, and the inner loop reads the trig tables from global storage 2304 times per thread. Neither
// choice was ever measured, because measuring them needs a GPU and the desktop that writes this code has none.
//
// So this round ships HYPOTHESES, not conclusions. The phone times the variants; the desktop adjudicates. Same
// split as every other claim in the lab -- and here it is not a discipline we are imposing, it is the only way
// the measurement can happen at all.
//
// WHY THESE TWO LEVERS AND NOT OTHERS. The optimisation rule from v2947 stands: a speedup that changes a bit is
// not a speedup, it is a new answer key. That rules out reordering the accumulation, fast-math, or any algebraic
// rewrite -- all of which would move the f32 result. What remains are changes that alter WHERE numbers come from
// and HOW THREADS ARE GROUPED, while every thread performs the identical arithmetic in the identical order:
//
//   workgroup_size   Each thread computes one cell and never communicates. Grouping them 32 or 256 at a time
//                    cannot change any thread's arithmetic. Bit-identical by construction. Hardware cares a lot:
//                    Mali and Adreno have different preferred wave widths, and 64 is a guess.
//
//   shared trig      The 48 cos + 48 sin values are read from global storage 2304 times per thread. Loading them
//                    once per workgroup into var<workgroup> memory reads THE SAME VALUES from faster storage.
//                    Bit-identical by construction; potentially a large win because it is the inner loop's only
//                    memory traffic.
//
// THE BARRIER TRAP, handled. The base kernel returns early for out-of-range k. A cooperative load needs
// workgroupBarrier(), and in WGSL a barrier in non-uniform control flow is undefined behaviour -- threads that
// already returned never arrive, and the workgroup can hang or produce garbage. So in the shared variants the
// load and barrier happen BEFORE any early return, and the bounds check becomes a guarded write at the end. This
// is the kind of bug that appears as "works on my phone, hangs on yours", so it is fixed by construction rather
// than tested for.

export const SHARED_CAP = 64;   // compile-time size of the workgroup trig arrays; shared variants need nT <= this

/**
 * The variants to time. `base` is the shipped kernel exactly as it is today -- it must be in the list, because a
 * benchmark without the incumbent measures nothing.
 */
export const VARIANTS = [
    { id: "base-wg64", workgroup: 64, sharedTrig: false, note: "the shipped kernel, unchanged -- the incumbent" },
    { id: "wg32", workgroup: 32, sharedTrig: false, note: "narrower groups; some mobile GPUs prefer 32" },
    { id: "wg128", workgroup: 128, sharedTrig: false, note: "wider groups" },
    { id: "wg256", workgroup: 256, sharedTrig: false, note: "widest commonly supported" },
    { id: "wg64-shared", workgroup: 64, sharedTrig: true, note: "incumbent width + trig tables in workgroup memory" },
    { id: "wg128-shared", workgroup: 128, sharedTrig: true, note: "wider + shared trig" },
    { id: "wg256-shared", workgroup: 256, sharedTrig: true, note: "widest + shared trig" },
];

/**
 * Rewrite the base WGSL into a variant. Purely textual and deliberately narrow: it changes the workgroup_size
 * attribute, and optionally swaps the two trig reads for workgroup-cached ones. It touches no arithmetic.
 */
export function variantWgsl(baseWgsl, variant) {
    const { workgroup, sharedTrig } = variant;
    let src = baseWgsl.replace(/@compute\s+@workgroup_size\(\s*\d+\s*\)/, `@compute @workgroup_size(${workgroup})`);
    if (!sharedTrig) return src;

    // 1. declare the workgroup arrays next to the entry point
    src = src.replace(/@compute @workgroup_size\(/,
        `var<workgroup> cosW : array<f32, ${SHARED_CAP}>;\nvar<workgroup> sinW : array<f32, ${SHARED_CAP}>;\n\n@compute @workgroup_size(`);

    // 2. take the local invocation id as well, so threads can cooperate on the load
    src = src.replace(/fn k_magmap\(@builtin\(global_invocation_id\) gid : vec3<u32>\)/,
        "fn k_magmap(@builtin(global_invocation_id) gid : vec3<u32>, @builtin(local_invocation_id) lid : vec3<u32>)");

    // 3. cooperative load + barrier BEFORE the early return (see the barrier trap above), and turn the early
    //    return into a flag so every thread in the group still reaches the barrier.
    src = src.replace(
        /let k = gid\.x;\s*\n\s*let total = P\.n \* P\.n;\s*\n\s*if \(k >= total\) \{ return; \}/,
        `let k = gid.x;
  let total = P.n * P.n;
  // cooperative load of the trig tables into workgroup memory -- every thread participates, then all wait.
  // This is ABOVE the bounds check on purpose: a barrier reached by only some threads is undefined behaviour.
  for (var t : u32 = lid.x; t < P.nT; t = t + ${workgroup}u) {
    cosW[t] = cosT[t];
    sinW[t] = sinT[t];
  }
  workgroupBarrier();
  let inRange = k < total;`);

    // 4. read the cached tables in the inner loop -- same values, faster storage
    src = src.replace(/cosT\[j\]/g, "cosW[j]").replace(/sinT\[j\]/g, "sinW[j]");

    // 5. guarded write instead of the early return
    src = src.replace(/out\[k\] = select\(0\.0, acc \/ wsum, wsum > 0\.0\);/,
        "if (inRange) { out[k] = select(0.0, acc / wsum, wsum > 0.0); }");

    return src;
}

/** Structural checks a variant must pass before it is worth sending to a GPU. */
export function validateVariant(src, variant) {
    const problems = [];
    if (!new RegExp(`@workgroup_size\\(${variant.workgroup}\\)`).test(src)) problems.push("workgroup_size not applied");
    if ((src.match(/\{/g) || []).length !== (src.match(/\}/g) || []).length) problems.push("unbalanced braces");
    for (const banned of ["fma(", "inverseSqrt(", "fastMath", "pow("]) if (src.includes(banned)) problems.push("banned op " + banned);
    if (variant.sharedTrig) {
        if (!/var<workgroup> cosW/.test(src)) problems.push("shared arrays not declared");
        if (!/workgroupBarrier\(\)/.test(src)) problems.push("no barrier");
        if (/if \(k >= total\) \{ return; \}/.test(src)) problems.push("early return survived -- barrier would be in non-uniform control flow");
        if (/cosT\[j\]/.test(src) || /sinT\[j\]/.test(src)) problems.push("inner loop still reads global trig");
        // The barrier must appear BEFORE the accumulation loop. NOTE (v2948): the first version of this check
        // searched for the literal "var  acc" (two spaces) while the source says "var acc  :" -- indexOf returned
        // -1 and the comparison was trivially true, so the check FAILED THREE CORRECT KERNELS. A structural check
        // that cannot find its own anchor must not silently become an always-fail; hence the explicit -1 guard.
        const bAt = src.indexOf("workgroupBarrier()"), aAt = src.search(/var\s+acc/);
        if (bAt < 0) problems.push("barrier not found at all");
        else if (aAt < 0) problems.push("accumulator declaration not found -- check anchor is stale");
        else if (bAt > aAt) problems.push("barrier after the accumulation begins");
    }
    return { ok: problems.length === 0, problems };
}
