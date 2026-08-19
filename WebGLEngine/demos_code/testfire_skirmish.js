// demos_code/testfire_skirmish.js — v1448
// A 3D front-end PROTOTYPE for a tabletop-style mech skirmish: an 8x8 grid, 4 war
// machines per side, alternating activations, move / fire / area / push / ram.
// Built to demo the SweK Engine as a digital front-end for a tabletop wargame.
//
// IP NOTE: the rules + unit stats live in simulation/SkirmishGame.js and are
// ORIGINAL generic placeholders — not any published game's content. Use a real
// designer's ruleset/art/minis only with their permission (their minis would drop
// in as the per-unit .glb models, same picker the aircraft layer uses).
//
// Modes (window.skirmish.mode):
//   "aivai"     — AI vs AI (auto-plays; the headline visual)
//   "vsai"      — you drive side A via the HUD, AI drives side B
//   "hotseat"   — both sides driven via the HUD (two humans)
//   "net"       — SweK-vs-SweK over the bridge relay (/skirmish/state); rig-only
//   "smarter"   — AI vs AI where each brain is an Ollama LLM strategist (rig-only)

import * as SG from "../simulation/SkirmishGame.js";
import { buildVoxelMesh } from "../gpu/voxelCreature.js";
import { registerSTLFromUrl } from "../gpu/stlLoader.js";

const CELL = 4, FLOOR_Y = 1;
const SIDE_CI = { A: 4, B: 6 };   // palette tint per side (visual-verify)

// His real Testfire Initiative roster (stats read from his cards). Two teams of 4.
// stl/card are filename substrings matched against the imported mod's files. The
// exact faction names (Indaran / Solar Ascendancy) are his — labelled by theme here;
// swap if needed. The 8 unit STATS are his; the deeper rules (Rapid Fire, Smoke, Jump,
// repairs, attack patterns) stay his to implement with permission.
const TESTFIRE = {
    A: { label: "Hardsuits", units: [
        { kind: "hopper",   name: "Hopper Hardsuit", fb: "scout",   hp: 3, move: 3, weapon: { type: "direct", range: 3, dmg: 1 }, stl: "Hopper",   card: "hopper" },
        { kind: "grunt",    name: "Grunt Hardsuit",  fb: "trooper", hp: 3, move: 3, weapon: { type: "direct", range: 3, dmg: 1 }, stl: "Grunt",    card: "grunt" },
        { kind: "wraith",   name: "Wraith Hardsuit", fb: "heavy",   hp: 3, move: 4, weapon: { type: "direct", range: 1, dmg: 2 }, stl: "Wraith",   card: "wraith" },
        { kind: "engineer", name: "Combat Engineer", fb: "arty",    hp: 3, move: 3, weapon: { type: "area",   range: 3, dmg: 1, aoe: 1 }, stl: "Engineer", card: "engineer" },
    ] },
    B: { label: "Vehicles", units: [
        { kind: "stinger", name: "Stinger Buggy", fb: "scout", hp: 3, move: 4, weapon: { type: "direct", range: 2, dmg: 2 }, stl: "StingerBuggy", card: "stinger" },
        { kind: "railgun", name: "U.R. Railgun",  fb: "arty",  hp: 1, move: 2, weapon: { type: "direct", range: 6, dmg: 2 }, stl: "Railgun",      card: "railgun" },
        { kind: "mortar",  name: "Mortar Bot",    fb: "arty",  hp: 2, move: 2, weapon: { type: "area",   range: 5, dmg: 1, aoe: 1 }, stl: "Mortarbot",   card: "mortar" },
        { kind: "brick",   name: "Brick Tank",    fb: "heavy", hp: 4, move: 2, weapon: { type: "direct", range: 3, dmg: 1 }, stl: "BrickTank",    card: "brick" },
    ] },
};
const TF_FB = { hopper: "scout", grunt: "trooper", wraith: "heavy", engineer: "arty", stinger: "scout", railgun: "arty", mortar: "arty", brick: "heavy" };

let _boardN = 8;
function gridToWorld(gx, gy) { const c = (_boardN - 1) / 2; return { x: (gx - c) * CELL, y: FLOOR_Y, z: (gy - c) * CELL }; }

// small blocky mech, tinted by side, lightly varied by archetype
function mechVoxels(kind, ci) {
    const v = []; const acc = ci === 7 ? 6 : ci + 1;
    v.push([-1, 0, 0, ci], [1, 0, 0, ci], [-1, 1, 0, ci], [1, 1, 0, ci]);          // legs
    for (let y = 2; y <= 3; y++) for (let x = -1; x <= 1; x++) v.push([x, y, 0, ci]); // torso
    v.push([0, 4, 0, acc]);                                                           // head
    if (kind !== "scout") v.push([-2, 3, 0, ci], [2, 3, 0, ci]);                      // arms
    if (kind === "heavy") v.push([-2, 2, 0, ci], [2, 2, 0, ci], [0, 3, 1, ci]);       // bulk
    if (kind === "arty") v.push([0, 5, 0, acc], [0, 4, -1, acc]);                     // mortar barrel
    return v;
}

export default {
    id: "testfire_skirmish",
    label: "SKIRMISH PROTOTYPE (mech tactics \u2014 scalable board)",
    hint: "Digital front-end prototype for a tabletop mech skirmish — AI vs AI, vs AI, or hot-seat",
    isolation: "exclusive",
    displayOrder: 6,
    controls: [
        "AI vs AI auto-plays on start — mechs maneuver, fire, push, ram, and die",
        "Use the panel to switch to Vs AI / Hot-seat, or restart",
        "window.skirmish.mode('aivai'|'vsai'|'hotseat'|'net'|'smarter')",
        "window.skirmish.size(16) \u2014 combine more tile sections into a larger field (8..32)",
    ],

    start() {
        const stage = (typeof window !== "undefined") ? window._stage : null;
        const router = window.router;
        if (stage) try { stage.enter({ floor: true }); } catch {}
        if (!router) { console.warn("[skirmish] router not ready"); return; }

        const S = {
            game: null, mode: "aivai", room: "skirmish1", net: { seq: 0 }, boardSize: 8,
            ents: new Map(),         // unitId -> { id, x, z, tx, tz }  (world pos + lerp target)
            board: [], range: [],    // board-tile + move-range marker entity ids
            modelSet: "default",     // "default" (procedural) or a loaded mod name
            modKinds: {},            // "<side>_<archetype>" -> registered STL kind name
            roster: null,            // custom unit roster (his real units) when a mod sets one
            unitCards: {},           // unit kind -> his card image URL
            unitModelOverride: {},   // unit id -> registered kind (per-unit model picker)
            sel: null, moveTo: null, // click-to-move: selected unit + tentative destination
            dice: [], lastRoll: null, diceOn: true,   // 3D dice roller state
            cardPanel: null, winPanel: null,
            mods: [],                // available mods (from the bridge)
            raf: null, timer: null, busy: false, hud: null, over: false,
            commanders: null,
        };
        this._S = S;

        // ---- register procedural mech kinds (per archetype x side) ----
        function registerKinds() {
            const al = window.assetLoader;
            if (!al || !al.gl || !al.cache || !al._createMesh) return false;
            for (const side of ["A", "B"]) for (const kind of ["scout", "trooper", "heavy", "arty"]) {
                const name = "skm_" + side + "_" + kind;
                if (al.cache.get(name)) continue;
                try {
                    const g = buildVoxelMesh(mechVoxels(kind, SIDE_CI[side]));
                    const mesh = al._createMesh(g.positions.buffer, g.indices.buffer, g.normals.buffer, g.colors.buffer,
                        { name, vertexCount: g.vertexCount, indexCount: g.indices.length, hasNormals: true, hasColors: true });
                    if (mesh) { al.cache.set(name, mesh); al._ollamaRequested?.add?.(name); }
                } catch (e) { console.warn("[skirmish] kind " + name + ":", e && e.message); }
            }
            // board tiles (light/dark checker), terrain rock, move-range marker
            const slab = (ci, w, h, t) => { const v = []; for (let x = 0; x < w; x++) for (let z = 0; z < w; z++) for (let y = 0; y < t; y++) v.push([x, y, z, ci]); return v; };
            const tileKinds = { skm_tile_a: slab(0, 3, 3, 1), skm_tile_b: slab(2, 3, 3, 1), skm_rock: slab(5, 3, 3, 3), skm_range: slab(7, 3, 3, 1), skm_die: slab(1, 2, 2, 2) };
            for (const [name, vox] of Object.entries(tileKinds)) {
                if (al.cache.get(name)) continue;
                try { const g = buildVoxelMesh(vox); const mesh = al._createMesh(g.positions.buffer, g.indices.buffer, g.normals.buffer, g.colors.buffer, { name, vertexCount: g.vertexCount, indexCount: g.indices.length, hasNormals: true, hasColors: true }); if (mesh) { al.cache.set(name, mesh); al._ollamaRequested?.add?.(name); } } catch {}
            }
            return true;
        }

        function kindForUnit(u) {
            const ov = S.unitModelOverride[u.id]; if (ov && window.assetLoader?.cache?.get?.(ov)) return ov;   // per-unit model picker
            if (S.modelSet !== "default") {
                const k = S.modKinds[u.side + "_" + u.kind]; if (k && window.assetLoader?.cache?.get?.(k)) return k;
                const fb = TF_FB[u.kind] || (["scout", "trooper", "heavy", "arty"].includes(u.kind) ? u.kind : "trooper");
                return "skm_" + u.side + "_" + fb;   // STL not ready -> nearest procedural mech
            }
            return "skm_" + u.side + "_" + u.kind;
        }
        // load his Testfire pack precisely: real roster + STL models + card images
        async function loadTestfire(mod) {
            S.modKinds = {}; S.roster = { A: [], B: [] }; S.unitCards = {};
            const files = mod.files || [], cards = mod.cards || [];
            const findStl = (key) => { const k = key.toLowerCase(); const c = files.filter(f => f.name.toLowerCase().includes(k)); return c.find(f => /whole/i.test(f.name)) || c[0] || null; };
            const findCard = (key) => { const k = key.toLowerCase(); return cards.find(c => c.name.toLowerCase().includes(k)) || null; };
            for (const side of ["A", "B"]) for (const u of TESTFIRE[side].units) {
                S.roster[side].push({ kind: u.kind, name: u.name, hp: u.hp, move: u.move, weapon: { ...u.weapon } });
                const f = findStl(u.stl);
                if (f) { const kind = "mod_testfire_" + side + "_" + u.kind; try { await registerSTLFromUrl(window.assetLoader, kind, f.url, { targetSize: 3.2, anchor: "floor", color: side === "A" ? [0.45, 0.62, 0.95] : [0.95, 0.55, 0.3] }); S.modKinds[side + "_" + u.kind] = kind; } catch (e) { console.warn("[skirmish] testfire stl " + u.stl + ":", e && e.message); } }
                const c = findCard(u.card); if (c) S.unitCards[u.kind] = c.url;
            }
            return true;
        }
        function spawnUnits() {
            for (const [, e] of S.ents) try { router.exec({ type: "entity:despawn", id: e.id }); } catch {}
            S.ents.clear();
            for (const u of S.game.units) {
                const w = gridToWorld(u.x, u.y);
                let id = null;
                const kind = kindForUnit(u);
                try { const r = router.exec({ type: "entity:spawnMesh", assetId: kind, kind, x: w.x, y: w.y, z: w.z, scaleX: 1, scaleY: 1, scaleZ: 1, yaw: u.side === "A" ? 0 : Math.PI }); id = r && r.id; } catch {}
                if (id != null) S.ents.set(u.id, { id, x: w.x, z: w.z, tx: w.x, tz: w.z });
            }
        }

        // ---- board + terrain ----
        function buildBoard() {
            clearBoard();
            for (let gx = 0; gx < S.game.size; gx++) for (let gy = 0; gy < S.game.size; gy++) {
                const w = gridToWorld(gx, gy); const rock = S.game.terrain.has(gx + "," + gy);
                const kind = rock ? "skm_rock" : ((gx + gy) % 2 ? "skm_tile_a" : "skm_tile_b");
                try { const r = router.exec({ type: "entity:spawnMesh", assetId: kind, kind, x: w.x, y: rock ? FLOOR_Y - 0.4 : FLOOR_Y - 1.1, z: w.z, scaleX: 1, scaleY: 1, scaleZ: 1, yaw: 0 }); if (r && r.id != null) S.board.push(r.id); } catch {}
            }
        }
        function clearBoard() { for (const id of S.board) try { router.exec({ type: "entity:despawn", id }); } catch {} S.board = []; }

        // ---- move-range highlight ----
        function clearRange() { for (const id of S.range) try { router.exec({ type: "entity:despawn", id }); } catch {} S.range = []; }
        function showRange(unit) {
            clearRange(); if (!unit) return;
            const cells = SG.reachable(S.game, unit);
            for (const c of cells.slice(0, 40)) { const w = gridToWorld(c.x, c.y);
                try { const r = router.exec({ type: "entity:spawnMesh", assetId: "skm_range", kind: "skm_range", x: w.x, y: FLOOR_Y - 0.9, z: w.z, scaleX: 1, scaleY: 1, scaleZ: 1, yaw: 0 }); if (r && r.id != null) S.range.push(r.id); } catch {} }
        }

        // ---- combat FX (particles) ----
        function P() { return window.particles; }
        function fxTracer(ax, az, bx, bz) { const p = P(); if (!p) return; const n = 14; for (let i = 0; i <= n; i++) { const t = i / n; p.spawn({ x: ax + (bx - ax) * t, y: FLOOR_Y + 2, z: az + (bz - az) * t, vy: 0.2, ttl: 0.35, size: 0.35, r: 1, g: 0.85, b: 0.4, a: 0.9, gravity: 0 }); } }
        function fxBurst(x, z, col, count) { const p = P(); if (!p) return; for (let i = 0; i < (count || 18); i++) { const a = Math.random() * Math.PI * 2, r = 0.3 + Math.random() * 1.6; p.spawn({ x: x + Math.cos(a) * r, y: FLOOR_Y + 1 + Math.random(), z: z + Math.sin(a) * r, vx: Math.cos(a) * (1 + Math.random() * 4), vy: 0.5 + Math.random() * 3, vz: Math.sin(a) * (1 + Math.random() * 4), ttl: 0.6 + Math.random(), size: 0.4 + Math.random() * 0.6, r: col[0], g: col[1], b: col[2], a: 0.85, gravity: -3 }); } }
        function fxFor(actor, plan, pre) {
            const aw = gridToWorld(actor.x, actor.y);
            const act = plan && plan.action;
            if (act && (act.type === "fire" || act.type === "area" || act.type === "ram")) showDie(aw.x, aw.z);   // 3D combat die
            if (act && act.type === "fire") { const t = SG.unitById(S.game, act.targetUnitId); if (t) { const tw = gridToWorld(t.x, t.y); fxTracer(aw.x, aw.z, tw.x, tw.z); fxBurst(tw.x, tw.z, [1, 0.6, 0.2], 12); } }
            else if (act && act.type === "area") { const cw = gridToWorld(act.cell.x, act.cell.y); fxBurst(cw.x, cw.z, [1, 0.55, 0.15], 26); }
            else if (act && (act.type === "ram" || act.type === "push")) { const t = SG.unitById(S.game, act.targetUnitId); if (t) { const tw = gridToWorld(t.x, t.y); fxBurst(tw.x, tw.z, [0.8, 0.8, 0.9], 10); } }
            // destruction bursts for any unit that just died
            for (const u of S.game.units) if (u.hp <= 0 && pre[u.id] > 0) { const w = gridToWorld(u.x, u.y); fxBurst(w.x, w.z, [1, 0.4, 0.1], 30); }
        }
        function applyWithFX(plan) {
            const actor = SG.unitById(S.game, plan && plan.unitId);
            const pre = {}; for (const u of S.game.units) pre[u.id] = u.hp;
            if (actor) setTimeout(() => showRange(actor), 0);
            SG.applyTurn(S.game, plan);
            if (actor) { try { fxFor(actor, plan, pre); } catch {} }
            setTimeout(clearRange, 600);
        }

        // ---- mod model packs (his .stl set) ----
        function archetypeFromName(n) { n = (n || "").toLowerCase(); if (/scout|light|recon/.test(n)) return "scout"; if (/heavy|assault|tank|brute/.test(n)) return "heavy"; if (/art|missile|mortar|siege/.test(n)) return "arty"; return "trooper"; }
        async function fetchMods() { try { const r = await fetch("/skirmish/mod/list").then(x => x.json()); S.mods = (r && r.mods) || []; } catch { S.mods = []; } return S.mods; }
        async function loadMod(modName) {
            const mod = S.mods.find(m => m.name === modName); if (!mod) return false;
            S.modKinds = {};
            // map files -> side+archetype (bridge supplies guesses; fall back to filename heuristics)
            const bySide = { A: [], B: [] };
            (mod.files || []).forEach((f, i) => { const side = f.faction === "B" ? "B" : (f.faction === "A" ? "A" : (i % 2 ? "B" : "A")); bySide[side].push(f); });
            for (const side of ["A", "B"]) {
                const files = bySide[side].length ? bySide[side] : (mod.files || []);
                for (const arch of ["scout", "trooper", "heavy", "arty"]) {
                    const f = files.find(x => (x.archetype || archetypeFromName(x.name)) === arch) || files[0];
                    if (!f) continue;
                    const kind = "mod_" + modName + "_" + side + "_" + arch;
                    try { await registerSTLFromUrl(window.assetLoader, kind, f.url, { targetSize: 3.2, anchor: "floor", color: side === "A" ? [0.45, 0.62, 0.95] : [0.95, 0.5, 0.5] }); S.modKinds[side + "_" + arch] = kind; } catch (e) { console.warn("[skirmish] mod stl " + kind + ":", e && e.message); }
                }
            }
            return Object.keys(S.modKinds).length > 0;
        }
        async function setModelSet(set) {
            if (set !== "default") {
                if (!S.mods.length) await fetchMods();
                const mod = S.mods.find(m => m.name === set);
                if (mod && /testfire/i.test(set)) await loadTestfire(mod);
                else if (mod) { S.roster = null; S.unitCards = {}; const ok = await loadMod(set); if (!ok) set = "default"; }
                else { console.warn("[skirmish] mod not found, staying default"); set = "default"; }
            } else { S.roster = null; S.unitCards = {}; }
            S.modelSet = set; restart();   // rebuild the match (roster may have changed)
        }
        // ---- 3D dice ----
        function rollDie() { return 1 + Math.floor(Math.random() * 6); }
        function showDie(x, z) { if (!S.diceOn) return null; const v = rollDie(); S.lastRoll = v; try { const r = router.exec({ type: "entity:spawnMesh", assetId: "skm_die", kind: "skm_die", x, y: FLOOR_Y + 4, z, scaleX: 1, scaleY: 1, scaleZ: 1, yaw: 0 }); if (r && r.id != null) S.dice.push({ id: r.id, ttl: 55, sx: 0.25 + Math.random() * 0.4, sy: 0.2 + Math.random() * 0.4 }); } catch {} return v; }
        function tickDice() { for (let i = S.dice.length - 1; i >= 0; i--) { const d = S.dice[i]; const p = _pos(d.id); if (p) { p.yaw = (p.yaw || 0) + d.sx; p.tiltX = (p.tiltX || 0) + d.sy; } d.ttl--; if (d.ttl <= 0) { try { router.exec({ type: "entity:despawn", id: d.id }); } catch {} S.dice.splice(i, 1); } } }
        // ---- card panel (his card image when a pack is loaded, else a generated card) ----
        function closeCard() { try { if (S.cardPanel) S.cardPanel.remove(); } catch {} S.cardPanel = null; }
        function showCard(unit) {
            closeCard(); if (!unit) return;
            const p = document.createElement("div"); p.style.cssText = "position:fixed; left:14px; bottom:14px; z-index:201; width:240px; background:rgba(8,12,18,0.96); border:1px solid #34465c; border-radius:10px; padding:10px; color:#cfe; font-family:ui-monospace,monospace; box-shadow:0 8px 30px rgba(0,0,0,.6);";
            const url = S.unitCards[unit.kind];
            if (url) { const img = document.createElement("img"); img.src = url; img.style.cssText = "width:100%; border-radius:6px; display:block;"; p.appendChild(img); }
            else {
                const t = document.createElement("div"); t.style.cssText = "font-weight:700; color:#7fd7ff; margin-bottom:6px;"; t.textContent = unit.name; p.appendChild(t);
                const w = unit.weapon; const rows = [["Health", unit.hp + "/" + unit.maxHp], ["Movement", unit.move], ["Range", w.range], ["Damage", w.dmg], ["Fire", w.type === "area" ? "indirect (AoE)" : "direct"]];
                for (const [k, v] of rows) { const r = document.createElement("div"); r.style.cssText = "display:flex; justify-content:space-between; font-size:12px;"; const a = document.createElement("span"); a.style.color = "#9bb"; a.textContent = k; const b = document.createElement("span"); b.textContent = String(v); r.appendChild(a); r.appendChild(b); p.appendChild(r); }
            }
            const mp = document.createElement("div"); mp.style.cssText = "margin-top:8px; font-size:10px; color:#9bb;"; mp.textContent = "Model for this unit:";
            const msel = document.createElement("select"); msel.style.cssText = "width:100%; margin-top:3px; background:#0a0e14; color:#cde; border:1px solid #456; border-radius:5px; padding:4px; font-size:11px;";
            const o0 = document.createElement("option"); o0.value = ""; o0.textContent = "(default for type)"; msel.appendChild(o0);
            try { Promise.resolve(window.assetLibrary && window.assetLibrary.list && window.assetLibrary.list({ type: "mesh" })).then((r) => { let a = Array.isArray(r) ? r : (r && (r.items || r.assets)) || []; for (const it of a) { const id = it.id || it.assetId; if (!id) continue; const o = document.createElement("option"); o.value = id; o.textContent = it.name || id; if (S.unitModelOverride[unit.id] === "unit_model_" + id) o.selected = true; msel.appendChild(o); } }).catch(() => {}); } catch {}
            msel.onchange = () => setUnitModel(unit, msel.value || null);
            p.appendChild(mp); p.appendChild(msel);
            const x = document.createElement("button"); x.textContent = "close"; x.style.cssText = "width:100%; margin-top:8px; padding:4px; background:#234; color:#cde; border:1px solid #456; border-radius:5px; cursor:pointer;"; x.onclick = closeCard; p.appendChild(x);
            S.cardPanel = p; document.body.appendChild(p);
        }

        // ---- click-to-move tactical board (drives the 3D pieces) ----
        function buildBoardWidget() {
            const g = S.game; const human = !g.winner && !S.commanders[g.turnSide];
            const wrap = el("div", "margin-top:8px; border-top:1px solid #243044; padding-top:8px;");
            wrap.appendChild(el("div", "color:#9aa; font-size:10px; margin-bottom:4px;", human ? "Your move: click a unit \u2192 a cell \u2192 an enemy (or Hold)." : "Board"));
            const grid = el("div", "display:grid; grid-template-columns:repeat(" + g.size + ",1fr); gap:2px;");
            const sel = S.sel ? SG.unitById(g, S.sel) : null;
            const fromCell = (sel && S.moveTo) ? S.moveTo : (sel ? { x: sel.x, y: sel.y } : null);
            const reachSet = new Set((human && sel) ? SG.reachable(g, sel).map(c => c.x + "," + c.y) : []);
            const acts = (human && sel && fromCell) ? SG.actionsFrom(g, sel, fromCell.x, fromCell.y) : [];
            const hitSet = new Set(); for (const a of acts) { if (a.targetUnitId) { const t = SG.unitById(g, a.targetUnitId); if (t) hitSet.add(t.x + "," + t.y); } if (a.cell) hitSet.add(a.cell.x + "," + a.cell.y); }
            for (let y = 0; y < g.size; y++) for (let x = 0; x < g.size; x++) {
                const u = SG.unitAt(g, x, y); const rock = g.terrain.has(x + "," + y); const k = x + "," + y;
                let bg = (x + y) % 2 ? "#16202c" : "#11181f"; if (rock) bg = "#3a3024"; if (reachSet.has(k)) bg = "#1d4a63"; if (S.moveTo && S.moveTo.x === x && S.moveTo.y === y) bg = "#2a6c8f"; if (hitSet.has(k)) bg = "#7a2630";
                const cell = el("div", "aspect-ratio:1; border-radius:3px; display:flex; align-items:center; justify-content:center; font-size:10px; font-weight:700; background:" + bg + "; cursor:" + (human ? "pointer" : "default") + ";");
                if (u) { cell.textContent = (u.name || "?")[0]; const c = el("span", "color:" + (u.side === "A" ? "#8bd2ff" : "#ff9b9b") + ";" + (sel && u.id === sel.id ? "text-shadow:0 0 6px #ffd479;" : "") + (u.activated ? "opacity:0.45;" : ""), (u.name || "?")[0]); cell.textContent = ""; cell.appendChild(c); }
                if (human) cell.onclick = () => onCell(x, y);
                grid.appendChild(cell);
            }
            wrap.appendChild(grid);
            if (human && sel) { const hold = el("button", "width:100%; margin-top:6px; padding:5px; background:#1d4a63; color:#bdf0ff; border:1px solid #34465c; border-radius:5px; cursor:pointer;", S.moveTo ? "Confirm move (hold fire)" : "Hold position"); hold.onclick = () => commitHuman(null); wrap.appendChild(hold); }
            return wrap;
        }
        function onCell(x, y) {
            const g = S.game; if (g.winner || S.commanders[g.turnSide] || S.busy) return;
            const side = g.turnSide; const u = SG.unitAt(g, x, y);
            if (u && u.side === side && !u.activated) { S.sel = u.id; S.moveTo = null; drawHud(); return; }
            const sel = S.sel ? SG.unitById(g, S.sel) : null; if (!sel) return;
            const fromCell = S.moveTo || { x: sel.x, y: sel.y };
            if (u && u.side !== side) { const a = SG.actionsFrom(g, sel, fromCell.x, fromCell.y).find(z => z.targetUnitId === u.id); if (a) commitHuman(a); return; }
            const area = SG.actionsFrom(g, sel, fromCell.x, fromCell.y).find(z => z.cell && z.cell.x === x && z.cell.y === y); if (area) return commitHuman(area);
            if (SG.reachable(g, sel).some(c => c.x === x && c.y === y)) { S.moveTo = { x, y }; drawHud(); }
        }
        function commitHuman(action) {
            const uid = S.sel; if (!uid) return; const su = SG.unitById(S.game, uid); const moveTo = S.moveTo || { x: su.x, y: su.y };
            S.sel = null; S.moveTo = null; humanActivate({ unitId: uid, moveTo, action });
        }

        // ---- win screen ----
        function closeWin() { try { if (S.winPanel) S.winPanel.remove(); } catch {} S.winPanel = null; }
        function showWin() {
            if (S.winPanel) return; const g = S.game; if (!g.winner) return;
            const team = (S.modelSet !== "default" && TESTFIRE[g.winner]) ? TESTFIRE[g.winner].label : ("Side " + g.winner);
            const surv = SG.sideUnits(g, g.winner).length;
            const o = el("div", "position:fixed; inset:0; z-index:300; display:flex; align-items:center; justify-content:center; background:rgba(2,6,10,0.55);");
            const card = el("div", "background:rgba(10,16,24,0.97); border:1px solid #34465c; border-radius:14px; padding:26px 34px; text-align:center; box-shadow:0 12px 50px rgba(0,0,0,.6); font-family:ui-monospace,monospace;");
            card.appendChild(el("div", "font-size:12px; color:#9bb; letter-spacing:3px;", "VICTORY"));
            card.appendChild(el("div", "font-size:26px; font-weight:800; color:" + (g.winner === "A" ? "#8bd2ff" : "#ff9b9b") + "; margin:6px 0;", team + " wins"));
            card.appendChild(el("div", "font-size:12px; color:#bcd; margin-bottom:14px;", "Round " + g.round + " \u00b7 " + surv + " unit" + (surv === 1 ? "" : "s") + " standing"));
            const b = el("button", "padding:8px 22px; background:#1d4a63; color:#bdf0ff; border:1px solid #34465c; border-radius:7px; cursor:pointer; font-size:13px;", "Rematch"); b.onclick = () => { closeWin(); restart(); };
            card.appendChild(b); o.appendChild(card); S.winPanel = o; document.body.appendChild(o);
        }

        // ---- per-unit model override (load any library mesh for one unit) ----
        async function loadLibKind(assetId) {
            const kind = "unit_model_" + assetId; if (window.assetLoader?.cache?.get?.(kind)) return kind;
            const lib = await window.assetLibrary?.get?.(assetId); if (!lib || typeof lib.data !== "string") throw new Error("no data");
            const ext = (lib.meta && lib.meta.dataExt || "glb").toLowerCase(); const bin = atob(lib.data); const bytes = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
            if (ext === "glb" || ext === "gltf") await window.assetLoader._loadGLBFromBytes(kind, bytes.buffer, { normalize: { targetSize: 3.2, anchor: "floor" } });
            else throw new Error("only glb/gltf supported for per-unit override");
            return kind;
        }
        async function setUnitModel(unit, assetId) {
            if (!assetId) { delete S.unitModelOverride[unit.id]; spawnUnits(); return; }
            try { const kind = await loadLibKind(assetId); S.unitModelOverride[unit.id] = kind; spawnUnits(); } catch (e) { console.warn("[skirmish] per-unit model:", e && e.message); }
        }
        function setTarget(u) { const e = S.ents.get(u.id); if (!e) return; const w = gridToWorld(u.x, u.y); e.tx = w.x; e.tz = w.z; }
        function _pos(id) { try { const ecs = window.ecsWorld; return ecs && ecs.getComponent ? ecs.getComponent(id, "Position") : null; } catch { return null; } }
        function syncDead() { for (const u of S.game.units) if (u.hp <= 0) { const e = S.ents.get(u.id); if (e) { try { router.exec({ type: "entity:despawn", id: e.id }); } catch {} S.ents.delete(u.id); } } }

        function frame() {
            for (const [, e] of S.ents) {
                e.x += (e.tx - e.x) * 0.18; e.z += (e.tz - e.z) * 0.18;
                const p = _pos(e.id); if (p) { p.x = e.x; p.z = e.z; }
            }
            tickDice();
            S.raf = requestAnimationFrame(frame);
        }

        // ---- commanders per mode ----
        function buildCommanders() {
            const heur = SG.heuristicCommander();
            if (S.mode === "smarter") { const llm = SG.llmCommander({}); return { A: llm, B: llm }; }
            if (S.mode === "aivai") return { A: heur, B: heur };
            if (S.mode === "vsai") return { A: null, B: heur };          // A = human (HUD), B = AI
            if (S.mode === "hotseat") return { A: null, B: null };       // both human
            if (S.mode === "net") return { A: null, B: SG.remoteCommander({ url: "" }) }; // relay-driven; see netTick
            return { A: heur, B: heur };
        }

        async function aiStep() {
            if (S.over || S.busy) return;
            const side = S.game.turnSide; const cmd = S.commanders[side];
            if (!cmd) { drawHud(); return; }   // human side — wait for HUD
            S.busy = true;
            let plan = null; try { plan = await cmd(S.game, side); } catch {}
            if (plan) {
                const u = SG.unitById(S.game, plan.unitId);
                applyWithFX(plan);
                if (u) setTarget(u);
                setTimeout(() => { syncDead(); drawHud(); checkOver(); S.busy = false; if (!S.over) scheduleStep(); }, 650);
            } else { S.busy = false; SG.applyTurn(S.game, { unitId: (SG.activeUnits(S.game, side)[0] || {}).id }); drawHud(); scheduleStep(); }
        }
        function scheduleStep() {
            clearTimeout(S.timer);
            const side = S.game.turnSide;
            if (S.commanders[side]) S.timer = setTimeout(aiStep, 700);   // AI side auto-advances
        }
        function humanActivate(plan) {
            if (S.over || S.busy) return; const side = S.game.turnSide; if (S.commanders[side]) return;
            const u = SG.unitById(S.game, plan.unitId); applyWithFX(plan); if (u) setTarget(u);
            setTimeout(() => { syncDead(); drawHud(); checkOver(); if (!S.over) scheduleStep(); }, 300);
        }
        function checkOver() { if (S.game.winner && !S.over) { S.over = true; clearTimeout(S.timer); S.sel = null; S.moveTo = null; showWin(); } }

        // ---- HUD ----
        function el(tag, css, txt) { const e = document.createElement(tag); if (css) e.style.cssText = css; if (txt != null) e.textContent = txt; return e; }
        function buildHud() {
            const p = el("div", "position:fixed; right:14px; top:74px; width:250px; z-index:200; background:rgba(8,12,18,0.94); border:1px solid #243044; border-radius:10px; color:#cfe; font-family:ui-monospace,monospace; font-size:12px; padding:10px; box-shadow:0 8px 30px rgba(0,0,0,.5);");
            S.hud = p; document.body.appendChild(p); drawHud();
        }
        function modeBtn(row, label, m) { const b = el("button", "flex:1; padding:4px 2px; font-size:10px; background:" + (S.mode === m ? "#1d4a63" : "#16202c") + "; color:" + (S.mode === m ? "#bdf0ff" : "#9bb") + "; border:1px solid #34465c; border-radius:5px; cursor:pointer;", label); b.onclick = () => setMode(m); row.appendChild(b); }
        function drawHud() {
            const p = S.hud; if (!p) return; p.innerHTML = "";
            p.appendChild(el("div", "font-weight:700; color:#7fd7ff; margin-bottom:6px;", "\u25C9 Skirmish Prototype"));
            const m1 = el("div", "display:flex; gap:4px; margin-bottom:4px;"); modeBtn(m1, "AI v AI", "aivai"); modeBtn(m1, "Vs AI", "vsai"); modeBtn(m1, "Hot-seat", "hotseat"); p.appendChild(m1);
            const m2 = el("div", "display:flex; gap:4px; margin-bottom:8px;"); modeBtn(m2, "SweK v SweK", "net"); modeBtn(m2, "LLM v LLM", "smarter"); p.appendChild(m2);
            const mm = el("div", "display:flex; align-items:center; gap:6px; margin-bottom:8px;");
            mm.appendChild(el("span", "color:#9bb; font-size:10px;", "Models:"));
            const msel = el("select", "flex:1; min-width:0; background:#0a0e14; color:#cde; border:1px solid #34465c; border-radius:5px; padding:3px; font-size:10px;");
            for (const opt of ["default", ...S.mods.map(m => m.name)]) { const o = el("option", null, opt === "default" ? "Default (built-in)" : opt + " (mod)"); o.value = opt; if (S.modelSet === opt) o.selected = true; msel.appendChild(o); }
            msel.value = S.modelSet; msel.onchange = () => setModelSet(msel.value);
            mm.appendChild(msel); p.appendChild(mm);
            // field-size selector (combine more tile sections into a larger board, 8..32)
            const sz = el("div", "display:flex; align-items:center; gap:6px; margin-bottom:8px;");
            sz.appendChild(el("span", "color:#9bb; font-size:10px;", "Field:"));
            const zsel = el("select", "flex:1; min-width:0; background:#0a0e14; color:#cde; border:1px solid #34465c; border-radius:5px; padding:3px; font-size:10px;");
            for (const n of [8, 12, 16, 20, 24, 32]) { const o = el("option", null, n + "\u00D7" + n); o.value = n; if ((S.boardSize || 8) === n) o.selected = true; zsel.appendChild(o); }
            zsel.onchange = () => { S.boardSize = Math.max(8, Math.min(32, parseInt(zsel.value, 10) || 8)); restart(); };
            sz.appendChild(zsel); p.appendChild(sz);
            const g = S.game;
            if (g.winner) p.appendChild(el("div", "color:#9be19b; font-weight:700; margin-bottom:6px;", "Side " + g.winner + " wins! (round " + g.round + ")"));
            else p.appendChild(el("div", "color:#bcd; margin-bottom:6px;", "Round " + g.round + " \u00b7 side " + g.turnSide + " to act"));
            const dl = el("div", "display:flex; align-items:center; justify-content:space-between; margin-bottom:6px;");
            dl.appendChild(el("span", "color:#ffd479; font-size:11px;", S.lastRoll != null ? "\uD83C\uDFB2 Last roll: " + S.lastRoll : "\uD83C\uDFB2 dice"));
            const dt = el("button", "padding:2px 6px; font-size:10px; background:" + (S.diceOn ? "#1d4a63" : "#16202c") + "; color:" + (S.diceOn ? "#bdf0ff" : "#9bb") + "; border:1px solid #34465c; border-radius:5px; cursor:pointer;", S.diceOn ? "on" : "off"); dt.onclick = () => { S.diceOn = !S.diceOn; drawHud(); }; dl.appendChild(dt); p.appendChild(dl);
            for (const side of ["A", "B"]) {
                p.appendChild(el("div", "color:" + (side === "A" ? "#8bd2ff" : "#ff9b9b") + "; margin-top:4px; font-weight:600;", "Side " + side));
                for (const u of g.units.filter(x => x.side === side)) {
                    const dead = u.hp <= 0; const r = el("div", "display:flex; justify-content:space-between; opacity:" + (dead ? "0.4" : "1") + ";");
                    const nm = el("span", "cursor:pointer; text-decoration:underline dotted;", (u.activated && !dead ? "\u00b7 " : "") + u.name); nm.onclick = () => showCard(u);
                    r.appendChild(nm); r.appendChild(el("span", "color:#9bb;", dead ? "destroyed" : u.hp + "hp"));
                    p.appendChild(r);
                }
            }
            // human controls when it's a human side's turn
            p.appendChild(buildBoardWidget());
            const rs = el("button", "width:100%; margin-top:8px; padding:5px; background:#234; color:#cde; border:1px solid #456; border-radius:5px; cursor:pointer;", "\u21BB Restart"); rs.onclick = restart; p.appendChild(rs);
            if (S.mode === "net") p.appendChild(el("div", "color:#9aa; font-size:10px; margin-top:6px;", "SweK-vs-SweK uses the bridge relay; open this demo on a second engine in the same room."));
        }
        function buildHumanControls(side) {
            const g = S.game; const wrap = el("div", "margin-top:8px; border-top:1px solid #243044; padding-top:6px;");
            const units = SG.activeUnits(g, side); if (!units.length) return wrap;
            const uSel = el("select", "width:100%; margin-bottom:4px; background:#0a0e14; color:#cde; border:1px solid #456; border-radius:4px; padding:3px;");
            units.forEach(u => { const o = el("option", null, u.name + " (" + u.hp + "hp)"); o.value = u.id; uSel.appendChild(o); });
            const cSel = el("select", "width:100%; margin-bottom:4px; background:#0a0e14; color:#cde; border:1px solid #456; border-radius:4px; padding:3px;");
            const aSel = el("select", "width:100%; margin-bottom:4px; background:#0a0e14; color:#cde; border:1px solid #456; border-radius:4px; padding:3px;");
            uSel.value = units[0].id;
            const refill = () => {
                const u = SG.unitById(g, uSel.value) || units[0]; if (!u) return; uSel.value = u.id; showRange(u); cSel.innerHTML = ""; aSel.innerHTML = "";
                const cells = [{ x: u.x, y: u.y, cost: 0, label: "stay" }, ...SG.reachable(g, u).map(c => ({ ...c, label: "move " + c.x + "," + c.y }))];
                cells.forEach((c, i) => { const o = el("option", null, c.label); o.value = c.x + "," + c.y; if (i === 0) cSel.value = o.value; cSel.appendChild(o); });
                const refillActs = () => { aSel.innerHTML = ""; const [cx, cy] = (cSel.value || (u.x + "," + u.y)).split(",").map(Number);
                    const acts = [{ type: "end", label: "hold fire" }, ...SG.actionsFrom(g, u, cx, cy).map(a => ({ a, label: a.type + (a.targetUnitId ? " " + (SG.unitById(g, a.targetUnitId) || {}).name : a.cell ? " @" + a.cell.x + "," + a.cell.y : "") }))];
                    acts.forEach((x, i) => { const o = el("option", null, x.label); o.value = String(i); o._act = x.a || null; aSel.appendChild(o); }); aSel._acts = acts; aSel.value = "0"; };
                cSel.onchange = refillActs; refillActs();
            };
            uSel.onchange = refill; refill();
            const go = el("button", "width:100%; padding:5px; background:#1d4a63; color:#bdf0ff; border:1px solid #34465c; border-radius:5px; cursor:pointer;", "Activate");
            go.onclick = () => { const uid = uSel.value || units[0].id; const [x, y] = (cSel.value || (SG.unitById(g, uid).x + "," + SG.unitById(g, uid).y)).split(",").map(Number); const ai = +(aSel.value || "0"); const a = (aSel._acts && aSel._acts[ai]) ? aSel._acts[ai].a : null; humanActivate({ unitId: uid, moveTo: { x, y }, action: a }); };
            wrap.appendChild(el("div", "color:#9aa; font-size:10px; margin-bottom:3px;", "Your move (side " + side + "):")); wrap.appendChild(uSel); wrap.appendChild(cSel); wrap.appendChild(aSel); wrap.appendChild(go);
            return wrap;
        }

        // ---- SweK-vs-SweK relay tick (rig-only; needs a 2nd engine in the room) ----
        async function netTick() {
            if (S.mode !== "net" || S.over) return;
            try {
                const r = await fetch("/skirmish/state?room=" + encodeURIComponent(S.room)).then(x => x.json());
                if (r && r.state && r.seq > S.net.seq) { S.net.seq = r.seq; importState(r.state); }
            } catch {}
            S.timer = setTimeout(netTick, 900);
        }
        function importState(snap) { /* apply a peer snapshot: positions + hp + turn */
            try { for (const su of snap.units) { const u = SG.unitById(S.game, su.id); if (u) { u.x = su.x; u.y = su.y; u.hp = su.hp; u.activated = su.activated; setTarget(u); } }
                S.game.turnSide = snap.turnSide; S.game.round = snap.round; S.game.winner = snap.winner; syncDead(); drawHud(); checkOver(); } catch {}
        }

        function setMode(m) { S.mode = m; restart(); }
        function restart() {
            clearTimeout(S.timer); S.over = false; S.busy = false; clearRange(); closeWin(); S.sel = null; S.moveTo = null;
            registerKinds(); S.game = SG.newGame(Object.assign({ size: S.boardSize || 8 }, (S.modelSet !== "default" && S.roster) ? { roster: S.roster } : {})); _boardN = S.game.size; S.commanders = buildCommanders();
            spawnUnits(); buildBoard(); drawHud();
            if (S.mode === "net") { fetch("/skirmish/reset", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ room: S.room }) }).catch(() => {}); netTick(); }
            else scheduleStep();
        }

        // boot
        registerKinds(); S.game = SG.newGame(Object.assign({ size: S.boardSize || 8 }, (S.modelSet !== "default" && S.roster) ? { roster: S.roster } : {})); _boardN = S.game.size; S.commanders = buildCommanders();
        spawnUnits(); buildBoard(); buildHud(); S.raf = requestAnimationFrame(frame); scheduleStep();
        fetchMods().then(() => drawHud());   // populate the Models pulldown (async, from the bridge)

        window.skirmish = {
            mode: (m) => { if (m) setMode(m); return S.mode; },
            restart, status: () => ({ mode: S.mode, modelSet: S.modelSet, winner: S.game.winner, round: S.game.round, turn: S.game.turnSide }),
            models: (set) => { if (set != null) setModelSet(set); return { set: S.modelSet, available: ["default", ...S.mods.map(m => m.name)] }; },
            refreshMods: () => fetchMods().then(() => { drawHud(); return S.mods.map(m => m.name); }),
            game: () => S.game,
            size: (n) => { if (n != null) { S.boardSize = Math.max(8, Math.min(32, n | 0)); restart(); } return S.boardSize; },
        };
        console.log("[skirmish] window.skirmish.mode(...) / .models(...) / .size(8..32 \u2014 larger field) / .restart()");
    },

    stop() {
        const S = this._S; if (!S) return;
        try { clearTimeout(S.timer); cancelAnimationFrame(S.raf); } catch {}
        for (const [, e] of S.ents) try { window.router.exec({ type: "entity:despawn", id: e.id }); } catch {}
        S.ents.clear();
        for (const id of [...S.board, ...S.range, ...S.dice.map(d => d.id)]) try { window.router.exec({ type: "entity:despawn", id }); } catch {}
        S.board = []; S.range = []; S.dice = [];
        try { if (S.cardPanel) S.cardPanel.remove(); } catch {}
        try { if (S.winPanel) S.winPanel.remove(); } catch {}
        try { if (S.hud) S.hud.remove(); } catch {}
        try { window._stage && window._stage.exit && window._stage.exit(); } catch {}
    },
};
