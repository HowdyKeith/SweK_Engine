#!/usr/bin/env node
// WebGLEngine/tools/ship/lbmGpu-selfcheck.mjs -- v4404
//
// *** simulation/lbm/lbmShader.js SAID IT WAS "CORRECT-BY-CONSTRUCTION AND UNRUN". IT DID NOT COMPILE. ***
//
// The module's header carried that sentence and a v2977 correction directly above it, which had already caught
// this file making a claim it had not earned: an earlier header ended "the test below pulls the constants back
// OUT of the generated WGSL and checks them against the module" and THERE WAS NO SUCH TEST. That was fixed --
// simulation/lbm/shaderConstants-selfcheck.mjs exists, reads the text, and passes.
//
// AND THE SAME SPECIES SURVIVED IN THE NEXT SENTENCE. Nothing had ever handed the text to a COMPILER. `macro` is
// a RESERVED KEYWORD in WGSL, so the binding at line 37 made the entire module a parse error -- "13:48 error:
// 'macro' is a reserved keyword" -- and the first run attempted here had all 48,124 of its dispatches rejected
// before any of them began. A constants gate that reads a string cannot tell you the string is a shader. The
// buffer is `moments` now, which is what it holds.
//
// ---- AND IT TOOK A gfx/device.js CHANGE, BECAUSE THIS IS THE FIRST MODULE HERE WITH TWO ENTRY POINTS ---------
//
// WebGPU's layout:"auto" builds a bind group layout from what the CHOSEN entry point USES, not from what the
// module DECLARES. collideStream touches all five bindings; stream touches three. Both halves of that mismatch
// were errors and there was no way to be right: binding the extra two to `stream` is rejected by the device
// ("binding index 2 not present in the bind group layout") and not binding them was refused by device.js itself
// ("nothing was bound to it"). device.compute() takes `uses` now -- the caller names the subset one entry point
// needs -- and omitting it requires every declared binding exactly as before.
//
// ---- THE KEY IS THE ONE THE CPU IS ALREADY HELD TO ------------------------------------------------------------
//
// Channel flow has an exact analytic answer, and tools/ship/floors.mjs POISEUILLE is the tree's own statement of
// it: the relative L2 of the measured profile against (force / 2nu) * y * (H - y), with y = j - 0.5 and H = ny-2
// because halfway bounce-back puts the no-slip surface between the last fluid node and the wall, against a
// tolerance of 0.005. Its nominal fixture is used unchanged -- tau 0.8, 12x34, 12,000 steps, which that file
// sized by measurement after a first guess of 3,000 came out eleven times the tolerance.
//
// *** AND THE FORCING, WHICH THAT FILE PROVED VACUOUS, IS WHERE f32 SHOWS. *** floors.mjs declares `force` a
// vacuousKnob with a measurement behind it: "Stokes flow is linear in the forcing, so the measured profile AND
// the analytic target scale together and the RELATIVE residual is invariant. Measured: a 20% error in force
// moves the observable by EXACTLY 0.000000%." That is true in f64 and section 4 shows it is NOT true on the
// device: the CPU returns 7.038e-4 at force 1e-6 and at 1e-3 alike, and the device returns 1.505e-3 and
// 7.437e-4. A knob that is vacuous in f64 and live in f32 is a clean isolation of what the precision costs,
// using a knob this tree had already proven carries no physics.
//
// SABOTAGES: see the log at the foot of this file.
//
// Run: node tools/ship/lbmGpu-selfcheck.mjs   (exit 0 all-pass, 1 on any fail; a SKIP counts as a failure)
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runInEngineOrigin, webgpuSkipReason } from "./webgpuHarness.mjs";
import { LBM_WGSL } from "../../simulation/lbm/lbmShader.js";
import { makeLBM, equilibrium, Q } from "../../simulation/lbm/lbm2d.js";
import { POISEUILLE } from "./floors.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
let fails = 0;
const ok = (label, cond, detail) => { if (!cond) fails++; console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}${detail ? "   " + detail : ""}`); };
const report = (s) => console.log(`  ----  ${s}`);

const { tau: TAU, nx: NX, ny: NY, steps: STEPS } = POISEUILLE.nominal;
const NOMINAL_F = POISEUILLE.nominal.force, BIG_F = 1e-3, TOL = POISEUILLE.tol;
/** POISEUILLE.measure's own arithmetic, over a profile from either machine. */
const residual = (uxAt, force) => {
    const nu = (TAU - 0.5) / 3, H = NY - 2, mid = Math.floor(NX / 2);
    let sum = 0, ref = 0;
    for (let j = 1; j <= H; j++) { const y = j - 0.5, want = (force / (2 * nu)) * y * (H - y), got = uxAt(mid, j);
        sum += (got - want) ** 2; ref += want * want; }
    return ref > 0 ? Math.sqrt(sum / ref) : Infinity;
};
const cpuProfile = (force) => { const l = makeLBM({ nx: NX, ny: NY, tau: TAU, force: [force, 0] });
    for (let s = 0; s < STEPS; s++) l.step(); return (x, j) => l.ux[l.idx(x, j)]; };

console.log("\n1. THE RESERVED WORD, AND THE HEADER THAT SAID IT COULD NOT MATTER (no device needed)");
{
    const src = fs.readFileSync(path.join(ENG, "simulation/lbm/lbmShader.js"), "utf8");
    ok("*** the shipped WGSL no longer declares a binding named `macro`, which is a WGSL RESERVED KEYWORD and made the whole module a parse error ***",
        !/\bmacro\s*:/.test(LBM_WGSL) && !/\bmacro\[/.test(LBM_WGSL) && /moments\s*:\s*array<vec4<f32>>/.test(LBM_WGSL),
        "the buffer holds density and momentum, which ARE the moments of the distribution, so the new name is the right one rather than merely legal");
    ok("  and the module records the correction rather than quietly renaming, as it did for the v2977 one above it",
        /reserved keyword/.test(src) && /v2977/.test(src),
        "two claims in one header that were PRESENT and not TRUE, four hundred rounds apart, and the second was hidden behind a gate that reads text");
    ok("  the constants gate still passes, which is the point about what it can and cannot see",
        /const Q: u32 = 9u;/.test(LBM_WGSL) && Q === 9,
        "simulation/lbm/shaderConstants-selfcheck.mjs reads Q, CS2, E, W and OPP out of the string and checks them against the module. All of that was correct in a shader that could not compile");
}

const skip = webgpuSkipReason();
console.log("\n2. IT COMPILES AND RUNS, 3. THE ANALYTIC PARABOLA, 4. WHAT f32 COSTS");
if (skip) { console.log(`  SKIP  ${skip}`); fails++; }
else {
    const f0 = new Float32Array(NX * NY * Q), solid = new Uint32Array(NX * NY);
    for (let y = 0; y < NY; y++) for (let x = 0; x < NX; x++) { const k = y * NX + x;
        if (y === 0 || y === NY - 1) solid[k] = 1;
        for (let i = 0; i < Q; i++) f0[k * Q + i] = equilibrium(i, 1, 0, 0); }
    const r = await runInEngineOrigin({ engineRoot: ENG, args: { NX, NY, TAU, STEPS, Q,
        forces: [NOMINAL_F, BIG_F], wgsl: LBM_WGSL, f0: [...f0], solid: [...solid] }, script: `async (a) => {
        const { requestDevice } = await import("/gfx/device.js");
        const out = { runs: {}, refusals: {} };
        try {
            const cv = document.createElement("canvas"); cv.width = 32; cv.height = 32;
            const dev = await requestDevice(cv, { backend: "webgpu", offscreen: true });
            const errs = []; if (dev.gpu && dev.gpu.addEventListener) dev.gpu.addEventListener("uncapturederror", (e) => errs.push(String(e.error && e.error.message).slice(0, 220)));
            const n = a.NX * a.NY;
            const col = dev.compute({ wgsl: a.wgsl, entryPoint: "collideStream" });
            const str = dev.compute({ wgsl: a.wgsl, entryPoint: "stream", uses: ["fIn", "fOut", "P"] });
            // the mismatch this round had to fix, both ways round, captured rather than described
            const refuse = (fn) => { try { fn(); return null; } catch (e) { return String(e.message).slice(0, 200); } };
            out.refusals.unusedBound = refuse(() => dev.compute({ wgsl: a.wgsl, entryPoint: "stream", uses: ["fIn", "fOut", "P"] })
                .bind("solid", dev.buffer({ data: new Uint32Array(4), usage: ["storage"] })));
            out.entryBindings = { collide: col.all.map((b) => b.name).join(","), stream: str.all.map((b) => b.name).join(",") };
            for (const force of a.forces) {
                const A = dev.buffer({ data: new Float32Array(a.f0), usage: ["storage"] });
                const B = dev.buffer({ data: new Float32Array(a.f0), usage: ["storage"] });
                const S = dev.buffer({ data: new Uint32Array(a.solid), usage: ["storage"] });
                const M = dev.buffer({ data: new Float32Array(n * 4), usage: ["storage"] });
                // struct Params ends in a vec3<f32>, which aligns to 16: the struct is 48 bytes, not 32
                const ab = new ArrayBuffer(48), u = new Uint32Array(ab), f = new Float32Array(ab);
                u[0] = a.NX; u[1] = a.NY; f[2] = a.TAU; f[3] = force; f[4] = 0;
                const P = dev.buffer({ data: new Uint8Array(ab), usage: "uniform" });
                const wg = [Math.ceil(a.NX / 8), Math.ceil(a.NY / 8), 1], CH = 200;
                for (let s0 = 0; s0 < a.STEPS; s0 += CH) {
                    const hi = Math.min(a.STEPS, s0 + CH);
                    dev.frame(({ pass }) => {
                        for (let s = s0; s < hi; s++) {
                            col.bind("fIn", A).bind("fOut", B).bind("solid", S).bind("moments", M).bind("P", P); pass.dispatch(col, wg);
                            str.bind("fIn", B).bind("fOut", A).bind("P", P); pass.dispatch(str, wg);
                        }
                        pass.clear([0, 0, 0, 1]);
                    }, { offscreen: true });
                }
                out.runs[String(force)] = [...new Float32Array(await dev.read(M))];
                A.destroy(); B.destroy(); S.destroy(); M.destroy(); P.destroy();
            }
            out.errs = errs;
        } catch (e) { out.error = String(e && e.message || e).slice(0, 600); }
        return out;
    }` });
    ok("*** the kernel COMPILES AND RUNS -- 24,000 dispatches with ZERO device errors, where the first attempt had 48,124 rejections and no compile at all ***",
        r.ok && r.result && !r.result.error && r.result.runs && (r.result.errs || []).length === 0,
        r.ok ? (r.result && r.result.error) || `device errors ${(r.result && r.result.errs || []).length}` : (r.reason || (r.pageErrors || []).join("; ")));
    if (r.ok && r.result && !r.result.error) {
        const F = r.result;
        ok("  and the two entry points really do use different binding sets, which is the thing device.js could not express",
            F.entryBindings.collide.split(",").length === 5 && F.entryBindings.stream.split(",").length === 3 &&
            /binding named "solid"/.test(F.refusals.unusedBound || ""),
            `collideStream uses ${F.entryBindings.collide}; stream uses ${F.entryBindings.stream}. Binding one the entry point does not use is now refused BY NAME rather than by the device`);

        const gAt = (force) => (x, j) => F.runs[String(force)][(j * NX + x) * 4 + 1];
        const dBig = residual(gAt(BIG_F), BIG_F), cBig = residual(cpuProfile(BIG_F), BIG_F);
        ok(`*** KEY: the device reproduces the analytic Poiseuille parabola to ${dBig.toExponential(3)} relative L2, against the tree's own tolerance of ${TOL} -- the CPU reads ${cBig.toExponential(3)} ***`,
            dBig < TOL && cBig < TOL,
            `POISEUILLE.measure's arithmetic exactly: (force / 2nu) * y * (H - y) with y = j - 0.5 and H = ny - 2, ${STEPS} steps at tau ${TAU} on ${NX}x${NY}. The parabola is never given to the kernel`);
        const midU = F.runs[String(BIG_F)][((NY >> 1) * NX + (NX >> 1)) * 4 + 1];
        ok(`  and it is a real profile, not a flat field: centre-line velocity ${midU.toExponential(4)} against a rest state of 0`,
            midU > 1 && Number.isFinite(midU), "a kernel that never ran leaves the equilibrium it was seeded with");

        // *** THE VACUOUS KNOB THAT IS NOT VACUOUS ON THE DEVICE ***
        const dNom = residual(gAt(NOMINAL_F), NOMINAL_F), cNom = residual(cpuProfile(NOMINAL_F), NOMINAL_F);
        ok(`*** floors.mjs proved the FORCE knob VACUOUS in f64 and it is LIVE in f32: the CPU returns ${cNom.toExponential(3)} at ${NOMINAL_F} and ${cBig.toExponential(3)} at ${BIG_F}, while the device returns ${dNom.toExponential(3)} and ${dBig.toExponential(3)} ***`,
            Math.abs(cNom - cBig) / cBig < 1e-3 && dNom > dBig * 1.5 && dNom < TOL,
            `a ${(dNom / dBig).toFixed(1)}x spread on the device against ${(Math.abs(cNom - cBig) / cBig * 100).toFixed(4)}% on the CPU. Stokes flow is linear in the forcing so the residual cannot depend on it -- unless the numbers stop having room, and at force ${NOMINAL_F} the perturbation to a population of about 1/9 is roughly seventeen f32 epsilons`);
        report("BOTH DEVICE READINGS ARE STILL INSIDE THE TOLERANCE, so this is a measurement of what f32 costs " +
               "rather than a failure. It is also the cheapest possible statement of it: the knob was already " +
               "PROVEN to carry no physics on the CPU, so everything the device does with it is precision and " +
               "nothing is physics. NOT MEASURED: where between the two forcings the device's residual leaves " +
               "the tolerance, which is a sweep this round did not run.");
    }
}

// SABOTAGE LOG -- applied, gate run, exit code read, restored. Every number below was produced by running it.
//   A  the reserved word put back (`moments` -> `macro`) -> exit=1, 2 red: the source check names it and the run
//      dies with no compile at all. This is the state the file SHIPPED IN, so the sabotage is a re-enactment
//      rather than a hypothetical, and 2 red is what four hundred rounds of "correct-by-construction" was worth.
//   B  the Guo half-force correction dropped (u = m/rho, without + g*0.5) -> exit=1, 3 red: the residual goes to
//      6.254e-1, a hundred and twenty-five times the tolerance, and the centre-line velocity reads 4.7909e-1
//      against 1.2780. lbm2d.js's own comment predicts exactly this -- "Without it the measured velocity is
//      wrong by exactly g/2 and the parabola sits low" -- and the device now says so too.
//   C  gfx/device.js's `uses` ignored, so every declared binding is required of every entry point again ->
//      exit=1, 1 red: the run cannot start, because `stream` must then bind two buffers its layout does not
//      contain and the device rejects them. The capability is load-bearing rather than a convenience.
console.log(fails ? "\nFAIL -- " + fails + " check(s)" : "\nALL GREEN");
console.log("unchecked here: SPEED, which is the entire reason an LBM kernel exists -- the module's own header " +
    "opens \"LBM is the ideal GPU workload and this is why FluidX3D is so fast\", and SwiftShader is a software " +
    "rasteriser, so nothing here times anything and no rig has signed a number. The 3D kernel " +
    "simulation/lbm/lbm3dShader.js, which has no gate either and was checked only for the same reserved word (it " +
    "does not have one). Obstacles, inflow and thermal coupling, all of which lbm2d.js has and this shader does " +
    "not. And a real GPU's arithmetic against SwiftShader's, which is where the f32 spread in section 4 would move.");
process.exit(fails ? 1 : 0);
