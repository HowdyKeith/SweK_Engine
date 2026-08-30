// FILE: engine/xrSession.mjs -- v4179
//
// WebXR for the SweK engine: the part that can be reasoned about and graded, separated from the part that
// needs a headset plugged in.
//
// *** THE FIRST THING TO SAY IS THAT THE OBVIOUS ANSWER IS WRONG HERE. *** Every WebXR guide says to call
// renderer.xr.enabled = true and renderer.setAnimationLoop(fn). That is a three.js WebGLRenderer method, and
// MAIN.JS DOES NOT USE three AT ALL -- it never imports it. The engine draws through render/voxelrenderer.js,
// a VoxelRenderer over raw WebGL2 (main.js:8633). So there is no renderer.xr to enable, and the three-based
// pages in this tree (glb_viewer, scene-view, splat_viewer, aquarelle) are a SEPARATE and much easier story.
// This module is the raw-WebGL2 path: navigator.xr, XRWebGLLayer, session.requestAnimationFrame, and one
// draw per eye.
//
// ---- WHAT MAKES THAT TRACTABLE IS THAT THE ENGINE CAN ALREADY DRAW TWICE ---------------------------------
// VoxelRenderer.render(chunks, camera, opts) accepts opts.viewport = [x, y, w, h] and asks the camera only
// for getViewProjMatrix(). That exists for the TV wall, and it is exactly what stereo needs: per eye, a
// viewport from XRWebGLLayer.getViewport(view) and a camera-shaped object carrying that eye's matrix. No
// renderer change is required, which is the reason this is a module and not a rewrite.
//
// ---- THE TRAP, NAMED UP FRONT ------------------------------------------------------------------------------
// *** MATRIX ORDER IS THE SILENT ONE. *** XRView gives a projectionMatrix and a transform. The VIEW matrix is
// transform.INVERSE.matrix -- the inverse of where the eye is -- and the product must be projection * view,
// in that order, column-major. Every wrong combination still renders SOMETHING: swap the order and the world
// is inside out; use transform.matrix instead of its inverse and the world moves with your head instead of
// staying put. Nothing throws, and in a headset a wrong one is not merely incorrect, it is nauseating. So the
// multiply is its own exported function with its own checks.
//
// Everything here is pure or state-machine: no WebXR calls at module scope, no GL, so the gate drives all of
// it in node against XRView-shaped fixtures.
"use strict";

/**
 * Column-major 4x4 multiply, the convention WebGL and WebXR both use.
 * C = A * B, so applying C to a point is A applied after B.
 */
export function mat4Multiply(a, b, out = new Float32Array(16)) {
    for (let c = 0; c < 4; c++) {
        for (let r = 0; r < 4; r++) {
            let s = 0;
            for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k];
            out[c * 4 + r] = s;
        }
    }
    return out;
}

/** The 4x4 identity, for callers and for the gate's fixtures. */
export function mat4Identity(out = new Float32Array(16)) {
    out.fill(0); out[0] = out[5] = out[10] = out[15] = 1; return out;
}

/**
 * Turn one XRView into the camera shape VoxelRenderer.render() already accepts.
 *
 * @param view an XRView, or anything with the same shape: { projectionMatrix, transform: { position,
 *             inverse: { matrix } } }. Taking a SHAPE rather than a real XRView is what lets the gate drive
 *             this without a headset, and it costs nothing at runtime.
 * @param base the engine camera, so fields the renderer reads but XR does not supply (moveSpeed, flags) are
 *             inherited rather than invented. The POSE always comes from XR.
 */
export function cameraForView(view, base = null) {
    if (!view || !view.projectionMatrix || !view.transform || !view.transform.inverse) {
        throw new TypeError("cameraForView: needs an XRView with projectionMatrix and transform.inverse");
    }
    // *** projection * view, AND view IS THE INVERSE TRANSFORM. *** See the note at the top: every other
    // combination renders something plausible and wrong.
    const viewProj = mat4Multiply(view.projectionMatrix, view.transform.inverse.matrix);
    const p = view.transform.position || { x: 0, y: 0, z: 0 };
    const cam = Object.create(base && typeof base === "object" ? base : Object.prototype);
    cam.position = { x: p.x, y: p.y, z: p.z };
    cam.getViewProjMatrix = () => viewProj;
    cam.getMatrix = () => viewProj;        // some passes ask by the other name
    cam.isXR = true;
    cam.xrEye = view.eye || "none";
    return cam;
}

/**
 * The viewport rect for a view, as VoxelRenderer wants it: [x, y, w, h].
 * XRViewport is already in framebuffer pixels with a bottom-left origin, which is GL's own convention, so
 * nothing is flipped here -- stated because flipping it "to be safe" is a one-line way to render each eye
 * upside down.
 */
export function viewportFor(layer, view) {
    const v = layer && typeof layer.getViewport === "function" ? layer.getViewport(view) : null;
    if (!v) return null;
    return [v.x, v.y, v.width, v.height];
}

/** Session states. Named rather than boolean, because "requesting" is a real state a double-click can hit. */
export const XR_IDLE = "idle", XR_REQUESTING = "requesting", XR_ACTIVE = "active", XR_ENDING = "ending";

/**
 * Feature detection that fails SAFE and says why. Never throws: a browser without WebXR, an insecure origin,
 * and a headset that is simply not plugged in are three different answers and a caller should be able to
 * tell them apart rather than getting one flat false.
 */
export async function describeSupport(nav = (typeof navigator !== "undefined" ? navigator : null)) {
    if (!nav) return { ok: false, reason: "no navigator (not a browser)" };
    if (!nav.xr) return { ok: false, reason: "this browser has no WebXR (navigator.xr is absent)" };
    if (typeof nav.xr.isSessionSupported !== "function") return { ok: false, reason: "navigator.xr exists but cannot be queried" };
    try {
        const supported = await nav.xr.isSessionSupported("immersive-vr");
        return supported ? { ok: true, reason: "immersive-vr is available" }
                         : { ok: false, reason: "the browser has WebXR but no immersive-vr device is available" };
    } catch (e) {
        // isSessionSupported REJECTS on an insecure origin rather than returning false, which is a
        // distinguishable and actionable cause -- WebXR requires HTTPS or localhost.
        return { ok: false, reason: "WebXR refused the query (usually an insecure origin -- WebXR needs HTTPS or localhost): " + (e && e.message ? e.message : e) };
    }
}

/**
 * The session lifecycle, as a state machine with no GL and no rendering in it.
 *
 * *** IT IS A STATE MACHINE BECAUSE ENTERING TWICE IS THE EASY BUG AND IT IS NOT RECOVERABLE. *** Requesting
 * a session is async and takes a visible moment in a headset; a second click during that window would leave
 * two sessions with one framebuffer, and the way out is a page reload. The "requesting" state is what makes
 * the second click a no-op instead.
 */
export class XRSessionManager {
    /**
     * @param opts.requestSession  (mode, init) => Promise<XRSession>. Injected, so the gate can drive the
     *                             whole lifecycle with a fake and no headset.
     * @param opts.onStateChange   (state, detail) => void
     */
    constructor(opts = {}) {
        this._request = opts.requestSession || null;
        this._onState = typeof opts.onStateChange === "function" ? opts.onStateChange : () => {};
        this.state = XR_IDLE;
        this.session = null;
        this.refSpace = null;
        this.lastError = null;
        this.entries = 0;
    }

    isActive() { return this.state === XR_ACTIVE; }

    _set(state, detail) { this.state = state; try { this._onState(state, detail); } catch (e) {} }

    /**
     * Enter VR. Returns { ok, reason }. NEVER throws and never leaves the machine in "requesting" -- a
     * request that fails must return to idle, or the button is dead for the rest of the page's life.
     */
    async enter(init = { optionalFeatures: ["local-floor", "bounded-floor"] }) {
        if (this.state === XR_ACTIVE) return { ok: false, reason: "already in VR" };
        if (this.state === XR_REQUESTING) return { ok: false, reason: "a session request is already in flight" };
        if (!this._request) return { ok: false, reason: "no requestSession was provided" };
        this._set(XR_REQUESTING);
        try {
            const session = await this._request("immersive-vr", init);
            if (!session) throw new Error("requestSession resolved with nothing");
            this.session = session;
            this.entries++;
            // The session can end from OUTSIDE -- the user takes the headset off, or presses the system
            // button. Without this listener the manager would believe it is still active forever.
            if (typeof session.addEventListener === "function") {
                session.addEventListener("end", () => { this._teardown("ended by the device or the user"); });
            }
            if (typeof session.requestReferenceSpace === "function") {
                try { this.refSpace = await session.requestReferenceSpace("local-floor"); }
                catch { this.refSpace = await session.requestReferenceSpace("local"); }   // every device has local
            }
            this._set(XR_ACTIVE, { session });
            return { ok: true, reason: "in VR" };
        } catch (e) {
            this.lastError = e;
            this.session = null; this.refSpace = null;
            this._set(XR_IDLE, { error: e });
            return { ok: false, reason: (e && e.message) ? e.message : String(e) };
        }
    }

    /** Leave VR. Safe to call when not in VR. */
    async exit() {
        if (this.state !== XR_ACTIVE) return { ok: false, reason: "not in VR" };
        this._set(XR_ENDING);
        const s = this.session;
        try { if (s && typeof s.end === "function") await s.end(); } catch (e) { this.lastError = e; }
        // Teardown runs whether or not end() resolved: a session that refused to end is still not one we
        // should keep rendering into.
        this._teardown("exited");
        return { ok: true, reason: "left VR" };
    }

    _teardown(why) {
        this.session = null; this.refSpace = null;
        if (this.state !== XR_IDLE) this._set(XR_IDLE, { why });
    }

    /**
     * Schedule the next frame from the RIGHT clock. In a session the display's callback comes from the
     * XRSession, not the window -- window.requestAnimationFrame keeps firing at the monitor's rate and the
     * headset never gets a frame. Falls back to the window when idle, so ONE call site serves both.
     */
    scheduleFrame(cb, win = (typeof window !== "undefined" ? window : null)) {
        if (this.state === XR_ACTIVE && this.session && typeof this.session.requestAnimationFrame === "function") {
            return { via: "session", handle: this.session.requestAnimationFrame(cb) };
        }
        if (win && typeof win.requestAnimationFrame === "function") return { via: "window", handle: win.requestAnimationFrame(cb) };
        return { via: "none", handle: null };
    }

    /**
     * The per-eye draw list for one XRFrame: [{ camera, viewport, eye }] in the order XR gave them.
     * Returns an EMPTY array when there is no pose -- which happens routinely while tracking is lost or the
     * headset is set down, and is not an error. Drawing the previous pose instead is worse than drawing
     * nothing: it is a frame of the world in the wrong place, which is what makes people ill.
     */
    viewsFor(frame, layer, baseCamera = null) {
        if (!frame || !this.refSpace || typeof frame.getViewerPose !== "function") return [];
        const pose = frame.getViewerPose(this.refSpace);
        if (!pose || !pose.views) return [];
        const out = [];
        for (const view of pose.views) {
            const viewport = viewportFor(layer, view);
            if (!viewport) continue;
            out.push({ camera: cameraForView(view, baseCamera), viewport, eye: view.eye || "none" });
        }
        return out;
    }

    stats() {
        return { state: this.state, active: this.isActive(), entries: this.entries,
                 hasSession: !!this.session, hasRefSpace: !!this.refSpace,
                 lastError: this.lastError ? String(this.lastError.message || this.lastError) : null };
    }
}

export default XRSessionManager;
