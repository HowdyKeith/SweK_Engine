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
import { exactHash2, exactHash1, umix, EXACT_HASH_GLSL, EXACT_HASH_WGSL,
         SHADER_SINHASH_V4578 } from "../../render/exactHash.mjs";
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

console.log("\n5b. *** THE NEBULA: THE CPU FALLBACK AND THE GPU PATH DREW DIFFERENT STARS ***");
{
    // *** THE GAS SURVIVED THE DIVERGENCE AND THE STARS DID NOT, WHICH IS WHY NOBODY SAW IT. ***
    // nebulaShaders.js's header said the transcription was "correct-by-construction and visually equivalent
    // (f32 vs f64 differences are imperceptible for gas)" -- true, because fbm AVERAGES its noise, so a wisp
    // drawn from a different random field is still a wisp. The same header claimed the transcription keeps
    // "same hash/vnoise/fbm/palette/parallax/STARS", and nebulaColorAt draws a star with `if (sv > 0.994)`.
    // A THRESHOLD DOES NOT AVERAGE.
    //
    // nebula.html imports renderNebulaCPU AND these shaders, so which sky a viewer saw depended on whether
    // their browser had WebGPU.
    //
    // *** THE "BEFORE" IS RE-DERIVED HERE RATHER THAN QUOTED. *** The first draft of this row carried the
    // before-numbers as prose -- 3,070 stars against 2,576 with 411 shared -- and re-measuring them under a
    // second sampling gave 3,006 against 2,509 with 378. Neither reading was wrong; they were taken over
    // different pixels, and a fixed number standing in for a sampled one is this session's own defect class.
    // So the old idiom is computed BESIDE the new one, over the same pixels, every run.
    const NB = await import("../../fx/nebula/nebula.js");
    const NS = await import("../../fx/nebula/nebulaShaders.js");
    const gpuH = (x, y) => exactHash2(f(x), f(y));
    let n = 0, worst = 0;
    for (let ix = -50; ix < 50; ix++) for (let iy = -50; iy < 50; iy++) {
        n++; worst = Math.max(worst, Math.abs(NB.hash2(ix, iy) - gpuH(ix, iy)));
    }
    ok("*** nebula: the CPU reference and the shader draw the same noise, exactly ***",
       n > 8000 && worst === 0, `${n} lattice points, worst |delta| ${worst}`);
    // THE STARFIELD IS THE ROW THAT MATTERS -- it is the one a viewer can see.
    const oldF64 = (x, y) => { const h = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return h - Math.floor(h); };
    const oldF32 = (x, y) => { const d = f(f(f(x) * f(127.1)) + f(f(y) * f(311.7)));
        const v = f(f(Math.sin(d)) * f(43758.5453)); return f(v - f(Math.floor(v))); };
    let px = 0, cpuStars = 0, gpuStars = 0, same = 0, oCpu = 0, oGpu = 0, oSame = 0;
    for (let x = 0; x < 960; x++) for (let y = 0; y < 1080; y += 2) {
        const sx = Math.floor(x * 0.9), sy = Math.floor(y * 0.9);
        const a2 = NB.hash2(sx, sy) > 0.994, b2 = gpuH(sx, sy) > 0.994;
        px++; if (a2) cpuStars++; if (b2) gpuStars++; if (a2 && b2) same++;
        const a1 = oldF64(sx, sy) > 0.994, b1 = oldF32(sx, sy) > 0.994;
        if (a1) oCpu++; if (b1) oGpu++; if (a1 && b1) oSame++;
    }
    const pct = (n, d) => (d ? (100 * n / d).toFixed(1) : "n/a") + "%";
    ok("*** ...and EVERY STAR IS IN THE SAME PLACE, which is what a viewer without WebGPU used to lose ***",
       cpuStars > 200 && cpuStars === gpuStars && same === cpuStars,
       `${px} sampled pixels: CPU ${cpuStars} stars, GPU ${gpuStars}, ${same} in the same place ` +
       `(${pct(same, cpuStars)}). The idiom it replaced, over THE SAME PIXELS in the same run: ` +
       `${oCpu} against ${oGpu} with ${oSame} shared (${pct(oSame, oCpu)}).`);
    // The control has to still SHOW the divergence, or the row above is comparing the fix to nothing.
    ok("  ...and that control still diverges, so the comparison is to a measured gap and not to a memory",
       oCpu > 200 && oSame / oCpu < 0.5,
       `sin-hash f64 against f32: ${pct(oSame, oCpu)} of the CPU's stars survive to the GPU`);
    ok("  ...and the nebula still PAINTS something -- a constant hash would agree perfectly and draw nothing",
       (() => { const c = []; for (let i = 0; i < 40; i++) c.push(NB.nebulaColorAt(i * 47, i * 29, 1920, 1080, { x: 0, y: 0 }, 1.5)[0]);
                return Math.max(...c) - Math.min(...c) > 0.02 && cpuStars > 200; })(),
       "red-channel spread across 40 pixels, plus a starfield that is sparse rather than empty or full");
    ok("  ...and BOTH shader halves really changed, read as the exported strings",
       [NS.NEBULA_WGSL, NS.NEBULA_GLSL_FS].every((t) => /exact_hash\(p, 0u\)/.test(t) && !/fract\(sin\(/.test(t)),
       `WGSL ${NS.NEBULA_WGSL.length} chars and GLSL ${NS.NEBULA_GLSL_FS.length} chars, both calling exact_hash`);
    ok("  ...and the WGSL still validates, since a spliced function can break a shader that never runs here",
       validateWgsl(NS.NEBULA_WGSL).length === 0, validateWgsl(NS.NEBULA_WGSL).join("; ") || "clean");
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
    const REC = SHADER_SINHASH_V4578;
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

    // *** THE ROW ABOVE IS A SAME-FILE RULE, AND A TWIN CAN LIVE IN TWO FILES. ***
    // v4578: render/holoFoil.mjs's hash2 is an INTEGER avalanche and render/holoFoilShader.js's hf_hash2 was
    // `fract(sin(dot(...)) * 43758.5453123)` under the comment "matching the model's hash2". A genuine
    // CPU/GPU twin, shipped, gated, and INVISIBLE HERE -- because neither file carries both halves, so
    // neither matches "computes it in float64 AND emits it to a shader". The rule was a proxy for the
    // property, which is what this tree keeps finding at the point where a check is trusted.
    //
    // Measured over the 1,600 cells of the 40x40 flake lattice, the GLSL emulated in float32: 81.8% of cells
    // differed by more than 0.1 and the two halves drew 29 of the model's 184 flakes in the same place --
    // 15.8%. The consumer is `if (cell > coverage) return 0`, so that is not a shade difference, it is which
    // flakes exist.
    //
    // A general cross-file twin finder is not attempted -- "which module is a model of which shader" is not
    // decidable from the text, and a guess would either miss pairs or invent them. What IS decidable is the
    // shader half: every file whose SHADER SOURCE computes the idiom, named, so a new one cannot appear
    // without a round saying so.
    const SIN = /fract\s*\(\s*sin\s*\(/;
    // NOT codeOnly: it deletes template literals, which is where every shader in this tree lives, and the
    // v4569 round walked into that three times. A line starting with // or * is a comment in JS and in GLSL
    // and in WGSL alike, which is the rule the CPU scan above already uses.
    const liveLine = (l) => SIN.test(l) && !/^\s*(\/\/|\*|\/\*)/.test(l.trim());
    // ...and the file must hold SHADER SOURCE rather than prose about one. tools/ship/gateSweep.mjs and
    // tools/ship/nextRounds.mjs quote the idiom inside ordinary JS STRINGS -- a commit verdict and a backlog
    // entry -- so no comment rule can exclude them and a bare grep counts them as sites. This is the
    // exemption class tools/ship/commentFalsePass-selfcheck.mjs documents.
    const SHADERISH = /void\s+main\s*\(\s*\)|@fragment|@vertex|precision\s+(highp|mediump|lowp)|fn\s+\w+\s*\([^)]*\)\s*->/;
    const EXT = /\.(js|mjs|html|wgsl|glsl|frag|vert)$/;
    const walkAll = (d, out = []) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        const p = path.join(d, e.name); if (SKIP.test(p) || e.name === ".git") continue;
        if (e.isDirectory()) walkAll(p, out); else if (EXT.test(e.name)) out.push(path.relative(ENG, p).split(path.sep).join("/"));
    } return out; };
    const live = [], prose = [];
    for (const rel of walkAll(ENG)) {
        if (REC.searchers.includes(rel)) continue;      // these two SEARCH for the idiom, so they contain it
        let raw; try { raw = fs.readFileSync(path.join(ENG, rel), "utf8"); } catch { continue; }
        if (!raw.split("\n").some(liveLine)) continue;
        (SHADERISH.test(raw) ? live : prose).push(rel);
    }
    const recorded = [...REC.threshold, ...REC.continuous].sort();
    const missing = recorded.filter((r) => !live.includes(r));
    const extra = live.filter((r) => !recorded.includes(r));
    ok("!! *** the shader-side census is exactly what the record names -- it may shrink, not grow silently ***",
       missing.length === 0 && extra.length === 0,
       extra.length ? "NEW SITE(S) NOT IN THE RECORD: " + extra.join(", ") + " -- name it and say what its hash "
                    + "FEEDS (a threshold decides whether something exists; a continuous consumer averages it away)"
       : missing.length ? "RECORDED BUT GONE: " + missing.join(", ") + " -- if it was fixed, take it out of the record"
       : `${live.length} files: ${REC.threshold.length} whose hash feeds a THRESHOLD and ` +
         `${REC.continuous.length} where it is averaged or added as a small offset. The backlog filed this ` +
         "population as ten; the line rule plus the shader-source requirement reads twelve");
    ok("  ...and the prose-only files are separated rather than counted as sites",
       prose.length > 0 && prose.every((f) => !recorded.includes(f)),
       prose.join(", ") + " -- the idiom inside a JS STRING (a commit verdict, a backlog entry). A bare grep " +
       "counts these, which is how the v4569 census first read 21");
    ok("!! *** the file this round FIXED is out of the census, read from the tree and not from the record ***",
       !live.includes(REC.fixedHere) && fs.existsSync(path.join(ENG, REC.fixedHere)),
       REC.fixedHere + " still exists and no longer computes the idiom in its shader -- both halves are " +
       "exactHash's now, and tools/ship/holoFoil-selfcheck.mjs section 5b holds them to each other cell by cell");
    ok("  ...and every searcher named in the exclusion still exists",
       REC.searchers.every((f) => fs.existsSync(path.join(ENG, f))),
       REC.searchers.join(", "));
}

console.log(fails ? `\nFAIL -- ${fails} check(s)` : "\nALL GREEN");
console.log("unchecked here: the shaders EXECUTING. No GL or WebGPU context is taken -- the GLSL and WGSL are " +
    "held to the JS by their constants and by the spec scanner, and the float32 halves are emulated with " +
    "Math.fround, which is what a GPU does to every operand. tools/ship/swiftShaders-selfcheck.mjs runs the " +
    "same arithmetic on a device for the BCS family; the twins here inherit that evidence rather than repeat " +
    "it. Also unchecked: whether the new noise field LOOKS better, which is not a claim this round makes -- a " +
    "different hash is a different pattern, and the trade is that two halves can now be held to one picture.");
process.exit(fails ? 1 : 0);
