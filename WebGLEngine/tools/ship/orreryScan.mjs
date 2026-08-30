// FILE: tools/ship/orreryScan.mjs -- v4186
//
// Feeds world/orrery.mjs from the real tree: what is under vendor/, what licence provenance each body has,
// how large it is, and when git says it arrived. Node-only (fs and git), which is why it lives here and not
// beside the model -- world/orrery.mjs stays pure so a browser can import it.
"use strict";

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { buildOrrery } from "../../world/orrery.mjs";

/** Every file inside a directory, as paths relative to it. */
export function listFiles(dir, base = dir, out = []) {
    let entries = [];
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return out; }
    for (const e of entries) {
        const full = path.join(dir, e.name);
        if (e.isDirectory()) listFiles(full, base, out);
        else out.push(path.relative(base, full).split(path.sep).join("/"));
    }
    return out;
}

/** Total bytes of a directory. */
export function dirBytes(dir) {
    let n = 0;
    for (const rel of listFiles(dir)) {
        try { n += fs.statSync(path.join(dir, rel)).size; } catch {}
    }
    return n;
}

/**
 * Every file with its own size. This is what makes the MICRO PLANET scale real rather than decorative:
 * world/repoHeightfield.js builds a terrain from per-file sizes, so without this a body could only be drawn
 * as a smooth ball with invented relief. A file whose size cannot be read is reported at 0 rather than
 * dropped -- it is in the tree, and a map of the tree that silently omits files is not a map of the tree.
 */
export function listFileSizes(dir) {
    return listFiles(dir).map((rel) => {
        let bytes = 0;
        try { bytes = fs.statSync(path.join(dir, rel)).size; } catch {}
        return { path: rel, bytes };
    });
}

/**
 * The date git says a path first appeared. Returns null when git cannot say -- which is a real answer
 * (a shallow clone, or a path never committed) and is NOT the same as "arrived today".
 */
export function firstSeen(repoRoot, rel) {
    try {
        const out = execFileSync("git", ["log", "--diff-filter=A", "--format=%ad", "--date=short", "--", rel],
                                 { cwd: repoRoot, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
        const lines = out.trim().split("\n").filter(Boolean);
        return lines.length ? lines[lines.length - 1] : null;
    } catch { return null; }
}

/**
 * Scan vendor/ into orrery bodies.
 * @param engineRoot the WebGLEngine directory
 * @param repoRoot   the git root, for dates
 */
export function scanVendor(engineRoot, repoRoot) {
    const vendorDir = path.join(engineRoot, "vendor");
    let names = [];
    try { names = fs.readdirSync(vendorDir, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name); } catch { return []; }
    return names.sort().map((name) => {
        // ONE walk of the directory, and both the total and the per-file list come out of it. Two walks could
        // disagree -- a file written between them would be in one and not the other -- and then the planet's
        // size and its terrain would describe different trees.
        const files = listFileSizes(path.join(vendorDir, name));
        return {
            name,
            files,
            paths: files.map((f) => f.path),
            bytes: files.reduce((n, f) => n + f.bytes, 0),
            arrived: firstSeen(repoRoot, path.posix.join("WebGLEngine", "vendor", name)),
        };
    });
}

/** The whole job: scan and build. */
export function scan(engineRoot, repoRoot, opts = {}) {
    return buildOrrery(scanVendor(engineRoot, repoRoot), opts);
}
