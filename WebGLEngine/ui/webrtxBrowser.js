// @ts-check
// WebGLEngine/ui/webrtxBrowser.js -- v4118
//
// THE OPT-IN GATE FOR RAY TRACING IN THE PAGE, via codedhead/webrtx.
//
// Keith asked about webrtx while asking what an iOS peer could usefully do. WebRTX implements Vulkan's ray
// tracing PIPELINE -- raygen / closest-hit / miss / any-hit / intersection shaders, a shader binding table, a
// BVH -- as PURE WebGPU COMPUTE. No hardware RT cores, no special browser build: it works wherever WebGPU
// does. MIT licensed, checked.
//
// *** IT IS NOT SHIPPED HERE, AND FOR A DIFFERENT REASON THAN voxtral's ENGINE WAS NOT. *** voxtral publishes
// a prebuilt wasm, so that page pins a SHA-256 and refuses anything else. WebRTX publishes NO dist at all --
// it must be BUILT, from three Rust crates and a TypeScript bundle. So there is nothing to pin: two people
// building it get different bytes, and a digest of MY build would refuse everybody else's. What is recorded
// instead is the BUILD RECIPE, measured rather than guessed, and the page verifies BEHAVIOUR on load.
//
// *** AND THE THING THAT DECIDES WHETHER THIS PAGE CAN RUN AT ALL IS NOT THE GPU -- IT IS THE URL. ***
// navigator.gpu is SECURE-CONTEXT ONLY. SweK's primary origin is http://<lan-ip>:8787, which is neither https
// nor localhost, so on the address the engine ships as there is no WebGPU to build a pipeline on. Measured in
// Chromium, one server, two origins: from 127.0.0.1 navigator.gpu exists; from a LAN IP it is undefined. That
// is checked here before anything else, because a page that reported "no adapter" on the LAN would be blaming
// the machine for what the address did.
"use strict";

export const UPSTREAM = {
    repo: "https://github.com/codedhead/webrtx",
    commit: "9e1e7eb73b88eb5e3e46f06931c65f12154b2392",
    committed: "2023-07-04",
    license: "MIT",
    licenseVerified: "2026-08-28 -- LICENSE file present and read",
    version: "0.1.1",
    what: "Vulkan-style ray tracing pipeline implemented as pure WebGPU compute (no hardware RT required)",
};

/**
 * *** THE MAINTENANCE FACT, MEASURED PROPERLY AND NOT FROM A SHALLOW CLONE. *** A `git clone --depth 1` shows
 * one commit for EVERY repository, so that number means nothing until the history is fetched. Unshallowed:
 * genuinely ONE commit, one branch, no tags. It is a code drop, not a maintained project, and the README says
 * its own spec is "unstable in current state and might change".
 */
export const MAINTENANCE = {
    commits: 1,
    tags: 0,
    branches: ["master"],
    lastCommit: "2023-07-04",
    verdict: "a single-commit code drop, unmaintained for three years",
    howChecked: "git fetch --unshallow, then git log --oneline | wc -l -- a depth-1 clone reports 1 regardless",
};

/**
 * *** THE BUILD RECIPE IS THE DELIVERABLE, AND EVERY LINE OF IT WAS MEASURED BY RUNNING IT. ***
 *
 * My first instinct was that a 2023 drop with four unpinned git dependencies would be bit-rotted past use.
 * That was wrong twice over. Cargo.lock files ARE committed, so the dependency set is reproducible -- and the
 * lock is then exactly what BLOCKS the build, because Rust 1.94 hard-refuses wasm-bindgen older than 0.2.88.
 * Four routine bumps and one config line fix it, with NO code changes.
 */
export const BUILD_STEPS = [
    { step: "cargo update", where: "each of bvh/, glsl/, naga/",
      why: "the committed lock pins wasm-bindgen 0.2.84, and Rust 1.94 REFUSES anything below 0.2.88 outright. " +
           "Bumping only wasm-bindgen cascades into a stale `syn`; a full update resolves naga 0.11 -> 0.14 and builds." },
    { step: "wasm-pack build", where: "each crate",
      why: "produces bvh 100 KB, naga 562 KB, glsl 1.6 MB. Add --no-opt only if binaryen cannot be downloaded." },
    { step: "npm i webpack@latest webpack-cli@latest", where: "repo root",
      why: "webpack 5.77's bundled @webassemblyjs parser cannot decode WASM emitted by a 2026 Rust toolchain -- " +
           "it fails with 'parseVec could not cast the value' in the type section." },
    { step: "npm i typescript@5 ts-loader@latest", where: "repo root",
      why: "TypeScript 4.6 cannot parse modern @types/node. TypeScript 7 (the Go rewrite) breaks ts-loader " +
           "('Cannot read properties of undefined (reading fileExists)'), so 5 is the version that works -- " +
           "`typescript@latest` overshoots." },
    { step: 'output.publicPath = "/dist/"', where: "webpack.config.js",
      why: "without it the bundle throws 'Automatic publicPath is not supported in this browser' and its three " +
           "async wasm chunks 404. This is the step a consumer hits and the README does not mention." },
];

/** What running the result actually proved, in a real browser. Small, specific, and mine. */
export const MEASURED_HERE = {
    when: "2026-08-28",
    where: "headless Chromium in the build container, WebGPU via swiftshader (a SOFTWARE adapter)",
    bundleBytes: 1309900,
    wasmBytes: { glsl: 1667500, naga: 562300, bvh: 99900 },
    patchedRequestDevice: true,
    rayTracingPipelineExposed: true,
    accelerationStructureBuilt: true,
    note: "a bottom-level acceleration structure was built from real triangle vertices, which means the BVH " +
          "wasm genuinely executed. NO IMAGE WAS EVER RENDERED here -- no raygen shader was compiled and no " +
          "pass was dispatched. 'The pipeline exists' is not 'it draws'.",
};

export const REFUSED = [
    {
        what: "any claim that this works in Safari, or on an iPhone",
        why: "upstream says 'only tested on Chrome so far'. Its WGSL is GENERATED, glslang -> SPIR-V -> naga -> " +
             "WGSL, by a 2023 naga; Safari's WGSL validator is the newest and strictest there is, and generated " +
             "shaders are exactly what it rejects first. Nothing here has ever run on an Apple GPU.",
        wouldNeed: "one run on a real iOS 26 device -- which is what the page's own smoke test reports",
    },
    {
        what: "a pinned SHA-256 of the bundle",
        why: "unlike voxtral's engine, webrtx publishes no build. Every consumer compiles their own, and two " +
             "builds differ, so a digest of mine would refuse everybody else's. Behaviour is verified instead.",
        wouldNeed: "upstream publishing a release artefact, which in three years it has not",
    },
    {
        what: "running on SweK's own LAN address",
        why: "navigator.gpu is secure-context only. Measured on one server: present from 127.0.0.1, UNDEFINED " +
             "from a LAN IP. The engine's primary origin is http://<lan-ip>:8787.",
        wouldNeed: "the https tunnel, or localhost",
    },
];

/** Where a built bundle is looked for. Not vendored: ~3.6 MB of artefacts nobody can review in a diff. */
export const STAGED_PATH = "/vendor/webrtx/index.js";

export const STAGES = ["idle", "consented", "loaded", "verified"];

/**
 * @typedef {{ stage: string, consented: boolean, loaded: boolean, verified: boolean }} State
 *
 * Same v3103 shape as voxtralBrowser.js's Facts: every field is optional/nullable because a probe that never
 * ran, or a browser that has no answer for one specific field, is not evidence of a "no".
 * @typedef {{ secureContext?: boolean | null, gpuNamespace?: boolean | null, adapter?: boolean | null,
 *             softwareRenderer?: boolean | null, appleGpu?: boolean | null }} Facts
 */

/** @returns {State} */
export function initialState() { return { stage: "idle", consented: false, loaded: false, verified: false }; }

/**
 * *** THE ORDER OF THESE CHECKS IS THE POINT. *** The origin is asked about FIRST, because on an insecure one
 * there is no navigator.gpu to ask anything else of, and "no WebGPU adapter" would be a true sentence that
 * blames the wrong thing.
 * @param {Facts | null} [facts] @returns {string[]}
 */
export function blockersFrom(facts) {
    /** @type {string[]} */
    const out = [];
    if (!facts) return out;                       // unknown is not a "no"
    if (facts.secureContext === false) {
        out.push("INSECURE ORIGIN -- navigator.gpu is secure-context only, so there is no WebGPU here at all. " +
                 "Use the https tunnel or localhost; this is the URL, not the machine");
        return out;
    }
    if (facts.gpuNamespace === false) out.push("this browser has no WebGPU at all");
    else if (facts.adapter === false) out.push("WebGPU exists but requestAdapter() returned null");
    return out;
}

/** @param {Facts | null} [facts] @returns {string[]} */
export function warningsFrom(facts) {
    /** @type {string[]} */
    const out = [];
    if (!facts) return out;
    if (facts.softwareRenderer) {
        out.push("the adapter is a SOFTWARE renderer. WebRTX is pure compute with no hardware ray tracing, so " +
                 "it will run and it will be slow -- that is how it was verified here.");
    }
    if (facts.appleGpu) {
        out.push("this looks like an Apple GPU, which NOTHING upstream has been tested on. If the smoke test " +
                 "below passes, you are the first evidence that exists; if it fails on shader compilation, " +
                 "that is the generated-WGSL risk the refusals name, not a broken device.");
    }
    return out;
}

/** The one step that must happen before anything spends: consent. Same invariant shape as voxtralBrowser.
 * @param {State} [state] @param {Facts | null} [facts] */
export function nextStep(state = initialState(), facts = null) {
    const s = state || initialState();
    if (!s.consented) return { action: "consent", label: "Enable ray tracing", detail: "nothing loaded yet" };
    const b = blockersFrom(facts);
    if (b.length) return { action: "blocked", label: "cannot run here", detail: b.join("; "), blockers: b };
    if (!s.loaded) return { action: "load", label: "Load a built webrtx bundle", detail: "you build it; see the recipe" };
    if (!s.verified) return { action: "verify", label: "Run the smoke test", detail: "patch, pipeline, acceleration structure" };
    return { action: "ready", label: "ray tracing available", detail: "" };
}

/** Bytes at a readable scale -- shared shape with voxtralBrowser so the two pages read alike.
 * @param {number} [n] @returns {string} */
export function humanBytes(n) {
    if (typeof n !== "number" || !isFinite(n)) return "unknown";
    if (n >= 1e9) return (n / 1e9).toFixed(2) + " GB";
    if (n >= 1e6) return (n / 1e6).toFixed(2) + " MB";
    if (n >= 1e3) return (n / 1e3).toFixed(1) + " kB";
    return n + " B";
}

/** Total download a consumer ends up with, computed rather than restated.
 * @returns {number} */
export function totalBytes() {
    const w = MEASURED_HERE.wasmBytes;
    return MEASURED_HERE.bundleBytes + w.glsl + w.naga + w.bvh;
}
