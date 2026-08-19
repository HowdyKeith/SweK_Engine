// FILE: ai-bridge/capQueue.js
// VERSION: v1 - PURE job queue for capability-proxy requests (the text2voxel "pipeline"), reorderable + cancelable.
//
// The PROVIDER (a box that holds a capability, e.g. a Gemini key for text2voxel) owns ONE queue. Peers submit jobs
// transparently; a serialized worker runs them one at a time; both ends + the network read the same queue via GET
// /cap/queue. This module is pure (no I/O, no network) so the ordering / cancel / reorder / prune logic is unit-tested;
// the worker, endpoints, and remote submit/poll live in server.js.
//
// A job: { id, cap, prompt, requesterId, requesterName, status, createdAt, startedAt, finishedAt, result, error }.
// status: "queued" -> "running" -> "done" | "error", or "canceled" from queued/running.

let _seq = 0;

function makeQueue(opts) {
    opts = opts || {};
    const MAX = opts.max || 100, KEEP_DONE = opts.keepDone || 30;
    const jobs = [];   // ordered; the worker takes the first status==="queued"

    function _id() { _seq = (_seq + 1) % 1e9; return "vq_" + Date.now().toString(36) + "_" + _seq.toString(36); }

    function enqueue(j) {
        j = j || {};
        const job = {
            id: _id(), cap: String(j.cap || "text2voxel"), prompt: String(j.prompt || "").slice(0, 2000),
            requesterId: String(j.requesterId || "").slice(0, 80), requesterName: String(j.requesterName || "a peer").slice(0, 40),
            status: "queued", createdAt: Date.now(), startedAt: 0, finishedAt: 0, result: null, error: "",
        };
        jobs.push(job); _prune(); return job;
    }

    function _pub(j) { return { id: j.id, cap: j.cap, prompt: j.prompt, requesterId: j.requesterId, requesterName: j.requesterName, status: j.status, createdAt: j.createdAt, startedAt: j.startedAt, finishedAt: j.finishedAt, hasResult: !!j.result, error: j.error }; }
    function list() { return jobs.map(_pub); }
    function get(id) { return jobs.find((j) => j.id === id) || null; }
    function nextQueued() { return jobs.find((j) => j.status === "queued") || null; }
    function running() { return jobs.find((j) => j.status === "running") || null; }

    function markRunning(id) { const j = get(id); if (j && j.status === "queued") { j.status = "running"; j.startedAt = Date.now(); return true; } return false; }
    function markDone(id, result) { const j = get(id); if (j && j.status === "running") { j.status = "done"; j.finishedAt = Date.now(); j.result = result; _trimDone(); return true; } return false; }
    function markError(id, err) { const j = get(id); if (j && (j.status === "running" || j.status === "queued")) { j.status = "error"; j.finishedAt = Date.now(); j.error = String(err || "").slice(0, 300); _trimDone(); return true; } return false; }

    function cancel(id, requesterId) {
        const j = get(id); if (!j) return { ok: false, reason: "not found" };
        if (requesterId && j.requesterId && j.requesterId !== requesterId) return { ok: false, reason: "not your job" };
        if (j.status === "done" || j.status === "error" || j.status === "canceled") return { ok: false, reason: "already finished" };
        j.status = "canceled"; j.finishedAt = Date.now(); _trimDone(); return { ok: true, status: "canceled" };
    }

    // Reorder ONLY the queued jobs to follow orderedIds; running/finished jobs keep their slots. Unmentioned queued jobs
    // keep their relative order at the end. A running job can't be reordered (it's already executing).
    function reorder(orderedIds) {
        const queuedPositions = []; for (let i = 0; i < jobs.length; i++) if (jobs[i].status === "queued") queuedPositions.push(i);
        const queued = queuedPositions.map((i) => jobs[i]);
        const byId = new Map(queued.map((j) => [j.id, j]));
        const newOrder = [];
        for (const id of (orderedIds || [])) { const j = byId.get(id); if (j) { newOrder.push(j); byId.delete(id); } }
        for (const j of queued) if (byId.has(j.id)) newOrder.push(j);
        for (let k = 0; k < queuedPositions.length; k++) jobs[queuedPositions[k]] = newOrder[k];
        return { ok: true };
    }

    function _prune() {
        _trimDone();
        while (jobs.length > MAX) { const i = jobs.findIndex((j) => j.status === "done" || j.status === "error" || j.status === "canceled"); if (i < 0) break; jobs.splice(i, 1); }
    }
    function _trimDone() {
        const done = jobs.filter((j) => j.status === "done" || j.status === "error" || j.status === "canceled");
        if (done.length > KEEP_DONE) { const drop = new Set(done.slice(0, done.length - KEEP_DONE).map((j) => j.id)); for (let i = jobs.length - 1; i >= 0; i--) if (drop.has(jobs[i].id)) jobs.splice(i, 1); }
    }

    function stats() { const c = { queued: 0, running: 0, done: 0, error: 0, canceled: 0 }; for (const j of jobs) c[j.status] = (c[j.status] || 0) + 1; return c; }
    function queuePosition(id) { const q = jobs.filter((j) => j.status === "queued"); return q.findIndex((j) => j.id === id); }

    return { enqueue, list, get, nextQueued, running, markRunning, markDone, markError, cancel, reorder, stats, queuePosition, _pub };
}

module.exports = { makeQueue };
