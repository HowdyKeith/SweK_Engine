// FILE: simulation/OgreArena.js
// VERSION: v3 — round 206 (multi-lane + longer field)
//
// OgreArena defines the geometric layout of an OGRE engagement: a long
// rectangle through normal voxel terrain, with the OGRE entering at the
// far end and defenders holding the near end.
//
// Round 206 changes:
//   • Multi-lane support (1–3 parallel lanes). Each lane is a separate
//     spawn corridor. When the wave count exceeds 1 lane, lanes are
//     rotated through round-robin so OGREs come from different angles
//     each wave.
//   • Wider arena when multi-lane is active. Width-per-lane = 40u.
//     Single-lane stays at the legacy 50u half-width for backward
//     compatibility.
//   • Default fieldLength bumped 180 → 240. The user complained the
//     OGRE traversal was over too fast for defenders to mount a real
//     wave-based defense. 240 gives ~33% more dwell time.
//   • Defender slot positions adapt to the arena width — front + back
//     rows redistribute across whatever halfWidth the lanes computed.

export class OgreArena {

    constructor({ world, voxelRenderer, laneCount = 3 } = {}) {
        this.world = world;
        this.voxelRenderer = voxelRenderer;

        // Round 206 — longer default field. Was 180, now 240. The setter
        // still clamps to [120, 400] but the default now lands closer to
        // the upper end of that range so defenders get meaningful dwell.
        this.fieldLength = 240;
        // Per-lane width budget (X axis). The arena widens as lanes are
        // added so each lane gets a clear corridor. With laneCount=1 we
        // preserve the legacy 50u half-width.
        this.widthPerLane = 40;
        this.setLaneCount(laneCount);

        this.layout = null;
    }

    setFieldLength(n, opts = {}) {
        // Round 43m - was capped at 200 so half-length <= 100 < 112
        // (chunk extent at default gridRadius=7). Round 48 - cap lifted
        // to 400 so larger scenarios can request bigger fields. Round 206
        // - default raised but bounds unchanged.
        const requested = Math.max(120, Math.min(400, n | 0));
        if (opts.world?.gridRadius != null && opts.world?.chunkSize != null) {
            const extent = opts.world.gridRadius * opts.world.chunkSize;
            const maxField = (extent - 16) * 2;
            this.fieldLength = Math.min(requested, maxField);
        } else {
            this.fieldLength = requested;
        }
        return this.fieldLength;
    }

    // Round 206 — set lane count (1..3). Lanes wider than 1 expand the
    // arenaHalfWidth to widthPerLane × laneCount / 2, with a floor of 50
    // so a single lane preserves the legacy width.
    setLaneCount(n) {
        const clamped = Math.max(1, Math.min(3, n | 0));
        this.laneCount = clamped;
        // Single lane: keep legacy 50u half-width. Multi-lane: scale.
        if (clamped === 1) {
            this.arenaHalfWidth = 50;
        } else {
            this.arenaHalfWidth = Math.max(50, (this.widthPerLane * clamped) / 2);
        }
        return this.laneCount;
    }

    // Coordinate convention:
    //   +Z is "far" (OGRE entry)
    //   -Z is "near" (defender city)
    //   X is the lateral axis, perimeter at ±arenaHalfWidth

    computeLayout() {
        const halfL = this.fieldLength / 2;
        const halfW = this.arenaHalfWidth;
        const frontZ = -halfL + 50;
        const backZ  = -halfL + 28;

        // Round 206 — lane spawn positions. For laneCount=1, single spawn
        // at x=0 (legacy). For 2-3 lanes, distribute evenly across the
        // arena width, keeping each lane at least 20u from the perimeter.
        const laneSpawns = this._computeLaneSpawns(halfL, halfW);

        // Round 206 — defender slots adapt to arena width. Front row has
        // 1 slot per ~16u of width; back row 1 per ~22u. With the legacy
        // 100u-wide arena that yields the original 6/3 layout; with a
        // wider 3-lane arena (120u wide) it adds slots automatically.
        const slotPositions = this._computeDefenderSlots(halfW, frontZ, backZ);

        this.layout = {
            halfLength:    halfL,
            halfWidth:     halfW,
            laneCount:     this.laneCount,
            widthPerLane:  this.widthPerLane,
            laneSpawns,                              // [{x, z, laneIndex}, ...]
            // Legacy single ogreSpawn = lane 0 (kept for callers that
            // haven't migrated to laneSpawns yet)
            ogreSpawn:     laneSpawns[0],
            entryEdgeZ:    halfL,
            hqPos:         { x: 0, z: -halfL + 14 },
            backEdgeZ:     -halfL,
            defenderLineZ: -halfL + 32,
            slotPositions,
        };
        return this.layout;
    }

    _computeLaneSpawns(halfL, halfW) {
        const lanes = [];
        const z = halfL - 12;                        // spawn 12u inside entry edge
        if (this.laneCount === 1) {
            lanes.push({ x: 0, z, laneIndex: 0 });
            return lanes;
        }
        // Multi-lane: evenly distribute. For N lanes in a width of 2W,
        // centers sit at (-W + W/N + i * 2W/N) — symmetric around 0.
        // Margin keeps lanes away from the perimeter.
        const margin = 12;
        const inner = halfW - margin;                // distance from center to outermost lane
        for (let i = 0; i < this.laneCount; i++) {
            const t = this.laneCount === 1 ? 0.5 : i / (this.laneCount - 1);
            const x = -inner + t * (2 * inner);
            lanes.push({ x, z, laneIndex: i });
        }
        return lanes;
    }

    _computeDefenderSlots(halfW, frontZ, backZ) {
        // Round 206 — slot count scales with arena width. Single-lane
        // legacy: 6 front + 3 back = 9 slots in a 100u-wide arena.
        // 2-lane (80u wide): 5 front + 2 back. 3-lane (120u wide): 8 front + 4 back.
        const frontCount = Math.max(5, Math.round(halfW * 2 / 16));   // ~1 per 16u
        const backCount  = Math.max(2, Math.round(halfW * 2 / 28));   // ~1 per 28u
        const slots = [];
        const spread = (n, z) => {
            for (let i = 0; i < n; i++) {
                // Distribute (i + 0.5) / n across [-halfW + 8, halfW - 8]
                const t = (i + 0.5) / n;
                const x = -(halfW - 8) + t * 2 * (halfW - 8);
                slots.push({ x, z });
            }
        };
        spread(frontCount, frontZ);
        spread(backCount, backZ);
        return slots;
    }

    // Round 206 — pick lane for wave N. Round-robin through available
    // lanes so each wave comes from a different angle. With laneCount=1
    // this trivially returns 0.
    pickLaneForWave(waveNumber) {
        if (!this.layout) this.computeLayout();
        return ((waveNumber - 1) % this.laneCount + this.laneCount) % this.laneCount;
    }

    // Round 206 — get spawn position for a specific lane.
    getLaneSpawn(laneIndex) {
        if (!this.layout) this.computeLayout();
        const lanes = this.layout.laneSpawns;
        return lanes[laneIndex] ?? lanes[0];
    }

    // Perimeter test — clamp + outside check.
    isOutside(x, z) {
        const L = this.layout;
        if (!L) return false;
        return (x > L.halfWidth || x < -L.halfWidth ||
                z > L.halfLength || z < -L.halfLength);
    }

    clampInside(pos, margin = 0.5) {
        const L = this.layout;
        if (!L) return false;
        const mxW = L.halfWidth  - margin;
        const mxL = L.halfLength - margin;
        let clamped = false;
        if (pos.x >  mxW) { pos.x =  mxW; clamped = true; }
        if (pos.x < -mxW) { pos.x = -mxW; clamped = true; }
        if (pos.z >  mxL) { pos.z =  mxL; clamped = true; }
        if (pos.z < -mxL) { pos.z = -mxL; clamped = true; }
        return clamped;
    }

    build(_variant = "land") {
        this.computeLayout();
        this._savedVoxels = [];
        this._buildStructures();
        console.log(`[OgreArena] geometry: ${this.fieldLength}m long, ${this.arenaHalfWidth * 2}m wide; ${this.laneCount} lane${this.laneCount === 1 ? "" : "s"} (${this.layout.laneSpawns.map(l => `x=${l.x.toFixed(0)}`).join(", ")}); structures placed`);
    }

    _surfaceY(x, z) {
        if (!this.world) return 30;
        for (let y = this.world.chunkHeight - 1; y > 0; y--) {
            if (this.world.getVoxel(x, y, z)) return y + 1;
        }
        return 30;
    }

    _saveAndSet(x, y, z, id) {
        const prev = this.world.getVoxel(x, y, z);
        if (prev !== id) {
            this._savedVoxels.push({ x, y, z, prev });
            this.world.setVoxel(x, y, z, id);
        }
    }

    _placeBoxStone(cx, cz, w, d, h) {
        const STONE = 1;
        const gy = this._surfaceY(cx, cz);
        const halfW = (w / 2) | 0;
        const halfD = (d / 2) | 0;
        for (let dx = -halfW; dx <= halfW; dx++) {
            for (let dz = -halfD; dz <= halfD; dz++) {
                for (let dy = 0; dy < h; dy++) {
                    this._saveAndSet(cx + dx, gy + dy, cz + dz, STONE);
                }
            }
        }
    }

    _buildStructures() {
        const L = this.layout;
        // HQ stays centered regardless of lane count
        this._placeBoxStone(L.hqPos.x, L.hqPos.z, 5, 5, 14);
        // Two barracks flanking HQ (offset scales with arena width)
        const flankOffset = Math.min(14, L.halfWidth - 6);
        this._placeBoxStone(L.hqPos.x - flankOffset, L.hqPos.z, 4, 8, 5);
        this._placeBoxStone(L.hqPos.x + flankOffset, L.hqPos.z, 4, 8, 5);
        // Watchtowers at four corners of the defender end
        const wtZ = L.backEdgeZ + 8;
        const wtInset = 6;
        this._placeBoxStone( L.halfWidth - wtInset, wtZ, 3, 3, 9);
        this._placeBoxStone(-L.halfWidth + wtInset, wtZ, 3, 3, 9);
        // Drone station — mid-defender
        this._placeBoxStone(L.hqPos.x, L.hqPos.z + 12, 3, 3, 4);
    }

    unbuild() {
        if (!this._savedVoxels?.length) return;
        for (const v of this._savedVoxels) {
            this.world.setVoxel(v.x, v.y, v.z, v.prev);
        }
        this._savedVoxels = [];
    }

    // Round 251 — populate defender slots with stationary turret bots.
    // Takes a BotManager + optional FPSShooter (so turrets register as
    // enemies). Picks up to maxTurrets slot positions; if more slots
    // exist than maxTurrets, it picks the BACK row first (safer) then
    // front. Returns the spawned bot entity ids so callers can track /
    // despawn / count kills.
    //
    // Usage:
    //   const arena = new OgreArena({ world, voxelRenderer });
    //   arena.computeLayout();
    //   arena.placeTurrets({ botManager, fpsShooter, maxTurrets: 4 });
    placeTurrets({ botManager, fpsShooter = null, maxTurrets = 4, kind = "bot_turret", groundY = null, models = null } = {}) {
        if (!botManager?.spawn) return [];
        if (!this.layout) this.computeLayout();
        const slots = this.layout.slotPositions || [];
        if (slots.length === 0) return [];
        // Sort: back row first (more negative... wait, back row has
        // LARGER negative z because we offset from -halfL). Back row has
        // z = backZ = -halfL + 28 which is MORE negative than front
        // row's z = -halfL + 50. So sorting ascending by z puts back
        // row FIRST, which is what we want (safer slots placed first).
        const sorted = [...slots].sort((a, b) => a.z - b.z);
        const picks = sorted.slice(0, Math.max(0, Math.min(maxTurrets, sorted.length)));
        const ids = [];
        for (const slot of picks) {
            // Place at the world's terrain height if available, else 5
            let y = 5;
            if (groundY != null) y = groundY;
            else if (this.world?._heightAt) {
                try { y = this.world._heightAt(slot.x, slot.z) ?? 5; } catch {}
            }
            try {
                // v1374 — give each defender a library body if a civDefender pool was supplied
                const assetId = (models && models.length) ? models[(Math.random() * models.length) | 0] : null;
                // v1376 — height-normalise the library body to the civDefender target
                let scale = null;
                if (assetId && typeof window !== "undefined" && window.assetRoles?.scaleFor) { try { scale = window.assetRoles.scaleFor(assetId, "civDefender"); } catch {} }
                const ent = botManager.spawn({ x: slot.x, z: slot.z, kind, assetId, scale });
                if (ent != null) {
                    ids.push(ent);
                    if (fpsShooter?.registerEnemy) {
                        const spec = botManager.constructor?.BOT_KINDS?.[kind] ?? null;
                        fpsShooter.registerEnemy(ent, {
                            hp: spec?.hp ?? 6,
                            kind,
                        });
                    }
                }
            } catch (e) {
                // Spawn failed — continue with remaining slots
            }
        }
        this._turretIds = ids;
        return ids;
    }

    // Round 251 — remove all turrets this arena spawned. Useful for
    // cleanup between waves or on arena teardown.
    despawnTurrets({ botManager }) {
        if (!this._turretIds?.length) return 0;
        let count = 0;
        for (const id of this._turretIds) {
            try {
                if (botManager?.despawn) { botManager.despawn(id); count++; }
                else if (botManager?.remove) { botManager.remove(id); count++; }
            } catch {}
        }
        this._turretIds = [];
        return count;
    }
}
