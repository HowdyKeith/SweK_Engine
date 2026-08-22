// simulation/DejarikGame.js — v1474 (chess r5 variant: Star Wars Dejarik / holochess)
// Authentic board: 25 spaces over 3 concentric rings — outer ring (12), middle ring
// (12), single center (1). Moves go along a ring or radially between rings, never
// diagonally. Eight holochess creatures; combat is HP-based (monsters whittle each
// other down). No single official ruleset exists, so this is a clean playable fan-style
// set: one action (move OR attack) per turn, eliminate the opponent's creatures to win.
// Pure + deterministic-AI so it is fully node-testable.

// cell indices: 0..11 outer ring, 12..23 middle ring, 24 center
const ADJ = [];
for (let i = 0; i < 12; i++) ADJ[i] = [(i + 11) % 12, (i + 1) % 12, 12 + i];              // outer: ring neighbours + radial in
for (let i = 0; i < 12; i++) ADJ[12 + i] = [12 + (i + 11) % 12, 12 + (i + 1) % 12, i, 24]; // middle: ring + radial out + center
ADJ[24] = []; for (let i = 0; i < 12; i++) ADJ[24].push(12 + i);                            // center touches all middle cells

// the eight creatures (hp / attack / defense / move-rating)
const STATS = {
    savrip:  { name: "Mantellian Savrip", hp: 6, atk: 4, def: 3, move: 1 },
    molator: { name: "Molator",           hp: 5, atk: 4, def: 2, move: 1 },
    ngok:    { name: "Ng'ok",             hp: 6, atk: 2, def: 4, move: 1 },
    monnok:  { name: "Monnok",            hp: 4, atk: 3, def: 2, move: 2 },
    houjix:  { name: "Houjix",            hp: 4, atk: 3, def: 3, move: 2 },
    kintan:  { name: "Kintan Strider",    hp: 3, atk: 3, def: 1, move: 2 },
    ghhhk:   { name: "Ghhhk",             hp: 3, atk: 2, def: 2, move: 2 },
    klorslug:{ name: "K'lor'slug",        hp: 2, atk: 2, def: 1, move: 3 },
};
const ROSTER = { a: ["savrip", "houjix", "monnok", "klorslug"], b: ["molator", "ngok", "kintan", "ghhhk"] };

export const TYPES = STATS;
export const adjacency = (c) => ADJ[c].slice();
export const cellRing = (c) => (c === 24 ? "center" : c < 12 ? "outer" : "middle");

function mk(type, side) { const s = STATS[type]; return { type, side, hp: s.hp, maxHp: s.hp }; }

export function newGame() {
    const board = new Array(25).fill(null);
    const aCells = [0, 1, 2, 3], bCells = [6, 7, 8, 9];
    ROSTER.a.forEach((t, i) => board[aCells[i]] = mk(t, "a"));
    ROSTER.b.forEach((t, i) => board[bCells[i]] = mk(t, "b"));
    return { board, turn: "a", winner: null, moves: 0, log: [] };
}

// cells reachable in EXACTLY `steps` moves through empty cells (Dejarik moves the full rating)
export function reachableExact(board, start, steps) {
    let frontier = new Set([start]);
    for (let d = 0; d < steps; d++) {
        const next = new Set();
        for (const c of frontier) for (const nb of ADJ[c]) { if (nb === start) continue; if (board[nb]) continue; next.add(nb); }
        frontier = next;
    }
    frontier.delete(start);
    return [...frontier];
}
export function legalMoves(game, cell) { const p = game.board[cell]; if (!p) return []; return reachableExact(game.board, cell, STATS[p.type].move); }
export function attackTargets(game, cell) { const p = game.board[cell]; if (!p) return []; return ADJ[cell].filter(nb => game.board[nb] && game.board[nb].side !== p.side); }

function countSide(board, side) { let n = 0; for (const c of board) if (c && c.side === side) n++; return n; }
function checkWinner(game) { const a = countSide(game.board, "a"), b = countSide(game.board, "b"); if (a === 0) game.winner = "b"; else if (b === 0) game.winner = "a"; }
function endTurn(game) { game.turn = game.turn === "a" ? "b" : "a"; game.moves++; checkWinner(game); }

export function doMove(game, from, to) {
    if (game.winner) return false;
    const p = game.board[from]; if (!p || p.side !== game.turn) return false;
    if (!reachableExact(game.board, from, STATS[p.type].move).includes(to)) return false;
    game.board[to] = p; game.board[from] = null;
    game.log.push({ kind: "move", type: p.type, from, to });
    endTurn(game); return true;
}
export function doAttack(game, from, to) {
    if (game.winner) return false;
    const a = game.board[from], d = game.board[to];
    if (!a || a.side !== game.turn || !d || d.side === a.side) return false;
    if (!ADJ[from].includes(to)) return false;
    const dmg = Math.max(1, STATS[a.type].atk - STATS[d.type].def);
    d.hp -= dmg;
    const killed = d.hp <= 0; if (killed) game.board[to] = null;
    game.log.push({ kind: "attack", from, to, dmg, killed, atk: a.type, def: d.type });
    endTurn(game); return true;
}

// graph distance ignoring occupancy (for AI advance)
function dist(from, to) {
    if (from === to) return 0;
    const seen = new Set([from]); let frontier = [from], d = 0;
    while (frontier.length) {
        d++; const next = [];
        for (const c of frontier) for (const nb of ADJ[c]) { if (nb === to) return d; if (!seen.has(nb)) { seen.add(nb); next.push(nb); } }
        frontier = next; if (d > 30) break;
    }
    return 99;
}

// deterministic greedy AI: best favourable attack, else advance toward nearest enemy
export function aiAction(game, side) {
    if (game.winner) return null;
    const mine = []; for (let c = 0; c < 25; c++) if (game.board[c] && game.board[c].side === side) mine.push(c);
    let bestAtk = null, bestScore = -1;
    for (const c of mine) for (const t of attackTargets(game, c)) {
        const a = game.board[c], d = game.board[t];
        const dmg = Math.max(1, STATS[a.type].atk - STATS[d.type].def);
        const score = dmg + (dmg >= d.hp ? 20 : 0);
        if (score > bestScore) { bestScore = score; bestAtk = { type: "attack", from: c, to: t }; }
    }
    if (bestAtk) return bestAtk;
    const enemies = []; for (let c = 0; c < 25; c++) if (game.board[c] && game.board[c].side !== side) enemies.push(c);
    let bestMove = null, bestDist = 1e9;
    for (const c of mine) for (const to of legalMoves(game, c)) {
        let nd = 1e9; for (const e of enemies) nd = Math.min(nd, dist(to, e));
        if (nd < bestDist) { bestDist = nd; bestMove = { type: "move", from: c, to }; }
    }
    return bestMove;
}
export function applyAi(game, side) { const a = aiAction(game, side); if (!a) { endTurn(game); return null; } if (a.type === "attack") doAttack(game, a.from, a.to); else doMove(game, a.from, a.to); return a; }
export function statName(type) { return STATS[type] ? STATS[type].name : type; }
