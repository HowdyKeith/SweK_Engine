// ui/threeVR.js -- v4212 -- the EASY half of VR, for the pages that use three.js.
//
// v4179's finding was that every WebXR guide says `renderer.xr.enabled = true` and
// `renderer.setAnimationLoop(fn)`, and that THOSE ARE three.js WebGLRenderer METHODS which main.js does not
// have -- the engine draws through render/voxelrenderer.js over raw WebGL2. So the engine got the raw path.
//
// But this tree also has pages that DO use three: glb_viewer, scene-view, aquarelle, splat_viewer. For those
// the guide's answer is exactly right, and it was never applied. This file is that answer, written once
// instead of four times.
//
// *** THE ONE MISTAKE THIS CONVERSION INVITES, AND IT IS SILENT ON A MONITOR: *** a loop moved to
// setAnimationLoop that STILL calls requestAnimationFrame inside itself now runs TWICE PER FRAME. three drives
// it once from its own scheduler and the leftover rAF drives it again. On a desktop that reads as "the
// animation got faster", which people accept; in a headset it is double the work for a halved framerate. The
// conversion is therefore not "add setAnimationLoop" -- it is "add setAnimationLoop AND REMOVE THE rAF", and
// tools/ship/xrStereo-selfcheck.mjs asserts on the converted pages that no loop does both.
//
// The second reason to centralise: three's WebXR needs the session handed to `renderer.xr.setSession(session)`
// after it is requested. Miss that and the session opens, the headset shows the loading grid, and the page
// keeps rendering to the monitor -- no error anywhere.

/**
 * Is immersive VR actually reachable? Three distinct answers, never one flat false, for the same reason
 * engine/xrSession.mjs's describeSupport separates them: "this browser has no WebXR", "this browser has
 * WebXR but no headset is connected", and "yes" are three different things to tell somebody.
 */
export async function describeThreeVRSupport(nav = (typeof navigator !== "undefined" ? navigator : null)) {
    if (!nav || !nav.xr) return { ok: false, kind: "no-webxr", reason: "this browser has no navigator.xr" };
    if (typeof nav.xr.isSessionSupported !== "function") {
        return { ok: false, kind: "no-webxr", reason: "navigator.xr has no isSessionSupported" };
    }
    try {
        const supported = await nav.xr.isSessionSupported("immersive-vr");
        return supported
            ? { ok: true, kind: "ready", reason: "a headset is reachable" }
            : { ok: false, kind: "no-device", reason: "WebXR is present but no immersive-vr device is available" };
    } catch (e) {
        return { ok: false, kind: "error", reason: (e && e.message) ? e.message : String(e) };
    }
}

/**
 * Turn a conventional three.js page into a VR-capable one.
 *
 * @param opts.renderer  a THREE.WebGLRenderer
 * @param opts.loop      the page's per-frame function. IT MUST NOT CALL requestAnimationFrame ITSELF --
 *                       see the header. Passing one that does is the bug this file exists to prevent.
 * @param opts.mount     where to put the button (default document.body)
 * @param opts.label     button text
 * @param opts.onEnter / opts.onExit   optional callbacks
 * @returns { ok, loopInstalled, reason, button, enter, exit }
 *
 * `loopInstalled` is separate from `ok` ON PURPOSE. "No headset here" is a perfectly good outcome in which
 * the loop IS running; "this is not a three renderer" is one in which it is not, and the caller has removed
 * its own requestAnimationFrame by now, so it MUST be told the difference or the page silently freezes.
 *
 * setAnimationLoop is installed WHETHER OR NOT a headset is present: three falls back to window rAF when no
 * session is running, so the desktop path is identical and there is no second code path to keep in step.
 */
export async function enableThreeVR(opts = {}) {
    const { renderer, loop } = opts;
    if (!renderer || typeof renderer.setAnimationLoop !== "function") {
        return { ok: false, loopInstalled: false, reason: "no three.js renderer with setAnimationLoop", button: null };
    }
    if (typeof loop !== "function") return { ok: false, loopInstalled: false, reason: "no loop function", button: null };

    renderer.xr.enabled = true;
    renderer.setAnimationLoop(loop);          // replaces the page's own rAF -- the page must not keep one

    const support = await describeThreeVRSupport();
    if (!support.ok) {
        // Not an error and not a button. A dead "Enter VR" on a machine with no headset is worse than none.
        try { console.log("[threeVR] " + support.reason + " -- the page runs normally; no VR button shown"); } catch {}
        return { ok: false, loopInstalled: true, reason: support.reason, button: null, enter: null, exit: null };
    }

    let session = null;
    const exit = async () => { try { await session?.end(); } catch {} };
    const enter = async () => {
        if (session) return { ok: false, reason: "already in VR" };
        try {
            session = await navigator.xr.requestSession("immersive-vr", {
                optionalFeatures: ["local-floor", "bounded-floor"],
            });
            // *** WITHOUT THIS LINE THE SESSION OPENS AND THE PAGE KEEPS DRAWING TO THE MONITOR. *** three
            // has to be told which session to render into; there is no error if it never is.
            await renderer.xr.setSession(session);
            session.addEventListener("end", () => {
                session = null;
                if (btn) btn.textContent = opts.label || "Enter VR";
                try { opts.onExit?.(); } catch {}
            });
            if (btn) btn.textContent = "Exit VR";
            try { opts.onEnter?.(session); } catch {}
            return { ok: true, reason: "in VR" };
        } catch (e) {
            session = null;                        // never stick in a half-entered state -- the button must work again
            const reason = (e && e.message) ? e.message : String(e);
            try { console.warn("[threeVR] " + reason); } catch {}
            return { ok: false, reason };
        }
    };

    let btn = null;
    if (opts.button !== false && typeof document !== "undefined") {
        btn = document.createElement("button");
        btn.id = "three-vr-btn";
        btn.textContent = opts.label || "Enter VR";
        Object.assign(btn.style, {
            position: "fixed", right: "12px", bottom: "12px", zIndex: "10040",
            background: "#173656", color: "#cfe6ff", border: "1px solid #2f628f", borderRadius: "9px",
            padding: "8px 14px", font: "12px system-ui,sans-serif", cursor: "pointer",
        });
        btn.addEventListener("click", () => { if (session) exit(); else enter(); });
        (opts.mount || document.body).appendChild(btn);
    }

    return { ok: true, loopInstalled: true, reason: support.reason, button: btn, enter, exit };
}

export default enableThreeVR;
