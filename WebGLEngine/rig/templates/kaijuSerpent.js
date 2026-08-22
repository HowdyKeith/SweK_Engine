// FILE: rig/templates/kaijuSerpent.js
// VERSION: v1 (v833 — serpentine kaiju rig)
//
// Snake / eel / kraken-arm style. Linear chain of body segments, no
// limbs. Bones with "claw_*" / "foot_*" / "shoulder_*" names are
// intentionally omitted — attacks that route to those bones fall back
// to bot center via getBoneWorldPos returning null. Anatomically
// correct for serpents (no hands to gesture with).
//
// Hierarchy:
//
//   root
//   └─ body_0
//      └─ body_1
//         └─ body_2
//            └─ body_3
//               └─ body_4
//                  └─ body_5
//                     └─ neck
//                        └─ head → {mouth, eye, horn}
//   tail at the OTHER end of the chain isn't separately modeled;
//   body_0 is the tail-tip end, head is the front end.
//
// ~40u long. Body bends in S-curves; segment density (8 bones) gives
// smooth motion at the cost of an extra few joint matrix uploads.

export const KAIJU_SERPENT_RIG = {
    name: "kaiju_serpent_template",
    bones: [
        { id: "root",     position: [0,   4,   0], parent: -1 },
        { id: "body_0",   position: [0,   4,  -4], parent: "root" },     // tail-tip end
        { id: "body_1",   position: [0,   4,  -2], parent: "body_0" },
        { id: "body_2",   position: [0,   4,   2], parent: "body_1" },
        { id: "body_3",   position: [0,   4,   6], parent: "body_2" },
        { id: "body_4",   position: [0,   4,  10], parent: "body_3" },
        { id: "body_5",   position: [0,   4,  14], parent: "body_4" },
        { id: "neck",     position: [0,   6,  18], parent: "body_5" },
        { id: "head",     position: [0,   7,  22], parent: "neck" },
        { id: "mouth",    position: [0,   6,  24], parent: "head" },
        { id: "eye",      position: [0,   8,  23], parent: "head" },
        { id: "horn",     position: [0,   9,  22], parent: "head" },
        // Tail-tip alias for attacks that target the tail
        { id: "tail_tip", position: [0,   4,  -4], parent: "body_0" },
        // No claw_l/claw_r/foot_l/foot_r — caller's attack falls back
        // to bot center on these. Consistent with serpent anatomy.
    ],
};
