// simulation/ThreePlayerChess.js — v1475 (chess r5b: three-player chess)
// CLEAN, TESTABLE geometry model (documented; not a pixel clone of a specific
// commercial board): 96 cells = 3 sectors x (8 files x 4 ranks). Each sector is the
// BOTTOM of one logical 8x8 board and the TOP of another, so every cell lives in TWO
// boards and a sliding piece naturally reaches BOTH opponents — no fragile "center
// singularity". Pawns are cyclic (each player's pawns advance through their own board
// toward the next player). First player to deliver checkmate wins (the classic anti-
// gang-up rule). Pure + greedy-AI so it is fully node-testable.

const enc = (s, r, f) => s * 32 + r * 8 + f;
const dec = (i) => ({ s: (i / 32) | 0, r: ((i % 32) / 8) | 0, f: i % 8 });

// the two logical-board coords a physical cell belongs to: bottom of board s, top of board (s+2)
function boardCoords(i) { const { s, r, f } = dec(i); return [{ k: s, R: r, F: f }, { k: (s + 2) % 3, R: 7 - r, F: f }]; }
// board (k) rank/file -> physical cell: bottom half = sector k, top half = sector k+1 (reversed ranks)
function bcToPhys(k, R, F) { if (R < 0 || R > 7 || F < 0 || F > 7) return -1; return R < 4 ? enc(k, R, F) : enc((k + 1) % 3, 7 - R, F); }

const HOME = ["R", "N", "B", "Q", "K", "B", "N", "R"];
export function newGame() {
    const board = new Array(96).fill(null);
    for (let s = 0; s < 3; s++) { for (let f = 0; f < 8; f++) { board[enc(s, 0, f)] = { t: HOME[f], o: s }; board[enc(s, 1, f)] = { t: "P", o: s }; } }
    return { board, turn: 0, winner: null, moves: 0, log: [] };
}

const ROOK = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const BISH = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
const KNIGHT = [[1, 2], [2, 1], [-1, 2], [-2, 1], [1, -2], [2, -1], [-1, -2], [-2, -1]];

// pseudo-legal destinations for the piece on cell i (no self-check filtering)
function pseudo(board, i) {
    const p = board[i]; if (!p) return [];
    const out = new Set(); const frames = boardCoords(i);
    const slide = (k, R, F, dirs) => { for (const [dF, dR] of dirs) { let r = R, f = F; for (let n = 0; n < 8; n++) { r += dR; f += dF; const ph = bcToPhys(k, r, f); if (ph < 0) break; const q = board[ph]; if (!q) out.add(ph); else { if (q.o !== p.o) out.add(ph); break; } } } };
    const step = (k, R, F, dirs) => { for (const [dF, dR] of dirs) { const phc = bcToPhys(k, R + dR, F + dF); if (phc < 0) continue; const q = board[phc]; if (!q || q.o !== p.o) out.add(phc); } };
    if (p.t === "P") {
        const fr = frames.find(bc => bc.k === p.o); if (fr) {
            const { k, R, F } = fr;
            const one = bcToPhys(k, R + 1, F);
            if (one >= 0 && !board[one]) { out.add(one); if (R === 1) { const two = bcToPhys(k, R + 2, F); if (two >= 0 && !board[two]) out.add(two); } }
            for (const dF of [-1, 1]) { const cap = bcToPhys(k, R + 1, F + dF); if (cap >= 0 && board[cap] && board[cap].o !== p.o) out.add(cap); }
        }
    } else {
        for (const { k, R, F } of frames) {
            if (p.t === "R" || p.t === "Q") slide(k, R, F, ROOK);
            if (p.t === "B" || p.t === "Q") slide(k, R, F, BISH);
            if (p.t === "N") step(k, R, F, KNIGHT);
            if (p.t === "K") step(k, R, F, ROOK.concat(BISH));
        }
    }
    return [...out];
}

// squares ATTACKED by the piece on i (pawns attack diagonals only) — for check detection
function attacks(board, i) {
    const p = board[i]; if (!p) return [];
    if (p.t !== "P") return pseudo(board, i);
    const out = []; const fr = boardCoords(i).find(bc => bc.k === p.o); if (fr) { const { k, R, F } = fr; for (const dF of [-1, 1]) { const c = bcToPhys(k, R + 1, F + dF); if (c >= 0) out.push(c); } }
    return out;
}

function kingCell(board, owner) { for (let i = 0; i < 96; i++) { const p = board[i]; if (p && p.t === "K" && p.o === owner) return i; } return -1; }
export function inCheck(board, owner) { const kc = kingCell(board, owner); if (kc < 0) return false; for (let i = 0; i < 96; i++) { const p = board[i]; if (p && p.o !== owner && attacks(board, i).includes(kc)) return true; } return false; }

function applyTo(board, from, to) { const b = board.slice(); const p = { ...b[from] }; if (p.t === "P") { const fr = boardCoords(to).find(bc => bc.k === p.o); if (fr && fr.R === 7) p.t = "Q"; } b[to] = p; b[from] = null; return b; }

export function legalMoves(game, owner) {
    const res = [];
    for (let i = 0; i < 96; i++) { const p = game.board[i]; if (!p || p.o !== owner) continue; for (const to of pseudo(game.board, i)) { const nb = applyTo(game.board, i, to); if (!inCheck(nb, owner)) res.push({ from: i, to }); } }
    return res;
}
export function isCheckmate(game, owner) { return inCheck(game.board, owner) && legalMoves(game, owner).length === 0; }

export function move(game, m) {
    if (game.winner != null) return false;
    const p = game.board[m.from]; if (!p || p.o !== game.turn) return false;
    if (!legalMoves(game, game.turn).some(x => x.from === m.from && x.to === m.to)) return false;
    game.board = applyTo(game.board, m.from, m.to);
    game.log.push({ from: m.from, to: m.to, o: game.turn });
    // first checkmate wins
    for (let o = 0; o < 3; o++) if (o !== game.turn && isCheckmate(game, o)) { game.winner = game.turn; }
    game.turn = (game.turn + 1) % 3; game.moves++;
    return true;
}

const VAL = { P: 1, N: 3, B: 3, R: 5, Q: 9, K: 0 };
export function aiMove(game, owner) {
    const moves = legalMoves(game, owner); if (!moves.length) return null;
    let best = null, bestScore = -1e9;
    for (const m of moves) {
        const cap = game.board[m.to]; let sc = cap ? VAL[cap.t] * 10 : 0;
        const nb = applyTo(game.board, m.from, m.to);
        for (let o = 0; o < 3; o++) if (o !== owner) { if (inCheck(nb, o)) sc += 2; }
        // mate test (expensive but rare wins)
        for (let o = 0; o < 3; o++) if (o !== owner && inCheck(nb, o)) { const tmp = { board: nb, turn: o, winner: null }; if (legalMoves(tmp, o).length === 0) sc += 1000; }
        const { r } = dec(m.to); sc += r * 0.05 + Math.random() * 0.01;
        if (sc > bestScore) { bestScore = sc; best = m; }
    }
    return best;
}
export function applyAi(game, owner) { const m = aiMove(game, owner); if (!m) { game.turn = (game.turn + 1) % 3; return null; } move(game, m); return m; }

export const SYM = { K: "\u265A", Q: "\u265B", R: "\u265C", B: "\u265D", N: "\u265E", P: "\u265F" };
export { enc, dec };
