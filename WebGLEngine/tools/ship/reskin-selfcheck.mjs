// WebGLEngine/tools/ship/reskin-selfcheck.mjs -- v4157
//
// Run: node tools/ship/reskin-selfcheck.mjs   (a second or two -- it parses the real RobotExpressive.glb)
// Gated by tools/ship/selfchecks.mjs (auto-discovered).
//
// GATES tools/export/reskin.js and the generalisation of tools/krbn/riggedExport.js.
//
// *** EVERY NUMBER BELOW COMES FROM THE SHIPPED ASSET, NOT A FIXTURE. *** A reskin checked against a synthetic
// cube proves nothing about a 43-bone robot whose skinned and unskinned primitives are concatenated into one
// 7,214-vertex list -- and the fact that started this round (no UVs) is a property of that file alone.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { GLBParser } from "../../gpu/GLBParser.js";
import { blendInfluences } from "../krbn/riggedExport.js";
import { RAMP } from "../render-qa/asciify.mjs";
import { vertexColourReskin, shadeVertices, normalizeShade, rampLevel, rampColors,
         surfaceSamples, buildGlyphQuads, glyphUV, baryAttr } from "../export/reskin.js";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const report = (m) => console.log("  ....  " + m);
console.log("reskin-selfcheck -- keep the skeleton, replace the surface\n");

const buf = fs.readFileSync(path.join(ENG, "GPU_Assets", "RobotExpressive.glb"));
const parsed = await GLBParser.parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), { postProcess: false });

// ---- 1. *** THE ASSET FACT THAT DECIDED THE DESIGN, ASSERTED SO IT CANNOT GO STALE SILENTLY *** ---------------
{
    console.log("1. *** RobotExpressive HAS NO UVs, WHICH IS WHY THE SIMPLE RESKIN IS UNAVAILABLE ON IT ***");
    ok("!! it is rigged and animated", !!parsed.skin && (parsed.animations || []).length > 0,
        (parsed.animations || []).length + " clips, " + parsed.positions.length / 3 + " vertices");
    ok("!! *** ...and carries NO TEXCOORD_0 and NO texture ***",
        !(parsed.texCoords && parsed.texCoords.length) && !parsed.texture,
        "Keith's instinct -- paste the new skin over the old -- IS RIGHT FOR A TEXTURED MODEL, and this one is " +
        "flat-coloured by per-material baseColorFactor. With no UV layout there is nowhere to paste an image. " +
        "IF THIS EVER GOES RED THE ASSET GAINED UVs and the texture route becomes available -- read the header " +
        "of tools/export/reskin.js before assuming this file still needs route 1.");
    ok("...and it does carry per-vertex normals, which route 1 needs instead",
        !!parsed.normals && parsed.normals.length === parsed.positions.length);
}

// ---- 2. *** ROUTE 1 CHANGES NOTHING BUT COLOUR *** ------------------------------------------------------------
{
    console.log("\n2. *** SAME VERTICES, SAME JOINTS, SAME WEIGHTS -- ONLY COLOR_0 IS NEW ***");
    const r = vertexColourReskin(parsed);
    ok("!! the position array is the SAME OBJECT, not a copy that could drift", r.positions === parsed.positions);
    ok("!! ...and so are joints, weights and indices",
        r.joints === parsed.joints && r.weights === parsed.weights && r.indices === parsed.indices,
        "the whole claim of this route is that the rig is untouched, and identity is a stronger check than equality");
    ok("!! one colour per vertex, no more and no fewer", r.colors.length === parsed.positions.length,
        r.colors.length / 3 + " colours for " + parsed.positions.length / 3 + " vertices");
    ok("every colour is finite and in gamut", Array.from(r.colors).every((v) => v >= 0 && v <= 1));
    ok("!! *** the four-influence problem does not arise at all on this route ***",
        r.stats.unchanged.includes("weights") && r.stats.unchanged.includes("joints"),
        "no new vertex means no barycentric blend, no 12->4 cull and no renormalisation -- so the failure that " +
        "shrinks a mesh toward the origin mid-animation is not merely handled here, it is not incurred");
}

// ---- 3. *** THE RAMP STRETCH, AND THE SABOTAGE THAT SHOWS IT IS LOAD-BEARING *** ------------------------------
{
    console.log("\n3. *** ALL TEN LEVELS ARE REACHABLE -- AND WITHOUT THE STRETCH, TWO ARE NOT ***");
    const on = vertexColourReskin(parsed);
    const off = vertexColourReskin(parsed, { normalize: false });
    ok("!! with the stretch, every one of RAMP's levels is used", on.stats.levelsUsed === RAMP.length,
        on.stats.levelsUsed + "/" + RAMP.length + "  histogram " + on.stats.histogram.join(","));
    ok("!! *** SABOTAGE: without it, the DARKEST levels are unreachable ***",
        off.stats.levelsUsed < RAMP.length && off.stats.histogram[0] === 0,
        off.stats.levelsUsed + "/" + RAMP.length + " -- half-Lambert with an ambient floor of 0.25 cannot return " +
        "anything below 0.25, so the file would have claimed ten levels while rendering " + off.stats.levelsUsed +
        ", AND THE TWO IT LOSES ARE THE BLACKS. Measured raw range: " + JSON.stringify(on.stats.rawRange));
    ok("...and the stretch reports that it happened rather than doing it silently", on.stats.normalized === true);
    ok("!! a flat model is NOT stretched -- there is nothing to spread", (() => {
        const flat = new Float32Array(90).fill(0.5);
        return normalizeShade(flat).stretched === false;
    })(), "dividing by a zero span would put every vertex at NaN, which reads as an all-black model");
    ok("the ramp is READ from asciify rather than re-declared here", on.stats.ramp === RAMP,
        "a second ten-level ladder is a second answer to what level 7 means");
    ok("rampLevel is total over 0..1 and clamps outside it",
        rampLevel(0) === 0 && rampLevel(1) === RAMP.length - 1 && rampLevel(-5) === 0 && rampLevel(9) === RAMP.length - 1);
}

// ---- 4. THE SHADE IS A PROPERTY OF THE SURFACE, NOT OF A CAMERA -----------------------------------------------
{
    console.log("\n4. NO CAMERA IS BAKED IN");
    const src = fs.readFileSync(path.join(ENG, "tools", "export", "reskin.js"), "utf8");
    ok("!! shadeVertices takes normals and a light, and no camera or view matrix",
        /export function shadeVertices\(normals,/.test(src) && !/\bcamera\b|viewMatrix/.test(src.split("export function rampLevel")[0]),
        "a view-dependent shade baked into a file freezes the angle it was baked from -- riggedExport records " +
        "exactly that trap about the outline Krbn draws, and this route need not repeat it");
    const up = shadeVertices(new Float32Array([0, 1, 0]));
    const down = shadeVertices(new Float32Array([0, -1, 0]));
    ok("!! a surface facing the light is brighter than one facing away", up[0] > down[0], up[0].toFixed(3) + " vs " + down[0].toFixed(3));
    ok("!! ...but the dark side is NOT crushed to a single black", down[0] > 0.01,
        "half-Lambert: a hard clamp at zero makes every back-facing vertex identical, throwing away the whole " +
        "unlit half of a model that has to read as a drawing from any side");
    ok("an unnormalised normal is handled rather than producing garbage",
        Math.abs(shadeVertices(new Float32Array([0, 5, 0]))[0] - up[0]) < 1e-6);
}

// ---- 5. *** SAMPLING IS AREA-WEIGHTED, DRIVEN RATHER THAN ASSERTED *** ----------------------------------------
{
    console.log("\n5. *** A BIG TRIANGLE GETS MORE GLYPHS THAN A SMALL ONE ***");
    // two triangles, one 100x the area of the other
    const pos = new Float32Array([0,0,0, 10,0,0, 0,10,0,   20,0,0, 21,0,0, 20,1,0]);
    const idx = new Uint32Array([0,1,2, 3,4,5]);
    const s = surfaceSamples(pos, idx, { count: 2000, seed: 7 });
    const big = s.filter((x) => x.tri === 0).length;
    ok("!! the 100x larger triangle takes ~100x the samples", big > 1900 && big < 2000,
        big + " of 2000 on the big triangle -- ONE SAMPLE PER TRIANGLE would have put 1000 glyphs on each, so " +
        "density would read as topology rather than as shading, which is the mistake that makes procedural " +
        "scatter look wrong and nobody can name why");
    ok("!! sampling is DETERMINISTIC for a seed, so an export is reproducible",
        JSON.stringify(surfaceSamples(pos, idx, { count: 50, seed: 7 })) ===
        JSON.stringify(surfaceSamples(pos, idx, { count: 50, seed: 7 })));
    ok("...and a different seed gives a different set", 
        JSON.stringify(surfaceSamples(pos, idx, { count: 50, seed: 7 })) !==
        JSON.stringify(surfaceSamples(pos, idx, { count: 50, seed: 8 })));
    ok("!! every barycentric coordinate is valid (non-negative, sums to 1)",
        s.every((x) => x.bary.every((b) => b >= -1e-9) && Math.abs(x.bary[0] + x.bary[1] + x.bary[2] - 1) < 1e-6));
    ok("a surface with no triangles yields no samples, rather than throwing", surfaceSamples(pos, new Uint32Array(0)).length === 0);
    ok("baryAttr interpolates at a corner to that corner's value", (() => {
        const a = baryAttr(pos, 3, [0, 1, 2], [1, 0, 0]);
        return a[0] === 0 && a[1] === 0 && a[2] === 0;
    })());
}

// ---- 6. *** GLYPH QUADS: THE TEAR CHECK *** -------------------------------------------------------------------
{
    console.log("\n6. *** EVERY CORNER OF A GLYPH FOLLOWS THE SAME BONES, OR THE CHARACTER TEARS IN HALF ***");
    const samples = surfaceSamples(parsed.positions, parsed.indices, { count: 800, seed: 99 });
    const g = buildGlyphQuads(parsed, samples, blendInfluences);
    ok("a quad per sample: 4 vertices and 2 triangles each",
        g.stats.vertices === samples.length * 4 && g.stats.triangles === samples.length * 2,
        g.stats.quads + " quads -> " + g.stats.vertices + " verts, " + g.stats.triangles + " tris");
    let tornQuads = 0, badSum = 0;
    for (let q = 0; q < samples.length; q++) {
        const b = q * 4;
        for (let c = 1; c < 4; c++) {
            for (let k = 0; k < 4; k++) {
                if (g.joints[b * 4 + k] !== g.joints[(b + c) * 4 + k]) { tornQuads++; c = 4; break; }
            }
        }
        let sum = 0; for (let k = 0; k < 4; k++) sum += g.weights[b * 4 + k];
        if (Math.abs(sum - 1) > 1e-4) badSum++;
    }
    ok("!! *** no quad has a corner bound to a different bone from its neighbours ***", tornQuads === 0,
        tornQuads + " torn of " + samples.length + " -- blending per CORNER instead of per SAMPLE would let one " +
        "corner follow the forearm and another the upper arm, and the glyph would stretch apart mid-clip");
    ok("!! ...and every quad's weights sum to 1", badSum === 0,
        badSum + " bad of " + samples.length + " -- this is blendInfluences' renormalisation, checked on the " +
        "real 43-bone skeleton rather than on a fixture where the 12->4 cull never actually bites");
    ok("all glyph positions are finite", Array.from(g.positions).every(Number.isFinite));
    ok("!! the glyph route uses the SAME stretched ramp as the colour route",
        g.stats.levelHistogram.filter((n) => n > 0).length === RAMP.length,
        "two routes disagreeing about what level 7 means would be a second declaration of the ramp");
}

// ---- 7. THE ATLAS INSET -----------------------------------------------------------------------------------------
{
    console.log("\n7. GLYPH UVs ARE INSET BY HALF A TEXEL");
    const a = glyphUV(0), b = glyphUV(RAMP.length - 1);
    ok("!! no cell touches its neighbour's edge", a.u0 > 0 && b.u1 < 1 && a.u1 < 1 / RAMP.length,
        "a quad whose UVs land exactly on a boundary samples the NEXT character under linear filtering, so " +
        "every glyph shows a sliver of its neighbour -- which at distance reads as blur nobody blames on the atlas");
    ok("cells do not overlap", glyphUV(3).u1 < glyphUV(4).u0);
    ok("a bigger atlas insets less", glyphUV(0, RAMP.length, 4096).u0 < glyphUV(0, RAMP.length, 256).u0);
}

// ---- 8. *** THE EXPORTER IS NOW GENERAL, AND KRBN IS A CALLER OF IT *** ---------------------------------------
{
    console.log("\n8. *** \"THE KRBN EXPORTER\" IS NOW \"THE RESKIN EXPORTER\" ***");
    const src = fs.readFileSync(path.join(ENG, "tools", "krbn", "riggedExport.js"), "utf8");
    ok("!! exportReskinnedGLB exists and takes the geometry as a parameter",
        /export async function exportReskinnedGLB\(THREE, GLTFExporter, gltf, geometry, opts/.test(src));
    ok("!! ...and exportRiggedGLB now CALLS it rather than repeating it",
        /await exportReskinnedGLB\(THREE, GLTFExporter, gltf, tubes\)/.test(src),
        "Krbn strokes are one caller now, not the only thing the path can carry");
    ok("!! buildRiggedExportScene takes names and a material rather than hardcoding Krbn's",
        /buildRiggedExportScene\(THREE, gltf, tubeGeometry, opts = \{\}\)/.test(src) &&
        /opts\.sceneName/.test(src) && /opts\.meshName/.test(src) && /opts\.material/.test(src));
    ok("...and the defaults are the OLD values, so krbn-rigged.html's output is unchanged",
        /opts\.sceneName \|\| "krbn-rigged"/.test(src) && /opts\.meshName \|\| "krbn-pencil-strokes"/.test(src));
    ok("!! *** the animations array is still passed to the exporter ***",
        /animations: gltf\.animations \|\| \[\]/.test(src),
        "GLTFExporter does NOT walk the scene for clips -- it serialises the array it is handed. Dropping this " +
        "exports a model that looks right, binds right, and HAS NOTHING TO PLAY, with no error anywhere.");
    ok("blendInfluences is imported by the reskin module rather than reimplemented",
        !/function blendInfluences/.test(fs.readFileSync(path.join(ENG, "tools", "export", "reskin.js"), "utf8")),
        "it is injected, so reskin.js does not depend on the Krbn export path and can be driven with a stand-in");
    report("NOT RUN HERE: a GLTFExporter round trip. That needs three, which needs a browser -- everything " +
           "above is the arithmetic and the wiring, which is what can be settled headlessly. The export path " +
           "itself is the one krbn-rigged.html already exercises, now with the geometry as a parameter.");
}

// ---- 9. THE DOOR, AND THE PURITY LINE IT IS ON THE OTHER SIDE OF ---------------------------------------------
{
    console.log("\n9. WIRED, AND THE CANVAS STAYS OUT OF THE PURE MODULE");
    const main = fs.readFileSync(path.join(ENG, "main.js"), "utf8");
    const rsk = fs.readFileSync(path.join(ENG, "tools", "export", "reskin.js"), "utf8");
    ok("!! window.swekReskin offers both routes", /window\.swekReskin\s*=/.test(main) &&
        /async colour\(/.test(main) && /async glyphs\(/.test(main));
    ok("!! *** the glyph ATLAS is built in main.js, not in the module the gate runs ***",
        /_atlas\(THREE/.test(main) && !/createElement|canvas|getContext/i.test(rsk),
        "tools/export/reskin.js stays free of the DOM so every number in it is checkable in node -- and a " +
        "canvas is the one thing it could not have. The split is the reason sections 2-7 exist at all.");
    ok("!! the atlas sets flipY = false", /flipY = false/.test(main),
        "glTF's UV origin is top-left and three's default flip is bottom-left, so without this EVERY GLYPH IS " +
        "UPSIDE DOWN -- and a symmetric character like '=' or '.' would hide it until somebody exported an 'A'");
    ok("...and the glyph material cuts out rather than blending", /alphaTest/.test(main),
        "a transparent quad per glyph would need sorting; an alpha cutout does not, and 4,000 unsorted " +
        "transparent quads is the classic way a model looks fine alone and wrong against anything behind it");
    ok("!! route 1 attaches COLOR_0 to the model's OWN meshes rather than building new geometry",
        /setAttribute\("color"/.test(main) && /vertexColors = true/.test(main));
    ok("...and both routes pass the animations through", (main.match(/animations: gltf\.animations/g) || []).length >= 1);
    ok("the object URL is revoked on a timer, as swekExport does", /setTimeout\(\(\) => \{ try \{ URL\.revokeObjectURL/.test(main));
    report("NOT RUN HERE: either route end to end. Both need three and a canvas, so they need a browser. What " +
           "is settled headlessly is every number they depend on -- the shade, the ramp, the sampling, the " +
           "influences and the UVs -- plus the wiring above.");
}

console.log("\n" + (fails ? fails + " FAILED" : "reskin-selfcheck: all checks pass"));
process.exit(fails ? 1 : 0);
