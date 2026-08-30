// @ts-check
// WebGLEngine/ui/voxtralBrowser.js -- v4115
//
// THE OPT-IN GATE FOR RUNNING VOXTRAL (SPEECH RECOGNITION) ENTIRELY IN A BROWSER TAB.
//
// Keith asked to wire the voxtral browser build as an opt-in page after I prototyped it. This module is the
// judgement half -- the cost, the provenance, the digests and the consent state machine -- with no DOM in it,
// so the part that decides whether anything downloads can be graded headlessly instead of clicked through.
//
// *** WHAT THIS IS AND IS NOT MINE. *** The engine is TrevorS/voxtral-mini-realtime-rs, Apache-2.0 (checked --
// there is a real LICENSE file, unlike sileo last round), a pure-Rust implementation of Mistral's Voxtral Mini
// 4B Realtime on the Burn framework, compiled to WASM and running its own WGSL compute shaders through WebGPU.
// NONE of it is vendored here. The tree's largest vendored asset is 3.5 MB and this wasm is 9.4 MB, so copying
// it in would make one opt-in curiosity the biggest single file in a tree that publishes public release zips.
// The page loads bytes the user supplies and CHECKS THEM AGAINST A PINNED DIGEST instead.
//
// *** THE HONEST HEADLINE, WHICH THE PAGE LEADS WITH RATHER THAN BURIES: IT IS 14x SLOWER THAN REAL TIME. ***
// Upstream's own table has the WASM path at RTF 14.1 -- 225 seconds to transcribe 16 seconds of audio -- and
// that is on an NVIDIA DGX Spark, which is a bigger part than anything this will actually run on. So it is a
// FLOOR, not a prediction, and estimateWallClock() refuses to return a bare number without saying so. This
// tree already has whisperBridge doing the same job natively and fast; the ONE thing this offers that the
// bridge cannot is that it needs no bridge, no local server and no Windows at all. That is the whole trade.
"use strict";

/** Provenance of the engine. Pinned to the exact commit whose artefacts the digests below describe. */
export const UPSTREAM = {
    repo: "https://github.com/TrevorS/voxtral-mini-realtime-rs",
    commit: "2930e95d60f8584b5326d90d3c5ec9a152d0d322",
    version: "0.2.5",
    license: "Apache-2.0",
    licenseVerified: "2026-08-28 -- LICENSE file present and read, not inferred from a badge",
    model: "mistralai/Voxtral-Mini-4B-Realtime-2602",
    framework: "Burn 0.20 + cubecl/wgpu (WebGPU compute, not CPU wasm)",
};

/**
 * *** THE DIGESTS ARE THE WHOLE SECURITY STORY, SO THEY ARE PINNED TO BYTES I ACTUALLY RAN. ***
 * A page that fetches executable wasm from a URL and runs it is trusting that URL forever. These are the
 * SHA-256s of the exact artefacts that were loaded and instantiated in Chromium during the prototype, so the
 * page can accept bytes from anywhere -- a file picker, a staged directory -- and still refuse to execute
 * anything that is not the build that was checked. A mismatch is a REFUSAL, never a warning.
 */
export const ARTEFACTS = {
    wasm: { name: "voxtral_mini_realtime_bg.wasm", bytes: 9385179,
            sha256: "c9d709216d8bd0e5b6b1b89e7bacaffe251db9c5f623a9162a10e40caae69ec1" },
    glue: { name: "voxtral_mini_realtime.js", bytes: 48192,
            sha256: "37508f1c1d489e304bd33921a14538b2fbd8bf7bb4b8ecc8f286f3dd981f91be" },
};

/** The weights are the expensive half and live on Hugging Face; nothing here ships them. */
export const WEIGHTS = {
    repo: "TrevorJS/voxtral-mini-realtime-gguf",
    base: "https://huggingface.co/TrevorJS/voxtral-mini-realtime-gguf/resolve/main",
    shards: ["shard-aa", "shard-ab", "shard-ac", "shard-ad", "shard-ae"],
    approxBytes: 2.5e9,
    cacheName: "voxtral-weights-v1",
    quant: "Q4 GGUF",
};

/**
 * *** UPSTREAM'S NUMBERS, LABELLED AS UPSTREAM'S. ***
 * This tree's rule is that a measurement carries who took it. I did NOT measure any of these -- the weights
 * are unreachable from the container this was built in -- so they are recorded as a citation with the hardware
 * named, and `measuredHere` is false so nothing downstream can quietly promote them to my own evidence.
 */
export const UPSTREAM_BENCH = {
    source: "upstream README benchmark table",
    hardware: "NVIDIA DGX Spark (GB10, LPDDR5x)",
    measuredHere: false,
    asrWasm:     { rtf: 14.1, audioS: 16, wallS: 225, tokPerS: 0.5, quant: "Q4 GGUF" },
    asrNativeQ4: { rtf: 0.416, audioS: 16, wallS: 6.6, tokPerS: 19.4 },
    ttsWasm:     { rtf: 104, audioS: 3.52, wallS: 367 },
    werFleursEn: 8.49,
};

/** What I DID measure here, in headless Chromium, during the prototype. Small, but mine. */
export const MEASURED_HERE = {
    when: "2026-08-28",
    where: "headless Chromium in the build container, WebGPU via swiftshader (software adapter)",
    wasmInstantiateMs: 260,
    wgpuDeviceMs: 4,
    exports: ["VoxtralQ4", "initSync", "initWgpuDevice", "start"],
    note: "the module loads and acquires a WebGPU device; NO transcription was ever run, because the weights " +
          "could not be fetched. Loading is not working -- do not read it as one.",
};

/**
 * *** REFUSALS AS DATA, EACH WITH ITS NUMBER. *** Same discipline as faceExpressionSet's tongue and
 * gestureVfx's crossed fingers: the things this page does NOT do are exported so a later reader cannot mistake
 * their absence for an oversight, and so a gate can prove a fake one has not been quietly added.
 */
export const REFUSED = [
    {
        what: "text-to-speech",
        why: "upstream measures the WASM TTS path at RTF 104 -- 367 seconds to synthesise 3.52 seconds of " +
             "audio, on a DGX Spark. That is not slow, it is unusable, and this tree already has piper " +
             "through ttsBridge producing speech faster than real time.",
        wouldNeed: "roughly a hundredfold speedup, i.e. different hardware or a different model entirely",
    },
    {
        what: "an end-to-end transcription verified by me",
        why: "huggingface.co is unreachable from the container this was built in (curl returns 000), so the " +
             "2.5 GB of Q4 weights could never be fetched and no audio was ever transcribed here.",
        wouldNeed: "network reach to Hugging Face, or the shards staged onto disk by hand",
    },
    {
        what: "a promise about how fast it will be on YOUR machine",
        why: "the only RTF figures that exist are upstream's, on a GB10. Nothing measured that hardware " +
             "against a laptop for this workload, so restating 14.1x as a prediction would be inventing one.",
        wouldNeed: "a run on the target machine -- which is exactly what the page's own timer reports",
    },
];

/**
 * *** THE SINGLE FACT THAT DECIDES WHETHER ANY OF THIS PAGE WORKS, AND I SHIPPED v4115 WITHOUT IT. ***
 *
 * WebCrypto's `crypto.subtle` is SECURE-CONTEXT ONLY, and so is `navigator.gpu`. SweK's primary origin is
 * http://<lan-ip>:8787 -- neither https nor localhost -- so on the address the engine actually ships as, BOTH
 * ARE UNDEFINED. Measured in Chromium, same server, two origins: on 127.0.0.1 isSecureContext is true and
 * navigator.gpu, crypto.subtle, VideoEncoder, getUserMedia and navigator.storage.estimate all exist; on
 * 192.0.2.2 isSecureContext is false and EVERY ONE of them is undefined.
 *
 * *** THE BUG THAT CAUSED: *** verifyArtefact() called sha256Hex(), which reached straight into
 * crypto.subtle.digest and threw a TypeError into an un-caught promise -- so on the LAN the "Load the engine"
 * button did NOTHING AT ALL, with no message. And the gate could not see it, because the gate served the page
 * from localhost, WHICH IS A SECURE CONTEXT. The right lesson is not "add a try/catch": it is that a probe run
 * on the wrong ORIGIN measures a different browser. The gate now drives a non-loopback address too.
 *
 * ui/codecProbe.mjs recorded exactly this rule at v3735 for WebCodecs and I did not carry it across.
 */
export const INSECURE_WHY =
    "this page is on an INSECURE ORIGIN (" +
    (typeof location !== "undefined" ? location.origin : "unknown") + "). WebCrypto's crypto.subtle and " +
    "navigator.gpu are both secure-context only, so on http://<lan-ip> they do not exist at all -- the digest " +
    "cannot be checked and WebGPU cannot be reached. Open this page over the https tunnel, or on localhost.";

/** Is there a usable WebCrypto? The one place that question is asked, so the answer cannot drift. */
export function hasSubtleCrypto() {
    return !!(typeof globalThis !== "undefined" && globalThis.crypto && globalThis.crypto.subtle);
}

/** Is this a secure context? Reported rather than assumed, because the LAN origin is the DEFAULT here. */
export function isSecure(win = typeof window !== "undefined" ? window : null) {
    return win ? !!win.isSecureContext : null;
}

/** Bytes -> "2.50 GB". Kept here so the page and the gate format the same number the same way.
 * @param {number} [n] @returns {string} */
export function gb(n) { return typeof n === "number" && isFinite(n) ? (n / 1e9).toFixed(2) + " GB" : "unknown"; }

/**
 * Bytes at a SENSIBLE SCALE -- and this exists because rendering the page caught gb() calling the 9.4 MB engine
 * "0.01 GB". That is not a rounding nit: the whole design is two gates of visibly different size, and a reader
 * comparing "0.01 GB" with "2.50 GB" cannot see the three orders of magnitude that make them two decisions.
 * @param {number} [n] @returns {string}
 */
export function humanBytes(n) {
    if (typeof n !== "number" || !isFinite(n)) return "unknown";
    if (n >= 1e9) return (n / 1e9).toFixed(2) + " GB";
    if (n >= 1e6) return (n / 1e6).toFixed(2) + " MB";
    if (n >= 1e3) return (n / 1e3).toFixed(1) + " kB";
    return n + " B";
}

/**
 * Turn a duration of audio into the wall-clock it is expected to cost -- AND REFUSE TO RETURN A BARE NUMBER.
 *
 * The returned object always carries `isFloor` and `hardware`, because upstream's RTF was measured on a part
 * that is almost certainly faster than the reader's. A caller that wants "how long will this take" gets an
 * answer it cannot render without also rendering where the figure came from.
 * @param {number} audioSeconds @param {number} [rtf]
 */
export function estimateWallClock(audioSeconds, rtf = UPSTREAM_BENCH.asrWasm.rtf) {
    const a = Math.max(0, +audioSeconds || 0);
    return {
        audioSeconds: a,
        rtf,
        seconds: a * rtf,
        pretty: humanDuration(a * rtf),
        isFloor: true,
        hardware: UPSTREAM_BENCH.hardware,
        caveat: "upstream's RTF on " + UPSTREAM_BENCH.hardware + "; treat it as a FLOOR, not a prediction",
    };
}

/** Seconds -> a short human string. Exact at the boundaries so the gate can pin it.
 * @param {number} s @returns {string} */
export function humanDuration(s) {
    const n = Math.max(0, Math.round(+s || 0));
    if (n < 60) return n + "s";
    const m = Math.floor(n / 60), r = n % 60;
    if (m < 60) return r ? m + "m " + r + "s" : m + "m";
    const h = Math.floor(m / 60);
    return (m % 60) ? h + "h " + (m % 60) + "m" : h + "h";
}

/**
 * @typedef {{ stage: string, consented: boolean, moduleReady: boolean, weightsReady: boolean,
 *             error: string | null }} State
 *
 * The shared probe result this module reads FACTS off (from ui/localModelProbe.js) -- typed loosely and
 * marked optional throughout, because v3103's rule applies here as much as to the values inside it: a probe
 * that never ran hands back `null` for the whole object, and a probe that ran but could not read one field
 * hands back `null` for THAT field, and neither is a "no".
 * @typedef {{ secureContext?: boolean | null, gpuNamespace?: boolean | null, adapter?: boolean | null,
 *             quotaBytes?: number | null, softwareRenderer?: boolean | null }} Facts
 */

/** The ordered stages. Nothing leaves `idle` without a person saying so. */
export const STAGES = ["idle", "consented", "module", "weights", "ready"];

/** A fresh, inert state. Constructing this must never start anything.
 * @returns {State} */
export function initialState() {
    return { stage: "idle", consented: false, moduleReady: false, weightsReady: false, error: null };
}

/**
 * *** THE OPT-IN INVARIANT LIVES HERE, IN ONE FUNCTION, SO IT CAN BE PROVEN. ***
 *
 * `nextStep` is the ONLY thing that says what may happen next, and from `idle` the only action it will ever
 * name is `consent`. It cannot return a fetch, a download or an instantiate before a person has agreed --
 * which is what "opt-in" has to mean if it means anything. The page asks this function rather than deciding
 * for itself, so the guarantee is one testable place instead of scattered through click handlers.
 *
 * Consent is deliberately TWO gates, not one: the module is 9.4 MB and verifiable, the weights are 2.5 GB and
 * are not. Agreeing to look at the thing is not agreeing to spend two and a half gigabytes.
 * @param {State} [state] @param {Facts | null} [facts]
 */
export function nextStep(state = initialState(), facts = null) {
    const s = state || initialState();
    if (s.error) return { action: "error", label: "stopped", detail: s.error };
    if (!s.consented) {
        return { action: "consent", label: "Enable the browser build",
                 detail: "nothing has been downloaded or executed yet" };
    }
    const blockers = blockersFrom(facts);
    if (blockers.length) return { action: "blocked", label: "cannot run here", detail: blockers.join("; "), blockers };
    if (!s.moduleReady) {
        return { action: "load-module", label: "Load and verify the engine",
                 bytes: ARTEFACTS.wasm.bytes,
                 detail: humanBytes(ARTEFACTS.wasm.bytes) + " of WebAssembly, checked against a pinned SHA-256" };
    }
    if (!s.weightsReady) {
        return { action: "download-weights", label: "Download the model weights",
                 bytes: WEIGHTS.approxBytes,
                 detail: gb(WEIGHTS.approxBytes) + " from Hugging Face -- the expensive, separate decision" };
    }
    return { action: "transcribe", label: "Transcribe audio", detail: "ready" };
}

/**
 * Hard blockers, read off the SHARED probe rather than re-derived. WebGPU is not optional here: this build is
 * Burn/wgpu with its own WGSL kernels, so an absent adapter is a real "no" rather than a slow path.
 * A software adapter is NOT a blocker -- it is how the prototype ran -- but it is a warning, because RTF 14
 * came from a GB10 and swiftshader is a CPU pretending.
 * @param {Facts | null} [facts] @returns {string[]}
 */
export function blockersFrom(facts) {
    /** @type {string[]} */
    const out = [];
    if (!facts) return out;                        // unknown is not a "no" -- v3103's rule, both ways
    // *** THIS OUTRANKS EVERY HARDWARE FACT BELOW IT. *** On an insecure origin there is no navigator.gpu to
    // ask about an adapter and no crypto.subtle to check a digest with, so reporting "no WebGPU adapter" there
    // would blame the machine for what the URL did.
    if (facts.secureContext === false) {
        out.push("this is an INSECURE ORIGIN -- navigator.gpu and crypto.subtle are both secure-context only, " +
                 "so neither exists here. Use the https tunnel or localhost");
        return out;
    }
    // *** THE KEY IS `gpuNamespace`, AND GETTING IT WRONG WAS SILENT. *** This read `facts.webgpu` first, which
    // localModelProbe has never emitted, so the strict `=== false` was never true and THIS BLOCKER COULD NOT
    // FIRE ON REAL DATA. Nothing failed: the gate fuzzed the same invented key, so code and test agreed with
    // each other and both were wrong. Rendering the page is what showed it -- "namespace absent" printed
    // directly above "adapter granted", which cannot both be true. The gate now checks these names against a
    // real probe result rather than against my memory of it.
    if (facts.gpuNamespace === false) out.push("this browser has no WebGPU namespace at all");
    else if (facts.adapter === false) out.push("WebGPU exists but requestAdapter() returned null -- no adapter");
    if (typeof facts.quotaBytes === "number" && facts.quotaBytes < WEIGHTS.approxBytes) {
        out.push("the storage quota (" + gb(facts.quotaBytes) + ") is smaller than the weights (" +
                 gb(WEIGHTS.approxBytes) + ")");
    }
    return out;
}

/** Warnings that must be SHOWN but must never silently stop anything.
 * @param {Facts | null} [facts] @returns {string[]} */
export function warningsFrom(facts) {
    /** @type {string[]} */
    const out = [];
    if (!facts) return out;
    if (facts.softwareRenderer) {
        out.push("the WebGPU adapter is a SOFTWARE renderer (CPU emulation). Upstream's 14x-slower-than-real-" +
                 "time figure came from a real GPU; expect considerably worse than that here.");
    }
    if (typeof facts.quotaBytes === "number" && facts.quotaBytes >= WEIGHTS.approxBytes) {
        out.push("the quota clears the weights, but a quota is a CEILING and not a reservation -- free disk is " +
                 "not exposed to a page, so this download can still fail part-way on a full disk.");
    }
    return out;
}

/**
 * SHA-256 of bytes, hex. Uses WebCrypto, which exists in both the browser and Node, so the digest the page
 * enforces is computed by the same code the gate exercises rather than by a second implementation.
 * @param {ArrayBuffer | ArrayBufferView} bytes @returns {Promise<string>}
 */
export async function sha256Hex(bytes) {
    if (!hasSubtleCrypto()) throw new Error(INSECURE_WHY);
    // ArrayBuffer.isView() is a real type guard (unlike the truthy `bytes.buffer` check this replaced), so TS
    // can prove `buf` is a genuine ArrayBuffer below rather than the wider ArrayBufferLike a view's `.buffer`
    // is typed as (which also admits SharedArrayBuffer -- never constructed here, but not provable from the
    // type alone).
    const buf = bytes instanceof ArrayBuffer ? bytes
        : ArrayBuffer.isView(bytes) ? /** @type {ArrayBuffer} */ (bytes.buffer) : bytes;
    // *** `globalThis.crypto`, NOT A BARE `crypto`, AND THE TREE'S OWN GATE ASKED FOR THAT. *** unboundBuiltin
    // treats a bare `crypto.` as Node's crypto module used without importing it -- and its v3678 note predicted
    // this exact collision, observing that `crypto` is "a legitimate BROWSER global" while measuring that no
    // page had yet used one. This is the first that does. Reaching through globalThis says which crypto is
    // meant in both environments, and the gate's own negative lookbehind deliberately exempts a property
    // access, so this satisfies the rule by being clearer rather than by dodging it.
    const d = await globalThis.crypto.subtle.digest("SHA-256", buf);
    return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Verify supplied bytes against a pinned artefact. Returns a RESULT rather than throwing, so the page can
 * render exactly what went wrong -- and note that a size mismatch is reported as its own reason, because
 * "wrong length" is a far more useful message to a person than "digest differs".
 * @param {ArrayBuffer | ArrayBufferView | null} bytes
 * @param {{ name: string, bytes: number, sha256: string }} [artefact]
 */
export async function verifyArtefact(bytes, artefact = ARTEFACTS.wasm) {
    // An insecure origin is a REFUSAL with a reason, never an exception: the caller renders `reason`, and a
    // thrown TypeError rendered nothing at all.
    if (!hasSubtleCrypto()) return { ok: false, reason: INSECURE_WHY, expected: artefact.sha256, got: null, insecure: true };
    // Both halves of this check together prove `bytes` non-null for every line below -- ArrayBuffer and
    // ArrayBufferView both guarantee byteLength, so unlike the old `?? bytes.length` fallback there is nothing
    // left for a "length" property to catch that this does not already.
    if (!bytes || !bytes.byteLength) return { ok: false, reason: "no bytes were supplied", expected: artefact.sha256, got: null };
    const len = bytes.byteLength;
    if (len !== artefact.bytes) {
        return { ok: false, reason: "wrong size: expected " + artefact.bytes + " bytes, got " + len,
                 expected: artefact.sha256, got: null, bytes: len };
    }
    const got = await sha256Hex(bytes);
    return got === artefact.sha256
        ? { ok: true, reason: "digest matches the build that was verified in Chromium", expected: artefact.sha256, got, bytes: len }
        : { ok: false, reason: "SHA-256 MISMATCH -- these are not the bytes this page was pinned to, so they " +
                               "will not be executed", expected: artefact.sha256, got, bytes: len };
}

/** The cost, as lines a page can render in order. Built here so the honest numbers cannot drift from the gate. */
export function costLines() {
    const b = UPSTREAM_BENCH;
    return [
        { k: "Engine", v: "voxtral-mini-realtime-rs " + UPSTREAM.version + " (" + UPSTREAM.license + "), WASM + WebGPU" },
        { k: "Download", v: humanBytes(ARTEFACTS.wasm.bytes) + " engine, then " + humanBytes(WEIGHTS.approxBytes) + " of " +
                            WEIGHTS.quant + " weights -- two separate decisions" },
        { k: "Speed", v: b.asrWasm.rtf + "x SLOWER than real time: ~" + humanDuration(b.asrWasm.wallS) +
                         " to transcribe " + b.asrWasm.audioS + "s of audio (upstream, on " + b.hardware + ")" },
        { k: "Accuracy", v: b.werFleursEn + "% WER on FLEURS English (upstream's figure, not measured here)" },
        { k: "Already here", v: "whisperBridge does this natively and fast. The ONLY thing this adds is that it " +
                                "needs no bridge, no local server and no Windows -- it is all in the tab." },
    ];
}
