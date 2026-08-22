// ai-bridge/assetSync.js — v1433
// ---------------------------------------------------------------------------
// Peer-to-peer model-directory sync between two SweK Engine bridges over HTTP.
// Both bridges are already HTTP file servers, so syncing is just: list what the
// peer has, diff against what we have, and GET the missing GLBs from the peer's
// existing /GPU_Assets/<name> route. No cloud, no third-party tool.
//
//   GET  /sync/manifest                -> { ok, root, files:[{name,size,mtime}] }
//   GET  /sync/pull?peer=http://host:8787   -> pull files we lack FROM the peer
//   GET  /sync/mirror?peer=...         -> pull from peer, then have the peer pull
//                                         from us (full two-way union in one call)
//   GET  /sync/now                     -> mirror with every configured peer
//   GET  /sync/peers                   -> { peers:[...] }
//   POST /sync/peers/add  { url }      -> add a peer
//   POST /sync/peers/remove { url }    -> drop a peer
//   GET  /sync/status                  -> { selfUrl, peers, root }
//
// Peers persist in ~/.voxelbridge/sync-peers.json. Filenames coming from a peer
// are sanitised hard (basename only, or <allowed-subfolder>/<basename>) so a
// peer can never write outside the assets root.
// ---------------------------------------------------------------------------

const fs = require("fs");
const path = require("path");
const os = require("os");
const crypto = require("crypto");

// v3280 — the hash cache is now PERSISTED. It was in-memory only, so every restart lost it and the
// first auto-sync after boot re-hashed the ENTIRE model library synchronously on the event loop (the
// blame profiler measured up to ~200s in one startAutoSync tick — the 97%-blocked loop, the 24s
// /server.html, the deep request queue). Persisting it means a reboot re-uses prior hashes for files
// whose size+mtime are unchanged, so the expensive read+hash only happens for genuinely new/changed
// files. Keyed by name; validated by size+mtime, so a stale entry can never mask a changed file.
let _hashCache = new Map();   // name -> { size, mtime, hash } so big GLBs are only re-hashed when they change
let _hashCacheDirty = false, _hashCacheLoaded = false, _hashSaveTimer = null;
const HASH_CACHE_FILE = path.join(os.homedir(), ".voxelbridge", "asset-hash-cache.json");
function _loadHashCache() {
    if (_hashCacheLoaded) return;
    _hashCacheLoaded = true;
    try {
        const raw = JSON.parse(fs.readFileSync(HASH_CACHE_FILE, "utf8"));
        if (raw && raw.entries && typeof raw.entries === "object") {
            // NB: size and mtime (ms since epoch, ~1.7e12) exceed 2^31, so | 0 would TRUNCATE them to
            // garbage and the cache would never match — Number() keeps the full value.
            for (const [name, v] of Object.entries(raw.entries)) if (v && v.hash) _hashCache.set(name, { size: Number(v.size) || 0, mtime: Number(v.mtime) || 0, hash: v.hash });
        }
    } catch {}
}
function _saveHashCacheSoon() {
    _hashCacheDirty = true;
    if (_hashSaveTimer) return;
    _hashSaveTimer = setTimeout(() => {
        _hashSaveTimer = null;
        if (!_hashCacheDirty) return;
        _hashCacheDirty = false;
        try {
            fs.mkdirSync(path.dirname(HASH_CACHE_FILE), { recursive: true });
            const entries = {};
            for (const [name, v] of _hashCache) entries[name] = v;
            fs.writeFileSync(HASH_CACHE_FILE, JSON.stringify({ v: 1, savedAt: Date.now(), entries }));
        } catch {}
    }, 2000);
    if (_hashSaveTimer.unref) _hashSaveTimer.unref();
}
let _progress = { active: false };   // live pull progress (polled by the Settings panel)
let _timer = null, _autoCtx = null, _lastAuto = null;   // periodic auto-sync
let _onEvent = null;
function onEvent(cb) { _onEvent = cb; }
function _emit(ev) { try { if (_onEvent) _onEvent(ev); } catch {} }

const MODEL_EXT = new Set([".glb", ".gltf", ".vox", ".obj", ".ply", ".splat", ".ksplat"]);

// v1532 — free disk bytes on the volume holding `dir`. fs.statfsSync is Node
// 18.15+/Bun; if it's missing we return Infinity so the guard never blocks on
// an older runtime (fail-open: better to attempt the pull than to wedge sync).
function _freeBytes(dir) {
    try {
        if (typeof fs.statfsSync !== "function") return Infinity;
        const s = fs.statfsSync(dir);
        return (s.bavail != null ? s.bavail : s.bfree) * s.bsize;
    } catch { return Infinity; }
}
const DISK_MARGIN = 256 * 1024 * 1024;   // keep at least 256MB free after a pull
const CFG_DIR = path.join(os.homedir(), ".voxelbridge");
const PEERS_FILE = path.join(CFG_DIR, "sync-peers.json");

// --- safety: any relative path UNDER root (arbitrary depth), no traversal -----
// Rejects "", ".", ".." segments + backslash/null, then resolves and verifies
// the result is still contained in root (belt-and-suspenders against escape).
function _resolveRel(root, rel) {
    rel = String(rel || "").replace(/\\/g, "/");
    if (!rel || rel.includes("\0") || rel.startsWith("/") || /^[a-zA-Z]:/.test(rel)) return null;   // no absolute / drive-letter
    const segs = rel.split("/").filter((x) => x !== "");
    if (!segs.length) return null;
    for (const sg of segs) { if (sg === "." || sg === "..") return null; }
    const rootR = path.resolve(root);
    const full = path.resolve(rootR, segs.join(path.sep));
    if (full !== rootR && !full.startsWith(rootR + path.sep)) return null;
    return { full, sub: segs.slice(0, -1).join("/") };
}

// content hash (SHA-256, truncated), cached by name+size+mtime so we don't re-read big GLBs.
function _fileHash(full, size, mtime, name) {
    _loadHashCache();
    const c = _hashCache.get(name);
    if (c && c.size === size && c.mtime === mtime && c.hash) return c.hash;
    let hash = "";
    try { hash = crypto.createHash("sha256").update(fs.readFileSync(full)).digest("hex").slice(0, 24); } catch {}
    _hashCache.set(name, { size, mtime, hash });
    _saveHashCacheSoon();
    return hash;
}
// v3280 — async, event-loop-friendly hash: same cache, but reads with fs.promises and awaits, so a
// cold cache over a big library streams off disk without blocking the loop. Used by the async walk.
async function _fileHashAsync(full, size, mtime, name) {
    _loadHashCache();
    const c = _hashCache.get(name);
    if (c && c.size === size && c.mtime === mtime && c.hash) return c.hash;
    let hash = "";
    try { const buf = await fs.promises.readFile(full); hash = crypto.createHash("sha256").update(buf).digest("hex").slice(0, 24); } catch {}
    _hashCache.set(name, { size, mtime, hash });
    _saveHashCacheSoon();
    return hash;
}

// --- recursively scan the WHOLE assets root for model files -----------------
//
// v3036 -- THE THIRD ARGUMENT IS AN INSTRUMENT, NOT A SECOND WALKER. /sync/status timed out on Keith's Windows
// rig at 4000ms and the leading candidate was this function, so something had to time it. The tempting move --
// a tidy little probe module that walks the tree the same way and reports how long it took -- is the exact
// mistake this tree has paid for eight times: TWO IMPLEMENTATIONS OF ONE FACT, which drift, and the one you
// measured is not the one that runs. So the probe drives THIS walker and cannot disagree with it, because it
// IS it.
//
// When `probe` is undefined every caller behaves byte-for-byte as before -- one falsy check per entry, no
// clocks, no allocation. The instrument costs nothing when it is not attached.
function listModels(root, withHash, probe) {
    const out = [];
    const now = () => Number(process.hrtime.bigint() / 1000n) / 1000;   // ms, microsecond resolution
    const walk = (dir, prefix, depth) => {
        if (probe) { probe.dirs++; if (depth > probe.maxDepth) probe.maxDepth = depth; }
        if (depth > 8) { if (probe) probe.depthCapHit = true; return; }
        let ents = [];
        if (probe) { const t = now(); try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch { probe.readdirMs += now() - t; return; } probe.readdirMs += now() - t; }
        else { try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; } }
        for (const e of ents) {
            if (e.name.startsWith(".") || e.name === "node_modules") continue;
            const full = path.join(dir, e.name);
            if (e.isDirectory()) { walk(full, prefix + e.name + "/", depth + 1); continue; }
            if (!e.isFile() || !MODEL_EXT.has(path.extname(e.name).toLowerCase())) continue;
            let size = 0, mtime = 0;
            if (probe) {
                const t = now();
                try { const st = fs.statSync(full); size = st.size; mtime = Math.round(st.mtimeMs); } catch {}
                const ms = now() - t;
                probe.statMs += ms;
                probe.slowest.push({ name: prefix + e.name, ms });
                if (probe.slowest.length > 400) { probe.slowest.sort((a, b) => b.ms - a.ms); probe.slowest.length = 64; }
            } else {
                try { const st = fs.statSync(full); size = st.size; mtime = Math.round(st.mtimeMs); } catch {}
            }
            const ent = { name: prefix + e.name, size, mtime };
            if (withHash) ent.hash = _fileHash(full, size, mtime, ent.name);
            out.push(ent);
        }
    };
    walk(root, "", 0);
    return out;
}

// v3280 — async twin of listModels: same walk, same output, but readdir/stat/hash are awaited so the
// event loop keeps serving requests during a big hashing scan. This is what pull() uses now; the sync
// listModels stays for cheap non-hash callers (status/lock snapshots) where blocking is negligible.
// ONE FACT, expressed twice only where the sync/async split forces it — the hash cache and the file
// shape are shared, so the two walks cannot report different files or different hashes.
async function listModelsAsync(root, withHash) {
    const out = [];
    const walk = async (dir, prefix, depth) => {
        if (depth > 8) return;
        let ents = [];
        try { ents = await fs.promises.readdir(dir, { withFileTypes: true }); } catch { return; }
        for (const e of ents) {
            if (e.name.startsWith(".") || e.name === "node_modules") continue;
            const full = path.join(dir, e.name);
            if (e.isDirectory()) { await walk(full, prefix + e.name + "/", depth + 1); continue; }
            if (!e.isFile() || !MODEL_EXT.has(path.extname(e.name).toLowerCase())) continue;
            let size = 0, mtime = 0;
            try { const st = await fs.promises.stat(full); size = st.size; mtime = Math.round(st.mtimeMs); } catch {}
            const ent = { name: prefix + e.name, size, mtime };
            if (withHash) ent.hash = await _fileHashAsync(full, size, mtime, ent.name);
            out.push(ent);
        }
    };
    await walk(root, "", 0);
    return out;
}

// --- /sync/status's walk, TIMED --------------------------------------------
//
// WHAT THIS IS ALLOWED TO CONCLUDE. Almost nothing, and that is deliberate. It reports where the milliseconds
// went and refuses to name a cause, because "readdir was slow" and "stat was slow" are the only two things it
// can actually see, and each is consistent with several causes it cannot distinguish from inside the process.
//
// THE OUTCOME WORTH BUILDING IT FOR IS THE NEGATIVE ONE. If this comes back at forty milliseconds on the rig
// then the walk is NOT why /sync/status timed out, the leading candidate is wrong, and we go and look
// somewhere else with the four seconds still unexplained. A probe that can only confirm the theory that
// motivated it is decoration; this one has to be able to exonerate its own suspect.
//
// It walks TWICE. The first walk pays whatever cold cost there is, the second does not. A large gap says the
// cost is per-boot and does not repeat; a small gap says every single poll pays it, and peerRadar and
// settingsHub both poll this endpoint.
function walkProbe(root) {
    const now = () => Number(process.hrtime.bigint() / 1000n) / 1000;
    let st = null;
    try { st = fs.statSync(root); } catch { st = null; }
    // Refuse with the resolved path rather than returning zeroes a page would render as a measurement.
    if (!st || !st.isDirectory()) return { ok: false, root, error: "the resolved asset root is not a readable directory -- nothing was walked, and a zero here would be a lie, not a fast result" };

    const fresh = () => ({ dirs: 0, maxDepth: 0, depthCapHit: false, readdirMs: 0, statMs: 0, slowest: [] });
    const cold = fresh(); const t0 = now(); const files = listModels(root, false, cold); const coldMs = now() - t0;
    const warm = fresh(); const t1 = now(); listModels(root, false, warm);               const warmMs = now() - t1;

    cold.slowest.sort((a, b) => b.ms - a.ms);
    const slowest = cold.slowest.slice(0, 8).map((s) => ({ name: s.name, ms: Math.round(s.ms * 1000) / 1000 }));
    const r2 = (n) => Math.round(n * 100) / 100;

    return {
        ok: true, root,
        files: files.length, dirs: cold.dirs, maxDepth: cold.maxDepth, depthCapHit: cold.depthCapHit,
        coldMs: r2(coldMs), warmMs: r2(warmMs),
        readdirMs: r2(cold.readdirMs), statMs: r2(cold.statMs),
        msPerFile: files.length ? r2(coldMs / files.length) : null,
        slowest,
        // The one judgement it is entitled to make: is this big enough to be the four seconds, or not?
        exceedsFreshMachineTimeout: coldMs >= 4000,
        verdict: coldMs >= 4000
            ? "this walk alone exceeds freshMachine's 4000ms budget -- it is sufficient to explain the timeout"
            : coldMs >= 1000
                ? "slow, but under the 4000ms budget on its own -- it contributes, it does not by itself explain the timeout"
                : "the walk is NOT the bottleneck at this size -- /sync/status timing out means the cause is elsewhere",
        note: "readdirMs is directory enumeration, statMs is per-file metadata. Both are wall clock and neither names a cause; a handful of files each costing tens of ms is the shape cloud placeholders and on-access scanners make, but this process cannot tell those apart and does not claim to.",
    };
}

function manifest(root, withHash) { return { ok: true, root, files: listModels(root, !!withHash), tombstones: readTombstones(root), lock: lockState() }; }
// v3280 — async manifest for the SERVING side. When a peer pulls from us with ?hash=1, the sync
// manifest() re-hashed our whole library synchronously and blocked our loop for as long as the pull
// took. This awaits the async walk instead, so serving a peer's sync never stalls us. Non-hash
// manifests stay on the cheap sync path.
async function manifestAsync(root, withHash) {
    const files = withHash ? await listModelsAsync(root, true) : listModels(root, false);
    return { ok: true, root, files, tombstones: readTombstones(root), lock: lockState() };
}

// v1839 — DELETE PROPAGATION (tombstones). Sync's rule is "pull everything a peer has that we
// don't", so a locally-deleted file would just get re-pulled from any peer that still has it.
// A tombstone records "this relative path was deleted at time T" so that (a) our own pull skips
// re-fetching it, and (b) peers who receive the tombstone delete their copy and stop offering it.
// Stored as JSON in the sync root: .swek-tombstones.json { "rel/name.glb": deletedAtMs, ... }.
const TOMB_FILE = ".swek-tombstones.json";
const TOMB_TTL = 90 * 24 * 60 * 60 * 1000;   // forget a tombstone after 90 days (file is long gone from every peer by then)
function _tombPath(root) { return path.join(root, TOMB_FILE); }
function readTombstones(root) {
    try {
        const raw = JSON.parse(fs.readFileSync(_tombPath(root), "utf8"));
        if (raw && typeof raw === "object") {
            const now = Date.now(); const out = {};
            for (const k of Object.keys(raw)) { const t = Number(raw[k]) || 0; if (t && (now - t) < TOMB_TTL) out[k] = t; }   // prune expired
            return out;
        }
    } catch {}
    return {};
}
function writeTombstones(root, tombs) {
    try { fs.writeFileSync(_tombPath(root), JSON.stringify(tombs || {})); return true; } catch { return false; }
}
// mark one or more relative names deleted (merges with existing, keeps the newest timestamp).
function addTombstones(root, names, when) {
    const t = readTombstones(root); const ts = when || Date.now();
    for (const n of [].concat(names || [])) { const rel = String(n || "").replace(/\\/g, "/"); if (rel) t[rel] = Math.max(t[rel] || 0, ts); }
    writeTombstones(root, t);
    return t;
}
// merge a peer's tombstones into ours AND delete any local file they cover (that's how a delete
// on one box removes the file on this box). Returns { added, removedFiles }.
function mergeTombstones(root, peerTombs) {
    if (!peerTombs || typeof peerTombs !== "object") return { added: 0, removedFiles: [] };
    const mine = readTombstones(root); let added = 0; const removedFiles = [];
    for (const rel of Object.keys(peerTombs)) {
        const t = Number(peerTombs[rel]) || 0; if (!t) continue;
        if (!mine[rel] || t > mine[rel]) { mine[rel] = t; added++; }
        // if we still have the file the peer says was deleted, remove it locally too.
        const r = _resolveRel(root, rel);
        if (r && fs.existsSync(r.full)) { try { fs.rmSync(r.full, { force: true }); removedFiles.push(rel); } catch {} }
    }
    if (added || removedFiles.length) writeTombstones(root, mine);
    return { added, removedFiles };
}

// v3089 -- THE HASH WAS COMPUTED, PUBLISHED, AND THROWN AWAY.
//
// _fileHash has produced a SHA-256 per file since this module was written, /sync/manifest publishes it, and the
// pull loop uses it to decide what NOT to fetch (identical content skips). NOTHING EVER CHECKED WHAT ARRIVED.
// So the one job a content hash exists for -- "is this the thing I asked for, all of it" -- was the one job it
// was not doing, while sitting in the manifest looking like a guarantee.
//
// v3054 spent a round on "a truncated download cannot pass as installed" and answered it PROCEDURALLY: write to
// .part, rename only when the stream finishes. That is a real guard and it covers a writer that stops early. It
// cannot cover a stream that COMPLETED WITH THE WRONG BYTES -- a 404 body, a captive-portal page, a mangling
// proxy, a peer serving a different build. Every one of those finishes cleanly, renames happily, and statSync
// reports present. THE HASH TURNS A PROCEDURAL GUARD INTO A STRUCTURAL ONE: a partial or wrong file does not
// hash to its manifest entry, so it cannot be mistaken for the file.
//
// SCOPE, STATED RATHER THAN IMPLIED. _fileHash truncates to 24 hex characters (96 bits). That is an INTEGRITY
// check against corruption, truncation and mis-service -- NOT a security boundary, because a hostile peer that
// can choose the bytes can also choose the manifest. The path with a real trust anchor is the signed release
// (signRelease.mjs): an ed25519 signature over a FULL sha256, against a locally pinned key. Two different
// guarantees, and naming which one this is stops it being mistaken for the other.
//
// An ABSENT hash is not a failed hash. A peer predating hashed manifests still syncs; refusing it would break
// the feature for a reason the operator cannot act on. Unverified is reported, not treated as good.
function _mismatch(tmp, expectHash) {
    if (!expectHash) return null;
    let got = "";
    try { got = crypto.createHash("sha256").update(fs.readFileSync(tmp)).digest("hex").slice(0, expectHash.length); }
    catch (e) { return { ok: false, reason: "hash-unreadable", error: String((e && e.message) || e) }; }
    if (got === expectHash) return null;
    let bytes = 0; try { bytes = fs.statSync(tmp).size; } catch {}
    return { ok: false, reason: "hash-mismatch", expected: expectHash, got, bytes };
}

// stream a file to disk with live byte progress (falls back to buffered if no stream).
async function _download(url, destFull, expectHash) {
    const r = await fetch(url, { signal: AbortSignal.timeout(600000) });
    if (!r.ok) return { ok: false, status: r.status };
    try { fs.mkdirSync(path.dirname(destFull), { recursive: true }); } catch {}
    _progress.curTotal = parseInt(r.headers.get("content-length") || "0", 10) || 0;
    _progress.curBytes = 0;
    if (r.body && typeof r.body.getReader === "function") {
        const tmp = destFull + ".part";
        const ws = fs.createWriteStream(tmp);
        const reader = r.body.getReader();
        try {
            while (true) { const { done, value } = await reader.read(); if (done) break; if (value && value.length) { ws.write(Buffer.from(value)); _progress.curBytes += value.length; } }
        } finally { ws.end(); }
        await new Promise((res, rej) => { ws.on("finish", res); ws.on("error", rej); });
        // VERIFY BEFORE THE RENAME, because the rename is what makes it real. Checking afterwards would leave a
        // wrong file installed for the length of one if-statement, and a crash in that window installs it for good.
        const bad = _mismatch(tmp, expectHash);
        if (bad) { try { fs.unlinkSync(tmp); } catch {} _progress.curTotal = 0; _progress.curBytes = 0; return bad; }
        try { fs.renameSync(tmp, destFull); } catch { try { fs.copyFileSync(tmp, destFull); fs.unlinkSync(tmp); } catch {} }
    } else {
        // The buffered fallback needs the same check, and it is the easier one -- the bytes are in hand before
        // anything touches the destination. A guard on only the streaming path works until the day a response
        // arrives without a body reader.
        const buf = Buffer.from(await r.arrayBuffer());
        if (expectHash) {
            const got = crypto.createHash("sha256").update(buf).digest("hex").slice(0, expectHash.length);
            if (got !== expectHash) return { ok: false, reason: "hash-mismatch", expected: expectHash, got, bytes: buf.length };
        }
        fs.writeFileSync(destFull, buf); _progress.curBytes = buf.length;
    }
    _progress.curTotal = 0; _progress.curBytes = 0;
    return { ok: true };
}

// --- pull: download everything the peer has that we don't ------------------
async function pull(peerUrl, root, opts = {}) {
    peerUrl = String(peerUrl || "").replace(/\/+$/, "");
    if (!peerUrl) return { ok: false, error: "no peer url" };
    if (typeof fetch !== "function") return { ok: false, error: "fetch unavailable (need Node 18+ or Bun)" };
    const hashMode = !!opts.hashDedup;
    const overwriteDiff = !!opts.overwriteDiff || hashMode;
    let local;
    // v3280 — was listModels(root, hashMode): a SYNCHRONOUS read+SHA-256 of every model file, which
    // blocked the event loop for up to ~200s on a big library after a cold-cache restart. The async
    // walk yields between files, and the now-persisted hash cache means only new/changed files are
    // actually re-hashed, so a warm restart is near-instant and a cold one no longer stalls the bridge.
    try { local = new Map((await listModelsAsync(root, hashMode)).map(f => [f.name, f])); } catch (e) { return { ok: false, error: "local scan: " + e.message }; }
    let mani;
    try {
        const r = await fetch(peerUrl + "/sync/manifest" + (hashMode ? "?hash=1" : ""), { signal: AbortSignal.timeout(20000) });
        if (!r.ok) return { ok: false, error: "peer manifest HTTP " + r.status };
        mani = await r.json();
    } catch (e) { return { ok: false, error: "peer unreachable: " + (e && e.message) }; }
    const peerFiles = (mani && Array.isArray(mani.files)) ? mani.files : [];
    // v1839 — first, honor deletions. Merge the peer's tombstones (removing any local copies of
    // files they deleted) and load our combined tombstone set so we never re-pull a deleted file.
    let _tombs = {};
    try { const mt = mergeTombstones(root, mani && mani.tombstones); _tombs = readTombstones(root); if (mt.removedFiles.length) { for (const rf of mt.removedFiles) local.delete(rf); } } catch {}
    const pulled = [], errors = []; let skipped = 0; const toPull = [];
    // phase 1: decide what to pull
    for (const pf of peerFiles) {
        const rel = pf && pf.name;
        // never re-pull something we (or a peer) deleted — unless the peer's copy is NEWER than the
        // tombstone (i.e. it was re-added on purpose after the delete).
        if (rel && _tombs[rel] && !(pf.mtime && pf.mtime > _tombs[rel])) { skipped++; continue; }
        const dest = _resolveRel(root, rel);
        if (!dest) { errors.push({ name: rel, error: "unsafe name" }); continue; }
        const lf = local.get(rel);
        let have = false;
        if (lf) {
            if (hashMode && pf.hash && lf.hash) have = (lf.hash === pf.hash);   // identical content skips
            else have = !overwriteDiff || lf.size === pf.size;
        }
        if (have) { skipped++; continue; }
        // CARRY THE HASH. It was in the manifest and stopped at this line: toPull knew the size and not the
        // content, so the downloader had nothing to check against even if it had wanted to.
        toPull.push({ rel, dest, size: (pf.size | 0), hash: (pf && pf.hash) || null });
    }
    // v1532 — disk-space guard. Geek's "assuming there was disk space available"
    // is now actually checked: sum the incoming bytes and refuse to start the pull
    // if it would leave the volume under the safety margin. Fail-open only when the
    // runtime can't report free space (_freeBytes -> Infinity).
    const needBytes = toPull.reduce((a, f) => a + (f.size || 0), 0);
    if (toPull.length) {
        const free = _freeBytes(root);
        if (free !== Infinity && free < needBytes + DISK_MARGIN) {
            _emit({ phase: "diskfull", peer: peerUrl, need: needBytes, free });
            return { ok: false, error: "insufficient disk space", needBytes, freeBytes: free, marginBytes: DISK_MARGIN, wouldPull: toPull.length, skipped };
        }
    }
    // phase 2: download (progress is exposed via progress() so the panel can poll it)
    _progress = { active: true, peer: peerUrl, total: toPull.length, done: 0, current: "", pulled: 0, startedAt: Date.now() };
    if (toPull.length) _emit({ phase: "start", peer: peerUrl, total: toPull.length });
    for (const { rel, dest, hash } of toPull) {
        _progress.current = rel; _progress.curBytes = 0; _progress.curTotal = 0;
        _emit({ phase: "file", peer: peerUrl, done: _progress.done + 1, total: toPull.length, current: rel });
        try {
            const dr = await _download(peerUrl + "/GPU_Assets/" + rel.split("/").map(encodeURIComponent).join("/"), dest.full, hash);
            // A FAILED HASH IS NOT A FAILED FETCH, AND SAYING "HTTP undefined" WOULD SEND SOMEBODY TO THE WRONG
            // PLACE. The transfer succeeded; the bytes are wrong. Different cause, different fix, and this tree
            // has been bitten by two outcomes wearing one label often enough to name them apart on sight.
            if (!dr.ok && dr.reason === "hash-mismatch") {
                errors.push({ name: rel, error: "content mismatch -- expected " + dr.expected + ", got " + dr.got +
                    " over " + dr.bytes + " bytes; NOT installed" });
            } else if (!dr.ok && dr.reason === "hash-unreadable") {
                errors.push({ name: rel, error: "downloaded but could not be re-read to verify: " + dr.error + "; NOT installed" });
            } else if (!dr.ok) errors.push({ name: rel, error: "fetch HTTP " + (dr.status || "?") });
            else { pulled.push(rel); _progress.pulled++; }
        } catch (e) { errors.push({ name: rel, error: e && e.message }); }
        _progress.done++;
    }
    _progress.active = false;
    if (pulled.length || errors.length) _emit({ phase: "done", peer: peerUrl, pulled: pulled.length, errors: errors.length });
    return { ok: true, peer: peerUrl, pulled, pulledCount: pulled.length, skipped, errors, peerHad: peerFiles.length };
}

// --- mirror: pull from peer, then ask the peer to pull from us --------------
async function mirror(peerUrl, root, selfUrlStr, opts = {}) {
    peerUrl = String(peerUrl || "").replace(/\/+$/, "");
    const fromPeer = await pull(peerUrl, root, opts);
    let peerFromUs = null;
    if (selfUrlStr) {
        try {
            const r = await fetch(peerUrl + "/sync/pull?peer=" + encodeURIComponent(selfUrlStr), { signal: AbortSignal.timeout(180000) });
            peerFromUs = r.ok ? await r.json() : { ok: false, error: "HTTP " + r.status };
        } catch (e) { peerFromUs = { ok: false, error: e && e.message }; }
    } else {
        peerFromUs = { ok: false, error: "no LAN IP detected for self — peer can't pull back" };
    }
    return { ok: !!(fromPeer && fromPeer.ok), peer: peerUrl, pulledFromPeer: fromPeer, peerPulledFromUs: peerFromUs };
}

// --- self URL (LAN IPv4) so a peer can reach us -----------------------------
function lanIp() {
    // v1600 — prefer a REAL physical LAN address. The old version returned the first non-internal IPv4,
    // which on Windows boxes with Hyper-V/VMware/WSL adapters is frequently a VIRTUAL one (e.g. a Default
    // Switch / host-only 192.168.x.1). Two machines can share that same virtual subnet, so they would
    // announce the SAME selfUrl on the discovery beacon and filter each other out as "self" (while a Linux
    // peer with a real IP stayed visible). Mirror server.js's isVirtual heuristic and skip those.
    const ifs = os.networkInterfaces();
    const isVirtual = (name, addr) => {
        const n = String(name || "").toLowerCase();
        const vn = /(vethernet|virtualbox|vmware|hyper-?v|\bwsl\b|loopback|default switch|tailscale|zerotier|tap-|tun|npcap|docker|bluetooth|awdl|llw|bridge\d|p2p|anpi)/.test(n);
        return vn || /\.1$/.test(addr) || /^169\.254\./.test(addr);
    };
    const isPrivate = (a) => /^(192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)/.test(a);
    const cands = [];
    for (const name of Object.keys(ifs)) for (const i of (ifs[name] || [])) {
        if (i.family === "IPv4" && !i.internal && !String(i.address).startsWith("169.254")) {
            cands.push({ addr: i.address, virtual: isVirtual(name, i.address) });
        }
    }
    const realPrivate = cands.find(c => !c.virtual && isPrivate(c.addr));
    if (realPrivate) return realPrivate.addr;
    const realAny = cands.find(c => !c.virtual);
    if (realAny) return realAny.addr;
    return cands.length ? cands[0].addr : null;   // last resort: whatever we have
}
function selfUrl(port) { const ip = lanIp(); return ip ? `http://${ip}:${port}` : null; }

// --- peer + settings registry (~/.voxelbridge/sync-peers.json) --------------
function _loadCfg() { try { return JSON.parse(fs.readFileSync(PEERS_FILE, "utf8")) || {}; } catch { return {}; } }
function _saveCfg(cfg) { try { fs.mkdirSync(CFG_DIR, { recursive: true }); fs.writeFileSync(PEERS_FILE, JSON.stringify(cfg, null, 2)); return true; } catch { return false; } }
function loadPeers() { const c = _loadCfg(); return (Array.isArray(c.peers) ? c.peers : []).filter(_isLanPeerUrl); }
function savePeers(peers) { const c = _loadCfg(); c.peers = peers; return _saveCfg(c); }
// v1845 — validate that a peer URL is a plausible LAN peer before saving it. This filters out two
// kinds of junk that gossip/discovery were letting in:
//   - public hostnames (e.g. "api.github.com:8787") — a peer must be an IP or a *.local name,
//     never a routable public domain (those leak in from a mis-parsed URL or a bad self-report).
//   - virtual/bridge addresses that answer on :8787 but aren't real LAN boxes:
//       * 172.17.x-172.31.x  (Docker's default bridge + WSL) — Docker squats here
//       * 169.254.x          (link-local / APIPA)
//       * 172.17.x-172.31.x  (Docker's default bridge + WSL) — Docker squats here
//       * 169.254.x          (link-local / APIPA)
//   Real LAN ranges kept: 192.168.x, 10.x, and 172.16.x (the one commonly-real /16 people use).
//
// v1886 — AND 100.64.0.0/10 IS KEPT: that is Tailscale's tailnet range, and a tailnet peer is a REAL machine,
//   not carrier junk. This comment said the opposite for 41 versions (v1845 lumped CGNAT in with the Docker
//   bridges; v1886 changed the code and left the prose). A COMMENT IS NOT THE CODE -- IT IS A CLAIM ABOUT THE
//   CODE, AND NOTHING CHECKS IT. So the claim now lives in ai-bridge/peerAddress-selfcheck.mjs as assertions:
//   if someone deletes the 100.x branch because a comment told them it was junk, the gate goes red and names the
//   machine that just stopped being reachable.
// v2245 — every address THIS box answers on, across ALL adapters (including virtual Hyper-V/WSL/Docker
// NICs like 192.168.237.1). A peer URL whose host is one of these is self, not a peer: the beacon egresses
// out a virtual adapter and comes back, or gossip echoes our own virtual IP, and it lands in the roster as
// a phantom that autoPull then wastes cycles probing. Cached for a minute; local IPs rarely change.
let _ownHostsCache = { at: 0, set: null };
function _ownHosts() {
    if (_ownHostsCache.set && Date.now() - _ownHostsCache.at < 60000) return _ownHostsCache.set;
    const set = new Set(["127.0.0.1", "::1", "localhost", "0.0.0.0"]);
    try { const ifs = os.networkInterfaces(); for (const nm of Object.keys(ifs)) for (const i of (ifs[nm] || [])) if (i && i.address) set.add(String(i.address).toLowerCase()); } catch {}
    try { const hn = String(os.hostname() || "").toLowerCase().split(".")[0]; if (hn) { set.add(hn); set.add(hn + ".local"); } } catch {}
    _ownHostsCache = { at: Date.now(), set };
    return set;
}
function _isOwnHost(h) { return _ownHosts().has(String(h || "").toLowerCase()); }

function _isLanPeerUrl(url) {
    let host = "";
    try { host = new URL(url).hostname; } catch { return false; }
    if (!host) return false;
    const h = host.toLowerCase();
    if (_isOwnHost(h)) return false;   // v2245 — self (any local NIC incl. virtual, or our own name) is not a peer
    if (h === "localhost" || h.endsWith(".local")) return true;   // mDNS / loopback name
    const m = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
    if (!m) return false;   // any non-IP hostname (api.github.com, etc.) is NOT a LAN peer
    const a = +m[1], b = +m[2];
    if (a > 255 || b > 255 || +m[3] > 255 || +m[4] > 255) return false;
    if (a === 192 && b === 168) return true;      // 192.168.0.0/16
    if (a === 10) return true;                    // 10.0.0.0/8
    if (a === 172 && b === 16) return true;       // 172.16.0.0/16 (the real-LAN slice; 17-31 are Docker/WSL)
    if (a === 127) return true;                   // loopback (self / same-box)
    if (a === 100 && b >= 64 && b <= 127) return true;  // v1886 — 100.64.0.0/10: Tailscale tailnet IPs. GATED by peerAddress-selfcheck.mjs -- do not "clean up". (and CGNAT). A mesh-VPN peer looks local; ZeroTier on 10.x/172.16 already passes above.
    return false;                                 // 169.254.x, 172.17-31.x, other public IPs -> rejected
}
function addPeer(url) { url = String(url || "").replace(/\/+$/, ""); if (!url) return loadPeers(); if (!_isLanPeerUrl(url)) { if (process.env.SWEK_DEBUG_PEERS === "1") { try { console.log("[peers] rejected non-LAN peer: " + url); } catch {} } return loadPeers(); } const p = loadPeers(); if (!p.includes(url)) p.push(url); savePeers(p); return p; }
// one-time cleanup: drop any already-saved peers that aren't plausible LAN boxes (api.github.com, docker bridges, ...).
function prunePeers() { const p = loadPeers(); const keep = p.filter(_isLanPeerUrl); if (keep.length !== p.length) { try { console.log("[peers] pruned " + (p.length - keep.length) + " non-LAN peer(s): " + p.filter(u => !_isLanPeerUrl(u)).join(", ")); } catch {} savePeers(keep); } return keep; }
function removePeer(url) { url = String(url || "").replace(/\/+$/, ""); const p = loadPeers().filter(x => x !== url); savePeers(p); return p; }

// v1839 — delete an asset by its sync-relative name (or absolute path under the root), tombstone it,
// and PUSH the delete to every peer BEFORE the next sync so it can't be resurrected. This is what
// the Tinder/asset viewers call so a discard actually sticks across the LAN.
async function deleteAsset(root, rel) {
    rel = String(rel || "").replace(/\\/g, "/");
    if (!rel) return { ok: false, error: "no name" };
    const r = _resolveRel(root, rel);
    if (!r) return { ok: false, error: "unsafe name" };
    let removed = false;
    try { if (fs.existsSync(r.full)) { fs.rmSync(r.full, { force: true }); removed = true; } } catch (e) { return { ok: false, error: "remove failed: " + (e && e.message) }; }
    addTombstones(root, rel);   // record the delete locally so our own sync won't re-pull it
    // push to peers (best-effort, in parallel). Each peer removes its copy + records the tombstone.
    const peers = loadPeers(); const pushed = [], failed = [];
    await Promise.all(peers.map(async (pu) => {
        try {
            const res = await fetch(pu.replace(/\/+$/, "") + "/sync/delete", {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name: rel }), signal: AbortSignal.timeout(8000),
            });
            if (res.ok) pushed.push(pu); else failed.push({ peer: pu, status: res.status });
        } catch (e) { failed.push({ peer: pu, error: String(e && e.message || e) }); }
    }));
    return { ok: true, removed, name: rel, pushedTo: pushed, failed };
}
// v1842 — move a LOOSE file into a subfolder of the assets root, then propagate: the old path is
// deleted+tombstoned on peers, the new path syncs out as an add. Returns { ok, oldRel, newRel }.
async function moveLoose(root, rel, subfolder) {
    rel = String(rel || "").replace(/\\/g, "/");
    const sub = String(subfolder || "").trim().replace(/^[/\\]+|[/\\]+$/g, "").replace(/\.\./g, "");
    if (!rel) return { ok: false, error: "no file" };
    if (!sub) return { ok: false, error: "no subfolder" };
    const src = _resolveRel(root, rel);
    if (!src || !fs.existsSync(src.full)) return { ok: false, error: "file not found" };
    const base = rel.includes("/") ? rel.slice(rel.lastIndexOf("/") + 1) : rel;
    const newRel = sub + "/" + base;
    const dst = _resolveRel(root, newRel);
    if (!dst) return { ok: false, error: "unsafe destination" };
    if (path.resolve(dst.full) === path.resolve(src.full)) return { ok: false, error: "already there" };
    if (fs.existsSync(dst.full)) return { ok: false, error: "a file with that name already exists in " + sub };
    try { fs.mkdirSync(path.dirname(dst.full), { recursive: true }); fs.renameSync(src.full, dst.full); }
    catch (e) { return { ok: false, error: "move failed: " + (e && e.message) }; }
    // propagate: tombstone+delete the old path on peers (new one flows out via normal sync).
    try { await deleteAsset(root, rel); } catch {}
    return { ok: true, oldRel: rel, newRel };
}
// a peer told us it deleted this file — tombstone + remove our copy too.
function applyRemoteDelete(root, rel) {
    rel = String(rel || "").replace(/\\/g, "/");
    if (!rel) return { ok: false, error: "no name" };
    const r = _resolveRel(root, rel);
    if (!r) return { ok: false, error: "unsafe name" };
    let removed = false;
    try { if (fs.existsSync(r.full)) { fs.rmSync(r.full, { force: true }); removed = true; } } catch {}
    addTombstones(root, rel);
    return { ok: true, removed, name: rel };
}
function getSettings() { const c = _loadCfg(); return { hashDedup: !!c.hashDedup, autoSync: !!c.autoSync, autoSyncMin: c.autoSyncMin || 15, discover: c.discover !== false, autoSyncDiscovered: !!c.autoSyncDiscovered, autoSwitchHost: !!c.autoSwitchHost, aiWorker: !!c.aiWorker, computeHost: c.computeHost || "", llmHost: c.llmHost || "", syncWaitMin: (c.syncWaitMin == null ? 120 : c.syncWaitMin), peerAvatarMB: (c.peerAvatarMB == null ? 150 : c.peerAvatarMB) }; }   // v2194 — discover defaults ON (opt-out): the .bat is supposed to find LAN peers out of the box
function setSettings(patch) {
    const c = _loadCfg();
    if (patch && typeof patch.hashDedup === "boolean") c.hashDedup = patch.hashDedup;
    if (patch && typeof patch.autoSync === "boolean") c.autoSync = patch.autoSync;
    if (patch && patch.autoSyncMin != null) c.autoSyncMin = Math.max(1, Math.min(1440, parseInt(patch.autoSyncMin, 10) || 15));
    if (patch && typeof patch.discover === "boolean") c.discover = patch.discover;
    if (patch && typeof patch.autoSyncDiscovered === "boolean") c.autoSyncDiscovered = patch.autoSyncDiscovered;
    if (patch && typeof patch.autoSwitchHost === "boolean") c.autoSwitchHost = patch.autoSwitchHost;   // v1460
    if (patch && typeof patch.aiWorker === "boolean") c.aiWorker = patch.aiWorker;   // v1461
    if (patch && typeof patch.computeHost === "string") c.computeHost = String(patch.computeHost).replace(/\/+$/, "");
    if (patch && typeof patch.llmHost === "string") c.llmHost = String(patch.llmHost).replace(/\/+$/, "");
    if (patch && patch.syncWaitMin != null) c.syncWaitMin = Math.max(0, Math.min(120, parseInt(patch.syncWaitMin, 10) || 0));   // v1550 — 0 = no wait, else minutes to wait for an idle peer
    if (patch && patch.peerAvatarMB != null) c.peerAvatarMB = Math.max(0, Math.min(300, parseInt(patch.peerAvatarMB, 10) || 0));   // v1636 — per-avatar Peer Avatar Visit Synch budget (0 = off)
    _saveCfg(c);
    if (_autoCtx) startAutoSync(_autoCtx.getRoot, _autoCtx.port, _autoCtx.getExtra);   // apply timer change immediately
    return getSettings();
}

// --- periodic auto-sync -----------------------------------------------------
function stopAutoSync() { if (_timer) { clearInterval(_timer); _timer = null; } }

// v1840 — ASSET EDIT LOCK. A staged-edit workflow: one box takes the lock, pauses sync, and
// reorganizes its GPU_Assets freely (delete / move / rename / restructure). On UNLOCK, it diffs
// the folder against the snapshot it took at lock time, turns every removed-or-moved-away path into
// a tombstone, and pushes those deletes to peers before resuming sync. MERGE semantics: peers keep
// their own unique files (those sync back later); only the editor's deletes/moves propagate.
//
// Mutual exclusion is a LEASE, not real auth: while any box holds the lock, others are refused with
// "held by <who>". The lease auto-expires (heartbeat) so a crashed editor can't wedge the LAN.
// (Full admin/non-admin roles are a separate backlog item — see BACKLOG.)
const LOCK_TTL = 10 * 60 * 1000;          // a held lock expires 10 min after the last heartbeat
let _lock = null;                          // { owner, ownerName, since, beat } when WE hold it
let _remoteLock = null;                    // { owner, ownerName, since, beat } when a PEER holds it
let _lockSnapshot = null;                  // Set of relative names present at lock time (for the diff)

function _lockLive(l) { return !!(l && (Date.now() - (l.beat || l.since || 0) < LOCK_TTL)); }
// who, if anyone, currently holds the lock (ours wins if both somehow set).
function lockState() {
    if (_lockLive(_lock)) return { ok: true, locked: true, mine: true, owner: _lock.owner, ownerName: _lock.ownerName, since: _lock.since };
    if (_lockLive(_remoteLock)) return { ok: true, locked: true, mine: false, owner: _remoteLock.owner, ownerName: _remoteLock.ownerName, since: _remoteLock.since };
    return { ok: true, locked: false, mine: false };
}
function isLocked() { return _lockLive(_lock) || _lockLive(_remoteLock); }
function heldByRemote() { return _lockLive(_remoteLock); }

// acquire locally + snapshot the current file list. Caller (server) pushes to peers.
function lockAcquire(root, owner, ownerName) {
    if (_lockLive(_remoteLock)) return { ok: false, error: "assets are locked by " + (_remoteLock.ownerName || _remoteLock.owner) };
    if (_lockLive(_lock)) { _lock.beat = Date.now(); return { ok: true, locked: true, mine: true, already: true, owner: _lock.owner, ownerName: _lock.ownerName }; }
    _lock = { owner: owner || "self", ownerName: ownerName || owner || "this box", since: Date.now(), beat: Date.now() };
    try { _lockSnapshot = new Set(listModels(root, false).map(f => f.name)); } catch { _lockSnapshot = new Set(); }
    return { ok: true, locked: true, mine: true, owner: _lock.owner, ownerName: _lock.ownerName, snapshotCount: _lockSnapshot.size };
}
function lockHeartbeat() { if (_lock) { _lock.beat = Date.now(); return { ok: true }; } return { ok: false, error: "not held here" }; }
// a peer told us THEY hold (or released) the lock.
function noteRemoteLock(owner, ownerName, released) {
    if (released) { if (_remoteLock && _remoteLock.owner === owner) _remoteLock = null; return { ok: true }; }
    if (_lockLive(_lock)) return { ok: false, error: "we hold the lock" };   // don't let a peer stomp our active edit
    _remoteLock = { owner, ownerName: ownerName || owner, since: (_remoteLock && _remoteLock.owner === owner) ? _remoteLock.since : Date.now(), beat: Date.now() };
    return { ok: true };
}
// release + diff: compute which snapshot files are now gone -> tombstone them. Returns the removed
// relative names so the server can propagate the deletes to peers before resuming sync.
function lockRelease(root) {
    if (!_lock) return { ok: false, error: "not held here", removed: [] };
    let removed = [];
    try {
        const now = new Set(listModels(root, false).map(f => f.name));
        for (const rel of (_lockSnapshot || [])) if (!now.has(rel)) removed.push(rel);
        if (removed.length) addTombstones(root, removed);   // so our own future sync won't re-pull them
    } catch {}
    _lock = null; _lockSnapshot = null;
    return { ok: true, removed };
}

// v3280 — build the hash cache in the BACKGROUND at boot (off the event loop), so the first real
// auto-sync finds a warm cache instead of paying the whole library's read+hash in one blocking tick.
// Idempotent and best-effort; the async walk yields, so it never blocks startup.
let _warmed = false;
async function warmHashCache(root) {
    if (_warmed) return { ok: true, already: true };
    _warmed = true;
    _loadHashCache();
    try { await listModelsAsync(root, true); return { ok: true, cached: _hashCache.size }; }
    catch (e) { return { ok: false, error: String(e && e.message || e) }; }
}

function startAutoSync(getRoot, port, getExtra) {
    _autoCtx = { getRoot, port, getExtra };
    stopAutoSync();
    const s = getSettings();
    if (!s.autoSync) return false;
    const ms = Math.max(1, s.autoSyncMin) * 60000;
    _timer = setInterval(() => {
        try {
            // v1840 — hold sync while assets are locked for editing (ours or a peer's), so nothing
            // pulls a half-reorganized folder. Resumes automatically when the lock releases/expires.
            if (isLocked()) return;
            let peers = loadPeers();
            if (getSettings().autoSyncDiscovered && getExtra) { for (const u of (getExtra() || [])) if (u && !peers.includes(u)) peers = peers.concat(u); }
            syncAll(getRoot(), selfUrl(port), { hashDedup: getSettings().hashDedup }, peers).then((r) => { _lastAuto = { at: Date.now(), result: r, peers: peers.length }; }).catch(() => {});
        } catch {}
    }, ms);
    if (_timer.unref) _timer.unref();
    return true;
}

async function syncAll(root, selfUrlStr, opts = {}, peers) {
    peers = peers || loadPeers();
    const results = [];
    for (const p of peers) results.push({ peer: p, result: await mirror(p, root, selfUrlStr, opts) });
    return { ok: true, peers: peers.length, results };
}

function progress() { return Object.assign({}, _progress); }
function lastAuto() { return _lastAuto; }
function lastBest() { return _lastBest; }
function status(root, port) { const set = getSettings(); return { ok: true, selfUrl: selfUrl(port), root, peers: loadPeers(), localCount: listModels(root).length, hashDedup: set.hashDedup, autoSync: set.autoSync, autoSyncMin: set.autoSyncMin, discover: set.discover, autoSyncDiscovered: set.autoSyncDiscovered, syncWaitMin: set.syncWaitMin, lastAuto: _lastAuto, lastBest: _lastBest }; }

// --- idle-aware peer selection (v1550) --------------------------------------
// Probe a peer's busyness via GET /sync/load -> a 0..1 score (0 = fully idle).
// score = cpu utilisation (0..1) + 0.35 if the peer is itself mid-pull. Unreachable -> 2.
let _lastBest = null;
const BUSY_THRESHOLD = 0.6;   // at/above this a peer counts as "busy"
async function loadProbe(url) {
    url = String(url || "").replace(/\/+$/, "");
    if (!url) return { url, reachable: false, score: 2 };
    try {
        const r = await fetch(url + "/sync/load", { signal: AbortSignal.timeout(5000) });
        if (!r.ok) return { url, reachable: false, score: 2 };
        const j = await r.json();
        const cpu = Math.max(0, Math.min(100, j.cpuPct || 0)) / 100;
        const pulling = !!j.pulling;
        const score = Math.max(0, Math.min(1, cpu + (pulling ? 0.35 : 0)));
        return { url, reachable: true, cpuPct: j.cpuPct || 0, pulling, score };
    } catch { return { url, reachable: false, score: 2 }; }
}

// Combine the load probe with a manifest probe: does this peer have files we lack?
// newCount = peer files whose relative name isn't present locally (matches pull()'s
// default name-based dedup). hasFiles gates whether the peer is worth pulling from.
async function probePeer(url, localNames) {
    const lp = await loadProbe(url);
    if (!lp.reachable) return Object.assign(lp, { newCount: 0, hasFiles: false });
    let newCount = 0;
    try {
        const r = await fetch(url + "/sync/manifest", { signal: AbortSignal.timeout(15000) });
        if (r.ok) { const m = await r.json(); const files = (m && Array.isArray(m.files)) ? m.files : []; for (const pf of files) if (pf && pf.name && !localNames.has(pf.name)) newCount++; }
    } catch {}
    return Object.assign(lp, { newCount, hasFiles: newCount > 0 });
}

// pullBest: pick the most IDLE reachable peer THAT HAS FILES WE LACK and pull from it.
// If that peer is still busy and waitMin > 0, poll (every <=45s) for up to waitMin minutes
// for one of the useful peers to go idle; on timeout, pull from the least-busy useful peer
// regardless. waitMin = 0 -> no wait. If no reachable peer has anything new -> nothing to do.
async function pullBest(root, opts, candidates, port, waitMin, onTick) {
    opts = opts || {};
    const me = (selfUrl(port) || "").replace(/\/+$/, "");
    candidates = (candidates || loadPeers()).map(u => String(u || "").replace(/\/+$/, "")).filter(u => u && u !== me);
    candidates = [...new Set(candidates)];
    if (!candidates.length) return { ok: false, error: "no candidate peers" };
    waitMin = Math.max(0, Math.min(120, parseInt(waitMin, 10) || 0));

    let localNames;
    try { localNames = new Set(listModels(root).map(f => f.name)); } catch { localNames = new Set(); }

    // initial probe: load + which peers actually have files we're missing
    const probed = (await Promise.all(candidates.map(u => probePeer(u, localNames))));
    const reachable = probed.filter(p => p.reachable);
    if (!reachable.length) { _lastBest = { ok: false, error: "no reachable peers", at: Date.now() }; return _lastBest; }
    let useful = reachable.filter(p => p.hasFiles).sort((a, b) => a.score - b.score);
    if (!useful.length) { _lastBest = { ok: true, pulled: [], pulledCount: 0, skipped: 0, note: "all reachable peers are already in sync (no new files to pull)", reachable: reachable.length, at: Date.now() }; _progress = { active: false }; return _lastBest; }

    const usefulUrls = useful.map(p => p.url);
    let chosen = useful[0];
    let waitedMs = 0, proceededBusy = false;

    if (chosen.score > BUSY_THRESHOLD && waitMin > 0) {
        const startWait = Date.now(), deadline = startWait + waitMin * 60000;
        // re-check LOAD only among the peers we already know have the files (manifest is computed once)
        const refreshLoad = async () => (await Promise.all(usefulUrls.map(loadProbe))).filter(p => p.reachable).sort((a, b) => a.score - b.score);
        _progress = { active: true, phase: "waiting", peer: chosen.url, bestScore: chosen.score, waitMin, startedAt: startWait, remainingMs: deadline - startWait };
        _emit({ phase: "waiting", peer: chosen.url, bestScore: chosen.score });
        let live = useful;
        while (Date.now() < deadline) {
            const remain = deadline - Date.now();
            _progress.remainingMs = remain; _progress.bestScore = chosen.score; _progress.peer = chosen.url;
            if (typeof onTick === "function") { try { onTick({ bestScore: chosen.score, peer: chosen.url, remainingMs: remain }); } catch {} }
            await new Promise(r => setTimeout(r, Math.min(45000, remain)));
            const fresh = await refreshLoad();
            if (fresh.length) { live = fresh; chosen = fresh[0]; if (chosen.score <= BUSY_THRESHOLD) break; }
        }
        waitedMs = Date.now() - startWait;
        if (!live.length) { _progress = { active: false }; _lastBest = { ok: false, error: "the peers that had the files went unreachable during the wait", waitedMs, at: Date.now() }; return _lastBest; }
        chosen = live[0];
        proceededBusy = chosen.score > BUSY_THRESHOLD;   // waited out the clock — pull anyway
    }

    const res = await pull(chosen.url, root, opts);
    _lastBest = Object.assign({ chosenPeer: chosen.url, chosenScore: chosen.score, chosenNewCount: chosen.newCount, waitedMs, proceededBusy, waitMin, usefulPeers: useful.length, at: Date.now() }, res);
    return _lastBest;
}

module.exports = { manifest, manifestAsync, pull, mirror, syncAll, status, walkProbe, progress, lastAuto, lastBest, onEvent, selfUrl, lanIp, loadPeers, addPeer, removePeer, prunePeers, isLanPeerUrl: _isLanPeerUrl, getSettings, setSettings, startAutoSync, stopAutoSync, listModels, listModelsAsync, warmHashCache, loadProbe, pullBest, deleteAsset, applyRemoteDelete, readTombstones, addTombstones, mergeTombstones, lockState, isLocked, heldByRemote, lockAcquire, lockHeartbeat, lockRelease, noteRemoteLock, moveLoose };
