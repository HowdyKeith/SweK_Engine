// FILE: engine/meshQcAnalyzer.js
// VERSION: v1 — round 357
//
// Promise-based wrapper around the mesh-post-processor WorkerPool for
// quality-control analysis of imported/generated meshes. Drops the
// analysis off-thread so big assets don't stall the render loop, but
// returns a result that the UI can show as a QC badge.
//
// Falls back to running the pure function on the main thread if no
// worker pool is available — keeps the API consistent in Node tests
// and in browsers where worker spawning fails.

import { meshQc as meshQcPure } from "../worker/meshPostProcessor.worker.js";

let _sharedPool = null;
let _poolAttempted = false;

async function _getPool() {
    if (_sharedPool || _poolAttempted) return _sharedPool;
    _poolAttempted = true;
    try {
        const { WorkerPool } = await import("../simulation/WorkerPool.js");
        const url = new URL("../worker/meshPostProcessor.worker.js", import.meta.url);
        _sharedPool = new WorkerPool({ workerUrl: url, label: "meshQc" });
        if (_sharedPool.workers.length === 0) {
            _sharedPool = null;   // bail to main-thread fallback
        }
    } catch (e) {
        console.warn("[meshQcAnalyzer] worker pool unavailable, using main-thread fallback:", e?.message ?? e);
        _sharedPool = null;
    }
    return _sharedPool;
}

/**
 * Analyze a mesh and return a QC report.
 *
 * @param {Float32Array} positions  N × 3 vertex positions
 * @param {Uint16Array|Uint32Array} indices  triangle indices
 * @returns {Promise<MeshQcResult>}
 */
export async function analyzeMesh(positions, indices) {
    if (!(positions instanceof Float32Array)) {
        throw new Error("meshQcAnalyzer: positions must be Float32Array");
    }
    if (!(indices instanceof Uint16Array || indices instanceof Uint32Array)) {
        throw new Error("meshQcAnalyzer: indices must be Uint16Array or Uint32Array");
    }
    const pool = await _getPool();
    if (!pool) {
        // Synchronous main-thread fallback
        const qc = meshQcPure(positions, indices);
        return { ...qc, durationMs: 0, fromWorker: false };
    }
    // Copy buffers to transferables so worker can take ownership
    const positionsBuf = positions.buffer.slice(positions.byteOffset, positions.byteOffset + positions.byteLength);
    const indicesBuf   = indices.buffer.slice(indices.byteOffset, indices.byteOffset + indices.byteLength);
    const payload = {
        positionsBuf,
        indicesBuf,
        indexType: indices instanceof Uint32Array ? "uint32" : "uint16",
    };
    const t0 = performance.now();
    const response = await pool.submit("mesh_qc", payload, [positionsBuf, indicesBuf]);
    const durationMs = performance.now() - t0;
    if (!response?.qc) throw new Error("meshQcAnalyzer: malformed worker response");
    return { ...response.qc, durationMs, fromWorker: true };
}

/**
 * Grade a QC result into one of "good" | "warn" | "bad" buckets for
 * color-coding badges. Tuned for typical real-world meshes (Trellis,
 * Hunyuan, Pixal3D outputs).
 */
export function gradeQc(qc) {
    const reasons = [];
    let grade = "good";
    if (qc.triCount === 0) {
        return { grade: "bad", reasons: ["no triangles"] };
    }
    if (qc.degenerates > 0) {
        if (qc.degenerates > qc.triCount * 0.01) {
            grade = "bad"; reasons.push(`${qc.degenerates} degenerate triangles`);
        } else if (grade === "good") {
            grade = "warn"; reasons.push(`${qc.degenerates} degenerate triangles`);
        }
    }
    if (!qc.watertight) {
        if (qc.nonManifoldEdges > qc.triCount * 0.1) {
            grade = "bad"; reasons.push(`${qc.nonManifoldEdges} non-manifold edges`);
        } else if (grade !== "bad") {
            grade = "warn"; reasons.push(`${qc.nonManifoldEdges} non-manifold edges`);
        }
    }
    if (qc.vertCount === 0) {
        return { grade: "bad", reasons: ["no vertices"] };
    }
    return { grade, reasons };
}

export function getSharedPoolStats() {
    return _sharedPool ? _sharedPool.stats() : null;
}
