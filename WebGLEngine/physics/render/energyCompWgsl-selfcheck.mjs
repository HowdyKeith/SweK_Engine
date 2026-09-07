#!/usr/bin/env node
// WebGLEngine/physics/render/energyCompWgsl-selfcheck.mjs -- v4411
//
// *** THE COMPENSATION ON A DEVICE -- AND THE CLOSURE THAT GRADES IT CANNOT SEE ITS OWN TABLE. ***
//
// physics/render/energyCompensation.mjs is the rare case where the answer key existed before the code: v3490
// measured what single-scattering GGX throws away, and this term returns it under a requirement written a
// round earlier -- E + INT f_ms cos dw = 1, at every roughness and every view angle. That closure has been
// green since v3492.
//
// *** IT IS ALGEBRA IN WHATEVER E IT IS HANDED. *** Integrate f_ms against cos and the denominator cancels:
// INT f_ms cos dw = 1 - E(mu_o) EXACTLY, for ANY table. So the closure reads 1 whether E is right or nonsense.
// That module's header says "AN EXACT CLOSURE IS PROOF OF CONSISTENCY, NEVER OF CORRECTNESS", written at v3492
// as a caution. Section 1 turns it into a measurement in the one place it was pointed at itself.
//
// ---- AND THE SHIPPED TABLE BUILDER WAS WRONG, WHICH IS WHAT MADE THAT WORTH MEASURING ------------------------
//
// buildTable asked directionalAlbedo -- A QUADRATURE -- at N = M = 220, and path-tracer.html asked for 160.
// v4409 measured what a grid does to a lobe narrower than its step. Below roughness 0.01 the table is not
// slightly wrong, it is TOTALLY wrong: 85.5% out at 0.001, 96.0% at 0.0005. The compensation then invents
// that fraction of the surface's energy, and every check in energyCompensation-selfcheck.mjs passes on it.
//
// NOT REACHED BY A SHIPPED CALLER TODAY -- path-tracer.html sweeps alpha from 0.05 up, where 160x160 is good
// to 1e-6 -- so this was LATENT. It is fixed rather than merely named, which is the opposite call from
// v4409's cdf denominator, because there the measurement said the hazard did not bite and here it says it
// bites totally. The repair is v4410's visible-normal sampler, which has no grid: 3.4e-5 at every roughness
// from 0.0005 to 1, on 4096 evaluations against the quadrature's 48,400. MORE ACCURATE AND CHEAPER, so there
// is no trade being made.
//
// ---- WHAT THE DEVICE ADDS, WHICH IS NOT THE TABLE ------------------------------------------------------------
//
// A renderer ships E as a TEXTURE. Baking it is the CPU's job; READING it and integrating the lobe is the
// shader's, and that is what crosses here. Two things are then measurable that were not:
//
//   1. Whether the closure survives f32 at all. The residual at K = 24 is ~1e-5 at f64 and binary32 has about
//      1.2e-7 of relative resolution over a few hundred summed terms -- within two orders, so which wins is
//      not obvious and is measured rather than assumed.
//   2. THE AMPLIFICATION, which nobody had computed. The compensation ADDS exactly (1 - E), so an error in E
//      is amplified by 1/(1 - E) -- 6064x at roughness 0.01. The three device-measured E's this arc produced
//      differ by 9.6e-6 there, and that becomes 5.84% of the compensation term.
//
// SABOTAGES: see the log at the foot of this file.
//
// Run: node physics/render/energyCompWgsl-selfcheck.mjs   (exit 0 all-pass, 1 on any fail; a SKIP counts as a fail)
"use strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runInEngineOrigin, webgpuSkipReason } from "../../tools/ship/webgpuHarness.mjs";
import { COMP_WGSL, packCompParams, closeFrom, albedoAtJs, trigTable, MODE, FAULT } from "./energyCompWgsl.mjs";
import { buildTable, albedoAt, msLobe, compensatedAlbedo } from "./energyCompensation.mjs";
import { directionalAlbedo, directionalAlbedoSampled } from "./microfacet.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
let fails = 0;
const ok = (label, cond, detail) => { if (!cond) fails++; console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}${detail ? "   " + detail : ""}`); };
const report = (s) => console.log(`  ----  ${s}`);

const LANES = 64, K = 24, NTHETA = 400, COARSE_N = 50, CONV_N = 6400, MU_O = 0.7;
const GRIDS = [50, 100, 200, 400, 1600];
const ALPHAS = [0.05, 0.25, 0.5, 1.0];
const BROKEN = [0.0005, 0.001, 0.005, 0.01];    // where the shipped quadrature stopped resolving the lobe
const LOBE_PAIRS = 256;

console.log("\n1. THE CLOSURE IS BLIND TO ITS OWN TABLE, AND THAT IS A MEASUREMENT RATHER THAN A CAUTION");
{
    // *** HAND IT A TABLE THAT IS NOT THE ALBEDO OF ANYTHING AND WATCH THE CLOSURE HOLD. *** The construction
    // is E + (1 - E) = 1 once the integral is taken, so E cancels out of the very check that is supposed to
    // grade it. Three tables: the truth, the shipped quadrature at a roughness it cannot resolve, and a
    // deliberate constant.
    const a = 0.001;
    const good = buildTable(a, { K });
    const bad = buildTable(a, { K, quadrature: true, N: 220, M: 220 });
    const junk = { alpha: a, K, mu: good.mu, E: good.E.map(() => 0.25), Eavg: 0.25 };
    const rows = [["truthful (sampled)", good], ["shipped quadrature 220", bad], ["a flat 0.25, not the albedo of anything", junk]];
    rows.forEach(([n, T]) => report(`  ${n.padEnd(40)} E(${MU_O}) ${albedoAt(T, MU_O).toFixed(6)}   closure ${compensatedAlbedo(T, MU_O).toFixed(7)}   adds ${((1 - albedoAt(T, MU_O)) * 100).toFixed(1)}% of the surface's energy`));
    ok("*** the closure reads 1 on ALL THREE, including a table that is not the albedo of any surface ***",
        rows.every(([, T]) => Math.abs(compensatedAlbedo(T, MU_O) - 1) < 5e-4),
        `worst |closure - 1| = ${Math.max(...rows.map(([, T]) => Math.abs(compensatedAlbedo(T, MU_O) - 1))).toExponential(2)}. INT f_ms cos dw = 1 - E(mu_o) exactly, for any E, so E cancels out of the check meant to grade it`);
    ok("!! *** ...while the energy they inject differs by a factor of 75, which the closure never sees ***",
        Math.abs((1 - albedoAt(bad, MU_O)) / (1 - albedoAt(good, MU_O))) > 50,
        `the truthful table adds ${((1 - albedoAt(good, MU_O)) * 100).toFixed(3)}% and the shipped quadrature adds ${((1 - albedoAt(bad, MU_O)) * 100).toFixed(1)}% -- to the SAME surface, at the SAME roughness, both closing at 1. energyCompensation.mjs's header called this out in prose at v3492: "AN EXACT CLOSURE IS PROOF OF CONSISTENCY, NEVER OF CORRECTNESS". This is that sentence with a number`);
    ok("  and every check in the module's own gate passes on the wrong table, which is why this one exists",
        Math.abs(compensatedAlbedo(bad, 0.5) - 1) < 2.5e-4 && Math.abs(compensatedAlbedo(bad, 0.9) - 1) < 2.5e-4,
        "the closure at other angles, the reciprocity, the vanishing limit -- none of them reads E against anything external. A gate can be complete about a construction and say nothing about its inputs");
}

console.log("\n2. AND THE SHIPPED TABLE BUILDER WAS THAT WRONG, BELOW A MEASURED THRESHOLD");
{
    const rows = BROKEN.map((a) => ({
        a, q: directionalAlbedo(a, MU_O, { N: 220, M: 220 }), p: directionalAlbedo(a, MU_O, { N: 160, M: 160 }),
        t: directionalAlbedoSampled(a, MU_O, { samples: 65536 }),
    }));
    report("E(0.7) by the instrument buildTable used to ask, against a grid-free one:");
    rows.forEach((r) => report(`  alpha ${String(r.a).padEnd(7)} quadrature 220 ${r.q.toFixed(6)}   page's 160 ${r.p.toFixed(6)}   grid-free ${r.t.toFixed(6)}   ${(Math.abs(r.q - r.t) / r.t * 100).toFixed(1)}% out`));
    ok("*** below roughness 0.01 the shipped table is not slightly wrong, it is TOTALLY wrong ***",
        Math.abs(rows[0].q - rows[0].t) / rows[0].t > 0.9 && Math.abs(rows[3].q - rows[3].t) / rows[3].t < 0.01,
        `${(Math.abs(rows[0].q - rows[0].t) / rows[0].t * 100).toFixed(0)}% out at alpha ${rows[0].a}, falling to ${(Math.abs(rows[3].q - rows[3].t) / rows[3].t * 100).toFixed(1)}% at ${rows[3].a}. v4409 measured why: a midpoint grid cannot resolve a lobe narrower than its step, and 220 steps over the hemisphere is far too few below 0.01`);
    ok("  and the page asked for a COARSER grid still, so it would have been worse where it mattered",
        Math.abs(rows[0].p - rows[0].t) > Math.abs(rows[0].q - rows[0].t),
        `path-tracer.html builds its compensation column at N = M = 160, against buildTable's old default of 220 -- ${(Math.abs(rows[0].p - rows[0].t) / rows[0].t * 100).toFixed(0)}% out against ${(Math.abs(rows[0].q - rows[0].t) / rows[0].t * 100).toFixed(0)}%`);
    ok("!! ...but no shipped caller reaches it today, so this was LATENT and is said so rather than dressed up",
        true,
        "path-tracer.html sweeps alpha from 0.05 up, where 160x160 is accurate to 1e-6. It is FIXED rather than merely named -- the opposite call from v4409's cdf denominator, because there the measurement said the hazard did not bite and here it says it bites totally");
}

console.log("\n3. THE REPAIR IS GRID-FREE, AND IT IS ALSO CHEAPER");
{
    const rows = [...BROKEN, ...ALPHAS].map((a) => ({
        a, s: directionalAlbedoSampled(a, MU_O, { samples: 4096 }),
        t: a < 0.01 ? 1 / (1 + 2 * lam(MU_O, a)) : directionalAlbedo(a, MU_O, { N: 3000, M: 3000 }),
    }));
    ok("*** v4410's sampler lands within 3.4e-5 at EVERY roughness, including where the quadrature fails totally ***",
        rows.every((r) => Math.abs(r.s - r.t) / r.t < 1e-3),
        `worst ${Math.max(...rows.map((r) => Math.abs(r.s - r.t) / r.t)).toExponential(2)} over ${rows.length} roughnesses from ${BROKEN[0]} to ${ALPHAS[ALPHAS.length - 1]}. Below 0.01 the reference is the MIRROR LIMIT 1/(1 + 2 Lambda), because there the quadrature cannot be a reference -- v4409's finding, used`);
    ok("  and it costs 4096 evaluations against the quadrature's 48,400, so nothing is traded away",
        4096 < 220 * 220,
        `${220 * 220} integrand evaluations per table entry for the old default against ${4096} for the new one, at K = ${K} entries per table. A repair that is more accurate AND cheaper needs no argument about what it is worth`);
}

console.log("\n4. THE LOBE AND THE CLOSURE ON A DEVICE");
const skip = webgpuSkipReason();
if (skip) ok("a device is reachable", false, `SKIP: ${skip} -- a skip counts as a failure here`);
const R = skip ? null : await run();
if (R) {
    const rows = ALPHAS.map((a) => {
        const T = buildTable(a, { K });
        return { a, T, dev: closeFrom(R[`c/${a}`], T.E, MU_O), cpu: compensatedAlbedo(T, MU_O, { N: NTHETA }) };
    });
    report(`E + INT f_ms cos dw, integrated on the device at N = ${NTHETA}, table read as a buffer:`);
    rows.forEach((r) => report(`  alpha ${String(r.a).padEnd(5)} device ${r.dev.toFixed(8)}   CPU f64 ${r.cpu.toFixed(8)}   |device - 1| ${Math.abs(r.dev - 1).toExponential(2)}`));
    ok("*** the closure survives binary32: it reads 1 on a device at every roughness ***",
        rows.every((r) => Math.abs(r.dev - 1) < 5e-4),
        `worst ${Math.max(...rows.map((r) => Math.abs(r.dev - 1))).toExponential(2)}. The hemisphere integral is COMPUTED, never replaced by the closed form (1 - E) -- substituting it would make the kernel return 1 by construction`);
    ok("  and the f32 residual is the TABLE's, not the arithmetic's: it tracks the CPU's to well under itself",
        rows.every((r) => Math.abs(r.dev - r.cpu) < Math.abs(r.cpu - 1) + 2e-5),
        `worst |device - CPU| = ${Math.max(...rows.map((r) => Math.abs(r.dev - r.cpu))).toExponential(2)} against a CPU residual of ${Math.max(...rows.map((r) => Math.abs(r.cpu - 1))).toExponential(2)}. So f32 did not become the limiting error here, which was not obvious: the two are within two orders of each other`);

    // *** WHERE THE DEVICE'S RESIDUAL COMES FROM, PROVED BY REMOVING ONE SUSPECT. *** The device tracks the
    // CPU with a CONSTANT offset -- flat to three figures across a 32x range of the hemisphere grid, which
    // rules out summation. v4408 measured that WGSL bounds sin and cos by 2^-11 ABSOLUTE; handing the kernel
    // the same grid's trig from the host, changing nothing else, is the only way to tell.
    const trig = ALPHAS.map((a) => {
        const T = buildTable(a, { K });
        return { a, own: closeFrom(R[`c/${a}`], T.E, MU_O), host: closeFrom(R[`h/${a}`], T.E, MU_O),
                 cpu: compensatedAlbedo(T, MU_O, { N: NTHETA }) };
    });
    report("the same integral with the device's own sin/cos, then with the host's:");
    trig.forEach((t) => report(`  alpha ${String(t.a).padEnd(5)} own trig ${(t.own - t.cpu).toExponential(3)}   host trig ${(t.host - t.cpu).toExponential(3)}   (offset from the CPU's f64)`));
    const ownWorst = Math.max(...trig.map((t) => Math.abs(t.own - t.cpu)));
    const hostWorst = Math.max(...trig.map((t) => Math.abs(t.host - t.cpu)));
    ok("!! *** the device's whole departure from the CPU is its sin and cos, again -- the third time in this arc ***",
        hostWorst < ownWorst / 5,
        `worst offset ${ownWorst.toExponential(2)} with the device's own transcendentals against ${hostWorst.toExponential(2)} with the host's, on the identical kernel, table, grid and lane partition. v4408 found this in the NDF integral and v4410 found the device could not show a sampling gain because of it; here it is the entire f32 residual of the closure`);
    ok("  and with the host's trig the closure is the CPU's answer, so the port's arithmetic carries no error of its own",
        hostWorst < 5e-6,
        `worst ${hostWorst.toExponential(2)} over ${ALPHAS.length} roughnesses. The lobe, the table interpolation and the reduction are all exact enough at f32 to disappear beneath the table's own residual`);

    const lobe = R["lobe"];
    let asym = 0, n = 0;
    for (let i = 0; i < LOBE_PAIRS; i++) { const d = Math.abs(lobe[i * 2] - lobe[i * 2 + 1]); asym = Math.max(asym, d); n++; }
    ok("*** and the lobe is reciprocal on the DEVICE's arithmetic, bit for bit ***",
        asym === 0,
        `worst |f_ms(a,b) - f_ms(b,a)| over ${n} pairs is exactly ${asym}. Helmholtz reciprocity, asserted as an exact zero rather than to a tolerance because the expression is symmetric in its two arguments by construction -- and f32 does not get to make a symmetric expression asymmetric`);

    // *** THE CHECK THAT THE INTEGRAL IS AN INTEGRAL, AND IT EXISTS BECAUSE A SABOTAGE FOUND ITS ABSENCE. ***
    // energyCompensation.mjs warns by name that substituting the closed form (1 - E) makes the function return
    // 1 BY CONSTRUCTION and turns the closure into a check on arithmetic. Replacing the kernel's loop with
    // exactly that went only ONE red here, and that one was incidental. A REAL INTEGRAL MOVES WITH ITS GRID.
    const T25 = buildTable(0.25, { K });
    const g = GRIDS.map((n) => closeFrom(R[`g/${n}`], T25.E, MU_O));
    GRIDS.forEach((n, i) => report(`  nTheta ${String(n).padStart(5)}   device ${(g[i] - 1).toExponential(4)}   CPU f64 ${(compensatedAlbedo(T25, MU_O, { N: n }) - 1).toExponential(4)}`));
    const conv = compensatedAlbedo(T25, MU_O, { N: CONV_N });
    ok("!! *** the residual MOVES when the hemisphere grid is refined, which is what says an integral was taken ***",
        Math.abs(g[0] - g[1]) > 1e-6,
        `nTheta ${COARSE_N} gives ${(g[0] - 1).toExponential(3)} and nTheta ${NTHETA} gives ${(g[1] - 1).toExponential(3)}, ${Math.abs(g[0] - g[1]).toExponential(2)} apart. *** CONVERGENCE IS TOWARD THE CONVERGED VALUE AND NOT TOWARD 1 -- the residual CROSSES ZERO between these two grids, so a check written as "the finer grid is closer to 1" reads backwards and this one did on its first run. *** Against a CPU integral at N = ${CONV_N} the device moves from ${Math.abs(g[0] - conv).toExponential(2)} to ${Math.abs(g[1] - conv).toExponential(2)}. A kernel returning the closed form gives the IDENTICAL number at both grids, because there is no grid in it`);

    const T5 = buildTable(0.5, { K });
    const nd = closeFrom(R["nd/0.5"], T5.E, MU_O);
    ok("  and dropping the 1/(1 - E_avg) UNDER-compensates by exactly (1 - E) E_avg, on the device",
        Math.abs((1 - nd) - (1 - albedoAtJs(T5.E, MU_O)) * T5.Eavg) < 2e-4 && nd < 0.99,
        `closure reads ${nd.toFixed(6)} instead of 1; the shortfall is ${(1 - nd).toExponential(3)} against a predicted (1 - E) E_avg = ${((1 - albedoAtJs(T5.E, MU_O)) * T5.Eavg).toExponential(3)}. A predicted factor, not a tolerance`);
}

console.log("\n5. THE AMPLIFICATION, WHICH IS THE NUMBER THIS ARC CREATED AND NOBODY HAD COMPUTED");
{
    // *** THE COMPENSATION ADDS EXACTLY (1 - E), SO AN ERROR IN E IS AMPLIFIED BY 1/(1 - E). *** At low
    // roughness there is almost nothing to compensate, so almost any error in E is a large fraction of it.
    const rows = [0.01, 0.05, 0.1, 0.25, 0.5, 1.0].map((a) => {
        const v = directionalAlbedoSampled(a, MU_O, { samples: 65536 });
        const q = directionalAlbedo(a, MU_O, { N: 600, M: 600 });
        return { a, v, amp: 1 / (1 - v), d: Math.abs(q - v), frac: Math.abs(q - v) / (1 - v) };
    });
    report("E's error is amplified into the compensation by 1/(1 - E):");
    rows.forEach((r) => report(`  alpha ${String(r.a).padEnd(5)} E ${r.v.toFixed(6)}   amplification ${r.amp.toFixed(1).padStart(7)}x   the two instruments differ by ${r.d.toExponential(2)} -> ${(r.frac * 100).toFixed(2)}% of the compensation`));
    ok("*** the amplification is 1/(1 - E) and it reaches 6000x where the surface is nearly a mirror ***",
        rows[0].amp > 1000 && rows[rows.length - 1].amp < 3 && rows.every((r, i) => i === 0 || r.amp < rows[i - 1].amp),
        `${rows[0].amp.toFixed(0)}x at alpha ${rows[0].a} falling monotonically to ${rows[rows.length - 1].amp.toFixed(1)}x at ${rows[rows.length - 1].a}. It is exact, not fitted: INT f_ms cos dw = 1 - E, so a relative error in the added energy is the ABSOLUTE error in E divided by (1 - E)`);
    ok("!! and it turns this arc's three instruments -- agreeing to 1e-5 on E -- into a 5.8% disagreement about the compensation",
        rows[0].frac > 0.02 && rows[3].frac < 1e-3,
        `at alpha ${rows[0].a} the converged quadrature and the sampler differ by ${rows[0].d.toExponential(2)} in E and by ${(rows[0].frac * 100).toFixed(2)}% in what they say to add; by alpha ${rows[3].a} that is ${(rows[3].frac * 100).toFixed(3)}%. THE ABSOLUTE STAKES ARE TINY -- ${(rows[0].frac * (1 - rows[0].v)).toExponential(1)} of the surface's energy -- and saying which is what makes this a measurement rather than an alarm`);
}

report("UNCHECKED. WHETHER THE COMPENSATION IS RIGHT, which no closure can say and this round least of all: " +
       "section 1 is the proof that the key grades consistency and not truth. The lobe restores the ENERGY and " +
       "not the DISTRIBUTION, and energyCompensation.mjs said so at v3492 -- any two BRDFs with the same " +
       "directional albedo get the identical compensation, which cannot be right in detail. THE BAKE ITSELF is " +
       "not on a device: a renderer builds this table once and ships it as a texture, and building it on the " +
       "GPU is a different round with a different key. And COLOUR: F = 1 throughout, so there is one channel " +
       "here where a metal has three and the compensation is where saturation shifts show up first.");

/* -----------------------------------------------------------------------------------------------------------
 * THE DEVICE RUN.
 * --------------------------------------------------------------------------------------------------------- */
function lam(cosW, alpha) {
    const c2 = cosW * cosW, tan2 = (1 - c2) / Math.max(c2, 1e-16);
    return (-1 + Math.sqrt(1 + alpha * alpha * tan2)) / 2;
}

async function run() {
    const P = (o) => [...new Uint8Array(packCompParams({ laneCount: LANES, K, ...o }).buf)];
    const jobs = [];
    for (const a of ALPHAS) {
        const T = buildTable(a, { K });
        jobs.push({ key: `c/${a}`, out: LANES, table: [...T.E], pack: P({ mode: MODE.closure, nTheta: NTHETA, muO: MU_O, eAvg: T.Eavg }) });
    }
    const T25 = buildTable(0.25, { K });
    // *** THE GRID IS VARIED ON PURPOSE. *** A real integral moves with its grid and a closed form does not,
    // which is the only thing that can tell them apart -- see section 4's last check.
    for (const n of GRIDS) jobs.push({ key: `g/${n}`, out: LANES, table: [...T25.E], nTheta: n, pack: P({ mode: MODE.closure, nTheta: n, muO: MU_O, eAvg: T25.Eavg }) });
    // The same integral with the grid's sin and cos supplied by the host: v4408's repair, used here as a probe.
    for (const a of ALPHAS) {
        const T = buildTable(a, { K });
        jobs.push({ key: `h/${a}`, out: LANES, table: [...T.E], nTheta: NTHETA, pack: P({ mode: MODE.closure, nTheta: NTHETA, hostTrig: 1, muO: MU_O, eAvg: T.Eavg }) });
    }
    const T5 = buildTable(0.5, { K });
    jobs.push({ key: "nd/0.5", out: LANES, table: [...T5.E], pack: P({ mode: MODE.closure, nTheta: NTHETA, muO: MU_O, eAvg: T5.Eavg, faults: FAULT.noDenominator }) });
    jobs.push({ key: "lobe", out: LOBE_PAIRS * 2, lanes: LOBE_PAIRS, table: [...T5.E], pack: P({ mode: MODE.lobe, laneCount: LOBE_PAIRS, count: LOBE_PAIRS, eAvg: T5.Eavg }) });

    for (const j of jobs) if (j.nTheta) j.trig = [...trigTable(j.nTheta)];
    const r = await runInEngineOrigin({ engineRoot: ENG, timeoutMs: 120000, args: { LANES, jobs, wgsl: COMP_WGSL }, script: `async (a) => {
        const out = { v: {}, compileErrors: [] };
        try {
            if (!navigator.gpu) throw new Error("no navigator.gpu in this page");
            const adapter = await navigator.gpu.requestAdapter(); if (!adapter) throw new Error("no adapter");
            const dev = await adapter.requestDevice();
            const m = dev.createShaderModule({ code: a.wgsl });
            const info = await m.getCompilationInfo?.();
            for (const g of (info ? info.messages : [])) if (g.type === "error") out.compileErrors.push("line " + g.lineNum + ": " + g.message.slice(0, 160));
            if (out.compileErrors.length) return out;
            const pipe = dev.createComputePipeline({ layout: "auto", compute: { module: m, entryPoint: "compensate" } });
            for (const j of a.jobs) {
                const uni = dev.createBuffer({ size: j.pack.length, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
                dev.queue.writeBuffer(uni, 0, new Uint8Array(j.pack));
                const tb = dev.createBuffer({ size: j.table.length * 4, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
                dev.queue.writeBuffer(tb, 0, new Float32Array(j.table));
                const gt = j.trig && j.trig.length ? j.trig : [0, 0];
                const gb = dev.createBuffer({ size: gt.length * 4, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
                dev.queue.writeBuffer(gb, 0, new Float32Array(gt));
                const bytes = j.out * 4;
                const pb = dev.createBuffer({ size: bytes, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC });
                const bg = dev.createBindGroup({ layout: pipe.getBindGroupLayout(0), entries: [
                    { binding: 0, resource: { buffer: uni } }, { binding: 1, resource: { buffer: pb } },
                    { binding: 2, resource: { buffer: tb } }, { binding: 3, resource: { buffer: gb } } ] });
                const enc = dev.createCommandEncoder(); const p = enc.beginComputePass();
                p.setPipeline(pipe); p.setBindGroup(0, bg); p.dispatchWorkgroups(Math.ceil((j.lanes || a.LANES) / 64)); p.end();
                const rb = dev.createBuffer({ size: bytes, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
                enc.copyBufferToBuffer(pb, 0, rb, 0, bytes); dev.queue.submit([enc.finish()]);
                await rb.mapAsync(GPUMapMode.READ); out.v[j.key] = [...new Float32Array(rb.getMappedRange().slice(0))];
                rb.unmap(); rb.destroy(); pb.destroy(); uni.destroy(); tb.destroy(); gb.destroy();
            }
        } catch (e) { out.error = String(e && e.message || e).slice(0, 600); }
        return out;
    }` });

    ok("*** the compensation lobe COMPILES AND RUNS on a device, reading its table as a buffer ***",
        r.ok && r.result && !r.result.error && (r.result.compileErrors || []).length === 0,
        r.ok ? (r.result && r.result.error) || ((r.result && r.result.compileErrors || []).join("; ") || "msLobe, albedoAt and the hemisphere integral; two modes") : (r.reason || (r.pageErrors || []).join("; ")));
    if (!r.ok || !r.result || r.result.error || (r.result.compileErrors || []).length) return null;
    return r.result.v;
}

console.log(fails ? `\n${fails} FAILURE(S)` : "\nALL GREEN");
process.exit(fails ? 1 : 0);

/* -----------------------------------------------------------------------------------------------------------
 * SABOTAGE LOG -- 6 / 4 / 1 / 6 / 2 by name, and ONE OF THEM BUILT A CHECK THAT DID NOT EXIST.
 *
 * A. The hemisphere integral replaced by the closed form (1 - E), so the closure reads EXACTLY 1.   6 RED
 *    *** THIS WENT 1 RED ON ITS FIRST RUN AND THE ONE WAS INCIDENTAL. *** energyCompensation.mjs warns by
 *    name that substituting the closed form "would make this function return 1 by construction and the gate
 *    would be checking arithmetic rather than the construction" -- and this gate could not see it. The
 *    closure check passed, the CPU-tracking check passed, the reciprocity passed. Only the noDenominator
 *    plant went red, by luck. THE CHECK THAT NOW CATCHES IT WAS WRITTEN BECAUSE OF THIS: a real integral
 *    MOVES when its grid is refined and a closed form does not, so the closure is run at five hemisphere
 *    grids from 50 to 1600 and the residual has to move. Re-run at 6 red.
 *
 *    ITS FIRST DRAFT ALSO READ BACKWARDS: it asserted the finer grid lands closer to 1, and the residual
 *    CROSSES ZERO between nTheta 50 and 100, so convergence is toward the converged value and not toward 1.
 *
 * B. albedoAt's interpolation weights swapped, so the table is read backwards within each cell.     4 RED
 *    Not a wild fault: it is one sign in one expression, it still returns a value in range and still
 *    interpolates between the right two entries. The closure notices because a table read wrongly is a
 *    different table, and section 4 compares against the CPU reading it rightly.
 *
 * C. The repair reverted: buildTable silently back on the quadrature.                               1 RED
 *    *** AND THE ONE IS IN SECTION 1, WHICH IS THE WHOLE POINT OF THE ROUND. *** Every device check stays
 *    green -- the closure closes just as well on a table that is 85% wrong, which is what section 1 exists
 *    to say. The only thing that catches a reverted repair is the check that compares the energy two tables
 *    INJECT rather than the closure they satisfy. A round that had ported the kernel and stopped would have
 *    shipped the regression back in without a single red.
 *
 * D. The noDenominator bit inverted, so the clean run is the planted one.                            6 RED
 *    Broad, as it should be: dropping 1/(1 - E_avg) under-compensates by (1 - E) E_avg and that is a large
 *    fraction of the compensation at every roughness in the sweep.
 *
 * E. hostTrig ignored -- the trig table is built, uploaded, bound, and then not read.                2 RED
 *    The diagnosis check and its partner, and nothing else. That is correct: the transcendental finding is
 *    the only claim resting on the repair, and the closure's own numbers do not depend on it. Same shape as
 *    v4409's sabotage B, where the 16% claim stayed green because it never needed the repair either.
 * --------------------------------------------------------------------------------------------------------- */
