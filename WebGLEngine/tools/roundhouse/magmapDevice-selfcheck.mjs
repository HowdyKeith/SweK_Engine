#!/usr/bin/env node
// WebGLEngine/tools/roundhouse/magmapDevice-selfcheck.mjs -- v4405
//
// *** "THE CARD IS GRADED BY magmapGpu.js IN A BROWSER, AGAINST THIS SAME REFERENCE, AND ONLY THAT COUNTS AS THE
// KERNEL HAVING BEEN RUN." *** magmapKernel.mjs wrote that at v2903 about its own f32 emulator, to keep the
// emulator from ever being reported as a card. It was the right rule and it had one consequence nobody chased:
// magmapGpu() and magmapRun() take a `device`, and until v4405 the ONLY callers that passed one were two HTML
// pages. No gate had ever given the first kernel a device. This one does, through node-webgpu.
//
// ---- WHAT A DEVICE SETTLED THAT AN EMULATOR COULD NOT -----------------------------------------------------------
//
// *** THE RECORDED f32 FLOOR WAS MEASURED ONE ROUNDING SHORT OF THE KERNEL. *** F32_FLOOR was 4.385e-6, which is
// exactly what magmapKernel's cellMag() returns -- and cellMag RETURNS A DOUBLE. The shipped kernel writes
// `out : array<f32>`, so a real run rounds once more on the store. magmapEmulated(), which stores into a
// Float32Array and therefore models the kernel's own output buffer, gives 4.4196e-6. The device measures
// 4.420e-6: it sides with the store.
//
// AND THE CHECK THAT WAS SUPPOSED TO CATCH THAT DRIFT SHARED THE FAULT. magmap-selfcheck re-measured the floor
// with cellMag as well, so the constant and its guard agreed with each other; and it asserted
// `worst <= F32_FLOOR * 2` while magmapGpu.mjs's header promised "the selfcheck fails if the measured floor ever
// moves above it". Two models of the same thing, both one rounding short, with a 2x slack on top. Both are fixed
// at v4405: the floor carries visible headroom (4.5e-6) over a measurement taken THROUGH the store, and the
// check is strict.
//
// ---- AND THE ARCHITECTURE IT WAS BUILT TO JUSTIFY IS CONFIRMED, ON HARDWARE, FOR THE FIRST TIME ------------------
//
// v2903 chose "the GPU may propose the MAP; the PEAK is recomputed on the CPU, always" on the strength of an
// emulated claim: that the worst f32 cell of the whole grid is the CENTRE cell, which is the peak, because the
// caustic is where the magnification diverges and the quadrature works hardest. Measured on a device over 441
// cells: the worst cell is 220, and the centre is 220. gradedPeak() -- which recomputes rather than reading the
// proposal -- lands 1.4e-7 from the closed form sqrt(1 + 4/rho^2), against the device's own 4.42e-6 at that same
// cell. Accepting a GPU-sourced peak would have degraded the graded number by about thirty times while looking
// like a speedup, and that ratio is now a measurement rather than an estimate.
//
// ---- THE ONE NUMBER THAT MOVED IN THE OTHER DIRECTION ------------------------------------------------------------
//
// magmapGpu's header said the fma-contracted variant differs from the uncontracted one "by at most 6.3e-8, so
// vendor contraction is NOT the dominant term". The difference is 2.578e-7 -- four times that. THE CONCLUSION
// SURVIVES AND IS NOW BETTER SUPPORTED: the device sits 7.634e-7 from the uncontracted emulator and 7.634e-7
// from the contracted one, the SAME distance from both, so whatever separates a device from the model here, it
// is not fma. That is a stronger statement than the arithmetic estimate it replaces, because it was taken with
// a card in the loop.
//
// SABOTAGES: see the log at the foot of this file.
//
// Run: node tools/roundhouse/magmapDevice-selfcheck.mjs   (exit 0 all-pass, 1 on any fail; a SKIP counts as a fail)
"use strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runInEngineOrigin, webgpuSkipReason } from "../ship/webgpuHarness.mjs";
import { F32_FLOOR, MEASURED_F32_WORST, MAGMAP_TOL, magmapEmulated, gradedPeak, SHIPPED_VARIANT } from "./magmapGpu.mjs";
import { referenceCell, sampleTable } from "./magmapKernel.mjs";
import { SHARED_CAP } from "./magmapVariants.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
let fails = 0;
const ok = (label, cond, detail) => { if (!cond) fails++; console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}${detail ? "   " + detail : ""}`); };
const report = (s) => console.log(`  ----  ${s}`);

const CFG = { n: 21, span: 1.0, rho: 0.1, nR: 48, nT: 48 };
const TABLE = sampleTable(CFG.nT);
const CENTRE = (CFG.n * CFG.n - 1) / 2;
const worstAgainstRef = (cells) => { let w = 0, at = -1;
    for (let k = 0; k < CFG.n * CFG.n; k++) { const ref = referenceCell(k, { ...CFG, table: TABLE });
        const d = Math.abs(cells[k] - ref) / Math.abs(ref); if (d > w) { w = d; at = k; } }
    return { w, at }; };

console.log("\n1. THE FLOOR WAS MEASURED ONE ROUNDING SHORT OF THE KERNEL (no device needed)");
{
    const emu = magmapEmulated(CFG).value;
    const store = worstAgainstRef(emu);
    ok("*** the emulator that models the kernel's f32 OUTPUT BUFFER reads a worse floor than the one that returns a double ***",
        Math.abs(store.w - MEASURED_F32_WORST) / MEASURED_F32_WORST < 1e-3 && store.w > 4.385e-6,
        `through a Float32Array store ${store.w.toExponential(4)}; the recorded constant was 4.385e-6, which is cellMag()'s return value and rounds once fewer than \`out : array<f32>\``);
    ok("  and the floor now carries VISIBLE headroom over it rather than a silent 2x in the check",
        MEASURED_F32_WORST < F32_FLOOR && F32_FLOOR < MAGMAP_TOL && MAGMAP_TOL / F32_FLOOR < 3,
        `measured ${MEASURED_F32_WORST.toExponential(4)} < floor ${F32_FLOOR.toExponential(3)} < tol ${MAGMAP_TOL.toExponential(0)}, margin ${(MAGMAP_TOL / F32_FLOOR).toFixed(2)}x`);
    ok("  and the worst cell is the CENTRE cell in the emulator, which is the claim the architecture rests on",
        store.at === CENTRE, `worst at ${store.at}, centre is ${CENTRE}`);
}

const skip = webgpuSkipReason();
console.log("\n2. THE FIRST KERNEL, ON A DEVICE, FOR THE FIRST TIME");
if (skip) { console.log(`  SKIP  ${skip}`); fails++; }
else {
    const r = await runInEngineOrigin({ engineRoot: ENG, args: { CFG, CAP: SHARED_CAP }, script: `async (a) => {
        const M = await import("/tools/roundhouse/magmapGpu.mjs");
        const out = {};
        try {
            if (!navigator.gpu) throw new Error("no navigator.gpu in this page");
            const adapter = await navigator.gpu.requestAdapter(); if (!adapter) throw new Error("no adapter");
            const device = await adapter.requestDevice();
            const run = await M.magmapRun({ device, ...a.CFG });
            out.proposedBy = run.proposedBy; out.fellBack = run.fellBack;
            out.verdict = JSON.parse(JSON.stringify(run.verdict));
            const raw = await M.magmapGpu(device, a.CFG);
            out.cells = [...raw.value]; out.kernel = raw.kernel; out.adapter = raw.adapter;
            // above the shared-trig cap the kernel MUST fall back, and the label must say which one ran
            const big = await M.magmapGpu(device, { ...a.CFG, nT: a.CAP * 2 });
            out.bigKernel = big.kernel;
        } catch (e) { out.error = String(e && e.message || e).slice(0, 600); }
        return out;
    }` });
    ok("*** magmapGpu() was handed a device and returned a map -- which magmapKernel.mjs says is the only thing that counts as the kernel having been run ***",
        r.ok && r.result && !r.result.error && r.result.cells && r.result.proposedBy === "gpu",
        r.ok ? (r.result && r.result.error) : (r.reason || (r.pageErrors || []).join("; ")));
    if (r.ok && r.result && !r.result.error) {
        const F = r.result, dev = worstAgainstRef(F.cells);
        const emu = magmapEmulated(CFG).value, emuF = magmapEmulated({ ...CFG, contractFma: true }).value;
        let dvE = 0, dvF = 0, eVf = 0;
        for (let k = 0; k < CFG.n * CFG.n; k++) {
            dvE = Math.max(dvE, Math.abs(F.cells[k] - emu[k]) / Math.abs(emu[k]));
            dvF = Math.max(dvF, Math.abs(F.cells[k] - emuF[k]) / Math.abs(emuF[k]));
            eVf = Math.max(eVf, Math.abs(emu[k] - emuF[k]) / Math.abs(emu[k]));
        }
        ok(`*** the SHIPPED variant ran (${F.kernel}) and its worst cell against the f64 reference is ${dev.w.toExponential(3)} -- inside the corrected floor of ${F32_FLOOR.toExponential(3)}, and OVER the 4.385e-6 that was recorded ***`,
            dev.w < F32_FLOOR && dev.w > 4.385e-6 && F.kernel === "magmap.wgsl/" + SHIPPED_VARIANT.id,
            `a device sides with the STORE-rounded emulator (${MEASURED_F32_WORST.toExponential(4)}), not with cellMag's ${(4.385e-6).toExponential(3)}. This is the measurement the old constant could not have`);
        ok(`*** AND THE ARCHITECTURE'S CLAIM HOLDS ON HARDWARE: the device's worst cell of ${CFG.n * CFG.n} is cell ${dev.at}, and the centre is ${CENTRE} ***`,
            dev.at === CENTRE,
            "v2903 chose that rule -- the GPU may propose the MAP, the PEAK is recomputed on the CPU, always -- from an emulated version of this. It is a device's answer now");
        const g = gradedPeak(CFG);
        ok(`  and gradedPeak stays on the CPU: ${g.peakErrFrac.toExponential(3)} from the closed form, against the device's ${dev.w.toExponential(3)} at that same cell -- a factor of ${(dev.w / g.peakErrFrac).toFixed(0)} that accepting a GPU peak would have cost`,
            g.peakErrFrac < 1e-6 && dev.w / g.peakErrFrac > 10,
            `graded ${g.peak.toFixed(6)} vs exact ${g.exact.toFixed(6)}; the header estimated this degradation as 1.35e-7 -> ~4e-6 and the device says ${g.peakErrFrac.toExponential(2)} -> ${dev.w.toExponential(2)}`);
        ok(`*** contraction is NOT what separates the device from the model: it is ${dvE.toExponential(3)} from the uncontracted emulator and ${dvF.toExponential(3)} from the contracted one -- the SAME distance from both ***`,
            Math.abs(dvE - dvF) / dvE < 1e-6 && eVf > 0,
            `the two emulators differ from each other by ${eVf.toExponential(3)}, which the header called "at most 6.3e-8" and is four times that. The CONCLUSION survives and is better supported: whatever the residual is, fma does not explain it`);
        ok(`  the adjudicator accepted the proposal on its own sample (${F.verdict.checked} cells, ${F.verdict.disagreed} disagreeing, worst ${F.verdict.worstRelDiff.toExponential(3)} against tol ${F.verdict.tol.toExponential(0)})`,
            F.verdict.accepted === true && F.fellBack === false && F.verdict.disagreed === 0,
            "proposeAndVerify recomputes a random sample on the CPU; a kernel that agreed everywhere except where it was checked would still be caught by section 2's full-grid scan");
        ok(`  and the shared-trig cap is real: at nT = ${SHARED_CAP * 2} the kernel falls back and SAYS SO in its own label (${F.bigKernel})`,
            /base-wg64\(nT>cap\)/.test(F.bigKernel || ""),
            `above SHARED_CAP the cooperative load would write out of bounds in workgroup memory -- no error, no crash, just wrong numbers. "A fallback nobody can see is a fallback nobody can debug"`);
        report("STILL NOT MEASURED, AND IT IS THE REASON THIS KERNEL EXISTS: SPEED. The map is the slowest " +
               "computation in the lab (441 cells x 4.2 ms) and SwiftShader is a software rasteriser, so nothing " +
               "here times anything. magmap-bench.html remains the only path to that number and it needs a card.");
    }
}

// SABOTAGE LOG -- applied to tools/roundhouse/magmapGpu.mjs, gates run, exit codes read, restored.
//   A  F32_FLOOR put back to the pre-v4405 4.385e-6 -> exit=1, 2 red HERE and 1 red in magmap-selfcheck. This is
//      the state the tree shipped in, and the point is that it now costs something in BOTH places: the device's
//      measured 4.420e-6 is over it, and so is the store-rounded emulator's 4.4196e-6. Before this round neither
//      gate could say so -- one measured without the store and the other allowed 2x on top.
//   B  magAt's analytic derivative replaced by a central difference in f32, which is the failure magmapGpu's own
//      comment predicts ("the step is below the epsilon it differences against and the result loses every
//      digit") -> exit=1, 3 red: the worst cell reads 4.266e+0, the worst cell MOVES OFF THE CENTRE to cell 0,
//      and the adjudicator's sample goes 34 of 34 disagreeing. The second of those is the interesting one -- the
//      architecture's whole justification is that the worst cell is the graded cell, and a broken derivative
//      breaks that property rather than merely the magnitude. (This is a differencing of beta rather than a
//      faithful copy of the reference's own scheme, so it is NOT a reproduction of the 7e-2 that comment cites.)
//   C  the shared-trig cap guard removed, so nT above SHARED_CAP runs the shared kernel with an out-of-bounds
//      cooperative write -> exit=1, 1 red: at nT = 128 the label still says wg128-shared. No error, no crash,
//      wrong numbers from a kernel that looks like it ran, which is exactly what magmapGpu's header says the
//      guard is for -- and the LABEL is what catches it, because the numbers alone would not.
console.log(fails ? "\nFAIL -- " + fails + " check(s)" : "\nALL GREEN");
console.log("unchecked here: SPEED, as above. A REAL card's f32 against SwiftShader's -- the 7.634e-7 residual " +
    "between device and emulator is this device's, and the whole point of F32_FLOOR is to bracket cards nobody " +
    "here owns, so the fleet pages still do work this gate cannot. rho and span beyond the one fixture, which the " +
    "floor's own note says were never swept. And whether the residual is SwiftShader's sqrt(), which is the " +
    "obvious candidate now that fma has been ruled out, and which this round did not isolate.");
process.exit(fails ? 1 : 0);
