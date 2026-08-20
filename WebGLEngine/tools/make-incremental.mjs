#!/usr/bin/env node
// tools/make-incremental.mjs - build a .swekupdate.json incremental package by diffing two install trees.
//
//   node tools/make-incremental.mjs <oldDir> <newDir> <out.swekupdate.json> [toVersion]
//
// Walks <newDir>: any file missing from <oldDir> or whose bytes differ becomes a "write" (base64); any file in <oldDir>
// that is gone from <newDir> becomes a "delete". toVersion defaults to the ENGINE_VERSION in <newDir>/WebGLEngine/main.js.
// The engine ingests the result via POST /update/apply or the incoming-updates/ drop folder (SWEK_AUTOUPDATE).

import fs from "fs";
import path from "path";

const SKIP = new Set(["node_modules", "vendor", "asset_library", "GPU_Assets", "apks", ".git", ".update-backups", "incoming-updates", "__pycache__", "doc-out", ".kpop-wav"]);
const SKIP_FILE = /\.(zip|log)$|^sync-peers\.json$|\.swekupdate\.json/;

function walk(root, base = "", out = []) {
    let entries = [];
    try { entries = fs.readdirSync(path.join(root, base), { withFileTypes: true }); } catch { return out; }
    for (const e of entries) {
        if (e.isDirectory()) { if (SKIP.has(e.name)) continue; walk(root, path.join(base, e.name), out); }
        else { if (SKIP_FILE.test(e.name)) continue; out.push(base ? base + "/" + e.name : e.name); }
    }
    return out;
}
function read(p) { try { return fs.readFileSync(p); } catch { return null; } }
function differs(a, b) { if (!a || !b) return true; return !a.equals(b); }

const [, , oldDir, newDir, outFile, toVerArg] = process.argv;
if (!oldDir || !newDir || !outFile) { console.error("usage: make-incremental.mjs <oldDir> <newDir> <out.swekupdate.json> [toVersion]"); process.exit(2); }

let toVersion = toVerArg;
if (!toVersion) { try { toVersion = (fs.readFileSync(path.join(newDir, "WebGLEngine", "main.js"), "utf8").match(/ENGINE_VERSION\s*=\s*"(v\d+)"/) || [])[1]; } catch {} }
if (!toVersion) { console.error("could not determine toVersion (pass it as the 4th arg)"); process.exit(2); }
let fromVersion = ""; try { fromVersion = (fs.readFileSync(path.join(oldDir, "WebGLEngine", "main.js"), "utf8").match(/ENGINE_VERSION\s*=\s*"(v\d+)"/) || [])[1] || ""; } catch {}

const newFiles = walk(newDir), oldFiles = new Set(walk(oldDir));
const files = [];
let writes = 0, deletes = 0;
for (const rel of newFiles) {
    const nb = read(path.join(newDir, rel));
    const ob = oldFiles.has(rel) ? read(path.join(oldDir, rel)) : null;
    if (differs(ob, nb)) { files.push({ path: rel, action: "write", content: nb.toString("base64") }); writes++; }
}
for (const rel of oldFiles) { if (newFiles.indexOf(rel) === -1) { files.push({ path: rel, action: "delete" }); deletes++; } }

const pkg = { type: "swek-incremental", fromVersion: fromVersion || undefined, toVersion, note: `incremental ${fromVersion || "?"} -> ${toVersion}`, files };
fs.writeFileSync(outFile, JSON.stringify(pkg));
const sizeKB = (fs.statSync(outFile).size / 1024).toFixed(1);
console.log(`wrote ${outFile}: ${writes} writes, ${deletes} deletes, ${toVersion} (${sizeKB} KB)`);
