// demos_code/dejarik.js — v1474 (chess r5 variant: Star Wars Dejarik / holochess)
// v1989 — COOLIFIED: this is a HOLOGRAM game, so it now looks like one.
//   · 8 distinct voxel monster sculpts (Savrip hulks, K'lor'slug slithers, Houjix
//     is small and dog-like...) instead of stat-sized boxes
//   · holo-shimmer: cyan tint + per-frame brightness flicker with occasional
//     signal dropouts (entity:setColorMul), and a slow idle bob
//   · animated turns: monsters SLIDE between cells (facing their travel), attacks
//     LUNGE, wounded monsters flash red, and the dead dissolve like a cut feed —
//     the board is no longer torn down + respawned every action
//   · playable from the 3D board: selection/move/attack glow tiles mirror the 2D panel
//   · a holo-projector pedestal sits under the table's center
// Game rules unchanged (simulation/DejarikGame.js). 2D radial panel remains the input.
import * as D from "../simulation/DejarikGame.js";
import { buildVoxelMesh } from "../gpu/voxelCreature.js";

const RO = 15, RM = 9, FLOOR_Y = 1;
const A_CI = 1, B_CI = 6, TILE_L = 0, TILE_D = 2, TILE_C = 7;   // v1989 — A is RED now (legend always said so; it spawned green)
const ABBR = { savrip: "Sv", molator: "Mo", ngok: "Ng", monnok: "Mn", houjix: "Ho", kintan: "Ki", ghhhk: "Gh", klorslug: "Kl" };
const HOLO_TINT = [0.35, 0.85, 1.0];

function cellWorld(c) {
    if (c === 24) return { x: 0, y: FLOOR_Y, z: 0 };
    const ring = c < 12 ? 0 : 1, idx = c < 12 ? c : c - 12, r = ring === 0 ? RO : RM, ang = idx / 12 * Math.PI * 2;
    return { x: Math.cos(ang) * r, y: FLOOR_Y, z: Math.sin(ang) * r };
}

// ---- v1989 monster sculpts ------------------------------------------------
// Each returns [x,y,z,ci] voxels. Body in the side color, accents grey/white/yellow.
// Kept ≤4 wide so middle-ring neighbours don't intersect.
function creatureVoxels(type, ci) {
    const v = [], P = (x, y, z, c = ci) => v.push([x, y, z, c]);
    const box = (x0, y0, z0, x1, y1, z1, c = ci) => { for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) P(x, y, z, c); };
    const GREY = 0, WHITE = 7, YEL = 3;
    if (type === "savrip") {            // Mantellian Savrip — tall hunched bruiser, long arms
        box(1, 0, 1, 2, 5, 2);                       // torso column
        box(0, 3, 1, 0, 5, 2); box(3, 3, 1, 3, 5, 2); // shoulders
        box(0, 0, 1, 0, 2, 1); box(3, 0, 1, 3, 2, 1); // dangling arms
        box(1, 6, 1, 2, 7, 2);                       // head
        P(0, 7, 1, GREY); P(3, 7, 2, GREY);           // brow horns
        P(1, 6, 0, WHITE); P(2, 6, 0, WHITE);         // eyes
    } else if (type === "molator") {    // Molator — horned charger
        box(0, 0, 1, 3, 2, 2);                       // low wide body
        box(3, 2, 1, 3, 4, 2);                       // raised head end
        P(3, 5, 1, GREY); P(3, 5, 2, GREY); P(2, 4, 1, GREY);  // horns
        P(3, 3, 0, WHITE);                            // eye
        P(0, 0, 0); P(0, 0, 3);                       // haunches
    } else if (type === "ngok") {       // Ng'ok — armored slab, all defense
        box(0, 0, 0, 3, 2, 3);                       // bulk
        box(0, 3, 0, 3, 3, 3, GREY);                  // armored back plate
        P(0, 2, 1, WHITE); P(0, 2, 2, WHITE);         // eyes low on the front
    } else if (type === "monnok") {     // Monnok — lean, upright, quick
        box(1, 0, 1, 2, 6, 1);                       // slim body
        box(0, 4, 1, 3, 4, 1);                       // arms out
        P(1, 7, 1); P(2, 7, 1);                       // head
        P(1, 7, 0, WHITE);                            // eye
        P(0, 0, 1); P(3, 0, 1);                       // wide stance feet
    } else if (type === "houjix") {     // Houjix — small loyal quadruped
        box(0, 0, 1, 2, 1, 2);                       // little body
        P(3, 2, 1); P(3, 2, 2);                       // perky head
        P(0, 2, 1, GREY);                             // tail tip
        P(3, 2, 0, WHITE);                            // eye
    } else if (type === "kintan") {     // Kintan strider — long neck, tall
        box(0, 0, 1, 2, 1, 2);                       // body
        box(2, 2, 1, 2, 5, 1);                       // neck
        P(2, 6, 1); P(3, 6, 1);                       // head forward
        P(3, 6, 0, WHITE);                            // eye
        P(0, 0, 0); P(0, 0, 3);                       // legs splayed
    } else if (type === "ghhhk") {      // Ghhhk — squat wide croucher
        box(0, 0, 0, 3, 1, 3);                       // splat body
        box(1, 2, 1, 2, 3, 2);                       // raised head hump
        P(1, 3, 0, WHITE); P(2, 3, 0, WHITE);         // eyes
        P(0, 1, 0, GREY); P(3, 1, 3, GREY);           // claws
    } else if (type === "klorslug") {   // K'lor'slug — segmented serpent
        box(0, 0, 1, 0, 1, 2); box(1, 0, 1, 1, 0, 2); box(2, 0, 1, 2, 1, 2); box(3, 0, 1, 3, 0, 2);   // undulating segments
        box(3, 1, 1, 3, 3, 2);                       // reared head end
        P(3, 4, 1, YEL); P(3, 4, 2, YEL);             // venom crest
        P(3, 3, 0, WHITE); P(3, 2, 0, WHITE);         // eye cluster
    } else { box(0, 0, 0, 2, 2, 2); }
    return v;
}

export default {
    id: "dejarik",
    label: "DEJARIK \u2014 holochess monster battle vs the engine AI",
    hint: "chess r5 variant: Star Wars holochess on the circular board",
    start() {
        const router = window.router, al = window.assetLoader, stage = window._stage;
        if (!router || !al || !al.gl || !al._createMesh) { console.warn("[dejarik] renderer not ready"); return; }
        if (stage) try { stage.enter({ floor: true }); } catch {}
        const S = this._S = {
            tileIds: [], glowIds: [], game: D.newGame(), sel: null, moveT: new Set(), atkT: new Set(),
            overlay: null, ents: new Map() /* cell -> {id,type,side,hp,x,y,z,yaw,ph} */,
            tweens: [], raf: 0, busyAnim: false,
        };

        const reg = (name, vox) => { if (al.cache.get(name)) return; try { const g = buildVoxelMesh(vox); const m = al._createMesh(g.positions.buffer, g.indices.buffer, g.normals.buffer, g.colors.buffer, { name, vertexCount: g.vertexCount, indexCount: g.indices.length, hasNormals: true, hasColors: true }); if (m) al.cache.set(name, m); } catch (e) { console.warn("[dejarik] kind", name, e && e.message); } };
        for (const t of Object.keys(D.TYPES)) { reg("dej_" + t + "_a", creatureVoxels(t, A_CI)); reg("dej_" + t + "_b", creatureVoxels(t, B_CI)); }
        const slab = (ci, n = 3) => { const v = []; for (let x = 0; x < n; x++) for (let z = 0; z < n; z++) v.push([x, 0, z, ci]); return v; };
        reg("dej_tile_l", slab(TILE_L)); reg("dej_tile_d", slab(TILE_D)); reg("dej_tile_c", slab(TILE_C));
        reg("dej_glow_g", slab(4)); reg("dej_glow_r", slab(1)); reg("dej_glow_y", slab(3));   // v1989 — 3D target indicators
        reg("dej_ped", slab(0, 2));                                                            // pedestal segment

        for (let c = 0; c < 25; c++) {
            const w = cellWorld(c); const idx = c < 12 ? c : c - 12;
            const kind = c === 24 ? "dej_tile_c" : (((c < 12 ? 0 : 1) + idx) % 2 ? "dej_tile_l" : "dej_tile_d");
            try { const r = router.exec({ type: "entity:spawnMesh", assetId: kind, kind, x: w.x, y: FLOOR_Y - 1.1, z: w.z, scaleX: 1, scaleY: 1, scaleZ: 1, yaw: 0 }); if (r && r.id != null) S.tileIds.push(r.id); } catch {}
        }
        // v1989 — holo-projector pedestal under the table center
        for (let i = 0; i < 4; i++) {
            try { const r = router.exec({ type: "entity:spawnMesh", assetId: "dej_ped", kind: "dej_ped", x: 0, y: FLOOR_Y - 2.4 - i * 0.9, z: 0, scaleX: 2.2 - i * 0.35, scaleY: 1, scaleZ: 2.2 - i * 0.35, yaw: i * 0.4 }); if (r && r.id != null) S.tileIds.push(r.id); } catch {}
        }

        // ---- entity helpers -------------------------------------------------
        const spawnCre = (c, p) => {
            const w = cellWorld(c), kind = "dej_" + p.type + "_" + p.side, yaw = Math.atan2(-w.z, -w.x);
            try {
                const r = router.exec({ type: "entity:spawnMesh", assetId: kind, kind, x: w.x, y: FLOOR_Y, z: w.z, scaleX: 1, scaleY: 1, scaleZ: 1, yaw });
                if (r && r.id != null) {
                    const e = { id: r.id, type: p.type, side: p.side, hp: p.hp, x: w.x, y: FLOOR_Y, z: w.z, yaw, ph: Math.random() * 7 };
                    S.ents.set(c, e);
                    try { router.exec({ type: "entity:tint", id: r.id, color: HOLO_TINT, mix: 0.26 }); } catch {}   // holographic cast
                }
            } catch {}
        };
        const clearAll = () => { for (const [, e] of S.ents) try { router.exec({ type: "entity:despawn", id: e.id }); } catch {} S.ents.clear(); };
        const respawn = () => { clearAll(); for (let c = 0; c < 25; c++) { const p = S.game.board[c]; if (p) spawnCre(c, p); } };

        // ---- tween/anim core -------------------------------------------------
        const tween = (dur, step, done) => S.tweens.push({ t: 0, dur, step, done });
        const ease = (u) => u * u * (3 - 2 * u);
        const slide = (e, from, to, hop, done) => {
            const yaw0 = e.yaw, yawT = Math.atan2(to.z - from.z, to.x - from.x) + Math.PI;   // sculpts face -x
            e.anim = true;
            tween(0.55, (u) => {
                const s = ease(u);
                e.x = from.x + (to.x - from.x) * s; e.z = from.z + (to.z - from.z) * s;
                e.y = FLOOR_Y + Math.sin(u * Math.PI) * hop;
                e.yaw = yaw0 + (yawT - yaw0) * Math.min(1, u * 3);
                move(e);
            }, () => { e.x = to.x; e.z = to.z; e.y = FLOOR_Y; e.yaw = Math.atan2(-to.z, -to.x); e.anim = false; move(e); done && done(); });
        };
        const lunge = (e, at, done) => {
            const fx = e.x, fz = e.z; e.anim = true;
            const yaw0 = e.yaw; e.yaw = Math.atan2(at.z - fz, at.x - fx) + Math.PI;
            tween(0.45, (u) => {
                const s = Math.sin(u * Math.PI) * 0.42;
                e.x = fx + (at.x - fx) * s; e.z = fz + (at.z - fz) * s; move(e);
            }, () => { e.x = fx; e.z = fz; e.yaw = yaw0; e.anim = false; move(e); done && done(); });
        };
        const flashHit = (e) => { try { router.exec({ type: "entity:tint", id: e.id, color: [1, 0.15, 0.1], mix: 0.75 }); } catch {}
            tween(0.35, () => {}, () => { try { router.exec({ type: "entity:tint", id: e.id, color: HOLO_TINT, mix: 0.26 }); } catch {} }); };
        const dissolve = (e, done) => {   // v1989 — death = the holo feed cutting out
            e.anim = true;
            tween(0.6, (u) => {
                try { router.exec({ type: "entity:setColorMul", id: e.id, mul: Math.max(0.05, 1 - u * 1.3 + (Math.random() < 0.3 ? 0.5 : 0)) }); } catch {}
                try { router.exec({ type: "entity:rescale", id: e.id, scaleX: 1 - u * 0.6, scaleY: Math.max(0.06, 1 - u), scaleZ: 1 - u * 0.6 }); } catch {}
            }, () => { try { router.exec({ type: "entity:despawn", id: e.id }); } catch {} done && done(); });
        };
        const move = (e) => { try { router.exec({ type: "entity:move", id: e.id, x: e.x, y: e.y, z: e.z, yaw: e.yaw }); } catch {} };

        // Diff the 3D entities against the new game board and animate the change.
        const animateToBoard = (after) => {
            const b = S.game.board;
            const gone = [], appeared = [];
            for (const [c, e] of S.ents) { const p = b[c]; if (!p || p.type !== e.type || p.side !== e.side) gone.push([c, e]); else if (p.hp < e.hp) { flashHit(e); e.hp = p.hp; } }
            for (let c = 0; c < 25; c++) { const p = b[c]; if (p && !S.ents.has(c)) appeared.push([c, p]); else if (p && S.ents.has(c)) { const e = S.ents.get(c); if (e.type !== p.type || e.side !== p.side) appeared.push([c, p]); } }
            // pair a disappearance with an appearance of the same monster = a move
            let pending = 0; const finish = () => { if (--pending <= 0 && after) after(); };
            for (const [c2, p] of appeared) {
                const gi = gone.findIndex(([, e]) => e.type === p.type && e.side === p.side);
                if (gi >= 0) {
                    const [c1, e] = gone.splice(gi, 1)[0];
                    S.ents.delete(c1); S.ents.set(c2, e); e.hp = p.hp;
                    pending++; slide(e, cellWorld(c1), cellWorld(c2), 1.4, finish);
                } else { spawnCre(c2, p); }
            }
            for (const [c1, e] of gone) { if (S.ents.get(c1) === e) S.ents.delete(c1); pending++; dissolve(e, finish); }   // identity-guarded: a mover may have overwritten this cell
            if (!pending && after) after();
        };

        // ---- glow tiles (3D legal-target indicators) -------------------------
        const clearGlow = () => { for (const id of S.glowIds) try { router.exec({ type: "entity:despawn", id }); } catch {} S.glowIds = []; };
        const showGlow = () => {
            clearGlow(); if (S.sel == null) return;
            const put = (c, kind) => { const w = cellWorld(c); try { const r = router.exec({ type: "entity:spawnMesh", assetId: kind, kind, x: w.x, y: FLOOR_Y - 0.72, z: w.z, scaleX: 0.8, scaleY: 0.22, scaleZ: 0.8, yaw: 0 }); if (r && r.id != null) S.glowIds.push(r.id); } catch {} };
            put(S.sel, "dej_glow_y");
            for (const c of S.moveT) put(c, "dej_glow_g");
            for (const c of S.atkT) put(c, "dej_glow_r");
        };

        // ---- per-frame holo shimmer ------------------------------------------
        let lastT = performance.now();
        const tick = () => {
            S.raf = requestAnimationFrame(tick);
            const now = performance.now(), dt = Math.min(0.05, (now - lastT) / 1000); lastT = now;
            const t = now / 1000;
            for (let i = S.tweens.length - 1; i >= 0; i--) { const tw = S.tweens[i]; tw.t += dt; const u = Math.min(1, tw.t / tw.dur); tw.step(u); if (u >= 1) { S.tweens.splice(i, 1); tw.done && tw.done(); } }
            for (const [, e] of S.ents) {
                // brightness flicker + rare dropout = holographic shimmer
                const drop = Math.random() < 0.012 ? 0.4 : 0;
                try { router.exec({ type: "entity:setColorMul", id: e.id, mul: 0.92 + Math.sin(t * 11 + e.ph * 3) * 0.1 - drop }); } catch {}
                if (!e.anim) { e.y = FLOOR_Y + Math.sin(t * 1.7 + e.ph) * 0.14; move(e); }   // idle bob
            }
            const pulse = 0.75 + Math.sin(t * 5) * 0.35;
            for (const id of S.glowIds) try { router.exec({ type: "entity:setColorMul", id, mul: pulse }); } catch {}
        };
        tick();

        // ---- radial 2D control panel (unchanged input path) ------------------
        const ov = document.createElement("div");
        ov.style.cssText = "position:fixed;left:14px;bottom:14px;z-index:300;background:rgba(8,12,18,0.95);border:1px solid #2a3645;border-radius:10px;padding:10px;font:12px system-ui,sans-serif;color:#dde6f2;width:262px;";
        const status = document.createElement("div"); status.style.cssText = "margin-bottom:6px;min-height:16px;";
        const ring = document.createElement("div"); ring.style.cssText = "position:relative;width:240px;height:240px;margin:0 auto;border-radius:50%;background:radial-gradient(circle,#16202c 0%,#0c1420 70%);";
        const bar = document.createElement("div"); bar.style.cssText = "margin-top:8px;display:flex;gap:6px;align-items:center;justify-content:center;";
        const newBtn = document.createElement("button"); newBtn.textContent = "New"; newBtn.style.cssText = "padding:5px 12px;border-radius:5px;cursor:pointer;font-size:11px;background:#2a4d3a;color:#cfe;border:1px solid #4a7d5a;";
        newBtn.onclick = () => { S.game = D.newGame(); S.sel = null; S.moveT.clear(); S.atkT.clear(); S.busyAnim = false; clearGlow(); respawn(); render(); };
        const legend = document.createElement("div"); legend.style.cssText = "margin-top:6px;font-size:10px;color:#9fb0c4;text-align:center;";
        legend.textContent = "You = red (A) \u00b7 AI = blue (B) \u00b7 move full rating or attack an adjacent enemy";
        bar.append(newBtn);

        const cellPx = (c) => { if (c === 24) return { x: 120, y: 120 }; const ringN = c < 12 ? 0 : 1, idx = c < 12 ? c : c - 12, r = ringN === 0 ? 104 : 62, ang = idx / 12 * Math.PI * 2; return { x: 120 + Math.cos(ang) * r, y: 120 + Math.sin(ang) * r }; };
        const cells = [];
        for (let c = 0; c < 25; c++) {
            const b = document.createElement("button"); const px = cellPx(c);
            b.style.cssText = "position:absolute;width:" + (c === 24 ? 30 : 26) + "px;height:" + (c === 24 ? 30 : 26) + "px;border-radius:50%;left:" + (px.x - (c === 24 ? 15 : 13)) + "px;top:" + (px.y - (c === 24 ? 15 : 13)) + "px;cursor:pointer;font-size:9px;line-height:1;padding:0;border:1px solid #2a3340;color:#fff;";
            b.onclick = () => click(c);
            ring.appendChild(b); cells.push(b);
        }
        ov.append(status, ring, bar, legend); document.body.appendChild(ov); S.overlay = ov;

        const aiTurn = () => {
            if (S.game.winner || S.game.turn !== "b") return;
            S._ai = setTimeout(() => {
                D.applyAi(S.game, "b");
                animateToBoard(() => { render(); if (!S.game.winner && S.game.turn === "b") aiTurn(); });
                render();
            }, 340);
        };
        function click(c) {
            if (S.busyAnim || S.game.winner || S.game.turn !== "a") return;
            const p = S.game.board[c];
            const act = (fn) => {
                fn(); S.sel = null; S.moveT.clear(); S.atkT.clear(); clearGlow();
                S.busyAnim = true;
                animateToBoard(() => { S.busyAnim = false; render(); aiTurn(); });
                render();
            };
            if (S.sel != null && S.atkT.has(c)) { const atk = S.ents.get(S.sel), tgt = cellWorld(c); if (atk) lunge(atk, tgt); return act(() => D.doAttack(S.game, S.sel, c)); }
            if (S.sel != null && S.moveT.has(c)) { return act(() => D.doMove(S.game, S.sel, c)); }
            if (p && p.side === "a") { S.sel = c; S.moveT = new Set(D.legalMoves(S.game, c)); S.atkT = new Set(D.attackTargets(S.game, c)); showGlow(); render(); return; }
            S.sel = null; S.moveT.clear(); S.atkT.clear(); clearGlow(); render();
        }
        function render() {
            for (let c = 0; c < 25; c++) {
                const b = cells[c], p = S.game.board[c];
                let bg = c === 24 ? "#243042" : (((c < 12 ? 0 : 1) + (c < 12 ? c : c - 12)) % 2 ? "#3a4658" : "#222c3a");
                if (c === S.sel) bg = "#c8b45a"; else if (S.atkT.has(c)) bg = "#b5503f"; else if (S.moveT.has(c)) bg = "#4a8d5a";
                b.style.background = bg;
                if (p) { b.textContent = ABBR[p.type] + (p.hp); b.style.color = p.side === "a" ? "#ffd9d0" : "#cfe0ff"; b.style.fontWeight = "700"; }
                else { b.textContent = ""; }
            }
            const ca = []; const cb = []; for (const x of S.game.board) { if (x && x.side === "a") ca.push(x); if (x && x.side === "b") cb.push(x); }
            status.textContent = S.game.winner ? (S.game.winner === "a" ? "You win! \u2014 all enemy monsters destroyed" : "AI wins \u2014 your monsters are gone")
                : (S.game.turn === "a" ? "Your move" : "AI thinking\u2026") + "  (you " + ca.length + " vs AI " + cb.length + ")";
        }
        respawn(); render();
    },
    stop() {
        const S = this._S; if (!S) return;
        if (S._ai) { clearTimeout(S._ai); S._ai = null; }
        if (S.raf) cancelAnimationFrame(S.raf);
        const router = window.router;
        for (const [, e] of (S.ents || new Map())) try { router && router.exec({ type: "entity:despawn", id: e.id }); } catch {}
        for (const id of (S.glowIds || []).concat(S.tileIds || [])) try { router && router.exec({ type: "entity:despawn", id }); } catch {}
        if (S.overlay) { try { S.overlay.remove(); } catch {} }
        this._S = null;
    },
};
