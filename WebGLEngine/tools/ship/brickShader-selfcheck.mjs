// WebGLEngine/tools/ship/brickShader-selfcheck.mjs -- v3061
//
// Run: node tools/ship/brickShader-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs (auto-discovered).
//
// GATES the GLSL brick skip -- FRAG_SRC_BRICK and the pass's second texture -- entirely without a GPU.
//
// That last part is the point. v3042 measured the CPU brick skip at 94.0% fewer solid queries and the GLSL port
// then sat unbuilt for eighteen versions, because "does the shader upload and bind a second 3D texture correctly"
// looked like a question only a GPU could answer. It is not. It is a question about COMMANDS, and v3058's
// recorder plus v3060's frame trace answer it here.
//
// WHAT IS AND IS NOT CLAIMED. The guard removes FETCHES, not steps: the DDA state machine is untouched, so the
// traversal is equivalent by construction, exactly as on the CPU. No speed claim is made -- the CPU number does
// not transfer to a GPU, and benchmarks.html on the rig is where a real one has to come from. Asserting a
// speedup nobody measured would be the thing this tree refuses.
//
// AND THE v3042 ASYMMETRY CARRIES OVER UNCHANGED: a brick wrongly marked occupied costs a fetch; a brick wrongly
// marked EMPTY makes the shader skip a solid voxel and a ray passes through a wall, silently. The shader cannot
// verify its own map. verifyBrickMap must run on the CPU first, and section 5 checks the code says so.

import { readFileSync } from "node:fs";
import { FRAG_SRC, FRAG_SRC_UI, FRAG_SRC_BRICK } from "../../render/voxelRaymarchShader.js";
import { VoxelRaymarchPass } from "../../render/voxelRaymarchPass.js";
import { traceFrame, diffTraces } from "../../render/frameTrace.js";
import { brickMapFromRLE, verifyBrickMap } from "../../voxel/rleBrickMap.js";
import { chunkToRLE, chunkIndexReal } from "../../voxel/rleWorldBridge.js";
import { codeOnly, prose } from "./sourceScan.mjs";

let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };
const say = (m) => console.log("  ----  " + m);
const CAM = { eye: [1, 2, 3], fwd: [0, 0, 1], right: [1, 0, 0], up: [0, 1, 0], tanFov: 0.6 };

// --- 1. THE SHADER: one guard, nothing else moved ------------------------------------------------------------
{
    const a = FRAG_SRC_UI.split("\n"), b = FRAG_SRC_BRICK.split("\n");
    // TWO lines, not three: the guard is spliced INLINE into voxel(), which is a one-liner. My first version
    // inserted a newline there and the "byte-identical DDA" check below caught the stray indentation it left --
    // a formatting difference, but one that would have made every future diff of these two shaders noisy.
    ok("!! the brick variant adds exactly 2 lines to the uint one -- two uniforms, and an INLINE guard",
        b.length - a.length === 2, a.length + " -> " + b.length);
    ok("...and the guard is the same shape as the CPU's traverseBricked: consult the brick, return air",
        /texelFetch\(uBricks, p >> uBrickShift, 0\)\.r == 0u\) return 0;/.test(FRAG_SRC_BRICK));
    ok("...it consults the brick BEFORE fetching the volume, or it would save nothing",
        FRAG_SRC_BRICK.indexOf("uBricks, p >> uBrickShift") < FRAG_SRC_BRICK.indexOf("texelFetch(uVolume, p, 0)"));
    ok("the brick sampler is an unfilterable integer texture, like the volume",
        /uniform highp usampler3D uBricks;/.test(FRAG_SRC_BRICK) && !/sampler3D uBricks/.test(FRAG_SRC_BRICK.replace("usampler3D uBricks", "")));
    ok("no sampler, no filtering anywhere: texelFetch only",
        !/\btexture\s*\(\s*u(Volume|Bricks)/.test(FRAG_SRC_BRICK) && (FRAG_SRC_BRICK.match(/texelFetch/g) || []).length === 2);
    ok("!! the two EARLIER variants are untouched", (() => {
        return /texelFetch\(uVolume, p, 0\)\.r \* 255\.0 \+ 0\.5/.test(FRAG_SRC) && /uniform sampler3D uVolume/.test(FRAG_SRC) &&
               !/uBricks/.test(FRAG_SRC) && !/uBricks/.test(FRAG_SRC_UI);
    })(), "three variants now, each a strict addition -- the default has not moved since v3040");
    ok("the DDA loop itself is byte-identical to the uint variant", (() => {
        const strip = (s) => s.replace(/[ \t]*uniform[^\n]*\n/g, "").replace(/if \(texelFetch\(uBricks[^;]*; /, "");
        return strip(FRAG_SRC_UI) === strip(FRAG_SRC_BRICK);
    })(), "equivalence by construction: the traversal was not rewritten, a guard was inserted");
}

// --- 2. THE COMMANDS, recorded with no GPU -------------------------------------------------------------------
{
    const t = traceFrame((gl) => {
        const p = new VoxelRaymarchPass(gl, { brick: true });
        p.uploadVolume(new Uint8Array(64 * 64 * 64), 64, 64, 64);
        p.uploadBrick(new Uint8Array(8 * 8 * 8), 8, 8, 8, 8);
        p.render(CAM, 64, 64);
    });
    const uploads = t.trace.filter((l) => l.startsWith("texImage3D"));
    say(uploads.join("\n        "));
    ok("!! TWO R8UI 3D textures are uploaded", uploads.length === 2 && uploads.every((l) => /R8UI/.test(l) && /RED_INTEGER/.test(l)));
    ok("...the second is the coarse one, 512x smaller", /8, 8, 8/.test(uploads[1]) && /Uint8Array\[512\]/.test(uploads[1]) && /Uint8Array\[262144\]/.test(uploads[0]));
    ok("!! the brick map is bound to unit 1 and the volume to unit 0",
        t.trace.includes("uniform1i(u:uVolume, 0)") && t.trace.includes("uniform1i(u:uBricks, 1)"));
    ok("...with the shift matching brick size 8", t.trace.includes("uniform1i(u:uBrickShift, 3)"));
    ok("!! the active texture unit is RESTORED to 0 after binding unit 1", (() => {
        const acts = t.trace.filter((l) => l.startsWith("activeTexture"));
        return acts.length >= 2 && acts[acts.length - 1] === "activeTexture(TEXTURE0)";
    })(), "leaving the caller on unit 1 would make the NEXT pass bind its volume to the brick sampler");
    ok("it still draws", t.trace.includes("drawArrays(TRIANGLES, 0, 3)"));
    ok("NEAREST on the brick texture too (a filtered occupancy sample is neither occupied nor empty)",
        t.trace.filter((l) => /texParameteri.*NEAREST/.test(l)).length === 4 && !t.trace.some((l) => /LINEAR/.test(l)),
        "two textures, two filters each");
}

// --- 3. THE FRAME TRACE says exactly how this differs from the un-bricked pass --------------------------------
{
    const mk = (opts) => traceFrame((gl) => {
        const p = new VoxelRaymarchPass(gl, opts);
        p.uploadVolume(new Uint8Array(16 * 16 * 16), 16, 16, 16);
        if (opts.brick) p.uploadBrick(new Uint8Array(2 * 2 * 2), 2, 2, 2, 8);
        p.render(CAM, 64, 64);
    });
    const uint = mk({ uint: true }), brick = mk({ brick: true });
    const d = diffTraces(uint.trace, brick.trace);
    ok("!! the traces diverge, and at the SHADER SOURCE -- the guard is visible before anything is uploaded",
        d.same === false && /shaderSource/.test(d.a));
    ok("...and the bricked frame issues exactly one more texture upload",
        brick.trace.filter((l) => l.startsWith("texImage3D")).length === uint.trace.filter((l) => l.startsWith("texImage3D")).length + 1);
    ok("...and the same single draw call", brick.trace.filter((l) => l.startsWith("drawArrays")).length === 1);
    ok("the bricked frame is deterministic like every other", mk({ brick: true }).fingerprint === brick.fingerprint);
}

// --- 4. REFUSALS -----------------------------------------------------------------------------------------------
{
    const t = traceFrame((gl) => {
        const p = new VoxelRaymarchPass(gl, { brick: true });
        globalThis.__r1 = p.uploadBrick(new Uint8Array(27), 3, 3, 3, 6);      // 6 is not a power of two
        const q = new VoxelRaymarchPass(gl, { uint: true });
        globalThis.__r2 = q.uploadBrick(new Uint8Array(8), 2, 2, 2, 8);       // not built with brick:true
        globalThis.__uintAuto = new VoxelRaymarchPass(gl, { brick: true }).uint;
    });
    void t;
    ok("!! a brick size that is not a power of two is REFUSED, not rounded",
        globalThis.__r1.ok === false && /not a power of two/.test(globalThis.__r1.reason) && /bit shift/.test(globalThis.__r1.reason));
    ok("uploading a brick map to a pass not built for it is refused by name",
        globalThis.__r2.ok === false && /not built with \{ brick: true \}/.test(globalThis.__r2.reason));
    ok("{ brick: true } implies uint, rather than pairing an R8 volume with an R8UI brick map", globalThis.__uintAuto === true);
}

// --- 5. THE ASYMMETRY, and the map that has to be verified before it is uploaded --------------------------------
{
    const src = readFileSync(new URL("../../render/voxelRaymarchPass.js", import.meta.url), "utf8");
    const shsrc = readFileSync(new URL("../../render/voxelRaymarchShader.js", import.meta.url), "utf8");
    ok("!! both files state that an EMPTY-but-occupied brick makes a ray pass through a wall",
        /passes through a wall/.test(src) && /passes through a wall/.test(shsrc));
    ok("...and that verifying the map is the CPU's job, which the shader cannot do",
        /verifyBrickMap/.test(src) && /cannot check it and does not pretend to/.test(prose(shsrc)));
    ok("no speed claim is made for the GPU path", (() => {
        const code = codeOnly(shsrc);
        return /NOT claimed here/.test(shsrc) && !/faster/i.test(code);
    })(), "the CPU's 94% does not transfer to a GPU; benchmarks.html on the rig is where a real number comes from");

    // and the map a caller would actually upload must pass its CPU verification first
    const S = 16, H = 64, DIMS = { sx: S, sy: H, sz: S };
    const v = new Uint8Array(S * H * S);
    for (let x = 0; x < S; x++) for (let z = 0; z < S; z++) for (let y = 0; y < 6 + (x % 5); y++) v[chunkIndexReal(x, y, z, DIMS)] = 6;
    const rle = chunkToRLE(v, DIMS, chunkIndexReal);
    const map = brickMapFromRLE(rle);
    ok("a real chunk's brick map is EXACT before upload, and its dims are what the shader will index",
        verifyBrickMap(map, rle).ok && map.brick === 8 && Math.log2(map.brick) === 3);
}

console.log("brickShader-selfcheck: " + (fails ? fails + " FAILED" : "all pass"));
process.exit(fails ? 1 : 0);
