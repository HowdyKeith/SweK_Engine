// simulation/ChessGame.js — v1468 (chess round 2: castling + en passant)
// Pure, render-free chess engine. Now tournament-legal: full piece moves,
// CASTLING, EN PASSANT, promotion (auto-queen), check / checkmate / stalemate,
// and a negamax + alpha-beta AI. State is threaded as a POSITION {board, castling,
// ep} so the AI search carries rights + en-passant correctly across plies. This is
// the shared core for the later rounds (3D board, distributed peer-vs-peer, variants).
//
// Board: 64-array, index = row*8 + col. row 0 = rank 8 (black back rank, top),
// row 7 = rank 1 (white back rank, bottom). White UPPERCASE, moves up (toward row 0).

const START = [
    "r", "n", "b", "q", "k", "b", "n", "r",
    "p", "p", "p", "p", "p", "p", "p", "p",
    ".", ".", ".", ".", ".", ".", ".", ".",
    ".", ".", ".", ".", ".", ".", ".", ".",
    ".", ".", ".", ".", ".", ".", ".", ".",
    ".", ".", ".", ".", ".", ".", ".", ".",
    "P", "P", "P", "P", "P", "P", "P", "P",
    "R", "N", "B", "Q", "K", "B", "N", "R",
];
const VALUE = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 20000 };
const ROOK_HOME = { 56: "wQ", 63: "wK", 0: "bQ", 7: "bK" };   // a1 h1 a8 h8

export function newGame() { return { board: START.slice(), turn: "w", castling: { wK: true, wQ: true, bK: true, bQ: true }, ep: null, winner: null, moves: 0 }; }
const isW = (p) => p !== "." && p === p.toUpperCase();
const isB = (p) => p !== "." && p === p.toLowerCase();
const colorOf = (p) => p === "." ? null : (isW(p) ? "w" : "b");
const onBoard = (r, c) => r >= 0 && r < 8 && c >= 0 && c < 8;

function attacked(b, r, c, by) {
    const pr = by === "w" ? r + 1 : r - 1;
    for (const dc of [-1, 1]) { if (onBoard(pr, c + dc)) { const p = b[pr * 8 + (c + dc)]; if (p !== "." && colorOf(p) === by && p.toLowerCase() === "p") return true; } }
    for (const [dr, dc] of [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]]) { const nr = r + dr, nc = c + dc; if (onBoard(nr, nc)) { const p = b[nr * 8 + nc]; if (p !== "." && colorOf(p) === by && p.toLowerCase() === "n") return true; } }
    for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) { if (!dr && !dc) continue; const nr = r + dr, nc = c + dc; if (onBoard(nr, nc)) { const p = b[nr * 8 + nc]; if (p !== "." && colorOf(p) === by && p.toLowerCase() === "k") return true; } }
    const ortho = [[-1, 0], [1, 0], [0, -1], [0, 1]], diag = [[-1, -1], [-1, 1], [1, -1], [1, 1]];
    const scan = (dirs, kinds) => { for (const [dr, dc] of dirs) { let nr = r + dr, nc = c + dc; while (onBoard(nr, nc)) { const p = b[nr * 8 + nc]; if (p !== ".") { if (colorOf(p) === by && kinds.includes(p.toLowerCase())) return true; break; } nr += dr; nc += dc; } } return false; };
    return scan(ortho, ["r", "q"]) || scan(diag, ["b", "q"]);
}
function kingSq(b, color) { const k = color === "w" ? "K" : "k"; for (let i = 0; i < 64; i++) if (b[i] === k) return i; return -1; }
export function inCheck(b, color) { const ks = kingSq(b, color); if (ks < 0) return false; return attacked(b, ks / 8 | 0, ks % 8, color === "w" ? "b" : "w"); }

// pseudo-legal moves from a POSITION {board, castling, ep}
function pseudo(pos, color) {
    const b = pos.board, out = [];
    const fwd = color === "w" ? -1 : 1, startRow = color === "w" ? 6 : 1, promoRow = color === "w" ? 0 : 7;
    const own = color === "w" ? isW : isB, enemy = color === "w" ? isB : isW, foe = color === "w" ? "b" : "w";
    const push = (from, to, ex) => out.push(ex ? Object.assign({ from, to }, ex) : { from, to });
    for (let i = 0; i < 64; i++) {
        const p = b[i]; if (p === "." || colorOf(p) !== color) continue;
        const r = i / 8 | 0, c = i % 8, t = p.toLowerCase();
        if (t === "p") {
            const r1 = r + fwd;
            if (onBoard(r1, c) && b[r1 * 8 + c] === ".") { if (r1 === promoRow) push(i, r1 * 8 + c, { promo: "q" }); else push(i, r1 * 8 + c); if (r === startRow && b[(r + 2 * fwd) * 8 + c] === ".") push(i, (r + 2 * fwd) * 8 + c, { double: true }); }
            for (const dc of [-1, 1]) { const nr = r1, nc = c + dc; if (!onBoard(nr, nc)) continue; const to = nr * 8 + nc; if (enemy(b[to])) { if (nr === promoRow) push(i, to, { promo: "q" }); else push(i, to); } else if (pos.ep === to) push(i, to, { ep: true }); }
        } else if (t === "n") {
            for (const [dr, dc] of [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]]) { const nr = r + dr, nc = c + dc; if (onBoard(nr, nc) && !own(b[nr * 8 + nc])) push(i, nr * 8 + nc); }
        } else if (t === "k") {
            for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) { if (!dr && !dc) continue; const nr = r + dr, nc = c + dc; if (onBoard(nr, nc) && !own(b[nr * 8 + nc])) push(i, nr * 8 + nc); }
            const hr = color === "w" ? 7 : 0, ks = color === "w" ? "wK" : "bK", qs = color === "w" ? "wQ" : "bQ", rook = color === "w" ? "R" : "r";
            if (i === hr * 8 + 4 && !attacked(b, hr, 4, foe)) {
                if (pos.castling[ks] && b[hr * 8 + 5] === "." && b[hr * 8 + 6] === "." && b[hr * 8 + 7] === rook && !attacked(b, hr, 5, foe) && !attacked(b, hr, 6, foe)) push(i, hr * 8 + 6, { castle: "K" });
                if (pos.castling[qs] && b[hr * 8 + 3] === "." && b[hr * 8 + 2] === "." && b[hr * 8 + 1] === "." && b[hr * 8 + 0] === rook && !attacked(b, hr, 3, foe) && !attacked(b, hr, 2, foe)) push(i, hr * 8 + 2, { castle: "Q" });
            }
        } else {
            const dirs = t === "r" ? [[-1, 0], [1, 0], [0, -1], [0, 1]] : t === "b" ? [[-1, -1], [-1, 1], [1, -1], [1, 1]] : [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [-1, 1], [1, -1], [1, 1]];
            for (const [dr, dc] of dirs) { let nr = r + dr, nc = c + dc; while (onBoard(nr, nc)) { const q = b[nr * 8 + nc]; if (q === ".") push(i, nr * 8 + nc); else { if (enemy(q)) push(i, nr * 8 + nc); break; } nr += dr; nc += dc; } }
        }
    }
    return out;
}

// apply a move to a POSITION -> new POSITION {board, castling, ep}
export function applyMove(pos, m) {
    const b = pos.board.slice(), castling = Object.assign({}, pos.castling);
    const p = b[m.from], color = colorOf(p);
    if (m.ep) { const dir = color === "w" ? 1 : -1; b[m.to + dir * 8] = "."; }   // remove the en-passant-captured pawn
    b[m.to] = m.promo ? (color === "w" ? m.promo.toUpperCase() : m.promo) : p;
    b[m.from] = ".";
    if (m.castle) { const hr = m.to / 8 | 0; if (m.castle === "K") { b[hr * 8 + 5] = b[hr * 8 + 7]; b[hr * 8 + 7] = "."; } else { b[hr * 8 + 3] = b[hr * 8 + 0]; b[hr * 8 + 0] = "."; } }
    if (p.toLowerCase() === "k") { if (color === "w") { castling.wK = castling.wQ = false; } else { castling.bK = castling.bQ = false; } }
    if (ROOK_HOME[m.from]) castling[ROOK_HOME[m.from]] = false;
    if (ROOK_HOME[m.to]) castling[ROOK_HOME[m.to]] = false;
    const ep = m.double ? (m.from + m.to) / 2 : null;
    return { board: b, castling, ep };
}

export function legalMoves(game, color) {
    const c = color || game.turn;
    return pseudo(game, c).filter(m => !inCheck(applyMove(game, m).board, c));
}
export function move(game, m) {
    const ok = legalMoves(game, game.turn).find(x => x.from === m.from && x.to === m.to);
    if (!ok) return false;
    const np = applyMove(game, ok);
    game.board = np.board; game.castling = np.castling; game.ep = np.ep;
    game.turn = game.turn === "w" ? "b" : "w"; game.moves++;
    if (legalMoves(game, game.turn).length === 0) game.winner = inCheck(game.board, game.turn) ? (game.turn === "w" ? "b" : "w") : "draw";
    return true;
}
export function status(game) {
    const c = game.turn, lm = legalMoves(game, c);
    if (lm.length === 0) return inCheck(game.board, c) ? "checkmate" : "stalemate";
    return inCheck(game.board, c) ? "check" : "play";
}

function evalBoard(b, color) { let s = 0; for (let i = 0; i < 64; i++) { const p = b[i]; if (p === ".") continue; s += (isW(p) ? 1 : -1) * VALUE[p.toLowerCase()]; } return color === "w" ? s : -s; }
function negamax(pos, color, depth, alpha, beta) {
    if (depth === 0) return evalBoard(pos.board, color);
    const moves = pseudo(pos, color).filter(m => !inCheck(applyMove(pos, m).board, color));
    if (moves.length === 0) return inCheck(pos.board, color) ? -100000 + (3 - depth) : 0;
    let best = -Infinity;
    for (const m of moves) { const v = -negamax(applyMove(pos, m), color === "w" ? "b" : "w", depth - 1, -beta, -alpha); if (v > best) best = v; if (v > alpha) alpha = v; if (alpha >= beta) break; }
    return best;
}
export function bestMove(game, depth = 3) {
    const color = game.turn, moves = legalMoves(game, color);
    if (!moves.length) return null;
    let best = moves[0], bv = -Infinity;
    for (const m of moves) { const v = -negamax(applyMove(game, m), color === "w" ? "b" : "w", depth - 1, -Infinity, Infinity); if (v > bv) { bv = v; best = m; } }
    return best;
}

export const SYMBOL = { K: "\u2654", Q: "\u2655", R: "\u2656", B: "\u2657", N: "\u2658", P: "\u2659", k: "\u265A", q: "\u265B", r: "\u265C", b: "\u265D", n: "\u265E", p: "\u265F" };
export const sq = (i) => "abcdefgh"[i % 8] + (8 - (i / 8 | 0));
