// FILE: simulation/DungeonDemo.js
// VERSION: v1369 — a procedurally generated voxel DUNGEON: stone-walled rooms
// joined by corridors, with a torch-lit explorer that auto-walks (BFS) from the
// entrance room to the treasure, then a fresh dungeon spawns. Camera follows the
// explorer with a V toggle between TOP-DOWN chase and OVER-THE-SHOULDER, exactly
// like MazeDemo (which this mirrors). Built entirely from voxels via world.setVoxel
// — the proven sandbox path — so it's self-contained on a floating slab.
//
// Voxel ids (world/voxelFormat.js): AIR 0, STONE 1 (walls), DIRT 2 (floor),
// SAND 4 (treasure marker), WATER 10 (pools), LAVA 12 (explorer + torches).

import { makeDungeonAI } from "./DungeonAI.js";   // v1400 — monster chase + attack
import { deriveLayout } from "./DungeonLayout.js";   // v1405 — imported map layouts

const AIR = 0, WALL_ID = 1, FLOOR_ID = 2, TREASURE_ID = 4, WATER_ID = 10, TORCH_ID = 12, EXPLORER_ID = 12;
const FY = 48;            // floor height (floats above terrain — self-contained)
const WALL_H = 3;
const STEP_S = 0.16;      // seconds per cell hop (corridors are cell-by-cell)
const REST_S = 1.0;       // pause on the treasure before a new dungeon

function headingYaw(dgx, dgz) {       // engine forward = (sin yaw, , -cos yaw)
    if (dgx > 0) return Math.PI / 2;
    if (dgx < 0) return -Math.PI / 2;
    if (dgz > 0) return Math.PI;
    return 0;
}
function lerpAngle(a, b, t) {
    let d = b - a;
    while (d > Math.PI) d -= 2 * Math.PI;
    while (d < -Math.PI) d += 2 * Math.PI;
    return a + d * t;
}

const FPS_DOMAIN_SPLIT = false;   // v56 -- flip WITH the next dungeon reset (see the push-site work order)
const FPS_ID_PREFIX = () => (FPS_DOMAIN_SPLIT && typeof window !== "undefined" && window.fpsShooter && window.fpsShooter.active) ? "fps-" : "dgn-";

export class DungeonDemo {   // v2064 -- export RESTORED: the v56 const-insertion split at index-of('class DungeonDemo'), which sits inside 'export class...' -- the export migrated onto the const and nothing in the standalone bundle ever imported this module to notice
    constructor({ router, world, camera }) {
        this.router = router; this.world = world; this.camera = camera;
        this.active = false;
        this.GW = 29; this.GH = 29;                 // voxel-cell grid (odd, modest)
        this.ox = -(this.GW >> 1); this.oz = -(this.GH >> 1);   // centre near origin
        this.mode = "td";                            // "td" | "shoulder"
        this._btn = null; this._key = null; this._lastT = 0;
        this._monsters = [];                         // v1372 — spawned dungeonMonster entity ids
    }

    // ---- generation: rooms + L-corridors carved out of solid rock ---------
    _gen() {
        const GW = this.GW, GH = this.GH;
        this.wall = new Uint8Array(GW * GH).fill(1);   // 1 = solid rock, 0 = open floor
        const open = (x, z) => { if (x > 0 && x < GW - 1 && z > 0 && z < GH - 1) this.wall[z * GW + x] = 0; };
        const rooms = [];
        const overlaps = (r) => rooms.some(o => r.x0 <= o.x1 + 1 && r.x1 + 1 >= o.x0 && r.z0 <= o.z1 + 1 && r.z1 + 1 >= o.z0);
        for (let tries = 0; tries < 60 && rooms.length < 8; tries++) {
            const w = 4 + (Math.random() * 5 | 0), h = 4 + (Math.random() * 5 | 0);
            const x0 = 1 + (Math.random() * (GW - w - 2) | 0), z0 = 1 + (Math.random() * (GH - h - 2) | 0);
            const r = { x0, z0, x1: x0 + w - 1, z1: z0 + h - 1, cx: (x0 + (w >> 1)), cz: (z0 + (h >> 1)) };
            if (overlaps(r)) continue;
            rooms.push(r);
            for (let z = r.z0; z <= r.z1; z++) for (let x = r.x0; x <= r.x1; x++) open(x, z);
        }
        // connect each room to the previous one with an L-shaped corridor
        const carveH = (x0, x1, z) => { for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) open(x, z); };
        const carveV = (z0, z1, x) => { for (let z = Math.min(z0, z1); z <= Math.max(z0, z1); z++) open(x, z); };
        for (let i = 1; i < rooms.length; i++) {
            const a = rooms[i - 1], b = rooms[i];
            if (Math.random() < 0.5) { carveH(a.cx, b.cx, a.cz); carveV(a.cz, b.cz, b.cx); }
            else { carveV(a.cz, b.cz, a.cx); carveH(a.cx, b.cx, b.cz); }
        }
        this.rooms = rooms;
        // a couple of small water pools + corner torches for flavour
        this.water = []; this.torches = [];
        rooms.forEach((r, i) => {
            if (i > 0 && i < rooms.length - 1 && (r.x1 - r.x0) > 3 && (r.z1 - r.z0) > 3 && Math.random() < 0.5) {
                for (let z = r.cz; z <= r.cz + 1; z++) for (let x = r.cx; x <= r.cx + 1; x++) this.water.push([x, z]);
            }
            this.torches.push([r.x0, r.z0], [r.x1, r.z1]);
        });
    }

    // ---- voxel build ------------------------------------------------------
    // v1400 — monster AI controller (built once; paths on this.wall, drives entities)
    _ai_() {
        if (this._ai) return this._ai;
        const FYc = FY;
        this._ai = makeDungeonAI({
            GW: this.GW, GH: this.GH,
            floorY: FYc,
            isWall: (gx, gz) => (gx < 0 || gz < 0 || gx >= this.GW || gz >= this.GH) ? true : !!this.wall[gz * this.GW + gx],
            cellToWorld: (gx, gz) => [this._wx(gx) + 0.5, this._wz(gz) + 0.5],
            worldToCell: (wx, wz) => [Math.floor(wx - this.ox), Math.floor(wz - this.oz)],
            getPlayer: () => (this.camera && this.camera.position) ? { x: this.camera.position.x, z: this.camera.position.z } : null,
            moveEntity: (id, x, y, z, yaw) => { try { this.router.exec({ type: "entity:move", id, x, y, z, yaw }); } catch {} },
            onHitPlayer: (dmg, m) => this._hurtPlayer(dmg, m),
            onRangedAttack: (m, dmg, kind) => this._fireRanged(m, dmg, kind),   // v1416
            getHP: (id) => { try { return (window.fpsShooter && window.fpsShooter.enemyHP) ? window.fpsShooter.enemyHP(id) : null; } catch (e) { return null; } },   // v1430 — flee
        });
        return this._ai;
    }
    _hurtPlayer(dmg, m) {
        if (!this._fpMode) return;
        // v1408 — UNIFIED health: in first-person the FPSShooter owns player health (HUD
        // bar + damage flash + death/respawn), so monster melee routes there and _playerHP
        // just mirrors it. Falls back to the dungeon's own HP if the shooter isn't active.
        let blockF = 1;
        if (this._blocking) {
            const facing = (m && m.x != null) ? this._facingToward(m.x, m.z) : true;   // no source -> treat as frontal
            if (facing) {
                blockF = (m && m.ranged) ? 0 : 0.12;   // deflect arrows fully; chip melee
                // (thorns handled below regardless of block)
                try { this._blockSpark(); } catch {}
                try { window.demoChrome && window.demoChrome.tick && window.demoChrome.tick((m && m.ranged) ? "\ud83d\udee1\ufe0f Deflected!" : "\ud83d\udee1\ufe0f Blocked!"); } catch {}
            }
        }
        if (this._buffs && this._buffs.thorns && m && m.id != null && !m.ranged) { try { window.fpsShooter && window.fpsShooter.damageEnemy && window.fpsShooter.damageEnemy(m.id, 0.5); } catch {} }   // v1423 — reflect
        const fs = (typeof window !== "undefined") ? window.fpsShooter : null;
        if (fs && fs.active && fs.takeDamage) {
            fs.takeDamage((dmg * (this._armorMul || 1) * blockF) / 100, m ? m.kind : "dungeon_monster");
            this._playerHP = Math.round((fs.health ?? 1) * 100);
            this._onCombatEvent((fs.health ?? 1) <= 0 ? "death" : "hurt", { hp: this._playerHP, m });
        } else {
            this._playerHP = Math.max(0, (this._playerHP ?? 100) - dmg * (this._armorMul || 1) * blockF);
            try { this._flashHurt(); } catch {}
            if (this._playerHP <= 0) { this._respawnPlayer(); this._onCombatEvent("death", { hp: 0, m }); }
            else this._onCombatEvent("hurt", { hp: this._playerHP, m });
        }
    }
    _respawnPlayer() {
        this._playerHP = 100;
        const a = this.rooms && this.rooms[0];
        if (a) { const c = this._cellWorld([a.cx, a.cz]); try { this.camera.position.x = c[0]; this.camera.position.z = c[2]; this.camera.position.y = FY + 1.6; } catch {} }
    }

    // v1416 — a ranged monster (archer/mage) fired. Aim is fixed at the player's position
    // NOW, so you can dodge by moving off that spot before it lands.
    // v1432 — ELEMENTAL AFFINITIES: some monsters carry an element (fire/ice/storm/arcane)
    // shown by a colored aura. Elemental player attacks do 1.5x to the opposite element and
    // 0.5x to the same one; physical (sword/axe/frag/acid) is always neutral. Makes the whole
    // arsenal strategic. this._elem: Map(id -> element).
    _elementMult(id, element) {
        if (!element || !this._elem) return 1;
        const el = this._elem.get(id); if (!el) return 1;
        if (el === element) return 0.5;
        const weak = { fire: "ice", ice: "fire", storm: "arcane", arcane: "storm" };
        return weak[el] === element ? 1.5 : 1;
    }
    _dmgEl(id, amount, element) {
        const mult = this._elementMult(id, element);
        try { window.fpsShooter && window.fpsShooter.damageEnemy && window.fpsShooter.damageEnemy(id, amount * mult); } catch {}
        if (mult !== 1 && this._ai && this._ai.monsters) {
            const m = this._ai.monsters.get(id);
            if (m) { const c = mult > 1 ? { r: 1.0, g: 0.85, b: 0.2 } : { r: 0.6, g: 0.6, b: 0.65 }; try { window.particles && window.particles.spawn && window.particles.spawn({ x: m.x, y: FY + 1.7, z: m.z, vx: 0, vy: 1.6, vz: 0, ttl: 0.45, size: 0.3, a: 0.95, ...c }); } catch {} }
        }
    }
    _maybeAssignElement(id, depth) {
        if (!this._elem) this._elem = new Map();
        const chance = Math.min(0.6, 0.12 + (depth || 1) * 0.06);
        if (Math.random() < chance) {
            const el = ["fire", "ice", "storm", "arcane"][(Math.random() * 4) | 0];
            this._elem.set(id, el);
            if (!this._elemHinted) { this._elemHinted = true; try { window.demoChrome && window.demoChrome.tick && window.demoChrome.tick("\u2728 Some foes now carry an element \u2014 counter it (fire\u2194ice, storm\u2194arcane)"); } catch {} }
        }
    }
    _tickAuras(dt) {
        if (!this._elem || !this._elem.size || !this._ai || !this._ai.monsters) return;
        this._auraT = (this._auraT || 0) + dt; if (this._auraT < 0.18) return; this._auraT = 0;
        const col = { fire: { r: 1, g: 0.45, b: 0.1 }, ice: { r: 0.5, g: 0.8, b: 1 }, storm: { r: 0.7, g: 0.85, b: 1 }, arcane: { r: 0.7, g: 0.4, b: 1 } };
        for (const [id, el] of this._elem) {
            const m = this._ai.monsters.get(id); const c = col[el]; if (!m || !c) continue;
            try { window.particles && window.particles.spawn && window.particles.spawn({ x: m.x + (Math.random() - 0.5) * 0.8, y: FY + 0.6 + Math.random() * 1.6, z: m.z + (Math.random() - 0.5) * 0.8, vx: 0, vy: 0.4, vz: 0, ttl: 0.5, size: 0.16, a: 0.6, ...c }); } catch {}
        }
    }

    _fireRanged(m, dmg, kind) {
        if (!this._fpMode) return;
        const pp = (this.camera && this.camera.position) ? this.camera.position : null; if (!pp) return;
        const sx = m.x, sy = FY + 1.4, sz = m.z;
        const fire = (tx, ty, tz) => { const dur = Math.max(0.35, Math.hypot(tx - sx, tz - sz) / 14); (this._proj = this._proj || []).push({ x: sx, y: sy, z: sz, tx, ty, tz, t: 0, dur, dmg, kind: kind || "arrow" }); };
        const tx = pp.x, ty = (pp.y != null ? pp.y : FY + 1.6), tz = pp.z;
        // PATCH-B18 -- GPU Brain phase 14: tag the PRIMARY shot with its
        // shooter + provenance so its resolution becomes a training
        // outcome (one decision = one outcome; the boss spread's side
        // shots stay untagged so a 3-shot volley doesn't triple-count).
        const tag = (this._proj && this._proj.length) ? this._proj[this._proj.length - 1] : null;
        if (m.spec && m.spec.boss) {   // v1431 — boss fires a 3-shot spread the player must dodge
            const dx = tx - sx, dz = tz - sz, dn = Math.hypot(dx, dz) || 1, px = -dz / dn, pz = dx / dn;
            fire(tx, ty, tz);
            const primary = this._proj[this._proj.length - 1];
            primary.srcId = m.id; primary.brainSrc = m._projSrc;
            fire(tx + px * 2.2, ty, tz + pz * 2.2); fire(tx - px * 2.2, ty, tz - pz * 2.2);
        } else {
            fire(tx, ty, tz);
            const primary = this._proj[this._proj.length - 1];
            primary.srcId = m.id; primary.brainSrc = m._projSrc;
        }
    }

    _tickProjectiles(dt) {
        if (!this._proj || !this._proj.length) return;
        const pp = (this.camera && this.camera.position) ? this.camera.position : null;
        for (let i = this._proj.length - 1; i >= 0; i--) {
            const pr = this._proj[i];
            pr.t += dt;
            const f = Math.min(1, pr.t / pr.dur);
            const cx = pr.x + (pr.tx - pr.x) * f, cy = pr.y + (pr.ty - pr.y) * f, cz = pr.z + (pr.tz - pr.z) * f;
            try { if (window.particles && window.particles.spawn) { const col = pr.kind === "magic" ? { r: 0.65, g: 0.35, b: 1.0 } : { r: 1.0, g: 0.82, b: 0.35 }; window.particles.spawn({ x: cx, y: cy, z: cz, vx: 0, vy: 0, vz: 0, ttl: 0.22, size: 0.22, a: 0.9, ...col }); } } catch {}
            // v1426 — mid-flight deflect: knock the bolt out of the air while guarding toward its source
            if (this._blocking && pp && Math.hypot(pp.x - cx, pp.z - cz) < 1.6 && this._facingToward(pr.x, pr.z)) {
                try { this._blockSpark(); } catch {}
                try { window.demoChrome && window.demoChrome.tick && window.demoChrome.tick(`\ud83d\udee1\ufe0f Deflected the ${pr.kind === "magic" ? "bolt" : "arrow"} mid-air!`); } catch {}
                // PATCH-B18 -- a deflected bolt is a miss for the shooter
                if (pr.srcId != null && typeof window !== "undefined" && window._gpuBrainOutcomes) {
                    // v56 -- the v55 work order, BUILT and gated: flip
                    // FPS_DOMAIN_SPLIT to true WITH the next dungeon reset
                    // (delete difficulty_ab_dgn.json in the same breath --
                    // the flip and the reset are one act, or the shooter's
                    // history walks out of arms it is still counted in).
                    // The brain is already wired for fps- ids (v56).
                    // v55 SURVEY finding (dormant, no behavior change): fps-
                    // shooter sessions ARE distinguishable at these two push
                    // sites -- one edit each,
                    //   id: (window.fpsShooter?.active ? "fps-" : "dgn-") + srcId
                    // -- but flipping it MID-ERA forks the dungeon A/B (the
                    // shooter's sessions leave the dgn arms). Wire it at the
                    // next dungeon-experiment reset, with the ev recipe:
                    // domainOf clause, three list entries, its own head.
                    try { window._gpuBrainOutcomes.push({ id: FPS_ID_PREFIX() + pr.srcId, name: pr.kind,
                                                          hit: 0, civsHit: 0, kaijuHit: 0,
                                                          // v53 -- hp rides the outcome (the wire that already flows)
                                                          hp: (window.fpsShooter && window.fpsShooter.active) ? Math.round((window.fpsShooter.health ?? 1) * 100) : (this._playerHP ?? 100),
                                                          src: pr.brainSrc }); } catch {}
                }
                this._proj.splice(i, 1); continue;
            }
            if (f >= 1) {
                let landed = 0;
                if (pp) { const d = Math.hypot(pp.x - pr.tx, pp.z - pr.tz); if (d < 1.7) { landed = 1; this._hurtPlayer(pr.dmg, { kind: pr.kind === "magic" ? "mage" : "archer", x: pr.x, z: pr.z, ranged: true }); } }
                // PATCH-B18 -- shot outcome: same shape as kaiju attack
                // outcomes (id/name/hit/src), drained by the publisher.
                // This lifts v13's consult-only: dgn rows now TRAIN, with
                // exact propensities from the brain's own pick records.
                if (pr.srcId != null && typeof window !== "undefined" && window._gpuBrainOutcomes) {
                    try { window._gpuBrainOutcomes.push({ id: FPS_ID_PREFIX() + pr.srcId, name: pr.kind,
                                                          hit: landed, civsHit: 0, kaijuHit: 0,
                                                          // v53 -- hp rides the outcome (the wire that already flows)
                                                          hp: (window.fpsShooter && window.fpsShooter.active) ? Math.round((window.fpsShooter.health ?? 1) * 100) : (this._playerHP ?? 100),
                                                          src: pr.brainSrc }); } catch {}
                }
                this._proj.splice(i, 1);
            }
        }
    }
    _flashHurt() {
        if (typeof document === "undefined") return;
        let el = this._hurtEl;
        if (!el) { el = document.createElement("div"); el.style.cssText = "position:fixed;inset:0;pointer-events:none;z-index:99998;background:radial-gradient(ellipse at center, rgba(200,0,0,0) 55%, rgba(200,0,0,0.55) 100%);opacity:0;transition:opacity 0.12s ease-out;"; document.body.appendChild(el); this._hurtEl = el; }
        el.style.opacity = "1"; clearTimeout(this._hurtT); this._hurtT = setTimeout(() => { el.style.opacity = "0"; }, 90);
    }

    // v1408 — combat events pipe into the demo-chrome ticker + the pip avatar (mood/
    // expression, and on big moments a talking-head switch + spoken line).
    _onCombatEvent(type, info = {}) {
        const hp = info.hp ?? this._playerHP ?? 100;
        let line = "", expr = "", talk = false, say = "";
        if (type === "kill")          { line = `\u2694\ufe0f Monster down \u2014 ${this._kills || 0} kills \u00b7 ${this._gold || 0} gold`; expr = "happy"; say = "Got one!"; }
        else if (type === "hurt")     { line = `\ud83d\udca5 Hit by ${info.m ? info.m.kind : "monster"} \u2014 HP ${hp}`; expr = hp < 30 ? "surprised" : "angry"; talk = hp < 30; say = "I'm hurt bad!"; }
        else if (type === "death")    { line = `\u2620\ufe0f Slain on floor ${this.depth || 1} \u2014 ${this._kills || 0} kills`; expr = "surprised"; talk = true; say = "I'm down!"; }
        else if (type === "descend")  { line = `\ud83c\udfc6 Treasure! Descending to floor ${this.depth || 1}`; expr = "happy"; talk = true; say = `Floor ${this.depth}!`; }
        else if (type === "enter")    { line = `\ud83d\udd4b\ufe0f Entered the dungeon \u2014 floor ${this.depth || 1}, HP ${hp}`; expr = "neutral"; }
        try { if (window.demoChrome && window.demoChrome.tick && line) window.demoChrome.tick(line); } catch {}
        try { this._avatarReact(expr, { talk, say }); } catch {}
    }

    // v1408 — drive the pip avatar from combat. Configurable via:
    //   window.dungeonAvatar = { reactions:true, view:"face", speak:true }
    // view is the talking-head view to switch to on big events ("face"|"robot"|"glb").
    _avatarReact(expr, opts = {}) {
        const cfg = (typeof window !== "undefined" && window.dungeonAvatar) || {};
        if (cfg.reactions === false) return;
        try { if (expr && window.pip && window.pip.setExpression) window.pip.setExpression({ expression: expr }); } catch {}
        try { if (expr && window.alive && window.alive.mood) window.alive.mood(expr); } catch {}
        if (opts.talk) {
            try { if (window.pip && window.pip.setListenerView) window.pip.setListenerView(cfg.view || "face"); } catch {}   // talking head
            try { if (cfg.speak !== false && window.pip && window.pip.speak && opts.say) window.pip.speak({ Text: opts.say }); } catch {}
        }
    }

    // v1417 — THROW the equipped throwable (axe). Flies forward from the camera; hits the
    // first monster it reaches OR lands on the floor as a pickup you can recover.
    // v1418 — weapon swap: sword (melee swing, infinite) / bow (arrows) / axe (thrown).
    _WEAPONS() { return ["sword", "bow", "axe", "flame", "bolt"]; }
    _attack() {
        if (!this._fpMode) return;
        const w = this._weapon || "sword";
        if (w === "bow") this._shootArrow();
        else if (w === "axe") this._throwWeapon();
        else if (w === "flame") this._flameAttack();
        else if (w === "bolt") this._lightningAttack();
        else { try { window.fpsShooter && window.fpsShooter.fire && window.fpsShooter.fire(); } catch {} }   // sword = hitscan swing
    }
    _selectWeapon(name) {
        if (!this._WEAPONS().includes(name)) return;
        this._weapon = name; this._updateWeaponHUD();
        try { window.demoChrome && window.demoChrome.tick && window.demoChrome.tick(`\u2734\ufe0f ${name[0].toUpperCase() + name.slice(1)} equipped`); } catch {}
    }
    _swapWeapon(dir = 1) { const a = this._WEAPONS(); let i = a.indexOf(this._weapon || "sword"); i = (i + dir + a.length) % a.length; this._selectWeapon(a[i]); }

    _spawnPlayerProjectile(type, dmg, maxDist, speed, arrowKind) {
        const cam = this.camera; if (!cam || !cam.position) return;
        const yaw = cam.yaw || 0, pitch = cam.pitch || 0, cp = Math.cos(pitch);
        (this._pproj = this._pproj || []).push({ x: cam.position.x, y: (cam.position.y != null ? cam.position.y : FY + 1.6), z: cam.position.z, dx: Math.sin(yaw) * cp, dy: Math.sin(pitch), dz: -Math.cos(yaw) * cp, dist: 0, maxDist, dmg, speed, type, arrowKind: arrowKind || "normal" });
    }
    _throwWeapon() {
        if (!this._fpMode) return;
        if (!this._throw) this._throw = { axe: 0 };
        if ((this._throw.axe || 0) <= 0) { this._outOfAmmo("axe"); return; }
        this._throw.axe--; this._spawnPlayerProjectile("axe", 2, 26, 22); this._updateWeaponHUD();
    }
    _shootArrow() {
        if (!this._fpMode) return;
        if (!this._throw) this._throw = { arrow: 0 };
        if ((this._throw.arrow || 0) <= 0) { this._outOfAmmo("arrow"); return; }
        this._throw.arrow--;
        const ak = this._arrowKind || "normal";
        const dmg = ak === "fire" ? 1.3 : ak === "magic" ? 1.2 : 1.5;
        this._spawnPlayerProjectile("arrow", dmg, 34, 38, ak);
        this._updateWeaponHUD();
    }
    // v1424 — bow arrow types (normal / fire / magic), cycled with T or the pad/phone button.
    _cycleArrow() {
        const a = ["normal", "fire", "magic"]; let i = a.indexOf(this._arrowKind || "normal");
        this._arrowKind = a[(i + 1) % a.length];
        try { window.demoChrome && window.demoChrome.tick && window.demoChrome.tick(`\ud83c\udff9 Arrows: ${this._arrowKind}`); } catch {}
        this._updateWeaponHUD();
    }
    _igniteMonster(id) {
        this._burns = this._burns || [];
        const ex = this._burns.find(b => b.id === id);
        if (ex) ex.t = 3.0; else this._burns.push({ id, t: 3.0, dps: 0.7 });   // small burn DoT
    }
    _tickBurns(dt) {
        if (!this._burns || !this._burns.length) return;
        const mons = (this._ai && this._ai.monsters) ? this._ai.monsters : null;
        for (let i = this._burns.length - 1; i >= 0; i--) {
            const b = this._burns[i]; const m = mons ? mons.get(b.id) : null;
            if (!m) { this._burns.splice(i, 1); continue; }
            this._dmgEl(b.id, b.dps * dt, "fire");
            try { if (window.particles && window.particles.spawn) window.particles.spawn({ x: m.x, y: FY + 1.4, z: m.z, vx: (Math.random() - 0.5) * 0.5, vy: 1.2, vz: (Math.random() - 0.5) * 0.5, ttl: 0.4, size: 0.16, a: 0.85, r: 1.0, g: 0.5, b: 0.1 }); } catch {}
            b.t -= dt; if (b.t <= 0) this._burns.splice(i, 1);
        }
    }
    _impactBurst(x, y, z, kind) {
        if (typeof window === "undefined" || !window.particles || !window.particles.spawn) return;
        const col = kind === "fire" ? { r: 1.0, g: 0.45, b: 0.1 } : { r: 0.7, g: 0.4, b: 1.0 };
        for (let i = 0; i < 8; i++) { try { window.particles.spawn({ x, y, z, vx: (Math.random() - 0.5) * 3, vy: Math.random() * 2, vz: (Math.random() - 0.5) * 3, ttl: 0.4, size: 0.16, a: 0.9, ...col }); } catch {} }
    }

    // v1427 — energy weapons (flamethrower + lightning). A regenerating energy pool gates
    // them so they're powerful but not spammable; no ammo to manage.
    _tickEnergy(dt) { if (this._energy == null) this._energy = 100; if (this._energy < 100) this._energy = Math.min(100, this._energy + 12 * dt); }
    _spendEnergy(c) { if ((this._energy || 0) >= c) { this._energy -= c; this._updateWeaponHUD(); return true; } try { window.demoChrome && window.demoChrome.tick && window.demoChrome.tick("\u26a1 Low energy"); } catch {} return false; }

    _flameAttack() {
        if (!this._fpMode || !this._spendEnergy(20)) return;
        const cam = this.camera; if (!cam || !cam.position) return;
        const px = cam.position.x, py = (cam.position.y != null ? cam.position.y : FY + 1.6), pz = cam.position.z, yaw = cam.yaw || 0, fx = Math.sin(yaw), fz = -Math.cos(yaw);
        // cone of flame particles
        for (let i = 0; i < 16; i++) { const a = (Math.random() - 0.5) * 0.9, c = Math.cos(a), sn = Math.sin(a); const dx = fx * c - fz * sn, dz = fx * sn + fz * c, r = 1 + Math.random() * 5.5; try { window.particles && window.particles.spawn && window.particles.spawn({ x: px + dx * r, y: py - 0.2 + Math.random() * 0.7, z: pz + dz * r, vx: dx * 2, vy: 0.3, vz: dz * 2, ttl: 0.4, size: 0.26, a: 0.85, r: 1.0, g: 0.4 + Math.random() * 0.3, b: 0.1 }); } catch {} }
        // damage + ignite monsters in the frontal cone (range 7, ~53 deg)
        const mons = (this._ai && this._ai.monsters) ? this._ai.monsters : null; if (!mons) return;
        for (const m of mons.values()) { const dx = m.x - px, dz = m.z - pz, d = Math.hypot(dx, dz); if (d > 7 || d < 0.01) continue; if ((fx * dx + fz * dz) / d > 0.6) { this._dmgEl(m.id, 1.3, "fire"); this._igniteMonster(m.id); } }
    }

    _lightningAttack() {
        if (!this._fpMode || !this._spendEnergy(25)) return;
        const cam = this.camera; if (!cam || !cam.position) return;
        const px = cam.position.x, pz = cam.position.z, yaw = cam.yaw || 0, fx = Math.sin(yaw), fz = -Math.cos(yaw);
        const mons = (this._ai && this._ai.monsters) ? this._ai.monsters : null; if (!mons) return;
        let best = null, bestD = 1e9;   // primary: nearest aimed-at monster within 16u
        for (const m of mons.values()) { const dx = m.x - px, dz = m.z - pz, d = Math.hypot(dx, dz); if (d > 16 || d < 0.01) continue; if ((fx * dx + fz * dz) / d > 0.9 && d < bestD) { best = m; bestD = d; } }
        if (!best) { try { window.demoChrome && window.demoChrome.tick && window.demoChrome.tick("\u26a1 No target in front"); } catch {} return; }
        const arc = (ax, az, bx, bz) => { for (let k = 0; k <= 6; k++) { const t = k / 6; try { window.particles && window.particles.spawn && window.particles.spawn({ x: ax + (bx - ax) * t + (Math.random() - 0.5) * 0.3, y: FY + 1.4 + (Math.random() - 0.5) * 0.4, z: az + (bz - az) * t + (Math.random() - 0.5) * 0.3, vx: 0, vy: 0, vz: 0, ttl: 0.18, size: 0.16, a: 0.95, r: 0.7, g: 0.85, b: 1.0 }); } catch {} } };
        const hit = new Set(); let cur = best, dmg = 2.0, fromx = px, fromz = pz;
        for (let hop = 0; hop < 3 && cur; hop++) {   // chain to up to 3 monsters, diminishing
            this._dmgEl(cur.id, dmg, "storm");
            arc(fromx, fromz, cur.x, cur.z); hit.add(cur.id); fromx = cur.x; fromz = cur.z; dmg *= 0.6;
            let nx = null, nd = 6; for (const m of mons.values()) { if (hit.has(m.id)) continue; const d = Math.hypot(m.x - fromx, m.z - fromz); if (d < nd) { nd = d; nx = m; } }
            cur = nx;
        }
    }

    // v1428 — GRENADES: lobbed AoE explosives. frag (burst), fire (burst+ignite), acid
    // (lingering damage pool), ice (slow). Throw with G, cycle type with B.
    _nadeColor(type) { return type === "acid" ? { r: 0.4, g: 0.9, b: 0.3 } : type === "ice" ? { r: 0.5, g: 0.8, b: 1.0 } : type === "fire" ? { r: 1.0, g: 0.45, b: 0.1 } : { r: 0.85, g: 0.8, b: 0.5 }; }
    _cycleNade() {
        const a = ["frag", "fire", "acid", "ice"]; this._nadeType = a[(a.indexOf(this._nadeType || "frag") + 1) % a.length];
        try { window.demoChrome && window.demoChrome.tick && window.demoChrome.tick(`\ud83d\udca3 Grenade: ${this._nadeType}`); } catch {}
        this._updateWeaponHUD();
    }
    _throwGrenade() {
        if (!this._fpMode) return;
        this._nadeAmmo = this._nadeAmmo || {}; const type = this._nadeType || "frag";
        if ((this._nadeAmmo[type] || 0) <= 0) { try { window.demoChrome && window.demoChrome.tick && window.demoChrome.tick(`\ud83d\udca3 Out of ${type} grenades`); } catch {} return; }
        this._nadeAmmo[type]--;
        const cam = this.camera; if (!cam || !cam.position) return;
        const yaw = cam.yaw || 0, pitch = cam.pitch || 0, cp = Math.cos(pitch), sp = 14;
        (this._nades = this._nades || []).push({ x: cam.position.x, y: (cam.position.y != null ? cam.position.y : FY + 1.6), z: cam.position.z, vx: Math.sin(yaw) * cp * sp, vy: Math.sin(pitch) * sp + 5, vz: -Math.cos(yaw) * cp * sp, type, fuse: 2.2 });
        this._updateWeaponHUD();
    }
    _tickGrenades(dt) {
        if (!this._nades || !this._nades.length) return;
        const G = 22;
        for (let i = this._nades.length - 1; i >= 0; i--) {
            const n = this._nades[i];
            n.vy -= G * dt; n.x += n.vx * dt; n.y += n.vy * dt; n.z += n.vz * dt; n.fuse -= dt;
            try { if (window.particles && window.particles.spawn) window.particles.spawn({ x: n.x, y: n.y, z: n.z, vx: 0, vy: 0, vz: 0, ttl: 0.2, size: 0.18, a: 0.85, ...this._nadeColor(n.type) }); } catch {}
            const cgx = Math.floor(n.x - this.ox), cgz = Math.floor(n.z - this.oz);
            const wall = (cgx < 0 || cgz < 0 || cgx >= this.GW || cgz >= this.GH) ? true : !!this.wall[cgz * this.GW + cgx];
            if (n.y <= FY + 0.4 || (wall && n.y < FY + 4) || n.fuse <= 0) { this._explodeGrenade(n.type, n.x, n.z); this._nades.splice(i, 1); }
        }
    }
    _explodeGrenade(type, x, z) {
        const R = 3.6, col = this._nadeColor(type);
        for (let k = 0; k < 18; k++) { try { window.particles && window.particles.spawn && window.particles.spawn({ x, y: FY + 1.0, z, vx: (Math.random() - 0.5) * 8, vy: Math.random() * 4, vz: (Math.random() - 0.5) * 8, ttl: 0.5, size: 0.22, a: 0.9, ...col }); } catch {} }
        if (type === "acid") (this._pools = this._pools || []).push({ x, z, t: 4.0, dps: 1.2, r: R });
        const mons = (this._ai && this._ai.monsters) ? this._ai.monsters : null; if (!mons) return;
        for (const m of mons.values()) {
            const d = Math.hypot(m.x - x, m.z - z); if (d > R) continue;
            if (type === "frag") { try { window.fpsShooter.damageEnemy(m.id, 3.0 * (1 - d / R)); } catch {} }
            else if (type === "fire") { this._dmgEl(m.id, 2.0 * (1 - d / R), "fire"); this._igniteMonster(m.id); }
            else if (type === "ice") { this._dmgEl(m.id, 1.0, "ice"); try { this._ai && this._ai.slow && this._ai.slow(m.id, 3.0); } catch {} }
            else if (type === "acid") { try { window.fpsShooter.damageEnemy(m.id, 1.0); } catch {} }
        }
    }
    _tickPools(dt) {
        if (!this._pools || !this._pools.length) return;
        const mons = (this._ai && this._ai.monsters) ? this._ai.monsters : null;
        for (let i = this._pools.length - 1; i >= 0; i--) {
            const p = this._pools[i]; p.t -= dt;
            for (let k = 0; k < 3; k++) { const a = Math.random() * 6.28, r = Math.random() * p.r; try { window.particles && window.particles.spawn && window.particles.spawn({ x: p.x + Math.cos(a) * r, y: FY + 0.6, z: p.z + Math.sin(a) * r, vx: 0, vy: 0.2, vz: 0, ttl: 0.3, size: 0.18, a: 0.7, r: 0.4, g: 0.9, b: 0.3 }); } catch {} }
            if (mons) for (const m of mons.values()) { if (Math.hypot(m.x - p.x, m.z - p.z) <= p.r) { try { window.fpsShooter.damageEnemy(m.id, p.dps * dt); } catch {} } }
            if (p.t <= 0) this._pools.splice(i, 1);
        }
    }

    // v1429 — HERO auto-pilot: drives the FP camera to fight hands-off. Targets the nearest
    // monster, picks a weapon by range/crowd, keeps distance, weaves, retreats + seeks health
    // when low, and roams to loot / doors / the stairs when no enemies are around. Steers via
    // the camera analog-move hook so it collides with walls like a real player.
    _setAuto(on) {
        this._auto = (on === undefined) ? !this._auto : !!on;
        if (!this._auto && this.camera) this.camera._extMove = { fwd: 0, strafe: 0 };
        try { window.demoChrome && window.demoChrome.tick && window.demoChrome.tick(this._auto ? "\ud83e\udd16 Hero auto-pilot ON" : "\ud83e\udd16 Auto-pilot OFF"); } catch {}
        this._updateWeaponHUD();
    }
    _tickHero(dt) {
        if (!this._auto || !this._fpMode || !this.camera || !this.camera.position) return;
        const cam = this.camera, px = cam.position.x, pz = cam.position.z;
        const mons = (this._ai && this._ai.monsters) ? this._ai.monsters : null;
        const hp = (window.fpsShooter && window.fpsShooter.active) ? (window.fpsShooter.health != null ? window.fpsShooter.health : 1) : 1;
        this._heroAtkCD = Math.max(0, (this._heroAtkCD || 0) - dt);
        let faceX = null, faceZ = null, advance = 0, strafe = 0, attackNow = false;

        let tgt = null, tD = 1e9; if (mons) for (const m of mons.values()) { const d = Math.hypot(m.x - px, m.z - pz); if (d < tD) { tD = d; tgt = m; } }
        let healGoal = null; if (hp < 0.35 && this._items) { let bd = 1e9; for (const it of this._items) if (it.kind === "health") { const d = Math.hypot(it.x - px, it.z - pz); if (d < bd) { bd = d; healGoal = it; } } }

        if (healGoal) { faceX = healGoal.x; faceZ = healGoal.z; advance = 1; }
        else if (tgt) {
            faceX = tgt.x; faceZ = tgt.z;
            const close = mons ? [...mons.values()].filter(m => Math.hypot(m.x - px, m.z - pz) < 6).length : 0;
            let want = (close >= 3) ? "flame" : (tD > 9 ? "bow" : (tD > 3.5 ? "axe" : "sword"));
            if ((want === "flame" || want === "bolt") && (this._energy || 0) < 25) want = tD > 9 ? "bow" : "sword";
            if (this._weapon !== want && this._WEAPONS().includes(want)) this._selectWeapon(want);
            const prefer = want === "bow" ? 8 : want === "flame" ? 4 : 2.0;
            if (hp < 0.3) advance = -1; else if (tD > prefer + 1) advance = 1; else if (tD < prefer - 1) advance = -0.6; else advance = 0;
            strafe = Math.sin((this._lastT || 0) / 350) * 0.6;   // weave to dodge
            attackNow = tD < 16 && this._heroAtkCD <= 0;
        } else {
            let goal = null, bd = 1e9;
            if (this._items) for (const it of this._items) { const d = Math.hypot(it.x - px, it.z - pz); if (d < bd) { bd = d; goal = it; } }
            if (!goal && this._doors && (this._keys || 0) > 0) { const dr = this._doors.find(d => !d.open); if (dr) goal = { x: this._wx(dr.gx) + 0.5, z: this._wz(dr.gz) + 0.5 }; }
            if (!goal && this._treasure) goal = { x: this._wx(this._treasure[0]) + 0.5, z: this._wz(this._treasure[1]) + 0.5 };
            if (goal) { faceX = goal.x; faceZ = goal.z; advance = 1; }
        }
        // stuck avoidance: if advancing but not moving, slide sideways to round a corner
        const moved = Math.hypot(px - (this._heroLastX != null ? this._heroLastX : px), pz - (this._heroLastZ != null ? this._heroLastZ : pz));
        this._heroStuck = (advance > 0 && moved < 0.02) ? (this._heroStuck || 0) + dt : 0;
        this._heroLastX = px; this._heroLastZ = pz;
        if (this._heroStuck > 0.3) strafe = (Math.floor((this._lastT || 0) / 700) % 2) ? 1 : -1;

        if (faceX != null) { cam.yaw = Math.atan2(faceX - px, -(faceZ - pz)); cam.pitch = 0; }
        cam._extMove = { fwd: advance, strafe };
        if (attackNow) { this._attack(); this._heroAtkCD = 0.55; }
    }
    _outOfAmmo(type) { try { window.demoChrome && window.demoChrome.tick && window.demoChrome.tick(type === "arrow" ? "\ud83c\udff9 Out of arrows \u2014 collect them!" : "\ud83e\ude93 Out of axes \u2014 pick them up!"); } catch {} }
    _drop(x, z, type) { (this._drops = this._drops || []).push({ x, z, type: type || "axe" }); }

    _tickPlayerProjectiles(dt) {
        // pickups — recover landed axes/arrows the player walks over (+ a glint)
        if (this._drops && this._drops.length && this.camera && this.camera.position) {
            const px = this.camera.position.x, pz = this.camera.position.z;
            for (let i = this._drops.length - 1; i >= 0; i--) {
                const d = this._drops[i];
                const col = d.type === "arrow" ? { r: 0.7, g: 0.95, b: 0.7 } : { r: 0.85, g: 0.85, b: 0.92 };
                try { if (window.particles && window.particles.spawn) window.particles.spawn({ x: d.x, y: FY + 1.05, z: d.z, vx: 0, vy: 0, vz: 0, ttl: 0.2, size: 0.18, a: 0.85, ...col }); } catch {}
                if (Math.hypot(px - d.x, pz - d.z) < this._pickR()) {
                    if (!this._throw) this._throw = {};
                    this._throw[d.type] = (this._throw[d.type] || 0) + 1;
                    this._drops.splice(i, 1);
                    try { window.demoChrome && window.demoChrome.tick && window.demoChrome.tick(`${d.type === "arrow" ? "\ud83c\udff9" : "\ud83e\ude93"} Recovered (+1 ${d.type})`); } catch {}
                    this._updateWeaponHUD();
                }
            }
        }
        if (!this._pproj || !this._pproj.length) return;
        const mons = (this._ai && this._ai.monsters) ? this._ai.monsters : null;
        for (let i = this._pproj.length - 1; i >= 0; i--) {
            const pr = this._pproj[i], step = (pr.speed || 24) * dt;
            pr.x += pr.dx * step; pr.y += pr.dy * step; pr.z += pr.dz * step; pr.dist += step;
            const col = pr.type !== "arrow" ? { r: 0.82, g: 0.82, b: 0.86 }
                      : pr.arrowKind === "fire" ? { r: 1.0, g: 0.5, b: 0.15 }
                      : pr.arrowKind === "magic" ? { r: 0.7, g: 0.4, b: 1.0 }
                      : { r: 0.7, g: 0.95, b: 0.7 };
            try { if (window.particles && window.particles.spawn) window.particles.spawn({ x: pr.x, y: pr.y, z: pr.z, vx: 0, vy: 0, vz: 0, ttl: 0.18, size: 0.2, a: 0.9, ...col }); } catch {}
            let hit = false;
            if (mons) for (const m of mons.values()) {
                if (Math.hypot(pr.x - m.x, pr.z - m.z) < 1.2 && Math.abs(pr.y - (FY + 1.2)) < 2.2) {
                    { const ael = pr.type === "arrow" && pr.arrowKind === "fire" ? "fire" : pr.type === "arrow" && pr.arrowKind === "magic" ? "arcane" : null; this._dmgEl(m.id, pr.dmg, ael); }
                    if (pr.type === "arrow" && pr.arrowKind === "fire") { this._igniteMonster(m.id); this._impactBurst(pr.x, FY + 1.3, pr.z, "fire"); }
                    else if (pr.type === "arrow" && pr.arrowKind === "magic") { this._impactBurst(pr.x, FY + 1.3, pr.z, "magic"); for (const o of mons.values()) { if (o.id !== m.id && Math.hypot(pr.x - o.x, pr.z - o.z) < 2.2) { this._dmgEl(o.id, 0.6, "arcane"); } } }
                    this._drop(pr.x, pr.z, pr.type); hit = true; break;
                }
            }
            if (hit) { this._pproj.splice(i, 1); continue; }
            const cgx = Math.floor(pr.x - this.ox), cgz = Math.floor(pr.z - this.oz);
            const wall = (cgx < 0 || cgz < 0 || cgx >= this.GW || cgz >= this.GH) ? true : !!this.wall[cgz * this.GW + cgx];
            if (wall || pr.dist >= pr.maxDist || pr.y < FY + 0.3) { this._drop(pr.x, pr.z, pr.type); this._pproj.splice(i, 1); }
        }
    }

    _updateWeaponHUD() {
        if (typeof document === "undefined") return;
        let el = this._whud;
        if (!el) { el = document.createElement("div"); el.id = "dungeonWeaponHUD"; el.style.cssText = "position:fixed;right:14px;bottom:14px;z-index:99997;font:600 14px system-ui,sans-serif;color:#ffe6a8;background:rgba(10,14,22,0.82);border:1px solid #5a4a2a;border-radius:10px;padding:8px 12px;pointer-events:none;box-shadow:0 2px 10px rgba(0,0,0,.5);white-space:nowrap"; document.body.appendChild(el); this._whud = el; }
        const w = this._weapon || "sword", t = this._throw || {};
        const slot = (name, label) => { const on = (w === name); return `<span style="padding:2px 7px;border-radius:6px;${on ? "background:#caa45a;color:#1a1208;" : "opacity:.55;"}">${label}</span>`; };
        const badges = [];
        if ((this._keys || 0) > 0) badges.push(`<span style="color:#ffe06a">\ud83d\udddd\ufe0f \u00d7${this._keys}</span>`);
        if (this._buffs) { if (this._buffs.damage) badges.push("+DMG"); if (this._buffs.armor) badges.push("+ARM"); if (this._buffs.speed) badges.push("+SPD"); if (this._buffs.regen) badges.push("+REG"); if (this._buffs.lifesteal) badges.push("+LIF"); if (this._buffs.magnet) badges.push("+MAG"); if (this._buffs.thorns) badges.push("+THORN"); }
        if (this._blocking) badges.push('<span style="color:#9fd0ff">\ud83d\udee1\ufe0f BLOCK</span>');
        if (this._auto) badges.push('<span style="color:#a0f0c0">\ud83e\udd16 AUTO</span>');
        const buffLine = badges.length ? `<div style="margin-top:5px;font-size:12px;color:#bfe6c0">${badges.join("  ")}</div>` : "";
        const na = this._nadeAmmo || {}; const nt = this._nadeType || "frag";
        const nadeLine = `<div style="margin-top:4px;font-size:12px;color:#f0b89a">\ud83d\udca3 ${nt}\u00d7${na[nt] || 0} <span style="opacity:.5;font-size:11px">(B cycle \u00b7 G throw)</span></div>`;
        const en = (w === "flame" || w === "bolt") ? ` <span style="color:#9fd0ff">\u26a1${Math.round(this._energy != null ? this._energy : 100)}</span>` : "";
        el.innerHTML = `<div>${slot("sword", "\u2694\ufe0f")} ${slot("bow", `\ud83c\udff9\u00d7${t.arrow || 0}${w === "bow" ? "[" + (this._arrowKind || "normal") + "]" : ""}`)} ${slot("axe", `\ud83e\ude93\u00d7${t.axe || 0}`)} ${slot("flame", "\ud83d\udd25")} ${slot("bolt", "\u26a1")}${en}</div>${buffLine}${nadeLine}<div style="opacity:.5;font-size:11px;margin-top:3px">1-5 swap \u00b7 F axe \u00b7 T arrow</div>`;
    }
    _removeWeaponHUD() { if (this._whud) { try { this._whud.remove(); } catch {} this._whud = null; } }

    // v1419 — usable loot: health potions, a KEY that unlocks the stairs down, and gear buffs.
    _spawnLoot() {
        this._items = []; this._keys = 0; this._doors = [];   // each floor carries its own keys + doors
        if (!this.rooms || this.rooms.length < 2 || !this._treasure) return;
        const mid = [];
        for (let i = 1; i < this.rooms.length - 1; i++) { const r = this.rooms[i]; if (!(r.cx === this._treasure[0] && r.cz === this._treasure[1])) mid.push(r); }
        for (let k = mid.length - 1; k > 0; k--) { const j = (Math.random() * (k + 1)) | 0; const t = mid[k]; mid[k] = mid[j]; mid[j] = t; }
        const place = (r, kind, sub) => { if (r) this._items.push({ x: this._wx(r.cx) + 0.5, z: this._wz(r.cz) + 0.5, kind, sub }); };
        // v1425 — bigger floors get up to 2 path-doors; always 1 spare key for the stairs.
        const wantDoors = (this.path && this.path.length > 26) ? 2 : 1;
        let qi = 0;
        for (let k = 0; k < wantDoors + 1; k++) place(mid[qi++], "key");   // doors + stairs
        place(mid[qi++], "health"); place(mid[qi++], "health");
        const gears = ["damage", "armor", "speed", "regen", "lifesteal", "magnet", "thorns"]; place(mid[qi++], "gear", gears[(Math.random() * gears.length) | 0]);
        place(mid[qi++], "ammo");   // v1420 — quiver: refill arrows + axes
        place(mid[qi++], "nades");   // v1428 — grenade resupply
        // tiny layouts: drop a key beside the treasure so progress is never impossible
        if (this._items.length === 0) this._items.push({ x: this._wx(this._treasure[0]) + 0.5, z: this._wz(this._treasure[1]) + 1.5, kind: "key" });
        const keysPlaced = this._items.filter(it => it.kind === "key").length;
        const doors = Math.min(wantDoors, Math.max(0, keysPlaced - 1));   // keep 1 key for the stairs
        if (doors > 0) this._placeDoors(doors);
        this._updateWeaponHUD();
    }
    // v1423 — a locked DOOR on the corridor near the treasure (after the loot rooms, so keys
    // are always collectable first). A wall plug you carve open with a key.
    _placeDoors(n) {
        this._doors = [];
        if (!this.path || this.path.length < 6) return;
        n = Math.max(1, n | 0);
        const isCenter = (gx, gz) => this.rooms.some(r => r.cx === gx && r.cz === gz);
        const used = new Set();
        const fracs = n >= 2 ? [0.5, 0.74] : [0.66];   // spread along the latter half of the path
        for (const fr of fracs) {
            const start = Math.floor(this.path.length * fr);
            for (let m = 0; m < this.path.length; m++) {
                const i = Math.min(this.path.length - 2, start + m);
                if (i <= 0) continue;
                const [gx, gz] = this.path[i];
                const key = gx + "," + gz;
                if (used.has(key) || isCenter(gx, gz)) continue;
                if (gx === this._treasure[0] && gz === this._treasure[1]) continue;
                for (let h = 1; h <= WALL_H; h++) this._set(gx, gz, FY + h, WALL_ID);   // wall plug (blocks)
                this._doors.push({ gx, gz, open: false }); used.add(key);
                break;
            }
            if (this._doors.length >= n) break;
        }
    }
    _openDoor(dr) {
        if (!dr || dr.open) return;
        dr.open = true; this._keys = Math.max(0, (this._keys || 0) - 1);
        for (let h = 1; h <= WALL_H; h++) this._set(dr.gx, dr.gz, FY + h, AIR);   // carve it open (live collision)
        try { window.demoChrome && window.demoChrome.tick && window.demoChrome.tick(`\ud83d\udddd\ufe0f Unlocked a door (${this._keys} key${this._keys === 1 ? "" : "s"} left)`); } catch {}
        try { this._blockSpark(); } catch {}
        this._updateWeaponHUD();
    }
    _pickR() { return (this._buffs && this._buffs.magnet) ? 2.6 : 1.4; }   // v1423 — magnet widens pickups
    _itemColor(it) {
        if (it.kind === "health") return { r: 0.3, g: 1.0, b: 0.4 };
        if (it.kind === "key") return { r: 1.0, g: 0.85, b: 0.2 };
        if (it.kind === "ammo") return { r: 0.85, g: 0.85, b: 0.55 };
        if (it.kind === "nades") return { r: 0.9, g: 0.55, b: 0.4 };
        if (it.kind === "gear") return it.sub === "damage" ? { r: 1.0, g: 0.4, b: 0.3 } : it.sub === "armor" ? { r: 0.5, g: 0.7, b: 1.0 } : { r: 0.9, g: 0.6, b: 1.0 };
        return { r: 1, g: 1, b: 1 };
    }
    _tickItems(dt) {
        if (!this.camera || !this.camera.position) return;
        const px = this.camera.position.x, pz = this.camera.position.z, t = this._lastT || 0;
        // locked-stairs warning glint until you carry the key
        if (this._treasure && (this._keys || 0) <= 0) { try { if (window.particles && window.particles.spawn) window.particles.spawn({ x: this._wx(this._treasure[0]) + 0.5, y: FY + 1.5, z: this._wz(this._treasure[1]) + 0.5, vx: 0, vy: 0, vz: 0, ttl: 0.2, size: 0.32, a: 0.7, r: 1.0, g: 0.25, b: 0.2 }); } catch {} }
        // locked path-doors: gold glint; walk up with a key to open
        if (this._doors && this._doors.length) for (const dr of this._doors) {
            if (dr.open) continue;
            const dxw = this._wx(dr.gx) + 0.5, dzw = this._wz(dr.gz) + 0.5;
            try { if (window.particles && window.particles.spawn) window.particles.spawn({ x: dxw, y: FY + 1.6, z: dzw, vx: 0, vy: 0, vz: 0, ttl: 0.2, size: 0.34, a: 0.7, r: 1.0, g: 0.8, b: 0.25 }); } catch {}
            if (Math.hypot(px - dxw, pz - dzw) < 1.9) {
                if ((this._keys || 0) > 0) this._openDoor(dr);
                else { const now = t; if (now - (this._doorMsgT || 0) > 1500) { this._doorMsgT = now; try { window.demoChrome && window.demoChrome.tick && window.demoChrome.tick("\ud83d\udd12 Locked door \u2014 need a key"); } catch {} } }
            }
        }
        if (this._buffs && this._buffs.regen) { try { this._healPlayer(0.04 * dt); } catch {} }   // v1420 — ~4% HP/s
        if (!this._items || !this._items.length) return;
        for (let i = this._items.length - 1; i >= 0; i--) {
            const it = this._items[i], c = this._itemColor(it);
            try { if (window.particles && window.particles.spawn) window.particles.spawn({ x: it.x, y: FY + 1.2 + 0.15 * Math.sin(t / 150 + i), z: it.z, vx: 0, vy: 0, vz: 0, ttl: 0.2, size: 0.28, a: 0.85, ...c }); } catch {}
            if (Math.hypot(px - it.x, pz - it.z) < this._pickR()) { this._applyItem(it); this._items.splice(i, 1); }
        }
    }
    _applyItem(it) {
        const tick = (str) => { try { window.demoChrome && window.demoChrome.tick && window.demoChrome.tick(str); } catch {} };
        if (it.kind === "health") { this._healPlayer(0.3); tick("\u2764\ufe0f Health potion +30"); try { this._avatarReact && this._avatarReact("happy", {}); } catch {} }
        else if (it.kind === "key") { this._keys = (this._keys || 0) + 1; tick(`\ud83d\udddd\ufe0f Picked up a key (${this._keys})`); this._updateWeaponHUD(); }
        else if (it.kind === "ammo") { if (!this._throw) this._throw = {}; this._throw.arrow = (this._throw.arrow || 0) + 6; this._throw.axe = (this._throw.axe || 0) + 3; tick("\ud83c\udff9 Quiver +6 arrows, +3 axes"); this._updateWeaponHUD(); }
        else if (it.kind === "nades") { this._nadeAmmo = this._nadeAmmo || {}; const tp = ["frag", "fire", "acid", "ice"][(Math.random() * 4) | 0]; this._nadeAmmo[tp] = (this._nadeAmmo[tp] || 0) + 2; tick(`\ud83d\udca3 +2 ${tp} grenades`); this._updateWeaponHUD(); }
        else if (it.kind === "gear") {
            if (!this._buffs) this._buffs = {};
            if (it.sub === "damage") { this._buffs.damage = true; try { if (window.fpsShooter) window.fpsShooter._shotDamageMul = 1.6; } catch {} tick("\u2694\ufe0f Gear: +60% weapon damage"); }
            else if (it.sub === "armor") { this._buffs.armor = true; this._armorMul = 0.6; tick("\ud83d\udee1\ufe0f Gear: armor (\u221240% damage taken)"); }
            else if (it.sub === "regen") { this._buffs.regen = true; tick("\u2728 Gear: slow health regeneration"); }
            else if (it.sub === "lifesteal") { this._buffs.lifesteal = true; tick("\ud83e\ude78 Gear: lifesteal (heal on kill)"); }
            else if (it.sub === "magnet") { this._buffs.magnet = true; tick("\ud83e\uddf2 Gear: loot magnet (wider pickup)"); }
            else if (it.sub === "thorns") { this._buffs.thorns = true; tick("\ud83c\udf35 Gear: thorns (melee attackers take damage)"); }
            else { if (!this._buffs.speed) { this._buffs.speed = true; try { if (this.camera) this.camera.moveSpeed = (this.camera.moveSpeed || 5) * 1.3; } catch {} } tick("\ud83d\udc5f Gear: +30% move speed"); }
            this._updateWeaponHUD();
        }
    }
    _healPlayer(frac) {
        const fs = (typeof window !== "undefined") ? window.fpsShooter : null;
        if (fs && fs.active) { fs.health = Math.min(1, (fs.health != null ? fs.health : 1) + frac); this._playerHP = Math.round((fs.health != null ? fs.health : 1) * 100); }
        else { this._playerHP = Math.min(100, (this._playerHP != null ? this._playerHP : 100) + Math.round(frac * 100)); }
    }
    _maybeDescend(gx, gz) {
        if (!this._treasure || this._descending) return;
        if (gx !== this._treasure[0] || gz !== this._treasure[1]) return;
        if ((this._keys || 0) <= 0) {
            const now = this._lastT || 0;
            if (now - (this._lockMsgT || 0) > 1500) { this._lockMsgT = now; try { window.demoChrome && window.demoChrome.tick && window.demoChrome.tick("\ud83d\udd12 The stairs down are locked \u2014 find a key!"); } catch {} }
            return;
        }
        this._descending = true; this._keys = Math.max(0, this._keys - 1); this._descend();
    }

    // v1420 — BLOCK / guard: hold to deflect frontal arrows/bolts and soak melee from the front.
    _facingToward(tx, tz) {
        const cam = this.camera; if (!cam || !cam.position) return false;
        const yaw = cam.yaw || 0, fx = Math.sin(yaw), fz = -Math.cos(yaw);
        let dx = tx - cam.position.x, dz = tz - cam.position.z; const d = Math.hypot(dx, dz) || 1;
        return (fx * (dx / d) + fz * (dz / d)) > 0.35;   // ~within 70 deg of facing
    }
    _setBlocking(on) {
        on = !!on; if (on === !!this._blocking) return;
        this._blocking = on;
        if (on) { this._preBlockSpeed = (this.camera && this.camera.moveSpeed) || null; if (this.camera && this.camera.moveSpeed) this.camera.moveSpeed *= 0.6; }
        else if (this._preBlockSpeed != null && this.camera) { this.camera.moveSpeed = this._preBlockSpeed; this._preBlockSpeed = null; }
        this._updateWeaponHUD();
    }
    _toggleBlock() { this._setBlocking(!this._blocking); }
    _blockSpark() {
        const cam = this.camera; if (!cam || !cam.position || typeof window === "undefined" || !window.particles || !window.particles.spawn) return;
        const yaw = cam.yaw || 0, fx = Math.sin(yaw), fz = -Math.cos(yaw);
        for (let i = 0; i < 7; i++) { try { window.particles.spawn({ x: cam.position.x + fx * 1.0 + (Math.random() - 0.5) * 0.6, y: (cam.position.y != null ? cam.position.y : FY + 1.6) - 0.2 + (Math.random() - 0.5) * 0.6, z: cam.position.z + fz * 1.0 + (Math.random() - 0.5) * 0.6, vx: (Math.random() - 0.5) * 2, vy: 1.0, vz: (Math.random() - 0.5) * 2, ttl: 0.3, size: 0.14, a: 0.95, r: 1, g: 1, b: 0.7 }); } catch {} }
    }

    _wx(gx) { return this.ox + gx; }
    _wz(gz) { return this.oz + gz; }
    _set(gx, gz, y, id) { try { this.world.setVoxel(this._wx(gx), y, this._wz(gz), id); } catch {} }

    _build() {
        const GW = this.GW, GH = this.GH;
        for (let z = 0; z < GH; z++) for (let x = 0; x < GW; x++) {
            this._set(x, z, FY, this.wall[z * GW + x] ? WALL_ID : FLOOR_ID);   // floor slab (walls sit on stone)
            if (this.wall[z * GW + x]) for (let h = 1; h <= WALL_H; h++) this._set(x, z, FY + h, WALL_ID);
        }
        for (const [x, z] of (this.water || [])) this._set(x, z, FY, WATER_ID);
        for (const [x, z] of (this.torches || [])) { if (!this.wall[z * GW + x]) this._set(x, z, FY + 1, TORCH_ID); }
    }

    _clearRegion() {
        const GW = this.GW, GH = this.GH;
        for (let z = 0; z < GH; z++) for (let x = 0; x < GW; x++)
            for (let h = 0; h <= WALL_H + 1; h++) this._set(x, z, FY + h, AIR);
    }

    // BFS over open cells from a -> b; returns a list of [gx,gz] cells.
    _solve(a, b) {
        const GW = this.GW, GH = this.GH, N = GW * GH;
        const prev = new Int32Array(N).fill(-2), q = [a.cz * GW + a.cx];
        prev[a.cz * GW + a.cx] = -1;
        const goal = b.cz * GW + b.cx;
        const DX = [0, 1, 0, -1], DZ = [-1, 0, 1, 0];
        while (q.length) {
            const cur = q.shift(); if (cur === goal) break;
            const cx = cur % GW, cz = (cur / GW) | 0;
            for (let d = 0; d < 4; d++) {
                const nx = cx + DX[d], nz = cz + DZ[d];
                if (nx < 0 || nx >= GW || nz < 0 || nz >= GH) continue;
                const ni = nz * GW + nx;
                if (this.wall[ni] || prev[ni] !== -2) continue;
                prev[ni] = cur; q.push(ni);
            }
        }
        if (prev[goal] === -2) return [[a.cx, a.cz]];
        const path = []; for (let c = goal; c >= 0; c = prev[c]) path.push([c % GW, (c / GW) | 0]);
        return path.reverse();
    }

    _cellWorld(c) { return [this._wx(c[0]) + 0.5, FY + 1, this._wz(c[1]) + 0.5]; }

    _clearMonsters() {
        for (const id of this._monsters) { try { window.fpsShooter && window.fpsShooter.unregisterEnemy(id); } catch {} try { this.router.exec({ type: "entity:despawn", id }); } catch {} }
        this._monsters = [];
        this._proj = [];   // v1416
        this._items = [];   // v1419
        this._burns = [];   // v1424
        this._nades = []; this._pools = [];   // v1428
        this._bossId = null; this._bossEnraged = false; try { this._removeBossBar(); } catch {}   // v1431
        this._elem = new Map(); this._elemHinted = false;   // v1432
        if (this._ai) { try { this._ai.clear(); } catch {} }   // v1400
    }

    // v1407 — a monster was shot dead (FPSShooter delegates the kill here): despawn,
    // drop a small bounty, count it, and pull it from the AI + tracking.
    _onMonsterDeath(id) {
        try { this.router.exec({ type: "entity:despawn", id }); } catch {}
        const i = this._monsters.indexOf(id); if (i >= 0) this._monsters.splice(i, 1);
        if (this._ai) { try { this._ai.remove(id); } catch {} }
        this._kills = (this._kills || 0) + 1;
        this._gold = (this._gold || 0) + 2;
        if (this._elem) this._elem.delete(id);   // v1432
        if (id === this._bossId) {   // v1431 — champion down: big gold + a guaranteed gear drop at the treasure
            this._bossId = null; this._bossEnraged = false; this._removeBossBar();
            this._gold += 25;
            try { if (this._treasure) { const g = ["damage", "armor", "speed", "regen", "lifesteal", "magnet", "thorns"][(Math.random() * 7) | 0]; (this._items = this._items || []).push({ x: this._wx(this._treasure[0]) + 0.5, z: this._wz(this._treasure[1]) + 1.0, kind: "gear", gear: g }); } } catch {}
            try { window.demoChrome && window.demoChrome.tick && window.demoChrome.tick("\ud83d\udc51 CHAMPION DOWN! +25 gold + gear"); } catch {}
        }
        if (this._buffs && this._buffs.lifesteal) { try { this._healPlayer(0.08); } catch {} }   // v1423
        try { this._onCombatEvent("kill", {}); } catch {}
        console.log(`[dungeon] monster down! kills ${this._kills} \u00b7 gold ${this._gold}`);
    }
    // v1406 — BFS distance (in cells) from the entrance over open cells; lets us scale
    // monster size/count + loot value by how FAR INTO the dungeon a cell is (distance,
    // not just floor depth). Stored as this._dm for the loot pickup in tick().
    _distMap() {
        const GW = this.GW, GH = this.GH;
        const a = this.rooms && this.rooms[0];
        const dist = new Int32Array(GW * GH).fill(-1);
        if (!a) return { dist: null, max: 1 };
        const start = a.cz * GW + a.cx; dist[start] = 0;
        const q = [start]; let head = 0, max = 0;
        const NB = [[1, 0], [-1, 0], [0, 1], [0, -1]];
        while (head < q.length) {
            const cur = q[head++], cx = cur % GW, cz = (cur / GW) | 0;
            for (const [dx, dz] of NB) {
                const nx = cx + dx, nz = cz + dz;
                if (nx < 0 || nz < 0 || nx >= GW || nz >= GH) continue;
                const ni = nz * GW + nx;
                if (dist[ni] >= 0 || this.wall[ni]) continue;
                dist[ni] = dist[cur] + 1; if (dist[ni] > max) max = dist[ni]; q.push(ni);
            }
        }
        return { dist, max: max || 1 };
    }

    _spawnMonsters() {
        if (typeof window === "undefined" || !window.assetRoles || !window.assetRoles.spawn || !this.rooms) return;
        // v1399/1406 — difficulty scales with floor DEPTH *and* DISTANCE from the entrance:
        // rooms farther in pack more + bigger monsters, so one dungeon ramps up as you go.
        const depth = this.depth || 1;
        const perRoom = Math.min(3, 1 + Math.floor((depth - 1) / 2));
        const baseSize = Math.min(2.2, 1 + (depth - 1) * 0.12);
        this._dm = this._distMap();
        const GW = this.GW;
        for (let i = 1; i < this.rooms.length; i++) {
            const r = this.rooms[i];
            const d = this._dm.dist ? this._dm.dist[r.cz * GW + r.cx] : -1;
            const dFrac = (d >= 0) ? d / this._dm.max : 0;                       // 0 at entrance, 1 at the deepest cell
            const sizeMul = Math.min(3.0, baseSize * (1 + dFrac * 0.8));          // farther = bigger
            const roomCount = Math.min(4, perRoom + (dFrac > 0.6 ? 1 : 0));       // deep rooms pack one more
            for (let k = 0; k < roomCount; k++) {
                const jx = roomCount > 1 ? (k - (roomCount - 1) / 2) * 1.6 : 0;
                const jz = (k % 2 ? 1 : -1) * (k ? 0.8 : 0);
                const x = this._wx(r.cx) + 0.5 + jx, z = this._wz(r.cz) + 0.5 + jz;
                window.assetRoles.spawn("dungeonMonster", { x, y: FY + 1, z, kind: "dungeon_monster", scale: 1.3, scaleMul: sizeMul })
                    .then((res) => {
                        if (!res || !res.ok || res.id == null) return;
                        if (this.active) {
                            this._monsters.push(res.id);
                            try { this._ai_().add(res.id, x, z); } catch {}
                            try { const hp = Math.max(2, Math.round(2 * sizeMul)); window.fpsShooter && window.fpsShooter.registerEnemy(res.id, { hp, kind: "dungeon_monster", onDeath: (eid) => this._onMonsterDeath(eid) }); } catch {}   // v1407 — shootable
                            try { this._maybeAssignElement(res.id, depth); } catch {}   // v1432 — elemental affinity
                        }
                        else { try { this.router.exec({ type: "entity:despawn", id: res.id }); } catch {} }   // dungeon torn down mid-spawn
                    }).catch(() => {});
            }
        }
        // v1431 — boss floor: every 3rd floor a champion guards the treasure room.
        if (depth % 3 === 0 && window.assetRoles && window.assetRoles.spawn && this._treasure) {
            const bx = this._wx(this._treasure[0]) + 0.5, bz = this._wz(this._treasure[1]) + 0.5;
            window.assetRoles.spawn("dungeonMonster", { x: bx, y: FY + 1, z: bz, kind: "dungeon_boss", scale: 1.3, scaleMul: 3.2 })
                .then((res) => {
                    if (!res || !res.ok || res.id == null) return;
                    if (this.active) {
                        this._monsters.push(res.id); this._bossId = res.id; this._bossEnraged = false;
                        try { this._ai_().add(res.id, bx, bz, "boss"); } catch {}
                        try { window.fpsShooter && window.fpsShooter.registerEnemy(res.id, { hp: 30 + depth * 6, kind: "dungeon_boss", name: "Dungeon Champion", onDeath: (eid) => this._onMonsterDeath(eid) }); } catch {}
                        try { window.demoChrome && window.demoChrome.tick && window.demoChrome.tick("\ud83d\udc79 A champion guards this floor!"); } catch {}
                    } else { try { this.router.exec({ type: "entity:despawn", id: res.id }); } catch {} }
                }).catch(() => {});
        }
        if (depth > 1) console.log(`[dungeon] floor ${depth}: monsters scale with depth + distance from entrance`);
    }
    // v1431 — dungeon boss HP bar across the top (self-contained; reads fpsShooter HP).
    _updateBossBar() {
        if (!this._bossId || typeof document === "undefined") { this._removeBossBar(); return; }
        let hpf = null; try { hpf = (window.fpsShooter && window.fpsShooter.enemyHP) ? window.fpsShooter.enemyHP(this._bossId) : null; } catch {}
        if (hpf == null) { this._removeBossBar(); return; }
        if (!this._bossBarEl) {
            const bar = document.createElement("div"); bar.id = "dungeonBossBar";
            Object.assign(bar.style, { position: "fixed", left: "50%", top: "78px", transform: "translateX(-50%)", width: "min(520px,72vw)", padding: "5px 10px 7px", background: "rgba(30,4,10,0.92)", border: "1px solid #f47", borderRadius: "6px", color: "#fcc", font: "11px monospace", letterSpacing: "1px", textAlign: "center", zIndex: "8700" });
            document.body.appendChild(bar); this._bossBarEl = bar;
        }
        if (hpf < 0.3 && !this._bossEnraged) { this._bossEnraged = true; try { window.demoChrome && window.demoChrome.tick && window.demoChrome.tick("\ud83d\udd25 The champion ENRAGES!"); } catch {} }
        const pct = Math.max(0, Math.round(hpf * 100)), col = this._bossEnraged ? "#f60" : "#f47";
        this._bossBarEl.innerHTML = `\ud83d\udc79 DUNGEON CHAMPION${this._bossEnraged ? " <span style=\"color:#fb0\">[ENRAGED]</span>" : ""}<div style="margin-top:3px;height:8px;background:#400;border-radius:4px;overflow:hidden"><div style="height:100%;width:${pct}%;background:${col}"></div></div>`;
    }
    _removeBossBar() { if (this._bossBarEl && this._bossBarEl.parentNode) { this._bossBarEl.parentNode.removeChild(this._bossBarEl); } this._bossBarEl = null; }

    _newRun() {
        this._clearMonsters();
        this._gen();
        this._build();
        const a = this.rooms[0], b = this.rooms[this.rooms.length - 1];
        this.path = this._solve(a, b);
        this.idx = 0; this.t = 0; this.heading = 0; this._rest = 0;
        this._treasure = [b.cx, b.cz];
        this._set(b.cx, b.cz, FY + 1, TREASURE_ID);
        this._set(this.path[0][0], this.path[0][1], FY + 1, EXPLORER_ID);
        const w0 = this._cellWorld(this.path[0]);
        this.smooth = { x: w0[0], y: w0[1], z: w0[2] };
        this._spawnMonsters();   // v1372 — library models as dungeon monsters
        // v1397 — scatter loot (gold) in up to 3 middle rooms (not entrance/treasure)
        this._loot = [];
        const mid = [];
        for (let i = 1; i < this.rooms.length - 1; i++) mid.push(this.rooms[i]);
        for (let k = mid.length - 1; k > 0; k--) { const j = (Math.random() * (k + 1)) | 0; const tmp = mid[k]; mid[k] = mid[j]; mid[j] = tmp; }
        for (const r of mid.slice(0, 3)) { if (!(r.cx === this._treasure[0] && r.cz === this._treasure[1])) { this._loot.push([r.cx, r.cz]); this._set(r.cx, r.cz, FY + 1, TREASURE_ID); } }
        this._spawnLoot();   // v1419 — health / key / gear
    }

    // v1397 — descend to a fresh, deeper floor (reached the treasure in first-person).
    _descend() {
        this._gold = (this._gold || 0) + (4 + (this.depth || 1));   // v1406 — the treasure is the deepest point, biggest payout
        this.depth = (this.depth || 1) + 1;
        try { this._onCombatEvent("descend", {}); } catch {}
        console.log(`[dungeon] descending to floor ${this.depth}\u2026  (gold so far: ${this._gold || 0})`);
        this._newRun();   // clears + regenerates + respawns monsters + new loot
        const a = this.rooms && this.rooms[0];
        if (a) { const c = this._cellWorld([a.cx, a.cz]); try { this.camera.position.x = c[0]; this.camera.position.z = c[2]; this.camera.position.y = FY + 1.6; } catch {} }
        this._descending = false;
    }

    start() {
        this.stop();
        this.depth = 1; this._gold = 0; this._playerHP = 100; this._kills = 0;   // v1397/1400/1407
        this._throw = { axe: 4, arrow: 8 }; this._pproj = []; this._drops = []; this._weapon = "sword";   // v1417/1418
        this._items = []; this._keys = 0; this._doors = []; this._armorMul = 1; this._buffs = { damage: false, armor: false, speed: false, regen: false, lifesteal: false, magnet: false, thorns: false }; this._blocking = false; this._arrowKind = "normal"; this._burns = []; this._energy = 100; this._nadeAmmo = { frag: 3, fire: 2, acid: 2, ice: 2 }; this._nadeType = "frag"; this._nades = []; this._pools = []; this._auto = false; this._bossId = null; this._bossEnraged = false; this._elem = new Map(); this._elemHinted = false;   // v1419-1432
        this._items = []; this._keys = 0; this._doors = []; this._armorMul = 1; this._buffs = { damage: false, armor: false, speed: false, regen: false, lifesteal: false, magnet: false, thorns: false }; this._blocking = false; this._arrowKind = "normal"; this._burns = []; this._energy = 100; this._nadeAmmo = { frag: 3, fire: 2, acid: 2, ice: 2 }; this._nadeType = "frag"; this._nades = []; this._pools = []; this._auto = false; this._bossId = null; this._bossEnraged = false; this._elem = new Map(); this._elemHinted = false;   // v1419-1432
        this._newRun();
        this.active = true;
        this._lastT = (typeof performance !== "undefined" ? performance.now() : Date.now());
        const w = this.smooth;
        try { this.camera.position.x = w.x; this.camera.position.y = FY + 18; this.camera.position.z = w.z + 4; this.camera.yaw = 0; this.camera.pitch = -1.3; } catch {}
        this._mountToggle();
        try { window.dungeon = { start: () => this.start(), stop: () => this.stop(), walk: () => this.walk(), gold: () => this._gold || 0, floor: () => this.depth || 1, hp: () => { const fs = (typeof window !== "undefined") ? window.fpsShooter : null; return (fs && fs.active) ? Math.round((fs.health ?? 1) * 100) : (this._playerHP ?? 100); }, kills: () => this._kills || 0, throw: () => this._throwWeapon(), axes: () => (this._throw && this._throw.axe) || 0, attack: () => this._attack(), swap: () => this._swapWeapon(1), weapon: () => this._weapon || "sword", block: () => this._toggleBlock(), arrow: () => this._cycleArrow(), arrowKind: () => this._arrowKind || "normal", grenade: () => this._throwGrenade(), nade: () => this._cycleNade(), nadeType: () => this._nadeType || "frag", auto: (on) => this._setAuto(on), mode: (m) => { this.mode = (m === "shoulder" ? "shoulder" : "td"); } }; } catch {}
    }

    stop() {
        try { this._clearMonsters(); } catch {}
        if (this.active) { try { this._clearRegion(); } catch {} }
        if (this._priorDetailMix != null) { try { window._voxelRenderer && window._voxelRenderer.setDetailMix(this._priorDetailMix); } catch {} this._priorDetailMix = null; }   // v1398
        this.active = false; this._fpMode = false;
        if (this._btn) { try { this._btn.remove(); } catch {} this._btn = null; }
        if (this._key) { try { window.removeEventListener("keydown", this._key); } catch {} this._key = null; }
        if (this._throwKey) { try { window.removeEventListener("keydown", this._throwKey); } catch {} this._throwKey = null; }   // v1417
        try { this._setBlocking(false); } catch {}   // v1420
        if (this._blockDown) { try { window.removeEventListener("keydown", this._blockDown); window.removeEventListener("keyup", this._blockUp); window.removeEventListener("mousedown", this._blockMD); window.removeEventListener("mouseup", this._blockMU); window.removeEventListener("contextmenu", this._blockCtx); } catch {} this._blockDown = null; }
        this._pproj = []; this._drops = []; this._removeWeaponHUD();
    }

    _mountToggle() {
        if (this._btn || typeof document === "undefined") return;
        const b = document.createElement("button");
        b.id = "dungeonCamBtn";
        const label = () => "\uD83C\uDFF0 Cam: " + (this.mode === "td" ? "Top-down" : "Over-shoulder") + "  (V)";
        b.textContent = label();
        b.style.cssText = "position:fixed; left:50%; bottom:14px; transform:translateX(-50%); z-index:40; " +
            "padding:7px 14px; border-radius:9px; border:1px solid #403a2a; background:rgba(16,12,8,0.9); " +
            "color:#f0d68a; font:12px ui-monospace, monospace; cursor:pointer; pointer-events:auto;";
        const toggle = () => { this.mode = this.mode === "td" ? "shoulder" : "td"; b.textContent = label(); };
        b.addEventListener("click", toggle);
        this._key = (e) => { if ((e.key === "v" || e.key === "V") && this.active) toggle(); };
        window.addEventListener("keydown", this._key);
        document.body.appendChild(b);
        this._btn = b;
    }

    tick() {
        if (!this.active || !this.path) return;
        const now = (typeof performance !== "undefined" ? performance.now() : Date.now());
        let dt = (now - this._lastT) / 1000; this._lastT = now;
        if (!(dt > 0) || dt > 0.25) dt = 0.016;

        if (this._rest > 0) {
            this._rest -= dt;
            if (this._rest <= 0 && !this._fpMode) this._newRun();   // v1397 — in first-person YOU trigger descent, not the explorer
        } else if (this.idx < this.path.length - 1) {
            this.t += dt / STEP_S;
            while (this.t >= 1 && this.idx < this.path.length - 1) {
                this.t -= 1;
                const from = this.path[this.idx], to = this.path[this.idx + 1];
                if (!(from[0] === this._treasure[0] && from[1] === this._treasure[1])) this._set(from[0], from[1], FY + 1, AIR);
                this.idx++;
                this.heading = headingYaw(to[0] - from[0], to[1] - from[1]);
                const at = this.path[this.idx];
                this._set(at[0], at[1], FY + 1, EXPLORER_ID);
                if (this.idx >= this.path.length - 1) { this._rest = REST_S; this.t = 0; }
            }
            const a = this._cellWorld(this.path[this.idx]);
            const b = this._cellWorld(this.path[Math.min(this.idx + 1, this.path.length - 1)]);
            const tt = Math.min(1, this.t);
            this.smooth.x = a[0] + (b[0] - a[0]) * tt;
            this.smooth.z = a[2] + (b[2] - a[2]) * tt;
            this.smooth.y = FY + 1;
        }

        // v1397 — first-person pickups + descent: check the player's cell against loot / treasure
        if (this._fpMode && this.camera && this.camera.position) {
            const gx = Math.floor(this.camera.position.x - this.ox);
            const gz = Math.floor(this.camera.position.z - this.oz);
            if (this._loot) for (let i = this._loot.length - 1; i >= 0; i--) {
                const [lx, lz] = this._loot[i];
                if (lx === gx && lz === gz) {
                    this._set(lx, lz, FY + 1, AIR); this._loot.splice(i, 1);
                    const d = (this._dm && this._dm.dist) ? this._dm.dist[lz * this.GW + lx] : -1;
                    const val = 1 + Math.round(((d >= 0) ? d / this._dm.max : 0) * 4);   // v1406 — farther loot worth more (1..5)
                    this._gold = (this._gold || 0) + val;
                    console.log(`[dungeon] loot +${val}! gold ${this._gold} \u00b7 floor ${this.depth}`);
                }
            }
            this._maybeDescend(gx, gz);   // v1419 — key-gated stairs
            try { this._ai_().update(dt); } catch {}   // v1400 — monsters chase + attack
            try { this._tickProjectiles(dt); } catch {}   // v1416 — fly ranged projectiles
            try { this._tickPlayerProjectiles(dt); } catch {}   // v1417 — fly thrown weapons + pickups
            try { this._tickBurns(dt); } catch {}   // v1424 — fire-arrow burn DoT
            try { this._tickEnergy(dt); } catch {}   // v1427 — energy regen
            try { this._tickGrenades(dt); } catch {}   // v1428 — grenade physics
            try { this._tickPools(dt); } catch {}   // v1428 — acid pools
            try { this._tickHero(dt); } catch {}   // v1429 — hero auto-pilot
            try { this._updateBossBar(); } catch {}   // v1431 — boss HP bar
            try { this._tickAuras(dt); } catch {}   // v1432 — elemental auras
            try { this._tickItems(dt); } catch {}   // v1419 — loot glints + pickups
        }
        if (!this._fpMode) this._driveCamera(dt);   // v1396 — first-person: FPS owns the camera
    }

    // v1396 — FIRST-PERSON dungeon walk. Build the dungeon + spawn monsters, drop the
    // player into the entrance room at eye height, and hand the camera to FPS so you
    // walk the corridors yourself (voxel collision against the stone walls). The auto-
    // explorer still pads toward the treasure as a companion.
    walk() { this.start(); this._enterFP(); return true; }

    // v1405 — shared first-person entry (used by walk() and loadLayout()).
    _enterFP() {
        this._fpMode = true;       // tick() now leaves the camera to FPS
        const a = this.rooms && this.rooms[0];
        if (a) {
            const c = this._cellWorld([a.cx, a.cz]);
            try { this.camera.position.x = c[0]; this.camera.position.z = c[2]; this.camera.position.y = FY + 1.6; this.camera.pitch = 0; this.camera.yaw = 0; } catch {}
        }
        // v1398 — showcase the voxel detail-texture ATLAS on the stone.
        try {
            const r = window._voxelRenderer;
            this._priorDetailMix = (r && r.getDetailState) ? r.getDetailState().mix : 0;
            if (r) { r.setDetailScale(0.5); r.setDetailMix(0.5); }
        } catch {}
        try { window.fps && window.fps.start && window.fps.start({ spawnBots: false, onFire: () => this._attack() }); } catch {}   // v1418 — click/space = equipped weapon
        try { this._onCombatEvent("enter", {}); } catch {}
        this._updateWeaponHUD();   // v1417
        if (typeof window !== "undefined" && !this._throwKey) {
            this._throwKey = (e) => {
                if (!this._fpMode) return;
                const k = (e.key || "").toLowerCase();
                if (e.code === "KeyF" || k === "f") { try { e.preventDefault(); } catch {} this._throwWeapon(); }   // quick-axe regardless of equipped
                else if (e.code === "KeyQ" || k === "q") this._swapWeapon(1);
                else if (k === "1") this._selectWeapon("sword");
                else if (k === "2") this._selectWeapon("bow");
                else if (k === "3") this._selectWeapon("axe");
                else if (k === "4") this._selectWeapon("flame");
                else if (k === "5") this._selectWeapon("bolt");
                else if (e.code === "KeyT" || k === "t") this._cycleArrow();   // v1424 — arrow type
                else if (e.code === "KeyG" || k === "g") this._throwGrenade();   // v1428 — grenade
                else if (e.code === "KeyB" || k === "b") this._cycleNade();
                else if (e.code === "KeyP" || k === "p") this._setAuto();   // v1429 — hero auto-pilot
            };
            try { window.addEventListener("keydown", this._throwKey); } catch {}
        }
        if (typeof window !== "undefined" && !this._blockDown) {   // v1420 — hold C or right-mouse to block
            this._blockDown = (e) => { if (!this._fpMode) return; const k = (e.key || "").toLowerCase(); if (e.code === "KeyC" || k === "c") this._setBlocking(true); };
            this._blockUp   = (e) => { const k = (e.key || "").toLowerCase(); if (e.code === "KeyC" || k === "c") this._setBlocking(false); };
            this._blockMD   = (e) => { if (this._fpMode && e.button === 2) { try { e.preventDefault(); } catch {} this._setBlocking(true); } };
            this._blockMU   = (e) => { if (e.button === 2) this._setBlocking(false); };
            this._blockCtx  = (e) => { if (this._fpMode) { try { e.preventDefault(); } catch {} } };
            try { window.addEventListener("keydown", this._blockDown); window.addEventListener("keyup", this._blockUp); window.addEventListener("mousedown", this._blockMD); window.addEventListener("mouseup", this._blockMU); window.addEventListener("contextmenu", this._blockCtx); } catch {}
        }
        console.log(`[dungeon] first-person \u2014 CLICK/SPACE = equipped weapon \u00b7 1/2/3 or Q swap sword/bow/axe \u00b7 F quick-throws an axe \u00b7 pick up arrows/axes \u00b7 grab gold, reach treasure. window.dungeon.hp()/.gold()/.kills()/.axes()/.weapon(); fps.stop() to exit.`);
    }

    // v1405 — build a dungeon from an IMPORTED layout grid (DungeonLayout.gridFromAscii /
    // gridFromImage) instead of generating one, then drop into first-person.
    loadLayout(grid, opts = {}) {
        if (!grid || !grid.wall) { console.warn("[dungeon] bad layout grid"); return false; }
        const d = deriveLayout(grid);
        if (!d) { console.warn("[dungeon] layout has no open/walkable cells"); return false; }
        this.stop();
        this.GW = grid.GW; this.GH = grid.GH;
        this.ox = -(this.GW >> 1); this.oz = -(this.GH >> 1);
        this.wall = grid.wall; this.rooms = d.rooms; this.water = []; this.torches = [];
        this.depth = 1; this._gold = 0; this._playerHP = 100; this._kills = 0;
        this._throw = { axe: 4, arrow: 8 }; this._pproj = []; this._drops = []; this._weapon = "sword";   // v1417/1418
        this._build();   // carve voxels from this.wall
        this.path = this._solve(this.rooms[0], this.rooms[this.rooms.length - 1]) || [[d.entrance[0], d.entrance[1]]];
        this.idx = 0; this.t = 0; this.heading = 0; this._rest = 0;
        this._treasure = [d.treasure[0], d.treasure[1]];
        this._set(d.treasure[0], d.treasure[1], FY + 1, TREASURE_ID);
        this._set(this.path[0][0], this.path[0][1], FY + 1, EXPLORER_ID);
        const w0 = this._cellWorld(this.path[0]); this.smooth = { x: w0[0], y: w0[1], z: w0[2] };
        this._spawnMonsters();
        this._loot = [];
        for (const r of this.rooms.slice(1, -1)) { if (!(r.cx === this._treasure[0] && r.cz === this._treasure[1])) { this._loot.push([r.cx, r.cz]); this._set(r.cx, r.cz, FY + 1, TREASURE_ID); } }
        this._spawnLoot();   // v1419
        this.active = true; this._lastT = (typeof performance !== "undefined" ? performance.now() : Date.now());
        this._mountToggle();
        try { window.dungeon = { start: () => this.start(), stop: () => this.stop(), walk: () => this.walk(), gold: () => this._gold || 0, floor: () => this.depth || 1, hp: () => { const fs = (typeof window !== "undefined") ? window.fpsShooter : null; return (fs && fs.active) ? Math.round((fs.health ?? 1) * 100) : (this._playerHP ?? 100); }, kills: () => this._kills || 0, throw: () => this._throwWeapon(), axes: () => (this._throw && this._throw.axe) || 0, attack: () => this._attack(), swap: () => this._swapWeapon(1), weapon: () => this._weapon || "sword", block: () => this._toggleBlock(), arrow: () => this._cycleArrow(), arrowKind: () => this._arrowKind || "normal", grenade: () => this._throwGrenade(), nade: () => this._cycleNade(), nadeType: () => this._nadeType || "frag", auto: (on) => this._setAuto(on), mode: (m) => { this.mode = (m === "shoulder" ? "shoulder" : "td"); } }; } catch {}
        console.log(`[dungeon] layout imported: ${grid.GW}\u00d7${grid.GH}, ${d.openCount} open cell(s), ${this.rooms.length} spawn point(s).`);
        if (opts.walk !== false) this._enterFP();
        return true;
    }

    _driveCamera(dt) {
        const cam = this.camera; if (!cam || !cam.position) return;
        const yaw = this.heading;
        const fx = Math.sin(yaw), fz = -Math.cos(yaw);
        let tx, ty, tz, pitch;
        if (this.mode === "shoulder") { tx = this.smooth.x - fx * 4.5; tz = this.smooth.z - fz * 4.5; ty = FY + 3.5; pitch = -0.26; }
        else { tx = this.smooth.x - fx * 2; tz = this.smooth.z - fz * 2; ty = FY + 18; pitch = -1.3; }
        const k = Math.min(1, dt * 6);
        cam.position.x += (tx - cam.position.x) * k;
        cam.position.y += (ty - cam.position.y) * k;
        cam.position.z += (tz - cam.position.z) * k;
        try { cam.yaw = lerpAngle(cam.yaw || 0, yaw, Math.min(1, dt * 5)); cam.pitch = pitch; } catch {}
    }
}

export default DungeonDemo;
