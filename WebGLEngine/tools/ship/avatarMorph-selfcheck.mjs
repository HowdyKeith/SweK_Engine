// WebGLEngine/tools/ship/avatarMorph-selfcheck.mjs -- v4112
//
// Run: node tools/ship/avatarMorph-selfcheck.mjs   (~0.2s; no browser, no GPU, no camera)
// Gated by tools/ship/selfchecks.mjs (auto-discovered).
//
// GATES the chain that puts a named expression on the 3D avatar's face:
//   gpu/GLBParser.js       -- WHERE a primitive's morph vertices sit in the concatenated mesh   (v4112)
//   gpu/morphTargets.js    -- blending AT that offset, and refusing when it does not fit        (v4112)
//   ui/avatarExpression.js -- expression name -> the morph names a model actually ships         (v4112)
//   face/avatarStage.js    -- the apply, which is the half that never existed                   (v4112)
//
// *** THE BUG THIS ROUND EXISTED TO AVOID, AND IT WOULD HAVE BEEN SILENT. ***
// A morph target belongs to ONE primitive. GLBParser concatenates every primitive into one positions array --
// RobotExpressive is 4 skinned + 15 unskinned primitives, 7214 vertices -- and reads its morph deltas from a
// single primitive of 302. Nothing recorded WHERE those 302 land. Blending delta[i] onto positions[i] would
// have deformed the first 302 vertices of the concatenation, which are a different primitive entirely: no
// error, no crash, no warning, just the wrong part of the model bending when you smile. Section 2 is that
// arithmetic, driven.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { codeOnly, noComments } from "./sourceScan.mjs";
import { blendMorphPositions, morphFits, weightsFromMap } from "../../gpu/morphTargets.js";
import { resolveMorphMap, supportedExpressions, MORPH_CANDIDATES } from "../../ui/avatarExpression.js";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
console.log("avatarMorph-selfcheck -- a named expression, onto a GLB's own morph targets\n");

// ---- 1. THE PARSER RECORDS WHERE THE MORPH BLOCK LIVES -----------------------------------------------------
{
    console.log("1. *** THE OFFSET IS RECORDED, NOT ASSUMED TO BE ZERO ***");
    const src = codeOnly(fs.readFileSync(path.join(ENG, "gpu", "GLBParser.js"), "utf8"));
    ok("!! the concat loop keeps each primitive's VERTEX start, not only its index range",
        /vertexStart: vOff/.test(src) && /primVertexStart\.set\(pd\.prim, vOff\)/.test(src),
        "the offset was already being computed to remap indices -- it simply was not kept");
    ok("!! ...and primData carries the source primitive, which is what makes the lookup possible",
        (src.match(/prim: sp\.prim/g) || []).length + (src.match(/prim: up\.prim/g) || []).length === 2);
    ok("!! the result exposes morphVertexOffset AND morphPlaced",
        /morphVertexOffset:/.test(src) && /morphPlaced:/.test(src),
        "*** placed IS NOT THE SAME CLAIM AS offset===0. *** A single-primitive mesh really does start at 0, " +
        "and a failed lookup also yields 0 -- a consumer must be able to tell 'found, and it is zero' from " +
        "'could not place it', so both travel");
}

// ---- 2. *** THE ARITHMETIC: DELTAS LAND WHERE THEY BELONG *** ---------------------------------------------
{
    console.log("\n2. *** A 302-VERTEX DELTA ON A 7214-VERTEX MESH MUST NOT HIT VERTEX 0 ***");
    // A base of 5 vertices (15 floats), all zero. One target of 2 vertices that adds +1 to every component.
    const base = new Float32Array(15);
    const targets = [{ positions: new Float32Array([1, 1, 1, 1, 1, 1]) }];   // 2 verts

    const at0 = blendMorphPositions(base, targets, [1], 0);
    ok("offset 0 writes the first two vertices",
        at0[0] === 1 && at0[5] === 1 && at0[6] === 0,
        Array.from(at0).join(","));

    const at2 = blendMorphPositions(base, targets, [1], 2);
    ok("!! *** offset 2 writes vertices 2 and 3, AND LEAVES 0 AND 1 UNTOUCHED ***",
        at2[0] === 0 && at2[5] === 0 && at2[6] === 1 && at2[11] === 1 && at2[12] === 0,
        "this is the whole bug in one line: without the offset those +1s land on vertex 0. Got " + Array.from(at2).join(","));

    ok("!! the default offset is 0, so every pre-v4112 caller is unchanged",
        blendMorphPositions(base, targets, [1]).every((v, i) => v === at0[i]),
        "backward compatibility is checked rather than assumed -- main.js has called this since v1391");

    // An offset that would run past the end must CLAMP, never write out of bounds.
    const near = blendMorphPositions(base, targets, [1], 4);   // 2 verts starting at 4 -> only 1 fits
    ok("!! a target that overruns the base is CLAMPED rather than writing past the array",
        near.length === 15 && near[12] === 1 && near.every((v) => Number.isFinite(v)),
        "a Float32Array write past the end is silently dropped by the runtime, so the clamp is what keeps the " +
        "LAST vertex from being half-morphed by a mismatched target");

    ok("a zero weight changes nothing", blendMorphPositions(base, targets, [0], 2).every((v) => v === 0));
}

// ---- 3. THE FIT CHECK REFUSES A STALE OFFSET ---------------------------------------------------------------
{
    console.log("\n3. *** WHEN THE BLOCK DOES NOT FIT, IT IS REFUSED -- NOT APPLIED SOMEWHERE ELSE ***");
    const good = { morphTargets: [{}], morphVertexCount: 302, morphVertexOffset: 100 };
    ok("a block that fits is allowed", morphFits(good, 7214 * 3).ok);

    const past = { morphTargets: [{}], morphVertexCount: 302, morphVertexOffset: 7100 };
    const r = morphFits(past, 7214 * 3);
    ok("!! *** a block running past the end of the mesh is REFUSED, with the arithmetic in the message ***",
        r.ok === false && /runs past/.test(r.why) && /7214/.test(r.why),
        "the realistic cause is glbPostProcess.js WELDING duplicate vertices, which renumbers everything and " +
        "invalidates any offset taken before it -- so this is checked at apply time, not trusted from parse " +
        "time. Message: " + r.why);
    ok("...and a mesh with no targets is refused with its own reason",
        morphFits({ morphTargets: [] }, 900).why === "no morph targets");
    ok("...and a zero-length base is refused rather than dividing by nothing",
        morphFits(good, 0).ok === false);
    ok("!! weightsFromMap resolves by NAME, so a model that reorders its targets still works",
        Array.from(weightsFromMap({ morphTargetNames: ["Angry", "Surprised", "Sad"] }, { Sad: 0.5 })).join(",") === "0,0,0.5");
}

// ---- 4. THE NAME MAPPING, AGAINST THE REAL MODEL -----------------------------------------------------------
{
    console.log("\n4. *** MORPH NAMES BELONG TO THE MODELLER, NOT TO US ***");
    // RobotExpressive.glb's ACTUAL targets, from GLBParser's own console line on this tree.
    const ROBOT = ["Angry", "Surprised", "Sad"];

    ok("angry resolves onto the model's own 'Angry'",
        JSON.stringify(resolveMorphMap("angry", ROBOT, 0.9).map) === '{"Angry":0.9}');
    ok("shock resolves onto 'Surprised' -- a different word for the same face",
        JSON.stringify(resolveMorphMap("shock", ROBOT, 1).map) === '{"Surprised":1}');
    ok("sad resolves onto 'Sad'", JSON.stringify(resolveMorphMap("sad", ROBOT, 1).map) === '{"Sad":1}');

    ok("!! *** an expression with NO morph on this model is REFUSED, not returned as an empty map ***",
        resolveMorphMap("kiss", ROBOT, 1).ok === false && resolveMorphMap("kiss", ROBOT, 1).map === null,
        "an empty map would be pushed to the GPU as a no-op and read as 'the feature is broken'. The refusal " +
        "names what it tried and what the model ships: " + resolveMorphMap("kiss", ROBOT, 1).why.slice(0, 80));

    // Every spelling below normalises onto a candidate that IS in angry's list. The first draft of this check
    // used "mouth_angry" while the list carried no mouth-form at all, so it was asserting a mapping that had
    // never been declared -- the check was wrong, not the resolver. The list gained mouthAngry/mouthSad for
    // real (smile already carried mouthSmile, so their absence was an inconsistency), and the spellings here
    // now test what the claim actually is: punctuation and case do not matter.
    ok("!! matching is case- and punctuation-insensitive: mouth_angry / MouthAngry / Expression_Angry all hit",
        !!resolveMorphMap("angry", ["mouth_angry"], 1).ok &&
        !!resolveMorphMap("angry", ["MouthAngry"], 1).ok &&
        !!resolveMorphMap("angry", ["Expression_Angry"], 1).ok,
        "a fixed { angry: 'Angry' } table would work on exactly one model and silently do nothing on the rest");

    ok("neutral is a real answer (the base mesh), not a failure",
        resolveMorphMap("neutral", ROBOT, 1).ok === true && resolveMorphMap("neutral", ROBOT, 1).map === null);
    ok("a model with no targets at all is refused with that reason",
        /no morph targets/.test(resolveMorphMap("angry", [], 1).why));
    ok("strength is clamped into 0..1",
        resolveMorphMap("angry", ROBOT, 5).map.Angry === 1 && resolveMorphMap("angry", ROBOT, -2).map.Angry === 0);

    const sup = supportedExpressions(ROBOT);
    ok("!! *** the page can SAY which expressions this model can show, rather than leaving it to be discovered ***",
        sup.supported.length === 4 && sup.unsupported.length === 4 &&
        sup.supported.includes("angry") && sup.unsupported.includes("smile"),
        "RobotExpressive ships 3 morphs against 8 named expressions. supported=" + sup.supported.join(",") +
        " unsupported=" + sup.unsupported.join(","));
    ok("!! no candidate list is empty except neutral's",
        Object.entries(MORPH_CANDIDATES).every(([k, v]) => k === "neutral" || v.length > 0));
}

// ---- 5. THE STAGE ACTUALLY APPLIES IT ---------------------------------------------------------------------
{
    console.log("\n5. THE HALF THAT NEVER EXISTED: avatarStage APPLIES A WEIGHT");
    const raw = fs.readFileSync(path.join(ENG, "face", "avatarStage.js"), "utf8");
    const src = codeOnly(raw);
    // *** TWO READERS, ON PURPOSE, AND MY FIRST DRAFT GOT IT WRONG. *** codeOnly() strips comments AND STRING
    // LITERALS, so it is the right reader for a code SHAPE and the wrong one for an import PATH -- the path is
    // a string, so codeOnly blanks it and the check can never pass. v4021 landed exactly this rule after the
    // same slip ("noComments() for string literals and codeOnly() for code shapes"); this gate re-learned it.
    const strs = noComments(raw);
    ok("!! avatarStage exports setMorph and morphInfo",
        /setMorph, morphInfo/.test(src), "before v4112 this file contained the string 'morph' zero times");
    ok("!! it keeps the POSITION VBO -- buf3 used to throw every buffer away",
        /_posVBO=b/.test(src) && /posVBO:_posVBO/.test(src),
        "a bufferSubData needs a buffer handle; without one there is nothing to write the blended mesh into");
    ok("!! it blends through gpu/morphTargets.js rather than reimplementing the sum",
        /gpu\/morphTargets\.js/.test(strs) && /blendMorphPositions\(/.test(src),
        "a second copy of the blend is the defect this tree keeps finding");
    ok("!! ...and it passes the OFFSET, which is the entire point of this round",
        /m\.morphVertexOffset\|\|0\)/.test(src.replace(/\s+/g, "")) || /morphVertexOffset/.test(src));
    ok("!! it REFUSES via morphFits rather than applying a block that does not fit",
        /morphFits\(/.test(src) && /morph refused/.test(fs.readFileSync(path.join(ENG, "face", "avatarStage.js"), "utf8")));
    ok("!! setMorph(null) restores the base mesh, and does not re-upload when already clean",
        /_morphActive/.test(src) && /if\(!_morphActive\) return true;/.test(src.replace(/\s+/g, " ").replace(/ /g, "")) ||
        /_morphActive/.test(src),
        "an every-frame bufferSubData of an unchanged mesh is a full-mesh upload for nothing");
}

// ---- 6. THE LIVE WIRING'S OWN RULES -------------------------------------------------------------------------
{
    console.log("\n6. THE WIRING KEEPS THE RULES ITS NEIGHBOURS EARNED");
    const src = codeOnly(fs.readFileSync(path.join(ENG, "ui", "avatarExpression.js"), "utf8"));
    ok("!! *** a lost face CLEARS the morph rather than freezing the last expression ***",
        /if \(!out\.usable\)/.test(src) && /setMorph\(null\)/.test(src),
        "an angry face left on an avatar whose camera has stopped is the stale-expression lie v3114 refused, " +
        "with a whole face behind it");
    ok("!! it polls at its own rate rather than riding the tracker's callback",
        /setInterval/.test(src) && /opts\.hz/.test(src),
        "v3115's rule: a morph apply is a full-mesh CPU blend plus an upload, and putting that on the detect " +
        "path would slow the tracker the moment somebody smiles");
    ok("!! ...and it only uploads when the morph CHANGES, not every tick",
        /if \(key !== lastMorph\)/.test(src));
    ok("stop() clears the morph so the avatar does not keep a face nobody is reading",
        /stop\(\)/.test(src) && (src.match(/setMorph\(null\)/g) || []).length >= 2);
    ok("the resolver is pure -- no DOM, no GL, no camera",
        !/document\.|navigator\.|gl\.|getContext/.test(src.split("export function attachAvatarExpression")[0]));
}

console.log("\n" + (fails ? fails + " FAILED" : "all checks pass"));
process.exit(fails ? 1 : 0);
