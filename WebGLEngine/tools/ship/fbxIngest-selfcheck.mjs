// WebGLEngine/tools/ship/fbxIngest-selfcheck.mjs -- v1
//
// Run: node tools/ship/fbxIngest-selfcheck.mjs
//
// GATES gpu/fbxLoad.js, the .fbx branch gpu/gpuAssetLoader.js's _load()/_loadFBX() added, the
// _loadGLBFromBytes -> _uploadParsedMesh refactor that made the FBX and GLB paths share one GPU-upload
// implementation, and index.html's new "three" import map.
//
// *** TASK #44: FBX ASSETS WERE RECOGNIZED THROUGHOUT THE TREE AND NOTHING EVER LOADED ONE. *** Keith's call
// was three.js's own vendored FBXLoader (vendor/three/jsm/loaders/FBXLoader.js, vendored at r160 in commit
// b5fccadb, "round 1" of this work) run in-browser, NOT a native FBX2glTF conversion step. This gate covers
// round 2: gpu/fbxLoad.js (parseFbx / normalizeFbxGroup), the wiring in gpu/gpuAssetLoader.js, and the
// import map index.html needed to resolve FBXLoader.js's own bare `from "three"`.
//
// ================================================================================================
// WHAT THIS GATE DOES NOT PROVE -- READ THIS BEFORE TRUSTING A GREEN RUN, SAME STYLE AS
// gpu/fixtures/PROVENANCE.md AND gpu/GLBParser.js's OWN HEADER
// ================================================================================================
//
//   * NO ANIMATION-CLIP MAPPING. gpu/fbxLoad.js's normalizeFbxGroup() sets `animations: null`
//     unconditionally -- a deliberate, named v1 gap, not a silent omission. FBXLoader DOES attach
//     group.animations (THREE.AnimationClip[]) when the source file has them; mapping each clip's
//     `.tracks` into GLBParser's `{name, duration, samplers, channels}` shape is real follow-up work, not
//     attempted here. See gpu/fbxLoad.js's header for the full reasoning.
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
//   * THE SKINNED / RIGGED PATH WAS SPOT-CHECKED EXACTLY ONCE, INFORMALLY, AND THIS GATE DOES NOT REPEAT IT.
//     Section 3 below proves normalizeFbxGroup()'s skin/joint code against the committed hand-authored
//     fixture, which has NO skeleton (see the licensing note below for why the fixture is unrigged). The
//     skin-extraction branch (skeleton.bones, boneInverses, skinIndex/skinWeight -> GLBParser's skin/joints/
//     weights shape) was instead run, once, locally, against three.js's own examples/models/fbx/
//     "Samba Dancing.fbx" sample -- downloaded to an out-of-repo scratch directory, never staged, deleted
//     immediately after the check, and its measured numbers (52 joints, 103,440 vertices, 2 animation
//     clips, no NaNs) are recorded HERE as an informal one-time observation, not as a gate-verified or
//     repo-verified claim, and this gate does not re-run it, because doing so would require either
//     re-downloading that file into the toolchain on every gate run (a networked, licence-uncertain
//     dependency this gate refuses to carry) or committing it (which gpu/fixtures/PROVENANCE.md's own
//     licensing discipline refuses without a personally-verified licence -- Samba Dancing.fbx being a
//     Mixamo-class asset shipped alongside three.js's MIT-licensed example CODE, under terms that license
//     does not itself cover, and which was not chased down further once the informal check had already
//     answered "does the code crash on a real rigged file"). If a committed, rigged, license-clean fixture
//     is ever built (most likely: hand-authoring one, the same route this gate's own static-mesh fixture
//     took), this gap should close then.
//
// ================================================================================================
// THE FIXTURE, AND WHY IT IS HAND-WRITTEN RATHER THAN SOURCED
// ================================================================================================
//
// gpu/fixtures/fbxIngest.ascii.fbx is committed. It is not derived from anything -- see
// gpu/fixtures/PROVENANCE.md's own entry for it. gpu/fixtures/PROVENANCE.md already established this
// tree's rule for exactly this situation (its ABeautifulGame entries): a licence must be personally
// verified before a third-party asset is vendored, even trimmed, and Duck/BrainStem in the SAME sample
// repository as the CC-BY-4.0 ABeautifulGame model carry different, more restrictive licences -- so
// "everyone uses this for testing" is not a licence. The common FBX test fixtures the wider ecosystem
// reaches for (Mixamo exports, most game-asset-marketplace samples, three.js's own examples/models/fbx/
// Samba Dancing.fbx) could not be positively confirmed redistributable in the time this round had, so none
// of them is here. The fixture instead is plain ASCII FBX 7.4 text, written directly against
// vendor/three/jsm/loaders/FBXLoader.js's own TextParser/FBXTreeParser/GeometryParser source (confirmed by
// reading that source, not guessed) -- two triangles sharing an edge, the same quad shape
// tools/ship/dracoEncode-selfcheck.mjs's own QUAD fixture uses, with per-corner normals and UVs.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
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
    ok("!! the v1 scope gaps are documented in the file's own header, GLBParser.js-header style",
        /NO ANIMATION/.test(fbxLoadSrc) && /SINGLE MESH ONLY/.test(fbxLoadSrc));
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

console.log("\n" + (fails ? "FAIL -- " + fails + " check(s)" : "ALL GREEN") +
    "\nSee this file's own header for the full list of what is deliberately NOT proven here: no animation-clip " +
    "mapping, no multi-mesh/multi-material concat, no embedded-texture extraction, and the skin/joint " +
    "extraction code path's only verification against a real rigged file was one informal, uncommitted, " +
    "local spot-check this gate does not repeat.");
process.exit(fails ? 1 : 0);
