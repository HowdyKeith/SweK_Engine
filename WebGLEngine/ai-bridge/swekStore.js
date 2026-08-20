// swekStore.js -- SQLite-backed persistence for the SweK server: pilot files + a co-op room registry.
// Prefers better-sqlite3 (if installed) and falls back to Node's built-in node:sqlite (Node 22.5+). Both
// expose the same prepare().run/get/all + exec API, so the store code below is identical either way and needs
// no native build on a modern Node. The DB lives next to the rest of the SweK state in ~/.voxelbridge.
"use strict";
const path = require("path");
const os = require("os");
const fs = require("fs");

function openDb(file) {
    try { const Database = require("better-sqlite3"); return { db: new Database(file), kind: "better-sqlite3" }; }
    catch (_) { /* not installed -- use the built-in */ }
    const { DatabaseSync } = require("node:sqlite");
    return { db: new DatabaseSync(file, { allowExtension: true }), kind: "node:sqlite" };   // allowExtension: for optional sqlite-vec RAG
}

// Load the sqlite-vec extension if the npm package is present. Returns true on success. Optional: without it,
// the leaderboard + pilots + rooms all still work; only the /swek/rag/* routes go dark.
function loadVec(db, kind) {
    let sv; try { sv = require("sqlite-vec"); } catch (_) { return false; }
    try {
        try { if (db.enableLoadExtension) db.enableLoadExtension(true); } catch (_) {}
        if (kind === "better-sqlite3" && typeof sv.load === "function") sv.load(db);
        else db.loadExtension(sv.getLoadablePath());
        return true;
    } catch (_) { return false; }
}

function createStore(opts = {}) {
    const dir = opts.dir || path.join(os.homedir(), ".voxelbridge");
    try { fs.mkdirSync(dir, { recursive: true }); } catch (_) {}
    const file = opts.file || path.join(dir, "swek.db");
    const { db, kind } = openDb(file);
    db.exec(`
      CREATE TABLE IF NOT EXISTS pilots (
        name TEXT PRIMARY KEY, blob TEXT NOT NULL, credits INTEGER, ship TEXT, updated_at INTEGER
      );
      CREATE TABLE IF NOT EXISTS rooms (
        id TEXT PRIMARY KEY, manifest TEXT, fingerprint TEXT, host TEXT, players INTEGER, updated_at INTEGER
      );
      CREATE TABLE IF NOT EXISTS scores (
        name TEXT PRIMARY KEY, combat_rating INTEGER DEFAULT 0, kills INTEGER DEFAULT 0, credits INTEGER DEFAULT 0, updated_at INTEGER
      );
      CREATE TABLE IF NOT EXISTS rag_meta (k TEXT PRIMARY KEY, v TEXT);
    `);

    // Optional local-RAG: load sqlite-vec if installed; the vec table's dimension is fixed by the first
    // vector added (stored in rag_meta so it survives restarts). Everything else works whether or not this loads.
    let ragReady = loadVec(db, kind), ragDim = 0;
    if (ragReady) {
        try { const r = db.prepare("SELECT v FROM rag_meta WHERE k='dim'").get(); ragDim = r ? (+r.v || 0) : 0; if (ragDim) db.exec(`CREATE VIRTUAL TABLE IF NOT EXISTS vec_docs USING vec0(id TEXT PRIMARY KEY, +text TEXT, embedding float[${ragDim}])`); }
        catch (_) { ragReady = false; }
    }
    // The embedder: text -> unit vector. Defaults to embedModel.js (real MiniLM when transformers.js is
    // installed, else the hashing embedder); a caller can still inject one via opts.embed. It may be async
    // (MiniLM is), so callers await it. RAG stays embedder-agnostic; this just lets /swek/rag/* + /swek/embed
    // accept plain text.
    const embedFn = (opts.embed && typeof opts.embed === "function") ? opts.embed : require("./embedModel").embed;

    const upsertPilot = db.prepare(`INSERT INTO pilots (name, blob, credits, ship, updated_at) VALUES (?,?,?,?,?)
      ON CONFLICT(name) DO UPDATE SET blob=excluded.blob, credits=excluded.credits, ship=excluded.ship, updated_at=excluded.updated_at`);
    const getPilotQ = db.prepare(`SELECT blob FROM pilots WHERE name=?`);
    const listPilotsQ = db.prepare(`SELECT name, credits, ship, updated_at FROM pilots ORDER BY updated_at DESC`);
    const delPilotQ = db.prepare(`DELETE FROM pilots WHERE name=?`);

    const upsertRoom = db.prepare(`INSERT INTO rooms (id, manifest, fingerprint, host, players, updated_at) VALUES (?,?,?,?,?,?)
      ON CONFLICT(id) DO UPDATE SET manifest=excluded.manifest, fingerprint=excluded.fingerprint, host=excluded.host, players=excluded.players, updated_at=excluded.updated_at`);
    const listRoomsQ = db.prepare(`SELECT id, manifest, fingerprint, host, players, updated_at FROM rooms WHERE updated_at > ? ORDER BY updated_at DESC`);
    const getRoomQ = db.prepare(`SELECT id, manifest, fingerprint, host, players, updated_at FROM rooms WHERE id=?`);
    const pruneRoomsQ = db.prepare(`DELETE FROM rooms WHERE updated_at < ?`);

    const upsertScore = db.prepare(`INSERT INTO scores (name, combat_rating, kills, credits, updated_at) VALUES (?,?,?,?,?)
      ON CONFLICT(name) DO UPDATE SET combat_rating=MAX(scores.combat_rating, excluded.combat_rating), kills=MAX(scores.kills, excluded.kills), credits=excluded.credits, updated_at=excluded.updated_at`);
    const lbByRating = db.prepare(`SELECT name, combat_rating, kills, credits FROM scores ORDER BY combat_rating DESC, kills DESC LIMIT ?`);
    const lbByKills = db.prepare(`SELECT name, combat_rating, kills, credits FROM scores ORDER BY kills DESC, combat_rating DESC LIMIT ?`);
    const lbByCredits = db.prepare(`SELECT name, combat_rating, kills, credits FROM scores ORDER BY credits DESC LIMIT ?`);

    function roomRow(r) { let manifest = null; try { manifest = r.manifest ? JSON.parse(r.manifest) : null; } catch (_) {} return { id: r.id, manifest, fingerprint: r.fingerprint, host: r.host, players: r.players, updatedAt: r.updated_at }; }

    return {
        kind, file,
        // ---- pilots ----
        savePilot(name, blob) {
            if (!name || blob == null) return false;
            const b = typeof blob === "string" ? blob : JSON.stringify(blob);
            let credits = 0, ship = null; try { const o = JSON.parse(b); credits = o.credits | 0; ship = o.shipName || null; } catch (_) {}
            upsertPilot.run(String(name), b, credits, ship, Date.now()); return true;
        },
        loadPilot(name) { const r = getPilotQ.get(String(name)); if (!r) return null; try { return JSON.parse(r.blob); } catch (_) { return null; } },
        listPilots() { return listPilotsQ.all().map((r) => ({ name: r.name, credits: r.credits, shipName: r.ship, savedAt: r.updated_at })); },
        deletePilot(name) { delPilotQ.run(String(name)); return true; },
        // ---- room registry ----
        registerRoom(id, manifest, meta = {}) {
            if (!id) return false;
            const m = manifest == null ? null : (typeof manifest === "string" ? manifest : JSON.stringify(manifest));
            upsertRoom.run(String(id), m, meta.fingerprint || null, meta.host || null, meta.players | 0, Date.now()); return true;
        },
        listRooms(maxAgeMs = 60000) { return listRoomsQ.all(Date.now() - maxAgeMs).map(roomRow); },
        getRoom(id) { const r = getRoomQ.get(String(id)); return r ? roomRow(r) : null; },
        pruneRooms(maxAgeMs = 300000) { pruneRoomsQ.run(Date.now() - maxAgeMs); },
        // ---- leaderboard ----
        submitScore(name, s = {}) { if (!name) return false; upsertScore.run(String(name), s.combatRating | 0, s.kills | 0, s.credits | 0, Date.now()); return true; },
        leaderboard(by = "rating", limit = 20) {
            limit = Math.min(100, Math.max(1, (limit | 0) || 20));
            const q = by === "kills" ? lbByKills : (by === "credits" ? lbByCredits : lbByRating);
            return q.all(limit).map((r) => ({ name: r.name, combatRating: r.combat_rating, kills: r.kills, credits: r.credits }));
        },
        // ---- embedder (text -> unit vector; may be async when a real model is active) ----
        embed(text) { return embedFn(text); },
        // ---- local RAG (sqlite-vec); embeddings come from the caller's model, storage + KNN live here ----
        ragInfo() { return { ready: ragReady, dim: ragDim }; },
        ragUpsert(id, text, embedding) {
            if (!ragReady) return { ok: false, why: "sqlite-vec not installed" };
            if (!id || !Array.isArray(embedding) || !embedding.length) return { ok: false, why: "id + embedding required" };
            if (!ragDim) { ragDim = embedding.length; db.exec(`CREATE VIRTUAL TABLE IF NOT EXISTS vec_docs USING vec0(id TEXT PRIMARY KEY, +text TEXT, embedding float[${ragDim}])`); db.prepare("INSERT OR REPLACE INTO rag_meta(k,v) VALUES('dim',?)").run(String(ragDim)); }
            if (embedding.length !== ragDim) return { ok: false, why: "dim mismatch: table is " + ragDim };
            const buf = new Uint8Array(new Float32Array(embedding).buffer);
            db.prepare("DELETE FROM vec_docs WHERE id=?").run(String(id));
            db.prepare("INSERT INTO vec_docs(id, text, embedding) VALUES (?,?,?)").run(String(id), String(text || ""), buf);
            return { ok: true, dim: ragDim };
        },
        ragSearch(embedding, k = 5) {
            if (!ragReady || !ragDim || !Array.isArray(embedding) || embedding.length !== ragDim) return [];
            const buf = new Uint8Array(new Float32Array(embedding).buffer);
            return db.prepare("SELECT id, text, distance FROM vec_docs WHERE embedding MATCH ? ORDER BY distance LIMIT ?").all(buf, Math.min(50, Math.max(1, (k | 0) || 5)));
        },
        close() { try { db.close(); } catch (_) {} },
    };
}

module.exports = { createStore, openDb, handleRequest };

// A self-contained router for the SweK server: returns true if it handled the request (any /swek/* path),
// false otherwise so the server keeps matching its own routes. Kept here so server.js needs one insertion.
//   GET  /swek/pilots            -> { ok, pilots:[{name,credits,shipName,savedAt}] }
//   GET  /swek/pilot?name=       -> { ok, pilot }          POST /swek/pilot { name, blob }   DELETE /swek/pilot?name=
//   GET  /swek/rooms             -> { ok, rooms:[...] }     GET /swek/room?id=  -> { ok, room }
//   POST /swek/room { id, manifest, fingerprint, host, players }   (register / heartbeat)
function handleRequest(req, res, store) {
    let u; try { u = new URL(req.url, "http://localhost"); } catch (_) { return false; }
    const pth = u.pathname;
    if (!pth.startsWith("/swek/") || !store) return false;
    const send = (obj, code = 200) => { const b = Buffer.from(JSON.stringify(obj)); res.writeHead(code, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }); res.end(b); };
    const readBody = (cb) => { let d = ""; req.on("data", (c) => { d += c; if (d.length > 4e6) req.destroy(); }); req.on("end", () => cb(d)); };
    if (req.method === "OPTIONS") { res.writeHead(204, { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET,POST,DELETE,OPTIONS", "Access-Control-Allow-Headers": "Content-Type" }); res.end(); return true; }
    try {
        if (pth === "/swek/pilots" && req.method === "GET") { send({ ok: true, pilots: store.listPilots() }); return true; }
        if (pth === "/swek/pilot" && req.method === "GET") { const name = u.searchParams.get("name"); const p = name ? store.loadPilot(name) : null; send({ ok: !!p, pilot: p }); return true; }
        if (pth === "/swek/pilot" && req.method === "POST") { readBody((d) => { try { const o = JSON.parse(d || "{}"); if (!o.name) return send({ ok: false, why: "name required" }, 400); store.savePilot(o.name, o.blob != null ? o.blob : o); send({ ok: true }); } catch (e) { send({ ok: false, why: "bad body" }, 400); } }); return true; }
        if (pth === "/swek/pilot" && req.method === "DELETE") { const name = u.searchParams.get("name"); if (name) store.deletePilot(name); send({ ok: true }); return true; }
        if (pth === "/swek/rooms" && req.method === "GET") { store.pruneRooms(); send({ ok: true, rooms: store.listRooms() }); return true; }
        if (pth === "/swek/room" && req.method === "GET") { const id = u.searchParams.get("id"); send({ ok: true, room: id ? store.getRoom(id) : null }); return true; }
        if (pth === "/swek/room" && req.method === "POST") { readBody((d) => { try { const o = JSON.parse(d || "{}"); if (!o.id) return send({ ok: false, why: "id required" }, 400); store.registerRoom(o.id, o.manifest, o); send({ ok: true }); } catch (e) { send({ ok: false, why: "bad body" }, 400); } }); return true; }
        if (pth === "/swek/score" && req.method === "POST") { readBody((d) => { try { const o = JSON.parse(d || "{}"); if (!o.name) return send({ ok: false, why: "name required" }, 400); store.submitScore(o.name, o); send({ ok: true }); } catch (e) { send({ ok: false, why: "bad body" }, 400); } }); return true; }
        if (pth === "/swek/leaderboard" && req.method === "GET") { send({ ok: true, by: u.searchParams.get("by") || "rating", leaderboard: store.leaderboard(u.searchParams.get("by") || "rating", +u.searchParams.get("limit") || 20) }); return true; }
        if (pth === "/swek/status" && req.method === "GET") { let em = null; try { em = require("./embedModel").info(); } catch (_) {} send({ ok: true, store: store.kind, rag: store.ragInfo(), embed: em }); return true; }
        if (pth === "/swek/embed" && req.method === "POST") { readBody(async (d) => { try { const o = JSON.parse(d || "{}"); send({ ok: true, embedding: await store.embed(o.text || "") }); } catch (e) { send({ ok: false, why: "bad body" }, 400); } }); return true; }
        if (pth === "/swek/rag/add" && req.method === "POST") { readBody(async (d) => { try { const o = JSON.parse(d || "{}");
            if (Array.isArray(o.docs)) { let added = 0; for (const doc of o.docs) { if (!doc || !doc.id) continue; const e = Array.isArray(doc.embedding) ? doc.embedding : await store.embed(doc.text || ""); if (store.ragUpsert(doc.id, doc.text, e).ok) added++; } send({ ok: true, added }); return; }
            const emb = Array.isArray(o.embedding) ? o.embedding : await store.embed(o.text || ""); const r = store.ragUpsert(o.id, o.text, emb); send(r, r.ok ? 200 : 400); } catch (e) { send({ ok: false, why: "bad body" }, 400); } }); return true; }
        if (pth === "/swek/rag/search" && req.method === "POST") { readBody(async (d) => { try { const o = JSON.parse(d || "{}"); const emb = Array.isArray(o.embedding) ? o.embedding : await store.embed(o.query || o.text || ""); send({ ok: true, results: store.ragSearch(emb, o.k || 5) }); } catch (e) { send({ ok: false, why: "bad body" }, 400); } }); return true; }
        // Only 405 for a route WE own that was hit with the wrong method. Any other /swek/* path (notably the
        // pre-existing /swek/chat/*) is NOT ours -- return false so the server routes it normally. v2331: the
        // old `startsWith("/swek/")` catch-all hijacked /swek/chat/poll|in|blob and 405'd the whole chat system.
        const OURS = new Set(["/swek/pilot", "/swek/pilots", "/swek/room", "/swek/rooms", "/swek/score", "/swek/leaderboard", "/swek/status", "/swek/embed", "/swek/rag/add", "/swek/rag/search"]);
        if (OURS.has(pth)) { send({ ok: false, why: "method not allowed" }, 405); return true; }
    } catch (e) { send({ ok: false, why: String((e && e.message) || e) }, 500); return true; }
    return false;
}
