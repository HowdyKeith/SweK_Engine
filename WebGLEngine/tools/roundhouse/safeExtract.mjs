// tools/roundhouse/safeExtract.mjs
//
// v2972 -- EXTRACTION, AND WHY IT IS WRITTEN HERE RATHER THAN SHELLED OUT.
//
// Applying a staged build means extracting an archive. There is no zip library in this tree and node has no
// built-in zip reader, so the options were: add a dependency, shell out to `unzip`, or parse the container with
// zlib and fs. The third was chosen for a reason that is not purity:
//
//     THE EXTRACTOR IS THE THING STANDING BETWEEN A SIGNED ARCHIVE AND ARBITRARY FILE WRITES.
//
// ZIP-SLIP is the classic archive vulnerability: an entry named "../../../etc/cron.d/x" escapes the destination
// directory and lands wherever it likes. A signature proves an archive came from the holder of a key; it does not
// prove the archive is harmless, and the verified tier exists precisely so a machine can act without a human
// reading the contents first. Shelling out to `unzip` delegates that decision to whatever unzip happens to do.
// Writing it here makes path containment a property this tree can gate -- and it is gated.
//
// EVERY ENTRY MUST RESOLVE INSIDE THE DESTINATION. Absolute paths, drive letters, parent traversal, and symlink
// entries are all refused, and a refusal aborts the whole extraction rather than skipping one file: a build with
// a hostile entry is not a build to install three quarters of.

import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

const EOCD_SIG = 0x06054b50, CEN_SIG = 0x02014b50;

/** Locate and read the central directory. Returns the entry list without inflating anything. */
export function readCentralDirectory(buf) {
    let eocd = -1;
    for (let i = buf.length - 22; i >= 0 && i > buf.length - 70000; i--) {
        if (buf.readUInt32LE(i) === EOCD_SIG) { eocd = i; break; }
    }
    if (eocd < 0) throw new Error("not a zip: no end-of-central-directory record");
    const count = buf.readUInt16LE(eocd + 10);
    let off = buf.readUInt32LE(eocd + 16);
    const entries = [];
    for (let i = 0; i < count; i++) {
        if (buf.readUInt32LE(off) !== CEN_SIG) throw new Error("corrupt central directory at entry " + i);
        const method = buf.readUInt16LE(off + 10);
        const compSize = buf.readUInt32LE(off + 20);
        const uncompSize = buf.readUInt32LE(off + 24);
        const nameLen = buf.readUInt16LE(off + 28);
        const extraLen = buf.readUInt16LE(off + 30);
        const commentLen = buf.readUInt16LE(off + 32);
        const externalAttrs = buf.readUInt32LE(off + 38);
        const localOff = buf.readUInt32LE(off + 42);
        const name = buf.slice(off + 46, off + 46 + nameLen).toString("utf8");
        // unix mode lives in the high 16 bits; S_IFLNK = 0xA000
        const unixMode = (externalAttrs >>> 16) & 0xffff;
        entries.push({ name, method, compSize, uncompSize, localOff, unixMode, isSymlink: (unixMode & 0xf000) === 0xa000 });
        off += 46 + nameLen + extraLen + commentLen;
    }
    return entries;
}

/**
 * Is this entry safe to write under `dest`? Returns null if safe, or the reason it is not.
 * Deliberately strict: anything it cannot confidently place inside dest is refused.
 */
export function unsafeReason(name, entry) {
    if (!name || name.length > 1000) return "empty or absurdly long name";
    if (name.includes("\0")) return "name contains a NUL byte";
    if (path.isAbsolute(name) || /^[a-zA-Z]:[\\/]/.test(name)) return "absolute path";
    if (name.startsWith("/") || name.startsWith("\\")) return "rooted path";
    const parts = name.replace(/\\/g, "/").split("/");
    if (parts.some((p) => p === "..")) return "parent traversal ('..')";
    if (entry && entry.isSymlink) return "symlink entry -- a link can point anywhere after extraction";
    return null;
}

/**
 * Extract into `dest`, which MUST NOT already exist -- applying a build never overwrites an existing tree, so a
 * failed or hostile extraction cannot damage the install in use. Refuses the whole archive on the first unsafe
 * entry. Returns a summary; performs no restart and deletes nothing.
 */
export function extractZip(buf, dest, { maxBytes = 512 * 1024 * 1024 } = {}) {
    if (fs.existsSync(dest)) throw new Error("destination already exists: " + dest + " -- refusing to overwrite an existing tree");
    const entries = readCentralDirectory(buf);

    // validate EVERY entry before writing ANY of them
    for (const e of entries) {
        const bad = unsafeReason(e.name, e);
        if (bad) throw new Error(`refusing the whole archive: entry ${JSON.stringify(e.name.slice(0, 80))} has ${bad}`);
        if (e.method !== 0 && e.method !== 8) throw new Error(`unsupported compression method ${e.method} in ${e.name}`);
    }
    const total = entries.reduce((a, e) => a + e.uncompSize, 0);
    if (total > maxBytes) throw new Error(`archive expands to ${total} bytes, over the ${maxBytes} cap`);

    let files = 0, dirs = 0;
    for (const e of entries) {
        const outPath = path.join(dest, e.name);
        // belt and braces: confirm the RESOLVED path is still inside dest, whatever the name did
        const rel = path.relative(dest, outPath);
        if (rel.startsWith("..") || path.isAbsolute(rel)) throw new Error("resolved path escaped the destination: " + e.name);
        if (e.name.endsWith("/")) { fs.mkdirSync(outPath, { recursive: true }); dirs++; continue; }
        fs.mkdirSync(path.dirname(outPath), { recursive: true });
        // local header: 30 bytes + name + extra, then the data
        const lh = e.localOff;
        const nameLen = buf.readUInt16LE(lh + 26), extraLen = buf.readUInt16LE(lh + 28);
        const dataStart = lh + 30 + nameLen + extraLen;
        const raw = buf.slice(dataStart, dataStart + e.compSize);
        const out = e.method === 0 ? raw : zlib.inflateRawSync(raw);
        fs.writeFileSync(outPath, out);
        // preserve the executable bit where the archive recorded one (the Mac .command launchers need it)
        if (e.unixMode && (e.unixMode & 0o111)) { try { fs.chmodSync(outPath, e.unixMode & 0o777); } catch {} }
        files++;
    }
    return { dest, files, dirs, bytes: total };
}
