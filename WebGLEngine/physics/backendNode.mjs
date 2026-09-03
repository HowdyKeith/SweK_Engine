// WebGLEngine/physics/backendNode.mjs -- v4400
//
// *** THE NODE DOOR TO THE PHYSICS FACADE, AND IT EXISTS BECAUSE A GUARD IN THIS TREE WAS RIGHT. ***
//
// physics/box3d/box3dLoader.js loads its artifact with `import("/vendor/box3d/box3d.js")` -- a BROWSER-ABSOLUTE
// URL. In Node that is a path from the filesystem root and cannot resolve, so box3d has never loaded through
// the facade headlessly: selectBackend() caught the not-ready status and fell through to Jolt for EVERY Node
// caller, including `prefer: "box3d"`, silently.
//
// v4400's first fix made box3dLoader.init() fall back to box3dNode.mjs itself. That worked and was wrong.
// box3dNode imports node:fs at the top level, and tools/ship/browserNodeGuard-selfcheck.mjs walks the import
// graph from every .html page -- it went red inside one verify with "1 offender(s):
// physics/box3d/box3dNode.mjs (reached from backend-physics-check.html)". physics/backend.js is browser-reachable
// too (blob-herd.html, blob-avatar.html), so the fallback could not live there either.
//
// The guard was not in the way; it was the design constraint stated out loud. Making the specifier opaque to
// the scanner would have defeated it rather than satisfied it, which is the same move as adding an exclusion
// instead of a fix. So the direction is INVERTED: box3dLoader offers an adopt() seam and imports nothing new,
// and this module -- which no page reaches -- does the reaching.
//
// Use this from Node; use physics/backend.js from a page. They return the same handles.
"use strict";
import { box3d } from "./box3d/box3dLoader.js";
import { initNode, mod } from "./box3d/box3dNode.mjs";
import { selectBackend as browserSelectBackend } from "./backend.js";

let adopted = null;

/**
 * Load box3d's wasm the way Node can and hand it to the shared loader. Idempotent; returns the loader status.
 *
 * Returns a NOT-READY status rather than throwing, because that is what selectBackend already knows how to
 * read, and a Node caller that genuinely has no wasm should fall through to Jolt exactly as a page would.
 */
export async function adoptBox3dInNode() {
    if (adopted) return adopted;
    if (box3d.mod()) return (adopted = box3d.status());
    try {
        const st = await initNode();
        if (!st || !st.ready) throw new Error("box3dNode.initNode() reported not ready");
        // initNode() returns a STATUS, not the module -- mod() is the module. Taking the wrong one gives a
        // world handle whose every call is "not a function" one layer further down, which is how the first
        // draft of this failed.
        adopted = box3d.adopt(mod(), "box3dNode");
    } catch (e) {
        adopted = { ready: false, reason: "box3dNode could not load box3d's wasm: " + (e.message || String(e)) };
    }
    return adopted;
}

/**
 * selectBackend, with box3d actually available. Same options and same return shape as the browser one; the
 * only difference is that the lighter engine is reachable, which is what the facade's own comment has always
 * promised ("auto: try the lighter engine first").
 */
export async function selectBackend(opts = {}) {
    await adoptBox3dInNode();
    return browserSelectBackend(opts);
}

/** Whether box3d is reachable from Node right now, and by what route -- for a gate or a diagnostic. */
export async function box3dStatus() { return adoptBox3dInNode(); }
