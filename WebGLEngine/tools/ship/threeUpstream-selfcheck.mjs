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
// block to what it prints. All six are applied together too, each hunk still found once. v4787: and run together -- section 4
// runs every reproduction on the one build with all of them, which must print what the draft's own patch alone prints, or what
// the draft's "together" block says another patch changes. v4773: the applier is
// tools/ship/threePatch.mjs, shared with tools/ship/threeUpstreamPaths-selfcheck.mjs, which runs the patches on the paths these
// reproductions do not take.
// *** NOTHING HERE POSTS ANYTHING. *** Filing them is the maintainer's call.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { runInEngineOrigin, webgpuSkipReason } from "./webgpuHarness.mjs";
import crypto from "node:crypto";
import { ENG, BUNDLE, apply, normalImports, rootWithBuilds } from "./threePatch.mjs";

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
    // v4775: a render is not a frame. 07 -- the pose follows the bones once a browser frame (and by hand, where it is); 08 -- past
    // the uniform buffer, the third render of a frame draws the second's matrices (and marked dynamic, where it is); 09 -- a batch
    // grown by setInstanceCount is drawn from its old matrices texture (and its material updated, it moves)
    "07-skinned-pose-once-a-frame.md": { patch: "07-skinned-pose-every-render.diff",
        bug: (r) => all(r) && r.webgpu.sameFrame && r.webgpu.plain.every((n) => n > 50) && r.webgpu.skinned[0] === 0 && r.webgpu.skinned[1] > 50 && r.webgpu.skinnedUpdated.every((n) => n > 50),
        fixed: (r) => all(r) && r.webgpu.sameFrame && r.webgpu.skinned.every((n) => n > 50),
        observed: (r) => `plain [${r.webgpu.plain.join(", ")}], skinned [${r.webgpu.skinned.join(", ")}], skinnedUpdated [${r.webgpu.skinnedUpdated.join(", ")}] -- pixels left and right of the centre; the renders in one browser frame: ${r.webgpu.sameFrame} (both backends)` },
    "08-instanced-large-third-render.md": { patch: "08-instanced-sync-before-upload.diff",
        bug: (r) => all(r) && r.webgpu.sameFrame && r.webgpu.one.every((n) => n > 50) && r.webgpu.many[0] === 0 && r.webgpu.many[1] > 50 && r.webgpu.many[2] > 50 && r.webgpu.manyDynamic.every((n) => n > 50),
        fixed: (r) => all(r) && r.webgpu.sameFrame && r.webgpu.many.every((n) => n > 50),
        observed: (r) => `one [${r.webgpu.one.join(", ")}], many [${r.webgpu.many.join(", ")}], manyDynamic [${r.webgpu.manyDynamic.join(", ")}] -- pixels in the left, middle and right thirds; the renders in one browser frame: ${r.webgpu.sameFrame} (both backends)` },
    "09-batched-grown-old-texture.md": { patch: "09-batched-texture-in-dynamic-key.diff",
        bug: (r) => { const g = r.webgpu.grown, u = r.webgpu.grownMaterialUpdated; return all(r) && g[2] === g[1] && g[3] === g[1] && g[4] === g[1] && u.every((x, i) => i === 0 || x > u[i - 1]); },
        fixed: (r) => all(r) && r.webgpu.grown.every((x, i, g) => i === 0 || x > g[i - 1]),
        observed: (r) => `grown [${r.webgpu.grown.join(", ")}], grownMaterialUpdated [${r.webgpu.grownMaterialUpdated.join(", ")}] -- the centre x of each frame's pixels, the batch grown before the third (both backends)` },
    "06-webgl2-second-compute.md": { patch: "06-webgl2-compute-stage-per-buffers.diff",
        bug: (r) => r.webgpu.moved.join() === "true,true" && r.webgl2.moved.join() === "true,false",
        fixed: (r) => r.webgpu.moved.join() === "true,true" && r.webgl2.moved.join() === "true,true",
        observed: (r) => `webgpu moved [${r.webgpu.moved.join(", ")}]; webgl2 moved [${r.webgl2.moved.join(", ")}]` },
    // v4790: the two found by threeUpstreamPaths' computeSkinning case at v4786
    "10-compute-skinning-under-velocity-mrt.md": { patch: "10-compute-needs-no-previous-data.diff",
        bug: (r) => r.webgpu.noMRT === 0.5 && r.webgpu.velocityMRT === 0 && r.webgl2.noMRT === 0.5 && r.webgl2.velocityMRT === 0.5,
        fixed: (r) => [r.webgpu, r.webgl2].every((b) => b.noMRT === 0.5 && b.velocityMRT === 0.5),
        observed: (r) => `webgpu: noMRT ${r.webgpu.noMRT}, velocityMRT ${r.webgpu.velocityMRT}; webgl2: noMRT ${r.webgl2.noMRT}, velocityMRT ${r.webgl2.velocityMRT} -- the mean x the compute wrote, the bone at 0.5` },
    "11-webgl2-compute-instance-index.md": { patch: "11-webgl2-compute-invocation-index.diff",
        bug: (r) => r.webgpu.storageBuffer === 8 && r.webgpu.instancedArray === 8 && r.webgl2.storageBuffer === 1 && r.webgl2.instancedArray === 8,
        fixed: (r) => [r.webgpu, r.webgl2].every((b) => b.storageBuffer === 8 && b.instancedArray === 8),
        observed: (r) => `webgpu: storageBuffer ${r.webgpu.storageBuffer}, instancedArray ${r.webgpu.instancedArray}; webgl2: storageBuffer ${r.webgl2.storageBuffer}, instancedArray ${r.webgl2.instancedArray} -- the distinct points the compute wrote, of a box's 8 corners` },
    // v4792: the WebGL2 compute that never linked, found at v4790 while probing draft 11
    "12-webgl2-storage-without-count.md": { patch: "12-storage-hash-own-slot.diff",
        bug: (r) => r.webgpu.withCount === "1 2 3 4 5 6" && r.webgpu.withoutCount === "1 2 3 4 5 6" && r.webgl2.withCount === "1 2 3 4 5 6" && r.webgl2.withoutCount === "0 0 0 0 0 0",
        fixed: (r) => [r.webgpu, r.webgl2].every((b) => b.withCount === "1 2 3 4 5 6" && b.withoutCount === "1 2 3 4 5 6"),
        observed: (r) => `webgpu: withCount ${r.webgpu.withCount}, withoutCount ${r.webgpu.withoutCount}; webgl2: withCount ${r.webgl2.withCount}, withoutCount ${r.webgl2.withoutCount} -- the x of each element the compute copied` },
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
    ok(`  ${f}: a standalone reproduction importing three 0.185.1 (r185, the release vendored and measured here) from the CDN, and nothing else`,
        !!mod && mod.startsWith(importLine) && html.includes("three@0.185.1/build/three.webgpu.js") && html.includes("three@0.185.1/build/three.tsl.js") && !/@0\.185\.0\//.test(html) && !/import\s/.test(mod.slice(importLine.length)));
    if (mod) scripts[f] = mod.slice(importLine.length).replace('document.getElementById("out").textContent = JSON.stringify(r, null, 1);', "");
}

// the patches, applied to the vendored build as its text holds the source (tools/ship/threePatch.mjs, v4773)
const bundle = fs.readFileSync(BUNDLE, "utf8");
const diffs = Object.fromEntries(Object.entries(DRAFTS).map(([f, d]) => [f, fs.existsSync(path.join(PATCHES, d.patch)) ? fs.readFileSync(path.join(PATCHES, d.patch), "utf8") : ""]));
const applied = Object.fromEntries(Object.keys(DRAFTS).map((f) => [f, apply(diffs[f], bundle)]));
// v4787: every patch on one build, in order -- the build three's maintainers would have if they took them all
const allNine = Object.keys(DRAFTS).reduce((acc, f) => { const a = apply(diffs[f], acc.text); return { text: a.text, found: acc.found.concat(a.found) }; }, { text: bundle, found: [] });

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
    const { root, dispose } = rootWithBuilds({ ...Object.fromEntries(Object.keys(scripts).map((f) => [SLOT(f), applied[f].text])), all: allNine.text });
    try {
        const runs = Object.keys(scripts).flatMap((f) => [[`r185 ${f}`, "/vendor/three-webgpu", scripts[f]], [`patched ${f}`, `/three-patched/${SLOT(f)}`, scripts[f]], [`all ${f}`, "/three-patched/all", scripts[f]]]);
        if (scripts[RELEASE_DRAFT]) runs.push(["stages r185", "/vendor/three-webgpu", RELEASE], ["stages patched", `/three-patched/${SLOT(RELEASE_DRAFT)}`, RELEASE], ["stages all", "/three-patched/all", RELEASE]);
        // two pages at once -- r185's runs and the patched builds' -- each a browser of its own
        const page = (list) => runInEngineOrigin({ engineRoot: root, timeoutMs: 600000, args: {}, script: `async () => {
            const out = {};
            ${list.map(([key, dir, code]) => `try {
                const THREE = await import("${dir}/three.webgpu.js"), T = await import("${dir}/three.tsl.js"); window.__result = undefined;
                await (async () => { ${code} })(); out[${JSON.stringify(key)}] = window.__result;
            } catch (e) { out[${JSON.stringify(key)}] = { error: String((e && e.message) || e) }; }`).join("\n            ")}
            return out;
        }` }).then((r) => (r.ok ? r.result : Object.fromEntries(list.map(([key]) => [key, { error: r.reason || (r.pageErrors || []).join("; ") }]))));
        const [was, now] = await Promise.all([page(runs.filter(([, dir]) => dir.startsWith("/vendor/"))), page(runs.filter(([, dir]) => !dir.startsWith("/vendor/")))]);
        results = { ...was, ...now };
    } finally { dispose(); }
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
// v4774: WHAT THREE'S OWN TOOLS SAID, RECORDED. In a checkout of three's r185 tag (0.185.1), `npm ci` and `npm run build`: the
// vendored build is three's rollup output byte for byte. With the patches applied by `git apply`, `npm run build` again, and
// the one line rollup orders by first use -- the names imported from three.core.js -- sorted: the same bytes as the patches
// applied here. The same checkout gave `npm run lint-core` clean, and three's unit tests (test/unit, 1311 of them) 1310 passed,
// 1 todo, 0 failed, as for r185 unpatched. v4775 recorded it again for all nine: 08 changes the same import line of Instance.js
// as 01, so it was merged by hand. v4786 recorded it again after 07 moved to the render, and v4788 after 03 reached per-instance
// morphs, v4790 with 10 and 11 added, and v4792 with 12: lint clean each time. A patch changed since makes the second hash stale: build three again, and record it.
const THREE_BUILT = Object.freeze({ r185: "50e4013dd3903e8afb09a4829962dbf105488de7bd47f61308f44bd2e66b3340", allPatched: "c73982c3dd995e04c1f450dd76303db57444d7504a28ff3f236b107aa3a54bfc" });
const sha = (t) => crypto.createHash("sha256").update(t).digest("hex");
{ const t = allNine.text, found = allNine.found;
  ok(`  all ${Object.keys(DRAFTS).length} applied together: each of the ${found.length} hunks still found exactly once`, found.length > 0 && found.every((n) => n === 1));
  ok(`  the vendored build is three's own rollup build of its r185 tag, byte for byte: sha256 ${sha(bundle).slice(0, 16)}...`, sha(bundle) === THREE_BUILT.r185,
      "recorded at v4774 from `npm run build` in a checkout of the tag");
  ok(`*** all ${Object.keys(DRAFTS).length} applied here are three's own rollup build of the patched source -- but for the order of the names it imports from three.core.js: sha256 ${sha(normalImports(t)).slice(0, 16)}... with those names sorted ***`,
      sha(normalImports(t)) === THREE_BUILT.allPatched, "recorded at v4792 from `git apply` of the twelve (08's import line merged by hand) and `npm run build`; a patch changed since makes it stale -- build three again and record it"); }
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

console.log(`\n4. ALL ${Object.keys(DRAFTS).length} TOGETHER: each reproduction on the one build with every patch, printing what it prints with its own patch alone`);
if (skip) { console.log(`  SKIP  ${skip}`); fails++; }
else {
    for (const f of Object.keys(scripts)) {
        const d = DRAFTS[f], alone = results[`patched ${f}`], all = results[`all ${f}`];
        ok(`  ${f}: the reproduction ran on both backends with all ${Object.keys(DRAFTS).length}`, ran(all), ran(all) ? "" : JSON.stringify(all));
        if (!ran(all) || !ran(alone)) continue;
        // a draft whose reproduction prints something else with every patch says so in a "together" block, and says which patch
        // does it; without one, all nine must print what its own patch alone prints
        const tog = block(f, "together");
        ok(`*** ${f}: with all of them the bug is still gone, and it prints ${tog === null ? "what its own patch alone prints" : "its \"together\" block"}: "${d.observed(all)}" ***`,
            d.fixed(all) && d.observed(all) === (tog ?? d.observed(alone)), `with its patch alone: "${d.observed(alone)}"`);
        if (tog !== null) ok(`  ${f}: its "together" block says something its "patched" block does not`, tog !== block(f, "patched"));
    }
    const one = results["stages patched"], all = results["stages all"];
    ok(`  ${DRAFTS[RELEASE_DRAFT].patch}'s released stages with all of them: ${JSON.stringify(all).replace(/"/g, "")}, as with it alone`, ran(all) && JSON.stringify(all) === JSON.stringify(one));
}

// v4789: THREE'S OWN e2e TESTS, RECORDED. They need three's examples/ and its screenshots, so they run in a checkout of three,
// not here: docs/upstream-three/e2e/puppeteer-local.diff is the runner as run (this box's presenting flags, and the swizzle
// workaround this harness installs), e2e/v4789.json what it said on r185's build and on all nine. Held here: that the record
// adds up, that it was taken on the two builds this gate's hashes name -- a patch changed since makes it stale, as it makes
// the second hash stale -- and that the README states it.
console.log("\n5. THREE'S e2e TESTS: the record of its WebGPU examples on r185's build and with all of them");
{   // the newest record is the one that speaks for the patches as they are; older ones stay as history
    const E2E_DIR = path.join(DIR, "e2e"), recs = fs.existsSync(E2E_DIR) ? fs.readdirSync(E2E_DIR).filter((f) => /^v\d+\.json$/.test(f)).sort((a, b) => parseInt(a.slice(1)) - parseInt(b.slice(1))) : [];
    const recName = recs[recs.length - 1], rec = recName ? JSON.parse(fs.readFileSync(path.join(E2E_DIR, recName), "utf8")) : null;
    ok("  docs/upstream-three/e2e/ holds the record and the runner it was taken with", !!rec && fs.existsSync(path.join(DIR, "e2e", "puppeteer-local.diff")));
    if (rec) {
        const failed = Object.keys(rec.failed || {}), varying = Object.keys(rec.varyingOnOneBuild || {});
        ok(`  it adds up: ${rec.examples} examples, ${rec.passed} passed and ${failed.length} failed, each the same on both builds; ${rec.screenshotsIdentical} screenshots the same bytes and ${varying.length} varying between runs of one build`,
            rec.examples > 0 && rec.passed + failed.length === rec.examples && rec.samePerExample === true && rec.screenshotsIdentical + varying.length === rec.examples);
        ok(`*** it was taken on the builds this gate's hashes name: r185 ${rec.builds.r185.slice(0, 16)}..., all of them ${rec.builds.allPatched.slice(0, 16)}... ***`,
            rec.builds.r185 === THREE_BUILT.r185 && rec.builds.allPatched === THREE_BUILT.allPatched, "a patch changed since the record makes it stale: run three's e2e again, and record it");
        ok("  the README states it as the record does", index.includes(`${rec.examples} WebGPU examples, ${rec.passed} passed and the same ${failed.length} failed`) &&
            index.includes(`${rec.screenshotsIdentical} of the ${rec.examples} screenshots`) && index.includes(`](e2e/${recName})`), `the record is e2e/${recName}`);
        // v4791: WHOSE ARE THE SEVEN "2D view of a 3D texture" FAILURES. Not three's: three uploads a 3D texture a slice at a
        // time with queue.writeTexture, a valid call, and no view is asked for in JS -- the view is the browser's own. This
        // Chromium (141) fails ANY writeTexture into a 3D texture that has RENDER_ATTACHMENT usage, three or no three, and the
        // same write without that usage succeeds. Re-measured here in raw WebGPU, so a browser that fixes it turns this red, and
        // the e2e has to be run again to see whether those seven pass.
        const VIEW3D = /TextureViewDimension::e2D\) of the texture view is not compatible with the dimension \(TextureDimension::e3D/;
        const seven = failed.filter((n) => VIEW3D.test(rec.failed[n]) || /^THREE\.WebGPURenderer: Uncaptured WebGPU GPUValidationError: The dimension \(TextureViewDimension::e2D\) of the t/.test(rec.failed[n]));
        let raw = null;
        if (!skip) { const r = await runInEngineOrigin({ engineRoot: ENG, timeoutMs: 120000, args: {}, script: `async () => {
            const device = await (await navigator.gpu.requestAdapter()).requestDevice(), U = GPUTextureUsage, out = { chrome: (navigator.userAgent.match(/Chrome\\/([\\d.]+)/) || [])[1] };
            for (const [k, usage] of [["withRender", U.COPY_DST | U.TEXTURE_BINDING | U.RENDER_ATTACHMENT], ["without", U.COPY_DST | U.TEXTURE_BINDING]]) {
                device.pushErrorScope("validation");
                const tex = device.createTexture({ size: [64, 64, 4], dimension: "3d", format: "r8unorm", usage });
                device.queue.writeTexture({ texture: tex, origin: [0, 0, 1] }, new Uint8Array(64 * 64), { bytesPerRow: 64 }, [64, 64, 1]);
                const e = await device.popErrorScope(); tex.destroy(); out[k] = e ? e.message.split("\\n")[0].slice(0, 300) : "ok"; }
            return out; }` }); raw = r.ok ? r.result : { err: r.reason }; }
        ok(`*** the record's ${seven.length} "2D view of a 3D texture" failures are this browser's, not three's: raw WebGPU, no three, in Chrome ${raw && raw.chrome}: a writeTexture into a 3D texture with RENDER_ATTACHMENT usage -> "${raw && String(raw.withRender).slice(0, 60)}...", without that usage -> ${raw && raw.without} ***`,
            seven.length === 7 && !!raw && VIEW3D.test(String(raw.withRender)) && raw.without === "ok",
            seven.length === 7 && !!raw && VIEW3D.test(String(raw.withRender)) && raw.without === "ok" ? "when a browser fixes it this goes red: run three's e2e again and see whether those examples pass"
                : `counted ${seven.length}; raw ${JSON.stringify(raw)}`);
    }
}

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
// ---- v4774 SABOTAGE LOG ----------------------------------------------------------------------------------------
// V1 the recorded r185 hash off by one digit -> 1; V2 the recorded patched hash off by one digit -> 1; V3 the import line left
// in the applier's order (tools/ship/threePatch.mjs's normalImports doing nothing) -> 1; V4 patch 05 changed after the record, a
// comment reworded -> 1, the staleness row alone, as it should be; V5 a draft importing 0.185.0 again -> 1. None green.
// ---- v4775 SABOTAGE LOG ----------------------------------------------------------------------------------------
// W1 07's pose updated once a frame again -> 1; W2 08's sync once a frame again -> 3; W3 09's dynamic key given a constant ->
// 3; W4 the bundler's hash -> hash$1 rename forgotten -> 5 (09's hunk not found, so its build is r185's); W5 a number of 08's
// Observed block edited -> 2 (the block and the index line). None green. W1 first ran on no text at all: its line is in the
// patch twice, once for skinning() and once for computeSkinning(), as 07's hunks were until given six lines of context.
// ---- v4787 SABOTAGE LOG ----------------------------------------------------------------------------------------
// A1 the all-nine build made without 07 -> 3 (the recorded hash, 04's together block, 07's own); A2 the all-nine runs importing
// each draft's own patched build -> 1 (04's together block: the one draft another patch changes); A3 04's together block deleted
// -> 1; A4 04's together block saying what its patched block says -> 2. In tools/ship/threeUpstreamPaths-selfcheck.mjs: A5 the
// all-nine build r185's own -> 8 (every case a patch changes; storageGPU and perInstance, which no patch reaches, the same either way); A6 the
// all-nine build made without 03 -> 2. None green.
// ---- v4789 SABOTAGE LOG ----------------------------------------------------------------------------------------
// Against the e2e record: E1 a patch changed (05, a comment reworded) -> 1, the build hash; E7 the same with the hash recorded
// again but three's e2e not run again -> 1, the record's staleness row -- the two steps a changed patch has to clear; E2 the
// record's pass count off by one -> 2 (it no longer adds up, and the README no longer states it); E3 the README's identical-
// screenshot count edited -> 1; E4 the record's patched hash off by one digit -> 1; E5 the runner's diff deleted -> 1; E6 the
// record saying the builds differed on an example -> 1. None green.
// ---- v4790 SABOTAGE LOG ----------------------------------------------------------------------------------------
// X1 patch 10's compute test removed -> 4 (the hash, 10 fixed, its patched block, 10 with all of them); X7 the same test
// misspelt, isComputNode -> 4; X3 patch 11's instanceIndex back to gl_InstanceID -> 4; X5 patch 11 reading gl_VertexID alone
// -> 5, and 10 with all of them among them -- 10's reproduction writes an instancedArray, drawn instanced, where gl_VertexID is
// 0, which is why the patch takes the sum; X6 a number of 10's Observed block edited -> 2. In threeUpstreamPaths: X4 patch 11's
// invocationLocalIndex hunk reverted -> 2. None green.
// ---- v4791 SABOTAGE LOG ----------------------------------------------------------------------------------------
// Y1 the raw write's texture made without RENDER_ATTACHMENT, a browser that no longer fails it -> 1; Y2 the failure's pattern
// matching e3D for e2D -> 1. Both green until the browser's message was read whole: cut at 100 characters, it stopped short of
// the words the pattern needs, and the row was red on a browser that does fail. None green.
console.log(fails ? "\nFAIL -- " + fails + " check(s)" : "\nALL GREEN");
console.log("unchecked here: the reproductions against the CDN's own copy, which the page here cannot load (they point at the vendored " +
    "0.185.1, which the recorded hash says is three's own build of it); three's WebGL e2e examples, which load a build no patch changes; " +
    "its unit tests beyond the record above -- they touch none of the paths the patches change; a real GPU; and whether three's " +
    "maintainers would take the patches as they are.");
process.exitCode = fails ? 1 : 0;
