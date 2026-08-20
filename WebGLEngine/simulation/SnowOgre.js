// FILE: simulation/SnowOgre.js
// VERSION: v1 — SNOW/ICE OGRE variant spec + plow-and-gate behaviour
//
// #1 — SNOW_OGRE_LOADOUT: the variant as DATA, shaped like OgreScenario's
//      variant + hardpoint records so it can be folded into that file's VARIANTS
//      table (~line 589) and HARDPOINTS (gated by variantSpecial:"snow", like the
//      existing flying_demons gating). The cosmetic meshes (skis, plow, jets) are
//      separate renderer kinds to register in-app — NOT done here.
//
// #2 — SnowOgrePlow: the behaviour that makes it feel like the concept. Each
//      step it plows an ICE ribbon AHEAD (via FreezeSystem.iceStrip — the
//      inverse of the OGRE's ASH track-marks) and reports whether the chassis is
//      ON ice/snow (→ full speed) or off it (→ crawl). To ENFORCE the speed gate,
//      OgreScenario's chassis move-step must multiply its SPEED by the returned
//      speedMul — that one-line consume is the in-app integration point.

import { VOXEL } from "../world/voxelFormat.js";

export const SNOW_OGRE_LOADOUT = {
    id: "snow_mk1",
    label: "Snow OGRE (MK-S)",
    variantSpecial: "snow",
    kind: "ogre_hull",
    hp: 320,
    speed: 0.45,                  // crawls — jet-propelled but ~7000 t
    scale: 5.0,
    onIceOnly: true,
    crawlSpeedMul: 0.25,          // off-ice movement penalty
    plow: { width: 7, length: 10, glow: true },   // heated front plow: lays ice + shields
    hardpoints: [
        { id: "weather_dev_l", label: "weather device (L)", hp: 35, effect: "weather",         kind: "ogre_hp_weather",   note: "alive → snowstorm" },
        { id: "weather_dev_r", label: "weather device (R)", hp: 35, effect: "weather",         kind: "ogre_hp_weather",   note: "alive → snowstorm" },
        { id: "snow_cannon",   label: "snowblower cannon",  hp: 50, effect: "disable_weapon",  kind: "ogre_hp_snowcannon", weapon: "snowball" },
        { id: "snow_flamer",   label: "snow flamethrower",  hp: 40, effect: "disable_weapon",  kind: "ogre_hp_snowflamer", weapon: "snowspray" },
        { id: "ice_mg_l",      label: "ice machine gun (L)",hp: 22, effect: "slow_attack",     kind: "ogre_hp_icemg",      weapon: "icebullet" },
        { id: "ice_mg_r",      label: "ice machine gun (R)",hp: 22, effect: "slow_attack",     kind: "ogre_hp_icemg",      weapon: "icebullet" },
        { id: "jets",          label: "propulsion jets",    hp: 60, effect: "immobilize",      kind: "ogre_hp_jets" },
        { id: "plow_shield",   label: "heated plow / shield",hp: 90, effect: "expose_front",   kind: "ogre_hp_plow" },
    ],
};

const isIceOrSnow = (v) => v === VOXEL.ICE || v === VOXEL.SNOW;

export class SnowOgrePlow {
    constructor(world, freeze, opts = {}) {
        this.world = world;
        this.freeze = freeze;
        this.width    = opts.width    ?? SNOW_OGRE_LOADOUT.plow.width;
        this.length   = opts.length   ?? SNOW_OGRE_LOADOUT.plow.length;
        this.crawlMul = opts.crawlMul ?? SNOW_OGRE_LOADOUT.crawlSpeedMul;
        this.front    = opts.front    ?? 3;   // start the ribbon ahead of the chassis, not under it
    }

    _maxY() { return (this.world.chunks?.values?.().next?.().value?.height) ?? 64; }

    // is the surface directly under (x,z) ice or snow?
    onIce(x, z) {
        const w = this.world, maxY = this._maxY();
        x = Math.round(x); z = Math.round(z);
        for (let y = maxY - 1; y >= 1; y--) {
            const v = w.voxelAt(x, y, z);
            if (v !== VOXEL.AIR) return isIceOrSnow(v);
        }
        return false;
    }

    // Step once for an OGRE at (x,z) facing yaw: plow ice AHEAD + report the gate.
    update({ x, z, yaw = 0 }) {
        let laid = 0;
        if (this.freeze?.iceStrip) {
            const fx = Math.sin(yaw), fz = -Math.cos(yaw);    // forward (yaw 0 → -Z)
            laid = this.freeze.iceStrip({ x: x + fx * this.front, z: z + fz * this.front, yaw, width: this.width, length: this.length }).laid;
        }
        const on = this.onIce(x, z);
        return { laid, onIce: on, speedMul: on ? 1 : this.crawlMul };
    }
}
