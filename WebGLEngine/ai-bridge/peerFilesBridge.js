// ai-bridge/peerFilesBridge.js — v1591
// Browse / grab / send files between a peer's Downloads folder and ours.
// EVERYTHING that touches a peer's disk is scoped to that peer's Downloads dir (path traversal is
// rejected) so the remote surface is just "Downloads" and nothing else. The send SOURCE on the local
// machine can be any path the user picked (they're driving their own box), but it only ever lands in
// the peer's Downloads.
const fs = require("fs");
const crypto = require("crypto");   // v3147 -- content verification for peer transfer
const path = require("path");

// Resolve a Downloads-relative path safely UNDER the Downloads base. Returns the absolute path, or
// null if it escaped (absolute input, .. traversal, symlink-ish trickery via resolve).
function safeUnder(base, rel) {
    if (rel == null) rel = "";
    rel = String(rel).replace(/\\/g, "/").replace(/^\/+/, "");           // strip leading slashes -> relative
    const baseAbs = path.resolve(base);
    const full = path.resolve(baseAbs, rel);
    if (full !== baseAbs && !full.startsWith(baseAbs + path.sep)) return null;
    return full;
}

// List one Downloads subdir -> { ok, sub, entries:[{name,dir,size,mtime}] }
function listDir(downloadsDir, sub) {
    const dir = safeUnder(downloadsDir, sub || "");
    if (!dir) return { ok: false, error: "path escapes Downloads" };
    let entries = [];
    try {
        entries = fs.readdirSync(dir, { withFileTypes: true })
            .filter(d => !d.name.startsWith("."))
            .map(d => {
                let size = 0, mtime = 0;
                try { const st = fs.statSync(path.join(dir, d.name)); size = st.size; mtime = st.mtimeMs; } catch {}
                return { name: d.name, dir: d.isDirectory(), size, mtime };
            })
            .sort((a, b) => (Number(b.dir) - Number(a.dir)) || a.name.localeCompare(b.name));
    } catch (e) { return { ok: false, error: String(e && (e.message || e)) }; }
    return { ok: true, sub: String(sub || ""), entries };
}

// Recursively list FILES under a Downloads-relative path -> [{ rel, size }] (rel is Downloads-relative,
// keeps the folder name so structure is preserved on the other end). Works for a single file too.
/**
 * v3147 -- attach a whole-file digest, or say plainly that none was computed.
 *
 * A FAILED HASH IS NOT AN ABSENT HASH. If the read throws, the entry carries hash:null and hashError, so the
 * receiver refuses rather than treating "could not read it here" as "nothing to check" -- v3089's law, which
 * assetSync learned by shipping the other behaviour first.
 */
function stamp(entry, abs, wantHash) {
    if (!wantHash) return entry;
    try { entry.hash = crypto.createHash("sha256").update(fs.readFileSync(abs)).digest("hex"); }
    catch (e) { entry.hash = null; entry.hashError = String((e && e.message) || e); }
    return entry;
}

// v3147 -- THE WALK CAN NOW CARRY A CONTENT HASH, WHICH IS WHAT v3143 WAS WAITING FOR.
//
// v3104 taught the Grab to compare the size the walk reported against the bytes received. That catches
// TRUNCATION and cannot catch CORRUPTION: a proxy serving a same-length error body, a padded partial write or a
// flipped bit all arrive at exactly the expected length and are written under the right name. v3143 built the
// verification and could not wire it, because THE SENDING SIDE REPORTED ONLY { rel, size } and a receiver
// shipped alone would refuse every transfer for want of a hash nobody sends. This is the other end.
//
// OPT-IN, because a listing used to BROWSE should not pay for it. Measured on this tree: whole-file SHA-256
// over 3193 files and 62 MB costs 1.8 SECONDS -- negligible against a transfer of the same bytes, and pure
// waste for somebody clicking through a directory. The Grab asks; the browser does not.
function walkUnder(downloadsDir, rel, opts) {
    const wantHash = !!(opts && opts.hash);
    const root = safeUnder(downloadsDir, rel || "");
    if (!root) return [];
    let st; try { st = fs.statSync(root); } catch { return []; }
    const out = [];
    if (st.isFile()) { out.push(stamp({ rel: String(rel || path.basename(root)).replace(/\\/g, "/").replace(/^\/+/, ""), size: st.size }, root, wantHash)); return out; }
    const baseRel = String(rel || "").replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
    const walk = (abs, pre) => {
        let ents = []; try { ents = fs.readdirSync(abs, { withFileTypes: true }); } catch { return; }
        for (const e of ents) {
            if (e.name.startsWith(".")) continue;
            const a = path.join(abs, e.name), r = pre ? (pre + "/" + e.name) : e.name;
            if (e.isDirectory()) walk(a, r);
            else { let size = 0; try { size = fs.statSync(a).size; } catch {} out.push(stamp({ rel: r, size }, a, wantHash)); }
        }
    };
    walk(root, baseRel);
    return out;
}

// Absolute path for a Downloads-relative file, ensuring the parent dir exists (for writes). null if escaped.
function fileAbs(downloadsDir, rel, mkParent) {
    const full = safeUnder(downloadsDir, rel);
    if (!full) return null;
    if (mkParent) { try { fs.mkdirSync(path.dirname(full), { recursive: true }); } catch {} }
    return full;
}

// Walk an ARBITRARY LOCAL path (the send source) -> [{ abs, rel }] where rel includes the basename, so
// "send /foo/myfolder" lands as Downloads/myfolder/... on the peer, and "send /foo/x.glb" -> Downloads/x.glb.
function walkLocal(absPath) {
    const out = [];
    let st; try { st = fs.statSync(absPath); } catch { return out; }
    const base = path.basename(absPath);
    if (st.isFile()) { out.push({ abs: absPath, rel: base, size: st.size }); return out; }
    const walk = (abs, pre) => {
        let ents = []; try { ents = fs.readdirSync(abs, { withFileTypes: true }); } catch { return; }
        for (const e of ents) {
            if (e.name.startsWith(".")) continue;
            const a = path.join(abs, e.name), r = pre + "/" + e.name;
            if (e.isDirectory()) walk(a, r);
            else { let size = 0; try { size = fs.statSync(a).size; } catch {} out.push({ abs: a, rel: r, size }); }
        }
    };
    walk(absPath, base);
    return out;
}

module.exports = { safeUnder, listDir, walkUnder, fileAbs, walkLocal };
