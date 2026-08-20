// demos_code/tridchess.js — v1476 (chess r5c: Star Trek tri-dimensional chess)
// v1989 — COOLIFIED into something that looks like the Enterprise rec-room set:
//   · recognizable voxel piece sculpts (pawn ball, rook crenellations, knight's
//     arched neck, bishop mitre, queen's crown, king's cross) instead of stat towers
//   · the iconic PEDESTAL: a central pylon under the neutral board, arms out to the
//     main boards, and corner posts under the four attack boards
//   · black side is actually DARK (navy via colorMul on the blue palette entry —
//     the 8-color palette has no black), white is bright with gold crown accents
//   · animated moves: pieces glide, and level changes get a real vertical lift arc;
//     captures flash red and sink through their board; landing has a soft settle
//   · 3D legal-target glow tiles mirror the 2D panel (selected = gold, targets = green)
// Ruleset unchanged (simulation/TriDChess.js). The 2D seven-board panel remains the input.
import * as T from "../simulation/TriDChess.js";
import { buildVoxelMesh } from "../gpu/voxelCreature.js";

const CELL = 3, FLOOR_Y = 1, LSTEP = 1.7, W_CI = 7, B_CI = 6, TILE_L = 0, TILE_D = 2;
const ORDER = [["B", 4, 4], ["BQL", 2, 2], ["BKL", 2, 2], ["N", 4, 4], ["W", 4, 4], ["WQL", 2, 2], ["WKL", 2, 2]];
const LABEL = { W: "W (white main)", N: "N (neutral)", B: "B (black main)", WQL: "W Queen attack", WKL: "W King attack", BQL: "B Queen attack", BKL: "B King attack" };

// ---- v1989 piece sculpts ---------------------------------------------------
// 2-wide bases (cells are 3 apart — 3-wide bodies would touch neighbours), height
// carries the silhouette. Accents: grey collars, gold (yellow) royalty trim.
function pieceVoxels(type, ci) {
    const v = [], P = (x, y, z, c = ci) => v.push([x, y, z, c]);
    const box = (y0, y1, c = ci) => { for (let y = y0; y <= y1; y++) for (let x = 0; x < 2; x++) for (let z = 0; z < 2; z++) P(x, y, z, c); };
    const GREY = 0, GOLD = 3;
    if (type === "P") {                       // pawn — base, waist, head knob
        box(0, 0, GREY); box(1, 1); P(0, 2, 0); P(1, 2, 1); P(0, 3, 0); P(1, 3, 0); P(0, 3, 1); P(1, 3, 1);
    } else if (type === "R") {                // rook — straight tower + crenellations
        box(0, 0, GREY); box(1, 4);
        P(0, 5, 0); P(1, 5, 1);               // alternating battlements
        P(0, 5, 1, GREY); P(1, 5, 0, GREY);
    } else if (type === "N") {                // knight — arched neck leaning forward, muzzle
        box(0, 0, GREY); box(1, 2);
        P(0, 3, 0); P(0, 3, 1);               // neck leans to -x
        P(0, 4, 0); P(0, 4, 1);
        P(1, 4, 0, GREY);                     // mane notch
        v.push([-1, 4, 0, ci], [-1, 4, 1, ci]);   // muzzle juts out
    } else if (type === "B") {                // bishop — tapered, mitre slit
        box(0, 0, GREY); box(1, 3); P(0, 4, 0); P(1, 4, 1); P(0, 5, 0, GREY); P(1, 5, 1);
        P(0, 6, 0);                            // mitre tip
    } else if (type === "Q") {                // queen — tall taper + crown points
        box(0, 0, GREY); box(1, 5); P(0, 6, 0); P(1, 6, 1);
        P(0, 7, 0, GOLD); P(1, 7, 0, GOLD); P(0, 7, 1, GOLD); P(1, 7, 1, GOLD);   // gold crown ring
        P(0, 8, 0, GOLD);
    } else if (type === "K") {                // king — tallest, cross finial
        box(0, 0, GREY); box(1, 6); P(0, 7, 0, GOLD); P(1, 7, 1, GOLD);
        P(0, 8, 0); P(0, 9, 0);               // cross upright
        v.push([-1, 8, 0, ci], [1, 8, 0, ci]);   // cross arms
    } else box(0, 2);
    return v;
}
const world = (s) => ({ x: (s.f - 2.5) * CELL, y: FLOOR_Y + s.lvl * LSTEP, z: (s.r - 4.5) * CELL });

export default {
    id: "tridchess",
    label: "TRI-D CHESS \u2014 Star Trek 3-level chess vs the engine AI",
    hint: "chess r5c: tri-dimensional chess on 3 main + 4 attack boards",
    start() {
        const router = window.router, al = window.assetLoader, stage = window._stage;
        if (!router || !al || !al.gl || !al._createMesh) { console.warn("[trid] renderer not ready"); return; }
        if (stage) try { stage.enter({ floor: true }); } catch {}
        const S = this._S = {
            tileIds: [], glowIds: [], game: T.newGame(), sel: null, targets: new Set(), overlay: null, busy: false,
            ents: new Map() /* sqId -> {id,t,o,x,y,z,yaw} */, tweens: [], raf: 0,
        };

        const reg = (name, vox) => { if (al.cache.get(name)) return; try { const g = buildVoxelMesh(vox); const m = al._createMesh(g.positions.buffer, g.indices.buffer, g.normals.buffer, g.colors.buffer, { name, vertexCount: g.vertexCount, indexCount: g.indices.length, hasNormals: true, hasColors: true }); if (m) al.cache.set(name, m); } catch (e) { console.warn("[trid] kind", name, e && e.message); } };
        for (const t of ["P", "N", "B", "R", "Q", "K"]) { reg("trd_" + t + "_w", pieceVoxels(t, W_CI)); reg("trd_" + t + "_b", pieceVoxels(t, B_CI)); }
        const slab = (ci, n = 2) => { const v = []; for (let x = 0; x < n; x++) for (let z = 0; z < n; z++) v.push([x, 0, z, ci]); return v; };
        reg("trd_tile_l", slab(TILE_L)); reg("trd_tile_d", slab(TILE_D));
        reg("trd_glow_g", slab(4)); reg("trd_glow_y", slab(3));
        reg("trd_post", (() => { const v = []; for (let y = 0; y < 3; y++) v.push([0, y, 0, 0]); return v; })());

        for (const id of T.allSquares()) {
            const s = T.squareInfo(id), w = world(s), kind = (s.f + s.r) % 2 ? "trd_tile_l" : "trd_tile_d";
            try { const x = router.exec({ type: "entity:spawnMesh", assetId: kind, kind, x: w.x, y: w.y - 1.1, z: w.z, scaleX: 1, scaleY: 1, scaleZ: 1, yaw: 0 }); if (x && x.id != null) S.tileIds.push(x.id); } catch {}
        }
        // v1989 — the pedestal: central pylon + arms to the three main boards + attack-board posts.
        const strut = (x, y, z, sx = 0.8, sy = 1, sz = 0.8) => { try { const r = router.exec({ type: "entity:spawnMesh", assetId: "trd_post", kind: "trd_post", x, y, z, scaleX: sx, scaleY: sy, scaleZ: sz, yaw: 0 }); if (r && r.id != null) S.tileIds.push(r.id); } catch {} };
        {
            // main boards sit at lvl 0/2/4 (W low near, N mid center, B high far) — read actual extents
            const mains = ["W", "N", "B"].map(b => { const sqs = T.allSquares().map(T.squareInfo).filter(s => s.board === b); const lvl = sqs[0].lvl, zs = sqs.map(s => s.r), z = (Math.min(...zs) + Math.max(...zs)) / 2; return { b, y: FLOOR_Y + lvl * LSTEP, z: (z - 4.5) * CELL }; });
            const base = FLOOR_Y - 2.2;
            for (let i = 0; i < 5; i++) strut(0, base - i * 2.4, mains[1].z, 1.6 - i * 0.15, 1, 1.6 - i * 0.15);      // central pylon under neutral, tapering down
            for (const m of mains) { // arm: column from pylon depth up to just under each main board center
                const steps = Math.max(2, Math.round((m.y - base) / 2.2));
                for (let i = 0; i < steps; i++) { const u = i / steps; strut(0, base + (m.y - 1.4 - base) * u, mains[1].z + (m.z - mains[1].z) * u, 0.7, 1, 0.7); }
            }
            // small posts under each attack board's inner corner
            for (const b of ["WQL", "WKL", "BQL", "BKL"]) {
                const sqs = T.allSquares().map(T.squareInfo).filter(s => s.board === b);
                const cx = sqs.reduce((a, s) => a + s.f, 0) / sqs.length, cz = sqs.reduce((a, s) => a + s.r, 0) / sqs.length;
                const y = FLOOR_Y + sqs[0].lvl * LSTEP;
                strut((cx - 2.5) * CELL, y - 1.9, (cz - 4.5) * CELL, 0.5, 0.6, 0.5);
            }
        }

        // ---- entities + animation core ---------------------------------------
        const spawnPiece = (sqId, p) => {
            const s = T.squareInfo(sqId), w = world(s), kind = "trd_" + p.t + "_" + p.o, yaw = p.o === "w" ? 0 : Math.PI;
            try {
                const r = router.exec({ type: "entity:spawnMesh", assetId: kind, kind, x: w.x, y: w.y, z: w.z, scaleX: 1, scaleY: 1, scaleZ: 1, yaw });
                if (r && r.id != null) {
                    S.ents.set(sqId, { id: r.id, t: p.t, o: p.o, x: w.x, y: w.y, z: w.z, yaw });
                    // v1989 — black is DARK navy (palette has no black): dim the blue entry; white gleams
                    try { router.exec({ type: "entity:setColorMul", id: r.id, mul: p.o === "w" ? 1.08 : 0.45 }); } catch {}
                }
            } catch {}
        };
        const clearAll = () => { for (const [, e] of S.ents) try { router.exec({ type: "entity:despawn", id: e.id }); } catch {} S.ents.clear(); };
        const respawn = () => { clearAll(); for (const sqId in S.game.pieces) spawnPiece(sqId, S.game.pieces[sqId]); };

        const tween = (dur, step, done) => S.tweens.push({ t: 0, dur, step, done });
        const ease = (u) => u * u * (3 - 2 * u);
        const mv = (e) => { try { router.exec({ type: "entity:move", id: e.id, x: e.x, y: e.y, z: e.z, yaw: e.yaw }); } catch {} };
        const glideTo = (e, from, to, done) => {
            const lift = Math.abs(to.y - from.y) > 0.1 ? Math.max(to.y, from.y) + 2.2 : from.y + 0.9;   // level changes arc HIGH over the boards
            tween(0.6, (u) => {
                const s = ease(u);
                e.x = from.x + (to.x - from.x) * s; e.z = from.z + (to.z - from.z) * s;
                const base = from.y + (to.y - from.y) * s;
                e.y = base + Math.sin(u * Math.PI) * (lift - Math.max(from.y, to.y));
                mv(e);
            }, () => {
                // soft settle bounce
                tween(0.18, (u) => { e.y = to.y + Math.sin(u * Math.PI) * 0.25; mv(e); }, () => { e.x = to.x; e.y = to.y; e.z = to.z; mv(e); done && done(); });
            });
        };
        const capture = (e, done) => {   // flash red, then sink through the board and fade
            try { router.exec({ type: "entity:tint", id: e.id, color: [1, 0.12, 0.08], mix: 0.8 }); } catch {}
            const y0 = e.y;
            tween(0.55, (u) => {
                e.y = y0 - u * 2.4; e.yaw += 0.12; mv(e);
                try { router.exec({ type: "entity:setColorMul", id: e.id, mul: Math.max(0.05, 1 - u * 1.4) }); } catch {}
                try { router.exec({ type: "entity:rescale", id: e.id, scaleX: 1 - u * 0.5, scaleY: 1 - u * 0.5, scaleZ: 1 - u * 0.5 }); } catch {}
            }, () => { try { router.exec({ type: "entity:despawn", id: e.id }); } catch {} done && done(); });
        };
        // diff entities vs game.pieces and animate (one chess move = one from→to, maybe a capture)
        const animateToGame = (after) => {
            const P = S.game.pieces;
            const gone = [], appeared = [];
            for (const [sq, e] of S.ents) { const p = P[sq]; if (!p || p.t !== e.t || p.o !== e.o) gone.push([sq, e]); }
            for (const sq in P) { const p = P[sq], e = S.ents.get(sq); if (!e || e.t !== p.t || e.o !== p.o) appeared.push([sq, p]); }
            let pending = 0; const finish = () => { if (--pending <= 0 && after) after(); };
            for (const [sq2, p] of appeared) {
                const gi = gone.findIndex(([, e]) => e.t === p.t && e.o === p.o);
                if (gi >= 0) {
                    const [sq1, e] = gone.splice(gi, 1)[0];
                    S.ents.delete(sq1); S.ents.set(sq2, e);   // overwrites a captured victim's slot — its entity is despawned by the gone loop below
                    pending++; glideTo(e, world(T.squareInfo(sq1)), world(T.squareInfo(sq2)), finish);
                } else { spawnPiece(sq2, p); }   // promotion etc.
            }
            // remaining gone = captures. Guard the map delete by IDENTITY: the mover may have
            // already overwritten the victim's square, and deleting by key would evict the mover.
            for (const [sq1, e] of gone) { if (S.ents.get(sq1) === e) S.ents.delete(sq1); pending++; capture(e, finish); }
            if (!pending && after) after();
        };

        // ---- 3D glow tiles ----------------------------------------------------
        const clearGlow = () => { for (const id of S.glowIds) try { router.exec({ type: "entity:despawn", id }); } catch {} S.glowIds = []; };
        const showGlow = () => {
            clearGlow(); if (!S.sel) return;
            const put = (sqId, kind) => { const w = world(T.squareInfo(sqId)); try { const r = router.exec({ type: "entity:spawnMesh", assetId: kind, kind, x: w.x, y: w.y - 0.72, z: w.z, scaleX: 0.85, scaleY: 0.25, scaleZ: 0.85, yaw: 0 }); if (r && r.id != null) S.glowIds.push(r.id); } catch {} };
            put(S.sel, "trd_glow_y");
            for (const sqId of S.targets) put(sqId, "trd_glow_g");
        };

        let lastT = performance.now();
        const tick = () => {
            S.raf = requestAnimationFrame(tick);
            const now = performance.now(), dt = Math.min(0.05, (now - lastT) / 1000); lastT = now;
            for (let i = S.tweens.length - 1; i >= 0; i--) { const tw = S.tweens[i]; tw.t += dt; const u = Math.min(1, tw.t / tw.dur); tw.step(u); if (u >= 1) { S.tweens.splice(i, 1); tw.done && tw.done(); } }
            const pulse = 0.75 + Math.sin(now / 200) * 0.35;
            for (const id of S.glowIds) try { router.exec({ type: "entity:setColorMul", id, mul: pulse }); } catch {}
        };
        tick();

        // ---- 2D control: all seven boards as labeled grids (unchanged input) --
        const ov = document.createElement("div");
        ov.style.cssText = "position:fixed;left:14px;bottom:14px;z-index:300;background:rgba(8,12,18,0.95);border:1px solid #2a3645;border-radius:10px;padding:10px;font:12px system-ui,sans-serif;color:#dde6f2;max-height:80vh;overflow:auto;width:200px;";
        const status = document.createElement("div"); status.style.cssText = "margin-bottom:6px;min-height:16px;";
        const cells = {};
        const mkGrid = (board, cols) => {
            const wrapB = document.createElement("div"); wrapB.style.cssText = "margin-bottom:4px;";
            const lab = document.createElement("div"); lab.textContent = LABEL[board]; lab.style.cssText = "font-size:9px;color:#8fa3bb;margin:3px 0 1px;";
            const grid = document.createElement("div"); grid.style.cssText = "display:grid;grid-template-columns:repeat(" + cols + ",20px);gap:1px;";
            const sqs = T.allSquares().filter(id => T.squareInfo(id).board === board).map(id => T.squareInfo(id));
            sqs.sort((a, b) => (b.r - a.r) || (a.f - b.f));
            for (const s of sqs) { const b = document.createElement("div"); b.style.cssText = "width:20px;height:20px;display:flex;align-items:center;justify-content:center;font-size:13px;cursor:pointer;"; b.onclick = () => click(s.id); grid.appendChild(b); cells[s.id] = b; }
            wrapB.append(lab, grid); return wrapB;
        };
        for (const [board, cols] of ORDER) ov.appendChild(mkGrid(board, cols));
        const bar = document.createElement("div"); bar.style.cssText = "margin-top:6px;";
        const newBtn = document.createElement("button"); newBtn.textContent = "New game"; newBtn.style.cssText = "padding:5px 12px;border-radius:5px;cursor:pointer;font-size:11px;background:#2a4d3a;color:#cfe;border:1px solid #4a7d5a;";
        newBtn.onclick = () => { S.game = T.newGame(); S.sel = null; S.targets.clear(); S.busy = false; clearGlow(); respawn(); render(); };
        bar.appendChild(newBtn);
        ov.insertBefore(status, ov.firstChild); ov.appendChild(bar);
        document.body.appendChild(ov); S.overlay = ov;

        const aiTurn = () => {
            if (S.game.winner || S.game.turn !== "b") { S.busy = false; render(); return; }
            S.busy = true; render();
            S._ai = setTimeout(() => {
                T.applyAi(S.game, "b");
                animateToGame(() => { S.busy = false; render(); });
                render();
            }, 340);
        };
        function click(id) {
            if (S.busy || S.game.winner || S.game.turn !== "w") return;
            const p = S.game.pieces[id];
            if (S.sel && S.targets.has(id)) {
                T.move(S.game, { from: S.sel, to: id });
                S.sel = null; S.targets.clear(); clearGlow();
                S.busy = true;
                animateToGame(() => { aiTurn(); });
                render(); return;
            }
            if (p && p.o === "w") { S.sel = id; S.targets = new Set(T.legalMoves(S.game, "w").filter(m => m.from === id).map(m => m.to)); showGlow(); render(); return; }
            S.sel = null; S.targets.clear(); clearGlow(); render();
        }
        function render() {
            for (const id in cells) {
                const b = cells[id], s = T.squareInfo(id), p = S.game.pieces[id], light = (s.f + s.r) % 2 === 1;
                let bg = light ? "#cfc7b0" : "#6f7c92"; if (id === S.sel) bg = "#c8b45a"; else if (S.targets.has(id)) bg = light ? "#a9c98f" : "#7fae6a";
                b.style.background = bg;
                if (p) { b.textContent = T.SYM[p.t]; b.style.color = p.o === "w" ? "#11161c" : "#1a1208"; b.style.fontWeight = "700"; } else b.textContent = "";
            }
            status.textContent = S.game.winner ? (S.game.winner === "w" ? "You win \u2014 checkmate!" : "AI wins \u2014 checkmate")
                : (S.game.turn === "w" ? "Your move (White)" : "AI thinking\u2026");
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
