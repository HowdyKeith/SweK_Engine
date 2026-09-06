// WebGLEngine/tools/ship/hdrCost-selfcheck.mjs -- v4481
//
// Run: node tools/ship/hdrCost-selfcheck.mjs
//
// Grades render/hdrCost.mjs -- the measurement that decided whether an HDR texture format is a fix or a
// decoration -- and the two wirings it produced in render/bloomPass.js and main.js.
//
// *** THIS GATE DOES NOT READ THE NUMBERS BACK, IT RE-DERIVES THEM. *** MEASURED_AT_V4481 could be any six
// floats if all a check did was assert they equal themselves. Section 3 runs both probes through the module's
// own operators and compares the results element by element, so a wrong number in the freeze fails here and a
// broken operator fails here, and the two cannot cover for each other.
//
// *** AND SECTION 1 IS THE ONE THAT MATTERS MOST. *** Every constant in SHIPPED is a SECOND COPY of one living
// in render/bloomPass.js or render/voxelrenderer.js. A model of a pass that silently drifts from the pass is
// worse than no model at all -- it is a confident wrong answer. So the blur weights, the luma vector, the soft
// threshold width, the threshold, the intensity, the exposure, the five ACES coefficients, the emissive gate and
// the emissive boost are all parsed out of the shipping sources and held against the copy.
//
// *** SECTION 5 CALLS THE GETTER RATHER THAN GREPPING FOR IT. *** v4480's finding, in this tree's words: an
// assertion about where text sits is satisfied by a branch that is present and dead. bloomPass.hdrEnabled is
// invoked here with a stub `this` on both branches, so a getter wrapped in dead code or hard-wired to one answer
// goes red.
"use strict";

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as H from "../../render/hdrCost.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (...p) => fs.readFileSync(path.join(ENG, ...p), "utf8");
let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const say = (m) => console.log("  ----  " + m);
const M = H.MEASURED_AT_V4481;
const near = (a, b, e = 1e-4) => Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= e;
// *** THE FIRST DRAFT OF THIS STRIPPER ALSO REMOVED /* ... */ BLOCKS, AND THAT WAS ITSELF A DEFECT. *** On a
// file the size of main.js a non-greedy block match starts at an unrelated "/*" inside a string or a regex and
// runs to the next "*/", swallowing thousands of lines of real code -- it turned two unrelated rows red. Only
// LINE comments are stripped here, because line comments are the only place this gate's quotations live.
const stripLineComments = (t) => t.replace(/^\s*\/\/.*$/gm, " ");
const BLOOM = read("render", "bloomPass.js");
const VOX = read("render", "voxelrenderer.js");

// ---- 1. *** THE MODEL IS THE SHIPPED ARITHMETIC, PARSED OUT OF THE SHIPPING FILES *** -------------------------
{
    const one = (src, re, what) => { const m = src.match(re); if (!m) return { miss: what }; return { v: Number(m[1]) }; };
    const missing = [];
    const grab = (src, re, what) => { const r = one(src, re, what); if (r.miss) { missing.push(what); return NaN; } return r.v; };

    const W = [0, 1, 2, 3, 4].map((i) => grab(BLOOM, new RegExp(`const float W${i} = ([0-9.]+);`), `W${i}`));
    ok("the nine-tap blur weights in SHIPPED are the ones BLUR_FS uses",
        W.every((w, i) => near(w, H.SHIPPED.blurWeights[i], 1e-9)) && missing.length === 0,
        `W0..W4 = ${W.join(", ")} parsed from render/bloomPass.js`);

    const lumaOk = new RegExp(`dot\\(c, vec3\\(${H.SHIPPED.luma.map((v) => v.toFixed(3)).join(", ")}\\)\\)`).test(BLOOM);
    ok("the luma vector in SHIPPED is the one BRIGHT_FS dots against",
        lumaOk, `vec3(${H.SHIPPED.luma.join(", ")})`);

    const soft = grab(BLOOM, /smoothstep\(uThreshold, uThreshold \+ ([0-9.]+), lum\)/, "softWidth");
    const thr = grab(BLOOM, /this\.threshold = ([0-9.]+);/, "threshold");
    const inten = grab(BLOOM, /this\.intensity = ([0-9.]+);/, "intensity");
    const expo = grab(BLOOM, /this\.exposure = ([0-9.]+);/, "exposure");
    ok("soft-threshold width, threshold, intensity and exposure all match the shipping defaults",
        near(soft, H.SHIPPED.softWidth, 1e-9) && near(thr, H.SHIPPED.threshold, 1e-9) &&
        near(inten, H.SHIPPED.intensity, 1e-9) && near(expo, H.SHIPPED.exposure, 1e-9),
        `soft=${soft} threshold=${thr} intensity=${inten} exposure=${expo}`);

    // The ACES coefficients, taken from inside aces() so a `const float a` elsewhere in the file cannot answer.
    const body = (BLOOM.match(/vec3 aces\(vec3 x\) \{([\s\S]*?)\n\}/) || [])[1] || "";
    const A = {};
    for (const k of ["a", "b", "c", "d", "e"]) A[k] = grab(body, new RegExp(`const float ${k} = ([0-9.]+);`), `aces.${k}`);
    ok("the five ACES coefficients come out of COMPOSITE_FS's own aces() body, not from anywhere else in the file",
        body.length > 0 && ["a", "b", "c", "d", "e"].every((k) => near(A[k], H.SHIPPED.aces[k], 1e-9)),
        `a=${A.a} b=${A.b} c=${A.c} d=${A.d} e=${A.e}`);

    const g = VOX.match(/float emissive = smoothstep\(([0-9.]+),\s*([0-9.]+), maxC\);/);
    const boost = grab(VOX, /this\.emissiveBoost \?\? ([0-9.]+)/, "emissiveBoost");
    ok("the emissive gate and boost in SHIPPED are the ones render/voxelrenderer.js uses",
        !!g && near(+g[1], H.SHIPPED.emissiveGate[0], 1e-9) && near(+g[2], H.SHIPPED.emissiveGate[1], 1e-9) &&
        near(boost, H.SHIPPED.emissiveBoost, 1e-9),
        g ? `smoothstep(${g[1]}, ${g[2]}, maxC), boost ${boost}` : "gate not found in voxelrenderer.js");
    if (missing.length) say("could not parse: " + missing.join(", "));
}

// ---- 2. THE STORAGE FORMATS ACTUALLY BEHAVE LIKE THE TARGETS THEY MODEL ---------------------------------------
{
    ok("f16 is exact where binary16 is exact and lossy where it is not",
        H.f16(1) === 1 && H.f16(4) === 4 && H.f16(0.5) === 0.5 &&
        H.f16(0.1) !== 0.1 && near(H.f16(0.1), 0.1, 1e-4),
        `f16(0.1) = ${H.f16(0.1)}`);
    ok("f16 keeps the whole range the bloom chain uses, and overflows only past its own maximum",
        H.f16(H.F16_MAX) === H.F16_MAX && H.f16(H.F16_MAX * 2) === Infinity && H.F16_MAX === 65504,
        "an rgba16float target stores Infinity above 65504, which is a defect of its own and far above any peak here");
    ok("*** unorm8 CLAMPS AS WELL AS QUANTISES, AND THE CLAMP IS THE EXPENSIVE HALF ***",
        H.unorm8(2) === 1 && H.unorm8(16) === 1 && H.unorm8(-1) === 0 &&
        H.unorm8(0.5) === 128 / 255 && H.unorm8(1 / 512) === 0,
        "unorm8(2) and unorm8(16) are the same number, which is the whole finding in one line");
    let threw = false;
    try { H.bloomChain(H.greyRamp(4, 1), "rgba32float"); } catch { threw = true; }
    ok("an unknown format name is REFUSED rather than silently treated as float",
        threw && Object.keys(H.FORMATS).length === 3,
        "a typo'd format that quietly ran at full precision would report no cost at all");
}

// ---- 3. *** THE MEASUREMENT, RE-DERIVED FROM THE OPERATORS RATHER THAN READ BACK *** ---------------------------
{
    const N = H.PROBE.n;
    const halo = (fmt) => H.PROBE.peaks.map((p) => +H.haloMean(H.bloomChain(H.emissiveDisc(N, p), fmt).out, N).toFixed(4));
    const hf = halo("float"), hh = halo("f16"), hu = halo("unorm8");
    say(`peaks   ${H.PROBE.peaks.map((p) => String(p).padStart(8)).join("")}`);
    for (const [n, r] of [["float ", hf], ["f16   ", hh], ["unorm8", hu]])
        say(`${n}  ${r.map((v) => v.toFixed(2).padStart(8)).join("")}`);

    ok("the frozen halo numbers are what the operators produce, at all three formats",
        hf.every((v, i) => near(v, M.haloFloat[i], 5e-4)) &&
        hh.every((v, i) => near(v, M.haloF16[i], 5e-4)) &&
        hu.every((v, i) => near(v, M.haloUnorm8[i], 5e-4)),
        "18 values re-derived; a wrong freeze and a broken operator both fail here");

    // The finding, computed from THIS run rather than taken from the freeze.
    const at = H.PROBE.peaks.indexOf(M.unorm8SaturatesAtPeak);
    const above = hu.slice(at);
    const distinct = new Set(above).size;
    ok("!! *** THE 8-BIT CHAIN GIVES ONE HALO FOR EVERY PEAK FROM 2.0 UP -- ITS HDR RANGE IS 1.0:1 ***",
        at > 0 && above.length >= 4 && distinct === 1 && distinct === M.unorm8DistinctHalosAbovePeak1 &&
        near(above[0], M.unorm8SaturatedHalo, 5e-4) &&
        new Set(hf.slice(at)).size === above.length,
        `peaks ${H.PROBE.peaks.slice(at).join(", ")} all give ${above[0]} on 8 bits, against ` +
        `${hf.slice(at).map((v) => v.toFixed(1)).join(", ")} on float. A 2x sun and a 16x sun are the same picture`);

    const worst = Math.max(...hf.map((v, i) => v - hu[i]));
    ok("...and the worst loss is the largest highlight, not the smallest",
        near(worst, M.worstHaloLossLevels, 5e-3) && worst === hf[hf.length - 1] - hu[hu.length - 1],
        `${worst.toFixed(2)} output levels lost at peak ${H.PROBE.peaks[H.PROBE.peaks.length - 1]}, of ${hf[hf.length - 1].toFixed(2)}`);

    const f16err = Math.max(...hf.map((v, i) => Math.abs(v - hh[i])));
    ok("!! HALF FLOAT IS ENOUGH -- rgba16float tracks the reference to under one hundredth of an output level",
        near(f16err, M.f16WorstHaloErrorLevels, 5e-4) && f16err < 0.01,
        `worst |f16 - float| = ${f16err.toFixed(4)} levels. Nothing here asks for rgba32float, which is twice ` +
        "the bandwidth for a difference no 8-bit display can show");

    // Banding, on a signal that never leaves 0..1.
    let maxLoss = 0, worstRms = 0, worstTop = null;
    for (const top of H.PROBE.rampTops) {
        const sc = H.greyRamp(N, top);
        const row = (im) => Array.from({ length: N }, (_, x) => Math.round(H.px(im, x, N >> 1, 0) * 255));
        const a = row(H.bloomChain(sc, "float").out), b = row(H.bloomChain(sc, "unorm8").out);
        const md = Math.max(...a.map((v, i) => Math.abs(v - b[i])));
        const rms = Math.sqrt(a.reduce((s, v, i) => s + (v - b[i]) ** 2, 0) / N);
        say(`ramp top=${top}: max ${md} LSB, rms ${rms.toFixed(3)} LSB`);
        maxLoss = Math.max(maxLoss, md);
        if (rms > worstRms) { worstRms = rms; worstTop = top; }
    }
    ok("!! BANDING IS NOT THE COST -- four extra 8-bit stores of an in-range signal move the picture by 1 LSB",
        maxLoss === M.rampMaxLossLsb && maxLoss <= 1 && near(worstRms, M.rampRmsLossLsb, 5e-3) &&
        worstTop === M.rampWorstTop,
        `worst ${maxLoss} LSB, rms ${worstRms.toFixed(3)}, at top=${worstTop}. The last quantisation dominates the ` +
        "four before it, which is why the guess that banding was the problem was wrong");

    // Where the clip happens.
    const sf = H.bloomChain(H.emissiveDisc(N, 4), "float").stageMax;
    const su = H.bloomChain(H.emissiveDisc(N, 4), "unorm8").stageMax;
    say(`peak 4.0 stage maxima -- float: ${Object.entries(sf).map(([k, v]) => `${k} ${v.toFixed(4)}`).join(", ")}`);
    say(`peak 4.0 stage maxima -- 8bit : ${Object.entries(su).map(([k, v]) => `${k} ${v.toFixed(4)}`).join(", ")}`);
    ok("!! THE CLIP IS AT THE FIRST STORE, NOT IN THE BLUR -- promoting the blur targets alone would buy nothing",
        ["scene", "bright", "blurH", "blurV"].every((k) => near(sf[k], M.stageMaxFloatAt4[k], 5e-4) && near(su[k], M.stageMaxUnorm8At4[k], 5e-4)) &&
        su.scene === 1 && sf.scene === 4,
        "the scene target already reads 1.0 where the float chain reads 4.0; by the second blur the highlight " +
        "is long gone and no downstream format can bring it back");
}

// ---- 4. THE CONSUMER: SIX OF TWELVE PALETTE ENTRIES EXCEED 1.0, SO THIS IS A FIX AND NOT A DECORATION ---------
{
    const pal = [];
    const PAL = read("world", "chunkMesherCore.js");
    for (const m of PAL.matchAll(/p\[(\d+)\]\s*=\s*\[([0-9.]+),\s*([0-9.]+),\s*([0-9.]+)\];\s*\/\/\s*(.*)$/gm))
        pal.push({ id: +m[1], rgb: [+m[2], +m[3], +m[4]], name: m[5].trim().split(/\s*[—-]\s*/)[0].trim(), note: m[5].trim() });
    const c = H.paletteHeadroom(pal);
    for (const r of c.rows)
        say(`${r.name.padEnd(15)} maxC ${r.maxC.toFixed(2)}  x${r.mul.toFixed(3)}  peak ${r.peak.toFixed(3)}${r.overOne ? "   OVER 1.0" : ""}`);

    ok("!! #133's rule is satisfied: the consumer is real and it is half the palette",
        c.total === M.paletteEntries && c.overOne === M.paletteOverOne && c.overOne * 2 === c.total &&
        near(c.peak, M.palettePeak, 1e-9),
        `${c.overOne} of ${c.total} entries land above 1.0 after the boost, peaking at ${c.peak}. Measuring ` +
        "before building was the task's instruction, and the measurement says build it");

    const named = pal.filter((p) => /emissive/i.test(p.note));
    const mem = c.rows.find((r) => r.name === "MEMORY");
    ok("!! *** #144's FAMILY, FOURTH ENTRY: THE PALETTE SAYS EMISSIVE AND THE SHADER MEANS SATURATED ***",
        named.length === M.paletteSaysEmissive && !!mem &&
        near(mem.maxC, M.memoryMaxChannel, 1e-9) && mem.mul === M.memoryBoost && mem.mul === 1 &&
        near(mem.maxC, H.SHIPPED.emissiveGate[0], 1e-9),
        `the palette labels ${named.map((p) => p.name.split(/\s*[—-]\s*/)[0].trim()).join(" and ")} emissive; MEMORY's max channel is ` +
        `${mem ? mem.maxC : "?"}, EXACTLY the smoothstep's lower edge, so its multiplier is ${mem ? mem.mul : "?"}. ` +
        "The one thing named emissive in the data is the one thing the shader does not boost");

    const boostedUnnamed = c.rows.filter((r) => r.mul > 1 && !/emissive/i.test((pal.find((p) => p.name === r.name) || {}).note || "")).map((r) => r.name);
    ok("...and the five it DOES boost emit nothing at all -- the gate is a saturation test wearing the word",
        boostedUnnamed.length === M.boostedWithoutBeingNamed.length &&
        M.boostedWithoutBeingNamed.every((n) => boostedUnnamed.includes(n)),
        boostedUnnamed.join(", ") + " are boosted 2.0x to 2.5x because their max channel is high, which is " +
        "saturation and not emission. A grep for emissive adoption reads the opposite of the truth");
}

// ---- 5. *** THE TWO WIRINGS, ONE CALLED AND ONE READ *** ------------------------------------------------------
{
    const mod = await import("../../render/bloomPass.js");
    const d = Object.getOwnPropertyDescriptor(mod.BloomPass.prototype, "hdrEnabled");
    const got = d && typeof d.get === "function"
        ? { on: d.get.call({ _hdrEnabled: true }), off: d.get.call({ _hdrEnabled: false }), unset: d.get.call({}) }
        : null;
    ok("!! bloomPass.hdrEnabled is a getter that is CALLED here, on both branches -- dead code cannot survive it",
        !!got && got.on === true && got.off === false && got.unset === false,
        got ? `hdrEnabled reads ${got.on} / ${got.off} / ${got.unset} for true / false / never-set` : "no getter on the prototype");
    ok("...and the flag it exposes had two writes and zero readers before this round",
        M.hdrEnabledWritesBefore === 2 && M.hdrEnabledReadsBefore === 0 &&
        (BLOOM.match(/this\._hdrEnabled = /g) || []).length === 2,
        "a field written on both branches of the decision that matters, with nothing anywhere able to ask -- " +
        "the second-declaration defect this same file already produced once, at v4288");

    // *** AND THIS ROW WENT ZERO-RED, FOR THE THIRD TIME IN ONE ROUND, FOR THE SAME REASON. *** The sabotage
    // that removed main.js's reader left the COMMENT above it -- which names bloomPass.hdrEnabled to explain the
    // reader -- and a grep of raw source cannot tell the two apart. commentFalsePass's rule is not a habit that
    // can be remembered; it has to be applied every time an assertion about code meets a file that has prose in
    // it, which is every file in this tree.
    const MAIN_RAW = read("main.js");
    const MAIN = stripLineComments(MAIN_RAW);
    ok("!! ...and the getter has a REAL reader outside its own gate, in main.js CODE and not in its comments",
        /bloomPass\.hdrEnabled/.test(MAIN),
        "a reader that only the check uses is still a field nobody reads, and a reader that is only a comment " +
        "is not a reader at all");

    // The warning must carry the measured number, driven from the freeze rather than from a typed string.
    const sat = String(M.unorm8SaturatedHalo);
    const warn = (BLOOM.match(/console\.warn\("\[BloomPass\][\s\S]{0,900}?\);/) || [""])[0];
    // *** commentFalsePass's RULE, APPLIED TO MY OWN CHECK. *** The first draft asserted the old phrase was gone
    // from render/bloomPass.js and went red -- because the comment I wrote ABOVE the new warning QUOTES the old
    // phrase to explain why it left. An assertion about code, made against raw source, is answered by prose.
    const code = stripLineComments(BLOOM);
    ok("!! the fallback warning states the measurement instead of the adjective it used to state",
        warn.includes(sat.slice(0, 4)) && /hdrCost/.test(warn) && !/bloom will be weaker/.test(code),
        `"bloom will be weaker" is not a measurement; the warning now names ${sat.slice(0, 4)} output levels ` +
        "for every source above 1.0, and points at the file that derived it");

    ok("!! and main.js's glow hint no longer claims a boost memory blocks do not get",
        /Emissive boost for lava/.test(MAIN_RAW) && !/Emissive boost for lava \(and memory blocks\)/.test(MAIN_RAW) &&
        /NOT memory/.test(MAIN_RAW),
        "the hint said \"(and memory blocks)\" for as long as the knob has existed, and the shader gives them 1.0x");
}

console.log("hdrCost-selfcheck: " + (fails ? fails + " FAILED" : "all pass"));
process.exit(fails ? 1 : 0);
