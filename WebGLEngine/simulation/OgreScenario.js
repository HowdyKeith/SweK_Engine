// FILE: simulation/OgreScenario.js
// VERSION: v11 — round 11 of the OGRE arc adds permanent track marks
//                + dedicated fire + plasma-field effect emitters
//
// Round 11 scope (new this round):
//   * Permanent track marks — OGRE voxel-mods terrain behind it as
//     it walks. Top surface voxel becomes ASH (id=6). Tracks persist
//     across the whole match.
//   * FireEmitter — sustained orange-yellow flames emitted from a
//     point for a configurable duration. Used by destroyed hardpoints
//     and OGRE engine after engine hardpoint is popped.
//   * Plasma field — sustained electric-blue glow used during MK VIII
//     Magnetic pulse + on splash impact craters. Looks like ionized air.

import { Kaiju } from "./Kaiju.js";
import { OgreArena } from "./OgreArena.js";
import { PathPlanner } from "./PathPlanner.js";              // round 206 — OGRE pathing
import { TURRET_GEOM } from "../render/turretRenderer.js";    // round 49 - tube tip math
// Round 321 — shared easing module.
import { easeOutCubic, easeOutQuad } from "./easing.js";

const HQ_POS    = { x: 0, z: -50 };
const OGRE_POS  = { x: 0, z:  50 };
const OGRE_REACHED_HQ_DIST = 5;
const OGRE_HIT_RADIUS = 3.0;

const OGRE_PHASE_2_HP_FRAC = 0.5;
const OGRE_PHASE_3_HP_FRAC = 0.2;
const OGRE_TRAMPLE_RADIUS = 4.0;
const OGRE_REAR_DAMAGE_MUL = 2.0;

const DRONE_HP = 14;
const DRONE_SPEED = 4.0;
const DRONE_ALTITUDE = 8;
const DRONE_LASER_DAMAGE = 4;
const DRONE_LASER_RANGE = 25;
const DRONE_LASER_INTERVAL = 1.6;
const SHIELD_HP_MK6 = 80;

const PHANTOM_CLOAK_DURATION = 4.0;
const PHANTOM_VISIBLE_DURATION = 4.0;
const MAGNETIC_PULSE_INTERVAL = 6.0;
const MAGNETIC_PULSE_DURATION = 2.0;

// Round 10 — splitter shards
const SHARD_HP = 70;
const SHARD_SPEED = 1.4;
const SHARD_SCALE = 2.5;
const SHARD_DAMAGE_TO_HQ = 35;
const SHARD_PLASMA_DAMAGE = 5;
const SHARD_PLASMA_INTERVAL = 3.0;
const SHARD_PLASMA_RANGE = 45;

// Round 10 — boss waves: every Nth wave is a buffed boss
const BOSS_WAVE_INTERVAL = 10;
const BOSS_HP_MUL = 2.0;
const BOSS_SCALE_MUL = 1.3;
// Round 43n - global OGRE size bump. Adds N units to every variant's
// scale at spawn time. Bigger OGREs are more imposing and let players
// space turrets out further. Boss multiplier applies on top.
const OGRE_SIZE_BONUS = 2.5;
const BOSS_BONUS_SCORE = 500;

// Round 10 — heat shimmer cadence
const SHIMMER_INTERVAL = 0.05;

// Round 11 — track marks + fire + plasma field
const VOXEL_AIR  = 0;
const VOXEL_ASH  = 6;
const TRACK_INTERVAL_DIST = 1.4;        // how far OGRE travels between track stamps
const FIRE_INTERVAL = 0.06;             // emit cadence per fire emitter
const PLASMA_INTERVAL = 0.08;
const HARDPOINT_FIRE_TTL = 6.0;         // s of fire after hardpoint pops

// Round 9 — Hard point definitions (offsets in OGRE-local space, scaled by variant.scale/4)
//
// Round 80 — mount metadata system. Parts can now declare attachment via:
//   mount: { face, tangent?, protrude? }
//     face:     "top" | "bottom" | "left" | "right" | "front" | "back"
//     tangent:  [u, v] — 2D offset within the face plane (defaults [0,0])
//                u/v axes per face: top/bottom => (x, z), left/right => (z, y),
//                front/back => (x, y). Same units as the legacy offset.
//     protrude: how far OUT from the face the part center sits. 0 = on the
//                surface plane (good for hardpoints embedded in armor).
//                Positive = stands proud (antenna, dish). Default 0.
//
// At module load, any def with `mount` and no `offset` gets its offset
// computed once and cached as `.offset`, so the rest of the OGRE machinery
// (which reads def.offset.x/y/z every frame) keeps working unchanged.
//
// Legacy defs with explicit `offset: {x, y, z}` are unaffected.
// Round 87 — chassis half-height: topY 4.5 → 2.25. This pulls every
// "top face" mount (turret, cannon, main_weapon, sensor, antenna,
// etc.) down to half its previous height. The visual chassis mesh
// itself comes from kaijuKinds.tech.scale and may need a separate
// height adjustment if the body STILL looks too tall after this —
// the mount fix alone makes accessories sit on the body instead of
// floating above it.
const OGRE_CHASSIS_DIMS = {
    halfWidth:  2.5,    // chassis spans x ∈ [-2.5, +2.5] at variant.scale=4
    halfDepth:  2.5,    // chassis spans z ∈ [-2.5, +2.5]
    topY:       2.25,   // round 87 — was 4.5; halved for proper "on body" mount feel
    bottomY:    0.4,    // bottom surface (just above tread base)
    midY:       1.25,   // round 87 — was 2.5; matches new half-height
};

function resolveOgreMount(mount) {
    const { face, tangent = [0, 0], protrude = 0 } = mount;
    const D = OGRE_CHASSIS_DIMS;
    let bx = 0, by = 0, bz = 0;        // base point on the face
    let ox = 0, oy = 0, oz = 0;        // outward normal
    let uAxis = "x", vAxis = "z";      // which world axes the tangent maps to

    switch (face) {
        case "top":
            bx = 0; by = D.topY; bz = 0;
            ox = 0; oy = 1;     oz = 0;
            uAxis = "x"; vAxis = "z";
            break;
        case "bottom":
            bx = 0; by = D.bottomY; bz = 0;
            ox = 0; oy = -1;    oz = 0;
            uAxis = "x"; vAxis = "z";
            break;
        case "right":
            bx = D.halfWidth; by = D.midY; bz = 0;
            ox = 1; oy = 0;     oz = 0;
            uAxis = "z"; vAxis = "y";
            break;
        case "left":
            bx = -D.halfWidth; by = D.midY; bz = 0;
            ox = -1; oy = 0;    oz = 0;
            uAxis = "z"; vAxis = "y";
            break;
        case "front":
            bx = 0; by = D.midY; bz = D.halfDepth;
            ox = 0; oy = 0;     oz = 1;
            uAxis = "x"; vAxis = "y";
            break;
        case "back":
            bx = 0; by = D.midY; bz = -D.halfDepth;
            ox = 0; oy = 0;     oz = -1;
            uAxis = "x"; vAxis = "y";
            break;
        default:
            return { x: 0, y: 0, z: 0 };
    }

    // Apply tangent (in-plane 2D offset)
    const u = tangent[0] || 0, v = tangent[1] || 0;
    if (uAxis === "x") bx += u; else if (uAxis === "y") by += u; else if (uAxis === "z") bz += u;
    if (vAxis === "x") bx += v; else if (vAxis === "y") by += v; else if (vAxis === "z") bz += v;

    // Push outward by protrude amount
    bx += ox * protrude;
    by += oy * protrude;
    bz += oz * protrude;

    return { x: bx, y: by, z: bz };
}

const HARDPOINTS_DEF = {
    main_weapon: {
        // Top surface, slightly forward of center — the big gun port
        // sits on the upper armor where you'd expect a turret breech.
        mount: { face: "top", tangent: [0, 0.8], protrude: 0 },
        hp: 50,
        radius: 1.4,
        kind:   "ogre_hp_weapon",
        color:  [1.0, 0.45, 0.2],
        label:  "weapon",
        effect: "disable_weapon",
    },
    engine: {
        // Back surface, low — the exhaust block. Mounted ON the back
        // armor rather than floating in space behind the chassis.
        mount: { face: "back", tangent: [0, -1.0], protrude: 0 },
        hp: 60,
        radius: 1.5,
        kind:   "ogre_hp_engine",
        color:  [1.0, 0.6, 0.15],
        label:  "engine",
        effect: "slow_engine",
    },
    tech_module: {
        // Right side, middle height — a coolant/electronics pod bolted
        // onto the right armor plate.
        mount: { face: "right", tangent: [0, 0], protrude: 0 },
        hp: 40,
        radius: 1.2,
        kind:   "ogre_hp_tech",
        color:  [0.5, 0.9, 1.0],
        label:  "tech",
        effect: "disable_special",
    },
    sensor: {
        // Top surface, port (left-rear) — periscope-style sensor mast.
        // Stands a bit proud of the top armor so it reads as a sticky-up.
        mount: { face: "top", tangent: [-1.5, -0.5], protrude: 0.3 },
        hp: 30,
        radius: 1.0,
        kind:   "ogre_hp_sensor",
        color:  [0.4, 1.0, 0.85],
        label:  "sensor",
        effect: "slow_attack",
    },
    // Round 106 — underside anti-personnel weapon. Belly-mounted turret
    // pointing DOWN. Engages defenders that get under the chassis (the
    // user noted: "a human defender tank could drive under it with luck
    // and not get crushed. but the underside weapons of the OGRE..."
    // — exactly that). Lower HP than the main weapon (40) since it's
    // smaller and more exposed.
    underside_weapon: {
        mount: { face: "bottom", tangent: [0, 0], protrude: 0 },
        hp: 40,
        radius: 1.0,
        kind:   "ogre_hp_underside",
        color:  [0.85, 0.35, 0.15],
        label:  "underside",
        effect: "disable_underside",
    },
    // Round 108 — towing demons. Promoted from cosmetic rig parts to
    // DESTRUCTIBLE HARDPOINTS for the mk14 Hellcraft variant. Each demon
    // contributes 25% of the OGRE's mobility (speed multiplier =
    // aliveDemons / totalDemons). When ALL demons are killed the OGRE
    // descends to ground level and stops moving. Gate via variantSpecial
    // so they only spawn on flying_demons variants — _spawnHardpoints
    // got a generalized variantSpecial check in round 108 (previously
    // only tech_module had special inline gating).
    demon_FL_near: {
        variantSpecial: "flying_demons",
        mount: { face: "front", tangent: [-1.6,  0.3], protrude: 2.5 },
        hp: 25,
        radius: 0.7,
        kind:   "ogre_demon",
        color:  [0.60, 0.10, 0.12],
        label:  "demon FL",
        effect: "reduce_mobility",
    },
    demon_FR_near: {
        variantSpecial: "flying_demons",
        mount: { face: "front", tangent: [ 1.6,  0.3], protrude: 2.5 },
        hp: 25,
        radius: 0.7,
        kind:   "ogre_demon",
        color:  [0.60, 0.10, 0.12],
        label:  "demon FR",
        effect: "reduce_mobility",
    },
    demon_FL_far: {
        variantSpecial: "flying_demons",
        mount: { face: "front", tangent: [-2.8, -0.6], protrude: 4.5 },
        hp: 25,
        radius: 0.7,
        kind:   "ogre_demon",
        color:  [0.60, 0.10, 0.12],
        label:  "demon BL",
        effect: "reduce_mobility",
    },
    demon_FR_far: {
        variantSpecial: "flying_demons",
        mount: { face: "front", tangent: [ 2.8, -0.6], protrude: 4.5 },
        hp: 25,
        radius: 0.7,
        kind:   "ogre_demon",
        color:  [0.60, 0.10, 0.12],
        label:  "demon BR",
        effect: "reduce_mobility",
    },
};

// Round 16 — OGRE rig parts. Purely cosmetic sub-entities that follow
// the chassis with rotating offsets, giving the OGRE visible articulated
// structure (turret, cannon, treads, hatches). Not destructible — these
// stick around for the entire OGRE lifetime.
//
// Each part has:
//   offset    — base position offset relative to chassis origin
//   scale     — render scale of the sub-entity
//   kind      — entityVisuals lookup key for color + animation
//   yawMode   — "chassis" | "aim" — which yaw drives this part's facing
//   recoils   — true if this part kicks back on fire
const OGRE_RIG_DEF = {
    turret: {
        // Top surface, center. Turret base sits on the upper armor.
        mount: { face: "top", tangent: [0, 0], protrude: 0 },
        scale:  1.6,
        kind:   "ogre_turret",
        yawMode: "aim",            // tracks aim independently of chassis
        scaleY: 1.0,
    },
    cannon: {
        // Top surface, forward of turret — the barrel.
        mount: { face: "top", tangent: [0, 1.6], protrude: 0 },
        scale:  0.7,
        kind:   "ogre_cannon",
        yawMode: "aim",            // rotates with turret
        recoils: true,             // slides back on fire
    },
    treadL: {
        // Bottom surface, left side. Protrude=0 sits ON the bottom plane,
        // exactly where treads belong (just below the chassis box, on
        // the ground). The half-width = 2.4 puts them at the outer edge.
        mount: { face: "bottom", tangent: [-2.4, 0], protrude: 0 },
        scale:  1.4,
        kind:   "ogre_tread",
        yawMode: "chassis",
    },
    treadR: {
        mount: { face: "bottom", tangent: [2.4, 0], protrude: 0 },
        scale:  1.4,
        kind:   "ogre_tread",
        yawMode: "chassis",
    },
    // Round 21 — antenna whip. Tall thin part on chassis rear-top.
    // Generic to every OGRE — gives all variants more silhouette height.
    // Subtle sway via openMode="scan" + low amplitude.
    //
    // Round 80 — now stands genuinely PROUD of the top surface
    // (protrude=1.0) instead of floating at hardcoded y=5.5.
    antenna: {
        mount: { face: "top", tangent: [0.8, -1.2], protrude: 1.0 },
        scale:  0.35,
        kind:   "ogre_antenna",
        yawMode: "chassis",
        openMode: "scan",
        scanAmplitude: 0.12,
        scanRate: 1.1,
    },
    // Round 26/29 — cannon ammo belt. Six chained brass link entities
    // running back from cannon breech, each at offset Z position.
    // Combined with shader anim mode 5 (Z-axis sawtooth scroll), the
    // links visibly shift forward toward the breech. Each link reuses
    // the same kind so they share color/animation; offsets stagger them.
    //
    // Keeping the legacy offset for these — they're tightly choreographed
    // with the cannon recoil math (round 26/29) and the staggered Z
    // values were tuned by eye. Converting to mount risks visible drift
    // in the belt animation.
    ammo_link_0: { offset: { x: -0.7, y: 3.6, z:  0.4 }, scale: 0.4, kind: "ogre_ammo_belt", yawMode: "aim" },
    ammo_link_1: { offset: { x: -0.7, y: 3.6, z: -0.0 }, scale: 0.4, kind: "ogre_ammo_belt", yawMode: "aim" },
    ammo_link_2: { offset: { x: -0.7, y: 3.6, z: -0.4 }, scale: 0.4, kind: "ogre_ammo_belt", yawMode: "aim" },
    ammo_link_3: { offset: { x: -0.7, y: 3.6, z: -0.8 }, scale: 0.4, kind: "ogre_ammo_belt", yawMode: "aim" },
    ammo_link_4: { offset: { x: -0.7, y: 3.6, z: -1.2 }, scale: 0.4, kind: "ogre_ammo_belt", yawMode: "aim" },
    ammo_link_5: { offset: { x: -0.7, y: 3.6, z: -1.6 }, scale: 0.4, kind: "ogre_ammo_belt", yawMode: "aim" },
};

// Round 16 — recoil dynamics: when OGRE fires, cannon kicks back this
// far (in object-local Z, so behind the turret), then springs back to
// resting position over RECOIL_RECOVER_TIME seconds.
const RECOIL_DISTANCE = 0.55;        // world units back
const RECOIL_KICKBACK_TIME = 0.06;   // s — fast kick
const RECOIL_RECOVER_TIME = 0.30;    // s — slower spring-back

// Round 17 — variant-specific rig parts. Each OGRE mark adds its own
// characteristic visual element on top of the base rig (turret, cannon,
// treads). These are keyed by variant.special so any new variant with
// the matching special automatically gets its rig.
//
// Each part supports:
//   offset       — base position offset from chassis
//   scale        — render scale
//   kind         — entityVisuals kind (color)
//   yawMode      — "chassis" | "aim" | "spin" (continuous yaw rotation)
//   spinRate     — radians/sec for yawMode="spin" parts
//   openMode     — "hatch" (rotates outward via tiltX) | "scan" (oscillating tiltX)
//   openAxis     — which side a hatch opens toward (-1 left, +1 right)
//   scanAmplitude — radians peak for "scan" oscillation
//   scanRate     — radians/sec for "scan" oscillation
const VARIANT_RIG_DEF = {
    // MK2 Lancer — rotating scanner dish on top
    "lancer_scanner": {
        variantSpecial: "scanners",
        offset: { x: 0, y: 5.4, z: -1.5 },
        scale: 0.7,
        kind: "ogre_scanner_dish",
        yawMode: "spin",
        spinRate: 2.2,             // rad/sec — visibly spinning
    },
    // MK3 Mortar — twin scanning spotlights on front-top
    "mortar_spotlight_L": {
        variantSpecial: "spotlights",
        offset: { x: -1.2, y: 5.0, z: 1.4 },
        scale: 0.55,
        kind: "ogre_spotlight",
        yawMode: "chassis",
        openMode: "scan",
        scanAmplitude: 0.6,        // ±0.6 rad pitch sweep
        scanRate: 1.4,
        scanPhase: 0.0,
    },
    "mortar_spotlight_R": {
        variantSpecial: "spotlights",
        offset: { x: 1.2, y: 5.0, z: 1.4 },
        scale: 0.55,
        kind: "ogre_spotlight",
        yawMode: "chassis",
        openMode: "scan",
        scanAmplitude: 0.6,
        scanRate: 1.4,
        scanPhase: Math.PI,        // opposite phase to left
    },
    // MK4 Carrier — twin rear hatches that open when minion spawns
    "carrier_hatch_L": {
        variantSpecial: "carrier",
        offset: { x: -1.0, y: 2.0, z: -2.4 },
        scale: 0.8,
        kind: "ogre_hatch",
        yawMode: "chassis",
        openMode: "hatch",
        openAxis: -1,              // opens left
    },
    "carrier_hatch_R": {
        variantSpecial: "carrier",
        offset: { x: 1.0, y: 2.0, z: -2.4 },
        scale: 0.8,
        kind: "ogre_hatch",
        yawMode: "chassis",
        openMode: "hatch",
        openAxis: 1,               // opens right
    },
    // MK5 Drone Bay — top bay door that opens when drone launches
    "drone_bay_door": {
        variantSpecial: "drones",
        offset: { x: 0, y: 5.6, z: 0 },
        scale: 1.1,
        kind: "ogre_bay_door",
        yawMode: "chassis",
        openMode: "hatch",
        openAxis: 1,
    },
    // MK8 Magnetic — pulse coil antenna on top, glows during pulse
    "magnetic_coil": {
        variantSpecial: "magnetic",
        offset: { x: 0, y: 5.8, z: 0 },
        scale: 0.6,
        kind: "ogre_coil",
        yawMode: "spin",
        spinRate: 6.0,             // fast spin
    },
    // Round 18 — MK6 Aegis: large translucent dome on top. Despawns
    // with a shatter burst when shield HP hits zero.
    "aegis_dome": {
        variantSpecial: "aegis",
        offset: { x: 0, y: 5.6, z: 0 },
        scale: 2.6,
        kind: "ogre_shield_dome",
        yawMode: "chassis",
        shieldDome: true,          // tracks shieldHp; despawns at 0
    },
    // Round 18 — MK7 Phantom: cloak emitter on the back-top. Spinning
    // hexagonal coil; emits dense purple sparks while cloaked.
    "phantom_emitter": {
        variantSpecial: "phantom",
        offset: { x: 0, y: 5.0, z: -1.0 },
        scale: 0.7,
        kind: "ogre_phantom_emitter",
        yawMode: "spin",
        spinRate: 4.5,
        cloakEmitter: true,        // emits particles when this.cloaked
    },
    // Round 18 — MK9 Splitter: twin vertical struts marking the
    // pre-split fracture line. Burst into shards at split moment.
    "splitter_strut_L": {
        variantSpecial: "splitter",
        offset: { x: -1.6, y: 3.2, z: 0 },
        scale: 0.5,
        kind: "ogre_splitter_strut",
        yawMode: "chassis",
        splitterStrut: true,
    },
    "splitter_strut_R": {
        variantSpecial: "splitter",
        offset: { x: 1.6, y: 3.2, z: 0 },
        scale: 0.5,
        kind: "ogre_splitter_strut",
        yawMode: "chassis",
        splitterStrut: true,
    },
    // Round 18 — generic smoke stacks at rear of chassis. Apply to ALL
    // OGRE variants (variantSpecial=null = always-spawn). Continuously
    // emit smoke particles upward.
    "smoke_stack_L": {
        variantSpecial: null,
        offset: { x: -1.4, y: 4.8, z: -1.6 },
        scale: 0.55,
        kind: "ogre_smoke_stack",
        yawMode: "chassis",
        emitsSmoke: true,
    },
    "smoke_stack_R": {
        variantSpecial: null,
        offset: { x: 1.4, y: 4.8, z: -1.6 },
        scale: 0.55,
        kind: "ogre_smoke_stack",
        yawMode: "chassis",
        emitsSmoke: true,
    },
    // Round 106 — sub-OGRE hover jet thrusters. Four downward-pointing
    // exhaust nozzles at underside corners, providing visible flight
    // propulsion for the mk12 hover variant. Spawn only when variant
    // .special === "flying_hover"; treads are conditionally skipped
    // in _spawnRig for ANY flying_* variant. Pulsing anim mode 2.
    "hover_jet_FL": {
        variantSpecial: "flying_hover",
        mount: { face: "bottom", tangent: [-2.0,  2.0], protrude: 0 },
        scale: 0.55,
        kind:  "ogre_hover_jet",
        yawMode: "chassis",
    },
    "hover_jet_FR": {
        variantSpecial: "flying_hover",
        mount: { face: "bottom", tangent: [ 2.0,  2.0], protrude: 0 },
        scale: 0.55,
        kind:  "ogre_hover_jet",
        yawMode: "chassis",
    },
    "hover_jet_BL": {
        variantSpecial: "flying_hover",
        mount: { face: "bottom", tangent: [-2.0, -2.0], protrude: 0 },
        scale: 0.55,
        kind:  "ogre_hover_jet",
        yawMode: "chassis",
    },
    "hover_jet_BR": {
        variantSpecial: "flying_hover",
        mount: { face: "bottom", tangent: [ 2.0, -2.0], protrude: 0 },
        scale: 0.55,
        kind:  "ogre_hover_jet",
        yawMode: "chassis",
    },
    // Round 107 — jet engine pods for mk13 Jetfighter. Two horizontal
    // pods, one per side, exhaust facing backward (-z). Bigger than
    // hover jets — these are forward-thrust engines. Mid-height so
    // they read as wing-mounted aircraft engines.
    "jet_engine_L": {
        variantSpecial: "flying_jets",
        mount: { face: "left", tangent: [0, 0.6], protrude: 0.6 },
        scale: 0.7,
        kind:  "ogre_jet_engine",
        yawMode: "chassis",
    },
    "jet_engine_R": {
        variantSpecial: "flying_jets",
        mount: { face: "right", tangent: [0, 0.6], protrude: 0.6 },
        scale: 0.7,
        kind:  "ogre_jet_engine",
        yawMode: "chassis",
    },
    // Round 108 — demons moved from rig (cosmetic) to HARDPOINTS_DEF
    // (destructible). See "demon_FL_near" etc in HARDPOINTS_DEF.
};

// Round 80 — resolve any `mount: {...}` declarations into the legacy
// `.offset` field so the rest of the OGRE machinery (which reads
// def.offset.x/y/z every frame in _moveRig / _moveHardpoints) keeps
// working unchanged. Done once at module load — defs are static and
// the result is stable across instances.
for (const defs of [HARDPOINTS_DEF, OGRE_RIG_DEF, VARIANT_RIG_DEF]) {
    for (const key of Object.keys(defs)) {
        const d = defs[key];
        if (d.mount && !d.offset) {
            d.offset = resolveOgreMount(d.mount);
        }
    }
}

// Hatch open animation timing (round 17)
const HATCH_OPEN_TIME = 0.22;       // s to fully open
const HATCH_HOLD_TIME = 1.20;       // s held open
const HATCH_CLOSE_TIME = 0.40;      // s to close
const HATCH_FULL_OPEN_ANGLE = Math.PI * 0.45;  // ~81° outward

// Round 9 — air-drop reinforcement
const AIR_DROP_COST_SCORE = 200;
const AIR_DROP_FALL_SPEED = 12;
const AIR_DROP_START_ALT = 60;

export const OGRE_DIFFICULTIES = {
    easy:      { name: "Easy",      hpMul: 0.70, ogreDmgMul: 0.70, defHpMul: 1.40, energyBonus:  20, ogreSpeedMul: 0.95, color: "#5eff8a" },
    normal:    { name: "Normal",    hpMul: 1.00, ogreDmgMul: 1.00, defHpMul: 1.00, energyBonus:   0, ogreSpeedMul: 1.00, color: "#ffd884" },
    hard:      { name: "Hard",      hpMul: 1.30, ogreDmgMul: 1.30, defHpMul: 0.85, energyBonus: -10, ogreSpeedMul: 1.10, color: "#ff8a3c" },
    nightmare: { name: "Nightmare", hpMul: 1.60, ogreDmgMul: 1.55, defHpMul: 0.70, energyBonus: -20, ogreSpeedMul: 1.20, color: "#ff3c3c" },
};

export const OGRE_VARIANTS = {
    mk1: {
        name: "MK I Standard",
        hp: 200, speed: 1.2, scale: 4.0, kind: "ogre_hull",
        weapon: { type: "plasma", damage: 8, interval: 2.5, range: 60, projSpeed: 25,
                  color: [0.45, 1.00, 0.55], aoe: 0 },
        special: null,
        desc: "Balanced cybertank. Plasma cannon, no surprises.",
    },
    mk2: {
        name: "MK II Lancer",
        hp: 180, speed: 1.0, scale: 4.0, kind: "ogre_hull",
        weapon: { type: "laser", damage: 6, interval: 1.0, range: 90,
                  color: [1.00, 0.35, 0.35], aoe: 0 },
        special: "scanners",
        desc: "Fast laser. Long range, fast cycle. Scanner array tracks targets.",
    },
    mk3: {
        name: "MK III Mortar",
        hp: 240, speed: 0.9, scale: 4.5, kind: "ogre_hull",
        weapon: { type: "artillery", damage: 18, interval: 4.0, range: 110, projSpeed: 22,
                  color: [1.00, 0.55, 0.18], aoe: 6 },
        special: "spotlights",
        desc: "Heavy mortar. Spotlights sweep the battlefield.",
    },
    mk4: {
        name: "MK IV Carrier",
        hp: 260, speed: 1.0, scale: 5.0, kind: "ogre_hull",
        weapon: { type: "plasma", damage: 5, interval: 2.0, range: 50, projSpeed: 25,
                  color: [0.50, 0.70, 1.00], aoe: 0 },
        special: "carrier",
        spawnInterval: 10,
        desc: "Drops infantry minions every 10s. Stop them before they reach HQ.",
    },
    mk5: {
        name: "MK V Drone Bay",
        hp: 220, speed: 1.0, scale: 4.5, kind: "ogre_hull",
        weapon: { type: "plasma", damage: 4, interval: 3.0, range: 45, projSpeed: 25,
                  color: [0.40, 0.80, 0.95], aoe: 0 },
        special: "drones",
        spawnInterval: 8,
        desc: "Launches flying drones. They strafe defenders with lasers.",
    },
    mk6: {
        name: "MK VI Aegis",
        hp: 200, speed: 1.1, scale: 4.0, kind: "ogre_hull",
        weapon: { type: "plasma", damage: 9, interval: 2.2, range: 65, projSpeed: 28,
                  color: [0.85, 0.45, 1.00], aoe: 0 },
        special: "aegis",
        shieldHp: SHIELD_HP_MK6,
        desc: "Energy shield — must break it first. 80 dmg buffer.",
    },
    // Round 8 — new variants
    mk7: {
        name: "MK VII Phantom",
        hp: 180, speed: 1.15, scale: 4.0, kind: "ogre_hull",
        weapon: { type: "plasma", damage: 7, interval: 2.0, range: 55, projSpeed: 26,
                  color: [0.85, 0.40, 1.00], aoe: 0 },
        special: "phantom",
        desc: "Cloaks below 50% HP. Hits pass through during cloak.",
    },
    mk8: {
        name: "MK VIII Magnetic",
        hp: 220, speed: 1.0, scale: 4.2, kind: "ogre_hull",
        weapon: { type: "plasma", damage: 8, interval: 2.4, range: 60, projSpeed: 25,
                  color: [0.40, 0.55, 1.00], aoe: 0 },
        special: "magnetic",
        desc: "Pulses a magnetic field every 6s — deflects projectiles for 2s.",
    },
    // Round 10
    mk9: {
        name: "MK IX Splitter",
        hp: 280, speed: 1.0, scale: 5.0, kind: "ogre_hull",
        weapon: { type: "plasma", damage: 7, interval: 2.6, range: 55, projSpeed: 25,
                  color: [1.00, 0.55, 0.85], aoe: 0 },
        special: "splitter",
        desc: "Splits into two armed shards at 50% HP.",
    },
    // Round 36 — naval variant. Sub mostly sits below water; periodically
    // surfaces for a cannon volley, then submerges. While submerged it
    // fires torpedoes from periscope depth. Best deployed via `ogre.sub()`
    // alongside `ogre.sea()`.
    mk10: {
        name: "MK X Submarine",
        hp: 240, speed: 0.95, scale: 4.2, kind: "ogre_hull",
        weapon: { type: "plasma", damage: 10, interval: 2.6, range: 60, projSpeed: 26,
                  color: [0.35, 0.85, 1.00], aoe: 0 },
        special: "submarine",
        surfaceInterval: 14,        // cycle: every N seconds, surface for a window
        surfaceWindow: 5,           // seconds of "surfaced" state per cycle
        submergeDepth: 2.4,         // chassis Y reduction while submerged
        torpedoInterval: 3.2,       // fires torpedoes while submerged
        desc: "Sea variant. Submerges, surfaces to bombard, fires torpedoes underwater.",
    },
    // Round 38 — flying flagship variant. Aircraft carrier launches planes
    // that strafe defenders from above. Heavy chassis, slower speed.
    mk11: {
        name: "MK XI Aircraft Carrier",
        hp: 320, speed: 0.85, scale: 5.5, kind: "ogre_hull",
        weapon: { type: "plasma", damage: 6, interval: 2.5, range: 55, projSpeed: 25,
                  color: [0.6, 0.85, 1.00], aoe: 0 },
        special: "carrier_air",
        spawnInterval: 6.0,
        desc: "Aircraft carrier. Launches planes every 6s that strafe defenders.",
    },
    // Round 106 — sub-OGRE flying variant. Hovers ~8u above the ground
    // on four downward-pointing thrusters (instead of treads). User
    // noted: "a human defender tank could drive under it with luck and
    // not get crushed." The underside weapon hardpoint (added in
    // HARDPOINTS_DEF this round) lets the OGRE engage defenders that
    // do exactly that. Special="flying_hover" triggers:
    //   - 4 hover_jet rig parts spawn at underside corners
    //   - treadL/treadR are skipped in _spawnRig
    //   - spawn + per-tick Y offset is +8 instead of +2 (hover altitude)
    // Round 107 — also gets undersideWeapon config so the belly turret
    // actually fires at defenders under the chassis (hit-scan damage).
    mk12: {
        name: "MK XII Skylord",
        hp: 220, speed: 1.4, scale: 4.5, kind: "ogre_hull",
        weapon: { type: "plasma", damage: 9, interval: 2.0, range: 75, projSpeed: 26,
                  color: [0.40, 0.85, 1.00], aoe: 0 },
        // Round 107 — functional underside turret. Short-range hit-scan
        // damage to any defender within ±2.5 horiz AND below the OGRE.
        // Gated on hardpoints.underside_weapon being alive.
        undersideWeapon: { damage: 5, interval: 1.4, range: 22 },
        special: "flying_hover",
        desc: "Sub-OGRE flyer. Hovers 8u up on thrusters; defenders can drive under.",
    },
    // Round 107 — Jetfighter variant. Forward-thrust jet engines
    // (mounted on the sides) replace hover thrusters. Faster than
    // mk12 since the engines provide directional drive. Higher hp.
    mk13: {
        name: "MK XIII Jetfighter",
        hp: 250, speed: 1.8, scale: 4.5, kind: "ogre_hull",
        weapon: { type: "plasma", damage: 11, interval: 1.8, range: 80, projSpeed: 28,
                  color: [1.00, 0.85, 0.40], aoe: 0 },
        undersideWeapon: { damage: 6, interval: 1.2, range: 24 },
        special: "flying_jets",
        desc: "Sub-OGRE jet. Side-mounted engines provide forward thrust. Faster.",
    },
    // Round 107 — Hellcraft variant. Towed through the air by four
    // demons flying ahead in V formation. Slowest of the flyers but
    // hardest to take out since killing the OGRE doesn't kill the
    // demons (they're cosmetic; the chassis IS the target).
    mk14: {
        name: "MK XIV Hellcraft",
        hp: 280, speed: 1.1, scale: 4.6, kind: "ogre_hull",
        weapon: { type: "plasma", damage: 10, interval: 2.4, range: 70, projSpeed: 24,
                  color: [1.00, 0.30, 0.30], aoe: 0 },
        undersideWeapon: { damage: 7, interval: 1.6, range: 22 },
        special: "flying_demons",
        desc: "Sub-OGRE infernal. Four demons tow the chassis in formation.",
    },
};

const WAVE_ORDER = ["mk1", "mk2", "mk3", "mk4", "mk5", "mk6", "mk7", "mk8", "mk9"];

// Round 209 — env → variant mapping for themed-waves mode. Each env
// picks a variant that visually + thematically matches: sub on water,
// hellcraft (demon-propelled) in hell, flyers on low-gravity worlds,
// ground variants on earth. Boss waves push toward the heavier variants
// where the env has options.
const _THEMED_ENV_VARIANTS = {
    sea:   ["mk10", "mk11"],                                      // sub, carrier
    hell:  ["mk14"],                                              // demon-propelled
    moon:  ["mk12", "mk13"],                                      // hover, jetfighter
    mars:  ["mk13", "mk12"],                                      // jetfighter, hover
    earth: ["mk1", "mk2", "mk3", "mk4", "mk5", "mk6", "mk7", "mk8", "mk9"],
};
function _pickThemedVariant(env, isBoss) {
    const pool = _THEMED_ENV_VARIANTS[env] || _THEMED_ENV_VARIANTS.earth;
    if (isBoss && pool.length > 1) {
        // Bias to last entry of pool for boss waves (usually heavier)
        return pool[pool.length - 1];
    }
    return pool[Math.floor(Math.random() * pool.length)];
}

const DEFENDER_LINE_Z = -30;
const DEFENDER_SPACING = 8;
const DEFENDER_COUNT  = 6;
const DEFENDER_SPEED  = 6;

const STARTING_ENERGY = 60;
const ENERGY_BONUS_PER_WAVE = 30;
// Round 43n - defender economy
const INCOME_PER_SEC      = 1.5;    // passive drip (energy/second)
// Round 43n economy constants. Round 49 - exported so the HUD can show
// live sell-refund / repair-cost preview on the action row.
export const SELL_REFUND_RATIO   = 0.5;    // refund 50% of original cost on sell
export const REPAIR_COST_PER_HP  = 0.6;    // energy to restore 1 HP
const INTERMISSION_TIME = 5.0;     // seconds between waves

// Minion config (carrier-spawned ground troops)
const MINION_HP = 20;
const MINION_SPEED = 1.8;
const MINION_DAMAGE_TO_HQ = 25;    // OGRE wins after enough minions reach HQ
const HQ_HP = 100;

// Round 3 — turret type registry. Each defender (free or bought)
// has a `type` referencing this table.
export const TURRET_TYPES = {
    machinegun: {
        name: "Machine Gun",
        short: "MG",
        cost: 15,
        damage: 3.2,
        fireInterval: 0.4,
        // Round 87 — was 35. OGRE spawns ~62m out; old range meant
        // defenders sat idle until OGRE walked into them. Bumped so
        // free starter turrets can engage across the whole arena.
        range: 70,
        projSpeed: 60,
        projColor: [1.0, 0.85, 0.35],
        aoe: 0,
    },
    missile: {
        name: "Missile Launcher",
        short: "MSL",
        cost: 30,
        damage: 18,
        fireInterval: 1.5,
        range: 90,        // Round 87 — was 60, matched MG's old gap
        projSpeed: 30,
        projColor: [1.0, 0.45, 0.10],
        aoe: 3,
    },
    railgun: {
        name: "Railgun",
        short: "RAIL",
        cost: 45,
        damage: 30,
        fireInterval: 3.0,
        range: 100,
        projSpeed: 200,
        projColor: [0.40, 0.85, 1.00],
        aoe: 0,
    },
    // Round 29 — napalm cannon. Fires arcing shells that drop sticky fire
    // bits along the trajectory. Each bit damages enemies in radius for
    // a few seconds. Excellent against minion swarms; OK vs OGRE chassis.
    napalm: {
        name: "Napalm Cannon",
        short: "NAPM",
        cost: 50,
        damage: 4,           // direct hit (per bit, low)
        fireInterval: 2.5,
        range: 70,
        projSpeed: 28,
        projColor: [1.0, 0.55, 0.20],
        aoe: 1.6,            // damage radius of each napalm bit
        special: "napalm",
        bitInterval: 0.08,   // drop a fire bit every 80ms along arc
        bitTtl: 3.0,         // each bit burns for 3s
        bitDamagePerSec: 8,
    },
    // Round 34 — sea mine layer. Each "fire" deploys a bobbing mine
    // entity with a rotating alarm light. Detonates on enemy proximity.
    minelayer: {
        name: "Mine Layer",
        short: "MINE",
        cost: 35,
        damage: 80,
        fireInterval: 6.0,
        range: 30,
        projSpeed: 0,
        projColor: [1.0, 0.20, 0.20],
        aoe: 4.0,
        special: "minelayer",
        mineDeployRange: 25,
        mineLifetime: 90,
        mineMaxCount: 8,
    },
    // Round 36 — land mine layer (anti-armor). Drops flat mines on the
    // ground in OGRE's path. Cheaper + faster cycle than sea version but
    // smaller blast. Land mines don't bob; tagged with `kind: ogre_land_mine`.
    landmine: {
        name: "Land Mine Layer",
        short: "LMINE",
        cost: 30,
        damage: 55,
        fireInterval: 4.0,
        range: 30,
        projSpeed: 0,
        projColor: [0.40, 0.55, 0.30],
        aoe: 3.0,
        special: "landmine",
        mineDeployRange: 25,
        mineLifetime: 120,
        mineMaxCount: 12,
    },
    // Round 37 — defender submarine. Sea-only turret type. Sits at water
    // surface visually but fires torpedoes from below toward OGRE. Higher
    // damage than missile, slower cycle. Pairs perfectly against sub-OGRE.
    // Round 49 (post) - submerged:true wired up so the sub-hull + periscope
    // visual path activates. Without this flag set, subturret rendered as
    // a generic defender entity (looked identical to every other turret).
    subturret: {
        name: "Defender Sub",
        short: "DSUB",
        cost: 65,
        damage: 22,
        fireInterval: 3.5,
        range: 75,
        projSpeed: 24,
        projColor: [0.45, 0.85, 0.60],
        aoe: 1.6,
        special: "torpedo",                      // always fires torpedo
        submerged: true,                         // round 48: submerged hull + periscope path
    },
};

// Forward empty slots — placed forward of defender line so players
// can extend coverage by buying.
const SLOT_POSITIONS = [
    { x: -20, z: -10 },
    { x:  -7, z: -10 },
    { x:   7, z: -10 },
    { x:  20, z: -10 },
];

export class OgreScenario {
    constructor({ kaijuManager, civManager, world, particles, eventBus, camera, router, skyRenderer, voxelRenderer, entityMeshRenderer, bridge }) {
        this.kaijuManager = kaijuManager;
        this.civManager = civManager;
        this.world = world;
        this.particles = particles;
        this.eventBus = eventBus;
        this.camera = camera;
        this.router = router ?? kaijuManager.router;
        this.skyRenderer   = skyRenderer ?? null;
        this.voxelRenderer = voxelRenderer ?? null;
        this.entityMeshRenderer = entityMeshRenderer ?? null;    // round 33
        // Round 206 — PathPlanner ctor stashed for lazy init in _spawnWave.
        // The planner needs a heightAt(x,z) callback bound to scenario
        // state, so we can't construct it until we have access to
        // _surfaceY at spawn time.
        this._PathPlannerCtor = PathPlanner;
        this._pathPlanner = null;
        // Round 131 — WSBridge reference for multiplayer shared OGRE
        // HP pool. When bridge is wired, this scenario sends
        // ogre:start / ogre:damage / ogre:stop events to the server
        // and subscribes to ogre:state broadcasts for the shared HUD
        // display. Solo play: bridge is still wired (single client
        // talking to its own relay) but the shared pool effectively
        // mirrors local state since there's only one contributor.
        this.bridge = bridge ?? null;
        this.sharedOgreState = { active: false };    // last server broadcast
        if (this.bridge?.on) {
            this.bridge.on("ogre:state", (msg) => {
                this.sharedOgreState = {
                    active:       msg.active,
                    ogreHp:       msg.ogreHp,
                    ogreMaxHp:    msg.ogreMaxHp,
                    wave:         msg.wave,
                    contributors: msg.contributors || [],
                };
            });
            this.bridge.on("ogre:killed", (msg) => {
                // Team-kill announce: show toast with contributor breakdown
                this._announceTeamKill(msg);
            });
            this.bridge.on("player:welcome", (msg) => {
                if (msg.sharedOgre?.active) {
                    this.sharedOgreState = {
                        active:    true,
                        ogreHp:    msg.sharedOgre.ogreHp,
                        ogreMaxHp: msg.sharedOgre.ogreMaxHp,
                        wave:      msg.sharedOgre.wave,
                        contributors: [],
                    };
                }
            });
        }
        // v1481 — OGRE remote-commander relay. As HOST this engine publishes its OGRE
        // state and applies a remote steer; as COMMANDER it reads a host's state and posts
        // orders. Defenders are never network-controlled.
        this._cmdr = { active: false, role: "off", room: "main", token: "ogre-" + Math.random().toString(36).slice(2, 8) };
        this._cmdrTarget = null;   // host: current ordered steer point {x,z}
        this._cmdrFireId = null;   // host: gunner's default fire target (entityId)
        this._fireByHardpoint = {};// host: per-turret fire targets { slot: entityId } (v1485)
        this._cmdrPubT = 0;        // host: publish throttle
        this._cmdrAuto = null;     // crew: peer-AI interval
        this.nanites = this.nanites || { pool: 100, max: 100, regen: 5, mode: "idle", target: "auto" };
        this.ammo = this.ammo || { shells: 0, fuel: 0 };
        if (typeof window !== "undefined") {
            const self = this, bb = "";   // root-relative bridge base
            const post = (path, body) => fetch(bb + path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then(r => r.json()).catch(() => null);
            const order = (o) => post("/mp/ogre/command", { room: self._cmdr.room, token: self._cmdr.token, order: o });
            window.ogreCommander = {
                // HOST: this engine runs the OGRE sim, publishes state, applies crew orders.
                host(room) { self._cmdr = { active: true, role: "host", room: String(room || "main"), token: self._cmdr.token }; self._cmdrTarget = null; post("/mp/ogre/join", { room: self._cmdr.room, token: self._cmdr.token, role: "host" }); return "hosting OGRE room '" + self._cmdr.room + "' (publishing state, accepting crew orders)"; },
                // CREW seats — a human or AI takes one. Two people can crew it (e.g. driver +
                // gunner); AI can sit any seat. 'commander' is the legacy all-in-one seat.
                seat(name, room, allegiance) { self._cmdr = { active: true, role: String(name), room: String(room || "main"), token: self._cmdr.token }; post("/mp/ogre/join", { room: self._cmdr.room, token: self._cmdr.token, role: String(name), allegiance: allegiance === "enemy" ? "enemy" : "friendly" }); return "seated as " + name + (allegiance === "enemy" ? " (ENEMY)" : "") + " in OGRE room '" + self._cmdr.room + "'"; },
                driver(room, allegiance) { return this.seat("driver", room, allegiance); },
                gunner(room, turret, allegiance) { return this.seat(turret ? "gunner:" + turret : "gunner", room, allegiance); },
                engineer(room, allegiance) { return this.seat("engineer", room, allegiance); },
                command(room) { return this.seat("commander", room); },
                // ORDERS — driver: steer/halt/release · gunner: fire/ceasefire (optional turret) · engineer: repair/repairStop.
                steer(x, z) { return order({ kind: "steer", x: +x, z: +z }); },
                halt() { return order({ kind: "halt" }); },
                release() { return order({ kind: "release" }); },
                fire(targetId, slot) { return order(slot ? { kind: "fire", targetId, slot } : { kind: "fire", targetId }); },
                ceasefire() { return order({ kind: "fire", targetId: null }); },
                repair(system) { return order({ kind: "repair", system: system || "auto" }); },
                repairStop() { return order({ kind: "repairStop" }); },
                convert(to) { return order({ kind: "convert", to: (to === "fuel") ? "fuel" : "shells" }); },
                revive(which) { return order({ kind: "nanite", mode: "revive", target: which || "auto" }); },
                // AI autopilot for a seat: "driver" | "gunner" | "engineer" | "commander" (all three).
                auto(role) {
                    if (self._cmdrAuto) { clearInterval(self._cmdrAuto); self._cmdrAuto = null; }
                    if (role === false) return "peer-AI off";
                    const R = (typeof role === "string") ? role : "commander";
                    self._cmdrAuto = setInterval(async () => {
                        try {
                            const s = await fetch(bb + "/mp/ogre/state?room=" + encodeURIComponent(self._cmdr.room) + "&token=" + encodeURIComponent(self._cmdr.token)).then(r => r.json());
                            const st = s && s.state; if (!st) return;
                            if ((R === "driver" || R === "commander") && st.hq) { let tx = st.hq.x, tz = st.hq.z; if (st.defendersCentroid) tx += (st.hq.x - st.defendersCentroid.x) * 0.35; window.ogreCommander.steer(tx, tz); }
                            if ((R === "gunner" || R === "commander") && Array.isArray(st.defendersList) && st.defendersList.length && st.ogre) { let bid = null, bd = Infinity; for (const d of st.defendersList) { if (d.id == null) continue; const dx = d.x - st.ogre.x, dz = d.z - st.ogre.z, dd = dx * dx + dz * dz; if (dd < bd) { bd = dd; bid = d.id; } } if (bid != null) window.ogreCommander.fire(bid); }
                            if (R === "engineer" || R === "commander") { const hurt = st.sensors && st.sensors.hp < st.sensors.maxHp * 0.85; const down = st.hardpoints && st.hardpoints.alive < st.hardpoints.total; const lowShells = st.ammo && st.ammo.shells < 20; if (hurt) window.ogreCommander.repair("auto"); else if (down) window.ogreCommander.revive(); else if (lowShells) window.ogreCommander.convert("shells"); else window.ogreCommander.repairStop(); }
                        } catch {}
                    }, 1200);
                    return "peer-AI '" + R + "' on";
                },
                status() { return { active: self._cmdr.active, role: self._cmdr.role, room: self._cmdr.room, token: self._cmdr.token, target: self._cmdrTarget, nanites: self.nanites || null, ammo: self.ammo || null }; },
                stop() { if (self._cmdrAuto) { clearInterval(self._cmdrAuto); self._cmdrAuto = null; } const { room, token } = self._cmdr; post("/mp/ogre/leave", { room, token }); self._cmdr = { active: false, role: "off", room: "main", token }; self._cmdrTarget = null; return "OGRE crew relay off"; },
            };
            // v1484 — local engineering console (host side): direct the nanite swarm on THIS
            // engine's own OGRE with no remote crew. Remote engineers use ogreCommander.engineer().
            window.ogreEngineering = {
                repair(system) { if (self.nanites) { self.nanites.mode = "repair"; self.nanites.target = system || "auto"; } return "nanites repairing " + (system || "auto"); },
                convert(to) { if (self.nanites) self.nanites.mode = (to === "fuel") ? "fuel" : "shells"; return "nanites converting to " + (to === "fuel" ? "fuel" : "shells"); },
                idle() { if (self.nanites) self.nanites.mode = "idle"; return "nanites idle"; },
                revive(which) { if (self.nanites) { self.nanites.mode = "revive"; self.nanites.target = which || "auto"; } return "nanites reviving " + (which || "auto"); },
                status() { return { nanites: self.nanites || null, ammo: self.ammo || null, sensors: self.sensors || null }; },
            };
        }
        this._savedEnv = null;

        this.active = false;
        this.state  = "idle";
        this.ogre   = null;
        this.ogreHp = 0;
        this.ogreMaxHp = 0;       // round 41 — real value computed at _spawnWave from variant.hp × difficulty
        this.defenders = [];
        this.slots    = [];           // round 3 — empty buy slots
        this.projectiles = [];        // round 3 — real flying shots
        this.energy = 0;              // round 3 — currency
        this.startingEnergy = STARTING_ENERGY;
        this.hqPos = null;
        this.hqEntityId = null;
        this.targetMarkerEntityId = null;
        this.selectedDefender = null;
        this.pendingBuySlot = null;
        // Round 4 — OGRE behavior
        this.phase = 1;
        this._lastPlasmaT = 0;
        this._lastUndersideT = 0;     // round 107 — underside-weapon cooldown
        // Round 5 — variants + waves
        this.wave = 0;
        this.score = 0;
        this.variant = null;
        this.variantKey = "mk1";
        this.intermissionUntil = 0;
        this.minions = [];                 // carrier-spawned ground troops
        this.hqHp = HQ_HP;
        this.hqMaxHp = HQ_HP;
        this._lastSpawnT = 0;
        this._prevOgrePos = null;
        this._lastTrackT  = 0;
        // Round 7 — drones + shield + scanner timer
        this.drones = [];
        this.shieldHp = 0;
        this.shieldMaxHp = 0;
        this._scannerSweep = 0;
        // Round 8 — phantom + magnetic + difficulty
        this.cloaked = false;
        this._cloakTimer = 0;        // counts time-since-last-toggle
        this.magneticActive = false;
        this._magneticTimer = 0;
        this.difficulty = "normal";
        this.bestScore = 0;
        this.bestWave = 0;
        this._loadHighScores();
        // Round 9 — hard points + air drops + disable flags
        this.hardpoints = {};       // {key: {x,y,z,hp,maxHp,destroyed,entityId,def}}
        // Round 38 — civ boats + aircraft carrier planes + earth billboard
        this.airdrops = [];         // [{x,y,z,vx,vz,ttl,defenderType}]
        this.weaponDisabled = false;
        this.engineDisabled = false;
        this.specialDisabled = false;
        this.sensorDisabled = false;
        // Round 16 — rig parts (turret, cannon, treads). Cosmetic
        // composite-entity rig that follows the chassis.
        this.rig = {};              // {key: {entityId, def, recoilOffset, recoilT}}
        this._aimYaw = 0;           // smoothly tracked turret aim yaw
        this._chassisYaw = 0;       // smoothly tracked chassis movement yaw
        // Round 10 — splitter, boss, pause, heat shimmer
        this.shards = [];
        this.shells = [];                  // round 29 — ejected cannon shells
        this.napalmBits = [];              // round 29 — sticky napalm fire spots
        this.mines = [];                   // round 34 — deployed sea mines
        // Round 35 — OGRE point-defense turrets + counter-drones.
        // pdTurrets ring the chassis and auto-target nearby mines/torpedoes.
        // counterDrones are launched at mines beyond PD range.
        this.pdTurrets = [];               // {relX,relY,relZ,yaw,entityId,lastFireT}
        this.counterDrones = [];           // {x,y,z,vx,vy,vz,targetMine,entityId}
        // Round 36 — OGRE anti-personnel arsenal + sub state
        this.apMines = [];                 // ground mines dropped by OGRE rear
        this.gasClouds = [];               // toxic clouds emanating from OGRE
        this._subDepth = 0;                // submarine submerge depth (visual Y)
        // Round 38 — civ boats + aircraft carrier planes + earth billboard
        this.civBoats = new Map();         // civId -> { entityId }
        this.planes = [];                  // {x,y,z,vx,vy,vz,target,age,entityId,lastFireT}
        // Round 111 — DEFENDER planes (counter-air force). Spawned by
        // the defender airport (one structure per scenario, near HQ);
        // each plane takes off, flies toward the OGRE, strafes with
        // plasma bolts, then exits the map or gets shot down by the
        // OGRE's anti-air retargeted main weapon.
        this.defenderPlanes = [];
        // Round 111 — airport entity id (single structure near HQ).
        // Null when not yet spawned; set in _spawnAirport(); despawned
        // in stop(). Used by anti-air cleanup, future destruction
        // logic (taking out the airport stops plane launches).
        this._airport = null;
        this._lastDefenderPlaneT = 0;
        // Round 112 — sea env counterpart: defender dock + submarines.
        // Mirrors airport/plane pattern. Dock is a single pre-laid
        // structure near HQ-on-water; auto-launches subs that approach
        // OGRE submerged, surface to fire torpedoes, then dive.
        this.defenderSubs = [];
        this._dock = null;
        this._lastDefenderSubT = 0;
        // Round 120 — defender drone depot + patrol drones. Small
        // fast units that orbit near HQ and engage OGRE intruders
        // with light bolts. Lower damage per hit than planes but
        // higher cadence + denser presence. Depot is a single
        // structure that gates spawning.
        this.defenderDrones = [];
        this._depot = null;
        this._lastDefenderDroneT = 0;
        // Round 113 — OGRE-side escort subs. Launched from the mk10
        // sub-OGRE; hunt defender subs. Same physics as defenderSubs
        // (3-phase periscope-visible cycle).
        this.escortSubs = [];
        this._lastEscortSubT = 0;
        // Round 114 — minefield. Pre-laid mines scattered across a
        // strip between OGRE spawn and defender line. Invisible until
        // OGRE approaches within reveal distance; detonate on close
        // approach or shot impact. Each mine: {x,y,z, triggered,
        // revealed, revealEntityId}.
        this._minefield = [];
        this._earthEntityId = null;        // 3D earth billboard in moon sky
        // Round 40 — pilot eject cinematic state
        this.pilots = [];                  // {x,y,z,vx,vy,vz,age,chuteOpen,entityId,chuteEntityId}
        // Round 30 — POV cycling. Lock camera onto a defender or the OGRE
        // and follow its aim direction. Cycle with povNext/povPrev.
        this.povActive = false;
        this.povTargetIndex = -1;
        this.povTargets = [];
        this._savedCameraState = null;
        this.povFreeLook = false;          // when true, mouse-look overrides target yaw
        // Round 31 (phase 2) — control & shoot. When povInControl is true,
        // mouse aim drives the unit's aim yaw, click fires its weapon.
        this.povInControl = false;
        this._povLastFireT = 0;
        // Round 32 — predicted-impact reticle entity (3D marker at the
        // simulated landing position of a ballistic shot)
        this._povImpactMarkerId = null;
        this._didSplit = false;
        this.isBossWave = false;
        this.paused = false;
        this._lastShimmerT = 0;
        // Round 11 — fire + plasma emitters + track-marks accumulator
        this.fires = [];                   // [{x,y,z,ttl,maxTtl,size,_lastT}]
        this.plasmaFields = [];            // [{x,y,z,ttl,maxTtl,radius,_lastT}]
        this._trackTravelDist = 0;
        this.startTime = 0;
        this.endTime   = 0;

        // Round 43d — dedicated arena terrain. Built on start, unbuilt on
        // stop. Defines all positions (OGRE spawn, HQ, defender line,
        // slot row) so they scale with fieldLength.
        this.arena = new OgreArena({ world: this.world, voxelRenderer: this.voxelRenderer });
        this.arena.computeLayout();      // populate defaults
    }

    // -------------------------------------------------------------- start/stop

    start(opts = {}) {
        if (this.active) this.stop();
        // Round 8 — difficulty selection
        if (opts.difficulty && OGRE_DIFFICULTIES[opts.difficulty]) {
            this.difficulty = opts.difficulty;
        }
        // Round 36 — explicit variant override (e.g. "mk10" for sub)
        if (opts.variant && OGRE_VARIANTS[opts.variant]) {
            this._pendingVariantKey = opts.variant;
        }
        // Round 209 — themed waves mode. When true, EVERY wave is its
        // own "level": fresh terrain, fresh environment, and the variant
        // is picked to match the environment (sea → sub, hell → hellcraft,
        // moon/mars → flying, earth → ground campaign variant). Without
        // this, the legacy behavior holds (9-wave campaigns through
        // WAVE_ORDER, terrain preserved within a level, env labels shift
        // per wave without terrain regen).
        this._themedWaves = opts.themedWaves === true;
        // Round 43d — arena field length override.
        // Round 48 - if the requested field is larger than the current
        // world can hold, grow the world first so the OGRE doesn't spawn
        // outside loaded chunks (the "OGRE in space" bug). Required
        // gridRadius covers half-field + 16-voxel safety + a chunk.
        if (opts.fieldLength) {
            if (this.world?.setGridRadius && this.world.chunkSize) {
                const halfL = (opts.fieldLength | 0) / 2;
                const neededExtent = halfL + 16;        // safety margin
                const neededRadius = Math.ceil(neededExtent / this.world.chunkSize) + 1;
                if (neededRadius > (this.world.gridRadius ?? 0)) {
                    this.world.setGridRadius(neededRadius);
                }
            }
            this.arena.setFieldLength(opts.fieldLength, { world: this.world });
        }
        // Round 43e — fresh terrain. OGRE engagements need a clean
        // long-rectangle arena cut from world-gen terrain (hills, water,
        // biomes intact, but no leftover edits from previous demos).
        if (this.world?.regenerate) this.world.regenerate();
        // Round 27 — environment selection. Default "earth" leaves
        // everything as-is. "moon" / "mars" recolor sky+fog, scale
        // particle gravity, and repaint the play-area surface.
        // Round 87 — if no environment specified, pick randomly from
        // the available themes so each demo start feels different.
        // Sea variants (sub/carrier) force sea regardless.
        let chosenEnv = opts.environment;
        if (!chosenEnv) {
            const isSeaForced = this._pendingVariantKey === "mk10" || this._pendingVariantKey === "mk11";
            if (isSeaForced) {
                chosenEnv = "sea";
            } else {
                const ENV_POOL = ["earth", "moon", "mars", "sea", "hell"];
                chosenEnv = ENV_POOL[Math.floor(Math.random() * ENV_POOL.length)];
                console.log(`[OGRE] random environment selected: ${chosenEnv}`);
            }
        }
        // Round 87 — reset cycle tracker so the first transition after
        // start() is detected as a "cycle change" and resets terrain.
        this._lastTerrainCycle = -1;
        this._applyEnvironment(chosenEnv);
        const diff = OGRE_DIFFICULTIES[this.difficulty];
        const r = this.router;
        for (const id of [...this.kaijuManager.kaiju.keys()]) {
            const k = this.kaijuManager.kaiju.get(id);
            if (k._meshEntityId != null && r) {
                r.exec({ type: "entity:despawn", id: k._meshEntityId });
            }
            this.kaijuManager.kaiju.delete(id);
        }

        // Round 43d — build the dedicated arena terrain. Sea variants
        // (sub, carrier) get a water field with island; everything else
        // gets a flat land field.
        const isSeaVariant = this._pendingVariantKey === "mk10" || this._pendingVariantKey === "mk11" || this._currentEnv === "sea";
        this.arena.build(isSeaVariant ? "sea" : "land");
        const aL = this.arena.layout;

        this.hqPos = { x: aL.hqPos.x, y: this._surfaceY(aL.hqPos.x, aL.hqPos.z), z: aL.hqPos.z };

        // Round 121 — DEFENDER PREPAREDNESS STATE.
        // Rolled once per scenario; persists for the duration. Adds
        // strategic variety: every OGRE deployment feels different.
        //
        //   SHOCKED (20%) — recent attack left defenses crippled.
        //                   Half the garages spawn pre-destroyed,
        //                   airport + depot at 40% HP, minefield empty.
        //   MINIMAL (60%) — baseline (existing behavior).
        //   FORTIFIED (20%) — defenders prepared. Double the mines,
        //                     all structures at full HP, drones cap at
        //                     5 instead of 3, plane cadence faster.
        //
        // The roll is shown via toast/HUD banner at scenario start
        // so the player knows what they're up against.
        const prepRoll = Math.random();
        if      (prepRoll < 0.20) this._preparedness = "shocked";
        else if (prepRoll < 0.80) this._preparedness = "minimal";
        else                       this._preparedness = "fortified";

        // Round 110 — pre-laid defenses: spawn a defender garage behind
        // each defender slot. Stationary concrete-gray bunkers that
        // give defenders a "home" structure on the battlefield. Persist
        // for the lifetime of the scenario (across waves); cleared in
        // stop(). Foundation for future pre-laid features (minefields,
        // drone depots, perimeter outposts).
        this._spawnGarages();
        // Round 111 — pre-laid defense: airport near HQ. Single
        // structure; periodically launches defender planes that strafe
        // the OGRE. Plane lifecycle ticked from main tick.
        this._spawnAirport();
        this._lastDefenderPlaneT = 0;
        // Round 112 — sea-env naval counterpart: dock + submarines.
        // Only spawns when current env is "sea"; gates internally.
        this._spawnDock();
        this._lastDefenderSubT = 0;
        // Round 114 — pre-laid minefield strip. Hidden until OGRE
        // approaches; tactical pressure on the OGRE's straight-line
        // approach to HQ.
        this._spawnMinefield();
        // Round 120 — pre-laid drone depot near HQ. Auto-spawns small
        // patrol drones that orbit the area and engage OGRE intruders.
        this._spawnDepot();
        this._lastDefenderDroneT = 0;
        // Round 121 — apply preparedness state AFTER everything is
        // spawned (so we can modify or destroy structures uniformly).
        this._applyPreparednessState();
        this.energy = STARTING_ENERGY + diff.energyBonus;
        this.projectiles.length = 0;
        this.minions.length = 0;
        this.drones.length = 0;
        this.wave = 0;
        this.score = 0;
        this.hqHp = HQ_HP;
        this.hqMaxHp = HQ_HP;
        // Round 8 — clear phantom / magnetic state
        this.cloaked = false;
        this._cloakTimer = 0;
        this.magneticActive = false;
        this._magneticTimer = 0;

        if (r) {
            const result = r.exec({
                type: "entity:spawnMesh",
                assetId: "ogre_hq",
                kind: "ogre_hq",
                x: this.hqPos.x, y: this.hqPos.y + 2, z: this.hqPos.z,
                scale: 4,
            });
            this.hqEntityId = result?.id ?? null;
        }

        // Pre-placed defenders — all start as machineguns.
        // Round 49 - in sea env, lift the defender Y to the water surface
        // (was sitting on terrain floor under 2m of water). Matches the
        // slot offset below so pre-placed + bought defenders are flush.
        this.defenders.length = 0;
        const defHp = Math.round(30 * diff.defHpMul);
        const defSeaOffset = (this._currentEnv === "sea") ? 2 : 0;
        for (let i = 0; i < DEFENDER_COUNT; i++) {
            const dx = (i - (DEFENDER_COUNT - 1) / 2) * DEFENDER_SPACING;
            const dz = this.arena.layout.defenderLineZ;
            const dy = this._surfaceY(dx, dz) + defSeaOffset;
            const def = {
                type: "machinegun",
                x: dx, y: dy, z: dz,
                hp: defHp, maxHp: defHp,
                lastFireT: 0,
                shotsFired: 0,
                targetPos: null,
                selected: false,
                entityId: null,
                aimYaw: 0,            // round 9 — aim direction (lerps toward fire target)
                _lastFireYaw: 0,
                recoilT: 0,           // round 49 — seconds left of recoil kick
                recoilOffset: 0,      // round 49 — mesh-local -X offset for tube
            };
            if (r) {
                const result = r.exec({
                    type: "entity:spawnMesh",
                    assetId: "defender",
                    kind: "defender",
                    x: dx, y: dy + 1, z: dz,
                    scale: 1.6,
                });
                def.entityId = result?.id ?? null;
            }
            this.defenders.push(def);
        }

        this.slots.length = 0;
        // Round 34 — in sea env, defenders are boat versions floating on
        // the water surface. Raise slot Y by water depth so the defender
        // entity renders as a boat hull at sea level instead of submerged.
        const seaOffset = (this._currentEnv === "sea") ? 2 : 0;
        for (const s of this.arena.layout.slotPositions) {
            const sy = this._surfaceY(s.x, s.z) + seaOffset;
            const slot = { x: s.x, y: sy, z: s.z, entityId: null, filled: false };
            if (r) {
                const result = r.exec({
                    type: "entity:spawnMesh",
                    assetId: "ogre_slot",
                    kind: "ogre_slot",
                    x: s.x, y: sy + 0.5, z: s.z,
                    scale: 1.2,
                });
                slot.entityId = result?.id ?? null;
            }
            this.slots.push(slot);
        }

        if (r) {
            const result = r.exec({
                type: "entity:spawnMesh",
                assetId: "ogre_target",
                kind: "ogre_target",
                x: 0, y: -100, z: 0,
                scale: 0.8,
            });
            this.targetMarkerEntityId = result?.id ?? null;
        }

        this.active = true;
        this.state  = "playing";
        this.startTime = performance.now() / 1000;
        this.endTime = 0;
        this.pendingBuySlot = null;

        if (this.camera) {
            // Round 43h - camera positioned above and slightly behind the
            // OGRE spawn, looking TOWARD the HQ (defenders side). The OGRE
            // marches in -Z direction, so we sit at +Z looking -Z.
            // Round 43m - was yaw=Math.PI (looking +Z, away from action).
            // Convention: yaw=0 means look -Z, which is what we want.
            const sp = this.arena?.layout?.ogreSpawn ?? { x: 0, z: 80 };
            this.camera.position.x = sp.x;
            this.camera.position.y = 60;
            this.camera.position.z = sp.z + 20;       // 20u behind spawn (further +Z)
            this.camera.yaw   = 0;                     // face -Z (toward defenders + OGRE march direction)
            this.camera.pitch = -0.35;                 // look down ~20 deg
            try { document.exitPointerLock?.(); } catch {}
            if (this.camera.locked != null) this.camera.locked = false;
        }

        if (this.eventBus) this.eventBus.publish?.({ type: "ogre:start" });

        // Spawn the first wave
        this._spawnWave();
        this._sfx("ogre_wave_start", 1.0);
        console.log("[OGRE] scenario started — wave 1: " + this.variant.name);

        // Round 131 — multiplayer arc round 35. After wave spawn the
        // canonical ogreMaxHp is set; emit ogre:start so server
        // initializes shared HP pool. Solo: just the one client
        // contributing. Multiplayer: anyone connecting later joins
        // the existing pool via the welcome snapshot.
        if (this.bridge?.emit) {
            this.bridge.emit("ogre:start", {
                maxHp: this.ogreMaxHp,
                wave: this.wave,
                variant: this.variantKey,
            });
        }
        // Round 42 — startup announcement
        const amStart = (typeof window !== "undefined") ? window.audioManager : null;
        amStart?.announce?.(`O. G. R. E. scenario engaged. Wave 1. ${this.variant.name}`);
    }

    // -------------------------------------------------------------- audio helpers (round 6)

    _sfx(type, vol = 1.0) {
        const am = (typeof window !== "undefined") ? window.audioManager : null;
        am?.audio?.playProcedural?.(type, vol);
    }

    _sfxAt(type, x, y, z) {
        const am = (typeof window !== "undefined") ? window.audioManager : null;
        if (am?.audio?.playSpatial && this.camera) {
            am.audio.playSpatial(type, x, y, z, this.camera);
        }
    }

    _spawnWave() {
        this.wave++;
        // Round 10 — every Nth wave is a boss with random variant
        this.isBossWave = (this.wave % BOSS_WAVE_INTERVAL === 0);
        let variantKey, variant;
        // Round 36 — explicit variant override (via ogre.start({variant:...})
        // or ogre.sub()). Set via this._pendingVariantKey at start time.
        if (this._pendingVariantKey && OGRE_VARIANTS[this._pendingVariantKey]) {
            variantKey = this._pendingVariantKey;
            variant = OGRE_VARIANTS[variantKey];
            this._pendingVariantKey = null;
        } else if (this._themedWaves) {
            // Round 209 — themed mode picks the variant by current env.
            // The env→variant map below produces visual/thematic match:
            //   sea  → mk10 (submarine) or mk11 (carrier), random
            //   hell → mk14 (hellcraft with demon propulsion)
            //   moon → mk12 (skylord hover; low-gravity flyer)
            //   mars → mk13 (jetfighter)
            //   earth → random from WAVE_ORDER (campaign ground variants)
            variantKey = _pickThemedVariant(this._currentEnvName ?? "earth", this.isBossWave);
            variant = OGRE_VARIANTS[variantKey] ?? OGRE_VARIANTS.mk1;
        } else if (this.isBossWave) {
            const keys = WAVE_ORDER;
            variantKey = keys[Math.floor(Math.random() * keys.length)];
            variant = OGRE_VARIANTS[variantKey];
        } else {
            variantKey = WAVE_ORDER[(this.wave - 1) % WAVE_ORDER.length];
            variant = OGRE_VARIANTS[variantKey];
        }
        this.variantKey = variantKey;
        // Round 43n - OGRE size bump. variant.scale gets a constant
        // bonus applied AT SPAWN so we don't have to touch every variant
        // entry. Variant scale feeds into hardpoint offsets, collision
        // halfW, and visual rescale — all proportional, all benefit.
        // BOSS_SCALE_MUL is multiplicative on top below.
        const sizedVariant = { ...variant, scale: variant.scale + OGRE_SIZE_BONUS };
        this.variant = sizedVariant;

        const cycle = Math.floor((this.wave - 1) / WAVE_ORDER.length);
        const hpMul = (1 + cycle * 0.4);
        const diff = OGRE_DIFFICULTIES[this.difficulty] ?? OGRE_DIFFICULTIES.normal;
        const bossHpMul = this.isBossWave ? BOSS_HP_MUL : 1.0;
        const bossScaleMul = this.isBossWave ? BOSS_SCALE_MUL : 1.0;

        // Round 206 — multi-lane spawn selection. Wave N picks lane
        // (N-1) % laneCount. Single-lane arenas (default) trivially
        // return lane 0 = legacy center spawn.
        const laneIndex = this.arena.pickLaneForWave(this.wave);
        const laneSpawn = this.arena.getLaneSpawn(laneIndex);

        const spawned = this.kaijuManager._spawn({
            x: laneSpawn.x,
            // Round 106-107 — flying variants hover. Base ground
            // clearance is +2; ANY flying variant (special starts with
            // "flying_") rides at +8 so defenders could (with luck)
            // drive a tank underneath. Movement tick uses the same
            // ternary.
            y: this._surfaceY(laneSpawn.x, laneSpawn.z) + ((variant.special ?? "").startsWith("flying") ? 8 : 2),
            z: laneSpawn.z,
            kind: variant.kind,
            targetCivId: null,
        });
        this.ogre = spawned;
        if (this.ogre) {
            this.ogre._isOgre = true;
            // Round 88 — OGRE never retreats. The generic Kaiju AI's
            // "retreat-when-low" state (Kaiju.js:226) was pulling the
            // OGRE off the battlefield mid-fight. With this flag set,
            // the OGRE always advances toward the city; if it can't
            // make progress for STUCK_THRESHOLD_SEC, it self-detonates
            // via _triggerOgreNuke().
            this.ogre.noRetreat = true;
            this.ogreMaxHp = Math.round(variant.hp * hpMul * diff.hpMul * bossHpMul);
            this.ogreHp = this.ogreMaxHp;
            // v1483 — sensor system. Gates how far the OGRE can see/target. Healthy = full
            // sight (baseRange covers the arena, so no change to current play); combat damage
            // degrades it (see applyOgreDamage); the engineer seat repairs it.
            this.sensors = { hp: 100, maxHp: 100, baseRange: 120 };
            // v1484 — nanite engineering swarm. A regenerating pool of nano-repair boxes
            // that the engineer seat directs: swarm + repair the most-damaged system
            // (sensors / hardpoints / chassis), OR convert themselves into shell / flame-
            // fuel reserves (repair-vs-rearm tradeoff). Default idle so balance is unchanged
            // until a crewed engineer (or local window.ogreEngineering) directs them.
            this.nanites = { pool: 100, max: 100, regen: 5, mode: "idle", target: "auto" };
            this.ammo = { shells: 0, fuel: 0 };
            this.ogre.state = "seeking";
            this.ogre.target = null;
            this.ogre.targetCivId = null;
            this.ogre._ogreRescaled = false;
            this.ogre._bossScaleMul = bossScaleMul;
            this._scheduleOgreRescale();
            // Round 88 — stuck-detection state. Track distance-to-HQ
            // over time; if it doesn't decrease meaningfully, nuke.
            this._ogreStuckTimer = 0;
            this._ogreLastDistToHQ = Infinity;
            this._ogreNuking = false;

            // Round 206 — plan a path from the lane spawn to HQ via the
            // existing PathPlanner so the OGRE routes AROUND hills instead
            // of plowing straight through. Each spawn gets its own path
            // since lanes spawn at different X positions. The OGRE follows
            // waypoints in its movement tick; when within waypointAdvanceR
            // of the current waypoint, it advances to the next.
            //
            // Flying variants skip pathing — they hover above terrain.
            // Single-lane legacy is still planned (gives smoother routes
            // even on lane 0).
            this.ogre._path = null;
            this.ogre._pathIndex = 0;
            this.ogre._laneIndex = laneIndex;
            if (!(variant.special ?? "").startsWith("flying")) {
                try {
                    if (!this._pathPlanner) {
                        // Lazy-init the planner. heightAt is bound to our
                        // _surfaceY which already does a surface scan.
                        const PathPlannerMod = this._PathPlannerCtor;
                        if (PathPlannerMod) {
                            this._pathPlanner = new PathPlannerMod({
                                heightAt:    (x, z) => this._surfaceY(x, z) - 1,
                                gridSize:    8,            // 8u grid; arena is ~120u so ~15 cells across
                                maxStepUp:   3,
                                maxStepDown: 6,
                                maxSearch:   1500,
                                slopePenalty: 0.5,
                            });
                        }
                    }
                    if (this._pathPlanner) {
                        const path = this._pathPlanner.planSmoothed(
                            laneSpawn.x, laneSpawn.z,
                            this.hqPos.x, this.hqPos.z
                        );
                        if (path && path.length > 0) {
                            this.ogre._path = path;
                            this.ogre._pathIndex = 0;
                            console.log(`[OGRE] lane ${laneIndex}: planned path with ${path.length} waypoints (${laneSpawn.x.toFixed(0)},${laneSpawn.z.toFixed(0)}) → (${this.hqPos.x.toFixed(0)},${this.hqPos.z.toFixed(0)})`);
                        } else {
                            console.warn(`[OGRE] lane ${laneIndex}: no path found; falling back to direct movement`);
                        }
                    }
                } catch (e) {
                    console.warn("[OGRE] path planning threw:", e?.message || e);
                }
            }

            // Round 96 — register with camera as orbit target. The camera
            // doesn't enter orbit mode automatically; user toggles via
            // Settings → "OGRE Cam". When that toggle's on, camera will
            // already be in ogre_orbit and this sets a live target it
            // can follow.
            if (typeof window !== "undefined" && window.camera?.setOrbitTarget) {
                window.camera.setOrbitTarget(this.ogre);
            }
            // Round 101 — PalChat M1↔M2 reacts to OGRE arrival. Best-
            // effort: no-op when PalChat is disabled or Ollama is
            // unreachable. Coordinates rounded for readability.
            if (typeof window !== "undefined" && window.palChat?.isEnabled?.()) {
                const px = Math.round(this.ogre?.position?.x ?? 0);
                const pz = Math.round(this.ogre?.position?.z ?? 0);
                window.palChat.generate(`An OGRE chassis just spawned and rolled onto the battlefield at coordinates (${px}, ${pz}).`);
            }

            // Round 43d — entry animation. OGRE breaks through the
            // breach in the far wall — scale fades in over 1.5s, smoke
            // burst at the spawn point, advance starts immediately so it
            // physically drives onto the field as it materializes.
            this.ogre._entryT = 0;
            this.ogre._entryDur = 1.5;
            this._spawnBreachEffect();
        }
        this.phase = 1;
        this._lastPlasmaT = 0;
        this._lastUndersideT = 0;     // round 107
        this._lastSpawnT = 0;
        this._prevOgrePos = { x: this.arena.layout.ogreSpawn.x, y: 0, z: this.arena.layout.ogreSpawn.z };
        this._lastTrackT = 0;
        if (variant.special === "aegis") {
            this.shieldHp = (variant.shieldHp ?? SHIELD_HP_MK6) * diff.hpMul * bossHpMul;
            this.shieldMaxHp = this.shieldHp;
        } else {
            this.shieldHp = 0;
            this.shieldMaxHp = 0;
        }
        this._scannerSweep = 0;
        this.cloaked = false;
        this._cloakTimer = 0;
        this.magneticActive = false;
        this._magneticTimer = 0;
        this.weaponDisabled = false;
        this.engineDisabled = false;
        this.specialDisabled = false;
        this.sensorDisabled = false;
        // Round 10 — reset splitter
        this.shards = [];
        this._didSplit = false;
        this._lastShimmerT = 0;
        this._spawnHardpoints();
        // Round 16 — spawn rig parts (turret, cannon, treads)
        this._spawnRig();
        // Round 35 — point-defense turrets ring the chassis. Six small
        // turrets distributed around the OGRE perimeter, each independently
        // tracks the nearest sea mine / torpedo in range and fires laser
        // pulses to destroy them.
        this._spawnPointDefense();
        // Round 255 — wave-spawn callback. External systems (main.js)
        // can subscribe to populate defender slots with bot_turret
        // entities (arena.placeTurrets). The callback receives the
        // current wave number + the arena reference.
        try { this._onWaveSpawned?.(this.wave, this.arena); } catch (e) {
            console.warn("[OgreScenario] _onWaveSpawned hook threw:", e);
        }
    }

    // -------------------------------------------------------------- hard points (round 9)

    _spawnHardpoints() {
        // Despawn any prior hard points
        if (this.router) {
            for (const key of Object.keys(this.hardpoints)) {
                const h = this.hardpoints[key];
                if (h.entityId != null) {
                    this.router.exec({ type: "entity:despawn", id: h.entityId });
                }
            }
        }
        this.hardpoints = {};
        if (!this.ogre) return;
        const scaleMul = (this.variant?.scale ?? 4) / 4;
        for (const key of Object.keys(HARDPOINTS_DEF)) {
            const def = HARDPOINTS_DEF[key];
            // Skip tech_module if variant has no special
            if (key === "tech_module" && !this.variant.special) continue;
            // Round 108 — generalized variantSpecial gate. If a hardpoint
            // declares `variantSpecial: "<key>"`, spawn it ONLY when
            // variant.special matches exactly. Currently used by the
            // four demon hardpoints (flying_demons-only). Hardpoints
            // without variantSpecial set spawn on all variants as
            // before.
            if (def.variantSpecial !== undefined && def.variantSpecial !== this.variant.special) continue;
            const wx = this.ogre.position.x + def.offset.x * scaleMul;
            const wy = this.ogre.position.y + def.offset.y * scaleMul;
            const wz = this.ogre.position.z + def.offset.z * scaleMul;
            const hp = { x: wx, y: wy, z: wz, hp: def.hp, maxHp: def.hp, destroyed: false, entityId: null, def, key };
            if (this.router) {
                const result = this.router.exec({
                    type: "entity:spawnMesh",
                    assetId: def.kind,
                    kind: def.kind,
                    x: wx, y: wy, z: wz,
                    scale: def.radius * 0.7,
                });
                hp.entityId = result?.id ?? null;
            }
            this.hardpoints[key] = hp;
        }
    }

    _moveHardpoints() {
        if (!this.ogre) return;
        const scaleMul = (this.variant?.scale ?? 4) / 4;
        const fwdX = this.ogre.position.x - (this._prevOgrePos?.x ?? this.ogre.position.x);
        const fwdZ = this.ogre.position.z - (this._prevOgrePos?.z ?? this.ogre.position.z);
        const yaw = Math.atan2(fwdX, fwdZ) || 0;
        const cosY = Math.cos(yaw), sinY = Math.sin(yaw);
        for (const key of Object.keys(this.hardpoints)) {
            const h = this.hardpoints[key];
            // Always recompute world position (even when destroyed) so
            // we know where to emit smoke from. Round 25.
            const ox = h.def.offset.x * scaleMul;
            const oy = h.def.offset.y * scaleMul;
            const oz = h.def.offset.z * scaleMul;
            const rx = ox * cosY + oz * sinY;
            const rz = -ox * sinY + oz * cosY;
            h.x = this.ogre.position.x + rx;
            h.y = this.ogre.position.y + oy;
            h.z = this.ogre.position.z + rz;
            if (h.destroyed) {
                // Round 28 — keep dent decal pinned to chassis position
                if (h.dentEntityId != null && this.router) {
                    this.router.exec({
                        type: "entity:move",
                        id: h.dentEntityId,
                        x: h.x, y: h.y, z: h.z,
                    });
                }
                // Round 25 — persistent smoke at destroyed hardpoint.
                // Emits for HARDPOINT_SMOKE_TTL (30s) after destruction
                // with intensity decaying linearly. Reads as "wound on
                // the chassis still smoldering."
                const t = performance.now() * 0.001;
                const age = h.destroyedT != null ? (t - h.destroyedT) : Infinity;
                if (age < 30 && this.particles?.spawn) {
                    const intensity = 1 - age / 30;
                    if (Math.random() < 0.5 * intensity) {
                        this.particles.spawn({
                            x: h.x + (Math.random() - 0.5) * 0.6,
                            y: h.y + 0.3,
                            z: h.z + (Math.random() - 0.5) * 0.6,
                            vy: 1.0 + Math.random() * 0.8,
                            vx: (Math.random() - 0.5) * 0.4,
                            vz: (Math.random() - 0.5) * 0.4,
                            ttl: 1.5, size: 0.5,
                            r: 0.20, g: 0.18, b: 0.20, a: 0.6 * intensity,
                            gravity: -1,
                        });
                        // Embers in first 5s
                        if (age < 5 && Math.random() < 0.15) {
                            this.particles.spawn({
                                x: h.x + (Math.random() - 0.5) * 0.4,
                                y: h.y + 0.4,
                                z: h.z + (Math.random() - 0.5) * 0.4,
                                vy: 1 + Math.random() * 1.5,
                                ttl: 0.4, size: 0.28,
                                r: 1.0, g: 0.55, b: 0.15, a: 1.0,
                            });
                        }
                    }
                }
                continue;
            }
            if (h.entityId != null && this.router) {
                this.router.exec({
                    type: "entity:move",
                    id: h.entityId,
                    x: h.x, y: h.y, z: h.z,
                });
                // Round 52 - HP-threshold clip for hardpoint meshes.
                // Healthy -> "idle", under 50% HP -> "damaged" (smoke,
                // limp, sag — whatever the rig defines). Destroyed
                // hardpoints despawn before reaching here, so we don't
                // need a "death" clip. Edge-triggered on threshold
                // crossings only.
                const want = (h.hp < h.maxHp * 0.5) ? "damaged" : "idle";
                if (h._lastClipState !== want) {
                    this.router.exec({
                        type: "entity:setAnimClip",
                        id: h.entityId,
                        clip: want,
                    });
                    h._lastClipState = want;
                }
            }
        }
    }

    // ---------------------------------------------------------------- rig (round 16)

    _spawnRig() {
        if (!this.ogre || !this.router) return;
        this._aimYaw = 0;
        // Round 109 — initial chassis yaw faces TOWARD HQ instead of
        // defaulting to 0 (which is +Z facing). Previously, OGREs spawning
        // at the back of the arena (high +Z) would face away from HQ
        // (which is at -Z), requiring a full 180° pivot before they
        // could advance. Now we point them at the target on spawn so
        // they start moving forward immediately.
        if (this.hqPos && this.ogre.position) {
            const dx = this.hqPos.x - this.ogre.position.x;
            const dz = this.hqPos.z - this.ogre.position.z;
            this._chassisYaw = Math.atan2(dx, dz);
            this._lastChassisYawSample = this._chassisYaw;  // round 108 banking baseline
        } else {
            this._chassisYaw = 0;
        }
        this._techCascadeDone = false;     // round 21 — reset cascade flag
        this._lastOgreHp = this.ogreHp;    // round 23 — reset damage-flash tracking
        this._flashUntilT = 0;
        this._lastChassisColorMul = 1.0;
        const scaleMul = (this.variant?.scale ?? 4) / 4;
        // Base rig (turret, cannon, treads) — always spawn, except
        // round 106-107: skip treadL/treadR for ANY flying variant
        // (special starts with "flying_*"). Sub-OGREs hover or jet
        // or get demon-towed instead of rolling on treads.
        const isFlying = (this.variant?.special ?? "").startsWith("flying");
        for (const key of Object.keys(OGRE_RIG_DEF)) {
            if (isFlying && (key === "treadL" || key === "treadR")) continue;
            const def = OGRE_RIG_DEF[key];
            const wx = this.ogre.position.x + def.offset.x * scaleMul;
            const wy = this.ogre.position.y + def.offset.y * scaleMul;
            const wz = this.ogre.position.z + def.offset.z * scaleMul;
            const result = this.router.exec({
                type: "entity:spawnMesh",
                assetId: def.kind,
                kind: def.kind,
                x: wx, y: wy, z: wz,
                scale: def.scale * scaleMul,
            });
            this.rig[key] = {
                entityId: result?.id ?? null,
                def,
                recoilOffset: 0,
                recoilT: 0,
            };
        }
        // Round 17 — variant-specific rig parts. Spawn if variantSpecial
        // matches OR if variantSpecial=null (always-on parts like smoke stacks).
        const special = this.variant?.special;
        for (const key of Object.keys(VARIANT_RIG_DEF)) {
            const def = VARIANT_RIG_DEF[key];
            const isAlwaysOn = (def.variantSpecial === null || def.variantSpecial === undefined);
            if (!isAlwaysOn && def.variantSpecial !== special) continue;
            const wx = this.ogre.position.x + def.offset.x * scaleMul;
            const wy = this.ogre.position.y + def.offset.y * scaleMul;
            const wz = this.ogre.position.z + def.offset.z * scaleMul;
            const result = this.router.exec({
                type: "entity:spawnMesh",
                assetId: def.kind,
                kind: def.kind,
                x: wx, y: wy, z: wz,
                scale: def.scale * scaleMul,
            });
            this.rig[key] = {
                entityId: result?.id ?? null,
                def,
                spinAngle: 0,        // accumulated yaw for spin parts
                openState: 0,        // 0..1 fraction open for hatches
                openT: 0,            // time since open trigger
                openTrig: false,     // active open animation in progress
            };
        }
    }

    _despawnRig() {
        if (!this.router) { this.rig = {}; return; }
        for (const key of Object.keys(this.rig)) {
            const r = this.rig[key];
            if (r.entityId != null) {
                this.router.exec({ type: "entity:despawn", id: r.entityId });
            }
        }
        this.rig = {};
    }

    // Round 35 — Point-defense turret system. Six small turrets ring the
    // OGRE chassis at evenly-spaced bearings. Each frame they pick the
    // nearest threat (sea_mine or torpedo) within range, aim at it, and
    // fire fast laser pulses. Threats have hp; on destruction they pop
    // quietly without detonating against OGRE.
    // Round 112 — defender naval dock. Sea-env equivalent of the
    // airport. Single pre-laid structure near HQ; spawns when current
    // env is "sea". Periodically launches defender submarines that
    // approach the OGRE submerged + surface to fire torpedoes.
    // Destructible (40 HP); destroying it halts sub launches.
    _spawnDock() {
        this._despawnDock();
        if (!this.router || !this.arena?.layout) return;
        if (this._currentEnv !== "sea") return;     // sea-only
        const aL = this.arena.layout;
        const hqDir = (aL.hqPos.z < 0) ? -1 : 1;
        // Offset the OPPOSITE side from the airport (-x vs +x) so both
        // structures don't visually overlap on sea arenas (the airport
        // still spawns but might be on a small islet near HQ).
        const dx = aL.hqPos.x - 12;
        const dz = aL.hqPos.z + hqDir * 8;
        const dy = this._surfaceY(dx, dz) + 2.0;
        const r = this.router.exec({
            type: "entity:spawnMesh",
            assetId: "defender_dock",
            kind: "defender_dock",
            x: dx, y: dy, z: dz,
            scale: 4.0,
        });
        if (r?.id != null) {
            this._dock = {
                x: dx, y: dy, z: dz,
                entityId: r.id,
                hp: 60, maxHp: 60,
                destroyed: false,
                radius: 3.0,
            };
        }
    }

    _despawnDock() {
        if (this.router && this._dock?.entityId != null) {
            this.router.exec({ type: "entity:despawn", id: this._dock.entityId });
        }
        if (this.router && this._dock?.ruinEntityId != null) {
            this.router.exec({ type: "entity:despawn", id: this._dock.ruinEntityId });
        }
        this._dock = null;
    }

    // Round 112 — launch a defender sub from the dock. Submerged
    // patrol (periscope visible at water surface) toward OGRE.
    // Capped at 2 in field. Cadence 12s.
    _maybeLaunchDefenderSub(t) {
        if (!this._dock || this._dock.destroyed) return;
        if (this._currentEnv !== "sea") return;
        if (!this.ogre || !this.active) return;
        const interval = 12.0;
        if ((t - (this._lastDefenderSubT || 0)) < interval) return;
        if (this.defenderSubs.length >= 2) return;
        this._lastDefenderSubT = t;

        // Spawn at dock surface
        const sx = this._dock.x;
        const sz = this._dock.z;
        const seaY = this._surfaceY(sx, sz);     // water surface
        const periR = this.router.exec({
            type: "entity:spawnMesh",
            assetId: "defender_sub_periscope",
            kind: "defender_sub_periscope",
            x: sx, y: seaY + 0.6, z: sz,
            scale: 0.5,
        });
        this.defenderSubs.push({
            x: sx, z: sz,
            seaY,
            target: { x: this.ogre.position.x, z: this.ogre.position.z },
            age: 0,
            ttl: 30,
            lastFireT: 0,
            hp: 30,
            periscopeId: periR?.id ?? null,
            // Phase: "approaching" (moves toward OGRE), "firing" (briefly
            // surfaced, periscope up + torpedo launched), "diving" (just
            // submerged after firing — cool-down)
            phase: "approaching",
            phaseT: 0,
        });

        // Bubble puff at launch
        if (this.particles?.spawn) {
            for (let n = 0; n < 12; n++) {
                const a = Math.random() * Math.PI * 2;
                this.particles.spawn({
                    x: sx + Math.cos(a) * 1.4,
                    y: seaY + 0.2,
                    z: sz + Math.sin(a) * 1.4,
                    vx: 0, vy: 0.4 + Math.random() * 0.4, vz: 0,
                    ttl: 0.8, size: 0.4,
                    r: 0.85, g: 0.9, b: 0.95, a: 0.7,
                    gravity: 0,
                });
            }
        }
    }

    _tickDefenderSubs(dt, t) {
        this._maybeLaunchDefenderSub(t);
        if (!this.defenderSubs || this.defenderSubs.length === 0) return;
        const SUB_SPEED = 9;          // u/s
        const SUB_FIRE_RANGE = 50;
        const SUB_FIRE_COOLDOWN = 5;
        for (let i = this.defenderSubs.length - 1; i >= 0; i--) {
            const s = this.defenderSubs[i];
            s.age += dt;
            s.phaseT += dt;
            // Track OGRE position
            if (this.ogre) {
                s.target.x = this.ogre.position.x;
                s.target.z = this.ogre.position.z;
            }
            const dx = s.target.x - s.x;
            const dz = s.target.z - s.z;
            const dist = Math.hypot(dx, dz) || 1;
            // Approach motion (always — sub keeps closing on OGRE)
            s.x += (dx / dist) * SUB_SPEED * dt;
            s.z += (dz / dist) * SUB_SPEED * dt;
            // Phase transitions:
            //   approaching → firing once in range + cooldown passed
            //   firing → diving after 0.8s (just enough to be visible)
            //   diving → approaching after 1.2s
            if (s.phase === "approaching"
                && dist < SUB_FIRE_RANGE
                && (t - s.lastFireT) > SUB_FIRE_COOLDOWN) {
                s.phase = "firing"; s.phaseT = 0;
                this._defenderSubFireTorpedo(s);
                s.lastFireT = t;
            } else if (s.phase === "firing" && s.phaseT > 0.8) {
                s.phase = "diving"; s.phaseT = 0;
            } else if (s.phase === "diving" && s.phaseT > 1.2) {
                s.phase = "approaching"; s.phaseT = 0;
            }
            // Move periscope entity to follow sub. Periscope is just
            // above water surface; brief +0.5 lift during "firing"
            // phase as visual hint the sub is at periscope depth and
            // engaged.
            if (s.periscopeId != null && this.router) {
                const periscopeY = s.seaY + 0.6 + (s.phase === "firing" ? 0.5 : 0);
                this.router.exec({
                    type: "entity:move",
                    id: s.periscopeId,
                    x: s.x, y: periscopeY, z: s.z,
                });
            }
            // Wake trail behind periscope (very subtle, since sub is
            // mostly submerged)
            if (this.particles?.spawn && Math.random() < 0.4) {
                const wakeX = s.x - (dx / dist) * 1.2;
                const wakeZ = s.z - (dz / dist) * 1.2;
                this.particles.spawn({
                    x: wakeX + (Math.random() - 0.5) * 0.6,
                    y: s.seaY + 0.05,
                    z: wakeZ + (Math.random() - 0.5) * 0.6,
                    vx: 0, vy: 0.1, vz: 0,
                    ttl: 1.0, size: 0.3,
                    r: 0.95, g: 0.97, b: 1.0, a: 0.55,
                    gravity: 0,
                });
            }
            // Death
            if (s.hp <= 0 || s.age >= s.ttl) {
                if (s.hp <= 0 && this.particles?.spawn) {
                    for (let n = 0; n < 20; n++) {
                        const a = Math.random() * Math.PI * 2;
                        const sp = 3 + Math.random() * 5;
                        this.particles.spawn({
                            x: s.x, y: s.seaY + 0.3, z: s.z,
                            vx: Math.cos(a) * sp,
                            vy: 1 + Math.random() * 4,
                            vz: Math.sin(a) * sp,
                            ttl: 1.0, size: 0.7,
                            r: 1.0, g: 0.6, b: 0.2, a: 1.0,
                            gravity: 10,
                        });
                    }
                    this._sfxAt?.("ogre_artillery_impact", s.x, s.seaY, s.z);
                }
                if (s.periscopeId != null && this.router) {
                    this.router.exec({ type: "entity:despawn", id: s.periscopeId });
                }
                this.defenderSubs.splice(i, 1);
            }
        }
    }

    // Round 112 — defender sub torpedo. Horizontal water-line strike
    // toward OGRE. Reuses the existing torpedo projectile pattern
    // from the defender_submarine turret type (round 36).
    _defenderSubFireTorpedo(s) {
        if (!this.ogre) return;
        const tx = this.ogre.position.x;
        const tz = this.ogre.position.z;
        const dx = tx - s.x, dz = tz - s.z;
        const horiz = Math.hypot(dx, dz) || 1;
        const TORP_SPEED = 16;
        this.projectiles.push({
            team: "defender",
            x: s.x, y: s.seaY + 1.0, z: s.z,
            vx: dx / horiz * TORP_SPEED,
            vy: 0,
            vz: dz / horiz * TORP_SPEED,
            ttl: horiz / TORP_SPEED + 0.6,
            type: { damage: 12, aoe: 0, projColor: [0.95, 0.95, 0.95] },
            torpedo: true,
            hp: 1,
        });
        if (this.particles?.spawn) {
            // Surface splash + bubble plume on firing
            for (let n = 0; n < 16; n++) {
                const a = Math.random() * Math.PI * 2;
                const sp = 1 + Math.random() * 2.5;
                this.particles.spawn({
                    x: s.x + Math.cos(a) * 0.8,
                    y: s.seaY + 0.3,
                    z: s.z + Math.sin(a) * 0.8,
                    vx: Math.cos(a) * sp,
                    vy: 1.5 + Math.random() * 2,
                    vz: Math.sin(a) * sp,
                    ttl: 0.7, size: 0.45,
                    r: 0.92, g: 0.95, b: 1.0, a: 0.9,
                    gravity: 4,
                });
            }
        }
        this._sfxAt?.("ogre_artillery_impact", s.x, s.seaY, s.z);
    }

    _clearDefenderSubs() {
        if (!this.defenderSubs) return;
        if (this.router) {
            for (const s of this.defenderSubs) {
                if (s.periscopeId != null) {
                    this.router.exec({ type: "entity:despawn", id: s.periscopeId });
                }
            }
        }
        this.defenderSubs.length = 0;
    }

    // Round 113 — OGRE escort sub launch. mk10 sub-OGRE only. Each
    // escort is a smaller-faster sub that hunts defender subs.
    // Reuses defender-sub physics structure (periscope-visible 3-phase
    // cycle) but with reversed allegiance — torpedoes are team="ogre"
    // and target defender subs first, defenders second.
    _maybeLaunchEscortSub(t) {
        if (this.variant?.special !== "submarine") return;
        if (this._currentEnv !== "sea") return;
        if (!this.ogre || !this.active) return;
        const interval = 15.0;
        if ((t - (this._lastEscortSubT || 0)) < interval) return;
        if (this.escortSubs.length >= 2) return;
        this._lastEscortSubT = t;

        // Launch from OGRE position (sub spawns from the sub-OGRE)
        const sx = this.ogre.position.x;
        const sz = this.ogre.position.z;
        const seaY = this._surfaceY(sx, sz);
        const periR = this.router.exec({
            type: "entity:spawnMesh",
            assetId: "ogre_escort_sub_periscope",
            kind: "ogre_escort_sub_periscope",
            x: sx, y: seaY + 0.6, z: sz,
            scale: 0.5,
        });
        // Initial target: a defender sub if any in field, else fall
        // back to nearest defender ground.
        const targetSub = this._nearestDefenderSubFromPos(sx, sz);
        const targetX = targetSub ? targetSub.x : 0;
        const targetZ = targetSub ? targetSub.z : 0;
        this.escortSubs.push({
            x: sx, z: sz,
            seaY,
            target: { x: targetX, z: targetZ },
            age: 0,
            ttl: 35,
            lastFireT: 0,
            hp: 30,
            periscopeId: periR?.id ?? null,
            phase: "approaching",
            phaseT: 0,
        });
        if (this.particles?.spawn) {
            for (let n = 0; n < 12; n++) {
                const a = Math.random() * Math.PI * 2;
                this.particles.spawn({
                    x: sx + Math.cos(a) * 1.4,
                    y: seaY + 0.2,
                    z: sz + Math.sin(a) * 1.4,
                    vx: 0, vy: 0.4 + Math.random() * 0.4, vz: 0,
                    ttl: 0.8, size: 0.4,
                    r: 0.95, g: 0.8, b: 0.75, a: 0.7,
                    gravity: 0,
                });
            }
        }
    }

    _nearestDefenderSubFromPos(x, z) {
        if (!this.defenderSubs) return null;
        let best = null, bestD2 = Infinity;
        for (const s of this.defenderSubs) {
            if (s.hp <= 0) continue;
            const dx = s.x - x, dz = s.z - z;
            const d2 = dx * dx + dz * dz;
            if (d2 < bestD2) { bestD2 = d2; best = s; }
        }
        return best;
    }

    _tickEscortSubs(dt, t) {
        this._maybeLaunchEscortSub(t);
        if (!this.escortSubs || this.escortSubs.length === 0) return;
        const SPEED = 10;        // slightly faster than defender subs
        const FIRE_RANGE = 45;
        const FIRE_COOLDOWN = 4.5;
        for (let i = this.escortSubs.length - 1; i >= 0; i--) {
            const s = this.escortSubs[i];
            s.age += dt;
            s.phaseT += dt;
            // Re-acquire target each tick — hunt nearest live defender sub
            const tgt = this._nearestDefenderSubFromPos(s.x, s.z);
            if (tgt) {
                s.target.x = tgt.x;
                s.target.z = tgt.z;
            }
            const hasTarget = !!tgt;
            const dx = s.target.x - s.x;
            const dz = s.target.z - s.z;
            const dist = Math.hypot(dx, dz) || 1;
            if (hasTarget) {
                s.x += (dx / dist) * SPEED * dt;
                s.z += (dz / dist) * SPEED * dt;
            }
            if (s.phase === "approaching"
                && hasTarget && dist < FIRE_RANGE
                && (t - s.lastFireT) > FIRE_COOLDOWN) {
                s.phase = "firing"; s.phaseT = 0;
                this._escortSubFireTorpedo(s, tgt);
                s.lastFireT = t;
            } else if (s.phase === "firing" && s.phaseT > 0.8) {
                s.phase = "diving"; s.phaseT = 0;
            } else if (s.phase === "diving" && s.phaseT > 1.2) {
                s.phase = "approaching"; s.phaseT = 0;
            }
            if (s.periscopeId != null && this.router) {
                const periscopeY = s.seaY + 0.6 + (s.phase === "firing" ? 0.5 : 0);
                this.router.exec({
                    type: "entity:move",
                    id: s.periscopeId,
                    x: s.x, y: periscopeY, z: s.z,
                });
            }
            // Reddish wake trail (vs defender's blueish)
            if (this.particles?.spawn && Math.random() < 0.4 && hasTarget) {
                const wakeX = s.x - (dx / dist) * 1.2;
                const wakeZ = s.z - (dz / dist) * 1.2;
                this.particles.spawn({
                    x: wakeX + (Math.random() - 0.5) * 0.6,
                    y: s.seaY + 0.05,
                    z: wakeZ + (Math.random() - 0.5) * 0.6,
                    vx: 0, vy: 0.1, vz: 0,
                    ttl: 1.0, size: 0.3,
                    r: 1.0, g: 0.85, b: 0.85, a: 0.55,
                    gravity: 0,
                });
            }
            if (s.hp <= 0 || s.age >= s.ttl) {
                if (s.hp <= 0 && this.particles?.spawn) {
                    for (let n = 0; n < 20; n++) {
                        const a = Math.random() * Math.PI * 2;
                        const sp = 3 + Math.random() * 5;
                        this.particles.spawn({
                            x: s.x, y: s.seaY + 0.3, z: s.z,
                            vx: Math.cos(a) * sp,
                            vy: 1 + Math.random() * 4,
                            vz: Math.sin(a) * sp,
                            ttl: 1.0, size: 0.7,
                            r: 1.0, g: 0.6, b: 0.2, a: 1.0,
                            gravity: 10,
                        });
                    }
                    this._sfxAt?.("ogre_artillery_impact", s.x, s.seaY, s.z);
                }
                if (s.periscopeId != null && this.router) {
                    this.router.exec({ type: "entity:despawn", id: s.periscopeId });
                }
                this.escortSubs.splice(i, 1);
            }
        }
    }

    _escortSubFireTorpedo(s, target) {
        if (!target) return;
        const tx = target.x;
        const tz = target.z;
        const dx = tx - s.x, dz = tz - s.z;
        const horiz = Math.hypot(dx, dz) || 1;
        const TORP_SPEED = 16;
        this.projectiles.push({
            team: "ogre",
            x: s.x, y: s.seaY + 1.0, z: s.z,
            vx: dx / horiz * TORP_SPEED,
            vy: 0,
            vz: dz / horiz * TORP_SPEED,
            ttl: horiz / TORP_SPEED + 0.6,
            type: { damage: 12, aoe: 0, projColor: [1.0, 0.85, 0.85] },
            torpedo: true,
            // Round 113 — mark this torpedo as targeting defender subs
            // so the hit loop knows to test against them
            antiSubTorpedo: true,
        });
        if (this.particles?.spawn) {
            for (let n = 0; n < 16; n++) {
                const a = Math.random() * Math.PI * 2;
                const sp = 1 + Math.random() * 2.5;
                this.particles.spawn({
                    x: s.x + Math.cos(a) * 0.8,
                    y: s.seaY + 0.3,
                    z: s.z + Math.sin(a) * 0.8,
                    vx: Math.cos(a) * sp,
                    vy: 1.5 + Math.random() * 2,
                    vz: Math.sin(a) * sp,
                    ttl: 0.7, size: 0.45,
                    r: 1.0, g: 0.9, b: 0.9, a: 0.9,
                    gravity: 4,
                });
            }
        }
        this._sfxAt?.("ogre_artillery_impact", s.x, s.seaY, s.z);
    }

    _clearEscortSubs() {
        if (!this.escortSubs) return;
        if (this.router) {
            for (const s of this.escortSubs) {
                if (s.periscopeId != null) {
                    this.router.exec({ type: "entity:despawn", id: s.periscopeId });
                }
            }
        }
        this.escortSubs.length = 0;
    }

    // Round 114 — minefield placement. Scatter mines across a strip
    // between mid-arena (z=0) and 30u in front of the defender line.
    // Each mine sits at terrain surface, invisible. When OGRE
    // approaches within REVEAL_DIST (10u), a small red warning bump
    // entity is spawned at the mine position. When OGRE approaches
    // within TRIGGER_DIST (2.5u), the mine detonates: damages OGRE
    // chassis, damages nearest hardpoint, big explosion FX.
    //
    // The OGRE can choose to:
    //   1. Detour around revealed mines (the marker is bright red)
    //   2. Drive through them anyway (each costs HP)
    //   3. Shoot revealed mines from range (detonates with no self-damage)
    _spawnMinefield() {
        this._despawnMinefield();
        if (!this.router || !this.arena?.layout) return;
        if (!this._minefield) this._minefield = [];
        const aL = this.arena.layout;
        // Strip spans across the arena width, between mid-arena and
        // 30u forward of defender slot line.
        const halfW = aL.halfWidth * 0.85;       // a bit inset from edges
        const zStart = 0;
        const zEnd   = aL.defenderLineZ + 30;
        const MINE_COUNT = 25;
        for (let i = 0; i < MINE_COUNT; i++) {
            const mx = (Math.random() - 0.5) * 2 * halfW;
            const mz = zStart + Math.random() * (zEnd - zStart);
            const my = this._surfaceY(mx, mz);
            this._minefield.push({
                x: mx, y: my, z: mz,
                triggered: false,
                revealed: false,
                revealEntityId: null,
            });
        }
    }

    _despawnMinefield() {
        if (this.router && this._minefield) {
            for (const m of this._minefield) {
                if (m.revealEntityId != null) {
                    this.router.exec({ type: "entity:despawn", id: m.revealEntityId });
                }
            }
            this._minefield.length = 0;
        }
    }

    // Round 114 — per-tick minefield logic. Iterates all live mines,
    // reveals those within reveal distance, triggers those within
    // trigger distance. Bonus: also triggers mines that the OGRE
    // drives past closely-but-not-on-top-of so the player feels the
    // tactical pressure of the field.
    _updateMinefield(dt) {
        if (!this._minefield || this._minefield.length === 0) return;
        if (!this.ogre) return;
        const ox = this.ogre.position.x, oz = this.ogre.position.z;
        const TRIGGER_DIST = 2.5;
        const REVEAL_DIST  = 10;
        for (const m of this._minefield) {
            if (m.triggered) continue;
            const dx = m.x - ox;
            const dz = m.z - oz;
            const dist = Math.hypot(dx, dz);
            if (dist < TRIGGER_DIST) {
                this._detonateMine(m, { byShot: false });
                continue;
            }
            if (!m.revealed && dist < REVEAL_DIST) {
                m.revealed = true;
                if (this.router) {
                    const r = this.router.exec({
                        type: "entity:spawnMesh",
                        assetId: "mine_marker",
                        kind: "mine_marker",
                        x: m.x, y: m.y + 0.15, z: m.z,
                        scale: 0.45,
                    });
                    m.revealEntityId = r?.id ?? null;
                }
                // Reveal puff: small dust kick so it's visible the
                // moment it appears (otherwise it just pops into
                // existence which is jarring)
                if (this.particles?.spawn) {
                    for (let n = 0; n < 4; n++) {
                        const a = Math.random() * Math.PI * 2;
                        this.particles.spawn({
                            x: m.x + Math.cos(a) * 0.4,
                            y: m.y + 0.2,
                            z: m.z + Math.sin(a) * 0.4,
                            vx: 0, vy: 0.4, vz: 0,
                            ttl: 0.5, size: 0.3,
                            r: 0.6, g: 0.55, b: 0.5, a: 0.8,
                            gravity: 2,
                        });
                    }
                }
            }
        }
    }

    // Round 114 — mine detonation. Two paths:
    //   byShot=false (OGRE drove over it) — full chassis damage + bonus
    //   to nearest hardpoint within 5u (mine blew up beneath the chassis)
    //
    //   byShot=true (OGRE shot the revealed mine) — distance-falloff
    //   damage to OGRE. At 10u away, zero damage. At 0u, full damage.
    //   Lets the player clear the field if they're careful and brave.
    _detonateMine(m, opts = {}) {
        if (m.triggered) return;
        m.triggered = true;
        const byShot = !!opts.byShot;
        const BASE_DAMAGE   = 15;
        const HARDPOINT_DMG = 8;
        if (this.ogre) {
            const dx = this.ogre.position.x - m.x;
            const dz = this.ogre.position.z - m.z;
            const dist = Math.hypot(dx, dz);
            // Damage falloff for shot detonations
            let mul = 1.0;
            if (byShot) {
                mul = Math.max(0, 1 - dist / 10);   // 0 at 10u, 1 at 0u
            }
            const dmg = BASE_DAMAGE * mul;
            if (dmg > 0) {
                this.ogreHp = Math.max(0, (this.ogreHp ?? 0) - dmg);
                // Damage flash via existing pattern (round 23)
                this._flashUntilT = (performance.now() * 0.001) + 0.25;
            }
            // Bonus: hit nearest hardpoint within 5u of the mine
            // (only if drove-over detonation — shot detonations are
            // far enough that hardpoints aren't above the explosion)
            if (!byShot && dist < 3.5) {
                let nearestHp = null, nearestD2 = 25;     // 5u radius squared
                for (const key of Object.keys(this.hardpoints)) {
                    const h = this.hardpoints[key];
                    if (h.destroyed) continue;
                    const hdx = h.x - m.x, hdz = h.z - m.z;
                    const d2 = hdx * hdx + hdz * hdz;
                    if (d2 < nearestD2) { nearestD2 = d2; nearestHp = h; }
                }
                if (nearestHp) {
                    nearestHp.hp -= HARDPOINT_DMG;
                    if (nearestHp.hp <= 0) this._destroyHardpoint(nearestHp);
                }
            }
        }
        // Explosion FX
        if (this.particles?.spawn) {
            for (let n = 0; n < 40; n++) {
                const a = Math.random() * Math.PI * 2;
                const sp = 4 + Math.random() * 8;
                this.particles.spawn({
                    x: m.x, y: m.y + 0.2, z: m.z,
                    vx: Math.cos(a) * sp,
                    vy: 3 + Math.random() * 5,
                    vz: Math.sin(a) * sp,
                    ttl: 1.2, size: 0.65,
                    r: 1.0, g: 0.6, b: 0.2, a: 1.0,
                    gravity: 14,
                });
            }
            // Bright flash core
            for (let n = 0; n < 12; n++) {
                this.particles.spawn({
                    x: m.x, y: m.y + 0.2, z: m.z,
                    vy: 1 + Math.random() * 3,
                    ttl: 0.4, size: 1.4,
                    r: 1.0, g: 0.95, b: 0.8, a: 1.0,
                    gravity: 4,
                });
            }
            // Dirt + smoke pillar
            for (let n = 0; n < 18; n++) {
                this.particles.spawn({
                    x: m.x + (Math.random() - 0.5) * 1.2,
                    y: m.y + Math.random() * 2,
                    z: m.z + (Math.random() - 0.5) * 1.2,
                    vy: 1.5 + Math.random() * 1.5,
                    ttl: 2.5, size: 1.1,
                    r: 0.35, g: 0.30, b: 0.25, a: 0.85,
                    gravity: -0.5,
                });
            }
        }
        this._sfxAt?.("ogre_artillery_impact", m.x, m.y, m.z);
        // Despawn the reveal marker
        if (m.revealEntityId != null && this.router) {
            this.router.exec({ type: "entity:despawn", id: m.revealEntityId });
            m.revealEntityId = null;
        }
    }

    // Round 112 — pre-laid-defense destructibility. Helper called by
    // OGRE projectile hit loop when a structure (airport / garage)
    // takes a damaging hit but is not yet destroyed. Small dust puff
    // + sparks + impact SFX for player feedback.
    _structureHitFX(x, y, z) {
        if (!this.particles?.spawn) return;
        for (let n = 0; n < 8; n++) {
            const a = Math.random() * Math.PI * 2;
            const sp = 1 + Math.random() * 2;
            this.particles.spawn({
                x, y: y + Math.random() * 1, z,
                vx: Math.cos(a) * sp,
                vy: 0.8 + Math.random() * 1.5,
                vz: Math.sin(a) * sp,
                ttl: 0.55, size: 0.45,
                r: 0.65, g: 0.6, b: 0.55, a: 0.85,
                gravity: 3,
            });
        }
        this._sfxAt?.("ogre_artillery_impact", x, y, z);
    }

    // Round 112 — structure destruction. Big explosion + 30-particle
    // debris burst + ground crater FX + replace the live structure
    // entity with a charred ruin entity (cosmetic, no HP, no behavior).
    // Sets structure.destroyed=true so future projectiles skip it and
    // dependent systems (e.g. plane launches) gate correctly.
    _destroyStructure(s, kind) {
        if (s.destroyed) return;
        s.destroyed = true;
        s.hp = 0;
        // Big explosion
        if (this.particles?.spawn) {
            for (let n = 0; n < 50; n++) {
                const a = Math.random() * Math.PI * 2;
                const sp = 4 + Math.random() * 8;
                this.particles.spawn({
                    x: s.x, y: s.y, z: s.z,
                    vx: Math.cos(a) * sp,
                    vy: 2 + Math.random() * 6,
                    vz: Math.sin(a) * sp,
                    ttl: 1.4, size: 0.7,
                    r: 1.0, g: 0.55, b: 0.2, a: 1.0,
                    gravity: 12,
                });
            }
            // Bright flash core
            for (let n = 0; n < 12; n++) {
                this.particles.spawn({
                    x: s.x, y: s.y, z: s.z,
                    vy: 1 + Math.random() * 3,
                    ttl: 0.4, size: 1.4,
                    r: 1.0, g: 0.95, b: 0.8, a: 1.0,
                    gravity: 4,
                });
            }
            // Smoke pillar
            for (let n = 0; n < 24; n++) {
                this.particles.spawn({
                    x: s.x + (Math.random() - 0.5) * 1.2,
                    y: s.y + Math.random() * 2,
                    z: s.z + (Math.random() - 0.5) * 1.2,
                    vy: 1.5 + Math.random() * 1.5,
                    ttl: 2.5, size: 1.1,
                    r: 0.25, g: 0.22, b: 0.20, a: 0.85,
                    gravity: -0.5,
                });
            }
        }
        this._sfxAt?.("ogre_artillery_impact", s.x, s.y, s.z);
        // Despawn live entity
        if (s.entityId != null && this.router) {
            this.router.exec({ type: "entity:despawn", id: s.entityId });
            s.entityId = null;
        }
        // Replace with charred ruin (smaller cube, dark tint).
        // Reuses ogre_hardpoint_dent kind which has appropriate dark
        // scorched tint and matte finish.
        if (this.router) {
            const r = this.router.exec({
                type: "entity:spawnMesh",
                assetId: "ogre_hardpoint_dent",
                kind: "ogre_hardpoint_dent",
                x: s.x, y: s.y - 0.8, z: s.z,    // partly settled into ground
                scale: kind === "airport" ? 3.5 : 2.2,
            });
            s.ruinEntityId = r?.id ?? null;
        }
    }

    // Round 111 — defender airport. One pre-laid structure positioned
    // near HQ. Periodically launches defender planes that fly toward
    // the OGRE and strafe it. Currently a static structure (no HP, no
    // destruction); a future round can make it killable to give the
    // OGRE a strategic counter — destroy the airport to stop the
    // air pressure.
    _spawnAirport() {
        this._despawnAirport();
        if (!this.router || !this.arena?.layout) return;
        // Position: 10u behind HQ in the HQ-side direction, offset
        // 10u to the side so it doesn't sit on top of HQ visually.
        const aL = this.arena.layout;
        const hqDir = (aL.hqPos.z < 0) ? -1 : 1;
        const ax = aL.hqPos.x + 12;
        const az = aL.hqPos.z + hqDir * 10;
        const ay = this._surfaceY(ax, az) + 2.5;     // half-height anchor
        const r = this.router.exec({
            type: "entity:spawnMesh",
            assetId: "defender_airport",
            kind: "defender_airport",
            x: ax, y: ay, z: az,
            scale: 5.0,
        });
        if (r?.id != null) {
            // Round 112 — airport has HP. Destroying it halts plane
            // launches (the maybeLaunch check tests destroyed flag).
            // Explosion FX + crater on death; cosmetic ruin entity
            // replaces the airport when destroyed.
            this._airport = {
                x: ax, y: ay, z: az,
                entityId: r.id,
                hp: 80, maxHp: 80,
                destroyed: false,
                radius: 4.0,    // hit-test radius for OGRE projectiles
            };
        }
    }

    _despawnAirport() {
        if (this.router && this._airport?.entityId != null) {
            this.router.exec({ type: "entity:despawn", id: this._airport.entityId });
        }
        // Round 112 — also despawn the post-destruction ruin entity
        if (this.router && this._airport?.ruinEntityId != null) {
            this.router.exec({ type: "entity:despawn", id: this._airport.ruinEntityId });
        }
        this._airport = null;
    }

    // Round 111 — defender plane launch. Mirrors the OGRE-side
    // _maybeLaunchPlane (round 38) but with reversed allegiance:
    //   * spawns from airport instead of OGRE deck
    //   * targets OGRE position instead of defenders
    //   * projectiles team="defender" (damage OGRE on contact)
    //   * hp tracking so OGRE anti-air shots actually kill them
    //
    // Launch cadence: every 9s while OGRE active, capped at 3 in air.
    _maybeLaunchDefenderPlane(t) {
        if (!this._airport || this._airport.destroyed) return;
        if (!this.ogre || !this.active) return;
        const interval = 9.0;
        if ((t - (this._lastDefenderPlaneT || 0)) < interval) return;
        if (this.defenderPlanes.length >= 3) return;
        this._lastDefenderPlaneT = t;

        const ox = this._airport.x;
        const oy = this._airport.y + 4;     // launch from rooftop
        const oz = this._airport.z;
        // Initial heading toward OGRE
        const tx = this.ogre.position.x;
        const tz = this.ogre.position.z;
        const dx = tx - ox, dz = tz - oz;
        const dist = Math.hypot(dx, dz) || 1;
        const SPEED = 22;
        const plane = {
            x: ox, y: oy, z: oz,
            vx: dx / dist * SPEED,
            vy: 2.0,                         // climbing
            vz: dz / dist * SPEED,
            cruiseY: 24,                     // settle altitude (above OGRE +8 fly)
            target: { x: tx, z: tz },
            age: 0,
            ttl: 16,
            lastFireT: 0,
            hp: 25,
            entityId: null,
        };
        if (this.router) {
            const r = this.router.exec({
                type: "entity:spawnMesh",
                assetId: "defender_plane",
                kind: "defender_plane",
                x: ox, y: oy, z: oz,
                scale: 1.2,
            });
            plane.entityId = r?.id ?? null;
        }
        this.defenderPlanes.push(plane);

        // Round 111 — small visual hint that air support launched.
        // Smoke puff at the airport runway (no UI coupling needed).
        if (this.particles?.spawn && this._airport) {
            for (let n = 0; n < 14; n++) {
                const a = Math.random() * Math.PI * 2;
                const sp = 1 + Math.random() * 2;
                this.particles.spawn({
                    x: this._airport.x + Math.cos(a) * 2,
                    y: this._airport.y + 0.5,
                    z: this._airport.z + Math.sin(a) * 2,
                    vx: Math.cos(a) * sp * 0.5,
                    vy: 0.5 + Math.random(),
                    vz: Math.sin(a) * sp * 0.5,
                    ttl: 1.0, size: 0.55,
                    r: 0.85, g: 0.85, b: 0.88, a: 0.7,
                    gravity: 1,
                });
            }
        }
    }

    _tickDefenderPlanes(dt, t) {
        this._maybeLaunchDefenderPlane(t);
        if (!this.defenderPlanes || this.defenderPlanes.length === 0) return;
        for (let i = this.defenderPlanes.length - 1; i >= 0; i--) {
            const p = this.defenderPlanes[i];
            p.age += dt;
            // Climb to cruise altitude
            if (p.y < p.cruiseY) p.vy += 0.5 * dt;
            else p.vy *= Math.exp(-2 * dt);

            // Steer toward target (OGRE current position). Update target
            // each tick so plane tracks a moving OGRE.
            if (this.ogre) {
                p.target.x = this.ogre.position.x;
                p.target.z = this.ogre.position.z;
            }
            const tx = p.target.x - p.x, tz = p.target.z - p.z;
            const tdist = Math.hypot(tx, tz) || 1;
            if (tdist >= 5) {
                const SPEED = 22;
                const desVx = tx / tdist * SPEED;
                const desVz = tz / tdist * SPEED;
                const turnRate = 1.5 * dt;
                p.vx += (desVx - p.vx) * Math.min(1, turnRate);
                p.vz += (desVz - p.vz) * Math.min(1, turnRate);
            }

            p.x += p.vx * dt;
            p.y += p.vy * dt;
            p.z += p.vz * dt;

            // Compute yaw + tilt from velocity for visual orientation
            const yaw   = Math.atan2(p.vx, p.vz);
            const speed = Math.hypot(p.vx, p.vz);
            const tilt  = (p.vy / Math.max(0.1, speed)) * 0.3;
            if (p.entityId != null && this.router) {
                this.router.exec({
                    type: "entity:move",
                    id: p.entityId, x: p.x, y: p.y, z: p.z,
                    yaw, tiltX: tilt,
                });
            }

            // Contrail
            if (this.particles?.spawn && Math.random() < 0.85) {
                this.particles.spawn({
                    x: p.x - p.vx / Math.max(0.1, speed) * 0.5,
                    y: p.y - 0.2,
                    z: p.z - p.vz / Math.max(0.1, speed) * 0.5,
                    vx: (Math.random() - 0.5) * 0.4,
                    vy: -0.3,
                    vz: (Math.random() - 0.5) * 0.4,
                    ttl: 1.6, size: 0.45,
                    r: 0.92, g: 0.94, b: 0.98, a: 0.55,
                    gravity: 0,
                });
            }

            // Strafe fire — every 0.5s. Round 113: air-to-air takes
            // priority over strafing the OGRE. Defender planes hunt
            // OGRE carrier-launched planes first (if mk11 active);
            // ground-OGRE strafing is the fallback when no air target.
            if ((t - p.lastFireT) > 0.5) {
                const enemyPlane = this._nearestOgrePlane(p, 30);
                if (enemyPlane) {
                    p.lastFireT = t;
                    this._defenderPlaneAirToAir(p, enemyPlane);
                } else if (tdist < 40) {
                    p.lastFireT = t;
                    this._defenderPlaneStrafe(p);
                }
            }

            // Death / despawn conditions
            const shotDown = (p.hp <= 0);
            const expired = (p.age >= p.ttl);
            if (shotDown || expired) {
                // Death FX — bigger burst on shot-down, simple despawn
                // on TTL expiry (assume safe return to airport)
                if (shotDown && this.particles?.spawn) {
                    for (let n = 0; n < 28; n++) {
                        const a = Math.random() * Math.PI * 2;
                        const sp = 4 + Math.random() * 6;
                        this.particles.spawn({
                            x: p.x, y: p.y, z: p.z,
                            vx: Math.cos(a) * sp,
                            vy: 1 + Math.random() * 4,
                            vz: Math.sin(a) * sp,
                            ttl: 1.0, size: 0.7,
                            r: 1.0, g: 0.6, b: 0.2, a: 1.0,
                            gravity: 14,
                        });
                    }
                    this._sfxAt?.("ogre_artillery_impact", p.x, p.y, p.z);
                }
                if (p.entityId != null && this.router) {
                    this.router.exec({ type: "entity:despawn", id: p.entityId });
                }
                this.defenderPlanes.splice(i, 1);
            }
        }
    }

    // Round 113 — defender plane air-to-air. Mirror of _planeAirToAir
    // but team="defender" and target is an OGRE plane. Routes through
    // the existing defender-projectile hit loop, which now (also round
    // 113) tests against OGRE planes.
    _defenderPlaneAirToAir(p, target) {
        const SPEED = 36;
        const dx = target.x - p.x;
        const dy = target.y - p.y;
        const dz = target.z - p.z;
        const dist = Math.hypot(dx, dy, dz) || 1;
        this.projectiles.push({
            team: "defender",
            x: p.x, y: p.y, z: p.z,
            vx: dx / dist * SPEED,
            vy: dy / dist * SPEED,
            vz: dz / dist * SPEED,
            ttl: 1.5,
            type: { damage: 5, aoe: 0, projColor: [0.95, 0.95, 1.0] },
            hp: 1,
        });
        if (this.particles?.spawn) {
            this.particles.spawn({
                x: p.x, y: p.y, z: p.z,
                ttl: 0.12, size: 0.5,
                r: 0.9, g: 0.95, b: 1.0, a: 1.0,
            });
        }
        this._sfxAt?.("ogre_plane_strafe", p.x, p.y, p.z);
    }

    // Round 111 — defender plane strafe. Fires a downward plasma bolt
    // at the OGRE's current 3D position. Damage is moderate (4) since
    // planes fire often; AoE 0 so they need to hit directly.
    _defenderPlaneStrafe(p) {
        if (!this.ogre) return;
        const SPEED = 35;
        const tx = this.ogre.position.x;
        const ty = this.ogre.position.y + 1;     // mid-chassis
        const tz = this.ogre.position.z;
        const dx = tx - p.x, dy = ty - p.y, dz = tz - p.z;
        const dist = Math.hypot(dx, dy, dz) || 1;
        this.projectiles.push({
            team: "defender",
            x: p.x, y: p.y, z: p.z,
            vx: dx / dist * SPEED,
            vy: dy / dist * SPEED,
            vz: dz / dist * SPEED,
            ttl: 2.0,
            type: { damage: 4, aoe: 0, projColor: [0.9, 0.95, 1.0] },
            hp: 1,                              // PD can intercept
        });
        if (this.particles?.spawn) {
            this.particles.spawn({
                x: p.x, y: p.y - 0.3, z: p.z,
                ttl: 0.15, size: 0.45,
                r: 0.9, g: 0.95, b: 1.0, a: 1.0,
            });
        }
        this._sfxAt?.("ogre_plane_strafe", p.x, p.y, p.z);
    }

    // Round 111 — clear all defender-side air assets. Called from stop()
    // and on environment changes. Mirrors _clearDebris pattern.
    _clearDefenderPlanes() {
        if (!this.defenderPlanes) return;
        if (this.router) {
            for (const p of this.defenderPlanes) {
                if (p.entityId != null) {
                    this.router.exec({ type: "entity:despawn", id: p.entityId });
                }
            }
        }
        this.defenderPlanes.length = 0;
    }

    // ===================================================================
    // Round 120 — DRONE DEPOT + PATROL DRONES
    //
    // Defender drones are small fast units, perimeter patrollers. They
    // orbit a point near HQ, intercept any OGRE that enters range, and
    // engage with a stream of weak bolts (3 damage each, 0.6s cadence).
    // Cheaper than planes (12 HP vs 25), shorter range (25u vs 40u),
    // and don't bother with high-altitude cruise — they live at ~8u.
    //
    // The depot is a single structure that gates spawning: if the OGRE
    // destroys it, no new drones launch (existing drones in air finish
    // their patrols). Cadence: every 12s, capped at 3 in air.
    // ===================================================================

    _spawnDepot() {
        this._despawnDepot();
        if (!this.router || !this.arena?.layout) return;
        // Position: opposite side of HQ from the airport. Airport is at
        // (hqX+12, hqZ + hqDir*10); depot at (hqX-12, hqZ + hqDir*10).
        // Keeps the two pre-laid air assets visually separated.
        const aL = this.arena.layout;
        const hqDir = (aL.hqPos.z < 0) ? -1 : 1;
        const dx = aL.hqPos.x - 12;
        const dz = aL.hqPos.z + hqDir * 10;
        const dy = this._surfaceY(dx, dz) + 1.5;     // smaller footprint than airport
        const r = this.router.exec({
            type: "entity:spawnMesh",
            assetId: "defender_depot",
            kind: "defender_depot",
            x: dx, y: dy, z: dz,
            scale: 3.0,
        });
        if (r?.id != null) {
            this._depot = {
                x: dx, y: dy, z: dz,
                entityId: r.id,
                hp: 60, maxHp: 60,
                destroyed: false,
                radius: 2.5,
            };
        }
    }

    _despawnDepot() {
        if (this.router && this._depot?.entityId != null) {
            this.router.exec({ type: "entity:despawn", id: this._depot.entityId });
        }
        if (this.router && this._depot?.ruinEntityId != null) {
            this.router.exec({ type: "entity:despawn", id: this._depot.ruinEntityId });
        }
        this._depot = null;
    }

    _maybeLaunchDefenderDrone(t) {
        if (!this._depot || this._depot.destroyed) return;
        // Round 121 — preparedness state modulates cadence + cap.
        // Fortified: spawn faster + allow more in air. Shocked: keep
        // baseline (the depot's reduced HP and missing structures
        // already represent the shock; further nerfing drones would
        // make the state too punishing).
        const SPAWN_INTERVAL = (this._preparedness === "fortified") ? 8.0 : 12.0;
        const MAX_IN_AIR     = (this._preparedness === "fortified") ? 5   : 3;
        if (t - this._lastDefenderDroneT < SPAWN_INTERVAL) return;
        if (!this.defenderDrones) this.defenderDrones = [];
        if (this.defenderDrones.length >= MAX_IN_AIR) return;
        this._lastDefenderDroneT = t;

        const ox = this._depot.x;
        const oy = this._depot.y + 3;     // launch above depot
        const oz = this._depot.z;
        const r = this.router?.exec({
            type: "entity:spawnMesh",
            assetId: "defender_drone",
            kind: "defender_drone",
            x: ox, y: oy, z: oz,
            scale: 0.7,
        });
        if (!r?.id) return;

        // Drone state. Phase machine:
        //   approach   — fly toward nearest hardpoint until within engageRange
        //   orbit      — circle around target at engageRadius, firing periodically
        //   retreat    — TTL expired, return toward depot, despawn on arrival
        const drone = {
            entityId: r.id,
            x: ox, y: oy, z: oz,
            vx: 0, vy: 0, vz: 0,
            cruiseY: this._surfaceY(ox, oz) + 8,
            yaw: 0,
            hp: 12, maxHp: 12,
            speed: 14,
            engageRange: 25,
            engageRadius: 14,     // distance to orbit at
            fireRange: 22,
            fireCadence: 0.6,
            lastFireT: t,
            spawnT: t,
            ttl: 35,
            phase: "approach",
            orbitTheta: Math.random() * Math.PI * 2,
            orbitDir: (Math.random() < 0.5) ? -1 : 1,
        };
        this.defenderDrones.push(drone);

        // Launch dust/smoke
        if (this.particles?.spawn && this._depot) {
            for (let i = 0; i < 5; i++) {
                const a = Math.random() * Math.PI * 2;
                this.particles.spawn({
                    x: this._depot.x + Math.cos(a) * 1.2,
                    y: this._depot.y + 1.5,
                    z: this._depot.z + Math.sin(a) * 1.2,
                    vx: Math.cos(a) * 1.2,
                    vy: 0.8 + Math.random(),
                    vz: Math.sin(a) * 1.2,
                    ttl: 0.6, size: 0.3,
                    r: 0.85, g: 0.88, b: 0.92, a: 0.8,
                });
            }
        }
    }

    _tickDefenderDrones(dt, t) {
        if (!this.defenderDrones || this.defenderDrones.length === 0) return;
        const survivors = [];
        for (const d of this.defenderDrones) {
            // TTL → retreat phase
            if (t - d.spawnT > d.ttl && d.phase !== "retreat" && d.phase !== "kamikaze") {
                d.phase = "retreat";
            }
            // Round 121 — KAMIKAZE TRIGGER. When a drone's HP drops
            // below 25% it commits to a suicide dive at the nearest
            // hardpoint (or chassis if no hardpoint in range). The
            // dive is unrecoverable: even if HP somehow recovers (it
            // shouldn't), the phase persists. On impact it deals 15
            // damage to whatever it hit.
            if (d.hp > 0 && d.hp < d.maxHp * 0.25 && d.phase !== "kamikaze") {
                d.phase = "kamikaze";
                // Pick target ONCE on entering kamikaze — committed
                // dive, no retargeting mid-flight
                d.kamikazeTarget = this._nearestOgreTarget(d.x, d.y, d.z, 60);
                // Visible trail of red sparks marks the diving drone
                if (this.particles?.spawn) {
                    for (let n = 0; n < 8; n++) {
                        this.particles.spawn({
                            x: d.x, y: d.y, z: d.z,
                            vx: (Math.random() - 0.5) * 2,
                            vy: -1 - Math.random() * 2,
                            vz: (Math.random() - 0.5) * 2,
                            ttl: 0.6, size: 0.35,
                            r: 1.0, g: 0.3, b: 0.15, a: 1.0,
                        });
                    }
                }
            }
            // hp gate
            if (d.hp <= 0) {
                this._droneExplode(d);
                if (this.router && d.entityId != null) {
                    this.router.exec({ type: "entity:despawn", id: d.entityId });
                }
                continue;
            }

            // Pick target
            let target = null;
            if (d.phase !== "retreat" && d.phase !== "kamikaze") {
                // Drones engage the OGRE chassis directly OR any active hardpoint.
                // Nearest hardpoint preferred for variety; falls back to chassis.
                target = this._nearestOgreTarget(d.x, d.y, d.z, d.engageRange);
            }

            // Kamikaze takes priority over all other phases
            if (d.phase === "kamikaze") {
                const kt = d.kamikazeTarget;
                if (!kt) {
                    // Lost the target — just self-destruct in place
                    d.hp = 0;
                    this._droneExplode(d);
                    if (this.router && d.entityId != null) {
                        this.router.exec({ type: "entity:despawn", id: d.entityId });
                    }
                    continue;
                }
                const dx = kt.x - d.x;
                const dy = kt.y - d.y;
                const dz = kt.z - d.z;
                const dist = Math.hypot(dx, dy, dz);
                // IMPACT
                if (dist < 1.5) {
                    // Apply burst damage to the target. For hardpoints,
                    // look up the closest by world position and damage
                    // it directly. For planes, look up by position too.
                    // For chassis, apply to ogreHp via the existing
                    // chassis damage path.
                    const KAMIKAZE_DAMAGE = 15;
                    if (kt.kind === "hardpoint" && this.hardpoints) {
                        // Find the hardpoint at that world position
                        let best = null;
                        let bestD2 = 4;   // 2u proximity tolerance
                        for (const key of Object.keys(this.hardpoints)) {
                            const hp = this.hardpoints[key];
                            if (!hp || hp.destroyed) continue;
                            const wx = (this.ogreX || 0) + (hp.offset?.[0] || 0);
                            const wy = (this.ogreY || 0) + (hp.offset?.[1] || 0);
                            const wz = (this.ogreZ || 0) + (hp.offset?.[2] || 0);
                            const d2 = (wx - kt.x) ** 2 + (wy - kt.y) ** 2 + (wz - kt.z) ** 2;
                            if (d2 < bestD2) { bestD2 = d2; best = hp; }
                        }
                        if (best) {
                            best.hp -= KAMIKAZE_DAMAGE;
                            if (best.hp <= 0 && this._destroyHardpoint) {
                                this._destroyHardpoint(best);
                            }
                        }
                    } else if (kt.kind === "plane" && this.planes) {
                        // Closest plane within 3u
                        let best = null, bestD2 = 9;
                        for (const op of this.planes) {
                            if (!op || op.hp <= 0) continue;
                            const dd2 = (op.x - kt.x) ** 2 + (op.y - kt.y) ** 2 + (op.z - kt.z) ** 2;
                            if (dd2 < bestD2) { bestD2 = dd2; best = op; }
                        }
                        if (best) best.hp -= KAMIKAZE_DAMAGE;
                    } else if (kt.kind === "chassis") {
                        if (typeof this.ogreHp === "number") {
                            this.ogreHp = Math.max(0, this.ogreHp - KAMIKAZE_DAMAGE);
                        }
                    }
                    // Big detonation FX — bigger than normal drone explode
                    if (this.particles?.spawn) {
                        for (let n = 0; n < 32; n++) {
                            const a = Math.random() * Math.PI * 2;
                            const b = Math.random() * Math.PI - Math.PI / 2;
                            const sp = 4 + Math.random() * 8;
                            this.particles.spawn({
                                x: d.x, y: d.y, z: d.z,
                                vx: Math.cos(a) * Math.cos(b) * sp,
                                vy: Math.sin(b) * sp + 3,
                                vz: Math.sin(a) * Math.cos(b) * sp,
                                ttl: 0.7 + Math.random() * 0.5,
                                size: 0.5,
                                r: 1.0, g: 0.4 + Math.random() * 0.3, b: 0.1, a: 1.0,
                            });
                        }
                    }
                    this._sfxAt?.("explosion", d.x, d.y, d.z);
                    if (this.router && d.entityId != null) {
                        this.router.exec({ type: "entity:despawn", id: d.entityId });
                    }
                    continue;
                }
                // Dive — direct vector, faster than normal speed
                const inv = 1 / (dist || 1);
                const DIVE_SPEED = d.speed * 1.6;
                d.vx = dx * inv * DIVE_SPEED;
                d.vy = dy * inv * DIVE_SPEED;
                d.vz = dz * inv * DIVE_SPEED;
                // Trail particles
                if (this.particles?.spawn && Math.random() < 0.5) {
                    this.particles.spawn({
                        x: d.x, y: d.y, z: d.z,
                        vx: 0, vy: -0.5, vz: 0,
                        ttl: 0.4, size: 0.28,
                        r: 1.0, g: 0.4, b: 0.15, a: 1.0,
                    });
                }
                d.x += d.vx * dt;
                d.y += d.vy * dt;
                d.z += d.vz * dt;
                if (Math.abs(d.vx) > 0.01 || Math.abs(d.vz) > 0.01) {
                    d.yaw = Math.atan2(d.vx, d.vz);
                }
                if (this.router && d.entityId != null) {
                    this.router.exec({
                        type: "entity:move",
                        id: d.entityId,
                        x: d.x, y: d.y, z: d.z,
                        yaw: d.yaw,
                    });
                }
                survivors.push(d);
                continue;
            }

            // State machine
            if (d.phase === "approach" && target) {
                const tx = target.x, ty = target.y, tz = target.z;
                const dx = tx - d.x, dy = (ty + 2) - d.y, dz = tz - d.z;
                const dist = Math.hypot(dx, dy, dz);
                if (dist < d.engageRadius + 4) {
                    d.phase = "orbit";
                } else {
                    const inv = 1 / (dist || 1);
                    d.vx = dx * inv * d.speed;
                    d.vy = (dy * inv * d.speed) * 0.4 + (d.cruiseY - d.y) * 0.6;
                    d.vz = dz * inv * d.speed;
                }
            }
            if (d.phase === "orbit" && target) {
                d.orbitTheta += d.orbitDir * dt * 0.9;
                const ox = target.x + Math.cos(d.orbitTheta) * d.engageRadius;
                const oz = target.z + Math.sin(d.orbitTheta) * d.engageRadius;
                const oy = (target.y || 0) + 6;
                d.vx = (ox - d.x) * 2.0;
                d.vy = (oy - d.y) * 1.5;
                d.vz = (oz - d.z) * 2.0;
                // Cap speed so we don't snap-teleport
                const sp = Math.hypot(d.vx, d.vy, d.vz);
                if (sp > d.speed) {
                    const k = d.speed / sp;
                    d.vx *= k; d.vy *= k; d.vz *= k;
                }
                // Fire toward target
                if (t - d.lastFireT > d.fireCadence) {
                    const distToTarget = Math.hypot(target.x - d.x, (target.y + 1) - d.y, target.z - d.z);
                    if (distToTarget < d.fireRange) {
                        this._defenderDroneFire(d, target);
                        d.lastFireT = t;
                    }
                }
            }
            if (!target && d.phase !== "retreat") {
                // No target in range → loiter near depot
                if (this._depot) {
                    const dx = this._depot.x - d.x;
                    const dz = this._depot.z - d.z;
                    const dist = Math.hypot(dx, dz);
                    if (dist > 18) {
                        const inv = 1 / (dist || 1);
                        d.vx = dx * inv * d.speed * 0.8;
                        d.vz = dz * inv * d.speed * 0.8;
                    } else {
                        d.orbitTheta += dt * 0.5;
                        d.vx = Math.cos(d.orbitTheta) * d.speed * 0.5;
                        d.vz = Math.sin(d.orbitTheta) * d.speed * 0.5;
                    }
                    d.vy = (d.cruiseY - d.y) * 1.5;
                }
            }
            if (d.phase === "retreat") {
                if (this._depot) {
                    const dx = this._depot.x - d.x;
                    const dy = (this._depot.y + 4) - d.y;
                    const dz = this._depot.z - d.z;
                    const dist = Math.hypot(dx, dy, dz);
                    if (dist < 3) {
                        // Arrived — despawn
                        if (this.router && d.entityId != null) {
                            this.router.exec({ type: "entity:despawn", id: d.entityId });
                        }
                        continue;
                    }
                    const inv = 1 / (dist || 1);
                    d.vx = dx * inv * d.speed;
                    d.vy = dy * inv * d.speed * 0.6;
                    d.vz = dz * inv * d.speed;
                } else {
                    // No depot to retreat to (destroyed mid-flight) — just despawn
                    if (this.router && d.entityId != null) {
                        this.router.exec({ type: "entity:despawn", id: d.entityId });
                    }
                    continue;
                }
            }

            // Integrate position
            d.x += d.vx * dt;
            d.y += d.vy * dt;
            d.z += d.vz * dt;
            // Yaw from horizontal velocity
            if (Math.abs(d.vx) > 0.01 || Math.abs(d.vz) > 0.01) {
                d.yaw = Math.atan2(d.vx, d.vz);
            }
            // Sync entity pose
            if (this.router && d.entityId != null) {
                this.router.exec({
                    type: "entity:move",
                    id: d.entityId,
                    x: d.x, y: d.y, z: d.z,
                    yaw: d.yaw,
                });
            }
            survivors.push(d);
        }
        this.defenderDrones = survivors;
    }

    _defenderDroneFire(d, target) {
        const dx = target.x - d.x;
        const dy = (target.y + 1) - d.y;
        const dz = target.z - d.z;
        const dist = Math.hypot(dx, dy, dz) || 1;
        const SPEED = 38;
        const inv = 1 / dist;
        this.projectiles.push({
            team: "defender",
            x: d.x, y: d.y - 0.2, z: d.z,
            vx: dx * inv * SPEED,
            vy: dy * inv * SPEED,
            vz: dz * inv * SPEED,
            ttl: 1.4,
            type: { damage: 3, aoe: 0, projColor: [0.4, 0.95, 1.0] },
            hp: 1,
        });
        if (this.particles?.spawn) {
            this.particles.spawn({
                x: d.x, y: d.y - 0.2, z: d.z,
                ttl: 0.1, size: 0.3,
                r: 0.4, g: 0.95, b: 1.0, a: 1.0,
            });
        }
        this._sfxAt?.("ogre_mg_fire", d.x, d.y, d.z);
    }

    _droneExplode(d) {
        if (!this.particles?.spawn) return;
        // Smaller than a plane explosion — drones are tiny
        for (let i = 0; i < 16; i++) {
            const a = Math.random() * Math.PI * 2;
            const b = Math.random() * Math.PI - Math.PI / 2;
            const sp = 3 + Math.random() * 4;
            this.particles.spawn({
                x: d.x, y: d.y, z: d.z,
                vx: Math.cos(a) * Math.cos(b) * sp,
                vy: Math.sin(b) * sp + 2,
                vz: Math.sin(a) * Math.cos(b) * sp,
                ttl: 0.6 + Math.random() * 0.4,
                size: 0.35,
                r: 1.0, g: 0.5 + Math.random() * 0.3, b: 0.15, a: 1.0,
            });
        }
        this._sfxAt?.("explosion", d.x, d.y, d.z);
    }

    // Helper: pick the nearest OGRE-side target (hardpoint OR chassis OR plane) for
    // drone targeting. Returns { x, y, z, kind } or null. Differs from
    // _nearestDefender (player-side) — drones attack OGRE assets.
    //
    // Round 121 — also considers OGRE planes in range. Drones prefer
    // planes when they're within ~80% of full engage range (closer to
    // the drone than the chassis would be in a dogfight scenario);
    // otherwise hardpoint > chassis as before. The `kind` field lets
    // _tickDefenderDrones tune behavior — e.g. orbit radius is smaller
    // for plane intercepts since both are flying.
    _nearestOgreTarget(x, y, z, maxRange) {
        if (!this.ogreActive) return null;
        let best = null;
        let bestD2 = maxRange * maxRange;
        // Round 121 — air targets (OGRE planes) get priority. Same
        // range cap but checked first so a closer plane wins over a
        // farther hardpoint.
        if (this.planes) {
            for (const op of this.planes) {
                if (!op || op.hp <= 0) continue;
                const d2 = (op.x - x) ** 2 + (op.y - y) ** 2 + (op.z - z) ** 2;
                if (d2 < bestD2) {
                    bestD2 = d2;
                    best = { x: op.x, y: op.y, z: op.z, kind: "plane" };
                }
            }
        }
        // Hardpoints (stored as keyed object, not array)
        if (this.hardpoints) {
            for (const key of Object.keys(this.hardpoints)) {
                const hp = this.hardpoints[key];
                if (!hp || hp.destroyed) continue;
                const wx = (this.ogreX || 0) + (hp.offset?.[0] || 0);
                const wy = (this.ogreY || 0) + (hp.offset?.[1] || 0);
                const wz = (this.ogreZ || 0) + (hp.offset?.[2] || 0);
                const d2 = (wx - x) ** 2 + (wy - y) ** 2 + (wz - z) ** 2;
                if (d2 < bestD2) {
                    bestD2 = d2;
                    best = { x: wx, y: wy, z: wz, kind: "hardpoint" };
                }
            }
        }
        // Chassis as fallback target
        if (!best && this.ogreActive) {
            const d2 = (this.ogreX - x) ** 2 + (this.ogreY - y) ** 2 + (this.ogreZ - z) ** 2;
            if (d2 < bestD2) {
                best = { x: this.ogreX, y: this.ogreY + 1.5, z: this.ogreZ, kind: "chassis" };
            }
        }
        return best;
    }

    _clearDefenderDrones() {
        if (!this.defenderDrones) return;
        if (this.router) {
            for (const d of this.defenderDrones) {
                if (d.entityId != null) {
                    this.router.exec({ type: "entity:despawn", id: d.entityId });
                }
            }
        }
        this.defenderDrones.length = 0;
    }

    // ===================================================================
    // Round 121 — PREPAREDNESS STATE
    //
    // Three states roll at scenario start: shocked / minimal / fortified.
    // _applyPreparednessState runs AFTER all pre-laid structures have
    // been spawned and applies state-specific modifiers:
    //
    //   shocked    — defenders caught off-guard. Cripple ~half the
    //                pre-laid assets visibly so the player can see
    //                the state played out in the world.
    //   minimal    — baseline (no-op).
    //   fortified  — defenders prepared. Boost HP, extra mines, etc.
    //
    // Returns silently if the state is unset (legacy scenarios that
    // skip the roll). Helpers _maxDronesInAir / _planeSpawnInterval
    // read from this state too so AI behavior follows the same dial.
    // ===================================================================
    _applyPreparednessState() {
        const state = this._preparedness;
        if (!state || state === "minimal") {
            // Banner only — no structural changes
            this._showPreparednessBanner("MINIMAL READINESS", [0.85, 0.85, 0.85]);
            return;
        }
        if (state === "shocked") {
            // Cripple roughly half the garages
            if (this._garages && this._garages.length > 0) {
                for (let i = 0; i < this._garages.length; i++) {
                    if (Math.random() < 0.5) {
                        const g = this._garages[i];
                        if (g && !g.destroyed) {
                            this._destroyStructure(g, "garage");
                        }
                    }
                }
            }
            // Airport at 40% HP, visible damage
            if (this._airport && !this._airport.destroyed) {
                this._airport.hp = Math.max(8, Math.floor(this._airport.maxHp * 0.4));
                this._structureHitFX(this._airport.x, this._airport.y, this._airport.z);
            }
            // Depot at 40% HP
            if (this._depot && !this._depot.destroyed) {
                this._depot.hp = Math.max(8, Math.floor(this._depot.maxHp * 0.4));
                this._structureHitFX(this._depot.x, this._depot.y, this._depot.z);
            }
            // Empty the minefield
            if (this._minefield && this._minefield.length > 0) {
                for (const m of this._minefield) {
                    if (m.entityId != null && this.router) {
                        this.router.exec({ type: "entity:despawn", id: m.entityId });
                    }
                }
                this._minefield.length = 0;
            }
            this._showPreparednessBanner("DEFENDERS SHOCKED", [1.0, 0.35, 0.25]);
            return;
        }
        if (state === "fortified") {
            // Double the mines (add as many fresh ones as currently present)
            if (this._minefield && this._spawnExtraMines) {
                this._spawnExtraMines(this._minefield.length);
            }
            // Pre-launch one drone immediately so the depot looks active
            // (don't wait the full 12s cadence on a fortified start)
            this._lastDefenderDroneT = -100;   // forces immediate spawn next tick
            this._showPreparednessBanner("DEFENDERS FORTIFIED", [0.40, 1.0, 0.65]);
            return;
        }
    }

    // Spawn N extra mines into the existing minefield strip. Used by
    // the fortified preparedness state; refactored out of _spawnMinefield
    // so we don't double-define the placement logic.
    _spawnExtraMines(n) {
        if (!this.router || !this.arena?.layout || !this._minefield) return;
        const aL = this.arena.layout;
        const hqDir = (aL.hqPos.z < 0) ? -1 : 1;
        const halfW = aL.halfWidth || 60;
        const defenderLineZ = aL.hqPos.z + hqDir * 30;
        for (let i = 0; i < n; i++) {
            const mx = (Math.random() - 0.5) * halfW * 0.85 * 2;
            const mz = (Math.random() < 0.5)
                ? Math.random() * (defenderLineZ - 0)
                : Math.random() * (defenderLineZ - 0) + hqDir * 5;
            const my = this._surfaceY(mx, mz);
            const r = this.router.exec({
                type: "entity:spawnMesh",
                assetId: "mine_marker",
                kind: "mine_marker",
                x: mx, y: my - 0.5, z: mz,
                scale: 0.45,
            });
            if (r?.id != null) {
                this._minefield.push({
                    x: mx, y: my, z: mz,
                    entityId: r.id,
                    state: "hidden",
                    revealed: false,
                });
                // Hide the entity until revealed (existing minefield
                // pattern from round 114 — we re-use whatever the
                // minefield update loop does, which is to keep them
                // small/buried until OGRE proximity). Setting state
                // to "hidden" matches the existing schema.
            }
        }
    }

    // Briefly display a centered banner announcing the state. Uses the
    // existing toast/HUD mechanism if available; otherwise console only.
    _showPreparednessBanner(text, rgb) {
        // Try multiple notification surfaces in priority order
        const colorHex = "#" + Math.floor(rgb[0] * 255).toString(16).padStart(2, "0")
                              + Math.floor(rgb[1] * 255).toString(16).padStart(2, "0")
                              + Math.floor(rgb[2] * 255).toString(16).padStart(2, "0");
        // window.toast (engine toast surface, if any)
        if (typeof window !== "undefined" && window.toast?.show) {
            try { window.toast.show({ text, color: colorHex, durationMs: 4500 }); }
            catch {}
        }
        // Always log to console so it's discoverable in PS LOG / browser
        console.log(`[OGRE] preparedness rolled: ${text}`);
    }

    // Round 110 — pre-laid defense: a defender garage behind each slot.
    // Stationary concrete-gray bunker per slot, positioned 5u toward HQ
    // from the slot's firing position. Persists across waves; cleared
    // in stop(). Foundation for future pre-laid features.
    _spawnGarages() {
        this._despawnGarages();
        if (!this.router || !this.arena?.layout) return;
        if (!this._garages) this._garages = [];
        const slots = this.arena.layout.slotPositions;
        const hqZ = this.arena.layout.hqPos.z;
        for (const slot of slots) {
            // Offset 5u toward HQ. HQ is always at the most-negative-z
            // side of the arena; sign expression handles either case in
            // case layout ever flips.
            const offZ = (hqZ < slot.z) ? -5 : 5;
            const gx = slot.x;
            const gz = slot.z + offZ;
            const gy = this._surfaceY(gx, gz) + 1.5;   // half-height up
            const r = this.router.exec({
                type: "entity:spawnMesh",
                assetId: "defender_garage",
                kind: "defender_garage",
                x: gx, y: gy, z: gz,
                scale: 3.0,
            });
            if (r?.id != null) {
                // Round 112 — garages now destructible. OGRE projectile
                // hits chip away HP; on destruction, explosion + crater
                // + cosmetic charred ruin replacement.
                this._garages.push({
                    x: gx, y: gy, z: gz, entityId: r.id,
                    hp: 50, maxHp: 50,
                    destroyed: false,
                    radius: 2.5,
                });
            }
        }
    }

    _despawnGarages() {
        if (this.router && this._garages) {
            for (const g of this._garages) {
                if (g.entityId != null) {
                    this.router.exec({ type: "entity:despawn", id: g.entityId });
                }
                // Round 112 — also clear post-destruction ruin entities
                if (g.ruinEntityId != null) {
                    this.router.exec({ type: "entity:despawn", id: g.ruinEntityId });
                }
            }
            this._garages.length = 0;
        }
    }

    _spawnPointDefense() {
        this._despawnPointDefense();
        if (!this.router) return;
        const N = 6;
        const ring = 1.8;            // radial distance from chassis center
        const baseY = 3.6;           // mid-chassis height
        for (let i = 0; i < N; i++) {
            const ang = (i / N) * Math.PI * 2;
            const relX = Math.sin(ang) * ring;
            const relZ = Math.cos(ang) * ring;
            const r = this.router.exec({
                type: "entity:spawnMesh",
                assetId: "ogre_pd_turret",
                kind: "ogre_pd_turret",
                x: 0, y: 0, z: 0,
                scale: 0.45,
            });
            this.pdTurrets.push({
                relX, relY: baseY, relZ,
                idleAng: ang,        // when no threat, idle facing outward
                yaw: ang,
                threatRef: null,     // current target reference
                lastFireT: 0,
                entityId: r?.id ?? null,
            });
        }
    }

    _despawnPointDefense() {
        if (this.router && this.pdTurrets) {
            for (const t of this.pdTurrets) {
                if (t.entityId != null) {
                    this.router.exec({ type: "entity:despawn", id: t.entityId });
                }
            }
        }
        this.pdTurrets = [];
    }

    // Each PD ticks: world-space placement, target selection, aim, fire.
    // Range 14u (close), fireInterval 0.4s, instant beam hit. Targets:
    // sea_mine (hp ~3) and torpedo projectiles (hp ~1).
    _tickPointDefense(dt, t) {
        if (!this.ogre || !this.pdTurrets || this.pdTurrets.length === 0) return;
        if (this._currentEnv !== "sea") {
            // No threats in non-sea environments — keep turrets stowed
            // and don't run any logic. Still need to move them to chassis
            // so they ride along.
            const ox = this.ogre.position.x;
            const oy = this.ogre.position.y;
            const oz = this.ogre.position.z;
            const cosC = Math.cos(this._chassisYaw), sinC = Math.sin(this._chassisYaw);
            for (const pd of this.pdTurrets) {
                const wx = ox + pd.relX * cosC + pd.relZ * sinC;
                const wz = oz - pd.relX * sinC + pd.relZ * cosC;
                const wy = oy + pd.relY;
                if (pd.entityId != null && this.router) {
                    this.router.exec({
                        type: "entity:move",
                        id: pd.entityId,
                        x: wx, y: wy, z: wz,
                        yaw: this._chassisYaw + pd.idleAng,
                        tiltX: 0,
                    });
                }
            }
            return;
        }
        const PD_RANGE = 14;
        const FIRE_INTERVAL = 0.4;
        const ox = this.ogre.position.x;
        const oy = this.ogre.position.y;
        const oz = this.ogre.position.z;
        const cosC = Math.cos(this._chassisYaw), sinC = Math.sin(this._chassisYaw);
        for (const pd of this.pdTurrets) {
            // World position of this turret
            const wx = ox + pd.relX * cosC + pd.relZ * sinC;
            const wz = oz - pd.relX * sinC + pd.relZ * cosC;
            const wy = oy + pd.relY;
            // --- Find nearest threat in this PD's hemisphere ---
            let bestThreat = null;
            let bestD = PD_RANGE;
            for (const m of this.mines) {
                if (!m || m.hp <= 0) continue;
                const dx = m.x - wx, dz = m.z - wz;
                const d = Math.hypot(dx, dz);
                if (d < bestD) { bestD = d; bestThreat = { kind: "mine", ref: m, x: m.x, y: m.y, z: m.z }; }
            }
            for (const p of this.projectiles) {
                if (!p.torpedo || (p.hp ?? 1) <= 0) continue;
                if (p.team === "ogre") continue;         // round 36 — don't shoot own sub torps
                const dx = p.x - wx, dz = p.z - wz;
                const d = Math.hypot(dx, dz);
                if (d < bestD) { bestD = d; bestThreat = { kind: "torp", ref: p, x: p.x, y: p.y, z: p.z }; }
            }
            // --- Aim ---
            let targetYaw;
            if (bestThreat) {
                const dx = bestThreat.x - wx, dz = bestThreat.z - wz;
                targetYaw = Math.atan2(dx, dz);
            } else {
                targetYaw = this._chassisYaw + pd.idleAng;
            }
            pd.yaw = this._lerpAngle(pd.yaw, targetYaw, 1 - Math.exp(-9 * dt));
            if (pd.entityId != null && this.router) {
                this.router.exec({
                    type: "entity:move",
                    id: pd.entityId, x: wx, y: wy, z: wz,
                    yaw: pd.yaw, tiltX: 0,
                });
            }
            // --- Fire ---
            if (bestThreat && (t - pd.lastFireT) >= FIRE_INTERVAL) {
                pd.lastFireT = t;
                this._firePdBeam(wx, wy, wz, bestThreat);
            }
        }
    }

    _firePdBeam(fx, fy, fz, threat) {
        // Damage threat
        if (threat.kind === "mine") {
            threat.ref.hp = (threat.ref.hp ?? 3) - 1;
            if (threat.ref.hp <= 0) threat.ref._shotDown = true;
        } else if (threat.kind === "torp") {
            threat.ref.hp = (threat.ref.hp ?? 1) - 1;
        }
        // Beam particles — bright cyan-white pulse along the beam line
        if (this.particles?.spawn) {
            const dx = threat.x - fx, dy = threat.y - fy, dz = threat.z - fz;
            const dist = Math.hypot(dx, dy, dz) || 1;
            const steps = Math.max(3, Math.min(14, Math.floor(dist / 1.0)));
            for (let s = 0; s <= steps; s++) {
                const f = s / steps;
                this.particles.spawn({
                    x: fx + dx * f,
                    y: fy + dy * f,
                    z: fz + dz * f,
                    ttl: 0.10, size: 0.22,
                    r: 0.55, g: 0.92, b: 1.0, a: 1.0,
                });
            }
            // Bright muzzle flash at the turret
            this.particles.spawn({
                x: fx, y: fy, z: fz,
                ttl: 0.12, size: 0.55,
                r: 0.85, g: 1.0, b: 1.0, a: 1.0,
            });
            // Impact burst at threat
            for (let n = 0; n < 5; n++) {
                this.particles.spawn({
                    x: threat.x, y: threat.y, z: threat.z,
                    vx: (Math.random() - 0.5) * 3,
                    vy: 0.5 + Math.random() * 1.5,
                    vz: (Math.random() - 0.5) * 3,
                    ttl: 0.35, size: 0.32,
                    r: 1.0, g: 0.9, b: 0.55, a: 1.0,
                    gravity: 6,
                });
            }
        }
    }

    // Counter-drones: small fast units the OGRE launches at mines that
    // sit beyond PD range (so PD doesn't bottleneck the threat clear).
    // Drone homes on mine, detonates it on arrival (and consumes itself).
    _maybeLaunchCounterDrone(t) {
        if (this._currentEnv !== "sea" || !this.ogre || !this.mines.length) return;
        // Cooldown
        if ((t - (this._lastCounterDroneT ?? 0)) < 2.5) return;
        // Don't over-saturate
        if (this.counterDrones.length >= 3) return;
        // Find an unassigned mine that's beyond PD range (so it's worth
        // sending a drone instead of relying on PD)
        const PD_RANGE = 14;
        const MAX_RANGE = 50;
        const ox = this.ogre.position.x, oz = this.ogre.position.z;
        let candidate = null, bestD = MAX_RANGE;
        for (const m of this.mines) {
            if (!m || m.hp <= 0 || m._assignedDrone) continue;
            const d = Math.hypot(m.x - ox, m.z - oz);
            if (d > PD_RANGE && d < bestD) { bestD = d; candidate = m; }
        }
        if (!candidate) return;
        candidate._assignedDrone = true;
        this._lastCounterDroneT = t;
        const oy = this.ogre.position.y + 4.5;          // launch from bay
        const r = this.router?.exec({
            type: "entity:spawnMesh",
            assetId: "ogre_counter_drone",
            kind: "ogre_counter_drone",
            x: ox, y: oy, z: oz,
            scale: 0.5,
        });
        this.counterDrones.push({
            x: ox, y: oy, z: oz,
            vx: 0, vy: 0, vz: 0,
            target: candidate,
            entityId: r?.id ?? null,
            age: 0,
        });
    }

    _tickCounterDrones(dt) {
        for (let i = this.counterDrones.length - 1; i >= 0; i--) {
            const d = this.counterDrones[i];
            d.age += dt;
            const m = d.target;
            const targetDead = !m || m.hp <= 0;
            // If mine destroyed mid-flight, drone aborts and returns
            // (visually just despawns near OGRE)
            if (targetDead) {
                if (d.entityId != null && this.router) {
                    this.router.exec({ type: "entity:despawn", id: d.entityId });
                }
                this.counterDrones.splice(i, 1);
                continue;
            }
            // Steer toward target
            const dx = m.x - d.x;
            const dy = (m.y + 0.4) - d.y;
            const dz = m.z - d.z;
            const dist = Math.hypot(dx, dy, dz) || 1;
            const SPEED = 18;
            d.vx = (dx / dist) * SPEED;
            d.vy = (dy / dist) * SPEED;
            d.vz = (dz / dist) * SPEED;
            d.x += d.vx * dt;
            d.y += d.vy * dt;
            d.z += d.vz * dt;
            // Position update
            const yaw = Math.atan2(dx, dz);
            if (d.entityId != null && this.router) {
                this.router.exec({
                    type: "entity:move",
                    id: d.entityId, x: d.x, y: d.y, z: d.z, yaw, tiltX: 0,
                });
            }
            // Engine trail particles
            if (this.particles?.spawn && Math.random() < 0.8) {
                this.particles.spawn({
                    x: d.x - dx / dist * 0.4,
                    y: d.y - dy / dist * 0.4,
                    z: d.z - dz / dist * 0.4,
                    vx: (Math.random() - 0.5) * 0.4,
                    vy: -0.2,
                    vz: (Math.random() - 0.5) * 0.4,
                    ttl: 0.4, size: 0.30,
                    r: 0.9, g: 0.92, b: 1.0, a: 0.7,
                });
            }
            // Arrival → detonate mine and consume drone
            if (dist < 0.9 || d.age > 6.0) {
                this._detonateMine(m);
                // Despawn mine entities
                if (m.entityId != null && this.router) {
                    this.router.exec({ type: "entity:despawn", id: m.entityId });
                }
                if (m.lightEntityId != null && this.router) {
                    this.router.exec({ type: "entity:despawn", id: m.lightEntityId });
                }
                // Remove mine from active mines list
                const mIdx = this.mines.indexOf(m);
                if (mIdx >= 0) this.mines.splice(mIdx, 1);
                // Despawn drone
                if (d.entityId != null && this.router) {
                    this.router.exec({ type: "entity:despawn", id: d.entityId });
                }
                this.counterDrones.splice(i, 1);
            }
        }
    }

    // Round 36 — OGRE anti-personnel mine drop. While walking, periodically
    // ejects a small mine from the chassis rear. Mine sits flat on the
    // ground; on civ/defender proximity it detonates with a small AoE.
    // Different entity kind ("ogre_ap_mine") to distinguish from
    // defender-side land mines.
    _maybeDropApMine(t) {
        if (!this.ogre) return;
        // Auto-fire only when actually moving (don't carpet a stationary OGRE)
        if (!this._ogreMoving) return;
        if ((t - (this._lastApMineT ?? 0)) < 4.5) return;
        this._lastApMineT = t;
        // Drop position: 4u behind chassis facing
        const yaw = this._chassisYaw;
        const sx = Math.sin(yaw), sz = Math.cos(yaw);
        const px = this.ogre.position.x - sx * 4.0 + (Math.random() - 0.5) * 1.2;
        const pz = this.ogre.position.z - sz * 4.0 + (Math.random() - 0.5) * 1.2;
        const gy = this._surfaceY(px, pz);
        const py = gy + 0.20;
        const ap = {
            x: px, y: py, z: pz,
            radius: 2.6,
            damage: 35,
            ttl: 90.0,
            age: 0,
            entityId: null,
        };
        if (this.router) {
            const r = this.router.exec({
                type: "entity:spawnMesh",
                assetId: "ogre_ap_mine",
                kind: "ogre_ap_mine",
                x: px, y: py, z: pz,
                scale: 0.55,
            });
            ap.entityId = r?.id ?? null;
        }
        if (!this.apMines) this.apMines = [];
        this.apMines.push(ap);
        // Small puff at drop point (mine ejection)
        if (this.particles?.spawn) {
            for (let n = 0; n < 6; n++) {
                const a = Math.random() * Math.PI * 2;
                this.particles.spawn({
                    x: px, y: py + 0.5, z: pz,
                    vx: Math.cos(a) * 1.2,
                    vy: 1.0 + Math.random() * 1.4,
                    vz: Math.sin(a) * 1.2,
                    ttl: 0.5, size: 0.35,
                    r: 0.55, g: 0.50, b: 0.45, a: 0.7,
                    gravity: 6,
                });
            }
        }
    }

    _tickApMines(dt, t) {
        if (!this.apMines || this.apMines.length === 0) return;
        // Targets: civilians + defenders. AP mines explode on civ proximity
        // (anti-personnel) but also catch defenders in the blast radius.
        const civs = (this.civManager?.getAll?.()) || [];
        for (let i = this.apMines.length - 1; i >= 0; i--) {
            const m = this.apMines[i];
            m.age += dt;
            let trigger = false;
            // Civ proximity
            for (const c of civs) {
                if (!c || !c.center) continue;
                if (Math.hypot(c.center.x - m.x, c.center.z - m.z) < m.radius) { trigger = true; break; }
            }
            // Defender proximity (defenders are stationary so this only
            // hits if a mine drops next to a slot, but still useful)
            if (!trigger) {
                for (const d of this.defenders) {
                    if (d.hp <= 0) continue;
                    if (Math.hypot(d.x - m.x, d.z - m.z) < m.radius) { trigger = true; break; }
                }
            }
            if (trigger || m.age >= m.ttl) {
                this._detonateApMine(m);
                if (m.entityId != null && this.router) {
                    this.router.exec({ type: "entity:despawn", id: m.entityId });
                }
                this.apMines.splice(i, 1);
            }
        }
    }

    _detonateApMine(m) {
        // Damage civs in radius
        const civs = (this.civManager?.getAll?.()) || [];
        for (const c of civs) {
            if (!c || !c.center) continue;
            const d = Math.hypot(c.center.x - m.x, c.center.z - m.z);
            if (d < m.radius) {
                const dmg = m.damage * (1 - d / m.radius);
                c.hp = Math.max(0, (c.hp ?? 50) - dmg);
            }
        }
        // Damage defenders in radius
        for (const d of this.defenders) {
            if (d.hp <= 0) continue;
            const dd = Math.hypot(d.x - m.x, d.z - m.z);
            if (dd < m.radius) {
                const dmg = m.damage * (1 - dd / m.radius);
                d.hp -= dmg;
                if (d.hp <= 0) this._killDefender(d, "ap_mine");
            }
        }
        // Particle burst — orange shrapnel + gray smoke
        if (this.particles?.spawn) {
            for (let n = 0; n < 26; n++) {
                const a = Math.random() * Math.PI * 2;
                const sp = 3 + Math.random() * 5;
                this.particles.spawn({
                    x: m.x, y: m.y, z: m.z,
                    vx: Math.cos(a) * sp,
                    vy: 2 + Math.random() * 4,
                    vz: Math.sin(a) * sp,
                    ttl: 0.7, size: 0.40,
                    r: 1.0, g: 0.55, b: 0.20, a: 1.0,
                    gravity: 9,
                });
            }
            for (let n = 0; n < 14; n++) {
                this.particles.spawn({
                    x: m.x, y: m.y + 0.5, z: m.z,
                    vx: (Math.random() - 0.5) * 1.2,
                    vy: 1.2 + Math.random() * 1.5,
                    vz: (Math.random() - 0.5) * 1.2,
                    ttl: 1.2, size: 0.55,
                    r: 0.45, g: 0.42, b: 0.40, a: 0.7,
                    gravity: 1,
                });
            }
        }
        if (this.camera?.shake && this.ogre) {
            const d = Math.hypot(this.camera.position.x - m.x, this.camera.position.z - m.z);
            if (d < 60) this.camera.shake(0.18 * (1 - d / 60), 200);
        }
    }

    // Round 36 — gas blast. OGRE periodically emits a sickly green-yellow
    // cloud that drifts away from chassis, damaging civs + defenders in
    // its radius over its lifetime. ~8s cycle.
    _maybeGasBlast(t) {
        if (!this.ogre) return;
        if ((t - (this._lastGasT ?? 0)) < 9.5) return;
        this._lastGasT = t;
        const px = this.ogre.position.x;
        const py = this.ogre.position.y + 2.5;
        const pz = this.ogre.position.z;
        if (!this.gasClouds) this.gasClouds = [];
        // Cloud "puff" — radius expands over lifetime
        this.gasClouds.push({
            x: px, y: py, z: pz,
            radius: 4.0,         // starting radius
            maxRadius: 9.0,
            age: 0,
            ttl: 4.5,
            damagePerSec: 18,
        });
        // Eruption burst — many particles in random directions
        if (this.particles?.spawn) {
            for (let n = 0; n < 70; n++) {
                const a = Math.random() * Math.PI * 2;
                const phi = (Math.random() - 0.5) * 1.2;
                const sp = 1.6 + Math.random() * 3;
                this.particles.spawn({
                    x: px, y: py, z: pz,
                    vx: Math.cos(a) * sp * Math.cos(phi),
                    vy: 0.8 + Math.sin(phi) * 1.5 + Math.random() * 0.8,
                    vz: Math.sin(a) * sp * Math.cos(phi),
                    ttl: 3.2 + Math.random() * 1.2,
                    size: 0.85 + Math.random() * 0.4,
                    r: 0.55, g: 0.95, b: 0.30, a: 0.65,
                    gravity: 0.4,
                });
            }
            // Yellow inner core
            for (let n = 0; n < 35; n++) {
                const a = Math.random() * Math.PI * 2;
                this.particles.spawn({
                    x: px, y: py, z: pz,
                    vx: Math.cos(a) * 1.0,
                    vy: 0.5 + Math.random() * 0.8,
                    vz: Math.sin(a) * 1.0,
                    ttl: 2.0 + Math.random() * 0.6,
                    size: 0.5,
                    r: 0.85, g: 0.95, b: 0.35, a: 0.7,
                    gravity: 0.4,
                });
            }
        }
        this._sfxAt?.("ogre_gas_blast", px, py, pz);
    }

    _tickGasClouds(dt) {
        if (!this.gasClouds || this.gasClouds.length === 0) return;
        const civs = (this.civManager?.getAll?.()) || [];
        for (let i = this.gasClouds.length - 1; i >= 0; i--) {
            const g = this.gasClouds[i];
            g.age += dt;
            // Expand radius over first half of lifetime, then plateau
            const expandT = Math.min(1, g.age / (g.ttl * 0.5));
            g.radius = 4.0 + (g.maxRadius - 4.0) * expandT;
            // Tick damage in radius
            const dmgFrame = g.damagePerSec * dt;
            for (const c of civs) {
                if (!c || !c.center) continue;
                if (Math.hypot(c.center.x - g.x, c.center.z - g.z) < g.radius) {
                    c.hp = Math.max(0, (c.hp ?? 50) - dmgFrame);
                }
            }
            for (const d of this.defenders) {
                if (d.hp <= 0) continue;
                if (Math.hypot(d.x - g.x, d.z - g.z) < g.radius) {
                    d.hp -= dmgFrame;
                    if (d.hp <= 0) this._killDefender(d, "gas");
                }
            }
            // Trail particles — keep emitting wisps as the cloud lingers
            if (this.particles?.spawn && Math.random() < 0.8) {
                const a = Math.random() * Math.PI * 2;
                const r = Math.random() * g.radius;
                this.particles.spawn({
                    x: g.x + Math.cos(a) * r,
                    y: g.y + (Math.random() - 0.5) * 2.0,
                    z: g.z + Math.sin(a) * r,
                    vx: Math.cos(a) * 0.4,
                    vy: 0.2 + Math.random() * 0.4,
                    vz: Math.sin(a) * 0.4,
                    ttl: 1.5 + Math.random() * 0.8,
                    size: 0.7 + Math.random() * 0.3,
                    r: 0.45 + Math.random() * 0.25,
                    g: 0.85, b: 0.30 + Math.random() * 0.15, a: 0.55,
                    gravity: 0,
                });
            }
            if (g.age >= g.ttl) this.gasClouds.splice(i, 1);
        }
    }

    // Round 36 — submarine surface/submerge cycle. Adjusts OGRE chassis Y
    // (visual only — actual hp/walk unchanged). Surfaces for `surfaceWindow`
    // seconds every `surfaceInterval`. While submerged, fires torpedoes.
    _tickSubmarine(dt, t) {
        if (!this.ogre || !this.variant || this.variant.special !== "submarine") return;
        if (this._currentEnv !== "sea") return;
        const v = this.variant;
        const cycle = (v.surfaceInterval ?? 14);
        const win = (v.surfaceWindow ?? 5);
        const phase = (t % cycle);
        const surfaced = (phase < win);
        // Smooth depth lerp
        const targetDepth = surfaced ? 0 : (v.submergeDepth ?? 2.4);
        this._subDepth = (this._subDepth ?? targetDepth);
        this._subDepth += (targetDepth - this._subDepth) * Math.min(1, dt * 1.5);
        // Note: actual position.y dip applied in main tick after this call.
        // Periscope bubbles when submerged
        if (!surfaced && this.particles?.spawn && Math.random() < 0.5) {
            this.particles.spawn({
                x: this.ogre.position.x + (Math.random() - 0.5) * 1.5,
                y: this.ogre.position.y + 2.2,
                z: this.ogre.position.z + (Math.random() - 0.5) * 1.5,
                vx: (Math.random() - 0.5) * 0.3,
                vy: 1.5 + Math.random() * 0.8,
                vz: (Math.random() - 0.5) * 0.3,
                ttl: 0.8, size: 0.3,
                r: 0.92, g: 0.95, b: 1.0, a: 0.75,
                gravity: 0,
            });
        }
        // Auto-fire torpedoes while submerged (anti-defender)
        if (!surfaced && this.defenders.length > 0) {
            if ((t - (this._lastSubTorpT ?? 0)) >= (v.torpedoInterval ?? 3.2)) {
                this._lastSubTorpT = t;
                // Pick nearest living defender
                let nearestD = null, bestD = Infinity;
                for (const d of this.defenders) {
                    if (d.hp <= 0) continue;
                    const dist = Math.hypot(d.x - this.ogre.position.x, d.z - this.ogre.position.z);
                    if (dist < bestD) { bestD = dist; nearestD = d; }
                }
                if (nearestD) this._launchSubTorpedo(nearestD);
            }
        }
    }

    _launchSubTorpedo(target) {
        const ox = this.ogre.position.x;
        const oz = this.ogre.position.z;
        // Round 36 — sub torps fly between water surface and defender
        // mid-height so they hit boat-elevation defenders in sea env.
        const sy = this._surfaceY(ox, oz) + 2.5;
        const dx = target.x - ox, dz = target.z - oz;
        const horiz = Math.hypot(dx, dz) || 1;
        const SPEED = 22;
        const fakeType = {
            damage: 14,
            aoe: 1.4,
            projColor: [0.6, 0.85, 0.50],
        };
        this.projectiles.push({
            team: "ogre",
            x: ox, y: sy, z: oz,
            vx: dx / horiz * SPEED,
            vy: 0,
            vz: dz / horiz * SPEED,
            ttl: horiz / SPEED + 0.8,
            type: fakeType,
            torpedo: true,
            hp: 1,
            subTorp: true,                 // marker for damage handling
        });
        this._sfxAt?.("ogre_torpedo_launch", ox, sy, oz);
    }

    // Round 37 — flood damage. Each active breach drains hp/s; multiple
    // breaches stack. Sustained bubble emission from each breach point.
    _tickFloodDamage(dt, t) {
        if (!this.ogre) return;
        if (!this._floodCount) return;
        // Drain HP — scales catastrophically with breach count
        const drainPerBreach = 2.5;
        const drainTotal = this._floodCount * drainPerBreach * dt;
        this.ogreHp = Math.max(0, this.ogreHp - drainTotal);
        // Continuous bubble eruption from each breach (positioned with chassis)
        if (this._breaches && this.particles?.spawn) {
            const scaleMul = (this.variant?.scale ?? 4) / 4;
            for (const br of this._breaches) {
                br.age += dt;
                // Find current hardpoint position by key (chassis may have moved)
                const h = this.hardpoints?.[br.key];
                const bx = h?.x ?? br.x;
                const by = h?.y ?? br.y;
                const bz = h?.z ?? br.z;
                // Emit 1-3 rising bubbles per frame
                const emitCount = 1 + Math.floor(Math.random() * 3);
                for (let n = 0; n < emitCount; n++) {
                    this.particles.spawn({
                        x: bx + (Math.random() - 0.5) * 0.8,
                        y: by + (Math.random() - 0.5) * 0.4,
                        z: bz + (Math.random() - 0.5) * 0.8,
                        vx: (Math.random() - 0.5) * 0.5,
                        vy: 1.5 + Math.random() * 1.5,
                        vz: (Math.random() - 0.5) * 0.5,
                        ttl: 1.3 + Math.random() * 0.7,
                        size: 0.32 + Math.random() * 0.2,
                        r: 0.9, g: 0.95, b: 1.0, a: 0.75,
                        gravity: -1.5,
                    });
                }
            }
        }
    }

    // Round 37 — cascading internal explosions. Once a hardpoint is gone,
    // OGRE is "compromised" and small secondary detonations erupt across
    // the chassis. Frequency + severity scale with destroyed hardpoint
    // count. Continues until OGRE dies.
    _tickInternalCascade(dt, t) {
        if (!this._cascadeArmed || !this.ogre || this.ogreHp <= 0) return;
        // Count destroyed hardpoints
        let destroyed = 0;
        for (const k of Object.keys(this.hardpoints || {})) {
            if (this.hardpoints[k].destroyed) destroyed++;
        }
        if (destroyed === 0) return;
        // Interval shrinks as destroyed count climbs: 1 dead = ~7s, 4 dead = ~2.5s
        const interval = Math.max(2.0, 7.0 - destroyed * 1.0);
        if ((t - (this._lastCascadeT || 0)) < interval) return;
        this._lastCascadeT = t;
        // Pick a random destroyed hardpoint as origin
        const destroyedKeys = Object.keys(this.hardpoints).filter(k => this.hardpoints[k].destroyed);
        const key = destroyedKeys[Math.floor(Math.random() * destroyedKeys.length)];
        const h = this.hardpoints[key];
        if (!h) return;
        // Small jitter around hardpoint position
        const ex = h.x + (Math.random() - 0.5) * 1.5;
        const ey = h.y + (Math.random() - 0.5) * 1.0;
        const ez = h.z + (Math.random() - 0.5) * 1.5;
        const dmg = 4 + destroyed * 2;
        this.ogreHp = Math.max(0, this.ogreHp - dmg);
        if (this.particles?.spawn) {
            // Orange-red fireball burst
            for (let n = 0; n < 22; n++) {
                const a = Math.random() * Math.PI * 2;
                const sp = 2 + Math.random() * 4;
                this.particles.spawn({
                    x: ex, y: ey, z: ez,
                    vx: Math.cos(a) * sp,
                    vy: 1 + Math.random() * 3,
                    vz: Math.sin(a) * sp,
                    ttl: 0.8 + Math.random() * 0.4,
                    size: 0.55,
                    r: 1.0, g: 0.55 + Math.random() * 0.25, b: 0.15, a: 1.0,
                    gravity: 4,
                });
            }
            // Smoke wisps
            for (let n = 0; n < 8; n++) {
                this.particles.spawn({
                    x: ex, y: ey + 0.5, z: ez,
                    vx: (Math.random() - 0.5) * 1.0,
                    vy: 1.2 + Math.random() * 1.0,
                    vz: (Math.random() - 0.5) * 1.0,
                    ttl: 1.5, size: 0.5,
                    r: 0.30, g: 0.28, b: 0.26, a: 0.7,
                    gravity: 1,
                });
            }
        }
        if (this.camera?.shake && this.ogre) {
            const d = Math.hypot(this.camera.position.x - ex, this.camera.position.z - ez);
            if (d < 80) this.camera.shake(0.15 + destroyed * 0.05, 200);
        }
        this._sfxAt?.("ogre_internal_explosion", ex, ey, ez);
    }

    // Round 38 — civ boats. In sea env, attach a small boat hull entity
    // under each living civilian. Boat tracks civ position; cleaned up
    // when civ dies or env changes.
    _tickCivBoats(dt, t) {
        const inSea = (this._currentEnv === "sea");
        const civs = (this.civManager?.getAll?.()) || [];
        const liveIds = new Set();
        if (inSea) {
            for (const c of civs) {
                if (!c || !c.center) continue;
                liveIds.add(c.id);
                let rec = this.civBoats.get(c.id);
                if (!rec) {
                    // Spawn boat for this civ — long flat hull via non-uniform scale
                    if (this.router) {
                        const r = this.router.exec({
                            type: "entity:spawnMesh",
                            assetId: "civ_boat",
                            kind: "civ_boat",
                            x: c.center.x, y: c.center.y - 0.4, z: c.center.z,
                            // Round 41 — proper boat hull proportions
                            scaleX: 0.85,
                            scaleY: 0.35,
                            scaleZ: 1.80,
                        });
                        rec = { entityId: r?.id ?? null };
                        this.civBoats.set(c.id, rec);
                    }
                }
                // Move boat to civ position with small bob
                if (rec?.entityId != null && this.router) {
                    const bob = Math.sin(t * 1.8 + c.center.x * 0.13) * 0.10;
                    this.router.exec({
                        type: "entity:move",
                        id: rec.entityId,
                        x: c.center.x,
                        y: c.center.y - 0.4 + bob,
                        z: c.center.z,
                        yaw: c.facing ?? 0,
                        tiltX: 0,
                    });
                }
            }
        }
        // Despawn boats for civs that are dead or env no longer sea
        for (const [id, rec] of this.civBoats) {
            if (!liveIds.has(id) || !inSea) {
                if (rec.entityId != null && this.router) {
                    this.router.exec({ type: "entity:despawn", id: rec.entityId });
                }
                this.civBoats.delete(id);
            }
        }
    }

    // Round 38 — aircraft carrier planes. MK XI Aircraft Carrier variant
    // launches planes every spawnInterval seconds. Each plane takes off
    // from the OGRE deck, climbs, then strafes the defender line, then
    // exits the map (kills itself when far from OGRE).
    _maybeLaunchPlane(t) {
        const v = this.variant;
        if (!v || v.special !== "carrier_air") return;
        if (!this.ogre) return;
        const interval = v.spawnInterval ?? 6.0;
        if ((t - (this._lastPlaneT || 0)) < interval) return;
        if (this.planes.length >= 4) return;        // cap
        this._lastPlaneT = t;
        const ox = this.ogre.position.x;
        const oy = this.ogre.position.y + 6;        // launch from deck
        const oz = this.ogre.position.z;
        // Pick a defender target (or HQ direction if none)
        let tx = this.hqPos?.x ?? 0;
        let tz = this.hqPos?.z ?? 0;
        const liveDefs = this.defenders.filter(d => d.hp > 0);
        if (liveDefs.length > 0) {
            const pick = liveDefs[Math.floor(Math.random() * liveDefs.length)];
            tx = pick.x; tz = pick.z;
        }
        const dx = tx - ox, dz = tz - oz;
        const dist = Math.hypot(dx, dz) || 1;
        const SPEED = 24;
        const plane = {
            x: ox, y: oy, z: oz,
            vx: dx / dist * SPEED,
            vy: 1.5,                                  // climbing initially
            vz: dz / dist * SPEED,
            cruiseY: 18,                              // settle altitude
            target: { x: tx, z: tz },
            age: 0,
            ttl: 14,
            lastFireT: 0,
            hp: 25,                                   // round 113 — destructible
            entityId: null,
        };
        if (this.router) {
            const r = this.router.exec({
                type: "entity:spawnMesh",
                assetId: "ogre_plane",
                kind: "ogre_plane",
                x: ox, y: oy, z: oz,
                scale: 1.2,
            });
            plane.entityId = r?.id ?? null;
        }
        this.planes.push(plane);
    }

    _tickPlanes(dt, t) {
        this._maybeLaunchPlane(t);
        for (let i = this.planes.length - 1; i >= 0; i--) {
            const p = this.planes[i];
            p.age += dt;
            // Climb to cruise altitude
            if (p.y < p.cruiseY) p.vy += 0.5 * dt; else p.vy *= Math.exp(-2 * dt);
            // Steer toward target horizontally with mild turn
            const tx = p.target.x - p.x, tz = p.target.z - p.z;
            const tdist = Math.hypot(tx, tz) || 1;
            if (tdist < 5) {
                // Past target — continue on current heading until ttl
            } else {
                const SPEED = 24;
                const desVx = tx / tdist * SPEED;
                const desVz = tz / tdist * SPEED;
                const turnRate = 1.5 * dt;
                p.vx += (desVx - p.vx) * Math.min(1, turnRate);
                p.vz += (desVz - p.vz) * Math.min(1, turnRate);
            }
            p.x += p.vx * dt;
            p.y += p.vy * dt;
            p.z += p.vz * dt;
            // Compute yaw + tilt from velocity
            const yaw = Math.atan2(p.vx, p.vz);
            const speed = Math.hypot(p.vx, p.vz);
            const tilt = (p.vy / Math.max(0.1, speed)) * 0.3;
            if (p.entityId != null && this.router) {
                this.router.exec({
                    type: "entity:move",
                    id: p.entityId, x: p.x, y: p.y, z: p.z, yaw, tiltX: tilt,
                });
            }
            // Contrail
            if (this.particles?.spawn && Math.random() < 0.85) {
                this.particles.spawn({
                    x: p.x - p.vx / speed * 0.5,
                    y: p.y - 0.2,
                    z: p.z - p.vz / speed * 0.5,
                    vx: (Math.random() - 0.5) * 0.4,
                    vy: -0.3,
                    vz: (Math.random() - 0.5) * 0.4,
                    ttl: 1.6, size: 0.45,
                    r: 0.92, g: 0.94, b: 0.98, a: 0.55,
                    gravity: 0,
                });
            }
            // Strafe fire — every 0.35s. Round 113: air-to-air takes
            // priority. If a defender plane is within 30u (3D), fire at
            // it; otherwise fall back to ground strafe within 30u of
            // target.
            //
            // Round 121 — also engage defender DRONES with same priority
            // as planes. Drones are smaller but in larger numbers; OGRE
            // planes pick the closer of the two air targets within 30u.
            if ((t - p.lastFireT) > 0.35) {
                const enemyPlane = this._nearestDefenderPlane(p, 30);
                const enemyDrone = this._nearestDefenderDrone(p, 30);
                // Closer wins. Either type uses _planeAirToAir; the
                // hit code routes damage via projectile team="ogre".
                let target = null;
                if (enemyPlane && enemyDrone) {
                    const dp = (enemyPlane.x - p.x) ** 2 + (enemyPlane.y - p.y) ** 2 + (enemyPlane.z - p.z) ** 2;
                    const dd = (enemyDrone.x - p.x) ** 2 + (enemyDrone.y - p.y) ** 2 + (enemyDrone.z - p.z) ** 2;
                    target = (dp <= dd) ? enemyPlane : enemyDrone;
                } else {
                    target = enemyPlane || enemyDrone;
                }
                if (target) {
                    p.lastFireT = t;
                    this._planeAirToAir(p, target);
                } else if (tdist < 30) {
                    p.lastFireT = t;
                    this._planeStrafe(p);
                }
            }
            // Round 113 — death from defender plane hits OR TTL
            const shotDown = (p.hp <= 0);
            if (shotDown || p.age >= p.ttl) {
                if (shotDown && this.particles?.spawn) {
                    for (let n = 0; n < 28; n++) {
                        const a = Math.random() * Math.PI * 2;
                        const sp = 4 + Math.random() * 6;
                        this.particles.spawn({
                            x: p.x, y: p.y, z: p.z,
                            vx: Math.cos(a) * sp,
                            vy: 1 + Math.random() * 4,
                            vz: Math.sin(a) * sp,
                            ttl: 1.0, size: 0.7,
                            r: 1.0, g: 0.55, b: 0.2, a: 1.0,
                            gravity: 14,
                        });
                    }
                    this._sfxAt?.("ogre_artillery_impact", p.x, p.y, p.z);
                }
                if (p.entityId != null && this.router) {
                    this.router.exec({ type: "entity:despawn", id: p.entityId });
                }
                this.planes.splice(i, 1);
            }
        }
    }

    // Round 113 — air-to-air: nearest defender plane within range (3D)
    // of an OGRE plane, or null. Used by OGRE plane fire decision to
    // prefer enemy aircraft over ground strafe.
    _nearestDefenderPlane(fromPlane, maxRange = Infinity) {
        if (!this.defenderPlanes) return null;
        let best = null, bestD2 = maxRange * maxRange;
        for (const dp of this.defenderPlanes) {
            if (dp.hp <= 0) continue;
            const dx = dp.x - fromPlane.x;
            const dy = dp.y - fromPlane.y;
            const dz = dp.z - fromPlane.z;
            const d2 = dx * dx + dy * dy + dz * dz;
            if (d2 < bestD2) { bestD2 = d2; best = dp; }
        }
        return best;
    }

    // Round 113 — nearest OGRE-side plane within range of a defender
    // plane. Mirror of above for the defender side.
    _nearestOgrePlane(fromPlane, maxRange = Infinity) {
        if (!this.planes) return null;
        let best = null, bestD2 = maxRange * maxRange;
        for (const op of this.planes) {
            if (op.hp <= 0) continue;
            const dx = op.x - fromPlane.x;
            const dy = op.y - fromPlane.y;
            const dz = op.z - fromPlane.z;
            const d2 = dx * dx + dy * dy + dz * dz;
            if (d2 < bestD2) { bestD2 = d2; best = op; }
        }
        return best;
    }

    // Round 121 — nearest defender drone within range of an OGRE plane.
    // Used for dogfight target selection. Returns the drone entity (with
    // x/y/z) or null. Stand-alone helper instead of overloading
    // _nearestDefender so this can be called from the OGRE plane tick
    // without changing the existing turret-targeting semantics.
    _nearestDefenderDrone(fromPlane, maxRange = Infinity) {
        if (!this.defenderDrones) return null;
        let best = null, bestD2 = maxRange * maxRange;
        for (const d of this.defenderDrones) {
            if (d.hp <= 0) continue;
            const dx = d.x - fromPlane.x;
            const dy = d.y - fromPlane.y;
            const dz = d.z - fromPlane.z;
            const d2 = dx * dx + dy * dy + dz * dz;
            if (d2 < bestD2) { bestD2 = d2; best = d; }
        }
        return best;
    }

    // Round 113 — OGRE plane fires at a defender plane. Same projectile
    // pattern as strafe but aimed at the air target. Team "ogre" so the
    // hit loop routes damage to the defender plane via the existing
    // round-111 defender-plane-hit branch (no new hit logic needed).
    _planeAirToAir(p, target) {
        const SPEED = 36;
        const dx = target.x - p.x;
        const dy = target.y - p.y;
        const dz = target.z - p.z;
        const dist = Math.hypot(dx, dy, dz) || 1;
        this.projectiles.push({
            team: "ogre",
            x: p.x, y: p.y, z: p.z,
            vx: dx / dist * SPEED,
            vy: dy / dist * SPEED,
            vz: dz / dist * SPEED,
            ttl: 1.5,
            type: { damage: 5, aoe: 0, projColor: [0.5, 0.8, 1.0] },
        });
        if (this.particles?.spawn) {
            this.particles.spawn({
                x: p.x, y: p.y, z: p.z,
                ttl: 0.12, size: 0.5,
                r: 0.7, g: 0.9, b: 1.0, a: 1.0,
            });
        }
        this._sfxAt?.("ogre_plane_strafe", p.x, p.y, p.z);
    }

    _planeStrafe(p) {
        // Fire a small plasma bolt straight down at ground in front of plane
        const SPEED = 30;
        const groundY = this._surfaceY(p.x, p.z);
        const dy = (groundY + 0.5) - p.y;
        const horiz = Math.hypot(p.vx, p.vz) || 1;
        // Predict target slightly ahead
        const aheadX = p.x + p.vx * 0.2;
        const aheadZ = p.z + p.vz * 0.2;
        const dxh = aheadX - p.x, dzh = aheadZ - p.z;
        const dist = Math.hypot(dxh, dy, dzh) || 1;
        this.projectiles.push({
            team: "ogre",
            x: p.x, y: p.y, z: p.z,
            vx: dxh / dist * SPEED,
            vy: dy / dist * SPEED,
            vz: dzh / dist * SPEED,
            ttl: 1.5,
            type: { damage: 6, aoe: 1.2, projColor: [0.5, 0.8, 1.0] },
        });
        if (this.particles?.spawn) {
            this.particles.spawn({
                x: p.x, y: p.y - 0.3, z: p.z,
                ttl: 0.15, size: 0.45,
                r: 0.6, g: 0.85, b: 1.0, a: 1.0,
            });
        }
        this._sfxAt?.("ogre_plane_strafe", p.x, p.y, p.z);   // round 40
    }

    // Round 38 — 3D Earth billboard in moon sky. Spawned when env=moon,
    // positioned far above-and-offset from camera. Replaces the HTML
    // overlay so the Earth has parallax and "sky presence."
    _ensureEarthBillboard() {
        const inMoon = (this._currentEnv === "moon");
        if (inMoon && this._earthEntityId == null) {
            if (this.router) {
                const r = this.router.exec({
                    type: "entity:spawnMesh",
                    assetId: "earth_sky",
                    kind: "earth_sky",
                    x: 0, y: 200, z: 0,
                    scale: 12,
                });
                this._earthEntityId = r?.id ?? null;
            }
        } else if (!inMoon && this._earthEntityId != null) {
            if (this.router) {
                this.router.exec({ type: "entity:despawn", id: this._earthEntityId });
            }
            this._earthEntityId = null;
        }
    }

    _tickEarthBillboard() {
        this._ensureEarthBillboard();
        if (this._earthEntityId == null || !this.camera || !this.router) return;
        // Park Earth at a fixed offset relative to camera world position,
        // high up in the sky. Acts as a near-skybox billboard.
        const cx = this.camera.position.x;
        const cy = this.camera.position.y;
        const cz = this.camera.position.z;
        const ex = cx + 120;
        const ey = cy + 200;
        const ez = cz - 80;
        // Slow spin
        const t = performance.now() * 0.0003;
        this.router.exec({
            type: "entity:move",
            id: this._earthEntityId,
            x: ex, y: ey, z: ez,
            yaw: t, tiltX: 0,
        });
    }

    // Round 40 — pilot eject cinematic. Triggered from _cleanupOgre.
    // Spawns a small pilot entity from chassis top, launched on a
    // ballistic trajectory with engine plume. After 1.5s, parachute
    // deploys: gravity scaled WAY down for slow descent. Lifetime 12s.
    _spawnPilotEject() {
        if (!this.ogre || !this.router) return;
        const ox = this.ogre.position.x;
        const oy = this.ogre.position.y + 5;
        const oz = this.ogre.position.z;
        const pilot = {
            x: ox, y: oy, z: oz,
            vx: (Math.random() - 0.5) * 4,
            vy: 18 + Math.random() * 6,        // hard launch up
            vz: (Math.random() - 0.5) * 4,
            age: 0,
            ttl: 12,
            chuteOpen: false,
            entityId: null,
            chuteEntityId: null,
        };
        const r = this.router.exec({
            type: "entity:spawnMesh",
            assetId: "ogre_pilot",
            kind: "ogre_pilot",
            x: ox, y: oy, z: oz,
            scale: 0.45,
        });
        pilot.entityId = r?.id ?? null;
        if (!this.pilots) this.pilots = [];
        this.pilots.push(pilot);
        this._sfxAt?.("ogre_pilot_eject", ox, oy, oz);
        // Initial eject flame
        if (this.particles?.spawn) {
            for (let n = 0; n < 28; n++) {
                this.particles.spawn({
                    x: ox + (Math.random() - 0.5) * 0.5,
                    y: oy - 0.5,
                    z: oz + (Math.random() - 0.5) * 0.5,
                    vx: (Math.random() - 0.5) * 1.5,
                    vy: -4 - Math.random() * 6,        // downward (rocket exhaust)
                    vz: (Math.random() - 0.5) * 1.5,
                    ttl: 0.6, size: 0.55,
                    r: 1.0, g: 0.6 + Math.random() * 0.25, b: 0.15, a: 1.0,
                    gravity: 0,
                });
            }
        }
    }

    _tickPilots(dt) {
        if (!this.pilots || this.pilots.length === 0) return;
        for (let i = this.pilots.length - 1; i >= 0; i--) {
            const p = this.pilots[i];
            p.age += dt;
            // Gravity — heavy at first, light after chute deploys
            const g = p.chuteOpen ? 1.6 : 18;
            p.vy -= g * dt;
            p.x += p.vx * dt;
            p.y += p.vy * dt;
            p.z += p.vz * dt;
            // Chute deploy at apex (vy near 0) or after 1.5s, whichever first
            if (!p.chuteOpen && (p.age > 1.5 || p.vy < 1)) {
                p.chuteOpen = true;
                // Snap vy positive briefly (chute jerks up)
                p.vy = Math.max(p.vy, -2);
                this._sfxAt?.("ogre_parachute_deploy", p.x, p.y, p.z);
                if (this.router) {
                    const cr = this.router.exec({
                        type: "entity:spawnMesh",
                        assetId: "ogre_parachute",
                        kind: "ogre_parachute",
                        x: p.x, y: p.y + 1.5, z: p.z,
                        scale: 1.6,
                    });
                    p.chuteEntityId = cr?.id ?? null;
                }
            }
            // Eject trail flame (only before chute open)
            if (!p.chuteOpen && this.particles?.spawn && Math.random() < 0.8) {
                this.particles.spawn({
                    x: p.x, y: p.y - 0.3, z: p.z,
                    vx: (Math.random() - 0.5) * 0.4,
                    vy: -1 - Math.random() * 1.5,
                    vz: (Math.random() - 0.5) * 0.4,
                    ttl: 0.35, size: 0.4,
                    r: 1.0, g: 0.55, b: 0.20, a: 1.0,
                });
            }
            // Move entities
            if (p.entityId != null && this.router) {
                this.router.exec({
                    type: "entity:move",
                    id: p.entityId, x: p.x, y: p.y, z: p.z,
                    yaw: Math.atan2(p.vx, p.vz),
                    tiltX: p.chuteOpen ? 0 : 0.4,        // ascends head-up
                });
            }
            if (p.chuteEntityId != null && this.router) {
                // Chute floats slightly above pilot, slow yaw spin
                this.router.exec({
                    type: "entity:move",
                    id: p.chuteEntityId,
                    x: p.x, y: p.y + 1.5, z: p.z,
                    yaw: p.age * 0.4, tiltX: 0,
                });
            }
            // Ground/expire
            const groundY = this._surfaceY(p.x, p.z) + 0.2;
            const landed = (p.y <= groundY && p.chuteOpen);
            if (landed || p.age >= p.ttl) {
                if (p.entityId != null && this.router) this.router.exec({ type: "entity:despawn", id: p.entityId });
                if (p.chuteEntityId != null && this.router) this.router.exec({ type: "entity:despawn", id: p.chuteEntityId });
                this.pilots.splice(i, 1);
            }
        }
    }

    triggerCannonRecoil() {
        const c = this.rig?.cannon;
        if (!c) return;
        c.recoilT = 0;
        // Round 28 — small camera shake on cannon fire if camera close
        // enough. Distance gating prevents shake when player is far away.
        if (this.camera?.shake && this.ogre) {
            const dx = this.camera.position.x - this.ogre.position.x;
            const dy = this.camera.position.y - this.ogre.position.y;
            const dz = this.camera.position.z - this.ogre.position.z;
            const dist = Math.hypot(dx, dy, dz);
            const SHAKE_RANGE = 60;
            if (dist < SHAKE_RANGE) {
                const falloff = 1 - dist / SHAKE_RANGE;
                this.camera.shake(0.08 * falloff, 90);
            }
        }
        // Round 29 — eject a large brass shell sideways from the breech.
        // Bounces on ground, damages defenders if it lands on them.
        this._spawnEjectedShell();
    }

    _spawnEjectedShell() {
        if (!this.ogre || !this.router) return;
        const scaleMul = (this.variant?.scale ?? 4) / 4;
        // Cannon position in chassis frame
        const cx = 0.0 * scaleMul;
        const cy = 4.0 * scaleMul;
        const cz = 1.5 * scaleMul;
        // Aim yaw drives ejection direction (right side of cannon)
        const yaw = this._aimYaw ?? 0;
        const cosY = Math.cos(yaw), sinY = Math.sin(yaw);
        const wx = this.ogre.position.x + cx * cosY + cz * sinY;
        const wy = this.ogre.position.y + cy;
        const wz = this.ogre.position.z + (-cx * sinY + cz * cosY);
        // Eject perpendicular to aim direction (right side of cannon)
        const rightX = cosY;
        const rightZ = -sinY;
        const ejectSpeed = 9 + Math.random() * 3;
        const upSpeed = 4 + Math.random() * 2;
        const shell = {
            x: wx, y: wy, z: wz,
            vx: rightX * ejectSpeed + (Math.random() - 0.5) * 1.5,
            vy: upSpeed,
            vz: rightZ * ejectSpeed + (Math.random() - 0.5) * 1.5,
            yaw: Math.random() * Math.PI * 2,
            spinRate: 12 + Math.random() * 8,    // tumble rate
            ttl: 6.0,
            age: 0,
            grounded: false,
            scale: 0.4 * scaleMul,
            entityId: null,
        };
        const result = this.router.exec({
            type: "entity:spawnMesh",
            assetId: "cannon_shell",
            kind: "cannon_shell",
            x: wx, y: wy, z: wz,
            scale: shell.scale,
        });
        shell.entityId = result?.id ?? null;
        this.shells.push(shell);
        // Brass-ejection puff at breech
        if (this.particles?.spawn) {
            for (let n = 0; n < 4; n++) {
                this.particles.spawn({
                    x: wx, y: wy, z: wz,
                    vx: rightX * 1.5 + (Math.random() - 0.5),
                    vy: 0.5 + Math.random() * 0.5,
                    vz: rightZ * 1.5 + (Math.random() - 0.5),
                    ttl: 0.4, size: 0.3,
                    r: 0.85, g: 0.78, b: 0.40, a: 0.7,
                });
            }
        }
    }

    _tickShells(dt, t) {
        if (!this.shells || this.shells.length === 0) return;
        const SHELL_DEFENDER_DAMAGE = 30;
        const SHELL_HIT_RADIUS = 0.9;
        for (let i = this.shells.length - 1; i >= 0; i--) {
            const sh = this.shells[i];
            sh.age += dt;
            if (sh.age >= sh.ttl) {
                if (sh.entityId != null && this.router) {
                    this.router.exec({ type: "entity:despawn", id: sh.entityId });
                }
                this.shells.splice(i, 1);
                continue;
            }
            if (!sh.grounded) {
                // Physics integration
                sh.x += sh.vx * dt;
                sh.y += sh.vy * dt;
                sh.z += sh.vz * dt;
                sh.vy -= 18 * dt;             // gravity
                sh.yaw += sh.spinRate * dt;   // tumble
                // Ground bounce
                const groundY = this._surfaceY(sh.x, sh.z) + 0.2;
                if (sh.y < groundY) {
                    sh.y = groundY;
                    if (Math.abs(sh.vy) > 1.0) {
                        sh.vy = -sh.vy * 0.35;     // lossy bounce
                        sh.vx *= 0.7;
                        sh.vz *= 0.7;
                        sh.spinRate *= 0.7;
                        // Bounce dust
                        if (this.particles?.spawn) {
                            for (let n = 0; n < 3; n++) {
                                const a = Math.random() * Math.PI * 2;
                                this.particles.spawn({
                                    x: sh.x, y: groundY, z: sh.z,
                                    vx: Math.cos(a) * 1.5,
                                    vy: 0.6 + Math.random() * 0.6,
                                    vz: Math.sin(a) * 1.5,
                                    ttl: 0.35, size: 0.3,
                                    r: 0.55, g: 0.48, b: 0.38, a: 0.6,
                                    gravity: 8,
                                });
                            }
                        }
                        // Defender hit check on bounce contact
                        for (const d of this.defenders) {
                            if (d.hp <= 0) continue;
                            const dx = d.x - sh.x;
                            const dz = d.z - sh.z;
                            if (Math.hypot(dx, dz) < SHELL_HIT_RADIUS) {
                                d.hp -= SHELL_DEFENDER_DAMAGE;
                                if (d.hp <= 0) this._killDefender(d, "shell");
                            }
                        }
                    } else {
                        // Settled
                        sh.vy = 0;
                        sh.vx = 0;
                        sh.vz = 0;
                        sh.spinRate = 0;
                        sh.grounded = true;
                    }
                }
                // Mid-air defender hit (shell smashes into them)
                if (sh.y < groundY + 2.0 && !sh.grounded) {
                    for (const d of this.defenders) {
                        if (d.hp <= 0) continue;
                        const dx = d.x - sh.x;
                        const dz = d.z - sh.z;
                        if (Math.hypot(dx, dz) < SHELL_HIT_RADIUS && Math.abs(sh.y - d.y) < 1.5) {
                            d.hp -= SHELL_DEFENDER_DAMAGE * 1.5;
                            sh.vx *= 0.3; sh.vz *= 0.3;
                            if (d.hp <= 0) this._killDefender(d, "shell_strike");
                            break;
                        }
                    }
                }
            }
            // Update entity position + tumble yaw
            if (sh.entityId != null && this.router) {
                this.router.exec({
                    type: "entity:move",
                    id: sh.entityId,
                    x: sh.x, y: sh.y, z: sh.z,
                    yaw: sh.yaw, tiltX: 0,
                });
            }
        }
    }

    // Round 29 — napalm bit. Sticky fire spot dropped by napalm projectiles.
    // Each bit lands on terrain and burns enemies in radius for `ttl` seconds.
    _spawnNapalmBit(x, y, z, type) {
        const groundY = this._surfaceY(x, z) + 0.05;
        const bit = {
            x, y: groundY, z,
            ttl: type.bitTtl ?? 3.0,
            age: 0,
            radius: type.aoe ?? 1.6,
            damagePerSec: type.bitDamagePerSec ?? 8,
            entityId: null,
        };
        if (this.router) {
            const r = this.router.exec({
                type: "entity:spawnMesh",
                assetId: "napalm_bit",
                kind: "napalm_bit",
                x: bit.x, y: bit.y, z: bit.z,
                scale: 0.5,
            });
            bit.entityId = r?.id ?? null;
        }
        this.napalmBits.push(bit);
    }

    _tickNapalmBits(dt, t) {
        if (!this.napalmBits || this.napalmBits.length === 0) return;
        for (let i = this.napalmBits.length - 1; i >= 0; i--) {
            const b = this.napalmBits[i];
            b.age += dt;
            if (b.age >= b.ttl) {
                if (b.entityId != null && this.router) {
                    this.router.exec({ type: "entity:despawn", id: b.entityId });
                }
                this.napalmBits.splice(i, 1);
                continue;
            }
            const intensity = 1 - b.age / b.ttl;
            const dmgThisFrame = b.damagePerSec * dt * intensity;

            // Damage enemies in radius — minions, drones, OGRE chassis,
            // OGRE hardpoints. Defenders (player team) are immune.
            for (const m of this.minions) {
                if (m.hp <= 0) continue;
                if (Math.hypot(m.x - b.x, m.z - b.z) < b.radius) {
                    m.hp -= dmgThisFrame;
                }
            }
            for (const dr of this.drones) {
                if (dr.hp <= 0) continue;
                const horiz = Math.hypot(dr.x - b.x, dr.z - b.z);
                if (horiz < b.radius && (dr.y - b.y) < 4) {
                    dr.hp -= dmgThisFrame;
                }
            }
            if (this.ogre && Math.hypot(this.ogre.position.x - b.x, this.ogre.position.z - b.z) < b.radius * 1.4) {
                this.ogreHp -= dmgThisFrame;
            }
            // Continuous fire/smoke particles
            if (this.particles?.spawn && Math.random() < 0.6 * intensity) {
                const a = Math.random() * Math.PI * 2;
                const r = Math.random() * b.radius * 0.7;
                this.particles.spawn({
                    x: b.x + Math.cos(a) * r,
                    y: b.y + Math.random() * 0.4,
                    z: b.z + Math.sin(a) * r,
                    vy: 1.5 + Math.random() * 1.0,
                    ttl: 0.4, size: 0.45,
                    r: 1.0, g: 0.55 + Math.random() * 0.3, b: 0.15, a: 1.0,
                });
            }
            if (this.particles?.spawn && Math.random() < 0.25 * intensity) {
                this.particles.spawn({
                    x: b.x + (Math.random() - 0.5) * 0.6,
                    y: b.y + 0.5,
                    z: b.z + (Math.random() - 0.5) * 0.6,
                    vy: 1 + Math.random() * 0.6,
                    ttl: 0.9, size: 0.55,
                    r: 0.20, g: 0.18, b: 0.18, a: 0.5,
                    gravity: -1,
                });
            }
        }
    }

    // Round 34 — sea mine deployment + tick. Mines are stationary entities
    // that bob on water surface, with a rotating alarm light. Detonate on
    // enemy proximity (minions, drones, OGRE chassis).
    _deployMine(from, target, tt, isLand = false) {
        if (this.mines.length >= (tt.mineMaxCount ?? 8)) {
            const oldest = this.mines.shift();
            if (oldest && oldest.entityId != null && this.router) {
                this.router.exec({ type: "entity:despawn", id: oldest.entityId });
            }
            if (oldest && oldest.lightEntityId != null && this.router) {
                this.router.exec({ type: "entity:despawn", id: oldest.lightEntityId });
            }
        }
        const range = tt.mineDeployRange ?? 25;
        let mx, mz;
        if (target) {
            const tx = target.x - from.x;
            const tz = target.z - from.z;
            const tdist = Math.hypot(tx, tz) || 1;
            const dpDist = Math.min(range, tdist);
            mx = from.x + (tx / tdist) * dpDist;
            mz = from.z + (tz / tdist) * dpDist;
        } else {
            mx = from.x + (Math.random() - 0.5) * range;
            mz = from.z + (Math.random() - 0.5) * range;
        }
        const groundY = this._surfaceY(mx, mz);
        // Round 36 — land mines sit flat on the ground; sea mines float
        // up at water surface and bob with a rotating alarm light.
        const mineY = isLand ? (groundY + 0.25) : (groundY + 1.6);
        const mine = {
            x: mx, y: mineY, z: mz,
            baseY: mineY,
            isLand,                              // round 36
            damage: tt.damage ?? 80,
            radius: tt.aoe ?? 4.0,
            ttl: tt.mineLifetime ?? 60,
            age: 0,
            lightAngle: 0,
            hp: isLand ? 4 : 3,                   // land mines slightly tougher
            _shotDown: false,
            _assignedDrone: false,
            entityId: null,
            lightEntityId: null,
        };
        if (this.router) {
            const r = this.router.exec({
                type: "entity:spawnMesh",
                assetId: isLand ? "land_mine" : "sea_mine",
                kind:    isLand ? "land_mine" : "sea_mine",
                x: mx, y: mineY, z: mz,
                scale: isLand ? 0.7 : 1.2,
            });
            mine.entityId = r?.id ?? null;
            if (!isLand) {
                // Sea mines get a rotating alarm light overhead
                const lightR = this.router.exec({
                    type: "entity:spawnMesh",
                    assetId: "mine_alarm_light",
                    kind: "mine_alarm_light",
                    x: mx, y: mineY + 1.0, z: mz,
                    scale: 0.4,
                });
                mine.lightEntityId = lightR?.id ?? null;
            }
        }
        this.mines.push(mine);
    }

    _tickMines(dt, t) {
        if (!this.mines || this.mines.length === 0) return;
        for (let i = this.mines.length - 1; i >= 0; i--) {
            const m = this.mines[i];
            m.age += dt;
            // Round 36 — land mines sit flat (no bob, no rotating light)
            const bob = m.isLand ? 0 : Math.sin(t * 1.3 + m.x * 0.1) * 0.2;
            const my = m.baseY + bob;
            m.lightAngle = m.isLand ? 0 : ((m.lightAngle + dt * 4.0) % (Math.PI * 2));
            const lr = 0.6;
            const lx = m.x + Math.cos(m.lightAngle) * lr;
            const lz = m.z + Math.sin(m.lightAngle) * lr;
            const ly = my + 0.9;
            if (this.router) {
                if (m.entityId != null) {
                    this.router.exec({
                        type: "entity:move",
                        id: m.entityId, x: m.x, y: my, z: m.z,
                        yaw: m.lightAngle, tiltX: 0,
                    });
                }
                if (m.lightEntityId != null) {
                    this.router.exec({
                        type: "entity:move",
                        id: m.lightEntityId, x: lx, y: ly, z: lz,
                    });
                }
            }
            if (this.particles?.spawn && Math.sin(t * 6 + m.x) > 0.7) {
                this.particles.spawn({
                    x: lx, y: ly, z: lz,
                    ttl: 0.12, size: 0.5,
                    r: 1.0, g: 0.20, b: 0.15, a: 1.0,
                });
            }
            // Proximity detonate
            let detonate = null;
            if (this.ogre) {
                const dox = this.ogre.position.x - m.x;
                const doz = this.ogre.position.z - m.z;
                if (Math.hypot(dox, doz) < m.radius) detonate = "ogre";
            }
            if (!detonate) {
                for (const mn of this.minions) {
                    if (mn.hp <= 0) continue;
                    if (Math.hypot(mn.x - m.x, mn.z - m.z) < m.radius) { detonate = "minion"; break; }
                }
            }
            if (!detonate) {
                for (const dr of this.drones) {
                    if (dr.hp <= 0) continue;
                    if (Math.hypot(dr.x - m.x, dr.z - m.z) < m.radius) { detonate = "drone"; break; }
                }
            }
            // Round 35 — shot-down by PD: small pop, no damage AoE.
            if (m._shotDown) {
                this._sfxAt?.("ogre_mine_pop", m.x, m.y, m.z);   // round 40
                if (this.particles?.spawn) {
                    for (let n = 0; n < 14; n++) {
                        const a = Math.random() * Math.PI * 2;
                        const sp = 2 + Math.random() * 3;
                        this.particles.spawn({
                            x: m.x, y: m.y, z: m.z,
                            vx: Math.cos(a) * sp,
                            vy: 1 + Math.random() * 2,
                            vz: Math.sin(a) * sp,
                            ttl: 0.6, size: 0.40,
                            r: 0.85, g: 0.90, b: 1.0, a: 0.85,
                            gravity: 6,
                        });
                    }
                }
                if (m.entityId != null && this.router) {
                    this.router.exec({ type: "entity:despawn", id: m.entityId });
                }
                if (m.lightEntityId != null && this.router) {
                    this.router.exec({ type: "entity:despawn", id: m.lightEntityId });
                }
                this.mines.splice(i, 1);
                continue;
            }
            if (detonate || m.age >= m.ttl) {
                this._detonateMine(m);
                if (m.entityId != null && this.router) {
                    this.router.exec({ type: "entity:despawn", id: m.entityId });
                }
                if (m.lightEntityId != null && this.router) {
                    this.router.exec({ type: "entity:despawn", id: m.lightEntityId });
                }
                this.mines.splice(i, 1);
            }
        }
    }

    _detonateMine(m) {
        if (this.ogre) {
            const d = Math.hypot(this.ogre.position.x - m.x, this.ogre.position.z - m.z);
            if (d < m.radius) this.ogreHp -= m.damage * (1 - d / m.radius);
        }
        for (const mn of this.minions) {
            if (mn.hp <= 0) continue;
            const d = Math.hypot(mn.x - m.x, mn.z - m.z);
            if (d < m.radius) mn.hp -= m.damage * (1 - d / m.radius);
        }
        for (const dr of this.drones) {
            if (dr.hp <= 0) continue;
            const d = Math.hypot(dr.x - m.x, dr.z - m.z);
            if (d < m.radius) dr.hp -= m.damage * (1 - d / m.radius);
        }
        if (this.particles?.spawn) {
            for (let n = 0; n < 50; n++) {
                const a = Math.random() * Math.PI * 2;
                const sp = 4 + Math.random() * 7;
                this.particles.spawn({
                    x: m.x, y: m.y, z: m.z,
                    vx: Math.cos(a) * sp,
                    vy: 4 + Math.random() * 6,
                    vz: Math.sin(a) * sp,
                    ttl: 1.4, size: 0.6,
                    r: 0.9, g: 0.95, b: 1.0, a: 0.85,
                    gravity: 9,
                });
            }
            for (let n = 0; n < 40; n++) {
                const a = Math.random() * Math.PI * 2;
                const sp = 3 + Math.random() * 5;
                this.particles.spawn({
                    x: m.x, y: m.y + 1, z: m.z,
                    vx: Math.cos(a) * sp,
                    vy: 2 + Math.random() * 4,
                    vz: Math.sin(a) * sp,
                    ttl: 0.9, size: 0.55,
                    r: 1.0, g: 0.55, b: 0.18, a: 1.0,
                    gravity: 8,
                });
            }
        }
        this._sfxAt("ogre_artillery_impact", m.x, m.y, m.z);
        if (this.camera?.shake) {
            const dx = this.camera.position.x - m.x;
            const dy = this.camera.position.y - m.y;
            const dz = this.camera.position.z - m.z;
            const dist = Math.hypot(dx, dy, dz);
            if (dist < 80) this.camera.shake(0.25 * (1 - dist / 80), 300);
        }
    }

    _moveRig(dt) {
        if (!this.ogre) return;
        const scaleMul = (this.variant?.scale ?? 4) / 4;

        // Round 21 — tech cascade damage. When tech_module hardpoint is
        // destroyed (specialDisabled flips to true), shatter ALL variant-
        // specific rig parts. The tech module is the linchpin for the
        // variant special; its loss should be visible mechanically.
        if (this.specialDisabled && !this._techCascadeDone) {
            this._techCascadeDone = true;
            for (const k of Object.keys(this.rig)) {
                const r = this.rig[k];
                if (!r || r.entityId == null) continue;
                if (!r.def?.variantSpecial) continue;   // only variant parts
                if (r.def.variantSpecial === null) continue;   // skip always-on
                this._shatterRigPart(k,
                    this.ogre.position.x + (r.def.offset.x ?? 0) * scaleMul,
                    this.ogre.position.y + (r.def.offset.y ?? 0) * scaleMul,
                    this.ogre.position.z + (r.def.offset.z ?? 0) * scaleMul,
                    [0.6, 0.9, 1.0]
                );
            }
        }

        // Smoothly track the chassis yaw based on movement direction
        const fwdX = this.ogre.position.x - (this._prevOgrePos?.x ?? this.ogre.position.x);
        const fwdZ = this.ogre.position.z - (this._prevOgrePos?.z ?? this.ogre.position.z);
        const moving = (fwdX * fwdX + fwdZ * fwdZ) > 1e-6;
        this._ogreMoving = moving;       // round 36 — exposed for AP mine drop
        const targetChassisYaw = moving ? Math.atan2(fwdX, fwdZ) : this._chassisYaw;
        // Round 40 — water drift on fast turns. In sea env, when chassis
        // yaw lerp rate is high (sharp turn), inject lateral velocity
        // perpendicular to forward direction. Sub variant drifts harder
        // because of submerged volume.
        if (moving && this._currentEnv === "sea") {
            const prevYaw = this._chassisYaw;
            const yawDelta = this._wrapAngle(targetChassisYaw - prevYaw);
            const turnRate = Math.abs(yawDelta) / Math.max(dt, 0.001);
            const TURN_THRESHOLD = 1.8;                          // rad/s
            if (turnRate > TURN_THRESHOLD) {
                // Lateral push opposite to turn direction (drift outward)
                const sideSign = Math.sign(yawDelta);
                const driftStrength = Math.min(0.7, (turnRate - TURN_THRESHOLD) * 0.15);
                const subMul = (this.variant?.special === "submarine") ? 1.6 : 1.0;
                const driftAmount = driftStrength * subMul;
                // Perpendicular vector to forward (sideways)
                const sideX = Math.cos(prevYaw) * sideSign;
                const sideZ = -Math.sin(prevYaw) * sideSign;
                this.ogre.position.x += sideX * driftAmount * dt * 8;
                this.ogre.position.z += sideZ * driftAmount * dt * 8;
                // Spray wake from outer side
                if (this.particles?.spawn && Math.random() < 0.8) {
                    const sx = this.ogre.position.x + sideX * 2.5;
                    const sz = this.ogre.position.z + sideZ * 2.5;
                    const wy = this._surfaceY(sx, sz) + 2.0;
                    for (let n = 0; n < 3; n++) {
                        this.particles.spawn({
                            x: sx + (Math.random() - 0.5) * 0.8,
                            y: wy,
                            z: sz + (Math.random() - 0.5) * 0.8,
                            vx: sideX * (2 + Math.random() * 2),
                            vy: 1 + Math.random() * 1.5,
                            vz: sideZ * (2 + Math.random() * 2),
                            ttl: 0.9, size: 0.55,
                            r: 0.92, g: 0.96, b: 1.0, a: 0.7,
                            gravity: 4,
                        });
                    }
                }
            }
        }
        this._chassisYaw = this._lerpAngle(this._chassisYaw, targetChassisYaw, 1 - Math.exp(-8 * dt));

        // Round 108 — banking. Flying variants bank INTO the turn by
        // rolling around their forward axis. Computes yaw rate (rad/sec)
        // from yaw delta since last frame, maps to a target roll, lerps
        // current roll toward target. Smooth + dt-independent.
        //
        // Ground OGREs never bank — tanks don't lean. Gate: any
        // variant.special starting with "flying_" gets the bank.
        if ((this.variant?.special ?? "").startsWith("flying") && this.ogre) {
            const prevYaw = this._lastChassisYawSample ?? this._chassisYaw;
            let yawDelta = this._chassisYaw - prevYaw;
            // normalize to [-π, π]
            while (yawDelta >  Math.PI) yawDelta -= 2 * Math.PI;
            while (yawDelta < -Math.PI) yawDelta += 2 * Math.PI;
            this._lastChassisYawSample = this._chassisYaw;
            const yawRate = yawDelta / Math.max(dt, 0.001);
            // bank INTO turn — right turn (+yaw) tilts right wing down (-tiltZ)
            const targetBank = Math.max(-0.4, Math.min(0.4, -yawRate * 0.3));
            const currentBank = this.ogre.tiltZ ?? 0;
            const lerpAlpha = 1 - Math.exp(-4 * dt);
            this.ogre.tiltZ = currentBank * (1 - lerpAlpha) + targetBank * lerpAlpha;
        } else if (this.ogre && this.ogre.tiltZ) {
            // Restore zero roll for non-flying variants (in case
            // someone toggled variants mid-scenario)
            this.ogre.tiltZ = 0;
        }

        // Round 34 — V-shaped wake trail behind the OGRE in sea env.
        // Two streams flare outward at ±0.6 rad from chassis facing,
        // emitted just behind the rear treads. Gives moving OGRE a
        // proper boat-wake silhouette.
        if (moving && this._currentEnv === "sea" && this.particles?.spawn) {
            const opx = this.ogre.position.x, opz = this.ogre.position.z;
            const wakeY = this._surfaceY(opx, opz) + 2.0;          // sea surface
            const baseYaw = this._chassisYaw + Math.PI;            // behind chassis
            for (let side = -1; side <= 1; side += 2) {
                const yaw = baseYaw + side * 0.55;
                const dx = Math.sin(yaw), dz = Math.cos(yaw);
                // emit two particles per stream per frame for density
                for (let n = 0; n < 2; n++) {
                    const off = 2.6 + Math.random() * 1.4;          // behind
                    this.particles.spawn({
                        x: opx + dx * off + (Math.random() - 0.5) * 0.3,
                        y: wakeY + (Math.random() - 0.5) * 0.1,
                        z: opz + dz * off + (Math.random() - 0.5) * 0.3,
                        vx: dx * (1.0 + Math.random() * 1.8),
                        vy: 0.05 + Math.random() * 0.25,             // mostly flat
                        vz: dz * (1.0 + Math.random() * 1.8),
                        ttl: 1.6 + Math.random() * 0.8,
                        size: 0.6 + Math.random() * 0.3,
                        r: 0.92, g: 0.96, b: 1.00, a: 0.55,
                        gravity: 0,                                  // floats
                    });
                }
            }
        }

        // Aim yaw — turret tracks HQ direction
        // Round 31 — skip AI aim tracking when player drives the OGRE
        const playerDrivingOgre = this.povActive && this.povInControl
            && this.povTargets[this.povTargetIndex]?.kind === "ogre";
        if (!playerDrivingOgre) {
            const aimTarget = this.hqPos;
            const ax = aimTarget.x - this.ogre.position.x;
            const az = aimTarget.z - this.ogre.position.z;
            const targetAimYaw = (Math.abs(ax) + Math.abs(az) > 1e-3) ? Math.atan2(ax, az) : this._chassisYaw;
            this._aimYaw = this._lerpAngle(this._aimYaw, targetAimYaw, 1 - Math.exp(-4 * dt));
        }

        const cosC = Math.cos(this._chassisYaw), sinC = Math.sin(this._chassisYaw);
        const cosA = Math.cos(this._aimYaw),     sinA = Math.sin(this._aimYaw);

        for (const key of Object.keys(this.rig)) {
            const r = this.rig[key];
            const def = r.def;
            // Pick yaw frame
            let cy, sy, partYaw;
            if (def.yawMode === "aim") {
                cy = cosA; sy = sinA; partYaw = this._aimYaw;
            } else if (def.yawMode === "spin") {
                // Round 17 — accumulate spin angle, layered on chassis yaw
                r.spinAngle = (r.spinAngle ?? 0) + (def.spinRate ?? 1) * dt;
                partYaw = this._chassisYaw + r.spinAngle;
                cy = cosC; sy = sinC;
                // Note: position offset still rotates with chassis (mast on top
                // moves with chassis movement); only the part's own yaw spins.
            } else {
                cy = cosC; sy = sinC; partYaw = this._chassisYaw;
            }

            // Round 16 — cannon recoil offset
            let recoilOffset = 0;
            if (def.recoils) {
                r.recoilT += dt;
                if (r.recoilT < RECOIL_KICKBACK_TIME) {
                    const t = r.recoilT / RECOIL_KICKBACK_TIME;
                    recoilOffset = -RECOIL_DISTANCE * t;
                } else if (r.recoilT < RECOIL_KICKBACK_TIME + RECOIL_RECOVER_TIME) {
                    const t = (r.recoilT - RECOIL_KICKBACK_TIME) / RECOIL_RECOVER_TIME;
                    recoilOffset = -RECOIL_DISTANCE * (1 - t);
                }
                r.recoilOffset = recoilOffset;
            }

            // Round 17 — hatch / scan animation produces tiltX
            let tilt = 0;
            if (def.openMode === "hatch") {
                if (r.openTrig) {
                    r.openT += dt;
                    if (r.openT < HATCH_OPEN_TIME) {
                        r.openState = r.openT / HATCH_OPEN_TIME;
                    } else if (r.openT < HATCH_OPEN_TIME + HATCH_HOLD_TIME) {
                        r.openState = 1;
                    } else if (r.openT < HATCH_OPEN_TIME + HATCH_HOLD_TIME + HATCH_CLOSE_TIME) {
                        const t = (r.openT - HATCH_OPEN_TIME - HATCH_HOLD_TIME) / HATCH_CLOSE_TIME;
                        r.openState = 1 - t;
                    } else {
                        r.openState = 0;
                        r.openTrig = false;
                    }
                }
                tilt = r.openState * HATCH_FULL_OPEN_ANGLE * (def.openAxis ?? 1);
            } else if (def.openMode === "scan") {
                tilt = Math.sin(performance.now() * 0.001 * (def.scanRate ?? 1.0) + (def.scanPhase ?? 0))
                     * (def.scanAmplitude ?? 0.5);
            }

            // Round 20 — damage states. Specific rig parts visibly
            // respond to the chassis losing related hardpoints.
            //   Cannon: tilts down ~25° when weapon hardpoint destroyed
            //   Scanner dish: tilts off-axis + stops spinning when sensor destroyed
            if (key === "cannon" && this.weaponDisabled) {
                tilt -= 0.45;          // ~25° downward sag
            }
            if (key === "lancer_scanner" && this.sensorDisabled) {
                tilt += 0.55;          // dish flopped off-axis
                // Freeze spin: re-derive partYaw without continuing accumulation
                partYaw = this._chassisYaw + (r._frozenSpinAngle ??= r.spinAngle);
                cy = cosC; sy = sinC;
            }

            const ox = def.offset.x * scaleMul;
            const oy = def.offset.y * scaleMul;
            const oz = (def.offset.z + recoilOffset) * scaleMul;
            const rx = ox * cy + oz * sy;
            const rz = -ox * sy + oz * cy;
            const wx = this.ogre.position.x + rx;
            const wy = this.ogre.position.y + oy;
            const wz = this.ogre.position.z + rz;
            if (r.entityId != null && this.router) {
                this.router.exec({
                    type: "entity:move",
                    id: r.entityId,
                    x: wx, y: wy, z: wz,
                    yaw: partYaw,
                    tiltX: tilt,
                });
            }

            // Round 18 — state-driven part visuals
            // Shield dome: shatter + despawn when shieldHp hits zero
            if (def.shieldDome && r.entityId != null && this.shieldHp <= 0) {
                this._shatterRigPart(key, wx, wy, wz, [0.7, 0.7, 1.0]);
            }
            // Round 20 — Aegis dome shrinks + warning crackle as shield depletes.
            // At full HP: scale=1.0. At 0 HP: scale=0.55 (still visible until shatter).
            if (def.shieldDome && r.entityId != null && this.shieldMaxHp > 0) {
                const frac = Math.max(0, this.shieldHp / this.shieldMaxHp);
                const dynScale = (0.55 + 0.45 * frac) * def.scale * scaleMul;
                if (this.router) {
                    this.router.exec({ type: "entity:rescale", id: r.entityId, scale: dynScale });
                }
                // Damage crackle — emit blue arcs over dome surface when below 60%
                if (frac < 0.6 && Math.random() < 0.3 && this.particles?.spawn) {
                    const a = Math.random() * Math.PI * 2;
                    const phi = Math.random() * Math.PI * 0.5;
                    const r2 = dynScale * 0.95;
                    this.particles.spawn({
                        x: wx + Math.cos(a) * Math.cos(phi) * r2,
                        y: wy + Math.sin(phi) * r2,
                        z: wz + Math.sin(a) * Math.cos(phi) * r2,
                        ttl: 0.2, size: 0.3,
                        r: 0.7, g: 0.85, b: 1.0, a: 1.0,
                    });
                }
            }
            // Splitter strut: shatter + despawn at split moment
            if (def.splitterStrut && r.entityId != null && this._didSplit) {
                this._shatterRigPart(key, wx, wy, wz, [1.0, 0.6, 0.5]);
            }
            // Round 20 — Splitter pre-split warning. As OGRE HP approaches 50%,
            // struts emit amber sparks signaling the impending split.
            if (def.splitterStrut && r.entityId != null && !this._didSplit
                && this.ogre && this.variant?.maxHp != null) {
                const ogreHp = this.ogre.hp ?? this.ogre.energy ?? 0;
                const ogreMax = this.variant.maxHp;
                const frac = ogreMax > 0 ? ogreHp / ogreMax : 1;
                if (frac < 0.65 && Math.random() < 0.25 && this.particles?.spawn) {
                    const a = Math.random() * Math.PI * 2;
                    this.particles.spawn({
                        x: wx + Math.cos(a) * 0.3,
                        y: wy + (Math.random() - 0.5) * 1.5,
                        z: wz + Math.sin(a) * 0.3,
                        vy: 1 + Math.random() * 1.5,
                        ttl: 0.4, size: 0.35,
                        r: 1.0, g: 0.55 + Math.random() * 0.3, b: 0.2, a: 1.0,
                    });
                }
            }
            // Phantom emitter: emit dense purple sparks while cloaked
            if (def.cloakEmitter && this.cloaked && this.particles?.spawn) {
                if (Math.random() < 0.6) {
                    const a = Math.random() * Math.PI * 2;
                    this.particles.spawn({
                        x: wx + Math.cos(a) * 0.4,
                        y: wy + Math.random() * 0.6,
                        z: wz + Math.sin(a) * 0.4,
                        vy: 1 + Math.random() * 1.5,
                        ttl: 0.5, size: 0.4,
                        r: 0.65, g: 0.30, b: 1.0, a: 1.0,
                        gravity: -2,
                    });
                }
            }
            // Smoke stacks: continuous gray smoke. Round 21 — engine-
            // disabled OGREs belch much heavier black smoke.
            if (def.emitsSmoke && this.particles?.spawn) {
                const heavySmoke = this.engineDisabled;
                const spawnChance = heavySmoke ? 0.95 : 0.45;
                if (Math.random() < spawnChance) {
                    // Heavy smoke = blacker, larger, thicker plumes
                    const cR = heavySmoke ? 0.12 : 0.30;
                    const cG = heavySmoke ? 0.12 : 0.30;
                    const cB = heavySmoke ? 0.13 : 0.32;
                    const sz = heavySmoke ? 0.85 : 0.65;
                    const ttl = heavySmoke ? 1.8 : 1.4;
                    this.particles.spawn({
                        x: wx + (Math.random() - 0.5) * 0.5,
                        y: wy + 0.4 + Math.random() * 0.5,
                        z: wz + (Math.random() - 0.5) * 0.5,
                        vy: 1.2 + Math.random() * 0.8,
                        vx: (Math.random() - 0.5) * 0.4,
                        vz: (Math.random() - 0.5) * 0.4,
                        ttl, size: sz,
                        r: cR, g: cG, b: cB, a: heavySmoke ? 0.85 : 0.6,
                        gravity: -1,
                    });
                    // Heavy smoke also occasionally emits a hot ember
                    if (heavySmoke && Math.random() < 0.2) {
                        this.particles.spawn({
                            x: wx + (Math.random() - 0.5) * 0.4,
                            y: wy + 0.5,
                            z: wz + (Math.random() - 0.5) * 0.4,
                            vy: 2 + Math.random() * 1.5,
                            ttl: 0.4, size: 0.35,
                            r: 1.0, g: 0.5, b: 0.15, a: 1.0,
                        });
                    }
                }
            }
            // Round 20 — tread dust kick. When OGRE is moving and this part
            // is a tread, emit dust at the world contact point.
            // Round 34 — in sea env, swap to white-blue water spray (wakes).
            if ((key === "treadL" || key === "treadR") && moving && this.particles?.spawn) {
                if (Math.random() < 0.55) {
                    const ad = Math.random() * Math.PI * 2;
                    const sea = (this._currentEnv === "sea");
                    this.particles.spawn({
                        x: wx + (Math.random() - 0.5) * 0.5,
                        y: wy - 0.5,
                        z: wz + (Math.random() - 0.5) * 0.5,
                        vx: Math.cos(ad) * (sea ? 2.2 : 1.5),
                        vy: (sea ? 1.2 : 0.5) + Math.random() * (sea ? 1.6 : 1.0),
                        vz: Math.sin(ad) * (sea ? 2.2 : 1.5),
                        ttl: sea ? 1.1 : 0.7,
                        size: sea ? 0.48 : 0.55,
                        r: sea ? 0.85 : 0.55,
                        g: sea ? 0.92 : 0.48,
                        b: sea ? 1.00 : 0.40,
                        a: sea ? 0.80 : 0.6,
                        gravity: sea ? 12 : 8,
                    });
                }
            }
            // Round 23 — MK3 spotlight cones. For each spotlight rig
            // part, emit a cone of warm-white particles extending in the
            // spotlight's facing direction (chassis yaw + scan tilt).
            if (def.kind === "ogre_spotlight" && this.particles?.spawn) {
                // Spotlight forward vector: chassis yaw rotated by tilt
                // (which is the scan oscillation around X axis).
                const fwdY = -Math.sin(tilt);
                const fwdH = Math.cos(tilt);                  // horizontal magnitude
                const fwdX = fwdH * Math.sin(this._chassisYaw);
                const fwdZ = fwdH * Math.cos(this._chassisYaw);
                // Emit particles at increasing distance forward
                const numSamples = 4;
                const coneLength = 18 * scaleMul;
                for (let s = 0; s < numSamples; s++) {
                    const tStep = (s + Math.random()) / numSamples;
                    const dist = tStep * coneLength;
                    const spread = tStep * 1.4;               // cone widens with distance
                    const sx = wx + fwdX * dist + (Math.random() - 0.5) * spread;
                    const sy = wy + fwdY * dist + (Math.random() - 0.5) * spread * 0.5;
                    const sz = wz + fwdZ * dist + (Math.random() - 0.5) * spread;
                    // Fade alpha with distance from spotlight
                    const alpha = 0.55 * (1 - tStep);
                    this.particles.spawn({
                        x: sx, y: sy, z: sz,
                        ttl: 0.18, size: 0.55 + tStep * 0.4,
                        r: 1.0, g: 0.96, b: 0.75, a: alpha,
                    });
                }
            }
        }
    }

    // Round 18 — shatter a rig part with a particle burst, then despawn
    // its entity. Used for shield-dome break and splitter-strut split.
    _shatterRigPart(key, x, y, z, color) {
        const r = this.rig?.[key];
        if (!r || r.entityId == null) return;
        if (this.particles?.spawn) {
            for (let n = 0; n < 36; n++) {
                const a = Math.random() * Math.PI * 2;
                const speed = 3 + Math.random() * 6;
                this.particles.spawn({
                    x, y: y + (Math.random() - 0.5), z,
                    vx: Math.cos(a) * speed,
                    vy: 1 + Math.random() * 4,
                    vz: Math.sin(a) * speed,
                    ttl: 0.9, size: 0.55,
                    r: color[0], g: color[1], b: color[2], a: 1.0,
                    gravity: 7,
                });
            }
        }
        if (this.router) {
            this.router.exec({ type: "entity:despawn", id: r.entityId });
        }
        r.entityId = null;
    }

    // Round 17 — trigger a hatch open animation on a named rig part.
    triggerHatchOpen(rigKey) {
        const r = this.rig?.[rigKey];
        if (!r) return;
        r.openTrig = true;
        r.openT = 0;
        r.openState = 0;
    }

    // Shortest-path angle interpolation
    _lerpAngle(a, b, t) {
        let d = b - a;
        while (d > Math.PI)  d -= Math.PI * 2;
        while (d < -Math.PI) d += Math.PI * 2;
        return a + d * t;
    }

    // Round 40 — wrap angle delta into [-π, π]
    _wrapAngle(d) {
        while (d > Math.PI)  d -= Math.PI * 2;
        while (d < -Math.PI) d += Math.PI * 2;
        return d;
    }

    _destroyHardpoint(h) {
        h.destroyed = true;
        h.hp = 0;
        h.destroyedT = performance.now() * 0.001;    // round 25 — smoke decay clock
        // Round 28 — spawn dent decal entity that follows chassis at the
        // hardpoint position. Persistent visual scorch — survives even
        // after smoke fades. Position updated per frame in hardpoint loop.
        if (this.router) {
            const dentResult = this.router.exec({
                type: "entity:spawnMesh",
                assetId: "ogre_hardpoint_dent",
                kind: "ogre_hardpoint_dent",
                x: h.x, y: h.y, z: h.z,
                scale: 0.55,
            });
            h.dentEntityId = dentResult?.id ?? null;
        }
        // Big explosion
        if (this.particles?.spawn) {
            const c = h.def.color;
            for (let n = 0; n < 60; n++) {
                const a = Math.random() * Math.PI * 2;
                const speed = 4 + Math.random() * 8;
                this.particles.spawn({
                    x: h.x, y: h.y, z: h.z,
                    vx: Math.cos(a) * speed,
                    vy: 2 + Math.random() * 6,
                    vz: Math.sin(a) * speed,
                    ttl: 1.2, size: 0.65,
                    r: c[0], g: c[1], b: c[2], a: 1.0,
                    gravity: 12,
                });
            }
            // Bright flash core
            for (let n = 0; n < 16; n++) {
                this.particles.spawn({
                    x: h.x, y: h.y, z: h.z,
                    vy: 1 + Math.random() * 3,
                    ttl: 0.5, size: 1.2,
                    r: 1.0, g: 0.95, b: 0.8, a: 1.0,
                    gravity: 4,
                });
            }
        }
        this._sfxAt("ogre_artillery_impact", h.x, h.y, h.z);
        // Round 110 — TUMBLING DEBRIS PIECE. Before despawning the
        // original hardpoint entity, spawn a smaller chunk that inherits
        // the hardpoint's mesh kind, gets thrown upward + outward, and
        // tumbles via yaw/tiltZ angular velocity until it hits the
        // ground. Gives destruction a physics-y "parts blown off" read
        // instead of a clean vanish.
        //
        // Tracked in this._debrisPieces[]; physics integrated in
        // _updateDebris(dt); despawned at TTL or shortly after settling.
        if (this.router) {
            const debrisKind = h.def.kind ?? "ogre_hp_weapon";
            const debrisResult = this.router.exec({
                type: "entity:spawnMesh",
                assetId: debrisKind,
                kind: debrisKind,
                x: h.x, y: h.y, z: h.z,
                scale: 0.55 * (h.def.radius ?? 1.0),
            });
            if (debrisResult?.id != null) {
                if (!this._debrisPieces) this._debrisPieces = [];
                this._debrisPieces.push({
                    entityId: debrisResult.id,
                    x: h.x, y: h.y, z: h.z,
                    // Upward arc + lateral throw scaled by chassis size
                    vx: (Math.random() - 0.5) * 8,
                    vy: 6 + Math.random() * 5,
                    vz: (Math.random() - 0.5) * 8,
                    yaw: Math.random() * Math.PI * 2,
                    tiltZ: 0,
                    yawVel:   (Math.random() - 0.5) * 12,   // rad/s
                    tiltZVel: (Math.random() - 0.5) * 10,
                    ttl: 6.0,
                    settled: false,
                });
            }
        }
        if (h.entityId != null && this.router) {
            this.router.exec({ type: "entity:despawn", id: h.entityId });
            h.entityId = null;
        }
        // Apply disable effect
        switch (h.def.effect) {
            case "disable_weapon":  this.weaponDisabled = true; break;
            case "slow_engine":     this.engineDisabled = true; break;
            case "disable_special": this.specialDisabled = true; break;
            case "slow_attack":     this.sensorDisabled = true; break;
        }
        console.log(`[OGRE] hardpoint destroyed: ${h.def.label}`);
        // Bonus score for popping a hard point
        this.score += 25;
        // Round 11 — leave a fire burning at the hardpoint position
        this._spawnFireAt(h.x, h.y, h.z, HARDPOINT_FIRE_TTL);
        // Round 37 — explosive decompression. When sub variant in sea env
        // and submerged, a destroyed hardpoint is an immediate breach: big
        // damage hit, sustained water-ingress bubbles, and the OGRE starts
        // taking flood damage proportional to total breaches.
        const isSubmerged = (this.variant?.special === "submarine"
                          && this._currentEnv === "sea"
                          && (this._subDepth || 0) > 0.5);
        if (isSubmerged) {
            const breachDmg = 30;
            this.ogreHp = Math.max(0, this.ogreHp - breachDmg);
            this._floodCount = (this._floodCount || 0) + 1;
            // Massive bubble eruption from breach point
            if (this.particles?.spawn) {
                for (let n = 0; n < 80; n++) {
                    const a = Math.random() * Math.PI * 2;
                    const sp = 3 + Math.random() * 5;
                    this.particles.spawn({
                        x: h.x, y: h.y, z: h.z,
                        vx: Math.cos(a) * sp,
                        vy: 3 + Math.random() * 6,
                        vz: Math.sin(a) * sp,
                        ttl: 2.4, size: 0.55,
                        r: 0.9, g: 0.95, b: 1.0, a: 0.85,
                        gravity: -2,                  // bubbles rise
                    });
                }
            }
            if (this.camera?.shake) this.camera.shake(0.6, 600);
            console.log(`[OGRE] BREACH at ${h.def.label} — flood count ${this._floodCount}`);
            this._sfxAt?.("ogre_breach", h.x, h.y, h.z);   // round 40
            // Round 42 — speech alert
            const am42 = (typeof window !== "undefined") ? window.audioManager : null;
            am42?.alert?.(`Hull breach. ${h.def.label} compromised.`);
            // Track breach point for continuous bubble emission
            if (!this._breaches) this._breaches = [];
            this._breaches.push({ x: h.x, y: h.y, z: h.z, key: h.key, age: 0 });
        }
        // Round 37 — cascading internal explosions. Any destroyed hardpoint
        // primes the cascade timer; sustained random secondary explosions
        // erupt across the chassis until OGRE dies. Damage and frequency
        // scale with total destroyed hardpoints.
        this._cascadeArmed = true;
    }

    // -------------------------------------------------------------- air drops (round 9)

    canAffordAirDrop() {
        return this.score >= AIR_DROP_COST_SCORE;
    }

    callAirDrop() {
        if (!this.active || this.state !== "playing") return false;
        if (!this.canAffordAirDrop()) return false;
        this.score -= AIR_DROP_COST_SCORE;
        const dx = (Math.random() - 0.5) * (DEFENDER_COUNT - 1) * DEFENDER_SPACING;
        const dz = this.arena.layout.defenderLineZ + (Math.random() - 0.5) * 6;
        const groundY = this._surfaceY(dx, dz);
        const drop = {
            x: dx, y: AIR_DROP_START_ALT, z: dz,
            groundY, vy: -AIR_DROP_FALL_SPEED,
            entityId: null,
            ttl: 8,
        };
        if (this.router) {
            const result = this.router.exec({
                type: "entity:spawnMesh",
                assetId: "ogre_drop",
                kind: "ogre_drop",
                x: dx, y: AIR_DROP_START_ALT, z: dz,
                scale: 1.4,
            });
            drop.entityId = result?.id ?? null;
        }
        this.airdrops.push(drop);
        this._sfx("ogre_minion_spawn", 0.7);
        return true;
    }

    _tickAirdrops(dt, t) {
        for (let i = this.airdrops.length - 1; i >= 0; i--) {
            const a = this.airdrops[i];
            a.y += a.vy * dt;
            a.ttl -= dt;
            if (this.particles?.spawn) {
                this.particles.spawn({
                    x: a.x + (Math.random() - 0.5) * 0.6,
                    y: a.y + 0.5,
                    z: a.z + (Math.random() - 0.5) * 0.6,
                    ttl: 0.7, size: 0.55,
                    r: 0.7, g: 0.7, b: 0.7, a: 0.6,
                });
                this.particles.spawn({
                    x: a.x, y: a.y + 0.2, z: a.z,
                    ttl: 0.25, size: 0.45,
                    r: 1.0, g: 0.7, b: 0.3, a: 1.0,
                });
            }
            if (a.entityId != null && this.router) {
                this.router.exec({
                    type: "entity:move",
                    id: a.entityId, x: a.x, y: a.y, z: a.z,
                });
            }
            if (a.y <= a.groundY + 0.5) {
                if (this.particles?.spawn) {
                    for (let n = 0; n < 24; n++) {
                        const ang = Math.random() * Math.PI * 2;
                        const speed = 2 + Math.random() * 4;
                        this.particles.spawn({
                            x: a.x, y: a.groundY, z: a.z,
                            vx: Math.cos(ang) * speed,
                            vy: 1 + Math.random() * 2,
                            vz: Math.sin(ang) * speed,
                            ttl: 0.7, size: 0.5,
                            r: 0.7, g: 0.55, b: 0.4, a: 0.85,
                            gravity: 8,
                        });
                    }
                }
                this._sfxAt("ogre_trample", a.x, a.groundY, a.z);
                if (a.entityId != null && this.router) {
                    this.router.exec({ type: "entity:despawn", id: a.entityId });
                }
                const def = {
                    type: "machinegun",
                    x: a.x, y: a.groundY, z: a.z,
                    hp: 30, maxHp: 30,
                    lastFireT: 0,
                    shotsFired: 0,
                    targetPos: null,
                    selected: false,
                    entityId: null,
                    aimYaw: 0,
                    _lastFireYaw: 0,
                };
                if (this.router) {
                    const result = this.router.exec({
                        type: "entity:spawnMesh",
                        assetId: "defender",
                        kind: "defender",
                        x: a.x, y: a.groundY + 1, z: a.z,
                        scale: 1.6,
                    });
                    def.entityId = result?.id ?? null;
                }
                this.defenders.push(def);
                this.airdrops.splice(i, 1);
            } else if (a.ttl <= 0) {
                if (a.entityId != null && this.router) {
                    this.router.exec({ type: "entity:despawn", id: a.entityId });
                }
                this.airdrops.splice(i, 1);
            }
        }
    }

    // -------------------------------------------------------------- splitter shards (round 10)

    _splitOgre() {
        if (!this.ogre) return;
        // Big visual flash on split
        if (this.particles?.spawn) {
            for (let n = 0; n < 80; n++) {
                const a = Math.random() * Math.PI * 2;
                const speed = 4 + Math.random() * 10;
                this.particles.spawn({
                    x: this.ogre.position.x,
                    y: this.ogre.position.y + 2 + Math.random() * 3,
                    z: this.ogre.position.z,
                    vx: Math.cos(a) * speed,
                    vy: 2 + Math.random() * 6,
                    vz: Math.sin(a) * speed,
                    ttl: 1.0, size: 0.65,
                    r: 1.0, g: 0.55, b: 0.85, a: 1.0,
                    gravity: 8,
                });
            }
        }
        this._sfxAt("ogre_artillery_impact", this.ogre.position.x, this.ogre.position.y, this.ogre.position.z);
        // Spawn 2 shards flanking the OGRE
        const baseX = this.ogre.position.x;
        const baseZ = this.ogre.position.z;
        for (const offset of [-3.5, 3.5]) {
            const sx = baseX + offset;
            const sz = baseZ;
            const sy = this._surfaceY(sx, sz);
            const shard = {
                x: sx, y: sy, z: sz,
                hp: SHARD_HP, maxHp: SHARD_HP,
                lastFireT: 0,
                entityId: null,
            };
            if (this.router) {
                const result = this.router.exec({
                    type: "entity:spawnMesh",
                    assetId: "ogre_shard",
                    kind: "ogre_shard",
                    x: sx, y: sy + 1, z: sz,
                    scale: SHARD_SCALE,
                });
                shard.entityId = result?.id ?? null;
            }
            this.shards.push(shard);
        }
        console.log("[OGRE] SPLITTER fragmented — 2 shards deployed");
    }

    _tickShards(dt, t) {
        for (let i = this.shards.length - 1; i >= 0; i--) {
            const sh = this.shards[i];
            if (sh.hp <= 0) {
                this._sfxAt("ogre_minion_death", sh.x, sh.y, sh.z);
                if (this.particles?.spawn) {
                    for (let n = 0; n < 24; n++) {
                        const a = Math.random() * Math.PI * 2;
                        const speed = 3 + Math.random() * 5;
                        this.particles.spawn({
                            x: sh.x, y: sh.y + 1, z: sh.z,
                            vx: Math.cos(a) * speed,
                            vy: 1 + Math.random() * 3,
                            vz: Math.sin(a) * speed,
                            ttl: 0.8, size: 0.55,
                            r: 1.0, g: 0.55, b: 0.85, a: 1.0,
                            gravity: 12,
                        });
                    }
                }
                if (sh.entityId != null && this.router) {
                    this.router.exec({ type: "entity:despawn", id: sh.entityId });
                }
                this.score += 30;     // bonus for shard kill
                this.shards.splice(i, 1);
                continue;
            }
            // Walk toward HQ
            const dx = this.hqPos.x - sh.x;
            const dz = this.hqPos.z - sh.z;
            const dist = Math.hypot(dx, dz);
            if (dist < 1.0) {
                this.hqHp -= SHARD_DAMAGE_TO_HQ;
                this._sfx("ogre_hq_damaged", 1.0);
                if (sh.entityId != null && this.router) {
                    this.router.exec({ type: "entity:despawn", id: sh.entityId });
                }
                this.shards.splice(i, 1);
                continue;
            }
            const step = SHARD_SPEED * dt;
            sh.x += (dx / dist) * step;
            sh.z += (dz / dist) * step;
            sh.y = this._surfaceY(sh.x, sh.z);
            if (sh.entityId != null && this.router) {
                this.router.exec({
                    type: "entity:move",
                    id: sh.entityId,
                    x: sh.x, y: sh.y + 1, z: sh.z,
                    yaw: Math.atan2(dx / dist, dz / dist),
                    tiltX: 0,
                });
            }
            // Fire plasma at nearest defender if in range
            if (t - sh.lastFireT >= SHARD_PLASMA_INTERVAL) {
                let target = null, best = SHARD_PLASMA_RANGE * SHARD_PLASMA_RANGE;
                for (const d of this.defenders) {
                    if (d.hp <= 0) continue;
                    const tx = d.x - sh.x, tz = d.z - sh.z;
                    const t2 = tx * tx + tz * tz;
                    if (t2 < best) { best = t2; target = d; }
                }
                if (target) {
                    const fromX = sh.x;
                    const fromY = sh.y + 1.5;
                    const fromZ = sh.z;
                    const tdx = target.x - fromX;
                    const tdy = (target.y + 1) - fromY;
                    const tdz = target.z - fromZ;
                    const tdist = Math.hypot(tdx, tdy, tdz) || 1;
                    const speed = 24;
                    this.projectiles.push({
                        team: "ogre",
                        x: fromX, y: fromY, z: fromZ,
                        vx: tdx / tdist * speed,
                        vy: tdy / tdist * speed,
                        vz: tdz / tdist * speed,
                        ttl: tdist / speed + 0.5,
                        type: { damage: SHARD_PLASMA_DAMAGE, projColor: [1.0, 0.55, 0.85], aoe: 0, projSpeed: speed },
                    });
                    sh.lastFireT = t;
                    this._sfxAt("ogre_plasma_fire", sh.x, sh.y, sh.z);
                }
            }
        }
    }

    // -------------------------------------------------------------- heat shimmer (round 10)

    _spawnHeatShimmer(fwdX, fwdZ) {
        if (!this.particles?.spawn || !this.ogre) return;
        // Two exhaust positions behind the OGRE
        const sideX = -fwdZ, sideZ = fwdX;
        const halfW = 1.0 * (this.variant.scale / 4);
        for (const sign of [-1, +1]) {
            const px = this.ogre.position.x - fwdX * 2.2 + sideX * halfW * sign;
            const pz = this.ogre.position.z - fwdZ * 2.2 + sideZ * halfW * sign;
            const py = this.ogre.position.y + 1.2;
            for (let n = 0; n < 2; n++) {
                this.particles.spawn({
                    x: px + (Math.random() - 0.5) * 0.5,
                    y: py + (Math.random() - 0.5) * 0.5,
                    z: pz + (Math.random() - 0.5) * 0.5,
                    vx: -fwdX * 1.5 + (Math.random() - 0.5) * 0.6,
                    vy: 0.8 + Math.random() * 1.0,
                    vz: -fwdZ * 1.5 + (Math.random() - 0.5) * 0.6,
                    ttl: 0.5, size: 0.55,
                    r: 1.0, g: 0.5 + Math.random() * 0.3, b: 0.2, a: 0.5,
                });
            }
        }
    }

    // -------------------------------------------------------------- pause (round 10)

    togglePause() {
        if (this.state === "playing" || this.state === "intermission") {
            this.paused = !this.paused;
            return this.paused;
        }
        return false;
    }

    // -------------------------------------------------------------- track marks (round 11)

    _stampTrackMarks(fwdX, fwdZ) {
        if (!this.world?.setVoxel) return;
        if (!this.ogre) return;
        // Two tread positions perpendicular to movement
        const sideX = -fwdZ, sideZ = fwdX;
        const halfWidth = 1.5 * (this.variant.scale / 4);
        const ox = this.ogre.position.x;
        const oz = this.ogre.position.z;
        for (const sign of [-1, +1]) {
            const px = ox - fwdX * 0.6 + sideX * halfWidth * sign;
            const pz = oz - fwdZ * 0.6 + sideZ * halfWidth * sign;
            // Use existing surface-Y scan for the topmost solid voxel
            const xi = Math.floor(px), zi = Math.floor(pz);
            for (let y = 80; y > 0; y--) {
                const v = this.world.getVoxel?.(xi, y, zi);
                if (v != null && v !== 0 && v !== 10 && v !== 11) {
                    // Replace top surface voxel with ASH
                    if (v !== VOXEL_ASH) {
                        this.world.setVoxel(xi, y, zi, VOXEL_ASH);
                        // Also stamp adjacent cell along forward axis for thicker mark
                        const x2 = xi + (Math.abs(fwdX) > Math.abs(fwdZ) ? Math.sign(fwdX) : 0);
                        const z2 = zi + (Math.abs(fwdZ) > Math.abs(fwdX) ? Math.sign(fwdZ) : 0);
                        if (x2 !== xi || z2 !== zi) {
                            const v2 = this.world.getVoxel?.(x2, y, z2);
                            if (v2 != null && v2 !== 0 && v2 !== 10 && v2 !== 11 && v2 !== VOXEL_ASH) {
                                this.world.setVoxel(x2, y, z2, VOXEL_ASH);
                            }
                        }
                    }
                    break;
                }
            }
        }
    }

    // -------------------------------------------------------------- fire emitter (round 11)

    spawnFire(x, y, z, ttl = 4.0, size = 0.6) {
        return this._spawnFireAt(x, y, z, ttl, size);
    }

    _spawnFireAt(x, y, z, ttl, size = 0.6) {
        this.fires.push({ x, y, z, ttl, maxTtl: ttl, size, _lastT: 0 });
    }

    _spawnEngineFire(fwdX, fwdZ) {
        if (!this.ogre) return;
        // Continuously refresh a small fire at OGRE rear exhaust
        const sideX = -fwdZ, sideZ = fwdX;
        const halfW = 1.0 * (this.variant.scale / 4);
        for (const sign of [-1, +1]) {
            const px = this.ogre.position.x - fwdX * 2.0 + sideX * halfW * sign;
            const pz = this.ogre.position.z - fwdZ * 2.0 + sideZ * halfW * sign;
            const py = this.ogre.position.y + 1.0;
            // Just emit fire flames now (no array entry — instant)
            if (this.particles?.spawn && Math.random() < 0.6) {
                // Hot core
                this.particles.spawn({
                    x: px + (Math.random() - 0.5) * 0.4,
                    y: py + Math.random() * 0.5,
                    z: pz + (Math.random() - 0.5) * 0.4,
                    vy: 1.5 + Math.random() * 1.5,
                    ttl: 0.55, size: 0.55,
                    r: 1.0, g: 0.9, b: 0.4, a: 1.0,
                });
                // Outer flame
                this.particles.spawn({
                    x: px + (Math.random() - 0.5) * 0.6,
                    y: py + Math.random() * 0.4,
                    z: pz + (Math.random() - 0.5) * 0.6,
                    vy: 1.2 + Math.random() * 1.2,
                    ttl: 0.7, size: 0.65,
                    r: 1.0, g: 0.4, b: 0.1, a: 0.9,
                });
                // Smoke
                this.particles.spawn({
                    x: px + (Math.random() - 0.5) * 0.5,
                    y: py + 1.5 + Math.random() * 0.6,
                    z: pz + (Math.random() - 0.5) * 0.5,
                    vy: 0.5 + Math.random() * 0.5,
                    ttl: 1.0, size: 0.7,
                    r: 0.3, g: 0.3, b: 0.3, a: 0.6,
                });
            }
        }
    }

    _tickFires(dt, t) {
        if (!this.particles?.spawn) {
            // Just decay TTLs
            for (let i = this.fires.length - 1; i >= 0; i--) {
                this.fires[i].ttl -= dt;
                if (this.fires[i].ttl <= 0) this.fires.splice(i, 1);
            }
            return;
        }
        for (let i = this.fires.length - 1; i >= 0; i--) {
            const f = this.fires[i];
            f.ttl -= dt;
            if (f.ttl <= 0) {
                this.fires.splice(i, 1);
                continue;
            }
            // Fade emit rate as fire dies down
            const intensity = Math.min(1, f.ttl / f.maxTtl);
            if (t - f._lastT < FIRE_INTERVAL) continue;
            f._lastT = t;
            const count = Math.max(1, Math.floor(3 * intensity));
            for (let n = 0; n < count; n++) {
                // Hot inner core (yellow)
                this.particles.spawn({
                    x: f.x + (Math.random() - 0.5) * f.size * 0.6,
                    y: f.y + Math.random() * f.size * 0.6,
                    z: f.z + (Math.random() - 0.5) * f.size * 0.6,
                    vy: 1.5 + Math.random() * 1.5,
                    ttl: 0.55, size: f.size * 0.7,
                    r: 1.0, g: 0.9, b: 0.4, a: 1.0,
                });
                // Outer flame (orange)
                this.particles.spawn({
                    x: f.x + (Math.random() - 0.5) * f.size,
                    y: f.y + Math.random() * f.size * 0.4,
                    z: f.z + (Math.random() - 0.5) * f.size,
                    vy: 1.2 + Math.random() * 1.2,
                    ttl: 0.7, size: f.size * 0.85,
                    r: 1.0, g: 0.4 + Math.random() * 0.2, b: 0.1, a: 0.9,
                });
                // Rising smoke
                if (Math.random() < 0.5) {
                    this.particles.spawn({
                        x: f.x + (Math.random() - 0.5) * f.size,
                        y: f.y + f.size + Math.random() * 1.5,
                        z: f.z + (Math.random() - 0.5) * f.size,
                        vy: 0.6 + Math.random() * 0.7,
                        ttl: 1.4, size: f.size * 0.9,
                        r: 0.25, g: 0.25, b: 0.25, a: 0.7,
                    });
                }
            }
        }
    }

    // -------------------------------------------------------------- plasma field (round 11)

    spawnPlasmaField(x, y, z, ttl = 1.5, radius = 4) {
        this.plasmaFields.push({ x, y, z, ttl, maxTtl: ttl, radius, _lastT: 0 });
    }

    _tickPlasmaFields(dt, t) {
        if (!this.particles?.spawn) {
            for (let i = this.plasmaFields.length - 1; i >= 0; i--) {
                this.plasmaFields[i].ttl -= dt;
                if (this.plasmaFields[i].ttl <= 0) this.plasmaFields.splice(i, 1);
            }
            return;
        }
        for (let i = this.plasmaFields.length - 1; i >= 0; i--) {
            const f = this.plasmaFields[i];
            f.ttl -= dt;
            if (f.ttl <= 0) {
                this.plasmaFields.splice(i, 1);
                continue;
            }
            if (t - f._lastT < PLASMA_INTERVAL) continue;
            f._lastT = t;
            const intensity = Math.min(1, f.ttl / f.maxTtl);
            const count = Math.max(2, Math.floor(6 * intensity));
            for (let n = 0; n < count; n++) {
                const a = Math.random() * Math.PI * 2;
                const r = Math.random() * f.radius;
                this.particles.spawn({
                    x: f.x + Math.cos(a) * r,
                    y: f.y + Math.random() * 1.5,
                    z: f.z + Math.sin(a) * r,
                    vy: 0.5 + Math.random() * 0.8,
                    ttl: 0.5, size: 0.45,
                    r: 0.5 + Math.random() * 0.3, g: 0.7 + Math.random() * 0.3, b: 1.0, a: 0.85,
                });
                // Inner electric arc flicker
                if (Math.random() < 0.3) {
                    this.particles.spawn({
                        x: f.x + Math.cos(a) * r * 0.5,
                        y: f.y + Math.random() * 1.0,
                        z: f.z + Math.sin(a) * r * 0.5,
                        ttl: 0.15, size: 0.35,
                        r: 1.0, g: 1.0, b: 1.0, a: 1.0,
                    });
                }
            }
        }
    }

    stop() {
        const r = this.router;
        // Round 131 — multiplayer arc round 35. Emit ogre:stop to
        // clear the shared HP pool. Best-effort: if bridge isn't
        // wired or not connected, the no-op is fine (server will
        // detect disconnect eventually).
        if (this.bridge?.emit) {
            this.bridge.emit("ogre:stop", {});
        }
        // Round 110 — clear tumbling debris before everything else; some
        // pieces may share entity infrastructure with hardpoint kinds and
        // an explicit clear avoids dangling refs after stop.
        this._clearDebris();
        // Round 110 — clear pre-laid defenses (garages) before
        // dismantling the arena. They persist across waves but not
        // across stop()/start() cycles.
        this._despawnGarages();
        // Round 111 — clear defender planes + airport
        this._clearDefenderPlanes();
        this._despawnAirport();
        // Round 112 — clear naval assets
        this._clearDefenderSubs();
        this._despawnDock();
        // Round 113 — clear OGRE escort subs
        this._clearEscortSubs();
        // Round 114 — clear minefield
        this._despawnMinefield();
        // Round 120 — clear defender drones + depot
        this._clearDefenderDrones();
        this._despawnDepot();
        if (this.ogre && this.kaijuManager.kaiju.has(this.ogre.id)) this._cleanupOgre();
        if (r) {
            for (const d of this.defenders) {
                if (d.entityId != null) r.exec({ type: "entity:despawn", id: d.entityId });
                if (d.periscopeId != null) r.exec({ type: "entity:despawn", id: d.periscopeId });
                if (d.boatHullId != null) r.exec({ type: "entity:despawn", id: d.boatHullId });  // round 41
            }
            for (const s of this.slots) {
                if (s.entityId != null) r.exec({ type: "entity:despawn", id: s.entityId });
            }
            for (const m of this.minions) {
                if (m.entityId != null) r.exec({ type: "entity:despawn", id: m.entityId });
            }
            for (const drone of this.drones) {
                if (drone.entityId != null) r.exec({ type: "entity:despawn", id: drone.entityId });
            }
            for (const a of this.airdrops) {
                if (a.entityId != null) r.exec({ type: "entity:despawn", id: a.entityId });
            }
            for (const sh of this.shards) {
                if (sh.entityId != null) r.exec({ type: "entity:despawn", id: sh.entityId });
            }
            // Round 29 — cleanup ejected shells
            if (this.shells) {
                for (const s of this.shells) {
                    if (s.entityId != null) r.exec({ type: "entity:despawn", id: s.entityId });
                }
            }
            // Round 29 — cleanup napalm bits
            if (this.napalmBits) {
                for (const b of this.napalmBits) {
                    if (b.entityId != null) r.exec({ type: "entity:despawn", id: b.entityId });
                }
            }
            // Round 22 — cleanup defender corpses
            if (this.corpses) {
                for (const c of this.corpses) {
                    if (c.entityId != null) r.exec({ type: "entity:despawn", id: c.entityId });
                }
            }
            // Round 23 — cleanup OGRE wreckage hulks
            if (this.wrecks) {
                for (const w of this.wrecks) {
                    if (w.entityId != null) r.exec({ type: "entity:despawn", id: w.entityId });
                }
            }
            if (this.hqEntityId != null) r.exec({ type: "entity:despawn", id: this.hqEntityId });
            if (this.targetMarkerEntityId != null) r.exec({ type: "entity:despawn", id: this.targetMarkerEntityId });
        }
        this.defenders.length = 0;
        this.slots.length = 0;
        this.projectiles.length = 0;
        this.minions.length = 0;
        this.drones.length = 0;
        this.airdrops.length = 0;
        this.shards.length = 0;
        this.shells.length = 0;                              // round 29
        this.napalmBits.length = 0;                          // round 29
        // Round 34 — despawn any active sea mines + their alarm lights
        if (this.mines && this.router) {
            for (const m of this.mines) {
                if (m.entityId != null) this.router.exec({ type: "entity:despawn", id: m.entityId });
                if (m.lightEntityId != null) this.router.exec({ type: "entity:despawn", id: m.lightEntityId });
            }
        }
        if (this.mines) this.mines.length = 0;
        this.corpses = [];                                  // round 22
        this.wrecks  = [];                                  // round 23
        this.hqEntityId = null;
        this.targetMarkerEntityId = null;
        this.selectedDefender = null;
        this.pendingBuySlot = null;
        this.active = false;
        this.state  = "idle";
        this.ogre   = null;
        // Round 30 — exit POV mode if active (restores camera)
        if (this.povActive) this.povStop();
        // Round 27 — restore default sky/fog/gravity. Terrain repaint
        // is permanent (would need to reload world to undo).
        this._restoreEnvironment();
        // Round 43d — restore terrain that was overwritten when the
        // arena was painted.
        this.arena.unbuild();
    }

    // -------------------------------------------------------------- tick

    // v1484 — nanite swarm tick (host). Regenerate the pool, then act on the engineer's
    // mode: "repair" pours nanites into the most-damaged system (or a named target),
    // "shells"/"fuel" convert the pool into ammo reserves, "idle" just regenerates.
    _naniteTick(dt) {
        const nz = this.nanites; if (!nz) return;
        if (!(dt > 0)) dt = 0.016;
        nz.pool = Math.min(nz.max, nz.pool + nz.regen * dt);
        if (nz.mode === "repair") {
            let comp = null;
            if (nz.target && nz.target !== "auto") comp = this._naniteComponent(nz.target);
            if (!comp) comp = this._mostDamagedComponent();
            if (comp && comp.frac < 0.999) {
                const draw = Math.min(nz.pool, 14 * dt);   // nanites consumed
                if (draw > 0) { nz.pool -= draw; comp.add(draw * 1.6); }   // 1 nanite -> 1.6 hp
            }
        } else if (nz.mode === "shells") {
            const draw = Math.min(nz.pool, 12 * dt); if (draw > 0) { nz.pool -= draw; this.ammo.shells = Math.min(60, this.ammo.shells + draw * 0.5); }
        } else if (nz.mode === "fuel") {
            const draw = Math.min(nz.pool, 12 * dt); if (draw > 0) { nz.pool -= draw; this.ammo.fuel = Math.min(60, this.ammo.fuel + draw * 0.5); }
        } else if (nz.mode === "revive") {
            // v1489 — pour nanites into a destroyed hardpoint to bring it back online (a heavy
            // sink: lower yield than repair). Targets nz.target if it names a destroyed hardpoint,
            // else the first destroyed one. Comes online at 40% hp, then normal repair tops it off.
            let h = null;
            if (nz.target && nz.target !== "auto") { const c = this.hardpoints && this.hardpoints[nz.target]; if (c && c.destroyed) h = c; }
            if (!h) h = this._firstDestroyedHardpoint();
            if (h) {
                const draw = Math.min(nz.pool, 18 * dt);
                if (draw > 0) { nz.pool -= draw; h.hp = (h.hp || 0) + draw * 1.0; if (h.hp >= (h.maxHp || 1) * 0.4) this._reviveHardpoint(h); }
            }
        }
    }

    // Resolve a named nanite repair target ("sensors" | "chassis" | <hardpointKey>) to a
    // { frac, add(hp) } handle. Returns null if unknown or destroyed.
    _naniteComponent(name) {
        if (name === "sensors" && this.sensors) { const s = this.sensors; return { frac: s.maxHp > 0 ? s.hp / s.maxHp : 1, add: (h) => { s.hp = Math.min(s.maxHp, s.hp + h); } }; }
        if (name === "chassis") { const mx = this.ogreMaxHp || 1; return { frac: mx > 0 ? this.ogreHp / mx : 1, add: (h) => { this.ogreHp = Math.min(mx, this.ogreHp + h); } }; }
        const hp = this.hardpoints && this.hardpoints[name];
        if (hp && !hp.destroyed && typeof hp.hp === "number") { const mx = hp.maxHp || 1; return { frac: mx > 0 ? hp.hp / mx : 1, add: (h) => { hp.hp = Math.min(mx, hp.hp + h); } }; }
        return null;
    }

    // Most-damaged repairable component across sensors, chassis, and live hardpoints.
    _mostDamagedComponent() {
        let worst = null, worstFrac = 1;
        const consider = (c) => { if (c && c.frac < worstFrac) { worstFrac = c.frac; worst = c; } };
        consider(this._naniteComponent("sensors"));
        consider(this._naniteComponent("chassis"));
        for (const k of Object.keys(this.hardpoints || {})) consider(this._naniteComponent(k));
        return worst;
    }

    // v1489 — first destroyed hardpoint (for nanite "revive" mode).
    _firstDestroyedHardpoint() {
        for (const k of Object.keys(this.hardpoints || {})) { const h = this.hardpoints[k]; if (h && h.destroyed) return h; }
        return null;
    }

    // v1489 — bring a destroyed hardpoint back online: clear the destroyed state, drop the dent
    // decal spawned by _destroyHardpoint, and ensure it has some hp. Normal repair tops it off after.
    _reviveHardpoint(h) {
        if (!h) return;
        h.destroyed = false;
        h.destroyedT = null;
        if (h.dentEntityId != null && this.router) { try { this.router.exec({ type: "entity:despawn", id: h.dentEntityId }); } catch {} h.dentEntityId = null; }
        if (typeof h.hp !== "number" || h.hp <= 0) h.hp = (h.maxHp || 1) * 0.4;
        if (this.particles?.spawn) { for (let n = 0; n < 18; n++) { const a = Math.random() * Math.PI * 2, sp = 2 + Math.random() * 4; this.particles.spawn({ x: h.x, y: h.y, z: h.z, vx: Math.cos(a) * sp, vy: 1 + Math.random() * 3, vz: Math.sin(a) * sp, ttl: 0.6, size: 0.5, r: 0.5, g: 0.9, b: 1.0, a: 1.0, gravity: 6 }); } }
    }

    // v1481 — OGRE remote-commander relay tick (HOST side). Throttle-publishes the OGRE
    // state and pulls + applies commander orders. The steer order overrides the local
    // pathfinder (see the heading block in tick); fire orders are carried for phase-2.
    _cmdrTick() {
        const c = this._cmdr;
        if (!c || !c.active || c.role !== "host") return;
        const now = (typeof performance !== "undefined" ? performance.now() : Date.now());
        if (now - this._cmdrPubT < 350) return;   // ~3 Hz
        this._cmdrPubT = now;
        const bb = "";
        let cx = 0, cz = 0, n = 0; const dlist = [];
        const _sr = this._sensorRange(), _sr2 = _sr * _sr, _ox = this.ogre?.position?.x ?? 0, _oz = this.ogre?.position?.z ?? 0;
        try { for (const d of (this.defenders || [])) { if (!d || d.hp <= 0) continue; const x = (d.x ?? (d.position && d.position.x)), z = (d.z ?? (d.position && d.position.z)); if (typeof x !== "number" || typeof z !== "number") continue; if ((x - _ox) * (x - _ox) + (z - _oz) * (z - _oz) > _sr2) continue; /* beyond sensors — unseen by the crew */ cx += x; cz += z; n++; if (dlist.length < 24) dlist.push({ id: d.entityId ?? null, x: Math.round(x), z: Math.round(z), hp: d.hp, type: d.type || null }); } } catch {}
        let hpAlive = 0, hpTotal = 0;
        try { for (const k of Object.keys(this.hardpoints || {})) { hpTotal++; if (!this.hardpoints[k].destroyed) hpAlive++; } } catch {}
        const state = {
            ogre: { x: this.ogre?.position?.x ?? 0, z: this.ogre?.position?.z ?? 0, hp: this.ogreHp, maxHp: this.ogreMaxHp },
            hq: this.hqPos ? { x: this.hqPos.x, z: this.hqPos.z } : null,
            hardpoints: { alive: hpAlive, total: hpTotal },
            defenders: n,
            defendersCentroid: n > 0 ? { x: cx / n, z: cz / n } : null,
            defendersList: dlist,
            firing: this._cmdrFireId ?? null,
            sensors: this.sensors ? { hp: Math.round(this.sensors.hp), maxHp: this.sensors.maxHp, range: Math.round(this._sensorRange()) } : null,
            nanites: this.nanites ? { pool: Math.round(this.nanites.pool), max: this.nanites.max, mode: this.nanites.mode, target: this.nanites.target } : null,
            ammo: this.ammo ? { shells: Math.round(this.ammo.shells), fuel: Math.round(this.ammo.fuel) } : null,
            variant: (this.variant && (this.variant.id || this.variant.name)) || null,
            commanded: !!this._cmdrTarget,
            ts: Date.now(),
        };
        try { fetch(bb + "/mp/ogre/publish", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ room: c.room, token: c.token, state }) }).catch(() => {}); } catch {}
        try {
            fetch(bb + "/mp/ogre/commands?room=" + encodeURIComponent(c.room) + "&token=" + encodeURIComponent(c.token)).then(r => r.json()).then(j => {
                if (!j || !j.ok || !Array.isArray(j.orders)) return;
                for (const o of j.orders) {
                    if (!o) continue;
                    if (o.kind === "steer" && typeof o.x === "number" && typeof o.z === "number") this._cmdrTarget = { x: o.x, z: o.z };
                    else if (o.kind === "halt") this._cmdrTarget = { x: this.ogre?.position?.x ?? 0, z: this.ogre?.position?.z ?? 0 };
                    else if (o.kind === "release") this._cmdrTarget = null;
                    else if (o.kind === "fire") { if (o.slot) this._fireByHardpoint[o.slot] = o.targetId; else this._cmdrFireId = o.targetId; }
                    else if (o.kind === "repair") { this.nanites.mode = "repair"; this.nanites.target = o.system || "auto"; }
                    else if (o.kind === "repairStop") { this.nanites.mode = "idle"; }
                    else if (o.kind === "convert") { this.nanites.mode = (o.to === "fuel") ? "fuel" : "shells"; }
                    else if (o.kind === "nanite") { if (o.mode) this.nanites.mode = o.mode; if (o.target) this.nanites.target = o.target; }
                }
            }).catch(() => {});
        } catch {}
    }

    tick(dt, t) {
        if (!this.active) return;
        // Round 10 — pause early-returns
        if (this.paused) return;
        this._cmdrTick();   // v1481 — remote-commander relay (host publish + order apply)
        this._naniteTick(dt);   // v1484 — nanite engineering swarm (regen / repair / convert)

        // Round 110 — physics tick for tumbling debris (parts blown off
        // destroyed hardpoints). Runs regardless of OGRE state so
        // pieces in flight when the chassis dies still fall correctly.
        this._updateDebris(dt);

        // Round 111 — defender plane lifecycle (spawn from airport,
        // fly toward OGRE, strafe, expire). Ticks regardless of phase
        // so planes already in air finish their pass even during
        // intermission.
        this._tickDefenderPlanes(dt, t);
        // Round 112 — defender sub lifecycle (sea env only; internal
        // gate). Subs surface periodically to fire torpedoes.
        this._tickDefenderSubs(dt, t);
        // Round 113 — OGRE-side escort subs (mk10 sub-OGRE only; gates
        // internally on variant.special === "submarine" + sea env).
        this._tickEscortSubs(dt, t);
        // Round 114 — minefield proximity check. Reveals near mines,
        // triggers ones the OGRE drives over.
        this._updateMinefield(dt);
        // Round 120 — drone depot lifecycle: launch new drones at cadence,
        // tick all in-air drones (approach → orbit → fire → retreat).
        this._maybeLaunchDefenderDrone(t);
        this._tickDefenderDrones(dt, t);

        // Round 57 - idle camera return. If the user hasn't given input
        // in OGRE_IDLE_RETURN_SEC, slowly drift the camera to a
        // third-person view looking down at the OGRE along its
        // current direction of travel. Easing keeps the transition
        // gentle; any user input cancels and resets the timer.
        this._updateIdleCamera(dt);

        // Round 43n - passive income trickle. Defender economy gets a
        // small per-second drip so players can afford repairs/extra
        // turrets without waiting for the wave bonus. Tunable via
        // INCOME_PER_SEC. Only ticks while playing (not intermission).
        if (this.state === "playing") {
            this.energy += INCOME_PER_SEC * dt;
        }

        // Round 5 — intermission between waves. After OGRE death, brief
        // pause then spawn the next variant.
        // Round 43l - each round restarts on FRESH TERRAIN with a cycled
        // environment (earth → sea → moon → mars → earth …). Defender
        // entities persist; voxel structures rebuild atop the new terrain.
        if (this.state === "intermission") {
            if (t >= this.intermissionUntil) {
                this.energy += ENERGY_BONUS_PER_WAVE;
                this._cycleEnvForRound();
                this._spawnWave();
                this.state = "playing";
                this._sfx("ogre_wave_start", 1.0);
                console.log(`[OGRE] round ${this.wave}: ${this.variant.name} (env=${this._currentEnvName})`);
                // Round 42 — speech announcement
                const am42 = (typeof window !== "undefined") ? window.audioManager : null;
                am42?.announce?.(this.isBossWave
                    ? `Boss wave incoming. ${this.variant.name}`
                    : `Round ${this.wave}. ${this.variant.name}`);
            }
            return;
        }

        if (this.state !== "playing" || !this.ogre) return;

        // Round 43d — entry animation: lerp OGRE scale from 0 → full over
        // _entryDur while it physically advances. Skips once complete.
        if (this.ogre._entryT != null && this.ogre._entryT < (this.ogre._entryDur ?? 0)) {
            this.ogre._entryT += dt;
            const u = Math.min(1, this.ogre._entryT / this.ogre._entryDur);
            // Ease-out cubic so scale grows fast and settles
            const eased = easeOutCubic(u);
            const baseScale = this.variant?.scale ?? 4.0;
            const bossMul   = this.ogre._bossScaleMul ?? 1.0;
            const target    = baseScale * bossMul;
            const cur       = Math.max(0.001, eased * target);
            if (this.ogre._meshEntityId != null && this.router) {
                this.router.exec({
                    type: "entity:rescale",
                    id:    this.ogre._meshEntityId,
                    scale: cur,
                });
            }
            // Speed bonus during entry so it visually drives onto the field
            const entryStep = (this.variant?.speed ?? 6) * 1.3 * dt;
            const dx = this.arena.layout.hqPos.x - this.ogre.position.x;
            const dz = this.arena.layout.hqPos.z - this.ogre.position.z;
            const d  = Math.hypot(dx, dz) || 1;
            this.ogre.position.x += (dx / d) * entryStep;
            this.ogre.position.z += (dz / d) * entryStep;
            // Mark fully scaled when entry ends so the normal rescale gate
            // doesn't overwrite during this stretch.
            if (u >= 1) this.ogre._ogreRescaled = true;
        }

        // OGRE killed → start intermission, advance score
        if (this.ogreHp <= 0) {
            // Boss bonus
            const bonus = this.isBossWave ? BOSS_BONUS_SCORE : 0;
            this.score += 100 + this.defenders.filter(d => d.hp > 0).length * 10 + bonus;
            this._cleanupOgre();
            console.log(`[OGRE] wave ${this.wave} cleared — score: ${this.score}${this.isBossWave ? " (BOSS)" : ""}`);
            this._sfx("ogre_wave_clear", 1.0);
            // Round 42 — speech announcement
            const am42 = (typeof window !== "undefined") ? window.audioManager : null;
            am42?.announce?.(this.isBossWave
                ? `Boss defeated. Score ${this.score}`
                : `Wave ${this.wave} cleared. Score ${this.score}`);
            this.state = "intermission";
            this.intermissionUntil = t + INTERMISSION_TIME;
            for (const m of this.minions) {
                if (m.entityId != null && this.router) {
                    this.router.exec({ type: "entity:despawn", id: m.entityId });
                }
            }
            this.minions.length = 0;
            for (const d of this.drones) {
                if (d.entityId != null && this.router) {
                    this.router.exec({ type: "entity:despawn", id: d.entityId });
                }
            }
            this.drones.length = 0;
            // Round 10 — clear remaining shards
            for (const sh of this.shards) {
                if (sh.entityId != null && this.router) {
                    this.router.exec({ type: "entity:despawn", id: sh.entityId });
                }
            }
            this.shards.length = 0;
            return;
        }

        // HQ destroyed → game over
        if (this.hqHp <= 0) {
            this.state = "lost";
            this.endTime = performance.now() / 1000;
            console.log("[OGRE] HQ destroyed — final score:", this.score);
            this._saveHighScore();
            this._sfx("ogre_lose", 1.0);
            return;
        }

        // Phase transitions
        const prevPhase = this.phase;
        const hpFrac = this.ogreHp / this.ogreMaxHp;
        if (hpFrac <= OGRE_PHASE_3_HP_FRAC)      this.phase = 3;
        else if (hpFrac <= OGRE_PHASE_2_HP_FRAC) this.phase = 2;
        else                                      this.phase = 1;
        if (this.phase !== prevPhase) {
            console.log(`[OGRE] phase ${prevPhase} → ${this.phase}`);
            this._spawnPhaseBurst(this.phase);
            this._sfx("ogre_phase_transition", 0.8);
        }
        // Round 10 — Splitter at 50% HP spawns 2 shards (one-shot)
        if (this.variant.special === "splitter" && !this._didSplit
            && !this.specialDisabled
            && this.ogreHp / this.ogreMaxHp <= 0.5) {
            this._splitOgre();
            this._didSplit = true;
        }
        const phaseSpeedMul = this.phase === 3 ? 1.30 : this.phase === 2 ? 1.10 : 1.0;
        const phaseAttackMul = this.phase === 3 ? 0.55 : this.phase === 2 ? 0.85 : 1.0;
        const phaseAoeAdd = this.phase === 3 ? 1.5 : 0;
        // Round 8 — difficulty speed multiplier
        const diff = OGRE_DIFFICULTIES[this.difficulty] ?? OGRE_DIFFICULTIES.normal;

        // Round 8 — Phantom cloak cycle (only below 50% HP)
        if (!this.specialDisabled && this.variant.special === "phantom") {
            if (this.ogreHp / this.ogreMaxHp <= 0.5) {
                this._cloakTimer += dt;
                if (this.cloaked && this._cloakTimer >= PHANTOM_CLOAK_DURATION) {
                    this.cloaked = false;
                    this._cloakTimer = 0;
                    this._sfxAt("ogre_phase_transition", this.ogre.position.x, this.ogre.position.y, this.ogre.position.z);
                } else if (!this.cloaked && this._cloakTimer >= PHANTOM_VISIBLE_DURATION) {
                    this.cloaked = true;
                    this._cloakTimer = 0;
                    this._sfxAt("ogre_shield_break", this.ogre.position.x, this.ogre.position.y, this.ogre.position.z);
                }
            } else {
                this.cloaked = false;
                this._cloakTimer = 0;
            }
            // Visual: shimmer particles around OGRE while cloaked
            if (this.cloaked && this.particles?.spawn) {
                for (let n = 0; n < 3; n++) {
                    const a = Math.random() * Math.PI * 2;
                    const r2 = 1 + Math.random() * 2.5;
                    this.particles.spawn({
                        x: this.ogre.position.x + Math.cos(a) * r2,
                        y: this.ogre.position.y + 1 + Math.random() * 4,
                        z: this.ogre.position.z + Math.sin(a) * r2,
                        ttl: 0.4, size: 0.45,
                        r: 0.85, g: 0.55, b: 1.0, a: 0.4,
                    });
                }
            }
        }

        // Round 8 — Magnetic pulse cycle
        if (!this.specialDisabled && this.variant.special === "magnetic") {
            this._magneticTimer += dt;
            if (this.magneticActive && this._magneticTimer >= MAGNETIC_PULSE_DURATION) {
                this.magneticActive = false;
                this._magneticTimer = 0;
            } else if (!this.magneticActive && this._magneticTimer >= MAGNETIC_PULSE_INTERVAL) {
                this.magneticActive = true;
                this._magneticTimer = 0;
                this._sfxAt("ogre_phase_transition", this.ogre.position.x, this.ogre.position.y, this.ogre.position.z);
                // Round 11 — spawn plasma field around OGRE for the pulse duration
                this.spawnPlasmaField(this.ogre.position.x, this.ogre.position.y, this.ogre.position.z, MAGNETIC_PULSE_DURATION, 5);
                // Round 17 — coil sparks at the magnetic_coil rig position
                const coil = this.rig?.magnetic_coil;
                if (coil && this.particles?.spawn) {
                    const scaleMul = (this.variant?.scale ?? 4) / 4;
                    const cx = this.ogre.position.x + coil.def.offset.x * scaleMul;
                    const cy = this.ogre.position.y + coil.def.offset.y * scaleMul;
                    const cz = this.ogre.position.z + coil.def.offset.z * scaleMul;
                    for (let n = 0; n < 24; n++) {
                        const a = Math.random() * Math.PI * 2;
                        const speed = 3 + Math.random() * 5;
                        this.particles.spawn({
                            x: cx, y: cy, z: cz,
                            vx: Math.cos(a) * speed,
                            vy: 1 + Math.random() * 4,
                            vz: Math.sin(a) * speed,
                            ttl: 0.7, size: 0.45,
                            r: 0.85, g: 0.45, b: 1.0, a: 1.0,
                            gravity: 6,
                        });
                    }
                }
            }
            // Visual: blue ring while magnetic active
            if (this.magneticActive && this.particles?.spawn) {
                for (let n = 0; n < 5; n++) {
                    const a = Math.random() * Math.PI * 2;
                    const r2 = 4 * (this.variant.scale / 4);
                    this.particles.spawn({
                        x: this.ogre.position.x + Math.cos(a) * r2,
                        y: this.ogre.position.y + 2 + Math.random() * 2,
                        z: this.ogre.position.z + Math.sin(a) * r2,
                        ttl: 0.35, size: 0.5,
                        r: 0.4, g: 0.6, b: 1.0, a: 0.7,
                    });
                }
            }
        }

        // Walk toward HQ at variant + phase + difficulty modulated speed.
        // Round 206 — if a planned path exists, target the current
        // waypoint instead of HQ directly. Advance to the next waypoint
        // when within WAYPOINT_ADVANCE_R. Final waypoint is HQ, so
        // arrival behavior is unchanged.
        let targetX, targetZ;
        if (this.ogre._path && this.ogre._path.length > 0) {
            const WAYPOINT_ADVANCE_R = 6;    // ~one OGRE width
            const path = this.ogre._path;
            // Skip past waypoints we're already past
            while (this.ogre._pathIndex < path.length - 1) {
                const wp = path[this.ogre._pathIndex];
                const wpDx = wp.x - this.ogre.position.x;
                const wpDz = wp.z - this.ogre.position.z;
                if (Math.hypot(wpDx, wpDz) <= WAYPOINT_ADVANCE_R) {
                    this.ogre._pathIndex++;
                } else {
                    break;
                }
            }
            const wp = path[this.ogre._pathIndex];
            targetX = wp.x;
            targetZ = wp.z;
        } else {
            targetX = this.hqPos.x;
            targetZ = this.hqPos.z;
        }
        // v1481 — remote-commander override: while a commander (peer engine or human) is
        // connected, it steers the OGRE toward a chosen point, taking over from the local
        // pathfinder. Defenders stay fully local; only the OGRE heading is overridden.
        if (this._cmdr && this._cmdr.active && this._cmdr.role === "host" && this._cmdrTarget) {
            targetX = this._cmdrTarget.x; targetZ = this._cmdrTarget.z;
        }
        const dx = targetX - this.ogre.position.x;
        const dz = targetZ - this.ogre.position.z;
        const dist = Math.hypot(dx, dz);
        let ogreFwdX = dist > 0.001 ? dx / dist : 0;
        let ogreFwdZ = dist > 0.001 ? dz / dist : -1;
        // PATCH-B15 -- GPU Brain phase 11. When the round-206 planner
        // found NO path (the direct-to-HQ fallback above) and no remote
        // commander is steering, blend the brain's flow field 60/40 into
        // the heading. PATCH-B2k publishes the HQ as the field goal while
        // this scenario is active, so the "civ-directed" field IS the
        // HQ-directed field here -- the OGRE curves around hills exactly
        // where planSmoothed gave up. Commander orders and planned paths
        // are never touched; no brain -> byte-identical direct march.
        if ((!this.ogre._path || this.ogre._path.length === 0)
            && !(this._cmdr && this._cmdr.active && this._cmdr.role === "host" && this._cmdrTarget)
            && typeof window !== "undefined" && window.sampleBrainFlow) {
            const f = window.sampleBrainFlow(this.ogre.position.x, this.ogre.position.z);
            if (f) {
                const bx = 0.6 * f.x + 0.4 * ogreFwdX;
                const bz = 0.6 * f.z + 0.4 * ogreFwdZ;
                const n = Math.hypot(bx, bz);
                if (n > 1e-4) { ogreFwdX = bx / n; ogreFwdZ = bz / n; }
            }
        }
        // Round 106-108 — flying altitude.
        //   - Base flying offset = +8 (vs +2 for ground).
        //   - flying_demons: altitude tracks mobility. 4 demons alive →
        //     +8, 0 alive → +2 (grounded). OGRE gracefully descends as
        //     defenders kill the towing demons.
        //   - All flying variants: small sine bob (±0.4u, 0.5 Hz) for
        //     personality so they don't read as locked-rigid props.
        const isFlying = (this.variant?.special ?? "").startsWith("flying");
        let altitudeOffset = isFlying ? 8 : 2;
        if (this.variant?.special === "flying_demons") {
            altitudeOffset = 2 + 6 * (this._demonMobilityMul ?? 1.0);
        }
        if (isFlying) {
            altitudeOffset += Math.sin((this._airBobT ?? 0) * 0.5 * Math.PI * 2) * 0.4;
            this._airBobT = (this._airBobT ?? 0) + dt;
        }
        const newY = this._surfaceY(this.ogre.position.x, this.ogre.position.z) + altitudeOffset;
        const prevY = this.ogre.position.y;
        // Round 88 — stuck detection. If the OGRE can't reduce its
        // distance to HQ over several seconds (terrain too steep, ringed
        // by defenders forcing path-block, whatever), it detonates.
        // Detection: distance hasn't improved by >0.5u over STUCK seconds.
        // Round 206 — use distance-to-HQ (not distance-to-waypoint) for
        // stuck detection, since waypoint distance can spike up when a
        // waypoint is reached and we advance to the next farther one.
        const distToHQ = Math.hypot(
            this.hqPos.x - this.ogre.position.x,
            this.hqPos.z - this.ogre.position.z
        );
        const STUCK_THRESHOLD_SEC = 6.0;
        if (this._ogreStuckTimer != null) {
            const distImproved = (this._ogreLastDistToHQ - distToHQ) > 0.5;
            if (distImproved) {
                this._ogreStuckTimer = 0;
                this._ogreLastDistToHQ = distToHQ;
            } else {
                this._ogreStuckTimer += dt;
                // Only check after entry animation done; spawn-time motion
                // is gated by _entryT so distance won't improve yet.
                const entryDone = (this.ogre?._entryT ?? 1) >= (this.ogre?._entryDur ?? 1);
                if (entryDone && this._ogreStuckTimer >= STUCK_THRESHOLD_SEC) {
                    this._triggerOgreNuke();
                    return;
                }
            }
        }
        // Round 108 — recompute demon mobility multiplier each tick.
        // For flying_demons variant: speedMul = aliveDemons / totalDemons.
        // 4 alive → 1.0 (full speed); 2 alive → 0.5; 0 alive → 0 (OGRE
        // can't move forward, drifts then settles). Altitude descent
        // also tracks this (line ~4350 newY computation).
        this._demonMobilityMul = 1.0;
        if (this.variant?.special === "flying_demons") {
            let aliveDemons = 0, totalDemons = 0;
            for (const key of Object.keys(this.hardpoints)) {
                if (key.startsWith("demon_")) {
                    totalDemons++;
                    if (!this.hardpoints[key].destroyed) aliveDemons++;
                }
            }
            this._demonMobilityMul = totalDemons > 0 ? (aliveDemons / totalDemons) : 1.0;
        }
        // Round 31 — player-controlled OGRE: WASD drives chassis
        const playerDrivingOgreChassis = this.povActive && this.povInControl
            && this.povTargets[this.povTargetIndex]?.kind === "ogre";
        if (playerDrivingOgreChassis && this.camera?.keys) {
            const engineMul = this.engineDisabled ? 0.4 : 1.0;
            const playerSpeed = this.variant.speed * 1.5 * engineMul * this._demonMobilityMul;
            const turnRate = 1.2;          // rad/s
            // A/D turn chassis, W/S translate along chassis facing
            if (this.camera.keys.has("KeyA")) this._chassisYaw -= turnRate * dt;
            if (this.camera.keys.has("KeyD")) this._chassisYaw += turnRate * dt;
            const fy = this._chassisYaw;
            const fwx = Math.sin(fy), fwz = Math.cos(fy);
            let mx = 0, mz = 0;
            if (this.camera.keys.has("KeyW")) { mx += fwx; mz += fwz; }
            if (this.camera.keys.has("KeyS")) { mx -= fwx * 0.5; mz -= fwz * 0.5; }
            const len = Math.hypot(mx, mz);
            if (len > 0) {
                mx /= len; mz /= len;
                this.ogre.position.x += mx * playerSpeed * dt;
                this.ogre.position.z += mz * playerSpeed * dt;
                ogreFwdX = mx; ogreFwdZ = mz;
            }
            this.ogre.position.y = this._surfaceY(this.ogre.position.x, this.ogre.position.z) + 2;
        } else if (dist > 0.5) {
            const engineMul = this.engineDisabled ? 0.4 : 1.0;
            // Round 43h - global 0.5x slowdown for OGRE pacing
            const stepLen = this.variant.speed * phaseSpeedMul * diff.ogreSpeedMul * engineMul * 0.5 * this._demonMobilityMul * dt;
            this.ogre.position.x += ogreFwdX * stepLen;
            this.ogre.position.z += ogreFwdZ * stepLen;
            this.ogre.position.y = newY;
        }

        // Round 5 — tilt-by-slope on OGRE. Use real slope angle.
        // Round 90 — was using single-frame (newY - prevY) which jumped
        // by whole voxel units → chassis flickered "tilt back then
        // straight" instead of leaning into the hill. Now: sample terrain
        // ahead of OGRE for a stable slope, NEGATE so climbing tilts the
        // nose DOWN (leaning into the hill — what the user expects from a
        // tracked vehicle), and lerp toward target so transitions are
        // smooth across the climb.
        const lookAheadSamples = 4;       // 4 voxel units ahead
        const yAhead = this._surfaceY(
            this.ogre.position.x + ogreFwdX * lookAheadSamples,
            this.ogre.position.z + ogreFwdZ * lookAheadSamples) + 2;
        const horizSpeed = this.variant.speed * phaseSpeedMul * diff.ogreSpeedMul * 0.5 * this._demonMobilityMul;  // round 43h, round 108 demon-throttled
        const projectedRise = yAhead - newY;
        // Cap at ±0.5 rad so absurd cliffs don't slam the chassis
        let targetSlope = Math.atan2(projectedRise, lookAheadSamples);
        targetSlope = Math.max(-0.5, Math.min(0.5, targetSlope));
        // Negate: positive rise → negative tilt = nose-down = "climbing"
        targetSlope = -targetSlope;
        // Lerp the slope contribution over ~4× dt so the tilt eases in
        // and out of climbs instead of jumping
        if (this._slopeTilt == null) this._slopeTilt = 0;
        const slopeLerp = Math.min(1, dt * 4);
        this._slopeTilt += (targetSlope - this._slopeTilt) * slopeLerp;
        const slopeAngle = this._slopeTilt;
        // Round 36 — submarine cycle tick. Must precede chassis render so
        // the dipped Y propagates this frame. Adjusts ogre.position.y
        // directly (visual). Walk physics already finalized position.y
        // above; this is post-walk visual override.
        this._tickSubmarine(dt, t);
        if (this.variant?.special === "submarine" && this._currentEnv === "sea") {
            this.ogre.position.y -= (this._subDepth || 0);
        }
        // Round 22 — HP-based forward lean. Below 40% HP, OGRE pitches
        // forward as if struggling. Below 20% adds a wobble for "limping."
        const ogreHpFrac = (this.ogreMaxHp > 0) ? Math.max(0, this.ogreHp / this.ogreMaxHp) : 1;
        let lean = 0;
        if (ogreHpFrac < 0.4) {
            lean = (0.4 - ogreHpFrac) * 0.8;     // up to ~0.32 rad forward
            if (ogreHpFrac < 0.2) {
                lean += Math.sin(t * 6) * 0.05;   // limp wobble
            }
        }
        // Round 25 — hardpoint-specific damage tilt. Composes with slope
        // + low-HP lean. Reads as "this chassis is mechanically broken."
        let hpDmgTilt = 0;
        if (this.engineDisabled)  hpDmgTilt += 0.08;   // engine sag → forward pitch
        if (this.specialDisabled) hpDmgTilt -= 0.05;   // tech droop → slight rear pitch
        const tiltX = Math.max(-0.8, Math.min(0.8, slopeAngle + lean + hpDmgTilt));

        if (this.ogre._meshEntityId != null && this.router) {
            this.router.exec({
                type: "entity:move",
                id: this.ogre._meshEntityId,
                x: this.ogre.position.x,
                y: this.ogre.position.y,
                z: this.ogre.position.z,
                yaw: Math.atan2(ogreFwdX, ogreFwdZ),
                tiltX: tiltX,
            });
            this._scheduleOgreRescale();
            // Round 22 — chassis dimming. As HP drops, color brightness
            // tapers from 1.0 (full) to 0.45 (very dark) at 0 HP.
            // Round 23 — damage flash. When HP drops between frames, set
            // a brief flash window (60ms) where colorMul jumps to 1.6
            // (overbright white-flash). Provides per-hit visual feedback.
            const prevHp = this._lastOgreHp ?? this.ogreHp;
            if (this.ogreHp < prevHp - 0.5) {
                this._flashUntilT = t + 0.06;
            }
            this._lastOgreHp = this.ogreHp;
            const inFlash = (this._flashUntilT != null && t < this._flashUntilT);
            const dimMul = 0.45 + 0.55 * ogreHpFrac;
            const colorMul = inFlash ? 1.6 : dimMul;
            if (Math.abs((this._lastChassisColorMul ?? 1.0) - colorMul) > 0.02) {
                this.router.exec({
                    type: "entity:setColorMul",
                    id: this.ogre._meshEntityId,
                    mul: colorMul,
                });
                this._lastChassisColorMul = colorMul;
            }
            // Round 26 — phase-3 red glow tint. Below 25% HP, chassis
            // takes on an additive red hue ramping from 0 to 0.5 as HP
            // drops to 0. Combined with dim formula = "scorched red wreck."
            // Round 28 — phase-2 yellow warning tint between 25%-50% HP,
            // and pulsing red glow at very-low HP (<10%).
            let tintR = 0, tintG = 0;
            if (ogreHpFrac < 0.25) {
                // Phase 3: red ramp 0 → 0.5
                tintR = 0.5 * (1 - ogreHpFrac / 0.25);
                // Death-throes pulse below 10% HP — red intensity
                // oscillates around base level
                if (ogreHpFrac < 0.10) {
                    tintR *= 0.85 + 0.35 * Math.sin(t * 9);
                }
            } else if (ogreHpFrac < 0.50) {
                // Phase 2: yellow warning ramp 0 → 0.25
                const f = (0.50 - ogreHpFrac) / 0.25;
                tintR = 0.25 * f;
                tintG = 0.20 * f;
            }
            const tintKey = tintR.toFixed(2) + "_" + tintG.toFixed(2);
            if (this._lastChassisTintKey !== tintKey) {
                this.router.exec({
                    type: "entity:setColorTint",
                    id: this.ogre._meshEntityId,
                    tint: [tintR, tintG, 0],
                });
                this._lastChassisTintKey = tintKey;
                // Round 28 — cascade tint to all rig part entities so the
                // whole OGRE (turret, cannon, treads, antenna, etc.) takes
                // on the same hue, not just the chassis.
                if (this.rig) {
                    for (const k of Object.keys(this.rig)) {
                        const r = this.rig[k];
                        if (!r || r.entityId == null) continue;
                        this.router.exec({
                            type: "entity:setColorTint",
                            id: r.entityId,
                            tint: [tintR, tintG, 0],
                        });
                    }
                }
            }
        }
        // Round 9 — record OGRE position for hardpoint orientation
        this._prevOgrePos = { x: this.ogre.position.x - ogreFwdX * 0.1, y: prevY, z: this.ogre.position.z - ogreFwdZ * 0.1 };

        // Round 5 — dust track particles behind OGRE feet. Cadence
        // proportional to scale + speed.
        const trackInterval = 0.12;
        if (t - this._lastTrackT > trackInterval && dist > 0.5) {
            this._spawnDustTracks(ogreFwdX, ogreFwdZ);
            this._lastTrackT = t;
        }

        // Round 11 — permanent track marks. Accumulate travel distance
        // and stamp ASH voxels under the OGRE's tread positions every
        // TRACK_INTERVAL_DIST units of motion.
        if (dist > 0.5) {
            const stepLen = this.variant.speed * phaseSpeedMul * diff.ogreSpeedMul *
                            (this.engineDisabled ? 0.4 : 1.0) * this._demonMobilityMul * dt;
            this._trackTravelDist += stepLen;
            if (this._trackTravelDist >= TRACK_INTERVAL_DIST) {
                this._stampTrackMarks(ogreFwdX, ogreFwdZ);
                this._trackTravelDist = 0;
            }
        }

        if (dist < OGRE_REACHED_HQ_DIST) {
            this.hqHp = 0;
            this.state = "lost";
            this.endTime = performance.now() / 1000;
            console.log("[OGRE] OGRE BREACHED HQ");
            this._saveHighScore();
            this._sfx("ogre_lose", 1.0);
            return;
        }

        // Trample
        for (const d of this.defenders) {
            if (d.hp <= 0) continue;
            const tdx = d.x - this.ogre.position.x;
            const tdz = d.z - this.ogre.position.z;
            const tdist = Math.hypot(tdx, tdz);
            if (tdist < OGRE_TRAMPLE_RADIUS * (this.variant.scale / 4)) {
                this._sfxAt("ogre_trample", d.x, d.y, d.z);
                this._killDefender(d, "trampled");
            }
        }

        // OGRE attacks via variant.weapon. Difficulty scales damage.
        const w = this.variant.weapon;
        const wScaled = { ...w, damage: w.damage * diff.ogreDmgMul };
        const sensorMul = this.sensorDisabled ? 2.0 : 1.0;
        const interval = (w.interval / phaseAttackMul) * sensorMul;
        // Round 31 — suppress AI fire when player is controlling the OGRE
        const playerControlsOgre = this.povActive && this.povInControl
            && this.povTargets[this.povTargetIndex]?.kind === "ogre";
        // PATCH-B20 -- GPU Brain phase 17: weapon EMPHASIS for dual-armed
        // variants (mk12+: main + underside). When a policy brain serves
        // ogre_hull and its pick names the OTHER weapon, this one waits
        // 1.5x its interval -- de-emphasized, never disabled. Single-
        // weapon variants and brainless runs are byte-identical.
        let brainWeaponPick = null;
        if (this.variant?.undersideWeapon && this.ogre && typeof window !== "undefined" && window.getBrainAttack) {
            try { brainWeaponPick = window.getBrainAttack(this.ogre.id)?.name ?? null; } catch {}
        }
        const mainEmphMul = (brainWeaponPick === "underside") ? 1.5 : 1.0;
        if (!this.weaponDisabled && this.phase >= 2 && t - this._lastPlasmaT >= interval * mainEmphMul && !playerControlsOgre) {
            const target = this._nearestDefender(w.range, "main");
            if (target) {
                if (w.type === "plasma") {
                    this._launchOgreProjectile(target, wScaled, phaseAoeAdd);
                    // PATCH-B20 -- tag the newest ogre projectile for outcome
                    // resolution (hit at defender/plane contact, miss at expiry)
                    try {
                        const pr20 = this.projectiles[this.projectiles.length - 1];
                        if (pr20 && pr20.team === "ogre") { pr20._brainName = w.type; pr20._brainOgreId = this.ogre.id; }
                    } catch {}
                    this._sfxAt("ogre_plasma_fire", this.ogre.position.x, this.ogre.position.y, this.ogre.position.z);
                } else if (w.type === "laser") {
                    this._fireOgreLaser(target, wScaled);
                    // PATCH-B20 -- beams are hitscan: outcome at fire
                    try { window._gpuBrainOutcomes?.push({ id: this.ogre.id, name: "laser", hit: 1, civsHit: 0, kaijuHit: 0, src: "rotation" }); } catch {}
                    this._sfxAt("ogre_laser_fire", this.ogre.position.x, this.ogre.position.y, this.ogre.position.z);
                } else if (w.type === "artillery") {
                    this._launchOgreArtillery(target, wScaled, phaseAoeAdd);
                    this._sfxAt("ogre_artillery_fire", this.ogre.position.x, this.ogre.position.y, this.ogre.position.z);
                }
                // Round 16 — cannon recoil pulse on fire
                this.triggerCannonRecoil();
                this._lastPlasmaT = t;
                // v1489 — converted shells fund a BARRAGE: spend reserves to also strike the
                // next-nearest defenders this volley. The offensive payoff of the engineer's
                // repair-vs-rearm tradeoff (engineer converts the nanite pool -> shells).
                if (this.ammo && this.ammo.shells >= 6) {
                    const SHELL_COST = 6, ox = this.ogre.position.x, oz = this.ogre.position.z, R2 = w.range * w.range;
                    const cands = [];
                    for (const d of this.defenders) { if (!d || d.hp <= 0 || d === target) continue; const dx = d.x - ox, dz = d.z - oz, dd = dx * dx + dz * dz; if (dd <= R2) cands.push([dd, d]); }
                    cands.sort((a, b) => a[0] - b[0]);
                    const extras = Math.min(2, cands.length, Math.floor(this.ammo.shells / SHELL_COST));
                    for (let k = 0; k < extras; k++) {
                        this.ammo.shells -= SHELL_COST; const t2 = cands[k][1];
                        if (w.type === "plasma") this._launchOgreProjectile(t2, wScaled, phaseAoeAdd);
                        else if (w.type === "laser") this._fireOgreLaser(t2, wScaled);
                        else if (w.type === "artillery") this._launchOgreArtillery(t2, wScaled, phaseAoeAdd);
                    }
                    if (extras > 0) this._lastBarrageT = t;
                }
            }
        }

        // Round 107 — underside weapon fire. Belly-mounted turret on
        // variants that have an undersideWeapon config (mk12/13/14
        // sub-OGREs). Gates:
        //   1) variant config present
        //   2) underside_weapon hardpoint exists and not destroyed
        //   3) interval cooldown elapsed
        //   4) phase >= 2 (matches main weapon)
        //   5) at least one defender is "under" the OGRE — within
        //      horizontal range AND below OGRE Y. For flying variants
        //      this is the case where a defender drove underneath.
        //
        // Damage is hit-scan (instant) since modeling a downward bolt
        // projectile would clip into terrain immediately given the
        // tight close-range geometry. Adds a small puff effect at the
        // hit point.
        const usw = this.variant?.undersideWeapon;
        const undersideHp = this.hardpoints?.underside_weapon;
        // v1489 — converted fuel feeds a sustained belly-turret burn: faster cadence + hotter hits
        // while reserves last (engineer converts the nanite pool -> fuel).
        const uswFueled = !!(this.ammo && this.ammo.fuel > 0);
        // PATCH-B20 -- de-emphasis mirror: when the brain prefers the MAIN
        // gun, the belly turret waits 1.5x its interval.
        const uswEmphMul = (typeof brainWeaponPick !== "undefined" && brainWeaponPick && brainWeaponPick !== "underside") ? 1.5 : 1.0;
        const uswInterval = usw ? usw.interval * (uswFueled ? 0.5 : 1) * uswEmphMul : Infinity;
        if (usw && undersideHp && !undersideHp.destroyed
            && this.phase >= 2 && t - this._lastUndersideT >= uswInterval
            && !playerControlsOgre) {
            const target = this._nearestDefenderUnder(usw.range);
            if (target) {
                const dmg = (usw.damage ?? 5) * diff.ogreDmgMul * (uswFueled ? 1.5 : 1);
                if (uswFueled) this.ammo.fuel = Math.max(0, this.ammo.fuel - 2);
                target.hp = (target.hp ?? 0) - dmg;
                if (target.hp <= 0 && typeof this._killDefender === "function") {
                    this._killDefender(target, "underside_weapon");
                }
                this._sfxAt("ogre_plasma_fire", undersideHp.x, undersideHp.y, undersideHp.z);
                // Round 108 — muzzle flash at the underside hardpoint
                // itself. Bright hot-orange particle burst that fades
                // quickly. Sells the belly turret as firing (the strike
                // particle below shows where the bolt hit; this shows
                // where it came FROM).
                if (this.particles?.spawn) {
                    // Cluster of 5 particles in a small cone below the
                    // hardpoint, simulating muzzle flare + smoke trail.
                    for (let i = 0; i < 5; i++) {
                        const a = Math.random() * Math.PI * 2;
                        const r = Math.random() * 0.3;
                        this.particles.spawn({
                            x: undersideHp.x + Math.cos(a) * r,
                            y: undersideHp.y - 0.4 - Math.random() * 0.3,
                            z: undersideHp.z + Math.sin(a) * r,
                            vx: Math.cos(a) * 0.5,
                            vy: -1.5 - Math.random() * 1.0,
                            vz: Math.sin(a) * 0.5,
                            ttl: 0.18 + Math.random() * 0.1,
                            size: 0.4 + Math.random() * 0.2,
                            r: 1.0, g: 0.7, b: 0.25, a: 1.0,
                            gravity: 0,
                        });
                    }
                }
                // Small visible puff at the strike point so the player
                // sees the belly turret actually doing something
                if (this.particles?.spawn) {
                    this.particles.spawn({
                        x: target.x, y: target.y + 1, z: target.z,
                        vx: 0, vy: 0.4, vz: 0,
                        life: 0.25, size: 0.6,
                        color: [1.0, 0.55, 0.2, 1.0],
                    });
                }
                this._lastUndersideT = t;
                // PATCH-B20 -- underside is hitscan: outcome at damage
                try { window._gpuBrainOutcomes?.push({ id: this.ogre?.id, name: "underside", hit: 1, civsHit: 0, kaijuHit: 0, src: "rotation" }); } catch {}
            }
        }

        // Carrier spawns minions
        if (!this.specialDisabled && this.variant.special === "carrier") {
            const spawnInt = this.variant.spawnInterval / (this.phase === 3 ? 0.6 : 1);
            if (t - this._lastSpawnT >= spawnInt) {
                this._spawnMinion();
                this._sfxAt("ogre_minion_spawn", this.ogre.position.x, this.ogre.position.y, this.ogre.position.z);
                this._lastSpawnT = t;
            }
        }

        // Round 7 — Drone Bay spawns flying drones
        if (!this.specialDisabled && this.variant.special === "drones") {
            const spawnInt = this.variant.spawnInterval / (this.phase === 3 ? 0.6 : 1);
            if (t - this._lastSpawnT >= spawnInt) {
                this._spawnDrone();
                this._sfxAt("ogre_minion_spawn", this.ogre.position.x, this.ogre.position.y, this.ogre.position.z);
                this._lastSpawnT = t;
            }
        }

        // Round 7 — Spotlights (MK III) — twin forward beams of dust
        if (this.variant.special === "spotlights" && this.particles?.spawn) {
            const beamSweep = Math.sin(t * 0.8) * 0.35;     // small yaw oscillation
            for (const angleOff of [-0.25 + beamSweep, 0.25 + beamSweep]) {
                const beamYaw = Math.atan2(ogreFwdX, ogreFwdZ) + angleOff;
                const bx = Math.sin(beamYaw), bz = Math.cos(beamYaw);
                for (let s = 0; s < 4; s++) {
                    const dist = 3 + s * 4 + Math.random() * 2;
                    const spread = 0.3 + s * 0.25;
                    this.particles.spawn({
                        x: this.ogre.position.x + bx * dist + (Math.random() - 0.5) * spread,
                        y: this.ogre.position.y + 2.5 + (Math.random() - 0.3) * 1.2,
                        z: this.ogre.position.z + bz * dist + (Math.random() - 0.5) * spread,
                        ttl: 0.4, size: 0.55,
                        r: 1.0, g: 0.95, b: 0.7, a: 0.45,
                    });
                }
            }
        }

        // Round 7 — Scanner (MK II) — sweeping forward arc
        if (this.variant.special === "scanners" && this.particles?.spawn) {
            this._scannerSweep += dt * 1.4;        // rad/s sweep
            const sweepAngle = Math.sin(this._scannerSweep) * 0.7;
            const beamYaw = Math.atan2(ogreFwdX, ogreFwdZ) + sweepAngle;
            const bx = Math.sin(beamYaw), bz = Math.cos(beamYaw);
            for (let s = 0; s < 6; s++) {
                const dist = 2 + s * 5;
                this.particles.spawn({
                    x: this.ogre.position.x + bx * dist,
                    y: this.ogre.position.y + 3 + (Math.random() - 0.5) * 0.4,
                    z: this.ogre.position.z + bz * dist,
                    ttl: 0.3, size: 0.4,
                    r: 0.4, g: 0.95, b: 1.0, a: 0.6,
                });
            }
        }

        // Round 7 — Aegis shield shimmer while up
        if (this.variant.special === "aegis" && this.shieldHp > 0 && this.particles?.spawn) {
            // Hex-pattern ring around OGRE
            if (Math.random() < 0.6) {
                const a = Math.random() * Math.PI * 2;
                const r = 3.5 * (this.variant.scale / 4);
                this.particles.spawn({
                    x: this.ogre.position.x + Math.cos(a) * r,
                    y: this.ogre.position.y + 1 + Math.random() * 3,
                    z: this.ogre.position.z + Math.sin(a) * r,
                    ttl: 0.5, size: 0.4,
                    r: 0.55, g: 0.85, b: 1.0, a: 0.55,
                });
            }
        }

        // Tick minions
        this._tickMinions(dt, t);
        // Round 24 — wreck progressive smoke decay. Each wreck emits
        // smoke for ~20s after death, intensity decaying linearly. After
        // 20s the wreck goes quiet, persisting silently until match end.
        if (this.wrecks?.length > 0 && this.particles?.spawn) {
            for (const w of this.wrecks) {
                const age = t - (w.spawnT ?? t);
                if (age >= 20) continue;
                const intensity = 1 - age / 20;
                if (Math.random() < 0.4 * intensity) {
                    this.particles.spawn({
                        x: w.x + (Math.random() - 0.5) * 1.5,
                        y: w.y + 0.5 + Math.random() * 1.0,
                        z: w.z + (Math.random() - 0.5) * 1.5,
                        vy: 0.7 + Math.random() * 0.6,
                        vx: (Math.random() - 0.5) * 0.3,
                        vz: (Math.random() - 0.5) * 0.3,
                        ttl: 1.8, size: 0.8,
                        r: 0.18, g: 0.18, b: 0.20, a: 0.55 * intensity,
                        gravity: -1,
                    });
                    // Occasional ember in first 8s
                    if (age < 8 && Math.random() < 0.1) {
                        this.particles.spawn({
                            x: w.x + (Math.random() - 0.5) * 0.8,
                            y: w.y + 0.4,
                            z: w.z + (Math.random() - 0.5) * 0.8,
                            vy: 1 + Math.random() * 1.5,
                            ttl: 0.5, size: 0.3,
                            r: 1.0, g: 0.55, b: 0.15, a: 1.0,
                        });
                    }
                }
            }
        }
        // Round 7 — tick drones
        this._tickDrones(dt, t);
        // Round 9 — move hard points + tick air drops
        this._moveHardpoints();
        // Round 16 — animate rig parts (turret swing, cannon recoil, treads)
        this._moveRig(dt);
        this._tickAirdrops(dt, t);
        // Round 10 — tick shards + emit heat shimmer behind OGRE
        this._tickShards(dt, t);
        this._tickShells(dt, t);    // round 29 — ejected cannon shells
        this._tickNapalmBits(dt, t); // round 29 — sticky napalm fire
        this._tickMines(dt, t);      // round 34 — sea mines
        // Round 35 — OGRE point-defense + counter-drone proactive defense
        this._tickPointDefense(dt, t);
        this._maybeLaunchCounterDrone(t);
        this._tickCounterDrones(dt);
        // Round 36 — OGRE-side anti-personnel + submarine systems
        this._maybeDropApMine(t);
        this._tickApMines(dt, t);
        this._maybeGasBlast(t);
        this._tickGasClouds(dt);
        // _tickSubmarine moved to top of tick (before chassis render)
        // Round 37 — flood damage from sub breaches + cascading internal explosions
        this._tickFloodDamage(dt, t);
        this._tickInternalCascade(dt, t);
        // Round 38 — civ boats: visual hull entity under each civ in sea env
        this._tickCivBoats(dt, t);
        // Round 38 — aircraft carrier launches planes; planes tick + attack
        this._tickPlanes(dt, t);
        // Round 38 — 3D Earth billboard in moon sky
        this._tickEarthBillboard();
        // Round 40 — pilot eject cinematic (active after OGRE dies)
        this._tickPilots(dt);
        this._tickEnvAmbience(dt, t); // round 31 — Mars dust storms etc.
        this._povTick();             // round 30 — POV camera lock
        if (t - this._lastShimmerT > SHIMMER_INTERVAL) {
            this._spawnHeatShimmer(ogreFwdX, ogreFwdZ);
            this._lastShimmerT = t;
        }
        // Round 11 — tick fires + plasma fields
        this._tickFires(dt, t);
        this._tickPlasmaFields(dt, t);
        // If engine destroyed, OGRE bleeds fire from exhaust positions
        if (this.engineDisabled) this._spawnEngineFire(ogreFwdX, ogreFwdZ);

        // Defender per-tick: move-toward + auto-fire
        for (const d of this.defenders) {
            if (d.hp <= 0) continue;
            const tt = TURRET_TYPES[d.type] ?? TURRET_TYPES.machinegun;

            // Round 9 — compute aim target yaw (lerps each frame)
            // Round 31 — skip AI aim entirely when player controls this defender
            const playerControlsThis = this.povActive && this.povInControl
                && this.povTargets[this.povTargetIndex]?._ref === d;
            const enemy = this._defenderTarget(d, tt.range);
            let aimTargetYaw = d.aimYaw;
            if (enemy) {
                const tx = enemy.x - d.x, tz = enemy.z - d.z;
                aimTargetYaw = Math.atan2(tx, tz);
                d._lastFireYaw = aimTargetYaw;
            } else if (d.targetPos) {
                const tx = d.targetPos.x - d.x, tz = d.targetPos.z - d.z;
                aimTargetYaw = Math.atan2(tx, tz);
            } else {
                aimTargetYaw = d._lastFireYaw;
            }
            if (!playerControlsThis) {
                const lerpAmt = 1 - Math.exp(-12 * dt);
                let delta = aimTargetYaw - d.aimYaw;
                while (delta >  Math.PI) delta -= 2 * Math.PI;
                while (delta < -Math.PI) delta += 2 * Math.PI;
                d.aimYaw += delta * lerpAmt;
            }

            if (d.targetPos) {
                const tdx = d.targetPos.x - d.x;
                const tdz = d.targetPos.z - d.z;
                const tDist = Math.hypot(tdx, tdz);
                if (tDist < 0.3) d.targetPos = null;
                else {
                    const step = Math.min(tDist, DEFENDER_SPEED * dt);
                    const mdx = (tdx / tDist) * step;
                    const mdz = (tdz / tDist) * step;
                    d.x += mdx;
                    d.z += mdz;
                    d.y = this._surfaceY(d.x, d.z);
                    // Round 34 — boat wake when moving in sea env. White-
                    // blue bubble stream behind the boat (opposite of motion).
                    if (this._currentEnv === "sea" && this.particles?.spawn) {
                        const speed = step / Math.max(dt, 0.001);
                        if (speed > 0.5 && Math.random() < 0.7) {
                            const nx = -mdx / step, nz = -mdz / step;        // unit reverse
                            const spread = 0.6;
                            this.particles.spawn({
                                x: d.x + nx * 0.8 + (Math.random() - 0.5) * spread,
                                y: d.y + 1.4 + (Math.random() - 0.5) * 0.1,
                                z: d.z + nz * 0.8 + (Math.random() - 0.5) * spread,
                                vx: nx * 1.0 + (Math.random() - 0.5) * 0.4,
                                vy: 0.1 + Math.random() * 0.3,
                                vz: nz * 1.0 + (Math.random() - 0.5) * 0.4,
                                ttl: 0.9 + Math.random() * 0.4,
                                size: 0.4 + Math.random() * 0.3,
                                r: 0.9, g: 0.95, b: 1.0, a: 0.55,
                            });
                        }
                    }
                }
            }
            // Always update entity position + aim yaw (whether moving or not)
            if (d.entityId != null && this.router) {
                this.router.exec({
                    type: "entity:move",
                    id: d.entityId,
                    x: d.x, y: d.y + 1, z: d.z,
                    yaw: d.aimYaw,
                    tiltX: 0,
                });
            }

            if (!enemy) continue;
            if (t - d.lastFireT < tt.fireInterval) continue;
            // Round 31 — suppress AI fire when player controls this defender
            if (this.povActive && this.povInControl
                && this.povTargets[this.povTargetIndex]?._ref === d) continue;

            this._launchProjectile(d, enemy, tt);
            const fireKey = d.type === "missile" ? "ogre_missile_fire"
                        : d.type === "railgun" ? "ogre_railgun_fire"
                        : "ogre_mg_fire";
            this._sfxAt(fireKey, d.x, d.y, d.z);
            d.lastFireT = t;
            d.shotsFired++;
        }

        // Round 49 — decay recoil offsets toward 0 after defender fire loop
        this._tickRecoil(dt);

        this._tickProjectiles(dt, ogreFwdX, ogreFwdZ);

        // Update target marker position
        const sel = this.selectedDefender;
        if (this.targetMarkerEntityId != null && this.router) {
            if (sel && sel.targetPos && sel.hp > 0) {
                this.router.exec({
                    type: "entity:move",
                    id: this.targetMarkerEntityId,
                    x: sel.targetPos.x, y: this._surfaceY(sel.targetPos.x, sel.targetPos.z) + 1.5, z: sel.targetPos.z,
                });
            } else {
                this.router.exec({
                    type: "entity:move",
                    id: this.targetMarkerEntityId,
                    x: 0, y: -100, z: 0,
                });
            }
        }
        if (sel && sel.hp <= 0) this._clearSelection();
    }

    // -------------------------------------------------------------- targeting

    _defenderTarget(d, range) {
        // Prefer minions/drones if any are in range; otherwise OGRE.
        let nearest = null, nd2 = range * range;
        for (const m of this.minions) {
            if (m.hp <= 0) continue;
            const dx = m.x - d.x, dz = m.z - d.z;
            const d2 = dx * dx + dz * dz;
            if (d2 < nd2) { nd2 = d2; nearest = { x: m.x, y: m.y + 0.5, z: m.z, isMinion: true, ref: m }; }
        }
        // Round 7 — drones are also valid targets
        for (const drone of this.drones) {
            if (drone.hp <= 0) continue;
            const dx = drone.x - d.x, dz = drone.z - d.z, dy = drone.y - (d.y + 1.5);
            const d2 = dx * dx + dz * dz + dy * dy;
            if (d2 < nd2) { nd2 = d2; nearest = { x: drone.x, y: drone.y, z: drone.z, isDrone: true, ref: drone }; }
        }
        // Round 10 — shards are valid targets
        for (const sh of this.shards) {
            if (sh.hp <= 0) continue;
            const dx = sh.x - d.x, dz = sh.z - d.z;
            const d2 = dx * dx + dz * dz;
            if (d2 < nd2) { nd2 = d2; nearest = { x: sh.x, y: sh.y + 1, z: sh.z, isShard: true, ref: sh }; }
        }
        if (nearest) return nearest;
        if (this.ogre) {
            const dx = this.ogre.position.x - d.x;
            const dz = this.ogre.position.z - d.z;
            if (dx * dx + dz * dz < range * range) {
                return { x: this.ogre.position.x, y: this.ogre.position.y, z: this.ogre.position.z, isMinion: false };
            }
        }
        return null;
    }

    // -------------------------------------------------------------- OGRE attacks

    _launchOgreProjectile(targetDef, w, aoeBonus = 0) {
        const fromX = this.ogre.position.x;
        const fromY = this.ogre.position.y + 2.5;
        const fromZ = this.ogre.position.z;
        const dx = targetDef.x - fromX;
        const dy = (targetDef.y + 1) - fromY;
        const dz = targetDef.z - fromZ;
        const dist = Math.hypot(dx, dy, dz) || 1;
        this.projectiles.push({
            team: "ogre",
            x: fromX, y: fromY, z: fromZ,
            vx: dx / dist * w.projSpeed,
            vy: dy / dist * w.projSpeed,
            vz: dz / dist * w.projSpeed,
            ttl: dist / w.projSpeed + 0.5,
            type: { damage: w.damage, projColor: w.color, aoe: w.aoe + aoeBonus, projSpeed: w.projSpeed },
        });
    }

    _fireOgreLaser(targetDef, w) {
        // Instant beam — particles trace a line, damage applies immediately.
        const fromX = this.ogre.position.x;
        const fromY = this.ogre.position.y + 2.5;
        const fromZ = this.ogre.position.z;
        const dx = targetDef.x - fromX;
        const dy = (targetDef.y + 1) - fromY;
        const dz = targetDef.z - fromZ;
        const len = Math.hypot(dx, dy, dz);
        const STEPS = 12;
        if (this.particles?.spawn) {
            for (let i = 0; i < STEPS; i++) {
                const f = i / STEPS;
                this.particles.spawn({
                    x: fromX + dx * f,
                    y: fromY + dy * f,
                    z: fromZ + dz * f,
                    ttl: 0.25, size: 0.4,
                    r: w.color[0], g: w.color[1], b: w.color[2], a: 1.0,
                });
            }
        }
        targetDef.hp -= w.damage;
        if (targetDef.hp <= 0) this._killDefender(targetDef, "laser");
    }

    _launchOgreArtillery(targetDef, w, aoeBonus = 0) {
        // Lobbed shell — high arc. Use ballistic physics (gravity).
        const fromX = this.ogre.position.x;
        const fromY = this.ogre.position.y + 2.5;
        const fromZ = this.ogre.position.z;
        const dx = targetDef.x - fromX;
        const dy = (targetDef.y + 1) - fromY;
        const dz = targetDef.z - fromZ;
        const horiz = Math.hypot(dx, dz);
        const flightTime = Math.max(1.0, horiz / w.projSpeed);
        const g = 18;
        const vx = dx / flightTime;
        const vz = dz / flightTime;
        const vy = (dy + 0.5 * g * flightTime * flightTime) / flightTime;
        this.projectiles.push({
            team: "ogre",
            x: fromX, y: fromY, z: fromZ,
            vx, vy, vz,
            ballistic: true,
            ttl: flightTime + 0.5,
            type: { damage: w.damage, projColor: w.color, aoe: w.aoe + aoeBonus, projSpeed: w.projSpeed },
        });
    }

    // -------------------------------------------------------------- minions

    _spawnMinion() {
        const r = this.router;
        const ox = this.ogre.position.x + (Math.random() * 4 - 2);
        const oz = this.ogre.position.z + (Math.random() * 2 + 2);
        const oy = this._surfaceY(ox, oz);
        // Round 17 — open carrier hatches on minion deploy
        this.triggerHatchOpen("carrier_hatch_L");
        this.triggerHatchOpen("carrier_hatch_R");
        // Round 24 — minion deploys from hatch height. Spawns at hatch
        // level (~4u above ground) and descends to surface over 0.6s,
        // visibly riding the open hatch.
        const hatchSpawnY = oy + 4.0;
        const m = {
            x: ox, y: hatchSpawnY, z: oz,
            hp: MINION_HP, maxHp: MINION_HP,
            entityId: null,
            deploying: true,
            deployT: 0,
            deployFromY: hatchSpawnY,
            deployToY: oy,
        };
        if (r) {
            const result = r.exec({
                type: "entity:spawnMesh",
                assetId: "ogre_minion",
                kind: "ogre_minion",
                x: ox, y: hatchSpawnY + 0.5, z: oz,
                scale: 0.9,
            });
            m.entityId = result?.id ?? null;
        }
        this.minions.push(m);
    }

    _tickMinions(dt, t) {
        for (let i = this.minions.length - 1; i >= 0; i--) {
            const m = this.minions[i];
            if (m.hp <= 0) {
                if (m.entityId != null && this.router) {
                    this.router.exec({ type: "entity:despawn", id: m.entityId });
                }
                this.minions.splice(i, 1);
                continue;
            }
            // Round 24 — hatch-deploy descent. Minion drops from hatch
            // height to ground over 0.6s with easeOutQuad falloff, then
            // walking AI takes over. Cosmetic — the minion rides the
            // open hatches as the OGRE turret cracks them.
            if (m.deploying) {
                m.deployT += dt;
                const p = Math.min(1, m.deployT / 0.6);
                const eased = easeOutQuad(p);
                m.y = m.deployFromY + (m.deployToY - m.deployFromY) * eased;
                if (p >= 1) m.deploying = false;
                if (m.entityId != null && this.router) {
                    this.router.exec({
                        type: "entity:move",
                        id: m.entityId,
                        x: m.x, y: m.y + 0.5, z: m.z,
                        yaw: 0, tiltX: 0,
                    });
                }
                continue;
            }
            // Walk toward HQ
            const dx = this.hqPos.x - m.x;
            const dz = this.hqPos.z - m.z;
            const dist = Math.hypot(dx, dz);
            if (dist < 1.0) {
                // Reached HQ — damage it
                this.hqHp -= MINION_DAMAGE_TO_HQ;
                this._sfx("ogre_hq_damaged", 1.0);
                if (m.entityId != null && this.router) {
                    this.router.exec({ type: "entity:despawn", id: m.entityId });
                }
                this.minions.splice(i, 1);
                continue;
            }
            const step = MINION_SPEED * dt;
            m.x += (dx / dist) * step;
            m.z += (dz / dist) * step;
            m.y = this._surfaceY(m.x, m.z);
            if (m.entityId != null && this.router) {
                this.router.exec({
                    type: "entity:move",
                    id: m.entityId,
                    x: m.x, y: m.y + 0.5, z: m.z,
                    yaw: Math.atan2(dx / dist, dz / dist),
                    tiltX: 0,
                });
            }
        }
    }

    // -------------------------------------------------------------- drones (round 7)

    _spawnDrone() {
        const r = this.router;
        const ox = this.ogre.position.x + (Math.random() * 6 - 3);
        const oz = this.ogre.position.z + (Math.random() * 4 + 2);
        const oy = this.ogre.position.y + DRONE_ALTITUDE;
        // Round 17 — open drone bay door on launch
        this.triggerHatchOpen("drone_bay_door");
        // Round 25 — drone deploys from bay height (low, just above
        // chassis), rises to combat altitude over 0.8s. Visibly launches
        // from the OGRE rather than appearing high in the air.
        const bayY = this.ogre.position.y + 4.0;
        const drone = {
            x: ox, y: bayY, z: oz,
            hp: DRONE_HP, maxHp: DRONE_HP,
            lastFireT: 0,
            entityId: null,
            deploying: true,
            deployT: 0,
            deployFromY: bayY,
            deployToY: oy,
        };
        if (r) {
            const result = r.exec({
                type: "entity:spawnMesh",
                assetId: "ogre_drone",
                kind: "ogre_drone",
                x: ox, y: bayY, z: oz,
                scale: 0.7,
            });
            drone.entityId = result?.id ?? null;
        }
        this.drones.push(drone);
    }

    _tickDrones(dt, t) {
        for (let i = this.drones.length - 1; i >= 0; i--) {
            const d = this.drones[i];
            if (d.hp <= 0) {
                this._sfxAt("ogre_minion_death", d.x, d.y, d.z);
                if (this.particles?.spawn) {
                    for (let n = 0; n < 14; n++) {
                        const a = Math.random() * Math.PI * 2;
                        this.particles.spawn({
                            x: d.x, y: d.y, z: d.z,
                            vx: Math.cos(a) * (2 + Math.random() * 3),
                            vy: 1 + Math.random() * 3,
                            vz: Math.sin(a) * (2 + Math.random() * 3),
                            ttl: 0.7, size: 0.4,
                            r: 1.0, g: 0.6, b: 0.3, a: 1.0,
                            gravity: 12,
                        });
                    }
                }
                if (d.entityId != null && this.router) {
                    this.router.exec({ type: "entity:despawn", id: d.entityId });
                }
                this.drones.splice(i, 1);
                continue;
            }
            // Round 25 — bay-deploy ascent. Drone rises from bay-door
            // height to combat altitude over 0.8s. Reads as launching
            // from OGRE rather than spawning high in the air.
            if (d.deploying) {
                d.deployT += dt;
                const p = Math.min(1, d.deployT / 0.8);
                const eased = easeOutQuad(p);
                d.y = d.deployFromY + (d.deployToY - d.deployFromY) * eased;
                if (p >= 1) d.deploying = false;
                if (d.entityId != null && this.router) {
                    this.router.exec({
                        type: "entity:move",
                        id: d.entityId,
                        x: d.x, y: d.y, z: d.z,
                        yaw: 0, tiltX: 0,
                    });
                }
                continue;
            }
            // Find nearest defender
            let target = null, best = Infinity;
            for (const def of this.defenders) {
                if (def.hp <= 0) continue;
                const dx = def.x - d.x, dz = def.z - d.z;
                const d2 = dx * dx + dz * dz;
                if (d2 < best) { best = d2; target = def; }
            }
            if (target) {
                // Strafe toward target altitude (DRONE_ALTITUDE above ground)
                const dx = target.x - d.x;
                const dz = target.z - d.z;
                const ground = this._surfaceY(d.x, d.z);
                const desiredY = ground + DRONE_ALTITUDE;
                const dy = desiredY - d.y;
                const dh = Math.hypot(dx, dz);
                const stop = 8;     // hover this far from target
                if (dh > stop) {
                    const step = DRONE_SPEED * dt;
                    d.x += (dx / dh) * step;
                    d.z += (dz / dh) * step;
                }
                d.y += dy * Math.min(1, 4 * dt);
                // Fire laser if close enough + cooldown ready
                if (Math.hypot(dx, dz) < DRONE_LASER_RANGE
                    && t - d.lastFireT >= DRONE_LASER_INTERVAL) {
                    if (this.particles?.spawn) {
                        const STEPS = 10;
                        for (let s = 0; s < STEPS; s++) {
                            const f = s / STEPS;
                            this.particles.spawn({
                                x: d.x + (target.x - d.x) * f,
                                y: d.y + ((target.y + 1) - d.y) * f,
                                z: d.z + (target.z - d.z) * f,
                                ttl: 0.18, size: 0.3,
                                r: 0.6, g: 1.0, b: 1.0, a: 1.0,
                            });
                        }
                    }
                    target.hp -= DRONE_LASER_DAMAGE;
                    if (target.hp <= 0) this._killDefender(target, "drone_laser");
                    d.lastFireT = t;
                    this._sfxAt("ogre_laser_fire", d.x, d.y, d.z);
                }
            }
            if (d.entityId != null && this.router) {
                this.router.exec({
                    type: "entity:move",
                    id: d.entityId,
                    x: d.x, y: d.y, z: d.z,
                });
            }
        }
    }

    // -------------------------------------------------------------- tracks

    _spawnDustTracks(fwdX, fwdZ) {
        if (!this.particles?.spawn) return;
        // Two tread positions, perpendicular to forward
        const sideX = -fwdZ;
        const sideZ = fwdX;
        const halfWidth = 1.5 * (this.variant.scale / 4);
        const ox = this.ogre.position.x;
        const oz = this.ogre.position.z;
        for (const sign of [-1, +1]) {
            const px = ox - fwdX * 1.5 + sideX * halfWidth * sign;
            const pz = oz - fwdZ * 1.5 + sideZ * halfWidth * sign;
            const py = this._surfaceY(px, pz);
            for (let n = 0; n < 4; n++) {
                this.particles.spawn({
                    x: px + (Math.random() - 0.5) * 0.6,
                    y: py + Math.random() * 0.5,
                    z: pz + (Math.random() - 0.5) * 0.6,
                    vx: (Math.random() - 0.5) * 1,
                    vy: 0.5 + Math.random() * 1.5,
                    vz: (Math.random() - 0.5) * 1,
                    ttl: 0.9, size: 0.5,
                    r: 0.55, g: 0.45, b: 0.32, a: 0.7,
                    gravity: 4,
                });
            }
        }
    }

    // Round 49 - world-space tube-tip position for a defender given an
    // explicit target. Used both for muzzle flash + projectile origin.
    // Mirrors what TurretRenderer does at draw time:
    //   1. Tube is along +X in mesh-local space, length TUBE_LENGTH.
    //   2. Mesh-local +Y elevation is TUBE_BASE_ELEV.
    //   3. Mesh is scaled by DEFAULT_INST_SCALE.
    //   4. Rotated around Y by atan2(dz, dx) toward target.
    //   5. Translated to (d.x, d.y + 0.05, d.z) -- that 0.05 is the
    //      dome anchor lift in getTurretInstances().
    _tubeTipWorld(d, targetX, targetZ) {
        const G = TURRET_GEOM;
        const dx = targetX - d.x;
        const dz = targetZ - d.z;
        const aimYaw = Math.atan2(dz, dx);
        const s = G.DEFAULT_INST_SCALE;
        const c = Math.cos(aimYaw), si = Math.sin(aimYaw);
        // Local tip = (TUBE_LENGTH, TUBE_BASE_ELEV, 0) * scale, then yaw'd
        const lx = G.TUBE_LENGTH * s;
        const ly = G.TUBE_BASE_ELEV * s;
        return {
            x: d.x + c * lx,
            y: d.y + 0.05 + ly,
            z: d.z + si * lx,
            aimYaw,
            fwdX: c,                    // unit aim direction (XZ plane)
            fwdZ: si,
        };
    }

    _launchProjectile(from, target, tt) {
        // Round 34 — minelayer: drop a sea mine at target XZ instead of
        // firing a projectile. Mine bobs on water surface, rotating alarm
        // light, detonates on enemy proximity.
        if (tt.special === "minelayer") {
            this._deployMine(from, target, tt);
            return;
        }
        // Round 36 — landmine: same idea but flat ground mine, no bob,
        // no beacon. Reuses _deployMine with a "land" flag.
        if (tt.special === "landmine") {
            this._deployMine(from, target, tt, true);
            return;
        }
        // Round 49 - projectile now originates at the tube tip, not the
        // defender chassis center. Compute the tip world position once
        // per fire using the same math the turret renderer uses, so the
        // tracer visually emerges from the muzzle.
        const tip = this._tubeTipWorld(from, target.x, target.z);
        // Recoil kick: tube backs into base by 0.6 mesh-units; decays in
        // _tickRecoil() over ~120ms.
        from.recoilT = 0.12;
        // Muzzle flash particles. Spawned only when particle system + sfx
        // budget allow it; tt.aoe is a rough indicator of how big a flash
        // should be (MG: 0, missile: 3, railgun: 0; we use sqrt(aoe)+1).
        this._spawnMuzzleFlash(tip, tt);
        const dx = target.x - tip.x;
        const dy = target.y - tip.y;
        const dz = target.z - tip.z;
        const dist = Math.hypot(dx, dy, dz) || 1;
        // Round 34 — torpedoes. When a missile defender fires in sea env,
        // launch a torpedo instead: horizontal underwater trajectory at
        // water-surface depth, no vertical component, leaves a bubble
        // trail. Same damage profile as the missile.
        // Round 36 — submarine defenders ALWAYS fire torpedoes regardless
        // of env (they sit submerged at seafloor).
        const isMissile = (tt === TURRET_TYPES.missile);
        const isTorpType = (tt.special === "torpedo");
        if (isTorpType || (isMissile && this._currentEnv === "sea")) {
            const torpY = this._surfaceY(tip.x, tip.z) + 1.2;     // just below surface
            const horiz = Math.hypot(dx, dz) || 1;
            this.projectiles.push({
                team: "defender",
                x: tip.x, y: torpY, z: tip.z,
                vx: dx / horiz * tt.projSpeed,
                vy: 0,                                              // pure horizontal
                vz: dz / horiz * tt.projSpeed,
                ttl: horiz / tt.projSpeed + 0.6,
                type: tt,
                torpedo: true,                                       // marker for tick
                hp: 1,                                               // round 35 — destructible by PD
            });
            return;
        }
        // Round 29 — napalm fires as ballistic arc so it lobs over the
        // target area, dropping fire bits along the trajectory.
        if (tt.special === "napalm") {
            const horiz = Math.hypot(dx, dz);
            const flightTime = Math.max(0.8, horiz / tt.projSpeed);
            const g = 18;
            const vx = dx / flightTime;
            const vz = dz / flightTime;
            const vy = (dy + 0.5 * g * flightTime * flightTime) / flightTime;
            this.projectiles.push({
                team: "defender",
                x: tip.x, y: tip.y, z: tip.z,
                vx, vy, vz,
                ballistic: true,
                ttl: flightTime + 0.5,
                type: tt,
            });
            return;
        }
        this.projectiles.push({
            team: "defender",
            x: tip.x, y: tip.y, z: tip.z,
            vx: dx / dist * tt.projSpeed,
            vy: dy / dist * tt.projSpeed,
            vz: dz / dist * tt.projSpeed,
            ttl: dist / tt.projSpeed + 0.6,
            type: tt,
        });
    }

    // Round 49 — muzzle flash. Small expanding orange/yellow burst at
    // the tube tip when a turret fires. Cheap: 5-9 particles, brief ttl.
    // Color tinted by turret type so MG flashes yellow, missile orange,
    // railgun cyan. Each particle drifts forward along the aim direction
    // a bit so the flash visually emerges from the muzzle.
    _spawnMuzzleFlash(tip, tt) {
        if (!this.particles?.spawn) return;
        const baseColor = tt.projColor || [1.0, 0.85, 0.35];
        const flashScale = Math.max(1.0, Math.sqrt((tt.aoe || 0) + 1));
        const count = Math.round(5 + flashScale * 2);          // 5-9
        for (let i = 0; i < count; i++) {
            // Spread particles in a cone forward (~+/-25deg)
            const spread = (Math.random() - 0.5) * 0.9;
            const aimC = Math.cos(spread), aimS = Math.sin(spread);
            const vx = (tip.fwdX * aimC - tip.fwdZ * aimS) * (4 + Math.random() * 3);
            const vz = (tip.fwdX * aimS + tip.fwdZ * aimC) * (4 + Math.random() * 3);
            this.particles.spawn({
                x: tip.x, y: tip.y, z: tip.z,
                vx, vy: 0.5 + Math.random() * 1.5, vz,
                ttl: 0.15 + Math.random() * 0.10,
                size: 0.55 * flashScale + Math.random() * 0.3,
                r: baseColor[0],
                g: baseColor[1] * (0.7 + Math.random() * 0.3),
                b: baseColor[2] * (0.5 + Math.random() * 0.4),
                a: 0.95,
                gravity: -2,                                   // slight lift
            });
        }
        // A brighter core puff
        this.particles.spawn({
            x: tip.x, y: tip.y, z: tip.z,
            vx: tip.fwdX * 2, vy: 0, vz: tip.fwdZ * 2,
            ttl: 0.10,
            size: 0.9 * flashScale,
            r: 1.0, g: 1.0, b: 0.85, a: 0.95,
            gravity: 0,
        });
    }

    // Round 49 — decay every defender's recoilT toward 0. Called each
    // Round 57 - idle camera return. Reads window._lastUserInputMs (set
    // by main.js on any mouse/keyboard/wheel event). After 6s of idle,
    // smoothly eases the camera to a third-person framing 25 units
    // behind OGRE and 18 units up, looking down at OGRE's current
    // position. Direction of "behind" is derived from OGRE's movement
    // since last tick (_prevOgrePos), so the camera ends up looking
    // along the OGRE's heading.
    _updateIdleCamera(dt) {
        if (!this.camera || !this.ogre) return;
        const lastInputMs = (typeof window !== "undefined")
            ? (window._lastUserInputMs ?? performance.now())
            : performance.now();
        const idleSec = (performance.now() - lastInputMs) / 1000;
        const IDLE_THRESHOLD = 6.0;
        if (idleSec < IDLE_THRESHOLD) return;

        // Compute OGRE forward direction from movement. If stationary,
        // fall back to a default (-z).
        const op = this.ogre.position;
        const prev = this._prevOgrePos ?? op;
        let fx = op.x - prev.x, fz = op.z - prev.z;
        const flen = Math.hypot(fx, fz);
        if (flen < 0.01) { fx = 0; fz = -1; }
        else             { fx /= flen; fz /= flen; }

        // Target: 25 behind, 18 up, looking at OGRE.
        const BEHIND = 25, ABOVE = 18;
        const tx = op.x - fx * BEHIND;
        const ty = op.y + ABOVE;
        const tz = op.z - fz * BEHIND;

        const easeIn = Math.min(1, (idleSec - IDLE_THRESHOLD) / 1.5);
        const k = 1 - Math.exp(-dt * 1.2 * easeIn);
        this.camera.position.x += (tx - this.camera.position.x) * k;
        this.camera.position.y += (ty - this.camera.position.y) * k;
        this.camera.position.z += (tz - this.camera.position.z) * k;

        const dx = op.x - this.camera.position.x;
        const dy = op.y - this.camera.position.y;
        const dz = op.z - this.camera.position.z;
        const targetYaw = Math.atan2(dx, -dz);
        const horizDist = Math.hypot(dx, dz);
        const targetPitch = Math.atan2(dy, horizDist);
        let yawDelta = targetYaw - (this.camera.yaw ?? 0);
        while (yawDelta >  Math.PI) yawDelta -= 2 * Math.PI;
        while (yawDelta < -Math.PI) yawDelta += 2 * Math.PI;
        this.camera.yaw   = (this.camera.yaw   ?? 0) + yawDelta * k;
        this.camera.pitch = (this.camera.pitch ?? 0) + (targetPitch - (this.camera.pitch ?? 0)) * k;
    }

    // Round 3 — per-frame defender recoil decay. Stored on each defender,
    // tick. The visual offset = recoilT * 5 (capped) gives a snappy
    // kickback that recovers smoothly. Stored in def.recoilOffset so
    // getTurretInstances can read it without recomputing.
    _tickRecoil(dt) {
        if (!this.defenders) return;
        for (const d of this.defenders) {
            if (d.recoilT > 0) {
                d.recoilT -= dt;
                if (d.recoilT < 0) d.recoilT = 0;
                // 0.12s peak => 0.6 offset (mesh-local units). Eases out.
                d.recoilOffset = (d.recoilT / 0.12) * 0.6;
            } else {
                d.recoilOffset = 0;
            }
            // Round 52 - state-driven skeletal animation clip for the
            // defender mesh. "fire" while recoilT > 0, "death" once dead
            // (catches the brief window before despawn), else "idle".
            // Edge-triggered on transitions only - no per-frame router
            // spam for stationary defenders.
            if (d.entityId != null && this.router) {
                const want = (d.hp <= 0)        ? "death"
                           : (d.recoilT > 0)    ? "fire"
                                                : "idle";
                if (d._lastClipState !== want) {
                    this.router.exec({
                        type: "entity:setAnimClip",
                        id: d.entityId,
                        clip: want,
                    });
                    d._lastClipState = want;
                }
            }
        }
    }

    _tickProjectiles(dt, ogreFwdX = 0, ogreFwdZ = -1) {
        for (let i = this.projectiles.length - 1; i >= 0; i--) {
            const p = this.projectiles[i];
            // Ballistic projectiles fall under gravity
            if (p.ballistic) p.vy -= 18 * dt;
            p.x += p.vx * dt;
            p.y += p.vy * dt;
            p.z += p.vz * dt;
            p.ttl -= dt;
            // Round 35 — torpedo destroyed by PD: small splash pop and
            // remove. Skips damage to anything.
            if (p.torpedo && (p.hp ?? 1) <= 0) {
                if (this.particles?.spawn) {
                    for (let n = 0; n < 18; n++) {
                        const a = Math.random() * Math.PI * 2;
                        const sp = 2.5 + Math.random() * 3;
                        this.particles.spawn({
                            x: p.x, y: p.y, z: p.z,
                            vx: Math.cos(a) * sp,
                            vy: 2 + Math.random() * 3,
                            vz: Math.sin(a) * sp,
                            ttl: 0.7, size: 0.45,
                            r: 0.9, g: 0.95, b: 1.0, a: 0.9,
                            gravity: 8,
                        });
                    }
                }
                this.projectiles.splice(i, 1);
                continue;
            }

            // Round 29 — napalm projectiles drop sticky fire bits along
            // their trajectory at fixed interval. Bits stick where they
            // land and burn enemies in radius.
            if (p.type?.special === "napalm" && p.team === "defender") {
                p._lastBitT = (p._lastBitT ?? 0) + dt;
                if (p._lastBitT >= (p.type.bitInterval ?? 0.08)) {
                    p._lastBitT = 0;
                    this._spawnNapalmBit(p.x, p.y, p.z, p.type);
                }
            }

            // Round 34 — torpedo bubble trail. Each frame a torpedo is in
            // flight, spawn 1–2 small white bubble particles rising from
            // its wake. Plus a thin foam surface streak above.
            if (p.torpedo && this.particles?.spawn) {
                const bubbleCount = 1 + ((Math.random() < 0.5) ? 1 : 0);
                for (let b = 0; b < bubbleCount; b++) {
                    this.particles.spawn({
                        x: p.x + (Math.random() - 0.5) * 0.3,
                        y: p.y + (Math.random() - 0.5) * 0.2,
                        z: p.z + (Math.random() - 0.5) * 0.3,
                        vx: -p.vx * 0.04,
                        vy: 1.2 + Math.random() * 0.8,            // rising bubble
                        vz: -p.vz * 0.04,
                        ttl: 0.9 + Math.random() * 0.4,
                        size: 0.30 + Math.random() * 0.15,
                        r: 0.92, g: 0.95, b: 1.00, a: 0.75,
                        gravity: 0,
                    });
                }
                // foam streak on surface
                this.particles.spawn({
                    x: p.x, y: p.y + 0.8, z: p.z,
                    ttl: 0.55, size: 0.45,
                    r: 1.00, g: 1.00, b: 1.00, a: 0.45,
                });
            }

            if (this.particles?.spawn) {
                const c = p.type.projColor;
                this.particles.spawn({
                    x: p.x, y: p.y, z: p.z,
                    ttl: 0.18, size: 0.32,
                    r: c[0], g: c[1], b: c[2], a: 0.95,
                });
            }

            if (p.team === "defender") {
                // Round 113 — defender projectiles can shoot down OGRE
                // planes (mk11 carrier-launched). Tested before
                // hardpoint pass since planes are airborne and won't
                // overlap with chassis hardpoints. 2.4u hit radius
                // matching the defender plane size from round 111.
                if (this.planes) {
                    let hitOgrePlane = false;
                    for (const op of this.planes) {
                        if (op.hp <= 0) continue;
                        const ddx = p.x - op.x;
                        const ddy = p.y - op.y;
                        const ddz = p.z - op.z;
                        if (Math.hypot(ddx, ddy, ddz) < 2.4) {
                            op.hp -= p.type.damage;
                            if (this.particles?.spawn) {
                                for (let n = 0; n < 10; n++) {
                                    this.particles.spawn({
                                        x: op.x, y: op.y, z: op.z,
                                        vx: (Math.random() - 0.5) * 4,
                                        vy: 0.5 + Math.random() * 2,
                                        vz: (Math.random() - 0.5) * 4,
                                        ttl: 0.4, size: 0.45,
                                        r: 1.0, g: 0.75, b: 0.3, a: 1.0,
                                        gravity: 4,
                                    });
                                }
                            }
                            hitOgrePlane = true;
                            break;
                        }
                    }
                    if (hitOgrePlane) {
                        this.projectiles.splice(i, 1);
                        continue;
                    }
                }
                // Round 113 — defender torpedoes can also hit OGRE
                // escort subs. Mirror of the OGRE-plane branch. 1.6u
                // hit radius matching sub size.
                if (this.escortSubs) {
                    let hitEscort = false;
                    for (const es of this.escortSubs) {
                        if (es.hp <= 0) continue;
                        const ddx = p.x - es.x;
                        const ddy = p.y - (es.seaY + 0.6);
                        const ddz = p.z - es.z;
                        if (Math.hypot(ddx, ddy, ddz) < 1.6) {
                            es.hp -= p.type.damage;
                            if (this.particles?.spawn) {
                                for (let n = 0; n < 8; n++) {
                                    this.particles.spawn({
                                        x: es.x, y: es.seaY + 0.3, z: es.z,
                                        vx: (Math.random() - 0.5) * 3,
                                        vy: 0.5 + Math.random() * 2,
                                        vz: (Math.random() - 0.5) * 3,
                                        ttl: 0.5, size: 0.4,
                                        r: 1.0, g: 0.75, b: 0.3, a: 1.0,
                                        gravity: 4,
                                    });
                                }
                            }
                            hitEscort = true;
                            break;
                        }
                    }
                    if (hitEscort) {
                        this.projectiles.splice(i, 1);
                        continue;
                    }
                }
                // Round 9 — Hit hard point first?
                let hitHardpoint = false;
                for (const key of Object.keys(this.hardpoints)) {
                    const h = this.hardpoints[key];
                    if (h.destroyed) continue;
                    const ddx = p.x - h.x;
                    const ddy = p.y - h.y;
                    const ddz = p.z - h.z;
                    if (Math.hypot(ddx, ddy, ddz) < h.def.radius) {
                        h.hp -= p.type.damage;
                        if (this.particles?.spawn) {
                            const c = h.def.color;
                            for (let n = 0; n < 4; n++) {
                                this.particles.spawn({
                                    x: p.x, y: p.y, z: p.z,
                                    ttl: 0.3, size: 0.4,
                                    r: c[0], g: c[1], b: c[2], a: 1.0,
                                });
                            }
                        }
                        if (h.hp <= 0) this._destroyHardpoint(h);
                        hitHardpoint = true;
                        break;
                    }
                }
                if (hitHardpoint) {
                    this.projectiles.splice(i, 1);
                    continue;
                }
                // Hit OGRE?
                if (this.ogre) {
                    const ddx = p.x - this.ogre.position.x;
                    const ddy = p.y - (this.ogre.position.y + 1.5);
                    const ddz = p.z - this.ogre.position.z;
                    const dHit = Math.hypot(ddx, ddy, ddz);
                    if (dHit < OGRE_HIT_RADIUS * (this.variant.scale / 4)) {
                        // Round 8 — phantom cloak: pass straight through
                        if (this.cloaked) {
                            // Ghostly visual but no damage
                            if (this.particles?.spawn) {
                                for (let n = 0; n < 4; n++) {
                                    this.particles.spawn({
                                        x: p.x, y: p.y, z: p.z,
                                        ttl: 0.3, size: 0.4,
                                        r: 0.85, g: 0.55, b: 1.0, a: 0.7,
                                    });
                                }
                            }
                            this.projectiles.splice(i, 1);
                            continue;
                        }
                        // Round 8 — magnetic deflection: projectile bounces away
                        if (this.magneticActive) {
                            // Reverse velocity + add tangential kick
                            p.vx = -p.vx * 0.5 + (Math.random() - 0.5) * 8;
                            p.vy =  Math.abs(p.vy) * 0.5 + 4;
                            p.vz = -p.vz * 0.5 + (Math.random() - 0.5) * 8;
                            p.team = "deflected";   // can't damage anything
                            p.ttl = 0.6;
                            if (this.particles?.spawn) {
                                for (let n = 0; n < 8; n++) {
                                    const a = Math.random() * Math.PI * 2;
                                    this.particles.spawn({
                                        x: p.x, y: p.y, z: p.z,
                                        vx: Math.cos(a) * 4, vy: Math.random() * 2,
                                        vz: Math.sin(a) * 4,
                                        ttl: 0.4, size: 0.4,
                                        r: 0.5, g: 0.7, b: 1.0, a: 0.95,
                                        gravity: 6,
                                    });
                                }
                            }
                            continue;
                        }
                        const projOnFwd = ddx * ogreFwdX + ddz * ogreFwdZ;
                        let dmg = p.type.damage;
                        if (projOnFwd < 0) {
                            dmg *= OGRE_REAR_DAMAGE_MUL;
                            if (this.particles?.spawn) {
                                for (let n = 0; n < 6; n++) {
                                    this.particles.spawn({
                                        x: p.x, y: p.y, z: p.z,
                                        ttl: 0.4, size: 0.4,
                                        r: 1.0, g: 1.0, b: 0.5, a: 1.0,
                                        gravity: 4,
                                    });
                                }
                            }
                        }
                        // Round 7 — Aegis shield absorbs damage first
                        if (this.shieldHp > 0) {
                            const absorbed = Math.min(this.shieldHp, dmg);
                            this.shieldHp -= absorbed;
                            dmg -= absorbed;
                            // Hex shimmer on hit
                            if (this.particles?.spawn) {
                                for (let n = 0; n < 8; n++) {
                                    const a = Math.random() * Math.PI * 2;
                                    this.particles.spawn({
                                        x: p.x + Math.cos(a) * 0.6,
                                        y: p.y,
                                        z: p.z + Math.sin(a) * 0.6,
                                        ttl: 0.45, size: 0.5,
                                        r: 0.6, g: 0.85, b: 1.0, a: 0.95,
                                    });
                                }
                            }
                            if (this.shieldHp <= 0) {
                                this._sfxAt("ogre_shield_break", this.ogre.position.x, this.ogre.position.y, this.ogre.position.z);
                                if (this.particles?.spawn) {
                                    for (let n = 0; n < 36; n++) {
                                        const a = Math.random() * Math.PI * 2;
                                        const speed = 3 + Math.random() * 6;
                                        this.particles.spawn({
                                            x: this.ogre.position.x,
                                            y: this.ogre.position.y + 2,
                                            z: this.ogre.position.z,
                                            vx: Math.cos(a) * speed,
                                            vy: 1 + Math.random() * 4,
                                            vz: Math.sin(a) * speed,
                                            ttl: 1.2, size: 0.55,
                                            r: 0.6, g: 0.9, b: 1.0, a: 1.0,
                                            gravity: 7,
                                        });
                                    }
                                }
                            }
                        }
                        if (dmg > 0) this.ogreHp -= dmg;
                        if (p.type.aoe > 0 && this.particles?.spawn) {
                            for (let n = 0; n < 16; n++) {
                                const a = Math.random() * Math.PI * 2;
                                const r2 = Math.random() * p.type.aoe;
                                const c = p.type.projColor;
                                this.particles.spawn({
                                    x: p.x + Math.cos(a) * r2,
                                    y: p.y + (Math.random() - 0.5) * p.type.aoe * 0.7,
                                    z: p.z + Math.sin(a) * r2,
                                    ttl: 0.6, size: 0.6,
                                    r: c[0], g: c[1] * 0.7, b: c[2] * 0.5, a: 0.85,
                                    gravity: 6,
                                });
                            }
                        }
                        this.projectiles.splice(i, 1);
                        continue;
                    }
                }
                // Hit minion?
                let hitMinion = false;
                for (const m of this.minions) {
                    if (m.hp <= 0) continue;
                    const ddx = p.x - m.x;
                    const ddz = p.z - m.z;
                    const ddy = p.y - (m.y + 0.5);
                    if (Math.hypot(ddx, ddy, ddz) < 1.4) {
                        m.hp -= p.type.damage;
                        try { window.tintFX?.flash(m.entityId); } catch {}   // v554 — hit-flash
                        if (m.hp <= 0) {
                            this._sfxAt("ogre_minion_death", m.x, m.y, m.z);
                            if (this.particles?.spawn) {
                            for (let n = 0; n < 12; n++) {
                                this.particles.spawn({
                                    x: m.x, y: m.y + 0.5, z: m.z,
                                    vx: (Math.random() - 0.5) * 4,
                                    vy: 1 + Math.random() * 2,
                                    vz: (Math.random() - 0.5) * 4,
                                    ttl: 0.6, size: 0.35,
                                    r: 1.0, g: 0.5, b: 0.3, a: 1.0,
                                    gravity: 12,
                                });
                            }
                        }
                        }
                        hitMinion = true;
                        break;
                    }
                }
                if (hitMinion) {
                    this.projectiles.splice(i, 1);
                    continue;
                }
                // Round 7 — Hit drone?
                let hitDrone = false;
                for (const drone of this.drones) {
                    if (drone.hp <= 0) continue;
                    const ddx = p.x - drone.x;
                    const ddy = p.y - drone.y;
                    const ddz = p.z - drone.z;
                    if (Math.hypot(ddx, ddy, ddz) < 1.4) {
                        drone.hp -= p.type.damage;
                        hitDrone = true;
                        break;
                    }
                }
                if (hitDrone) {
                    this.projectiles.splice(i, 1);
                    continue;
                }
                // Round 10 — Hit shard?
                let hitShard = false;
                for (const sh of this.shards) {
                    if (sh.hp <= 0) continue;
                    const ddx = p.x - sh.x;
                    const ddy = p.y - (sh.y + 1);
                    const ddz = p.z - sh.z;
                    if (Math.hypot(ddx, ddy, ddz) < 1.8) {
                        sh.hp -= p.type.damage;
                        hitShard = true;
                        break;
                    }
                }
                if (hitShard) {
                    this.projectiles.splice(i, 1);
                    continue;
                }
            } else if (p.team === "ogre") {
                // OGRE plasma hits defenders
                let didHit = false;
                const report20 = (hit) => {   // PATCH-B20 -- once per tagged shot
                    if (p._brainName && !p._brainReported) {
                        p._brainReported = true;
                        try { window._gpuBrainOutcomes?.push({ id: p._brainOgreId, name: p._brainName, hit, civsHit: 0, kaijuHit: 0, src: "rotation" }); } catch {}
                    }
                };
                // Round 111 — anti-air. OGRE projectiles also test
                // against defender planes (3D collision). Planes have
                // bigger hit radius (2.4) than ground defenders (1.8)
                // since they're physically larger entities, and to
                // give the anti-air gameplay a chance vs fast-moving
                // targets. A successful hit applies the full damage
                // value and despawns the plane on hp drop to 0 (death
                // FX handled in _tickDefenderPlanes when hp<=0).
                if (this.defenderPlanes) {
                    for (const plane of this.defenderPlanes) {
                        if (plane.hp <= 0) continue;
                        const ddx = p.x - plane.x;
                        const ddy = p.y - plane.y;
                        const ddz = p.z - plane.z;
                        const dHit = Math.hypot(ddx, ddy, ddz);
                        if (dHit < 2.4) {
                            plane.hp -= p.type.damage;
                            didHit = true;
                            report20(1);   // PATCH-B20
                            // Spark FX on the plane to show the hit
                            if (this.particles?.spawn) {
                                for (let n = 0; n < 10; n++) {
                                    this.particles.spawn({
                                        x: plane.x, y: plane.y, z: plane.z,
                                        vx: (Math.random() - 0.5) * 4,
                                        vy: 0.5 + Math.random() * 2,
                                        vz: (Math.random() - 0.5) * 4,
                                        ttl: 0.4, size: 0.45,
                                        r: 1.0, g: 0.75, b: 0.3, a: 1.0,
                                        gravity: 4,
                                    });
                                }
                            }
                            break;
                        }
                    }
                }
                if (didHit) {
                    this.projectiles.splice(i, 1);
                    continue;
                }
                // Round 120 — OGRE shoots down patrol drones.
                // Smaller hit radius (1.6) since drones are smaller
                // entities than planes. Damage is the same; drone
                // _tickDefenderDrones handles hp <= 0 by exploding.
                if (this.defenderDrones) {
                    for (const drone of this.defenderDrones) {
                        if (drone.hp <= 0) continue;
                        const ddx = p.x - drone.x;
                        const ddy = p.y - drone.y;
                        const ddz = p.z - drone.z;
                        if (Math.hypot(ddx, ddy, ddz) < 1.6) {
                            drone.hp -= p.type.damage;
                            didHit = true;
                            report20(1);   // PATCH-B20
                            if (this.particles?.spawn) {
                                for (let n = 0; n < 6; n++) {
                                    this.particles.spawn({
                                        x: drone.x, y: drone.y, z: drone.z,
                                        vx: (Math.random() - 0.5) * 3,
                                        vy: 0.3 + Math.random() * 1.5,
                                        vz: (Math.random() - 0.5) * 3,
                                        ttl: 0.3, size: 0.32,
                                        r: 1.0, g: 0.8, b: 0.4, a: 1.0,
                                        gravity: 3,
                                    });
                                }
                            }
                            break;
                        }
                    }
                }
                if (didHit) {
                    this.projectiles.splice(i, 1);
                    continue;
                }
                // Round 120 — OGRE projectiles damage depot (mirrors airport).
                if (this._depot && !this._depot.destroyed) {
                    const ddx = p.x - this._depot.x;
                    const ddy = p.y - this._depot.y;
                    const ddz = p.z - this._depot.z;
                    if (Math.hypot(ddx, ddy, ddz) < this._depot.radius) {
                        this._depot.hp -= p.type.damage;
                        if (this._depot.hp <= 0) this._destroyStructure(this._depot, "depot");
                        else this._structureHitFX(this._depot.x, this._depot.y, this._depot.z);
                        this.projectiles.splice(i, 1);
                        continue;
                    }
                }
                // Round 112 — OGRE projectiles damage pre-laid defenses.
                // Airport (taking it out halts plane launches) and
                // garages (cosmetic destruction with debris field).
                // 3D distance vs structure.radius hit test.
                if (this._airport && !this._airport.destroyed) {
                    const ddx = p.x - this._airport.x;
                    const ddy = p.y - this._airport.y;
                    const ddz = p.z - this._airport.z;
                    if (Math.hypot(ddx, ddy, ddz) < this._airport.radius) {
                        this._airport.hp -= p.type.damage;
                        if (this._airport.hp <= 0) this._destroyStructure(this._airport, "airport");
                        else this._structureHitFX(this._airport.x, this._airport.y, this._airport.z);
                        this.projectiles.splice(i, 1);
                        continue;
                    }
                }
                // Round 112 — dock + subs as legitimate targets
                if (this._dock && !this._dock.destroyed) {
                    const ddx = p.x - this._dock.x;
                    const ddy = p.y - this._dock.y;
                    const ddz = p.z - this._dock.z;
                    if (Math.hypot(ddx, ddy, ddz) < this._dock.radius) {
                        this._dock.hp -= p.type.damage;
                        if (this._dock.hp <= 0) this._destroyStructure(this._dock, "dock");
                        else this._structureHitFX(this._dock.x, this._dock.y, this._dock.z);
                        this.projectiles.splice(i, 1);
                        continue;
                    }
                }
                if (this.defenderSubs) {
                    let hitSub = false;
                    for (const sub of this.defenderSubs) {
                        if (sub.hp <= 0) continue;
                        const ddx = p.x - sub.x;
                        const ddy = p.y - (sub.seaY + 0.6);
                        const ddz = p.z - sub.z;
                        if (Math.hypot(ddx, ddy, ddz) < 1.6) {
                            sub.hp -= p.type.damage;
                            if (this.particles?.spawn) {
                                for (let n = 0; n < 8; n++) {
                                    this.particles.spawn({
                                        x: sub.x, y: sub.seaY + 0.3, z: sub.z,
                                        vx: (Math.random() - 0.5) * 3,
                                        vy: 0.5 + Math.random() * 2,
                                        vz: (Math.random() - 0.5) * 3,
                                        ttl: 0.5, size: 0.4,
                                        r: 1.0, g: 0.75, b: 0.3, a: 1.0,
                                        gravity: 4,
                                    });
                                }
                            }
                            hitSub = true;
                            break;
                        }
                    }
                    if (hitSub) {
                        this.projectiles.splice(i, 1);
                        continue;
                    }
                }
                if (this._garages) {
                    let hitGarage = false;
                    for (const g of this._garages) {
                        if (g.destroyed) continue;
                        const ddx = p.x - g.x;
                        const ddy = p.y - g.y;
                        const ddz = p.z - g.z;
                        if (Math.hypot(ddx, ddy, ddz) < g.radius) {
                            g.hp -= p.type.damage;
                            if (g.hp <= 0) this._destroyStructure(g, "garage");
                            else this._structureHitFX(g.x, g.y, g.z);
                            hitGarage = true;
                            break;
                        }
                    }
                    if (hitGarage) {
                        this.projectiles.splice(i, 1);
                        continue;
                    }
                }
                // Round 114 — OGRE projectiles can shoot out revealed
                // mines from range. Detonation deals distance-falloff
                // damage back to OGRE; at 10u+ away, no self-damage.
                // Letting the player clear the field is a tactical
                // tradeoff: ammo + time vs HP saved.
                if (this._minefield) {
                    let hitMine = false;
                    for (const m of this._minefield) {
                        if (m.triggered || !m.revealed) continue;
                        const ddx = p.x - m.x;
                        const ddy = p.y - (m.y + 0.3);
                        const ddz = p.z - m.z;
                        if (Math.hypot(ddx, ddy, ddz) < 1.0) {
                            this._detonateMine(m, { byShot: true });
                            hitMine = true;
                            break;
                        }
                    }
                    if (hitMine) {
                        this.projectiles.splice(i, 1);
                        continue;
                    }
                }
                for (const d of this.defenders) {
                    if (d.hp <= 0) continue;
                    const ddx = p.x - d.x;
                    const ddy = p.y - (d.y + 1);
                    const ddz = p.z - d.z;
                    const dHit = Math.hypot(ddx, ddy, ddz);
                    if (dHit < 1.8) {
                        d.hp -= p.type.damage;
                        if (d.hp <= 0) this._killDefender(d, "ogre_attack");
                        didHit = true;
                            report20(1);   // PATCH-B20
                        if (p.type.aoe > 0) {
                            for (const d2 of this.defenders) {
                                if (d2 === d || d2.hp <= 0) continue;
                                const sdx = d2.x - p.x;
                                const sdz = d2.z - p.z;
                                const sd = Math.hypot(sdx, sdz);
                                if (sd < p.type.aoe) {
                                    const splashDmg = p.type.damage * (1 - sd / p.type.aoe) * 0.6;
                                    d2.hp -= splashDmg;
                                    if (d2.hp <= 0) this._killDefender(d2, "ogre_splash");
                                }
                            }
                            if (this.particles?.spawn) {
                                for (let n = 0; n < 22; n++) {
                                    const a = Math.random() * Math.PI * 2;
                                    const r2 = Math.random() * p.type.aoe;
                                    const c = p.type.projColor;
                                    this.particles.spawn({
                                        x: p.x + Math.cos(a) * r2,
                                        y: p.y + (Math.random() - 0.5) * 1.5,
                                        z: p.z + Math.sin(a) * r2,
                                        ttl: 0.7, size: 0.55,
                                        r: c[0], g: c[1], b: c[2], a: 0.9,
                                        gravity: 5,
                                    });
                                }
                            }
                        }
                        break;
                    }
                }
                // Artillery: detonate on ground impact too (not just hitting a defender)
                if (!didHit && p.ballistic && p.y < this._surfaceY(p.x, p.z) + 0.5) {
                    this._sfxAt("ogre_artillery_impact", p.x, p.y, p.z);
                    if (this.particles?.spawn && p.type.aoe > 0) {
                        // Splash damage to defenders within aoe
                        for (const d2 of this.defenders) {
                            if (d2.hp <= 0) continue;
                            const sdx = d2.x - p.x;
                            const sdz = d2.z - p.z;
                            const sd = Math.hypot(sdx, sdz);
                            if (sd < p.type.aoe) {
                                const splashDmg = p.type.damage * (1 - sd / p.type.aoe);
                                d2.hp -= splashDmg;
                                if (d2.hp <= 0) this._killDefender(d2, "artillery");
                            }
                        }
                        for (let n = 0; n < 30; n++) {
                            const a = Math.random() * Math.PI * 2;
                            const r2 = Math.random() * p.type.aoe;
                            const c = p.type.projColor;
                            this.particles.spawn({
                                x: p.x + Math.cos(a) * r2,
                                y: p.y + Math.random() * 2,
                                z: p.z + Math.sin(a) * r2,
                                vy: 1 + Math.random() * 4,
                                ttl: 1.2, size: 0.7,
                                r: c[0], g: c[1] * 0.8, b: c[2] * 0.4, a: 0.95,
                                gravity: 5,
                            });
                        }
                    }
                    didHit = true;
                            report20(1);   // PATCH-B20
                }
                if (didHit) {
                    this.projectiles.splice(i, 1);
                    continue;
                }
            }

            if (p.ttl <= 0 || p.y < 0) this.projectiles.splice(i, 1);
        }
    }

    // -------------------------------------------------------------- click handling

    handleClick(worldRayOrigin, worldRayDir, button = 0) {
        if (!this.active || this.state !== "playing") return false;

        // Right-click cancels selection / pending buy
        if (button === 2) {
            this._clearSelection();
            this.pendingBuySlot = null;
            return true;
        }

        // 1) Defender hit?
        let bestDef = null, bestT = Infinity;
        for (const d of this.defenders) {
            if (d.hp <= 0) continue;
            const center = { x: d.x, y: d.y + 1, z: d.z };
            const tHit = this._raySphereHit(worldRayOrigin, worldRayDir, center, 2.0);
            if (tHit != null && tHit < bestT && tHit < 80) { bestT = tHit; bestDef = d; }
        }
        if (bestDef) {
            this._setSelection(bestDef);
            this.pendingBuySlot = null;
            this._sfx("ogre_select", 0.6);
            return true;
        }

        // 2) Empty turret slot hit?
        let bestSlot = null, bestSlotT = Infinity;
        for (const s of this.slots) {
            if (s.filled) continue;
            const center = { x: s.x, y: s.y + 0.5, z: s.z };
            const tHit = this._raySphereHit(worldRayOrigin, worldRayDir, center, 2.0);
            if (tHit != null && tHit < bestSlotT && tHit < 80) { bestSlotT = tHit; bestSlot = s; }
        }
        if (bestSlot) {
            this.pendingBuySlot = bestSlot;
            this._clearSelection();
            return true;
        }

        // 3) Ground hit — move selection
        if (this.selectedDefender) {
            const ground = this._rayGroundHit(worldRayOrigin, worldRayDir);
            if (ground) {
                this.selectedDefender.targetPos = { x: ground.x, z: ground.z };
                this._sfx("ogre_move_command", 0.5);
                return true;
            }
        }
        return false;
    }

    // -------------------------------------------------------------- buy API (called from BuyPanel UI)

    canAfford(turretType) {
        const tt = TURRET_TYPES[turretType];
        if (!tt) return false;
        return this.energy >= tt.cost;
    }

    buyTurretAtSlot(slot, turretType) {
        const tt = TURRET_TYPES[turretType];
        if (!tt) return false;
        if (!slot || slot.filled) return false;
        if (!this.canAfford(turretType)) return false;
        this.energy -= tt.cost;
        this._sfx("ogre_buy", 0.7);

        const r = this.router;
        // Despawn the slot ghost
        if (r && slot.entityId != null) {
            r.exec({ type: "entity:despawn", id: slot.entityId });
            slot.entityId = null;
        }
        slot.filled = true;

        // Spawn defender at slot position with chosen type
        const def = {
            type: turretType,
            x: slot.x, y: slot.y, z: slot.z,
            hp: 30, maxHp: 30,
            lastFireT: 0,
            shotsFired: 0,
            targetPos: null,
            selected: false,
            entityId: null,
            periscopeId: null,                 // round 36
        };
        if (r) {
            // Round 36 — submarine defenders sit submerged at seafloor +
            // 0.5y, render with elongated hull and a separate periscope
            // entity poking above the water surface. Other defenders use
            // the standard slot.y + 1 placement.
            const tt = TURRET_TYPES[turretType];
            const isSub = (tt && tt.submerged === true);
            if (isSub) {
                const seaFloorY = this._surfaceY(slot.x, slot.z);   // skips water
                const hullY = seaFloorY + 0.6;                       // submerged
                const periY = seaFloorY + 3.4;                       // above water
                def.y = hullY;
                // Round 48 - defender sub now uses defender-themed asset
                // names (was reusing ogre_submarine / ogre_periscope which
                // are enemy visuals). entityVisuals.js has color entries
                // for these kinds so the procedural fallback paints them
                // in defender colors (olive hull, light-green periscope).
                const result = r.exec({
                    type: "entity:spawnMesh",
                    assetId: "defender_sub",
                    kind: "defender_sub",
                    x: slot.x, y: hullY, z: slot.z,
                    scale: 2.4,
                });
                def.entityId = result?.id ?? null;
                const pres = r.exec({
                    type: "entity:spawnMesh",
                    assetId: "defender_periscope",
                    kind: "defender_periscope",
                    x: slot.x, y: periY, z: slot.z,
                    scale: 0.35,
                });
                def.periscopeId = pres?.id ?? null;
            } else {
                const result = r.exec({
                    type: "entity:spawnMesh",
                    assetId: "defender",
                    kind: "defender",
                    x: slot.x, y: slot.y + 1, z: slot.z,
                    scale: 1.6,
                });
                def.entityId = result?.id ?? null;
                // Round 41 — boat hull mesh beneath defenders in sea env.
                // Long flat green hull anchored at water surface.
                if (this._currentEnv === "sea") {
                    const hullR = r.exec({
                        type: "entity:spawnMesh",
                        assetId: "defender_boat",
                        kind: "defender_boat",
                        x: slot.x, y: slot.y - 0.2, z: slot.z,
                        scaleX: 1.5, scaleY: 0.45, scaleZ: 2.6,
                    });
                    def.boatHullId = hullR?.id ?? null;
                }
            }
        }
        this.defenders.push(def);
        this.pendingBuySlot = null;
        return true;
    }

    // Round 43n - sell a turret. Refunds SELL_REFUND_RATIO of original
    // cost, despawns the entity, frees the slot. Caller passes either
    // the slot index, the slot object, or a defender reference.
    sellTurretAtSlot(slotIndex) {
        const slot = (typeof slotIndex === "number")
            ? this.slots?.[slotIndex]
            : slotIndex;
        if (!slot || !slot.filled) return false;
        // Find the defender at this slot position
        const def = this.defenders.find(d =>
            !d._sold && d.hp > 0 &&
            Math.abs(d.x - slot.x) < 0.5 &&
            Math.abs(d.z - slot.z) < 0.5
        );
        if (!def) return false;
        const tt = TURRET_TYPES[def.type];
        if (!tt) return false;
        const refund = Math.round(tt.cost * SELL_REFUND_RATIO);
        this.energy += refund;
        // Despawn entity + periscope/hull if any
        const r = this.router;
        if (r) {
            if (def.entityId    != null) r.exec({ type: "entity:despawn", id: def.entityId });
            if (def.periscopeId != null) r.exec({ type: "entity:despawn", id: def.periscopeId });
            if (def.boatHullId  != null) r.exec({ type: "entity:despawn", id: def.boatHullId });
        }
        // Mark def as removed, free the slot, spawn back a ghost
        def._sold = true;
        def.hp = 0;
        if (this.selectedDefender === def) this.selectedDefender = null;
        slot.filled = false;
        if (r && slot.entityId == null) {
            const ghost = r.exec({
                type: "entity:spawnMesh",
                assetId: "ogre_slot",
                kind:    "ogre_slot",
                x: slot.x, y: slot.y + 0.5, z: slot.z,
                scale: 1.2,
            });
            slot.entityId = ghost?.id ?? null;
        }
        this._sfx("ogre_sell", 0.6);
        console.log(`[OGRE] sold ${tt.name} for ${refund}e (energy: ${Math.round(this.energy)})`);
        return true;
    }

    // Round 43n - repair the currently selected defender. Costs
    // REPAIR_COST_PER_HP per HP point restored, capped at affordable HP.
    repairDefender(def) {
        const target = def ?? this.selectedDefender;
        if (!target || target._sold || target.hp <= 0) return false;
        if (target.hp >= target.maxHp) return false;
        const missing = target.maxHp - target.hp;
        const maxAffordable = Math.floor(this.energy / REPAIR_COST_PER_HP);
        const restore = Math.min(missing, maxAffordable);
        if (restore <= 0) return false;
        const cost = restore * REPAIR_COST_PER_HP;
        this.energy -= cost;
        target.hp += restore;
        this._sfx("ogre_repair", 0.5);
        console.log(`[OGRE] repaired +${restore}hp for ${cost.toFixed(0)}e (now ${target.hp}/${target.maxHp})`);
        return true;
    }

    _setSelection(def) {
        const r = this.router;
        if (this.selectedDefender && this.selectedDefender !== def) {
            const old = this.selectedDefender;
            old.selected = false;
            if (old.entityId != null && r) {
                r.exec({ type: "entity:despawn", id: old.entityId });
                const result = r.exec({
                    type: "entity:spawnMesh",
                    assetId: "defender",
                    kind: "defender",
                    x: old.x, y: old.y + 1, z: old.z,
                    scale: 1.6,
                });
                old.entityId = result?.id ?? null;
            }
        }
        def.selected = true;
        this.selectedDefender = def;
        if (def.entityId != null && r) {
            r.exec({ type: "entity:despawn", id: def.entityId });
            const result = r.exec({
                type: "entity:spawnMesh",
                assetId: "defender_selected",
                kind: "defender_selected",
                x: def.x, y: def.y + 1, z: def.z,
                scale: 1.6,
            });
            def.entityId = result?.id ?? null;
        }
    }

    _clearSelection() {
        if (!this.selectedDefender) return;
        const def = this.selectedDefender;
        const r = this.router;
        if (def.entityId != null && r) {
            r.exec({ type: "entity:despawn", id: def.entityId });
            const result = r.exec({
                type: "entity:spawnMesh",
                assetId: "defender",
                kind: "defender",
                x: def.x, y: def.y + 1, z: def.z,
                scale: 1.6,
            });
            def.entityId = result?.id ?? null;
        }
        def.selected = false;
        this.selectedDefender = null;
    }

    // -------------------------------------------------------------- ray helpers

    _raySphereHit(origin, dir, center, radius) {
        const ox = origin.x - center.x;
        const oy = origin.y - center.y;
        const oz = origin.z - center.z;
        const b = ox * dir.x + oy * dir.y + oz * dir.z;
        const c = ox * ox + oy * oy + oz * oz - radius * radius;
        const disc = b * b - c;
        if (disc < 0) return null;
        const sq = Math.sqrt(disc);
        const t1 = -b - sq;
        const t2 = -b + sq;
        if (t1 > 0) return t1;
        if (t2 > 0) return t2;
        return null;
    }

    _rayGroundHit(origin, dir, maxDist = 250) {
        let px = origin.x, py = origin.y, pz = origin.z;
        const stepLen = 0.6;
        for (let t = 0; t < maxDist; t += stepLen) {
            px += dir.x * stepLen;
            py += dir.y * stepLen;
            pz += dir.z * stepLen;
            const v = this.world.getVoxel?.(Math.floor(px), Math.floor(py), Math.floor(pz));
            if (v != null && v !== 0 && v !== 10 && v !== 11) {
                return { x: px, y: py, z: pz };
            }
            if (py < 0) return null;
        }
        return null;
    }

    // Round 4 — defender death helpers
    _killDefender(def, cause) {
        if (def.hp > 0) def.hp = 0;
        this._sfxAt("ogre_defender_death", def.x, def.y, def.z);
        if (this.particles?.spawn) {
            // Red death burst
            for (let n = 0; n < 24; n++) {
                const a = Math.random() * Math.PI * 2;
                const speed = 2 + Math.random() * 4;
                this.particles.spawn({
                    x: def.x, y: def.y + 1, z: def.z,
                    vx: Math.cos(a) * speed,
                    vy: 1 + Math.random() * 3,
                    vz: Math.sin(a) * speed,
                    ttl: 0.8, size: 0.4,
                    r: 1.0, g: 0.4, b: 0.2, a: 1.0,
                    gravity: 14,
                });
            }
        }
        // Round 22 — leave a corpse marker at the death site for the
        // rest of the wave. Small dark scrap that persists until the
        // next wave starts.
        if (this.router) {
            const result = this.router.exec({
                type: "entity:spawnMesh",
                assetId: "defender_corpse",
                kind: "defender_corpse",
                x: def.x, y: def.y, z: def.z,
                scale: 0.45,
            });
            if (result?.id != null) {
                if (!this.corpses) this.corpses = [];
                this.corpses.push({ entityId: result.id, x: def.x, y: def.y, z: def.z });
            }
            // Round 28 — battle wreckage props near the corpse. Small
            // weapon-debris / armor-fragment entities scattered nearby.
            // Adds visual richness to corpse markers.
            const numProps = Math.random() < 0.5 ? 1 : 2;
            for (let n = 0; n < numProps; n++) {
                const a = Math.random() * Math.PI * 2;
                const r = 0.6 + Math.random() * 0.8;
                const px = def.x + Math.cos(a) * r;
                const pz = def.z + Math.sin(a) * r;
                const propResult = this.router.exec({
                    type: "entity:spawnMesh",
                    assetId: "battle_debris",
                    kind: "battle_debris",
                    x: px, y: def.y, z: pz,
                    scale: 0.22 + Math.random() * 0.15,
                });
                if (propResult?.id != null) {
                    this.corpses.push({
                        entityId: propResult.id, x: px, y: def.y, z: pz,
                    });
                }
            }
        }
        if (def.entityId != null && this.router) {
            this.router.exec({ type: "entity:despawn", id: def.entityId });
            def.entityId = null;
        }
        // Round 36 — periscope cleanup for submarine defenders
        if (def.periscopeId != null && this.router) {
            this.router.exec({ type: "entity:despawn", id: def.periscopeId });
            def.periscopeId = null;
        }
        // Round 41 — boat hull cleanup
        if (def.boatHullId != null && this.router) {
            this.router.exec({ type: "entity:despawn", id: def.boatHullId });
            def.boatHullId = null;
        }
    }

    // Round 110 — tumbling-debris physics tick. Called once per frame
    // from tick(). Integrates velocity + gravity + angular velocity for
    // each debris piece spawned from a destroyed hardpoint. On ground
    // contact, settles the piece (zero velocity, freeze rotation,
    // schedule short despawn) and emits a dust puff. On TTL expiry,
    // despawns the entity and removes the piece from the list.
    //
    // Round 112 — settled pieces now PERSIST across waves (no auto-
    // despawn after landing). FIFO cap at MAX_BATTLEFIELD_WRECKS keeps
    // it tractable; oldest settled piece is removed when over cap. In-
    // flight pieces still age out by TTL (so unsettled debris doesn't
    // accumulate from off-screen kills).
    _updateDebris(dt) {
        if (!this._debrisPieces || this._debrisPieces.length === 0) return;
        const pieces = this._debrisPieces;
        const MAX_BATTLEFIELD_WRECKS = 50;
        for (let i = pieces.length - 1; i >= 0; i--) {
            const p = pieces[i];
            // Round 112 — only unsettled pieces age out via TTL. Settled
            // wrecks persist indefinitely (capped by MAX_BATTLEFIELD_WRECKS
            // FIFO eviction below).
            if (!p.settled) {
                p.ttl -= dt;
                if (p.ttl <= 0) {
                // PATCH-B20 -- a tagged ogre shot that expired never landed
                if (p.team === "ogre" && p._brainName && !p._brainReported) {
                    p._brainReported = true;
                    try { window._gpuBrainOutcomes?.push({ id: p._brainOgreId, name: p._brainName, hit: 0, civsHit: 0, kaijuHit: 0, src: "rotation" }); } catch {}
                }
                    if (this.router) {
                        this.router.exec({ type: "entity:despawn", id: p.entityId });
                    }
                    pieces.splice(i, 1);
                    continue;
                }
                // Integrate position + velocity
                p.x += p.vx * dt;
                p.y += p.vy * dt;
                p.z += p.vz * dt;
                p.vy -= 20 * dt;             // gravity (matches OGRE world feel)
                // Integrate rotation
                p.yaw   += p.yawVel   * dt;
                p.tiltZ += p.tiltZVel * dt;
                // Ground contact
                const groundY = this._surfaceY(p.x, p.z);
                if (p.y <= groundY + 0.2) {
                    p.y = groundY + 0.2;
                    p.settled = true;
                    p.vx = p.vy = p.vz = 0;
                    p.yawVel = p.tiltZVel = 0;
                    if (this.particles?.spawn) {
                        for (let j = 0; j < 6; j++) {
                            const a = Math.random() * Math.PI * 2;
                            const sp = 1 + Math.random() * 2;
                            this.particles.spawn({
                                x: p.x, y: p.y + 0.1, z: p.z,
                                vx: Math.cos(a) * sp, vy: 0.5 + Math.random() * 1.0, vz: Math.sin(a) * sp,
                                ttl: 0.55, size: 0.5,
                                r: 0.60, g: 0.55, b: 0.50, a: 0.85,
                                gravity: 2,
                            });
                        }
                    }
                }
            }
            // Push updated transform to renderer
            if (this.router) {
                this.router.exec({
                    type: "entity:move",
                    id:   p.entityId,
                    x: p.x, y: p.y, z: p.z,
                    yaw: p.yaw, tiltZ: p.tiltZ,
                });
            }
        }
        // Round 112 — FIFO eviction once over cap. Removes the oldest
        // settled wreck (front of array) since debris is pushed in
        // creation order. Keeps the battlefield decorated but bounded.
        let settledCount = 0;
        for (const p of pieces) if (p.settled) settledCount++;
        while (settledCount > MAX_BATTLEFIELD_WRECKS) {
            // Find first settled piece + remove
            for (let i = 0; i < pieces.length; i++) {
                if (pieces[i].settled) {
                    if (this.router && pieces[i].entityId != null) {
                        this.router.exec({ type: "entity:despawn", id: pieces[i].entityId });
                    }
                    pieces.splice(i, 1);
                    settledCount--;
                    break;
                }
            }
        }
    }

    // Round 110 — clear all live debris pieces. Called from stop() and
    // before new wave spawns so the field doesn't accumulate orphans.
    _clearDebris() {
        if (!this._debrisPieces) return;
        if (this.router) {
            for (const p of this._debrisPieces) {
                if (p.entityId != null) {
                    this.router.exec({ type: "entity:despawn", id: p.entityId });
                }
            }
        }
        this._debrisPieces.length = 0;
    }

    // v1483 — current effective sensor range (units). Full sensors = baseRange (covers the
    // arena, so no penalty); damage shrinks it toward a 15% floor; destroyed = nearly blind.
    _sensorRange() {
        const s = this.sensors;
        if (!s) return Infinity;
        const frac = Math.max(0.15, (s.maxHp > 0 ? s.hp / s.maxHp : 0));
        return s.baseRange * frac;
    }

    _nearestDefender(maxRange = Infinity, slot = null) {
        // v1483 — sensor-limited vision: the OGRE can only see/target within sensor range.
        const sr = this._sensorRange();
        if (sr < maxRange) maxRange = sr;
        // v1482/v1485 — gunner fire designation. A per-turret target (gunner:<slot>) wins for
        // that turret; else the global gunner target; else nearest. Honored while the target
        // is alive + in range, otherwise falls through to the nearest pick.
        const desig = (slot != null && this._fireByHardpoint[slot] != null) ? this._fireByHardpoint[slot] : this._cmdrFireId;
        if (desig != null) {
            for (const d of this.defenders) {
                if (d.hp <= 0 || d.entityId !== desig) continue;
                const fdx = d.x - this.ogre.position.x, fdz = d.z - this.ogre.position.z;
                if (fdx * fdx + fdz * fdz <= maxRange * maxRange) return d;
                break;
            }
        }
        let best = null, bestD2 = maxRange * maxRange;
        for (const d of this.defenders) {
            if (d.hp <= 0) continue;
            const dx = d.x - this.ogre.position.x;
            const dz = d.z - this.ogre.position.z;
            const d2 = dx * dx + dz * dz;
            if (d2 < bestD2) { bestD2 = d2; best = d; }
        }
        // Round 111 — anti-air retargeting. Defender planes ALSO count
        // as nearest-defender candidates for the OGRE main weapon. 3D
        // distance compared against the ground-defender 2D distance —
        // a plane directly overhead at altitude 24 is at 3D distance 24
        // even when XZ distance is 0, so it correctly competes with
        // ground turrets ~25u away. This is how the user's "OGRE has
        // anti-air" maps to actual firing behavior: the same turret
        // that engages tanks now retargets and elevates when a plane
        // wanders into range.
        //
        // Plane targeting uses a 3D distance comparison; defender 2D
        // distance is squared above. Compare squared distances directly
        // (planes contribute y² to the comparison).
        if (this.defenderPlanes) {
            for (const p of this.defenderPlanes) {
                if (p.hp <= 0) continue;
                const dx = p.x - this.ogre.position.x;
                const dy = p.y - this.ogre.position.y;
                const dz = p.z - this.ogre.position.z;
                const d2 = dx * dx + dy * dy + dz * dz;
                if (d2 < bestD2) { bestD2 = d2; best = p; }
            }
        }
        // Round 112 — defender subs also count. Sea-env equivalent of
        // air targeting. Subs sit at water-line so XZ distance only
        // (Y is shared with OGRE on sea variants).
        if (this.defenderSubs) {
            for (const s of this.defenderSubs) {
                if (s.hp <= 0) continue;
                const dx = s.x - this.ogre.position.x;
                const dz = s.z - this.ogre.position.z;
                const d2 = dx * dx + dz * dz;
                if (d2 < bestD2) { bestD2 = d2; best = s; }
            }
        }
        return best;
    }

    // Round 107 — nearest defender that's UNDER the OGRE chassis.
    // Used by the underside_weapon firing path: belly turret only
    // engages defenders within a small horizontal footprint AND below
    // the OGRE's Y. For flying variants this is "drove under the
    // hovering hull". For ground variants this never matches (no
    // defender survives being directly under a ground OGRE — they'd
    // be trampled), so the belly turret remains silent on those.
    //
    // Footprint radius = OGRE chassis halfWidth × scaleMul, capped by
    // maxRange. Y filter: defender.y must be < ogre.y - 2 so the
    // defender is meaningfully below, not just at the same elevation.
    _nearestDefenderUnder(maxRange = Infinity, slot = "under") {
        if (!this.ogre) return null;
        const scaleMul = (this.variant?.scale ?? 4) / 4;
        const footprint = 2.5 * scaleMul;             // OGRE chassis half-width
        const footprintSq = footprint * footprint;
        const maxRangeSq = maxRange * maxRange;
        // v1485 — under-turret gunner designation (gunner:under). Honored while alive + in range.
        const desig = (this._fireByHardpoint && this._fireByHardpoint[slot] != null) ? this._fireByHardpoint[slot] : null;
        if (desig != null) { for (const d of this.defenders) { if (d.hp <= 0 || d.entityId !== desig) continue; const dx = d.x - this.ogre.position.x, dz = d.z - this.ogre.position.z; if (dx * dx + dz * dz <= maxRangeSq) return d; break; } }
        let best = null, bestD2 = maxRangeSq;
        for (const d of this.defenders) {
            if (d.hp <= 0) continue;
            const dx = d.x - this.ogre.position.x;
            const dz = d.z - this.ogre.position.z;
            const d2 = dx * dx + dz * dz;
            if (d2 > footprintSq) continue;            // outside footprint
            if (d.y >= this.ogre.position.y - 2) continue;  // not below
            if (d2 < bestD2) { bestD2 = d2; best = d; }
        }
        return best;
    }

    _spawnPhaseBurst(phase) {
        if (!this.particles?.spawn || !this.ogre) return;
        const baseColor = phase === 3 ? [1.0, 0.3, 0.2] : [1.0, 0.7, 0.3];
        for (let n = 0; n < 36; n++) {
            const a = Math.random() * Math.PI * 2;
            const speed = 2 + Math.random() * 5;
            this.particles.spawn({
                x: this.ogre.position.x,
                y: this.ogre.position.y + 2 + Math.random() * 3,
                z: this.ogre.position.z,
                vx: Math.cos(a) * speed,
                vy: 2 + Math.random() * 4,
                vz: Math.sin(a) * speed,
                ttl: 1.0, size: 0.6,
                r: baseColor[0], g: baseColor[1], b: baseColor[2], a: 1.0,
                gravity: 8,
            });
        }
    }

    _scheduleOgreRescale() {
        if (!this.ogre || !this.router) return;
        if (this.ogre._meshEntityId == null) return;
        if (this.ogre._ogreRescaled) return;
        const baseScale = this.variant?.scale ?? 4.0;
        const bossMul = this.ogre._bossScaleMul ?? 1.0;
        // Round 43d — if entry animation is still running, start the
        // entity at near-zero scale so the tick's ease-out cubic can
        // bring it up to full size visually. Otherwise apply final scale.
        const inEntry = (this.ogre._entryT != null && this.ogre._entryT < (this.ogre._entryDur ?? 0));
        const startScale = inEntry ? 0.001 : (baseScale * bossMul);
        this.router.exec({
            type: "entity:rescale",
            id: this.ogre._meshEntityId,
            scale: startScale,
        });
        // Only block re-rescale once we're at final size
        if (!inEntry) this.ogre._ogreRescaled = true;
    }

    // -------------------------------------------------------------- localStorage (round 8)

    _highScoreKey() {
        return `ogre.highscore.v1.${this.difficulty}`;
    }

    _loadHighScores() {
        try {
            const key = this._highScoreKey();
            const raw = window?.localStorage?.getItem(key);
            if (raw) {
                const parsed = JSON.parse(raw);
                this.bestScore = +parsed.score || 0;
                this.bestWave  = +parsed.wave  || 0;
                return;
            }
        } catch {}
        this.bestScore = 0;
        this.bestWave  = 0;
    }

    _saveHighScore() {
        try {
            const key = this._highScoreKey();
            const cur = JSON.parse(window?.localStorage?.getItem(key) || "{}");
            const isBetter = (this.score > (cur.score || 0))
                || (this.score === (cur.score || 0) && this.wave > (cur.wave || 0));
            if (isBetter) {
                window?.localStorage?.setItem(key, JSON.stringify({
                    score: this.score, wave: this.wave, ts: Date.now(),
                }));
                this.bestScore = this.score;
                this.bestWave  = this.wave;
                return true;
            }
        } catch {}
        return false;
    }

    setDifficulty(d) {
        if (OGRE_DIFFICULTIES[d]) {
            this.difficulty = d;
            this._loadHighScores();
        }
    }

    // -------------------------------------------------------------- dynamic lights (round 8)
    // Called by main.js each frame to surface OGRE-scenario lights for the
    // round-48 voxel renderer point-light system. Returns up to 4 lights.

    // Round 13 — heat sources for screen-space distortion in bloomPass.
    // Returns world-space [{x,y,z,radius,strength}] entries for fires,
    // engine exhaust if engine disabled, and magnetic field if active.
    // Round 43r - exposes active defender turrets as visual instances
    // for TurretRenderer (half-dome base + tube cannon). One instance
    // per ALIVE defender; the tube yaw points at the OGRE chassis if
    // present, otherwise rests pointing along +Z toward the spawn.
    // Color varies by turret type so machine-gun / missile / railgun
    // read distinct in the field.
    getTurretInstances() {
        if (!this.active || !this.defenders) return [];
        const out = [];
        const targetX = this.ogre?.position?.x ?? 0;
        const targetZ = this.ogre?.position?.z ?? (this.arena?.layout?.ogreSpawn?.z ?? 100);

        const COLORS = {
            machinegun: { base: [0.35, 0.40, 0.45], tube: [0.75, 0.62, 0.18] },
            missile:    { base: [0.42, 0.30, 0.22], tube: [0.95, 0.45, 0.10] },
            railgun:    { base: [0.30, 0.45, 0.55], tube: [0.30, 0.85, 1.00] },
            napalm:     { base: [0.40, 0.30, 0.18], tube: [1.00, 0.45, 0.20] },
            minelayer:  { base: [0.32, 0.32, 0.36], tube: [0.85, 0.20, 0.20] },
            landmine:   { base: [0.28, 0.32, 0.22], tube: [0.40, 0.55, 0.30] },
            subturret:  { base: [0.22, 0.30, 0.30], tube: [0.45, 0.85, 0.60] },
        };
        for (const d of this.defenders) {
            if (d._sold || d.hp <= 0) continue;
            // Aim yaw: angle from defender to target in XZ plane.
            // Tube geometry is built along +X with yaw rotating around Y;
            // atan2(z, x) gives the angle from +X axis to (x,z), which is
            // exactly what the shader uses.
            const dx = targetX - d.x;
            const dz = targetZ - d.z;
            const yaw = Math.atan2(dz, dx);
            const c = COLORS[d.type] || COLORS.machinegun;
            // Round 49 — selected glow pulses with time so the highlight
            // is unmistakable but not strobing. Sin pulse 0.6..1.0.
            const t = (typeof performance !== "undefined") ? performance.now() / 1000 : 0;
            const selectedPulse = d.selected
                ? (0.6 + 0.4 * Math.sin(t * 4.5))
                : 0;
            // Visual scale tuned to read at distance; slot.y from the
            // arena is the surface Y, so the dome sits flush on terrain.
            out.push({
                x: d.x, y: d.y + 0.05, z: d.z,
                scale: 1.4,
                baseColor: c.base,
                tubeColor: c.tube,
                aimYaw: yaw,
                recoil:   d.recoilOffset || 0,    // round 49
                selected: selectedPulse,           // round 49
            });
        }
        return out;
    }

    getHeatSources() {
        if (!this.active || this.state !== "playing" || !this.ogre) return [];
        const out = [];
        // Active fire emitters
        for (const f of this.fires) {
            const intensity = Math.min(1, f.ttl / f.maxTtl);
            out.push({
                x: f.x, y: f.y + 1, z: f.z,
                radius: 3 + (f.size || 0.6) * 4,
                strength: 0.6 * intensity,
            });
            if (out.length >= 8) return out;
        }
        // Engine exhaust if engine disabled — twin sources behind OGRE
        if (this.engineDisabled) {
            const dx = this.hqPos.x - this.ogre.position.x;
            const dz = this.hqPos.z - this.ogre.position.z;
            const dist = Math.hypot(dx, dz) || 1;
            const fx = dx / dist, fz = dz / dist;
            const sideX = -fz, sideZ = fx;
            const halfW = 1.0 * (this.variant.scale / 4);
            for (const sign of [-1, +1]) {
                if (out.length >= 8) return out;
                out.push({
                    x: this.ogre.position.x - fx * 2.0 + sideX * halfW * sign,
                    y: this.ogre.position.y + 1.5,
                    z: this.ogre.position.z - fz * 2.0 + sideZ * halfW * sign,
                    radius: 3.5,
                    strength: 0.85,
                });
            }
        }
        // Magnetic pulse — heavy distortion around OGRE during pulse
        if (this.variant?.special === "magnetic" && this.magneticActive) {
            if (out.length < 8) {
                out.push({
                    x: this.ogre.position.x,
                    y: this.ogre.position.y + 2,
                    z: this.ogre.position.z,
                    radius: 7, strength: 0.7,
                });
            }
        }
        return out;
    }

    getDynamicLights() {
        if (!this.active || this.state !== "playing" || !this.ogre) return [];
        const out = [];
        const dx = this.hqPos.x - this.ogre.position.x;
        const dz = this.hqPos.z - this.ogre.position.z;
        const dist = Math.hypot(dx, dz) || 1;
        const fx = dx / dist, fz = dz / dist;
        const bx = this.ogre.position.x;
        const by = this.ogre.position.y;
        const bz = this.ogre.position.z;

        if (this.variant.special === "spotlights") {
            // Twin warm spotlights ahead of the OGRE, slight oscillation
            const sweep = Math.sin(performance.now() * 0.0008) * 0.35;
            for (const off of [-0.25 + sweep, 0.25 + sweep]) {
                const ax = Math.sin(Math.atan2(fx, fz) + off);
                const az = Math.cos(Math.atan2(fx, fz) + off);
                out.push({
                    x: bx + ax * 8, y: by + 1, z: bz + az * 8,
                    r: 1.5, g: 1.4, b: 0.9,
                    range: 14,
                });
            }
        } else if (this.variant.special === "scanners") {
            // Single cyan beam ahead, sweeps forward arc
            const sweep = Math.sin(performance.now() * 0.0014) * 0.7;
            const ax = Math.sin(Math.atan2(fx, fz) + sweep);
            const az = Math.cos(Math.atan2(fx, fz) + sweep);
            out.push({
                x: bx + ax * 12, y: by + 2, z: bz + az * 12,
                r: 0.4, g: 1.4, b: 1.6,
                range: 10,
            });
        } else if (this.variant.special === "magnetic" && this.magneticActive) {
            // Blue magnetic sphere
            out.push({
                x: bx, y: by + 2, z: bz,
                r: 0.4, g: 0.6, b: 1.6,
                range: 10,
            });
        } else if (this.variant.special === "aegis" && this.shieldHp > 0) {
            // Soft blue ring light
            out.push({
                x: bx, y: by + 2, z: bz,
                r: 0.3, g: 0.6, b: 1.4,
                range: 8,
            });
        }
        return out;
    }

    // -------------------------------------------------------------- status

    // Round 126 — public accessors for cross-system queries. Used by
    // KaijuManager when civs summon hellspawn kaiju that target the
    // OGRE: the kaiju needs to know where the OGRE is and how to
    // damage it. Returns null when no OGRE is active so callers can
    // gate their logic cleanly.
    getOgreState() {
        if (!this.active || !this.ogreActive) return null;
        return {
            x: this.ogreX,
            y: this.ogreY,
            z: this.ogreZ,
            hp: this.ogreHp,
            maxHp: this.ogreMaxHp,
            wave: this.wave,
        };
    }

    // Round 126 — applies damage to the OGRE chassis. Returns the new
    // hp value. Mirrors the internal damage paths used by
    // defender plane projectiles / kamikaze drones / civ counter-
    // projectiles. Caller may pass an optional source descriptor for
    // future analytics (e.g. tracking "kaiju kills" vs "player kills").
    applyOgreDamage(amount, source = null) {
        if (!this.active || !this.ogreActive) return 0;
        if (typeof this.ogreHp !== "number") return 0;
        const dmg = Math.max(0, amount);
        this.ogreHp = Math.max(0, this.ogreHp - dmg);
        // v1483 — combat damage also degrades the sensor array, so a shot-up OGRE
        // progressively loses sight (shorter target range + fewer defenders visible to
        // the crew). The engineer seat repairs it back up.
        if (this.sensors) this.sensors.hp = Math.max(0, this.sensors.hp - dmg * 0.08);
        // Round 131 — multiplayer shared HP. Mirror local damage into
        // the server-side pool. Solo: no behavior change (we're the
        // only contributor). Multiplayer: combined damage from all
        // players tallies into the shared pool; HUD reads it back via
        // the ogre:state subscription.
        // NOTE: round 35 known limitation — only damage routed through
        // this method counts toward the shared pool. Other direct
        // mutations of this.ogreHp (kamikaze drone, drain, breach)
        // bypass the server pool and stay local-only. Routing every
        // damage source through here is a round 36 cleanup.
        if (this.bridge?.emit && dmg > 0) {
            this.bridge.emit("ogre:damage", {
                amount: dmg,
                sourceKind: source?.kind || null,
                sourceName: source?.name || null,
            });
        }
        // Particle FX so the player sees the hit even when the kaiju
        // is far from camera
        if (this.particles?.spawn && dmg > 0.1) {
            for (let n = 0; n < 8; n++) {
                const a = Math.random() * Math.PI * 2;
                this.particles.spawn({
                    x: this.ogreX + Math.cos(a) * 1.2,
                    y: this.ogreY + 1.5 + Math.random() * 1.5,
                    z: this.ogreZ + Math.sin(a) * 1.2,
                    vx: Math.cos(a) * 2,
                    vy: 1 + Math.random() * 2,
                    vz: Math.sin(a) * 2,
                    ttl: 0.5, size: 0.45,
                    r: 1.0, g: 0.5, b: 0.2, a: 1.0,
                    gravity: 4,
                });
            }
        }
        return this.ogreHp;
    }

    // Round 131 — team-kill toast. Server emits ogre:killed when the
    // shared HP pool hits zero, with a contributor breakdown sorted
    // by damage. Show a brief overlay so players see who landed the
    // killing blow + relative damage share. Solo: still fires, with
    // just one contributor (you) — harmless visual flourish.
    _announceTeamKill(msg) {
        if (typeof document === "undefined") return;
        const root = document.createElement("div");
        Object.assign(root.style, {
            position: "fixed",
            top: "30%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            background: "linear-gradient(180deg, rgba(20, 5, 5, 0.95), rgba(60, 20, 5, 0.95))",
            border: "2px solid #ff8a3c",
            borderRadius: "8px",
            padding: "16px 28px",
            fontFamily: "monospace",
            color: "#fff",
            zIndex: "1500",
            textAlign: "center",
            boxShadow: "0 0 40px rgba(255, 138, 60, 0.6)",
        });
        const title = document.createElement("div");
        title.textContent = `OGRE DOWN — wave ${msg.wave}`;
        Object.assign(title.style, {
            fontSize: "20px",
            fontWeight: "bold",
            color: "#ff8a3c",
            marginBottom: "10px",
            letterSpacing: "2px",
        });
        root.appendChild(title);
        const total = (msg.contributors || []).reduce((s, c) => s + (c.damage || 0), 0) || 1;
        for (const c of (msg.contributors || []).slice(0, 4)) {
            const line = document.createElement("div");
            const pct = Math.round((c.damage / total) * 100);
            line.textContent = `${c.playerId.slice(0, 10)} — ${Math.round(c.damage)} dmg (${pct}%)`;
            line.style.cssText = "font-size: 12px; margin: 2px 0;";
            root.appendChild(line);
        }
        document.body.appendChild(root);
        setTimeout(() => root.style.opacity = "0", 3000);
        setTimeout(() => root.remove(), 4000);
    }

    getStatus() {
        if (!this.active) return null;
        const status = {
            state: this.state,
            elapsedSec: ((this.endTime || performance.now() / 1000) - this.startTime),
            defendersAlive: this.defenders.filter(d => d.hp > 0).length,
            defendersTotal: this.defenders.length,
            hasSelection: !!this.selectedDefender,
            energy: this.energy,
            // Round 57 - soft max for the energy gauge. Energy can exceed
            // this in late waves; gauge clamps at the top in that case.
            // 200 is "comfortable economy" — enough for ~5 average buys.
            energyMax: 200,
            energyReserve: 25,    // red zone threshold (below cheapest buy)
            pendingBuy: !!this.pendingBuySlot,
            phase: this.phase,
            activeProjectiles: this.projectiles.length,
            // Round 5 — wave + variant + score + minions + HQ HP
            wave: this.wave,
            score: this.score,
            variantName: this.variant?.name ?? "",
            variantDesc: this.variant?.desc ?? "",
            variantSpecial: this.variant?.special ?? null,
            // Round 43r - current round env (cycled per wave)
            envName: this._currentEnvName ?? "earth",
            minionCount: this.minions.length,
            droneCount: this.drones.length,
            shieldHp: this.shieldHp,
            shieldMaxHp: this.shieldMaxHp,
            hqHp: this.hqHp,
            hqMaxHp: this.hqMaxHp,
            // Round 8
            difficulty: this.difficulty,
            difficultyName: OGRE_DIFFICULTIES[this.difficulty]?.name ?? "Normal",
            difficultyColor: OGRE_DIFFICULTIES[this.difficulty]?.color ?? "#ffd884",
            cloaked: this.cloaked,
            magneticActive: this.magneticActive,
            bestScore: this.bestScore,
            bestWave: this.bestWave,
            // Round 9
            weaponDisabled: this.weaponDisabled,
            engineDisabled: this.engineDisabled,
            specialDisabled: this.specialDisabled,
            sensorDisabled: this.sensorDisabled,
            canAffordAirDrop: this.canAffordAirDrop?.() ?? false,
            airDropCost: AIR_DROP_COST_SCORE,
            // Round 10
            isBossWave: this.isBossWave,
            paused: this.paused,
            shardCount: this.shards.length,
            didSplit: this._didSplit,
            hardpoints: Object.keys(this.hardpoints).map(k => {
                const h = this.hardpoints[k];
                return {
                    key: k,
                    label: h.def.label,
                    hp: h.hp,
                    maxHp: h.maxHp,
                    destroyed: h.destroyed,
                };
            }),
            intermissionRemaining: this.state === "intermission"
                ? Math.max(0, this.intermissionUntil - performance.now() / 1000)
                : 0,
        };
        if (this.state === "intermission") {
            // surface still
        }
        if (this.ogre && this.state === "playing") {
            const dx = this.hqPos.x - this.ogre.position.x;
            const dz = this.hqPos.z - this.ogre.position.z;
            status.ogreDistance = Math.hypot(dx, dz);
            status.ogreHpFrac = Math.max(0, this.ogreHp / this.ogreMaxHp);
            status.ogreHp = Math.max(0, this.ogreHp);
            status.ogreMaxHp = this.ogreMaxHp;
        }
        if (this.selectedDefender) {
            const sel = this.selectedDefender;
            status.selectedType = sel.type;
            // Round 48 - surface sell refund + repair cost so the OgreHUD
            // sell/repair buttons can show live previews and enable/disable
            // based on affordability. The HUD doesn't import simulation
            // constants directly - it just reads these values.
            const selTt = TURRET_TYPES[sel.type];
            if (selTt) {
                status.selectedRefund = Math.round(selTt.cost * SELL_REFUND_RATIO);
                const missing = Math.max(0, (sel.maxHp ?? 0) - (sel.hp ?? 0));
                const fullCost = Math.round(missing * REPAIR_COST_PER_HP);
                const affordableHp = Math.floor(this.energy / REPAIR_COST_PER_HP);
                const willRestore = Math.min(missing, affordableHp);
                status.selectedRepairCost = Math.round(willRestore * REPAIR_COST_PER_HP);
                status.selectedRepairFullCost = fullCost;
                status.selectedRepairHp = willRestore;
                status.selectedNeedsRepair = missing > 0;
                status.selectedHp = sel.hp;
                status.selectedMaxHp = sel.maxHp;
                status.canSell = sel.hp > 0;     // dead-defenders can't be sold (despawn auto)
                status.canRepair = missing > 0 && willRestore > 0;
            }
        }
        return status;
    }

    getDefenders() { return this.defenders; }
    getSlots()     { return this.slots; }
    getHqPos()     { return this.hqPos; }
    getPendingBuySlot() { return this.pendingBuySlot; }

    // ============================================================
    // Round 30 — POV camera cycling. Lock camera to a unit, see what
    // it sees, hear what it hears, watch its aim track.
    // ============================================================
    povStart() {
        if (!this.camera) {
            console.warn("[POV] no camera reference");
            return;
        }
        this._povBuildTargets();
        if (this.povTargets.length === 0) {
            console.warn("[POV] no live targets — start a wave first");
            return;
        }
        this.povTargetIndex = 0;
        this.povActive = true;
        // Save camera state once for restoration on stop
        this._savedCameraState = {
            x: this.camera.position.x,
            y: this.camera.position.y,
            z: this.camera.position.z,
            yaw: this.camera.yaw,
            pitch: this.camera.pitch,
        };
        console.log(`[POV] entered — ${this.povTargets[0].label}`);
    }

    povNext() {
        if (!this.povActive) { this.povStart(); return; }
        this._povBuildTargets();
        if (this.povTargets.length === 0) { this.povStop(); return; }
        this.povTargetIndex = (this.povTargetIndex + 1) % this.povTargets.length;
        console.log(`[POV] ${this.povTargets[this.povTargetIndex].label}`);
    }

    povPrev() {
        if (!this.povActive) { this.povStart(); return; }
        this._povBuildTargets();
        if (this.povTargets.length === 0) { this.povStop(); return; }
        this.povTargetIndex = (this.povTargetIndex - 1 + this.povTargets.length) % this.povTargets.length;
        console.log(`[POV] ${this.povTargets[this.povTargetIndex].label}`);
    }

    povStop() {
        if (!this.povActive) return;
        this.povActive = false;
        this._povHideImpactMarker();   // round 32
        if (this._savedCameraState && this.camera) {
            this.camera.position.x = this._savedCameraState.x;
            this.camera.position.y = this._savedCameraState.y;
            this.camera.position.z = this._savedCameraState.z;
            this.camera.yaw   = this._savedCameraState.yaw;
            this.camera.pitch = this._savedCameraState.pitch;
            this._savedCameraState = null;
        }
        console.log("[POV] exited");
    }

    povToggleFreeLook() {
        this.povFreeLook = !this.povFreeLook;
        console.log(`[POV] freeLook = ${this.povFreeLook}`);
    }

    _povBuildTargets() {
        const list = [];
        // OGRE turret view first
        if (this.ogre) {
            list.push({
                kind: "ogre",
                label: `OGRE ${this.variant?.name ?? ""}`,
                getPos: () => {
                    const sm = (this.variant?.scale ?? 4) / 4;
                    // Sit inside the turret, slightly forward of the breech
                    const cy = Math.cos(this._aimYaw ?? 0);
                    const sy = Math.sin(this._aimYaw ?? 0);
                    const lx = 0, lz = 0.5 * sm;
                    return {
                        x: this.ogre.position.x + lx * cy + lz * sy,
                        y: this.ogre.position.y + 4.2 * sm,
                        z: this.ogre.position.z + (-lx * sy + lz * cy),
                    };
                },
                getYaw: () => this._aimYaw ?? 0,
                setYaw: (y) => { this._aimYaw = y; this._aimYawLocked = true; },
            });
            // Round 30 — also offer 3rd-person OGRE chase cam
            list.push({
                kind: "ogre_chase",
                label: `OGRE chase cam`,
                getPos: () => {
                    const sm = (this.variant?.scale ?? 4) / 4;
                    const cy = Math.cos(this._chassisYaw ?? 0);
                    const sy = Math.sin(this._chassisYaw ?? 0);
                    const lz = -8 * sm;          // behind chassis
                    return {
                        x: this.ogre.position.x + lz * sy,
                        y: this.ogre.position.y + 6 * sm,
                        z: this.ogre.position.z + lz * cy,
                    };
                },
                getYaw: () => this._chassisYaw ?? 0,
            });
        }
        // Each living defender
        for (const d of this.defenders) {
            if (d.hp <= 0) continue;
            const dRef = d;
            list.push({
                kind: "defender",
                label: `${TURRET_TYPES[d.type]?.name ?? d.type} defender`,
                getPos: () => ({ x: dRef.x, y: dRef.y + 1.6, z: dRef.z }),
                getYaw: () => dRef.aimYaw ?? 0,
                setYaw: (y) => { dRef.aimYaw = y; dRef._aimLocked = true; },
                _ref: dRef,
            });
        }
        this.povTargets = list;
    }

    _povTick() {
        if (!this.povActive || !this.camera) return;
        // Refresh target list periodically (units can die mid-POV)
        this._povRefreshT = (this._povRefreshT ?? 0) + 1;
        if (this._povRefreshT > 30) {
            this._povRefreshT = 0;
            const curLabel = this.povTargets[this.povTargetIndex]?.label;
            this._povBuildTargets();
            if (this.povTargets.length === 0) { this.povStop(); return; }
            const newIdx = this.povTargets.findIndex(t => t.label === curLabel);
            this.povTargetIndex = newIdx >= 0
                ? newIdx
                : Math.min(this.povTargetIndex, this.povTargets.length - 1);
        }
        const tgt = this.povTargets[this.povTargetIndex];
        if (!tgt) return;
        const pos = tgt.getPos();
        this.camera.position.x = pos.x;
        this.camera.position.y = pos.y;
        this.camera.position.z = pos.z;
        // Round 31 — yaw convention conversion. Game units use yaw=0 → +Z;
        // camera uses yaw=0 → -Z. Mapping is camYaw = π − unitYaw.
        if (this.povInControl) {
            // Player drives the unit. Push camera yaw INTO unit aim.
            const unitYaw = Math.PI - this.camera.yaw;
            if (tgt.setYaw) tgt.setYaw(unitYaw);
        } else if (!this.povFreeLook) {
            // View-only: camera yaw = π − unit yaw to face same direction
            this.camera.yaw = Math.PI - tgt.getYaw();
            this.camera.pitch *= 0.85;
        }
        // Round 32 — predicted impact reticle. Active in control mode only.
        this._povUpdateImpactMarker(tgt);
    }

    _povUpdateImpactMarker(tgt) {
        if (!this.povInControl || !this.router) {
            this._povHideImpactMarker();
            return;
        }
        // Determine projectile params for current target's weapon
        let projSpeed = 0, ballistic = false;
        if (tgt.kind === "ogre" && this.variant?.weapon) {
            const w = this.variant.weapon;
            projSpeed = w.projSpeed ?? 0;
            ballistic = (w.type === "artillery");
        } else if (tgt.kind === "defender" && tgt._ref) {
            const tt = TURRET_TYPES[tgt._ref.type];
            if (tt) {
                projSpeed = tt.projSpeed ?? 0;
                ballistic = (tt.special === "napalm");
            }
        } else {
            this._povHideImpactMarker();
            return;
        }
        if (projSpeed <= 0) { this._povHideImpactMarker(); return; }

        // Simulate trajectory from camera position along camera forward.
        // Step in 0.05s increments up to 6s — find first ground intersection.
        const cy = Math.cos(this.camera.yaw), sy = Math.sin(this.camera.yaw);
        const cp = Math.cos(this.camera.pitch), sp = Math.sin(this.camera.pitch);
        const fwdX = sy * cp;
        const fwdY = sp;
        const fwdZ = -cy * cp;
        const startX = this.camera.position.x;
        const startY = this.camera.position.y;
        const startZ = this.camera.position.z;
        let vx = fwdX * projSpeed;
        let vy = fwdY * projSpeed;
        let vz = fwdZ * projSpeed;
        const G = 18;
        let px = startX, py = startY, pz = startZ;
        let hitX = px, hitY = py, hitZ = pz, hit = false;
        const dt = 0.05;
        for (let step = 0; step < 120; step++) {
            const npx = px + vx * dt;
            const npy = py + vy * dt;
            const npz = pz + vz * dt;
            if (ballistic) vy -= G * dt;
            const groundY = this._surfaceY(npx, npz);
            if (npy <= groundY + 0.05) {
                // Linear interp between last frame and this for landing
                const tFrac = (py - groundY) / Math.max(0.001, py - npy);
                hitX = px + (npx - px) * tFrac;
                hitY = groundY;
                hitZ = pz + (npz - pz) * tFrac;
                hit = true;
                break;
            }
            px = npx; py = npy; pz = npz;
        }
        if (!hit) { this._povHideImpactMarker(); return; }
        // Spawn or update marker entity
        if (this._povImpactMarkerId == null) {
            const r = this.router.exec({
                type: "entity:spawnMesh",
                assetId: "impact_reticle",
                kind: "impact_reticle",
                x: hitX, y: hitY, z: hitZ,
                scale: 0.7,
            });
            this._povImpactMarkerId = r?.id ?? null;
        } else {
            this.router.exec({
                type: "entity:move",
                id: this._povImpactMarkerId,
                x: hitX, y: hitY + 0.3, z: hitZ,
                yaw: 0, tiltX: 0,
            });
        }
    }

    _povHideImpactMarker() {
        if (this._povImpactMarkerId != null && this.router) {
            this.router.exec({ type: "entity:despawn", id: this._povImpactMarkerId });
            this._povImpactMarkerId = null;
        }
    }

    // Round 31 (phase 2) — click-to-fire from POV. Camera forward is
    // (sin(yaw)cos(pitch), sin(pitch), −cos(yaw)cos(pitch)). Synthetic
    // target placed 50u along that vector, fed to existing fire path.
    povTryFire() {
        if (!this.povActive || !this.povInControl) return;
        const t = performance.now() * 0.001;
        if (t - this._povLastFireT < 0.25) return;    // global rate cap
        const tgt = this.povTargets[this.povTargetIndex];
        if (!tgt || !tgt.kind) return;
        // Camera forward
        const cy = Math.cos(this.camera.yaw), sy = Math.sin(this.camera.yaw);
        const cp = Math.cos(this.camera.pitch), sp = Math.sin(this.camera.pitch);
        const fwdX = sy * cp;
        const fwdY = sp;
        const fwdZ = -cy * cp;
        const cp2 = this.camera.position;
        const fakeTarget = {
            x: cp2.x + fwdX * 50,
            y: cp2.y + fwdY * 50,
            z: cp2.z + fwdZ * 50,
        };
        if (tgt.kind === "ogre" && this.ogre) {
            const w = this.variant?.weapon;
            if (!w) return;
            const wScaled = { ...w, damage: w.damage * (OGRE_DIFFICULTIES[this.difficulty]?.ogreDmgMul ?? 1) };
            if (w.type === "plasma") {
                this._launchOgreProjectile(fakeTarget, wScaled, 0);
                this._sfxAt("ogre_plasma_fire", this.ogre.position.x, this.ogre.position.y, this.ogre.position.z);
            } else if (w.type === "laser") {
                this._fireOgreLaser(fakeTarget, wScaled);
                this._sfxAt("ogre_laser_fire", this.ogre.position.x, this.ogre.position.y, this.ogre.position.z);
            } else if (w.type === "artillery") {
                this._launchOgreArtillery(fakeTarget, wScaled, 0);
                this._sfxAt("ogre_artillery_fire", this.ogre.position.x, this.ogre.position.y, this.ogre.position.z);
            }
            this.triggerCannonRecoil();
            this._povLastFireT = t;
        } else if (tgt.kind === "defender" && tgt._ref) {
            const d = tgt._ref;
            if (d.hp <= 0) return;
            const tt = TURRET_TYPES[d.type];
            if (!tt) return;
            this._launchProjectile(d, fakeTarget, tt);
            d.lastFireT = t;
            const fireKey = d.type === "missile" ? "ogre_missile_fire"
                          : d.type === "railgun" ? "ogre_railgun_fire"
                          : d.type === "napalm"  ? "ogre_artillery_fire"
                          : "ogre_mg_fire";
            this._sfxAt(fireKey, d.x, d.y, d.z);
            this._povLastFireT = t;
        }
    }

    povToggleControl() {
        if (!this.povActive) { this.povStart(); }
        this.povInControl = !this.povInControl;
        console.log(`[POV] control = ${this.povInControl ? "ON (mouse aim, click to fire)" : "off"}`);
    }

    // -------------------------------------------------------------- helpers

    // Round 43d — visual smoke burst at the OGRE entry point. Renamed
    // from "breach" in v2 since the arena no longer paints a wall to
    // break through; this is just the materialization puff.
    // Round 88 — OGRE self-detonation when stuck. Triggered by stuck-
    // timer in main tick loop. Multi-stage particle blast: white flash,
    // expanding shockwave ring, mushroom-style rising plume, then dies.
    // Damages every defender within 2-3× chassis scale, with falloff.
    _triggerOgreNuke() {
        if (!this.ogre || this._ogreNuking) return;
        this._ogreNuking = true;
        const ox = this.ogre.position.x;
        const oy = this.ogre.position.y;
        const oz = this.ogre.position.z;
        const scale = this.variant?.scale ?? 4;
        const radius = scale * 2.5;            // user said 2-3× OGRE size
        const innerR = scale * 0.8;            // full-damage zone
        const ringR  = scale * 1.6;
        const am = (typeof window !== "undefined") ? window.audioManager : null;
        am?.announce?.("OGRE self-destructing.");
        console.log(`[OGRE] stuck — self-detonating at (${ox|0},${oy|0},${oz|0}) radius=${radius.toFixed(1)}`);

        // Stage 1 — instant flash + first shell of high-velocity particles
        if (this.particles?.spawn) {
            for (let n = 0; n < 180; n++) {
                const phi = Math.random() * Math.PI * 2;
                const cos = Math.cos(phi), sin = Math.sin(phi);
                const upBias = Math.random() * 0.7 + 0.3;
                const spd = 14 + Math.random() * 12;
                this.particles.spawn({
                    x: ox, y: oy + 2, z: oz,
                    vx: cos * spd,
                    vy: upBias * spd * 0.7,
                    vz: sin * spd,
                    ttl: 1.4 + Math.random() * 0.8,
                    size: 0.55 + Math.random() * 0.4,
                    r: 1.0, g: 0.95, b: 0.65, a: 1.0,
                    gravity: 4,
                });
            }
            // Bright white core flash — handful of fat slow particles
            for (let n = 0; n < 30; n++) {
                this.particles.spawn({
                    x: ox + (Math.random() - 0.5) * scale,
                    y: oy + 1 + Math.random() * scale,
                    z: oz + (Math.random() - 0.5) * scale,
                    vx: 0, vy: 1.2, vz: 0,
                    ttl: 0.7, size: scale * 0.6,
                    r: 1.0, g: 1.0, b: 0.9, a: 0.95,
                });
            }
        }

        // Stage 2 — shockwave ring (deferred 0.25s for sequencing)
        setTimeout(() => {
            if (!this.particles?.spawn) return;
            for (let n = 0; n < 240; n++) {
                const phi = (n / 240) * Math.PI * 2;
                const wobble = (Math.random() - 0.5) * 0.4;
                const cos = Math.cos(phi + wobble), sin = Math.sin(phi + wobble);
                const spd = 18 + Math.random() * 4;
                this.particles.spawn({
                    x: ox, y: oy + 0.6, z: oz,
                    vx: cos * spd,
                    vy: 0.2 + Math.random() * 0.4,
                    vz: sin * spd,
                    ttl: 1.6,
                    size: 0.5,
                    r: 0.9, g: 0.55, b: 0.25, a: 0.95,
                    gravity: 1.5,
                });
            }
        }, 250);

        // Stage 3 — rising plume (mushroom stem + cap)
        setTimeout(() => {
            if (!this.particles?.spawn) return;
            for (let n = 0; n < 140; n++) {
                const phi = Math.random() * Math.PI * 2;
                const r = Math.random() * scale * 0.5;
                this.particles.spawn({
                    x: ox + Math.cos(phi) * r,
                    y: oy + 1,
                    z: oz + Math.sin(phi) * r,
                    vx: Math.cos(phi) * 0.4,
                    vy: 8 + Math.random() * 6,
                    vz: Math.sin(phi) * 0.4,
                    ttl: 3.0, size: 1.2,
                    r: 0.35 + Math.random() * 0.3,
                    g: 0.30 + Math.random() * 0.2,
                    b: 0.32 + Math.random() * 0.2,
                    a: 0.85,
                    gravity: -1.5,           // negative = floats up
                });
            }
            // Mushroom cap — burst of slow rolling particles ~14u up
            for (let n = 0; n < 90; n++) {
                const phi = Math.random() * Math.PI * 2;
                const r = scale * (0.8 + Math.random() * 0.6);
                this.particles.spawn({
                    x: ox + Math.cos(phi) * r,
                    y: oy + 14 + Math.random() * 4,
                    z: oz + Math.sin(phi) * r,
                    vx: Math.cos(phi) * (0.8 + Math.random()),
                    vy: 0.5,
                    vz: Math.sin(phi) * (0.8 + Math.random()),
                    ttl: 2.5, size: 1.4,
                    r: 0.45, g: 0.40, b: 0.40, a: 0.75,
                    gravity: -0.8,
                });
            }
        }, 750);

        // Damage every defender within radius (falloff: 100% inside
        // innerR, linear to 0 at radius). Keep this synchronous so
        // gameplay state updates this tick.
        if (Array.isArray(this.defenders)) {
            for (const d of this.defenders) {
                if (!d || d.hp <= 0) continue;
                const ddx = d.x - ox, ddz = d.z - oz;
                const r2 = Math.hypot(ddx, ddz);
                if (r2 > radius) continue;
                let dmg;
                if (r2 <= innerR) {
                    dmg = d.hpMax ?? 999;            // obliterate inside core
                } else {
                    const t = (radius - r2) / (radius - innerR);
                    dmg = (d.hpMax ?? 100) * Math.max(0, Math.min(1, t));
                }
                d.hp = Math.max(0, d.hp - dmg);
            }
        }

        // Kill the OGRE — drops HP to 0 so the normal wave-clear path
        // handles cleanup, score, and intermission timing.
        this.ogreHp = 0;
        if (this.ogre) this.ogre.hp = 0;
    }

    _spawnBreachEffect() {
        if (!this.particles?.spawn || !this.arena?.layout) return;
        const sp = this.arena.layout.ogreSpawn;
        const gy = this._surfaceY(sp.x, sp.z);
        // Dust ring + dark smoke cloud
        for (let i = 0; i < 60; i++) {
            const a = Math.random() * Math.PI * 2;
            const r = 4 + Math.random() * 8;
            const px = sp.x + Math.cos(a) * r;
            const pz = sp.z + Math.sin(a) * r;
            const py = gy + 1 + Math.random() * 4;
            this.particles.spawn({
                x: px, y: py, z: pz,
                vx: -Math.cos(a) * 0.5, vy: 0.8 + Math.random() * 1.4, vz: -Math.sin(a) * 0.5,
                r: 0.45 + Math.random() * 0.25,
                g: 0.35 + Math.random() * 0.25,
                b: 0.30 + Math.random() * 0.20,
                size: 0.7 + Math.random() * 0.8,
                ttl: 1.6 + Math.random() * 0.8,
                gravity: -0.15,
            });
        }
        // Bright orange flash particles at the moment of materialization
        for (let i = 0; i < 20; i++) {
            const a = Math.random() * Math.PI * 2;
            this.particles.spawn({
                x: sp.x, y: gy + 3, z: sp.z,
                vx: Math.cos(a) * 6, vy: 1 + Math.random() * 2, vz: Math.sin(a) * 6,
                r: 1.0, g: 0.6, b: 0.2,
                size: 0.6, ttl: 0.7,
                gravity: 0.1,
            });
        }
    }

    _surfaceY(x, z) {
        const xi = Math.floor(x), zi = Math.floor(z);
        for (let y = 80; y > 0; y--) {
            const v = this.world.getVoxel?.(xi, y, zi);
            if (v != null && v !== 0 && v !== 10 && v !== 11) return y + 1;
        }
        return 30;
    }

    // Round 27 — environment system. Switches sky colors, fog, particle
    // gravity, and surface palette per "earth" | "moon" | "mars". Saved
    // defaults restored on stop().
    // Round 43l - cycle environment + regen terrain + rebuild arena
    // for each new round. Variants that REQUIRE a specific env (sea
    // for sub/carrier) override the default cycle. Defenders are NOT
    // despawned — they carry over between rounds.
    //
    // Round 87 — only regen terrain on CYCLE boundary, not every
    // wave. User wants successive waves to come over the same world;
    // a level (full pass through WAVE_ORDER) resets the world. The
    // env still cycles every wave so each round feels different, but
    // the terrain doesn't shuffle every 20 seconds.
    _cycleEnvForRound() {
        // Round 48 - hell tier wired up. Cycle order: earth -> sea ->
        // moon -> mars -> hell, then repeats. Variants that REQUIRE a
        // specific env (sub mk10 -> sea) still override this default.
        const DEFAULT_CYCLE = ["earth", "sea", "moon", "mars", "hell"];
        let next = DEFAULT_CYCLE[this.wave % DEFAULT_CYCLE.length];
        // Apply the chosen environment (always)
        this._applyEnvironment(next);
        this._currentEnvName = next;

        // Round 209 — in themed mode, every wave is its own level:
        // fresh terrain, fresh arena, every time. Otherwise the legacy
        // behavior holds (terrain preserved within a 9-wave campaign,
        // regen only when wrapping the full WAVE_ORDER cycle).
        const cycleNow = Math.floor((this.wave - 1) / WAVE_ORDER.length);
        const cycleChanged = (this._lastTerrainCycle !== cycleNow);
        const shouldRegen = this._themedWaves || cycleChanged;
        if (shouldRegen) {
            this._lastTerrainCycle = cycleNow;
            // Round 89 — tornado wipe between cycles. Visual transition:
            // three twisters vacuum the field, spitting voxels into a
            // spinning column with lightning + sparks, then dissipate.
            // Particle-only — no terrain mutation here, the regen call
            // below replaces the world wholesale a moment later.
            this._spawnCycleTornadoes();
            // Regen terrain — flush voxel edits from previous level
            if (this.world?.regenerate) {
                this.world.regenerate();
            }
            // Place the city structures atop the new terrain
            if (this.arena?.build) {
                this.arena.build(next === "sea" ? "sea" : "land");
            }
            const tag = this._themedWaves ? "themed wave" : `level transition (cycle ${cycleNow})`;
            console.log(`[OGRE] ${tag}: env=${next}, terrain regen, arena rebuilt`);
        } else {
            console.log(`[OGRE] wave ${this.wave}: env=${next} (terrain preserved within level)`);
        }
    }

    // Round 89 — tornado vortex animation for cycle-boundary world wipe.
    // Three twisters at offset positions around the HQ; each spawns a
    // tight spinning column of debris that picks up speed, with periodic
    // lightning crackles and tiny firework bursts. ~3s total effect; the
    // actual terrain regen happens immediately so the new world appears
    // through the dissipating swirl.
    _spawnCycleTornadoes() {
        if (!this.particles?.spawn) return;
        const cx = this.hqPos?.x ?? 0;
        const cz = this.hqPos?.z ?? 0;
        const am = (typeof window !== "undefined") ? window.audioManager : null;
        am?.announce?.("Level cleared. New world incoming.");
        // Three tornado centers offset around the arena
        const towers = [
            { x: cx,        z: cz - 20 },
            { x: cx - 30,   z: cz + 15 },
            { x: cx + 35,   z: cz + 10 },
        ];
        for (const t of towers) {
            this._spawnOneTornado(t.x, t.z);
        }
    }

    _spawnOneTornado(cx, cz) {
        if (!this.particles?.spawn) return;
        const groundY = this._surfaceY(cx, cz);
        // Stage 1: vacuum-suck shells. 5 quick bursts of debris flying
        // INWARD from the perimeter toward the column, simulating the
        // world being pulled into the vortex.
        for (let s = 0; s < 5; s++) {
            setTimeout(() => {
                if (!this.particles?.spawn) return;
                const R = 18 - s * 1.5;
                for (let n = 0; n < 60; n++) {
                    const a = Math.random() * Math.PI * 2;
                    const px = cx + Math.cos(a) * R;
                    const pz = cz + Math.sin(a) * R;
                    const py = groundY + 0.5 + Math.random() * 2;
                    // Velocity: inward + slight up
                    const vx = -Math.cos(a) * (14 + Math.random() * 6);
                    const vz = -Math.sin(a) * (14 + Math.random() * 6);
                    const vy = 3 + Math.random() * 5;
                    this.particles.spawn({
                        x: px, y: py, z: pz,
                        vx, vy, vz,
                        ttl: 1.4,
                        size: 0.55 + Math.random() * 0.4,
                        r: 0.55 + Math.random() * 0.25,
                        g: 0.45 + Math.random() * 0.20,
                        b: 0.40 + Math.random() * 0.15,
                        a: 0.95,
                        gravity: -3,    // negative = rises into vortex
                    });
                }
            }, s * 220);
        }

        // Stage 2: swirling column of fast tangential particles. Span
        // ~3 seconds, particles spawn at low radius rotating around the
        // column axis at increasing height.
        for (let n = 0; n < 220; n++) {
            const angle = Math.random() * Math.PI * 2;
            const radius = 1.5 + Math.random() * 4;
            const height = Math.random() * 22;
            // Tangential velocity for swirl
            const tangentSpeed = 14 + Math.random() * 6;
            const tx = -Math.sin(angle) * tangentSpeed;
            const tz =  Math.cos(angle) * tangentSpeed;
            setTimeout(() => {
                if (!this.particles?.spawn) return;
                this.particles.spawn({
                    x: cx + Math.cos(angle) * radius,
                    y: groundY + height,
                    z: cz + Math.sin(angle) * radius,
                    vx: tx + (Math.random() - 0.5) * 2,
                    vy: 2 + Math.random() * 3,    // slight upward drift
                    vz: tz + (Math.random() - 0.5) * 2,
                    ttl: 1.8,
                    size: 0.5,
                    r: 0.40, g: 0.38, b: 0.36, a: 0.82,
                    gravity: -1,                  // floats up in vortex
                });
            }, Math.random() * 1500);
        }

        // Stage 3: periodic lightning crackles + firework bursts at
        // random points along the column.
        const lightningTimes = [400, 900, 1400, 1900];
        for (const ms of lightningTimes) {
            setTimeout(() => {
                if (!this.particles?.spawn) return;
                // Lightning streak — vertical line of bright cyan-white
                // particles along the column
                const ly = groundY;
                for (let k = 0; k < 24; k++) {
                    this.particles.spawn({
                        x: cx + (Math.random() - 0.5) * 0.8,
                        y: ly + k * 0.9,
                        z: cz + (Math.random() - 0.5) * 0.8,
                        vx: (Math.random() - 0.5) * 3,
                        vy: (Math.random() - 0.5) * 2,
                        vz: (Math.random() - 0.5) * 3,
                        ttl: 0.25,
                        size: 0.6,
                        r: 0.8, g: 0.95, b: 1.0, a: 1.0,
                    });
                }
                // Firework burst — radial color spray at lightning peak
                const fy = groundY + 4 + Math.random() * 14;
                for (let n = 0; n < 18; n++) {
                    const a = Math.random() * Math.PI * 2;
                    const spd = 6 + Math.random() * 4;
                    this.particles.spawn({
                        x: cx, y: fy, z: cz,
                        vx: Math.cos(a) * spd,
                        vy: (Math.random() - 0.5) * 4,
                        vz: Math.sin(a) * spd,
                        ttl: 0.8,
                        size: 0.45,
                        r: Math.random() < 0.5 ? 1.0 : 0.7,
                        g: Math.random() * 0.6 + 0.3,
                        b: Math.random() < 0.4 ? 1.0 : 0.2,
                        a: 1.0,
                        gravity: 4,
                    });
                }
            }, ms);
        }

        // Stage 4: dissipation. After ~2.5s, the vortex sheds outward
        // in a final ring as the new world settles in.
        setTimeout(() => {
            if (!this.particles?.spawn) return;
            for (let n = 0; n < 100; n++) {
                const a = (n / 100) * Math.PI * 2 + Math.random() * 0.3;
                const spd = 8 + Math.random() * 4;
                this.particles.spawn({
                    x: cx, y: groundY + 5, z: cz,
                    vx: Math.cos(a) * spd,
                    vy: 1 + Math.random() * 2,
                    vz: Math.sin(a) * spd,
                    ttl: 1.2,
                    size: 0.4,
                    r: 0.55, g: 0.50, b: 0.48, a: 0.7,
                    gravity: 2,
                });
            }
        }, 2500);
    }

    _applyEnvironment(env) {
        if (!this._savedEnv) {
            this._savedEnv = {
                horizon: this.skyRenderer?.horizonColor?.slice(),
                zenith:  this.skyRenderer?.zenithColor?.slice(),
                sun:     this.skyRenderer?.sunColor?.slice(),
                fog:     this.voxelRenderer?.fogColor?.slice(),
                gravityMul: this.particles?.gravityMul ?? 1.0,
                voxelSunDir: this.voxelRenderer?.sunDir?.slice(),
                entitySunDir: this.entityMeshRenderer?.sunDir?.slice(),
            };
        }
        const ENVIRONMENTS = {
            earth: {
                horizon: [0.78, 0.65, 0.55],
                zenith:  [0.45, 0.62, 0.85],
                sun:     [1.0,  0.92, 0.78],
                fog:     [0.78, 0.65, 0.55],
                gravityMul: 1.0,
                surfaceTop: null,
                sunDir:  [0.408, 0.816, 0.408],          // standard 60°
            },
            moon: {
                horizon: [0.04, 0.04, 0.06],
                zenith:  [0.0,  0.0,  0.02],
                sun:     [1.0,  1.0,  0.95],
                fog:     [0.05, 0.05, 0.07],
                gravityMul: 0.17,
                // Round 88 — moon is airless / waterless. Drain natural
                // worldgen water out of the arena before repaint.
                surfaceTop: { primary: 1, sparse: 6, sparseRate: 0.2, drainWater: true },
                sunDir:  [0.30, 0.95, 0.05],             // near-vertical, hard
            },
            mars: {
                horizon: [0.78, 0.42, 0.28],
                zenith:  [0.55, 0.32, 0.22],
                sun:     [1.0,  0.78, 0.62],
                fog:     [0.78, 0.42, 0.28],
                gravityMul: 0.38,
                // Round 88 — mars surface waterless too.
                surfaceTop: { primary: 4, sparse: 1, sparseRate: 0.15, drainWater: true },
                sunDir:  [0.55, 0.65, 0.55],             // lower angle
            },
            // Round 33 — sea. OGRE wades through chest-deep water; play
            // area is flooded above terrain. Surface paint mode "flood"
            // adds a layer of water voxels above the original terrain.
            sea: {
                horizon: [0.55, 0.65, 0.78],             // hazy gray-blue
                zenith:  [0.30, 0.40, 0.55],             // overcast
                sun:     [0.9,  0.95, 1.0],              // cool white
                fog:     [0.55, 0.65, 0.78],
                gravityMul: 1.0,
                surfaceTop: { mode: "flood", waterDepth: 2 },
                sunDir:  [0.20, 0.85, 0.50],             // overcast diffuse
            },
            // Round 48 — hell. Volcanic crimson environment with
            // ash-painted ground + scattered lava pools. Low-angle dim
            // red sun, dense rust-colored fog. Higher gravity (1.2) so
            // projectiles arc lower and OGRE thuds harder. Surface paint
            // mode "lava_pools" repaints top voxels with ash and
            // sprinkles lava pools at noise-driven hot spots.
            hell: {
                horizon: [0.55, 0.18, 0.05],             // burnt orange
                zenith:  [0.15, 0.02, 0.02],             // deep crimson
                sun:     [0.95, 0.35, 0.20],             // dim red sun
                fog:     [0.45, 0.15, 0.08],             // rusty haze
                gravityMul: 1.2,
                // Round 88 — drainWater before lava pools added.
                surfaceTop: { mode: "lava_pools", lavaRate: 0.06, drainWater: true },
                sunDir:  [0.40, 0.55, 0.30],             // low + warm angle
            },
        };
        const cfg = ENVIRONMENTS[env] ?? ENVIRONMENTS.earth;
        if (this.skyRenderer?.setColors) {
            this.skyRenderer.setColors({
                horizon: cfg.horizon,
                zenith:  cfg.zenith,
                sun:     cfg.sun,
            });
        }
        if (this.voxelRenderer) {
            this.voxelRenderer.fogColor = cfg.fog;
            if (cfg.sunDir) this.voxelRenderer.sunDir = [...cfg.sunDir];
        }
        if (this.entityMeshRenderer?.setSun && cfg.sunDir) {
            this.entityMeshRenderer.setSun(cfg.sunDir);
        }
        if (this.entityMeshRenderer?.setSky) {     // round 34
            this.entityMeshRenderer.setSky({ horizon: cfg.horizon, zenith: cfg.zenith });
        }
        if (this.entityMeshRenderer?.setFog) {
            this.entityMeshRenderer.setFog(cfg.fog);
        }
        if (this.particles) {
            this.particles.gravityMul = cfg.gravityMul;
            this.particles.fogColor = cfg.fog;
        }
        this._currentEnv = env;
        if (cfg.surfaceTop) {
            this._repaintSurface(cfg.surfaceTop);
        }
        // Round 35 — show the spinning Earth overlay only on the moon
        // (where the moon's view of Earth makes sense). DOM-level toggle.
        if (typeof document !== "undefined") {
            const el = document.getElementById("earth-overlay");
            if (el) el.classList.toggle("moon-active", env === "moon");
        }
        // Round 40 — ocean ambient bed on/off
        const am = (typeof window !== "undefined") ? window.audioManager : null;
        if (am?.audio?.setOceanIntensity) {
            am.audio.setOceanIntensity(env === "sea" ? 1.0 : 0.0);
        }
        console.log(`[OGRE] environment: ${env} (gravityMul=${cfg.gravityMul})`);
    }

    // Repaint top voxel of each column in the play area to match the
    // active environment. Uses HQ as center, paints a square radius 80.
    // Doesn't touch water, lava, or under-surface voxels.
    _repaintSurface(opts) {
        if (!this.world?.setVoxel || !this.world?.getVoxel) return;
        const cx = Math.floor(this.hqPos?.x ?? 0);
        const cz = Math.floor(this.hqPos?.z ?? 0);
        const R = 80;
        let painted = 0;
        // Round 88 — drain natural worldgen water/lava for envs that
        // flag drainWater (moon/mars/hell). Replaces fluid voxels with
        // air; if a column had ONLY fluid below sea level, surface
        // re-painting in the next loop will still find the floor.
        if (opts.drainWater) {
            let drained = 0;
            for (let dz = -R; dz <= R; dz++) {
                for (let dx = -R; dx <= R; dx++) {
                    const wx = cx + dx, wz = cz + dz;
                    for (let y = 80; y > 0; y--) {
                        const v = this.world.getVoxel(wx, y, wz);
                        if (v === 10 || v === 11) {
                            this.world.setVoxel(wx, y, wz, 0);
                            drained++;
                        }
                    }
                }
            }
            if (drained > 0) console.log(`[OGRE] drained ${drained} water voxels (envless arena)`);
        }
        // Round 33 — flood mode: add a water column above terrain.
        if (opts.mode === "flood") {
            const depth = opts.waterDepth ?? 2;
            for (let dz = -R; dz <= R; dz++) {
                for (let dx = -R; dx <= R; dx++) {
                    const wx = cx + dx, wz = cz + dz;
                    // Find topmost solid voxel
                    for (let y = 80; y > 0; y--) {
                        const v = this.world.getVoxel(wx, y, wz);
                        if (v != null && v !== 0 && v !== 10 && v !== 11) {
                            // Add water above terrain top
                            for (let d = 1; d <= depth; d++) {
                                const wyAbove = y + d;
                                const upV = this.world.getVoxel(wx, wyAbove, wz);
                                if (upV == null || upV === 0) {
                                    this.world.setVoxel(wx, wyAbove, wz, 10);  // WATER
                                    painted++;
                                }
                            }
                            break;
                        }
                    }
                }
            }
            console.log(`[OGRE] flooded ${painted} voxels with water (depth ${depth})`);
            return;
        }
        // Round 48 — lava_pools mode: paint top voxels with ash, then
        // sprinkle pools of lava at noise-driven hot spots. Uses cheap
        // value-noise (sin-based) so the pool placement is deterministic
        // per (x,z) and stable across regen — no flicker.
        if (opts.mode === "lava_pools") {
            const ASH  = 6;
            const LAVA = 12;
            const rate = opts.lavaRate ?? 0.06;     // fraction of columns that seed a pool
            let pools = 0;
            for (let dz = -R; dz <= R; dz++) {
                for (let dx = -R; dx <= R; dx++) {
                    const wx = cx + dx, wz = cz + dz;
                    // Find topmost solid (non-water/lava) voxel
                    for (let y = 80; y > 0; y--) {
                        const v = this.world.getVoxel(wx, y, wz);
                        if (v == null || v === 0) continue;
                        if (v === 10 || v === 11 || v === 12) break;
                        // Always paint top as ash
                        if (v !== ASH) {
                            this.world.setVoxel(wx, y, wz, ASH);
                            painted++;
                        }
                        // Lava pool spawn: deterministic noise from x,z;
                        // small radius 2-3 voxels, replace top column with
                        // LAVA so it pools level with surrounding ash.
                        const n = Math.abs(Math.sin(wx * 12.9898 + wz * 78.233) * 43758.5453);
                        const hash = n - Math.floor(n);
                        if (hash < rate) {
                            // Center pool here: 3x3 footprint, top voxel as LAVA
                            const poolR = 1 + ((hash * 100) | 0) % 2;       // 1 or 2
                            for (let pz = -poolR; pz <= poolR; pz++) {
                                for (let px = -poolR; px <= poolR; px++) {
                                    if (px * px + pz * pz > poolR * poolR) continue;
                                    const ux = wx + px, uz = wz + pz;
                                    // Find that column's top
                                    for (let uy = 80; uy > 0; uy--) {
                                        const uv = this.world.getVoxel(ux, uy, uz);
                                        if (uv == null || uv === 0) continue;
                                        if (uv === 10 || uv === 11) break;
                                        this.world.setVoxel(ux, uy, uz, LAVA);
                                        break;
                                    }
                                }
                            }
                            pools++;
                        }
                        break;
                    }
                }
            }
            console.log(`[OGRE] hell paint: ${painted} ash voxels, ${pools} lava pools`);
            return;
        }
        // Standard repaint — replace top voxel with biome-appropriate
        const { primary, sparse, sparseRate } = opts;
        for (let dz = -R; dz <= R; dz++) {
            for (let dx = -R; dx <= R; dx++) {
                const wx = cx + dx, wz = cz + dz;
                for (let y = 80; y > 0; y--) {
                    const v = this.world.getVoxel(wx, y, wz);
                    if (v == null || v === 0) continue;
                    if (v === 10 || v === 11 || v === 12) break;
                    const newV = (Math.random() < sparseRate) ? sparse : primary;
                    if (v !== newV) {
                        this.world.setVoxel(wx, y, wz, newV);
                        painted++;
                    }
                    break;
                }
            }
        }
        console.log(`[OGRE] repainted ${painted} surface voxels`);
    }

    // Round 31 — Mars dust storms + Moon micrometeorites. Periodic
    // atmospheric ambience tied to the active environment.
    _tickEnvAmbience(dt, t) {
        if (!this._currentEnv || this._currentEnv === "earth") return;
        if (!this.particles?.spawn || !this.camera) return;
        const cx = this.camera.position.x;
        const cy = this.camera.position.y;
        const cz = this.camera.position.z;
        if (this._currentEnv === "mars") {
            // Storm cycle: 30s calm, 18s storm building, 25s peak, 10s fading
            const cycle = 83;
            const phase = t % cycle;
            let intensity = 0;
            if (phase < 30) intensity = 0.05;                    // ambient drift
            else if (phase < 48) intensity = 0.05 + (phase - 30) / 18 * 0.95;   // ramp
            else if (phase < 73) intensity = 1.0;                // peak storm
            else intensity = 1.0 - (phase - 73) / 10;            // fade
            // Notify on storm onset
            const cycleIdx = Math.floor(t / cycle);
            if (phase >= 30 && phase < 31 && this._lastStormCycle !== cycleIdx) {
                this._lastStormCycle = cycleIdx;
                console.log("[MARS] dust storm building...");
            }
            // Wind particle stream — horizontal drift across camera area
            const baseRate = intensity * 12;
            const spawnCount = Math.floor(baseRate);
            const fractional = baseRate - spawnCount;
            const total = spawnCount + (Math.random() < fractional ? 1 : 0);
            for (let n = 0; n < total; n++) {
                const dx = -40 + Math.random() * 8;
                const dy = -10 + Math.random() * 30;
                const dz = -30 + Math.random() * 60;
                this.particles.spawn({
                    x: cx + dx,
                    y: cy + dy,
                    z: cz + dz,
                    vx: 14 + Math.random() * 6,
                    vy: -0.5 + Math.random() * 1.0,
                    vz: (Math.random() - 0.5) * 1.2,
                    ttl: 2.0 + Math.random() * 1.0,
                    size: 0.6 + Math.random() * 0.4,
                    r: 0.85, g: 0.55, b: 0.35,
                    a: 0.3 + intensity * 0.5,
                });
            }
        } else if (this._currentEnv === "moon") {
            // Occasional micrometeorite impacts on the play area.
            // Round 128 — impacts now ALSO carve a small persistent
            // crater into the lunar surface (~2 voxel radius). Over a
            // long session the moon environment accumulates the
            // pockmarked look it ought to have.
            this._lastMeteorT = this._lastMeteorT ?? t;
            if (t - this._lastMeteorT > 8 + Math.random() * 14) {
                this._lastMeteorT = t;
                const ix = cx + (Math.random() - 0.5) * 60;
                const iz = cz + (Math.random() - 0.5) * 60;
                const iy = this._surfaceY(ix, iz);
                // Bright streak from sky
                for (let n = 0; n < 14; n++) {
                    const f = n / 14;
                    this.particles.spawn({
                        x: ix + 8 - f * 8,
                        y: iy + 30 - f * 30,
                        z: iz + 8 - f * 8,
                        ttl: 0.4, size: 0.4 + f * 0.3,
                        r: 1.0, g: 0.85, b: 0.55, a: 1.0 - f * 0.6,
                    });
                }
                // Dust burst at impact
                for (let n = 0; n < 24; n++) {
                    const a = Math.random() * Math.PI * 2;
                    const sp = 2 + Math.random() * 4;
                    this.particles.spawn({
                        x: ix, y: iy + 0.3, z: iz,
                        vx: Math.cos(a) * sp,
                        vy: 1 + Math.random() * 2,
                        vz: Math.sin(a) * sp,
                        ttl: 1.0, size: 0.5,
                        r: 0.6, g: 0.6, b: 0.62, a: 0.7,
                        gravity: 4,
                    });
                }
                // Round 128 — carve the actual crater. Same bowl
                // pattern as the hellspawn portal version but smaller
                // (radius 2) and without ASH lining (moon dust is
                // already gray; the depression itself reads as the
                // crater). Inlined here since OgreScenario doesn't
                // import KaijuManager's helper.
                this._carveLunarCrater(ix, iz, 2);
            }
        }
    }

    // Round 128 — small bowl-shaped crater for moon meteor impacts.
    // Removes surface voxels in a hemispherical depression. No ASH
    // lining because the moon's existing surface palette (dust gray)
    // already reads as scorched; the depression itself is the crater.
    // Tiny — radius 2 — so impacts don't aggressively rewrite the
    // landscape over a long session.
    _carveLunarCrater(cx, cz, radius) {
        if (!this.world?.setVoxel || !this.world?.getVoxel) return;
        const r = Math.max(1, Math.floor(radius));
        const cxi = Math.floor(cx), czi = Math.floor(cz);
        let surfaceY = 0;
        for (let y = 80; y >= 2; y--) {
            const v = this.world.getVoxel(cxi, y, czi);
            if (v != null && v !== 0) {
                surfaceY = y;
                break;
            }
        }
        if (surfaceY === 0) return;
        const depth = Math.max(1, Math.floor(r * 0.6));
        const r2 = r * r;
        for (let dx = -r; dx <= r; dx++) {
            for (let dz = -r; dz <= r; dz++) {
                const d2 = dx * dx + dz * dz;
                if (d2 > r2) continue;
                const xi = cxi + dx, zi = czi + dz;
                const colDepth = Math.floor(depth * (1 - d2 / r2));
                for (let y = surfaceY; y > surfaceY - colDepth; y--) {
                    if (y < 2) break;
                    const v = this.world.getVoxel(xi, y, zi);
                    if (v != null && v !== 0) {
                        this.world.setVoxel(xi, y, zi, VOXEL_AIR);
                    }
                }
            }
        }
    }

    _restoreEnvironment() {
        if (!this._savedEnv) return;
        // Round 35 — hide earth overlay on stop/restore
        if (typeof document !== "undefined") {
            const el = document.getElementById("earth-overlay");
            if (el) el.classList.remove("moon-active");
        }
        // Round 40 — kill ocean ambient
        const am2 = (typeof window !== "undefined") ? window.audioManager : null;
        if (am2?.audio?.setOceanIntensity) am2.audio.setOceanIntensity(0);
        const s = this._savedEnv;
        if (this.skyRenderer?.setColors) {
            this.skyRenderer.setColors({
                horizon: s.horizon,
                zenith:  s.zenith,
                sun:     s.sun,
            });
        }
        if (this.voxelRenderer) {
            if (s.fog) this.voxelRenderer.fogColor = s.fog;
            if (s.voxelSunDir) this.voxelRenderer.sunDir = [...s.voxelSunDir];
        }
        if (this.entityMeshRenderer?.setSun && s.entitySunDir) {
            this.entityMeshRenderer.setSun(s.entitySunDir);
        }
        if (this.particles) {
            this.particles.gravityMul = s.gravityMul ?? 1.0;
            if (s.fog) this.particles.fogColor = s.fog;
        }
        this._savedEnv = null;
    }

    _cleanupOgre() {
        if (!this.ogre) return;
        const router = this.router;

        // Round 40 — pilot eject cinematic. Spawn pilot entity from
        // chassis top, launch upward fast, then deploy parachute (drift
        // descent). Independent of crater FX below — runs alongside.
        this._spawnPilotEject();

        // Round 21 — death crater. OGRE dies dramatically: carve a
        // shallow voxel sphere at the OGRE position, scorch surrounding
        // surface to ASH, blast 80-particle smoke + fire burst.
        if (router && this.world?.setVoxel && this.world?.getVoxel) {
            const ox = Math.floor(this.ogre.position.x);
            const oz = Math.floor(this.ogre.position.z);
            const oy = this._surfaceY(ox, oz);
            const CRATER_R = 4;
            const SCORCH_R = 7;
            // 1. Carve crater (shallow bowl, deepest at center)
            for (let dz = -CRATER_R; dz <= CRATER_R; dz++) {
                for (let dx = -CRATER_R; dx <= CRATER_R; dx++) {
                    const r = Math.hypot(dx, dz);
                    if (r > CRATER_R) continue;
                    const depth = Math.floor((1 - r / CRATER_R) * 2.5);   // 0..2 voxels deep
                    for (let d = 0; d <= depth; d++) {
                        const wy = oy - 1 - d;
                        if (wy < 1) break;
                        router.exec({
                            type: "voxel:set",
                            x: ox + dx, y: wy, z: oz + dz, v: 0,   // air
                        });
                    }
                }
            }
            // 2. Ring of ASH around the crater rim (irregular)
            for (let dz = -SCORCH_R; dz <= SCORCH_R; dz++) {
                for (let dx = -SCORCH_R; dx <= SCORCH_R; dx++) {
                    const r = Math.hypot(dx, dz);
                    if (r > SCORCH_R || r < CRATER_R - 1) continue;
                    if (Math.random() > 0.55) continue;          // sparse 55%
                    const wx = ox + dx, wz = oz + dz;
                    for (let y = 80; y > 0; y--) {
                        const v = this.world.getVoxel(wx, y, wz);
                        if (v != null && v !== 0 && v !== 10 && v !== 11) {
                            if (v !== VOXEL_ASH) {
                                this.world.setVoxel(wx, y, wz, VOXEL_ASH);
                            }
                            break;
                        }
                    }
                }
            }
        }
        // Massive death particle burst — fire + smoke + debris
        if (this.particles?.spawn) {
            const ox = this.ogre.position.x;
            const oy = this.ogre.position.y;
            const oz = this.ogre.position.z;

            // Round 24 — variant-specific death sequence. Each variant
            // adds signature debris/effects matching its identity.
            const special = this.variant?.special;
            if (special === "aegis") {
                // Shield-shaped ring of blue debris flying outward
                for (let n = 0; n < 30; n++) {
                    const a = (n / 30) * Math.PI * 2;
                    this.particles.spawn({
                        x: ox + Math.cos(a) * 2,
                        y: oy + 2.5,
                        z: oz + Math.sin(a) * 2,
                        vx: Math.cos(a) * (8 + Math.random() * 4),
                        vy: 3 + Math.random() * 3,
                        vz: Math.sin(a) * (8 + Math.random() * 4),
                        ttl: 1.5, size: 0.7,
                        r: 0.65, g: 0.85, b: 1.0, a: 1.0,
                        gravity: 8,
                    });
                }
            } else if (special === "phantom") {
                // Dense purple smoke cloud expanding slowly
                for (let n = 0; n < 50; n++) {
                    const a = Math.random() * Math.PI * 2;
                    const r = Math.random() * 4;
                    this.particles.spawn({
                        x: ox + Math.cos(a) * r,
                        y: oy + 0.5 + Math.random() * 3,
                        z: oz + Math.sin(a) * r,
                        vx: Math.cos(a) * 1.5,
                        vy: 0.5 + Math.random() * 1.0,
                        vz: Math.sin(a) * 1.5,
                        ttl: 2.5, size: 1.2,
                        r: 0.55, g: 0.30, b: 0.85, a: 0.7,
                        gravity: -0.8,
                    });
                }
            } else if (special === "splitter") {
                // Twin shard explosions at strut positions
                for (const offset of [-1.5, 1.5]) {
                    for (let n = 0; n < 20; n++) {
                        const a = Math.random() * Math.PI * 2;
                        const speed = 4 + Math.random() * 6;
                        this.particles.spawn({
                            x: ox + offset, y: oy + 1.5, z: oz,
                            vx: Math.cos(a) * speed,
                            vy: 2 + Math.random() * 4,
                            vz: Math.sin(a) * speed,
                            ttl: 1.2, size: 0.5,
                            r: 1.0, g: 0.6, b: 0.3, a: 1.0,
                            gravity: 12,
                        });
                    }
                }
            } else if (special === "carrier") {
                // Minion-sized debris chunks, gray
                for (let n = 0; n < 12; n++) {
                    const a = Math.random() * Math.PI * 2;
                    const speed = 3 + Math.random() * 5;
                    this.particles.spawn({
                        x: ox, y: oy + 1, z: oz - 1,    // rear
                        vx: Math.cos(a) * speed,
                        vy: 3 + Math.random() * 3,
                        vz: Math.sin(a) * speed,
                        ttl: 1.6, size: 0.85,
                        r: 0.4, g: 0.4, b: 0.45, a: 1.0,
                        gravity: 11,
                    });
                }
            } else if (special === "drones") {
                // Small drone-sized debris, lighter color
                for (let n = 0; n < 16; n++) {
                    const a = Math.random() * Math.PI * 2;
                    const speed = 5 + Math.random() * 7;
                    this.particles.spawn({
                        x: ox, y: oy + 3.5, z: oz,    // top
                        vx: Math.cos(a) * speed,
                        vy: 4 + Math.random() * 4,
                        vz: Math.sin(a) * speed,
                        ttl: 1.4, size: 0.45,
                        r: 0.85, g: 0.85, b: 0.92, a: 1.0,
                        gravity: 10,
                    });
                }
            } else if (special === "magnetic") {
                // Spiraling cyan plasma arcs
                for (let n = 0; n < 40; n++) {
                    const a = (n / 40) * Math.PI * 4 + Math.random() * 0.5;
                    const r = 1 + Math.random() * 3;
                    this.particles.spawn({
                        x: ox + Math.cos(a) * r,
                        y: oy + 1 + Math.random() * 4,
                        z: oz + Math.sin(a) * r,
                        vx: Math.cos(a + Math.PI / 2) * 6,
                        vy: 2 + Math.random() * 3,
                        vz: Math.sin(a + Math.PI / 2) * 6,
                        ttl: 0.9, size: 0.5,
                        r: 0.4, g: 0.95, b: 1.0, a: 1.0,
                        gravity: 0,
                    });
                }
            } else if (special === "scanners") {
                // Green scanner debris, sweeping outward
                for (let n = 0; n < 24; n++) {
                    const a = Math.random() * Math.PI * 2;
                    const speed = 4 + Math.random() * 5;
                    this.particles.spawn({
                        x: ox, y: oy + 4.5, z: oz,    // scanner height
                        vx: Math.cos(a) * speed,
                        vy: 2 + Math.random() * 3,
                        vz: Math.sin(a) * speed,
                        ttl: 1.3, size: 0.5,
                        r: 0.4, g: 1.0, b: 0.5, a: 1.0,
                        gravity: 9,
                    });
                }
            } else if (special === "spotlights") {
                // Warm-white beam-debris flares outward
                for (let n = 0; n < 28; n++) {
                    const a = Math.random() * Math.PI * 2;
                    const speed = 5 + Math.random() * 8;
                    this.particles.spawn({
                        x: ox, y: oy + 4, z: oz + 1,
                        vx: Math.cos(a) * speed,
                        vy: 3 + Math.random() * 3,
                        vz: Math.sin(a) * speed,
                        ttl: 1.0, size: 0.6,
                        r: 1.0, g: 0.95, b: 0.78, a: 1.0,
                        gravity: 10,
                    });
                }
            }

            // Standard fire + smoke + debris burst (all variants get this)
            for (let n = 0; n < 80; n++) {
                const a = Math.random() * Math.PI * 2;
                const speed = 4 + Math.random() * 9;
                this.particles.spawn({
                    x: ox, y: oy + Math.random() * 2, z: oz,
                    vx: Math.cos(a) * speed,
                    vy: 2 + Math.random() * 6,
                    vz: Math.sin(a) * speed,
                    ttl: 1.4, size: 0.7,
                    r: 1.0, g: 0.5 + Math.random() * 0.3, b: 0.15, a: 1.0,
                    gravity: 9,
                });
            }
            // Ground smoke ring
            for (let n = 0; n < 50; n++) {
                const a = Math.random() * Math.PI * 2;
                const r = 2 + Math.random() * 5;
                this.particles.spawn({
                    x: ox + Math.cos(a) * r,
                    y: oy + 0.5,
                    z: oz + Math.sin(a) * r,
                    vy: 0.8 + Math.random() * 1.2,
                    ttl: 2.0, size: 0.9,
                    r: 0.2, g: 0.2, b: 0.22, a: 0.85,
                    gravity: -1,
                });
            }
            // Debris chunks
            for (let n = 0; n < 24; n++) {
                const a = Math.random() * Math.PI * 2;
                const speed = 5 + Math.random() * 7;
                this.particles.spawn({
                    x: ox, y: oy + 1, z: oz,
                    vx: Math.cos(a) * speed,
                    vy: 4 + Math.random() * 5,
                    vz: Math.sin(a) * speed,
                    ttl: 1.8, size: 0.55,
                    r: 0.45, g: 0.40, b: 0.35, a: 1.0,
                    gravity: 14,
                });
            }
        }
        // Death audio cue
        this._sfxAt("ogre_phase_transition", this.ogre.position.x, this.ogre.position.y, this.ogre.position.z);
        // Round 28 — big camera shake on death (felt across the play area)
        if (this.camera?.shake) {
            const dx = this.camera.position.x - this.ogre.position.x;
            const dy = this.camera.position.y - this.ogre.position.y;
            const dz = this.camera.position.z - this.ogre.position.z;
            const dist = Math.hypot(dx, dy, dz);
            const DEATH_SHAKE_RANGE = 200;
            if (dist < DEATH_SHAKE_RANGE) {
                const falloff = 1 - dist / DEATH_SHAKE_RANGE;
                this.camera.shake(0.6 * falloff, 800);
            }
        }

        // Round 23 — leave a wreckage hulk at the death position. A
        // dark, smaller entity that persists until the scenario stops.
        // Combined with the round-21 crater + scorch ring, this gives
        // the battlefield a real "fallen war machine" landmark.
        if (router) {
            const wreckResult = router.exec({
                type: "entity:spawnMesh",
                assetId: "ogre_wreck",
                kind: "ogre_wreck",
                x: this.ogre.position.x,
                y: this.ogre.position.y - 0.5,    // sits in the crater
                z: this.ogre.position.z,
                scale: (this.variant?.scale ?? 4) * 0.7,    // 70% of OGRE size
            });
            if (wreckResult?.id != null) {
                if (!this.wrecks) this.wrecks = [];
                this.wrecks.push({
                    entityId: wreckResult.id,
                    x: this.ogre.position.x,
                    y: this.ogre.position.y,
                    z: this.ogre.position.z,
                    spawnT: performance.now() * 0.001,    // round 24
                });
            }
            // Round 28 — composite wreck. Surround the main hulk with
            // 6-9 smaller debris pieces scattered around. Compensates
            // for the cube fallback by making the wreck look like an
            // actual broken machine, not a clean rectangle.
            const numDebris = 6 + Math.floor(Math.random() * 4);
            for (let n = 0; n < numDebris; n++) {
                const a = Math.random() * Math.PI * 2;
                const r = 1.5 + Math.random() * 3.5;
                const px = this.ogre.position.x + Math.cos(a) * r;
                const pz = this.ogre.position.z + Math.sin(a) * r;
                const debResult = router.exec({
                    type: "entity:spawnMesh",
                    assetId: "ogre_wreck_debris",
                    kind: "ogre_wreck_debris",
                    x: px,
                    y: this.ogre.position.y - 0.6,
                    z: pz,
                    scale: 0.4 + Math.random() * 0.5,
                });
                if (debResult?.id != null) {
                    this.wrecks.push({
                        entityId: debResult.id, x: px, y: this.ogre.position.y - 0.6, z: pz,
                        spawnT: performance.now() * 0.001,
                    });
                }
            }
        }

        if (this.ogre._meshEntityId != null && router) {
            router.exec({ type: "entity:despawn", id: this.ogre._meshEntityId });
        }
        // Round 9 — cleanup hardpoints
        for (const key of Object.keys(this.hardpoints)) {
            const h = this.hardpoints[key];
            if (h.entityId != null && router) {
                router.exec({ type: "entity:despawn", id: h.entityId });
            }
            // Round 28 — cleanup dent decals
            if (h.dentEntityId != null && router) {
                router.exec({ type: "entity:despawn", id: h.dentEntityId });
            }
        }
        this.hardpoints = {};
        // Round 16 — cleanup rig parts
        this._despawnRig();
        // Round 35 — cleanup PD turrets + in-flight counter-drones
        this._despawnPointDefense();
        if (this.router && this.counterDrones) {
            for (const d of this.counterDrones) {
                if (d.entityId != null) this.router.exec({ type: "entity:despawn", id: d.entityId });
            }
        }
        if (this.counterDrones) this.counterDrones.length = 0;
        // Round 36 — cleanup AP mines + gas + submarine state
        if (this.router && this.apMines) {
            for (const m of this.apMines) {
                if (m.entityId != null) this.router.exec({ type: "entity:despawn", id: m.entityId });
            }
        }
        if (this.apMines) this.apMines.length = 0;
        if (this.gasClouds) this.gasClouds.length = 0;
        this._subDepth = 0;
        this._lastApMineT = 0;
        this._lastGasT = 0;
        this._lastSubTorpT = 0;
        // Round 37 — reset flood + cascade state
        this._floodCount = 0;
        this._breaches = [];
        this._cascadeArmed = false;
        this._lastCascadeT = 0;
        // Round 38 — cleanup civ boats, planes, earth billboard
        if (this.router && this.civBoats) {
            for (const [, rec] of this.civBoats) {
                if (rec.entityId != null) this.router.exec({ type: "entity:despawn", id: rec.entityId });
            }
        }
        if (this.civBoats) this.civBoats.clear();
        if (this.router && this.planes) {
            for (const p of this.planes) {
                if (p.entityId != null) this.router.exec({ type: "entity:despawn", id: p.entityId });
            }
        }
        if (this.planes) this.planes.length = 0;
        // Round 40 — cleanup pilots + chutes
        if (this.router && this.pilots) {
            for (const p of this.pilots) {
                if (p.entityId != null) this.router.exec({ type: "entity:despawn", id: p.entityId });
                if (p.chuteEntityId != null) this.router.exec({ type: "entity:despawn", id: p.chuteEntityId });
            }
        }
        if (this.pilots) this.pilots.length = 0;
        if (this._earthEntityId != null && this.router) {
            this.router.exec({ type: "entity:despawn", id: this._earthEntityId });
            this._earthEntityId = null;
        }
        this._lastPlaneT = 0;
        this.kaijuManager.kaiju.delete(this.ogre.id);
        this.ogre = null;
    }
}
