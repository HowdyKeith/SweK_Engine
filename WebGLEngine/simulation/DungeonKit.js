// DungeonKit.js — v1388
// MODULAR-MODEL dungeon (vs the voxel DungeonDemo). Generates rooms + L-corridors
// on a cell grid, then places modular GLB kit pieces (floor / wall / doorway /
// column) from the "Dungeon" ingest folder — built for free CC0 kits like KayKit
// Dungeon Remastered or Kenney Modular Dungeon. Whatever Dungeon-folder pieces you
// have are classified by name into slots; any missing slot falls back to a wad_plate
// placeholder so the layout is always visible. Walls face inward.
//
//   window.dungeonKit.build();          // builds at the camera, classifies your pieces
//   window.dungeonKit.build({ cell: 4, rooms: 6, y: 48, placeholderOnly: true });
//   window.dungeonKit.clear();

const COLL_FLOOR_ID = 2, COLL_WALL_ID = 1, COLL_WALL_H = 3;   // v1399 — voxel collision shell (stone)
const DIRS = [
    { dx: 0, dz: -1, yaw: 0 },              // N
    { dx: 1, dz: 0,  yaw: Math.PI / 2 },    // E
    { dx: 0, dz: 1,  yaw: Math.PI },        // S
    { dx: -1, dz: 0, yaw: -Math.PI / 2 },   // W
];

// name -> slot classifier (first hit wins). Tuned for KayKit / Kenney naming.
function classify(name) {
    const n = String(name).toLowerCase();
    if (/stair|steps/.test(n)) return "stairs";
    if (/door|arch|gate|entry/.test(n)) return "door";
    if (/column|pillar|post/.test(n)) return "column";
    if (/corner/.test(n)) return "corner";
    if (/wall/.test(n)) return "wall";
    if (/floor|ground|tile|ground/.test(n)) return "floor";
    return null;
}

export class DungeonKit {
    constructor(opts = {}) {
        this._optRouter = opts.router || null;
        this._optAssetLoader = opts.assetLoader || null;
        this._optWorld = opts.world || null;
        this._ids = [];
        this._kit = null;
        this._collVox = [];   // v1399 — voxel collision shell
    }

    get router() { return this._optRouter || (typeof window !== "undefined" ? window.router : null); }
    get assetLoader() { return this._optAssetLoader || (typeof window !== "undefined" ? window.assetLoader : null); }
    get world() { return this._optWorld || (typeof window !== "undefined" ? window.world : null); }

    // ---- grid: rooms + L-corridors -> floor cell set ----------------------
    _genGrid(o) {
        const G = Math.max(12, Math.min(64, o.grid ?? 24));
        const wantRooms = Math.max(2, Math.min(12, o.rooms ?? 6));
        const rng = Math.random;
        const rooms = [];
        const overlaps = (r) => rooms.some(q => r.x0 <= q.x1 + 1 && r.x1 + 1 >= q.x0 && r.z0 <= q.z1 + 1 && r.z1 + 1 >= q.z0);
        for (let t = 0; t < 80 && rooms.length < wantRooms; t++) {
            const w = 3 + (rng() * 4 | 0), h = 3 + (rng() * 4 | 0);
            const x0 = 1 + (rng() * (G - w - 2) | 0), z0 = 1 + (rng() * (G - h - 2) | 0);
            const r = { x0, z0, x1: x0 + w, z1: z0 + h, cx: x0 + (w >> 1), cz: z0 + (h >> 1) };
            if (!overlaps(r)) rooms.push(r);
        }
        const floor = new Set();
        const key = (x, z) => x + "," + z;
        for (const r of rooms) for (let x = r.x0; x <= r.x1; x++) for (let z = r.z0; z <= r.z1; z++) floor.add(key(x, z));
        // connect each room to the previous with an L corridor (1 cell wide)
        const carveH = (x0, x1, z) => { for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) floor.add(key(x, z)); };
        const carveV = (z0, z1, x) => { for (let z = Math.min(z0, z1); z <= Math.max(z0, z1); z++) floor.add(key(x, z)); };
        for (let i = 1; i < rooms.length; i++) {
            const a = rooms[i - 1], b = rooms[i];
            carveH(a.cx, b.cx, a.cz); carveV(a.cz, b.cz, b.cx);
        }
        return { G, rooms, floor, key };
    }

    // ---- resolve which Dungeon-folder model fills each slot ----------------
    async _resolveKit() {
        const slots = { floor: null, wall: null, corner: null, door: null, column: null, stairs: null };
        try {
            const j = await fetch("/assets/folder?name=Dungeon").then(r => r.json());
            const names = (j && j.ok && j.models) ? j.models.map(m => m.name) : [];
            for (const nm of names) { const s = classify(nm); if (s && !slots[s]) slots[s] = nm; }
        } catch (e) {}
        return slots;
    }

    async _ensureLoaded(name) {
        if (!name || !this.assetLoader) return false;
        if (this.assetLoader.cache?.get(name)) return true;
        try { await this.assetLoader.loadAsset(name); return !!this.assetLoader.cache?.get(name); } catch { return false; }
    }

    _place(assetId, kind, x, y, z, yaw, sx, sy, sz) {
        if (!this.router) return null;
        try {
            const res = this.router.exec({ type: "entity:spawnMesh", assetId, kind, x, y, z, scaleX: sx, scaleY: sy, scaleZ: sz });
            const id = res && res.id;
            if (id == null) return null;
            this._ids.push(id);
            if (yaw) { try { this.router.exec({ type: "entity:move", id, x, y, z, yaw }); } catch {} }
            return id;
        } catch { return null; }
    }

    async build(o = {}) {
        this.clear();
        const CS = o.cell ?? 4;                          // KayKit tiles ~4 units
        const cam = (typeof window !== "undefined") ? window.camera : null;
        const ox = (o.x != null) ? o.x : (cam ? Math.round(cam.position.x) : 0);
        const oz = (o.z != null) ? o.z : (cam ? Math.round(cam.position.z) : 0);
        const fy = (o.y != null) ? o.y : (cam ? Math.round(cam.position.y) - 2 : 2);

        const { rooms, floor, key } = this._genGrid(o);
        const kit = o.placeholderOnly ? { floor: null, wall: null, corner: null, door: null, column: null, stairs: null } : await this._resolveKit();
        this._kit = kit;
        // pre-load whatever real pieces we resolved
        for (const k in kit) await this._ensureLoaded(kit[k]);

        // centre the grid on the spawn origin
        const cells = [...floor].map(s => s.split(",").map(Number));
        let mnx = Infinity, mnz = Infinity, mxx = -Infinity, mxz = -Infinity;
        for (const [x, z] of cells) { if (x < mnx) mnx = x; if (z < mnz) mnz = z; if (x > mxx) mxx = x; if (z > mxz) mxz = z; }
        const midx = (mnx + mxx) / 2, midz = (mnz + mxz) / 2;
        const wx = (x) => ox + (x - midx) * CS;
        const wz = (z) => oz + (z - midz) * CS;

        const PLATE = "wad_plate";   // built-in placeholder mesh
        const wyaw = o.wallYaw ?? 0;   // v1388 — global wall-facing offset (rig-verify: set if the kit's walls face the wrong way)
        let nFloor = 0, nWall = 0, nDoor = 0, nCol = 0;

        // floors
        for (const [x, z] of cells) {
            if (kit.floor) this._place(kit.floor, "dk_floor", wx(x), fy, wz(z), 0, 1, 1, 1);
            else this._place(PLATE, "dk_floor", wx(x), fy, wz(z), 0, CS * 0.5, 0.2, CS * 0.5);
            nFloor++;
        }

        // walls: every floor cell edge whose neighbour is not floor
        for (const [x, z] of cells) {
            for (const d of DIRS) {
                if (floor.has(key(x + d.dx, z + d.dz))) continue;   // interior edge -> opening / no wall
                const ex = wx(x) + d.dx * (CS / 2), ez = wz(z) + d.dz * (CS / 2);
                if (kit.wall) this._place(kit.wall, "dk_wall", ex, fy, ez, d.yaw + wyaw, 1, 1, 1);
                else this._place(PLATE, "dk_wall", ex, fy + CS * 0.5, ez, d.yaw + wyaw, CS * 0.5, CS * 0.5, 0.25);
                nWall++;
            }
        }

        // doorways: a corridor cell (degree<=2) adjacent to a room cell, if we have a door piece
        if (kit.door) {
            const inRoom = (x, z) => rooms.some(r => x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1);
            for (const [x, z] of cells) {
                if (inRoom(x, z)) continue;
                for (const d of DIRS) {
                    if (floor.has(key(x + d.dx, z + d.dz)) && inRoom(x + d.dx, z + d.dz)) {
                        const ex = wx(x) + d.dx * (CS / 2), ez = wz(z) + d.dz * (CS / 2);
                        this._place(kit.door, "dk_door", ex, fy, ez, d.yaw, 1, 1, 1); nDoor++;
                        break;
                    }
                }
            }
        }

        // columns at room interior corners, if we have a column piece
        if (kit.column) {
            for (const r of rooms) {
                for (const [cx, cz] of [[r.x0, r.z0], [r.x1, r.z0], [r.x0, r.z1], [r.x1, r.z1]]) {
                    this._place(kit.column, "dk_col", wx(cx), fy, wz(cz), 0, 1, 1, 1); nCol++;
                }
            }
        }

        // v1399 — optional VOXEL COLLISION SHELL aligned to the kit so the model dungeon
        // is actually walkable in first-person (FPS collision is voxel-based). The shell
        // hides under the floor models + behind the inward-facing walls.
        this._collVox = [];
        if (o.collision === true) {
            const w = this.world;
            if (w && w.setVoxel) {
                const yFloor = Math.round(fy) - 1, half = (CS / 2) | 0;
                const set = (vx, vy, vz, id) => { try { w.setVoxel(vx, vy, vz, id); this._collVox.push([vx, vy, vz]); } catch {} };
                for (const [cx, cz] of cells) {   // floor slab under every floor cell
                    const bx = Math.round(wx(cx)), bz = Math.round(wz(cz));
                    for (let dx = -half; dx < CS - half; dx++) for (let dz = -half; dz < CS - half; dz++) set(bx + dx, yFloor, bz + dz, COLL_FLOOR_ID);
                }
                const wallCells = new Set();   // non-floor neighbours = where the kit walls sit
                for (const [cx, cz] of cells) for (const d of DIRS) { const nx = cx + d.dx, nz = cz + d.dz; if (!floor.has(key(nx, nz))) wallCells.add(nx + "," + nz); }
                for (const wc of wallCells) {
                    const [cx, cz] = wc.split(",").map(Number);
                    const bx = Math.round(wx(cx)), bz = Math.round(wz(cz));
                    for (let dx = -half; dx < CS - half; dx++) for (let dz = -half; dz < CS - half; dz++) for (let h = 1; h <= COLL_WALL_H; h++) set(bx + dx, yFloor + h, bz + dz, COLL_WALL_ID);
                }
                console.log(`[dungeonKit] voxel collision shell: ${this._collVox.length} voxels \u2014 the kit is now walkable.`);
            } else { console.log("[dungeonKit] collision requested but no world.setVoxel available."); }
        }
        { const r0 = rooms[0]; if (r0) { const cx = (r0.x0 + r0.x1) / 2, cz = (r0.z0 + r0.z1) / 2; this._spawn = [wx(cx), Math.round(fy) + 1.2, wz(cz)]; } }

        const used = Object.entries(kit).filter(([, v]) => v).map(([k, v]) => `${k}=${v}`);
        const missing = Object.entries(kit).filter(([, v]) => !v).map(([k]) => k);
        console.log(`[dungeonKit] built ${this._ids.length} pieces (${nFloor} floor, ${nWall} wall, ${nDoor} door, ${nCol} column) at (${ox}, ${fy}, ${oz}).`);
        console.log(`[dungeonKit] resolved pieces: ${used.length ? used.join(", ") : "none — using placeholders"}. Missing slots (placeholder/skipped): ${missing.join(", ") || "none"}.`);
        if (missing.includes("floor") || missing.includes("wall")) console.log('[dungeonKit] No dungeon pieces found. Get a free CC0 kit:\n  KayKit Dungeon Remastered: https://kaylousberg.itch.io/kaykit-dungeon-remastered\n  Kenney Modular Dungeon:    https://kenney.nl/assets/modular-dungeon-kit\nUnzip the .glb files into GPU_Assets (names with floor/wall/door/column/stairs sort to the Dungeon folder), then rebuild.');
        return { ok: true, pieces: this._ids.length, kit, origin: { x: ox, y: fy, z: oz } };
    }

    clear() {
        if (this.router) for (const id of this._ids) { try { this.router.exec({ type: "entity:despawn", id }); } catch {} }
        const n = this._ids.length; this._ids = [];
        if (this._collVox && this._collVox.length) { const w = this.world; if (w && w.setVoxel) for (const [x, y, z] of this._collVox) { try { w.setVoxel(x, y, z, 0); } catch {} } const cn = this._collVox.length; this._collVox = []; if (cn) console.log(`[dungeonKit] cleared ${cn} collision voxels`); }
        if (n) console.log(`[dungeonKit] cleared ${n} pieces`);
        return n;
    }

    // v1399 — build the kit WITH a voxel collision shell and drop into first-person.
    async walk(o = {}) {
        await this.build({ ...o, collision: true });
        const s = this._spawn, cam = (typeof window !== "undefined") ? window.camera : null;
        if (s && cam) { try { cam.position.x = s[0]; cam.position.y = s[1]; cam.position.z = s[2]; cam.pitch = 0; } catch {} }
        try { window.fps && window.fps.start && window.fps.start({}); } catch {}
        console.log("[dungeonKit] first-person walk \u2014 voxel collision active; WASD through the kit, the walls block you. fps.stop() to exit.");
        return true;
    }
}
