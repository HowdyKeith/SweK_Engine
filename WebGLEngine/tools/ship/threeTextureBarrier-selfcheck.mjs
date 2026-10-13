#!/usr/bin/env node
// WebGLEngine/tools/ship/threeTextureBarrier-selfcheck.mjs
//
// *** THREE'S textureBarrier UNIT TEST FAILED HERE, AND THE BARRIER WAS NEVER THE QUESTION. ***
// v4841 ran three's GPU-native TSL unit tests on SwiftShader and left one failure "not investigated": the test that writes four
// texels, calls textureBarrier() and has invocation 0 sum them read 0 where it expects 10. The barrier is not what fails. The
// test's StorageTexture is FloatType with the default RGBAFormat, so three makes it rgba32float, and core WebGPU allows
// `read_write` storage access only on r32float, r32sint and r32uint -- rgba32float needs the optional 'texture-formats-tier2'
// feature. SwiftShader's adapter does not offer it, so the bind group layout fails validation, the kernel never runs and the
// output buffer keeps its zero. With `storageTex.format = RedFormat` (r32float) the same test passes on the same device.
//
// WHAT THIS HOLDS, ON THE ADAPTER IT RUNS ON, RATHER THAN ON THIS BOX'S:
//   1. docs/upstream-three/dev/unit/GPUBarriers.tests.js.txt is three's file at DEV_COMMIT, byte for byte (unchanged at 286e2d8;
//      .txt so the tree's code censuses do not count three's test as the engine's),
//      and texture-barrier-r32float.diff applies to it and changes only the format.
//   2. In headless Chromium, three's OWN test file runs against the vendored three (r186) through a QUnit shim: the
//      storageBarrier test passes (the harness can pass a test), raw WebGPU sums r32float read_write to 10, rgba32float
//      read_write is refused exactly when the adapter lacks 'texture-formats-tier2', the unpatched textureBarrier test fails
//      exactly then and for that reason, and the patched one passes on any adapter, its storage texture r32float.
//   3. The record says so: e2e.json's failure entry, the dev README and the draft name the cause and the diff.
// The expectations are written in the adapter's terms, so a GPU that has tier2 (the rig, three's lavapipe CI) passes the
// unpatched test and this gate stays green there: the fix is for adapters without it, not a claim that every adapter fails.
//
// NOT CLAIMED: that the test shows the barrier orders anything. On SwiftShader the patched test passes with the
// textureBarrier() line deleted too -- four invocations of one workgroup run in lockstep here -- so section 2 prints that
// reading and asserts nothing about it. The test proves the barrier compiles, validates and runs in a correct kernel.
// *** NOTHING HERE POSTS ANYTHING. *** Filing the draft is the maintainer's call.
//
// SABOTAGED, each restored by copy, each red by name: (A) the diff's added line made `storageTex.format = storageTex.format`
// -> the code-change row and the patched row (sum 0, rgba32float); (B) the adapter's tier2 read inverted -> the raw rgba32float
// row and the unpatched row; (C) e2e.json's old "not investigated" reason put back -> the record row; (D) one byte of the test
// copy changed -> the hash row, the apply row, the patched row and the deletion row; (E) the shim's rawComputeTest recording
// nothing -> the CONTROL row and the four that follow it; (F) the deletion matching no line -> the deletion row; (G) the
// README's link to the draft broken -> the README row; (H) the draft's quoted refusal removed -> the draft row.
"use strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import { runInEngineOrigin, webgpuSkipReason } from "./webgpuHarness.mjs";
import { ENG, DEV_COMMIT } from "./threePatch.mjs";

const UNIT = path.join(ENG, "docs", "upstream-three", "dev", "unit");
const TEST = path.join(UNIT, "GPUBarriers.tests.js.txt"), DIFF = path.join(UNIT, "texture-barrier-r32float.diff");
const DRAFT = path.join(UNIT, "texture-barrier.md");
const REL = "test/unit/src/nodes/tsl/GPUBarriers.tests.js";
// three's test/unit/src/nodes/tsl/GPUBarriers.tests.js at DEV_COMMIT (added by #34918, unchanged through 286e2d8 on 13 October)
export const TEST_SHA256 = "f787593764b324666792af9f408a51c3f1bf21eec0d59225e976fdcacc279d8a";
export const TIER2 = "texture-formats-tier2";
// what Dawn says when a bind group layout asks for read_write on a format that needs tier2 -- the reason the kernel never runs
export const REFUSAL = /RGBA32Float does not support storage texture access StorageTextureAccess::ReadWrite/;

let fails = 0;
const ok = (label, cond, detail) => { if (!cond) fails++; console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}${detail ? "   " + detail : ""}`); };
const note = (m) => console.log("  ----  " + m);

/** The diff applied to the copy, by git, in a scratch tree -- the same `git apply` the draft's commands use. */
export function patched(testText, diffText) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "swek-tb-"));
    try {
        fs.mkdirSync(path.join(dir, path.dirname(REL)), { recursive: true });
        fs.writeFileSync(path.join(dir, REL), testText);
        fs.writeFileSync(path.join(dir, "fix.diff"), diffText);
        execFileSync("git", ["apply", "fix.diff"], { cwd: dir, stdio: ["ignore", "pipe", "pipe"] });
        return fs.readFileSync(path.join(dir, REL), "utf8");
    } catch (e) { return null; }
    finally { fs.rmSync(dir, { recursive: true, force: true }); }
}

/** Lines the diff adds and removes, comments set aside: what the change does rather than what it says. */
export function codeChange(diffText) {
    const code = (l) => !/^[+-]\s*\/\//.test(l) && !/^(\+\+\+|---) /.test(l);
    const lines = diffText.split("\n");
    return { added: lines.filter((l) => l.startsWith("+") && code(l)).map((l) => l.slice(1).trim()),
             removed: lines.filter((l) => l.startsWith("-") && code(l)).map((l) => l.slice(1).trim()) };
}

// The page side. Three's test file is loaded as text, its three imports pointed at the vendored build and its utils at a shim
// whose rawComputeTest records the test instead of handing it to QUnit; each test then runs with a renderer and an assert
// that records what it was given. Storage textures created during a run are noted by format, and uncaptured device errors kept.
const PAGE = async ({ upstream, patchedText, noBarrierText }) => {
    const out = { tests: {}, raw: {} };
    const adapter = await navigator.gpu.requestAdapter();
    out.features = [...adapter.features].sort();
    // raw WebGPU, no three: the same four-texel kernel on a format core allows read_write on, and on the one three picks
    const raw = async (device, format) => {
        const tex = device.createTexture({ size: [4, 1], format, usage: GPUTextureUsage.STORAGE_BINDING });
        const buf = device.createBuffer({ size: 16, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC });
        const rb = device.createBuffer({ size: 16, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST });
        device.pushErrorScope("validation");
        const module = device.createShaderModule({ code: `
@group(0) @binding(0) var t : texture_storage_2d<${format}, read_write>;
@group(0) @binding(1) var<storage, read_write> o : array<f32, 4>;
@compute @workgroup_size(4) fn main(@builtin(local_invocation_index) i : u32) {
  textureStore(t, vec2u(i, 0u), vec4f(f32(i) + 1.0, 0.0, 0.0, 1.0));
  textureBarrier();
  if (i == 0u) { var s = 0.0; for (var k = 0u; k < 4u; k++) { s += textureLoad(t, vec2u(k, 0u)).r; } o[0] = s; }
}` });
        const pipe = device.createComputePipeline({ layout: "auto", compute: { module, entryPoint: "main" } });
        const bg = device.createBindGroup({ layout: pipe.getBindGroupLayout(0), entries: [{ binding: 0, resource: tex.createView() }, { binding: 1, resource: { buffer: buf } }] });
        const enc = device.createCommandEncoder(), p = enc.beginComputePass();
        p.setPipeline(pipe); p.setBindGroup(0, bg); p.dispatchWorkgroups(1); p.end();
        enc.copyBufferToBuffer(buf, 0, rb, 0, 16); device.queue.submit([enc.finish()]);
        const err = await device.popErrorScope();
        await rb.mapAsync(GPUMapMode.READ); const sum = new Float32Array(rb.getMappedRange())[0]; rb.unmap();
        return { sum, error: err ? err.message.slice(0, 300) : null };
    };
    const want = adapter.features.has("texture-formats-tier2") ? ["texture-formats-tier2"] : [];
    const device = await adapter.requestDevice({ requiredFeatures: want });
    out.raw.r32float = await raw(device, "r32float");
    out.raw.rgba32float = await raw(device, "rgba32float");
    device.destroy();

    const THREE = await import("/vendor/three-webgpu/three.webgpu.js");
    const renderer = new THREE.WebGPURenderer();
    await renderer.init();
    const dev = renderer.backend.device;
    let errors = [], formats = [];
    dev.addEventListener("uncapturederror", (e) => errors.push(String(e.error.message).slice(0, 300)));
    const create = dev.createTexture.bind(dev);
    dev.createTexture = (d) => { if (d && (d.usage & GPUTextureUsage.STORAGE_BINDING)) formats.push(d.format); return create(d); };
    const shim = `export const __tests = [];
export function rawComputeTest(name, options, run) { __tests.push({ name, options, run }); }
export async function readUintBuffer(renderer, buffer) { return new Uint32Array(await renderer.getArrayBufferAsync(buffer.value)); }
export async function readIntBuffer(renderer, buffer) { return new Int32Array(await renderer.getArrayBufferAsync(buffer.value)); }`;
    const blob = (s) => URL.createObjectURL(new Blob([s], { type: "text/javascript" }));
    window.QUnit = { module: (name, fn) => { if (typeof fn === "function") fn(); } };
    const load = async (label, text) => {
        const shimUrl = blob(shim);
        const src = text.replace(/from 'three\/tsl'/g, "from '" + location.origin + "/vendor/three-webgpu/three.tsl.js'")
                        .replace(/from 'three\/webgpu'/g, "from '" + location.origin + "/vendor/three-webgpu/three.webgpu.js'")
                        .replace(/from '\.\/gpu-raw-test-utils\.js'/g, "from '" + shimUrl + "'");
        await import(blob(src));
        const { __tests } = await import(shimUrl);
        for (const t of __tests) {
            errors = []; formats = [];
            const asserts = [];
            const assert = { strictEqual: (actual, expected, message) => asserts.push({ actual, expected, message, pass: actual === expected }),
                             ok: (v, message) => asserts.push({ actual: v, expected: true, message, pass: !!v }) };
            let threw = null;
            try { await t.run({ assert, renderer }); } catch (e) { threw = String(e).slice(0, 300); }
            await new Promise((r) => setTimeout(r, 150));   // let a late uncaptured error arrive
            const key = (/^textureBarrier/.test(t.name) ? "textureBarrier" : /^storageBarrier/.test(t.name) ? "storageBarrier" : t.name);
            out.tests[label + ":" + key] = { name: t.name, asserts: asserts.length, failed: asserts.filter((a) => !a.pass).length + (threw ? 1 : 0),
                first: asserts.find((a) => /textureBarrier/.test(t.name)) || null, threw, errors: errors.slice(0, 3), formats: [...new Set(formats)] };
        }
    };
    await load("upstream", upstream);
    await load("patched", patchedText);
    await load("noBarrier", noBarrierText);
    return out;
};

console.log("\n1. THE FILES: three's test as it stands upstream, and the diff that fixes it");
const testText = fs.existsSync(TEST) ? fs.readFileSync(TEST, "utf8") : "";
const diffText = fs.existsSync(DIFF) ? fs.readFileSync(DIFF, "utf8") : "";
const sha = crypto.createHash("sha256").update(testText).digest("hex");
ok(`GPUBarriers.tests.js.txt is three's file at ${DEV_COMMIT.slice(0, 7)}, byte for byte`, sha === TEST_SHA256, `sha256 ${sha.slice(0, 16)}`);
const fixed = testText && diffText ? patched(testText, diffText) : null;
ok("texture-barrier-r32float.diff applies to it with `git apply`, as the draft's commands do", !!fixed);
const ch = codeChange(diffText);
ok("...and the code it changes is the format and nothing else: RedFormat imported, and set on the storage texture",
   ch.removed.length === 1 && /^import \{ StorageTexture, FloatType \} from 'three\/webgpu';$/.test(ch.removed[0]) &&
   ch.added.length === 2 && ch.added.includes("import { StorageTexture, FloatType, RedFormat } from 'three/webgpu';") &&
   ch.added.includes("storageTex.format = RedFormat;"),
   `removed ${JSON.stringify(ch.removed)}, added ${JSON.stringify(ch.added)}`);

console.log("\n2. ON THIS ADAPTER: three's own test file, through the vendored three (r186), and the same kernel in raw WebGPU");
const skip = webgpuSkipReason();
if (skip) {
    note(`SKIPPED -- ${skip}; sections 1 and 3 still hold the files and the record`);
} else {
    const noBarrierText = (fixed || "").replace(/^\t*textureBarrier\(\);\n/m, "");
    const r = await runInEngineOrigin({ engineRoot: ENG, script: `async (a) => (${PAGE.toString()})(a)`,
        args: { upstream: testText, patchedText: fixed || testText, noBarrierText } });
    const res = r.ok ? r.result : null;
    ok("the page ran", !!res && !res.error, r.ok ? (res && res.error ? res.error : "") : (r.reason || "") + " " + (r.pageErrors || []).join(" | "));
    if (res && !res.error) {
        const tier2 = res.features.includes(TIER2);
        note(`adapter ${r.adapter ? [r.adapter.vendor, r.adapter.architecture].filter(Boolean).join(" ") : "unknown"}: '${TIER2}' ${tier2 ? "OFFERED" : "NOT offered"}`);
        const T = (k) => res.tests[k] || {};
        ok("CONTROL: the shim runs three's storageBarrier test from the same file, and it passes", T("upstream:storageBarrier").asserts === 32 && T("upstream:storageBarrier").failed === 0,
           `${T("upstream:storageBarrier").asserts} asserts, ${T("upstream:storageBarrier").failed} failed -- so a red textureBarrier below is the test's, not the harness's`);
        ok("raw WebGPU: r32float read_write sums the four texels to 10 after textureBarrier(), no validation error (core WebGPU, any adapter)",
           res.raw.r32float.sum === 10 && !res.raw.r32float.error, JSON.stringify(res.raw.r32float));
        ok(`raw WebGPU: rgba32float read_write is refused exactly when the adapter lacks '${TIER2}'`,
           tier2 ? (res.raw.rgba32float.sum === 10 && !res.raw.rgba32float.error) : (REFUSAL.test(res.raw.rgba32float.error || "") && res.raw.rgba32float.sum === 0),
           JSON.stringify(res.raw.rgba32float));
        const up = T("upstream:textureBarrier"), upSum = up.first ? up.first.actual : null;
        ok(`three's textureBarrier test as it stands: its texture is rgba32float, and it ${tier2 ? "passes, the adapter offering tier2" : "fails for that reason -- sum 0, the layout refused"}`,
           up.formats && up.formats.includes("rgba32float") && (tier2 ? up.failed === 0 && upSum === 10 : up.failed === 1 && upSum === 0 && up.errors.some((e) => REFUSAL.test(e))),
           `sum ${upSum}, formats ${JSON.stringify(up.formats)}, first error: ${(up.errors || [])[0] ? up.errors[0].split("\n")[0] : "none"}`);
        const pt = T("patched:textureBarrier"), ptSum = pt.first ? pt.first.actual : null;
        ok("with the diff: its texture is r32float and it passes, with no uncaptured error, on any adapter",
           pt.formats && pt.formats.length === 1 && pt.formats[0] === "r32float" && pt.failed === 0 && ptSum === 10 && pt.errors.length === 0,
           `sum ${ptSum}, formats ${JSON.stringify(pt.formats)}, errors ${pt.errors ? pt.errors.length : "?"}`);
        ok("...and the diff leaves the storageBarrier test passing", T("patched:storageBarrier").asserts === 32 && T("patched:storageBarrier").failed === 0);
        const nb = T("noBarrier:textureBarrier");
        const fl = (fixed || "").split("\n"), nl = noBarrierText.split("\n"), cut = fl.findIndex((l, i) => l !== nl[i]);
        ok("the reading below ran the patched test with its one textureBarrier() call deleted, and nothing else changed",
           nl.length === fl.length - 1 && cut >= 0 && /^\t*textureBarrier\(\);$/.test(fl[cut]) && fl.slice(cut + 1).join("\n") === nl.slice(cut).join("\n") && !!nb.first,
           cut >= 0 ? `line ${cut + 1} removed: ${fl[cut].trim()}` : "nothing removed");
        note(`a reading, not a claim: with the textureBarrier() line deleted the patched test sums ${nb.first ? nb.first.actual : "?"} here -- ` +
             (nb.failed === 0 ? "it passes without the barrier on this adapter, so it shows the barrier runs in a correct kernel, not that it orders anything"
                              : "it fails without the barrier on this adapter, so here it does show the ordering"));
    }
}

console.log("\n3. THE RECORD: e2e.json, the dev README and the draft name the cause and the diff");
const e2e = JSON.parse(fs.readFileSync(path.join(ENG, "docs", "upstream-three", "dev", "e2e.json"), "utf8"));
const entry = ((e2e.unit || {}).failedOnBoth || []).find((f) => /textureBarrier/.test(f.test)) || null;
ok("e2e.json's textureBarrier failure names the cause and the diff, and no longer says it was not investigated",
   !!entry && entry.why.includes(TIER2) && entry.why.includes("unit/texture-barrier-r32float.diff") && !/not investigated/.test(entry.why),
   entry ? entry.why.slice(0, 160) : "no entry");
const readme = fs.readFileSync(path.join(ENG, "docs", "upstream-three", "dev", "README.md"), "utf8");
ok("the dev README links the draft and the diff", readme.includes("(unit/texture-barrier.md)") && readme.includes("(unit/texture-barrier-r32float.diff)"));
const draft = fs.existsSync(DRAFT) ? fs.readFileSync(DRAFT, "utf8") : "";
ok("the draft says it is not posted, links the diff, and quotes the refusal it fixes",
   /DRAFT, NOT POSTED/.test(draft) && draft.includes("(texture-barrier-r32float.diff)") && REFUSAL.test(draft) && draft.includes(TIER2));

console.log(fails ? `\nthreeTextureBarrier-selfcheck: ${fails} FAILURE(S)` : "\nthreeTextureBarrier-selfcheck: all checks pass");
process.exitCode = fails ? 1 : 0;
