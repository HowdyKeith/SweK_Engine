// WebGLEngine/engine/xrSession-selfcheck.mjs -- v4179
//
// GATES engine/xrSession.mjs.
//
// VR has a failure mode ordinary rendering does not: A WRONG FRAME IS NOT MERELY WRONG, IT MAKES PEOPLE ILL.
// And every way of getting the matrices wrong still renders something. Swap the multiply order and the world
// is inside out; use transform.matrix where transform.inverse.matrix belongs and the world moves with your
// head instead of staying put. Neither throws. Section 2 pins both by construction, with non-commuting
// fixtures so a coincidence cannot pass them.
//
// Section 4 is the one that makes the button work twice: a session request that FAILS must return the machine
// to idle. Leaving it in "requesting" is a dead button for the life of the page, and it is the natural
// outcome of a try block that sets state before the await and only clears it on success.
//
// Run: node engine/xrSession-selfcheck.mjs   (exit 0 all-pass, 1 on any fail)

import { mat4Multiply, mat4Identity, cameraForView, viewportFor, describeSupport,
         XRSessionManager, XR_IDLE, XR_REQUESTING, XR_ACTIVE } from "./xrSession.mjs";
import { readFileSync } from "node:fs";
import { codeOnly } from "../tools/ship/sourceScan.mjs";

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error("  FAIL  " + m); } };
const arr = (m) => Array.from(m).map((n) => Math.round(n * 1e6) / 1e6).join(",");
/** A column-major translation. */
const T = (x, y, z) => { const m = mat4Identity(); m[12] = x; m[13] = y; m[14] = z; return m; };
/** A column-major scale, which does NOT commute with a translation -- the point of using it here. */
const S = (s) => { const m = mat4Identity(); m[0] = m[5] = m[10] = s; return m; };

// 1) THE MULTIPLY OBEYS THE LAWS, in the column-major convention WebGL and WebXR share.
{
    const M = new Float32Array([1,2,3,4, 5,6,7,8, 9,10,11,12, 13,14,15,16]);
    ok(arr(mat4Multiply(mat4Identity(), M)) === arr(M), "I * M = M");
    ok(arr(mat4Multiply(M, mat4Identity())) === arr(M), "M * I = M");
    const A = T(1, 2, 3), B = S(2);
    ok(arr(mat4Multiply(A, B)) !== arr(mat4Multiply(B, A)),
        "the fixtures do NOT commute -- so an order check against them cannot pass by coincidence");
    // A*B means B applied first: scale then translate, so the translation is untouched by the scale
    const AB = mat4Multiply(A, B);
    ok(AB[12] === 1 && AB[13] === 2 && AB[14] === 3, "A*B applies B first: translate-after-scale leaves the translation unscaled");
    const BA = mat4Multiply(B, A);
    ok(BA[12] === 2 && BA[13] === 4 && BA[14] === 6, "and B*A scales the translation, which is the other answer -- so the convention is pinned, not assumed");
    // associativity
    const C = T(-5, 0, 1);
    ok(arr(mat4Multiply(mat4Multiply(A, B), C)) === arr(mat4Multiply(A, mat4Multiply(B, C))), "(A*B)*C = A*(B*C)");
    ok(mat4Multiply(A, B, new Float32Array(16)).length === 16, "an out parameter is written into, so a per-frame call allocates nothing");
}

// 2) *** THE TWO SILENT TRAPS. Both render something. Neither throws. In a headset both are nauseating. ***
{
    const proj = S(3);                       // stands in for a projection: does not commute with a translate
    const eye = T(7, 0, 0);                  // where the head is
    const inv = T(-7, 0, 0);                 // its inverse -- the VIEW matrix
    const view = { eye: "left", projectionMatrix: proj,
                   transform: { position: { x: 7, y: 0, z: 0 }, matrix: eye, inverse: { matrix: inv } } };
    const cam = cameraForView(view);
    const got = cam.getViewProjMatrix();

    ok(arr(got) === arr(mat4Multiply(proj, inv)),
        "the camera matrix is projection * transform.INVERSE -- the view matrix, which is what keeps the world still while your head moves");
    ok(arr(got) !== arr(mat4Multiply(proj, eye)),
        "and NOT projection * transform.matrix, which would make the world move WITH your head (the fixtures differ, so this is a real distinction)");
    ok(arr(got) !== arr(mat4Multiply(inv, proj)),
        "and NOT view * projection, the reversed order, which turns the world inside out");

    ok(cam.position.x === 7 && cam.position.y === 0 && cam.position.z === 0, "the eye POSITION comes from the transform, for the passes that read camera.position");
    ok(cam.isXR === true && cam.xrEye === "left", "the camera is marked as an XR eye, so a pass that must behave differently in VR can tell");
    ok(typeof cam.getMatrix === "function" && arr(cam.getMatrix()) === arr(got), "both matrix accessor names return the same thing -- the tree asks by two names");

    // inherits from the engine camera rather than inventing fields
    const base = { moveSpeed: 12, someFlag: true };
    const c2 = cameraForView(view, base);
    ok(c2.moveSpeed === 12 && c2.someFlag === true, "fields XR does not supply are INHERITED from the engine camera rather than left undefined");
    ok(c2.position.x === 7, "while the POSE always comes from XR, never from the base");

    let threw = null;
    try { cameraForView({ projectionMatrix: proj }); } catch (e) { threw = e; }
    ok(threw instanceof TypeError, "a view missing its transform is refused loudly rather than producing a silently wrong matrix");
}

// 3) THE VIEWPORT IS PASSED THROUGH UNFLIPPED. XRViewport is already framebuffer pixels, bottom-left origin,
//    which is GL's own convention -- "helpfully" flipping it renders each eye upside down.
{
    const layer = { getViewport: () => ({ x: 0, y: 0, width: 960, height: 1080 }) };
    ok(viewportFor(layer, {}).join(",") === "0,0,960,1080", "the rect passes through as [x, y, w, h]");
    const right = { getViewport: () => ({ x: 960, y: 0, width: 960, height: 1080 }) };
    ok(viewportFor(right, {}).join(",") === "960,0,960,1080", "including a non-zero x, which is how the right eye is placed");
    ok(viewportFor({}, {}) === null && viewportFor(null, {}) === null, "and a layer that cannot answer returns null rather than a bogus rect");
    const code = codeOnly(readFileSync(new URL("./xrSession.mjs", import.meta.url).pathname, "utf8"));
    ok(!/height - v\.y|- v\.height/.test(code), "no y-flip anywhere in the module");
}

// 4) *** THE LIFECYCLE, AND THE DEAD-BUTTON BUG. ***
{
    const mkSession = () => {
        const listeners = {};
        return { addEventListener: (n, f) => { listeners[n] = f; }, _fire: (n) => listeners[n] && listeners[n](),
                 requestReferenceSpace: async (kind) => ({ kind }), end: async function () { this._fire("end"); },
                 requestAnimationFrame: () => 7 };
    };

    // (a) a FAILED request returns to idle. Leaving it in "requesting" is a button that never works again.
    const bad = new XRSessionManager({ requestSession: async () => { throw new Error("no device"); } });
    const r1 = await bad.enter();
    ok(r1.ok === false && /no device/.test(r1.reason), "a failed request reports why");
    ok(bad.state === XR_IDLE, "*** and returns the machine to IDLE -- stuck in 'requesting' is a dead button for the life of the page ***");
    ok((await bad.enter()).reason === "no device", "so a second attempt is actually attempted rather than refused as already-in-flight");

    // (b) a request that resolves with nothing is a failure, not a success with a null session
    const empty = new XRSessionManager({ requestSession: async () => null });
    ok((await empty.enter()).ok === false && empty.state === XR_IDLE, "a request resolving with nothing is treated as a failure");

    // (c) the happy path, and double-entry
    const s = mkSession();
    const mgr = new XRSessionManager({ requestSession: async () => s });
    ok(mgr.state === XR_IDLE && !mgr.isActive(), "starts idle");
    ok((await mgr.enter()).ok === true && mgr.isActive(), "enters");
    ok(mgr.refSpace && mgr.refSpace.kind === "local-floor", "and asks for local-floor first, which is what gives a room its floor height");
    const dbl = await mgr.enter();
    ok(dbl.ok === false && /already/.test(dbl.reason), "a second enter while active is refused rather than opening a second session onto one framebuffer");

    // (d) the session ending from OUTSIDE -- headset removed, system button. Without the listener the
    //     manager believes it is active forever and keeps drawing into a dead framebuffer.
    s._fire("end");
    ok(mgr.state === XR_IDLE && !mgr.session, "*** a session ended by the DEVICE returns the manager to idle ***");
    ok((await mgr.exit()).ok === false, "and exiting afterwards is a no-op rather than an error");

    // (e) local-floor may be unavailable; local always exists
    const noFloor = mkSession();
    noFloor.requestReferenceSpace = async (kind) => { if (kind === "local-floor") throw new Error("unsupported"); return { kind }; };
    const m2 = new XRSessionManager({ requestSession: async () => noFloor });
    await m2.enter();
    ok(m2.isActive() && m2.refSpace.kind === "local", "a device without local-floor falls back to local rather than failing to enter");
}

// 5) *** THE CLOCK. This is the whole VR fix in one method. ***
//    In a session the display's frame callback comes from the XRSession. window.requestAnimationFrame keeps
//    firing at the MONITOR's rate and the headset never receives a frame -- the screen looks fine and the
//    headset is black, which is why this is checked rather than assumed.
{
    let winCalls = 0, sessCalls = 0;
    const win = { requestAnimationFrame: () => { winCalls++; return 1; } };
    const s = { addEventListener: () => {}, requestReferenceSpace: async () => ({}), end: async () => {},
                requestAnimationFrame: () => { sessCalls++; return 2; } };
    const mgr = new XRSessionManager({ requestSession: async () => s });

    ok(mgr.scheduleFrame(() => {}, win).via === "window", "outside a session, frames come from the window");
    ok(winCalls === 1 && sessCalls === 0, "and only the window was called");
    await mgr.enter();
    ok(mgr.scheduleFrame(() => {}, win).via === "session", "*** inside a session, frames come from the SESSION ***");
    ok(sessCalls === 1 && winCalls === 1, "and the window was NOT called that frame -- calling both would double-schedule the loop");
    await mgr.exit();
    ok(mgr.scheduleFrame(() => {}, win).via === "window", "and it returns to the window after leaving");
    ok(mgr.scheduleFrame(() => {}, null).via === "none", "with no window and no session it reports 'none' rather than throwing");
}

// 6) A MISSING POSE DRAWS NOTHING. Tracking loss is routine -- the headset is set down, or occluded. Drawing
//    the PREVIOUS pose is worse than drawing nothing: it is a frame of the world in the wrong place.
{
    const s = { addEventListener: () => {}, requestReferenceSpace: async () => ({}), end: async () => {}, requestAnimationFrame: () => 1 };
    const mgr = new XRSessionManager({ requestSession: async () => s });
    await mgr.enter();
    const layer = { getViewport: () => ({ x: 0, y: 0, width: 8, height: 8 }) };
    ok(mgr.viewsFor({ getViewerPose: () => null }, layer).length === 0, "no pose -> no views, so the frame draws nothing rather than repeating the last one");
    ok(mgr.viewsFor(null, layer).length === 0, "and a missing frame is handled too");

    const proj = mat4Identity(), inv = mat4Identity();
    const mkView = (eye) => ({ eye, projectionMatrix: proj, transform: { position: { x: 0, y: 0, z: 0 }, inverse: { matrix: inv } } });
    const views = mgr.viewsFor({ getViewerPose: () => ({ views: [mkView("left"), mkView("right")] }) }, layer);
    ok(views.length === 2, "a real pose gives one entry per eye");
    ok(views[0].eye === "left" && views[1].eye === "right", "in the order XR gave them");
    ok(views.every((v) => typeof v.camera.getViewProjMatrix === "function" && Array.isArray(v.viewport)),
        "each carrying the camera shape and the viewport rect VoxelRenderer.render() already accepts");

    // a view the layer has no viewport for is SKIPPED rather than drawn full-screen over the other eye
    const half = { getViewport: (v) => (v.eye === "left" ? { x: 0, y: 0, width: 8, height: 8 } : null) };
    ok(mgr.viewsFor({ getViewerPose: () => ({ views: [mkView("left"), mkView("right")] }) }, half).length === 1,
        "a view with no viewport is skipped, not drawn over the whole framebuffer");
}

// 7) SUPPORT DETECTION distinguishes its three different answers instead of returning one flat false.
{
    ok((await describeSupport(null)).ok === false, "no navigator -> not supported");
    ok(/no WebXR/.test((await describeSupport({})).reason), "a browser without navigator.xr says so");
    ok(/no immersive-vr device/.test((await describeSupport({ xr: { isSessionSupported: async () => false } })).reason),
        "WebXR present but no headset is a DIFFERENT answer from WebXR absent");
    const insecure = await describeSupport({ xr: { isSessionSupported: async () => { throw new Error("SecurityError"); } } });
    ok(insecure.ok === false && /insecure origin|HTTPS/.test(insecure.reason),
        "and a rejection is reported as the likely insecure origin, which is the actionable cause and the one that catches people on a LAN");
    ok((await describeSupport({ xr: { isSessionSupported: async () => true } })).ok === true, "and a real device reports ok");
}

// 8) THE MODULE STAYS PURE -- no WebXR at module scope, no GL, so it loads anywhere and the gate can drive it.
{
    const code = codeOnly(readFileSync(new URL("./xrSession.mjs", import.meta.url).pathname, "utf8"));
    ok(!/^\s*navigator\.xr/m.test(code), "navigator.xr is never touched at module scope");
    ok(!/gl\.|WebGL|createTexture/.test(code), "and there is no GL in it at all -- the rendering stays in the caller");
    ok(/requestSession: opts\.requestSession|this\._request = opts\.requestSession/.test(code),
        "requestSession is INJECTED, which is what lets this whole lifecycle be driven in node with no headset");
}

// 9) *** THE WIRING IN main.js. Three of these four failures are silent, and the first one is the entire
//    point of the round: a loop scheduled from the window never gives a headset a frame. ***
{
    const raw = readFileSync(new URL("../main.js", import.meta.url).pathname, "utf8");
    const code = codeOnly(raw);

    ok(/import\s*\{[^}]*XRSessionManager[^}]*\}\s*from/.test(code), "main.js imports the manager");
    ok(/new XRSessionManager\(/.test(code), "and constructs one");
    ok(/window\.swekVR\s*=/.test(code), "and exposes an entry point, since nothing else in the tree calls navigator.xr");

    // (a) THE CLOCK. Every real scheduling of the main loop must go through the manager.
    const realRaf = code.split("\n").filter((l) => /requestAnimationFrame\(loop\)/.test(l));
    ok(realRaf.length === 0,
        `the main loop is NEVER scheduled with a bare requestAnimationFrame any more (found ${realRaf.length} such lines in code with comments stripped)`);
    ok((code.match(/xr\.scheduleFrame\(loop\)/g) || []).length === 2,
        "and BOTH sites -- the reschedule at the top of the loop and the initial kick -- go through the manager");
    ok(/function loop\(t, xrFrame\)/.test(code), "the loop accepts the XRFrame, which only the session's clock supplies");

    // (b) THE POSE IS THIS FRAME'S. Holding a stale XRFrame and drawing from it is a frame of the world in
    //     the wrong place, which is the specific thing that makes people ill.
    const iAssign = code.indexOf("_xrFrame = xrFrame");
    const iUse = code.indexOf("_renderXRFrame(_xrFrame)");
    ok(iAssign > 0 && iUse > 0 && iAssign < iUse, "the frame is captured at the top of the loop and used later in the same pass, never carried across frames");
    ok(/_xrFrame = xrFrame \|\| null/.test(code), "and cleared to null outside a session rather than left holding the last one");

    // (c) THE DESKTOP BLOCK IS SKIPPED, NOT HALF-APPLIED. It assumes one camera and a full-screen quad.
    ok(/if \(xr\.isActive\(\) && _xrFrame\) \{ _renderXRFrame\(_xrFrame\); \} else \{/.test(code),
        "the stereo path is an either/or with the desktop render block, not an addition to it");
    ok(/close the non-XR branch/.test(raw), "and that branch is explicitly closed");

    // (d) *** THE DIRTY FLAG MUST NOT SKIP FRAMES IN VR. *** A skipped frame on a monitor is a saved frame;
    //     in a headset the display keeps its rate and REPROJECTS the last one, so a skipped frame is a wrong
    //     frame. This is the interaction between two features that were built three rounds apart.
    ok(/frameDirty\.setEnabled\(false\)/.test(code), "entering VR disables the dirty-flag skipping");
    const onState = code.slice(code.indexOf("onStateChange"), code.indexOf("onStateChange") + 700);
    ok(/_fdWas/.test(onState), "and remembers the previous setting");
    ok(/frameDirty\.setEnabled\(xr\._fdWas\)/.test(code), "restoring it on exit rather than leaving the flag off for the rest of the session");

    // (e) makeXRCompatible BEFORE the session. Async, and everything still works on the desktop without it,
    //     which is why it is the easiest line in WebXR to omit.
    const req = code.slice(code.indexOf("requestSession: async"), code.indexOf("requestSession: async") + 500);
    ok(/makeXRCompatible/.test(req), "the GL context is made XR-compatible");
    const iCompat = req.indexOf("makeXRCompatible"), iReq = req.indexOf("navigator.xr.requestSession");
    ok(iCompat > 0 && iReq > 0 && iCompat < iReq, "and BEFORE the session is requested -- afterwards is too late, and nothing on the desktop notices");
    ok(/new XRWebGLLayer\(session, gl\)/.test(req) && /updateRenderState/.test(req),
        "and the session is given an XRWebGLLayer over the engine's own context, which is what a headset draws into");

    // (f) the framebuffer is cleared ONCE for both eyes, not per eye
    const rx = code.slice(code.indexOf("function _renderXRFrame"), code.indexOf("function _renderXRFrame") + 900);
    ok(/bindFramebuffer\(gl\.FRAMEBUFFER, layer\.framebuffer\)/.test(rx), "the stereo draw binds the headset's framebuffer");
    ok((rx.match(/gl\.clear\(/g) || []).length === 1, "and clears it ONCE -- clearing per eye would erase the first eye while drawing the second");
    ok(/if \(!views\.length\) return false/.test(rx), "and a frame with no pose draws nothing rather than repeating the last one");
}

console.log(`xrSession-selfcheck: ${pass} passed, ${fail} failed`);
console.log("unchecked here: an actual headset. Every matrix law, both silent traps, the full lifecycle and the\n" +
            "frame-clock switch are settled against XRView-shaped fixtures; whether a Quest is happy with the\n" +
            "result wants a person and a device.");
process.exit(fail ? 1 : 0);
