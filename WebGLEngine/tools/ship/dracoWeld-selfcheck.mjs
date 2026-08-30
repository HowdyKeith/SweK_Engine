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
import { routeFor, loadGlb } from "../../gpu/glbLoad.js";
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

console.log("\n*** THE ROUTE, BECAUSE A HELPFUL ERROR IS NOT A ROUTE ***");
{
    // v4174. GLBParser.js meets a Draco file and throws a genuinely good message -- "Load it through three's
    // GLTFLoader instead ... gpu/gltfDraco.js attaches the decoder only for files that need it." Every caller
    // had to read that sentence and implement the fallback itself, and none of face/robotFaceAvatar.js,
    // face/miniAvatar.js or face/avatarStage.js did. gltfDraco was imported by NOTHING but this gate.
    //
    // *** AND MY OWN v4169 ORPHAN SWEEP CLEARED IT AS WIRED, BY THE EXACT DEFECT THAT SWEEP WAS FIXING. ***
    // A grep for the string "gltfDraco.js" hit GLBParser.js -- inside the error message above. A MENTION
    // COUNTED AS A WIRE, in the round whose subject was that a sentence is not a wire.
    const flag = (buf, { used = true, required = true, onPrimitive = true } = {}) => {
        const u8 = new Uint8Array(buf), dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
        const jl = dv.getUint32(12, true);
        const json = JSON.parse(new TextDecoder().decode(u8.subarray(20, 20 + jl)));
        if (used) json.extensionsUsed = ["KHR_draco_mesh_compression"];
        if (required) json.extensionsRequired = ["KHR_draco_mesh_compression"];
        if (onPrimitive) for (const m of json.meshes || []) for (const pr of m.primitives || [])
            pr.extensions = { KHR_draco_mesh_compression: { bufferView: 0, attributes: { POSITION: 0 } } };
        let t = JSON.stringify(json); while (t.length % 4) t += " ";
        const jb = new TextEncoder().encode(t), bin = u8.subarray(20 + jl);
        const out = new Uint8Array(20 + jb.length + bin.length), o = new DataView(out.buffer);
        o.setUint32(0, 0x46546C67, true); o.setUint32(4, 2, true); o.setUint32(8, out.length, true);
        o.setUint32(12, jb.length, true); o.setUint32(16, 0x4E4F534A, true);
        out.set(jb, 20); out.set(bin, 20 + jb.length); return out;
    };
    const plainGlb = writeGlb([{ name: "t", positions: [0,0,0, 1,0,0, 0,1,0], indices: [0,1,2] }]);

    ok("!! an ordinary GLB routes to the cheap parser and never fetches a decoder",
        routeFor(plainGlb).route === "plain", routeFor(plainGlb).why);
    ok("!! a compressed one routes to Draco", routeFor(flag(plainGlb)).route === "draco");

    // *** THE TWO CASES THAT DISAGREE, WHICH IS WHERE THE RULE ACTUALLY LIVES. ***
    const declaredOnly = flag(plainGlb, { required: false, onPrimitive: false });
    ok("!! *** declared but compressing NOTHING routes to PLAIN -- no 256 KB fetch to decode nothing ***",
        routeFor(declaredOnly).route === "plain",
        routeFor(declaredOnly).why + ". needsDraco() returns the CONSERVATIVE verdict (true if declared at " +
        "all) and reports declaredButUnused separately; this is what that finer signal is for");

    const requiredButEmpty = flag(plainGlb, { required: true, onPrimitive: false });
    ok("!! *** ...unless extensionsRequired says so, which OVERRIDES what we could otherwise parse ***",
        routeFor(requiredButEmpty).route === "draco",
        "glTF says a file listing an extension in extensionsRequired cannot be loaded without it. GLBParser " +
        "would read every accessor here quite happily, and a conformant loader still must not. THE FIRST " +
        "DRAFT OF glbLoad.js GOT THIS WRONG IN A COMMENT -- it claimed declaredButUnused routed to plain " +
        "while the code tested needsDraco first and never reached that branch. The fixture is what forced " +
        "the rule out; a comment describing behaviour the code does not have is this tree's commonest defect");

    // The failure mode when no decoder is supplied must name the CAUSE, not a symptom three levels down.
    // *** AWAITED, NOT FIRED AND FORGOTTEN. *** The first draft wrapped this in a bare `(async () => {...})()`
    // and the gate reached process.exit before the promise resolved, so the assertion never ran and never
    // said it had not run -- a check that is absent and silent, which is worse than one that is red.
    // Top-level await is available in an .mjs gate; there was never a reason to detach it.
    const noDecoder = await loadGlb(flag(plainGlb), { parsePlain: () => "x" });
    ok("!! a Draco file with no decoder says WHAT is missing, not 'accessor has no bufferView'",
        !noDecoder.ok && /needs a Draco decoder/.test(noDecoder.error) && /gltfDraco/.test(noDecoder.hint || ""),
        noDecoder.error + " | " + (noDecoder.hint || ""));

    // ...and the plain route really does call the parser it was handed
    const plainRan = await loadGlb(plainGlb, { parsePlain: () => "PARSED" });
    ok("   ...and the plain route actually invokes the parser, rather than merely deciding to",
        plainRan.ok && plainRan.route === "plain" && plainRan.result === "PARSED",
        "route " + plainRan.route + ", result " + plainRan.result);

    // AND THE ROUTE IS TAKEN BY A REAL CALLER, not only by this gate.
    const avatar = codeOnly(fs.readFileSync(path.join(ENG, "face", "robotFaceAvatar.js"), "utf8"));
    ok("!! *** face/robotFaceAvatar.js ROUTES rather than calling GLBParser blind ***",
        /import\s*\{[^}]*loadGlb[^}]*\}\s*from/.test(avatar) && /loadGlb\s*\(/.test(avatar)
        && /parseDraco\s*:/.test(avatar),
        "it supplies BOTH branches -- parsePlain for the ordinary case and a parseDraco that imports the " +
        "decoder lazily. Before this the call site went straight to GLBParser.parse and a Draco avatar threw");

    ok("   ...and the decoder import stays inside the draco branch, so an ordinary avatar pays nothing",
        /parseDraco[\s\S]{0,400}?import\(/.test(avatar),
        "the dynamic import sits in the branch, not at the top of the module -- which is the entire reason " +
        "gltfDraco was written lazy in the first place");

    const src = codeOnly(fs.readFileSync(path.join(ENG, "gpu", "glbLoad.js"), "utf8"));
    ok("   ...and the router imports neither three nor the decoder, so it stays the seam and not the merge",
        !/["']three["']/.test(src) && !/gltfDraco/.test(src) && !/DRACOLoader/.test(src),
        "loaders arrive as parameters -- a router that pulls in every destination is the merged module with " +
        "extra steps, and it is also what lets this gate drive both branches with no three.js and no GL");
}

console.log("\n*** WELDING IS REACHABLE FROM THE WRITER, NOT ONLY FROM THIS GATE ***");
{
    // v4169 -- weldVertices.mjs shipped at v4162 with a header saying it "takes and returns the flat arrays
    // voxelGlb.writeGlb speaks". THE SEAM WAS DECLARED ON ONE SIDE AND NEVER JOINED: nothing but this gate
    // ever called weld(), so referenceKind counted it among the orphans. writeGlb now takes `weld`.
    const square = { positions: [0,0,0, 1,0,0, 1,1,0,  0,0,0, 1,1,0, 0,1,0] };   // 6 vertices, 4 distinct
    const plain = writeGlb([square]);
    const welded = writeGlb([square], { weld: true });
    ok("!! *** writeGlb({ weld: true }) actually removes the duplicate vertices ***",
        welded.byteLength < plain.byteLength,
        "two triangles sharing an edge: " + plain.byteLength + " bytes -> " + welded.byteLength +
        " welded. THE SAVING IS THE WHOLE POINT of the glb-shrink idea, and a wiring that changed nothing " +
        "would look identical to one that was never called");

    ok("!! ...and it is OFF by default, because welding DISCARDS a distinction",
        writeGlb([square]).byteLength === plain.byteLength,
        "two vertices at one position with different normals are a HARD EDGE. Welding them is a request, " +
        "never a default -- a writer that quietly smoothed every exported mesh would be losing geometry " +
        "the caller built on purpose");

    // and the epsilon is the caller's, not a constant hidden in the writer
    const coarse = writeGlb([square], { weld: 0.5 });
    ok("   ...and the caller sets the epsilon", coarse.byteLength <= welded.byteLength,
        "weld: 0.5 -> " + coarse.byteLength + " bytes against " + welded.byteLength + " at the default " +
        "epsilon. WHAT COUNTS AS 'THE SAME VERTEX' IS A DECISION and it belongs to whoever is exporting");
}

// ---- 7. A REAL DRACO GLB FROM KHRONOS, WHICH THIS GATE PREVIOUSLY HAD TO SAY IT DID NOT HAVE ------------------
//
// v4174 shipped the router and closed with a stated gap: "an actual Draco-compressed GLB decoded end to end.
// No such file exists in this tree." Sections 1-3 above route files OUR OWN WRITER produced, which means the
// router had only ever been shown declarations this tree wrote itself. gpu/khronosSamples.mjs found eighteen
// models published in a Draco variant; ABeautifulGame's is a self-contained .glb, and BOTH ITS ENCODINGS ARE
// PUBLISHED -- the same fifteen primitives, Draco and plain -- which makes it a matched pair rather than a
// single example.
//
// The fixtures are HEADER-ONLY: the genuine 12-byte header and JSON chunk of each, with the BIN chunk removed
// (22 KB and 32 KB, against 12 MB and 43 MB). That is not a shortcut around the check -- routeFor reads the
// JSON chunk and NOTHING ELSE, so the fixture is byte-for-byte what the router actually looks at. It does mean
// this section proves ROUTING and not DECODING, which the closing note still says, because a routing pass that
// was allowed to read as a decode pass would be worse than the gap it replaced.
// Licence: CC-BY-4.0, credit carried in gpu/fixtures/PROVENANCE.md. See there for why that had to be checked.
{
    const fx = (n) => { const b = fs.readFileSync(path.join(ENG, "gpu", "fixtures", n)); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength); };
    const draco = fx("ABeautifulGame-draco.header.glb");
    const plain = fx("ABeautifulGame-plain.header.glb");

    const rd = routeFor(draco), rp = routeFor(plain);
    ok("a REAL Draco-compressed GLB routes to the decoder", rd.ok && rd.route === "draco", rd.why);
    ok("   ...because the file REQUIRES the extension, not merely uses it", rd.verdict.inRequired === true,
        "extensionsRequired is the spec's word and overrides what we think we could otherwise parse");
    ok("   ...and every one of its primitives is compressed",
        rd.verdict.dracoPrimitives === 15 && rd.verdict.totalPrimitives === 15,
        rd.verdict.dracoPrimitives + " of " + rd.verdict.totalPrimitives + " primitives carry the extension");
    ok("   ...so it is not the declared-but-unused case", rd.verdict.declaredButUnused === false,
        "a real compressed file and the informational-declaration case must not land in the same branch");

    ok("THE SAME MODEL's plain encoding routes to the plain parser", rp.ok && rp.route === "plain", rp.why);
    ok("   ...with the same primitive count, so the pair differs ONLY in encoding",
        rp.verdict.totalPrimitives === rd.verdict.totalPrimitives,
        "both 15 primitives -- the router is separating them on the extension and not on some other difference");
    ok("   ...and claims no Draco at all", rp.verdict.inUsed === false && rp.verdict.dracoPrimitives === 0,
        "a false positive here would send a readable file to a 256 KB decoder for nothing");

    // the loader dispatch, not just the verdict
    const seen = [];
    await loadGlb(draco, { parsePlain: async () => { seen.push("plain"); }, parseDraco: async () => { seen.push("draco"); } });
    await loadGlb(plain, { parsePlain: async () => { seen.push("plain"); }, parseDraco: async () => { seen.push("draco"); } });
    ok("   ...and loadGlb actually CALLS the loader each one routed to", seen.join(",") === "draco,plain",
        "dispatched: " + seen.join(", "));

    // and the size difference the extension exists for, measured on the real files these were cut from
    report("the full files these fixtures were cut from are 12,105,252 bytes Draco against 42,977,928 plain " +
           "-- 3.55x, measured by fetching both, not quoted from the extension's documentation");
}

console.log("\n" + (fails ? "FAIL -- " + fails + " check(s)" : "ALL GREEN") +
            "\nunchecked here: an actual Draco-compressed GLB DECODED end to end. Section 7 closes half of what this " +
            "note used to say -- a real Khronos Draco GLB now routes here, correctly, alongside the same model's " +
            "plain encoding -- but ROUTING IS NOT DECODING, and the decode still needs the full 12 MB and a " +
            "browser. This round wrote no encoder either: draco.js DECODES ONLY, and neither it nor glb-shrink " +
            "ships an encoder we could vendor. The decode path is upstream's, unmodified.");
process.exit(fails ? 1 : 0);
