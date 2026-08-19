// brain/quadrants.js — v2186
// MULTI-TASKING THE BRAIN VIA GPU QUADRANTS.
//
// The brain already runs several solvers (goal-nav, threat, player-seek) and the
// bridge already merges partial fields from several brain PROCESSES. This adds the
// missing middle: packing several INDEPENDENT nav tasks into ONE GPU grid so a single
// solver dispatch computes them all concurrently, then unpacking per task.
//
// How it stays correct (and why it needs the v2186 impassable-edge feature):
//   · An "atlas" grid is tiled into a rows x cols arrangement of quadrants, each big
//     enough for the largest task, separated by a 1-cell GUTTER.
//   · Gutter cells are set to a huge height. With solver.impassDh set, NO relaxation
//     crosses a gutter, so quadrant B's walls/goals can never leak distance into
//     quadrant A. The single shared distance field is exactly N independent fields.
//   · Each task's goals are offset into its quadrant before solving; results are
//     sliced back out into per-task {fx,fz,dist} at the task's own w x h.
//
// This is real concurrency: one writeBuffer, one set of relaxation dispatches, one
// readback — amortizing the GPU's fixed per-solve overhead (the bench showed ~30ms of
// it) across every packed task instead of paying it N times. On the CPU solver it's
// still a win (one heap init, one cost pass) and keeps the SAME call site.
//
// Usage:
//   import { QuadrantScheduler } from "./quadrants.js";
//   const qs = new QuadrantScheduler(makeSolver);   // makeSolver(w,h,opts) -> solver
//   const results = await qs.solve([
//     { id:"arena",   w:48, h:48, heights:Float32Array, goals:[{gx,gy}] },
//     { id:"corridor",w:32, h:64, heights:Float32Array, goals:[{gx,gy}] },
//     { id:"cave",    w:40, h:40, heights:Float32Array, goals:[{gx,gy}] },
//   ]);
//   // results.get("arena") -> { w, h, fx, fz, dist }

const GUTTER = 1;
// v2186 — gutter height and the impassable threshold must be chosen together:
//   · impassDh must match what a SEPARATE solve of each task would use, so intra-task
//     walls behave identically (the isolation test caught this: a too-high impassDh let
//     packed-solve walls become passable while separate-solve walls weren't).
//   · the gutter jump must EXCEED impassDh so no relaxation ever crosses a gutter.
// The scheduler takes impassDh from the caller (default 2000, matching the maze's
// WALL_H*0.5) and sets the gutter an order of magnitude above it.
const DEFAULT_IMPASS = 2000;

export class QuadrantScheduler {
    // makeSolver(w, h, opts) must return an object with async solve(heights, goals, opts)
    // returning { fx, fz, dist? } — both FlowFieldSolver and FlowFieldSolverCPU qualify.
    constructor(makeSolver, opts = {}) {
        this.makeSolver = makeSolver;
        this.cell = opts.cell ?? 4;
        this.slopeK = opts.slopeK ?? 3.0;
        this.waterK = opts.waterK ?? 25.0;
        this.impassDh = opts.impassDh ?? DEFAULT_IMPASS;   // intra-task wall impassability (must match a separate solve)
        this.gutterH = this.impassDh * 100;                 // gutter jump >> impassDh so gutters are always uncrossable
        this._solver = null; this._aw = 0; this._ah = 0;
        this.lastLayout = null;
    }

    // Choose a near-square rows x cols tiling for n tasks.
    _tiling(n) {
        const cols = Math.ceil(Math.sqrt(n));
        const rows = Math.ceil(n / cols);
        return { rows, cols };
    }

    // Pack tasks into one atlas. Returns { atlasW, atlasH, heights, placements }.
    _pack(tasks) {
        const n = tasks.length;
        const { rows, cols } = this._tiling(n);
        const qW = Math.max(...tasks.map(t => t.w));
        const qH = Math.max(...tasks.map(t => t.h));
        const atlasW = cols * qW + (cols + 1) * GUTTER;
        const atlasH = rows * qH + (rows + 1) * GUTTER;
        const heights = new Float32Array(atlasW * atlasH).fill(this.gutterH);   // gutters = uncrossable
        const placements = [];
        tasks.forEach((t, k) => {
            const r = (k / cols) | 0, c = k % cols;
            const ox = GUTTER + c * (qW + GUTTER);
            const oy = GUTTER + r * (qH + GUTTER);
            // stamp the task's heights into its quadrant
            for (let y = 0; y < t.h; y++) for (let x = 0; x < t.w; x++)
                heights[(oy + y) * atlasW + (ox + x)] = t.heights[y * t.w + x];
            placements.push({ id: t.id, ox, oy, w: t.w, h: t.h, task: t });
        });
        return { atlasW, atlasH, heights, placements };
    }

    async solve(tasks) {
        if (!tasks || !tasks.length) return new Map();
        const { atlasW, atlasH, heights, placements } = this._pack(tasks);

        // (re)build the solver only when the atlas size changes
        if (!this._solver || this._aw !== atlasW || this._ah !== atlasH) {
            if (this._solver && this._solver.destroy) try { this._solver.destroy(); } catch {}
            this._solver = this.makeSolver(atlasW, atlasH, {
                cell: this.cell, slopeK: this.slopeK, waterK: this.waterK,
                // the crux: gutters must be impassable so quadrants don't bleed into each other.
                impassDh: this.impassDh,
            });
            this._aw = atlasW; this._ah = atlasH;
        } else if ("impassDh" in this._solver) {
            this._solver.impassDh = this.impassDh;
        }
        this.lastLayout = { atlasW, atlasH, quadrants: placements.map(p => ({ id: p.id, ox: p.ox, oy: p.oy, w: p.w, h: p.h })) };

        // all goals, offset into their quadrants, solved in ONE pass
        const goals = [];
        for (const p of placements) for (const g of (p.task.goals || []))
            goals.push({ gx: p.ox + (g.gx | 0), gy: p.oy + (g.gy | 0) });

        const field = await this._solver.solve(heights, goals, { wantDist: true, wantFlow: true });

        // unpack per task
        const out = new Map();
        for (const p of placements) {
            const fx = new Float32Array(p.w * p.h), fz = new Float32Array(p.w * p.h), dist = new Float32Array(p.w * p.h);
            for (let y = 0; y < p.h; y++) for (let x = 0; x < p.w; x++) {
                const src = (p.oy + y) * atlasW + (p.ox + x), dst = y * p.w + x;
                fx[dst] = field.fx[src]; fz[dst] = field.fz[src];
                if (field.dist) dist[dst] = field.dist[src];
            }
            out.set(p.id, { w: p.w, h: p.h, fx, fz, dist: field.dist ? dist : null });
        }
        out._atlas = { atlasW, atlasH, tasks: placements.length, cells: atlasW * atlasH };
        return out;
    }
}

export default QuadrantScheduler;
