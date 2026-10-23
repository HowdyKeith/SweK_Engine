// WebGLEngine/tools/ship/takeTruncations.mjs -- UNNUMBERED (the version is chosen at ship time).
//
// Run: node tools/ship/takeTruncations.mjs [--root <dir>]       exit 1 if any WGSL cuts a reciprocal-derived float to an integer with no rounding
//
// THE COMMAND FOR tools/ship/truncationGuard.mjs: the scan its gate runs over the tree, as a tool a person can point at a file or a folder when they write a kernel. NO EXPORTS ON PURPOSE
// (the library is held by this file and graded by tools/ship/truncationGuard-selfcheck.mjs). The bug it finds, and why only a real D3D12 GPU showed it, are in truncationGuard.mjs's header.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseOrExit } from "./cliArgs.mjs";
import { findTruncations } from "./truncationGuard.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const cli = parseOrExit("takeTruncations", { values: { "--root": "path" }, flags: [] });
const root = path.resolve(cli.values["--root"] || ENG);
const files = [];
(function walk(d) {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        if (["node_modules", ".git", "vendor"].includes(e.name)) continue;
        const p = path.join(d, e.name);
        if (e.isDirectory()) walk(p);
        else if (/\.(js|mjs|html|wgsl)$/.test(e.name)) files.push(p);
    }
})(fs.statSync(root).isDirectory() ? root : path.dirname(root));
const targets = fs.statSync(root).isDirectory() ? files : [root];
let scanned = 0, found = 0;
for (const f of targets) {
    const t = fs.readFileSync(f, "utf8");
    if (!/\bfn\s+\w+\s*\(/.test(t)) continue;
    scanned++;
    if (/truncationGuard(-selfcheck)?\.mjs$/.test(f)) continue;       // the library and its gate hold the bug as an example
    for (const h of findTruncations(t)) { found++; console.log(path.relative(root, f).replace(/\\/g, "/") + ":" + h.line + "  [" + h.conv + " of a " + (h.kind === "direct" ? "reciprocal" : h.kind === "call" ? "call to a reciprocal " : "reciprocal-derived '" + h.name + "'") + "]  " + h.text); }
}
console.log("[takeTruncations] " + scanned + " files with WGSL scanned, " + found + " truncation" + (found === 1 ? "" : "s") + " of a reciprocal-derived float without rounding");
if (found) console.log("[takeTruncations] round it: floor(x + 0.5) where the size is made, or round() at the cut. See tools/ship/truncationGuard.mjs for why.");
process.exit(found ? 1 : 0);
