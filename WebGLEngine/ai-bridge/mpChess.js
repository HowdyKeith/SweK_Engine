// ai-bridge/mpChess.js — v1473: host-authoritative distributed chess rooms.
// The bridge owns the authoritative ChessGame per room. Two peer engines join as
// the two sides (token-identified); each submits a MOVE as its intent on its turn.
// The host validates (turn + legality via the SAME tested ChessGame engine, dynamic-
// imported from CJS) and applies it, then every peer polls /mp/chess/state to sync.
// Spectators get state but no seat. Idle rooms are pruned after 30 min.
const path = require("path");
const { pathToFileURL } = require("url");

let C = null;
async function ensureEngine() {
    if (!C) C = await import(pathToFileURL(path.join(__dirname, "..", "simulation", "ChessGame.js")).href);
    return C;
}

const ROOM_TTL = 30 * 60 * 1000;
const rooms = new Map();   // roomId -> { game, players:{w,b}, lastMove, history, updated }

function prune() { const now = Date.now(); for (const [id, r] of rooms) if (now - r.updated > ROOM_TTL) rooms.delete(id); }

async function getRoom(id) {
    await ensureEngine();
    let r = rooms.get(id);
    if (!r) { r = { game: C.newGame(), players: { w: null, b: null }, lastMove: null, history: [], updated: Date.now() }; rooms.set(id, r); }
    return r;
}

function stateOf(r) {
    return {
        board: r.game.board, turn: r.game.turn, winner: r.game.winner,
        status: C.status(r.game), moves: r.game.moves, lastMove: r.lastMove,
        castling: r.game.castling, ep: r.game.ep,
        players: { w: !!r.players.w, b: !!r.players.b },
    };
}

async function join(roomId, token, wantSide) {
    if (!token) return { ok: false, error: "missing token" };
    const r = await getRoom(roomId); r.updated = Date.now();
    let you = (r.players.w === token) ? "w" : (r.players.b === token) ? "b" : null;
    if (!you) {
        if (wantSide === "w" && !r.players.w) you = "w";
        else if (wantSide === "b" && !r.players.b) you = "b";
        else if (!wantSide || wantSide === "auto") { if (!r.players.w) you = "w"; else if (!r.players.b) you = "b"; }
        if (you) r.players[you] = token;
    }
    return Object.assign({ ok: true, you: you || "spectator", room: roomId }, stateOf(r));
}

async function leave(roomId, token) {
    const r = await getRoom(roomId); r.updated = Date.now();
    if (r.players.w === token) r.players.w = null;
    if (r.players.b === token) r.players.b = null;
    return Object.assign({ ok: true }, stateOf(r));
}

async function move(roomId, token, m) {
    const r = await getRoom(roomId); r.updated = Date.now();
    if (r.game.winner) return Object.assign({ ok: false, error: "game over" }, stateOf(r));
    const side = (r.players.w === token) ? "w" : (r.players.b === token) ? "b" : null;
    if (!side) return Object.assign({ ok: false, error: "not a seated player" }, stateOf(r));
    if (r.game.turn !== side) return Object.assign({ ok: false, error: "not your turn" }, stateOf(r));
    if (!(m && Number.isInteger(m.from) && Number.isInteger(m.to))) return Object.assign({ ok: false, error: "bad move" }, stateOf(r));
    const legal = C.legalMoves(r.game, side).some(x => x.from === m.from && x.to === m.to);
    if (!legal) return Object.assign({ ok: false, error: "illegal move" }, stateOf(r));
    C.move(r.game, { from: m.from, to: m.to, promo: m.promo || "q" });
    r.lastMove = { from: m.from, to: m.to, side, n: r.game.moves };
    r.history.push(r.lastMove);
    return Object.assign({ ok: true, side }, stateOf(r));
}

async function reset(roomId) { const r = await getRoom(roomId); r.game = C.newGame(); r.lastMove = null; r.history = []; r.updated = Date.now(); return Object.assign({ ok: true }, stateOf(r)); }
async function state(roomId) { const r = await getRoom(roomId); return Object.assign({ ok: true, room: roomId }, stateOf(r)); }
function list() { prune(); return [...rooms.entries()].map(([id, r]) => ({ id, players: { w: !!r.players.w, b: !!r.players.b }, turn: r.game.turn, winner: r.game.winner, moves: r.game.moves })); }

module.exports = { join, leave, move, reset, state, list };
