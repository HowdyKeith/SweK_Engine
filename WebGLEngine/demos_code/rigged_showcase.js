// FILE: demos_code/rigged_showcase.js
// VERSION: v440 — procedural-rig showcase.
//
// Generates a rigged fish, eel, and kaiju right in front of the camera and
// lets them animate in place so the spine-rig + baked clips are visible up
// close. Thin wrapper over the console rig API (window.rig.demo()).

let _ids = [];

export default {
    id:    "rigged_showcase",
    label: "RIGGED SHOWCASE (fish · eel · kaiju)",
    hint:  "Auto-rigs a fish, eel, and kaiju on a clean empty stage — no kaiju world behind them",
    isolation: "exclusive",   // v442 — clean stage: hide the voxel world + pause the kaiju sim
    controls: [
        "Auto — three rigged creatures appear on an empty stage, animating in place",
        "Fish swims, eel undulates with more wave cycles, kaiju writhes",
        "Built from autoSpineRig.js — same rig that makes the live kaiju move",
    ],

    start(ctx) {
        const rig = (typeof window !== "undefined") ? window.rig : null;
        if (!rig || typeof rig.demo !== "function") {
            console.warn("[rigged_showcase] window.rig not ready yet — try again in a moment");
            return;
        }
        _ids = rig.demo() || [];
    },

    tick() { /* clips animate themselves; nothing to drive per-frame */ },

    stop(ctx) {
        const router = ctx?.router || (typeof window !== "undefined" ? window._router : null);
        for (const id of _ids) {
            try { ctx?.despawn ? ctx.despawn(id) : router?.exec?.({ type: "entity:despawn", id }); } catch {}
        }
        _ids = [];
        try { if (window.rig) window.rig.stop(); window._rigShowcase = []; } catch {}
    },
};
