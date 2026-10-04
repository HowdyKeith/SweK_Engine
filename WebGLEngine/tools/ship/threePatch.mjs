// WebGLEngine/tools/ship/threePatch.mjs -- v4773
//
// THE PATCHES IN docs/upstream-three/patches/, APPLIED TO THE VENDORED three.webgpu.js. Each patch is a git diff against three's
// src/ at the r185 tag; the vendored build is that source concatenated by three's rollup -- no import lines, no `export` on a
// declaration, and one identifier the bundler renamed where two modules declared the same name. So a hunk's text, taken as the
// build holds it, is found in the build and replaced; a hunk found other than exactly once is reported, not applied.
// tools/ship/threeUpstream-selfcheck.mjs (v4771) and tools/ship/threeUpstreamPaths-selfcheck.mjs (v4773) run the drafts'
// reproductions and the paths they do not take on builds made here; a temporary engine root holds each beside r185's own.
"use strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
export const PATCHES = path.join(ENG, "docs", "upstream-three", "patches");
export const BUNDLE = path.join(ENG, "vendor", "three-webgpu", "three.webgpu.js");

/** Identifiers the bundler renamed where two modules declared the same name, per source file. */
export const RENAMED = Object.freeze({
    "src/materials/nodes/SpriteNodeMaterial.js": [["reference( '", "reference$1( '"]],
    "src/renderers/common/RenderObject.js": [["hash( ", "hash$1( "]],
});

/** A unified diff's hunks as the build holds them: context and removed lines are the old text, context and added the new. */
export function hunksOf(diff) {
    const out = []; let file = null, cur = null;
    for (const line of diff.split("\n")) {
        if (line.startsWith("+++ ")) { file = line.slice(4).replace(/^b\//, ""); continue; }
        if (line.startsWith("--- ") || line.startsWith("diff ") || line.startsWith("index ")) continue;
        if (line.startsWith("@@")) { cur = { file, old: [], new: [] }; out.push(cur); continue; }
        if (!cur || line.startsWith("\\")) continue;
        if (line[0] === " " || line === "") { cur.old.push(line.slice(1)); cur.new.push(line.slice(1)); }
        else if (line[0] === "-") cur.old.push(line.slice(1));
        else if (line[0] === "+") cur.new.push(line.slice(1));
    }
    const bundled = (lines) => lines.filter((l) => !/^import\s/.test(l)).map((l) => l.replace(/^export (const|function|class|let) /, "$1 "));
    const renamed = (f, t) => (RENAMED[f] || []).reduce((q, [x, y]) => q.split(x).join(y), t);
    return out.map((h) => ({ file: h.file, old: renamed(h.file, bundled(h.old).join("\n")), new: renamed(h.file, bundled(h.new).join("\n")) })).filter((h) => h.old !== h.new);
}

/** The text with each hunk's old text replaced by its new, and how many times each old text was found (only a 1 is applied). */
export function apply(diff, text) {
    const found = [];
    for (const h of hunksOf(diff)) { const n = text.split(h.old).length - 1; found.push(n); if (n === 1) text = text.replace(h.old, () => h.new); }
    return { text, found };
}

/**
 * v4774: the build with its one import from three.core.js written in sorted order. three's rollup lists those names in the order
 * the bundle first uses them, so a patch that uses one earlier moves it; the applier leaves the line as it was. With that line's
 * names sorted, the applier's text and three's own build of the patched source are the same bytes (tools/ship/threeUpstream-
 * selfcheck.mjs holds the hash of each).
 */
export function normalImports(text) {
    return text.split("\n").map((l) => /^import \{ .* \} from '\.\/three\.core\.js';$/.test(l)
        ? "import { " + l.slice("import { ".length, l.indexOf(" } from")).split(", ").sort().join(", ") + " } from './three.core.js';" : l).join("\n");
}

/** Each patch file's text, by its two-digit slot ("01" ...). */
export function patchTexts(dir = PATCHES) {
    return Object.fromEntries((fs.existsSync(dir) ? fs.readdirSync(dir) : []).filter((f) => /^\d\d-.*\.diff$/.test(f)).sort().map((f) => [f.slice(0, 2), fs.readFileSync(path.join(dir, f), "utf8")]));
}

/**
 * A temporary engine root: this tree by symlink, and beside it `three-patched/<slot>/` holding the given builds (three.tsl.js and
 * three.core.js import the build by a relative path, so each directory is a three of its own). Returns { root, dispose }.
 */
export function rootWithBuilds(builds, { fsx = fs } = {}) {
    const root = fsx.mkdtempSync(path.join(os.tmpdir(), "three-patched-"));
    const made = [];
    for (const e of fsx.readdirSync(ENG)) made.push(linkInto(path.join(ENG, e), path.join(root, e), fsx));
    for (const [slot, text] of Object.entries(builds)) {
        const dir = path.join(root, "three-patched", slot); fsx.mkdirSync(dir, { recursive: true });
        fsx.writeFileSync(path.join(dir, "three.webgpu.js"), text);
        for (const e of ["three.tsl.js", "three.core.js"]) made.push(linkInto(path.join(ENG, "vendor", "three-webgpu", e), path.join(dir, e), fsx));
    }
    return { root, made, dispose: () => disposeRoot(root, made, fsx) };
}

/**
 * *** RIG RUN 2 -- A FILE SYMLINK NEEDS A PRIVILEGE ON WINDOWS, AND THE OVERLAY MADE ONE PER TOP-LEVEL FILE. *** Keith's rig:
 * "EPERM: operation not permitted, symlink '...\WebGLEngine\.gitignore'", so threeUpstream and threeUpstreamPaths died on
 * their first line. A DIRECTORY links as a junction, which needs none; a FILE is a symlink where the box allows it, else a
 * hardlink (same volume), else a copy -- the file only has to read the same through the overlay. Returns { at, kind }.
 */
export function linkInto(target, at, fsx = fs) {
    const dir = fsx.statSync(target).isDirectory();
    try { fsx.symlinkSync(target, at, dir ? "junction" : "file"); return { at, kind: dir ? "junction" : "symlink" }; }
    catch (e) { if (dir || (e.code !== "EPERM" && e.code !== "EACCES")) throw e; }
    try { fsx.linkSync(target, at); return { at, kind: "hardlink" }; }
    catch { fsx.copyFileSync(target, at); return { at, kind: "copy" }; }
}

/**
 * The overlay is removed LINK BY LINK before anything recursive runs, so no recursive delete ever stands on a junction into
 * the engine tree -- whatever a platform's rm does with one, it is never asked. Anything still a link afterwards is left
 * where it is and reported, not removed.
 */
export function disposeRoot(root, made, fsx = fs) {
    for (const m of made) { try { fsx.unlinkSync(m.at); } catch { try { fsx.rmdirSync(m.at); } catch { /* reported below */ } } }
    const left = [];
    (function walk(d) {
        for (const e of fsx.readdirSync(d)) {
            const p = path.join(d, e), st = fsx.lstatSync(p);
            if (st.isSymbolicLink()) left.push(p); else if (st.isDirectory()) walk(p);
        }
    })(root);
    if (left.length) return { removed: false, left };
    fsx.rmSync(root, { recursive: true, force: true });
    return { removed: true, left };
}
