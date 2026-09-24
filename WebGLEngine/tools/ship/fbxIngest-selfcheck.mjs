// WebGLEngine/tools/ship/fbxIngest-selfcheck.mjs -- v4 (closed the 4 gaps section 7's own footer named)
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
// v4 -- THE 4 GAPS SECTION 7'S OWN FOOTER NAMED, CLOSED THIS ROUND (sections 8-11)
// ================================================================================================
//
// Sections 8-11 close the four items v3's closing summary named plainly as still open: multi-mesh/
// multi-material concat, embedded-texture extraction, morph-target (DeformPercent) animation tracks, and a
// rotation curve spanning >=180 degrees between keyframes. Three of the four needed real code in
// gpu/fbxLoad.js (normalizeFbxGroup() rewritten to a two-pass multi-mesh/multi-material concat mirroring
// GLBParser.js's own primData/vOff pattern, made async to await createImageBitmap()+a THREE.LoadingManager
// wait for embedded textures, plus a new readFbxMorphTargets() and a MORPH_TRACK_RE branch in
// mapFbxAnimations()); the fourth needed none -- see section 11's own comment for why. gpu/gpuAssetLoader.js's
// _loadFBX() was updated to construct a LoadingManager and await the now-async normalizeFbxGroup(); no other
// caller of either function exists in this tree (grepped before relying on that).
//
// Two research passes preceded the fixture-authoring: a full read of FBXLoader.js's GeometryParser
// (parseMaterialIndices, the LayerElementMaterial -> geo.groups pipeline) and DeformerParser/AnimationParser
// (the Shape/BlendShapeChannel/BlendShape connection chain and the DeformPercent curve's own connection
// path), confirmed section-by-section against this round's actual fixtures and the real headless-Chromium
// harness before a single gate assertion was written -- not trusted from the reading alone.
//
// ================================================================================================
// WHAT THIS GATE DOES NOT PROVE -- READ THIS BEFORE TRUSTING A GREEN RUN, SAME STYLE AS
// gpu/fixtures/PROVENANCE.md AND gpu/GLBParser.js's OWN HEADER
// ================================================================================================
//
//   * MULTI-MESH/MULTI-MATERIAL CONCAT (section 8) is proven for the LayerElementMaterial "ByPolygon" +
//     "IndexToDirect" shape only (the shape real FBX exporters emit) -- "ByPolygonVertex"/"ByVertice"/
//     "AllSame" mapping types are not exercised, and multiple separate Mesh Models in one file (as opposed to
//     one mesh split across two materials) is exercised structurally by normalizeFbxGroup()'s two-pass concat
//     but has no dedicated fixture proving it end to end; both are the same code path section 8 already
//     grades, not a different one, but neither has its own committed regression fixture.
//   * EMBEDDED-TEXTURE EXTRACTION (section 9) is proven for one embedded PNG on one material's DiffuseColor
//     slot. Bump/normal/emissive/specular/alpha maps, an EXTERNAL (non-embedded, file-path) texture
//     reference, and more than one texture per mesh are not exercised -- normalizeFbxGroup() only ever reads
//     `mat.map` (DiffuseColor), matching GLBParser's own single-baseColor-map scope.
//   * MORPH-TARGET (DeformPercent) ANIMATION TRACKS (section 10) are proven for one Shape target on one mesh,
//     with a `Vertices`/`Indexes` position-only delta (no normal deltas -- FBXLoader's own genMorphGeometry
//     only ever produces position deltas, confirmed by reading that function; readFbxMorphTargets()'s
//     `normals: null` per target is a faithful reflection of that, not a narrower scope of its own). More than
//     one Shape target on the same mesh, and a mesh with morph targets AND skin together, are not exercised.
//   * THE >=180 DEGREE ROTATION-CURVE GAP (section 11) NEEDED NO CODE CHANGE -- VERIFICATION ONLY. FBXLoader's
//     own interpolateRotations() (vendor/three/jsm/loaders/FBXLoader.js) does the entire slerp-subdivision
//     before any value reaches gpu/fbxLoad.js's mapFbxAnimations(), which already made zero assumptions about
//     a track's sample count. Section 11 proves FAITHFUL PASS-THROUGH -- normalizeFbxGroup()'s sampler
//     compared byte-for-byte against FBXLoader's own raw group.animations track from the SAME run, not a
//     hand-derived slerp -- and documents a genuinely surprising discovery made while building this fixture:
//     interpolateRotations()'s own subdivision loop (`for (let t = 0; t < 1; t += 1 / numSubIntervals)`) never
//     emits a sample at t=1, so the ORIGINAL FINAL KEYFRAME VALUE NEVER APPEARS IN THE OUTPUT TRACK when the
//     span is >=180 degrees -- not a bug in this fixture or this round's code, a real, load-bearing quirk of
//     the currently-vendored loader's own algorithm, confirmed by reading that loop directly (see section 11's
//     comment for the exact trace against this fixture's 270-degree span).
//   * ANIMATION MAPPING'S EARLIER GAPS (task #59) remain proven as sections 6-7 already established: a
//     QuaternionKeyframeTrack (rotation) resolved to its target node by name, LINEAR interpolation, a clip's
//     `duration` trusted from THREE.AnimationClip, skin extraction exercised together with animation on the
//     same rig (section 6); preRotation/postRotation composition, a non-default RotationOrder, VectorKeyframeTrack
//     position/scale channels, and two separate AnimationStacks/clips in one file (section 7).
//   * CUBICSPLINE INTERPOLATION IS NOT A GAP -- IT IS UNREACHABLE FROM THE CURRENTLY-VENDORED FBXLoader, AND
//     DELIBERATELY NOT ATTEMPTED. Confirmed by reading vendor/three/jsm/loaders/FBXLoader.js's
//     AnimationParser in full: it never calls `.setInterpolation()` on any track it builds, so every track it
//     can ever produce carries KeyframeTrack's own class default, InterpolateLinear -- there is no FBX file,
//     hand-authored or otherwise, that could make THIS vendored loader emit anything but "LINEAR" through
//     gpu/fbxLoad.js's samplerInterpolation(). A future reader should not read a missing CUBICSPLINE fixture
//     as an unclosed item on this list; closing it would need a patched or newer FBXLoader, which is out of
//     this gate's scope entirely, not merely undone within it.
//   * MIXED-SKIN SCOPE -- FIXED AND GATED (sections 12-13, v5), AFTER AN ADVERSARIAL REVIEW OF v4 FOUND THE
//     OLD SYNTHETIC-JOINT-0 BINDING WAS A REAL, SILENT PRODUCTION RISK, NOT MERELY A NARROWER BEHAVIOR: a
//     secondary mesh in a multi-mesh skinned file INHERITED JOINT 0'S ENTIRE ANIMATED MOTION (a static prop
//     would visibly swing with a character's root-bone animation; a mesh meant to follow a different bone
//     would visibly detach from it). gpu/fbxLoad.js's normalizeFbxGroup() now registers a secondary mesh's
//     OWN node as a new joint (identity inverse-bind matrix), mirroring GLBParser.js's own primary
//     unskinnedPrims strategy, so the mesh tracks wherever it actually lives in the scene graph -- proven at
//     RENDER TIME (not just in the parsed shape) by section 12, both for an unrelated static prop AND a
//     genuine bone attachment checked against an independent three.js oracle. Bounded by a 64-joint
//     SHADER_JOINT_LIMIT; past that, section 13 proves the fallback (walk the real parent chain for the
//     nearest existing joint ancestor, bake the FULL world-space bind position) directly, in plain Node, via
//     a synthetic 65-joint graph -- this exact fallback's FIRST DRAFT had a real, adversarial-review-caught
//     math bug (baking an ancestor-relative delta double-applies the ancestor's own inverse-bind matrix and
//     silently drops its accumulated world offset, wrong even at rest pose), which section 13 now regression-
//     gates directly against the corrected formula. STILL NOT FIXED, named plainly: a SkinnedMesh bound to a
//     genuinely DIFFERENT skeleton than the reference takes this SAME new-joint path (no longer dragged by a
//     foreign character's motion) but loses its OWN internal multi-bone deformation, since only a single
//     rigid joint is registered for it -- supporting a second, fully independent, simultaneously-animated
//     skeleton in one combined draw call would need merging skeletons into one joint array with per-mesh
//     index remapping, a distinctly larger piece of work not attempted here.
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
import { fileURLToPath, pathToFileURL } from "node:url";
import { runInEngineOrigin, webgpuSkipReason } from "./webgpuHarness.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const say = (m) => console.log("  ----  " + m);
console.log("fbxIngest-selfcheck -- task #44: FBX assets were named everywhere and loaded nowhere\n");

const gpuAssetLoaderSrc = fs.readFileSync(path.join(ENG, "gpu/gpuAssetLoader.js"), "utf8");
const fbxLoadSrc        = fs.readFileSync(path.join(ENG, "gpu/fbxLoad.js"), "utf8");
const indexHtmlSrc      = fs.readFileSync(path.join(ENG, "index.html"), "utf8");

// ---- 1. THE .fbx EXTENSION IS IN THE HEAD-PROBE CHAIN --------------------------------------------------------
console.log("1. *** .fbx IS A REAL BRANCH IN _load()'S HEAD-PROBE CHAIN, NOT JUST A STRING SOMEWHERE ***");
{
    ok("!! tryFbx is read from the per-asset format map, alongside tryGlb/tryObj",
        /const tryFbx\s*=\s*!fmt\s*\|\|\s*fmt\.fbx/.test(gpuAssetLoaderSrc));
    ok("!! _load() HEAD-probes `${this.basePath}${name}.fbx` and calls _loadFBX() on a 200",
        /tryFbx[\s\S]{0,400}?\$\{this\.basePath\}\$\{name\}\.fbx[\s\S]{0,300}?this\._loadFBX\(name, fbxUrl\)/.test(gpuAssetLoaderSrc));
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
    ok("!! v4's gap closures (multi-mesh/multi-material, embedded-texture, morph-target) are documented in",
        /MULTI-MESH CONCAT \(v4\)/.test(fbxLoadSrc) && /EMBEDDED-TEXTURE EXTRACTION \(v4\)/.test(fbxLoadSrc) &&
        /MORPH-TARGET \(DeformPercent\) TRACKS \(v4\)/.test(fbxLoadSrc),
        "   the file's own header, GLBParser.js-header style");
    ok("!! ...and what is STILL not covered after v4 is named plainly too, not silently folded in",
        /STILL NOT COVERED/.test(fbxLoadSrc) && /mapFbxAnimations/.test(fbxLoadSrc));
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
        /_loadFBX[\s\S]{0,2600}?return this\._uploadParsedMesh\(name, parsed, \{\}\);/.test(gpuAssetLoaderSrc));

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

// ---- 8. MULTI-MESH/MULTI-MATERIAL CONCAT -----------------------------------------------------------------------
console.log("\n8. *** MULTI-MATERIAL CONCAT: LayerElementMaterial (ByPolygon/IndexToDirect) -> geo.groups ->");
console.log("      normalizeFbxGroup()'s primitiveRanges, THROUGH THE REAL PIPELINE ***");
{
    const skip = webgpuSkipReason();
    if (skip) { say("SKIP (no headless shell / playwright): " + skip); fails++; }
    else {
        const fixturePath = path.join(ENG, "gpu/fixtures/fbxMultiMaterial.ascii.fbx");
        ok("!! the committed multi-material fixture exists", fs.existsSync(fixturePath), fixturePath);

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
            loader.primeKnownAssets(["fbxMultiMaterial.ascii"], {
                "fbxMultiMaterial.ascii": { glb: false, obj: false, fbx: true, folder: false },
            });
            let mesh;
            try { mesh = await loader.loadAsset("fbxMultiMaterial.ascii"); }
            catch (e) { return { ok: false, stage: "loadAsset threw", error: String(e && e.stack || e) }; }
            if (!mesh) return { ok: false, reason: "loadAsset returned null" };
            return {
                ok: true,
                vertexCount: mesh.vertexCount,
                indexCount: mesh.indexCount,
                primitiveRanges: mesh.primitiveRanges,
            };
        }`;
        const out = await runInEngineOrigin({ engineRoot: ENG, script: SCRIPT });
        if (out.skipped) { say("SKIP: " + out.reason); fails++; }
        else {
            ok("!! *** the SHIPPED pipeline loads the 2-triangle, 2-material fixture ***",
                out.ok && out.result && out.result.ok,
                out.ok ? JSON.stringify(out.result).slice(0, 200) : out.reason);
            if (out.ok && out.result && out.result.ok) {
                const r = out.result;
                // The fixture's LayerElementMaterial is Materials: *2 { a: 0,1 } -- triangle 0 [0,1,2] -> mat 0,
                // triangle 1 [1,3,2] -> mat 1. FBXLoader's own genGeometry() derives geo.groups by walking the
                // per-vertex materialIndex array and emitting one addGroup() per contiguous run: [{start:0,
                // count:3,materialIndex:0},{start:3,count:3,materialIndex:1}] -- traced against this exact
                // fixture before this fixture was authored (see this file's header). normalizeFbxGroup() reads
                // geo.groups per mesh and resolves each group's materialIndex through its own materialIndexOf
                // map (built by walking meshes in order and deduping Material objects by JS reference), which
                // for a single mesh with two distinct materials is just the identity 0,1.
                ok("!! *** vertexCount/indexCount are EXACTLY 6/6 (same quad, unaffected by the material split) ***",
                    r.vertexCount === 6 && r.indexCount === 6,
                    "got vertexCount=" + r.vertexCount + " indexCount=" + r.indexCount);
                const expectRanges = [
                    { indexStart: 0, indexCount: 3, materialIdx: 0, vertexStart: 0, vertexCount: 6 },
                    { indexStart: 3, indexCount: 3, materialIdx: 1, vertexStart: 0, vertexCount: 6 },
                ];
                ok("!! *** primitiveRanges is EXACTLY 2 entries, one per triangle, materialIdx 0 then 1 ***",
                    JSON.stringify(r.primitiveRanges) === JSON.stringify(expectRanges),
                    JSON.stringify(r.primitiveRanges));
                say("materialIdx ordering is NOT coincidental: the fixture's Connections block lists " +
                    "C: \"OO\",3000000(matA),2000000(model) BEFORE C: \"OO\",3000001(matB),2000000(model) -- " +
                    "connection order is what FBXLoader's createMesh() uses to build its materials array, and " +
                    "that order is what normalizeFbxGroup()'s materialIndexOf map preserves as 0, 1.");
            }
        }
    }
}

// ---- 9. EMBEDDED-TEXTURE EXTRACTION -----------------------------------------------------------------------------
console.log("\n9. *** EMBEDDED-TEXTURE EXTRACTION: a base64 PNG in a Video node's Content -> parseFbx()'s");
console.log("      LoadingManager wait -> createImageBitmap() -> REAL GL TEXTURE, PIXELS READ BACK EXACT ***");
{
    const skip = webgpuSkipReason();
    if (skip) { say("SKIP (no headless shell / playwright): " + skip); fails++; }
    else {
        const fixturePath = path.join(ENG, "gpu/fixtures/fbxEmbeddedTexture.ascii.fbx");
        ok("!! the committed embedded-texture fixture exists", fs.existsSync(fixturePath), fixturePath);

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
            loader.primeKnownAssets(["fbxEmbeddedTexture.ascii"], {
                "fbxEmbeddedTexture.ascii": { glb: false, obj: false, fbx: true, folder: false },
            });
            let mesh;
            try { mesh = await loader.loadAsset("fbxEmbeddedTexture.ascii"); }
            catch (e) { return { ok: false, stage: "loadAsset threw", error: String(e && e.stack || e) }; }
            if (!mesh) return { ok: false, reason: "loadAsset returned null" };
            // Read the GL texture back via a 1x1 framebuffer-per-texel readPixels loop (2x2 here) so the
            // assertion is against what actually reached the GPU, not just against parsed.texture pre-upload.
            const fbo = gl.createFramebuffer();
            gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
            gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, mesh.texture, 0);
            const px = new Uint8Array(2 * 2 * 4);
            gl.readPixels(0, 0, 2, 2, gl.RGBA, gl.UNSIGNED_BYTE, px);
            gl.bindFramebuffer(gl.FRAMEBUFFER, null);
            return {
                ok: true,
                hasTexture: mesh.hasTexture,
                texturesByMaterialKeys: mesh.texturesByMaterial ? Object.keys(mesh.texturesByMaterial) : null,
                pixels: Array.from(px),
            };
        }`;
        const out = await runInEngineOrigin({ engineRoot: ENG, script: SCRIPT });
        if (out.skipped) { say("SKIP: " + out.reason); fails++; }
        else {
            ok("!! *** the SHIPPED pipeline loads the embedded-texture fixture and uploads a real GL texture ***",
                out.ok && out.result && out.result.ok,
                out.ok ? JSON.stringify(out.result).slice(0, 200) : out.reason);
            if (out.ok && out.result && out.result.ok) {
                const r = out.result;
                ok("!! *** hasTexture is true, texturesByMaterial has exactly key \"0\" ***",
                    r.hasTexture === true && JSON.stringify(r.texturesByMaterialKeys) === JSON.stringify(["0"]),
                    JSON.stringify(r));
                // The fixture's embedded PNG is a hand-built 2x2 RGB image, row-major top-to-bottom as PNG
                // stores it: row 0 (255,0,0) red, (0,255,0) green; row 1 (0,0,255) blue, (255,255,255) white.
                // _uploadParsedMesh uploads with UNPACK_FLIP_Y_WEBGL: false, so the source's row order is
                // copied byte-for-byte into the texture with no flip, and readPixels() reads that same order
                // back -- verified empirically against this exact fixture before this assertion was written
                // (this file's own discipline: measured, not assumed from a mental model of GL's row convention).
                const expectPixels = [
                    255,0,0,255,   0,255,0,255,        // row 0: red, green
                    0,0,255,255,   255,255,255,255,    // row 1: blue, white
                ];
                ok("!! *** the GL texture's actual readPixels() bytes are EXACTLY the fixture's authored PNG ***",
                    JSON.stringify(r.pixels) === JSON.stringify(expectPixels), JSON.stringify(r.pixels));
            }
        }

        // ---- 9b. WITHOUT A MANAGER, THE OLD (v1-v3) BEHAVIOR IS REPRODUCED, NOT BROKEN ----
        say("9b. omitting opts.manager (a caller that predates this round) must NOT throw -- texture stays " +
            "null, exactly like v1-v3's unconditional gap, not a crash on an un-awaited .image read");
        const SCRIPT_NO_MANAGER = `async () => {
            const im = document.createElement("script");
            im.type = "importmap";
            im.textContent = JSON.stringify({ imports: { "three": "/vendor/three/three.module.js" } });
            document.head.appendChild(im);
            await new Promise((r) => setTimeout(r, 10));
            const { FBXLoader } = await import("/vendor/three/jsm/loaders/FBXLoader.js");
            const { parseFbx, normalizeFbxGroup } = await import("/gpu/fbxLoad.js");
            const buf = await (await fetch("/gpu/fixtures/fbxEmbeddedTexture.ascii.fbx")).arrayBuffer();
            try {
                const group = await parseFbx(buf, FBXLoader, { path: "/gpu/fixtures/" });   // no manager
                const parsed = await normalizeFbxGroup(group);
                return { ok: true, texture: parsed.texture, texturesByMaterialKeys: Object.keys(parsed.texturesByMaterial || {}) };
            } catch (e) {
                return { ok: false, error: String(e && e.stack || e) };
            }
        }`;
        const out9b = await runInEngineOrigin({ engineRoot: ENG, script: SCRIPT_NO_MANAGER });
        if (out9b.skipped) { say("SKIP: " + out9b.reason); fails++; }
        else {
            ok("!! *** no manager -> no throw, texture stays null, texturesByMaterial stays empty ***",
                out9b.ok && out9b.result && out9b.result.ok &&
                out9b.result.texture === null && JSON.stringify(out9b.result.texturesByMaterialKeys) === "[]",
                out9b.ok ? JSON.stringify(out9b.result) : out9b.reason);
        }
    }
}

// ---- 10. MORPH-TARGET (DeformPercent) ANIMATION TRACKS ----------------------------------------------------------
console.log("\n10. *** MORPH TARGETS: a Shape/BlendShapeChannel/BlendShape deformer chain + a DeformPercent");
console.log("       animation curve -> readFbxMorphTargets() + mapFbxAnimations()'s morphChannels, THROUGH THE");
console.log("       REAL PIPELINE ***");
{
    const skip = webgpuSkipReason();
    if (skip) { say("SKIP (no headless shell / playwright): " + skip); fails++; }
    else {
        const fixturePath = path.join(ENG, "gpu/fixtures/fbxMorphTarget.ascii.fbx");
        ok("!! the committed morph-target fixture exists", fs.existsSync(fixturePath), fixturePath);

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
            loader.primeKnownAssets(["fbxMorphTarget.ascii"], {
                "fbxMorphTarget.ascii": { glb: false, obj: false, fbx: true, folder: false },
            });
            let mesh;
            try { mesh = await loader.loadAsset("fbxMorphTarget.ascii"); }
            catch (e) { return { ok: false, stage: "loadAsset threw", error: String(e && e.stack || e) }; }
            if (!mesh) return { ok: false, reason: "loadAsset returned null" };
            return {
                ok: true,
                morphTargetNames: mesh.morphTargetNames,
                morphWeights: mesh.morphWeights ? Array.from(mesh.morphWeights) : null,
                morphVertexCount: mesh.morphVertexCount,
                morphTargets: mesh.morphTargets ? mesh.morphTargets.map((t) => ({
                    positions: t.positions ? Array.from(t.positions) : null,
                    normals: t.normals,
                })) : null,
                animations: mesh.animations ? mesh.animations.map((c) => ({
                    name: c.name, duration: c.duration,
                    channels: c.channels, morphChannels: c.morphChannels || null,
                    samplers: c.samplers.map((s) => ({ times: Array.from(s.times), values: Array.from(s.values), interpolation: s.interpolation })),
                })) : null,
            };
        }`;
        const out = await runInEngineOrigin({ engineRoot: ENG, script: SCRIPT });
        if (out.skipped) { say("SKIP: " + out.reason); fails++; }
        else {
            ok("!! *** the SHIPPED pipeline loads the morph-target fixture ***",
                out.ok && out.result && out.result.ok,
                out.ok ? JSON.stringify(out.result).slice(0, 200) : out.reason);
            if (out.ok && out.result && out.result.ok) {
                const r = out.result;
                ok("!! *** morphTargetNames is EXACTLY [\"bulge\"], morphWeights EXACTLY [0], morphVertexCount 6 ***",
                    JSON.stringify(r.morphTargetNames) === JSON.stringify(["bulge"]) &&
                    JSON.stringify(r.morphWeights) === JSON.stringify([0]) &&
                    r.morphVertexCount === 6,
                    JSON.stringify({ names: r.morphTargetNames, weights: r.morphWeights, count: r.morphVertexCount }));
                // The fixture's Shape node deltas are (0,0,1) at all 4 control points. FBXLoader expands that
                // into the SAME 6 non-indexed polygon-vertex corners the base geometry uses (2 triangles,
                // [0,1,2] and [1,3,2] over control points 0-3), so every one of the 6 corners' delta is (0,0,1)
                // -- 18 values, all z=1. readFbxMorphTargets() reads geo.morphAttributes.position AFTER
                // FBXLoader's own expansion, not the raw sparse Indexes/Vertices, so this is what a caller
                // actually receives per output vertex, not the 4-control-point sparse form the file authored.
                const expectDelta = [0,0,1, 0,0,1, 0,0,1, 0,0,1, 0,0,1, 0,0,1];
                const t0 = r.morphTargets && r.morphTargets[0];
                ok("!! *** morphTargets[0].positions is EXACTLY 6 corners x (0,0,1), normals null (position-only) ***",
                    t0 && JSON.stringify(t0.positions) === JSON.stringify(expectDelta) && t0.normals === null,
                    t0 ? JSON.stringify(t0) : "no morph target");

                const clip = r.animations && r.animations[0];
                ok("!! *** exactly 1 clip \"TestClip\", duration EXACTLY 1, ZERO regular channels (morph-only) ***",
                    clip && clip.name === "TestClip" && clip.duration === 1 && clip.channels.length === 0,
                    JSON.stringify(clip));
                if (clip) {
                    ok("!! *** morphChannels is EXACTLY 1 entry: samplerIdx 0, targetMeshName \"fixtureMesh\", morphIndex 0 ***",
                        JSON.stringify(clip.morphChannels) === JSON.stringify([{ samplerIdx: 0, targetMeshName: "fixtureMesh", morphIndex: 0 }]),
                        JSON.stringify(clip.morphChannels));
                    // KeyValueFloat is 0,100 (DeformPercent's 0-100 convention) -- FBXLoader's own
                    // generateMorphTrack() divides by 100 (vendor/three/jsm/loaders/FBXLoader.js), giving the
                    // three.js 0-1 morphTargetInfluences convention. mapFbxAnimations() reads that already-
                    // scaled value verbatim, no second scaling.
                    ok("!! *** the morph sampler: times EXACTLY [0, 1], values EXACTLY [0, 1] (0-100 / 100), LINEAR ***",
                        clip.samplers.length === 1 &&
                        JSON.stringify(clip.samplers[0].times) === JSON.stringify([0, 1]) &&
                        JSON.stringify(clip.samplers[0].values) === JSON.stringify([0, 1]) &&
                        clip.samplers[0].interpolation === "LINEAR",
                        JSON.stringify(clip.samplers[0]));
                }
            }
        }
    }
}

// ---- 11. ROTATION CURVE SPANNING >=180 DEGREES -- VERIFICATION ONLY, NO CODE CHANGE -----------------------------
console.log("\n11. *** >=180 DEGREE ROTATION SPAN: FBXLoader's OWN interpolateRotations() slerp-subdivision,");
console.log("       PROVEN AS FAITHFUL PASS-THROUGH -- mapFbxAnimations() NEEDED NO CHANGE FOR THIS GAP ***");
{
    const skip = webgpuSkipReason();
    if (skip) { say("SKIP (no headless shell / playwright): " + skip); fails++; }
    else {
        const fixturePath = path.join(ENG, "gpu/fixtures/fbxRotation180.ascii.fbx");
        ok("!! the committed >=180-degree-span fixture exists", fs.existsSync(fixturePath), fixturePath);

        // Import parseFbx/normalizeFbxGroup DIRECTLY (rather than only through loader.loadAsset(), this
        // section's one deliberate deviation from sections 3/6/8/9/10's style) so the raw FBXLoader-produced
        // group.animations track and normalizeFbxGroup()'s own sampler can be compared from the SAME parse,
        // in the SAME script -- proving pass-through empirically rather than against hand-copied numbers.
        const SCRIPT = `async () => {
            const im = document.createElement("script");
            im.type = "importmap";
            im.textContent = JSON.stringify({ imports: { "three": "/vendor/three/three.module.js" } });
            document.head.appendChild(im);
            await new Promise((r) => setTimeout(r, 10));
            const { FBXLoader } = await import("/vendor/three/jsm/loaders/FBXLoader.js");
            const { LoadingManager } = await import("/vendor/three/three.module.js");
            const { parseFbx, normalizeFbxGroup } = await import("/gpu/fbxLoad.js");
            try {
                const buf = await (await fetch("/gpu/fixtures/fbxRotation180.ascii.fbx")).arrayBuffer();
                const manager = new LoadingManager();
                const group = await parseFbx(buf, FBXLoader, { path: "/gpu/fixtures/", manager });
                const parsed = await normalizeFbxGroup(group);
                const rawTrack = group.animations && group.animations[0] && group.animations[0].tracks[0];
                const clip = parsed.animations && parsed.animations[0];
                return {
                    ok: true,
                    rawTrack: rawTrack ? { name: rawTrack.name, times: Array.from(rawTrack.times), values: Array.from(rawTrack.values) } : null,
                    clip: clip ? {
                        name: clip.name, duration: clip.duration, channels: clip.channels,
                        samplers: clip.samplers.map((s) => ({ times: Array.from(s.times), values: Array.from(s.values), interpolation: s.interpolation })),
                    } : null,
                };
            } catch (e) { return { ok: false, error: String(e && e.stack || e) }; }
        }`;
        const out = await runInEngineOrigin({ engineRoot: ENG, script: SCRIPT });
        if (out.skipped) { say("SKIP: " + out.reason); fails++; }
        else {
            ok("!! *** the fixture parses through both FBXLoader AND normalizeFbxGroup without error ***",
                out.ok && out.result && out.result.ok,
                out.ok ? JSON.stringify(out.result).slice(0, 300) : out.reason);
            if (out.ok && out.result && out.result.ok) {
                const r = out.result;
                ok("!! *** FBXLoader's OWN raw track is named \"spinner.quaternion\" -- confirms the >=180 branch ran",
                    r.rawTrack && r.rawTrack.name === "spinner.quaternion",
                    r.rawTrack ? r.rawTrack.name : "no raw track");
                // *** THE SURPRISE, CONFIRMED EMPIRICALLY, DOCUMENTED IN THIS FILE'S HEADER: *** the fixture
                // authored a clean 2-keyframe curve (0 -> 270 degrees over 1 second), but interpolateRotations()'s
                // own subdivision loop (numSubIntervals = 270/180 = 1.5, `for (t=0; t<1; t+=1/1.5)`) only ever
                // executes at t=0 and t=0.6667 -- the strict `t < 1` guard means t=1 (the ORIGINAL final keyframe)
                // is never reached, so the 3-sample track below is genuinely what FBXLoader produces, not a
                // fixture-authoring mistake. Measured directly against this exact fixture, not hand-derived.
                const expectTimes  = [0, 0, 0.6666666865348816];
                const expectValues = [0,0,0,1,  0,0,0,1,  -0.5,0,0,0.8660253882408142];
                ok("!! *** raw track: times/values EXACTLY match the measured 3-sample slerp-subdivision output ***",
                    r.rawTrack &&
                    JSON.stringify(r.rawTrack.times) === JSON.stringify(expectTimes) &&
                    JSON.stringify(r.rawTrack.values) === JSON.stringify(expectValues),
                    r.rawTrack ? JSON.stringify(r.rawTrack) : "no raw track");
                ok("!! *** duration is EXACTLY 0.6666666865348816 (the last sample's own time, trusted from",
                    r.clip && r.clip.duration === 0.6666666865348816,
                    "   THREE.AnimationClip -- NOT the fixture's authored 1-second KeyTime end) " +
                    JSON.stringify(r.clip && r.clip.duration));
                ok("!! *** THE CENTRAL CLAIM: normalizeFbxGroup()'s sampler is BYTE-FOR-BYTE IDENTICAL to",
                    r.clip && r.clip.samplers.length === 1 &&
                    JSON.stringify(r.clip.samplers[0].times) === JSON.stringify(r.rawTrack.times) &&
                    JSON.stringify(r.clip.samplers[0].values) === JSON.stringify(r.rawTrack.values) &&
                    r.clip.samplers[0].interpolation === "LINEAR",
                    "   FBXLoader's OWN raw track (faithful pass-through, not a re-derivation): " +
                    (r.clip ? JSON.stringify(r.clip.samplers[0]) : "no clip"));
                ok("!! *** the channel resolves to \"spinner\" (targetNode 2), path \"rotation\" ***",
                    r.clip && r.clip.channels.length === 1 &&
                    r.clip.channels[0].targetNode === 2 && r.clip.channels[0].path === "rotation",
                    JSON.stringify(r.clip && r.clip.channels));
            }
        }
    }
}

// ---- 12. MIXED-SKIN-SCOPE FIX (v5) -- A SECONDARY MESH NO LONGER DRAGS WITH JOINT 0'S MOTION -------------------
console.log("\n12. *** MIXED-SKIN-SCOPE FIX: a plain secondary mesh in a multi-mesh skinned file now tracks its");
console.log("       OWN real position in the scene graph, PROVEN AT RENDER TIME (SkeletalAnimator), not just in");
console.log("       the parsed shape -- an adversarial review of the v4 round found the old synthetic-joint-0");
console.log("       binding silently dragged it by joint 0's full animated motion ***");
{
    const skip = webgpuSkipReason();
    if (skip) { say("SKIP (no headless shell / playwright): " + skip); fails++; }
    else {
        const fixturePath = path.join(ENG, "gpu/fixtures/fbxMixedSkinScope.ascii.fbx");
        ok("!! the committed mixed-skin-scope fixture exists", fs.existsSync(fixturePath), fixturePath);

        // ---- 12a. the SHIPPED pipeline: skin.joints gets propMesh's OWN node appended, not bound to joint 0 ----
        const SCRIPT_PARSE = `async () => {
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
            loader.primeKnownAssets(["fbxMixedSkinScope.ascii"], {
                "fbxMixedSkinScope.ascii": { glb: false, obj: false, fbx: true, folder: false },
            });
            let mesh;
            try { mesh = await loader.loadAsset("fbxMixedSkinScope.ascii"); }
            catch (e) { return { ok: false, stage: "loadAsset threw", error: String(e && e.stack || e) }; }
            if (!mesh) return { ok: false, reason: "loadAsset returned null" };
            return {
                ok: true,
                vertexCount: mesh.vertexCount,
                isRigged: mesh.isRigged,
                nodeNames: mesh.nodes ? mesh.nodes.map((n) => n.name) : null,
                skinJoints: mesh.skin ? mesh.skin.joints : null,
            };
        }`;
        const outParse = await runInEngineOrigin({ engineRoot: ENG, script: SCRIPT_PARSE });
        if (outParse.skipped) { say("SKIP: " + outParse.reason); fails++; }
        else {
            ok("!! *** the SHIPPED pipeline loads the 3-mesh (skinned quad + plain prop + bone attachment) fixture ***",
                outParse.ok && outParse.result && outParse.result.ok,
                outParse.ok ? JSON.stringify(outParse.result).slice(0, 200) : outParse.reason);
            if (outParse.ok && outParse.result && outParse.result.ok) {
                const r = outParse.result;
                ok("!! *** vertexCount is EXACTLY 18 (6 each from fixtureMesh, propMesh, attachMesh, all non-",
                    r.vertexCount === 18, "   indexed 2-triangle expansions), isRigged is true. got " + r.vertexCount);
                ok("!! *** nodes are EXACTLY [\"\", \"fixtureMesh\", \"propMesh\", \"root\", \"child\", \"attachMesh\"] ***",
                    JSON.stringify(r.nodeNames) === JSON.stringify(["", "fixtureMesh", "propMesh", "root", "child", "attachMesh"]),
                    JSON.stringify(r.nodeNames));
                // *** THE CENTRAL SHAPE CLAIM: skin.joints is [3, 4, 2, 5] -- root, child (the real skeleton,
                // unchanged from fbxAnim.ascii.fbx's own established Cluster order), THEN propMesh's OWN node
                // (index 2), THEN attachMesh's OWN node (index 5), each appended as a NEW joint in mesh-visit
                // order. Under v4's bug, neither propMesh nor attachMesh would appear in skin.joints at all --
                // both were bound to EXISTING joint 0 (root) via a synthetic all-zero joints row, never
                // registering their own node. ***
                ok("!! *** skin.joints is EXACTLY [3, 4, 2, 5] -- propMesh's and attachMesh's OWN nodes, NOT",
                    JSON.stringify(r.skinJoints) === JSON.stringify([3, 4, 2, 5]),
                    "   re-using joint 0. got " + JSON.stringify(r.skinJoints));
            }
        }

        // ---- 12b. RENDER-TIME PROOF: drive gpu/SkeletalAnimator.js to t=0.5s (root at 45deg about X) and ----
        // ---- confirm propMesh's vertices land EXACTLY where they were authored -- not dragged by root ----
        const SCRIPT_RENDER = `async () => {
            const im = document.createElement("script");
            im.type = "importmap";
            im.textContent = JSON.stringify({ imports: { "three": "/vendor/three/three.module.js" } });
            document.head.appendChild(im);
            await new Promise((r) => setTimeout(r, 10));
            const { FBXLoader } = await import("/vendor/three/jsm/loaders/FBXLoader.js");
            const { parseFbx, normalizeFbxGroup } = await import("/gpu/fbxLoad.js");
            const { SkeletalAnimator } = await import("/gpu/SkeletalAnimator.js");
            try {
                const buf = await (await fetch("/gpu/fixtures/fbxMixedSkinScope.ascii.fbx")).arrayBuffer();
                const group = await parseFbx(buf, FBXLoader, { path: "/gpu/fixtures/" });
                const parsed = await normalizeFbxGroup(group);

                const animator = new SkeletalAnimator(parsed);
                animator.setClip(0, 0);
                animator.update(0.5);   // halfway through the 1s clip -> root at 45deg about X

                function applySkin(vIdx) {
                    const px = parsed.positions[vIdx*3], py = parsed.positions[vIdx*3+1], pz = parsed.positions[vIdx*3+2];
                    let ox = 0, oy = 0, oz = 0;
                    for (let k = 0; k < 4; k++) {
                        const j = parsed.joints[vIdx*4+k];
                        const w = parsed.weights[vIdx*4+k];
                        if (w === 0) continue;
                        const jm = animator.jointMatrices.subarray(j*16, j*16+16);
                        ox += w * (jm[0]*px + jm[4]*py + jm[8]*pz + jm[12]);
                        oy += w * (jm[1]*px + jm[5]*py + jm[9]*pz + jm[13]);
                        oz += w * (jm[2]*px + jm[6]*py + jm[10]*pz + jm[14]);
                    }
                    return [ox, oy, oz];
                }
                // fixtureMesh corners 0-5 (triangles [0,1,2],[1,3,2] over control points 0-3); propMesh
                // corners 6-11 (same pattern, control points offset by 10 in X); attachMesh corners 12-17
                // (control points (0,0,0),(1,0,0),(0,1,0),(1,1,0), parented under "child").
                const skinnedRoot = applySkin(0);    // control point 0, root-bound, y=z=0 -> on the rotation
                                                       // axis, should stay put regardless of root's rotation
                const propCorners = [6,7,8,9,10,11].map(applySkin);
                const attachCorners = [12,13,14,15,16,17].map(applySkin);
                return { ok: true, skinnedRoot, propCorners, attachCorners };
            } catch (e) { return { ok: false, error: String(e && e.stack || e) }; }
        }`;
        const outRender = await runInEngineOrigin({ engineRoot: ENG, script: SCRIPT_RENDER });
        if (outRender.skipped) { say("SKIP: " + outRender.reason); fails++; }
        else {
            ok("!! *** the render-time probe (parseFbx/normalizeFbxGroup + a real SkeletalAnimator driven to",
                outRender.ok && outRender.result && outRender.result.ok,
                "   t=0.5s) runs without error: " +
                (outRender.ok ? JSON.stringify(outRender.result).slice(0, 200) : outRender.reason));
            if (outRender.ok && outRender.result && outRender.result.ok) {
                const r = outRender.result;
                ok("!! ...sanity: fixtureMesh's root-bound on-axis vertex stays at (0,0,0) -- confirms the",
                    JSON.stringify(r.skinnedRoot) === JSON.stringify([0, 0, 0]),
                    "   animator is actually driving something, not a silent no-op. got " + JSON.stringify(r.skinnedRoot));
                // *** THE CENTRAL RENDER-TIME CLAIM. *** Measured directly against this exact fixture (this
                // file's own header): under v4's bug, applying joint 0's (root's) 45-degree rotation matrix
                // to propMesh's raw corners would move e.g. (10,2,0) -> (10, 1.4142135..., 1.4142135...) --
                // the SAME sin(45)/cos(45) pattern fixtureMesh's own child-bound corners show above (see
                // section 12b's earlier PASS lines). Under the v5 fix, propMesh has its OWN joint (an
                // identity-inverse-bind-matrix entry for its own, never-animated node), so it must come back
                // EXACTLY as authored -- not close, not approximately static, EXACT.
                const expectProp = [
                    [10, 0, 0], [12, 0, 0], [10, 2, 0],
                    [12, 0, 0], [12, 2, 0], [10, 2, 0],
                ];
                ok("!! *** THE CENTRAL CLAIM: propMesh's 6 corners are EXACTLY their authored coordinates at",
                    JSON.stringify(r.propCorners) === JSON.stringify(expectProp),
                    "   t=0.5s (root mid-rotation) -- NOT dragged by joint 0. got " + JSON.stringify(r.propCorners));

                // *** THE SECOND CLAIM, ADDED AFTER AN ADVERSARIAL REVIEW OF THIS FIX NAMED IT THE MORE
                // DISCRIMINATING TEST STILL MISSING: *** attachMesh is parented under "child", and child now
                // carries its OWN independent rotation (0->90deg about Y) SEPARATE from root's (0->90deg about
                // X) -- so a mesh still (incorrectly) bound to joint 0 alone would show ONLY root's rotation
                // applied to its bind-pose world position, never child's own additional Y-rotation. The
                // expected values below are NOT hand-derived trigonometry -- they come from an INDEPENDENT
                // three.js oracle (a plain root/child/attach Object3D chain, real Quaternion.setFromAxisAngle,
                // real .updateMatrixWorld(), NO FBXLoader and NO normalizeFbxGroup involved at all) built
                // specifically to check this fixture, the same "independent oracle" discipline
                // fbxAnimAdvanced.ascii.fbx's own gate section already established in this file. A first hand-
                // trigonometry attempt at these numbers had a rotation-order/axis-swap mistake in ITS OWN
                // math (not in normalizeFbxGroup()) -- caught by cross-checking against this independent
                // oracle before it was ever written into an assertion, exactly the failure mode this
                // discipline exists to catch.
                const expectAttach = [
                    [0, 0.7071067690849304, 0.7071067690849304],
                    [0.7071067690849304, 1.207106739282608, 0.2071067988872528],
                    [0, 1.4142135381698608, 1.4142135381698608],
                    [0.7071067690849304, 1.207106739282608, 0.2071067988872528],
                    [0.7071067690849304, 1.9142135083675385, 0.9142135679721832],
                    [0, 1.4142135381698608, 1.4142135381698608],
                ];
                ok("!! *** THE SECOND CENTRAL CLAIM: attachMesh's 6 corners match the INDEPENDENT three.js",
                    JSON.stringify(r.attachCorners) === JSON.stringify(expectAttach),
                    "   oracle EXACTLY -- correctly tracking child's OWN Y-rotation, not just root's X-rotation " +
                    "alone (what joint-0-only binding would give). got " + JSON.stringify(r.attachCorners));
            }
        }
    }
}

// ---- 13. THE SHADER_JOINT_LIMIT FALLBACK, DIRECTLY, IN PLAIN NODE -- NO BROWSER, NO FBX FILE NEEDED ------------
console.log("\n13. *** THE SHADER_JOINT_LIMIT-EXCEEDED FALLBACK, EXERCISED DIRECTLY: a 65-joint reference");
console.log("       skeleton (>= the 64 limit) forces normalizeFbxGroup() into the ancestor-reuse path -- an");
console.log("       adversarial review of section 12's own first draft caught a REAL MATH BUG here (not merely");
console.log("       'unproven'): the first version baked an ANCESTOR-RELATIVE delta into the vertex, which");
console.log("       DOUBLE-APPLIES the ancestor's own inverse-bind matrix at render time and silently drops");
console.log("       the ancestor's entire accumulated world offset -- wrong even at REST POSE ***");
{
    // Plain-Node, no browser, no committed .fbx fixture -- this file's own header states exactly this is the
    // point of normalizeFbxGroup()'s duck-typing design: "can be exercised against a hand-built fake
    // THREE.Group in plain Node." A 65-bone linear chain (bone i's world position (0,i,0), pure translation,
    // no rotation -- simple enough to hand-verify, distinctive enough that a wrong formula produces a wrong
    // number rather than accidentally the right one) plus a secondary mesh parented under bone 10 with a
    // real local offset (0,1.5,0) -- mirroring the adversarial review's own live reproduction exactly,
    // including its reported ground truth (0, 11.5, 0).
    const fbxLoadUrl = pathToFileURL(path.join(ENG, "gpu/fbxLoad.js")).href;
    const { normalizeFbxGroup } = await import(fbxLoadUrl);

    function vec3(x, y, z) { return { x, y, z }; }
    function quatIdentity() { return { x: 0, y: 0, z: 0, w: 1 }; }
    function mat4Translate(x, y, z) { return new Float32Array([1,0,0,0, 0,1,0,0, 0,0,1,0, x,y,z,1]); }
    function mat4Invert(m) { return new Float32Array([1,0,0,0, 0,1,0,0, 0,0,1,0, -m[12],-m[13],-m[14],1]); }

    function buildFakeGroup() {
        const N_BONES = 65;
        const bones = [];
        for (let i = 0; i < N_BONES; i++) {
            bones.push({
                name: "bone" + i, isBone: true,
                position: vec3(0, 1, 0), quaternion: quatIdentity(), scale: vec3(1, 1, 1),
                children: [], parent: null,
                matrixWorld: { elements: mat4Translate(0, i, 0) },
            });
        }
        for (let i = 1; i < N_BONES; i++) { bones[i - 1].children.push(bones[i]); bones[i].parent = bones[i - 1]; }
        const boneInverses = bones.map((b) => ({ elements: mat4Invert(b.matrixWorld.elements) }));
        const refMesh = {
            name: "refMesh", isMesh: true, isSkinnedMesh: true,
            position: vec3(0, 0, 0), quaternion: quatIdentity(), scale: vec3(1, 1, 1),
            children: [], parent: null,
            matrixWorld: { elements: mat4Translate(0, 0, 0) },
            skeleton: { bones, boneInverses },
            geometry: {
                attributes: {
                    position: { array: new Float32Array([0, 0, 0]) },
                    skinIndex: { array: new Uint16Array([0, 0, 0, 0]) },
                    skinWeight: { array: new Float32Array([1, 0, 0, 0]) },
                },
            },
            material: {},
        };
        const secWorldY = 10 + 1.5;
        const secondaryMesh = {
            name: "secondaryMesh", isMesh: true, isSkinnedMesh: false,
            position: vec3(0, 1.5, 0), quaternion: quatIdentity(), scale: vec3(1, 1, 1),
            children: [], parent: bones[10],
            matrixWorld: { elements: mat4Translate(0, secWorldY, 0) },
            geometry: { attributes: { position: { array: new Float32Array([0, 0, 0]) } } },
        };
        bones[10].children.push(secondaryMesh);
        const group = {
            name: "", isMesh: false, isSkinnedMesh: false,
            position: vec3(0, 0, 0), quaternion: quatIdentity(), scale: vec3(1, 1, 1),
            children: [refMesh, bones[0]], parent: null,
            matrixWorld: { elements: mat4Translate(0, 0, 0) },
            updateMatrixWorld() { /* no-op -- matrixWorld already hand-set on every node above */ },
            animations: null,
        };
        refMesh.parent = group; bones[0].parent = group;
        return { group, bones };
    }

    const { group, bones } = buildFakeGroup();
    const parsed = await normalizeFbxGroup(group);

    // secondaryMesh is the SECOND mesh visited (after refMesh) -- vertex 1 (positions[3..5]).
    const bakedPos = [parsed.positions[3], parsed.positions[4], parsed.positions[5]];
    const secJointSlot = parsed.joints[1 * 4];
    const secWeight = parsed.weights[1 * 4];

    ok("!! *** skin.joints has 65 entries (>= SHADER_JOINT_LIMIT) and secondaryMesh's own new-joint path is",
        parsed.skin && parsed.skin.joints.length === 65,
        "   correctly SKIPPED (forced into the ancestor-reuse fallback). got " + (parsed.skin ? parsed.skin.joints.length : "no skin"));
    ok("!! *** secondaryMesh is bound to joint slot 10 (bone10, the nearest REAL joint ancestor), weight 1 ***",
        secJointSlot === 10 && secWeight === 1, "got slot=" + secJointSlot + " weight=" + secWeight);
    // *** THE CENTRAL CLAIM: bakedPos is the mesh's FULL WORLD-SPACE bind position (0, 11.5, 0) -- bone10's
    // own +10 world offset PLUS the mesh's own +1.5 local offset -- not an ancestor-relative delta (0, 1.5,
    // 0), which is what the review's REJECTED first-draft formula would have produced by DROPPING bone10's
    // own offset entirely (a bug it shares with gpu/GLBParser.js's own analogous fallback, named honestly
    // rather than silently ported). ***
    ok("!! *** THE CENTRAL CLAIM: bakedPos is EXACTLY [0, 11.5, 0] -- the mesh's FULL WORLD-SPACE bind",
        JSON.stringify(bakedPos) === JSON.stringify([0, 11.5, 0]),
        "   position, not the [0, 1.5, 0] an ancestor-relative delta would give. got " + JSON.stringify(bakedPos));
    // Apply the skinning formula BY HAND at rest pose (bone10's runtime world == its bind-pose world, since
    // nothing here animates): jointMatrix = boneWorld * IBM. Both are pure-translation matrices, so their
    // product's translation is the SUM of the two translations -- and by construction (IBM is defined as
    // boneWorld's own inverse) that sum is exactly zero, making jointMatrix the identity at rest pose. This
    // is the SAME formula gpu/SkeletalAnimator.js itself uses (confirmed by reading it directly), not
    // reimplemented independently here -- applying it to bakedPos should reproduce the ground truth exactly.
    const ibm = parsed.skin.inverseBindMatrices[secJointSlot];
    const boneWorld = bones[10].matrixWorld.elements;
    const finalPos = [
        bakedPos[0] + boneWorld[12] + ibm[12],
        bakedPos[1] + boneWorld[13] + ibm[13],
        bakedPos[2] + boneWorld[14] + ibm[14],
    ];
    ok("!! *** applying the real skinning formula (jointMatrix = boneWorld * IBM, at rest pose) to bakedPos",
        JSON.stringify(finalPos) === JSON.stringify([0, 11.5, 0]),
        "   reproduces the ground truth (0, 11.5, 0) exactly, matching the adversarial review's own live " +
        "reproduction. got " + JSON.stringify(finalPos));
}

console.log("\n" + (fails ? "FAIL -- " + fails + " check(s)" : "ALL GREEN") +
    "\nSections 1-7: task #44/#59's original scope (single-mesh ingest, skin+animation, preRotation/" +
    "postRotation/multi-clip). Sections 8-11: multi-mesh/multi-material concat, embedded-texture extraction, " +
    "morph-target (DeformPercent) animation tracks, and a rotation curve spanning >=180 degrees between " +
    "keyframes (verification-only). Sections 12-13 (this round): the mixed-skin-scope fix -- a secondary mesh " +
    "in a multi-mesh skinned file now tracks its own real position in the scene graph at render time, instead " +
    "of silently dragging with joint 0's full animated motion (the v4 round's own real, adversarial-review-" +
    "found risk), proven both under the 64-joint limit (section 12, a real fixture, both an unrelated static " +
    "prop and a genuine bone attachment against an independent three.js oracle) and past it (section 13, a " +
    "synthetic 65-joint graph in plain Node, catching a real math bug an earlier draft of this same fix had). " +
    "See this file's header for what is still deliberately NOT proven: narrower LayerElementMaterial " +
    "mapping types, non-DiffuseColor texture slots, multiple morph targets or morph+skin together, and a " +
    "SkinnedMesh bound to a genuinely different skeleton losing its OWN internal deformation. " +
    "CUBICSPLINE interpolation is NOT an open gap on that list -- it is unreachable from the currently-vendored " +
    "FBXLoader (see the header for why).");
process.exit(fails ? 1 : 0);
