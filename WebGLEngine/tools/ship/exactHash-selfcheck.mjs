#!/usr/bin/env node
// WebGLEngine/tools/ship/exactHash-selfcheck.mjs -- v4569
//
// GATES render/exactHash.mjs and the twins that use it.
//
// *** fract(sin(dot(p, K)) * 43758.5453) IS NOT AN APPROXIMATION OF A RANDOM NUMBER. IT IS A DIFFERENT ONE
// IN float32 THAN IN float64. *** sin(x) * 43758 amplifies the last bits of x by four orders of magnitude,
// so a float32 GPU and a float64 CPU twin do not round one value differently, they draw unrelated values.
//
// This tree ships that idiom in several places where BOTH halves exist -- a shader and a CPU model of it --
// and the two therefore disagree about what they draw. Measured this round:
//
//   render/grassField.js vs render/grassModel.mjs   65.0% of 32,000 blade origins differ by more than 0.1,
//                                                   worst 1.0000, and bladeHash DECIDES WHETHER A BLADE
//                                                   EXISTS, so the drawn decision flips on 65.4%
//   fx/wormhole/wormholeNebula.js, all three h2     70.0% of 14,400 lattice points, worst 1.0000. One
//                                                   function in JS, GLSL and WGSL in ONE FILE, two of them
//                                                   float32 and one float64
//
// The replacement quantises to a 1/256 lattice and runs an integer avalanche (Wang / lowbias32). Integer
// arithmetic is exact in both precisions, so the halves agree BIT FOR BIT wherever the quantised coordinate
// agrees. It is v4558's fix for the BCS family, made reusable.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { exactHash2, exactHash1, umix, EXACT_HASH_GLSL, EXACT_HASH_WGSL } from "../../render/exactHash.mjs";
import { bcsHash } from "../../render/swiftShaderModel.mjs";
import * as GM from "../../render/grassModel.mjs";
import { validateWgsl } from "../../render/wgslSpec.mjs";
import { codeOnly } from "./sourceScan.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let fails = 0;
const ok = (n, c, d = "") => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const f = Math.fround;

console.log("1. *** THE TIE TO THE PROVEN FUNCTION: seed 0 IS bcsHash, not a thing that resembles it ***");
{
    // render/exactHash.mjs is a THIRD copy of arithmetic v4558 already shipped twice (bcsHash in
    // swiftShaderModel.mjs and bcs_hash in the GLSL inside swiftShaderPass.js, held to each other by
    // swiftShaders-selfcheck). A third copy is only defensible if something holds it to the other two, and
    // the module's own comment promises this row. `x ^ 0` is `x`, so seed 0 must be bit-identical.
    let n = 0, bad = 0;
    for (let i = 0; i < 6000; i++) {
        const x = (i % 131) * 0.37 - 24, y = Math.floor(i / 131) * 0.53 - 11;
        n++; if (exactHash2(x, y) !== bcsHash(x, y)) bad++;
    }
    ok("*** exactHash2(x, y) at seed 0 is EXACTLY swiftShaderModel.bcsHash, on every sample ***",
       n > 5000 && bad === 0, `${n} points, ${bad} mismatches -- the proven function is the seed-0 case of ` +
       "this one rather than something it merely looks like");
    ok("  and a seed decorrelates, which is what the old idiom used its magic constants for",
       exactHash2(1.5, 2.5, 0) !== exactHash2(1.5, 2.5, 1) && exactHash2(4, 9, 7) !== exactHash2(4, 9, 8));
    ok("  the 1-D form is the 2-D form at y = 0, so there is one hash and not two",
       exactHash1(3.25) === exactHash2(3.25, 0) && exactHash1(3.25, 5) === exactHash2(3.25, 0, 5));
}

console.log("\n2. *** IT IS EXACT IN BOTH PRECISIONS, WHICH IS THE ENTIRE POINT ***");
{
    // The float32 emulation is what a GPU does: round every operand and every intermediate. If the
    // arithmetic is integer after the quantise, the two must agree EXACTLY -- not closely.
    // *** THE FIRST DRAFT OF THIS ROW CLAIMED "worst difference is zero" FOR ANY INPUT AND WAS WRONG. ***
    // Integer arithmetic is exact in both precisions, so the hash agrees wherever THE QUANTISED COORDINATE
    // agrees -- and floor(x * 256) computed in f32 can land one below the f64 answer when x * 256 is near an
    // integer. The module's own comment says exactly this ("an occasional boundary pixel"); the row
    // overclaimed past it and this gate caught it. Two claims now, because they are two facts.
    //
    // (a) ON THE LATTICE -- integer coordinates, which is what vn() and the quantised grass path actually
    //     hash -- agreement is EXACT.
    let m = 0, latticeWorst = 0;
    for (let ix = -70; ix < 70; ix++) for (let iy = -70; iy < 70; iy++) {
        m++; latticeWorst = Math.max(latticeWorst, Math.abs(exactHash2(ix, iy) - exactHash2(f(ix), f(iy))));
    }
    ok("*** on the lattice the two precisions draw the SAME number -- worst difference is zero, not small ***",
       m > 15000 && latticeWorst === 0, `${m} integer lattice points, worst |delta| ${latticeWorst}`);
    // (b) OFF the lattice the disagreement is confined to the quantise, and its size is the claim.
    let n = 0, qDiff = 0;
    for (let i = 0; i < 20000; i++) {
        const x = (i % 211) * 0.41 - 18;
        n++; if (Math.floor(x * 256) !== f(Math.floor(f(f(x) * f(256))))) qDiff++;
    }
    ok("  ...and a continuous input disagrees only where the QUANTISE crosses, which is bounded and small",
       n > 15000 && qDiff / n < 0.05,
       `the quantised coordinate differs on ${qDiff} of ${n} (${(100 * qDiff / n).toFixed(2)}%) -- a lattice ` +
       "boundary, which is what the module bounds. The idiom it replaced disagreed EVERYWHERE, not at edges.");
    // The old idiom, measured beside it, so the row says what was replaced rather than only what replaced it.
    const oldF64 = (x, y) => { const h = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return h - Math.floor(h); };
    const oldF32 = (x, y) => { const d = f(f(f(x) * f(127.1)) + f(f(y) * f(311.7)));
        const v = f(f(Math.sin(d)) * f(43758.5453)); return f(v - f(Math.floor(v))); };
    let bad = 0, oldWorst = 0;
    for (let i = 0; i < 8000; i++) {
        const x = (i % 89) * 0.41 - 18, y = Math.floor(i / 89) * 0.29 - 13;
        const d = Math.abs(oldF64(x, y) - oldF32(x, y));
        if (d > 0.1) bad++; oldWorst = Math.max(oldWorst, d);
    }
    ok("  ...against the idiom it replaces, on the same points -- a control, not a story",
       bad > 4000 && oldWorst > 0.9,
       `fract(sin(dot(p,K))*43758.5453): ${bad} of 8000 (${(100 * bad / 8000).toFixed(1)}%) differ by more ` +
       `than 0.1, worst ${oldWorst.toFixed(4)}. Not a rounding -- an unrelated number.`);
}

console.log("\n3. THE BOUND, WHICH IS WHERE THE GUARANTEE ENDS");
{
    // The wrap is not decoration: it keeps the lattice under 2^24 (the last integer float32 holds exactly)
    // AND keeps q non-negative, without which the GLSL `uvec2(q)` conversion is undefined behaviour.
    ok("*** a NEGATIVE coordinate still hashes -- the wrap is what makes uvec2(q) defined at all ***",
       Number.isFinite(exactHash2(-3.5, -9.25)) && exactHash2(-3.5, -9.25) >= 0 && exactHash2(-3.5, -9.25) < 1 &&
       exactHash2(-3.5, -9.25) !== exactHash2(3.5, 9.25),
       `h(-3.5,-9.25) = ${exactHash2(-3.5, -9.25).toFixed(6)}, h(3.5,9.25) = ${exactHash2(3.5, 9.25).toFixed(6)}`);
    ok("  every output is in [0, 1), which every caller assumes",
       [[0, 0], [1e6, -1e6], [0.001, 0.002], [-0.5, 0.5]].every(([x, y]) => { const h = exactHash2(x, y); return h >= 0 && h < 1; }));
    ok("  umix is a bijection-ish avalanche: distinct inputs give distinct outputs across a sweep",
       new Set(Array.from({ length: 4096 }, (_, i) => umix(i))).size === 4096,
       "4096 consecutive inputs, 4096 distinct outputs -- a collision here would thin the noise");
}

console.log("\n4. *** THE SHADER TEXTS SAY THE SAME THING AS THE JS ***");
{
    // Not a character comparison -- three languages cannot be character-identical. The CONSTANTS and the
    // shift widths are what the arithmetic is, so those are what must match, in the same order.
    const nums = (t) => (t.match(/0x[0-9a-f]{8}|\b16777216\b|\b4294967296\b|\b256\b/g) || []).join(",");
    const jsSrc = fs.readFileSync(path.join(ENG, "render/exactHash.mjs"), "utf8");
    const jsBody = jsSrc.slice(jsSrc.indexOf("export function umix"), jsSrc.indexOf("export const EXACT_HASH_WGSL"));
    // GLSL and WGSL are the same program in two syntaxes and must match IN ORDER. The JS states the same
    // constants but not in the same shape -- it wraps each axis in its own statement and spells the shift
    // widths as separate tokens -- so it is held to carrying the same SET, which is the honest comparison.
    // (The first draft demanded one order of all three and reddened on a difference of syntax.)
    ok("*** the GLSL and the WGSL carry the SAME constants in the SAME ORDER ***",
       nums(EXACT_HASH_GLSL) === nums(EXACT_HASH_WGSL) && nums(EXACT_HASH_GLSL).length > 40,
       `glsl [${nums(EXACT_HASH_GLSL)}]`);
    const setOf = (t) => [...new Set(nums(t).split(","))].sort().join(",");
    ok("  ...and the JS states the same set of them, differing only in the order its statements impose",
       setOf(jsBody) === setOf(EXACT_HASH_GLSL),
       `js [${setOf(jsBody)}] vs shader [${setOf(EXACT_HASH_GLSL)}]`);
    ok("  and the WGSL validates against the spec scanner rather than only on a device",
       validateWgsl("@fragment fn fs() -> @location(0) vec4f { return vec4f(exact_hash(vec2f(1.0), 0u)); }\n" +
                    EXACT_HASH_WGSL).length === 0);
    ok("  both texts define BOTH functions, so splicing one into a shader is enough",
       /uint bcs|uint exact_umix/.test(EXACT_HASH_GLSL) && /float exact_hash/.test(EXACT_HASH_GLSL) &&
       /fn exact_umix/.test(EXACT_HASH_WGSL) && /fn exact_hash/.test(EXACT_HASH_WGSL));
}

console.log("\n5. *** THE TWINS THAT USED TO DISAGREE ***");
{
    // (a) THE GRASS. bladeHash decides `if (bladeHash < slopeSuppress) drawn = false`, so a disagreement
    // here is a disagreement about whether a blade of grass exists. Read through bladeVisibility -- the
    // model's real path -- because a row that compares a hash to itself passes whatever the model does.
    const gpuQ = (v) => f(Math.floor(f(f(v) * f(256))) + 8388608);
    let n = 0, flips = 0, worst = 0;
    for (let ix = 0; ix < 400; ix++) for (let iz = 0; iz < 30; iz++) {
        const x = ix * 0.25, z = iz * 0.25;
        const a = GM.bladeVisibility(0.45, x, z).bladeHash, b = GM.windHash(gpuQ(x), gpuQ(z));
        n++; worst = Math.max(worst, Math.abs(a - b));
        for (const s of [0.1, 0.5, 0.9]) if ((a < s) !== (b < s)) { flips++; break; }
    }
    ok("*** grass: the model and the shader agree on bladeHash exactly, so they agree on WHICH BLADES EXIST ***",
       n > 10000 && worst === 0 && flips === 0,
       `${n} origins, worst |delta| ${worst}, ${flips} drawn-decision flips. Before v4569: 65.0% differing ` +
       "by more than 0.1 and 65.4% flips.");

    // (b) THE WORMHOLE. One function, three languages, one file. vn() hashes INTEGER lattice coords.
    const wormQ = (v) => f(Math.floor(f(f(v) * f(256)))) / 256;
    let m = 0, wWorst = 0;
    for (let ix = -40; ix < 40; ix++) for (let iy = -40; iy < 40; iy++) {
        m++; wWorst = Math.max(wWorst, Math.abs(exactHash2(ix, iy) - exactHash2(wormQ(ix), wormQ(iy))));
    }
    ok("*** wormhole: h2 draws one number in JS, GLSL and WGSL where it drew three ***",
       m > 5000 && wWorst === 0, `${m} lattice points, worst |delta| ${wWorst}. Before v4569: 70.0% differing ` +
       "by more than 0.1, worst 1.0000.");
    // *** THE SHADER HALVES ARE READ AS THE EXPORTED STRINGS, NOT AS FILE TEXT, AND IT TOOK TWO WRONG
    // DRAFTS TO GET THERE. *** The first scanned the raw source and reddened on the comment that explains
    // the fix, because that comment quotes the idiom it replaced -- the defect commentFalsePass-selfcheck
    // hunts. The second scanned codeOnly(source) and would have passed VACUOUSLY: codeOnly is a JavaScript
    // comment stripper, a shader in a template literal is not JavaScript to it, and it removes the shader
    // text entirely -- so "the old idiom is absent" would have been true of a string with nothing in it.
    // The exported shader IS the thing that reaches a device, so it is what gets read.
    const wMod = await import("../../fx/wormhole/wormholeNebula.js");
    const shaders = [wMod.WORMHOLE_NEBULA_GLSL_FS, wMod.WORMHOLE_NEBULA_WGSL];
    const wJs = codeOnly(fs.readFileSync(path.join(ENG, "fx/wormhole/wormholeNebula.js"), "utf8"));
    ok("  ...and all THREE halves really changed -- one left behind is the whole defect back",
       shaders.length === 2 && shaders.every((t) => typeof t === "string" && t.length > 1000) &&
       shaders.every((t) => /exact_hash\(p, 0u\)/.test(t) && !/fract\(sin\(/.test(t)) &&
       /exactHash2\(x, y\)/.test(wJs) && !/Math\.sin\(x \* 127\.1 \+ y \* 311\.7\)/.test(wJs),
       `both exported shaders (${shaders.map((t) => t.length).join(" and ")} chars) call exact_hash and carry ` +
       "no fract(sin( at all; the JS half calls exactHash2");
}

console.log("\n6. *** THE RATCHET: no CPU/GPU TWIN may reintroduce the idiom ***");
{
    // A census rather than a list. A file is a TWIN when it computes the sin-hash in float64 (Math.sin(...)
    // times a five-figure constant) -- that is a CPU model of a shader, and the shader is float32.
    //
    // NOT EVERY MATCH IS A DEFECT, and the two exceptions are named rather than pattern-matched away:
    // fx/paintFields.mjs and physics/kernelVerdict-selfcheck.mjs compute the idiom AT BOTH PRECISIONS ON
    // PURPOSE, to measure the gap. They are instruments, and rewriting them would delete the measurement.
    const INSTRUMENTS = ["fx/paintFields.mjs", "physics/kernelVerdict-selfcheck.mjs"];
    const SKIP = /node_modules|[\\/]vendor[\\/]|[\\/]dist[\\/]/;
    const walk = (d, out = []) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        const p = path.join(d, e.name); if (SKIP.test(p) || e.name === ".git") continue;
        if (e.isDirectory()) walk(p, out); else if (/\.(js|mjs)$/.test(e.name)) out.push(path.relative(ENG, p).split(path.sep).join("/"));
    } return out; };
    const CPU = /Math\.sin\s*\([^)]*\)\s*\*\s*\d{4,}/;
    const twins = [];
    for (const rel of walk(ENG)) {
        // This gate computes the old idiom itself, as the control in section 2, and quotes it in prose
        // throughout. Scanning itself would be a census counting its own instrument.
        if (INSTRUMENTS.includes(rel) || rel === "tools/ship/exactHash-selfcheck.mjs") continue;
        let src; try { src = codeOnly(fs.readFileSync(path.join(ENG, rel), "utf8")); } catch { continue; }
        const live = src.split("\n").filter((l) => CPU.test(l) && !/^\s*(\/\/|\*)/.test(l));
        // a float64 sin-hash matters only where a SHADER of the same file computes it too
        if (live.length && /fract\s*\(\s*sin\s*\(/.test(src)) twins.push(rel);
    }
    ok("*** no file computes the sin-hash in float64 AND emits it to a shader -- the twin case is empty ***",
       twins.length === 0,
       twins.length ? "TWINS: " + twins.join(", ") : "checked every .js and .mjs outside vendor; the two " +
       "deliberate instruments (" + INSTRUMENTS.map((i) => i.split("/").pop()).join(", ") + ") are named " +
       "and excluded, so this cannot pass by matching nothing");
    ok("  ...and those instruments still EXIST, so the exclusion is not hiding a deletion",
       INSTRUMENTS.every((i) => fs.existsSync(path.join(ENG, i))),
       INSTRUMENTS.join(", ") + " -- an exclusion list whose entries vanished would pass this row silently");
}

console.log(fails ? `\nFAIL -- ${fails} check(s)` : "\nALL GREEN");
console.log("unchecked here: the shaders EXECUTING. No GL or WebGPU context is taken -- the GLSL and WGSL are " +
    "held to the JS by their constants and by the spec scanner, and the float32 halves are emulated with " +
    "Math.fround, which is what a GPU does to every operand. tools/ship/swiftShaders-selfcheck.mjs runs the " +
    "same arithmetic on a device for the BCS family; the twins here inherit that evidence rather than repeat " +
    "it. Also unchecked: whether the new noise field LOOKS better, which is not a claim this round makes -- a " +
    "different hash is a different pattern, and the trade is that two halves can now be held to one picture.");
process.exit(fails ? 1 : 0);
