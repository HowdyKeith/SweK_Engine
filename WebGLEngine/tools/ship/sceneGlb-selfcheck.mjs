// WebGLEngine/tools/ship/sceneGlb-selfcheck.mjs -- v4176
//
// GATES tools/export/sceneGlb.mjs, the exportSceneGlb half of world/worldGlbExport.js, the packGlb extraction
// in tools/export/voxelGlb.mjs, and the wiring at both ends (main.js's swekExport.scene, scene-view.html).
//
// A scene export has three ways to be wrong that all produce a FILE THAT LOADS:
//   - the geometry is right and the ORIENTATION is wrong, so it opens facing a wall (section 3);
//   - the instancing silently flattens, so four hundred trees become four hundred copies and the TV that was
//     the whole point of the exercise cannot open the file (section 2);
//   - the index width is wrong past 65535 vertices, so a large mesh is quietly scrambled (section 4).
// None of those throw. Each is checked here by reading the bytes back, not by trusting the writer.
//
// Run: node tools/ship/sceneGlb-selfcheck.mjs   (exit 0 all-pass, 1 on any fail)

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { writeSceneGlb, sceneStats, lookRotation, SCENE_EXTRAS_VERSION } from "../export/sceneGlb.mjs";
import { writeGlb, packGlb, MAGIC, JSON_CHUNK, BIN_CHUNK } from "../export/voxelGlb.mjs";
import { exportSceneGlb } from "../../world/worldGlbExport.js";
import { GLBParser } from "../../gpu/GLBParser.js";
import { codeOnly, noComments } from "./sourceScan.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error("  FAIL  " + m); } };
const read = (p) => { try { return fs.readFileSync(path.join(ENG, p), "utf8"); } catch { return ""; } };

/** Pull the glTF JSON back out of a .glb, the way any reader would. */
function jsonOf(glb) {
    const dv = new DataView(glb.buffer, glb.byteOffset, glb.byteLength);
    const jlen = dv.getUint32(12, true);
    return JSON.parse(new TextDecoder().decode(glb.subarray(20, 20 + jlen)).replace(/\s+$/, ""));
}
const ab = (u8) => u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength);
const quad = (name = "q") => ({ name, positions: new Float32Array([0,0,0, 1,0,0, 0,1,0, 1,0,0, 1,1,0, 0,1,0]),
                                normals: new Float32Array([0,0,1, 0,0,1, 0,0,1, 0,0,1, 0,0,1, 0,0,1]) });

// 1) THE CONTAINER IS THE SAME ONE, not a second spelling of it.
{
    const glb = writeSceneGlb({ meshes: [quad()] });
    const dv = new DataView(ab(glb));
    ok(dv.getUint32(0, true) === MAGIC, "the magic is glTF");
    ok(dv.getUint32(4, true) === 2, "version 2");
    ok(dv.getUint32(8, true) === glb.length, "the declared total length matches the actual byte count");
    ok(dv.getUint32(16, true) === JSON_CHUNK, "chunk 0 is JSON");
    const jlen = dv.getUint32(12, true);
    ok(jlen % 4 === 0, "the JSON chunk is 4-byte aligned");
    ok(dv.getUint32(20 + jlen + 4, true) === BIN_CHUNK, "chunk 1 is BIN");
    const j = jsonOf(glb);
    ok(j.bufferViews.every((v) => v.byteOffset % 4 === 0), "EVERY bufferView starts on a 4-byte boundary -- a parser reading a uint32 at an unaligned offset gets garbage");
    // and the packer is genuinely shared rather than copied
    const src = codeOnly(read("tools/export/sceneGlb.mjs"));
    ok(/import\s*\{[^}]*packGlb[^}]*\}\s*from/.test(src), "sceneGlb IMPORTS packGlb rather than re-implementing the header");
    ok(!/setUint32\(\s*0\s*,/.test(src), "and does not write the twelve-byte header itself -- two writers spelling one format is how a file opens in one viewer and not another");
    ok(typeof packGlb === "function", "packGlb is exported from voxelGlb for exactly that reason");
}

// 2) *** INSTANCING, WHICH IS THE WHOLE REASON THIS IS NOT writeGlb WITH MORE MESHES. *** Four hundred trees
//    must be one mesh and four hundred nodes, not four hundred copies of the same vertices.
{
    const nodes = [];
    for (let i = 0; i < 400; i++) nodes.push({ name: "tree" + i, mesh: 0, translation: [i % 20, 0, Math.floor(i / 20)] });
    const scene = { meshes: [quad("tree")], nodes };
    const st = sceneStats(scene);
    ok(st.meshes === 1 && st.nodes === 400, "400 placements of 1 mesh");
    ok(st.vertices === 6 && st.flatVertices === 2400, "6 vertices stored where a flattened export would store 2400");
    ok(st.instancingSaves === 99.8, `and the saving is reported (${st.instancingSaves}% fewer vertices than one copy per placement)`);

    const glb = writeSceneGlb(scene);
    const j = jsonOf(glb);
    ok(j.meshes.length === 1, "ONE mesh in the file");
    ok(j.nodes.length === 400, "400 nodes");
    ok(j.nodes.every((n) => n.mesh === 0), "every node references the same mesh");
    ok(glb.length < 30000, `and the file stays small (${glb.length} bytes for 400 trees) -- on a real scene this is the difference between a file the TV opens and one it does not`);

    // CONTROL: the flattened alternative really is that much bigger, so the claim is not free.
    const flat = writeGlb(Array.from({ length: 400 }, (_, i) => ({ name: "t" + i, positions: quad().positions })));
    ok(flat.length > glb.length * 5, `control: one copy per placement is ${flat.length} bytes against ${glb.length} -- ${(flat.length / glb.length).toFixed(1)}x`);
}

// 3) *** ORIENTATION. A wrong axis convention opens the scene facing a wall and nothing throws. ***
//    lookRotation's contract is checked by APPLYING the quaternion, not by eyeballing its components.
{
    const rotate = (q, v) => {              // v' = q v q*
        const [x, y, z, w] = q, [vx, vy, vz] = v;
        const ix = w * vx + y * vz - z * vy, iy = w * vy + z * vx - x * vz;
        const iz = w * vz + x * vy - y * vx, iw = -x * vx - y * vy - z * vz;
        return [ix * w + iw * -x + iy * -z - iz * -y,
                iy * w + iw * -y + iz * -x - ix * -z,
                iz * w + iw * -z + ix * -y - iy * -x];
    };
    const close = (a, b) => a.every((n, i) => Math.abs(n - b[i]) < 1e-6);
    const dirs = [[0,0,-1], [0,0,1], [1,0,0], [-1,0,0], [0.3,0.2,-0.9], [-0.5,-0.5,0.7], [0,-1,0], [0,1,0]];
    let recovered = 0;
    for (const d of dirs) {
        const len = Math.hypot(...d), unit = d.map((n) => n / len);
        const got = rotate(lookRotation(d), [0, 0, -1]);
        if (close(got.map((n) => Math.round(n * 1e6) / 1e6), unit.map((n) => Math.round(n * 1e6) / 1e6))) recovered++;
    }
    ok(recovered === dirs.length, `applying lookRotation to -Z recovers the forward vector for all ${dirs.length} directions (got ${recovered}) -- including straight up and straight down, where the up-vector cross product collapses`);
    ok(close(lookRotation([0, 0, -1]), [0, 0, 0, 1]), "a camera facing -Z is the IDENTITY rotation, which is glTF's own default and matches SweK's yaw=pitch=0");
    ok(close(lookRotation([0, 0, 0]), [0, 0, 0, 1]), "a degenerate forward returns identity rather than NaN");
    ok(close(lookRotation([NaN, 0, 0]), [0, 0, 0, 1]), "and so does a non-finite one -- a camera pointing nowhere should open facing the default, not make the file unloadable");
    ok(lookRotation([0, 1, 0]).every(Number.isFinite), "looking straight up produces finite numbers (the collapsed cross product is handled, not divided through)");

    // the camera actually lands in the file
    const glb = writeSceneGlb({ meshes: [quad()], camera: { position: [1, 2, 3], forward: [0, 0, -1], yfov: 0.8, znear: 0.2, zfar: 900 } });
    const j = jsonOf(glb);
    ok(j.cameras && j.cameras.length === 1 && j.cameras[0].type === "perspective", "a perspective camera is written");
    ok(j.cameras[0].perspective.yfov === 0.8 && j.cameras[0].perspective.zfar === 900, "with the caller's yfov and zfar, not defaults");
    const cn = j.nodes.find((n) => n.camera === 0);
    ok(cn && cn.translation.join(",") === "1,2,3", "and a node placing it where the person was standing");
    ok(j.scenes[0].nodes.includes(j.nodes.indexOf(cn)), "which is IN the scene -- a camera node left out of scenes[0] is invisible to every loader");
}

// 4) *** INDEX WIDTH. Past 65535 vertices a 16-bit index silently wraps, which scrambles a large mesh without
//    raising anything. Writing 32-bit always would instead inflate every small one. ***
{
    const small = { name: "s", positions: new Float32Array(300), indices: new Uint16Array([0, 1, 2]) };
    small.positions.set([0,0,0, 1,0,0, 0,1,0]);
    const js = jsonOf(writeSceneGlb({ meshes: [small] }));
    const ia = js.accessors[js.meshes[0].primitives[0].indices];
    ok(ia.componentType === 5123, "a small mesh gets UNSIGNED_SHORT indices (5123)");

    const N = 70000;                                  // past the 16-bit ceiling
    const big = { name: "b", positions: new Float32Array(N * 3), indices: new Uint32Array([0, 1, 2, 69999, 1, 2]) };
    for (let i = 0; i < N; i++) big.positions[i * 3] = i * 0.001;
    const jb = jsonOf(writeSceneGlb({ meshes: [big] }));
    const ib = jb.accessors[jb.meshes[0].primitives[0].indices];
    ok(ib.componentType === 5125, `a mesh past 65535 vertices gets UNSIGNED_INT indices (got ${ib.componentType})`);
    ok(jb.accessors[jb.meshes[0].primitives[0].attributes.POSITION].count === N, "and all 70000 vertices are declared");
    // CONTROL: 69999 does not survive a 16-bit index, which is what makes this a real check
    ok(new Uint16Array([69999])[0] !== 69999, `control: 69999 truncated to 16 bits is ${new Uint16Array([69999])[0]} -- silent, and every triangle after it points at the wrong vertex`);
}

// 5) ATTRIBUTES ARE DROPPED, NEVER TRUNCATED. A short attribute is wrong everywhere and looks plausible.
{
    const m = { name: "m", positions: quad().positions, normals: new Float32Array(9), colors: new Float32Array(18), uvs: new Float32Array(12) };
    const j = jsonOf(writeSceneGlb({ meshes: [m] }));
    const at = j.meshes[0].primitives[0].attributes;
    ok(at.POSITION !== undefined, "POSITION is written");
    ok(at.NORMAL === undefined, "a NORMAL array for 3 vertices on a 6-vertex mesh is DROPPED, not padded or truncated");
    ok(at.COLOR_0 !== undefined, "a correctly-sized COLOR_0 is kept");
    ok(at.TEXCOORD_0 !== undefined, "and a correctly-sized 2-component TEXCOORD_0 is kept as VEC2");
    ok(j.accessors[at.TEXCOORD_0].type === "VEC2", "with the right accessor type");
    ok(j.accessors[at.POSITION].min && j.accessors[at.POSITION].max,
        "POSITION carries min/max -- required by glTF 2.0 there and nowhere else, and a file without them loads as unframeable rather than as an error");
}

// 6) THE ENVIRONMENT RECIPE survives, versioned, and is absent rather than invented when not supplied.
{
    const env = { sunDir: [0.3, 0.8, 0.5], fogColor: [0.5, 0.6, 0.7], fogNear: 20, fogFar: 400, hour: 17.5, waterLevel: 9, weather: "storm" };
    const j = jsonOf(writeSceneGlb({ meshes: [quad()], environment: env }));
    const got = j.scenes[0].extras?.swek;
    ok(got && got.version === SCENE_EXTRAS_VERSION, "scene.extras.swek carries a version, so a later reader can tell what it is looking at");
    ok(got.environment.hour === 17.5 && got.environment.weather === "storm", "the hour and the weather survive");
    ok(got.environment.fogNear === 20 && got.environment.fogFar === 400, "and the fog distances the engine actually used -- a viewer inventing its own would look plausible and be wrong");
    ok(jsonOf(writeSceneGlb({ meshes: [quad()] })).scenes[0].extras === undefined,
        "a scene exported with no environment carries NO extras rather than a block of defaults that would be read as real");
    const partial = jsonOf(writeSceneGlb({ meshes: [quad()], environment: { hour: 3 } })).scenes[0].extras.swek.environment;
    ok(Object.keys(partial).join(",") === "hour", "and a partial environment writes only what was given -- absent is not claimed as zero");
    ok(jsonOf(writeSceneGlb({ meshes: [quad()], environment: { sunDir: [1, 2] } })).scenes[0].extras === undefined,
        "a malformed vector is refused rather than written short");
}

// 7) *** READ BACK BY THIS TREE'S OWN PARSER -- the check a hand-rolled writer owes. *** gpu/GLBParser.js walks
//    the scene graph, so this also proves the node transforms are real and not decoration.
{
    const scene = { meshes: [quad("t")], nodes: [{ name: "a", mesh: 0 }, { name: "b", mesh: 0, translation: [5, 0, 0] }] };
    const p = await GLBParser.parse(ab(writeSceneGlb(scene)), { postProcess: false });
    ok(p.positions.length / 3 === 12, `one 6-vertex mesh under two nodes reads back as 12 vertices (got ${p.positions.length / 3}) -- the instancing survived the round trip`);
    const xs = (from, to) => Array.from(p.positions.slice(from, to)).filter((_, i) => i % 3 === 0);
    ok(xs(0, 18).join(",") === "0,1,0,1,1,0", "the first instance is at the origin");
    ok(xs(18, 36).join(",") === "5,6,5,6,6,5", "and the second is offset by exactly 5 in x -- THE NODE TRANSFORM WAS APPLIED, not ignored");
    ok(p.nodes && p.nodes.length === 2, "and the parser reports both nodes");
}

// 8) REFUSALS. A scene that cannot be written says so instead of producing a file that opens to nothing.
{
    let threw = null;
    try { writeSceneGlb({ meshes: [] }); } catch (e) { threw = e; }
    ok(threw !== null, "an empty scene is refused -- a .glb that downloads and opens to nothing is indistinguishable from a broken exporter");
    threw = null;
    try { writeSceneGlb({ meshes: [quad()], nodes: [{ name: "x", mesh: 7 }] }); } catch (e) { threw = e; }
    ok(threw !== null && /does not exist/.test(threw.message), "a node referencing a mesh that is not there is refused BY NAME rather than written as a dangling index");
    const r = exportSceneGlb({ chunks: new Map(), chunkSize: 16 });
    ok(r.ok === false && /nothing to export/.test(r.error), "exportSceneGlb on an empty world returns a refusal with a reason, not a throw");
}

// 9) IDENTITY IS OMITTED. A file full of identity TRS is bigger and says nothing; glTF's default for an absent
//    field is exactly identity.
{
    const j = jsonOf(writeSceneGlb({ meshes: [quad()], nodes: [
        { name: "plain", mesh: 0, translation: [0, 0, 0], rotation: [0, 0, 0, 1], scale: [1, 1, 1] },
        { name: "moved", mesh: 0, translation: [0, 3, 0], scale: [2, 2, 2] }] }));
    ok(j.nodes[0].translation === undefined && j.nodes[0].rotation === undefined && j.nodes[0].scale === undefined,
        "an identity placement writes no TRS at all");
    ok(j.nodes[1].translation.join(",") === "0,3,0" && j.nodes[1].scale.join(",") === "2,2,2", "while a real one writes both");
    ok(j.nodes[1].rotation === undefined, "and omits only the component that was identity, not the whole set");
}

// 10) THE WIRING, at both ends. An exporter nothing calls and a viewer that ignores what it wrote are each
//     worth nothing, and both failures are silent.
{
    const wge = codeOnly(read("world/worldGlbExport.js"));
    ok(/export\s+function\s+exportSceneGlb/.test(wge), "world/worldGlbExport.js exports exportSceneGlb");
    ok(/writeSceneGlb/.test(wge) && /lookRotation/.test(wge), "and uses the scene writer and the orientation helper rather than re-deriving either");

    const mainCode = codeOnly(read("main.js"));
    ok(/exportSceneGlb/.test(mainCode), "main.js reaches exportSceneGlb");
    ok(/swekExport/.test(mainCode) && /async\s+scene\s*\(/.test(mainCode), "and exposes it as swekExport.scene()");
    // the forward vector must be derived, not left out -- a scene with no camera is the thing this adds
    ok(/forward:/.test(mainCode), "which passes a forward vector");
    ok(/Math\.sin\(camera\.yaw\)|sy\s*\*\s*cp/.test(mainCode), "derived from the camera's own yaw and pitch");

    const view = read("scene-view.html");
    const viewCode = noComments(view);           // the strings ARE the check here: extras keys are literals
    ok(viewCode.includes("extras"), "scene-view.html reads scene.extras");
    ok(viewCode.includes("swek"), "under the swek key the exporter writes");
    ok(/fogNear/.test(viewCode) && /fogFar/.test(viewCode),
        "and applies the engine's OWN fog distances rather than scaling a guess off the bounding box");
    ok(/gamepad/i.test(viewCode), "and handles a gamepad, because the device this is for is across a room and has no mouse");
    ok(/src/.test(viewCode) && /URLSearchParams/.test(viewCode), "and takes a ?src= URL, so the PC can hand the TV a link instead of the TV typing one with a remote");
}

console.log(`sceneGlb-selfcheck: ${pass} passed, ${fail} failed`);
console.log("unchecked here: the file opening on an actual Shield TV. The bytes are read back by this tree's own\n" +
            "parser and the node transforms are verified numerically, which is what settles headlessly; whether\n" +
            "Android TV's browser is happy with a 40 MB glb wants a person, a TV and a LAN.");
process.exit(fail ? 1 : 0);
