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
//
// v4613 -- AND NOW A THIRD ROAD, EXPLICIT AND OPT-IN: swekRecord.exportH264(blob). The .webm this recorder
// downloads is honest (WebM/VP9, not the "video/mp4" lie MediaRecorder's own isTypeSupported() tells --
// render/blobRecorder.js's whole reason for existing) but a Roku/TV will not play it. exportH264() runs the
// SAME transcode blobRecorder.js's header names (`ffmpeg -i in.webm -c:v libx264 -pix_fmt yuv420p out.mp4`),
// entirely client-side via render/ffmpegWasmExport.mjs, and downloads a SECOND, distinct .mp4 file -- it never
// replaces or changes the existing .webm download, and it never silently no-ops: if the install button
// (POST /ffwasm/install, ai-bridge/ffmpegWasmBridge.js) hasn't been used yet, it says so plainly rather than
// pretending nothing was asked for.

import { describeCapture } from "./codecProbe.mjs";

export function installRecorder() {
    if (typeof window === "undefined" || window.swekRecord) return;
    let mr = null, chunks = [], lastBlob = null;
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
                lastBlob = blob;   // -> exportH264(), so a caller need not re-thread the blob through by hand
                const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "swek-clip-" + Date.now() + ".webm"; a.click();
                console.log("[swekRecord] saved " + (blob.size / 1e6).toFixed(1) + " MB WEBM (this is the recording -- not TV-safe H.264). " +
                            "For a real H.264 MP4, call swekRecord.exportH264() next.");
            };
            mr.start();
            console.log("[swekRecord] recording " + (seconds > 0 ? seconds + "s" : "until stop()") + " from a " + cv.width + "x" + cv.height + " canvas");
            if (seconds > 0) setTimeout(() => this.stop(), seconds * 1000);
            return true;
        },
        stop() { try { if (mr && mr.state === "recording") mr.stop(); } catch {} },
        recording() { return !!(mr && mr.state === "recording"); },
        // v4613 -- EXPLICIT and OPT-IN, not automatic-on-stop: the ~30 MB one-time ffmpeg.wasm fetch this needs
        // is real and should not happen just because somebody called stop(). Defaults to the WebM blob the last
        // onstop produced, or pass any WebM Blob directly. Never silently no-ops: if the install button hasn't
        // been used yet, says so and returns false rather than pretending an H.264 file was made.
        async exportH264(blob = lastBlob) {
            if (!blob) { console.warn("[swekRecord] exportH264: no WebM to transcode -- record a clip first, or pass a WebM Blob directly"); return false; }
            let mod;
            try { mod = await import("../render/ffmpegWasmExport.mjs"); }
            catch (e) { console.warn("[swekRecord] exportH264: could not load render/ffmpegWasmExport.mjs -- " + (e && e.message)); return false; }
            const ready = await mod.ffmpegWasmReady();
            if (!ready) {
                console.warn("[swekRecord] exportH264: H.264 export is NOT installed yet. POST /ffwasm/install " +
                              "(ai-bridge/ffmpegWasmBridge.js) first -- a real, one-time ~30 MB WASM fetch, cached " +
                              "locally after. The .webm you already have is unaffected.");
                return false;
            }
            console.log("[swekRecord] transcoding the recorded WEBM to a REAL H.264 MP4, client-side (ffmpeg.wasm) -- " +
                        "this is IN ADDITION to the .webm already saved, not a replacement for it...");
            const webmBytes = new Uint8Array(await blob.arrayBuffer());
            const result = await mod.transcodeWebmToH264Mp4(webmBytes);
            if (!result.ok) { console.warn("[swekRecord] exportH264: transcode failed -- " + result.error); return false; }
            const mp4Blob = new Blob([result.bytes], { type: "video/mp4" });
            const a = document.createElement("a"); a.href = URL.createObjectURL(mp4Blob); a.download = "swek-clip-" + Date.now() + "-h264.mp4"; a.click();
            console.log("[swekRecord] saved " + (mp4Blob.size / 1e6).toFixed(1) + " MB REAL H.264/MP4 (avc1 confirmed, TV-safe) -- " +
                        "a SECOND file, distinct from the .webm.");
            return true;
        },
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
