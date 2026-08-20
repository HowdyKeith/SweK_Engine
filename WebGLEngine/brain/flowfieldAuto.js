// flowfieldAuto.js -- v2213 -- self-selecting / self-guarding flow-field solver.
//
// WHY THIS EXISTS. The brain has two field solvers: an exact CPU Dijkstra
// (flowfieldCpu.js) and an iterative GPU relaxation (flowfield.js). Since v2156 the
// CPU one is the default because it BENCHMARKED ~50x faster AND exact on the rig's
// grids -- but "the rig's grids" and "the rig's GPU" are not universal. On a bigger
// grid, or a stronger discrete GPU (a 1080 vs an Intel Iris), the parallel relaxation
// can win. Nothing measured that per box; the choice was a static default. This module
// makes it MEASURED, and adds a safety net so a chosen-GPU that later regresses cannot
// strand the brain on a slow field.
//
// It is a DROP-IN for both solvers: same constructor shape (device, w, h, opts), the
// same `async solve(heights, goals, opts) -> { fx?, fz?, dist? }`, the same `destroy()`,
// and it forwards the handful of properties brain.js reads (impassDh, iterCap,
// iterations, lastIters, lastNeeded) to whichever inner solver is live.
//
// TWO MECHANISMS, driven by opts.mode:
//
//   mode "auto"  -- CALIBRATION PROBE. For the first `probeN` solves it runs BOTH
//                   inner solvers on the REAL workload, times each, and measures how
//                   closely the GPU field agrees with the exact CPU field (mean flow
//                   cosine for flow solves; mean 1-relative-error for dist-only solves).
//                   It SERVES THE EXACT CPU FIELD throughout the probe, so no consumer
//                   ever sees an approximate field while we are still deciding. After
//                   probeN samples it keeps the GPU solver only if it is BOTH faster
//                   than CPU (by `margin`) AND accurate enough (agreement >= `cosTol`).
//                   Otherwise it drops the GPU solver entirely and runs CPU.
//
//   mode "gpu"   -- WATCHED GPU. No probe: GPU is live from solve 1, but every solve is
//                   timed and if it exceeds `budgetMs` for `strikes` solves in a row the
//                   solver DEMOTES to CPU permanently (sticky until the grid reshapes,
//                   which rebuilds this wrapper and re-probes/re-arms). A GPU solve that
//                   THROWS demotes immediately and is served from CPU that same tick.
//
// The budget guard measures wall-clock of gpu.solve(). That is why this wrapper builds
// its GPU inner solver WITHOUT pipelined readback: pipelining deliberately hides the
// fixed readback cost by returning last tick's field, which would (a) make the probe
// compare a stale GPU field against a fresh CPU field and (b) blind the guard to the
// very cost it exists to catch. Anyone who explicitly wants the unwatched pipelined
// path still has it via BRAIN_FIELD_SOLVER=gpu-raw (brain.js keeps that wired to the
// raw FlowFieldSolver).

import { FlowFieldSolver } from "./flowfield.js";
import { FlowFieldSolverCPU } from "./flowfieldCpu.js";

const now = () => (globalThis.performance ? performance.now() : Date.now());
let _seq = 0;

// Mean cosine between two flow fields, over cells where BOTH have a non-zero vector.
// 1 = identical direction everywhere; ~0.707 = 45 deg mean error. Mirrors bench.mjs.
function flowCos(a, b, cells) {
    if (!a || !b || !a.fx || !b.fx) return null;
    let cos = 0, n = 0;
    for (let i = 0; i < cells; i++) {
        const ax = a.fx[i], az = a.fz[i], bx = b.fx[i], bz = b.fz[i];
        const la = Math.hypot(ax, az), lb = Math.hypot(bx, bz);
        if (la < 1e-6 || lb < 1e-6) continue;
        cos += (ax * bx + az * bz) / (la * lb); n++;
    }
    return n ? cos / n : null;
}

// For dist-only solves (threat field): mean of (1 - relative error) over reachable
// cells. Returns 0..1 where 1 = the GPU distances match the exact CPU distances. BIG
// (unreachable) cells are skipped so an all-unreachable border can't flatter the score.
function distGoodness(a, b, cells) {
    if (!a || !b || !a.dist || !b.dist) return null;
    let acc = 0, n = 0;
    for (let i = 0; i < cells; i++) {
        const da = a.dist[i], db = b.dist[i];
        if (!Number.isFinite(da) || !Number.isFinite(db) || db >= 1e8) continue;
        acc += 1 - Math.min(1, Math.abs(da - db) / Math.max(db, 1e-3)); n++;
    }
    return n ? acc / n : null;
}

const median = (arr) => {
    const x = [...arr].filter(Number.isFinite).sort((p, q) => p - q);
    return x.length ? x[x.length >> 1] : Infinity;
};

export class FlowFieldSolverAuto {
    constructor(device, w, h, opts = {}) {
        this.w = w;
        this.h = h;
        this.cells = w * h;
        this._label = opts.label || ("field#" + (++_seq) + " " + w + "x" + h);

        // Tuning (all overridable from opts, which brain.js fills from BRAIN_FIELD_* env).
        this.mode     = (opts.mode === "gpu") ? "gpu" : "auto";
        this.budgetMs = Number(opts.budgetMs) > 0 ? Number(opts.budgetMs) : 12;
        this.strikes  = Number(opts.strikes)  > 0 ? Number(opts.strikes)  : 3;
        this.probeN   = Number(opts.probeN)   > 0 ? Number(opts.probeN)   : 6;
        this.cosTol   = Number.isFinite(opts.cosTol) ? Number(opts.cosTol) : 0.95;
        this.margin   = Number.isFinite(opts.margin) ? Number(opts.margin) : 0.9;

        // The CPU solver is always present -- it is the exact reference the probe judges
        // against, the field served during calibration, and the demotion target. The GPU
        // inner solver is built only if a device exists (auto still requires a real
        // adapter; a GPU-less box uses BRAIN_BACKEND=cpu, which never reaches this file).
        // Pipeline is force-OFF here (see header): strip it from the opts we pass down.
        const innerOpts = { ...opts, pipeline: false };
        this.cpu = new FlowFieldSolverCPU(device, w, h, innerOpts);
        this.gpu = device ? new FlowFieldSolver(device, w, h, innerOpts) : null;

        // State machine. auto: undecided, serve CPU, probe. gpu: decided, GPU live, guard.
        this.decided = this.mode === "gpu" || !this.gpu;
        this.active  = (this.mode === "gpu" && this.gpu) ? "gpu" : "cpu";
        this._probe  = [];
        this._strike = 0;
        this._demoted = false;

        if (this.mode === "gpu" && this.gpu) {
            console.log(`[field-auto] ${this._label} WATCHED gpu (budget ${this.budgetMs}ms x${this.strikes} -> demote to cpu)`);
        } else if (this.mode === "auto" && this.gpu) {
            console.log(`[field-auto] ${this._label} PROBING gpu vs cpu for ${this.probeN} solves (serving exact cpu meanwhile)`);
        } else if (this.mode === "auto") {
            console.log(`[field-auto] ${this._label} no gpu device -> cpu`);
        }
    }

    // Human-readable current backend, for telemetry/logs.
    get backend() {
        if (!this.decided) return "auto (probing, serving cpu)";
        if (this.active === "gpu") return "gpu (watched" + (this.mode === "auto" ? ", auto-selected" : "") + ")";
        return "cpu (exact Dijkstra" + (this._demoted ? ", demoted from gpu" : (this.mode === "auto" ? ", auto-selected" : "")) + ")";
    }

    // --- property forwarding so brain.js sees a normal solver -----------------
    // Reads reflect the LIVE inner solver; writes fan out so a later switch stays consistent.
    get iterations() { return (this.active === "gpu" && this.gpu) ? this.gpu.iterations : 0; }
    get lastIters()  { return (this.active === "gpu" && this.gpu) ? this.gpu.lastIters : null; }
    get lastNeeded() { return (this.active === "gpu" && this.gpu) ? this.gpu.lastNeeded : null; }

    get impassDh() { return this.cpu.impassDh; }
    set impassDh(v) { this.cpu.impassDh = v; if (this.gpu) this.gpu.impassDh = v; }

    get iterCap() { return this.gpu ? this.gpu.iterCap : undefined; }
    set iterCap(v) { if (this.gpu) this.gpu.iterCap = v; }

    // --- the decision --------------------------------------------------------
    _decide() {
        const cpuMed = median(this._probe.map(p => p.cpuMs));
        const gpuMed = median(this._probe.map(p => p.gpuMs));
        const goods = this._probe.map(p => p.good).filter(g => g != null);
        const meanGood = goods.length ? goods.reduce((a, b) => a + b, 0) / goods.length : null;

        const faster = Number.isFinite(gpuMed) && gpuMed < cpuMed * this.margin;
        const accurate = meanGood != null && meanGood >= this.cosTol;
        const keepGpu = !!(this.gpu && faster && accurate);

        this.active = keepGpu ? "gpu" : "cpu";
        this.decided = true;

        const why = keepGpu ? "faster+accurate"
                  : (!Number.isFinite(gpuMed) ? "gpu probe failed"
                     : (!faster && !accurate) ? "slower and inaccurate"
                     : !faster ? "not faster" : "inaccurate");
        console.log(
            `[field-auto] ${this._label} PROBE done: cpu ${cpuMed.toFixed(2)}ms vs gpu `
            + (Number.isFinite(gpuMed) ? gpuMed.toFixed(2) + "ms" : "(failed)")
            + ` agree=${meanGood == null ? "n/a" : meanGood.toFixed(3)} (tol ${this.cosTol}) -> `
            + `${this.active.toUpperCase()} (${why})`);

        // If we won't use the GPU solver, free its buffers rather than leave them parked.
        if (!keepGpu) this._releaseGpu();
    }

    _demote(reason) {
        if (this.active !== "gpu") return;
        this.active = "cpu";
        this._demoted = true;
        console.log(`[field-auto] ${this._label} DEMOTED gpu->cpu: ${reason}. Exact CPU Dijkstra now (sticky until grid reshape).`);
        this._releaseGpu();
    }

    _releaseGpu() {
        if (!this.gpu) return;
        const g = this.gpu; this.gpu = null;
        Promise.resolve().then(() => g.destroy()).catch(() => {});
    }

    // --- the solve -----------------------------------------------------------
    async solve(heights, goals, opts = {}) {
        // AUTO probe: run both, time both, measure agreement, SERVE THE EXACT CPU FIELD.
        if (this.mode === "auto" && !this.decided) {
            if (!this.gpu) { this.active = "cpu"; this.decided = true; return await this.cpu.solve(heights, goals, opts); }
            const t0 = now();
            const cpuRes = await this.cpu.solve(heights, goals, opts);
            const cpuMs = now() - t0;
            let gpuMs = Infinity, good = null;
            try {
                const t1 = now();
                const gpuRes = await this.gpu.solve(heights, goals, opts);
                gpuMs = now() - t1;
                good = (cpuRes && cpuRes.fx) ? flowCos(gpuRes, cpuRes, this.cells)
                                             : distGoodness(gpuRes, cpuRes, this.cells);
            } catch (e) {
                gpuMs = Infinity; good = null;
                console.log(`[field-auto] ${this._label} gpu probe solve threw: ${e && e.message}`);
            }
            this._probe.push({ cpuMs, gpuMs, good });
            if (this._probe.length >= this.probeN) this._decide();
            return cpuRes;                                  // exact field, always, during probe
        }

        // WATCHED GPU (either mode "gpu", or "auto" that kept the GPU): time it, guard it.
        if (this.active === "gpu" && this.gpu) {
            const t0 = now();
            let res;
            try {
                res = await this.gpu.solve(heights, goals, opts);
            } catch (e) {
                this._demote("gpu.solve threw: " + (e && e.message));
                return await this.cpu.solve(heights, goals, opts);   // no dropped tick
            }
            const ms = now() - t0;
            if (ms > this.budgetMs) {
                if (++this._strike >= this.strikes) this._demote(`${ms.toFixed(1)}ms > ${this.budgetMs}ms budget x${this.strikes}`);
            } else {
                this._strike = 0;
            }
            return res;
        }

        // Plain CPU (default-decided, or post-demotion).
        return await this.cpu.solve(heights, goals, opts);
    }

    async destroy() {
        try { if (this.gpu) await this.gpu.destroy(); } catch {}
        try { this.cpu.destroy(); } catch {}
        this.gpu = null;
    }
}
