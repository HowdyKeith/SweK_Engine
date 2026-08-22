// demos_code/chess.js — v1464 (chess round 1)
// A playable chess board (you = White vs the engine AI = Black), driven by the
// pure ChessGame engine. Round 1 is the 2D board that proves the engine; later
// rounds put it on a 3D board and let peer SweK engines play each other.
import * as C from "../simulation/ChessGame.js";

let _ov = null, _ai = null;

function open() {
    if (typeof document === "undefined" || _ov) return;
    let game = C.newGame(), sel = null, targets = new Set(), depth = 2, thinking = false;

    const ov = document.createElement("div");
    ov.style.cssText = "position:fixed;inset:0;z-index:400;background:rgba(7,10,14,0.94);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;font:13px system-ui,sans-serif;color:#dde6f2;";
    const status = document.createElement("div"); status.style.cssText = "font-size:14px;min-height:18px;";
    const board = document.createElement("div"); board.style.cssText = "display:grid;grid-template-columns:repeat(8,46px);grid-template-rows:repeat(8,46px);border:2px solid #2a3645;border-radius:4px;overflow:hidden;";
    const bar = document.createElement("div"); bar.style.cssText = "display:flex;gap:8px;align-items:center;";

    const mkBtn = (t, p) => { const b = document.createElement("button"); b.textContent = t; b.style.cssText = "padding:7px 14px;border-radius:6px;cursor:pointer;font-size:12px;" + (p ? "background:#2a4d3a;color:#cfe;border:1px solid #4a7d5a;" : "background:#16202c;color:#cde;border:1px solid #2a3340;"); return b; };
    const newBtn = mkBtn("New game", true); newBtn.onclick = () => { game = C.newGame(); sel = null; targets.clear(); thinking = false; render(); };
    const depthSel = document.createElement("select"); depthSel.style.cssText = "background:#0a0e14;color:#cde;border:1px solid #345;border-radius:5px;padding:5px;font-size:12px;";
    for (const d of [1, 2, 3]) { const o = document.createElement("option"); o.value = d; o.textContent = "AI depth " + d; if (d === depth) o.selected = true; depthSel.appendChild(o); }
    depthSel.onchange = () => { depth = +depthSel.value; };
    const closeBtn = mkBtn("Close"); closeBtn.onclick = close;
    bar.append(newBtn, depthSel, closeBtn);
    ov.append(status, board, bar); document.body.appendChild(ov); _ov = ov;

    const aiMove = () => {
        if (game.winner) return;
        thinking = true; render();
        _ai = setTimeout(() => {
            const m = C.bestMove(game, depth); if (m) C.move(game, m);
            thinking = false; sel = null; targets.clear(); render();
        }, 180);
    };
    const click = (i) => {
        if (thinking || game.winner || game.turn !== "w") return;
        const p = game.board[i];
        if (sel != null && targets.has(i)) { C.move(game, { from: sel, to: i, promo: "q" }); sel = null; targets.clear(); render(); aiMove(); return; }
        if (p !== "." && p === p.toUpperCase()) { sel = i; targets = new Set(C.legalMoves(game, "w").filter(m => m.from === i).map(m => m.to)); render(); return; }
        sel = null; targets.clear(); render();
    };
    function render() {
        board.innerHTML = "";
        for (let i = 0; i < 64; i++) {
            const r = i / 8 | 0, c = i % 8, light = (r + c) % 2 === 0;
            const cell = document.createElement("div");
            let bg = light ? "#e9e2cf" : "#7d8aa0"; if (i === sel) bg = "#c8b45a"; else if (targets.has(i)) bg = light ? "#a9c98f" : "#7fae6a";
            cell.style.cssText = "display:flex;align-items:center;justify-content:center;font-size:32px;cursor:pointer;background:" + bg + ";";
            const p = game.board[i]; if (p !== ".") { cell.textContent = C.SYMBOL[p]; cell.style.color = (p === p.toUpperCase()) ? "#11161c" : "#1a1208"; }
            cell.onclick = () => click(i);
            board.appendChild(cell);
        }
        const st = C.status(game);
        if (game.winner === "draw") status.textContent = "Stalemate \u2014 draw.";
        else if (game.winner) status.textContent = (game.winner === "w" ? "White (you) win" : "Black (AI) wins") + " by checkmate!";
        else if (thinking) status.textContent = "Black is thinking\u2026";
        else status.textContent = (game.turn === "w" ? "Your move (White)" : "Black to move") + (st === "check" ? " \u2014 check!" : "");
    }
    render();
}
function close() { if (_ai) { clearTimeout(_ai); _ai = null; } if (_ov) { try { _ov.remove(); } catch {} _ov = null; } }

export default {
    id: "chess",
    label: "CHESS \u2014 you vs the engine AI",
    hint: "round 1: playable board on the pure chess engine",
    start() { open(); },
    stop() { close(); },
};
