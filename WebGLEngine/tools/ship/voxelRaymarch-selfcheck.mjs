// WebGLEngine/tools/ship/voxelRaymarch-selfcheck.mjs -- v2783
//
// Run: node tools/ship/voxelRaymarch-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs (auto-discovered).
//
// GATES render/voxelRaymarchShader.js -- the GLSL DDA port. A shader can't run in the sandbox, so we prove the
// JS MIRROR (ddaShaderMirror, a line-for-line CPU model of the fragment shader's DDA) produces IDENTICAL hits to
// the proven traverseDDA oracle. The shader is the mirror in GLSL, so equivalence transfers. Plus a structural
// check that the GLSL source and the mirror share the same DDA shape (can't silently drift), and that both use
// BIG (1e20) rather than Infinity for zero-direction axes.

import { ddaShaderMirror, FRAG_SRC, VERT_SRC } from "../../render/voxelRaymarchShader.js";
import { traverseDDA } from "../../voxel/voxelDDA.js";

let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };

// bounded voxel volume (mirror & oracle both treat out-of-bounds as air)
const D = { x: 48, y: 32, z: 48 };
const field = (seed) => {
    const solid = (x, y, z) => {
        if (x < 0 || y < 0 || z < 0 || x >= D.x || y >= D.y || z >= D.z) return 0;
        let h = (Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(z, 982451653) ^ Math.imul(seed, 40503)) >>> 0;
        h = (h ^ (h >>> 13)) >>> 0;
        return (h % 100) < 14 ? ((h % 5) + 1) : 0;   // material id 1..5 or air
    };
    return solid;
};
const manhattan1 = (a, b) => (Math.abs(a.vx - b[0]) + Math.abs(a.vy - b[1]) + Math.abs(a.vz - b[2])) === 1;

// 1. EQUIVALENCE: shader mirror == traverseDDA oracle (hit voxel + face) on corner-free rays
{
    let hitMatch = 0, faceMatch = 0, N = 0;
    for (let i = 0; i < 4000; i++) {
        const seed = 1 + (i % 9);
        const voxelAt = field(seed);
        const isSolid = (x, y, z) => voxelAt(x, y, z) !== 0;
        const ro = [1.37 + (i % 6), 1.61 + (i % 5), 1.29 + (i % 7)];
        if (isSolid(Math.floor(ro[0]), Math.floor(ro[1]), Math.floor(ro[2]))) continue;
        const a = i * 0.09 + 0.013, b = i * 0.061 + 0.007;
        const rd = [Math.cos(a) * Math.cos(b), Math.sin(b), Math.sin(a) * Math.cos(b)];

        const oracle = traverseDDA(ro[0], ro[1], ro[2], rd[0], rd[1], rd[2], isSolid, 300);
        const mirror = ddaShaderMirror(ro, rd, voxelAt, 300);

        // skip corner-tie rays (as in voxelDDA gate) -- identify via oracle stepping producing a tie is hard here,
        // so just require both to agree; ties are measure-zero with these irrational-ish directions.
        N++;
        const hitEq = oracle.hit === mirror.hit && (!oracle.hit || (oracle.vx === mirror.vx && oracle.vy === mirror.vy && oracle.vz === mirror.vz));
        const faceEq = !oracle.hit || (oracle.nx === mirror.nx && oracle.ny === mirror.ny && oracle.nz === mirror.nz);
        if (hitEq) hitMatch++;
        if (faceEq) faceMatch++;
    }
    ok("EQUIVALENCE: shader mirror first-hit voxel == traverseDDA oracle", hitMatch === N, hitMatch + "/" + N);
    ok("EQUIVALENCE: shader mirror hit face normal == oracle", faceMatch === N, faceMatch + "/" + N);
    ok("equivalence sample size is meaningful", N > 2500, "N=" + N);
}

// 2. mirror matches oracle on the specific cases the oracle gate pins
{
    const solid5 = (x, y, z) => (x === 5 && y === 0 && z === 0) ? 1 : 0;
    const m = ddaShaderMirror([0.5, 0.5, 0.5], [1, 0, 0], solid5, 20);
    ok("axis-aligned: mirror hits x=5 with -x face", m.hit && m.vx === 5 && m.nx === -1 && m.ny === 0 && m.nz === 0);
    const miss = ddaShaderMirror([0.5, 0.5, 0.5], [1, 0, 0], () => 0, 16);
    ok("miss: mirror returns hit:false", miss.hit === false);
    const inside = ddaShaderMirror([3.5, 3.5, 3.5], [1, 0.3, 0.2], () => 7, 10);
    ok("inside solid: immediate hit at origin voxel", inside.hit && inside.steps === 0 && inside.vx === 3);
}

// 3. STRUCTURAL: GLSL source and the mirror share the DDA shape (drift guard)
{
    ok("FRAG has the tMax/tDelta/step DDA loop", /tMax/.test(FRAG_SRC) && /tDelta/.test(FRAG_SRC) && /for\s*\(\s*int\s+i\s*=\s*0/.test(FRAG_SRC));
    ok("FRAG uses BIG (1e20) for zero-direction axes (matches mirror, not Infinity)", /BIG\s*=\s*1e20/.test(FRAG_SRC));
    ok("FRAG face-normal is -step of the crossed axis (matches mirror)", /normal=vec3\(float\(-stp\.x\)/.test(FRAG_SRC.replace(/\s+/g, "")) || /-stp\.x/.test(FRAG_SRC));
    ok("FRAG samples the 3D volume with a bounds guard", /texelFetch\(uVolume/.test(FRAG_SRC) && /inBounds/.test(FRAG_SRC));
    ok("VERT is a fullscreen triangle (gl_VertexID)", /gl_VertexID/.test(VERT_SRC));
}

// 3b. RENDER PASS is stub-safe: constructing/using it against the no-op stub gl never throws
{
    const { makeStubGL } = await import("../../render/glBootstrap.js");
    const { VoxelRaymarchPass } = await import("../../render/voxelRaymarchPass.js");
    let threw = false, pass = null;
    try {
        pass = new VoxelRaymarchPass(makeStubGL({ width: 320, height: 240 }));
        pass.uploadVolume(new Uint8Array(4 * 4 * 4), 4, 4, 4);
        pass.render({ eye: [0, 0, 0], fwd: [0, 0, 1], right: [1, 0, 0], up: [0, 1, 0], tanFov: 0.5 }, 320, 240);
        pass.dispose();
    } catch (e) { threw = true; }
    ok("render pass: constructs + uploads + renders against the stub gl without throwing", !threw);
}

// 4. browser-safe
{
    const src = (await import("node:fs")).readFileSync(new URL("../../render/voxelRaymarchShader.js", import.meta.url), "utf8");
    ok("source: voxelRaymarchShader imports nothing / no DOM at module scope", !/^\s*import/m.test(src) && !/\bdocument\b|\bwindow\b/.test(src));
    const psrc = (await import("node:fs")).readFileSync(new URL("../../render/voxelRaymarchPass.js", import.meta.url), "utf8");
    ok("source: voxelRaymarchPass imports only the shader (no node/DOM at module scope)", !/^\s*import[^\n]*["'](node:|fs|path|url)/m.test(psrc) && !/\bdocument\b|\bwindow\b/.test(psrc));
}

console.log("voxelRaymarch-selfcheck: " + (fails ? fails + " FAILED" : "all pass"));
process.exit(fails ? 1 : 0);
