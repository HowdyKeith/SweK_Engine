// FILE: rig/templates/kaijuQuadruped.js
// VERSION: v1 (v833 — quadruped kaiju rig)
//
// 4-legged kaiju (dragon-on-all-fours, big lizard, beast). No separate
// arms — front feet are mapped to claw_l/claw_r so attacks that route
// to those bones (machinegun_volley, shadow_bolt, magic_orb) hit at
// the right body location.
//
// Hierarchy:
//
//   root
//   └─ pelvis
//      ├─ chest → neck → head → {mouth, eye, horn}
//      ├─ chest → front_shoulder_l → front_arm_l → claw_l (front foot)
//      ├─ chest → front_shoulder_r → front_arm_r → claw_r (front foot)
//      ├─ thigh_l → shin_l → foot_l (hind leg)
//      ├─ thigh_r → shin_r → foot_r (hind leg)
//      └─ tail_base → tail_mid → tail_tip
//
// ~30u long, ~15u tall at shoulder. Spine roughly horizontal (head
// forward, tail back).

export const KAIJU_QUADRUPED_RIG = {
    name: "kaiju_quadruped_template",
    bones: [
        { id: "root",              position: [0,   0,    0], parent: -1 },
        { id: "pelvis",            position: [0,   7,   -8], parent: "root" },
        { id: "chest",             position: [0,   8,    4], parent: "pelvis" },
        { id: "neck",              position: [0,  10,    8], parent: "chest" },
        { id: "head",              position: [0,  11,   12], parent: "neck" },
        { id: "mouth",             position: [0,  10,   14], parent: "head" },
        { id: "eye",               position: [0,  12,   13], parent: "head" },
        { id: "horn",              position: [0,  13,   12], parent: "head" },
        // Front legs (mapped to claw_l/claw_r for attack routing)
        { id: "front_shoulder_l",  position: [-3,  8,    4], parent: "chest" },
        { id: "front_arm_l",       position: [-3,  4,    4], parent: "front_shoulder_l" },
        { id: "claw_l",            position: [-3, 0.5,   5], parent: "front_arm_l" },
        { id: "front_shoulder_r",  position: [3,   8,    4], parent: "chest" },
        { id: "front_arm_r",       position: [3,   4,    4], parent: "front_shoulder_r" },
        { id: "claw_r",            position: [3,  0.5,   5], parent: "front_arm_r" },
        // Hind legs
        { id: "thigh_l",           position: [-3,  6,   -8], parent: "pelvis" },
        { id: "shin_l",            position: [-3,  3,   -8], parent: "thigh_l" },
        { id: "foot_l",            position: [-3, 0.5,  -7], parent: "shin_l" },
        { id: "thigh_r",           position: [3,   6,   -8], parent: "pelvis" },
        { id: "shin_r",            position: [3,   3,   -8], parent: "thigh_r" },
        { id: "foot_r",            position: [3,  0.5,  -7], parent: "shin_r" },
        // Tail (longer than biped — quadruped balance)
        { id: "tail_base",         position: [0,   6,  -12], parent: "pelvis" },
        { id: "tail_mid",          position: [0,   4,  -18], parent: "tail_base" },
        { id: "tail_tip",          position: [0,   2,  -24], parent: "tail_mid" },
    ],
};
