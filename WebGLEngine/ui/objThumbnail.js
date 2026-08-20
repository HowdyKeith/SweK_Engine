// FILE: ui/objThumbnail.js
// VERSION: v1 — round 283
//
// Creates an OffscreenCanvas-backed thumbnail of an OBJ mesh, drawn
// entirely in a worker. The main thread sees a normal-looking <canvas>
// element that auto-updates with the rotating preview.
//
// Why this exists separately from createObjPreview:
//   - createObjPreview is the full-size interactive previewer; it
//     runs on the main thread (rAF), supports orbit/zoom, has a "raw
//     text" toggle. Used in bench step cards for the final result
//     reveal.
//   - createObjThumbnail is the SMALL static preview meant for many-
//     at-once display (e.g. all four race results showing miniatures
//     side-by-side). One worker thread per thumbnail keeps the GL
//     contexts isolated; main thread never blocks on rAF for these.
//
// API:
//   createObjThumbnail(objText, opts?) → { element, dispose() }
//
// Falls back to createObjPreview if:
//   - OffscreenCanvas isn't supported
//   - The worker reports init_fail (browser refuses webgl2 in worker)
//   - Worker spawn throws
//
// Auto-registers with workerActivity so the ECG HUD shows the pulse
// when many thumbnails are running.

import { registerWorker } from "./workerActivity.js";

let _thumbId = 0;

function _hasOffscreenSupport() {
    try {
        if (typeof OffscreenCanvas === "undefined") return false;
        // Quick probe — some browsers expose the constructor but reject
        // webgl2 inside workers. A test fetch is too expensive; we just
        // trust the constructor and fall back on init_fail.
        return true;
    } catch {
        return false;
    }
}

async function _fallback(objText, opts) {
    // Lazy import so the fallback doesn't drag the full previewer when
    // it isn't needed.
    const mod = await import("./objPreview.js");
    return mod.createObjPreview(objText, opts);
}

export function createObjThumbnail(objText, opts = {}) {
    const width  = opts.width  ?? 128;
    const height = opts.height ?? 128;
    const id = ++_thumbId;

    const container = document.createElement("div");
    container.style.cssText =
        "position:relative; display:inline-block; border:1px solid #234; " +
        "border-radius:4px; background:#0a0a0a; overflow:hidden;";

    const canvas = document.createElement("canvas");
    canvas.width  = width;
    canvas.height = height;
    canvas.style.cssText = "display:block;";
    container.appendChild(canvas);

    // Badge bottom-left — populated when worker reports counts
    const badge = document.createElement("div");
    badge.style.cssText =
        "position:absolute; left:4px; bottom:3px; font-size:9px; color:#9be; " +
        "background:rgba(0,0,0,0.55); padding:1px 4px; border-radius:2px; " +
        "pointer-events:none; font-family:monospace;";
    badge.textContent = "…";
    container.appendChild(badge);

    let worker = null;
    let fallbackHandle = null;
    let disposed = false;

    async function init() {
        if (!_hasOffscreenSupport() || !canvas.transferControlToOffscreen) {
            // Path B — fall back to main-thread previewer.
            container.appendChild(_makeFallbackNotice());
            fallbackHandle = await _fallback(objText, { width, height, autoRotate: true });
            container.replaceChildren(fallbackHandle.element);
            return;
        }
        try {
            worker = new Worker(
                new URL("../worker/objThumbnail.worker.js", import.meta.url),
                { type: "module" }
            );
            registerWorker(`objThumb#${id}`, worker);
        } catch (e) {
            console.warn("[objThumbnail] worker spawn failed:", e?.message ?? e);
            fallbackHandle = await _fallback(objText, { width, height, autoRotate: true });
            container.replaceChildren(fallbackHandle.element);
            return;
        }
        worker.addEventListener("message", (ev) => {
            const m = ev.data;
            if (!m?.type) return;
            if (m.type === "init_ok") {
                worker.postMessage({ type: "mesh", objText });
            } else if (m.type === "mesh_ok") {
                badge.textContent = `${m.vertexCount}v · ${m.triangleCount}△`;
            } else if (m.type === "init_fail" || m.type === "mesh_fail") {
                // Tear down the worker path; bring up the main-thread fallback.
                worker.terminate();
                worker = null;
                (async () => {
                    fallbackHandle = await _fallback(objText, { width, height, autoRotate: true });
                    container.replaceChildren(fallbackHandle.element);
                })();
            } else if (m.type === "error") {
                console.warn("[objThumbnail] worker error:", m.message);
            }
        });
        const offscreen = canvas.transferControlToOffscreen();
        worker.postMessage({ type: "init", canvas: offscreen, width, height }, [offscreen]);
    }

    function _makeFallbackNotice() {
        const note = document.createElement("div");
        note.style.cssText = "position:absolute; left:0; top:0; right:0; bottom:0; display:flex; align-items:center; justify-content:center; color:#789; font-size:9px;";
        note.textContent = "thumb pending…";
        return note;
    }

    init();

    return {
        element: container,
        dispose() {
            if (disposed) return;
            disposed = true;
            if (worker) {
                try { worker.postMessage({ type: "dispose" }); } catch {}
                try { worker.terminate(); } catch {}
                worker = null;
            }
            if (fallbackHandle?.dispose) {
                try { fallbackHandle.dispose(); } catch {}
            }
        },
    };
}
