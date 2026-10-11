// WebGLEngine/tools/ship/splatVoxelWorld-selfcheck.mjs -- the splat-collision round
//
// Run: node tools/ship/splatVoxelWorld-selfcheck.mjs
//
// GATES world/splatVoxelWorld.mjs: a splat cloud as a `voxelAt` world camera.js's voxel walker stands in, measured
// against a level whose every solid cell is known (levelSolid), captured as splats on every face a camera could see
// (captureLevel). The exports, each named here: SUB, SIGMA, MIN_OPACITY, MIN_COMPONENT, normalizeCloud,
// voxelizeSplats, toBoxCoverInput, LEVEL_DIMS, levelSolid, captureLevel, compareToLevel.
//
// The round's one rule, which every section below is a case of: *** EVERY COLUMN A BODY WOULD FALL THROUGH IS
// LISTED. *** A splat capture has holes and nothing about a voxel grid can invent the floor a camera never saw; what
// it can do is not let a body drop out of the world in silence.
//
// ---- SABOTAGES, WITH THEIR RESULTS ---------------------------------------------------------------------------
//
//   V1   the scan fills nothing: solid is the shell alone                              17 RED
//   V2   every shell CELL flips the scan, not every run                                17 RED
//   V3   the stamp not widened by half a fine cell (a 0.02-thick splat hits 1 cell)    17 RED
//   V4   a walker cell solid when ANY of its fine cells is, not half                   13 RED
//   V5   MIN_COMPONENT 0, floaters kept                                                 2 RED
//   V6   holes by enclosure only -- a sparse capture's border gaps go unlisted          3 RED
//   V7   holes by "a splat sits over it" only -- the unseen floor hole goes unlisted    5 RED
//   V8   a fill takes the HIGHEST rim height, not the one most of the rim agrees on     1 RED
//   V9   the splat's rotation applied transposed                                       1 RED
//   V10  opacity from a loader cloud's alpha ignored                                    1 RED
//   V11  packed quaternions read as v / 255, not (v - 128) / 128                        1 RED
//   V12  the fill ring by ring, every column with a known neighbour at once             2 RED
//
// *** V8 AND V9 WENT ZERO RED ON THE FIRST DRAFT, AND V8's NEW ROW THEN WENT RED ON THE MODULE ITSELF. *** The only
// filled hole was in open floor, whose rim all agrees, so "highest" and "most agreed" could not differ; and the
// rotated splats were turned by 90 degrees, under which a splat flat on one axis lands the same way transposed or
// not. The hole beside the block that was added for V8 found the fill's real defect -- ring by ring, the middle
// column was reached while only the block's three columns were known, and it filled at 3 -- which is V12, fixed by
// filling the columns with the most known neighbours first. The rotation row turns every splat 120 degrees about
// (1,1,1), whose inverse sends each axis somewhere else.
"use strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const imp = (p) => import(pathToFileURL(path.join(ENG, p)).href);
const { SUB, SIGMA, MIN_OPACITY, MIN_COMPONENT, normalizeCloud, voxelizeSplats, toBoxCoverInput, LEVEL_DIMS, levelSolid,
        captureLevel, compareToLevel } = await imp("world/splatVoxelWorld.mjs");
const { Camera } = await imp("camera/camera.js");
const { boxCover } = await imp("physics/voxelBoxCover.js");

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const t0 = Date.now();
const fmt = (r) => `top wrong ${r.wrongTop}, fall-through ${r.fallThrough}, +${r.falseSolid} / -${r.falseEmpty} cells`;

const CAPTURES = {
    clean: {}, "jitter 0.08": { jitter: 0.08 }, "400 translucent floaters": { floaters: 400 },
    "30 opaque floaters": { opaqueFloaters: 30 }, "a 1.5-unit floor hole": { holes: [[20.5, 3.5, 1.5, 1]] },
    "undersides unseen": { skipUnderside: true }, "4 splats a face": { perFace: 4 }, "3 splats a face": { perFace: 3 },
};
const built = {};
for (const [name, o] of Object.entries(CAPTURES)) { const cloud = captureLevel(o), world = voxelizeSplats(cloud); built[name] = { cloud, world, cmp: compareToLevel(world) }; }

console.log("1. *** A SURFACE LIES ON A CELL BOUNDARY, SO 'THE CELL A SPLAT IS IN' STANDS THE BODY ONE VOXEL HIGH ***");
{
    const { cloud, world, cmp } = built.clean;
    // the rival: each splat marks the cell its centre falls in
    const set = new Set();
    for (let i = 0; i < cloud.count; i++) if (cloud.opacities[i] >= MIN_OPACITY) set.add(Math.floor(cloud.positions[i * 3]) + "," + Math.floor(cloud.positions[i * 3 + 1]) + "," + Math.floor(cloud.positions[i * 3 + 2]));
    const rival = compareToLevel({ solidAt: (x, y, z) => set.has(x + "," + y + "," + z) });
    ok(`!! the centre-cell rule stands ${rival.wrongTop} of ${rival.columns} columns at the wrong height; the parity scan stands ${cmp.wrongTop}`,
        rival.wrongTop > 500 && cmp.wrongTop === 0 && cmp.fallThrough === 0,
        `rival: ${fmt(rival)}. parity: ${fmt(cmp)} -- the 17 and 3 are wall and table edges a half-cell stamp moves across a cell boundary, none of them a stand height`);
    ok(`  the defaults are the measured ones: SUB ${SUB}, SIGMA ${SIGMA}, MIN_OPACITY ${MIN_OPACITY}, MIN_COMPONENT ${MIN_COMPONENT}`,
        SUB === 4 && SIGMA === 1 && MIN_OPACITY === 0.2 && MIN_COMPONENT === 64 && world.stats.sub === SUB && world.stats.sigma === SIGMA);
    ok("  the world is built over the cloud's own bounds, padded a cell, and its chunkHeight is the grid's top",
        world.origin.join() === "-2,-1,-2" && world.dims.join() === "28,8,28" && world.chunkHeight === 7 && LEVEL_DIMS.join() === "24,8,24",
        `origin ${world.origin}, dims ${world.dims}, solid cells ${world.stats.solidCells} -- the level's ${(() => { let n = 0; for (let x = 0; x < 24; x++) for (let y = 0; y < 8; y++) for (let z = 0; z < 24; z++) n += levelSolid(x, y, z) ? 1 : 0; return n; })()} plus the row under the ground, which no camera saw the bottom of and so stays solid to the grid's floor`);
}

console.log("\n2. *** EVERY COLUMN A BODY WOULD FALL THROUGH IS LISTED -- ON EVERY CAPTURE, NOT ONLY THE ONE WITH A HOLE ***");
{
    const rows = Object.entries(built).map(([n, b]) => `${n}: ${b.cmp.fallThrough}/${b.world.holes.length}`);
    ok("!! listed holes === fall-through columns, capture by capture", Object.values(built).every((b) => b.world.holes.length === b.cmp.fallThrough),
        rows.join("; ") + " (fall-through / listed)");
    const h = built["a 1.5-unit floor hole"];
    const inside = h.world.holes.every(([x, z]) => Math.hypot(x + 0.5 - 20.5, z + 0.5 - 3.5) < 1.5 + 0.75);
    ok(`!! the floor hole is 7 columns, every one listed where the capture missed it, and the rest of the floor is untouched`,
        h.world.holes.length === 7 && inside && h.cmp.wrongTop === 0, `holes at ${h.world.holes.map((p) => p.join(",")).join(" ")}; ${fmt(h.cmp)}`);
    const filled = voxelizeSplats(h.cloud, { fillHoles: true }), fc = compareToLevel(filled);
    ok(`!! fillHoles closes all 7 at the height their rim agrees on: fall-through ${fc.fallThrough}, every stand height right, the cells back to the clean capture's`,
        filled.stats.filled === 7 && fc.fallThrough === 0 && fc.wrongTop === 0 && fc.falseEmpty === built.clean.cmp.falseEmpty,
        `${fmt(fc)}; still listed in .holes (${filled.holes.length}) -- a fill is a guess and the list says where it was made`);
    // a hole whose rim DISAGREES: beside the block, so three of its rim columns stand at 3 and the rest at 1 -- the
    // floor's height is the one most of the rim agrees on, and the highest would raise a step out of the floor
    const bes = captureLevel({ holes: [[8, 5.5, 1.5, 1]] }), bw = voxelizeSplats(bes, { fillHoles: true }), bc = compareToLevel(bw);
    ok(`!! a hole beside the block fills at the FLOOR's height, the one most of its rim agrees on -- ${bw.stats.filled} filled, every stand height right`,
        bw.stats.filled === bw.holes.length && bw.holes.length >= 5 && bc.wrongTop === 0 && bc.fallThrough === 0,
        `holes ${bw.holes.map((q) => q.join(",")).join(" ")}; ${fmt(bc)}`);
    // the hole definition's second half: a sparse capture's BORDER gaps join the empty margin and read as "outside"
    const sp = built["4 splats a face"];
    ok(`!! a sparse capture's border gaps are listed too -- ${sp.cmp.fallThrough} fall-through, ${sp.world.holes.length} listed; enclosure alone found 20`,
        sp.world.holes.length === 26 && sp.cmp.fallThrough === 26, "an empty column a used splat sits over is a hole: the capture saw something there and it did not close");
}

console.log("\n3. WHAT A CAPTURE GETS WRONG, ONE DEFECT AT A TIME");
{
    for (const n of ["jitter 0.08", "400 translucent floaters"]) ok(`  ${n}: every stand height right, nothing falls through`, built[n].cmp.wrongTop === 0 && built[n].cmp.fallThrough === 0, fmt(built[n].cmp));
    const o = built["30 opaque floaters"], bare = compareToLevel(voxelizeSplats(o.cloud, { minComponent: 0 }));
    ok(`!! *** OPAQUE FLOATERS FLIP THE SCAN UNDER THEM, AND THE COMPONENT FILTER IS WHAT STOPS IT *** -- ${o.world.stats.componentsDropped} components dropped, top wrong ${o.cmp.wrongTop}; without the filter ${bare.wrongTop}`,
        o.world.stats.componentsDropped === 30 && o.cmp.wrongTop === 0 && bare.wrongTop > 0, `filtered: ${fmt(o.cmp)}; unfiltered: ${fmt(bare)}`);
    const sp4 = built["4 splats a face"], wide = voxelizeSplats(sp4.cloud, { sigma: 1.5 }), wc = compareToLevel(wide);
    ok(`!! sparseness is SIGMA's to answer, and the hole list is what says it was set too low: 4 a face at 1 sigma lists ${sp4.world.holes.length}, at 1.5 sigma ${wide.holes.length}`,
        sp4.world.holes.length === 26 && wide.holes.length === wc.fallThrough && wc.fallThrough < 5 && wc.wrongTop < 10,
        `1.5 sigma: ${fmt(wc)} -- wider stamps close the gaps and cost a few heights; 3 a face at 1 sigma lists ${built["3 splats a face"].world.holes.length}`);
    const u = built["undersides unseen"];
    ok(`  *** NOT FIXED, AND PINNED SO A CHANGE IS SEEN: *** with no underside captured the space under the table reads solid -- +${u.cmp.falseSolid} cells against the clean capture's +${built.clean.cmp.falseSolid} -- and no stand height moves`,
        u.cmp.falseSolid === 40 && u.cmp.wrongTop === 0 && u.cmp.fallThrough === 0, "a splat's normal is known only up to sign, so the scan cannot tell a table with an unseen underside from a block");
}

console.log("\n4. THE LOADER'S SHAPES: OPACITY FROM ALPHA, ROTATED SPLATS, PACKED QUATERNIONS");
{
    // the same capture, every splat written with its NORMAL on local x and a quaternion turning local x onto the
    // face's normal axis -- the world must not notice
    const { cloud } = built.clean, n = cloud.count;
    // TWO rotations, for two reasons. The float case turns EVERY splat by 120 degrees about (1,1,1) -- local x onto
    // world y, y onto z, z onto x -- because that turn's inverse sends each axis somewhere else: the first draft used
    // 90-degree turns, under which a splat flat on one axis lands the same way transposed or not, and a transposed
    // rotation went ZERO red. The packed case keeps the 90-degree turns, whose 0.7071 the packing cannot hold exactly.
    const scales = new Float32Array(n * 3), scalesP = new Float32Array(n * 3), rotF = new Float32Array(n * 4), rotU = new Uint8Array(n * 4), colors = new Uint8Array(n * 4);
    const h = Math.SQRT1_2;
    for (let i = 0; i < n; i++) {
        const s = [cloud.scales[i * 3], cloud.scales[i * 3 + 1], cloud.scales[i * 3 + 2]], ax = s.indexOf(Math.min(...s));
        scales.set([s[1], s[2], s[0]], i * 3);   // local x is world y, local y world z, local z world x
        rotF.set([0.5, 0.5, 0.5, 0.5], i * 4);
        scalesP.set([s[ax], 0.3, 0.3], i * 3);
        // x -> x: identity; x -> y: 90 deg about z; x -> z: -90 deg about y
        const q = ax === 0 ? [1, 0, 0, 0] : ax === 1 ? [h, 0, 0, h] : [h, 0, -h, 0];
        rotU.set(q.map((v) => Math.max(0, Math.min(255, Math.round(v * 128 + 128)))), i * 4);
        colors[i * 4 + 3] = Math.round(cloud.opacities[i] * 255);
    }
    const same = (w) => { let d = 0; for (let x = -2; x < 26; x++) for (let y = -1; y < 7; y++) for (let z = -2; z < 26; z++) if (w.solidAt(x, y, z) !== built.clean.world.solidAt(x, y, z)) d++; return d; };
    const wf = voxelizeSplats({ positions: cloud.positions, scales, rotations: rotF, colors, count: n });
    ok("!! a .ply-shaped cloud -- opacity in colors' alpha, every splat turned 120 degrees with its scales on the turned axes, float quaternions -- builds the SAME world, cell for cell",
        same(wf) === 0 && wf.holes.length === 0, `${same(wf)} cells differ`);
    const wu = voxelizeSplats({ positions: cloud.positions, scales: scalesP, rotations: rotU, colors, count: n }), cu = compareToLevel(wu);
    ok("  a .splat-shaped cloud, quaternions packed (v - 128) / 128 the way render/SplatRenderer reads them: every stand height right",
        cu.wrongTop === 0 && cu.fallThrough === 0 && same(wu) < 10, `${same(wu)} cells differ from the axis-aligned build -- the packing's 1/128 is a quarter-degree of tilt on a 0.3-wide splat; ${fmt(cu)}`);
    const nc = normalizeCloud({ positions: cloud.positions, scales: scalesP, rotations: rotU, colors, count: n });
    ok("  normalizeCloud: alpha / 255 is the opacity, and every quaternion comes out unit length",
        Math.abs(nc.opacities[0] - colors[3] / 255) < 1e-7 && [...Array(n).keys()].every((i) => Math.abs(Math.hypot(nc.rotations[i * 4], nc.rotations[i * 4 + 1], nc.rotations[i * 4 + 2], nc.rotations[i * 4 + 3]) - 1) < 1e-6));
    let threw = null; try { voxelizeSplats({ positions: new Float32Array(3), scales: new Float32Array(3), opacities: new Float32Array([0.05]), count: 1 }); } catch (e) { threw = e.message; }
    ok("  a cloud with nothing above minOpacity is refused by name, not built empty", /no splat passed/.test(threw || ""), threw);
}

console.log("\n5. *** camera.js's WALKER IN THE SPLAT WORLD: IT STANDS WHERE THE LEVEL SAYS, AND IS NEVER INSIDE IT ***");
{
    const EYE = 1.7, Rb = Camera.BODY_RADIUS;
    const mkCam = (world, pos, keys = [], yaw = 0) => {
        const c = Object.create(Camera.prototype);
        Object.assign(c, { world, keys: new Set(keys), position: { x: pos[0], y: pos[1], z: pos[2] },
            velocity: { x: 0, y: 0, z: 0 }, yaw, _extMove: null, _eyeHeight: EYE, _gravity: 18,
            _fpWalkSpeed: 5, _fpSprintSpeed: 8, _fpJumpVel: 8, _fpVelY: 0, _fpOnGround: false, playerEnergy: null });
        return c;
    };
    const settle = (world, x, z, from = 7) => { const c = mkCam(world, [x, from + EYE, z]); for (let f = 0; f < 240 && !c._fpOnGround; f++) c._moveFP(1 / 60); return c; };
    const topOf = (x, z) => { for (let y = 7; y >= 0; y--) if (levelSolid(x, y, z)) return y + 1; return null; };
    const world = built.clean.world;
    const probes = [[1, 1], [5, 5], [10, 3], [11, 4], [12, 3], [13, 4], [16, 7], [20, 20], [8, 14]];
    const got = probes.map(([x, z]) => { const c = settle(world, x + 0.5, z + 0.5); return [x, z, c._fpOnGround ? +(c.position.y - EYE).toFixed(4) : null, topOf(x, z)]; });
    ok("!! a body dropped over the floor, the block, every stair, the table and the open floor lands on the level's own height, every one",
        got.every(([, , feet, t]) => feet === t), got.map(([x, z, f, t]) => `(${x},${z}) ${f}/${t}`).join(" "));
    const hole = built["a 1.5-unit floor hole"];
    const fell = settle(hole.world, 20.5, 3.5);
    const held = settle(voxelizeSplats(hole.cloud, { fillHoles: true }), 20.5, 3.5);
    ok("!! over the listed hole the body FALLS, as the list said it would; over the filled one it stands on the floor",
        !fell._fpOnGround && fell.position.y - EYE < 1 && held._fpOnGround && Math.abs(held.position.y - EYE - 1) < 1e-9,
        `unfilled: feet ${(fell.position.y - EYE).toFixed(2)} after 4 s, airborne; filled: feet ${(held.position.y - EYE).toFixed(4)}`);
    // the fuzz: the invariant playerBody-selfcheck section 7 holds for a lattice, held here for a captured one
    const inside = (w, x, feet, z) => {
        for (let cx = Math.floor(x - Rb) - 1; cx <= Math.floor(x + Rb) + 1; cx++) for (let cz = Math.floor(z - Rb) - 1; cz <= Math.floor(z + Rb) + 1; cz++)
            for (let cy = Math.floor(feet) - 1; cy <= Math.floor(feet + EYE) + 1; cy++) {
                if (!w.solidAt(cx, cy, cz) || cy + 1 <= feet + Camera.FEET_BAND + 1e-9 || cy >= feet + EYE - 1e-9) continue;
                const nx = Math.max(cx, Math.min(x, cx + 1)), nz = Math.max(cz, Math.min(z, cz + 1));
                if (Math.hypot(nx - x, nz - z) < Rb - 1e-9) return true;
            }
        return false;
    };
    // the level has no wall at its edge, so a body walks off it into the void; it is put back rather than counted as
    // 300 frames of free fall, in which nothing can be inside anything (the first draft's 3,571 of 4,800 "air" frames)
    let seed = 83, frames = 0, dirty = 0, air = 0, offEdge = 0;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) >>> 0) / 4294967296);
    const sets = [["KeyW"], ["KeyW", "ShiftLeft"], ["KeyW", "KeyD"], ["KeyS"], ["KeyW", "Space"], ["KeyA", "Space", "ShiftLeft"]];
    for (const name of ["clean", "jitter 0.08", "undersides unseen"]) {
        const w = built[name].world;
        for (let run = 0; run < 4; run++) {
            let p = settle(w, 1.5 + rnd() * 21, 1.5 + rnd() * 21);
            for (let f = 0; f < 400; f++) {
                if (f % 40 === 0) { p.keys = new Set(sets[Math.floor(rnd() * sets.length)]); p.yaw = rnd() * Math.PI * 2; }
                p._moveFP(1 / 60); frames++; if (!p._fpOnGround) air++;
                if (inside(w, p.position.x, p.position.y - EYE, p.position.z)) dirty++;
                if (p.position.x < 0 || p.position.z < 0 || p.position.x > 24 || p.position.z > 24) { offEdge++; const k = p.keys, y = p.yaw; p = settle(w, 1.5 + rnd() * 21, 1.5 + rnd() * 21); p.keys = k; p.yaw = y; }
            }
        }
    }
    ok(`!! ${frames} frames of walk, sprint and jump over three captures, ${air} in the air: the body is inside a captured voxel on ${dirty}`,
        dirty === 0 && air > 1000 && frames - air > 2000, `${frames - air} on the ground; two of the six key sets hold Space, so half the frames are jumps. ${offEdge} walks off the level's open edge put back; the walker's never-inside holds for any voxelAt, and this world is one`);
}

console.log("\n6. THE HAND-OFF TO physics/voxelBoxCover.js: THE BOXES PARTITION THE CAPTURED SOLID EXACTLY");
{
    const w = built.clean.world, { solid, dims, origin } = toBoxCoverInput(w), boxes = boxCover(solid, dims);
    let vol = 0, bad = 0;
    for (const b of boxes) for (let x = b.min[0]; x <= b.max[0]; x++) for (let y = b.min[1]; y <= b.max[1]; y++) for (let z = b.min[2]; z <= b.max[2]; z++) { vol++; if (!solid(x, y, z)) bad++; }
    ok(`  ${boxes.length} boxes covering ${vol} cells, every one solid, the total the world's own ${w.stats.solidCells}`,
        bad === 0 && vol === w.stats.solidCells && origin.join() === w.origin.join() && boxes.length < w.stats.solidCells / 4,
        "grid-local indices with the world's origin beside them -- boxToCollider's world placement is the caller's, with that origin");
}

console.log(`\n${fails ? "FAIL -- " + fails + " check(s)" : "ALL GREEN"} (${Date.now() - t0} ms)` +
    "\nnot closed here: a REAL capture. Every number above is against a synthetic level, which is what lets them be " +
    "right or wrong; what a scanned scene's noise, scale and up-axis do to them is a measurement on a .ply on the rig. " +
    "Nor are unseen undersides solved (section 3 pins the cost), nor is the box hand-off driven through a box3d world.");
process.exit(fails ? 1 : 0);
