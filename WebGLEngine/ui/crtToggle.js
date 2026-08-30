// WebGLEngine/ui/crtToggle.js -- v4121
//
// ONE CRT TOGGLE, MOUNTED ON ANY CANVAS. Keith: put it on the ES pages too.
//
// *** THIS EXISTS SO THERE IS NOT A FOURTH COPY. *** pipboy-models.html wires render/crtPass.js into its own
// texture pipeline and fallout.html wires it through a DOM rasteriser; both were bespoke because their
// plumbing genuinely differs. The ES/EV pages do NOT differ from each other -- they are a canvas on a page --
// and writing the same button, overlay, resize handling and rAF loop into each of them is the second-copy
// defect this session has watched land repeatedly. One mount function, three call sites.
//
// *** THE OVERLAY IS pointer-events:none, AND THAT IS AN HONEST HALF-MEASURE. *** Input still reaches the game
// underneath, so these stay playable with the effect on -- but barrel distortion MOVES every pixel, so what
// you click is not quite what you see. Inverse-mapping pointer coordinates through crtModel.js's barrel() is
// possible and is not done here. That is why the DEFAULT preset is `trinitron` (curvature 0.04, a few pixels
// at the edge) rather than `arcade` (0.18, which looks better and lies to your mouse). The selector offers
// both and the page says which.
//
// *** AND IT SAMPLES INSIDE requestAnimationFrame ON PURPOSE. *** A WebGL canvas's drawing buffer is cleared
// after compositing unless the context was made with preserveDrawingBuffer -- so reading one at an arbitrary
// moment gives BLACK. Running inside rAF keeps the read next to the page's own draw, which is the half of the
// fix that does not cost anything; the ev/ views also set the flag, because their draw order is theirs.
"use strict";
import { makeCrtPass, PRESETS } from "../render/crtPass.js";

const PRESET_NAMES = ["trinitron", "pipboy", "arcade"];

/**
 * @param {HTMLCanvasElement} canvas   the surface to filter -- 2D or WebGL
 * @param {{preset?:string, storageKey?:string, label?:string, corner?:string}} [opts]
 * @returns {{toggle:Function, set:Function, isOn:Function, dispose:Function}|null}
 */
export function mountCrtToggle(canvas, opts = {}) {
    if (!canvas || typeof document === "undefined") return null;
    const key = opts.storageKey || ("swek.crt." + (canvas.id || "canvas"));
    let preset = opts.preset || "trinitron";
    let on = false, pass = null, raf = 0;

    const wrap = document.createElement("div");
    wrap.style.cssText = "position:fixed;z-index:99999;display:flex;gap:6px;align-items:center;" +
        "font:12px/1 ui-monospace,Consolas,monospace;" + (opts.corner || "right:10px;bottom:10px;");
    const btn = document.createElement("button");
    btn.style.cssText = "background:#10231a;color:#6fe39a;border:1px solid #224a36;border-radius:6px;" +
                        "padding:5px 10px;cursor:pointer;font:inherit;";
    const sel = document.createElement("select");
    sel.style.cssText = "background:#0d1a14;color:#6fe39a;border:1px solid #224a36;border-radius:6px;" +
                        "padding:4px;font:inherit;display:none;";
    for (const n of PRESET_NAMES) { const o = document.createElement("option"); o.value = o.textContent = n; sel.appendChild(o); }
    sel.value = preset;
    wrap.appendChild(btn); wrap.appendChild(sel);
    document.body.appendChild(wrap);

    // The overlay tracks the source canvas's box exactly, so the effect lands ON the game rather than beside it.
    const out = document.createElement("canvas");
    out.style.cssText = "position:absolute;pointer-events:none;z-index:9998;display:none;";
    document.body.appendChild(out);

    function place() {
        const r = canvas.getBoundingClientRect();
        out.style.left = (r.left + window.scrollX) + "px";
        out.style.top = (r.top + window.scrollY) + "px";
        out.style.width = r.width + "px";
        out.style.height = r.height + "px";
    }

    function frame() {
        if (!on) return;
        const w = canvas.width | 0, h = canvas.height | 0;
        if (w > 0 && h > 0) {
            if (!pass) { pass = makeCrtPass(w, h); if (!pass) { fail("no WebGL2"); return; } }
            else if (pass.canvas.width !== w || pass.canvas.height !== h) pass.resize(w, h);
            try {
                pass.render(canvas, PRESETS[preset] || PRESETS.trinitron);
                if (out.width !== w || out.height !== h) { out.width = w; out.height = h; }
                out.getContext("2d").drawImage(pass.canvas, 0, 0);
            } catch (e) { /* one bad frame is not worth tearing the page down */ }
            place();
        }
        raf = requestAnimationFrame(frame);
    }

    function fail(why) { on = false; btn.textContent = "CRT: " + why; out.style.display = "none"; sync(); }
    function sync() {
        btn.textContent = on ? "CRT: on" : "CRT: off";
        sel.style.display = on ? "" : "none";
        out.style.display = on ? "block" : "none";
        // *** THE SOURCE IS HIDDEN, NOT LEFT SHOWING UNDERNEATH. *** An opaque CRT canvas over a live one is
        // two copies of the same scene compositing at slightly different geometry, and the uncurved original
        // shows around the curved edges as a bright rim.
        canvas.style.visibility = on ? "hidden" : "";
        try { localStorage.setItem(key, on ? preset : ""); } catch (e) {}
    }

    function set(v) {
        on = !!v;
        cancelAnimationFrame(raf);
        sync();
        if (on) { place(); frame(); }
    }
    btn.onclick = () => set(!on);
    sel.onchange = () => { preset = sel.value; try { localStorage.setItem(key, on ? preset : ""); } catch (e) {} };
    window.addEventListener("resize", place);

    try { const saved = localStorage.getItem(key); if (saved && PRESETS[saved]) { preset = saved; sel.value = saved; set(true); } else sync(); }
    catch (e) { sync(); }

    return {
        toggle: () => set(!on), set, isOn: () => on,
        dispose() { cancelAnimationFrame(raf); window.removeEventListener("resize", place);
                    wrap.remove(); out.remove(); canvas.style.visibility = ""; pass && pass.dispose(); },
    };
}

export { PRESET_NAMES };
