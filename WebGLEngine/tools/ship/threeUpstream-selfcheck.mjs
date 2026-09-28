#!/usr/bin/env node
// WebGLEngine/tools/ship/threeUpstream-selfcheck.mjs -- v4763, v4771
//
// THE THREE.JS BUG REPORTS IN docs/upstream-three/ ARE DRAFTS, AND WHAT THEY SAY IS HELD HERE. Each draft carries a minimal
// standalone reproduction that imports three from a CDN; this gate lifts each one out of its draft, points its imports at the
// vendored r185, runs it in a headless browser on both backends, and holds (a) the numbers to the bug -- the reproduction
// still shows it -- and (b) the draft's "Observed" block to the numbers, character for character, so no draft states what
// its own reproduction does not print. When three is updated and a bug is fixed, its row goes red and says which draft is stale.
// v4771: EACH DRAFT CARRIES A PATCH, AND THE PATCH IS HELD TOO. docs/upstream-three/patches/ holds one diff per draft, against
// three's src/ at the r185 tag. Section 3 finds every hunk exactly once in the vendored build (the bundle is the source
// concatenated: no import lines, no `export`, and one identifier the bundler renamed), applies the draft's patch alone to a copy,
// runs the draft's reproduction on it, and holds (a) the fix -- the bug is gone on both backends -- and (b) the draft's "patched"
// block to what it prints. All six are applied together too, each hunk still found once.
// *** NOTHING HERE POSTS ANYTHING. *** Filing them is the maintainer's call.
"use strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runInEngineOrigin, webgpuSkipReason } from "./webgpuHarness.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const DIR = path.join(ENG, "docs", "upstream-three");
let fails = 0;
const ok = (label, cond, detail) => { if (!cond) fails++; console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}${detail ? "   " + detail : ""}`); };

// each draft: what its reproduction must print for the bug to stand, the Observed block that says so, its patch, and what the
// reproduction must print with the patch applied for the fix to stand
const px = (v) => v.toFixed(3), same = (r, k) => r.webgpu[k] === r.webgl2[k], all = (r) => Object.keys(r.webgpu).every((k) => JSON.stringify(r.webgpu[k]) === JSON.stringify(r.webgl2[k]));
const DRAFTS = {
    "01-velocity-instancedmesh.md": { patch: "01-instance-previous-matrix.diff",
        bug: (r) => all(r) && Math.abs(r.webgpu.plain - r.webgpu.instanced) > 1 && Math.abs(r.webgpu.plain - r.webgpu.many) > 1,
        fixed: (r) => all(r) && r.webgpu.instanced === r.webgpu.plain && r.webgpu.many === r.webgpu.plain,
        observed: (r) => `plain ${px(r.webgpu.plain)}, instanced ${px(r.webgpu.instanced)}, many ${px(r.webgpu.many)} (px, both backends)` },
    "02-velocity-batchedmesh.md": { patch: "02-batch-previous-matrices.diff",
        bug: (r) => all(r) && Math.abs(r.webgpu.plain - r.webgpu.batched) > 1,
        fixed: (r) => all(r) && r.webgpu.batched === r.webgpu.plain,
        observed: (r) => `plain ${px(r.webgpu.plain)}, batched ${px(r.webgpu.batched)} (px, both backends)` },
    "03-velocity-morph.md": { patch: "03-morph-previous-influences.diff",
        bug: (r) => all(r) && Math.abs(r.webgpu.plain - r.webgpu.morphed) > 1,
        fixed: (r) => all(r) && r.webgpu.morphed === r.webgpu.plain,
        observed: (r) => `plain ${px(r.webgpu.plain)}, morphed ${px(r.webgpu.morphed)} (px, both backends)` },
    // the same skinned mesh: drawn by the material (the bug), through MRT (right), and through MRT three times in one frame (a
    // skeleton steps once per frameId -- the draft names it and the patch leaves it, so it is printed, not graded)
    "04-velocity-outside-mrt.md": { patch: "04-velocity-outside-mrt.diff",
        bug: (r) => all(r) && Math.abs(r.webgpu.plain - r.webgpu.drawn) > 1 && r.webgpu.mrt === r.webgpu.plain,
        fixed: (r) => all(r) && r.webgpu.drawn === r.webgpu.plain && r.webgpu.mrt === r.webgpu.plain,
        observed: (r) => `plain ${px(r.webgpu.plain)}, drawn ${px(r.webgpu.drawn)}, mrt ${px(r.webgpu.mrt)}, mrtSameFrame ${px(r.webgpu.mrtSameFrame)} (px, both backends)` },
    "05-sprite-center-shared-program.md": { patch: "05-sprite-center-per-object.diff",
        bug: (r) => ["offCentre", "centredAfter", "centredUnlike"].every((k) => same(r, k)) && r.webgpu.centredAfter === r.webgpu.offCentre && Math.abs(r.webgpu.centredUnlike - r.webgpu.offCentre) > 3,
        fixed: (r) => ["offCentre", "centredAfter", "centredUnlike"].every((k) => same(r, k)) && r.webgpu.centredAfter === r.webgpu.centredUnlike && Math.abs(r.webgpu.centredUnlike - r.webgpu.offCentre) > 3,
        observed: (r) => `offCentre ${r.webgpu.offCentre}, centredAfter ${r.webgpu.centredAfter}, centredUnlike ${r.webgpu.centredUnlike} (both backends)` },
    "06-webgl2-second-compute.md": { patch: "06-webgl2-compute-stage-per-buffers.diff",
        bug: (r) => r.webgpu.moved.join() === "true,true" && r.webgl2.moved.join() === "true,false",
        fixed: (r) => r.webgpu.moved.join() === "true,true" && r.webgl2.moved.join() === "true,true",
        observed: (r) => `webgpu moved [${r.webgpu.moved.join(", ")}]; webgl2 moved [${r.webgl2.moved.join(", ")}]` },
};
const between = (s, a, b) => { const i = s.indexOf(a), j = s.indexOf(b, i + a.length); return i < 0 || j < 0 ? null : s.slice(i + a.length, j); };

console.log("\n1. THE DRAFTS: each carries a reproduction and an Observed block, and the index names every one");
const files = fs.existsSync(DIR) ? fs.readdirSync(DIR).filter((f) => /^\d\d-.*\.md$/.test(f)).sort() : [];
ok(`docs/upstream-three/ holds the ${Object.keys(DRAFTS).length} drafts this gate knows, and no other: ${files.join(", ")}`, files.join() === Object.keys(DRAFTS).sort().join());
const index = fs.existsSync(path.join(DIR, "README.md")) ? fs.readFileSync(path.join(DIR, "README.md"), "utf8") : "";
ok("its README says they are drafts, not posted, and links each", /DRAFTS, NOT POSTED/.test(index) && files.every((f) => index.includes(`(${f})`)));
const text = Object.fromEntries(files.map((f) => [f, fs.readFileSync(path.join(DIR, f), "utf8")]));
const PATCHES = path.join(DIR, "patches"), patchFiles = fs.existsSync(PATCHES) ? fs.readdirSync(PATCHES).sort() : [];
ok(`docs/upstream-three/patches/ holds one diff per draft, and nothing else: ${patchFiles.join(", ")}`, patchFiles.join() === Object.values(DRAFTS).map((d) => d.patch).sort().join());
// the index states each draft's numbers too: its line must carry the draft's own two blocks, word for word
const block = (f, tag) => between(text[f], `<!-- ${tag}:begin -->\n`, `\n<!-- ${tag}:end -->`);
for (const f of files) { const line = index.split("\n").find((l) => l.includes(`](${f})`)) || "";
    ok(`  README's line for ${f} states its Observed and patched blocks as the draft does`, !!block(f, "observed") && !!block(f, "patched") && line.endsWith(`-- observed: ${block(f, "observed")}; patched: ${block(f, "patched")}`)); }
for (const f of files) if (DRAFTS[f]) ok(`  ${f}: links its patch, and has a "patched" block for what the reproduction prints with it`,
    text[f].includes(`](patches/${DRAFTS[f].patch})`) && text[f].includes("<!-- patched:begin -->\n") && text[f].includes("\n<!-- patched:end -->"));
const scripts = {};
for (const f of files) {
    const html = between(text[f], "<!-- repro:begin -->\n```html\n", "```\n<!-- repro:end -->"), mod = html && between(html, '<script type="module">\n', "</script>");
    const importLine = 'import * as THREE from "three"; import * as T from "three/tsl";';
    ok(`  ${f}: a standalone reproduction importing three r185 from the CDN, and nothing else`, !!mod && mod.startsWith(importLine) && html.includes("three@0.185.0/build/three.webgpu.js") && !/import\s/.test(mod.slice(importLine.length)));
    if (mod) scripts[f] = mod.slice(importLine.length).replace('document.getElementById("out").textContent = JSON.stringify(r, null, 1);', "");
}

// the patches, applied to the vendored build as its text holds the source
const BUNDLE = path.join(ENG, "vendor", "three-webgpu", "three.webgpu.js"), bundle = fs.readFileSync(BUNDLE, "utf8");
// identifiers the bundler renamed where two modules declared the same name
const RENAMED = { "src/materials/nodes/SpriteNodeMaterial.js": [["reference( '", "reference$1( '"]] };
// a unified diff's hunks as the bundle holds them: context and removed lines are the old text, context and added the new
const hunksOf = (diff) => {
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
};
const apply = (diff, text) => { const found = []; for (const h of hunksOf(diff)) { const n = text.split(h.old).length - 1; found.push(n); if (n === 1) text = text.replace(h.old, () => h.new); } return { text, found }; };
const diffs = Object.fromEntries(Object.entries(DRAFTS).map(([f, d]) => [f, fs.existsSync(path.join(PATCHES, d.patch)) ? fs.readFileSync(path.join(PATCHES, d.patch), "utf8") : ""]));
const applied = Object.fromEntries(Object.keys(DRAFTS).map((f) => [f, apply(diffs[f], bundle)]));

// ONE PAGE FOR EVERY REPRODUCTION, BOTH BUILDS: a temporary engine root -- this tree by symlink, and beside it a directory per
// draft holding r185's build with that draft's patch (three.tsl.js and three.core.js import it by a relative path, so each
// directory is a three of its own). Each reproduction runs in its own scope; a throw is recorded against it, not the page.
const skip = webgpuSkipReason(), SLOT = (f) => f.slice(0, 2);
// 06's patch also drops a released stage from the cache by the key it was cached by -- a path its reproduction never takes. Two
// systems from the same source, each computed once, then both compute nodes disposed: the stages made, and the cache left after.
// On WebGPU their code differs and each has a stage either way; on WebGL2 r185 gives both the one stage -- the bug
const RELEASE_DRAFT = "06-webgl2-second-compute.md", RELEASE = `const out = {};
    for (const forceWebGL of [false, true]) {
        const canvas = document.createElement("canvas"); canvas.width = 8; canvas.height = 8;
        const renderer = new THREE.WebGPURenderer({ canvas, antialias: false, forceWebGL }); await renderer.init();
        const steps = [0, 1].map(() => { const pos = T.instancedArray(new Float32Array(12), "vec3"); return T.Fn(() => { pos.element(T.instanceIndex).addAssign(T.vec3(0.1, 0, 0)); })().compute(4); });
        for (const step of steps) await renderer.computeAsync(step);
        const made = renderer._pipelines.programs.compute.size; for (const step of steps) step.dispose();
        out[forceWebGL ? "webgl2" : "webgpu"] = { made, left: renderer._pipelines.programs.compute.size }; renderer.dispose();
    }
    window.__result = out;`;
let results = {};
if (!skip) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "three-patched-"));
    try {
        for (const e of fs.readdirSync(ENG)) fs.symlinkSync(path.join(ENG, e), path.join(root, e));
        for (const f of Object.keys(scripts)) {
            const dir = path.join(root, "three-patched", SLOT(f)); fs.mkdirSync(dir, { recursive: true });
            fs.writeFileSync(path.join(dir, "three.webgpu.js"), applied[f].text);
            for (const e of ["three.tsl.js", "three.core.js"]) fs.symlinkSync(path.join(ENG, "vendor", "three-webgpu", e), path.join(dir, e));
        }
        const runs = Object.keys(scripts).flatMap((f) => [[`r185 ${f}`, "/vendor/three-webgpu", scripts[f]], [`patched ${f}`, `/three-patched/${SLOT(f)}`, scripts[f]]]);
        if (scripts[RELEASE_DRAFT]) runs.push(["stages r185", "/vendor/three-webgpu", RELEASE], ["stages patched", `/three-patched/${SLOT(RELEASE_DRAFT)}`, RELEASE]);
        const r = await runInEngineOrigin({ engineRoot: root, timeoutMs: 600000, args: {}, script: `async () => {
            const out = {};
            ${runs.map(([key, dir, code]) => `try {
                const THREE = await import("${dir}/three.webgpu.js"), T = await import("${dir}/three.tsl.js"); window.__result = undefined;
                await (async () => { ${code} })(); out[${JSON.stringify(key)}] = window.__result;
            } catch (e) { out[${JSON.stringify(key)}] = { error: String((e && e.message) || e) }; }`).join("\n            ")}
            return out;
        }` });
        results = r.ok ? r.result : Object.fromEntries(runs.map(([key]) => [key, { error: r.reason || (r.pageErrors || []).join("; ") }]));
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
}
const ran = (res) => !!(res && res.webgpu && res.webgl2);

console.log("\n2. ON THE DEVICE: each reproduction against the vendored r185, both backends");
if (skip) { console.log(`  SKIP  ${skip}`); console.log("  ----  *** NOT A PASS. *** The drafts' numbers are the device's."); fails++; }
else for (const f of Object.keys(scripts)) {
    const res = results[`r185 ${f}`], d = DRAFTS[f];
    ok(`  ${f}: the reproduction ran on both backends`, ran(res), ran(res) ? "" : JSON.stringify(res));
    if (!ran(res)) continue;
    ok(`*** ${f}: the bug stands in r185: ${JSON.stringify(res).replace(/"/g, "")} ***`, d.bug(res), "when three fixes it, this goes red: update the draft or drop it");
    const said = block(f, "observed");
    ok(`  ${f}: the draft's Observed block is what its reproduction prints: "${said}"`, said === d.observed(res), `printed: "${d.observed(res)}"`);
}

console.log("\n3. THE PATCHES: each hunk found once in the vendored r185, and each reproduction run on r185 with its draft's patch");
for (const [f, d] of Object.entries(DRAFTS)) {
    const a = applied[f];
    ok(`  ${d.patch}: a git diff of three's src/, ${a.found.length} hunk(s) that change the build, each found exactly once in it: [${a.found.join(", ")}]`,
        /^diff --git a\/src\//.test(diffs[f]) && a.found.length > 0 && a.found.every((n) => n === 1) && a.text !== bundle);
}
{ let t = bundle, found = []; for (const f of Object.keys(DRAFTS)) { const a = apply(diffs[f], t); t = a.text; found = found.concat(a.found); }
  ok(`  all six applied together: each of the ${found.length} hunks still found exactly once`, found.length > 0 && found.every((n) => n === 1)); }
if (skip) { console.log(`  SKIP  ${skip}`); console.log("  ----  *** NOT A PASS. *** The patches' numbers are the device's."); fails++; }
else for (const f of Object.keys(scripts)) {
    const d = DRAFTS[f], res = results[`patched ${f}`];
    ok(`  ${f}: the reproduction ran on both backends with ${d.patch}`, ran(res), ran(res) ? "" : JSON.stringify(res));
    if (!ran(res)) continue;
    ok(`*** ${f}: with ${d.patch} the bug is gone: ${JSON.stringify(res).replace(/"/g, "")} ***`, d.fixed(res));
    const said = block(f, "patched");
    ok(`  ${f}: the draft's patched block is what its reproduction prints with the patch: "${said}"`, said === d.observed(res), `printed: "${d.observed(res)}"`);
}
if (!skip) { const was = results["stages r185"], r = results["stages patched"];
    ok(`  ${DRAFTS[RELEASE_DRAFT].patch}: two systems from one source -- WebGL2 shares one stage in r185 and has one each with the patch, WebGPU one each in both; disposing their compute nodes leaves none: r185 ${JSON.stringify(was).replace(/"/g, "")}, patched ${JSON.stringify(r).replace(/"/g, "")}`,
        ran(was) && ran(r) && was.webgl2.made === 1 && was.webgpu.made === 2 && r.webgl2.made === 2 && r.webgpu.made === 2 && r.webgpu.left === 0 && r.webgl2.left === 0); }

// ---- v4763 SABOTAGE LOG ----------------------------------------------------------------------------------------
// Against the drafts themselves: U1 an Observed number edited by a thousandth -> 1; U2 a reproduction importing more than
// three -> 2; U3 the instanced reproduction made to move the mesh instead (no bug) -> 2; U4 the README not saying DRAFTS, NOT
// POSTED -> 1; U5 a seventh draft the gate does not know -> 1; U6 a reproduction naming another revision -> 1. Six, none green.
// ---- v4771 SABOTAGE LOG ----------------------------------------------------------------------------------------
// Against the patches: P1 01's interleaved previous matrices not marked for upload -> 2 (many 11.224); P2 01's swap in
// OnObjectUpdate, after the draw's upload -> 2 (many 11.224); P3 02's previous matrices copied from this draw's -> 2 (batched 0);
// P4 03's previous influences this draw's -> 2 (morphed 0); P5 04's material never looked in -> 2 (drawn 1.871); P6 05's reference
// still bound to the sprite that built it -> 2; P7 06's every stage keyed by its code alone -> 2; P8 06's released stage dropped by
// its code, not its key -> 1, the stage row -- green until that row was written, since the reproduction never releases a stage;
// P9 a context line of 01 not in the build -> 4; P10 a diff of examples/, not src/ -> 1; P11 02's anchor edited -> 3. Against the
// gate: G1 the bundler's rename forgotten -> 4; G2 the patched directories given r185's build -> 13; G3 import lines kept in the
// hunks -> 5; G4 every run importing r185's build -> 13; G5 the README check weakened to "a line exists" -> 0, equivalent while the
// README is right: R1 is the case it is there for. Against the drafts: D1 a patched number edited by a thousandth -> 2; D2 a draft
// not linking its patch -> 1; R1 the README's patched number edited -> 1; a seventh patch -> 1; v4763's U1-U3 re-run on the new
// 04 -> 2, 14 (one reproduction's syntax error takes the shared page down, and section 1 names it), 2.
console.log(fails ? "\nFAIL -- " + fails + " check(s)" : "\nALL GREEN");
console.log("unchecked here: the reproductions against the CDN's own build, which a box with no network cannot load (they point at " +
    "the vendored r185 here, the same revision); a real GPU; the patches built by three's own rollup and run under its unit tests " +
    "and examples -- here they are applied to the built file, and each is tested only by its draft's reproduction; and whether " +
    "three's maintainers would take them as they are.");
process.exitCode = fails ? 1 : 0;
