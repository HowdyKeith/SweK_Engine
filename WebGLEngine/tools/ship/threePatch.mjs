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
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { runInEngineOrigin } from "./webgpuHarness.mjs";
import { parseArgs, refusalLines } from "./cliArgs.mjs";

export const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
export const PATCHES = path.join(ENG, "docs", "upstream-three", "patches");
// v4805: the engine vendors r186 now; the drafts one directory up, their patches and the paths gate are r185's, and run on r185
// kept beside it -- vendor/three-webgpu-r185, the same bytes vendor/three-webgpu held until then
export const R185_DIR = path.join(ENG, "vendor", "three-webgpu-r185");
export const BUNDLE = path.join(R185_DIR, "three.webgpu.js");

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
        // v4805: the r185 patches run on r185, kept in R185_DIR since vendor/three-webgpu moved to r186; v4778 rig run 2: linkInto, for a box
        // that refuses file symlinks
        for (const e of ["three.tsl.js", "three.core.js"]) made.push(linkInto(path.join(R185_DIR, e), path.join(dir, e), fsx));
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

// ---- v4799: THE ISSUES ON r186 AND dev -----------------------------------------------------------------------
//
// THE ISSUES IN docs/upstream-three/dev/, RUN ON THREE'S OWN BUILDS OF ITS LATEST RELEASE AND ITS dev BRANCH. The drafts beside
// them (docs/upstream-three/*.md) hold three r185, the release this engine vendors; three takes pull requests against `dev`, and
// its bug form asks for the latest release. So each issue there carries its reproduction importing r186 (0.186.1) and a patch
// against `dev` at DEV_COMMIT, and this module's command runs every reproduction on: r186 as npm ships it; `dev` built by three's own rollup;
// `dev` with the issue's patch alone; and `dev` with every patch, applied in order. It writes what each printed -- raw, as the page
// returned it -- to docs/upstream-three/dev/record.json, beside the hash of every patch and every reproduction it ran.
// tools/ship/threeUpstream-selfcheck.mjs (section 6) holds the issues to the record: a patch or a reproduction edited since is red
// until this is run again. It needs what the gate cannot carry -- a three checkout at DEV_COMMIT and r186's package -- so:
//
//   node tools/ship/threePatch.mjs --three <three.js checkout at DEV_COMMIT> --r186 <three@0.186.1 unpacked: `npm pack three@0.186.1`>
//
// The checkout's src/ is patched and built in place, and src/ and build/ are left as they were found. *** NOTHING HERE POSTS ANYTHING. ***
// (Folded in here rather than a module of its own: a second gate-imported tool beside this one is a new orphan on two
// ratchets that may only shrink.)
export const DEV_DIR = path.join(ENG, "docs", "upstream-three", "dev");
export const DEV_PATCHES = path.join(DEV_DIR, "patches");
export const RECORD = path.join(DEV_DIR, "record.json");
/** three's dev branch where the patches were made and measured, and the release the reproductions import. */
// export const DEV_COMMIT = "1ea31f304854ee3c85df39fdb3eaec584bba6d9b";   // 2 October 2026, v4799-v4810
// v4811 -- dev on 4 October 2026: twelve commits on, every patch applies unchanged, and the record was taken again here.
export const DEV_COMMIT = "576b084aff43ec5bb79911befb1d51be178cb7ed";
export const RELEASE = "0.186.1";
export const IMPORT_LINE = 'import * as THREE from "three"; import * as T from "three/tsl";';

export const sha256 = (t) => crypto.createHash("sha256").update(t).digest("hex");
const between = (s, a, b) => { const i = s.indexOf(a), j = i < 0 ? -1 : s.indexOf(b, i + a.length); return i < 0 || j < 0 ? null : s.slice(i + a.length, j); };

/** The issue files, by their two-digit slot. (An object lists "10" and up before "03": sort its keys before relying on order.) */
export function issueFiles(dir = DEV_DIR) {
    return Object.fromEntries((fs.existsSync(dir) ? fs.readdirSync(dir) : []).filter((f) => /^\d\d-.*\.md$/.test(f)).sort().map((f) => [f.slice(0, 2), f]));
}

/** An issue's parts: its Code block's html, the module script in it (null if not as the drafts write it), and its inline patch. */
export function issueParts(text) {
    const html = between(text, "### Code\n\n```html\n", "```\n");
    const mod = html && between(html, '<script type="module">\n', "</script>");
    return {
        html,
        script: mod && mod.startsWith(IMPORT_LINE) ? mod.slice(IMPORT_LINE.length).replace('document.getElementById("out").textContent = JSON.stringify(r, null, 1);', "") : null,
        patch: between(text, "<details><summary>Patch</summary>\n\n```diff\n", "```\n\n</details>"),
    };
}

/**
 * v4802: a three-way merge's conflict blocks (diff3 style) resolved where, and only where, each side is ONE import line from
 * the same module: the names either side imports, less any name either side removed from the base. Returns { text, lines }
 * -- the merged import lines -- or null if any block is anything else.
 */
export function mergeImportConflicts(text) {
    const RE = /^<<<<<<< [^\n]*\n(.*)\n\|\|\|\|\|\|\| [^\n]*\n(.*)\n=======\n(.*)\n>>>>>>> [^\n]*$/gm;
    const IMPORT = /^import \{ ([^}]*) \} from ('[^']+');$/;
    const lines = []; let bad = false;
    const out = text.replace(RE, (whole, ours, base, theirs) => {
        const [o, b, t] = [ours, base, theirs].map((l) => IMPORT.exec(l));
        if (!o || !b || !t || o[2] !== b[2] || t[2] !== b[2]) { bad = true; return whole; }
        const names = (m) => m[1].split(",").map((x) => x.trim()).filter(Boolean);
        const [N, B, T] = [o, b, t].map(names), removed = B.filter((n) => !N.includes(n) || !T.includes(n));
        const keep = [...B, ...N, ...T].filter((n, i, a) => a.indexOf(n) === i && !removed.includes(n));
        // concatenated, not a template: a template building an import line reads as a generated import to windowsImport
        const line = "import { " + keep.join(", ") + " } from " + b[2] + ";"; lines.push(line); return line;
    });
    return bad || /^(<<<<<<<|=======|>>>>>>>)/m.test(out) ? null : { text: out, lines };
}

/** The patch files, by slot. */
/**
 * v4811 -- the files a patch edits and the blob each was made against: `diff --git a/F b/F` and its `index PRE..POST` line, PRE as
 * the patch abbreviates it (all zeros for a file the patch creates). A patch made against dev's own files names dev's blobs here; one
 * carried forward from an older dev and applied with offsets names that dev's.
 */
export function patchBases(text) {
    const out = [], re = /^diff --git a\/(\S+) b\/\S+\n(?:(?:new|deleted) file mode \d+\n)?index ([0-9a-f]+)\.\.[0-9a-f]+/gm;
    for (let m; (m = re.exec(text));) out.push({ file: m[1], pre: m[2] });
    return out;
}

export function devPatches(dir = DEV_PATCHES) {
    return Object.fromEntries((fs.existsSync(dir) ? fs.readdirSync(dir) : []).filter((f) => /^\d\d-.*\.diff$/.test(f)).sort().map((f) => [f.slice(0, 2), f]));
}

function main() {
    const CLI = { values: { "--three": "path", "--r186": "path" } };
    const cli = parseArgs(process.argv.slice(2), CLI);
    if (cli.errors.length) { for (const l of refusalLines("threePatch", cli.errors, CLI)) console.error(l); process.exit(2); }
    const three = cli.values["--three"] || null, r186 = cli.values["--r186"] || null;
    if (!three || !r186) { console.error("usage: node tools/ship/threePatch.mjs --three <three checkout at " + DEV_COMMIT.slice(0, 7) + "> --r186 <three@" + RELEASE + " unpacked>"); process.exit(2); }
    const git = (...a) => execFileSync("git", a, { cwd: three, encoding: "utf8" }).trim();
    const head = git("rev-parse", "HEAD");
    if (head !== DEV_COMMIT) { console.error(`the checkout is at ${head}, not ${DEV_COMMIT}`); process.exit(2); }
    if (git("status", "--porcelain", "--", "src")) { console.error("the checkout's src/ has changes; this tool patches it and restores it, so it must start clean"); process.exit(2); }
    const pkg = JSON.parse(fs.readFileSync(path.join(r186, "package.json"), "utf8"));
    if (pkg.version !== RELEASE) { console.error(`--r186 holds three ${pkg.version}, not ${RELEASE}`); process.exit(2); }

    // sorted by hand: "10" and up are integer keys, which an object lists before "03"
    const issues = issueFiles(), patches = devPatches(), texts = {}, parts = {}, slots = Object.keys(issues).sort();
    for (const [slot, f] of Object.entries(issues)) { texts[slot] = fs.readFileSync(path.join(DEV_DIR, f), "utf8"); parts[slot] = issueParts(texts[slot]); }
    const bad = Object.keys(issues).filter((s) => !parts[s].script || !patches[s]);
    if (bad.length) { console.error("issues without a reproduction as the drafts write it, or without a patch: " + bad.join(", ")); process.exit(2); }
    const patchPath = (s) => path.join(DEV_PATCHES, patches[s]);
    // v4811: the blob dev holds at this commit for every file each patch edits -- null where the file does not exist
    const blobAt = (f) => { try { return git("rev-parse", `HEAD:${f}`); } catch { return null; } };
    const bases = Object.fromEntries(slots.map((s) => [s, Object.fromEntries(patchBases(fs.readFileSync(patchPath(s), "utf8")).map(({ file }) => [file, blobAt(file)]))]));

    // three's own builds: dev, each patch alone, and every patch in order -- the checkout's src/ restored after each
    const out = fs.mkdtempSync(path.join(os.tmpdir(), "three-dev-")), FILES = ["three.core.js", "three.tsl.js", "three.webgpu.js"];
    const merged = [];
    const build = (label, list) => {
        git("reset", "-q"); git("checkout", "HEAD", "--", "src");
        for (const s of list) {
            try { execFileSync("git", ["apply", "--index", patchPath(s)], { cwd: three, stdio: "pipe" }); continue; } catch { /* below */ }
            // v4802: applied on top of earlier patches, a patch can meet a line one of them changed too -- 16 and 08 both edit
            // Instance.js's one import from EventNode.js, and three's lint forbids a second import of the module. So: three-way,
            // and ONLY an import line's conflict is resolved (mergeImportConflicts); anything else stops the build.
            try { execFileSync("git", ["-c", "merge.conflictStyle=diff3", "apply", "-3", patchPath(s)], { cwd: three, stdio: "pipe" }); } catch { /* conflicts, below */ }
            const conflicted = git("diff", "--name-only", "--diff-filter=U").split("\n").filter(Boolean);
            if (!conflicted.length) throw new Error(`patch ${s} does not apply on top of ${list.slice(0, list.indexOf(s)).join(", ")}`);
            for (const f of conflicted) {
                const r = mergeImportConflicts(fs.readFileSync(path.join(three, f), "utf8"));
                if (r === null) throw new Error(`patch ${s} conflicts in ${f} beyond an import line`);
                fs.writeFileSync(path.join(three, f), r.text); git("add", f);
                for (const line of r.lines) merged.push({ build: label, patch: s, file: f, line });
            }
        }
        execFileSync("npx", ["rollup", "-c", "utils/build/rollup.config.js"], { cwd: three, stdio: "ignore" });
        fs.mkdirSync(path.join(out, label));
        for (const f of FILES) fs.copyFileSync(path.join(three, "build", f), path.join(out, label, f));
        console.log(`  built ${label}`);
    };
    const builds = {};
    try {
        build("dev", []);
        for (const s of slots) build("p" + s, [s]);
        build("all", slots);
    } finally { git("reset", "-q"); git("checkout", "HEAD", "--", "src", "build"); }
    // r186 as npm ships it, but for three.tsl.js's one import of the bare 'three/webgpu', pointed at the file beside it: the page
    // has no import map
    fs.mkdirSync(path.join(out, "r186"));
    const r186Files = {};
    for (const f of FILES) { const t = fs.readFileSync(path.join(r186, "build", f), "utf8"); r186Files[f] = sha256(t); fs.writeFileSync(path.join(out, "r186", f), f === "three.tsl.js" ? t.replace("from 'three/webgpu'", "from './three.webgpu.js'") : t); }
    for (const label of fs.readdirSync(out)) builds[label] = sha256(fs.readFileSync(path.join(out, label, "three.webgpu.js")));

    // a temporary engine root -- this tree by symlink, the builds beside it -- and one page per build
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "three-dev-root-"));
    for (const e of fs.readdirSync(ENG)) fs.symlinkSync(path.join(ENG, e), path.join(root, e));
    fs.symlinkSync(out, path.join(root, "three-dev-builds"));
    const page = (label, slots) => runInEngineOrigin({ engineRoot: root, timeoutMs: 900000, args: {}, script: `async () => {
        const out = {};
        ${slots.map((s) => `try {
            const THREE = await import("/three-dev-builds/${label}/three.webgpu.js"), T = await import("/three-dev-builds/${label}/three.tsl.js"); window.__result = undefined;
            await (async () => { ${parts[s].script} })(); out[${JSON.stringify(s)}] = window.__result;
        } catch (e) { out[${JSON.stringify(s)}] = { error: String((e && e.message) || e) }; }`).join("\n        ")}
        return out; }` }).then((r) => (r.ok ? r.result : Object.fromEntries(slots.map((s) => [s, { error: r.reason || (r.pageErrors || []).join("; ") }]))));
    const all = slots;
    return (async () => {
        const results = Object.fromEntries(all.map((s) => [s, {}]));
        try {
            for (const label of ["r186", "dev", "all"]) { const r = await page(label, all); for (const s of all) results[s][label === "all" ? "all" : label] = r[s]; console.log(`  ran ${label}`); }
            for (const s of all) { const r = await page("p" + s, [s]); results[s].patched = r[s]; console.log(`  ran ${s} with its patch`); }
        } finally { fs.rmSync(root, { recursive: true, force: true }); fs.rmSync(out, { recursive: true, force: true }); }
        const record = {
            devCommit: DEV_COMMIT, release: RELEASE, releaseFiles: r186Files,
            releaseEdit: "three.tsl.js's one import of 'three/webgpu' pointed at './three.webgpu.js' (the page has no import map); nothing else",
            builds, browser: "headless Chromium, SwiftShader (tools/ship/webgpuHarness.mjs)",
            patches: Object.fromEntries(all.map((s) => [s, sha256(fs.readFileSync(patchPath(s), "utf8"))])),
            code: Object.fromEntries(all.map((s) => [s, sha256(parts[s].html)])),
            merged, bases,
            results,
        };
        fs.writeFileSync(RECORD, JSON.stringify(record, null, 1) + "\n");
        console.log(`wrote ${path.relative(ENG, RECORD)}: ${all.length} issues, each on r186, dev, dev with its patch, and dev with all ${all.length}`);
    })();
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
