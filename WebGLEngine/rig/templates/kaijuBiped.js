// FILE: rig/templates/kaijuBiped.js
// VERSION: v1 (v830 — standard kaiju biped rig)
//
// Canonical bone names used by KAIJU_ATTACKS.originBone routing. When a
// kaiju mesh is bridged with this rig (or any rig sharing these names),
// attacks resolve to the right body part automatically.
//
// Hierarchy (parent → children):
//
//   root
//   └─ pelvis
//      ├─ chest
//      │  ├─ head
//      │  │  ├─ mouth
//      │  │  ├─ eye             (single eye for cyclops kaiju; pluralize for two-eyed)
//      │  │  └─ horn            (optional crest/horn)
//      │  ├─ shoulder_l → arm_l → claw_l
//      │  └─ shoulder_r → arm_r → claw_r
//      ├─ thigh_l → shin_l → foot_l
//      ├─ thigh_r → shin_r → foot_r
//      └─ tail_base → tail_mid → tail_tip
//
// Coordinates assume a ~30u-tall kaiju standing on the +X/+Z plane with
// the root at origin and head at +Y. Scale at apply-time to fit specific
// kaiju assets (a small water kaiju vs. a sky-scraper hell kaiju).

export const KAIJU_BIPED_RIG = {
    name: "kaiju_biped_template",
    bones: [
        { id: "root",       position: [0,    0,   0], parent: -1 },
        { id: "pelvis",     position: [0,   14,   0], parent: "root" },
        { id: "chest",      position: [0,   20,   0], parent: "pelvis" },
        { id: "head",       position: [0,   26,   0], parent: "chest" },
        { id: "mouth",      position: [0,   24, 1.2], parent: "head" },
        { id: "eye",        position: [0, 26.5, 1.5], parent: "head" },
        { id: "horn",       position: [0,   28,   0], parent: "head" },
        { id: "shoulder_l", position: [-3,  22,   0], parent: "chest" },
        { id: "arm_l",      position: [-5,  18,   0], parent: "shoulder_l" },
        { id: "claw_l",     position: [-6,  14,   0], parent: "arm_l" },
        { id: "shoulder_r", position: [3,   22,   0], parent: "chest" },
        { id: "arm_r",      position: [5,   18,   0], parent: "shoulder_r" },
        { id: "claw_r",     position: [6,   14,   0], parent: "arm_r" },
        { id: "thigh_l",    position: [-2,  10,   0], parent: "pelvis" },
        { id: "shin_l",     position: [-2,   5,   0], parent: "thigh_l" },
        { id: "foot_l",     position: [-2, 0.5,   1], parent: "shin_l" },
        { id: "thigh_r",    position: [2,   10,   0], parent: "pelvis" },
        { id: "shin_r",     position: [2,    5,   0], parent: "thigh_r" },
        { id: "foot_r",     position: [2,  0.5,   1], parent: "shin_r" },
        { id: "tail_base",  position: [0,   14,  -2], parent: "pelvis" },
        { id: "tail_mid",   position: [0,   10,  -6], parent: "tail_base" },
        { id: "tail_tip",   position: [0,    8, -10], parent: "tail_mid" },
    ],
};

/**
 * Convenience: scale all bone positions by a factor (so a single template
 * fits kaiju of different sizes without re-authoring).
 */
export function scaleRig(rig, factor) {
    return {
        name: rig.name + "_x" + factor.toFixed(2),
        bones: rig.bones.map(b => ({
            id: b.id,
            position: [b.position[0]*factor, b.position[1]*factor, b.position[2]*factor],
            parent: b.parent,
        })),
    };
}

/**
 * Convenience: register the template with the asset library so it shows
 * up in the rig picker. Returns the asset id.
 */
export async function installKaijuBipedTemplate() {
    if (!window.assetLibrary?.add) return { error: "assetLibrary not available" };
    return await window.assetLibrary.add({
        name: "kaiju_biped_template",
        type: "rig",
        source: "kaiju-template",
        data: KAIJU_BIPED_RIG,
        tags: ["kaiju", "biped", "template"],
        notes: "Standard kaiju biped rig — bone names match KAIJU_ATTACKS.originBone routing.",
    });
}
