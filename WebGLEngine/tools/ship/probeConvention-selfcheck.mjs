#!/usr/bin/env node
// WebGLEngine/tools/ship/probeConvention-selfcheck.mjs -- v4468
//
// THE PROBE CONVENTION, LAB-WIDE: EVERY PHYSICS KERNEL MODULE SHIPS A MANIFEST (PROBES) NAMING ITS TEXT, ITS PACKER,
// ITS CPU TWIN, ITS KEY AND ITS TOLERANCE, AND THIS GATE RUNS EVERY ENTRY ON THE HEADLESS DAWN DEVICE AGAINST THE TWIN.
//
// Until v4468 three modules of nine followed the packProbeUniforms / probeCpu / keyCpu convention the physicsShaders
// gate consumes; the other six each invented a packer and a twin of their own, and a new kernel had no template to
// copy and no gate that would notice it missing one. docs/GPU-KERNEL-CONTRACT.md writes the convention down, with
// render/lyapunovWgsl.mjs as the template; PROBES is the manifest each module exports; this gate is the census that
// cannot be appended to by hand: every physics corpus entry must have a manifest entry, every manifest entry must
// run, and every tolerance or `graded` gate must be real.
//
// The tolerances are each module's own, stated in the manifest before this gate ran: 0 where the corpus and the
// device already returned the twin's bytes (the furnace, the SBT pipeline, the three cloth passes), HMC_TOL for the
// leapfrog (the earned tolerance its adjudicator uses), the physicsShaders gate's own for Heidler and Planck, and the
// f32 neighbour gap for the LCG value. A kernel whose element-for-element comparison is not a claim (the logistic map
// at r near 4, a hit at the silhouette, a root at tangency) names the gate that grades it instead, is still RUN here,
// and must return finite numbers.
//
// MEASURED AT v4468 (this box, five runs): 522-831 ms; 13 kernels run, 9 held to a tolerance, all exact where the
// tolerance is zero, HMC at 3.10e-6 against 5e-5, Heidler 2.98e-7, Planck 1.76e-6 relative, the LCG 5.96e-8.
//
// SABOTAGE LOG (v4468) -- each applied to a module, gate run, exit read, file restored byte for byte:
//   A  xpbdWgsl's solve manifest entry deleted      -> exit=1, 1 red: the census names xpbdWgsl.solveWgsl as the corpus
//      entry with no manifest. A kernel cannot be in the corpus and out of the convention.
//   B  hmcGpu's tolerance set to 1e-7               -> exit=1, 1 red: worst 3.10e-6 against 1e-7. The tolerance is the
//      module's and the gate holds the module to it; a tolerance tightened past the measured floor goes red, a
//      tolerance widened to hide a drift would be visible in the manifest's diff.
//   C  pathTracerGpu's twin rendered at albedo 0.25 -> exit=1, 1 red: 413 of 576 exact, worst 0.25 -- the twin is
//      load-bearing, not a copy of the device's answer.
"use strict";

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runWgslComputeNative, headlessGpuSkipReason } from "./headlessGpu.mjs";
import { corpus } from "./wgslCorpus.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
let fails = 0;
const ok = (label, cond, detail) => { if (!cond) fails++; console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}${detail ? "   " + detail : ""}`); };
const report = (s) => console.log(`  ----  ${s}`);
const exists = (rel) => fs.existsSync(path.join(ENG, rel));

/** The physics kernel modules. A corpus entry from one of these must have a manifest entry; a new one joins here. */
export const PHYSICS_KERNEL_MODULES = Object.freeze([
    "render/lyapunovWgsl.mjs", "render/heidlerWgsl.mjs", "render/blackbodyWgsl.mjs",
    "physics/render/pathTracerWgsl.mjs", "physics/render/pathTracerGpu.mjs", "physics/render/rtPipeline.mjs",
    "physics/mpm/gpuKernel.mjs", "physics/xpbd/xpbdWgsl.mjs", "tools/roundhouse/hmcGpu.mjs",
    "physics/chaos/logisticWgsl.mjs",   // v4469 -- the step loop's first consumer
    "brain/mlp.js", "brain/flowfield.js",   // v4470 -- the GPU Brain's kernels, exported
    "render/worleyWgsl.mjs",   // v4480 -- the Worley biome field, the terrain's first kernel under the contract
]);
const val = (v, args) => (typeof v === "function" ? v(args) : v);

console.log("\n1. THE CONTRACT IS WRITTEN, THE TEMPLATE IS NAMED, AND EVERY MODULE SHIPS A MANIFEST");
const mods = [];
{
    const doc = fs.readFileSync(path.join(ENG, "../docs/GPU-KERNEL-CONTRACT.md"), "utf8");
    ok("docs/GPU-KERNEL-CONTRACT.md exists and names the template and the five exports", /render\/lyapunovWgsl\.mjs/.test(doc) && /packProbeUniforms/.test(doc) && /probeCpu/.test(doc) && /keyCpu/.test(doc) && /PROBES/.test(doc) && /tol \| rel \| graded/.test(doc));
    for (const rel of PHYSICS_KERNEL_MODULES) {
        const ns = await import(path.join(ENG, rel));
        mods.push({ rel, ns });
        const P = ns.PROBES;
        const shape = Array.isArray(P) && P.length > 0 && P.every((p) => typeof p.id === "string" && typeof p.code === "function" && typeof p.pack === "function" && typeof p.key === "function" &&
            (p.device === true || typeof p.cpu === "function") && (typeof p.tol === "number" || typeof p.rel === "number" || typeof p.graded === "string"));
        ok(`${rel} exports PROBES with id, code, pack, cpu, key and a tolerance or a grading gate`, shape, P ? P.map((p) => p.id).join(", ") : "no PROBES");
        if (shape) for (const p of P) {
            if (p.graded) { const gate = p.graded.split(" ")[0]; ok(`  ${p.id}: the grading gate it names exists`, exists(gate), gate); }
            const k = p.key(); ok(`  ${p.id}: key() returns finite numbers`, k && Object.values(k).flat().every((v) => typeof v !== "number" || Number.isFinite(v)), JSON.stringify(k).slice(0, 100));
        }
    }
    const entries = mods.flatMap((m) => m.ns.PROBES || []);
    const ids = entries.map((p) => p.id);
    ok("manifest ids are unique across the lab", new Set(ids).size === ids.length, `${ids.length} entries`);
    // *** THE CENSUS: every runnable physics corpus entry has a manifest entry, and no manifest id is a stranger. ***
    const physicsFrom = new Set(PHYSICS_KERNEL_MODULES);
    const pc = corpus().filter((e) => physicsFrom.has(e.from) && !e.texture && !e.compileOnly);   // the render pairs and the TSL-shell composition are compile-only; the device gates grade those
    const missing = pc.filter((e) => !ids.includes(e.id.replace(/\+.*$/, "")));
    ok("*** every physics corpus entry has a manifest entry (the census that cannot be appended to by hand) ***", missing.length === 0 && pc.length >= 12, missing.length ? "missing: " + missing.map((e) => e.id).join(", ") : `${pc.length} corpus entries covered`);
    const corpusIds = new Set(corpus().map((e) => e.id.replace(/\+.*$/, "")));
    ok("  and every manifest id is a corpus id (a manifest for a kernel the corpus never runs is a stranger)", ids.every((i) => corpusIds.has(i)), ids.filter((i) => !corpusIds.has(i)).join(", ") || "all known");
}

console.log("\n2. EVERY MANIFEST ENTRY RUNS ON THE HEADLESS DAWN DEVICE AND MEETS ITS OWN TOLERANCE");
{
    const skip = headlessGpuSkipReason();
    if (skip) { console.log(`  SKIP  ${skip}`); report("*** NOT A PASS. ***"); fails++; }
    else {
        let ran = 0, compared = 0;
        for (const { rel, ns } of mods) for (const p of ns.PROBES) {
            if (p.device) { report(`${p.id}: device-graded by ${p.graded.split(" ")[0]}; compiled here only`);
                const c = await runWgslComputeNative({ code: p.code(p.args), entryPoint: p.entryPoint || "main", outCount: 1, compileOnly: true });
                ok(`  ${p.id} compiles on Dawn`, c.ok, c.ok ? "" : c.reason); ran++; continue; }
            const a = p.args, opts = { code: p.code(a), entryPoint: p.entryPoint || "main", outCount: val(p.outCount, a), uniforms: p.pack(a), workgroups: val(p.workgroups, a),
                inputs: p.inputs ? p.inputs(a) : null, outInit: p.outInit ? p.outInit(a) : null };
            const r = await runWgslComputeNative(opts);
            ok(`runs: ${p.id}`, r.ok, r.ok ? `${r.values.length} floats` : `${r.reason} ${(r.errors || []).join(" | ")}`);
            if (!r.ok) continue;
            ran++;
            const finite = r.values.every(Number.isFinite);
            const twin = p.cpu(a);
            let worst = 0, worstRel = 0, same = 0;
            for (let i = 0; i < twin.length; i++) { const d = Math.abs(r.values[i] - twin[i]); if (d === 0) same++; worst = Math.max(worst, d); worstRel = Math.max(worstRel, d / Math.max(1, Math.abs(twin[i]))); }
            if (typeof p.tol === "number") { compared++; ok(`*** ${p.id}: within its stated tolerance ${p.tol} of the twin on every element ***`, finite && twin.length === r.values.length && worst <= p.tol, `worst ${worst.toExponential(2)}, ${same}/${twin.length} exact`); }
            else if (typeof p.rel === "number") { compared++; ok(`*** ${p.id}: within its stated RELATIVE tolerance ${p.rel} of the twin ***`, finite && twin.length === r.values.length && worstRel <= p.rel, `worst relative ${worstRel.toExponential(2)}, ${same}/${twin.length} exact`); }
            else { ok(`  ${p.id}: finite, and the twin is the same length (graded by ${p.graded.split(" ")[0]})`, finite && twin.length === r.values.length, `worst ${worst.toExponential(2)} -- printed, not a claim`); }
        }
        ok("*** the whole lab ran ***", ran === mods.reduce((n, m) => n + m.ns.PROBES.length, 0) && compared >= 8, `${ran} kernels ran, ${compared} held to a tolerance`);
    }
}

console.log(fails ? "\nFAIL -- " + fails + " check(s)" : "\nALL GREEN");
console.log("unchecked here: the browser's WebGPU (crossBackend-selfcheck holds it to Dawn on the corpus, and deviceCompute-selfcheck " +
    "through the device); the keys' VALUES (each module's own gate grades those); and kernels outside PHYSICS_KERNEL_MODULES, " +
    "which a new module must join by name.");
process.exit(fails ? 1 : 0);
