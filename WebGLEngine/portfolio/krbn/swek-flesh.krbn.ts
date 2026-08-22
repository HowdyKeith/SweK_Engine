// swek-flesh.krbn.ts — the SweK ragdoll with flesh on it, drawn.
//
// The full chain, and every link was verified separately before this file existed:
//   box3d rig (v2515 joints)  ->  physics/soft/boneField.js  ->  simulation/MarchingCubes.js  ->  OBJ  ->  Krbn
//
// The bones are the same eleven segments as ragdoll.html. The skin is a capsule field with a smooth-min blend of
// 0.16, marched on an 84-cell grid: 10,520 triangles. Nothing here is sculpted -- the surface is derived from the
// same numbers Box3D simulates.
import type { Camera } from "../../src/math/types.js";
import { Mesh } from "../../src/mesh/mesh-source.js";
import { parseOBJ } from "../../src/mesh/loaders.js";
import { Scene } from "../../src/scene/scene.js";
import { view } from "../../src/layout/index.js";
import { readFileSync } from "node:fs";

const cam: Camera = {
  eye: [3.5, 3.1, 1.3],
  target: [0, 0, 0.05],
  up: [0, 0, 1],
  projection: "perspective",
  scale: Math.PI / 4.4,
  viewport: { width: 760, height: 620 },
};

const scene = new Scene({
  svg: { background: "#faf9f5" },
  light: { direction: [-0.45, -0.5, -0.72] },
});

const obj = parseOBJ(readFileSync(new URL("./swek-flesh.obj", import.meta.url)));
scene.add(new Mesh(obj)).style({ wobble: 0.3, hatch: { mode: "cross", angle: 24 } });

export default view(scene, cam);
