// WebGLEngine/render/frameGenChainLive-worker.mjs -- path-tracer.html's chain frame-generation view: the chain off the page's thread.
// { type: "init", ut } fetches the shipped denoiser (and, with `ut`, round 72's candidate U_TH) and makes render/frameGenChainLive.mjs's state; { type: "step", k } runs chainStep for
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
            let ut = null, candidate = null;
            if (m.ut) {
                const r2 = await fetch("/" + LIVE_C.ut);
                if (!r2.ok) throw new Error(`U_TH did not load: ${r2.status} ${r2.statusText}`);
                const tr = await r2.json(); candidate = tr.candidate; ut = decodeNet(tr.runs.find((r) => r.seed === tr.candidate).net);
            }
            state = makeChainState({ net: decodeNet((await res.json()).net), ut });
            self.postMessage({ type: "ready", W: state.W, candidate });
            return;
        }
        if (m.type !== "step") return;
        const t0 = performance.now(), r = chainStep(state, m.k), ms = performance.now() - t0, xfer = [r.A.buffer, r.frame.buffer, r.n.buffer];
        if (r.flow) xfer.push(r.flow.buffer, r.depth.buffer, r.mid.cov.buffer, r.mid.E.buffer);
        self.postMessage({ type: "step", ...r, ms }, xfer);
    } catch (err) { self.postMessage({ type: "error", message: String(err && err.message || err) }); }
};
