// FILE: rig/templates/kaijuWinged.js
// VERSION: v1 (v833 — winged kaiju rig)
//
// Flying kaiju (dragon, draconid, leviathan-with-wings). Wings replace
// arms; the wing-tips serve double duty as claw_l/claw_r for attacks
// that grab/slash (many dragon designs have claws at the wing apex).
// Hind legs are normal for landing.
//
// Hierarchy:
//
//   root
//   └─ pelvis
//      ├─ chest → neck → head → {mouth, eye, horn}
//      ├─ chest → wing_shoulder_l → wing_upper_l → wing_mid_l → wing_tip_l (=claw_l)
//      ├─ chest → wing_shoulder_r → wing_upper_r → wing_mid_r → wing_tip_r (=claw_r)
//      ├─ thigh_l → shin_l → foot_l
//      ├─ thigh_r → shin_r → foot_r
//      └─ tail_base → tail_mid → tail_tip
//
// ~25u tall standing, ~40u wingspan when extended.

export const KAIJU_WINGED_RIG = {
    name: "kaiju_winged_template",
    bones: [
        { id: "root",              position: [0,   0,    0], parent: -1 },
        { id: "pelvis",            position: [0,  10,    0], parent: "root" },
        { id: "chest",             position: [0,  16,    2], parent: "pelvis" },
        { id: "neck",              position: [0,  19,    4], parent: "chest" },
        { id: "head",              position: [0,  21,    6], parent: "neck" },
        { id: "mouth",             position: [0,  20,    8], parent: "head" },
        { id: "eye",               position: [0,  22,    7], parent: "head" },
        { id: "horn",              position: [0,  23,    6], parent: "head" },
        // Left wing (3 segments + tip; wing extends outward in +X then up)
        { id: "wing_shoulder_l",   position: [-3, 17,    0], parent: "chest" },
        { id: "wing_upper_l",      position: [-8, 19,   -1], parent: "wing_shoulder_l" },
        { id: "wing_mid_l",        position: [-14, 22,  -2], parent: "wing_upper_l" },
        { id: "wing_tip_l",        position: [-20, 24,  -3], parent: "wing_mid_l" },
        { id: "claw_l",            position: [-20, 24,  -3], parent: "wing_tip_l" },   // alias — same world pos as wing tip
        // Right wing
        { id: "wing_shoulder_r",   position: [3,  17,    0], parent: "chest" },
        { id: "wing_upper_r",      position: [8,  19,   -1], parent: "wing_shoulder_r" },
        { id: "wing_mid_r",        position: [14, 22,   -2], parent: "wing_upper_r" },
        { id: "wing_tip_r",        position: [20, 24,   -3], parent: "wing_mid_r" },
        { id: "claw_r",            position: [20, 24,   -3], parent: "wing_tip_r" },
        // Hind legs
        { id: "thigh_l",           position: [-2,  7,    0], parent: "pelvis" },
        { id: "shin_l",            position: [-2,  3,    0], parent: "thigh_l" },
        { id: "foot_l",            position: [-2, 0.5,   1], parent: "shin_l" },
        { id: "thigh_r",           position: [2,   7,    0], parent: "pelvis" },
        { id: "shin_r",            position: [2,   3,    0], parent: "thigh_r" },
        { id: "foot_r",            position: [2,  0.5,   1], parent: "shin_r" },
        // Tail
        { id: "tail_base",         position: [0,   9,   -4], parent: "pelvis" },
        { id: "tail_mid",          position: [0,   6,   -9], parent: "tail_base" },
        { id: "tail_tip",          position: [0,   3,  -14], parent: "tail_mid" },
    ],
};
