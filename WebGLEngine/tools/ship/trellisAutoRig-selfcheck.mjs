// WebGLEngine/tools/ship/trellisAutoRig-selfcheck.mjs -- v1 (task #38/#39)
//
// Run: node tools/ship/trellisAutoRig-selfcheck.mjs
//
// GATES the wiring added for task #38/#39: a Trellis-generated GLB (ai/ComfyUIClient.js's image-to-3D
// pipeline, landed through gpu/gpuAssetLoader.js's normal GLB path) carries geometry but no skin/joints/
// weights/animations, so gpu/GLBParser.js's parse() leaves them null and _uploadParsedMesh's isRigged comes
// out false. Three call sites in this tree used to just give up on that rather than attempting a rig -- this
// gate proves what each one now does about it, against a real headless-Chromium run, with exact measured
// numbers, not "it worked":
//
//   1. simulation/BotManager.js's _autoAttachRig -- used to read "unrigged mesh -- auto-attach skipped" and
//      return. Now, when the resolved KIND_TO_RIG/window.kaijuRigs template exists but the mesh is unrigged,
//      it calls rig/forceSkin.js's ForceSkin.apply(assetId, rig) to force-bind the mesh to THAT SAME
//      template BEFORE falling through to rig/RigSystem.js's attachEntityRig -- not gpu/autoSpineRig.js's
//      fitted-spine/dance approach, because the kaiju already has a canonical, named-bone pose that attack-
//      origin lookups elsewhere key off by bone name (KAIJU_ATTACKS.originBone), and an auto-fitted spine
//      has no relationship to those names. See BotManager.js's own comment on _autoAttachRig for the full
//      reasoning. Section 2 below proves this against a real rig template (rig/templates/kaijuBiped.js's
//      22-bone KAIJU_BIPED_RIG) and an independent K=4-nearest-bone oracle, not just "isRigged flipped true".
//
//   2. render/EntityMeshRenderer.js's mesh-swap listener -- used to read "Drop animators (a Trellis-generated
//      GLB is unrigged -- no animator survives the swap anyway)" and call this._animators.delete(name). BOTH
//      halves of that were wrong even before this task: _animators is keyed by entityId, not by asset name,
//      so delete(name) was a silent no-op that only looked harmless because a Trellis swap was ALWAYS
//      unrigged. Now that _autoAttachRig (site 1, above) can make a swapped-in mesh genuinely rigged, a
//      stale animator pointing at the disposed OLD mesh is a real hazard, not a moot cleanup -- so the fix is
//      to evict by mesh IDENTITY (renderer._animators entries whose .mesh === oldMesh), the same pattern
//      rig/forceSkin.js's own apply() already uses for its own cache invalidation. Section 3 below proves the
//      new eviction is precise: a stale entry pointing at the swapped-out mesh is gone, an unrelated entry
//      pointing at a DIFFERENT mesh survives, and the VAO/instance-buffer caches still invalidate as before.
//
//   3. render/fleets.mjs's glyphSkinMesh -- investigated and NOT wired: it is a genuine architectural
//      blocker, not a rig-shape judgment call. See fleets.mjs's own updated header comment on glyphSkinMesh
//      for the full account (hulls there never come from gpu/GLBParser.js or the Trellis pipeline at all,
//      and render/gpuDriven.mjs's WGSL/GLSL "look" shaders have no joint/weight attribute or uJointMatrices
//      uniform of any kind -- wiring a rig in would mean building a second, parallel GPU-skinning path, which
//      the task's own instructions rule out). Nothing to measure here; this gate does not attempt to.
//
// ================================================================================================
// WHAT THIS GATE DOES NOT PROVE -- READ THIS BEFORE TRUSTING A GREEN RUN, SAME STYLE AS
// gpu/fixtures/PROVENANCE.md AND gpu/GLBParser.js's OWN HEADER
// ================================================================================================
//
//   * VERTEX COLOR (COLOR_0) SURVIVAL IS NOT TESTED. Not because the auto-rig wiring drops it -- because
//     gpu/GLBParser.js's "static scene-graph walk" path (the one a single-mesh, no-skin GLB like a Trellis
//     asset or this gate's own fixture actually takes -- see GLBParser.js's own "Static scene-graph walk"
//     comment) never reads COLOR_0 into `parsed.colors` in the first place: that field is a pre-existing,
//     separate gap in this tree's GLB parser, confirmed by reading the code, not guessed, and well outside
//     this task's "wire up the existing auto-rig tooling" scope. What IS tested, exactly: TEXCOORD_0 (UV)
//     values survive byte-for-byte, and the embedded base-color PNG texture (hasTexture, and the same GL
//     texture object) survives untouched, across the force-skin merge.
//   * fleets.mjs's glyphSkinMesh (site 3) is a reported blocker, not a measured pass -- see above.
//   * render/fleets.mjs and BotManager's dungeon-bot spawn/pathfinding/combat machinery are NOT exercised --
//     this gate calls simulation/BotManager.js's real _autoAttachRig method directly (via
//     Object.create(BotManager.prototype)) rather than spinning up a full BotManager (ECS world, particles,
//     fpsShooter, pathfinderPool, kpop) that has nothing to do with the rig-wiring under test.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { runInEngineOrigin, webgpuSkipReason } from "./webgpuHarness.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const say = (m) => console.log("  ----  " + m);
console.log("trellisAutoRig-selfcheck -- task #38/#39: wire up this tree's OWN auto-rig tooling for Trellis-generated GLBs\n");

// ---- 0. THE SOURCE ACTUALLY CHANGED THE WAY THIS GATE'S HEADER CLAIMS -------------------------------------
console.log("0. THE THREE SITES' SOURCE CARRIES THE NEW CODE, NOT JUST THE OLD COMMENT");
{
    const botMgrSrc = fs.readFileSync(path.join(ENG, "simulation/BotManager.js"), "utf8");
    const emrSrc     = fs.readFileSync(path.join(ENG, "render/EntityMeshRenderer.js"), "utf8");
    const fleetsSrc  = fs.readFileSync(path.join(ENG, "render/fleets.mjs"), "utf8");

    ok("!! BotManager.js no longer bails unconditionally on an unrigged mesh in _autoAttachRig",
        !/if \(!mesh\?\.isRigged\) return;\s*\/\/ unrigged mesh — auto-attach skipped/.test(botMgrSrc));
    ok("!! ...and now imports rig/forceSkin.js's installForceSkinGlobal",
        /import \{ installForceSkinGlobal \} from "\.\.\/rig\/forceSkin\.js";/.test(botMgrSrc));
    ok("!! ...and calls forceSkin.apply(assetId, rig, ...) before falling through to attachEntityRig",
        /forceSkin\.apply\(assetId, rig, \{ renderer: window\.entityMeshRenderer, mesh \}\)/.test(botMgrSrc) &&
        botMgrSrc.indexOf("forceSkin.apply(assetId, rig") < botMgrSrc.indexOf("window.rigSystem.attachEntityRig(bot.id, rig, null, { mesh })"));

    ok("!! EntityMeshRenderer's swap listener no longer does this._animators.delete(name) (a no-op — see below)",
        !/this\._animators\.delete\(name\);/.test(emrSrc));
    ok("!! ...and now evicts by mesh identity, the same pattern rig/forceSkin.js's own apply() uses",
        /if \(a\?\.mesh === oldMesh\) this\._animators\.delete\(eid\);/.test(emrSrc));

    ok("!! fleets.mjs's glyphSkinMesh carries the investigated-blocker writeup, not a silent no-op",
        /Task #38\/#39 investigated wiring/.test(fleetsSrc) && /architecture mismatch/.test(fleetsSrc));
}

// ---- 1. THE FIXTURE: A HAND-AUTHORED, SELF-GENERATED GLB SHAPED EXACTLY LIKE A TRELLIS OUTPUT -------------
console.log("\n1. *** THE FIXTURE ROUND-TRIPS THROUGH THE REAL PIPELINE AS UNRIGGED, WITH UV + TEXTURE INTACT ***");
const skip = webgpuSkipReason();
if (skip) {
    say("SKIP (no headless shell / playwright): " + skip);
    fails += 6;
} else {
    const fixturePath = path.join(ENG, "gpu/fixtures/autoRigUnrigged.glb");
    ok("!! the committed fixture exists (self-authored — see this gate's own header, and gpu/fixtures/PROVENANCE.md)",
        fs.existsSync(fixturePath), fixturePath);

    // Independently derived (same formula the fixture generator used, reproduced here rather than imported,
    // so a bug in the generator and a bug in this gate's expectation would have to agree by coincidence to
    // both go unnoticed): a vertical 2-column "ladder", y = 0..26, x = -1..1, z = 0. 12 vertices, 6 rows.
    const ys = [0, 5, 10, 15, 20, 26];
    const expectPositions = [];
    const expectUVs = [];
    for (let row = 0; row < 6; row++) {
        const v = row / 5;
        expectPositions.push(-1, ys[row], 0, 1, ys[row], 0);
        expectUVs.push(0, v, 1, v);
    }
    const expectUVsF32 = Array.from(new Float32Array(expectUVs));
    const expectIndices = [];
    for (let r = 0; r < 5; r++) {
        const bl = 2 * r, br = 2 * r + 1, tl = 2 * r + 2, tr = 2 * r + 3;
        expectIndices.push(bl, br, tl, br, tr, tl);
    }

    const SCRIPT_A = `async () => {
        const canvas = document.createElement("canvas");
        const gl = canvas.getContext("webgl2");
        if (!gl) return { ok: false, reason: "no webgl2" };
        const { GPUAssetLoader } = await import("/gpu/gpuAssetLoader.js");
        const loader = new GPUAssetLoader(gl, { basePath: "/gpu/fixtures/" });
        loader.primeKnownAssets(["autoRigUnrigged"], { autoRigUnrigged: { glb: true, obj: false, fbx: false, folder: false } });
        let mesh;
        try { mesh = await loader.loadAsset("autoRigUnrigged"); }
        catch (e) { return { ok: false, stage: "loadAsset threw", error: String(e && e.message || e) }; }
        if (!mesh) return { ok: false, reason: "null mesh" };
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
            hasNormals: mesh.hasNormals, hasTexCoords: mesh.hasTexCoords, hasTexture: mesh.hasTexture,
            hasColors: mesh.hasColors, isRigged: mesh.isRigged,
            positions: Array.from(mesh.positions), indices: Array.from(mesh.indices),
            tboContents: readBuf(mesh.tbo, gl.ARRAY_BUFFER, Float32Array, mesh.vertexCount * 2),
        };
    }`;
    const outA = await runInEngineOrigin({ engineRoot: ENG, script: SCRIPT_A });
    if (outA.skipped) { say("SKIP: " + outA.reason); fails += 6; }
    else {
        ok("!! *** the shipped pipeline (GPUAssetLoader.loadAsset -> GLBParser -> _uploadParsedMesh) loads it ***",
            outA.ok && outA.result && outA.result.ok, outA.ok ? JSON.stringify(outA.result).slice(0, 200) : outA.reason);
        if (outA.ok && outA.result && outA.result.ok) {
            const r = outA.result;
            ok("!! *** vertexCount/indexCount are EXACTLY 12/30 ***",
                r.vertexCount === 12 && r.indexCount === 30, `got ${r.vertexCount}/${r.indexCount}`);
            ok("!! *** isRigged is false — this fixture carries NO skin/joints/weights/animations, exactly a Trellis GLB ***",
                r.isRigged === false);
            ok("!! positions match the authored ladder exactly",
                JSON.stringify(r.positions) === JSON.stringify(expectPositions), JSON.stringify(r.positions));
            ok("!! *** hasTexCoords is true and the UV buffer's REAL GPU contents match the authored UVs exactly ***",
                r.hasTexCoords === true && JSON.stringify(r.tboContents) === JSON.stringify(expectUVsF32),
                JSON.stringify(r.tboContents));
            ok("!! *** hasTexture is true — the embedded 2x2 PNG (tools/ship/pngWrite.mjs's encodePNG) decoded ***",
                r.hasTexture === true);
            ok("...hasColors is false — GLBParser's static-walk path never reads COLOR_0 (pre-existing, out of scope — see this gate's header)",
                r.hasColors === false);
        } else { fails += 5; }
    }

    // ---- 2. *** SITE: BotManager._autoAttachRig — FORCE-SKIN TO THE REAL KAIJU TEMPLATE, THEN RETARGET *** ----
    console.log("\n2. *** SITE 1 (BotManager._autoAttachRig): THE UNRIGGED FIXTURE GETS FORCE-SKINNED TO THE REAL");
    console.log("      22-BONE KAIJU_BIPED_RIG TEMPLATE, GRADED AGAINST AN INDEPENDENT K=4-NEAREST-BONE ORACLE ***");

    // Independent oracle: reproduces rig/RigSystem.js's MeshRigBinding.autoBind() (K=4 nearest bones,
    // inverse-distance weights 1/sqrt(d2+1e-6), normalized to sum 1) against the REAL KAIJU_BIPED_RIG bone
    // list, imported from the shipped file rather than retyped — a transcription error in a hand-copied bone
    // table would otherwise silently validate itself.
    // pathToFileURL, not the bare path: Node's ESM loader rejects a raw filesystem path on Windows with
    // ERR_UNSUPPORTED_ESM_URL_SCHEME (a drive letter reads as a scheme), and tools/ship/windowsImport-
    // selfcheck.mjs is the gate that says so. This was that gate's ONE genuine offender -- its other three
    // were its own failure text, quoted back at it out of a record.
    const { KAIJU_BIPED_RIG } = await import(pathToFileURL(path.join(ENG, "rig/templates/kaijuBiped.js")).href);
    function autoBindOracle(positions, bones) {
        const n = positions.length / 3, b = bones.length;
        const joints = new Array(n * 4).fill(0), weights = new Array(n * 4).fill(0);
        for (let i = 0; i < n; i++) {
            const vx = positions[i * 3], vy = positions[i * 3 + 1], vz = positions[i * 3 + 2];
            const top = [];
            for (let j = 0; j < b; j++) {
                const p = bones[j].position;
                const dx = vx - p[0], dy = vy - p[1], dz = vz - p[2];
                top.push([j, dx * dx + dy * dy + dz * dz]);
            }
            top.sort((a, c) => a[1] - c[1]);
            const top4 = top.slice(0, 4);
            const w = top4.map(([, d2]) => 1 / Math.sqrt(d2 + 1e-6));
            const tot = w.reduce((s, x) => s + x, 0);
            for (let k = 0; k < 4; k++) { joints[i * 4 + k] = top4[k][0]; weights[i * 4 + k] = w[k] / tot; }
        }
        return { joints, weights };
    }
    const oracle = autoBindOracle(expectPositions, KAIJU_BIPED_RIG.bones);
    // Sanity on the oracle itself, against the rig's own authored bone positions (rig/templates/kaijuBiped.js):
    // the y=0 row (vertex 0/1) sits right at "root" (y=0) and "foot_l"/"foot_r" (y=0.5) — nearer bones than
    // "pelvis" (y=14) or anything above it. The y=26 row (vertex 10/11) sits at "head" (y=26) exactly, and
    // "horn"/"chest"/"eye" are its next-nearest — nowhere near the legs. Named here so a broken oracle (not
    // just a broken shipped implementation) would be caught by a human reading this, not just by both sides
    // agreeing with each other.
    const rootIdx = KAIJU_BIPED_RIG.bones.findIndex(b => b.id === "root");
    const headIdx = KAIJU_BIPED_RIG.bones.findIndex(b => b.id === "head");
    ok("!! sanity: the oracle's own nearest bone for vertex 0 (y=0) is \"root\" or a foot bone, not something up near the head",
        [rootIdx, KAIJU_BIPED_RIG.bones.findIndex(b => b.id === "foot_l"), KAIJU_BIPED_RIG.bones.findIndex(b => b.id === "foot_r")].includes(oracle.joints[0]),
        `nearest bone index for vertex 0 = ${oracle.joints[0]} ("${KAIJU_BIPED_RIG.bones[oracle.joints[0]].id}")`);
    ok("!! sanity: the oracle's own nearest bone for vertex 10 (y=26) is \"head\" (exact bone position match)",
        oracle.joints[10 * 4] === headIdx, `nearest bone index for vertex 10 = ${oracle.joints[10 * 4]} ("${KAIJU_BIPED_RIG.bones[oracle.joints[10 * 4]].id}")`);

    const SCRIPT_B = `async () => {
        const canvas = document.createElement("canvas");
        const gl = canvas.getContext("webgl2");
        if (!gl) return { ok: false, reason: "no webgl2" };
        const { GPUAssetLoader } = await import("/gpu/gpuAssetLoader.js");
        const { EntityMeshRenderer } = await import("/render/EntityMeshRenderer.js");
        const { RigSystem } = await import("/rig/RigSystem.js");
        const { KAIJU_BIPED_RIG } = await import("/rig/templates/kaijuBiped.js");
        const { BotManager } = await import("/simulation/BotManager.js");

        const loader = new GPUAssetLoader(gl, { basePath: "/gpu/fixtures/" });
        loader.primeKnownAssets(["autoRigUnrigged"], { autoRigUnrigged: { glb: true, obj: false, fbx: false, folder: false } });
        const mesh = await loader.loadAsset("autoRigUnrigged");
        if (!mesh) return { ok: false, reason: "fixture failed to load" };
        const preIsRigged = mesh.isRigged;
        const preTexture = mesh.texture;
        const preTbo = mesh.tbo;
        const preTboContents = (() => {
            gl.bindBuffer(gl.ARRAY_BUFFER, mesh.tbo);
            const out = new Float32Array(mesh.vertexCount * 2);
            gl.getBufferSubData(gl.ARRAY_BUFFER, 0, out);
            return Array.from(out);
        })();

        const emr = new EntityMeshRenderer(gl, loader);
        window.entityMeshRenderer = emr;
        window.rigSystem = new RigSystem();
        window.kaijuRigs = { biped: KAIJU_BIPED_RIG };
        // Deliberately NOT pre-installing window.forceSkin — exercises _autoAttachRig's own
        // "window.forceSkin || installForceSkinGlobal()" fallback too.
        delete window.forceSkin;

        const assetId = "autoRigUnrigged";
        // loader.cache already holds the mesh under this name from loadAsset() above — _autoAttachRig's
        // lookup (assetVAOs, then loader.cache) finds it there since no VAO has been built yet (no render()
        // call happened).

        const bm = Object.create(BotManager.prototype);
        bm._counters = {};
        const bot = { id: "testBot1", spec: { kaijuOrigin: "hell", kind: assetId } };
        bm._autoAttachRig(bot);

        const readJointsWeights = () => {
            gl.bindBuffer(gl.ARRAY_BUFFER, mesh.jbo);
            const j = new Uint16Array(mesh.vertexCount * 4);
            gl.getBufferSubData(gl.ARRAY_BUFFER, 0, j);
            gl.bindBuffer(gl.ARRAY_BUFFER, mesh.wbo);
            const w = new Float32Array(mesh.vertexCount * 4);
            gl.getBufferSubData(gl.ARRAY_BUFFER, 0, w);
            return { joints: Array.from(j), weights: Array.from(w) };
        };

        const postTboContents = (() => {
            gl.bindBuffer(gl.ARRAY_BUFFER, mesh.tbo);
            const out = new Float32Array(mesh.vertexCount * 2);
            gl.getBufferSubData(gl.ARRAY_BUFFER, 0, out);
            return Array.from(out);
        })();

        const bridge = window.rigSystem._entityBridges && window.rigSystem._entityBridges.get(bot.id);

        return {
            ok: true,
            preIsRigged, postIsRigged: mesh.isRigged,
            counters: bm._counters,
            skinJointCount: mesh.skin ? mesh.skin.joints.length : null,
            jointsComponentType: mesh.jointsComponentType === gl.UNSIGNED_SHORT ? "UNSIGNED_SHORT" : String(mesh.jointsComponentType),
            hasJbo: !!mesh.jbo, hasWbo: !!mesh.wbo,
            ...readJointsWeights(),
            bridgeOk: !!bridge, bridgeIsSameRig: bridge ? bridge.rig === KAIJU_BIPED_RIG : false,
            bridgeIsSameMesh: bridge ? bridge.mesh === mesh : false,
            textureUnchanged: mesh.texture === preTexture,
            tboBufferUnchanged: mesh.tbo === preTbo,
            tboContentsUnchanged: JSON.stringify(preTboContents) === JSON.stringify(postTboContents),
            hasTextureAfter: mesh.hasTexture,
            vertexCountAfter: mesh.vertexCount,
        };
    }`;
    const outB = await runInEngineOrigin({ engineRoot: ENG, script: SCRIPT_B });
    if (outB.skipped) { say("SKIP: " + outB.reason); fails += 10; }
    else {
        ok("!! *** the real pipeline runs end to end (loadAsset -> _autoAttachRig -> forceSkin.apply -> attachEntityRig) ***",
            outB.ok && outB.result && outB.result.ok, outB.ok ? JSON.stringify(outB.result).slice(0, 300) : outB.reason);
        if (outB.ok && outB.result && outB.result.ok) {
            const r = outB.result;
            ok("!! *** isRigged flips false -> true, in place, on the SAME mesh object ***",
                r.preIsRigged === false && r.postIsRigged === true);
            ok("!! *** _counters record exactly one force-skin AND one auto-attach ***",
                r.counters.rigForceSkinned === 1 && r.counters.rigAutoAttached === 1, JSON.stringify(r.counters));
            ok("!! *** mesh.skin.joints.length is EXACTLY 22 — the real KAIJU_BIPED_RIG's own bone count, not a made-up number ***",
                r.skinJointCount === 22, "got " + r.skinJointCount);
            ok("!! jointsComponentType is UNSIGNED_SHORT (ForceSkin's own choice — see rig/forceSkin.js apply())",
                r.jointsComponentType === "UNSIGNED_SHORT");
            ok("!! real jbo/wbo GL buffers exist", r.hasJbo && r.hasWbo);
            ok("!! *** joints/weights match the independent K=4-nearest-bone oracle EXACTLY, all 12 vertices, all 4 slots ***",
                JSON.stringify(r.joints) === JSON.stringify(oracle.joints) &&
                JSON.stringify(r.weights.map(x => Math.fround(x))) === JSON.stringify(oracle.weights.map(x => Math.fround(x))),
                "joints " + (JSON.stringify(r.joints) === JSON.stringify(oracle.joints) ? "match" : "MISMATCH: got " + JSON.stringify(r.joints) + " want " + JSON.stringify(oracle.joints)));
            ok("!! *** attachEntityRig's MeshRigBridge is installed for the bot, referencing the SAME rig template AND the SAME mesh ***",
                r.bridgeOk && r.bridgeIsSameRig && r.bridgeIsSameMesh);
            ok("!! *** the texture is UNTOUCHED — same GL texture object, hasTexture still true ***",
                r.textureUnchanged && r.hasTextureAfter === true);
            ok("!! *** the UV buffer is UNTOUCHED — same GL buffer object AND byte-identical contents after the merge ***",
                r.tboBufferUnchanged && r.tboContentsUnchanged);
            ok("!! vertexCount is unchanged (12) — buildSpineRigGeometry-style remeshing was correctly NOT used here (ForceSkin never touches positions)",
                r.vertexCountAfter === 12);
        } else { fails += 9; }
    }

    // ---- 3. *** SITE: EntityMeshRenderer's swap listener — PRECISE, MESH-IDENTITY-KEYED EVICTION *** ----
    console.log("\n3. *** SITE 2 (EntityMeshRenderer swap listener): ANIMATOR EVICTION BY MESH IDENTITY, NOT BY NAME ***");
    const SCRIPT_C = `async () => {
        const canvas = document.createElement("canvas");
        const gl = canvas.getContext("webgl2");
        if (!gl) return { ok: false, reason: "no webgl2" };
        const { GPUAssetLoader } = await import("/gpu/gpuAssetLoader.js");
        const { EntityMeshRenderer } = await import("/render/EntityMeshRenderer.js");

        const loader = new GPUAssetLoader(gl, { basePath: "/gpu/fixtures/" });
        const emr = new EntityMeshRenderer(gl, loader);

        const oldMesh = { marker: "old" };
        const keepMesh = { marker: "keep" };
        const newMesh = { marker: "new" };
        loader.cache.set("fakeAsset", oldMesh);

        emr._animators.set("staleEntity", { mesh: oldMesh });
        emr._animators.set("keepEntity", { mesh: keepMesh });
        emr.assetVAOs.set("fakeAsset", { mesh: oldMesh, vao: null, instanceBuf: null });
        emr._instanceBuffers.set("fakeAsset", new Float32Array(4));

        const sanityNameNeverAKey = !emr._animators.has("fakeAsset");

        loader.cache.set("fakeAsset", newMesh);
        loader.notifyMeshSwap("fakeAsset", oldMesh, newMesh);

        return {
            ok: true,
            sanityNameNeverAKey,
            staleEvicted: !emr._animators.has("staleEntity"),
            keepSurvived: emr._animators.has("keepEntity") && emr._animators.get("keepEntity").mesh === keepMesh,
            vaoEvicted: !emr.assetVAOs.has("fakeAsset"),
            instanceBufEvicted: !emr._instanceBuffers.has("fakeAsset"),
        };
    }`;
    const outC = await runInEngineOrigin({ engineRoot: ENG, script: SCRIPT_C });
    if (outC.skipped) { say("SKIP: " + outC.reason); fails += 5; }
    else {
        ok("!! *** the real EntityMeshRenderer + GPUAssetLoader.notifyMeshSwap round-trips ***",
            outC.ok && outC.result && outC.result.ok, outC.ok ? JSON.stringify(outC.result) : outC.reason);
        if (outC.ok && outC.result && outC.result.ok) {
            const r = outC.result;
            ok("!! sanity: \"fakeAsset\" (the swap NAME) was never a key in _animators (keyed by entityId) — exactly why the old delete(name) was inert",
                r.sanityNameNeverAKey);
            ok("!! *** the STALE animator (pointing at the disposed oldMesh) is evicted ***", r.staleEvicted);
            ok("!! *** an UNRELATED animator (pointing at a different, still-live mesh) SURVIVES — this is not a blanket clear ***",
                r.keepSurvived);
            ok("!! the VAO cache still invalidates on swap, same as before this task's change",
                r.vaoEvicted);
            ok("!! the per-asset instance-buffer cache still invalidates on swap, same as before",
                r.instanceBufEvicted);
        } else { fails += 4; }
    }
}

console.log("\n" + (fails ? "FAIL -- " + fails + " check(s)" : "ALL GREEN") +
    "\nSee this file's own header for what is deliberately NOT proven: COLOR_0/vertex-color survival (a pre-" +
    "existing GLBParser gap unrelated to this task), and site 3 (render/fleets.mjs's glyphSkinMesh), reported " +
    "as an architectural blocker rather than forced — see fleets.mjs's own updated comment for the full account.");
process.exit(fails ? 1 : 0);
