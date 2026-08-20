// comicBridge.js — v1138
// Cross-platform .cbz / .cbr comic viewer backend. A .cbz is a ZIP of images; a .cbr
// is a RAR of images. ZIP is read with a tiny pure-Node reader (zlib) so it works
// everywhere with no dependency. RAR is read via node-unrar-js (WASM, if installed)
// with a fallback chain to external 7z / unrar / bsdtar — first one that works wins.
//
// Config: ~/.voxelbridge/comics.json { dir }
// Pages are served as raw image bytes by the routes (img src points straight at them).

const fs = require("fs");
const os = require("os");
const path = require("path");
const zlib = require("zlib");
const { spawn, spawnSync } = require("child_process");
const crypto = require("crypto");

const CFG = path.join(os.homedir(), ".voxelbridge", "comics.json");
const IMG_RE = /\.(jpe?g|png|gif|webp|bmp|avif)$/i;
const _idToPath = new Map();           // id -> absolute path
const _entryCache = new Map();         // path -> { mtime, entries:[names] }

function load() { try { if (fs.existsSync(CFG)) return JSON.parse(fs.readFileSync(CFG, "utf8")); } catch {} return {}; }
function save(o) { try { fs.mkdirSync(path.dirname(CFG), { recursive: true }); fs.writeFileSync(CFG, JSON.stringify(o)); return true; } catch (e) { console.warn("[comics] save:", e.message); return false; } }
function getConfig() { const c = load(); return { ok: true, dir: c.dir || "", autoCrop: !!c.autoCrop, defaultFit: c.defaultFit || "width", phoneOptimize: !!c.phoneOptimize, targetKB: c.targetKB || 900, maxDim: c.maxDim || 1600 }; }
function setConfig(d) {
    const c = load(); d = d || {};
    if (typeof d.dir === "string") c.dir = String(d.dir).trim();
    if (typeof d.autoCrop === "boolean") c.autoCrop = d.autoCrop;
    if (typeof d.defaultFit === "string") c.defaultFit = d.defaultFit;
    if (typeof d.phoneOptimize === "boolean") c.phoneOptimize = d.phoneOptimize;
    if (d.targetKB != null && !isNaN(+d.targetKB)) c.targetKB = Math.max(150, Math.min(8000, +d.targetKB));
    if (d.maxDim != null && !isNaN(+d.maxDim)) c.maxDim = Math.max(600, Math.min(6000, +d.maxDim));
    save(c); return getConfig();
}

const _id = (p) => crypto.createHash("sha1").update(p).digest("hex").slice(0, 16);
const natCompare = (a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
const ctype = (name) => ({ jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", gif: "image/gif", webp: "image/webp", bmp: "image/bmp", avif: "image/avif" })[String(name).toLowerCase().split(".").pop()] || "application/octet-stream";

// ---- scan the library folder (one level + immediate subfolders) ----
// ---- PDF support (scrapers/pdf_tools.py via PyMuPDF) — renders pages so PDFs
// show in the comic reader, and exports embedded images out of a PDF. ----
const PDF_SCRIPT = path.join(__dirname, "scrapers", "pdf_tools.py");
const _pdfInfoCache = new Map();   // file -> { mtime, pages }
const isPdf = (f) => /\.pdf$/i.test(f || "");
function _pyCmd() { const v = process.env.VOXEL_VENV_PY; return (v && fs.existsSync(v)) ? v : (process.platform === "win32" ? "python" : "python3"); }
function _runPdf(args, timeoutMs) {
    return new Promise((resolve) => {
        let child, outBuf = "", errBuf = "", done = false;
        const t = setTimeout(() => { if (!done) { done = true; try { child && child.kill(); } catch {} resolve({ ok: false, error: "pdf_tools timeout" }); } }, timeoutMs || 30000);
        try { child = spawn(_pyCmd(), [PDF_SCRIPT, ...args], { windowsHide: true }); }
        catch (e) { clearTimeout(t); return resolve({ ok: false, error: "spawn failed: " + (e && e.message) }); }
        child.stdout.on("data", d => outBuf += d); child.stderr.on("data", d => errBuf += d);
        child.on("error", e => { if (done) return; done = true; clearTimeout(t); resolve({ ok: false, error: "python not found (" + (e && e.message) + ")" }); });
        child.on("close", () => { if (done) return; done = true; clearTimeout(t);
            const line = outBuf.trim().split("\n").filter(Boolean).pop() || "";
            try { resolve(JSON.parse(line)); } catch { resolve({ ok: false, error: "bad pdf_tools output", raw: outBuf.slice(0, 200), stderr: errBuf.slice(0, 200) }); } });
    });
}
async function _pdfPages(file) {
    let mtime = 0; try { mtime = fs.statSync(file).mtimeMs; } catch {}
    const c = _pdfInfoCache.get(file); if (c && c.mtime === mtime) return c.pages;
    const r = await _runPdf(["info", file], 20000);
    if (!r || !r.ok) return (r && r.need) ? { _need: r.need, _hint: r.hint } : null;
    _pdfInfoCache.set(file, { mtime, pages: r.pages });
    return r.pages;
}
const _pdfCacheDir = (file) => { let m = 0; try { m = Math.floor(fs.statSync(file).mtimeMs); } catch {} return path.join(os.tmpdir(), "voxel-pdf-cache", _id(file), String(m)); };
async function _pdfRender(file, i, dpi) {
    const outp = path.join(_pdfCacheDir(file), "p" + i + "@" + (dpi || 150) + ".png");
    if (fs.existsSync(outp)) { try { return fs.readFileSync(outp); } catch {} }
    const r = await _runPdf(["render", file, String(i), outp, String(dpi || 150)], 30000);
    if (!r || !r.ok) return null;
    try { return fs.readFileSync(outp); } catch { return null; }
}

function list() {
    const c = load();
    if (!c.dir) return { ok: false, error: "no comics folder set" };
    let dir = c.dir;
    if (!fs.existsSync(dir)) return { ok: false, error: "folder not found: " + dir };
    const out = [];
    const walk = (d, depth) => {
        let ents; try { ents = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
        for (const e of ents) {
            const full = path.join(d, e.name);
            if (e.isDirectory() && depth < 2) walk(full, depth + 1);
            else if (e.isFile() && /\.(cbz|cbr|zip|rar|pdf)$/i.test(e.name)) {
                let size = 0; try { size = fs.statSync(full).size; } catch {}
                const id = _id(full); _idToPath.set(id, full);
                out.push({ id, name: e.name.replace(/\.(cbz|cbr|zip|rar|pdf)$/i, ""), ext: e.name.split(".").pop().toLowerCase(), size });
            }
        }
    };
    walk(dir, 0);
    out.sort((a, b) => natCompare(a.name, b.name));
    return { ok: true, dir, count: out.length, comics: out };
}

// ---- ZIP (.cbz): pure-Node central-directory reader (ZIP64-aware) ----
function _zipEntries(file) {
    const fd = fs.openSync(file, "r");
    try {
        const size = fs.fstatSync(fd).size;
        const back = Math.min(size, 65557);
        const tail = Buffer.alloc(back); fs.readSync(fd, tail, 0, back, size - back);
        let eocd = -1;
        for (let i = tail.length - 22; i >= 0; i--) { if (tail.readUInt32LE(i) === 0x06054b50) { eocd = i; break; } }
        if (eocd < 0) return null;
        let count = tail.readUInt16LE(eocd + 10), cdSize = tail.readUInt32LE(eocd + 12), cdOff = tail.readUInt32LE(eocd + 16);
        // ZIP64: the standard EOCD maxes out at 0xFFFF entries / 0xFFFFFFFF
        // offsets. Big 4K-page comics blow past that, so follow the ZIP64
        // EOCD locator (sits just before the EOCD) to the real values.
        if (count === 0xFFFF || cdSize === 0xFFFFFFFF || cdOff === 0xFFFFFFFF) {
            // locator is 20 bytes ending right where the EOCD begins
            const locOff = eocd - 20;
            if (locOff >= 0 && tail.readUInt32LE(locOff) === 0x07064b50) {
                const z64Off = Number(tail.readBigUInt64LE(locOff + 8));
                const z64 = Buffer.alloc(56); fs.readSync(fd, z64, 0, 56, z64Off);
                if (z64.readUInt32LE(0) === 0x06064b50) {
                    count  = Number(z64.readBigUInt64LE(32));
                    cdSize = Number(z64.readBigUInt64LE(40));
                    cdOff  = Number(z64.readBigUInt64LE(48));
                }
            }
        }
        const cd = Buffer.alloc(cdSize); fs.readSync(fd, cd, 0, cdSize, cdOff);
        const entries = []; let p = 0;
        for (let n = 0; n < count && p + 46 <= cd.length; n++) {
            if (cd.readUInt32LE(p) !== 0x02014b50) break;
            const method = cd.readUInt16LE(p + 10);
            let compSize = cd.readUInt32LE(p + 20), uSize = cd.readUInt32LE(p + 24);
            const nLen = cd.readUInt16LE(p + 28), eLen = cd.readUInt16LE(p + 30), cLen = cd.readUInt16LE(p + 32);
            let lOff = cd.readUInt32LE(p + 42);
            const name = cd.toString("utf8", p + 46, p + 46 + nLen);
            // Per-entry ZIP64: any field that's the 0xFFFFFFFF sentinel is
            // carried (64-bit) in the 0x0001 extra block, in this order:
            // uncompressed, compressed, local-header offset, disk#.
            if (compSize === 0xFFFFFFFF || uSize === 0xFFFFFFFF || lOff === 0xFFFFFFFF) {
                let ep = p + 46 + nLen; const eEnd = ep + eLen;
                while (ep + 4 <= eEnd) {
                    const hid = cd.readUInt16LE(ep), hsz = cd.readUInt16LE(ep + 2); let q = ep + 4;
                    if (hid === 0x0001) {
                        if (uSize    === 0xFFFFFFFF && q + 8 <= eEnd) { uSize    = Number(cd.readBigUInt64LE(q)); q += 8; }
                        if (compSize === 0xFFFFFFFF && q + 8 <= eEnd) { compSize = Number(cd.readBigUInt64LE(q)); q += 8; }
                        if (lOff     === 0xFFFFFFFF && q + 8 <= eEnd) { lOff     = Number(cd.readBigUInt64LE(q)); q += 8; }
                        break;
                    }
                    ep += 4 + hsz;
                }
            }
            entries.push({ name, method, compSize, size: uSize, lOff });
            p += 46 + nLen + eLen + cLen;
        }
        return entries;
    } catch (e) { return null; } finally { fs.closeSync(fd); }
}
function _zipExtract(file, ent) {
    const fd = fs.openSync(file, "r");
    try {
        const lh = Buffer.alloc(30); fs.readSync(fd, lh, 0, 30, ent.lOff);
        if (lh.readUInt32LE(0) !== 0x04034b50) return null;
        const nLen = lh.readUInt16LE(26), eLen = lh.readUInt16LE(28);
        const dataOff = ent.lOff + 30 + nLen + eLen;
        const comp = Buffer.alloc(ent.compSize); fs.readSync(fd, comp, 0, ent.compSize, dataOff);
        if (ent.method === 0) return comp;
        if (ent.method === 8) return zlib.inflateRawSync(comp);
        return null;   // unsupported method (deflate64/bzip2/lzma/zstd) → caller falls back to a system tool
    } catch (e) { return null; } finally { fs.closeSync(fd); }
}
// Fallback: when the pure-Node reader can't handle the archive (exotic
// compression, a malformed/edge-case central directory), shell out to
// whatever extractor the OS has. Each prints one entry to stdout; first
// that yields bytes wins. Windows always has the .NET ZipFile path.
function _zipExtractSystem(file, name) {
    const attempts = [
        ["unzip",      ["-p", file, name]],
        ["7z",         ["e", "-so", file, name]],
        ["7za",        ["e", "-so", file, name]],
        ["bsdtar",     ["-xOf", file, name]],
    ];
    for (const [cmd, args] of attempts) {
        try {
            const r = spawnSync(cmd, args, { maxBuffer: 256 * 1024 * 1024, windowsHide: true });
            if (r.status === 0 && r.stdout && r.stdout.length) return r.stdout;
        } catch (e) { /* not installed — try next */ }
    }
    // Windows .NET fallback — base64 a single entry to stdout. Always present.
    if (process.platform === "win32") {
        try {
            const ps = `$ErrorActionPreference='Stop';Add-Type -A System.IO.Compression.FileSystem;` +
                `$z=[IO.Compression.ZipFile]::OpenRead(${JSON.stringify(file)});` +
                `try{$e=$z.Entries|?{$_.FullName -eq ${JSON.stringify(name)}}|select -f 1;` +
                `$s=$e.Open();$m=New-Object IO.MemoryStream;$s.CopyTo($m);` +
                `[Console]::Out.Write([Convert]::ToBase64String($m.ToArray()))}finally{$z.Dispose()}`;
            const r = spawnSync("powershell", ["-NoProfile", "-NonInteractive", "-Command", ps], { maxBuffer: 256 * 1024 * 1024, windowsHide: true });
            if (r.status === 0 && r.stdout && r.stdout.length) { const b = Buffer.from(r.stdout.toString("utf8").trim(), "base64"); if (b.length) return b; }
        } catch (e) { /* fall through */ }
    }
    return null;
}

// ---- RAR (.cbr): node-unrar-js (WASM) with external fallbacks ----
function _spawnCapture(cmd, args) {
    return new Promise((resolve) => {
        let child; const chunks = []; let err = "";
        try { child = spawn(cmd, args, { windowsHide: true }); } catch (e) { return resolve({ ok: false, error: e.message }); }
        child.stdout.on("data", d => chunks.push(d));
        child.stderr.on("data", d => err += d);
        child.on("error", e => resolve({ ok: false, error: e.message }));
        child.on("close", code => { const buf = Buffer.concat(chunks); resolve({ ok: code === 0 && buf.length > 0, buf, code, err }); });
    });
}
async function _rarList(file) {
    try {
        const unrar = require("node-unrar-js");
        const ex = await unrar.createExtractorFromData({ data: Uint8Array.from(fs.readFileSync(file)).buffer });
        const names = [...ex.getFileList().fileHeaders].filter(h => !h.flags.directory).map(h => h.name);
        if (names.length) return names;
    } catch {}
    for (const [cmd, args, parse] of [
        ["unrar", ["lb", file], s => s.split(/\r?\n/)],
        ["bsdtar", ["-tf", file], s => s.split(/\r?\n/)],
        ["7z", ["l", "-ba", "-slt", file], s => (s.match(/^Path = (.+)$/gm) || []).map(l => l.slice(7))],
    ]) { const r = await _spawnCapture(cmd, args); if (r.ok) { const n = parse(r.buf.toString("utf8")).filter(Boolean); if (n.length) return n; } }
    return null;
}
async function _rarExtract(file, name) {
    try {
        const unrar = require("node-unrar-js");
        const ex = await unrar.createExtractorFromData({ data: Uint8Array.from(fs.readFileSync(file)).buffer });
        const files = [...ex.extract({ files: [name] }).files];
        if (files[0] && files[0].extraction) return Buffer.from(files[0].extraction);
    } catch {}
    for (const [cmd, args] of [
        ["7z", ["e", "-so", file, name]],
        ["unrar", ["p", "-inul", file, name]],
        ["bsdtar", ["-xOf", file, name]],
    ]) { const r = await _spawnCapture(cmd, args); if (r.ok) return r.buf; }
    return null;
}

// ---- unified page list + extract (cached entry list per archive) ----
async function _entries(file) {
    let mtime = 0; try { mtime = fs.statSync(file).mtimeMs; } catch {}
    const cached = _entryCache.get(file);
    if (cached && cached.mtime === mtime) return cached.entries;
    const isZip = /\.(cbz|zip)$/i.test(file);
    let names;
    if (isZip) { const e = _zipEntries(file); names = e ? e.filter(x => IMG_RE.test(x.name)).map(x => x.name) : null; }
    else names = await _rarList(file);
    if (!names) return null;
    names = names.filter(n => IMG_RE.test(n)).sort(natCompare);
    _entryCache.set(file, { mtime, entries: names });
    return names;
}
async function pages(id) {
    const file = _idToPath.get(id); if (!file) return { ok: false, error: "unknown id (re-list first)" };
    if (isPdf(file)) {
        const p = await _pdfPages(file);
        if (p && p._need) return { ok: false, error: "PyMuPDF not installed", need: p._need, hint: p._hint || "pip install PyMuPDF" };
        if (typeof p !== "number") return { ok: false, error: "could not read PDF" };
        return { ok: true, id, count: p, name: path.basename(file), kind: "pdf" };
    }
    const names = await _entries(file);
    if (!names) return { ok: false, error: "could not read archive (for .cbr install 7-Zip/unrar, or npm install for the bundled reader)" };
    return { ok: true, id, count: names.length, name: path.basename(file) };
}
// ---- phone/tablet page optimization (Pillow via scrapers/img_optimize.py) ----
const IMG_OPT_SCRIPT = path.join(__dirname, "scrapers", "img_optimize.py");
let _pillowOk = null;
function _hasPillow() {
    if (_pillowOk !== null) return _pillowOk;
    try { const r = spawnSync(_pyCmd(), ["-c", "import PIL"], { windowsHide: true, timeout: 12000 }); _pillowOk = (r.status === 0); } catch { _pillowOk = false; }
    return _pillowOk;
}
const _optCacheDir = (file) => { let m = 0; try { m = Math.floor(fs.statSync(file).mtimeMs); } catch {} return path.join(os.tmpdir(), "voxel-comic-opt", _id(file), String(m)); };
// Returns optimized WebP { buf, contentType }; on missing Pillow or any failure,
// returns the ORIGINAL bytes so the page still renders.
function _optimizeBuf(file, i, buf, ext, opts) {
    if (!_hasPillow()) return { buf, contentType: ctype("x." + ext), need: "pillow" };
    const mode = (opts.crop && opts.opt) ? "crop-optimize" : (opts.crop ? "crop" : "optimize");
    const maxDim = opts.maxDim || 1600, targetKB = opts.targetKB || 900;
    const dir = _optCacheDir(file);
    const outp = path.join(dir, i + "-" + (opts.crop ? "c" : "") + (opts.opt ? "o" : "") + "-" + maxDim + "-" + targetKB + ".webp");
    try {
        if (fs.existsSync(outp) && fs.statSync(outp).size) return { buf: fs.readFileSync(outp), contentType: "image/webp" };
        fs.mkdirSync(dir, { recursive: true });
        const tmpIn = path.join(dir, "_in_" + i + "." + (ext || "bin"));
        fs.writeFileSync(tmpIn, buf);
        const r = spawnSync(_pyCmd(), [IMG_OPT_SCRIPT, mode, tmpIn, outp, String(maxDim), String(targetKB)], { windowsHide: true, timeout: 60000 });
        try { fs.unlinkSync(tmpIn); } catch {}
        if (r.status === 0 && fs.existsSync(outp) && fs.statSync(outp).size) return { buf: fs.readFileSync(outp), contentType: "image/webp" };
    } catch (e) {}
    return { buf, contentType: ctype("x." + ext) };
}

async function page(id, i, opts) {
    opts = opts || {};
    const file = _idToPath.get(id); if (!file) return { error: "unknown id" };
    let buf, ext;
    if (isPdf(file)) {
        const p = await _pdfPages(file);
        if (typeof p !== "number") return { error: "PyMuPDF not installed (pip install PyMuPDF)" };
        i = Math.max(0, Math.min(p - 1, parseInt(i, 10) || 0));
        const vdpi = Math.max(72, Math.min(400, parseInt(opts.dpi, 10) || 150));   // v1549 — viewer render quality
        buf = await _pdfRender(file, i, vdpi);
        if (!buf || !buf.length) return { error: "render failed for page " + i };
        ext = "png";
    } else {
        const names = await _entries(file); if (!names) return { error: "unreadable archive" };
        i = Math.max(0, Math.min(names.length - 1, parseInt(i, 10) || 0));
        const name = names[i]; if (!name) return { error: "no page" };
        if (/\.(cbz|zip)$/i.test(file)) {
            const ents = _zipEntries(file); const e = ents && ents.find(x => x.name === name);
            buf = e ? _zipExtract(file, e) : null;
            if (!buf || !buf.length) buf = _zipExtractSystem(file, name);   // exotic compression / edge case
        } else buf = await _rarExtract(file, name);
        if (!buf || !buf.length) return { error: "could not extract \"" + name + "\" — unsupported compression or a corrupt archive (no system unzip/7z found either)" };
        ext = (name.split(".").pop() || "jpg").toLowerCase();
    }
    if (opts.crop || opts.opt) return _optimizeBuf(file, i, buf, ext, opts);
    return { buf, contentType: ctype("x." + ext) };
}

// Export images out of a PDF. Two modes:
//   "pages"    (default) — render EACH PAGE to its own image named <pdf>_pNNN.<fmt>.
//                           PNG is lossless (= 100%); jpg/webp use opts.quality. opts.dpi sets resolution.
//   "embedded"           — pull the ORIGINAL embedded image streams (lossless byte copy), also named <pdf>_pNNN.
// Defaults to <comics dir>/_exported/<pdf name>/.
async function exportImages(id, outDir, opts) {
    opts = opts || {};
    const file = _idToPath.get(id); if (!file) return { ok: false, error: "unknown id (re-list first)" };
    if (!isPdf(file)) return { ok: false, error: "image export is for PDFs" };
    let dest = (outDir && String(outDir).trim()) || "";
    if (!dest) { const c = load(); const base = c.dir || path.dirname(file); dest = path.join(base, "_exported", path.basename(file).replace(/\.pdf$/i, "")); }
    const mode = (opts.mode === "embedded") ? "embedded" : "pages";
    let r;
    if (mode === "embedded") {
        r = await _runPdf(["extract-images", file, dest], 180000);
    } else {
        const dpi = Math.max(50, Math.min(600, parseInt(opts.dpi, 10) || 200));
        const fmt = ["png", "jpg", "jpeg", "webp"].includes(String(opts.format || "").toLowerCase()) ? String(opts.format).toLowerCase() : "png";
        const quality = Math.max(1, Math.min(100, parseInt(opts.quality, 10) || 100));
        r = await _runPdf(["render-pages", file, dest, String(dpi), fmt, String(quality)], 600000);
    }
    if (!r || !r.ok) return { ok: false, error: (r && r.error) || "export failed", need: r && r.need, hint: r && r.hint };
    return { ok: true, mode, count: r.count, dir: r.dir, files: r.files, fmt: r.fmt, dpi: r.dpi, quality: r.quality, note: r.note };
}

// v1549 — delete a comic/PDF file (with a safety check that it's inside the comics folder).
function deleteComic(id) {
    const file = _idToPath.get(id); if (!file) return { ok: false, error: "unknown id (re-list first)" };
    const c = load();
    const abs = path.resolve(file);
    if (c.dir) {
        const root = path.resolve(c.dir);
        if (!(abs === root || abs.startsWith(root + path.sep))) return { ok: false, error: "refusing to delete a file outside the comics folder" };
    }
    try { fs.unlinkSync(abs); } catch (e) { return { ok: false, error: "delete failed: " + ((e && e.message) || e) }; }
    try { _idToPath.delete(id); } catch {}
    try { _pdfInfoCache.delete(file); } catch {}
    return { ok: true, deleted: path.basename(abs) };
}

// One-click install of PyMuPDF (the only dep PDF support needs).
function installPymupdf() {
    return new Promise((resolve) => {
        let child, buf = "", done = false;
        const t = setTimeout(() => { if (!done) { done = true; try { child && child.kill(); } catch {} resolve({ ok: false, error: "pip install timed out" }); } }, 180000);
        try { child = spawn(_pyCmd(), ["-m", "pip", "install", "PyMuPDF"], { windowsHide: true }); }
        catch (e) { clearTimeout(t); return resolve({ ok: false, error: "spawn failed: " + (e && e.message) }); }
        child.stdout.on("data", d => buf += d); child.stderr.on("data", d => buf += d);
        child.on("error", e => { if (done) return; done = true; clearTimeout(t); resolve({ ok: false, error: "python/pip not found (" + (e && e.message) + ")" }); });
        child.on("close", code => { if (done) return; done = true; clearTimeout(t); _pdfInfoCache.clear(); resolve({ ok: code === 0, code, log: String(buf).slice(-400) }); });
    });
}

// v1194 — page text for narration. PDFs have a real text layer (PyMuPDF);
// image comics (.cbz/.cbr) don't, so they'd need OCR.
async function pageText(id, i) {
    const file = _idToPath.get(id); if (!file) return { ok: false, error: "unknown id (re-list first)" };
    if (!isPdf(file)) return { ok: false, error: "image comic — no text layer to narrate (needs OCR)", needsOcr: true };
    const p = await _pdfPages(file);
    if (p && p._need) return { ok: false, error: "PyMuPDF not installed", need: p._need, hint: p._hint || "pip install PyMuPDF" };
    if (typeof p !== "number") return { ok: false, error: "could not read PDF" };
    i = Math.max(0, Math.min(p - 1, parseInt(i, 10) || 0));
    const r = await _runPdf(["text", file, String(i)], 20000);
    if (!r || !r.ok) return { ok: false, error: (r && r.error) || "text extract failed", need: r && r.need };
    return { ok: true, i, text: String(r.text || "").trim() };
}

module.exports = { getConfig, setConfig, list, pages, page, exportImages, deleteComic, installPymupdf, pageText };
