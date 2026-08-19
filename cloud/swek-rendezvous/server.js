"use strict";
/*
 * SweK Engine — cloud rendezvous + WebRTC signaling + shared-room server.
 *
 * One small, dependency-free Node server that runs UNCHANGED on either:
 *   (1) Google Cloud Run  — containerized, scales to zero, listens on $PORT (8080).
 *   (2) An always-free e2-micro VM — `node server.js`, listens on $PORT or 8787.
 * Run it with a SINGLE instance (Cloud Run: --min-instances=1 --max-instances=1) because state is in-memory.
 *
 * What it does, and why each piece stays inside the ~1 GB/month free egress (all tiny JSON):
 *   - DIRECTORY  : engine boxes + admin clients POST /register to announce { id, name, kind }; GET /directory
 *                  lists everyone seen in the last MAX_AGE. This is how off-LAN peers/users find each other.
 *   - SIGNALING  : POST /signal queues a WebRTC SDP/ICE message for a target; GET /signal?id=ME drains mine.
 *                  Used only at connection setup — the actual media/data then flows peer-to-peer (WebRTC),
 *                  NOT through this server, so it costs ~nothing.
 *   - ROOM       : a tiny shared key-value store (POST/GET /room/:id) so cross-network shared state — e.g. the
 *                  PetFBI posting board's claim/posted/live status — has one home every remote admin can reach.
 *
 * AUTH: a single shared token in env SWEK_TOKEN. Clients send it as ?token= or `Authorization: Bearer <t>`.
 *       If SWEK_TOKEN is unset the server runs OPEN and logs a warning — set it before exposing publicly.
 */

const http = require("http");
const fs = require("fs"), path = require("path");
const PORT = process.env.PORT || process.env.SWEK_PORT || 8787;
const TOKEN = process.env.SWEK_TOKEN || "";
const MAX_AGE = 60 * 1000;          // a registration older than this drops out of the directory
const MSG_TTL = 90 * 1000;          // undelivered signaling messages expire after this
const ROOM_MAX = 256 * 1024;        // cap a room's JSON at 256 KB

const dir = new Map();              // id -> { id, name, kind, lastSeen, ip }
const boxes = new Map();            // id -> [ { from, kind, data, ts } ]   (signaling mailbox)
const rooms = new Map();            // roomId -> { value, rev, updated }
const announces = new Map();        // channel -> [ { ann, ts } ]   (cross-network announce fan-out)
const ANN_TTL = 5 * 60 * 1000;      // a relayed announce is pollable for this long
const ANN_MAX = 60;                 // ring size per channel
// v1624 — short-lived public image relay so a remote peer's cast device (which can't reach the sender's LAN) can
// fetch an image over HTTP. POST /blob stores base64 bytes; GET /blob/<id> serves them (public, unguessable id).
const blobs = new Map();            // id -> { buf, type, exp }
const BLOB_TTL = 15 * 60 * 1000;    // a relayed image is fetchable for 15 min
const BLOB_MAX = 3 * 1024 * 1024;   // cap a single image at 3 MB

function now() { return Date.now(); }
function authed(req, u) {
    if (!TOKEN) return true;                                   // open mode (warned at boot)
    const q = u.searchParams.get("token");
    if (q && q === TOKEN) return true;
    const h = req.headers["authorization"] || "";
    return h === "Bearer " + TOKEN;
}
function body(req) {
    return new Promise((resolve) => {
        let d = "", n = 0;
        req.on("data", (c) => { n += c.length; if (n > ROOM_MAX) { try { req.destroy(); } catch {} return; } d += c; });
        req.on("end", () => { try { resolve(d ? JSON.parse(d) : {}); } catch { resolve(null); } });
        req.on("error", () => resolve(null));
    });
}
function bodyCap(req, cap) {
    return new Promise((resolve) => {
        let d = "", n = 0, over = false;
        req.on("data", (c) => { n += c.length; if (n > cap) { over = true; try { req.destroy(); } catch {} return; } d += c; });
        req.on("end", () => { if (over) return resolve(null); try { resolve(d ? JSON.parse(d) : {}); } catch { resolve(null); } });
        req.on("error", () => resolve(null));
    });
}

// --- EV presence: per-room live pilot positions. Tiny JSON, short TTL. Peers POST their state and poll for others.
//     This is a light relay; for always-on use prefer WebRTC P2P over /signal so the cloud only brokers. ---
const presence = new Map();         // room -> Map(id -> { packet, ts })
const PRESENCE_TTL = 8 * 1000;      // a pilot drops out of a room this long after their last update
const events = new Map();            // room -> { seq, list:[ { seq, ts, ev } ] }  -- transient combat event bus
const EVENT_TTL = 4 * 1000;          // events older than this are dropped (combat shots are very short-lived)
const EVENT_MAX = 256;               // hard cap on a room's event ring
function send(res, code, obj) {
    const s = JSON.stringify(obj);
    res.writeHead(code, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "Content-Type, Authorization", "Access-Control-Allow-Methods": "GET, POST, OPTIONS" });
    res.end(s);
}
// v1626 — optional persistence for the room store (the PetFBI board lives here). Directory / signaling / announce
// are heartbeat/TTL-transient and rebuild on their own, so only rooms are worth saving. On an e2-micro (persistent
// disk) this survives restarts as-is; on Cloud Run the container FS is ephemeral, so point SWEK_STATE_DIR at a
// mounted volume to persist there. Writes are debounced + atomic (temp file + rename); SIGTERM flushes on shutdown.
const STATE_DIR = process.env.SWEK_STATE_DIR || __dirname;
const STATE_FILE = path.join(STATE_DIR, "rendezvous-state.json");
let _saveTimer = null, _dirty = false;
function loadState() {
    try {
        if (!fs.existsSync(STATE_FILE)) return;
        const j = JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
        if (j && Array.isArray(j.rooms)) { for (const [id, r] of j.rooms) if (id && r) rooms.set(id, r); console.log("[swek-rendezvous] restored " + rooms.size + " room(s) from " + STATE_FILE); }
    } catch (e) { console.warn("[swek-rendezvous] state load failed:", e && e.message); }
}
function saveStateNow() {
    _dirty = false;
    try { const tmp = STATE_FILE + ".tmp"; fs.writeFileSync(tmp, JSON.stringify({ rooms: [...rooms.entries()], savedAt: now() })); fs.renameSync(tmp, STATE_FILE); }
    catch (e) { console.warn("[swek-rendezvous] state save failed:", e && e.message); }
}
function scheduleSave() { _dirty = true; if (_saveTimer) return; _saveTimer = setTimeout(() => { _saveTimer = null; if (_dirty) saveStateNow(); }, 1500); if (_saveTimer.unref) _saveTimer.unref(); }
function directoryList() {
    const t = now(), out = [];
    for (const [id, e] of dir) { if (t - e.lastSeen > MAX_AGE) { dir.delete(id); continue; } out.push({ id: e.id, name: e.name, kind: e.kind, lastSeen: e.lastSeen }); }
    return out;
}
function pruneMail() {
    const t = now();
    for (const [id, q] of boxes) { const kept = q.filter((m) => t - m.ts < MSG_TTL); if (kept.length) boxes.set(id, kept); else boxes.delete(id); }
}

const server = http.createServer(async (req, res) => {
    let u; try { u = new URL(req.url, "http://x"); } catch { return send(res, 400, { ok: false, error: "bad url" }); }
    const p = u.pathname.replace(/\/+$/, "") || "/";
    const ip = (req.headers["x-forwarded-for"] || req.socket.remoteAddress || "").toString().split(",")[0].trim();

    if (req.method === "OPTIONS") { res.writeHead(204, { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "Content-Type, Authorization", "Access-Control-Allow-Methods": "GET, POST, OPTIONS" }); return res.end(); }
    if (p === "/health" || p === "/") return send(res, 200, { ok: true, service: "swek-rendezvous", peers: directoryList().length, auth: !!TOKEN });
    // PetFBI posting board UI — a static page; it prompts for the token itself, then uses /room with it.
    if (p === "/board") {
        try { const html = fs.readFileSync(path.join(__dirname, "board.html")); res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Access-Control-Allow-Origin": "*" }); return res.end(html); }
        catch { return send(res, 404, { ok: false, error: "board.html not found" }); }
    }
    // v1624 — serve a relayed image (PUBLIC: a remote cast device fetches it with no token; the id is random).
    if (req.method === "GET" && p.startsWith("/blob/")) {
        const id = p.slice("/blob/".length);
        const b = blobs.get(id);
        if (!b || b.exp < now()) { blobs.delete(id); res.writeHead(404, { "Access-Control-Allow-Origin": "*" }); return res.end("not found"); }
        res.writeHead(200, { "Content-Type": b.type || "image/jpeg", "Content-Length": b.buf.length, "Cache-Control": "no-store", "Access-Control-Allow-Origin": "*" });
        return res.end(b.buf);
    }

    if (!authed(req, u)) return send(res, 401, { ok: false, error: "bad or missing token" });

    // --- DIRECTORY ---------------------------------------------------------
    if (p === "/register" && req.method === "POST") {
        const b = await body(req); if (!b || !b.id) return send(res, 400, { ok: false, error: "id required" });
        dir.set(String(b.id), { id: String(b.id), name: String(b.name || "").slice(0, 64), kind: String(b.kind || "engine").slice(0, 24), lastSeen: now(), ip });
        return send(res, 200, { ok: true, peers: directoryList() });
    }
    if (p === "/directory" && req.method === "GET") return send(res, 200, { ok: true, peers: directoryList() });

    // --- EV PRESENCE ROOM ------------------------------------------------------------------------
    // POST /presence?room=R  body { type:"presence"|"leave", id, ... }  -> store/remove this pilot's state.
    // GET  /presence?room=R&id=ME                                       -> { peers:[ ...others fresh in room ] }.
    // GET /presence/all  -> every room's fresh pilots, for an admin spectator map. Read-only; prunes stale on read.
    if (p === "/presence/all" && req.method === "GET") {
        const t = now(), out = {}; let total = 0;
        for (const [room, r] of presence) {
            const list = [];
            for (const [id, v] of r) { if (t - v.ts > PRESENCE_TTL) { r.delete(id); continue; } list.push(v.packet); }
            if (list.length) { out[room] = list; total += list.length; } else presence.delete(room);
        }
        return send(res, 200, { ok: true, rooms: out, total });
    }
    if (p === "/presence") {
        const room = String(u.searchParams.get("room") || "default").slice(0, 64);
        let r = presence.get(room); if (!r) { r = new Map(); presence.set(room, r); }
        if (req.method === "POST") {
            const b = await body(req); if (!b || b.id == null) return send(res, 400, { ok: false, error: "id required" });
            const id = String(b.id);
            if (b.type === "leave") r.delete(id);
            else { b.id = id; r.set(id, { packet: b, ts: now() }); }
            return send(res, 200, { ok: true });
        }
        if (req.method === "GET") {
            const me = String(u.searchParams.get("id") || ""), t = now(), peers = [];
            for (const [id, v] of r) { if (t - v.ts > PRESENCE_TTL) { r.delete(id); continue; } if (id !== me) peers.push(v.packet); }
            return send(res, 200, { ok: true, peers });
        }
    }

    // POST /event?room=R  body { events:[ {...} ] }  -> append to the room's event ring (each gets a seq + ts).
    // GET  /event?room=R&since=SEQ                    -> { events:[ ...seq > since ], seq:<latest> }.
    if (p === "/event") {
        const room = String(u.searchParams.get("room") || "default").slice(0, 64);
        let e = events.get(room); if (!e) { e = { seq: 0, list: [] }; events.set(room, e); }
        const t = now();
        if (req.method === "POST") {
            const b = await body(req); const arr = (b && Array.isArray(b.events)) ? b.events : (b && b.ev ? [b.ev] : []);
            for (const ev of arr.slice(0, 64)) { if (ev && typeof ev === "object") e.list.push({ seq: ++e.seq, ts: t, ev }); }
            while (e.list.length && (e.list.length > EVENT_MAX || t - e.list[0].ts > EVENT_TTL)) e.list.shift();
            if (!e.list.length && e.seq > 1e9) e.seq = 0;
            return send(res, 200, { ok: true, seq: e.seq });
        }
        if (req.method === "GET") {
            const since = parseInt(u.searchParams.get("since") || "0", 10) || 0;
            while (e.list.length && t - e.list[0].ts > EVENT_TTL) e.list.shift();
            const out = []; for (const it of e.list) if (it.seq > since) out.push(it.ev);
            if (!e.list.length) events.delete(room);
            return send(res, 200, { ok: true, events: out, seq: e.seq });
        }
    }

    // --- IMAGE RELAY (cross-network art-to-frame) -------------------------------------------------
    // POST /blob { data: base64, type? }  -> stores the image, returns { id, url } (a public, TTL'd fetch URL).
    if (p === "/blob" && req.method === "POST") {
        const b = await bodyCap(req, BLOB_MAX + 64 * 1024); if (!b || !b.data) return send(res, 400, { ok: false, error: "data (base64) required" });
        let buf; try { buf = Buffer.from(String(b.data), "base64"); } catch { buf = null; }
        if (!buf || !buf.length) return send(res, 400, { ok: false, error: "bad base64" });
        if (buf.length > BLOB_MAX) return send(res, 413, { ok: false, error: "image too large" });
        const id = (now().toString(36) + Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 6));
        blobs.set(id, { buf, type: String(b.type || "image/jpeg").slice(0, 40), exp: now() + BLOB_TTL });
        const proto = (req.headers["x-forwarded-proto"] || "http").split(",")[0].trim();   // Cloud Run terminates TLS -> public URL is https
        const base = proto + "://" + (req.headers["host"] || ("localhost:" + PORT));
        return send(res, 200, { ok: true, id, url: base + "/blob/" + id, expiresInMs: BLOB_TTL });
    }

    // --- WEBRTC SIGNALING (mailbox) ---------------------------------------
    if (p === "/signal" && req.method === "POST") {
        const b = await body(req); if (!b || !b.to) return send(res, 400, { ok: false, error: "to required" });
        const q = boxes.get(String(b.to)) || []; q.push({ from: String(b.from || ""), kind: String(b.kind || "sdp"), data: b.data, ts: now() });
        boxes.set(String(b.to), q); return send(res, 200, { ok: true });
    }
    if (p === "/signal" && req.method === "GET") {
        const id = u.searchParams.get("id"); if (!id) return send(res, 400, { ok: false, error: "id required" });
        pruneMail(); const q = boxes.get(String(id)) || []; boxes.delete(String(id));
        return send(res, 200, { ok: true, msgs: q });
    }

    // --- ANNOUNCE RELAY (cross-network disk/peer alerts -> remote avatar cameo) -------------------
    // POST /announce { channel?, ann }  -> appends to the channel ring.
    // GET  /announce?channel=&since=ts  -> returns relayed announces newer than `since` (TTL-bounded).
    if (p === "/announce" && req.method === "POST") {
        const b = await body(req); if (!b || !b.ann) return send(res, 400, { ok: false, error: "ann required" });
        const ch = String(b.channel || "main").slice(0, 64);
        const list = announces.get(ch) || []; list.push({ ann: b.ann, ts: now() }); while (list.length > ANN_MAX) list.shift();
        announces.set(ch, list); return send(res, 200, { ok: true });
    }
    if (p === "/announce" && req.method === "GET") {
        const ch = String(u.searchParams.get("channel") || "main").slice(0, 64);
        const since = Number(u.searchParams.get("since")) || 0; const t = now();
        const list = (announces.get(ch) || []).filter((x) => t - x.ts < ANN_TTL && x.ts > since).map((x) => ({ ann: x.ann, ts: x.ts }));
        return send(res, 200, { ok: true, anns: list });
    }

    // --- SHARED ROOM (e.g. PetFBI posting board) --------------------------
    // GET  /room/:id        -> { value, rev }
    // POST /room/:id { value, ifRev? } -> stores; ifRev guards against clobbering a newer write (optimistic lock)
    if (p.startsWith("/room/")) {
        const id = decodeURIComponent(p.slice("/room/".length));
        if (!id) return send(res, 400, { ok: false, error: "room id required" });
        if (req.method === "GET") { const r = rooms.get(id) || { value: null, rev: 0, updated: 0 }; return send(res, 200, { ok: true, id, value: r.value, rev: r.rev, updated: r.updated }); }
        if (req.method === "POST") {
            const b = await body(req); if (!b) return send(res, 400, { ok: false, error: "bad json" });
            const cur = rooms.get(id) || { value: null, rev: 0, updated: 0 };
            if (typeof b.ifRev === "number" && b.ifRev !== cur.rev) return send(res, 409, { ok: false, error: "rev conflict", rev: cur.rev, value: cur.value });
            const next = { value: b.value, rev: cur.rev + 1, updated: now() }; rooms.set(id, next);
            scheduleSave();   // v1626 — persist the room store (debounced)
            return send(res, 200, { ok: true, id, rev: next.rev });
        }
    }

    return send(res, 404, { ok: false, error: "no such route" });
});

loadState();   // v1626 — restore saved rooms (PetFBI board, etc.) before accepting traffic
server.listen(PORT, () => {
    console.log("[swek-rendezvous] listening on :" + PORT + (TOKEN ? " (token auth ON)" : " (OPEN — set SWEK_TOKEN before exposing publicly!)"));
});
setInterval(pruneMail, 30 * 1000).unref?.();
setInterval(() => { const t = now(); for (const [k, v] of blobs) if (v.exp < t) blobs.delete(k); }, 60 * 1000).unref?.();   // v1624 — expire relayed images
setInterval(() => { if (_dirty) saveStateNow(); }, 60 * 1000).unref?.();   // v1626 — safety flush of any pending room writes
setInterval(() => { const t = now(); for (const [room, r] of presence) { for (const [id, v] of r) if (t - v.ts > PRESENCE_TTL) r.delete(id); if (!r.size) presence.delete(room); } }, 30 * 1000).unref?.();   // expire idle pilots/rooms
for (const sig of ["SIGTERM", "SIGINT"]) process.on(sig, () => { try { saveStateNow(); } catch {} process.exit(0); });   // v1626 — flush on shutdown (Cloud Run sends SIGTERM)
