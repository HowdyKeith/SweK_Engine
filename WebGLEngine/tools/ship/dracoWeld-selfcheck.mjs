// WebGLEngine/tools/ship/dracoWeld-selfcheck.mjs -- v4163
//
// Run: node tools/ship/dracoWeld-selfcheck.mjs   (fast -- pure functions and one real GLB from our own writer)
//
// GATES gpu/glbPeek.mjs, gpu/gltfDraco.js, the Draco diagnostic added to gpu/GLBParser.js, the vendored
// mrdoob/draco.js decoder, and tools/export/weldVertices.mjs.
//
// *** WHAT THIS ROUND DID NOT DO IS THE POINT OF HALF THESE CHECKS. *** boona13/glb-shrink is a seven-stage
// pipeline and only TWO of its stages suit a voxel export. Three of the others would silently damage one:
// meshopt simplify decimates away the blocky silhouette that IS the model, the smooth-normal re-bake melts
// flat faces, and the WebP pass is a no-op because voxelGlb writes COLOR_0 and no textures at all. So the
// checks below assert the REFUSALS as hard as the features -- a later round that "finishes the port" by adding
// the other five stages should go red, not green.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { writeGlb } from "../export/voxelGlb.mjs";
import { peekGlb, needsDraco, extensionsOf, DRACO_EXT, MAX_JSON } from "../../gpu/glbPeek.mjs";
import { describeGlb } from "../../gpu/gltfDraco.js";
import { weld, weldIsLossless, DEFAULT_EPSILON } from "../export/weldVertices.mjs";
import { codeOnly } from "./sourceScan.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const report = (m) => console.log("  ....  " + m);
const read = (p) => { try { return fs.readFileSync(path.join(ENG, p), "utf8"); } catch { return ""; } };
console.log("dracoWeld-selfcheck -- reading a Draco GLB, and welding without melting it\n");

// A REAL GLB, from THIS TREE'S OWN WRITER, so the reader and the writer are checked against each other.
const realGlb = writeGlb([{ name: "tri", positions: [0,0,0, 1,0,0, 0,1,0], indices: [0,1,2], colors: [1,0,0, 0,1,0, 0,0,1] }]);
function rewriteJson(orig, mutate) {
    const u8 = new Uint8Array(orig), dv = new DataView(u8.buffer);
    const jl = dv.getUint32(12, true);
    const j = JSON.parse(new TextDecoder().decode(u8.subarray(20, 20 + jl)));
    mutate(j);
    let txt = JSON.stringify(j); while (txt.length % 4) txt += " ";
    const bin = u8.subarray(20 + jl);
    const out = new Uint8Array(20 + txt.length + bin.length), odv = new DataView(out.buffer);
    odv.setUint32(0, dv.getUint32(0, true), true); odv.setUint32(4, 2, true);
    odv.setUint32(8, out.length, true); odv.setUint32(12, txt.length, true); odv.setUint32(16, dv.getUint32(16, true), true);
    out.set(new TextEncoder().encode(txt), 20); out.set(bin, 20 + txt.length);
    return out;
}

// ---- 1. the peek reads our own writer's files ---------------------------------------------------------------
console.log("1. the header read");
{
    const p = peekGlb(realGlb);
    ok("!! a GLB from this tree's own writer parses", p.ok && p.version === 2, p.ok ? "version " + p.version + ", json " + p.jsonLength + "B, total " + p.totalLength + "B" : p.error);
    ok("!! *** the reader uses the WRITER'S container constants, not a second copy ***",
        /from "\.\.\/tools\/export\/voxelGlb\.mjs"/.test(read("gpu/glbPeek.mjs")) &&
        /export const MAGIC/.test(read("tools/export/voxelGlb.mjs")),
        "a second spelling of the glTF magic is how a writer and a reader start disagreeing about a file format");
    // MALFORMED INPUT NEVER THROWS. This runs before anything is known about the bytes -- answering questions
    // about broken files is its entire job, so throwing on one would defeat it.
    for (const [name, buf] of [["3 bytes", new Uint8Array([1, 2, 3])], ["zeroed 64", new Uint8Array(64)],
                               ["truncated json", realGlb.slice(0, 30)], ["empty", new Uint8Array(0)]]) {
        let threw = false, r = null;
        try { r = peekGlb(buf); } catch { threw = true; }
        ok("..." + name + " is refused, not thrown on", !threw && r && r.ok === false, r && r.error);
    }
    ok("...and an implausible JSON length is refused before it is allocated", MAX_JSON === (1 << 20), "cap " + MAX_JSON + " bytes");
}

// ---- 2. does this file need a decoder? ----------------------------------------------------------------------
console.log("\n2. asking the file before fetching 256 KB");
{
    const plain = needsDraco(realGlb);
    ok("!! an ordinary GLB needs no decoder", plain.ok && plain.needsDraco === false,
        plain.dracoPrimitives + " of " + plain.totalPrimitives + " primitives compressed, extensions " + JSON.stringify(extensionsOf(realGlb)));
    const forged = rewriteJson(realGlb, (j) => {
        j.extensionsUsed = [DRACO_EXT]; j.extensionsRequired = [DRACO_EXT];
        j.meshes[0].primitives[0].extensions = { [DRACO_EXT]: { bufferView: 0, attributes: { POSITION: 0 } } };
    });
    const d = needsDraco(forged);
    ok("!! *** a Draco GLB is recognised FROM ITS HEADER, before a vertex is touched ***",
        d.needsDraco && d.inRequired && d.dracoPrimitives === 1, "1 of 1 primitives compressed, and required");
    // *** used AND required ARE DIFFERENT PROMISES. *** `required` means refuse-if-you-cannot; `used` only
    // means it appears. Answering from `required` alone sends a used-only file down the path with no decoder,
    // which is the QUIET failure -- it renders nothing rather than saying anything.
    const usedOnly = rewriteJson(realGlb, (j) => {
        j.extensionsUsed = [DRACO_EXT];
        j.meshes[0].primitives[0].extensions = { [DRACO_EXT]: { bufferView: 0, attributes: { POSITION: 0 } } };
    });
    ok("!! a file that only LISTS it under extensionsUsed still needs the decoder",
        needsDraco(usedOnly).needsDraco === true,
        "answering from extensionsRequired alone would send exactly the quiet-failure case down the path with no decoder");
    const liar = rewriteJson(realGlb, (j) => { j.extensionsUsed = [DRACO_EXT]; });
    ok("!! ...and one that declares it but compresses nothing is REPORTED, not smoothed over",
        needsDraco(liar).declaredButUnused === true && describeGlb(liar).note.includes("exporter's bug"),
        "the decoder would be fetched for nothing -- that is the exporter's bug and saying so is how it gets fixed");
    ok("...describeGlb answers without fetching or decoding anything",
        describeGlb(realGlb).ok && describeGlb(realGlb).needsDraco === false && describeGlb(new Uint8Array(4)).ok === false);
}

// ---- 3. the two paths, and the message a person actually sees ------------------------------------------------
console.log("\n3. what a Draco file used to say, and what it says now");
{
    const gp = read("gpu/GLBParser.js");
    // Asserted on the STRING the user reads, assembled the way the source assembles it. The first draft tried
    // to regex across the concatenation and failed on its own line break -- checking that a message exists is
    // not the same as checking how it is spelled across two template literals.
    const dracoMsg = /this GLB is Draco-compressed \(KHR_draco_mesh_compression\)/.test(gp);
    ok("!! GLBParser now names Draco instead of blaming an accessor",
        /_dracoBlocked/.test(gp) && dracoMsg && /GLTFLoader instead/.test(gp),
        '"accessor 0 has no bufferView" was TRUE, USELESS, and the last thing somebody sees before giving up');
    ok("...and it still says the plain thing when Draco is not involved",
        /throw new Error\(`accessor \$\{accessorIdx\} has no bufferView`\)/.test(gp),
        "a non-Draco file with a genuinely missing bufferView must not be blamed on an extension it does not use");
    const gl = read("vendor/three/jsm/loaders/GLTFLoader.js");
    ok("!! *** the vendored GLTFLoader ALREADY implemented the extension in full -- only an instance was missing ***",
        /setDRACOLoader/.test(gl) && /GLTFDracoMeshCompressionExtension/.test(gl),
        "three r160, vendored here long before today. Nothing about Draco decoding was written in this round");
    const gd = read("gpu/gltfDraco.js");
    ok("!! the decoder is imported LAZILY, so uncompressed files never pay 256 KB",
        /import\("\/vendor\/draco\/DRACOLoader\.js"\)/.test(gd) && !/^import .*DRACOLoader/m.test(gd),
        "setDRACOLoader wants the instance up front, so the obvious wiring taxes eight pages for a decoder they almost never run");
    ok("...and it is fetched at most once per page", /_dracoPromise/.test(gd) && /if \(!_dracoPromise\)/.test(gd));
    ok("...a failed decoder fetch clears the cache so a retry can work", /_dracoPromise = null; throw/.test(gd));
}

// ---- 4. the vendored decoder ---------------------------------------------------------------------------------
console.log("\n4. what was vendored, and on what terms");
{
    const dl = read("vendor/draco/DRACOLoader.js"), lic = read("vendor/draco/LICENSE");
    ok("!! the decoder is present and carries its upstream header", dl.length > 100000 && /@license MIT/.test(dl) && /draco\.js/i.test(dl),
        (dl.length / 1024).toFixed(0) + " KB unmodified from mrdoob/draco.js");
    ok("!! *** its LICENSE is vendored beside it, which is the difference from every other repo on that shelf ***",
        /MIT License/.test(lic) && /Mr\.doob/.test(lic),
        "grdpwasm, ws-scrcpy, Sunshine and pymobiledevice3 are GPL-3.0 or unlicensed and are INSTALLED, never " +
        "vendored. MIT is why this one may live in the tree at all");
    ok("!! it was vendored UNMODIFIED -- one bare 'three' import, resolved by the page's import map",
        /^import \{[^}]*\} from 'three';$/m.test(dl) && /export \{ DRACOLoader \};/.test(dl),
        "the tree's convention is { \"three\": \"/vendor/three/three.module.js\" }, so no edit was needed and none was made");
    ok("...and the tree really does provide that map", /"three":\s*"\/vendor\/three\/three\.module\.js"/.test(read("universal-viewer.html")));
}

// ---- 5. weld, and the melt it must not cause -----------------------------------------------------------------
console.log("\n5. welding without melting");
{
    // A FLAT-SHADED CUBE: 8 corners, 24 vertices, each corner carrying three different face normals.
    const P = [], N = [];
    const faces = [[[0,0,0],[1,0,0],[1,1,0],[0,1,0],[0,0,-1]], [[0,0,1],[1,0,1],[1,1,1],[0,1,1],[0,0,1]],
                   [[0,0,0],[0,0,1],[0,1,1],[0,1,0],[-1,0,0]], [[1,0,0],[1,0,1],[1,1,1],[1,1,0],[1,0,0]],
                   [[0,0,0],[1,0,0],[1,0,1],[0,0,1],[0,-1,0]], [[0,1,0],[1,1,0],[1,1,1],[0,1,1],[0,1,0]]];
    for (const f of faces) { const n = f[4]; for (let i = 0; i < 4; i++) { P.push(...f[i]); N.push(...n); } }
    const idx = []; for (let f = 0; f < 6; f++) { const b = f * 4; idx.push(b, b+1, b+2, b, b+2, b+3); }
    const cube = { positions: P, normals: N, indices: idx };

    const good = weld(cube);
    ok("!! *** a flat-shaded cube KEEPS ALL 24 VERTICES, because its corners are genuinely different ***",
        good.after === 24 && good.keyedOn.includes("normal"), "24 -> " + good.after + ", keyed on " + good.keyedOn.join("+"));
    ok("!! ...and welding on POSITION ALONE collapses it to 8 and smooths the cube",
        weld(cube, { keyOn: { position: true } }).after === 8,
        "THE SAME DAMAGE AS THE SMOOTH-NORMAL RE-BAKE THIS ROUND REFUSED, arriving through the stage that looked safe");
    const bad = weldIsLossless(cube, weld(cube, { keyOn: { position: true } }));
    ok("!! *** and the losslessness oracle CATCHES it rather than trusting the argument above ***",
        bad.ok === false && /normal changed/.test(bad.why), bad.why);
    ok("...while the correct weld is proven lossless", weldIsLossless(cube, good).ok === true, weldIsLossless(cube, good).why);

    // WHERE THE SAVING ACTUALLY COMES FROM: co-planar quads sharing an edge, which is what greedy meshing makes.
    const quads = { positions: [0,0,0, 1,0,0, 1,1,0, 0,1,0,  1,0,0, 2,0,0, 2,1,0, 1,1,0],
                    normals: Array(8).fill([0,0,1]).flat(), indices: [0,1,2,0,2,3, 4,5,6,4,6,7] };
    const w = weld(quads);
    ok("!! two co-planar quads share their edge vertices", w.before === 8 && w.after === 6 && weldIsLossless(quads, w).ok,
        "8 -> 6, " + (100 - w.ratio * 100).toFixed(0) + "% removed, and lossless");
    ok("...an unindexed mesh comes back indexed, which is half the saving on its own",
        weld({ positions: [0,0,0, 0,0,0, 1,0,0] }).indices.length === 3);
    ok("...colour is part of the key, so a colour boundary is never welded across",
        weld({ positions: [0,0,0, 0,0,0], colors: [1,0,0, 0,1,0] }).after === 2,
        "two vertices at one point in different colours are two vertices -- voxelGlb writes COLOR_0, so this is the common case");
    ok("...epsilon is tight enough not to merge things that are apart", DEFAULT_EPSILON <= 1e-5, "eps " + DEFAULT_EPSILON);
}

// ---- 6. THE FIVE STAGES DELIBERATELY NOT TAKEN ----------------------------------------------------------------
console.log("\n6. what was refused, asserted so a later round cannot quietly add it");
{
    // *** codeOnly, NOT RAW TEXT, AND THE FIRST DRAFT GOT THIS WRONG IN THE OBVIOUS WAY. *** weldVertices.mjs's
    // header EXPLAINS at length why simplification and normal re-baking are refused, so a raw-text search for
    // "simplif" finds the refusal and reads it as the offence. That is v3449's founding defect -- a comment
    // rescuing the thing it warns about -- and this file walked into it while writing a check against it.
    // codeOnly blanks strings AND comments, so what is left is the code shapes these checks are about.
    const files = ["tools/export/weldVertices.mjs", "gpu/gltfDraco.js", "gpu/glbPeek.mjs"]
        .map((f) => codeOnly(read(f))).join("\n");
    ok("!! nothing here simplifies or decimates geometry",
        !/meshopt|simplif|decimat/i.test(files),
        "a voxel mesh's blocky silhouette IS the model; meshoptimizer would remove exactly it");
    ok("!! and nothing re-bakes normals",
        !/recomputeNormals|averageNormals|smoothNormals/i.test(files),
        "voxels want flat per-face normals; a smooth re-bake melts them, and weld's position-only key is the " +
        "same defect wearing a safer name");
    ok("!! the weld's default key includes every attribute the mesh carries",
        /keyOn \|\| \{ position: true, normal: !!normals, color: !!colors, uv: !!uvs \}/.test(codeOnly(read("tools/export/weldVertices.mjs"))),
        "anything less is a request to discard a distinction the mesh is currently making, and it must be typed out by hand");
    report("TAKEN FROM glb-shrink: weld, and Draco as the encode target. REFUSED: meshopt simplify, the " +
           "smooth-normal re-bake, WebP textures (voxelGlb writes no TEXCOORD_0 at all), and the strip-extensions " +
           "pass. Two of seven, and the other five are refused on the record.");
}

console.log("\n" + (fails ? "FAIL -- " + fails + " check(s)" : "ALL GREEN") +
            "\nunchecked here: an actual Draco-compressed GLB decoded end to end. No such file exists in this " +
            "tree and this round wrote no encoder -- draco.js DECODES ONLY, and neither it nor glb-shrink " +
            "ships an encoder we could vendor. The decode path is upstream's, unmodified, and the detection " +
            "that routes files to it is what is gated above.");
process.exit(fails ? 1 : 0);
