// WebGLEngine/tools/ship/wgslAutoLayout-selfcheck.mjs -- v3980
//
// Run: node tools/ship/wgslAutoLayout-selfcheck.mjs
// RUNTIME 210ms MEASURED (median of 3 -- 207/210/218 -- with date(1) around the run). It walks the tree once
// and only parses files containing "@binding(", a few dozen of them. GUESSED 1.4s BEFORE MEASURING, which is
// nearly 7x out; the number above is the measurement, not the estimate it replaced.
//
// THE BUG THIS EXISTS FOR, WHICH SHIPPED AND RAN IN A BROWSER FOR SOME TIME BEFORE ANYONE SAW IT:
// fluid-webgpu.html threw, every frame, "In entries[0], binding index 0 not present in the bind group layout.
// Expected layout: [{ binding: 1, ... } ... { binding: 8, ... }]", cascading into invalid bind groups and
// invalid command buffers until the page was a wall of red. `layout: "auto"` derives a pipeline layout from the
// entry point's RESOURCE INTERFACE -- the resources it STATICALLY ACCESSES through its call graph -- not from
// what the source declares. The shared COMMON prefix declares binding 0 and reads it inside ui()/vi()/ci(), so
// every stage that calls one of those helpers keeps the slot; `normalize` calls none of them, walking u and v
// with arrayLength() instead, so binding 0 fell out of its layout alone while the JS still filled entries from
// index 0.
//
// *** THAT IS INVISIBLE TO READING. *** The declaration sits at the top of the stage's own source, three lines
// above helpers that plainly use it. Nothing local is wrong. What is wrong is a relationship between one
// stage's main() and a helper it does not call, and no reviewer holds that in their head across ten stages
// built by string concatenation. So it is checked mechanically or it is not checked.
//
// SECTION 1 IS A FIXTURE WITH THE ANSWER KNOWN BEFORE THE TREE IS READ, and section 2 exists because the first
// working version of this scanner SILENTLY SKIPPED 4 OF 13 SHADERS in one file -- a shared /g/ regex whose
// lastIndex `.test()` had advanced. A scanner that drops its inputs reports "no problems" for the wrong
// reason, and the tree-wide zero in section 4 means nothing without a floor under what was actually examined.
"use strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { extractShaders, resourceInterfaces, droppedBindings, autoLayoutKinds, scanTree } from "./wgslAutoLayout.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
let fails = 0;
const ok = (l, c, n = "") => { if (!c) fails++; console.log(`  ${c ? "PASS" : "FAIL"}  ${l}${n ? "   " + n : ""}`); };
const report = (l, n = "") => console.log(`  ----  ${l}${n ? "   " + n : ""}`);

console.log("wgslAutoLayout-selfcheck -- does `layout: \"auto\"` still hold every binding the JS fills?\n");

// ---------------------------------------------------------------------------
console.log("1. *** FIXTURE: EACH CLAIM ITS OWN SHADER, ANSWER KNOWN BEFORE ANY REAL FILE IS READ ***");
{
    // The COMMON-prefix shape every WebGPU page in this tree uses.
    const COMMON = "const COMMON = `\n" +
        "  struct Params { nx:u32, ny:u32 };\n" +
        "  @group(0) @binding(0) var<uniform> P : Params;\n" +
        "  fn ci(i:u32,j:u32)->u32 { return i + j*P.nx; }\n`;\n";

    // (a) A stage that CALLS the helper reaches P transitively -- binding 0 survives. This is the control: if
    //     it were reported as dropped, every reading below would be a false alarm rather than a finding.
    const reaches = COMMON + "w.a = COMMON + `\n" +
        "  @group(0) @binding(1) var<storage,read_write> out:array<f32>;\n" +
        "  @compute @workgroup_size(64) fn main(@builtin(global_invocation_id) g:vec3<u32>) { out[ci(g.x,0u)] = 1.0; }`;\n";
    // (b) The SAME declarations, but main() never calls ci() and never names P -- binding 0 is unreachable.
    const drops = COMMON + "w.b = COMMON + `\n" +
        "  @group(0) @binding(1) var<storage,read_write> out:array<f32>;\n" +
        "  @compute @workgroup_size(64) fn main(@builtin(global_invocation_id) g:vec3<u32>) { if (g.x < arrayLength(&out)) { out[g.x] = 1.0; } }`;\n";
    // (c) A RENDER module where only vs() reads P. The layout is the UNION of both stages, so nothing is lost;
    //     scoring per entry point instead of per pipeline calls this a defect (it turned 4 real hits into 18).
    const renderUnion = COMMON + "r = COMMON + `\n" +
        "  @group(0) @binding(1) var<storage,read> pos:array<vec2<f32>>;\n" +
        "  struct VOut { @builtin(position) clip:vec4<f32> };\n" +
        "  @vertex fn vs(@builtin(vertex_index) v:u32) -> VOut { var o:VOut; o.clip = vec4<f32>(pos[v]/f32(P.nx),0.,1.); return o; }\n" +
        "  @fragment fn fs(i:VOut) -> @location(0) vec4<f32> { return vec4<f32>(1.); }`;\n";
    // (d) The multi-literal chain: bindings in one literal, helpers spliced from a const, main() in the next.
    //     Matching one literal at a time sees neither half as a shader and drops it entirely.
    const chained = COMMON + "const HELP = `\n  fn dbl(x:f32)->f32 { return x*2.0*f32(P.nx); }`;\n" +
        "w.d = COMMON + `\n  @group(0) @binding(1) var<storage,read_write> out:array<f32>;\n` + HELP + `\n" +
        "  @compute @workgroup_size(64) fn main(@builtin(global_invocation_id) g:vec3<u32>) { out[g.x] = dbl(1.0); }`;\n";

    const shOf = (src, want) => {
        const all = extractShaders(src);
        const s = all.find((x) => x.name === want);
        return { s, all };
    };

    const a = shOf(reaches, "w.a");
    ok("a stage that reaches binding 0 through a helper it CALLS keeps it (the control)",
       !!a.s && droppedBindings(a.s.code).length === 0,
       a.s ? "dropped=" + droppedBindings(a.s.code).length : "shader not extracted at all");

    const b = shOf(drops, "w.b");
    const bDrop = b.s ? droppedBindings(b.s.code) : [];
    ok("!! the SAME declarations with a main() that calls no helper LOSE binding 0",
       bDrop.length === 1 && bDrop[0].binding === 0 && bDrop[0].name === "P",
       "dropped=[" + bDrop.map((d) => d.binding + ":" + d.name).join(",") + "]");

    const c = shOf(renderUnion, "r");
    ok("a render module where only vs() reads P is NOT a defect -- the layout is the stage union",
       !!c.s && droppedBindings(c.s.code).length === 0,
       c.s ? "dropped=" + droppedBindings(c.s.code).length : "shader not extracted at all");

    const d = shOf(chained, "w.d");
    ok("a shader assembled as CONST + `bindings` + CONST + `main` is extracted whole",
       !!d.s && d.s.code.includes("@binding(1)") && d.s.code.includes("fn main"),
       d.s ? "len=" + d.s.code.length : "shader not extracted at all");
    ok("...and reaching P only through the spliced-in helper still counts as reached",
       !!d.s && droppedBindings(d.s.code).length === 0,
       d.s ? "dropped=" + droppedBindings(d.s.code).map((x) => x.name).join(",") : "n/a");

    // (e) compute and render are scored separately, so fixing one kind actually turns the gate green.
    const kinds = autoLayoutKinds(
        'device.createComputePipeline({ layout: device.createPipelineLayout({}), compute: {} });\n' +
        'device.createRenderPipeline({ layout: "auto", vertex: {} });\n');
    ok("auto-layout is reported per pipeline KIND, not once for the whole file",
       kinds.compute === false && kinds.render === true, JSON.stringify(kinds));
}

// ---------------------------------------------------------------------------
console.log("\n2. *** COVERAGE FLOOR: THE SCANNER MUST SEE EVERY SHADER, OR ITS ZERO MEANS NOTHING ***");
{
    // Counted BY HAND from the source, once, and pinned here. The first version of this scanner reported 10 for
    // the 3D page and looked perfectly healthy doing it; three shaders (stamp, bodyForce, solid) were assembled
    // as CONST + `..` + CONST + `..` and fell through a single-literal matcher, and w.p2g came and went as a
    // shared regex's lastIndex drifted. Without this floor that silent loss is indistinguishable from success.
    const FLOOR = [
        { file: "fluid-webgpu.html", shaders: 11 },
        { file: "fluid-webgpu-3d.html", shaders: 14 },
    ];
    for (const f of FLOOR) {
        const p = path.join(ENG, f.file);
        const found = fs.existsSync(p) ? extractShaders(fs.readFileSync(p, "utf8")) : [];
        ok(`${f.file} yields all ${f.shaders} shaders`, found.length === f.shaders,
           "found " + found.length + (found.length ? " (" + found.map((s) => s.name).join(", ") + ")" : ""));
        for (const s of found) {
            const ri = resourceInterfaces(s.code);
            if (!ri.length || !ri[0].declared.length) ok(`  ${f.file}:${s.name} parsed to something usable`, false, "no bindings/entry points parsed");
        }
    }
}

// ---------------------------------------------------------------------------
console.log("\n3. *** THE SCANNER MUST NOT CARRY STATE BETWEEN CALLS ***");
{
    // The exact defect found while writing wgslAutoLayout.mjs: module-level /g/ regexes whose lastIndex `.test()`
    // advances, so the SECOND call searched from wherever the first stopped. It is invisible in a one-shot run
    // and it silently shrinks every later answer, so it is driven here rather than trusted to a comment.
    const p = path.join(ENG, "fluid-webgpu-3d.html");
    if (!fs.existsSync(p)) { ok("fluid-webgpu-3d.html present to re-scan", false); }
    else {
        const src = fs.readFileSync(p, "utf8");
        const runs = [extractShaders(src).length, extractShaders(src).length, extractShaders(src).length];
        ok("three consecutive extractShaders() calls agree", runs[0] === runs[1] && runs[1] === runs[2], "runs=[" + runs + "]");
        const sh = extractShaders(src)[0];
        const i = [resourceInterfaces(sh.code).length, resourceInterfaces(sh.code).length];
        ok("repeated resourceInterfaces() on one shader agree", i[0] === i[1] && i[0] > 0, "entryCounts=[" + i + "]");
    }
}

// ---------------------------------------------------------------------------
console.log("\n4. *** THE TREE: NO PIPELINE MAY LOSE A BINDING TO ITS OWN AUTO LAYOUT ***");
{
    const hits = scanTree(ENG);
    ok("no shader drops a declared binding under `layout: \"auto\"`", hits.length === 0,
       hits.length ? hits.map((h) => `${h.file}:${h.shader} (${h.kind}) drops ` + h.dropped.map((d) => d.binding + ":" + d.name).join("/")).join(" | ") : "0 hits");
    report("files carrying WGSL bindings were parsed; hits are reported per pipeline, not per entry point");
}

// ---------------------------------------------------------------------------
console.log("\n5. *** THE OTHER HALF: EVERY BIND GROUP MUST FILL EVERY DECLARED BINDING ***");
{
    // The auto-layout hole was only fatal because the JS counted entries from 0 through n-1. Now that both FLIP
    // pages build EXPLICIT compute layouts from their declarations, an under-filled bind group is a hard error
    // rather than something an auto layout might have quietly tolerated -- so the counts are checked here too,
    // for the same reason a lock needs both a bolt and a frame.
    for (const file of ["fluid-webgpu.html", "fluid-webgpu-3d.html"]) {
        const p = path.join(ENG, file);
        if (!fs.existsSync(p)) { ok(`${file} present`, false); continue; }
        const src = fs.readFileSync(p, "utf8");
        ok(`${file} builds its COMPUTE layouts explicitly, not from usage`, autoLayoutKinds(src).compute === false);

        const declared = new Map();
        for (const s of extractShaders(src)) {
            const ri = resourceInterfaces(s.code);
            if (ri.length) declared.set(s.name, ri[0].declared.length);
        }
        const pipeToShader = new Map();
        for (const m of src.matchAll(/(\w+)\s*=\s*comp\(([\w.]+)\)/g)) pipeToShader.set(m[1], m[2]);
        const bad = [];
        let checked = 0;
        const seen = new Set();
        for (const m of src.matchAll(/bg\((\w+),\s*\[([^\]]*)\]\)/g)) {
            const sh = pipeToShader.get(m[1]);
            if (!sh) continue;                       // a render pipeline, still on an auto layout by design
            const supplied = m[2].split(",").length, want = declared.get(sh);
            const key = m[1] + ":" + supplied;
            if (seen.has(key)) continue;
            seen.add(key);
            checked++;
            if (supplied !== want) bad.push(`${m[1]}(${sh}) supplies ${supplied}, declares ${want}`);
        }
        ok(`${file}: every compute bind group fills its shader's declared bindings`, bad.length === 0 && checked > 0,
           bad.length ? bad.join("; ") : checked + " bind groups checked");
    }
}

// ---------------------------------------------------------------------------
console.log("\n6. *** SABOTAGE: PUT THE SHIPPED BUG BACK AND THE SCAN MUST FIND IT ***");
{
    // Section 4 reads zero. That reading is worth nothing unless a copy of the ACTUAL defect, restored into the
    // ACTUAL file, comes back non-zero -- otherwise "0 hits" is equally consistent with the scanner being blind.
    const p = path.join(ENG, "fluid-webgpu.html");
    if (!fs.existsSync(p)) { ok("fluid-webgpu.html present to sabotage", false); }
    else {
        const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "wgslauto-"));
        const src = fs.readFileSync(p, "utf8");
        // Revert exactly the v3980 fix: compute pipelines back to an auto layout.
        const sabotaged = src.replace(
            /layout: device\.createPipelineLayout\(\{ bindGroupLayouts: \[computeLayout\(code\)\] \}\)/,
            'layout: "auto"');
        ok("the sabotage actually bit (the fix's own text was found and reverted)", sabotaged !== src);
        const f = path.join(tmp, "fluid-webgpu.html");
        fs.writeFileSync(f, sabotaged);
        const hits = scanTree(tmp);
        ok("!! with compute back on `layout: \"auto\"`, normalize's binding 0 is reported again",
           hits.length === 1 && hits[0].shader === "wgsl.normalize" && hits[0].dropped.some((d) => d.binding === 0),
           hits.length ? hits.map((h) => h.shader + " drops " + h.dropped.map((d) => d.binding).join("/")).join(" | ") : "0 hits -- THE SCANNER IS BLIND");

        // ...and the second half of the bug: a bind group that stops filling a declared binding.
        const thinned = src.replace("bg(pNorm, [bufParams, bufUNum,", "bg(pNorm, [bufUNum,");
        ok("the entry-count sabotage bit", thinned !== src);
        const declared = new Map(extractShaders(thinned).map((s) => [s.name, resourceInterfaces(s.code)[0].declared.length]));
        const n = /bg\(pNorm,\s*\[([^\]]*)\]\)/.exec(thinned)[1].split(",").length;
        ok("!! a bind group one entry short of its declarations is caught", n !== declared.get("wgsl.normalize"),
           "supplies " + n + ", declares " + declared.get("wgsl.normalize"));
        fs.rmSync(tmp, { recursive: true, force: true });
    }
}

console.log("\n" + (fails ? `${fails} FAILED` : "ALL PASS"));
process.exit(fails ? 1 : 0);
