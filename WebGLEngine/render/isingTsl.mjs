// WebGLEngine/render/isingTsl.mjs -- v4402
//
// THE ISING CHECKERBOARD AS A TSL COMPUTE PASS: THE FIRST TRANSPLANT IN THIS ARC WITH NO FLOAT IN IT AT ALL.
//
// ---- WHY THIS IS A THIRD CLAIM SHAPE, NOT A THIRD KERNEL --------------------------------------------------------
//
// v4370 transplanted tools/roundhouse/hmcGpu.mjs's leapfrog and got BIT-IDENTICAL results because that kernel is
// SMOOTH f32 arithmetic: an ulp of disagreement stays an ulp, so the claim survives a rounding difference.
// v4400 transplanted the silhouette carve, which ends in a floor() -- DISCONTINUOUS, so an ulp can flip a voxel,
// and the twin had to become an f32 mirror with the discontinuity measured separately (66 flips in 17.3 million
// pairs, none of which propagated).
//
// *** tools/roundhouse/isingGpu.mjs IS NEITHER, BECAUSE IT HAS NO FLOATING POINT TO ARGUE ABOUT. *** Its own
// header states the contract: "INTEGER ARITHMETIC END TO END, so the CPU mirror and the device must agree
// BIT-EXACTLY on every spin, every sweep." Two design decisions buy that, and both survive the transplant or the
// round has failed:
//
//   THE RNG IS COUNTER-BASED. Philox4x32-10 -- out = philox(counter, key), no state and no sequence to coordinate
//   between threads, so any thread order on any device gives the same bits. It is u32 multiply, xor and add, and
//   its 32x32 -> (hi, lo) multiply is done in 16-bit limbs WITH an explicit carry chain, because u32 addition
//   wraps in WGSL and lh + hl can reach 2^33.
//
//   THE ONE TRANSCENDENTAL NEVER ENTERS THE KERNEL. The Metropolis factor exp(-dE/T) is evaluated ONCE, on the
//   CPU, in f64, and shipped as five u32 thresholds; the kernel accepts iff a philox word is below one of them.
//   So there is no vendor exp() in play and no float rounding anywhere on the accept path.
//
// Which means the claim here is not "bit-identical, which is a nice surprise" (v4370) or "exact against an f32
// mirror, with the discontinuity measured beside it" (v4400). IT IS THE KERNEL'S OWN CONTRACT: every spin, or
// the round is wrong. There is no tolerance to fall back to and adjudicateSpins() has tol: 0 written into it.
//
// ---- WHAT THIS COST THE SHELL, AND IT WAS REFUSED BY NAME FIRST --------------------------------------------------
//
// render/tslSource.mjs's uniform vocabulary was FLOAT-ONLY in its vectors: f32, vec2/3/4<f32>, mat4x4<f32>, plus
// i32 and u32 as scalars. This pass carries its seed and key in a vec4<u32> and the transplant refused it by name
// -- "uniform cfg has type vec4<u32>, which the device's uniform list does not carry". That is the guard doing
// its job; the vocabulary is what had to grow, and ivec2/3/4 and uvec2/3/4 are in it at v4402.
//
// Gated in tools/ship/tslIsing-selfcheck.mjs.
"use strict";

/** Philox4x32-10 as TSL nodes. The shipped kernel's mulhilo, limb for limb, carry for carry. */
export function philoxNodes(TSL) {
    const { uint, uvec4, select, Loop } = TSL;
    for (const k of ["uint", "uvec4", "select", "Loop"]) if (typeof TSL[k] !== "function") throw new Error(`isingTsl: the TSL namespace has no ${k}()`);
    /** 32x32 -> { hi, lo } in 16-bit limbs. THE CARRY CHAIN IS NOT OPTIONAL: u32 add wraps, and lh + hl reaches 2^33. */
    const mulhilo = (a, b) => {
        const aH = a.shiftRight(uint(16)), aL = a.bitAnd(uint(0xffff));
        const bH = b.shiftRight(uint(16)), bL = b.bitAnd(uint(0xffff));
        const ll = aL.mul(bL).toVar(), lh = aL.mul(bH).toVar(), hl = aH.mul(bL).toVar(), hh = aH.mul(bH).toVar();
        const mid1 = lh.add(hl).toVar();
        const c1 = select(mid1.lessThan(lh), uint(1), uint(0));          // carry out of lh + hl
        const mid = mid1.add(ll.shiftRight(uint(16))).toVar();
        const c2 = select(mid.lessThan(mid1), uint(1), uint(0));         // carry out of adding ll >> 16
        const lo = ll.bitAnd(uint(0xffff)).bitOr(mid.shiftLeft(uint(16)));
        const hi = hh.add(mid.shiftRight(uint(16))).add(c1.add(c2).shiftLeft(uint(16)));
        return { hi, lo };
    };
    /** ten rounds, returning the four words as vars the caller may read. */
    const philox = (c0, c1, c2, c3, k0in, k1in) => {
        const x0 = c0.toVar(), x1 = c1.toVar(), x2 = c2.toVar(), x3 = c3.toVar();
        const k0 = k0in.toVar(), k1 = k1in.toVar();
        Loop({ start: 0, end: 10 }, () => {
            const m0 = mulhilo(uint(0xD2511F53), x0), m1 = mulhilo(uint(0xCD9E8D57), x2);
            const y0 = m1.hi.bitXor(x1).bitXor(k0).toVar(), y1 = m1.lo.toVar();
            const y2 = m0.hi.bitXor(x3).bitXor(k1).toVar(), y3 = m0.lo.toVar();
            x0.assign(y0); x1.assign(y1); x2.assign(y2); x3.assign(y3);
            k0.addAssign(uint(0x9E3779B9)); k1.addAssign(uint(0xBB67AE85));
        });
        return { x0, x1, x2, x3 };
    };
    return { mulhilo, philox };
}

/**
 * makeIsingPassTsl(TSL, { L }) -> { node, spins, thresh, uniforms, ... }
 *
 * One invocation per site OF ONE PARITY, exactly as the shipped kernel dispatches it: the caller runs the pass
 * twice a sweep with the parity uniform flipped, and the two halves of a checkerboard never touch each other's
 * neighbours, which is what makes the update order irrelevant and the result thread-order independent.
 *
 * L is a baked constant (the Loop and the index arithmetic want it); sweep, parity and seed are uniforms,
 * because a run is thousands of dispatches of ONE built pass and rebuilding the graph per sweep would be
 * measuring three's compiler rather than the kernel.
 */
export function makeIsingPassTsl(TSL, { L = 64 } = {}) {
    const { Fn, If, uint, int, ivec4, uvec4, uniform, instanceIndex, instancedArray, select } = TSL;
    for (const k of ["Fn", "If", "uint", "int", "uvec4", "uniform", "instancedArray", "select"])
        if (typeof TSL[k] !== "function") throw new Error(`isingTsl: the TSL namespace has no ${k}()`);
    if (!(L > 0) || L % 2 !== 0) throw new Error("isingTsl: L must be a positive EVEN number of sites a side -- a checkerboard of odd width wraps onto its own parity");

    const spins = instancedArray(L * L, "int").label("spins");
    const thresh = instancedArray(5, "uint").label("thresh");        // (dE + 8) / 4 in {0..4}
    const uniforms = { cfg: uniform(uvec4(0, 0, 0, 0)).label("cfg") };   // sweep, parity, seed, philox key1
    const { philox } = philoxNodes(TSL);

    const node = Fn(() => {
        const half = uint((L * L) / 2);
        const t = instanceIndex;
        If(t.lessThan(half), () => {
            const sweep = uniforms.cfg.x, parity = uniforms.cfg.y, seed = uniforms.cfg.z, key1 = uniforms.cfg.w;
            const y = t.div(uint(L / 2)).toVar();
            const xi = t.mod(uint(L / 2));
            const x = uint(2).mul(xi).add(y.add(parity).bitAnd(uint(1))).toVar();
            const i = y.mul(uint(L)).add(x).toVar();
            // the four neighbours, wrapped -- the shipped kernel's own select() form rather than a modulo
            const up = select(y.equal(uint(0)), uint(L - 1), y.sub(uint(1))).mul(uint(L)).add(x);
            const dn = select(y.equal(uint(L - 1)), uint(0), y.add(uint(1))).mul(uint(L)).add(x);
            const lf = y.mul(uint(L)).add(select(x.equal(uint(0)), uint(L - 1), x.sub(uint(1))));
            const rt = y.mul(uint(L)).add(select(x.equal(uint(L - 1)), uint(0), x.add(uint(1))));
            const s = spins.element(i).toVar();
            const nb = spins.element(up).add(spins.element(dn)).add(spins.element(lf)).add(spins.element(rt));
            const dE = int(2).mul(s).mul(nb).toVar();                 // in {-8..8}
            const idx = uint(dE.add(int(8)).div(int(4)));
            const r = philox(i, sweep, parity, uint(0), seed, key1);
            If(r.x0.lessThan(thresh.element(idx)), () => { spins.element(i).assign(s.negate()); });
        });
    })().compute(L * L / 2);

    return { node, spins, thresh, uniforms, L, sites: L * L, half: (L * L) / 2 };
}
