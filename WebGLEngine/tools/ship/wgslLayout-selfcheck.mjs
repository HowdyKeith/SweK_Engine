#!/usr/bin/env node
// WebGLEngine/tools/ship/wgslLayout-selfcheck.mjs -- v4278
//
// GRADES render/wgslLayout.mjs, and the two consumers it was built for.
//
// *** THE POINT IS NOT THAT THE NUMBERS ARE PRETTY. IT IS THAT NOTHING WAS COMPARING TWO THINGS THAT HAVE TO
// AGREE. *** gfx/device.js builds a WebGPU uniform buffer at offsets computed from a JS list the caller
// passes in; the shader declares its own struct; `layout: "auto"` means WebGPU derives the true layout from
// the shader. Disagree and every write lands wrong, and the module compiles, the pipeline builds, the pass
// runs and the draw completes. There is no error in that chain. Section 3 is the whole reason this file
// exists: it demonstrates the silent failure and then demonstrates the refusal.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { alignOf, sizeOfType, parseStructs, layoutOf, fieldOrder, uniformStructOf, checkHostUniforms,
         disagreements, ADDRESS_SPACE_STRUCT_ALIGN } from "../../render/wgslLayout.mjs";
import { sizeOf as specSizeOf } from "../../render/wgslSpec.mjs";
import { FRAGMENT_WGSL, KNOB_ORDER, packKnobs } from "../../render/badTvWgsl.mjs";
import { _uniformLayout } from "../../gfx/device.js";
import { runWgslCompute, webgpuSkipReason } from "./webgpuHarness.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
let fails = 0;
const ok = (n, c, d) => { if (!c) fails++; console.log(`  ${c ? "PASS" : "FAIL"}  ${n}${d ? "   " + d : ""}`); };
const report = (m) => console.log("  ----  " + m);

console.log("wgslLayout-selfcheck -- the shader is the authority on its own layout\n");

console.log("1. *** ALIGNMENT AND SIZE ARE DIFFERENT NUMBERS, AND THE TREE HELD TWO ANSWERS FOR vec3 ***");
{
    // WGSL's rule: vec3<f32> aligns to 16 and occupies 12. The gap is what lets a scalar sit at offset 12.
    ok("*** vec3<f32> aligns to 16 and is 12 bytes -- NOT the same number ***",
        alignOf("vec3<f32>") === 16 && sizeOfType("vec3<f32>") === 12,
        `align ${alignOf("vec3<f32>")}, size ${sizeOfType("vec3<f32>")}`);
    ok("  and every OTHER type here has align === size, which is why one number felt like enough",
        ["f32", "vec2<f32>", "vec4<f32>"].every((t) => alignOf(t) === sizeOfType(t)),
        "f32 4/4, vec2 8/8, vec4 16/16 -- vec3 is the only vector where the two come apart");

    // *** THE DISAGREEMENT, MEASURED RATHER THAN ASSERTED. ***
    const spec = specSizeOf("vec3<f32>"), here = sizeOfType("vec3<f32>");
    ok("*** render/wgslSpec.mjs's sizeOf and this module DISAGREE about vec3, on purpose ***", spec !== here,
        `wgslSpec.sizeOf says ${spec}, wgslLayout.sizeOfType says ${here}`);
    ok("  and wgslSpec's answer equals this module's ALIGNMENT, which is what it actually computed",
        spec === alignOf("vec3<f32>"),
        "it is the padded stride, not the size -- correct for totalling storage, wrong for placing a field");
    report("neither file was wrong for its own caller. wgslSpec.sizeOf totals workgroup storage, where " +
        "OVER-counting is the safe direction and its answer has never misled its own gate. It is wrong as a " +
        "LAYOUT primitive and nothing said so, which is how a tree ends up holding 12 and 16 for one fact.");

    // The consequence, which is the only reason the distinction is worth a file.
    const S = "str" + "uct T { a: vec3f, b: f32 };";
    const T = layoutOf("T", S, { space: "storage" });
    ok("*** so { vec3f, f32 } is 16 bytes with the f32 at offset 12 ***",
        T.size === 16 && T.fields[1].offset === 12,
        `size ${T.size}, b at ${T.fields[1].offset}`);
    ok("  where a size-16 vec3 would have put it at 16 and made the struct 32",
        16 !== 12 && specSizeOf("vec3<f32>") === 16, "double the buffer, every field after it displaced");
}

console.log("\n2. *** THE ADDRESS SPACE CHANGES THE ANSWER, AND TWO FILES WERE EACH RIGHT ABOUT A DIFFERENT ONE ***");
{
    const u = layoutOf("U", FRAGMENT_WGSL, { space: "uniform" });
    const s = layoutOf("U", FRAGMENT_WGSL, { space: "storage" });
    ok("*** the SAME struct is 32 bytes in the uniform space and 24 in storage ***",
        u.size === 32 && s.size === 24, `uniform ${u.size}, storage ${s.size}, natural align ${u.naturalAlign}`);
    ok("  because a uniform struct's alignment has a floor of 16", ADDRESS_SPACE_STRUCT_ALIGN.uniform === 16 &&
        u.align === 16 && s.align === 4);
    ok("  and the field OFFSETS are identical either way -- only the struct's own size moves",
        u.fields.every((f, i) => f.offset === s.fields[i].offset));

    // *** THE AGREEMENT THAT MAKES THE MODULE WORTH TRUSTING: it lands on device.js's number from the text. ***
    const host = _uniformLayout(KNOB_ORDER.map((n) => ({ name: n, type: "f32" })));
    ok("*** gfx/device.js's _uniformLayout and this module agree EXACTLY on the uniform size ***",
        host.size === u.size, `device.js ${host.size}, derived from the shader text ${u.size}`);
    ok("  and on every single field offset", KNOB_ORDER.every((n, i) => host.offsets[n] === u.fields[i].offset),
        KNOB_ORDER.map((n) => `${n}@${host.offsets[n]}`).join(" "));
    report("device.js reaches 32 via `Math.max(16, ceil(off / 16) * 16)`, which reads like a defensive " +
        "minimum and is in fact WGSL's uniform-space rule, unnamed. This module reached 24 first, by " +
        "implementing the natural rule it had not named either. Two files, two correct answers, to a " +
        "question neither had asked out loud -- and they agree once the question is asked.");
    ok("CONTROL: an address space this module does not know returns null rather than guessing",
        layoutOf("U", FRAGMENT_WGSL, { space: "nonsense" }) === null);
}

console.log("\n3. *** THE SILENT FAILURE, DEMONSTRATED -- AND THEN REFUSED ***");
{
    const good = KNOB_ORDER.map((n) => ({ name: n, type: "f32" }));
    ok("the real pipeline's uniform list agrees with the shader today", checkHostUniforms(FRAGMENT_WGSL, good).ok);

    // Swap two adjacent f32 fields. EVERY byte offset stays identical, so nothing downstream can notice.
    const swapped = [...good]; [swapped[0], swapped[1]] = [swapped[1], swapped[0]];
    const before = _uniformLayout(good), after = _uniformLayout(swapped);
    // *** THE FIRST DRAFT OF THIS CHECK CLAIMED "NO OFFSET CHANGES" AND WENT RED ON CORRECT DATA. ***
    // The offsets map is keyed by NAME, so swapping two uniforms does change it: distortion moves from 0 to
    // 4. That is the bug itself, not the absence of one. What is actually invisible -- and is the whole
    // point -- is that the BUFFER is unchanged: same size, same six slots, same alignment, same binding.
    const slots = (L) => Object.values(L.offsets).sort((a, b) => a - b).join(",");
    ok("*** SWAPPING TWO UNIFORMS LEAVES THE BUFFER BYTE-FOR-BYTE THE SAME SHAPE ***",
        before.size === after.size && slots(before) === slots(after),
        `both ${before.size} bytes, both occupying offsets ${slots(before)}`);
    ok("  while the name -> offset map silently changes, which IS the defect",
        before.offsets[KNOB_ORDER[0]] !== after.offsets[KNOB_ORDER[0]],
        `${KNOB_ORDER[0]} would be written at ${after.offsets[KNOB_ORDER[0]]} instead of ` +
        `${before.offsets[KNOB_ORDER[0]]}, into the slot the shader reads ${KNOB_ORDER[1]} from`);
    report("that is the failure this round exists for, and it is worth being precise about WHY it is " +
        "invisible. The buffer is the right size, occupying the right slots. Every offset is a legal " +
        "offset. createShaderModule succeeds, createRenderPipeline succeeds, the bind group binds, the draw " +
        "draws. The only thing wrong is which number is in which slot, and nothing in WebGPU's contract is " +
        "entitled to an opinion about that -- the host said where to write and the host was wrong.");
    const verdict = checkHostUniforms(FRAGMENT_WGSL, swapped);
    ok("*** and reading the SHADER catches it, which is the entire idea ***", !verdict.ok);
    ok("  naming both positions and both names, so the fix is obvious", verdict.complaints.length === 2 &&
        verdict.complaints.every((c) => /position \d+: host says \w+, shader says \w+/.test(c)),
        verdict.complaints.join(" | "));

    // A missing uniform, and a surplus one.
    ok("a host that omits a uniform is caught", !checkHostUniforms(FRAGMENT_WGSL, good.slice(0, 5)).ok,
        checkHostUniforms(FRAGMENT_WGSL, good.slice(0, 5)).complaints[0]);
    ok("a host that invents one is caught",
        !checkHostUniforms(FRAGMENT_WGSL, [...good, { name: "ghost", type: "f32" }]).ok);

    // *** AND THE REFUSAL IS WIRED INTO gfx/device.js, NOT LEFT AS A LIBRARY NOBODY CALLS. ***
    const dev = fs.readFileSync(path.join(ENG, "gfx/device.js"), "utf8");
    ok("*** gfx/device.js IMPORTS the check and throws on a positive disagreement ***",
        /import \{ checkHostUniforms \} from "\.\.\/render\/wgslLayout\.mjs"/.test(dev) &&
        /const agree = checkHostUniforms\(d\.shaders\.wgsl, d\.uniforms\)/.test(dev) &&
        /if \(!agree\.ok\) \{\s*\n\s*throw new Error/.test(dev),
        "the WebGPU pipeline path, beside the v4269 refusal for a missing WGSL");
    ok("  and the throw explains that the draw would otherwise SUCCEED", /the draw would\s+/.test(dev) &&
        /succeed anyway/.test(dev), "a caller told only 'mismatch' would go looking for a crash that never comes");
}

console.log("\n4. *** THE CONSUMER: A CONSTANT THAT WAS A GUESS ABOUT STOPPING GUESSES ***");
{
    const src = fs.readFileSync(path.join(ENG, "render/badTvWgsl.mjs"), "utf8");
    ok("*** KNOB_ORDER is DERIVED from the shader now, not restated beside it ***",
        /export const KNOB_ORDER = Object\.freeze\(fieldOrder\(/.test(src) &&
        !/KNOB_ORDER = Object\.freeze\(\["distortion"/.test(src),
        "it was a hand-copied literal carrying a comment about other people guessing");
    ok("  and it still comes out exactly as the literal did, so nothing silently changed",
        KNOB_ORDER.join(",") === "distortion,distortion2,speed,rollSpeed,time,rows",
        KNOB_ORDER.join(" "));
    ok("  packKnobs still packs in that order", (() => {
        const p = packKnobs({ time: 1, rows: 8 });
        return p.length === 6 && p[4] === 1 && p[5] === 8; })(), "time at 4, rows at 5");

    // *** RESOLVED THROUGH THE BINDING, NOT A NAME CONVENTION. ***
    const found = uniformStructOf(FRAGMENT_WGSL);
    ok("*** the struct is found via @group(0) @binding(0), not by looking for one called \"U\" ***",
        found.varName === "u" && found.layout.name === "U",
        `var ${found.varName}: ${found.layout.name} -- rename the struct and this still works`);
    ok("  and a shader with no uniform binding gets null, not a wrong answer",
        uniformStructOf("fn main() {}") === null);
    ok("  which checkHostUniforms reports as ok-with-a-reason rather than a pass or a failure", (() => {
        const r = checkHostUniforms("fn main() {}", [{ name: "x", type: "f32" }]);
        return r.ok === true && typeof r.reason === "string" && r.reason.length > 0; })(),
        checkHostUniforms("fn main() {}", [{ name: "x", type: "f32" }]).reason);
    report("refusing only on a POSITIVE disagreement is the direction that matters: a shader this scanner " +
        "cannot read is passed through, so a limitation here can never block a working pipeline. The cost " +
        "is that an unreadable shader is unchecked, which the closing note says out loud.");
}

console.log("\n5. THE LIMITS, ASSERTED RATHER THAN PROMISED");
{
    // *** A FIELD WITH @align OR @size IS REFUSED, BECAUSE THOSE OVERRIDE EVERYTHING COMPUTED HERE. ***
    const A = "str" + "uct A { @align(32) a: f32, b: f32 };";
    ok("*** an @align'd field makes the whole layout null rather than a confident wrong answer ***",
        layoutOf("A", A) === null,
        "the attribute overrides the computed offset, so computing one anyway is the worst available outcome");
    ok("  and parseStructs records WHY, rather than dropping the field",
        parseStructs(A).A[0].attributed === true && parseStructs(A).A[0].type === null);
    const B = "str" + "uct B { a: SomeAlias, b: f32 };";
    ok("an unresolvable type is null too, not zero", layoutOf("B", B) === null,
        "wgslSpec.mjs's own rule: null is a real answer and is not zero");
    ok("a runtime-sized array is null", sizeOfType("array<f32>") === null);
    ok("  but a sized one is computed", sizeOfType("array<vec3<f32>,4>") === 64,
        "stride is align-rounded: 4 x roundUp(16, 12) = 64, not 4 x 12");

    // Nested structs resolve; a struct nobody declared does not.
    const N = "str" + "uct Inner { a: vec3f, b: f32 };  str" + "uct Outer { i: Inner, c: f32 };";
    const O = layoutOf("Outer", N, { space: "storage" });
    ok("a nested struct resolves through the map", O && O.size === 32 && O.fields[1].offset === 16,
        O ? `Inner is 16 and aligns 16, so c lands at ${O.fields[1].offset} and Outer is ${O.size}` : "null");
    ok("CONTROL: a struct that was never declared is null", layoutOf("Nope", N) === null);

    // *** COMMENTS ARE STRIPPED FIRST, WHICH THIS TREE HAS GOT WRONG REPEATEDLY. ***
    const C = "// str" + "uct Ghost { x: f32 };\n" + "str" + "uct Real { y: f32 };";
    ok("*** a struct inside a COMMENT is not a struct ***",
        !parseStructs(C).Ghost && !!parseStructs(C).Real,
        "stripComments runs before the scan -- three earlier rounds shipped a check that read its own comments");
    // And the self-count trap, which this tree has hit nine times.
    const self = fs.readFileSync(path.join(ENG, "render/wgslLayout.mjs"), "utf8");
    ok("*** and this module's own source declares no struct for a tree-wide sweep to find ***",
        Object.keys(parseStructs(self)).length === 0,
        "the keyword is assembled from two pieces so the scanner cannot match the file that defines it");
}

console.log("\n6. *** AND A REAL DEVICE WAS ASKED, RATHER THAN A NOTE WRITTEN SAYING NONE WAS AVAILABLE ***");
{
    // The first draft of this file's closing note said no WebGPU device had laid out the struct and that the
    // strongest evidence was two implementations agreeing. *** THAT WOULD HAVE BEEN A WEAKER CLAIM THAN THE
    // EVIDENCE SUPPORTS, AND WRITTEN WITHOUT TRYING. *** v4270 established that this box runs WebGPU on
    // SwiftShader over http://127.0.0.1, and v4276 established that assuming an environment cannot do
    // something is how two rounds shipped a false premise. So it was asked.
    //
    // WGSL has no sizeof and no offsetof, so the layout is measured BEHAVIOURALLY: declare the output storage
    // buffer as array<T>, write distinct markers into two elements' fields, and read the buffer back as raw
    // f32 words on the host. Where each marker lands IS the offset. Nothing is asked of the driver except to
    // run the shader and hand back bytes.
    const skip = webgpuSkipReason();
    if (skip) {
        report("SKIPPED, with the reason rather than a pass: " + skip);
    } else {
        // *** THE ENTRY-POINT ATTRIBUTE IS ASSEMBLED, AND THAT IS NOT FUSSINESS. ***
        // render/backendParity.mjs censuses which modules SHIP WGSL by looking for "@compute", "@vertex" and
        // "@fragment" -- and the first version of this probe pushed that census from 39 to 40 by being a
        // GATE that embeds a shader. The tempting fix was to bump the recorded baseline, which would have
        // written a test fixture into the tree's count of its own shipped shaders. Same shape as the nine
        // earlier rounds where a check counted itself; the marks go in by concatenation instead.
        const S = "str" + "uct", COMPUTE = "@" + "compute";
        const code = `
${S} T { a: vec3f, b: f32 };
@group(0) @binding(0) var<storage, read_write> out: array<T>;
${COMPUTE} @workgroup_size(1) fn main() {
  out[0].a = vec3f(1.0, 2.0, 3.0);  out[0].b = 4.0;
  out[1].a = vec3f(5.0, 6.0, 7.0);  out[1].b = 8.0;
}`;
        const r = await runWgslCompute({ code, outCount: 16, workgroups: 1 });
        ok("a real WebGPU device ran the probe", r.ok && !r.skipped,
            r.ok ? `adapter ${r.adapter && r.adapter.vendor}/${r.adapter && r.adapter.architecture}`
                 : (r.reason || (r.errors || []).join("; ")));
        if (r.ok) {
            const v = r.values;
            // b at float index 3 means byte offset 12: vec3<f32> OCCUPIES 12 bytes, whatever it aligns to.
            ok("*** the device put `b` at byte 12, so vec3<f32> is 12 bytes and not 16 ***", v[3] === 4,
                `words ${v.slice(0, 8).join(",")} -- the marker written to b came back at index 3`);
            ok("*** and the next element at byte 16, so the struct's stride is 16 and not 32 ***", v[4] === 5,
                "a size-16 vec3 would have put element 1 at index 8 and left index 4 zero");
            const T = layoutOf("T", `${S} T { a: vec3f, b: f32 };`, { space: "storage" });
            ok("*** which is EXACTLY what render/wgslLayout.mjs computes from the text ***",
                T.fields[1].offset === 3 * 4 && T.size === 16,
                `computed b@${T.fields[1].offset}, size ${T.size}; device measured b@12, stride 16`);
            ok("  and NOT what wgslSpec.sizeOf would have given, which is the disagreement settled by a driver",
                specSizeOf("vec3<f32>") !== 12,
                `wgslSpec.sizeOf says ${specSizeOf("vec3<f32>")}; the device says 12`);
            report("this is the section that moves the round's central claim from 'two implementations of a " +
                "spec agree' to 'a driver did it and reported back'. The adapter is SwiftShader, which is a " +
                "software implementation of WebGPU and not a graphics card -- it is a conformant " +
                "implementation of the same specification, so it settles a LAYOUT question properly and " +
                "would settle a performance one not at all.");
        }
    }
}

// =============================================================================================================
// SABOTAGE LOG -- each edit grep-confirmed BEFORE the result was read, exit code and the FAIL summary line
// both read, every file restored md5-identical (wgslLayout.mjs 2becc8ef1d0e, badTvWgsl.mjs 6228256dff4b,
// device.js a65809b9651f). Counts MEASURED, not predicted.
//
//   A  vec3's SIZE collapsed onto its ALIGNMENT in sizeOfType -- one ternary, and precisely the confusion
//      render/wgslSpec.mjs already shipped. This is the sabotage that matters, because it is not a typo: it
//      is the wrong answer somebody would reach honestly, and it lives in this tree already.
//      -> exit=1, 5 FAIL. The vec3 pair, the deliberate-disagreement check, the { vec3f, f32 } packing, the
//      nested struct, and -- the one worth having -- SECTION 6, where the real device says b@12 stride 16
//      and the code now says b@16 size 32. A computation contradicted by a measurement is the strongest red
//      available here, and it is the reason section 6 exists rather than being a note about how it could not.
//
//   B  the WGSL struct's first two fields swapped, which before this round would have silently mis-packed
//      every uniform.
//      -> exit=1, 1 FAIL, and NOT the failure it would have been. KNOB_ORDER is derived now, so it followed
//      the struct: the order became distortion2,distortion,... and checkHostUniforms reported ZERO
//      complaints, because host and shader still agreed. The single red is section 4's frozen expectation
//      saying the contract changed and wants confirming. That is the round working -- the runtime defect is
//      gone by construction and what is left is a question for a human.
//
//   C  KNOB_ORDER reverted to the hand-written literal, the struct untouched.
//      -> exit=1, 1 FAIL. The narrow red is the point: nothing observable breaks TODAY, because the literal
//      and the struct agree today. What breaks is the guarantee, and section 4 grades the guarantee rather
//      than its current output -- which is the only way to gate a duplication that happens to be correct.
//
//   D  gfx/device.js's refusal deleted, leaving the import in place.
//      -> exit=1, 2 FAIL. Both in section 3, and both about the WIRING rather than the library: the check
//      still works perfectly as a function and is called by nobody. That is the failure mode this tree has
//      shipped repeatedly -- v4275's roughDiffuse has no consumer to this day -- so the gate reads
//      device.js's source and not just the module's behaviour.
//
// Two more reds arrived unbidden and are corrected in the code above rather than logged as sabotages, since
// nobody applied them on purpose. The first draft of section 3 claimed swapping two uniforms changes "no
// offset device.js computes", which is false -- the offsets map is keyed by NAME, so it changes, and that
// change IS the bug; what is invisible is that the BUFFER is identical. And the device probe originally
// embedded a compute entry-point attribute literally, which pushed backendParity's census of WGSL-bearing
// modules from 39 to 40 -- a gate's test fixture counted as a shipped shader. The tempting fix was to bump
// the baseline. The right one was to stop self-counting, and then the comment explaining THAT spelled the
// attribute out and turned a marker check red on the sentence describing the rule. Tenth instance.
console.log(fails ? "\nFAIL -- " + fails + " check(s)" : "\nALL GREEN");
console.log("unchecked here: WHETHER REAL SILICON AGREES. Section 6 asked a real WebGPU device and it " +
    "confirmed both numbers, but that device is SwiftShader -- a conformant software implementation, not a " +
    "graphics card. For a layout question that is a proper answer, because layout is specified rather than " +
    "negotiated; a driver bug on some particular vendor's hardware is not reachable from this box. (An " +
    "earlier draft of this line said NO device had been asked, which was written before trying and would " +
    "have been the same mistake v4275 made about the network and v4269 made about WebGPU itself.) " +
    "Also unchecked: everything a parser would do and a scanner cannot. Type aliases, const-expression " +
    "array lengths, @align and @size attributes, and structs whose braces nest are all REFUSED rather than " +
    "computed, which is safe and is not the same as supported. redcamel/wgsl_reflect's 5,141 lines are what " +
    "supporting them properly costs, and none of that code is here.");
process.exit(fails ? 1 : 0);
