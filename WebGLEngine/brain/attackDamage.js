// attackDamage.js -- damage lookup for reward shaping (SweK GPU Brain v4).
// EXTRACTED programmatically from world/kaijuAttacks.js (v1985) -- these
// are the real registry values, not estimates. Kept as a brain-side table
// because the Deno process cannot import engine modules across the bridge.
// Regenerate when the registry's damage numbers change (one-liner in the
// pack NOTES). Unknown attacks fall back to 0.3 in the trainer.
export const KAIJU_ATTACK_DAMAGE = {
    lightning: 0.05, fireball: 0.45, plasma: 0.55, ice_ray: 0.04,
    rad_pulse: 0.08, rock_spike: 0.25, tidal_wave: 0.35, deluge: 0.1,
    typhoon: 0.2, plague: 0.06, ion_lance: 0.06, flamethrower: 0.1,
    machinegun_volley: 0.04, meteor: 0.75, soul_drain: 0.18,
    shadow_bolt: 0.55, geyser: 0.2, hell_curse: 0.14, tremor: 0.32,
    swarm_volley: 0.18, shockwave: 0.18, magic_orb: 0.42,
    acid_spit: 0.22, sonic_scream: 0.2, emp_burst: 0.08,
    tractor_beam: 0.05, earthshake: 0.3,
};
