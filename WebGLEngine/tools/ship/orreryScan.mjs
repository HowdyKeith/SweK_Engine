// FILE: tools/ship/orreryScan.mjs -- v4189
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
    return firstCommit(repoRoot, rel).date;
}

/**
 * The commit that first added a path: its date AND its full hash.
 *
 * *** THE FULL HASH, NOT THE ABBREVIATION. *** %H rather than %h, because world/orrerySeed.mjs folds every
 * character of it into the body's planet seed and an abbreviation would throw away 128 of the 160 bits.
 * Both halves come from ONE git invocation: asking twice could straddle a commit and pair a date with a
 * different commit's hash, which is a small window and a genuinely confusing bug to chase.
 */
export function firstCommit(repoRoot, rel) {
    try {
        const out = execFileSync("git", ["log", "--diff-filter=A", "--format=%H %ad", "--date=short", "--", rel],
                                 { cwd: repoRoot, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
        const lines = out.trim().split("\n").filter(Boolean);
        if (!lines.length) return { sha: null, date: null };
        const last = lines[lines.length - 1];         // the OLDEST such commit -- git lists newest first
        const sp = last.indexOf(" ");
        if (sp < 0) return { sha: null, date: null };
        return { sha: last.slice(0, sp), date: last.slice(sp + 1).trim() || null };
    } catch { return { sha: null, date: null }; }
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
        const first = firstCommit(repoRoot, path.posix.join("WebGLEngine", "vendor", name));
        return {
            name,
            files,
            paths: files.map((f) => f.path),
            bytes: files.reduce((n, f) => n + f.bytes, 0),
            arrived: first.date,
            sha: first.sha,          // the planet seed -- see world/orrerySeed.mjs
        };
    });
}

/** The whole job: scan and build. */
export function scan(engineRoot, repoRoot, opts = {}) {
    return buildOrrery(scanVendor(engineRoot, repoRoot), opts);
}
