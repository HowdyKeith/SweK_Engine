#!/usr/bin/env node
// WebGLEngine/tools/ship/brainTsl-selfcheck.mjs -- v4381
//
// GRADES render/brainTsl.mjs against brain/mlp.js -- the GPU Brain's own MLP kernel, expressed as a TSL
// compute graph and transplanted through render/tslSource.mjs.
//
// *** WHY THIS TWIN ANSWERS v4335'S OBJECTION. *** That round found the weakness in every "byte-identical to
// the twin" claim this arc had made: the twin is built from the SAME SHELL as the graph, so a shell mistake
// moves both halves together and the comparison stays silent -- sabotage N dropped a topology and 36,864 of
// 36,864 pixels still agreed. brain/mlp.js is not that. It predates the TSL arc by more than a thousand
// versions, it was written to run policies rather than to be compared with anything, and brain/brain.js runs
// the engine's own two policies through it. It is a reference this round did not get to design.
//
// *** AND THE ROUND'S OWN GRAPH WAS WRONG ON ITS FIRST RUN, IN THE ONE PLACE THE FLATTENING TOUCHES. ***
// See section 4. The kernel's ragged-edge guard was dropped on the reasoning that the dispatch is exact; it
// is not, and the damage was not where reasoning put it either.
//
// Run: node tools/ship/brainTsl-selfcheck.mjs
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runInEngineOrigin, webgpuSkipReason } from "./webgpuHarness.mjs";
import { computeShell, transplantCompute } from "../../render/tslSource.mjs";
import * as BT from "../../render/brainTsl.mjs";
import { buildAttackLayersDeep, ATK_FEATURES } from "../../brain/policy.js";
// TWO STRIPPERS AND THE DIFFERENCE MATTERS TWICE IN THIS FILE. sourceScan's codeOnly blanks string BODIES as
// well as comments, so `from "/brain/mlp.js"` becomes `from ""` and an import check over it finds nothing --
// which is exactly how the first version of section 1 read "0 importers". orreryFleetScan's removes comments
// only, and that is what an import scan wants. The purity-shaped checks still use sourceScan's.
import { codeOnly } from "./sourceScan.mjs";
import { codeOnly as commentsOnly } from "./orreryFleetScan.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let fails = 0;
const ok = (label, cond, detail) => { if (!cond) fails++; console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}${detail ? "   " + detail : ""}`); };
const report = (s) => console.log("  ----  " + s);
const MLP = fs.readFileSync(path.join(ENG, "brain/mlp.js"), "utf8");
const diffCount = (a, b) => { let d = 0, w = 0; for (let i = 0; i < a.length; i++) if (!Object.is(a[i], b[i])) { d++; w = Math.max(w, Math.abs(a[i] - b[i])); } return { d, w }; };

// A deterministic fixture maker -- mulberry32, so the numbers are the same on every box and in the page.
const mul = (a) => () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
function fixture(seed, nIn, nOut, batch, act, zeroBias = false) {
    const rnd = mul(seed);
    return { nIn, nOut, batch, act,
        W: Array.from({ length: nOut * nIn }, () => Math.fround((rnd() * 2 - 1) * 1.5)),
        b: Array.from({ length: nOut }, () => (zeroBias ? 0 : Math.fround((rnd() * 2 - 1) * 1.2))),
        x: Array.from({ length: batch * nIn }, () => Math.fround((rnd() * 2 - 1) * 1.8)) };
}
const asLayer = (f) => ({ nIn: f.nIn, nOut: f.nOut, act: f.act, W: Float32Array.from(f.W), b: Float32Array.from(f.b) });
const CASES = [
    { tag: "relu, non-zero bias, 128 cells", f: fixture(11, 16, 16, 8, "relu") },
    { tag: "none, non-zero bias, 96 cells",  f: fixture(22, 24, 12, 8, "none") },
    { tag: "sigmoid, non-zero bias, 8 cells", f: fixture(33, 16, 1, 8, "sigmoid") },
    { tag: "relu, ZERO bias -- the shipped policy's shape", f: fixture(44, 16, 16, 8, "relu", true) },
];

console.log("brainTsl-selfcheck -- the GPU Brain's MLP layer as a node graph, against the kernel that runs it\n");

// =============================================================================================================
console.log("1. *** THE TWIN IS SHIPPED CODE THIS ROUND DID NOT GET TO DESIGN ***");
{
    ok("*** brain/mlp.js carries the hand-written kernel, and it is not a fixture ***",
        /const WGSL = \/\* wgsl \*\/ `/.test(MLP) && /@compute @workgroup_size\(8, 8\)/.test(MLP) && /fn k_layer/.test(MLP),
        "@workgroup_size(8, 8), fn k_layer -- one dispatch per layer, activations ping-ponging");
    // *** DERIVED, AND THE FIRST NUMBER THIS ROUND WROTE DOWN WAS WRONG. *** The module header said "five
    // modules ship through it", from a `grep -rln mlp.js` that matched COMMENTS: rl/dockPolicy.js says "it
    // drops straight onto the GPU Brain's BatchedMLP" and imports nothing. Counted by import, it is TWO --
    // brain/brain.js, which builds one at buildLayers() and a second at the attack layers, and blobBrain.js.
    // Two is still a shipped consumer and five was still a false claim, so the count is taken from the tree.
    const consumers = [];
    for (const rel of ["brain/brain.js", "brain/blobBrain.js", "brain/learn.js", "brain/rl/dockPolicy.js",
                       "brain/rl/rocketPolicy.js", "tools/roundhouse/policyPilot.mjs"]) {
        let src = ""; try { src = fs.readFileSync(path.join(ENG, rel), "utf8"); } catch { continue; }
        if (/import\s*\{[^}]*BatchedMLP[^}]*\}\s*from/.test(commentsOnly(src))) consumers.push(rel);
    }
    ok("  and real modules run through it, so a mistake in it is a mistake in the brain",
        consumers.length === 2 && consumers.includes("brain/brain.js"),
        `${consumers.length} importers of BatchedMLP: ${consumers.join(", ")} -- brain.js constructs one for ` +
        `buildLayers() and a second for the attack policy, at batch caps 64 and 256`);
    ok("  and the ones that only NAME it in prose are not counted as consumers",
        /BatchedMLP/.test(fs.readFileSync(path.join(ENG, "brain/rl/dockPolicy.js"), "utf8")) &&
        !consumers.includes("brain/rl/dockPolicy.js"),
        "rl/dockPolicy.js says a policy 'drops straight onto' it and imports nothing -- prose is not a wire");
    ok("*** and the graph's activation codes are the kernel's, not a second table ***",
        /const ACT = \{ none: 0, relu: 1, sigmoid: 2 \}/.test(MLP) &&
        BT.ACT.none === 0 && BT.ACT.relu === 1 && BT.ACT.sigmoid === 2,
        "a second spelling of an enum is a second thing to keep in step");
}

// =============================================================================================================
console.log("\n2. THE REDUCTION ORDER IS LOAD-BEARING -- AND THE SHIPPED POLICY CANNOT SEE IT");
{
    // The general case: bias-first against bias-last, over layers with real biases.
    let moved = 0, cells = 0, worst = 0;
    for (let t = 0; t < 40; t++) {
        const f = fixture(t * 7919 + 13, 4 + (t % 29), 3 + (t % 11), 8, "none");
        const L = asLayer(f), x = Float32Array.from(f.x);
        const a = BT.mlpLayerCpu(L, x, f.batch), b = BT.mlpLayerReassociated(L, x, f.batch);
        const r = diffCount(a, b); moved += r.d; cells += a.length; worst = Math.max(worst, r.w);
    }
    ok("*** summing the products first and adding the bias last is NOT the same number ***",
        moved > cells * 0.2,
        `${moved} of ${cells} cells move (${(100 * moved / cells).toFixed(0)}%), worst ${worst.toExponential(3)} ` +
        `-- f32 addition is not associative, so the kernel's order IS its arithmetic`);
    // AND THE FIXTURE THAT MATTERS IS BLIND TO IT. Derived from the shipped policy, not asserted about it.
    const hand = Float32Array.from({ length: ATK_FEATURES }, (_, i) => Math.fround(Math.sin(i * 1.7) * 0.6));
    const P0 = buildAttackLayersDeep(hand)[0];
    const px = Float32Array.from({ length: 16 * P0.nIn }, (_, i) => Math.fround(Math.sin((i + 3) * 0.9137) * 1.4));
    const pa = BT.mlpLayerCpu(P0, px, 16), pb = BT.mlpLayerReassociated(P0, px, 16);
    const pr = diffCount(pa, pb);
    const zeros = Array.from(P0.b).filter((v) => v === 0).length;
    ok("*** and on the policy the brain SHIPS the same rewrite moves nothing at all ***",
        pr.d === 0 && zeros === P0.b.length,
        `0 of ${pa.length} cells, because all ${zeros} of buildAttackLayersDeep's biases are zero and adding ` +
        `zero first or last is exact. GRADING THE ORDER AGAINST THE REAL CONSUMER ALONE WOULD PROVE NOTHING`);
    report("so this file runs both: the shipped shape for the consumer, a non-zero-bias layer for the order");
}

// =============================================================================================================
console.log("\n3. THE FLATTENING VISITS EVERY CELL EXACTLY ONCE");
{
    const bad = [];
    for (const [batch, nOut] of [[8, 16], [8, 12], [8, 1], [1, 64], [13, 7]]) {
        const seen = new Map();
        for (let i = 0; i < BT.invocationsFor(batch, nOut); i++) {
            const c = BT.cellFor(i, nOut); const k = `${c.r},${c.o}`;
            seen.set(k, (seen.get(k) || 0) + 1);
        }
        const dupes = [...seen.values()].filter((v) => v !== 1).length;
        if (seen.size !== batch * nOut || dupes) bad.push(`${batch}x${nOut}: ${seen.size} cells, ${dupes} not-once`);
    }
    ok("*** the 2D kernel's (o, r) and the graph's flat index are a bijection ***", bad.length === 0,
        bad.join("; ") || "5 shapes including a prime one (13x7); every cell once, counted, not reasoned about");
    ok("  and the flat index IS the store index, so no second mapping can drift from the first",
        BT.cellFor(37, 12).r * 12 + BT.cellFor(37, 12).o === 37, "Y[i] with i = r*nOut + o, one number");
}

// =============================================================================================================
console.log("\n4. *** THE KERNEL'S RAGGED-EDGE GUARD, AND WHAT DROPPING IT ACTUALLY COST ***");
{
    const src = fs.readFileSync(path.join(ENG, "render/brainTsl.mjs"), "utf8");
    ok("*** the kernel guards its over-dispatch and so does the graph ***",
        /if \(o >= P\.nOut \|\| r >= P\.batch\) \{ return; \}/.test(MLP) && /If\(i\.lessThan\(uint\(cells\)\)/.test(codeOnly(src)),
        "two comparisons in the kernel become one after the flattening, because the flat index is a bijection");
    // THE DISPATCH IS NOT EXACT, which is the premise the first version got wrong -- derived, not remembered.
    const ragged = CASES.map((c) => ({ cells: BT.invocationsFor(c.f.batch, c.f.nOut) }))
                        .map((c) => ({ ...c, run: Math.ceil(c.cells / 64) * 64 }))
                        .filter((c) => c.run !== c.cells);
    ok("*** a compute(N) runs whole workgroups of 64, so N is a floor and not the count ***",
        ragged.length >= 2,
        ragged.map((c) => `${c.cells} cells -> ${c.run} invocations`).join(", ") +
        ` -- ${CASES.length - ragged.length} of the ${CASES.length} fixtures are exact multiples and see nothing`);
    ok("  the module records the measured damage rather than the reasoning that missed it",
        /corrupted ONE IN-RANGE CELL/.test(src) && /3\.43/.test(src) && /0\.93/.test(src),
        "one cell wrong by 3.43 on the 96-cell layer, 0.93 on the 8-cell one; the 128-cell layer was perfect");
}

// =============================================================================================================
console.log("\n5. THE SHELL, AND WHAT IT REFUSES");
{
    const shell = computeShell(BT.MLP_SHELL);
    ok("*** the shell is the kernel's four buffers in the kernel's own packing ***",
        BT.MLP_SHELL.storage.length === 4 &&
        BT.MLP_SHELL.storage.map((b) => b.name).join(",") === "X,W,B,Y",
        `X, W, B read and Y written -- ${BT.MLP_SHELL.storage.filter((b) => b.access === "read").length} read, ` +
        `${BT.MLP_SHELL.storage.filter((b) => b.access !== "read").length} read_write`);
    ok("  and it declares them, so a device binds a module and not a fragment",
        /var<storage, read> X/.test(shell.prefix) && /var<storage, read_write> Y/.test(shell.prefix),
        "the read-only guarantee is in the declaration rather than in a convention");
    const throwsWith = (fn, re) => { try { fn(); return false; } catch (e) { return re.test(e.message); } };
    ok("*** a shader with no compute entry point is refused by name ***",
        throwsWith(() => transplantCompute("// Three.js\n@vertex fn main() {}", shell), /no compute entry point/),
        "a fragment or vertex belongs in transplantIntoShell");
    ok("  and a non-three shader is refused before anything is parsed",
        throwsWith(() => transplantCompute("@compute @workgroup_size(64) fn main() {}", shell), /not a three\.js/),
        "the transplant is for an EMITTED shader; a hand-written one needs no transplanting");
}

// =============================================================================================================
console.log("\n6. ON A REAL DEVICE: THE GENERATED PASS AGAINST THE SHIPPED KERNEL");
{
    const skip = webgpuSkipReason();
    if (skip) { report("SKIPPED -- " + skip); report("*** A SKIP, NOT A PASS: sections 1-5 read the code; only this one runs it."); }
    else {
        const page = fs.readFileSync(path.join(ENG, "tools/ship/brainTsl-page.js"), "utf8");
        const r = await runInEngineOrigin({ engineRoot: ENG, timeoutMs: 240000, args: { cases: CASES.map((c) => c.f) }, script: page });
        if (!r.ok || (r.result && r.result.error)) {
            ok("the page ran", false, String((r.result && r.result.error) || r.reason).slice(0, 220));
        } else {
            const res = r.result;
            let genVsShipped = 0, specifiedDiff = 0, unspecified = null;
            CASES.forEach((c, n) => {
                const gen = Float32Array.from(res.gen[n]), ship = Float32Array.from(res.shipped[n]);
                const cpu = BT.mlpLayerCpu(asLayer(c.f), Float32Array.from(c.f.x), c.f.batch);
                const vs = diffCount(gen, ship), vc = diffCount(gen, cpu);
                genVsShipped += vs.d;
                if (BT.actIsSpecified(c.f.act)) specifiedDiff += vc.d;
                else unspecified = { tag: c.tag, ...vc, cells: gen.length };
                report(`${c.tag.padEnd(44)} ${String(gen.length).padStart(4)} cells   vs shipped ${vs.d} ` +
                       `(worst ${vs.w.toExponential(2)})   vs cpu ${vc.d} (worst ${vc.w.toExponential(2)})`);
            });
            // COUNTED, NOT RESTATED: a detail line that prints "0 differing cells" beside its own FAIL is
            // decoration. Sabotage A caught exactly that here, the way it did in v4361's section 5.
            ok("*** the generated pass is BIT-IDENTICAL to the shipped kernel, on every activation ***",
                genVsShipped === 0,
                `${genVsShipped} differing cells across ${CASES.length} layer shapes` +
                (genVsShipped === 0 ? " -- not a tolerance, zero. Same device, same buffers, one written by " +
                 "hand a thousand versions before the other was generated" : " -- the graph and the kernel " +
                 "are computing different numbers"));
            // =====================================================================================================
            console.log("\n7. *** AND THE CLAIM SPLITS BY OPERATION CLASS, WHICH IS THE POINT ***");
            ok("*** none and relu are bit-identical to the f32 CPU mirror too ***", specifiedDiff === 0,
                `${specifiedDiff} differing cells. +, * and max are exactly rounded in WGSL, so a Math.fround ` +
                `mirror can reproduce the device and the claim is a bit claim`);
            ok("*** sigmoid is NOT, and the gap is measured rather than hidden under a tolerance ***",
                unspecified && unspecified.d > 0,
                unspecified ? `${unspecified.d} of ${unspecified.cells} cells differ, worst ` +
                    `${unspecified.w.toExponential(3)} -- exp() carries an ULP budget in WGSL rather than ` +
                    `correct rounding, so the device and Math.exp are both conformant and unequal`
                    : "no unspecified-op case ran");
            const sigVsShip = (() => { const n = CASES.findIndex((c) => !BT.actIsSpecified(c.f.act));
                return n < 0 ? null : diffCount(Float32Array.from(res.gen[n]), Float32Array.from(res.shipped[n])); })();
            ok("  and that same sigmoid layer is still bit-identical to the KERNEL, which is a different claim",
                sigVsShip && sigVsShip.d === 0,
                `${sigVsShip ? sigVsShip.d : "?"} differing cells against the kernel against ` +
                `${unspecified ? unspecified.d : "?"} against the mirror -- same device, same exp: what cannot ` +
                `be claimed against a CPU mirror is still exact against the twin`);
            report("A ROUND THAT TOOK ONE TOLERANCE WIDE ENOUGH FOR THE SIGMOID would have reported 'agrees' " +
                   "and thrown away the exact claim the other two activations can carry.");
        }
    }
}

// ---- SABOTAGE LOG -- applied to the working tree, exit code and FAIL count read together, restored
// md5-identical (render/brainTsl.mjs edb052d4, tools/ship/brainTsl-page.js 5f8c6a36).
//
//   A  the reduction reassociated: products from zero, bias added last.
//      -> exit=1, 3 red, 122 cells wrong against the kernel and 117 against the mirror. *** AND IT CAUGHT A
//      DEFECT IN THIS FILE FIRST: *** every detail line printed "0 differing cells" beside its own FAIL,
//      because the strings were typed rather than counted. Section 6 and 7's details now carry the measured
//      number, which is how the 122 above is known at all. Same shape v4361's section 5 had.
//
//   B  the ragged-edge guard widened so it can never fire (i < cells * 1000).
//      -> exit=1, 4 red: the source-level guard check, and on the device exactly TWO cells -- one in the
//      96-cell layer and one in the 8-cell layer, the two fixtures whose size is not a multiple of 64. The
//      128-cell fixtures were untouched. That is the damage the module header describes, reproduced on
//      demand: the harm is one in-range cell per ragged layer, not the out-of-range ones.
//
//   C  the flattening transposed: o = i / nOut, r = i % nOut.
//      -> exit=1, 3 red, 249 of the 360 cells wrong. Section 3's bijection check stayed GREEN and correctly
//      so -- a transpose is still a bijection, it visits every cell exactly once and puts the wrong number in
//      each. A structural check cannot see a permutation, which is why section 6 exists.
//
//   D  SPECIFIED_OPS widened to include sigmoid -- the operation-class split denied.
//      -> exit=1, 3 red: the specified-ops line now folds the sigmoid case in and reads 2 wrong, the
//      unspecified line reports "no unspecified-op case ran", and the kernel comparison loses its subject.
//      The split is load-bearing rather than commentary: with it, two of the three activations carry a bit
//      claim against a CPU mirror; without it, none of them can.
console.log(fails ? "\nFAIL -- " + fails + " check(s)" : "\nALL GREEN");
console.log("unchecked here: whether a TSL-generated pass is worth SHIPPING into brain/mlp.js. It is not " +
    "faster and it is not shorter; what it is, is a second expression of the same kernel that a change to " +
    "either half now has to keep. Replacing the hand-written WGSL is a separate argument and this file " +
    "makes none of it.");
process.exit(fails ? 1 : 0);
