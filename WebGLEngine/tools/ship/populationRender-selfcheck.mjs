// tools/ship/populationRender-selfcheck.mjs
//
// Run: node tools/ship/populationRender-selfcheck.mjs   (instant)
//
// v3150 -- THE FIELD CAN NOW BE SEEN, AND THE DRAW INTENT IS CHECKED WHERE THERE IS NO GPU.
//
// The population has been readable since v3118, writable since v3122 and able to GROW since v3149, and NOTHING
// HAD EVER DRAWN IT. Every existing check on it is numeric -- conservation, bounded motion, determinism, a JS
// reference -- and they share one blind spot: *** THEY ALL COMPARE THE SIMULATION TO ITSELF. *** A field that
// agrees with its own reference and looks like static, or a clump, or nothing at all, passes every one.
//
// THIS GATE CANNOT SEE PIXELS AND DOES NOT PRETEND TO. It uses render/glBootstrap.js's RECORDING CONTEXT to
// check the SHAPE OF THE CALL -- one instanced draw, the right instance count, no readback, no write to the
// field -- and the shader SOURCE for the properties that decide whether the picture is honest. Whether it
// actually looks like a population is Keith's to answer on the rig, and that division is the point rather than
// an apology.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ENG = path.resolve(HERE, "..", "..");
let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const R = await import(pathToFileURL(path.join(ENG, "sim", "populationRender.js")).href);
const P = await import(pathToFileURL(path.join(ENG, "sim", "populationField.js")).href);
const G = await import(pathToFileURL(path.join(ENG, "render", "glBootstrap.js")).href);

const field = P.fieldPlan({ side: 256 });
const rec = G.makeRecordingGL({ width: 64, height: 64 });
const result = R.drawPopulation(rec.gl, { program: {}, fieldTex: {}, field, viewProj: new Float32Array(16) });

// ---- 1. ONE INSTANCED DRAW, NOT A MILLION ----------------------------------------------------------------------
{
    const draws = rec.find("drawArraysInstanced");
    ok("!! the whole field is ONE instanced draw",
        draws.length === 1 && result.calls === 1,
        draws.length + " draw call(s) for " + field.slots + " slots. A CPU loop over agents would be " +
        field.slots + " calls -- THE READBACK MISTAKE IN ANOTHER COSTUME, since both trade a bounded GPU cost " +
        "for an unbounded per-agent one on the wrong side of the bus");

    ok("!! and the instance count is EVERY SLOT, with the reason stated",
        draws[0].args[3] === field.slots && R.instanceCount(field) === field.slots,
        draws[0].args[3] + " instances. THE LIVE COUNT IS NOT KNOWN ON THE CPU WITHOUT A READBACK, and a " +
        "readback per frame is exactly what v3118 removed -- so the draw covers the field and the shader " +
        "collapses the dead. The cost is stated rather than hidden: 1,048,576 instances at side 1024 whether " +
        "twelve agents are alive or a million");

    ok("...and a field plan without slots is REFUSED, not defaulted",
        (() => { try { R.instanceCount({ side: 8 }); return false; } catch { return true; } })(),
        "defaulting to zero would draw nothing and look like an empty world -- the quietest failure in this " +
        "subsystem, and the one v3122 already paid for once");
}

// ---- 2. THE DRAW DOES NOT DO THE TWO THINGS THAT WOULD UNDO EARLIER ROUNDS -------------------------------------------
{
    ok("!! the render path NEVER reads back",
        rec.find("readPixels").length === 0 && rec.find("getBufferSubData").length === 0,
        "a readback here reintroduces the 16 MB sync stall v3118 spent a round removing, and it would arrive " +
        "disguised as a rendering feature rather than a pipeline decision");

    ok("!! and never binds the field as a draw TARGET",
        rec.find("bindFramebuffer").length === 0 && rec.find("framebufferTexture2D").length === 0,
        "sampling a texture while it is bound as a render target is UNDEFINED in GL and LOOKS ALMOST RIGHT -- " +
        "the same trap as writing into the texture being read in the ping-pong (v3119)");

    ok("...and it binds the field for READING, with the sampler unit set",
        rec.find("bindTexture").length === 1 && rec.find("uniform1i").length >= 1,
        "one texture bind and the sampler uniform -- if the unit were never set, the shader would sample unit " +
        "0 by luck and break the day anything else binds first");
}

// ---- 3. THE PROPERTIES THAT DECIDE WHETHER THE PICTURE IS HONEST ---------------------------------------------------
{
    // A shader lives in a TEMPLATE LITERAL, so codeOnly() blanks it entirely -- v3121's species. These strip
    // the shader's OWN comments before asserting, because the warnings say the same words as the code.
    const stripShader = (src) => src.replace(/\/\/[^\n]*/g, " ").replace(/\/\*[\s\S]*?\*\//g, " ");
    const vert = stripShader(R.VERT_SRC);

    ok("!! a DEAD agent is collapsed to zero size AND pushed behind the near plane",
        /gl_PointSize\s*=\s*0\.0/.test(vert) && /gl_Position\s*=\s*vec4\(0\.0,\s*0\.0,\s*-2\.0,\s*1\.0\)/.test(vert),
        "EITHER ALONE LEAVES A DRIVER-DEPENDENT DOT. And a dead agent drawn at its death position gives a " +
        "field that never empties, while drawing it at the origin gives A GROWING PILE AT (0,0,0) that looks " +
        "like a physics bug and is a rendering one");

    ok("!! the position comes from the TEXEL, never from the instance id",
        /uViewProj\s*\*\s*vec4\(texel\.rgb/.test(vert) && !/vec4\(float\(slot\)/.test(vert),
        "v3121's law in the other direction: gl_InstanceID indexes THE SLOT and the texel carries the " +
        "position. Using the id as a coordinate gives a smooth convincing lattice corresponding to nothing in " +
        "the world -- and it would look right");

    ok("!! it uses texelFetch, not texture()",
        /texelFetch\(/.test(vert) && !/\btexture\(\s*uField/.test(vert),
        "a LINEAR sample between two packed integers gives a value that is neither, whose low bit -- the " +
        "liveness bit -- is noise (v3119)");

    ok("...and liveness is read with a rounding floor, never a truncating cast",
        /floor\(packed\s*\*\s*0\.5\s*\+/.test(vert) && !/int\(packed\)/.test(vert),
        "the same rule the update shader is gated on: a truncating cast turns 2049.0 stored as 2048.9999 into " +
        "the wrong parity, which reads as the wrong liveness");

    ok("...and the fragment shader colours BY KIND",
        /vKind/.test(stripShader(R.FRAG_SRC)),
        "a field drawn in one colour hides exactly what the kind channel exists to carry -- an all-one-kind " +
        "population would be indistinguishable from a mixed one");
    console.log("  ----  WHAT THIS GATE CANNOT DO: see pixels. It checks the SHAPE of the call and the");
    console.log("        PROPERTIES of the shader source. Whether the field looks like a population -- and not");
    console.log("        like static, a clump, or an empty screen -- is a rig question, and it is now ASKABLE,");
    console.log("        which it was not before this round.");
}

// ---- 4. v3150: THE PAGE HAS A FRONT DOOR, AND A BLANK CANVAS IS NEVER THE EXPECTED ANSWER --------------------
{
    const page = fs.readFileSync(path.join(ENG, "population.html"), "utf8");
    ok("!! population.html has a canvas and a draw button",
        /id="popCanvas"/.test(page) && /id="drawBtn"/.test(page) && /drawPopulation\(/.test(page),
        "A MODULE WITH NO CALLER IS UNFINISHED (v3114/v3115). The page was already in the render-qa manifest, " +
        "so a compile failure in these shaders becomes a QA failure without anyone remembering to look");

    ok("!! and it SEEDS a population before drawing, so blank is never expected",
        /sim\.seed\(rgba\)/.test(page) && /AN EMPTY CANVAS MEANS/.test(page),
        "v3122's lesson wearing a picture: a system whose checks pass because it does nothing is the quietest " +
        "failure here, and an empty canvas that could mean 'nothing spawned yet' would be exactly that. Two " +
        "thirds are seeded alive on purpose");

    ok("!! the three outcomes stay apart on the page too",
        /UNSUPPORTED: no WebGL2/.test(page) && /EXT_color_buffer_float missing/.test(page) && /FAILED: /.test(page),
        "ran / UNSUPPORTED (the capability NAMED) / FAILED, as v3120 established -- one word for 'this laptop " +
        "is limited' and 'this shader is broken' would make every machine without float targets look defective");

    const gpu = fs.readFileSync(path.join(ENG, "sim", "populationGPU.js"), "utf8");
    ok("!! currentTexture() returns the READ side of the ping-pong",
        /currentTexture\(\) \{ return src\.tex; \}/.test(gpu),
        "sampling a texture while it is bound as a draw target is UNDEFINED in GL and LOOKS ALMOST RIGHT -- " +
        "the same trap v3119 gated in the update pass. And it is a GETTER, because a caller holding a stale " +
        "reference across a swap samples LAST FRAME'S FIELD and sees a world one step behind, which reads as " +
        "a physics choice rather than a bug");
}

console.log();
if (fails) { console.log("populationRender-selfcheck: " + fails + " FAILURES"); process.exit(1); }
console.log("populationRender-selfcheck: all checks pass");
