// FILE: world/CityGen.js
// VERSION: v1 — round 253 (kaiju sandbox city generator)
//
// CityGen procedurally stamps a "small city playing field" into the
// voxel world. Designed for the KaijuSandbox game mode (round 253):
// the player starts human-sized and grows by destroying buildings, so
// the city must contain a mix of LOW buildings (cars/sheds/houses) and
// TALL buildings (skyscrapers) so growth feels staged — small kaiju
// crushes garages, medium kaiju takes apartment blocks, full kaiju
// topples skyscrapers.
//
// Geometry: flat dirt ground at y=groundY, buildings as SOLID
// rectangular columns of varying heights above ground. Buildings are
// placed with a 2-voxel gap minimum so streets exist between them.
//
// Materials: most buildings stone (id 1), some glass (id 5) for an
// "office tower" feel. The roof voxel layer is metal (id 4) so
// destroyed buildings drop distinct rubble debris colors.
//
// v4508 (buildings 1): SEEDED. Every decision here used Math.random, so a city could not be regenerated and
// nothing could say "same seed, same building" -- the bar the rest of the tree gates on. generate() takes a
// seed now and draws every generation roll (tier, height, footprint, position, glass) from world/procPlanet.js's
// mulberry32; the damage rolls (bite face, topple direction, rubble splay and sparsening) come from a SECOND
// stream seeded from the same number, so a destruction sequence replays from a seed without consuming the
// generation stream. tools/ship/cityGenSeed-selfcheck.mjs holds one seed to one voxel list byte for byte.

import { rng } from "./procPlanet.js";
import { partyWallsOf, stampFacade, facadeSeed } from "./buildingFacade.mjs";

const HEIGHT_TIERS = [
    // [minH, maxH, weight, label]
    [3,   5,  35, "shed"],         // crushable while small
    [6,   12, 30, "house"],        // crushable at small-medium
    [13,  24, 20, "midrise"],      // medium kaiju territory
    [25,  40, 10, "tower"],        // medium-large kaiju territory
    [41,  80,  4, "skyscraper"],   // full kaiju territory
    [81, 140,  1, "megastructure"],// the trophy buildings
];

function weightedPick(tiers, R) {
    const total = tiers.reduce((s, t) => s + t[2], 0);
    let roll = R() * total;
    for (const t of tiers) {
        roll -= t[2];
        if (roll <= 0) return t;
    }
    return tiers[0];
}

export class CityGen {

    constructor(world) {
        this.world = world;
        this.buildings = [];
        // Round 285 — observer hook fired when a building topples.
        // Subscribers receive { building, dir, cause }. Used by the
        // sandbox to drop score pickups and bump mission progress.
        // Multiple subscribers supported via array.
        this._onBuildingDestroyed = [];
        this._lastStamp = null;   // record so unbuild() can restore
        this.seed = 1;
        this._damageRng = rng(this.seed ^ 0x9e3779b9);   // the damage stream, reseeded by generate()
    }

    // Generate a city centered at (centerX, centerZ).
    //   radius        — half-width of city in voxels (default 80 = 160² playfield)
    //   buildingCount — target number of buildings (placement may end short
    //                   if random packing fills up the area)
    //   groundY       — Y coordinate of ground plane (default 0)
    //   seed          — every roll below comes from this (default 1): the same seed stamps the same city
    //   facades       — v4510 (buildings 3): windows, doors and party walls from world/buildingFacade.mjs (default true)
    //   minGap        — voxels of street between buildings (default 2); 0 lets buildings touch and share walls
    //
    // Returns the list of placed building rects.
    generate({ centerX = 0, centerZ = 0, radius = 80, buildingCount = 30, groundY = 0, seed = 1, facades = true, minGap = 2 } = {}) {
        if (!this.world?.setVoxel) {
            throw new Error("CityGen.generate: world.setVoxel required");
        }
        this.buildings = [];
        this.seed = seed >>> 0;
        const R = rng(this.seed);
        this._damageRng = rng(this.seed ^ 0x9e3779b9);
        this._lastStamp = { centerX, centerZ, radius, groundY, seed: this.seed, facades, minGap };

        // 1. Ground plane — flat dirt
        for (let x = -radius; x <= radius; x++) {
            for (let z = -radius; z <= radius; z++) {
                this.world.setVoxel(centerX + x, groundY, centerZ + z, 2);
            }
        }

        // 2. Place buildings with overlap avoidance
        const placed = [];
        const margin = 4;          // keep buildings away from playfield edge
        const innerHalf = radius - margin;
        const attempts = buildingCount * 8;

        for (let i = 0; i < attempts && placed.length < buildingCount; i++) {   // v4510: buildings are pushed after placement now
            const [minH, maxH] = weightedPick(HEIGHT_TIERS, R);
            const h = minH + Math.floor(R() * (maxH - minH + 1));
            // Wider for taller buildings (skyscrapers have bigger footprint)
            const fpScale = Math.max(0.4, Math.min(1.0, h / 40));
            const w = Math.max(3, 3 + Math.floor(R() * 6 * fpScale));
            const d = Math.max(3, 3 + Math.floor(R() * 6 * fpScale));
            // Position so the whole building fits inside the radius
            const maxX = innerHalf - w;
            const maxZ = innerHalf - d;
            const bx = -innerHalf + Math.floor(R() * (2 * maxX + 1));
            const bz = -innerHalf + Math.floor(R() * (2 * maxZ + 1));

            // Overlap check (with gap)
            const rect = { x: bx, z: bz, w, d, h };
            let overlaps = false;
            for (const r of placed) {
                if (bx < r.x + r.w + minGap && bx + w + minGap > r.x &&
                    bz < r.z + r.d + minGap && bz + d + minGap > r.z) {
                    overlaps = true;
                    break;
                }
            }
            if (overlaps) continue;
            placed.push(rect);

            // Material: glass for tall slim buildings (office towers),
            // stone for everything else
            const isGlassy = h >= 20 && R() < 0.4;
            rect.mat = isGlassy ? 5 : 1;
            rect.roofMat = 4;     // metal cap reads as "roof"
        }
        // v4510 -- stamp after ALL are placed: a party wall is a fact about two buildings
        this._stampAll(placed, { centerX, centerZ, groundY, facades });
        return this.buildings;
    }

    // v4510 (buildings 3) -- place GIVEN rects ({ x, z, w, d, h, mat?, roofMat? } relative to the centre) and stamp them:
    // the gate's way to put two buildings wall to wall on purpose. No ground plane.
    generateFrom(rects, { centerX = 0, centerZ = 0, groundY = 0, seed = 1, facades = true } = {}) {
        if (!this.world?.setVoxel) throw new Error("CityGen.generateFrom: world.setVoxel required");
        this.buildings = [];
        this.seed = seed >>> 0;
        this._damageRng = rng(this.seed ^ 0x9e3779b9);
        this._lastStamp = { centerX, centerZ, radius: 0, groundY, seed: this.seed, facades, minGap: 0 };
        this._stampAll(rects.map((r) => ({ mat: 1, roofMat: 4, ...r })), { centerX, centerZ, groundY, facades });
        return this.buildings;
    }

    _stampAll(placed, { centerX, centerZ, groundY, facades }) {
        const flags = facades ? partyWallsOf(placed) : null;
        placed.forEach((rect, index) => {
            const { x: bx, z: bz, w, d, h } = rect, wallMat = rect.mat ?? 1, roofMat = rect.roofMat ?? 4;
            // Stamp the building (solid column with metal roof voxel layer)
            for (let xi = 0; xi < w; xi++) {
                for (let zi = 0; zi < d; zi++) {
                    for (let yi = 0; yi < h; yi++) {
                        const mat = yi === h - 1 ? roofMat : wallMat;
                        this.world.setVoxel(centerX + bx + xi, groundY + 1 + yi, centerZ + bz + zi, mat);
                    }
                }
            }
            let voxels = w * d * h, facade = null;
            if (facades) {
                facade = stampFacade(this.world, { x: centerX + bx, z: centerZ + bz, w, d, h }, flags[index], facadeSeed(this.seed, index), groundY);
                voxels -= facade.doors;   // a door is an opening: the hit points are the voxels that exist
            }
            this.buildings.push({
                x: centerX + bx, z: centerZ + bz, w, d, h,
                mat: wallMat,
                roofMat,
                party: flags ? flags[index] : null,
                facade: facade ? { seed: facadeSeed(this.seed, index), hash: facade.grammar.hash, glass: facade.glass, doors: facade.doors, stairsColumn: facade.grammar.stairsColumn } : null,
                // Round 275 — HP + damage state for crumbling + topple.
                // hp is voxel count × 1.0 (each voxel = 1hp). The
                // sandbox damage() helper decrements; at hp <= 0 the
                // building is marked toppled and its voxels are either
                // cleared or rotated into rubble (see topple()).
                maxHp:     voxels,
                hp:        voxels,
                state:     "standing",  // standing | damaged | crumbling | toppled
                _lastHitMs: 0,
                _damageMarks: 0,        // count of crumble passes already applied
            });
        });
    }

    // ====================== ROUND 275 — DAMAGE + CRUMBLE + TOPPLE ===========
    //
    // Buildings now have HP. Damage them with damageAt(wx, wz, amount)
    // — looks up the building covering (wx, wz) and reduces its hp.
    // At threshold values (75/50/25%) we trigger a "crumble pass" that
    // removes a chunk of voxels from the building so the player SEES
    // the damage (top layer gone, then a side bite, etc). At 0 hp the
    // building topples — voxels are translated horizontally into rubble
    // on the ground, fall direction is opposite the hit, and adjacent
    // buildings within the fall radius take spill-over damage.

    // Find building containing world coord (wx, wz). Returns the
    // building object or null. O(n) — fine for our ~30-building cities.
    buildingAt(wx, wz) {
        for (const b of this.buildings) {
            if (wx >= b.x && wx < b.x + b.w && wz >= b.z && wz < b.z + b.d) {
                return b;
            }
        }
        return null;
    }

    // Apply damage from a world-space hit. amount is the HP to remove
    // (1.0 = single voxel hit; a kaiju stomp could pass 30+). Returns
    // { building, crumbled, toppled } so the caller can fire FX based
    // on what happened. Cascade is opt-in: when amount comes from a
    // topple's _cascade flag, we don't propagate further (limit chain
    // depth to 1 so cities don't disintegrate from a single seed hit).
    damageAt(wx, wz, amount, fromDirection = null, cascade = false) {
        const b = this.buildingAt(wx, wz);
        if (!b || b.state === "toppled") return null;
        b.hp = Math.max(0, b.hp - amount);
        b._lastHitMs = (typeof performance !== "undefined") ? performance.now() : Date.now();
        const pct = b.hp / b.maxHp;
        let crumbled = false;
        let toppled  = false;
        // Crumble thresholds — apply ONCE per pass crossed. _damageMarks
        // tracks how many passes we've already done so the same hit
        // doesn't ablate the same chunk twice.
        const targetMarks = (pct <= 0.25) ? 3 : (pct <= 0.50) ? 2 : (pct <= 0.75) ? 1 : 0;
        while (b._damageMarks < targetMarks) {
            this._applyCrumblePass(b, b._damageMarks);
            b._damageMarks++;
            crumbled = true;
        }
        if (b.hp <= 0 && b.state !== "toppled") {
            this._topple(b, fromDirection, cascade);
            toppled = true;
        } else if (crumbled && b.state === "standing") {
            b.state = "damaged";
        }
        return { building: b, crumbled, toppled };
    }

    // Apply one crumble pass to a building. Pass index 0 = top layer
    // gone (decapitation), 1 = side bite from a random direction,
    // 2 = larger chunk taken from base. Voxels become AIR (id 0). The
    // physical pattern reads as "more and more broken" without needing
    // a real physics sim.
    _applyCrumblePass(b, passIdx) {
        if (!this.world?.setVoxel) return;
        const groundY = (this._lastStamp?.groundY ?? 0) + 1;
        if (passIdx === 0) {
            // Top layer — remove the metal roof + 1-2 layers below.
            // Skyscrapers lose a meaningful chunk visually.
            const layers = Math.min(b.h - 2, 1 + Math.floor(b.h * 0.06));
            for (let li = 0; li < layers; li++) {
                const y = groundY + b.h - 1 - li;
                for (let xi = 0; xi < b.w; xi++) {
                    for (let zi = 0; zi < b.d; zi++) {
                        try { this.world.setVoxel(b.x + xi, y, b.z + zi, 0); } catch {}
                    }
                }
            }
        } else if (passIdx === 1) {
            // Side bite — pick a random face and gnaw a ~⅓ × ½ chunk
            // out of it (full height for the bite extent so it looks
            // like the wall buckled, not a hole punched through).
            const face = Math.floor(this._damageRng() * 4);
            const biteW = Math.max(2, Math.floor(b.w / 3));
            const biteD = Math.max(2, Math.floor(b.d / 3));
            const biteH = Math.max(3, Math.floor(b.h / 2));
            let x0 = 0, x1 = 0, z0 = 0, z1 = 0;
            if (face === 0)      { x0 = 0;          x1 = biteW;   z0 = 0;        z1 = b.d; }   // -X face
            else if (face === 1) { x0 = b.w - biteW; x1 = b.w;    z0 = 0;        z1 = b.d; }   // +X face
            else if (face === 2) { x0 = 0;          x1 = b.w;    z0 = 0;         z1 = biteD; }   // -Z face
            else                 { x0 = 0;          x1 = b.w;    z0 = b.d-biteD; z1 = b.d; }   // +Z face
            for (let xi = x0; xi < x1; xi++) {
                for (let zi = z0; zi < z1; zi++) {
                    for (let yi = 0; yi < biteH; yi++) {
                        const y = groundY + b.h - 1 - yi;
                        try { this.world.setVoxel(b.x + xi, y, b.z + zi, 0); } catch {}
                    }
                }
            }
            b.state = "crumbling";
        } else {
            // Pass 2 — base chunk. Removes a portion of the bottom
            // courses; this is the "leaning tower" look right before
            // collapse.
            const chunkH = Math.max(2, Math.floor(b.h / 4));
            const chunkW = Math.max(2, Math.floor(b.w * 0.6));
            const chunkD = Math.max(2, Math.floor(b.d * 0.6));
            const x0 = Math.floor((b.w - chunkW) / 2);
            const z0 = Math.floor((b.d - chunkD) / 2);
            for (let xi = x0; xi < x0 + chunkW; xi++) {
                for (let zi = z0; zi < z0 + chunkD; zi++) {
                    for (let yi = 0; yi < chunkH; yi++) {
                        const y = groundY + yi;
                        try { this.world.setVoxel(b.x + xi, y, b.z + zi, 0); } catch {}
                    }
                }
            }
        }
    }

    // Topple a building. The remaining voxels get rotated 90° around
    // the base in the chosen direction, producing a horizontal rubble
    // pile. Adjacent buildings within the fall extent take cascade
    // damage proportional to their overlap. Cascade is depth-limited
    // (one level) so a single hit can't level the entire city.
    _topple(b, fromDirection = null, cascade = false) {
        if (b.state === "toppled") return;
        b.state = "toppled";
        // Pick fall direction. If the hit came from a known direction,
        // fall AWAY from the impact (Newton + drama). Otherwise random.
        // Direction is a 2D unit vector {x, z}.
        let dir;
        if (fromDirection?.x != null) {
            const mag = Math.hypot(fromDirection.x, fromDirection.z) || 1;
            dir = { x: fromDirection.x / mag, z: fromDirection.z / mag };
        } else {
            const a = this._damageRng() * Math.PI * 2;
            dir = { x: Math.cos(a), z: Math.sin(a) };
        }
        // Snap to cardinal — voxels are axis-aligned, diagonal topples
        // look messy. Pick whichever axis has the larger component.
        if (Math.abs(dir.x) > Math.abs(dir.z)) dir = { x: Math.sign(dir.x), z: 0 };
        else                                    dir = { x: 0, z: Math.sign(dir.z) };

        const groundY = (this._lastStamp?.groundY ?? 0) + 1;
        // Pivot at the base edge that's on the fall side (so the
        // building tips OVER that edge). For +X fall, pivot at b.x+b.w-1.
        const pivotX = (dir.x > 0) ? b.x + b.w - 1 : (dir.x < 0 ? b.x : null);
        const pivotZ = (dir.z > 0) ? b.z + b.d - 1 : (dir.z < 0 ? b.z : null);

        // Erase the original building voxels first
        for (let xi = 0; xi < b.w; xi++) {
            for (let zi = 0; zi < b.d; zi++) {
                for (let yi = 0; yi < b.h; yi++) {
                    try { this.world.setVoxel(b.x + xi, groundY + yi, b.z + zi, 0); } catch {}
                }
            }
        }

        // Stamp the rotated rubble. For a building of height h falling
        // along +X, the column at xi=0 ends up at distance 0 from the
        // pivot, xi=b.w-1 ends at b.w-1 from pivot, and the height
        // becomes the horizontal extent (height yi maps to distance
        // yi+1 from pivot). Pile flattens 1 voxel high on the ground.
        const dbgVoxCount = b.w * b.d * b.h;
        let rubbleVox = 0;
        for (let xi = 0; xi < b.w; xi++) {
            for (let zi = 0; zi < b.d; zi++) {
                for (let yi = 0; yi < b.h; yi++) {
                    // World coord pre-rotation
                    let wx = b.x + xi;
                    let wz = b.z + zi;
                    // Apply rotation around pivot:
                    if (dir.x !== 0) {
                        // Falling along ±X. Move (yi)-many voxels in the
                        // dir.x direction PAST the pivot.
                        wx = pivotX + dir.x * (yi + 1);
                        // Slight scatter perpendicular for a "splay"
                        if (yi > 3 && this._damageRng() < 0.18) {
                            wz += this._damageRng() < 0.5 ? -1 : 1;
                        }
                    } else {
                        wz = pivotZ + dir.z * (yi + 1);
                        if (yi > 3 && this._damageRng() < 0.18) {
                            wx += this._damageRng() < 0.5 ? -1 : 1;
                        }
                    }
                    // Sparsen the rubble so it reads as broken, not
                    // a solid log. Material mostly stone with metal
                    // (roof) bits mixed in near the top of the pile.
                    if (this._damageRng() < 0.32) continue;
                    const isRoofBit = yi >= b.h - 2 && this._damageRng() < 0.5;
                    const mat = isRoofBit ? (b.roofMat ?? 4) : (b.mat ?? 1);
                    try { this.world.setVoxel(wx, groundY, wz, mat); rubbleVox++; } catch {}
                }
            }
        }

        // Cascade — adjacent buildings within the fall extent take
        // proportional damage. Only fires when this isn't itself a
        // cascade hit (depth limit = 1).
        if (!cascade) {
            const fallEndX = (dir.x !== 0) ? (pivotX + dir.x * b.h) : (b.x + b.w/2);
            const fallEndZ = (dir.z !== 0) ? (pivotZ + dir.z * b.h) : (b.z + b.d/2);
            const fallSpread = 2;       // how wide the falling building's "footprint" reaches
            for (const other of this.buildings) {
                if (other === b || other.state === "toppled") continue;
                // Does the other building's footprint overlap our fall
                // path? Compute the AABB of the fall and check overlap.
                const minX = Math.min(b.x + b.w/2, fallEndX) - fallSpread;
                const maxX = Math.max(b.x + b.w/2, fallEndX) + fallSpread;
                const minZ = Math.min(b.z + b.d/2, fallEndZ) - fallSpread;
                const maxZ = Math.max(b.z + b.d/2, fallEndZ) + fallSpread;
                if (other.x + other.w <= minX || other.x >= maxX) continue;
                if (other.z + other.d <= minZ || other.z >= maxZ) continue;
                // Distance from us to them — closer = more damage
                const dxC = (other.x + other.w/2) - (b.x + b.w/2);
                const dzC = (other.z + other.d/2) - (b.z + b.d/2);
                const dist = Math.hypot(dxC, dzC);
                const reach = b.h;
                const falloff = Math.max(0, 1 - dist / reach);
                const cascadeDmg = other.maxHp * 0.55 * falloff;
                if (cascadeDmg > 1) {
                    this.damageAt(other.x + other.w/2, other.z + other.d/2,
                                  cascadeDmg, { x: dxC, z: dzC }, true);
                }
            }
        }
        console.log(`[CityGen] ${b.h}u building toppled toward (${dir.x},${dir.z}) — ${rubbleVox}/${dbgVoxCount} rubble voxels stamped`);
        // Round 285 — emit observer event
        for (const fn of this._onBuildingDestroyed) {
            try { fn({ building: b, dir, cascade }); }
            catch (e) { console.warn("[CityGen.onBuildingDestroyed listener]", e?.message ?? e); }
        }
    }

    // Round 285 — public subscription API
    onBuildingDestroyed(fn) {
        if (typeof fn === "function") this._onBuildingDestroyed.push(fn);
        return () => {
            const i = this._onBuildingDestroyed.indexOf(fn);
            if (i >= 0) this._onBuildingDestroyed.splice(i, 1);
        };
    }

    // Compute total voxel count of all buildings — useful for grading
    // "% city destroyed" in HUD.
    getTotalBuildingVoxels() {
        let total = 0;
        for (const b of this.buildings) total += b.maxHp;   // v4510: the voxels that exist (doors are openings), not w * d * h
        return total;
    }

    // Count voxels NOT currently destroyed (still standing). Slower —
    // call sparingly (e.g. every few seconds, not every frame).
    countStandingVoxels() {
        let total = 0;
        for (const b of this.buildings) {
            for (let xi = 0; xi < b.w; xi++) {
                for (let zi = 0; zi < b.d; zi++) {
                    for (let yi = 0; yi < b.h; yi++) {
                        const y = (this._lastStamp?.groundY ?? 0) + 1 + yi;
                        if (this.world.voxelAt(b.x + xi, y, b.z + zi) !== 0) total++;
                    }
                }
            }
        }
        return total;
    }

    // Restore the world to what it was before generate(). Quick and
    // dirty — just clears all the voxels in the playfield.
    unbuild() {
        if (!this._lastStamp) return;
        const { centerX, centerZ, radius, groundY } = this._lastStamp;
        for (const b of this.buildings) {
            for (let xi = 0; xi < b.w; xi++) {
                for (let zi = 0; zi < b.d; zi++) {
                    for (let yi = 0; yi < b.h; yi++) {
                        try { this.world.setVoxel(b.x + xi, groundY + 1 + yi, b.z + zi, 0); } catch {}
                    }
                }
            }
        }
        for (let x = -radius; x <= radius; x++) {
            for (let z = -radius; z <= radius; z++) {
                try { this.world.setVoxel(centerX + x, groundY, centerZ + z, 0); } catch {}
            }
        }
        this.buildings = [];
        this._lastStamp = null;
    }
}
