// ui/localModelProbe.js -- CAN THIS BOX RUN A GENERATIVE MODEL IN THE PAGE, ANSWERED BEFORE ANYTHING DOWNLOADS.
//
// v4007 -- Keith, on kessler/gemma-gem: "a page that reports whether this box can actually run it (WebGPU
// adapter, reported VRAM, model cache present) before anything downloads a gigabyte."
//
// *** THE ONE THING HE ASKED FOR THAT A BROWSER WILL NOT TELL YOU IS THE VRAM. *** There is no API for it.
// WebGPU deliberately does not expose device memory -- it is a fingerprinting surface -- and no amount of
// wanting it produces a number. What EXISTS is `adapter.limits.maxBufferSize` (the largest single allocation
// the driver will hand out) and, on newer Chrome, `adapter.info` naming the vendor and device. Those are
// PROXIES and they are labelled as proxies. A page that printed a confident "6 GB VRAM" from a guess would be
// worse than one that says the browser will not say, because somebody would plan against it.
//
// WHAT THIS FILE REFUSES TO DO:
//   - fetch a single byte of model weight. The whole point is answering before the gigabyte.
//   - report `navigator.gpu` as "WebGPU works". MEASURED: on this tree's headless Chromium `navigator.gpu` is
//     TRUE and `requestAdapter()` returns NULL. The namespace existing and an adapter existing are different
//     claims -- the same distinction the Bun.WebView probe makes one round earlier, met again in a day.
//   - answer "yes" from an absence. A limit it could not read is UNKNOWN, and unknown is not yes (v3103).
"use strict";

/**
 * The two Gemma builds gemma-gem ships, with the costs ITS README states. Kept as data with the source named,
 * because these are somebody else's numbers and a reader should be able to check them.
 */
export const MODELS = [
    { id: "E2B", label: "Gemma 4 E2B", bytes: 500e6, vramBytes: 4e9,
      note: "gemma-gem's README: ~500MB disk, 4GB VRAM" },
    { id: "E4B", label: "Gemma 4 E4B", bytes: 1.5e9, vramBytes: 6e9,
      note: "gemma-gem's README: ~1.5GB disk, 6GB VRAM" },
];

/** transformers.js caches weights through the Cache API under this name; finding it means a download happened. */
export const TRANSFORMERS_CACHE = "transformers-cache";

/**
 * *** AN ADAPTER THAT IS A SOFTWARE RENDERER IS NOT A GPU, AND requestAdapter() HANDS ONE BACK ANYWAY. ***
 *
 * Measured on this tree's headless Chromium: with WebGPU flags on, `requestAdapter()` returns an adapter whose
 * `info` reads `vendor: google, architecture: swiftshader`. SwiftShader is CPU emulation. A 4 GB model
 * "running" on it would be a machine doing matrix multiplies on the processor while reporting a GPU, which is
 * the most misleading possible green light -- the page would look capable and be unusable.
 *
 * The spec's `adapter.isFallbackAdapter` is the right way to ask, and IT IS ABSENT in this Chromium ("in"
 * returns false), so it is read WHEN PRESENT and these names are the fallback for when it is not. Pattern
 * matching on a vendor string is a weaker instrument than a flag and is labelled as one.
 */
export const SOFTWARE_HINTS = /swiftshader|llvmpipe|softwarerasterizer|microsoft basic render|lavapipe|warp/i;

const gb = (n) => (n / 1e9).toFixed(2) + " GB";

/**
 * Everything knowable without downloading. Every field is either a fact or null -- NEVER a default that reads
 * like a fact. `null` means "this browser did not tell us", which the verdict below treats as unknown.
 */
export async function probeLocalModel(nav = typeof navigator !== "undefined" ? navigator : null,
                                      win = typeof self !== "undefined" ? self : null) {
    const out = {
        secureContext: win ? !!win.isSecureContext : null,
        crossOriginIsolated: win ? !!win.crossOriginIsolated : null,
        gpuNamespace: !!(nav && nav.gpu),
        adapter: null, adapterInfo: null, features: null, limits: null, hasF16: null,
        softwareRenderer: null,   // an adapter that is CPU emulation is not a GPU -- see SOFTWARE_HINTS
        quotaBytes: null, usageBytes: null, cacheNames: null, modelCached: null,
        persistAvailable: null, persisted: null,
        vramBytes: null,          // *** ALWAYS NULL. There is no API. Kept as a field so its absence is VISIBLE. ***
        vramNote: "NOT EXPOSED BY ANY BROWSER. WebGPU withholds device memory deliberately (fingerprinting), " +
                  "so maxBufferSize below is the closest thing there is and it is a PROXY, not the VRAM.",
        errors: [],
    };

    // THE ADAPTER, NOT THE NAMESPACE. requestAdapter() is the only thing that answers "is there a GPU here".
    if (out.gpuNamespace) {
        try {
            const a = await nav.gpu.requestAdapter();
            out.adapter = !!a;
            if (a) {
                try { out.features = [...a.features]; } catch (e) { out.errors.push("features: " + String(e).slice(0, 60)); }
                out.hasF16 = !!(a.features && a.features.has && a.features.has("shader-f16"));
                try {
                    out.limits = { maxBufferSize: a.limits.maxBufferSize,
                                   maxStorageBufferBindingSize: a.limits.maxStorageBufferBindingSize };
                } catch (e) { out.errors.push("limits: " + String(e).slice(0, 60)); }
                // adapter.info is newer Chrome and may be absent or empty -- absent is recorded as null.
                try { out.adapterInfo = a.info ? { vendor: a.info.vendor || null, architecture: a.info.architecture || null,
                                                  device: a.info.device || null, description: a.info.description || null } : null; }
                catch (e) { out.errors.push("info: " + String(e).slice(0, 60)); }
                // the spec's flag FIRST, the string match only when the flag is not implemented
                if ("isFallbackAdapter" in a) out.softwareRenderer = !!a.isFallbackAdapter;
                else if (out.adapterInfo) {
                    const blob = Object.values(out.adapterInfo).filter(Boolean).join(" ");
                    out.softwareRenderer = blob ? SOFTWARE_HINTS.test(blob) : null;
                }
            }
        } catch (e) { out.errors.push("requestAdapter: " + String(e).slice(0, 100)); }
    }

    // DISK, WHICH IS THE ONE THAT DECIDES MOST OFTEN. A model has to be cached to be used offline, and a quota
    // below the model size is a HARD no that costs nothing to discover.
    try {
        if (nav && nav.storage && nav.storage.estimate) {
            const e = await nav.storage.estimate();
            out.quotaBytes = typeof e.quota === "number" ? e.quota : null;
            out.usageBytes = typeof e.usage === "number" ? e.usage : null;
        }
    } catch (e) { out.errors.push("storage.estimate: " + String(e).slice(0, 60)); }
    // v4008 -- Keith: "storage quota can raise to 2 GB, with approval dialog". CONFIRMED against the real API
    // rather than taken on faith: navigator.storage.persist() exists in this tree's Chromium and
    // navigator.permissions.query({name:"persistent-storage"}) reports "prompt" -- a genuine dialog is what
    // shows. What it is NOT confirmed to do is land on any specific number: the persisted-storage ceiling is
    // disk-relative and platform-dependent, so requestPersistentStorage() below reports the MEASURED before
    // and after rather than promising "2 GB". This file just records whether the escalation is even possible.
    try {
        if (nav && nav.storage) {
            out.persistAvailable = typeof nav.storage.persist === "function";
            if (typeof nav.storage.persisted === "function") out.persisted = await nav.storage.persisted();
        }
    } catch (e) { out.errors.push("storage.persist detection: " + String(e).slice(0, 60)); }

    // IS ANYTHING ALREADY DOWNLOADED. Read-only: caches.keys() opens no cache and fetches nothing.
    try {
        if (typeof caches !== "undefined") {
            out.cacheNames = await caches.keys();
            out.modelCached = out.cacheNames.some((k) => /transformers|onnx|hf|huggingface/i.test(k));
        }
    } catch (e) { out.errors.push("caches.keys: " + String(e).slice(0, 60)); }

    return out;
}

/**
 * A verdict per model, and THREE outcomes rather than two.
 *
 *   "no"      -- a HARD fact rules it out. Named, and always something measured.
 *   "unknown" -- something needed could not be read. NOT a yes. The browser withholding VRAM means every
 *                verdict is at best "nothing rules it out", and saying so is the honest ceiling here.
 *   "maybe"   -- nothing measurable rules it out. THAT IS THE BEST ANSWER AVAILABLE and it is not "yes",
 *                because the one number that would decide it -- VRAM -- is the one nobody can read.
 */
export function verdictFor(facts, model) {
    const blockers = [], unknowns = [];
    if (facts.adapter === false) blockers.push("no WebGPU adapter (the namespace may exist and still hand back null)");
    else if (facts.adapter === null) unknowns.push("WebGPU adapter could not be queried");
    if (facts.secureContext === false) blockers.push("not a secure context, so storage and WebGPU are restricted");
    if (facts.quotaBytes !== null && facts.quotaBytes < model.bytes) {
        blockers.push("storage quota " + gb(facts.quotaBytes) + " is smaller than the model's " + gb(model.bytes));
    } else if (facts.quotaBytes === null) unknowns.push("storage quota unreadable");
    // A SOFTWARE ADAPTER IS A BLOCKER, NOT A WARNING. It is the case where the page would look capable and be
    // unusable, which is worse than reporting nothing at all.
    if (facts.softwareRenderer === true) {
        blockers.push("the WebGPU adapter is a SOFTWARE RENDERER (" +
            (facts.adapterInfo ? Object.values(facts.adapterInfo).filter(Boolean).join(" ") : "fallback adapter") +
            ") -- CPU emulation, not a GPU");
    }
    if (facts.hasF16 === false) unknowns.push("no shader-f16: the f16 builds most quantised models ship as cannot run, though an f32 build may");
    if (facts.limits && facts.limits.maxBufferSize !== undefined && facts.limits.maxBufferSize < 128e6) {
        blockers.push("maxBufferSize " + gb(facts.limits.maxBufferSize) + " is too small for a weight tensor");
    }
    // *** THE VRAM LINE IS ALWAYS AN UNKNOWN, AND THAT IS THE POINT OF THE THIRD STATE. ***
    unknowns.push("VRAM is not exposed to a page, so the model's stated " + gb(model.vramBytes) + " requirement cannot be checked here");
    // v4015 -- *** A SECOND SIGNAL THIS FILE ALREADY COLLECTED AND WAS DISCARDING. *** maxBufferSize was only
    // ever compared against a flat 128MB floor (the "too small for ANY tensor" blocker above); it was never
    // compared against THIS model's own stated requirement, even though both numbers are sitting right here.
    // A proxy reading well under the stated requirement cannot become a "no" -- it is still a proxy, not a
    // measurement of VRAM -- but staying silent about the gap discards a real hint the page already has.
    if (facts.limits && facts.limits.maxBufferSize !== undefined && facts.limits.maxBufferSize < model.vramBytes) {
        unknowns.push("the closest available proxy (" + gb(facts.limits.maxBufferSize) + ") is smaller than " +
            "this model's stated requirement (" + gb(model.vramBytes) + ") -- not conclusive, but worth knowing");
    }
    return {
        model: model.id,
        state: blockers.length ? "no" : "maybe",
        blockers, unknowns,
        cached: facts.modelCached === true,
    };
}

export function summarise(facts) {
    return MODELS.map((m) => verdictFor(facts, m));
}

/**
 * *** THE ESCALATION, AND WHAT IT DOES AND DOES NOT PROMISE. ***
 *
 * Calling navigator.storage.persist() asks the browser to stop treating this origin's storage as evictable
 * under disk pressure. THAT IS THE SPEC'S CLAIM. Whether the browser ALSO raises the numeric quota
 * estimate() reports is an OBSERVED BEHAVIOUR on some platforms, not a guarantee the spec makes -- so this
 * function reports the measured quota before and after rather than asserting a number. "2 GB" is something a
 * browser might do, not something this code claims it will do.
 *
 * REQUIRES A USER GESTURE. Called from a click handler it can show the real dialog; called from anywhere
 * else -- including this probe's own auto-run on page load -- most browsers refuse it silently, which is why
 * this is a SEPARATE function the page wires to a button rather than folded into probeLocalModel().
 */
export async function requestPersistentStorage(nav = typeof navigator !== "undefined" ? navigator : null) {
    const out = { available: false, granted: null, quotaBeforeBytes: null, quotaAfterBytes: null, error: null };
    if (!nav || !nav.storage || typeof nav.storage.persist !== "function") return out;
    out.available = true;
    try {
        const before = await nav.storage.estimate();
        out.quotaBeforeBytes = typeof before.quota === "number" ? before.quota : null;
    } catch (e) { out.error = "estimate before: " + String(e).slice(0, 60); }
    try {
        out.granted = await nav.storage.persist();
    } catch (e) { out.error = "persist(): " + String(e).slice(0, 80); return out; }
    try {
        const after = await nav.storage.estimate();
        out.quotaAfterBytes = typeof after.quota === "number" ? after.quota : null;
    } catch (e) { out.error = (out.error ? out.error + "; " : "") + "estimate after: " + String(e).slice(0, 60); }
    return out;
}
