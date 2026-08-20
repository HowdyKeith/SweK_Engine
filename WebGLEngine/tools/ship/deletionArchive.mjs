// tools/ship/deletionArchive.mjs
//
// v3207 -- NOTHING IS DELETED WITHOUT A RECOVERY ZIP WRITTEN FIRST.
//
// Keith, deciding to delete two dead files: "i should have made sure when we deleted files before, that they
// exported and zipped up, just in case."
//
// THAT SENTENCE IS THE WHOLE OF THE LAST MONTH. removeCluster deleted 66 live modules across v3140..v3159 --
// fireSystem, kaijuAttackFx, PerfHUD, CascadedShadowPass, the entire optional-feature layer -- because its
// reachability derivation could not see a literal dynamic import. The bug was bad. THE BUG BEING UNRECOVERABLE
// IS WHAT MADE IT A MONTH. Recovery took: noticing at v3202 (43 versions late), diffing two zips, hand-writing
// a restore pass, iterating it to convergence three times, and finally Keith sweeping 203 archives across two
// drives by hand. A zip written at the moment of deletion would have made all of that a single unzip.
//
// The shipped build was the only backup, and it was an accident that it worked -- the ship ritual keeps two
// zips and prunes the rest, so this was ALWAYS going to be a race between noticing and pruning. Twice it was
// nearly lost: ui/knownState.js surfaced 17 versions late, brain/blobAutoTrain.mjs 41.
//
// SO: A TOOL THAT DELETES OWES A WAY BACK. Not a prompt, not a dry run, not a confirmation -- those all depend
// on the operator already knowing the answer, and the entire failure mode here was an operator who had every
// reason to believe the tool. The archive costs milliseconds and needs no judgement to be correct.
//
// STORED ENTRIES, NO COMPRESSION, ON PURPOSE. This runs at the moment of an irreversible action, so it has to
// be the least clever code in the tree: no zlib stream to misconfigure, bytes in equal bytes out, and a
// truncated archive is detectable because the central directory is written last.

import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

function crc32(buf) {
    if (typeof zlib.crc32 === "function") return zlib.crc32(buf) >>> 0;
    let c = ~0;
    for (let i = 0; i < buf.length; i++) { c ^= buf[i]; for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xEDB88320 & -(c & 1)); }
    return (~c) >>> 0;
}

function dosTime(d) {
    const t = ((d.getHours() & 31) << 11) | ((d.getMinutes() & 63) << 5) | ((d.getSeconds() / 2) & 31);
    const dt = (((d.getFullYear() - 1980) & 127) << 9) | (((d.getMonth() + 1) & 15) << 5) | (d.getDate() & 31);
    return { t, dt };
}

/** A zip of [{ name, bytes }] using stored entries. Returns the Buffer. */
export function buildZip(files, when = new Date()) {
    const { t, dt } = dosTime(when);
    const locals = [], central = [];
    let off = 0;
    for (const { name, bytes } of files) {
        const nb = Buffer.from(String(name).replace(/\\/g, "/"), "utf8");
        const crc = crc32(bytes);
        const lh = Buffer.alloc(30);
        lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4);
        lh.writeUInt16LE(t, 10); lh.writeUInt16LE(dt, 12);
        lh.writeUInt32LE(crc, 14); lh.writeUInt32LE(bytes.length, 18); lh.writeUInt32LE(bytes.length, 22);
        lh.writeUInt16LE(nb.length, 26);
        locals.push(lh, nb, bytes);
        const ch = Buffer.alloc(46);
        ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6);
        ch.writeUInt16LE(t, 12); ch.writeUInt16LE(dt, 14);
        ch.writeUInt32LE(crc, 16); ch.writeUInt32LE(bytes.length, 20); ch.writeUInt32LE(bytes.length, 24);
        ch.writeUInt16LE(nb.length, 28); ch.writeUInt32LE(off, 42);
        central.push(ch, nb);
        off += lh.length + nb.length + bytes.length;
    }
    const localBuf = Buffer.concat(locals), centralBuf = Buffer.concat(central);
    const eocd = Buffer.alloc(22);
    eocd.writeUInt32LE(0x06054b50, 0);
    eocd.writeUInt16LE(files.length, 8); eocd.writeUInt16LE(files.length, 10);
    eocd.writeUInt32LE(centralBuf.length, 12); eocd.writeUInt32LE(localBuf.length, 16);
    return Buffer.concat([localBuf, centralBuf, eocd]);
}

/**
 * Archive every path in `rels` (root-relative) to a timestamped zip, plus a WHY.txt.
 *
 * THROWS rather than returning a failure. A caller about to delete must not be able to treat "the archive
 * failed" as a warning it prints and steps past -- that is precisely the shape of every near-miss this tree has
 * had, where the thing that would have said stop was collected and never read. If the way back cannot be
 * written, the deletion does not happen.
 */
export function archiveBeforeDelete(root, rels, { reason = "", dir = null, tag = "removeCluster" } = {}) {
    if (!Array.isArray(rels) || rels.length === 0) return null;      // nothing to delete, nothing to archive
    const files = [];
    const missing = [];
    for (const rel of rels) {
        const abs = path.join(root, rel);
        try { files.push({ name: rel.replace(/\\/g, "/"), bytes: fs.readFileSync(abs) }); }
        catch (e) { missing.push(rel + " (" + (e.code || e.message) + ")"); }
    }
    if (files.length === 0) throw new Error("archiveBeforeDelete: could not read ANY of the " + rels.length + " files -- refusing to delete");

    const stamp = new Date().toISOString().replace(/[:.]/g, "-").replace("T", "_").slice(0, 19);
    // WHY.txt, because a zip of loose files with no explanation is a puzzle in six months. It records what was
    // removed, when, by which tool, and the tool's own stated reason -- the thing a restorer actually needs.
    const why =
        "SweK deletion archive\n" +
        "=====================\n\n" +
        "tool    : " + tag + "\n" +
        "when    : " + new Date().toISOString() + "\n" +
        "root    : " + root + "\n" +
        "files   : " + files.length + (missing.length ? " (" + missing.length + " unreadable, listed below)" : "") + "\n\n" +
        "reason  : " + (reason || "(none given)") + "\n\n" +
        "TO RESTORE: unzip this over the engine root. Paths are root-relative and already correct.\n" +
        "Then RE-RUN THE IMPORT GATES -- a restored file brings its own dependencies, and that has needed\n" +
        "more than one pass every single time it has been done here.\n\n" +
        "contents:\n" + files.map((f) => "  " + f.name).join("\n") + "\n" +
        (missing.length ? "\nUNREADABLE (NOT in this archive):\n" + missing.map((m) => "  " + m).join("\n") + "\n" : "");
    files.push({ name: "WHY.txt", bytes: Buffer.from(why, "utf8") });

    const outDir = dir || path.join(root, "tools", "ship", "deleted");
    fs.mkdirSync(outDir, { recursive: true });
    const outPath = path.join(outDir, "deleted_" + tag + "_" + stamp + ".zip");
    fs.writeFileSync(outPath, buildZip(files));

    // READ IT BACK. An archive that was never verified is a belief, and this one is load-bearing at the exact
    // moment nothing else is. Cheap: the file is on disk and small.
    const back = fs.readFileSync(outPath);
    if (back.length < 22 || back.readUInt32LE(0) !== 0x04034b50) throw new Error("archiveBeforeDelete: wrote " + outPath + " but it does not read back as a zip -- refusing to delete");

    return { path: outPath, count: files.length - 1, unreadable: missing };
}
