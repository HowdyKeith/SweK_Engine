#!/usr/bin/env node
// WebGLEngine/tools/ship/physicsShaders-selfcheck.mjs -- v4315, v4318 (the blackbody)
//
// OUR OWN PHYSICS AT LEVEL 11: two shaders that are ours rather than ports, each with an answer the GPU is never
// handed. swk_lyapunov (render/lyapunovWgsl.mjs): the logistic map's Lyapunov exponent, ln 2 at r = 4 -- read back
// off WebGPU through the compute probe, and off BOTH backends through the key pipeline on gfx/device.js; the
// period-3 window dark on both; the WGSL against its CPU twin element for element. The Heidler return-stroke
// current (render/heidlerWgsl.mjs), the lightning: its peak over i0 an exact 1 at the true eta and 1.0667 at the
// published one, both read off the GPU. Then the Chaos race: the Lyapunov look drawn through the fleet path.
// v4318: the blackbody (render/blackbodyWgsl.mjs): Planck's shape and Wien's root found by the device's own Newton,
// x_lambda = 4.965114 and x_nu = 2.821439 read back off WebGPU, and the picture's brightest column on both backends.
"use strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runInEngineOrigin, runWgslCompute, webgpuSkipReason } from "./webgpuHarness.mjs";
import { validateWgsl } from "../../render/wgslSpec.mjs";
import * as L from "../../render/lyapunovWgsl.mjs";
import * as H from "../../render/heidlerWgsl.mjs";
import * as BB from "../../render/blackbodyWgsl.mjs";
import { RACES, LOOKS } from "../../render/fleets.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
let fails = 0;
const ok = (label, cond, detail) => { if (!cond) fails++; console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}${detail ? "   " + detail : ""}`); };
const report = (s) => console.log(`  ----  ${s}`);
const median = (a) => { const s = Array.from(a).sort((x, y) => x - y); return s[s.length >> 1]; };

console.log("\n1. THE TWINS ON THE CPU: the exponent's key, the lightning's two keys, and the period-3 window");
{
    const key = L.probeCpu({ rLo: 4, rHi: 4, samples: 384, warmup: 64, seedLo: 0.05, seedHi: 0.95, cols: 1, rows: 128 });
    ok("swk_lyapunov's twin at r = 4, 128 seeds: the median exponent is ln 2 within 2e-3 (the same bound the GLSL gate holds)", Math.abs(median(key) - L.LN2) < 2e-3, `median ${median(key).toFixed(6)} vs ${L.LN2.toFixed(6)}, |err| ${Math.abs(median(key) - L.LN2).toExponential(2)}`);
    const sweep = L.probeCpu({ ...L.DEFAULTS, cols: 256, rows: 8 });
    const col = (r) => Math.min(255, Math.floor((r - L.DEFAULTS.rLo) / (L.DEFAULTS.rHi - L.DEFAULTS.rLo) * 256));
    const inWindow = [], outside = [];
    for (let c = 0; c < 256; c++) { const r = L.DEFAULTS.rLo + (c + 0.5) / 256 * (L.DEFAULTS.rHi - L.DEFAULTS.rLo); const m = median(Array.from({ length: 8 }, (_, y) => sweep[y * 256 + c])); if (r > L.PERIOD3.lo + 0.003 && r < L.PERIOD3.hi - 0.003) inWindow.push(m); else if (r > 3.95) outside.push(m); }
    // dark ON THE WHOLE: inside the window the period-3 cycle doubles and re-enters chaos in bands before the crisis at
    // 3.8568, so a column or two near the far edge reads positive; the median is the claim, and most columns follow it
    const dark = inWindow.filter((v) => v < 0).length;
    ok("  the period-3 window (r from 1 + sqrt 8 to 3.857) is dark -- negative median exponent, most columns negative -- and r near 4 is bright", inWindow.length > 3 && median(inWindow) < 0 && dark >= inWindow.length * 0.6 && median(outside) > 0.4, `window columns ${col(L.PERIOD3.lo)}..${col(L.PERIOD3.hi)} of 256, median ${median(inWindow).toFixed(3)}, ${dark}/${inWindow.length} dark; near 4: ${median(outside).toFixed(3)}`);
    const k = H.keyCpu(H.PARAMS.first);
    ok("the Heidler twin: at the true eta the peak over i0 is exactly 1; at the published eta 1.0667 -- the formula's 6.7%, not the code's", k.atTrueEta === 1 && Math.abs(k.atStandardEta - 1.0667) < 1e-3, `true ${k.atTrueEta}, standard ${k.atStandardEta.toFixed(4)}, peak at t = ${k.tPeak.toFixed(2)} us`);
    const grid = H.probeCpu({ i0: 30, t1: 19, t2: 485, eta: k.trueEta, tLo: 19 / 50, tHi: 485 * 8, count: 4096, geometric: 1 });
    ok("  on the probe's geometric grid of 4,096 times the twin's maximum reaches 1 within 1e-4 and the ends are near 0", Math.abs(Math.max(...grid) - 1) < 1e-4 && grid[0] < 0.01 && grid[4095] < 0.01, `max ${Math.max(...grid).toFixed(6)}, ends ${grid[0].toExponential(1)} / ${grid[4095].toExponential(1)}`);
    for (const n of ["LYAPUNOV_KEY_WGSL", "LYAPUNOV_LOOK_WGSL"]) ok(`${n} validates`, validateWgsl(L[n]).length === 0, validateWgsl(L[n]).join("; "));
    ok("both probes validate", validateWgsl(L.lyapunovProbeWgsl()).length === 0 && validateWgsl(H.heidlerProbeWgsl()).length === 0);
    ok("the Chaos race exists and its look is the Lyapunov look, with the same uniform list the shader declares", RACES.some((r) => r.name === "Chaos" && r.look === "lyapunov") && LOOKS.lyapunov.uniforms.map((u) => u.name).join() === "viewProj,light,chaos");
}

const skip = webgpuSkipReason();
console.log("\n2. THE PROBES ON WEBGPU: the exponent's key and the lightning's, read back from a compute pass, against the twins");
if (skip) { console.log(`  SKIP  ${skip}`); fails++; }
else {
    const lu = { rLo: 4, rHi: 4, samples: 384, warmup: 64, seedLo: 0.05, seedHi: 0.95, cols: 1, rows: 128 };
    const lr = await runWgslCompute({ code: L.lyapunovProbeWgsl(), entryPoint: "probe", outCount: 128, uniforms: L.packProbeUniforms(lu), workgroups: 2 });
    ok("the Lyapunov probe ran", lr.ok && lr.values && lr.values.length === 128, lr.ok ? "" : (lr.reason || (lr.errors || []).join("; ")));
    if (lr.ok) {
        const m = median(lr.values);
        ok("*** WEBGPU READS ln 2 OFF THE COMPUTE PROBE: median over 128 seeds within 2e-3, from a shader handed r as a coordinate ***", Math.abs(m - L.LN2) < 2e-3, `median ${m.toFixed(6)}, |err| ${Math.abs(m - L.LN2).toExponential(2)}`);
        const twin = L.probeCpu(lu); let maxd = 0; for (let i = 0; i < 128; i++) maxd = Math.max(maxd, Math.abs(twin[i] - lr.values[i]));
        report(`WGSL against the f32 twin, seed by seed: max |diff| ${maxd.toExponential(2)} (a chaotic orbit amplifies the last bit; the KEY is the comparison, the twin is the shape)`);
        ok("  the GPU's exponents and the twin's agree in the mean to 2e-3 (the same key from both)", Math.abs(median(twin) - m) < 2e-3, `twin median ${median(twin).toFixed(6)}`);
    }
    const first = H.PARAMS.first, e = H.etasFor(first);
    const hu = { i0: first.i0, t1: first.t1, t2: first.t2, eta: e.trueEta, tLo: first.t1 / 50, tHi: first.t2 * 8, count: 2048, geometric: 1 };
    const hr = await runWgslCompute({ code: H.heidlerProbeWgsl(), entryPoint: "probe", outCount: 2048, uniforms: H.packProbeUniforms(hu), workgroups: 32 });
    ok("the Heidler probe ran", hr.ok && hr.values && hr.values.length === 2048, hr.ok ? "" : (hr.reason || (hr.errors || []).join("; ")));
    if (hr.ok) {
        const mx = Math.max(...hr.values), twin = H.probeCpu(hu); let maxd = 0; for (let i = 0; i < 2048; i++) maxd = Math.max(maxd, Math.abs(twin[i] - hr.values[i]));
        ok("*** THE LIGHTNING'S PEAK OVER i0 READS 1 OFF WEBGPU (true eta), within 1e-4 ***", Math.abs(mx - 1) < 1e-4, `max ${mx.toFixed(6)} over 2,048 times`);
        ok("  and the whole waveform is the twin's, element for element, to 1e-5", maxd < 1e-5, `max |diff| ${maxd.toExponential(2)}`);
        const hs = await runWgslCompute({ code: H.heidlerProbeWgsl(), entryPoint: "probe", outCount: 2048, uniforms: H.packProbeUniforms({ ...hu, eta: e.standard }), workgroups: 32 });
        ok("  at the PUBLISHED eta the GPU's peak reads 1.0667 -- the reference's own 6.7%, reproduced on the device", hs.ok && Math.abs(Math.max(...hs.values) - 1.0667) < 1e-3, hs.ok ? `max ${Math.max(...hs.values).toFixed(4)}` : "did not run");
    }
}

console.log("\n3. THE KEY ON BOTH BACKENDS: the full-screen picture through gfx/device.js, ln 2 decoded from 16 bits, the window dark");
if (skip) { console.log(`  SKIP  ${skip}`); fails++; }
else {
    const r = await runInEngineOrigin({ engineRoot: ENG, args: { N: 128 }, script: `async (a) => {
        const L = await import("/render/lyapunovWgsl.mjs"); const { requestDevice } = await import("/gfx/device.js");
        const out = {};
        for (const backend of ["webgpu", "webgl2"]) {
            const cv = document.createElement("canvas"); cv.width = a.N; cv.height = a.N;
            const dev = await requestDevice(cv, { backend, offscreen: backend === "webgpu" });
            const key = await L.readKey(dev, { r: 4 });
            const sweep = await L.readKey(dev, {});
            // column medians of the sweep: r across x
            const cols = []; for (let x = 0; x < sweep.width; x++) { const c = []; for (let y = 0; y < sweep.height; y++) c.push(sweep.lams[y * sweep.width + x]); c.sort((p, q) => p - q); cols.push(c[c.length >> 1]); }
            const pic = await L.readKey(dev, { raw: false });
            let lit = 0; for (let i = 0; i < pic.pixels.length; i += 4) if (pic.pixels[i + 1] > 128) lit++;
            out[backend] = { backend: dev.backend, median: key.median, n: key.lams.length, cols, width: sweep.width, litPixels: lit, total: pic.pixels.length / 4 };
        }
        return out;
    }` });
    ok("the harness ran both backends", r.ok && r.result && r.result.webgpu && r.result.webgl2, r.ok ? "" : (r.reason || (r.pageErrors || []).join("; ") || r.error));
    if (r.ok && r.result.webgpu && r.result.webgl2) {
        for (const b of ["webgpu", "webgl2"]) {
            const R = r.result[b];
            ok(`*** ${b}: the key pipeline at r = 4 decodes to ln 2 over ${R.n} pixels, median within 2e-3 ***`, R.backend === b && Math.abs(R.median - L.LN2) < 2e-3, `median ${R.median.toFixed(6)}, |err| ${Math.abs(R.median - L.LN2).toExponential(2)}`);
            const colR = (x) => L.DEFAULTS.rLo + (x + 0.5) / R.width * (L.DEFAULTS.rHi - L.DEFAULTS.rLo);
            const win = R.cols.filter((_, x) => colR(x) > L.PERIOD3.lo + 0.004 && colR(x) < L.PERIOD3.hi - 0.004), hot = R.cols.filter((_, x) => colR(x) > 3.95);
            const dark = win.filter((v) => v < 0).length;
            ok(`  ${b}: the period-3 window is dark (negative median, most columns) and r near 4 bright in the picture the device drew`, win.length >= 2 && median(win) < 0 && dark >= win.length * 0.6 && median(hot) > 0.4, `window median ${median(win).toFixed(3)}, ${dark}/${win.length} columns dark; near 4: ${median(hot).toFixed(3)}`);
            ok(`  ${b}: the colour picture lights the chaotic columns (green channel high) on well under all pixels`, R.litPixels > R.total * 0.3 && R.litPixels < R.total * 0.9, `${R.litPixels} of ${R.total} lit`);
        }
        const A = r.result.webgpu, B = r.result.webgl2; let maxd = 0; for (let x = 0; x < A.cols.length; x++) maxd = Math.max(maxd, Math.abs(A.cols[x] - B.cols[x]));
        ok("the two backends' column medians agree to 3e-2 across the sweep (the same arithmetic, two compilers, a chaotic map)", maxd < 3e-2, `max column diff ${maxd.toExponential(2)}`);
    }
}

console.log("\n4. THE BLACKBODY (v4318): Wien's root found by the device's own Newton, the spectrum against the twin, the peak column on both backends");
{
    const k = BB.keyCpu();
    const t5 = BB.probeCpu({ xLo: 0, xHi: 12, n: 5, count: 3, mode: 1 }), t3 = BB.probeCpu({ xLo: 0, xHi: 12, n: 3, count: 3, mode: 1 });
    ok("the f32 twin's Newton lands on the module's f64 roots to 1e-6: x_lambda 4.965114, x_nu 2.821439, residual 0 at each", Math.abs(t5[0] - k.xLambda) < 1e-6 && Math.abs(t3[0] - k.xNu) < 1e-6 && Math.abs(t5[1]) < 1e-5 && Math.abs(t3[1]) < 1e-5, `twin ${t5[0].toFixed(7)} / ${t3[0].toFixed(7)} vs ${k.xLambda.toFixed(7)} / ${k.xNu.toFixed(7)}`);
    ok("  the probe and the key validate", validateWgsl(BB.blackbodyProbeWgsl()).length === 0 && validateWgsl(BB.BLACKBODY_KEY_WGSL).length === 0);
}
if (skip) { console.log(`  SKIP  ${skip}`); fails++; }
else {
    const k = BB.keyCpu();
    const r5 = await runWgslCompute({ code: BB.blackbodyProbeWgsl(), entryPoint: "probe", outCount: 64, uniforms: BB.packProbeUniforms({ xLo: 0, xHi: 12, n: 5, count: 64, mode: 1 }), workgroups: 1 });
    const r3 = await runWgslCompute({ code: BB.blackbodyProbeWgsl(), entryPoint: "probe", outCount: 64, uniforms: BB.packProbeUniforms({ xLo: 0, xHi: 12, n: 3, count: 64, mode: 1 }), workgroups: 1 });
    ok("the blackbody probe ran in key mode for n = 5 and n = 3", r5.ok && r3.ok && r5.values && r3.values, (r5.ok && r3.ok) ? "" : (r5.reason || r3.reason || (r5.errors || []).join("; ")));
    if (r5.ok && r3.ok) {
        ok("*** WEBGPU FINDS WIEN'S ROOTS ITSELF: x_lambda = 4.965114 and x_nu = 2.821439 within 2e-6 of the f64 module's, residual under 1e-5 ***", Math.abs(r5.values[0] - k.xLambda) < 2e-6 && Math.abs(r3.values[0] - k.xNu) < 2e-6 && Math.abs(r5.values[1]) < 1e-5 && Math.abs(r3.values[1]) < 1e-5, `${r5.values[0].toFixed(7)} (residual ${r5.values[1].toExponential(1)}), ${r3.values[0].toFixed(7)} (residual ${r3.values[1].toExponential(1)})`);
        ok("  the shape at the root is the module's peak (21.2014 for n = 5, 1.42144 for n = 3) to 1e-4 relative", Math.abs(r5.values[2] / k.peakLambda - 1) < 1e-4 && Math.abs(r3.values[2] / k.peakNu - 1) < 1e-4, `${r5.values[2].toFixed(5)}, ${r3.values[2].toFixed(6)}`);
    }
    const gu = { xLo: 0, xHi: 12, n: 5, count: 2048 };
    const gr = await runWgslCompute({ code: BB.blackbodyProbeWgsl(), entryPoint: "probe", outCount: 2048, uniforms: BB.packProbeUniforms(gu), workgroups: 32 });
    if (gr.ok) { const twin = BB.probeCpu(gu); let maxd = 0, bi = 0; for (let i = 0; i < 2048; i++) { maxd = Math.max(maxd, Math.abs(twin[i] - gr.values[i]) / Math.max(1, twin[i])); if (gr.values[i] > gr.values[bi]) bi = i; }
        ok("  the spectrum on a grid of 2,048 is the twin's element for element (1e-5 relative), and its brightest sample sits within a grid step of the root", maxd < 1e-5 && Math.abs(12 * (bi + 0.5) / 2048 - k.xLambda) < 12 / 2048, `max rel |diff| ${maxd.toExponential(2)}, argmax x ${(12 * (bi + 0.5) / 2048).toFixed(4)}`); }
    else ok("the blackbody grid probe ran", false, gr.reason || (gr.errors || []).join("; "));
    const r = await runInEngineOrigin({ engineRoot: ENG, args: { N: 256 }, script: `async (a) => {
        const B = await import("/render/blackbodyWgsl.mjs"); const { requestDevice } = await import("/gfx/device.js");
        const out = {};
        for (const backend of ["webgpu", "webgl2"]) {
            const cv = document.createElement("canvas"); cv.width = a.N; cv.height = a.N;
            const dev = await requestDevice(cv, { backend, offscreen: backend === "webgpu" });
            const k5 = await B.readKey(dev, { n: 5 }), k3 = await B.readKey(dev, { n: 3 }), sweep = await B.readKey(dev, {});
            const pic = await B.readKey(dev, { n: 5, raw: false }); let lit = 0; for (let i = 0; i < pic.pixels.length; i += 4) if (pic.pixels[i] > 128) lit++;
            out[backend] = { backend: dev.backend, bin: k5.binWidth, x5: k5.rows.map((r) => r.peakX), x3: k3.rows.map((r) => r.peakX), peak5: k5.rows.map((r) => r.peak), sweep: sweep.rows.map((r) => [r.n, r.peakX]), lit, total: pic.pixels.length / 4 };
        }
        return out;
    }` });
    ok("the harness ran both backends for the blackbody key", r.ok && r.result && r.result.webgpu && r.result.webgl2, r.ok ? "" : (r.reason || (r.pageErrors || []).join("; ") || r.error));
    if (r.ok && r.result.webgpu && r.result.webgl2) {
        for (const b of ["webgpu", "webgl2"]) {
            const R = r.result[b], med = (a) => a.slice().sort((x, y) => x - y)[a.length >> 1];
            ok(`*** ${b}: the picture's brightest column on every row of n = 5 is Wien's x_lambda to within a column (${R.bin.toFixed(3)}), and on n = 3 x_nu ***`, R.backend === b && R.x5.every((x) => Math.abs(x - k.xLambda) <= R.bin) && R.x3.every((x) => Math.abs(x - k.xNu) <= R.bin), `median ${med(R.x5).toFixed(4)} / ${med(R.x3).toFixed(4)} over ${R.x5.length} rows`);
            ok(`  ${b}: the peak column decodes to 1 (the shape over the device's own root), and the sweep's peak moves with n (x_peak rises with n, row by row)`, R.peak5.every((p) => p > 0.995) && R.sweep.every((s, i) => i === 0 || s[1] <= R.sweep[i - 1][1] + R.bin), `peak ${med(R.peak5).toFixed(4)}; sweep from n ${R.sweep[R.sweep.length - 1][0].toFixed(2)} (x ${R.sweep[R.sweep.length - 1][1].toFixed(2)}) to n ${R.sweep[0][0].toFixed(2)} (x ${R.sweep[0][1].toFixed(2)})`);
            ok(`  ${b}: the colour picture is warm where the spectrum is and dark elsewhere (between a tenth and nine tenths lit)`, R.lit > R.total * 0.1 && R.lit < R.total * 0.9, `${R.lit} of ${R.total}`);
        }
        let maxd = 0; for (let i = 0; i < r.result.webgpu.sweep.length; i++) maxd = Math.max(maxd, Math.abs(r.result.webgpu.sweep[i][1] - r.result.webgl2.sweep[i][1]));
        ok("the two backends' peak columns agree across the sweep to one column", maxd <= r.result.webgpu.bin + 1e-9, `max row diff ${maxd.toFixed(4)}`);
    }
}

// SABOTAGE LOG -- applied, gate run, exit code read, restored. MEASURED at v4315.
//   A  the WGSL exponent's log(abs(r * (1 - 2x))) with the 2 dropped -> exit=1, 6 red: the compute probe's median
//      reads 0.000089 against ln 2, the WebGPU key pipeline 0.000077, the picture never lights, and the two
//      backends' columns part by 0.76 -- because the GLSL (untouched) still reads ln 2 on WebGL2. The CPU twin,
//      untouched, still reads 0.693230: a key the shader is never handed catches the shader.
//   B  the Heidler WGSL with (t/t1) for (t/t1)^2 -> exit=1, 3 red: the peak over i0 reads 0.8508, the waveform
//      differs from the twin by 0.18, and the published-eta peak reads 0.9076 for 1.0667.
//   C  the key's 16 bits written as one 8-bit channel, in both languages -> exit=1, 1 red: WebGL2's decoded median
//      lands 6.9e-3 off ln 2 (a 4/255 bin), the framebuffer measured instead of the shader. WebGPU's floor bin
//      happened to sit within the bound -- an 8-bit quantisation can pass by where the bin edge falls, which is
//      why the encoding is 16 bits and the bound is what the iteration budget earns, not what a byte does.
//   MEASURED at v4318 (the blackbody):
//   D  the WGSL Newton started at x = 1 instead of n -> exit=1, 6 red: the device converges to the TRIVIAL root x = 0 (-1e-7,
//      residual 5e-7 -- a root, the wrong one), the shape there is 0, every row's brightest column is the first, the whole
//      picture is lit, and the backends part by 5.95 (the GLSL, untouched, still finds 4.965). Two sabotages the gate does
//      NOT see, recorded as such: the derivative's sign flipped (x -= f / (1 + n e^-x)) still converges -- a damped step
//      to the same root -- and 2 Newton steps from x = n already land within 2e-6, because Newton is quadratic and n is a
//      good start. The gate grades the ROOT, not the route; a wrong route that arrives is not a wrong answer.
//   E  planckShape with e^x for e^x - 1 -> exit=1, 2 red: the shape at the root reads 21.054 for 21.201 and 1.3368 for 1.4214,
//      and the grid parts from the twin by 31% relative with its peak at x = 5.001. The root lines stay green -- Wien's
//      root is the derivative condition's, which this sabotage does not touch -- which is why the peak is graded too.
console.log(fails ? "\nFAIL -- " + fails + " check(s)" : "\nALL GREEN");
console.log("unchecked here: the Chaos race's PIXELS (fleets-selfcheck draws it with the other nine and grades identity and distinctness; " +
    "nothing here reads an exponent off a hull); the look at its cheaper knobs (96 samples, 32 warmup) against ln 2, which it would miss by " +
    "more than the key's 384 earn; and a real GPU's log(), which SwiftShader's is not.");
process.exit(fails ? 1 : 0);
