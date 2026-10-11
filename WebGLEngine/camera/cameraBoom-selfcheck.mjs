// WebGLEngine/camera/cameraBoom-selfcheck.mjs -- Round A, the camera boom
//
// Run: node camera/cameraBoom-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs (auto-discovered).
//
// GATES camera/cameraBoom.js, and camera/camera.js's third-person eye in a voxel world, which now uses it.
//
// The invariants are exact, as kinematic-selfcheck's are, because the boom is dictated by geometry:
//
//   NEVER INSIDE      the camera's box never overlaps a solid voxel -- asked of kinematic.overlapsSolid, fuzzed.
//   ALL OF IT FREE    every point of the lift and of the boom up to the answer is free too, so easing along it is safe.
//   NEVER FURTHER     neither the lift nor the boom comes out longer than asked.
//   EXACT WHEN CLEAR  with nothing in the way the camera is exactly where it was asked to be, bit for bit.
//   NOT TOO CAUTIOUS  when pulled in, it is pulled in by the skin: a hair past the first contact the box overlaps.
//   NO SKIPPING       a wall one voxel thick between the body and the desired spot always stops it. The planted
//                     version that tests only the endpoint is run here as a control and must fail this row's test.
//   EASING            in is instant, out is gradual, and the eased length never exceeds the safe one.
//
// ONE CONVENTION, ASSERTED: voxel/voxelDDA.js and kinematic.js both index the unit cell [x,x+1) by floor(x). Two
// declarations of one convention is how this tree has drifted before, so the gate asks both rather than trusting this
// header.

import { sweepBox, cameraBoom, placeAt, easeBoom } from "./cameraBoom.js";
import { overlapsSolid, EPS } from "../physics/character/kinematic.js";
import { traverseDDA } from "../voxel/voxelDDA.js";
import fs from "node:fs";

let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };
let rng = 4242;
const rand = () => { rng = (rng * 1664525 + 1013904223) >>> 0; return rng / 4294967296; };
const HALF = [0.2, 0.2, 0.2], SKIN = 0.3;
const dist3 = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

console.log("cameraBoom-selfcheck -- the third-person camera against a voxel world\n");

// 1. ONE CONVENTION -------------------------------------------------------------------------------------------------
console.log("1. one cell convention, asked of both modules");
{
    let disagree = 0, n = 0;
    for (let i = 0; i < 2000; i++) {
        const p = [rand() * 20 - 10, rand() * 20 - 10, rand() * 20 - 10];
        const cell = p.map(Math.floor);
        const only = (x, y, z) => x === cell[0] && y === cell[1] && z === cell[2];
        const dda = traverseDDA(p[0], p[1], p[2], rand() - 0.5, rand() - 0.5, rand() - 0.5, only, 1);
        const kin = overlapsSolid(p, [1e-3, 1e-3, 1e-3], only);
        // away from a cell face by more than the box, both must name floor(p): DDA hits at step 0, the tiny box overlaps
        const nearFace = p.some((v) => Math.abs(v - Math.round(v)) < 2e-3);
        if (nearFace) continue;
        n++; if (!(dda.hit && dda.steps === 0) || !kin) disagree++;
    }
    ok("!! traverseDDA and kinematic.overlapsSolid both put a point in the cell floor(p)", disagree === 0 && n > 1500, `${disagree} disagreements in ${n} points`);
}

// 2. CLEAR LINE -------------------------------------------------------------------------------------------------------
console.log("\n2. nothing in the way");
{
    const empty = () => false;
    let worst = 0, notExact = 0;
    for (let i = 0; i < 500; i++) {
        const pivot = [rand() * 10, rand() * 10, rand() * 10], back = [rand() - 0.5, rand() - 0.5, rand() - 0.5];
        const dist = 0.5 + rand() * 8, lift = rand() * 2;
        const r = cameraBoom({ pivot, back, dist, lift, half: HALF, skin: SKIN, isSolid: empty });
        const l = Math.hypot(...back), want = [pivot[0] + back[0] / l * dist, pivot[1] + lift + back[1] / l * dist, pivot[2] + back[2] / l * dist];
        const e = dist3(r.pos, want); worst = Math.max(worst, e);
        if (r.dist !== dist || r.lift !== lift || r.blocked) notExact++;
    }
    ok("!! *** with a clear line the camera lands exactly on the desired spot: the full lift and the full length ***",
       notExact === 0 && worst < 1e-12, `${notExact} of 500 short of the request; worst position error ${worst.toExponential(2)}`);
}

// 3. RANDOM WORLDS: NEVER INSIDE, ALL OF IT FREE, NEVER FURTHER, NOT TOO CAUTIOUS ---------------------------------------
console.log("\n3. random voxel worlds");
{
    let calls = 0, inside = 0, pathHits = 0, further = 0, cautious = 0, blocked = 0, corrected = 0, startBlocked = 0;
    for (let w = 0; w < 60; w++) {
        const seed = new Set(), dens = 0.08 + rand() * 0.25;
        for (let x = -2; x < 14; x++) for (let y = -2; y < 14; y++) for (let z = -2; z < 14; z++) if (rand() < dens) seed.add(`${x},${y},${z}`);
        const solid = (x, y, z) => seed.has(`${x},${y},${z}`);
        for (let k = 0; k < 40; k++) {
            const pivot = [1 + rand() * 10, 1 + rand() * 10, 1 + rand() * 10];
            if (overlapsSolid(pivot, HALF, solid)) continue;
            const back = [rand() - 0.5, rand() - 0.5, rand() - 0.5], dist = 0.5 + rand() * 7, lift = rand() * 2;
            const r = cameraBoom({ pivot, back, dist, lift, half: HALF, skin: SKIN, isSolid: solid });
            calls++; corrected += r.corrected; if (r.startBlocked) startBlocked++;
            if (overlapsSolid(r.pos, HALF, solid)) inside++;
            if (r.dist > dist || r.lift > lift || Math.abs(dist3(r.pos, r.start) - r.dist) > 1e-9) further++;
            // every point of the lift and of the boom up to the answer is free
            for (let s = 0; s <= 200; s++) {
                const pl = [pivot[0], pivot[1] + r.lift * s / 200, pivot[2]];
                if (overlapsSolid(pl, HALF, solid) || overlapsSolid(placeAt(r, r.dist * s / 200), HALF, solid)) { pathHits++; break; }
            }
            if (r.blocked) {
                blocked++;
                // pulled in by the skin and no more: a hair past the first contact the box overlaps
                const sw = sweepBox(r.start, r.dir, dist, HALF, solid);
                const past = [r.start[0] + r.dir[0] * (sw.first + 1e-6), r.start[1] + r.dir[1] * (sw.first + 1e-6), r.start[2] + r.dir[2] * (sw.first + 1e-6)];
                if (!overlapsSolid(past, HALF, solid) || Math.abs(r.dist - Math.max(0, sw.first - SKIN)) > 1e-12) cautious++;
            }
        }
    }
    ok("!! *** the camera's box is NEVER inside a solid ***", inside === 0 && calls > 1000, `${inside} of ${calls} booms, over 60 worlds`);
    ok("!! every point of the lift and of the boom up to the answer is free -- so an eased camera is free too", pathHits === 0, `${pathHits} of ${calls} paths touched a solid, 201 points each`);
    ok("!! never further than asked, on either segment", further === 0, `${further} of ${calls}`);
    ok("!! *** pulled in by exactly the skin, and a hair past the first contact really is a contact ***", cautious === 0 && blocked > 300,
       `${cautious} of ${blocked} blocked booms over-cautious or under-checked`);
    ok("  the sweep and kinematic.overlapsSolid agree, so the final confirmation never had to pull a camera in",
       corrected === 0, `${corrected} corrections; ${startBlocked} booms began in a solid lift`);
}

// 4. NO SKIPPING ------------------------------------------------------------------------------------------------------
console.log("\n4. a wall one voxel thick");
{
    // the body at x = 2.5, the camera wanted 6 behind it along +x; a one-voxel wall at x = 4 sits between, and the far
    // side is open -- which is exactly where an endpoint-only test would put the camera
    const wall = (x) => x === 4;
    const solid = (x, y, z) => wall(x);
    const endpointOnly = ({ pivot, back, dist, lift }) => {   // THE PLANTED VERSION: tests the destination and nothing on the way
        const l = Math.hypot(...back), pos = [pivot[0] + back[0] / l * dist, pivot[1] + lift + back[1] / l * dist, pivot[2] + back[2] / l * dist];
        return overlapsSolid(pos, HALF, solid) ? { pos: pivot } : { pos };
    };
    let real = 0, planted = 0, n = 0;
    for (let i = 0; i < 300; i++) {
        const back = [1, (rand() - 0.5) * 0.6, (rand() - 0.5) * 0.6], dist = 3 + rand() * 4;
        const q = { pivot: [2.5, 5, 5], back, dist, lift: rand(), half: HALF, skin: SKIN, isSolid: solid };
        n++;
        if (cameraBoom(q).pos[0] + HALF[0] > 4) real++;
        if (endpointOnly(q).pos[0] + HALF[0] > 4) planted++;
    }
    ok("!! *** the camera never ends on or past a one-voxel wall between it and the body ***", real === 0, `${real} of ${n}`);
    ok("  CONTROL: the planted endpoint-only test DOES put it on the far side -- the row above can fail", planted > n * 0.8,
       `endpoint-only: ${planted} of ${n} past the wall`);
}

// 5. EASING -----------------------------------------------------------------------------------------------------------
console.log("\n5. easing along the boom");
{
    let over = 0, snapFail = 0, n = 0, prev;
    for (let i = 0; i < 5000; i++) {
        const safe = rand() < 0.1 ? rand() * 0.5 : 4.5 * rand();
        const next = easeBoom(prev, safe, 1 / (30 + rand() * 120), 6);
        n++; if (next > safe) over++;
        if (Number.isFinite(prev) && safe <= prev && next !== safe) snapFail++;
        prev = next;
    }
    let conv = 0, d = 0.5; for (let i = 0; i < 600; i++) d = easeBoom(d, 4.5, 1 / 60, 6);
    ok("!! *** the eased length NEVER exceeds the safe length ***", over === 0, `${over} of ${n} steps`);
    ok("!! in is instant: a wall that arrives is never shown through", snapFail === 0, `${snapFail} of ${n}`);
    ok("  out is gradual and arrives: 0.5 -> 4.5 in ten seconds at 60 Hz", d > 4.49 && d <= 4.5 && easeBoom(0.5, 4.5, 1 / 60, 6) < 1, `after 600 frames ${d.toFixed(6)}`);
    ok("  without a frame time it is the safe length, as a direct call always was", easeBoom(1, 4.5) === 4.5 && easeBoom(undefined, 2, 1 / 60) === 2);
}

// 6. camera/camera.js's THIRD-PERSON EYE IN A VOXEL WORLD ------------------------------------------------------------------
console.log("\n6. camera/camera.js's third-person eye in a voxel world");
{
    const { Camera } = await import("./camera.js");
    const cam = (voxelAt, yaw = 0, pitch = 0) => {
        const c = Object.create(Camera.prototype);
        Object.assign(c, { position: { x: 5.5, y: 3.7, z: 5.5 }, yaw, pitch, mode: "fp", viewMode: "third",
            world: { voxelAt }, _thirdPersonDistance: 4.5, _thirdPersonHeight: 1.2, _thirdPersonSkin: 0.3, _thirdPersonHalf: 0.2,
            _boomDist: undefined, _capsuleWorldBVH: () => null });
        return c;
    };
    const floor = (x, y) => (y < 2 ? 1 : 0);
    // yaw 0: forward is -z, so the boom runs +z. A one-voxel wall at z = 8 crosses it. A low overhang at y = 5 crosses
    // the boom's path (the eye's box spans y 4.7..5.1 at full lift). A bridge at y = 8 passes over it, and a room's
    // ceiling at y = 7 covers it: the old column-top test read both as ground under the boom and pulled the eye in to
    // the head -- MEASURED by sabotage A4, which put that test back and turned the bridge row red.
    const wallZ8 = (x, y, z) => (floor(x, y) || z === 8 ? 1 : 0);
    const overhang = (x, y, z) => (floor(x, y) || (y === 5 && z >= 6 && z <= 9) ? 1 : 0);
    const bridge = (x, y, z) => (floor(x, y) || (y === 8 && z >= 6 && z <= 12) ? 1 : 0);
    const room = (x, y, z) => (floor(x, y) || y === 7 || x === 0 || x === 11 || z === 0 || z === 12 ? 1 : 0);
    const isSolidOf = (va) => (x, y, z) => Camera.isSolidToBody(va(x, y, z));
    const e1 = cam(wallZ8)._thirdPersonEye(), e2 = cam(overhang)._thirdPersonEye(), e3 = cam(floor)._thirdPersonEye(), e4 = cam(bridge)._thirdPersonEye(), e5 = cam(room)._thirdPersonEye();
    const box = (e) => [e.x, e.y, e.z];
    ok("!! *** the eye stops short of a one-voxel wall across the boom, its box clear of it ***",
       e1.z + 0.2 <= 8 && !overlapsSolid(box(e1), HALF, isSolidOf(wallZ8)), `eye z ${e1.z.toFixed(3)} against the wall at z = 8`);
    ok("!! *** and stops short of a low overhang across its path, its box clear of it ***",
       !overlapsSolid(box(e2), HALF, isSolidOf(overhang)) && e2.z + 0.2 <= 6, `eye ${[e2.x, e2.y, e2.z].map((v) => v.toFixed(3)).join(", ")}; the overhang starts at z = 6, y = 5`);
    ok("!! *** while a bridge overhead, which the old column-height test read as ground, no longer pulls it in ***",
       Math.abs(e4.z - 10) < 1e-12 && Math.abs(e4.y - 4.9) < 1e-12 && !overlapsSolid(box(e4), HALF, isSolidOf(bridge)),
       `eye ${[e4.x, e4.y, e4.z].map((v) => v.toFixed(3)).join(", ")} under a bridge at y = 8`);
    ok("!! *** and indoors, under a ceiling, it keeps its full length instead of collapsing onto the head ***",
       Math.abs(e5.z - 10) < 1e-12 && Math.abs(e5.y - 4.9) < 1e-12 && !overlapsSolid(box(e5), HALF, isSolidOf(room)),
       `eye ${[e5.x, e5.y, e5.z].map((v) => v.toFixed(3)).join(", ")} in a room whose ceiling is y = 7 and back wall z = 12`);
    ok("  with nothing in the way it is where it always was: 4.5 behind and 1.2 above", Math.abs(e3.z - 10) < 1e-12 && Math.abs(e3.y - 4.9) < 1e-12 && e3.x === 5.5,
       `eye ${[e3.x, e3.y, e3.z].map((v) => v.toFixed(3)).join(", ")}`);
    // the eased eye inside update() never passes the safe one, frame by frame, as a wall comes and goes
    const c = cam(wallZ8); let worst = -Infinity;
    for (let f = 0; f < 240; f++) {
        c.world.voxelAt = f % 80 < 40 ? wallZ8 : floor;
        const e = c._thirdPersonEye(1 / 60), safe = cameraBoom({ pivot: [5.5, 3.7, 5.5], back: [0, 0, 1], dist: 4.5, lift: 1.2, half: HALF, skin: 0.3, isSolid: isSolidOf(c.world.voxelAt) });
        worst = Math.max(worst, e.z - safe.pos[2]);
    }
    ok("!! the eye the frame loop eases is never past the boom's safe point as a wall comes and goes", worst <= 1e-12, `worst excess ${worst.toExponential(2)}`);
    const src = fs.readFileSync(new URL("./camera.js", import.meta.url), "utf8");
    const body = (src.match(/\n    _thirdPersonEye\(dt\) \{[\s\S]*?\n    \}\n/) || [""])[0];
    ok("  and the four-sample height test is gone from _thirdPersonEye, not kept beside the boom", !!body && !/samples/.test(body) && /cameraBoom\(\{/.test(body),
       body ? `${body.split("\n").length} lines read` : "the method was not found");
}

// 7. browser-safe ------------------------------------------------------------------------------------------------------
{
    const src = fs.readFileSync(new URL("./cameraBoom.js", import.meta.url), "utf8");
    const imports = src.match(/^\s*import\s.*$/gm) || [];
    ok("cameraBoom.js imports only physics/character/kinematic.js and uses no DOM", imports.length === 1 && /from "\.\.\/physics\/character\/kinematic\.js"/.test(imports[0]) && !/\bwindow\.|\bdocument\./.test(src),
       imports.join(" | "));
}

// ---- SABOTAGE LOG (Round A) ----
// Against camera/cameraBoom.js (written at physics/character/cameraBoom.js, moved before commit): A1 the boom testing only its endpoint (the planted version) -> 4 red (the
// free-path row, 614 of 1384; the skin row; the one-voxel wall, 300 of 300; camera.js's wall row). A2 no skin -> 5 red.
// A3 easing allowed past the safe length -> 3 red. A5 the overlap rule made cautious by 0.05 a side -> 1 red, the skin
// row, 1143 of 1143. Against camera/camera.js: A4 the voxel branch back on the four column-top samples -> 4 red (the low
// overhang, its box left inside it; the bridge; the room; the method's own text) -- and that run is also what showed a
// first draft's claim wrong: the old test did NOT skip a full-height one-voxel wall. All restored, md5 verified.
console.log("\ncameraBoom-selfcheck: " + (fails ? fails + " FAILED" : "all pass"));
process.exit(fails ? 1 : 0);
