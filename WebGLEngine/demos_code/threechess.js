// demos_code/threechess.js — v1475 (chess r5b: three-player chess)
// Renders ThreePlayerChess on a 3-sector "Y" board in 3D (skirmish path:
// buildVoxelMesh -> _createMesh -> entity:spawnMesh). You are Player 0 (red); the
// engine AI plays Players 1 (green) and 2 (blue). Control via three stacked 8x4
// sub-boards (one per player's sector); legal targets highlight even when they land
// in another player's sector. First player to deliver checkmate wins.
import * as T from "../simulation/ThreePlayerChess.js";
import { buildVoxelMesh } from "../gpu/voxelCreature.js";

const CELL = 4, FLOOR_Y = 1, BASEGAP = 5;
const OWN_CI = [4, 6, 7], TILE_L = 0, TILE_D = 2;

function pieceVoxels(type, ci) {
    const v = []; const box = (h) => { for (let y = 0; y < h; y++) for (let x = 0; x < 2; x++) for (let z = 0; z < 2; z++) v.push([x, y, z, ci]); }; const at = (x, y, z) => v.push([x, y, z, ci]);
    if (type === "P") { box(2); at(0, 2, 0); at(1, 2, 1); }
    else if (type === "R") { box(3); at(0, 3, 0); at(1, 3, 0); at(0, 3, 1); at(1, 3, 1); at(0, 4, 0); at(1, 4, 1); }
    else if (type === "N") { box(2); at(0, 2, 0); at(1, 2, 0); at(0, 3, 0); at(1, 3, 0); }
    else if (type === "B") { box(3); at(0, 3, 0); at(1, 3, 1); at(0, 4, 0); }
    else if (type === "Q") { box(4); at(0, 4, 0); at(1, 4, 0); at(0, 4, 1); at(1, 4, 1); at(0, 5, 0); at(1, 5, 1); }
    else if (type === "K") { box(5); at(0, 5, 0); at(1, 5, 0); at(0, 5, 1); at(1, 5, 1); at(0, 6, 0); at(1, 6, 0); at(0, 6, 1); at(1, 6, 1); at(0, 7, 0); }
    else box(2);
    return v;
}
function cellWorld(s, r, f) {
    const x0 = (f - 3.5) * CELL, z0 = -(BASEGAP + (3 - r) * CELL);
    const a = s * 2 * Math.PI / 3, ca = Math.cos(a), sa = Math.sin(a);
    return { x: x0 * ca + z0 * sa, y: FLOOR_Y, z: -x0 * sa + z0 * ca };
}

export default {
    id: "threechess",
    label: "3-PLAYER CHESS \u2014 three armies vs two engine AIs",
    hint: "chess r5b: three-handed chess, first checkmate wins",
    start() {
        const router = window.router, al = window.assetLoader, stage = window._stage;
        if (!router || !al || !al.gl || !al._createMesh) { console.warn("[3chess] renderer not ready"); return; }
        if (stage) try { stage.enter({ floor: true }); } catch {}
        const S = this._S = { pieceIds: [], tileIds: [], game: T.newGame(), sel: null, targets: new Set(), overlay: null, busy: false };

        const reg = (name, vox) => { if (al.cache.get(name)) return; try { const g = buildVoxelMesh(vox); const m = al._createMesh(g.positions.buffer, g.indices.buffer, g.normals.buffer, g.colors.buffer, { name, vertexCount: g.vertexCount, indexCount: g.indices.length, hasNormals: true, hasColors: true }); if (m) al.cache.set(name, m); } catch (e) { console.warn("[3chess] kind", name, e && e.message); } };
        for (const t of ["P", "N", "B", "R", "Q", "K"]) for (let o = 0; o < 3; o++) reg("tpc_" + t + "_" + o, pieceVoxels(t, OWN_CI[o]));
        const slab = (ci) => { const v = []; for (let x = 0; x < 3; x++) for (let z = 0; z < 3; z++) v.push([x, 0, z, ci]); return v; };
        reg("tpc_tile_l", slab(TILE_L)); reg("tpc_tile_d", slab(TILE_D));

        for (let s = 0; s < 3; s++) for (let r = 0; r < 4; r++) for (let f = 0; f < 8; f++) {
            const w = cellWorld(s, r, f), kind = (r + f) % 2 ? "tpc_tile_l" : "tpc_tile_d";
            try { const x = router.exec({ type: "entity:spawnMesh", assetId: kind, kind, x: w.x, y: FLOOR_Y - 1.1, z: w.z, scaleX: 1, scaleY: 1, scaleZ: 1, yaw: 0 }); if (x && x.id != null) S.tileIds.push(x.id); } catch {}
        }

        const respawn = () => {
            for (const id of S.pieceIds) try { router.exec({ type: "entity:despawn", id }); } catch {}
            S.pieceIds = [];
            for (let i = 0; i < 96; i++) { const p = S.game.board[i]; if (!p) continue; const { s, r, f } = T.dec(i); const w = cellWorld(s, r, f); const kind = "tpc_" + p.t + "_" + p.o; const yaw = s * 2 * Math.PI / 3 + Math.PI; try { const x = router.exec({ type: "entity:spawnMesh", assetId: kind, kind, x: w.x, y: FLOOR_Y, z: w.z, scaleX: 1, scaleY: 1, scaleZ: 1, yaw }); if (x && x.id != null) S.pieceIds.push(x.id); } catch {} }
        };

        // ---- 2D control: three stacked 8x4 sub-boards ----
        const ov = document.createElement("div");
        ov.style.cssText = "position:fixed;left:14px;bottom:14px;z-index:300;background:rgba(8,12,18,0.95);border:1px solid #2a3645;border-radius:10px;padding:10px;font:12px system-ui,sans-serif;color:#dde6f2;";
        const status = document.createElement("div"); status.style.cssText = "margin-bottom:6px;min-height:16px;";
        const wrap = document.createElement("div");
        const NAME = ["P0 (you)", "P1 AI", "P2 AI"], TXTCOL = ["#ffd9d0", "#d2f5cf", "#cfe0ff"];
        const cells = {};
        for (let s = 0; s < 3; s++) {
            const lab = document.createElement("div"); lab.textContent = NAME[s]; lab.style.cssText = "font-size:10px;margin:4px 0 2px;color:" + TXTCOL[s] + ";";
            const grid = document.createElement("div"); grid.style.cssText = "display:grid;grid-template-columns:repeat(8,20px);grid-template-rows:repeat(4,20px);gap:1px;";
            for (let r = 3; r >= 0; r--) for (let f = 0; f < 8; f++) { const i = T.enc(s, r, f); const b = document.createElement("div"); b.style.cssText = "display:flex;align-items:center;justify-content:center;font-size:14px;cursor:pointer;"; b.onclick = () => click(i); grid.appendChild(b); cells[i] = b; }
            wrap.append(lab, grid);
        }
        const bar = document.createElement("div"); bar.style.cssText = "margin-top:6px;";
        const newBtn = document.createElement("button"); newBtn.textContent = "New game"; newBtn.style.cssText = "padding:5px 12px;border-radius:5px;cursor:pointer;font-size:11px;background:#2a4d3a;color:#cfe;border:1px solid #4a7d5a;";
        newBtn.onclick = () => { S.game = T.newGame(); S.sel = null; S.targets.clear(); S.busy = false; respawn(); render(); };
        bar.append(newBtn);
        ov.append(status, wrap, bar); document.body.appendChild(ov); S.overlay = ov;

        const aiTurns = () => {
            if (S.game.winner != null) { render(); return; }
            if (S.game.turn === 0) { S.busy = false; render(); return; }
            S.busy = true; render();
            S._ai = setTimeout(() => { T.applyAi(S.game, S.game.turn); respawn(); aiTurns(); }, 320);
        };
        function click(i) {
            if (S.busy || S.game.winner != null || S.game.turn !== 0) return;
            const p = S.game.board[i];
            if (S.sel != null && S.targets.has(i)) { T.move(S.game, { from: S.sel, to: i }); S.sel = null; S.targets.clear(); respawn(); aiTurns(); return; }
            if (p && p.o === 0) { S.sel = i; S.targets = new Set(T.legalMoves(S.game, 0).filter(m => m.from === i).map(m => m.to)); render(); return; }
            S.sel = null; S.targets.clear(); render();
        }
        function render() {
            for (let i = 0; i < 96; i++) {
                const b = cells[i], p = S.game.board[i], { r, f } = T.dec(i), light = (r + f) % 2 === 1;
                let bg = light ? "#cfc7b0" : "#6f7c92"; if (i === S.sel) bg = "#c8b45a"; else if (S.targets.has(i)) bg = light ? "#a9c98f" : "#7fae6a";
                b.style.background = bg;
                if (p) { b.textContent = T.SYM[p.t]; b.style.color = TXTCOL[p.o]; b.style.fontWeight = "700"; } else b.textContent = "";
            }
            status.textContent = S.game.winner != null ? ("Player " + S.game.winner + (S.game.winner === 0 ? " (you) win!" : " wins") + " \u2014 checkmate")
                : (S.game.turn === 0 ? "Your move (P0)" : "P" + S.game.turn + " thinking\u2026");
        }
        respawn(); render();
    },
    stop() {
        const S = this._S; if (!S) return;
        if (S._ai) { clearTimeout(S._ai); S._ai = null; }
        const router = window.router;
        for (const id of S.pieceIds.concat(S.tileIds)) try { router && router.exec({ type: "entity:despawn", id }); } catch {}
        if (S.overlay) { try { S.overlay.remove(); } catch {} }
        this._S = null;
    },
};
