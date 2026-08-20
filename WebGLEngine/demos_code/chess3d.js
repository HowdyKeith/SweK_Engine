// demos_code/chess3d.js — v1472 (chess round 3: 3D board, per-piece-type models)
// Renders chess in 3D (skirmish path: buildVoxelMesh/GLB -> _createMesh -> entity:spawnMesh).
// Each PIECE TYPE (p/n/b/r/q/k) is assigned a model: a shipped/library GLB (recolored
// white/black per side via the gated loader tint) or the procedural voxel tower. Defaults
// map the GLBs we ship (RobotExpressive=king, RobotWoman=queen, RobotMan=pawn); the rest
// are voxel until you reassign them in the Customize-pieces panel. A floating class hat
// (shape=class, color=side) can be toggled on to disambiguate when types share a model.
import * as C from "../simulation/ChessGame.js";
import { buildVoxelMesh } from "../gpu/voxelCreature.js";

const CELL = 4, FLOOR_Y = 1, N = 8, CTR = (N - 1) / 2;
const WHITE_CI = 7, BLACK_CI = 1, TILE_L = 0, TILE_D = 2, HAT_W_CI = 7, HAT_B_CI = 1;
const WT = [1.3, 1.3, 1.35], BT = [0.30, 0.30, 0.36];
const SHIPPED = ["RobotExpressive", "RobotMan", "RobotWoman", "RobotManHF", "RobotWomanHF"];
const DEFAULT_MODELS = { k: "RobotExpressive", q: "RobotWoman", p: "RobotMan", n: "", b: "", r: "" };
const TYPES = ["k", "q", "r", "b", "n", "p"], TYPE_NAME = { k: "King", q: "Queen", r: "Rook", b: "Bishop", n: "Knight", p: "Pawn" };
const gridToWorld = (col, row) => ({ x: (col - CTR) * CELL, y: FLOOR_Y, z: (row - CTR) * CELL });

function pieceVoxels(type, ci) {
    const v = [];
    const box = (h) => { for (let y = 0; y < h; y++) for (let x = 0; x < 2; x++) for (let z = 0; z < 2; z++) v.push([x, y, z, ci]); };
    const at = (x, y, z) => v.push([x, y, z, ci]);
    if (type === "p") { box(2); at(0, 2, 0); at(1, 2, 1); }
    else if (type === "r") { box(3); at(0, 3, 0); at(1, 3, 0); at(0, 3, 1); at(1, 3, 1); at(0, 4, 0); at(1, 4, 1); }
    else if (type === "n") { box(2); at(0, 2, 0); at(1, 2, 0); at(0, 3, 0); at(1, 3, 0); }
    else if (type === "b") { box(3); at(0, 3, 0); at(1, 3, 1); at(0, 4, 0); }
    else if (type === "q") { box(4); at(0, 4, 0); at(1, 4, 0); at(0, 4, 1); at(1, 4, 1); at(0, 5, 0); at(1, 5, 1); }
    else if (type === "k") { box(5); at(0, 5, 0); at(1, 5, 0); at(0, 5, 1); at(1, 5, 1); at(0, 6, 0); at(1, 6, 0); at(0, 6, 1); at(1, 6, 1); at(0, 7, 0); }
    else box(2);
    return v;
}
function hatVoxels(cls, ci) {
    const v = []; const at = (x, y, z) => v.push([x, y, z, ci]);
    const band = (y) => { for (let x = 0; x < 2; x++) for (let z = 0; z < 2; z++) at(x, y, z); };
    if (cls === "p") { band(0); }
    else if (cls === "n") { band(0); at(0, 1, 0); at(1, 1, 0); }
    else if (cls === "b") { band(0); at(0, 1, 0); at(1, 1, 1); at(0, 2, 0); }
    else if (cls === "r") { at(0, 0, 0); at(1, 0, 0); at(0, 0, 1); at(1, 0, 1); at(0, 1, 0); at(1, 1, 1); }
    else if (cls === "q") { band(0); at(0, 1, 0); at(1, 1, 0); at(0, 1, 1); at(1, 1, 1); }
    else if (cls === "k") { band(0); band(1); at(0, 2, 0); at(1, 2, 0); at(0, 2, 1); at(1, 2, 1); at(0, 3, 0); }
    else band(0);
    return v;
}

export default {
    id: "chess3d",
    label: "CHESS 3D \u2014 per-piece GLB/voxel models vs the engine AI",
    hint: "round 3: chess in 3D; assign a GLB or voxel model per piece type",
    start() {
        const router = window.router, al = window.assetLoader, stage = window._stage;
        if (!router || !al || !al.gl || !al._createMesh) { console.warn("[chess3d] renderer not ready"); return; }
        if (stage) try { stage.enter({ floor: true }); } catch {}
        const S = this._S = { pieceIds: [], tileIds: [], game: C.newGame(), sel: null, targets: new Set(), depth: 2, thinking: false, overlay: null, hats: false, models: { ...DEFAULT_MODELS }, libList: [], net: null, token: Math.random().toString(36).slice(2) + Date.now().toString(36) };

        const reg = (name, vox) => { if (al.cache.get(name)) return; try { const g = buildVoxelMesh(vox); const m = al._createMesh(g.positions.buffer, g.indices.buffer, g.normals.buffer, g.colors.buffer, { name, vertexCount: g.vertexCount, indexCount: g.indices.length, hasNormals: true, hasColors: true }); if (m) al.cache.set(name, m); } catch (e) { console.warn("[chess3d] kind", name, e && e.message); } };
        for (const t of TYPES) {
            reg("chs_w_" + t, pieceVoxels(t, WHITE_CI)); reg("chs_b_" + t, pieceVoxels(t, BLACK_CI));
            reg("chs_hat_" + t + "_w", hatVoxels(t, HAT_W_CI)); reg("chs_hat_" + t + "_b", hatVoxels(t, HAT_B_CI));
        }
        const slab = (ci) => { const v = []; for (let x = 0; x < 3; x++) for (let z = 0; z < 3; z++) v.push([x, 0, z, ci]); return v; };
        reg("chs_tile_l", slab(TILE_L)); reg("chs_tile_d", slab(TILE_D));

        for (let row = 0; row < N; row++) for (let col = 0; col < N; col++) {
            const w = gridToWorld(col, row); const kind = (row + col) % 2 ? "chs_tile_l" : "chs_tile_d";
            try { const r = router.exec({ type: "entity:spawnMesh", assetId: kind, kind, x: w.x, y: FLOOR_Y - 1.1, z: w.z, scaleX: 1, scaleY: 1, scaleZ: 1, yaw: 0 }); if (r && r.id != null) S.tileIds.push(r.id); } catch {}
        }

        // Register a model ref (shipped GPU_Assets name OR library assetId) as white+black kinds.
        async function ensureBodyKinds(ref) {
            if (!ref) return false;
            const wkind = "chs_body_" + ref + "_w", bkind = "chs_body_" + ref + "_b";
            if (al.cache.get(wkind) && al.cache.get(bkind)) return true;
            let buf = null;
            if (SHIPPED.includes(ref)) { const res = await fetch("/GPU_Assets/" + ref + ".glb"); if (!res.ok) throw new Error("fetch " + ref); buf = await res.arrayBuffer(); }
            else { const lib = await window.assetLibrary?.get?.(ref); if (!lib || typeof lib.data !== "string") throw new Error("no lib data"); const ext = (lib.meta && lib.meta.dataExt || "glb").toLowerCase(); if (ext !== "glb" && ext !== "gltf") throw new Error("glb only"); const bin = atob(lib.data); const bytes = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i); buf = bytes.buffer; }
            for (const [tint, kind] of [[WT, wkind], [BT, bkind]]) { if (!al.cache.get(kind)) await al._loadGLBFromBytes(kind, buf.slice(0), { normalize: { targetSize: 3.0, anchor: "floor" }, tint }); }
            return true;
        }

        const bodyKindFor = (type, side) => {
            const ref = S.models[type];
            if (ref) { const k = "chs_body_" + ref + "_" + side; if (al.cache.get(k)) return k; }
            return "chs_" + side + "_" + type;   // voxel fallback (unassigned or not yet loaded)
        };
        const respawnPieces = () => {
            for (const id of S.pieceIds) try { router.exec({ type: "entity:despawn", id }); } catch {}
            S.pieceIds = [];
            for (let i = 0; i < 64; i++) {
                const p = S.game.board[i]; if (p === ".") continue;
                const side = (p === p.toUpperCase()) ? "w" : "b", type = p.toLowerCase();
                const w = gridToWorld(i % 8, i / 8 | 0), yaw = side === "w" ? 0 : Math.PI;
                const bk = bodyKindFor(type, side);
                try { const r = router.exec({ type: "entity:spawnMesh", assetId: bk, kind: bk, x: w.x, y: FLOOR_Y, z: w.z, scaleX: 1, scaleY: 1, scaleZ: 1, yaw }); if (r && r.id != null) S.pieceIds.push(r.id); } catch {}
                if (S.hats) { const hk = "chs_hat_" + type + "_" + side; try { const r = router.exec({ type: "entity:spawnMesh", assetId: hk, kind: hk, x: w.x, y: FLOOR_Y + 3.6, z: w.z, scaleX: 1, scaleY: 1, scaleZ: 1, yaw }); if (r && r.id != null) S.pieceIds.push(r.id); } catch {} }
            }
        };

        // ---- network (host-authoritative distributed) helpers ----
        const netFetch = async (method, p, body) => { const opt = { method, headers: { "Content-Type": "application/json" } }; if (body) opt.body = JSON.stringify(body); const r = await fetch(p, opt); return r.json(); };
        const mirrorGame = (st) => ({ board: st.board, turn: st.turn, winner: st.winner, castling: st.castling || { wK: true, wQ: true, bK: true, bQ: true }, ep: (st.ep != null ? st.ep : null), moves: st.moves || 0 });
        const applyNetState = (st) => { const changed = !S.game || S.game.board !== st.board; S.game = mirrorGame(st); if (st.players) S.net.players = st.players; if (changed) { S.sel = null; S.targets.clear(); respawnPieces(); } render(); return changed; };
        async function joinNet(side) {
            const room = (roomIn.value || "main").trim() || "main";
            try { const st = await netFetch("POST", "/mp/chess/join", { room, token: S.token, side }); if (!st || !st.ok) { status.textContent = "Join failed"; return; } S.net = { room, you: st.you, autoplay: autoCb.checked, players: st.players, busy: false }; applyNetState(st); if (!S._poll) S._poll = setInterval(pollNet, 1000); } catch { status.textContent = "Join error"; }
        }
        async function leaveNet() {
            if (S._poll) { clearInterval(S._poll); S._poll = null; }
            const room = S.net && S.net.room; S.net = null;
            if (room) try { await netFetch("POST", "/mp/chess/leave", { room, token: S.token }); } catch {}
            S.game = C.newGame(); S.sel = null; S.targets.clear(); respawnPieces(); render();
        }
        async function submitNetMove(from, to) {
            if (!S.net) return;
            try { const st = await netFetch("POST", "/mp/chess/move", { room: S.net.room, token: S.token, from, to, promo: "q" }); if (st && st.board) { applyNetState(st); if (!st.ok) status.textContent = "Rejected: " + (st.error || ""); } } catch {}
        }
        async function pollNet() {
            if (!S.net) return;
            try {
                const st = await netFetch("GET", "/mp/chess/state?room=" + encodeURIComponent(S.net.room)); if (!st || !st.board) return;
                applyNetState(st);
                if (S.net.autoplay && (S.net.you === "w" || S.net.you === "b") && !st.winner && st.turn === S.net.you && !S.net.busy) {
                    S.net.busy = true; try { const m = C.bestMove(S.game, S.depth); if (m) await submitNetMove(m.from, m.to); } finally { S.net.busy = false; }
                }
            } catch {}
        }

        // ---- control panel ----
        const ov = document.createElement("div");
        ov.style.cssText = "position:fixed;left:14px;bottom:14px;z-index:300;background:rgba(8,12,18,0.95);border:1px solid #2a3645;border-radius:10px;padding:10px;font:12px system-ui,sans-serif;color:#dde6f2;max-width:280px;";
        const status = document.createElement("div"); status.style.cssText = "margin-bottom:6px;min-height:16px;";
        const grid = document.createElement("div"); grid.style.cssText = "display:grid;grid-template-columns:repeat(8,26px);grid-template-rows:repeat(8,26px);gap:1px;";
        const bar = document.createElement("div"); bar.style.cssText = "margin-top:6px;display:flex;gap:6px;align-items:center;flex-wrap:wrap;";
        const selStyle = "background:#0a0e14;color:#cde;border:1px solid #345;border-radius:4px;padding:3px;font-size:11px;";
        const mk = (t, p) => { const b = document.createElement("button"); b.textContent = t; b.style.cssText = "padding:5px 10px;border-radius:5px;cursor:pointer;font-size:11px;" + (p ? "background:#2a4d3a;color:#cfe;border:1px solid #4a7d5a;" : "background:#16202c;color:#cde;border:1px solid #2a3340;"); return b; };
        const newBtn = mk("New", true); newBtn.onclick = () => { if (S.net) { netFetch("POST", "/mp/chess/reset", { room: S.net.room }).then(() => pollNet()); return; } S.game = C.newGame(); S.sel = null; S.targets.clear(); S.thinking = false; respawnPieces(); render(); };
        const depthSel = document.createElement("select"); depthSel.style.cssText = selStyle;
        for (const d of [1, 2, 3]) { const o = document.createElement("option"); o.value = d; o.textContent = "AI " + d; if (d === S.depth) o.selected = true; depthSel.appendChild(o); }
        depthSel.onchange = () => { S.depth = +depthSel.value; };
        const hatLbl = document.createElement("label"); hatLbl.style.cssText = "display:flex;gap:4px;align-items:center;cursor:pointer;";
        const hatCb = document.createElement("input"); hatCb.type = "checkbox"; hatCb.checked = S.hats; hatCb.onchange = () => { S.hats = hatCb.checked; respawnPieces(); };
        hatLbl.append(hatCb, document.createTextNode("Hats"));
        const custBtn = mk("Customize pieces", false);
        bar.append(newBtn, depthSel, hatLbl, custBtn);

        // network row — join a host-authoritative room as a side; Auto AI plays your turns
        const netRow = document.createElement("div"); netRow.style.cssText = "margin-top:6px;display:flex;gap:5px;align-items:center;flex-wrap:wrap;";
        const roomIn = document.createElement("input"); roomIn.type = "text"; roomIn.value = "main"; roomIn.style.cssText = selStyle + "width:58px;";
        const joinWB = mk("Join W", false), joinBB = mk("Join B", false), leaveBB = mk("Leave", false);
        const autoLbl = document.createElement("label"); autoLbl.style.cssText = "display:flex;gap:4px;align-items:center;cursor:pointer;";
        const autoCb = document.createElement("input"); autoCb.type = "checkbox"; autoLbl.append(autoCb, document.createTextNode("Auto AI"));
        joinWB.onclick = () => joinNet("w"); joinBB.onclick = () => joinNet("b"); leaveBB.onclick = () => leaveNet();
        autoCb.onchange = () => { if (S.net) S.net.autoplay = autoCb.checked; };
        netRow.append(document.createTextNode("Net:"), roomIn, joinWB, joinBB, leaveBB, autoLbl);

        // ---- per-type model customization (collapsible) ----
        const cust = document.createElement("div"); cust.style.cssText = "margin-top:6px;display:none;flex-direction:column;gap:3px;";
        const buildOptions = (selEl, cur) => {
            selEl.innerHTML = "";
            const add = (val, txt) => { const o = document.createElement("option"); o.value = val; o.textContent = txt; if (val === cur) o.selected = true; selEl.appendChild(o); };
            add("", "Voxel (generated)");
            for (const s of SHIPPED) add(s, s);
            for (const it of S.libList) { const id = it.id || it.assetId; if (id) add(id, "Lib: " + (it.name || id)); }
        };
        const typeRows = {};
        for (const t of TYPES) {
            const row = document.createElement("div"); row.style.cssText = "display:flex;gap:6px;align-items:center;justify-content:space-between;";
            const lab = document.createElement("span"); lab.textContent = TYPE_NAME[t]; lab.style.cssText = "min-width:54px;";
            const sel = document.createElement("select"); sel.style.cssText = selStyle + "flex:1;"; buildOptions(sel, S.models[t]);
            sel.onchange = async () => {
                const ref = sel.value;
                if (ref) { status.textContent = "Loading " + ref + "\u2026"; try { await ensureBodyKinds(ref); } catch (e) { console.warn("[chess3d] model", ref, e && e.message); status.textContent = ref + " failed to load"; sel.value = S.models[t] || ""; return; } }
                S.models[t] = ref; respawnPieces(); render();
            };
            typeRows[t] = sel; row.append(lab, sel); cust.appendChild(row);
        }
        custBtn.onclick = () => { cust.style.display = cust.style.display === "none" ? "flex" : "none"; };

        ov.append(status, grid, bar, netRow, cust); document.body.appendChild(ov); S.overlay = ov;

        // load the library mesh list (for the dropdowns) + the default-assigned shipped models
        try { Promise.resolve(window.assetLibrary && window.assetLibrary.list && window.assetLibrary.list({ type: "mesh" })).then((r) => { S.libList = Array.isArray(r) ? r : (r && (r.items || r.assets)) || []; for (const t of TYPES) buildOptions(typeRows[t], S.models[t]); }).catch(() => {}); } catch {}
        (async () => {
            const refs = [...new Set(Object.values(S.models).filter(Boolean))];
            for (const ref of refs) { try { await ensureBodyKinds(ref); respawnPieces(); } catch (e) { console.warn("[chess3d] default model", ref, e && e.message); } }
            render();
        })();

        const aiMove = () => {
            if (S.game.winner) return;
            S.thinking = true; render();
            S._ai = setTimeout(() => { const m = C.bestMove(S.game, S.depth); if (m) C.move(S.game, m); S.thinking = false; S.sel = null; S.targets.clear(); respawnPieces(); render(); }, 200);
        };
        const click = (i) => {
            if (S.net) {
                if (S.net.you !== "w" && S.net.you !== "b") return;       // spectator
                if (S.game.winner || S.game.turn !== S.net.you) return;   // not your turn
                const p = S.game.board[i];
                if (S.sel != null && S.targets.has(i)) { submitNetMove(S.sel, i); S.sel = null; S.targets.clear(); render(); return; }
                const mine = S.net.you === "w" ? (p !== "." && p === p.toUpperCase()) : (p !== "." && p === p.toLowerCase());
                if (mine) { S.sel = i; S.targets = new Set(C.legalMoves(S.game, S.net.you).filter(m => m.from === i).map(m => m.to)); render(); return; }
                S.sel = null; S.targets.clear(); render(); return;
            }
            if (S.thinking || S.game.winner || S.game.turn !== "w") return;
            const p = S.game.board[i];
            if (S.sel != null && S.targets.has(i)) { C.move(S.game, { from: S.sel, to: i, promo: "q" }); S.sel = null; S.targets.clear(); respawnPieces(); render(); aiMove(); return; }
            if (p !== "." && p === p.toUpperCase()) { S.sel = i; S.targets = new Set(C.legalMoves(S.game, "w").filter(m => m.from === i).map(m => m.to)); render(); return; }
            S.sel = null; S.targets.clear(); render();
        };
        function render() {
            grid.innerHTML = "";
            for (let i = 0; i < 64; i++) {
                const r = i / 8 | 0, c = i % 8, light = (r + c) % 2 === 0;
                const cell = document.createElement("div");
                let bg = light ? "#cfc7b0" : "#6f7c92"; if (i === S.sel) bg = "#c8b45a"; else if (S.targets.has(i)) bg = light ? "#a9c98f" : "#7fae6a";
                cell.style.cssText = "display:flex;align-items:center;justify-content:center;font-size:18px;cursor:pointer;background:" + bg + ";";
                const p = S.game.board[i]; if (p !== ".") { cell.textContent = C.SYMBOL[p]; cell.style.color = (p === p.toUpperCase()) ? "#11161c" : "#1a1208"; }
                cell.onclick = () => click(i);
                grid.appendChild(cell);
            }
            if (S.net) {
                const you = S.net.you === "w" ? "White" : S.net.you === "b" ? "Black" : "Spectator", g = S.game;
                let msg = "Net[" + S.net.room + "] " + you;
                if (g.winner === "draw") msg += " \u00b7 draw"; else if (g.winner) msg += " \u00b7 " + (g.winner === "w" ? "White" : "Black") + " wins";
                else msg += " \u00b7 " + (g.turn === "w" ? "White" : "Black") + " to move" + (C.status(g) === "check" ? " (check)" : "") + (S.net.you === g.turn ? " \u2014 your move" : "");
                status.textContent = msg; return;
            }
            const st = C.status(S.game);
            status.textContent = S.game.winner === "draw" ? "Stalemate \u2014 draw." : S.game.winner ? (S.game.winner === "w" ? "You win!" : "AI wins!") : (S.thinking ? "AI thinking\u2026" : (S.game.turn === "w" ? "Your move" : "Black") + (st === "check" ? " \u2014 check!" : ""));
        }
        respawnPieces(); render();
    },
    stop() {
        const S = this._S; if (!S) return;
        if (S._ai) { clearTimeout(S._ai); S._ai = null; }
        if (S._poll) { clearInterval(S._poll); S._poll = null; }
        if (S.net && S.net.room) { try { fetch("/mp/chess/leave", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ room: S.net.room, token: S.token }) }); } catch {} }
        const router = window.router;
        for (const id of S.pieceIds.concat(S.tileIds)) try { router && router.exec({ type: "entity:despawn", id }); } catch {}
        if (S.overlay) { try { S.overlay.remove(); } catch {} }
        this._S = null;
    },
};
