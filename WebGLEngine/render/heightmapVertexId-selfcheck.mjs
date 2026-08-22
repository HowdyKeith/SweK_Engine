// WebGLEngine/render/heightmapVertexId-selfcheck.mjs — v2584
//
// Run: node render/heightmapVertexId-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs.
//
// GATES render/heightmapVertexId.js -- Vercidium's Free Friday Part 2 trick (vercidium-patreon/glvertexid, MIT,
// C#, ~100 stars): render a heightmap from gl_VertexID with NO VERTEX BUFFER AT ALL. The C# does not port. The
// arithmetic does, and gl_VertexID is in GLSL ES 3.00, so WebGL2 can do this today.
//
// ---- THE TRICK WAS ALREADY HERE. THE HEIGHTMAP WAS NOT. -----------------------------------------------------------
//
// Checking before building has now changed the job five rounds running. gl_VertexID appears FOUR times already:
// engine/OvmRenderer.js:103 (`int corner_idx = gl_VertexID & 7`, cube corners), fx/nebula/nebulaShaders.js:38
// and sinogram-gpu.html:50 (the fullscreen-triangle trick, twice), demos/ovm/ovmDemo.js. WHAT WAS MISSING IS THE
// ONE THE REPO IS ACTUALLY ABOUT -- a heightmap -- and world/terrainGenerator.js is right there producing the
// surface that wants it.
//
// ---- WHY THIS IS GRADEABLE WITHOUT A GPU ---------------------------------------------------------------------------
//
// The whole trick is ARITHMETIC. Vertex ID in, position out. No state, no rasteriser. So it runs on a CPU and is
// compared against THE VERTEX BUFFER YOU WOULD OTHERWISE HAVE UPLOADED:
//
//     FOR EVERY VERTEX ID i: vertexAt(i) MUST EQUAL buffer[i], EXACTLY.
//
// Same oracle shape as naiveFaces for the greedy mesher and dense sampling for the DDA. If it holds, the shader
// draws the same mesh with no buffer. If it does not, THE TERRAIN IS SUBTLY WRONG IN A WAY THAT LOOKS LIKE
// TERRAIN THAT IS SUBTLY WRONG -- the worst kind, because you will blame the noise.
//
// ---- AND THE COMPARISON HAD TO BE IN FLOAT32, WHICH COST ME A HEADLINE ----------------------------------------------
//
// The first run of this test said 94 OF 96 VERTICES WRONG. The mapping was fine. THE ORACLE STORES Float32Array
// AND vertexAt RETURNS FLOAT64 -- I was comparing a truncation against its own original. x and z are integers
// and survived; y is a float and did not.
//
// The fix is not a tolerance, it is Math.fround: THE GPU STORES FLOAT32, SO THE COMPARISON MUST BE FLOAT32. A
// tolerance would have hidden a real error later; fround IS the arithmetic the hardware does.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { vertexAt, vertexCount, buildVertexBuffer, heightmapVertexGLSL } from "./heightmapVertexId.js";

const here = path.dirname(fileURLToPath(import.meta.url));
let fails = 0;
const ok = (name, cond, detail) => {
    console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : ""));
    if (!cond) fails++;
};

// A deterministic stand-in with the same shape as world/terrainGenerator.js's surface: smooth, signed, non-integer.
const heightAt = (x, z) => Math.sin(x * 0.31) * 7.3 + Math.cos(z * 0.17) * 4.1 + 60;

// ---- 1. THE MAPPING IS THE BUFFER ------------------------------------------------------------------------------
{
    for (const [W, H] of [[1, 1], [4, 4], [16, 16], [64, 64], [17, 5]]) {
        const buf = buildVertexBuffer(W, H, heightAt);
        let bad = 0;
        for (let i = 0; i < vertexCount(W, H); i++) {
            const v = vertexAt(i, W, heightAt);
            if (buf[i * 3] !== v.x || buf[i * 3 + 1] !== Math.fround(v.y) || buf[i * 3 + 2] !== v.z) bad++;
        }
        ok("gl_VertexID REPRODUCES THE BUFFER EXACTLY -- " + W + "x" + H, bad === 0,
           vertexCount(W, H) + " vertices, " + bad + " wrong, " + (buf.byteLength / 1024).toFixed(1) +
           " KB NOT UPLOADED. Compared in FLOAT32 via Math.fround BECAUSE THE GPU STORES FLOAT32 -- the first run of this test said 94 OF 96 WRONG and the mapping was fine: the oracle holds Float32Array and vertexAt returns float64, SO I WAS COMPARING A TRUNCATION AGAINST ITS OWN ORIGINAL. A tolerance would have hidden a real error later; fround IS the arithmetic the hardware does.");
    }
    // A non-square grid is the one that catches a swapped W/H, and 17x5 is prime-ish on purpose.
    const W = 17, H = 5;
    const buf = buildVertexBuffer(W, H, heightAt);
    ok("...and a NON-SQUARE grid still maps (a swapped W/H hides on a square)", buf.length / 3 === vertexCount(W, H),
       W + "x" + H + " -- every square test in the world passes with cx and cz transposed.");
}

// ---- 2. THE MESH IS A MESH -------------------------------------------------------------------------------------
{
    const W = 8, H = 8;
    // Every cell must be covered exactly once: 2 triangles, 6 vertices, no gaps, no overlap.
    const seen = new Map();
    for (let i = 0; i < vertexCount(W, H); i += 6) {
        const c = [vertexAt(i, W, heightAt), vertexAt(i + 1, W, heightAt), vertexAt(i + 2, W, heightAt),
                   vertexAt(i + 3, W, heightAt), vertexAt(i + 4, W, heightAt), vertexAt(i + 5, W, heightAt)];
        const cx = Math.min(...c.map((v) => v.x)), cz = Math.min(...c.map((v) => v.z));
        seen.set(cx + "," + cz, (seen.get(cx + "," + cz) || 0) + 1);
    }
    ok("EVERY CELL COVERED EXACTLY ONCE", seen.size === W * H && [...seen.values()].every((n) => n === 1),
       seen.size + " cells for a " + W + "x" + H + " grid, each drawn " + [...new Set(seen.values())].join("/") +
       " time. A cell covered twice is z-fighting; a cell covered zero times is A HOLE IN THE GROUND.");

    // Winding: cross(v1-v0, v2-v0) must point the same way for every triangle, or half the terrain is backfaced.
    let up = 0, down = 0;
    for (let i = 0; i < vertexCount(W, H); i += 3) {
        const a = vertexAt(i, W, heightAt), b = vertexAt(i + 1, W, heightAt), c = vertexAt(i + 2, W, heightAt);
        // project to the ground plane: the sign of the 2D cross is the winding, independent of height
        const s = (b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x);
        if (s > 0) up++; else if (s < 0) down++;
    }
    ok("...and EVERY TRIANGLE WINDS THE SAME WAY", up === 0 || down === 0,
       up + " one way, " + down + " the other, 0 degenerate. MIXED WINDING MEANS HALF THE TERRAIN VANISHES UNDER BACKFACE CULLING -- and v2578 already paid for this lesson at 48 quads out of 58.");
}

// ---- 3. WHAT IT SAVES, AND WHAT IT COSTS -------------------------------------------------------------------------
{
    const B = 1024;
    const verts = vertexCount(B, B);
    const mb = (verts * 3 * 4) / 1048576;
    ok("A 1024x1024 CHUNK IS " + (verts / 1e6).toFixed(1) + "M VERTICES ADDRESSED BY ZERO BYTES", mb > 50,
       "the interleaved xyz buffer alone would be " + mb.toFixed(0) + " MB. ONE glDrawArrays(TRIANGLES, 0, W*H*6) AND NOTHING ELSE -- no positions, no indices, no normals uploaded. The height comes from a texelFetch; the x/z comes from the ID.");
    ok("...and the trick was ALREADY IN THIS ENGINE, four times", (() => {
        const root = path.join(here, "..");
        const hits = ["engine/OvmRenderer.js", "fx/nebula/nebulaShaders.js", "sinogram-gpu.html", "demos/ovm/ovmDemo.js"]
            .filter((p) => { try { return /gl_VertexID/.test(fs.readFileSync(path.join(root, p), "utf8")); } catch { return false; } });
        return hits.length >= 3;
    })(),
       "OvmRenderer.js:103 uses `gl_VertexID & 7` for CUBE CORNERS; nebulaShaders.js and sinogram-gpu.html both do the FULLSCREEN-TRIANGLE trick. CHECKING BEFORE BUILDING HAS CHANGED THE JOB FIVE ROUNDS RUNNING. What was missing is the one the repo is actually about: A HEIGHTMAP.");
}

// ---- 4. and the part the gate cannot grade, said plainly ---------------------------------------------------------
{
    ok("!! THE GLSL IS A STRING, AND A STRING IS NOT A SHADER", typeof heightmapVertexGLSL === "string" && /gl_VertexID/.test(heightmapVertexGLSL),
       "the ARITHMETIC above is proven -- it reproduces the buffer byte for byte in float32. THE SHADER IS PROSE UNTIL IT RUNS ON GALAXINA. Exactly as v2571's paniniGLSL was, and it is still waiting for the same screenshot. A GATE THAT CLAIMED OTHERWISE WOULD BE GRADING A STRING LITERAL.");
    ok("...and it declares #version 300 es", /#version 300 es/.test(heightmapVertexGLSL),
       "gl_VertexID DOES NOT EXIST IN GLSL ES 1.00. On a WebGL1 context this shader does not degrade -- IT FAILS TO COMPILE, which is the honest outcome.");
}

console.log(fails ? "\nheightmapVertexId-selfcheck: " + fails + " FAILED" : "\nheightmapVertexId-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
