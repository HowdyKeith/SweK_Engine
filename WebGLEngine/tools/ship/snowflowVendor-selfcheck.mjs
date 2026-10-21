// WebGLEngine/tools/ship/snowflowVendor-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time). (~0.1 s)
//
// Run: node tools/ship/snowflowVendor-selfcheck.mjs
//
// THE VENDORED SNOWFLOW FILES, HELD TO WHAT THE PROVENANCE SAYS. vendor/snowflow/ holds FIVE files from Noniv/snowflow_demo (MIT) at one commit, byte for byte, and nothing else. This gate:
//   1  PINS every file's sha256, so a changed byte is red by name;
//   2  checks the permission notice travels with them (the licence's copyright line and the MIT grant), and that PROVENANCE.txt names the commit, the licence and every file;
//   3  holds the directory to exactly those files (no extra, none missing), so nothing is added to vendor/ unrecorded;
//   4  states what the files ARE: Babylon-flavoured WGSL (`#include<snowNoise>`, loose `uniform` declarations, FragmentInputs) that does not run outside Babylon, and a driver that imports
//      @babylonjs/core -- the reason render/toroidalDeform.mjs is an adaptation and not a copy;
//   5  checks that no file outside the adaptation and the two gates names the vendored paths: nothing loads them.
// SABOTAGES, each applied in place, restored, md5 verified; every one red by name (rows red): a byte appended to the pass 2 | the licence's year changed 3 | PROVENANCE without the commit 2 | an extra file in
// the directory 2 | a page naming the vendored path 2.
// NOT GRADED, said plainly: that upstream's main still equals these files, or that the demo runs.
"use strict";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const DIR = path.join(ENG, "vendor", "snowflow");
const sha = (b) => crypto.createHash("sha256").update(b).digest("hex");
const PINS = Object.freeze({
    "LICENSE": "b108a76735ab7cc0eab686fc3e85ca668bdb8866977093846d01bac5b6440453",
    "src/shaders/deformSim.fragment.wgsl": "00b827bdbd6656d3c9effc22597bbd9c0f439266830cfaf970ee65625e5a9c61",
    "src/shaders/lib/noise.wgsl": "5a308db344aa00fc2d9ce104fa06c64118e49463a5049df5f290ebb0eb52450c",
    "src/shaders/lib/deform.wgsl": "547b57f6dbcbe00c0abe6071bc24015cdfca09d9911f34e5d7f41d070c6f6c6d",
    "src/terrain/deformation.js": "caa36652e3be43cdc478344580fc13d182b602b9dd24ce31facbab0b4f8e5d5b",
});
const COMMIT = "545039733b74eec742862f161990142c7ca7c7ec";
const read = (rel) => fs.readFileSync(path.join(DIR, rel));
const walk = (d, base = "") => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => e.isDirectory() ? walk(path.join(d, e.name), base + e.name + "/") : [base + e.name]);

console.log("snowflowVendor-selfcheck -- vendor/snowflow\n");
console.log("1. THE PINS");
for (const [f, h] of Object.entries(PINS)) { let got = ""; try { got = sha(read(f)); } catch { got = "MISSING"; } ok("!! " + f + " is the pinned upstream file", got === h, got.slice(0, 12)); }

console.log("\n2. THE NOTICE");
{
    const lic = read("LICENSE").toString("utf8"), prov = fs.readFileSync(path.join(DIR, "PROVENANCE.txt"), "utf8");
    ok("!! the licence carries upstream's copyright line and the MIT grant", /^MIT License/.test(lic) && /Copyright \(c\) 2026 Maksymilian Dendura/.test(lic) && /Permission is hereby granted,\sfree\sof\scharge/.test(lic));
    ok("!! PROVENANCE.txt names the repository, the licence, the commit and every file", prov.includes("Noniv/snowflow_demo") && /MIT/.test(prov) && prov.includes(COMMIT) && Object.keys(PINS).every((f) => prov.includes(f)), "commit " + COMMIT.slice(0, 10));
}

console.log("\n3. THE DIRECTORY");
{
    const files = walk(DIR).filter((f) => f !== "PROVENANCE.txt").sort();
    ok("!! vendor/snowflow holds exactly the five recorded files and PROVENANCE.txt, nothing else", JSON.stringify(files) === JSON.stringify(Object.keys(PINS).sort()), files.length + " files");
}

console.log("\n4. WHAT THEY ARE");
{
    const sim = read("src/shaders/deformSim.fragment.wgsl").toString("utf8"), drv = read("src/terrain/deformation.js").toString("utf8");
    ok("!! the pass is Babylon-flavoured WGSL that does not run as it is: an `#include<snowNoise>`, a loose `uniform name: type;` block and FragmentInputs/FragmentOutputs", /#include<snowNoise>/.test(sim) && /^uniform center: vec2f;/m.test(sim) && /FragmentInputs/.test(sim) && /FragmentOutputs/.test(sim) && !/@group/.test(sim));
    ok("!! the driver imports @babylonjs/core, so it is read for its rules and not run", /from "@babylonjs\/core\//.test(drv) && /_relaxOwed/.test(drv) && /RELAX_STEP = 0\.4/.test(drv));
}

console.log("\n5. NOTHING LOADS THEM");
{
    const hits = [];
    (function w(d) {
        for (const e of fs.readdirSync(d, { withFileTypes: true })) {
            const p = path.join(d, e.name);
            if (e.isDirectory()) { if (!/node_modules|\.git$|^vendor$/.test(e.name)) w(p); continue; }
            if (!/\.(mjs|js|html)$/.test(e.name)) continue;
            if (/vendor\/snowflow\//.test(fs.readFileSync(p, "utf8"))) hits.push(path.relative(ENG, p).split(path.sep).join("/"));
        }
    })(ENG);
    const ALLOWED = ["render/toroidalDeform.mjs", "tools/ship/snowflowVendor-selfcheck.mjs", "render/toroidalDeform-selfcheck.mjs"];
    ok("!! only the adaptation and the two gates name the vendored paths: no page or module loads them", JSON.stringify(hits.sort()) === JSON.stringify(ALLOWED.slice().sort()), hits.join(", "));
}

console.log(`\nsnowflowVendor-selfcheck: ${fails === 0 ? "all passed" : fails + " FAILED"}`);
process.exit(fails === 0 ? 0 : 1);
