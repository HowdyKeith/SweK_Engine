#!/usr/bin/env node
// WebGLEngine/tools/ship/threeUpstream-selfcheck.mjs -- v4763
//
// THE THREE.JS BUG REPORTS IN docs/upstream-three/ ARE DRAFTS, AND WHAT THEY SAY IS HELD HERE. Each draft carries a minimal
// standalone reproduction that imports three from a CDN; this gate lifts each one out of its draft, points its imports at the
// vendored r185, runs it in a headless browser on both backends, and holds (a) the numbers to the bug -- the reproduction
// still shows it -- and (b) the draft's "Observed" block to the numbers, character for character, so no draft states what
// its own reproduction does not print. When three is updated and a bug is fixed, its row goes red and says which draft is stale.
// *** NOTHING HERE POSTS ANYTHING. *** Filing them is the maintainer's call.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runInEngineOrigin, webgpuSkipReason } from "./webgpuHarness.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const DIR = path.join(ENG, "docs", "upstream-three");
let fails = 0;
const ok = (label, cond, detail) => { if (!cond) fails++; console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}${detail ? "   " + detail : ""}`); };

// each draft: what its reproduction must print for the bug to stand, and the Observed block that says so
const px = (v) => v.toFixed(3), same = (r, k) => r.webgpu[k] === r.webgl2[k];
const DRAFTS = {
    "01-velocity-instancedmesh.md": { bug: (r) => same(r, "plain") && same(r, "instanced") && Math.abs(r.webgpu.plain - r.webgpu.instanced) > 1,
        observed: (r) => `plain ${px(r.webgpu.plain)}, instanced ${px(r.webgpu.instanced)} (px, both backends)` },
    "02-velocity-batchedmesh.md": { bug: (r) => same(r, "plain") && same(r, "batched") && Math.abs(r.webgpu.plain - r.webgpu.batched) > 1,
        observed: (r) => `plain ${px(r.webgpu.plain)}, batched ${px(r.webgpu.batched)} (px, both backends)` },
    "03-velocity-morph.md": { bug: (r) => same(r, "plain") && same(r, "morphed") && Math.abs(r.webgpu.plain - r.webgpu.morphed) > 1,
        observed: (r) => `plain ${px(r.webgpu.plain)}, morphed ${px(r.webgpu.morphed)} (px, both backends)` },
    "04-velocity-skinned.md": { bug: (r) => same(r, "plain") && same(r, "skinned") && Math.abs(r.webgpu.plain - r.webgpu.skinned) > 1,
        observed: (r) => `plain ${px(r.webgpu.plain)}, skinned ${px(r.webgpu.skinned)} (px, both backends)` },
    "05-sprite-center-shared-program.md": { bug: (r) => ["offCentre", "centredAfter", "centredUnlike"].every((k) => same(r, k)) && r.webgpu.centredAfter === r.webgpu.offCentre && Math.abs(r.webgpu.centredUnlike - r.webgpu.offCentre) > 3,
        observed: (r) => `offCentre ${r.webgpu.offCentre}, centredAfter ${r.webgpu.centredAfter}, centredUnlike ${r.webgpu.centredUnlike} (both backends)` },
    "06-webgl2-second-compute.md": { bug: (r) => r.webgpu.moved.join() === "true,true" && r.webgl2.moved.join() === "true,false",
        observed: (r) => `webgpu moved [${r.webgpu.moved.join(", ")}]; webgl2 moved [${r.webgl2.moved.join(", ")}]` },
};
const between = (s, a, b) => { const i = s.indexOf(a), j = s.indexOf(b, i + a.length); return i < 0 || j < 0 ? null : s.slice(i + a.length, j); };

console.log("\n1. THE DRAFTS: each carries a reproduction and an Observed block, and the index names every one");
const files = fs.existsSync(DIR) ? fs.readdirSync(DIR).filter((f) => /^\d\d-.*\.md$/.test(f)).sort() : [];
ok(`docs/upstream-three/ holds the ${Object.keys(DRAFTS).length} drafts this gate knows, and no other: ${files.join(", ")}`, files.join() === Object.keys(DRAFTS).sort().join());
const index = fs.existsSync(path.join(DIR, "README.md")) ? fs.readFileSync(path.join(DIR, "README.md"), "utf8") : "";
ok("its README says they are drafts, not posted, and links each", /DRAFTS, NOT POSTED/.test(index) && files.every((f) => index.includes(`(${f})`)));
const text = Object.fromEntries(files.map((f) => [f, fs.readFileSync(path.join(DIR, f), "utf8")]));
const scripts = {};
for (const f of files) {
    const html = between(text[f], "<!-- repro:begin -->\n```html\n", "```\n<!-- repro:end -->"), mod = html && between(html, '<script type="module">\n', "</script>");
    const importLine = 'import * as THREE from "three"; import * as T from "three/tsl";';
    ok(`  ${f}: a standalone reproduction importing three r185 from the CDN, and nothing else`, !!mod && mod.startsWith(importLine) && html.includes("three@0.185.0/build/three.webgpu.js") && !/import\s/.test(mod.slice(importLine.length)));
    if (mod) scripts[f] = mod.slice(importLine.length).replace('document.getElementById("out").textContent = JSON.stringify(r, null, 1);', "");
}

console.log("\n2. ON THE DEVICE: each reproduction against the vendored r185, both backends");
const skip = webgpuSkipReason();
if (skip) { console.log(`  SKIP  ${skip}`); console.log("  ----  *** NOT A PASS. *** The drafts' numbers are the device's."); fails++; }
else for (const f of Object.keys(scripts)) {
    const r = await runInEngineOrigin({ engineRoot: ENG, timeoutMs: 300000, args: {}, script: `async () => {
        const THREE = await import("/vendor/three-webgpu/three.webgpu.js"); const T = await import("/vendor/three-webgpu/three.tsl.js");
        ${scripts[f]}
        return window.__result;
    }` });
    const res = r.ok ? r.result : null, d = DRAFTS[f];
    ok(`  ${f}: the reproduction ran on both backends`, !!(res && res.webgpu && res.webgl2), r.ok ? "" : (r.reason || (r.pageErrors || []).join("; ")));
    if (!res || !res.webgpu || !res.webgl2) continue;
    ok(`*** ${f}: the bug stands in r185: ${JSON.stringify(res).replace(/"/g, "")} ***`, d.bug(res), "when three fixes it, this goes red: update the draft or drop it");
    const said = between(text[f], "<!-- observed:begin -->\n", "\n<!-- observed:end -->");
    ok(`  ${f}: the draft's Observed block is what its reproduction prints: "${said}"`, said === d.observed(res), `printed: "${d.observed(res)}"`);
}

// ---- v4763 SABOTAGE LOG ----------------------------------------------------------------------------------------
// Against the drafts themselves: U1 an Observed number edited by a thousandth -> 1; U2 a reproduction importing more than
// three -> 2; U3 the instanced reproduction made to move the mesh instead (no bug) -> 2; U4 the README not saying DRAFTS, NOT
// POSTED -> 1; U5 a seventh draft the gate does not know -> 1; U6 a reproduction naming another revision -> 1. Six, none green.
console.log(fails ? "\nFAIL -- " + fails + " check(s)" : "\nALL GREEN");
console.log("unchecked here: the reproductions against the CDN's own build, which a box with no network cannot load (they point at " +
    "the vendored r185 here, the same revision); a real GPU; and whether three's maintainers read the causes as the drafts do -- " +
    "the drafts mark each as a reading of the source.");
process.exitCode = fails ? 1 : 0;
