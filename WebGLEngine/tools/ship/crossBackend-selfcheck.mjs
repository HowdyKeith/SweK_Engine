#!/usr/bin/env node
// WebGLEngine/tools/ship/crossBackend-selfcheck.mjs -- v4294
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
"use strict";
import { runWgslCompute, webgpuSkipReason } from "./webgpuHarness.mjs";
import { runWgslComputeNative, headlessGpuSkipReason, exitCleanly } from "./headlessGpu.mjs";
import { corpus, EXCLUDED, census, compare } from "./wgslCorpus.mjs";
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
    ok(EXCLUDED.filter((e) => e.keeps).length === 2,
       "and the two that are real shaders name the gate that keeps the browser harness",
       EXCLUDED.filter((e) => e.keeps).map((e) => e.id).join(", "));
    // The census is a candidate finder. If it ever matches nothing, it has stopped working rather than passed.
    ok(c.some((f) => f.where === "corpus") && c.some((f) => f.where === "excluded"),
       "CONTROL: the scan resolves symbols into BOTH buckets, so neither is empty by construction");
}

// ---------------------------------------------------------------------------------------------------------
sec("2. EVERY SHADER IN THE CORPUS RUNS ON BOTH BACKENDS");
// ---------------------------------------------------------------------------------------------------------
const results = [];
{
    for (const e of corpus()) results.push(await compare(e, runWgslCompute, runWgslComputeNative));
    for (const r of results)
        ok(r.ok, `runs: ${r.id}`, r.ok ? (r.compileOnly ? "compileOnly" : `${r.n} floats`) : r.reason);
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
console.log(fails ? "\nFAIL -- " + fails + " check(s)" : "\nALL GREEN");
console.log("unchecked here: ANY GPU BUT THIS ONE. Both backends land on the same software rasteriser, so " +
    "this says the two HARNESSES agree, not that Dawn and a browser agree on real hardware where a driver " +
    "decides the numbers. Also unchecked: the two excluded shaders, which keep the browser harness for the " +
    "reasons wgslCorpus.EXCLUDED records -- a storage-texture path this backend does not have, and a probe " +
    "that is assembled inside its own gate on purpose.");
exitCleanly(fails ? 1 : 0);
