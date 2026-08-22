// WebGLEngine/face/faceWorker.js -- v3116
//
// THE OFF-THREAD HALF OF THE DETECT LOOP, KEPT DELIBERATELY THIN.
//
// Everything that DECIDES anything lives in face/detectPump.js, which is pure and tested. This file is the part
// that cannot be tested in a sandbox with no browser: it creates a FaceLandmarker inside the worker and runs it
// on ImageBitmaps posted from the main thread. If it is short, there is less of it to be wrong.
//
// WHY A BITMAP RATHER THAN THE VIDEO ELEMENT: detectForVideo() takes a video element on the main thread, and a
// video element cannot cross into a worker. createImageBitmap() CAN -- it is transferable, so the pixels move
// with no copy -- and grabbing one is cheap next to running the model on it, which is the whole point.
//
// THE BITMAP IS CLOSED IN A finally. An ImageBitmap holds GPU memory until close() is called, so a detect that
// throws would leak one image per frame -- and the symptom would be the tab slowly dying rather than anything
// pointing at this line.

let landmarker = null;

self.onmessage = async (ev) => {
    const msg = ev.data || {};

    if (msg.type === "init") {
        try {
            const { FaceLandmarker, FilesetResolver } = await import(/* @vite-ignore */ msg.cdnBase + "/vision_bundle.mjs");
            const vision = await FilesetResolver.forVisionTasks(msg.cdnBase + "/wasm");
            landmarker = await FaceLandmarker.createFromOptions(vision, msg.options);
            self.postMessage({ type: "ready" });
        } catch (e) {
            // NAME THE FAILURE. The main thread falls back to the synchronous path on this message, and a
            // fallback that happens silently is a performance change nobody can account for later.
            self.postMessage({ type: "initFailed", error: String((e && e.message) || e) });
        }
        return;
    }

    if (msg.type === "frame") {
        if (!landmarker) { self.postMessage({ type: "result", seq: msg.seq, result: null, error: "no landmarker" }); return; }
        try {
            const r = landmarker.detectForVideo(msg.bitmap, msg.ts);
            // Only the parts the main thread actually reads. Posting the whole result would structured-clone
            // 478 landmarks per frame for the sake of the few that are used.
            self.postMessage({
                type: "result", seq: msg.seq,
                result: {
                    faceLandmarks: r?.faceLandmarks ?? null,
                    faceBlendshapes: r?.faceBlendshapes ?? null,
                    facialTransformationMatrixes: r?.facialTransformationMatrixes ?? null,
                },
            });
        } catch (e) {
            self.postMessage({ type: "result", seq: msg.seq, result: null, error: String((e && e.message) || e) });
        } finally {
            try { msg.bitmap.close(); } catch {}
        }
        return;
    }

    if (msg.type === "stop") { try { landmarker?.close?.(); } catch {} landmarker = null; self.postMessage({ type: "stopped" }); }
};
