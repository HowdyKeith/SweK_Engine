// WebGLEngine/tools/ship/splatRoundTrip-selfcheck.mjs -- v4195
//
// GATES the whole Gaussian-splat ingest stack: engine/plyWriter.mjs (new this round), engine/splatParser.js,
// gpu/SplatLoader.js, and the two renderer conventions they feed.
//
// *** THE GAP THIS ROUND CLOSED, AS A MEASUREMENT. *** This tree carried 3,302 lines across two independent
// .ply parsers, two independent SplatRenderers and a SplatScene, and grep found ZERO references to any of
// them from any selfcheck -- physics/splat/gaussianSplat-selfcheck.mjs and tools/roundhouse/splatNuisance-
// selfcheck.mjs gate the splat MATHS and never touch the code that reads the file. Nothing was gated because
// nothing could WRITE the format: every test would have needed a vendored capture from someone else's
// scanner. engine/plyWriter.mjs makes the fixture 693 bytes of this repo's own bytes, and the round trip
// through both parsers is the spine of everything below.
//
// *** AND THE ROUND TRIP FOUND A LIVE DEFECT ON THE PATH main.js USES. *** engine/splatParser.js scanned for
// the eleven bytes "end_header\n", so a .ply with a CRLF header -- every one written on Windows -- was
// refused with "could not find end_header in first 64KB", an error blaming the file for missing a marker it
// plainly has. gpu/SplatLoader.js read the same bytes without complaint. Section 5 is that regression, with
// an LF control beside it so a fix that broke the normal case could not pass either.
//
// *** THE TWO CONVENTIONS ARE CHECKED AGAINST THE FORMAT, NOT AGAINST EACH OTHER. *** Comparing the parsers
// only to one another would pass with both of them broken the same way. engine/plyWriter.mjs derives
// toShaderConvention() and toRenderConvention() from the 3DGS definition; sections 2 and 3 hold each parser
// to its own, and only then does section 4 assert the exp/sigmoid relation BETWEEN them.
//
// Run: node tools/ship/splatRoundTrip-selfcheck.mjs   (exit 0 all-pass, 1 on any fail)

import { FIXTURE, writePly, writeSplat, plyHeader, bboxOf, PLY_PROPS, SH_C0,
         toShaderConvention, toRenderConvention, fromShaderConvention } from "../../engine/plyWriter.mjs";
import * as ENGINE from "../../engine/splatParser.js";
import * as GPU from "../../gpu/SplatLoader.js";
import { noComments, codeOnly, prose } from "./sourceScan.mjs";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error("  FAIL  " + m); } };
const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (rel) => fs.readFileSync(path.join(ENG, rel), "utf8");
const ab = (u) => u.buffer.slice(u.byteOffset, u.byteOffset + u.byteLength);
const threw = (fn) => { try { fn(); return null; } catch (e) { return e.message; } };
const N = FIXTURE.length;

// 1) THE WRITER PRODUCES A FILE, AND THE FILE IS THE SHAPE THE FORMAT SAYS.
{
    const le = writePly(FIXTURE);
    ok(le instanceof Uint8Array && le.length > 0, "writePly returns bytes");
    const head = new TextDecoder().decode(le.subarray(0, 200));
    ok(head.startsWith("ply\n"), "the file begins with the ply magic");
    ok(/format binary_little_endian 1\.0/.test(head), "and names its format, which is how a reader routes it");
    ok(new RegExp(`element vertex ${N}\\b`).test(head), `and declares its ${N} vertices`);
    ok(PLY_PROPS.length === 14, "the 14 standard 3DGS per-vertex properties are written");
    // The body must be exactly count * 14 * 4 bytes -- a stride error here is the single most common way a
    // splat file reads as noise, and it is arithmetic, so it can simply be checked.
    const bodyStart = new TextDecoder().decode(le).indexOf("end_header\n") + "end_header\n".length;
    ok(le.length - bodyStart === N * 14 * 4,
        `the body is exactly ${N} x 14 x 4 = ${N * 56} bytes, so the stride cannot silently drift`);
    ok(writeSplat(FIXTURE).length === N * 32, `and a .splat is exactly ${N} x 32 = ${N * 32} bytes`);
    ok(threw(() => writePly([])) !== null, "writing zero gaussians is refused rather than producing a headerless stub");
    ok(threw(() => writePly(FIXTURE, { format: "binary_middle_endian" })) !== null, "and an invented format is refused");
    ok(/end_header\r\n$/.test(plyHeader("ascii", 1, "\r\n")), "the header honours the line ending it is asked for");
}

// 2) ROUND TRIP THROUGH engine/splatParser.js -- exact, in the SHADER convention.
//
//    engine/SplatRenderer.js applies exp() and the sigmoid in its vertex shader, so this parser must hand
//    back the file's own units UNTOUCHED. A parser that "helpfully" converted here would double-apply.
{
    const p = ENGINE.parsePly(ab(writePly(FIXTURE)));
    ok(p.count === N, `${p.count} gaussians recovered`);
    let mPos = 0, mScale = 0, mOpac = 0, mCol = 0, mQuat = 0;
    for (let i = 0; i < N; i++) {
        const w = toShaderConvention(FIXTURE[i]);
        for (let k = 0; k < 3; k++) {
            mPos   = Math.max(mPos,   Math.abs(p.positions[i * 3 + k] - w.position[k]));
            mScale = Math.max(mScale, Math.abs(p.scales[i * 3 + k]    - w.scale[k]));
            mCol   = Math.max(mCol,   Math.abs(p.colors[i * 3 + k]    - w.color[k]));
        }
        for (let k = 0; k < 4; k++) mQuat = Math.max(mQuat, Math.abs(p.quats[i * 4 + k] - w.quat[k]));
        mOpac = Math.max(mOpac, Math.abs(p.opacities[i] - w.opacity));
    }
    // Positions, scales, quats and opacity are float32 in and float32 out, so these are EXACT -- not "close".
    ok(mPos === 0,   `positions round trip exactly (max error ${mPos})`);
    ok(mScale === 0, `scales round trip exactly, still in LOG space (max error ${mScale})`);
    // Quaternions are float32 to float32 as well, but 0.7071068 is not a binary fraction the way the
    // fixture's positions and scales are, so this one lands at float32 epsilon rather than dead zero.
    ok(mQuat < 1e-6, `quaternions round trip to float32 precision (max error ${mQuat.toExponential(2)})`);
    ok(mOpac === 0,  `opacity round trips exactly, still PRE-sigmoid (max error ${mOpac})`);
    // Colour is the one lossy step, because SH0 is applied in float64 and stored in a Float32Array.
    ok(mCol < 1e-6, `colour round trips to float32 precision (max error ${mCol.toExponential(2)})`);
    ok(p.colors.length === N * 3 && p.opacities.length === N,
        "colour is RGB with opacity in its own array -- the shape engine/SplatRenderer.js reads");
    ok(p.scales.some((s) => s < 0), "*** and some scales are NEGATIVE, which is the proof they are log space and not linear ***");
    const bb = bboxOf(FIXTURE);
    ok(bb.size.every((v, i) => Math.abs(p.bbox.size[i] - v) < 1e-6), `the bbox matches the source set (${bb.size.join(" x ")})`);
}

// 3) ROUND TRIP THROUGH gpu/SplatLoader.js -- in the RENDER convention, and through all FOUR header variants.
{
    const variants = [
        ["binary little-endian", () => GPU.parsePlyBinary(ab(writePly(FIXTURE, { format: "binary_little_endian" })))],
        ["binary big-endian",    () => GPU.parsePlyBinary(ab(writePly(FIXTURE, { format: "binary_big_endian" })))],
        ["binary LE with CRLF",  () => GPU.parsePlyBinary(ab(writePly(FIXTURE, { format: "binary_little_endian", eol: "\r\n" })))],
        ["ascii",                () => GPU.parsePlyAscii(new TextDecoder().decode(writePly(FIXTURE, { format: "ascii" })))],
    ];
    for (const [label, load] of variants) {
        const p = load();
        ok(p.count === N, `${label}: ${p.count} gaussians`);
        let mPos = 0, mScale = 0, mRgba = 0;
        for (let i = 0; i < N; i++) {
            const w = toRenderConvention(FIXTURE[i]);
            for (let k = 0; k < 3; k++) {
                mPos   = Math.max(mPos,   Math.abs(p.positions[i * 3 + k] - w.position[k]));
                mScale = Math.max(mScale, Math.abs(p.scales[i * 3 + k]    - w.scale[k]));
            }
            for (let k = 0; k < 4; k++) mRgba = Math.max(mRgba, Math.abs(p.colors[i * 4 + k] - w.rgba[k]));
        }
        ok(mPos === 0, `${label}: positions exact`);
        ok(mScale < 1e-6, `${label}: scales are LINEAR (exp applied), to float32 precision (${mScale.toExponential(2)})`);
        // *** THE 8-BIT PATH IS EXACT, NOT APPROXIMATE. *** Every channel and every alpha lands on the same
        // byte the format defines. If this ever drifts by even 1 it means a clamp or a rounding rule moved.
        ok(mRgba === 0, `${label}: all ${N * 4} colour+alpha BYTES are exactly right`);
    }
    const p = GPU.parsePlyBinary(ab(writePly(FIXTURE)));
    ok(p.colors instanceof Uint8Array && p.colors.length === N * 4,
        "colour is Uint8 RGBA with alpha packed in -- the shape render/SplatRenderer.js uploads as UNSIGNED_BYTE");
    ok(p.scales.every((s) => s > 0), "*** and every scale is POSITIVE, which is the proof exp() was applied ***");
    ok(p.sh1 === null, "no SH1 is claimed for a file that carries no f_rest_* -- partial SH is refused, not zero-filled");
}

// 4) *** THE TWO PARSERS AGREE -- AND THE TRANSFORM BETWEEN THEM IS EXACTLY exp AND sigmoid. ***
//
//    This is the assertion that resolves the duplication. The two halves of the tree are not in conflict;
//    they sit on opposite sides of one documented boundary. Written down, a struct from one half handed to
//    the other half's renderer becomes a checkable mistake instead of a plausible, wrong picture.
{
    const a = ENGINE.parsePly(ab(writePly(FIXTURE)));
    const b = GPU.parsePlyBinary(ab(writePly(FIXTURE)));
    ok(a.count === b.count, `both parsers read the same ${a.count} gaussians from the same bytes`);
    let dPos = 0, dScale = 0, dRgb = 0, dAlpha = 0;
    for (let i = 0; i < N; i++) {
        for (let k = 0; k < 3; k++) {
            dPos   = Math.max(dPos,   Math.abs(a.positions[i * 3 + k] - b.positions[i * 3 + k]));
            dScale = Math.max(dScale, Math.abs(Math.exp(a.scales[i * 3 + k]) - b.scales[i * 3 + k]));
            dRgb   = Math.max(dRgb,   Math.abs(Math.round(a.colors[i * 3 + k] * 255) - b.colors[i * 4 + k]));
        }
        dAlpha = Math.max(dAlpha, Math.abs(Math.round(255 / (1 + Math.exp(-a.opacities[i]))) - b.colors[i * 4 + 3]));
    }
    ok(dPos === 0, "positions are identical -- the one field neither parser transforms");
    ok(dScale < 1e-6, `exp(engineScale) equals gpuScale to float32 precision (${dScale.toExponential(2)}) -- the scale convention IS exp`);
    ok(dRgb === 0, "round(engineColour * 255) equals gpuColour on every channel, exactly -- the colour convention IS an 8-bit quantisation");
    ok(dAlpha === 0, "*** and sigmoid(engineOpacity) * 255 equals gpuAlpha exactly -- the opacity convention IS the sigmoid ***");
    // And the two shapes really are different, so the transform above is load-bearing rather than a no-op.
    ok(a.colors.length !== b.colors.length && a.opacities && b.opacities === undefined,
        "the two shapes genuinely differ, so agreeing required the conversion rather than luck");
    ok(a.quats && b.rotations && b.quats === undefined,
        "and they even name the rotation field differently -- `quats` here, `rotations` there");
}

// 5) *** REGRESSION: A CRLF HEADER. *** The defect this round fixed, with its LF control beside it.
{
    const crlf = ab(writePly(FIXTURE, { format: "binary_little_endian", eol: "\r\n" }));
    const lf   = ab(writePly(FIXTURE, { format: "binary_little_endian", eol: "\n" }));
    const e = threw(() => ENGINE.parsePly(crlf));
    ok(e === null, `engine/splatParser reads a CRLF header${e ? " -- but threw: " + e : ""}`);
    const p = ENGINE.parsePly(crlf), q = ENGINE.parsePly(lf);
    ok(p.count === N && q.count === N, "both line endings yield the same vertex count");
    let d = 0;
    for (let i = 0; i < p.positions.length; i++) d = Math.max(d, Math.abs(p.positions[i] - q.positions[i]));
    ok(d === 0, "and byte-identical geometry -- the line ending changes the header length, not the data");
    // The control: the LF path must still work, so a "fix" that skipped the marker entirely cannot pass.
    ok(q.positions[3] === FIXTURE[1].x, "control: the LF path still reads the right vertex, so the scan was not simply loosened");
    // And the same file through the other parser, which never had the bug.
    ok(GPU.parsePlyBinary(crlf).count === N, "gpu/SplatLoader reads it too -- as it always did");
}

// 6) REFUSALS ARE REFUSALS WITH REASONS.
//
//    engine/splatParser deliberately supports only binary little-endian; that is a narrower reader, not a
//    broken one. What matters is that it says WHICH format it was handed, because "unsupported" with no
//    noun sends the reader to re-export at random.
{
    const be = threw(() => ENGINE.parsePly(ab(writePly(FIXTURE, { format: "binary_big_endian" }))));
    ok(be && /binary_big_endian/.test(be), `big-endian is refused BY NAME: ${be}`);
    const asc = threw(() => ENGINE.parsePly(ab(writePly(FIXTURE, { format: "ascii" }))));
    ok(asc && /ascii/.test(asc), `ascii is refused BY NAME: ${asc}`);
    const notPly = threw(() => ENGINE.parsePly(new TextEncoder().encode("this is a png, honestly").buffer));
    ok(notPly && /end_header/.test(notPly), "a non-ply is refused for the reason it actually failed");
    // A header that promises more vertices than the body holds. gpu/SplatLoader checks the arithmetic;
    // without that the read walks off the end and returns zeros that look like a sparse cloud.
    const short = writePly(FIXTURE);
    const truncated = short.subarray(0, short.length - 100);
    const t = threw(() => GPU.parsePlyBinary(ab(truncated)));
    ok(t && /\bbody is\b.*\bneed\b/.test(t), `a truncated body is refused with the arithmetic: ${t}`);
    ok(threw(() => GPU.parseSplat(new ArrayBuffer(33))) !== null, "a .splat whose length is not a multiple of 32 is refused");
    ok(threw(() => GPU.parseSplatFile(ab(writePly(FIXTURE)), "scene.obj")) !== null, "and an extension neither parser owns is refused");
}

// 7) THE .splat ROUND TRIP, WITH ITS LOSS MEASURED RATHER THAN ASSUMED.
{
    const sp = writeSplat(FIXTURE);
    const a = ENGINE.parseSplat(ab(sp));
    const b = GPU.parseSplat(ab(sp));
    ok(a.count === N && b.count === N, `.splat carries all ${N} gaussians`);
    let lScale = 0, lOpac = 0, lQuat = 0, lCol = 0;
    for (let i = 0; i < N; i++) {
        for (let k = 0; k < 3; k++) {
            lScale = Math.max(lScale, Math.abs(a.scales[i * 3 + k] - FIXTURE[i].scale[k]));
            lCol   = Math.max(lCol,   Math.abs(a.colors[i * 3 + k] - toShaderConvention(FIXTURE[i]).color[k]));
        }
        for (let k = 0; k < 4; k++) lQuat = Math.max(lQuat, Math.abs(a.quats[i * 4 + k] - FIXTURE[i].rot[k]));
        lOpac = Math.max(lOpac, Math.abs(a.opacities[i] - FIXTURE[i].opacity));
    }
    // Scale survives: it goes through float32 linear and back through log, so only float32 epsilon is lost.
    ok(lScale < 1e-6, `.splat preserves scale through exp/log to float32 precision (${lScale.toExponential(2)})`);
    // *** THESE TWO DO NOT SURVIVE, AND THE NUMBERS ARE THE POINT. ***
    // A quaternion component is stored as round(q * 128 + 128), so +1 needs the byte 256 and clamps to 255,
    // coming back as 0.9921875. That is a 0.0078 error on a UNIT quaternion, i.e. the rotation is wrong by a
    // real, if small, angle -- worth knowing before anyone treats .splat as a lossless interchange format.
    ok(lQuat > 0.007 && lQuat < 0.009,
        `.splat quantises quaternions to 8 bits: worst component error ${lQuat} (a +1 component cannot be represented at all)`);
    // Alpha is worse than it looks. A nearly-transparent splat (sigmoid 0.0025) lands on byte 1 (0.0039),
    // which is a 57% error in linear alpha and 0.46 in logit space.
    ok(lOpac > 0.4 && lOpac < 0.6,
        `.splat quantises alpha to 8 bits: worst opacity error ${lOpac.toFixed(4)} in logit space, on the nearly-transparent splat`);
    ok(lCol < 0.002, `and colour to within one byte (${lCol.toFixed(6)})`);
    // The two parsers disagree in SHAPE on .splat too, and both disagreements are ones their renderers handle.
    ok(a.scales.some((s) => s < 0) && b.scales.every((s) => s > 0),
        "engine logs the .splat's linear scale back down; gpu leaves it linear -- each for its own renderer");
    ok(b.rotations instanceof Uint8Array,
        "gpu leaves .splat rotations as raw bytes, which render/SplatRenderer.js dequantises at load");
}

// 8) THE CONVENTIONS MATCH WHAT THE RENDERERS ACTUALLY CONSUME.
//
//    Sections 2-4 check the parsers against plyWriter's idea of the two conventions. That is only worth
//    anything if plyWriter's idea matches the shaders. These read the renderers.
//
//    NOTE: the GLSL lives inside template literals, so it must be scanned with noComments() -- codeOnly()
//    blanks string contents and would make every one of these pass on an empty haystack.
{
    const engineR = noComments(read("engine/SplatRenderer.js"));
    ok(/exp\(a_scale\)/.test(engineR),
        "*** engine/SplatRenderer.js applies exp(a_scale) IN THE SHADER -- which is why its parser must not ***");
    ok(/1\.0 \/ \(1\.0 \+ exp\(-a_opacity\)\)/.test(engineR),
        "*** and the sigmoid too -- so its parser must hand back the raw logit ***");
    ok(/a_opacity/.test(engineR) && /pre-sigmoid/.test(prose(read("engine/SplatRenderer.js"))),
        "and the shader's own comment says the attribute is pre-sigmoid");

    const renderR = noComments(read("render/SplatRenderer.js"));
    ok(/aScale \* uModelScale/.test(renderR),
        "render/SplatRenderer.js multiplies aScale straight into the covariance -- no exp, so its loader must apply one");
    ok(!/exp\(aScale\)/.test(renderR), "*** and there is no exp(aScale) anywhere in it, which is the half of that claim that can rot ***");
    ok(/UNSIGNED_BYTE/.test(codeOnly(read("render/SplatRenderer.js"))),
        "and uploads colour as UNSIGNED_BYTE, which is why its loader quantises to 8 bits");
    ok(/vOpacity \* exp\(power\)/.test(renderR),
        "its fragment shader multiplies vOpacity by the gaussian falloff without a sigmoid, so alpha arrives already linear");

    // The loaders each state their side, in code rather than only in prose.
    ok(/Math\.exp\(vals\.scale_0\)/.test(codeOnly(read("gpu/SplatLoader.js"))), "gpu/SplatLoader applies Math.exp to scale_0");
    ok(/1 \/ \(1 \+ Math\.exp\(-vals\.opacity\)\)/.test(codeOnly(read("gpu/SplatLoader.js"))), "and the sigmoid to opacity");
    ok(!/Math\.exp/.test(codeOnly(read("engine/splatParser.js")).replace(/Math\.log/g, "")),
        "*** and engine/splatParser applies NO exp on the .ply path -- the assertion that would go red if someone 'fixed' it ***");
}

// 9) THE DUPLICATION IS RECORDED AS A NUMBER, NOT A COMPLAINT.
{
    const files = ["engine/splatParser.js", "gpu/SplatLoader.js", "engine/SplatRenderer.js",
                   "render/SplatRenderer.js", "gpu/SplatScene.js", "engine/splatGenerator.js", "engine/plyWriter.mjs"];
    const lines = files.map((f) => read(f).split("\n").length);
    const total = lines.reduce((a, b) => a + b, 0);
    ok(total > 2500, `the splat stack is ${total} lines across ${files.length} files (${files.map((f, i) => f.split("/").pop() + " " + lines[i]).join(", ")})`);
    // Two parsers of one format is a fact about this tree. It is defensible -- each feeds a different
    // renderer with a different convention -- but it is only defensible while both are held to the same
    // fixture, which is what sections 2-4 now do.
    const plyReaders = files.filter((f) => /end_header/.test(read(f)));
    ok(plyReaders.length === 3,
        `${plyReaders.length} files walk a .ply header: ${plyReaders.join(", ")} -- two parsers and one writer, all gated by the fixture above`);
    ok(/from "\.\.\/\.\.\/engine\/plyWriter\.mjs"/.test(noComments(read("tools/ship/splatRoundTrip-selfcheck.mjs"))),
        "and this gate builds its own fixture rather than vendoring a capture");
    const w = codeOnly(read("engine/plyWriter.mjs"));
    ok(!/\bdocument\b|\bwindow\b|\bWebGL|require\(|node:/.test(w), "the writer is pure -- no DOM, no GL, no fs, so a gate and a browser read the same bytes");
    ok(!/Math\.random|Date\.now|performance\.now/.test(w), "and has no clock and no randomness, so the fixture is the same bytes every run");
    ok(Object.isFrozen(FIXTURE) && FIXTURE.every(Object.isFrozen), "and the fixture is frozen, so one gate cannot edit the ground truth another asserts against");
    ok(Math.abs(SH_C0 - 0.28209479177387814) < 1e-15, "SH_C0 is Y_00, shared by both parsers and the writer");
}

// 10) THE EXPORT ROUND TRIP -- WRITE, READ, WRITE AGAIN -- AND THE ONE FIELD THAT DOES NOT SURVIVE IT.
//
//     This is what window.splat.save() does, and it is the strongest single statement the fixture can make:
//     a file this tree wrote, parsed by this tree, and written again must reproduce itself. Where it does
//     not, the gate says which field and by how much, rather than relaxing until it passes.
{
    const first = writePly(FIXTURE);
    const gaussians = fromShaderConvention(ENGINE.parsePly(ab(first)));
    const again = writePly(gaussians);
    ok(gaussians.length === N, `${gaussians.length} gaussians survive parse-and-rebuild`);
    ok(again.length === first.length, "the re-written file is exactly as long as the original");

    // Walk the two bodies property by property and name every field that moved.
    const hdr = new TextDecoder().decode(first).indexOf("end_header\n") + "end_header\n".length;
    const stride = PLY_PROPS.length * 4;
    const moved = new Set();
    for (let i = 0; i < N; i++) {
        for (let p = 0; p < PLY_PROPS.length; p++) {
            const o = hdr + i * stride + p * 4;
            for (let k = 0; k < 4; k++) if (first[o + k] !== again[o + k]) moved.add(PLY_PROPS[p]);
        }
    }
    // *** EVERY FIELD EXCEPT COLOUR IS BYTE-EXACT THROUGH A FULL EXPORT CYCLE. ***
    ok([...moved].every((m) => /^f_dc_/.test(m)),
        `only colour moves through write->read->write; positions, scales, quaternions and opacity are byte-exact (moved: ${[...moved].join(",") || "nothing"})`);
    ok(moved.size > 0, "and colour DOES move, so this section is measuring something rather than asserting a tautology");

    // Colour splits cleanly in two, and the split is the clamp.
    let unsat = 0, sat = 0;
    FIXTURE.forEach((f, i) => {
        for (let k = 0; k < 3; k++) {
            const display = 0.5 + SH_C0 * f.color[k];
            const d = Math.abs(gaussians[i].color[k] - f.color[k]);
            if (display < 0 || display > 1) sat = Math.max(sat, d); else unsat = Math.max(unsat, d);
        }
    });
    ok(unsat < 1e-6, `where the colour fits the displayable range it round trips to float32 precision (${unsat.toExponential(2)})`);
    ok(sat > 1, `*** and where it SATURATED it is gone, by ${sat.toFixed(2)} -- the parser clamps f_dc to 0..1 on the way in, so the export cannot invent it back ***`);

    // The .splat export is a real file the other parser can read -- the export is not write-only.
    const sbytes = writeSplat(gaussians);
    ok(GPU.parseSplat(ab(sbytes)).count === N, "the exported .splat is readable by the OTHER parser, so export and import are not a closed loop");
    ok(ENGINE.parseSplatFile(ab(writePly(gaussians)), "out.ply").count === N, "and the exported .ply routes correctly through parseSplatFile by extension");
}

// 11) THE WIRING IS REAL, NOT A CLAIM IN A COMMENT.
//
//     v4194 shipped a gate that proved a helper was MENTIONED rather than USED, and it passed with the
//     feature sabotaged out. So this reads main.js for the actual call, not for the word.
{
    const m = codeOnly(read("main.js"));
    ok(/from "\.\/engine\/plyWriter\.mjs"/.test(noComments(read("main.js"))),
        "main.js imports the writer -- so engine/plyWriter.mjs is wired, not gate-only");
    ok(/fromShaderConvention\(sp\)/.test(m), "*** and window.splat.save CALLS fromShaderConvention on the loaded struct ***");
    ok(/writeSplat\(gaussians\)/.test(m) && /writePly\(gaussians,/.test(m), "and calls both writers, so both formats are reachable from the API");
    ok(/save:/.test(m), "the API exposes save() beside load(), add() and bake()");
    ok(/opts\.download !== false/.test(m),
        "and save() can return the bytes WITHOUT touching the DOM, which is what makes it testable at all");
}

console.log(`splatRoundTrip-selfcheck: ${pass} passed, ${fail} failed`);
if (!fail) console.log(`unchecked here: whether a real scanner's 2-million-gaussian capture looks right on screen.
What is checked is that a .ply this tree wrote comes back through BOTH of its parsers as the gaussians that
went in, that the two shapes differ by exactly exp and a sigmoid and nothing else, that a CRLF header no
longer defeats the parser main.js uses, and that .splat's 8-bit quantisation costs 0.0078 of a quaternion
component and 0.46 of a logit -- measured, not assumed.`);
process.exit(fail ? 1 : 0);
