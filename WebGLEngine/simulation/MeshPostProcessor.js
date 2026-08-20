// FILE: simulation/MeshPostProcessor.js
// VERSION: v1 — round 331
//
// High-level integration layer for opportunistic mesh post-processing.
// Wraps a WorkerPool dedicated to the weld → normals pipeline.
//
// Tier 1 of the worker-pool plan: weld duplicate vertices, recompute
// smooth normals. Applied opportunistically (caller decides when) so
// the main thread stays responsive. Typical use:
//
//   const meshPP = new MeshPostProcessor();
//   const result = await meshPP.process({
//       positions: float32Array,
//       indices:   uint16Or32Array,
//       epsilon:   1e-4,
//   });
//   // result.positions, result.indices, result.normals — ready to upload
//
// Status hooks (Tier 3 from the master plan) live on this class so the
// ECG HUD and mesh QC badges can subscribe to job progress.

import { WorkerPool } from "./WorkerPool.js";
// v335 — kernel imports for the sync code path. Same functions the
// Worker uses; calling them inline avoids the postMessage round-trip
// for callers that prefer blocking behavior (e.g. asset loader hook
// that wants the cleaned mesh available immediately).
import { weldAndNormals } from "../worker/meshPostProcessor.worker.js";

export class MeshPostProcessor {
    constructor({ poolSize, enabled = false } = {}) {
        this._enabled = enabled;
        this._pool = null;
        this._poolSize = poolSize;
        this._statsByName = new Map();    // name → { weldedFrom, weldedTo, durationMs }
        // Lazy-init: don't spin up workers until first job is submitted.
        // Saves cold-start cost for users who never use post-processing.
    }

    setEnabled(on) {
        this._enabled = !!on;
        if (!on && this._pool) {
            // Don't dispose immediately — let pending jobs finish.
            // dispose explicitly via .dispose() if needed.
        }
    }

    isEnabled() { return this._enabled; }

    _ensurePool() {
        if (this._pool) return this._pool;
        const url = new URL("../worker/meshPostProcessor.worker.js", import.meta.url);
        this._pool = new WorkerPool({
            workerUrl: url,
            size: this._poolSize,
            label: "meshPP",
        });
        return this._pool;
    }

    /**
     * Run weld + normals on a mesh. Returns a promise resolving to a
     * processed mesh in the same shape:
     *
     *   { positions: Float32Array, indices: Uint16/32Array,
     *     normals: Float32Array, originalCount, weldedCount, durationMs }
     *
     * Input typed arrays' buffers are TRANSFERRED to the worker — after
     * calling process(), the caller's positions/indices are detached
     * and unusable. Clone first if you need to keep them.
     */
    async process({ positions, indices, epsilon = 1e-4, name = null, priority } = {}) {
        if (!(positions instanceof Float32Array)) {
            throw new Error("MeshPostProcessor: positions must be Float32Array");
        }
        if (!(indices instanceof Uint16Array || indices instanceof Uint32Array)) {
            throw new Error("MeshPostProcessor: indices must be Uint16Array or Uint32Array");
        }
        const pool = this._ensurePool();
        const indexType = indices instanceof Uint32Array ? "uint32" : "uint16";
        const response = await pool.submit("weldAndNormals", {
            positionsBuf: positions.buffer,
            indicesBuf:   indices.buffer,
            indexType,
            epsilon,
        }, [positions.buffer, indices.buffer], priority);

        const outPositions = new Float32Array(response.positionsBuf);
        const OutIndexCtor = response.indexType === "uint32" ? Uint32Array : Uint16Array;
        const outIndices = new OutIndexCtor(response.indicesBuf);
        const outNormals = new Float32Array(response.normalsBuf);

        if (name) {
            this._statsByName.set(name, {
                weldedFrom: response.originalCount,
                weldedTo:   response.weldedCount,
                durationMs: response.durationMs,
                ratio: response.weldedCount / response.originalCount,
            });
        }

        return {
            positions: outPositions,
            indices:   outIndices,
            normals:   outNormals,
            originalCount: response.originalCount,
            weldedCount:   response.weldedCount,
            durationMs:    response.durationMs,
        };
    }

    /** Per-job stats by mesh name (whatever was passed as `name` to process). */
    statsFor(name) { return this._statsByName.get(name) ?? null; }

    // v335 — synchronous variant. Runs weldAndNormals on the main
    // thread (no worker round-trip). Intended for callers that need
    // the cleaned mesh available immediately, e.g. the asset loader
    // path which is synchronous and uploads to GPU right after parse.
    //
    // Costs: typical kaiju mesh (1-5k verts) is ~1-5ms. Larger meshes
    // (50k+ verts) get closer to 50ms — for those the async process()
    // is the better choice.
    //
    // Unlike process(), this does NOT transfer the input arrays —
    // they stay valid for the caller. The returned positions/indices/
    // normals are NEW arrays.
    processSync({ positions, indices, epsilon = 1e-4, name = null } = {}) {
        if (!(positions instanceof Float32Array)) {
            throw new Error("MeshPostProcessor.processSync: positions must be Float32Array");
        }
        if (!(indices instanceof Uint16Array || indices instanceof Uint32Array)) {
            throw new Error("MeshPostProcessor.processSync: indices must be Uint16Array or Uint32Array");
        }
        const t0 = (typeof performance !== "undefined") ? performance.now() : 0;
        const result = weldAndNormals(positions, indices, epsilon);
        const t1 = (typeof performance !== "undefined") ? performance.now() : 0;
        const durationMs = t1 - t0;
        if (name) {
            this._statsByName.set(name, {
                weldedFrom: result.originalCount,
                weldedTo:   result.weldedCount,
                durationMs,
                ratio: result.weldedCount / Math.max(1, result.originalCount),
                sync: true,
            });
        }
        return {
            positions: result.positions,
            indices:   result.indices,
            normals:   result.normals,
            originalCount: result.originalCount,
            weldedCount:   result.weldedCount,
            durationMs,
        };
    }

    /** Pool-wide stats. */
    poolStats() { return this._pool?.stats() ?? null; }

    /** List of all stats entries. */
    allStats() {
        return [...this._statsByName.entries()].map(([name, s]) => ({ name, ...s }));
    }

    dispose() {
        if (this._pool) {
            this._pool.dispose();
            this._pool = null;
        }
    }
}
