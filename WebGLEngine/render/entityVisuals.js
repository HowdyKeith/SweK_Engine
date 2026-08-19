// FILE: render/entityVisuals.js
// VERSION: v3 — kaiju + civ kind awareness
//
// v3 changes:
//   * kaiju_<kind> kinds map to the per-kind color from kaijuKinds —
//     hell glows orange, sky glows red, etc. Used when a kaiju has a
//     loaded GLB and renders via EntityMeshRenderer.
//   * civ_<style> kinds get a uniform pale-stone tint; per-instance
//     hue variation comes from civ id which lives outside this map.

export const ENTITY_COLORS = {
    player: [0.20, 1.00, 0.40, 1.0],
    enemy:  [1.00, 0.30, 0.30, 1.0],
    prop:   [0.60, 0.75, 1.00, 1.0],
    other:  [0.85, 0.85, 0.85, 1.0],
};

// Kaiju kind colors — match kaijuKinds.js base colors so
// mesh-rendered kaiju look like their obelisk counterparts.
const KAIJU_KIND_COLORS = {
    "kaiju_sky":         [1.00, 0.15, 0.15, 1.0],
    "kaiju_space":       [0.65, 0.50, 1.00, 1.0],
    "kaiju_cave":        [0.45, 0.30, 0.18, 1.0],
    "kaiju_underground": [0.55, 0.38, 0.18, 1.0],
    "kaiju_water":       [0.20, 0.55, 0.85, 1.0],
    "kaiju_hell":        [1.00, 0.40, 0.05, 1.0],
};

// Civ style — uniform stone tint. Per-civ identity color rides on the
// instance via spawnMesh (when the manager fills it in from civHueRGB).
const CIV_STYLE_COLOR = [0.85, 0.85, 0.80, 1.0];   // pale weathered stone

// Tree kinds — used by world/treeSpawner.js. Falls back to colored
// cube when the GLB isn't loaded; with these tints the cubes read
// as tree-shaped placeholders rather than random hue dots.
const TREE_COLORS = {
    "tree_oak":   [0.30, 0.55, 0.20, 1.0],   // forest green
    "tree_pine":  [0.20, 0.40, 0.25, 1.0],   // darker pine
    "tree_palm":  [0.55, 0.60, 0.30, 1.0],   // tan-green palm
};

// Round 30 — kaiju ranged-attack projectiles. Falls back to colored
// cube when the GLB isn't loaded.
// v769 — expanded to cover all v767 KAIJU_ATTACKS registry projectile
// kinds so each named attack reads as a distinct streak in the air.
// Colors match the registry's `color` hint where one exists.
const PROJECTILE_COLORS = {
    "fireball":    [1.00, 0.45, 0.10, 1.0],   // bright orange-red
    "plasma_orb":  [0.55, 0.85, 1.00, 1.0],   // electric cyan-blue (engine canonical)
    "rock_spike":  [0.55, 0.50, 0.45, 1.0],   // dusty stone
    "stone_chunk": [0.55, 0.55, 0.55, 1.0],   // round 27 civ counter
    // v769 — new from round 30 expansion
    "magic_orb":   [0.63, 0.31, 1.00, 1.0],   // arcane purple
    "frost_shard": [0.63, 0.91, 1.00, 1.0],   // pale ice cyan
    "acid_glob":   [0.50, 1.00, 0.13, 1.0],   // sickly toxic green
    "quill":       [0.50, 0.38, 0.25, 1.0],   // brown bristle
    "bullet":      [1.00, 0.82, 0.25, 1.0],   // tracer yellow
};

export function colorFor(kind, entityId) {
    if (KAIJU_KIND_COLORS[kind]) return KAIJU_KIND_COLORS[kind];
    if (TREE_COLORS[kind])       return TREE_COLORS[kind];
    if (PROJECTILE_COLORS[kind]) return PROJECTILE_COLORS[kind];
    if (kind && kind.startsWith("civ_")) return CIV_STYLE_COLOR;
    // OGRE arc: defender + selected-defender + HQ + the OGRE itself
    if (kind === "ogre_minion")       return [0.95, 0.30, 0.55, 1.0];
    if (kind === "ogre_drone")        return [0.55, 0.95, 1.00, 1.0];
    if (kind === "ogre_drop")         return [0.95, 0.85, 0.45, 1.0];
    if (kind === "ogre_shard")        return [1.00, 0.55, 0.85, 1.0];   // pink-magenta shard
    // Round 9 — hard points
    if (kind === "ogre_hp_weapon")    return [1.00, 0.45, 0.20, 1.0];
    if (kind === "ogre_hp_engine")    return [1.00, 0.65, 0.20, 1.0];
    if (kind === "ogre_hp_tech")      return [0.50, 0.90, 1.00, 1.0];
    if (kind === "ogre_hp_sensor")    return [0.40, 1.00, 0.85, 1.0];
    // Round 106 — underside anti-personnel weapon, downward-pointing
    if (kind === "ogre_hp_underside") return [0.85, 0.35, 0.15, 1.0];
    // Round 106 — sub-OGRE hover jet thruster, glowy cyan exhaust
    if (kind === "ogre_hover_jet")    return [0.20, 0.65, 1.00, 1.0];
    // Round 107 — jet engine + demon propulsion variants
    if (kind === "ogre_jet_engine")   return [1.00, 0.55, 0.20, 1.0];
    if (kind === "ogre_demon")        return [0.60, 0.10, 0.12, 1.0];
    // Round 110 — defender garage (pre-laid defense structure at each
    // slot position). Concrete-gray bunker color, slightly desaturated
    // to read as built-environment rather than vehicle armor.
    if (kind === "defender_garage")   return [0.42, 0.42, 0.40, 1.0];
    // Round 111 — defender airport (pre-laid structure near HQ that
    // periodically launches defender planes). Slightly bluer + paler
    // than garages so it reads as a control-tower / hangar rather
    // than a bunker.
    if (kind === "defender_airport")  return [0.55, 0.60, 0.65, 1.0];
    // Round 111 — defender plane (counter to OGRE incursion). Slightly
    // off-white military gray with a hint of blue; sits visually
    // between defender ground turrets and the sky.
    if (kind === "defender_plane")    return [0.78, 0.82, 0.88, 1.0];
    // Round 112 — defender naval dock (sea env counterpart to airport).
    // Steel-blue with rust tones. Submarine launch pad near HQ.
    if (kind === "defender_dock")     return [0.38, 0.45, 0.52, 1.0];
    // Round 112 — defender submarine PERISCOPE (only visible part above
    // water; the hull stays submerged). Dark steel-gray, very subtle so
    // it reads as "something underwater" not a target tower.
    if (kind === "defender_sub_periscope") return [0.22, 0.25, 0.30, 1.0];
    // Round 113 — OGRE-side ESCORT SUB periscope. Launched from mk10
    // sub-OGRE; hunts defender subs. Dark RED tint (vs defender's
    // gray) so the two sides are immediately distinguishable at
    // periscope-only visibility.
    if (kind === "ogre_escort_sub_periscope") return [0.45, 0.10, 0.10, 1.0];
    // Round 114 — minefield marker. Hidden until OGRE within reveal
    // distance (10u). Dark warning-red so revealed mines are obvious
    // from a distance — the player can see them and choose to detour
    // or shoot them out from range.
    if (kind === "mine_marker")       return [0.78, 0.20, 0.18, 1.0];
    // Round 120 — defender drone depot (counter-air structure paired
    // with airport). Smaller than airport; darker olive-green to read
    // as a tactical bunker rather than a runway.
    if (kind === "defender_depot")    return [0.32, 0.42, 0.30, 1.0];
    // Round 120 — defender drone (small fast patrol). Pale blue body
    // with cyan accent reads as "friendly tech" at a glance.
    if (kind === "defender_drone")    return [0.70, 0.85, 0.95, 1.0];
    if (kind === "ogre_turret")       return [0.55, 0.55, 0.60, 1.0];   // round 16 — gunmetal turret
    if (kind === "ogre_cannon")       return [0.30, 0.30, 0.32, 1.0];   // round 16 — dark barrel
    if (kind === "ogre_hull")         return [0.34, 0.36, 0.40, 1.0];   // round 102 — gunmetal blue-grey hull
    if (kind === "ogre_tread")        return [0.18, 0.18, 0.20, 1.0];   // round 16 — black tread
    if (kind === "ogre_scanner_dish") return [0.85, 0.95, 1.00, 1.0];   // round 17 — pale blue dish
    if (kind === "ogre_spotlight")    return [1.00, 1.00, 0.85, 1.0];   // round 17 — warm white spotlight
    if (kind === "ogre_hatch")        return [0.40, 0.42, 0.45, 1.0];   // round 17 — carrier hatch
    if (kind === "ogre_bay_door")     return [0.50, 0.52, 0.55, 1.0];   // round 17 — drone bay door
    if (kind === "ogre_coil")         return [0.55, 0.30, 1.00, 1.0];   // round 17 — magnetic coil purple
    if (kind === "ogre_shield_dome")        return [0.65, 0.75, 1.00, 1.0];  // round 18 — translucent blue
    if (kind === "ogre_phantom_emitter")    return [0.45, 0.20, 0.95, 1.0];  // round 18 — deep violet
    if (kind === "ogre_splitter_strut")     return [0.60, 0.35, 0.30, 1.0];  // round 18 — dark amber
    if (kind === "ogre_smoke_stack")        return [0.25, 0.25, 0.27, 1.0];  // round 18 — exhaust black
    if (kind === "ogre_antenna")            return [0.45, 0.45, 0.50, 1.0];  // round 21 — antenna whip
    if (kind === "ogre_ammo_belt")          return [0.55, 0.42, 0.18, 1.0];  // round 26 — brass belt
    if (kind === "ogre_hardpoint_dent")     return [0.10, 0.08, 0.08, 1.0];  // round 28 — dent decal
    if (kind === "battle_debris")           return [0.30, 0.28, 0.26, 1.0];  // round 28 — armor debris
    if (kind === "ogre_wreck_debris")       return [0.18, 0.16, 0.16, 1.0];  // round 28 — wreck debris
    if (kind === "cannon_shell")            return [0.85, 0.72, 0.30, 1.0];  // round 29 — brass shell
    if (kind === "napalm_bit")              return [1.00, 0.45, 0.10, 1.0];  // round 29 — sticky fire
    if (kind === "impact_reticle")          return [1.00, 0.92, 0.20, 1.0];  // round 32 — saturated yellow
    if (kind === "sea_mine")                return [0.18, 0.18, 0.20, 1.0];  // round 34 — dark naval mine
    if (kind === "mine_alarm_light")        return [1.00, 0.20, 0.15, 1.0];  // round 34 — saturated red beacon
    if (kind === "land_mine")               return [0.40, 0.45, 0.32, 1.0];  // round 36 — flat green-gray land mine
    if (kind === "ogre_ap_mine")            return [0.22, 0.20, 0.18, 1.0];  // round 36 — small dark AP mine (OGRE-side)
    if (kind === "ogre_submarine")          return [0.20, 0.24, 0.28, 1.0];  // round 36 — dark gunmetal submarine hull
    if (kind === "ogre_periscope")          return [0.32, 0.36, 0.36, 1.0];  // round 36 — periscope tube
    if (kind === "ogre_pd_turret")          return [0.34, 0.36, 0.40, 1.0];  // round 35 — gunmetal PD turret
    if (kind === "ogre_counter_drone")      return [0.85, 0.92, 1.00, 1.0];  // round 35 — chrome counter-drone
    if (kind === "ogre_ap_mine")            return [0.55, 0.25, 0.20, 1.0];  // round 36 — rust-red OGRE AP mine
    if (kind === "land_mine")               return [0.40, 0.55, 0.30, 1.0];  // round 36 — olive defender land mine
    if (kind === "civ_boat")                return [0.50, 0.30, 0.18, 1.0];  // round 38 — wooden civ boat hull
    if (kind === "defender_boat")           return [0.32, 0.42, 0.30, 1.0];  // round 41 — olive defender boat hull
    if (kind === "ogre_plane")              return [0.30, 0.32, 0.36, 1.0];  // round 38 — military gray plane
    if (kind === "earth_sky")               return [0.40, 0.65, 0.95, 1.0];  // round 38 — blue earth billboard
    if (kind === "boid")                    return [0.92, 0.78, 0.45, 1.0];  // round 39 — golden boid flock
    if (kind === "ogre_pilot")              return [0.85, 0.82, 0.50, 1.0];  // round 40 — flight-suit yellow
    if (kind === "ogre_parachute")          return [0.95, 0.30, 0.30, 1.0];  // round 40 — red rescue chute
    if (kind === "lunar_lander")            return [0.78, 0.82, 0.85, 1.0];  // round 41 — chrome lander
    if (kind === "lunar_flame")             return [1.00, 0.65, 0.20, 1.0];  // round 41 — orange thrust flame
    if (kind === "lorenz_tracer")           return [0.85, 0.95, 1.00, 1.0];  // round 41 — bright tracer dot
    if (kind === "defender_corpse")         return [0.20, 0.18, 0.22, 1.0];  // round 22 — dark corpse marker
    if (kind === "ogre_wreck")              return [0.15, 0.13, 0.13, 1.0];  // round 23 — scorched dead hulk
    if (kind === "civ_missile")       return [0.85, 0.85, 0.95, 1.0];
    if (kind === "shadow_bolt")       return [0.45, 0.10, 0.65, 1.0];   // round 15
    if (kind === "civ_ruin")          return [0.30, 0.28, 0.28, 1.0];   // round 15 — ash-gray ruin marker
    if (kind === "hellspawn_portal")  return [1.00, 0.20, 0.45, 1.0];   // round 15 — magenta portal
    // Round 127 — civ-summoner casters. Religious civs deploy a wizard
    // (white-gold robes, bright); militaristic civs deploy a tech
    // tank (gunmetal with red accents). Both spawn at the civ during
    // a hellspawn-summon, channeling between the two portals.
    if (kind === "caster_wizard")     return [0.95, 0.88, 0.55, 1.0];   // pale gold
    if (kind === "caster_tank")       return [0.45, 0.28, 0.28, 1.0];   // dark blood-iron
    // Round 128 — personality-themed portals. Holy = white-gold for
    // religious civs; tech = gunmetal cyan for militaristic civs.
    // Same scale + role as hellspawn_portal, distinct hue.
    if (kind === "portal_holy")       return [1.00, 0.95, 0.70, 1.0];   // white-gold
    if (kind === "portal_tech")       return [0.45, 0.70, 0.95, 1.0];   // gunmetal cyan
    // Round 129 — multiplayer ghost marker. Per-player tint is set by
    // the client via entity:setColorTint at spawn time using the
    // player's color (consistent across reconnects via id-hash). The
    // base color here is a neutral gray so the tint reads cleanly.
    if (kind === "remote_player_marker") return [0.85, 0.85, 0.90, 1.0];
    if (kind === "hellspawn_imp")     return [1.00, 0.45, 0.20, 1.0];   // round 15 — small hell imp
    if (kind === "civ_defender")      return [0.50, 0.85, 0.50, 1.0];   // round 15 — mobile civ defender
    if (kind === "defender")          return [0.40, 0.85, 1.00, 1.0];   // cool cyan
    if (kind === "defender_selected") return [0.45, 1.00, 0.55, 1.0];   // bright green
    // Round 48 — defender sub visuals. Was reusing ogre_submarine /
    // ogre_periscope which are enemy-themed; now defender-themed.
    if (kind === "defender_sub")       return [0.20, 0.32, 0.28, 1.0];  // dark olive hull
    if (kind === "defender_periscope") return [0.55, 0.95, 0.65, 1.0];  // pale-green tip
    // Round 50 — 3D centipede. Bright eye-stalk head, darker body.
    if (kind === "centipede_head")    return [0.85, 0.35, 0.20, 1.0];   // burnt orange (head + glowing eyes feel)
    if (kind === "centipede_body")    return [0.45, 0.20, 0.12, 1.0];   // dark rust segments
    if (kind === "centipede_leg")     return [0.32, 0.14, 0.08, 1.0];   // darker than body — leg chitin
    if (kind === "asteroids_ufo")     return [0.30, 0.95, 0.55, 1.0];   // v737 — bright green flying saucer
    if (kind === "asteroids_ufobullet") return [1.00, 0.30, 0.30, 1.0]; // v737 — red enemy bolt
    // v755/v756 — kaiju attacks city demo entity visuals. Tanks olive drab,
    // planes gunmetal grey, projectiles differentiated by source so the
    // viewer can tell tank shells (yellow) from plane bombs (black) from
    // kaiju plasma (purple) at a glance.
    if (kind === "tank_hull")         return [0.35, 0.40, 0.22, 1.0];   // olive drab hull
    if (kind === "tank_turret")       return [0.30, 0.34, 0.18, 1.0];   // slightly darker turret
    if (kind === "tank_barrel")       return [0.22, 0.24, 0.14, 1.0];   // dark olive barrel
    if (kind === "plane_fuselage")    return [0.55, 0.58, 0.62, 1.0];   // gunmetal
    if (kind === "plane_wing")        return [0.50, 0.53, 0.57, 1.0];
    if (kind === "plane_tail")        return [0.45, 0.48, 0.52, 1.0];
    if (kind === "tank_projectile")   return [1.00, 0.85, 0.20, 1.0];   // yellow tracer
    if (kind === "plane_bomb")        return [0.10, 0.10, 0.10, 1.0];   // black bomb
    if (kind === "kaiju_plasma")      return [0.85, 0.30, 1.00, 1.0];   // purple plasma orb
    // v757 — beam attack beads (electric magenta-pink)
    if (kind === "kaiju_beam_bead")   return [1.00, 0.50, 0.95, 1.0];
    if (kind === "civilian_car")      return [0.30, 0.55, 0.80, 1.0];   // muted blue civilian
    // v757 — tiny pedestrians (boids-flocked). Warm tan so they stand out
    // against the olive tanks and gunmetal planes at small scale (0.18)
    if (kind === "city_pedestrian")   return [0.85, 0.68, 0.45, 1.0];
    if (kind === "ogre_hq")           return [1.00, 0.85, 0.20, 1.0];   // gold
    if (kind === "ogre_unit")         return [1.00, 0.40, 0.15, 1.0];   // angry red-orange
    if (kind === "ogre_target")       return [1.00, 1.00, 1.00, 0.6];   // white move marker
    if (kind === "ogre_slot")         return [0.85, 0.75, 0.30, 0.55];  // semi-transparent yellow ghost
    // Round 16 — life motes: small floating cubes above showcase
    // creatures. Per-id hue so each creature's mote has its own color.
    if (kind === "mote" && entityId != null) {
        return colorByEntityId(entityId);
    }
    if (entityId != null && (kind === "other" || kind === "prop")) {
        return colorByEntityId(entityId);
    }
    return ENTITY_COLORS[kind] || ENTITY_COLORS.other;
}

export function scaleFor(kind) {
    if (kind === "player") return 1.4;
    if (kind === "mote")   return 0.6;
    if (kind === "other" || kind === "prop") return 2.5;
    if (kind === "defender" || kind === "defender_selected") return 1.6;
    if (kind === "defender_sub")       return 2.4;       // round 48 — elongated hull
    if (kind === "defender_periscope") return 0.35;      // round 48 — slender stub
    // Round 50 — 3D centipede
    if (kind === "centipede_head")    return 1.2;
    if (kind === "centipede_body")    return 1.0;
    if (kind === "centipede_leg")     return 0.45;   // small slim leg
    if (kind === "ogre_slot")   return 1.4;
    if (kind === "ogre_minion") return 0.9;
    if (kind === "ogre_drone")  return 0.7;
    if (kind === "ogre_drop")   return 1.4;
    if (kind === "ogre_shard")  return 2.5;
    if (kind === "ogre_hp_weapon") return 0.9;
    if (kind === "ogre_hp_engine") return 1.0;
    if (kind === "ogre_hp_tech")   return 0.85;
    if (kind === "ogre_hp_sensor") return 0.7;
    // Round 106
    if (kind === "ogre_hp_underside") return 0.85;
    if (kind === "ogre_hover_jet")    return 1.0;
    // Round 107
    if (kind === "ogre_jet_engine")   return 1.4;
    if (kind === "ogre_demon")        return 1.0;
    // Round 110 — bunker-sized garage at defender slots. 3u cube reads
    // as a chunky concrete structure; defenders (~1u) appear next to
    // them in proportion.
    if (kind === "defender_garage")   return 3.0;
    // Round 111 — airport is larger than garages (control tower +
    // hangar combined into one block). 5u cube.
    if (kind === "defender_airport")  return 5.0;
    // Round 111 — plane scale matches the existing ogre_plane (1.2)
    // so airborne size feels balanced between the two sides.
    if (kind === "defender_plane")    return 1.2;
    // Round 112 — dock is slightly smaller than airport (4u) since
    // submarines are smaller assets than planes
    if (kind === "defender_dock")     return 4.0;
    // Round 112 — periscope is a thin tall stalk; matches existing
    // periscope visual for OGRE-side mk10 submarine
    if (kind === "defender_sub_periscope") return 0.5;
    // Round 113 — OGRE escort sub periscope same size as defender's
    if (kind === "ogre_escort_sub_periscope") return 0.5;
    // Round 120 — drone depot is a small bunker, 3u
    if (kind === "defender_depot")    return 3.0;
    // Round 120 — drone is small (0.7u baseline); spawning code passes
    // its own scale 0.7, the per-kind scale here multiplies further.
    if (kind === "defender_drone")    return 1.0;
    // Round 114 — mine marker: small ground-level bump
    if (kind === "mine_marker")       return 0.45;
    if (kind === "ogre_hull")      return 4.0;   // round 102 — matches variant.scale base
    if (kind === "ogre_hq")     return 4.0;
    if (kind === "ogre_unit")   return 5.0;
    if (kind === "ogre_target") return 0.8;
    return 1.0;
}

export function colorByEntityId(id) {
    const h = ((id * 137.5) % 360) / 360;
    return [..._hslToRgb(h, 0.65, 0.65), 1.0];
}

function _hslToRgb(h, s, l) {
    if (s === 0) return [l, l, l];
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    return [
        _hue2rgb(p, q, h + 1 / 3),
        _hue2rgb(p, q, h),
        _hue2rgb(p, q, h - 1 / 3),
    ];
}

function _hue2rgb(p, q, t) {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
}

// Round 12 — per-kind animation type for the entity vertex shader.
// Returns:
//   0    = no animation (defaults — defenders, slots, hardpoints, drops, markers)
//   1.0  = idle bob       — gentle vertical bob + side sway (kaiju, OGRE)
//   2.0  = breathing      — uniform pulsing scale (organic civs, minions)
//   3.0  = walking gait   — pitch oscillation (shards)
export function animFor(kind) {
    if (!kind) return 0;
    // Static / inanimate
    if (kind === "defender" || kind === "defender_selected") return 0;
    if (kind === "ogre_slot" || kind === "ogre_target")      return 0;
    if (kind === "ogre_hp_weapon" || kind === "ogre_hp_engine"
        || kind === "ogre_hp_tech" || kind === "ogre_hp_sensor") return 0;
    if (kind === "ogre_hq" || kind === "ogre_drop")          return 0;
    // Round 16/17 — turret/cannon/variant-rig parts stay static. They get
    // their motion from the entity transform (yaw + position) updated by
    // OgreScenario each tick.
    if (kind === "ogre_turret" || kind === "ogre_cannon")    return 0;
    if (kind === "ogre_scanner_dish" || kind === "ogre_spotlight"
        || kind === "ogre_hatch" || kind === "ogre_bay_door"
        || kind === "ogre_coil")                              return 0;
    if (kind === "ogre_shield_dome" || kind === "ogre_phantom_emitter"
        || kind === "ogre_splitter_strut" || kind === "ogre_smoke_stack") return 0;
    if (kind === "ogre_antenna")                                          return 0;
    if (kind === "ogre_ammo_belt")                                        return 5;   // round 28 — scroll
    if (kind === "ogre_hardpoint_dent" || kind === "battle_debris"
        || kind === "ogre_wreck_debris")                                  return 0;
    if (kind === "cannon_shell" || kind === "napalm_bit")                 return 0;
    if (kind === "impact_reticle")                                        return 0;
    if (kind === "sea_mine" || kind === "mine_alarm_light")               return 0;
    if (kind === "land_mine" || kind === "ogre_ap_mine")                  return 0;   // round 36 — flat, no anim
    if (kind === "ogre_submarine" || kind === "ogre_periscope")           return 1.0; // round 36 — gentle bob
    // Round 48 — defender sub/periscope share the same gentle bob anim
    if (kind === "defender_sub" || kind === "defender_periscope")         return 1.0;
    // Round 50 — centipede: slight bob on head, none on body (body bob is
    // handled procedurally in Centipede.tick so it sine-waves down the chain)
    if (kind === "centipede_head")                                        return 1.5;
    if (kind === "centipede_body")                                        return 0;
    if (kind === "centipede_leg")                                         return 0;
    if (kind === "ogre_pd_turret")                                        return 0;   // round 35 — aim controlled by scenario
    if (kind === "ogre_counter_drone")                                    return 2.0; // round 35 — small hover pulse
    if (kind === "ogre_ap_mine" || kind === "land_mine")                  return 0;   // round 36 — static
    if (kind === "civ_boat")                                              return 0;   // round 38 — bob done in scenario
    if (kind === "ogre_plane")                                            return 0;   // round 38 — yaw controlled by scenario
    if (kind === "earth_sky")                                             return 0;   // round 38 — slow spin via scenario yaw
    if (kind === "boid")                                                  return 4.0; // round 39 — wing flutter
    if (kind === "ogre_pilot")                                            return 1.5; // round 40 — flailing limbs
    if (kind === "ogre_parachute")                                        return 0;   // round 40 — yaw set by scenario
    if (kind === "lunar_lander")                                          return 0;   // round 41 — pose controlled by scenario
    if (kind === "lunar_flame")                                           return 4.0; // round 41 — flicker
    if (kind === "lorenz_tracer")                                         return 0;   // round 41 — pure trajectory
    if (kind === "defender_corpse" || kind === "ogre_wreck")              return 0;
    // Round 16 — treads roll continuously while OGRE is moving.
    // Round 95 — was anim mode 4 (X-axis rotation = wheel-spin, which
    // made the cube treads tumble end-over-end). Now mode 5 (Z-axis
    // belt scroll, same one ammo belt uses), which shifts the whole
    // tread mesh forward/backward by ±0.06u in a sawtooth, giving a
    // belt-conveyor feel on the new procedural plate-with-bumps
    // mesh from gpu/hardpointMeshes.js.
    if (kind === "ogre_tread")                                return 5.0;
    // Round 102 — OGRE hull. Static — no bob. Tank chassis moves
    // rigidly with the OGRE position; idle bob would read as a
    // hovercraft, not a tracked vehicle.
    if (kind === "ogre_hull")                                return 0;
    // Walking gait — small bipedal feel
    if (kind === "ogre_shard" || kind === "ogre_minion")     return 3.0;
    // Drones — breathing pulse for hover effect
    if (kind === "ogre_drone")                                return 2.0;
    // Round 106 — hover jet thrusters pulse same as drones (mode 2 =
    // breathing scale animation). Reads as exhaust modulation.
    if (kind === "ogre_hover_jet")                            return 2.0;
    // Round 107 — jet engines pulse too (exhaust modulation)
    if (kind === "ogre_jet_engine")                           return 2.0;
    // Round 107 — demons get a quick bob (mode 1 idle bob, but
    // visible since they fly free of the chassis surface)
    if (kind === "ogre_demon")                                return 1.0;
    // Round 110 — garages are static buildings; no animation
    if (kind === "defender_garage")                           return 0;
    // Round 111 — airport is also static
    if (kind === "defender_airport")                          return 0;
    // Round 111 — defender plane: anim controlled by scenario (mirrors
    // ogre_plane pattern). Scenario sets yaw + tilt via entity:move
    if (kind === "defender_plane")                            return 0;
    // Round 112 — dock + periscope: static
    if (kind === "defender_dock")                             return 0;
    if (kind === "defender_sub_periscope")                    return 0;
    // Round 113 — OGRE escort sub periscope: static
    if (kind === "ogre_escort_sub_periscope")                 return 0;
    // Round 114 — mine marker: static (no idle animation)
    if (kind === "mine_marker")                               return 0;
    // Default: idle bob for kaiju + OGRE (kind="tech" etc) and any unknowns
    return 1.0;
}




// Round 33 — Blinn-Phong shininess exponent per kind. 0 = matte (no
// specular term). Higher = sharper highlight. Cannons + brass shells
// gleam strongest; chassis is mid; particle/effect kinds matte.
export function shininessFor(kind) {
    // Matte — terrain props, debris, corpses, smoke, fire, dust
    if (kind === "defender_corpse" || kind === "battle_debris"
        || kind === "ogre_wreck" || kind === "ogre_wreck_debris"
        || kind === "ogre_smoke_stack" || kind === "ogre_hardpoint_dent"
        || kind === "napalm_bit" || kind === "impact_reticle"
        || kind === "defender_garage" || kind === "defender_airport"  /* round 110-111 */
        || kind === "defender_dock"   || kind === "defender_sub_periscope" /* round 112 */
        || kind === "ogre_escort_sub_periscope"  /* round 113 */
        || kind === "mine_marker"                /* round 114 */
        )                                                         return 0;
    // Brass / polished metal — high specular
    if (kind === "cannon_shell" || kind === "ogre_ammo_belt") return 96;
    // Round 35 — counter-drone has bright chrome finish
    if (kind === "ogre_counter_drone")                       return 80;
    // Round 38 — plane chrome
    if (kind === "ogre_plane")                               return 64;
    // Round 111 — defender plane: same chrome gloss as ogre_plane
    if (kind === "defender_plane")                           return 64;
    // Round 120 — drone has a glossier finish than plane (smaller
    // shiny exterior reads better with more specular)
    if (kind === "defender_drone")                           return 80;
    // Round 38 — earth (slight gloss)
    if (kind === "earth_sky")                                return 8;
    // Round 38 — civ boat wood (matte)
    if (kind === "civ_boat")                                 return 4;
    // Cannon barrel / turret armor — pronounced specular
    if (kind === "ogre_cannon" || kind === "ogre_turret")    return 64;
    // Round 102 — OGRE main hull. Moderate specular: thick armor reads
    // matte-with-highlights rather than chrome-shiny.
    if (kind === "ogre_hull")                                return 40;
    // Round 35 — PD turret gunmetal
    if (kind === "ogre_pd_turret")                           return 48;
    // Chassis & rig parts — moderate
    if (kind === "ogre_tread" || kind === "ogre_antenna"
        || kind === "ogre_scanner_dish" || kind === "ogre_spotlight"
        || kind === "ogre_hatch" || kind === "ogre_bay_door"
        || kind === "ogre_coil")                              return 32;
    // Energy / dome / phantom — gentle bloom-ish highlight
    if (kind === "ogre_shield_dome" || kind === "ogre_phantom_emitter"
        || kind === "ogre_splitter_strut")                    return 16;
    // Round 48 — defender sub: wet hull gloss, periscope optic tip
    if (kind === "defender_sub")                              return 56;
    if (kind === "defender_periscope")                        return 72;
    // Round 50 — centipede: glossy chitin
    if (kind === "centipede_head")                            return 40;
    if (kind === "centipede_body")                            return 32;
    if (kind === "centipede_leg")                             return 28;
    // Default — mild specular for most things
    return 12;
}

// Round 180 — per-kind preferred final size after Trellis mesh swap.
// Trellis 2 outputs are in their own coordinate space — generated
// meshes can be fly-sized or building-sized at random. Without
// normalization, swapping a procedural kaiju for its Trellis mesh
// produces unpredictable scale. This table tells the loader's
// normalize step what "world size" to fit each kind to.
//
// Values are world units (the engine's voxel grid is 1 unit per cube).
// Reference points:
//   - Player capsule    ≈ 2 units tall
//   - Typical kaiju     ≈ 2.5-3.5 units tall
//   - Civ tower         ≈ 4-6 units tall
//   - Obelisk           ≈ 1 unit
//
// The normalize step fits each axis independently against the largest
// extent — so a tall thin kaiju stays tall and thin, just rescaled
// uniformly to the target. Aspect ratio is preserved.
export function targetSizeFor(kind) {
    // Sky / aerial — moths and birdlike forms want larger wingspan reads
    if (kind === "kaiju_sky")         return 4.0;
    // Hell / volcanic — imposing
    if (kind === "kaiju_hell")        return 3.5;
    // Space / electric — also imposing
    if (kind === "kaiju_space")       return 3.5;
    // Underground / cave / tech — typical kaiju size
    if (kind === "kaiju_underground") return 2.8;
    if (kind === "kaiju_cave")        return 3.0;
    if (kind === "kaiju_tech")        return 3.2;
    // Water — bulky but ground-bound on land
    if (kind === "kaiju_water")       return 3.0;
    // Civ architecture — much larger than kaiju
    if (kind === "civ_tower")         return 5.5;
    if (kind === "civ_step_pyramid")  return 6.0;
    if (kind === "civ_plaza")         return 4.0;
    if (kind === "civ_ring_wall")     return 5.0;
    if (kind === "civ_spire_field")   return 5.0;
    // Obelisks / small features
    if (kind === "obelisk")           return 1.2;
    // Default — typical kaiju
    return 2.5;
}

// EntityMeshRenderer when a parallax material set is bound for the
// kind. Values are the `uHeightScale` POM parameter — the maximum
// surface displacement in UV-relative units along the view direction.
//
// Tuning guide (calibrated against the built-in "Kaiju Classic Foes"
// theme's material output from SD 1.5):
//   0.03 — subtle: smooth, slick surfaces (metal, glass)
//   0.06 — moderate: most kinds, default fallback
//   0.10 — pronounced: rocky, bony, scaled
//   0.15 — deep: cratered, fissured, alien stone
//   0.20+ — extreme: only useful for tiled flat surfaces, breaks at
//                    grazing angles for organic meshes
//
// Engine entities are small in view (~10-50px tall at typical camera
// distance), so the visible parallax effect saturates faster than the
// preview pane suggests. Values here are LOWER than what looks good
// in the preview at 1:1 zoom.
export function heightScaleFor(kind) {
    // Mechanical / metallic — subtle, the surface IS the geometry
    if (kind === "kaiju_tech")        return 0.04;
    if (kind === "kaiju_sky")         return 0.05;   // moth wings — wing-veining
    // Crystalline / hard / rocky — pronounced
    if (kind === "kaiju_space")       return 0.10;   // electric scales/crystal
    if (kind === "kaiju_cave")        return 0.13;   // weathered stone, deep grooves
    if (kind === "kaiju_underground") return 0.11;   // bone/dirt/embedded debris
    // Hell / volcanic / cracked — deep displacement
    if (kind === "kaiju_hell")        return 0.14;   // lava cracks, crystal spines
    // Aqueous / blob — moderate, gives wet readouts
    if (kind === "kaiju_water")       return 0.08;
    // Civ surfaces — mostly architectural, moderate
    if (kind === "civ_tower"
     || kind === "civ_plaza"
     || kind === "civ_ring_wall"
     || kind === "civ_spire_field"
     || kind === "civ_step_pyramid")  return 0.07;
    // Default — moderate
    return 0.06;
}
