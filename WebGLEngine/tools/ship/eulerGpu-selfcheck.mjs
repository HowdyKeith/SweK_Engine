#!/usr/bin/env node
// WebGLEngine/tools/ship/eulerGpu-selfcheck.mjs -- v4403
//
// *** simulation/euler/eulerShader.js HAD NEVER RUN, AND THE TREE SAID SO IN TWO PLACES. ***
//
// The module's own header opens with it: "The same confession as the D3Q19 kernel, and the same two defences.
// This has never run: there is no GPU where it was written. So it ships with an adjudicator, and it is
// deliberately scoped to something that can be got RIGHT blind rather than something impressive that would be a
// coin flip." And tools/ship/coverageTriage.mjs classified it HARDWARE -- "Needs a real GPU, like the bench
// pages, so it cannot be gated in a sandbox."
//
// *** THAT SECOND CLAIM IS NOW MEASURABLY WRONG, AND THIS FILE IS THE MEASUREMENT. *** node-webgpu, installed by
// the SessionStart hook, serves a compute device in-process through Dawn. The kernel compiles, runs 4,490
// dispatches, and is adjudicated against its own CPU twin in a couple of seconds. It was never that a real GPU
// was required; it was that the sandbox had no device, and it has had one since v4359. The triage entry moves
// to GATEABLE in the same round, which is what that list is for -- it exists to be retired from.
//
// WHAT IS STILL TRUE ABOUT "NEEDS A REAL GPU": SwiftShader is a software rasteriser, so what has been shown is
// that the kernel is CORRECT, not that it is fast, and a vendor's sqrt() against SwiftShader's is unsigned by
// any rig. This gate makes no timing claim and says so where the numbers are.
//
// ---- THE TWO KEYS, WHICH ARE THE PAGE'S OWN ---------------------------------------------------------------------
//
// euler-gpu-check.html has run these rows for a human with hardware since v2469 and nothing headless has ever
// run them. They are reproduced here with the page's own fixture (Sod's shock tube, gamma 1.4, outflow, a shared
// conservative dt from the CPU's CFL so the two solvers are asked the same question):
//
//   1. THE GPU AND THE CPU ARE THE SAME SOLVER. Both first-order Godunov with the same HLLC flux, 400 cells,
//      t = 3. *** AND THE PAGE'S TOLERANCE TURNS OUT TO BE 62,000x LOOSER THAN THE ANSWER. *** It accepts a
//      worst density disagreement under 2% of peak; measured, it is 3.2e-7 RELATIVE. That is f32 epsilon
//      accumulated over 562 steps against an f64 reference -- euler2d.js is Float64Array throughout -- which is
//      the right order for what these two solvers are. A tolerance nobody could run was set by guessing, and
//      guessing loose is the safe direction; this is what it would have been if it could have been measured.
//   2. THE GPU FINDS RANKINE-HUGONIOT ALONE. The strong-shock density ratio is (gamma+1)/(gamma-1) = 6, a
//      closed form from the 1870s that the kernel is never told. At 800 cells and t = 12 the device reads 5.9679
//      and the CPU twin reads 5.9679 -- agreeing to four decimals -- and BOTH miss the exact value by 0.534%.
//      That gap is first-order truncation, which is the physics the module chose on purpose, not a device error,
//      and the two agreeing on it is the stronger statement.
//
// ---- AND THE PAGE SHIPPED ITS OWN SABOTAGE, WHICH HAD ALSO NEVER BEEN RUN ------------------------------------
//
// *** AND THE TOLERANCE BEING A GUESS IS NOT A CURIOSITY -- IT IS LOOSE ENOUGH TO PASS A REAL BUG. *** Sabotage A
// below breaks the HLLC wave-speed estimate so it no longer takes the min and max over both states. The device
// then disagrees with the CPU twin by 4.587e-3 -- 0.459%, comfortably inside the page's 2% -- and the shock ratio
// survives it as well, so THE PAGE WOULD HAVE PASSED IT ON BOTH ROWS. Replacing a guessed tolerance with a
// measured one is what lets this file see it, which is the argument for running the thing at all.
//
// The page has a button that makes the equation of state 2% wrong (gamma - 1 becomes gamma - 1.02), on the
// argument that "gamma sets the compression a shock can reach, so this should move 6.000 somewhere else
// entirely -- and if the adjudicator cannot see that, it cannot see anything". Run headlessly for the first
// time: the peak goes to 7.8257, which is 30.43% off, against a 2% refusal. The argument was right and now it
// has a number: caught by a factor of fifteen.
//
// SABOTAGES: see the log at the foot of this file.
//
// Run: node tools/ship/eulerGpu-selfcheck.mjs   (exit 0 all-pass, 1 on any fail; a SKIP counts as a failure)
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runInEngineOrigin, webgpuSkipReason } from "./webgpuHarness.mjs";
import { EULER_WGSL } from "../../simulation/euler/eulerShader.js";
import { makeEuler } from "../../simulation/euler/euler2d.js";
import { triage } from "./coverageTriage.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
let fails = 0;
const ok = (label, cond, detail) => { if (!cond) fails++; console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}${detail ? "   " + detail : ""}`); };
const report = (s) => console.log(`  ----  ${s}`);

const G = 1.4, EXACT = (G + 1) / (G - 1);          // 6.000, Rankine-Hugoniot -- not a number the kernel knows
const sod = (nx) => (i) => (i < nx / 2 ? { rho: 1, u: 0, p: 1000 } : { rho: 1, u: 0, p: 0.01 });
const dtFor = (nx, ny) => makeEuler({ nx, ny, gamma: G, bc: "outflow", order: 1, init: sod(nx) }).cflDt(0.4) * 0.5;
const cpuRun = (nx, ny, dt, steps) => { const c = makeEuler({ nx, ny, gamma: G, bc: "outflow", order: 1, init: sod(nx) });
    for (let s = 0; s < steps; s++) c.step(dt); return c; };
const SABOTAGED = EULER_WGSL.replace("(P.scal.y - 1.0) * (uSrc[k + 3u]", "(P.scal.y - 1.02) * (uSrc[k + 3u]");

console.log("\n1. THE TRIAGE ENTRY THIS ROUND RETIRES (no device needed)");
{
    const t = triage();
    ok("*** simulation/euler/eulerShader.js is no longer in the ungated list, and HARDWARE is no longer a verdict this tree carries ***",
        !t.nonScene.includes("simulation/euler/eulerShader.js") && (t.counts.HARDWARE || 0) === 0,
        `HARDWARE count ${t.counts.HARDWARE || 0}; the list exists to be retired from, and "cannot be gated in a sandbox" was true of a sandbox with no device`);
    const src = fs.readFileSync(path.join(ENG, "simulation/euler/eulerShader.js"), "utf8");
    ok("  and the module's own confession is LEFT STANDING -- \"this has never run: there is no GPU where it was written\" was true when written and is not edited by a round that changes what is true now",
        /This has never run: there is no GPU where it was written/.test(src.replace(/\s*\n\s*\/\/\s*/g, " ")),
        "history is not rewritten to match a later capability; the triage entry is where the CURRENT verdict lives, and it names the round that moved it");
    const tri = fs.readFileSync(path.join(ENG, "tools/ship/coverageTriage.mjs"), "utf8");
    ok("  ...and the triage entry SAYS which half of its old verdict survived, rather than being deleted",
        /eulerShader\.js": \{ verdict: "GATEABLE"/.test(tri) && /cannot be TIMED in a sandbox, which is still true/.test(tri),
        "a verdict that was overturned is worth more in that list than one that was merely right");
}

const skip = webgpuSkipReason();
console.log("\n2. THE KERNEL RUNS AT ALL, and 3. THE TWO KEYS, and 4. THE PAGE'S OWN SABOTAGE");
if (skip) { console.log(`  SKIP  ${skip}`); fails++; }
else {
    const JOBS = [
        { name: "same-solver", nx: 400, ny: 8, tEnd: 3, wgsl: EULER_WGSL },
        { name: "shock-ratio", nx: 800, ny: 8, tEnd: 12, wgsl: EULER_WGSL },
        { name: "sabotaged", nx: 800, ny: 8, tEnd: 12, wgsl: SABOTAGED },
    ].map((j) => { const dt = dtFor(j.nx, j.ny); return { ...j, dt, steps: Math.ceil(j.tEnd / dt) }; });
    const r = await runInEngineOrigin({ engineRoot: ENG, args: { G, jobs: JOBS }, script: `async (a) => {
        const { requestDevice } = await import("/gfx/device.js");
        const out = { runs: {} };
        try {
            const cv = document.createElement("canvas"); cv.width = 32; cv.height = 32;
            const dev = await requestDevice(cv, { backend: "webgpu", offscreen: true });
            const errs = []; if (dev.gpu && dev.gpu.addEventListener) dev.gpu.addEventListener("uncapturederror", (e) => errs.push(String(e.error && e.error.message).slice(0, 200)));
            for (const job of a.jobs) {
                const n = job.nx * job.ny, init = new Float32Array(n * 4);
                for (let j = 0; j < job.ny; j++) for (let i = 0; i < job.nx; i++) {
                    const p = i < job.nx / 2 ? 1000 : 0.01, k = (j * job.nx + i) * 4;
                    init[k] = 1; init[k + 1] = 0; init[k + 2] = 0; init[k + 3] = p / (a.G - 1);
                }
                const A = dev.buffer({ data: init, usage: ["storage"] }), B = dev.buffer({ data: new Float32Array(n * 4), usage: ["storage"] });
                const mkP = (dir) => { const ab = new ArrayBuffer(32), u = new Uint32Array(ab), f = new Float32Array(ab);
                    u[0] = job.nx; u[1] = job.ny; u[2] = dir; u[3] = 0; f[4] = job.dt; f[5] = a.G;
                    return dev.buffer({ data: new Uint8Array(ab), usage: "uniform" }); };
                const P0 = mkP(0), P1 = mkP(1);
                const p = dev.compute({ wgsl: job.wgsl });
                // the kernel is @compute @workgroup_size(8, 8) -- the arc's first 2D workgroup, dispatched 2D
                const wg = [Math.ceil(job.nx / 8), Math.ceil(job.ny / 8), 1], CH = 50;
                for (let s0 = 0; s0 < job.steps; s0 += CH) {
                    const hi = Math.min(job.steps, s0 + CH);
                    dev.frame(({ pass }) => {
                        for (let s = s0; s < hi; s++) {
                            p.bind("uSrc", A).bind("uDst", B).bind("P", P0); pass.dispatch(p, wg);
                            p.bind("uSrc", B).bind("uDst", A).bind("P", P1); pass.dispatch(p, wg);
                        }
                        pass.clear([0, 0, 0, 1]);
                    }, { offscreen: true });
                }
                const row = [], got = new Float32Array(await dev.read(A));
                for (let i = 0; i < job.nx; i++) row.push(got[(4 * job.nx + i) * 4]);   // density along row j = 4
                out.runs[job.name] = row;
                A.destroy(); B.destroy(); P0.destroy(); P1.destroy();
            }
            out.errs = errs;
        } catch (e) { out.error = String(e && e.message || e).slice(0, 600); }
        return out;
    }` });
    ok("*** the kernel COMPILES AND RUNS HEADLESSLY, which its own header says had never happened ***",
        r.ok && r.result && !r.result.error && r.result.runs && r.result.runs["same-solver"],
        r.ok ? (r.result && r.result.error) : (r.reason || (r.pageErrors || []).join("; ")));
    if (r.ok && r.result && !r.result.error) {
        const F = r.result, J = Object.fromEntries(JOBS.map((j) => [j.name, j]));
        // KEY 1 -- the same solver
        const g1 = F.runs["same-solver"], j1 = J["same-solver"];
        const c1 = cpuRun(j1.nx, j1.ny, j1.dt, j1.steps);
        let worst = 0, ref = 0, differing = 0;
        for (let i = 0; i < j1.nx; i++) { const cr = c1.get(i, 4)[0];
            if (g1[i] !== cr) differing++;
            worst = Math.max(worst, Math.abs(g1[i] - cr)); ref = Math.max(ref, cr); }
        const rel = worst / ref;
        ok(`*** KEY 1: the device and the f64 CPU twin agree to ${rel.toExponential(3)} relative over ${j1.steps} steps -- the page accepts 2%, which is ${Math.round(0.02 / rel).toLocaleString()}x looser ***`,
            rel < 1e-5 && rel > 0 && differing > 0 && (F.errs || []).length === 0,
            `${differing} of ${j1.nx} cells differ at all, worst absolute ${worst.toExponential(4)} on a peak of ${ref.toFixed(4)}. euler2d.js is Float64Array throughout, so this is f32 epsilon accumulated -- the right order, and NOT zero, which would have meant the comparison was reading one solver twice`);
        // KEY 2 -- Rankine-Hugoniot
        const g2 = F.runs["shock-ratio"], j2 = J["shock-ratio"];
        const c2 = cpuRun(j2.nx, j2.ny, j2.dt, j2.steps);
        const dPeak = Math.max(...g2);
        let cPeak = 0; for (let i = 0; i < j2.nx; i++) cPeak = Math.max(cPeak, c2.get(i, 4)[0]);
        const dErr = Math.abs(dPeak - EXACT) / EXACT, cErr = Math.abs(cPeak - EXACT) / EXACT;
        ok(`*** KEY 2: the device finds the strong-shock ratio at ${dPeak.toFixed(4)} against the exact ${EXACT.toFixed(3)} (${(dErr * 100).toFixed(3)}%), and the CPU twin reads ${cPeak.toFixed(4)} -- the same to four decimals ***`,
            dErr < 0.02 && Math.abs(dPeak - cPeak) / cPeak < 1e-4,
            `device ${(dErr * 100).toFixed(3)}%, CPU ${(cErr * 100).toFixed(3)}%. The gap is FIRST-ORDER TRUNCATION, which this module chose deliberately, and the two solvers agreeing on it is a stronger statement than either landing near 6 alone`);
        ok(`  and it is not a flat field: density spans ${Math.min(...g2).toFixed(4)} to ${dPeak.toFixed(4)} across the tube`,
            Math.min(...g2) < 0.9 && dPeak > 4, `a kernel that never ran would leave the initial 1.0000 everywhere`);
        // THE PAGE'S OWN SABOTAGE
        const gs = F.runs["sabotaged"], sPeak = Math.max(...gs), sErr = Math.abs(sPeak - EXACT) / EXACT;
        ok(`*** the page's own EOS sabotage, run for the first time: the peak moves to ${sPeak.toFixed(4)}, ${(sErr * 100).toFixed(2)}% off, caught by a factor of ${(sErr / 0.02).toFixed(0)} against the 2% refusal ***`,
            sErr > 0.02 && sPeak > dPeak,
            `"gamma sets the compression a shock can reach, so this should move 6.000 somewhere else entirely" -- the page's argument, now with a number behind it`);
        report("NO TIMING CLAIM IS MADE HERE AND THE DISTINCTION MATTERS. The device is SwiftShader, a software " +
               "rasteriser; what these rows show is that the kernel is CORRECT, not that it is fast, and the whole " +
               "reason a compute kernel exists is speed. A real GPU's sqrt() against SwiftShader's is also unsigned " +
               "by any rig. So 'needs a real GPU' was two claims wearing one sentence: it cannot be CHECKED in a " +
               "sandbox, which was true until v4359 and is now false, and it cannot be TIMED there, which is still true.");
    }
}

// SABOTAGE LOG -- applied, gate run, exit code read, restored. Every number below was produced by running it.
//   A  the HLLC wave speeds stop taking the min/max over BOTH states (SL = uL - aL, SR = uR + aR) -> exit=1,
//      1 red -- and it is the round's whole payoff. The agreement degrades from 3.2e-7 to 4.587e-3, WHICH IS
//      0.459% AND THEREFORE UNDER THE PAGE'S 2% TOLERANCE. *** euler-gpu-check.html WOULD HAVE PASSED THIS
//      SABOTAGE, on both of its rows: the shock ratio survives it too. *** A tolerance set by guessing, because
//      the thing could not be run, is loose enough to accept a broken Riemann solver. Running it once and
//      replacing the guess with the measurement is what makes the check able to see this, and that is the
//      argument for the round rather than a nice extra.
//   B  the outflow clamp dropped from at(), so the domain WRAPS instead of copying its edge cell -> exit=1,
//      2 red and both keys go: agreement 8.045e-1 and the shock ratio 6.7687 against 6.000 (12.8%). The loud
//      one, and the contrast with A is the point -- a boundary condition that is wrong is obvious, and a wave
//      speed that is wrong hides under a guessed tolerance.
//   C  the coverageTriage entry put back to HARDWARE -> exit=1, 1 red by name. The verdict this round overturns
//      is held by a check rather than by a commit message, so putting it back costs something.
console.log(fails ? "\nFAIL -- " + fails + " check(s)" : "\nALL GREEN");
console.log("unchecked here: SPEED, for the reason above -- the kernel exists to be fast and nothing here measures " +
    "that. A real GPU's sqrt(), min() and max() against SwiftShader's, which is the one place an f32 kernel with a " +
    "square root in its flux could part from this run. The MUSCL-Hancock path, which the CPU has and the kernel " +
    "deliberately does not -- the module's header argues first order was the right thing to write blind, and now " +
    "that it can be run, whether second order is worth writing is a question this round opens and does not answer. " +
    "And simulation/lbm/lbmShader.js, which carries the SAME confession in the same words and still has no gate.");
process.exit(fails ? 1 : 0);
