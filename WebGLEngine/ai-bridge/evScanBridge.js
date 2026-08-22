// WebGLEngine/ai-bridge/evScanBridge.js — CommonJS bridge for the SweK server.
//
// Mirrors the gpuBrainBridge owns()/handle() pattern so it drops into server.js
// with one delegation block. Owns:  /ev/scan  /ev/inspect  /ev/load
//
// Provides the "scan Downloads → compat-check plug-ins → load the ones you pick →
// unzip to temp → parse → delete temp" flow. Self-contained: a minimal resource-
// fork type/id reader (enough for the compat check — we don't decode sprites here)
// and a zlib-based zip reader. Ships NO game content; writes only to an OS temp dir
// that is removed in a finally block.

const fs = require("fs");
const os = require("os");
const path = require("path");
const zlib = require("zlib");

// ---- minimal resource-fork reader (type list + ids + count only) ----------------
// EV data lives in a Mac resource fork (optionally wrapped in AppleSingle/Double or
// MacBinary) or a flat .rez. We only need the type/id map for compat, so this is a
// trimmed reader — not the engine's full decoder.
function macRoman(bytes) {
    // 4-char type codes are MacRoman; for our purposes Latin-1 is close enough for
    // the ASCII-range letters, and the accented type names (shïp) round-trip by byte.
    let s = ""; for (const b of bytes) s += String.fromCharCode(b);
    return s;
}
function u16(dv, o) { return dv.getUint16(o, false); }
function u32(dv, o) { return dv.getUint32(o, false); }

function unwrap(u8) {
    const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
    // AppleSingle/Double: magic 0x00051600 / 0x00052607
    if (u8.byteLength > 26) {
        const magic = u32(dv, 0);
        if (magic === 0x00051600 || magic === 0x00052607) {
            const n = u16(dv, 24);
            for (let i = 0; i < n; i++) {
                const e = 26 + i * 12;
                const id = u32(dv, e), off = u32(dv, e + 4), len = u32(dv, e + 8);
                if (id === 2) return u8.subarray(off, off + len);   // resource fork entry
            }
        }
    }
    // MacBinary: resource fork length at 87..90, data fork at 83..86
    if (u8.byteLength > 128) {
        const dlen = u32(dv, 83), rlen = u32(dv, 87);
        if (rlen > 0 && 128 + Math.ceil(dlen / 128) * 128 + rlen <= u8.byteLength + 128) {
            const rstart = 128 + Math.ceil(dlen / 128) * 128;
            return u8.subarray(rstart, rstart + rlen);
        }
    }
    return u8;   // assume raw resource fork
}

// Parse a resource fork → { count, types: { "shïp": [ids...] } } or null.
function forkTypeMap(u8) {
    try {
        const rsrc = unwrap(u8);
        const dv = new DataView(rsrc.buffer, rsrc.byteOffset, rsrc.byteLength);
        if (rsrc.byteLength < 16) return null;
        const dataOff = u32(dv, 0), mapOff = u32(dv, 4);
        if (mapOff + 30 > rsrc.byteLength) return null;
        const typeListRel = u16(dv, mapOff + 24);
        const typeListAbs = mapOff + typeListRel;
        if (typeListAbs + 2 > rsrc.byteLength) return null;
        const numTypes = u16(dv, typeListAbs) + 1;
        const types = {}; let count = 0;
        for (let t = 0; t < numTypes; t++) {
            const te = typeListAbs + 2 + t * 8;
            if (te + 8 > rsrc.byteLength) break;
            const code = macRoman(rsrc.subarray(te, te + 4));
            const numRefs = u16(dv, te + 4) + 1;
            const refListRel = u16(dv, te + 6);
            const refAbs = typeListAbs + refListRel;
            const ids = [];
            for (let r = 0; r < numRefs; r++) {
                const re = refAbs + r * 12;
                if (re + 2 > rsrc.byteLength) break;
                ids.push(dv.getInt16(re, false));   // resource id (signed)
                count++;
            }
            types[code] = ids;
        }
        if (!Object.keys(types).length) return null;
        return { count, types };
    } catch { return null; }
}

// ---- zip reader (central directory + zlib inflate-raw) --------------------------
function readZipEntries(u8) {
    const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
    const len = u8.byteLength;
    let eocd = -1;
    for (let i = len - 22; i >= Math.max(0, len - 65557); i--) {
        if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
    }
    if (eocd < 0) throw new Error("not a zip");
    const count = dv.getUint16(eocd + 10, true);
    let cd = dv.getUint32(eocd + 16, true);
    const out = [];
    for (let n = 0; n < count; n++) {
        if (dv.getUint32(cd, true) !== 0x02014b50) break;
        const method = dv.getUint16(cd + 10, true);
        const compSize = dv.getUint32(cd + 20, true);
        const nameLen = dv.getUint16(cd + 28, true);
        const extraLen = dv.getUint16(cd + 30, true);
        const commLen = dv.getUint16(cd + 32, true);
        const locOff = dv.getUint32(cd + 42, true);
        const name = Buffer.from(u8.subarray(cd + 46, cd + 46 + nameLen)).toString("utf8");
        cd += 46 + nameLen + extraLen + commLen;
        if (dv.getUint32(locOff, true) !== 0x04034b50) continue;
        const lNameLen = dv.getUint16(locOff + 26, true);
        const lExtraLen = dv.getUint16(locOff + 28, true);
        const dataStart = locOff + 30 + lNameLen + lExtraLen;
        const comp = u8.subarray(dataStart, dataStart + compSize);
        if (name.endsWith("/")) continue;
        let bytes;
        if (method === 0) bytes = Buffer.from(comp);
        else if (method === 8) bytes = zlib.inflateRawSync(Buffer.from(comp));
        else continue;
        out.push({ name, bytes });
    }
    return out;
}

// ---- scan + compat --------------------------------------------------------------
const DATA_RE = /\.(rez|ndat|bin|dat)$/i;
const ARCHIVE_RE = /\.zip$/i;
const NAME_HINT = /nova|evn|plug|plugin|ships|graphics|sounds|outfit|escape.?velocity/i;
const CORE_TYPES = ["sÿst", "syst", "spöb", "spob", "shïp", "ship", "gövt", "govt"];
const SKIP_ENTRY = /\.(txt|md|rtf|png|jpg|jpeg|gif|pdf|html?)$/i;

function scanFolder(dir) {
    let ents; try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch { return []; }
    const out = [];
    for (const ent of ents) {
        if (ent.isDirectory()) continue;
        const isArchive = ARCHIVE_RE.test(ent.name);
        const looksData = DATA_RE.test(ent.name) || NAME_HINT.test(ent.name);
        if (!isArchive && !looksData) continue;
        let s; try { s = fs.statSync(path.join(dir, ent.name)); } catch { continue; }
        out.push({ name: ent.name, path: path.join(dir, ent.name), size: s.size, mtime: s.mtimeMs, kind: isArchive ? "archive" : "data" });
    }
    out.sort((a, b) => b.mtime - a.mtime);
    return out;
}

function classify(map, baseMap) {
    if (!map) return { tier: "unreadable", reason: "not parseable as EV data" };
    const types = Object.keys(map.types);
    const core = types.filter((t) => CORE_TYPES.includes(t)).length;
    if (core >= 3 && map.count > 400) return { tier: "standalone", reason: `full base/TC — ${map.count} resources across ${types.length} types`, types };
    if (!baseMap) return { tier: "no-base", reason: `adds ${map.count} resources (no base loaded to compare)`, types };
    let add = 0, over = 0; const collisions = [];
    for (const t of types) {
        const baseIds = new Set(baseMap.types[t] || []);
        const o = [];
        for (const id of map.types[t]) { if (baseIds.has(id)) { over++; o.push(id); } else add++; }
        if (o.length) collisions.push({ type: t, ids: o.slice(0, 30) });
    }
    if (over === 0) return { tier: "adds-only", reason: `adds ${add} new, overrides nothing — safe`, types, add };
    return { tier: "overrides", reason: `overrides ${over}, adds ${add} — pair with its intended base`, types, over, add, collisions };
}

// Read a candidate file → type map (expands a single-fork zip's first data member).
function mapForPath(p) {
    const buf = fs.readFileSync(p);
    const u8 = new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
    if (ARCHIVE_RE.test(p)) {
        try {
            const entries = readZipEntries(u8).filter((e) => !SKIP_ENTRY.test(e.name));
            // classify by the first parseable member (packs usually have one main fork)
            for (const e of entries) { const m = forkTypeMap(new Uint8Array(e.bytes.buffer, e.bytes.byteOffset, e.bytes.byteLength)); if (m) return m; }
        } catch {}
        return null;
    }
    return forkTypeMap(u8);
}

// ---- HTTP interface (owns/handle) ----------------------------------------------
function owns(url) {
    const u = (url || "").split("?")[0];
    return u === "/ev/scan" || u === "/ev/inspect" || u === "/ev/load";
}

// baseMapProvider(): optional () => current base type map, so compat compares vs the
// loaded scenario. If absent, tiers fall back to add/standalone/no-base only.
function handle(req, res, ctx = {}) {
    const sendJson = ctx.sendJson || ((o, code = 200) => { res.writeHead(code, { "Content-Type": "application/json" }); res.end(JSON.stringify(o)); });
    const url = new URL(req.url, "http://localhost");
    const p = url.pathname;
    const baseMap = (ctx.baseMapProvider && (() => { try { return ctx.baseMapProvider(); } catch { return null; } })()) || null;

    try {
        if (p === "/ev/scan") {
            const dir = url.searchParams.get("dir");
            if (!dir) return sendJson({ error: "dir required" }, 400);
            return sendJson({ dir, candidates: scanFolder(dir) });
        }
        if (p === "/ev/inspect") {
            const fp = url.searchParams.get("path");
            if (!fp) return sendJson({ error: "path required" }, 400);
            const map = mapForPath(fp);
            return sendJson({ path: fp, count: map ? map.count : 0, types: map ? Object.keys(map.types) : [], report: classify(map, baseMap) });
        }
        if (p === "/ev/load") {
            let b = ""; req.on("data", (c) => { b += c; if (b.length > 4096) b = b.slice(0, 4096); });
            req.on("end", () => {
                let paths = []; try { paths = (JSON.parse(b || "{}").paths) || []; } catch {}
                if (!Array.isArray(paths) || !paths.length) return sendJson({ error: "paths[] required" }, 400);
                let tmp = null; const loaded = [], skipped = [], summary = [];
                try {
                    for (const fp of paths) {
                        if (ARCHIVE_RE.test(fp)) {
                            const buf = fs.readFileSync(fp);
                            const entries = readZipEntries(new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength)).filter((e) => !SKIP_ENTRY.test(e.name));
                            if (!tmp) tmp = fs.mkdtempSync(path.join(os.tmpdir(), "swek-ev-"));
                            for (const e of entries) {
                                const dest = path.join(tmp, path.basename(e.name));
                                fs.writeFileSync(dest, e.bytes);
                                const m = forkTypeMap(new Uint8Array(e.bytes.buffer, e.bytes.byteOffset, e.bytes.byteLength));
                                if (m) { loaded.push(e.name); summary.push({ file: e.name, count: m.count, types: Object.keys(m.types) }); }
                                else skipped.push({ name: e.name, why: "not EV data" });
                            }
                        } else {
                            const m = mapForPath(fp);
                            if (m) { loaded.push(fp); summary.push({ file: fp, count: m.count, types: Object.keys(m.types) }); }
                            else skipped.push({ name: fp, why: "not EV data" });
                        }
                    }
                } catch (e) {
                    if (tmp) { try { fs.rmSync(tmp, { recursive: true, force: true }); } catch {} }
                    return sendJson({ error: String(e && e.message || e) }, 500);
                } finally {
                    if (tmp) { try { fs.rmSync(tmp, { recursive: true, force: true }); } catch {} }
                }
                if (!loaded.length) return sendJson({ loaded: [], skipped, error: "nothing parsed as EV data" });
                return sendJson({ loaded, skipped, forks: summary, tempCleaned: true });
            });
            return;
        }
    } catch (e) {
        return sendJson({ error: String(e && e.message || e) }, 500);
    }
}

module.exports = { owns, handle, scanFolder, forkTypeMap, readZipEntries, classify };
