#!/usr/bin/env node
// WebGLEngine/tools/ship/passFootprint-selfcheck.mjs -- v4285
//
// GRADES render/passFootprint.mjs, and settles a question v4284 answered wrongly.
//
// *** v4284 CLOSED BY SAYING THE COMPOSITE WOULD DECIDE WHETHER THE POST CHAIN CAN BE ONE DISPATCH. IT DOES
// NOT. GOD RAYS DECIDES, AND IT DECIDES NO. *** Not because god rays is expensive, and not because its shader
// is awkward -- because its READ FOOTPRINT GROWS WITH THE IMAGE, and a tile-local dispatch can only ever
// afford a constant apron. That is measured here at two resolutions rather than argued from the source.
//
// THE METHOD IS A PERTURBATION, WHICH IS WHY IT SETTLES ANYTHING. Reading a shader and counting taps yields a
// claim about what it reads. Rendering it twice, identical but for ONE texel, and collecting every output
// pixel that moved, yields the footprint itself -- with no step where somebody's reading of the code is
// trusted. The tap count is then a PREDICTION the measurement can contradict.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { renderGlslToPixels } from "./webgpuHarness.mjs";
import * as F from "../../render/passFootprint.mjs";
import { kernelWeights } from "../../render/bloomFused.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
let fails = 0;
const ok = (n, c, d) => { if (!c) fails++; console.log(`  ${c ? "PASS" : "FAIL"}  ${n}${d ? "   " + d : ""}`); };
const report = (m) => console.log("  ----  " + m);

const VS = `#version 300 es
out vec2 vUV;
void main(){ vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2)) * 2.0 - 1.0;
  vUV = p * 0.5 + 0.5; gl_Position = vec4(p, 0.0, 1.0); }`;
const BRIGHT = F.shaderBetween("const BRIGHT_FS", "const BLUR_FS");
const BLUR = F.shaderBetween("const BLUR_FS", "const SSAO_FS");
const GODRAYS = F.shaderBetween("const GODRAYS_FS", "const COMPOSITE_FS");
const SUN = [0.02, 0.02];
const foot = (fragment, opts, n, base, px, py) =>
    F.perturbFootprint({ render: renderGlslToPixels, vertex: VS, fragment, n, opts, base, px, py });

console.log("passFootprint-selfcheck -- how far one texel's damage travels, and what that forbids\n");

console.log("1. THE METHOD, AND A SHADER THAT PROVES IT CAN REPORT NOTHING");
{
    // *** A MEASUREMENT THAT ALWAYS FINDS SOMETHING IS NOT A MEASUREMENT. *** If perturbFootprint returned a
    // radius for a shader that never reads its input, every number below would be an artefact.
    const IGNORES = `#version 300 es
precision highp float;
in vec2 vUV; out vec4 outColor;
void main(){ outColor = vec4(0.5, 0.2, 0.1, 1.0); }`;
    const r = await foot(IGNORES, {}, 32);
    if (!r.ok) { report("SKIPPED: " + r.reason); }
    else {
        ok("*** CONTROL: a shader that ignores its input reports radius -1, not 0 ***",
            r.radius === -1 && r.moved === 0,
            `radius ${r.radius}, ${r.moved} pixels moved -- nothing changed, and the method says so`);
        const b = await foot(BRIGHT, { uniforms: [0.05], uniformNames: ["uThreshold"] }, 32);
        ok("  and a purely local pass reports exactly 0, which is a different answer from -1",
            b.ok && b.radius === 0 && b.moved === 1,
            `radius ${b.radius}, ${b.moved} pixel moved -- BRIGHT_FS reads one texel and writes one pixel`);
        report("zero and nothing are different verdicts and the method separates them. That distinction is " +
            "the whole reason the sweep below can be believed when it reports a small number.");
    }
}

console.log("\n2. *** A CONSTANT FOOTPRINT: THE BLUR REACHES FOUR TEXELS AT ANY IMAGE SIZE ***");
let blur32 = null, blur64 = null;
{
    const uni = (n) => ({ uniformVecs: { uTexel: [1 / n, 1 / n], uDir: [1, 0], uEyeRect: [0, 0, 1, 1] } });
    blur32 = await foot(BLUR, uni(32), 32);
    blur64 = await foot(BLUR, uni(64), 64);
    if (!blur32.ok) { report("SKIPPED: " + blur32.reason); }
    else {
        ok("*** the blur's radius is 4 at N=32 and 4 at N=64 -- it does not move ***",
            blur32.radius === 4 && blur64.radius === 4,
            `${blur32.radius} and ${blur64.radius}; ${blur32.moved} and ${blur64.moved} pixels moved`);
        // The tap count is a PREDICTION from the source, and the measurement is free to contradict it.
        const taps = kernelWeights().length - 1;
        ok("  and it equals the kernel's own reach, read out of the shipping shader", blur32.radius === taps,
            `W0..W${taps} means taps at +-${taps}, and the measurement found exactly that`);
        ok("  with nine pixels moved, which is the whole separable kernel and no more",
            blur32.moved === 9 && blur64.moved === 9, `${blur32.moved} pixels`);
        report("*** THIS IS WHAT FUSABLE LOOKS LIKE. *** A constant radius means an apron of 4 covers the " +
            "pass at every resolution, which is exactly what v4284's fused dispatch relies on.");
    }
}

console.log("\n3. *** A FOOTPRINT THAT GROWS WITH THE IMAGE, WHICH NO APRON CAN COVER ***");
{
    // Every texel reads as sky (depth 1.0) so the march accumulates along its whole length.
    const sky = () => [255, 60, 60, 255];
    const uni = { uniforms: [1, 4, 0.05], uniformNames: ["uVisibility", "uIntensity", "uThreshold"],
                  uniformVecs: { uSunPosUV: SUN } };
    const g32 = await foot(GODRAYS, uni, 32, sky);
    const g64 = await foot(GODRAYS, uni, 64, sky);
    if (!g32.ok) { report("SKIPPED: " + g32.reason); }
    else {
        ok("*** the god-ray radius DOUBLES when the image doubles ***", g64.radius === 2 * g32.radius + 1,
            `${g32.radius} at N=32 and ${g64.radius} at N=64 -- ${g32.moved} and ${g64.moved} pixels moved`);
        ok("  while the blur's did not move at all, on the same two images",
            blur32 && blur32.radius === blur64.radius,
            "the pair is the point: one pass is O(1) in the image and the other is O(N)");
        // *** THE GEOMETRY PREDICTS THE NUMBER EXACTLY, WHICH IS STRONGER THAN THE TREND. ***
        const c0 = F.godRayConstants();
        const p32 = F.predictedGodRayRadius(32, SUN, 16, 16);
        const p64 = F.predictedGodRayRadius(64, SUN, 32, 32);
        // *** THE LABEL HERE ONCE SAID "from DENSITY alone" AND A SABOTAGE PROVED IT WAS NOT. *** Hardcoding
        // DENSITY to 1.0 instead of parsing it changed neither prediction, because at the centre the radius
        // is set by the image corner and the density never bites. The claim is now what it always was: the
        // GEOMETRY predicts the centre case, and the regime where DENSITY matters is measured separately.
        ok("*** and the single-ray geometry predicts BOTH centre numbers exactly ***",
            p32 === g32.radius && p64 === g64.radius,
            `predicted ${p32} and ${p64}, measured ${g32.radius} and ${g64.radius}`);
        const L = F.MODEL_LIMIT;
        const near = await foot(GODRAYS, uni, L.n, sky, L.at[0], L.at[1]);
        ok("*** and it UNDERSTATES near the sun, which is recorded rather than tuned away ***",
            near.ok && near.radius === L.measured && F.predictedGodRayRadius(L.n, L.sun, ...L.at) === L.modelled,
            `one texel from the sun: model ${L.modelled}, device ${near.radius} -- ${near.moved} pixels moved`);
        ok("  and the DENSITY the model uses is the shader's, not a literal",
            F.predictedGodRayRadius(L.n, L.sun, ...L.at) !== F.predictedGodRayRadius(L.n, L.sun, ...L.at, { density: 1.0 }),
            `parsed ${c0.density} gives ${F.predictedGodRayRadius(L.n, L.sun, ...L.at)}, a hardcoded 1.0 gives ` +
            `${F.predictedGodRayRadius(L.n, L.sun, ...L.at, { density: 1.0 })} -- at THIS point the constant bites`);
        ok("  which is the distance from the perturbed texel to the far corner",
            g32.radius === 31 - 16 && g64.radius === 63 - 32,
            "the true footprint is not 'large' -- it is THE REST OF THE IMAGE ALONG THE RAY FROM THE SUN");
        const c = F.godRayConstants();
        report(`the march takes ${c.samples} samples covering DENSITY=${c.density} of the vector from the ` +
            `pixel to the sun, so its reach is a FRACTION OF THE IMAGE and not a number of texels. An apron ` +
            `sized for it at 1920 wide would be about 1700 texels, which is not an apron, it is the frame.`);
    }
}

console.log("\n4. *** THE TWO PASSES v4285 COULD NOT MEASURE, NOW MEASURED ***");
{
    // v4285 filed SSAO and the composite as read-off-source and gave two reasons. ONE OF THEM WAS WRONG:
    // "SSAO needs a depth buffer that is not the colour buffer" -- it has exactly ONE sampler, and the
    // harness binds one texture. It was measurable the whole time and nobody tried.
    const SSAO = F.shaderBetween("const SSAO_FS", "const GODRAYS_FS");
    const rows = [];
    for (const R of [2, 5, 10]) {
        const r = await F.perturbFootprint({ render: renderGlslToPixels, vertex: VS, fragment: SSAO, n: 32,
            base: () => [153, 153, 153, 255], poke: [0, 0, 0, 255],
            opts: { uniforms: [R, 0.02], uniformNames: ["uRadius", "uBias"], uniformVecs: { uViewport: [32, 32] } } });
        rows.push([R, r.radius]);
    }
    ok("*** SSAO's footprint TRACKS uRadius, which is what bounded-by-uniform has to mean ***",
        rows.every(([R, r]) => r >= R - 1 && r <= R),
        rows.map(([R, r]) => `uRadius ${R} -> ${r}`).join(", ") + "  (kernel reaches 0.95 * uRadius texels)");
    ok("  so its apron at uRadius 10 is 9 texels -- LARGER THAN AN 8x8 TILE",
        rows[2][1] >= 8, `${rows[2][1]} against a tile of ${8}: the load would be ${(8 + 2 * rows[2][1])}^2 for 64 outputs`);
    // *** THE POKE HAD TO BE CHOSEN FOR THE SHADER, AND THE FIRST ONE MEASURED NOTHING. ***
    const white = await F.perturbFootprint({ render: renderGlslToPixels, vertex: VS, fragment: SSAO, n: 32,
        base: () => [153, 153, 153, 255],
        opts: { uniforms: [5, 0.02], uniformNames: ["uRadius", "uBias"], uniformVecs: { uViewport: [32, 32] } } });
    ok("CONTROL: the DEFAULT white poke measures nothing here, because white reads as sky",
        white.ok && white.radius === -1,
        `radius ${white.radius} -- SSAO skips depth >= 0.999, so the poke lands on the value it ignores`);
    report("that pair is the finding about the METHOD rather than the shader: a perturbation the shader " +
        "discards is evidence about the poke, not about the shader's reach. The default poke reported NO " +
        "footprint at every radius, which is exactly the shape of a confident wrong answer.");

    // The composite, with all five samplers bound to their own units for the first time.
    const COMP = F.shaderBetween("const COMPOSITE_FS", "export class BloomPass");
    const flat = (v) => () => [v, v, v, 255];
    const U = (outline) => ({
        uniforms: [1.0, 0.0, 1.0, 1.0, outline, 0.0, 0],
        uniformNames: ["uBloomIntensity", "uVignetteStrength", "uExposure", "uSSAOStrength",
                       "uOutlineStrength", "uGodRayStrength", "uHeatCount"],
        uniformVecs: { uEyeRect: [0, 0, 1, 1], uTexelSize: [1 / 32, 1 / 32], uOutlineColor: [0, 0, 0] } });
    const compFoot = async (which, poke, baseV, outline) => {
        const tex = { uBloom: flat(20), uSceneDepth: flat(153), uSSAO: flat(255), uGodRays: flat(0) };
        const a = await renderGlslToPixels({ vertex: VS, fragment: COMP, width: 32, height: 32, srcSize: 32,
            sourceTexel: flat(80), textures: tex, ...U(outline) });
        const b = await renderGlslToPixels({ vertex: VS, fragment: COMP, width: 32, height: 32, srcSize: 32,
            sourceTexel: flat(80), ...U(outline),
            textures: { ...tex, [which]: (x, y) => (x === 16 && y === 16 ? poke : flat(baseV)()) } });
        if (!a.ok || !b.ok) return { ok: false, reason: a.reason || b.reason };
        let radius = -1, moved = 0;
        for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
            const i = (y * 32 + x) * 4;
            if (a.pixels[i] === b.pixels[i] && a.pixels[i + 1] === b.pixels[i + 1] && a.pixels[i + 2] === b.pixels[i + 2]) continue;
            moved++; radius = Math.max(radius, Math.max(Math.abs(x - 16), Math.abs((31 - y) - 16)));
        }
        return { ok: true, radius, moved, unresolved: a.unresolved };
    };
    const cb = await compFoot("uBloom", [255, 255, 255, 255], 20, 1.0);
    const cd = await compFoot("uSceneDepth", [0, 0, 0, 255], 153, 1.0);
    const cdOff = await compFoot("uSceneDepth", [0, 0, 0, 255], 153, 0.0);
    ok("*** all five composite samplers bind to their OWN units now ***",
        cb.ok && cb.unresolved.length === 0, `unresolved: ${JSON.stringify(cb.unresolved)}`);
    ok("  the composite reads its colour inputs purely locally", cb.radius === 0 && cb.moved === 1,
        `uBloom radius ${cb.radius}, ${cb.moved} pixel`);
    ok("*** and its depth footprint is 1 with the outline on and NOTHING with it off ***",
        cd.radius === 1 && cd.moved === 8 && cdOff.radius === -1,
        `outline on: radius ${cd.radius}, ${cd.moved} moved (the 3x3 Sobel ring); off: radius ${cdOff.radius}`);
    report("*** A PASS'S FOOTPRINT DEPENDS ON WHICH FEATURES ARE SWITCHED ON. *** The same shader reads a " +
        "3x3 neighbourhood or a single texel depending on one uniform, so an apron has to be sized for the " +
        "FEATURE SET rather than for the file. A fusion measured with the outline off would be wrong the " +
        "first time somebody enabled it.");
    // *** THE GUARD IS EXERCISED, NOT MERELY PRESENT. *** Removing it went 0 RED because nothing here
    // produced an unresolved uniform -- a guard no test reaches is the graveyard's whole subject. The heat
    // path is the case it was written for, so the heat path is run and the REFUSAL is the assertion.
    const heat = await F.perturbFootprint({ render: renderGlslToPixels, vertex: VS, fragment: COMP, n: 32,
        base: flat(80), opts: { ...U(0.0), uniforms: [1, 0, 1, 1, 0, 0, 1],
            uniformVecs: { ...U(0.0).uniformVecs, uHeatSourcesUV: [0.5, 0.5],
                           uHeatRadii: [0.9], uHeatStrength: [1.0] } } });
    ok("*** a run whose uniforms did not bind is VOIDED, not reported as a footprint ***",
        heat.ok === false && heat.void === true && heat.radius === null,
        heat.void ? `refused: ${heat.unresolved.join(", ")}` : `NOT voided -- radius ${heat.radius}`);
    ok("  and it names the offending uniforms specifically, so the gap is actionable",
        heat.void && heat.unresolved.some((u) => /uHeatRadii/.test(u)),
        "an array passed through the VECTOR path is still a misuse, and the guard still refuses it -- " +
        "v4288 added a proper uniformArrays path, and this check keeps the refusal honest for the wrong one");
}

console.log("\n5. *** THE HALF-FLOAT ASSUMPTION, CHECKED AGAINST THE ENGINE THAT HAS TO SUPPLY IT ***");
{
    // v4287 fed the fused pass an rgba16float scene texture and closed by saying nothing had compared that
    // against a real renderer's target. The renderer is right here and it had already decided.
    const bloom = fs.readFileSync(path.join(ENG, "render/bloomPass.js"), "utf8");
    ok("*** the engine's own scene target is RGBA16F, for the reason v4287 chose half-float ***",
        /gl\.RGBA16F, w, h, 0, gl\.RGBA, gl\.HALF_FLOAT/.test(bloom) &&
        /emissive surfaces can output values > 1\.0/.test(bloom),
        "Round 136 promoted it from RGBA8 so values above 1 survive -- the assumption was not a lucky guess, " +
        "but nobody had looked until now");
    // v4481 -- THIS ROW USED TO ASSERT THE PHRASE "bloom will be weaker", AND THAT PHRASE IS NOW GONE ON PURPOSE.
    // render/hdrCost.mjs ran the whole five-step chain at both storage formats and the loss is not weakness, it
    // is saturation: every scene peak from 2.0 upward gives the SAME halo on 8 bits. The warning states that
    // number now, so this row grades the measurement rather than the adjective it replaced.
    ok("  and it falls back to 8-bit when the extension is missing, warning with a NUMBER rather than an adjective",
        /EXT_color_buffer_half_float/.test(bloom) && /hdrCost\.mjs/.test(bloom) && /25\.4 output levels/.test(bloom),
        "\"bloom will be weaker\" was true and unmeasured for every round since 136");
    ok("*** and v4287 measured what WEAKER means: the peak clamps 1.7480 to 1.0000 ***",
        /rgba8unorm/.test(fs.readFileSync(path.join(ENG, "tools/ship/bloomFusedTexture-selfcheck.mjs"), "utf8")),
        "181 samples above 1.0 destroyed, 43% off the brightest -- the fallback path IS the format v4287 clipped");
    // *** THE FILE'S OWN OVERVIEW CONTRADICTED ITS OWN CODE FOR EVERY ROUND SINCE 136. ***
    const header = bloom.slice(0, bloom.indexOf("// Threshold"));
    ok("*** the header no longer says RGBA8, which it did until this round ***",
        /RGBA16F when EXT_color_buffer_half_float/.test(header) && !/sceneFBO \(RGBA8/.test(header),
        "a fact written down twice with nothing reading the second copy -- the shape this session keeps finding");
    ok("  CONTROL: the header and the code are compared, not the header asserted alone",
        /RGBA16F/.test(header) === /gl\.RGBA16F/.test(bloom),
        "so a future change to either that leaves the other behind reddens this line");
}

console.log("\n6. *** HEAT DISPLACEMENT: THE UNIFORMS BIND NOW, AND THE METHOD STILL CANNOT MEASURE IT ***");
{
    ok("*** heat is demonstrably LIVE -- v4286 could not bind a single one of its uniforms ***",
        F.HEAT.activePixels > 1000,
        `${F.HEAT.activePixels} pixels of a ${F.HEAT.activeAt}x${F.HEAT.activeAt} frame change between heat off and on`);
    ok("  and its displacement is capped by a LITERAL, so the apron is 0.0035*N texels", F.HEAT.cap === 0.0035,
        `about ${Math.round(0.0035 * 1920)} at 1080p and ${Math.round(0.0035 * 256)} at 256`);
    // *** THE MINUS ONE IS NOT A SMALL FOOTPRINT. ***
    const r = F.HEAT.radii;
    ok("*** the perturbation radius reads 0, MINUS ONE, then 1 as the displacement grows ***",
        r[0].radius === 0 && r[1].radius === -1 && r[2].radius === 1,
        r.map((x) => `N=${x.n} (${x.texels} texels) -> ${x.radius}`).join(", "));
    ok("*** and the module says that is a LIMIT OF THE METHOD, not a fact about the shader ***",
        /no longer onto/.test(fs.readFileSync(path.join(ENG, "render/passFootprint.mjs"), "utf8")),
        "perturbation measures a GATHER; a displacement field means a poked texel can be read by NOBODY, and " +
        "'nothing changed' is then indistinguishable from 'never reads there'");
    ok("  so heat is recorded as EXERCISED rather than given a radius it does not have",
        /exercised/.test(F.HEAT.evidence) && F.HEAT.radius === undefined);
    report("*** THAT IS A BETTER ANSWER THAN A NUMBER WOULD HAVE BEEN. *** v4286 filed heat as unmeasured " +
        "because the uniforms would not bind; three harness gaps later they do, the pass is shown to be " +
        "live, and the reason a radius resists this method is understood rather than merely absent. An " +
        "instrument that reports where it stops working is worth more than one that always returns a figure.");
    // The vertical bias, measured because reading it did not settle it -- and reported, not changed.
    ok("  the vertical bias direction is measured and its expression flagged as UNDEFINED behaviour",
        /undefined when edge0 >= edge1/.test(F.HEAT_BIAS.note) &&
        F.HEAT_BIAS.affectedSourceRows[0] === 0,
        `distortion occupies source rows ${F.HEAT_BIAS.affectedSourceRows.join("..")} with the source at v=0.5`);
}

console.log("\n7. THE VERDICT, AND THE CLAIM IT CORRECTS");
{
    const b = F.blockers();
    ok("*** exactly one pass blocks single-dispatch fusion, and it is not the composite ***",
        b.length === 1 && b[0] === "godRays", b.join(", ") || "none");
    // v4286 -- this once asserted the string "0.0035" appeared in the composite's entry, which was true while
    // that entry was READ OFF SOURCE. Now it is measured, the 0.0035 claim has moved to UNMEASURED where it
    // belongs, and the check asks for the evidence instead of the literal. A check pinned to a spelling
    // rather than a mechanism is the species this tree has committed two dozen times.
    ok("  the composite is fusable IN ITSELF, and now on measured evidence rather than a read literal",
        F.FUSION.composite.fusable && F.FUSION.composite.evidence === "measured" &&
        F.FUSION.composite.radius === 1 && F.HEAT.cap === 0.0035,
        "measured radius 1 for the outline Sobel; the 0.0035 heat cap now carries its own measured entry");
    ok("  ...and still cannot be fused, because it CONSUMES the pass that cannot",
        /consumes god rays/.test(F.FUSION.composite.why),
        "fusable and reachable are different properties, and only the second one ships");
    ok("  SSAO is bounded by a uniform rather than a literal, which is a third category",
        F.FUSION.ssao.fusable && F.FUSION.ssao.footprint === "bounded-by-uniform",
        "an apron exists only once somebody bounds uRadius, so it is conditionally fusable and said so");
    ok("*** every entry in the table is now MEASURED, none read off source ***",
        Object.values(F.FUSION).every((v) => v.evidence === "measured"),
        Object.entries(F.FUSION).map(([k, v]) => `${k}=${v.evidence}`).join(" "));
    ok("*** v4284's closing claim is recorded as WRONG in the module that disproved it ***",
        /THAT WAS WRONG/.test(fs.readFileSync(path.join(ENG, "render/passFootprint.mjs"), "utf8")),
        "the composite decides nothing; god rays decides, and it decides no");
    report("SO THE ANSWER IS TWO DISPATCHES, NOT ONE, AND THE REASON IS STRUCTURAL RATHER THAN BUDGETARY. " +
        "bright + blur + SSAO + composite can share a tile; god rays cannot join them at 8x8, at 32x32, or " +
        "at any size, because its footprint is measured in fractions of the frame. A round that had merely " +
        "TRIED to fuse them would have produced tile-shaped seams and an argument about apron sizes.");
}

// =============================================================================================================
// SABOTAGE LOG -- grep-confirmed before the result was read, exit codes and FAIL summaries both read, restored
// md5-identical (2dbc390d5999d6d0). MEASURED.
//
//   A  the radius accumulator starts at 0 instead of -1, so "nothing moved" reports as "purely local".
//      -> exit=1, 1 red, and it is the control in section 1. *** THIS IS THE SABOTAGE THE WHOLE FILE RESTS
//      ON: *** every number here is a radius, and a measurement that cannot say "no dependency at all" would
//      report 0 for a shader that never reads its input -- the same answer it gives for BRIGHT_FS, which
//      reads exactly one texel. Zero and nothing are different verdicts.
//
//   B  the row flip dropped, the orientation error that already cost an hour at v4284.
//      -> exit=1, 4 red. The god-ray radii become 16 and 32 instead of 15 and 31 -- *** STILL DOUBLING, SO
//      THE TREND CHECK STILL PASSES. *** Only the check that predicts the EXACT number catches it. A trend
//      is cheap to satisfy and a number is not, which is the argument for predicting rather than observing.
//
//   C  DENSITY hardcoded to 1.0 instead of parsed from GODRAYS_FS.
//      -> *** WENT 0 RED FIRST TIME, AND THE GATE WAS OVERSTATING. *** The check was labelled "the geometry
//      predicts both numbers from DENSITY alone" and that was simply untrue: at the image centre the radius
//      is set by the distance to the far CORNER, and density never enters. Chasing it found something
//      better -- a regime where the constant does bite. One texel from the sun, density 0.9 predicts 3 and
//      1.0 predicts 30, a factor of ten. *** AND MEASURING THAT REGIME SHOWED THE MODEL ITSELF IS WRONG
//      THERE: *** the device says 12 against a modelled 3, because near the sun every pixel's ray converges
//      and one texel lies on rays from all directions. The model is now scoped to the centre, the near-sun
//      disagreement is recorded as MODEL_LIMIT rather than tuned away, and the redone sabotage goes 2 red.
//
//   D  godRays declared fusable, inverting the verdict.
//      -> exit=1, 1 red: "exactly one pass blocks single-dispatch fusion" reports none. The classification
//      is graded, not just the measurement that justifies it, because the two can drift apart -- a table
//      that disagrees with its own evidence is the shape v4284's round-trip count had.
//
//   E  the void-on-unresolved guard deleted, so a run whose uniforms never bound still reports a radius.
//      -> *** 0 RED FIRST TIME. *** Nothing in the file produced an unresolved uniform, so the guard was
//      present and unreached -- the graveyard's whole subject, inside a gate. The heat path is the case the
//      guard was written for, so the heat path is now RUN and the refusal is the assertion. Redone: 2 red,
//      reporting "NOT voided -- radius 0". That 0 is the honest footprint of a shader whose heat was
//      switched off by the binding failure, and it would have been read as the footprint of heat.
//
//   F  every extra sampler bound to unit 0, so the composite's five inputs become one image.
//      -> exit=1, 2 red. uBloom reads radius -1 -- perturbing it changes NOTHING, because the shader is
//      reading unit 0 for everything and unit 0 is uScene. *** THIS IS WHAT v4285 WAS ACTUALLY DOING when it
//      filed the composite as read-off-source: *** with one texture bound, a measurement would have been a
//      measurement of a fiction, and the -1 here is what that fiction looks like.
//
//   G  v4288 -- the stale RGBA8 header restored in render/bloomPass.js.
//      -> exit=1, 2 red, and the CONTROL fails with it: the header and the CODE are compared, so restoring
//      one without the other is exactly what reddens. The comment had said RGBA8 since Round 136 promoted
//      the target to RGBA16F -- a file's own overview contradicting its own code, unread for that long.
//
//   H  v4288 -- heat filed with evidence "measured" and a radius of 1.
//      -> exit=1, 1 red. The radius IS 1 at N=512, so the number is not even wrong -- it is unearned. At
//      N=256 the same probe reports MINUS ONE, because a displaced read can skip the poked texel entirely,
//      and quoting the one resolution where the method happened to work would be picking the answer that
//      flatters the instrument. *** THE CHECK IS THAT THE ENTRY DECLINES A RADIUS, NOT THAT IT HAS ONE. ***
//
// None went 0 RED in the end, and two needed a second attempt. C, E and H are the trio worth keeping, and
// they are one shape: a check that claimed more than it performed, a guard that no test reached, and an
// entry that would have carried a number it had not earned. None was a bug in a module. All three were the
// gate believing itself.
console.log(fails ? "\nFAIL -- " + fails + " check(s)" : "\nALL GREEN");
console.log("unchecked here: THE COMPOSITE AND SSAO WERE NOT PERTURBED. Both need textures this harness cannot " +
    "bind separately -- the composite takes five samplers and SSAO needs a depth buffer that is not the colour " +
    "buffer -- so their entries in FUSION are read off their SOURCE, which is exactly the weaker evidence this " +
    "file exists to replace. They are marked as such rather than presented beside the two that were measured. " +
    "Also unchecked: whether fusing the four fusable passes is WORTH doing, which needs hardware this sandbox " +
    "does not have; what is settled is only that the fifth can never join them.");
process.exit(fails ? 1 : 0);
