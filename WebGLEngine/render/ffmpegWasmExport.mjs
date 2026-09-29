// WebGLEngine/render/ffmpegWasmExport.mjs -- v4613
//
// THE OTHER HALF OF render/blobRecorder.js's OWN CONCLUSION, DONE WHERE ITS SERVER-SIDE ROAD DOES NOT REACH.
//
// blobRecorder.js measured, in a real headless Chromium, that this engine's browser can RECORD real WebM/VP9
// but cannot itself produce H.264-in-MP4 (isTypeSupported("video/mp4") lies: it returns true and hands you
// VP9). Its own conclusion was "record WebM, transcode with ffmpeg -- one line": `ffmpeg -i in.webm -c:v
// libx264 -pix_fmt yuv420p out.mp4`, run SERVER-side via ai-bridge/ffmpegStatic.js.
//
// *** THAT SERVER-SIDE ROAD IS macOS-ONLY, AND NOT BY OVERSIGHT -- ffmpegStatic.js SAYS SO ON ITS OWN LINE 27:
// `if (process.platform !== "darwin") return { ok: false, error: "static ffmpeg download is macOS-only" };` ***
// (it pulls a static binary from evermeet.cx, the standard macOS static-build source). On Linux or Windows,
// blobRecorder.js's own "the road that actually works" note simply does not apply -- there is no ffmpeg for
// this module's transcode to shell out to.
//
// THIS MODULE IS THE SAME EXACT TRANSCODE, DONE ENTIRELY CLIENT-SIDE, SO IT WORKS ON EVERY PLATFORM
// ffmpegStatic.js's SERVER-SIDE ROAD DOES NOT REACH. ffmpeg.wasm (see ai-bridge/ffmpegWasmBridge.js's header
// for the full provenance/license story -- MIT wrapper, GPL-2.0-or-later core) is a REAL software H.264 encoder
// compiled to WebAssembly; it runs inside the page's own Worker, needs no server binary and no particular OS,
// and a prior round in this session byte-verified it really does produce a genuine avcC-bearing H.264 track.
// This is a SECOND road to the same destination, not a replacement for the first -- pick whichever platform
// you're actually on.
//
// *** A THIRD ROAD WAS CHECKED AND RULED OUT: THE BROWSER'S OWN NATIVE WebCodecs VideoEncoder. *** media/
// afDecode.js's own header already measured, decode-side, that this engine's Chromium has no H.264 --
// "avc1 is unsupported for both encode and decode, while vp8 and vp09 are supported both ways" -- but that
// measurement only ever exercised VideoDecoder.isConfigSupported(); this module is the one that would
// actually benefit from a native ENCODE path (skip ffmpeg.wasm's ~30 MB fetch and its Worker entirely), so
// the encode side was measured separately rather than assumed to match. Same box this session's own
// server-side @napi-rs/webcodecs work ran on: the pre-installed headless Chromium (Chrome/141.0.7390.37),
// driven via puppeteer-core against a REAL page served over http://127.0.0.1 -- a genuine secure context,
// unlike a data: URL, which reports isSecureContext:false and was the first, wrong thing tried; WebCodecs
// requires a secure context, so testing against the wrong kind of URL silently reports VideoEncoder itself
// as undefined, not merely "unsupported", which looks identical to "this build has no WebCodecs at all"
// unless you know to check isSecureContext first.
//
// VideoEncoder.isConfigSupported() result, three real avc1 profile/level strings against a genuine 640x480
// config: avc1.42001f (baseline), avc1.4d0028 (main), avc1.640028 (high) -- ALL THREE supported:false. The
// same box's vp8/vp09.00.10.08/av01.0.04M.08 configs all came back supported:true, matching afDecode.js's
// own decode-side vp8/vp09 result exactly -- this is the SAME missing-proprietary-codec gap afDecode.js
// already documented, now confirmed on the encode side too, not a different or newer restriction.
//
// NET: there is no "prefer native WebCodecs, fall back to ffmpeg.wasm" road worth building for H.264 on
// this class of browser build -- native avc1 encode is unconditionally absent here, so the fallback would
// always be taken, and there is no way to test the native-success path in this sandbox at all (it would
// need an actual licensed Chrome/Edge build, which ships H.264 unlike the open-source Chromium project;
// none is available here to verify against). Shipping an unexercised native-encode code path behind a gate
// that can never fire in this environment would be exactly the kind of "verified" claim this session's own
// discipline exists to rule out. If a future round has access to a real licensed browser build, this is
// the specific measurement to re-run before writing that code, not something to assume from Chrome's
// desktop reputation for supporting H.264 generally.
//
// USAGE: POST /ffwasm/install once (ai-bridge/ffmpegWasmBridge.js -- a real ~30 MB one-time WASM fetch, cached
// locally forever after), confirm with ffmpegWasmReady(), then transcodeWebmToH264Mp4(webmBytes) runs the exact
// command above and hands back real bytes. See ui/canvasRecorder.js's swekRecord.exportH264() for the wired-up
// caller.
"use strict";
import { sniffMp4Codec } from "./blobRecorder.js";
import { probeWasm, explainWasmFailure } from "../engine/wasmSupport.mjs";

const DEFAULT_BASE_URL = "/ffwasm/app/";
const DEFAULT_STATUS_URL = "/ffwasm/status";

let _ffmpegWasmPromise = null; // caches the loaded UMD module (window.FFmpegWASM), not an FFmpeg instance

/**
 * Load ffmpeg.js's UMD build as a real <script> tag, the same document.createElement("script")+appendChild
 * idiom ui/pageGauges.js already uses for a global-defining script on this page. Pointed at baseUrl + "ffmpeg.js"
 * so the bundle's own auto-detected publicPath (it reads document.currentScript.src) resolves 814.ffmpeg.js --
 * the lazy worker chunk it loads at runtime -- as a SIBLING of wherever ffmpeg.js itself was loaded from. That
 * is also why baseUrl must be the SAME ORIGIN as the page: a Worker cannot be constructed from a cross-origin
 * script URL, so ffmpeg.js and 814.ffmpeg.js have to be served from one place together (which /ffwasm/app/
 * already does, both artefacts, flat, from the same route).
 */
function _loadFfmpegScript(baseUrl) {
    if (typeof window !== "undefined" && window.FFmpegWASM && window.FFmpegWASM.FFmpeg) {
        return Promise.resolve(window.FFmpegWASM);
    }
    if (_ffmpegWasmPromise) return _ffmpegWasmPromise;
    _ffmpegWasmPromise = new Promise((resolve, reject) => {
        const src = baseUrl + "ffmpeg.js";
        const s = document.createElement("script");
        s.src = src;
        s.setAttribute("data-swek-ffmpeg-wasm", "1");
        s.onload = () => {
            if (window.FFmpegWASM && window.FFmpegWASM.FFmpeg) resolve(window.FFmpegWASM);
            else reject(new Error("ffmpeg.js loaded but window.FFmpegWASM.FFmpeg is missing -- unexpected build shape"));
        };
        s.onerror = () => { _ffmpegWasmPromise = null; reject(new Error("failed to load " + src + " -- not installed? POST /ffwasm/install first, see ffmpegWasmReady()")); };
        document.head.appendChild(s);
    });
    return _ffmpegWasmPromise;
}

/**
 * Is the install button (ai-bridge/ffmpegWasmBridge.js) actually installed? Fetches the bridge's own /ffwasm/
 * status route rather than guessing -- the same "ask, don't assume" discipline verifiedPolygonIntersectionBridge
 * .js's page already follows for its own install button. Never throws: a missing/offline bridge reads as
 * simply not-ready, exactly like a fresh install that hasn't run yet.
 */
export async function ffmpegWasmReady(statusUrl = DEFAULT_STATUS_URL) {
    try {
        const r = await fetch(statusUrl);
        if (!r.ok) return false;
        const j = await r.json();
        return !!(j && j.built);
    } catch {
        return false;
    }
}

/**
 * Transcode a WebM Blob's bytes (VP8/VP9, whatever probeRecording()/recordCanvas() in blobRecorder.js actually
 * captured) to REAL H.264-in-MP4, entirely client-side. Runs the exact command line tools/ship/nextRounds.mjs's
 * own "ffmpeg-wasm-h264-encode" entry byte-verified in a real headless-Chromium run: `ffmpeg -i in.webm -c:v
 * libx264 -pix_fmt yuv420p out.mp4` -- render/blobRecorder.js's own header names the same encoder+container
 * choice (its conclusion is where this module's REASON for existing comes from, see this file's top-of-file
 * comment) but not that exact -pix_fmt flag; no different flags picked here regardless.
 *
 * `opts.baseUrl` (default "/ffwasm/app/") lets a caller point this at a different same-origin location -- used
 * by tools/ship/ffmpegWasmBridge-selfcheck.mjs's own real-browser section, which serves the installed artefacts
 * from a scratch path under the engine root rather than through the live ai-bridge server.
 *
 * Returns { ok, bytes, error, codec }. NEVER reports success without checking what actually came out: ffmpeg's
 * own exec() resolves with a return code rather than throwing on a nonzero exit, and the output container is
 * sniffed for a real avc1 box before this call is honest about having produced H.264 -- the exact trap
 * blobRecorder.js exists to name ("A FLAG THAT LIES IS WORSE THAN NO FLAG"), applied to this module's own output.
 */
export async function transcodeWebmToH264Mp4(webmBytes, opts = {}) {
    const baseUrl = opts.baseUrl || DEFAULT_BASE_URL;
    const coreURL = opts.coreURL || (baseUrl + "ffmpeg-core.js");
    const wasmURL = opts.wasmURL || (baseUrl + "ffmpeg-core.wasm");
    // ASK FIRST, same rule physics/jolt/joltLoader.js and physics/box3d/box3dLoader.js apply to their own
    // wasm init -- this module is browser-side and user-triggered exactly like those two, not a Node-side
    // gate where WebAssembly is always present. Without this, WebAssembly switched off (Lockdown Mode) or a
    // CSP missing 'wasm-unsafe-eval' would surface as whatever raw error ffmpeg.js's own worker throws deep
    // inside ffmpeg.load(), rather than the true cause.
    const probe = probeWasm();
    if (!probe.usable) return { ok: false, bytes: null, error: "H.264 export needs WebAssembly. " + probe.reason, codec: null };
    let ffmpeg = null;
    try {
        const FFmpegWASM = await _loadFfmpegScript(baseUrl);
        ffmpeg = new FFmpegWASM.FFmpeg();
        try {
            await ffmpeg.load({ coreURL, wasmURL });
        } catch (e) {
            return { ok: false, bytes: null, error: explainWasmFailure(e, "ffmpeg.wasm failed to initialise"), codec: null };
        }
        // *** COPY, NEVER THE CALLER'S OWN BUFFER. *** ffmpeg.js's own writeFile() posts the Uint8Array to its
        // Worker with the buffer in the TRANSFER list (a real, measured effect, not a guess -- read its own UMD
        // bundle: `s instanceof Uint8Array && a.push(s.buffer)` before `postMessage(msg, a)`), which DETACHES
        // that buffer from this thread. Handing it webmBytes directly would silently zero out the CALLER's own
        // reference (byteLength -> 0) the moment this function returns -- a caller that logs or reuses its blob
        // bytes afterward would see them vanish with no error. A fresh copy is transferred instead, every time.
        const srcView = webmBytes instanceof Uint8Array ? webmBytes : new Uint8Array(webmBytes);
        const input = new Uint8Array(srcView);
        await ffmpeg.writeFile("in.webm", input);
        const ret = await ffmpeg.exec(["-i", "in.webm", "-c:v", "libx264", "-pix_fmt", "yuv420p", "out.mp4"]);
        if (ret !== 0) return { ok: false, bytes: null, error: "ffmpeg exited with code " + ret, codec: null };
        const data = await ffmpeg.readFile("out.mp4");
        const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
        const codec = sniffMp4Codec(bytes);
        if (codec !== "avc1") {
            return { ok: false, bytes: null, error: "output container has no avc1 track (sniffed: " + codec + ")", codec };
        }
        return { ok: true, bytes, error: null, codec };
    } catch (e) {
        return { ok: false, bytes: null, error: String((e && e.message) || e), codec: null };
    } finally {
        // Fresh FFmpeg()/Worker per call rather than kept alive across exports -- this is an occasional export
        // action, not a hot path, and terminating avoids a leaked Worker outliving the page's interest in it.
        if (ffmpeg) { try { ffmpeg.terminate(); } catch {} }
    }
}
