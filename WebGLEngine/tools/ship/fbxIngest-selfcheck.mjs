// WebGLEngine/tools/ship/fbxIngest-selfcheck.mjs -- v3 (task #59 remaining-gaps round added section 7)
//
// Run: node tools/ship/fbxIngest-selfcheck.mjs
//
// GATES gpu/fbxLoad.js, the .fbx branch gpu/gpuAssetLoader.js's _load()/_loadFBX() added, the
// _loadGLBFromBytes -> _uploadParsedMesh refactor that made the FBX and GLB paths share one GPU-upload
// implementation, index.html's "three" import map, and gpu/fbxLoad.js's mapFbxAnimations() -- the
// FBX-clip -> GLBParser-shape animation mapping (section 6, task #59 round 1; section 7, task #59 round 2,
// this round).
//
// *** TASK #44: FBX ASSETS WERE RECOGNIZED THROUGHOUT THE TREE AND NOTHING EVER LOADED ONE. *** Keith's call
// was three.js's own vendored FBXLoader (vendor/three/jsm/loaders/FBXLoader.js, vendored at r160 in commit
// b5fccadb, "round 1" of this work) run in-browser, NOT a native FBX2glTF conversion step. Round 2 (commit
// ca8b8f0c) covered gpu/fbxLoad.js (parseFbx / normalizeFbxGroup), the wiring in gpu/gpuAssetLoader.js, and
// the import map index.html needed to resolve FBXLoader.js's own bare `from "three"` -- sections 1-5 below.
//
// *** TASK #59, ROUND 1 (commit 5fc21a72): ANIMATION-CLIP MAPPING, THE COMMON CASE. *** Round 2 of task #44
// shipped skin/joint extraction but left `animations: null` unconditionally, named plainly as a v1 gap
// because no committed, license-clean rigged+animated fixture existed to verify it against. Section 6 below
// closed that gap: gpu/fixtures/fbxAnim.ascii.fbx round-trips through the real pipeline with a populated
// skeleton AND a real animation clip (one QuaternionKeyframeTrack, LINEAR interpolation), graded against
// exact, hand-computed numbers. That round's own header named what it did NOT cover, plainly rather than
// silently: preRotation/postRotation composition, a non-default Euler rotation order, a VectorKeyframeTrack
// (position/scale) channel, and more than one AnimationStack/clip in a file.
//
// *** TASK #59, ROUND 2 (THIS ROUND): THE REMAINING GAPS. *** mapFbxAnimations() itself already handled all
// of the above in code -- it `clips.map()`s over EVERY entry in `group.animations`, not just the first, and
// FBX_TRACK_PROPERTY_TO_GLTF_PATH already maps position/quaternion/scale generically, nothing rotation-
// specific. preRotation/postRotation/euler-order composition happens entirely inside FBXLoader.js itself,
// before any value reaches this repo's code. So this round is VERIFICATION work, not a rewrite: section 7
// below adds gpu/fixtures/fbxAnimAdvanced.ascii.fbx (a mesh-less, skin-less fixture -- mapFbxAnimations()
// reads group.animations independent of whether a mesh was found, so no geometry/skin was needed to exercise
// it) with two AnimationStacks and a rotation track composed through a non-identity PreRotation, PostRotation
// and non-default RotationOrder, plus position and scale VectorKeyframeTrack channels. The composed rotation
// quaternions are checked against an INDEPENDENT three.js Quaternion/Euler script that mirrors
// generateRotationTrack's own composition steps -- not hand trigonometry -- see section 7's own comments for
// that script and its output.
//
// ================================================================================================
// WHAT THIS GATE DOES NOT PROVE -- READ THIS BEFORE TRUSTING A GREEN RUN, SAME STYLE AS
// gpu/fixtures/PROVENANCE.md AND gpu/GLBParser.js's OWN HEADER
// ================================================================================================
//
//   * NO MULTI-PRIMITIVE / MULTI-MESH CONCAT. normalizeFbxGroup() reads only the FIRST object in the tree
//     with .isMesh or .isSkinnedMesh true -- single-mesh v1 scope, matching GLBParser's own original v1
//     scope before multi-primitive concat grew in over many later rounds. A multi-mesh FBX loses everything
//     past its first mesh this round.
//   * NO EMBEDDED-TEXTURE EXTRACTION. `texture`, `colors`, `morphTargets`, `texturesByMaterial`, and
//     `primitiveRanges` are all null/{} in v1. FBXLoader does put an extracted texture on
//     `mesh.material.map` when the file carries one; converting that into something `_uploadParsedMesh` can
//     `gl.texImage2D` from was left undone because it could not be verified against a real textured FBX (see
//     the licensing note below) -- an unverified guess at texture-extraction code is worse than the visible
//     gap.
//   * ANIMATION MAPPING IS NOW PROVEN ACROSS BOTH THE COMMON CASE AND THE HARDER COMPOSITION CASES. Section 6
//     proves: a QuaternionKeyframeTrack (rotation) resolved to its target node by name, LINEAR interpolation,
//     a clip's `duration` trusted from THREE.AnimationClip (see gpu/fbxLoad.js's header for why that is safe
//     rather than assumed), and skin extraction (bones, inverse-bind matrices, skinIndex/skinWeight)
//     exercised TOGETHER with animation on the same rig. Section 7 (this round) proves, against exact
//     measured numbers, independently cross-checked against three.js's own Quaternion/Euler classes rather
//     than hand arithmetic: preRotation/postRotation composition and a non-default RotationOrder (enum 5,
//     "XYZ" -- the implicit default when the property is absent is enum 0, "ZYX", NOT "XYZ"); a
//     VectorKeyframeTrack position channel AND a VectorKeyframeTrack scale channel (generateVectorTrack, a
//     different FBXLoader code path from generateRotationTrack, exercising raw per-axis curve values with no
//     Euler/quaternion math); and two separate AnimationStacks/clips in one file, resolving to two distinct,
//     correctly-named entries in mapFbxAnimations()'s output with non-overlapping channels. Still NOT
//     covered, stated plainly rather than silently: morph-target (`DeformPercent`) animation tracks, which
//     mapFbxAnimations() deliberately skips rather than mis-mapping (see its own comment in gpu/fbxLoad.js);
//     and a rotation curve whose per-axis span exceeds 180 degrees between keyframes (FBXLoader's own
//     interpolateRotations() switches to a slerp-subdivided sub-interval path above that threshold -- a
//     genuinely different code path from either fixture's small spans, neither of which reaches it).
//   * CUBICSPLINE INTERPOLATION IS NOT A GAP -- IT IS UNREACHABLE FROM THE CURRENTLY-VENDORED FBXLoader, AND
//     DELIBERATELY NOT ATTEMPTED. Confirmed by reading vendor/three/jsm/loaders/FBXLoader.js's
//     AnimationParser in full: it never calls `.setInterpolation()` on any track it builds, so every track it
//     can ever produce carries KeyframeTrack's own class default, InterpolateLinear -- there is no FBX file,
//     hand-authored or otherwise, that could make THIS vendored loader emit anything but "LINEAR" through
//     gpu/fbxLoad.js's samplerInterpolation(). A future reader should not read a missing CUBICSPLINE fixture
//     as an unclosed item on this list; closing it would need a patched or newer FBXLoader, which is out of
//     this gate's scope entirely, not merely undone within it.
//
// ================================================================================================
// THE FIXTURES, AND WHY THEY ARE HAND-WRITTEN RATHER THAN SOURCED
// ================================================================================================
//
// gpu/fixtures/fbxIngest.ascii.fbx, gpu/fixtures/fbxAnim.ascii.fbx, and gpu/fixtures/fbxAnimAdvanced.ascii.fbx
// are all committed. None is derived from anything -- see gpu/fixtures/PROVENANCE.md's own entries for each.
// PROVENANCE.md already established this tree's rule for exactly this situation (its ABeautifulGame
// entries): a licence must be personally verified before a third-party asset is vendored, even trimmed, and
// Duck/BrainStem in the SAME sample repository as the CC-BY-4.0 ABeautifulGame model carry different, more
// restrictive licences -- so "everyone uses this for testing" is not a licence. The common FBX test fixtures
// the wider ecosystem reaches for (Mixamo exports, most game-asset-marketplace samples, three.js's own
// examples/models/fbx/Samba Dancing.fbx) could not be positively confirmed redistributable, so none of them
// is here. All three fixtures instead are plain ASCII FBX 7.4 text, written directly against
// vendor/three/jsm/loaders/FBXLoader.js's own TextParser/FBXTreeParser/GeometryParser/DeformerParser/
// AnimationParser source (confirmed by reading that source, not guessed):
//
//   * fbxIngest.ascii.fbx (round 2, task #44) -- two triangles sharing an edge, the same quad shape
//     tools/ship/dracoEncode-selfcheck.mjs's own QUAD fixture uses, with per-corner normals and UVs, no
//     skeleton, no animation.
//   * fbxAnim.ascii.fbx (round 3, task #59 round 1) -- the SAME quad, skinned to a minimal 2-bone rig (root
//     at the origin, a child bone offset (0,1,0), the quad's bottom 2 control points weighted 100% to the
//     root and the top 2 to the child), plus one animation clip ("TestClip") rotating the child bone 0 -> 90
//     degrees about X over 1 second (2 keyframes) -- the smallest rig that exercises skin and animation
//     together. Iterated against the real headless-Chromium harness (tools/ship/webgpuHarness.mjs's
//     runInEngineOrigin, the same one sections 6-7 below use) rather than trusted from reading the FBX
//     grammar alone -- the same discipline task #44's own fixture took.
//   * fbxAnimAdvanced.ascii.fbx (task #59 round 2, this round) -- NO geometry and NO skin (deliberately --
//     mapFbxAnimations() reads group.animations up front regardless of whether a mesh was found, so this is
//     a smaller, more isolated way to exercise animation mapping alone). Two LimbNode bones, `root` and
//     `mover`, neither parented to the other. `root` carries a non-default RotationOrder (enum 5, "XYZ"),
//     PreRotation (30,0,0 deg) and PostRotation (0,45,0 deg) on its Properties70, and an animated rotation
//     curve (0,0,0) -> (60,0,0) degrees. Two AnimationStacks: "ClipA" (root's rotation + mover's position,
//     one AnimationLayer) and "ClipB" (mover's scale, a separate AnimationLayer/AnimationStack). Verified
//     against a real headless-Chromium run (this fixture's design read FBXLoader.js's AnimationParser and
//     TextParser Property70 grammar closely enough beforehand that it passed on the first real run -- still
//     run for real, not trusted from the reading alone, per this file's own standing discipline).
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runInEngineOrigin, webgpuSkipReason } from "./webgpuHarness.mjs";
import { codeOnly, noComments } from "./sourceScan.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const say = (m) => console.log("  ----  " + m);
console.log("fbxIngest-selfcheck -- task #44: FBX assets were named everywhere and loaded nowhere\n");

const gpuAssetLoaderSrc = fs.readFileSync(path.join(ENG, "gpu/gpuAssetLoader.js"), "utf8");
const fbxLoadSrc        = fs.readFileSync(path.join(ENG, "gpu/fbxLoad.js"), "utf8");
const indexHtmlSrc      = fs.readFileSync(path.join(ENG, "index.html"), "utf8");

// *** v4676 -- TWO ROWS BELOW ASSERTED "THE CODE DOES X" AGAINST RAW SOURCE, which is a gate that would pass
// on a COMMENT SAYING IT SHOULD. commentFalsePass reported both as GENUINE.
//
// THEY NEED DIFFERENT VIEWS, AND PICKING codeOnly FOR BOTH WAS TRIED FIRST AND WAS WRONG. codeOnly blanks
// TEMPLATE LITERALS along with comments -- deliberately, so that a claim about code cannot be satisfied by the
// text of a shader -- and the URL this gate is about IS a template literal: `${this.basePath}${name}.fbx`.
// Read through codeOnly that row went red against code that is perfectly correct. noComments() is the view
// that fits: comments gone, literals kept.
// And the third claim is ABOUT a comment, so it reads raw and proves the text is absent from noComments --
// which is what makes it a header rather than a string the code happens to carry.
const gpuAssetLoaderCode = noComments(gpuAssetLoaderSrc);
const fbxLoadCode        = codeOnly(fbxLoadSrc);
const fbxLoadNoComments  = noComments(fbxLoadSrc);

// ---- 1. THE .fbx EXTENSION IS IN THE HEAD-PROBE CHAIN --------------------------------------------------------
console.log("1. *** .fbx IS A REAL BRANCH IN _load()'S HEAD-PROBE CHAIN, NOT JUST A STRING SOMEWHERE ***");
{
    ok("!! tryFbx is read from the per-asset format map, alongside tryGlb/tryObj",
        /const tryFbx\s*=\s*!fmt\s*\|\|\s*fmt\.fbx/.test(gpuAssetLoaderSrc));
    ok("!! _load() HEAD-probes `${this.basePath}${name}.fbx` and calls _loadFBX() on a 200",
        /tryFbx[\s\S]{0,400}?\$\{this\.basePath\}\$\{name\}\.fbx[\s\S]{0,300}?this\._loadFBX\(name, fbxUrl\)/.test(gpuAssetLoaderCode),
        "v4676: read through noComments. The two [\\s\\S] spans are 400 and 300 characters wide, and on RAW " +
        "source there are five comment lines inside the first window alone, any of which could have supplied " +
        "the middle of this chain. NOT codeOnly: the URL is a template literal, which codeOnly blanks");
    ok("!! the probe sits BEFORE the legacy mesh.json folder fallback, mirroring .glb/.obj",
        gpuAssetLoaderSrc.indexOf("this._loadFBX(name, fbxUrl)") < gpuAssetLoaderSrc.indexOf("if (!tryFolder)"));
    ok("!! _loadFBX exists as a real method, not just referenced",
        /async _loadFBX\(name, url\) \{/.test(gpuAssetLoaderSrc));
    ok("!! _loadFBX dynamically imports the VENDORED loader, not a native conversion step",
        /import\(["']\/vendor\/three\/jsm\/loaders\/FBXLoader\.js["']\)/.test(gpuAssetLoaderSrc),
        "Keith's call (task #44): three.js's own vendored FBXLoader, in-browser, not FBX2glTF");
    ok("!! ...and imports gpu/fbxLoad.js's parseFbx/normalizeFbxGroup rather than re-implementing them",
        /import\(["']\.\/fbxLoad\.js["']\)/.test(gpuAssetLoaderSrc) &&
        /parseFbx, normalizeFbxGroup/.test(gpuAssetLoaderSrc));
}

// ---- 2. THE INJECTION PATTERN MATCHES gpu/gltfDraco.js AND gpu/glbLoad.js --------------------------------------
console.log("\n2. gpu/fbxLoad.js FOLLOWS THE SAME DEPENDENCY-INJECTION SHAPE AS ITS SIBLINGS");
{
    ok("!! FBXLoaderCtor is a PARAMETER, never imported at module top level",
        /export async function parseFbx\(buffer, FBXLoaderCtor/.test(fbxLoadSrc) &&
        !/^\s*import .* from ['"]three['"]/m.test(fbxLoadSrc) &&
        !/^\s*import .*FBXLoader.*from/m.test(fbxLoadSrc),
        "so this module needs no browser and no three.js present to be REQUIRED, same as gltfDraco.js's GLTFLoaderCtor");
    ok("!! parseFbx calls the SYNCHRONOUS FBXLoader.parse(buffer, path) directly, not a callback form",
        /new FBXLoaderCtor\(\)/.test(fbxLoadSrc) && /loader\.parse\(buffer, opts\?\.path/.test(fbxLoadSrc));
    ok("!! normalizeFbxGroup uses ONLY duck-typing (.isMesh/.isSkinnedMesh/.isBone-shaped checks), no 'three' import",
        !/from ['"]three['"]/.test(fbxLoadSrc) &&
        /\.isMesh \|\| obj\.isSkinnedMesh/.test(fbxLoadSrc));
    ok("!! the remaining v1 scope gaps are documented in the file's own header, GLBParser.js-header style",
        /SINGLE MESH ONLY/.test(fbxLoadSrc) && /NO TEXTURES, NO VERTEX COLORS/.test(fbxLoadSrc));
    // v4676 -- SPLIT, because this was one row making two claims of opposite kinds and reading raw source for
    // both. "It is documented" is a claim ABOUT A COMMENT and must read the comments; "the function exists" is
    // a claim about code and must not. Joined with && against raw text, the second was satisfiable by the
    // first -- the header sentence names mapFbxAnimations, so a file with the header and no function passed.
    ok("!! ...and task #59's animation-mapping closure is DOCUMENTED -- asserted of the comments, where it lives",
        /ANIMATION MAPPING \(task #59\)/.test(fbxLoadSrc) && !/ANIMATION MAPPING \(task #59\)/.test(fbxLoadNoComments),
        "present in the raw file and ABSENT once the comments are stripped: that pair is what makes it a " +
        "header rather than a string the code happens to carry");
    ok("!! ...and mapFbxAnimations is a real function, asserted of the CODE and not of the header naming it",
        /mapFbxAnimations/.test(fbxLoadCode),
        "the header sentence above contains the identifier, so the raw-source form of this check was passable " +
        "by documentation alone");
}

// ---- 3. THE FIXTURE, THROUGH THE REAL PIPELINE, IN A REAL BROWSER ----------------------------------------------
console.log("\n3. *** THE HAND-WRITTEN FIXTURE ROUND-TRIPS: HEAD-probe -> _loadFBX -> parseFbx/normalizeFbxGroup ->");
console.log("      _uploadParsedMesh -> REAL GL BUFFERS, WITH EXACT MEASURED COUNTS, NOT \"IT LOADED\" ***");
{
    const skip = webgpuSkipReason();
    if (skip) {
        say("SKIP (no headless shell / playwright): " + skip);
        fails++;
    } else {
        const fixturePath = path.join(ENG, "gpu/fixtures/fbxIngest.ascii.fbx");
        ok("!! the committed fixture exists", fs.existsSync(fixturePath), fixturePath);

        const SCRIPT = `async () => {
            // *** THE PAGE HAS TO SUPPLY ITS OWN IMPORT MAP. *** Same reason
            // tools/ship/dracoEncode-selfcheck.mjs's own section 4 injects one: FBXLoader.js bare-imports
            // 'three' at its own top, and runInEngineOrigin's minimal shell page carries no import map of its
            // own (index.html's is what production pages get, not this harness's blank page). Registered here
            // rather than assumed, because the alternative -- relying on production index.html's map while
            // testing a bare harness page -- would test the wrong document.
            const im = document.createElement("script");
            im.type = "importmap";
            im.textContent = JSON.stringify({ imports: { "three": "/vendor/three/three.module.js" } });
            document.head.appendChild(im);
            await new Promise((r) => setTimeout(r, 10));

            const canvas = document.createElement("canvas");
            const gl = canvas.getContext("webgl2");
            if (!gl) return { ok: false, reason: "no webgl2 context in this headless page" };
            const { GPUAssetLoader } = await import("/gpu/gpuAssetLoader.js");
            const loader = new GPUAssetLoader(gl, { basePath: "/gpu/fixtures/" });
            loader.primeKnownAssets(["fbxIngest.ascii"], {
                "fbxIngest.ascii": { glb: false, obj: false, fbx: true, folder: false },
            });
            let mesh;
            try { mesh = await loader.loadAsset("fbxIngest.ascii"); }
            catch (e) { return { ok: false, stage: "loadAsset threw", error: String(e && e.message || e) }; }
            if (!mesh) return { ok: false, reason: "loadAsset returned null" };
            return {
                ok: true,
                vertexCount: mesh.vertexCount,
                indexCount: mesh.indexCount,
                hasNormals: mesh.hasNormals,
                hasTexCoords: mesh.hasTexCoords,
                hasTexture: mesh.hasTexture,
                hasColors: mesh.hasColors,
                isRigged: mesh.isRigged,
                bounds: mesh.bounds,
                positions: Array.from(mesh.positions),
                indices: Array.from(mesh.indices),
                normals: mesh.normals ? Array.from(mesh.normals) : null,
            };
        }`;
        const out = await runInEngineOrigin({ engineRoot: ENG, script: SCRIPT });
        if (out.skipped) { say("SKIP: " + out.reason); fails++; }
        else {
            ok("!! *** the SHIPPED pipeline (GPUAssetLoader.loadAsset -> _loadFBX -> real FBXLoader -> _uploadParsedMesh) loads it ***",
                out.ok && out.result && out.result.ok,
                out.ok ? JSON.stringify(out.result).slice(0, 200) : out.reason);
            if (out.ok && out.result && out.result.ok) {
                const r = out.result;
                // Measured directly in this file's own development, not assumed: 2 triangles x 3 corners each,
                // non-indexed geometry (FBXLoader's own GeometryParser emits one flat vertex per polygon corner,
                // no shared-vertex indexing), so normalizeFbxGroup()'s identity-index synthesis is exercised for
                // real, not only on a contrived empty-index case.
                ok("!! *** vertexCount is EXACTLY 6 (2 triangles x 3 corners, FBXLoader emits no shared indices) ***",
                    r.vertexCount === 6, "got " + r.vertexCount);
                ok("!! *** indexCount is EXACTLY 6, and they are the synthesized identity 0..5 (geometry.index is null) ***",
                    r.indexCount === 6, "got " + r.indexCount);
                ok("!! *** the positions come back EXACT, corner by corner (matrixWorld-baked, world is identity here) ***",
                    JSON.stringify(r.positions) === JSON.stringify([0,0,0, 2,0,0, 0,2,0, 2,0,0, 2,2,0, 0,2,0]),
                    JSON.stringify(r.positions));
                ok("!! the reconstructed indices are the identity synthesis, not left undefined",
                    JSON.stringify(r.indices) === JSON.stringify([0,1,2,3,4,5]), JSON.stringify(r.indices));
                ok("!! hasNormals is true and the normal buffer is EXACTLY the fixture's flat-plane (0,0,1) x 6",
                    r.hasNormals && JSON.stringify(r.normals) === JSON.stringify([0,0,1, 0,0,1, 0,0,1, 0,0,1, 0,0,1, 0,0,1]),
                    JSON.stringify(r.normals));
                ok("!! hasTexCoords is true (the fixture's UV layer round-tripped into a real GL buffer)",
                    r.hasTexCoords === true);
                ok("...hasTexture is false -- the documented v1 gap, not an accident",
                    r.hasTexture === false);
                ok("...isRigged is false -- this fixture carries no skeleton (see this file's own header on why)",
                    r.isRigged === false);
                ok("!! bounds match the fixture's own control points exactly",
                    r.bounds && r.bounds.minX === 0 && r.bounds.minY === 0 && r.bounds.minZ === 0 &&
                    r.bounds.maxX === 2 && r.bounds.maxY === 2 && r.bounds.maxZ === 0,
                    JSON.stringify(r.bounds));
            }
        }

        // ---- 3b. THE IMPORT-MAP FAILURE MODE ALSO PRODUCES A NAMED FIX, NOT A BARE BROWSER ERROR ----
        say("3b. the \"no import map\" failure names the actual fix, matching gpu/glbLoad.js's own " +
            "\"a helpful error is not a route\" standard");
        const SCRIPT_NO_MAP = `async () => {
            // Deliberately NO importmap injected this time.
            const canvas = document.createElement("canvas");
            const gl = canvas.getContext("webgl2");
            if (!gl) return { ok: false, reason: "no webgl2" };
            const { GPUAssetLoader } = await import("/gpu/gpuAssetLoader.js");
            const loader = new GPUAssetLoader(gl, { basePath: "/gpu/fixtures/" });
            loader.primeKnownAssets(["fbxIngest.ascii"], {
                "fbxIngest.ascii": { glb: false, obj: false, fbx: true, folder: false },
            });
            try {
                await loader._loadFBX("fbxIngest.ascii", "/gpu/fixtures/fbxIngest.ascii.fbx");
                return { ok: true, unexpectedSuccess: true };
            } catch (e) {
                return { ok: false, message: String(e && e.message || e) };
            }
        }`;
        const out2 = await runInEngineOrigin({ engineRoot: ENG, script: SCRIPT_NO_MAP });
        if (out2.skipped) { say("SKIP: " + out2.reason); fails++; }
        else {
            const msg = out2.ok && out2.result ? (out2.result.message || "") : (out2.reason || "");
            ok("!! *** without the import map, _loadFBX throws a message NAMING the fix, not a bare browser error ***",
                out2.ok && out2.result && !out2.result.unexpectedSuccess &&
                /import map/.test(msg) && /vendor\/three\/three\.module\.js/.test(msg) && /index\.html/.test(msg),
                msg.slice(0, 200));
        }
    }
}

// ---- 4. THE GLB REFACTOR: _uploadParsedMesh EXISTS, _loadGLBFromBytes IS NOW SHORT, AND THE REAL OUTPUT DID NOT MOVE
console.log("\n4. *** _loadGLBFromBytes WAS REFACTORED TO SHARE _uploadParsedMesh WITH THE NEW FBX PATH -- PROVEN,");
console.log("      NOT ASSUMED, AGAINST WHAT THE PIPELINE ACTUALLY RETURNS ***");
{
    ok("!! _uploadParsedMesh exists as its own method, taking (name, parsed, opts)",
        /_uploadParsedMesh\(name, parsed, opts\) \{/.test(gpuAssetLoaderSrc));
    ok("!! _loadFBX's normalized FBX output is uploaded through the SAME method GLB uses, not a parallel copy",
        /_loadFBX[\s\S]{0,1600}?return this\._uploadParsedMesh\(name, parsed, \{\}\);/.test(gpuAssetLoaderSrc));

    const mLoad = gpuAssetLoaderSrc.match(/async _loadGLBFromBytes\(name, buf, opts\) \{([\s\S]*?)\n    \}\n\n    \/\/ v44/);
    if (mLoad) {
        const body = mLoad[1];
        const bodyLines = body.split("\n").filter((l) => l.trim().length > 0);
        ok("!! *** _loadGLBFromBytes's body is now SHORT -- parse, then hand off, nothing else ***",
            bodyLines.length <= 4, bodyLines.length + " non-blank line(s): " + JSON.stringify(bodyLines));
        ok("...and it calls _uploadParsedMesh rather than re-implementing the GPU upload inline",
            /return this\._uploadParsedMesh\(name, parsed, opts\);/.test(body));
    } else {
        ok("!! could locate _loadGLBFromBytes's body to measure it", false, "regex did not match -- method shape changed unexpectedly");
    }

    const skip = webgpuSkipReason();
    if (skip) { say("SKIP (no headless shell / playwright): " + skip); fails++; }
    else {
        const glbFixture = path.join(ENG, "gpu/fixtures/regressionTri.glb");
        ok("!! the GLB regression fixture exists (self-authored via tools/export/voxelGlb.mjs's writeGlb -- no third-party bytes)",
            fs.existsSync(glbFixture), glbFixture);

        const SCRIPT = `async () => {
            const canvas = document.createElement("canvas");
            const gl = canvas.getContext("webgl2");
            if (!gl) return { ok: false, reason: "no webgl2" };
            const { GPUAssetLoader } = await import("/gpu/gpuAssetLoader.js");
            const loader = new GPUAssetLoader(gl, { basePath: "/gpu/fixtures/" });
            loader.primeKnownAssets(["regressionTri"], { regressionTri: { glb: true, obj: false, fbx: false, folder: false } });
            let mesh;
            try { mesh = await loader.loadAsset("regressionTri"); }
            catch (e) { return { ok: false, stage: "loadAsset threw", error: String(e && e.message || e) }; }
            if (!mesh) return { ok: false, reason: "loadAsset returned null" };
            const readBuf = (buf, target, Ctor, len) => {
                if (!buf) return null;
                gl.bindBuffer(target, buf);
                const out = new Ctor(len);
                gl.getBufferSubData(target, 0, out);
                return Array.from(out);
            };
            return {
                ok: true,
                vertexCount: mesh.vertexCount, indexCount: mesh.indexCount,
                hasNormals: mesh.hasNormals, hasColors: mesh.hasColors, hasTexture: mesh.hasTexture,
                isRigged: mesh.isRigged, bounds: mesh.bounds,
                vboContents: readBuf(mesh.vbo, gl.ARRAY_BUFFER, Float32Array, mesh.vertexCount * 3),
                iboContents: readBuf(mesh.ibo, gl.ELEMENT_ARRAY_BUFFER, Uint32Array, mesh.indexCount),
                nboContents: mesh.nbo ? readBuf(mesh.nbo, gl.ARRAY_BUFFER, Float32Array, mesh.vertexCount * 3) : null,
            };
        }`;
        const out = await runInEngineOrigin({ engineRoot: ENG, script: SCRIPT });
        // *** THESE EXACT VALUES ARE NOT GUESSED. *** They are what tools/ship/gpuAssetLoader.js's GLB path
        // returned for this exact fixture BOTH immediately before the _uploadParsedMesh refactor (`git stash`
        // on gpu/gpuAssetLoader.js alone, isolating just that file to its pre-refactor HEAD version) and
        // immediately after -- a byte-for-byte diff of the two runs' full JSON output, including real
        // gl.getBufferSubData() readback of the VBO/IBO/NBO contents, came back IDENTICAL. See
        // gpu/fixtures/PROVENANCE.md's entry for regressionTri.glb for the full account. This section re-runs
        // the "after" half as a standing regression pin.
        if (out.skipped) { say("SKIP: " + out.reason); fails++; }
        else {
            ok("!! the GLB path still loads through the refactored pipeline",
                out.ok && out.result && out.result.ok, out.ok ? "" : out.reason);
            if (out.ok && out.result && out.result.ok) {
                const r = out.result;
                const expectPos = [0,0,0, 2,0,0, 0,3,0, 0,0,4];
                const expectIdx = [0,1,2, 0,2,3];
                ok("!! *** vertexCount/indexCount are EXACTLY the pre-refactor values -- 4 verts, 6 indices ***",
                    r.vertexCount === 4 && r.indexCount === 6,
                    "got vertexCount=" + r.vertexCount + " indexCount=" + r.indexCount);
                ok("!! *** the VBO's real GPU contents are byte-identical to the pre-refactor readback ***",
                    JSON.stringify(r.vboContents) === JSON.stringify(expectPos), JSON.stringify(r.vboContents));
                ok("!! *** the IBO's real GPU contents are byte-identical to the pre-refactor readback ***",
                    JSON.stringify(r.iboContents) === JSON.stringify(expectIdx), JSON.stringify(r.iboContents));
                ok("!! hasNormals/hasColors/hasTexture/isRigged flags are unchanged from the pre-refactor run",
                    r.hasNormals === true && r.hasColors === false && r.hasTexture === false && r.isRigged === false);
                ok("!! bounds are unchanged from the pre-refactor run",
                    r.bounds && r.bounds.minX === 0 && r.bounds.minY === 0 && r.bounds.minZ === 0 &&
                    r.bounds.maxX === 2 && r.bounds.maxY === 3 && r.bounds.maxZ === 4, JSON.stringify(r.bounds));
            }
        }
    }
}

// ---- 5. index.html CARRIES THE IMPORT MAP FBXLoader.js's OWN `from "three"` NEEDS ------------------------------
console.log("\n5. index.html'S IMPORT MAP -- THE DOCUMENT gpuAssetLoader.js's DYNAMIC import() ACTUALLY LOADS IN");
{
    const mapMatch = indexHtmlSrc.match(/<script\s+type=["']importmap["']\s*>([\s\S]*?)<\/script>/i);
    ok("!! index.html declares a <script type=\"importmap\">", !!mapMatch);
    let mapsThree = false;
    if (mapMatch) {
        try { mapsThree = JSON.parse(mapMatch[1])?.imports?.three === "/vendor/three/three.module.js"; } catch {}
    }
    ok("!! ...and it maps \"three\" to the exact vendored path FBXLoader.js's bare specifier needs", mapsThree);
    const mapIdx = indexHtmlSrc.search(/<script\s+type=["']importmap["']/i);
    const modIdx = indexHtmlSrc.search(/<script\s+type=["']module["']/i);
    ok("!! the import map sits BEFORE the first <script type=\"module\"> in the document",
        mapIdx >= 0 && (modIdx < 0 || mapIdx < modIdx));
    say("tools/ship/threeImportmap-selfcheck.mjs already gates every page in this tree for this property; " +
        "this section re-checks index.html specifically because it is the page task #44 named as the one " +
        "that needed the fix.");
}

// ---- 6. TASK #59 -- THE RIGGED+ANIMATED FIXTURE ROUND-TRIPS, WITH EXACT MEASURED NUMBERS -----------------------
console.log("\n6. *** TASK #59: gpu/fbxLoad.js's mapFbxAnimations() -- SKIN + ANIMATION, TOGETHER, THROUGH THE REAL");
console.log("      PIPELINE, GRADED AGAINST HAND-COMPUTED NUMBERS, NOT \"IT LOADED\" ***");
{
    const skip = webgpuSkipReason();
    if (skip) {
        say("SKIP (no headless shell / playwright): " + skip);
        fails++;
    } else {
        const animFixturePath = path.join(ENG, "gpu/fixtures/fbxAnim.ascii.fbx");
        ok("!! the committed rigged+animated fixture exists", fs.existsSync(animFixturePath), animFixturePath);

        const SCRIPT = `async () => {
            const im = document.createElement("script");
            im.type = "importmap";
            im.textContent = JSON.stringify({ imports: { "three": "/vendor/three/three.module.js" } });
            document.head.appendChild(im);
            await new Promise((r) => setTimeout(r, 10));

            const canvas = document.createElement("canvas");
            const gl = canvas.getContext("webgl2");
            if (!gl) return { ok: false, reason: "no webgl2 context in this headless page" };
            const { GPUAssetLoader } = await import("/gpu/gpuAssetLoader.js");
            const loader = new GPUAssetLoader(gl, { basePath: "/gpu/fixtures/" });
            loader.primeKnownAssets(["fbxAnim.ascii"], {
                "fbxAnim.ascii": { glb: false, obj: false, fbx: true, folder: false },
            });
            let mesh;
            try { mesh = await loader.loadAsset("fbxAnim.ascii"); }
            catch (e) { return { ok: false, stage: "loadAsset threw", error: String(e && e.message || e) }; }
            if (!mesh) return { ok: false, reason: "loadAsset returned null" };
            return {
                ok: true,
                vertexCount: mesh.vertexCount,
                indexCount: mesh.indexCount,
                hasNormals: mesh.hasNormals,
                hasTexCoords: mesh.hasTexCoords,
                isRigged: mesh.isRigged,
                nodeNames: mesh.nodes ? mesh.nodes.map((n) => n.name) : null,
                skinJoints: mesh.skin ? mesh.skin.joints : null,
                skinIndex: mesh.joints ? Array.from(mesh.joints) : null,
                skinWeight: mesh.weights ? Array.from(mesh.weights) : null,
                animations: mesh.animations ? mesh.animations.map((c) => ({
                    name: c.name,
                    duration: c.duration,
                    samplers: c.samplers.map((s) => ({
                        times: Array.from(s.times),
                        values: Array.from(s.values),
                        interpolation: s.interpolation,
                    })),
                    channels: c.channels,
                })) : null,
            };
        }`;
        const out = await runInEngineOrigin({ engineRoot: ENG, script: SCRIPT });
        if (out.skipped) { say("SKIP: " + out.reason); fails++; }
        else {
            ok("!! *** the SHIPPED pipeline loads the rigged+animated fixture (loadAsset -> _loadFBX -> real ***",
                out.ok && out.result && out.result.ok,
                out.ok ? JSON.stringify(out.result).slice(0, 200) : out.reason);
            if (out.ok && out.result && out.result.ok) {
                const r = out.result;
                // Every number below is measured, then hand-derived independently from the fixture's own
                // authored values (gpu/fixtures/fbxAnim.ascii.fbx) -- not copy-pasted from a first passing run.
                // See this file's header for the fixture's shape (2 bones, quad skinned to them, one clip).
                ok("!! *** vertexCount/indexCount are EXACTLY 6/6 (the same quad as fbxIngest.ascii.fbx) ***",
                    r.vertexCount === 6 && r.indexCount === 6,
                    "got vertexCount=" + r.vertexCount + " indexCount=" + r.indexCount);
                ok("!! hasNormals/hasTexCoords are both true -- the skin path did not disturb the geometry path",
                    r.hasNormals === true && r.hasTexCoords === true);
                ok("!! *** isRigged is true -- skin AND animations are both present, the first time this gate has",
                    r.isRigged === true, "  seen that (fbxIngest.ascii.fbx has neither; task #44's fixture alone could never set this flag)");

                // nodes: pre-order DFS from the group. Objects.Model's file order is fixtureMesh(2000000),
                // root(2100000), child(2200000) -- modelMap preserves insertion order, so snapshotNodes() visits
                // [group, fixtureMesh, root, child] in exactly that order. Measured, not assumed: verified via
                // this file's own iteration script against FBXLoader directly before this section was written.
                ok("!! *** nodes are EXACTLY [\"\", \"fixtureMesh\", \"root\", \"child\"], in that pre-order ***",
                    JSON.stringify(r.nodeNames) === JSON.stringify(["", "fixtureMesh", "root", "child"]),
                    JSON.stringify(r.nodeNames));

                // skin.joints holds NODE INDICES (glTF convention) in skeleton.bones order (root Cluster's
                // connection precedes child Cluster's in the fixture's Connections block, so bones = [root,
                // child]) -- node indices 2 and 3 per the nodes array just proven above.
                ok("!! *** skin.joints is EXACTLY [2, 3] (root's node index, then child's) ***",
                    JSON.stringify(r.skinJoints) === JSON.stringify([2, 3]), JSON.stringify(r.skinJoints));

                // skinIndex/skinWeight: the fixture's Cluster Indexes assign control points 0,1 (the quad's
                // bottom edge, y=0) fully to bone 0 (root) and control points 2,3 (the top edge, y=2) fully to
                // bone 1 (child), each with weight 1 and no blending. FBXLoader expands 4 control points into
                // 6 non-indexed polygon-vertex corners (triangles [0,1,2],[1,3,2]) the same way fbxIngest.ascii
                // .fbx's position path does -- so the SAME per-control-point skin assignment appears 6 times
                // (once per corner), each padded to 4 joint/weight slots (glTF's fixed vec4 convention), with
                // the 3 unused slots at weight 0.
                const expectSkinIndex  = [0,0,0,0, 0,0,0,0, 1,0,0,0,  0,0,0,0, 1,0,0,0, 1,0,0,0];
                const expectSkinWeight = [1,0,0,0, 1,0,0,0, 1,0,0,0,  1,0,0,0, 1,0,0,0, 1,0,0,0];
                ok("!! *** skinIndex (the GPU joints attribute) matches the fixture's Cluster assignment exactly ***",
                    JSON.stringify(r.skinIndex) === JSON.stringify(expectSkinIndex), JSON.stringify(r.skinIndex));
                ok("!! *** skinWeight matches too -- every corner fully weighted to its one bone, no blending ***",
                    JSON.stringify(r.skinWeight) === JSON.stringify(expectSkinWeight), JSON.stringify(r.skinWeight));

                // animations -- THE NEW CODE THIS ROUND ADDS. One clip, one QuaternionKeyframeTrack (rotation),
                // resolved to the child bone (node index 3). Values are hand-derived below, not copied from a
                // first passing run:
                //   FBX curve values are DEGREES: X goes 0 -> 90 over KeyTime 0 -> 46186158000 FBX time units.
                //   convertFBXTimeToSeconds divides by 46186158000 (vendor/three/jsm/loaders/FBXLoader.js
                //   ~line 4082) -- so times are EXACTLY [0, 1] (both integers, exact in f64 division).
                //   A pure-X Euler rotation of 90 degrees ((pi/2, 0, 0) radians, any Euler order since the other
                //   two axes are zero) is the quaternion (sin(pi/4), 0, 0, cos(pi/4)) = (0.7071067811865476, 0,
                //   0, 0.7071067811865476) in float64 -- QuaternionKeyframeTrack stores values as Float32Array
                //   (vendor/three/three.module.js's KeyframeTrack.ValueBufferType), and that value rounds to
                //   EXACTLY 0.7071067690849304 in float32 -- the number below is that rounded value, not the
                //   float64 one, because that is what actually reaches normalizeFbxGroup().
                //   duration: trusted from THREE.AnimationClip (see gpu/fbxLoad.js's header for why) -- for a
                //   single 2-keyframe track spanning t=[0,1], that is exactly 1.
                const clip = r.animations && r.animations[0];
                ok("!! *** exactly 1 animation clip, named \"TestClip\", duration EXACTLY 1 ***",
                    r.animations && r.animations.length === 1 && clip &&
                    clip.name === "TestClip" && clip.duration === 1,
                    JSON.stringify(r.animations).slice(0, 200));
                if (clip) {
                    ok("!! *** exactly 1 sampler, times EXACTLY [0, 1], LINEAR interpolation ***",
                        clip.samplers.length === 1 &&
                        JSON.stringify(clip.samplers[0].times) === JSON.stringify([0, 1]) &&
                        clip.samplers[0].interpolation === "LINEAR",
                        JSON.stringify(clip.samplers[0]).slice(0, 200));
                    const expectValues = [0, 0, 0, 1,  0.7071067690849304, 0, 0, 0.7071067690849304];
                    ok("!! *** the quaternion values are EXACTLY [identity, then a 90-degree X rotation] ***",
                        JSON.stringify(clip.samplers[0].values) === JSON.stringify(expectValues),
                        JSON.stringify(clip.samplers[0].values));
                    ok("!! *** exactly 1 channel: samplerIdx 0, targetNode 3 (\"child\"), path \"rotation\" ***",
                        clip.channels.length === 1 && clip.channels[0].samplerIdx === 0 &&
                        clip.channels[0].targetNode === 3 && clip.channels[0].path === "rotation",
                        JSON.stringify(clip.channels));
                    say("path is \"rotation\", NOT \"quaternion\" -- FBXLoader names its own track " +
                        "\"child.quaternion\" (three.js's Object3D property), and mapFbxAnimations() translates " +
                        "that to glTF's channel-path word, which is what GLBParser's own consumers expect " +
                        "(see gpu/fbxLoad.js's FBX_TRACK_PROPERTY_TO_GLTF_PATH and header).");
                }
            }
        }
    }
}

// ---- 7. TASK #59 ROUND 2 -- preRotation/postRotation, non-default Euler order, position/scale tracks, -----
//         and multi-clip files, ALL GRADED AGAINST EXACT MEASURED NUMBERS -----------------------------------
console.log("\n7. *** TASK #59 ROUND 2: THE GAPS SECTION 6 NAMED -- preRotation/postRotation composition, a");
console.log("      non-default RotationOrder, position/scale (VectorKeyframeTrack) channels, and TWO");
console.log("      AnimationStacks in one file, THROUGH THE REAL PIPELINE, GRADED AGAINST NUMBERS FROM AN");
console.log("      INDEPENDENT three.js QUATERNION/EULER ORACLE, NOT HAND TRIGONOMETRY ***");
{
    const skip = webgpuSkipReason();
    if (skip) {
        say("SKIP (no headless shell / playwright): " + skip);
        fails++;
    } else {
        const advFixturePath = path.join(ENG, "gpu/fixtures/fbxAnimAdvanced.ascii.fbx");
        ok("!! the committed mesh-less, skin-less animation fixture exists", fs.existsSync(advFixturePath), advFixturePath);

        const SCRIPT = `async () => {
            const im = document.createElement("script");
            im.type = "importmap";
            im.textContent = JSON.stringify({ imports: { "three": "/vendor/three/three.module.js" } });
            document.head.appendChild(im);
            await new Promise((r) => setTimeout(r, 10));

            const canvas = document.createElement("canvas");
            const gl = canvas.getContext("webgl2");
            if (!gl) return { ok: false, reason: "no webgl2 context in this headless page" };
            const { GPUAssetLoader } = await import("/gpu/gpuAssetLoader.js");
            const loader = new GPUAssetLoader(gl, { basePath: "/gpu/fixtures/" });
            loader.primeKnownAssets(["fbxAnimAdvanced.ascii"], {
                "fbxAnimAdvanced.ascii": { glb: false, obj: false, fbx: true, folder: false },
            });
            let mesh;
            try { mesh = await loader.loadAsset("fbxAnimAdvanced.ascii"); }
            catch (e) { return { ok: false, stage: "loadAsset threw", error: String(e && e.message || e) }; }
            if (!mesh) return { ok: false, reason: "loadAsset returned null" };
            return {
                ok: true,
                nodeNames: mesh.nodes ? mesh.nodes.map((n) => n.name) : null,
                animations: mesh.animations ? mesh.animations.map((c) => ({
                    name: c.name,
                    duration: c.duration,
                    samplers: c.samplers.map((s) => ({
                        times: Array.from(s.times),
                        values: Array.from(s.values),
                        interpolation: s.interpolation,
                    })),
                    channels: c.channels,
                })) : null,
            };
        }`;
        const out = await runInEngineOrigin({ engineRoot: ENG, script: SCRIPT });
        if (out.skipped) { say("SKIP: " + out.reason); fails++; }
        else {
            ok("!! *** the SHIPPED pipeline loads the mesh-less, multi-clip fixture (loadAsset -> _loadFBX -> ***",
                out.ok && out.result && out.result.ok,
                out.ok ? JSON.stringify(out.result).slice(0, 200) : out.reason);
            if (out.ok && out.result && out.result.ok) {
                const r = out.result;
                // No mesh, no skin -- mapFbxAnimations() runs regardless (see gpu/fbxLoad.js's
                // normalizeFbxGroup(): `animations` is computed once, up front, before the mesh search).
                // nodes: pre-order DFS from the group. Objects.Model's file order is root(100000),
                // mover(100001), neither with a Model-Model parent connection, so both attach directly to
                // the scene root -- snapshotNodes() visits [group, root, mover] in that order.
                ok("!! *** nodes are EXACTLY [\"\", \"root\", \"mover\"], in that pre-order ***",
                    JSON.stringify(r.nodeNames) === JSON.stringify(["", "root", "mover"]), JSON.stringify(r.nodeNames));

                ok("!! *** exactly 2 animation clips (TWO AnimationStacks in one file, each its own entry) ***",
                    r.animations && r.animations.length === 2,
                    JSON.stringify(r.animations).slice(0, 300));

                const clipA = r.animations && r.animations.find((c) => c.name === "ClipA");
                const clipB = r.animations && r.animations.find((c) => c.name === "ClipB");
                ok("!! *** both clips are present, by name, and distinct (\"ClipA\" and \"ClipB\") ***",
                    !!clipA && !!clipB, JSON.stringify((r.animations || []).map((c) => c.name)));

                if (clipA) {
                    // --------------------------------------------------------------------------------------
                    // ClipA -- root's rotation (preRotation/postRotation/non-default RotationOrder composed
                    // through FBXLoader's own generateRotationTrack) + mover's position (plain VectorKeyframeTrack
                    // values, no trig at all).
                    // --------------------------------------------------------------------------------------
                    ok("!! *** ClipA: duration EXACTLY 1, 2 samplers/channels (root's rotation, mover's position) ***",
                        clipA.duration === 1 && clipA.samplers.length === 2 && clipA.channels.length === 2,
                        JSON.stringify(clipA).slice(0, 300));

                    const rotCh = clipA.channels.find((c) => c.path === "rotation");
                    const posCh = clipA.channels.find((c) => c.path === "translation");
                    ok("!! *** ClipA's rotation channel targets node 1 (\"root\"); position channel targets node 2 (\"mover\") ***",
                        rotCh && rotCh.targetNode === 1 && posCh && posCh.targetNode === 2,
                        JSON.stringify(clipA.channels));

                    const rotSamp = rotCh && clipA.samplers[rotCh.samplerIdx];
                    const posSamp = posCh && clipA.samplers[posCh.samplerIdx];

                    // ---- The composed rotation quaternions ------------------------------------------------
                    // Fixture: root's Properties70 set RotationOrder = enum 5 ("XYZ" -- FBXLoader's
                    // getEulerOrder() table at vendor/three/jsm/loaders/FBXLoader.js ~line 4243-4266; the
                    // IMPLICIT default when RotationOrder is absent is enum 0, "ZYX", NOT "XYZ" -- this fixture
                    // sets it explicitly to something else on purpose), PreRotation = (30,0,0) degrees,
                    // PostRotation = (0,45,0) degrees. The animated rotation curve (2 keyframes) goes
                    // (0,0,0) -> (60,0,0) degrees -- a single-axis span of 60 degrees, well under the 180-degree
                    // threshold where FBXLoader's interpolateRotations() would switch to a slerp-subdivided
                    // sub-interval path (a different code path this fixture does not exercise -- see this
                    // file's header).
                    //
                    // generateRotationTrack (vendor/three/jsm/loaders/FBXLoader.js ~line 2809-2880) composes,
                    // per keyframe:
                    //   quaternion = Quaternion().setFromEuler(Euler(keyframeXYZ_radians, eulerOrder))
                    //   quaternion.premultiply(preRotationQuat)          // this = preRotationQuat * this
                    //   quaternion.multiply(postRotationQuat.invert())   // this = this * postRotationQuat^-1
                    // where preRotationQuat/postRotationQuat are themselves
                    // Quaternion().setFromEuler(Euler(degToRad(PreRotation/PostRotation), eulerOrder)).
                    //
                    // *** THESE EXPECTED VALUES ARE NOT HAND-COMPUTED TRIGONOMETRY. *** They come from an
                    // independent Node.js script (not committed -- see this section's own comment for its full
                    // text, reproducible from what is written here) that imports Quaternion/Euler/MathUtils
                    // DIRECTLY from vendor/three/three.module.js and performs the EXACT SAME steps above:
                    //
                    //   import { Quaternion, Euler, MathUtils } from ".../vendor/three/three.module.js";
                    //   const eulerOrder = "XYZ";
                    //   function toQuat(degXYZ) {
                    //       const rad = degXYZ.map(MathUtils.degToRad);
                    //       return new Quaternion().setFromEuler(new Euler(rad[0], rad[1], rad[2], eulerOrder));
                    //   }
                    //   const preQuat = toQuat([30, 0, 0]);
                    //   const postQuatInv = toQuat([0, 45, 0]).invert();
                    //   function composed(keyDeg) {
                    //       const q = toQuat(keyDeg);
                    //       q.premultiply(preQuat);
                    //       q.multiply(postQuatInv);
                    //       return q;
                    //   }
                    //   // composed([0,0,0]) and composed([60,0,0]), each component then Math.fround()-ed to
                    //   // float32 (QuaternionKeyframeTrack's ValueBufferType), since float32 is what actually
                    //   // reaches normalizeFbxGroup() -- the same float64->float32 rounding discipline section 6
                    //   // used for its single rotation value.
                    //
                    // That oracle's output for t=0 (keyframe (0,0,0) deg -- NOT identity, because the composition
                    // still applies preRotationQuat/postRotationQuat even to a zero animated rotation) and t=1
                    // (keyframe (60,0,0) deg) is reproduced below and matched exactly against the real pipeline's
                    // output -- if the two ever disagree, that is a real finding in either FBXLoader's actual
                    // behaviour or this repo's understanding of it, not a rounding note to paper over.
                    const expectRotTimes = [0, 1];
                    const expectRotValues = [
                        0.23911762237548828, -0.36964380741119385, -0.0990457609295845, 0.8923990726470947,
                        0.6532815098762512, -0.27059805393218994, -0.27059805393218994, 0.6532815098762512,
                    ];
                    ok("!! *** rotation sampler: times EXACTLY [0, 1], LINEAR interpolation ***",
                        rotSamp && JSON.stringify(rotSamp.times) === JSON.stringify(expectRotTimes) &&
                        rotSamp.interpolation === "LINEAR",
                        rotSamp ? JSON.stringify({ times: rotSamp.times, interpolation: rotSamp.interpolation }) : "no rotation sampler");
                    ok("!! *** rotation sampler values match the independent three.js Quaternion/Euler oracle EXACTLY ***",
                        rotSamp && JSON.stringify(rotSamp.values) === JSON.stringify(expectRotValues),
                        rotSamp ? JSON.stringify(rotSamp.values) : "no rotation sampler");

                    // ---- The position (VectorKeyframeTrack) channel: plain values, no trig at all ----
                    const expectPosTimes = [0, 1];
                    const expectPosValues = [0, 0, 0, 5, -3, 2];
                    ok("!! *** position sampler: times EXACTLY [0, 1], values EXACTLY [(0,0,0), (5,-3,2)], LINEAR ***",
                        posSamp && JSON.stringify(posSamp.times) === JSON.stringify(expectPosTimes) &&
                        JSON.stringify(posSamp.values) === JSON.stringify(expectPosValues) &&
                        posSamp.interpolation === "LINEAR",
                        posSamp ? JSON.stringify(posSamp) : "no position sampler");
                }

                if (clipB) {
                    // --------------------------------------------------------------------------------------
                    // ClipB -- mover's scale, in a SEPARATE AnimationStack/AnimationLayer from ClipA. Proves
                    // multi-clip resolution: this channel must NOT leak into ClipA's channel list above, and
                    // ClipA's channels must not leak into this one.
                    // --------------------------------------------------------------------------------------
                    ok("!! *** ClipB: duration EXACTLY 1, exactly 1 sampler/channel (mover's scale only) ***",
                        clipB.duration === 1 && clipB.samplers.length === 1 && clipB.channels.length === 1,
                        JSON.stringify(clipB));
                    const scaleCh = clipB.channels[0];
                    ok("!! *** ClipB's scale channel targets node 2 (\"mover\"), path \"scale\" ***",
                        scaleCh && scaleCh.targetNode === 2 && scaleCh.path === "scale", JSON.stringify(scaleCh));
                    const scaleSamp = scaleCh && clipB.samplers[scaleCh.samplerIdx];
                    const expectScaleTimes = [0, 1];
                    const expectScaleValues = [1, 1, 1, 2, 1, 0.5];
                    ok("!! *** scale sampler: times EXACTLY [0, 1], values EXACTLY [(1,1,1), (2,1,0.5)], LINEAR ***",
                        scaleSamp && JSON.stringify(scaleSamp.times) === JSON.stringify(expectScaleTimes) &&
                        JSON.stringify(scaleSamp.values) === JSON.stringify(expectScaleValues) &&
                        scaleSamp.interpolation === "LINEAR",
                        scaleSamp ? JSON.stringify(scaleSamp) : "no scale sampler");
                    say("ClipA's channels (root.rotation, mover.translation) and ClipB's channel " +
                        "(mover.scale) stayed in their own clips -- multi-clip files resolve to distinct, " +
                        "non-overlapping entries in mapFbxAnimations()'s output, not one merged clip.");
                }
            }
        }
    }
}

console.log("\n" + (fails ? "FAIL -- " + fails + " check(s)" : "ALL GREEN") +
    "\nSee this file's own header for the full list of what is deliberately NOT proven here: no multi-mesh/" +
    "multi-material concat, no embedded-texture extraction, no morph-target (DeformPercent) animation tracks, " +
    "and no rotation curve spanning >=180 degrees between keyframes on one axis (FBXLoader's slerp-subdivision " +
    "path). CUBICSPLINE interpolation is NOT on that list as an open gap -- it is unreachable from the " +
    "currently-vendored FBXLoader (see the header for why), not merely undone.");
process.exit(fails ? 1 : 0);
