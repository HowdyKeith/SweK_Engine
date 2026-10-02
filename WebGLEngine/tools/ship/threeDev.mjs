#!/usr/bin/env node
// WebGLEngine/tools/ship/threeDev.mjs -- v4799
//
// THE ISSUES IN docs/upstream-three/dev/, RUN ON THREE'S OWN BUILDS OF ITS LATEST RELEASE AND ITS dev BRANCH. The drafts beside
// them (docs/upstream-three/*.md) hold three r185, the release this engine vendors; three takes pull requests against `dev`, and
// its bug form asks for the latest release. So each issue there carries its reproduction importing r186 (0.186.1) and a patch
// against `dev` at DEV_COMMIT, and this tool runs every reproduction on: r186 as npm ships it; `dev` built by three's own rollup;
// `dev` with the issue's patch alone; and `dev` with every patch, applied in order. It writes what each printed -- raw, as the page
// returned it -- to docs/upstream-three/dev/record.json, beside the hash of every patch and every reproduction it ran.
// tools/ship/threeUpstream-selfcheck.mjs (section 6) holds the issues to the record: a patch or a reproduction edited since is red
// until this is run again. It needs what the gate cannot carry -- a three checkout at DEV_COMMIT and r186's package -- so:
//
//   node tools/ship/threeDev.mjs --three <three.js checkout at DEV_COMMIT> --r186 <three@0.186.1 unpacked: `npm pack three@0.186.1`>
//
// The checkout's src/ is patched and built in place, and src/ and build/ are left as they were found. *** NOTHING HERE POSTS ANYTHING. ***
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
export const DEV_DIR = path.join(ENG, "docs", "upstream-three", "dev");
export const DEV_PATCHES = path.join(DEV_DIR, "patches");
export const RECORD = path.join(DEV_DIR, "record.json");
/** three's dev branch where the patches were made and measured, and the release the reproductions import. */
export const DEV_COMMIT = "1ea31f304854ee3c85df39fdb3eaec584bba6d9b";
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

/** The patch files, by slot. */
export function devPatches(dir = DEV_PATCHES) {
    return Object.fromEntries((fs.existsSync(dir) ? fs.readdirSync(dir) : []).filter((f) => /^\d\d-.*\.diff$/.test(f)).sort().map((f) => [f.slice(0, 2), f]));
}

function main() {
    const CLI = { values: { "--three": "path", "--r186": "path" } };
    const cli = parseArgs(process.argv.slice(2), CLI);
    if (cli.errors.length) { for (const l of refusalLines("threeDev", cli.errors, CLI)) console.error(l); process.exit(2); }
    const three = cli.values["--three"] || null, r186 = cli.values["--r186"] || null;
    if (!three || !r186) { console.error("usage: node tools/ship/threeDev.mjs --three <three checkout at " + DEV_COMMIT.slice(0, 7) + "> --r186 <three@" + RELEASE + " unpacked>"); process.exit(2); }
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

    // three's own builds: dev, each patch alone, and every patch in order -- the checkout's src/ restored after each
    const out = fs.mkdtempSync(path.join(os.tmpdir(), "three-dev-")), FILES = ["three.core.js", "three.tsl.js", "three.webgpu.js"];
    const build = (label, list) => {
        git("checkout", "--", "src");
        for (const s of list) execFileSync("git", ["apply", patchPath(s)], { cwd: three });
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
    } finally { git("checkout", "--", "src", "build"); }
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
            results,
        };
        fs.writeFileSync(RECORD, JSON.stringify(record, null, 1) + "\n");
        console.log(`wrote ${path.relative(ENG, RECORD)}: ${all.length} issues, each on r186, dev, dev with its patch, and dev with all ${all.length}`);
    })();
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
