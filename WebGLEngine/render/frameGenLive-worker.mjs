// WebGLEngine/render/frameGenLive-worker.mjs -- path-tracer.html's frame-generation view: real frames traced off the page's thread.
// A message { k, family, seed, w, h, spp, stepDeg } traces real frame k (render/frameGenLive.mjs's traceJob) and posts it back,
// its buffers transferred, with how long it took. Wiring only: render/frameGenLive-selfcheck.mjs runs traceJob itself.
import { traceJob } from "./frameGenLive.mjs";
self.onmessage = (e) => {
    const t0 = performance.now(), job = traceJob(e.data), ms = performance.now() - t0;
    self.postMessage({ ...job, ms }, [job.frame.buffer, ...(job.flow ? [job.flow.buffer, job.depth.buffer] : [])]);
};
