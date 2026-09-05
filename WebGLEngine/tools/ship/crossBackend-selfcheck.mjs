#!/usr/bin/env node
// WebGLEngine/tools/ship/crossBackend-selfcheck.mjs -- v4294; widened at v4464 (text/ in the scan, storage inputs in the corpus)
// and at v4472 (physics/mpm, tools/roundhouse and brain/ in the scan, and .wgsl FILES as candidates beside exported symbols)
//
// GRADES the browser-free WebGPU backend against the browser one on EVERY WGSL shader the tree exports.
//
// *** v4292 PROVED AGREEMENT ON ONE SHADER AND I TREATED THAT AS PROVING THE BACKEND. *** It does not. An LCG
// is u32 arithmetic and a divide; it touches none of what actually separates two implementations of the same
// API. This runs the corpus: workgroup memory with a barrier, trigonometry and simplex noise, a camera basis
// over 2304 pixels, catastrophic cancellation at grazing incidence, a fragment entry point, and the LCG.
//
// The strongest single entry is the PLANTED camera. It computes tan() inside the shader, so it runs on
// SwiftShader's low-accuracy transcendental path -- 4.59e-5 off true, measured at v4290. Two different
// SwiftShader builds would diverge THERE before anywhere else. The browser refuses to report its adapter
// description (Chromium redacts it), so behaviour is the only evidence available that these are the same
// rasteriser, and this is the sharpest behavioural probe the tree owns.
//
// Section 4 is the control. Agreement across seven shaders is a zero, and a zero with nothing beside it is the
// shape of a comparison that cannot fail.
//
// v4472 -- THE WIDER CENSUS FOUND A SHADER THAT NEVER COMPILED. The first run over the new roots went red on
// brain/transport/shaders/scatter.wgsl, "both compiled (browser false, native false)": `let target`, and `target` is
// a reserved word in WGSL. render/wgslSpec.mjs had called the file clean since v4207 because it never knew the
// reserved list; it does now, with a control in its gate. SABOTAGE (v4472), one run, both applied together:
// "tools/roundhouse" dropped from the census's default roots AND a copy of scatter.wgsl planted at gfx/ -> exit=1,
// 2 red BY NAME ("the scan reaches tools/roundhouse/" and "unwalked: gfx/stray-sabotage.wgsl"); restored.
"use strict";
import { runWgslCompute, runWgslComputeToTexture, webgpuSkipReason } from "./webgpuHarness.mjs";
import { runWgslComputeNative, runWgslComputeToTextureNative, headlessGpuSkipReason,
         exitCleanly } from "./headlessGpu.mjs";
import { corpus, EXCLUDED, census, compare } from "./wgslCorpus.mjs";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
import * as PT from "../../physics/render/pathTracerWgsl.mjs";

let fails = 0;
const ok = (c, name, detail) => {
    console.log(`  ${c ? "PASS" : "FAIL"}${c ? "  " : "  !! "}${name}${detail ? "   " + detail : ""}`);
    if (!c) fails++;
};
const sec = (t) => console.log("\n" + t);

const bSkip = webgpuSkipReason(), nSkip = headlessGpuSkipReason();
if (bSkip || nSkip) {
    console.log("crossBackend-selfcheck: cannot compare -- browser: " + (bSkip || "ok") + " | native: " + (nSkip || "ok"));
    console.log("\nFAIL -- 1 check(s)");
    console.log("A COMPARISON NEEDS BOTH SIDES. With one backend missing there is nothing to say, and saying " +
                "nothing while exiting 0 is how a cross-check becomes decoration.");
    process.exit(1);
}

// ---------------------------------------------------------------------------------------------------------
sec("1. THE CORPUS ACCOUNTS FOR EVERY WGSL PRODUCER IN THE TREE");
// ---------------------------------------------------------------------------------------------------------
{
    const c = census(), un = c.filter((f) => !f.accounted);
    ok(c.length >= 12, "the scan finds the tree's WGSL producers", `${c.length} exported symbols`);
    ok(un.length === 0,
       "*** and every one is either IN the corpus or excluded WITH A REASON ***",
       un.length ? un.map((u) => `${u.symbol} (${u.file})`).join(", ") : `${corpus().length} in corpus, ${EXCLUDED.length} excluded`);
    ok(EXCLUDED.every((e) => typeof e.why === "string" && e.why.length > 30 && typeof e.kind === "string"),
       "each exclusion says what KIND of thing it is, not just that it is out",
       [...new Set(EXCLUDED.map((e) => e.kind))].join(" | "));
    ok(EXCLUDED.filter((e) => e.keeps).length === 1,
       "and the one real shader still out names the gate that keeps the browser harness",
       EXCLUDED.filter((e) => e.keeps).map((e) => e.id).join(", "));
    // The census is a candidate finder. If it ever matches nothing, it has stopped working rather than passed.
    ok(c.some((f) => f.where === "corpus") && c.some((f) => f.where === "excluded"),
       "CONTROL: the scan resolves symbols into BOTH buckets, so neither is empty by construction");
    // v4464 -- the Slug twin sat in text/ for seven rounds where the scan never looked. A root that is not walked
    // is a producer the census cannot name, so the roots are asserted by what they FIND, not by their list.
    ok(c.filter((f) => f.file.startsWith("text/")).length >= 4 && c.some((f) => f.file.startsWith("physics/render/")),
       "*** the scan reaches text/ and physics/render/, and resolves what it finds there ***",
       c.filter((f) => /^(text|physics\/render)\//.test(f.file)).map((f) => `${f.symbol}:${f.where}`).join(" "));
    // v4472 -- the same rule for the three roots the physics-lab survey found unwalked: physics/mpm (the MPM kernel),
    // tools/roundhouse (three benched kernels and their renderers) and brain/ (the transport passes). Asserted by
    // what each root FINDS, so a root dropped from the default list is a red line naming it, not a shorter list.
    for (const [root, least] of [["physics/mpm/", 1], ["tools/roundhouse/", 8], ["brain/", 9]])
        ok(c.filter((f) => f.file.startsWith(root)).length >= least,
           `the scan reaches ${root} and resolves what it finds there`,
           c.filter((f) => f.file.startsWith(root)).map((f) => `${f.symbol}:${f.where}`).join(" "));
    // *** A .wgsl FILE IS A PRODUCER TOO, AND FOR 180 ROUNDS THE CENSUS COULD NOT SEE ONE. *** The regex reads
    // JavaScript exports; the brain's eight transport passes and the two v2661 cloth solvers are bare files. The
    // census now lists them by path, and this walks the WHOLE tree for .wgsl files so one placed outside every root
    // is a red line here rather than a producer nobody counted.
    const files = c.filter((f) => f.kind === "file");
    const everyWgsl = [];
    const walkAll = (dir) => {
        let ents = []; try { ents = fs.readdirSync(path.join(ENG, dir), { withFileTypes: true }); } catch { return; }
        for (const e of ents) {
            if (e.name === "node_modules" || e.name === ".git") continue;
            const rel = dir ? `${dir}/${e.name}` : e.name;
            if (e.isDirectory()) walkAll(rel); else if (/\.wgsl$/.test(e.name)) everyWgsl.push(rel);
        }
    };
    walkAll("");
    ok(files.length >= 10 && files.every((f) => f.accounted),
       "*** the census lists every .wgsl FILE under its roots and each is in the corpus or excluded by name ***",
       files.map((f) => `${f.file.split("/").pop()}:${f.where}`).join(" "));
    const outside = everyWgsl.filter((f) => !files.some((c) => c.file === f));
    ok(outside.length === 0 && everyWgsl.length === files.length,
       "and NO .wgsl file in the tree sits outside the census roots",
       outside.length ? "unwalked: " + outside.join(", ") : `${everyWgsl.length} .wgsl files in the tree, ${files.length} in the census`);
    ok(files.some((f) => f.where === "corpus") && files.some((f) => f.where === "excluded"),
       "CONTROL: the file candidates resolve into BOTH buckets too",
       `${files.filter((f) => f.where === "corpus").length} compiled on both backends, ${files.filter((f) => f.where === "excluded").length} superseded`);
}

// ---------------------------------------------------------------------------------------------------------
sec("2. EVERY SHADER IN THE CORPUS RUNS ON BOTH BACKENDS");
// ---------------------------------------------------------------------------------------------------------
const results = [];
{
    for (const e of corpus())
        results.push(await compare(e, runWgslCompute, runWgslComputeNative,
                                   runWgslComputeToTexture, runWgslComputeToTextureNative));
    for (const r of results)
        ok(r.ok, `runs: ${r.id}`, r.ok ? (r.compileOnly ? "compileOnly"
              : r.texture ? `${r.n} texels x4, ${r.format}, bytesPerRow ${r.bytesPerRow}` : `${r.n} floats`) : r.reason);
    ok(results.length === corpus().length && results.every((r) => r.ok),
       "*** all of them, on both ***", `${results.length} shaders`);
}

// ---------------------------------------------------------------------------------------------------------
sec("3. AND EVERY ONE IS BYTE-IDENTICAL");
// ---------------------------------------------------------------------------------------------------------
{
    for (const r of results)
        ok(r.identical, `identical: ${r.id}`,
           r.compileOnly ? `both compiled (browser ${r.browserOk}, native ${r.nativeOk})`
                         : (r.identical ? `${r.same}/${r.n}` : `${r.same}/${r.n}, max diff ${r.maxAbs.toExponential(3)} at ${r.firstDiff}`));
    const floats = results.reduce((a, r) => a + (r.n || 0), 0);
    ok(results.every((r) => r.identical),
       "*** no divergence anywhere in the corpus ***", `${floats} floats across ${results.length} shaders`);
    // *** THE compileOnly VERDICT NEEDED ITS OWN CONTROL, AND A SABOTAGE FOUND THAT OUT. *** Hardcoding
    // `identical: true` for compileOnly entries passed every check above, because when both backends really
    // do compile a shader, the constant and the real test agree. They only part company when the underlying
    // fact is FALSE -- so the control feeds both harnesses source that neither can compile. "Both refused" is
    // not "both accepted", and a comparison that cannot tell those apart is comparing nothing.
    const bogus = await compare(
        { id: "control.invalidWgsl", compileOnly: true,
          opts: { code: "@compute @workgroup_size(1) fn main() { this is not wgsl }", compileOnly: true, outCount: 0 } },
        runWgslCompute, runWgslComputeNative);
    ok(bogus.browserOk === false && bogus.nativeOk === false,
       "CONTROL: both backends REJECT deliberately invalid WGSL", "neither is quietly accepting anything");
    ok(bogus.identical === false,
       "*** and 'both refused' does NOT score as identical ***",
       "the compileOnly branch reports agreement on ACCEPTANCE, not on having produced no values");

    const tex = results.filter((r) => r.texture);
    ok(tex.length >= 3 && tex.every((r) => r.identical),
       "*** and the TEXTURE entries agree too -- a binding class the corpus had none of until v4295 ***",
       `${tex.length} texture shaders, ${tex.reduce((a, r) => a + r.n, 0)} texels compared`);
    const padded = results.find((r) => /padded/.test(r.id));
    ok(padded && padded.identical && padded.bytesPerRow === padded.bytesPerRowNative,
       "*** including the PADDED size, where a row is 320 bytes and pads to 512 ***",
       padded ? `bytesPerRow ${padded.bytesPerRow} on both -- v4287 found this branch unreachable at N=64, where 512 is already aligned` : "absent");
    const clip = results.find((r) => /clipping/.test(r.id));
    ok(clip && clip.identical && clip.format === "rgba8unorm",
       "and the CLIPPING format, where the two must agree on what an out-of-range value becomes",
       clip ? `${clip.format}, ${clip.same}/${clip.n}` : "absent");

    // v4464 -- the first entries with read-only storage INPUTS (the `inputs` option both harnesses grew at v4457):
    // the Slug coverage probe reads a packed atlas and a sample list through five bindings. Until this line the
    // corpus had held the two harnesses to each other on a uniform array and one out buffer only.
    const slug = results.find((r) => /slugProbeWgsl/.test(r.id));
    ok(slug && slug.identical && slug.n > 1000,
       "*** and the entries with read-only storage INPUTS agree -- a binding class the corpus had none of until v4464 ***",
       slug ? `${slug.same}/${slug.n} coverage samples through five storage bindings` : "absent");
    const physics = results.filter((r) => /traceWgsl|pipelineWgsl/.test(r.id));
    ok(physics.length === 2 && physics.every((r) => r.identical && r.n === 576),
       "*** and the two physics producers the census named as unaccounted since v4418 now run on both ***",
       physics.map((r) => `${r.id} ${r.same}/${r.n}`).join(", "));
    const planted = results.find((r) => /shaderTan/.test(r.id));
    ok(planted && planted.identical,
       "*** including the PLANTED camera, which runs the low-accuracy tan() path ***",
       "two different SwiftShader builds would part company here first -- the browser will not report its build, so this is the evidence");
}

// ---------------------------------------------------------------------------------------------------------
sec("4. THE CONTROL: THE COMPARISON CAN FAIL, ON THE SAME PAIR OF HARNESSES");
// ---------------------------------------------------------------------------------------------------------
{
    // Browser runs the clean camera, native runs the planted one. Same harnesses, same uniforms, one shader
    // apart. If THIS came back identical the section above would be a fact about the comparison.
    const NPIX = PT.VIEW.w * PT.VIEW.h, OUT = NPIX * PT.COVERAGE_STRIDE, WG = Math.ceil(NPIX / 64);
    const U = PT.coverageUniforms();
    const b = await runWgslCompute({ code: PT.coverageWgsl(), outCount: OUT, uniforms: U, workgroups: WG });
    const a = await runWgslComputeNative({ code: PT.coverageWgsl({ shaderTan: true }), outCount: OUT, uniforms: U, workgroups: WG });
    ok(b.ok && a.ok, "both halves of the control ran");
    let diff = 0, maxAbs = 0;
    for (let i = 0; i < OUT; i++) if (b.values[i] !== a.values[i]) { diff++; maxAbs = Math.max(maxAbs, Math.abs(b.values[i] - a.values[i])); }
    ok(diff > OUT / 3,
       "*** feeding the two harnesses DIFFERENT shaders makes them disagree loudly ***",
       `${diff} of ${OUT} differ, max ${maxAbs.toExponential(3)} -- so section 3's zeros are measurements`);
}

// ---- SABOTAGE LOG ---------------------------------------------------------------------------------------
//
//   A  one corpus entry's uniforms perturbed on the NATIVE side only.
//      -> exit=1, 5 red. Three entries part company and the per-entry lines name WHICH and at what index --
//      PROBE_WGSL 40/64, coverageWgsl 5900/13824 first differing at 2 -- which a single aggregate would have
//      reduced to "something differs". The two summary lines go red on top of the three specifics.
//
//   B  the census regex narrowed from (?:function|const) + (?:Wgsl|WGSL) down to const + WGSL.
//      -> exit=1, 1 red: "5 exported symbols" where there are 12. A scan that quietly matches less looks
//      exactly like a tree that grew fewer shaders, so the count is asserted rather than merely printed.
//
//   C  compare() made to score compileOnly entries as identical unconditionally.
//      -> *** 0 RED THE FIRST TIME. ALL GREEN. *** When both backends really do compile a shader, a hardcoded
//      `true` and the real test agree -- they only differ when the underlying fact is FALSE, and the corpus
//      contains no shader that one backend rejects. The compileOnly verdict was machinery nothing exercised.
//      Answered with the control above: source neither backend can compile, where "both refused" must NOT
//      score as identical. Redone, the sabotage goes 1 red on exactly that line.
//
// A and B behaved as written. C did not, and it is the fifth time this session that the sharpest sabotage
// found a check that could not fail rather than code that was wrong.
//
//   E  (v4464) "text" removed from the census roots.
//      -> exit=1, 1 red: the roots line, since text/'s four producers are then found nowhere -- while the
//      "every one accounted" line stays GREEN, because a producer the scan never sees needs no entry. That is
//      the failure this widening is for: the Slug twin shipped at v4457 into a directory the scan did not walk
//      and nothing said so for seven rounds.
//
//   D  (v4295) the native texture reader reads rows at their UNPADDED stride.
//      -> exit=1, and ONLY the padded entry goes red: 4117/6400, max diff 1.748e+0. The two N=64 entries stay
//      green because a 64-wide rgba16float row is 512 bytes and already 256-aligned, which is exactly what
//      v4287 found made this branch unreachable at that size. The corpus carries N=40 for no other reason.
//
// ---- AND THE SPEED RATIONALE FOR THIS WHOLE BACKEND IS STRUCTURALLY VOID -------------------------------------
//
// Two rounds predicted a wall-clock win from moving gates onto the native harness. Both delivered a LOSS, and
// the arithmetic says they had to:
//
//     moving a gate saves      browser - native
//     validating it costs      browser + native      (a cross-check runs BOTH)
//
// The pair can never net positive while every moved shader is also corpus-validated -- and it must be, or the
// move is unjustified. Measured: v4294 moved three gates for -944 ms, v4295 moved the last one for -856 ms,
// and the session stands at -1800 ms against v4293.
//
// *** SO THE BACKEND IS JUSTIFIED BY EVIDENCE AND NEVER BY SPEED, *** and 80,824 floats across ten shaders is
// what it bought. Anybody proposing to move more work here for performance should read this paragraph first.
console.log(fails ? "\nFAIL -- " + fails + " check(s)" : "\nALL GREEN");
console.log("unchecked here: ANY GPU BUT THIS ONE. Both backends land on the same software rasteriser, so " +
    "this says the two HARNESSES agree, not that Dawn and a browser agree on real hardware where a driver " +
    "decides the numbers. Also unchecked: the two excluded shaders, which keep the browser harness for the " +
    "reasons wgslCorpus.EXCLUDED records -- a storage-texture path this backend does not have, and a probe " +
    "that is assembled inside its own gate on purpose. And the Slug RENDER module is compiled here only; " +
    "its picture is the device's claim (tools/ship/slugDevice-selfcheck.mjs), not this corpus's.");
exitCleanly(fails ? 1 : 0);
