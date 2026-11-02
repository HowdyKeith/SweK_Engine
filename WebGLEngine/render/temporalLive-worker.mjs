// WebGLEngine/render/temporalLive-worker.mjs -- path-tracer.html's temporal view: the chain off the page's thread.
// { type: "init", cpuUT } fetches the shipped denoiser and round 70's candidate U_T and makes render/temporalLive.mjs's state;
// { type: "step", k } runs liveStep for frame k and posts what it gave, its buffers transferred. Wiring only: the gate runs liveStep.
import { makeLiveState, liveStep, LIVE_T } from "./temporalLive.mjs";
import { decodeNet } from "./denoiseDevice.mjs";
let state = null, cpuUT = false;
self.onmessage = async (e) => {
    const m = e.data;
    try {
        if (m.type === "init") {
            const get = async (f) => (await fetch("/" + f)).json(), shipped = await get(LIVE_T.net), tr = await get(LIVE_T.ut);
            const utData = tr.runs.find((r) => r.seed === tr.candidate).net;
            state = makeLiveState({ net: decodeNet(shipped.net), ut: decodeNet(utData) }); cpuUT = !!m.cpuUT;
            self.postMessage({ type: "ready", W: state.W, candidate: tr.candidate, ut: utData });
            return;
        }
        if (m.type !== "step") return;
        const r = liveStep(state, m.k, { cpuUT }), out = { type: "step", k: r.k, ready: r.ready, have: r.have, ms: r.ms }, xfer = [];
        if (r.ready) { for (const key of ["x", "cov", "E", "bt", "b1"]) { out[key] = r.ex[key]; xfer.push(r.ex[key].buffer); } if (r.ut) { out.ut = r.ut; xfer.push(r.ut.buffer); } }
        self.postMessage(out, xfer);
    } catch (err) { self.postMessage({ type: "error", message: String(err && err.message || err) }); }
};
