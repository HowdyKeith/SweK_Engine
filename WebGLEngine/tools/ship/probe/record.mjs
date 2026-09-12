// WebGLEngine/tools/ship/probe/record.mjs -- v4567
//
// The one place a probed process accumulates what it saw, shared by the shims and the CJS patches so both
// mechanisms write into the same sets. Kept apart from inputProbe.mjs because the loader hook's shims are
// resolved in the LOADER's module graph and must reach the same state as the patches applied in the main one.
"use strict";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

export const reads = new Set(), dirs = new Set(), execs = new Set();
export const flags = { net: false, spawnedNonNode: false, spawnedNode: 0 };

/** A path relative to the engine root, or null when it is not one of ours to invalidate on. */
export function rel(p) {
    try {
        // fileURLToPath, not `.pathname`: on Windows a file URL's pathname is "/C:/x" and the leading slash
        // makes every path.relative wrong. winPathGuard-selfcheck names both idioms.
        const s = typeof p === "string" ? p : (p && p.href ? fileURLToPath(p.href) : String(p));
        if (!s.startsWith("/")) return null;                  // an fd or a Buffer: not a path we can hash
        const r = path.relative(ENG, s).split(path.sep).join("/");
        return r.startsWith("..") ? null : r;                 // outside the tree: not ours to invalidate on
    } catch { return null; }
}

export const addRead = (p) => { const r = rel(p); if (r) reads.add(r); };
export const addDir = (p) => { const r = rel(p); if (r) dirs.add(r); };
