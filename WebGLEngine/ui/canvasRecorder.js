// WebGLEngine/ui/canvasRecorder.js — v2270
//
// A presentation-clip recorder: window.swekRecord.start(seconds) captures the largest canvas on the page to a
// high-bitrate webm and downloads it (convert to mp4 for slides with the ffmpeg the engine bundles). Works on
// any page with a canvas -- the EV multiplayer flight view (record a real GPU-brain + box3d fight), the engine
// kaiju demo, es-box3d.html. Built-in MediaRecorder, no dependency. Call installRecorder() once per page.
//
// v3735 -- AND IT NOW SAYS WHETHER THE OTHER HALF IS AVAILABLE, WHICH IS A DIFFERENT QUESTION FROM ITS OWN.
// canvas.captureStream + MediaRecorder are NOT secure-context gated, so this recorder works over http on a LAN
// IP -- the origin the engine actually ships as. WebCodecs (VideoEncoder) IS gated, so on that same page a
// browser-side re-encode is simply absent. "IT RECORDED FINE" AND "IT CAN RE-ENCODE" ARE TWO DIFFERENT ANSWERS
// ON ONE ORIGIN, and a transcode step added beside this one would no-op with the recorder plainly working next
// to it. swekRecord.capabilities() asks both. -> ui/codecProbe.mjs

import { describeCapture } from "./codecProbe.mjs";

export function installRecorder() {
    if (typeof window === "undefined" || window.swekRecord) return;
    let mr = null, chunks = [];
    function largestCanvas() {
        let best = null, area = -1;
        for (const c of document.querySelectorAll("canvas")) { const a = (c.width || 0) * (c.height || 0); if (a > area) { area = a; best = c; } }
        return best;
    }
    window.swekRecord = {
        // seconds<=0 records until stop(). canvas optional (defaults to the largest on the page).
        start(seconds = 15, canvas) {
            const cv = canvas || largestCanvas();
            if (!cv || !cv.captureStream || !window.MediaRecorder) { console.warn("[swekRecord] no canvas or MediaRecorder here"); return false; }
            if (mr && mr.state === "recording") { console.warn("[swekRecord] already recording"); return false; }
            chunks = [];
            const type = MediaRecorder.isTypeSupported("video/webm;codecs=vp9") ? "video/webm;codecs=vp9" : "video/webm";
            try { mr = new MediaRecorder(cv.captureStream(60), { mimeType: type, videoBitsPerSecond: 8000000 }); }
            catch (e) { console.warn("[swekRecord] " + (e && e.message)); return false; }
            mr.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
            mr.onstop = () => {
                const blob = new Blob(chunks, { type: "video/webm" });
                const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "swek-clip-" + Date.now() + ".webm"; a.click();
                console.log("[swekRecord] saved " + (blob.size / 1e6).toFixed(1) + " MB webm - convert for slides: ffmpeg -i clip.webm clip.mp4");
            };
            mr.start();
            console.log("[swekRecord] recording " + (seconds > 0 ? seconds + "s" : "until stop()") + " from a " + cv.width + "x" + cv.height + " canvas");
            if (seconds > 0) setTimeout(() => this.stop(), seconds * 1000);
            return true;
        },
        stop() { try { if (mr && mr.state === "recording") mr.stop(); } catch {} },
        recording() { return !!(mr && mr.state === "recording"); },
        // v3735 -- the two questions answered together. Pure: every global is handed in, so the same call is
        // gradeable headless (ui/codecProbe-selfcheck.mjs) instead of needing four browsers.
        capabilities() {
            return describeCapture({
                globals: window, isSecureContext: window.isSecureContext, location: window.location,
            });
        },
    };
    console.log("[swekRecord] ready - swekRecord.start(20) records the largest canvas to a webm presentation clip");
    // Printed ONLY in the case that is actually surprising, so it is not noise on every page.
    const cap = window.swekRecord.capabilities();
    if (cap.split) console.log("[swekRecord] NOTE - " + cap.message);
}

if (typeof module !== "undefined" && module.exports) module.exports = { installRecorder };
