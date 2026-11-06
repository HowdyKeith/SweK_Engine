// WebGLEngine/render/frameGenChainLive-worker.mjs -- path-tracer.html's chain frame-generation view: the chain off the page's thread.
// { type: "init" } fetches the shipped denoiser and makes render/frameGenChainLive.mjs's state; { type: "step", k } runs chainStep for
// real frame k and posts it, its buffers transferred, with how long it took. Wiring only: render/frameGenChainLive-selfcheck.mjs runs chainStep.
import { makeChainState, chainStep, LIVE_C } from "./frameGenChainLive.mjs";
import { decodeNet } from "./denoiseDevice.mjs";
let state = null;
self.onmessage = async (e) => {
    const m = e.data;
    try {
        if (m.type === "init") {
            const res = await fetch("/" + LIVE_C.net);
            if (!res.ok) throw new Error(`the denoiser did not load: ${res.status} ${res.statusText}`);
            state = makeChainState({ net: decodeNet((await res.json()).net) });
            self.postMessage({ type: "ready", W: state.W });
            return;
        }
        if (m.type !== "step") return;
        const t0 = performance.now(), r = chainStep(state, m.k), ms = performance.now() - t0, xfer = [r.A.buffer, r.frame.buffer, r.n.buffer];
        if (r.flow) xfer.push(r.flow.buffer, r.depth.buffer, r.mid.cov.buffer, r.mid.E.buffer);
        self.postMessage({ type: "step", ...r, ms }, xfer);
    } catch (err) { self.postMessage({ type: "error", message: String(err && err.message || err) }); }
};
