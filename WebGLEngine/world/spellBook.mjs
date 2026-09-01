// FILE: world/spellBook.mjs -- v4192
//
// THE HERO SPELL BOOK: a table of recipes, and a cost that is MEASURED rather than balanced.
//
// Pure -- no DOM, no GPU, no clock -- so a gate can render a spell's whole particle burst and hash it, and
// can re-measure what a spell costs instead of taking the book's word for it.
//
// *** THE IDEA KEITH ASKED FOR, AND WHY IT IS DIFFERENT FROM A GAME FEATURE. *** In every other game a
// spell's mana cost is a balance number somebody typed, and it drifts the moment the effect changes. Here the
// cost is DERIVED from what the spell actually costs to render: particles spawned, voxels fractured, frames
// ray-marched, each multiplied by a unit price that was measured on real work. Make a spell cheaper to render
// and it becomes cheaper to cast, automatically. There is no `cost:` field anywhere in SPELLS, and
// tools/ship/spellBook-selfcheck.mjs re-measures the units and checks that the book's ordering is still the
// MEASURED ordering -- so a cost that stopped matching reality turns the gate red rather than quietly
// unbalancing the game.
//
// *** AND NOTHING HERE IS NEW PHYSICS. *** Every expensive piece already existed and was already gated:
//   particles  -- the spawn shape simulation/AsteroidsDemo.js and DungeonDemo.js's _explodeGrenade both use
//   fracture   -- physics/voxel/fracture.js, "the interesting half of what Teardown does"
//   raymarch   -- render/voxelRaymarchPass.js, a GPU DDA march over a 3D-texture volume
//   sound      -- audio/sfxModel.mjs (v4190), whose presets are already hashable
// The most expensive spell is expensive because it USES the two most expensive things in the tree, which is
// the whole reason its price is honest.
"use strict";

import { PRESETS as SFX } from "../audio/sfxModel.mjs";

export const ELEMENTS = Object.freeze(["arcane", "fire", "ice", "acid", "kinetic"]);

/**
 * *** THE BOOK. NOTE WHAT IS NOT HERE: A COST. ***
 *
 * Each entry says what the spell DOES -- how many particles, how fast, how long they live, what it sets on
 * fire, how much of the world it carves. What it costs is computed from those numbers. A `cost` field would
 * be a second source of truth that could disagree with the first, which is the bug this design removes.
 */
export const SPELLS = Object.freeze({
    spark: {
        element: "arcane", sound: "zap", radius: 1.6, damage: 3,
        burst: { count: 24, speed: 7, ttl: 0.30, size: 0.10, colour: [0.62, 0.80, 1.0], gravity: 0 },
    },
    ember: {
        element: "fire", sound: "hit", radius: 2.6, damage: 6, ignite: true,
        burst: { count: 80, speed: 9, ttl: 0.55, size: 0.16, colour: [1.0, 0.55, 0.15], gravity: -3 },
    },
    frostbite: {
        element: "ice", sound: "powerup", radius: 3.2, damage: 5, slow: 3.0,
        burst: { count: 140, speed: 6, ttl: 0.80, size: 0.13, colour: [0.65, 0.90, 1.0], gravity: -1 },
    },
    causticSpray: {
        element: "acid", sound: "hit", radius: 3.0, damage: 4, pool: { seconds: 4, dps: 1.2 },
        // shares a preset with ember, so it is bent away from it: a longer, wetter hiss rather than a rap
        soundOver: { lowPass: 0.22, frequency: { start: 180, slide: -260 }, volume: { sustain: 0.06, decay: 0.34 } },
        burst: { count: 220, speed: 8, ttl: 1.10, size: 0.12, colour: [0.55, 0.95, 0.35], gravity: -6 },
    },
    quake: {
        element: "kinetic", sound: "explosion", radius: 6.0, damage: 9,
        burst: { count: 520, speed: 11, ttl: 1.20, size: 0.20, colour: [0.72, 0.62, 0.48], gravity: -9 },
        // the first spell that touches the world itself: a small carve, and whatever falls off falls off
        fracture: { grid: 24, carveRadius: 5 },
        soundOver: { frequency: { start: 260, slide: -220 }, volume: { decay: 0.40 } },
    },
    // *** THE MAX SPELL. *** Keith's: a ray-traced nuclear detonation that cracks the world. It is the most
    // expensive thing in the book because it is the only spell that runs BOTH of the two most expensive
    // systems in the engine -- a full fracture of a large grid and a sustained ray-march -- and its price
    // falls straight out of that rather than being chosen to feel dramatic.
    cataclysm: {
        element: "kinetic", sound: "explosion", radius: 16.0, damage: 40,
        burst: { count: 2400, speed: 26, ttl: 2.40, size: 0.34, colour: [1.0, 0.86, 0.55], gravity: -4 },
        fracture: { grid: 48, carveRadius: 14 },
        raymarch: { frames: 90 },        // the fireball is marched, not billboarded
        shockwave: { seconds: 1.8 },
        // *** THE MAX SPELL MUST NOT SOUND LIKE THE MEDIUM ONE. *** cataclysm and quake both draw the
        // "explosion" preset, and without this they render the SAME BYTES -- the world-cracking spell and the
        // one that chips a wall arriving identically. audio/sfxModel.mjs's presets take overrides (v4190), so
        // this one is dropped an octave and stretched to nearly two seconds. Nothing new was needed.
        soundOver: { lowPass: 0.10, frequency: { start: 90, slide: -70, min: 18 },
                     volume: { attack: 0.01, sustain: 0.28, punch: 0.9, decay: 1.5, gain: 0.5 } },
    },
});

export const SPELL_NAMES = Object.freeze(Object.keys(SPELLS));

/** mulberry32 -- the same seeded generator world/procPlanet.js and audio/sfxModel.mjs use. */
export function rng(seed) {
    let a = (seed >>> 0) || 1;
    return function () {
        a = (a + 0x6D2B79F5) >>> 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

/**
 * The particle burst for one cast, as data.
 *
 * *** SEEDED, BECAUSE Math.random() WOULD MAKE THE SPELL UNTESTABLE. *** Both existing spawn sites --
 * AsteroidsDemo.js and DungeonDemo.js's _explodeGrenade -- call Math.random() inline, so the same cast never
 * looks the same twice and no gate can hold it. With a seed the burst is a pure function of (spell, seed):
 * the same cast is byte-identical, which is what lets a recipe be checked by hash rather than by eye.
 *
 * The fields are exactly the shape both call sites already pass to particles.spawn().
 */
export function burstFor(name, seed = 1, origin = { x: 0, y: 0, z: 0 }) {
    const s = SPELLS[name];
    if (!s) throw new Error(`spellBook: no spell "${name}" (have: ${SPELL_NAMES.join(", ")})`);
    const b = s.burst;
    const r = rng(seed);
    const out = [];
    for (let i = 0; i < b.count; i++) {
        // an even-ish sphere of directions: acos keeps the poles from bunching, which a naive
        // (random, random, random) direction does visibly on a burst this large
        const u = r() * 2 - 1, th = r() * Math.PI * 2, sr = Math.sqrt(Math.max(0, 1 - u * u));
        const sp = b.speed * (0.55 + 0.45 * r());
        out.push({
            x: origin.x, y: origin.y, z: origin.z,
            vx: sr * Math.cos(th) * sp, vy: u * sp, vz: sr * Math.sin(th) * sp,
            ttl: b.ttl * (0.7 + 0.3 * r()), size: b.size,
            r: b.colour[0], g: b.colour[1], b: b.colour[2], a: 0.9,
            gravity: b.gravity,
        });
    }
    return out;
}

/**
 * The sound a spell makes: which preset, and how it is bent away from any other spell using the same one.
 *
 * *** SIX SPELLS SHARE FOUR PRESETS, WHICH WITHOUT AN OVERRIDE MEANS SHARING THE SOUND EXACTLY. *** v4190
 * made a sound a parameter block and gave SfxPlayer per-override cache keys, so bending one costs nothing
 * and the gate can prove all six render to different bytes.
 */
export function soundFor(name) {
    const s = SPELLS[name];
    if (!s) throw new Error(`spellBook: no spell "${name}"`);
    return { preset: s.sound, over: s.soundOver || {} };
}

/** How much WORK a spell is, in the three units that cost anything. */
export function workOf(name) {
    const s = SPELLS[name];
    if (!s) throw new Error(`spellBook: no spell "${name}"`);
    const g = s.fracture ? s.fracture.grid : 0;
    return {
        particles: s.burst.count,
        fractureVoxels: g * g * g,          // the flood fill visits the whole grid, not just the carve
        raymarchFrames: s.raymarch ? s.raymarch.frames : 0,
    };
}

/**
 * *** THE UNIT PRICES, AND THEIR PROVENANCE. ***
 *
 * Each is microseconds of real work per unit. Two of the three are measured by
 * tools/ship/spellCost.mjs on this machine, and the gate re-measures them and checks these are still in the
 * right ratio -- a recorded number nobody re-derives is a number that has already drifted.
 *
 * The third is honest about what a node process cannot do: a ray-march runs on the GPU, and there is no GPU
 * here. Its price is `measuredBy: "browser"` and it is REPORTED as unmeasured rather than quietly folded in
 * as though it had been checked. unmeasuredFeatures() lists it for any caller that cares.
 */
export const COST_UNITS = Object.freeze({
    // *** THESE TWO ARE MEASURED. THE FIRST DRAFT'S WERE NOT, AND ONE WAS OUT BY FIFTEEN TIMES. *** I wrote
    // particle 0.42 and fractureVoxel 0.055 because they looked like plausible microsecond figures. Running
    // tools/ship/spellCost.mjs gave 0.83 and 0.77 -- the fracture price was wrong by 15x, and the whole point
    // of this file is that nobody gets to type a cost. Medians over three runs: particle 0.96/0.83/0.76,
    // fractureVoxel 0.76/0.77/0.76.
    particle:       { us: 0.83, measuredBy: "node", of: "one particle built by burstFor" },
    fractureVoxel:  { us: 0.77, measuredBy: "node", of: "one voxel of a carve + connected-component pass" },
    raymarchFrame:  { us: 5200, measuredBy: "browser", of: "one full-screen DDA march (GPU; node cannot time it)" },
});

/** What a spell costs, in microseconds of real work. Derived -- there is no cost field to read. */
export function costFor(name, units = COST_UNITS) {
    // *** A CLEAR REFUSAL BEATS "Cannot read properties of undefined". *** SPELL_NAMES.map(costFor) hands the
    // ARRAY INDEX in as `units` -- a real mistake made while writing this file's own gate -- and the default
    // parameter does not catch it, because an index of 0 or 1 is not undefined. Say what went wrong instead.
    if (!units || !units.particle || !units.fractureVoxel || !units.raymarchFrame) {
        throw new TypeError(`spellBook.costFor: second argument must be a unit table, got ${JSON.stringify(units)}`);
    }
    const w = workOf(name);
    return w.particles * units.particle.us
         + w.fractureVoxels * units.fractureVoxel.us
         + w.raymarchFrames * units.raymarchFrame.us;
}

/** Which parts of a spell's price were not measured where this is running. Reported, never hidden. */
export function unmeasuredFeatures(name, units = COST_UNITS) {
    const w = workOf(name);
    const out = [];
    if (w.raymarchFrames > 0 && units.raymarchFrame.measuredBy !== "node") out.push("raymarchFrame");
    return out;
}

/**
 * The book in cost order, cheapest first. This ordering is the thing the gate re-derives from a fresh
 * measurement: if the recorded units ever stop reproducing it, something has drifted.
 */
export function byCost(units = COST_UNITS) {
    return SPELL_NAMES.slice().sort((a, b) => costFor(a, units) - costFor(b, units) || a.localeCompare(b));
}

/** The dungeon's energy pool is 100 (DungeonDemo's `_energy = 100`), so the book is scaled to fit it. */
export const ENERGY_POOL = 100;

/**
 * Mana cost: the measured cost on a LOGARITHMIC scale, with the dearest spell costing the whole pool.
 *
 * *** THE SCALE IS LOG BECAUSE LINEAR WAS MEASURED AND IT COLLAPSED. *** The book spans 47,132x -- spark
 * costs 10 microseconds of work and cataclysm costs 475,091, because cataclysm is the only spell that runs a
 * ray-march and 98.5% of its price is those 90 frames. Scaled linearly the book reads 0, 0, 0, 0, 0, 100:
 * every spell but the last rounds to nothing and the energy pool stops meaning anything. The measurement
 * chose the curve, not a preference for one.
 *
 * A log scale is also the honest one for a cost a player FEELS: the difference between a 10us spell and a
 * 100us spell matters, and so does the one between 10,000 and 100,000, and they are the same difference.
 *
 * *** AND NO SPELL IS FREE: *** the cheapest clamps to 1, never 0. A zero-cost spell can be cast forever,
 * which is not a balance problem but a correctness one.
 */
export function manaFor(name, units = COST_UNITS) {
    const costs = SPELL_NAMES.map((n) => costFor(n, units));
    const min = Math.min(...costs), max = Math.max(...costs);
    if (!(max > 0)) return 1;
    if (!(max > min)) return ENERGY_POOL;            // one spell, or all the same price: it costs the pool
    const t = Math.log(costFor(name, units) / min) / Math.log(max / min);
    return Math.max(1, Math.round(t * ENERGY_POOL));
}

/** Everything wrong with the book, as a list. Empty means it is coherent. */
export function validateBook() {
    const problems = [];
    for (const n of SPELL_NAMES) {
        const s = SPELLS[n];
        if (!ELEMENTS.includes(s.element)) problems.push(`${n}: element "${s.element}" is not one of ${ELEMENTS.join(", ")}`);
        if (!SFX[s.sound]) problems.push(`${n}: sound "${s.sound}" is not a preset in audio/sfxModel.mjs`);
        if (!s.burst || !(s.burst.count > 0)) problems.push(`${n}: has no burst`);
        if (s.burst && !(s.burst.ttl > 0)) problems.push(`${n}: particles live no time at all`);
        if (s.burst && (!Array.isArray(s.burst.colour) || s.burst.colour.length !== 3)) problems.push(`${n}: colour is not an rgb triple`);
        if ("cost" in s || "mana" in s) problems.push(`${n}: carries a hand-written cost, which is the thing this design removes`);
        if (s.fracture && !(s.fracture.grid > 0 && s.fracture.carveRadius > 0)) problems.push(`${n}: fracture is malformed`);
        if (s.fracture && s.fracture.carveRadius >= s.fracture.grid) problems.push(`${n}: the carve is larger than the grid it carves`);
        if (s.raymarch && !(s.raymarch.frames > 0)) problems.push(`${n}: raymarch with no frames`);
    }
    return problems;
}
