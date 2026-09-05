#!/usr/bin/env node
// WebGLEngine/tools/ship/packFonts.mjs -- v4487
//
// PACKS EVERY REGISTERED FONT'S DECLARED ALPHABETS INTO vendor/fonts/<family>/<Name>.<set>.slug.bin, AT SHIP TIME.
// text/slugPack.mjs does the packing; text/fontRegistry.mjs says which families and which alphabets (CHAR_SETS) and
// records each pack's sha256, which this tool writes back under `--write`. Without `--write` it packs in memory and
// reports which files on disk are STALE (bytes differ from a fresh pack), MISSING, or CURRENT -- and exits 1 on any
// stale or missing file, so the ship ritual can run it as a check before it runs it as a step.
//
//   node tools/ship/packFonts.mjs            # report
//   node tools/ship/packFonts.mjs --write    # write the packs and their digests into text/fontRegistry.mjs
//
// The gate for the result is tools/ship/fontPacks-selfcheck.mjs, which repacks and compares byte for byte.
"use strict";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { parseFont } from "../../text/slugFont.js";
import { packFont, encodePack } from "../../text/slugPack.mjs";
import { FONTS, CHAR_SETS, fontPath, packPath } from "../../text/fontRegistry.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const WRITE = process.argv.includes("--write");
const sha = (b) => crypto.createHash("sha256").update(b).digest("hex");

/** Every registered pack, freshly packed: [{ family, set, path, bytes, sha256, onDisk: "current" | "stale" | "missing" }]. */
export function packAll() {
    const out = [];
    for (const f of FONTS) {
        const font = parseFont(new Uint8Array(fs.readFileSync(path.join(ENG, fontPath(f)))));
        for (const p of f.packs || []) {
            const chars = CHAR_SETS[p.set];
            if (!chars) throw new Error(`packFonts: ${f.family} asks for alphabet "${p.set}", which CHAR_SETS does not define`);
            const bytes = encodePack(packFont(font, chars, { logWidth: 12 }));
            const rel = packPath(f, p.set), abs = path.join(ENG, rel);
            const onDisk = !fs.existsSync(abs) ? "missing" : (Buffer.compare(fs.readFileSync(abs), Buffer.from(bytes)) === 0 ? "current" : "stale");
            out.push({ family: f.family, set: p.set, path: rel, bytes, sha256: sha(bytes), onDisk, recorded: p.sha256 });
        }
    }
    return out;
}

if (import.meta.url === new URL(`file://${process.argv[1]}`).href || process.argv[1].endsWith("packFonts.mjs")) {
    const packs = packAll();
    let bad = 0;
    for (const p of packs) {
        const digestOk = p.recorded === p.sha256;
        console.log(`  ${p.onDisk.padEnd(8)} ${p.path}  ${(p.bytes.length / 1024).toFixed(1)} KiB  sha ${p.sha256.slice(0, 12)}${digestOk ? "" : "  (registry says " + String(p.recorded).slice(0, 12) + ")"}`);
        if (WRITE) {
            fs.writeFileSync(path.join(ENG, p.path), p.bytes);
        } else if (p.onDisk !== "current" || !digestOk) bad++;
    }
    if (WRITE) {
        let r = fs.readFileSync(path.join(ENG, "text/fontRegistry.mjs"), "utf8");
        for (const p of packs) {
            const f = FONTS.find((x) => x.family === p.family);
            const re = new RegExp(`(family: "${f.family.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"[\\s\\S]*?packs: Object\\.freeze\\(\\[Object\\.freeze\\(\\{ set: "${p.set}", sha256: )(null|"[0-9a-f]{64}")`);
            if (!re.test(r)) throw new Error(`packFonts: could not find ${f.family}'s "${p.set}" pack record in text/fontRegistry.mjs`);
            r = r.replace(re, `$1"${p.sha256}"`);
        }
        fs.writeFileSync(path.join(ENG, "text/fontRegistry.mjs"), r);
        console.log(`[packFonts] wrote ${packs.length} pack(s) and their digests into text/fontRegistry.mjs`);
    } else {
        console.log(bad ? `[packFonts] ${bad} pack(s) stale, missing or undigested -- run with --write` : `[packFonts] ${packs.length} pack(s) current`);
        process.exit(bad ? 1 : 0);
    }
}
