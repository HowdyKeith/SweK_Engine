// WebGLEngine/tools/makeIncremental.mjs — v2631
//
// PRODUCE a swek-incremental package -- the native format the engine already ingests (ai-bridge/incrementalUpdate.js
// + server.js _applyIncremental: parse -> plan -> back up -> apply -> validate module graph -> roll back if broken
// -> stamp version -> restart). The receiving side has existed for ages; this is the missing producing side, so a
// mid-topic patch can be handed over as one JSON the engine self-applies instead of a full 19MB zip.
//
// It reuses the RECEIVER's own safeRelPath + compareVersions, so the producer and consumer cannot disagree about
// what is a legal path or a newer version -- one definition, both ends.
//
// Usage:
//   node tools/makeIncremental.mjs --to v2631 --from v2630 --note "..." \
//        --write WebGLEngine/lan.html --write WebGLEngine/tools/x.mjs --delete WebGLEngine/old.js \
//        --out /tmp/swek-v2631-incremental.json
"use strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..", "..");           // install root (parent of WebGLEngine/)
const require = createRequire(import.meta.url);
const inc = require("../ai-bridge/incrementalUpdate.js");

// Build the package object. writes/deletes are paths RELATIVE TO THE INSTALL ROOT (e.g. "WebGLEngine/lan.html").
export function makeIncremental({ toVersion, fromVersion, note, writes = [], deletes = [] }) {
    if (!toVersion || !/^v?\d+/.test(String(toVersion))) throw new Error("makeIncremental: toVersion required (vNNNN)");
    const files = [];
    for (const rel of writes) {
        if (!inc.safeRelPath(rel)) throw new Error("unsafe write path: " + rel);
        const abs = path.join(ROOT, rel);
        if (!fs.existsSync(abs)) throw new Error("write file not found in tree: " + rel);
        files.push({ path: rel, action: "write", content: fs.readFileSync(abs).toString("base64") });
    }
    for (const rel of deletes) {
        if (!inc.safeRelPath(rel)) throw new Error("unsafe delete path: " + rel);
        files.push({ path: rel, action: "delete" });
    }
    const pkg = { type: "swek-incremental", toVersion: String(toVersion), files };
    if (fromVersion) pkg.fromVersion = String(fromVersion);
    if (note) pkg.note = String(note);
    return pkg;
}

// ---- cumulative-since-baseline manifest ----------------------------------------------------------------------------
//
// Incrementals are CUMULATIVE since the last full-zip baseline. If they weren't, someone who applied the v2630
// full zip and then downloaded only the v2632 incremental would silently miss v2631's files -- the receiver
// checks "is this newer", not "did you apply everything between". So the producer keeps a running manifest of
// every path touched since the baseline, and every package carries the WHOLE set at current content. The most
// recent incremental is therefore always sufficient on its own for anyone at or after the baseline. A full-zip
// ship calls resetBaseline() to start the next accumulation window.
const MANIFEST = path.join(ROOT, "WebGLEngine", "tools", ".incremental-manifest.json");

export function loadManifest(mp = MANIFEST) {
    try { return JSON.parse(fs.readFileSync(mp, "utf8")); } catch { return { baseline: null, writes: [], deletes: [] }; }
}
export function saveManifest(m, mp = MANIFEST) { fs.writeFileSync(mp, JSON.stringify(m, null, 2)); }
export function resetBaseline(version, mp = MANIFEST) { saveManifest({ baseline: String(version), writes: [], deletes: [] }, mp); }

export function accumulate({ writes = [], deletes = [] }, mp = MANIFEST) {
    const m = loadManifest(mp);
    const uw = new Set(m.writes), ud = new Set(m.deletes);
    for (const w of writes) { uw.add(w); ud.delete(w); }   // a re-added path is no longer a pending delete
    for (const d of deletes) { ud.add(d); uw.delete(d); }  // a deleted path is no longer a pending write
    m.writes = [...uw]; m.deletes = [...ud];
    saveManifest(m, mp);
    return m;
}

// Build a cumulative package from the manifest: all accumulated paths, each read at CURRENT content.
export function emitCumulative({ toVersion, note }, mp = MANIFEST) {
    const m = loadManifest(mp);
    return makeIncremental({ toVersion, fromVersion: m.baseline || undefined, note, writes: m.writes, deletes: m.deletes });
}

// CLI
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    const a = process.argv.slice(2);
    const opt = { writes: [], deletes: [] };
    let resetTo = null;
    for (let i = 0; i < a.length; i++) {
        if (a[i] === "--to") opt.toVersion = a[++i];
        else if (a[i] === "--note") opt.note = a[++i];
        else if (a[i] === "--write") opt.writes.push(a[++i]);
        else if (a[i] === "--delete") opt.deletes.push(a[++i]);
        else if (a[i] === "--out") opt.out = a[++i];
        else if (a[i] === "--reset-baseline") resetTo = a[++i];
    }
    if (resetTo) {
        resetBaseline(resetTo);
        console.log("incremental baseline reset to " + resetTo + " (accumulation window cleared)");
    } else {
        // accumulate THIS round's changes, then emit a package covering EVERYTHING since the baseline
        accumulate({ writes: opt.writes, deletes: opt.deletes });
        const pkg = emitCumulative({ toVersion: opt.toVersion, note: opt.note });
        const json = JSON.stringify(pkg);
        const out = opt.out || path.join(ROOT, "swek-" + pkg.toVersion + "-incremental.json");
        fs.writeFileSync(out, json);
        const kb = (json.length / 1024).toFixed(1);
        const w = pkg.files.filter((f) => f.action === "write").length, d = pkg.files.length - w;
        console.log("swek-incremental (cumulative since " + (pkg.fromVersion || "?") + ") -> " + pkg.toVersion
            + ": " + w + " write, " + d + " delete, " + kb + " KB -> " + out);
    }
}
