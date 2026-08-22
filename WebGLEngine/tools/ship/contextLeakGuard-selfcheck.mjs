// WebGLEngine/tools/ship/contextLeakGuard-selfcheck.mjs -- v2778
//
// Run: node tools/ship/contextLeakGuard-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs (auto-discovered).
//
// Regression guard for the WebGL context LEAK family. Every module that creates its OWN webgl context for a
// canvas it later discards must release it (WEBGL_lose_context.loseContext) on teardown, or contexts pile up to
// Chrome's ~16-context ceiling and getContext starts returning null (the index.html cascade). This pins the
// releases added in v2778 so they can't be silently dropped. Modules that REUSE a persistent canvas are listed
// as intentional exclusions.

import { readFileSync } from "node:fs";

let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };
const read = (p) => { try { return readFileSync(new URL("../../" + p, import.meta.url), "utf8"); } catch { return ""; } };

// modules that create + discard a per-use context -> MUST loseContext on teardown
const MUST_RELEASE = [
    "ui/objPreview.js",
    "ui/parallaxPreview.js",
    "ui/HeartbeatAvatar.js",
    "ui/PalChatAvatar.js",
    "face/miniAvatar.js",   // already released pre-v2778
];
for (const m of MUST_RELEASE) {
    const src = read(m);
    ok("releases context on teardown: " + m, /loseContext\s*\(/.test(src) && /getExtension\(\s*["']WEBGL_lose_context["']\s*\)/.test(src));
}

// intentional exclusions (persistent reused canvas -- releasing would break redraw); assert they still create a
// context (so if one is refactored to per-use, this list is revisited) but we do NOT require loseContext.
const REUSE_OK = ["ui/assetGallery.js", "face/avatarStage.js"];
for (const m of REUSE_OK) {
    const src = read(m);
    ok("documented reuse (no release required): " + m, /getContext\(\s*["']webgl2?["']/.test(src));
}

// the shared engine context lives for the page lifetime and is handled by glBootstrap (loss listeners), not a
// per-use release -- sanity that glBootstrap owns that path.
ok("glBootstrap owns the shared-context lifecycle (loss handling + leak-free probe)",
   /webglcontextlost/.test(read("render/glBootstrap.js")) && /loseContext/.test(read("render/glBootstrap.js")));

console.log("contextLeakGuard-selfcheck: " + (fails ? fails + " FAILED" : "all pass"));
process.exit(fails ? 1 : 0);
