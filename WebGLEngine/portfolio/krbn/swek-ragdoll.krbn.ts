// swek-ragdoll.krbn.ts — SweK Engine's actual ragdoll rig, drawn as a draftsman's figure.
//
// These are not decorative shapes: every position below is copied from ragdoll.html's BONES and JOINTS arrays, the
// same numbers Box3D simulates. SweK is Y-up and Krbn is Z-up, so the mapping is (x, y, z) -> (x, z, y).
//
// Why cylinders: a bone IS a segment with a radius, which is what a draftsman draws. The physics boxes are an
// implementation detail of the solver, not of the figure.
import type { Camera } from "../../src/math/types.js";
import { Scene } from "../../src/scene/scene.js";
import { sphere } from "../../src/primitives/quadric.js";
import { Cylinder } from "../../src/primitives/cylinder.js";
import { view } from "../../src/layout/index.js";

const BG = "#faf9f5";

// SweK's ragdoll stands at y ~= 4.4..7.6. Recentre on the chest and convert Y-up -> Z-up.
const P = (x: number, y: number, z: number): [number, number, number] => [x, z, y - 6.3];

const cam: Camera = {
  eye: [3.4, 3.0, 1.35],
  target: [0, 0, 0.05],
  up: [0, 0, 1],
  projection: "perspective",
  scale: Math.PI / 4.4,
  viewport: { width: 760, height: 620 },
};

const scene = new Scene({
  svg: { background: BG },
  light: { direction: [-0.45, -0.5, -0.72] },
});

// --- the spine: pelvis -> chest -> head. The weld joints in the rig, drawn as one continuous run. -------------
scene.add(new Cylinder(P(0, 5.8, 0), [0, 0, 0.92], 0.3))          // pelvis + chest
  .style({ wobble: 0.32, hatch: { mode: "cross", angle: 22 } });
scene.add(sphere(P(0, 7.32, 0), 0.245))                            // head
  .style({ wobble: 0.3, hatch: { mode: "cross", angle: 35 } });
scene.add(new Cylinder(P(0, 6.94, 0), [0, 0, 0.2], 0.085))         // neck
  .style({ wobble: 0.28 });

// --- arms: spherical shoulders (90 deg cone), revolute elbows that stop ---------------------------------------
for (const s of [-1, 1]) {
  scene.add(new Cylinder(P(s * 0.42, 6.72, 0), [s * 0.62, 0, 0], 0.135))    // upper arm
    .style({ wobble: 0.3, hatch: { mode: "single", angle: 40 } });
  scene.add(new Cylinder(P(s * 1.06, 6.72, 0), [s * 0.7, 0, 0], 0.105))     // forearm
    .style({ wobble: 0.3, hatch: { mode: "single", angle: 40 } });
  scene.add(sphere(P(s * 0.42, 6.72, 0), 0.115))                            // the shoulder joint itself
    .setImportance(0.85, { role: "focus" });
  scene.add(sphere(P(s * 1.06, 6.72, 0), 0.09))                             // the elbow
    .setImportance(0.85, { role: "focus" });
}

// --- legs: 60 deg hip cones, knees that bend ONE way ----------------------------------------------------------
for (const s of [-1, 1]) {
  scene.add(new Cylinder(P(s * 0.22, 5.76, 0), [0, 0, -0.84], 0.155))       // thigh
    .style({ wobble: 0.3, hatch: { mode: "single", angle: 65 } });
  scene.add(new Cylinder(P(s * 0.22, 4.88, 0), [0, 0, -0.84], 0.125))       // shin
    .style({ wobble: 0.3, hatch: { mode: "single", angle: 65 } });
  scene.add(sphere(P(s * 0.22, 5.76, 0), 0.125))                            // hip
    .setImportance(0.85, { role: "focus" });
  scene.add(sphere(P(s * 0.22, 4.88, 0), 0.1))                              // knee
    .setImportance(0.85, { role: "focus" });
}

// --- the ground the rig falls onto. Context, so Krbn quietens it rather than competing with the figure. -------
scene.add(new Cylinder(P(0, 4.02, 0), [0, 0, 0.02], 2.5))
  .setImportance(0.18, { role: "context" });

export default view(scene, cam);
