// WebGLEngine/tools/crossarch-flesh.mjs — v2546
//
// RUN THIS ON BOTH MACHINES. COMPARE THE ONE LINE IT PRINTS.
//
//     node tools/crossarch-flesh.mjs
//
// It steps a seeded SPH flesh a fixed number of ticks and hashes the state. Same hash on an Intel Mac and an
// M-series Mac means the flesh is bit-identical across instruction sets. Different hash means it is not, and the
// first suspect is named below.
//
// WHY THIS AND NOT THE BOX3D TEST: box3d.wasm is not in the tree yet, and box3dLoader's planar fallback answers
// the same questions the real one does -- so running the box3d cross-arch test today would silently measure the
// JS FALLBACK on both machines and prove nothing about box3d. A test that quietly tests something else is worse
// than no test. This one measures a thing that actually exists.
//
// WHAT IT IS REALLY ASKING: IEEE 754 pins +, -, *, / and sqrt exactly -- correctly rounded, same bits, any
// conforming hardware. It pins NOTHING about pow, sin, cos or cbrt, and ECMAScript agrees: Math.pow is
// "implementation-approximated". v2546 removed Math.pow from the SPH kernels (they took h to the 9th and 6th)
// and replaced it with exact multiplication.
//
// THE KNOWN HOLE, STATED UP FRONT: fleshSph derives its particle spacing with Math.cbrt -- one call, at setup --
// and that sets BOTH h and mass. There is no exact cbrt. If the hashes differ, look there first.
"use strict";

import { FleshSph } from "../physics/soft/fleshSph.js";
import { createHash } from "node:crypto";
import os from "node:os";

const TICKS = 400;
const COUNT = 300;

// A two-bone limb that moves. A still rig would settle and hash the same trivially, which would prove nothing.
const limb = (ang) => [
    { a: [0, 0, 0], b: [1, 0, 0], r: 0.3 },
    { a: [1, 0, 0], b: [1 + Math.cos(ang), Math.sin(ang), 0], r: 0.26 },
];
// NOTE: Math.cos/sin appear HERE, in the test fixture that poses the rig. That is deliberate and it is a
// contaminant: if the two machines disagree, it could be the fixture rather than the physics. So the fixture is
// hashed too, separately, and printed. If the POSE hashes match and the FLESH hashes do not, the physics is at
// fault. If the pose hashes differ, the fixture is -- and that is still a real finding about this fleet.

const h = (s) => createHash("sha256").update(s).digest("hex").slice(0, 16);

const poses = [];
for (let i = 0; i < TICKS; i++) poses.push(limb(-0.9 * Math.sin(i * 0.017)));
const poseHash = h(poses.map((p) => p[1].b.map((v) => v.toExponential(17)).join(",")).join("|"));

const f = new FleshSph(limb(0), { count: COUNT, seed: 20250716 });
for (let i = 0; i < TICKS; i++) f.step(poses[i]);

// toExponential(17) prints every bit of a double. toFixed() would round the disagreement away and print a
// reassuring match -- which is the failure this whole test exists to avoid.
const state = f.world.particles.map((p) => p.x.toExponential(17) + "," + p.y.toExponential(17) + "," + p.z.toExponential(17)).join("|");

console.log("");
console.log("  arch      " + process.arch + " / " + os.platform() + "   node " + process.version);
console.log("  pose      " + poseHash + "    <- the fixture (uses Math.sin/cos: a known contaminant)");
console.log("  spacing   " + f.spacing.toExponential(17) + "   <- from Math.cbrt: THE KNOWN HOLE");
console.log("  h         " + f.h.toExponential(17));
console.log("  FLESH     " + h(state) + "    <- " + TICKS + " ticks, " + f.seeded + " particles");
console.log("");
console.log("  Run on both machines. If FLESH matches, the SPH flesh is bit-identical across instruction sets.");
console.log("  If it differs but `spacing` also differs, it is Math.cbrt and not the physics.");
console.log("  If `spacing` matches and FLESH differs, something else is unpinned and this is a real bug.");
