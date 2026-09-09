// FILE: ui/aiPresenceOrbWidget.js
//
// Mounts the AI-presence orb (render/aiPresenceOrbTsl.mjs + render/aiPresenceOrbState.mjs, the murmur-web
// hand-port tools/ship/nextRounds.mjs's ai-presence-orb-widget entry closed) into the LIVE engine, not just
// ai-presence-orb.html's standalone demo.
//
// *** WHERE, AND WHY NOT THE OBVIOUS SPOT: *** a stale comment in ui/graphicsSettings.js once pointed at a
// floating "AI MODELS" tab as the natural AI-adjacent HUD location; checked directly before trusting it --
// that tab (and the "GFX" one beside it) is retired, display:none since v436/v1531, superseded by
// ui/settingsHub.js. The real, CURRENT convention for a small persistent status element is
// ui/miniIconStack.js's bottom-left rail (mountMiniIcon) -- confirmed live in main.js today: Settings (order 0,
// pinned bottom), Audio (order 1), then Picker/Examiner, the nav pad, and others stacked above with no
// explicit order. mountMiniIcon() itself is DOM-only (a <button>, no canvas) -- it cannot host a rendered
// scene -- so this widget positions its OWN small canvas at the same left offset (44px) the rail uses,
// stacked clearly above the rail's own icons rather than fighting mountMiniIcon's dynamic reflow for a slot,
// which is built for buttons it owns and not for an externally-managed canvas.
//
// *** A SECOND, INDEPENDENT RENDERER, BY NECESSITY -- NAMED, NOT HIDDEN. *** main.js's own scene renders
// through a hand-rolled raw WebGL2 pipeline (gl.createProgram, no three.js anywhere in it); the orb is a
// three.js TSL graph, compiled by three's own node builder. There is no shared context to plug into without
// either rewriting the orb as raw GLSL against main.js's own pipeline (defeating the point of the TSL port) or
// rewriting main.js's renderer to speak three.js (a wildly larger change than one widget justifies). A second
// small canvas with its own THREE.WebGPURenderer -- the same shape every TSL demo page in this tree already
// uses standalone -- is the boundary this round draws, not a limitation nobody noticed.
//
// *** DISCIPLINE BORROWED FROM ui/stateOrb.js, THIS TREE'S OWN ESTABLISHED "SMALL PERSISTENT STATUS ORB"
// PRECEDENT: *** a hidden tab does zero work (paused via document.hidden, checked every frame, not just at
// mount); prefers-reduced-motion still shows the current state's colour (time is frozen, not blanked); devicePixelRatio capped at 2, the
// same ceiling render/badTvTsl.mjs's own demo pages use.
"use strict";

const DPR_CAP = 2;
const SIZE_CSS_PX = 44;   // matches ui/miniIconStack.js's ICON_W (34) plus a visible margin -- a presence orb reads smaller than its clickable footprint
const RAIL_LEFT_PX = 44;  // ui/miniIconStack.js's own left rail offset (v1967 -- clears the left-edge lcars-minitabs)
const RAIL_BOTTOM_PX = 340;   // clear of the rail's live icon count today (6 icons * 48px gap from bottom:60 tops out near 300) with headroom for more

let _mounted = null;

/**
 * Mount the orb widget once. Idempotent -- a second call returns the existing handle rather than doubling up.
 * `bridge` optionally overrides where THREE/TSL/the orb modules come from (tests only); production callers
 * pass nothing and get the real vendor/render paths.
 */
export async function mountAiPresenceOrbWidget(opts = {}) {
    if (typeof document === "undefined") return null;
    if (_mounted) return _mounted;

    const {
        threePath = "../vendor/three-webgpu/three.webgpu.js",
        tslPath = "../vendor/three-webgpu/three.tsl.js",
        orbPath = "../render/aiPresenceOrbTsl.mjs",
        statePath = "../render/aiPresenceOrbState.mjs",
    } = opts;

    let THREE, TSL, makeAiPresenceOrbTsl, createPresenceState;
    try {
        [THREE, TSL, { makeAiPresenceOrbTsl }, { createPresenceState }] = await Promise.all([
            import(/* @vite-ignore */ threePath), import(/* @vite-ignore */ tslPath),
            import(/* @vite-ignore */ orbPath), import(/* @vite-ignore */ statePath),
        ]);
    } catch (e) { console.warn("[aiPresenceOrbWidget] module load failed, not mounting:", e && e.message); return null; }

    const canvas = document.createElement("canvas");
    canvas.id = "ai-presence-orb-widget";
    canvas.title = "AI presence";
    Object.assign(canvas.style, {
        position: "fixed", left: RAIL_LEFT_PX + "px", bottom: RAIL_BOTTOM_PX + "px",
        width: SIZE_CSS_PX + "px", height: SIZE_CSS_PX + "px",
        borderRadius: "50%", cursor: "default", zIndex: "10050",
        border: "1px solid rgba(120,200,255,0.35)",
    });
    document.body.appendChild(canvas);

    let renderer = null;
    try {
        const rendererOpts = { canvas, forceWebGL: opts.forceWebGL === true, antialias: false, alpha: true };
        if (opts.forceWebGL === true) {
            // vendor/three-webgpu/three.webgpu.js's WebGLBackend.init() builds its own gl context from a
            // hardcoded attributes object (antialias/alpha/depth/stencil only) -- no renderer option reaches
            // it, so preserveDrawingBuffer above is silently dropped and any readPixels outside the render's
            // own task/rAF callback (this tree's own established gotcha -- see gfx/device.js, render/crtPass.js,
            // tools/ship/glCapture-selfcheck.mjs) reads back transparent black. The one escape hatch is
            // parameters.context: pre-create the context ourselves. Scoped to forceWebGL only -- the real
            // WebGPUBackend's own `context` getter treats parameters.context as a GPUCanvasContext and calls
            // .configure() on it, which a WebGL2 context does not have.
            rendererOpts.context = canvas.getContext("webgl2", { alpha: true, antialias: false, preserveDrawingBuffer: true });
        }
        renderer = new THREE.WebGPURenderer(rendererOpts);
        await renderer.init();
    } catch (e) {
        console.warn("[aiPresenceOrbWidget] renderer init failed, removing:", e && e.message);
        canvas.remove();
        return null;
    }

    const fx = makeAiPresenceOrbTsl(THREE, TSL, {});
    const state = createPresenceState("idle");

    function resize() {
        const dpr = Math.min(DPR_CAP, window.devicePixelRatio || 1);
        const px = Math.round(SIZE_CSS_PX * dpr);
        if (canvas.width !== px || canvas.height !== px) { canvas.width = px; canvas.height = px; renderer.setSize(px, px, false); }
    }
    resize();
    window.addEventListener("resize", resize);

    // real live signals this engine already dispatches (ai-presence-orb.html's own wiring, verbatim) --
    // idle/listening/thinking/responding react to something real; success/error have no live source in this
    // engine yet (tools/ship/nextRounds.mjs names the /ai/chat call site as the remaining piece) and are
    // exposed on window.aiPresenceOrb below for manual/console triggering until that exists.
    window.addEventListener("engine:wakeState", (e) => {
        const s = e.detail && e.detail.state;
        if (s === "idle") state.setState("idle");
        else if (s === "capturing") state.setState("listening");
        else if (s === "busy") state.setState("thinking");
    });
    window.addEventListener("engine:voiceTranscript", () => state.setState("thinking"));
    window.addEventListener("engine:voiceReply", () => state.setState("responding"));

    const reducedMotion = () => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
    let last = null, t0 = null, running = true, rafHandle = null;
    function frame(now) {
        if (!running) return;
        if (t0 === null) { t0 = now; last = now; }
        // a hidden tab does zero work -- not less, none, the same law ui/stateOrb.js's own header states and
        // measured before: still schedules the next frame so it resumes instantly when the tab returns.
        if (document.hidden) { rafHandle = requestAnimationFrame(frame); return; }
        const dt = Math.max(0, Math.min(0.1, (now - last) / 1000));   // see ai-presence-orb.html's own header: rAF's first timestamp can precede a performance.now() taken moments earlier
        last = now;
        const paused = reducedMotion();
        if (!paused) state.tick(dt, {});
        const p = state.getParams();
        fx.setKnobs({
            time: paused ? 0 : (now - t0) / 1000 * p.speed,
            glow: p.glow, depth: p.depth, hueShift: p.hueShift,
            presence: 0.5, clarity: 0.6, glintRate: 0.3, voice: p.voice,
            aspect: 1,   // the widget's own canvas is always square, unlike the standalone demo's full window
        });
        renderer.render(fx.scene, fx.camera);
        rafHandle = requestAnimationFrame(frame);
    }
    rafHandle = requestAnimationFrame(frame);

    const handle = {
        canvas, renderer, state,
        setState: (name) => state.setState(name),
        getState: () => state.state,
        remove() {
            running = false;
            if (rafHandle) cancelAnimationFrame(rafHandle);
            window.removeEventListener("resize", resize);
            canvas.remove();
            if (_mounted === handle) _mounted = null;
            if (window.aiPresenceOrb === handle) window.aiPresenceOrb = null;   // a removed widget must not leave a stale console handle behind
        },
    };
    _mounted = handle;
    window.aiPresenceOrb = handle;   // console-reachable for manual success/error triggering, matching window.phosphor's own convention
    return handle;
}
