// WebGLEngine/mesh/greedyMesh-selfcheck.mjs — v2572
//
// Run: node mesh/greedyMesh-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs.
//
// THIS ENGINE HAS TWO GREEDY MESHERS. ONE OF THEM HAS NEVER RUN.
//
// Reviewing Vercidium's repos is what made me look: vercidium-patreon/meshing is "Part 1 of Vercidium's Free
// Friday series", MIT, C#, a greedy mesher for voxel models. Before porting anyone else's, check what is here.
//
//     mesh/greedyMesher.js    "v1 - BASIC 2.5D GREEDY VOXEL MESHER"        buildGreedyMesh(chunk, size, height)
//     voxel/greedyMesh.js     "v2 - SAFE BOUNDS + DEBUG HARDENING"          greedyMesh(chunk)
//
// The version numbers say v2 supersedes v1. THE MEASUREMENTS SAY THE OPPOSITE.
//
// ---- v1 IS A REAL GREEDY MESHER -------------------------------------------------------------------------------
//
// Hand it a flat 16x16 slab -- the easiest case the algorithm has -- and it returns ONE quad:
// {x:0, y:0, z:0, w:16, h:16, normal:{0,1,0}}. It merged 256 voxel faces into one. THAT IS THE ENTIRE POINT OF
// GREEDY MESHING and it does it correctly. Its honest limit is written in its own comment: "top-face
// simplification" -- it is 2.5D, top faces only, and it says so.
//
// ---- v2 IS NOT A GREEDY MESHER, AND HAS NEVER RUN --------------------------------------------------------------
//
// 1. IT DOES NOT MERGE. v1 emits {x, y, z, w, h, normal}. v2 emits `quads.push([x, y, z])` -- NO w, NO h, NO
//    normal. One entry per visible voxel IS A NAIVE MESHER. Its own comment admits it: "very simplified face
//    emission (debug-safe)". IT IS A NAIVE MESHER WEARING A GREEDY NAME. A NAME IS A CLAIM.
//
// 2. IT CALLS A METHOD THAT DOES NOT EXIST. v2's get() calls chunk.getIndex(x, y, z). THE ONLY getIndex() IN THIS
//    ENTIRE TREE IS THREE.js's BufferGeometry.getIndex(), in vendor/. NO CHUNK ANYWHERE DEFINES getIndex.
//
// 3. ITS CALLER HANDS IT THE WRONG OBJECT. world/VoxelWorld.js:18 calls `greedyMesh({ blocks })`. v2 reads
//    chunk.size, chunk.height, and chunk.getIndex. `{ blocks }` HAS NONE OF THE THREE.
//
// So: a "v2" that supersedes a working "v1", that cannot merge, that calls a method nobody defines, that is
// handed an object with none of the fields it reads -- AND TWO FILES IMPORT IT (world/VoxelWorld.js,
// voxel/VoxelMesh.js) while mesh/chunkMeshBuilder.js still imports v1.
//
// THE VERSION NUMBER IS THE ONLY EVIDENCE THAT v2 IS NEWER, AND A VERSION NUMBER IS PROSE. Someone wrote a
// debug-hardening pass, kept the name, and the tree grew two code paths that disagree about which mesher exists.
// IF I MOVED A FILE, I MOVED ITS ASSUMPTIONS AND IT DOESN'T KNOW.
//
// THIS FILE DOES NOT DELETE v2. Deleting a file two modules import, in a tree whose voxel front door I cannot
// boot here, is how you break a working thing to tidy a broken one. IT PINS THE FACTS SO THE NEXT PERSON -- OR
// THE NEXT ME -- CANNOT MISTAKE THE VERSION NUMBER FOR EVIDENCE.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildGreedyMesh } from "./greedyMesher.js";
import { greedyMesh } from "../voxel/greedyMesh.js";

const here = path.dirname(fileURLToPath(import.meta.url));
let fails = 0;
const ok = (name, cond, detail) => {
    console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : ""));
    if (!cond) fails++;
};

const S = 16, H = 8;
const slab = () => {
    const voxels = new Uint8Array(S * S * H);
    for (let x = 0; x < S; x++) for (let z = 0; z < S; z++) voxels[x + z * S] = 1;
    return { voxels, size: S, height: H };
};

// ---- 1. v1 ACTUALLY MERGES -------------------------------------------------------------------------------------
{
    const q = buildGreedyMesh(slab(), S, H);
    const quads = Array.isArray(q) ? q : q.quads;
    ok("v1 buildGreedyMesh MERGES a flat 16x16 slab into ONE quad", quads.length === 1,
       quads.length + " quad(s) from 256 voxel faces. THAT IS THE ENTIRE POINT OF GREEDY MESHING, and v1 does it.");
    const f = quads[0];
    ok("...and the quad is the whole slab", f.w === 16 && f.h === 16,
       JSON.stringify(f) + " -- w=16, h=16. Not 256 unit quads with a greedy name on the function.");
    const src = fs.readFileSync(path.join(here, "greedyMesher.js"), "utf8");
    ok("...and v1 states its own limit instead of hiding it", /top-face simplific/.test(src),
       "'top-face simplification' -- it is 2.5D, top faces only, AND IT SAYS SO. An honest limit in a comment is worth more than a general-sounding function that quietly does less.");
}

// ---- 2. v2 CANNOT RUN ------------------------------------------------------------------------------------------
{
    // v2575 -- THIS CHECK USED TO ASSERT THE OPPOSITE, AND ITS FLIP IS THE VERSION.
    // v2572/v2573 asserted "v2 THROWS on the simplest possible chunk" and it did, for every version it existed:
    // it called chunk.getIndex(x,y,z), and the ONLY getIndex() in this tree is THREE.js's, in vendor/.
    // v2575 rewrote it as a DELEGATE to mesh/greedyMesh3d.js -- same export, same path, callers untouched.
    const r = greedyMesh(slab());
    ok("v3 greedyMesh now MESHES the chunk it used to throw on", r.quads.length === 6,
       r.quads.length + " quads from a flat 16x16 slab (was: 'chunk.getIndex is not a function'). NOT DELETED -- REWRITTEN. Two modules import this path, and DELETING A FILE TWO MODULES IMPORT, TO TIDY A BROKEN THING, IS HOW YOU BREAK A WORKING THING. MAKING THE BROKEN THING CORRECT IS STRICTLY SAFER THAN REMOVING IT.");
    const blocks = [];
    for (let x = -5; x <= 5; x++) for (let z = -5; z <= 5; z++) blocks.push([x, 0, z]);
    const rb = greedyMesh({ blocks });
    ok("...and world/VoxelWorld.js:18's EXACT CALL now works", rb.quads.length === 6 && rb.offset[0] === -5,
       "greedyMesh({ blocks }) -> " + rb.quads.length + " quads, offset " + JSON.stringify(rb.offset) +
       ". THAT CALL HAS THROWN SINCE THE DAY IT WAS WRITTEN. The offset is returned, not applied: A SPARSE LIST HAS NEGATIVE COORDS AND A MASK DOES NOT, and silently shifting would put the mesh 5 units from where the caller thinks it is.");
    let threw = "";
    try { greedyMesh({ mystery: 1 }); } catch (e) { threw = e.message; }
    ok("...and an unrecognised chunk shape THROWS, naming the keys it got", /unrecognised chunk shape/.test(threw) && /mystery/.test(threw),
       "AN EMPTY MESH IS INDISTINGUISHABLE FROM AN EMPTY WORLD -- that is a bug that looks like content. This tree speaks THREE chunk languages and nobody had written that down: dense {voxels,size,height}, sparse [[x,y,z]], and v2's {size,height,getIndex} WHICH NOTHING EVER PRODUCED. v2 did not merely throw -- IT SPOKE A LANGUAGE NOTHING SPEAKS.");

    const src = fs.readFileSync(path.join(here, "..", "voxel", "greedyMesh.js"), "utf8");
    ok("...and it MERGES now, which the name always claimed", greedyMesh(slab()).quads.length === 6,
       "6 quads where the naive path needs 576. v2 emitted [x,y,z] -- NO w, NO h, NO normal -- while being called greedyMesh. A NAME IS A CLAIM, and this one is now true. (This assertion first read `quads[0].w > 1` and FAILED: quads[0] is the +X SIDE face, {w:1, h:16} -- w=1 is CORRECT there and h=16 is the merge. IT GUESSED THE ORDER OF THE DIRS ARRAY. Assert the PROPERTY, not an incidental field of an arbitrary element.)");

    const world = fs.readFileSync(path.join(here, "..", "world", "VoxelWorld.js"), "utf8");
    ok("...and its caller is UNTOUCHED and now works", /greedyMesh\(\{ blocks \}\)/.test(world),
       "world/VoxelWorld.js:18 still reads exactly as it always did: greedyMesh({ blocks }). v2 read chunk.size, chunk.height AND chunk.getIndex -- `{ blocks }` HAS NONE OF THE THREE. THE FIX WENT IN THE CALLEE, SO NO CALLER HAD TO BE EDITED TO BE CORRECT.");
}

// ---- 3. AND THE TREE DISAGREES WITH ITSELF ABOUT WHICH ONE EXISTS ----------------------------------------------
{
    const builder = fs.readFileSync(path.join(here, "chunkMeshBuilder.js"), "utf8");
    ok("mesh/chunkMeshBuilder.js imports v1 (the one that works)", /from "\.\/greedyMesher\.js"/.test(builder),
       "while world/VoxelWorld.js and voxel/VoxelMesh.js import v2 (the one that throws). TWO CODE PATHS, TWO MESHERS, AND THE CALLERS DISAGREE ABOUT WHICH MESHER THIS ENGINE HAS.");
    const v3src = fs.readFileSync(path.join(here, "..", "voxel", "greedyMesh.js"), "utf8");
    ok("...and the file no longer claims to be something it is not", /DELEGATES TO mesh\/greedyMesh3d/.test(v3src),
       "v2's header said 'SAFE BOUNDS + DEBUG HARDENING' while calling a method nobody defined. THE VERSION NUMBER WAS THE ONLY EVIDENCE IT WAS NEWER, AND A VERSION NUMBER IS PROSE. This header points at a module gated on SET EQUALITY with a naive oracle -- so its correctness is no longer a claim in a comment, IT IS SOMEBODY ELSE'S PASSING TEST.");
}

// ---- 4. v2573: HOW MANY LIVE CALLERS? KEITH ASKED, AND THE ANSWER WAS ZERO ------------------------------------
//
// v2572 wrote "half your tree calls something that cannot run". Keith asked three words: "Our tree calls it?"
// TRACING ONE LEVEL UP IS NOT OPTIONAL. A CALLER THAT NOTHING CALLS IS NOT A WOUND, IT IS A FOSSIL.
{
    const root = path.join(here, "..");
    const walk = (d, out = []) => {
        for (const e of fs.readdirSync(d, { withFileTypes: true })) {
            if (e.name === "node_modules" || e.name === "vendor" || e.name.startsWith(".")) continue;
            const p = path.join(d, e.name);
            if (e.isDirectory()) walk(p, out);
            // predictions.html is a CLAIMS PAGE, not code. Its kill condition literally reads "Show a live
            // import path into world/VoxelWorld.js" -- and this regex COUNTED THAT SENTENCE AS AN IMPORT. THE
            // GATE MATCHED THE CLAIM DESCRIBING THE BUG AS AN INSTANCE OF THE BUG. A REGEX THAT GREPS PROSE
            // WILL FIND PROSE -- the same lesson as v2571's shader check, from the opposite direction.
            // DOCUMENTATION QUOTING A PATH IS NOT AN IMPORT.
            else if (/\.(js|mjs|html)$/.test(e.name) && !/selfcheck/.test(e.name)
                     && e.name !== "predictions.html") out.push(p);
        }
        return out;
    };
    const files = walk(root);
    const importersOf = (name) => files.filter((p) => {
        if (p.endsWith(name)) return false;
        return new RegExp("from ['\"][^'\"]*" + name.replace(".", "\\.") + "['\"]").test(fs.readFileSync(p, "utf8"));
    });

    const vw = importersOf("VoxelWorld.js"), vm = importersOf("VoxelMesh.js");
    ok("THE BROKEN MESHER'S CALLERS ARE THEMSELVES ORPHANS", vw.length === 0 && vm.length === 0,
       "world/VoxelWorld.js: " + vw.length + " importers (predictions.html EXCLUDED -- its kill condition reads \"Show a live import path into world/VoxelWorld.js\" and this regex counted THAT SENTENCE as an import; THE GATE MATCHED THE CLAIM DESCRIBING THE BUG AS AN INSTANCE OF THE BUG). voxel/VoxelMesh.js: " + vm.length + " importers. THEY CALL v2, AND NOTHING CALLS THEM. v2572 SAID 'HALF YOUR TREE CALLS SOMETHING THAT CANNOT RUN' AND THE TRUE COUNT WAS ZERO -- second time this session I found a real bug and overstated its reach, and I WROTE THE LAW AGAINST IT MYSELF IN v2569: A REAL FINDING DOES NOT LICENSE A GUESS ABOUT WHAT ELSE IT BROKE.");

    // v3216 -- *** THIS CHECK ASSERTED THE REVERSE OF WHAT THE THREE CHECKS AROUND IT PROVE. ***
    // It required mesh/chunkMeshBuilder.js to have importers, on the story that "the good one is live and the
    // broken one is dead". IT HAS ZERO. And the round that wrote this had already measured it: predictions.html
    // records "THE TRUE COUNT OF LIVE CALLERS IS ZERO" for v2's callers, then describes v1 as "imported by
    // mesh/chunkMeshBuilder" WITHOUT ASKING WHO IMPORTS THAT. mesh/greedyMesh3d.js line 10 inherited the same
    // half-checked claim in a comment: "Live, via mesh/chunkMeshBuilder.js."
    //
    // *** REACHABILITY IS TRANSITIVE AND TWO RECORDS FORGOT THE SECOND HOP. *** Being imported by a file that
    // nothing imports is not being live. The checks above and below reach the real conclusion between them --
    // v2's callers are orphans, v1 is 2.5D and cannot replace v2, and the live page inlines a THIRD mesher that
    // merges nothing -- so what they establish together is that NOTHING IS WIRED. This line contradicted them
    // and went red for telling the truth.
    //
    // *** WHEN SOMEBODY WIRES A MESHER THIS GOES RED AND SHOULD BE REWRITTEN TO NAME WHICH ONE -- NOT DELETED,
    // AND NOT WIDENED TO ACCEPT EITHER. *** A check that accepted "some mesher is live" would stop being able
    // to say which of the three the engine actually depends on, which is the only thing anybody needs from it.
    const cmb = importersOf("chunkMeshBuilder.js");
    // v3218 -- MERGED FROM THE PARALLEL v3216 ROUND, WHICH REACHED THE SAME DIAGNOSIS AND ASSERTED IT BETTER:
    // it checks ALL THREE importer counts here rather than one, so this single line carries the whole finding
    // instead of leaning on its neighbour for the other two. A check that depends on the check above it to mean
    // anything is two halves of one claim, which is the shape this file was already about.
    ok("!! *** NO MESHER IS WIRED: neither the working one nor the broken one is on a live path ***",
        cmb.length === 0 && vw.length === 0 && vm.length === 0,
       "mesh/chunkMeshBuilder.js has " + cmb.length + " importers, and IT is the only importer of v1 -- so v1's " +
       "liveness rests on a file nothing loads. Three records disagreed about this and two were wrong: this " +
       "check, and greedyMesh3d.js's header comment. THE ENGINE HAS THREE MESHERS AND USES NONE OF THEM through " +
       "an import: the live page inlines a fourth that merges nothing. FULL-3D GREEDY MESHING IS THE GAP.");

    const viewer = fs.readFileSync(path.join(root, "voxel-viewer.html"), "utf8");
    // v3218 -- *** THIS SAID "USES A THIRD MESHER, INLINE" AND STOPPED, WHICH IS TRUE OF THE DEFAULT AND
    // MISLEADING ABOUT THE PAGE. *** voxel-viewer.html has carried ?mesher=greedy since v2579: it swaps in
    // mesh/voxelMeshGreedy.js, which merges coplanar SAME-COLOUR faces into maximal rectangles and was measured
    // at 4548 faces -> 1373 on a 32^3 chunk of real terrain, 3.31x less geometry. The default is unchanged ON
    // PURPOSE, with the reason written into the page: "PROVEN CORRECT and LOOKS RIGHT ON A SCREEN ARE DIFFERENT
    // CLAIMS. Add ?mesher=greedy, look at both, then decide."
    //
    // SO THE OPEN ITEM HERE IS A DECISION RESERVED FOR A HUMAN AT A SCREEN, NOT MISSING CODE -- and a gate that
    // reported only the default was quietly recruiting somebody to "fix" a choice that had already been made
    // deliberately and written down.
    ok("...and THE LIVE PAGE'S DEFAULT IS A THIRD MESHER, INLINE -- with a measured greedy path behind a flag",
        /function buildVoxelMesh\(voxels\)/.test(viewer) && /mesher.*greedy/.test(viewer) && /__swekMesher/.test(viewer),
       "voxel-viewer.html:208 defines its own buildVoxelMesh and imports NEITHER module. It culls hidden faces against a Set and MERGES NOTHING: 576 faces / 1152 triangles for the same flat 16x16 slab v1 does in ONE quad.");
    ok("...and v1 CANNOT simply replace it", /top-face simplific/.test(fs.readFileSync(path.join(here, "greedyMesher.js"), "utf8")),
       "v1 is 2.5D, TOP FACES ONLY, and says so. The viewer needs all six. THEY DO DIFFERENT JOBS -- and the gap between them, FULL-3D GREEDY MESHING, IS EXACTLY WHAT THIS ENGINE DOES NOT HAVE. That is the gap vercidium-patreon/meshing fills, and it is why the answer to 'should we port it' flipped from no to yes.");
}

console.log(fails ? "\ngreedyMesh-selfcheck: " + fails + " FAILED" : "\ngreedyMesh-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
