// WebGLEngine/tools/ship/parallaxSampler-selfcheck.mjs -- v4489
//
// Run: node tools/ship/parallaxSampler-selfcheck.mjs
//
// Drives render/parallaxOcclusion.js's GLSL on a real driver against its own JS mirror, twice: once with the
// mirror fed the continuous height field every caller hands it, and once with the mirror fed a simulation of
// the device's sampler. The gap between those two runs is the whole finding.
//
// *** SECTION 3 CONTRADICTS A CLAIM IN ANOTHER GATE'S HEADER, ON PURPOSE AND BY MEASUREMENT. ***
// tools/ship/parallaxOcclusion-selfcheck.mjs promises "more layers -> closer to the reference". True of the
// march. False of the pair against a texture, because the sampler error does not depend on the layer count
// and the step does.
"use strict";

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as P from "../../render/parallaxSampler.mjs";
import { parallaxUVMirror, PARALLAX_GLSL } from "../../render/parallaxOcclusion.js";
import { renderGlslToPixels, webgpuSkipReason } from "./webgpuHarness.mjs";
import { PACK24_GLSL, unpack24Signed, PACK24_FLOOR_SIGNED } from "./glslFloatPack.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const say = (m) => console.log("  ----  " + m);

const N = P.PROBE.render, SZ = P.PROBE.texture, L = P.PROBE.layers, HS = P.PROBE.heightScale;
const H = (tx) => 0.2 + 0.6 * (Math.floor(tx / 2) / ((SZ - 1) / 2));
const RAMP = (tx) => 0.2 + 0.6 * (tx / (SZ - 1));
const unit = (v) => { const l = Math.hypot(v[0], v[1], v[2]); return [v[0] / l, v[1] / l, v[2] / l]; };

// *** THE ATTRIBUTELESS VERTEX SHADER. *** webgpuHarness draws three vertices with an EMPTY vertex array, so a
// vertex shader that reads an attribute returns a black frame with ok:true -- v4284's trap, sprung again at
// v4487. Every device row below asserts distinctColours.
const VS = `#version 300 es
void main(){ vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2)) * 2.0 - 1.0;
  gl_Position = vec4(p, 0.0, 1.0); }`;

const texFor = (h) => {
    const t = [];
    for (let y = 0; y < SZ; y++) for (let x = 0; x < SZ; x++) {
        const b = Math.round(Math.max(0, Math.min(1, h(x, y))) * 255);
        t.push(b, b, b, 255);
    }
    return t;
};
const drive = async (h, vt, comp, layers = L) => {
    const tex = texFor(h);
    return renderGlslToPixels({ vertex: VS, width: N, height: N, srcSize: SZ,
        textures: { uHeightMap: (x, y) => { const i = (y * SZ + x) * 4; return [tex[i], tex[i + 1], tex[i + 2], 255]; } },
        fragment: `#version 300 es
precision highp float;
uniform sampler2D uHeightMap;
out vec4 fragColor;
${PARALLAX_GLSL}
${PACK24_GLSL}
void main(){ vec2 c = floor(gl_FragCoord.xy);
  vec2 uv = (c + 0.5) / ${N}.0;
  vec3 vt = vec3(${vt[0]}, ${vt[1]}, ${vt[2]});
  fragColor = pack24(parallaxUV(uv, vt, ${HS}, ${layers}).${comp} / 2.0 + 0.5); }` });
};
const compare = (gu, gv, sample, vt, layers = L) => {
    let m = 0, past = 0;
    const step = HS * (P.PROBE.viewTangent[0] / P.PROBE.viewTangent[2]) / layers;
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
        const k = (N - 1 - j) * N + i;
        const r = parallaxUVMirror((i + 0.5) / N, (j + 0.5) / N, vt[0], vt[1], vt[2], HS, sample, layers);
        const e = Math.max(Math.abs(unpack24Signed(gu.pixels, k, 1) - r.u),
                           Math.abs(unpack24Signed(gv.pixels, k, 1) - r.v));
        m = Math.max(m, e); if (e > 0.9 * step) past++;
    }
    return { max: m, past, step };
};

const skip = webgpuSkipReason();

// ---- 1. *** THE SIMULATION IS THE DEVICE'S SAMPLER, NOT AN APPROXIMATION OF IT *** ----------------------------
{
    const D = P.DEVICE_SAMPLER;
    const harness = fs.readFileSync(path.join(ENG, "tools", "ship", "webgpuHarness.mjs"), "utf8");
    ok("*** the recorded sampler is the one the harness actually binds, read from its source ***",
        D.filter === "nearest" && D.wrap === "clamp-to-edge" && D.bits === 8 &&
        /MIN_FILTER,\s*gl\.NEAREST/.test(harness) && /WRAP_S,\s*gl\.CLAMP_TO_EDGE/.test(harness) &&
        /UNSIGNED_BYTE/.test(harness),
        "NEAREST, CLAMP_TO_EDGE, UNSIGNED_BYTE -- so the simulation is exact and a bilinear binding would need its own");
    // A simulation nobody can distinguish from the identity is not a simulation.
    const dev = P.deviceSampleHeight(H, SZ), cont = P.continuousSampleHeight(H, SZ);
    let differ = 0, maxD = 0;
    for (let i = 0; i < 64; i++) {
        const u = (i + 0.5) / 64, d = Math.abs(dev(u, 0.5) - cont(u, 0.5));
        if (d > 1e-9) differ++;
        maxD = Math.max(maxD, d);
    }
    ok("!! ...and the two samplers really do differ, so the comparison below is not the same run twice",
        differ > 10 && maxD > 1 / 255,
        `${differ} of 64 probe points differ, worst ${maxD.toExponential(3)} -- more than one 8-bit step`);
    ok("!! ...and the simulated sampler is quantised to 8 bits, which a continuous one is not",
        [0.1, 0.37, 0.62].every((u) => Math.abs(dev(u, 0.5) * 255 - Math.round(dev(u, 0.5) * 255)) < 1e-9),
        "every value it returns is k/255 exactly");
}

// ---- 1b. *** THE SIMULATION IS GRADED AGAINST THE DEVICE'S OWN TEXTURE READ, NOT ONLY THROUGH THE MARCH ***
// A sabotage bent the texel selection from floor() to round() -- half a texel -- and every row still passed,
// because the march averages over a staircase forgiving enough to hide it. So the sampler is now driven ALONE,
// on a field where every texel differs, at coordinates that straddle texel boundaries, which is exactly where
// floor and round part company.
if (skip) { say("SKIPPED, no device: " + skip); }
else {
    console.log("\n1b. THE SAMPLER, ISOLATED FROM THE MARCH");
    // *** THE FIELD AND THE SAMPLE POINTS BOTH HAD TO BE CHOSEN TO SEPARATE THE RULES, AND A FIRST DRAFT
    // *** CHOSE NEITHER. *** A field varying only in x cannot see a flipped row, and sampling at exactly k/16
    // cannot see floor against round, because k/16 * 16 is an integer and both agree there. Two more
    // sabotages passed before this line was written. The field now varies in BOTH axes with every texel
    // distinct, and the sample points sit at 0.7 and 0.3 of a texel, where the two rules part company.
    const PER_TEXEL = (tx, ty) => (tx + ty * SZ + 0.5) / (SZ * SZ);
    const tex = texFor(PER_TEXEL);
    const g = await renderGlslToPixels({ vertex: VS, width: N, height: N, srcSize: SZ,
        textures: { uHeightMap: (x, y) => { const i = (y * SZ + x) * 4; return [tex[i], tex[i + 1], tex[i + 2], 255]; } },
        fragment: `#version 300 es
precision highp float;
uniform sampler2D uHeightMap;
out vec4 fragColor;
${PACK24_GLSL}
void main(){ vec2 c = floor(gl_FragCoord.xy);
  // 0.7 and 0.3 of a texel: floor takes k, round takes k+1 and k, so the two rules give different texels
  vec2 uv = vec2((c.x + 0.7) / ${N}.0, (c.y + 0.3) / ${N}.0);
  fragColor = pack24(texture(uHeightMap, uv).r); }` });
    ok("the isolated read ran and every sample is distinct, so the field can tell two rules apart",
        g.ok === true && g.distinctColours === N * N,
        g.ok ? `distinct ${g.distinctColours} of ${N * N}` : String(g.error).slice(0, 160));
    const sim = P.deviceSampleHeight(PER_TEXEL, SZ);
    let m = 0;
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++)
        m = Math.max(m, Math.abs(unpack24Signed(g.pixels, (N - 1 - j) * N + i, 1) * 0.5 + 0.5 -
                                 sim((i + 0.7) / N, (j + 0.3) / N)));
    ok("*** deviceSampleHeight reproduces the driver's own texture read, texel for texel ***",
        m <= PACK24_FLOOR_SIGNED * 2,
        `${m.toExponential(3)} at 0.7 and 0.3 of a texel, on a field that varies in BOTH axes -- a ` +
        "half-texel rule change or a flipped row moves this by whole texels");
}

// ---- 2. *** THE MARCH IS AN EXACT MIRROR AND THE SAMPLER IS THE WHOLE DISAGREEMENT *** ------------------------
if (skip) { say("SKIPPED, no device: " + skip); }
else {
    console.log("\n2. SAME SHADER, SAME MARCH, TWO SAMPLERS");
    const vt = unit(P.PROBE.viewTangent);
    const gu = await drive(H, vt, "x"), gv = await drive(H, vt, "y");
    ok("the shader ran and the frame is not a dead one",
        gu.ok === true && gu.distinctColours > 1 && gu.unresolved.length === 0,
        gu.ok ? `distinct ${gu.distinctColours}, unresolved ${JSON.stringify(gu.unresolved)}` : String(gu.error).slice(0, 160));

    const cont = compare(gu, gv, P.continuousSampleHeight(H, SZ), vt);
    const dev = compare(gu, gv, P.deviceSampleHeight(H, SZ), vt);
    const S = P.SAMPLER_GAP, floor = PACK24_FLOOR_SIGNED;
    say(`${S.samples} points, ${L} layers, one dUV.x = ${cont.step.toExponential(3)}`);
    ok("*** the mirror fed the CONTINUOUS height disagrees by a thousandth of a UV ***",
        cont.max > floor * 1000 && Math.abs(cont.max - S.continuousHeight) <= S.continuousHeight * 0.5,
        `${cont.max.toExponential(3)} against a transport floor of ${floor.toExponential(3)}`);
    ok("*** and the SAME mirror fed a simulation of the sampler agrees to the floor ***",
        dev.max <= floor * 1.5 && Math.abs(dev.max - S.samplerSimulated) <= S.samplerSimulated * 0.5,
        `${dev.max.toExponential(3)} -- the march is exact; the sampler was the whole disagreement`);
    ok("...and the recorded ratio is what these two runs actually give",
        Math.abs(cont.max / dev.max - S.ratio) <= S.ratio * 0.5,
        `${Math.round(cont.max / dev.max)}x against a recorded ${S.ratio}x`);
    ok("*** and at these settings the two implementations exit the march on DIFFERENT LAYERS ***",
        cont.past === S.pointsPastNineTenthsOfAStep && cont.max > cont.step,
        `${cont.past} of ${S.samples} points land past nine tenths of one step, and the worst is ` +
        `${(cont.max / cont.step).toFixed(2)} steps out -- not a rounding difference, a different answer`);
}

// ---- 3. *** REFINING THE MARCH DOES NOT CONVERGE, WHICH THE OTHER GATE'S HEADER SAYS IT DOES *** --------------
if (skip) { say("SKIPPED, no device: " + skip); }
else {
    console.log("\n3. MORE LAYERS: THE STEP SHRINKS AND THE ERROR DOES NOT");
    const vt = unit(P.PROBE.viewTangent);
    const errs = [], steps = [];
    for (const layers of P.LAYER_SWEEP.layers) {
        const gu = await drive(RAMP, vt, "x", layers), gv = await drive(RAMP, vt, "y", layers);
        const c = compare(gu, gv, P.continuousSampleHeight(RAMP, SZ), vt, layers);
        errs.push(c.max); steps.push(c.step);
    }
    ok("*** the sampler error is the SAME at every layer count -- it is the texel, not the march ***",
        errs.every((e) => Math.abs(e - errs[0]) <= errs[0] * 0.05),
        errs.map((e) => e.toExponential(3)).join(", "));
    ok("...and the step really is shrinking as 1/numLayers, so the comparison is not vacuous",
        steps.every((s, i) => i === 0 || Math.abs(s * 2 - steps[i - 1]) < steps[i - 1] * 0.01),
        steps.map((s) => s.toExponential(3)).join(", "));
    ok("*** so the error is worth MORE steps as the march is refined, not fewer ***",
        errs[errs.length - 1] / steps[steps.length - 1] > errs[0] / steps[0] * 3,
        `${(errs[0] / steps[0]).toFixed(3)} of a step at ${P.LAYER_SWEEP.layers[0]} layers, ` +
        `${(errs[errs.length - 1] / steps[steps.length - 1]).toFixed(3)} at ${P.LAYER_SWEEP.layers[3]}`);
    ok("!! ...and the recorded sweep is what this run measured",
        errs.every((e, i) => Math.abs(e - P.LAYER_SWEEP.maxError[i]) <= P.LAYER_SWEEP.maxError[i] * 0.5) &&
        steps.every((s, i) => Math.abs(s - P.LAYER_SWEEP.oneStep[i]) <= P.LAYER_SWEEP.oneStep[i] * 0.05),
        "errors and steps both re-derived, not quoted");
    ok("*** and the header this contradicts really does say what the record claims it says ***",
        fs.readFileSync(path.join(ENG, P.LAYER_SWEEP.contradictsFile), "utf8")
          .includes(P.LAYER_SWEEP.contradictsQuote),
        "a contradiction of a quote nobody checks is a contradiction of a paraphrase");
}

// ---- 4. *** THE NORMALISE IS A NO-OP, AND THE GUARD IS WHERE THEY ACTUALLY DIVERGE *** ------------------------
if (skip) { say("SKIPPED, no device: " + skip); }
else {
    console.log("\n4. THE GRAZING GUARD");
    const NN = P.NORMALISE_IS_A_NO_OP;
    const raw = P.PROBE.viewTangent;
    const gu = await drive(H, raw, "x"), gv = await drive(H, raw, "y");
    const same = compare(gu, gv, P.deviceSampleHeight(H, SZ), raw);
    ok("*** an UNNORMALISED vector changes nothing: the function only uses the ratio xy/z ***",
        same.max <= PACK24_FLOOR_SIGNED * 1.5 && Math.abs(same.max - NN.awayFromTheGuard) <= NN.awayFromTheGuard * 0.5,
        `${same.max.toExponential(3)} -- the mirror normalises, the shader does not, and it does not matter`);

    // ...until z falls under the clamp, where the mirror guards a NORMALISED z and the shader a RAW one.
    const G = NN.atGrazing, gz = [raw[0], raw[1], G.viewTangentZ];
    const gu2 = await drive(H, gz, "x"), gv2 = await drive(H, gz, "y");
    const grazeRaw = compare(gu2, gv2, P.deviceSampleHeight(H, SZ), gz);
    const grazeUnit = compare(gu2, gv2, P.deviceSampleHeight(H, SZ), unit(gz));
    ok("*** and under the guard they diverge by SEVEN HUNDRED UV UNITS, in a coordinate that runs 0 to 1 ***",
        grazeRaw.max > 100 && Math.abs(grazeRaw.max - G.divergence) <= G.divergence * 0.5,
        `${grazeRaw.max.toExponential(3)} at viewTangent.z = ${G.viewTangentZ}, guard ${NN.guardedZ}`);
    ok("!! ...and normalising the mirror's input does not rescue it, which is what makes this the GUARD",
        grazeUnit.max > 100,
        `${grazeUnit.max.toExponential(3)} -- below the clamp the function is no longer scale-invariant, ` +
        "so neither call matches; away from the clamp both did");
    // *** DERIVED FROM THAT GATE'S OWN CALLS, NOT FROM A KEYWORD. *** A first draft asserted the file does not
    // contain "1e-4" and went red, because the gate's own reference march writes max(vz, 1e-4) -- it MENTIONS
    // the guard on every line and reaches it on none.
    const other = fs.readFileSync(path.join(ENG, "tools", "ship", "parallaxOcclusion-selfcheck.mjs"), "utf8");
    const zs = [...other.matchAll(/parallaxUVMirror\(\s*[^,]+,\s*[^,]+,\s*[^,]+,\s*[^,]+,\s*([-\d.e]+)\s*,/g)]
        .map((m) => Number(m[1])).filter((n) => Number.isFinite(n));
    ok("!! ...and the existing gate has never pointed the ray along the surface",
        G.testedByTheExistingGate === false && zs.length >= 4 && zs.every((z) => z > NN.guardedZ * 1000) &&
        zs.join() === NN.existingGateViewZ.join(),
        `the view-z values it drives are ${zs.join(", ")} -- every one thousands of times the ${NN.guardedZ} guard`);
}

// ---- 5. *** WHAT WAS MEASURED AND WHAT WAS DELIBERATELY NOT CHANGED *** ---------------------------------------
{
    const M = P.MEASURED_AT_V4489;
    const src = fs.readFileSync(path.join(ENG, "render", "parallaxOcclusion.js"), "utf8");
    ok("*** no shipping behaviour was edited this round, and the gate says so by checking ***",
        M.shippingChangesMade === 0 && /normalize|Math\.hypot/.test(src) && /max\(viewTangent\.z, 1e-4\)/.test(src),
        "the mirror still normalises and both sides still guard at 1e-4 -- three open calls, listed, not taken");
    ok("...and each open question is stated rather than left implied",
        M.stillOpen.length === 3 && M.stillOpen.every((q) => q.startsWith("should")),
        M.stillOpen.join(" | "));
    ok("*** and the stale claim this round corrected is the one it actually disproved ***",
        /USED TO SAY|used to say/.test(fs.readFileSync(path.join(ENG, "tools", "ship", "parallaxOcclusion-selfcheck.mjs"), "utf8")) &&
        M.claimCorrected === "tools/ship/parallaxOcclusion-selfcheck.mjs",
        "the shader ran here, so the sentence saying it cannot is corrected and the old wording kept");
}

console.log("\nparallaxSampler-selfcheck: " + (fails ? fails + " FAILED" : "all pass"));
process.exit(fails ? 1 : 0);
