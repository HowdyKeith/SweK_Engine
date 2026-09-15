// WebGLEngine/physics/spellAmmo.mjs -- v4592 (task 81): the dungeon spellbook as the car turret's ammunition, and the pickups that load it
//
// Keith asked whether the car turrets could have the same spellbook ammo as the dungeon spellbook -- reusing the effects and the
// damage scale -- with power pickups applying toward the ammo choice. THE BOOK IS READ, NOT COPIED: every ammo type IS a spell of
// world/spellBook.mjs (AMMO_NAMES is SPELL_NAMES itself), and what a shell does on landing is the spell's own row -- `damage` (the
// scale the dungeon uses: 3 for a spark, 40 for a cataclysm), `radius` (the splash, with the dungeon grenade's linear falloff
// 1 - d / R), `ignite` (ember lights a Doom Fire under the car it hits: physics/slick.mjs's patch, free of the gunner's reload),
// `slow` (frostbite halves the target's throttle for the spell's seconds, DungeonDemo's ai.slow(id, 3.0)), `pool` (causticSpray
// leaves a caustic pool of the book's { seconds, dps } that burns what stands in it: the dungeon's _pools row). Change a number
// in the book and the turret changes with it; there is no second table to drift.
//
// THE PLAIN SHELL IS THE SPELL OF LEAST DAMAGE. A turret starts loaded with `spark` (damage 3, the book's smallest) and never
// runs out of it; its impulse is TURRET.hitImpulse, so every round before this one -- the turret's, the gunner's, the slick's --
// lands the same numbers. A stronger spell's impulse is scaled by its damage over spark's.
//
// THE PICKUPS ARE THE COST MODEL, TURNED AROUND. A pickup on the track loads a spell and holds ENERGY_POOL / manaFor(spell)
// shells of it (the mana the book DERIVES from measured work, v4192): a cataclysm pickup is one shell, a spark pickup ten, and
// novaBurst -- the book's CHEAPEST spell by measured cost, eight particles ported from ev/shipDebris.mjs, though its damage is
// 12 -- a hundred: the magazine follows the cost, not the damage, which is the book's own rule and the reason the pickups are
// not a second balance table. The pickups sit on the centreline every AMMO.spacing metres, their spells cycling through the book in cost order from a
// seeded start, and respawn after AMMO.respawnTicks; a car within AMMO.pickupRadius takes one. The gunner's contract is
// unchanged (yaw, pitch, fire, drop, ignite): what the shell carries is the turret's state, a pure function of the pickups the
// car drove over, so a race replays from its input log and the fingerprint folds the ammo and the pickups.
"use strict";
import { SPELLS, SPELL_NAMES, manaFor, ENERGY_POOL, byCost } from "../world/spellBook.mjs";
import * as S from "./slick.mjs";

export const AMMO = Object.freeze({
    plain: "spark",               // the shell every turret has without end
    pickupRadius: 2.2,            // m from a car's chassis centre to a pickup to take it
    respawnTicks: 900,            // 15 s
    spacing: 24,                  // m of centreline between pickups
    lateral: 1.5,                 // a pickup sits this far from the centreline, left or right by the seed
    slowFactor: 0.5,              // a slowed car's throttle
    maxPickups: 32,
});
export const AMMO_NAMES = SPELL_NAMES;   // the book itself: the same frozen array, not a copy
export const ammoIndex = (name) => AMMO_NAMES.indexOf(name);

/** Shells a pickup of a spell holds: the energy pool over the spell's measured mana, never under one. */
export function shellsPerPickup(name) { return Math.max(1, Math.round(ENERGY_POOL / manaFor(name))); }

/** A turret's magazine: what is loaded, how many of it, and what else it holds. */
export function createAmmo() { return { loaded: AMMO.plain, count: Infinity, held: {}, taken: 0 }; }

/** Load a pickup's spell: the newest pickup is what fires next; the rest waits in `held`. */
export function takePickup(ammo, name, shells = shellsPerPickup(name)) {
    if (!SPELLS[name]) throw new Error(`spellAmmo: no spell "${name}"`);
    // the plain shell's endless magazine is not a magazine: a pickup of it (spark x10) is a finite one that gives way to the endless one again
    if (ammo.loaded !== name && Number.isFinite(ammo.count)) ammo.held[ammo.loaded] = (ammo.held[ammo.loaded] || 0) + ammo.count;
    ammo.count = (ammo.loaded === name && Number.isFinite(ammo.count) ? ammo.count : (ammo.held[name] || 0)) + shells; delete ammo.held[name];
    ammo.loaded = name; ammo.taken++;
    return ammo;
}

/** Fire one shell: the loaded spell's name; at zero the fullest held magazine takes over, else the plain shell. */
export function spendShell(ammo) {
    const name = ammo.loaded;
    if (Number.isFinite(ammo.count)) {
        ammo.count--;
        if (ammo.count <= 0) {
            const next = Object.keys(ammo.held).sort((a, b) => ammo.held[b] - ammo.held[a] || a.localeCompare(b))[0];
            if (next) { ammo.loaded = next; ammo.count = ammo.held[next]; delete ammo.held[next]; } else { ammo.loaded = AMMO.plain; ammo.count = Infinity; }
        }
    }
    return name;
}

/** The dungeon grenade's falloff: full at the point, nothing at the spell's radius. */
export const falloff = (dist, radius) => Math.max(0, 1 - dist / radius);

/** What a spell's shell does at `dist` from where it lands, read from the book's row. */
export function hitEffect(name, dist = 0) {
    const s = SPELLS[name]; if (!s) throw new Error(`spellAmmo: no spell "${name}"`);
    const f = falloff(dist, s.radius);
    return { ammo: name, element: s.element, radius: s.radius, falloff: f, damage: s.damage * f, impulseScale: (s.damage / SPELLS[AMMO.plain].damage) * f,
             ignite: !!s.ignite, slow: s.slow || 0, pool: s.pool ? { seconds: s.pool.seconds, dps: s.pool.dps } : null, colour: s.burst.colour };
}

/** The cars a landing shell reaches: the one it hit at distance 0, and every other within the spell's radius of the point. */
export function splashTargets(name, point, poses, hitIndex, owner) {
    const r = SPELLS[name].radius, out = [];
    for (let i = 0; i < poses.length; i++) {
        if (i === owner) continue;
        const d = i === hitIndex ? 0 : Math.hypot(poses[i].pos[0] - point[0], poses[i].pos[1] - point[1], poses[i].pos[2] - point[2]);
        if (d < r) out.push({ index: i, dist: d });
    }
    return out;
}

/**
 * A shell landed: the effects on every car it reaches, applied to the world and the state. `hit` is turret.mjs's event
 * ({ owner, target, point, dir }) with the shell's `ammo`. Returns the effects applied, one per car reached.
 */
export function applyHit(hit, { world, cars, turrets, poses, slicks = null, t = 0, spec }) {
    const name = hit.ammo || AMMO.plain, out = [];
    for (const { index, dist } of splashTargets(name, hit.point, poses, hit.target, hit.owner)) {
        const e = hitEffect(name, dist), tg = turrets[index], mine = turrets[hit.owner];
        world.impulse(cars[index].body, [hit.dir[0] * spec.hitImpulse * e.impulseScale, hit.dir[1] * spec.hitImpulse * e.impulseScale, hit.dir[2] * spec.hitImpulse * e.impulseScale]);
        tg.damageTaken = (tg.damageTaken || 0) + e.damage; mine.damageDealt = (mine.damageDealt || 0) + e.damage;
        if (e.slow > 0) tg.slowUntil = Math.max(tg.slowUntil || 0, t + Math.round(e.slow / (1 / 60)));
        if (slicks && index === hit.target) {
            if (e.ignite) { S.dropSlick(slicks, poses[index], hit.owner, t, slicks.spec, { free: true, at: [poses[index].pos[0], poses[index].pos[2]] }); S.igniteSlick(slicks, hit.owner, t); }
            if (e.pool) S.dropSlick(slicks, poses[index], hit.owner, t, slicks.spec, { free: true, at: [poses[index].pos[0], poses[index].pos[2]], acid: e.pool });
        }
        out.push({ ...e, car: index, dist, owner: hit.owner });
    }
    return out;
}

/** Is a car slowed at tick t? The throttle it may use. */
export const throttleFactor = (turret, t) => (turret && turret.slowUntil > t ? AMMO.slowFactor : 1);

// ---- the pickups ------------------------------------------------------------------------------------------------------------
/** A point `s` metres along the closed centreline, and the unit normal (left) there. */
export function centrelinePoint(pts, s) {
    let total = 0; const L = []; for (let i = 0; i < pts.length; i++) { const a = pts[i], b = pts[(i + 1) % pts.length]; const l = Math.hypot(b[0] - a[0], b[1] - a[1]); L.push(l); total += l; }
    let d = ((s % total) + total) % total;
    for (let i = 0; i < pts.length; i++) {
        if (d <= L[i] || i === pts.length - 1) { const a = pts[i], b = pts[(i + 1) % pts.length], f = L[i] > 0 ? d / L[i] : 0, tx = (b[0] - a[0]) / (L[i] || 1), tz = (b[1] - a[1]) / (L[i] || 1); return { x: a[0] + (b[0] - a[0]) * f, z: a[1] + (b[1] - a[1]) * f, nx: -tz, nz: tx, total }; }
        d -= L[i];
    }
    return { x: pts[0][0], z: pts[0][1], nx: 0, nz: 1, total };
}

/** mulberry32, the tree's seeded generator (world/spellBook.mjs's rng is the same). */
function rng(seed) { let a = (seed >>> 0) || 1; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

/**
 * The pickups of a track: one every AMMO.spacing metres of centreline from a seeded start, its spell the next in the book's cost
 * order from a seeded first, left or right of the line by the seed, at the road's height. Deterministic in (track, seed).
 */
export function pickupField(surface, { seed = 1, spec = AMMO, y = null } = {}) {
    const pts = surface.centreline, r = rng(seed ^ 0xA1104), order = byCost(), total = centrelinePoint(pts, 0).total;
    const n = Math.min(spec.maxPickups, Math.max(1, Math.floor(total / spec.spacing))), start = r() * spec.spacing, first = Math.floor(r() * order.length);
    const pickups = [];
    for (let k = 0; k < n; k++) {
        const s = start + k * spec.spacing, p = centrelinePoint(pts, s), side = r() < 0.5 ? -1 : 1, x = p.x + p.nx * spec.lateral * side, z = p.z + p.nz * spec.lateral * side;
        pickups.push({ id: k, x, y: y == null ? surface.at(x, z).y + 0.6 : y, z, s, spell: order[(first + k) % order.length], takenAt: -1, respawnAt: 0, taken: 0 });
    }
    return { seed, spec, pickups, total, events: [] };
}

export const pickupAvailable = (p, t) => p.takenAt < 0 || t >= p.respawnAt;

/** Each tick: a car within reach of an available pickup takes it into its turret's magazine. Returns the events. */
export function collectPickups(field, poses, turrets, t, spec = field.spec) {
    const events = [];
    for (const p of field.pickups) {
        if (!pickupAvailable(p, t)) continue;
        for (let i = 0; i < poses.length; i++) {
            const d = Math.hypot(poses[i].pos[0] - p.x, poses[i].pos[2] - p.z);
            if (d > spec.pickupRadius) continue;
            turrets[i].ammo = turrets[i].ammo || createAmmo(); takePickup(turrets[i].ammo, p.spell);
            p.takenAt = t; p.respawnAt = t + spec.respawnTicks; p.taken++;
            events.push({ kind: "pickup", car: i, pickup: p.id, spell: p.spell, shells: turrets[i].ammo.count, t }); break;
        }
    }
    return events;
}

/** The lockstep folds: the pickups' clocks, and every turret's magazine. */
export function pickupHash(h, field, fold) { for (const p of field.pickups) { h = fold(h, p.takenAt); h = fold(h, p.taken); } return h; }
export function ammoHash(h, turrets, fold) {
    for (const t of turrets) { const a = t.ammo; h = fold(h, a ? ammoIndex(a.loaded) : 0); h = fold(h, a && Number.isFinite(a.count) ? a.count : -1); h = fold(h, t.slowUntil || 0); h = fold(h, Math.round((t.damageTaken || 0) * 1e3) | 0); }
    return h;
}

/** The front door. */
export function reportLines() {
    const rows = byCost().map((n) => `${n} ${SPELLS[n].damage}dmg r${SPELLS[n].radius} x${shellsPerPickup(n)}`);
    return [
        "[spellAmmo] the dungeon spellbook as the turret's ammunition: every ammo type IS a spell of world/spellBook.mjs, its damage, radius, ignite, slow and pool read from the book's own row; the plain shell is spark, the spell of least damage",
        `  a pickup holds ENERGY_POOL / manaFor(spell) shells (the book's measured cost, turned around): ${rows.join(", ")}`,
        `  pickups every ${AMMO.spacing} m of centreline, ${AMMO.lateral} m off it, taken within ${AMMO.pickupRadius} m, back after ${AMMO.respawnTicks / 60} s; a slowed car drives at ${AMMO.slowFactor} throttle; the fingerprint folds the magazines and the pickups`,
    ];
}
