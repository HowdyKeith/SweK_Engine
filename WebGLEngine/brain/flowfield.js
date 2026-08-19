// flowfield.js -- GPU flow-field solver for the SweK GPU Brain v1.
//
// Input : height grid (w*h f32, world Y per cell) + goal cells
// Output: flow vectors (fx, fz per cell) pointing "downhill" along an
//         integration field of cost-weighted distance to the nearest goal.
//
// Three kernels, all in one WGSL module:
//   k_cost  -- per-cell traversal cost from terrain: 1 + slopePenalty,
//              +waterPenalty at/below sea level (WATER_LEVEL = 8, matching
//              the engine). Steep = expensive, water = very expensive, so
//              the relaxed distance field routes around both.
//   k_relax -- one Jacobi min-plus iteration:
//              dst[i] = min(src[i], min(4-neighbors of src) + cost[i]*cell)
//              Ping-pong buffers; N iterations propagate distance N cells,
//              so we run ~1.7*max(w,h) iterations for full coverage.
//              (Brushfire/Dijkstra done the embarrassingly-parallel way:
//              more total work than a heap, but each pass is one dispatch
//              of w*h threads -- a 1070 eats hundreds of these per frame.)
//   k_flow  -- per-cell direction toward the lowest-distance neighbor
//              (8-neighborhood), normalized. Zero vector where the field
//              is unreachable/flat.
//
// Buffers are created once per grid size and reused; per-solve uploads go
// through queue.writeBuffer (heights + seeded distance), readback through
// a persistent staging buffer. Same discipline as the voxelrenderer VR3
// patch: no per-tick GPU object churn.

const WATER_LEVEL = 8.0;
const BIG = 1e9;

const WGSL = /* wgsl */ `
struct Params {
    w: u32,
    h: u32,
    cell: f32,
    slopeK: f32,
    waterK: f32,
    impassDh: f32,   // v2186 — max traversable per-cell height jump (0 = disabled). Uses a former pad slot; struct size unchanged.
    ff: u32,         // v2187 — feed-forward convergence tracking on(1)/off(0). Former _pad1 slot; struct size unchanged.
    _pad2: f32,
};
@group(0) @binding(0) var<uniform> P: Params;
@group(0) @binding(1) var<storage, read>       heights: array<f32>;
@group(0) @binding(2) var<storage, read_write> cost:    array<f32>;
@group(0) @binding(3) var<storage, read>       distSrc: array<f32>;
@group(0) @binding(4) var<storage, read_write> distDst: array<f32>;
@group(0) @binding(5) var<storage, read_write> flow:    array<vec2<f32>>;
// v2187 — sweepMeta[0] = "did this sweep change anything" flag; sweepMeta[1] = count of sweeps
// that changed something. The relaxation is monotone (each cell only ever decreases),
// so once a whole sweep changes nothing the field is at its fixed point and no later
// sweep changes anything either. Therefore sweepMeta[1] after the loop == the exact number
// of iterations this field NEEDED. We read that one u32 back on the readback we already
// do, and feed it forward to size the next solve's loop. No per-iteration stall.
@group(0) @binding(6) var<storage, read_write> sweepMeta: array<atomic<u32>, 2>;

fn idx(x: i32, y: i32) -> i32 { return y * i32(P.w) + x; }
fn inb(x: i32, y: i32) -> bool { return x >= 0 && y >= 0 && x < i32(P.w) && y < i32(P.h); }

@compute @workgroup_size(8, 8)
fn k_cost(@builtin(global_invocation_id) gid: vec3<u32>) {
    let x = i32(gid.x); let y = i32(gid.y);
    if (!inb(x, y)) { return; }
    let i = idx(x, y);
    let hc = heights[i];
    // v2186 — ignore impassable neighbours in the slope measure (parity with the CPU
    // solver), so a cell beside a wall/quadrant-gutter isn't mispriced. bigC disables
    // the filter when impassDh<=0.
    var slope = 0.0;
    let bigC = select(1.0e30, P.impassDh, P.impassDh > 0.0);
    if (inb(x - 1, y)) { let d = abs(heights[idx(x - 1, y)] - hc); if (d <= bigC) { slope = max(slope, d); } }
    if (inb(x + 1, y)) { let d = abs(heights[idx(x + 1, y)] - hc); if (d <= bigC) { slope = max(slope, d); } }
    if (inb(x, y - 1)) { let d = abs(heights[idx(x, y - 1)] - hc); if (d <= bigC) { slope = max(slope, d); } }
    if (inb(x, y + 1)) { let d = abs(heights[idx(x, y + 1)] - hc); if (d <= bigC) { slope = max(slope, d); } }
    slope = slope / max(P.cell, 0.001);
    var c = 1.0 + slope * P.slopeK;
    if (hc <= ${WATER_LEVEL}) { c = c + P.waterK; }
    cost[i] = c;
}

@compute @workgroup_size(8, 8)
fn k_relax(@builtin(global_invocation_id) gid: vec3<u32>) {
    let x = i32(gid.x); let y = i32(gid.y);
    if (!inb(x, y)) { return; }
    let i = idx(x, y);
    let hc = heights[i];
    // v2186 -- impassable-edge gate: a neighbour whose height differs by more than
    // P.impassDh cannot propagate distance across the boundary. impassDh<=0 disables it
    // (every |dh| < a huge number), so terrain behaviour is unchanged by default. This
    // makes walls truly uncrossable, so the distance field has NO floor local minima and
    // any gradient follower (e.g. the brain-maze walker) can always descend to the goal.
    let big = select(1.0e30, P.impassDh, P.impassDh > 0.0);
    var best = distSrc[i];
    if (inb(x - 1, y) && abs(heights[idx(x - 1, y)] - hc) <= big) { best = min(best, distSrc[idx(x - 1, y)]); }
    if (inb(x + 1, y) && abs(heights[idx(x + 1, y)] - hc) <= big) { best = min(best, distSrc[idx(x + 1, y)]); }
    if (inb(x, y - 1) && abs(heights[idx(x, y - 1)] - hc) <= big) { best = min(best, distSrc[idx(x, y - 1)]); }
    if (inb(x, y + 1) && abs(heights[idx(x, y + 1)] - hc) <= big) { best = min(best, distSrc[idx(x, y + 1)]); }
    let nd = min(distSrc[i], best + cost[i] * P.cell);
    distDst[i] = nd;
    // v2187 — flag a meaningful decrease (ignore sub-1e-3 float jitter so the counter
    // doesn't chase noise). Only when feed-forward is on, so the default-off path is
    // exactly the original kernel with no added atomic traffic.
    if (P.ff != 0u && (distSrc[i] - nd) > 1.0e-3) { atomicStore(&sweepMeta[0], 1u); }
}

// v2187 — one thread, run once after each relax sweep. atomicExchange reads-and-clears
// the sweep's "changed" flag; if it was set, bump the sweep counter. Ordered after its
// relax and before the next relax by WebGPU's between-dispatch storage visibility (the
// same guarantee the ping-pong relaxation already relies on), so there is no race.
@compute @workgroup_size(1)
fn k_tally() {
    if (atomicExchange(&sweepMeta[0], 0u) != 0u) { atomicAdd(&sweepMeta[1], 1u); }
}

@compute @workgroup_size(8, 8)
fn k_flow(@builtin(global_invocation_id) gid: vec3<u32>) {
    let x = i32(gid.x); let y = i32(gid.y);
    if (!inb(x, y)) { return; }
    let i = idx(x, y);
    let here = distSrc[i];
    var best = here;
    var dir = vec2<f32>(0.0, 0.0);
    for (var dy = -1; dy <= 1; dy = dy + 1) {
        for (var dx = -1; dx <= 1; dx = dx + 1) {
            if (dx == 0 && dy == 0) { continue; }
            if (!inb(x + dx, y + dy)) { continue; }
            let d = distSrc[idx(x + dx, y + dy)];
            if (d < best) { best = d; dir = vec2<f32>(f32(dx), f32(dy)); }
        }
    }
    if (best < here && (dir.x != 0.0 || dir.y != 0.0)) {
        flow[i] = normalize(dir);
    } else {
        flow[i] = vec2<f32>(0.0, 0.0);
    }
}
`;

export class FlowFieldSolver {
    constructor(device, w, h, opts = {}) {
        this.device = device;
        this.w = w;
        this.h = h;
        this.cells = w * h;
        this.slopeK = opts.slopeK ?? 3.0;
        this.waterK = opts.waterK ?? 25.0;
        this.impassDh = opts.impassDh ?? 0.0;   // v2186 — hard wall impassability (0 = off)
        this.iterations = opts.iterations ?? Math.ceil(Math.max(w, h) * 1.7);

        const d = device;
        const cellsBytes = this.cells * 4;
        const S = GPUBufferUsage.STORAGE;

        this.uParams  = d.createBuffer({ size: 32, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
        this.bHeights = d.createBuffer({ size: cellsBytes, usage: S | GPUBufferUsage.COPY_DST });
        this.bCost    = d.createBuffer({ size: cellsBytes, usage: S });
        // v2150 -- bDistA is a copy SOURCE in the distance readback (threat field:
        // copyBufferToBuffer(bDistA -> bStageD)), but was created without COPY_SRC, so
        // every wantDist readback failed: "Usage flags BufferUsages(COPY_DST | STORAGE)
        // ... do not contain required usage flags BufferUsages(COPY_SRC)". The threat
        // field silently came back null the moment a kaiju existed. Both ping-pong
        // buffers get COPY_SRC so either can be the final/readback target.
        this.bDistA   = d.createBuffer({ size: cellsBytes, usage: S | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC });
        this.bDistB   = d.createBuffer({ size: cellsBytes, usage: S | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC });
        this.bFlow    = d.createBuffer({ size: this.cells * 8, usage: S | GPUBufferUsage.COPY_SRC });
        // v2187 — meta[0]=changed flag, meta[1]=sweep-with-change count. COPY_DST to zero
        // it each solve, COPY_SRC to read the count back with the field.
        this.bMeta    = d.createBuffer({ size: 8, usage: S | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC });
        this.bStage   = d.createBuffer({ size: this.cells * 8, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
        // v2 -- second staging buffer for distance readback (threat fields
        // read the relaxed distances directly; no flow pass needed)
        this.bStageD  = d.createBuffer({ size: this.cells * 4, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });

        // v2187 -- PIPELINED (double-buffered) READBACK, opt-in via opts.pipeline.
        //
        // The bench's ~29.7ms fixed cost per solve is NOT bandwidth -- it is the
        // `await bStage.mapAsync()` ROUND TRIP: the CPU blocks until the GPU drains
        // the queue. Quadrant packing amortizes that stall across tasks; this removes
        // it from the critical path entirely.
        //
        // Two staging slots. On tick N we submit into slot N%2 and kick its mapAsync
        // WITHOUT awaiting, then drain slot (N-1)%2 -- whose GPU work has had a whole
        // tick to finish, so the await returns effectively free. Slot N%2 was last
        // touched on tick N-2 and drained on tick N-1, so we never copy into a buffer
        // that is mapped or map-pending (the state machine's one real hazard).
        //
        // THE TRADE: solve() returns the field for the PREVIOUS call's heights+goals.
        // One snapshot of latency. For nav/flow that is invisible (the field already
        // lags the snapshot it was built from). Callers that need the field for the
        // heights they just passed must leave pipeline off. The first call returns
        // null (nothing in flight yet) -- the same "no field this tick" contract
        // solve() already has for an empty goal set.
        this.pipeline = opts.pipeline === true;
        const mkStageMeta = () => d.createBuffer({ size: 8, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
        const mkSlot = (stage, stageD) => ({ stage, stageD, stageMeta: mkStageMeta(), pending: null });
        this._slots = [mkSlot(this.bStage, this.bStageD)];
        if (this.pipeline) {
            this._slots.push(mkSlot(
                d.createBuffer({ size: this.cells * 8, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ }),
                d.createBuffer({ size: this.cells * 4, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ }),
            ));
        }
        this._tick = 0;

        // v2187 — FEED-FORWARD ITERATION CONTROLLER.
        // The fixed ceil(max(w,h)*1.7) is wrong in two directions: it wastes sweeps on
        // open terrain that converges early, and (worse) UNDER-runs on mazes whose
        // geodesic is longer than the diameter -- the likely source of the bench's
        // "20% of cells >45deg off". This controller sizes each solve from how many
        // sweeps the LAST solve actually needed (meta[1]).
        //
        // It is ON by default because its SAFE half cannot make things worse: the cap
        // starts at exactly today's heuristic, so the loop can only SHRINK below it
        // (pure speed win, identical field). Growing PAST the heuristic -- the accuracy
        // fix for mazes -- trades speed for correctness, so it only happens when the
        // caller RAISES iterCap (opts.iterCap / BRAIN_FIELD_ITER_CAP). Either way the
        // controller runs every tick; it is never dormant.
        this.feedForward = opts.feedForward !== false;
        this._iterCap = Math.max(1, opts.iterCap ?? this.iterations);   // never exceed this many sweeps
        this._iterMin = Math.max(2, opts.iterMin ?? 8);                 // never fewer (small fields still need a few)
        this._plannedIters = Math.min(this.iterations, this._iterCap);  // first solve == today's fixed count
        this.lastIters = this._plannedIters;                            // observability: what the last solve ran
        this.lastNeeded = null;                                         // observability: K the last solve reported

        // v2204 -- a PUBLIC way to raise the cap per solve. Until now the only lever was the Deno brain's
        // BRAIN_FIELD_ITER_CAP env var, so a caller that KNOWS its field is a maze -- brain-maze.html, whose
        // whole purpose is to be a lie detector for the solver -- had no way to ask for enough sweeps. A
        // 4-connected geodesic visits at most w*h cells, so w*h sweeps is the true upper bound; the
        // feed-forward controller then settles at `needed + margin` after one solve, so raising the cap
        // costs one truncated frame, not every frame.

        const mod = d.createShaderModule({ code: WGSL });
        // v2146 -- was layout:"auto", which prunes bindings each entry point does
        // NOT reference (k_cost uses 3, k_relax/k_flow use 4), so binding all 6
        // buffers threw "bindings in descriptor (6) != layout (3/4)". Use ONE
        // explicit layout with all 6 bindings, shared by every pipeline, so the
        // single _bg() that binds 0..5 always matches.
        const bgl = d.createBindGroupLayout({
            entries: [
                { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: "uniform" } },
                { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: "read-only-storage" } },
                { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: "storage" } },
                { binding: 3, visibility: GPUShaderStage.COMPUTE, buffer: { type: "read-only-storage" } },
                { binding: 4, visibility: GPUShaderStage.COMPUTE, buffer: { type: "storage" } },
                { binding: 5, visibility: GPUShaderStage.COMPUTE, buffer: { type: "storage" } },
                { binding: 6, visibility: GPUShaderStage.COMPUTE, buffer: { type: "storage" } },   // v2187 — meta (atomics)
            ],
        });
        const pipeLayout = d.createPipelineLayout({ bindGroupLayouts: [bgl] });
        this._bgl = bgl;
        this.pCost  = d.createComputePipeline({ layout: pipeLayout, compute: { module: mod, entryPoint: "k_cost" } });
        this.pRelax = d.createComputePipeline({ layout: pipeLayout, compute: { module: mod, entryPoint: "k_relax" } });
        this.pFlow  = d.createComputePipeline({ layout: pipeLayout, compute: { module: mod, entryPoint: "k_flow" } });
        this.pTally = d.createComputePipeline({ layout: pipeLayout, compute: { module: mod, entryPoint: "k_tally" } });   // v2187

        // Bind groups: relax ping (A->B) and pong (B->A); cost and flow read
        // whichever dist buffer is "current" -- we arrange iteration count so
        // the final field lands in A, and k_flow reads distSrc = A.
        this._bg = (pipe, distSrc, distDst) => d.createBindGroup({
            layout: this._bgl,
            entries: [
                { binding: 0, resource: { buffer: this.uParams } },
                { binding: 1, resource: { buffer: this.bHeights } },
                { binding: 2, resource: { buffer: this.bCost } },
                { binding: 3, resource: { buffer: distSrc } },
                { binding: 4, resource: { buffer: distDst } },
                { binding: 5, resource: { buffer: this.bFlow } },
                { binding: 6, resource: { buffer: this.bMeta } },
            ],
        });
        this.bgCost    = this._bg(this.pCost,  this.bDistA, this.bDistB);
        this.bgRelaxAB = this._bg(this.pRelax, this.bDistA, this.bDistB);
        this.bgRelaxBA = this._bg(this.pRelax, this.bDistB, this.bDistA);
        this.bgFlowA   = this._bg(this.pFlow,  this.bDistA, this.bDistB);
        this.bgTally   = this._bg(this.pTally, this.bDistA, this.bDistB);   // v2187 — only uses binding 6

        // v2187 — params are refreshed PER SOLVE, not once here. The old code wrote
        // uParams only in the constructor, so a later `solver.impassDh = x` (which
        // brain.js and the quadrant scheduler both do each tick) never reached the GPU
        // -- the maze's impassable walls silently did nothing on the GPU backend. Now
        // _writeParams() runs at the top of every solve, picking up impassDh AND the ff
        // flag. cell is fixed per grid, captured once.
        this._cell = opts.cell ?? 4.0;
        this._pbuf = new ArrayBuffer(32);
        this._writeParams();

        this._seed = new Float32Array(this.cells);
        this._groups = [Math.ceil(w / 8), Math.ceil(h / 8)];
    }

    // The cap the controller may grow to. Setting it never shrinks the current plan below `iterMin`.
    get iterCap() { return this._iterCap; }
    set iterCap(n) {
        const v = Math.max(1, n | 0);
        if (v === this._iterCap) return;
        this._iterCap = v;
        this._plannedIters = Math.max(this._iterMin, Math.min(this._plannedIters, v));
    }

    // v2187 — pack the dynamic params (impassDh, ff) and upload. Cheap: 32 bytes.
    _writeParams() {
        const f = new Float32Array(this._pbuf), u = new Uint32Array(this._pbuf);
        u[0] = this.w; u[1] = this.h; f[2] = this._cell; f[3] = this.slopeK; f[4] = this.waterK;
        f[5] = this.impassDh; u[6] = this.feedForward ? 1 : 0;
        this.device.queue.writeBuffer(this.uParams, 0, this._pbuf);
    }

    // v2187 — feed-forward update: size the next solve from what this one needed.
    // `needed` (K) is the exact sweep count meta[1] reported; `ran` is how many we ran.
    _updateIters(needed, ran) {
        this.lastNeeded = needed;
        if (needed >= ran) {
            // Still converging when we hit the cap -- the field is truncated. Grow toward
            // the cap. At the default cap (= heuristic) this just pins at the heuristic:
            // exactly today's behaviour, never worse. Raise iterCap to let it converge.
            this._plannedIters = Math.min(ran * 2, this._iterCap);
        } else {
            // Converged with room to spare. Settle just above K with a small margin for
            // terrain jitter, so a slightly harder next field still converges in one tick.
            const margin = Math.max(4, Math.ceil(needed * 0.15));
            this._plannedIters = Math.max(this._iterMin, Math.min(needed + margin, this._iterCap));
        }
    }

    // heights: Float32Array(cells); goals: [{gx, gy}] in grid coords.
    // opts.wantFlow (default true)  -> { fx, fz } gradient readback
    // opts.wantDist (default false) -> { dist } relaxed-distance readback
    // A threat field is just solve(heights, threatCells, { wantFlow:false,
    // wantDist:true }) -- distance-to-nearest-threat along TRAVERSABLE
    // paths, so a wall between you and a kaiju genuinely reads as safety.
    // Returns { fx?, fz?, dist? } (grid-major, y*w+x).
    async solve(heights, goals, opts = {}) {
        const wantFlow = opts.wantFlow !== false;
        const wantDist = opts.wantDist === true;
        const d = this.device;
        this._writeParams();   // v2187 — pick up any impassDh / ff change since construction
        d.queue.writeBuffer(this.bHeights, 0, heights.buffer, heights.byteOffset, this.cells * 4);
        if (this.feedForward) d.queue.writeBuffer(this.bMeta, 0, new Uint32Array([0, 0]));   // reset flag+count before sweep 1

        this._seed.fill(BIG);
        let seeded = 0;
        for (const g of goals) {
            const gx = Math.max(0, Math.min(this.w - 1, g.gx | 0));
            const gy = Math.max(0, Math.min(this.h - 1, g.gy | 0));
            this._seed[gy * this.w + gx] = 0;
            seeded++;
        }
        if (!seeded) return null;                 // no goals, no field
        d.queue.writeBuffer(this.bDistA, 0, this._seed);
        d.queue.writeBuffer(this.bDistB, 0, this._seed);

        const enc = d.createCommandEncoder();
        {
            const p = enc.beginComputePass();
            p.setPipeline(this.pCost); p.setBindGroup(0, this.bgCost);
            p.dispatchWorkgroups(this._groups[0], this._groups[1]);
            // v2187 — run the feed-forward planned count, not the fixed heuristic. Even
            // so the final result lands back in A (k_flow reads distSrc=A). The tally
            // dispatch after each relax converts the sweep's change-flag into a count.
            const ran = this._plannedIters + (this._plannedIters % 2);
            this.lastIters = ran;
            for (let i = 0; i < ran; i++) {
                p.setPipeline(this.pRelax);
                p.setBindGroup(0, (i % 2 === 0) ? this.bgRelaxAB : this.bgRelaxBA);
                p.dispatchWorkgroups(this._groups[0], this._groups[1]);
                if (this.feedForward) {
                    p.setPipeline(this.pTally); p.setBindGroup(0, this.bgTally);
                    p.dispatchWorkgroups(1, 1);
                }
            }
            if (wantFlow) {
                p.setPipeline(this.pFlow); p.setBindGroup(0, this.bgFlowA);
                p.dispatchWorkgroups(this._groups[0], this._groups[1]);
            }
            p.end();
        }
        // v2187 -- copy into THIS tick's slot (slot 0 always, when not pipelined).
        const slot = this._slots[this._tick % this._slots.length];
        if (wantFlow) enc.copyBufferToBuffer(this.bFlow, 0, slot.stage, 0, this.cells * 8);
        if (wantDist) enc.copyBufferToBuffer(this.bDistA, 0, slot.stageD, 0, this.cells * 4);
        if (this.feedForward) enc.copyBufferToBuffer(this.bMeta, 0, slot.stageMeta, 0, 8);
        d.queue.submit([enc.finish()]);
        const ran = this.lastIters;   // captured for the controller when this slot drains

        if (!this.pipeline) {
            // Unchanged behaviour: block on this tick's own result.
            slot.pending = { wantFlow, wantDist, ran, maps: this._kickMaps(slot, wantFlow, wantDist) };
            return await this._drain(slot);
        }

        // Pipelined: kick the mapping and DO NOT await it. The GPU has until the
        // next tick to finish; we go collect the previous tick's field instead.
        slot.pending = { wantFlow, wantDist, ran, maps: this._kickMaps(slot, wantFlow, wantDist) };
        const prev = this._slots[(this._tick + 1) % this._slots.length];
        this._tick++;
        if (!prev.pending) return null;          // warmup: nothing in flight yet
        return await this._drain(prev);
    }

    // Begin mapping a slot's staging buffers. Returns the promises; awaiting them
    // is the caller's business (that separation is the whole point).
    _kickMaps(slot, wantFlow, wantDist) {
        const maps = {};
        if (wantFlow) maps.flow = slot.stage.mapAsync(GPUMapMode.READ);
        if (wantDist) maps.dist = slot.stageD.mapAsync(GPUMapMode.READ);
        if (this.feedForward) maps.meta = slot.stageMeta.mapAsync(GPUMapMode.READ);
        return maps;
    }

    // Await a slot's maps, copy the data out, unmap, and free the slot for reuse.
    // Uses the flags captured AT SUBMIT TIME, not the current call's -- a caller may
    // ask for {flow} one tick and {dist} the next, and the slot must be read the way
    // it was written.
    async _drain(slot) {
        const p = slot.pending;
        if (!p) return null;
        slot.pending = null;                     // clear first: a throw must not strand the slot
        const out = {};
        if (p.wantFlow) {
            await p.maps.flow;
            const packed = new Float32Array(slot.stage.getMappedRange().slice(0));
            slot.stage.unmap();
            const fx = new Float32Array(this.cells), fz = new Float32Array(this.cells);
            for (let i = 0; i < this.cells; i++) { fx[i] = packed[i * 2]; fz[i] = packed[i * 2 + 1]; }
            out.fx = fx; out.fz = fz;
        }
        if (p.wantDist) {
            await p.maps.dist;
            out.dist = new Float32Array(slot.stageD.getMappedRange().slice(0));
            slot.stageD.unmap();
        }
        if (this.feedForward && p.maps.meta) {
            await p.maps.meta;
            const needed = new Uint32Array(slot.stageMeta.getMappedRange())[1];   // meta[1] = sweeps that changed
            slot.stageMeta.unmap();
            this._updateIters(needed, p.ran);   // size the NEXT solve from what this one needed
        }
        return out;
    }

    // v2187 -- flush anything still in flight (shutdown, or before a grid resize).
    // Returns the last field if one was pending, else null.
    async drain() {
        let last = null;
        for (let i = 0; i < this._slots.length; i++) {
            const s = this._slots[(this._tick + i) % this._slots.length];
            if (s.pending) last = await this._drain(s);
        }
        return last;
    }

    // v2187 -- symmetry with FlowFieldSolverCPU.destroy(); quadrants.js calls it when
    // the atlas resizes. Unmap before destroying or the buffer is destroyed mid-map.
    async destroy() {
        try { await this.drain(); } catch {}
        for (const b of [this.uParams, this.bHeights, this.bCost, this.bDistA, this.bDistB, this.bFlow, this.bMeta])
            try { b.destroy(); } catch {}
        for (const s of this._slots) {
            try { s.stage.destroy(); } catch {}
            try { s.stageD.destroy(); } catch {}
            try { s.stageMeta.destroy(); } catch {}
        }
        this._slots = [];
    }
}
