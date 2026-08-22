// WebGLEngine/brain/bench.mjs -- benchmark the GPU Brain's flow-field solver.
//
// This is the first benchmark that measures the BRAIN. webgpu-bench.html times raw
// WebGPU compute; this times the thing the brain actually does every tick: solve a
// cost-weighted flow field over a heightmap toward a set of goals.
//
// It runs the SAME workload through both solvers -- FlowFieldSolver (GPU, iterative
// relaxation) and FlowFieldSolverCPU (exact Dijkstra) -- so you get a speedup number
// AND a correctness number. A fast wrong answer is not a result.
//
//   deno run --allow-read --allow-write --unstable-webgpu brain/bench.mjs
//   deno run ... brain/bench.mjs --sizes 64,96,128,192 --iters 20 --json
//   node brain/bench.mjs --cpu-only          # CPU baseline runs anywhere
//
// Flags:
//   --sizes A,B,C   grid sizes to sweep (default 64,96,128,192)
//   --iters N       timed solves per size (default 20; plus 3 warmup)
//   --cpu-only      skip the GPU path (works under plain node)
//   --gpu-only      skip the CPU baseline (no speedup/agreement, just ms)
//   --json          emit machine-readable JSON instead of a table
//   --seed N        terrain seed (default 1234) -- same seed = same terrain
//   --warmup N      untimed solves before timing (default 5); a JIT pre-warm also runs

import { FlowFieldSolverCPU } from "./flowfieldCpu.js";

function arg(name, dflt) {
    // SOMEBODY ALREADY THOUGHT ABOUT A SECOND RUNTIME HERE -- and made node the FALLBACK. A BROWSER IS NOT
    // NODE. This one only breaks WHEN CALLED rather than on import, which is why it never crashed anything:
    // A BUG THAT WAITS FOR A FUNCTION CALL IS STILL A BUG, it is just politer about when it tells you.
    const argv = (typeof Deno !== "undefined" ? Deno.args
        : (typeof process !== "undefined" && process.argv) ? process.argv.slice(2)
        : []);   // a browser has no argv, and every flag correctly falls back to its default
    const i = argv.indexOf("--" + name);
    if (i === -1) return dflt;
    const v = argv[i + 1];
    return (v == null || v.startsWith("--")) ? true : v;
}
function has(name) {
    // SAME FALLBACK, SAME MISTAKE, ONE FUNCTION LATER -- and I fixed arg() and walked past this because I read
    // the first two grep hits and stopped. MY OWN GATE CAUGHT IT ON THE FIRST RUN, which is the entire argument
    // for writing the gate instead of the patch.
    const argv = (typeof Deno !== "undefined" ? Deno.args
        : (typeof process !== "undefined" && process.argv) ? process.argv.slice(2)
        : []);
    return argv.includes("--" + name);
}

// Deterministic terrain: cheap value-noise so every run/machine benchmarks the same
// world. Not pretty; reproducible, which matters more here.
function makeHeights(w, h, seed) {
    let s = seed >>> 0;
    const rnd = () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
    const coarse = new Float32Array(w * h);
    for (let i = 0; i < coarse.length; i++) coarse[i] = rnd();
    const out = new Float32Array(w * h);
    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            // smooth it a little so slopes (and therefore cost) are meaningful
            let a = 0, n = 0;
            for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
                const nx = x + dx, ny = y + dy;
                if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
                a += coarse[ny * w + nx]; n++;
            }
            out[y * w + x] = (a / n) * 24;   // metres-ish
        }
    }
    return out;
}
function makeGoals(w, h) {
    return [{ gx: (w * 0.75) | 0, gy: (h * 0.5) | 0 }, { gx: (w * 0.2) | 0, gy: (h * 0.8) | 0 }];
}

function stats(ms) {
    const s = [...ms].sort((a, b) => a - b);
    const sum = s.reduce((a, b) => a + b, 0);
    return {
        mean: sum / s.length,
        median: s[(s.length / 2) | 0],
        min: s[0],
        max: s[s.length - 1],
        p95: s[Math.min(s.length - 1, Math.ceil(s.length * 0.95) - 1)],
    };
}

// Do the GPU and CPU fields point the same way? Compare unit flow vectors where both
// are defined. Reported as mean cosine similarity + % of cells agreeing within 45deg.
function agreement(a, b, cells) {
    if (!a || !b || !a.fx || !b.fx) return null;
    let cos = 0, n = 0, close = 0;
    for (let i = 0; i < cells; i++) {
        const ax = a.fx[i], az = a.fz[i], bx = b.fx[i], bz = b.fz[i];
        const la = Math.hypot(ax, az), lb = Math.hypot(bx, bz);
        if (la < 1e-6 || lb < 1e-6) continue;
        const c = (ax * bx + az * bz) / (la * lb);
        cos += c; n++;
        if (c > 0.7071) close++;   // within 45 degrees
    }
    return n ? { meanCos: cos / n, within45Pct: (100 * close / n), compared: n } : null;
}

// v2157 -- The raw table hides the punchline. Fit gpu_ms = fixed + perCell*cells across
// the sweep: if `fixed` dominates, the GPU solve is READBACK-BOUND (mapAsync round-trip),
// not compute-bound, and no grid size will save it. Measured on an Intel Iris: 30.6ms
// fixed + 33ns/cell -- i.e. ~100% overhead. Report it so the tool makes the argument.
function analyze(rows) {
    const withBoth = rows.filter(r => r.cpu && r.gpu);
    if (withBoth.length < 2) return null;
    const fit = (key) => {
        const N = withBoth.length;
        const sx = withBoth.reduce((s, r) => s + r.cells, 0);
        const sy = withBoth.reduce((s, r) => s + r[key].median, 0);
        const sxx = withBoth.reduce((s, r) => s + r.cells * r.cells, 0);
        const sxy = withBoth.reduce((s, r) => s + r.cells * r[key].median, 0);
        const b = (N * sxy - sx * sy) / (N * sxx - sx * sx);
        return { fixedMs: (sy - b * sx) / N, perCellNs: b * 1e6 };
    };
    const g = fit("gpu"), c = fit("cpu");
    // at the largest measured grid, how much of the GPU time is fixed cost?
    const big = withBoth[withBoth.length - 1];
    const overheadPct = 100 * g.fixedMs / big.gpu.median;
    const meanAngleDeg = withBoth
        .filter(r => r.agreement)
        .map(r => Math.acos(Math.max(-1, Math.min(1, r.agreement.meanCos))) * 180 / Math.PI);
    const avgAngle = meanAngleDeg.length ? meanAngleDeg.reduce((a, b) => a + b, 0) / meanAngleDeg.length : null;

    const verdict = [];
    if (overheadPct > 70) verdict.push(`GPU is READBACK-BOUND: ~${g.fixedMs.toFixed(1)}ms fixed per solve (${overheadPct.toFixed(0)}% of the time at ${big.size}^2). Bigger grids will not help.`);
    if (g.perCellNs > c.perCellNs) verdict.push(`GPU marginal cost ${g.perCellNs.toFixed(0)} ns/cell vs CPU ${c.perCellNs.toFixed(0)} ns/cell -- the CPU wins per cell too, so there is no crossover.`);
    if (avgAngle != null && avgAngle > 20) verdict.push(`GPU field is materially wrong: mean flow-direction error ~${avgAngle.toFixed(0)} degrees. A fast wrong field is not a win.`);
    if (!verdict.length) verdict.push("GPU is competitive here.");
    return { gpu: g, cpu: c, overheadPct, meanAngleDeg: avgAngle, verdict };
}

async function timeSolver(solver, heights, goals, iters, opts, warmup) {
    for (let i = 0; i < warmup; i++) await solver.solve(heights, goals, opts);
    const ms = [];
    let last = null;
    for (let i = 0; i < iters; i++) {
        const t0 = performance.now();
        last = await solver.solve(heights, goals, opts);
        ms.push(performance.now() - t0);
    }
    return { ms, last };
}

async function getGpuDevice() {
    if (typeof navigator === "undefined" || !navigator.gpu) return null;
    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) return null;
    return { device: await adapter.requestDevice(), name: (adapter.info && (adapter.info.device || adapter.info.vendor)) || "gpu" };
}

async function main() {
    const sizes = String(arg("sizes", "64,96,128,192")).split(",").map(n => parseInt(n, 10)).filter(Boolean);
    const iters = parseInt(String(arg("iters", "20")), 10);
    const seed = parseInt(String(arg("seed", "1234")), 10);
    const warmup = parseInt(String(arg("warmup", "5")), 10);
    const cpuOnly = has("cpu-only"), gpuOnly = has("gpu-only"), asJson = has("json");

    // Pre-sweep JIT warm. Without this the FIRST size in the sweep pays for JIT and can
    // read SLOWER than a larger grid (observed: 32^2 @4.09ms vs 64^2 @1.02ms). Burn a
    // throwaway solve so every reported size is measured on warm code.
    {
        const wS = new FlowFieldSolverCPU(null, 48, 48, { cell: 4 });
        const wH = makeHeights(48, 48, seed), wG = makeGoals(48, 48);
        for (let i = 0; i < 8; i++) await wS.solve(wH, wG, { wantFlow: true, wantDist: true });
    }

    let gpu = null;
    if (!cpuOnly) {
        gpu = await getGpuDevice();
        if (!gpu && !asJson) console.log("[bench] no WebGPU adapter -- CPU only. (Deno needs --unstable-webgpu; plain node has no GPU.)");
    }

    const rows = [];
    for (const n of sizes) {
        const heights = makeHeights(n, n, seed);
        const goals = makeGoals(n, n);
        const cells = n * n;
        const opts = { wantFlow: true, wantDist: true };

        let cpu = null, gpuRes = null;
        if (!gpuOnly) {
            const s = new FlowFieldSolverCPU(null, n, n, { cell: 4 });
            cpu = await timeSolver(s, heights, goals, iters, opts, warmup);
        }
        if (gpu) {
            const { FlowFieldSolver } = await import("./flowfield.js");
            const s = new FlowFieldSolver(gpu.device, n, n, { cell: 4 });
            gpuRes = await timeSolver(s, heights, goals, iters, opts, warmup);
        }

        const row = { size: n, cells, iters };
        if (cpu) { row.cpu = stats(cpu.ms); row.cpuCellsPerSec = cells / (row.cpu.median / 1000); }
        if (gpuRes) { row.gpu = stats(gpuRes.ms); row.gpuCellsPerSec = cells / (row.gpu.median / 1000); }
        if (cpu && gpuRes) {
            row.speedup = row.cpu.median / row.gpu.median;   // median: sub-ms timings are noise-heavy
            row.agreement = agreement(gpuRes.last, cpu.last, cells);
        }
        rows.push(row);
    }

    const analysis = analyze(rows);
    const out = { ok: true, seed, gpu: gpu ? gpu.name : null, rows, analysis };
    if (asJson) { console.log(JSON.stringify(out, null, 2)); return; }

    console.log("");
    console.log(`GPU Brain flow-field benchmark  (seed=${seed}, ${iters} timed solves/size, ${warmup} warmup + JIT pre-warm)`);
    console.log(`gpu: ${gpu ? gpu.name : "(none - CPU only)"}`);
    console.log("");
    const pad = (s, n) => String(s).padStart(n);
    console.log("size    cells  cpu med  gpu med  speedup  agree(cos)  within45   cpu p95");
    for (const r of rows) {
        console.log(
            pad(r.size + "^2", 6), pad(r.cells, 7),
            pad(r.cpu ? r.cpu.median.toFixed(2) : "-", 8),
            pad(r.gpu ? r.gpu.median.toFixed(2) : "-", 8),
            pad(r.speedup ? r.speedup.toFixed(2) + "x" : "-", 8),
            pad(r.agreement ? r.agreement.meanCos.toFixed(3) : "-", 11),
            pad(r.agreement ? r.agreement.within45Pct.toFixed(1) + "%" : "-", 9),
            pad(r.cpu ? r.cpu.p95.toFixed(2) : "-", 9),
        );
    }
    console.log("");
    console.log("cpu = exact Dijkstra (ground truth). gpu = iterative relaxation.");
    console.log("agreement compares flow DIRECTION per cell; a fast wrong field is not a win.");
    if (analysis) {
        console.log("");
        console.log("analysis:");
        console.log(`  gpu_ms ~= ${analysis.gpu.fixedMs.toFixed(1)} + ${analysis.gpu.perCellNs.toFixed(0)} ns/cell   (fixed = submit + mapAsync readback)`);
        console.log(`  cpu_ms ~= ${analysis.cpu.fixedMs.toFixed(2)} + ${analysis.cpu.perCellNs.toFixed(0)} ns/cell`);
        for (const v of analysis.verdict) console.log("  * " + v);
    }
}

if (typeof Deno !== "undefined" || (typeof process !== "undefined" && process.argv[1] && process.argv[1].endsWith("bench.mjs"))) {
    main().catch((e) => { console.error("[bench] failed:", (e && e.stack) || e); });
}

export { makeHeights, makeGoals, agreement, stats, analyze };
