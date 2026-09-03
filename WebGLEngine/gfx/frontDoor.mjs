// WebGLEngine/gfx/frontDoor.mjs -- v4407
//
// *** THE FRONT DOOR REACHES NO WEBGPU AND NO TSL, AND IT TELLS YOU YOUR BROWSER HAS WEBGPU ANYWAY. ***
//
// MEASURED with the tree's own resolver (tools/ship/moduleRefs.mjs specifiers + resolveSpec, walked forward
// from main.js): main.js reaches 692 modules and NOT ONE of these --
//
//     gfx/device.js              538 lines, requestDevice / detectBackends / webgl2Backend / webgpuBackend,
//                                39 mentions of compute and storage
//     render/tslSource.mjs       v4320-v4338: a TSL graph compiled by three's node builders to BOTH WGSL and
//                                GLSL, transplanted into device.js's own shell, held to the hand-written
//                                pipeline's picture BYTE FOR BYTE ON BOTH BACKENDS. Compute passes, buffer
//                                reads, atomics, workgroup-shared memory
//     render/badTvTsl.mjs        one of six TSL modules; the others are blackbody, fleet, physics, brain
//     ui/orreryPost.mjs          the device post chain
//     ui/webrtxBrowser.js        Vulkan's ray tracing pipeline as pure WebGPU compute
//
// All of it lives on side pages -- tsl-rig.html, tsl-probe.html, orrery-gpu.html, webrtx.html -- that the
// front door never reaches. What main.js DOES contain is one line:
//
//     if (navigator.gpu) console.log("[wgsl] this browser HAS WebGPU -- run ... to compare against it")
//
// It advertises the capability and then offers nothing that uses it. This module is the door, and it is
// deliberately small: no renderer, no pass, no effect. It answers three questions honestly and lazily imports
// the device only when asked.
//
// ---- *** THE ONE THING THAT MADE THIS WORTH A MODULE RATHER THAN A LINE *** ----------------------------------
//
// gfx/device.js's detectBackends() reads `!!navigator.gpu` and nothing else. On an insecure origin navigator.gpu
// is UNDEFINED, so it reports webgpu:false and requestDevice() silently falls through to webgl2 -- which means
// A CALLER CANNOT TELL "THIS BROWSER HAS NO WEBGPU" FROM "THIS URL HAS NO WEBGPU". Those are different facts
// with different fixes: one is a machine to replace, the other is an address to change.
//
// And it is not a hypothetical, it is the address the engine ships as. SweK's primary origin is
// http://<lan-ip>:8787 -- neither https nor localhost. v4118 measured it in Chromium, one server, two origins:
// from 127.0.0.1 isSecureContext is true and navigator.gpu exists; from a LAN IP isSecureContext is false and
// it is undefined. THE SAME BROWSER, THE SAME MACHINE, THE SAME GPU. So on the URL Keith opens, the engine's
// entire WebGPU stack is unreachable for a reason that has nothing to do with the hardware -- and v4118 has the
// scar to prove reporting it wrong is expensive: voxtral.html's Load button did nothing at all on the LAN
// because its gate served the page from localhost, WHICH IS A SECURE CONTEXT. A probe run on the wrong ORIGIN
// measures a different browser.
//
// So this door takes the ORIGIN FIRST, before it looks at an adapter, and it distinguishes WITHHELD from ABSENT
// by name. Reporting "no WebGPU adapter" on a LAN address would be blaming the machine for what the URL did.
//
// Browser-pure by construction: it imports gfx/device.js and nothing else, lazily, and gfx/device.js imports
// only render/wgslLayout.mjs and render/wgslSpec.mjs. No node: specifier is reachable from here, which is what
// lets the front door import it at all -- see tools/ship/browserNodeGuard-selfcheck.mjs, and v4400, where a
// fallback that reached node:fs from a page went red inside one verify.
"use strict";

/** The three verdicts a backend can have, kept apart because they have different fixes. */
export const BACKEND_STATE = Object.freeze({
    PRESENT: "present",       // the browser has it and this origin may use it
    WITHHELD: "withheld",     // the browser has it and THIS ORIGIN may not -- change the address, not the box
    ABSENT: "absent",         // the browser does not have it at all
    NO_DEVICE: "no-device",   // the API is there, this origin may use it, AND IT STILL DID NOT ANSWER
});

/**
 * *** WHICH OF FOUR STEPS STOPPED WebGPU, BECAUSE "PRESENT" WAS NOT THE SAME AS "ANSWERED". ***
 *
 * This function exists because the gate caught the door lying. On loopback -- a secure origin, navigator.gpu
 * defined, state PRESENT -- gfx/device.js still returned the webgl2 backend, and open() reported `why: null`,
 * "nothing to explain". Something plainly needed explaining. gfx/device.js's webgpuBackend() returns null at
 * FOUR separate points and tells nobody which: no navigator.gpu, requestAdapter() giving null, the canvas
 * having no "webgpu" context, or requestDevice() failing.
 *
 * *** AND MY FIRST GUESS AT WHICH ONE WAS WRONG, WHICH IS WHY THE STEP IS MEASURED AND NOT ASSERTED. *** I
 * wrote "the canvas context" into this header and the gate read "adapter": in a headless shell launched
 * without --enable-unsafe-webgpu, navigator.gpu EXISTS and requestAdapter() RETURNS NULL. Add that flag, same
 * origin and same box, and the adapter arrives and the backend is webgpu. So there are THREE distinct reasons
 * a device does not turn up here -- the ADDRESS withholds the API, the LAUNCH withholds the adapter, or the
 * browser genuinely has neither -- and detectBackends() reports webgpu:false for two of them without
 * distinguishing either.
 *
 * So the door diagnoses the steps in order and names the first that fails. It asks for its own adapter rather
 * than reading device.js's internals: a diagnosis that shared the code it is diagnosing could not disagree
 * with it.
 */
export async function webgpuDiagnosis(w = (typeof window !== "undefined" ? window : undefined), canvas = null) {
    const nav = w && w.navigator;
    if (!nav || !nav.gpu) return { step: "api", why: "navigator.gpu is undefined -- no WebGPU API on this origin" };
    let adapter = null;
    try { adapter = await nav.gpu.requestAdapter(); } catch (e) { return { step: "adapter", why: "requestAdapter() threw: " + ((e && e.message) || e) }; }
    if (!adapter) return { step: "adapter", why: "navigator.gpu exists and requestAdapter() returned NULL -- the API is present and no adapter is" };
    const cv = canvas || (w.document && w.document.createElement ? w.document.createElement("canvas") : null);
    let ctx = null;
    try { ctx = cv && cv.getContext ? cv.getContext("webgpu") : null; } catch (e) { ctx = null; }
    if (!ctx) return { step: "canvas", why: "an adapter exists but canvas.getContext(\"webgpu\") returned null -- " +
        "the GPU is reachable and the CANVAS is not a WebGPU surface here, which is not the same failure as " +
        "having no adapter and is not the one this container exhibits" };
    return { step: "ok", why: null };
}

/** Every API SweK uses that a browser hands out only on a secure origin. v4118's list, measured not guessed. */
export const SECURE_ONLY = Object.freeze(["navigator.gpu", "crypto.subtle", "VideoEncoder",
                                          "navigator.mediaDevices.getUserMedia", "navigator.storage.estimate"]);

/**
 * Is this origin allowed the secure-only APIs? Taken FIRST, before any adapter is asked for.
 *
 * A browser grants them on https, on localhost and on 127.0.0.1, and withholds them everywhere else --
 * including a plain LAN IP, which is what SweK serves from. isSecureContext is the browser's own answer and is
 * preferred over sniffing the hostname; the hostname is used only to say WHY.
 */
export function originVerdict(w = (typeof window !== "undefined" ? window : undefined)) {
    if (!w || !w.location) return { secure: false, origin: null, loopback: false,
                                    why: "no window.location -- this is not a page" };
    const host = String(w.location.hostname || "");
    const proto = String(w.location.protocol || "");
    const loopback = host === "localhost" || host === "127.0.0.1" || host === "[::1]" || host === "::1";
    const secure = typeof w.isSecureContext === "boolean" ? w.isSecureContext : (proto === "https:" || loopback);
    return {
        secure, loopback, origin: w.location.origin || (proto + "//" + host),
        why: secure ? null
            : `this origin is ${w.location.origin} -- neither https nor a loopback host, so the browser ` +
              `withholds ${SECURE_ONLY.join(", ")} from it. THE MACHINE AND THE GPU ARE FINE; THE ADDRESS IS ` +
              "NOT. Open the engine over the tunnel, or from localhost on the box itself.",
    };
}

/**
 * *** WITHHELD OR ABSENT, WHICH detectBackends() CANNOT SAY. *** It reads !!navigator.gpu, and an undefined
 * navigator.gpu means both things at once. Given the origin verdict the two come apart: on an insecure origin a
 * missing navigator.gpu is WITHHELD and says so; on a secure one it is genuinely ABSENT.
 */
export function backendState(detected, origin) {
    const out = {};
    out.webgl2 = detected.webgl2 ? BACKEND_STATE.PRESENT : BACKEND_STATE.ABSENT;
    if (detected.webgpu) out.webgpu = BACKEND_STATE.PRESENT;
    else out.webgpu = origin && origin.secure === false ? BACKEND_STATE.WITHHELD : BACKEND_STATE.ABSENT;
    return out;
}

let _opened = null;

/**
 * Open the device, honestly. Returns the same shape whether it succeeded or not, and `why` is never null when
 * `ready` is false.
 *
 * requestDevice() never throws -- it falls back to nullBackend -- so the interesting output is not "did it
 * work" but WHICH backend answered and WHY the better one did not. `backend` is what actually answered;
 * `state` is the three-way verdict per backend; `why` explains a downgrade in the terms that fix it.
 */
export async function open(opts = {}) {
    if (_opened && !opts.fresh) return _opened;
    const w = opts.window || (typeof window !== "undefined" ? window : undefined);
    const origin = originVerdict(w);
    let device = null, mod = null, err = null;
    try {
        mod = await import("./device.js");
    } catch (e) { err = String((e && e.message) || e); }
    if (!mod) {
        return (_opened = { ready: false, backend: null, origin, state: null,
                            why: "gfx/device.js did not load: " + err });
    }
    const detected = mod.detectBackends();
    const state = backendState(detected, origin);
    try {
        device = await mod.requestDevice(opts.canvas || null, { ...opts, _backends: detected });
    } catch (e) { err = String((e && e.message) || e); }
    const backend = device ? (device.backend || device.name || "unknown") : null;
    const wanted = opts.prefer || "webgpu";
    // *** IF WebGPU READ PRESENT AND SOMETHING ELSE ANSWERED, DIAGNOSE IT. *** This branch is the one the gate
    // added: "present" is a fact about the API and "answered" is a fact about the pipeline, and reporting
    // `why: null` because the first was true is how a door ends up saying nothing needed explaining while a
    // downgrade sat in front of it.
    let diagnosis = null;
    if (wanted === "webgpu" && state.webgpu === BACKEND_STATE.PRESENT && backend !== "webgpu") {
        diagnosis = await webgpuDiagnosis(w, opts.canvas || null);
        if (diagnosis.step !== "ok") state.webgpu = BACKEND_STATE.NO_DEVICE;
    }
    const downgraded = wanted === "webgpu" && state.webgpu !== BACKEND_STATE.PRESENT;
    _opened = {
        ready: !!device, backend, origin, state, detected, diagnosis,
        capabilities: device && mod.CAPABILITIES ? (mod.CAPABILITIES[backend] || null) : null,
        why: !device ? ("gfx/device.js returned nothing: " + (err || "no reason given"))
            : !downgraded ? null
            : state.webgpu === BACKEND_STATE.WITHHELD
                ? "WebGPU is WITHHELD, not absent. " + origin.why
            : state.webgpu === BACKEND_STATE.NO_DEVICE
                ? `WebGPU is present and this origin may use it, and it still did not answer at the ` +
                  `"${diagnosis.step}" step: ${diagnosis.why}`
                : "this browser has no WebGPU API at all, so the device is " + backend,
    };
    return _opened;
}

/** What the door has already answered, without opening anything. null before the first open(). */
export const status = () => _opened;

/**
 * *** THE REACH, AS TWO FROZEN FACTS AND ONE DERIVED ONE. ***
 *
 * WEBGPU_STACK is the named population: every module that is WebGPU or TSL and lives outside the front door's
 * reach. CLOSED_AT_V4407 is what this round actually connected. What is STILL unreached is neither of those --
 * it is the difference, and a gate computes it rather than reading a third list, because a count typed beside
 * the rows it totals is the defect this tree has spent hundreds of rounds pulling out of itself.
 *
 * The ratchet is on the difference: it may only SHRINK. This round closes one of ten and says so; it does not
 * pretend the TSL chain arrived with it.
 */
export const WEBGPU_STACK = Object.freeze([
    "gfx/device.js",
    "render/tslSource.mjs",
    "render/badTvTsl.mjs",
    "render/badTvDevicePass.mjs",
    "render/blackbodyTsl.mjs",
    "render/fleetTsl.mjs",
    "render/physicsTsl.mjs",
    "render/brainTsl.mjs",
    "ui/orreryPost.mjs",
    "ui/webrtxBrowser.js",
]);
/** What v4407 connected. Everything else in WEBGPU_STACK is still on the far side of the door. */
export const CLOSED_AT_V4407 = Object.freeze(["gfx/device.js"]);
/** Modules main.js reached BEFORE this round, and after. Both measured with tools/ship/moduleRefs.mjs. */
export const MAIN_REACH_BEFORE_V4407 = 692;
export const MAIN_REACH_AFTER_V4407 = 695;

export const ADDED_AT_V4407 = Object.freeze([
    "BACKEND_STATE", "SECURE_ONLY", "originVerdict", "backendState", "webgpuDiagnosis", "open", "status",
]);
