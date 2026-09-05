#!/usr/bin/env node
// WebGLEngine/tools/ship/deviceFeatures-selfcheck.mjs -- v4489
//
// OPTIONAL ADAPTER FEATURES NEGOTIATED AT requestDevice, REPORTED AS WHAT WAS GRANTED, AND PASS TIMESTAMPS THROUGH THE DEVICE
// (task 15). Until v4489 no file in the tree asked an adapter for anything: timestamp-query was never requested, so no page
// could time a pass on the GPU; render/tslSource.mjs dropped three's `enable subgroups;` because the device never had the
// feature; shader-f16 was named in three files and requested by none. Now gfx/device.js requestDevice asks for the optional
// features the adapter OFFERS (DEFAULT_FEATURES, or opts.features), refuses BY NAME a feature the caller requires and the
// adapter lacks (opts.requireFeatures) before WebGPU would throw at it, and reports the GRANTED set on device.features and
// device.capabilities.features -- the frozen CAPABILITIES table says only that a backend MAY be granted something. A frame
// with { timing: true } writes GPU timestamps around every compute pass and the render pass and returns gpuMs; WebGL2
// refuses it by name, the null backend records it.
//
// MEASURED AT v4489 on the build box (the harness's headless Chromium on SwiftShader): the adapter offers timestamp-query
// AND subgroups (not shader-f16) and grants both, plus "core-features-and-limits" unasked, which is reported as it is. A
// timed frame of one 64-invocation dispatch plus a clear-and-draw at 32 x 32 reads back compute 0.101 ms and render
// 6.558 ms -- real, positive numbers even on a software rasteriser, which is why both are held ABOVE ZERO: a pass whose
// timestamps were never written reads a difference of zeros, and a first draft did exactly that (the fields are
// beginningOfPassWriteIndex / endOfPassWriteIndex; spelled without Write, Chromium wrote nothing for the compute pass
// and refused the render pass). The rig (task 9's page) is where the numbers mean something. The transplant keeps
// `enable subgroups;` when a shell says its device has the feature, and drops it otherwise, as before.
//
// SABOTAGE (v4489): A  requestDevice asking for the whole DEFAULT list unfiltered (adapter.features.has() ignored)  -> exit=1, red: the browser rows (WebGPU throws a TypeError at requestDevice, no device)
//                   B  the granted list reported from the ASKED list rather than gpu.features                       -> exit=1, red: the entry-for-entry row (the asked list lacks the core-features-and-limits Chromium grants unasked)
//                      (B went 0 red FIRST: the honesty row only held granted within offered and offered defaults within granted, which the asked list
//                       also satisfies here; a lying report was invisible where the lie was one unasked entry. The entry-for-entry row was added for it.)
//                   C  the render pass's timestampWrites dropped                                                    -> exit=1, red: the timed-frame row (an unwritten pair reads 0.000 ms, and the row holds render above zero)
//                   D  the WebGL2 refusal removed (timing accepted silently)                                         -> exit=1, red: the WebGL2 refusal row
//
// Run: node tools/ship/deviceFeatures-selfcheck.mjs      (~20 s; section 1 is headless)
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runInEngineOrigin, webgpuSkipReason } from "./webgpuHarness.mjs";
import { nullBackend, CAPABILITIES, DEFAULT_FEATURES } from "../../gfx/device.js";
import { transplantCompute, computeShell } from "../../render/tslSource.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
let fails = 0;
const ok = (c, name, detail) => { console.log(`  ${c ? "PASS" : "FAIL"}${c ? "  " : "  !! "}${name}${detail ? "   " + detail : ""}`); if (!c) fails++; };
const report = (name, detail) => console.log(`  ----  ${name}   ${detail}`);
const sec = (t) => console.log("\n" + t);
const AT = "@";

// ---------------------------------------------------------------------------------------------------------
sec("1. HEADLESS: the default list, the frozen table, the null backend's record, and the transplant's subgroups");
// ---------------------------------------------------------------------------------------------------------
{
    ok(DEFAULT_FEATURES.join() === "timestamp-query,subgroups,shader-f16" && Object.isFrozen(DEFAULT_FEATURES), "DEFAULT_FEATURES is the three the task named, frozen", DEFAULT_FEATURES.join(", "));
    ok(["webgpu", "webgl2", "null"].every((b) => Array.isArray(CAPABILITIES[b].features) && CAPABILITIES[b].features.length === 0 && CAPABILITIES[b].timestamps === false),
        "the frozen CAPABILITIES table says every backend MAY be granted nothing (features [], timestamps false): the runtime device is what says what it was");
    const nb = nullBackend();
    ok(nb.features.length === 0 && nb.capabilities.timestamps === false && nb.capabilities.compute === true, "the null device carries features [] and capabilities with timestamps false beside the table's other facts");
    const r = await nb.frame(({ pass }) => { pass.clear([0, 0, 0, 1]); }, { timing: true });
    ok(r && r.gpuMs === null && r.backend === "null" && nb.ops[0][0] === "timing", "a timed frame on the null backend records ['timing'] and returns gpuMs null (nothing to time, nothing invented)", JSON.stringify(nb.ops.map((o) => o[0])));
    const rr = await nb.frame(({ pass }) => { pass.clear([0, 0, 0, 1]); }, { timing: true, read: true });
    ok(rr && rr.gpuMs === null && rr.pixels === null, "  and a timed READ frame carries gpuMs null beside its (null) pixels");
    // the transplant: a three-shaped compute text with the subgroups directive and the builtin it never uses
    const three = `// Three.js r178 - Node System\n// directives\nenable subgroups;\n// uniforms\nstruct NodeBuffer_1Struct { value : array< f32 > };\n@binding( 0 ) @group( 0 )\nvar<storage, read_write> NodeBuffer_1 : NodeBuffer_1Struct;\n${AT}compute @workgroup_size( 64 )\nfn main( @builtin( global_invocation_id ) globalId : vec3<u32>,\n\t@builtin( subgroup_size ) subgroupSize : u32,\n\t@builtin( num_workgroups ) numWorkgroups : vec3<u32> ) {\n\tinstanceIndex = globalId.x;\n\tNodeBuffer_1.value[ instanceIndex ] = 1.0;\n}\n`;
    const drop = transplantCompute(three, computeShell({ name: "t", storage: [{ name: "out", element: "f32" }], workgroupSize: 64 }));
    const keep = transplantCompute(three, computeShell({ name: "t", storage: [{ name: "out", element: "f32" }], workgroupSize: 64, features: ["subgroups"] }));
    ok(!/enable\s+subgroups/.test(drop.wgsl) && !/subgroup_size/.test(drop.wgsl), "a shell without the feature: the directive and the subgroup_size builtin are dropped, as since v4331");
    ok(/^enable subgroups;/m.test(keep.wgsl) && /subgroup_size/.test(keep.wgsl), "*** a shell whose device was granted subgroups keeps `enable subgroups;` and the builtin ***");
    const none = transplantCompute(three.replace("enable subgroups;\n", ""), computeShell({ name: "t", storage: [{ name: "out", element: "f32" }], workgroupSize: 64, features: ["subgroups"] }));
    ok(!/enable\s+subgroups/.test(none.wgsl), "  and a shell with the feature adds no directive the graph never emitted");
}

// ---------------------------------------------------------------------------------------------------------
sec("2. IN THE BROWSER: what the adapter offers, what was granted, a timed frame, and the refusals by name");
// ---------------------------------------------------------------------------------------------------------
const skip = webgpuSkipReason();
if (skip) { console.log(`  SKIP  ${skip}`); fails++; }
else {
    const r = await runInEngineOrigin({ engineRoot: ENG, args: { N: 32 }, timeoutMs: 120000, script: `async (a) => {
        const { requestDevice, DEFAULT_FEATURES } = await import("/gfx/device.js");
        const out = { defaults: DEFAULT_FEATURES.slice() };
        try { const ad = await navigator.gpu.requestAdapter(); out.offered = [...ad.features].sort(); } catch (e) { out.offered = String(e.message); }
        const cv = document.createElement("canvas"); cv.width = a.N; cv.height = a.N;
        const dev = await requestDevice(cv, { backend: "webgpu", offscreen: true });
        out.granted = dev.features.slice(); out.caps = { timestamps: dev.capabilities.timestamps, features: dev.capabilities.features.slice(), compute: dev.capabilities.compute };
        // honest = every granted feature was offered, and every DEFAULT feature the adapter offered was granted; Chromium also grants
        // "core-features-and-limits" unasked (a compatibility-mode marker), which is reported as it is rather than filtered
        out.honest = dev.features.every((f) => (Array.isArray(out.offered) ? out.offered.includes(f) : true)) && DEFAULT_FEATURES.filter((f) => Array.isArray(out.offered) && out.offered.includes(f)).every((f) => dev.features.includes(f));
        out.unasked = dev.features.filter((f) => !DEFAULT_FEATURES.includes(f));
        out.raw = [...dev.gpu.features].sort(); out.reported = dev.features.slice().sort();   // the GPU's own list against the device's report
        const K = "struct O { value: array<f32> }; @group(0) @binding(0) var<storage, read_write> o: O; " + "@" + "compute @" + "workgroup_size(64) fn main(@builtin(global_invocation_id) g: vec3<u32>) { o.value[g.x] = f32(g.x); }";
        const pipe = dev.compute({ wgsl: K }); const buf = dev.buffer({ size: 64 * 4, usage: "storage" }); pipe.bind("o", buf);
        const RP = "struct V { @builtin(position) p: vec4f }; @" + "vertex fn vs(@builtin(vertex_index) i: u32) -> V { var q = array<vec2f, 3>(vec2f(-1, -1), vec2f(3, -1), vec2f(-1, 3)); var v: V; v.p = vec4f(q[i], 0, 1); return v; } @" + "fragment fn fs() -> @location(0) vec4f { return vec4f(0.2, 0.6, 0.9, 1); }";
        const rpipe = dev.pipeline({ shaders: { wgsl: RP }, vs: "vs", fs: "fs", attributes: [], stride: 0, uniforms: [] });
        if (dev.capabilities.timestamps) {
            try {
                const t = await dev.frame(({ pass }) => { pass.dispatch(pipe, 1); pass.clear([0, 0, 0, 1]); pass.use(rpipe); pass.draw(3); }, { timing: true, depth: false });
                out.timed = t;
                const tr = await dev.frame(({ pass }) => { pass.dispatch(pipe, 1); pass.clear([0, 0, 0, 1]); pass.use(rpipe); pass.draw(3); }, { timing: true, read: true, depth: false });
                out.timedRead = { gpuMs: tr.gpuMs, pixel: Array.from(tr.pixels.slice(0, 4)), width: tr.width };
                const heavy = await dev.frame(({ pass }) => { for (let i = 0; i < 200; i++) pass.dispatch(pipe, 1); pass.clear([0, 0, 0, 1]); }, { timing: true, depth: false });
                out.heavy = heavy.gpuMs;
            } catch (e) { out.timedError = String(e.message).slice(0, 300); }
        } else {
            try { await dev.frame(({ pass }) => { pass.clear([0, 0, 0, 1]); }, { timing: true }); out.noTsRefused = "no throw"; } catch (e) { out.noTsRefused = String(e.message).slice(0, 200); }
        }
        try { await requestDevice(document.createElement("canvas"), { backend: "webgpu", offscreen: true, requireFeatures: ["not-a-feature"] }); out.requireRefused = "no throw"; } catch (e) { out.requireRefused = String(e.message).slice(0, 200); }
        const cv2 = document.createElement("canvas"); cv2.width = a.N; cv2.height = a.N;
        const gl = await requestDevice(cv2, { backend: "webgl2" });
        out.gl = { features: gl.features.slice(), timestamps: gl.capabilities.timestamps };
        try { gl.frame(({ pass }) => { pass.clear([0, 0, 0, 1]); }, { timing: true }); out.glRefused = "no throw"; } catch (e) { out.glRefused = String(e.message).slice(0, 200); }
        return out;
    }` });
    ok(r.ok && r.result && !r.result.error, "the harness ran", r.ok ? (r.result.error || "") : r.reason);
    if (r.ok && r.result) {
        const R = r.result;
        report("the adapter offers", Array.isArray(R.offered) ? (R.offered.join(", ") || "no optional features") : R.offered);
        report("granted to the device", R.granted.join(", ") || "nothing");
        ok(R.raw.join() === R.reported.join(), "*** device.features IS the GPU's own features list, entry for entry -- not the list that was asked for ***", `${R.reported.join(", ")}`);
        ok(R.honest && R.caps.features.join() === R.granted.join() && R.caps.timestamps === R.granted.includes("timestamp-query") && R.caps.compute === true,
            "*** every granted feature was offered and every default feature the adapter offered was granted, and device.capabilities reports the set beside the table's other facts ***", `timestamps ${R.caps.timestamps}; granted unasked: ${R.unasked.join(", ") || "none"}`);
        if (R.granted.includes("timestamp-query")) {
            const t = R.timed;
            ok(!R.timedError && t && t.gpuMs && Number.isFinite(t.gpuMs.compute) && Number.isFinite(t.gpuMs.render) && t.gpuMs.compute > 0 && t.gpuMs.render > 0 && t.gpuMs.passes === 1 && t.gpuMs.renderPass === true && t.gpuMs.total === t.gpuMs.compute + t.gpuMs.render,
                "*** a timed frame -- one dispatch, one render pass -- round-trips finite GPU times ABOVE ZERO for both passes (an unwritten pair would read 0.000) ***",
                R.timedError || (t && t.gpuMs ? `compute ${t.gpuMs.compute.toFixed(3)} ms, render ${t.gpuMs.render.toFixed(3)} ms` : "no timing"));
            ok(R.timedRead && R.timedRead.gpuMs && Number.isFinite(R.timedRead.gpuMs.total) && R.timedRead.width === 32 && R.timedRead.pixel[2] > 200,
                "  a timed READ frame carries gpuMs beside its pixels, and the pixels are the draw's", R.timedRead ? `blue ${R.timedRead.pixel[2]}` : "");
            ok(R.heavy && R.heavy.passes === 31 && R.heavy.compute >= R.timed.gpuMs.compute * 0 && Number.isFinite(R.heavy.compute),
                "  200 dispatches are counted as 31 timed passes (the query set's cap; the rest run untimed) and sum to a finite compute time", R.heavy ? `${R.heavy.compute.toFixed(3)} ms over ${R.heavy.passes} passes` : "");
        } else {
            ok(/timestamp-query/.test(R.noTsRefused || ""), "REPORTED: no timestamp-query here, and a timed frame is refused by name", R.noTsRefused);
        }
        ok(/offers no "not-a-feature"/.test(R.requireRefused || ""), "REFUSED by name: requireFeatures naming a feature the adapter lacks, before requestDevice would throw", R.requireRefused);
        ok(R.gl && R.gl.features.length === 0 && R.gl.timestamps === false && /timestamp queries/.test(R.glRefused || ""), "WebGL2: features [], timestamps false, and a timed frame refused by name with the CPU-time hint", R.glRefused);
    }
}

console.log(fails ? `\nFAIL -- ${fails} check(s)` : "\nall checks pass");
console.log("unchecked here: a real GPU's timestamps (this box's are SwiftShader's -- task 9's slug-rig.html is where the numbers mean something); a kernel that USES subgroup operations on the granted feature (the kept directive is held on text; no kernel in the tree calls subgroupAdd yet); shader-f16, which no adapter here offers; and the headless Dawn harness, which builds no gfx/device.js device (it needs a canvas context).");
process.exit(fails ? 1 : 0);
