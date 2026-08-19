// simulation/TriDChess.js — v1476 (chess r5c: Star Trek tri-dimensional chess)
// AUTHENTIC structure: three fixed 4x4 main boards (W bottom / N neutral / B top, files
// b-e, overlapping ranks) + four 2x2 attack boards on the corner pins (extending files
// to a/f and ranks to 0/9) = 64 squares total. White on ranks 0-2, Black on ranks 7-9.
// Rulesets vary widely; this uses a clean, documented PROJECTION model: pieces move by
// standard 2D chess on the (file,rank) projection over squares that EXIST, columns are
// solid for path-blocking, a destination (file,rank) may offer multiple levels (the
// move targets a specific square), and a piece may step vertically to an aligned square
// one level away. v1 SIMPLIFICATIONS (documented): attack boards are FIXED (their
// relocation/pivot is the signature mechanic, deferred); no castling / en passant
// (matching one common Tri-D ruleset). Pure + greedy-AI so it is fully node-testable.

// board -> { lvl (render height), files[], ranks[] }
const BOARDS = {
    W:   { lvl: 0, files: [1, 2, 3, 4], ranks: [1, 2, 3, 4] },
    N:   { lvl: 2, files: [1, 2, 3, 4], ranks: [3, 4, 5, 6] },
    B:   { lvl: 4, files: [1, 2, 3, 4], ranks: [5, 6, 7, 8] },
    WQL: { lvl: 1, files: [0, 1], ranks: [0, 1] },
    WKL: { lvl: 1, files: [4, 5], ranks: [0, 1] },
    BQL: { lvl: 3, files: [0, 1], ranks: [8, 9] },
    BKL: { lvl: 3, files: [4, 5], ranks: [8, 9] },
};
const sid = (board, f, r) => board + ":" + f + ":" + r;

// all squares + projection index (file,rank) -> [squareId,...]
const SQUARES = [];
const COL = new Map();
for (const [board, d] of Object.entries(BOARDS)) for (const f of d.files) for (const r of d.ranks) {
    const id = sid(board, f, r); SQUARES.push({ id, board, f, r, lvl: d.lvl });
    const k = f + "," + r; if (!COL.has(k)) COL.set(k, []); COL.get(k).push(id);
}
const SQ = new Map(SQUARES.map(s => [s.id, s]));
export const allSquares = () => SQUARES.map(s => s.id);
export const squareInfo = (id) => SQ.get(id);
const colExists = (f, r) => COL.has(f + "," + r);
const colSquares = (f, r) => COL.get(f + "," + r) || [];

export function newGame() {
    const pieces = {};   // squareId -> { t, o }  (o: "w"|"b")
    const put = (board, f, r, t, o) => { pieces[sid(board, f, r)] = { t, o }; };
    // White: main W rank1 = N B B N (files b-e), rank2 = pawns; attack boards hold R/Q/K/R + pawns
    const back = ["N", "B", "B", "N"];
    [1, 2, 3, 4].forEach((f, i) => { put("W", f, 1, back[i], "w"); put("W", f, 2, "P", "w"); });
    put("WQL", 0, 1, "R", "w"); put("WQL", 1, 1, "Q", "w"); put("WQL", 0, 0, "P", "w"); put("WQL", 1, 0, "P", "w");
    put("WKL", 4, 1, "K", "w"); put("WKL", 5, 1, "R", "w"); put("WKL", 4, 0, "P", "w"); put("WKL", 5, 0, "P", "w");
    // Black mirror on ranks 7/8 (main) and 8/9 (attack)
    [1, 2, 3, 4].forEach((f, i) => { put("B", f, 8, back[i], "b"); put("B", f, 7, "P", "b"); });
    put("BQL", 0, 8, "R", "b"); put("BQL", 1, 8, "Q", "b"); put("BQL", 0, 9, "P", "b"); put("BQL", 1, 9, "P", "b");
    put("BKL", 4, 8, "K", "b"); put("BKL", 5, 8, "R", "b"); put("BKL", 4, 9, "P", "b"); put("BKL", 5, 9, "P", "b");
    return { pieces, turn: "w", winner: null, moves: 0, log: [] };
}

const colOccupied = (g, f, r) => colSquares(f, r).some(id => g.pieces[id]);
const ROOK = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const BISH = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
const KNIGHT = [[1, 2], [2, 1], [-1, 2], [-2, 1], [1, -2], [2, -1], [-1, -2], [-2, -1]];

// pseudo-legal destination square ids for the piece on `from`
function pseudo(g, from) {
    const p = g.pieces[from]; if (!p) return [];
    const s = SQ.get(from); const out = new Set();
    const landings = (f, r) => colSquares(f, r).filter(id => { const q = g.pieces[id]; return !q || q.o !== p.o; });
    const slide = (dirs) => { for (const [df, dr] of dirs) { let f = s.f, r = s.r; for (let n = 0; n < 9; n++) { f += df; r += dr; if (!colExists(f, r)) break; if (colOccupied(g, f, r)) { for (const id of colSquares(f, r)) if (g.pieces[id] && g.pieces[id].o !== p.o) out.add(id); break; } for (const id of colSquares(f, r)) if (!g.pieces[id]) out.add(id); } } };
    const hop = (dirs) => { for (const [df, dr] of dirs) { const f = s.f + df, r = s.r + dr; if (colExists(f, r)) for (const id of landings(f, r)) out.add(id); } };
    if (p.t === "R" || p.t === "Q") slide(ROOK);
    if (p.t === "B" || p.t === "Q") slide(BISH);
    if (p.t === "N") hop(KNIGHT);
    if (p.t === "K") hop(ROOK.concat(BISH));
    if (p.t === "P") {
        const dir = p.o === "w" ? 1 : -1;
        const f1 = s.f, r1 = s.r + dir;
        if (colExists(f1, r1) && !colOccupied(g, f1, r1)) { for (const id of colSquares(f1, r1)) out.add(id); const startRank = p.o === "w" ? (s.r <= 2) : (s.r >= 7); const r2 = s.r + 2 * dir; if (startRank && colExists(f1, r2) && !colOccupied(g, f1, r2)) for (const id of colSquares(f1, r2)) out.add(id); }
        for (const df of [-1, 1]) { const cf = s.f + df, cr = s.r + dir; if (colExists(cf, cr)) for (const id of colSquares(cf, cr)) if (g.pieces[id] && g.pieces[id].o !== p.o) out.add(id); }
    }
    // vertical step: aligned square one level away (same file,rank, different board)
    for (const id of colSquares(s.f, s.r)) { if (id === from) continue; const q = g.pieces[id]; if (!q || q.o !== p.o) out.add(id); }
    return [...out];
}

function kingSquare(g, o) { for (const id in g.pieces) if (g.pieces[id].t === "K" && g.pieces[id].o === o) return id; return null; }
export function inCheck(g, o) { const ks = kingSquare(g, o); if (!ks) return false; for (const id in g.pieces) { const p = g.pieces[id]; if (p.o !== o && pseudo(g, id).includes(ks)) return true; } return false; }

function clone(g) { return { pieces: { ...g.pieces }, turn: g.turn, winner: g.winner, moves: g.moves, log: g.log }; }
function applyTo(g, from, to) {
    const ng = clone(g); const p = { ...ng.pieces[from] }; delete ng.pieces[from];
    const ts = SQ.get(to); if (p.t === "P" && ((p.o === "w" && ts.r >= 8) || (p.o === "b" && ts.r <= 1))) p.t = "Q";
    ng.pieces[to] = p; return ng;
}
export function legalMoves(g, o) {
    const res = [];
    for (const id in g.pieces) { if (g.pieces[id].o !== o) continue; for (const to of pseudo(g, id)) { const ng = applyTo(g, id, to); if (!inCheck(ng, o)) res.push({ from: id, to }); } }
    return res;
}
export function isCheckmate(g, o) { return inCheck(g, o) && legalMoves(g, o).length === 0; }

export function move(g, m) {
    if (g.winner) return false;
    const p = g.pieces[m.from]; if (!p || p.o !== g.turn) return false;
    if (!legalMoves(g, g.turn).some(x => x.from === m.from && x.to === m.to)) return false;
    const ng = applyTo(g, m.from, m.to); g.pieces = ng.pieces;
    g.log.push({ from: m.from, to: m.to, o: g.turn });
    const opp = g.turn === "w" ? "b" : "w";
    if (isCheckmate(g, opp)) g.winner = g.turn;
    g.turn = opp; g.moves++;
    return true;
}

const VAL = { P: 1, N: 3, B: 3, R: 5, Q: 9, K: 0 };
export function aiMove(g, o) {
    const moves = legalMoves(g, o); if (!moves.length) return null;
    let best = null, bestSc = -1e9;
    for (const m of moves) {
        const cap = g.pieces[m.to]; let sc = cap ? VAL[cap.t] * 10 : 0;
        const ng = applyTo(g, m.from, m.to); const opp = o === "w" ? "b" : "w";
        if (inCheck(ng, opp)) { sc += 2; const tmp = { pieces: ng.pieces, turn: opp, winner: null }; if (legalMoves(tmp, opp).length === 0) sc += 1000; }
        sc += Math.random() * 0.05;
        if (sc > bestSc) { bestSc = sc; best = m; }
    }
    return best;
}
export function applyAi(g, o) { const m = aiMove(g, o); if (!m) { g.turn = o === "w" ? "b" : "w"; return null; } move(g, m); return m; }

export const SYM = { K: "\u265A", Q: "\u265B", R: "\u265C", B: "\u265D", N: "\u265E", P: "\u265F" };
export const FILES = ["a", "b", "c", "d", "e", "f"];
