// physics/mpm/gpuKernelInterp.mjs -- v3809
//
// Run: npm i wgsl_reflect   &&   node physics/mpm/gpuKernelInterp.mjs [steps]
//
// *** THIS IS DELIBERATELY NOT NAMED *-selfcheck.mjs AND THAT IS THE WHOLE DESIGN DECISION. ***
// tools/ship/selfchecks.mjs auto-discovers anything with that suffix, and this file needs a package that is
// not in the tree and cannot be installed on a machine with no network. A GATE THAT FAILS BECAUSE A
// DEPENDENCY IS MISSING IS A GATE THAT CRIES WOLF, and an ignored gate is decoration with extra steps. So the
// numbers this produces are RECORDED in gpuKernel-selfcheck.mjs, where they can be contradicted, and the tool
// that produced them ships here so anybody can re-take the measurement rather than trust the record.
//
// *** WHAT THIS IS. *** wgsl_reflect (Brendan Duncan, MIT) contains a WGSL INTERPRETER. It executes a compute
// dispatch on the CPU and writes the buffers a GPU would have written. That turns "this kernel has never been
// run" -- which was gpuKernel.mjs's honest status when it was written -- into a real comparison against the
// graded loop, particle by particle, WITHOUT A GPU.
//
// *** WHAT IT IS NOT. *** It is not hardware. It does not prove the shader compiles on a real driver, it does
// not schedule workgroups concurrently, so it CANNOT SEE A RACE, and it does not reproduce a vendor's f32
// rounding. mpm-gpu-check.html is still the thing that settles those, and it still needs Keith's machine.
//
// *** AND THE INTERPRETER ITSELF HAD TO BE CHECKED FIRST, WHICH IS THE PART WORTH REMEMBERING. ***
// The first run of this harness disagreed with the CPU loop: total mass 2.400000572 against an exact 2.5, one
// node holding 0.5625 where the truth was 0.1890. THAT WAS THE INTERPRETER, NOT THE KERNEL. At
// workgroup_size(64) it ran 24 of 64 invocations; at 32 it ran 12; at 16 it ran 24; at 8 and below it runs all
// of them, deterministically and correctly. MEASURED with a shader whose right answer was a counter.
// So the harness lowers the workgroup size textually before executing -- and that substitution is only
// legitimate because the kernel has NO workgroup memory, NO barrier and NO local_invocation_id, so how
// invocations are grouped cannot change a single result. gpuKernel-selfcheck asserts that property, because
// the day somebody adds a barrier this harness silently starts measuring a different program.
//
// *** A TOOL YOU HAVE NOT WATCHED BE WRONG IS A TOOL YOU ARE TRUSTING, NOT USING. *** The first thing below is
// therefore the interpreter's own competence check, on a problem whose answer is known without any of this.

import { makeGrid } from "./transfer.mjs";
import { lame } from "./constitutive.mjs";
import { alphaOf } from "./druckerPrager.mjs";
import { restBlock, centreOfMass, step } from "./step.mjs";
import { MPM_WGSL, packParams, fixedPointScales, clampLimits, PF } from "./gpuKernel.mjs";

let WgslExec, WgslParser;
try {
    ({ WgslExec, WgslParser } = await import("wgsl_reflect"));
} catch {
    try {
        ({ WgslExec, WgslParser } = await import("wgsl_reflect/wgsl_reflect.module.js"));
    } catch {
        console.log("wgsl_reflect is not installed. This tool needs it and the gates deliberately do not:");
        console.log("    npm i wgsl_reflect");
        console.log("The measurements it produced at v3809 are recorded in gpuKernel-selfcheck.mjs.");
        process.exit(0);
    }
}

const H = 0.5, DT = 1 / 240, GY = -9.81;
const PARAMS = lame(500, 0.3);
const CL = clampLimits();
const SCALES = fixedPointScales();
const WALL = { lo: 3, hi: 3, sticky: false };
const STEPS = Number(process.argv[2] || 15);

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };

// ---- 0. IS THE INTERPRETER FIT TO JUDGE ANYTHING? -------------------------------------------------------------
const WGS = 8;
{
    console.log("0. THE INTERPRETER'S OWN COMPETENCE, ON A PROBLEM WHOSE ANSWER NEEDS NONE OF THIS");
    const probe = (wgs, n) => {
        const src = `@group(0) @binding(0) var<storage, read_write> c: array<atomic<i32>>;
@compute @workgroup_size(${wgs})
fn t(@builtin(global_invocation_id) g: vec3<u32>) { if (g.x >= ${n}u) { return; } atomicAdd(&c[0], 1); }`;
        const c = new Int32Array(1);
        new WgslExec(new WgslParser().parse(src)).dispatchWorkgroups("t", [Math.ceil(n / wgs), 1, 1], { 0: { 0: c } });
        return c[0];
    };
    const at8 = probe(WGS, 64), at64 = probe(64, 64);
    ok("!! at workgroup_size " + WGS + " every invocation runs", at8 === 64, at8 + " of 64");
    ok("!! *** AND AT 64 IT DOES NOT, WHICH IS WHY THIS HARNESS LOWERS IT ***", at64 !== 64,
        at64 + " of 64 ran. THE FIRST VERSION OF THIS FILE BLAMED THE KERNEL FOR THIS: it reported a total mass " +
        "of 2.400000572 against an exact 2.5 and a node holding three times its share, and all of that was the " +
        "tool. A harness is an instrument and an unchecked instrument is a rumour");
}

const SRC = MPM_WGSL.replace(/@workgroup_size\(64\)/g, "@workgroup_size(" + WGS + ")");
const exec = new WgslExec(new WgslParser().parse(SRC));
const wg = (n) => Math.ceil(n / WGS);

/** Run the kernel exactly as the page will dispatch it, and hand back the particle buffer. */
function runKernel(sc, steps) {
    const ps = restBlock(sc.block), N = ps.length, nodes = (sc.nx + 1) * (sc.ny + 1);
    const parts = new Float32Array(N * 16);
    ps.forEach((p, i) => {
        const o = i * 16;
        parts[o + PF.px] = p.x; parts[o + PF.py] = p.y;
        parts[o + PF.f00] = 1; parts[o + PF.f11] = 1; parts[o + PF.p00] = 1; parts[o + PF.p11] = 1;
    });
    const acc = new Int32Array(nodes * 5), gv = new Float32Array(nodes * 4), flags = new Uint32Array(4);
    const uni = packParams({ nx: sc.nx, ny: sc.ny, nParticles: N, plasticMode: sc.mode, h: H, dt: DT, gx: 0, gy: GY,
        mu: PARAMS.mu, lambda: PARAMS.lambda, alpha: alphaOf(45), pmass: ps[0].m, pvol: ps[0].vol0,
        thetaC: CL.thetaC, thetaS: CL.thetaS, walls: sc.walls, scales: SCALES });
    const bind = { 0: { 0: uni, 1: parts, 2: acc, 3: gv, 4: flags } };
    for (let s = 0; s < steps; s++) {
        exec.dispatchWorkgroups("clear", [wg(nodes * 5), 1, 1], bind);
        exec.dispatchWorkgroups("p2g", [wg(N), 1, 1], bind);
        exec.dispatchWorkgroups("grid", [wg(nodes), 1, 1], bind);
        exec.dispatchWorkgroups("g2p", [wg(N), 1, 1], bind);
    }
    return { parts, flags, N, m: ps[0].m };
}
/** The centre of mass the way the PAGE computes it: read the particles back, sum in f64. */
function comOf(r) {
    let mx = 0, my = 0, mm = 0;
    for (let i = 0; i < r.N; i++) { const o = i * 16; mx += r.m * r.parts[o]; my += r.m * r.parts[o + 1]; mm += r.m; }
    return { x: mx / mm, y: my / mm };
}

const SCENES = {
    freefall: { nx: 16, ny: 16, block: {}, walls: null, plastic: true, mode: 1 },
    column: { nx: 16, ny: 16, block: { n: 5, spacing: 0.2, x0: 3, y0: 2.2, m: 0.1, vol0: 0.04 }, walls: WALL, plastic: true, mode: 1 },
    pile: { nx: 16, ny: 16, block: { n: 5, spacing: 0.2, x0: 3, y0: 2.2, m: 0.1, vol0: 0.04 }, walls: WALL, plastic: "dp", mode: 2 },
};

// ---- 1. THE KERNEL AGAINST THE GRADED LOOP, PARTICLE BY PARTICLE ----------------------------------------------
console.log("\n1. THE KERNEL AGAINST physics/mpm/step.mjs, PARTICLE BY PARTICLE, IN ALL THREE SCENES");
for (const [name, sc] of Object.entries(SCENES)) {
    const r = runKernel(sc, STEPS);
    const cpu = restBlock(sc.block), g = makeGrid(sc.nx, sc.ny, H);
    for (let s = 0; s < STEPS; s++) {
        step(cpu, g, { dt: DT, gy: GY, params: { ...PARAMS, alpha: alphaOf(45) }, plastic: sc.plastic, walls: sc.walls });
    }
    let wp = 0, ref = 0, nan = 0;
    for (let i = 0; i < r.N; i++) {
        const o = i * 16;
        if (!Number.isFinite(r.parts[o]) || !Number.isFinite(r.parts[o + 1])) nan++;
        wp = Math.max(wp, Math.abs(r.parts[o + PF.px] - cpu[i].x), Math.abs(r.parts[o + PF.py] - cpu[i].y));
        ref = Math.max(ref, Math.hypot(cpu[i].x, cpu[i].y));
    }
    const cc = centreOfMass(cpu), ck = comOf(r);
    ok("!! " + name.padEnd(9) + " agrees with the graded loop", nan === 0 && wp / ref < 1e-5 && r.flags[0] === 0,
        STEPS + " steps, " + r.N + " particles, worst position difference " + wp.toExponential(3) +
        " (relative " + (wp / ref).toExponential(2) + ")   centre of mass apart by " +
        Math.hypot(ck.x - cc.x, ck.y - cc.y).toExponential(3) + "   NaN " + nan + "   saturation " + r.flags[0]);
}

// ---- 2. THE FREE-FALL KEY, EARNED BY THE KERNEL ALONE ---------------------------------------------------------
console.log("\n2. THE KEY, EARNED BY THE KERNEL ITSELF RATHER THAN BORROWED FROM THE CPU");
{
    const n = Math.max(STEPS, 120);
    const r = runKernel(SCENES.freefall, n);
    const c0 = centreOfMass(restBlock());
    // THE DISCRETE FALL, NOT THE TEXTBOOK PARABOLA. Symplectic-Euler advects with the velocity AFTER the kick,
    // so the fall after n steps is g*dt^2*n(n+1)/2 -- one half-step from g*t^2/2. Grading against the
    // continuous form would show a growing error on a correct loop.
    const want = c0.y + GY * DT * DT * (n * (n + 1) / 2);
    const ck = comOf(r);
    const err = Math.abs(ck.y - want), drift = Math.abs(ck.x - c0.x);
    ok("!! *** THE KERNEL'S CENTRE OF MASS FOLLOWS THE DISCRETE PARABOLA ***", err < 1e-4,
        n + " steps: got " + ck.y.toFixed(9) + " against " + want.toFixed(9) + ", error " + err.toExponential(3) +
        ". *** THE CPU LOOP READS 8.9e-16 HERE AND THIS IS FIVE THOUSAND TIMES LOOSER -- that gap is SINGLE " +
        "PRECISION, not a wrong kernel, and the page must say so rather than show a number it cannot earn ***");
    ok("!! the sideways drift is exactly zero", drift === 0,
        drift.toExponential(3) + " -- gravity is vertical and NOTHING ELSE MAY PUSH. A non-zero drift would " +
        "mean the stencil or the force scatter had gone asymmetric");
}

// ---- 3. DETERMINISM, WHICH IS WHAT THE FIXED POINT WAS FOR -----------------------------------------------------
console.log("\n3. DETERMINISM: THE PROPERTY INTEGER ATOMICS BUY AND FLOAT ATOMICS COULD NOT");
{
    const a = runKernel(SCENES.column, Math.min(STEPS, 20));
    const b = runKernel(SCENES.column, Math.min(STEPS, 20));
    let identical = true;
    for (let i = 0; i < a.parts.length; i++) if (a.parts[i] !== b.parts[i]) identical = false;
    ok("!! *** TWO IDENTICAL RUNS PRODUCE BIT-IDENTICAL PARTICLES ***", identical,
        "integer addition is associative, so the total at a node does not depend on which workgroup finished " +
        "first. THIS IS THE ONE PLACE THE FIXED POINT IS BETTER THAN THE FLOAT VERSION WOULD HAVE BEEN, and it " +
        "is the property mpm-gpu-check.html re-tests on real hardware, where the ordering genuinely varies");
}

console.log("\ngpuKernelInterp: " + (fails ? fails + " FAILED" : "all checks pass") +
    "   -- NOT A GATE, and not hardware. mpm-gpu-check.html still owes the real-driver verdict.");
process.exit(fails ? 1 : 0);
